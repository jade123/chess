const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const rules = require("./public/chess-rules");

const PORT = Number(process.env.PORT || 5174);
const PUBLIC_DIR = path.join(__dirname, "public");
const ONLINE_TTL = 45_000;

const players = new Map();
const requests = new Map();
const games = new Map();

function now() {
  return Date.now();
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function cleanStale() {
  const cutoff = now() - ONLINE_TTL;
  for (const [playerId, player] of players) {
    if (player.lastSeen < cutoff) {
      players.delete(playerId);
    }
  }
  for (const [requestId, request] of requests) {
    if (request.createdAt < now() - 120_000 || !players.has(request.from) || !players.has(request.to)) {
      requests.delete(requestId);
    }
  }
}

function publicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    lastSeen: player.lastSeen
  };
}

function playerGames(playerId) {
  return [...games.values()]
    .filter(game => game.players.some(player => player.id === playerId) && !game.finished)
    .map(game => publicGame(game));
}

function publicGame(game) {
  return {
    id: game.id,
    board: game.board,
    turn: game.turn,
    players: game.players,
    finished: game.finished,
    winner: game.winner,
    lastMove: game.lastMove,
    updatedAt: game.updatedAt
  };
}

function touchPlayer(playerId, name) {
  const cleanName = String(name || "棋手").trim().slice(0, 20) || "棋手";
  const existing = players.get(playerId);
  if (existing) {
    existing.name = cleanName;
    existing.lastSeen = now();
    return existing;
  }
  const player = { id: playerId, name: cleanName, lastSeen: now() };
  players.set(playerId, player);
  return player;
}

async function handleApi(req, res, url) {
  cleanStale();

  if (req.method === "POST" && url.pathname === "/api/join") {
    const body = await readJson(req);
    const playerId = body.playerId || id("p");
    const player = touchPlayer(playerId, body.name);
    sendJson(res, 200, { player: publicPlayer(player), onlineCount: players.size });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/leave") {
    const body = await readJson(req);
    if (body.playerId) {
      players.delete(body.playerId);
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/state") {
    const playerId = url.searchParams.get("playerId");
    const name = url.searchParams.get("name") || "棋手";
    if (playerId) {
      touchPlayer(playerId, name);
    }
    const incoming = [...requests.values()]
      .filter(request => request.to === playerId)
      .map(request => ({
        id: request.id,
        from: publicPlayer(players.get(request.from)),
        createdAt: request.createdAt
      }));
    const outgoing = [...requests.values()]
      .filter(request => request.from === playerId)
      .map(request => ({
        id: request.id,
        to: publicPlayer(players.get(request.to)),
        createdAt: request.createdAt
      }));
    sendJson(res, 200, {
      onlineCount: players.size,
      players: [...players.values()].map(publicPlayer),
      incoming,
      outgoing,
      games: playerGames(playerId)
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/battle/request") {
    const body = await readJson(req);
    if (!players.has(body.from) || !players.has(body.to) || body.from === body.to) {
      sendJson(res, 400, { error: "请选择在线棋手发起邀战。" });
      return;
    }
    const duplicate = [...requests.values()].find(request => request.from === body.from && request.to === body.to);
    if (duplicate) {
      sendJson(res, 200, { request: duplicate });
      return;
    }
    const request = { id: id("r"), from: body.from, to: body.to, createdAt: now() };
    requests.set(request.id, request);
    sendJson(res, 200, { request });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/battle/respond") {
    const body = await readJson(req);
    const request = requests.get(body.requestId);
    if (!request || request.to !== body.playerId) {
      sendJson(res, 404, { error: "邀战已失效。" });
      return;
    }
    requests.delete(request.id);
    if (body.accept !== true) {
      sendJson(res, 200, { accepted: false });
      return;
    }
    const red = players.get(request.from);
    const black = players.get(request.to);
    if (!red || !black) {
      sendJson(res, 404, { error: "对手已离线。" });
      return;
    }
    const game = {
      id: id("g"),
      board: rules.createInitialBoard(),
      turn: "red",
      players: [
        { id: red.id, name: red.name, side: "red" },
        { id: black.id, name: black.name, side: "black" }
      ],
      finished: false,
      winner: null,
      lastMove: null,
      updatedAt: now()
    };
    games.set(game.id, game);
    sendJson(res, 200, { accepted: true, game: publicGame(game) });
    return;
  }

  const gameMove = url.pathname.match(/^\/api\/game\/([^/]+)\/move$/);
  if (req.method === "POST" && gameMove) {
    const game = games.get(gameMove[1]);
    const body = await readJson(req);
    if (!game) {
      sendJson(res, 404, { error: "对局不存在。" });
      return;
    }
    const player = game.players.find(item => item.id === body.playerId);
    if (!player) {
      sendJson(res, 403, { error: "你不在这个对局里。" });
      return;
    }
    if (game.finished) {
      sendJson(res, 409, { error: "对局已结束。", game: publicGame(game) });
      return;
    }
    if (player.side !== game.turn) {
      sendJson(res, 409, { error: "还没轮到你走棋。", game: publicGame(game) });
      return;
    }
    const move = {
      from: body.from,
      to: body.to
    };
    const legal = rules.isLegalMove(game.board, move, player.side);
    if (!legal.ok) {
      sendJson(res, 400, { error: legal.reason || "这步棋不能走。", game: publicGame(game) });
      return;
    }
    const nextBoard = rules.applyMove(game.board, move);
    const winner = rules.getWinner(nextBoard);
    game.board = nextBoard;
    game.turn = rules.opponent(game.turn);
    game.finished = Boolean(winner);
    game.winner = winner;
    game.lastMove = { ...move, side: player.side };
    game.updatedAt = now();
    sendJson(res, 200, { game: publicGame(game) });
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/game/")) {
    const gameId = url.pathname.split("/")[3];
    const game = games.get(gameId);
    if (!game) {
      sendJson(res, 404, { error: "对局不存在。" });
      return;
    }
    sendJson(res, 200, { game: publicGame(game) });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

function serveStatic(req, res, url) {
  let filePath = decodeURIComponent(url.pathname);
  if (filePath === "/") {
    filePath = "/index.html";
  }
  const resolved = path.normalize(path.join(PUBLIC_DIR, filePath));
  if (!resolved.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(resolved, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    const type = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8"
    }[ext] || "application/octet-stream";
    res.writeHead(200, {
      "content-type": type,
      "cache-control": "no-store"
    });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    handleApi(req, res, url).catch(error => {
      console.error(error);
      sendJson(res, 500, { error: "服务器开小差了，请稍后再试。" });
    });
    return;
  }
  serveStatic(req, res, url);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Xiangqi server listening on http://127.0.0.1:${PORT}`);
});
