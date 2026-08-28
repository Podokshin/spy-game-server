(() => {
  'use strict';

  const AVATARS = ['🦊', '🐼', '🐵', '🦁', '🐯', '🐨', '🐰', '🦄', '🐲', '🐙', '🦉', '🐺', '🐧', '🦖', '🐝', '🦋', '🐳', '🦅', '🐢', '🐬', '🦔', '🐔', '🐸', '🦈'];
  const SESSION_KEY = 'codenames_online_session_v1';

  const app = document.getElementById('app');

  const screens = {
    menu: document.getElementById('screen-menu'),
    lobby: document.getElementById('screen-lobby'),
    board: document.getElementById('screen-board'),
    end: document.getElementById('screen-end'),
    skipped: document.getElementById('screen-skipped')
  };

  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
    app.classList.toggle('wide', name === 'board' || name === 'end');
    el.skipVoteBtn.classList.toggle('hidden', name !== 'board');
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
    boardRedPlayersList: document.getElementById('boardRedPlayersList'),
    boardBluePlayersList: document.getElementById('boardBluePlayersList'),
    boardRedPanel: document.getElementById('boardRedPanel'),
    boardBluePanel: document.getElementById('boardBluePanel'),
    redTeamActions: document.getElementById('redTeamActions'),
    blueTeamActions: document.getElementById('blueTeamActions'),
    unassignedField: document.getElementById('unassignedField'),
    unassignedList: document.getElementById('unassignedList'),
    wordSetToggle: document.getElementById('wordSetToggle'),
    startGameBtn: document.getElementById('startGameBtn'),
    waitingHostHint: document.getElementById('waitingHostHint'),
    needTeamsHint: document.getElementById('needTeamsHint'),
    leaveRoomBtn: document.getElementById('leaveRoomBtn'),
    lobbyError: document.getElementById('lobbyError'),

    myRoleBadge: document.getElementById('myRoleBadge'),
    turnBanner: document.getElementById('turnBanner'),
    turnTeamDot: document.getElementById('turnTeamDot'),
    turnBannerText: document.getElementById('turnBannerText'),
    scoreRed: document.getElementById('scoreRed'),
    scoreBlue: document.getElementById('scoreBlue'),
    clueBox: document.getElementById('clueBox'),
    forceEndTurnBtn: document.getElementById('forceEndTurnBtn'),
    clueText: document.getElementById('clueText'),
    clueForm: document.getElementById('clueForm'),
    clueWordInput: document.getElementById('clueWordInput'),
    clueNumberInput: document.getElementById('clueNumberInput'),
    submitClueBtn: document.getElementById('submitClueBtn'),
    boardGrid: document.getElementById('boardGrid'),
    endTurnBtn: document.getElementById('endTurnBtn'),
    boardWaitHint: document.getElementById('boardWaitHint'),
    clueHistoryList: document.getElementById('clueHistoryList'),
    leaveRoomBtnBoard: document.getElementById('leaveRoomBtnBoard'),

    endTitle: document.getElementById('endTitle'),
    endReason: document.getElementById('endReason'),
    endBoardGrid: document.getElementById('endBoardGrid'),
    playAgainBtn: document.getElementById('playAgainBtn'),
    waitPlayAgainHint: document.getElementById('waitPlayAgainHint'),
    leaveRoomBtn2: document.getElementById('leaveRoomBtn2'),

    skipVoteBtn: document.getElementById('skipVoteBtn'),
    skipVoteCount: document.getElementById('skipVoteCount'),
    skipVoteNeeded: document.getElementById('skipVoteNeeded'),
    leaveRoomBtnSkip: document.getElementById('leaveRoomBtnSkip')
  };

  const socket = io('/codenames');

  let currentRoom = null;
  let isHost = false;
  let myPlayerId = null;
  let myTeam = null;
  let myRole = null;
  let colorKeyArr = null;
  let latestGameState = null;
  let selectedAvatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
  let hasConnectedBefore = false;

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  for (let n = 0; n <= 9; n++) {
    const opt = document.createElement('option');
    opt.value = String(n);
    opt.textContent = String(n);
    el.clueNumberInput.appendChild(opt);
  }
  el.clueNumberInput.value = '1';

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

  // ---------- Menu ----------
  el.createRoomBtn.addEventListener('click', () => {
    el.menuError.classList.add('hidden');
    socket.emit('create_room', { name: el.playerName.value, avatar: selectedAvatar, partyCode: partyParams ? partyParams.code : undefined }, (res) => {
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
  function teamValid(members) {
    return members.length >= 2 && members.some(p => p.role === 'spymaster');
  }

  function renderTeamChips(players) {
    if (players.length === 0) return '<span class="hint">пусто</span>';
    return players.map(p => `
      <span class="player-chip${p.connected === false ? ' disconnected' : ''}">${escapeHtml(p.avatar || '🙂')} ${escapeHtml(p.name)}${p.isHost ? ' <span class="host-tag">★</span>' : ''}${p.role === 'spymaster' ? ' <span class="captain-tag">КАПИТАН</span>' : ''}${p.connected === false ? ' ⏳' : ''}</span>
    `).join('');
  }

  function renderTeamActions(container, team) {
    container.innerHTML = '';
    const me = currentRoom.players.find(p => p.id === myPlayerId);
    if (!me) return;
    if (me.team !== team) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'secondary-btn';
      btn.textContent = 'Вступить';
      btn.addEventListener('click', () => socket.emit('set_team', { team }));
      container.appendChild(btn);
    } else {
      const leaveBtn = document.createElement('button');
      leaveBtn.type = 'button';
      leaveBtn.className = 'secondary-btn';
      leaveBtn.textContent = 'Покинуть команду';
      leaveBtn.addEventListener('click', () => socket.emit('set_team', { team: null }));
      container.appendChild(leaveBtn);

      const roleBtn = document.createElement('button');
      roleBtn.type = 'button';
      roleBtn.className = 'secondary-btn';
      if (me.role === 'spymaster') {
        roleBtn.textContent = 'Стать обычным агентом';
        roleBtn.addEventListener('click', () => socket.emit('set_role', { role: 'operative' }));
      } else {
        roleBtn.textContent = 'Стать капитаном';
        roleBtn.addEventListener('click', () => socket.emit('set_role', { role: 'spymaster' }));
      }
      container.appendChild(roleBtn);
    }
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

    const wordSet = (room.settings && room.settings.wordSet) || 'classic';
    el.wordSetToggle.querySelectorAll('.cat-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.wordSet === wordSet);
      btn.disabled = !isHost;
    });

    const ready = teamValid(redPlayers) && teamValid(bluePlayers);
    el.startGameBtn.classList.toggle('hidden', !isHost);
    el.startGameBtn.disabled = !ready;
    el.waitingHostHint.classList.toggle('hidden', isHost);
    el.needTeamsHint.classList.toggle('hidden', ready);
  }

  el.wordSetToggle.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!isHost) return;
      socket.emit('update_settings', { wordSet: btn.dataset.wordSet });
    });
  });

  el.startGameBtn.addEventListener('click', () => {
    socket.emit('start_game');
  });

  function resetBoardData() {
    colorKeyArr = null;
    latestGameState = null;
  }

  function leaveRoom() {
    socket.emit('leave_room');
    currentRoom = null;
    isHost = false;
    myPlayerId = null;
    myTeam = null;
    myRole = null;
    resetBoardData();
    clearSession();
    applyInviteMode(null);
    showScreen('menu');
  }
  el.leaveRoomBtn.addEventListener('click', leaveRoom);
  el.leaveRoomBtnBoard.addEventListener('click', leaveRoom);
  el.leaveRoomBtn2.addEventListener('click', leaveRoom);
  el.leaveRoomBtnSkip.addEventListener('click', leaveRoom);

  function applyRoomUpdate(room) {
    currentRoom = room;
    if (room.playerId) myPlayerId = room.playerId;
    const me = room.players.find(p => p.id === myPlayerId);
    isHost = !!(me && me.isHost);
    myTeam = me ? me.team : myTeam;
    myRole = me ? me.role : myRole;
    history.replaceState(null, '', '?room=' + room.code);
    saveSession();

    if (room.phase === 'lobby') {
      resetBoardData();
      renderLobby(room);
      showScreen('lobby');
    } else {
      // Составы команд на игровом экране нужно освежать и вне game_state
      // (например, когда кто-то отключился/переподключился), поэтому рендерим
      // их прямо на любое обновление комнаты, а не только вместе с board-состоянием.
      renderBoardTeams(room.players, latestGameState);
    }

    // isHost выше пересчитывается на каждое обновление комнаты (в т.ч. когда
    // хост меняется из-за отключения игрока), но кнопки хоста иначе
    // обновлялись только внутри рендеров конкретных фаз (game_state/end).
    // Освежаем их видимость всегда, чтобы новый хост увидел свои кнопки без
    // ожидания следующего игрового события.
    refreshHostControls();
  }

  function refreshHostControls() {
    if (!currentRoom) return;
    if ((currentRoom.phase === 'clue' || currentRoom.phase === 'guess') && latestGameState) {
      el.forceEndTurnBtn.classList.toggle('hidden', !isHost);
    }
    if (currentRoom.phase === 'end' && latestGameState) {
      el.playAgainBtn.classList.toggle('hidden', !isHost);
      el.waitPlayAgainHint.classList.toggle('hidden', isHost);
    }
  }

  function renderBoardTeams(players, gs) {
    const redPlayers = players.filter(p => p.team === 'red');
    const bluePlayers = players.filter(p => p.team === 'blue');
    el.boardRedPlayersList.innerHTML = renderTeamChips(redPlayers);
    el.boardBluePlayersList.innerHTML = renderTeamChips(bluePlayers);
    el.boardRedPanel.classList.toggle('active-turn', !!gs && gs.currentTeam === 'red');
    el.boardBluePanel.classList.toggle('active-turn', !!gs && gs.currentTeam === 'blue');
  }

  // ---------- Board ----------
  function renderBoardScreen(gs) {
    latestGameState = gs;
    renderBoardTeams(currentRoom.players, gs);

    el.myRoleBadge.textContent = `Вы: ${myTeam === 'red' ? '🔴' : myTeam === 'blue' ? '🔵' : '—'} ${myRole === 'spymaster' ? 'Капитан' : 'Агент'}`;

    const isMyTurn = gs.currentTeam === myTeam;
    const teamLabel = gs.currentTeam === 'red' ? 'Красные' : 'Синие';
    el.turnTeamDot.className = 'turn-team-dot dot-' + gs.currentTeam;
    el.turnBannerText.textContent = gs.currentClue
      ? `Ход: ${teamLabel} — агенты угадывают`
      : `Ход: ${teamLabel} — капитан думает над подсказкой`;

    el.scoreRed.textContent = `🔴 ${gs.remainingCounts.red}`;
    el.scoreBlue.textContent = `🔵 ${gs.remainingCounts.blue}`;

    if (gs.currentClue) {
      el.clueBox.classList.remove('hidden');
      el.clueText.textContent = `${gs.currentClue.word} — ${gs.currentClue.number}`;
    } else {
      el.clueBox.classList.add('hidden');
    }

    const showClueForm = isMyTurn && myRole === 'spymaster' && !gs.currentClue;
    el.clueForm.classList.toggle('hidden', !showClueForm);
    if (showClueForm) el.clueWordInput.value = '';

    const canGuess = isMyTurn && myRole === 'operative' && !!gs.currentClue;

    el.boardGrid.innerHTML = '';
    gs.board.forEach((card, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'board-card';
      btn.textContent = card.word;
      if (card.revealed) {
        btn.classList.add('revealed', 'revealed-' + card.color);
        btn.disabled = true;
      } else {
        if (myRole === 'spymaster' && colorKeyArr) {
          btn.classList.add('hint-' + colorKeyArr[index]);
        }
        if (canGuess) {
          btn.addEventListener('click', () => socket.emit('guess_card', { index }));
        } else {
          btn.disabled = true;
        }
      }
      el.boardGrid.appendChild(btn);
    });

    const showEndTurn = isMyTurn && !!gs.currentClue;
    el.endTurnBtn.classList.toggle('hidden', !showEndTurn);

    // Хосту всегда доступна кнопка аварийной передачи хода — на случай если
    // капитан активной команды отключился и никто не может продолжить игру.
    el.forceEndTurnBtn.classList.toggle('hidden', !isHost);

    el.boardWaitHint.classList.toggle('hidden', isMyTurn);
    if (!isMyTurn) {
      el.boardWaitHint.textContent = gs.currentClue
        ? `${teamLabel} угадывают слова…`
        : `Капитан команды «${teamLabel}» думает над подсказкой…`;
    }

    el.clueHistoryList.innerHTML = gs.clueHistory.slice().reverse().map(c => `
      <div class="clue-history-item hist-${c.team}">
        <span>${c.team === 'red' ? '🔴' : '🔵'} ${escapeHtml(c.word)}</span>
        <span>${c.number}</span>
      </div>
    `).join('') || '<span class="hint">Пока нет подсказок</span>';
  }

  el.submitClueBtn.addEventListener('click', () => {
    const word = el.clueWordInput.value.trim();
    if (!word) return;
    socket.emit('submit_clue', { word, number: parseInt(el.clueNumberInput.value, 10) || 0 });
  });

  el.endTurnBtn.addEventListener('click', () => {
    socket.emit('end_turn');
  });

  el.forceEndTurnBtn.addEventListener('click', () => {
    if (!confirm('Передать ход другой команде? Используйте только если капитан текущей команды пропал и игра зависла.')) return;
    socket.emit('force_end_turn');
  });

  socket.on('color_key', ({ colors }) => {
    colorKeyArr = colors;
    if (latestGameState && !latestGameState.winner) renderBoardScreen(latestGameState);
  });

  socket.on('game_state', (gs) => {
    if (gs.winner) {
      const isNewWin = !latestGameState || !latestGameState.winner;
      renderEndScreen(gs);
      showScreen('end');
      if (isNewWin && window.fireConfetti) window.fireConfetti();
    } else {
      renderBoardScreen(gs);
      showScreen('board');
    }
  });

  // ---------- End screen ----------
  function renderEndScreen(gs) {
    latestGameState = gs;
    const winnerLabel = gs.winner === 'red' ? '🔴 Красные' : '🔵 Синие';
    el.endTitle.textContent = `🏆 Победили: ${winnerLabel}`;
    el.endReason.textContent = gs.winReason === 'assassin'
      ? 'Соперники наткнулись на чёрную карту!'
      : 'Все слова команды найдены!';

    el.endBoardGrid.innerHTML = '';
    gs.board.forEach(card => {
      const div = document.createElement('div');
      div.className = 'board-card revealed revealed-' + card.color;
      div.textContent = card.word;
      el.endBoardGrid.appendChild(div);
    });

    el.playAgainBtn.classList.toggle('hidden', !isHost);
    el.waitPlayAgainHint.classList.toggle('hidden', isHost);

    if (window.PartyHub) {
      window.PartyHub.renderPartySection(document.getElementById('partySection'), {
        currentKey: 'codenames',
        standings: gs.partyStandings || [],
        isHost,
        onSelect: (gameKey) => socket.emit('select_next_game', { gameKey })
      });
    }
  }

  el.playAgainBtn.addEventListener('click', () => {
    socket.emit('play_again');
  });

  socket.on('next_game_selected', ({ gameKey }) => {
    if (window.PartyHub && currentRoom) {
      window.PartyHub.goToGame(gameKey, currentRoom.code, el.playerName.value, selectedAvatar, isHost);
    }
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
        currentKey: 'codenames',
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
        return;
      }
      applyRoomUpdate(res);
      if (res.colorKey) colorKeyArr = res.colorKey;
      if (res.gameState) {
        if (res.gameState.winner) {
          renderEndScreen(res.gameState);
          showScreen('end');
        } else {
          renderBoardScreen(res.gameState);
          showScreen('board');
        }
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
