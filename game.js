(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const GAME_W = 420;
  const GAME_H = 640;
  const GROUND_H = 84;
  const SKY_H = GAME_H - GROUND_H;

  const GRAVITY = 0.42;
  const FLAP = -8.0;
  const MAX_FALL = 12;
  const PIPE_SPEED = 2.6;
  const GAP = 260;
  const PIPE_W = 68;
  const PIPE_SPACING = 208;
  const BIRD_X = 112;
  const BIRD_R = 12;
  const BIRD_SCALE = 0.7;
  const BIRD_HIT_RX = 31;
  const BIRD_HIT_RY = 29;
  const CROW_R = 14;
  const SNAKE_R = 13;
  const SHARK_R = 16;
  const BALL_R = 13;
  const LIGHT_WARN = 2.2;
  const NET_R = 26;
  const NET_SPEED = 2.3;
  const PLANE_LEN = 56;
  const PLANE_THICK = 14;
  const SAT_R = 14;
  const AST_R_MIN = 10;
  const AST_R_MAX = 26;
  const PLANET_R_MIN = 26;
  const PLANET_R_MAX = 42;
  const PLANT_R = 16;
  const LAUNCH_TIME = 1.9;
  const RESTART_DELAY = 500;

  // ================= NEST PROTECTION MINI-GAME =================
  const NEST_X = GAME_W / 2;
  const NEST_Y = 310;
  const NEST_SIT_Y = 286;
  const RAT_DANGER = 60;
  const RAT_WINDOW = 1.55;
  const NEST_TARGET = 12;

  // ================= VOLCANO STAGE =================
  const VOLCANO_TARGET = 3;
  const VOLCANO_LEN = 30;

  // ================= HURRICANE STAGE =================
  const HURRICANE_TARGET = 3;

  // ================= SEWER STAGE =================
  const SEWER_TARGET = 5;
  const SEWER_GROUND = GAME_H - 102;
  const SEWER_WALK_X_MIN = 46;
  const SEWER_WALK_X_MAX = GAME_W - 46;
  const SEWER_SWORD_REACH = 62;
  const SEWER_SWORD_CD = 0.02;

  const BEST_KEY = 'flappy-sunny-best';
  const UI_FONT = '"Arial Rounded MT Bold", "Segoe UI", Arial, sans-serif';

  // ================= BIRD PHOTO SPRITES =================
  const BIRD_FRAME_FILES = ['ba (1).png', 'ba (2).png', 'ba (3).png'];
  // opaque bird region inside each 1989x2206 photo (px)
  const BIRD_CROP = { x: 664, y: 500, w: 752, h: 700 };
  const BIRD_SPRITE_W = 88; // pre-render width (px) so we don't sample the huge photo each frame
  const birdSprites = [];
  let birdSpritesReady = false;
  (function loadBirdSprites() {
    let loaded = 0;
    for (let i = 0; i < BIRD_FRAME_FILES.length; i++) {
      const img = new Image();
      img.src = 'public/' + BIRD_FRAME_FILES[i];
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = BIRD_SPRITE_W;
        cv.height = Math.round(BIRD_SPRITE_W * BIRD_CROP.h / BIRD_CROP.w);
        const g = cv.getContext('2d');
        g.drawImage(img, BIRD_CROP.x, BIRD_CROP.y, BIRD_CROP.w, BIRD_CROP.h, 0, 0, cv.width, cv.height);
        birdSprites[i] = cv;
        loaded++;
        if (loaded === BIRD_FRAME_FILES.length) birdSpritesReady = true;
      };
    }
  })();

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(GAME_W * dpr);
    canvas.height = Math.round(GAME_H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  resize();

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function stageForScore(score) {
    const s = score % 150;
    if (s < 10) return 1;
    if (s < 30) return 2;
    if (s < 40) return 3;
    if (s < 50) return 4;
    if (s < 70) return 5;
    if (s < 80) return 6;
    if (s < 90) return 7;
    if (s < 100) return 8;
    if (s < 110) return 9;
    if (s < 120) return 10;
    if (s < 130) return 11;
    if (s < 140) return 12;
    return 13;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---- day / night cycle (one full loop per DAY_CYCLE points scored) ----
  const DAY_CYCLE = 24;
  const CYCLE = [
    { p: 0.0, top: [120, 190, 130], mid: [226, 218, 140], bot: [255, 242, 185], dim: 0.0, star: 0.0, moon: 0.0 },
    { p: 0.25, top: [225, 165, 100], mid: [242, 192, 130], bot: [252, 220, 165], dim: 0.1, star: 0.15, moon: 0.25 },
    { p: 0.5, top: [22, 32, 38], mid: [45, 54, 52], bot: [82, 88, 70], dim: 0.32, star: 0.9, moon: 0.95 },
    { p: 0.75, top: [150, 195, 145], mid: [226, 196, 140], bot: [250, 220, 170], dim: 0.1, star: 0.15, moon: 0.25 },
    { p: 1.0, top: [120, 190, 130], mid: [226, 218, 140], bot: [255, 242, 185], dim: 0.0, star: 0.0, moon: 0.0 },
  ];
  function cssC(c) {
    return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')';
  }
  function lerpC(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  function sampleCycle(x) {
    const i = Math.min(Math.floor(x * 4), 3);
    const t = x * 4 - i;
    const a = CYCLE[i];
    const b = CYCLE[i + 1];
    return {
      top: lerpC(a.top, b.top, t),
      mid: lerpC(a.mid, b.mid, t),
      bot: lerpC(a.bot, b.bot, t),
      dim: a.dim + (b.dim - a.dim) * t,
      star: a.star + (b.star - a.star) * t,
      moon: a.moon + (b.moon - a.moon) * t,
    };
  }

  // ---- biome themes per stage (blend with the day/night cycle) ----
  const BIOMES = {
    1: {
      name: 'MEADOW',
      blend: 0.0,
      sky: { top: [0, 0, 0], mid: [0, 0, 0], bot: [0, 0, 0] },
      ground: 'grass',
      sandTop: '#ecd092', sandMid: '#e8c47f', sandBot: '#d9b268',
      grassTop: '#8fd96f', grassMid: '#67c44a', grassBot: '#4ca13a',
    },
    2: {
      name: 'DUSK WOODS',
      blend: 0.5,
      sky: { top: [120, 96, 60], mid: [196, 150, 92], bot: [240, 196, 138] },
      ground: 'grass',
      sandTop: '#c9b07a', sandMid: '#bda06c', sandBot: '#a98e5e',
      grassTop: '#6fa84a', grassMid: '#578c3a', grassBot: '#3f7028',
    },
    3: {
      name: 'DESERT',
      blend: 0.6,
      sky: { top: [232, 160, 92], mid: [248, 198, 132], bot: [255, 232, 178] },
      ground: 'sand',
      sandTop: '#e8c68a', sandMid: '#ddb277', sandBot: '#c69a5e',
      grassTop: '#d8a860', grassMid: '#c58f48', grassBot: '#a8763a',
    },
    4: {
      name: 'OCEAN',
      blend: 0.55,
      sky: { top: [98, 176, 150], mid: [150, 212, 186], bot: [218, 244, 216] },
      ground: 'sea',
      sandTop: '#2f9bc9', sandMid: '#1f86b8', sandBot: '#115a86',
      grassTop: '#35a6d6', grassMid: '#238dc2', grassBot: '#1a6ea6',
    },
    5: {
      name: 'STADIUM',
      blend: 0.3,
      sky: { top: [120, 190, 140], mid: [196, 220, 150], bot: [242, 250, 200] },
      ground: 'pitch',
      sandTop: '#4caf50', sandMid: '#43a047', sandBot: '#388e3c',
      grassTop: '#7bd158', grassMid: '#5cbf45', grassBot: '#3fa233',
    },
    6: {
      name: 'THUNDERSTORM',
      blend: 0.75,
      sky: { top: [58, 66, 54], mid: [92, 100, 78], bot: [140, 140, 110] },
      ground: 'grass',
      sandTop: '#5d6450', sandMid: '#4f5644', sandBot: '#3d4436',
      grassTop: '#5f8a4a', grassMid: '#4b7339', grassBot: '#3a5c2c',
    },
    7: {
      name: 'PARK',
      blend: 0.15,
      sky: { top: [116, 190, 138], mid: [196, 220, 150], bot: [244, 250, 200] },
      ground: 'grass',
      sandTop: '#7cb854', sandMid: '#629e42', sandBot: '#4a8030',
      grassTop: '#8bd463', grassMid: '#6fbf4c', grassBot: '#519d35',
    },
    8: {
      name: 'AIRPORT',
      blend: 0.25,
      sky: { top: [96, 178, 232], mid: [168, 214, 244], bot: [230, 246, 252] },
      ground: 'tarmac',
      sandTop: '#9aa4ae', sandMid: '#88929c', sandBot: '#68717a',
      grassTop: '#b6c0ca', grassMid: '#a0abb5', grassBot: '#838d97',
    },
    9: {
      name: 'SPACE',
      blend: 1.0,
      sky: { top: [8, 10, 26], mid: [14, 18, 40], bot: [30, 34, 66] },
      ground: 'space',
      sandTop: '#151a38', sandMid: '#0e1226', sandBot: '#060812',
      grassTop: '#1a2048', grassMid: '#141a38', grassBot: '#0a0e1e',
    },
    10: {
      name: 'ASTEROIDS',
      blend: 1.0,
      sky: { top: [6, 8, 16], mid: [12, 16, 30], bot: [22, 24, 44] },
      ground: 'space',
      sandTop: '#20242e', sandMid: '#14161d', sandBot: '#0a0b10',
      grassTop: '#2a2f3c', grassMid: '#1c2029', grassBot: '#10131a',
    },
    11: {
      name: 'PLANETS',
      blend: 1.0,
      sky: { top: [10, 8, 30], mid: [20, 14, 44], bot: [40, 26, 70] },
      ground: 'space',
      sandTop: '#2a1a4a', sandMid: '#1c1134', sandBot: '#0e0818',
      grassTop: '#35205e', grassMid: '#261645', grassBot: '#150b26',
    },
    13: {
      name: 'MONSTER PLANTS',
      blend: 0.45,
      sky: { top: [86, 150, 74], mid: [160, 200, 100], bot: [228, 240, 160] },
      ground: 'grass',
      sandTop: '#6a8f48', sandMid: '#557a3c', sandBot: '#3f5c2a',
      grassTop: '#85c95a', grassMid: '#68ae46', grassBot: '#468c30',
    },
    14: {
      name: 'VOLCANO',
      blend: 0.85,
      sky: { top: [92, 28, 20], mid: [148, 52, 26], bot: [222, 96, 40] },
      ground: 'lava',
      sandTop: '#b33a16', sandMid: '#8c2a10', sandBot: '#551408',
      grassTop: '#d8501e', grassMid: '#b23a12', grassBot: '#7a2208',
    },
    15: {
      name: 'HURRICANE',
      blend: 0.85,
      sky: { top: [38, 80, 100], mid: [82, 122, 128], bot: [138, 168, 150] },
      ground: 'sea',
      sandTop: '#36525e', sandMid: '#28424d', sandBot: '#162a32',
      grassTop: '#719196', grassMid: '#55767c', grassBot: '#3a565c',
    },
  };
  function currentBiome() {
    return BIOMES[game.stage] || BIOMES[1];
  }

  const game = {
    mode: 'intro',
    birdY: GAME_H * 0.3,
    birdX: BIRD_X,
    dieT: 0,
    introT: 0,
    introX: -90,
    introFeatherAcc: 0,
    nestFlyT: 0,
    vel: 0,
    rot: 0,
    wing: 0,
    pipes: [],
    nextPipeX: GAME_W + 260,
    crows: [],
    nextCrowX: GAME_W + 260,
    snakes: [],
    nextSnakeX: GAME_W + 260,
    sharks: [],
    nextSharkX: GAME_W + 260,
    waves: [],
    nextWaveX: GAME_W + 260,
    splashes: [],
    balls: [],
    nextBallX: GAME_W + 260,
    lightnings: [],
    lightningTimer: 2.5,
    netters: [],
    nextNetX: GAME_W + 260,
    planes: [],
    nextPlaneX: GAME_W + 260,
    satellites: [],
    nextSatX: GAME_W + 260,
    asteroids: [],
    nextAstX: GAME_W + 260,
    planets: [],
    nextPlanetX: GAME_W + 260,
    plants: [],
    nextPlantX: GAME_W + 260,
    lava: [],
    nextLavaX: GAME_W + 260,
    volcanoCount: 0,
    volcanoEmbers: [],
    volcanoSparks: [],
    nextSparkT: 2.5,
    sparkWarnT: 0,
    hurricanes: [],
    nextHurricaneX: GAME_W + 260,
    hurricaneCount: 0,
    zombies: [],
    zombieCount: 0,
    sewerRunX: BIRD_X,
    sewerFacing: 1,
    swordSwing: 0,
    swordCd: 0,
    sewerWalk: 0,
    nextZombieT: 1.0,
    moveLeft: false,
    moveRight: false,
    sewerWinT: null,
    sewerTarget: null,
    stage: 1,
    stageBanner: 0,
    teleported: false,
    launchT: 0,
    launchX: BIRD_X,
    launchFeatherAcc: 0,
    countT: 0,
    lastCount: -1,
    spaceReadyT: 0,
    lastReadyCount: -1,
    nestActive: false,
    eggs: [true, true],
    eggBounce: [0, 0],
    eggCr: [0, 0],
    rats: [],
    poofs: [],
    ratsSaved: 0,
    nextRatT: 1.4,
    nestT: 0,
    nestEnding: null,
    nestEndT: 0,
    nestLook: 0,
    nestLookTarget: 0,
    nestHop: 0,
    nestHopSide: 0,
    tajT: 0,
    tajX: -60,
    tajY: 0,
    tajFeatherAcc: 0,
    tajCam: 0,
    tajCelebrating: false,
    cutSceneMenu: false,
    cutSceneIndex: 0,
    invuln: 0,
    dist: 0,
    score: 0,
    best: 0,
    newRecord: false,
    t: 0,
    blink: 0,
    nextBlink: 2.5,
    chirpT: 0,
    flapPulse: 0,
    stretchX: 1,
    stretchY: 1,
    shake: 0,
    flash: 0,
    overlay: 0,
    overAt: -1,
    groundOffset: 0,
    clouds: [],
    feathers: [],
    dayPhase: 0,
    scorePop: 0,
    scorePopVel: 0,
    lastScore: 0,
    warp: 0,
    nextFloaterT: 0.8,
    floaters: [],
  };

  try {
    game.best = Number(localStorage.getItem(BEST_KEY) || 0);
  } catch (e) {
    game.best = 0;
  }

  for (let i = 0; i < 9; i++) {
    game.clouds.push({
      x: Math.random() * GAME_W,
      y: 30 + Math.random() * 210,
      s: 0.55 + Math.random() * 0.85,
      sp: 0.18 + Math.random() * 0.5,
      drift: 0.15 + Math.random() * 0.2,
    });
  }

  // pointer position in game coordinates (used for eye tracking)
  const pointer = { x: null, y: null };

  let actx = null;
  function ac() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }

  function tone(freq, dur, type, vol, slide) {
    const c = ac();
    if (!c) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), c.currentTime + dur);
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + dur + 0.02);
  }

  function noise(dur, vol, freq, q) {
    const c = ac();
    if (!c) return;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const flt = c.createBiquadFilter();
    flt.type = 'highpass';
    flt.frequency.value = freq;
    flt.Q.value = q || 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    src.connect(flt);
    flt.connect(g);
    g.connect(c.destination);
    src.start();
    src.stop(c.currentTime + dur + 0.02);
  }

  const sndFlap = () => {
    noise(0.06, 0.045, 1200, 0.7);
  };

  // ================= REAL BUDGIE VOCALIZATIONS =================
  // Sunny's voice is synthesized with FM-style timbre: a bright carrier with a
  // buzzy square overtone and a fast quiver, plus quick pitch glides — the way a
  // real budgie's syrinx produces those bright, rolling "cheeps" and warbles.

  // one short budgie voice note (buzzy timbre, quick attack, living quiver)
  function budgieVoice(freq, dur, vol, slide, vib, at) {
    const c = ac();
    if (!c) return;
    const t0 = c.currentTime + (at || 0);
    const carrier = c.createOscillator();
    carrier.type = 'triangle';
    carrier.frequency.setValueAtTime(freq, t0);
    if (slide) carrier.frequency.exponentialRampToValueAtTime(Math.max(250, slide), t0 + dur);

    const buzzer = c.createOscillator();
    buzzer.type = 'square';
    buzzer.frequency.setValueAtTime(freq * 2.02, t0);
    const buzzGain = c.createGain();
    buzzGain.gain.value = 0.26;

    const quiver = c.createOscillator();
    quiver.frequency.value = vib || 16;
    const quiverGain = c.createGain();
    quiverGain.gain.value = freq * 0.022;
    quiver.connect(quiverGain);
    quiverGain.connect(carrier.frequency);

    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.014);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    carrier.connect(g);
    buzzer.connect(buzzGain);
    buzzGain.connect(g);
    g.connect(c.destination);
    carrier.start(t0);
    buzzer.start(t0);
    quiver.start(t0);
    carrier.stop(t0 + dur + 0.06);
    buzzer.stop(t0 + dur + 0.06);
    quiver.stop(t0 + dur + 0.06);
  }

  // short bright contact call: "cheep!"
  const sndBudgieCheep = () => {
    const f = 2600 + Math.random() * 1300;
    budgieVoice(f, 0.13, 0.05, f * 1.4, 12 + Math.random() * 10, 0);
    budgieVoice(f * 1.25, 0.16, 0.035, f * 0.8, 14 + Math.random() * 8, 0.09);
  };

  // happy warbling babble: rapid varied notes with trills, like real budgie chatter
  const sndBudgieWarble = () => {
    let t = 0.04;
    const steps = 6 + Math.floor(Math.random() * 6);
    for (let i = 0; i < steps; i++) {
      const base = 2100 + Math.random() * 1900;
      const roll = Math.random();
      if (roll < 0.38) {
        const alt = base + 150 + Math.random() * 240;
        const reps = 2 + Math.floor(Math.random() * 3);
        for (let r = 0; r < reps; r++) {
          budgieVoice(base, 0.06, 0.045, base * 1.1, 19, t); t += 0.045;
          budgieVoice(alt, 0.06, 0.045, alt * 0.92, 19, t); t += 0.05;
        }
      } else if (roll < 0.72) {
        budgieVoice(base, 0.11, 0.05, base * 1.35, 16, t); t += 0.1;
        budgieVoice(base * 0.68, 0.13, 0.04, base * 1.05, 14, t); t += 0.13;
      } else {
        budgieVoice(base, 0.13, 0.045, base * 0.7, 15, t); t += 0.12;
      }
      t += 0.025 + Math.random() * 0.03;
    }
  };

  // ambient voice: mostly soft cheeps, sometimes a happy warble
  const sndChirp = () => {
    if (Math.random() < 0.32) sndBudgieWarble();
    else sndBudgieCheep();
  };
  const sndCaw = () => {
    tone(215, 0.13, 'sawtooth', 0.1, 265);
    setTimeout(() => tone(185, 0.16, 'sawtooth', 0.09, 235), 140);
  };
  const sndHiss = () => {
    noise(0.22, 0.08, 2400, 1.2);
    setTimeout(() => noise(0.15, 0.06, 1800, 1), 120);
  };
  const sndSplash = () => {
    noise(0.16, 0.08, 600, 0.6);
    setTimeout(() => noise(0.1, 0.05, 1000, 0.7), 60);
  };
  const sndKick = () => {
    tone(120, 0.1, 'triangle', 0.16, 55);
    setTimeout(() => tone(175, 0.08, 'square', 0.08, 75), 55);
  };
  const sndWhoosh = () => {
    noise(0.18, 0.14, 500, 0.5);
    tone(300, 0.12, 'triangle', 0.08, 900);
  };
  const sndSlash = () => {
    noise(0.13, 0.11, 2600, 1.4);
    tone(680, 0.1, 'triangle', 0.07, 1800);
  };
  const sndThunder = () => {
    noise(0.5, 0.22, 120, 0.9);
    setTimeout(() => noise(0.4, 0.4, 60, 0.8), 140);
    tone(55, 0.45, 'sine', 0.2, 32);
  };
  const sndScore = () => {
    const f = 3000 + Math.random() * 600;
    budgieVoice(f, 0.1, 0.055, f * 1.3, 18, 0);
    budgieVoice(f * 1.4, 0.12, 0.045, f * 1.55, 16, 0.06);
  };
  const sndHit = () => tone(170, 0.22, 'sawtooth', 0.16, 55);
  const sndSqueak = () => {
    tone(880, 0.07, 'square', 0.09, 1240);
    setTimeout(() => tone(760, 0.1, 'square', 0.07, 480), 90);
  };
  const sndCrack = () => {
    noise(0.12, 0.16, 2500, 1.4);
    setTimeout(() => noise(0.1, 0.1, 1800, 1.2), 60);
  };
  const sndDie = () => {
    const f = 2000 + Math.random() * 500;
    budgieVoice(f, 0.09, 0.07, f * 1.25, 24, 0);
    budgieVoice(f * 1.1, 0.16, 0.05, f * 0.4, 18, 0.07);
    tone(540, 0.16, 'triangle', 0.1, 180);
    setTimeout(() => tone(230, 0.3, 'triangle', 0.1, 95), 110);
  };
  const sndStage = () => {
    tone(392, 0.13, 'square', 0.09, 392);
    setTimeout(() => tone(523, 0.15, 'square', 0.09, 523), 120);
    setTimeout(() => tone(659, 0.3, 'square', 0.11, 659), 250);
  };
  const sndFanfare = () => {
    setTimeout(() => tone(523, 0.12, 'square', 0.09, 523), 60);
    setTimeout(() => tone(659, 0.12, 'square', 0.09, 659), 240);
    setTimeout(() => tone(784, 0.18, 'square', 0.1, 784), 420);
    setTimeout(() => tone(1047, 0.4, 'square', 0.12, 1047), 620);
  };
  const sndEngine = () => {
    tone(95, 0.3, 'sawtooth', 0.06, 55);
    setTimeout(() => tone(72, 0.25, 'triangle', 0.05, 48), 90);
  };
  const sndSat = () => {
    tone(720, 0.06, 'square', 0.06, 720);
    setTimeout(() => tone(1080, 0.08, 'square', 0.05, 1080), 80);
  };
  const sndAst = () => {
    noise(0.2, 0.06, 300, 0.5);
    tone(80, 0.15, 'triangle', 0.06, 60);
  };
  const sndPlanet = () => {
    tone(60, 0.35, 'sine', 0.1, 30);
  };
  const sndGrowl = () => {
    tone(120, 0.25, 'sawtooth', 0.07, 60);
    setTimeout(() => tone(95, 0.2, 'sawtooth', 0.05, 50), 120);
  };
  const sndBeep = () => tone(620, 0.09, 'square', 0.08, 620);
  const sndSizzle = () => {
    noise(0.16, 0.1, 1400, 1.1);
    setTimeout(() => noise(0.1, 0.08, 900, 0.8), 80);
  };
  const sndHowl = () => {
    tone(220, 0.3, 'sine', 0.06, 140);
    setTimeout(() => tone(180, 0.28, 'sine', 0.05, 120), 110);
  };

  function reset() {
    game.birdY = GAME_H * 0.47;
    game.vel = 0;
    game.rot = 0;
    game.wing = 0;
    game.pipes = [];
    game.nextPipeX = GAME_W + 260;
    game.crows = [];
    game.nextCrowX = GAME_W + 260;
    game.snakes = [];
    game.nextSnakeX = GAME_W + 260;
    game.sharks = [];
    game.nextSharkX = GAME_W + 260;
    game.waves = [];
    game.nextWaveX = GAME_W + 260;
    game.splashes = [];
    game.balls = [];
    game.nextBallX = GAME_W + 260;
    game.lightnings = [];
    game.lightningTimer = 2.5;
    game.netters = [];
    game.nextNetX = GAME_W + 260;
    game.planes = [];
    game.nextPlaneX = GAME_W + 260;
    game.satellites = [];
    game.nextSatX = GAME_W + 260;
    game.asteroids = [];
    game.nextAstX = GAME_W + 260;
    game.planets = [];
    game.nextPlanetX = GAME_W + 260;
    game.plants = [];
    game.nextPlantX = GAME_W + 260;
    game.lava = [];
    game.nextLavaX = GAME_W + 260;
    game.volcanoCount = 0;
    game.volcanoEmbers = [];
    game.volcanoSparks = [];
    game.nextSparkT = 2.5;
    game.sparkWarnT = 0;
    game.hurricanes = [];
    game.nextHurricaneX = GAME_W + 260;
    game.hurricaneCount = 0;
    game.zombies = [];
    game.zombieCount = 0;
    game.sewerRunX = BIRD_X;
    game.sewerFacing = 1;
    game.swordSwing = 0;
    game.swordCd = 0;
    game.nextZombieT = 1.0;
    game.moveLeft = false;
    game.moveRight = false;
    game.sewerWinT = null;
    game.stage = 1;
    game.stageBanner = 0;
    game.teleported = false;
    game.launchT = 0;
    game.launchX = BIRD_X;
    game.launchFeatherAcc = 0;
    game.countT = 0;
    game.lastCount = -1;
    game.spaceReadyT = 0;
    game.lastReadyCount = -1;
    game.nestActive = false;
    game.eggs = [true, true];
    game.eggBounce = [0, 0];
    game.eggCr = [0, 0];
    game.rats = [];
    game.poofs = [];
    game.ratsSaved = 0;
    game.nextRatT = 1.4;
    game.nestT = 0;
    game.nestFlyT = 0;
    game.nestEnding = null;
    game.nestEndT = 0;
    game.nestLook = 0;
    game.nestLookTarget = 0;
    game.nestHop = 0;
    game.nestHopSide = 0;
    game.invuln = 0;
    game.dist = 0;
    game.score = 0;
    game.newRecord = false;
    game.shake = 0;
    game.flash = 0;
    game.overlay = 0;
    game.dieT = 0;
    game.birdX = BIRD_X;
    game.scorePop = 0;
    game.lastScore = 0;
    game.warp = 0;
    game.floaters = [];
    game.nextFloaterT = 0.5;
  }

  function doFlap() {
    game.vel = FLAP;
    game.wing = -1.05;
    game.flapPulse = 1;
    sndFlap();
    spawnFeathers(2 + Math.floor(Math.random() * 2));
  }

  function startRun() {
    reset();
    game.mode = 'play';
    doFlap();
  }

  function startRunIntro() {
    reset();
    game.mode = 'intro';
    game.introT = 0;
  }

  function startNest() {
    game.pipes = [];
    game.crows = [];
    game.snakes = [];
    game.sharks = [];
    game.waves = [];
    game.splashes = [];
    game.balls = [];
    game.lightnings = [];
    game.lightningTimer = 2.5;
    game.netters = [];
    game.planes = [];
    game.satellites = [];
    game.asteroids = [];
    game.planets = [];
    game.plants = [];
    game.hurricanes = [];
    game.nextHurricaneX = game.dist + GAME_W + 260;
    game.hurricaneCount = 0;
    game.feathers = [];
    game.nestActive = true;
    game.eggs = [true, true];
    game.eggBounce = [0, 0];
    game.eggCr = [0, 0];
    game.rats = [];
    game.poofs = [];
    game.ratsSaved = 0;
    game.nextRatT = 1.2;
    game.nestT = 0;
    game.nestFlyT = 0;
    game.nestEnding = null;
    game.nestEndT = 0;
    game.nestLook = 0;
    game.nestLookTarget = 0;
    game.nestHop = 0;
    game.nestHopSide = 0;
    game.countT = 0;
    game.lastCount = -1;
    game.groundOffset = 0;
    game.dayPhase = 0.06;
    game.invuln = 0;
    game.warp = 0;
    game.scorePop = 0;
    game.lastScore = 0;
    game.mode = 'nestFly';
  }

  function startTajFly() {
    game.stage = 1;
    game.pipes = [];
    game.crows = [];
    game.snakes = [];
    game.sharks = [];
    game.waves = [];
    game.splashes = [];
    game.balls = [];
    game.lightnings = [];
    game.lightningTimer = 2.5;
    game.netters = [];
    game.planes = [];
    game.satellites = [];
    game.asteroids = [];
    game.planets = [];
    game.plants = [];
    game.poofs = [];
    game.nestActive = false;
    game.rats = [];
    game.eggs = [true, true];
    game.eggBounce = [0, 0];
    game.eggCr = [0, 0];
    game.lava = [];
    game.hurricanes = [];
    game.zombies = [];
    game.zombieCount = 0;
    game.sewerWinT = null;
    game.feathers = [];
    game.floaters = [];
    game.nextFloaterT = 0.5;
    game.tajT = 0;
    game.tajX = -90;
    game.tajY = GAME_H * 0.3;
    game.tajFeatherAcc = 0;
    game.tajCam = -90 - 110;
    game.tajCelebrating = false;
    game.rot = -0.25;
    game.wing = 0.8;
    game.vel = 0;
    game.stageBanner = 0;
    game.dayPhase = 0.32;
    game.overlay = 0;
    game.mode = 'tajFly';
    setTimeout(() => sndBudgieCheep(), 250);
  }

  const TAJ_FLY_LAND = 2100;
  const TAJ_FLY_SPEED = 300;
  const TAJ_FLY_CELEBRATE = 8.2;
  const TAJ_CAM_FINAL = TAJ_FLY_LAND - GAME_W / 2;

  function updateTajFly(f) {
    const dt = f * 0.016;
    game.tajT += dt;

    // --- PHASE 1: flying east across the world toward the Taj Mahal ---
    if (game.tajT < 5.2) {
      // ease from rest up to cruising speed
      const speedK = clamp(game.tajT / 1.2, 0, 1);
      game.tajX += TAJ_FLY_SPEED * (0.35 + 0.65 * speedK) * dt;
      // gentle swell + bob as she soars
      game.tajY = GAME_H * 0.30 + Math.sin(game.tajT * 1.6) * 22
        - Math.sin(game.tajT * 0.5) * 14;
      // camera keeps her roughly one third from the left
      game.tajCam = game.tajX - 130;
      game.rot = 0.06 + Math.sin(game.tajT * 1.6) * 0.06;
      game.wing = Math.sin(game.tajT * 24) * 0.85;
      game.stretchX = 1 + 0.1 * Math.sin(game.tajT * 24);
      game.stretchY = 1 - 0.1 * Math.sin(game.tajT * 24);
      // trail of feathers
      game.tajFeatherAcc += dt;
      if (game.tajFeatherAcc > 0.06) {
        game.tajFeatherAcc = 0;
        spawnFeathers(1, game.tajX - game.tajCam, game.tajY);
      }
    }
    // --- PHASE 2: she arrives and loops down to land on the dome ---
    else if (game.tajT < TAJ_FLY_CELEBRATE) {
      const t = (game.tajT - 5.2) / (TAJ_FLY_CELEBRATE - 5.2);
      const e = 1 - Math.pow(1 - t, 3);
      const w0 = game.tajX;
      const c0 = game.tajCam;
      const y0 = game.tajY;
      // world x eases toward the Taj while the camera frames it center-screen
      game.tajX = w0 + (TAJ_FLY_LAND - w0) * e;
      game.tajCam = c0 + (TAJ_CAM_FINAL - c0) * e;
      // glide down onto the dome with a gentle arc
      game.tajY = y0 + (GAME_H * 0.335 - y0) * e - 70 * Math.sin(Math.PI * t) * (1 - t * 0.4);
      const settle = clamp((t - 0.8) / 0.2, 0, 1);
      game.rot = -0.35 * (1 - settle) + 0.05 * settle;
      game.wing = Math.sin(game.tajT * 26) * (1.1 - 1.0 * t);
      game.stretchX += (1 - game.stretchX) * Math.min(1, 0.18 * f);
      game.stretchY += (1 - game.stretchY) * Math.min(1, 0.18 * f);
      if (t > 0.5 && !game.tajCelebrating) {
        game.tajCelebrating = true;
        sndFanfare();
      }
      if (t >= 0.92 && game.mode === 'tajFly') {
        game.tajCelebrating = false;
        returnToLoop();
        return;
      }
    }
  }

  const CUTSCENES = [
    { name: 'Taj Mahal flight', go: () => startTajFly() },
    { name: 'Fly to the nest', go: () => startNest() },
    { name: 'Launch to space', go: () => jumpToStage(9) },
    { name: 'Volcano', go: () => startVolcano() },
    { name: 'Hurricane', go: () => startHurricane() },
    { name: 'Sewer', go: () => startSewer() },
  ];

  function startCutScene(i) {
    game.cutSceneMenu = false;
    const cs = CUTSCENES[i];
    if (cs) cs.go();
  }

  function returnToLoop() {
    game.stage = 1;
    game.score = 0;
    game.pipes = [];
    game.crows = [];
    game.snakes = [];
    game.sharks = [];
    game.waves = [];
    game.splashes = [];
    game.balls = [];
    game.lightnings = [];
    game.lightningTimer = 2.5;
    game.netters = [];
    game.planes = [];
    game.satellites = [];
    game.asteroids = [];
    game.planets = [];
    game.plants = [];
    game.poofs = [];
    game.nestActive = false;
    game.rats = [];
    game.lava = [];
    game.nextLavaX = game.dist + GAME_W + 260;
    game.volcanoCount = 0;
    game.volcanoEmbers = [];
    game.volcanoSparks = [];
    game.nextSparkT = 2.5;
    game.sparkWarnT = 0;
    game.hurricanes = [];
    game.nextHurricaneX = game.dist + GAME_W + 260;
    game.hurricaneCount = 0;
    game.zombies = [];
    game.zombieCount = 0;
    game.sewerTarget = null;
    game.swordSwing = 0;
    game.swordCd = 0;
    game.nextZombieT = 1.0;
    game.nextPipeX = game.dist + GAME_W + 260;
    game.nextCrowX = game.dist + GAME_W + 260;
    game.nextSnakeX = game.dist + GAME_W + 260;
    game.nextSharkX = game.dist + GAME_W + 260;
    game.nextBallX = game.dist + GAME_W + 260;
    game.nextNetX = game.dist + GAME_W + 260;
    game.nextPlaneX = game.dist + GAME_W + 260;
    game.nextSatX = game.dist + GAME_W + 260;
    game.nextAstX = game.dist + GAME_W + 260;
    game.nextPlanetX = game.dist + GAME_W + 260;
    game.nextPlantX = game.dist + GAME_W + 260;
    game.stageBanner = 2.6;
    game.invuln = 3;
    game.warp = 1;
    game.mode = 'play';
    doFlap();
    sndStage();
  }

  function startVolcano() {
    game.stage = 14;
    game.pipes = [];
    game.crows = [];
    game.snakes = [];
    game.sharks = [];
    game.waves = [];
    game.splashes = [];
    game.balls = [];
    game.lightnings = [];
    game.lightningTimer = 2.5;
    game.netters = [];
    game.planes = [];
    game.satellites = [];
    game.asteroids = [];
    game.planets = [];
    game.plants = [];
    game.poofs = [];
    game.nestActive = false;
    game.rats = [];
    game.eggs = [true, true];
    game.eggBounce = [0, 0];
    game.eggCr = [0, 0];
    game.lava = [];
    game.nextLavaX = game.dist + GAME_W + 260;
    game.volcanoCount = 0;
    game.volcanoEmbers = [];
    game.volcanoSparks = [];
    game.nextSparkT = 2.5;
    game.sparkWarnT = 0;
    game.hurricanes = [];
    game.nextHurricaneX = game.dist + GAME_W + 260;
    game.hurricaneCount = 0;
    game.zombies = [];
    game.zombieCount = 0;
    game.swordCd = 0;
    game.swordSwing = 0;
    game.stageBanner = 2.6;
    game.invuln = 3;
    game.warp = 1;
    game.mode = 'play';
    doFlap();
    sndStage();
  }

  function startHurricane() {
    game.stage = 15;
    game.pipes = [];
    game.crows = [];
    game.snakes = [];
    game.sharks = [];
    game.waves = [];
    game.splashes = [];
    game.balls = [];
    game.lightnings = [];
    game.lightningTimer = 2.5;
    game.netters = [];
    game.planes = [];
    game.satellites = [];
    game.asteroids = [];
    game.planets = [];
    game.plants = [];
    game.poofs = [];
    game.nestActive = false;
    game.rats = [];
    game.eggs = [true, true];
    game.eggBounce = [0, 0];
    game.eggCr = [0, 0];
    game.lava = [];
    game.nextLavaX = game.dist + GAME_W + 260;
    game.volcanoCount = 0;
    game.volcanoEmbers = [];
    game.volcanoSparks = [];
    game.nextSparkT = 2.5;
    game.sparkWarnT = 0;
    game.hurricanes = [];
    game.nextHurricaneX = game.dist + GAME_W + 260;
    game.hurricaneCount = 0;
    game.zombies = [];
    game.zombieCount = 0;
    game.swordCd = 0;
    game.swordSwing = 0;
    game.nextZombieT = 1.0;
    game.stageBanner = 2.6;
    game.invuln = 3;
    game.warp = 1;
    game.mode = 'play';
    doFlap();
    sndStage();
  }

  function startSewer() {
    game.stage = 16;
    game.pipes = [];
    game.crows = [];
    game.snakes = [];
    game.sharks = [];
    game.waves = [];
    game.splashes = [];
    game.balls = [];
    game.lightnings = [];
    game.lightningTimer = 2.5;
    game.netters = [];
    game.planes = [];
    game.satellites = [];
    game.asteroids = [];
    game.planets = [];
    game.plants = [];
    game.poofs = [];
    game.nestActive = false;
    game.rats = [];
    game.eggs = [true, true];
    game.eggBounce = [0, 0];
    game.eggCr = [0, 0];
    game.lava = [];
    game.nextLavaX = game.dist + GAME_W + 260;
    game.volcanoCount = 0;
    game.volcanoEmbers = [];
    game.volcanoSparks = [];
    game.nextSparkT = 2.5;
    game.sparkWarnT = 0;
    game.hurricanes = [];
    game.nextHurricaneX = game.dist + GAME_W + 260;
    game.hurricaneCount = 0;
    game.zombies = [];
    game.zombieCount = 0;
    game.nextZombieT = 0.9;
    game.swordCd = 0;
    game.swordSwing = 0;
    game.sewerRunX = GAME_W / 2;
    game.sewerFacing = 1;
    game.sewerWalk = 0;
    game.sewerTarget = null;
    game.birdY = SEWER_GROUND - 16;
    game.birdX = BIRD_X;
    game.rot = 0;
    game.vel = 0;
    game.groundOffset = 0;
    game.dayPhase = 0.12;
    game.stageBanner = 2.6;
    game.invuln = 1.2;
    game.warp = 1;
    game.mode = 'sewer';
    sndStage();
    sndBudgieCheep();
  }

  function jumpToStage(n) {
    game.teleported = true;
    game.stage = n;
    game.score = n === 3 ? 35 : n === 1 ? 5 : n === 2 ? 15 : n === 4 ? 45 : n === 5 ? 60 : n === 6 ? 75 : n === 7 ? 85 : n === 8 ? 95 : n === 9 ? 105 : n === 10 ? 115 : n === 11 ? 125 : n === 13 ? 145 : n === 15 ? 155 : 1;
    game.pipes = [];
    game.crows = [];
    game.snakes = [];
    game.sharks = [];
    game.waves = [];
    game.balls = [];
    game.lightnings = [];
    game.netters = [];
    game.planes = [];
    game.satellites = [];
    game.asteroids = [];
    game.planets = [];
    game.plants = [];
    game.lava = [];
    game.nextLavaX = game.dist + GAME_W + 260;
    game.volcanoEmbers = [];
    game.nextPipeX = game.dist + GAME_W + 260;
    game.nextCrowX = game.dist + GAME_W + 260;
    game.nextSnakeX = game.dist + GAME_W + 260;
    game.nextSharkX = game.dist + GAME_W + 260;
    game.nextWaveX = game.dist + GAME_W + 260;
    game.nextBallX = game.dist + GAME_W + 260;
    game.nextNetX = game.dist + GAME_W + 260;
    game.nextPlaneX = game.dist + GAME_W + 260;
    game.nextSatX = game.dist + GAME_W + 260;
    game.nextAstX = game.dist + GAME_W + 260;
    game.nextPlanetX = game.dist + GAME_W + 260;
    game.nextPlantX = game.dist + GAME_W + 260;
    game.stageBanner = 2.6;
    game.invuln = 3;
    game.warp = 1;
    sndStage();
  }

  function die() {
    game.mode = 'over';
    game.overAt = performance.now();
    game.dieT = 0;
    game.birdX = game.nestActive ? NEST_X : game.stage === 16 ? game.sewerRunX : BIRD_X;
    game.shake = 0;
    game.flash = 1;
    sndHit();
    sndDie();
    if (game.score > game.best) {
      game.best = game.score;
      game.newRecord = true;
      try {
        localStorage.setItem(BEST_KEY, String(game.best));
      } catch (e) {}
    }
  }

  function flap() {
    if (game.mode === 'ready') {
      startRun();
    } else if (game.mode === 'intro') {
      startRun();
    } else if (game.mode === 'sewer') {
      sewerSlash();
    } else if (game.mode === 'play') {
      doFlap();
    } else if (game.mode === 'over') {
      if (performance.now() - game.overAt > RESTART_DELAY) startRunIntro();
    }
  }

  function spawnRat() {
    const side = Math.random() < 0.5 ? 'L' : 'R';
    const sp = 0.85 + Math.random() * 0.3;
    game.rats.push({
      side: side,
      x: side === 'L' ? NEST_X - 24 : NEST_X + 24,
      y: SKY_H - 6,
      sp: sp,
      w: side === 'L' ? 1 : -1,
      state: 'walk',
      t: Math.random() * 10,
      rot: 0,
      dangerT: 0,
      scaredVx: 0,
      scaredVy: 0,
    });
  }

  function updateRats(f) {
    if (game.nestEnding === 'win') {
      for (const r of game.rats) {
        if (r.state === 'walk' || r.state === 'danger') {
          r.state = 'scared';
          r.scaredVx = (r.side === 'L' ? -1 : 1) * 4;
          r.scaredVy = -5;
          spawnPoof(r.x, r.y);
        }
      }
    }
    for (const r of game.rats) {
      r.t += f * 0.016;
      if (r.state === 'walk') {
        r.y -= r.sp * f;
        r.x = (r.side === 'L' ? NEST_X - 24 : NEST_X + 24) + Math.sin(r.t * 12) * 1.6;
        if (r.y <= NEST_Y + RAT_DANGER) {
          r.state = 'danger';
          r.dangerT = RAT_WINDOW;
        }
      } else if (r.state === 'danger') {
        r.y -= r.sp * 0.22 * f;
        r.x = r.side === 'L' ? NEST_X - 24 : NEST_X + 24;
        r.dangerT -= f * 0.016;
        if (r.dangerT <= 0) ratBite(r);
      } else if (r.state === 'scared') {
        r.x += r.scaredVx * f;
        r.y += r.scaredVy * f;
        r.scaredVy += 0.28 * f;
        r.rot += (r.side === 'L' ? -1 : 1) * 0.2 * f;
      } else if (r.state === 'retreat') {
        r.y += r.sp * 1.4 * f;
        r.x = r.side === 'L' ? NEST_X - 24 : NEST_X + 24;
      }
    }
    game.rats = game.rats.filter((r) => {
      if (r.state === 'scared' && (r.x < -70 || r.x > GAME_W + 70 || r.y > GAME_H + 90)) return false;
      if (r.state === 'retreat' && r.y > GAME_H + 40) return false;
      return true;
    });
  }

  function ratBite(r) {
    sndCrack();
    game.shake = Math.max(game.shake, 0.16);
    let idx = r.side === 'L' ? 0 : 1;
    if (!game.eggs[idx]) idx = idx === 0 ? 1 : 0;
    if (game.eggs[idx]) {
      game.eggs[idx] = false;
      game.eggCr[idx] = 0.0001;
      game.eggBounce[idx === 0 ? 1 : 0] = 1;
      spawnCrack(NEST_X + (idx === 0 ? -24 : 24), NEST_Y - 22);
    }
    game.nestLookTarget = r.side === 'L' ? -1 : 1;
    game.nestHop = 1;
    game.nestHopSide = r.side === 'L' ? -1 : 1;
    r.state = 'retreat';
    r.vx = (r.side === 'L' ? -1 : 1) * 5.5;
    if (!game.eggs[0] && !game.eggs[1]) {
      game.nestEnding = 'lose';
      game.nestEndT = 0;
      game.shake = 0.4;
      game.flash = 0.8;
      sndDie();
    }
  }

  function pressNestButton(side) {
    if (game.mode !== 'nest' || game.nestEnding) return;
    game.nestLookTarget = side === 'L' ? -1 : 1;
    game.nestHop = 1;
    game.nestHopSide = side === 'L' ? -1 : 1;
    let hit = null;
    for (const r of game.rats) {
      if (r.state === 'danger' && r.side === side) {
        hit = r;
        break;
      }
    }
    if (hit) {
      hit.state = 'scared';
      hit.scaredVx = (hit.side === 'L' ? -1 : 1) * (4.2 + Math.random() * 1.6);
      hit.scaredVy = -3.4 - Math.random() * 1.4;
      hit.rot = 0;
      game.ratsSaved++;
      game.eggBounce[0] = 1;
      game.eggBounce[1] = 1;
      sndSqueak();
      spawnPoof(hit.x, hit.y);
    }
  }

  function spawnPoof(x, y) {
    for (let i = 0; i < 6; i++) {
      game.poofs.push({
        x: x,
        y: y,
        vx: (Math.random() * 2 - 1) * 3,
        vy: -Math.random() * 3 - 1,
        r: 3 + Math.random() * 4,
        life: 0.35 + Math.random() * 0.25,
        age: 0,
        rot: Math.random() * Math.PI,
        vr: (Math.random() * 2 - 1) * 0.4,
        col: '#cfd8e3',
      });
    }
  }

  function spawnCrack(x, y) {
    for (let i = 0; i < 7; i++) {
      game.poofs.push({
        x: x,
        y: y,
        vx: (Math.random() * 2 - 1) * 3.4,
        vy: -Math.random() * 3 - 1.5,
        r: 2 + Math.random() * 2.5,
        life: 0.5 + Math.random() * 0.3,
        age: 0,
        rot: Math.random() * Math.PI,
        vr: (Math.random() * 2 - 1) * 0.5,
        col: '#f3ead0',
      });
    }
  }

  const FEATHER_PALETTE = ['#FFE96B', '#FBD849', '#F2C93D', '#FFEF8A', '#F5C83C'];
  function spawnFeathers(n, x, y) {
    const bx = x === undefined ? BIRD_X : x;
    const by = y === undefined ? game.birdY : y;
    for (let i = 0; i < n; i++) {
      game.feathers.push({
        x: bx - 4 + (Math.random() * 14 - 7),
        y: by - 2 + (Math.random() * 12 - 6),
        vx: -(45 + Math.random() * 70),
        vy: -(30 + Math.random() * 55),
        rot: Math.random() * Math.PI * 2,
        vr: Math.random() * 6 - 3,
        size: 2.2 + Math.random() * 2.2,
        life: 1.0 + Math.random() * 0.7,
        age: 0,
        color: FEATHER_PALETTE[Math.floor(Math.random() * FEATHER_PALETTE.length)],
      });
    }
  }

  // ================= SEWER (walk & slash the zombies) =================
  const SEWER_GOO_COLORS = ['#6fbf4a', '#5a9a38', '#8fd96f', '#42a63a'];
  function spawnGreenGoo(x, y) {
    for (let i = 0; i < 9; i++) {
      game.poofs.push({
        x: x + (Math.random() * 24 - 12),
        y: y - 6,
        vx: (Math.random() * 2 - 1) * 150,
        vy: -(60 + Math.random() * 140),
        r: 2 + Math.random() * 3,
        age: 0,
        life: 0.5 + Math.random() * 0.35,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() * 2 - 1) * 0.5,
        col: SEWER_GOO_COLORS[Math.floor(Math.random() * SEWER_GOO_COLORS.length)],
      });
    }
  }

  function spawnZombieSewer() {
    const side = Math.random() < 0.42 ? 'L' : 'R';
    const hp = game.zombieCount >= 3 && Math.random() < 0.22 ? 2 : 1;
    game.zombies.push({
      x: side === 'L' ? -40 : GAME_W + 40,
      y: SEWER_GROUND - 12,
      vx: (side === 'L' ? 1 : -1) * (0.8 + Math.random() * 0.7 + game.zombieCount * 0.02),
      hp: hp,
      t: Math.random() * 10,
      phase: Math.random() * Math.PI * 2,
      side: side,
      state: 'walk',
      hurtT: 0,
    });
  }

  function sewerSlash() {
    if (game.swordCd > 0) return;
    game.swordCd = SEWER_SWORD_CD;
    game.swordSwing = 1;
    game.nestHop = 1;
    sndSlash();
    const reach = SEWER_SWORD_REACH;
    for (const z of game.zombies) {
      if (z.state !== 'walk') continue;
      const dx = z.x - game.sewerRunX;
      const inRange = game.sewerFacing === 1 ? dx > -8 && dx < reach : dx < 8 && dx > -reach;
      if (!inRange) continue;
      z.hp--;
      z.hurtT = 1;
      if (z.hp <= 0) {
        z.state = 'dead';
        z.vy = -3.2;
        game.zombieCount++;
        game.score++;
        sndScore();
        spawnGreenGoo(z.x, z.y);
      } else {
        z.state = 'hurt';
        z.vx = -z.vx * 0.45;
      }
    }
  }

  function updateSewerGame(f) {
    game.swordCd = Math.max(0, game.swordCd - f * 0.016);
    game.swordSwing = Math.max(0, game.swordSwing - 0.046 * f);

    // Arrow/dpad keys still steer manually; otherwise chase the nearest zombie
    const dir = (game.moveRight ? 1 : 0) - (game.moveLeft ? 1 : 0);
    if (game.sewerTarget && (game.sewerTarget.state !== 'walk' || !game.zombies.includes(game.sewerTarget))) {
      game.sewerTarget = null;
    }
    if (!game.sewerTarget && dir === 0) {
      const walkers = game.zombies.filter((z) => z.state === 'walk');
      let bestD = Infinity;
      for (const z of walkers) {
        const d = Math.abs(z.x - game.sewerRunX);
        if (d < bestD) {
          bestD = d;
          game.sewerTarget = z;
        }
      }
    }
    const nearest = game.sewerTarget;
    let moveDir = 0;
    if (dir !== 0) {
      moveDir = dir;
    } else if (nearest) {
      moveDir = nearest.x > game.sewerRunX ? 1 : -1;
    }
    if (moveDir !== 0) {
      game.sewerFacing = moveDir;
      game.sewerRunX += moveDir * 3.3 * f;
      game.sewerRunX = clamp(game.sewerRunX, SEWER_WALK_X_MIN, SEWER_WALK_X_MAX);
      game.sewerWalk += moveDir * 0.4 * f;
    } else if (nearest) {
      game.sewerFacing = nearest.x < game.sewerRunX ? -1 : 1;
    }
    game.birdX = game.sewerRunX;
    game.birdY = SEWER_GROUND - 16;

    // auto-swing when in reach of the locked-on zombie
    if (nearest && Math.abs(nearest.x - game.sewerRunX) <= SEWER_SWORD_REACH) {
      sewerSlash();
    }

    game.nextZombieT -= f * 0.016;
    if (game.nextZombieT <= 0) {
      spawnZombieSewer();
      game.nextZombieT = Math.max(0.65, 1.5 - game.zombieCount * 0.04);
    }

    for (const z of game.zombies) {
      z.t += f * 0.016;
      if (z.state === 'hurt') {
        z.x += z.vx * f * 0.5;
        z.hurtT -= f * 0.016;
        if (z.hurtT <= 0) z.state = 'walk';
      } else if (z.state === 'walk') {
        z.x += z.vx * f;
      } else if (z.state === 'dead') {
        z.y += z.vy * f;
        z.vy += 0.25 * f;
      }
      z.y += Math.sin(z.t * 7 + z.phase) * 0.5;
    }

    for (const z of game.zombies) {
      if (z.state === 'walk' && Math.abs(z.x - game.sewerRunX) < 25) {
        die();
        return;
      }
    }
    game.zombies = game.zombies.filter((z) => {
      if (z.state === 'dead') return z.y < GAME_H + 30;
      return z.x > -70 && z.x < GAME_W + 70;
    });

    if (game.zombieCount >= SEWER_TARGET) {
      if (game.sewerWinT === null) {
        game.sewerWinT = 1.2;
        sndStage();
      }
      game.sewerWinT -= f * 0.016;
      if (game.sewerWinT <= 0) {
        game.sewerWinT = null;
        game.zombieCount = 0;
        game.zombies = [];
        startTajFly();
      }
      return;
    }
  }

  function spawnSplash(x, y) {
    for (let i = 0; i < 9; i++) {
      game.splashes.push({
        x: x + (Math.random() * 24 - 12),
        y: y - 3,
        vx: (Math.random() * 2 - 1) * 110,
        vy: -(80 + Math.random() * 150),
        r: 2 + Math.random() * 3,
        life: 0.45 + Math.random() * 0.35,
        age: 0,
      });
    }
  }

  function spawnVolcanoSpark() {
    const n = 2 + Math.floor(Math.random() * 2);
    const dx = BIRD_X - (GAME_W - 78);
    for (let i = 0; i < n; i++) {
      game.volcanoSparks.push({
        x: GAME_W - 78 + (Math.random() * 24 - 12),
        y: SKY_H - 246 + (Math.random() * 10 - 4),
        vx: dx * 0.006 + (Math.random() - 0.5) * 1.4,
        vy: -(3.2 + Math.random() * 1.4),
        r: 2.5 + Math.random() * 2.5,
        phase: Math.random() * Math.PI * 2,
        scored: false,
      });
    }
    sndSizzle();
  }

  function ellipseRect(px, py, rx, ry, x, y, w, h) {
    const cx = clamp(px, x, x + w);
    const cy = clamp(py, y, y + h);
    const dx = (px - cx) / rx;
    const dy = (py - cy) / ry;
    return dx * dx + dy * dy < 1;
  }

  function circleEllipseHit(bx, by, rx, ry, cx, cy, cr) {
    const dx = cx - bx;
    const dy = cy - by;
    const len = Math.hypot(dx, dy);
    if (len === 0) return true;
    const ux = dx / len;
    const uy = dy / len;
    const br = 1 / Math.sqrt((ux / rx) * (ux / rx) + (uy / ry) * (uy / ry));
    return len < br + cr;
  }

  function hitTest() {
    const b = { x: BIRD_X, y: game.birdY - 4, rx: BIRD_HIT_RX, ry: BIRD_HIT_RY };
    if (b.y + b.ry > SKY_H) return true;
    if (b.y - b.ry < 0) return true;
    if (game.invuln > 0) return false;
    for (const p of game.pipes) {
      if (b.x + b.rx < p.x || b.x - b.rx > p.x + PIPE_W) continue;
      if (ellipseRect(b.x, b.y, b.rx, b.ry, p.x, -30, PIPE_W, p.gapY + 30)) return true;
      if (ellipseRect(b.x, b.y, b.rx, b.ry, p.x, p.gapY + GAP, PIPE_W, SKY_H - p.gapY - GAP + 30)) return true;
    }
    for (const c of game.crows) {
      if (circleEllipseHit(b.x, b.y, b.rx, b.ry, c.x, c.y, CROW_R - 2)) return true;
    }
    for (const s of game.snakes) {
      if (circleEllipseHit(b.x, b.y, b.rx, b.ry, s.hx, s.y, SNAKE_R - 2)) return true;
    }
    for (const h of game.sharks) {
      if (h.state !== 1) continue;
      if (circleEllipseHit(b.x, b.y, b.rx, b.ry, h.x, h.y, SHARK_R - 2)) return true;
    }
    for (const w of game.waves) {
      if (circleEllipseHit(b.x, b.y, b.rx, b.ry, w.x, SKY_H - w.h + w.w * 0.5, w.w * 0.5)) return true;
    }
    for (const bl of game.balls) {
      if (circleEllipseHit(b.x, b.y, b.rx, b.ry, bl.x, bl.y, BALL_R - 2)) return true;
    }
    for (const n of game.netters) {
      if (circleEllipseHit(b.x, b.y, b.rx, b.ry, n.x, n.y, NET_R - 3)) return true;
    }
    for (const pl of game.planes) {
      const dx = (b.x - pl.x) / (PLANE_LEN + b.rx);
      const dy = (b.y - pl.y) / (PLANE_THICK + b.ry);
      if (dx * dx + dy * dy < 1) return true;
    }
    for (const s of game.satellites) {
      if (circleEllipseHit(b.x, b.y, b.rx, b.ry, s.x, s.y, SAT_R - 2)) return true;
    }
    for (const a of game.asteroids) {
      if (circleEllipseHit(b.x, b.y, b.rx, b.ry, a.x, a.y, a.r - 2)) return true;
    }
    for (const p of game.planets) {
      if (circleEllipseHit(b.x, b.y, b.rx, b.ry, p.x, p.y, p.r - 2)) return true;
    }
    for (const p of game.plants) {
      const chomp = 0.5 + 0.5 * Math.sin(game.t * p.speed + p.phase);
      const pr = p.r * (0.85 + chomp * 0.6);
      if (circleEllipseHit(b.x, b.y, b.rx, b.ry, p.x, p.y, pr - 2)) return true;
    }
    for (const L of game.lava) {
      if (circleEllipseHit(b.x, b.y, b.rx, b.ry, L.x, L.y, L.r - 2)) return true;
    }
    for (const s of game.volcanoSparks) {
      if (circleEllipseHit(b.x, b.y, b.rx, b.ry, s.x, s.y, s.r - 1)) return true;
    }
    for (const H of game.hurricanes) {
      if (circleEllipseHit(b.x, b.y, b.rx, b.ry, H.x, H.y, H.r - 3)) return true;
    }
    return false;
  }

  function update(f) {
    game.t += f * 0.016;

    if (game.score !== game.lastScore) {
      if (game.score > game.lastScore) {
        game.scorePop = 1;
        game.scorePopVel = 1.6;
      }
      game.lastScore = game.score;
    }
    const springK = 0.12;
    const dampK = 0.82;
    game.scorePopVel += (0 - game.scorePop) * springK * f;
    game.scorePopVel *= Math.pow(dampK, f);
    game.scorePop += game.scorePopVel * f * 0.06;
    if (Math.abs(game.scorePop) < 0.001 && Math.abs(game.scorePopVel) < 0.001) {
      game.scorePop = 0;
      game.scorePopVel = 0;
    }
    game.warp = Math.max(0, game.warp - 0.05 * f);

    if (game.mode === 'play' || game.mode === 'intro') {
      for (const c of game.clouds) {
        c.x -= c.sp * f;
        c.x += Math.sin(game.t * c.drift) * 0.4;
        if (c.x < -100) {
          c.x = GAME_W + 100;
          c.y = 30 + Math.random() * 210;
        }
      }
    }

    game.nextBlink -= f * 0.016;
    if (game.nextBlink <= 0) {
      game.blink = 0.12;
      game.nextBlink = 2.2 + Math.random() * 2.6;
    }
    game.blink = Math.max(0, game.blink - f * 0.016);

    game.chirpT -= f * 0.016;
    if (game.chirpT <= 0 && (game.mode === 'play' || game.mode === 'ready')) {
      sndChirp();
      game.chirpT = game.mode === 'ready' ? 2.2 + Math.random() * 3 : 1.6 + Math.random() * 2.4;
    }

    for (const p of game.poofs) {
      p.age += f * 0.016;
      p.x += p.vx * f;
      p.y += p.vy * f;
      p.vy += 0.09 * f;
      p.rot += p.vr * f;
    }
    game.poofs = game.poofs.filter((p) => p.age < p.life);

    if (game.mode === 'play') {
      game.groundOffset += PIPE_SPEED * f;
      game.vel = Math.min(game.vel + GRAVITY * f, MAX_FALL);
      if (game.stage === 4) {
        for (const w of game.waves) {
          const dx = Math.abs(w.x - BIRD_X);
          const reach = w.w * 0.5 + 70;
          if (dx < reach) {
            const hNear = 1 - dx / reach;
            const crestY = SKY_H - w.h;
            if (game.birdY < crestY + 6) {
              const vNear = clamp(1 - (crestY - game.birdY) / (w.h * 1.5), 0, 1);
              game.vel += (0.2 + 0.8 * vNear) * hNear * 0.5 * f;
              game.vel = Math.min(game.vel, MAX_FALL);
            }
          }
        }
      }
      game.birdY += game.vel * f;
      game.flapPulse = Math.max(0, game.flapPulse - 0.07 * f);
      const glide = clamp(game.vel / 9, 0, 1);
      const climb = clamp(-game.vel / 6, 0, 1);
      const pulse = game.flapPulse;
      const flapEase = 1 - Math.pow(1 - pulse, 2.5);
      game.wing = Math.sin(game.t * 24) * 1.15 * (0.9 - glide * 0.3) + glide * 0.35 - pulse * 1.4;
      game.stretchX += (1 + glide * 0.18 - climb * 0.1 - flapEase * 0.35 - game.stretchX) * Math.min(1, 0.18 * f);
      game.stretchY += (1 + climb * 0.16 - glide * 0.1 + flapEase * 0.4 - game.stretchY) * Math.min(1, 0.18 * f);
      game.rot += (clamp(game.vel * 0.055, -0.48, 1.35) - game.rot) * Math.min(1, 0.12 * f);

      game.dist += PIPE_SPEED * f;
      game.stageBanner = Math.max(0, game.stageBanner - f * 0.016);

      for (const p of game.pipes) p.x -= PIPE_SPEED * f;
      game.pipes = game.pipes.filter((p) => p.x + PIPE_W > -30);

      for (const c of game.crows) {
        c.x -= PIPE_SPEED * c.sp * f;
        c.y = c.y0 + Math.sin(game.t * 2.2 + c.phase) * c.amp;
      }
      game.crows = game.crows.filter((c) => c.x > -60);

      for (const s of game.snakes) {
        s.x -= PIPE_SPEED * f;
        if (s.state === 0) {
          s.y += s.sp * f;
          if (s.y >= s.targetY) {
            s.state = 1;
            sndHiss();
          }
        } else {
          s.y -= s.sp * 1.9 * f;
        }
        s.hx = s.x + Math.sin(game.t * 3 + s.phase) * 10;
      }
      game.snakes = game.snakes.filter((s) => s.y > -60 && s.x > -80);

      for (const h of game.sharks) {
        h.x -= PIPE_SPEED * h.sp * f;
        if (h.state === 0) {
          if (h.x < h.triggerX) {
            h.state = 1;
            spawnSplash(h.x, SKY_H);
            sndSplash();
          }
        } else {
          h.t += f / h.dur;
          h.y = SKY_H - Math.sin(Math.min(1, h.t) * Math.PI) * h.jumpH;
          if (h.t >= 1) {
            spawnSplash(h.x, SKY_H);
            h.done = true;
          }
        }
      }
      game.sharks = game.sharks.filter((h) => !h.done && h.x > -80);

      for (const w of game.waves) {
        w.x -= PIPE_SPEED * w.sp * f;
      }
      game.waves = game.waves.filter((w) => w.x + w.w > -40);

      for (const bl of game.balls) {
        bl.x -= PIPE_SPEED * bl.sp * f;
        if (bl.amp > 0) bl.y = bl.y0 + Math.sin(game.t * 3 + bl.phase) * bl.amp;
        bl.rot += bl.vr * f;
      }
      game.balls = game.balls.filter((bl) => bl.x > -40);

      for (const n of game.netters) {
        n.x -= NET_SPEED * n.sp * f;
        n.phase += f * 0.016;
        const dy = game.birdY - n.y;
        const step = clamp(dy * 0.05, -2.0, 2.0) * f;
        n.y += step;
      }
      game.netters = game.netters.filter((n) => n.x > -60);

      for (const pl of game.planes) {
        pl.x -= PIPE_SPEED * pl.sp * f;
        pl.y = pl.y0 + Math.sin(game.t * 2.6 + pl.phase) * pl.amp;
      }
      game.planes = game.planes.filter((pl) => pl.x > -140);

      for (const s of game.satellites) {
        s.x -= PIPE_SPEED * s.sp * f;
        s.y = s.yc + Math.sin(s.x * s.orbitK + s.phase) * s.orbitR;
        s.rot += 0.02 * f;
      }
      game.satellites = game.satellites.filter((s) => s.x > -80);

      for (const a of game.asteroids) {
        a.x -= PIPE_SPEED * a.sp * f;
        a.y += a.dy * f;
        a.rot += a.vr * f;
        if (a.y < 45 || a.y > SKY_H - 45) a.dy *= -1;
      }
      game.asteroids = game.asteroids.filter((a) => a.x > -80);

      for (const p of game.planets) {
        p.x -= PIPE_SPEED * p.sp * f;
        p.rot += 0.02 * f;
      }
      game.planets = game.planets.filter((p) => p.x > -100);

      for (const p of game.plants) {
        p.x -= PIPE_SPEED * p.sp * f;
        p.y += clamp((game.birdY - p.y) * 0.015, -0.9, 0.9) * f;
        p.y += Math.sin(game.t * 2.6 + p.phase) * 0.5 * f;
      }
      game.plants = game.plants.filter((p) => p.x > -80);

      for (const p of game.pipes) {
        if (!p.scored && p.x + PIPE_W < BIRD_X - BIRD_R) {
          p.scored = true;
          game.score++;
          sndScore();
        }
      }

      for (const c of game.crows) {
        if (!c.scored && c.x + CROW_R < BIRD_X - BIRD_R) {
          c.scored = true;
          game.score++;
          sndScore();
        }
      }

      for (const s of game.snakes) {
        if (!s.scored && s.x + SNAKE_R < BIRD_X - BIRD_R) {
          s.scored = true;
          game.score++;
          sndScore();
        }
      }

      for (const h of game.sharks) {
        if (!h.scored && h.x + SHARK_R < BIRD_X - BIRD_R) {
          h.scored = true;
          game.score++;
          sndScore();
        }
      }

      for (const w of game.waves) {
        if (!w.scored && w.x + w.w * 0.5 < BIRD_X - BIRD_R) {
          w.scored = true;
          game.score++;
          sndScore();
        }
      }

      for (const bl of game.balls) {
        if (!bl.scored && bl.x + BALL_R < BIRD_X - BIRD_R) {
          bl.scored = true;
          game.score++;
          sndScore();
        }
      }

      for (const n of game.netters) {
        if (!n.scored && n.x + NET_R < BIRD_X - BIRD_R) {
          n.scored = true;
          game.score++;
          sndWhoosh();
        }
      }

      for (const pl of game.planes) {
        if (!pl.scored && pl.x + PLANE_LEN < BIRD_X - BIRD_R) {
          pl.scored = true;
          game.score++;
          sndScore();
        }
      }

      for (const s of game.satellites) {
        if (!s.scored && s.x + SAT_R < BIRD_X - BIRD_R) {
          s.scored = true;
          game.score++;
          sndScore();
        }
      }

      for (const a of game.asteroids) {
        if (!a.scored && a.x + a.r < BIRD_X - BIRD_R) {
          a.scored = true;
          game.score++;
          sndScore();
        }
      }

      for (const p of game.planets) {
        if (!p.scored && p.x + p.r < BIRD_X - BIRD_R) {
          p.scored = true;
          game.score++;
          sndScore();
        }
      }

      for (const p of game.plants) {
        if (!p.scored && p.x + p.r < BIRD_X - BIRD_R) {
          p.scored = true;
          game.score++;
          sndScore();
        }
      }

      const ns = stageForScore(game.score);
      if (ns !== game.stage) {
        if (game.stage === 13 && ns === 1) {
          startNest();
          return;
        }
        if (game.stage !== 14 && game.stage !== 15) {
        game.stage = ns;
        game.pipes = [];
        game.crows = [];
        game.snakes = [];
        game.sharks = [];
        game.waves = [];
        game.balls = [];
        game.lightnings = [];
        game.netters = [];
        game.planes = [];
        game.satellites = [];
        game.asteroids = [];
        game.planets = [];
        game.plants = [];
        game.lava = [];
        game.nextLavaX = game.dist + GAME_W + 260;
        game.volcanoEmbers = [];
        game.hurricanes = [];
        game.nextHurricaneX = game.dist + GAME_W + 260;
        game.nextPipeX = game.dist + GAME_W + 260;
        game.nextCrowX = game.dist + GAME_W + 260;
        game.nextSnakeX = game.dist + GAME_W + 260;
        game.nextSharkX = game.dist + GAME_W + 260;
        game.nextWaveX = game.dist + GAME_W + 260;
        game.nextBallX = game.dist + GAME_W + 260;
        game.nextNetX = game.dist + GAME_W + 260;
        game.nextPlaneX = game.dist + GAME_W + 260;
        game.nextSatX = game.dist + GAME_W + 260;
        game.nextAstX = game.dist + GAME_W + 260;
        game.nextPlanetX = game.dist + GAME_W + 260;
        game.nextPlantX = game.dist + GAME_W + 260;
        game.lightningTimer = 2.5;
        game.stageBanner = 2.6;
        game.invuln = 3;
        game.warp = 1;
        sndStage();
        if (ns === 9) {
          game.mode = 'countdown';
          game.countT = 0;
          game.lastCount = -1;
          game.launchT = 0;
          game.launchX = BIRD_X;
          game.launchFeatherAcc = 0;
          game.invuln = 0;
        }
        }
      }

      if (game.invuln > 0) game.invuln = Math.max(0, game.invuln - f * 0.016);

      if (game.stage === 1 || game.stage === 12) {
        while (game.nextPipeX - game.dist < GAME_W + 40) {
          const minTop = 70;
          const maxTop = SKY_H - GAP - 70;
          game.pipes.push({
            x: game.nextPipeX - game.dist,
            gapY: minTop + Math.random() * (maxTop - minTop),
            scored: false,
          });
          game.nextPipeX += PIPE_SPACING;
        }
      } else if (game.stage === 2) {
        let cawed = false;
        while (game.nextCrowX - game.dist < GAME_W + 40) {
          game.crows.push({
            x: game.nextCrowX - game.dist,
            y0: 70 + Math.random() * (SKY_H - 170),
            amp: 14 + Math.random() * 30,
            sp: 1.15 + Math.random() * 0.55,
            phase: Math.random() * Math.PI * 2,
            scored: false,
          });
          game.nextCrowX += 170 + Math.random() * 130;
          cawed = true;
        }
        if (cawed) sndCaw();
      } else if (game.stage === 3) {
        let hissed = false;
        while (game.nextSnakeX - game.dist < GAME_W + 40) {
          game.snakes.push({
            x: game.nextSnakeX - game.dist,
            hx: game.nextSnakeX - game.dist,
            y: -30,
            targetY: 100 + Math.random() * (SKY_H - 200),
            phase: Math.random() * Math.PI * 2,
            sp: 1.6 + Math.random() * 0.9,
            state: 0,
            scored: false,
          });
          game.nextSnakeX += 150 + Math.random() * 140;
          hissed = true;
        }
        if (hissed) sndHiss();
      } else if (game.stage === 4) {
        let splashed = false;
        while (game.nextSharkX - game.dist < GAME_W + 40) {
          game.sharks.push({
            x: game.nextSharkX - game.dist,
            y: SKY_H,
            t: 0,
            sp: 1 + Math.random() * 0.5,
            jumpH: 130 + Math.random() * 120,
            dur: 55 + Math.random() * 40,
            triggerX: 210 + Math.random() * 60,
            phase: Math.random() * Math.PI * 2,
            state: 0,
            scored: false,
            done: false,
          });
          game.nextSharkX += 120 + Math.random() * 90;
          splashed = true;
        }
        if (splashed) sndSplash();
        while (game.nextWaveX - game.dist < GAME_W + 40) {
          game.waves.push({
            x: game.nextWaveX - game.dist,
            w: 150 + Math.random() * 50,
            h: 140 + Math.random() * 90,
            sp: 1 + Math.random() * 0.4,
            phase: Math.random() * Math.PI * 2,
            scored: false,
          });
          game.nextWaveX += 160 + Math.random() * 120;
        }
      } else if (game.stage === 5) {
        let kicked = false;
        while (game.nextBallX - game.dist < GAME_W + 40) {
          if (Math.random() < 0.35) {
            const by = 90 + Math.random() * (SKY_H - 230);
            const sp = 1.5 + Math.random() * 0.7;
            game.balls.push({
              x: game.nextBallX - game.dist,
              y: by,
              y0: by,
              amp: 0,
              sp: sp,
              phase: 0,
              rot: Math.random() * Math.PI * 2,
              vr: (Math.random() * 2 - 1) * 0.25,
              scored: false,
            });
            game.nextBallX += 40;
            game.balls.push({
              x: game.nextBallX - game.dist,
              y: by + 115,
              y0: by + 115,
              amp: 0,
              sp: sp,
              phase: 0,
              rot: Math.random() * Math.PI * 2,
              vr: (Math.random() * 2 - 1) * 0.25,
              scored: false,
            });
            game.nextBallX += 170 + Math.random() * 120;
          } else {
            const by = 70 + Math.random() * (SKY_H - 150);
            game.balls.push({
              x: game.nextBallX - game.dist,
              y0: by,
              y: by,
              amp: Math.random() < 0.4 ? 16 + Math.random() * 26 : 0,
              sp: 1.5 + Math.random() * 0.8,
              phase: Math.random() * Math.PI * 2,
              rot: Math.random() * Math.PI * 2,
              vr: (Math.random() * 2 - 1) * 0.28,
              scored: false,
            });
            game.nextBallX += 160 + Math.random() * 130;
          }
          kicked = true;
        }
        if (kicked) sndKick();
      } else if (game.stage === 7) {
        while (game.nextNetX - game.dist < GAME_W + 40) {
          game.netters.push({
            x: game.nextNetX - game.dist,
            y: game.birdY + (Math.random() * 160 - 80),
            sp: 2.0 + Math.random() * 0.8,
            phase: Math.random() * Math.PI * 2,
            scored: false,
          });
          game.nextNetX += 240 + Math.random() * 140;
        }
      } else if (game.stage === 8) {
        let engined = false;
        while (game.nextPlaneX - game.dist < GAME_W + 40) {
          const py = 70 + Math.random() * (SKY_H - 260);
          game.planes.push({
            x: game.nextPlaneX - game.dist,
            y0: py,
            y: py,
            amp: 30 + Math.random() * 40,
            sp: 2.2 + Math.random() * 0.8,
            phase: Math.random() * Math.PI * 2,
            scored: false,
          });
          game.nextPlaneX += 200 + Math.random() * 110;
          engined = true;
        }
        if (engined) sndEngine();
      } else if (game.stage === 9) {
        let beeped = false;
        while (game.nextSatX - game.dist < GAME_W + 40) {
          const orbitR = 55 + Math.random() * 60;
          const yc = 40 + orbitR + Math.random() * (SKY_H - 80 - orbitR * 2);
          game.satellites.push({
            x: game.nextSatX - game.dist,
            yc: yc,
            y: yc,
            orbitR: orbitR,
            orbitK: 0.008 + Math.random() * 0.006,
            phase: Math.random() * Math.PI * 2,
            sp: 1.9 + Math.random() * 0.6,
            rot: Math.random() * Math.PI * 2,
            scored: false,
          });
          game.nextSatX += 230 + Math.random() * 120;
          beeped = true;
        }
        if (beeped) sndSat();
      } else if (game.stage === 10) {
        let rumbled = false;
        while (game.nextAstX - game.dist < GAME_W + 40) {
          const r = AST_R_MIN + Math.random() * (AST_R_MAX - AST_R_MIN);
          game.asteroids.push({
            x: game.nextAstX - game.dist,
            y: 50 + Math.random() * (SKY_H - 100),
            r: r,
            sp: (26 / r) * (1.1 + Math.random() * 0.6),
            dy: (Math.random() * 2 - 1) * 0.35,
            rot: Math.random() * Math.PI * 2,
            vr: (Math.random() * 2 - 1) * 0.09,
            phase: Math.random() * Math.PI * 2,
            scored: false,
          });
          game.nextAstX += 200 + Math.random() * 130;
          rumbled = true;
        }
        if (rumbled) sndAst();
      } else if (game.stage === 11) {
        let hummed = false;
        while (game.nextPlanetX - game.dist < GAME_W + 40) {
          const r = PLANET_R_MIN + Math.random() * (PLANET_R_MAX - PLANET_R_MIN);
          game.planets.push({
            x: game.nextPlanetX - game.dist,
            y: r + 40 + Math.random() * (SKY_H - 80 - r * 2),
            r: r,
            sp: 1.4 + Math.random() * 0.5,
            rot: Math.random() * Math.PI * 2,
            hue: Math.floor(Math.random() * 5),
            ring: Math.random() < 0.35,
            scored: false,
          });
          game.nextPlanetX += 320 + Math.random() * 160;
          hummed = true;
        }
        if (hummed) sndPlanet();
      } else if (game.stage === 13) {
        let growled = false;
        while (game.nextPlantX - game.dist < GAME_W + 40) {
          const py = 70 + Math.random() * (SKY_H - 150);
          game.plants.push({
            x: game.nextPlantX - game.dist,
            y0: py,
            y: py,
            r: PLANT_R + Math.random() * 4,
            sp: 1.3 + Math.random() * 0.5,
            speed: 1.8 + Math.random() * 1.2,
            phase: Math.random() * Math.PI * 2,
            scored: false,
          });
          game.nextPlantX += 220 + Math.random() * 140;
          growled = true;
        }
        if (growled) sndGrowl();
      } else if (game.stage === 14) {
        let sizzled = false;
        while (game.nextLavaX - game.dist < GAME_W + 40) {
          if (game.lava.length + game.volcanoSparks.length >= 3) break;
          game.lava.push({
            x: game.nextLavaX - game.dist,
            y: 55 + Math.random() * (SKY_H - 160),
            r: 11 + Math.random() * 4,
            sp: 1.7 + Math.random() * 0.7,
            phase: Math.random() * Math.PI * 2,
            scored: false,
          });
          game.nextLavaX += 150 + Math.random() * 110;
          sizzled = true;
        }
        if (sizzled) sndSizzle();
      } else if (game.stage === 15) {
        let howled = false;
        while (game.nextHurricaneX - game.dist < GAME_W + 40) {
          if (game.hurricanes.length >= 3) break;
          game.hurricanes.push({
            x: game.nextHurricaneX - game.dist,
            y: 60 + Math.random() * (SKY_H - 130),
            r: 24 + Math.random() * 7,
            sp: 1.5 + Math.random() * 0.5,
            amp: 16 + Math.random() * 14,
            phase: Math.random() * Math.PI * 2,
            spin: 1.2 + Math.random() * 0.8,
            scored: false,
          });
          game.nextHurricaneX += 260 + Math.random() * 140;
          howled = true;
        }
        if (howled) sndHowl();
      }

      for (const L of game.lava) {
        L.x -= PIPE_SPEED * L.sp * f;
        L.phase += f * 0.016 * 2.2;
        const dy = game.birdY - L.y;
        L.y += clamp(dy * 0.012, -0.5, 0.5) * L.sp * f;
        L.y += Math.sin(L.phase) * 0.8 * f;
        if (!L.scored && L.x + L.r < BIRD_X - BIRD_R) {
          L.scored = true;
          game.score++;
          game.volcanoCount++;
          sndScore();
        }
      }
      game.lava = game.lava.filter((L) => L.x > -70);

      if (game.stage === 14) {
        game.nextEmberT = (game.nextEmberT || 0) - f * 0.016;
        if (game.nextEmberT <= 0) {
          game.volcanoEmbers.push({
            x: 300 + Math.random() * 120,
            y: SKY_H - 6,
            vx: (Math.random() - 0.5) * 0.5,
            vy: -(0.5 + Math.random() * 0.9),
            life: 1 + Math.random() * 1.2,
            age: 0,
            r: 1.5 + Math.random() * 2,
          });
          game.nextEmberT = 0.12;
        }
      }
      for (const e of game.volcanoEmbers) {
        e.age += f * 0.016;
        e.x += e.vx * f;
        e.y += e.vy * f;
        e.vy -= 0.008 * f;
      }
      game.volcanoEmbers = game.volcanoEmbers.filter((e) => e.age < e.life);

      if (game.stage === 14) {
        game.nextSparkT = (game.nextSparkT || 0) - f * 0.016;
        if (game.nextSparkT <= 0) {
          game.nextSparkT = 1.4 + Math.random() * 1.4;
          game.sparkWarnT = 0.5;
        }
        if (game.sparkWarnT > 0) {
          game.sparkWarnT -= f * 0.016;
          if (game.sparkWarnT <= 0) {
            if (game.lava.length + game.volcanoSparks.length < 3) {
              spawnVolcanoSpark();
            } else {
              game.nextSparkT = 1.4 + Math.random() * 1.4;
            }
          }
        }
      }
      for (const s of game.volcanoSparks) {
        s.x -= PIPE_SPEED * f;
        s.x += s.vx * f;
        s.y += s.vy * f;
        s.vy += 0.1 * f;
        const dy = game.birdY - s.y;
        s.vy += clamp(dy * 0.0045, -0.07, 0.07) * f;
        s.phase += f * 0.016;
        if (!s.scored && s.x + s.r < BIRD_X - BIRD_R) {
          s.scored = true;
          game.score++;
          sndScore();
        }
      }
      game.volcanoSparks = game.volcanoSparks.filter((s) => s.x > -70 && s.y < GAME_H + 40);

      if (game.stage === 14 && game.volcanoCount >= VOLCANO_TARGET) {
        startHurricane();
        return;
      }

      for (const H of game.hurricanes) {
        H.x -= PIPE_SPEED * H.sp * f;
        H.phase += f * 0.016 * H.spin;
        const dy = game.birdY - H.y;
        H.y += clamp(dy * 0.012, -0.5, 0.5) * H.sp * f;
        H.y += Math.sin(H.phase) * H.amp * 0.02 * f;
        if (!H.scored && H.x + H.r < BIRD_X - BIRD_R) {
          H.scored = true;
          game.score++;
          game.hurricaneCount++;
          sndScore();
        }
      }
      game.hurricanes = game.hurricanes.filter((H) => H.x > -90);

      if (game.stage === 15 && game.hurricaneCount >= HURRICANE_TARGET) {
        startSewer();
        return;
      }

      if (game.stage === 6) {
        game.lightningTimer -= f * 0.016;
        if (game.lightningTimer <= 0) {
          game.lightnings.push({
            y: clamp(game.birdY, 70, SKY_H - 70),
            t: 0,
            phase: 0,
            scored: false,
          });
          game.lightningTimer = 2.6 + Math.random() * 1.8;
        }
      }
      for (const L of game.lightnings) {
        L.t += f * 0.016;
        if (L.phase === 0 && L.t >= LIGHT_WARN) {
          L.phase = 1;
          L.t = 0;
          game.shake = Math.max(game.shake, 0.175);
          sndThunder();
        } else if (L.phase === 1 && L.t >= 0.6) {
          L.phase = 2;
          if (!L.scored) {
            L.scored = true;
            game.score++;
            sndScore();
          }
        }
      }
      for (const L of game.lightnings) {
        if (game.invuln > 0) break;
        if (L.phase === 1 && Math.abs(game.birdY - L.y) < 30) {
          die();
          break;
        }
      }
      game.lightnings = game.lightnings.filter((L) => L.phase < 2 || L.t < 1);

      if (hitTest()) die();
    } else if (game.mode === 'sewer') {
      updateSewerGame(f);
    } else if (game.mode === 'tajFly') {
      updateTajFly(f);
    } else if (game.mode === 'countdown') {
      game.countT += f * 0.016;
      const num = 3 - Math.floor(game.countT);
      if (num !== game.lastCount) {
        game.lastCount = num;
        sndBeep();
      }
      // idle on the launch pad while waiting
      game.launchX = GAME_W * 0.5;
      game.birdY = GAME_H * 0.72 + Math.sin(game.t * 2.5) * 4;
      game.rot = 0.05;
      game.wing = Math.sin(game.t * 10) * 0.2;
      game.stretchX = 1;
      game.stretchY = 1;
      if (game.countT >= 3) {
        game.mode = 'launch';
        game.launchT = 0;
        game.launchFeatherAcc = 0;
        sndWhoosh();
      }
    } else if (game.mode === 'launch') {
      game.launchT += f * 0.016;
      const t = Math.min(1, game.launchT / LAUNCH_TIME);
      const e = t * t;
      // flying up, with a gentle sway side to side
      game.launchX = GAME_W * 0.5 + Math.sin(game.launchT * 3.2) * 14;
      game.birdY = GAME_H * 0.72 - e * (GAME_H * 0.72 + 70);
      // flying pose: nose tilted up, strong flapping wings
      game.rot = -0.42 * Math.min(1, t * 2);
      game.wing = Math.sin(game.launchT * 26) * 0.7;
      game.stretchX = 1 - 0.12 * Math.min(1, t * 2);
      game.stretchY = 1 + 0.16 * Math.min(1, t * 2);
      // she sheds feathers as she climbs into space
      game.launchFeatherAcc += f * 0.016;
      if (game.launchFeatherAcc > 0.05) {
        game.launchFeatherAcc = 0;
        spawnFeathers(2, game.launchX, game.birdY);
      }
      if (t >= 1) {
        game.mode = 'spaceReady';
        game.launchT = 0;
        game.spaceReadyT = 0;
        game.lastReadyCount = -1;
        game.birdX = BIRD_X;
        game.launchX = BIRD_X;
        game.birdY = GAME_H * 0.47;
        game.vel = 0;
        game.rot = 0;
        game.flapPulse = 0;
        game.invuln = 0;
      }
    } else if (game.mode === 'spaceReady') {
      game.spaceReadyT += f * 0.016;
      // gentle hover while the player gets ready
      game.birdY = GAME_H * 0.47 + Math.sin(game.t * 2.4) * 9;
      game.rot = Math.sin(game.t * 2.4 + 1) * 0.05;
      game.wing = Math.sin(game.t * 11) * 0.16 + Math.sin(game.t * 5.3) * 0.1;
      game.stretchX += (1 - game.stretchX) * Math.min(1, 0.2 * f);
      game.stretchY += (1 - game.stretchY) * Math.min(1, 0.2 * f);
      // beep on each countdown tick
      const num = 3 - Math.floor(game.spaceReadyT);
      if (num !== game.lastReadyCount) {
        game.lastReadyCount = num;
        sndBeep();
      }
      if (game.spaceReadyT >= 3) {
        game.mode = 'play';
        game.spaceReadyT = 0;
        game.invuln = 3;
        doFlap();
      }
    } else if (game.mode === 'nestFly') {
      game.nestFlyT += f * 0.016;
      const t = Math.min(1, game.nestFlyT / 1.4);
      const e = 1 - Math.pow(1 - t, 3);
      const sx = GAME_W + 70;
      const sy = GAME_H * 0.18;
      game.birdX = sx + (NEST_X - sx) * e;
      game.birdY = sy + (NEST_SIT_Y - sy) * e - 48 * Math.sin(Math.PI * t);
      const settle = clamp((t - 0.72) / 0.28, 0, 1);
      game.rot = 0.35 * (1 - settle) - 0.12 * settle + Math.sin(game.nestFlyT * 30) * 0.04 * (1 - t);
      game.wing = Math.sin(game.nestFlyT * 26) * (1.15 - 0.9 * t);
      game.stretchX = 1 + 0.08 * Math.sin(Math.PI * t);
      game.stretchY = 1 - 0.08 * Math.sin(Math.PI * t);
      game.introFeatherAcc += f * 0.016;
      if (game.introFeatherAcc > 0.05) {
        game.introFeatherAcc = 0;
        spawnFeathers(1, game.birdX, game.birdY);
      }
      if (t >= 1) {
        game.mode = 'nestCountdown';
        game.countT = 0;
        game.lastCount = -1;
        game.birdX = NEST_X;
        game.birdY = NEST_SIT_Y;
        game.stretchX = 1;
        game.stretchY = 1;
        spawnFeathers(10, NEST_X, NEST_SIT_Y);
        sndChirp();
      }
    } else if (game.mode === 'nestCountdown') {
      game.countT += f * 0.016;
      const num = 3 - Math.floor(game.countT);
      if (num !== game.lastCount) {
        game.lastCount = num;
        sndBeep();
      }
      game.nestLook += (0 - game.nestLook) * Math.min(1, 0.15 * f);
      game.birdX = NEST_X;
      game.birdY = NEST_SIT_Y + Math.sin(game.t * 2.4) * 2;
      game.rot = -0.12 + game.nestLook * 0.25;
      game.wing = 0.28 + Math.sin(game.t * 9) * 0.06;
      game.stretchX += (1 - game.stretchX) * Math.min(1, 0.2 * f);
      game.stretchY += (1 - game.stretchY) * Math.min(1, 0.2 * f);
      if (game.countT >= 3) {
        game.mode = 'nest';
        game.nestT = 0;
        game.nextRatT = 1.1;
      }
    } else if (game.mode === 'nest') {
      game.nestT += f * 0.016;
      game.eggBounce[0] = Math.max(0, game.eggBounce[0] - 0.06 * f);
      game.eggBounce[1] = Math.max(0, game.eggBounce[1] - 0.06 * f);
      if (!game.eggs[0]) game.eggCr[0] = Math.min(1, game.eggCr[0] + f * 0.016);
      if (!game.eggs[1]) game.eggCr[1] = Math.min(1, game.eggCr[1] + f * 0.016);
      // she looks at whichever side has a rat in danger, and lunges on a press
      game.nestHop = Math.max(0, game.nestHop - 0.05 * f);
      let look = 0;
      const dL = game.rats.some((r) => r.state === 'danger' && r.side === 'L');
      const dR = game.rats.some((r) => r.state === 'danger' && r.side === 'R');
      if (dL && dR) look = Math.sin(game.t * 2) > 0 ? -1 : 1;
      else if (dL) look = -1;
      else if (dR) look = 1;
      if (game.nestHop > 0.05) look = game.nestLookTarget;
      game.nestLook += (look - game.nestLook) * Math.min(1, 0.15 * f);
      const hopK = Math.sin(Math.min(1, game.nestHop) * Math.PI);
      game.birdX = NEST_X + game.nestLook * 10 + game.nestHopSide * hopK * 16;
      game.birdY = NEST_SIT_Y + Math.sin(game.t * 2.4) * 2 - hopK * 9;
      game.rot = -0.12 + game.nestLook * 0.3 + game.nestHopSide * hopK * 0.35;
      game.wing = 0.28 + hopK * 0.9 + Math.sin(game.t * 9) * 0.06;
      game.stretchX += (1 - game.stretchX) * Math.min(1, 0.2 * f);
      game.stretchY += (1 - game.stretchY) * Math.min(1, 0.2 * f);
      if (game.nestEnding === 'win') {
        game.nestEndT += f * 0.016;
        updateRats(f);
        if (game.nestEndT >= 1.5) {
          game.mode = 'nestReady';
          game.countT = 0;
          game.lastCount = -1;
          game.nestLook = 0;
          game.nestLookTarget = 0;
          game.nestHop = 0;
          game.rats = [];
        }
      } else if (game.nestEnding === 'lose') {
        game.nestEndT += f * 0.016;
        game.shake = Math.max(0, game.shake - f * 0.02);
        if (game.nestEndT >= 1.15) {
          game.nestEnding = null;
          die();
        }
      } else {
        game.nextRatT -= f * 0.016;
        if (game.nextRatT <= 0) {
          spawnRat();
          game.nextRatT = 1.5 + Math.random() * 1.0;
        }
        updateRats(f);
        if (game.ratsSaved >= NEST_TARGET) {
          game.nestEnding = 'win';
          game.nestEndT = 0;
          sndStage();
        }
      }
    } else if (game.mode === 'nestReady') {
      game.countT += f * 0.016;
      const num = 3 - Math.floor(game.countT);
      if (num !== game.lastCount) {
        game.lastCount = num;
        sndBeep();
      }
      game.birdX = BIRD_X;
      game.birdY = GAME_H * 0.47 + Math.sin(game.t * 2.4) * 9;
      game.rot = Math.sin(game.t * 2.4 + 1) * 0.05;
      game.wing = Math.sin(game.t * 11) * 0.16 + Math.sin(game.t * 5.3) * 0.1;
      game.stretchX += (1 - game.stretchX) * Math.min(1, 0.2 * f);
      game.stretchY += (1 - game.stretchY) * Math.min(1, 0.2 * f);
      if (game.countT >= 3) startVolcano();
    } else if (game.mode === 'intro') {
      game.introT += f * 0.016;
      const t = Math.min(1, game.introT / 1.8);
      const e = 1 - Math.pow(1 - t, 3);
      const hoverY = GAME_H * 0.47;
      game.introX = -110 + (BIRD_X + 110) * e;
      game.birdY = hoverY + (1 - t) * 70 - 100 * Math.sin(Math.PI * t) + Math.sin(game.introT * 40) * 1.5 * (1 - t);
      game.rot = -0.5 * Math.sin(Math.PI * t) + Math.sin(game.introT * 30) * 0.06 * (1 - t);
      game.wing = Math.sin(game.introT * (26 - 12 * t)) * (1.15 - 0.85 * t);
      game.stretchX = 1 + 0.08 * Math.sin(Math.PI * t);
      game.stretchY = 1 - 0.08 * Math.sin(Math.PI * t);
      game.introFeatherAcc += f * 0.016;
      if (game.introFeatherAcc > 0.05) {
        game.introFeatherAcc = 0;
        spawnFeathers(1, game.introX, game.birdY);
      }
      if (t >= 1) {
        game.mode = 'ready';
        game.introT = 0;
        spawnFeathers(10, game.introX, game.birdY);
        sndChirp();
      }
    } else if (game.mode === 'ready') {
      game.birdY = GAME_H * 0.47 + Math.sin(game.t * 2.4) * 9;
      game.rot = Math.sin(game.t * 2.4 + 1) * 0.05;
      game.wing = Math.sin(game.t * 11) * 0.16 + Math.sin(game.t * 5.3) * 0.1;
      game.stretchX += (1 - game.stretchX) * Math.min(1, 0.2 * f);
      game.stretchY += (1 - game.stretchY) * Math.min(1, 0.2 * f);
    } else if (game.mode === 'over') {
      game.dieT += f * 0.016;
      const t = game.dieT;
      const inSpace = game.stage >= 9 && game.stage <= 11;
      if (game.stage === 16) {
        // sewer: slump in place, dizzy, sword drops
        game.birdY = Math.min(SEWER_GROUND - 16, game.birdY + 0.4 * f);
        game.birdX = game.sewerRunX + Math.sin(t * 30) * 1.5;
        game.rot += (0.28 - game.rot) * Math.min(1, 0.12 * f);
        game.wing = -1.2;
      } else if (t < 0.35) {
        // scared startle: jump back, wide eyes, tremble in place
        game.vel = -5.5;
        game.birdY += game.vel * f;
        game.birdX = BIRD_X + Math.sin(t * 60) * 2.5;
        game.rot = Math.sin(t * 70) * 0.16;
        game.wing = -1.2;
      } else if (inSpace) {
        // scared in space: panic and dive back down to Earth
        const k = t - 0.35;
        game.vel = clamp(game.vel + 0.18 * f, 3, 7);
        game.birdY += game.vel * f;
        game.birdX += 1.2 * f;
        game.rot += (0.5 - game.rot) * Math.min(1, 0.12 * f);
        game.wing = Math.sin(t * 22) * 0.7;
        if (Math.random() < 0.16) spawnFeathers(1, game.birdX, game.birdY);
      } else {
        // freaked out: fly up and to the right, off screen
        const k = t - 0.35;
        game.vel = Math.min(game.vel + 0.12 * f, -2);
        game.birdY += game.vel * f;
        game.birdX += (4.2 + k * 2.2) * f;
        game.rot += (0.35 - game.rot) * Math.min(1, 0.12 * f);
        game.wing = Math.sin(t * 22) * 0.7;
        if (Math.random() < 0.12) spawnFeathers(1, game.birdX, game.birdY);
      }
    }

    game.shake = Math.max(0, game.shake - 0.055 * f);
    game.flash = Math.max(0, game.flash - 0.05 * f);
    if (game.mode === 'over') {
      game.overlay = Math.min(1, game.overlay + 0.035 * f);
    } else {
      game.overlay = Math.max(0, game.overlay - 0.09 * f);
    }

    // trailing feather particles
    for (let i = game.feathers.length - 1; i >= 0; i--) {
      const pt = game.feathers[i];
      pt.age += f * 0.016;
      if (pt.age >= pt.life) {
        game.feathers.splice(i, 1);
        continue;
      }
      const dt = f * 0.016;
      pt.vy += 140 * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.rot += pt.vr * dt;
      pt.vx *= Math.pow(0.35, dt);
      pt.vr *= Math.pow(0.4, dt);
    }

    // ambient floaters (pollen / sea bubbles / embers / space stardust)
    game.nextFloaterT -= f * 0.016;
    if (game.nextFloaterT <= 0 && game.mode !== 'over' && game.floaters.length < 46) {
      game.nextFloaterT = 0.1 + Math.random() * 0.22;
      const fl = floaterStyle();
      game.floaters.push({
        x: GAME_W + 12,
        baseY: 18 + Math.random() * (SKY_H - 40),
        y: 18,
        ph: Math.random() * Math.PI * 2,
        amp: 3 + Math.random() * 11,
        sp: fl.spMin + Math.random() * (fl.spMax - fl.spMin),
        r: fl.rMin + Math.random() * (fl.rMax - fl.rMin),
        col: fl.cols[Math.floor(Math.random() * fl.cols.length)],
        life: 9 + Math.random() * 7,
        age: 0,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() * 2 - 1) * 0.5,
      });
    }
    for (let i = game.floaters.length - 1; i >= 0; i--) {
      const ft = game.floaters[i];
      ft.age += f * 0.016;
      ft.x -= ft.sp * f;
      ft.y = ft.baseY + Math.sin(ft.age * 1.7 + ft.ph) * ft.amp;
      ft.rot += ft.vr * f * 0.016;
      if (ft.age >= ft.life || ft.x < -20) game.floaters.splice(i, 1);
    }

    // shark splash droplets
    for (let i = game.splashes.length - 1; i >= 0; i--) {
      const pt = game.splashes[i];
      pt.age += f * 0.016;
      if (pt.age >= pt.life) {
        game.splashes.splice(i, 1);
        continue;
      }
      const dt = f * 0.016;
      pt.vy += 300 * dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= Math.pow(0.5, dt);
    }

    // day / night phase eases toward the target set by the score
    if (game.mode === 'play') {
      const target = (game.score % DAY_CYCLE) / DAY_CYCLE;
      game.dayPhase += (target - game.dayPhase) * Math.min(1, 0.035 * f);
    }
  }

  function drawClouds() {
    const TAU = Math.PI * 2;
    for (const c of game.clouds) {
      ctx.save();
      ctx.translate(c.x, c.y + Math.sin(game.t * 0.4 + c.x * 0.01) * 1.4);
      const puff = 1 + Math.sin(game.t * 0.8 + c.x * 0.02) * 0.07;
      ctx.scale(c.s * puff, c.s);
      ctx.fillStyle = 'rgba(170,178,170,0.45)';
      ctx.beginPath();
      ctx.ellipse(0, 10, 36, 16, 0, 0, TAU);
      ctx.ellipse(-26, 14, 23, 13, 0, 0, TAU);
      ctx.ellipse(28, 13, 25, 14, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(140,150,140,0.3)';
      ctx.beginPath();
      ctx.ellipse(0, 16, 38, 12, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(240,244,238,0.92)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 33, 15, 0, 0, TAU);
      ctx.ellipse(-25, 5, 21, 12, 0, 0, TAU);
      ctx.ellipse(27, 4, 23, 13, 0, 0, TAU);
      ctx.ellipse(4, -10, 19, 11, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,252,0.45)';
      ctx.beginPath();
      ctx.ellipse(-8, -6, 16, 7, -0.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(200,210,205,0.2)';
      ctx.beginPath();
      ctx.ellipse(-20, 9, 14, 6, 0, 0, TAU);
      ctx.ellipse(18, 8, 12, 5, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawSun(alpha) {
    if (alpha <= 0.02) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha) * 0.95;
    const glowR = 72 + Math.sin(game.t * 1.4) * 7;
    const sun = ctx.createRadialGradient(GAME_W - 74, 88, 6, GAME_W - 74, 88, glowR);
    sun.addColorStop(0, 'rgba(255,246,205,1)');
    sun.addColorStop(0.3, 'rgba(255,240,180,0.6)');
    sun.addColorStop(0.6, 'rgba(255,230,150,0.25)');
    sun.addColorStop(1, 'rgba(255,230,150,0)');
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(GAME_W - 74, 88, glowR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,240,160,0.15)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + game.t * 0.15;
      const innerR = 20 + Math.sin(game.t * 2.5 + i * 1.3) * 3;
      const outerR = glowR * 0.85 + Math.sin(game.t * 1.8 + i * 0.7) * 12;
      ctx.beginPath();
      ctx.moveTo(GAME_W - 74 + Math.cos(a) * innerR, 88 + Math.sin(a) * innerR);
      ctx.lineTo(GAME_W - 74 + Math.cos(a) * outerR, 88 + Math.sin(a) * outerR);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMoon(alpha) {
    if (alpha <= 0.02) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    const mx = 96;
    const my = 92;
    const mr = 26 + Math.sin(game.t * 1.2) * 1.4;
    const glow = ctx.createRadialGradient(mx, my, 4, mx, my, mr + 40);
    glow.addColorStop(0, 'rgba(230,225,200,0.4)');
    glow.addColorStop(0.5, 'rgba(220,215,190,0.15)');
    glow.addColorStop(1, 'rgba(220,215,190,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(mx, my, mr + 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f0ebe0';
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8e2d4';
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(30,38,30,0.35)';
    ctx.beginPath();
    ctx.arc(mx - 8, my - 6, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(mx + 7, my + 7, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(mx + 2, my - 11, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(mx - 3, my + 10, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(mx + 12, my - 2, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,240,0.18)';
    ctx.beginPath();
    ctx.ellipse(mx - 6, my - 8, 8, 5, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(20,26,20,0.25)';
    ctx.beginPath();
    ctx.arc(mx + 10, my - 4, mr * 0.9, -Math.PI * 0.35, Math.PI * 0.35);
    ctx.arc(mx + 10 + Math.cos(0) * mr * 0.9, my + Math.sin(0) * 0, 0, Math.PI * 0.35, -Math.PI * 0.35, true);
    ctx.fill();
    ctx.restore();
  }

  let stars = null;
  function initStars() {
    stars = [];
    for (let i = 0; i < 42; i++) {
      stars.push({
        x: Math.random() * GAME_W,
        y: Math.random() * SKY_H * 0.65,
        r: 0.6 + Math.random() * 1.1,
        s: 1.5 + Math.random() * 3,
        ph: Math.random() * Math.PI * 2,
      });
    }
  }
  initStars();

  function drawStars(alpha) {
    if (alpha <= 0.02 || !stars) return;
    ctx.save();
    for (const st of stars) {
      const tw = 0.5 + 0.5 * Math.sin(game.t * st.s + st.ph);
      ctx.globalAlpha = alpha * (0.35 + 0.65 * tw);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
      ctx.fill();
      if (tw > 0.75 && st.r > 1.0) {
        const spikeLen = st.r * (2 + (tw - 0.75) * 4);
        ctx.strokeStyle = 'rgba(255,255,255,' + ((tw - 0.75) * 2.5).toFixed(3) + ')';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(st.x - spikeLen, st.y);
        ctx.lineTo(st.x + spikeLen, st.y);
        ctx.moveTo(st.x, st.y - spikeLen);
        ctx.lineTo(st.x, st.y + spikeLen);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawLaunchStreaks() {
    if (game.mode !== 'launch') return;
    const speed = 8 + game.launchT * 26;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 42; i++) {
      const sx = (i * 61.8) % GAME_W;
      const sy = (game.launchT * 220 * (1 + (i % 5) * 0.18) + i * 37) % (GAME_H + 200) - 100;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx, sy + 18 + speed);
    }
    ctx.stroke();
    ctx.restore();
  }

  function floaterStyle() {
    const g = currentBiome().ground;
    if (g === 'space') {
      return { cols: ['rgba(255,255,255', 'rgba(170,210,255', 'rgba(255,240,190'], rMin: 0.5, rMax: 1.5, spMin: 0.3, spMax: 0.7 };
    }
    if (g === 'sea') {
      return { cols: ['rgba(240,252,255', 'rgba(205,242,255'], rMin: 0.9, rMax: 2.2, spMin: 0.15, spMax: 0.4 };
    }
    if (g === 'lava') {
      return { cols: ['rgba(255,180,80', 'rgba(255,120,40', 'rgba(255,220,120'], rMin: 0.8, rMax: 1.8, spMin: 0.45, spMax: 0.9 };
    }
    return { cols: ['rgba(255,238,150', 'rgba(255,250,205', 'rgba(215,245,170'], rMin: 0.7, rMax: 1.6, spMin: 0.12, spMax: 0.3 };
  }

  function drawFloaters() {
    for (const ft of game.floaters) {
      const inF = Math.min(1, ft.age * 2.5);
      const outF = Math.min(1, (ft.life - ft.age) * 2.5);
      const a = 0.32 * inF * outF;
      ctx.save();
      ctx.translate(ft.x, ft.y);
      ctx.rotate(ft.rot);
      ctx.fillStyle = ft.col + ',' + a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.ellipse(0, 0, ft.r * 2.3, ft.r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawHills() {
    if (game.stage >= 9 && game.stage <= 11) return;
    const biome = currentBiome();
    const cycS = sampleCycle(game.dayPhase);
    const sb = lerpC(cycS.bot, biome.sky.bot, biome.blend);
    const base = GAME_H - GROUND_H;
    const layers = [
      { off: game.dist * 0.02, amp: 22, seed: 1.1, per: 0.007, dark: 0.06, alpha: 0.35 },
      { off: game.dist * 0.05, amp: 30, seed: 1.7, per: 0.011, dark: 0.12, alpha: 0.65 },
      { off: game.dist * 0.12 + 40, amp: 19, seed: 2.9, per: 0.016, dark: 0.26, alpha: 1.0 },
    ];
    for (const L of layers) {
      const col = lerpC(sb, [12, 26, 22], L.dark);
      ctx.fillStyle = 'rgba(' + Math.round(col[0]) + ',' + Math.round(col[1]) + ',' + Math.round(col[2]) + ',' + L.alpha + ')';
      ctx.beginPath();
      ctx.moveTo(0, GAME_H);
      for (let x = 0; x <= GAME_W; x += 8) {
        const w1 = Math.sin((x - L.off) * L.per * L.seed);
        const w2 = Math.sin((x + L.off) * L.per * 2.3 + 2.0);
        const w3 = Math.sin((x - L.off * 0.6) * L.per * 1.6 + 4.2) * 0.15;
        const y = base - L.amp * (0.45 + 0.25 * w1 + 0.3 * w2 + w3);
        ctx.lineTo(x, Math.max(0, y));
      }
      ctx.lineTo(GAME_W, GAME_H);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawBirdShadow() {
    if (game.nestActive || (game.stage >= 9 && game.stage <= 11) || game.mode === 'tajFly') return;
    const gY = GAME_H - GROUND_H;
    const k = clamp(game.birdY / SKY_H, 0, 1);
    const bx = game.mode === 'intro' ? game.introX : game.mode === 'over' ? game.birdX : game.mode === 'launch' || game.mode === 'countdown' ? game.launchX : game.birdX;
    ctx.save();
    ctx.fillStyle = 'rgba(15,38,28,' + (0.06 + k * 0.16).toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(bx, gY + 5, 7 + k * 20, 2.2 + k * 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawWarp() {
    if (game.warp <= 0) return;
    const bx = game.mode === 'intro' ? game.introX : game.mode === 'over' ? game.birdX : game.mode === 'launch' || game.mode === 'countdown' ? game.launchX : game.mode === 'nestCountdown' || game.mode === 'nest' || game.mode === 'nestReady' ? game.birdX : BIRD_X;
    const k = 1 - game.warp;
    ctx.save();
    ctx.globalAlpha = game.warp * 0.85;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(bx, game.birdY, 16 + k * 74, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,226,120,0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bx, game.birdY, 8 + k * 54, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(180,240,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(bx, game.birdY, 24 + k * 90, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,200,100,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(bx, game.birdY, 4 + k * 38, 0, Math.PI * 2);
    ctx.stroke();
    const sparkCount = 6;
    for (let i = 0; i < sparkCount; i++) {
      const angle = (i / sparkCount) * Math.PI * 2 + k * 4;
      const dist = 20 + k * 60;
      const sx = bx + Math.cos(angle) * dist;
      const sy = game.birdY + Math.sin(angle) * dist;
      ctx.fillStyle = 'rgba(255,255,200,' + (0.6 * game.warp).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(sx, sy, 1.5 + Math.sin(game.t * 20 + i) * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = game.warp * 0.2;
    const glow = ctx.createRadialGradient(bx, game.birdY, 2, bx, game.birdY, 40 + k * 50);
    glow.addColorStop(0, 'rgba(255,255,255,0.6)');
    glow.addColorStop(0.5, 'rgba(255,226,120,0.2)');
    glow.addColorStop(1, 'rgba(255,226,120,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(bx, game.birdY, 40 + k * 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(bx, game.birdY, Math.max(0.5, 7 * game.warp), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawFeathers() {
    for (const pt of game.feathers) {
      const k = 1 - pt.age / pt.life;
      ctx.save();
      ctx.translate(pt.x, pt.y);
      const tumble = Math.sin(pt.age * 5 + pt.rot) * 0.3;
      ctx.rotate(pt.rot + tumble);
      const scaleW = 1 + Math.sin(pt.age * 7 + pt.rot * 2) * 0.15;
      ctx.scale(scaleW, 1);
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, pt.size * 1.6, pt.size * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      const shimmer = Math.sin(pt.age * 12 + pt.x * 0.1) * 0.5 + 0.5;
      ctx.fillStyle = 'rgba(255,255,240,' + (0.18 * shimmer * k).toFixed(3) + ')';
      ctx.beginPath();
      ctx.ellipse(-pt.size * 0.3, -pt.size * 0.2, pt.size * 0.8, pt.size * 0.35, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(90,80,20,0.4)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(-pt.size * 1.2, 0);
      ctx.lineTo(pt.size * 1.2, 0);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(90,80,20,0.15)';
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(-pt.size * 0.5, -pt.size * 0.3);
      ctx.lineTo(0, 0);
      ctx.moveTo(pt.size * 0.5, -pt.size * 0.3);
      ctx.lineTo(0, 0);
      ctx.moveTo(-pt.size * 0.5, pt.size * 0.3);
      ctx.lineTo(0, 0);
      ctx.moveTo(pt.size * 0.5, pt.size * 0.3);
      ctx.lineTo(0, 0);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function pipeSegment(x, y, h, mouthAtBottom) {
    const grad = ctx.createLinearGradient(x, 0, x + PIPE_W, 0);
    grad.addColorStop(0, '#a4d95e');
    grad.addColorStop(0.2, '#8bc84a');
    grad.addColorStop(0.45, '#7dbd3f');
    grad.addColorStop(0.75, '#66a83a');
    grad.addColorStop(0.92, '#5a9830');
    grad.addColorStop(1, '#4a8528');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, PIPE_W, h);

    ctx.strokeStyle = 'rgba(40,70,15,0.2)';
    ctx.lineWidth = 1.5;
    for (let gx = x + 16; gx < x + PIPE_W - 8; gx += 18) {
      ctx.beginPath();
      ctx.moveTo(gx, y);
      ctx.lineTo(gx, y + h);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(255,255,230,0.28)';
    ctx.fillRect(x + 5, y, 8, h);
    ctx.fillStyle = 'rgba(255,255,230,0.12)';
    ctx.fillRect(x + 14, y, 4, h);
    ctx.fillStyle = 'rgba(40,70,15,0.25)';
    ctx.fillRect(x + PIPE_W - 9, y, 9, h);
    ctx.fillStyle = 'rgba(40,70,15,0.12)';
    ctx.fillRect(x + PIPE_W - 14, y, 5, h);

    ctx.fillStyle = 'rgba(60,90,25,0.14)';
    for (let gy = y + 22; gy < y + h - 8; gy += 28) {
      ctx.fillRect(x + 10 + ((gy * 7) % 24), gy, 5, 3);
      ctx.fillRect(x + 32 + ((gy * 13) % 18), gy + 14, 4, 3);
    }

    const capH = 28;
    const capY = mouthAtBottom ? y + h - capH : y;
    const capGrad = ctx.createLinearGradient(x - 6, 0, x + PIPE_W + 6, 0);
    capGrad.addColorStop(0, '#98cd52');
    capGrad.addColorStop(0.2, '#88c248');
    capGrad.addColorStop(0.45, '#79b640');
    capGrad.addColorStop(0.75, '#66a83a');
    capGrad.addColorStop(1, '#5a9932');
    ctx.fillStyle = capGrad;
    ctx.fillRect(x - 6, capY, PIPE_W + 12, capH);
    ctx.fillStyle = 'rgba(255,255,230,0.28)';
    ctx.fillRect(x + 1, capY, 8, capH);
    ctx.fillStyle = 'rgba(255,255,230,0.1)';
    ctx.fillRect(x + 10, capY, 4, capH);
    ctx.fillStyle = 'rgba(40,70,15,0.28)';
    ctx.fillRect(x + PIPE_W - 7, capY, 8, capH);
    ctx.strokeStyle = 'rgba(40,70,15,0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 6, capY, PIPE_W + 12, capH);
    ctx.fillStyle = 'rgba(40,70,15,0.18)';
    ctx.fillRect(x - 6, mouthAtBottom ? capY - 3 : capY + capH, PIPE_W + 12, 3);
    const rimY = mouthAtBottom ? capY : capY + capH;
    ctx.fillStyle = 'rgba(255,255,230,0.15)';
    ctx.fillRect(x - 6, rimY - 1, PIPE_W + 12, 2);
  }

  function drawPipes() {
    for (const p of game.pipes) {
      pipeSegment(p.x, 0, p.gapY, true);
      pipeSegment(p.x, p.gapY + GAP, SKY_H - (p.gapY + GAP), false);
    }
  }

  function drawCrows() {
    const TAU = Math.PI * 2;
    for (const c of game.crows) {
      const rawFlap = Math.sin(game.t * 18 + c.phase);
      const flap = (rawFlap > 0 ? Math.pow(rawFlap, 0.6) : -Math.pow(-rawFlap, 0.6)) * 0.55;
      const bob = -flap * 1.6;
      const flutter = Math.sin(game.t * 40 + c.phase * 2) * 0.08;
      const pitch = rawFlap * 0.06;
      ctx.save();
      ctx.translate(c.x, c.y + bob);
      ctx.rotate(Math.sin(game.t * 9 + c.phase) * 0.03 + pitch);
      ctx.fillStyle = '#332e2b';
      ctx.beginPath();
      ctx.ellipse(0, 0, 17, 9.5, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#3a3532';
      ctx.beginPath();
      ctx.ellipse(-1, -3, 10, 4, 0.1, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#2b2623';
      ctx.save();
      ctx.translate(16, 0);
      ctx.rotate(Math.sin(game.t * 13 + c.phase) * 0.16);
      ctx.beginPath();
      ctx.moveTo(-4, -2);
      ctx.lineTo(10, -6 + Math.sin(game.t * 12 + c.phase) * 2.5);
      ctx.lineTo(11, 0);
      ctx.lineTo(9, 4);
      ctx.lineTo(-4, 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.translate(-11, -7 - flap * 1.2 + Math.sin(game.t * 11 + c.phase) * 0.5);
      ctx.rotate(Math.sin(game.t * 11 + c.phase) * 0.06);
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#e8b23a';
      ctx.beginPath();
      ctx.moveTo(-6, -1);
      ctx.lineTo(-12, 1);
      ctx.lineTo(-6, 2.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-2, -1.5, 2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#111111';
      ctx.beginPath();
      ctx.arc(-2.6, -1.5, 1, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-2, -2.2, 0.5, 0, TAU);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#2b2623';
      ctx.save();
      ctx.translate(-2, -4);
      ctx.rotate(-flap * 0.9 - 0.2 + flutter);
      for (let k = 0; k < 3; k++) {
        ctx.save();
        ctx.translate(k * 1.2, -k * 0.8);
        ctx.rotate(k * 0.12 + flap * 0.25 * (k / 2));
        ctx.beginPath();
        ctx.ellipse(-3, -7, 11 - k * 1.5, 4, -0.15, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      ctx.restore();
    }
  }

  function drawSnakes() {
    const TAU = Math.PI * 2;
    for (const s of game.snakes) {
      const hx = s.hx;
      const hy = s.y;
      const topY = -14;
      const men = Math.sin(game.t * 4 + s.phase) * 0.5 + 0.5;

      // ---- body: soft serpent ribbon with a traveling wave ----
      const N = 16;
      const pts = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const y = topY + (hy - topY) * t;
        const wave = y * 0.05 + game.t * 5 + s.phase;
        const x = hx + Math.sin(wave) * (7 + t * 7) * t + Math.sin(game.t * 3.4 + s.phase) * 1.6 * t;
        pts.push({ x: x, y: y, r: 5 + t * 4.5 });
      }
      const left = [];
      const right = [];
      for (let i = 0; i <= N; i++) {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(N, i + 1)];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        left.push({ x: pts[i].x + nx * pts[i].r, y: pts[i].y + ny * pts[i].r });
        right.push({ x: pts[i].x - nx * pts[i].r, y: pts[i].y - ny * pts[i].r });
      }
      const bodyG = ctx.createLinearGradient(0, topY, 0, hy);
      bodyG.addColorStop(0, '#1c5a24');
      bodyG.addColorStop(0.45, '#2f7d2e');
      bodyG.addColorStop(1, '#46a038');
      ctx.fillStyle = bodyG;
      ctx.beginPath();
      ctx.moveTo(left[0].x, left[0].y);
      for (let i = 1; i <= N; i++) ctx.lineTo(left[i].x, left[i].y);
      for (let i = N - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(8,32,10,0.6)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // pale belly band along one flank
      ctx.strokeStyle = 'rgba(190,230,170,0.35)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const p = pts[i];
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(N, i + 1)];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const ox = -dy / len * p.r * 0.42;
        const oy = dx / len * p.r * 0.42;
        const px = p.x - ox;
        const py = p.y - oy;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // menacing dark bands across the body
      ctx.strokeStyle = 'rgba(10,42,12,0.24)';
      ctx.lineCap = 'round';
      for (let i = 1; i <= N - 1; i += 2) {
        const p = pts[i];
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(N, i + 1)];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        ctx.lineWidth = p.r * 0.5;
        ctx.beginPath();
        ctx.moveTo(p.x + nx * p.r * 1.05, p.y + ny * p.r * 1.05);
        ctx.lineTo(p.x - nx * p.r * 1.05, p.y - ny * p.r * 1.05);
        ctx.stroke();
      }

      // hard scales running down the back (dorsal)
      ctx.fillStyle = 'rgba(8,34,10,0.55)';
      for (let i = 2; i <= N - 2; i += 2) {
        const p = pts[i];
        const a = pts[i - 1];
        const b = pts[i + 1];
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const siz = p.r * 0.5;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(0, -siz);
        ctx.lineTo(siz * 0.55, 0);
        ctx.lineTo(0, siz);
        ctx.lineTo(-siz * 0.55, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // ---- head: viper wedge, angled along the body, facing the bird ----
      const bdx = pts[N].x - pts[N - 1].x;
      const bdy = pts[N].y - pts[N - 1].y;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(Math.atan2(-bdx, bdy) + Math.sin(game.t * 3.4 + s.phase * 2) * 0.05);

      // cold dark aura so it looms over the bird
      ctx.fillStyle = 'rgba(8,26,10,' + (0.16 + men * 0.1).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, TAU);
      ctx.fill();

      // wedge head with dark green shading
      const headG = ctx.createLinearGradient(0, -16, 0, 11);
      headG.addColorStop(0, '#1c5a24');
      headG.addColorStop(0.5, '#2f7d2e');
      headG.addColorStop(1, '#46a038');
      ctx.fillStyle = headG;
      ctx.beginPath();
      ctx.moveTo(0, -17);
      ctx.quadraticCurveTo(-11.5, -13, -11.5, -5);
      ctx.quadraticCurveTo(-10.5, 4, -6, 8);
      ctx.quadraticCurveTo(0, 11.5, 6, 8);
      ctx.quadraticCurveTo(10.5, 4, 11.5, -5);
      ctx.quadraticCurveTo(11.5, -13, 0, -17);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(8,28,10,0.7)';
      ctx.lineWidth = 1.3;
      ctx.stroke();

      // low brow ridge across the forehead
      ctx.strokeStyle = 'rgba(9,30,12,0.55)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-8, -6);
      ctx.quadraticCurveTo(0, -15, 8, -6);
      ctx.stroke();

      // head scale specks
      ctx.fillStyle = 'rgba(8,28,10,0.4)';
      const specks = [[-9.5, -2], [9.5, -2], [-7, 2.5], [7, 2.5], [-5.5, -10], [5.5, -10]];
      for (const spk of specks) {
        ctx.beginPath();
        ctx.arc(spk[0], spk[1], 1, 0, TAU);
        ctx.fill();
      }

      // glinting alert eyes with vertical slit pupils
      const lookX = clamp((game.birdY - hy) * 0.05, -1.4, 1.4);
      for (const ex of [-6.4, 6.4]) {
        // eye socket
        ctx.fillStyle = '#0d2a10';
        ctx.beginPath();
        ctx.ellipse(ex, -7, 4.4, 4, 0, 0, TAU);
        ctx.fill();
        // hot iris
        ctx.fillStyle = '#dfff4d';
        ctx.beginPath();
        ctx.ellipse(ex + lookX * 0.35, -7, 2.7, 2.3, 0, 0, TAU);
        ctx.fill();
        // black vertical slit
        ctx.fillStyle = '#04090a';
        ctx.beginPath();
        ctx.ellipse(ex + lookX * 0.35, -7, 0.95, 2.9, 0, 0, TAU);
        ctx.fill();
        // cold gleam
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(ex + lookX * 0.35 - 0.9, -8.1, 0.7, 0, TAU);
        ctx.fill();
        // furious brow
        ctx.strokeStyle = '#0d2a10';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ex - 3.2, -10.2);
        ctx.lineTo(ex + 1.5, -9);
        ctx.stroke();
      }

      // nostrils
      ctx.fillStyle = 'rgba(8,26,10,0.7)';
      ctx.beginPath();
      ctx.arc(-2.6, 3, 0.9, 0, TAU);
      ctx.arc(2.6, 3, 0.9, 0, TAU);
      ctx.fill();

      // wrenched-open mouth: dark red interior
      ctx.fillStyle = '#5c1420';
      ctx.beginPath();
      ctx.ellipse(0, 8.5, 7.5, 4.4, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#861723';
      ctx.beginPath();
      ctx.ellipse(0, 8, 4.8, 2.5, 0, 0, TAU);
      ctx.fill();

      // long fangs dripping down from the upper jaw
      for (const fx of [-3.8, 3.8]) {
        ctx.fillStyle = '#fbf8ea';
        ctx.beginPath();
        ctx.moveTo(fx - 1.7, 4.5);
        ctx.quadraticCurveTo(fx, 15.5, fx + 1.7, 4.5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.moveTo(fx - 0.8, 6.5);
        ctx.quadraticCurveTo(fx - 0.2, 12, fx + 0.1, 6.5);
        ctx.closePath();
        ctx.fill();
      }

      // forked tongue flicking out hungrily
      const flick = Math.max(0, Math.sin(game.t * 6.5 + s.phase * 3) * 0.85 - 0.12);
      ctx.strokeStyle = '#c03038';
      ctx.lineWidth = 1.7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 11);
      ctx.lineTo(flick * 8, 16);
      ctx.moveTo(flick * 8, 16);
      ctx.lineTo(flick * 12, 20.5);
      ctx.moveTo(flick * 8, 16);
      ctx.lineTo(flick * 12, 19.5);
      ctx.stroke();

      ctx.restore();
      ctx.restore();
    }
  }

  function drawSharks() {
    const TAU = Math.PI * 2;
    for (const h of game.sharks) {
      const rising = Math.sin(Math.min(1, h.t) * Math.PI);
      ctx.save();
      ctx.translate(h.x, h.y);
      if (h.state === 0) {
        // big dorsal fin breaking the surface, telegraphing the jump
        ctx.save();
        ctx.rotate(Math.sin(game.t * 6 + h.phase) * 0.1);
        ctx.fillStyle = 'rgba(38,56,74,0.98)';
        ctx.beginPath();
        ctx.moveTo(-13, 4);
        ctx.quadraticCurveTo(-5, -31, 4, -27);
        ctx.quadraticCurveTo(10, -13, 15, 4);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-3, 3);
        ctx.quadraticCurveTo(0, -10, 2, -25);
        ctx.stroke();
        ctx.restore();
        // rippling wake spreading outward at the surface
        for (let r = 0; r < 3; r++) {
          const rr = 14 + ((game.t * 22 + h.x + r * 13) % 40);
          ctx.strokeStyle = 'rgba(255,255,255,' + (0.35 * (1 - rr / 54)).toFixed(3) + ')';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.ellipse(0, SKY_H - h.y, rr, rr * 0.22, 0, 0, TAU);
          ctx.stroke();
        }
        ctx.restore();
        continue;
      }
      ctx.rotate(-0.5 * rising);
      const tailWag = Math.sin(game.t * 9 + h.phase) * 0.22 + rising * 0.2;
      const bodyWave = Math.sin(game.t * 5 + h.phase) * 0.03 * rising;
      ctx.rotate(bodyWave);
      ctx.save();
      ctx.translate(20, 0);
      ctx.rotate(tailWag);
      ctx.fillStyle = '#3d5268';
      ctx.beginPath();
      ctx.moveTo(0, -3);
      ctx.lineTo(14, -15);
      ctx.lineTo(10, -2);
      ctx.lineTo(13, 10);
      ctx.lineTo(0, 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // chunky muscular body
      const bodyG = ctx.createLinearGradient(0, -13, 0, 13);
      bodyG.addColorStop(0, '#5b7d97');
      bodyG.addColorStop(0.35, '#4a647c');
      bodyG.addColorStop(0.72, '#b9c9d4');
      bodyG.addColorStop(1, '#eef2f5');
      ctx.fillStyle = bodyG;
      ctx.beginPath();
      ctx.moveTo(-35, -2);
      ctx.quadraticCurveTo(-27, -10, -16, -11);
      ctx.quadraticCurveTo(-5, -12, 4, -9);
      ctx.quadraticCurveTo(15, -6, 20, -2);
      ctx.lineTo(20, 4);
      ctx.quadraticCurveTo(10, 12, -2, 12);
      ctx.quadraticCurveTo(-14, 12, -23, 8);
      ctx.quadraticCurveTo(-31, 5, -35, -2);
      ctx.closePath();
      ctx.fill();
      // big swept-back dorsal fin (swaying)
      ctx.save();
      ctx.translate(0, -6);
      ctx.rotate(Math.sin(game.t * 6 + h.phase) * 0.12);
      ctx.fillStyle = '#33485e';
      ctx.beginPath();
      ctx.moveTo(-10, -2);
      ctx.quadraticCurveTo(-4, -19, 4, -16);
      ctx.quadraticCurveTo(8, -7, 9, -2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // big pectoral fin angled down (flapping)
      const pectFlap = Math.sin(game.t * 7 + h.phase) * 0.16;
      ctx.save();
      ctx.translate(-12, 6);
      ctx.rotate(pectFlap);
      ctx.fillStyle = '#3d546c';
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.quadraticCurveTo(-6, 7, 7, 6);
      ctx.quadraticCurveTo(5, 1, 1, -2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      // gill slits
      ctx.strokeStyle = '#2f4157';
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-19 + i * 2.8, -4);
        ctx.quadraticCurveTo(-21.5 + i * 2.8, 0, -19 + i * 2.8, 5);
        ctx.stroke();
      }
      // lower jaw
      ctx.fillStyle = '#3f5569';
      ctx.beginPath();
      ctx.moveTo(-32, 6);
      ctx.quadraticCurveTo(-24, 10, -15, 7);
      ctx.lineTo(-16, 4);
      ctx.quadraticCurveTo(-25, 5, -31, 3);
      ctx.closePath();
      ctx.fill();
      // open mouth interior (dark red)
      ctx.fillStyle = '#5c1f1f';
      ctx.beginPath();
      ctx.moveTo(-34, 4);
      ctx.quadraticCurveTo(-26, 9, -15, 8);
      ctx.lineTo(-15, 5);
      ctx.quadraticCurveTo(-25, 6, -33, 1);
      ctx.closePath();
      ctx.fill();
      // big sharp upper teeth row
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 6; i++) {
        const tx = -32 + i * 3.1;
        ctx.beginPath();
        ctx.moveTo(tx, 4);
        ctx.lineTo(tx + 1.5, 9.5);
        ctx.lineTo(tx + 3, 4);
        ctx.closePath();
        ctx.fill();
      }
      // lower teeth row pointing up
      ctx.fillStyle = '#e8e8e8';
      for (let i = 0; i < 5; i++) {
        const tx = -30 + i * 3.1;
        ctx.beginPath();
        ctx.moveTo(tx, 8);
        ctx.lineTo(tx + 1.5, 4);
        ctx.lineTo(tx + 3, 8);
        ctx.closePath();
        ctx.fill();
      }
      // scar above the eye
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-28, -10);
      ctx.lineTo(-23, -8);
      ctx.lineTo(-26, -6);
      ctx.stroke();
      // big angry eye
      const blinkCycle = (game.t * 1.2 + h.phase) % 6;
      const isBlink = blinkCycle > 5.7;
      ctx.fillStyle = '#fdfdfd';
      ctx.beginPath();
      ctx.ellipse(-24, -5, 3.4, isBlink ? 0.5 : 3.4, 0, 0, TAU);
      ctx.fill();
      if (!isBlink) {
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(-24.8, -5, 1.7, 0, TAU);
        ctx.fill();
      }
      // heavy angry brow
      ctx.strokeStyle = '#24384c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-29, -8.5);
      ctx.lineTo(-20, -5.5);
      ctx.stroke();
      if (rising > 0.15) {
        for (let wp = 0; wp < 3; wp++) {
          const dropX = -15 - wp * 8 + rising * 8;
          const dropY = 14 + wp * 3 + rising * 10;
          const dropA = (rising - 0.15) * 0.5 * (1 - wp * 0.25);
          ctx.fillStyle = 'rgba(140,200,230,' + dropA.toFixed(3) + ')';
          ctx.beginPath();
          ctx.ellipse(dropX, dropY, 2 - wp * 0.3, 3 - wp * 0.4, 0.2, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  function drawWaves() {
    const TAU = Math.PI * 2;
    for (const w of game.waves) {
      const wob = Math.sin(game.t * 4 + w.phase) * 5;
      const crestX = w.x + wob;
      const crestY = SKY_H - w.h;
      const baseY = SKY_H;
      const g = ctx.createLinearGradient(0, baseY, 0, crestY);
      g.addColorStop(0, '#1773b0');
      g.addColorStop(0.55, '#2f9fd8');
      g.addColorStop(1, '#7fd0ee');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(w.x - w.w * 0.5, baseY + 8);
      ctx.quadraticCurveTo(w.x - w.w * 0.45, crestY + 26, crestX, crestY);
      ctx.quadraticCurveTo(w.x + w.w * 0.45, crestY + 22, w.x + w.w * 0.5, baseY + 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.ellipse(crestX, crestY + 3, w.w * 0.2, 7, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(crestX - w.w * 0.1, crestY + 8, w.w * 0.14, 5, -0.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 4; i++) {
        const dx = crestX - 18 + i * 12 + wob * 0.6;
        const dy = crestY - 4 - ((game.t * 14 + w.phase + i * 2) % 8);
        ctx.beginPath();
        ctx.arc(dx, dy, 2, 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(w.x - w.w * 0.5, baseY + 5);
      ctx.quadraticCurveTo(w.x, baseY + 2 + Math.sin(game.t * 6 + w.phase) * 2, w.x + w.w * 0.5, baseY + 5);
      ctx.stroke();
    }
  }

  function drawBalls() {
    const TAU = Math.PI * 2;
    for (const bl of game.balls) {
      ctx.save();
      ctx.translate(bl.x, bl.y);
      ctx.rotate(bl.rot + Math.sin(game.t * 3.2 + bl.phase) * 0.1);
      const g = ctx.createRadialGradient(-3, -3, 1, 0, 0, BALL_R);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.7, '#e8e8e8');
      g.addColorStop(1, '#c2c2c2');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, BALL_R, 0, TAU);
      ctx.fill();
      // central pentagon
      ctx.fillStyle = '#1d1d1f';
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        const px = Math.cos(a) * 6.2;
        const py = Math.sin(a) * 6.2;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      // surrounding pentagon hints
      for (let i = 0; i < 5; i++) {
        const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        const cx = Math.cos(a) * 12;
        const cy = Math.sin(a) * 12;
        ctx.beginPath();
        for (let j = 0; j < 5; j++) {
          const a2 = (j * 2 * Math.PI) / 5 - Math.PI / 2 + Math.PI / 5;
          const px = cx + Math.cos(a2) * 3.2;
          const py = cy + Math.sin(a2) * 3.2;
          if (j === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      }
      // seam lines
      ctx.strokeStyle = '#1d1d1f';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
        ctx.moveTo(Math.cos(a) * 6.2, Math.sin(a) * 6.2);
        ctx.lineTo(Math.cos(a) * 12, Math.sin(a) * 12);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawNetters() {
    const TAU = Math.PI * 2;
    for (const n of game.netters) {
      const run = Math.sin(n.phase * 14);
      const feetY = SKY_H + 10;
      ctx.save();
      ctx.translate(n.x, 0);

      // legs (running)
      ctx.strokeStyle = '#5a4a30';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, feetY - 20);
      ctx.lineTo(-5 + run * 7, feetY);
      ctx.moveTo(2, feetY - 20);
      ctx.lineTo(7 - run * 7, feetY);
      ctx.stroke();

      // torso
      ctx.fillStyle = '#c9a13f';
      roundRect(-8, feetY - 44, 16, 26, 6);
      ctx.fill();

      // arms reaching up the pole (pumping)
      ctx.strokeStyle = '#5a4a30';
      ctx.lineWidth = 3.5;
      const armPump = Math.sin(n.phase * 9) * 3;
      ctx.beginPath();
      ctx.moveTo(6, feetY - 40);
      ctx.lineTo(10, n.y - 20 + armPump);
      ctx.moveTo(-6, feetY - 38);
      ctx.lineTo(-4, feetY - 22 + armPump);
      ctx.stroke();

      // head (bobbing)
      ctx.fillStyle = '#e7c089';
      ctx.beginPath();
      ctx.arc(-1, feetY - 54 + armPump * 0.25, 7, 0, TAU);
      ctx.fill();
      // hat
      ctx.fillStyle = '#a9823a';
      ctx.beginPath();
      ctx.arc(-1, feetY - 56 + armPump * 0.25, 7, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(-9, feetY - 56 + armPump * 0.25, 8, 3);
      // face looking up at the net
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(-4, feetY - 53.5 + armPump * 0.25, 1.2, 0, TAU);
      ctx.arc(1.5, feetY - 53.5 + armPump * 0.25, 1.2, 0, TAU);
      ctx.fill();

      // pole (swaying slightly)
      ctx.strokeStyle = '#8a6a3a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(10, feetY - 40);
      ctx.quadraticCurveTo(12, (feetY + n.y) / 2, 10 + Math.sin(n.phase * 9) * 2, n.y);
      ctx.stroke();

      // net hoop (wobbling as he runs)
      ctx.save();
      ctx.translate(0, n.y);
      ctx.rotate(Math.sin(n.phase * 9) * 0.1);
      ctx.strokeStyle = '#e8e2d8';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, NET_R, 0, TAU);
      ctx.stroke();
      // mesh
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.arc(0, 0, NET_R - 3, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        ctx.moveTo(Math.cos(a) * (NET_R - 3), Math.sin(a) * (NET_R - 3));
        ctx.lineTo(-Math.cos(a) * (NET_R - 3), -Math.sin(a) * (NET_R - 3));
      }
      ctx.stroke();
      ctx.beginPath();
      for (let r = 6; r < NET_R - 1; r += 6) {
        ctx.arc(0, 0, r, 0, TAU);
      }
      ctx.stroke();
      ctx.restore();

      ctx.restore();
    }
  }

  function drawPlanes() {
    const TAU = Math.PI * 2;
    for (const pl of game.planes) {
      ctx.save();
      ctx.translate(pl.x, pl.y);
      const pitch = Math.cos(game.t * 2.6 + pl.phase) * 0.3;
      ctx.rotate(pitch);
      // banking roll (shear perpendicular to the pitch)
      const roll = -Math.sin(game.t * 2.6 + pl.phase) * 0.35;
      ctx.transform(1, roll, 0, 1, 0, 0);

      // contrail puffs trailing behind the tail
      for (let i = 0; i < 4; i++) {
        const cx = 46 + i * 9 + ((game.t * 26 + i * 11) % 9);
        const cy = Math.sin(game.t * 7 + i * 2.4) * 1.6;
        const a = 0.3 - i * 0.07;
        ctx.fillStyle = 'rgba(255,255,255,' + Math.max(0, a).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(cx, cy, 3.5 - i * 0.6, 0, TAU);
        ctx.fill();
      }

      // far wing (behind fuselage)
      ctx.fillStyle = '#b9c6d3';
      ctx.beginPath();
      ctx.moveTo(-4, -5);
      ctx.lineTo(18, -28);
      ctx.lineTo(30, -26);
      ctx.lineTo(8, -4);
      ctx.closePath();
      ctx.fill();

      // horizontal stabilizer (tail plane)
      ctx.fillStyle = '#c9d4df';
      ctx.beginPath();
      ctx.moveTo(30, -3);
      ctx.lineTo(44, -14);
      ctx.lineTo(44, -5);
      ctx.lineTo(34, -2);
      ctx.closePath();
      ctx.fill();

      // fuselage
      const bodyG = ctx.createLinearGradient(0, -10, 0, 10);
      bodyG.addColorStop(0, '#ffffff');
      bodyG.addColorStop(0.5, '#f2f5f8');
      bodyG.addColorStop(1, '#d8e0e8');
      ctx.fillStyle = bodyG;
      ctx.beginPath();
      ctx.ellipse(0, 0, 48, 9.5, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,140,160,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // red accent stripe along the side
      ctx.fillStyle = '#e23d3d';
      ctx.beginPath();
      ctx.ellipse(0, 4.5, 46, 2.6, 0, 0, TAU);
      ctx.fill();

      // cockpit glass (nose)
      ctx.fillStyle = '#7fb8e8';
      ctx.beginPath();
      ctx.ellipse(-42, -3, 9, 6.5, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.ellipse(-44, -5, 3.5, 2, -0.4, 0, TAU);
      ctx.fill();

      // passenger windows
      ctx.fillStyle = '#7fb8e8';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(-24 + i * 11, -3, 2.4, 0, TAU);
        ctx.fill();
      }

      // tail fin
      ctx.fillStyle = '#e23d3d';
      ctx.beginPath();
      ctx.moveTo(38, -5);
      ctx.lineTo(50, -26);
      ctx.lineTo(54, -25);
      ctx.lineTo(48, -5);
      ctx.closePath();
      ctx.fill();

      // near wing (front)
      ctx.fillStyle = '#e6edf3';
      ctx.beginPath();
      ctx.moveTo(-8, 4);
      ctx.lineTo(20, 26);
      ctx.lineTo(34, 24);
      ctx.lineTo(10, 3);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,140,160,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // engine under the wing
      ctx.fillStyle = '#97a4b2';
      ctx.beginPath();
      ctx.ellipse(16, 18, 6.5, 3.5, 0.2, 0, TAU);
      ctx.fill();

      // spinning propeller
      const pa = game.t * 24 + pl.phase;
      ctx.strokeStyle = 'rgba(60,70,85,0.85)';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-48 + Math.cos(pa) * 12, -Math.sin(pa) * 12);
      ctx.lineTo(-48 - Math.cos(pa) * 12, Math.sin(pa) * 12);
      ctx.stroke();

      ctx.restore();
    }
  }

  function drawSatellites() {
    const TAU = Math.PI * 2;
    for (const s of game.satellites) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(0.15);
      // solar panel wings
      ctx.fillStyle = '#2b6fcf';
      ctx.fillRect(-22, -12, 8, 24);
      ctx.fillRect(14, -12, 8, 24);
      ctx.fillStyle = 'rgba(120,180,255,0.5)';
      ctx.fillRect(-21, -11, 6, 22);
      ctx.fillRect(15, -11, 6, 22);
      // moving glint sweeping across the panels
      const glintX = -24 + ((game.t * 18 + s.phase * 5) % 48);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.25 + 0.2 * Math.sin(game.t * 5 + s.phase)).toFixed(3) + ')';
      ctx.fillRect(glintX, -10, 4, 20);
      // panel struts
      ctx.strokeStyle = '#aab6c8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.lineTo(-4, 0);
      ctx.moveTo(4, 0);
      ctx.lineTo(14, 0);
      ctx.stroke();
      // body
      ctx.fillStyle = '#d7dde6';
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 9, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,140,160,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // antenna + dish (wobbling)
      ctx.save();
      ctx.translate(0, -4);
      ctx.rotate(Math.sin(game.t * 4.5 + s.phase) * 0.18);
      ctx.strokeStyle = '#c8d3e0';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -10, 4, Math.PI, 0);
      ctx.stroke();
      ctx.restore();
      // blinking status light
      ctx.fillStyle = Math.sin(game.t * 6 + s.phase) > 0 ? '#ff5a4a' : '#8c3228';
      ctx.beginPath();
      ctx.arc(0, -4, 1.6, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawAsteroids() {
    const TAU = Math.PI * 2;
    for (const a of game.asteroids) {
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.rot + Math.sin(game.t * 3.4 + a.phase) * 0.12);
      const g = ctx.createRadialGradient(-a.r * 0.3, -a.r * 0.3, a.r * 0.15, 0, 0, a.r);
      g.addColorStop(0, '#8a7a66');
      g.addColorStop(0.6, '#6b5c4c');
      g.addColorStop(1, '#3e342c');
      ctx.fillStyle = g;
      // lumpy rock outline
      ctx.beginPath();
      const bumps = 9;
      for (let i = 0; i <= bumps; i++) {
        const ang = (i / bumps) * TAU;
        const rr = a.r * (0.8 + 0.2 * Math.sin(ang * 3 + a.phase));
        const px = Math.cos(ang) * rr;
        const py = Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      // craters
      ctx.fillStyle = 'rgba(28,22,15,0.4)';
      ctx.beginPath();
      ctx.arc(-a.r * 0.25, a.r * 0.2, a.r * 0.26, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(a.r * 0.3, -a.r * 0.25, a.r * 0.18, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(a.r * 0.15, a.r * 0.35, a.r * 0.14, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPlanets() {
    const TAU = Math.PI * 2;
    const PAL = [
      ['#3f8fdd', '#2a66b5', '#cfe6f7'],
      ['#d96b3d', '#a3442a', '#f2b291'],
      ['#e8b93a', '#b98a2a', '#f8e6a8'],
      ['#5fae6a', '#3d8a4a', '#b8e0bd'],
      ['#bcd8e8', '#8fb3c9', '#eef7fb'],
    ];
    for (const p of game.planets) {
      const c = PAL[p.hue];
      ctx.save();
      ctx.translate(p.x, p.y);
      // ring behind
      if (p.ring) {
        ctx.strokeStyle = 'rgba(232,214,160,0.55)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r * 1.6, p.r * 0.42, -0.35, 0, TAU);
        ctx.stroke();
      }
      ctx.rotate(p.rot * 0.4);
      const g = ctx.createRadialGradient(-p.r * 0.35, -p.r * 0.35, p.r * 0.2, 0, 0, p.r);
      g.addColorStop(0, c[0]);
      g.addColorStop(0.75, c[1]);
      g.addColorStop(1, '#1a1420');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, p.r, 0, TAU);
      ctx.fill();
      // band stripes for the gas giant (drifting as it spins)
      if (p.hue === 2) {
        const bandOff = (game.t * 4 + p.phase * 7) % (p.r * 1.6);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(-p.r + bandOff, -p.r * 0.15, p.r * 1.1, p.r * 0.18);
        ctx.fillRect(-p.r - bandOff, p.r * 0.3, p.r * 1.1, p.r * 0.12);
      }
      // surface blobs (drifting across the face)
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      for (let i = 0; i < 4; i++) {
        const bx = -p.r * 0.5 + ((game.t * 3.2 + p.phase * 5 + i * 37) % (p.r * 2.2));
        const by = p.r * 0.1 + i * 5;
        ctx.beginPath();
        ctx.arc(bx, by, p.r * 0.14, 0, TAU);
        ctx.fill();
      }
      // highlight
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.ellipse(-p.r * 0.3, -p.r * 0.35, p.r * 0.4, p.r * 0.2, -0.5, 0, TAU);
      ctx.fill();
      // ring in front
      if (p.ring) {
        ctx.strokeStyle = 'rgba(232,214,160,0.5)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r * 1.6, p.r * 0.42, -0.35, Math.PI, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawPlants() {
    const TAU = Math.PI * 2;
    for (const p of game.plants) {
      const chomp = 0.5 + 0.5 * Math.sin(game.t * p.speed + p.phase);
      const sway = Math.sin(game.t * 2.1 + p.phase) * 0.07;
      const r = p.r;
      const pulse = 1 + Math.sin(game.t * 3.1 + p.phase) * 0.03 + chomp * 0.05;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(sway);

      // stem (tapered, swaying, with leaves and thorns)
      ctx.strokeStyle = '#2f7a2a';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 2);
      ctx.quadraticCurveTo(4 + sway * 8, r * 0.6, 2 + sway * 5, r + 8);
      ctx.quadraticCurveTo(0 + sway * 3, r + 14, -1, r + 20);
      ctx.stroke();
      // leaves
      ctx.fillStyle = '#55aa45';
      ctx.beginPath();
      ctx.ellipse(7, r + 12, 8, 4, 0.55 + sway, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,70,20,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(1, r + 12);
      ctx.lineTo(12, r + 10);
      ctx.stroke();
      ctx.fillStyle = '#4a9c3c';
      ctx.beginPath();
      ctx.ellipse(-6, r + 5, 6, 3, -0.4, 0, TAU);
      ctx.fill();
      // small thorn
      ctx.fillStyle = '#2f7a2a';
      ctx.beginPath();
      ctx.moveTo(3 + sway * 5, r * 0.35);
      ctx.lineTo(6 + sway * 5, r * 0.35 - 4);
      ctx.lineTo(5 + sway * 5, r * 0.35 + 2);
      ctx.closePath();
      ctx.fill();

      // head (juicy bulb) with a living pulse
      ctx.save();
      ctx.scale(pulse, 1 / Math.sqrt(pulse));
      const headG = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.15, 0, 0, r * 1.05);
      headG.addColorStop(0, '#8fe06b');
      headG.addColorStop(0.55, '#5fbf48');
      headG.addColorStop(1, '#348c2c');
      ctx.fillStyle = headG;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      // spiky fringe poking out all around the head
      ctx.fillStyle = '#3f9a34';
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU + p.phase;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * (r - 3), Math.sin(a) * (r - 3));
        ctx.lineTo(Math.cos(a) * (r + 3.5), Math.sin(a) * (r + 3.5));
        ctx.lineTo(Math.cos(a + 0.22) * (r - 3), Math.sin(a + 0.22) * (r - 3));
        ctx.closePath();
        ctx.fill();
      }
      // wart bumps
      ctx.fillStyle = 'rgba(18,70,20,0.28)';
      for (let i = 0; i < 5; i++) {
        const a = i * 2.4 + p.phase;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.11, 0, TAU);
        ctx.fill();
      }
      // glossy highlight
      ctx.fillStyle = 'rgba(220,255,190,0.35)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.32, -r * 0.38, r * 0.4, r * 0.22, -0.5, 0, TAU);
      ctx.fill();

      // mouth interior — grows wide when hungry
      ctx.fillStyle = '#b3202c';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * (0.5 + chomp * 0.55), r * (0.22 + chomp * 0.5), 0, 0, TAU);
      ctx.fill();
      // tongue wriggling inside
      const tongueX = Math.sin(game.t * 8 + p.phase) * r * 0.12;
      ctx.fillStyle = '#e05a5a';
      ctx.beginPath();
      ctx.ellipse(tongueX, r * 0.14, r * (0.18 + chomp * 0.1), r * 0.12, 0, 0, TAU);
      ctx.fill();

      // sharp teeth (upper + lower), spread apart as it chomps
      ctx.fillStyle = '#fdf6e3';
      const toothW = r * (0.12 + chomp * 0.16);
      for (let i = -2; i <= 2; i++) {
        const tx = i * r * 0.28;
        const ty = r * (0.22 + chomp * 0.42);
        ctx.beginPath();
        ctx.moveTo(tx - toothW, -ty);
        ctx.lineTo(tx, 0);
        ctx.lineTo(tx + toothW, -ty);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(tx - toothW, ty);
        ctx.lineTo(tx, 0);
        ctx.lineTo(tx + toothW, ty);
        ctx.closePath();
        ctx.fill();
      }

      // eyes when it's open and hunting (tracking the bird)
      if (chomp > 0.35) {
        const lookY = clamp((game.birdY - p.y) * 0.04, -1.2, 1.2);
        ctx.fillStyle = '#fefefe';
        ctx.beginPath();
        ctx.arc(-r * 0.38, -r * 0.55 + lookY, 2.4, 0, TAU);
        ctx.arc(r * 0.38, -r * 0.55 + lookY, 2.4, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#161616';
        ctx.beginPath();
        ctx.arc(-r * 0.38 + lookY * 0.3, -r * 0.55 + lookY, 1.2, 0, TAU);
        ctx.arc(r * 0.38 + lookY * 0.3, -r * 0.55 + lookY, 1.2, 0, TAU);
        ctx.fill();
        // angry brows
        ctx.strokeStyle = '#1c5c18';
        ctx.lineWidth = 1.8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-r * 0.55, -r * 0.74 + lookY * 0.6);
        ctx.lineTo(-r * 0.24, -r * 0.6 + lookY * 0.6);
        ctx.moveTo(r * 0.55, -r * 0.74 + lookY * 0.6);
        ctx.lineTo(r * 0.24, -r * 0.6 + lookY * 0.6);
        ctx.stroke();
        // drool dripping when hungry
        const droolLen = r * (0.5 + chomp * 0.5) + ((game.t * 22 + p.phase * 9) % 8);
        ctx.strokeStyle = 'rgba(180,240,210,0.55)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-r * 0.3, r * (0.22 + chomp * 0.5));
        ctx.lineTo(-r * 0.3, r * (0.22 + chomp * 0.5) + droolLen);
        ctx.moveTo(r * 0.3, r * (0.22 + chomp * 0.5));
        ctx.lineTo(r * 0.3, r * (0.22 + chomp * 0.5) + droolLen * 0.7);
        ctx.stroke();
      }

      ctx.restore();
      ctx.restore();
    }
  }

  function drawLava() {
    const TAU = Math.PI * 2;
    for (const L of game.lava) {
      const pulse = 0.5 + 0.5 * Math.sin(game.t * 12 + L.phase);
      ctx.save();
      ctx.translate(L.x, L.y);
      ctx.rotate(Math.atan2(L.x, -L.y) * 0.15 + Math.sin(game.t * 5 + L.phase) * 0.25);
      ctx.fillStyle = 'rgba(255,70,10,0.25)';
      ctx.beginPath();
      ctx.arc(0, 0, L.r + 5, 0, TAU);
      ctx.fill();
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, L.r);
      g.addColorStop(0, '#fff3c0');
      g.addColorStop(0.35, '#ffcc33');
      g.addColorStop(0.7, '#ff7b1f');
      g.addColorStop(1, '#d83a10');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, L.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,' + (0.3 + pulse * 0.35).toFixed(2) + ')';
      ctx.beginPath();
      ctx.arc(-L.r * 0.3, -L.r * 0.35, L.r * 0.3, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    for (const e of game.volcanoEmbers) {
      const k = 1 - e.age / e.life;
      ctx.fillStyle = 'rgba(255,180,60,' + (0.7 * k).toFixed(2) + ')';
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * (0.5 + k * 0.5), 0, TAU);
      ctx.fill();
    }
  }

  function drawVolcanoSparks() {
    const TAU = Math.PI * 2;
    if (game.sparkWarnT > 0) {
      const k = Math.max(0, game.sparkWarnT / 0.5);
      ctx.save();
      ctx.fillStyle = 'rgba(255,220,120,' + (0.55 * k).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(GAME_W - 78, SKY_H - 246, 22 + (1 - k) * 16, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,230,' + (0.9 * k).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(GAME_W - 78, SKY_H - 246, 8, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    for (const s of game.volcanoSparks) {
      const flicker = 0.7 + 0.3 * Math.sin(s.phase * 24);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.fillStyle = 'rgba(255,120,20,' + (0.28 * flicker).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(0, 0, s.r + 4, 0, TAU);
      ctx.fill();
      const g = ctx.createRadialGradient(0, 0, 0.5, 0, 0, s.r);
      g.addColorStop(0, '#fffbe0');
      g.addColorStop(0.4, '#ffd43b');
      g.addColorStop(1, '#ff7b1f');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, s.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,170,60,0.85)';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-s.vx * 1.6, -s.vy * 1.6);
      ctx.lineTo(0, 0);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawHurricanes() {
    const TAU = Math.PI * 2;
    for (const H of game.hurricanes) {
      ctx.save();
      ctx.translate(H.x, H.y);
      // soft outer glow
      const glow = ctx.createRadialGradient(0, 0, H.r * 0.4, 0, 0, H.r * 1.9);
      glow.addColorStop(0, 'rgba(200,230,245,0.5)');
      glow.addColorStop(1, 'rgba(130,180,210,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, H.r * 1.9, 0, TAU);
      ctx.fill();
      // rotating cloud spiral
      for (let arm = 0; arm < 3; arm++) {
        ctx.strokeStyle = 'rgba(190,220,240,' + (0.75 - arm * 0.18).toFixed(2) + ')';
        ctx.lineWidth = H.r * 0.42 - arm * H.r * 0.1;
        ctx.beginPath();
        for (let a = 0; a < TAU * 1.4; a += 0.1) {
          const rr = H.r * 0.16 + a * H.r * 0.09;
          const xx = Math.cos(a + H.phase + (arm * TAU) / 3) * rr;
          const yy = Math.sin(a + H.phase + (arm * TAU) / 3) * rr;
          if (a === 0) ctx.moveTo(xx, yy);
          else ctx.lineTo(xx, yy);
        }
        ctx.stroke();
      }
      // pale rain bands inside the vortex
      ctx.strokeStyle = 'rgba(140,185,210,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let b = 0; b < 5; b++) {
        const rr = H.r * 0.25 + b * H.r * 0.28;
        ctx.moveTo(-rr, 0);
        ctx.quadraticCurveTo(0, -rr * 0.55, rr, 0);
      }
      ctx.stroke();
      // swirling cloud puffs
      ctx.fillStyle = 'rgba(225,240,248,0.45)';
      for (let p = 0; p < 7; p++) {
        const rr = H.r * 0.35 + ((p * 37) % 60) * H.r * 0.011;
        const aa = p * 2.1 + H.phase;
        ctx.beginPath();
        ctx.arc(Math.cos(aa) * rr, Math.sin(aa) * rr, H.r * 0.16 + (p % 3) * 2, 0, TAU);
        ctx.fill();
      }
      // calm eye at the very center
      const eye = ctx.createRadialGradient(0, 0, 1, 0, 0, H.r * 0.3);
      eye.addColorStop(0, 'rgba(245,252,255,0.95)');
      eye.addColorStop(1, 'rgba(200,225,240,0.6)');
      ctx.fillStyle = eye;
      ctx.beginPath();
      ctx.arc(0, 0, H.r * 0.3, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawRain() {
    if (game.stage !== 6 && game.stage !== 15) return;
    if (game.stage === 6) {
      ctx.strokeStyle = 'rgba(170,195,230,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 34; i++) {
        const x = ((i * 73 + game.t * 380) % (GAME_W + 60)) - 30;
        const y = ((i * 137 + game.t * 820) % (GAME_H + 40)) - 20;
        ctx.moveTo(x, y);
        ctx.lineTo(x - 3, y + 15);
      }
      ctx.stroke();
    } else {
      // hurricane downpour: heavier, faster, more slanted
      ctx.strokeStyle = 'rgba(180,205,225,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 60; i++) {
        const x = ((i * 79 + game.t * 680) % (GAME_W + 140)) - 70;
        const y = ((i * 149 + game.t * 1400) % (GAME_H + 60)) - 30;
        ctx.moveTo(x, y);
        ctx.lineTo(x - 10, y + 24);
      }
      ctx.stroke();
    }
  }

  function drawLightnings() {
    const TAU = Math.PI * 2;
    for (const L of game.lightnings) {
      if (L.phase === 0) {
        // telegraph: three red flashes along the strike line
        const flashes = [0.35, 1.1, 1.85];
        let active = false;
        for (const ft of flashes) {
          if (L.t >= ft && L.t < ft + 0.35) active = true;
        }
        const pulse = active ? 0.85 : 0.28;
        ctx.strokeStyle = 'rgba(255,55,45,' + pulse + ')';
        ctx.lineWidth = active ? 4 : 2;
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        ctx.moveTo(0, L.y);
        ctx.lineTo(GAME_W, L.y);
        ctx.stroke();
        ctx.setLineDash([]);
        // warning bolt glyph at the top of the line
        ctx.fillStyle = 'rgba(255,80,60,' + pulse + ')';
        ctx.beginPath();
        ctx.arc(BIRD_X, 14, 6, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,240,220,0.95)';
        ctx.font = 'bold 10px ' + UI_FONT;
        ctx.textAlign = 'center';
        ctx.fillText('!', BIRD_X, 17);
      } else if (L.phase === 1) {
        // strike: bright jagged bolt at the target altitude
        const k = Math.max(0, 1 - L.t / 0.6);
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,235,0.95)';
        ctx.lineWidth = 3;
        ctx.shadowColor = 'rgba(255,255,255,0.9)';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(0, L.y);
        const segs = 12;
        for (let i = 1; i <= segs; i++) {
          const x = (i / segs) * GAME_W;
          const y = L.y + (i % 2 === 0 ? 1 : -1) * (6 + Math.sin(game.t * 30 + i) * 5);
          ctx.lineTo(x, y);
        }
        ctx.stroke();
        // branch forks
        ctx.strokeStyle = 'rgba(255,255,200,' + (0.7 * k) + ')';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const x = Math.random() * GAME_W;
          ctx.moveTo(x, L.y);
          ctx.lineTo(x + 14, L.y - 18);
        }
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawDecor() {
    if (game.stage !== 5 && game.stage !== 8 && game.stage !== 9 && game.stage !== 10 && game.stage !== 11 && game.stage !== 13 && game.stage !== 14 && game.stage !== 15) return;
    const y = SKY_H;
    if (game.stage === 5) {
      // floodlight towers
      ctx.fillStyle = 'rgba(48,58,68,0.9)';
      ctx.fillRect(14, 26, 5, 34);
      ctx.fillRect(384, 26, 5, 34);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(16, 24, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(388, 24, 7, 0, Math.PI * 2);
      ctx.fill();
      // crowd stands along the top
      const cOff = game.groundOffset % 26;
      const cols = ['#e53935', '#fdd835', '#1e88e5', '#43a047', '#fafafa', '#d81b60', '#fb8c00'];
      for (let row = 0; row < 2; row++) {
        for (let gx = -26 + cOff; gx < GAME_W + 26; gx += 26) {
          ctx.fillStyle = cols[Math.abs(Math.floor((gx * 7 + row * 13))) % cols.length];
          ctx.fillRect(gx + row * 13, 6 + row * 11, 8, 8);
        }
      }
      // white pitch lines scrolling with the field
      const lo = game.groundOffset % 120;
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let gx = -120 + lo; gx < GAME_W + 120; gx += 120) {
        ctx.moveTo(gx, y + 8);
        ctx.lineTo(gx, y + GROUND_H - 6);
      }
      ctx.stroke();
      // goal frame at the right edge
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(362, y);
      ctx.lineTo(362, y - 36);
      ctx.lineTo(420, y - 36);
      ctx.lineTo(420, y);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let nx = 362; nx <= 420; nx += 7) {
        ctx.moveTo(nx, y);
        ctx.lineTo(nx, y - 36);
      }
      for (let ny = y - 32; ny < y; ny += 7) {
        ctx.moveTo(362, ny);
        ctx.lineTo(420, ny);
      }
      ctx.stroke();
    } else if (game.stage === 8) {
      // control tower on the right
      ctx.fillStyle = 'rgba(70,80,95,0.95)';
      ctx.fillRect(372, 150, 26, y - 150);
      ctx.fillStyle = '#9fb3c9';
      ctx.beginPath();
      ctx.arc(385, 142, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#5b6b7d';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#cfe6f7';
      ctx.beginPath();
      ctx.arc(385, 142, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(60,80,110,0.6)';
      ctx.beginPath();
      ctx.arc(385, 142, 8, 0, Math.PI);
      ctx.fill();
      // hangar on the left
      ctx.fillStyle = 'rgba(90,100,115,0.9)';
      ctx.beginPath();
      ctx.moveTo(20, y);
      ctx.lineTo(20, y - 70);
      ctx.lineTo(78, y - 70);
      ctx.lineTo(78, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(120,132,150,0.95)';
      ctx.beginPath();
      ctx.arc(49, y - 70, 30, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(60,70,85,0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#5b6b7d';
      ctx.fillRect(40, y - 46, 20, 46);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(50, y - 46);
      ctx.lineTo(50, y);
      ctx.stroke();
      // windsock
      ctx.strokeStyle = 'rgba(80,90,105,0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(148, y);
      ctx.lineTo(148, y - 46);
      ctx.stroke();
      ctx.fillStyle = '#e2723a';
      ctx.beginPath();
      ctx.ellipse(148, y - 46, 3, 14, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#f4b23c';
      ctx.beginPath();
      ctx.ellipse(148, y - 40, 2.6, 10, 0, Math.PI, 0);
      ctx.fill();
    } else if (game.stage === 9) {
      if (game.mode === 'over') return; // the growing Earth handles the scared dive
      // Earth below: huge blue planet curve rising from the bottom
      ctx.fillStyle = '#2a6fb8';
      ctx.beginPath();
      ctx.arc(GAME_W / 2, GAME_H + 300, 430, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3f8fdd';
      ctx.beginPath();
      ctx.arc(GAME_W / 2, GAME_H + 300, 415, 0, Math.PI * 2);
      ctx.fill();
      // cloud swirls
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.ellipse(GAME_W * 0.38, GAME_H + 40, 60, 16, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(GAME_W * 0.6, GAME_H + 90, 80, 18, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(GAME_W * 0.52, GAME_H + 150, 50, 14, -0.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (game.stage === 10) {
      // distant ringed planet and small moon in the background
      ctx.fillStyle = '#b8894a';
      ctx.beginPath();
      ctx.arc(70, 90, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(230,190,120,0.7)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(70, 90, 44, 12, -0.35, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#9aa4ad';
      ctx.beginPath();
      ctx.arc(150, 140, 7, 0, Math.PI * 2);
      ctx.fill();
    } else if (game.stage === 11) {
      // giant distant sun in the background
      const sunG = ctx.createRadialGradient(GAME_W - 40, 60, 4, GAME_W - 40, 60, 90);
      sunG.addColorStop(0, 'rgba(255,240,180,0.95)');
      sunG.addColorStop(0.4, 'rgba(255,200,90,0.35)');
      sunG.addColorStop(1, 'rgba(255,200,90,0)');
      ctx.fillStyle = sunG;
      ctx.beginPath();
      ctx.arc(GAME_W - 40, 60, 90, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffdf8a';
      ctx.beginPath();
      ctx.arc(GAME_W - 40, 60, 34, 0, Math.PI * 2);
      ctx.fill();
    } else if (game.stage === 13) {
      // hanging jungle vines
      ctx.strokeStyle = 'rgba(50,120,60,0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const vx = 30 + i * 120;
        ctx.moveTo(vx, 0);
        ctx.quadraticCurveTo(vx + 8, 60, vx - 4, 110);
      }
      ctx.stroke();
      // big leaves on the vines
      ctx.fillStyle = 'rgba(70,160,80,0.85)';
      for (let i = 0; i < 4; i++) {
        const vx = 34 + i * 120;
        ctx.beginPath();
        ctx.ellipse(vx, 55, 14, 7, 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(vx - 6, 90, 12, 6, -0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      // giant background flower
      ctx.fillStyle = '#e8723a';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(372 + Math.cos(a) * 22, 60 + Math.sin(a) * 22, 12, 6, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#f8c04a';
      ctx.beginPath();
      ctx.arc(372, 60, 12, 0, Math.PI * 2);
      ctx.fill();
    } else if (game.stage === 14) {
      // volcano mountain on the right
      ctx.fillStyle = 'rgba(50,26,20,0.95)';
      ctx.beginPath();
      ctx.moveTo(GAME_W - 210, y);
      ctx.lineTo(GAME_W - 60, y - 250);
      ctx.lineTo(GAME_W + 40, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(70,36,24,0.9)';
      ctx.beginPath();
      ctx.moveTo(GAME_W - 140, y);
      ctx.lineTo(GAME_W - 40, y - 120);
      ctx.lineTo(GAME_W - 20, y);
      ctx.closePath();
      ctx.fill();
      // glowing crater
      const crater = ctx.createRadialGradient(GAME_W - 78, y - 246, 4, GAME_W - 78, y - 246, 34);
      crater.addColorStop(0, 'rgba(255,220,120,0.95)');
      crater.addColorStop(0.5, 'rgba(255,120,40,0.6)');
      crater.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = crater;
      ctx.beginPath();
      ctx.ellipse(GAME_W - 78, y - 244, 30, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      // distant dark peaks
      ctx.fillStyle = 'rgba(60,32,22,0.6)';
      ctx.beginPath();
      ctx.moveTo(GAME_W - 250, y);
      ctx.lineTo(GAME_W - 190, y - 90);
      ctx.lineTo(GAME_W - 150, y);
      ctx.closePath();
      ctx.fill();
    } else if (game.stage === 15) {
      // giant hurricane spiral looming in the distance
      const cx = GAME_W - 96;
      const cy = 150;
      const TAU = Math.PI * 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.sin(game.t * 0.4) * 0.1);
      // inner eye
      const eye = ctx.createRadialGradient(0, 0, 6, 0, 0, 34);
      eye.addColorStop(0, 'rgba(235,250,255,0.85)');
      eye.addColorStop(0.5, 'rgba(190,225,240,0.4)');
      eye.addColorStop(1, 'rgba(150,200,225,0)');
      ctx.fillStyle = eye;
      ctx.beginPath();
      ctx.arc(0, 0, 34, 0, TAU);
      ctx.fill();
      // spinning spiral arms
      for (let arm = 0; arm < 3; arm++) {
        ctx.strokeStyle = 'rgba(175,215,230,' + (0.5 - arm * 0.09).toFixed(2) + ')';
        ctx.lineWidth = 9 - arm * 2;
        ctx.beginPath();
        for (let a = 0; a < TAU * 1.5; a += 0.12) {
          const rr = 14 + a * 9;
          const xx = Math.cos(a + (arm * TAU) / 3 + game.t * 0.9) * rr;
          const yy = Math.sin(a + (arm * TAU) / 3 + game.t * 0.9) * rr;
          if (a === 0) ctx.moveTo(xx, yy);
          else ctx.lineTo(xx, yy);
        }
        ctx.stroke();
      }
      // cloud puffs along the swirl
      ctx.fillStyle = 'rgba(120,165,185,0.35)';
      for (let p = 0; p < 12; p++) {
        const rr = 22 + ((p * 37) % 78);
        const aa = p * 1.9 + game.t * 0.9;
        ctx.beginPath();
        ctx.arc(Math.cos(aa) * rr, Math.sin(aa) * rr, 10 + (p % 3) * 4, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      // blow-away streaks racing across the sky
      ctx.strokeStyle = 'rgba(190,220,235,0.28)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const sx = ((i * 137 + game.t * 460) % (GAME_W + 160)) - 80;
        const sy = 30 + ((i * 89) % 200);
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + 40, sy - 6);
      }
      ctx.stroke();
      // churning stormy sea foam at the top of the ground
      ctx.fillStyle = 'rgba(230,244,250,0.4)';
      ctx.fillRect(0, y, GAME_W, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(0, y + 3, GAME_W, 1);
    }
  }

  function drawSpaceEarth() {
    const fall = Math.max(0, game.dieT - 0.35) / 2;
    const grow = Math.min(1, fall);
    const R = 240 + grow * 300;
    const cx = GAME_W * 0.5;
    const cy = GAME_H + 60 + grow * 140;
    const glow = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 1.4);
    glow.addColorStop(0, 'rgba(130,195,255,0.3)');
    glow.addColorStop(1, 'rgba(130,195,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a6fb8';
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3f8fdd';
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.96, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(cx - R * 0.3, cy - R * 0.35, R * 0.2, R * 0.055, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + R * 0.12, cy + R * 0.05, R * 0.24, R * 0.06, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + R * 0.28, cy - R * 0.2, R * 0.16, R * 0.045, -0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function paintEggShell(fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,220,180,0.7)';
    ctx.beginPath();
    ctx.ellipse(-2, -2, 5, 7, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(180,120,60,0.5)';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(((i * 53) % 12) - 6, ((i * 97) % 14) - 7, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(150,110,60,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 15, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  function paintEggHalf(fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,110,60,0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI);
    ctx.closePath();
    ctx.stroke();
  }

  function drawEgg(x, y, idx) {
    const intact = game.eggs[idx];
    const bounce = game.eggBounce[idx];
    const danger = game.rats.some((r) => r.state === 'danger' && r.side === (idx === 0 ? 'L' : 'R'));
    const safe = game.nestEnding === 'win' || game.mode === 'nestReady';
    let wig = Math.sin(game.t * 2.4 + idx * 1.7) * 0.06;
    if (danger) wig += Math.sin(game.t * 22 + idx * 2) * 0.14;
    if (safe) wig += Math.sin(game.t * 3.2 + idx) * 0.06;
    const bob = bounce > 0 ? Math.sin(Math.min(1, bounce) * Math.PI) : 0;
    const hop = bob * 9;
    const squish = 1 - Math.min(0.12, bob * 0.1 + Math.abs(wig) * 0.08);
    // slow breathing: the shell gently expands and contracts
    const breathe = 1 + Math.sin(game.t * 2.2 + idx * 1.3) * 0.03;

    ctx.save();
    ctx.translate(x, y - hop);
    ctx.rotate(wig);
    ctx.scale(breathe, squish * (2 - breathe));

    if (intact) {
      paintEggShell('#fff6e0');
    } else {
      const k = Math.min(1, game.eggCr[idx] / 0.45);
      if (k < 0.22) {
        paintEggShell('#fff6e0');
        ctx.strokeStyle = 'rgba(140,100,50,0.9)';
        ctx.lineWidth = 1.6;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(-k * 30 + 2, -8);
        ctx.lineTo(-k * 8 + 1, -2);
        ctx.lineTo(-k * 14 - 1, 4);
        ctx.lineTo(-k * 4, 9);
        ctx.stroke();
      } else {
        const s = clamp((k - 0.22) / 0.55, 0, 1);
        ctx.fillStyle = '#f2b134';
        ctx.beginPath();
        ctx.ellipse(1, 3, 5.5, 4.5, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e89a1e';
        ctx.beginPath();
        ctx.ellipse(2, 3, 3.4, 2.7, 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.save();
        ctx.translate(-2 - s * 6, -2 + s * 3);
        ctx.rotate(-0.5 - s * 0.3);
        paintEggHalf('#f3ead0');
        ctx.restore();
        ctx.save();
        ctx.translate(3 + s * 5, 1 + s * 4);
        ctx.rotate(0.6 + s * 0.3);
        paintEggHalf('#f9f2dd');
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function drawRat(r) {
    ctx.save();
    ctx.translate(r.x, r.y);
    if (r.state === 'walk' || r.state === 'danger' || r.state === 'retreat') {
      ctx.rotate(-Math.PI / 2);
    } else {
      ctx.scale(r.w, 1);
      ctx.rotate(r.rot);
    }
    ctx.strokeStyle = '#b98a9e';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-12, -2);
    ctx.quadraticCurveTo(-22, -6 + Math.sin(r.t * 18) * 3, -27, 2);
    ctx.stroke();
    ctx.fillStyle = '#9aa0a8';
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#aeb4bd';
    ctx.beginPath();
    ctx.ellipse(12, -4, 7, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d8a0b0';
    ctx.beginPath();
    ctx.ellipse(9, -9, 3.5, 4, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(14.5, -5, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e07a8a';
    ctx.beginPath();
    ctx.arc(18, -2, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8a9099';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4, 7);
    ctx.lineTo(-4, 11);
    ctx.moveTo(4, 7);
    ctx.lineTo(4, 11);
    ctx.stroke();
    ctx.restore();
  }

  function drawRatPrompt(r) {
    if (r.state !== 'danger') return;
    const bob = Math.sin(game.t * 10) * 3;
    const bx = r.x;
    const by = r.y - 36 + bob;
    const label = r.side === 'L' ? '<' : '>';
    ctx.font = 'bold 16px ' + UI_FONT;
    const w = ctx.measureText(label).width + 24;
    ctx.fillStyle = 'rgba(40,30,20,0.85)';
    roundRect(bx - w / 2, by - 22, w, 28, 9);
    ctx.fill();
    ctx.strokeStyle = '#ffd23d';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffd23d';
    ctx.textAlign = 'center';
    ctx.fillText(label, bx, by + 2);
    ctx.textAlign = 'center';
  }

  function drawPoofs() {
    for (const p of game.poofs) {
      const k = 1 - p.age / p.life;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.min(1, k * 1.4);
      ctx.fillStyle = p.col;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.r, p.r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawTree() {
    const tx = NEST_X;
    const topY = 300;
    // trunk (tapers upward, rooted into the ground)
    const trunkGrad = ctx.createLinearGradient(tx - 18, 0, tx + 18, 0);
    trunkGrad.addColorStop(0, '#5d3f1e');
    trunkGrad.addColorStop(0.5, '#8a5f32');
    trunkGrad.addColorStop(1, '#4a3018');
    ctx.fillStyle = trunkGrad;
    ctx.beginPath();
    ctx.moveTo(tx - 24, GAME_H + 10);
    ctx.lineTo(tx - 20, SKY_H + 4);
    ctx.lineTo(tx - 15, topY + 8);
    ctx.quadraticCurveTo(tx - 17, topY - 6, tx - 5, topY - 14);
    ctx.lineTo(tx + 5, topY - 14);
    ctx.quadraticCurveTo(tx + 17, topY - 6, tx + 15, topY + 8);
    ctx.lineTo(tx + 20, SKY_H + 4);
    ctx.lineTo(tx + 24, GAME_H + 10);
    ctx.closePath();
    ctx.fill();
    // bark lines
    ctx.strokeStyle = 'rgba(60,38,14,0.55)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const by = 500 - i * 34;
      ctx.beginPath();
      ctx.moveTo(tx - 21, by);
      ctx.quadraticCurveTo(tx, by - 9, tx + 21, by - 2);
      ctx.stroke();
    }
    // branches reaching out where the nest sits
    ctx.strokeStyle = '#6b4a24';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tx - 12, topY - 2);
    ctx.quadraticCurveTo(tx - 50, topY - 16, tx - 82, topY - 56);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx + 12, topY - 2);
    ctx.quadraticCurveTo(tx + 50, topY - 16, tx + 82, topY - 56);
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(tx - 4, topY - 10);
    ctx.quadraticCurveTo(tx - 38, topY - 38, tx - 62, topY - 90);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx + 4, topY - 10);
    ctx.quadraticCurveTo(tx + 38, topY - 38, tx + 62, topY - 90);
    ctx.stroke();
    // canopy leaves framing the nest
    const leafCols = ['#4f8f34', '#5da33f', '#6fb74c', '#437e2c', '#58a33c'];
    const blobs = [
      [0, -96, 40, 30],
      [-56, -70, 40, 32],
      [56, -70, 40, 32],
      [-92, -28, 34, 30],
      [92, -28, 34, 30],
      [-24, -112, 28, 24],
      [24, -112, 28, 24],
      [-120, 14, 26, 24],
      [120, 14, 26, 24],
      [0, -52, 26, 22],
    ];
    for (let i = 0; i < blobs.length; i++) {
      const b = blobs[i];
      const wob = Math.sin(game.t * 1.5 + i * 0.85) * 1.4;
      ctx.fillStyle = leafCols[i % leafCols.length];
      ctx.beginPath();
      ctx.ellipse(tx + b[0] + wob, NEST_Y + b[1], b[2], b[3], wob * 0.015, 0, Math.PI * 2);
      ctx.fill();
    }
    // leaf highlights
    ctx.fillStyle = 'rgba(200,240,150,0.18)';
    for (let i = 0; i < blobs.length; i++) {
      const b = blobs[i];
      const wob = Math.sin(game.t * 1.5 + i * 0.85) * 1.4;
      ctx.beginPath();
      ctx.ellipse(tx + b[0] - 8 + wob, NEST_Y + b[1] - 8, b[2] * 0.4, b[3] * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawNestScene() {
    drawTree();
    const ny = NEST_Y;
    ctx.fillStyle = '#7d4f26';
    ctx.beginPath();
    ctx.ellipse(NEST_X, ny, 48, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#96622f';
    ctx.beginPath();
    ctx.ellipse(NEST_X, ny - 6, 46, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,40,18,0.6)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (let i = -42; i <= 42; i += 8) {
      ctx.beginPath();
      ctx.moveTo(NEST_X + i, ny - 9 + Math.sin(i * 0.5) * 3);
      ctx.quadraticCurveTo(NEST_X + i + 4, ny + 2, NEST_X + i + 8, ny + 3 + Math.cos(i * 0.7) * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,235,200,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(NEST_X, ny - 6, 40, 9, 0, 0.4, Math.PI - 0.4);
    ctx.stroke();
    drawEgg(NEST_X - 24, ny - 22, 0);
    drawEgg(NEST_X + 24, ny - 22, 1);
    for (const r of game.rats) drawRat(r);
    for (const r of game.rats) drawRatPrompt(r);
    drawPoofs();
  }

  function drawNestButtons() {
    const by = GAME_H - 58;
    const lDanger = game.rats.some((r) => r.state === 'danger' && r.side === 'L');
    const rDanger = game.rats.some((r) => r.state === 'danger' && r.side === 'R');
    const drawSide = (cx, arrow, danger) => {
      const pulse = danger ? 1 + Math.sin(game.t * 14) * 0.08 : 1;
      ctx.save();
      ctx.translate(cx, by);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = danger ? '#ff5d4d' : 'rgba(60,50,35,0.55)';
      ctx.beginPath();
      ctx.arc(0, 0, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = danger ? '#fff0d0' : 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.font = 'bold 30px ' + UI_FONT;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(arrow, 0, 2);
      if (danger) {
        ctx.font = 'bold 12px ' + UI_FONT;
        ctx.fillText('PRESS!', 0, 54);
      }
      ctx.restore();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
    };
    drawSide(58, '<', lDanger);
    drawSide(GAME_W - 58, '>', rDanger);
  }

  function drawNestHud() {
    for (let i = 0; i < 2; i++) {
      const ex = 34 + i * 30;
      const ey = 40;
      const bounce = game.eggBounce[i];
      const bob = bounce > 0 ? Math.sin(Math.min(1, bounce) * Math.PI) : 0;
      const danger = game.rats.some((r) => r.state === 'danger' && r.side === (i === 0 ? 'L' : 'R'));
      ctx.save();
      ctx.translate(ex, ey - bob * 6);
      if (danger) ctx.rotate(Math.sin(game.t * 22) * 0.18);
      if (game.eggs[i]) {
        ctx.fillStyle = '#fff6e0';
        ctx.beginPath();
        ctx.ellipse(0, 0, 12, 15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(80,60,30,0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, 12, 15, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(120,90,50,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    const pw = 128;
    const px = GAME_W - pw - 24;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    roundRect(px, 28, pw, 18, 9);
    ctx.fill();
    const frac = Math.min(1, game.ratsSaved / NEST_TARGET);
    ctx.fillStyle = '#8ce34c';
    roundRect(px, 28, Math.max(9, pw * frac), 18, 9);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    roundRect(px, 28, pw, 18, 9);
    ctx.stroke();
    ctx.font = 'bold 13px ' + UI_FONT;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(game.ratsSaved + ' / ' + NEST_TARGET, GAME_W / 2, 42);
  }

  function drawSplashes() {
    for (const pt of game.splashes) {
      const k = pt.age / pt.life;
      ctx.globalAlpha = 0.85 * (1 - k);
      ctx.fillStyle = '#d8f2fb';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, Math.max(0.5, pt.r * (1 - k * 0.5)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  const GROUND_TILE = 56;
  const groundSpeckles = (() => {
    const a = [];
    for (let i = 0; i < 46; i++) {
      a.push({
        x: Math.random() * GROUND_TILE,
        y: 6 + Math.random() * (GROUND_H - 8),
        r: 0.8 + Math.random() * 1.8,
        c: Math.random() < 0.5 ? 'rgba(132,98,50,0.28)' : 'rgba(255,240,205,0.4)',
      });
    }
    return a;
  })();
  const groundPatches = (() => {
    const a = [];
    for (let i = 0; i < 14; i++) {
      a.push({
        x: Math.random() * GROUND_TILE,
        y: 10 + Math.random() * (GROUND_H - 24),
        w: 10 + Math.random() * 18,
        h: 4 + Math.random() * 7,
        c: Math.random() < 0.5 ? 'rgba(158,122,66,0.2)' : 'rgba(214,178,120,0.18)',
      });
    }
    return a;
  })();

  function drawGround(biome) {
    const y = SKY_H;
    const sand = ctx.createLinearGradient(0, y, 0, y + GROUND_H);
    sand.addColorStop(0, biome.sandTop);
    sand.addColorStop(0.4, biome.sandMid);
    sand.addColorStop(1, biome.sandBot);
    ctx.fillStyle = sand;
    ctx.fillRect(0, y, GAME_W, GROUND_H);

    const off = game.groundOffset % GROUND_TILE;
    if (biome.ground === 'sea') {
      // water surface ripples + foam
      const wo = game.groundOffset % 34;
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      for (let wx = -34 + wo; wx < GAME_W + 34; wx += 34) {
        ctx.beginPath();
        ctx.ellipse(wx, y + 12, 13, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(wx + 17, y + 32, 10, 2.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(235,252,255,0.4)';
      ctx.fillRect(0, y, GAME_W, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(0, y + 3, GAME_W, 1);
      const shallow = ctx.createLinearGradient(0, y, 0, y + 18);
      shallow.addColorStop(0, 'rgba(120,220,235,0.45)');
      shallow.addColorStop(1, 'rgba(60,160,200,0)');
      ctx.fillStyle = shallow;
      ctx.fillRect(0, y, GAME_W, 18);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 0; i < 6; i++) {
        const glx = ((i * 97 + game.t * 55) % (GAME_W + 40)) - 20;
        const gly = y + 8 + ((i * 47 + Math.sin(game.t + i) * 14) % 26);
        ctx.beginPath();
        ctx.arc(glx, gly, 1.2 + (i % 2), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (biome.ground === 'lava') {
      const lo = game.groundOffset % 90;
      ctx.fillStyle = 'rgba(255,170,50,0.45)';
      for (let lx = -90 + lo; lx < GAME_W + 90; lx += 90) {
        ctx.beginPath();
        ctx.moveTo(lx, y);
        ctx.lineTo(lx + 34, y + GROUND_H);
        ctx.lineTo(lx + 42, y + GROUND_H);
        ctx.lineTo(lx + 16, y);
        ctx.closePath();
        ctx.fill();
      }
      const glow = ctx.createLinearGradient(0, y, 0, y + 16);
      glow.addColorStop(0, 'rgba(255,225,120,0.9)');
      glow.addColorStop(1, 'rgba(255,130,45,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, y, GAME_W, 16);
      ctx.fillStyle = 'rgba(255,200,90,0.55)';
      for (let i = 0; i < 9; i++) {
        const bx = ((i * 73 + game.t * 26) % (GAME_W + 50)) - 25;
        const by = y + 24 + ((i * 41) % 40);
        ctx.beginPath();
        ctx.arc(bx, by, 3 + (i % 3), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(0, y, GAME_W, 2);
    } else if (biome.ground !== 'pitch' && biome.ground !== 'tarmac' && biome.ground !== 'space' && biome.ground !== 'lava') {
      for (const pa of groundPatches) {
        ctx.fillStyle = pa.c;
        for (let tx = -GROUND_TILE; tx < GAME_W + GROUND_TILE; tx += GROUND_TILE) {
          ctx.beginPath();
          ctx.ellipse(tx + pa.x - off, y + pa.y, pa.w, pa.h, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      for (const sp of groundSpeckles) {
        ctx.fillStyle = sp.c;
        for (let tx = -GROUND_TILE; tx < GAME_W + GROUND_TILE; tx += GROUND_TILE) {
          ctx.beginPath();
          ctx.arc(tx + sp.x - off, y + sp.y, sp.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    if (biome.ground === 'grass') {
      const grass = ctx.createLinearGradient(0, y, 0, y + 20);
      grass.addColorStop(0, biome.grassTop);
      grass.addColorStop(0.35, biome.grassMid);
      grass.addColorStop(0.7, biome.grassBot);
      grass.addColorStop(1, biome.sandTop);
      ctx.fillStyle = grass;
      ctx.fillRect(0, y, GAME_W, 20);
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      ctx.fillRect(0, y, GAME_W, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(0, y + 2, GAME_W, 1);

      const off2 = game.groundOffset % 12;
      ctx.strokeStyle = biome.grassBot;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let gx = -12 + off2; gx < GAME_W + 12; gx += 12) {
        const h1 = 7 + ((gx * 7) % 5);
        const h2 = 4 + ((gx * 13) % 4);
        const sway = Math.sin(game.t * 3.2 + gx * 0.2) * 1.8;
        ctx.moveTo(gx, y + 17);
        ctx.lineTo(gx + 2 + sway * 0.4, y + 17 - h1);
        ctx.moveTo(gx + 5, y + 17);
        ctx.lineTo(gx + 7 + sway * 0.55, y + 17 - h2);
      }
      ctx.stroke();

      ctx.strokeStyle = 'rgba(90,140,40,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let gx = -6 + off2; gx < GAME_W + 6; gx += 12) {
        ctx.moveTo(gx, y + 17);
        ctx.lineTo(gx + 3, y + 9);
      }
      ctx.stroke();

      ctx.strokeStyle = 'rgba(100,160,50,0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let gx = -3 + off2; gx < GAME_W + 3; gx += 8) {
        const tall = 5 + ((gx * 11) % 7);
        const sway2 = Math.sin(game.t * 2.8 + gx * 0.35) * 2.2;
        ctx.moveTo(gx + 2, y + 18);
        ctx.quadraticCurveTo(gx + 2 + sway2 * 0.5, y + 18 - tall * 0.5, gx + 2 + sway2, y + 18 - tall);
      }
      ctx.stroke();

      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.fillRect(0, y + 17, GAME_W, 3);
    } else if (biome.ground === 'sand') {
      ctx.fillStyle = 'rgba(120,80,30,0.15)';
      ctx.fillRect(0, y + 14, GAME_W, 4);
    } else if (biome.ground === 'pitch') {
      // football pitch: alternating mowing stripes
      const so = game.groundOffset % 100;
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      for (let sx = -100 + so; sx < GAME_W + 100; sx += 200) {
        ctx.fillRect(sx, y, 100, GROUND_H);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(0, y, GAME_W, 2);
    } else if (biome.ground === 'tarmac') {
      // airport runway markings scrolling with the ground
      const so = game.groundOffset % 180;
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(0, y, GAME_W, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(0, y, GAME_W, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      for (let sx = -180 + so; sx < GAME_W + 180; sx += 180) {
        ctx.fillRect(sx, y + 22, 90, 3);
        ctx.fillRect(sx + 45, y + GROUND_H - 18, 90, 3);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(0, y + GROUND_H - 5, GAME_W, 2);
    } else if (biome.ground === 'space') {
      // dark space surface with a faint horizon glow and drifting stardust
      const wo = game.groundOffset % 70;
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(0, y, GAME_W, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (let sx = -70 + wo; sx < GAME_W + 70; sx += 70) {
        ctx.beginPath();
        ctx.arc(sx + ((sx * 7) % 30), y + 22 + ((sx * 13) % 40), 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // returns how much the pupil should shift toward the cursor, in bird-local coords
  function eyeLook(x, y, rot, ex, ey, maxShift) {
    if (pointer.x === null || pointer.y === null) return [0, 0];
    const wpx = x + ex * Math.cos(rot) - ey * Math.sin(rot);
    const wpy = y + ex * Math.sin(rot) + ey * Math.cos(rot);
    const dx = pointer.x - wpx;
    const dy = pointer.y - wpy;
    const d = Math.hypot(dx, dy);
    if (d < 1) return [0, 0];
    const s = Math.min(d, maxShift);
    const ux = dx / d;
    const uy = dy / d;
    return [ux * Math.cos(rot) * s + uy * Math.sin(rot) * s, -ux * Math.sin(rot) * s + uy * Math.cos(rot) * s];
  }

  function drawBird(x, y, rot, wing, t, facing) {
    const TAU = Math.PI * 2;
    if (facing === undefined) facing = 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing, 1);
    ctx.rotate(rot * facing);

    // ================= PHOTO SPRITE =================
    if (birdSpritesReady) {
      const f = Math.max(0, Math.min(2, Math.round((wing + 1.2) / 2.4 * 2)));
      const sp = birdSprites[f];
      if (sp) {
        const bw = 62; // on-screen width (px)
        const bh = bw * sp.height / sp.width;
        ctx.drawImage(sp, -bw / 2, -bh / 2 - 4, bw, bh);
        ctx.restore();
        return;
      }
    }

    ctx.scale(BIRD_SCALE * game.stretchX, BIRD_SCALE * game.stretchY);

    // ================= TAIL =================
    const tailSwing =
      Math.sin(t * 6) * 0.05 + Math.sin(t * 13.7) * 0.03 + (game.mode === 'play' ? clamp(game.vel * 0.03, -0.3, 0.55) : 0);
    ctx.save();
    ctx.translate(-12, 3);
    ctx.rotate(-0.4 + tailSwing);
    const tailCols = ['#F9D84E', '#FFE96B', '#F2C93D'];
    const tailLift = Math.sin(t * 13.7) * 0.12;
    for (let i = -1; i <= 1; i++) {
      ctx.save();
      ctx.translate(0, i * 2.4 + Math.sin(t * 9 + i * 2.1) * 0.5);
      ctx.rotate(i * 0.18 + tailLift * (i / 2));
      ctx.fillStyle = tailCols[i + 1];
      ctx.beginPath();
      ctx.moveTo(2, -1.8);
      ctx.quadraticCurveTo(-14, -3.2, -26 - Math.abs(i) * 2, -2 + i * 3);
      ctx.quadraticCurveTo(-15, 2, 2, 1.8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // ================= BODY =================
    const bodyR = ctx.createRadialGradient(6, -3, 2, 0, 4, 24);
    bodyR.addColorStop(0, '#FFEF8A');
    bodyR.addColorStop(0.55, '#FBD849');
    bodyR.addColorStop(1, '#F2C93D');
    const breath = game.mode === 'ready' ? 1 + Math.sin(t * 2.4) * 0.035 : 1;
    ctx.fillStyle = bodyR;
    ctx.beginPath();
    ctx.ellipse(0, 3, 16.5, 13.5 * breath, 0, 0, TAU);
    ctx.fill();

    // belly highlight
    ctx.fillStyle = 'rgba(255,250,214,0.8)';
    ctx.beginPath();
    ctx.ellipse(3, 8, 9, 6 * breath, 0, 0, TAU);
    ctx.fill();

    // ================= WING (layered flight feathers) =================
    ctx.save();
    ctx.translate(5, 0);
    ctx.rotate(-wing);
    ctx.rotate(-0.16);
    const flightGrad = ctx.createLinearGradient(-8, 0, -22, 0);
    flightGrad.addColorStop(0, '#FFE96B');
    flightGrad.addColorStop(1, '#E8C63F');
    ctx.fillStyle = flightGrad;
    const wingFan = Math.sin(t * 26) * 0.6 + game.flapPulse * 0.8;
    for (let k = 0; k < 5; k++) {
      const tipX = -20 - k * 1.6;
      const tipY = 1 + k * 1.9 + wingFan * 0.9 + Math.sin(t * 41 + k * 1.3) * 0.5;
      ctx.beginPath();
      ctx.moveTo(-3, 0.5 + k * 1.6);
      ctx.quadraticCurveTo(-12, tipY - 2.5, tipX, tipY - 1);
      ctx.quadraticCurveTo(-11, tipY + 2.5, -3, 2 + k * 1.6);
      ctx.closePath();
      ctx.fill();
    }
    const covGrad = ctx.createLinearGradient(-6, -8, -2, 8);
    covGrad.addColorStop(0, '#FFEF8A');
    covGrad.addColorStop(1, '#F5C83C');
    ctx.fillStyle = covGrad;
    ctx.beginPath();
    ctx.ellipse(-5, 1, 9, 7, -0.15, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,220,0.6)';
    ctx.beginPath();
    ctx.ellipse(-5, -6, 8.5, 1.6, -0.1, 0, TAU);
    ctx.fill();
    ctx.restore();

    // ================= HEAD (bobs and leans independently) =================
    const headTilt =
      game.mode === 'play'
        ? Math.sin(t * 20) * 0.06 + clamp(game.vel * 0.02, -0.2, 0.1)
        : game.mode === 'ready'
          ? Math.sin(t * 2.4) * 0.05
          : 0.05;
    ctx.save();
    ctx.translate(14, -6);
    ctx.rotate(headTilt);

    const headR = ctx.createRadialGradient(3, -5, 2, -1, 0, 16);
    headR.addColorStop(0, '#FFEF8A');
    headR.addColorStop(0.6, '#FBD849');
    headR.addColorStop(1, '#F2C93D');
    ctx.fillStyle = headR;
    ctx.beginPath();
    ctx.arc(0, 0, 12.5, 0, TAU);
    ctx.fill();

    // ================= EYE (tracks the cursor + blinks) =================
    const scared = game.mode === 'over';
    const blinkAmt = scared ? 0 : clamp(game.blink / 0.1, 0, 1);
    const eyeS = 1 - blinkAmt * 0.92;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(4.6, -3.6, 3.4, 3.4 * eyeS, 0, 0, TAU);
    ctx.fill();
    const exL = 4.6 * Math.cos(headTilt) - -3.6 * Math.sin(headTilt);
    const eyL = 4.6 * Math.sin(headTilt) + -3.6 * Math.cos(headTilt);
    const look = eyeLook(x, y, rot, exL * BIRD_SCALE, eyL * BIRD_SCALE, 1.2 * BIRD_SCALE);
    // scared: tiny pinpoint pupils
    const pr = scared ? 1.0 : 2.1;
    ctx.fillStyle = '#141414';
    ctx.beginPath();
    ctx.ellipse(4.8 + look[0], -3.4 + look[1], pr, pr * eyeS, 0, 0, TAU);
    ctx.fill();
    if (scared) {
      // wide-open white ring above the pupil for a startled look
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(4.8 + look[0], -4.2 + look[1], 0.9, 0, TAU);
      ctx.fill();
    } else if (blinkAmt < 0.5) {
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(5.8 + look[0], -4.3 + look[1], 0.8, 0, TAU);
      ctx.fill();
    }

    if (scared) {
      // open-mouth gasp
      ctx.fillStyle = '#7a3b2e';
      ctx.beginPath();
      ctx.ellipse(14.2, 4.8, 1.5, 2.2, 0, 0, TAU);
      ctx.fill();
      // sweat drop
      ctx.fillStyle = 'rgba(120,200,255,0.95)';
      ctx.beginPath();
      ctx.ellipse(7.6, -7.4, 1.1, 1.6, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(7.35, -7.9, 0.4, 0, TAU);
      ctx.fill();
    }

    // ================= BEAK (peach) =================
    ctx.fillStyle = '#F4C49E';
    ctx.beginPath();
    ctx.moveTo(11.2, 0.8);
    ctx.quadraticCurveTo(16.4, 0.4, 17.4, 4.2);
    ctx.quadraticCurveTo(17.4, 5.8, 15.6, 6.2);
    ctx.quadraticCurveTo(12.8, 5.1, 11.4, 3.4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#E0A77C';
    ctx.beginPath();
    ctx.moveTo(11.6, 3.6);
    ctx.quadraticCurveTo(15, 4.4, 14.8, 6.8);
    ctx.quadraticCurveTo(13, 7.5, 11.7, 5.7);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // ================= SEWER RENDERING =================
  const sewerDrips = (() => {
    const a = [];
    for (let i = 0; i < 9; i++) {
      a.push({ x: 20 + Math.random() * (GAME_W - 40), t: Math.random() * 4 });
    }
    return a;
  })();

  function drawSewerBackground() {
    const TAU = Math.PI * 2;
    // dark dank tunnel
    const g = ctx.createLinearGradient(0, 0, 0, GAME_H);
    g.addColorStop(0, '#101611');
    g.addColorStop(0.45, '#1b241d');
    g.addColorStop(1, '#0a0f0c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    // arched ceiling
    ctx.fillStyle = '#151d17';
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.quadraticCurveTo(GAME_W / 2, -70, GAME_W + 10, 0);
    ctx.closePath();
    ctx.fill();

    // brick pattern scrolling
    const brickOff = ((game.sewerWalk * 14) % 30 + 30) % 30;
    ctx.strokeStyle = 'rgba(90,110,85,0.18)';
    ctx.lineWidth = 1;
    for (let row = 0; row < 9; row++) {
      const y = 40 + row * 56;
      if (y > SEWER_GROUND) break;
      ctx.fillStyle = row % 2 === 0 ? 'rgba(70,84,62,0.10)' : 'rgba(58,72,54,0.14)';
      ctx.fillRect(0, y, GAME_W, 52);
      const shift = row % 2 === 0 ? 0 : 15;
      for (let bx = -30 - brickOff + shift; bx < GAME_W + 30; bx += 30) {
        ctx.beginPath();
        ctx.moveTo(bx, y);
        ctx.lineTo(bx, y + 52);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(GAME_W, y);
      ctx.stroke();
    }

    // surface slime glow just above the ground
    const slime = ctx.createLinearGradient(0, SEWER_GROUND + 4, 0, SEWER_GROUND + 42);
    slime.addColorStop(0, 'rgba(90,190,70,0.4)');
    slime.addColorStop(1, 'rgba(60,140,50,0)');
    ctx.fillStyle = slime;
    ctx.fillRect(0, SEWER_GROUND + 4, GAME_W, 42);

    // toxic liquid
    const water = ctx.createLinearGradient(0, SEWER_GROUND, 0, GAME_H);
    water.addColorStop(0, '#3d5c2f');
    water.addColorStop(0.35, '#29421f');
    water.addColorStop(1, '#142011');
    ctx.fillStyle = water;
    ctx.fillRect(0, SEWER_GROUND, GAME_W, GAME_H - SEWER_GROUND);
    // rippling surface
    ctx.fillStyle = 'rgba(150,220,110,0.5)';
    const so = (game.t * 0.02) % 40;
    ctx.beginPath();
    ctx.moveTo(0, SEWER_GROUND + 3);
    for (let x = 0; x <= GAME_W; x += 20) {
      ctx.lineTo(x, SEWER_GROUND + 3 + Math.sin(x * 0.08 + game.t * 0.015) * 2.2);
    }
    ctx.lineTo(GAME_W, SEWER_GROUND + 6);
    ctx.lineTo(0, SEWER_GROUND + 6);
    ctx.closePath();
    ctx.fill();
    // bubbles
    ctx.fillStyle = 'rgba(190,240,150,0.35)';
    for (let i = 0; i < 7; i++) {
      const bx = (i * 91 + game.t * 0.02 * 200) % (GAME_W + 40) - 20;
      const by = SEWER_GROUND + 13 + ((i * 57 + game.t * 0.02 * 80) % 30);
      ctx.beginPath();
      ctx.arc(bx, by, 2 + i % 3, 0, TAU);
      ctx.fill();
    }

    // dripping from the ceiling
    for (let i = 0; i < sewerDrips.length; i++) {
      const d = sewerDrips[i];
      d.t += 0.016;
      if (d.t > 3) {
        const len = 14 + ((i * 37) % 26);
        ctx.strokeStyle = i % 3 === 0 ? 'rgba(170,235,140,0.5)' : 'rgba(120,190,110,0.35)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(d.x, 4);
        ctx.lineTo(d.x, 4 + len);
        ctx.stroke();
      }
      if (d.t > 4) d.t = Math.random() * 3;
    }

    // grates / pipes
    ctx.fillStyle = 'rgba(30,38,30,0.9)';
    ctx.fillRect(28, 24, 8, 40);
    ctx.fillRect(GAME_W - 36, 24, 8, 40);
    ctx.fillStyle = 'rgba(60,74,56,0.5)';
    ctx.fillRect(0, 84, GAME_W, 10);
  }

  function drawZombies() {
    const TAU = Math.PI * 2;
    for (const z of game.zombies) {
      const walk = z.state === 'walk';
      const rising = 1 - clamp(z.y - (SEWER_GROUND - 30), 0, 30) / 30;
      ctx.save();
      ctx.translate(z.x, z.y);
      if (z.state !== 'dead') ctx.scale(z.side === 'L' ? -1 : 1, 1);
      const stagger = walk ? Math.sin(z.t * 9 + z.phase) * 0.12 : 0;
      ctx.rotate(stagger);

      // shadow
      if (z.state !== 'dead') {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(0, 22, 13, 3.4, 0, 0, TAU);
        ctx.fill();
      }

      // legs
      ctx.strokeStyle = '#3e5a2c';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const legSw = walk ? Math.sin(z.t * 12) * 4 : 0;
      ctx.moveTo(-4, 10);
      ctx.lineTo(-6 + legSw, 22);
      ctx.moveTo(4, 10);
      ctx.lineTo(6 - legSw, 22);
      ctx.stroke();

      // arms reaching out for the bird
      ctx.strokeStyle = '#4c6a36';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-8, 2);
      ctx.lineTo(-15, 8 + Math.sin(z.t * 6 + z.phase) * 2);
      ctx.moveTo(8, 2);
      ctx.lineTo(15, 9 + Math.sin(z.t * 6.5 + z.phase) * 2);
      ctx.stroke();
      // grabbing hand claws
      ctx.fillStyle = '#4c6a36';
      for (const hx of [-15, 15]) {
        ctx.beginPath();
        ctx.arc(hx, 8 + Math.sin(z.t * 6 + z.phase) * 2, 2.2, 0, TAU);
        ctx.fill();
      }

      // body
      const bodyGrad = ctx.createRadialGradient(0, -3, 2, 0, 2, 15);
      bodyGrad.addColorStop(0, '#5c7d3e');
      bodyGrad.addColorStop(0.55, '#48703a');
      bodyGrad.addColorStop(1, '#2e4c24');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.ellipse(0, 3, 13, 12, 0, 0, TAU);
      ctx.fill();
      // ripped shirt / wounds
      ctx.fillStyle = 'rgba(90,20,20,0.55)';
      ctx.beginPath();
      ctx.ellipse(-5, 4, 3, 4, 0.4, 0, TAU);
      ctx.ellipse(6, 2, 2.4, 3, -0.3, 0, TAU);
      ctx.fill();
      // nasty green ichor drips
      ctx.strokeStyle = 'rgba(150,230,110,0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-3, 5);
      ctx.lineTo(-3, 4 + ((z.t * 10) % 5));
      ctx.stroke();

      // head (turns to stare at the bird)
      const sScale = z.side === 'L' ? -1 : 1;
      const headPivotX = z.x;
      const headPivotY = z.y - 12;
      const birdLocalX = (game.sewerRunX - headPivotX) * sScale;
      const birdLocalY = SEWER_GROUND - 16 - headPivotY;
      const lookAng = clamp(Math.atan2(birdLocalY, -birdLocalX), -0.62, 0.62);
      ctx.save();
      ctx.translate(-3, -12);
      ctx.rotate(lookAng + (walk ? Math.sin(z.t * 7 + z.phase) * 0.1 : 0.1 * (z.hp === 2 ? 1 : 0)));
      const headGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, 9);
      headGrad.addColorStop(0, '#6b8a46');
      headGrad.addColorStop(1, '#3c5a30');
      ctx.fillStyle = headGrad;
      ctx.beginPath();
      ctx.arc(0, 0, 8.5, 0, TAU);
      ctx.fill();
      // drooping jaw
      ctx.fillStyle = '#334a26';
      ctx.beginPath();
      ctx.ellipse(0, 5.5, 5, 3, 0, 0, Math.PI);
      ctx.fill();
      // eyes track the bird horizontally
      const eyeShift = clamp(-birdLocalX * 0.05, -1.8, 1.8);
      // glowing eyes
      const glow = Math.random() < 0.04 ? 1.3 : 1;
      ctx.fillStyle = 'rgba(255,240,120,' + (0.25 * glow) + ')';
      ctx.beginPath();
      ctx.arc(-3 + eyeShift, -2.5, 4, 0, TAU);
      ctx.arc(3.4 + eyeShift, -2.5, 4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#d9ff5a';
      ctx.beginPath();
      ctx.arc(-3 + eyeShift, -2.5, 2, 0, TAU);
      ctx.arc(3.4 + eyeShift, -2.5, 2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#1a2413';
      ctx.beginPath();
      ctx.arc(-3 + eyeShift, -2.5, 0.9, 0, TAU);
      ctx.arc(3.4 + eyeShift, -2.5, 0.9, 0, TAU);
      ctx.fill();
      // tough zombie gets a helmet chunk
      if (z.hp === 2) {
        ctx.fillStyle = '#5c6660';
        ctx.beginPath();
        ctx.arc(0, -2, 8.5, Math.PI * 0.7, Math.PI * 2.2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.arc(0, -4, 5, Math.PI * 0.8, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawSwordSlash() {
    if (game.swordSwing <= 0) return;
    const TAU = Math.PI * 2;
    const k = 1 - game.swordSwing;
    const cx = game.sewerRunX + game.sewerFacing * 20;
    const cy = SEWER_GROUND - 34;
    const a0 = -2.7;
    const a1 = 1.1;
    const arc = a0 + (a1 - a0) * k;
    ctx.save();
    ctx.globalAlpha = Math.max(0, game.swordSwing * 1.4);
    ctx.strokeStyle = 'rgba(240,255,250,0.95)';
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, 48, Math.min(a0, arc), Math.max(a0, arc));
    ctx.stroke();
    ctx.strokeStyle = 'rgba(160,255,210,0.6)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(cx, cy, 55, Math.min(a0, arc), Math.max(a0, arc));
    ctx.stroke();
    ctx.restore();
  }

  function drawLandmarkSilhouette(sx, baseY, type) {
    ctx.fillStyle = 'rgba(60,82,55,0.85)';
    if (type === 'eiffel') {
      const base = 62;
      ctx.beginPath();
      ctx.moveTo(sx - 34, baseY);
      ctx.lineTo(sx - 18, baseY - base);
      ctx.lineTo(sx - 10, baseY - base);
      ctx.lineTo(sx, baseY - base - 32);
      ctx.lineTo(sx + 10, baseY - base);
      ctx.lineTo(sx + 18, baseY - base);
      ctx.lineTo(sx + 34, baseY);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(sx - 20, baseY - base - 20, 40, 12);
      ctx.fillRect(sx - 4, baseY - base - 42, 8, 10);
    } else if (type === 'liberty') {
      const base = 58;
      ctx.fillRect(sx - 4, baseY - base, 8, base);
      ctx.fillRect(sx - 26, baseY, 52, 8);
      ctx.beginPath();
      ctx.arc(sx, baseY - base - 22, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(sx - 3, baseY - base - 40);
      ctx.lineTo(sx + 3, baseY - base - 40);
      ctx.lineTo(sx + 3, baseY - base - 24);
      ctx.lineTo(sx - 3, baseY - base - 24);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'pyramid') {
      ctx.beginPath();
      ctx.moveTo(sx - 38, baseY);
      ctx.lineTo(sx, baseY - 92);
      ctx.lineTo(sx + 38, baseY);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(sx - 6, baseY);
      ctx.lineTo(sx + 22, baseY - 56);
      ctx.lineTo(sx + 46, baseY);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'bigben') {
      ctx.fillRect(sx - 8, baseY - 118, 16, 118);
      ctx.fillRect(sx - 14, baseY - 126, 28, 14);
      ctx.fillRect(sx - 6, baseY - 138, 12, 14);
      ctx.fillRect(sx - 3, baseY - 148, 6, 8);
    } else if (type === 'opera') {
      ctx.beginPath();
      ctx.moveTo(sx - 40, baseY);
      ctx.quadraticCurveTo(sx - 30, baseY - 66, sx - 10, baseY - 66);
      ctx.quadraticCurveTo(sx, baseY - 80, sx + 10, baseY - 66);
      ctx.quadraticCurveTo(sx + 30, baseY - 66, sx + 40, baseY);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawTajMahal(cx, baseY) {
    const TAU = Math.PI * 2;
    const glow = game.tajCelebrating ? 0.5 + Math.sin(game.t * 6) * 0.3 : 0.12;
    const buildingW = 250;
    const left = cx - buildingW / 2;
    const right = cx + buildingW / 2;

    const halo = ctx.createRadialGradient(cx, baseY - 170, 20, cx, baseY - 170, 220);
    halo.addColorStop(0, 'rgba(255,214,120,' + (0.25 + glow * 0.5).toFixed(3) + ')');
    halo.addColorStop(1, 'rgba(255,214,120,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, baseY - 170, 220, 0, TAU);
    ctx.fill();

    ctx.fillStyle = '#f4e6c8';
    ctx.fillRect(left + 18, baseY - 16, buildingW - 36, 16);
    ctx.fillStyle = 'rgba(120,80,45,0.5)';
    ctx.fillRect(left - 6, baseY - 6, buildingW + 12, 6);

    const mTop = baseY - 208;
    ctx.fillStyle = '#efe0c0';
    for (const mx of [left + 26, right - 26, left + 46, right - 46]) {
      ctx.fillRect(mx - 4, mTop, 8, baseY - 16 - mTop);
      ctx.beginPath();
      ctx.arc(mx, mTop, 6, Math.PI, 0, false);
      ctx.fill();
    }

    ctx.fillStyle = '#f6e9cd';
    ctx.fillRect(left + 40, baseY - 150, buildingW - 80, 150 - 16);
    ctx.fillStyle = '#c9a86a';
    ctx.beginPath();
    ctx.moveTo(cx - 26, baseY - 16);
    ctx.lineTo(cx - 26, baseY - 92);
    ctx.quadraticCurveTo(cx, baseY - 126, cx + 26, baseY - 92);
    ctx.lineTo(cx + 26, baseY - 16);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#f3e5c8';
    for (const kx of [left + 44, right - 44]) {
      ctx.fillRect(kx - 14, baseY - 86, 28, 70);
      ctx.beginPath();
      ctx.arc(kx, baseY - 86, 18, Math.PI, 0, false);
      ctx.fill();
    }

    ctx.fillStyle = '#fdf3d8';
    ctx.beginPath();
    ctx.moveTo(cx - 60, baseY - 150);
    ctx.quadraticCurveTo(cx - 92, baseY - 248, cx, baseY - 256);
    ctx.quadraticCurveTo(cx + 92, baseY - 248, cx + 60, baseY - 150);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, baseY - 256, 14, 0, TAU);
    ctx.fill();

    ctx.fillStyle = '#c9a86a';
    ctx.fillRect(cx - 2, baseY - 282, 4, 26);

    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(cx - 44, baseY - 150);
    ctx.quadraticCurveTo(cx - 66, baseY - 218, cx - 8, baseY - 248);
    ctx.quadraticCurveTo(cx - 32, baseY - 178, cx - 8, baseY - 150);
    ctx.closePath();
    ctx.fill();
  }

  function drawTajScene() {
    const TAU = Math.PI * 2;
    const g = ctx.createLinearGradient(0, 0, 0, GAME_H);
    g.addColorStop(0, '#ffb36b');
    g.addColorStop(0.55, '#ffd28f');
    g.addColorStop(1, '#ffe6b8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    ctx.save();
    ctx.globalAlpha = 0.9;
    const sr = 30 + Math.sin(game.t * 0.8) * 3;
    const sg = ctx.createRadialGradient(GAME_W - 120, GAME_H - 210, 4, GAME_W - 120, GAME_H - 210, sr + 60);
    sg.addColorStop(0, 'rgba(255,244,190,1)');
    sg.addColorStop(1, 'rgba(255,220,140,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(GAME_W - 120, GAME_H - 210, sr + 60, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff3cf';
    ctx.beginPath();
    ctx.arc(GAME_W - 120, GAME_H - 210, sr, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(255,240,220,0.5)';
    for (let i = 0; i < 8; i++) {
      const wx = i * 320 + 40;
      const sx = ((((wx - game.tajCam * 0.25) % (GAME_W + 160)) + (GAME_W + 160)) % (GAME_W + 160)) - 80;
      const cy = 80 + ((i * 53) % 90);
      ctx.beginPath();
      ctx.ellipse(sx, cy, 46, 14, 0, 0, TAU);
      ctx.ellipse(sx - 30, cy + 8, 34, 11, 0, 0, TAU);
      ctx.ellipse(sx + 32, cy + 6, 36, 12, 0, 0, TAU);
      ctx.fill();
    }

    const horizonY = GAME_H - 150;
    const lg = ctx.createLinearGradient(0, horizonY, 0, GAME_H);
    lg.addColorStop(0, '#9db36a');
    lg.addColorStop(1, '#6f8a4a');
    ctx.fillStyle = lg;
    ctx.fillRect(0, horizonY, GAME_W, GAME_H - horizonY);

    ctx.fillStyle = 'rgba(150,120,90,0.6)';
    ctx.beginPath();
    ctx.moveTo(-20, horizonY);
    for (let sx = -20; sx <= GAME_W + 30; sx += 12) {
      const rwx = sx + game.tajCam * 0.55;
      const y = horizonY - 26 - Math.sin(rwx * 0.02) * 14 - Math.sin(rwx * 0.05) * 6;
      ctx.lineTo(sx, y);
    }
    ctx.lineTo(GAME_W + 20, GAME_H);
    ctx.lineTo(-20, GAME_H);
    ctx.closePath();
    ctx.fill();

    const landmarks = [
      { x: 250, type: 'eiffel' },
      { x: 520, type: 'liberty' },
      { x: 880, type: 'pyramid' },
      { x: 1180, type: 'bigben' },
      { x: 1480, type: 'opera' },
    ];
    for (const lm of landmarks) {
      const sx = lm.x - game.tajCam;
      if (sx < -150 || sx > GAME_W + 150) continue;
      drawLandmarkSilhouette(sx, horizonY, lm.type);
    }

    ctx.font = 'bold 20px ' + UI_FONT;
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(120,60,20,0.4)';
    ctx.strokeText('FLYING TO THE TAJ MAHAL', GAME_W / 2, 46);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('FLYING TO THE TAJ MAHAL', GAME_W / 2, 46);

    const tsx = TAJ_FLY_LAND - game.tajCam;
    if (tsx > -320 && tsx < GAME_W + 320) {
      drawTajMahal(tsx, horizonY);
    }
  }

  function drawTajHud() {
    if (game.tajT >= 5.2) {
      const a = clamp((game.tajT - 5.2) / 0.8, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = 'bold 34px ' + UI_FONT;
      ctx.lineWidth = 8;
      ctx.strokeStyle = 'rgba(120,50,20,0.55)';
      ctx.strokeText('THE TAJ MAHAL!', GAME_W / 2, GAME_H * 0.2);
      ctx.fillStyle = '#fff7e0';
      ctx.fillText('THE TAJ MAHAL!', GAME_W / 2, GAME_H * 0.2);
      const pulse = 0.6 + Math.sin(game.t * 5) * 0.3;
      ctx.globalAlpha = a * pulse;
      ctx.font = 'bold 17px ' + UI_FONT;
      ctx.lineWidth = 4;
      ctx.strokeText('Sunny touches down...', GAME_W / 2, GAME_H * 0.2 + 34);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('Sunny touches down...', GAME_W / 2, GAME_H * 0.2 + 34);
      ctx.restore();
    }
  }

  function drawSewerBird(x, y, facing, rot, t) {
    const TAU = Math.PI * 2;
    const dead = game.mode === 'over';
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(facing, 1);
    ctx.rotate(rot);

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 22, 16, 4, 0, 0, TAU);
    ctx.fill();

    if (birdSpritesReady) {
      const moving = game.moveLeft || game.moveRight;
      const f = moving ? Math.floor(t * 7) % 3 : 1;
      const sp = birdSprites[f];
      if (sp) {
        const bw = 64;
        const bh = bw * sp.height / sp.width;
        const sway = moving ? Math.sin(t * 14) * 0.05 : Math.sin(t * 2.4) * 0.04;
        ctx.save();
        ctx.rotate(sway);
        ctx.drawImage(sp, -bw / 2, -bh / 2 - 6, bw, bh);
        ctx.restore();
      }
    } else {
      drawFallbackSewerBirdBody(t, dead);
    }

    // sword in her wing (held up, slashes when swinging)
    const swingK = game.swordSwing;
    const swingAng = swingK > 0 ? (-2.2 + (1 - swingK) * 5.2) * facing : -1.1 * facing;
    ctx.save();
    ctx.translate(-2, -2);
    ctx.rotate(swingAng);
    // pommel / handle
    ctx.fillStyle = '#8a5a1e';
    ctx.fillRect(-1.6, -6, 3.2, 10);
    ctx.fillStyle = '#d8a23c';
    ctx.fillRect(-2.6, -8.5, 5, 4);
    // blade with shine
    const bladeG = ctx.createLinearGradient(0, -20, 0, -2);
    bladeG.addColorStop(0, '#f2f9ff');
    bladeG.addColorStop(0.5, '#cfe4f2');
    bladeG.addColorStop(1, '#9fb4c8');
    ctx.fillStyle = bladeG;
    ctx.beginPath();
    ctx.moveTo(-2, -6);
    ctx.lineTo(2, -6);
    ctx.lineTo(2.6, -30);
    ctx.lineTo(0, -38);
    ctx.lineTo(-2.6, -30);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(0, -34);
    ctx.stroke();
    ctx.restore();

    // little helmet / headlamp on top of her head
    ctx.save();
    ctx.translate(12, -24);
    ctx.rotate(dead ? 0.6 : 0.12);
    ctx.fillStyle = '#5b8b3c';
    ctx.beginPath();
    ctx.arc(0, 0, 10.5, Math.PI * 0.85, Math.PI * 2.1);
    ctx.fill();
    ctx.fillStyle = '#e8f2ff';
    ctx.beginPath();
    ctx.arc(-2.5, -6.5, 2.4, 0, TAU);
    ctx.fill();
    const beam = Math.sin(game.t * 3) * 0.15 + 0.8;
    ctx.strokeStyle = 'rgba(220,250,255,' + beam + ')';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2.5, -6.5);
    ctx.lineTo(-22, -14);
    ctx.stroke();
    ctx.restore();

    if (dead) {
      // X-eyes over the photo
      ctx.save();
      ctx.translate(8, -6);
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = '#ff4d3d';
      ctx.beginPath();
      ctx.moveTo(1, -4);
      ctx.lineTo(7, 1);
      ctx.moveTo(7, -4);
      ctx.lineTo(1, 1);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  function drawFallbackSewerBirdBody(t, dead) {
    const TAU = Math.PI * 2;
    const moving = game.moveLeft || game.moveRight;
    const step = Math.sin(t * 14);

    // legs (walking)
    ctx.strokeStyle = '#e8b060';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-4, 10);
    ctx.lineTo(-4 + step * (moving ? 4 : 0), 22);
    ctx.moveTo(4, 10);
    ctx.lineTo(4 - step * (moving ? 4 : 0), 22);
    ctx.stroke();
    // little feet
    ctx.beginPath();
    ctx.moveTo(-4 + step * (moving ? 4 : 0), 22);
    ctx.lineTo(-9 + step * (moving ? 4 : 0), 22);
    ctx.moveTo(4 - step * (moving ? 4 : 0), 22);
    ctx.lineTo(9 - step * (moving ? 4 : 0), 22);
    ctx.stroke();

    const sway = moving ? Math.sin(t * 14) * 0.08 : 0;
    ctx.rotate(sway);

    // tail
    ctx.save();
    ctx.translate(-12, 3);
    ctx.rotate(-0.5);
    ctx.fillStyle = '#F9D84E';
    ctx.beginPath();
    ctx.moveTo(3, -2);
    ctx.quadraticCurveTo(-12, -4, -22, -1);
    ctx.quadraticCurveTo(-11, 2, 3, 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // body
    const bodyR = ctx.createRadialGradient(5, -3, 2, 0, 3, 20);
    bodyR.addColorStop(0, '#FFEF8A');
    bodyR.addColorStop(0.55, '#FBD849');
    bodyR.addColorStop(1, '#F2C93D');
    ctx.fillStyle = bodyR;
    ctx.beginPath();
    ctx.ellipse(0, 3, 14, 11.5, 0, 0, TAU);
    ctx.fill();
    // belly
    ctx.fillStyle = 'rgba(255,250,214,0.85)';
    ctx.beginPath();
    ctx.ellipse(2, 7, 8, 5.5, 0, 0, TAU);
    ctx.fill();
    // little chest armor / scarf for adventure
    ctx.fillStyle = '#d94b3a';
    ctx.beginPath();
    ctx.ellipse(4, 6, 4.5, 3, 0.2, 0, TAU);
    ctx.fill();

    // wing (the one holding the sword sits higher, animate subtly)
    ctx.save();
    ctx.translate(4, 1);
    ctx.rotate(-0.25 + (moving ? Math.sin(t * 14) * 0.1 : 0));
    ctx.fillStyle = '#F5C83C';
    ctx.beginPath();
    ctx.ellipse(-4, -1, 8, 5, -0.15, 0, TAU);
    ctx.fill();
    ctx.restore();

    // head
    ctx.save();
    ctx.translate(11, -5);
    ctx.rotate(dead ? 0.6 : Math.sin(t * 6) * 0.05);
    const headR = ctx.createRadialGradient(2, -4, 1, 0, 0, 11);
    headR.addColorStop(0, '#FFEF8A');
    headR.addColorStop(0.6, '#FBD849');
    headR.addColorStop(1, '#F2C93D');
    ctx.fillStyle = headR;
    ctx.beginPath();
    ctx.arc(0, 0, 10.5, 0, TAU);
    ctx.fill();

    // eye
    const blinkAmt = dead ? 1 : clamp(game.blink / 0.1, 0, 1);
    if (dead) {
      ctx.fillStyle = '#ff4d3d';
      ctx.beginPath();
      ctx.moveTo(1, -4);
      ctx.lineTo(7, 1);
      ctx.moveTo(7, -4);
      ctx.lineTo(1, 1);
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = '#ff4d3d';
      ctx.stroke();
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(3.4, -3.4, 3, 3 * (1 - blinkAmt * 0.92), 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#141414';
      ctx.beginPath();
      ctx.ellipse(3.9, -3.2, 1.7, 1.7 * (1 - blinkAmt * 0.92), 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(4.4, -3.9, 0.6, 0, TAU);
      ctx.fill();
    }

    // beak
    ctx.fillStyle = '#F4C49E';
    ctx.beginPath();
    ctx.moveTo(9.5, 1);
    ctx.quadraticCurveTo(14, 0.4, 14.8, 3.4);
    ctx.quadraticCurveTo(14.6, 5, 12.6, 5.2);
    ctx.quadraticCurveTo(10.6, 4.2, 9.7, 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#E0A77C';
    ctx.beginPath();
    ctx.moveTo(9.9, 3.2);
    ctx.quadraticCurveTo(12.4, 3.9, 12.2, 5.9);
    ctx.quadraticCurveTo(11, 6.6, 9.9, 5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawSewerHud() {
    // zombie keyboard kill counter
    ctx.textAlign = 'center';
    const label = game.zombieCount + ' / ' + SEWER_TARGET;
    ctx.font = 'bold 34px ' + UI_FONT;
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(8,18,12,0.9)';
    ctx.strokeText('KILLED ' + label, GAME_W / 2, 84);
    ctx.fillStyle = '#b8ff6a';
    ctx.fillText('KILLED ' + label, GAME_W / 2, 84);

    // on-screen touch controls
    if (game.mode !== 'sewer') return;
    const by = GAME_H - 46;
    const pulse = 1 + Math.sin(game.t * 10) * 0.06;
    const drawBtn = (bx, label, scale) => {
      ctx.save();
      ctx.translate(bx, by);
      ctx.scale(pulse * scale, pulse * scale);
      ctx.fillStyle = 'rgba(20,32,22,0.55)';
      roundRect(-30, -30, 60, 60, 14);
      ctx.fill();
      ctx.strokeStyle = 'rgba(180,255,150,0.7)';
      ctx.lineWidth = 3;
      roundRect(-30, -30, 60, 60, 14);
      ctx.stroke();
      ctx.fillStyle = '#e2ffd0';
      ctx.font = 'bold 30px ' + UI_FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, 2);
      ctx.restore();
      ctx.textBaseline = 'alphabetic';
    };
    drawBtn(56, '◀', 1);
    drawBtn(GAME_W - 56, '▶', 1);
  }

  function drawUI() {
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';

    if (game.mode === 'ready') {
      ctx.font = 'bold 52px ' + UI_FONT;
      ctx.lineWidth = 8;
      ctx.strokeStyle = 'rgba(25,70,30,0.9)';
      ctx.strokeText('FLAPPY', GAME_W / 2, 148);
      ctx.fillStyle = '#ffe14d';
      ctx.fillText('FLAPPY', GAME_W / 2, 132);

      ctx.font = 'bold 40px ' + UI_FONT;
      ctx.lineWidth = 7;
      ctx.strokeText('SUNNY', GAME_W / 2, 196);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('SUNNY', GAME_W / 2, 196);

      ctx.font = 'bold 16px ' + UI_FONT;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(25,70,30,0.8)';
      ctx.strokeText('a little budgie adventure', GAME_W / 2, 246);
      ctx.fillStyle = '#fffbdb';
      ctx.fillText('a little budgie adventure', GAME_W / 2, 246);

      if (game.best > 0) {
        ctx.font = 'bold 16px ' + UI_FONT;
        ctx.lineWidth = 4;
        ctx.strokeText('BEST  ' + game.best, GAME_W / 2, 270);
        ctx.fillStyle = '#ffdf6b';
        ctx.fillText('BEST  ' + game.best, GAME_W / 2, 270);
      }

      const pulse = 0.55 + Math.sin(game.t * 4) * 0.2;
      ctx.globalAlpha = pulse;
      ctx.font = 'bold 21px ' + UI_FONT;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(20,50,25,0.85)';
      ctx.strokeText('Tap or press Space to start', GAME_W / 2, GAME_H - 120);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('Tap or press Space to start', GAME_W / 2, GAME_H - 120);
      ctx.globalAlpha = 1;
    } else if (game.mode === 'countdown') {
      const num = Math.max(1, 3 - Math.floor(game.countT));
      const frac = game.countT - Math.floor(game.countT);
      const scale = 1 + (1 - frac) * 0.35;
      ctx.save();
      ctx.translate(GAME_W / 2, GAME_H * 0.42);
      ctx.scale(scale, scale);
      ctx.font = 'bold 96px ' + UI_FONT;
      ctx.lineWidth = 12;
      ctx.strokeStyle = 'rgba(20,45,25,0.9)';
      ctx.strokeText(num, 0, 0);
      ctx.fillStyle = '#ffe14d';
      ctx.fillText(num, 0, 0);
      ctx.restore();
      ctx.font = 'bold 18px ' + UI_FONT;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(20,45,25,0.8)';
      ctx.strokeText('PREPARING FOR SPACE...', GAME_W / 2, GAME_H * 0.42 + 48);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('PREPARING FOR SPACE...', GAME_W / 2, GAME_H * 0.42 + 48);
    } else if (game.mode === 'spaceReady') {
      const num = Math.max(1, 3 - Math.floor(game.spaceReadyT));
      const frac = game.spaceReadyT - Math.floor(game.spaceReadyT);
      const scale = 1 + (1 - frac) * 0.35;
      ctx.save();
      ctx.translate(GAME_W / 2, GAME_H * 0.42);
      ctx.scale(scale, scale);
      ctx.font = 'bold 96px ' + UI_FONT;
      ctx.lineWidth = 12;
      ctx.strokeStyle = 'rgba(20,45,25,0.9)';
      ctx.strokeText(num, 0, 0);
      ctx.fillStyle = '#8ce34c';
      ctx.fillText(num, 0, 0);
      ctx.restore();
      ctx.font = 'bold 18px ' + UI_FONT;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(20,45,25,0.8)';
      ctx.strokeText('GET READY!', GAME_W / 2, GAME_H * 0.42 + 48);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('GET READY!', GAME_W / 2, GAME_H * 0.42 + 48);
    } else if (game.mode === 'nestCountdown') {
      drawNestButtons();
      const num = Math.max(1, 3 - Math.floor(game.countT));
      const frac = game.countT - Math.floor(game.countT);
      const scale = 1 + (1 - frac) * 0.35;
      ctx.save();
      ctx.translate(GAME_W / 2, GAME_H * 0.32);
      ctx.scale(scale, scale);
      ctx.font = 'bold 84px ' + UI_FONT;
      ctx.lineWidth = 10;
      ctx.strokeStyle = 'rgba(50,35,20,0.9)';
      ctx.strokeText(num, 0, 0);
      ctx.fillStyle = '#ffd23d';
      ctx.fillText(num, 0, 0);
      ctx.restore();
      ctx.font = 'bold 22px ' + UI_FONT;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(50,35,20,0.85)';
      ctx.strokeText('PROTECT YOUR EGGS!', GAME_W / 2, GAME_H * 0.32 + 44);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('PROTECT YOUR EGGS!', GAME_W / 2, GAME_H * 0.32 + 44);
    } else if (game.mode === 'nest') {
      drawNestHud();
      drawNestButtons();
      if (game.nestEnding === 'win') {
        ctx.font = 'bold 40px ' + UI_FONT;
        ctx.lineWidth = 8;
        ctx.strokeStyle = 'rgba(40,80,35,0.9)';
        ctx.strokeText('EGGS SAVED!', GAME_W / 2, GAME_H * 0.3);
        ctx.fillStyle = '#ffe14d';
        ctx.fillText('EGGS SAVED!', GAME_W / 2, GAME_H * 0.3);
      } else if (game.nestEnding === 'lose') {
        ctx.font = 'bold 34px ' + UI_FONT;
        ctx.lineWidth = 8;
        ctx.strokeStyle = 'rgba(120,30,20,0.9)';
        ctx.strokeText('THE RATS GOT THE EGGS!', GAME_W / 2, GAME_H * 0.3);
        ctx.fillStyle = '#ff5d4d';
        ctx.fillText('THE RATS GOT THE EGGS!', GAME_W / 2, GAME_H * 0.3);
      }
    } else if (game.mode === 'nestReady') {
      drawNestHud();
      const num = Math.max(1, 3 - Math.floor(game.countT));
      const frac = game.countT - Math.floor(game.countT);
      const scale = 1 + (1 - frac) * 0.35;
      ctx.save();
      ctx.translate(GAME_W / 2, GAME_H * 0.34);
      ctx.scale(scale, scale);
      ctx.font = 'bold 84px ' + UI_FONT;
      ctx.lineWidth = 10;
      ctx.strokeStyle = 'rgba(40,80,35,0.9)';
      ctx.strokeText(num, 0, 0);
      ctx.fillStyle = '#8ce34c';
      ctx.fillText(num, 0, 0);
      ctx.restore();
      ctx.font = 'bold 22px ' + UI_FONT;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(40,80,35,0.85)';
      ctx.strokeText('GET READY!', GAME_W / 2, GAME_H * 0.34 + 44);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('GET READY!', GAME_W / 2, GAME_H * 0.34 + 44);
    } else if (game.mode === 'play') {
      const pop = 1 + game.scorePop * 0.45;
      const tilt = game.scorePopVel * 0.03;
      ctx.save();
      ctx.translate(GAME_W / 2, 72);
      ctx.scale(pop, pop);
      ctx.rotate(tilt);
      ctx.font = 'bold 46px ' + UI_FONT;
      ctx.lineWidth = 8;
      ctx.strokeStyle = 'rgba(25,70,30,0.85)';
      ctx.strokeText(game.score, 0, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(game.score, 0, 0);
      ctx.restore();

      const cycleScore = game.score % 150;
      const nextAt =
        game.stage === 1 ? 10 : game.stage === 2 ? 30 : game.stage === 3 ? 40 : game.stage === 4 ? 50 : game.stage === 5 ? 70 : game.stage === 6 ? 80 : game.stage === 7 ? 90 : game.stage === 8 ? 100 : game.stage === 9 ? 110 : game.stage === 10 ? 120 : game.stage === 11 ? 130 : game.stage === 12 ? 140 : game.stage === 13 ? 150 : null;
      if (nextAt !== null) {
        const left = Math.max(0, nextAt - cycleScore);
        ctx.font = 'bold 13px ' + UI_FONT;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(25,70,30,0.7)';
        ctx.strokeText(left + ' more to dodge', GAME_W / 2, 94);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText(left + ' more to dodge', GAME_W / 2, 94);
      }
      if (game.stage === 14) {
        ctx.font = 'bold 13px ' + UI_FONT;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(25,10,10,0.75)';
        ctx.strokeText('Lava dodged: ' + game.volcanoCount + ' / ' + VOLCANO_TARGET, GAME_W / 2, 94);
        ctx.fillStyle = 'rgba(255,220,150,0.95)';
        ctx.fillText('Lava dodged: ' + game.volcanoCount + ' / ' + VOLCANO_TARGET, GAME_W / 2, 94);
      }
      if (game.stage === 15) {
        ctx.font = 'bold 13px ' + UI_FONT;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(10,25,30,0.75)';
        ctx.strokeText('Hurricanes dodged: ' + game.hurricaneCount + ' / ' + HURRICANE_TARGET, GAME_W / 2, 94);
        ctx.fillStyle = 'rgba(205,240,250,0.95)';
        ctx.fillText('Hurricanes dodged: ' + game.hurricaneCount + ' / ' + HURRICANE_TARGET, GAME_W / 2, 94);
      }

      if (game.stageBanner > 0) {
        const info =
          game.stage === 1
            ? null
            : game.stage === 2
              ? { title: 'CROWS', sub: 'Dodge the crows!', col: '#ff4d3d' }
              : game.stage === 3
                ? { title: 'SNAKES', sub: 'Dodge the snakes!', col: '#ff5a2a' }
                : game.stage === 4
                  ? { title: 'SHARKS', sub: 'Dodge the sharks!', col: '#57c8e8' }
                  : game.stage === 5
                    ? { title: 'FOOTBALLS', sub: 'Dodge the balls!', col: '#8ce34c' }
                    : game.stage === 6
                      ? { title: 'THUNDER', sub: 'Dodge the lightning!', col: '#ff4d3d' }
                      : game.stage === 7
                        ? { title: 'HUNTERS', sub: 'Dodge the nets!', col: '#c9a13f' }
                        : game.stage === 8
                          ? { title: 'AIRPLANES', sub: 'Dodge the planes!', col: '#57d0f0' }
                          : game.stage === 9
                            ? { title: 'SATELLITES', sub: 'Dodge the satellites!', col: '#6fa8ff' }
                            : game.stage === 10
                              ? { title: 'ASTEROIDS', sub: 'Dodge the rocks!', col: '#c89a6a' }
                              : game.stage === 11
                                ? { title: 'PLANETS', sub: 'Dodge the planets!', col: '#e88a4a' }
                                : game.stage === 12
                                  ? { title: 'EARTH', sub: 'Sunny is home!', col: '#8ce34c' }
                                  : game.stage === 13
                                    ? { title: 'MONSTER PLANTS', sub: 'Dodge the hungry plants!', col: '#74c558' }
                                    : game.stage === 14
                                      ? { title: 'VOLCANO', sub: 'Dodge the lava!', col: '#ff7b3d' }
                                      : game.stage === 15
                                        ? { title: 'HURRICANE', sub: 'Dodge the hurricanes!', col: '#7fd4e8' }
                                        : null;
        if (info) {
          const bannerT = 2.6 - game.stageBanner;
          const slideIn = clamp(bannerT / 0.55, 0, 1);
          const bounceIn = 1 - Math.pow(1 - slideIn, 3);
          const bounceScale = 1 + Math.sin(slideIn * Math.PI) * 0.12;
          const offsetX = (1 - bounceIn) * -200;
          const fadeOut = clamp(game.stageBanner / 0.7, 0, 1);
          ctx.save();
          ctx.globalAlpha = fadeOut;
          ctx.translate(GAME_W / 2 + offsetX, GAME_H * 0.38);
          ctx.scale(bounceScale, bounceScale);
          ctx.font = 'bold 52px ' + UI_FONT;
          ctx.lineWidth = 9;
          ctx.strokeStyle = 'rgba(20,45,25,0.9)';
          ctx.strokeText(info.title, 0, 0);
          ctx.fillStyle = info.col;
          ctx.fillText(info.title, 0, 0);
          ctx.font = 'bold 19px ' + UI_FONT;
          ctx.lineWidth = 5;
          ctx.strokeText(info.sub, 0, 36);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(info.sub, 0, 36);
          ctx.restore();
        }
      }
    } else if (game.mode === 'over') {
      ctx.globalAlpha = game.overlay;
      ctx.fillStyle = 'rgba(12,26,18,0.45)';
      ctx.fillRect(0, 0, GAME_W, GAME_H);
      const pw = 304;
      const ph = 258;
      const slideT = clamp(game.overlay / 0.6, 0, 1);
      const slideEase = 1 - Math.pow(1 - slideT, 3.5);
      const panelBounce = 1 + Math.sin(slideT * Math.PI) * 0.04;
      const px = (GAME_W - pw) / 2;
      const py = 205 + (1 - slideEase) * 120;
      ctx.save();
      ctx.translate(px + pw / 2, py + ph / 2);
      ctx.scale(panelBounce, panelBounce);
      ctx.translate(-(px + pw / 2), -(py + ph / 2));
      roundRect(px, py, pw, ph, 18);
      ctx.fillStyle = '#fff7e0';
      ctx.fill();
      ctx.strokeStyle = 'rgba(40,80,35,0.4)';
      ctx.lineWidth = 3;
      ctx.stroke();

      const textDelay = clamp((game.overlay - 0.25) / 0.4, 0, 1);
      const textFade = Math.pow(textDelay, 2);

      ctx.globalAlpha = game.overlay * textFade;
      ctx.font = 'bold 36px ' + UI_FONT;
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(40,80,35,0.5)';
      ctx.strokeText('Game Over', GAME_W / 2, py + 56);
      ctx.fillStyle = '#3d7a2f';
      ctx.fillText('Game Over', GAME_W / 2, py + 56);

      ctx.font = 'bold 23px ' + UI_FONT;
      ctx.fillStyle = '#555555';
      ctx.fillText('Score   ' + game.score, GAME_W / 2, py + 106);
      ctx.fillStyle = '#d9991f';
      ctx.fillText('Best   ' + game.best, GAME_W / 2, py + 140);

      if (game.newRecord) {
        ctx.font = 'bold 15px ' + UI_FONT;
        const recBounce = 1 + Math.sin(game.t * 6) * 0.08;
        ctx.save();
        ctx.translate(GAME_W / 2, py + 164);
        ctx.scale(recBounce, recBounce);
        ctx.fillStyle = '#e08a12';
        ctx.fillText('NEW BEST!', 0, 0);
        ctx.restore();
      }

      ctx.strokeStyle = 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px + 30, py + 176);
      ctx.lineTo(px + pw - 30, py + 176);
      ctx.stroke();

      const tapDelay = clamp((game.overlay - 0.5) / 0.4, 0, 1);
      const pulse = 0.6 + Math.sin(game.t * 4) * 0.2;
      ctx.globalAlpha = game.overlay * tapDelay * pulse;
      ctx.font = 'bold 19px ' + UI_FONT;
      ctx.fillStyle = '#3d7a2f';
      ctx.fillText('Tap or press Space to retry', GAME_W / 2, py + 208);
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  function render() {
    ctx.clearRect(0, 0, GAME_W, GAME_H);

    if (game.stage === 16) {
      drawSewerBackground();
      drawZombies();
      ctx.save();
      if (game.shake > 0) {
        const s = game.shake * 7;
        ctx.translate((Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s);
        ctx.rotate((Math.random() * 2 - 1) * game.shake * 0.02);
      }
      drawSewerBird(game.sewerRunX, SEWER_GROUND - 16, game.sewerFacing, game.rot, game.t);
      drawSwordSlash();
      ctx.restore();
      drawSewerHud();
      if (game.stageBanner > 0) {
        const bannerT = 2.6 - game.stageBanner;
        const slideIn = clamp(bannerT / 0.55, 0, 1);
        const bounceIn = 1 - Math.pow(1 - slideIn, 3);
        const bounceScale = 1 + Math.sin(slideIn * Math.PI) * 0.12;
        const offsetX = (1 - bounceIn) * -220;
        const fadeOut = clamp(game.stageBanner / 0.7, 0, 1);
        ctx.save();
        ctx.globalAlpha = fadeOut;
        ctx.translate(GAME_W / 2 + offsetX, 128);
        ctx.scale(bounceScale, bounceScale);
        ctx.font = 'bold 52px ' + UI_FONT;
        ctx.lineWidth = 9;
        ctx.strokeStyle = 'rgba(10,25,18,0.95)';
        ctx.strokeText('THE SEWER', 0, 0);
        ctx.fillStyle = '#9fe06a';
        ctx.fillText('THE SEWER', 0, 0);
        ctx.font = 'bold 18px ' + UI_FONT;
        ctx.lineWidth = 4;
        ctx.strokeText('walk & slash the zombies!', 0, 24);
        ctx.fillStyle = '#ffffff';
        ctx.fillText('walk & slash the zombies!', 0, 24);
        ctx.restore();
      } else if (game.zombieCount >= SEWER_TARGET) {
        ctx.font = 'bold 40px ' + UI_FONT;
        ctx.lineWidth = 8;
        ctx.strokeStyle = 'rgba(10,25,18,0.9)';
        ctx.strokeText('ZOMBIES SPLITTED!', GAME_W / 2, GAME_H * 0.3);
        ctx.fillStyle = '#b4ff7d';
        ctx.fillText('ZOMBIES SPLITTED!', GAME_W / 2, GAME_H * 0.3);
      }
      if (game.flash > 0) {
        ctx.fillStyle = 'rgba(255,255,255,' + (game.flash * 0.55).toFixed(3) + ')';
        ctx.fillRect(0, 0, GAME_W, GAME_H);
      }
      drawUI();
      return;
    }

    if (game.mode === 'tajFly') {
      drawTajScene();
      drawFeathers();
      ctx.save();
      const bx = game.tajX - game.tajCam;
      drawBird(bx, game.tajY, game.rot, game.wing, game.t, 1);
      ctx.restore();
      drawTajHud();
      return;
    }

    const cyc = sampleCycle(game.dayPhase);
    const biome = currentBiome();
    const skyTop = lerpC(cyc.top, biome.sky.top, biome.blend);
    const skyMid = lerpC(cyc.mid, biome.sky.mid, biome.blend);
    const skyBot = lerpC(cyc.bot, biome.sky.bot, biome.blend);

    const sky = ctx.createLinearGradient(0, 0, 0, SKY_H);
    sky.addColorStop(0, cssC(skyTop));
    sky.addColorStop(0.25, cssC(lerpC(skyTop, skyMid, 0.4)));
    sky.addColorStop(0.5, cssC(skyMid));
    sky.addColorStop(0.75, cssC(lerpC(skyMid, skyBot, 0.5)));
    sky.addColorStop(1, cssC(skyBot));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    const haze = ctx.createLinearGradient(0, SKY_H * 0.5, 0, SKY_H);
    haze.addColorStop(0, 'rgba(255,255,255,0)');
    haze.addColorStop(1, 'rgba(255,255,255,' + (0.08 + (1 - cyc.dim) * 0.06).toFixed(3) + ')');
    ctx.fillStyle = haze;
    ctx.fillRect(0, SKY_H * 0.5, GAME_W, SKY_H * 0.5);

    const inSpace = game.stage >= 9 && game.stage <= 11;
    drawSun(inSpace ? 0 : 1 - cyc.moon);
    drawMoon(inSpace ? 0 : cyc.moon);
    drawHills();
    drawClouds();
    drawStars(inSpace ? 1 : cyc.star);
    drawLaunchStreaks();
    drawRain();
    drawFloaters();

    ctx.save();
    if (game.shake > 0) {
      const s = game.shake * 7;
      ctx.translate((Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s);
      ctx.rotate((Math.random() * 2 - 1) * game.shake * 0.02);
    }

    drawPipes();
    drawCrows();
    drawSnakes();
    drawGround(biome);
    if (!game.nestActive) drawDecor();
    drawSharks();
    drawWaves();
    drawBalls();
    drawNetters();
    drawPlanes();
    drawSatellites();
    drawAsteroids();
    drawPlanets();
    drawPlants();
    drawLava();
    drawVolcanoSparks();
    drawHurricanes();
    drawSplashes();
    drawLightnings();
    if (game.mode === 'over' && game.stage >= 9 && game.stage <= 11) drawSpaceEarth();
    if (cyc.dim > 0.01) {
      ctx.fillStyle = 'rgba(20,28,22,' + cyc.dim.toFixed(3) + ')';
      ctx.fillRect(-24, -24, GAME_W + 48, GAME_H + 48);
    }
    drawFeathers();
    if (game.nestActive) drawNestScene();
    drawBirdShadow();
    const bx = game.mode === 'intro' ? game.introX : game.mode === 'over' ? game.birdX : game.mode === 'launch' || game.mode === 'countdown' ? game.launchX : game.mode === 'nestCountdown' || game.mode === 'nest' || game.mode === 'nestReady' || game.mode === 'nestFly' ? game.birdX : game.mode === 'tajFly' ? game.tajX : BIRD_X;
    const by = game.mode === 'tajFly' ? game.tajY : game.birdY;
    const facing = game.mode === 'nestFly' ? -1 : (game.mode === 'nestCountdown' || game.mode === 'nest' || game.mode === 'nestReady') && game.nestLook < -0.2 ? -1 : 1;
    if (game.invuln > 0) {
      ctx.save();
      ctx.globalAlpha = 0.45 + Math.sin(game.t * 30) * 0.25;
      drawBird(bx, by, game.rot, game.wing, game.t, facing);
      ctx.restore();
    } else {
      drawBird(bx, by, game.rot, game.wing, game.t, facing);
    }
    drawWarp();
    ctx.restore();

    if (game.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (game.flash * 0.55).toFixed(3) + ')';
      ctx.fillRect(0, 0, GAME_W, GAME_H);
    }

    let redFlash = 0;
    for (const L of game.lightnings) {
      if (L.phase === 0) {
        const flashes = [0.35, 1.1, 1.85];
        for (const ft of flashes) {
          if (L.t >= ft && L.t < ft + 0.35) redFlash = Math.max(redFlash, 0.4);
        }
      }
    }
    if (redFlash > 0) {
      ctx.fillStyle = 'rgba(255,45,35,' + redFlash.toFixed(3) + ')';
      ctx.fillRect(0, 0, GAME_W, GAME_H);
    }

    drawUI();
    if (game.cutSceneMenu) drawCutSceneMenu();
  }

  function drawCutSceneMenu() {
    const pw = 300;
    const ph = 46 + CUTSCENES.length * 34 + 20;
    const px = (GAME_W - pw) / 2;
    const py = (GAME_H - ph) / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(12,26,18,0.62)';
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    roundRect(px, py, pw, ph, 16);
    ctx.fillStyle = '#fff7e0';
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,80,35,0.4)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.font = 'bold 24px ' + UI_FONT;
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(40,80,35,0.5)';
    ctx.strokeText('Choose a cutscene', GAME_W / 2, py + 34);
    ctx.fillStyle = '#3d7a2f';
    ctx.fillText('Choose a cutscene', GAME_W / 2, py + 34);

    ctx.font = 'bold 17px ' + UI_FONT;
    ctx.textAlign = 'left';
    for (let i = 0; i < CUTSCENES.length; i++) {
      const y = py + 62 + i * 34;
      ctx.fillStyle = i === game.cutSceneIndex ? '#e0a010' : '#555555';
      ctx.fillText((i + 1) + '. ' + CUTSCENES[i].name, px + 26, y);
    }
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px ' + UI_FONT;
    ctx.fillStyle = '#999999';
    ctx.fillText('Press 1-' + CUTSCENES.length + ' to play  |  Z / Esc to close', GAME_W / 2, py + ph - 18);
    ctx.restore();
  }

  let last = performance.now();
  function loop(now) {
    const dt = now - last;
    last = now;
    const f = clamp(dt / 16.666, 0.1, 2.4);
    update(f);
    render();
    requestAnimationFrame(loop);
  }

  function onInput(e) {
    ac();
    if (e && e.isPrimary === false) return;
    if (e && e.cancelable) e.preventDefault();
    if (game.mode === 'nestCountdown' || game.mode === 'nest') {
      let side = 'L';
      if (e && e.clientX !== undefined) {
        const rect = canvas.getBoundingClientRect();
        side = (e.clientX - rect.left) < rect.width / 2 ? 'L' : 'R';
      } else {
        side = pointer.x === null || pointer.x < GAME_W / 2 ? 'L' : 'R';
      }
      pressNestButton(side);
      return;
    }
    if (game.mode === 'sewer') {
      let side = 'S';
      if (e && e.clientX !== undefined) {
        const rect = canvas.getBoundingClientRect();
        const px = (e.clientX - rect.left) * (GAME_W / rect.width);
        if (px < GAME_W * 0.28) side = 'L';
        else if (px > GAME_W * 0.72) side = 'R';
      } else {
        side = pointer.x === null ? 'S' : pointer.x < GAME_W * 0.28 ? 'L' : pointer.x > GAME_W * 0.72 ? 'R' : 'S';
      }
      if (side === 'L') sewerMoveInput(-1);
      else if (side === 'R') sewerMoveInput(1);
      else sewerSlash();
      return;
    }
    flap();
  }

  function sewerMoveInput(dir) {
    if (dir === -1) {
      game.moveLeft = true;
      game.moveRight = false;
    } else if (dir === 1) {
      game.moveRight = true;
      game.moveLeft = false;
    } else {
      game.moveLeft = false;
      game.moveRight = false;
    }
  }

  window.addEventListener('pointerdown', onInput);
  window.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = (e.clientX - rect.left) * (GAME_W / rect.width);
    pointer.y = (e.clientY - rect.top) * (GAME_H / rect.height);
  });
  window.addEventListener('keydown', (e) => {
    if (game.mode === 'nestCountdown' || game.mode === 'nest') {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        e.preventDefault();
        pressNestButton('L');
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault();
        pressNestButton('R');
      }
      return;
    }
    if (game.mode === 'sewer') {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        e.preventDefault();
        sewerMoveInput(-1);
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        e.preventDefault();
        sewerMoveInput(1);
      }
      return;
    }
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Enter') {
      onInput(e);
    } else if (e.code === 'KeyZ' && (game.mode === 'play' || game.mode === 'ready' || game.mode === 'over')) {
      game.cutSceneIndex = 0;
      game.cutSceneMenu = !game.cutSceneMenu;
      e.preventDefault();
    } else if (game.cutSceneMenu && /^Digit\d$/.test(e.code)) {
      const idx = Number(e.code.slice(-1)) - 1;
      if (idx >= 0 && idx < CUTSCENES.length) startCutScene(idx);
    } else if (e.code === 'Escape' && game.cutSceneMenu) {
      game.cutSceneMenu = false;
    } else if (e.code === 'KeyS' && game.mode === 'play' && !game.teleported) {
      jumpToStage(3);
    } else if (e.code === 'KeyT' && game.mode === 'play' && !game.teleported) {
      game.teleported = true;
      game.score = 140;
      startVolcano();
    } else if (e.code === 'KeyY' && game.mode === 'play' && !game.teleported) {
      game.teleported = true;
      startHurricane();
    } else if (e.code === 'KeyE' && game.mode === 'play') {
      startNest();
    } else if (e.code === 'KeyG' && game.mode === 'play') {
      startTajFly();
    }
  });

  const clearSewerMove = (e) => {
    if (game.mode === 'sewer') sewerMoveInput(0);
  };
  window.addEventListener('pointerup', clearSewerMove);
  window.addEventListener('pointercancel', clearSewerMove);
  window.addEventListener('blur', clearSewerMove);
  window.addEventListener('keyup', (e) => {
    if (game.mode === 'sewer' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyA' || e.code === 'KeyD')) {
      sewerMoveInput(0);
    }
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  reset();
  requestAnimationFrame(loop);
})();
