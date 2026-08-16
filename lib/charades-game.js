// Игра «Эмоджи-шарады» — регистрируется на namespace io.of('/charades')
const { PROMPTS } = require('../data-charades');
const { DISCONNECT_GRACE_MS, sanitizeAvatar, makeRoomCode, makePlayerId, shuffle } = require('./shared');

const ROUND_MS = 60 * 1000; // фиксированное время на угадывание

function registerCharadesGame(io) {
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
    if (player && player.socketId) io.to(player.socketId).emit(event, payload);
  }

  function clearRoomTimer(room) {
    if (room.timerHandle) {
      clearTimeout(room.timerHandle);
      room.timerHandle = null;
    }
  }

  function currentEncoderId(room) {
    if (!room.game) return null;
    return room.game.order[room.game.turnIndex];
  }

  function pickPrompt(room) {
    const poolSize = PROMPTS.length;
    if (room.game.usedPromptIndices.length >= poolSize) {
      room.game.usedPromptIndices = [];
    }
    let idx;
    do {
      idx = Math.floor(Math.random() * poolSize);
    } while (room.game.usedPromptIndices.includes(idx));
    room.game.usedPromptIndices.push(idx);
    return PROMPTS[idx];
  }

  function startEncodingTurn(room) {
    clearRoomTimer(room);
    room.game.turnIndex += 1;
    // Пропускаем игроков, которые полностью покинули комнату (их id остался в order)
    while (
      room.game.turnIndex < room.game.order.length &&
      !room.players.some(p => p.id === room.game.order[room.game.turnIndex])
    ) {
      room.game.turnIndex += 1;
    }

    if (room.game.turnIndex >= room.game.order.length) {
      finishGame(room);
      return;
    }

    const encoderId = room.game.order[room.game.turnIndex];
    const encoder = room.players.find(p => p.id === encoderId);

    room.game.prompt = pickPrompt(room);
    room.game.emojiClue = null;
    room.game.timer = null;
    room.phase = 'encoding';

    broadcastRoom(room);
    emitToPlayer(encoder, 'your_prompt', {
      prompt: room.game.prompt,
      turnIndex: room.game.turnIndex,
      total: room.game.order.length
    });
    io.to(room.code).emit('encoding_started', {
      encoderId,
      encoderName: encoder.name,
      encoderAvatar: encoder.avatar,
      turnIndex: room.game.turnIndex,
      total: room.game.order.length
    });
  }

  function finishGame(room) {
    clearRoomTimer(room);
    room.phase = 'end';
    io.to(room.code).emit('game_finished', { players: publicPlayers(room) });
  }

  function removePlayer(room, playerId) {
    const player = room.players.find(p => p.id === playerId);
    if (player && player.disconnectTimer) clearTimeout(player.disconnectTimer);

    const wasCurrentEncoder =
      room.game &&
      (room.phase === 'encoding' || room.phase === 'guessing') &&
      currentEncoderId(room) === playerId;

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

    if (wasCurrentEncoder) {
      // Кодировщик покинул комнату насовсем — раунд пропускается, ход переходит дальше
      startEncodingTurn(room);
      return;
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
        settings: {},
        phase: 'lobby', // lobby | encoding | guessing | result | end
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
      if (room.phase !== 'lobby') return ack && ack({ ok: false, error: 'Игра уже началась, дождитесь следующей игры' });
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

      if (room.game && ['encoding', 'guessing', 'result', 'end'].includes(room.phase)) {
        const encoderId = currentEncoderId(room);
        const encoder = room.players.find(p => p.id === encoderId);

        if (room.phase === 'encoding') {
          payload.encoding = {
            encoderId,
            encoderName: encoder ? encoder.name : null,
            encoderAvatar: encoder ? encoder.avatar : null,
            turnIndex: room.game.turnIndex,
            total: room.game.order.length
          };
          if (player.id === encoderId) {
            payload.yourPrompt = {
              prompt: room.game.prompt,
              turnIndex: room.game.turnIndex,
              total: room.game.order.length
            };
          }
        } else if (room.phase === 'guessing') {
          payload.guessing = {
            emoji: room.game.emojiClue,
            encoderId,
            encoderName: encoder ? encoder.name : null,
            encoderAvatar: encoder ? encoder.avatar : null,
            endsAt: room.game.timer ? room.game.timer.endsAt : null,
            totalMs: room.game.timer ? room.game.timer.totalMs : null,
            turnIndex: room.game.turnIndex,
            total: room.game.order.length
          };
        } else if (room.phase === 'result') {
          const lastResult = room.game.results[room.game.results.length - 1];
          if (lastResult) {
            const rEncoder = room.players.find(p => p.id === lastResult.encoderId);
            const rGuesser = lastResult.guesserId ? room.players.find(p => p.id === lastResult.guesserId) : null;
            payload.lastResult = {
              encoderId: lastResult.encoderId,
              encoderName: rEncoder ? rEncoder.name : '(вышел из комнаты)',
              encoderAvatar: rEncoder ? rEncoder.avatar : null,
              prompt: lastResult.prompt,
              emoji: lastResult.emoji,
              guesserId: lastResult.guesserId,
              guesserName: rGuesser ? rGuesser.name : null,
              pts: lastResult.pts,
              encoderPts: lastResult.guesserId ? 1 : 0,
              turnIndex: room.game.turnIndex,
              total: room.game.order.length
            };
          }
        } else if (room.phase === 'end') {
          payload.players = publicPlayers(room);
        }
      }

      ack && ack(payload);
      broadcastRoom(room);
    });

    socket.on('start_game', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'lobby') return;
      if (room.players.length < 3) return;

      room.game = {
        order: shuffle(room.players.map(p => p.id)),
        turnIndex: -1,
        usedPromptIndices: [],
        prompt: null,
        emojiClue: null,
        timer: null,
        results: []
      };

      startEncodingTurn(room);
    });

    socket.on('submit_emoji', ({ emoji } = {}) => {
      const room = getRoom(socket);
      if (!room || !room.game || room.phase !== 'encoding') return;
      const player = getPlayer(room, socket);
      if (!player || player.id !== currentEncoderId(room)) return;

      const clue = (emoji || '').trim().slice(0, 60);
      if (!clue) return;

      room.game.emojiClue = clue;
      room.phase = 'guessing';

      const totalMs = ROUND_MS;
      const endsAt = Date.now() + totalMs;
      room.game.timer = { endsAt, totalMs };

      clearRoomTimer(room);
      room.timerHandle = setTimeout(() => {
        if (room.phase === 'guessing') {
          io.to(room.code).emit('time_up', {});
        }
      }, totalMs);

      const encoderId = currentEncoderId(room);
      io.to(room.code).emit('guessing_started', {
        emoji: clue,
        encoderId,
        endsAt,
        totalMs,
        turnIndex: room.game.turnIndex,
        total: room.game.order.length
      });
      broadcastRoom(room);
    });

    socket.on('award_point', ({ guesserId } = {}) => {
      const room = getRoom(socket);
      if (!room || !room.game || room.phase !== 'guessing') return;
      const player = getPlayer(room, socket);
      if (!player) return;

      const encoderId = currentEncoderId(room);
      const isEncoder = player.id === encoderId;
      const isHostFallback = player.id === room.hostId;
      if (!isEncoder && !isHostFallback) return;

      let guesser = null;
      if (guesserId) {
        guesser = room.players.find(p => p.id === guesserId) || null;
        if (!guesser || guesser.id === encoderId) return;
      }

      clearRoomTimer(room);

      const encoder = room.players.find(p => p.id === encoderId);
      if (guesser) {
        guesser.score += 2;
        if (encoder) encoder.score += 1;
      }

      room.game.results.push({
        encoderId,
        prompt: room.game.prompt,
        emoji: room.game.emojiClue,
        guesserId: guesser ? guesser.id : null,
        pts: guesser ? 2 : 0
      });
      room.phase = 'result';

      io.to(room.code).emit('round_result', {
        encoderId,
        encoderName: encoder ? encoder.name : '(вышел из комнаты)',
        encoderAvatar: encoder ? encoder.avatar : null,
        prompt: room.game.prompt,
        emoji: room.game.emojiClue,
        guesserId: guesser ? guesser.id : null,
        guesserName: guesser ? guesser.name : null,
        pts: guesser ? 2 : 0,
        encoderPts: guesser ? 1 : 0,
        turnIndex: room.game.turnIndex,
        total: room.game.order.length
      });
      broadcastRoom(room);
    });

    socket.on('next_round', () => {
      const room = getRoom(socket);
      if (!room || !room.game || !isHost(room, socket) || room.phase !== 'result') return;
      startEncodingTurn(room);
    });

    // Аварийный переход хода, если кодировщик недоступен, но ещё формально в комнате
    // (например, только что отключился и ждёт grace-периода)
    socket.on('force_skip_turn', () => {
      const room = getRoom(socket);
      if (!room || !room.game || !isHost(room, socket)) return;
      if (room.phase !== 'encoding' && room.phase !== 'guessing') return;
      startEncodingTurn(room);
    });

    socket.on('play_again', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'end') return;
      room.phase = 'lobby';
      room.game = null;
      room.players = room.players.filter(p => p.connected);
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

      if (room.phase === 'lobby') {
        removePlayer(room, player.id);
        return;
      }

      player.connected = false;
      player.socketId = null;
      broadcastRoom(room);
      scheduleDisconnectCleanup(room, player.id);
    });
  });
}

module.exports = { registerCharadesGame };
