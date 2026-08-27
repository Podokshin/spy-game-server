// Боковые "шортсы" для десктопа — видео беззвучные, зациклены, включаются кликом по надписи-креатору
(function () {
  var STORAGE_KEY = 'shortsEnabled';

  function buildUI() {
    var credit = document.querySelector('.credit');
    if (!credit) return;

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

    function setEnabled(enabled) {
      rails.forEach(function (rail) { rail.classList.toggle('visible', enabled); });
      credit.classList.toggle('active', enabled);

      if (enabled) {
        videos.forEach(function (v) { v.play().catch(function () {}); });
      } else {
        videos.forEach(function (v) { v.pause(); });
      }

      try { localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0'); } catch (e) {}
    }

    credit.addEventListener('click', function () {
      setEnabled(!credit.classList.contains('active'));
    });

    var saved = false;
    try { saved = localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) {}
    setEnabled(saved);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
})();
