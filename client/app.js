
const SERVER_URL = "wss://exland-server-production.up.railway.app";

let catalog;
let socket = null;
let localStream = null;
let muted = false;

let choice = {
  outfit: 0,
  pants: 0,
  headwear: 0,
  accessory: 0
};

const $ = selector => document.querySelector(selector);

async function init() {
  try {
    catalog = await fetch("../assets/catalog/cosmetics.json")
      .then(response => {
        if (!response.ok) throw new Error("Katalog yüklenemedi");
        return response.json();
      });

    fill("outfits", catalog.outfits, "outfit");
    fill("pants", catalog.pants, "pants");
    fill("headwear", catalog.headwear, "headwear");
    fill("accessories", catalog.accessories, "accessory");

    fillSelect("hair", catalog.hair);
    fillSelect("beard", catalog.beards);

    document.querySelectorAll(".tab").forEach(button => {
      button.onclick = () => {
        document.querySelectorAll(".tab, .pane")
          .forEach(element => element.classList.remove("active"));

        button.classList.add("active");

        const pane = $("#" + button.dataset.tab);
        if (pane) pane.classList.add("active");
      };
    });

    loadSaved();
  } catch (error) {
    console.error(error);
    if ($("#connection")) {
      $("#connection").textContent = "Karakter kataloğu yüklenemedi.";
    }
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
    const data = JSON.parse(
      localStorage.getItem("exland_character")
    );

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

      const buttons = $("#" + id)?.querySelectorAll(".item");
      if (!buttons) return;

      buttons.forEach((button, i) => {
        button.classList.toggle("selected", i === index);
      });
    });
  } catch (error) {
    console.warn("Karakter kaydı okunamadı:", error);
  }
}

if ($("#random")) {
  $("#random").onclick = () => {
    if (!catalog) return;

    Object.keys(choice).forEach(key => {
      const items = catalog[
        key === "accessory" ? "accessories" : key
      ];

      choice[key] = Math.floor(Math.random() * items.length);

      const id = key === "accessory" ? "accessories" : key;

      $("#" + id)?.querySelectorAll(".item").forEach((button, i) => {
        button.classList.toggle("selected", i === choice[key]);
      });
    });

    save();
  };
}

if ($("#save")) {
  $("#save").onclick = () => {
    save();

    if ($("#creator")) $("#creator").hidden = true;
    if ($("#lobby")) $("#lobby").hidden = false;
  };
}

if ($("#connect")) {
  $("#connect").onclick = () => {
    const name = $("#playerName")?.value.trim();

    if (!name) {
      $("#connection").textContent = "Önce oyuncu adı gir.";
      return;
    }

    if (socket && socket.readyState !== WebSocket.CLOSED) {
      $("#connection").textContent = "Zaten bağlantı kuruluyor veya açık.";
      return;
    }

    $("#connection").textContent = "Sunucuya bağlanılıyor...";

    socket = new WebSocket(SERVER_URL);

    socket.onopen = () => {
      socket.send(JSON.stringify({
        type: "join",
        name
      }));

      window.ExlandGame?.start(socket);
    };

    socket.onmessage = event => {
      let message;

      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      if (message.type === "welcome") {
        $("#connection").textContent =
          "Bağlandı: " + message.you.name;
      } else if (message.type === "error") {
        $("#connection").textContent = message.message;
      }
    };

    socket.onerror = () => {
      $("#connection").textContent = "Bağlantı hatası.";
    };

    socket.onclose = () => {
      $("#connection").textContent = "Bağlantı kapandı.";
    };
  };
}

if ($("#fire")) {
  $("#fire").onclick = () => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "shoot" }));
    }

    if ($("#gameScene")) $("#gameScene").textContent = "ATEŞ!";
  };
}

if ($("#reload")) {
  $("#reload").onclick = () => {
    $("#reload").textContent = "ŞARJÖR DOLDURULUYOR…";

    setTimeout(() => {
      $("#reload").textContent = "ŞARJÖR ↻";
    }, 1000);
  };
}

if ($("#crouch")) {
  $("#crouch").onclick = () => {
    $("#crouch").classList.toggle("muted");
  };
}

if ($("#door")) {
  $("#door").onclick = () => {
    if ($("#gameScene")) {
      $("#gameScene").textContent = "KAPI AÇILDI";

      setTimeout(() => {
        $("#gameScene").textContent = "OYUN ALANI";
      }, 900);
    }
  };
}

if ($("#mic")) {
  $("#mic").onclick = async () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
      $("#mic").textContent = "🎙 MİKROFON KAPALI";
      return;
    }

    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });

      $("#mic").textContent = "🎙 MİKROFON AÇIK";
    } catch {
      $("#connection").textContent =
        "Mikrofon izni verilmedi veya HTTPS gerekli.";
    }
  };
}

if ($("#speaker")) {
  $("#speaker").onclick = () => {
    muted = !muted;

    document.querySelectorAll("audio.remote-voice").forEach(audio => {
      audio.muted = muted;
    });

    $("#speaker").textContent = muted
      ? "🔇 SES KAPALI"
      : "🔊 SES AÇIK";

    $("#speaker").classList.toggle("muted", muted);
  };
}

init();
