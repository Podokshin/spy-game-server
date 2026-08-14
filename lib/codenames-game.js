// Игра «Кодовые имена» — регистрируется на отдельном namespace
const { WORDS } = require('../data-codenames');
const { DISCONNECT_GRACE_MS, sanitizeAvatar, makeRoomCode, makePlayerId, shuffle } = require('./shared');

const OTHER_TEAM = { red: 'blue', blue: 'red' };

function registerCodenamesGame(io) {
  const rooms = new Map(); // code -> room

  function publicPlayers(room) {
    return room.players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isHost: p.id === room.hostId,
      team: p.team,
      role: p.role,
      connected: p.connected
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

  function emitToPlayer(player, event, payload) {
    if (player.socketId) io.to(player.socketId).emit(event, payload);
  }

  function publicCard(card) {
    return { word: card.word, revealed: card.revealed, color: card.revealed ? card.color : null };
  }

  function publicBoard(room) {
    return room.game.board.map(publicCard);
  }

  function colorKey(room) {
    return room.game.board.map(c => c.color);
  }

  function gameStateFor(room) {
    const g = room.game;
    return {
      board: publicBoard(room),
      currentTeam: g.currentTeam,
      startingTeam: g.startingTeam,
      remainingCounts: g.remainingCounts,
      currentClue: g.currentClue,
      guessesLeft: g.guessesLeft,
      clueHistory: g.clueHistory,
      winner: g.winner,
      winReason: g.winReason
    };
  }

  function broadcastGameState(room) {
    io.to(room.code).emit('game_state', gameStateFor(room));
  }

  function sendColorKeyToSpymasters(room) {
    const key = colorKey(room);
    room.players.forEach(p => {
      if (p.role === 'spymaster') emitToPlayer(p, 'color_key', { colors: key });
    });
  }

  function teamValid(room, team) {
    const members = room.players.filter(p => p.team === team);
    return members.length >= 2 && members.some(p => p.role === 'spymaster');
  }

  function canStart(room) {
    return teamValid(room, 'red') && teamValid(room, 'blue');
  }

  function checkWin(room, team, reason) {
    room.game.winner = team;
    room.game.winReason = reason;
    room.phase = 'end';
    // Раскрываем всю доску всем игрокам
    room.game.board.forEach(c => { c.revealed = true; });
    broadcastGameState(room);
  }

  function switchTurn(room) {
    room.game.currentTeam = OTHER_TEAM[room.game.currentTeam];
    room.game.currentClue = null;
    room.game.guessesLeft = 0;
    room.phase = 'clue';
  }

  function removePlayer(room, playerId) {
    const player = room.players.find(p => p.id === playerId);
    if (player && player.disconnectTimer) clearTimeout(player.disconnectTimer);

    room.players = room.players.filter(p => p.id !== playerId);

    if (room.players.length === 0) {
      rooms.delete(room.code);
      return;
    }
    if (room.hostId === playerId) {
      const nextHost = room.players.find(p => p.connected) || room.players[0];
      room.hostId = nextHost.id;
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
        players: [{ id: playerId, socketId: socket.id, name: playerName, avatar: sanitizeAvatar(avatar), team: null, role: null, connected: true, disconnectTimer: null }],
        phase: 'lobby', // lobby | clue | guess | end
        game: null
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
      room.players.push({ id: playerId, socketId: socket.id, name: playerName, avatar: sanitizeAvatar(avatar), team: null, role: null, connected: true, disconnectTimer: null });
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

      if (room.game && (room.phase === 'clue' || room.phase === 'guess' || room.phase === 'end')) {
        payload.gameState = gameStateFor(room);
        if (player.role === 'spymaster' || room.phase === 'end') {
          payload.colorKey = colorKey(room);
        }
      }

      ack && ack(payload);
      broadcastRoom(room);
    });

    socket.on('set_team', ({ team } = {}) => {
      const room = getRoom(socket);
      if (!room || room.phase !== 'lobby') return;
      const player = getPlayer(room, socket);
      if (!player) return;
      if (team !== 'red' && team !== 'blue' && team !== null) return;
      player.team = team;
      if (team === null) player.role = null;
      else if (!player.role) player.role = 'operative';
      broadcastRoom(room);
    });

    socket.on('set_role', ({ role } = {}) => {
      const room = getRoom(socket);
      if (!room || room.phase !== 'lobby') return;
      const player = getPlayer(room, socket);
      if (!player || !player.team) return;
      if (role !== 'spymaster' && role !== 'operative') return;
      if (role === 'spymaster') {
        room.players.forEach(p => {
          if (p.team === player.team && p.role === 'spymaster' && p.id !== player.id) p.role = 'operative';
        });
      }
      player.role = role;
      broadcastRoom(room);
    });

    socket.on('start_game', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'lobby') return;
      if (!canStart(room)) return;

      const startingTeam = Math.random() < 0.5 ? 'red' : 'blue';
      const otherTeam = OTHER_TEAM[startingTeam];
      const words = shuffle(WORDS).slice(0, 25);
      const colors = shuffle([
        ...Array(9).fill(startingTeam),
        ...Array(8).fill(otherTeam),
        ...Array(7).fill('neutral'),
        'assassin'
      ]);
      const board = words.map((word, i) => ({ word, color: colors[i], revealed: false }));

      room.game = {
        board,
        startingTeam,
        currentTeam: startingTeam,
        remainingCounts: { red: startingTeam === 'red' ? 9 : 8, blue: startingTeam === 'blue' ? 9 : 8 },
        currentClue: null,
        guessesLeft: 0,
        clueHistory: [],
        winner: null,
        winReason: null
      };
      room.phase = 'clue';

      broadcastRoom(room);
      broadcastGameState(room);
      sendColorKeyToSpymasters(room);
    });

    socket.on('submit_clue', ({ word, number } = {}) => {
      const room = getRoom(socket);
      if (!room || !room.game || room.phase !== 'clue') return;
      const player = getPlayer(room, socket);
      if (!player || player.team !== room.game.currentTeam || player.role !== 'spymaster') return;
      const clueWord = (word || '').trim().slice(0, 30);
      const clueNumber = Math.min(9, Math.max(0, parseInt(number, 10) || 0));
      if (!clueWord) return;

      room.game.currentClue = { word: clueWord, number: clueNumber, team: room.game.currentTeam };
      room.game.guessesLeft = clueNumber + 1;
      room.game.clueHistory.push({ team: room.game.currentTeam, word: clueWord, number: clueNumber });
      room.phase = 'guess';

      broadcastGameState(room);
    });

    socket.on('guess_card', ({ index } = {}) => {
      const room = getRoom(socket);
      if (!room || !room.game || room.phase !== 'guess') return;
      const player = getPlayer(room, socket);
      if (!player || player.team !== room.game.currentTeam || player.role !== 'operative') return;
      const card = room.game.board[index];
      if (!card || card.revealed) return;

      card.revealed = true;
      const team = room.game.currentTeam;

      if (card.color === 'assassin') {
        checkWin(room, OTHER_TEAM[team], 'assassin');
        return;
      }

      if (card.color === 'red' || card.color === 'blue') {
        room.game.remainingCounts[card.color] -= 1;
        if (room.game.remainingCounts[card.color] <= 0) {
          checkWin(room, card.color, 'all-found');
          return;
        }
      }

      if (card.color === team) {
        room.game.guessesLeft -= 1;
        if (room.game.guessesLeft <= 0) {
          switchTurn(room);
        }
      } else {
        switchTurn(room);
      }

      broadcastGameState(room);
    });

    socket.on('end_turn', () => {
      const room = getRoom(socket);
      if (!room || !room.game || room.phase !== 'guess') return;
      const player = getPlayer(room, socket);
      if (!player || player.team !== room.game.currentTeam) return;
      switchTurn(room);
      broadcastGameState(room);
    });

    socket.on('play_again', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'end') return;
      room.phase = 'lobby';
      room.game = null;
      room.players = room.players.filter(p => p.connected);
      if (room.players.length === 0) {
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

module.exports = { registerCodenamesGame };
