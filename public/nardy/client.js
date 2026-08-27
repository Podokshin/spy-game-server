(() => {
  'use strict';

  const AVATARS = ['🦊', '🐼', '🐵', '🦁', '🐯', '🐨', '🐰', '🦄', '🐲', '🐙', '🦉', '🐺', '🐧', '🦖', '🐝', '🦋', '🐳', '🦅', '🐢', '🐬', '🦔', '🐔', '🐸', '🦈'];
  const SESSION_KEY = 'nardy_online_session_v1';
  const COLOR_LABEL = { white: 'белых', black: 'чёрных' };
  const COLOR_LABEL_CAP = { white: 'Белые', black: 'Чёрные' };

  const screens = {
    menu: document.getElementById('screen-menu'),
    lobby: document.getElementById('screen-lobby'),
    board: document.getElementById('screen-board'),
    end: document.getElementById('screen-end')
  };
  const appEl = document.getElementById('app');

  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
    appEl.classList.toggle('wide', name === 'board');
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
    needSecondPlayerHint: document.getElementById('needSecondPlayerHint'),
    leaveRoomBtn: document.getElementById('leaveRoomBtn'),
    lobbyError: document.getElementById('lobbyError'),

    whitePlayerBadge: document.getElementById('whitePlayerBadge'),
    whitePlayerName: document.getElementById('whitePlayerName'),
    whitePlayerScore: document.getElementById('whitePlayerScore'),
    blackPlayerBadge: document.getElementById('blackPlayerBadge'),
    blackPlayerName: document.getElementById('blackPlayerName'),
    blackPlayerScore: document.getElementById('blackPlayerScore'),
    cubeValueDisplay: document.getElementById('cubeValueDisplay'),
    turnBanner: document.getElementById('turnBanner'),
    turnDot: document.getElementById('turnDot'),
    turnBannerText: document.getElementById('turnBannerText'),
    board: document.getElementById('board'),
    diceFaces: document.getElementById('diceFaces'),
    diceChips: document.getElementById('diceChips'),
    rollDiceBtn: document.getElementById('rollDiceBtn'),
    offerDoubleBtn: document.getElementById('offerDoubleBtn'),
    waitTurnHint: document.getElementById('waitTurnHint'),
    doubleOfferBox: document.getElementById('doubleOfferBox'),
    doubleOfferText: document.getElementById('doubleOfferText'),
    acceptDoubleBtn: document.getElementById('acceptDoubleBtn'),
    declineDoubleBtn: document.getElementById('declineDoubleBtn'),
    leaveRoomBtnBoard: document.getElementById('leaveRoomBtnBoard'),

    endTitle: document.getElementById('endTitle'),
    endResultLine: document.getElementById('endResultLine'),
    scoreboardList: document.getElementById('scoreboardList'),
    playAgainBtn: document.getElementById('playAgainBtn'),
    waitPlayAgainHint: document.getElementById('waitPlayAgainHint'),
    leaveRoomBtn2: document.getElementById('leaveRoomBtn2')
  };

  const socket = io('/nardy');

  let currentRoom = null;
  let isHost = false;
  let myPlayerId = null;
  let myColor = null;
  let selectedAvatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
  let hasConnectedBefore = false;

  // Игровое состояние текущей партии.
  let board = null;
  let turnColor = null;
  let dice = null;
  let movesLeft = [];
  let hasRolled = false;
  let cube = { value: 1, ownerColor: null };
  let doubleOffer = null;
  let selectedDie = null;

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

  // ---------- Menu ----------
  el.createRoomBtn.addEventListener('click', () => {
    el.menuError.classList.add('hidden');
    socket.emit('create_room', { name: el.playerName.value, avatar: selectedAvatar }, (res) => {
      if (!res.ok) return showMenuError('Не удалось создать комнату');
      applyRoomUpdate(res);
      saveSession();
      showScreen('lobby');
    });
  });

  el.joinRoomBtn.addEventListener('click', () => {
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

  function resetGameState() {
    board = null;
    turnColor = null;
    dice = null;
    movesLeft = [];
    hasRolled = false;
    cube = { value: 1, ownerColor: null };
    doubleOffer = null;
    selectedDie = null;
    myColor = null;
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
  el.leaveRoomBtn2.addEventListener('click', leaveRoom);
  el.leaveRoomBtnBoard.addEventListener('click', leaveRoom);

  function applyRoomUpdate(room) {
    currentRoom = room;
    if (room.playerId) myPlayerId = room.playerId;
    isHost = room.players.some(p => p.id === myPlayerId && p.isHost);
    const me = room.players.find(p => p.id === myPlayerId);
    if (me && me.color) myColor = me.color;
    history.replaceState(null, '', '?room=' + room.code);
    saveSession();

    updatePlayerBadges(room.players);

    if (room.phase === 'lobby') {
      renderLobby(room);
      showScreen('lobby');
    } else if (room.phase === 'end') {
      updateScoreboard(room.players);
      if (screens.end.classList.contains('active')) {
        el.playAgainBtn.classList.toggle('hidden', !isHost);
        el.waitPlayAgainHint.classList.toggle('hidden', isHost);
      }
    }
  }

  function renderLobby(room) {
    el.roomCodeDisplay.textContent = room.code;
    el.playerCountLabel.textContent = room.players.length;
    el.lobbyPlayersList.innerHTML = room.players.map(p => `
      <span class="player-chip${p.connected === false ? ' disconnected' : ''}"><span class="player-avatar">${escapeHtml(p.avatar || '🙂')}</span> ${escapeHtml(p.name)}${p.isHost ? ' <span class="host-tag">★ хост</span>' : ''}${p.connected === false ? ' ⏳' : ''}</span>
    `).join('');

    const enoughPlayers = room.players.length === 2;
    el.startGameBtn.classList.toggle('hidden', !isHost);
    el.startGameBtn.disabled = !enoughPlayers;
    el.waitingHostHint.classList.toggle('hidden', isHost || !enoughPlayers);
    el.needSecondPlayerHint.classList.toggle('hidden', enoughPlayers);
  }

  function updatePlayerBadges(players) {
    const white = players.find(p => p.color === 'white');
    const black = players.find(p => p.color === 'black');
    el.whitePlayerName.textContent = white ? white.name : '—';
    el.whitePlayerScore.textContent = white ? white.score : 0;
    el.blackPlayerName.textContent = black ? black.name : '—';
    el.blackPlayerScore.textContent = black ? black.score : 0;
    el.whitePlayerBadge.classList.toggle('active-turn', turnColor === 'white');
    el.blackPlayerBadge.classList.toggle('active-turn', turnColor === 'black');
  }

  function updateScoreboard(players) {
    const sorted = players.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
    el.scoreboardList.innerHTML = sorted.map(p => `
      <span class="player-chip"><span class="color-dot dot-${p.color || 'white'}"></span> ${escapeHtml(p.avatar || '🙂')} <b>${escapeHtml(p.name)}</b> <span class="score-value">${p.score || 0}</span></span>
    `).join('');
  }

  // ---------- Board rendering ----------
  const TOP_ROW = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const BOTTOM_ROW = [23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12];

  function pointHomeClass(point) {
    if (point >= 18 && point <= 23) return 'home-white';
    if (point >= 6 && point <= 11) return 'home-black';
    return '';
  }

  function legalSourcesForDie(die) {
    if (!board || !myColor || die == null) return new Set();
    return new Set(window.NardyRules.listLegalSources(board, myColor, die));
  }

  function canInteract() {
    return board && myColor && turnColor === myColor && hasRolled && !doubleOffer;
  }

  function renderBoard() {
    el.board.innerHTML = '';
    if (!board) return;

    const legalSet = canInteract() && selectedDie != null ? legalSourcesForDie(selectedDie) : new Set();

    const buildRow = (pointsInRow) => {
      pointsInRow.forEach(point => {
        const cell = document.createElement('div');
        const homeClass = pointHomeClass(point);
        cell.className = 'point' + (homeClass ? ' ' + homeClass : '') + (point === 0 || point === 12 ? ' start-point' : '');
        cell.dataset.point = String(point);

        const whiteCount = board.white[point];
        const blackCount = board.black[point];

        const checkersWrap = document.createElement('div');
        checkersWrap.className = 'point-checkers';
        if (whiteCount > 0) checkersWrap.appendChild(makeCheckerPill('white', whiteCount));
        if (blackCount > 0) checkersWrap.appendChild(makeCheckerPill('black', blackCount));
        cell.appendChild(checkersWrap);

        const label = document.createElement('span');
        label.className = 'point-label';
        label.textContent = String(point + 1);
        cell.appendChild(label);

        if (legalSet.has(point)) {
          cell.classList.add('selectable');
          cell.addEventListener('click', () => onPointClick(point));
        }

        el.board.appendChild(cell);
      });
    };

    buildRow(TOP_ROW);
    buildRow(BOTTOM_ROW);
  }

  function makeCheckerPill(color, count) {
    const pill = document.createElement('span');
    pill.className = 'checker-pill';
    const dot = document.createElement('span');
    dot.className = 'checker-dot ' + color;
    pill.appendChild(dot);
    if (count > 1) {
      const countEl = document.createElement('span');
      countEl.className = 'checker-count';
      countEl.textContent = String(count);
      pill.appendChild(countEl);
    }
    return pill;
  }

  function onPointClick(point) {
    if (!canInteract() || selectedDie == null) return;
    const move = window.NardyRules.describeMove(board, myColor, point, selectedDie);
    if (!move.legal) return;
    socket.emit('move_checker', { from: point, die: selectedDie });
  }

  function renderDice() {
    el.diceFaces.innerHTML = (dice || []).map(d => `<span class="die-face">${d}</span>`).join('');

    el.diceChips.innerHTML = '';
    movesLeft.forEach((value, idx) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'die-chip' + (selectedDie === value ? ' selected' : '');
      chip.textContent = String(value);
      chip.disabled = !canInteract();
      chip.addEventListener('click', () => {
        selectedDie = selectedDie === value ? null : value;
        renderDice();
        renderBoard();
      });
      el.diceChips.appendChild(chip);
    });
  }

  function renderTurnAndControls() {
    el.turnBannerText.textContent = turnColor ? `Ход ${COLOR_LABEL[turnColor] || ''}` : '';
    el.turnDot.classList.toggle('dot-black', turnColor === 'black');
    updatePlayerBadges(currentRoom ? currentRoom.players : []);

    const myTurn = turnColor === myColor;
    el.rollDiceBtn.classList.toggle('hidden', !myTurn || hasRolled || !!doubleOffer);
    el.waitTurnHint.classList.toggle('hidden', myTurn);

    const canOfferDouble = myTurn && !hasRolled && !doubleOffer && (!cube.ownerColor || cube.ownerColor === myColor);
    el.offerDoubleBtn.classList.toggle('hidden', !canOfferDouble);

    el.cubeValueDisplay.textContent = String(cube.value);

    if (doubleOffer) {
      const iAmProposer = doubleOffer.fromColor === myColor;
      el.doubleOfferBox.classList.toggle('hidden', false);
      el.acceptDoubleBtn.classList.toggle('hidden', iAmProposer);
      el.declineDoubleBtn.classList.toggle('hidden', iAmProposer);
      el.doubleOfferText.textContent = iAmProposer
        ? `Вы предложили удвоить куб до ×${cube.value * 2}. Ждём решения соперника…`
        : `Соперник предлагает удвоить куб до ×${cube.value * 2}.`;
    } else {
      el.doubleOfferBox.classList.add('hidden');
    }
  }

  function renderAll() {
    renderBoard();
    renderDice();
    renderTurnAndControls();
  }

  el.rollDiceBtn.addEventListener('click', () => {
    socket.emit('roll_dice');
  });

  el.offerDoubleBtn.addEventListener('click', () => {
    socket.emit('offer_double');
  });

  el.acceptDoubleBtn.addEventListener('click', () => {
    socket.emit('respond_double', { accept: true });
  });

  el.declineDoubleBtn.addEventListener('click', () => {
    socket.emit('respond_double', { accept: false });
  });

  function applyGameState(state) {
    board = state.board;
    turnColor = state.turnColor;
    dice = state.dice;
    movesLeft = state.movesLeft || [];
    hasRolled = !!state.hasRolled;
    cube = state.cube || { value: 1, ownerColor: null };
    doubleOffer = state.doubleOffer || null;
    selectedDie = movesLeft.length ? movesLeft[0] : null;
  }

  socket.on('round_started', (data) => {
    if (currentRoom) currentRoom.players = data.players;
    const me = data.players.find(p => p.id === myPlayerId);
    if (me) myColor = me.color;
    applyGameState(data);
    showScreen('board');
    renderAll();
  });

  socket.on('dice_rolled', ({ dice: rolled, movesLeft: ml }) => {
    dice = rolled;
    movesLeft = ml;
    hasRolled = true;
    selectedDie = movesLeft.length ? movesLeft[0] : null;
    renderAll();
  });

  socket.on('checker_moved', ({ board: b, movesLeft: ml }) => {
    board = b;
    movesLeft = ml;
    selectedDie = movesLeft.length ? movesLeft[0] : null;
    renderAll();
  });

  socket.on('turn_changed', ({ turnColor: tc }) => {
    turnColor = tc;
    dice = null;
    movesLeft = [];
    hasRolled = false;
    selectedDie = null;
    renderAll();
  });

  socket.on('double_offered', ({ fromColor }) => {
    doubleOffer = { fromColor };
    renderTurnAndControls();
  });

  socket.on('double_accepted', ({ cube: c }) => {
    cube = c;
    doubleOffer = null;
    renderAll();
  });

  function renderEndScreen(data) {
    if (data.players && currentRoom) currentRoom.players = data.players;
    const iWon = data.winnerColor === myColor;
    el.endTitle.textContent = iWon ? '🏆 Вы выиграли!' : '😔 Соперник выиграл';

    let line = `${COLOR_LABEL_CAP[data.winnerColor]} выигрывают`;
    if (data.declined) {
      line += ` — соперник отказался от удвоения куба.`;
    } else if (data.marsa) {
      line += ` МАРС! Соперник не успел вывести ни одной шашки.`;
    } else {
      line += '.';
    }
    line += ` +${data.points} ${data.points === 1 ? 'очко' : 'очка'}${data.cubeValue > 1 ? ` (куб ×${data.cubeValue})` : ''}.`;
    el.endResultLine.textContent = line;

    if (data.players) updateScoreboard(data.players);
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

      if (res.phase === 'playing' && res.playing) {
        applyGameState(res.playing);
        showScreen('board');
        renderAll();
      } else if (res.phase === 'end' && res.result) {
        renderEndScreen(Object.assign({ players: res.players }, res.result));
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
