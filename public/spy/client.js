(() => {
  'use strict';

  const CHARACTER_CATEGORY_META = [
    { key: 'mix', label: 'Микс', icon: '🎲' },
    { key: 'dota', label: 'Dota 2', icon: '⚔️' },
    { key: 'marvel', label: 'Marvel', icon: '🦸' },
    { key: 'anime', label: 'Аниме', icon: '🍥' },
    { key: 'games', label: 'Видеоигры', icon: '🎮' },
    { key: 'cartoons', label: 'Мультфильмы', icon: '🎬' },
    { key: 'sport', label: 'Спорт', icon: '⚽' }
  ];

  const PLACE_CATEGORY_META = [
    { key: 'mix', label: 'Микс', icon: '🎲' },
    { key: 'dota', label: 'Dota 2', icon: '⚔️' },
    { key: 'minecraft', label: 'Minecraft', icon: '🧱' },
    { key: 'valorant', label: 'Valorant / CS', icon: '🔫' }
  ];

  function subcategoryMetaFor(category) {
    return category === 'characters' ? CHARACTER_CATEGORY_META : PLACE_CATEGORY_META;
  }

  const AVATARS = ['🦊', '🐼', '🐵', '🦁', '🐯', '🐨', '🐰', '🦄', '🐲', '🐙', '🦉', '🐺', '🐧', '🦖', '🐝', '🦋', '🐳', '🦅', '🐢', '🐬', '🦔', '🐔', '🐸', '🦈'];

  const DISCUSS_HINTS = {
    places: 'Игроки по очереди рассказывают, что они «видят» на локации. Найдите шпиона.',
    characters: 'Игроки по очереди называют факт о персонаже. Найдите шпиона.'
  };

  const SESSION_KEY = 'spy_online_session_v1';

  const screens = {
    menu: document.getElementById('screen-menu'),
    lobby: document.getElementById('screen-lobby'),
    role: document.getElementById('screen-role'),
    discussion: document.getElementById('screen-discussion'),
    voting: document.getElementById('screen-voting'),
    end: document.getElementById('screen-end')
  };

  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
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
    lobbySettingsField: document.getElementById('lobbySettingsField'),
    lobbyCatBtns: document.querySelectorAll('#lobbySettingsField .cat-btn'),
    lobbySubcategoryField: document.getElementById('lobbySubcategoryField'),
    lobbySubcategoryToggle: document.getElementById('lobbySubcategoryToggle'),
    lobbyTwoSpies: document.getElementById('lobbyTwoSpies'),
    lobbyTimerEnabled: document.getElementById('lobbyTimerEnabled'),
    lobbyTimerMinutesField: document.getElementById('lobbyTimerMinutesField'),
    lobbyTimerMinutes: document.getElementById('lobbyTimerMinutes'),
    playerCountLabel: document.getElementById('playerCountLabel'),
    lobbyPlayersList: document.getElementById('lobbyPlayersList'),
    startGameBtn: document.getElementById('startGameBtn'),
    waitingHostHint: document.getElementById('waitingHostHint'),
    needMorePlayersHint: document.getElementById('needMorePlayersHint'),
    leaveRoomBtn: document.getElementById('leaveRoomBtn'),
    lobbyError: document.getElementById('lobbyError'),

    roleCard: document.getElementById('roleCard'),
    roleContent: document.getElementById('roleContent'),
    roleReadyBtn: document.getElementById('roleReadyBtn'),
    readyHint: document.getElementById('readyHint'),
    forceStartBtn: document.getElementById('forceStartBtn'),

    discussHint: document.getElementById('discussHint'),
    turnOrderList: document.getElementById('turnOrderList'),
    timerBlock: document.getElementById('timerBlock'),
    timerRing: document.getElementById('timerRing'),
    timerDisplay: document.getElementById('timerDisplay'),
    pauseBtn: document.getElementById('pauseBtn'),
    endDiscussionBtn: document.getElementById('endDiscussionBtn'),
    discussionWaitHint: document.getElementById('discussionWaitHint'),

    voteOptions: document.getElementById('voteOptions'),
    submitVoteBtn: document.getElementById('submitVoteBtn'),
    voteWaitHint: document.getElementById('voteWaitHint'),
    forceFinishVoteBtn: document.getElementById('forceFinishVoteBtn'),

    voteTallyField: document.getElementById('voteTallyField'),
    voteTallyList: document.getElementById('voteTallyList'),
    revealSpyStageBtn: document.getElementById('revealSpyStageBtn'),
    waitSpyHint: document.getElementById('waitSpyHint'),
    spyRevealField: document.getElementById('spyRevealField'),
    spyRevealLabel: document.getElementById('spyRevealLabel'),
    spyRevealList: document.getElementById('spyRevealList'),
    revealTopicStageBtn: document.getElementById('revealTopicStageBtn'),
    topicLine: document.getElementById('topicLine'),
    endTopicLabel: document.getElementById('endTopicLabel'),
    endLocation: document.getElementById('endLocation'),
    scoreboardField: document.getElementById('scoreboardField'),
    scoreboardList: document.getElementById('scoreboardList'),
    playAgainBtn: document.getElementById('playAgainBtn'),
    waitPlayAgainHint: document.getElementById('waitPlayAgainHint'),
    leaveRoomBtn2: document.getElementById('leaveRoomBtn2')
  };

  const socket = io();

  let currentRoom = null;
  let isHost = false;
  let myPlayerId = null;
  let latestPlayers = [];
  let lobbyCategory = 'places';
  let lobbySubCategory = 'mix';
  let selectedAvatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
  let selectedVoteTarget = null;
  let timerState = null; // { endsAt, totalMs, enabled, paused, remainingMs }
  let tickHandle = null;
  let hasConnectedBefore = false;

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- Session persistence (for reconnect) ----------
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
      el.joinRoomBtn.classList.remove('primary-btn');
      el.joinRoomBtn.classList.add('secondary-btn');
      el.switchModeLink.classList.add('hidden');
      history.replaceState(null, '', window.location.pathname);
    }
  }

  el.switchModeLink.addEventListener('click', () => applyInviteMode(null));

  const roomFromUrl = new URLSearchParams(window.location.search).get('room');
  if (roomFromUrl) {
    applyInviteMode(roomFromUrl.toUpperCase());
  }

  el.copyLinkBtn.addEventListener('click', () => {
    if (!currentRoom) return;
    const link = window.location.origin + window.location.pathname + '?room=' + currentRoom.code;
    const restoreLabel = () => { el.copyLinkBtn.textContent = '🔗 Скопировать ссылку-приглашение'; };
    navigator.clipboard.writeText(link).then(() => {
      el.copyLinkBtn.textContent = '✅ Ссылка скопирована!';
      setTimeout(restoreLabel, 1800);
    }).catch(() => {
      el.copyLinkBtn.textContent = link;
      setTimeout(restoreLabel, 3000);
    });
  });

  // ---------- Sound (generated, same as local game) ----------
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = Ctx ? new Ctx() : null;
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function beep(freq, startTime, duration, peakGain) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.02);
    gain.gain.linearRampToValueAtTime(0, startTime + duration);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }
  function playTimeUpSound() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    beep(660, now, 0.16, 0.28);
    beep(660, now + 0.22, 0.16, 0.28);
    beep(880, now + 0.44, 0.35, 0.3);
  }

  // ---------- Menu ----------
  el.createRoomBtn.addEventListener('click', () => {
    getAudioCtx();
    el.menuError.classList.add('hidden');
    socket.emit('create_room', { name: el.playerName.value, avatar: selectedAvatar }, (res) => {
      if (!res.ok) return showMenuError('Не удалось создать комнату');
      applyRoomUpdate(res);
      saveSession();
      showScreen('lobby');
    });
  });

  el.joinRoomBtn.addEventListener('click', () => {
    getAudioCtx();
    el.menuError.classList.add('hidden');
    socket.emit('join_room', { code: el.joinCode.value, name: el.playerName.value, avatar: selectedAvatar }, (res) => {
      if (!res.ok) return showMenuError(res.error || 'Не удалось присоединиться');
      applyRoomUpdate(res);
      saveSession();
      showScreen('lobby');
    });
  });

  function showMenuError(msg) {
    el.menuError.textContent = msg;
    el.menuError.classList.remove('hidden');
  }

  // ---------- Lobby ----------
  function rebuildSubcategoryButtons() {
    el.lobbySubcategoryToggle.innerHTML = '';
    subcategoryMetaFor(lobbyCategory).forEach(sub => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'subcat-btn';
      btn.dataset.subcategory = sub.key;
      btn.textContent = `${sub.icon} ${sub.label}`;
      btn.addEventListener('click', () => {
        if (!isHost) return;
        lobbySubCategory = sub.key;
        renderLobbySubcategoryChips();
        pushSettings();
      });
      el.lobbySubcategoryToggle.appendChild(btn);
    });
  }
  rebuildSubcategoryButtons();

  function renderLobbySubcategoryChips() {
    el.lobbySubcategoryToggle.querySelectorAll('.subcat-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.subcategory === lobbySubCategory);
    });
  }

  el.lobbyCatBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (!isHost) return;
      if (lobbyCategory !== btn.dataset.category) lobbySubCategory = 'mix'; // сброс темы при смене категории
      lobbyCategory = btn.dataset.category;
      renderLobbyCategoryButtons();
      pushSettings();
    });
  });

  function renderLobbyCategoryButtons() {
    el.lobbyCatBtns.forEach(b => b.classList.toggle('active', b.dataset.category === lobbyCategory));
    el.lobbySubcategoryField.classList.remove('hidden'); // тема доступна и для мест, и для персонажей
    rebuildSubcategoryButtons();
    renderLobbySubcategoryChips();
  }

  el.lobbyTwoSpies.addEventListener('change', () => { if (isHost) pushSettings(); });
  el.lobbyTimerEnabled.addEventListener('change', () => {
    if (!isHost) return;
    el.lobbyTimerMinutesField.classList.toggle('hidden', !el.lobbyTimerEnabled.checked);
    pushSettings();
  });
  el.lobbyTimerMinutes.addEventListener('change', () => { if (isHost) pushSettings(); });

  function pushSettings() {
    socket.emit('update_settings', {
      category: lobbyCategory,
      subCategory: lobbySubCategory,
      timerEnabled: el.lobbyTimerEnabled.checked,
      timerMinutes: parseInt(el.lobbyTimerMinutes.value, 10) || 8,
      twoSpies: el.lobbyTwoSpies.checked
    });
  }

  el.startGameBtn.addEventListener('click', () => {
    socket.emit('start_game');
  });

  function leaveRoom() {
    socket.emit('leave_room');
    currentRoom = null;
    isHost = false;
    myPlayerId = null;
    clearTimerTick();
    clearSession();
    applyInviteMode(null);
    showScreen('menu');
  }
  el.leaveRoomBtn.addEventListener('click', leaveRoom);
  el.leaveRoomBtn2.addEventListener('click', leaveRoom);

  function applyRoomUpdate(room) {
    currentRoom = room;
    latestPlayers = room.players;
    if (room.playerId) myPlayerId = room.playerId;
    isHost = room.players.some(p => p.id === myPlayerId && p.isHost);
    history.replaceState(null, '', '?room=' + room.code);
    saveSession();

    if (room.phase === 'lobby') {
      renderLobby(room);
      showScreen('lobby');
    }
  }

  function renderLobby(room) {
    el.roomCodeDisplay.textContent = room.code;
    el.playerCountLabel.textContent = room.players.length;
    el.lobbyPlayersList.innerHTML = room.players.map(p => `
      <span class="player-chip${p.connected === false ? ' disconnected' : ''}"><span class="player-avatar">${escapeHtml(p.avatar || '🙂')}</span> ${escapeHtml(p.name)}${p.isHost ? ' <span class="host-tag">★ хост</span>' : ''}${p.connected === false ? ' ⏳' : ''}</span>
    `).join('');

    lobbyCategory = room.settings.category;
    lobbySubCategory = room.settings.subCategory;
    renderLobbyCategoryButtons();
    renderLobbySubcategoryChips();
    el.lobbyTwoSpies.checked = !!room.settings.twoSpies;
    el.lobbyTimerEnabled.checked = room.settings.timerEnabled;
    el.lobbyTimerMinutes.value = room.settings.timerMinutes;
    el.lobbyTimerMinutesField.classList.toggle('hidden', !room.settings.timerEnabled);

    const controlsDisabled = !isHost;
    el.lobbyCatBtns.forEach(b => b.disabled = controlsDisabled);
    el.lobbySubcategoryToggle.querySelectorAll('.subcat-btn').forEach(b => b.disabled = controlsDisabled);
    el.lobbyTwoSpies.disabled = controlsDisabled;
    el.lobbyTimerEnabled.disabled = controlsDisabled;
    el.lobbyTimerMinutes.disabled = controlsDisabled;

    const enoughPlayers = room.players.length >= 3;
    el.startGameBtn.classList.toggle('hidden', !isHost);
    el.startGameBtn.disabled = !enoughPlayers;
    el.waitingHostHint.classList.toggle('hidden', isHost);
    el.needMorePlayersHint.classList.toggle('hidden', !isHost || enoughPlayers);
  }

  // ---------- Role reveal ----------
  function renderRoleCard(data) {
    el.roleCard.classList.remove('spy', 'normal');
    el.roleCard.classList.add(data.isSpy ? 'spy' : 'normal');

    if (data.isSpy) {
      let spyHint = data.category === 'characters'
        ? 'Ты не знаешь персонажа. Слушай факты, которые называют остальные, и попробуй понять, кто это — не спались.'
        : 'Ты не знаешь локацию. Слушай остальных, пытайся понять где вы находитесь — и не спались.';
      if (data.twoSpies) spyHint += ' В игре есть ещё один шпион, но ты не знаешь, кто это.';
      el.roleContent.innerHTML = `
        <p class="role-title">🕵️ ТЫ ШПИОН</p>
        <p class="role-hint">${spyHint}</p>
      `;
    } else if (data.category === 'characters') {
      el.roleContent.innerHTML = `
        <p class="role-location">🎭 ${escapeHtml(data.topicName)}</p>
        <p class="role-hint">Когда дойдёт очередь — назови один факт об этом персонаже, не называя его имя напрямую.</p>
      `;
    } else {
      el.roleContent.innerHTML = `
        <p class="role-location">📍 ${escapeHtml(data.topicName)}</p>
        <p class="role-role">🎭 Твоя роль: ${escapeHtml(data.role)}</p>
        <p class="role-hint">Не называй локацию напрямую — задавай и отвечай на вопросы намёками.</p>
      `;
    }

    el.roleReadyBtn.disabled = false;
    el.roleReadyBtn.classList.remove('hidden');
    el.readyHint.classList.add('hidden');
    el.forceStartBtn.classList.toggle('hidden', !isHost);
    showScreen('role');
  }

  socket.on('your_role', renderRoleCard);

  el.roleReadyBtn.addEventListener('click', () => {
    socket.emit('player_ready');
    el.roleReadyBtn.classList.add('hidden');
    el.readyHint.classList.remove('hidden');
    el.readyHint.textContent = 'Ждём остальных игроков…';
  });

  socket.on('ready_update', ({ readyCount, total }) => {
    if (!el.readyHint.classList.contains('hidden')) {
      el.readyHint.textContent = `Готовы: ${readyCount} из ${total}`;
    }
  });

  el.forceStartBtn.addEventListener('click', () => {
    socket.emit('force_start_discussion');
  });

  // ---------- Discussion / timer ----------
  function renderDiscussionScreen(data) {
    showScreen('discussion');
    el.discussHint.textContent = DISCUSS_HINTS[data.category] || DISCUSS_HINTS.places;
    el.turnOrderList.innerHTML = (data.turnOrder || []).map((p, i) => `
      <span class="player-chip"><span class="turn-num">${i + 1}</span> ${escapeHtml(p.avatar || '🙂')} ${escapeHtml(p.name)}</span>
    `).join('');
    timerState = {
      endsAt: data.endsAt,
      totalMs: data.totalMs,
      enabled: data.timerEnabled,
      remainingMs: data.remainingMs != null ? data.remainingMs : data.totalMs,
      paused: !!data.paused
    };
    el.timerBlock.classList.toggle('hidden', !data.timerEnabled);
    el.pauseBtn.classList.toggle('hidden', !isHost);
    el.pauseBtn.textContent = timerState.paused ? 'Продолжить' : 'Пауза';
    el.endDiscussionBtn.classList.toggle('hidden', !isHost);
    el.discussionWaitHint.classList.toggle('hidden', isHost);

    if (data.timerEnabled) startTimerTick();
  }

  socket.on('discussion_started', renderDiscussionScreen);

  function startTimerTick() {
    clearTimerTick();
    updateTimerFromState();
    tickHandle = setInterval(updateTimerFromState, 250);
  }
  function clearTimerTick() {
    if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
  }

  function updateTimerFromState() {
    if (!timerState || !timerState.enabled) return;
    let remaining;
    if (timerState.paused) {
      remaining = timerState.remainingMs;
    } else {
      remaining = Math.max(0, timerState.endsAt - Date.now());
    }
    const totalSeconds = Math.ceil(remaining / 1000);
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    el.timerDisplay.textContent = `${m}:${s}`;
    const isWarning = remaining <= 30000;
    el.timerDisplay.classList.toggle('warning', isWarning);
    el.timerRing.classList.toggle('warning', isWarning);
    const progress = timerState.totalMs > 0 ? remaining / timerState.totalMs : 0;
    el.timerRing.style.setProperty('--progress', progress);
  }

  socket.on('timer_paused', ({ remainingMs }) => {
    if (!timerState) return;
    timerState.paused = true;
    timerState.remainingMs = remainingMs;
    updateTimerFromState();
    el.pauseBtn.textContent = 'Продолжить';
  });

  socket.on('timer_resumed', ({ endsAt }) => {
    if (!timerState) return;
    timerState.paused = false;
    timerState.endsAt = endsAt;
    el.pauseBtn.textContent = 'Пауза';
  });

  el.pauseBtn.addEventListener('click', () => {
    socket.emit('toggle_pause');
  });

  el.endDiscussionBtn.addEventListener('click', () => {
    socket.emit('end_discussion');
  });

  // ---------- Voting ----------
  function renderVotingScreen(players) {
    selectedVoteTarget = null;
    el.submitVoteBtn.disabled = true;
    el.submitVoteBtn.classList.remove('hidden');
    el.voteWaitHint.classList.add('hidden');
    el.forceFinishVoteBtn.classList.toggle('hidden', !isHost);

    el.voteOptions.innerHTML = '';
    players.filter(p => p.id !== myPlayerId).forEach(p => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vote-option-btn';
      btn.dataset.targetId = p.id;
      btn.textContent = `${p.avatar || '🙂'} ${p.name}`;
      btn.addEventListener('click', () => {
        selectedVoteTarget = p.id;
        el.voteOptions.querySelectorAll('.vote-option-btn').forEach(b => b.classList.toggle('selected', b === btn));
        el.submitVoteBtn.disabled = false;
      });
      el.voteOptions.appendChild(btn);
    });

    showScreen('voting');
  }

  socket.on('voting_started', (data) => {
    clearTimerTick();
    if (data.timeUp) playTimeUpSound();
    renderVotingScreen(data.players);
  });

  el.submitVoteBtn.addEventListener('click', () => {
    if (!selectedVoteTarget) return;
    socket.emit('cast_vote', { targetId: selectedVoteTarget });
    el.submitVoteBtn.classList.add('hidden');
    el.voteOptions.querySelectorAll('.vote-option-btn').forEach(b => b.disabled = true);
    el.voteWaitHint.classList.remove('hidden');
    el.voteWaitHint.textContent = 'Голос принят. Ждём остальных…';
  });

  el.forceFinishVoteBtn.addEventListener('click', () => {
    socket.emit('force_finish_voting');
  });

  socket.on('vote_update', ({ votedCount, total }) => {
    if (!el.voteWaitHint.classList.contains('hidden')) {
      el.voteWaitHint.textContent = `Проголосовали: ${votedCount} из ${total}`;
    }
  });

  function renderTally(tally) {
    el.voteTallyList.innerHTML = tally.map(p => `
      <span class="player-chip">${escapeHtml(p.avatar || '🙂')} ${escapeHtml(p.name)} <span class="vote-count">${p.votes} ${voteWord(p.votes)}</span></span>
    `).join('');
    el.voteTallyField.classList.remove('hidden');
  }

  socket.on('voting_result', ({ tally }) => {
    renderTally(tally);
    resetEndScreen();
    showScreen('end');
  });

  function voteWord(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'голос';
    if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'голоса';
    return 'голосов';
  }

  // ---------- End screen (staged reveal) ----------
  function resetEndScreen() {
    el.revealSpyStageBtn.classList.toggle('hidden', !isHost);
    el.waitSpyHint.classList.toggle('hidden', isHost);
    el.spyRevealField.classList.add('hidden');
    el.revealTopicStageBtn.classList.add('hidden');
    el.topicLine.classList.add('hidden');
    el.scoreboardField.classList.add('hidden');
    el.playAgainBtn.classList.add('hidden');
    el.waitPlayAgainHint.classList.add('hidden');
  }

  el.revealSpyStageBtn.addEventListener('click', () => {
    socket.emit('reveal_spy');
  });

  function renderSpies(spies, category) {
    el.spyRevealLabel.textContent = spies.length > 1 ? 'Шпионы' : 'Шпион';
    el.spyRevealList.innerHTML = spies.map(sp => {
      let tag = '';
      if (sp.caught === true) tag = '<span class="caught-tag">🎉 поймали</span>';
      else if (sp.caught === false) tag = '<span class="escaped-tag">🕵️ сбежал(а)</span>';
      return `<span class="player-chip">${escapeHtml(sp.avatar || '🙂')} ${escapeHtml(sp.name)} ${tag}</span>`;
    }).join('');
    el.spyRevealField.classList.remove('hidden');
    el.revealSpyStageBtn.classList.add('hidden');
    el.waitSpyHint.classList.add('hidden');
    el.revealTopicStageBtn.textContent = category === 'characters' ? 'Раскрыть персонажа' : 'Раскрыть локацию';
    el.revealTopicStageBtn.classList.toggle('hidden', !isHost);
  }

  socket.on('spy_revealed', ({ spies, category }) => renderSpies(spies, category));

  el.revealTopicStageBtn.addEventListener('click', () => {
    socket.emit('reveal_topic');
  });

  function renderTopic(topicLabel, topicName) {
    el.endTopicLabel.textContent = topicLabel;
    el.endLocation.textContent = topicName;
    el.topicLine.classList.remove('hidden');
    el.revealTopicStageBtn.classList.add('hidden');

    const sorted = latestPlayers.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
    el.scoreboardList.innerHTML = sorted.map(p => `
      <span class="player-chip">${escapeHtml(p.avatar || '🙂')} ${escapeHtml(p.name)} <span class="score-value">${p.score || 0}</span></span>
    `).join('');
    el.scoreboardField.classList.remove('hidden');

    el.playAgainBtn.classList.toggle('hidden', !isHost);
    el.waitPlayAgainHint.classList.toggle('hidden', isHost);
  }

  socket.on('topic_revealed', ({ topicLabel, topicName }) => renderTopic(topicLabel, topicName));

  el.playAgainBtn.addEventListener('click', () => {
    socket.emit('play_again');
  });

  // ---------- Room-wide updates (player list, settings, return to lobby) ----------
  socket.on('room_update', (room) => {
    latestPlayers = room.players;
    applyRoomUpdate(Object.assign({ playerId: myPlayerId }, room));
  });

  // ---------- Reconnect ----------
  function attemptRejoin() {
    const saved = loadSession();
    if (!saved) return;
    socket.emit('rejoin', saved, (res) => {
      if (!res || !res.ok) {
        clearSession();
        return;
      }
      applyRoomUpdate(res);

      if (res.phase === 'roles') {
        if (res.yourRole) renderRoleCard(res.yourRole);
      } else if (res.phase === 'discussion') {
        if (res.discussion) renderDiscussionScreen(res.discussion);
      } else if (res.phase === 'voting') {
        if (res.voting) renderVotingScreen(res.voting.players);
      } else if (res.phase === 'end') {
        resetEndScreen();
        if (res.tally) renderTally(res.tally);
        if (res.revealStage >= 1 && res.spies) renderSpies(res.spies, res.yourRole ? res.yourRole.category : undefined);
        if (res.revealStage >= 2 && res.topicName) renderTopic(res.topicLabel, res.topicName);
        showScreen('end');
      }
    });
  }

  socket.on('connect', () => {
    if (hasConnectedBefore) {
      // переподключение после разрыва связи в этой же вкладке — пробуем восстановить сессию из памяти
      if (currentRoom && myPlayerId) {
        saveSession();
        attemptRejoin();
      }
    } else {
      hasConnectedBefore = true;
      attemptRejoin();
    }
  });

  socket.on('disconnect', () => {
    if (currentRoom) {
      showMenuError('Соединение потеряно, пробуем восстановить связь…');
    }
  });
})();
