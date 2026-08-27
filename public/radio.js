// Плавающее радио — живой эфир YouTube (Lofi Girl), общий виджет для всех
// страниц. Плеер живёт в крошечном скрытом iframe через официальный
// YouTube IFrame API — с ним можно программно управлять play/pause и
// громкостью. Ничего не скачивается и не хранится на нашем сервере.
(function () {
  'use strict';

  const VIDEO_ID = 'rFZHOHl-L8A';
  const STORAGE_ENABLED = 'radioEnabled';
  const STORAGE_VOLUME = 'radioVolume';

  function buildUI() {
    const widget = document.createElement('div');
    widget.className = 'radio-widget';
    widget.innerHTML =
      '<button type="button" class="radio-play-btn" id="radioPlayBtn" aria-label="Включить радио">🎵</button>' +
      '<input type="range" class="radio-volume" id="radioVolume" min="0" max="100" aria-label="Громкость радио">' +
      '<div class="radio-player-mount" id="radioPlayerMount" aria-hidden="true"></div>';
    document.body.appendChild(widget);

    const playBtn = widget.querySelector('#radioPlayBtn');
    const volumeSlider = widget.querySelector('#radioVolume');
    const mount = widget.querySelector('#radioPlayerMount');

    let savedVolume = 55;
    try {
      const v = parseInt(localStorage.getItem(STORAGE_VOLUME), 10);
      if (!isNaN(v)) savedVolume = Math.min(100, Math.max(0, v));
    } catch (e) { /* ignore */ }
    volumeSlider.value = String(savedVolume);

    let wantsPlaying = false;
    try { wantsPlaying = localStorage.getItem(STORAGE_ENABLED) === '1'; } catch (e) { /* ignore */ }

    let player = null;
    let playerReady = false;

    function setPlayingUI(isPlaying) {
      widget.classList.remove('loading');
      widget.classList.toggle('playing', isPlaying);
      playBtn.textContent = isPlaying ? '⏸' : '🎵';
      playBtn.setAttribute('aria-label', isPlaying ? 'Выключить радио' : 'Включить радио');
    }

    function saveEnabled(v) {
      try { localStorage.setItem(STORAGE_ENABLED, v ? '1' : '0'); } catch (e) { /* ignore */ }
    }
    function saveVolume(v) {
      try { localStorage.setItem(STORAGE_VOLUME, String(v)); } catch (e) { /* ignore */ }
    }

    function createPlayer(onReadyCb) {
      player = new YT.Player(mount, {
        width: '2',
        height: '2',
        videoId: VIDEO_ID,
        playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1 },
        events: {
          onReady: function () {
            playerReady = true;
            player.setVolume(parseInt(volumeSlider.value, 10));
            onReadyCb();
          },
          onStateChange: function (e) {
            if (e.data === YT.PlayerState.PLAYING) setPlayingUI(true);
            else if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) setPlayingUI(false);
          },
          onError: function () {
            setPlayingUI(false);
          }
        }
      });
    }

    function ensurePlayer(onReadyCb) {
      if (player) { onReadyCb(); return; }
      widget.classList.add('loading');
      if (window.YT && window.YT.Player) {
        createPlayer(onReadyCb);
        return;
      }
      const prevCb = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        if (typeof prevCb === 'function') prevCb();
        createPlayer(onReadyCb);
      };
      if (!document.getElementById('radio-yt-api')) {
        const tag = document.createElement('script');
        tag.id = 'radio-yt-api';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
    }

    function play() {
      ensurePlayer(function () {
        player.playVideo();
      });
    }

    function pause() {
      if (player && playerReady) player.pauseVideo();
      setPlayingUI(false);
    }

    playBtn.addEventListener('click', function () {
      if (widget.classList.contains('playing')) {
        pause();
        saveEnabled(false);
      } else {
        play();
        saveEnabled(true);
      }
    });

    volumeSlider.addEventListener('input', function () {
      const v = parseInt(volumeSlider.value, 10);
      saveVolume(v);
      if (player && playerReady) player.setVolume(v);
    });

    if (wantsPlaying) {
      // Автопродолжение с прошлого визита — сработает не всегда (политика
      // браузеров требует жеста пользователя), тогда просто останется в
      // состоянии паузы, и кнопку можно нажать вручную.
      play();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
})();
