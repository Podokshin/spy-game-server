// Игра «Скуф ищет альтушку» — регистрируется на namespace io.of('/skuf').
// По механике вдохновлена Monster Seeking Monster (Jackbox Party Pack 4):
// несколько «ночей» подряд игроки тайно переписываются друг с другом,
// затем каждый тайно выбирает одного человека на «свидание». Взаимный
// выбор — сердце обоим. У каждого игрока своя секретная роль-архетип со
// способностью, которая тихо влияет на очки весь матч и постепенно
// раскрывается остальным. Собственный, не-Jackbox набор ролей/текстов.
const { DISCONNECT_GRACE_MS, sanitizeAvatar, makeRoomCode, makePlayerId, shuffle } = require('./shared');
const party = require('./party');

const TOTAL_NIGHTS = 5;
const MAX_MESSAGES_PER_NIGHT = 4;
const MAX_MESSAGE_LEN = 200;
const MESSAGING_MS = 75 * 1000;
const PICKING_MS = 25 * 1000;
const MAX_PLAYERS = 8;

// Роли — пул из 10, на партию раздаются только roles.length === players.length
// случайных различных ролей (как карты из колоды), поэтому не каждая игра
// одинакова. Способность применяется всегда, независимо от того, раскрыта
// ли роль игроку публично (раскрытие — только видимость для остальных).
const ROLES = {
  skuf: { name: 'Скуф', icon: '🧢', art: '/skuf/roles/skuf.jpg', desc: 'Если его свидание этой ночью — Альтушка, получает +2 сердца вместо +1.' },
  altushka: { name: 'Альтушка', icon: '🖤', art: '/skuf/roles/altushka.jpg', desc: 'Если её пару этой ночью больше вообще никто не выбрал — получает +1 сердце.' },
  pikmi: { name: 'Пикми', icon: '🙄', art: '/skuf/roles/pikmi.jpg', desc: 'Если ей написали 3 и более разных игрока за ночь — получает +1 сердце.' },
  gopnik: { name: 'Гопник', icon: '🧃', art: '/skuf/roles/gopnik.jpg', desc: 'При удачном свидании отжимает 1 сердце у того, с кем сам заматчился.' },
  uspeh: { name: 'Успешный успех', icon: '💼', art: '/skuf/roles/uspeh.jpg', desc: 'По нечётным ночам сердца от свидания удваиваются. По чётным без свидания — доп. штраф -1.' },
  zozh: { name: 'ЗОЖница', icon: '🥦', art: '/skuf/roles/zozh.jpg', desc: 'Если 2 ночи подряд без единого свидания — теряет 1 сердце.' },
  streamer: { name: 'Задрот-стример', icon: '🎮', art: '/skuf/roles/streamer.jpg', desc: 'Если какой-то игрок потратил на него все свои 4 сообщения этой ночи — получает +1 сердце.' },
  vanilla: { name: 'Ванильная штучка', icon: '🎀', art: '/skuf/roles/vanilla.jpg', desc: 'Если её отвергли — получает +1 сердце, но только один раз за всю игру.' },
  intriganka: { name: 'Интриганка', icon: '🐍', art: '/skuf/roles/intriganka.jpg', desc: 'Если её выбрали, а она выбрала кого-то другого — забирает 1 сердце у отвергнутого.' },
  mlm: { name: 'МЛМ-щица', icon: '💊', art: '/skuf/roles/mlm.jpg', desc: 'При удачном свидании «вербует» партнёра — тот тоже вербует при своих удачных свиданиях. Если к концу игры завербованы все — побеждает мгновенно, несмотря на сердца.' },
};

function registerSkufGame(io) {
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

  // ---------- Ночной цикл ----------

  function startMessagingPhase(room) {
    clearRoomTimer(room);
    room.phase = 'messaging';
    room.game.messages = [];
    room.game.picks = {};
    const endsAt = Date.now() + MESSAGING_MS;
    room.game.messagingEndsAt = endsAt;
    io.to(room.code).emit('night_messaging_started', {
      night: room.game.night,
      totalNights: TOTAL_NIGHTS,
      endsAt,
      totalMs: MESSAGING_MS,
      maxMessages: MAX_MESSAGES_PER_NIGHT
    });
    room.timerHandle = setTimeout(() => {
      if (room.phase === 'messaging') startPickingPhase(room);
    }, MESSAGING_MS);
  }

  function startPickingPhase(room) {
    clearRoomTimer(room);
    room.phase = 'picking';
    room.game.picks = {};
    const endsAt = Date.now() + PICKING_MS;
    room.game.pickingEndsAt = endsAt;
    io.to(room.code).emit('night_picking_started', {
      night: room.game.night,
      endsAt,
      totalMs: PICKING_MS,
      players: room.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar }))
    });
    room.timerHandle = setTimeout(() => {
      if (room.phase === 'picking') finalizePicking(room, true);
    }, PICKING_MS);
  }

  // Считает исходы ночи (матчи, списания/начисления сердец от ролей,
  // распространение "заражения" МЛМ-щицы) — чистая функция от уже
  // собранных данных ночи (picks/messages), сердца применяются в конце.
  function resolveNight(room) {
    const players = room.players;
    const ids = players.map(p => p.id);
    const picks = room.game.picks;
    const roleOf = (id) => room.game.rolesByPlayerId[id];

    const matchOf = {};
    ids.forEach(id => {
      const target = picks[id];
      matchOf[id] = (target && picks[target] === id) ? target : null;
    });

    const delta = {};
    ids.forEach(id => { delta[id] = 0; });

    ids.forEach(id => {
      if (matchOf[id]) delta[id] += 1;
      else if (!picks[id]) delta[id] -= 1;
    });

    function sentCount(fromId, toId) {
      return room.game.messages.filter(m => m.from === fromId && m.to === toId).length;
    }
    function distinctSendersTo(id) {
      return new Set(room.game.messages.filter(m => m.to === id).map(m => m.from));
    }

    ids.forEach(id => {
      const role = roleOf(id);
      const partner = matchOf[id];
      if (role === 'skuf') {
        if (partner && roleOf(partner) === 'altushka') delta[id] += 1;
      } else if (role === 'altushka') {
        if (partner) {
          const othersWhoPickedPartner = ids.filter(x => x !== id && picks[x] === partner).length;
          if (othersWhoPickedPartner === 0) delta[id] += 1;
        }
      } else if (role === 'pikmi') {
        if (distinctSendersTo(id).size >= 3) delta[id] += 1;
      } else if (role === 'gopnik') {
        if (partner) {
          delta[id] += 1;
          delta[partner] -= 1;
        }
      } else if (role === 'uspeh') {
        if (room.game.night % 2 === 1) {
          if (partner) delta[id] += 1;
        } else if (!partner) {
          delta[id] -= 1;
        }
      } else if (role === 'zozh') {
        const willBeStreak = partner ? 0 : (room.game.noMatchStreak[id] || 0) + 1;
        if (!partner && willBeStreak >= 2) delta[id] -= 1;
      } else if (role === 'streamer') {
        const someoneMaxedOutOnHim = ids.some(x => x !== id && sentCount(x, id) >= MAX_MESSAGES_PER_NIGHT);
        if (someoneMaxedOutOnHim) delta[id] += 1;
      } else if (role === 'vanilla') {
        if (picks[id] && !partner && !room.game.vanillaUsed.has(id)) {
          delta[id] += 1;
          room.game.vanillaUsed.add(id);
        }
      } else if (role === 'intriganka') {
        if (picks[id]) {
          ids.forEach(x => {
            if (x !== id && picks[x] === id && picks[id] !== x) {
              delta[id] += 1;
              delta[x] -= 1;
            }
          });
        }
      }
    });

    ids.forEach(id => {
      room.game.noMatchStreak[id] = matchOf[id] ? 0 : (room.game.noMatchStreak[id] || 0) + 1;
    });

    const newlyInfected = [];
    if (room.game.mlmOwnerId) {
      ids.forEach(id => {
        const partner = matchOf[id];
        if (!partner) return;
        if (room.game.infected.has(id) && !room.game.infected.has(partner)) {
          room.game.infected.add(partner);
          newlyInfected.push(partner);
        }
      });
    }

    ids.forEach(id => {
      const player = players.find(p => p.id === id);
      if (player) player.score += delta[id];
    });

    const allInfectedNow = !!room.game.mlmOwnerId && ids.length > 0 && ids.every(id => room.game.infected.has(id));

    return { matchOf, delta, newlyInfected, allInfectedNow };
  }

  // После 2-й ночи раскрывается роль текущего лидера, дальше — следующего
  // по очкам среди ещё не раскрытых, по одному за ночь.
  function maybeRevealRole(room) {
    if (room.game.night < 2) return null;
    const candidates = room.players
      .filter(p => !room.game.revealedRoles.has(p.id))
      .sort((a, b) => b.score - a.score);
    if (!candidates.length) return null;
    const chosen = candidates[0];
    room.game.revealedRoles.add(chosen.id);
    const roleKey = room.game.rolesByPlayerId[chosen.id];
    return { playerId: chosen.id, playerName: chosen.name, playerAvatar: chosen.avatar, role: roleKey, ...ROLES[roleKey] };
  }

  // Пары для поэтапного раскрытия — не только взаимные мэтчи, но и
  // невзаимные попытки (кто-то выбрал, а его не выбрали в ответ), чтобы у
  // каждого "свидания" — и удачного, и нет — была своя анимированная сцена
  // с перепиской и итогом. aId — тот, чей это выбор ("отправил запрос"),
  // bId — тот, кого выбрали. Взаимный мэтч показывается один раз (не с
  // обеих сторон): как только пара (A,B) отмечена как мэтч, собственный
  // выбор B (тот же A) при обходе дальше пропускается.
  function computeRevealPairs(players, matchOf, picks) {
    const pairs = [];
    const settled = new Set(); // id, чей исходящий выбор уже показан (как часть мэтча)
    players.forEach(p => {
      const targetId = picks[p.id];
      if (!targetId || settled.has(p.id)) return;
      if (matchOf[p.id] === targetId) {
        settled.add(p.id);
        settled.add(targetId);
        pairs.push({ aId: p.id, bId: targetId, kind: 'match' });
      } else {
        pairs.push({ aId: p.id, bId: targetId, kind: 'crush' });
      }
    });
    return pairs;
  }

  // Собирает данные ровно для ТЕКУЩЕГО шага раскрытия (room.game.revealStep)
  // из уже посчитанных данных ночи (room.game.lastReveal) — пересчитывать
  // ничего не нужно, шаг лишь выбирает нужный срез.
  // 0 — обзор "кто с кем", 1..pairs.length — переписка одной пары,
  // pairs.length+1 — финальный итог (очки/раскрытая роль/заражение).
  function buildRevealStepPayload(room) {
    const reveal = room.game.lastReveal;
    const pairs = reveal.revealPairs;
    const stepIndex = room.game.revealStep;
    const totalSteps = pairs.length + 2;
    const base = { night: reveal.night, totalNights: reveal.totalNights, timeUp: reveal.timeUp, stepIndex, totalSteps };

    if (stepIndex === 0) {
      return {
        ...base,
        kind: 'overview',
        players: reveal.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, matchedWith: p.matchedWith, pickedId: p.pickedId }))
      };
    }
    if (stepIndex <= pairs.length) {
      const { aId, bId, kind: pairKind } = pairs[stepIndex - 1];
      const a = reveal.players.find(p => p.id === aId);
      const b = reveal.players.find(p => p.id === bId);
      const isMatch = pairKind === 'match';
      const messages = reveal.messages.filter(m => (m.from === aId && m.to === bId) || (m.from === bId && m.to === aId));
      return {
        ...base,
        kind: 'pair',
        pairKind,
        a: { id: a.id, name: a.name, avatar: a.avatar, delta: a.delta },
        b: { id: b.id, name: b.name, avatar: b.avatar, delta: isMatch ? b.delta : null },
        messages,
        infectedA: isMatch && reveal.newlyInfected.includes(aId),
        infectedB: isMatch && reveal.newlyInfected.includes(bId)
      };
    }
    return {
      ...base,
      kind: 'final',
      players: reveal.players,
      revealedRole: reveal.revealedRole,
      newlyInfected: reveal.newlyInfected,
      mlmWin: reveal.mlmWin
    };
  }

  function finalizePicking(room, timeUp) {
    clearRoomTimer(room);
    room.players.forEach(p => {
      if (!(p.id in room.game.picks)) room.game.picks[p.id] = null;
    });

    const result = resolveNight(room);
    const revealedRole = maybeRevealRole(room);
    const players = room.players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      pickedId: room.game.picks[p.id],
      matchedWith: result.matchOf[p.id] || null,
      delta: result.delta[p.id] || 0,
      score: p.score
    }));

    room.game.lastReveal = {
      night: room.game.night,
      totalNights: TOTAL_NIGHTS,
      timeUp: !!timeUp,
      messages: room.game.messages,
      players,
      revealPairs: computeRevealPairs(players, result.matchOf, room.game.picks),
      revealedRole,
      newlyInfected: result.newlyInfected,
      mlmWin: !!result.allInfectedNow
    };
    room.game.revealStep = 0;
    room.phase = 'reveal';

    io.to(room.code).emit('night_reveal_step', buildRevealStepPayload(room));
    broadcastRoom(room);
  }

  // Полные объекты ролей (имя/иконка/описание) по playerId — используется и
  // в live-событии game_finished, и при rejoin на фазе 'end', чтобы
  // переподключившийся видел те же подписи ролей, что и все остальные.
  function enrichedRoles(room) {
    const result = {};
    if (!room.game) return result;
    Object.keys(room.game.rolesByPlayerId).forEach((playerId) => {
      const roleKey = room.game.rolesByPlayerId[playerId];
      result[playerId] = { role: roleKey, ...ROLES[roleKey] };
    });
    return result;
  }

  function finishGame(room, specialWinner) {
    clearRoomTimer(room);
    room.phase = 'end';
    if (room.game) room.game.specialWinner = specialWinner || null;
    const partyStandings = party.recordResult(
      room.code,
      'skuf',
      room.players.map(p => ({ name: p.name, avatar: p.avatar, points: p.score }))
    );
    io.to(room.code).emit('game_finished', {
      players: publicPlayers(room),
      partyStandings,
      specialWinner: specialWinner || null,
      rolesByPlayerId: enrichedRoles(room)
    });
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
    if (room.phase === 'roles' && room.readyIds) {
      room.readyIds.delete(playerId);
      if (room.readyIds.size >= room.players.length) {
        startMessagingPhase(room);
        return;
      }
    }
    if (room.phase === 'picking' && room.game && room.game.picks) {
      delete room.game.picks[playerId];
      io.to(room.code).emit('pick_progress', { count: Object.keys(room.game.picks).length, total: room.players.length });
      if (Object.keys(room.game.picks).length >= room.players.length) {
        finalizePicking(room);
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
      const wanted = (partyCode || '').toUpperCase().trim();
      const code = wanted && !rooms.has(wanted) ? wanted : makeRoomCode(rooms);
      const playerId = makePlayerId();
      const room = {
        code,
        hostId: playerId,
        players: [{ id: playerId, socketId: socket.id, name: playerName, avatar: sanitizeAvatar(avatar), score: 0, connected: true, disconnectTimer: null }],
        settings: {},
        phase: 'lobby', // lobby | roles | messaging | picking | reveal | end | skipped
        game: null,
        readyIds: new Set(),
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

      if (room.game && room.game.rolesByPlayerId && room.game.rolesByPlayerId[player.id] && room.phase !== 'lobby') {
        const roleKey = room.game.rolesByPlayerId[player.id];
        payload.yourRole = { role: roleKey, ...ROLES[roleKey] };
      }

      if (room.phase === 'messaging') {
        payload.messaging = {
          night: room.game.night,
          totalNights: TOTAL_NIGHTS,
          endsAt: room.game.messagingEndsAt,
          totalMs: MESSAGING_MS,
          maxMessages: MAX_MESSAGES_PER_NIGHT,
          players: room.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar })),
          myMessages: room.game.messages.filter(m => m.from === player.id || m.to === player.id)
        };
      } else if (room.phase === 'picking') {
        payload.picking = {
          night: room.game.night,
          endsAt: room.game.pickingEndsAt,
          totalMs: PICKING_MS,
          players: room.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar })),
          alreadyPicked: Object.prototype.hasOwnProperty.call(room.game.picks, player.id)
        };
      } else if (room.phase === 'reveal') {
        payload.reveal = buildRevealStepPayload(room);
      } else if (room.phase === 'end') {
        payload.partyStandings = party.getStandings(room.code);
        payload.rolesByPlayerId = enrichedRoles(room);
        payload.specialWinner = room.game ? (room.game.specialWinner || null) : null;
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
      if (room.players.length < 3) return;

      const chosenRoleKeys = shuffle(Object.keys(ROLES)).slice(0, room.players.length);
      const rolesByPlayerId = {};
      room.players.forEach((p, i) => {
        rolesByPlayerId[p.id] = chosenRoleKeys[i];
        p.score = 0;
      });
      const mlmOwnerId = Object.keys(rolesByPlayerId).find(id => rolesByPlayerId[id] === 'mlm') || null;

      room.game = {
        rolesByPlayerId,
        night: 1,
        messages: [],
        picks: {},
        noMatchStreak: {},
        vanillaUsed: new Set(),
        infected: new Set(mlmOwnerId ? [mlmOwnerId] : []),
        mlmOwnerId,
        revealedRoles: new Set(),
        lastReveal: null,
        messagingEndsAt: null,
        pickingEndsAt: null
      };
      room.phase = 'roles';
      room.readyIds = new Set();
      room.skipVotes.clear();

      room.players.forEach(p => {
        const roleKey = rolesByPlayerId[p.id];
        emitToPlayer(p, 'your_role', { role: roleKey, ...ROLES[roleKey] });
      });

      broadcastRoom(room);
    });

    socket.on('player_ready', () => {
      const room = getRoom(socket);
      if (!room || room.phase !== 'roles') return;
      const player = getPlayer(room, socket);
      if (!player) return;
      room.readyIds.add(player.id);
      io.to(room.code).emit('ready_update', { readyCount: room.readyIds.size, total: room.players.length });
      if (room.readyIds.size >= room.players.length) startMessagingPhase(room);
    });

    socket.on('force_start_night', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'roles') return;
      startMessagingPhase(room);
    });

    socket.on('send_message', ({ to, text } = {}) => {
      const room = getRoom(socket);
      if (!room || room.phase !== 'messaging') return;
      const player = getPlayer(room, socket);
      if (!player) return;
      const recipient = room.players.find(p => p.id === to);
      if (!recipient || recipient.id === player.id) return;
      const cleanText = (text || '').trim().slice(0, MAX_MESSAGE_LEN);
      if (!cleanText) return;
      const sentSoFar = room.game.messages.filter(m => m.from === player.id).length;
      if (sentSoFar >= MAX_MESSAGES_PER_NIGHT) return;
      const msg = { from: player.id, to: recipient.id, text: cleanText, ts: Date.now() };
      room.game.messages.push(msg);
      emitToPlayer(player, 'message_sent', msg);
      emitToPlayer(recipient, 'message_received', msg);
    });

    socket.on('force_start_picking', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'messaging') return;
      startPickingPhase(room);
    });

    socket.on('submit_pick', ({ pickedId } = {}) => {
      const room = getRoom(socket);
      if (!room || room.phase !== 'picking') return;
      const player = getPlayer(room, socket);
      if (!player) return;
      if (Object.prototype.hasOwnProperty.call(room.game.picks, player.id)) return;
      const valid = !pickedId || room.players.some(p => p.id === pickedId && p.id !== player.id);
      if (!valid) return;
      room.game.picks[player.id] = pickedId || null;
      io.to(room.code).emit('pick_progress', { count: Object.keys(room.game.picks).length, total: room.players.length });
      if (Object.keys(room.game.picks).length >= room.players.length) finalizePicking(room);
    });

    socket.on('force_finish_picking', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'picking') return;
      finalizePicking(room);
    });

    socket.on('next_reveal_step', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'reveal' || !room.game.lastReveal) return;
      const totalSteps = room.game.lastReveal.revealPairs.length + 2;
      if (room.game.revealStep >= totalSteps - 1) return; // на последнем шаге — используйте next_night
      room.game.revealStep += 1;
      io.to(room.code).emit('night_reveal_step', buildRevealStepPayload(room));
    });

    socket.on('next_night', () => {
      const room = getRoom(socket);
      if (!room || !isHost(room, socket) || room.phase !== 'reveal') return;
      const reveal = room.game.lastReveal;
      // Победа МЛМ-щицы — мгновенная и вне очереди ночей, даже если это не
      // последняя из 5, но раскрытие текущей ночи всё равно доигрывается
      // до конца (до финального шага), прежде чем сюда попасть.
      if (reveal && reveal.mlmWin) {
        const winner = room.players.find(p => p.id === room.game.mlmOwnerId);
        finishGame(room, winner ? { id: winner.id, name: winner.name, avatar: winner.avatar } : null);
        return;
      }
      if (room.game.night >= TOTAL_NIGHTS) {
        finishGame(room);
        return;
      }
      room.game.night += 1;
      startMessagingPhase(room);
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

module.exports = { registerSkufGame };
