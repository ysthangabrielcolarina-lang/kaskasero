// ==================================================
// KASKASERO! – curvy "behind the car" racing game
// ==================================================
//
// THE BIG IDEA (fake 3D road):
// The road is a long list of short flat pieces called SEGMENTS.
// Every frame we take the next ~200 segments ahead of the camera and
// "project" them: far segments get drawn small and near the horizon,
// near segments get drawn big and near the bottom of the screen.
// A segment can have a "curve" value. Adding up the curves as we go
// further away shifts far segments sideways, which makes the road bend.

// ----- 1. Canvas setup -----
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = canvas.width;              // 960
const H = canvas.height;             // 540
const HORIZON = Math.round(H * 0.34); // y where the sky meets the ground

// ----- 2. HTML elements -----
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const speedEl = document.getElementById("speed");
const hud = document.getElementById("hud");
const touch = document.getElementById("touch");
const homeScreen = document.getElementById("home");
const howtoScreen = document.getElementById("howto");
const overScreen = document.getElementById("gameover");
const homeBestEl = document.getElementById("home-best");
const overTitle = document.getElementById("over-title");
const finalScoreEl = document.getElementById("final-score");
const overBestEl = document.getElementById("over-best");
const kitaEl = document.getElementById("kita");
const muteBtn = document.getElementById("mute-btn");

// ----- 3. World settings -----
const SEG_LEN = 200;         // length of one road segment
const RUMBLE_LEN = 3;        // segments per red/white stripe
const ROAD_W = 2400;         // half the road width (in world units)
const CAM_H = 1600;          // camera height above the road (higher = see further)
const CAM_DEPTH = 1 / Math.tan((100 / 2) * Math.PI / 180); // field of view = 100°
const DRAW_DIST = 200;       // how many segments we draw ahead
const PLAYER_Z = CAM_H * CAM_DEPTH * 1.05; // player's distance in front of the camera
const LANES = 4;
const LANE_POS = [-0.75, -0.25, 0.25, 0.75]; // lane centers (-1 = left edge, 1 = right edge)
const CAR_W = 560;           // car width (world units)
const CAR_LEN = 300;         // the player car's length, used for crashes
const TREE_H = 1900;         // tree height (world units)
const MIN_SPEED = 105;       // start speed: easy, but not boring
const TRAFFIC_SPEED = 45;    // traffic is slower than you, so you catch up to it

// Colors as [r, g, b] so we can blend them with fog
const COL = {
  fog: [212, 241, 227],
  grass1: [121, 217, 143], grass2: [112, 209, 135],
  road1: [70, 90, 94],     road2: [62, 81, 85],
  rumble1: [236, 59, 85],  rumble2: [247, 247, 247],
  lane: [238, 242, 242],
};

const CAR_COLORS = [
  { body: "#ff8a1f", dark: "#c9600b", top: "#ffab5c" },  // orange
  { body: "#3ccf4e", dark: "#25963a", top: "#7be38a" },  // green
  { body: "#ffd21f", dark: "#c9a10b", top: "#ffe36b" },  // yellow
  { body: "#3b82f6", dark: "#1d4ed8", top: "#7aaaf9" },  // blue
  { body: "#a855f7", dark: "#7e22ce", top: "#c793fb" },  // purple
];
// Player car colors (same order as the swatches on the home screen)
// All traffic vehicle types.
//   w      = width (world units; the player car is 560)
//   weight = how often it appears (bigger = more often)
//   h      = height compared to its width (used to put the blinker arrow on top)
const VEHICLES = {
  car:       { w: 560, len: 300, weight: 26, h: 0.72 },
  tricycle:  { w: 560, len: 260, weight: 16, h: 1.25 },
  ebike:     { w: 440, len: 220, weight: 12, h: 1.33 },
  jeepney:   { w: 660, len: 450, weight: 16, h: 1.13 },
  l300:      { w: 620, len: 380, weight: 12, h: 1.07 },
  boxtruck:  { w: 780, len: 600, weight: 9,  h: 1.46 },
  dumptruck: { w: 800, len: 600, weight: 9,  h: 1.3 },
  bus:       { w: 820, len: 900, weight: 7,  h: 1.53 },
  kalesa:    { w: 600, len: 500, weight: 6,  h: 1.25 },   // only in Calauan and Manila
};

const TRIKE_COLORS = [
  { body: "#f7c600", dark: "#c79f00" },   // yellow
  { body: "#2f7de1", dark: "#1f5bb0" },   // blue
  { body: "#2fb35a", dark: "#22843f" },   // green
  { body: "#e2382f", dark: "#a82720" },   // red
];
const JEEP_COLORS = [
  { body: "#d62828", dark: "#9e1c1c", band: "#f9c80e", stripe: "#1d4fbf", roof: "#c1121f" },
  { body: "#1d4fbf", dark: "#153a8f", band: "#f9c80e", stripe: "#d62828", roof: "#163d94" },
  { body: "#f2f2f2", dark: "#c4c4c4", band: "#d62828", stripe: "#1d4fbf", roof: "#d62828" },
];

const pickOne = (list) => list[Math.floor(Math.random() * list.length)];

// Kalesas only show up in Calauan and Manila
function typeWeight(t) {
  if (t === "kalesa" && !["Calauan", "Manila"].includes(currentLocation().name)) return 0;
  return VEHICLES[t].weight;
}

// Picks a vehicle type at random, using the weights above
function randomType() {
  const types = Object.keys(VEHICLES);
  let r = Math.random() * types.reduce((sum, t) => sum + typeWeight(t), 0);
  for (const t of types) {
    r -= typeWeight(t);
    if (r <= 0) return t;
  }
  return "car";
}

// Picks colors that fit the vehicle type
function randomLook(type) {
  if (type === "car") return pickOne(CAR_COLORS);
  if (type === "tricycle") return pickOne(TRIKE_COLORS);
  if (type === "jeepney") return pickOne(JEEP_COLORS);
  return null;   // the others always use the same colors
}

const PLAYER_COLORS = [
  { body: "#e8264f", dark: "#a8163a", top: "#ff5577" },  // red
  { body: "#1f8a9c", dark: "#16697a", top: "#3fb3c6" },  // teal
  { body: "#f5f5f5", dark: "#c9c9c9", top: "#ffffff" },  // white
  { body: "#2b2b2b", dark: "#151515", top: "#4a4a4a" },  // black
  { body: "#facc15", dark: "#b8920b", top: "#fde68a" },  // yellow
  { body: "#2563eb", dark: "#1a46a8", top: "#60a5fa" },  // blue
];

// Vehicles the player can drive (chosen in the garage on the home screen)
//   maxSpeed = top speed, w = width
//   hit = how much of the width counts for crashes (smaller = squeezes through)
// Steering is the same for every vehicle (PLAYER_GRIP).
const PLAYER_GRIP = 0.23;
const PLAYER_TYPES = [
  { id: "sports",   name: "Sports Car",   w: 580, hit: 1,    maxSpeed: 245, colors: true,
    special: "Fastest car. Built for speed." },
  { id: "electric", name: "Electric Car", w: 560, hit: 1,    maxSpeed: 220, colors: true, startSpeed: 125, powerMult: 1.6,
    special: "Quick start. Magnet and Slow-mo last longer." },
  { id: "muscle",   name: "Retro Muscle", w: 620, hit: 1,    maxSpeed: 238, colors: true, nearMult: 1.5,
    special: "Very fast. Close calls give +50% points." },
  { id: "jeepney",  name: "Jeepney",      w: 660, hit: 1,    maxSpeed: 190, refillShield: true,
    special: "Matibay! Free shield in every new place." },
  // The secret one: best at everything. Unlock by reaching Tagaytay or paying ₱500.
  { id: "hari", name: "Hari ng Daan", tag: "E-BIKE", w: 440, hit: 0.75, maxSpeed: 250, locked: true, price: 500,
    startSpeed: 130, coinMult: 2, powerMult: 1.6, nearMult: 1.5, refillShield: true,
    special: "Ang Hari ng Daan! Max speed, slimmest, double ₱, all bonuses." },
];
const DEMO_SPEED = 110;      // speed of the self-driving car on the home screen

// Seeded random: gives the same "random" track every time
let seed = 7;
function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

// ----- 4. Build the track -----
const segments = [];

function addSegment(curve) {
  const n = segments.length;
  segments.push({
    index: n,
    curve,
    z1: n * SEG_LEN,          // where this segment starts
    z2: (n + 1) * SEG_LEN,    // where it ends
    s1: {}, s2: {},           // screen positions (filled in every frame)
    sprites: [],              // trees and bushes beside this segment
  });
}

// Smoothly go from a to b (t goes 0 → 1)
const ease = (a, b, t) => a + (b - a) * (-Math.cos(t * Math.PI) / 2 + 0.5);

// A road piece: ease into the curve, hold it, ease out of it
function addRoad(length, curve) {
  for (let i = 0; i < 25; i++) addSegment(ease(0, curve, i / 25));
  for (let i = 0; i < length; i++) addSegment(curve);
  for (let i = 0; i < 25; i++) addSegment(ease(curve, 0, i / 25));
}

// Positive curve = bends right, negative = bends left
addRoad(40, 0);
addRoad(60, 3);
addRoad(30, 0);
addRoad(50, -4);
addRoad(40, 4);
addRoad(60, 0);
addRoad(80, -2);
addRoad(40, 5);
addRoad(30, -5);
addRoad(50, 0);
addRoad(70, 3);
addRoad(40, -3);
addRoad(40, 0);

// Scatter trees and bushes on both sides of the road
for (const seg of segments) {
  if (rand() < 0.22) {
    const side = rand() < 0.5 ? -1 : 1;
    seg.sprites.push({
      type: rand() < 0.75 ? "tree" : "bush",
      offset: side * (1.45 + rand() * 2.4),
      size: 0.7 + rand() * 0.6,
      keep: rand() < 0.25,     // in towns, only these trees stay
    });
  }
}

const TRACK_LEN = segments.length * SEG_LEN;
const findSegment = (z) => {
  const n = segments.length;
  return segments[((Math.floor(z / SEG_LEN) % n) + n) % n];
};

// Distance from the player to z, going the short way round the loop
// (positive = ahead of the player, negative = behind)
function relZ(z, playerZ) {
  return ((z - playerZ) % TRACK_LEN + TRACK_LEN * 1.5) % TRACK_LEN - TRACK_LEN / 2;
}

// ----- 5. Background (drawn once into hidden canvases) -----
const LAYER_W = W * 2;

function makeLayer(paint) {
  const c = document.createElement("canvas");
  c.width = LAYER_W;
  c.height = HORIZON + 2;
  paint(c.getContext("2d"));
  return c;
}

function fillPoly(g, color, pts) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  g.fill();
}

// Draw something 3 times so it wraps around seamlessly
function wrapped(x, drawAt) {
  drawAt(x - LAYER_W);
  drawAt(x);
  drawAt(x + LAYER_W);
}

// Fluffy clouds made of circles
const cloudLayer = makeLayer((g) => {
  g.fillStyle = "#ffffff";
  for (let i = 0; i < 9; i++) {
    const cx = (i / 9) * LAYER_W + rand() * 80;
    const cy = HORIZON * (0.2 + rand() * 0.35);
    const size = 30 + rand() * 30;
    wrapped(cx, (x) => {
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        g.arc(x + (k - 2) * size * 0.7, cy - Math.sin((k / 4) * Math.PI) * size * 0.6, size * (0.6 + 0.4 * Math.sin((k / 4) * Math.PI)), 0, Math.PI * 2);
        g.fill();
      }
    });
  }
});

// Big mint mountains with snowy tops (low-poly: light side + shaded side)
const mountainLayer = makeLayer((g) => {
  for (let i = 0; i < 10; i++) {
    const peakX = (i / 10) * LAYER_W + rand() * 60;
    const h = HORIZON * (0.45 + rand() * 0.3);
    const half = h * (0.85 + rand() * 0.3);
    const top = HORIZON - h;
    wrapped(peakX, (x) => {
      fillPoly(g, "#c9efdc", [x, top, x - half, HORIZON, x, HORIZON]);
      fillPoly(g, "#b0e3ca", [x, top, x + half, HORIZON, x, HORIZON]);
      // snow cap with a zig-zag edge
      fillPoly(g, "#ffffff", [x, top, x - half * 0.22, top + h * 0.22, x - half * 0.08, top + h * 0.16, x, top + h * 0.24]);
      fillPoly(g, "#e3f5ee", [x, top, x, top + h * 0.24, x + half * 0.1, top + h * 0.17, x + half * 0.22, top + h * 0.22]);
    });
  }
});

// Closer green hills with a row of little trees
const hillLayer = makeLayer((g) => {
  for (let i = 0; i < 14; i++) {
    const peakX = (i / 14) * LAYER_W + rand() * 50;
    const h = HORIZON * (0.14 + rand() * 0.16);
    const half = h * 2.2;
    wrapped(peakX, (x) => {
      fillPoly(g, "#a3e2c2", [x, HORIZON - h, x - half, HORIZON, x, HORIZON]);
      fillPoly(g, "#8fd6b3", [x, HORIZON - h, x + half, HORIZON, x, HORIZON]);
    });
  }
  for (let i = 0; i < 60; i++) {
    const tx = rand() * LAYER_W;
    const th = 18 + rand() * 30;
    wrapped(tx, (x) => {
      fillPoly(g, "#74cc9f", [x, HORIZON - th, x - th * 0.3, HORIZON, x, HORIZON]);
      fillPoly(g, "#5fbd8e", [x, HORIZON - th, x + th * 0.3, HORIZON, x, HORIZON]);
    });
  }
});

// Real mountains for some places. Each is drawn twice across the layer,
// so one copy is always on screen.
function farPeaks(g, color) {        // pale small peaks far away behind the big mountain
  for (let i = 0; i < 12; i++) {
    const x = (i / 12) * LAYER_W, h = HORIZON * (0.18 + rand() * 0.15);
    wrapped(x, (px) => fillPoly(g, color, [px - h * 1.6, HORIZON, px, HORIZON - h, px + h * 1.6, HORIZON]));
  }
}
// A smooth mountain from a list of [x, height] points (left half light, right half shaded)
function smoothMountain(g, pts, light, dark) {
  const midX = (pts[0][0] + pts[pts.length - 1][0]) / 2;
  for (const [color, shaded] of [[light, false], [dark, true]]) {
    g.save();
    if (shaded) {
      g.beginPath();
      g.rect(midX, 0, LAYER_W, HORIZON + 2);
      g.clip();
    }
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(pts[0][0], HORIZON);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = HORIZON - (pts[i][1] + pts[i + 1][1]) / 2;
      g.quadraticCurveTo(pts[i][0], HORIZON - pts[i][1], mx, my);
    }
    g.lineTo(pts[pts.length - 1][0], HORIZON);
    g.closePath();
    g.fill();
    g.restore();
  }
}
const backdrops = {
  generic: mountainLayer,
  // Mt. Kalisungan (Calauan): a tall, round, forested mountain
  kalisungan: makeLayer((g) => {
    farPeaks(g, "#cdeedd");
    for (const cx of [LAYER_W * 0.25, LAYER_W * 0.75]) {
      const h = HORIZON * 0.78, half = h * 1.45;
      smoothMountain(g, [[cx - half, 0], [cx - half * 0.55, h * 0.45], [cx - half * 0.2, h * 0.95], [cx, h],
        [cx + half * 0.2, h * 0.95], [cx + half * 0.55, h * 0.45], [cx + half, 0]], "#6bb98a", "#559f74");
      for (let i = 0; i < 90; i++) {                  // forest texture: little dark trees
        const fx = (rand() - 0.5) * 1.6;              // -0.8 .. 0.8 of the half width
        const tx = cx + fx * half;
        const maxH = h * (1 - Math.abs(fx) * 0.95);
        const top = HORIZON - maxH * rand() * 0.85 - 6;
        fillPoly(g, "rgba(40,110,70,0.45)", [tx - 7, top + 14, tx, top, tx + 7, top + 14]);
      }
    }
  }),
  // Mt. Makiling (Bay, Los Baños, Calamba): the "sleeping lady" shape
  makiling: makeLayer((g) => {
    farPeaks(g, "#d2efe2");
    const shape = [[0, 0], [0.07, 0.3], [0.13, 0.48], [0.2, 0.4], [0.28, 0.6], [0.38, 0.92], [0.46, 0.75],
      [0.55, 0.8], [0.64, 0.66], [0.74, 0.62], [0.84, 0.42], [0.92, 0.22], [1, 0]];
    for (const start of [LAYER_W * 0.03, LAYER_W * 0.53]) {
      const wide = LAYER_W * 0.46, h = HORIZON * 0.62;
      smoothMountain(g, shape.map(([fx, fh]) => [start + fx * wide, fh * h]), "#86c9a8", "#72b796");
    }
  }),
  // Taal (Tagaytay): the lake with the volcano island, mountains far behind
  taal: makeLayer((g) => {
    farPeaks(g, "#c9dfd5");
    g.fillStyle = "#5fa8d3";
    g.fillRect(0, HORIZON - 34, LAYER_W, 36);
    g.fillStyle = "rgba(255,255,255,0.35)";
    for (let i = 0; i < 40; i++) g.fillRect(rand() * LAYER_W, HORIZON - 30 + rand() * 26, 20 + rand() * 40, 2);
    for (const cx of [LAYER_W * 0.25, LAYER_W * 0.75]) {
      fillPoly(g, "#8a9a72", [cx - 200, HORIZON - 20, cx - 60, HORIZON - 82, cx + 50, HORIZON - 78, cx + 210, HORIZON - 20]);
      fillPoly(g, "#76865f", [cx - 5, HORIZON - 80, cx + 50, HORIZON - 78, cx + 210, HORIZON - 20, cx + 30, HORIZON - 20]);
      g.fillStyle = "#7fc8e0";                         // crater lake on top
      g.beginPath();
      g.ellipse(cx - 5, HORIZON - 76, 40, 6, 0, 0, Math.PI * 2);
      g.fill();
      fillPoly(g, "#7d8f6a", [cx + 230, HORIZON - 22, cx + 275, HORIZON - 48, cx + 320, HORIZON - 22]); // small cone island
      g.fillStyle = "rgba(255,255,255,0.6)";            // a little steam
      g.beginPath();
      g.arc(cx - 10, HORIZON - 92, 10, 0, Math.PI * 2);
      g.arc(cx + 4, HORIZON - 102, 8, 0, Math.PI * 2);
      g.fill();
    }
  }),
};
// How much each backdrop shows right now (they fade into each other)
const bgWeight = { generic: 1, kalisungan: 0, makiling: 0, taal: 0 };

const skyGradient = ctx.createLinearGradient(0, 0, 0, HORIZON);
skyGradient.addColorStop(0, "#a9e3f2");
skyGradient.addColorStop(1, "#e6f8f6");

// ----- 6. Game state -----
let position, speed, playerLane, playerX, cameraX, bgOffset;
let cars, coins, pickups, popups, score, frame, paused = false, lastTime;

// Which screen we are on: "home", "countdown", "playing", "crash" or "over"
let mode = "home";

// Power-ups: shield is true/false, the others are timers in frames (60 = 1 second)
let shield, magnetT, slowT, invulnT, pickupTimer;
// Timers for the harder traffic events
let laneChangeTimer, paraCooldown;
// Effects: level/banner, screen shake, white flash, countdown, crash zoom
let level, bannerT, shake, flashT, countT, lastCount, goT, crashT, crashZoom;
// Close calls, money, floods
let clearT = 0;        // WALIS power-up: frames left with no traffic
let crossing = null;   // the pedestrian crossing ahead (or null)
let crossTimer = 900;  // frames until the next crossing
let crashText = "WASAK!";
let combo, comboT, kita, floods, floodTimer, inFlood, splashT, magnetMax, slowMax, firstPickup;
// Roadside scenery (see section 9d-2)
let odo, zones, scenery, sceneryQueue, nextLandmarkAt, nextFillerAt, landmarkSide = 1;

let best = loadBest();
let carChoice = loadCarChoice();     // color
let typeChoice = loadTypeChoice();   // which vehicle
let wallet = loadWallet();
let hariUnlocked = loadHari();
const isLocked = (pt) => !!pt.locked && !hariUnlocked;   // !! turns it into true/false
// The vehicle you drive (never a locked one)
const ptype = () => {
  const pt = PLAYER_TYPES[typeChoice];
  return pt && !isLocked(pt) ? pt : PLAYER_TYPES[0];
};
bestEl.textContent = best;
homeBestEl.textContent = best;

function resetGame() {
  position = 0;           // how far the camera has travelled
  speed = ptype().startSpeed || MIN_SPEED;
  playerLane = 1;
  playerX = LANE_POS[1];
  cameraX = playerX * 0.8;
  bgOffset = 0;
  score = 0;
  frame = 0;
  paused = false;

  shield = !!ptype().refillShield;
  combo = 0;
  comboT = 0;
  kita = 0;
  floods = [];
  floodTimer = 60;
  inFlood = false;
  splashT = 0;
  magnetMax = 1;
  slowMax = 1;
  firstPickup = true;     // the first power-up is always a shield (helps beginners)
  magnetT = 0;
  slowT = 0;
  clearT = 0;
  crossing = null;
  crossTimer = 900;      // first crossing after ~15 seconds
  crashText = "WASAK!";
  invulnT = 0;
  pickupTimer = 240;      // first power-up after ~4 seconds
  laneChangeTimer = 200;
  paraCooldown = 300;

  level = 0;
  bannerT = 0;
  shake = 0;
  flashT = 0;
  countT = 0;
  lastCount = 0;
  goT = 0;
  crashT = 0;
  crashZoom = 0;

  cars = [];
  coins = [];
  pickups = [];
  popups = [];
  for (let i = 0; i < 6; i++) addCar((30 + i * 28) * SEG_LEN);
  for (let i = 0; i < 3; i++) coins.push(placeOnLane({}, (40 + i * 60) * SEG_LEN));

  odo = 0;
  lastPlaced["-1"] = lastPlaced["1"] = -Infinity;
  zones = [{ from: -Infinity, level: 0 }];
  scenery = [];
  sceneryQueue = [...LOCATIONS[0].landmarks];
  nextLandmarkAt = 0;
  // some small things already beside the road at the start
  for (let d = 15; d < DRAW_DIST * 0.9; d += 30) {
    addScenery(pickOne(LOCATIONS[0].fillers), d * SEG_LEN, d % 60 < 30 ? -1 : 1);
  }
  nextFillerAt = DRAW_DIST * SEG_LEN;
  addWelcomeArch(30 * SEG_LEN, LOCATIONS[0].name);
  updateHud();
}

// ----- 7. Saving things in localStorage -----
function loadBest() {
  try { return Number(localStorage.getItem("highwayDashBest")) || 0; }
  catch { return 0; }
}
function saveBest(v) {
  try { localStorage.setItem("highwayDashBest", v); } catch { /* ignore */ }
}
function loadCarChoice() {
  try { return Number(localStorage.getItem("highwayDashCar")) || 0; }
  catch { return 0; }
}
function saveCarChoice(v) {
  try { localStorage.setItem("highwayDashCar", v); } catch { /* ignore */ }
}
function loadTypeChoice() {
  try { return Number(localStorage.getItem("highwayDashType")) || 0; }
  catch { return 0; }
}
function saveTypeChoice(v) {
  try { localStorage.setItem("highwayDashType", v); } catch { /* ignore */ }
}
// Pera (money): all the pesos you ever collected. Spend ₱500 to unlock Hari ng Daan.
function loadWallet() {
  try { return Number(localStorage.getItem("highwayDashWallet")) || 0; }
  catch { return 0; }
}
function saveWallet(v) {
  try { localStorage.setItem("highwayDashWallet", v); } catch { /* ignore */ }
}
function loadHari() {
  try { return localStorage.getItem("highwayDashHari") === "1"; }
  catch { return false; }
}
function saveHari() {
  try { localStorage.setItem("highwayDashHari", "1"); } catch { /* ignore */ }
}
function loadMuted() {
  try { return localStorage.getItem("highwayDashMuted") === "1"; }
  catch { return false; }
}
function saveMuted(v) {
  try { localStorage.setItem("highwayDashMuted", v ? "1" : "0"); } catch { /* ignore */ }
}

// ----- 8. Traffic, coins and power-ups on the road -----
const playerZ = () => (position + PLAYER_Z) % TRACK_LEN;

// The lanes a car is using (2 lanes while its turn signal is on)
const lanesOf = (c) => (c.nextLane >= 0 ? [c.lane, c.nextLane] : [c.lane]);

// How many lanes must stay free: 2 in the first place (easy), then 1
const openLanes = () => (level === 0 ? 2 : 1);

// Picks a lane at z that keeps lanes open (there must be a way through)
function pickLane(z, self) {
  const lanes = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
  const near = cars.filter((c) => c !== self && Math.abs(relZ(c.z, z)) < 22 * SEG_LEN);
  for (const lane of lanes) {
    if (near.some((c) => lanesOf(c).includes(lane))) continue;
    const used = new Set(near.flatMap(lanesOf));
    used.add(lane);
    if (used.size <= LANES - openLanes()) return lane;   // keep lanes open
  }
  return -1; // no safe lane here
}

// Gives a car all its starting values
function setCar(car, z, lane, type) {
  car.z = z;
  car.lane = lane;
  car.x = LANE_POS[lane];      // sideways position (moves smoothly when changing lanes)
  car.nextLane = -1;           // lane it wants to move to (-1 = none)
  car.signal = 0;              // frames left of blinking before it moves over
  car.brakeT = 0;              // frames left of braking ("PARA!")
  car.speed = TRAFFIC_SPEED;
  car.type = type;
  car.look = randomLook(type);
  return car;
}

// Puts a car at a distance ahead of the player
function placeCar(car, ahead) {
  // never put a vehicle between you and a pedestrian crossing
  if (crossing) ahead = Math.max(ahead, relZ(crossing.z, playerZ()) + 5 * SEG_LEN);
  for (let tries = 0; tries < 6; tries++) {
    const z = (playerZ() + ahead + tries * 15 * SEG_LEN) % TRACK_LEN;
    const lane = pickLane(z, car);
    if (lane >= 0) return setCar(car, z, lane, randomType());
  }
  const z = (playerZ() + ahead + 100 * SEG_LEN) % TRACK_LEN;
  return setCar(car, z, Math.floor(Math.random() * LANES), "car");
}

function addCar(ahead) {
  const car = { z: -TRACK_LEN, lane: 0, nextLane: -1 };
  cars.push(car);
  placeCar(car, ahead);
}

// Puts a coin or power-up in a random lane ahead of the player
function placeOnLane(obj, ahead) {
  obj.z = (playerZ() + ahead) % TRACK_LEN;
  obj.lane = Math.floor(Math.random() * LANES);
  obj.x = LANE_POS[obj.lane];
  return obj;
}

const farAhead = () => (DRAW_DIST * 0.75 + Math.random() * DRAW_DIST * 0.2) * SEG_LEN;

// ----- 9. Controls -----
const playing = () => mode === "playing" && !paused;
function moveLeft()  { if (playing() && playerLane > 0) playerLane--; }
function moveRight() { if (playing() && playerLane < LANES - 1) playerLane++; }

function togglePause() {
  if (mode === "playing") paused = !paused;
}

document.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "arrowleft" || k === "a") moveLeft();
  if (k === "arrowright" || k === "d") moveRight();
  if (k === "p") togglePause();
  if (k === "m") Sound.toggleMute();
  if ([" ", "arrowleft", "arrowright"].includes(k)) e.preventDefault(); // don't scroll the page
  if ((k === "enter" || k === " ") && (mode === "home" || mode === "over")) startGame();
  if (k === "escape" && mode === "over") goHome();
});
// pointerdown reacts the moment a finger touches (faster than "click" on phones)
document.getElementById("left-btn").addEventListener("pointerdown", (e) => { e.preventDefault(); moveLeft(); });
document.getElementById("right-btn").addEventListener("pointerdown", (e) => { e.preventDefault(); moveRight(); });

// Full screen button: makes the game fill the phone screen (and turns it sideways if allowed)
document.getElementById("full-btn").addEventListener("click", () => {
  if (!document.fullscreenElement) {
    const el = document.documentElement;
    (el.requestFullscreen || el.webkitRequestFullscreen || (() => Promise.reject())).call(el)
      .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock("landscape"))
      .catch(() => {});                           // some phones (like iPhones) don't allow it: that's ok
  } else {
    document.exitFullscreen();
  }
});
document.getElementById("pause-btn").addEventListener("click", togglePause);
muteBtn.addEventListener("click", () => Sound.toggleMute());

// Home screen buttons
document.getElementById("play-btn").addEventListener("click", startGame);
document.getElementById("again-btn").addEventListener("click", startGame);
document.getElementById("home-btn").addEventListener("click", goHome);
document.getElementById("howto-btn").addEventListener("click", () => {
  homeScreen.classList.add("hidden");
  howtoScreen.classList.remove("hidden");
});
document.getElementById("back-btn").addEventListener("click", () => {
  howtoScreen.classList.add("hidden");
  homeScreen.classList.remove("hidden");
});

// Car color picker: highlight the chosen swatch and remember it
const swatches = document.querySelectorAll(".swatch");
function showCarChoice() {
  swatches.forEach((sw) => sw.classList.toggle("selected", Number(sw.dataset.car) === carChoice));
}
swatches.forEach((sw) => sw.addEventListener("click", () => {
  carChoice = Number(sw.dataset.car);
  if (typeof showGarage === "function") showGarage();   // redraw the garage picture
  saveCarChoice(carChoice);
  showCarChoice();
}));
showCarChoice();

// Garage: choose your vehicle with ◀ ▶ (or the arrow keys on the home screen)
if (!PLAYER_TYPES[typeChoice]) typeChoice = 0;      // an old save might point to a removed car
const previewCanvas = document.getElementById("car-preview");
const g = previewCanvas.getContext("2d");          // "g" = the small garage picture

// ----- Side-view drawings for the garage picture (the car faces right) -----
// The picture is 280 x 140 pixels. The road is at y = 120.
const GROUND = 120;
const sv = {
  R(x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); },
  P(c, pts) {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
    g.fill();
  },
  C(x, y, r, c) { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); },
  // A wheel: tire, rim with spokes, hub
  wheel(x, r, rim = "#cbd5e1", spokes = 5) {
    const y = GROUND - r;
    sv.C(x, y, r, "#151515");
    sv.C(x, y, r * 0.62, rim);
    g.strokeStyle = "#64748b";
    g.lineWidth = 2;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * r * 0.58, y + Math.sin(a) * r * 0.58);
      g.stroke();
    }
    sv.C(x, y, r * 0.18, "#334155");
  },
  shadow(x1, x2) {
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.beginPath();
    g.ellipse((x1 + x2) / 2, GROUND + 1, (x2 - x1) / 2, 5, 0, 0, Math.PI * 2);
    g.fill();
  },
  glass(pts) {               // dark window + a white shine line
    sv.P("#1f2a33", pts);
    sv.P("rgba(255,255,255,0.35)", [pts[0] + 14, pts[1] - 2, pts[0] + 22, pts[1] - 2, pts[0] + 16, pts[3] + 2, pts[0] + 8, pts[3] + 2]);
  },
};

// Sports car: low wedge, big rear wing, side stripe and air intake
function sideSports(col) {
  sv.shadow(30, 260);
  sv.P(col.body, [24, 110, 24, 93, 46, 87, 110, 83, 140, 66, 184, 64, 212, 81, 250, 89, 258, 101, 254, 112, 24, 112]);
  sv.P(col.top, [46, 87, 110, 83, 140, 66, 184, 64, 186, 67, 142, 70, 112, 87, 48, 91]);   // light on top edges
  sv.glass([116, 83, 142, 69, 180, 67, 200, 82]);
  sv.R(160, 67, 3, 16, col.body);
  sv.R(34, 98, 216, 4, "rgba(255,255,255,0.85)");             // racing stripe
  sv.P("#111111", [112, 93, 136, 93, 132, 103, 116, 103]);    // side air intake
  sv.R(40, 108, 180, 4, col.dark);
  sv.R(20, 70, 46, 6, "#111111");                             // rear wing
  sv.R(36, 76, 5, 13, "#111111");
  sv.R(20, 92, 7, 6, "#ff3b30");                              // tail light
  sv.P("#fde68a", [248, 91, 258, 95, 258, 99, 248, 98]);      // headlight
  sv.wheel(72, 17);
  sv.wheel(208, 17);
}

// Electric car: smooth body, big glass roof, light strips, aero wheels
function sideElectric(col) {
  sv.shadow(30, 260);
  sv.P(col.body, [26, 112, 26, 94, 42, 86, 96, 82, 128, 62, 186, 60, 220, 79, 252, 87, 258, 99, 256, 112, 26, 112]);
  sv.P("#1e293b", [100, 82, 130, 65, 184, 63, 214, 80]);      // all-glass roof
  sv.P("rgba(255,255,255,0.3)", [150, 64, 160, 64, 148, 81, 138, 81]);
  sv.R(24, 93, 6, 4, "#ff2d55");                              // light strips
  sv.R(244, 88, 14, 3, "#e0f2fe");
  sv.R(34, 104, 214, 2, "#38bdf8");                           // blue accent line
  sv.R(118, 90, 14, 2, col.dark);                             // flush door handles
  sv.R(176, 90, 14, 2, col.dark);
  sv.R(56, 92, 8, 6, col.dark);                               // charging port
  sv.P("#e0f2fe", [92, 92, 86, 100, 91, 100, 88, 107, 95, 98, 90, 98]);   // ⚡
  sv.wheel(74, 16, "#94a3b8", 3);
  sv.wheel(210, 16, "#94a3b8", 3);
}

// Retro muscle car: long hood, fastback, white stripes, chrome, side pipes
function sideMuscle(col) {
  sv.shadow(24, 262);
  sv.P(col.body, [20, 112, 20, 90, 34, 85, 92, 83, 116, 66, 160, 64, 180, 82, 254, 85, 260, 97, 258, 112, 20, 112]);
  sv.P(col.dark, [20, 90, 34, 85, 34, 83, 16, 86]);           // ducktail
  sv.glass([118, 82, 136, 69, 158, 67, 172, 82]);
  sv.R(26, 95, 228, 3, "#ffffff");                            // twin stripes
  sv.R(26, 100, 228, 3, "#ffffff");
  sv.P("#111111", [196, 85, 222, 85, 218, 79, 200, 79]);      // hood scoop
  sv.R(14, 102, 10, 6, "#d7dde2");                            // chrome bumpers
  sv.R(256, 98, 10, 6, "#d7dde2");
  sv.R(84, 108, 76, 4, "#c0c6cc");                            // side exhaust pipe
  sv.R(18, 92, 6, 7, "#ff3b30");
  sv.C(254, 92, 4, "#fde68a");
  sv.wheel(70, 19);
  sv.wheel(214, 17);
}

// Jeepney: long colorful body, open windows with passengers, chrome hood
function sideJeepney() {
  const look = JEEP_COLORS[0];
  sv.shadow(16, 266);
  sv.R(20, 84, 186, 26, look.body);                           // passenger body
  sv.R(20, 90, 186, 5, look.band);
  sv.R(20, 100, 186, 3, look.stripe);
  g.fillStyle = "#ffffff";
  g.font = "900 8px 'Trebuchet MS', sans-serif";
  g.textAlign = "center";
  g.fillText("GOD BLESS OUR TRIP", 144, 109);
  sv.C(46, 96, 4, look.band);                                 // little sun
  sv.R(20, 50, 186, 34, "#3b2a1a");                           // open windows (dark inside)
  const shirts = ["#38bdf8", "#f472b6", "#4ade80", "#facc15", "#a78bfa", "#fb923c", "#f87171"];
  for (let i = 0; i < 7; i++) {                               // passengers
    const px = 36 + i * 24;
    sv.C(px, 64, 5, "#8d5a3b");
    sv.R(px - 7, 70, 14, 14, shirts[i]);
  }
  for (let i = 0; i <= 8; i++) sv.R(20 + i * 23, 50, 3, 34, "#d7dde2");   // chrome posts
  sv.R(16, 40, 194, 8, look.roof);                            // roof with bands
  sv.R(16, 48, 194, 3, look.band);
  sv.R(16, 38, 194, 2, look.stripe);
  sv.P("#bfe3f5", [206, 50, 222, 50, 226, 82, 206, 82]);      // windshield
  sv.P(look.roof, [206, 40, 222, 46, 222, 50, 206, 50]);
  sv.P("#c9d0d6", [206, 82, 262, 86, 264, 108, 206, 110]);    // chrome hood
  for (let i = 0; i < 4; i++) sv.R(214 + i * 11, 88, 6, 16, "#9aa3ab");
  sv.R(236, 76, 10, 8, "#c9d0d6");                            // hood ornament horse (simple)
  sv.R(244, 72, 4, 6, "#c9d0d6");
  sv.R(256, 54, 2, 30, "#d7dde2");                            // antenna with a flag
  sv.P("#d62828", [258, 54, 268, 58, 258, 62]);
  sv.R(10, 102, 12, 6, "#c9d0d6");                            // rear step
  sv.R(260, 100, 8, 6, "#c9d0d6");
  sv.wheel(64, 16);
  sv.wheel(224, 16);
}

// Hari ng Daan: premium e-trike with canopy, red leather seat, gold and neon
function sideHari() {
  const glow = g.createRadialGradient(140, GROUND, 0, 140, GROUND, 120);   // neon underglow
  glow.addColorStop(0, "rgba(34,211,238,0.6)");
  glow.addColorStop(1, "rgba(34,211,238,0)");
  g.fillStyle = glow;
  g.fillRect(20, GROUND - 25, 240, 30);
  sv.shadow(40, 240);
  sv.P("#141414", [36, 108, 46, 92, 168, 92, 208, 98, 232, 106, 232, 110, 36, 110]);   // chassis
  sv.R(46, 72, 120, 22, "#141414");                           // body
  sv.R(46, 72, 120, 2, "#facc15");
  sv.R(46, 92, 120, 2, "#facc15");
  sv.P("#facc15", [60, 86, 100, 80, 92, 86, 130, 82, 120, 90, 60, 90]);   // gold flames
  sv.R(46, 96, 186, 2, "#22d3ee");                            // neon strip
  sv.R(38, 78, 5, 9, "#ff2d55");                              // tail light
  g.fillStyle = "#facc15";                                    // "E-BIKE" label on the body
  g.font = "900 11px 'Trebuchet MS', sans-serif";
  g.textAlign = "center";
  g.fillText("E-BIKE", 150, 87);
  sv.R(78, 58, 46, 14, "#7f1d1d");                            // red leather seat
  sv.R(78, 40, 9, 30, "#7f1d1d");
  sv.R(80, 64, 42, 1, "#fca5a5");
  sv.R(46, 24, 5, 50, "#0a0a0a");                             // canopy posts
  sv.R(168, 26, 5, 48, "#0a0a0a");
  sv.R(47, 24, 2, 50, "#facc15");
  sv.P("#0a0a0a", [38, 20, 182, 20, 190, 28, 36, 28]);        // roof
  sv.R(36, 28, 154, 2, "#facc15");
  sv.P("#0a0a0a", [30, 18, 44, 18, 40, 24, 28, 24]);          // spoiler
  sv.P("#facc15", [104, 20, 106, 12, 110, 16, 114, 10, 118, 16, 122, 12, 124, 20]);   // crown
  sv.P("rgba(15,23,42,0.85)", [170, 28, 190, 28, 206, 70, 174, 70]);   // front glass
  sv.P("rgba(255,255,255,0.3)", [182, 32, 186, 32, 196, 64, 192, 64]);
  sv.R(204, 70, 5, 30, "#facc15");                            // front fork
  sv.R(196, 66, 18, 4, "#facc15");                            // handlebar
  const head = g.createRadialGradient(214, 76, 0, 214, 76, 20);   // headlight glow
  head.addColorStop(0, "rgba(253,230,138,0.9)");
  head.addColorStop(1, "rgba(253,230,138,0)");
  g.fillStyle = head;
  g.fillRect(194, 56, 40, 40);
  sv.C(212, 76, 4, "#fde68a");
  sv.wheel(72, 15, "#d4a017", 6);
  sv.wheel(210, 14, "#d4a017", 6);
}

// Draws the chosen vehicle's side view into the garage picture
function drawPreview(pt) {
  const pw = previewCanvas.width, ph = previewCanvas.height;
  g.clearRect(0, 0, pw, ph);
  const sky = g.createLinearGradient(0, 0, 0, ph);
  sky.addColorStop(0, "#1e293b");
  sky.addColorStop(1, "#334155");
  g.fillStyle = sky;
  g.fillRect(0, 0, pw, ph);
  g.fillStyle = "#475569";                           // the road
  g.fillRect(0, GROUND, pw, ph - GROUND);
  g.fillStyle = "#e2e8f0";
  for (let i = 0; i < 5; i++) g.fillRect(6 + i * 60, GROUND + 10, 30, 3);
  const col = PLAYER_COLORS[carChoice];
  if (pt.id === "electric") sideElectric(col);
  else if (pt.id === "muscle") sideMuscle(col);
  else if (pt.id === "jeepney") sideJeepney();
  else if (pt.id === "hari") sideHari();
  else sideSports(col);
}

function showGarage() {
  const pt = PLAYER_TYPES[typeChoice];
  const locked = isLocked(pt);
  const nameEl = document.getElementById("car-name");
  nameEl.textContent = (pt.id === "hari" ? "👑 " : "") + pt.name;
  if (pt.tag) {                                   // a small badge like "E-BIKE"
    const badge = document.createElement("span");
    badge.className = "tag";
    badge.textContent = pt.tag;
    nameEl.appendChild(badge);
  }
  document.getElementById("car-special").textContent = pt.special;
  const pct = (v, lo, hi) => Math.max(8, Math.min(100, ((v - lo) / (hi - lo)) * 100)) + "%";
  document.getElementById("stat-speed").style.width = pct(pt.maxSpeed, 180, 250);
  // Slim: the thinner the vehicle, the easier it squeezes past traffic
  document.getElementById("stat-slim").style.width = pct(680 - pt.w * pt.hit, 0, 680 - 330);
  document.getElementById("color-row").classList.toggle("hidden", !pt.colors);
  document.getElementById("lock-box").classList.toggle("hidden", !locked);
  document.getElementById("buy-btn").disabled = wallet < pt.price;
  document.getElementById("wallet").textContent = wallet;
  document.getElementById("play-btn").disabled = locked;
  previewCanvas.classList.toggle("locked", locked);
  drawPreview(pt);
}

function changeType(d) {
  typeChoice = (typeChoice + d + PLAYER_TYPES.length) % PLAYER_TYPES.length;
  saveTypeChoice(typeChoice);
  showGarage();
}

function unlockHari() {
  hariUnlocked = true;
  saveHari();
  showGarage();
}

// Buy Hari ng Daan with ₱500 from your Pera
document.getElementById("buy-btn").addEventListener("click", () => {
  if (wallet < 500) return;
  wallet -= 500;
  saveWallet(wallet);
  Sound.init();
  Sound.powerup();
  unlockHari();
});

document.getElementById("prev-car").addEventListener("click", () => changeType(-1));
document.getElementById("next-car").addEventListener("click", () => changeType(1));
document.addEventListener("keydown", (e) => {
  if (mode !== "home") return;
  if (e.key === "ArrowLeft") changeType(-1);
  if (e.key === "ArrowRight") changeType(1);
});


// Swipe controls for phones: swipe left or right on the game to change lanes
let touchX = null, touchY = null, touchTime = 0;
const stage = document.querySelector(".stage");
stage.addEventListener("touchstart", (e) => {
  touchX = e.touches[0].clientX;
  touchY = e.touches[0].clientY;
  touchTime = performance.now();
}, { passive: true });
stage.addEventListener("touchend", (e) => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  const dy = e.changedTouches[0].clientY - touchY;
  if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) {   // a sideways swipe
    if (dx < 0) moveLeft();
    else moveRight();
  } else if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && performance.now() - touchTime < 300 &&
             e.target === canvas) {
    // a quick tap on the game: left half = move left, right half = move right
    const box = canvas.getBoundingClientRect();
    if (touchX < box.left + box.width / 2) moveLeft();
    else moveRight();
  }
  touchX = null;
});

// ----- 9b. Autopilot (drives the car on the home screen) -----
// Looks at each lane and moves toward the one whose nearest car is furthest away
function autoSteer() {
  const pz = playerZ();
  const nearest = (lane) => {
    let d = Infinity;
    for (const c of cars) {
      const z = relZ(c.z, pz);
      if (c.lane === lane && z > -CAR_LEN * 1.5) d = Math.min(d, z);
    }
    if (crossing) {                               // people on the crossing count too
      const z = relZ(crossing.z, pz);
      for (const p of crossing.peds) if (z > -CAR_LEN && Math.abs(p.x - LANE_POS[lane]) < 0.3) d = Math.min(d, z);
    }
    return d;
  };
  let bestLane = playerLane;
  let bestDist = nearest(playerLane);
  for (let lane = 0; lane < LANES; lane++) {
    // the lanes we have to drive through on the way must also be clear
    let d = nearest(lane);
    const step = lane > playerLane ? 1 : -1;
    for (let k = playerLane + step; k !== lane && lane !== playerLane; k += step) {
      d = Math.min(d, nearest(k) * 3);
    }
    if (d > bestDist + 400) { bestDist = d; bestLane = lane; }
  }
  if (bestLane > playerLane) playerLane++;
  if (bestLane < playerLane) playerLane--;
}

// ----- 9c. SOUND (made with the Web Audio API, no sound files needed) -----
// An oscillator makes a tone (like a tuning fork). A gain node is a volume knob.
// A filter removes high or low sounds. "Noise" is random hiss (crashes, rain).
const Sound = {
  ac: null,               // the AudioContext (created on the first click)
  master: null,           // main volume knob
  muted: loadMuted(),

  init() {
    if (this.ac) {
      if (this.ac.state === "suspended") this.ac.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;      // very old browser: just play without sound
    this.ac = new AC();
    this.master = this.ac.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ac.destination);

    // Engine: two buzzy tones through a low-pass filter (makes it a hum)
    const filter = this.ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 500;
    const gain = this.ac.createGain();
    gain.gain.value = 0;
    const o1 = this.ac.createOscillator();
    const o2 = this.ac.createOscillator();
    o1.type = "sawtooth";
    o2.type = "square";
    o1.connect(filter);
    o2.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    o1.start();
    o2.start();
    this.engine = { o1, o2, filter, gain };

    // One second of random noise we can reuse
    const len = this.ac.sampleRate;
    this.noiseBuf = this.ac.createBuffer(1, len, this.ac.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Rain: noise that loops forever, volume follows how hard it rains
    const rain = this.ac.createBufferSource();
    rain.buffer = this.noiseBuf;
    rain.loop = true;
    const rainFilter = this.ac.createBiquadFilter();
    rainFilter.type = "highpass";
    rainFilter.frequency.value = 1500;
    this.rainGain = this.ac.createGain();
    this.rainGain.gain.value = 0;
    rain.connect(rainFilter);
    rainFilter.connect(this.rainGain);
    this.rainGain.connect(this.master);
    rain.start();
  },

  // Called every frame: engine pitch goes up with speed
  updateEngine(spd, on, slow) {
    if (!this.ac) return;
    const t = this.ac.currentTime;
    const f = (40 + spd * 0.45) * (slow ? 0.7 : 1);
    this.engine.o1.frequency.setTargetAtTime(f, t, 0.1);
    this.engine.o2.frequency.setTargetAtTime(f * 1.5, t, 0.1);
    this.engine.filter.frequency.setTargetAtTime(300 + spd * 4, t, 0.1);
    this.engine.gain.gain.setTargetAtTime(on ? 0.07 : 0, t, 0.15);
  },

  updateRain(amount, on) {
    if (!this.ac) return;
    this.rainGain.gain.setTargetAtTime(on ? amount * 0.06 : 0, this.ac.currentTime, 0.3);
  },

  // Plays one short tone. endFreq makes it slide (like a "pew")
  tone(freq, dur, type = "square", vol = 0.15, endFreq = null, delay = 0) {
    if (!this.ac) return;
    const t = this.ac.currentTime + delay;
    const o = this.ac.createOscillator();
    const g = this.ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);   // fade out
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  },

  // Plays a short burst of filtered noise
  noise(dur, vol, freq, type = "lowpass", delay = 0) {
    if (!this.ac) return;
    const t = this.ac.currentTime + delay;
    const src = this.ac.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  },

  coin()   { this.tone(988, 0.08, "square", 0.08); this.tone(1319, 0.22, "square", 0.08, null, 0.07); },
  crash()  { this.noise(0.9, 0.7, 900); this.tone(140, 0.7, "sawtooth", 0.3, 35); },
  horn()   {  // "beep-beep" from a jeepney
    for (const d of [0, 0.2]) {
      this.tone(415, 0.14, "square", 0.06, null, d);
      this.tone(523, 0.14, "square", 0.05, null, d);
    }
  },
  powerup() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.14, "triangle", 0.18, null, i * 0.06)); },
  shieldBreak() { this.noise(0.3, 0.3, 3000, "highpass"); this.tone(700, 0.35, "triangle", 0.2, 150); },
  brake()  { this.noise(0.7, 0.1, 3500, "bandpass"); },
  beep(go) { this.tone(go ? 880 : 440, go ? 0.45 : 0.2, "sine", 0.3); },
  levelUp() { [659, 784, 988, 1319].forEach((f, i) => this.tone(f, 0.16, "square", 0.06, null, i * 0.09)); },

  nearMiss() { this.noise(0.25, 0.25, 2000, "bandpass"); this.tone(600, 0.18, "triangle", 0.1, 1200); },
  warning() { this.tone(988, 0.12, "square", 0.1); this.tone(988, 0.12, "square", 0.1, null, 0.2); },
  splash() { this.noise(0.6, 0.35, 700); this.noise(0.35, 0.15, 3000, "highpass", 0.05); },

  toggleMute() {
    this.muted = !this.muted;
    saveMuted(this.muted);
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    muteBtn.textContent = this.muted ? "🔇" : "🔊";
  },
};
muteBtn.textContent = Sound.muted ? "🔇" : "🔊";

// ----- 9d. LOCATIONS, WEATHER and TIME OF DAY -----
// Every LEVEL_SCORE points you reach the next place. Each place has its own
// time of day and weather. After Manila it starts again from Calauan (lap 2).
const LOCATION_DIST = 250000;              // road distance from one place to the next
const UNITS_PER_KM = LOCATION_DIST / 2.5;  // so each place is 2.5 km apart
// landmarks = places you pass, in this order. fillers = smaller things in between.
// bg = which mountain is in the background. Places without fillers just have trees.
const LOCATIONS = [
  { name: "Calauan", time: "day", rain: false, bg: "kalisungan", note: "Pineapple country! Next stop: PUP Calauan",
    landmarks: ["pineapple", "farm", "burger", "chicken", "church", "pup"],
    fillers: ["kubo", "pinefield", "pinefield", "taho", "sorbetes"] },
  { name: "Bay", time: "day", rain: false, bg: "makiling", note: "Halaman at monay! Food trip in Bay",
    landmarks: ["garden", "bakery", "burger", "chicken", "garden", "church", "bucket", "hospital", "bakery"],
    fillers: ["house", "store", "fishball", "taho"] },
  { name: "Los Baños", time: "day", rain: true, bg: "makiling", floods: true, note: "Rainy season! Baha sa daan!",
    landmarks: ["cafe", "mall", "school", "cafe", "mall", "school"],
    fillers: ["cafe", "house", "store", "fishball", "sorbetes"] },
  { name: "Calamba", time: "day", rain: false, bg: "makiling", note: "Rizal Shrine and resorts! Swimming time",
    landmarks: ["rizal", "slides", "pool", "slides", "pool"],
    fillers: ["palm", "palm", "pool", "sorbetes"], palms: true },
  { name: "SLEX",      time: "night",  rain: false, note: "Night drive. Watch the tail lights" },
  { name: "Tagaytay",  time: "sunset", rain: false, bg: "taal", note: "Taal Volcano at sunset" },
  { name: "Manila",    time: "night",  rain: true,  note: "Stormy night!" },
];
const currentLocation = () => LOCATIONS[level % LOCATIONS.length];

// How much night / sunset / rain there is right now (0 = none, 1 = full).
// These slowly move toward the current location's values (smooth changes).
const atmo = { night: 0, sunset: 0, rain: 0 };

function updateAtmosphere(dt) {
  const loc = mode === "home" ? LOCATIONS[0] : currentLocation();
  const target = {
    night: loc.time === "night" ? 1 : 0,
    sunset: loc.time === "sunset" ? 1 : 0,
    rain: loc.rain ? 1 : 0,
  };
  for (const key in atmo) atmo[key] += (target[key] - atmo[key]) * Math.min(1, 0.012 * dt);
}

function updateLevel() {
  const newLevel = Math.floor(odo / LOCATION_DIST);   // based on distance driven
  if (newLevel > level) {
    level = newLevel;
    bannerT = 210;        // show "Now entering ..." for 3.5 seconds
    Sound.levelUp();
    if (currentLocation().name === "Tagaytay" && !hariUnlocked) {   // the secret unlock
      unlockHari();
      popup("UNLOCKED: HARI NG DAAN!", "#facc15");
    }
    if (ptype().refillShield && !shield) {             // jeepney / Hari special
      shield = true;
      popup("SHIELD!", POWERS.shield.color);
    }
    // The new place starts far ahead (at the horizon), so nothing near you pops
    const start = odo + DRAW_DIST * 0.9 * SEG_LEN;
    zones.push({ from: start, level });
    addWelcomeArch(start + 1500, currentLocation().name);
    sceneryQueue = [...(currentLocation().landmarks || [])];
    nextLandmarkAt = start + 3000;
    nextFillerAt = start;
  }
}

// ----- 9d-2. ROADSIDE SCENERY -----
// odo = total distance driven (never wraps around like "position" does).
// zones = where each location starts on the road.
const LANDMARK_GAP = 22000;     // distance between two landmarks

// The big "WELCOME TO ..." arch over the road (x: 0 = the middle of the road)
function addWelcomeArch(at, name) {
  scenery.push({ kind: "welcome", at, end: at, side: 0, z: at % TRACK_LEN, x: 0, scale: 1,
    variant: 0, name: name.toUpperCase() });
}

function locationAt(dist) {
  let lvl = 0;
  for (const zn of zones) if (zn.from <= dist) lvl = zn.level;
  return LOCATIONS[lvl % LOCATIONS.length];
}

// Where the last building on each side ENDS (its back wall), so the next one
// on that side starts after it with a gap and they never overlap.
const lastPlaced = { "-1": -Infinity, "1": -Infinity };
const sideFree = (side, at, gap) => at - lastPlaced[side] > gap;
const SCENERY_GAP = 3500;      // empty road between two buildings on the same side

// Puts a landmark beside the road. side: -1 = left, 1 = right
function addScenery(kind, at, side, isLandmark = false) {
  const lm = LANDMARKS[kind];
  // landmarks are drawn bigger so you can't miss them (PUP the biggest)
  const scale = kind === "pup" ? 1.6 : isLandmark ? 1.35 : 1;
  const depth = lm.w * 0.6 * scale;     // how far back the building goes
  lastPlaced[side] = at + depth;
  // keep it off the road: road edge (1.2) + half its width + a gap
  const offset = side * (1.2 + (lm.w * scale) / 2 / ROAD_W + 0.08);
  scenery.push({ kind, at, end: at + depth, side, z: at % TRACK_LEN, x: offset, scale, variant: Math.random() });
}

function updateScenery() {
  const spawnAt = odo + DRAW_DIST * 0.95 * SEG_LEN;   // new things appear near the horizon
  const loc = locationAt(spawnAt);
  if (sceneryQueue.length === 0 && mode === "home") sceneryQueue = [...(loc.landmarks || [])];

  if (sceneryQueue.length && spawnAt >= nextLandmarkAt) {
    let side = -landmarkSide;                          // left, right, left...
    if (!sideFree(side, spawnAt, SCENERY_GAP)) side = -side;
    if (sideFree(side, spawnAt, SCENERY_GAP)) {
      landmarkSide = side;
      addScenery(sceneryQueue.shift(), spawnAt, side, true);
      nextLandmarkAt = spawnAt + LANDMARK_GAP;
      nextFillerAt = spawnAt + LANDMARK_GAP / 2;
    } else {
      nextLandmarkAt = spawnAt + 1500;                 // both sides busy: try again a bit later
    }
  } else if (loc.fillers && spawnAt >= nextFillerAt) {
    // a filler goes on a side that has room; if neither has room, wait a bit
    let side = Math.random() < 0.5 ? -1 : 1;
    if (!sideFree(side, spawnAt, SCENERY_GAP)) side = -side;
    if (sideFree(side, spawnAt, SCENERY_GAP)) {
      addScenery(pickOne(loc.fillers), spawnAt, side);
      nextFillerAt = spawnAt + 5000 + Math.random() * 5000;
    } else {
      nextFillerAt = spawnAt + 3000;
    }
  }
  scenery = scenery.filter((sc) => sc.at > odo - 2 * SEG_LEN);   // remove what's behind us
}

// Rain drops and stars (made once, reused every frame)
const drops = Array.from({ length: 180 }, () => ({
  x: Math.random() * (W + 200),
  y: Math.random() * H,
  len: 14 + Math.random() * 16,
  spd: 14 + Math.random() * 8,
}));
const stars = Array.from({ length: 70 }, () => ({
  x: Math.random() * W,
  y: Math.random() * HORIZON * 0.85,
  r: 0.8 + Math.random() * 1.6,
  tw: Math.random() * 6,     // twinkle offset
}));

// ----- 9e. POWER-UPS and TRAFFIC EVENTS -----
const POWERS = {
  shield: { color: "#38bdf8", label: "SHIELD" },   // survive one crash
  magnet: { color: "#ef4444", label: "MAGNET" },   // pulls coins to you
  slowmo: { color: "#a855f7", label: "SLOW-MO" },  // traffic moves at half speed
  walis:  { color: "#22c55e", label: "WALIS" },    // sweeps ALL vehicles off the road for 2 seconds
};
const MAGNET_TIME = 480;   // 8 seconds
const SLOW_TIME = 300;     // 5 seconds
const WALIS_TIME = 120;    // 2 seconds

function spawnPickups(dt) {
  pickupTimer -= dt;
  if (pickupTimer <= 0 && pickups.length === 0) {
    const kind = firstPickup ? "shield" : pickOne(Object.keys(POWERS));
    firstPickup = false;
    pickups.push(placeOnLane({ kind }, farAhead()));
    pickupTimer = 600 + Math.random() * 420;   // next one in 10–17 seconds
  }
}

function collectPowerUp(kind) {
  Sound.powerup();
  popup(POWERS[kind].label + "!", POWERS[kind].color);
  if (kind === "shield") shield = true;
  const mult = ptype().powerMult || 1;
  if (kind === "magnet") magnetT = magnetMax = MAGNET_TIME * mult;
  if (kind === "slowmo") slowT = slowMax = SLOW_TIME * mult;
  if (kind === "walis") {
    clearT = WALIS_TIME;         // the road is empty for 2 seconds
    flashT = 8;                  // white "poof!"
    Sound.shieldBreak();
  }
}

// The shield takes the hit instead of you
function useShield(car) {
  shield = false;
  invulnT = 90;            // 1.5 seconds where you can't crash
  shake = 12;
  Sound.shieldBreak();
  popup("LIGTAS!", "#38bdf8");
  placeCar(car, farAhead());   // the vehicle you hit is knocked away
}

// CLOSE CALL: you got out of a vehicle's lane just before reaching it
function nearMiss() {
  combo = comboT > 0 ? combo + 1 : 1;
  comboT = 180;                                   // 3 seconds to get the next one
  const pts = Math.round(25 * Math.min(combo, 10) * (ptype().nearMult || 1));   // max x10
  score += pts;
  Sound.nearMiss();
  if (combo >= 5) popup(`MUNTIK NA! x${combo}`, "#f472b6");   // "that was close!"
  else if (combo >= 3) popup(`ASTIG! x${combo}`, "#facc15");   // "cool!"
  else popup(`GALING! +${pts}`, "#4ade80");
}

// FLOODS (Los Baños): water across 1–2 lanes. Driving through makes you slide.
function updateFloods(dt) {
  const spawnAt = odo + DRAW_DIST * 0.95 * SEG_LEN;
  if (locationAt(spawnAt).floods) {
    floodTimer -= dt;
    if (floodTimer <= 0) {
      const l0 = Math.floor(Math.random() * (LANES - 1));
      const l1 = Math.random() < 0.5 ? l0 : l0 + 1;
      floods.push({ at: spawnAt, z: spawnAt % TRACK_LEN, segs: 6 + Math.floor(Math.random() * 5), l0, l1,
        seed: Math.random() * 10 });              // seed = makes each puddle's edge different
      floodTimer = 180 + Math.random() * 200;
    }
  }
  floods = floods.filter((f) => f.at + f.segs * SEG_LEN > odo);
  const pz = odo + PLAYER_Z;                      // where the player is on the road
  const wasIn = inFlood;
  inFlood = floods.some((f) => {                  // inside the rounded puddle?
    const t = (pz - f.at) / (f.segs * SEG_LEN);
    return t >= 0 && t <= 1 && Math.abs(playerX - floodCenter(f)) < floodHalfWidth(f, t, 0);
  });
  if (inFlood && !wasIn) {
    splashT = 45;
    Sound.splash();
    popup("BAHA!", "#38bdf8");
  }
}

// Floating text above your car ("+50", "MAGNET!", ...)
function popup(text, color) {
  popups.push({ text, color, t: 0 });
}

// LANE CHANGES: now and then a vehicle far ahead turns on its signal light,
// waits a bit, then moves over. Only if it still leaves a lane open.
function maybeChangeLane(dt) {
  if (clearT > 0) return;          // no traffic right now
  laneChangeTimer -= dt;
  if (laneChangeTimer > 0) return;
  laneChangeTimer = Math.max(90, 300 - level * 40) + Math.random() * 120; // more often at higher levels

  const pz = playerZ();
  // Only vehicles far enough ahead that you see the whole signal + move
  // (signal 120 frames + move ~100 frames, at the speed you catch up with them)
  const minDist = Math.min(DRAW_DIST * 0.8 * SEG_LEN, Math.max(60 * SEG_LEN, (speed - TRAFFIC_SPEED) * 230));
  const candidates = cars.filter((c) => {
    const d = relZ(c.z, pz);
    return d > minDist && d < DRAW_DIST * 0.95 * SEG_LEN && c.nextLane < 0 && c.brakeT <= 0;
  });
  for (const car of candidates.sort(() => Math.random() - 0.5)) {
    for (const dir of [-1, 1].sort(() => Math.random() - 0.5)) {
      const nl = car.lane + dir;
      if (nl < 0 || nl >= LANES) continue;
      const others = cars.filter((c) => c !== car);
      // the new lane must be empty around this car
      const blocked = others.some((c) => lanesOf(c).includes(nl) && Math.abs(relZ(c.z, car.z)) < 10 * SEG_LEN);
      if (blocked) continue;
      // and there must still be an open lane nearby
      const used = new Set(others.filter((c) => Math.abs(relZ(c.z, car.z)) < 22 * SEG_LEN).flatMap(lanesOf));
      used.add(car.lane);
      used.add(nl);
      if (used.size > LANES - openLanes()) continue;
      car.nextLane = nl;
      car.signal = 120;    // blink for 2 seconds first
      return;
    }
  }
}

function updateLaneChange(car, dt) {
  if (car.signal > 0) {
    car.signal -= dt;
    if (car.signal <= 0) {        // signal done: now actually move over
      car.lane = car.nextLane;
      car.nextLane = -1;
    }
  }
  car.x += (LANE_POS[car.lane] - car.x) * Math.min(1, 0.018 * dt);   // slow, smooth move
}

// "PARA PO!": a jeepney ahead in YOUR lane suddenly stops for a passenger
function maybePara(dt) {
  if (clearT > 0) return;
  paraCooldown -= dt;
  if (paraCooldown > 0) return;
  const pz = playerZ();
  const jeep = cars.find((c) => {
    const d = relZ(c.z, pz);
    return c.type === "jeepney" && c.lane === playerLane && c.nextLane < 0 &&
      d > 35 * SEG_LEN && d < 80 * SEG_LEN && c.brakeT <= 0;
  });
  if (!jeep) {
    paraCooldown = 30;            // none found: look again in half a second
    return;
  }
  jeep.brakeT = 240;              // stopped for 4 seconds
  Sound.brake();
  paraCooldown = Math.max(300, 720 - level * 60) + Math.random() * 300;
}

// Traffic speed: braking jeepneys slow down, and cars behind a slower
// vehicle in the same lane slow down too (so they don't drive through it)
function updateTrafficSpeeds(dt) {
  for (const car of cars) {
    let want = TRAFFIC_SPEED;
    if (car.brakeT > 0) {
      car.brakeT -= dt;
      want = 4;
    }
    for (const other of cars) {
      if (other === car || other.lane !== car.lane) continue;
      const gap = relZ(other.z, car.z);
      if (gap > 0 && gap < 10 * SEG_LEN) want = Math.min(want, other.speed);
    }
    car.speed += (want - car.speed) * Math.min(1, 0.08 * dt);
  }
}

function updateHud() {
  scoreEl.textContent = score;
  speedEl.textContent = Math.round(speed);
  kitaEl.textContent = kita;
}

// PEDESTRIAN CROSSING (tawiran): zebra lines across the road with people
// walking over. A caution sign and an on-screen warning come first.
// To keep it fair, no traffic is allowed between you and the crossing,
// so the only thing to dodge is the people.
const PED_W = 260;                 // a person's width (world units)

function spawnCrossing() {
  const at = odo + DRAW_DIST * 0.95 * SEG_LEN;
  const peds = [];
  const count = 2 + Math.floor(Math.random() * 2);            // 2 or 3 people
  for (let i = 0; i < count; i++) {
    const dir = Math.random() < 0.5 ? 1 : -1;                 // walking right or left
    peds.push({
      x: -dir * 1.35,                                         // start beside the road
      dir,
      speed: 0.005 + Math.random() * 0.002,                   // slow walk across
      delay: i * 70 + Math.random() * 60,                     // they don't all start together
      look: pickOne(PED_LOOKS),
      step: Math.random() * 10,
    });
  }
  crossing = { at, z: at % TRACK_LEN, peds, warned: false };
  // the caution sign stands well before the crossing, on the right side
  scenery.push({ kind: "caution", at: at - 6500, end: at - 6500, side: 1, z: (at - 6500) % TRACK_LEN,
    x: 1.32, scale: 1, variant: 0 });
  // clear the road between you and the crossing
  const pz = playerZ();
  for (const car of cars) {
    if (relZ(car.z, crossing.z) < 4 * SEG_LEN) placeCar(car, farAhead());
  }
  Sound.warning();
}

function updateCrossing(dt, wdt, prevPz, pz) {
  crossTimer -= dt;
  if (!crossing && crossTimer <= 0) {
    if (locationAt(odo + DRAW_DIST * 0.95 * SEG_LEN).fillers) spawnCrossing();   // only in towns
    crossTimer = 1500 + Math.random() * 700;                  // next one in 25–37 seconds
  }
  if (!crossing) return;

  for (const p of crossing.peds) {                            // people walk across
    if (p.delay > 0) { p.delay -= wdt; continue; }
    if (Math.abs(p.x) < 1.38 || Math.sign(p.x) !== p.dir) {
      p.x += p.dir * p.speed * wdt;
      p.step += wdt;
    }
  }

  // Did we reach the crossing line while a person is in our way?
  const before = relZ(crossing.z, prevPz);
  const now = relZ(crossing.z, pz);
  if (before >= -CAR_LEN * 0.5 && now < CAR_LEN && invulnT <= 0) {
    const pt = ptype();
    const touch = ((PED_W + pt.w * pt.hit) / 2 / ROAD_W) * 0.85;
    const hit = crossing.peds.find((p) => Math.abs(p.x) < 1.2 && Math.abs(p.x - playerX) < touch);
    if (hit) {
      if (shield) {
        shield = false;
        invulnT = 90;
        Sound.shieldBreak();
        popup("LIGTAS!", "#38bdf8");
      } else {
        startCrash("HINTO!");      // "STOP!": you must give way at a crossing
        return;
      }
    }
  }
  if (now < -PLAYER_Z - 2 * SEG_LEN) crossing = null;        // passed it
}

// Different people: shirt, pants, skin, hair, and some carry things
const PED_LOOKS = [
  { shirt: "#f8fafc", pants: "#1e3a8a", skin: "#c68642", hair: "#1f1f1f", bag: "#dc2626" },   // student
  { shirt: "#f472b6", pants: "#334155", skin: "#e0ac69", hair: "#3b2a1a", bag: null },
  { shirt: "#facc15", pants: "#78350f", skin: "#8d5524", hair: "#111111", bag: null },
  { shirt: "#22c55e", pants: "#1f2937", skin: "#c68642", hair: "#2b1d12", bag: "#1d4ed8" },
  { shirt: "#60a5fa", pants: "#0f172a", skin: "#e0ac69", hair: "#6b4f2a", bag: null },
];

// ----- 10. UPDATE: move everything and apply the rules -----
// demo = true on the home screen: the car drives itself, no crashes, no score
function update(dt, demo = false) {
  frame += dt;

  // Slow-mo: the world moves at half speed (you still steer at full speed)
  const wdt = slowT > 0 ? dt * 0.5 : dt;

  if (demo) {
    speed = DEMO_SPEED;
    if (Math.floor(frame) % 8 === 0) autoSteer();
  } else {
    speed = Math.min(speed + 0.02 * wdt, ptype().maxSpeed);
  }

  const prevPz = playerZ();         // where we were at the start of this frame
  position = (position + speed * wdt) % TRACK_LEN;
  odo += speed * wdt;
  const pz = playerZ();
  updateScenery();
  if (!demo) {
    updateCrossing(dt, wdt, prevPz, pz);
    if (mode === "crash") return;               // ran into the crossing
  }

  if (!demo) updateFloods(dt);

  // Slide toward the chosen lane. Rain and floods = less grip = slidier steering
  let grip = PLAYER_GRIP * (1 - 0.55 * atmo.rain);
  if (inFlood) {
    grip *= 0.35;
    speed = Math.max(MIN_SPEED, speed - 0.15 * dt);   // water slows you a little
  }
  playerX += (LANE_POS[playerLane] - playerX) * Math.min(1, grip * dt);
  cameraX += (playerX * 0.8 - cameraX) * Math.min(1, 0.08 * dt);

  // On a curve, slide the background so the world seems to turn
  bgOffset += findSegment(pz).curve * (speed * wdt / SEG_LEN) * 2;

  if (!demo) {
    updateLevel();
    magnetT = Math.max(0, magnetT - dt);
    slowT = Math.max(0, slowT - dt);
    invulnT = Math.max(0, invulnT - dt);
    spawnPickups(dt);
    comboT = Math.max(0, comboT - dt);
    if (comboT === 0) combo = 0;
    // Traffic gets tricky later: PARA stops from Bay, lane changes from Los Baños
    if (level >= 1) maybePara(dt);
    if (level >= 2) maybeChangeLane(dt);
  }

  // More traffic in each new place (6 at the start, max 14)
  if (cars.length < Math.min(14, 6 + level * 2) && clearT <= 0) addCar(farAhead());

  // WALIS: while it lasts, traffic is gone. When it ends, traffic comes back far away.
  if (clearT > 0) {
    clearT = Math.max(0, clearT - dt);
    if (clearT === 0) for (const car of cars) placeCar(car, farAhead());
  }
  updateTrafficSpeeds(wdt);

  for (const car of cars) {
    if (clearT > 0) break;                     // swept away by WALIS
    const before = relZ(car.z, prevPz);        // distance ahead of us last frame
    car.z = (car.z + car.speed * wdt) % TRACK_LEN;
    const now = relZ(car.z, pz);
    updateLaneChange(car, wdt);

    // How close sideways counts as touching: half of both widths added up
    // (x0.85 so a near miss doesn't count)
    const v = VEHICLES[car.type];
    const pt = ptype();
    const touchSide = ((v.w + pt.w * pt.hit) / 2 / ROAD_W) * 0.85;
    const sameSide = Math.abs(car.x - playerX) < touchSide;
    if (Math.abs(car.x - playerX) < touchSide + 0.06 && now > 0) car.danger = frame;  // it's in my way

    // Crash: the vehicle is (or just went) right where we are
    // (only while it's still on screen: once its back is behind you, it's gone)
    if (sameSide && before >= -CAR_LEN * 0.5 && now < CAR_LEN && !demo && invulnT <= 0) {
      if (shield) {
        useShield(car);
        continue;
      }
      startCrash();
      return;
    }
    if (before >= 0 && now < 0 && !demo) {
      score += 10;                                  // +10 per vehicle passed
      if (car.type === "jeepney") Sound.horn();     // jeepneys honk as you pass
      if (car.danger && frame - car.danger < 50) nearMiss();   // dodged at the last moment
    }
    if (now < -PLAYER_Z - 2 * SEG_LEN) placeCar(car, farAhead()); // reuse it ahead
  }

  // Coins (they stand still). The magnet pulls coins ahead of you into your lane
  for (const coin of coins) {
    const before = relZ(coin.z, pz);
    const now = before - speed * wdt;
    if (magnetT > 0 && before > 0 && before < 30 * SEG_LEN) {
      coin.x += (playerX - coin.x) * Math.min(1, 0.15 * dt);
    }
    const sameSide = Math.abs(coin.x - playerX) < 0.2;
    if (sameSide && before >= -CAR_LEN / 2 && now < CAR_LEN) {
      if (!demo) {
        score += 50;                                // +50 points per coin
        const pesos = Math.round(5 * (ptype().coinMult || 1));
        kita += pesos;                              // and some pesos
        Sound.coin();
        popup(`AYOS! +₱${pesos}`, "#ffd23f");
      }
      placeOnLane(coin, farAhead());
    } else if (now < -PLAYER_Z) {
      placeOnLane(coin, farAhead());
    }
  }

  // Power-ups on the road
  for (const p of pickups) {
    const before = relZ(p.z, pz);
    const now = before - speed * wdt;
    if (Math.abs(p.x - playerX) < 0.25 && before >= -CAR_LEN / 2 && now < CAR_LEN) {
      collectPowerUp(p.kind);
      p.done = true;
    } else if (now < -PLAYER_Z) {
      p.done = true;                                // missed it
    }
  }
  pickups = pickups.filter((p) => !p.done);

  if (!demo) updateHud();
}

// Countdown before each run: 3, 2, 1, GO!
function updateCountdown(dt) {
  frame += dt;
  countT += dt;
  const n = 3 - Math.floor(countT / 50);    // each number shows for 50 frames
  if (n !== lastCount && n >= 1) {
    lastCount = n;
    Sound.beep(false);
  }
  if (countT >= 150) {
    mode = "playing";
    goT = 50;                                 // show "GO!" for a moment
    bannerT = 210;                            // "Now entering Calauan"
    Sound.beep(true);
  }
}

// Crash: freeze, zoom in a little, show "WASAK!", then Game Over
function startCrash(text = "WASAK!") {
  crashText = text;
  mode = "crash";
  crashT = 0;
  shake = 28;
  flashT = 10;
  Sound.crash();
}

function updateCrash(dt) {
  crashT += dt;
  const t = Math.min(1, crashT / 35);
  crashZoom = 0.2 * (1 - (1 - t) * (1 - t));   // ease out: fast then slow
  if (crashT >= 120) gameOver();
}

// Things that keep moving on every screen (unless paused)
function updateEffects(dt) {
  updateAtmosphere(dt);
  if (atmo.rain > 0.01) {
    for (const d of drops) {
      d.y += d.spd * dt;
      d.x -= d.spd * 0.25 * dt;           // slanted rain
      if (d.y > H) {
        d.y = -d.len;
        d.x = Math.random() * (W + 200);
      }
    }
  }
  shake *= Math.pow(0.88, dt);
  flashT = Math.max(0, flashT - dt);
  splashT = Math.max(0, splashT - dt);
  const bgTarget = (mode === "home" ? LOCATIONS[0] : currentLocation()).bg || "generic";
  for (const key in bgWeight) bgWeight[key] += ((key === bgTarget ? 1 : 0) - bgWeight[key]) * Math.min(1, 0.02 * dt);
  bannerT = Math.max(0, bannerT - dt);
  goT = Math.max(0, goT - dt);
  for (const p of popups) p.t += dt;
  popups = popups.filter((p) => p.t < 60);
}

// ----- 11. Projection: world position → screen position -----
function project(z, camX, camZ, out) {
  out.cz = z - camZ;                           // distance from the camera
  out.scale = CAM_DEPTH / out.cz;              // far = small, near = big
  out.x = W / 2 - out.scale * camX * W / 2;
  out.y = HORIZON + out.scale * CAM_H * H / 2;
  out.w = out.scale * ROAD_W * W / 2;          // half the road width on screen
}

// Blend a color toward the fog color (far things fade into the haze)
function fogged(c, f) {
  const r = Math.round(c[0] + (COL.fog[0] - c[0]) * f);
  const g = Math.round(c[1] + (COL.fog[1] - c[1]) * f);
  const b = Math.round(c[2] + (COL.fog[2] - c[2]) * f);
  return `rgb(${r},${g},${b})`;
}

function poly(color, pts) { fillPoly(ctx, color, pts); }

// ----- 12. Draw one road segment (a trapezoid between two lines) -----
function drawSegment(seg, fog) {
  const { x: x1, y: y1, w: w1 } = seg.s1;
  const { x: x2, y: y2, w: w2 } = seg.s2;
  const light = Math.floor(seg.index / RUMBLE_LEN) % 2 === 0;
  const r1 = w1 / 7, r2 = w2 / 7;              // red/white stripe width

  ctx.fillStyle = fogged(light ? COL.grass1 : COL.grass2, fog);
  ctx.fillRect(0, y2, W, y1 - y2 + 1);

  poly(fogged(light ? COL.rumble1 : COL.rumble2, fog),
    [x1 - w1 - r1, y1 + 1, x1 - w1, y1 + 1, x2 - w2, y2, x2 - w2 - r2, y2]);
  poly(fogged(light ? COL.rumble1 : COL.rumble2, fog),
    [x1 + w1 + r1, y1 + 1, x1 + w1, y1 + 1, x2 + w2, y2, x2 + w2 + r2, y2]);
  poly(fogged(light ? COL.road1 : COL.road2, fog),
    [x1 - w1, y1 + 1, x1 + w1, y1 + 1, x2 + w2, y2, x2 - w2, y2]);

  // White dashed lane lines on every other stripe
  if (light) {
    const l1 = w1 / 30, l2 = w2 / 30;
    for (const f of [-0.5, 0, 0.5]) {            // the 3 lines between 4 lanes
      const lx1 = x1 + f * w1, lx2 = x2 + f * w2;
      poly(fogged(COL.lane, fog),
        [lx1 - l1, y1 + 1, lx1 + l1, y1 + 1, lx2 + l2, y2, lx2 - l2, y2]);
    }
  }
}

// ----- 13. Draw vehicles (all seen from behind) -----
// Every vehicle is drawn with numbers that are fractions of its width (w).
// Example: R(-0.5, -0.6, 1, 0.36, color) = a rectangle that starts at the
// left edge (-0.5 w), 0.6 w above the road, is 1 w wide and 0.36 w tall.

function painter(x, y, w) {
  return {
    // rectangle
    R: (x0, y0, w0, h0, c) => {
      ctx.fillStyle = c;
      ctx.fillRect(x + x0 * w, y + y0 * w, w0 * w, h0 * w);
    },
    // polygon (list of x, y pairs)
    P: (c, pts) => poly(c, pts.map((v, i) => (i % 2 ? y + v * w : x + v * w))),
    // circle
    C: (cx, cy, r, c) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x + cx * w, y + cy * w, r * w, 0, Math.PI * 2);
      ctx.fill();
    },
    // text (skipped when it would be too tiny to read)
    T: (text, cx, cy, size, c) => {
      if (size * w < 6) return;
      ctx.font = `900 ${size * w}px 'Trebuchet MS', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = c;
      ctx.fillText(text, x + cx * w, y + cy * w);
    },
    // side panel: you see the side that faces the middle of the screen
    side: (top, bottom, c) => {
      const s = Math.max(-1, Math.min(1, (W / 2 - x) / (W / 2))) * w * 0.12;
      if (Math.abs(s) < 1) return;
      const edge = s > 0 ? x + w / 2 : x - w / 2;
      const lift = Math.abs(s) * 0.5;
      poly(c, [edge, y + bottom * w, edge + s, y + bottom * w - lift,
        edge + s, y + top * w - lift, edge, y + top * w]);
    },
    // soft light-to-dark shading over a part, so flat colors look rounded/3D
    shade: (x0, y0, w0, h0) => {
      const g = ctx.createLinearGradient(0, y + y0 * w, 0, y + (y0 + h0) * w);
      g.addColorStop(0, "rgba(255,255,255,0.16)");
      g.addColorStop(1, "rgba(0,0,0,0.18)");
      ctx.fillStyle = g;
      ctx.fillRect(x + x0 * w, y + y0 * w, w0 * w, h0 * w);
    },
    shadow: () => {
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.ellipse(x, y, w * 0.58, w * 0.065, 0, 0, Math.PI * 2);
      ctx.fill();
    },
  };
}

const TIRE = "#151515";
const RIM = "#3d3d3d";
const GLASS = "rgba(255,255,255,0.55)";   // shine on windows

// A tire seen from behind (black block with a lighter middle)
function tire(R, x0, y0, w0, h0) {
  R(x0, y0, w0, h0, TIRE);
  R(x0 + w0 * 0.2, y0 + h0 * 0.15, w0 * 0.6, h0 * 0.7, RIM);
}

// Red-and-white reflective stripe (like on the trucks in the pictures)
function reflector(R, x0, y0, width, h, parts) {
  for (let i = 0; i < parts; i++) {
    R(x0 + (i * width) / parts, y0, width / parts, h, i % 2 ? "#ffffff" : "#e02424");
  }
}

// License plate with a dark border
function plate(R, T, cx, cy, pw, ph, text, bg = "#f8fafc") {
  R(cx - pw / 2 - 0.006, cy - ph / 2 - 0.006, pw + 0.012, ph + 0.012, "#1f2937");
  R(cx - pw / 2, cy - ph / 2, pw, ph, bg);
  T(text, cx, cy + 0.002, ph * 0.62, "#1f2937");
}

// Car (also the player's car)
function drawCar(x, y, w, col) {
  const { R, P, T, side, shade, shadow } = painter(x, y, w);
  shadow();
  side(-0.385, -0.15, col.dark);
  side(-0.15, 0, TIRE);

  // Bumper + tires
  R(-0.48, -0.15, 0.96, 0.15, "#2b2b2b");
  R(-0.48, -0.15, 0.96, 0.015, "#4a4a4a");
  tire(R, -0.48, -0.15, 0.15, 0.15);
  tire(R, 0.33, -0.15, 0.15, 0.15);
  R(0.18, -0.06, 0.07, 0.03, "#9aa1a8");             // exhaust pipe

  // Back of the car
  R(-0.5, -0.385, 1, 0.24, col.body);
  R(-0.5, -0.16, 1, 0.02, col.dark);                  // darker lower edge
  R(-0.34, -0.335, 0.68, 0.022, "#8b1024");            // light bar between the lights
  for (const sx of [-0.45, 0.34]) {                   // tail lights with a shine
    R(sx, -0.345, 0.11, 0.07, "#ff3b30");
    R(sx + 0.01, -0.34, 0.05, 0.02, "#ffc2b8");
  }
  plate(R, T, 0, -0.245, 0.23, 0.075, "ABC 123");
  shade(-0.5, -0.385, 1, 0.24);

  // Trunk top (lighter, because light hits it from above) + spoiler lip
  P(col.top, [-0.5, -0.385, 0.5, -0.385, 0.46, -0.434, -0.46, -0.434]);
  R(-0.44, -0.445, 0.88, 0.02, col.dark);

  // Cabin, rear window with headrests inside, roof
  R(-0.36, -0.595, 0.72, 0.17, col.body);
  R(-0.29, -0.57, 0.58, 0.115, "#dfe8ef");
  R(-0.21, -0.53, 0.11, 0.075, "#3b4652");            // headrests
  R(0.1, -0.53, 0.11, 0.075, "#3b4652");
  P(GLASS, [-0.18, -0.57, -0.08, -0.57, -0.17, -0.455, -0.27, -0.455]);
  R(-0.06, -0.588, 0.12, 0.012, "#ff3b30");           // third brake light
  P(col.top, [-0.36, -0.595, 0.36, -0.595, 0.32, -0.64, -0.32, -0.64]);
  R(0.24, -0.72, 0.008, 0.08, "#333333");             // antenna
}

// E-bike: small enclosed electric tricycle with a black canopy
function drawEbike(x, y, w) {
  const { R, P, C, T, side, shade, shadow } = painter(x, y, w);
  shadow();
  tire(R, -0.46, -0.2, 0.12, 0.2);
  tire(R, 0.34, -0.2, 0.12, 0.2);
  R(-0.4, -0.17, 0.8, 0.05, "#2a2a2a");               // axle
  side(-0.52, -0.16, "#5d6268");

  // Grey cargo box with ribs, reflectors and plate
  R(-0.43, -0.535, 0.86, 0.03, "#a7adb4");
  R(-0.42, -0.52, 0.84, 0.36, "#8a9097");
  R(-0.36, -0.47, 0.72, 0.26, "#767c84");
  R(-0.36, -0.4, 0.72, 0.012, "#8a9097");
  R(-0.36, -0.33, 0.72, 0.012, "#8a9097");
  shade(-0.42, -0.52, 0.84, 0.36);
  C(0, -0.43, 0.035, "#d33a3a");                      // badge
  for (const sx of [-0.42, 0.35]) {
    R(sx, -0.48, 0.07, 0.07, "#ff3b30");              // tail lights
    R(sx, -0.25, 0.07, 0.03, "#ff7a00");              // reflectors
  }
  plate(R, T, 0, -0.255, 0.2, 0.065, "EV 2026");

  // Seat back
  R(-0.32, -0.8, 0.64, 0.28, "#1f1f1f");
  R(-0.3, -0.68, 0.6, 0.01, "#3a3a3a");               // stitching

  // Canopy: posts, cover with seams, framed rear window, curved roof, mirrors
  R(-0.46, -1.24, 0.06, 0.72, "#1a1a1a");
  R(0.4, -1.24, 0.06, 0.72, "#1a1a1a");
  R(-0.44, -1.22, 0.88, 0.36, "#353535");
  R(-0.44, -0.99, 0.88, 0.012, "#262626");
  R(-0.23, -1.16, 0.46, 0.17, "#1f1f1f");
  R(-0.2, -1.14, 0.4, 0.13, "#c9d3dc");
  P(GLASS, [-0.12, -1.14, -0.05, -1.14, -0.11, -1.01, -0.18, -1.01]);
  P("#2a2a2a", [-0.52, -1.22, 0.52, -1.22, 0.47, -1.32, -0.47, -1.32]);
  P("#3a3a3a", [-0.47, -1.32, 0.47, -1.32, 0.43, -1.38, -0.43, -1.38]);  // roof top
  R(-0.47, -1.325, 0.94, 0.015, "#4a4a4a");
  R(-0.58, -1.02, 0.07, 0.06, "#111111");
  R(0.51, -1.02, 0.07, 0.06, "#111111");
}

// Tricycle: motorcycle on the left, colored sidecar on the right, one roof
function drawTricycle(x, y, w, look) {
  const { R, P, C, T, side, shade, shadow } = painter(x, y, w);
  shadow();

  // Sidecar
  tire(R, 0.33, -0.22, 0.12, 0.22);
  side(-1.12, -0.22, look.dark);
  R(-0.06, -1.1, 0.56, 0.88, look.body);
  R(-0.06, -1.1, 0.56, 0.04, look.dark);              // top trim
  R(0.02, -1.02, 0.4, 0.24, "#9fd3ea");               // window with 2 passengers
  C(0.13, -0.86, 0.055, "#3b2a1a");
  C(0.3, -0.87, 0.055, "#5a3d24");
  R(0.06, -0.81, 0.14, 0.03, "#e85d75");
  R(0.23, -0.81, 0.14, 0.03, "#4ade80");
  P(GLASS, [0.33, -1.02, 0.39, -1.02, 0.31, -0.78, 0.25, -0.78]);
  R(-0.06, -0.6, 0.56, 0.03, "#ffffff");              // stripes
  R(-0.06, -0.57, 0.56, 0.06, "#1d4fbf");
  R(-0.06, -0.51, 0.56, 0.02, "#d62828");
  R(0.02, -0.47, 0.4, 0.1, "#ffffff");                // route sign
  T("CALAUAN TODA", 0.22, -0.42, 0.042, "#1d4fbf");
  T("143", 0.22, -0.31, 0.07, look.dark);             // body number
  R(0.4, -0.37, 0.07, 0.06, "#ff3b30");
  shade(-0.06, -1.1, 0.56, 0.88);

  // Motorcycle
  tire(R, -0.36, -0.26, 0.1, 0.26);
  R(-0.26, -0.17, 0.16, 0.04, "#c0c6cc");             // exhaust
  R(-0.39, -0.42, 0.16, 0.16, "#d62828");             // fender
  R(-0.39, -0.42, 0.16, 0.02, "#ff6b6b");
  R(-0.35, -0.41, 0.08, 0.035, "#ff7a00");            // tail light
  R(-0.37, -0.355, 0.12, 0.055, "#f8fafc");           // plate

  // Driver with helmet
  R(-0.42, -0.84, 0.22, 0.4, "#2f5fa8");
  R(-0.45, -0.8, 0.04, 0.2, "#2f5fa8");               // arms
  R(-0.21, -0.8, 0.04, 0.2, "#2f5fa8");
  R(-0.41, -0.48, 0.2, 0.06, "#222222");
  C(-0.31, -0.93, 0.085, "#222222");
  R(-0.33, -1.01, 0.04, 0.14, "#facc15");             // helmet stripe

  // Roof over both
  R(-0.47, -1.16, 0.04, 0.72, "#222222");
  P("#1c1c1c", [-0.5, -1.16, 0.51, -1.16, 0.49, -1.25, -0.48, -1.25]);
  P("#333333", [-0.48, -1.25, 0.49, -1.25, 0.45, -1.31, -0.44, -1.31]);  // roof top
  R(-0.5, -1.165, 1.01, 0.02, "#444444");
  R(-0.53, -1.0, 0.05, 0.04, "#9aa3ab");              // mirror
}

// L-300: white pickup with sacks and a crate on the flat bed
function drawL300(x, y, w) {
  const { R, P, C, T, side, shade, shadow } = painter(x, y, w);
  shadow();

  // Cab with driver, then the rack behind the cab
  R(-0.42, -1.02, 0.84, 0.44, "#f4f6f8");
  R(-0.34, -0.95, 0.68, 0.24, "#2d3a45");
  C(-0.15, -0.8, 0.07, "#1a242c");
  P(GLASS, [0.1, -0.95, 0.18, -0.95, 0.08, -0.71, 0, -0.71]);
  P("#ffffff", [-0.42, -1.02, 0.42, -1.02, 0.38, -1.07, -0.38, -1.07]);
  const rack = "#c3c9cf";
  R(-0.47, -0.98, 0.05, 0.4, rack);
  R(0.42, -0.98, 0.05, 0.4, rack);
  R(-0.47, -0.98, 0.94, 0.04, rack);
  for (let i = 1; i <= 4; i++) R(-0.47 + i * 0.188 - 0.012, -0.95, 0.024, 0.37, rack);

  // Cargo: rice sacks and a wooden crate
  R(0.04, -0.82, 0.22, 0.2, "#b7793f");
  R(0.04, -0.75, 0.22, 0.015, "#8a5a2b");
  R(0.14, -0.82, 0.015, 0.2, "#8a5a2b");
  C(-0.3, -0.66, 0.12, "#c8a96e");
  C(-0.08, -0.69, 0.13, "#d4b57a");
  C(0.36, -0.66, 0.1, "#bfa063");

  // Wheels, bumper, tailgate
  tire(R, -0.46, -0.22, 0.14, 0.22);
  tire(R, 0.32, -0.22, 0.14, 0.22);
  side(-0.62, -0.24, "#c9ced3");
  R(-0.44, -0.27, 0.88, 0.08, "#2b2b2b");
  R(-0.5, -0.62, 1, 0.37, "#e9ecef");
  for (const ry of [-0.52, -0.43, -0.34]) R(-0.48, ry, 0.96, 0.02, "#cfd4d9");
  R(-0.5, -0.64, 1, 0.03, "#ffffff");
  shade(-0.5, -0.62, 1, 0.37);
  for (const sx of [-0.49, 0.38]) {                   // tail light clusters
    R(sx, -0.36, 0.11, 0.11, "#2b2b2b");
    R(sx + 0.01, -0.35, 0.09, 0.03, "#ff3b30");
    R(sx + 0.01, -0.32, 0.09, 0.03, "#ff9f1c");
    R(sx + 0.01, -0.29, 0.09, 0.02, "#f8fafc");
  }
  plate(R, T, 0, -0.23, 0.2, 0.065, "NBC 300");
}

// Jeepney: colorful body, open back door with passengers, chrome everywhere
function drawJeepney(x, y, w, look) {
  const { R, P, C, T, side, shade, shadow } = painter(x, y, w);
  shadow();
  tire(R, -0.46, -0.22, 0.14, 0.22);
  tire(R, 0.32, -0.22, 0.14, 0.22);
  side(-1.02, -0.24, look.dark);

  // Body, bands and paintings
  R(-0.5, -0.58, 1, 0.34, look.body);
  R(-0.5, -0.5, 1, 0.06, look.band);
  R(-0.5, -0.36, 1, 0.04, look.stripe);
  shade(-0.5, -0.58, 1, 0.34);
  T("GOD BLESS", -0.35, -0.42, 0.045, "#ffffff");
  T("OUR TRIP", 0.35, -0.42, 0.045, "#ffffff");
  R(-0.5, -1.0, 0.3, 0.42, look.body);
  R(0.2, -1.0, 0.3, 0.42, look.body);
  for (const sx of [-0.45, 0.25]) {                   // windows with shine
    R(sx, -0.95, 0.2, 0.17, "#bfe3f5");
    P(GLASS, [sx + 0.12, -0.95, sx + 0.17, -0.95, sx + 0.1, -0.78, sx + 0.05, -0.78]);
  }
  C(-0.35, -0.68, 0.05, look.band);                   // sun with rays
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    C(-0.35 + Math.cos(a) * 0.075, -0.68 + Math.sin(a) * 0.075, 0.012, look.band);
  }
  for (const sx of [0.27, 0.35, 0.43]) C(sx, -0.68, 0.02, look.band); // stars

  // Open back door: dark inside, seats, passengers, handrails
  R(-0.2, -1.0, 0.4, 0.76, "#3b2a1a");
  R(-0.2, -0.64, 0.09, 0.22, "#e8892b");
  R(0.11, -0.64, 0.09, 0.22, "#e8892b");
  C(-0.15, -0.72, 0.045, "#6b5240");
  C(0.15, -0.74, 0.045, "#7a5c45");
  R(-0.2, -0.3, 0.4, 0.06, "#5a4330");                // floor
  R(-0.215, -1.0, 0.025, 0.76, "#d7dde2");
  R(0.19, -1.0, 0.025, 0.76, "#d7dde2");

  for (const sx of [-0.48, 0.4]) R(sx, -0.57, 0.08, 0.06, "#ff3b30"); // tail lights
  R(-0.5, -0.24, 1, 0.06, "#c9d0d6");                 // chrome bumper
  R(-0.5, -0.24, 1, 0.012, "#f1f5f9");
  R(-0.22, -0.2, 0.44, 0.03, "#9aa3ab");              // step
  plate(R, T, 0, -0.275, 0.18, 0.06, "PUJ 143", "#f9d71c");
  R(-0.61, -0.92, 0.07, 0.09, "#c9d0d6");             // chrome mirrors
  R(0.54, -0.92, 0.07, 0.09, "#c9d0d6");

  // Roof with a row of small colored lights
  P(look.roof, [-0.55, -1.12, 0.55, -1.12, 0.5, -1.2, -0.5, -1.2]);   // roof top
  P("rgba(255,255,255,0.22)", [-0.55, -1.12, 0.55, -1.12, 0.5, -1.2, -0.5, -1.2]);
  R(-0.55, -1.12, 1.1, 0.03, look.stripe);
  R(-0.55, -1.09, 1.1, 0.07, look.roof);
  R(-0.55, -1.03, 1.1, 0.03, look.band);
  R(-0.55, -1.125, 1.1, 0.01, "#f1f5f9");
  const bulbs = ["#ff3b30", "#facc15", "#4ade80", "#38bdf8"];
  for (let i = 0; i < 10; i++) C(-0.495 + i * 0.11, -1.055, 0.014, bulbs[i % 4]);
}

// Box truck: aluminum box with company stripe, door bars and reflective tape
function drawBoxTruck(x, y, w) {
  const { R, P, T, side, shade, shadow } = painter(x, y, w);
  shadow();
  for (const wx of [-0.47, -0.36, 0.27, 0.38]) tire(R, wx, -0.22, 0.09, 0.22);
  R(-0.4, -0.31, 0.8, 0.08, "#2b2b2b");
  R(-0.42, -0.2, 0.84, 0.035, "#3b3b3b");            // underride guard
  reflector(R, -0.45, -0.25, 0.9, 0.05, 10);
  R(-0.48, -0.12, 0.2, 0.1, "#111111");              // mud flaps
  R(0.28, -0.12, 0.2, 0.1, "#111111");
  side(-1.46, -0.3, "#c4cad0");

  P("#f4f6f8", [-0.5, -1.46, 0.5, -1.46, 0.46, -1.54, -0.46, -1.54]);   // box top
  R(-0.5, -1.46, 1, 1.16, "#e6e9ec");                 // the box
  R(-0.5, -1.46, 1, 0.05, "#b8bec5");
  R(-0.5, -1.46, 0.04, 1.16, "#b8bec5");
  R(0.46, -1.46, 0.04, 1.16, "#b8bec5");
  R(-0.5, -0.34, 1, 0.04, "#9aa1a8");
  R(-0.44, -1.34, 0.88, 0.13, "#1d4fbf");            // company stripe
  T("FAST CARGO", 0, -1.275, 0.075, "#ffffff");
  R(-0.005, -1.41, 0.01, 1.07, "#aab1b8");            // line between doors
  for (const bx of [-0.3, -0.12, 0.1, 0.28]) R(bx, -1.18, 0.02, 0.8, "#8d949b"); // lock bars
  for (const hy of [-1.28, -0.95, -0.6]) {            // hinges
    R(-0.47, hy, 0.04, 0.05, "#7b828a");
    R(0.43, hy, 0.04, 0.05, "#7b828a");
  }
  reflector(R, -0.46, -0.4, 0.92, 0.03, 12);          // reflective tape
  T("KEEP DISTANCE", 0, -0.46, 0.035, "#475569");
  shade(-0.5, -1.46, 1, 1.16);
  R(-0.4, -1.45, 0.06, 0.03, "#ff7a00");
  R(0.34, -1.45, 0.06, 0.03, "#ff7a00");
  R(-0.46, -0.45, 0.07, 0.09, "#ff3b30");
  R(0.39, -0.45, 0.07, 0.09, "#ff3b30");
}

// Dump truck: white dump body full of sand, with ribs and a ladder
function drawDumpTruck(x, y, w) {
  const { R, P, C, T, side, shade, shadow } = painter(x, y, w);
  shadow();
  for (const wx of [-0.47, -0.36, 0.27, 0.38]) tire(R, wx, -0.22, 0.09, 0.22);
  R(-0.4, -0.32, 0.8, 0.08, "#2b2b2b");
  reflector(R, -0.45, -0.25, 0.9, 0.05, 10);
  R(-0.48, -0.12, 0.2, 0.1, "#111111");
  R(0.28, -0.12, 0.2, 0.1, "#111111");
  side(-1.12, -0.32, "#c9ced3");

  // Sand pile peeking over the top
  P("#c49a5a", [-0.46, -1.1, 0.46, -1.1, 0.3, -1.24, 0.05, -1.3, -0.2, -1.26]);
  for (const [sx, sy] of [[-0.1, -1.2], [0.15, -1.18], [-0.25, -1.15], [0.05, -1.25]]) C(sx, sy, 0.012, "#9c7640");

  P("#f1f3f5", [-0.46, -0.32, 0.46, -0.32, 0.5, -1.12, -0.5, -1.12]); // dump body
  R(-0.48, -0.57, 0.96, 0.035, "#cfd4d9");
  R(-0.49, -0.84, 0.98, 0.035, "#cfd4d9");
  for (const vx of [-0.25, 0, 0.25]) R(vx - 0.012, -1.1, 0.025, 0.78, "#dfe3e7");
  shade(-0.5, -1.12, 1, 0.8);
  R(-0.52, -1.15, 1.04, 0.04, "#9aa1a8");
  R(-0.49, -1.13, 0.06, 0.06, "#6b7280");             // hinge pins
  R(0.43, -1.13, 0.06, 0.06, "#6b7280");
  R(-0.56, -1.05, 0.02, 0.65, "#6b7280");             // ladder on the side
  for (let i = 0; i < 6; i++) R(-0.56, -1.0 + i * 0.11, 0.06, 0.015, "#6b7280");
  reflector(R, -0.46, -0.4, 0.92, 0.035, 10);
  R(-0.44, -0.31, 0.08, 0.06, "#ff3b30");
  R(0.36, -0.31, 0.08, 0.06, "#ff3b30");
  plate(R, T, 0, -0.28, 0.16, 0.055, "TRK 888");
}

// Picks the right drawing for a vehicle. k = screen pixels per world unit
function drawVehicle(v, x, y, k) {
  const w = VEHICLES[v.type].w * k;
  if (v.type === "car") drawCar(x, y, w, v.look);
  else if (v.type === "ebike") drawEbike(x, y, w);
  else if (v.type === "tricycle") drawTricycle(x, y, w, v.look);
  else if (v.type === "l300") drawL300(x, y, w);
  else if (v.type === "jeepney") drawJeepney(x, y, w, v.look);
  else if (v.type === "boxtruck") drawBoxTruck(x, y, w);
  else if (v.type === "dumptruck") drawDumpTruck(x, y, w);
  else if (v.type === "bus") drawBus(x, y, w);
  else if (v.type === "kalesa") drawKalesa(x, y, w);
}

// Provincial bus: big body, passengers in the back window, route sign
function drawBus(x, y, w) {
  const { R, P, C, T, side, shade, shadow } = painter(x, y, w);
  shadow();
  for (const wx of [-0.47, -0.36, 0.27, 0.38]) tire(R, wx, -0.2, 0.09, 0.2);
  side(-1.45, -0.2, "#b8c2cc");
  P("#e2e8f0", [-0.5, -1.45, 0.5, -1.45, 0.46, -1.53, -0.46, -1.53]);   // roof top
  R(-0.5, -1.45, 1, 1.25, "#f1f5f9");
  R(-0.5, -0.64, 1, 0.08, "#16a34a");                 // green and yellow stripes
  R(-0.5, -0.56, 1, 0.04, "#facc15");
  R(-0.44, -1.36, 0.88, 0.4, "#2d3a45");              // back window with passengers
  for (const [hx, hc] of [[-0.3, "#4b5563"], [-0.1, "#57534e"], [0.12, "#4b5563"], [0.3, "#44403c"]]) {
    C(hx, -1.08, 0.06, hc);
    R(hx - 0.08, -1.02, 0.16, 0.06, hc);
  }
  P(GLASS, [0.15, -1.36, 0.25, -1.36, 0.12, -0.96, 0.02, -0.96]);
  R(-0.4, -1.445, 0.8, 0.07, "#111111");              // LED route sign
  T("STA. CRUZ - BUENDIA", 0, -1.41, 0.042, "#fbbf24");
  for (let i = 0; i < 6; i++) R(-0.3, -0.92 + i * 0.045, 0.6, 0.02, "#cbd5e1"); // engine grille
  for (const sx of [-0.49, 0.42]) {                   // tall tail lights
    R(sx, -0.95, 0.07, 0.08, "#ff9f1c");
    R(sx, -0.87, 0.07, 0.22, "#ff3b30");
  }
  shade(-0.5, -1.45, 1, 1.25);
  R(-0.5, -0.26, 1, 0.08, "#334155");                 // bumper
  plate(R, T, 0, -0.33, 0.2, 0.065, "PUB 2026");
  R(-0.48, -0.12, 0.22, 0.1, "#111111");
  R(0.26, -0.12, 0.22, 0.1, "#111111");
}

// Kalesa: horse carriage with big wooden wheels and a curved canopy
function drawKalesa(x, y, w) {
  const { R, P, C, side, shade, shadow } = painter(x, y, w);
  shadow();
  R(-0.12, -0.32, 0.06, 0.32, "#6d4c2f");             // horse legs under the carriage
  R(0.06, -0.32, 0.06, 0.32, "#6d4c2f");
  side(-0.76, -0.36, "#7f1d1d");
  for (const wx of [-0.52, 0.45]) {                   // big wheels seen from behind
    R(wx, -0.62, 0.07, 0.62, "#5d4037");
    R(wx + 0.015, -0.6, 0.04, 0.58, "#d4a017");
  }
  R(-0.42, -0.76, 0.84, 0.42, "#b91c1c");             // carriage body with gold trim
  R(-0.42, -0.76, 0.84, 0.03, "#d4a017");
  R(-0.42, -0.37, 0.84, 0.03, "#d4a017");
  C(0, -0.55, 0.09, "#d4a017");
  C(0, -0.55, 0.06, "#b91c1c");
  C(0, -0.55, 0.025, "#d4a017");
  shade(-0.42, -0.76, 0.84, 0.42);
  R(-0.4, -1.15, 0.03, 0.4, "#3e2723");               // canopy posts
  R(0.37, -1.15, 0.03, 0.4, "#3e2723");
  C(-0.12, -0.88, 0.06, "#4b3621");                   // passengers
  C(0.13, -0.89, 0.06, "#6b4f2a");
  R(-0.2, -0.82, 0.16, 0.06, "#38bdf8");
  R(0.05, -0.83, 0.16, 0.06, "#f472b6");
  R(-0.47, -0.97, 0.05, 0.09, "#facc15");             // brass lamps
  R(0.42, -0.97, 0.05, 0.09, "#facc15");
  P("#1f2937", [-0.48, -1.12, 0.48, -1.12, 0.44, -1.2, 0.3, -1.25, -0.3, -1.25, -0.44, -1.2]);
  for (let i = 0; i < 12; i++) R(-0.47 + i * 0.08, -1.13, 0.04, 0.035, "#d4a017"); // fringe
  R(-0.15, -0.34, 0.3, 0.03, "#3e2723");              // step
}

// ----- 13c. PLAYER CARS (more detail, because you look at them the whole time) -----

// Sports car: low and wide, big wing, quad exhausts, racing stripes
function drawSports(x, y, w, col) {
  const { R, P, C, T, side, shade, shadow } = painter(x, y, w);
  shadow();
  side(-0.3, -0.12, col.dark);
  side(-0.12, 0, TIRE);
  tire(R, -0.5, -0.14, 0.18, 0.14);
  tire(R, 0.32, -0.14, 0.18, 0.14);
  R(-0.34, -0.13, 0.68, 0.11, "#111111");             // diffuser with fins
  for (let i = 0; i < 6; i++) R(-0.29 + i * 0.11, -0.13, 0.02, 0.11, "#2a2a2a");
  for (const ex of [-0.1, -0.035, 0.035, 0.1]) {      // quad exhausts
    C(ex, -0.065, 0.028, "#9aa1a8");
    C(ex, -0.065, 0.017, "#1a1a1a");
  }
  R(-0.5, -0.31, 1, 0.18, col.body);
  R(-0.07, -0.31, 0.045, 0.18, "rgba(255,255,255,0.85)");  // racing stripes
  R(0.025, -0.31, 0.045, 0.18, "rgba(255,255,255,0.85)");
  R(-0.46, -0.275, 0.92, 0.018, "#ff2d2d");           // thin LED light strip
  R(-0.49, -0.295, 0.15, 0.05, "#ff3b30");
  R(0.34, -0.295, 0.15, 0.05, "#ff3b30");
  R(-0.48, -0.29, 0.06, 0.015, "#ffc2b8");
  plate(R, T, 0, -0.19, 0.18, 0.055, "SPD 001");
  shade(-0.5, -0.31, 1, 0.18);
  P(col.top, [-0.5, -0.31, 0.5, -0.31, 0.42, -0.37, -0.42, -0.37]);   // trunk
  P(col.body, [-0.3, -0.37, 0.3, -0.37, 0.24, -0.5, -0.24, -0.5]);    // fastback cabin
  P("#1f2a33", [-0.24, -0.38, 0.24, -0.38, 0.2, -0.48, -0.2, -0.48]);
  P(GLASS, [0.06, -0.38, 0.12, -0.38, 0.08, -0.48, 0.02, -0.48]);
  P(col.top, [-0.24, -0.5, 0.24, -0.5, 0.2, -0.54, -0.2, -0.54]);
  R(-0.06, -0.54, 0.035, 0.04, "#ffffff");
  R(0.025, -0.54, 0.035, 0.04, "#ffffff");
  R(-0.3, -0.43, 0.03, 0.12, "#111111");              // rear wing on struts
  R(0.27, -0.43, 0.03, 0.12, "#111111");
  R(-0.5, -0.47, 1, 0.045, "#111111");
  R(-0.5, -0.47, 1, 0.01, "#3a3a3a");
  R(-0.53, -0.51, 0.035, 0.1, "#111111");
  R(0.495, -0.51, 0.035, 0.1, "#111111");
}

// Electric car: smooth body, full-width light bar, glass roof, no exhaust
function drawElectric(x, y, w, col) {
  const { R, P, T, side, shade, shadow } = painter(x, y, w);
  shadow();
  side(-0.38, -0.14, col.dark);
  side(-0.14, 0, TIRE);
  tire(R, -0.48, -0.14, 0.15, 0.14);
  tire(R, 0.33, -0.14, 0.15, 0.14);
  R(-0.44, -0.14, 0.88, 0.06, "#1f2937");
  R(-0.5, -0.38, 1, 0.24, col.body);
  shade(-0.5, -0.38, 1, 0.24);
  R(-0.48, -0.338, 0.96, 0.042, "rgba(255,45,85,0.35)");   // glowing light bar
  R(-0.48, -0.33, 0.96, 0.026, "#ff2d55");
  R(-0.48, -0.17, 0.96, 0.012, "#38bdf8");            // blue accent line
  P("#e0f2fe", [0.01, -0.3, -0.025, -0.262, -0.002, -0.262, -0.012, -0.235, 0.025, -0.275, 0.002, -0.275]); // ⚡ badge
  plate(R, T, 0, -0.205, 0.2, 0.055, "EV 0001");
  P(col.top, [-0.5, -0.38, 0.5, -0.38, 0.44, -0.44, -0.44, -0.44]);
  P("#1e293b", [-0.36, -0.44, 0.36, -0.44, 0.3, -0.6, -0.3, -0.6]);   // all-glass cabin
  P(GLASS, [0.08, -0.44, 0.15, -0.44, 0.1, -0.6, 0.04, -0.6]);
  P("#0f172a", [-0.3, -0.6, 0.3, -0.6, 0.26, -0.64, -0.26, -0.64]);
  R(-0.05, -0.62, 0.1, 0.012, "#38bdf8");
}

// Retro muscle car: wide, ducktail spoiler, triple tail lights, window louvers
function drawMuscle(x, y, w, col) {
  const { R, P, C, T, side, shade, shadow } = painter(x, y, w);
  shadow();
  side(-0.4, -0.15, col.dark);
  side(-0.15, 0, TIRE);
  tire(R, -0.5, -0.16, 0.18, 0.16);
  tire(R, 0.32, -0.16, 0.18, 0.16);
  for (const ex of [-0.3, -0.22, 0.22, 0.3]) {        // dual exhausts on each side
    C(ex, -0.06, 0.028, "#c0c6cc");
    C(ex, -0.06, 0.016, "#1a1a1a");
  }
  R(-0.5, -0.4, 1, 0.2, col.body);
  R(-0.09, -0.4, 0.05, 0.2, "#ffffff");               // twin stripes
  R(0.04, -0.4, 0.05, 0.2, "#ffffff");
  for (const side2 of [-1, 1]) {                      // 3 tail lights per side in chrome
    const bx = side2 < 0 ? -0.48 : 0.25;
    R(bx, -0.37, 0.23, 0.08, "#c0c6cc");
    for (let i = 0; i < 3; i++) R(bx + 0.01 + i * 0.075, -0.36, 0.065, 0.06, "#ff3b30");
  }
  C(0, -0.33, 0.03, "#d4a017");                       // gold badge
  plate(R, T, 0, -0.255, 0.2, 0.06, "RTR 70");
  shade(-0.5, -0.4, 1, 0.2);
  R(-0.5, -0.2, 1, 0.06, "#d7dde2");                  // chrome bumper
  R(-0.5, -0.2, 1, 0.012, "#ffffff");
  P(col.dark, [-0.5, -0.4, 0.5, -0.4, 0.52, -0.44, -0.52, -0.44]);    // ducktail
  P(col.top, [-0.5, -0.44, 0.5, -0.44, 0.45, -0.48, -0.45, -0.48]);
  R(-0.085, -0.48, 0.045, 0.04, "#ffffff");
  R(0.04, -0.48, 0.045, 0.04, "#ffffff");
  R(-0.34, -0.62, 0.68, 0.14, col.body);
  R(-0.28, -0.6, 0.56, 0.11, "#1f2a33");
  for (let i = 0; i < 5; i++) R(-0.28, -0.59 + i * 0.022, 0.56, 0.009, "#0b0f14"); // louvers
  P(col.top, [-0.34, -0.62, 0.34, -0.62, 0.3, -0.66, -0.3, -0.66]);
  R(-0.08, -0.66, 0.04, 0.04, "#ffffff");
  R(0.04, -0.66, 0.04, 0.04, "#ffffff");
}

// Hari ng Daan ("King of the Road"): a premium e-bike in black and gold,
// with a neon underglow, red leather seat, roof spoiler and crowns
function drawHari(x, y, w) {
  const { R, P, C, T, side, shade, shadow } = painter(x, y, w);
  const neon = ctx.createRadialGradient(x, y, 0, x, y, w * 0.8);   // cyan glow under the bike
  neon.addColorStop(0, "rgba(34,211,238,0.55)");
  neon.addColorStop(1, "rgba(34,211,238,0)");
  ctx.fillStyle = neon;
  ctx.fillRect(x - w * 0.8, y - w * 0.25, w * 1.6, w * 0.5);
  shadow();
  for (const tx of [-0.5, 0.34]) {                    // wheels with gold rims
    R(tx, -0.22, 0.16, 0.22, TIRE);
    R(tx + 0.03, -0.19, 0.1, 0.16, "#d4a017");
    R(tx + 0.055, -0.16, 0.05, 0.1, "#7a5c00");
  }
  R(-0.42, -0.18, 0.84, 0.05, "#111111");
  side(-0.56, -0.18, "#1a1a1a");

  // Glossy black body with gold trim and gold flames
  R(-0.45, -0.56, 0.9, 0.4, "#141414");
  R(-0.45, -0.56, 0.9, 0.025, "#facc15");
  R(-0.45, -0.185, 0.9, 0.02, "#facc15");
  P("#facc15", [-0.45, -0.46, -0.24, -0.38, -0.45, -0.3]);
  P("#facc15", [0.45, -0.46, 0.24, -0.38, 0.45, -0.3]);
  R(-0.42, -0.505, 0.84, 0.05, "rgba(255,45,85,0.35)");   // LED light bar
  R(-0.42, -0.495, 0.84, 0.03, "#ff2d55");
  P("#facc15", [-0.09, -0.3, 0.09, -0.3, 0.1, -0.41, 0.045, -0.355, 0, -0.43, -0.045, -0.355, -0.1, -0.41]); // crown
  C(0, -0.33, 0.012, "#ef4444");
  plate(R, T, 0, -0.245, 0.2, 0.055, "HARI 01");
  shade(-0.45, -0.56, 0.9, 0.4);

  // Red leather seat with stitching
  R(-0.32, -0.82, 0.64, 0.26, "#7f1d1d");
  R(-0.3, -0.72, 0.6, 0.008, "#fca5a5");
  R(-0.01, -0.8, 0.02, 0.22, "#fca5a5");

  // Canopy: black frame with gold edges, dark tinted glass, neon strip
  R(-0.47, -1.26, 0.06, 0.72, "#0a0a0a");
  R(0.41, -1.26, 0.06, 0.72, "#0a0a0a");
  R(-0.455, -1.26, 0.015, 0.72, "#facc15");
  R(0.44, -1.26, 0.015, 0.72, "#facc15");
  R(-0.44, -1.22, 0.88, 0.38, "#1f1f1f");
  R(-0.3, -1.17, 0.6, 0.22, "#0f172a");
  P(GLASS, [0.08, -1.17, 0.16, -1.17, 0.1, -0.95, 0.02, -0.95]);
  R(-0.44, -0.86, 0.88, 0.015, "#22d3ee");
  R(-0.22, -0.95, 0.44, 0.085, "#0a0a0a");            // dark strip so the label is easy to read
  T("E-BIKE", 0, -0.905, 0.08, "#facc15");            // label under the back window
  R(-0.6, -1.02, 0.08, 0.06, "#facc15");              // gold mirrors
  R(0.52, -1.02, 0.08, 0.06, "#facc15");

  // Roof spoiler and a little crown on top
  P("#0a0a0a", [-0.54, -1.24, 0.54, -1.24, 0.5, -1.34, -0.5, -1.34]);
  R(-0.54, -1.26, 1.08, 0.025, "#facc15");
  P("#262626", [-0.5, -1.34, 0.5, -1.34, 0.45, -1.4, -0.45, -1.4]);
  P("#facc15", [-0.07, -1.4, 0.07, -1.4, 0.08, -1.48, 0.035, -1.44, 0, -1.5, -0.035, -1.44, -0.08, -1.48]);
}

// Draws whatever the player picked in the garage
function drawPlayerVehicle(pt, x, y, w) {
  const col = PLAYER_COLORS[carChoice];
  if (pt.id === "electric") drawElectric(x, y, w, col);
  else if (pt.id === "muscle") drawMuscle(x, y, w, col);
  else if (pt.id === "jeepney") drawJeepney(x, y, w, JEEP_COLORS[0]);
  else if (pt.id === "hari") drawHari(x, y, w);
  else drawSports(x, y, w, col);
}

// ----- 14. Draw trees, bushes and coins -----
function drawTree(x, y, h) {
  ctx.fillStyle = "#8a5a3b";
  ctx.fillRect(x - h * 0.05, y - h * 0.2, h * 0.1, h * 0.2);
  poly("#52cf8f", [x, y - h, x - h * 0.22, y - h * 0.62, x - h * 0.3, y - h * 0.36, x - h * 0.2, y - h * 0.16, x, y - h * 0.13]);
  poly("#38b277", [x, y - h, x + h * 0.22, y - h * 0.62, x + h * 0.3, y - h * 0.36, x + h * 0.2, y - h * 0.16, x, y - h * 0.13]);
}

function drawBush(x, y, h) {
  ctx.fillStyle = "#4fc488";
  ctx.beginPath();
  ctx.ellipse(x - h * 0.15, y, h * 0.4, h * 0.3, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = "#3aad73";
  ctx.beginPath();
  ctx.ellipse(x + h * 0.2, y, h * 0.32, h * 0.24, 0, Math.PI, 0);
  ctx.fill();
}

function drawCoin(x, y, w) {
  const r = w * 0.12;
  const cy = y - r * 1.4;
  ctx.fillStyle = "#e0a800";
  ctx.beginPath(); ctx.arc(x, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ffd23f";
  ctx.beginPath(); ctx.arc(x, cy, r * 0.8, 0, Math.PI * 2); ctx.fill();
  if (r > 5) {                                     // the peso sign
    ctx.fillStyle = "#b45309";
    ctx.font = `900 ${r * 1.15}px 'Trebuchet MS', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("₱", x, cy + r * 0.05);
  }
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.beginPath(); ctx.arc(x - r * 0.4, cy - r * 0.4, r * 0.18, 0, Math.PI * 2); ctx.fill();
}

// ----- 14b. ROADSIDE LANDMARKS (buildings and places beside the road) -----
// These are drawn in WORLD units (the same units as the road: one lane is
// 1200 wide). y goes UP from the ground here, which is easier for buildings.
// k = how many screen pixels one world unit is at that distance.

function landPainter(x, y, k, labels = false) {
  const z = (CAM_DEPTH * W / 2) / k;     // how far away it is from the camera
  const sx = (u) => x + u * k;           // world x → screen x
  const sy = (v) => y - v * k;           // world height → screen y
  const api = {
    k,
    R(x0, y0, w0, h0, c) {
      ctx.fillStyle = c;
      ctx.fillRect(sx(x0), sy(y0 + h0), w0 * k, h0 * k);
    },
    P(c, pts) { poly(c, pts.map((v, i) => (i % 2 ? sy(v) : sx(v)))); },
    C(cx, cy, r, c) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(sx(cx), sy(cy), Math.max(0.5, r * k), 0, Math.PI * 2);
      ctx.fill();
    },
    E(cx, cy, rx, ry, c, rot = 0) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.ellipse(sx(cx), sy(cy), Math.max(0.5, rx * k), Math.max(0.5, ry * k), rot, 0, Math.PI * 2);
      ctx.fill();
    },
    T(text, cx, cy, size, c) {
      if (!labels || size * k < 6) return; // no text (except PUP), or too small to read
      ctx.font = `900 ${size * k}px 'Trebuchet MS', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = c;
      ctx.fillText(text, sx(cx), sy(cy));
    },
    // A thick curved line (water slides). pts = start x,y then groups of 6 (bezier)
    curve(c, width, pts) {
      ctx.strokeStyle = c;
      ctx.lineWidth = Math.max(1, width * k);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(sx(pts[0]), sy(pts[1]));
      for (let i = 2; i < pts.length; i += 6) {
        ctx.bezierCurveTo(sx(pts[i]), sy(pts[i + 1]), sx(pts[i + 2]), sy(pts[i + 3]), sx(pts[i + 4]), sy(pts[i + 5]));
      }
      ctx.stroke();
    },
    // A 3D block: front wall + the side wall that faces the road
    // (+ the roof when the roof is below the camera). depth = how deep it is.
    box(x0, w0, h0, depth, front, sideC, roofC, y0 = 0) {
      const f = Math.min(0.3, depth / (z + depth));   // far edge moves this much toward the vanishing point
      const vx = vanishX, vy = HORIZON;    // where the road disappears (moves on curves)
      const back = (u, v) => [sx(u) + (vx - sx(u)) * f, sy(v) + (vy - sy(v)) * f];
      const ex = x < vx ? x0 + w0 : x0;    // the edge next to the road
      const [b1x, b1y] = back(ex, y0);
      const [b2x, b2y] = back(ex, y0 + h0);
      poly(sideC, [sx(ex), sy(y0), b1x, b1y, b2x, b2y, sx(ex), sy(y0 + h0)]);
      if (roofC && sy(y0 + h0) > vy) {
        const [c1x, c1y] = back(x0, y0 + h0);
        const [c2x, c2y] = back(x0 + w0, y0 + h0);
        poly(roofC, [sx(x0), sy(y0 + h0), sx(x0 + w0), sy(y0 + h0), c2x, c2y, c1x, c1y]);
      }
      api.R(x0, y0, w0, h0, front);
    },
    // A grid of windows
    windows(x0, y0, cols, rows, ww, wh, gx, gy, c, frame) {
      for (let r = 0; r < rows; r++) {
        for (let i = 0; i < cols; i++) {
          const wx = x0 + i * (ww + gx), wy = y0 + r * (wh + gy);
          if (frame) api.R(wx - 40, wy - 40, ww + 80, wh + 80, frame);
          api.R(wx, wy, ww, wh, c);
          api.R(wx + ww * 0.15, wy + wh * 0.55, ww * 0.12, wh * 0.35, "rgba(255,255,255,0.45)");
        }
      }
    },
  };
  return api;
}

// The Philippine flag on a pole
function phFlag(p, poleX, poleH, fw) {
  p.R(poleX, 0, 60, poleH, "#cfd4d9");
  const top = poleH - 60, fh = fw / 2;
  p.R(poleX + 60, top - fh / 2, fw, fh / 2, "#0038a8");
  p.R(poleX + 60, top - fh, fw, fh / 2, "#ce1126");
  p.P("#ffffff", [poleX + 60, top, poleX + 60, top - fh, poleX + 60 + fh * 0.87, top - fh / 2]);
  p.C(poleX + 60 + fh * 0.3, top - fh / 2, fh * 0.1, "#fcd116");
}

// A pole sign with a round icon on top (for the restaurants)
function poleSign(p, px, h, r, color, icon) {
  p.R(px - 60, 0, 120, h, "#6b7280");
  p.C(px, h + r * 0.6, r, "#ffffff");
  p.C(px, h + r * 0.6, r * 0.88, color);
  icon(px, h + r * 0.6, r * 0.6);
}

// A palm tree (used in Calamba and at the resorts)
function drawPalm(p, x0, h) {
  for (let i = 0; i < 10; i++) {                      // trunk bends a little
    const bend = Math.sin(i / 10 * 1.4) * h * 0.08;
    p.R(x0 + bend - (90 - i * 4), (i * h) / 10, (180 - i * 8), h / 10 + 15, i % 2 ? "#8d6e63" : "#795548");
  }
  const tx = x0 + Math.sin(1.4) * h * 0.08, ty = h;
  const leaves = [[-1, 0.2], [-0.8, -0.25], [-0.4, -0.5], [0.4, -0.5], [0.8, -0.25], [1, 0.2], [0, 0.35]];
  leaves.forEach(([dx, dy], i) => {
    const L = h * 0.42;
    p.P(i % 2 ? "#2e7d32" : "#43a047", [tx, ty + 40, tx + dx * L * 0.5, ty + 40 + Math.abs(dx) * 120 + dy * L * 0.2 + 160,
      tx + dx * L, ty + dy * L, tx + dx * L * 0.5, ty + dy * L * 0.2 - 60]);
  });
  p.C(tx - 70, ty - 40, 70, "#6d4c41");
  p.C(tx + 70, ty - 50, 70, "#5d4037");
}

// Small icons for the restaurant signs
const icons = {
  burger(p, x, y, r) {
    p.E(x, y + r * 0.35, r, r * 0.55, "#d4904a");
    for (const d of [-0.4, 0, 0.4]) p.C(x + d * r, y + r * 0.55, r * 0.06, "#fff3d6");
    p.R(x - r, y - r * 0.05, r * 2, r * 0.18, "#4caf50");
    p.R(x - r * 0.95, y - r * 0.32, r * 1.9, r * 0.28, "#5d3a1a");
    p.R(x - r * 0.9, y - r * 0.6, r * 1.8, r * 0.28, "#d4904a");
  },
  drumstick(p, x, y, r) {
    p.E(x - r * 0.15, y + r * 0.15, r * 0.7, r * 0.5, "#c47a2c", -0.6);
    p.R(x + r * 0.25, y - r * 0.55, r * 0.22, r * 0.6, "#fff8e1");
    p.C(x + r * 0.3, y - r * 0.65, r * 0.15, "#fff8e1");
    p.C(x + r * 0.5, y - r * 0.6, r * 0.15, "#fff8e1");
  },
  bucket(p, x, y, r) {
    for (const d of [-0.5, -0.15, 0.2, 0.5]) p.C(x + d * r, y + r * 0.45, r * 0.28, "#c47a2c");
    p.P("#ffffff", [x - r * 0.75, y + r * 0.4, x + r * 0.75, y + r * 0.4, x + r * 0.55, y - r * 0.8, x - r * 0.55, y - r * 0.8]);
    for (const d of [-0.35, 0, 0.35]) p.R(x + d * r - r * 0.08, y - r * 0.75, r * 0.16, r * 1.1, "#1e40af");
  },
};

// Every landmark: w = width (world units), draw(p, obj) draws it.
// p is a landPainter; obj.variant (0–1) gives small random differences.
const LANDMARKS = {
  // Calauan's giant pineapple on a round plaza
  pineapple: { w: 4600, draw(p) {
    p.E(0, 120, 2300, 260, "#cfc8b8");
    p.E(0, 170, 2050, 200, "#ebe7df");
    for (let i = 0; i < 14; i++) p.C(-1800 + i * 277, 200, 70, i % 2 ? "#f472b6" : "#facc15"); // flowers
    p.box(-550, 1100, 750, 500, "#d6cfc0", "#b8b09e", "#e8e2d6", 100);
    p.E(0, 2050, 820, 1180, "#f2b632");
    ctx.save();                                        // diamond pattern inside the pineapple
    p.E(0, 2050, 820, 1180, "rgba(0,0,0,0)");
    ctx.clip();
    ctx.strokeStyle = "#c98a12";
    ctx.lineWidth = Math.max(1, 55 * p.k);
    for (let i = -6; i <= 6; i++) {
      p.curve("#c98a12", 55, [i * 300 - 1200, 800, i * 300 - 800, 1500, i * 300, 2300, i * 300 + 1200, 3300]);
      p.curve("#c98a12", 55, [i * 300 + 1200, 800, i * 300 + 800, 1500, i * 300, 2300, i * 300 - 1200, 3300]);
    }
    p.R(0, 800, 900, 2600, "rgba(120,60,0,0.15)");     // shadow on the right half
    ctx.restore();
    const leaf = [[-700, 3700], [-380, 4250], [-120, 4500], [150, 4450], [420, 4200], [720, 3650], [0, 3900]];
    leaf.forEach(([lx, ly], i) => p.P(i % 2 ? "#2f7d38" : "#43a047", [-170, 3100, 170, 3100, lx, ly]));
    for (const bx of [-2000, 1500]) p.R(bx, 130, 500, 90, "#8b5a2b"); // benches
  }},

  // Farm: red barn, silo, fence and pineapple plants
  farm: { w: 6200, draw(p) {
    p.box(-2300, 2200, 1700, 2600, "#c0392b", "#962d22", "#7f2a1f");
    p.P("#c0392b", [-2300, 1700, -1200, 2550, -100, 1700]);
    p.P("#7f2a1f", [-2400, 1650, -1200, 2650, 0, 1650, -100, 1650, -1200, 2520, -2300, 1650]);
    p.R(-1500, 1850, 600, 380, "#f5f5f5");
    p.R(-1450, 1900, 500, 280, "#3e2723");
    p.R(-1800, 0, 1200, 1250, "#8e2b20");              // big door with a white X
    p.R(-1800, 1180, 1200, 70, "#f5f5f5");
    p.curve("#f5f5f5", 70, [-1780, 20, -1500, 400, -900, 900, -620, 1170]);
    p.curve("#f5f5f5", 70, [-620, 20, -900, 400, -1500, 900, -1780, 1170]);
    p.box(200, 750, 2700, 750, "#c5ccd3", "#9aa3ab", null);   // silo
    p.E(575, 2700, 375, 280, "#9aa3ab");
    for (let i = 0; i < 4; i++) p.R(200, 500 + i * 600, 750, 40, "#aab3bb");
    for (let i = 0; i < 16; i++) {                     // pineapple plants in front
      const px = -2900 + i * 380;
      p.P("#3f9e46", [px - 140, 0, px + 140, 0, px, 330]);
      p.P("#2f7d38", [px - 160, 0, px - 40, 0, px - 200, 260]);
      p.P("#2f7d38", [px + 40, 0, px + 160, 0, px + 200, 260]);
    }
    for (let i = 0; i < 16; i++) p.R(-3000 + i * 400, 0, 70, 560, "#8b5a2b"); // fence
    p.R(-3000, 380, 6100, 60, "#a0522d");
    p.R(-3000, 200, 6100, 60, "#a0522d");
  }},

  // Fast-food restaurants (original names; no real brand logos)
  burger: { w: 4200, draw(p) {
    p.box(-2000, 3600, 1700, 3000, "#fff4e0", "#e9dcc3", "#d9c8a8");
    p.R(-2050, 1450, 3700, 380, "#e8590c");
    p.T("BURGER HUB", -200, 1640, 260, "#ffffff");
    p.windows(-1800, 250, 2, 1, 1100, 900, 200, 0, "#9fd3ea", "#e8590c");
    p.R(800, 0, 550, 1150, "#5b3b1f");
    p.R(870, 60, 410, 1000, "#9fd3ea");
    poleSign(p, 2000, 3000, 600, "#e8590c", (x, y, r) => icons.burger(p, x, y, r));
  }},
  chicken: { w: 4200, draw(p) {
    p.box(-2000, 3600, 1800, 3000, "#fff8d6", "#ece2b0", "#dccf94");
    p.R(-2050, 1550, 3700, 380, "#2e9e4f");
    p.T("MANOK KING", -200, 1740, 260, "#fff8d6");
    p.windows(-1800, 250, 2, 1, 1100, 950, 200, 0, "#9fd3ea", "#2e9e4f");
    p.R(800, 0, 550, 1200, "#2e7d32");
    p.R(870, 60, 410, 1050, "#9fd3ea");
    poleSign(p, 2000, 3100, 600, "#facc15", (x, y, r) => icons.drumstick(p, x, y, r));
  }},
  bucket: { w: 4200, draw(p) {
    p.box(-2000, 3600, 1800, 3000, "#ffffff", "#e2e8f0", "#cbd5e1");
    for (let i = 0; i < 9; i++) p.R(-2050 + i * 411, 1500, 205, 450, "#1e40af"); // striped band
    p.R(-1500, 1580, 2700, 300, "#ffffff");
    p.T("CRISPY BUCKET", -150, 1730, 230, "#1e40af");
    p.windows(-1800, 250, 2, 1, 1100, 950, 200, 0, "#9fd3ea", "#1e40af");
    p.R(800, 0, 550, 1200, "#1e3a8a");
    p.R(870, 60, 410, 1050, "#9fd3ea");
    poleSign(p, 2000, 3100, 600, "#1e40af", (x, y, r) => icons.bucket(p, x, y, r));
  }},

  // Old stone church with a bell tower
  church: { w: 5600, draw(p) {
    p.box(-1700, 4300, 2700, 3200, "#efe3c8", "#d6c7a6", "#c9b791");   // main church
    p.P("#efe3c8", [-1700, 2700, 450, 3700, 2600, 2700]);
    p.P("#d9c7a2", [-1700, 2700, 450, 3700, 2600, 2700, 2450, 2700, 450, 3560, -1550, 2700]);
    p.R(415, 3700, 70, 600, "#5d4037");                // cross
    p.R(270, 4000, 360, 70, "#5d4037");
    for (const cx of [-1500, -900, 1650, 2250]) p.R(cx, 0, 160, 2700, "#e2d4b4"); // columns
    for (let i = 1; i < 6; i++) p.R(-1700, i * 450, 4300, 18, "rgba(150,120,80,0.25)"); // stone lines
    p.R(0, 0, 900, 1400, "#6d4c2f");                   // arched wooden door
    p.C(450, 1400, 450, "#6d4c2f");
    p.R(440, 0, 20, 1700, "#4e342e");
    p.C(450, 2950, 330, "#bca37a");                    // round window
    p.C(450, 2950, 260, "#90caf9");
    p.R(-600, 1800, 350, 600, "#90caf9");
    p.C(-425, 2400, 175, "#90caf9");
    p.R(1150, 1800, 350, 600, "#90caf9");
    p.C(1325, 2400, 175, "#90caf9");
    p.R(-600, 0, 2100, 120, "#cfc2a3");                // steps
    // bell tower (drawn last so it stays in front)
    p.box(-2900, 1150, 4300, 1200, "#e6d8b8", "#cdbd98", "#b9a77f");
    p.P("#8d6e63", [-2950, 4300, -1700, 4300, -2325, 5000]);
    p.R(-2360, 5000, 70, 500, "#5d4037");
    p.R(-2480, 5250, 310, 70, "#5d4037");
    for (const ty of [2400, 3400]) {
      p.R(-2550, ty, 450, 650, "#3e2723");
      p.C(-2325, ty + 650, 225, "#3e2723");
    }
  }},

  // PUP Calauan campus (maroon and gold), 3 floors with a columned entrance
  pup: { w: 9000, draw(p) {
    p.box(-3800, 7200, 3300, 4000, "#f3ead7", "#d9cdb4", "#7b1c1c");
    p.windows(-3550, 300, 3, 3, 650, 650, 300, 300, "#9fd3ea", "#7b1c1c");
    p.windows(850, 300, 3, 3, 650, 650, 300, 300, "#9fd3ea", "#7b1c1c");
    for (let f = 1; f < 3; f++) p.R(-3800, f * 950 + 120, 7200, 60, "#e2d6bd");   // floor lines
    p.R(-3850, 3050, 7300, 330, "#7b1c1c");
    p.T("POLYTECHNIC UNIVERSITY OF THE PHILIPPINES", -200, 3215, 190, "#d4a017");
    p.R(-1000, 0, 1700, 3050, "#ece1c8");                // entrance hall
    for (const cx of [-900, -480, -60, 360, 600]) p.R(cx - 60, 0, 120, 3050, "#ffffff"); // columns
    p.P("#7b1c1c", [-1250, 3380, -150, 4150, 950, 3380]);
    p.P("#d4a017", [-1100, 3420, -150, 4030, 800, 3420, 700, 3420, -150, 3960, -1000, 3420]);
    p.T("PUP", -150, 3640, 300, "#d4a017");
    phFlag(p, 3800, 5000, 1200);
    p.R(-1550, 0, 260, 1600, "#7b1c1c");               // front gate
    p.R(950, 0, 260, 1600, "#7b1c1c");
    p.R(-1700, 1450, 3060, 480, "#7b1c1c");
    p.R(-1650, 1500, 2960, 380, "#d4a017");
    p.T("PUP CALAUAN CAMPUS", -170, 1690, 240, "#7b1c1c");
    p.R(-3800, 0, 2250, 380, "#e7dcc4");               // low wall
    p.R(1210, 0, 2190, 380, "#e7dcc4");
  }},

  // Hospital with a big H sign and an ambulance
  hospital: { w: 5000, draw(p) {
    p.box(-2300, 4600, 4200, 3500, "#f8fafc", "#dfe5ea", "#cbd5e1");
    p.windows(-2000, 1500, 6, 3, 450, 550, 300, 300, "#9fd3ea");
    p.R(-2350, 3600, 4700, 350, "#1d4ed8");
    p.T("BAY HOSPITAL", 0, 3775, 260, "#ffffff");
    p.R(-450, 4200, 900, 900, "#1d4ed8");
    p.R(-280, 4330, 140, 640, "#ffffff");              // the letter H made of bars
    p.R(140, 4330, 140, 640, "#ffffff");
    p.R(-140, 4580, 280, 140, "#ffffff");
    p.R(-1300, 1100, 2600, 200, "#1d4ed8");            // entrance roof
    p.R(-1250, 0, 100, 1100, "#94a3b8");
    p.R(1150, 0, 100, 1100, "#94a3b8");
    p.R(-700, 0, 1400, 1000, "#bae6fd");
    p.R(-20, 0, 40, 1000, "#94a3b8");
    p.T("EMERGENCY", 0, 1200, 150, "#ffffff");
    p.box(1500, 1100, 650, 1600, "#ffffff", "#e2e8f0", "#f1f5f9");    // ambulance
    p.R(1500, 300, 1100, 90, "#ef4444");
    p.R(1650, 650, 150, 70, "#ef4444");
    p.R(2300, 650, 150, 70, "#3b82f6");
    p.C(1700, 0, 110, "#151515");
    p.C(2400, 0, 110, "#151515");
  }},

  // Small coffee shop with a striped awning and outdoor tables
  cafe: { w: 3200, draw(p) {
    p.box(-1300, 2600, 1600, 2000, "#8d6e63", "#6d4c41", "#5d4037");
    p.R(-1100, 200, 1300, 850, "#ffe0b2");
    p.R(-1100, 600, 1300, 30, "#8d6e63");
    p.R(450, 0, 550, 1100, "#4e342e");
    p.R(520, 80, 410, 900, "#ffcc80");
    for (let i = 0; i < 10; i++) {                     // striped awning
      const ax = -1350 + i * 270;
      p.P(i % 2 ? "#ffffff" : "#e53935", [ax, 1350, ax + 270, 1350, ax + 300, 1100, ax + 30, 1100]);
    }
    p.R(-1000, 1400, 2000, 300, "#3e2723");
    p.R(-170, 1450, 300, 200, "#ffcc80");              // coffee cup on the board
    p.C(170, 1550, 60, "#ffcc80");
    p.R(-230, 1440, 420, 30, "#ffcc80");
    for (const tx of [1500]) {                         // table with umbrella
      p.R(tx - 25, 0, 50, 900, "#eeeeee");
      p.P("#43a047", [tx - 500, 800, tx + 500, 800, tx, 1150]);
      p.R(tx - 250, 300, 500, 50, "#6d4c41");
      p.R(tx - 30, 0, 60, 300, "#6d4c41");
    }
    p.R(1700, 1300, 30, 400, "#3e2723");               // little cup sign
    p.R(1580, 1750, 260, 260, "#ffffff");
    p.C(1890, 1880, 70, "#ffffff");
    p.R(1600, 1980, 220, 50, "#6d4c41");
  }},

  // Big mall with a glass front
  mall: { w: 9000, draw(p, o) {
    const accent = o.variant < 0.5 ? "#be123c" : "#0e7490";
    p.box(-4300, 8600, 2700, 4000, "#e2e8f0", "#cbd5e1", "#94a3b8");
    p.R(-4100, 0, 8200, 1300, "#7dd3fc");
    for (let i = 0; i <= 16; i++) p.R(-4100 + i * 512, 0, 40, 1300, "#e2e8f0");
    p.R(-4300, 1300, 8600, 150, "#94a3b8");
    const colors = ["#f59e0b", "#10b981", "#8b5cf6", "#ef4444"];
    for (let i = 0; i < 4; i++) p.R(-4000 + i * 2100, 1600, 1700, 800, colors[i]);
    p.R(-2000, 1650, 4000, 750, accent);
    p.R(-350, 1800, 700, 520, "#ffffff");              // shopping bag icon
    p.R(-200, 2320, 50, 180, "#ffffff");
    p.R(150, 2320, 50, 180, "#ffffff");
    p.R(-200, 2460, 400, 50, "#ffffff");
    p.R(-1200, 1300, 2400, 180, accent);               // entrance roof
    p.R(-800, 0, 1600, 1100, "#bae6fd");
  }},

  // School building with flag, clock and wall
  school: { w: 7000, draw(p) {
    p.box(-3300, 6600, 2300, 3200, "#fefce8", "#e7e5c8", "#b45309");
    p.windows(-3000, 300, 8, 2, 500, 650, 280, 350, "#9fd3ea", "#1d4ed8");
    p.R(-3350, 2200, 6700, 300, "#b91c1c");
    p.T("LOS BAÑOS NATIONAL HIGH SCHOOL", 0, 2350, 180, "#ffffff");
    p.P("#b91c1c", [-700, 2500, 0, 3100, 700, 2500]);
    p.C(0, 2730, 230, "#ffffff");                      // clock
    p.R(-12, 2730, 24, 170, "#1f2937");
    p.R(0, 2718, 130, 24, "#1f2937");
    phFlag(p, -3800, 3900, 1000);
    p.R(-3300, 0, 2700, 400, "#e7e5c8");               // wall with open gate
    p.R(600, 0, 2700, 400, "#e7e5c8");
    p.R(-600, 0, 80, 900, "#1d4ed8");
    p.R(520, 0, 80, 900, "#1d4ed8");
  }},

  // Calamba water park: tower, 3 water slides and a pool
  slides: { w: 7600, draw(p) {
    p.E(400, 180, 3300, 380, "#0ea5e9");
    p.E(400, 220, 3000, 280, "#38bdf8");
    for (const [rx, ry] of [[-900, 220], [700, 160], [1900, 240]]) p.E(rx, ry, 300, 50, "#bae6fd");
    p.box(-3300, 1100, 3200, 1100, "#f59e0b", "#d97706", "#b45309");   // tower
    for (let i = 0; i < 6; i++) p.R(-3300, 400 + i * 480, 1100, 50, "#b45309");
    p.P("#ef4444", [-3450, 3200, -2050, 3200, -2750, 3900]);
    p.curve("#ef4444", 300, [-2300, 3000, -800, 3300, -2000, 1600, -700, 1400, 300, 1250, 0, 600, 500, 300]);
    p.curve("#fca5a5", 90, [-2300, 3050, -800, 3350, -2000, 1650, -700, 1450, 300, 1300, 0, 650, 500, 350]);
    p.curve("#22c55e", 300, [-2300, 2500, -500, 2600, 600, 2300, 900, 1500, 1200, 800, 2000, 900, 2100, 300]);
    p.curve("#86efac", 90, [-2300, 2550, -500, 2650, 600, 2350, 900, 1550, 1200, 850, 2000, 950, 2100, 350]);
    p.curve("#3b82f6", 300, [-2250, 1900, -1200, 2000, -1600, 1100, -800, 900, -200, 750, -900, 400, -600, 250]);
    for (const [px, ph] of [[-1100, 1500], [600, 2300], [1500, 900]]) p.R(px, 0, 70, ph, "#e5e7eb"); // supports
    for (const [hx, hc] of [[-300, "#f472b6"], [1100, "#facc15"], [2600, "#22c55e"]]) { // swimmers
      p.C(hx, 260, 110, "#c68642");
      p.R(hx - 110, 300, 220, 70, hc);
    }
    p.C(1800, 230, 200, "#ef4444");                    // swim ring
    p.C(1800, 230, 110, "#38bdf8");
    drawPalm(p, 3300, 3000);
  }},

  // Resort pool with umbrellas, loungers and palm trees
  pool: { w: 6600, draw(p) {
    p.P("#e0f2fe", [-3000, 0, 3000, 0, 2600, 650, -2600, 650]);
    p.P("#0ea5e9", [-2800, 60, 2800, 60, 2450, 580, -2450, 580]);
    for (const [rx, ry] of [[-1200, 300], [400, 420], [1700, 220]]) p.E(rx, ry, 350, 45, "#7dd3fc");
    for (const [hx, hc] of [[-500, "#f97316"], [900, "#a855f7"]]) {
      p.C(hx, 330, 110, "#c68642");
      p.R(hx - 110, 360, 220, 60, hc);
    }
    const ub = [["#ef4444", "#ffffff"], ["#3b82f6", "#facc15"], ["#22c55e", "#ffffff"]];
    [-1900, 0, 1900].forEach((ux, i) => {              // umbrellas
      p.R(ux - 25, 650, 50, 1200, "#e5e7eb");
      for (let s = 0; s < 4; s++) {
        p.P(ub[i][s % 2], [ux - 700 + s * 350, 1700, ux - 350 + s * 350, 1700, ux, 2100]);
      }
      p.R(ux - 450, 650, 900, 120, "#ffffff");          // lounger
    });
    drawPalm(p, -3100, 2800);
    drawPalm(p, 3100, 3200);
    p.box(1200, 1500, 1100, 1200, "#d7b98e", "#c4a272", null, 650);   // cottage
    p.P("#a1887f", [1000, 1750, 2900, 1750, 1950, 2500]);
  }},

  palm: { w: 1800, draw(p, o) { drawPalm(p, 0, 2600 + o.variant * 1200); } },

  // Bahay kubo (nipa hut) on stilts
  kubo: { w: 3000, draw(p) {
    for (const sx of [-950, -300, 300, 950]) p.R(sx - 50, 0, 100, 550, "#795548");
    p.box(-1000, 2000, 1200, 1300, "#d7b98e", "#c4a272", null, 500);
    for (let i = 0; i < 12; i++) p.R(-1000 + i * 170, 500, 20, 1200, "#b08d57");
    p.R(-600, 900, 500, 450, "#5d4037");
    p.R(300, 500, 450, 800, "#8d6e63");
    p.P("#b08d57", [-1450, 1600, 1450, 1600, 0, 2700]);
    for (let i = 1; i < 5; i++) p.R(-1450 + i * 150, 1600 + i * 210, 2900 - i * 300, 25, "#8d6e63");
    for (let i = 0; i < 4; i++) p.R(400, i * 130, 350, 30, "#795548");   // ladder
  }},

  // Pineapple field: rows of plants with fruits and a scarecrow
  pinefield: { w: 4400, draw(p) {
    for (let row = 2; row >= 0; row--) {
      for (let i = 0; i < 10; i++) {
        const px = -2000 + i * 440 + (row % 2) * 220, py = row * 120;
        p.P("#2f7d38", [px - 180, py, px + 180, py, px - 230, py + 300]);
        p.P("#3f9e46", [px - 150, py, px + 150, py, px, py + 420]);
        p.P("#2f7d38", [px - 180, py, px + 180, py, px + 230, py + 300]);
        if ((i + row) % 3 === 0) p.E(px, py + 230, 90, 130, "#f2b632");
      }
    }
    p.R(1800, 0, 60, 1500, "#795548");                 // scarecrow
    p.R(1550, 1100, 560, 60, "#795548");
    p.R(1700, 800, 260, 450, "#1d4ed8");
    p.C(1830, 1400, 120, "#f5deb3");
    p.P("#b08d57", [1650, 1450, 2010, 1450, 1830, 1650]);
  }},

  // Colorful house with a pointed roof
  house: { w: 3000, draw(p, o) {
    const walls = [["#fde68a", "#e7cf6f"], ["#bfdbfe", "#9fbde0"], ["#fecaca", "#e5a9a9"], ["#d9f99d", "#bcd97e"]];
    const [wall, wallSide] = walls[Math.floor(o.variant * walls.length)];
    const roof = o.variant < 0.5 ? "#b91c1c" : "#1e3a8a";
    p.box(-1300, 2600, 1600, 2000, wall, wallSide, null);
    p.P(roof, [-1500, 1550, 1500, 1550, 0, 2500]);
    p.R(-1000, 400, 650, 650, "#ffffff");
    p.R(-950, 450, 550, 550, "#9fd3ea");
    p.R(300, 0, 600, 1150, "#8d6e63");
    p.C(780, 550, 40, "#facc15");
    for (const fx of [-1250, -350]) p.E(fx, 150, 250, 180, "#4caf50");   // plants
  }},

  // Sari-sari store (small neighborhood shop)
  store: { w: 2800, draw(p) {
    p.box(-1200, 2400, 1500, 1800, "#f5f5f4", "#d6d3d1", "#a8a29e");
    p.P("#2563eb", [-1400, 1500, 1400, 1500, 1250, 1750, -1250, 1750]);
    p.R(-1000, 450, 2000, 850, "#57534e");
    for (let i = 0; i < 9; i++) p.R(-1000 + i * 250, 450, 30, 850, "#a8a29e");   // window grill
    const goods = ["#ef4444", "#facc15", "#22c55e", "#f97316", "#38bdf8"];
    for (let i = 0; i < 14; i++) p.R(-900 + (i % 7) * 270, 600 + Math.floor(i / 7) * 350, 160, 220, goods[i % 5]);
    p.R(-1100, 1750, 2200, 380, "#fef08a");
    p.T("SARI-SARI STORE", 0, 1940, 210, "#b91c1c");
    p.R(-1100, 150, 2200, 120, "#8d6e63");             // bench
  }},
};

// Draws a palm tree in place of a normal roadside tree (Calamba)
function drawPalmTree(x, y, size) {
  drawPalm(landPainter(x, y, size / 3600), 0, 3000);
}

// ----- 14c. MORE LANDMARKS: Bay, Calamba and street vendors -----
Object.assign(LANDMARKS, {
  // Bay garden shop: shade net, rows of potted plants and flowers
  garden: { w: 6400, big: true, draw(p) {
    for (const px of [-2900, -1000, 1000, 2900]) p.R(px - 50, 0, 100, 2300, "#5d4037");   // poles
    p.P("rgba(20,83,45,0.85)", [-3100, 2300, 3100, 2300, 2900, 2550, -2900, 2550]);    // shade net
    p.R(-3100, 2200, 6200, 120, "#14532d");
    for (let i = 0; i < 8; i++) {                      // hanging orchid baskets
      const hx = -2700 + i * 770;
      p.R(hx - 5, 1700, 10, 500, "#3e2723");
      p.E(hx, 1650, 160, 90, "#8d6e63");
      p.C(hx - 60, 1760, 70, i % 2 ? "#e879f9" : "#f9a8d4");
      p.C(hx + 60, 1780, 60, "#c084fc");
    }
    p.R(-3000, 600, 6000, 90, "#8d6e63");              // plant shelf
    const flowers = ["#ef4444", "#facc15", "#f472b6", "#fb923c", "#a855f7", "#ffffff"];
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 11; i++) {
        const px = -2800 + i * 560 + row * 200, py = row === 0 ? 690 : 0;
        p.P("#c2410c", [px - 170, py, px + 170, py, px + 220, py + 320, px - 220, py + 320]);  // clay pot
        p.R(px - 230, py + 300, 460, 60, "#9a3412");
        p.E(px, py + 560, 260, 260, i % 3 ? "#16a34a" : "#15803d");
        p.E(px - 120, py + 700, 140, 200, "#22c55e");
        if ((i + row) % 2 === 0) for (const [fx, fy] of [[-90, 650], [80, 720], [0, 800]]) p.C(px + fx, py + fy, 70, flowers[(i + row) % 6]);
      }
    }
    p.box(2300, 1100, 1200, 900, "#d7b98e", "#c4a272", null);   // little cashier hut
    p.P("#b08d57", [2150, 1200, 3550, 1200, 2850, 1700]);
    p.R(2500, 400, 700, 450, "#5d4037");
  }},

  // Monay bakery: warm window full of bread, a big bread sign, bread baskets
  bakery: { w: 4600, big: true, draw(p) {
    p.box(-2100, 4200, 2100, 3000, "#fef3c7", "#ead9a7", "#c2410c");
    p.R(-2150, 1900, 4300, 380, "#92400e");            // brown roof band
    for (let i = 0; i < 12; i++) p.P(i % 2 ? "#fde68a" : "#b45309",   // striped awning
      [-2150 + i * 358, 1650, -2150 + (i + 1) * 358, 1650, -2120 + (i + 1) * 358, 1400, -2120 + i * 358, 1400]);
    p.R(-1900, 250, 2600, 1100, "#fde68a");            // glowing display window
    p.R(-1900, 700, 2600, 40, "#b45309");
    for (let shelf = 0; shelf < 2; shelf++) {          // monay and pandesal on shelves
      for (let i = 0; i < 7; i++) {
        const bx = -1700 + i * 360, by = 330 + shelf * 450;
        p.E(bx, by + 110, 150, 110, "#d97706");
        p.E(bx, by + 140, 110, 70, "#f59e0b");
        p.R(bx - 6, by + 60, 12, 150, "#92400e");      // the line on top of a monay
      }
    }
    p.R(900, 0, 600, 1300, "#78350f");
    p.R(970, 60, 460, 1150, "#fcd34d");
    p.E(0, 2650, 900, 380, "#d97706");                 // big bread sign on the roof
    p.E(0, 2720, 700, 240, "#f59e0b");
    p.R(-25, 2400, 50, 520, "#92400e");
    for (const bx of [-2600, 2550]) {                  // bread baskets outside
      p.P("#a16207", [bx - 300, 0, bx + 300, 0, bx + 380, 350, bx - 380, 350]);
      for (const d of [-180, 0, 180]) p.E(bx + d, 420, 120, 90, "#d97706");
    }
  }},

  // Rizal Shrine (Calamba): stone ground floor, green wooden upper floor with
  // capiz windows, red tile roof, garden and a statue
  rizal: { w: 7600, big: true, draw(p) {
    p.box(-3000, 6000, 1500, 2600, "#f5f0e6", "#ddd5c3", null);          // stone ground floor
    for (const ax of [-2200, -600, 1000]) {            // arched openings
      p.R(ax, 0, 900, 900, "#5d4037");
      p.C(ax + 450, 900, 450, "#5d4037");
    }
    for (let i = 1; i < 4; i++) p.R(-3000, i * 360, 6000, 15, "rgba(120,100,70,0.2)");
    p.box(-3200, 6400, 1600, 2800, "#2e7d32", "#1b5e20", null, 1500);   // green upper floor
    for (let i = 0; i < 6; i++) {                      // capiz windows (small square panes)
      const wx = -3000 + i * 1050;
      p.R(wx, 1750, 850, 1050, "#1b5e20");
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        p.R(wx + 40 + c * 200, 1790 + r * 250, 170, 220, "#f5f0dc");
      }
      p.R(wx, 1600, 850, 120, "#a5d6a7");              // ventanilla below the window
    }
    p.P("#9a3412", [-3600, 3100, 3600, 3100, 2800, 4100, -2800, 4100]);  // tile roof
    for (let i = 1; i < 5; i++) p.R(-3600 + i * 160, 3100 + i * 200, 7200 - i * 320, 30, "#7c2d12");
    p.R(-3400, 0, 6800, 300, "#2e7d32");                // hedge
    p.R(3700, 0, 900, 700, "#9e9e9e");                  // statue on a pedestal
    p.R(3800, 700, 700, 120, "#bdbdbd");
    p.R(4010, 820, 280, 900, "#37474f");
    p.R(3950, 1300, 400, 420, "#37474f");
    p.C(4150, 1850, 140, "#37474f");
    for (const fx of [-3700, -3300]) p.E(fx, 300, 300, 300, "#43a047");
  }},

  // Taho vendor carrying two buckets on a pole
  taho: { w: 1400, draw(p) {
    p.R(-560, 950, 1120, 50, "#8d6e63");                // pole across the shoulder
    for (const bx of [-450, 450]) {
      p.R(bx - 5, 500, 10, 450, "#cfd4d9");
      p.R(bx - 180, 0, 360, 520, "#cbd5e1");            // aluminum buckets
      p.R(bx - 180, 470, 360, 60, "#e2e8f0");
      p.R(bx - 130, 60, 40, 400, "rgba(255,255,255,0.5)");
    }
    p.R(-110, 0, 90, 500, "#1e293b");                   // vendor
    p.R(20, 0, 90, 500, "#1e293b");
    p.R(-150, 480, 300, 520, "#f97316");
    p.C(0, 1150, 130, "#c68642");
    p.P("#fde68a", [-260, 1200, 260, 1200, 0, 1420]);   // salakot hat
  }},

  // Fishball cart: wooden cart, pan, umbrella
  fishball: { w: 1800, draw(p) {
    p.C(-550, 200, 200, "#1f2937");
    p.C(550, 200, 200, "#1f2937");
    p.box(-800, 1600, 900, 600, "#a16207", "#854d0e", "#ca8a04", 200);
    p.R(-700, 500, 1400, 40, "#854d0e");
    p.E(-200, 1180, 380, 90, "#374151");               // frying pan with fishballs
    for (const fx of [-380, -260, -140, -20]) p.C(fx, 1220, 55, "#d97706");
    p.R(300, 1100, 300, 200, "#e5e7eb");                // sauce jars
    p.R(320, 1120, 110, 160, "#b45309");
    p.R(460, 1120, 110, 160, "#dc2626");
    p.R(-20, 1100, 40, 1100, "#9ca3af");                // umbrella
    const um = ["#ef4444", "#facc15", "#3b82f6", "#22c55e"];
    for (let i = 0; i < 4; i++) p.P(um[i], [-900 + i * 450, 2100, -450 + i * 450, 2100, 0, 2500]);
  }},

  // Sorbetes (ice cream) cart: colorful wooden cart with three lids and a bell
  sorbetes: { w: 1600, draw(p) {
    p.C(-500, 220, 220, "#1f2937");
    p.C(500, 220, 220, "#1f2937");
    p.box(-750, 1500, 900, 600, "#ec4899", "#be185d", null, 250);
    p.R(-750, 650, 1500, 160, "#facc15");
    p.R(-750, 450, 1500, 120, "#3b82f6");
    for (const lx of [-450, 0, 450]) {                  // three lids
      p.E(lx, 1150, 200, 90, "#fef3c7");
      p.C(lx, 1260, 50, "#dc2626");
    }
    p.R(650, 1150, 30, 400, "#6b7280");                 // bell
    p.C(665, 1580, 80, "#facc15");
    p.R(-20, 1150, 40, 900, "#9ca3af");
    p.P("#fde047", [-650, 1950, 650, 1950, 0, 2300]);
  }},
});

// ----- 14d. WELCOME ARCH, CAUTION SIGN, PEOPLE and the CROSSING -----
Object.assign(LANDMARKS, {
  // Big welcome arch over the road when you reach a new place
  welcome: { w: 6400, draw(p, o) {
    for (const px of [-2930, 2670]) {                  // two pillars beside the road
      p.R(px, 0, 260, 2000, "#e7e5e4");
      p.R(px + 180, 0, 80, 2000, "#a8a29e");           // shaded side
      for (let i = 0; i < 5; i++) p.R(px, 250 + i * 330, 260, 110, i % 2 ? "#1d4fbf" : "#d62828");
      p.R(px - 60, 1950, 380, 110, "#78716c");
    }
    p.R(-3250, 1800, 6500, 950, "#7f1220");           // the big sign board
    p.R(-3250, 1800, 6500, 70, "#f9c80e");
    p.R(-3250, 2680, 6500, 70, "#f9c80e");
    for (let i = 0; i < 26; i++) {                     // jeepney stripes on top
      p.R(-3250 + i * 250, 2750, 250, 90, ["#d62828", "#f9c80e", "#1d4fbf"][i % 3]);
    }
    p.C(0, 3010, 240, "#f9c80e");                      // sun on top of the arch
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI;
      p.P("#f9c80e", [0, 3010, Math.cos(a) * 450 - 60 * Math.sin(a), 3010 + Math.sin(a) * 450,
        Math.cos(a) * 450 + 60 * Math.sin(a), 3010 + Math.sin(a) * 450]);
    }
    for (const sx of [-2900, 2900]) p.C(sx, 2280, 110, "#f9c80e");   // stars on the sides
    p.T("WELCOME TO", 0, 2520, 220, "#f9c80e");
    p.T(o.name || "", 0, 2120, 480, "#ffffff");
  }},

  // Yellow caution sign: a person walking (pedestrian crossing ahead)
  caution: { w: 900, draw(p) {
    p.R(-40, 0, 80, 1900, "#9ca3af");                  // pole
    p.P("#111827", [0, 2650, 560, 2090, 0, 1530, -560, 2090]);   // black border diamond
    p.P("#facc15", [0, 2580, 490, 2090, 0, 1600, -490, 2090]);
    p.C(30, 2330, 70, "#111827");                      // walking person icon
    p.P("#111827", [-40, 2240, 80, 2240, 110, 2010, -20, 2010]);
    p.P("#111827", [-20, 2010, 40, 2010, -120, 1780, -190, 1800]);   // back leg
    p.P("#111827", [40, 2010, 100, 2010, 200, 1790, 130, 1770]);     // front leg
    p.P("#111827", [-10, 2200, 20, 2160, -170, 2050, -190, 2090]);   // arm
    p.R(-420, 1300, 840, 230, "#111827");              // plate under the sign
    p.R(-400, 1320, 800, 190, "#facc15");
    p.T("TAWIRAN", 0, 1415, 150, "#111827");
  }},
});

// A person walking across the road (world units: about 520 tall)
function drawPed(ped, x, y, k, fog) {
  const p = landPainter(x, y, k);
  const L = ped.look;
  const walking = ped.delay <= 0 && Math.abs(ped.x) < 1.38;
  const swing = walking ? Math.sin(ped.step * 0.25) * 60 : 0;   // legs and arms swing while walking
  p.E(0, 0, 150, 30, "rgba(0,0,0,0.25)");             // shadow
  p.P(L.pants, [-55, 260, 5, 260, 5 + swing, 0, -55 + swing, 0]);   // legs
  p.P(L.pants, [-5, 260, 55, 260, 55 - swing, 0, -5 - swing, 0]);
  p.R(-65 + swing, 0, 70, 25, "#111827");             // shoes
  p.R(-5 - swing, 0, 70, 25, "#111827");
  if (L.bag) p.R(-95, 290, 190, 170, L.bag);          // backpack
  p.R(-75, 250, 150, 210, L.shirt);                   // body
  p.P(L.shirt, [-75, 440, -105, 430, -95 - swing * 0.6, 270, -70, 280]);   // arms
  p.P(L.shirt, [75, 440, 105, 430, 95 + swing * 0.6, 270, 70, 280]);
  p.C(0, 510, 60, L.skin);                            // head
  p.E(0, 545, 62, 35, L.hair);                        // hair
  if (atmo.rain > 0.4) {                              // umbrella in the rain
    p.R(85, 380, 14, 330, "#374151");
    p.P(ped.look.shirt, [-160, 690, 340, 690, 90, 860]);
  }
}

// Zebra lines painted across the road at the crossing
function drawCrossing(drawn) {
  if (!crossing) return;
  const N = segments.length;
  const first = (Math.floor(crossing.z / SEG_LEN) - 1 + N) % N;   // 1 piece before to 1 after
  for (let i = drawn.length - 1; i >= 0; i--) {
    const seg = drawn[i];
    const off = (seg.index - first + N) % N;
    if (off > 1) continue;                            // the crossing is 2 road pieces long
    const { x: x1, y: y1, w: w1 } = seg.s1;
    const { x: x2, y: y2, w: w2 } = seg.s2;
    const a = 1 - seg.fog * 0.8;
    ctx.globalAlpha = a;
    for (let s = 0; s < 12; s++) {                    // 12 white stripes across the road
      const l = -1 + s * (2 / 12) + 0.03, r = l + 2 / 12 - 0.06;
      poly("#f8fafc", [x1 + l * w1, y1 + 1, x1 + r * w1, y1 + 1, x2 + r * w2, y2, x2 + l * w2, y2]);
    }
    ctx.globalAlpha = 1;
  }
}

// ----- 15. DRAW everything -----
function drawLayer(layer, offset) {
  const x = -(((offset % LAYER_W) + LAYER_W) % LAYER_W);
  ctx.drawImage(layer, x, 0);
  ctx.drawImage(layer, x + LAYER_W, 0);
}

// Where the road disappears on the horizon (updated every frame in drawWorld)
let vanishX = W / 2;

// Where the player's car is on the screen
function playerScreen() {
  const scale = CAM_DEPTH / PLAYER_Z;
  return {
    x: W / 2 + scale * (playerX - cameraX) * ROAD_W * W / 2,
    y: HORIZON + scale * CAM_H * H / 2,
    w: scale * ptype().w * W / 2,
  };
}

// A rectangle with rounded corners (path only; fill or stroke it after)
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Text with a dark outline so it's readable on any background
function outlinedText(text, x, y, size, fill, stroke = "#1e293b", lineW = size / 8) {
  ctx.font = `900 ${size}px 'Trebuchet MS', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = lineW;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

// Icon for each power-up (used on the road and in the corner display)
function drawPowerIcon(kind, x, y, r) {
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#ffffff";
  if (kind === "shield") {
    poly("#ffffff", [x, y - 0.55 * r, x + 0.45 * r, y - 0.35 * r, x + 0.4 * r, y + 0.15 * r,
      x, y + 0.6 * r, x - 0.4 * r, y + 0.15 * r, x - 0.45 * r, y - 0.35 * r]);
  } else if (kind === "magnet") {
    ctx.lineWidth = 0.24 * r;
    ctx.beginPath();
    ctx.moveTo(x - 0.35 * r, y - 0.45 * r);
    ctx.lineTo(x - 0.35 * r, y);
    ctx.arc(x, y, 0.35 * r, Math.PI, 0, true);
    ctx.lineTo(x + 0.35 * r, y - 0.45 * r);
    ctx.stroke();
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(x - 0.47 * r, y - 0.55 * r, 0.24 * r, 0.16 * r);
    ctx.fillRect(x + 0.23 * r, y - 0.55 * r, 0.24 * r, 0.16 * r);
  } else if (kind === "walis") {   // a broom
    ctx.lineWidth = 0.13 * r;
    ctx.beginPath();
    ctx.moveTo(x + 0.45 * r, y - 0.55 * r);
    ctx.lineTo(x - 0.05 * r, y + 0.05 * r);
    ctx.stroke();
    poly("#ffffff", [x - 0.05 * r, y - 0.05 * r, x + 0.12 * r, y + 0.12 * r, x - 0.25 * r, y + 0.6 * r, x - 0.55 * r, y + 0.3 * r]);
  } else {   // slow-mo: a clock
    ctx.lineWidth = 0.13 * r;
    ctx.beginPath();
    ctx.arc(x, y, 0.5 * r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 0.32 * r);
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.25 * r, y + 0.1 * r);
    ctx.stroke();
  }
}

// A floating power-up bubble on the road
function drawPowerUp(kind, x, y, w) {
  const r = w * 0.17;
  const cy = y - r * 1.7 - Math.sin(frame * 0.1) * r * 0.25;   // bobs up and down
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.arc(x, cy, r * 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = POWERS[kind].color;
  ctx.beginPath();
  ctx.arc(x, cy, r, 0, Math.PI * 2);
  ctx.fill();
  drawPowerIcon(kind, x, cy, r);
}

// Turn signal: big blinking orange lights on the side the vehicle is moving to
function drawBlinker(car, sx, sy, w) {
  const moving = Math.abs(car.x - LANE_POS[car.lane]) > 0.02;
  if (car.signal <= 0 && !moving) return;
  if (Math.floor(frame / 10) % 2) return;              // blink: 10 frames on, 10 off
  const dir = car.signal > 0 ? Math.sign(car.nextLane - car.lane) : Math.sign(LANE_POS[car.lane] - car.x);
  const h = VEHICLES[car.type].h;
  const bx = sx + dir * w * 0.46;
  for (const ly of [sy - w * 0.42, sy - w * h * 0.85]) {   // a low light and a high light
    glow(bx, ly, w * 0.5, "255,170,0", 0.85);
    ctx.fillStyle = "#ffb300";
    ctx.fillRect(bx - w * 0.08, ly - w * 0.055, w * 0.16, w * 0.11);
    ctx.fillStyle = "#fff3c4";
    ctx.fillRect(bx - w * 0.04, ly - w * 0.03, w * 0.08, w * 0.06);
  }
}

// Bright brake lights + "PARA!" speech bubble on a stopping jeepney
function drawPara(sx, sy, w) {
  ctx.fillStyle = "rgba(255,40,40,0.6)";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(sx + side * w * 0.44, sy - w * 0.54, w * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }
  const size = Math.max(20, w * 0.3);                  // readable even when far away
  ctx.font = `900 ${size}px 'Trebuchet MS', sans-serif`;
  const tw = ctx.measureText("PARA!").width + size * 0.8;
  const th = size * 1.4;
  const bx = sx - tw / 2;
  const by = sy - w * 1.15 - th - size * 0.5;
  const pop = 1 + Math.sin(frame * 0.3) * 0.04;       // slight wobble
  ctx.save();
  ctx.translate(sx, by + th / 2);
  ctx.scale(pop, pop);
  ctx.translate(-sx, -(by + th / 2));
  ctx.fillStyle = "#ffffff";
  roundRect(bx, by, tw, th, th * 0.4);
  ctx.fill();
  ctx.lineWidth = Math.max(2, size * 0.12);
  ctx.strokeStyle = "#1e293b";
  ctx.stroke();
  poly("#ffffff", [sx - size * 0.3, by + th - 1, sx + size * 0.1, by + th - 1, sx - size * 0.1, by + th + size * 0.5]);
  ctx.fillStyle = "#d62828";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("PARA!", sx, by + th / 2 + 1);
  ctx.restore();
}

// Draws the road, scenery and every vehicle. Returns the list of vehicle
// positions so their lights can glow at night.
function drawWorld() {
  // Sky and background layers (far layers move slower = depth)
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, W, HORIZON + 1);
  drawLayer(cloudLayer, bgOffset * 0.3);
  for (const key in backdrops) {                  // background mountains (they fade)
    if (bgWeight[key] < 0.01) continue;
    ctx.globalAlpha = bgWeight[key];
    drawLayer(backdrops[key], bgOffset * 0.6);
  }
  ctx.globalAlpha = 1 - bgWeight.taal * 0.85;     // fewer hills so Taal Lake shows
  drawLayer(hillLayer, bgOffset);
  ctx.globalAlpha = 1;
  ctx.fillStyle = fogged(COL.grass1, 1);
  ctx.fillRect(0, HORIZON, W, H - HORIZON);

  // --- Road: project the segments from near to far ---
  const base = findSegment(position);
  const basePct = (position % SEG_LEN) / SEG_LEN;
  let x = 0;
  let dx = -base.curve * basePct;
  let maxY = H;
  const drawn = [];

  for (let n = 0; n < DRAW_DIST; n++) {
    const seg = segments[(base.index + n) % segments.length];
    const looped = seg.index < base.index;           // we wrapped round the loop
    const camZ = position - (looped ? TRACK_LEN : 0);
    const camX = cameraX * ROAD_W;

    project(seg.z1, camX - x, camZ, seg.s1);
    project(seg.z2, camX - x - dx, camZ, seg.s2);
    x += dx;               // add up the curves: this is what bends the road
    dx += seg.curve;

    seg.fog = Math.min(1, Math.pow(n / DRAW_DIST, 1.5) * 1.1);
    seg.dist = odo + n * SEG_LEN;          // total distance of this piece of road
    seg.seen = seg.s1.cz > CAM_DEPTH && seg.s2.y < maxY;
    if (!seg.seen) continue;

    drawn.push(seg);
    maxY = seg.s1.y;
  }
  const drawnSet = new Set(drawn);

  if (drawn.length) vanishX = drawn[drawn.length - 1].s2.x;   // the farthest road piece

  // Road pieces are painted far → near so near pieces cover far ones
  for (let i = drawn.length - 1; i >= 0; i--) drawSegment(drawn[i], drawn[i].fog);
  drawFloods(drawn);
  drawCrossing(drawn);

  // --- Sprites: collect everything, then draw far → near ---
  const things = [];
  const lights = [];

  for (const seg of drawn) {
    const loc = locationAt(seg.dist);
    for (const sp of seg.sprites) {
      if (loc.fillers && !sp.keep) continue;   // towns: only a few trees, buildings instead
      const side = Math.sign(sp.offset);
      const insideBuilding = scenery.some((sc) => sc.side === side &&
        seg.dist > sc.at - 2500 && seg.dist < sc.end + 2500);
      if (insideBuilding) continue;
      const sx = seg.s1.x + seg.s1.scale * sp.offset * ROAD_W * W / 2;
      const size = seg.s1.scale * TREE_H * sp.size * W / 2;
      things.push({ depth: seg.s1.cz, fog: seg.fog, draw: () => {
        if (loc.palms) drawPalmTree(sx, seg.s1.y, size);
        else if (sp.type === "tree") drawTree(sx, seg.s1.y, size);
        else drawBush(sx, seg.s1.y, size * 0.5);
      }});
    }
  }

  // Vehicles, coins and power-ups sit between the two ends of their segment
  const placeOnRoad = (obj, drawFn) => {
    const seg = findSegment(obj.z);
    if (!drawnSet.has(seg)) return;
    const t = (obj.z % SEG_LEN) / SEG_LEN;
    const lerp = (a, b) => a + (b - a) * t;
    const scale = lerp(seg.s1.scale, seg.s2.scale);
    const sx = lerp(seg.s1.x, seg.s2.x) + scale * obj.x * ROAD_W * W / 2;
    const sy = lerp(seg.s1.y, seg.s2.y);
    const k = scale * W / 2;                   // screen pixels per world unit here
    things.push({ depth: lerp(seg.s1.cz, seg.s2.cz), fog: seg.fog, draw: () => drawFn(sx, sy, k, seg.fog) });
  };

  for (const car of (clearT > 0 ? [] : cars)) {     // WALIS: no traffic to draw
    placeOnRoad(car, (sx, sy, k, fog) => {
      const w = VEHICLES[car.type].w * k;
      drawVehicle(car, sx, sy, k);
      drawBlinker(car, sx, sy, w);
      if (car.brakeT > 0) drawPara(sx, sy, w);
      lights.push({ x: sx, y: sy, w, fog });
    });
  }
  for (const coin of coins) placeOnRoad(coin, (sx, sy, k) => drawCoin(sx, sy, k * CAR_W));
  if (crossing) {
    for (const ped of crossing.peds) {
      placeOnRoad({ z: crossing.z, x: ped.x }, (sx, sy, k, fog) => drawPed(ped, sx, sy, k, fog));
    }
  }
  for (const sc of scenery) {
    // only PUP keeps its name sign; other buildings have no text
    placeOnRoad(sc, (sx, sy, k) => LANDMARKS[sc.kind].draw(landPainter(sx, sy, k * sc.scale, ["pup", "welcome", "caution"].includes(sc.kind)), sc));
  }
  for (const p of pickups) placeOnRoad(p, (sx, sy, k) => drawPowerUp(p.kind, sx, sy, k * CAR_W));

  // The player (always the same distance in front of the camera)
  things.push({ depth: PLAYER_Z, fog: 0, draw: () => {
    const p = playerScreen();
    const moving = mode === "playing" || mode === "home" || mode === "countdown";
    const bounce = moving && !paused && Math.floor(frame / 5) % 2 ? 1.5 : 0;  // engine wobble
    const blinkOff = invulnT > 0 && Math.floor(frame / 4) % 2;               // flicker after the shield breaks
    if (!blinkOff) drawPlayerVehicle(ptype(), p.x, p.y - bounce, p.w);
    if (shield) {            // see-through bubble around the car
      ctx.strokeStyle = `rgba(56,189,248,${0.6 + Math.sin(frame * 0.15) * 0.25})`;
      ctx.fillStyle = "rgba(56,189,248,0.15)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - p.w * 0.35, p.w * 0.7, p.w * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    lights.push({ x: p.x, y: p.y, w: p.w, fog: 0, player: true });
  }});

  things.sort((a, b) => b.depth - a.depth);
  for (const t of things) {
    ctx.globalAlpha = 1 - t.fog * 0.85;   // far things fade into the haze
    t.draw();
  }
  ctx.globalAlpha = 1;
  return lights;
}

// How wide a flood is at a point along its length (0 = start, 1 = end):
// round at both ends like a real puddle, with a wobbly edge
function floodHalfWidth(f, t, wobble) {
  const u = t * 2 - 1;                                   // -1 .. 1
  const round = Math.pow(Math.max(0, 1 - u * u), 0.6);   // 0 at the ends, 1 in the middle
  const half = (LANE_POS[f.l1] - LANE_POS[f.l0]) / 2 + 0.27;
  return half * round * (1 + wobble);
}
const floodCenter = (f) => (LANE_POS[f.l0] + LANE_POS[f.l1]) / 2;

// Flood water painted on the road as one rounded, wobbly puddle:
// a dark wet edge, murky water, sky reflections and moving ripples
function drawFloods(drawn) {
  if (!floods.length) return;
  const N = segments.length;
  const drawnSet = new Set(drawn);
  for (const f of floods) {
    const first = Math.floor(f.z / SEG_LEN);
    const steps = f.segs * 3;                            // 3 points per road piece = smooth edge
    const pts = [];
    for (let k = 0; k <= steps; k++) {
      const seg = segments[(first + Math.floor(k / 3)) % N];
      if (!drawnSet.has(seg)) continue;                  // that piece isn't on screen
      const fr = (k % 3) / 3;
      const lerp = (a, b) => a + (b - a) * fr;
      const t = k / steps;
      const wob1 = 0.12 * Math.sin(k * 0.9 + f.seed), wob2 = 0.12 * Math.sin(k * 1.3 + f.seed * 2);
      const c = floodCenter(f) + 0.04 * Math.sin(k * 0.6 + f.seed);
      pts.push({
        x: lerp(seg.s1.x, seg.s2.x), y: lerp(seg.s1.y, seg.s2.y), w: lerp(seg.s1.w, seg.s2.w),
        c, l: floodHalfWidth(f, t, wob1), r: floodHalfWidth(f, t, wob2), fog: seg.fog,
      });
    }
    if (pts.length < 2) continue;
    const a = 1 - pts[Math.floor(pts.length / 2)].fog * 0.8;

    // draws the puddle outline, size = 1 normal, bigger = the wet edge
    const shape = (size, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      pts.forEach((q, i) => {
        const px = q.x + (q.c - q.l * size) * q.w;
        if (i === 0) ctx.moveTo(px, q.y); else ctx.lineTo(px, q.y);
      });
      for (let i = pts.length - 1; i >= 0; i--) {
        const q = pts[i];
        ctx.lineTo(q.x + (q.c + q.r * size) * q.w, q.y);
      }
      ctx.closePath();
      ctx.fill();
    };
    shape(1.18, `rgba(20,30,35,${0.35 * a})`);           // dark wet asphalt around it
    shape(1, `rgba(86,104,108,${0.88 * a})`);            // murky flood water
    shape(0.55, `rgba(170,200,215,${0.28 * a})`);        // sky reflection in the middle

    // ripples: rings that grow and fade
    ctx.lineWidth = 1.5;
    for (let j = 0; j < 3; j++) {
      const q = pts[Math.floor((pts.length - 1) * (0.3 + j * 0.2))];
      const phase = (frame * 0.015 + j * 0.33 + f.seed) % 1;
      ctx.strokeStyle = `rgba(230,240,245,${0.5 * (1 - phase) * a})`;
      ctx.beginPath();
      ctx.ellipse(q.x + q.c * q.w, q.y, Math.max(1, q.w * 0.18 * phase), Math.max(1, q.w * 0.03 * phase), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

// A soft round glow (used for lights at night)
function glow(x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${color},${alpha})`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

// Sunset colors, night darkness, rain, glowing lights and slow-mo tint
function drawAtmosphere(lights) {
  const { night, sunset, rain } = atmo;

  if (sunset > 0.01) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgba(255,80,110,${0.35 * sunset})`);
    g.addColorStop(HORIZON / H, `rgba(255,160,60,${0.4 * sunset})`);
    g.addColorStop(1, `rgba(255,120,40,${0.15 * sunset})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  if (night > 0.01) {
    ctx.fillStyle = `rgba(8,14,45,${0.62 * night})`;
    ctx.fillRect(0, 0, W, H);
    for (const s of stars) {
      const a = night * (0.5 + 0.5 * Math.sin(frame * 0.05 + s.tw)) * (1 - rain * 0.8);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
  }
  if (rain > 0.01) {
    ctx.fillStyle = `rgba(40,50,70,${0.3 * rain})`;
    ctx.fillRect(0, 0, W, H);
  }

  // Lights glow when it's dark. "lighter" ADDS colors, so glows look bright
  const dark = Math.max(night, rain * 0.6, sunset * 0.4);
  if (dark > 0.05) {
    ctx.globalCompositeOperation = "lighter";
    for (const l of lights) {
      const a = dark * (1 - l.fog) * 0.8;
      if (a < 0.02) continue;
      for (const side of [-1, 1]) {
        const lx = l.x + side * l.w * 0.4;
        const ly = l.y - l.w * 0.46;
        glow(lx, ly, l.w * 0.22, "255,50,40", a);
        if (rain > 0.05) {      // red reflections on the wet road (fade out downward)
          const len = l.w * 0.3;
          const g = ctx.createLinearGradient(0, l.y, 0, l.y + len);
          g.addColorStop(0, `rgba(255,50,40,${a * rain * 0.3})`);
          g.addColorStop(1, "rgba(255,50,40,0)");
          ctx.fillStyle = g;
          ctx.fillRect(lx - l.w * 0.05, l.y, l.w * 0.1, len);
        }
      }
      if (l.player && night > 0.05) {   // your headlights light up the road ahead
        const g = ctx.createLinearGradient(0, l.y - l.w * 0.6, 0, HORIZON + 30);
        g.addColorStop(0, `rgba(255,240,190,${0.3 * night})`);
        g.addColorStop(1, "rgba(255,240,190,0)");
        poly(g, [l.x - l.w * 0.35, l.y - l.w * 0.6, l.x + l.w * 0.35, l.y - l.w * 0.6,
          l.x + l.w * 1.3, HORIZON + 30, l.x - l.w * 1.3, HORIZON + 30]);
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }

  if (rain > 0.01) {
    ctx.strokeStyle = `rgba(210,225,255,${0.5 * rain})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const count = Math.floor(drops.length * rain);
    for (let i = 0; i < count; i++) {
      const d = drops[i];
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.len * 0.25, d.y + d.len);
    }
    ctx.stroke();
  }

  if (slowT > 0) {               // purple tint while slow-mo is on
    ctx.fillStyle = "rgba(168,85,247,0.12)";
    ctx.fillRect(0, 0, W, H);
  }
}

// White streaks flying past at high speed
function drawSpeedLines() {
  if (mode !== "playing" || paused) return;
  let power = (speed - 140) / 70;
  if (slowT > 0) power *= 0.4;
  if (power <= 0) return;
  power = Math.min(1, power);
  const cx = W / 2, cy = HORIZON + 30;
  ctx.strokeStyle = `rgba(255,255,255,${0.25 + 0.3 * power})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < Math.round(20 * power); i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 330 + Math.random() * 250;
    const len = 60 + Math.random() * 150 * power;
    ctx.moveTo(cx + Math.cos(a) * r * 1.6, cy + Math.sin(a) * r);
    ctx.lineTo(cx + Math.cos(a) * (r + len) * 1.6, cy + Math.sin(a) * (r + len));
  }
  ctx.stroke();
}

// Text and displays on top of the game (they don't shake or zoom)
function drawOverlays() {
  // White flash when you crash
  if (flashT > 0) {
    ctx.fillStyle = `rgba(255,255,255,${(flashT / 10) * 0.7})`;
    ctx.fillRect(0, 0, W, H);
  }

  // Active power-ups in the top-left corner, with a bar for time left
  let y = 18;
  const active = [];
  if (shield) active.push(["shield", 1]);
  if (magnetT > 0) active.push(["magnet", magnetT / magnetMax]);
  if (slowT > 0) active.push(["slowmo", slowT / slowMax]);
  if (clearT > 0) active.push(["walis", clearT / WALIS_TIME]);
  for (const [kind, left] of active) {
    ctx.fillStyle = "rgba(15,23,42,0.75)";
    roundRect(18, y, 190, 46, 12);
    ctx.fill();
    ctx.fillStyle = POWERS[kind].color;
    ctx.beginPath();
    ctx.arc(42, y + 23, 16, 0, Math.PI * 2);
    ctx.fill();
    drawPowerIcon(kind, 42, y + 23, 16);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 16px 'Trebuchet MS', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(POWERS[kind].label, 66, y + 16);
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(66, y + 29, 128, 6);
    ctx.fillStyle = POWERS[kind].color;
    ctx.fillRect(66, y + 29, 128 * left, 6);
    y += 54;
  }

  // Where you are: always shown at the top middle while driving
  if (["countdown", "playing", "crash"].includes(mode)) {
    const here = currentLocation().name.toUpperCase();
    const next = LOCATIONS[(level + 1) % LOCATIONS.length].name;
    const km = Math.max(0, ((level + 1) * LOCATION_DIST - odo) / UNITS_PER_KM);
    const nextText = `→ ${next} ${km.toFixed(1)} km`;
    ctx.font = "900 24px 'Trebuchet MS', sans-serif";
    const w1 = ctx.measureText("📍 " + here).width;
    ctx.font = "bold 18px 'Trebuchet MS', sans-serif";
    const w2 = ctx.measureText(nextText).width;
    const boxW = w1 + w2 + 50;
    ctx.fillStyle = "rgba(15,23,42,0.78)";
    roundRect(W / 2 - boxW / 2, 14, boxW, 44, 22);
    ctx.fill();
    ctx.strokeStyle = "#facc15";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#facc15";
    ctx.font = "900 24px 'Trebuchet MS', sans-serif";
    ctx.fillText("📍 " + here, W / 2 - boxW / 2 + 18, 37);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "bold 18px 'Trebuchet MS', sans-serif";
    ctx.fillText(nextText, W / 2 - boxW / 2 + 32 + w1, 37);
  }

  // Caution: pedestrian crossing ahead (blinks under the location box)
  if (crossing && mode === "playing" && relZ(crossing.z, playerZ()) > 0 && Math.floor(frame / 15) % 2 === 0) {
    const text = "⚠ TAWIRAN! Pedestrian crossing ahead";
    ctx.font = "900 20px 'Trebuchet MS', sans-serif";
    const tw = ctx.measureText(text).width + 36;
    ctx.fillStyle = "#facc15";
    roundRect(W / 2 - tw / 2, 66, tw, 38, 10);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#111827";
    ctx.stroke();
    ctx.fillStyle = "#111827";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, W / 2, 86);
  }

  // When you reach a new place: just its name, big, in the middle of the sky
  if (bannerT > 0) {
    const shown = 210 - bannerT;
    const fade = Math.min(1, shown / 20, bannerT / 20);      // 0 → 1 → 0
    const pop = 1 + Math.max(0, 1 - shown / 15) * 0.4;        // starts big, settles
    ctx.globalAlpha = fade;
    ctx.save();
    ctx.translate(W / 2, 120);
    ctx.scale(pop, pop);
    outlinedText(currentLocation().name.toUpperCase(), 0, 0, 72, "#facc15", "#1e293b", 10);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // Combo meter (top right) while you chain close calls
  if (combo >= 2 && comboT > 0) {
    ctx.fillStyle = "rgba(15,23,42,0.75)";
    roundRect(W - 230, 18, 210, 62, 14);
    ctx.fill();
    outlinedText(`COMBO x${combo}`, W - 125, 42, 28, combo >= 5 ? "#f472b6" : "#4ade80");
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(W - 210, 62, 170, 7);
    ctx.fillStyle = combo >= 5 ? "#f472b6" : "#4ade80";
    ctx.fillRect(W - 210, 62, 170 * (comboT / 180), 7);
  }

  // Splash: water on the "camera" after driving into a flood
  if (splashT > 0) {
    const a = splashT / 45;
    ctx.fillStyle = `rgba(120,180,220,${0.25 * a})`;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = `rgba(225,240,255,${0.55 * a})`;
    for (let i = 0; i < 26; i++) {
      const dx = (i * 137) % W, dy = (i * 89) % H;
      if (dx > W * 0.25 && dx < W * 0.75 && dy > H * 0.25) continue;   // keep the middle clear
      ctx.beginPath();
      ctx.arc(dx, dy, 8 + (i % 4) * 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Floating texts above your car
  const p = playerScreen();
  for (const pop of popups) {
    ctx.globalAlpha = 1 - pop.t / 60;
    outlinedText(pop.text, p.x, p.y - p.w * 0.9 - pop.t * 1.2, 34, pop.color);
  }
  ctx.globalAlpha = 1;

  // Countdown numbers (each one shrinks in) and "GO!"
  if (mode === "countdown") {
    const n = 3 - Math.floor(countT / 50);
    const local = (countT % 50) / 50;
    const s = 1.6 - 0.6 * Math.min(1, local * 3);
    ctx.save();
    ctx.translate(W / 2, H * 0.42);
    ctx.scale(s, s);
    outlinedText(String(n), 0, 0, 140, "#facc15");
    ctx.restore();
  }
  if (goT > 0) {
    ctx.globalAlpha = goT / 50;
    ctx.save();
    ctx.translate(W / 2, H * 0.42);
    const s = 1 + (50 - goT) / 50;
    ctx.scale(s, s);
    outlinedText("GO!", 0, 0, 140, "#4ade80");
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // "WASAK!" pops in when you crash
  if (mode === "crash" && crashT > 6) {
    const t = Math.min(1, (crashT - 6) / 12);
    const s = t < 1 ? t * 1.3 : 1.3 - Math.min(0.3, (crashT - 18) / 40);
    ctx.save();
    ctx.translate(W / 2, H * 0.4);
    ctx.rotate(-0.12);
    ctx.scale(s, s);
    outlinedText(crashText, 0, 0, 150, "#ff3b30", "#ffd23f", 14);
    ctx.restore();
  }

  if (paused) {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, W, H);
    outlinedText("PAUSED", W / 2, H / 2, 60, "#ffffff");
  }
}

function draw() {
  ctx.save();
  // Screen shake: move everything a few random pixels
  if (shake > 0.5) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  // Crash zoom: make everything bigger, centered on the player car
  if (crashZoom > 0) {
    const p = playerScreen();
    const cy = p.y - p.w * 0.4;
    ctx.translate(p.x, cy);
    ctx.scale(1 + crashZoom, 1 + crashZoom);
    ctx.translate(-p.x, -cy);
  }
  const lights = drawWorld();
  drawAtmosphere(lights);
  drawSpeedLines();
  ctx.restore();
  drawOverlays();
}

// ----- 16. Game loop (~60 times per second) -----
// It always runs. What it does depends on which screen we are on.
function loop(now) {
  const dt = Math.min((now - lastTime) / (1000 / 60), 3);  // same speed on any PC
  lastTime = now;

  if (mode === "home") update(dt, true);                 // self-driving demo
  else if (mode === "countdown") updateCountdown(dt);    // 3, 2, 1, GO!
  else if (mode === "playing" && !paused) update(dt);    // the real game
  else if (mode === "crash") updateCrash(dt);            // WASAK! replay
  // (on "over" nothing moves: the crash scene stays frozen)

  if (!paused) updateEffects(dt);
  draw();

  const engineOn = (mode === "playing" && !paused) || mode === "countdown";
  Sound.updateEngine(speed, engineOn, slowT > 0);
  Sound.updateRain(atmo.rain, mode !== "home" && !paused);
  requestAnimationFrame(loop);
}

// ----- 17. Switching screens -----
// Shows one screen (or none) and hides the others
function showScreen(screen) {
  for (const el of [homeScreen, howtoScreen, overScreen]) el.classList.add("hidden");
  if (screen) screen.classList.remove("hidden");
  // The score bar and touch buttons only show during a run
  const inRun = ["countdown", "playing", "crash"].includes(mode);
  hud.classList.toggle("hidden", !inRun);
  touch.classList.toggle("hidden", !inRun);
  document.body.classList.toggle("in-run", inRun);   // lets CSS show the "rotate your phone" tip
}

function goHome() {
  Sound.init();
  resetGame();
  mode = "home";
  homeBestEl.textContent = best;
  showGarage();
  showScreen(homeScreen);
}

function startGame() {
  if (isLocked(PLAYER_TYPES[typeChoice])) return;   // can't drive a locked vehicle
  Sound.init();          // browsers only allow sound after a click or key press
  resetGame();
  mode = "countdown";
  showScreen(null);
}

function gameOver() {
  mode = "over";
  if (score > best) {
    best = score;
    saveBest(best);
    bestEl.textContent = best;
    overTitle.textContent = "BAGONG RECORD!";
  } else {
    overTitle.textContent = Math.random() < 0.5 ? "SAYANG!" : "HALA!";
  }
  document.getElementById("over-kita").textContent = kita;
  wallet += kita;                                     // save this run's pesos
  saveWallet(wallet);
  document.getElementById("over-loc").textContent = currentLocation().name;
  finalScoreEl.textContent = score;
  overBestEl.textContent = best;
  showScreen(overScreen);
}

// Start on the home screen
showGarage();
resetGame();
mode = "home";
showScreen(homeScreen);
lastTime = performance.now();
requestAnimationFrame(loop);