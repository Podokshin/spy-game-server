(() => {
  'use strict';

  const AVATARS = ['🦊', '🐼', '🐵', '🦁', '🐯', '🐨', '🐰', '🦄', '🐲', '🐙', '🦉', '🐺', '🐧', '🦖', '🐝', '🦋', '🐳', '🦅', '🐢', '🐬', '🦔', '🐔', '🐸', '🦈'];
  const SESSION_KEY = 'charades_online_session_v1';

  const screens = {
    menu: document.getElementById('screen-menu'),
    lobby: document.getElementById('screen-lobby'),
    encoding: document.getElementById('screen-encoding'),
    guessing: document.getElementById('screen-guessing'),
    result: document.getElementById('screen-result'),
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
    playerCountLabel: document.getElementById('playerCountLabel'),
    lobbyPlayersList: document.getElementById('lobbyPlayersList'),
    startGameBtn: document.getElementById('startGameBtn'),
    waitingHostHint: document.getElementById('waitingHostHint'),
    needMorePlayersHint: document.getElementById('needMorePlayersHint'),
    leaveRoomBtn: document.getElementById('leaveRoomBtn'),
    lobbyError: document.getElementById('lobbyError'),

    encodingProgress: document.getElementById('encodingProgress'),
    encodingSelf: document.getElementById('encodingSelf'),
    promptText: document.getElementById('promptText'),
    emojiInput: document.getElementById('emojiInput'),
    submitEmojiBtn: document.getElementById('submitEmojiBtn'),
    encodingWaiting: document.getElementById('encodingWaiting'),
    encoderWaitAvatar: document.getElementById('encoderWaitAvatar'),
    encoderWaitText: document.getElementById('encoderWaitText'),

    guessingProgress: document.getElementById('guessingProgress'),
    emojiDisplay: document.getElementById('emojiDisplay'),
    timerRing: document.getElementById('timerRing'),
    timerDisplay: document.getElementById('timerDisplay'),
    guessWatchHint: document.getElementById('guessWatchHint'),
    guessPickerField: document.getElementById('guessPickerField'),
    hostFallbackHint: document.getElementById('hostFallbackHint'),
    guessPickerOptions: document.getElementById('guessPickerOptions'),
    noOneGuessedBtn: document.getElementById('noOneGuessedBtn'),

    resultPromptLine: document.getElementById('resultPromptLine'),
    resultWinnerLine: document.getElementById('resultWinnerLine'),
    nextRoundBtn: document.getElementById('nextRoundBtn'),
    endGameFromResultBtn: document.getElementById('endGameFromResultBtn'),
    resultWaitHint: document.getElementById('resultWaitHint'),

    scoreboardList: document.getElementById('scoreboardList'),
    playAgainBtn: document.getElementById('playAgainBtn'),
    waitPlayAgainHint: document.getElementById('waitPlayAgainHint'),
    leaveRoomBtn2: document.getElementById('leaveRoomBtn2')
  };

  const socket = io('/charades');

  let currentRoom = null;
  let isHost = false;
  let myPlayerId = null;
  let latestPlayers = [];
  let selectedAvatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
  let selectedGuesser = null;
  let timerState = null;
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

  // ---------- Sound (generated, same as other games) ----------
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

    const enoughPlayers = room.players.length >= 3;
    el.startGameBtn.classList.toggle('hidden', !isHost);
    el.startGameBtn.disabled = !enoughPlayers;
    el.waitingHostHint.classList.toggle('hidden', isHost);
    el.needMorePlayersHint.classList.toggle('hidden', !isHost || enoughPlayers);
  }

  // ---------- Encoding turn ----------
  socket.on('encoding_started', (data) => {
    clearTimerTick();
    el.encodingProgress.textContent = `Раунд ${data.turnIndex + 1} из ${data.total}`;

    const iAmEncoder = data.encoderId === myPlayerId;
    el.encodingSelf.classList.toggle('hidden', !iAmEncoder);
    el.encodingWaiting.classList.toggle('hidden', iAmEncoder);

    if (!iAmEncoder) {
      el.encoderWaitAvatar.textContent = data.encoderAvatar || '🙂';
      el.encoderWaitText.textContent = `🎬 Сейчас очередь ${data.encoderName} составлять подсказку…`;
    } else {
      el.emojiInput.value = '';
      el.submitEmojiBtn.disabled = true;
    }

    showScreen('encoding');
  });

  socket.on('your_prompt', (data) => {
    el.promptText.textContent = data.prompt;
    el.encodingProgress.textContent = `Раунд ${data.turnIndex + 1} из ${data.total}`;
    el.encodingSelf.classList.remove('hidden');
    el.encodingWaiting.classList.add('hidden');
    el.emojiInput.value = '';
    el.submitEmojiBtn.disabled = true;
    showScreen('encoding');
  });

  el.emojiInput.addEventListener('input', () => {
    el.submitEmojiBtn.disabled = el.emojiInput.value.trim().length === 0;
  });

  function submitEmoji() {
    const value = el.emojiInput.value.trim();
    if (!value) return;
    socket.emit('submit_emoji', { emoji: value });
    el.submitEmojiBtn.disabled = true;
  }
  el.submitEmojiBtn.addEventListener('click', submitEmoji);
  el.emojiInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitEmoji();
  });

  // ---------- Guessing ----------
  function renderGuessingScreen(data) {
    selectedGuesser = null;
    el.guessingProgress.textContent = `Раунд ${data.turnIndex + 1} из ${data.total}`;
    el.emojiDisplay.textContent = data.emoji;

    const iAmEncoder = data.encoderId === myPlayerId;
    const iAmHostFallback = isHost && !iAmEncoder;
    const showPicker = iAmEncoder || iAmHostFallback;

    el.guessPickerField.classList.toggle('hidden', !showPicker);
    el.hostFallbackHint.classList.toggle('hidden', !iAmHostFallback);
    el.guessWatchHint.classList.toggle('hidden', showPicker);

    el.guessPickerOptions.innerHTML = '';
    if (showPicker) {
      latestPlayers.forEach(p => {
        if (p.id === data.encoderId) return;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'vote-option-btn';
        btn.dataset.guesserId = p.id;
        btn.textContent = `${p.avatar || '🙂'} ${p.name}`;
        btn.addEventListener('click', () => {
          socket.emit('award_point', { guesserId: p.id });
        });
        el.guessPickerOptions.appendChild(btn);
      });
    }

    timerState = {
      endsAt: data.endsAt,
      totalMs: data.totalMs
    };
    if (data.endsAt) startTimerTick();

    showScreen('guessing');
  }

  socket.on('guessing_started', (data) => {
    clearTimerTick();
    renderGuessingScreen(data);
  });

  socket.on('time_up', () => {
    playTimeUpSound();
    if (timerState) {
      timerState.endsAt = Date.now();
      updateTimerFromState();
    }
    clearTimerTick();
  });

  el.noOneGuessedBtn.addEventListener('click', () => {
    socket.emit('award_point', { guesserId: null });
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
    if (!timerState || !timerState.endsAt) return;
    const remaining = Math.max(0, timerState.endsAt - Date.now());
    const totalSeconds = Math.ceil(remaining / 1000);
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    el.timerDisplay.textContent = `${m}:${s}`;
    const isWarning = remaining <= 10000;
    el.timerDisplay.classList.toggle('warning', isWarning);
    el.timerRing.classList.toggle('warning', isWarning);
    const progress = timerState.totalMs > 0 ? remaining / timerState.totalMs : 0;
    el.timerRing.style.setProperty('--progress', progress);
    if (remaining <= 0) clearTimerTick();
  }

  // ---------- Round result ----------
  function showRoundResult(data) {
    clearTimerTick();
    el.resultPromptLine.innerHTML = `Загадано было: <b>${escapeHtml(data.prompt)}</b> (подсказка: ${escapeHtml(data.emoji)})`;
    if (data.guesserId) {
      el.resultWinnerLine.innerHTML = `🎉 Угадал(а) <b>${escapeHtml(data.guesserName || '?')}</b> (+${data.pts}) — кодировщик <b>${escapeHtml(data.encoderName)}</b> получает +${data.encoderPts}`;
    } else {
      el.resultWinnerLine.innerHTML = `😅 Никто не угадал — очков в этом раунде нет`;
    }

    const isLast = data.turnIndex + 1 >= data.total;
    el.nextRoundBtn.textContent = isLast ? 'Завершить игру' : 'Следующий раунд';
    el.nextRoundBtn.classList.toggle('hidden', !isHost);
    el.endGameFromResultBtn.classList.add('hidden');
    el.resultWaitHint.classList.toggle('hidden', isHost);

    showScreen('result');
  }

  socket.on('round_result', showRoundResult);

  el.nextRoundBtn.addEventListener('click', () => {
    socket.emit('next_round');
  });

  // ---------- End screen ----------
  function renderEndScreen(players) {
    latestPlayers = players;
    const sorted = players.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
    el.scoreboardList.innerHTML = sorted.map(p => `
      <span class="player-chip">${escapeHtml(p.avatar || '🙂')} ${escapeHtml(p.name)} <span class="score-value">${p.score || 0}</span></span>
    `).join('');
    el.playAgainBtn.classList.toggle('hidden', !isHost);
    el.waitPlayAgainHint.classList.toggle('hidden', isHost);
    showScreen('end');
  }

  socket.on('game_finished', ({ players }) => renderEndScreen(players));

  el.playAgainBtn.addEventListener('click', () => {
    socket.emit('play_again');
  });

  // ---------- Room-wide updates ----------
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

      if (res.phase === 'encoding') {
        if (res.yourPrompt) {
          renderYourPromptFromRejoin(res.yourPrompt);
        } else if (res.encoding) {
          renderEncodingWaitFromRejoin(res.encoding);
        }
      } else if (res.phase === 'guessing') {
        if (res.guessing) renderGuessingScreen(res.guessing);
      } else if (res.phase === 'result') {
        if (res.lastResult) showRoundResult(res.lastResult);
      } else if (res.phase === 'end') {
        renderEndScreen(res.players || latestPlayers);
      }
    });
  }

  function renderYourPromptFromRejoin(data) {
    el.encodingProgress.textContent = `Раунд ${data.turnIndex + 1} из ${data.total}`;
    el.promptText.textContent = data.prompt;
    el.encodingSelf.classList.remove('hidden');
    el.encodingWaiting.classList.add('hidden');
    el.emojiInput.value = '';
    el.submitEmojiBtn.disabled = true;
    showScreen('encoding');
  }

  function renderEncodingWaitFromRejoin(data) {
    el.encodingProgress.textContent = `Раунд ${data.turnIndex + 1} из ${data.total}`;
    el.encodingSelf.classList.add('hidden');
    el.encodingWaiting.classList.remove('hidden');
    el.encoderWaitAvatar.textContent = data.encoderAvatar || '🙂';
    el.encoderWaitText.textContent = `🎬 Сейчас очередь ${data.encoderName || 'игрока'} составлять подсказку…`;
    showScreen('encoding');
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

  socket.on('disconnect', () => {
    if (currentRoom) {
      showMenuError('Соединение потеряно, пробуем восстановить связь…');
    }
  });
})();
