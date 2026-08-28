// Игра «Шпион» — регистрируется на namespace, переданном в io (по умолчанию — корневой "/")
const { LOCATION_CATEGORIES, CHARACTER_CATEGORIES } = require('../data');
const { DISCONNECT_GRACE_MS, sanitizeAvatar, makeRoomCode, makePlayerId, shuffle } = require('./shared');
const party = require('./party');

function registerSpyGame(io) {
  const rooms = new Map(); // code -> room

  function publicPlayers(room) {
    return room.players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isHost: p.id === room.hostId,
      score: p.score,
      connected: p.connected
    }));
  }

  function roomSummary(room) {
    return {
      code: room.code,
      players: publicPlayers(room),
      settings: room.settings,
      phase: room.phase
    };
  }

  function broadcastRoom(room) {
    io.to(room.code).emit('room_update', roomSummary(room));
  }

  function getRoom(socket) {
    const code = socket.data.roomCode;
    return code ? rooms.get(code) : null;
  }

  function getPlayer(room, socket) {
    return room.players.find(p => p.socketId === socket.id) || null;
  }

  function isHost(room, socket) {
    const player = getPlayer(room, socket);
    return !!player && player.id === room.hostId;
  }

  function emitToPlayer(player, event, payload) {
    if (player.socketId) io.to(player.socketId).emit(event, payload);
  }

  function clearRoomTimer(room) {
    if (room.timerHandle) {
      clearTimeout(room.timerHandle);
      room.timerHandle = null;
    }
  }

  function startDiscussion(room) {
    room.phase = 'discussion';
    const totalMs = room.settings.timerMinutes * 60000;
    room.timer = {
      enabled: room.settings.timerEnabled,
      endsAt: room.settings.timerEnabled ? Date.now() + totalMs : null,
      totalMs,
      paused: false,
      remainingMs: totalMs
    };
    io.to(room.code).emit('discussion_started', {
      timerEnabled: room.timer.enabled,
      endsAt: room.timer.endsAt,
      totalMs: room.timer.totalMs,
      turnOrder: room.game.turnOrder,
      category: room.game.category
    });
    clearRoomTimer(room);
    if (room.timer.enabled) {
      room.timerHandle = setTimeout(() => {
        if (room.phase === 'discussion') endDiscussion(room, true);
      }, totalMs);
    }
  }

  function endDiscussion(room, timeUp) {
    clearRoomTimer(room);
    room.phase = 'voting';
    room.votes = new Map();
    io.to(room.code).emit('voting_started', {
      timeUp,
      players: room.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar }))
    });
  }

  function finalizeVoting(room) {
    const tallyMap = new Map();
    room.players.forEach(p => tallyMap.set(p.id, 0));
    room.votes.forEach(targetId => {
      if (tallyMap.has(targetId)) tallyMap.set(targetId, tallyMap.get(targetId) + 1);
    });

    const maxVotes = Math.max(0, ...tallyMap.values());
    const spyCaughtMap = {};
    room.game.spyIds.forEach(spyId => {
      const spyVotes = tallyMap.get(spyId) || 0;
      spyCaughtMap[spyId] = maxVotes > 0 && spyVotes === maxVotes;
    });

    room.players.forEach(p => {
      const votedFor = room.votes.get(p.id);
      if (room.game.spyIds.includes(votedFor)) p.score += 1;
    });
    room.game.spyIds.forEach(spyId => {
      const spyPlayer = room.players.find(p => p.id === spyId);
      if (spyPlayer && !spyCaughtMap[spyId]) spyPlayer.score += 2;
    });

    room.game.spyCaughtMap = spyCaughtMap;
    room.phase = 'end';
    room.revealStage = 0;

    const tally = room.players
      .map(p => ({ id: p.id, name: p.name, avatar: p.avatar, votes: tallyMap.get(p.id) || 0 }))
      .sort((a, b) => b.votes - a.votes);
    room.lastTally = tally;

    io.to(room.code).emit('voting_result', { tally });
    broadcastRoom(room);
  }

  function removePlayer(room, playerId) {
    const player = room.players.find(p => p.id === playerId);
    if (player && player.disconnectTimer) clearTimeout(player.disconnectTimer);

    room.players = room.players.filter(p => p.id !== playerId);

    if (room.players.length === 0) {
      clearRoomTimer(room);
      rooms.delete(room.code);
      return;
    }
    if (room.hostId === playerId) {
      const nextHost = room.players.find(p => p.connected) || room.players[0];
      room.hostId = nextHost.id;
    }
    if (room.phase === 'voting' && room.votes) {
      room.votes.delete(playerId);
      io.to(room.code).emit('vote_update', { votedCount: room.votes.size, total: room.players.length });
      if (room.votes.size >= room.players.length) {
        finalizeVoting(room);
        return;
      }
    }
    broadcastRoom(room);
  }

  function scheduleDisconnectCleanup(room, playerId) {
    const player = room.players.find(p => p.id === playerId);
    if (!player) return;
    if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
    player.disconnectTimer = setTimeout(() => {
      const stillThere = room.players.find(p => p.id === playerId);
      if (stillThere && !stillThere.connected) removePlayer(room, playerId);
    }, DISCONNECT_GRACE_MS);
  }

  io.on('connection', (socket) => {
    socket.on('create_room', ({ name, avatar, partyCode } = {}, ack) => {
      const playerName = (name || '').trim().slice(0, 20) || 'Игрок';
      // Код "вечера игр" переиспользуется как код комнаты, чтобы один и тот
      // же код работал во всех играх подряд — если он вдруг уже занят в
      // этой конкретной игре (редкий повтор той же игры за вечер), просто
      // генерируем обычный случайный код, не давая создать комнату не выйдет.
      const wanted = (partyCode || '').toUpperCase().trim();
      const code = wanted && !rooms.has(wanted) ? wanted : makeRoomCode(rooms);
      const playerId = makePlayerId();
      const room = {
        code,
        hostId: playerId,
        players: [{ id: playerId, socketId: socket.id, name: playerName, avatar: sanitizeAvatar(avatar), score: 0, connected: true, disconnectTimer: null }],
        settings: { category: 'places', subCategory: 'mix', timerEnabled: true, timerMinutes: 8, twoSpies: false },
        phase: 'lobby', // lobby | roles | discussion | voting | end
        game: null,
        votes: null,
        lastTally: null,
        readyIds: new Set(),
        timerHandle: null
      };
      rooms.set(code, room);
      socket.join(code);
      socket.data.roomCode = code;
      ack && ack({ ok: true, ...roomSummary(room), playerId });
    });

    socket.on('join_room', ({ code, name, avatar } = {}, ack) => {
      const room = rooms.get((code || '').toUpperCase().trim());
      if (!room) return ack && ack({ ok: false, error: 'Комната не найдена' });
      if (room.phase !== 'lobby') return ack && ack({ ok: false, error: 'Игра уже началась, дождитесь следующего раунда' });
      if (room.players.length >= 20) return ack && ack({ ok: false, error: 'Комната заполнена' });
      const playerName = (name || '').trim().slice(0, 20) || 'Игрок';
      const playerId = makePlayerId();
      room.players.push({ id: playerId, socketId: socket.id, name: playerName, avatar: sanitizeAvatar(avatar), score: 0, connected: true, disconnectTimer: null });
      socket.join(room.code);
      socket.data.roomCode = room.code;
      ack && ack({ ok: true, ...roomSummary(room), playerId });
      broadcastRoom(room);
    });

    socket.on('rejoin', ({ roomCode, playerId } = {}, ack) => {
      const room = rooms.get((roomCode || '').toUpperCase().trim());
      if (!room) return ack && ack({ ok: false, error: 'Комната не найдена' });
      const player = room.players.find(p => p.id === playerId);
      if (!player) return ack && ack({ ok: false, error: 'Вы не были в этой комнате' });

      if (player.disconnectTimer) {
        clearTimeout(player.disconnectTimer);
        player.disconnectTimer = null;
      }
      player.socketId = socket.id;
      player.connected = true;
      socket.join(room.code);
      socket.data.roomCode = room.code;

      const payload = { ok: true, ...roomSummary(room), playerId: player.id };

      if (room.game && ['roles', 'discussion', 'voting', 'end'].includes(room.phase)) {
        const roleInfo = room.game.rolesByPlayerId[player.id];
        if (roleInfo) {
          payload.yourRole = {
            isSpy: roleInfo.isSpy,
            category: room.game.category,
            topicName: roleInfo.isSpy ? null : room.game.topicName,
            role: roleInfo.isSpy ? null : roleInfo.role,
            twoSpies: room.game.spyIds.length > 1
          };
        }
      }
      if (room.phase === 'discussion' && room.timer) {
        payload.discussion = {
          timerEnabled: room.timer.enabled,
          totalMs: room.timer.totalMs,
          paused: room.timer.paused,
          endsAt: room.timer.paused ? null : room.timer.endsAt,
          remainingMs: room.timer.paused ? room.timer.remainingMs : null,
          turnOrder: room.game.turnOrder,
          category: room.game.category
        };
      }
      if (room.phase === 'voting') {
        payload.voting = { players: room.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar })) };
      }
      if (room.phase === 'end') {
        payload.revealStage = room.revealStage;
        if (room.lastTally) payload.tally = room.lastTally;
        if (room.revealStage >= 1) {
          payload.spies = room.game.spyIds.map(id => {
            const sp = room.players.find(pp => pp.id === id);
            return { name: sp ? sp.name : '(вышел из комнаты)', avatar: sp ? sp.avatar : null, caught: room.game.spyCaughtMap ? room.game.spyCaughtMap[id] : null };
          });
        }
        if (room.revealStage >= 2) {
          payload.topicLabel = room.game.category === 'characters' ? 'Персонаж' : 'Локация';
          payload.topicName = room.game.topicName;
          payload.partyStandings = party.getStandings(room.code);
        }
      }

      ack && ack(payload);
      broadcastRoom(room);
    });

    socket.on('update_settings', (settings = {}) => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'lobby') return;
      room.settings = {
        category: settings.category === 'characters' ? 'characters' : 'places',
        subCategory: settings.subCategory || room.settings.subCategory,
        timerEnabled: !!settings.timerEnabled,
        timerMinutes: Math.min(30, Math.max(1, parseInt(settings.timerMinutes, 10) || 8)),
        twoSpies: !!settings.twoSpies
      };
      broadcastRoom(room);
    });

    socket.on('start_game', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'lobby') return;
      if (room.players.length < 3) return;

      const { category, subCategory, twoSpies } = room.settings;
      const spyCount = (twoSpies && room.players.length >= 6) ? 2 : 1;
      let topicName;
      let location = null;
      const rolesByPlayerId = {};
      const spyIndices = shuffle(room.players.map((_, i) => i)).slice(0, spyCount);
      const spyIds = spyIndices.map(i => room.players[i].id);

      if (category === 'characters') {
        const cat = CHARACTER_CATEGORIES.find(c => c.key === subCategory) || CHARACTER_CATEGORIES[0];
        if (!cat || cat.list.length === 0) return;
        topicName = cat.list[Math.floor(Math.random() * cat.list.length)];
        room.players.forEach(p => {
          rolesByPlayerId[p.id] = { isSpy: spyIds.includes(p.id), role: null };
        });
      } else {
        const placeCat = LOCATION_CATEGORIES.find(c => c.key === subCategory) || LOCATION_CATEGORIES[0];
        const usable = (placeCat ? placeCat.list : []).filter(l => l.roles.length > 0);
        if (usable.length === 0) return;
        location = usable[Math.floor(Math.random() * usable.length)];
        topicName = location.name;
        const nonSpyCount = room.players.length - spyCount;
        let roles = [];
        while (roles.length < nonSpyCount) roles = roles.concat(shuffle(location.roles));
        roles = roles.slice(0, nonSpyCount);
        let cursor = 0;
        room.players.forEach(p => {
          const isSpy = spyIds.includes(p.id);
          rolesByPlayerId[p.id] = { isSpy, role: isSpy ? null : roles[cursor++] };
        });
      }

      const turnOrder = shuffle(room.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar })));

      room.game = { category, subCategory, topicName, spyIds, rolesByPlayerId, turnOrder, spyCaughtMap: null };
      room.phase = 'roles';
      room.readyIds = new Set();
      room.lastTally = null;

      room.players.forEach(p => {
        const roleInfo = rolesByPlayerId[p.id];
        emitToPlayer(p, 'your_role', {
          isSpy: roleInfo.isSpy,
          category,
          topicName: roleInfo.isSpy ? null : topicName,
          role: roleInfo.isSpy ? null : roleInfo.role,
          twoSpies: spyIds.length > 1
        });
      });

      broadcastRoom(room);
    });

    socket.on('player_ready', () => {
      const room = getRoom(socket);
      if (!room || room.phase !== 'roles') return;
      const player = getPlayer(room, socket);
      if (!player) return;
      room.readyIds.add(player.id);
      io.to(room.code).emit('ready_update', { readyCount: room.readyIds.size, total: room.players.length });
      if (room.readyIds.size >= room.players.length) {
        startDiscussion(room);
      }
    });

    socket.on('force_start_discussion', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'roles') return;
      startDiscussion(room);
    });

    socket.on('toggle_pause', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'discussion' || !room.timer.enabled) return;
      if (room.timer.paused) {
        room.timer.paused = false;
        room.timer.endsAt = Date.now() + room.timer.remainingMs;
        clearRoomTimer(room);
        room.timerHandle = setTimeout(() => {
          if (room.phase === 'discussion') endDiscussion(room, true);
        }, room.timer.remainingMs);
        io.to(room.code).emit('timer_resumed', { endsAt: room.timer.endsAt });
      } else {
        room.timer.paused = true;
        room.timer.remainingMs = Math.max(0, room.timer.endsAt - Date.now());
        clearRoomTimer(room);
        io.to(room.code).emit('timer_paused', { remainingMs: room.timer.remainingMs });
      }
    });

    socket.on('end_discussion', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'discussion') return;
      endDiscussion(room, false);
    });

    socket.on('cast_vote', ({ targetId } = {}) => {
      const room = getRoom(socket);
      if (!room || room.phase !== 'voting') return;
      const player = getPlayer(room, socket);
      if (!player) return;
      if (!room.players.some(p => p.id === targetId)) return;
      room.votes.set(player.id, targetId);
      io.to(room.code).emit('vote_update', { votedCount: room.votes.size, total: room.players.length });
      if (room.votes.size >= room.players.length) finalizeVoting(room);
    });

    socket.on('force_finish_voting', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'voting') return;
      finalizeVoting(room);
    });

    socket.on('reveal_spy', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'end' || room.revealStage !== 0) return;
      room.revealStage = 1;
      const spies = room.game.spyIds.map(id => {
        const sp = room.players.find(p => p.id === id);
        return {
          name: sp ? sp.name : '(вышел из комнаты)',
          avatar: sp ? sp.avatar : null,
          caught: room.game.spyCaughtMap ? room.game.spyCaughtMap[id] : null
        };
      });
      io.to(room.code).emit('spy_revealed', { spies, category: room.game.category });
    });

    socket.on('reveal_topic', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'end' || room.revealStage !== 1) return;
      room.revealStage = 2;
      // Это последний этап раскрытия — сразу после него на экране итогов
      // появляется кнопка "Играть снова", так что именно здесь раунд
      // окончательно засчитывается в общий счёт вечера.
      const partyStandings = party.recordResult(
        room.code,
        'spy',
        room.players.map(p => ({ name: p.name, avatar: p.avatar, points: p.score }))
      );
      io.to(room.code).emit('topic_revealed', {
        topicLabel: room.game.category === 'characters' ? 'Персонаж' : 'Локация',
        topicName: room.game.topicName,
        partyStandings
      });
    });

    socket.on('select_next_game', ({ gameKey } = {}) => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'end') return;
      if (!gameKey) return;
      io.to(room.code).emit('next_game_selected', { gameKey });
    });

    socket.on('play_again', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'end') return;
      room.phase = 'lobby';
      room.game = null;
      room.lastTally = null;
      if (room.players.length === 0) {
        clearRoomTimer(room);
        rooms.delete(room.code);
        return;
      }
      if (!room.players.some(p => p.id === room.hostId)) {
        room.hostId = room.players[0].id;
      }
      broadcastRoom(room);
    });

    socket.on('leave_room', () => {
      const room = getRoom(socket);
      if (!room) return;
      const player = getPlayer(room, socket);
      socket.data.roomCode = null;
      if (player) removePlayer(room, player.id);
    });

    socket.on('disconnect', () => {
      const room = getRoom(socket);
      if (!room) return;
      const player = getPlayer(room, socket);
      if (!player) return;
      socket.data.roomCode = null;

      player.connected = false;
      player.socketId = null;
      if (room.hostId === player.id) {
        const nextHost = room.players.find(p => p.connected);
        if (nextHost) room.hostId = nextHost.id;
      }
      broadcastRoom(room);
      scheduleDisconnectCleanup(room, player.id);
    });
  });
}

module.exports = { registerSpyGame };
