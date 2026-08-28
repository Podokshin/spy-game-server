// Правила «Длинных нард» — чистая логика без сокетов, чтобы её можно было
// протестировать отдельно от сервера.
//
// Доска — 24 точки (внутренне нумеруются 0..23). Оба игрока двигаются в одном
// вращательном направлении (по возрастанию номера точки, с 23 назад на 0).
// Белые стартуют, собрав все 15 шашек на точке 0, чёрные — на точке 12
// (диаметрально противоположная точка). Дом белых — точки 18..23, дом чёрных —
// точки 6..11 (это те же самые «последние 6 точек перед возвратом на старт»
// в системе координат каждого игрока).
//
// В длинных нардах нет взятия шашек — но, в отличие от короткого бэкгаммона,
// это значит не "можно ходить куда угодно", а наоборот: точка, на которой
// стоит хотя бы одна чужая шашка, полностью закрыта — своей шашке встать
// туда нельзя ни при каком раскладе (сбить и подвинуть чужую нельзя, а делить
// точку с чужими шашками правила не позволяют). Отсюда и тактика "заборов".

const POINTS = 24;
const HOME_SIZE = 6;
const CHECKERS_PER_PLAYER = 15;
const START = { white: 0, black: 12 };
const COLORS = ['white', 'black'];

function otherColor(color) {
  return color === 'white' ? 'black' : 'white';
}

function createInitialBoard() {
  const white = new Array(POINTS).fill(0);
  const black = new Array(POINTS).fill(0);
  white[START.white] = CHECKERS_PER_PLAYER;
  black[START.black] = CHECKERS_PER_PLAYER;
  return { white, black, borneOff: { white: 0, black: 0 } };
}

// Индекс точки на "собственном пути" игрока: 0 = стартовая точка,
// 23 = последняя точка дома перед выходом с доски.
function pathIndex(color, point) {
  return (point - START[color] + POINTS) % POINTS;
}

function pointFromPath(color, idx) {
  return (START[color] + idx) % POINTS;
}

function isHomePathIndex(idx) {
  return idx >= POINTS - HOME_SIZE; // 18..23
}

function checkersAt(board, color, point) {
  return board[color][point];
}

function totalOnBoard(board, color) {
  return board[color].reduce((sum, n) => sum + n, 0);
}

function isAllHome(board, color) {
  if (totalOnBoard(board, color) === 0) return board.borneOff[color] === CHECKERS_PER_PLAYER;
  for (let point = 0; point < POINTS; point++) {
    if (board[color][point] > 0 && !isHomePathIndex(pathIndex(color, point))) return false;
  }
  return true;
}

// Может ли игрок вывести шашку с точки `point`, используя кубик `die`.
function canBearOffFrom(board, color, point, die) {
  if (!isAllHome(board, color)) return false;
  const idx = pathIndex(color, point);
  if (!isHomePathIndex(idx)) return false;
  const dist = POINTS - idx; // 1..6, сколько очков нужно, чтобы выйти ровно
  if (die === dist) return true;
  if (die < dist) return false;
  // die > dist: разрешено, только если на доме нет шашек "дальше от выхода"
  // (с меньшим pathIndex в пределах дома), т.к. они обязаны ходить первыми.
  for (let p = 0; p < POINTS; p++) {
    if (p === point) continue;
    const otherIdx = pathIndex(color, p);
    if (isHomePathIndex(otherIdx) && otherIdx < idx && board[color][p] > 0) return false;
  }
  return true;
}

// «Правило головы»: за ход с головы (стартовой точки) можно увести только
// одну шашку — кроме самого первого хода всей партии, когда при дубле
// разрешается увести две. headState = { used, max } — сколько шашек уже
// увели с головы в этот ход и сколько максимум разрешено; при отсутствии
// headState ограничение не проверяется (используется в тестах и т.п.).
function isHeadMoveBlocked(color, from, headState) {
  if (!headState) return false;
  if (from !== START[color]) return false;
  return headState.used >= headState.max;
}

// Проверяет и описывает ход одной шашки с точки `from` на кубик `die`.
// Возвращает { legal, bearOff, to } — to не задан, если bearOff.
function describeMove(board, color, from, die, headState) {
  if (checkersAt(board, color, from) <= 0) return { legal: false };
  if (isHeadMoveBlocked(color, from, headState)) return { legal: false };
  const idx = pathIndex(color, from);
  const newIdx = idx + die;
  if (newIdx < POINTS) {
    const to = pointFromPath(color, newIdx);
    if (board[otherColor(color)][to] > 0) return { legal: false };
    return { legal: true, bearOff: false, to };
  }
  // Попытка выйти за пределы доски — это выход шашки (bear off).
  if (canBearOffFrom(board, color, from, die)) {
    return { legal: true, bearOff: true };
  }
  return { legal: false };
}

// Список точек, с которых можно сходить данным кубиком.
function listLegalSources(board, color, die, headState) {
  const sources = [];
  for (let point = 0; point < POINTS; point++) {
    if (board[color][point] > 0 && describeMove(board, color, point, die, headState).legal) {
      sources.push(point);
    }
  }
  return sources;
}

function hasAnyLegalMove(board, color, diceValues, headState) {
  const uniqueDice = Array.from(new Set(diceValues));
  return uniqueDice.some(die => listLegalSources(board, color, die, headState).length > 0);
}

// Применяет ход (мутирует board). Возвращает { to } (null, если шашка вышла).
function applyMove(board, color, from, die, headState) {
  const move = describeMove(board, color, from, die, headState);
  if (!move.legal) throw new Error('Недопустимый ход');
  board[color][from] -= 1;
  if (move.bearOff) {
    board.borneOff[color] += 1;
    return { to: null };
  }
  board[color][move.to] += 1;
  return { to: move.to };
}

function hasWon(board, color) {
  return board.borneOff[color] === CHECKERS_PER_PLAYER;
}

// «Марс» — соперник к концу партии не вывел ни одной шашки.
function isMarsa(board, winnerColor) {
  return board.borneOff[otherColor(winnerColor)] === 0;
}

function rollDice() {
  const d1 = 1 + Math.floor(Math.random() * 6);
  const d2 = 1 + Math.floor(Math.random() * 6);
  return [d1, d2];
}

// Значения кубиков, доступные для хода в этот ход (дубль даёт 4 хода).
function diceToMoves(dice) {
  if (dice.length === 2 && dice[0] === dice[1]) {
    return [dice[0], dice[0], dice[0], dice[0]];
  }
  return dice.slice();
}

module.exports = {
  POINTS,
  HOME_SIZE,
  CHECKERS_PER_PLAYER,
  START,
  COLORS,
  otherColor,
  createInitialBoard,
  pathIndex,
  pointFromPath,
  isHomePathIndex,
  isAllHome,
  canBearOffFrom,
  describeMove,
  listLegalSources,
  hasAnyLegalMove,
  applyMove,
  hasWon,
  isMarsa,
  rollDice,
  diceToMoves
};
