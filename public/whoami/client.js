(() => {
  'use strict';

  const AVATARS = ['🦊', '🐼', '🐵', '🦁', '🐯', '🐨', '🐰', '🦄', '🐲', '🐙', '🦉', '🐺', '🐧', '🦖', '🐝', '🦋', '🐳', '🦅', '🐢', '🐬', '🦔', '🐔', '🐸', '🦈'];
  const SESSION_KEY = 'whoami_online_session_v1';

  const screens = {
    menu: document.getElementById('screen-menu'),
    lobby: document.getElementById('screen-lobby'),
    assigned: document.getElementById('screen-assigned'),
    playing: document.getElementById('screen-playing'),
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

    assignedList: document.getElementById('assignedList'),
    assignedReadyBtn: document.getElementById('assignedReadyBtn'),
    assignedReadyHint: document.getElementById('assignedReadyHint'),
    forceStartPlayingBtn: document.getElementById('forceStartPlayingBtn'),

    iGuessedBtn: document.getElementById('iGuessedBtn'),
    finishedCountLabel: document.getElementById('finishedCountLabel'),
    finishedTotalLabel: document.getElementById('finishedTotalLabel'),
    finishedList: document.getElementById('finishedList'),
    playingList: document.getElementById('playingList'),
    forceEndPlayingBtn: document.getElementById('forceEndPlayingBtn'),

    scoreboardList: document.getElementById('scoreboardList'),
    playAgainBtn: document.getElementById('playAgainBtn'),
    waitPlayAgainHint: document.getElementById('waitPlayAgainHint'),
    leaveRoomBtn2: document.getElementById('leaveRoomBtn2')
  };

  const socket = io('/whoami');

  let currentRoom = null;
  let isHost = false;
  let myPlayerId = null;
  let latestPlayers = [];
  let selectedAvatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
  let hasConnectedBefore = false;

  // Game-specific state.
  // NOTE on privacy model: the server broadcasts every player's full identity to
  // everyone (including the eventual owner) in 'identities_assigned' / 'rejoin' —
  // this is the same trust-based approach as the other mini-games on this hub.
  // The ONLY thing that keeps a player from seeing their own identity early is
  // this client masking its own row locally until the player taps "Я угадал(а)"
  // (or the round ends). A modified client could reveal it early; that's an
  // accepted trade-off, not a bug.
  let latestIdentities = null; // { players: [{id, name, avatar, identity}] }
  let finishedOrder = [];      // array of playerId, fastest first
  let haveIGuessed = false;

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

  function resetGameState() {
    latestIdentities = null;
    finishedOrder = [];
    haveIGuessed = false;
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

  // ---------- Identity list rendering (shared by assigned + playing screens) ----------
  function playerLookup(id) {
    if (!latestIdentities) return null;
    return latestIdentities.players.find(p => p.id === id) || null;
  }

  function renderIdentityList(container, { maskSelf, showFinishedTags }) {
    if (!latestIdentities) { container.innerHTML = ''; return; }
    container.innerHTML = latestIdentities.players.map(p => {
      const isMe = p.id === myPlayerId;
      const masked = maskSelf && isMe && !haveIGuessed;
      const finished = finishedOrder.includes(p.id);
      const value = masked ? '❓❓❓' : p.identity;
      let tag = '';
      if (showFinishedTags && finished) {
        const rank = finishedOrder.indexOf(p.id) + 1;
        tag = `<span class="identity-tag">✅ #${rank}</span>`;
      }
      return `
        <div class="identity-row${isMe ? ' me' : ''}${showFinishedTags && finished ? ' finished' : ''}">
          <span class="identity-avatar">${escapeHtml(p.avatar || '🙂')}</span>
          <span class="identity-body">
            <span class="identity-name">${escapeHtml(p.name)}${isMe ? ' (это вы)' : ''}</span>
            <span class="identity-value">${escapeHtml(value)}</span>
          </span>
          ${tag}
        </div>
      `;
    }).join('');
  }

  function renderFinishedList() {
    el.finishedCountLabel.textContent = finishedOrder.length;
    el.finishedTotalLabel.textContent = latestIdentities ? latestIdentities.players.length : 0;
    el.finishedList.innerHTML = finishedOrder.map((id, i) => {
      const p = playerLookup(id);
      if (!p) return '';
      return `<span class="player-chip"><span class="rank-num">${i + 1}</span> ${escapeHtml(p.avatar || '🙂')} ${escapeHtml(p.name)}</span>`;
    }).join('');
  }

  // ---------- Identities assigned ----------
  function renderAssignedScreen(data) {
    latestIdentities = data;
    finishedOrder = [];
    haveIGuessed = false;

    renderIdentityList(el.assignedList, { maskSelf: true, showFinishedTags: false });

    el.assignedReadyBtn.disabled = false;
    el.assignedReadyBtn.classList.remove('hidden');
    el.assignedReadyHint.classList.add('hidden');
    el.forceStartPlayingBtn.classList.toggle('hidden', !isHost);
    showScreen('assigned');
  }

  socket.on('identities_assigned', renderAssignedScreen);

  el.assignedReadyBtn.addEventListener('click', () => {
    socket.emit('player_ready');
    el.assignedReadyBtn.classList.add('hidden');
    el.assignedReadyHint.classList.remove('hidden');
    el.assignedReadyHint.textContent = 'Ждём остальных игроков…';
  });

  socket.on('ready_update', ({ readyCount, total }) => {
    if (!el.assignedReadyHint.classList.contains('hidden')) {
      el.assignedReadyHint.textContent = `Готовы: ${readyCount} из ${total}`;
    }
  });

  el.forceStartPlayingBtn.addEventListener('click', () => {
    socket.emit('force_start_playing');
  });

  // ---------- Playing ----------
  function renderPlayingScreen() {
    showScreen('playing');
    el.forceEndPlayingBtn.classList.toggle('hidden', !isHost);

    el.iGuessedBtn.classList.toggle('hidden', haveIGuessed);
    el.iGuessedBtn.disabled = false;

    renderIdentityList(el.playingList, { maskSelf: true, showFinishedTags: true });
    renderFinishedList();
  }

  socket.on('playing_started', renderPlayingScreen);

  el.iGuessedBtn.addEventListener('click', () => {
    socket.emit('i_guessed');
    el.iGuessedBtn.disabled = true;
  });

  el.forceEndPlayingBtn.addEventListener('click', () => {
    socket.emit('force_end_playing');
  });

  socket.on('player_finished', (data) => {
    if (!finishedOrder.includes(data.playerId)) {
      finishedOrder.push(data.playerId);
    }
    if (data.playerId === myPlayerId) {
      haveIGuessed = true;
      el.iGuessedBtn.classList.add('hidden');
    }
    renderIdentityList(el.playingList, { maskSelf: true, showFinishedTags: true });
    renderFinishedList();
  });

  // ---------- End screen ----------
  function renderEndScreen(data) {
    const identityByPlayerId = data.identityByPlayerId || {};
    const order = data.finishedOrder || [];
    const sorted = data.players.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
    const medals = ['🥇', '🥈', '🥉'];

    el.scoreboardList.innerHTML = sorted.map((p, i) => {
      const rankIdx = order.indexOf(p.id);
      const medal = rankIdx >= 0 && rankIdx < 3 ? medals[rankIdx] : (i < 3 ? medals[i] : '');
      const identity = identityByPlayerId[p.id] || '—';
      return `<span class="player-chip">${medal ? medal + ' ' : ''}${escapeHtml(p.avatar || '🙂')} <b>${escapeHtml(p.name)}</b> — ${escapeHtml(identity)} <span class="score-value">${p.score || 0}</span></span>`;
    }).join('');

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

      if (res.phase === 'assigned') {
        if (res.identities) renderAssignedScreen(res.identities);
      } else if (res.phase === 'playing') {
        if (res.identities) latestIdentities = res.identities;
        finishedOrder = (res.finished && res.finished.finishedOrder) || [];
        haveIGuessed = finishedOrder.includes(myPlayerId);
        renderPlayingScreen();
      } else if (res.phase === 'end') {
        if (res.result) renderEndScreen(res.result);
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
