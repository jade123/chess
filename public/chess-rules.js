(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.XiangqiRules = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  const RED = "red";
  const BLACK = "black";
  const ROWS = 10;
  const COLS = 9;

  const pieceNames = {
    k: "将",
    a: "士",
    e: "象",
    h: "马",
    r: "车",
    c: "炮",
    p: "卒",
    K: "帅",
    A: "仕",
    E: "相",
    H: "马",
    R: "车",
    C: "炮",
    P: "兵"
  };

  const values = {
    k: 10000,
    a: 120,
    e: 120,
    h: 320,
    r: 650,
    c: 360,
    p: 90,
    K: 10000,
    A: 120,
    E: 120,
    H: 320,
    R: 650,
    C: 360,
    P: 90
  };

  function createInitialBoard() {
    return [
      ["r", "h", "e", "a", "k", "a", "e", "h", "r"],
      [null, null, null, null, null, null, null, null, null],
      [null, "c", null, null, null, null, null, "c", null],
      ["p", null, "p", null, "p", null, "p", null, "p"],
      [null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null],
      ["P", null, "P", null, "P", null, "P", null, "P"],
      [null, "C", null, null, null, null, null, "C", null],
      [null, null, null, null, null, null, null, null, null],
      ["R", "H", "E", "A", "K", "A", "E", "H", "R"]
    ];
  }

  function cloneBoard(board) {
    return board.map(row => row.slice());
  }

  function inBounds(pos) {
    return pos && pos.row >= 0 && pos.row < ROWS && pos.col >= 0 && pos.col < COLS;
  }

  function sideOf(piece) {
    if (!piece) return null;
    return piece === piece.toUpperCase() ? RED : BLACK;
  }

  function opponent(side) {
    return side === RED ? BLACK : RED;
  }

  function palaceContains(side, pos) {
    const rows = side === RED ? [7, 8, 9] : [0, 1, 2];
    return rows.includes(pos.row) && pos.col >= 3 && pos.col <= 5;
  }

  function crossedRiver(side, row) {
    return side === RED ? row <= 4 : row >= 5;
  }

  function isStraight(from, to) {
    return from.row === to.row || from.col === to.col;
  }

  function clearStraightPath(board, from, to) {
    if (!isStraight(from, to)) return false;
    const rowStep = Math.sign(to.row - from.row);
    const colStep = Math.sign(to.col - from.col);
    let row = from.row + rowStep;
    let col = from.col + colStep;
    while (row !== to.row || col !== to.col) {
      if (board[row][col]) return false;
      row += rowStep;
      col += colStep;
    }
    return true;
  }

  function countScreens(board, from, to) {
    if (!isStraight(from, to)) return Infinity;
    const rowStep = Math.sign(to.row - from.row);
    const colStep = Math.sign(to.col - from.col);
    let row = from.row + rowStep;
    let col = from.col + colStep;
    let count = 0;
    while (row !== to.row || col !== to.col) {
      if (board[row][col]) count += 1;
      row += rowStep;
      col += colStep;
    }
    return count;
  }

  function findKing(board, side) {
    const target = side === RED ? "K" : "k";
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        if (board[row][col] === target) return { row, col };
      }
    }
    return null;
  }

  function kingsFace(board) {
    const redKing = findKing(board, RED);
    const blackKing = findKing(board, BLACK);
    if (!redKing || !blackKing || redKing.col !== blackKing.col) return false;
    return clearStraightPath(board, blackKing, redKing);
  }

  function basicPieceMoveOk(board, from, to, piece) {
    const side = sideOf(piece);
    const target = board[to.row][to.col];
    const dr = to.row - from.row;
    const dc = to.col - from.col;
    const absRow = Math.abs(dr);
    const absCol = Math.abs(dc);
    const lower = piece.toLowerCase();

    if (target && sideOf(target) === side) return false;

    if (lower === "k") {
      if (target && target.toLowerCase() === "k" && from.col === to.col) {
        return clearStraightPath(board, from, to);
      }
      return palaceContains(side, to) && absRow + absCol === 1;
    }

    if (lower === "a") {
      return palaceContains(side, to) && absRow === 1 && absCol === 1;
    }

    if (lower === "e") {
      const eye = { row: from.row + dr / 2, col: from.col + dc / 2 };
      const staysHome = side === RED ? to.row >= 5 : to.row <= 4;
      return absRow === 2 && absCol === 2 && staysHome && !board[eye.row][eye.col];
    }

    if (lower === "h") {
      if (!((absRow === 2 && absCol === 1) || (absRow === 1 && absCol === 2))) return false;
      const leg = absRow === 2
        ? { row: from.row + Math.sign(dr), col: from.col }
        : { row: from.row, col: from.col + Math.sign(dc) };
      return !board[leg.row][leg.col];
    }

    if (lower === "r") {
      return clearStraightPath(board, from, to);
    }

    if (lower === "c") {
      if (!isStraight(from, to)) return false;
      const screens = countScreens(board, from, to);
      return target ? screens === 1 : screens === 0;
    }

    if (lower === "p") {
      const forward = side === RED ? -1 : 1;
      if (dr === forward && dc === 0) return true;
      return crossedRiver(side, from.row) && dr === 0 && absCol === 1;
    }

    return false;
  }

  function isThreatenedBy(board, pos, attackerSide) {
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const piece = board[row][col];
        if (piece && sideOf(piece) === attackerSide) {
          if (basicPieceMoveOk(board, { row, col }, pos, piece)) return true;
        }
      }
    }
    return false;
  }

  function isInCheck(board, side) {
    const king = findKing(board, side);
    if (!king) return true;
    return isThreatenedBy(board, king, opponent(side)) || kingsFace(board);
  }

  function normalizeMove(move) {
    if (!move || !move.from || !move.to) return null;
    return {
      from: { row: Number(move.from.row), col: Number(move.from.col) },
      to: { row: Number(move.to.row), col: Number(move.to.col) }
    };
  }

  function applyMove(board, move) {
    const normalized = normalizeMove(move);
    const next = cloneBoard(board);
    const piece = next[normalized.from.row][normalized.from.col];
    next[normalized.from.row][normalized.from.col] = null;
    next[normalized.to.row][normalized.to.col] = piece;
    return next;
  }

  function isLegalMove(board, rawMove, side) {
    const move = normalizeMove(rawMove);
    if (!move || !inBounds(move.from) || !inBounds(move.to)) {
      return { ok: false, reason: "棋步超出棋盘。" };
    }
    const piece = board[move.from.row][move.from.col];
    if (!piece) return { ok: false, reason: "起点没有棋子。" };
    if (sideOf(piece) !== side) return { ok: false, reason: "不能移动对方棋子。" };
    if (move.from.row === move.to.row && move.from.col === move.to.col) {
      return { ok: false, reason: "请选择不同的位置。" };
    }
    if (!basicPieceMoveOk(board, move.from, move.to, piece)) {
      return { ok: false, reason: "这枚棋子不能这样走。" };
    }
    const next = applyMove(board, move);
    if (isInCheck(next, side)) {
      return { ok: false, reason: "这步会让己方将帅受攻。" };
    }
    return { ok: true };
  }

  function generateLegalMoves(board, side) {
    const moves = [];
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const piece = board[row][col];
        if (!piece || sideOf(piece) !== side) continue;
        for (let toRow = 0; toRow < ROWS; toRow += 1) {
          for (let toCol = 0; toCol < COLS; toCol += 1) {
            const move = { from: { row, col }, to: { row: toRow, col: toCol } };
            if (isLegalMove(board, move, side).ok) moves.push(move);
          }
        }
      }
    }
    return moves;
  }

  function getWinner(board) {
    if (!findKing(board, RED)) return BLACK;
    if (!findKing(board, BLACK)) return RED;
    if (generateLegalMoves(board, RED).length === 0) return BLACK;
    if (generateLegalMoves(board, BLACK).length === 0) return RED;
    return null;
  }

  function getCapturedKingWinner(board) {
    if (!findKing(board, RED)) return BLACK;
    if (!findKing(board, BLACK)) return RED;
    return null;
  }

  function evaluate(board, side) {
    let score = 0;
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const piece = board[row][col];
        if (!piece) continue;
        const pieceSide = sideOf(piece);
        const advancement = piece.toLowerCase() === "p"
          ? (pieceSide === RED ? 9 - row : row) * 8
          : 0;
        const amount = values[piece] + advancement;
        score += pieceSide === side ? amount : -amount;
      }
    }
    return score;
  }

  function chooseAiMove(board, side, depth) {
    const legal = generateLegalMoves(board, side);
    if (legal.length === 0) return null;
    const searchDepth = Math.max(1, Math.min(3, Number(depth || 2)));
    let bestMove = legal[0];
    let bestScore = -Infinity;
    for (const move of legal) {
      const next = applyMove(board, move);
      const score = -negamax(next, opponent(side), searchDepth - 1, -Infinity, Infinity, side);
      if (score > bestScore || (score === bestScore && Math.random() < 0.25)) {
        bestScore = score;
        bestMove = move;
      }
    }
    return bestMove;
  }

  function negamax(board, side, depth, alpha, beta, rootSide) {
    const winner = getCapturedKingWinner(board);
    if (winner) {
      return winner === rootSide ? 100000 : -100000;
    }
    if (depth === 0) {
      return side === rootSide ? evaluate(board, rootSide) : -evaluate(board, rootSide);
    }
    let best = -Infinity;
    const moves = generateLegalMoves(board, side);
    for (const move of moves) {
      const score = -negamax(applyMove(board, move), opponent(side), depth - 1, -beta, -alpha, rootSide);
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
      if (alpha >= beta) break;
    }
    return best;
  }

  return {
    RED,
    BLACK,
    ROWS,
    COLS,
    pieceNames,
    createInitialBoard,
    cloneBoard,
    sideOf,
    opponent,
    isLegalMove,
    applyMove,
    generateLegalMoves,
    getWinner,
    chooseAiMove,
    evaluate
  };
});
