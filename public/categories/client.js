(() => {
  'use strict';

  const AVATARS = ['🦊', '🐼', '🐵', '🦁', '🐯', '🐨', '🐰', '🦄', '🐲', '🐙', '🦉', '🐺', '🐧', '🦖', '🐝', '🦋', '🐳', '🦅', '🐢', '🐬', '🦔', '🐔', '🐸', '🦈'];
  const SESSION_KEY = 'categories_online_session_v1';

  const screens = {
    menu: document.getElementById('screen-menu'),
    lobby: document.getElementById('screen-lobby'),
    writing: document.getElementById('screen-writing'),
    results: document.getElementById('screen-results'),
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
    lobbyTotalRounds: document.getElementById('lobbyTotalRounds'),
    lobbyRoundSeconds: document.getElementById('lobbyRoundSeconds'),
    playerCountLabel: document.getElementById('playerCountLabel'),
    lobbyPlayersList: document.getElementById('lobbyPlayersList'),
    startGameBtn: document.getElementById('startGameBtn'),
    waitingHostHint: document.getElementById('waitingHostHint'),
    needMorePlayersHint: document.getElementById('needMorePlayersHint'),
    leaveRoomBtn: document.getElementById('leaveRoomBtn'),
    lobbyError: document.getElementById('lobbyError'),

    writingProgress: document.getElementById('writingProgress'),
    letterBadge: document.getElementById('letterBadge'),
    timerRing: document.getElementById('timerRing'),
    timerDisplay: document.getElementById('timerDisplay'),
    answersContainer: document.getElementById('answersContainer'),
    submitAnswersBtn: document.getElementById('submitAnswersBtn'),
    submitWaitHint: document.getElementById('submitWaitHint'),
    forceFinalizeBtn: document.getElementById('forceFinalizeBtn'),

    resultsProgress: document.getElementById('resultsProgress'),
    resultsLetterLine: document.getElementById('resultsLetterLine'),
    resultsContainer: document.getElementById('resultsContainer'),
    nextRoundBtn: document.getElementById('nextRoundBtn'),
    waitNextRoundHint: document.getElementById('waitNextRoundHint'),

    scoreboardList: document.getElementById('scoreboardList'),
    playAgainBtn: document.getElementById('playAgainBtn'),
    waitPlayAgainHint: document.getElementById('waitPlayAgainHint'),
    leaveRoomBtn2: document.getElementById('leaveRoomBtn2')
  };

  const socket = io('/categories');

  let currentRoom = null;
  let isHost = false;
  let myPlayerId = null;
  let latestPlayers = [];
  let selectedAvatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
  let timerState = null;
  let tickHandle = null;
  let hasConnectedBefore = false;
  let answerInputs = [];

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
  el.lobbyTotalRounds.addEventListener('change', () => { if (isHost) pushSettings(); });
  el.lobbyRoundSeconds.addEventListener('change', () => { if (isHost) pushSettings(); });

  function pushSettings() {
    socket.emit('update_settings', {
      totalRounds: parseInt(el.lobbyTotalRounds.value, 10) || 5,
      roundSeconds: parseInt(el.lobbyRoundSeconds.value, 10) || 60
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
    answerInputs = [];
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

    el.lobbyTotalRounds.value = room.settings.totalRounds;
    el.lobbyRoundSeconds.value = room.settings.roundSeconds;

    const controlsDisabled = !isHost;
    el.lobbyTotalRounds.disabled = controlsDisabled;
    el.lobbyRoundSeconds.disabled = controlsDisabled;

    const enoughPlayers = room.players.length >= 2;
    el.startGameBtn.classList.toggle('hidden', !isHost);
    el.startGameBtn.disabled = !enoughPlayers;
    el.waitingHostHint.classList.toggle('hidden', isHost);
    el.needMorePlayersHint.classList.toggle('hidden', !isHost || enoughPlayers);
  }

  // ---------- Writing screen ----------
  function buildAnswerFields(letter, categories) {
    el.answersContainer.innerHTML = '';
    answerInputs = categories.map(cat => {
      const wrap = document.createElement('div');
      wrap.className = 'answer-field';

      const label = document.createElement('label');
      label.textContent = cat;

      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 30;
      input.autocomplete = 'off';
      input.placeholder = `Слово на «${letter}»…`;

      wrap.appendChild(label);
      wrap.appendChild(input);
      el.answersContainer.appendChild(wrap);
      return input;
    });
  }

  function renderWriting(data) {
    clearTimerTick();
    el.writingProgress.textContent = `Раунд ${data.round} из ${data.totalRounds}`;
    el.letterBadge.textContent = data.letter;
    buildAnswerFields(data.letter, data.categories);

    timerState = { endsAt: data.endsAt, totalMs: data.totalMs };
    startTimerTick();

    const alreadySubmitted = !!data.submitted;
    el.submitAnswersBtn.disabled = false;
    el.submitAnswersBtn.classList.toggle('hidden', alreadySubmitted);
    el.submitWaitHint.classList.toggle('hidden', !alreadySubmitted);

    if (alreadySubmitted) {
      const submittedCount = data.submittedCount != null ? data.submittedCount : 0;
      const total = data.total != null ? data.total : latestPlayers.length;
      el.submitWaitHint.textContent = `Ответили: ${submittedCount} из ${total}`;
      if (Array.isArray(data.yourAnswers)) {
        answerInputs.forEach((inp, i) => { inp.value = data.yourAnswers[i] || ''; });
      }
      answerInputs.forEach(inp => { inp.disabled = true; });
    } else {
      answerInputs.forEach(inp => { inp.value = ''; inp.disabled = false; });
    }

    el.forceFinalizeBtn.classList.toggle('hidden', !isHost);
    showScreen('writing');
  }

  socket.on('round_started', renderWriting);

  el.submitAnswersBtn.addEventListener('click', () => {
    const answers = answerInputs.map(inp => inp.value);
    socket.emit('submit_answers', { answers });
    answerInputs.forEach(inp => { inp.disabled = true; });
    el.submitAnswersBtn.classList.add('hidden');
    el.submitWaitHint.classList.remove('hidden');
    el.submitWaitHint.textContent = 'Ответ принят. Ждём остальных…';
  });

  socket.on('submit_progress', ({ submittedCount, total }) => {
    if (!el.submitWaitHint.classList.contains('hidden')) {
      el.submitWaitHint.textContent = `Ответили: ${submittedCount} из ${total}`;
    }
  });

  el.forceFinalizeBtn.addEventListener('click', () => {
    socket.emit('force_finalize_round');
  });

  // ---------- Timer ----------
  function startTimerTick() {
    clearTimerTick();
    updateTimerFromState();
    tickHandle = setInterval(updateTimerFromState, 250);
  }
  function clearTimerTick() {
    if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
  }
  function updateTimerFromState() {
    if (!timerState) return;
    const remaining = Math.max(0, timerState.endsAt - Date.now());
    const totalSeconds = Math.ceil(remaining / 1000);
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    el.timerDisplay.textContent = `${m}:${s}`;
    const warnThreshold = Math.min(10000, timerState.totalMs * 0.25);
    const isWarning = remaining <= warnThreshold;
    el.timerDisplay.classList.toggle('warning', isWarning);
    el.timerRing.classList.toggle('warning', isWarning);
    const progress = timerState.totalMs > 0 ? remaining / timerState.totalMs : 0;
    el.timerRing.style.setProperty('--progress', progress);
  }

  // ---------- Results screen ----------
  function renderResults(data) {
    clearTimerTick();
    if (data.timeUp) playTimeUpSound();

    el.resultsProgress.textContent = `Раунд ${data.round} из ${data.totalRounds}`;
    el.resultsLetterLine.textContent = `Буква «${data.letter}»`;

    el.resultsContainer.innerHTML = data.resultsByCategory.map(cat => {
      const rows = cat.entries.map(e => {
        const answerText = e.answer && e.answer.length ? escapeHtml(e.answer) : '—';
        const ptsClass = e.points === 2 ? ' pts-2' : (e.points === 1 ? ' pts-1' : '');
        return `<div class="result-entry${e.valid ? '' : ' invalid'}">
          <span class="result-entry-name"><span>${escapeHtml(e.avatar || '🙂')}</span><span class="rn-name">${escapeHtml(e.name)}</span></span>
          <span class="result-entry-answer">${answerText}</span>
          <span class="points-badge${ptsClass}">${e.points}</span>
        </div>`;
      }).join('');
      return `<div class="category-result-block">
        <span class="category-result-title">${escapeHtml(cat.category)}</span>
        ${rows}
      </div>`;
    }).join('');

    const isLast = data.round >= data.totalRounds;
    el.nextRoundBtn.textContent = isLast ? 'Завершить игру' : 'Следующий раунд';
    el.nextRoundBtn.classList.toggle('hidden', !isHost);
    el.waitNextRoundHint.classList.toggle('hidden', isHost);

    showScreen('results');
  }

  socket.on('round_result', renderResults);

  el.nextRoundBtn.addEventListener('click', () => {
    socket.emit('next_round');
  });

  // ---------- End screen ----------
  function renderEndScreen(players) {
    const sorted = players.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
    el.scoreboardList.innerHTML = sorted.map((p, i) => {
      const medalClass = i === 0 ? ' medal-1' : i === 1 ? ' medal-2' : i === 2 ? ' medal-3' : '';
      const medal = i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : '';
      return `<span class="player-chip${medalClass}">${medal}${escapeHtml(p.avatar || '🙂')} ${escapeHtml(p.name)} <span class="score-value">${p.score || 0}</span></span>`;
    }).join('');
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

      if (res.phase === 'writing' && res.writing) {
        renderWriting(res.writing);
      } else if (res.phase === 'results' && res.results) {
        renderResults(res.results);
      } else if (res.phase === 'end' && res.ended) {
        renderEndScreen(res.ended.players);
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

  socket.on('disconnect', () => {
    if (currentRoom) {
      showMenuError('Соединение потеряно, пробуем восстановить связь…');
    }
  });
})();
