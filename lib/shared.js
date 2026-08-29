// Общие утилиты для всех игр платформы (комнаты, игроки, аватары)
const crypto = require('crypto');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без похожих символов (0/O, 1/I)
// Ключи аватаров (не эмодзи) — рендерятся в кастомные картинки на клиенте,
// см. public/avatars/*.webp и public/avatar-icons.js. При изменении списка
// синхронизировать оба места.
const ALLOWED_AVATARS = ['bandit', 'viking', 'astronaut', 'scout', 'merc', 'miner', 'alien', 'hero', 'assassin', 'warrior', 'nomad', 'sleepy'];
const DISCONNECT_GRACE_MS = 5 * 60 * 1000; // 5 минут на переподключение во время активного раунда

function sanitizeAvatar(avatar) {
  return ALLOWED_AVATARS.includes(avatar) ? avatar : ALLOWED_AVATARS[0];
}

function makeRoomCode(rooms) {
  let code;
  do {
    code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function makePlayerId() {
  return crypto.randomUUID();
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

module.exports = { ALLOWED_AVATARS, DISCONNECT_GRACE_MS, sanitizeAvatar, makeRoomCode, makePlayerId, shuffle };
