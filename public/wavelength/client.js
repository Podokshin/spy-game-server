(() => {
  'use strict';

  const AVATARS = ['🦊', '🐼', '🐵', '🦁', '🐯', '🐨', '🐰', '🦄', '🐲', '🐙', '🦉', '🐺', '🐧', '🦖', '🐝', '🦋', '🐳', '🦅', '🐢', '🐬', '🦔', '🐔', '🐸', '🦈'];
  const SESSION_KEY = 'wavelength_online_session_v1';
  const GUESS_TIME_MS = 45 * 1000;

  const screens = {
    menu: document.getElementById('screen-menu'),
    lobby: document.getElementById('screen-lobby'),
    clue: document.getElementById('screen-clue'),
    guess: document.getElementById('screen-guess'),
    reveal: document.getElementById('screen-reveal'),
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
    redPlayersList: document.getElementById('redPlayersList'),
    bluePlayersList: document.getElementById('bluePlayersList'),
    redTeamActions: document.getElementById('redTeamActions'),
    blueTeamActions: document.getElementById('blueTeamActions'),
    unassignedField: document.getElementById('unassignedField'),
    unassignedList: document.getElementById('unassignedList'),
    lobbyRoundsField: document.getElementById('lobbyRoundsField'),
    lobbyRounds: document.getElementById('lobbyRounds'),
    startGameBtn: document.getElementById('startGameBtn'),
    waitingHostHint: document.getElementById('waitingHostHint'),
    needTeamsHint: document.getElementById('needTeamsHint'),
    leaveRoomBtn: document.getElementById('leaveRoomBtn'),
    lobbyError: document.getElementById('lobbyError'),

    clueRoundLabel: document.getElementById('clueRoundLabel'),
    clueWaveTrack: document.getElementById('clueWaveTrack'),
    clueLeftLabel: document.getElementById('clueLeftLabel'),
    clueRightLabel: document.getElementById('clueRightLabel'),
    clueGiverField: document.getElementById('clueGiverField'),
    clueInput: document.getElementById('clueInput'),
    clueSubmitBtn: document.getElementById('clueSubmitBtn'),
    clueWaitGiverHint: document.getElementById('clueWaitGiverHint'),
    clueSpectatorHint: document.getElementById('clueSpectatorHint'),

    guessRoundLabel: document.getElementById('guessRoundLabel'),
    guessClueText: document.getElementById('guessClueText'),
    guessWaveTrack: document.getElementById('guessWaveTrack'),
    guessLeftLabel: document.getElementById('guessLeftLabel'),
    guessRightLabel: document.getElementById('guessRightLabel'),
    guessSliderField: document.getElementById('guessSliderField'),
    guessSlider: document.getElementById('guessSlider'),
    guessSubmitBtn: document.getElementById('guessSubmitBtn'),
    guessTimerBlock: document.getElementById('guessTimerBlock'),
    guessTimerRing: document.getElementById('guessTimerRing'),
    guessTimerDisplay: document.getElementById('guessTimerDisplay'),
    guessProgressHint: document.getElementById('guessProgressHint'),
    forceFinalizeBtn: document.getElementById('forceFinalizeBtn'),

    revealRoundLabel: document.getElementById('revealRoundLabel'),
    revealWaveTrack: document.getElementById('revealWaveTrack'),
    revealLeftLabel: document.getElementById('revealLeftLabel'),
    revealRightLabel: document.getElementById('revealRightLabel'),
    revealPointsLine: document.getElementById('revealPointsLine'),
    revealScoreRed: document.getElementById('revealScoreRed'),
    revealScoreBlue: document.getElementById('revealScoreBlue'),
    revealGuessList: document.getElementById('revealGuessList'),
    nextRoundBtn: document.getElementById('nextRoundBtn'),
    revealWaitHint: document.getElementById('revealWaitHint'),

    endWinnerLine: document.getElementById('endWinnerLine'),
    endScoreRed: document.getElementById('endScoreRed'),
    endScoreBlue: document.getElementById('endScoreBlue'),
    playAgainBtn: document.getElementById('playAgainBtn'),
    waitPlayAgainHint: document.getElementById('waitPlayAgainHint'),
    leaveRoomBtn2: document.getElementById('leaveRoomBtn2')
  };

  const socket = io('/wavelength');

  let currentRoom = null;
  let isHost = false;
  let myPlayerId = null;
  let myTeam = null;
  let latestPlayers = [];
  let selectedAvatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
  let hasConnectedBefore = false;

  // Информация о текущем раунде, собранная из your_clue_turn / round_started —
  // нужна, чтобы достроить полный контекст, когда приходит clue_submitted
  // (сервер намеренно не шлёт в нём цель/команду/раунд повторно).
  let currentRoundInfo = null;
  let guessAnswered = false;
  let guessTimerState = null;
  let guessTickHandle = null;

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
  function renderTeamChips(players) {
    if (players.length === 0) return '<span class="hint">пусто</span>';
    return players.map(p => `
      <span class="player-chip${p.connected === false ? ' disconnected' : ''}">${escapeHtml(p.avatar || '🙂')} ${escapeHtml(p.name)}${p.isHost ? ' <span class="host-tag">★</span>' : ''}${p.connected === false ? ' ⏳' : ''}</span>
    `).join('');
  }

  function renderTeamActions(container, team) {
    container.innerHTML = '';
    const me = currentRoom.players.find(p => p.id === myPlayerId);
    if (!me) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'secondary-btn';
    if (me.team !== team) {
      btn.textContent = 'Вступить';
      btn.addEventListener('click', () => socket.emit('set_team', { team }));
    } else {
      btn.textContent = 'Покинуть команду';
      btn.addEventListener('click', () => socket.emit('set_team', { team: null }));
    }
    container.appendChild(btn);
  }

  function renderLobby(room) {
    el.roomCodeDisplay.textContent = room.code;
    const redPlayers = room.players.filter(p => p.team === 'red');
    const bluePlayers = room.players.filter(p => p.team === 'blue');
    const unassigned = room.players.filter(p => !p.team);

    el.redPlayersList.innerHTML = renderTeamChips(redPlayers);
    el.bluePlayersList.innerHTML = renderTeamChips(bluePlayers);

    el.unassignedField.classList.toggle('hidden', unassigned.length === 0);
    el.unassignedList.innerHTML = renderTeamChips(unassigned);

    renderTeamActions(el.redTeamActions, 'red');
    renderTeamActions(el.blueTeamActions, 'blue');

    el.lobbyRounds.value = room.settings.totalRounds;
    el.lobbyRounds.disabled = !isHost;

    const ready = redPlayers.length >= 2 && bluePlayers.length >= 2;
    el.startGameBtn.classList.toggle('hidden', !isHost);
    el.startGameBtn.disabled = !ready;
    el.waitingHostHint.classList.toggle('hidden', isHost);
    el.needTeamsHint.classList.toggle('hidden', !isHost || ready);
  }

  el.lobbyRounds.addEventListener('change', () => {
    if (!isHost) return;
    socket.emit('update_settings', { totalRounds: parseInt(el.lobbyRounds.value, 10) || 8 });
  });

  el.startGameBtn.addEventListener('click', () => {
    socket.emit('start_game');
  });

  function resetRoundState() {
    currentRoundInfo = null;
    guessAnswered = false;
    clearGuessTimer();
  }

  function leaveRoom() {
    socket.emit('leave_room');
    currentRoom = null;
    isHost = false;
    myPlayerId = null;
    myTeam = null;
    resetRoundState();
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
    const me = room.players.find(p => p.id === myPlayerId);
    isHost = !!(me && me.isHost);
    myTeam = me ? me.team : myTeam;
    history.replaceState(null, '', '?room=' + room.code);
    saveSession();

    if (room.phase === 'lobby') {
      resetRoundState();
      renderLobby(room);
      showScreen('lobby');
    }
  }

  // ---------- Wave bar helper ----------
  function renderWaveBar(trackEl, markers) {
    trackEl.innerHTML = '';
    markers.forEach(m => {
      const marker = document.createElement('div');
      marker.className = 'wave-bar-marker ' + m.className;
      marker.style.left = Math.min(100, Math.max(0, m.position)) + '%';
      if (m.title) marker.title = m.title;
      trackEl.appendChild(marker);
    });
  }

  function teamLabel(team) {
    return team === 'red' ? '🔴 Команда А' : '🔵 Команда Б';
  }

  // ---------- Clue phase ----------
  function renderClueGiver(data) {
    resetRoundState();
    const me = currentRoom.players.find(p => p.id === myPlayerId);
    currentRoundInfo = {
      team: myTeam,
      giverId: myPlayerId,
      giverName: me ? me.name : '',
      giverAvatar: me ? me.avatar : null,
      spectrum: data.spectrum,
      round: data.round,
      totalRounds: data.totalRounds
    };

    el.clueRoundLabel.textContent = `Раунд ${data.round} из ${data.totalRounds}`;
    el.clueLeftLabel.textContent = data.spectrum.left;
    el.clueRightLabel.textContent = data.spectrum.right;
    renderWaveBar(el.clueWaveTrack, [
      { className: 'marker-target', position: data.target, title: 'Секретная точка — её видите только вы' }
    ]);

    el.clueGiverField.classList.remove('hidden');
    el.clueSubmitBtn.classList.remove('hidden');
    el.clueSubmitBtn.disabled = false;
    el.clueInput.value = '';
    el.clueWaitGiverHint.classList.add('hidden');
    el.clueSpectatorHint.classList.add('hidden');

    showScreen('clue');
  }

  function renderClueOther(data) {
    resetRoundState();
    currentRoundInfo = {
      team: data.team,
      giverId: data.giverId,
      giverName: data.giverName,
      giverAvatar: data.giverAvatar,
      spectrum: data.spectrum,
      round: data.round,
      totalRounds: data.totalRounds
    };

    el.clueRoundLabel.textContent = `Раунд ${data.round} из ${data.totalRounds}`;
    el.clueLeftLabel.textContent = data.spectrum.left;
    el.clueRightLabel.textContent = data.spectrum.right;
    renderWaveBar(el.clueWaveTrack, []);

    el.clueGiverField.classList.add('hidden');
    el.clueSubmitBtn.classList.add('hidden');

    const amOnTeam = myTeam === data.team;
    el.clueWaitGiverHint.classList.toggle('hidden', !amOnTeam);
    el.clueSpectatorHint.classList.toggle('hidden', amOnTeam);
    if (amOnTeam) {
      el.clueWaitGiverHint.textContent = `Ждём подсказку от ${data.giverAvatar || '🙂'} ${data.giverName}…`;
    } else {
      el.clueSpectatorHint.textContent = `Сейчас ход команды ${teamLabel(data.team)}, вы наблюдаете`;
    }

    showScreen('clue');
  }

  socket.on('your_clue_turn', renderClueGiver);
  socket.on('round_started', renderClueOther);

  el.clueSubmitBtn.addEventListener('click', () => {
    const text = el.clueInput.value.trim();
    if (!text) return;
    socket.emit('submit_clue', { text });
    el.clueSubmitBtn.disabled = true;
  });

  // ---------- Guess phase ----------
  function updateGuessPreview() {
    renderWaveBar(el.guessWaveTrack, [
      { className: 'marker-preview', position: parseInt(el.guessSlider.value, 10) }
    ]);
  }

  el.guessSlider.addEventListener('input', updateGuessPreview);

  function renderGuessScreen(data) {
    guessAnswered = false;
    el.guessRoundLabel.textContent = `Раунд ${data.round} из ${data.totalRounds}`;
    el.guessLeftLabel.textContent = data.spectrum.left;
    el.guessRightLabel.textContent = data.spectrum.right;
    el.guessClueText.textContent = data.text || data.clueText || '—';

    const amGuesser = data.isGuesser !== undefined
      ? data.isGuesser
      : (myTeam === data.team && myPlayerId !== data.giverId);

    el.guessSliderField.classList.toggle('hidden', !amGuesser);
    el.forceFinalizeBtn.classList.toggle('hidden', !isHost);
    el.guessProgressHint.classList.remove('hidden');
    el.guessProgressHint.textContent = 'Ответили: 0 из 0';

    if (amGuesser) {
      el.guessSlider.value = data.myGuess != null ? data.myGuess : 50;
      el.guessSlider.disabled = false;
      el.guessSubmitBtn.disabled = false;
      el.guessSubmitBtn.textContent = 'Ответить';
      updateGuessPreview();
      if (data.myGuess != null) {
        guessAnswered = true;
        el.guessSlider.disabled = true;
        el.guessSubmitBtn.disabled = true;
        el.guessSubmitBtn.textContent = 'Ответ отправлен';
      }
    } else {
      renderWaveBar(el.guessWaveTrack, []);
    }

    if (data.progress) {
      el.guessProgressHint.textContent = `Ответили: ${data.progress.count} из ${data.progress.total}`;
    }

    startGuessTimer(data.endsAt || (Date.now() + GUESS_TIME_MS));

    showScreen('guess');
  }

  el.guessSubmitBtn.addEventListener('click', () => {
    if (guessAnswered) return;
    socket.emit('submit_guess', { position: parseInt(el.guessSlider.value, 10) });
    guessAnswered = true;
    el.guessSlider.disabled = true;
    el.guessSubmitBtn.disabled = true;
    el.guessSubmitBtn.textContent = 'Ответ отправлен';
  });

  el.forceFinalizeBtn.addEventListener('click', () => {
    socket.emit('force_finalize_round');
  });

  socket.on('clue_submitted', (data) => {
    if (!currentRoundInfo) return;
    renderGuessScreen({
      team: currentRoundInfo.team,
      giverId: currentRoundInfo.giverId,
      giverName: currentRoundInfo.giverName,
      giverAvatar: currentRoundInfo.giverAvatar,
      spectrum: data.spectrum || currentRoundInfo.spectrum,
      text: data.text,
      round: currentRoundInfo.round,
      totalRounds: currentRoundInfo.totalRounds,
      isGuesser: myTeam === currentRoundInfo.team && myPlayerId !== currentRoundInfo.giverId,
      myGuess: null,
      endsAt: data.endsAt
    });
  });

  socket.on('guess_progress', ({ count, total }) => {
    if (!el.guessProgressHint.classList.contains('hidden')) {
      el.guessProgressHint.textContent = `Ответили: ${count} из ${total}`;
    }
  });

  function startGuessTimer(endsAt) {
    clearGuessTimer();
    el.guessTimerBlock.classList.remove('hidden');
    guessTimerState = { endsAt };
    updateGuessTimerDisplay();
    guessTickHandle = setInterval(updateGuessTimerDisplay, 250);
  }
  function clearGuessTimer() {
    if (guessTickHandle) { clearInterval(guessTickHandle); guessTickHandle = null; }
    guessTimerState = null;
  }
  function updateGuessTimerDisplay() {
    if (!guessTimerState) return;
    const remaining = Math.max(0, guessTimerState.endsAt - Date.now());
    const totalSeconds = Math.ceil(remaining / 1000);
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    el.guessTimerDisplay.textContent = `${m}:${s}`;
    const isWarning = remaining <= 10000;
    el.guessTimerDisplay.classList.toggle('warning', isWarning);
    el.guessTimerRing.classList.toggle('warning', isWarning);
    const progress = GUESS_TIME_MS > 0 ? remaining / GUESS_TIME_MS : 0;
    el.guessTimerRing.style.setProperty('--progress', progress);
    if (remaining <= 0 && guessTickHandle) { clearInterval(guessTickHandle); guessTickHandle = null; }
  }

  // ---------- Reveal phase ----------
  function pointsWord(n) {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 14) return 'очков';
    if (mod10 === 1) return 'очко';
    if (mod10 >= 2 && mod10 <= 4) return 'очка';
    return 'очков';
  }

  function showRoundResult(data) {
    clearGuessTimer();
    el.revealRoundLabel.textContent = `Раунд ${data.round} из ${data.totalRounds}`;
    el.revealLeftLabel.textContent = data.spectrum.left;
    el.revealRightLabel.textContent = data.spectrum.right;

    const markers = [
      { className: 'marker-target', position: data.target, title: 'Секретная точка: ' + data.target },
      { className: 'marker-avg', position: data.avg, title: 'Средний ответ команды: ' + Math.round(data.avg) }
    ];
    (data.guessDetail || []).forEach(g => {
      markers.push({ className: 'marker-guess', position: g.position, title: `${g.name}: ${g.position}` });
    });
    renderWaveBar(el.revealWaveTrack, markers);

    el.revealPointsLine.innerHTML = `${teamLabel(data.team)} получает <b>${data.pts}</b> ${pointsWord(data.pts)}${data.timeUp ? ' (время вышло)' : ''}`;

    el.revealScoreRed.textContent = `🔴 ${data.teamScores.red}`;
    el.revealScoreBlue.textContent = `🔵 ${data.teamScores.blue}`;

    el.revealGuessList.innerHTML = (data.guessDetail || []).map(g => `
      <span class="player-chip">${escapeHtml(g.avatar || '🙂')} ${escapeHtml(g.name)} <span class="guess-value">${g.position}</span></span>
    `).join('') || '<span class="hint">Никто не успел ответить</span>';

    const isLast = data.round >= data.totalRounds;
    el.nextRoundBtn.textContent = isLast ? 'Завершить игру' : 'Следующий раунд';
    el.nextRoundBtn.classList.toggle('hidden', !isHost);
    el.revealWaitHint.classList.toggle('hidden', isHost);

    showScreen('reveal');
  }

  socket.on('round_result', (data) => {
    if (data.timeUp) playTimeUpSound();
    showRoundResult(data);
  });

  el.nextRoundBtn.addEventListener('click', () => {
    socket.emit('next_round');
  });

  // ---------- End screen ----------
  function renderEndScreen(data) {
    clearGuessTimer();
    const teamScores = data.teamScores;
    const winner = teamScores.red === teamScores.blue ? null : (teamScores.red > teamScores.blue ? 'red' : 'blue');
    el.endWinnerLine.innerHTML = winner
      ? `🏆 Победила команда <b>${teamLabel(winner)}</b>!`
      : '🤝 Ничья!';
    el.endScoreRed.textContent = `🔴 ${teamScores.red}`;
    el.endScoreBlue.textContent = `🔵 ${teamScores.blue}`;
    el.playAgainBtn.classList.toggle('hidden', !isHost);
    el.waitPlayAgainHint.classList.toggle('hidden', isHost);
    showScreen('end');
  }

  socket.on('game_finished', renderEndScreen);

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

      if (res.phase === 'clue') {
        if (res.yourClueTurn) renderClueGiver(res.yourClueTurn);
        else if (res.roundStarted) renderClueOther(res.roundStarted);
      } else if (res.phase === 'guess') {
        if (res.guessState) {
          currentRoundInfo = {
            team: res.guessState.team,
            giverId: res.guessState.giverId,
            giverName: res.guessState.giverName,
            giverAvatar: res.guessState.giverAvatar,
            spectrum: res.guessState.spectrum,
            round: res.guessState.round,
            totalRounds: res.guessState.totalRounds
          };
          renderGuessScreen(Object.assign({}, res.guessState, {
            text: res.guessState.clueText,
            endsAt: res.guessState.endsAt || (Date.now() + GUESS_TIME_MS)
          }));
        }
      } else if (res.phase === 'reveal') {
        if (res.roundResult) showRoundResult(res.roundResult);
      } else if (res.phase === 'end') {
        if (res.gameFinished) renderEndScreen(res.gameFinished);
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
