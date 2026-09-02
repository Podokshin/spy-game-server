// Игра «Волна» (Wavelength) — регистрируется на namespace io.of('/wavelength')
const { SPECTRUMS } = require('../data-wavelength');
const { DISCONNECT_GRACE_MS, sanitizeAvatar, makeRoomCode, makePlayerId } = require('./shared');
const party = require('./party');

const OTHER_TEAM = { red: 'blue', blue: 'red' };
const GUESS_TIME_MS = 45 * 1000; // фиксированное время на угадывание, не зависит от настроек хоста

function registerWavelengthGame(io) {
  const rooms = new Map(); // code -> room

  function publicPlayers(room) {
    return room.players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      isHost: p.id === room.hostId,
      team: p.team,
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

  function eligibleGuesserCount(room) {
    const g = room.game;
    if (!g) return 0;
    return room.players.filter(p => p.team === g.currentTeam && p.id !== g.clueGiverId && p.connected).length;
  }

  function canStart(room) {
    const red = room.players.filter(p => p.team === 'red').length;
    const blue = room.players.filter(p => p.team === 'blue').length;
    return red >= 2 && blue >= 2;
  }

  function pickSpectrumIndex(room) {
    const g = room.game;
    if (g.usedSpectrumIndices.length >= SPECTRUMS.length) g.usedSpectrumIndices = [];
    let idx;
    do {
      idx = Math.floor(Math.random() * SPECTRUMS.length);
    } while (g.usedSpectrumIndices.includes(idx));
    g.usedSpectrumIndices.push(idx);
    return idx;
  }

  function startRound(room) {
    clearRoomTimer(room);
    const g = room.game;

    // Ротация подсказчика должна учитывать только подключённых игроков — иначе
    // раунд может стартовать сразу с отключённым подсказчиком и намертво
    // зависнуть (никто другой не может дать подсказку за него).
    let members = room.players.filter(p => p.team === g.currentTeam && p.connected);
    if (members.length === 0) {
      // Никого из текущей команды нет на связи. Пробуем передать раунд другой
      // команде вместо аварийного завершения игры — это простой, но не
      // идеальный компромисс (счёт очерёдности другой команды используется
      // напрямую); если и там некому — завершаем игру.
      const otherMembers = room.players.filter(p => p.team === OTHER_TEAM[g.currentTeam] && p.connected);
      if (otherMembers.length === 0) {
        finishGame(room);
        return;
      }
      g.currentTeam = OTHER_TEAM[g.currentTeam];
      members = otherMembers;
    }

    g.spectrum = SPECTRUMS[pickSpectrumIndex(room)];
    g.target = Math.floor(Math.random() * 101); // 0-100 включительно
    g.clueText = null;
    g.guesses = new Map();
    g.guessEndsAt = null;

    const giver = members[g.teamTurnCount[g.currentTeam] % members.length];
    g.clueGiverId = giver.id;

    room.phase = 'clue';
    broadcastRoom(room);

    room.players.forEach(p => {
      if (p.id === giver.id) {
        emitToPlayer(p, 'your_clue_turn', {
          spectrum: g.spectrum,
          target: g.target,
          round: g.round,
          totalRounds: g.totalRounds
        });
      } else {
        emitToPlayer(p, 'round_started', {
          team: g.currentTeam,
          giverId: giver.id,
          giverName: giver.name,
          giverAvatar: giver.avatar,
          spectrum: g.spectrum,
          round: g.round,
          totalRounds: g.totalRounds
        });
      }
    });
  }

  function finalizeRound(room, timeUp) {
    clearRoomTimer(room);
    const g = room.game;
    if (!g) return;

    const values = Array.from(g.guesses.values());
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 50;
    const distance = Math.abs(avg - g.target);
    const pts = distance <= 3 ? 4 : distance <= 8 ? 3 : distance <= 16 ? 2 : distance <= 24 ? 1 : 0;

    g.teamScores[g.currentTeam] += pts;

    const guessDetail = Array.from(g.guesses.entries()).map(([playerId, position]) => {
      const p = room.players.find(pp => pp.id === playerId);
      return {
        playerId,
        name: p ? p.name : '(вышел из комнаты)',
        avatar: p ? p.avatar : null,
        position
      };
    });

    g.history.push({ spectrum: g.spectrum, target: g.target, avg, pts, team: g.currentTeam, guesses: guessDetail });

    room.phase = 'reveal';

    io.to(room.code).emit('round_result', {
      spectrum: g.spectrum,
      target: g.target,
      avg,
      pts,
      team: g.currentTeam,
      teamScores: g.teamScores,
      guessDetail,
      timeUp: !!timeUp,
      round: g.round,
      totalRounds: g.totalRounds
    });
    broadcastRoom(room);
  }

  function advanceRound(room) {
    const g = room.game;
    g.teamTurnCount[g.currentTeam] += 1;
    g.round += 1;
    if (g.round > g.totalRounds) {
      finishGame(room);
    } else {
      g.currentTeam = OTHER_TEAM[g.currentTeam];
      startRound(room);
    }
  }

  function skipClueRound(room) {
    clearRoomTimer(room);
    const g = room.game;
    if (!g) return;

    // Подсказчик пропал/завис в фазе подсказки — раунд засчитывается как
    // проваленный без очков (как форфейт), и игра сразу переходит к следующему
    // раунду тем же путём, что и обычное завершение раунда через next_round.
    g.history.push({ spectrum: g.spectrum, target: g.target, avg: null, pts: 0, team: g.currentTeam, guesses: [], skipped: true });

    advanceRound(room);
  }

  function finishGame(room) {
    clearRoomTimer(room);
    room.phase = 'end';
    const teamScores = room.game ? room.game.teamScores : { red: 0, blue: 0 };
    // «Вечер игр»: команда с большим счётом получает по 3 очка на игрока,
    // проигравшая — по 1 (за участие). При ничьей (в т.ч. если игра
    // прервалась раньше первого розыгранного раунда и счёт 0:0) явного
    // победителя нет — всем начисляется по 1, чтобы не гадать и не падать.
    const winner = teamScores.red === teamScores.blue ? null : (teamScores.red > teamScores.blue ? 'red' : 'blue');
    const partyStandings = party.recordResult(
      room.code,
      'wavelength',
      room.players.map(p => ({ name: p.name, avatar: p.avatar, points: winner ? (p.team === winner ? 3 : 1) : 1 }))
    );
    io.to(room.code).emit('game_finished', { teamScores, players: publicPlayers(room), partyStandings });
    broadcastRoom(room);
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

    if (room.phase === 'guess' && room.game && room.game.guesses) {
      room.game.guesses.delete(playerId);
      const total = eligibleGuesserCount(room);
      io.to(room.code).emit('guess_progress', { count: room.game.guesses.size, total });
      if (total > 0 && room.game.guesses.size >= total) {
        finalizeRound(room, false);
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
        players: [{ id: playerId, socketId: socket.id, name: playerName, avatar: sanitizeAvatar(avatar), team: null, score: 0, connected: true, disconnectTimer: null }],
        settings: { totalRounds: 8 },
        phase: 'lobby', // lobby | clue | guess | reveal | end | skipped
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
      room.players.push({ id: playerId, socketId: socket.id, name: playerName, avatar: sanitizeAvatar(avatar), team: null, score: 0, connected: true, disconnectTimer: null });
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

      if (room.game) {
        const g = room.game;
        if (room.phase === 'clue') {
          if (player.id === g.clueGiverId) {
            payload.yourClueTurn = { spectrum: g.spectrum, target: g.target, round: g.round, totalRounds: g.totalRounds };
          } else {
            const giver = room.players.find(p => p.id === g.clueGiverId);
            payload.roundStarted = {
              team: g.currentTeam,
              giverId: g.clueGiverId,
              giverName: giver ? giver.name : '(вышел из комнаты)',
              giverAvatar: giver ? giver.avatar : null,
              spectrum: g.spectrum,
              round: g.round,
              totalRounds: g.totalRounds
            };
          }
        } else if (room.phase === 'guess') {
          const giver = room.players.find(p => p.id === g.clueGiverId);
          payload.guessState = {
            team: g.currentTeam,
            giverId: g.clueGiverId,
            giverName: giver ? giver.name : '(вышел из комнаты)',
            giverAvatar: giver ? giver.avatar : null,
            spectrum: g.spectrum,
            clueText: g.clueText,
            round: g.round,
            totalRounds: g.totalRounds,
            isGuesser: player.team === g.currentTeam && player.id !== g.clueGiverId,
            myGuess: g.guesses.has(player.id) ? g.guesses.get(player.id) : null,
            endsAt: g.guessEndsAt,
            progress: { count: g.guesses.size, total: eligibleGuesserCount(room) }
          };
        } else if (room.phase === 'reveal') {
          const last = g.history[g.history.length - 1];
          if (last) {
            payload.roundResult = {
              spectrum: last.spectrum,
              target: last.target,
              avg: last.avg,
              pts: last.pts,
              team: last.team,
              teamScores: g.teamScores,
              guessDetail: last.guesses,
              timeUp: false,
              round: g.round,
              totalRounds: g.totalRounds
            };
          }
        } else if (room.phase === 'end') {
          payload.gameFinished = { teamScores: g.teamScores, players: publicPlayers(room), partyStandings: party.getStandings(room.code) };
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
      broadcastRoom(room);
    });

    socket.on('update_settings', ({ totalRounds } = {}) => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'lobby') return;
      let n = parseInt(totalRounds, 10);
      if (!Number.isFinite(n)) n = 8;
      n = Math.min(20, Math.max(4, n));
      n = Math.round(n / 2) * 2; // округляем к чётному, чтобы команды играли поровну
      n = Math.min(20, Math.max(4, n));
      room.settings = { totalRounds: n };
      broadcastRoom(room);
    });

    socket.on('start_game', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'lobby') return;
      if (!canStart(room)) return;

      room.skipVotes.clear();
      room.game = {
        round: 1,
        totalRounds: room.settings.totalRounds,
        currentTeam: Math.random() < 0.5 ? 'red' : 'blue',
        teamTurnCount: { red: 0, blue: 0 },
        teamScores: { red: 0, blue: 0 },
        usedSpectrumIndices: [],
        clueGiverId: null,
        spectrum: null,
        target: null,
        clueText: null,
        guessEndsAt: null,
        guesses: new Map(),
        history: []
      };

      startRound(room);
    });

    socket.on('submit_clue', ({ text } = {}) => {
      const room = getRoom(socket);
      if (!room || !room.game || room.phase !== 'clue') return;
      const player = getPlayer(room, socket);
      if (!player || player.id !== room.game.clueGiverId) return;
      const clueText = (text || '').trim().slice(0, 120);
      if (!clueText) return;

      const g = room.game;
      g.clueText = clueText;
      g.guessEndsAt = Date.now() + GUESS_TIME_MS;
      room.phase = 'guess';

      io.to(room.code).emit('clue_submitted', { text: clueText, spectrum: g.spectrum, giverId: player.id, endsAt: g.guessEndsAt });
      broadcastRoom(room);

      clearRoomTimer(room);
      room.timerHandle = setTimeout(() => {
        if (room.phase === 'guess') finalizeRound(room, true);
      }, GUESS_TIME_MS);
    });

    socket.on('submit_guess', ({ position } = {}) => {
      const room = getRoom(socket);
      if (!room || !room.game || room.phase !== 'guess') return;
      const player = getPlayer(room, socket);
      if (!player || player.team !== room.game.currentTeam || player.id === room.game.clueGiverId) return;
      const raw = Number(position);
      if (!Number.isFinite(raw)) return;
      const pos = Math.min(100, Math.max(0, Math.round(raw)));

      room.game.guesses.set(player.id, pos);
      const total = eligibleGuesserCount(room);
      io.to(room.code).emit('guess_progress', { count: room.game.guesses.size, total });
      if (total > 0 && room.game.guesses.size >= total) finalizeRound(room, false);
    });

    // Аварийная кнопка хоста: раньше работала только в фазе угадывания, а в
    // фазе подсказки не было вообще никакого способа продолжить игру, если
    // подсказчик отключился/завис — комната зависала навсегда. Теперь хост
    // может принудительно закрыть раунд в обеих фазах.
    socket.on('force_finalize_round', () => {
      const room = getRoom(socket);
      if (!room || !room.game || !isHost(room, socket)) return;
      if (room.phase === 'guess') {
        finalizeRound(room, true);
      } else if (room.phase === 'clue') {
        skipClueRound(room);
      }
    });

    socket.on('next_round', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'reveal') return;
      advanceRound(room);
    });

    socket.on('play_again', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'end') return;
      clearRoomTimer(room);
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

  return { hasRoom: (code) => rooms.has(code) };
}

module.exports = { registerWavelengthGame };
