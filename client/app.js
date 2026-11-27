
const catalogUrl = "assets/catalog/cosmetics.json";

let catalog;
let choice = {
  outfit: 0,
  pants: 0,
  headwear: 0,
  accessory: 0
};

let socket = null;
let localStream = null;
let muted = false;

const $ = s => document.querySelector(s);

const SERVER_URL = "wss://exland-server-production.up.railway.app";

async function init() {
  catalog = await fetch(catalogUrl).then(r => r.json());

  fill("outfits", catalog.outfits, "outfit");
  fill("pants", catalog.pants, "pants");
  fill("headwear", catalog.headwear, "headwear");
  fill("accessories", catalog.accessories, "accessory");

  fillSelect("hair", catalog.hair);
  fillSelect("beard", catalog.beards);

  document.querySelectorAll(".tab").forEach(b => {
    b.onclick = () => {
      document.querySelectorAll(".tab, .pane")
        .forEach(x => x.classList.remove("active"));

      b.classList.add("active");
      $("#" + b.dataset.tab).classList.add("active");
    };
  });

  loadSaved();
}

function fill(id, arr, key) {
  const root = $("#" + id);

  arr.forEach((name, i) => {
    const d = document.createElement("button");

    d.className = "item" + (i === 0 ? " selected" : "");
    d.innerHTML = name + "<small>ÜCRETSİZ</small>";

    d.onclick = () => {
      choice[key] = i;

      root.querySelectorAll(".item")
        .forEach(x => x.classList.remove("selected"));

      d.classList.add("selected");
      save();
    };

    root.append(d);
  });
}

function fillSelect(id, arr) {
  const s = $("#" + id);

  arr.forEach(v => {
    let o = document.createElement("option");
    o.textContent = v;
    s.append(o);
  });

  s.onchange = save;
}

function save() {
  let data = {
    gender: $("#gender").value,
    hair: $("#hair").value,
    beard: $("#beard").value,
    outfit: catalog.outfits[choice.outfit],
    pants: catalog.pants[choice.pants],
    headwear: catalog.headwear[choice.headwear],
    accessory: catalog.accessories[choice.accessory]
  };

  localStorage.setItem(
    "exland_character",
    JSON.stringify(data)
  );
}

function loadSaved() {
  try {
    let d = JSON.parse(
      localStorage.getItem("exland_character")
    );

    if (!d) return;

    ["gender", "hair", "beard"].forEach(k => {
      if (d[k]) $("#" + k).value = d[k];
    });

    [
      ["outfit", "outfits"],
      ["pants", "pants"],
      ["headwear", "headwear"],
      ["accessory", "accessories"]
    ].forEach(([k, id]) => {
      let arr = catalog[
        k === "headwear" ? "headwear" :
        k === "accessory" ? "accessories" : k
      ];

      let i = arr.indexOf(d[k]);

      if (i >= 0) {
        choice[k] = i;

        $("#"+id).children[i].classList.add("selected");
        $("#"+id).children[0].classList.remove("selected");
      }
    });
  } catch (e) {
    console.error("Karakter yüklenemedi:", e);
  }
}

// Rastgele karakter
$("#random").onclick = () => {
  Object.keys(choice).forEach(k => {
    let arr = catalog[
      k === "accessory" ? "accessories" : k
    ];

    choice[k] = Math.floor(Math.random() * arr.length);

    let id = k === "accessory" ? "accessories" : k;

    $("#" + id).querySelectorAll(".item")
      .forEach((x, i) => {
        x.classList.toggle("selected", i === choice[k]);
      });
  });

  save();
};

// Karakteri kaydet
$("#save").onclick = () => {
  save();

  $("#creator").hidden = true;
  $("#lobby").hidden = false;
};

// Railway sunucusuna bağlan
$("#connect").onclick = () => {
  let name = $("#playerName").value.trim();

  if (!name) {
    $("#connection").textContent = "Önce oyuncu adı gir.";
    return;
  }

  if (socket && socket.readyState === WebSocket.OPEN) {
    $("#connection").textContent = "Zaten bağlısın.";
    return;
  }

  $("#connection").textContent = "EXLAND sunucusuna bağlanılıyor...";

  socket = new WebSocket(SERVER_URL);

  socket.onopen = () => {
    socket.send(JSON.stringify({
      type: "join",
      name
    }));
  };

  socket.onmessage = e => {
    let m = JSON.parse(e.data);

    $("#connection").textContent =
      m.type === "welcome"
        ? "Bağlandı: " + m.you.name
        : m.message || m.type;
  };

  socket.onerror = () => {
    $("#connection").textContent = "Sunucu bağlantı hatası.";
  };

  socket.onclose = () => {
    $("#connection").textContent = "Sunucu bağlantısı kapandı.";
  };
};

// Ateş et
$("#fire").onclick = () => {
  $("#gameScene").textContent = "ATEŞ!";

  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: "shoot"
    }));
  }
};

// Şarjör doldur
$("#reload").onclick = () => {
  $("#reload").textContent = "ŞARJÖR DOLDURULUYOR…";

  setTimeout(() => {
    $("#reload").textContent = "ŞARJÖR ↻";
  }, 1000);
};

// Eğil
$("#crouch").onclick = () => {
  $("#gameScene").classList.toggle("muted");
  $("#crouch").classList.toggle("muted");
};

// Kapı
$("#door").onclick = () => {
  $("#gameScene").textContent = "KAPI AÇILDI";

  setTimeout(() => {
    $("#gameScene").textContent = "OYUN ALANI";
  }, 900);
};

// Mikrofon
$("#mic").onclick = async () => {
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;

    $("#mic").textContent = "🎙 MİKROFON KAPALI";
    return;
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true
    });

    $("#mic").textContent = "🎙 MİKROFON AÇIK";
  } catch (e) {
    $("#connection").textContent =
      "Mikrofon izni verilmedi veya HTTPS gerekli.";
  }
};

// Hoparlör
$("#speaker").onclick = () => {
  muted = !muted;

  document.querySelectorAll("audio.remote-voice")
    .forEach(a => a.muted = muted);

  $("#speaker").textContent = muted
    ? "🔇 SES KAPALI"
    : "🔊 SES AÇIK";

  $("#speaker").classList.toggle("muted", muted);
};

init();
