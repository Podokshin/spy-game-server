// Игра «Крокодил» — регистрируется на namespace io.of('/crocodile')
const { WORDS } = require('../data-crocodile');
const { DISCONNECT_GRACE_MS, sanitizeAvatar, makeRoomCode, makePlayerId, shuffle } = require('./shared');

const CHOOSE_TIME_MS = 15000;
const REVEAL_AUTOADVANCE = false; // хост жмёт "следующий раунд" сам, как в остальных играх

function normalizeGuess(str) {
  return (str || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

function registerCrocodileGame(io) {
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

  function emitToPlayer(room, playerId, event, payload) {
    const player = room.players.find(p => p.id === playerId);
    if (player && player.connected) io.to(player.socketId).emit(event, payload);
  }

  function clearRoomTimer(room) {
    if (room.timerHandle) {
      clearTimeout(room.timerHandle);
      room.timerHandle = null;
    }
  }

  function pickWordChoices(room) {
    const used = room.usedWords || (room.usedWords = new Set());
    let pool = WORDS.filter(w => !used.has(w));
    if (pool.length < 3) { used.clear(); pool = WORDS.slice(); }
    return shuffle(pool).slice(0, 3);
  }

  function nextArtistId(room) {
    const connected = room.players.filter(p => p.connected);
    const pool = connected.length ? connected : room.players;
    const idx = room.artistTurnCount % pool.length;
    room.artistTurnCount += 1;
    return pool[idx].id;
  }

  // ---------- Раунды ----------

  function startRound(room) {
    clearRoomTimer(room);
    const artistId = nextArtistId(room);
    const choices = pickWordChoices(room);
    room.game = {
      artistId,
      word: null,
      choices,
      strokes: [],
      correctGuessers: [], // [{playerId, rank}]
      guessLog: [] // {playerId, name, avatar, text}
    };
    room.round += 1;
    room.phase = 'choosing';

    const artist = room.players.find(p => p.id === artistId);
    // Важен порядок: round_choosing сбрасывает экран выбора слова (в том
    // числе у самого художника — тот же сокет), а your_word_choices его
    // заполняет. Если поменять местами, round_choosing придёт вторым и
    // затрёт уже показанные варианты — художник увидит пустой экран, пока
    // не перезайдёт (тогда rejoin отдаёт choices одним пакетом без гонки).
    io.to(room.code).emit('round_choosing', {
      round: room.round,
      totalRounds: room.settings.totalRounds,
      artistId,
      artistName: artist ? artist.name : '',
      artistAvatar: artist ? artist.avatar : ''
    });
    emitToPlayer(room, artistId, 'your_word_choices', { choices, round: room.round, totalRounds: room.settings.totalRounds });
    broadcastRoom(room);

    room.timerHandle = setTimeout(() => {
      if (room.phase === 'choosing' && room.game && room.game.artistId === artistId) {
        chooseWord(room, artistId, choices[Math.floor(Math.random() * choices.length)]);
      }
    }, CHOOSE_TIME_MS);
  }

  function chooseWord(room, playerId, word) {
    const g = room.game;
    if (!g || g.artistId !== playerId || g.word) return;
    if (!g.choices.includes(word)) return;
    clearRoomTimer(room);
    g.word = word;
    room.phase = 'drawing';
    const totalMs = room.settings.roundSeconds * 1000;
    room.timer = { endsAt: Date.now() + totalMs, totalMs };

    const artist = room.players.find(p => p.id === playerId);
    io.to(room.code).emit('round_started', {
      artistId: playerId,
      artistName: artist ? artist.name : '',
      artistAvatar: artist ? artist.avatar : '',
      wordLength: word.replace(/\s/g, '').length,
      endsAt: room.timer.endsAt,
      totalMs
    });
    emitToPlayer(room, playerId, 'your_word', { word });

    room.timerHandle = setTimeout(() => endRound(room, true), totalMs);
  }

  function endRound(room, timeUp) {
    clearRoomTimer(room);
    const g = room.game;
    if (!g) return;

    const artist = room.players.find(p => p.id === g.artistId);
    if (artist && g.correctGuessers.length > 0) {
      artist.score += Math.min(5, g.correctGuessers.length * 2);
    }

    room.phase = 'reveal';
    io.to(room.code).emit('round_ended', {
      word: g.word,
      timeUp: !!timeUp,
      artistId: g.artistId,
      correctGuessers: g.correctGuessers,
      players: publicPlayers(room)
    });
    broadcastRoom(room);
  }

  function finishGame(room) {
    clearRoomTimer(room);
    room.phase = 'end';
    room.game = null;
    io.to(room.code).emit('game_finished', { players: publicPlayers(room) });
    broadcastRoom(room);
  }

  // ---------- Игроки / комнаты ----------

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
    if (room.phase === 'choosing' || room.phase === 'drawing') {
      if (room.game && room.game.artistId === playerId) {
        // Художник ушёл насовсем — раунд не спасти осмысленно, завершаем его.
        endRound(room, true);
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
        settings: { totalRounds: 6, roundSeconds: 80 },
        phase: 'lobby', // lobby | choosing | drawing | reveal | end
        game: null,
        round: 0,
        artistTurnCount: 0,
        usedWords: new Set(),
        timer: null,
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
      if (room.players.length >= 12) return ack && ack({ ok: false, error: 'Комната заполнена' });
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
      const g = room.game;

      if ((room.phase === 'choosing' || room.phase === 'drawing') && g) {
        const isArtist = g.artistId === player.id;
        payload.round = {
          phase: room.phase,
          isArtist,
          artistId: g.artistId,
          strokes: room.phase === 'drawing' ? g.strokes : [],
          correctGuessers: g.correctGuessers,
          endsAt: room.timer ? room.timer.endsAt : null,
          totalMs: room.timer ? room.timer.totalMs : null
        };
        if (isArtist) {
          payload.round.choices = g.choices;
          payload.round.word = g.word;
        } else if (g.word) {
          payload.round.wordLength = g.word.replace(/\s/g, '').length;
        }
      }
      if (room.phase === 'reveal' && g) {
        payload.reveal = { word: g.word, artistId: g.artistId, correctGuessers: g.correctGuessers };
      }

      ack && ack(payload);
      broadcastRoom(room);
    });

    socket.on('update_settings', (settings = {}) => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'lobby') return;
      room.settings = {
        totalRounds: Math.min(20, Math.max(1, parseInt(settings.totalRounds, 10) || 6)),
        roundSeconds: Math.min(180, Math.max(30, parseInt(settings.roundSeconds, 10) || 80))
      };
      broadcastRoom(room);
    });

    socket.on('start_game', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'lobby') return;
      if (room.players.length < 3) return;
      room.round = 0;
      room.artistTurnCount = 0;
      room.players.forEach(p => { p.score = 0; });
      startRound(room);
    });

    socket.on('choose_word', ({ word } = {}) => {
      const room = getRoom(socket);
      if (!room || room.phase !== 'choosing') return;
      const player = getPlayer(room, socket);
      if (!player) return;
      chooseWord(room, player.id, word);
    });

    socket.on('draw_start', (data = {}) => {
      const room = getRoom(socket);
      if (!room || room.phase !== 'drawing' || !room.game) return;
      const player = getPlayer(room, socket);
      if (!player || player.id !== room.game.artistId) return;
      const stroke = { color: String(data.color || '#f7f6fb').slice(0, 12), width: Math.min(24, Math.max(1, Number(data.width) || 4)), points: [[Number(data.x) || 0, Number(data.y) || 0]] };
      room.game.strokes.push(stroke);
      socket.to(room.code).emit('draw_start', { color: stroke.color, width: stroke.width, x: stroke.points[0][0], y: stroke.points[0][1] });
    });

    socket.on('draw_point', (data = {}) => {
      const room = getRoom(socket);
      if (!room || room.phase !== 'drawing' || !room.game) return;
      const player = getPlayer(room, socket);
      if (!player || player.id !== room.game.artistId) return;
      const stroke = room.game.strokes[room.game.strokes.length - 1];
      if (!stroke) return;
      const x = Number(data.x) || 0, y = Number(data.y) || 0;
      stroke.points.push([x, y]);
      socket.to(room.code).emit('draw_point', { x, y });
    });

    socket.on('draw_end', () => {
      const room = getRoom(socket);
      if (!room || room.phase !== 'drawing' || !room.game) return;
      const player = getPlayer(room, socket);
      if (!player || player.id !== room.game.artistId) return;
      socket.to(room.code).emit('draw_end');
    });

    socket.on('clear_canvas', () => {
      const room = getRoom(socket);
      if (!room || room.phase !== 'drawing' || !room.game) return;
      const player = getPlayer(room, socket);
      if (!player || player.id !== room.game.artistId) return;
      room.game.strokes = [];
      socket.to(room.code).emit('clear_canvas');
    });

    socket.on('undo_stroke', () => {
      const room = getRoom(socket);
      if (!room || room.phase !== 'drawing' || !room.game) return;
      const player = getPlayer(room, socket);
      if (!player || player.id !== room.game.artistId) return;
      if (room.game.strokes.length === 0) return;
      room.game.strokes.pop();
      socket.to(room.code).emit('undo_stroke');
    });

    socket.on('submit_guess', ({ text } = {}) => {
      const room = getRoom(socket);
      if (!room || room.phase !== 'drawing' || !room.game) return;
      const player = getPlayer(room, socket);
      if (!player || player.id === room.game.artistId) return;
      const raw = (text || '').trim().slice(0, 60);
      if (!raw) return;
      const g = room.game;
      if (g.correctGuessers.some(c => c.playerId === player.id)) return; // уже угадал

      if (normalizeGuess(raw) === normalizeGuess(g.word)) {
        const rank = g.correctGuessers.length + 1;
        const points = Math.max(1, 5 - (rank - 1) * 2);
        player.score += points;
        g.correctGuessers.push({ playerId: player.id, name: player.name, avatar: player.avatar, rank, points });
        io.to(room.code).emit('correct_guess', { playerId: player.id, name: player.name, avatar: player.avatar, rank, points });

        const guessersNeeded = room.players.filter(p => p.id !== g.artistId).length;
        if (g.correctGuessers.length >= guessersNeeded) {
          endRound(room, false);
        }
      } else {
        io.to(room.code).emit('guess_message', { playerId: player.id, name: player.name, avatar: player.avatar, text: raw });
      }
    });

    socket.on('next_round', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'reveal') return;
      if (room.round >= room.settings.totalRounds) {
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
      room.round = 0;
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

module.exports = { registerCrocodileGame };
