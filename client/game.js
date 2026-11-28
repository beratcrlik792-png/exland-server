
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

(() => {
  "use strict";

  const loader = new GLTFLoader();

  const MODEL_PATH = "./assets/models/characters/";
  const ANIMATION_PATH = "./assets/models/animations/";

  const MODELS = {
    male: "Military_Male_04.glb",
    female: "Military_Female_02.glb"
  };

  const ANIMATION_FILES = {
    walk: "walk.glb",
    jog: "jog.glb",
    crouch: "crouch-walk.glb",
    knockback: "knockback.glb"
  };

  const game = {
    socket: null,

    scene: null,
    camera: null,
    renderer: null,

    player: null,
    players: new Map(),

    keys: {},

    running: false,
    started: false,

    x: 0,
    z: 0,

    speed: 0.16,
    cameraAngle: 0,
    cameraDistance: 7,

    lastSend: 0,

    clock: new THREE.Clock(),

    clips: {},
    crouching: false,

    localGender: "male"
  };

  // --------------------------------------------------
  // GLB YÜKLEME
  // --------------------------------------------------

  function loadGLB(path) {
    return new Promise((resolve, reject) => {
      loader.load(
        path,
        resolve,
        undefined,
        reject
      );
    });
  }

  // --------------------------------------------------
  // HARİCİ ANİMASYONLARI YÜKLE
  // --------------------------------------------------

  async function loadAnimations() {
    for (const [name, file] of Object.entries(ANIMATION_FILES)) {
      try {
        const gltf = await loadGLB(
          ANIMATION_PATH + file
        );

        if (gltf.animations && gltf.animations.length > 0) {
          const clip = gltf.animations[0].clone();

          clip.name = name;

          game.clips[name] = clip;

          console.log(
            "[EXLAND] Animasyon yüklendi:",
            name
          );
        } else {
          console.warn(
            "[EXLAND] Animasyon bulunamadı:",
            file
          );
        }

      } catch (error) {
        console.error(
          "[EXLAND] Animasyon yüklenemedi:",
          file,
          error
        );
      }
    }
  }

  // --------------------------------------------------
  // KARAKTER MODELİ
  // --------------------------------------------------

  function loadModel(gender) {
    const file = MODELS[gender] || MODELS.male;

    return loadGLB(MODEL_PATH + file);
  }

  function normalizeModel(model) {
    const box = new THREE.Box3().setFromObject(model);

    const size = box.getSize(new THREE.Vector3());

    if (size.y > 0) {
      const scale = 1.8 / size.y;

      model.scale.setScalar(scale);
    }

    const scaledBox = new THREE.Box3().setFromObject(model);

    const center = scaledBox.getCenter(
      new THREE.Vector3()
    );

    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= scaledBox.min.y;
  }

  // --------------------------------------------------
  // YEDEK KARAKTER
  // --------------------------------------------------

  function createFallbackPlayer(color) {
    const group = new THREE.Group();

    const material = new THREE.MeshStandardMaterial({
      color: color
    });

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1.1, 0.45),
      material
    );

    body.position.y = 1.05;
    body.castShadow = true;

    group.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 20, 20),
      new THREE.MeshStandardMaterial({
        color: 0xffd2a6
      })
    );

    head.position.y = 1.85;
    head.castShadow = true;

    group.add(head);

    const legs = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.65, 0.4),
      new THREE.MeshStandardMaterial({
        color: 0x1e293b
      })
    );

    legs.position.y = 0.35;
    legs.castShadow = true;

    group.add(legs);

    group.userData.mixer = null;
    group.userData.actions = {};
    group.userData.currentAction = null;

    return group;
  }

  // --------------------------------------------------
  // KARAKTER ANİMASYONLARINI HAZIRLA
  // --------------------------------------------------

  async function createAnimatedPlayer(
    gender = "male",
    color = 0xffffff
  ) {
    try {
      const gltf = await loadModel(gender);

      const model = gltf.scene;

      normalizeModel(model);

      model.traverse(object => {
        if (object.isMesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });

      const wrapper = new THREE.Group();

      wrapper.add(model);

      const mixer = new THREE.AnimationMixer(model);

      const actions = {};

      // Karakterin kendi animasyonları

      for (const clip of gltf.animations || []) {
        const key = clip.name.toLowerCase();

        actions[key] = mixer.clipAction(clip);

        // Boş duruş
        if (
          /idle|stand|breath|wait|rest/.test(key)
        ) {
          if (!actions.idle) {
            actions.idle = actions[key];
          }
        }

        // Yürüme
        if (
          /walk/.test(key) &&
          !/crouch/.test(key)
        ) {
          if (!actions.walk) {
            actions.walk = actions[key];
          }
        }

        // Koşma
        if (
          /run|jog|sprint/.test(key)
        ) {
          if (!actions.jog) {
            actions.jog = actions[key];
          }
        }

        // Çömelme
        if (/crouch/.test(key)) {
          if (!actions.crouch) {
            actions.crouch = actions[key];
          }
        }

        // Darbe
        if (
          /hit|damage|knockback|hurt/.test(key)
        ) {
          if (!actions.knockback) {
            actions.knockback = actions[key];
          }
        }
      }

      // Harici GLB animasyonları

      for (const [name, clip] of Object.entries(game.clips)) {
        actions[name] = mixer.clipAction(clip);
      }

      wrapper.userData.mixer = mixer;
      wrapper.userData.actions = actions;
      wrapper.userData.currentAction = null;

      // İlk boş duruş animasyonu

      if (actions.idle) {
        actions.idle.play();

        wrapper.userData.currentAction = actions.idle;
      }

      console.log(
        "[EXLAND] Karakter yüklendi:",
        gender
      );

      console.log(
        "[EXLAND] Karakter animasyonları:",
        Object.keys(actions)
      );

      return wrapper;

    } catch (error) {
      console.error(
        "[EXLAND] Karakter yüklenemedi:",
        error
      );

      return createFallbackPlayer(color);
    }
  }

  // --------------------------------------------------
  // ANİMASYON OYNAT
  // --------------------------------------------------

  function playAnimation(
    player,
    name,
    fade = 0.18
  ) {
    if (!player) return;

    const actions = player.userData.actions || {};

    const next = actions[name];

    if (!next) return;

    const current = player.userData.currentAction;

    if (
      current === next &&
      next.isRunning()
    ) {
      return;
    }

    next.reset();

    next.enabled = true;

    if (name === "knockback") {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = false;
    }

    next.fadeIn(fade).play();

    if (current && current !== next) {
      current.fadeOut(fade);
    }

    player.userData.currentAction = next;
  }

  // --------------------------------------------------
  // DÜNYAYI OLUŞTUR
  // --------------------------------------------------

  function createWorld() {
    game.scene = new THREE.Scene();

    game.scene.background = new THREE.Color(0x101827);

    game.scene.fog = new THREE.Fog(
      0x101827,
      25,
      100
    );

    game.camera = new THREE.PerspectiveCamera(
      70,
      1,
      0.1,
      500
    );

    game.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance"
    });

    game.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, 1.5)
    );

    game.renderer.shadowMap.enabled = true;

    game.renderer.shadowMap.type =
      THREE.PCFSoftShadowMap;

    const container = document.createElement("div");

    container.id = "exland3D";

    container.style.cssText = `
      position:relative;
      width:100%;
      height:70vh;
      min-height:350px;
      overflow:hidden;
      background:#101827;
      border-radius:12px;
      margin-top:12px;
      touch-action:none;
    `;

    const sceneElement =
      document.querySelector("#gameScene");

    if (sceneElement) {
      sceneElement.insertAdjacentElement(
        "afterend",
        container
      );
    } else {
      document.body.appendChild(container);
    }

    container.appendChild(
      game.renderer.domElement
    );

    game.renderer.domElement.style.cssText = `
      width:100%;
      height:100%;
      display:block;
    `;

    // Işık

    const ambient = new THREE.HemisphereLight(
      0xffffff,
      0x334155,
      2
    );

    game.scene.add(ambient);

    const sun = new THREE.DirectionalLight(
      0xffffff,
      2
    );

    sun.position.set(10, 20, 10);

    sun.castShadow = true;

    game.scene.add(sun);

    // Zemin

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({
        color: 0x263449,
        roughness: 0.9
      })
    );

    floor.rotation.x = -Math.PI / 2;

    floor.receiveShadow = true;

    game.scene.add(floor);

    // Izgara

    const grid = new THREE.GridHelper(
      200,
      100,
      0x64748b,
      0x334155
    );

    grid.position.y = 0.015;

    game.scene.add(grid);

    // Geçici oyuncu

    game.player = createFallbackPlayer(
      0x22c55e
    );

    game.scene.add(game.player);

    // Kamera

    setupCameraControls(container);

    updateCamera();

    resize();

    window.addEventListener(
      "resize",
      resize
    );

    // Seçilen karakter cinsiyeti

    try {
      const saved = JSON.parse(
        localStorage.getItem("exland_character") || "null"
      );

      game.localGender =
        saved?.gender === "female"
          ? "female"
          : "male";

    } catch {
      game.localGender = "male";
    }

    // Gerçek oyuncu modelini yükle

    createAnimatedPlayer(
      game.localGender,
      0x22c55e
    ).then(model => {
      if (!game.running) return;

      const old = game.player;

      model.position.set(
        game.x,
        0,
        game.z
      );

      game.scene.remove(old);

      game.scene.add(model);

      game.player = model;

      updateCamera();
    });
  }

  // --------------------------------------------------
  // KAMERA KONTROLLERİ
  // --------------------------------------------------

  function setupCameraControls(container) {
    let dragging = false;

    let previousX = 0;

    container.addEventListener(
      "pointerdown",
      event => {
        dragging = true;

        previousX = event.clientX;

        container.setPointerCapture(
          event.pointerId
        );
      }
    );

    container.addEventListener(
      "pointermove",
      event => {
        if (!dragging) return;

        game.cameraAngle -=
          (event.clientX - previousX) * 0.006;

        previousX = event.clientX;
      }
    );

    container.addEventListener(
      "pointerup",
      () => {
        dragging = false;
      }
    );

    container.addEventListener(
      "pointercancel",
      () => {
        dragging = false;
      }
    );

    container.addEventListener(
      "wheel",
      event => {
        game.cameraDistance =
          THREE.MathUtils.clamp(
            game.cameraDistance +
              event.deltaY * 0.005,
            3,
            15
          );
      },
      { passive: true }
    );
  }

  function updateCamera() {
    if (!game.camera || !game.player) return;

    const angle = game.cameraAngle;

    const distance = game.cameraDistance;

    game.camera.position.set(
      game.player.position.x -
        Math.sin(angle) * distance,

      4,

      game.player.position.z -
        Math.cos(angle) * distance
    );

    game.camera.lookAt(
      game.player.position.x,
      1.1,
      game.player.position.z
    );
  }

  // --------------------------------------------------
  // DİĞER OYUNCULAR
  // --------------------------------------------------

  function updateRemotePlayer(name, x, z) {
    if (!game.scene || !name) return;

    let object = game.players.get(name);

    if (!object) {
      object = createFallbackPlayer(
        0xef4444
      );

      game.players.set(name, object);

      game.scene.add(object);

      createAnimatedPlayer(
        "male",
        0xef4444
      ).then(model => {
        if (!game.players.has(name)) return;

        const old = game.players.get(name);

        model.position.copy(old.position);

        game.scene.remove(old);

        game.scene.add(model);

        game.players.set(name, model);
      });
    }

    object.position.set(
      Number(x) || 0,
      0,
      Number(z) || 0
    );
  }

  // --------------------------------------------------
  // SUNUCU BAĞLANTISI
  // --------------------------------------------------

  function connect(socket) {
    game.socket = socket;

    socket.addEventListener(
      "message",
      event => {
        let data;

        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }

        // Oyuncu listesi

        if (data.type === "playerList") {
          const names = new Set();

          for (const player of data.players || []) {
            names.add(player.name);

            updateRemotePlayer(
              player.name,
              player.x,
              player.y
            );
          }

          for (const [name, object] of game.players) {
            if (!names.has(name)) {
              game.scene.remove(object);

              game.players.delete(name);
            }
          }
        }

        // Oyuncu hareketi

        if (data.type === "playerMoved") {
          updateRemotePlayer(
            data.name,
            data.x,
            data.y
          );
        }

        // Oyuncu ayrıldı

        if (data.type === "playerLeft") {
          const object = game.players.get(
            data.name
          );

          if (object) {
            game.scene.remove(object);
          }

          game.players.delete(data.name);
        }

        // Darbe alındı

        if (
          data.type === "damage" ||
          data.type === "playerDamaged"
        ) {
          playAnimation(
            game.player,
            "knockback"
          );
        }
      }
    );
  }

  // --------------------------------------------------
  // HAREKETİ SUNUCUYA GÖNDER
  // --------------------------------------------------

  function sendPosition() {
    if (
      !game.socket ||
      game.socket.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    game.socket.send(
      JSON.stringify({
        type: "move",
        x: game.x,
        y: game.z,
        z: 0
      })
    );
  }

  // --------------------------------------------------
  // KLAVYE VE ÇÖMELME
  // --------------------------------------------------

  function setupKeyboard() {
    window.addEventListener(
      "keydown",
      event => {
        const key = event.key.toLowerCase();

        const movementKeys = [
          "w",
          "a",
          "s",
          "d",
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
          "shift"
        ];

        if (movementKeys.includes(key)) {
          event.preventDefault();

          game.keys[key] = true;
        }
      }
    );

    window.addEventListener(
      "keyup",
      event => {
        game.keys[
          event.key.toLowerCase()
        ] = false;
      }
    );

    window.addEventListener(
      "blur",
      () => {
        game.keys = {};
      }
    );

    // Çömelme butonu

    const crouchButton =
      document.querySelector("#crouch");

    crouchButton?.addEventListener(
      "click",
      () => {
        game.crouching = !game.crouching;

        crouchButton.classList.toggle(
          "muted",
          game.crouching
        );
      }
    );
  }

  // --------------------------------------------------
  // ANA OYUN DÖNGÜSÜ
  // --------------------------------------------------

  function update() {
    if (!game.running) return;

    const moving =
      game.keys.w ||
      game.keys.a ||
      game.keys.s ||
      game.keys.d ||
      game.keys.arrowup ||
      game.keys.arrowdown ||
      game.keys.arrowleft ||
      game.keys.arrowright;

    const sprinting = game.keys.shift;

    let speed = game.speed;

    if (game.crouching) {
      speed *= 0.5;
    } else if (sprinting) {
      speed *= 1.7;
    }

    // Hareket

    if (
      game.keys.w ||
      game.keys.arrowup
    ) {
      game.z -= speed;
    }

    if (
      game.keys.s ||
      game.keys.arrowdown
    ) {
      game.z += speed;
    }

    if (
      game.keys.a ||
      game.keys.arrowleft
    ) {
      game.x -= speed;
    }

    if (
      game.keys.d ||
      game.keys.arrowright
    ) {
      game.x += speed;
    }

    game.x = THREE.MathUtils.clamp(
      game.x,
      -90,
      90
    );

    game.z = THREE.MathUtils.clamp(
      game.z,
      -90,
      90
    );

    // Animasyon ve zaman

    const delta = game.clock.getDelta();

    if (game.player) {
      game.player.position.set(
        game.x,
        0,
        game.z
      );

      if (moving) {
        let animation;

        if (game.crouching) {
          animation = "crouch";
        } else if (sprinting) {
          animation = "jog";
        } else {
          animation = "walk";
        }

        playAnimation(
          game.player,
          animation
        );

      } else {
        playAnimation(
          game.player,
          "idle"
        );
      }

      game.player.userData.mixer?.update(
        delta
      );
    }

    // Diğer oyuncuların animasyonları

    for (const player of game.players.values()) {
      player.userData.mixer?.update(delta);
    }

    // Sunucuya konum gönder

    const now = performance.now();

    if (now - game.lastSend > 50) {
      sendPosition();

      game.lastSend = now;
    }

    // Kamerayı güncelle

    updateCamera();

    // Görüntüyü çiz

    game.renderer.render(
      game.scene,
      game.camera
    );

    requestAnimationFrame(update);
  }

  // --------------------------------------------------
  // EKRAN BOYUTU
  // --------------------------------------------------

  function resize() {
    const container =
      document.querySelector("#exland3D");

    if (
      !container ||
      !game.camera ||
      !game.renderer
    ) {
      return;
    }

    game.camera.aspect =
      container.clientWidth /
      container.clientHeight;

    game.camera.updateProjectionMatrix();

    game.renderer.setSize(
      container.clientWidth,
      container.clientHeight
    );
  }

  // --------------------------------------------------
  // DARBE ANİMASYONU DIŞARIDAN ÇAĞIRMA
  // --------------------------------------------------

  function playHitAnimation() {
    playAnimation(
      game.player,
      "knockback"
    );
  }

  // --------------------------------------------------
  // OYUNU BAŞLAT
  // --------------------------------------------------

  async function start(socket) {
    if (game.started) {
      if (socket) {
        connect(socket);
      }

      return;
    }

    game.started = true;

    console.log(
      "[EXLAND] Animasyonlar yükleniyor..."
    );

    await loadAnimations();

    console.log(
      "[EXLAND] Dünya oluşturuluyor..."
    );

    createWorld();

    if (socket) {
      connect(socket);
    }

    setupKeyboard();

    game.running = true;

    game.clock.start();

    update();

    console.log(
      "[EXLAND] Oyun başlatıldı!"
    );
  }

  // --------------------------------------------------
  // GLOBAL API
  // --------------------------------------------------

  window.ExlandGame = {
    start,
    connect,
    playAnimation,
    playHitAnimation
  };

  window.THREE = THREE;

})();
