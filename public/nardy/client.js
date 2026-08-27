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
    boardFrame: document.getElementById('boardFrame'),
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

  // Анимация ходов: пока летит "призрак" собственного хода, ждём его
  // завершения перед тем, как применить пришедшее с сервера состояние.
  let selfAnimInFlight = false;
  let pendingSelfState = null;

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
    myColor = null;
    selfAnimInFlight = false;
    pendingSelfState = null;
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
  const MAX_VISIBLE_CHECKERS = 15; // столько шашек максимум может быть на одной точке — показываем все, без "+N"
  const STACK_OVERLAP = 0.4; // доля размера шашки, на которую следующая перекрывает предыдущую

  function pointHomeClass(point) {
    if (point >= 18 && point <= 23) return 'home-white';
    if (point >= 6 && point <= 11) return 'home-black';
    return '';
  }

  function canInteract() {
    return !!(board && myColor && turnColor === myColor && hasRolled && !doubleOffer);
  }

  // Считает, куда можно сходить с точки `fromPoint` оставшимися кубиками.
  // Возвращает Map: 'p<point>' | 'off'  ->  значение кубика, которым это достигается.
  function computeDestinations(fromPoint) {
    const map = new Map();
    if (!canInteract()) return map;
    if (board[myColor][fromPoint] <= 0) return map;
    const uniqueDice = Array.from(new Set(movesLeft));
    uniqueDice.forEach(die => {
      const move = window.NardyRules.describeMove(board, myColor, fromPoint, die);
      if (!move.legal) return;
      if (move.bearOff) {
        if (!map.has('off')) map.set('off', die);
      } else {
        const key = 'p' + move.to;
        if (!map.has(key)) map.set(key, die);
      }
    });
    return map;
  }

  function renderBoard() {
    el.boardFrame.innerHTML = '';
    if (!board) return;

    el.boardFrame.appendChild(buildOffTray('white'));
    el.boardFrame.appendChild(buildBoardGrid());
    el.boardFrame.appendChild(buildOffTray('black'));
  }

  function buildBoardGrid() {
    const boardEl = document.createElement('div');
    boardEl.className = 'board';

    const bar = document.createElement('div');
    bar.className = 'bar';
    boardEl.appendChild(bar);

    const buildRow = (pointsInRow, rowName) => {
      pointsInRow.forEach((point, colIdx) => {
        const cell = document.createElement('div');
        const homeClass = pointHomeClass(point);
        cell.className = 'point tri-' + (colIdx % 2 === 0 ? 'a' : 'b') +
          (homeClass ? ' ' + homeClass : '') +
          (point === 0 || point === 12 ? ' start-point' : '');
        cell.dataset.point = String(point);
        cell.dataset.row = rowName;

        const tri = document.createElement('div');
        tri.className = 'point-tri';
        cell.appendChild(tri);

        const stack = document.createElement('div');
        stack.className = 'point-stack';
        renderStackInto(stack, point, rowName);
        cell.appendChild(stack);

        const label = document.createElement('span');
        label.className = 'point-label';
        label.textContent = String(point + 1);
        cell.appendChild(label);

        boardEl.appendChild(cell);
      });
    };

    buildRow(TOP_ROW, 'top');
    buildRow(BOTTOM_ROW, 'bottom');
    return boardEl;
  }

  function buildOffTray(color) {
    const tray = document.createElement('div');
    tray.className = 'off-tray';
    tray.dataset.color = color;

    const label = document.createElement('div');
    label.className = 'off-tray-label';
    label.textContent = 'Выход';
    tray.appendChild(label);

    const stack = document.createElement('div');
    stack.className = 'off-tray-stack';
    const count = (board.borneOff && board.borneOff[color]) || 0;
    const visible = Math.min(count, MAX_VISIBLE_CHECKERS);
    for (let i = 0; i < visible; i++) {
      const c = document.createElement('div');
      c.className = 'checker checker-' + color;
      if (i === visible - 1 && count > 1) c.textContent = String(count);
      c.style.top = 'calc(var(--checker-size) * ' + (i * STACK_OVERLAP) + ')';
      stack.appendChild(c);
    }
    tray.appendChild(stack);

    const countEl = document.createElement('div');
    countEl.className = 'off-tray-count';
    countEl.textContent = String(count);
    tray.appendChild(countEl);

    return tray;
  }

  function renderStackInto(stackEl, point, rowName) {
    const counts = { white: board.white[point], black: board.black[point] };
    const colorsPresent = Object.keys(counts).filter(c => counts[c] > 0);
    if (colorsPresent.length === 0) return;
    const bothPresent = colorsPresent.length === 2;
    const destinations = computeDestinations(point);

    colorsPresent.forEach(color => {
      const count = counts[color];
      const visible = Math.min(count, MAX_VISIBLE_CHECKERS);
      const interactive = color === myColor && destinations.size > 0;
      const leftPct = bothPresent ? (color === 'white' ? 30 : 70) : 50;

      for (let i = 0; i < visible; i++) {
        const c = document.createElement('div');
        c.className = 'checker checker-' + color;
        c.style.left = leftPct + '%';
        if (i === visible - 1 && count > 1) c.textContent = String(count);
        const offsetPx = 'calc(var(--checker-size) * ' + (i * STACK_OVERLAP) + ')';
        if (rowName === 'top') c.style.top = offsetPx;
        else c.style.bottom = offsetPx;

        if (i === visible - 1 && interactive) {
          c.classList.add('draggable');
          attachDragHandlers(c, point, destinations);
        }
        stackEl.appendChild(c);
      }
    });
  }

  // ---------- Drag & drop ----------
  function attachDragHandlers(checkerEl, fromPoint, destinations) {
    checkerEl.addEventListener('pointerdown', (e) => startDrag(e, checkerEl, fromPoint, destinations));
  }

  function highlightDestinations(destinations, on) {
    destinations.forEach((die, key) => {
      if (key === 'off') {
        const tray = el.boardFrame.querySelector('.off-tray[data-color="' + myColor + '"]');
        if (tray) tray.classList.toggle('valid-target', on);
      } else {
        const point = key.slice(1);
        const cell = el.boardFrame.querySelector('.point[data-point="' + point + '"]');
        if (cell) cell.classList.toggle('selectable', on);
      }
    });
  }

  // Определяем цель сброса сравнением координат с прямоугольниками клеток —
  // не используем elementFromPoint/pointer-events:none, потому что в связке
  // с setPointerCapture их поведение отличается между браузерами и на реальных
  // устройствах перетаскивание could silently stop working.
  function findDropTarget(x, y) {
    const points = el.boardFrame.querySelectorAll('.point[data-point]');
    for (let i = 0; i < points.length; i++) {
      const r = points[i].getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return { type: 'point', point: parseInt(points[i].dataset.point, 10) };
      }
    }
    const trays = el.boardFrame.querySelectorAll('.off-tray[data-color]');
    for (let i = 0; i < trays.length; i++) {
      const r = trays[i].getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return { type: 'tray', color: trays[i].dataset.color };
      }
    }
    return null;
  }

  function startDrag(e, checkerEl, fromPoint, destinations) {
    if (e.button != null && e.button !== 0) return;
    if (!destinations || destinations.size === 0) return;
    e.preventDefault();

    const rect = checkerEl.getBoundingClientRect();
    const originLeft = rect.left;
    const originTop = rect.top;

    checkerEl.style.position = 'fixed';
    checkerEl.style.left = rect.left + 'px';
    checkerEl.style.top = rect.top + 'px';
    checkerEl.style.width = rect.width + 'px';
    checkerEl.style.height = rect.height + 'px';
    checkerEl.style.margin = '0';
    checkerEl.classList.add('dragging');

    highlightDestinations(destinations, true);

    const yOffset = e.pointerType === 'touch' ? 46 : 0;

    function onMove(ev) {
      checkerEl.style.left = ev.clientX + 'px';
      checkerEl.style.top = (ev.clientY - yOffset) + 'px';
    }

    function onUp(ev) {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      highlightDestinations(destinations, false);

      const dropX = ev.clientX;
      const dropY = ev.clientY - yOffset;
      const target = findDropTarget(dropX, dropY);

      let matchedDie = null;
      let targetRect = null;

      if (target && target.type === 'point' && destinations.has('p' + target.point)) {
        matchedDie = destinations.get('p' + target.point);
        targetRect = getAnchorRect(target.point, null);
      } else if (target && target.type === 'tray' && target.color === myColor && destinations.has('off')) {
        matchedDie = destinations.get('off');
        targetRect = getAnchorRect(null, myColor);
      }

      if (matchedDie != null) {
        const currentRect = checkerEl.getBoundingClientRect();
        checkerEl.remove();
        selfAnimInFlight = true;
        flyGhost(myColor, currentRect, targetRect, finishSelfAnim);
        socket.emit('move_checker', { from: fromPoint, die: matchedDie });
      } else {
        checkerEl.classList.remove('dragging');
        checkerEl.classList.add('snap-back');
        requestAnimationFrame(() => {
          checkerEl.style.left = originLeft + 'px';
          checkerEl.style.top = originTop + 'px';
        });
        setTimeout(renderAll, prefersReducedMotion() ? 0 : 240);
      }
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  }

  // ---------- Move animation ----------
  const FALLBACK_CHECKER_SIZE = 26;

  function getAnchorRect(point, trayColor) {
    if (trayColor) {
      const tray = el.boardFrame.querySelector('.off-tray[data-color="' + trayColor + '"]');
      if (!tray) return null;
      const r = tray.getBoundingClientRect();
      const size = FALLBACK_CHECKER_SIZE;
      return { left: r.left + r.width / 2 - size / 2, top: r.top + 12, width: size, height: size };
    }
    const cell = el.boardFrame.querySelector('.point[data-point="' + point + '"]');
    if (!cell) return null;
    const r = cell.getBoundingClientRect();
    const existing = cell.querySelector('.checker');
    const size = existing ? existing.getBoundingClientRect().width : FALLBACK_CHECKER_SIZE;
    return { left: r.left + r.width / 2 - size / 2, top: r.top + r.height / 2 - size / 2, width: size, height: size };
  }

  function flyGhost(color, fromRect, toRect, onDone) {
    if (!fromRect || !toRect || prefersReducedMotion()) { onDone(); return; }
    const ghost = document.createElement('div');
    ghost.className = 'checker ghost checker-' + color;
    const w = fromRect.width || FALLBACK_CHECKER_SIZE;
    const h = fromRect.height || FALLBACK_CHECKER_SIZE;
    document.body.appendChild(ghost);
    Object.assign(ghost.style, {
      position: 'fixed',
      left: fromRect.left + 'px',
      top: fromRect.top + 'px',
      width: w + 'px',
      height: h + 'px',
      margin: '0',
      transition: 'left .22s cubic-bezier(.25,.6,.3,1.05), top .22s cubic-bezier(.25,.6,.3,1.05)'
    });
    requestAnimationFrame(() => {
      ghost.style.left = (toRect.left + (toRect.width - w) / 2) + 'px';
      ghost.style.top = (toRect.top + (toRect.height - h) / 2) + 'px';
    });
    setTimeout(() => {
      ghost.remove();
      onDone();
    }, 230);
  }

  function finishSelfAnim() {
    selfAnimInFlight = false;
    if (pendingSelfState) {
      applyBoardState(pendingSelfState);
      pendingSelfState = null;
    }
    renderAll();
  }

  function applyBoardState(data) {
    board = data.board;
    movesLeft = data.movesLeft || [];
  }

  function animateOpponentMove(data) {
    const fromRect = getAnchorRect(data.from, null);
    const toRect = data.bearOff ? getAnchorRect(null, data.color) : getAnchorRect(data.to, null);
    flyGhost(data.color, fromRect, toRect, () => {
      applyBoardState(data);
      renderAll();
    });
  }

  function renderDice() {
    el.diceFaces.innerHTML = (dice || []).map(d => `<span class="die-face">${d}</span>`).join('');
    el.diceChips.innerHTML = '';
    if (movesLeft.length) {
      const label = document.createElement('span');
      label.className = 'dice-chips-label';
      label.textContent = 'Осталось ходов:';
      el.diceChips.appendChild(label);
      movesLeft.forEach(value => {
        const chip = document.createElement('span');
        chip.className = 'die-chip';
        chip.textContent = String(value);
        el.diceChips.appendChild(chip);
      });
    }
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
    renderAll();
  });

  socket.on('checker_moved', (data) => {
    const isMine = data.color === myColor;
    if (isMine && selfAnimInFlight) {
      pendingSelfState = data;
      return;
    }
    if (!isMine) {
      animateOpponentMove(data);
      return;
    }
    applyBoardState(data);
    renderAll();
  });

  socket.on('turn_changed', ({ turnColor: tc }) => {
    turnColor = tc;
    dice = null;
    movesLeft = [];
    hasRolled = false;
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
