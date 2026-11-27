
(() => {
  "use strict";

  const game = {
    socket: null,
    scene: null,
    camera: null,
    renderer: null,
    player: null,
    players: new Map(),
    keys: {},
    running: false,
    x: 0,
    z: 0,
    speed: 0.16,
    cameraAngle: 0,
    cameraDistance: 7,
    lastSend: 0
  };

  function createPlayer(color = 0x22c55e) {
    const group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1.1, 0.45),
      new THREE.MeshStandardMaterial({ color })
    );
    body.position.y = 1.05;
    group.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 20, 20),
      new THREE.MeshStandardMaterial({ color: 0xffd2a6 })
    );
    head.position.y = 1.85;
    group.add(head);

    const legs = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.65, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x1e293b })
    );
    legs.position.y = 0.35;
    group.add(legs);

    return group;
  }

  function createWorld() {
    game.scene = new THREE.Scene();
    game.scene.background = new THREE.Color(0x101827);
    game.scene.fog = new THREE.Fog(0x101827, 25, 100);

    game.camera = new THREE.PerspectiveCamera(
      70, 1, 0.1, 500
    );

    game.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance"
    });

    game.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, 1.5)
    );

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

    const sceneElement = document.querySelector("#gameScene");

    if (sceneElement) {
      sceneElement.insertAdjacentElement("afterend", container);
    } else {
      document.body.appendChild(container);
    }

    container.appendChild(game.renderer.domElement);

    game.renderer.domElement.style.cssText =
      "width:100%;height:100%;display:block;";

    const ambient = new THREE.HemisphereLight(
      0xffffff, 0x334155, 2
    );
    game.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(10, 20, 10);
    game.scene.add(sun);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({
        color: 0x263449,
        roughness: 0.9
      })
    );

    floor.rotation.x = -Math.PI / 2;
    game.scene.add(floor);

    const grid = new THREE.GridHelper(
      200, 100, 0x64748b, 0x334155
    );
    grid.position.y = 0.015;
    game.scene.add(grid);

    game.player = createPlayer();
    game.scene.add(game.player);

    updateCamera();
    setupCameraControls(container);

    window.addEventListener("resize", resize);
  }

  function updateCamera() {
    if (!game.camera || !game.player) return;

    const angle = game.cameraAngle;
    const distance = game.cameraDistance;

    game.camera.position.set(
      game.player.position.x - Math.sin(angle) * distance,
      4,
      game.player.position.z - Math.cos(angle) * distance
    );

    game.camera.lookAt(
      game.player.position.x,
      1.1,
      game.player.position.z
    );
  }

  function setupCameraControls(container) {
    let dragging = false;
    let previousX = 0;

    container.addEventListener("pointerdown", event => {
      dragging = true;
      previousX = event.clientX;
      container.setPointerCapture(event.pointerId);
    });

    container.addEventListener("pointermove", event => {
      if (!dragging) return;

      game.cameraAngle -=
        (event.clientX - previousX) * 0.006;

      previousX = event.clientX;
    });

    container.addEventListener("pointerup", () => {
      dragging = false;
    });

    container.addEventListener("pointercancel", () => {
      dragging = false;
    });

    container.addEventListener("wheel", event => {
      game.cameraDistance += event.deltaY * 0.005;
      game.cameraDistance = Math.max(
        3, Math.min(15, game.cameraDistance)
      );
    }, { passive: true });
  }

  function connect(socket) {
    game.socket = socket;

    socket.addEventListener("message", event => {
      let data;

      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.type === "playerList") {
        const names = new Set();

        for (const p of data.players || []) {
          names.add(p.name);
          updateRemotePlayer(p.name, p.x, p.y);
        }

        for (const [name, object] of game.players) {
          if (!names.has(name)) {
            game.scene.remove(object);
            game.players.delete(name);
          }
        }
      }

      if (data.type === "playerMoved") {
        updateRemotePlayer(data.name, data.x, data.y);
      }

      if (data.type === "playerLeft") {
        const object = game.players.get(data.name);

        if (object) {
          game.scene.remove(object);
          game.players.delete(data.name);
        }
      }
    });
  }

  function updateRemotePlayer(name, x, z) {
    if (!game.scene || !name) return;

    let object = game.players.get(name);

    if (!object) {
      object = createPlayer(0xef4444);
      game.scene.add(object);
      game.players.set(name, object);
    }

    object.position.set(
      Number(x) || 0,
      0,
      Number(z) || 0
    );
  }

  function sendPosition() {
    if (
      !game.socket ||
      game.socket.readyState !== WebSocket.OPEN
    ) return;

    game.socket.send(JSON.stringify({
      type: "move",
      x: game.x,
      y: game.z,
      z: 0
    }));
  }

  function setupKeyboard() {
    window.addEventListener("keydown", event => {
      const key = event.key.toLowerCase();

      if ([
        "w", "a", "s", "d",
        "arrowup", "arrowdown",
        "arrowleft", "arrowright"
      ].includes(key)) {
        event.preventDefault();
        game.keys[key] = true;
      }
    });

    window.addEventListener("keyup", event => {
      game.keys[event.key.toLowerCase()] = false;
    });

    window.addEventListener("blur", () => {
      game.keys = {};
    });
  }

  function update() {
    if (!game.running) return;

    if (game.keys.w || game.keys.arrowup) game.z -= game.speed;
    if (game.keys.s || game.keys.arrowdown) game.z += game.speed;
    if (game.keys.a || game.keys.arrowleft) game.x -= game.speed;
    if (game.keys.d || game.keys.arrowright) game.x += game.speed;

    game.x = Math.max(-90, Math.min(90, game.x));
    game.z = Math.max(-90, Math.min(90, game.z));

    game.player.position.set(game.x, 0, game.z);

    const now = performance.now();

    if (now - game.lastSend > 50) {
      sendPosition();
      game.lastSend = now;
    }

    updateCamera();
    game.renderer.render(game.scene, game.camera);

    requestAnimationFrame(update);
  }

  function resize() {
    const container = document.querySelector("#exland3D");
    if (!container || !game.camera) return;

    game.camera.aspect =
      container.clientWidth / container.clientHeight;

    game.camera.updateProjectionMatrix();

    game.renderer.setSize(
      container.clientWidth,
      container.clientHeight
    );
  }

  function start(socket) {
    if (game.running || !window.THREE) return;

    createWorld();

    if (socket) connect(socket);

    setupKeyboard();

    game.running = true;
    update();
  }

  window.ExlandGame = { start, connect };
})();
