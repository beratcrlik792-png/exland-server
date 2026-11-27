
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);

const wss = new WebSocket.Server({
  server,
  maxPayload: 16384
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "client")));
app.use("/assets", express.static(path.join(__dirname, "assets")));

const players = new Map();

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(data, except = null) {
  for (const client of wss.clients) {
    if (client !== except && client.readyState === WebSocket.OPEN) {
      send(client, data);
    }
  }
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "client", "index.html"));
});

app.get("/status", (req, res) => {
  res.json({
    game: "EXLAND",
    online: true,
    players: players.size
  });
});

app.get("/players", (req, res) => {
  res.json([...players.values()]);
});

wss.on("connection", ws => {
  let playerName = null;

  ws.on("message", raw => {
    try {
      const data = JSON.parse(raw.toString());

      if (data.type === "join") {
        if (playerName) return;

        const name = String(data.name || "").trim();

        if (!/^[a-zA-Z0-9_]{3,16}$/.test(name)) {
          send(ws, {
            type: "error",
            message: "İsim 3-16 karakter olmalı."
          });
          return;
        }

        const taken = [...players.values()].some(
          player => player.name.toLowerCase() === name.toLowerCase()
        );

        if (taken) {
          send(ws, {
            type: "error",
            message: "Bu isim zaten kullanılıyor."
          });
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

        send(ws, {
          type: "welcome",
          you: {
            name,
            health: 100
          }
        });

        send(ws, {
          type: "playerList",
          players: [...players.values()]
        });

        broadcast({
          type: "playerJoined",
          name
        }, ws);

        return;
      }

      if (!playerName) return;

      const player = players.get(ws);
      if (!player) return;

      if (data.type === "move") {
        const x = Number(data.x);
        const y = Number(data.y);
        const z = Number(data.z);

        if (![x, y, z].every(Number.isFinite)) return;

        player.x = Math.max(-10000, Math.min(10000, x));
        player.y = Math.max(-10000, Math.min(10000, y));
        player.z = Math.max(-10000, Math.min(10000, z));

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

      // WebRTC signaling: teklif, cevap ve ICE adayları
      if (data.type === "webrtc-signal") {
        const target = String(data.target || "");

        if (!target || !data.signal || typeof data.signal !== "object") {
          return;
        }

        const targetSocket = [...players.keys()].find(
          client => players.get(client)?.name === target
        );

        if (!targetSocket) {
          send(ws, {
            type: "voice-error",
            message: "Ses bağlantısı kurulacak oyuncu bulunamadı: " + target
          });
          return;
        }

        send(targetSocket, {
          type: "webrtc-signal",
          from: playerName,
          signal: data.signal
        });
      }

    } catch (error) {
      send(ws, {
        type: "error",
        message: "Geçersiz mesaj."
      });
    }
  });

  ws.on("close", () => {
    if (!playerName) return;

    players.delete(ws);

    broadcast({
      type: "playerLeft",
      name: playerName
    });

    broadcast({
      type: "playerList",
      players: [...players.values()]
    });
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("EXLAND SERVER ONLINE: " + PORT);
});
