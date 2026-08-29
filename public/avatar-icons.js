// Аватары игроков — кастомные картинки (public/avatars/<key>.webp), общие
// для всех 9 игр. avatar (ключ) хранится и передаётся как обычная строка;
// avatarIcon(key) возвращает готовый <img> для вставки через innerHTML/
// template-строки везде, где раньше был эмодзи или иконка.
(function () {
  var KEYS = ['bandit', 'viking', 'astronaut', 'scout', 'merc', 'miner', 'alien', 'hero', 'assassin', 'warrior', 'nomad', 'sleepy'];

  var LABELS = {
    bandit: 'Разбойник', viking: 'Викинг', astronaut: 'Космонавт', scout: 'Скаут',
    merc: 'Наёмник', miner: 'Шахтёр', alien: 'Пришелец', hero: 'Герой',
    assassin: 'Ассасин', warrior: 'Воин', nomad: 'Кочевница', sleepy: 'Соня'
  };

  function avatarIcon(key, size) {
    var k = KEYS.includes(key) ? key : KEYS[0];
    var s = size || 20;
    return '<img class="avatar-icon" src="/avatars/' + k + '.webp" width="' + s + '" height="' + s +
      '" alt="" style="border-radius:50%;object-fit:cover;vertical-align:-4px;">';
  }

  window.AVATAR_KEYS = KEYS;
  window.AVATAR_LABELS = LABELS;
  window.avatarIcon = avatarIcon;
})();
