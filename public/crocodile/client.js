(() => {
  'use strict';

  const AVATARS = ['🦊', '🐼', '🐵', '🦁', '🐯', '🐨', '🐰', '🦄', '🐲', '🐙', '🦉', '🐺', '🐧', '🦖', '🐝', '🦋', '🐳', '🦅', '🐢', '🐬', '🦔', '🐔', '🐸', '🦈'];
  const SESSION_KEY = 'crocodile_online_session_v1';
  const COLORS = ['#1a1a1a', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#8d6e63', '#ec4899', '#14b8a6', '#757575', '#1e3a5f'];

  const screens = {
    menu: document.getElementById('screen-menu'),
    lobby: document.getElementById('screen-lobby'),
    choosing: document.getElementById('screen-choosing'),
    drawing: document.getElementById('screen-drawing'),
    reveal: document.getElementById('screen-reveal'),
    end: document.getElementById('screen-end'),
    skipped: document.getElementById('screen-skipped')
  };
  const appEl = document.getElementById('app');

  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
    appEl.classList.toggle('wide', name === 'drawing');
    el.skipVoteBtn.classList.toggle('hidden', name !== 'choosing' && name !== 'drawing' && name !== 'reveal');
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
    totalRoundsInput: document.getElementById('totalRoundsInput'),
    roundSecondsInput: document.getElementById('roundSecondsInput'),
    playerCountLabel: document.getElementById('playerCountLabel'),
    lobbyPlayersList: document.getElementById('lobbyPlayersList'),
    startGameBtn: document.getElementById('startGameBtn'),
    waitingHostHint: document.getElementById('waitingHostHint'),
    needMorePlayersHint: document.getElementById('needMorePlayersHint'),
    leaveRoomBtn: document.getElementById('leaveRoomBtn'),
    lobbyError: document.getElementById('lobbyError'),

    choosingRoundLabel: document.getElementById('choosingRoundLabel'),
    wordChoiceGrid: document.getElementById('wordChoiceGrid'),
    waitingArtistHint: document.getElementById('waitingArtistHint'),
    artistNameLabel: document.getElementById('artistNameLabel'),

    drawArtistBadge: document.getElementById('drawArtistBadge'),
    drawTimer: document.getElementById('drawTimer'),
    drawProgress: document.getElementById('drawProgress'),
    wordHintRow: document.getElementById('wordHintRow'),
    canvas: document.getElementById('drawCanvas'),
    toolRow: document.getElementById('toolRow'),
    colorSwatches: document.getElementById('colorSwatches'),
    brushThinBtn: document.getElementById('brushThinBtn'),
    brushMediumBtn: document.getElementById('brushMediumBtn'),
    brushThickBtn: document.getElementById('brushThickBtn'),
    eraserBtn: document.getElementById('eraserBtn'),
    undoBtn: document.getElementById('undoBtn'),
    clearCanvasBtn: document.getElementById('clearCanvasBtn'),
    guessChat: document.getElementById('guessChat'),
    guessForm: document.getElementById('guessForm'),
    guessInput: document.getElementById('guessInput'),
    alreadyGuessedHint: document.getElementById('alreadyGuessedHint'),
    leaveRoomBtnDraw: document.getElementById('leaveRoomBtnDraw'),

    revealWord: document.getElementById('revealWord'),
    revealTimeUpHint: document.getElementById('revealTimeUpHint'),
    revealGuessersList: document.getElementById('revealGuessersList'),
    revealScoreList: document.getElementById('revealScoreList'),
    nextRoundBtn: document.getElementById('nextRoundBtn'),
    waitNextRoundHint: document.getElementById('waitNextRoundHint'),

    scoreboardList: document.getElementById('scoreboardList'),
    playAgainBtn: document.getElementById('playAgainBtn'),
    waitPlayAgainHint: document.getElementById('waitPlayAgainHint'),
    leaveRoomBtn2: document.getElementById('leaveRoomBtn2'),

    skipVoteBtn: document.getElementById('skipVoteBtn'),
    skipVoteCount: document.getElementById('skipVoteCount'),
    skipVoteNeeded: document.getElementById('skipVoteNeeded'),
    leaveRoomBtnSkip: document.getElementById('leaveRoomBtnSkip')
  };

  const socket = io('/crocodile');

  let currentRoom = null;
  let isHost = false;
  let myPlayerId = null;
  let selectedAvatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
  let hasConnectedBefore = false;

  // Игровое состояние текущей партии.
  let isArtist = false;
  let artistId = null;
  let haveGuessedCorrectly = false;
  let roundEndsAt = null;
  let roundTotalMs = null;
  let tickHandle = null;

  // ---------- Рисование ----------
  let ctx = null;
  let localStrokes = []; // [{color,width,points:[[x,y],...]}] нормализованные 0..1
  let myDrawing = false;
  let myLastPoint = null;
  let remoteLastPoint = null;
  let currentColor = COLORS[0];
  let currentWidth = 4;
  const THIN = 3, MEDIUM = 8, THICK = 16, ERASER_WIDTH = 28, ERASER_COLOR = '#f7f6fb';

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
  function tone(freq, startTime, duration, peakGain, type) {
    const ctxA = getAudioCtx();
    if (!ctxA) return;
    const osc = ctxA.createOscillator();
    const gain = ctxA.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctxA.destination);
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }
  function playCorrectSound() {
    const ctxA = getAudioCtx();
    if (!ctxA) return;
    const now = ctxA.currentTime;
    tone(520, now, 0.09, 0.22, 'triangle');
    tone(780, now + 0.07, 0.16, 0.2, 'triangle');
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
  function pushSettings() {
    socket.emit('update_settings', {
      totalRounds: parseInt(el.totalRoundsInput.value, 10) || 6,
      roundSeconds: parseInt(el.roundSecondsInput.value, 10) || 80
    });
  }
  el.totalRoundsInput.addEventListener('change', () => { if (isHost) pushSettings(); });
  el.roundSecondsInput.addEventListener('change', () => { if (isHost) pushSettings(); });

  el.startGameBtn.addEventListener('click', () => {
    socket.emit('start_game');
  });

  function resetGameState() {
    isArtist = false;
    artistId = null;
    haveGuessedCorrectly = false;
    roundEndsAt = null;
    roundTotalMs = null;
    clearTimerTick();
    localStrokes = [];
  }

  function leaveRoom() {
    socket.emit('leave_room');
    currentRoom = null;
    isHost = false;
    myPlayerId = null;
    resetGameState();
    clearSession();
    applyInviteMode(null);
    showScreen('menu');
  }
  el.leaveRoomBtn.addEventListener('click', leaveRoom);
  el.leaveRoomBtnDraw.addEventListener('click', leaveRoom);
  el.leaveRoomBtn2.addEventListener('click', leaveRoom);
  el.leaveRoomBtnSkip.addEventListener('click', leaveRoom);

  function applyRoomUpdate(room) {
    currentRoom = room;
    if (room.playerId) myPlayerId = room.playerId;
    isHost = room.players.some(p => p.id === myPlayerId && p.isHost);
    history.replaceState(null, '', '?room=' + room.code);
    saveSession();

    if (room.phase === 'lobby') {
      renderLobby(room);
      showScreen('lobby');
    } else if (room.phase === 'end') {
      updateScoreboard(room.players);
    }

    refreshHostControls();
  }

  function refreshHostControls() {
    if (screens.reveal.classList.contains('active')) {
      el.nextRoundBtn.classList.toggle('hidden', !isHost);
      el.waitNextRoundHint.classList.toggle('hidden', isHost);
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

    if (room.settings) {
      el.totalRoundsInput.value = room.settings.totalRounds;
      el.roundSecondsInput.value = room.settings.roundSeconds;
    }
    const controlsDisabled = !isHost;
    el.totalRoundsInput.disabled = controlsDisabled;
    el.roundSecondsInput.disabled = controlsDisabled;

    const enoughPlayers = room.players.length >= 3;
    el.startGameBtn.classList.toggle('hidden', !isHost);
    el.startGameBtn.disabled = !enoughPlayers;
    el.waitingHostHint.classList.toggle('hidden', isHost);
    el.needMorePlayersHint.classList.toggle('hidden', !isHost || enoughPlayers);
  }

  // ---------- Выбор слова ----------
  socket.on('round_choosing', (data) => {
    resetGameState();
    artistId = data.artistId;
    isArtist = data.artistId === myPlayerId;
    el.choosingRoundLabel.textContent = `Раунд ${data.round} из ${data.totalRounds}`;
    el.wordChoiceGrid.innerHTML = '';
    el.wordChoiceGrid.classList.add('hidden');
    el.waitingArtistHint.classList.toggle('hidden', isArtist);
    el.artistNameLabel.textContent = data.artistName || 'Игрок';
    showScreen('choosing');
  });

  socket.on('your_word_choices', (data) => {
    el.wordChoiceGrid.innerHTML = data.choices.map(w => `<button type="button" class="word-choice-btn" data-word="${escapeHtml(w)}">${escapeHtml(w)}</button>`).join('');
    el.wordChoiceGrid.classList.remove('hidden');
    el.waitingArtistHint.classList.add('hidden');
    el.wordChoiceGrid.querySelectorAll('.word-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        socket.emit('choose_word', { word: btn.dataset.word });
        el.wordChoiceGrid.querySelectorAll('.word-choice-btn').forEach(b => { b.disabled = true; });
      });
    });
  });

  // ---------- Рисование: канвас ----------
  function resizeCanvas() {
    const rect = el.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    el.canvas.width = rect.width * dpr;
    el.canvas.height = rect.height * dpr;
    ctx = el.canvas.getContext('2d');
    // setTransform, а не scale — scale накапливается поверх текущей
    // трансформации при каждом повторном вызове (например, на resize),
    // из-за чего масштаб постепенно "уезжал" и точки рисования всё сильнее
    // расходились с курсором к правому нижнему углу. setTransform всегда
    // задаёт трансформацию заново, а не домножает её.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    redrawAll();
  }
  window.addEventListener('resize', () => { if (screens.drawing.classList.contains('active')) resizeCanvas(); });

  function redrawAll() {
    if (!ctx) return;
    const rect = el.canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    localStrokes.forEach(stroke => {
      for (let i = 1; i < stroke.points.length; i++) {
        drawSegment(stroke.points[i - 1][0], stroke.points[i - 1][1], stroke.points[i][0], stroke.points[i][1], stroke.color, stroke.width);
      }
      if (stroke.points.length === 1) {
        drawDot(stroke.points[0][0], stroke.points[0][1], stroke.color, stroke.width);
      }
    });
  }

  function drawSegment(x1, y1, x2, y2, color, width) {
    if (!ctx) return;
    const rect = el.canvas.getBoundingClientRect();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1 * rect.width, y1 * rect.height);
    ctx.lineTo(x2 * rect.width, y2 * rect.height);
    ctx.stroke();
  }

  function drawDot(x, y, color, width) {
    if (!ctx) return;
    const rect = el.canvas.getBoundingClientRect();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x * rect.width, y * rect.height, width / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function toNormalized(clientX, clientY) {
    const rect = el.canvas.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
    };
  }

  el.canvas.addEventListener('pointerdown', (e) => {
    if (!isArtist) return;
    myDrawing = true;
    try { el.canvas.setPointerCapture(e.pointerId); } catch (err) { /* редкий edge case, не критично — рисование продолжает работать и без захвата */ }
    const p = toNormalized(e.clientX, e.clientY);
    myLastPoint = p;
    localStrokes.push({ color: currentColor, width: currentWidth, points: [[p.x, p.y]] });
    drawDot(p.x, p.y, currentColor, currentWidth);
    socket.emit('draw_start', { x: p.x, y: p.y, color: currentColor, width: currentWidth });
  });

  el.canvas.addEventListener('pointermove', (e) => {
    if (!isArtist || !myDrawing) return;
    const p = toNormalized(e.clientX, e.clientY);
    const stroke = localStrokes[localStrokes.length - 1];
    stroke.points.push([p.x, p.y]);
    drawSegment(myLastPoint.x, myLastPoint.y, p.x, p.y, currentColor, currentWidth);
    myLastPoint = p;
    socket.emit('draw_point', { x: p.x, y: p.y });
  });

  function endMyStroke() {
    if (!myDrawing) return;
    myDrawing = false;
    myLastPoint = null;
    socket.emit('draw_end');
  }
  el.canvas.addEventListener('pointerup', endMyStroke);
  el.canvas.addEventListener('pointercancel', endMyStroke);
  el.canvas.addEventListener('pointerleave', () => { if (myDrawing) endMyStroke(); });

  socket.on('draw_start', (data) => {
    remoteLastPoint = { x: data.x, y: data.y };
    localStrokes.push({ color: data.color, width: data.width, points: [[data.x, data.y]] });
    drawDot(data.x, data.y, data.color, data.width);
  });
  socket.on('draw_point', (data) => {
    const stroke = localStrokes[localStrokes.length - 1];
    if (!stroke || !remoteLastPoint) return;
    stroke.points.push([data.x, data.y]);
    drawSegment(remoteLastPoint.x, remoteLastPoint.y, data.x, data.y, stroke.color, stroke.width);
    remoteLastPoint = { x: data.x, y: data.y };
  });
  socket.on('draw_end', () => { remoteLastPoint = null; });
  socket.on('clear_canvas', () => {
    localStrokes = [];
    if (ctx) { const rect = el.canvas.getBoundingClientRect(); ctx.clearRect(0, 0, rect.width, rect.height); }
  });

  // ---------- Инструменты (только художник) ----------
  const brushButtons = [
    [THIN, el.brushThinBtn],
    [MEDIUM, el.brushMediumBtn],
    [THICK, el.brushThickBtn]
  ];

  function refreshToolButtons() {
    const isEraser = currentColor === ERASER_COLOR;
    brushButtons.forEach(([width, btn]) => btn.classList.toggle('active', !isEraser && currentWidth === width));
    el.eraserBtn.classList.toggle('active', isEraser);
    el.colorSwatches.querySelectorAll('.color-swatch').forEach(b => b.classList.toggle('active', !isEraser && b.dataset.color === currentColor));
  }

  el.colorSwatches.innerHTML = COLORS.map((c, i) => `<button type="button" class="color-swatch${i === 0 ? ' active' : ''}" style="background:${c}" data-color="${c}" aria-label="Цвет ${c}"></button>`).join('');
  el.colorSwatches.querySelectorAll('.color-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      currentColor = btn.dataset.color;
      refreshToolButtons();
    });
  });

  function setBrush(width) {
    currentWidth = width;
    if (currentColor === ERASER_COLOR) currentColor = COLORS[0];
    refreshToolButtons();
  }
  brushButtons.forEach(([width, btn]) => btn.addEventListener('click', () => setBrush(width)));

  el.eraserBtn.addEventListener('click', () => {
    currentColor = ERASER_COLOR;
    currentWidth = ERASER_WIDTH;
    refreshToolButtons();
  });

  el.undoBtn.addEventListener('click', () => {
    if (localStrokes.length === 0) return;
    localStrokes.pop();
    redrawAll();
    socket.emit('undo_stroke');
  });
  socket.on('undo_stroke', () => {
    localStrokes.pop();
    redrawAll();
  });

  el.clearCanvasBtn.addEventListener('click', () => {
    localStrokes = [];
    if (ctx) { const rect = el.canvas.getBoundingClientRect(); ctx.clearRect(0, 0, rect.width, rect.height); }
    socket.emit('clear_canvas');
  });

  // ---------- Раунд рисования ----------
  function renderDrawingScreen(payload) {
    showScreen('drawing');
    artistId = payload.artistId;
    isArtist = payload.artistId === myPlayerId;
    haveGuessedCorrectly = false;
    roundEndsAt = payload.endsAt;
    roundTotalMs = payload.totalMs;

    el.drawArtistBadge.textContent = isArtist ? '✏️ Вы рисуете' : `✏️ ${payload.artistName || 'Игрок'} рисует`;
    el.toolRow.classList.toggle('hidden', !isArtist);
    el.guessForm.classList.toggle('hidden', isArtist);
    el.alreadyGuessedHint.classList.add('hidden');
    el.guessChat.innerHTML = '';
    el.guessInput.value = '';

    if (!isArtist && payload.wordLength) {
      el.wordHintRow.textContent = new Array(payload.wordLength).fill('_').join(' ');
      el.wordHintRow.classList.remove('hidden');
    } else {
      el.wordHintRow.classList.add('hidden');
    }

    updateProgress(0, currentRoom ? currentRoom.players.length - 1 : 0);
    resizeCanvas();
    startTimerTick();
  }

  socket.on('round_started', renderDrawingScreen);

  socket.on('your_word', (data) => {
    if (isArtist) {
      el.drawArtistBadge.textContent = `✏️ Вы рисуете: ${data.word}`;
    }
  });

  function updateProgress(count, total) {
    el.drawProgress.textContent = `${count}/${total} угадали`;
  }

  function startTimerTick() {
    clearTimerTick();
    updateTimerDisplay();
    tickHandle = setInterval(updateTimerDisplay, 250);
  }
  function clearTimerTick() {
    if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
  }
  function updateTimerDisplay() {
    if (!roundEndsAt) return;
    const remaining = Math.max(0, roundEndsAt - Date.now());
    const totalSeconds = Math.ceil(remaining / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    el.drawTimer.textContent = `${m}:${s}`;
  }

  el.guessForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = el.guessInput.value.trim();
    if (!text || haveGuessedCorrectly) return;
    socket.emit('submit_guess', { text });
    el.guessInput.value = '';
  });

  function appendChatLine(html, cls) {
    const line = document.createElement('div');
    line.className = 'guess-chat-line' + (cls ? ' ' + cls : '');
    line.innerHTML = html;
    el.guessChat.appendChild(line);
    el.guessChat.scrollTop = el.guessChat.scrollHeight;
  }

  let correctCountThisRound = 0;
  socket.on('correct_guess', (data) => {
    correctCountThisRound = data.rank;
    updateProgress(correctCountThisRound, currentRoom ? currentRoom.players.length - 1 : 0);
    appendChatLine(`✅ <b>${escapeHtml(data.name)}</b> угадал(а)! (+${data.points})`, 'correct');
    if (data.playerId === myPlayerId) {
      haveGuessedCorrectly = true;
      el.guessForm.classList.add('hidden');
      el.alreadyGuessedHint.classList.remove('hidden');
      playCorrectSound();
    }
  });

  socket.on('guess_message', (data) => {
    appendChatLine(`<b>${escapeHtml(data.name)}:</b> ${escapeHtml(data.text)}`);
  });

  // ---------- Итог раунда ----------
  socket.on('round_ended', (data) => {
    clearTimerTick();
    correctCountThisRound = 0;
    el.revealWord.textContent = data.word;
    el.revealTimeUpHint.textContent = data.timeUp ? '⏰ Время вышло!' : '🎉 Все угадали!';
    el.revealGuessersList.innerHTML = data.correctGuessers.length
      ? data.correctGuessers.map(g => `<span class="player-chip correct-guesser">#${g.rank} ${escapeHtml(g.avatar || '🙂')} ${escapeHtml(g.name)} <span class="score-value">+${g.points}</span></span>`).join('')
      : '<span class="player-chip">Никто не угадал</span>';
    updateScoreboard(data.players, el.revealScoreList);
    showScreen('reveal');
    refreshHostControls();
  });

  function updateScoreboard(players, targetEl) {
    const sorted = players.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
    const html = sorted.map(p => `<span class="player-chip">${escapeHtml(p.avatar || '🙂')} ${escapeHtml(p.name)} <span class="score-value">${p.score || 0}</span></span>`).join('');
    (targetEl || el.scoreboardList).innerHTML = html;
  }

  el.nextRoundBtn.addEventListener('click', () => socket.emit('next_round'));

  // ---------- Итоги игры ----------
  function renderEndScreen(players, partyStandings) {
    updateScoreboard(players);
    showScreen('end');
    refreshHostControls();
    if (window.PartyHub) {
      window.PartyHub.renderPartySection(document.getElementById('partySection'), {
        currentKey: 'crocodile',
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
        currentKey: 'crocodile',
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
    applyRoomUpdate(Object.assign({ playerId: myPlayerId }, room));
  });

  // ---------- Reconnect ----------
  function attemptRejoin() {
    const saved = loadSession();
    if (!saved) return;
    socket.emit('rejoin', saved, (res) => {
      if (!res || !res.ok) {
        clearSession();
        showMenuError(res && res.error ? res.error : 'Сессия истекла, зайдите заново');
        showScreen('menu');
        return;
      }
      applyRoomUpdate(res);

      if (res.phase === 'choosing' && res.round) {
        artistId = res.round.artistId;
        isArtist = res.round.isArtist;
        el.wordChoiceGrid.innerHTML = '';
        el.wordChoiceGrid.classList.add('hidden');
        el.waitingArtistHint.classList.toggle('hidden', isArtist);
        showScreen('choosing');
        if (isArtist && res.round.choices) {
          el.wordChoiceGrid.innerHTML = res.round.choices.map(w => `<button type="button" class="word-choice-btn" data-word="${escapeHtml(w)}">${escapeHtml(w)}</button>`).join('');
          el.wordChoiceGrid.classList.remove('hidden');
          el.wordChoiceGrid.querySelectorAll('.word-choice-btn').forEach(btn => {
            btn.addEventListener('click', () => {
              socket.emit('choose_word', { word: btn.dataset.word });
              el.wordChoiceGrid.querySelectorAll('.word-choice-btn').forEach(b => { b.disabled = true; });
            });
          });
        }
      } else if (res.phase === 'drawing' && res.round) {
        localStrokes = (res.round.strokes || []).map(s => ({ color: s.color, width: s.width, points: s.points.slice() }));
        const wasAlreadyCorrect = res.round.correctGuessers.some(g => g.playerId === myPlayerId);
        // renderDrawingScreen сбрасывает haveGuessedCorrectly в false как для
        // старта свежего раунда — восстанавливаем реальное состояние уже после неё.
        renderDrawingScreen({
          artistId: res.round.artistId,
          artistName: (currentRoom.players.find(p => p.id === res.round.artistId) || {}).name,
          wordLength: res.round.wordLength,
          endsAt: res.round.endsAt,
          totalMs: res.round.totalMs
        });
        if (isArtist && res.round.word) {
          el.drawArtistBadge.textContent = `✏️ Вы рисуете: ${res.round.word}`;
        }
        if (wasAlreadyCorrect) {
          haveGuessedCorrectly = true;
          el.guessForm.classList.add('hidden');
          el.alreadyGuessedHint.classList.remove('hidden');
        }
        updateProgress(res.round.correctGuessers.length, currentRoom.players.length - 1);
      } else if (res.phase === 'reveal' && res.reveal) {
        el.revealWord.textContent = res.reveal.word;
        el.revealTimeUpHint.textContent = '';
        el.revealGuessersList.innerHTML = res.reveal.correctGuessers.length
          ? res.reveal.correctGuessers.map(g => `<span class="player-chip correct-guesser">#${g.rank} ${escapeHtml(g.avatar || '🙂')} ${escapeHtml(g.name)} <span class="score-value">+${g.points}</span></span>`).join('')
          : '<span class="player-chip">Никто не угадал</span>';
        updateScoreboard(res.players, el.revealScoreList);
        showScreen('reveal');
      } else if (res.phase === 'end' && res.ended) {
        renderEndScreen(res.ended.players, res.ended.partyStandings);
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

  socket.on('disconnect', () => {
    if (currentRoom) {
      showMenuError('Соединение потеряно, пробуем восстановить связь…');
    }
  });
})();
