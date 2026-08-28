// Игра «Кодовые имена» — регистрируется на отдельном namespace
const { WORDS, ZOOMER_WORDS } = require('../data-codenames');
const { DISCONNECT_GRACE_MS, sanitizeAvatar, makeRoomCode, makePlayerId, shuffle } = require('./shared');
const party = require('./party');

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
      winReason: g.winReason,
      // «Вечер игр»: общий счёт добавляем только когда игра реально
      // завершилась — до этого момента вечеринка ещё не пополнилась очками
      // за эту партию, а пересчитывать на каждый ход незачем.
      partyStandings: room.phase === 'end' ? party.getStandings(room.code) : undefined
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
    // «Вечер игр»: команда-победитель получает по 3 очка на игрока,
    // проигравшая — по 1 (за участие). Игроки без команды (не должно
    // случаться, раз игра стартовала только когда обе команды укомплектованы)
    // на всякий случай тоже считаются проигравшими, а не крашат подсчёт.
    party.recordResult(
      room.code,
      'codenames',
      room.players.map(p => ({ name: p.name, avatar: p.avatar, points: p.team === team ? 3 : 1 }))
    );
    broadcastGameState(room);
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
    room.game.currentTeam = OTHER_TEAM[room.game.currentTeam];
    room.game.currentClue = null;
    room.game.guessesLeft = 0;
    room.phase = 'clue';
  }

  function removePlayer(room, playerId) {
    const player = room.players.find(p => p.id === playerId);
    if (player && player.disconnectTimer) clearTimeout(player.disconnectTimer);
    room.skipVotes.delete(playerId);

    room.players = room.players.filter(p => p.id !== playerId);

    if (room.players.length === 0) {
      rooms.delete(room.code);
      return;
    }
    if (room.hostId === playerId) {
      const nextHost = room.players.find(p => p.connected) || room.players[0];
      room.hostId = nextHost.id;
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
        players: [{ id: playerId, socketId: socket.id, name: playerName, avatar: sanitizeAvatar(avatar), team: null, role: null, connected: true, disconnectTimer: null }],
        settings: { wordSet: 'classic' },
        phase: 'lobby', // lobby | clue | guess | end | skipped
        game: null,
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
      if (room.phase === 'skipped') {
        payload.skipped = { players: publicPlayers(room), partyStandings: party.getStandings(room.code) };
      }
      if (isSkippable(room)) {
        payload.skipVotes = { votes: room.skipVotes.size, needed: skipThreshold(room), voterIds: Array.from(room.skipVotes) };
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

    socket.on('update_settings', (settings = {}) => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'lobby') return;
      room.settings = {
        wordSet: settings.wordSet === 'zoomer' ? 'zoomer' : 'classic'
      };
      broadcastRoom(room);
    });

    socket.on('start_game', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'lobby') return;
      if (!canStart(room)) return;

      room.skipVotes.clear();
      const startingTeam = Math.random() < 0.5 ? 'red' : 'blue';
      const otherTeam = OTHER_TEAM[startingTeam];
      const wordPool = room.settings.wordSet === 'zoomer' ? ZOOMER_WORDS : WORDS;
      const words = shuffle(wordPool).slice(0, 25);
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
      // Стандартное правило Codenames: на подсказку с числом N разрешено сделать
      // не больше N+1 угадываний (guessesLeft выставляется в submit_clue). Как
      // только лимит исчерпан, дальнейшие угадывания отклоняются.
      if (room.game.guessesLeft <= 0) return;
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
        // Угадали свою карту — команда может продолжать угадывать, но каждая
        // попытка (в том числе верная) тратит лимит guessesLeft. Как только он
        // исчерпан, ход переходит другой команде — так же, как при ошибке.
        room.game.guessesLeft = Math.max(0, room.game.guessesLeft - 1);
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

    // Аварийный выход для хоста: если капитан активной команды отключился во время
    // фазы подсказки, больше никто не может её дать и игра иначе зависает навсегда.
    // Хост может принудительно передать ход другой команде в любой активной фазе.
    socket.on('force_end_turn', () => {
      const room = getRoom(socket);
      if (!room || !room.game || (room.phase !== 'clue' && room.phase !== 'guess')) return;
      if (!isHost(room, socket)) return;
      switchTurn(room);
      broadcastGameState(room);
    });

    socket.on('play_again', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'end') return;
      room.phase = 'lobby';
      room.game = null;
      room.skipVotes.clear();
      if (room.players.length === 0) {
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
      // Хост мог быть тем, кто отключился — сразу передаём хост следующему
      // подключённому игроку, не дожидаясь пятиминутного грейс-периода
      // removePlayer, иначе управляющие кнопки хоста никому не доступны всё
      // это время.
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

module.exports = { registerCodenamesGame };
