// Игра «Длинные нарды» — регистрируется на namespace io.of('/nardy')
// Ровно 2 игрока в комнате. Используется движок правил из ./nardy-rules.
const R = require('./nardy-rules');
const { DISCONNECT_GRACE_MS, sanitizeAvatar, makeRoomCode, makePlayerId } = require('./shared');
const party = require('./party');

function registerNardyGame(io) {
  const rooms = new Map(); // code -> room

  function otherPlayer(room, player) {
    return room.players.find(p => p.id !== player.id) || null;
  }

  function publicPlayers(room) {
    return room.players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isHost: p.id === room.hostId,
      score: p.score,
      connected: p.connected,
      color: p.color || null
    }));
  }

  function roomSummary(room) {
    return {
      code: room.code,
      players: publicPlayers(room),
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

  function playerByColor(room, color) {
    return room.players.find(p => p.color === color) || null;
  }

  // Снимок состояния партии для конкретного адресата (без внутренних деталей движка).
  function gameStatePayload(room) {
    const g = room.game;
    return {
      board: { white: g.board.white, black: g.board.black, borneOff: g.board.borneOff },
      turnColor: g.turnColor,
      dice: g.dice,
      movesLeft: g.movesLeft,
      hasRolled: g.hasRolled,
      cube: g.cube,
      doubleOffer: g.doubleOffer,
      headMovesUsed: g.headMovesUsed,
      headMovesMax: g.headMovesMax
    };
  }

  function headState(g) {
    return { used: g.headMovesUsed, max: g.headMovesMax };
  }

  function clearDisconnectTimer(player) {
    if (player.disconnectTimer) {
      clearTimeout(player.disconnectTimer);
      player.disconnectTimer = null;
    }
  }

  function endTurnIfStuck(room) {
    const g = room.game;
    if (!g || !g.hasRolled) return;
    if (g.movesLeft.length === 0) {
      switchTurn(room);
      return;
    }
    if (!R.hasAnyLegalMove(g.board, g.turnColor, g.movesLeft, headState(g))) {
      io.to(room.code).emit('turn_stuck', { color: g.turnColor });
      switchTurn(room);
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
    room.phase = 'skipped';
    room.skipVotes.clear();
    io.to(room.code).emit('game_skipped', {
      players: publicPlayers(room),
      partyStandings: party.getStandings(room.code)
    });
  }

  function switchTurn(room) {
    const g = room.game;
    g.turnColor = R.otherColor(g.turnColor);
    g.dice = null;
    g.movesLeft = [];
    g.hasRolled = false;
    io.to(room.code).emit('turn_changed', { turnColor: g.turnColor });
    broadcastRoom(room);
  }

  function finishRound(room, winnerColor, { declined } = {}) {
    const g = room.game;
    const marsa = !declined && R.isMarsa(g.board, winnerColor);
    const points = g.cube.value * (marsa ? 2 : 1);
    const winner = playerByColor(room, winnerColor);
    if (winner) winner.score += points;

    room.phase = 'end';
    const partyStandings = party.recordResult(
      room.code,
      'nardy',
      room.players.map(p => ({ name: p.name, avatar: p.avatar, points: winner && p.id === winner.id ? points : 0 }))
    );
    room.lastResult = {
      winnerColor,
      marsa,
      declined: !!declined,
      points,
      cubeValue: g.cube.value,
      partyStandings
    };
    io.to(room.code).emit('game_finished', {
      ...room.lastResult,
      players: publicPlayers(room)
    });
    broadcastRoom(room);
  }

  // Отказ от дубля: используется и явным кликом «Отказаться», и автоматически,
  // если игрок, который должен был ответить на дубль, отключился (см. disconnect).
  function declineDouble(room) {
    const g = room.game;
    const proposerColor = g.doubleOffer.fromColor;
    g.doubleOffer = null;
    finishRound(room, proposerColor, { declined: true });
  }

  function startRound(room) {
    room.roundNumber = (room.roundNumber || 0) + 1;
    const flip = room.roundNumber % 2 === 0;
    const host = room.players.find(p => p.id === room.hostId);
    const guest = otherPlayer(room, host);
    host.color = flip ? 'black' : 'white';
    guest.color = flip ? 'white' : 'black';

    room.phase = 'playing';
    room.game = {
      board: R.createInitialBoard(),
      turnColor: Math.random() < 0.5 ? 'white' : 'black',
      dice: null,
      movesLeft: [],
      hasRolled: false,
      cube: { value: 1, ownerColor: null },
      doubleOffer: null,
      isFirstTurnOfRound: true, // «правило головы»: на первом ходу партии дубль разрешает увести с головы 2 шашки
      headMovesUsed: 0,
      headMovesMax: 1
    };

    io.to(room.code).emit('round_started', {
      players: publicPlayers(room),
      ...gameStatePayload(room)
    });
    broadcastRoom(room);
  }

  function removePlayer(room, playerId) {
    const player = room.players.find(p => p.id === playerId);
    clearDisconnectTimer(player);
    room.skipVotes.delete(playerId);

    room.players = room.players.filter(p => p.id !== playerId);

    if (room.players.length === 0) {
      rooms.delete(room.code);
      return;
    }
    if (room.hostId === playerId) {
      room.hostId = room.players[0].id;
    }
    if (room.phase === 'playing') {
      // Партнёр вышел насовсем во время партии — партию нельзя продолжить.
      room.phase = 'lobby';
      room.game = null;
      room.skipVotes.clear();
    }
    broadcastRoom(room);
  }

  function scheduleDisconnectCleanup(room, playerId) {
    const player = room.players.find(p => p.id === playerId);
    if (!player) return;
    clearDisconnectTimer(player);
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
        players: [{ id: playerId, socketId: socket.id, name: playerName, avatar: sanitizeAvatar(avatar), score: 0, connected: true, disconnectTimer: null, color: null }],
        phase: 'lobby', // lobby | playing | end | skipped
        game: null,
        roundNumber: 0,
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
      if (room.phase !== 'lobby') return ack && ack({ ok: false, error: 'Партия уже началась, дождитесь следующей' });
      if (room.players.length >= 2) return ack && ack({ ok: false, error: 'Комната заполнена — нардам нужно ровно 2 игрока' });
      const playerName = (name || '').trim().slice(0, 20) || 'Игрок';
      const playerId = makePlayerId();
      room.players.push({ id: playerId, socketId: socket.id, name: playerName, avatar: sanitizeAvatar(avatar), score: 0, connected: true, disconnectTimer: null, color: null });
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

      clearDisconnectTimer(player);
      player.socketId = socket.id;
      player.connected = true;
      socket.join(room.code);
      socket.data.roomCode = room.code;

      const payload = { ok: true, ...roomSummary(room), playerId: player.id };
      if (room.phase === 'playing' && room.game) {
        payload.playing = gameStatePayload(room);
      }
      if (room.phase === 'end' && room.lastResult) {
        payload.result = room.lastResult;
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

    socket.on('start_game', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'lobby') return;
      if (room.players.length !== 2) return;
      room.skipVotes.clear();
      startRound(room);
    });

    socket.on('roll_dice', () => {
      const room = getRoom(socket);
      if (!room || !room.game || room.phase !== 'playing') return;
      const player = getPlayer(room, socket);
      if (!player || player.color !== room.game.turnColor) return;
      const g = room.game;
      if (g.hasRolled || g.doubleOffer) return;

      const dice = R.rollDice();
      g.dice = dice;
      g.movesLeft = R.diceToMoves(dice);
      g.hasRolled = true;
      g.headMovesUsed = 0;
      // «Правило головы»: обычно с головы можно увести только одну шашку за
      // ход; исключение — самый первый ход всей партии при выпавшем дубле.
      g.headMovesMax = (g.isFirstTurnOfRound && dice[0] === dice[1]) ? 2 : 1;
      g.isFirstTurnOfRound = false;

      io.to(room.code).emit('dice_rolled', { color: g.turnColor, dice, movesLeft: g.movesLeft, headMovesUsed: g.headMovesUsed, headMovesMax: g.headMovesMax });
      broadcastRoom(room);
      endTurnIfStuck(room);
    });

    socket.on('move_checker', ({ from, die } = {}) => {
      const room = getRoom(socket);
      if (!room || !room.game || room.phase !== 'playing') return;
      const player = getPlayer(room, socket);
      if (!player || player.color !== room.game.turnColor) return;
      const g = room.game;
      if (!g.hasRolled || g.doubleOffer) return;

      const dieIdx = g.movesLeft.indexOf(die);
      if (dieIdx === -1) return;
      if (typeof from !== 'number' || from < 0 || from >= R.POINTS) return;

      const move = R.describeMove(g.board, g.turnColor, from, die, headState(g));
      if (!move.legal) return;

      const wasHeadMove = from === R.START[g.turnColor];
      R.applyMove(g.board, g.turnColor, from, die, headState(g));
      g.movesLeft.splice(dieIdx, 1);
      if (wasHeadMove) g.headMovesUsed += 1;

      io.to(room.code).emit('checker_moved', {
        color: g.turnColor,
        from,
        die,
        to: move.bearOff ? null : move.to,
        bearOff: !!move.bearOff,
        movesLeft: g.movesLeft,
        headMovesUsed: g.headMovesUsed,
        headMovesMax: g.headMovesMax,
        board: { white: g.board.white, black: g.board.black, borneOff: g.board.borneOff }
      });

      if (R.hasWon(g.board, g.turnColor)) {
        finishRound(room, g.turnColor);
        return;
      }

      endTurnIfStuck(room);
    });

    socket.on('offer_double', () => {
      const room = getRoom(socket);
      if (!room || !room.game || room.phase !== 'playing') return;
      const player = getPlayer(room, socket);
      const g = room.game;
      if (!player || player.color !== g.turnColor) return;
      if (g.hasRolled || g.doubleOffer) return;
      if (g.cube.ownerColor && g.cube.ownerColor !== player.color) return;

      g.doubleOffer = { fromColor: player.color };
      io.to(room.code).emit('double_offered', { fromColor: player.color, nextValue: g.cube.value * 2 });
      broadcastRoom(room);
    });

    socket.on('respond_double', ({ accept } = {}) => {
      const room = getRoom(socket);
      if (!room || !room.game || room.phase !== 'playing') return;
      const player = getPlayer(room, socket);
      const g = room.game;
      if (!player || !g.doubleOffer || player.color === g.doubleOffer.fromColor) return;

      if (accept) {
        g.cube.value *= 2;
        g.cube.ownerColor = player.color;
        g.doubleOffer = null;
        io.to(room.code).emit('double_accepted', { cube: g.cube });
        broadcastRoom(room);
      } else {
        declineDouble(room);
      }
    });

    socket.on('play_again', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'end') return;
      room.skipVotes.clear();
      if (room.players.length < 2) {
        room.phase = 'lobby';
        room.game = null;
        if (!room.players.some(p => p.id === room.hostId) && room.players[0]) {
          room.hostId = room.players[0].id;
        }
        broadcastRoom(room);
        return;
      }
      startRound(room);
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

      // Игрок, который должен был ответить на предложение дубля, отключился —
      // не оставляем предложившего в подвешенном состоянии на 5 минут грейс-периода.
      if (room.phase === 'playing' && room.game && room.game.doubleOffer && room.game.doubleOffer.fromColor !== player.color) {
        declineDouble(room);
      }

      player.connected = false;
      player.socketId = null;
      room.skipVotes.delete(player.id);
      // Хост мог быть тем, кто отключился — сразу передаём хост следующему
      // подключённому игроку, не дожидаясь пятиминутного грейс-периода removePlayer.
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

module.exports = { registerNardyGame };
