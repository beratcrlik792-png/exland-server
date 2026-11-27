
const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({
  server,
  maxPayload: 16 * 1024
});

const players = new Map();
const rooms = new Map();

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcast(data, except = null) {
  const message = JSON.stringify(data);

  wss.clients.forEach(client => {
    if (
      client !== except &&
      client.readyState === WebSocket.OPEN
    ) {
      client.send(message);
    }
  });
}

// Ana sayfa
app.get("/", (req, res) => {
  res.json({
    game: "EXLAND",
    status: "ONLINE",
    players: players.size,
    rooms: rooms.size,
    websocket: "READY"
  });
});

// Sunucu durumu
app.get("/status", (req, res) => {
  res.json({
    online: true,
    game: "EXLAND",
    playerCount: players.size,
    roomCount: rooms.size
  });
});

// Oyuncu listesi
app.get("/players", (req, res) => {
  res.json({
    players: [...players.values()]
  });
});

// WebSocket bağlantısı
wss.on("connection", ws => {
  let playerName = null;

  console.log("Yeni bağlantı.");

  ws.on("message", raw => {
    try {
      const data = JSON.parse(raw.toString());

      if (!data || typeof data.type !== "string") {
        return send(ws, {
          type: "error",
          message: "Geçersiz mesaj."
        });
      }

      // Oyuncu girişi
      if (data.type === "join") {
        if (playerName) {
          return send(ws, {
            type: "error",
            message: "Zaten sunucuya bağlısın."
          });
        }

        const name = String(data.name || "").trim();

        if (!/^[a-zA-Z0-9_]{3,16}$/.test(name)) {
          return send(ws, {
            type: "error",
            message: "İsim 3-16 karakter olmalı."
          });
        }

        const taken = [...players.values()].some(
          p => p.name.toLowerCase() === name.toLowerCase()
        );

        if (taken) {
          return send(ws, {
            type: "error",
            message: "Bu isim zaten kullanılıyor!"
          });
        }

        playerName = name;

        const player = {
          name,
          x: 0,
          y: 0,
          z: 0,
          health: 100,
          score: 0
        };

        players.set(ws, player);

        // app.js ile uyumlu karşılama mesajı
        send(ws, {
          type: "welcome",
          you: {
            name: player.name,
            health: player.health
          }
        });

        broadcast({
          type: "playerList",
          players: [...players.values()]
        });

        console.log(`${name} EXLAND sunucusuna katıldı.`);
        return;
      }

      // Giriş yapmadan oyun mesajı gönderilemez
      if (!playerName) {
        return send(ws, {
          type: "error",
          message: "Önce sunucuya giriş yap."
        });
      }

      const player = players.get(ws);

      if (!player) return;

      // Oyuncu hareketi
      if (data.type === "move") {
        const x = Number(data.x);
        const y = Number(data.y);
        const z = Number(data.z);

        if (![x, y, z].every(Number.isFinite)) {
          return;
        }

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

        return;
      }

      // Ateş etme
      if (data.type === "shoot") {
        broadcast({
          type: "shot",
          shooter: playerName,
          target: data.target || null,
          weapon: data.weapon || "Classic"
        }, ws);

        return;
      }

    } catch (error) {
      send(ws, {
        type: "error",
        message: "Geçersiz mesaj."
      });
    }
  });

  // Bağlantı kapandığında
  ws.on("close", () => {
    if (playerName) {
      players.delete(ws);

      console.log(`${playerName} sunucudan ayrıldı.`);

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

  ws.on("error", error => {
    console.error("WebSocket hatası:", error.message);
  });
});

// Sunucuyu başlat
const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`EXLAND SERVER ONLINE: ${PORT}`);
});
