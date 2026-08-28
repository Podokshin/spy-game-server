// Игра «Мафия» — регистрируется на отдельном namespace io.of('/mafia')
// Роли: Мафия, Шериф, Доктор, Мирный житель. Ночь (тайные действия) -> День (обсуждение) -> Голосование -> повтор.
const { DISCONNECT_GRACE_MS, sanitizeAvatar, makeRoomCode, makePlayerId, shuffle } = require('./shared');
const party = require('./party');

const ROLE_LABELS = {
  mafia: 'Мафия',
  sheriff: 'Шериф',
  doctor: 'Доктор',
  civilian: 'Мирный житель'
};

function registerMafiaGame(io) {
  const rooms = new Map(); // code -> room

  function publicPlayers(room) {
    return room.players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isHost: p.id === room.hostId,
      connected: p.connected,
      alive: room.game ? !!room.game.aliveIds.has(p.id) : true
    }));
  }

  function roomSummary(room) {
    return {
      code: room.code,
      players: publicPlayers(room),
      settings: room.settings,
      phase: room.phase,
      round: room.game ? room.game.round : 0
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

  function isAlive(room, playerId) {
    return room.game && room.game.aliveIds.has(playerId);
  }

  function rolesRequiredThisNight(room) {
    // Роли, чьё действие ожидается в текущую ночь (только если носитель роли жив)
    const g = room.game;
    const req = [];
    if (g.mafiaIds.some(id => g.aliveIds.has(id))) req.push('mafia');
    if (g.doctorId && g.aliveIds.has(g.doctorId)) req.push('doctor');
    if (g.sheriffId && g.aliveIds.has(g.sheriffId)) req.push('sheriff');
    return req;
  }

  function nightActionsComplete(room) {
    const g = room.game;
    const required = rolesRequiredThisNight(room);
    return required.every(role => {
      if (role === 'mafia') return g.aliveIds.size === 0 || g.mafiaIds.filter(id => g.aliveIds.has(id)).every(id => g.night.mafiaVotes.has(id));
      if (role === 'doctor') return g.night.doctorTarget !== undefined;
      if (role === 'sheriff') return g.night.sheriffTarget !== undefined;
      return true;
    });
  }

  function alivePlayers(room) {
    return room.players.filter(p => room.game.aliveIds.has(p.id));
  }

  function publicPlayerBrief(p) {
    return { id: p.id, name: p.name, avatar: p.avatar };
  }

  function startNight(room) {
    const g = room.game;
    g.round += 1;
    g.night = { mafiaVotes: new Map(), doctorTarget: undefined, sheriffTarget: undefined };
    g.lastNightResult = null;
    room.phase = 'night';
    clearRoomTimer(room);

    const totalMs = room.settings.nightSeconds * 1000;
    room.timer = { endsAt: Date.now() + totalMs, totalMs };

    io.to(room.code).emit('night_started', {
      round: g.round,
      totalMs,
      endsAt: room.timer.endsAt,
      alive: alivePlayers(room).map(publicPlayerBrief)
    });

    // Приватно шлём каждой активной роли список допустимых целей
    const targets = alivePlayers(room).map(publicPlayerBrief);
    room.players.forEach(p => {
      if (!isAlive(room, p.id)) return;
      const role = g.rolesByPlayerId[p.id];
      if (role === 'mafia') {
        emitToPlayer(p, 'your_night_turn', {
          role: 'mafia',
          targets: targets.filter(t => g.rolesByPlayerId[t.id] !== 'mafia'),
          teammates: g.mafiaIds.filter(id => id !== p.id).map(id => {
            const mate = room.players.find(pp => pp.id === id);
            return mate ? publicPlayerBrief(mate) : null;
          }).filter(Boolean)
        });
      } else if (role === 'doctor') {
        emitToPlayer(p, 'your_night_turn', { role: 'doctor', targets });
      } else if (role === 'sheriff') {
        emitToPlayer(p, 'your_night_turn', { role: 'sheriff', targets: targets.filter(t => t.id !== p.id) });
      }
    });

    room.timerHandle = setTimeout(() => {
      if (room.phase === 'night') resolveNight(room);
    }, totalMs);
  }

  function resolveNight(room) {
    clearRoomTimer(room);
    const g = room.game;

    // Итог голосования мафии: цель с наибольшим числом голосов, ничья решается случайно
    let killedId = null;
    if (g.night.mafiaVotes.size > 0) {
      const tally = new Map();
      g.night.mafiaVotes.forEach(targetId => tally.set(targetId, (tally.get(targetId) || 0) + 1));
      const maxVotes = Math.max(...tally.values());
      const top = shuffle([...tally.entries()].filter(([, v]) => v === maxVotes).map(([id]) => id));
      killedId = top[0] || null;
    }

    const saved = killedId && g.night.doctorTarget === killedId;
    if (killedId && !saved) {
      g.aliveIds.delete(killedId);
    }

    g.lastNightResult = { killedId: saved ? null : killedId, saved: !!saved };
    g.night.resolved = true;

    const winner = checkWin(room);
    if (winner) return; // checkWin уже перевёл комнату в фазу 'end'

    startDay(room);
  }

  function startDay(room) {
    const g = room.game;
    room.phase = 'day';
    clearRoomTimer(room);
    const totalMs = room.settings.discussionSeconds * 1000;
    room.timer = { endsAt: Date.now() + totalMs, totalMs };

    const victim = g.lastNightResult && g.lastNightResult.killedId
      ? room.players.find(p => p.id === g.lastNightResult.killedId)
      : null;

    io.to(room.code).emit('day_started', {
      round: g.round,
      totalMs,
      endsAt: room.timer.endsAt,
      victim: victim ? { ...publicPlayerBrief(victim), role: ROLE_LABELS[g.rolesByPlayerId[victim.id]] } : null,
      alive: alivePlayers(room).map(publicPlayerBrief)
    });

    room.timerHandle = setTimeout(() => {
      if (room.phase === 'day') startVoting(room);
    }, totalMs);
  }

  function startVoting(room) {
    clearRoomTimer(room);
    room.phase = 'voting';
    room.game.votes = new Map();
    io.to(room.code).emit('voting_started', { alive: alivePlayers(room).map(publicPlayerBrief) });
  }

  function finalizeVoting(room) {
    const g = room.game;
    const tally = new Map();
    alivePlayers(room).forEach(p => tally.set(p.id, 0));
    g.votes.forEach(targetId => {
      if (targetId && tally.has(targetId)) tally.set(targetId, tally.get(targetId) + 1);
    });

    const maxVotes = Math.max(0, ...tally.values());
    const top = maxVotes > 0 ? [...tally.entries()].filter(([, v]) => v === maxVotes).map(([id]) => id) : [];
    const eliminatedId = top.length === 1 ? top[0] : null; // ничья = никто не выбывает

    let eliminatedPlayer = null;
    if (eliminatedId) {
      g.aliveIds.delete(eliminatedId);
      eliminatedPlayer = room.players.find(p => p.id === eliminatedId);
    }

    const tallyOut = [...tally.entries()].map(([id, votes]) => {
      const p = room.players.find(pp => pp.id === id);
      return { id, name: p ? p.name : '(вышел)', avatar: p ? p.avatar : null, votes };
    }).sort((a, b) => b.votes - a.votes);

    io.to(room.code).emit('voting_result', {
      eliminated: eliminatedPlayer ? { ...publicPlayerBrief(eliminatedPlayer), role: ROLE_LABELS[g.rolesByPlayerId[eliminatedPlayer.id]] } : null,
      tally: tallyOut
    });
    broadcastRoom(room);

    const winner = checkWin(room);
    if (winner) return;

    startNight(room);
  }

  function checkWin(room) {
    const g = room.game;
    const mafiaAlive = g.mafiaIds.filter(id => g.aliveIds.has(id)).length;
    const totalAlive = g.aliveIds.size;
    const othersAlive = totalAlive - mafiaAlive;

    let winner = null;
    if (mafiaAlive === 0) winner = 'civilians';
    else if (mafiaAlive >= othersAlive) winner = 'mafia';

    if (!winner) return null;

    clearRoomTimer(room);
    room.phase = 'end';
    g.winner = winner;

    // Начисление очков "вечера игр": роль победившей фракции — 3 очка
    // (даже если носитель роли погиб по ходу партии, победа фракции всё
    // равно засчитывается всем её членам), проигравшая фракция — 1 очко
    // за участие. Мафия — единственная "мафия-выровненная" роль; шериф,
    // доктор и мирный житель выровнены с городом.
    const contributions = room.players.map(p => {
      const role = g.rolesByPlayerId[p.id];
      const isMafiaAligned = role === 'mafia';
      const onWinningSide = winner === 'mafia' ? isMafiaAligned : !isMafiaAligned;
      return { name: p.name, avatar: p.avatar, points: onWinningSide ? 3 : 1 };
    });
    const partyStandings = party.recordResult(room.code, 'mafia', contributions);

    io.to(room.code).emit('game_over', {
      winner,
      roles: room.players.map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        role: ROLE_LABELS[g.rolesByPlayerId[p.id]] || null,
        alive: g.aliveIds.has(p.id)
      })),
      partyStandings
    });
    broadcastRoom(room);
    return winner;
  }

  function removePlayer(room, playerId) {
    const player = room.players.find(p => p.id === playerId);
    if (player && player.disconnectTimer) clearTimeout(player.disconnectTimer);
    room.skipVotes.delete(playerId);

    room.players = room.players.filter(p => p.id !== playerId);
    if (room.game) room.game.aliveIds.delete(playerId);

    if (room.players.length === 0) {
      clearRoomTimer(room);
      rooms.delete(room.code);
      return;
    }
    if (room.hostId === playerId) {
      const nextHost = room.players.find(p => p.connected) || room.players[0];
      room.hostId = nextHost.id;
    }
    if (room.phase === 'voting' && room.game && room.game.votes) {
      room.game.votes.delete(playerId);
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
        players: [{ id: playerId, socketId: socket.id, name: playerName, avatar: sanitizeAvatar(avatar), connected: true, disconnectTimer: null }],
        settings: { nightSeconds: 45, discussionSeconds: 90 },
        phase: 'lobby', // lobby | night | day | voting | end | skipped
        game: null,
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
      room.players.push({ id: playerId, socketId: socket.id, name: playerName, avatar: sanitizeAvatar(avatar), connected: true, disconnectTimer: null });
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
      const g = room.game;
      if (g) {
        payload.yourRole = { role: g.rolesByPlayerId[player.id] || null, label: ROLE_LABELS[g.rolesByPlayerId[player.id]] || null };
        if (g.rolesByPlayerId[player.id] === 'mafia') {
          payload.yourRole.teammates = g.mafiaIds.filter(id => id !== player.id).map(id => {
            const mate = room.players.find(pp => pp.id === id);
            return mate ? publicPlayerBrief(mate) : null;
          }).filter(Boolean);
        }
        if (room.phase === 'night') {
          payload.night = { round: g.round, totalMs: room.timer.totalMs, endsAt: room.timer.endsAt, alive: alivePlayers(room).map(publicPlayerBrief) };
        } else if (room.phase === 'day') {
          const victim = g.lastNightResult && g.lastNightResult.killedId ? room.players.find(p => p.id === g.lastNightResult.killedId) : null;
          payload.day = {
            round: g.round, totalMs: room.timer.totalMs, endsAt: room.timer.endsAt,
            victim: victim ? { ...publicPlayerBrief(victim), role: ROLE_LABELS[g.rolesByPlayerId[victim.id]] } : null,
            alive: alivePlayers(room).map(publicPlayerBrief)
          };
        } else if (room.phase === 'voting') {
          payload.voting = { alive: alivePlayers(room).map(publicPlayerBrief) };
        } else if (room.phase === 'end') {
          payload.gameOver = {
            winner: g.winner,
            roles: room.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, role: ROLE_LABELS[g.rolesByPlayerId[p.id]] || null, alive: g.aliveIds.has(p.id) })),
            partyStandings: party.getStandings(room.code)
          };
        }
      }
      if (room.phase === 'skipped') {
        payload.skipped = { players: publicPlayers(room), partyStandings: party.getStandings(room.code) };
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
        nightSeconds: Math.min(120, Math.max(15, parseInt(settings.nightSeconds, 10) || 45)),
        discussionSeconds: Math.min(300, Math.max(30, parseInt(settings.discussionSeconds, 10) || 90))
      };
      broadcastRoom(room);
    });

    socket.on('start_game', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'lobby') return;
      if (room.players.length < 4) return;

      room.skipVotes.clear();
      const n = room.players.length;
      const mafiaCount = Math.max(1, Math.floor(n / 4));
      const shuffledIds = shuffle(room.players.map(p => p.id));
      const mafiaIds = shuffledIds.slice(0, mafiaCount);
      let cursor = mafiaCount;
      const sheriffId = n >= 5 ? shuffledIds[cursor++] : null;
      const doctorId = n >= 6 ? shuffledIds[cursor++] : null;

      const rolesByPlayerId = {};
      room.players.forEach(p => {
        if (mafiaIds.includes(p.id)) rolesByPlayerId[p.id] = 'mafia';
        else if (p.id === sheriffId) rolesByPlayerId[p.id] = 'sheriff';
        else if (p.id === doctorId) rolesByPlayerId[p.id] = 'doctor';
        else rolesByPlayerId[p.id] = 'civilian';
      });

      room.game = {
        rolesByPlayerId,
        mafiaIds,
        sheriffId,
        doctorId,
        aliveIds: new Set(room.players.map(p => p.id)),
        round: 0,
        night: null,
        votes: null,
        lastNightResult: null,
        winner: null
      };

      room.players.forEach(p => {
        const role = rolesByPlayerId[p.id];
        const payload = { role, label: ROLE_LABELS[role] };
        if (role === 'mafia') {
          payload.teammates = mafiaIds.filter(id => id !== p.id).map(id => {
            const mate = room.players.find(pp => pp.id === id);
            return mate ? publicPlayerBrief(mate) : null;
          }).filter(Boolean);
        }
        emitToPlayer(p, 'your_role', payload);
      });

      broadcastRoom(room);
      startNight(room);
    });

    socket.on('mafia_vote', ({ targetId } = {}) => {
      const room = getRoom(socket);
      if (!room || !room.game || room.phase !== 'night') return;
      const player = getPlayer(room, socket);
      if (!player || room.game.rolesByPlayerId[player.id] !== 'mafia' || !isAlive(room, player.id)) return;
      if (!isAlive(room, targetId) || room.game.rolesByPlayerId[targetId] === 'mafia') return;
      room.game.night.mafiaVotes.set(player.id, targetId);
      if (nightActionsComplete(room)) resolveNight(room);
    });

    socket.on('doctor_save', ({ targetId } = {}) => {
      const room = getRoom(socket);
      if (!room || !room.game || room.phase !== 'night') return;
      const player = getPlayer(room, socket);
      if (!player || room.game.rolesByPlayerId[player.id] !== 'doctor' || !isAlive(room, player.id)) return;
      if (!isAlive(room, targetId)) return;
      room.game.night.doctorTarget = targetId;
      if (nightActionsComplete(room)) resolveNight(room);
    });

    socket.on('sheriff_check', ({ targetId } = {}, ack) => {
      const room = getRoom(socket);
      if (!room || !room.game || room.phase !== 'night') return;
      const player = getPlayer(room, socket);
      if (!player || room.game.rolesByPlayerId[player.id] !== 'sheriff' || !isAlive(room, player.id)) return;
      if (!isAlive(room, targetId) || targetId === player.id) return;
      if (room.game.night.sheriffTarget !== undefined) return ack && ack({ ok: false, error: 'Проверка уже выполнена этой ночью' });
      room.game.night.sheriffTarget = targetId;
      const isMafia = room.game.rolesByPlayerId[targetId] === 'mafia';
      ack && ack({ ok: true, targetId, isMafia });
      if (nightActionsComplete(room)) resolveNight(room);
    });

    // Аварийные кнопки хоста — если носитель уникальной роли (мафия/шериф/доктор)
    // отключился в решающий момент и раунд иначе не может продолжиться.
    socket.on('force_end_night', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'night') return;
      resolveNight(room);
    });

    socket.on('force_end_discussion', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'day') return;
      startVoting(room);
    });

    socket.on('force_finish_voting', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'voting') return;
      finalizeVoting(room);
    });

    socket.on('cast_vote', ({ targetId } = {}) => {
      const room = getRoom(socket);
      if (!room || !room.game || room.phase !== 'voting') return;
      const player = getPlayer(room, socket);
      if (!player || !isAlive(room, player.id)) return;
      if (targetId !== null && !isAlive(room, targetId)) return;
      room.game.votes.set(player.id, targetId);
      io.to(room.code).emit('vote_update', { votedCount: room.game.votes.size, total: alivePlayers(room).length });
      if (room.game.votes.size >= alivePlayers(room).length) finalizeVoting(room);
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
}

module.exports = { registerMafiaGame };
