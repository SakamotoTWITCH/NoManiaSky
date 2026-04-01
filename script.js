(() => {
  const PLAYROOM = window.Playroom || null;
  const CONFIG = window.NO_MANIA_SKY_CONFIG || {};

  const canvas = document.getElementById("game");
  const statusLine = document.getElementById("statusLine");
  const pilotValue = document.getElementById("pilotValue");
  const networkValue = document.getElementById("networkValue");
  const roomValue = document.getElementById("roomValue");
  const playersValue = document.getElementById("playersValue");
  const healthValue = document.getElementById("healthValue");
  const healthBarFill = document.getElementById("healthBarFill");
  const scoreValue = document.getElementById("scoreValue");
  const controlsText = document.getElementById("controlsText");
  const inviteValue = document.getElementById("inviteValue");
  const hintText = document.getElementById("hintText");
  const scoreboard = document.getElementById("scoreboard");
  const centerNotice = document.getElementById("centerNotice");
  const copyInviteButton = document.getElementById("copyInviteButton");

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance"
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050814);
  scene.fog = new THREE.FogExp2(0x050814, 0.0);

  const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 12000);
  const clock = new THREE.Clock();

  const WORLD_UP = new THREE.Vector3(0, 1, 0);
  const FORWARD = new THREE.Vector3(0, 0, -1);
  const RIGHT = new THREE.Vector3(1, 0, 0);
  const UP = new THREE.Vector3(0, 1, 0);
  const ORIGIN = new THREE.Vector3(0, 0, 0);

  const tempVecA = new THREE.Vector3();
  const tempVecB = new THREE.Vector3();
  const tempVecC = new THREE.Vector3();
  const tempVecD = new THREE.Vector3();
  const tempEuler = new THREE.Euler(0, 0, 0, "YXZ");
  const tempQuat = new THREE.Quaternion();
  const tempColor = new THREE.Color();

  const MATCH_KEY = "match";
  const MAX_HEALTH = 100;
  const FIRE_INTERVAL = 170;
  const SHOT_DAMAGE = 28;
  const SHOT_SPEED = 260;
  const SHOT_LIFETIME = 2.2;
  const SHIP_HIT_RADIUS = 5.4;
  const SHIP_BASE_SPEED = 78;
  const SHIP_BOOST_SPEED = 138;
  const SHIP_RESPONSE = 4.2;
  const SHIP_DRAG = 1.9;
  const PLAYER_SEND_INTERVAL = 0.07;
  const MATCH_SEND_INTERVAL = 0.05;
  const RESPAWN_DELAY = 5;
  const BATTLEFIELD_RADIUS = 2600;
  const MAX_PLAYERS = Math.max(2, CONFIG.maxPlayersPerRoom || 4);
  const RECONNECT_GRACE_PERIOD = CONFIG.reconnectGracePeriodMs || 15000;
  const PLAYROOM_GAME_ID = typeof CONFIG.playroomGameId === "string" ? CONFIG.playroomGameId.trim() : "";
  const ONLINE_READY = Boolean(PLAYROOM && PLAYROOM_GAME_ID);

  const game = {
    started: false,
    pointerLocked: false,
    keys: Object.create(null),
    mouseDown: false,
    justPressed: new Set(),
    planets: [],
    players: new Map(),
    playerOrder: [],
    remoteShotsProcessed: new Map(),
    localTrails: [],
    explosions: [],
    bulletVisuals: new Map(),
    matchSnapshot: createEmptyMatch(),
    seenEffects: new Set(),
    localPlayerId: null,
    localSendTimer: 0,
    hudTimer: 0,
    roomCode: "",
    inviteBaseUrl: getBaseInviteUrl(),
    offlineReason: "",
    networkState: ONLINE_READY ? "connecting" : "offline",
    hostRuntime: {
      initialized: false,
      activeHostId: "",
      match: createEmptyMatch(),
      bullets: new Map(),
      effects: [],
      processedShotSeq: new Map(),
      effectSerial: 0,
      matchTimer: 0
    }
  };

  setupScene();
  bindEvents();
  onResize();
  initGame();
  animate();

  function createEmptyMatch() {
    return {
      revision: 0,
      generatedAt: 0,
      hostId: "",
      combatants: {},
      bullets: [],
      effects: []
    };
  }

  function setupScene() {
    const hemi = new THREE.HemisphereLight(0xa6c3ff, 0x2d1f14, 0.95);
    scene.add(hemi);

    const sunLight = new THREE.DirectionalLight(0xfff0cb, 1.45);
    sunLight.position.set(-1200, 900, -1400);
    scene.add(sunLight);

    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(74, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xffe8a6, toneMapped: false })
    );
    sun.position.set(-1800, 1200, -2600);
    scene.add(sun);

    const starGeometry = new THREE.BufferGeometry();
    const starCount = 2400;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i += 1) {
      let x = THREE.MathUtils.randFloatSpread(6400);
      let y = THREE.MathUtils.randFloatSpread(6400);
      let z = THREE.MathUtils.randFloatSpread(6400);
      const length = Math.sqrt((x * x) + (y * y) + (z * z)) || 1;
      const scale = 3000 / length;
      x *= scale;
      y *= scale;
      z *= scale;

      positions[(i * 3) + 0] = x;
      positions[(i * 3) + 1] = y;
      positions[(i * 3) + 2] = z;

      const tint = 0.82 + (Math.random() * 0.18);
      colors[(i * 3) + 0] = tint;
      colors[(i * 3) + 1] = tint * (0.94 + (Math.random() * 0.1));
      colors[(i * 3) + 2] = 1;
    }

    starGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    starGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const stars = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({
        size: 5,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        toneMapped: false
      })
    );
    stars.name = "stars";
    stars.frustumCulled = false;
    scene.add(stars);

    game.planets = createPlanets();
  }

  function createPlanets() {
    const configs = [
      {
        name: "Verdan",
        position: new THREE.Vector3(-380, 120, -920),
        radius: 150,
        color: 0x5f8b46,
        atmosphere: 0x6bc3ff,
        accent: 0xffce7d
      },
      {
        name: "Astra Dune",
        position: new THREE.Vector3(760, -220, -1640),
        radius: 190,
        color: 0xbf8a46,
        atmosphere: 0xffb670,
        accent: 0x8de7ff
      },
      {
        name: "Nivalis",
        position: new THREE.Vector3(-1020, 340, -2200),
        radius: 220,
        color: 0x83a6c0,
        atmosphere: 0xb5ecff,
        accent: 0xffecba
      },
      {
        name: "Ember Vale",
        position: new THREE.Vector3(1460, 240, -2960),
        radius: 260,
        color: 0x9d5d42,
        atmosphere: 0xff8f68,
        accent: 0xaaf5ff
      }
    ];

    return configs.map((config, index) => createPlanet(config, index));
  }

  function createPlanet(config, index) {
    const group = new THREE.Group();
    group.position.copy(config.position);
    scene.add(group);

    const surface = new THREE.Mesh(
      new THREE.IcosahedronGeometry(config.radius, 3),
      new THREE.MeshStandardMaterial({
        color: config.color,
        roughness: 1,
        metalness: 0.03,
        flatShading: true
      })
    );
    group.add(surface);

    const atmosphere = new THREE.Mesh(
      new THREE.IcosahedronGeometry(config.radius * 1.08, 2),
      new THREE.MeshBasicMaterial({
        color: config.atmosphere,
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false,
        toneMapped: false
      })
    );
    group.add(atmosphere);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(config.radius * 1.22, config.radius * 1.34, 48),
      new THREE.MeshBasicMaterial({
        color: config.accent,
        transparent: true,
        opacity: 0.24,
        side: THREE.DoubleSide,
        toneMapped: false
      })
    );
    ring.rotation.x = -Math.PI * 0.5;
    group.add(ring);

    return {
      name: config.name,
      position: config.position.clone(),
      radius: config.radius,
      group,
      surface,
      atmosphere,
      ring,
      rotationSpeed: 0.01 + (index * 0.004),
      atmosphereColor: new THREE.Color(config.atmosphere)
    };
  }

  function buildShip(colorValue) {
    const ship = new THREE.Group();
    const hullColor = new THREE.Color(colorValue);
    const shadowColor = hullColor.clone().offsetHSL(0, 0, -0.18);
    const glowColor = hullColor.clone().offsetHSL(0, 0.08, 0.18);

    const hullMat = new THREE.MeshStandardMaterial({
      color: hullColor,
      roughness: 0.72,
      metalness: 0.24,
      flatShading: true
    });

    const darkMat = new THREE.MeshStandardMaterial({
      color: shadowColor,
      roughness: 0.92,
      metalness: 0.08,
      flatShading: true
    });

    const glowMat = new THREE.MeshStandardMaterial({
      color: glowColor,
      emissive: glowColor.clone().multiplyScalar(0.55),
      roughness: 0.38,
      metalness: 0.08,
      flatShading: true
    });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.22, 6.9, 8), hullMat);
    body.rotation.x = Math.PI * 0.5;
    ship.add(body);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.04, 2.2, 8), hullMat);
    nose.rotation.x = Math.PI * 0.5;
    nose.position.z = -4.45;
    ship.add(nose);

    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1.08, 10, 10), darkMat);
    cockpit.position.set(0, 0.66, -1.12);
    cockpit.scale.set(1.14, 0.72, 1.26);
    ship.add(cockpit);

    const wingGeometry = new THREE.BoxGeometry(4.4, 0.24, 1.66);
    const wingLeft = new THREE.Mesh(wingGeometry, hullMat);
    wingLeft.position.set(-2.78, -0.24, 0.18);
    wingLeft.rotation.z = -0.22;
    ship.add(wingLeft);

    const wingRight = wingLeft.clone();
    wingRight.position.x *= -1;
    wingRight.rotation.z *= -1;
    ship.add(wingRight);

    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.34, 1.16), darkMat);
    fin.position.set(0, 1.08, 1.2);
    ship.add(fin);

    const engineGeometry = new THREE.CylinderGeometry(0.36, 0.52, 1.52, 8);
    const engineLeft = new THREE.Mesh(engineGeometry, darkMat);
    engineLeft.rotation.x = Math.PI * 0.5;
    engineLeft.position.set(-1.08, -0.24, 3.72);
    ship.add(engineLeft);

    const engineRight = engineLeft.clone();
    engineRight.position.x *= -1;
    ship.add(engineRight);

    const thrusterGeometry = new THREE.CylinderGeometry(0.24, 0.26, 0.28, 10);
    const thrusterLeft = new THREE.Mesh(thrusterGeometry, glowMat);
    thrusterLeft.rotation.x = Math.PI * 0.5;
    thrusterLeft.position.set(-1.08, -0.24, 4.58);
    ship.add(thrusterLeft);

    const thrusterRight = thrusterLeft.clone();
    thrusterRight.position.x *= -1;
    ship.add(thrusterRight);

    ship.scale.setScalar(1.24);
    ship.userData = {
      hullMat,
      glowMat,
      thrusters: [thrusterLeft, thrusterRight]
    };
    return ship;
  }

  function createPlayerEntity(id, profile, isLocal) {
    const colorHex = getProfileColor(profile, isLocal ? "#ffbc6a" : "#88c1ff");
    const ship = buildShip(colorHex);
    ship.visible = false;
    scene.add(ship);

    return {
      id,
      isLocal,
      playerState: null,
      name: getProfileName(profile, isLocal ? "Piloto local" : "Piloto"),
      colorHex,
      mesh: ship,
      position: new THREE.Vector3(),
      targetPosition: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      roll: 0,
      targetYaw: 0,
      targetPitch: 0,
      targetRoll: 0,
      hp: MAX_HEALTH,
      kills: 0,
      deaths: 0,
      alive: true,
      respawnAt: 0,
      spawnVersionApplied: -1,
      lastShotAt: 0,
      shotSeq: 0,
      lastTransformStamp: 0,
      lastPublishAt: 0
    };
  }

  async function initGame() {
    copyInviteButton.disabled = true;
    updateCenterNotice("Abrindo o jogo...");

    if (ONLINE_READY) {
      await initOnlineMode();
    } else {
      startOfflineMode(
        PLAYROOM ? "Preencha playroom.config.js com o gameId do Playroom para habilitar o multiplayer no GitHub Pages." : "Playroom nao carregou. O jogo entrou em modo de treino local."
      );
    }
  }

  async function initOnlineMode() {
    setStatus("Abrindo o lobby online...");
    networkValue.textContent = "Conectando";
    inviteValue.textContent = "O Playroom vai gerar o codigo e o link da sala.";

    try {
      await PLAYROOM.insertCoin({
        gameId: PLAYROOM_GAME_ID,
        maxPlayersPerRoom: MAX_PLAYERS,
        reconnectGracePeriod: RECONNECT_GRACE_PERIOD,
        baseUrl: game.inviteBaseUrl,
        defaultStates: {
          [MATCH_KEY]: createEmptyMatch()
        }
      });
    } catch (error) {
      startOfflineMode("Nao foi possivel abrir o lobby online. O treino local foi ativado.");
      console.error(error);
      return;
    }

    game.started = true;
    game.networkState = "online";
    game.roomCode = safeCall(() => PLAYROOM.getRoomCode(), "") || "";
    game.localPlayerId = safeCall(() => PLAYROOM.myPlayer().id, "local-player");
    registerPlayerState(PLAYROOM.myPlayer());
    PLAYROOM.onPlayerJoin(registerPlayerState);
    syncMatchSnapshot();
    updateInviteUi();
    setStatus("Lobby concluido. Batalha online ativa.");
    updateCenterNotice("Clique no cenario para capturar o mouse e pilotar.", true);
  }

  function startOfflineMode(reason) {
    game.started = true;
    game.networkState = "offline";
    game.localPlayerId = "offline-local";
    game.offlineReason = reason;
    networkValue.textContent = "Treino local";
    roomValue.textContent = "-";
    inviteValue.textContent = "Sem Playroom configurado. O lobby online sera ativado quando o gameId for preenchido.";
    setStatus("Modo de treino local ativo.");
    createOrUpdatePlayer(game.localPlayerId, null, true);
    respawnEntity(game.players.get(game.localPlayerId), 0);
    updateCenterNotice(`${reason} Clique no cenario para pilotar.`, true);
  }

  function bindEvents() {
    window.addEventListener("resize", onResize);

    canvas.addEventListener("click", () => {
      if (!game.pointerLocked) {
        canvas.requestPointerLock();
      }
    });

    canvas.addEventListener("mousedown", (event) => {
      if (event.button === 0) {
        game.mouseDown = true;
        if (!game.pointerLocked) {
          canvas.requestPointerLock();
        }
      }
    });

    window.addEventListener("mouseup", (event) => {
      if (event.button === 0) {
        game.mouseDown = false;
      }
    });

    document.addEventListener("pointerlockchange", () => {
      game.pointerLocked = document.pointerLockElement === canvas;
      document.body.classList.toggle("is-locked", game.pointerLocked);
    });

    document.addEventListener("mousemove", (event) => {
      if (!game.pointerLocked) {
        return;
      }

      const local = getLocalEntity();
      if (!local || !local.alive) {
        return;
      }

      local.yaw -= event.movementX * 0.0026;
      local.pitch = THREE.MathUtils.clamp(local.pitch - (event.movementY * 0.0026), -1.2, 1.2);
    });

    document.addEventListener("keydown", (event) => {
      if (!game.keys[event.code]) {
        game.justPressed.add(event.code);
      }
      game.keys[event.code] = true;

      if (
        event.code === "Space" ||
        event.code === "KeyW" ||
        event.code === "KeyA" ||
        event.code === "KeyS" ||
        event.code === "KeyD" ||
        event.code === "ControlLeft" ||
        event.code === "ControlRight"
      ) {
        event.preventDefault();
      }
    });

    document.addEventListener("keyup", (event) => {
      game.keys[event.code] = false;
    });

    window.addEventListener("blur", () => {
      game.mouseDown = false;
      game.keys = Object.create(null);
      game.justPressed.clear();
    });

    copyInviteButton.addEventListener("click", async () => {
      const link = getInviteLink();
      if (!link) {
        return;
      }

      try {
        await navigator.clipboard.writeText(link);
        inviteValue.textContent = "Convite copiado para a area de transferencia.";
      } catch (error) {
        inviteValue.textContent = link;
      }
    });
  }

  function animate() {
    requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.033);
    const elapsed = clock.elapsedTime;

    updatePlanetVisuals(delta, elapsed);
    updateNetworkSnapshot();
    updatePlayers(delta);
    updateCombat(delta);
    updateVisualEffects(delta);
    updateCamera(delta, elapsed);
    updateSky();
    updateHud(delta);

    renderer.render(scene, camera);
    game.justPressed.clear();
  }

  function updatePlayers(delta) {
    const local = getLocalEntity();

    if (local && game.started) {
      if (local.alive) {
        simulateLocalShip(local, delta);
        maybeFire(local);
        maybePublishLocalState(local, false);
      } else {
        local.velocity.multiplyScalar(Math.exp(-2.8 * delta));
      }
      applyShipVisual(local, local.position, local.yaw, local.pitch, local.roll, delta);
    }

    for (const [id, entity] of game.players.entries()) {
      if (entity.isLocal) {
        continue;
      }

      if (entity.alive) {
        entity.position.lerp(entity.targetPosition, 1 - Math.exp(-8 * delta));
        entity.yaw = lerpAngle(entity.yaw, entity.targetYaw, 1 - Math.exp(-10 * delta));
        entity.pitch = THREE.MathUtils.lerp(entity.pitch, entity.targetPitch, 1 - Math.exp(-10 * delta));
        entity.roll = THREE.MathUtils.lerp(entity.roll, entity.targetRoll, 1 - Math.exp(-10 * delta));
      }

      applyShipVisual(entity, entity.position, entity.yaw, entity.pitch, entity.roll, delta);
    }
  }

  function simulateLocalShip(entity, delta) {
    if (!game.pointerLocked) {
      entity.velocity.multiplyScalar(Math.exp(-SHIP_DRAG * delta));
      entity.position.addScaledVector(entity.velocity, delta);
      constrainPosition(entity.position, entity.velocity);
      return;
    }

    const moveForward = (game.keys.KeyW ? 1 : 0) - (game.keys.KeyS ? 1 : 0);
    const moveRight = (game.keys.KeyD ? 1 : 0) - (game.keys.KeyA ? 1 : 0);
    const moveUp = (game.keys.Space ? 1 : 0) - ((game.keys.ControlLeft || game.keys.ControlRight) ? 1 : 0);

    tempEuler.set(entity.pitch, entity.yaw, 0, "YXZ");
    tempQuat.setFromEuler(tempEuler);

    const forward = tempVecA.copy(FORWARD).applyQuaternion(tempQuat);
    const right = tempVecB.copy(RIGHT).applyQuaternion(tempQuat);
    const up = tempVecC.copy(UP).applyQuaternion(tempQuat);

    const desiredDirection = tempVecD.set(0, 0, 0);
    desiredDirection.addScaledVector(forward, moveForward);
    desiredDirection.addScaledVector(right, moveRight);
    desiredDirection.addScaledVector(up, moveUp);

    if (desiredDirection.lengthSq() > 1) {
      desiredDirection.normalize();
    }

    const maxSpeed = (game.keys.ShiftLeft || game.keys.ShiftRight) ? SHIP_BOOST_SPEED : SHIP_BASE_SPEED;
    const desiredVelocity = desiredDirection.multiplyScalar(maxSpeed);
    entity.velocity.lerp(desiredVelocity, 1 - Math.exp(-SHIP_RESPONSE * delta));

    if (desiredVelocity.lengthSq() === 0) {
      entity.velocity.multiplyScalar(Math.exp(-SHIP_DRAG * delta));
    }

    entity.roll = THREE.MathUtils.lerp(entity.roll, moveRight * -0.28, 1 - Math.exp(-8 * delta));
    entity.position.addScaledVector(entity.velocity, delta);
    resolvePlanetCollisions(entity.position, entity.velocity);
    constrainPosition(entity.position, entity.velocity);
  }

  function maybeFire(entity) {
    const wantsFire = game.mouseDown || game.keys.KeyJ;
    if (!wantsFire) {
      return;
    }

    const now = performance.now();
    if ((now - entity.lastShotAt) < FIRE_INTERVAL) {
      return;
    }

    entity.lastShotAt = now;
    entity.shotSeq += 1;

    tempEuler.set(entity.pitch, entity.yaw, 0, "YXZ");
    tempQuat.setFromEuler(tempEuler);
    const direction = tempVecA.copy(FORWARD).applyQuaternion(tempQuat).normalize();
    const origin = tempVecB.copy(entity.position)
      .addScaledVector(direction, 7.2)
      .addScaledVector(tempVecC.copy(UP).applyQuaternion(tempQuat), 0.5);

    spawnLocalTrail(origin, direction, entity.colorHex);

    if (game.networkState === "online" && entity.playerState) {
      const shot = {
        seq: entity.shotSeq,
        origin: vectorToObject(origin, 2),
        direction: vectorToObject(direction, 4)
      };
      entity.playerState.setState("shot", shot, false);
      entity.playerState.setState("shotSeq", entity.shotSeq, false);
      maybePublishLocalState(entity, true);
      return;
    }
  }

  function maybePublishLocalState(entity, force) {
    if (game.networkState !== "online" || !entity.playerState) {
      return;
    }

    const now = performance.now();
    if (!force && ((now - entity.lastPublishAt) < (PLAYER_SEND_INTERVAL * 1000))) {
      return;
    }

    entity.lastPublishAt = now;
    entity.playerState.setState("transform", serializeTransform(entity), false);
  }

  function updateCombat(delta) {
    if (game.networkState !== "online") {
      return;
    }

    if (safeCall(() => PLAYROOM.isHost(), false)) {
      runHostSimulation(delta);
    }

    updateBulletVisuals();
    applyCombatSnapshot();
  }

  function runHostSimulation(delta) {
    ensureHostRuntime();

    const runtime = game.hostRuntime;
    const match = runtime.match;
    const now = performance.now();
    runtime.matchTimer += delta;

    syncCombatantsWithPlayers(match, now);
    processQueuedShots(runtime, now);
    simulateHostBullets(runtime, match, delta, now);
    cleanupExpiredEffects(runtime, now);

    if (runtime.matchTimer >= MATCH_SEND_INTERVAL) {
      runtime.matchTimer = 0;
      match.generatedAt = now;
      match.hostId = game.localPlayerId;
      match.revision += 1;
      match.bullets = Array.from(runtime.bullets.values()).map(serializeHostBullet);
      match.effects = runtime.effects.map(serializeEffect);
      PLAYROOM.setState(MATCH_KEY, match, false);
      game.matchSnapshot = cloneMatch(match);
    }
  }

  function ensureHostRuntime() {
    const runtime = game.hostRuntime;
    if (runtime.initialized && runtime.activeHostId === game.localPlayerId) {
      return;
    }

    runtime.initialized = true;
    runtime.activeHostId = game.localPlayerId;
    runtime.match = sanitizeMatch(safeCall(() => PLAYROOM.getState(MATCH_KEY), createEmptyMatch()));
    runtime.bullets = new Map();
    runtime.effects = [];
    runtime.matchTimer = 0;
    runtime.processedShotSeq = new Map();

    for (const [id, entity] of game.players.entries()) {
      runtime.processedShotSeq.set(id, getPlayerShotSeq(entity));
    }
  }

  function syncCombatantsWithPlayers(match, now) {
    const present = new Set();

    for (const [id, entity] of game.players.entries()) {
      present.add(id);

      if (!match.combatants[id]) {
        const spawn = getSpawnTransform(id, 0);
        match.combatants[id] = {
          name: entity.name,
          color: entity.colorHex,
          hp: MAX_HEALTH,
          kills: 0,
          deaths: 0,
          alive: true,
          respawnAt: 0,
          spawnVersion: 0,
          spawn
        };
      }

      const combatant = match.combatants[id];
      combatant.name = entity.name;
      combatant.color = entity.colorHex;

      if (!combatant.alive && combatant.respawnAt > 0 && now >= combatant.respawnAt) {
        combatant.alive = true;
        combatant.hp = MAX_HEALTH;
        combatant.respawnAt = 0;
        combatant.spawnVersion += 1;
        combatant.spawn = getSpawnTransform(id, combatant.spawnVersion);
        pushEffect(game.hostRuntime, {
          kind: "spawn",
          position: objectToVector(combatant.spawn.position),
          color: combatant.color,
          size: 12,
          ttl: 0.65
        });
      }
    }

    for (const id of Object.keys(match.combatants)) {
      if (!present.has(id)) {
        delete match.combatants[id];
      }
    }
  }

  function processQueuedShots(runtime, now) {
    for (const [id, entity] of game.players.entries()) {
      const combatant = runtime.match.combatants[id];
      if (!combatant || !combatant.alive) {
        runtime.processedShotSeq.set(id, getPlayerShotSeq(entity));
        continue;
      }

      const shotSeq = getPlayerShotSeq(entity);
      const processed = runtime.processedShotSeq.get(id) || 0;
      if (shotSeq <= processed) {
        continue;
      }

      const shot = safeCall(() => entity.playerState.getState("shot"), null);
      runtime.processedShotSeq.set(id, shotSeq);

      if (!shot || !shot.origin || !shot.direction) {
        continue;
      }

      const origin = objectToVector(shot.origin);
      const direction = objectToVector(shot.direction).normalize();
      const bulletId = `${id}:${shot.seq}`;

      runtime.bullets.set(bulletId, {
        id: bulletId,
        ownerId: id,
        position: origin.clone(),
        velocity: direction.multiplyScalar(SHOT_SPEED),
        ttl: SHOT_LIFETIME,
        color: entity.colorHex
      });

      pushEffect(runtime, {
        kind: "muzzle",
        position: origin,
        color: entity.colorHex,
        size: 4,
        ttl: 0.18
      });
    }
  }

  function simulateHostBullets(runtime, match, delta, now) {
    for (const [bulletId, bullet] of runtime.bullets.entries()) {
      bullet.position.addScaledVector(bullet.velocity, delta);
      bullet.ttl -= delta;

      if (bullet.ttl <= 0 || bullet.position.length() > BATTLEFIELD_RADIUS * 1.3 || hitsPlanet(bullet.position)) {
        runtime.bullets.delete(bulletId);
        continue;
      }

      let hitTargetId = "";
      for (const [targetId, combatant] of Object.entries(match.combatants)) {
        if (targetId === bullet.ownerId || !combatant.alive) {
          continue;
        }

        const targetPosition = getCombatantPosition(targetId, combatant);
        if (bullet.position.distanceToSquared(targetPosition) <= SHIP_HIT_RADIUS * SHIP_HIT_RADIUS) {
          hitTargetId = targetId;
          break;
        }
      }

      if (!hitTargetId) {
        continue;
      }

      const target = match.combatants[hitTargetId];
      target.hp = Math.max(0, target.hp - SHOT_DAMAGE);

      pushEffect(runtime, {
        kind: target.hp > 0 ? "hit" : "destroy",
        position: bullet.position.clone(),
        color: target.color,
        size: target.hp > 0 ? 6 : 18,
        ttl: target.hp > 0 ? 0.28 : 0.9
      });

      if (target.hp <= 0) {
        target.alive = false;
        target.deaths += 1;
        target.respawnAt = now + (RESPAWN_DELAY * 1000);
        target.spawn = getSpawnTransform(hitTargetId, target.spawnVersion + 1);

        const attacker = match.combatants[bullet.ownerId];
        if (attacker) {
          attacker.kills += 1;
        }
      }

      runtime.bullets.delete(bulletId);
    }
  }

  function cleanupExpiredEffects(runtime, now) {
    runtime.effects = runtime.effects.filter((effect) => effect.expiresAt > now);
  }

  function updateNetworkSnapshot() {
    if (game.networkState !== "online") {
      return;
    }

    syncMatchSnapshot();

    for (const [id, entity] of game.players.entries()) {
      if (!entity.playerState) {
        continue;
      }

      const transform = safeCall(() => entity.playerState.getState("transform"), null);
      if (!transform) {
        continue;
      }

      const stamp = Number(transform.stamp || 0);
      if (stamp < entity.lastTransformStamp) {
        continue;
      }

      entity.lastTransformStamp = stamp;
      entity.targetPosition.set(transform.x || 0, transform.y || 0, transform.z || 0);
      entity.targetYaw = transform.yaw || 0;
      entity.targetPitch = transform.pitch || 0;
      entity.targetRoll = transform.roll || 0;

      if (!entity.isLocal && entity.position.lengthSq() === 0) {
        entity.position.copy(entity.targetPosition);
        entity.yaw = entity.targetYaw;
        entity.pitch = entity.targetPitch;
        entity.roll = entity.targetRoll;
      }
    }
  }

  function syncMatchSnapshot() {
    const match = sanitizeMatch(safeCall(() => PLAYROOM.getState(MATCH_KEY), createEmptyMatch()));
    if (!match.revision && !Object.keys(match.combatants).length) {
      return;
    }
    game.matchSnapshot = match;
  }

  function applyCombatSnapshot() {
    const snapshot = game.matchSnapshot;

    for (const [id, entity] of game.players.entries()) {
      const combatant = snapshot.combatants[id];
      if (!combatant) {
        if (!entity.isLocal) {
          entity.mesh.visible = false;
        }
        continue;
      }

      entity.hp = combatant.hp;
      entity.kills = combatant.kills;
      entity.deaths = combatant.deaths;
      entity.respawnAt = combatant.respawnAt;

      if (entity.isLocal) {
        if (combatant.spawnVersion !== entity.spawnVersionApplied) {
          entity.spawnVersionApplied = combatant.spawnVersion;
          entity.alive = combatant.alive;
          if (combatant.alive) {
            respawnEntity(entity, combatant.spawnVersion, combatant.spawn);
            maybePublishLocalState(entity, true);
          }
        } else {
          entity.alive = combatant.alive;
        }
      } else {
        if (combatant.spawnVersion !== entity.spawnVersionApplied) {
          entity.spawnVersionApplied = combatant.spawnVersion;
          entity.alive = combatant.alive;
          if (combatant.spawn && combatant.spawn.position) {
            entity.targetPosition.copy(objectToVector(combatant.spawn.position));
            entity.position.copy(entity.targetPosition);
            entity.targetYaw = combatant.spawn.yaw || 0;
            entity.targetPitch = combatant.spawn.pitch || 0;
            entity.targetRoll = 0;
            entity.yaw = entity.targetYaw;
            entity.pitch = entity.targetPitch;
            entity.roll = 0;
          }
        } else {
          entity.alive = combatant.alive;
        }
      }
    }

    for (const effect of snapshot.effects) {
      if (game.seenEffects.has(effect.id)) {
        continue;
      }
      game.seenEffects.add(effect.id);
      spawnExplosion(effect);
    }
  }

  function updateBulletVisuals() {
    const liveIds = new Set();
    const bullets = game.matchSnapshot.bullets || [];

    for (const bulletData of bullets) {
      liveIds.add(bulletData.id);
      let mesh = game.bulletVisuals.get(bulletData.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(1.1, 10, 10),
          new THREE.MeshBasicMaterial({
            color: bulletData.color || "#ffd47f",
            toneMapped: false
          })
        );
        game.bulletVisuals.set(bulletData.id, mesh);
        scene.add(mesh);
      }

      mesh.position.set(bulletData.x, bulletData.y, bulletData.z);
      mesh.visible = true;
    }

    for (const [id, mesh] of game.bulletVisuals.entries()) {
      if (liveIds.has(id)) {
        continue;
      }
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      game.bulletVisuals.delete(id);
    }
  }

  function updateVisualEffects(delta) {
    for (let i = game.localTrails.length - 1; i >= 0; i -= 1) {
      const trail = game.localTrails[i];
      trail.life -= delta;
      trail.mesh.position.addScaledVector(trail.velocity, delta);
      trail.mesh.material.opacity = Math.max(0, trail.life / trail.maxLife);
      if (trail.life <= 0) {
        scene.remove(trail.mesh);
        trail.mesh.geometry.dispose();
        trail.mesh.material.dispose();
        game.localTrails.splice(i, 1);
      }
    }

    for (let i = game.explosions.length - 1; i >= 0; i -= 1) {
      const explosion = game.explosions[i];
      explosion.life += delta;
      const progress = THREE.MathUtils.clamp(explosion.life / explosion.maxLife, 0, 1);
      const scale = THREE.MathUtils.lerp(explosion.startScale, explosion.endScale, progress);
      explosion.mesh.scale.setScalar(scale);
      explosion.mesh.material.opacity = 1 - progress;
      if (explosion.life >= explosion.maxLife) {
        scene.remove(explosion.mesh);
        explosion.mesh.geometry.dispose();
        explosion.mesh.material.dispose();
        game.explosions.splice(i, 1);
      }
    }
  }

  function updateCamera(delta, elapsed) {
    const local = getLocalEntity();
    if (!local) {
      const orbit = elapsed * 0.08;
      camera.position.set(Math.sin(orbit) * 280, 120, Math.cos(orbit) * 280);
      camera.lookAt(ORIGIN);
      return;
    }

    tempEuler.set(local.pitch, local.yaw, 0, "YXZ");
    tempQuat.setFromEuler(tempEuler);
    const followDistance = local.alive ? 18 : 28;
    const followHeight = local.alive ? 5.8 : 12;

    tempVecA.set(0, followHeight, followDistance).applyQuaternion(tempQuat).add(local.position);
    camera.position.lerp(tempVecA, 1 - Math.exp(-6 * delta));

    tempVecB.copy(FORWARD).applyQuaternion(tempQuat).multiplyScalar(26).add(local.position);
    tempVecB.y += local.alive ? 2.2 : 0;
    camera.lookAt(tempVecB);
  }

  function updatePlanetVisuals(delta, elapsed) {
    for (let i = 0; i < game.planets.length; i += 1) {
      const planet = game.planets[i];
      planet.surface.rotation.y += planet.rotationSpeed * delta;
      planet.atmosphere.rotation.y -= planet.rotationSpeed * 0.35 * delta;
      planet.ring.material.opacity = 0.18 + ((Math.sin((elapsed * 1.6) + i) + 1) * 0.08);
    }
  }

  function updateSky() {
    const local = getLocalEntity();
    if (!local) {
      scene.background.set(0x050814);
      scene.fog.color.set(0x050814);
      scene.fog.density = 0;
      return;
    }

    let nearest = null;
    let nearestDistance = Infinity;

    for (let i = 0; i < game.planets.length; i += 1) {
      const planet = game.planets[i];
      const distance = local.position.distanceTo(planet.position) - planet.radius;
      if (distance < nearestDistance) {
        nearest = planet;
        nearestDistance = distance;
      }
    }

    tempColor.set(0x050814);
    if (nearest && nearestDistance < 240) {
      const factor = 1 - THREE.MathUtils.clamp(nearestDistance / 240, 0, 1);
      tempColor.lerp(nearest.atmosphereColor, factor * 0.7);
      scene.fog.density = factor * 0.01;
    } else {
      scene.fog.density = 0;
    }

    scene.background.copy(tempColor);
    scene.fog.color.copy(tempColor);

    const stars = scene.getObjectByName("stars");
    if (stars) {
      stars.position.copy(camera.position);
      stars.material.opacity = 0.9 - (scene.fog.density * 40);
    }
  }

  function updateHud(delta) {
    game.hudTimer += delta;
    if (game.hudTimer < 0.08) {
      return;
    }
    game.hudTimer = 0;

    const local = getLocalEntity();
    const playersCount = game.playerOrder.filter((id) => game.players.has(id)).length;
    const localHp = local ? Math.max(0, Math.round(local.hp)) : MAX_HEALTH;
    const link = getInviteLink();

    pilotValue.textContent = local ? local.name : "-";
    networkValue.textContent = game.networkState === "online" ? "Online" : "Treino local";
    roomValue.textContent = game.roomCode || "-";
    playersValue.textContent = `${playersCount}`;
    healthValue.textContent = `${localHp}`;
    healthBarFill.style.transform = `scaleX(${THREE.MathUtils.clamp(localHp / MAX_HEALTH, 0, 1)})`;
    scoreValue.textContent = local ? `${local.kills} / ${local.deaths}` : "0 / 0";
    copyInviteButton.disabled = !link;

    if (game.networkState === "online") {
      inviteValue.textContent = link || "Sala pronta. Gere o codigo pelo Playroom.";
    }

    if (game.networkState === "offline") {
      hintText.textContent = game.offlineReason;
      controlsText.textContent = "Mouse mira, W A S D e Espaco/Ctrl movem, Shift acelera, clique esquerdo ou J dispara. Preencha o gameId para ligar o multiplayer.";
    } else if (local && !local.alive) {
      const seconds = Math.max(0, Math.ceil((local.respawnAt - performance.now()) / 1000));
      hintText.textContent = `Nave destruida. Respawn em ${seconds}s.`;
      controlsText.textContent = "Aguarde o respawn enquanto os outros pilotos continuam a batalha.";
    } else {
      hintText.textContent = "Convide outros pilotos pelo link da sala e destrua as naves inimigas antes de ser abatido.";
      controlsText.textContent = "Mouse mira, W A S D e Espaco/Ctrl movem, Shift acelera, clique esquerdo ou J dispara.";
    }

    if (!game.pointerLocked) {
      updateCenterNotice(game.networkState === "online" ? "Clique no cenario para capturar o mouse e entrar no combate." : `${game.offlineReason} Clique no cenario para pilotar.`, true);
    } else if (local && !local.alive) {
      const seconds = Math.max(0, Math.ceil((local.respawnAt - performance.now()) / 1000));
      updateCenterNotice(`Nave destruida. Respawn em ${seconds}s.`);
    } else {
      centerNotice.style.opacity = "0";
    }

    renderScoreboard();
  }

  function renderScoreboard() {
    const rows = [];
    const snapshot = game.matchSnapshot;

    for (const id of game.playerOrder) {
      const entity = game.players.get(id);
      if (!entity) {
        continue;
      }

      const combatant = snapshot.combatants[id] || {
        hp: entity.hp,
        kills: entity.kills,
        deaths: entity.deaths,
        alive: entity.alive
      };

      rows.push({
        id,
        name: entity.name,
        kills: combatant.kills || 0,
        deaths: combatant.deaths || 0,
        hp: combatant.hp || 0,
        alive: Boolean(combatant.alive)
      });
    }

    rows.sort((a, b) => (b.kills - a.kills) || (a.deaths - b.deaths) || a.name.localeCompare(b.name));

    scoreboard.innerHTML = "";

    if (!rows.length) {
      scoreboard.innerHTML = '<div class="score-row"><strong>Aguardando pilotos</strong><span>Abra o lobby para entrar na batalha.</span></div>';
      return;
    }

    for (const row of rows) {
      const node = document.createElement("div");
      node.className = `score-row${row.id === game.localPlayerId ? " is-local" : ""}`;
      node.innerHTML = `<div><strong>${escapeHtml(row.name)}</strong><span>${row.alive ? `HP ${row.hp}` : "Destruido"}</span></div><div><strong>${row.kills}</strong><span>${row.deaths} quedas</span></div>`;
      scoreboard.appendChild(node);
    }
  }

  function registerPlayerState(playerState) {
    const isLocal = playerState.id === game.localPlayerId;
    const entity = createOrUpdatePlayer(playerState.id, playerState.getProfile(), isLocal);
    entity.playerState = playerState;
    entity.name = getProfileName(playerState.getProfile(), entity.name);
    entity.colorHex = getProfileColor(playerState.getProfile(), entity.colorHex);
    applyShipColor(entity.mesh, entity.colorHex);
    playerState.onQuit(() => removePlayer(playerState.id));

    if (isLocal && entity.position.lengthSq() === 0) {
      respawnEntity(entity, 0);
      maybePublishLocalState(entity, true);
    }
  }

  function createOrUpdatePlayer(id, profile, isLocal) {
    if (game.players.has(id)) {
      const existing = game.players.get(id);
      if (profile) {
        existing.name = getProfileName(profile, existing.name);
        existing.colorHex = getProfileColor(profile, existing.colorHex);
        applyShipColor(existing.mesh, existing.colorHex);
      }
      return existing;
    }

    const entity = createPlayerEntity(id, profile, isLocal);
    game.players.set(id, entity);
    game.playerOrder.push(id);
    return entity;
  }

  function removePlayer(id) {
    const entity = game.players.get(id);
    if (!entity) {
      return;
    }

    scene.remove(entity.mesh);
    disposeShip(entity.mesh);
    game.players.delete(id);
    game.playerOrder = game.playerOrder.filter((entry) => entry !== id);
  }

  function respawnEntity(entity, version, spawnOverride) {
    const spawn = spawnOverride || getSpawnTransform(entity.id, version);
    entity.position.copy(objectToVector(spawn.position));
    entity.targetPosition.copy(entity.position);
    entity.velocity.set(0, 0, 0);
    entity.yaw = spawn.yaw || 0;
    entity.pitch = spawn.pitch || 0;
    entity.roll = 0;
    entity.targetYaw = entity.yaw;
    entity.targetPitch = entity.pitch;
    entity.targetRoll = 0;
    entity.hp = MAX_HEALTH;
    entity.alive = true;
    entity.mesh.visible = true;
  }

  function applyShipVisual(entity, position, yaw, pitch, roll, delta) {
    entity.mesh.visible = entity.alive;
    if (!entity.alive) {
      return;
    }

    entity.mesh.position.copy(position);
    tempEuler.set(pitch, yaw, roll, "YXZ");
    entity.mesh.quaternion.setFromEuler(tempEuler);

    const enginePulse = 0.84 + (Math.min(1, entity.velocity.length() / SHIP_BOOST_SPEED) * 0.8);
    const thrusters = entity.mesh.userData.thrusters || [];
    for (let i = 0; i < thrusters.length; i += 1) {
      thrusters[i].scale.setScalar(enginePulse);
    }

    const glowMat = entity.mesh.userData.glowMat;
    if (glowMat) {
      glowMat.emissiveIntensity = 1.05 + (Math.min(1, entity.velocity.length() / SHIP_BOOST_SPEED) * 0.9);
    }
  }

  function spawnLocalTrail(origin, direction, colorValue) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 8, 8),
      new THREE.MeshBasicMaterial({
        color: colorValue,
        transparent: true,
        opacity: 0.8,
        toneMapped: false
      })
    );
    mesh.position.copy(origin);
    scene.add(mesh);

    game.localTrails.push({
      mesh,
      velocity: direction.clone().multiplyScalar(180),
      life: 0.22,
      maxLife: 0.22
    });
  }

  function spawnExplosion(effect) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 14, 14),
      new THREE.MeshBasicMaterial({
        color: effect.color || "#ffd37f",
        transparent: true,
        opacity: 1,
        toneMapped: false
      })
    );
    mesh.position.set(effect.x, effect.y, effect.z);
    mesh.scale.setScalar(effect.kind === "destroy" ? 3 : 1.4);
    scene.add(mesh);

    game.explosions.push({
      mesh,
      life: 0,
      maxLife: effect.ttl || (effect.kind === "destroy" ? 0.9 : 0.28),
      startScale: effect.kind === "destroy" ? 3 : 1.4,
      endScale: effect.size || (effect.kind === "destroy" ? 22 : 8)
    });
  }

  function resolvePlanetCollisions(position, velocity) {
    for (let i = 0; i < game.planets.length; i += 1) {
      const planet = game.planets[i];
      tempVecA.subVectors(position, planet.position);
      const distance = tempVecA.length();
      const minDistance = planet.radius + 18;
      if (distance < minDistance) {
        tempVecA.multiplyScalar(1 / Math.max(distance, 0.0001));
        position.copy(planet.position).addScaledVector(tempVecA, minDistance);
        velocity.multiplyScalar(0.35);
      }
    }
  }

  function hitsPlanet(point) {
    for (let i = 0; i < game.planets.length; i += 1) {
      const planet = game.planets[i];
      if (point.distanceToSquared(planet.position) <= (planet.radius * planet.radius)) {
        return true;
      }
    }
    return false;
  }

  function constrainPosition(position, velocity) {
    const length = position.length();
    if (length <= BATTLEFIELD_RADIUS) {
      return;
    }

    position.multiplyScalar(BATTLEFIELD_RADIUS / length);
    velocity.multiplyScalar(0.6);
  }

  function getCombatantPosition(id, combatant) {
    const entity = game.players.get(id);
    if (entity && entity.playerState) {
      const transform = safeCall(() => entity.playerState.getState("transform"), null);
      if (transform) {
        return tempVecA.set(transform.x || 0, transform.y || 0, transform.z || 0).clone();
      }
    }

    if (combatant.spawn && combatant.spawn.position) {
      return objectToVector(combatant.spawn.position);
    }

    return new THREE.Vector3();
  }

  function getSpawnTransform(id, version) {
    const hash = Math.abs(hashString(`${id}:${version}`));
    const angle = (hash % 360) * (Math.PI / 180);
    const ring = 360 + ((hash % 5) * 110);
    const height = -120 + ((hash % 7) * 65);
    const position = {
      x: Math.cos(angle) * ring,
      y: height,
      z: Math.sin(angle) * ring
    };

    const yaw = angle + Math.PI;
    return {
      position,
      yaw,
      pitch: 0
    };
  }

  function updateInviteUi() {
    roomValue.textContent = game.roomCode || "-";
    inviteValue.textContent = getInviteLink() || "O codigo da sala aparece aqui apos o lobby.";
    copyInviteButton.disabled = !game.roomCode;
  }

  function getInviteLink() {
    if (!game.roomCode) {
      return "";
    }

    const base = game.inviteBaseUrl || window.location.href.split("#")[0];
    return `${base}#r=${encodeURIComponent(game.roomCode)}`;
  }

  function getLocalEntity() {
    return game.localPlayerId ? game.players.get(game.localPlayerId) || null : null;
  }

  function getPlayerShotSeq(entity) {
    if (!entity || !entity.playerState) {
      return 0;
    }
    return Number(safeCall(() => entity.playerState.getState("shotSeq"), 0) || 0);
  }

  function serializeTransform(entity) {
    return {
      x: round(entity.position.x, 2),
      y: round(entity.position.y, 2),
      z: round(entity.position.z, 2),
      yaw: round(entity.yaw, 4),
      pitch: round(entity.pitch, 4),
      roll: round(entity.roll, 4),
      stamp: Date.now()
    };
  }

  function serializeHostBullet(bullet) {
    return {
      id: bullet.id,
      ownerId: bullet.ownerId,
      x: round(bullet.position.x, 2),
      y: round(bullet.position.y, 2),
      z: round(bullet.position.z, 2),
      color: bullet.color
    };
  }

  function serializeEffect(effect) {
    return {
      id: effect.id,
      kind: effect.kind,
      x: round(effect.position.x, 2),
      y: round(effect.position.y, 2),
      z: round(effect.position.z, 2),
      color: effect.color,
      size: effect.size,
      ttl: round(Math.max(0.1, (effect.expiresAt - performance.now()) / 1000), 2)
    };
  }

  function pushEffect(runtime, options) {
    runtime.effectSerial += 1;
    const now = performance.now();
    runtime.effects.push({
      id: `${game.localPlayerId || "host"}:fx:${runtime.effectSerial}`,
      kind: options.kind,
      position: options.position.clone(),
      color: options.color,
      size: options.size,
      expiresAt: now + ((options.ttl || 0.2) * 1000)
    });
  }

  function sanitizeMatch(match) {
    const base = createEmptyMatch();
    if (!match || typeof match !== "object") {
      return base;
    }

    base.revision = Number(match.revision || 0);
    base.generatedAt = Number(match.generatedAt || 0);
    base.hostId = typeof match.hostId === "string" ? match.hostId : "";
    base.combatants = match.combatants && typeof match.combatants === "object" ? match.combatants : {};
    base.bullets = Array.isArray(match.bullets) ? match.bullets : [];
    base.effects = Array.isArray(match.effects) ? match.effects : [];
    return base;
  }

  function cloneMatch(match) {
    return JSON.parse(JSON.stringify(match));
  }

  function safeCall(fn, fallback) {
    try {
      return fn();
    } catch (error) {
      return fallback;
    }
  }

  function getProfileName(profile, fallback) {
    return profile && typeof profile.name === "string" && profile.name ? profile.name : fallback;
  }

  function getProfileColor(profile, fallback) {
    return profile && profile.color && profile.color.hex ? profile.color.hex : fallback;
  }

  function getBaseInviteUrl() {
    if (CONFIG.roomBaseUrl) {
      return CONFIG.roomBaseUrl;
    }
    return window.location.href.split("#")[0];
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function setStatus(text) {
    statusLine.textContent = text;
  }

  function updateCenterNotice(text, hideWhenLocked = false) {
    centerNotice.textContent = text;
    centerNotice.classList.toggle("is-lock-hint", hideWhenLocked);
    centerNotice.style.opacity = "1";
  }

  function objectToVector(value) {
    return new THREE.Vector3(value.x || 0, value.y || 0, value.z || 0);
  }

  function vectorToObject(vector, digits) {
    return {
      x: round(vector.x, digits),
      y: round(vector.y, digits),
      z: round(vector.z, digits)
    };
  }

  function round(value, digits) {
    const power = 10 ** digits;
    return Math.round(value * power) / power;
  }

  function lerpAngle(from, to, alpha) {
    const delta = (((to - from) + Math.PI) % (Math.PI * 2)) - Math.PI;
    return from + (delta * alpha);
  }

  function hashString(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = ((hash << 5) - hash) + value.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  function escapeHtml(value) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function disposeShip(ship) {
    ship.traverse((child) => {
      if (child.isMesh) {
        child.geometry.dispose();
        child.material.dispose();
      }
    });
  }

  function applyShipColor(ship, colorValue) {
    const hullMat = ship.userData.hullMat;
    const glowMat = ship.userData.glowMat;
    if (!hullMat || !glowMat) {
      return;
    }

    const hullColor = new THREE.Color(colorValue);
    const glowColor = hullColor.clone().offsetHSL(0, 0.08, 0.18);
    hullMat.color.copy(hullColor);
    glowMat.color.copy(glowColor);
    glowMat.emissive.copy(glowColor.clone().multiplyScalar(0.55));
  }

})();
