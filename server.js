
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const players = new Map();
const rooms = new Map();

app.get("/", (req, res) => {
  res.json({
    game: "EXLAND",
    status: "ONLINE",
    players: players.size,
    rooms: rooms.size
  });
});

app.get("/status", (req, res) => {
  res.json({
    online: true,
    game: "EXLAND",
    playerCount: players.size
  });
});

wss.on("connection", (ws) => {
  let playerName = null;

  ws.on("message", (raw) => {
    try {
      const data = JSON.parse(raw);

      if (data.type === "join") {
        const name = String(data.name || "").trim();

        if (!/^[a-zA-Z0-9_]{3,16}$/.test(name)) {
          ws.send(JSON.stringify({
            type: "error",
            message: "İsim 3-16 karakter olmalı."
          }));
          return;
        }

        const taken = [...players.values()].some(
          p => p.name.toLowerCase() === name.toLowerCase()
        );

        if (taken) {
          ws.send(JSON.stringify({
            type: "error",
            message: "Bu ismi zaten başka birisi almış!"
          }));
          return;
        }

        playerName = name;
        players.set(ws, {
          name,
          x: 0,
          y: 0,
          z: 0,
          health: 100,
          score: 0
        });

        ws.send(JSON.stringify({
          type: "joined",
          name,
          health: 100
        }));

        broadcast({
          type: "playerList",
          players: [...players.values()]
        });
      }

      if (!playerName) return;

      const player = players.get(ws);

      if (data.type === "move") {
        player.x = Number(data.x) || 0;
        player.y = Number(data.y) || 0;
        player.z = Number(data.z) || 0;

        broadcast({
          type: "playerMoved",
          name: playerName,
          x: player.x,
          y: player.y,
          z: player.z
        }, ws);
      }

      if (data.type === "shoot") {
        broadcast({
          type: "shot",
          shooter: playerName,
          target: data.target || null,
          weapon: data.weapon || "Classic"
        }, ws);
      }

    } catch {
      ws.send(JSON.stringify({
        type: "error",
        message: "Geçersiz mesaj."
      }));
    }
  });

  ws.on("close", () => {
    if (playerName) {
      players.delete(ws);

      broadcast({
        type: "playerLeft",
        name: playerName
      });

      broadcast({
        type: "playerList",
        players: [...players.values()]
      });
    }
  });
});

function broadcast(data, except = null) {
  const message = JSON.stringify(data);

  wss.clients.forEach(client => {
    if (client !== except &&
        client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`EXLAND SERVER ONLINE: ${PORT}`);
});
