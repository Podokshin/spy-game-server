// Игра «Стена признаний» — регистрируется на io.of('/wall'). Каждый раунд
// все тайно пишут анонимное признание на общую тему, потом признания по
// одному выводятся на "стену": все, кроме автора, угадывают, кто это
// написал. Угадавшие получают очко, а автор получает очко за каждого, кто
// не угадал — чем лучше маскируешься, тем больше очков.
const { DISCONNECT_GRACE_MS, sanitizeAvatar, makeRoomCode, makePlayerId, shuffle } = require('./shared');
const party = require('./party');

const TOTAL_ROUNDS = 4;
const WRITING_MS = 75 * 1000;
const VOTE_MS = 20 * 1000;
const CONFESSION_MAX_LEN = 200;
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 10;

const PROMPTS = [
  'Самое стыдное, что ты делал(а) на первом свидании',
  'Самая нелепая ложь, в которую тебе поверили',
  'За что тебя чуть не выгнали с работы или учёбы',
  'Самая странная вещь, которую ты гуглил(а) посреди ночи',
  'Самое дурацкое, за что тебя когда-то ловили родители',
  'Что ты делаешь, когда думаешь, что никто не видит',
  'Самая абсурдная причина, по которой ты опаздывал(а)',
  'Что бы ты никогда не признал(а) вслух, но иногда думаешь',
  'Самое стыдное сообщение, отправленное не тому человеку',
  'За что тебе до сих пор стыдно перед бывшим или бывшей',
  'Самая глупая вещь, которую ты купил(а) под влиянием момента',
  'Что ты приукрасил(а) или соврал(а) на собеседовании',
  'Самая странная привычка, о которой почти никто не знает',
  'Худшее, что ты сказал(а) в порыве ревности',
  'За что тебя могли бы осудить в приличной компании',
  'Самое неловкое, что случилось у тебя на свидании вслепую',
  'Что ты однажды сделал(а) назло, хотя знал(а), что неправ(а)',
  'Самая безумная вещь, которую ты сделал(а) ради лайков или внимания',
  'Что ты до сих пор скрываешь от родителей',
  'Самое стыдное, что ты искал(а) в интернет-магазине',
  'Самое нелепое оправдание, которое ты когда-либо придумывал(а)',
  'За что тебе стыдно, но ты бы повторил(а) снова',
];

const FALLBACK_CONFESSIONS = [
  'Не успел(а) признаться вовремя — видимо, совесть слишком долго боролась.',
  'Тут могло быть признание, но время вышло.',
  'Промолчал(а). Осторожный тип.',
];

function registerWallGame(io) {
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

  // ---------- Раунды ----------

  function pickPrompt(room) {
    const g = room.game;
    const remaining = PROMPTS.filter(p => !g.usedPrompts.has(p));
    const pool = remaining.length ? remaining : PROMPTS;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    g.usedPrompts.add(chosen);
    return chosen;
  }

  function startRound(room) {
    clearRoomTimer(room);
    const g = room.game;
    g.currentPrompt = pickPrompt(room);
    g.confessions = {};
    room.phase = 'writing';
    const endsAt = Date.now() + WRITING_MS;
    g.writingEndsAt = endsAt;
    io.to(room.code).emit('round_writing_started', {
      round: g.round,
      totalRounds: g.totalRounds,
      prompt: g.currentPrompt,
      endsAt,
      totalMs: WRITING_MS,
      maxLen: CONFESSION_MAX_LEN
    });
    room.timerHandle = setTimeout(() => {
      if (room.phase === 'writing') finalizeWriting(room, true);
    }, WRITING_MS);
  }

  function finalizeWriting(room, timeUp) {
    clearRoomTimer(room);
    const g = room.game;
    room.players.forEach(p => {
      if (!g.confessions[p.id] || !g.confessions[p.id].trim()) {
        g.confessions[p.id] = FALLBACK_CONFESSIONS[Math.floor(Math.random() * FALLBACK_CONFESSIONS.length)];
      }
    });
    g.revealOrder = shuffle(room.players.map(p => p.id));
    g.revealIndex = 0;
    room.phase = 'reveal';
    startVoteStage(room);
  }

  // Собирает данные ровно для ТЕКУЩЕГО шага раскрытия под конкретного
  // игрока — на этапе 'vote' автор и остальные видят разное (автору нельзя
  // спойлерить, кто он, остальным нельзя показывать текст без кандидатов).
  function buildStepPayload(room, forPlayerId) {
    const g = room.game;
    const base = { round: g.round, totalRounds: g.totalRounds };

    if (g.stage === 'vote') {
      const authorId = g.revealOrder[g.revealIndex];
      const isAuthorView = forPlayerId === authorId;
      const common = {
        kind: 'vote',
        confessionIndex: g.revealIndex,
        totalConfessions: g.revealOrder.length,
        confessionText: g.confessions[authorId],
        endsAt: g.voteEndsAt,
        totalMs: VOTE_MS,
        isAuthor: isAuthorView
      };
      if (isAuthorView) return { ...base, ...common };
      const candidates = room.players.filter(p => p.id !== forPlayerId).map(p => ({ id: p.id, name: p.name, avatar: p.avatar }));
      return { ...base, ...common, candidates, alreadyVoted: Object.prototype.hasOwnProperty.call(g.votes, forPlayerId) };
    }
    if (g.stage === 'result') return { ...base, ...g.lastResult };
    if (g.stage === 'roundEnd') return { ...base, ...g.lastRoundEnd };
    return { ...base, kind: 'vote', confessionIndex: 0, totalConfessions: 1, confessionText: '', isAuthor: false, candidates: [] };
  }

  function broadcastVoteStage(room) {
    room.players.forEach(p => emitToPlayer(p, 'wall_step', buildStepPayload(room, p.id)));
  }

  function startVoteStage(room) {
    clearRoomTimer(room);
    const g = room.game;
    // Автор мог выйти из комнаты раньше, чем дошла очередь его признания —
    // пропускаем таких, пока не найдём кого-то ещё в комнате.
    while (g.revealIndex < g.revealOrder.length && !room.players.some(p => p.id === g.revealOrder[g.revealIndex])) {
      g.revealIndex += 1;
    }
    if (g.revealIndex >= g.revealOrder.length) { startRoundEnd(room); return; }
    g.stage = 'vote';
    g.votes = {};
    const endsAt = Date.now() + VOTE_MS;
    g.voteEndsAt = endsAt;
    broadcastVoteStage(room);
    broadcastRoom(room);
    room.timerHandle = setTimeout(() => {
      if (room.phase === 'reveal' && room.game.stage === 'vote') finalizeVote(room, true);
    }, VOTE_MS);
  }

  function finalizeVote(room, timeUp) {
    clearRoomTimer(room);
    const g = room.game;
    const authorId = g.revealOrder[g.revealIndex];
    const author = room.players.find(p => p.id === authorId);
    const voters = room.players.filter(p => p.id !== authorId);
    voters.forEach(v => { if (!(v.id in g.votes)) g.votes[v.id] = null; });

    const guesses = voters.map(v => {
      const guessedId = g.votes[v.id] || null;
      const correct = guessedId === authorId;
      const guessed = guessedId ? room.players.find(p => p.id === guessedId) : null;
      return {
        voterId: v.id, voterName: v.name, voterAvatar: v.avatar,
        guessedId, guessedName: guessed ? guessed.name : null, guessedAvatar: guessed ? guessed.avatar : null,
        correct
      };
    });
    const correctGuesses = guesses.filter(x => x.correct);
    const wrongGuesses = guesses.filter(x => !x.correct);
    correctGuesses.forEach(x => {
      const p = room.players.find(pp => pp.id === x.voterId);
      if (p) p.score += 1;
    });
    if (author) author.score += wrongGuesses.length;

    g.lastResult = {
      kind: 'result',
      confessionIndex: g.revealIndex,
      totalConfessions: g.revealOrder.length,
      confessionText: author ? g.confessions[authorId] : '',
      timeUp: !!timeUp,
      author: author ? { id: author.id, name: author.name, avatar: author.avatar } : null,
      guesses,
      correctCount: correctGuesses.length,
      authorBonus: wrongGuesses.length
    };
    g.stage = 'result';
    io.to(room.code).emit('wall_step', buildStepPayload(room, null));
    broadcastRoom(room);
  }

  function startRoundEnd(room) {
    clearRoomTimer(room);
    const g = room.game;
    g.stage = 'roundEnd';
    g.lastRoundEnd = {
      kind: 'roundEnd',
      players: room.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, score: p.score }))
    };
    io.to(room.code).emit('wall_step', buildStepPayload(room, null));
    broadcastRoom(room);
  }

  function finishGame(room) {
    clearRoomTimer(room);
    room.phase = 'end';
    const partyStandings = party.recordResult(
      room.code,
      'wall',
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

    if (room.phase === 'writing' && room.game) {
      delete room.game.confessions[playerId];
      const count = Object.keys(room.game.confessions).length;
      io.to(room.code).emit('confession_progress', { count, total: room.players.length });
      if (count >= room.players.length) { finalizeWriting(room, false); return; }
    }

    if (room.phase === 'reveal' && room.game && room.game.stage === 'vote') {
      const authorId = room.game.revealOrder[room.game.revealIndex];
      if (playerId === authorId) { finalizeVote(room, false); return; }
      delete room.game.votes[playerId];
      const voters = room.players.filter(p => p.id !== authorId);
      const votedCount = voters.filter(v => v.id in room.game.votes).length;
      io.to(room.code).emit('vote_progress', { count: votedCount, total: voters.length });
      if (voters.length > 0 && votedCount >= voters.length) { finalizeVote(room, false); return; }
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
      const wanted = (partyCode || '').toUpperCase().trim();
      const code = wanted && !rooms.has(wanted) ? wanted : makeRoomCode(rooms);
      const playerId = makePlayerId();
      const room = {
        code,
        hostId: playerId,
        players: [{ id: playerId, socketId: socket.id, name: playerName, avatar: sanitizeAvatar(avatar), score: 0, connected: true, disconnectTimer: null }],
        settings: {},
        phase: 'lobby', // lobby | writing | reveal | end | skipped
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
      if (room.players.length >= MAX_PLAYERS) return ack && ack({ ok: false, error: 'Комната заполнена (максимум ' + MAX_PLAYERS + ' игроков)' });
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

      if (room.phase === 'writing') {
        payload.writing = {
          round: room.game.round,
          totalRounds: room.game.totalRounds,
          prompt: room.game.currentPrompt,
          endsAt: room.game.writingEndsAt,
          totalMs: WRITING_MS,
          maxLen: CONFESSION_MAX_LEN,
          alreadySubmitted: Object.prototype.hasOwnProperty.call(room.game.confessions, player.id)
        };
      } else if (room.phase === 'reveal') {
        payload.step = buildStepPayload(room, player.id);
      } else if (room.phase === 'end') {
        payload.partyStandings = party.getStandings(room.code);
      } else if (room.phase === 'skipped') {
        payload.partyStandings = party.getStandings(room.code);
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
      if (room.players.length < MIN_PLAYERS) return;

      room.players.forEach(p => { p.score = 0; });
      room.game = {
        round: 1,
        totalRounds: TOTAL_ROUNDS,
        usedPrompts: new Set(),
        currentPrompt: null,
        confessions: {},
        writingEndsAt: null,
        revealOrder: [],
        revealIndex: 0,
        stage: null,
        votes: {},
        voteEndsAt: null,
        lastResult: null,
        lastRoundEnd: null
      };
      room.skipVotes.clear();
      startRound(room);
    });

    socket.on('submit_confession', ({ text } = {}) => {
      const room = getRoom(socket);
      if (!room || room.phase !== 'writing') return;
      const player = getPlayer(room, socket);
      if (!player) return;
      if (Object.prototype.hasOwnProperty.call(room.game.confessions, player.id)) return;
      const clean = (text || '').trim().slice(0, CONFESSION_MAX_LEN);
      if (!clean) return;
      room.game.confessions[player.id] = clean;
      const count = Object.keys(room.game.confessions).length;
      io.to(room.code).emit('confession_progress', { count, total: room.players.length });
      if (count >= room.players.length) finalizeWriting(room, false);
    });

    socket.on('force_finish_writing', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'writing') return;
      finalizeWriting(room, false);
    });

    socket.on('submit_guess', ({ guessedId } = {}) => {
      const room = getRoom(socket);
      if (!room || room.phase !== 'reveal' || room.game.stage !== 'vote') return;
      const player = getPlayer(room, socket);
      if (!player) return;
      const g = room.game;
      const authorId = g.revealOrder[g.revealIndex];
      if (player.id === authorId) return;
      if (Object.prototype.hasOwnProperty.call(g.votes, player.id)) return;
      const valid = !guessedId || room.players.some(p => p.id === guessedId && p.id !== player.id);
      if (!valid) return;
      g.votes[player.id] = guessedId || null;
      const voters = room.players.filter(p => p.id !== authorId);
      const votedCount = voters.filter(v => v.id in g.votes).length;
      io.to(room.code).emit('vote_progress', { count: votedCount, total: voters.length });
      if (votedCount >= voters.length) finalizeVote(room, false);
    });

    socket.on('force_finish_vote', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'reveal' || room.game.stage !== 'vote') return;
      finalizeVote(room, false);
    });

    socket.on('next_step', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'reveal') return;
      const g = room.game;
      if (g.stage === 'result') {
        if (g.revealIndex < g.revealOrder.length - 1) {
          g.revealIndex += 1;
          startVoteStage(room);
        } else {
          startRoundEnd(room);
        }
      } else if (g.stage === 'roundEnd') {
        if (g.round < g.totalRounds) {
          g.round += 1;
          startRound(room);
        } else {
          finishGame(room);
        }
      }
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

module.exports = { registerWallGame };
