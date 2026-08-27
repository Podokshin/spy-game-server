// Боковые "шортсы" для десктопа — видео беззвучные, зациклены, включаются
// кликом по надписи-креатору. Список файлов подтягивается с сервера
// (/api/videos), который сам сканирует public/videos — чтобы добавить новое
// видео, достаточно положить файл в эту папку, ничего в коде менять не надо.
// Клик по самому видео переключает именно его (левое/правое — независимо)
// на случайный следующий ролик из списка.
(function () {
  var STORAGE_KEY = 'shortsEnabled';
  var MIN_MARGIN = 16; // минимальный отступ от края экрана и от меню

  function pickRandom(pool, avoid) {
    if (pool.length === 0) return null;
    if (pool.length === 1) return pool[0];
    var candidates = pool.filter(function (f) { return avoid.indexOf(f) === -1; });
    if (candidates.length === 0) candidates = pool;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function buildUI(files) {
    var app = document.getElementById('app');
    var credit = document.querySelector('.credit');
    if (!credit || !app || files.length === 0) return;

    var left = document.createElement('div');
    left.className = 'shorts-rail shorts-rail--left';
    left.innerHTML = '<video muted loop playsinline></video>';

    var right = document.createElement('div');
    right.className = 'shorts-rail shorts-rail--right';
    right.innerHTML = '<video muted loop playsinline></video>';

    document.body.appendChild(left);
    document.body.appendChild(right);

    var rails = [
      { el: left, video: left.querySelector('video'), current: null },
      { el: right, video: right.querySelector('video'), current: null }
    ];

    function currentFiles() {
      return rails.map(function (r) { return r.current; });
    }

    function loadRail(rail, file, autoplay) {
      rail.current = file;
      rail.video.src = '/videos/' + file;
      rail.video.load();
      if (autoplay) rail.video.play().catch(function () {});
    }

    // Начальный выбор — двум рельсам стараемся дать разные ролики.
    loadRail(rails[0], pickRandom(files, []), false);
    loadRail(rails[1], pickRandom(files, [rails[0].current]), false);

    rails.forEach(function (rail) {
      rail.video.addEventListener('click', function () {
        // Сначала пробуем взять ролик, которого нет ни на одной из рельс;
        // если пул слишком мал для этого — гарантируем хотя бы то, что
        // именно эта рельса сменится (иначе клик может визуально "не сработать").
        var next = pickRandom(files, [rail.current].concat(currentFiles()));
        if (next === rail.current) next = pickRandom(files, [rail.current]);
        loadRail(rail, next, userEnabled && fits);
      });
    });

    var indicator = document.createElement('span');
    indicator.className = 'shorts-indicator';
    credit.appendChild(indicator);
    credit.setAttribute('data-shorts-toggle', '');
    credit.title = 'Нажмите, чтобы включить/выключить фоновые видео. Клик по видео — сменить ролик.';

    var userEnabled = false;
    var fits = false;

    function applyVisibility() {
      var show = userEnabled && fits;
      rails.forEach(function (rail) {
        rail.el.classList.toggle('visible', show);
        if (show) rail.video.play().catch(function () {});
        else rail.video.pause();
      });
      credit.classList.toggle('active', userEnabled);
    }

    function setEnabled(enabled) {
      userEnabled = enabled;
      try { localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0'); } catch (e) {}
      applyVisibility();
    }

    function positionRails() {
      var rect = app.getBoundingClientRect();
      var railWidth = left.offsetWidth || 320;

      var leftGap = rect.left;
      var rightGap = document.documentElement.clientWidth - rect.right;
      var smallestGap = Math.min(leftGap, rightGap);

      fits = smallestGap >= railWidth + MIN_MARGIN * 2;

      if (fits) {
        left.style.left = Math.round(leftGap / 2 - railWidth / 2) + 'px';
        right.style.right = Math.round(rightGap / 2 - railWidth / 2) + 'px';
      }

      applyVisibility();
    }

    credit.addEventListener('click', function () {
      setEnabled(!userEnabled);
    });

    var rafPending = false;
    function schedulePosition() {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(function () { rafPending = false; positionRails(); });
    }

    window.addEventListener('resize', schedulePosition);
    if (window.ResizeObserver) {
      new ResizeObserver(schedulePosition).observe(app);
    }

    var saved = false;
    try { saved = localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) {}
    userEnabled = saved;
    positionRails();
  }

  function init() {
    fetch('/api/videos')
      .then(function (res) { return res.ok ? res.json() : []; })
      .then(function (files) { buildUI(files || []); })
      .catch(function () { /* нет видео — просто не показываем блок */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
