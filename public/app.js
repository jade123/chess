const rules = window.XiangqiRules;

const state = {
  board: rules.createInitialBoard(),
  selected: null,
  legalTargets: [],
  mode: "ai",
  turn: rules.RED,
  playerSide: rules.RED,
  playerId: localStorage.getItem("xiangqiPlayerId") || "",
  playerName: localStorage.getItem("xiangqiPlayerName") || "棋手",
  activeGameId: null,
  lastMove: null,
  autoDemo: false,
  pollTimer: null
};

const els = {
  board: document.querySelector("#board"),
  gameStatus: document.querySelector("#gameStatus"),
  onlineCount: document.querySelector("#onlineCount"),
  aiModeButton: document.querySelector("#aiModeButton"),
  onlineModeButton: document.querySelector("#onlineModeButton"),
  aiPanel: document.querySelector("#aiPanel"),
  onlinePanel: document.querySelector("#onlinePanel"),
  playerName: document.querySelector("#playerName"),
  saveName: document.querySelector("#saveName"),
  playerList: document.querySelector("#playerList"),
  requestBox: document.querySelector("#requestBox"),
  modeLabel: document.querySelector("#modeLabel"),
  turnLabel: document.querySelector("#turnLabel"),
  sideLabel: document.querySelector("#sideLabel"),
  aiDepth: document.querySelector("#aiDepth"),
  newAiGame: document.querySelector("#newAiGame"),
  autoPlay: document.querySelector("#autoPlay")
};

function sideLabel(side) {
  return side === rules.RED ? "红方" : "黑方";
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "请求失败");
  }
  return data;
}

function showStatus(text) {
  els.gameStatus.textContent = text;
}

function renderBoard() {
  els.board.innerHTML = "";
  const legalKeys = new Set(state.legalTargets.map(pos => `${pos.row}:${pos.col}`));
  const lastKeys = state.lastMove
    ? new Set([
      `${state.lastMove.from.row}:${state.lastMove.from.col}`,
      `${state.lastMove.to.row}:${state.lastMove.to.col}`
    ])
    : new Set();

  for (let row = 0; row < rules.ROWS; row += 1) {
    for (let col = 0; col < rules.COLS; col += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.style.left = `${(col / (rules.COLS - 1)) * 100}%`;
      cell.style.top = `${(row / (rules.ROWS - 1)) * 100}%`;
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      if (state.selected && state.selected.row === row && state.selected.col === col) {
        cell.classList.add("selected");
      }
      if (legalKeys.has(`${row}:${col}`)) {
        cell.classList.add("legal");
      }
      if (lastKeys.has(`${row}:${col}`)) {
        cell.classList.add("last-move");
      }
      const piece = state.board[row][col];
      if (piece) {
        const pieceEl = document.createElement("span");
        pieceEl.className = `piece ${rules.sideOf(piece)}`;
        pieceEl.textContent = rules.pieceNames[piece];
        cell.append(pieceEl);
      }
      cell.addEventListener("click", () => handleBoardClick({ row, col }));
      els.board.append(cell);
    }
  }
}

function renderMeta() {
  els.modeLabel.textContent = state.mode === "ai" ? (state.autoDemo ? "AI 演示" : "人机") : "在线对战";
  els.turnLabel.textContent = sideLabel(state.turn);
  els.sideLabel.textContent = state.mode === "online" ? sideLabel(state.playerSide) : "红方";
}

function clearSelection() {
  state.selected = null;
  state.legalTargets = [];
}

function legalTargetsFrom(pos) {
  return rules.generateLegalMoves(state.board, state.turn)
    .filter(move => move.from.row === pos.row && move.from.col === pos.col)
    .map(move => move.to);
}

function canInteractWithSide(side) {
  if (state.mode === "ai") {
    return !state.autoDemo && side === rules.RED && state.turn === rules.RED;
  }
  return side === state.playerSide && state.turn === state.playerSide;
}

function handleBoardClick(pos) {
  const piece = state.board[pos.row][pos.col];
  const pieceSide = rules.sideOf(piece);

  if (state.selected) {
    const move = { from: state.selected, to: pos };
    if (state.mode === "online") {
      submitOnlineMove(move);
      return;
    }
    const legal = rules.isLegalMove(state.board, move, state.turn);
    if (legal.ok) {
      makeLocalMove(move);
      clearSelection();
      render();
      window.setTimeout(runAiTurn, 180);
      return;
    }
  }

  if (piece && canInteractWithSide(pieceSide)) {
    state.selected = pos;
    state.legalTargets = legalTargetsFrom(pos);
  } else {
    clearSelection();
  }
  render();
}

function makeLocalMove(move) {
  state.board = rules.applyMove(state.board, move);
  state.lastMove = move;
  const winner = rules.getWinner(state.board);
  if (winner) {
    showStatus(`${sideLabel(winner)}获胜`);
    state.autoDemo = false;
    return;
  }
  state.turn = rules.opponent(state.turn);
  showStatus(`${sideLabel(state.turn)}行棋`);
}

function runAiTurn() {
  if (state.mode !== "ai") return;
  const shouldMove = state.autoDemo || state.turn === rules.BLACK;
  if (!shouldMove) return;
  const winner = rules.getWinner(state.board);
  if (winner) {
    showStatus(`${sideLabel(winner)}获胜`);
    state.autoDemo = false;
    render();
    return;
  }
  const move = rules.chooseAiMove(state.board, state.turn, els.aiDepth.value);
  if (!move) {
    const nextWinner = rules.opponent(state.turn);
    showStatus(`${sideLabel(nextWinner)}获胜`);
    state.autoDemo = false;
    render();
    return;
  }
  makeLocalMove(move);
  clearSelection();
  render();
  if (state.autoDemo) {
    window.setTimeout(runAiTurn, 520);
  }
}

function newAiGame() {
  state.mode = "ai";
  state.board = rules.createInitialBoard();
  state.turn = rules.RED;
  state.playerSide = rules.RED;
  state.activeGameId = null;
  state.lastMove = null;
  state.autoDemo = false;
  clearSelection();
  switchMode("ai");
  showStatus("红方先行");
  render();
}

function switchMode(mode) {
  state.mode = mode;
  els.aiModeButton.classList.toggle("active", mode === "ai");
  els.onlineModeButton.classList.toggle("active", mode === "online");
  els.aiPanel.classList.toggle("hidden", mode !== "ai");
  els.onlinePanel.classList.toggle("hidden", mode !== "online");
  renderMeta();
}

function render() {
  renderBoard();
  renderMeta();
}

async function joinOnline() {
  const name = els.playerName.value.trim() || "棋手";
  state.playerName = name;
  localStorage.setItem("xiangqiPlayerName", name);
  const data = await api("/api/join", {
    method: "POST",
    body: JSON.stringify({ playerId: state.playerId, name })
  });
  state.playerId = data.player.id;
  localStorage.setItem("xiangqiPlayerId", state.playerId);
  els.onlineCount.textContent = String(data.onlineCount);
}

async function pollOnline() {
  if (!state.playerId) return;
  const params = new URLSearchParams({ playerId: state.playerId, name: state.playerName });
  const data = await api(`/api/state?${params.toString()}`);
  els.onlineCount.textContent = String(data.onlineCount);
  renderPlayers(data.players);
  renderRequests(data.incoming, data.outgoing);
  if (state.mode === "online") {
    syncActiveGame(data.games);
  }
}

function renderPlayers(players) {
  const others = players.filter(player => player.id !== state.playerId);
  els.playerList.innerHTML = "";
  if (others.length === 0) {
    const empty = document.createElement("div");
    empty.className = "player-card";
    empty.textContent = "等待其他棋手上线";
    els.playerList.append(empty);
    return;
  }
  for (const player of others) {
    const card = document.createElement("div");
    card.className = "player-card";
    const info = document.createElement("div");
    info.innerHTML = `<div class="player-name"></div><div class="player-tag">在线</div>`;
    info.querySelector(".player-name").textContent = player.name;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "邀战";
    button.addEventListener("click", () => requestBattle(player.id));
    card.append(info, button);
    els.playerList.append(card);
  }
}

function renderRequests(incoming, outgoing) {
  els.requestBox.innerHTML = "";
  for (const request of incoming) {
    const item = document.createElement("div");
    item.className = "request-item";
    const name = request.from ? request.from.name : "棋手";
    const title = document.createElement("strong");
    title.textContent = `${name} 邀请你对战`;
    const actions = document.createElement("div");
    actions.className = "request-actions";
    const accept = document.createElement("button");
    accept.type = "button";
    accept.textContent = "接受";
    accept.addEventListener("click", () => respondBattle(request.id, true));
    const decline = document.createElement("button");
    decline.type = "button";
    decline.textContent = "拒绝";
    decline.addEventListener("click", () => respondBattle(request.id, false));
    actions.append(accept, decline);
    item.append(title, actions);
    els.requestBox.append(item);
  }
  for (const request of outgoing) {
    const item = document.createElement("div");
    item.className = "request-item";
    item.textContent = `已邀请 ${request.to ? request.to.name : "棋手"}`;
    els.requestBox.append(item);
  }
}

async function requestBattle(to) {
  await joinOnline();
  await api("/api/battle/request", {
    method: "POST",
    body: JSON.stringify({ from: state.playerId, to })
  });
  await pollOnline();
  showStatus("邀战已发出");
}

async function respondBattle(requestId, accept) {
  const data = await api("/api/battle/respond", {
    method: "POST",
    body: JSON.stringify({ requestId, playerId: state.playerId, accept })
  });
  if (data.game) {
    loadOnlineGame(data.game);
  }
  await pollOnline();
}

function syncActiveGame(games) {
  if (state.activeGameId) {
    const current = games.find(game => game.id === state.activeGameId);
    if (current) {
      loadOnlineGame(current, false);
    }
    return;
  }
  if (games.length > 0) {
    loadOnlineGame(games[0]);
  }
}

function loadOnlineGame(game, announce = true) {
  const me = game.players.find(player => player.id === state.playerId);
  state.mode = "online";
  state.board = game.board;
  state.turn = game.turn;
  state.playerSide = me ? me.side : rules.RED;
  state.activeGameId = game.id;
  state.lastMove = game.lastMove;
  state.autoDemo = false;
  clearSelection();
  switchMode("online");
  if (game.finished) {
    showStatus(`${sideLabel(game.winner)}获胜`);
  } else if (announce) {
    showStatus(`对局开始，你执${sideLabel(state.playerSide)}`);
  } else {
    showStatus(`${sideLabel(state.turn)}行棋`);
  }
  render();
}

async function submitOnlineMove(move) {
  const legal = rules.isLegalMove(state.board, move, state.playerSide);
  if (!legal.ok) {
    showStatus(legal.reason);
    clearSelection();
    render();
    return;
  }
  try {
    const data = await api(`/api/game/${state.activeGameId}/move`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId, from: move.from, to: move.to })
    });
    loadOnlineGame(data.game, false);
  } catch (error) {
    showStatus(error.message);
    await pollOnline();
  }
}

els.aiModeButton.addEventListener("click", () => {
  switchMode("ai");
  if (!state.activeGameId) render();
});

els.onlineModeButton.addEventListener("click", async () => {
  switchMode("online");
  await joinOnline();
  await pollOnline();
});

els.saveName.addEventListener("click", async () => {
  await joinOnline();
  await pollOnline();
});

els.newAiGame.addEventListener("click", newAiGame);

els.autoPlay.addEventListener("click", () => {
  state.mode = "ai";
  state.autoDemo = !state.autoDemo;
  els.autoPlay.textContent = state.autoDemo ? "停止演示" : "AI 自动演示";
  switchMode("ai");
  render();
  if (state.autoDemo) runAiTurn();
});

window.addEventListener("beforeunload", () => {
  if (state.playerId) {
    navigator.sendBeacon("/api/leave", JSON.stringify({ playerId: state.playerId }));
  }
});

async function boot() {
  els.playerName.value = state.playerName;
  render();
  try {
    await joinOnline();
    await pollOnline();
    state.pollTimer = window.setInterval(() => {
      pollOnline().catch(error => showStatus(error.message));
    }, 3000);
  } catch (error) {
    showStatus(error.message);
  }
}

boot();
