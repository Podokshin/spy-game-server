const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { LOCATIONS, CHARACTER_CATEGORIES } = require('./data');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const rooms = new Map(); // code -> room

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без похожих символов (0/O, 1/I)

const ALLOWED_AVATARS = ['🦊', '🐼', '🐵', '🦁', '🐯', '🐨', '🐰', '🦄', '🐲', '🐙', '🦉', '🐺', '🐧', '🦖', '🐝', '🦋', '🐳', '🦅', '🐢', '🐬', '🦔', '🐔', '🐸', '🦈'];

function sanitizeAvatar(avatar) {
  return ALLOWED_AVATARS.includes(avatar) ? avatar : ALLOWED_AVATARS[0];
}

function makeRoomCode() {
  let code;
  do {
    code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function publicPlayers(room) {
  return room.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, isHost: p.id === room.hostId, score: p.score }));
}

function roomSummary(room) {
  return {
    code: room.code,
    players: publicPlayers(room),
    settings: room.settings,
    phase: room.phase
  };
}

function broadcastRoom(room) {
  io.to(room.code).emit('room_update', roomSummary(room));
}

function getRoom(socket) {
  const code = socket.data.roomCode;
  return code ? rooms.get(code) : null;
}

function clearRoomTimer(room) {
  if (room.timerHandle) {
    clearTimeout(room.timerHandle);
    room.timerHandle = null;
  }
}

function startDiscussion(room) {
  room.phase = 'discussion';
  const totalMs = room.settings.timerMinutes * 60000;
  room.timer = {
    enabled: room.settings.timerEnabled,
    endsAt: room.settings.timerEnabled ? Date.now() + totalMs : null,
    totalMs,
    paused: false,
    remainingMs: totalMs
  };
  io.to(room.code).emit('discussion_started', {
    timerEnabled: room.timer.enabled,
    endsAt: room.timer.endsAt,
    totalMs: room.timer.totalMs,
    turnOrder: room.game.turnOrder,
    category: room.game.category
  });
  clearRoomTimer(room);
  if (room.timer.enabled) {
    room.timerHandle = setTimeout(() => {
      if (room.phase === 'discussion') endDiscussion(room, true);
    }, totalMs);
  }
}

function endDiscussion(room, timeUp) {
  clearRoomTimer(room);
  room.phase = 'voting';
  room.votes = new Map();
  io.to(room.code).emit('voting_started', {
    timeUp,
    players: room.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar }))
  });
}

function finalizeVoting(room) {
  const tallyMap = new Map();
  room.players.forEach(p => tallyMap.set(p.id, 0));
  room.votes.forEach(targetId => {
    if (tallyMap.has(targetId)) tallyMap.set(targetId, tallyMap.get(targetId) + 1);
  });

  const maxVotes = Math.max(0, ...tallyMap.values());
  const spyVotes = tallyMap.get(room.game.spyId) || 0;
  const spyCaught = maxVotes > 0 && spyVotes === maxVotes;

  room.players.forEach(p => {
    const votedFor = room.votes.get(p.id);
    if (votedFor === room.game.spyId) p.score += 1;
  });
  const spyPlayer = room.players.find(p => p.id === room.game.spyId);
  if (spyPlayer && !spyCaught) spyPlayer.score += 2;

  room.game.spyCaught = spyCaught;
  room.phase = 'end';
  room.revealStage = 0;

  const tally = room.players
    .map(p => ({ id: p.id, name: p.name, avatar: p.avatar, votes: tallyMap.get(p.id) || 0 }))
    .sort((a, b) => b.votes - a.votes);

  io.to(room.code).emit('voting_result', { tally });
  broadcastRoom(room);
}

io.on('connection', (socket) => {
  socket.on('create_room', ({ name, avatar } = {}, ack) => {
    const playerName = (name || '').trim().slice(0, 20) || 'Игрок';
    const code = makeRoomCode();
    const room = {
      code,
      hostId: socket.id,
      players: [{ id: socket.id, name: playerName, avatar: sanitizeAvatar(avatar), score: 0 }],
      settings: { category: 'places', subCategory: 'mix', timerEnabled: true, timerMinutes: 8 },
      phase: 'lobby', // lobby | roles | discussion | end
      game: null,
      readyIds: new Set(),
      timerHandle: null
    };
    rooms.set(code, room);
    socket.join(code);
    socket.data.roomCode = code;
    ack && ack({ ok: true, ...roomSummary(room) });
  });

  socket.on('join_room', ({ code, name, avatar } = {}, ack) => {
    const room = rooms.get((code || '').toUpperCase().trim());
    if (!room) return ack && ack({ ok: false, error: 'Комната не найдена' });
    if (room.phase !== 'lobby') return ack && ack({ ok: false, error: 'Игра уже началась, дождитесь следующего раунда' });
    if (room.players.length >= 20) return ack && ack({ ok: false, error: 'Комната заполнена' });
    const playerName = (name || '').trim().slice(0, 20) || 'Игрок';
    room.players.push({ id: socket.id, name: playerName, avatar: sanitizeAvatar(avatar), score: 0 });
    socket.join(room.code);
    socket.data.roomCode = room.code;
    ack && ack({ ok: true, ...roomSummary(room) });
    broadcastRoom(room);
  });

  socket.on('update_settings', (settings = {}) => {
    const room = getRoom(socket);
    if (!room || room.hostId !== socket.id || room.phase !== 'lobby') return;
    room.settings = {
      category: settings.category === 'characters' ? 'characters' : 'places',
      subCategory: settings.subCategory || room.settings.subCategory,
      timerEnabled: !!settings.timerEnabled,
      timerMinutes: Math.min(30, Math.max(1, parseInt(settings.timerMinutes, 10) || 8))
    };
    broadcastRoom(room);
  });

  socket.on('start_game', () => {
    const room = getRoom(socket);
    if (!room || room.hostId !== socket.id || room.phase !== 'lobby') return;
    if (room.players.length < 3) return;

    const { category, subCategory } = room.settings;
    let topicName;
    let location = null;
    const rolesByPlayer = {};
    const spyIndex = Math.floor(Math.random() * room.players.length);

    if (category === 'characters') {
      const cat = CHARACTER_CATEGORIES.find(c => c.key === subCategory) || CHARACTER_CATEGORIES[0];
      if (!cat || cat.list.length === 0) return;
      topicName = cat.list[Math.floor(Math.random() * cat.list.length)];
    } else {
      const usable = LOCATIONS.filter(l => l.roles.length > 0);
      if (usable.length === 0) return;
      location = usable[Math.floor(Math.random() * usable.length)];
      topicName = location.name;
      const nonSpyCount = room.players.length - 1;
      let roles = [];
      while (roles.length < nonSpyCount) roles = roles.concat(shuffle(location.roles));
      roles = roles.slice(0, nonSpyCount);
      let cursor = 0;
      room.players.forEach((p, i) => {
        if (i !== spyIndex) rolesByPlayer[p.id] = roles[cursor++];
      });
    }

    const turnOrder = shuffle(room.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar })));

    room.game = { category, subCategory, topicName, spyId: room.players[spyIndex].id, turnOrder };
    room.phase = 'roles';
    room.readyIds = new Set();

    room.players.forEach((p, i) => {
      const isSpy = i === spyIndex;
      io.to(p.id).emit('your_role', {
        isSpy,
        category,
        topicName: isSpy ? null : topicName,
        role: isSpy ? null : (rolesByPlayer[p.id] || null)
      });
    });

    broadcastRoom(room);
  });

  socket.on('player_ready', () => {
    const room = getRoom(socket);
    if (!room || room.phase !== 'roles') return;
    room.readyIds.add(socket.id);
    io.to(room.code).emit('ready_update', { readyCount: room.readyIds.size, total: room.players.length });
    if (room.readyIds.size >= room.players.length) {
      startDiscussion(room);
    }
  });

  socket.on('force_start_discussion', () => {
    const room = getRoom(socket);
    if (!room || room.hostId !== socket.id || room.phase !== 'roles') return;
    startDiscussion(room);
  });

  socket.on('toggle_pause', () => {
    const room = getRoom(socket);
    if (!room || room.hostId !== socket.id || room.phase !== 'discussion' || !room.timer.enabled) return;
    if (room.timer.paused) {
      room.timer.paused = false;
      room.timer.endsAt = Date.now() + room.timer.remainingMs;
      clearRoomTimer(room);
      room.timerHandle = setTimeout(() => {
        if (room.phase === 'discussion') endDiscussion(room, true);
      }, room.timer.remainingMs);
      io.to(room.code).emit('timer_resumed', { endsAt: room.timer.endsAt });
    } else {
      room.timer.paused = true;
      room.timer.remainingMs = Math.max(0, room.timer.endsAt - Date.now());
      clearRoomTimer(room);
      io.to(room.code).emit('timer_paused', { remainingMs: room.timer.remainingMs });
    }
  });

  socket.on('end_discussion', () => {
    const room = getRoom(socket);
    if (!room || room.hostId !== socket.id || room.phase !== 'discussion') return;
    endDiscussion(room, false);
  });

  socket.on('cast_vote', ({ targetId } = {}) => {
    const room = getRoom(socket);
    if (!room || room.phase !== 'voting') return;
    if (!room.players.some(p => p.id === targetId)) return;
    room.votes.set(socket.id, targetId);
    io.to(room.code).emit('vote_update', { votedCount: room.votes.size, total: room.players.length });
    if (room.votes.size >= room.players.length) finalizeVoting(room);
  });

  socket.on('force_finish_voting', () => {
    const room = getRoom(socket);
    if (!room || room.hostId !== socket.id || room.phase !== 'voting') return;
    finalizeVoting(room);
  });

  socket.on('reveal_spy', () => {
    const room = getRoom(socket);
    if (!room || room.hostId !== socket.id || room.phase !== 'end' || room.revealStage !== 0) return;
    room.revealStage = 1;
    const spyPlayer = room.players.find(p => p.id === room.game.spyId);
    io.to(room.code).emit('spy_revealed', {
      spyName: spyPlayer ? spyPlayer.name : '(вышел из комнаты)',
      spyAvatar: spyPlayer ? spyPlayer.avatar : null,
      caught: room.game.spyCaught,
      category: room.game.category
    });
  });

  socket.on('reveal_topic', () => {
    const room = getRoom(socket);
    if (!room || room.hostId !== socket.id || room.phase !== 'end' || room.revealStage !== 1) return;
    room.revealStage = 2;
    io.to(room.code).emit('topic_revealed', {
      topicLabel: room.game.category === 'characters' ? 'Персонаж' : 'Локация',
      topicName: room.game.topicName
    });
  });

  socket.on('play_again', () => {
    const room = getRoom(socket);
    if (!room || room.hostId !== socket.id || room.phase !== 'end') return;
    room.phase = 'lobby';
    room.game = null;
    broadcastRoom(room);
  });

  socket.on('leave_room', () => leaveRoom(socket));
  socket.on('disconnect', () => leaveRoom(socket));

  function leaveRoom(sock) {
    const room = getRoom(sock);
    if (!room) return;
    room.players = room.players.filter(p => p.id !== sock.id);
    sock.data.roomCode = null;
    if (room.players.length === 0) {
      clearRoomTimer(room);
      rooms.delete(room.code);
      return;
    }
    if (room.hostId === sock.id) {
      room.hostId = room.players[0].id;
    }
    if (room.phase === 'voting' && room.votes) {
      room.votes.delete(sock.id);
      io.to(room.code).emit('vote_update', { votedCount: room.votes.size, total: room.players.length });
      if (room.votes.size >= room.players.length) {
        finalizeVoting(room);
        return;
      }
    }
    broadcastRoom(room);
  }
});

server.listen(PORT, () => {
  console.log(`Сервер игры «Шпион» запущен: http://localhost:${PORT}`);
});
