const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { registerSpyGame } = require('./lib/spy-game');
const { registerMissionGame } = require('./lib/mission-game');
const { registerCodenamesGame } = require('./lib/codenames-game');
const { registerMafiaGame } = require('./lib/mafia-game');
const { registerWavelengthGame } = require('./lib/wavelength-game');
const { registerWhoamiGame } = require('./lib/whoami-game');
const { registerCategoriesGame } = require('./lib/categories-game');
const { registerNardyGame } = require('./lib/nardy-game');
const { registerCrocodileGame } = require('./lib/crocodile-game');

const app = express();
// Собранный React-хаб (client/) имеет приоритет; всё, чего в нём нет
// (немигрированные игры, /radio.js, /shorts.js, /videos и т.д.), продолжает
// отдаваться из public/ как раньше.
app.use(express.static(path.join(__dirname, 'client', 'dist')));
// no-cache (не "без кэша", а "всегда перепроверяй у сервера") — файлы в
// public/ (game-chrome.css, party.js, shorts.css и т.п.) отдаются по
// постоянному пути без версии/хэша в URL, поэтому без явного заголовка
// браузер может закэшировать их эвристически надолго и не увидеть правку
// даже после деплоя. Собранные Vite-ассеты в client/dist себя так не ведут —
// у них хэш в имени файла, там кэш сам сбрасывается на каждой сборке.
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache')
}));

const VIDEO_EXT = /\.(mp4|webm|mov)$/i;
app.get('/api/videos', (req, res) => {
  fs.readdir(path.join(__dirname, 'public', 'videos'), (err, files) => {
    if (err) return res.json([]);
    res.json(files.filter(f => VIDEO_EXT.test(f)).sort());
  });
});

const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

registerSpyGame(io); // корневой namespace "/" — используется страницей /spy/
registerMissionGame(io.of('/mission')); // отдельный namespace — используется страницей /mission/
registerCodenamesGame(io.of('/codenames')); // отдельный namespace — используется страницей /codenames/
registerMafiaGame(io.of('/mafia')); // отдельный namespace — используется страницей /mafia/
registerWavelengthGame(io.of('/wavelength')); // отдельный namespace — используется страницей /wavelength/
registerWhoamiGame(io.of('/whoami')); // отдельный namespace — используется страницей /whoami/
registerCategoriesGame(io.of('/categories')); // отдельный namespace — используется страницей /categories/
registerNardyGame(io.of('/nardy')); // отдельный namespace — используется страницей /nardy/
registerCrocodileGame(io.of('/crocodile')); // отдельный namespace — используется страницей /crocodile/

server.listen(PORT, () => {
  console.log(`Игротека запущена: http://localhost:${PORT}`);
});
