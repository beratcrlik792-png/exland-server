
const SERVER_URL = "wss://exland-server-production.up.railway.app";

let catalog = null;
let socket = null;
let localStream = null;
let muted = false;
let speakerMuted = false;
let myName = null;

const peers = new Map();
const remoteAudios = new Map();

const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

const $ = selector => document.querySelector(selector);

// KARAKTER OLUŞTURUCU

async function init() {
  try {
    const response = await fetch("/assets/catalog/cosmetics.json");
    if (!response.ok) throw new Error("Katalog yüklenemedi");

    catalog = await response.json();

    fill("outfits", catalog.outfits, "outfit");
    fill("pants", catalog.pants, "pants");
    fill("headwear", catalog.headwear, "headwear");
    fill("accessories", catalog.accessories, "accessory");

    fillSelect("hair", catalog.hair);
    fillSelect("beard", catalog.beards);

    document.querySelectorAll(".tab").forEach(button => {
      button.onclick = () => {
        document.querySelectorAll(".tab, .pane").forEach(element => {
          element.classList.remove("active");
        });

        button.classList.add("active");

        const pane = $("#" + button.dataset.tab);
        if (pane) pane.classList.add("active");
      };
    });

    loadSaved();
  } catch (error) {
    console.error(error);
    setStatus("Karakter kataloğu yüklenemedi.");
  }
}

function fill(id, items, key) {
  const root = $("#" + id);
  if (!root || !Array.isArray(items)) return;

  root.innerHTML = "";

  items.forEach((name, index) => {
    const button = document.createElement("button");
    button.className = "item" + (index === 0 ? " selected" : "");
    button.textContent = name;

    const small = document.createElement("small");
    small.textContent = "ÜCRETSİZ";
    button.appendChild(small);

    button.onclick = () => {
      choice[key] = index;

      root.querySelectorAll(".item").forEach(item => {
        item.classList.remove("selected");
      });

      button.classList.add("selected");
      save();
    };

    root.appendChild(button);
  });
}

const choice = {
  outfit: 0,
  pants: 0,
  headwear: 0,
  accessory: 0
};

function fillSelect(id, items) {
  const select = $("#" + id);
  if (!select || !Array.isArray(items)) return;

  select.innerHTML = "";

  items.forEach(value => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });

  select.onchange = save;
}

function save() {
  if (!catalog) return;

  const data = {
    gender: $("#gender")?.value || "",
    hair: $("#hair")?.value || "",
    beard: $("#beard")?.value || "",
    outfit: catalog.outfits[choice.outfit],
    pants: catalog.pants[choice.pants],
    headwear: catalog.headwear[choice.headwear],
    accessory: catalog.accessories[choice.accessory]
  };

  localStorage.setItem("exland_character", JSON.stringify(data));
}

function loadSaved() {
  try {
    const data = JSON.parse(localStorage.getItem("exland_character"));
    if (!data || !catalog) return;

    ["gender", "hair", "beard"].forEach(key => {
      const element = $("#" + key);
      if (element && data[key]) element.value = data[key];
    });

    const groups = [
      ["outfit", "outfits", catalog.outfits],
      ["pants", "pants", catalog.pants],
      ["headwear", "headwear", catalog.headwear],
      ["accessory", "accessories", catalog.accessories]
    ];

    groups.forEach(([key, id, items]) => {
      const index = items.indexOf(data[key]);
      if (index < 0) return;

      choice[key] = index;

      $("#" + id)?.querySelectorAll(".item").forEach((button, i) => {
        button.classList.toggle("selected", i === index);
      });
    });
  } catch (error) {
    console.warn("Karakter kaydı okunamadı:", error);
  }
}

$("#random")?.addEventListener("click", () => {
  if (!catalog) return;

  Object.keys(choice).forEach(key => {
    const items = catalog[key === "accessory" ? "accessories" : key];
    choice[key] = Math.floor(Math.random() * items.length);

    const id = key === "accessory" ? "accessories" : key;

    $("#" + id)?.querySelectorAll(".item").forEach((button, index) => {
      button.classList.toggle("selected", index === choice[key]);
    });
  });

  save();
});

$("#save")?.addEventListener("click", () => {
  save();
  if ($("#creator")) $("#creator").hidden = true;
  if ($("#lobby")) $("#lobby").hidden = false;
});

// DURUM MESAJI

function setStatus(message) {
  const element = $("#connection");
  if (element) element.textContent = message;
}

// WEBRTC SES SİSTEMİ

function sendSignal(target, signal) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;

  socket.send(JSON.stringify({
    type: "webrtc-signal",
    target,
    signal
  }));
}

function createPeer(remoteName) {
  if (peers.has(remoteName)) return peers.get(remoteName);

  const pc = new RTCPeerConnection(ICE_CONFIG);

  const peer = {
    pc,
    candidates: [],
    makingOffer: false
  };

  peers.set(remoteName, peer);

  if (localStream) {
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });
  }

  pc.onicecandidate = event => {
    if (event.candidate) {
      sendSignal(remoteName, {
        candidate: event.candidate
      });
    }
  };

  pc.ontrack = event => {
    let audio = remoteAudios.get(remoteName);

    if (!audio) {
      audio = document.createElement("audio");
      audio.autoplay = true;
      audio.playsInline = true;
      audio.className = "remote-voice";
      audio.dataset.player = remoteName;

      document.body.appendChild(audio);
      remoteAudios.set(remoteName, audio);
    }

    audio.srcObject = event.streams[0];
    audio.muted = speakerMuted;

    audio.play().catch(() => {
      setStatus("Diğer oyuncunun sesini duymak için sayfaya dokun.");
    });
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected") {
      setStatus("Ses bağlantısı kuruldu: " + remoteName);
    }

    if (
      pc.connectionState === "failed" ||
      pc.connectionState === "closed"
    ) {
      removePeer(remoteName);
    }
  };

  return peer;
}

async function startPeerConnection(remoteName) {
  if (!myName || !remoteName || remoteName === myName) return;

  // Teklifin yalnızca bir oyuncudan gitmesini sağlar.
  if (myName.localeCompare(remoteName) > 0) return;

  const peer = createPeer(remoteName);
  const pc = peer.pc;

  if (!localStream || pc.signalingState !== "stable") return;

  try {
    peer.makingOffer = true;

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    sendSignal(remoteName, {
      description: pc.localDescription
    });
  } catch (error) {
    console.error("WebRTC teklif hatası:", error);
  } finally {
    peer.makingOffer = false;
  }
}

async function handleSignal(from, signal) {
  if (!from || from === myName) return;

  const peer = createPeer(from);
  const pc = peer.pc;

  try {
    if (signal.description) {
      const description = signal.description;

      await pc.setRemoteDescription(description);

      while (peer.candidates.length) {
        await pc.addIceCandidate(peer.candidates.shift());
      }

      if (description.type === "offer") {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        sendSignal(from, {
          description: pc.localDescription
        });
      }
    }

    if (signal.candidate) {
      if (pc.remoteDescription) {
        await pc.addIceCandidate(signal.candidate);
      } else {
        peer.candidates.push(signal.candidate);
      }
    }
  } catch (error) {
    console.error("WebRTC sinyal hatası:", error);
  }
}

function removePeer(name) {
  const peer = peers.get(name);

  if (peer) {
    peer.pc.close();
    peers.delete(name);
  }

  const audio = remoteAudios.get(name);

  if (audio) {
    audio.pause();
    audio.srcObject = null;
    audio.remove();
    remoteAudios.delete(name);
  }
}

async function enableMicrophone() {
  if (localStream) {
    muted = !muted;

    localStream.getAudioTracks().forEach(track => {
      track.enabled = !muted;
    });

    updateMicButton();
    return;
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });

    muted = false;

    // Yeni oyuncularla ses bağlantısı kur.
    for (const name of connectedPlayers) {
      await startPeerConnection(name);
    }

    // Mevcut bağlantılara mikrofon parçalarını ekle.
    for (const [name, peer] of peers) {
      const pc = peer.pc;

      const existingAudioSender = pc.getSenders().find(
        sender => sender.track?.kind === "audio"
      );

      if (!existingAudioSender) {
        localStream.getAudioTracks().forEach(track => {
          pc.addTrack(track, localStream);
        });

        if (myName.localeCompare(name) < 0) {
          await startPeerConnection(name);
        }
      }
    }

    updateMicButton();
    setStatus("Mikrofon açık. Ses bağlantıları kuruluyor...");
  } catch (error) {
    console.error(error);
    setStatus("Mikrofon izni alınamadı. HTTPS ve mikrofon iznini kontrol et.");
  }
}

function updateMicButton() {
  const button = $("#mic");
  if (!button) return;

  if (!localStream) {
    button.textContent = "🎙 MİKROFON KAPALI";
  } else if (muted) {
    button.textContent = "🔇 MİKROFON SESSİZ";
  } else {
    button.textContent = "🎙 MİKROFON AÇIK";
  }
}

const connectedPlayers = new Set();

// SUNUCU BAĞLANTISI

function handleServerMessage(message) {
  if (message.type === "welcome") {
    myName = message.you.name;
    setStatus("Bağlandı: " + myName);
  }

  if (message.type === "error" || message.type === "voice-error") {
    setStatus(message.message);
  }

  if (message.type === "playerList") {
    for (const player of message.players || []) {
      if (player.name !== myName) {
        connectedPlayers.add(player.name);
        startPeerConnection(player.name);
      }
    }
  }

  if (message.type === "playerJoined") {
    if (message.name && message.name !== myName) {
      connectedPlayers.add(message.name);
      startPeerConnection(message.name);
    }
  }

  if (message.type === "playerLeft") {
    connectedPlayers.delete(message.name);
    removePeer(message.name);
  }

  if (message.type === "webrtc-signal") {
    handleSignal(message.from, message.signal);
  }
}

function connectToServer(name) {
  if (socket && socket.readyState !== WebSocket.CLOSED) {
    setStatus("Zaten bağlanıyorsun veya bağlısın.");
    return;
  }

  setStatus("Sunucuya bağlanılıyor...");

  socket = new WebSocket(SERVER_URL);

  socket.onopen = () => {
    socket.send(JSON.stringify({
      type: "join",
      name
    }));

    window.ExlandGame?.start(socket);
  };

  socket.onmessage = event => {
    try {
      handleServerMessage(JSON.parse(event.data));
    } catch (error) {
      console.error("Sunucu mesajı okunamadı:", error);
    }
  };

  socket.onerror = () => {
    setStatus("Sunucu bağlantı hatası.");
  };

  socket.onclose = () => {
    setStatus("Sunucu bağlantısı kapandı.");

    for (const name of [...peers.keys()]) {
      removePeer(name);
    }

    connectedPlayers.clear();
    myName = null;
  };
}

$("#connect")?.addEventListener("click", () => {
  const name = $("#playerName")?.value.trim();

  if (!name) {
    setStatus("Önce oyuncu adı gir.");
    return;
  }

  connectToServer(name);
});

// OYUN DÜĞMELERİ

$("#fire")?.addEventListener("click", () => {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "shoot" }));
  }

  if ($("#gameScene")) {
    $("#gameScene").textContent = "ATEŞ!";
  }
});

$("#reload")?.addEventListener("click", () => {
  const button = $("#reload");
  button.textContent = "ŞARJÖR DOLDURULUYOR...";

  setTimeout(() => {
    button.textContent = "ŞARJÖR ↻";
  }, 1000);
});

$("#crouch")?.addEventListener("click", () => {
  $("#crouch")?.classList.toggle("muted");
});

$("#door")?.addEventListener("click", () => {
  if (!$("#gameScene")) return;

  $("#gameScene").textContent = "KAPI AÇILDI";

  setTimeout(() => {
    $("#gameScene").textContent = "OYUN ALANI";
  }, 900);
});

// MİKROFON

$("#mic")?.addEventListener("click", enableMicrophone);

// SES KONTROLÜ

$("#speaker")?.addEventListener("click", () => {
  speakerMuted = !speakerMuted;

  remoteAudios.forEach(audio => {
    audio.muted = speakerMuted;
  });

  $("#speaker").textContent = speakerMuted
    ? "🔇 SES KAPALI"
    : "🔊 SES AÇIK";

  $("#speaker").classList.toggle("muted", speakerMuted);
});

// BAŞLAT

init();
