// Игра «Тайная миссия» — регистрируется на namespace io.of('/mission')
const { MISSIONS } = require('../data-missions');
const { DISCONNECT_GRACE_MS, sanitizeAvatar, makeRoomCode, makePlayerId, shuffle } = require('./shared');
const party = require('./party');

function registerMissionGame(io) {
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

  function isSkippable(room) {
    return room.phase !== 'lobby' && room.phase !== 'end' && room.phase !== 'skipped';
  }

  function skipThreshold(room) {
    const connected = room.players.filter(p => p.connected).length;
    return Math.floor(connected / 2) + 1;
  }

  function broadcastSkipVotes(room) {
    io.to(room.code).emit('skip_vote_update', {
      votes: room.skipVotes.size,
      needed: skipThreshold(room),
      voterIds: Array.from(room.skipVotes)
    });
  }

  function triggerSkip(room) {
    clearRoomTimer(room);
    room.phase = 'skipped';
    room.skipVotes.clear();
    io.to(room.code).emit('game_skipped', {
      players: publicPlayers(room),
      partyStandings: party.getStandings(room.code)
    });
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
      totalMs: room.timer.totalMs
    });
    clearRoomTimer(room);
    if (room.timer.enabled) {
      room.timerHandle = setTimeout(() => {
        if (room.phase === 'discussion') beginGuessing(room, true);
      }, totalMs);
    }
  }

  function beginGuessing(room, timeUp) {
    clearRoomTimer(room);
    room.phase = 'guessing';
    room.game.guessIndex = 0;
    room.game.awaitingNext = false;
    room.game.votes = new Map();
    broadcastCurrentGuess(room, !!timeUp);
  }

  function broadcastCurrentGuess(room, timeUp) {
    const targetId = room.game.guessOrder[room.game.guessIndex];
    io.to(room.code).emit('guessing_started', {
      timeUp: !!timeUp,
      guessIndex: room.game.guessIndex,
      total: room.game.guessOrder.length,
      missionText: room.game.missionsByPlayerId[targetId],
      players: room.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar }))
    });
  }

  function finalizeGuess(room) {
    const targetId = room.game.guessOrder[room.game.guessIndex];
    const missionText = room.game.missionsByPlayerId[targetId];

    const correctGuessers = [];
    room.game.votes.forEach((guessedId, voterId) => {
      if (guessedId === targetId && voterId !== targetId) correctGuessers.push(voterId);
    });

    correctGuessers.forEach(voterId => {
      const voter = room.players.find(p => p.id === voterId);
      if (voter) voter.score += 1;
    });

    const caught = correctGuessers.length > 0;
    const owner = room.players.find(p => p.id === targetId);
    if (owner && !caught) owner.score += 2;

    room.game.awaitingNext = true;
    room.game.results.push({ ownerId: targetId, missionText, caught });

    io.to(room.code).emit('guess_result', {
      ownerId: targetId,
      ownerName: owner ? owner.name : '(вышел из комнаты)',
      ownerAvatar: owner ? owner.avatar : null,
      missionText,
      caught,
      correctGuesserNames: correctGuessers
        .map(id => room.players.find(p => p.id === id))
        .filter(Boolean)
        .map(p => p.name),
      guessIndex: room.game.guessIndex,
      total: room.game.guessOrder.length
    });
    broadcastRoom(room);
  }

  function finishGame(room) {
    room.phase = 'end';
    const partyStandings = party.recordResult(
      room.code,
      'mission',
      room.players.map(p => ({ name: p.name, avatar: p.avatar, points: p.score }))
    );
    io.to(room.code).emit('game_finished', { players: publicPlayers(room), partyStandings });
  }

  function removePlayer(room, playerId) {
    const player = room.players.find(p => p.id === playerId);
    if (player && player.disconnectTimer) clearTimeout(player.disconnectTimer);
    room.skipVotes.delete(playerId);

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
    if (room.phase === 'guessing' && room.game && room.game.votes && !room.game.awaitingNext) {
      room.game.votes.delete(playerId);
      io.to(room.code).emit('guess_vote_update', { votedCount: room.game.votes.size, total: room.players.length });
      if (room.game.votes.size >= room.players.length) {
        finalizeGuess(room);
        return;
      }
    }
    if (isSkippable(room) && room.skipVotes.size > 0 && room.skipVotes.size >= skipThreshold(room)) {
      triggerSkip(room);
      return;
    }
    broadcastRoom(room);
    if (isSkippable(room)) broadcastSkipVotes(room);
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
        settings: { timerEnabled: true, timerMinutes: 6 },
        phase: 'lobby', // lobby | missions | discussion | guessing | end | skipped
        game: null,
        readyIds: new Set(),
        timerHandle: null,
        skipVotes: new Set()
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

      if (room.game && ['missions', 'discussion', 'guessing', 'end'].includes(room.phase)) {
        const missionText = room.game.missionsByPlayerId[player.id];
        if (missionText) payload.yourMission = { missionText };
      }
      if (room.phase === 'discussion' && room.timer) {
        payload.discussion = {
          timerEnabled: room.timer.enabled,
          totalMs: room.timer.totalMs,
          paused: room.timer.paused,
          endsAt: room.timer.paused ? null : room.timer.endsAt,
          remainingMs: room.timer.paused ? room.timer.remainingMs : null
        };
      }
      if (room.phase === 'end') {
        payload.partyStandings = party.getStandings(room.code);
      }
      if (room.phase === 'skipped') {
        payload.partyStandings = party.getStandings(room.code);
      }
      if (room.phase === 'guessing') {
        const targetId = room.game.guessOrder[room.game.guessIndex];
        payload.guessing = {
          guessIndex: room.game.guessIndex,
          total: room.game.guessOrder.length,
          missionText: room.game.missionsByPlayerId[targetId],
          players: room.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar })),
          awaitingNext: room.game.awaitingNext
        };
        if (room.game.awaitingNext) {
          const lastResult = room.game.results[room.game.results.length - 1];
          if (lastResult) {
            const owner = room.players.find(p => p.id === lastResult.ownerId);
            payload.lastResult = {
              ownerId: lastResult.ownerId,
              ownerName: owner ? owner.name : '(вышел из комнаты)',
              ownerAvatar: owner ? owner.avatar : null,
              missionText: lastResult.missionText,
              caught: lastResult.caught,
              guessIndex: room.game.guessIndex,
              total: room.game.guessOrder.length
            };
          }
        }
      }

      if (isSkippable(room)) {
        payload.skipVotes = { votes: room.skipVotes.size, needed: skipThreshold(room), voterIds: Array.from(room.skipVotes) };
      }

      ack && ack(payload);
      broadcastRoom(room);
    });

    socket.on('update_settings', (settings = {}) => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'lobby') return;
      room.settings = {
        timerEnabled: !!settings.timerEnabled,
        timerMinutes: Math.min(30, Math.max(1, parseInt(settings.timerMinutes, 10) || 6))
      };
      broadcastRoom(room);
    });

    socket.on('start_game', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'lobby') return;
      if (room.players.length < 3) return;

      const missionPool = shuffle(MISSIONS).slice(0, room.players.length);
      const missionsByPlayerId = {};
      room.players.forEach((p, i) => { missionsByPlayerId[p.id] = missionPool[i]; });

      room.game = {
        missionsByPlayerId,
        guessOrder: shuffle(room.players.map(p => p.id)),
        guessIndex: -1,
        awaitingNext: false,
        votes: null,
        results: []
      };
      room.phase = 'missions';
      room.readyIds = new Set();
      room.skipVotes.clear();

      room.players.forEach(p => {
        emitToPlayer(p, 'your_mission', { missionText: missionsByPlayerId[p.id] });
      });

      broadcastRoom(room);
    });

    socket.on('player_ready', () => {
      const room = getRoom(socket);
      if (!room || room.phase !== 'missions') return;
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
      if (!room || !isHost(room, socket) || room.phase !== 'missions') return;
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
          if (room.phase === 'discussion') beginGuessing(room);
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
      beginGuessing(room);
    });

    socket.on('cast_guess', ({ guessedPlayerId } = {}) => {
      const room = getRoom(socket);
      if (!room || room.phase !== 'guessing' || room.game.awaitingNext) return;
      const player = getPlayer(room, socket);
      if (!player) return;
      if (!room.players.some(p => p.id === guessedPlayerId)) return;
      room.game.votes.set(player.id, guessedPlayerId);
      io.to(room.code).emit('guess_vote_update', { votedCount: room.game.votes.size, total: room.players.length });
      if (room.game.votes.size >= room.players.length) finalizeGuess(room);
    });

    socket.on('force_finish_guess', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'guessing' || room.game.awaitingNext) return;
      finalizeGuess(room);
    });

    socket.on('next_guess', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'guessing' || !room.game.awaitingNext) return;
      room.game.guessIndex += 1;
      if (room.game.guessIndex >= room.game.guessOrder.length) {
        finishGame(room);
        return;
      }
      room.game.awaitingNext = false;
      room.game.votes = new Map();
      broadcastCurrentGuess(room);
    });

    socket.on('play_again', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'end') return;
      room.phase = 'lobby';
      room.game = null;
      room.skipVotes.clear();
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

    socket.on('select_next_game', ({ gameKey } = {}) => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || (room.phase !== 'end' && room.phase !== 'skipped')) return;
      if (!gameKey) return;
      io.to(room.code).emit('next_game_selected', { gameKey });
    });

    socket.on('vote_skip', () => {
      const room = getRoom(socket);
      if (!room || !isSkippable(room)) return;
      const player = getPlayer(room, socket);
      if (!player) return;
      if (room.skipVotes.has(player.id)) room.skipVotes.delete(player.id);
      else room.skipVotes.add(player.id);

      if (room.skipVotes.size >= skipThreshold(room)) {
        triggerSkip(room);
      } else {
        broadcastSkipVotes(room);
      }
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
      room.skipVotes.delete(player.id);
      if (room.hostId === player.id) {
        const nextHost = room.players.find(p => p.connected);
        if (nextHost) room.hostId = nextHost.id;
      }
      if (isSkippable(room) && room.skipVotes.size > 0 && room.skipVotes.size >= skipThreshold(room)) {
        triggerSkip(room);
      } else {
        broadcastRoom(room);
        if (isSkippable(room)) broadcastSkipVotes(room);
      }
      scheduleDisconnectCleanup(room, player.id);
    });
  });

  return { hasRoom: (code) => rooms.has(code) };
}

module.exports = { registerMissionGame };
