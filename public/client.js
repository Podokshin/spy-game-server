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

  const AVATARS = ['🦊', '🐼', '🐵', '🦁', '🐯', '🐨', '🐰', '🦄', '🐲', '🐙', '🦉', '🐺', '🐧', '🦖', '🐝', '🦋', '🐳', '🦅', '🐢', '🐬', '🦔', '🐔', '🐸', '🦈'];

  const screens = {
    menu: document.getElementById('screen-menu'),
    lobby: document.getElementById('screen-lobby'),
    role: document.getElementById('screen-role'),
    discussion: document.getElementById('screen-discussion'),
    end: document.getElementById('screen-end')
  };

  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
  }

  const el = {
    playerName: document.getElementById('playerName'),
    avatarGrid: document.getElementById('avatarGrid'),
    createRoomBtn: document.getElementById('createRoomBtn'),
    joinCode: document.getElementById('joinCode'),
    joinRoomBtn: document.getElementById('joinRoomBtn'),
    menuError: document.getElementById('menuError'),

    roomCodeDisplay: document.getElementById('roomCodeDisplay'),
    lobbySettingsField: document.getElementById('lobbySettingsField'),
    lobbyCatBtns: document.querySelectorAll('#lobbySettingsField .cat-btn'),
    lobbySubcategoryField: document.getElementById('lobbySubcategoryField'),
    lobbySubcategoryToggle: document.getElementById('lobbySubcategoryToggle'),
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

    timerBlock: document.getElementById('timerBlock'),
    timerRing: document.getElementById('timerRing'),
    timerDisplay: document.getElementById('timerDisplay'),
    pauseBtn: document.getElementById('pauseBtn'),
    endDiscussionBtn: document.getElementById('endDiscussionBtn'),
    discussionWaitHint: document.getElementById('discussionWaitHint'),

    revealSpyStageBtn: document.getElementById('revealSpyStageBtn'),
    waitSpyHint: document.getElementById('waitSpyHint'),
    spyLine: document.getElementById('spyLine'),
    endSpyName: document.getElementById('endSpyName'),
    revealTopicStageBtn: document.getElementById('revealTopicStageBtn'),
    topicLine: document.getElementById('topicLine'),
    endTopicLabel: document.getElementById('endTopicLabel'),
    endLocation: document.getElementById('endLocation'),
    playAgainBtn: document.getElementById('playAgainBtn'),
    waitPlayAgainHint: document.getElementById('waitPlayAgainHint'),
    leaveRoomBtn2: document.getElementById('leaveRoomBtn2')
  };

  const socket = io();

  let currentRoom = null;
  let isHost = false;
  let lobbyCategory = 'places';
  let lobbySubCategory = 'mix';
  let selectedAvatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
  let timerState = null; // { endsAt, totalMs, enabled }
  let tickHandle = null;

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
      showScreen('lobby');
    });
  });

  el.joinRoomBtn.addEventListener('click', () => {
    getAudioCtx();
    el.menuError.classList.add('hidden');
    socket.emit('join_room', { code: el.joinCode.value, name: el.playerName.value, avatar: selectedAvatar }, (res) => {
      if (!res.ok) return showMenuError(res.error || 'Не удалось присоединиться');
      applyRoomUpdate(res);
      showScreen('lobby');
    });
  });

  function showMenuError(msg) {
    el.menuError.textContent = msg;
    el.menuError.classList.remove('hidden');
  }

  // ---------- Lobby ----------
  CHARACTER_CATEGORY_META.forEach(sub => {
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

  function renderLobbySubcategoryChips() {
    el.lobbySubcategoryToggle.querySelectorAll('.subcat-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.subcategory === lobbySubCategory);
    });
  }

  el.lobbyCatBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (!isHost) return;
      lobbyCategory = btn.dataset.category;
      renderLobbyCategoryButtons();
      pushSettings();
    });
  });

  function renderLobbyCategoryButtons() {
    el.lobbyCatBtns.forEach(b => b.classList.toggle('active', b.dataset.category === lobbyCategory));
    el.lobbySubcategoryField.classList.toggle('hidden', lobbyCategory !== 'characters');
  }

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
      timerMinutes: parseInt(el.lobbyTimerMinutes.value, 10) || 8
    });
  }

  el.startGameBtn.addEventListener('click', () => {
    socket.emit('start_game');
  });

  function leaveRoom() {
    socket.emit('leave_room');
    currentRoom = null;
    isHost = false;
    clearTimerTick();
    showScreen('menu');
  }
  el.leaveRoomBtn.addEventListener('click', leaveRoom);
  el.leaveRoomBtn2.addEventListener('click', leaveRoom);

  function applyRoomUpdate(room) {
    currentRoom = room;
    isHost = room.players.some(p => p.id === socket.id && p.isHost);

    if (room.phase === 'lobby') {
      renderLobby(room);
      showScreen('lobby');
    }
  }

  function renderLobby(room) {
    el.roomCodeDisplay.textContent = room.code;
    el.playerCountLabel.textContent = room.players.length;
    el.lobbyPlayersList.innerHTML = room.players.map(p => `
      <span class="player-chip"><span class="player-avatar">${escapeHtml(p.avatar || '🙂')}</span> ${escapeHtml(p.name)}${p.isHost ? ' <span class="host-tag">★ хост</span>' : ''}</span>
    `).join('');

    lobbyCategory = room.settings.category;
    lobbySubCategory = room.settings.subCategory;
    renderLobbyCategoryButtons();
    renderLobbySubcategoryChips();
    el.lobbyTimerEnabled.checked = room.settings.timerEnabled;
    el.lobbyTimerMinutes.value = room.settings.timerMinutes;
    el.lobbyTimerMinutesField.classList.toggle('hidden', !room.settings.timerEnabled);

    const controlsDisabled = !isHost;
    el.lobbyCatBtns.forEach(b => b.disabled = controlsDisabled);
    el.lobbySubcategoryToggle.querySelectorAll('.subcat-btn').forEach(b => b.disabled = controlsDisabled);
    el.lobbyTimerEnabled.disabled = controlsDisabled;
    el.lobbyTimerMinutes.disabled = controlsDisabled;

    const enoughPlayers = room.players.length >= 3;
    el.startGameBtn.classList.toggle('hidden', !isHost);
    el.startGameBtn.disabled = !enoughPlayers;
    el.waitingHostHint.classList.toggle('hidden', isHost);
    el.needMorePlayersHint.classList.toggle('hidden', !isHost || enoughPlayers);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- Role reveal ----------
  socket.on('your_role', (data) => {
    el.roleCard.classList.remove('spy', 'normal');
    el.roleCard.classList.add(data.isSpy ? 'spy' : 'normal');

    if (data.isSpy) {
      const spyHint = data.category === 'characters'
        ? 'Ты не знаешь персонажа. Слушай факты, которые называют остальные, и попробуй понять, кто это — не спались.'
        : 'Ты не знаешь локацию. Слушай остальных, пытайся понять где вы находитесь — и не спались.';
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
  });

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
  socket.on('discussion_started', (data) => {
    showScreen('discussion');
    timerState = { endsAt: data.endsAt, totalMs: data.totalMs, enabled: data.timerEnabled, remainingMs: data.totalMs, paused: false };
    el.timerBlock.classList.toggle('hidden', !data.timerEnabled);
    el.pauseBtn.classList.toggle('hidden', !isHost);
    el.pauseBtn.textContent = 'Пауза';
    el.endDiscussionBtn.classList.toggle('hidden', !isHost);
    el.discussionWaitHint.classList.toggle('hidden', isHost);

    if (data.timerEnabled) startTimerTick();
  });

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

  socket.on('discussion_ended', ({ timeUp }) => {
    clearTimerTick();
    if (timeUp) playTimeUpSound();
    resetEndScreen();
    showScreen('end');
  });

  // ---------- End screen (staged reveal) ----------
  function resetEndScreen() {
    el.revealSpyStageBtn.classList.toggle('hidden', !isHost);
    el.waitSpyHint.classList.toggle('hidden', isHost);
    el.spyLine.classList.add('hidden');
    el.revealTopicStageBtn.classList.add('hidden');
    el.topicLine.classList.add('hidden');
    el.playAgainBtn.classList.add('hidden');
    el.waitPlayAgainHint.classList.add('hidden');
  }

  el.revealSpyStageBtn.addEventListener('click', () => {
    socket.emit('reveal_spy');
  });

  socket.on('spy_revealed', ({ spyName, spyAvatar }) => {
    el.endSpyName.textContent = (spyAvatar ? spyAvatar + ' ' : '') + spyName;
    el.spyLine.classList.remove('hidden');
    el.revealSpyStageBtn.classList.add('hidden');
    el.waitSpyHint.classList.add('hidden');
    el.revealTopicStageBtn.classList.toggle('hidden', !isHost);
  });

  el.revealTopicStageBtn.addEventListener('click', () => {
    socket.emit('reveal_topic');
  });

  socket.on('topic_revealed', ({ topicLabel, topicName }) => {
    el.endTopicLabel.textContent = topicLabel;
    el.endLocation.textContent = topicName;
    el.topicLine.classList.remove('hidden');
    el.revealTopicStageBtn.classList.add('hidden');
    el.playAgainBtn.classList.toggle('hidden', !isHost);
    el.waitPlayAgainHint.classList.toggle('hidden', isHost);
  });

  el.playAgainBtn.addEventListener('click', () => {
    socket.emit('play_again');
  });

  // ---------- Room-wide updates (player list, settings, return to lobby) ----------
  socket.on('room_update', (room) => {
    applyRoomUpdate(room);
  });

  socket.on('disconnect', () => {
    if (currentRoom) {
      showMenuError('Соединение потеряно. Обновите страницу, чтобы переподключиться.');
    }
  });
})();
