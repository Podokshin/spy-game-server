// Игра «Кто я?» — регистрируется на namespace io.of('/whoami')
const { IDENTITIES } = require('../data-whoami');
const { DISCONNECT_GRACE_MS, sanitizeAvatar, makeRoomCode, makePlayerId, shuffle } = require('./shared');
const party = require('./party');

function registerWhoamiGame(io) {
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

  function identitiesPayload(room) {
    return {
      players: room.players.map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        identity: room.game.identityByPlayerId[p.id]
      }))
    };
  }

  function finishedPayload(room) {
    return {
      finishedOrder: room.game.finishedOrder,
      total: room.players.length
    };
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

  function startPlaying(room) {
    room.phase = 'playing';
    io.to(room.code).emit('playing_started');
  }

  function finishGame(room) {
    room.phase = 'end';
    const order = room.game.finishedOrder;
    order.forEach((playerId, i) => {
      const player = room.players.find(p => p.id === playerId);
      if (player) player.score += (room.players.length - i);
    });
    const partyStandings = party.recordResult(
      room.code,
      'whoami',
      room.players.map(p => ({ name: p.name, avatar: p.avatar, points: p.score }))
    );
    io.to(room.code).emit('game_finished', {
      players: publicPlayers(room),
      identityByPlayerId: room.game.identityByPlayerId,
      finishedOrder: order,
      partyStandings
    });
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
    if (room.phase === 'assigned' && room.readyIds) {
      room.readyIds.delete(playerId);
    }
    if (room.phase === 'playing' && room.game) {
      room.game.finishedOrder = room.game.finishedOrder.filter(id => id !== playerId);
      if (room.game.finishedOrder.length >= room.players.length) {
        finishGame(room);
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
        phase: 'lobby', // lobby | assigned | playing | end | skipped
        game: null,
        readyIds: new Set(),
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

      if (room.game && ['assigned', 'playing', 'end'].includes(room.phase)) {
        payload.identities = identitiesPayload(room);
      }
      if (room.phase === 'assigned') {
        payload.alreadyReady = room.readyIds.has(player.id);
        payload.readyCount = room.readyIds.size;
        payload.total = room.players.length;
      }
      if (room.phase === 'playing') {
        payload.finished = finishedPayload(room);
      }
      if (room.phase === 'end') {
        payload.result = {
          players: publicPlayers(room),
          identityByPlayerId: room.game.identityByPlayerId,
          finishedOrder: room.game.finishedOrder,
          partyStandings: party.getStandings(room.code)
        };
      } else if (room.phase === 'skipped') {
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
      if (room.players.length < 3) return;

      room.skipVotes.clear();
      const pool = shuffle(IDENTITIES).slice(0, room.players.length);
      const identityByPlayerId = {};
      room.players.forEach((p, i) => { identityByPlayerId[p.id] = pool[i]; });

      room.game = {
        identityByPlayerId,
        finishedOrder: []
      };
      room.phase = 'assigned';
      room.readyIds = new Set();

      io.to(room.code).emit('identities_assigned', identitiesPayload(room));
      broadcastRoom(room);
    });

    socket.on('player_ready', () => {
      const room = getRoom(socket);
      if (!room || room.phase !== 'assigned') return;
      const player = getPlayer(room, socket);
      if (!player) return;
      room.readyIds.add(player.id);
      io.to(room.code).emit('ready_update', { readyCount: room.readyIds.size, total: room.players.length });
      if (room.readyIds.size >= room.players.length) {
        startPlaying(room);
      }
    });

    socket.on('force_start_playing', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'assigned') return;
      startPlaying(room);
    });

    socket.on('i_guessed', () => {
      const room = getRoom(socket);
      if (!room || room.phase !== 'playing') return;
      const player = getPlayer(room, socket);
      if (!player) return;
      if (room.game.finishedOrder.includes(player.id)) return;
      room.game.finishedOrder.push(player.id);
      const rank = room.game.finishedOrder.length;
      io.to(room.code).emit('player_finished', {
        playerId: player.id,
        name: player.name,
        avatar: player.avatar,
        rank,
        remaining: room.players.length - room.game.finishedOrder.length
      });
      if (room.game.finishedOrder.length >= room.players.length) {
        finishGame(room);
      }
    });

    socket.on('force_end_playing', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'playing') return;
      finishGame(room);
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

module.exports = { registerWhoamiGame };
