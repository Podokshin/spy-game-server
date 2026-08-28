// Клиентская копия чистой логики из lib/nardy-rules.js — используется только
// для подсветки легальных ходов в интерфейсе (UX-подсказка). Сервер всегда
// перепроверяет каждый ход самостоятельно, так что рассинхронизация этих
// двух копий не даёт читерства — в худшем случае подсветка будет неточной.
// При изменении правил обязательно синхронизируй обе копии.
window.NardyRules = (function () {
  const POINTS = 24;
  const HOME_SIZE = 6;
  const START = { white: 0, black: 12 };

  function otherColor(color) {
    return color === 'white' ? 'black' : 'white';
  }

  function pathIndex(color, point) {
    return (point - START[color] + POINTS) % POINTS;
  }

  function pointFromPath(color, idx) {
    return (START[color] + idx) % POINTS;
  }

  function isHomePathIndex(idx) {
    return idx >= POINTS - HOME_SIZE;
  }

  function totalOnBoard(board, color) {
    return board[color].reduce((sum, n) => sum + n, 0);
  }

  function isAllHome(board, color) {
    if (totalOnBoard(board, color) === 0) return board.borneOff[color] === 15;
    for (let point = 0; point < POINTS; point++) {
      if (board[color][point] > 0 && !isHomePathIndex(pathIndex(color, point))) return false;
    }
    return true;
  }

  function canBearOffFrom(board, color, point, die) {
    if (!isAllHome(board, color)) return false;
    const idx = pathIndex(color, point);
    if (!isHomePathIndex(idx)) return false;
    const dist = POINTS - idx;
    if (die === dist) return true;
    if (die < dist) return false;
    for (let p = 0; p < POINTS; p++) {
      if (p === point) continue;
      const otherIdx = pathIndex(color, p);
      if (isHomePathIndex(otherIdx) && otherIdx < idx && board[color][p] > 0) return false;
    }
    return true;
  }

  // headState = { used, max } — см. комментарий в lib/nardy-rules.js.
  function isHeadMoveBlocked(color, from, headState) {
    if (!headState) return false;
    if (from !== START[color]) return false;
    return headState.used >= headState.max;
  }

  function describeMove(board, color, from, die, headState) {
    if (board[color][from] <= 0) return { legal: false };
    if (isHeadMoveBlocked(color, from, headState)) return { legal: false };
    const idx = pathIndex(color, from);
    const newIdx = idx + die;
    if (newIdx < POINTS) {
      const to = pointFromPath(color, newIdx);
      if (board[otherColor(color)][to] > 0) return { legal: false };
      return { legal: true, bearOff: false, to };
    }
    if (canBearOffFrom(board, color, from, die)) {
      return { legal: true, bearOff: true };
    }
    return { legal: false };
  }

  function listLegalSources(board, color, die, headState) {
    const sources = [];
    for (let point = 0; point < POINTS; point++) {
      if (board[color][point] > 0 && describeMove(board, color, point, die, headState).legal) {
        sources.push(point);
      }
    }
    return sources;
  }

  return { POINTS, HOME_SIZE, START, pathIndex, pointFromPath, isHomePathIndex, isAllHome, canBearOffFrom, describeMove, listLegalSources };
})();
