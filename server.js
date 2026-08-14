const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { registerSpyGame } = require('./lib/spy-game');
const { registerMissionGame } = require('./lib/mission-game');
const { registerCodenamesGame } = require('./lib/codenames-game');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

registerSpyGame(io); // корневой namespace "/" — используется страницей /spy/
registerMissionGame(io.of('/mission')); // отдельный namespace — используется страницей /mission/
registerCodenamesGame(io.of('/codenames')); // отдельный namespace — используется страницей /codenames/

server.listen(PORT, () => {
  console.log(`Игротека запущена: http://localhost:${PORT}`);
});
