// Игра «Категории на скорость» — регистрируется на namespace io.of('/categories')
const { CATEGORIES, LETTERS } = require('../data-categories');
const { DISCONNECT_GRACE_MS, sanitizeAvatar, makeRoomCode, makePlayerId, shuffle } = require('./shared');

function normalizeLetterChar(ch) {
  if (!ch) return '';
  let c = ch.toLowerCase();
  if (c === 'ё') c = 'е';
  return c;
}

function normalizeAnswer(str) {
  return (str || '').trim().toLowerCase();
}

function registerCategoriesGame(io) {
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

  function clearRoomTimer(room) {
    if (room.timerHandle) {
      clearTimeout(room.timerHandle);
      room.timerHandle = null;
    }
  }

  function startRound(room) {
    clearRoomTimer(room);
    room.game.round += 1;
    const letterOrder = room.game.letterOrder;
    const letter = letterOrder[(room.game.round - 1) % letterOrder.length];
    const categories = shuffle(CATEGORIES).slice(0, 5);

    room.game.letter = letter;
    room.game.categories = categories;
    room.game.answersByPlayerId = {};
    room.game.submittedIds = new Set();
    room.phase = 'writing';

    const totalMs = room.game.roundSeconds * 1000;
    room.game.endsAt = Date.now() + totalMs;
    room.game.totalMs = totalMs;

    io.to(room.code).emit('round_started', {
      round: room.game.round,
      totalRounds: room.game.totalRounds,
      letter,
      categories,
      endsAt: room.game.endsAt,
      totalMs
    });
    broadcastRoom(room);

    room.timerHandle = setTimeout(() => {
      if (room.phase === 'writing') finalizeRound(room, true);
    }, totalMs);
  }

  function finalizeRound(room, timeUp) {
    clearRoomTimer(room);
    room.phase = 'results';

    const letter = room.game.letter;
    const categories = room.game.categories;

    const resultsByCategory = categories.map((category, idx) => {
      const computed = room.players.map(p => {
        const stored = room.game.answersByPlayerId[p.id] || ['', '', '', '', ''];
        const raw = stored[idx] || '';
        const norm = normalizeAnswer(raw);
        const startsRight = norm.length > 0 && normalizeLetterChar(norm[0]) === normalizeLetterChar(letter);
        const valid = norm.length > 0 && startsRight;
        return { playerId: p.id, name: p.name, avatar: p.avatar, raw, norm, valid };
      });

      const counts = new Map();
      computed.forEach(e => {
        if (e.valid) counts.set(e.norm, (counts.get(e.norm) || 0) + 1);
      });

      const entries = computed.map(e => {
        let points = 0;
        if (e.valid) points = counts.get(e.norm) === 1 ? 2 : 1;
        return { playerId: e.playerId, name: e.name, avatar: e.avatar, answer: e.raw, valid: e.valid, points };
      });

      return { category, entries };
    });

    resultsByCategory.forEach(cat => {
      cat.entries.forEach(entry => {
        const player = room.players.find(p => p.id === entry.playerId);
        if (player) player.score += entry.points;
      });
    });

    room.game.history.push({ round: room.game.round, letter, categories, resultsByCategory });

    io.to(room.code).emit('round_result', {
      round: room.game.round,
      totalRounds: room.game.totalRounds,
      letter,
      resultsByCategory,
      players: publicPlayers(room),
      timeUp: !!timeUp
    });
    broadcastRoom(room);
  }

  function finishGame(room) {
    clearRoomTimer(room);
    room.phase = 'end';
    io.to(room.code).emit('game_finished', { players: publicPlayers(room) });
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
    if (room.phase === 'writing' && room.game && room.game.submittedIds) {
      room.game.submittedIds.delete(playerId);
      delete room.game.answersByPlayerId[playerId];
      io.to(room.code).emit('submit_progress', { submittedCount: room.game.submittedIds.size, total: room.players.length });
      if (room.game.submittedIds.size >= room.players.length) {
        finalizeRound(room, false);
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
    socket.on('create_room', ({ name, avatar } = {}, ack) => {
      const playerName = (name || '').trim().slice(0, 20) || 'Игрок';
      const code = makeRoomCode(rooms);
      const playerId = makePlayerId();
      const room = {
        code,
        hostId: playerId,
        players: [{ id: playerId, socketId: socket.id, name: playerName, avatar: sanitizeAvatar(avatar), score: 0, connected: true, disconnectTimer: null }],
        settings: { totalRounds: 5, roundSeconds: 60 },
        phase: 'lobby', // lobby | writing | results | end
        game: null,
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
      if (room.phase !== 'lobby') return ack && ack({ ok: false, error: 'Игра уже началась, дождитесь новой игры' });
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

      if (room.phase === 'writing' && room.game) {
        payload.writing = {
          round: room.game.round,
          totalRounds: room.game.totalRounds,
          letter: room.game.letter,
          categories: room.game.categories,
          endsAt: room.game.endsAt,
          totalMs: room.game.totalMs,
          submitted: room.game.submittedIds.has(player.id),
          submittedCount: room.game.submittedIds.size,
          total: room.players.length,
          yourAnswers: room.game.answersByPlayerId[player.id] || null
        };
      } else if (room.phase === 'results' && room.game) {
        const last = room.game.history[room.game.history.length - 1];
        if (last) {
          payload.results = {
            round: last.round,
            totalRounds: room.game.totalRounds,
            letter: last.letter,
            resultsByCategory: last.resultsByCategory,
            players: publicPlayers(room),
            timeUp: false
          };
        }
      } else if (room.phase === 'end') {
        payload.ended = { players: publicPlayers(room) };
      }

      ack && ack(payload);
      broadcastRoom(room);
    });

    socket.on('update_settings', (settings = {}) => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'lobby') return;
      room.settings = {
        totalRounds: Math.min(10, Math.max(1, parseInt(settings.totalRounds, 10) || 5)),
        roundSeconds: Math.min(120, Math.max(20, parseInt(settings.roundSeconds, 10) || 60))
      };
      broadcastRoom(room);
    });

    socket.on('start_game', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'lobby') return;
      if (room.players.length < 2) return;

      room.game = {
        round: 0,
        totalRounds: room.settings.totalRounds,
        roundSeconds: room.settings.roundSeconds,
        letterOrder: shuffle(LETTERS),
        letter: null,
        categories: [],
        answersByPlayerId: {},
        submittedIds: new Set(),
        history: []
      };
      startRound(room);
    });

    socket.on('submit_answers', ({ answers } = {}) => {
      const room = getRoom(socket);
      if (!room || room.phase !== 'writing') return;
      const player = getPlayer(room, socket);
      if (!player) return;

      const categories = room.game.categories || [];
      const arr = Array.isArray(answers) ? answers : [];
      const cleaned = categories.map((_, i) => {
        const raw = arr[i];
        return (typeof raw === 'string' ? raw : '').trim().slice(0, 30);
      });

      room.game.answersByPlayerId[player.id] = cleaned;
      room.game.submittedIds.add(player.id);
      io.to(room.code).emit('submit_progress', { submittedCount: room.game.submittedIds.size, total: room.players.length });

      if (room.game.submittedIds.size >= room.players.length) {
        finalizeRound(room, false);
      }
    });

    socket.on('force_finalize_round', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'writing') return;
      finalizeRound(room, true);
    });

    socket.on('next_round', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'results') return;
      if (room.game.round >= room.game.totalRounds) {
        finishGame(room);
      } else {
        startRound(room);
      }
    });

    socket.on('play_again', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'end') return;
      room.phase = 'lobby';
      room.game = null;
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

module.exports = { registerCategoriesGame };
