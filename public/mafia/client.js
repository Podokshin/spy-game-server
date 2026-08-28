(() => {
  'use strict';

  const AVATARS = ['🦊', '🐼', '🐵', '🦁', '🐯', '🐨', '🐰', '🦄', '🐲', '🐙', '🦉', '🐺', '🐧', '🦖', '🐝', '🦋', '🐳', '🦅', '🐢', '🐬', '🦔', '🐔', '🐸', '🦈'];
  const SESSION_KEY = 'mafia_online_session_v1';

  const app = document.getElementById('app');

  const screens = {
    menu: document.getElementById('screen-menu'),
    lobby: document.getElementById('screen-lobby'),
    role: document.getElementById('screen-role'),
    night: document.getElementById('screen-night'),
    day: document.getElementById('screen-day'),
    voting: document.getElementById('screen-voting'),
    end: document.getElementById('screen-end'),
    skipped: document.getElementById('screen-skipped')
  };

  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
    el.skipVoteBtn.classList.toggle('hidden', ['role', 'night', 'day', 'voting'].indexOf(name) === -1);
  }

  const el = {
    menuSubtitle: document.getElementById('menuSubtitle'),
    inviteBanner: document.getElementById('inviteBanner'),
    inviteCodeDisplay: document.getElementById('inviteCodeDisplay'),
    playerName: document.getElementById('playerName'),
    avatarGrid: document.getElementById('avatarGrid'),
    createRoomBtn: document.getElementById('createRoomBtn'),
    menuDivider: document.getElementById('menuDivider'),
    joinCodeField: document.getElementById('joinCodeField'),
    joinCode: document.getElementById('joinCode'),
    joinRoomBtn: document.getElementById('joinRoomBtn'),
    switchModeLink: document.getElementById('switchModeLink'),
    menuError: document.getElementById('menuError'),

    roomCodeDisplay: document.getElementById('roomCodeDisplay'),
    copyLinkBtn: document.getElementById('copyLinkBtn'),
    playerCount: document.getElementById('playerCount'),
    playersList: document.getElementById('playersList'),
    nightSecondsInput: document.getElementById('nightSecondsInput'),
    discussionSecondsInput: document.getElementById('discussionSecondsInput'),
    startGameBtn: document.getElementById('startGameBtn'),
    waitingHostHint: document.getElementById('waitingHostHint'),
    needMorePlayersHint: document.getElementById('needMorePlayersHint'),
    leaveRoomBtn: document.getElementById('leaveRoomBtn'),
    lobbyError: document.getElementById('lobbyError'),

    roleCard: document.getElementById('roleCard'),
    roleTitle: document.getElementById('roleTitle'),
    roleHint: document.getElementById('roleHint'),
    roleTeammates: document.getElementById('roleTeammates'),
    roleContinueBtn: document.getElementById('roleContinueBtn'),

    nightRound: document.getElementById('nightRound'),
    nightTimerDisplay: document.getElementById('nightTimerDisplay'),
    nightActionArea: document.getElementById('nightActionArea'),
    nightWaitHint: document.getElementById('nightWaitHint'),
    forceEndNightBtn: document.getElementById('forceEndNightBtn'),

    dayRound: document.getElementById('dayRound'),
    dayVictimLine: document.getElementById('dayVictimLine'),
    dayTimerDisplay: document.getElementById('dayTimerDisplay'),
    forceEndDiscussionBtn: document.getElementById('forceEndDiscussionBtn'),

    voteOptions: document.getElementById('voteOptions'),
    voteStatusHint: document.getElementById('voteStatusHint'),
    forceFinishVoteBtn: document.getElementById('forceFinishVoteBtn'),

    endTitle: document.getElementById('endTitle'),
    rolesRevealList: document.getElementById('rolesRevealList'),
    playAgainBtn: document.getElementById('playAgainBtn'),
    waitPlayAgainHint: document.getElementById('waitPlayAgainHint'),
    leaveRoomBtn2: document.getElementById('leaveRoomBtn2'),

    skipVoteBtn: document.getElementById('skipVoteBtn'),
    skipVoteCount: document.getElementById('skipVoteCount'),
    skipVoteNeeded: document.getElementById('skipVoteNeeded'),
    leaveRoomBtnSkip: document.getElementById('leaveRoomBtnSkip')
  };

  const socket = io('/mafia');

  let currentRoom = null;
  let isHost = false;
  let myPlayerId = null;
  let latestPlayers = [];
  let selectedAvatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
  let hasConnectedBefore = false;
  let tickHandle = null;
  let myRole = null;
  let selectedVoteTarget = undefined;

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- Session persistence ----------
  function saveSession() {
    if (!currentRoom || !myPlayerId) return;
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ roomCode: currentRoom.code, playerId: myPlayerId })); } catch (e) { /* ignore */ }
  }
  function loadSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  }

  // ---------- Avatar picker ----------
  AVATARS.forEach(avatar => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'avatar-btn' + (avatar === selectedAvatar ? ' active' : '');
    btn.textContent = avatar;
    btn.setAttribute('aria-label', 'Аватар ' + avatar);
    btn.addEventListener('click', () => {
      selectedAvatar = avatar;
      el.avatarGrid.querySelectorAll('.avatar-btn').forEach(b => b.classList.toggle('active', b === btn));
    });
    el.avatarGrid.appendChild(btn);
  });

  // ---------- Invite link ----------
  const DEFAULT_MENU_SUBTITLE = el.menuSubtitle.textContent;
  const urlParams = new URLSearchParams(location.search);
  const inviteCode = (urlParams.get('room') || '').toUpperCase().trim();

  function applyInviteMode(code) {
    if (code) {
      el.joinCode.value = code;
      el.inviteCodeDisplay.textContent = code;
      el.inviteBanner.classList.remove('hidden');
      el.menuSubtitle.textContent = 'Вас пригласили сыграть! Впишите имя, выберите аватар и присоединяйтесь.';
      el.createRoomBtn.classList.add('hidden');
      el.menuDivider.classList.add('hidden');
      el.joinCodeField.classList.add('hidden');
      el.joinRoomBtn.classList.remove('secondary-btn');
      el.joinRoomBtn.classList.add('primary-btn');
      el.switchModeLink.classList.remove('hidden');
    } else {
      el.inviteBanner.classList.add('hidden');
      el.menuSubtitle.textContent = DEFAULT_MENU_SUBTITLE;
      el.createRoomBtn.classList.remove('hidden');
      el.menuDivider.classList.remove('hidden');
      el.joinCodeField.classList.remove('hidden');
      el.joinRoomBtn.classList.add('secondary-btn');
      el.joinRoomBtn.classList.remove('primary-btn');
      el.switchModeLink.classList.add('hidden');
    }
  }
  applyInviteMode(inviteCode);
  el.switchModeLink.addEventListener('click', () => applyInviteMode(''));

  function showMenuError(msg) {
    el.menuError.textContent = msg;
    el.menuError.classList.remove('hidden');
  }
  function clearMenuError() {
    el.menuError.classList.add('hidden');
  }

  // ---------- «Вечер игр»: пришли сюда по кнопке "Следующая игра" ----------
  const partyParams = window.PartyHub ? window.PartyHub.getPartyParams() : null;
  if (partyParams) {
    if (partyParams.name) el.playerName.value = partyParams.name;
    if (partyParams.avatar) {
      selectedAvatar = partyParams.avatar;
      el.avatarGrid.querySelectorAll('.avatar-btn').forEach(b => b.classList.toggle('active', b.textContent === partyParams.avatar));
    }
    if (partyParams.isHost) {
      socket.emit('create_room', { name: partyParams.name, avatar: partyParams.avatar, partyCode: partyParams.code }, (res) => {
        if (!res || !res.ok) return showMenuError((res && res.error) || 'Не удалось создать комнату');
        myPlayerId = res.playerId;
        currentRoom = res;
        isHost = true;
        saveSession();
        applyRoomUpdate(res);
      });
    } else {
      let attemptsLeft = 10;
      const tryJoin = () => {
        socket.emit('join_room', { code: partyParams.code, name: partyParams.name, avatar: partyParams.avatar }, (res) => {
          if (res && res.ok) {
            myPlayerId = res.playerId;
            currentRoom = res;
            isHost = false;
            saveSession();
            applyRoomUpdate(res);
            return;
          }
          attemptsLeft -= 1;
          if (attemptsLeft > 0) {
            setTimeout(tryJoin, 500);
          } else {
            showMenuError((res && res.error) || 'Не удалось присоединиться к следующей игре — попробуйте войти по коду вручную');
          }
        });
      };
      tryJoin();
    }
  }

  el.createRoomBtn.addEventListener('click', () => {
    clearMenuError();
    const name = el.playerName.value.trim();
    if (!name) return showMenuError('Введите имя');
    socket.emit('create_room', { name, avatar: selectedAvatar, partyCode: partyParams ? partyParams.code : undefined }, (res) => {
      if (!res || !res.ok) return showMenuError((res && res.error) || 'Не удалось создать комнату');
      myPlayerId = res.playerId;
      currentRoom = res;
      isHost = true;
      saveSession();
      applyRoomUpdate(res);
    });
  });

  el.joinRoomBtn.addEventListener('click', () => {
    clearMenuError();
    const name = el.playerName.value.trim();
    const code = el.joinCode.value.trim().toUpperCase();
    if (!name) return showMenuError('Введите имя');
    if (!code) return showMenuError('Введите код комнаты');
    socket.emit('join_room', { code, name, avatar: selectedAvatar }, (res) => {
      if (!res || !res.ok) return showMenuError((res && res.error) || 'Не удалось присоединиться');
      myPlayerId = res.playerId;
      currentRoom = res;
      isHost = false;
      saveSession();
      applyRoomUpdate(res);
    });
  });

  // ---------- Lobby ----------
  el.copyLinkBtn.addEventListener('click', () => {
    if (!currentRoom) return;
    const url = `${location.origin}${location.pathname}?room=${currentRoom.code}`;
    navigator.clipboard && navigator.clipboard.writeText(url).catch(() => {});
    el.copyLinkBtn.textContent = '✅ Скопировано!';
    setTimeout(() => { el.copyLinkBtn.textContent = '🔗 Скопировать ссылку-приглашение'; }, 1800);
  });

  function pushSettings() {
    socket.emit('update_settings', {
      nightSeconds: parseInt(el.nightSecondsInput.value, 10) || 45,
      discussionSeconds: parseInt(el.discussionSecondsInput.value, 10) || 90
    });
  }
  el.nightSecondsInput.addEventListener('change', () => { if (isHost) pushSettings(); });
  el.discussionSecondsInput.addEventListener('change', () => { if (isHost) pushSettings(); });

  el.startGameBtn.addEventListener('click', () => socket.emit('start_game'));

  function renderLobby(room) {
    el.roomCodeDisplay.textContent = room.code;
    el.playerCount.textContent = room.players.length;
    el.playersList.innerHTML = room.players.map(p => `
      <span class="player-chip${p.connected === false ? ' disconnected' : ''}"><span class="player-avatar">${escapeHtml(p.avatar || '🙂')}</span> ${escapeHtml(p.name)}${p.isHost ? ' <span class="host-tag">★ хост</span>' : ''}${p.connected === false ? ' ⏳' : ''}</span>
    `).join('');

    const enough = room.players.length >= 4;
    el.startGameBtn.classList.toggle('hidden', !isHost);
    el.startGameBtn.disabled = !enough;
    el.waitingHostHint.classList.toggle('hidden', isHost);
    el.needMorePlayersHint.classList.toggle('hidden', enough);

    if (isHost) {
      el.nightSecondsInput.value = room.settings.nightSeconds;
      el.discussionSecondsInput.value = room.settings.discussionSeconds;
      el.nightSecondsInput.disabled = false;
      el.discussionSecondsInput.disabled = false;
    } else {
      el.nightSecondsInput.value = room.settings.nightSeconds;
      el.discussionSecondsInput.value = room.settings.discussionSeconds;
      el.nightSecondsInput.disabled = true;
      el.discussionSecondsInput.disabled = true;
    }
  }

  el.leaveRoomBtn.addEventListener('click', leaveRoom);
  el.leaveRoomBtn2.addEventListener('click', leaveRoom);
  el.leaveRoomBtnSkip.addEventListener('click', leaveRoom);
  function leaveRoom() {
    socket.emit('leave_room');
    clearSession();
    currentRoom = null;
    myPlayerId = null;
    myRole = null;
    location.href = location.pathname;
  }

  function applyRoomUpdate(room) {
    currentRoom = Object.assign({}, currentRoom, room);
    latestPlayers = room.players;
    isHost = room.players.some(p => p.id === myPlayerId && p.isHost);

    if (room.phase === 'lobby') {
      renderLobby(room);
      showScreen('lobby');
    }

    refreshHostControls(room.phase);
  }

  // Пере-применяет видимость host-only кнопок для текущего экрана — нужно,
  // например, после миграции хоста (room_update может прийти вне обычных
  // переходов фаз, и у нового хоста должны сразу появиться его кнопки).
  function refreshHostControls(phase) {
    if (phase === 'night') {
      el.forceEndNightBtn.classList.toggle('hidden', !isHost);
    } else if (phase === 'day') {
      el.forceEndDiscussionBtn.classList.toggle('hidden', !isHost);
    } else if (phase === 'voting') {
      el.forceFinishVoteBtn.classList.toggle('hidden', !isHost);
    } else if (phase === 'end') {
      el.playAgainBtn.classList.toggle('hidden', !isHost);
      el.waitPlayAgainHint.classList.toggle('hidden', isHost);
    }
  }

  socket.on('room_update', (room) => applyRoomUpdate(room));

  // ---------- Role reveal ----------
  const ROLE_HINTS = {
    mafia: 'Ночью выбирайте вместе с сообщниками, кого устранить. Днём притворяйтесь мирным жителем.',
    sheriff: 'Каждую ночь можете тайно проверить одного игрока — мафия он или нет.',
    doctor: 'Каждую ночь можете выбрать, кого спасти от нападения мафии (можно себя).',
    civilian: 'У вас нет ночных действий. Слушайте, наблюдайте и голосуйте с умом днём.'
  };

  socket.on('your_role', (data) => {
    myRole = data.role;
    el.roleCard.className = 'role-card ' + data.role;
    el.roleTitle.textContent = data.label;
    el.roleHint.textContent = ROLE_HINTS[data.role] || '';
    if (data.role === 'mafia' && data.teammates && data.teammates.length) {
      el.roleTeammates.innerHTML = '<p class="hint">Ваши сообщники: ' +
        data.teammates.map(t => `${escapeHtml(t.avatar)} ${escapeHtml(t.name)}`).join(', ') + '</p>';
    } else {
      el.roleTeammates.innerHTML = '';
    }
    showScreen('role');
  });

  el.roleContinueBtn.addEventListener('click', () => {
    // Ждём события night_started / your_night_turn — экран сменится само по себе
  });

  // ---------- Timer helper ----------
  function startTicking(displayEl, endsAt) {
    stopTicking();
    function tick() {
      const remaining = Math.max(0, endsAt - Date.now());
      const s = Math.ceil(remaining / 1000);
      displayEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (remaining <= 0) stopTicking();
    }
    tick();
    tickHandle = setInterval(tick, 250);
  }
  function stopTicking() {
    if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
  }

  // ---------- Night ----------
  function playerBriefChip(p, extra) {
    return `<span class="player-chip">${escapeHtml(p.avatar || '🙂')} ${escapeHtml(p.name)}${extra || ''}</span>`;
  }

  socket.on('night_started', (data) => {
    saveSession();
    el.nightRound.textContent = `#${data.round}`;
    startTicking(el.nightTimerDisplay, data.endsAt);
    el.nightActionArea.innerHTML = '';
    el.nightWaitHint.classList.remove('hidden');
    el.forceEndNightBtn.classList.toggle('hidden', !isHost);
    showScreen('night');
  });

  socket.on('your_night_turn', (data) => {
    el.nightWaitHint.classList.add('hidden');
    renderNightAction(data);
    showScreen('night');
  });

  function renderNightAction(data) {
    if (data.role === 'mafia') {
      el.nightActionArea.innerHTML = `<p class="night-action-hint">Выберите, кого устранить сегодня ночью:</p>
        <div class="vote-options" id="mafiaTargets"></div>`;
      const wrap = document.getElementById('mafiaTargets');
      data.targets.forEach(t => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'vote-option-btn';
        btn.innerHTML = `${escapeHtml(t.avatar || '🙂')} ${escapeHtml(t.name)}`;
        btn.addEventListener('click', () => {
          wrap.querySelectorAll('.vote-option-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          socket.emit('mafia_vote', { targetId: t.id });
        });
        wrap.appendChild(btn);
      });
    } else if (data.role === 'doctor') {
      el.nightActionArea.innerHTML = `<p class="night-action-hint">Кого спасти этой ночью?</p>
        <div class="vote-options" id="doctorTargets"></div>`;
      const wrap = document.getElementById('doctorTargets');
      data.targets.forEach(t => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'vote-option-btn';
        btn.innerHTML = `${escapeHtml(t.avatar || '🙂')} ${escapeHtml(t.name)}`;
        btn.addEventListener('click', () => {
          wrap.querySelectorAll('.vote-option-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          socket.emit('doctor_save', { targetId: t.id });
        });
        wrap.appendChild(btn);
      });
    } else if (data.role === 'sheriff') {
      el.nightActionArea.innerHTML = `<p class="night-action-hint">Кого проверить этой ночью?</p>
        <div class="vote-options" id="sheriffTargets"></div>
        <p class="hint hidden" id="sheriffResult"></p>`;
      const wrap = document.getElementById('sheriffTargets');
      data.targets.forEach(t => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'vote-option-btn';
        btn.innerHTML = `${escapeHtml(t.avatar || '🙂')} ${escapeHtml(t.name)}`;
        btn.addEventListener('click', () => {
          wrap.querySelectorAll('.vote-option-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          wrap.querySelectorAll('.vote-option-btn').forEach(b => b.disabled = true);
          socket.emit('sheriff_check', { targetId: t.id }, (res) => {
            const resultEl = document.getElementById('sheriffResult');
            if (res && res.ok) {
              resultEl.textContent = res.isMafia ? `${t.name} — связан с мафией! 🔴` : `${t.name} — не мафия. 🟢`;
              resultEl.classList.remove('hidden');
            }
          });
        });
        wrap.appendChild(btn);
      });
    } else {
      el.nightActionArea.innerHTML = '';
      el.nightWaitHint.classList.remove('hidden');
    }
  }

  el.forceEndNightBtn.addEventListener('click', () => {
    if (!confirm('Завершить ночь досрочно? Используйте, если кто-то с ролью пропал и не может завершить свой ход.')) return;
    socket.emit('force_end_night');
  });

  // ---------- Day ----------
  socket.on('day_started', (data) => {
    stopTicking();
    el.dayRound.textContent = `#${data.round}`;
    el.dayVictimLine.innerHTML = data.victim
      ? `Ночью погиб(ла): <b>${escapeHtml(data.victim.avatar)} ${escapeHtml(data.victim.name)}</b> — роль: <b>${escapeHtml(data.victim.role)}</b>`
      : 'Этой ночью никто не погиб — доктор угадал, или мафия не смогла договориться.';
    startTicking(el.dayTimerDisplay, data.endsAt);
    el.forceEndDiscussionBtn.classList.toggle('hidden', !isHost);
    showScreen('day');
  });

  el.forceEndDiscussionBtn.addEventListener('click', () => socket.emit('force_end_discussion'));

  // ---------- Voting ----------
  // Общая отрисовка кандидатов для голосования — используется и при обычном
  // старте голосования, и при восстановлении экрана после реконнекта.
  function renderVoteOptions(aliveList) {
    selectedVoteTarget = undefined;
    el.voteOptions.innerHTML = '';
    aliveList.forEach(p => {
      if (p.id === myPlayerId) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vote-option-btn';
      btn.innerHTML = `${escapeHtml(p.avatar || '🙂')} ${escapeHtml(p.name)}`;
      btn.addEventListener('click', () => {
        selectedVoteTarget = p.id;
        el.voteOptions.querySelectorAll('.vote-option-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        socket.emit('cast_vote', { targetId: p.id });
      });
      el.voteOptions.appendChild(btn);
    });
    const abstainBtn = document.createElement('button');
    abstainBtn.type = 'button';
    abstainBtn.className = 'vote-option-btn';
    abstainBtn.textContent = '🤷 Воздержаться';
    abstainBtn.addEventListener('click', () => {
      selectedVoteTarget = null;
      el.voteOptions.querySelectorAll('.vote-option-btn').forEach(b => b.classList.remove('selected'));
      abstainBtn.classList.add('selected');
      socket.emit('cast_vote', { targetId: null });
    });
    el.voteOptions.appendChild(abstainBtn);
  }

  socket.on('voting_started', (data) => {
    stopTicking();
    renderVoteOptions(data.alive);
    el.voteStatusHint.textContent = '';
    el.forceFinishVoteBtn.classList.toggle('hidden', !isHost);
    showScreen('voting');
  });

  socket.on('vote_update', ({ votedCount, total }) => {
    el.voteStatusHint.textContent = `Проголосовало: ${votedCount} из ${total}`;
  });

  el.forceFinishVoteBtn.addEventListener('click', () => socket.emit('force_finish_voting'));

  socket.on('voting_result', ({ eliminated }) => {
    el.voteStatusHint.textContent = eliminated
      ? `По итогам голосования выбывает: ${eliminated.avatar} ${eliminated.name} (${eliminated.role})`
      : 'Голоса разделились — никто не выбывает.';
  });

  // ---------- End ----------
  socket.on('game_over', ({ winner, roles, partyStandings }) => {
    stopTicking();
    el.endTitle.textContent = winner === 'mafia' ? '🔪 Победила мафия' : '🕊️ Победили мирные жители';
    el.rolesRevealList.innerHTML = roles.map(p => `
      <span class="player-chip${!p.alive ? ' dead' : ''}">${escapeHtml(p.avatar || '🙂')} ${escapeHtml(p.name)} <span class="role-tag">${escapeHtml(p.role)}</span></span>
    `).join('');
    el.playAgainBtn.classList.toggle('hidden', !isHost);
    el.waitPlayAgainHint.classList.toggle('hidden', isHost);
    showScreen('end');
    if (window.fireConfetti) window.fireConfetti();
    if (window.PartyHub) {
      window.PartyHub.renderPartySection(document.getElementById('partySection'), {
        currentKey: 'mafia',
        standings: partyStandings || [],
        isHost,
        onSelect: (gameKey) => socket.emit('select_next_game', { gameKey })
      });
    }
  });

  socket.on('next_game_selected', ({ gameKey }) => {
    if (window.PartyHub && currentRoom) {
      window.PartyHub.goToGame(gameKey, currentRoom.code, el.playerName.value, selectedAvatar, isHost);
    }
  });

  el.playAgainBtn.addEventListener('click', () => socket.emit('play_again'));

  // ---------- Голосование за пропуск игры ----------
  function updateSkipVoteUI(votes, needed, voterIds) {
    el.skipVoteCount.textContent = votes;
    el.skipVoteNeeded.textContent = needed;
    el.skipVoteBtn.classList.toggle('voted', Array.isArray(voterIds) && voterIds.includes(myPlayerId));
  }

  el.skipVoteBtn.addEventListener('click', () => {
    socket.emit('vote_skip');
  });

  socket.on('skip_vote_update', ({ votes, needed, voterIds }) => {
    updateSkipVoteUI(votes, needed, voterIds);
  });

  function renderSkippedScreen(players, partyStandings) {
    showScreen('skipped');
    if (window.PartyHub) {
      window.PartyHub.renderPartySection(document.getElementById('skippedPartySection'), {
        currentKey: 'mafia',
        standings: partyStandings || [],
        isHost,
        onSelect: (gameKey) => socket.emit('select_next_game', { gameKey })
      });
    }
  }

  socket.on('game_skipped', ({ players, partyStandings }) => {
    renderSkippedScreen(players, partyStandings);
  });

  // ---------- Reconnect ----------
  function attemptRejoin() {
    const saved = loadSession();
    if (!saved) return;
    socket.emit('rejoin', saved, (res) => {
      if (!res || !res.ok) { clearSession(); return; }
      myPlayerId = res.playerId;
      currentRoom = res;
      applyRoomUpdate(res);

      if (res.yourRole && res.phase !== 'lobby') {
        myRole = res.yourRole.role;
      }

      if (res.phase === 'night' && res.night) {
        el.nightRound.textContent = `#${res.night.round}`;
        startTicking(el.nightTimerDisplay, res.night.endsAt);
        showScreen('night');
      } else if (res.phase === 'day' && res.day) {
        el.dayRound.textContent = `#${res.day.round}`;
        el.dayVictimLine.innerHTML = res.day.victim
          ? `Ночью погиб(ла): <b>${escapeHtml(res.day.victim.avatar)} ${escapeHtml(res.day.victim.name)}</b> — роль: <b>${escapeHtml(res.day.victim.role)}</b>`
          : 'Этой ночью никто не погиб.';
        startTicking(el.dayTimerDisplay, res.day.endsAt);
        el.forceEndDiscussionBtn.classList.toggle('hidden', !isHost);
        showScreen('day');
      } else if (res.phase === 'voting' && res.voting) {
        stopTicking();
        renderVoteOptions(res.voting.alive);
        el.voteStatusHint.textContent = '';
        el.forceFinishVoteBtn.classList.toggle('hidden', !isHost);
        showScreen('voting');
      } else if (res.phase === 'end' && res.gameOver) {
        el.endTitle.textContent = res.gameOver.winner === 'mafia' ? '🔪 Победила мафия' : '🕊️ Победили мирные жители';
        el.rolesRevealList.innerHTML = res.gameOver.roles.map(p => `
          <span class="player-chip${!p.alive ? ' dead' : ''}">${escapeHtml(p.avatar || '🙂')} ${escapeHtml(p.name)} <span class="role-tag">${escapeHtml(p.role)}</span></span>
        `).join('');
        el.playAgainBtn.classList.toggle('hidden', !isHost);
        el.waitPlayAgainHint.classList.toggle('hidden', isHost);
        showScreen('end');
        if (window.PartyHub) {
          window.PartyHub.renderPartySection(document.getElementById('partySection'), {
            currentKey: 'mafia',
            standings: res.gameOver.partyStandings || [],
            isHost,
            onSelect: (gameKey) => socket.emit('select_next_game', { gameKey })
          });
        }
      } else if (res.phase === 'skipped' && res.skipped) {
        renderSkippedScreen(res.skipped.players, res.skipped.partyStandings);
      }

      if (res.skipVotes) {
        updateSkipVoteUI(res.skipVotes.votes, res.skipVotes.needed, res.skipVotes.voterIds);
      }
    });
  }

  socket.on('connect', () => {
    if (hasConnectedBefore) {
      if (currentRoom && myPlayerId) {
        saveSession();
        attemptRejoin();
      }
    } else {
      hasConnectedBefore = true;
      attemptRejoin();
    }
  });
})();
