// «Вечер игр» — общий клиентский модуль, подключается на всех 9 играх.
// Отвечает за: разбор party-параметров из URL (для авто-создания/входа в
// комнату с тем же кодом на новой игре) и за рендер блока "Следующая игра +
// общий счёт вечера" на экране итогов.
(function () {
  var GAMES = [
    { key: 'spy', name: 'Шпион', emoji: '🕵️', path: '/spy/' },
    { key: 'mission', name: 'Тайная миссия', emoji: '🎭', path: '/mission/' },
    { key: 'codenames', name: 'Кодовые имена', emoji: '🔤', path: '/codenames/' },
    { key: 'mafia', name: 'Мафия', emoji: '🌙', path: '/mafia/' },
    { key: 'wavelength', name: 'Волна', emoji: '🌊', path: '/wavelength/' },
    { key: 'whoami', name: 'Кто я?', emoji: '❓', path: '/whoami/' },
    { key: 'nardy', name: 'Длинные нарды', emoji: '🎲', path: '/nardy/' },
    { key: 'skuf', name: 'Скуф ищет альтушку', emoji: '💘', path: '/skuf/' },
    { key: 'categories', name: 'Категории', emoji: '⚡', path: '/categories/' }
  ];

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
  }

  // Аватар — ключ картинки (public/avatars/<key>.webp), не эмодзи. Строится
  // напрямую (не через window.avatarIcon), т.к. party.js подключается и на
  // React-страницах (Кто я, Категории), где avatar-icons.js не грузится.
  function avatarImg(key) {
    return '<img src="/avatars/' + encodeURIComponent(key || 'raccoon') + '.webp" width="20" height="20" alt="" ' +
      'style="border-radius:50%;object-fit:cover;vertical-align:-4px;">';
  }

  // Если в URL есть ?party=CODE — значит сюда попали через "Следующая игра"
  // из другой мини-игры того же вечера.
  function getPartyParams() {
    var q = new URLSearchParams(window.location.search);
    var code = q.get('party');
    if (!code) return null;
    return {
      code: code.toUpperCase(),
      name: q.get('pname') || '',
      avatar: q.get('pavatar') || '',
      isHost: q.get('host') === '1'
    };
  }

  function goToGame(gameKey, code, name, avatar, isHost) {
    var game = null;
    for (var i = 0; i < GAMES.length; i++) if (GAMES[i].key === gameKey) game = GAMES[i];
    if (!game) return;
    var params = new URLSearchParams();
    params.set('party', code);
    if (name) params.set('pname', name);
    if (avatar) params.set('pavatar', avatar);
    if (isHost) params.set('host', '1');
    window.location.href = game.path + '?' + params.toString();
  }

  // container: DOM-элемент, куда рендерим блок. opts:
  //   currentKey — ключ текущей игры (чтобы не предлагать её саму),
  //   standings — [{name, avatar, total}] общий счёт вечера,
  //   isHost — может ли этот игрок выбирать следующую игру,
  //   onSelect(gameKey) — вызывается при выборе игры (обычно socket.emit('select_next_game', ...))
  function renderPartySection(container, opts) {
    if (!container) return;
    var standings = opts.standings || [];
    var isHost = !!opts.isHost;
    var html = '';

    if (standings.length) {
      html += '<div class="field party-standings">' +
        '<label>🏅 Общий счёт вечера</label>' +
        '<div class="chip-list">' + standings.map(function (p) {
          return '<span class="player-chip">' + avatarImg(p.avatar) + ' ' + escapeHtml(p.name) +
            ' <span class="score-value">' + p.total + '</span></span>';
        }).join('') + '</div></div>';
    }

    html += '<div class="field party-next-game"><label>Следующая игра</label>';
    if (isHost) {
      html += '<div class="party-game-grid">' + GAMES.filter(function (g) { return g.key !== opts.currentKey; }).map(function (g) {
        return '<button type="button" class="party-game-btn" data-game="' + g.key + '">' + g.emoji + ' ' + escapeHtml(g.name) + '</button>';
      }).join('') + '</div>';
    } else {
      html += '<p class="hint">Хост выберет следующую игру для всех — просто подождите.</p>';
    }
    html += '</div>';

    container.innerHTML = html;

    if (isHost) {
      container.querySelectorAll('.party-game-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (opts.onSelect) opts.onSelect(btn.dataset.game);
        });
      });
    }
  }

  window.PartyHub = { GAMES: GAMES, getPartyParams: getPartyParams, goToGame: goToGame, renderPartySection: renderPartySection };
})();
