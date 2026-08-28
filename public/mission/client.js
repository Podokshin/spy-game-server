(() => {
  'use strict';

  const AVATARS = ['🦊', '🐼', '🐵', '🦁', '🐯', '🐨', '🐰', '🦄', '🐲', '🐙', '🦉', '🐺', '🐧', '🦖', '🐝', '🦋', '🐳', '🦅', '🐢', '🐬', '🦔', '🐔', '🐸', '🦈'];
  const SESSION_KEY = 'mission_online_session_v1';

  const screens = {
    menu: document.getElementById('screen-menu'),
    lobby: document.getElementById('screen-lobby'),
    mission: document.getElementById('screen-mission'),
    discussion: document.getElementById('screen-discussion'),
    guessing: document.getElementById('screen-guessing'),
    end: document.getElementById('screen-end'),
    skipped: document.getElementById('screen-skipped')
  };

  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
    el.skipVoteBtn.classList.toggle('hidden', name !== 'mission' && name !== 'discussion' && name !== 'guessing');
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

    missionCard: document.getElementById('missionCard'),
    missionText: document.getElementById('missionText'),
    missionReadyBtn: document.getElementById('missionReadyBtn'),
    readyHint: document.getElementById('readyHint'),
    forceStartBtn: document.getElementById('forceStartBtn'),

    timerBlock: document.getElementById('timerBlock'),
    timerRing: document.getElementById('timerRing'),
    timerDisplay: document.getElementById('timerDisplay'),
    pauseBtn: document.getElementById('pauseBtn'),
    endDiscussionBtn: document.getElementById('endDiscussionBtn'),
    discussionWaitHint: document.getElementById('discussionWaitHint'),

    guessProgress: document.getElementById('guessProgress'),
    guessMissionText: document.getElementById('guessMissionText'),
    guessVoteField: document.getElementById('guessVoteField'),
    guessOptions: document.getElementById('guessOptions'),
    submitGuessBtn: document.getElementById('submitGuessBtn'),
    guessWaitHint: document.getElementById('guessWaitHint'),
    forceFinishGuessBtn: document.getElementById('forceFinishGuessBtn'),
    guessResultField: document.getElementById('guessResultField'),
    guessResultLine: document.getElementById('guessResultLine'),
    guessResultCatchLine: document.getElementById('guessResultCatchLine'),
    nextGuessBtn: document.getElementById('nextGuessBtn'),
    waitNextHint: document.getElementById('waitNextHint'),

    scoreboardList: document.getElementById('scoreboardList'),
    playAgainBtn: document.getElementById('playAgainBtn'),
    waitPlayAgainHint: document.getElementById('waitPlayAgainHint'),
    leaveRoomBtn2: document.getElementById('leaveRoomBtn2'),

    skipVoteBtn: document.getElementById('skipVoteBtn'),
    skipVoteCount: document.getElementById('skipVoteCount'),
    skipVoteNeeded: document.getElementById('skipVoteNeeded'),
    leaveRoomBtnSkip: document.getElementById('leaveRoomBtnSkip')
  };

  const socket = io('/mission');

  let currentRoom = null;
  let isHost = false;
  let myPlayerId = null;
  let latestPlayers = [];
  let selectedAvatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
  let selectedGuessTarget = null;
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
        if (!res.ok) return showMenuError('Не удалось создать комнату');
        applyRoomUpdate(res);
        saveSession();
        showScreen('lobby');
      });
    } else {
      let attemptsLeft = 10;
      const tryJoin = () => {
        socket.emit('join_room', { code: partyParams.code, name: partyParams.name, avatar: partyParams.avatar }, (res) => {
          if (res.ok) {
            applyRoomUpdate(res);
            saveSession();
            showScreen('lobby');
            return;
          }
          attemptsLeft -= 1;
          if (attemptsLeft > 0) {
            setTimeout(tryJoin, 500);
          } else {
            showMenuError(res.error || 'Не удалось присоединиться к следующей игре — попробуйте войти по коду вручную');
          }
        });
      };
      tryJoin();
    }
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
    socket.emit('create_room', { name: el.playerName.value, avatar: selectedAvatar, partyCode: partyParams ? partyParams.code : undefined }, (res) => {
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
  el.lobbyTimerEnabled.addEventListener('change', () => {
    if (!isHost) return;
    el.lobbyTimerMinutesField.classList.toggle('hidden', !el.lobbyTimerEnabled.checked);
    pushSettings();
  });
  el.lobbyTimerMinutes.addEventListener('change', () => { if (isHost) pushSettings(); });

  function pushSettings() {
    socket.emit('update_settings', {
      timerEnabled: el.lobbyTimerEnabled.checked,
      timerMinutes: parseInt(el.lobbyTimerMinutes.value, 10) || 6
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
  el.leaveRoomBtnSkip.addEventListener('click', leaveRoom);

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
    refreshHostControls();
  }

  // Re-evaluates host-only button visibility for whichever screen is currently
  // showing, using the up-to-date `isHost` value. Needed because host migration
  // (e.g. the host disconnecting mid-round) arrives via a generic room_update
  // that otherwise only re-renders the lobby screen.
  function refreshHostControls() {
    if (screens.mission.classList.contains('active')) {
      el.forceStartBtn.classList.toggle('hidden', !isHost);
    }
    if (screens.discussion.classList.contains('active')) {
      el.pauseBtn.classList.toggle('hidden', !isHost);
      el.endDiscussionBtn.classList.toggle('hidden', !isHost);
      el.discussionWaitHint.classList.toggle('hidden', isHost);
    }
    if (screens.guessing.classList.contains('active')) {
      if (el.guessResultField.classList.contains('hidden')) {
        el.forceFinishGuessBtn.classList.toggle('hidden', !isHost);
      } else {
        el.nextGuessBtn.classList.toggle('hidden', !isHost);
        el.waitNextHint.classList.toggle('hidden', isHost);
      }
    }
    if (screens.end.classList.contains('active')) {
      el.playAgainBtn.classList.toggle('hidden', !isHost);
      el.waitPlayAgainHint.classList.toggle('hidden', isHost);
    }
  }

  function renderLobby(room) {
    el.roomCodeDisplay.textContent = room.code;
    el.playerCountLabel.textContent = room.players.length;
    el.lobbyPlayersList.innerHTML = room.players.map(p => `
      <span class="player-chip${p.connected === false ? ' disconnected' : ''}"><span class="player-avatar">${escapeHtml(p.avatar || '🙂')}</span> ${escapeHtml(p.name)}${p.isHost ? ' <span class="host-tag">★ хост</span>' : ''}${p.connected === false ? ' ⏳' : ''}</span>
    `).join('');

    el.lobbyTimerEnabled.checked = room.settings.timerEnabled;
    el.lobbyTimerMinutes.value = room.settings.timerMinutes;
    el.lobbyTimerMinutesField.classList.toggle('hidden', !room.settings.timerEnabled);

    const controlsDisabled = !isHost;
    el.lobbyTimerEnabled.disabled = controlsDisabled;
    el.lobbyTimerMinutes.disabled = controlsDisabled;

    const enoughPlayers = room.players.length >= 3;
    el.startGameBtn.classList.toggle('hidden', !isHost);
    el.startGameBtn.disabled = !enoughPlayers;
    el.waitingHostHint.classList.toggle('hidden', isHost);
    el.needMorePlayersHint.classList.toggle('hidden', !isHost || enoughPlayers);
  }

  // ---------- Mission reveal ----------
  function renderMissionCard(data) {
    el.missionText.textContent = data.missionText;
    el.missionReadyBtn.disabled = false;
    el.missionReadyBtn.classList.remove('hidden');
    el.readyHint.classList.add('hidden');
    el.forceStartBtn.classList.toggle('hidden', !isHost);
    showScreen('mission');
  }

  socket.on('your_mission', renderMissionCard);

  el.missionReadyBtn.addEventListener('click', () => {
    socket.emit('player_ready');
    el.missionReadyBtn.classList.add('hidden');
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

  // ---------- Guessing ----------
  function renderGuessingScreen(data) {
    selectedGuessTarget = null;
    el.guessProgress.textContent = `Миссия ${data.guessIndex + 1} из ${data.total}`;
    el.guessMissionText.textContent = data.missionText;

    el.guessVoteField.classList.remove('hidden');
    el.submitGuessBtn.disabled = true;
    el.submitGuessBtn.classList.remove('hidden');
    el.guessWaitHint.classList.add('hidden');
    el.forceFinishGuessBtn.classList.toggle('hidden', !isHost);
    el.guessResultField.classList.add('hidden');
    el.nextGuessBtn.classList.add('hidden');
    el.waitNextHint.classList.add('hidden');

    el.guessOptions.innerHTML = '';
    data.players.forEach(p => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vote-option-btn';
      btn.dataset.targetId = p.id;
      btn.textContent = `${p.avatar || '🙂'} ${p.name}`;
      btn.addEventListener('click', () => {
        selectedGuessTarget = p.id;
        el.guessOptions.querySelectorAll('.vote-option-btn').forEach(b => b.classList.toggle('selected', b === btn));
        el.submitGuessBtn.disabled = false;
      });
      el.guessOptions.appendChild(btn);
    });

    showScreen('guessing');
  }

  socket.on('guessing_started', (data) => {
    clearTimerTick();
    if (data.timeUp) playTimeUpSound();
    renderGuessingScreen(data);
  });

  el.submitGuessBtn.addEventListener('click', () => {
    if (!selectedGuessTarget) return;
    socket.emit('cast_guess', { guessedPlayerId: selectedGuessTarget });
    el.submitGuessBtn.classList.add('hidden');
    el.guessOptions.querySelectorAll('.vote-option-btn').forEach(b => b.disabled = true);
    el.guessWaitHint.classList.remove('hidden');
    el.guessWaitHint.textContent = 'Ответ принят. Ждём остальных…';
  });

  el.forceFinishGuessBtn.addEventListener('click', () => {
    socket.emit('force_finish_guess');
  });

  socket.on('guess_vote_update', ({ votedCount, total }) => {
    if (!el.guessWaitHint.classList.contains('hidden')) {
      el.guessWaitHint.textContent = `Ответили: ${votedCount} из ${total}`;
    }
  });

  function showGuessResult(data) {
    el.guessProgress.textContent = `Миссия ${data.guessIndex + 1} из ${data.total}`;
    el.guessVoteField.classList.add('hidden');
    el.submitGuessBtn.classList.add('hidden');
    el.guessWaitHint.classList.add('hidden');
    el.forceFinishGuessBtn.classList.add('hidden');

    el.guessResultLine.innerHTML = `Миссию выполнил(а): <b>${escapeHtml(data.ownerAvatar || '🙂')} ${escapeHtml(data.ownerName)}</b>`;
    el.guessResultCatchLine.textContent = data.caught
      ? `🎉 Спалили! Угадали: ${(data.correctGuesserNames || []).join(', ') || '—'}`
      : '🕵️ Никто не догадался — миссия выполнена незаметно!';
    el.guessResultField.classList.remove('hidden');

    const isLast = data.guessIndex + 1 >= data.total;
    el.nextGuessBtn.textContent = isLast ? 'Завершить игру' : 'Следующая миссия';
    el.nextGuessBtn.classList.toggle('hidden', !isHost);
    el.waitNextHint.classList.toggle('hidden', isHost);
  }

  socket.on('guess_result', showGuessResult);

  el.nextGuessBtn.addEventListener('click', () => {
    socket.emit('next_guess');
  });

  // ---------- End screen ----------
  function renderEndScreen(players, partyStandings) {
    const sorted = players.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
    el.scoreboardList.innerHTML = sorted.map(p => `
      <span class="player-chip">${escapeHtml(p.avatar || '🙂')} ${escapeHtml(p.name)} <span class="score-value">${p.score || 0}</span></span>
    `).join('');
    el.playAgainBtn.classList.toggle('hidden', !isHost);
    el.waitPlayAgainHint.classList.toggle('hidden', isHost);
    showScreen('end');
    if (window.PartyHub) {
      window.PartyHub.renderPartySection(document.getElementById('partySection'), {
        currentKey: 'mission',
        standings: partyStandings || [],
        isHost,
        onSelect: (gameKey) => socket.emit('select_next_game', { gameKey })
      });
    }
  }

  socket.on('game_finished', ({ players, partyStandings }) => {
    renderEndScreen(players, partyStandings);
    if (window.fireConfetti) window.fireConfetti();
  });

  socket.on('next_game_selected', ({ gameKey }) => {
    if (window.PartyHub && currentRoom) {
      window.PartyHub.goToGame(gameKey, currentRoom.code, el.playerName.value, selectedAvatar, isHost);
    }
  });

  el.playAgainBtn.addEventListener('click', () => {
    socket.emit('play_again');
  });

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
        currentKey: 'mission',
        standings: partyStandings || [],
        isHost,
        onSelect: (gameKey) => socket.emit('select_next_game', { gameKey })
      });
    }
  }

  socket.on('game_skipped', ({ players, partyStandings }) => {
    renderSkippedScreen(players, partyStandings);
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

      if (res.phase === 'missions') {
        if (res.yourMission) renderMissionCard(res.yourMission);
      } else if (res.phase === 'discussion') {
        if (res.discussion) renderDiscussionScreen(res.discussion);
      } else if (res.phase === 'guessing') {
        if (res.guessing) {
          renderGuessingScreen(res.guessing);
          if (res.guessing.awaitingNext && res.lastResult) showGuessResult(res.lastResult);
        }
      } else if (res.phase === 'end') {
        renderEndScreen(res.players, res.partyStandings);
      } else if (res.phase === 'skipped') {
        renderSkippedScreen(res.players, res.partyStandings);
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

  socket.on('disconnect', () => {
    if (currentRoom) {
      showMenuError('Соединение потеряно, пробуем восстановить связь…');
    }
  });
})();
