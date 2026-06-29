const assert = require("assert");
const rules = require("../public/chess-rules");

const board = rules.createInitialBoard();

assert.strictEqual(rules.generateLegalMoves(board, rules.RED).length > 0, true);
assert.strictEqual(rules.isLegalMove(board, { from: { row: 9, col: 0 }, to: { row: 8, col: 0 } }, rules.RED).ok, true);
assert.strictEqual(rules.isLegalMove(board, { from: { row: 9, col: 1 }, to: { row: 7, col: 2 } }, rules.RED).ok, true);
assert.strictEqual(rules.isLegalMove(board, { from: { row: 9, col: 2 }, to: { row: 5, col: 6 } }, rules.RED).ok, false);
assert.strictEqual(rules.isLegalMove(board, { from: { row: 6, col: 0 }, to: { row: 6, col: 1 } }, rules.RED).ok, false);

const moved = rules.applyMove(board, { from: { row: 6, col: 0 }, to: { row: 5, col: 0 } });
assert.strictEqual(moved[5][0], "P");
assert.strictEqual(board[6][0], "P");

const aiMove = rules.chooseAiMove(board, rules.BLACK, 1);
assert.ok(aiMove, "AI should find a move");
assert.strictEqual(rules.isLegalMove(board, aiMove, rules.BLACK).ok, true);

console.log("rules ok");
