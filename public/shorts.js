// Боковые "шортсы" для десктопа — видео беззвучные, зациклены, включаются кликом по надписи-креатору
// Позиция считается по месту так, чтобы видео стояло ровно посередине между краем экрана и меню (#app)
(function () {
  var STORAGE_KEY = 'shortsEnabled';
  var MIN_MARGIN = 16; // минимальный отступ от края экрана и от меню

  function buildUI() {
    var app = document.getElementById('app');
    var credit = document.querySelector('.credit');
    if (!credit || !app) return;

    var left = document.createElement('div');
    left.className = 'shorts-rail shorts-rail--left';
    left.innerHTML = '<video src="/videos/minecraft-parkour.mp4" muted loop playsinline></video>';

    var right = document.createElement('div');
    right.className = 'shorts-rail shorts-rail--right';
    right.innerHTML = '<video src="/videos/carpet-wash.mp4" muted loop playsinline></video>';

    document.body.appendChild(left);
    document.body.appendChild(right);

    var indicator = document.createElement('span');
    indicator.className = 'shorts-indicator';
    credit.appendChild(indicator);
    credit.setAttribute('data-shorts-toggle', '');
    credit.title = 'Нажмите, чтобы включить/выключить фоновые видео';

    var videos = [left.querySelector('video'), right.querySelector('video')];
    var rails = [left, right];
    var userEnabled = false;
    var fits = false;

    function applyVisibility() {
      var show = userEnabled && fits;
      rails.forEach(function (rail) { rail.classList.toggle('visible', show); });
      credit.classList.toggle('active', userEnabled);
      videos.forEach(function (v) {
        if (show) v.play().catch(function () {});
        else v.pause();
      });
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
})();
