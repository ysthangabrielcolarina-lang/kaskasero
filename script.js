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
const gameCtx = canvas.getContext("2d");   // the real game screen (never changes)
let ctx = gameCtx;      // "let": the garage borrows it for a moment to draw car faces
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
const mapsScreen = document.getElementById("maps");
const overScreen = document.getElementById("gameover");
const homeBestEl = document.getElementById("home-best");
const overTitle = document.getElementById("over-title");
const finalScoreEl = document.getElementById("final-score");
const overBestEl = document.getElementById("over-best");
const kitaEl = document.getElementById("kita");
const muteBtn = document.getElementById("mute-btn");
const musicBtn = document.getElementById("music-btn");

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
  kalesa:    { w: 600, len: 500, weight: 6,  h: 1.25 },   // only in Calauan, Manila and Ilocos
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

// E-bike (e-trike) colors you see on Filipino roads
const EBIKE_COLORS = [
  { body: "#dc2626", dark: "#991b1b", roof: "#1f2937" },   // red
  { body: "#2563eb", dark: "#1e40af", roof: "#1f2937" },   // blue
  { body: "#f1f5f9", dark: "#cbd5e1", roof: "#334155" },   // white
  { body: "#facc15", dark: "#ca8a04", roof: "#1f2937" },   // yellow
  { body: "#16a34a", dark: "#166534", roof: "#1f2937" },   // green
];

const pickOne = (list) => list[Math.floor(Math.random() * list.length)];

// Kalesas only show up in Calauan, Manila and Ilocos (Vigan is famous for them)
function typeWeight(t) {
  if (t === "kalesa" && !currentLocation().kalesa) return 0;
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
  if (type === "car") return Math.random() < 0.5 ? { ...pickOne(CAR_COLORS), ...pickOne(TRAFFIC_DESIGNS) } : pickOne(CAR_COLORS);
  if (type === "tricycle") return pickOne(TRIKE_COLORS);
  if (type === "jeepney") return pickOne(JEEP_COLORS);
  if (type === "ebike") return pickOne(EBIKE_COLORS);
  return null;   // the others always use the same colors
}

// Paint colors for your car. Candy Red is free; the others are bought with Pera (cheap!).
// body = main color, dark = shadow side, top = shiny top, price in ₱
const PLAYER_COLORS = [
  { name: "Candy Red",      body: "#e8264f", dark: "#a8163a", top: "#ff5577", accent: "#ffffff", accent2: "#1f2937", design: "stripes", price: 0 },
  { name: "Ocean Teal",     body: "#0ea5a4", dark: "#0f766e", top: "#5eead4", accent: "#facc15", accent2: "#0f172a", design: "racing", price: 40 },
  { name: "Pearl White",    body: "#f1f5f9", dark: "#cbd5e1", top: "#ffffff", accent: "#2563eb", accent2: "#dc2626", design: "stripes", price: 40 },
  { name: "Midnight Black", body: "#1f2937", dark: "#0b1220", top: "#52627a", accent: "#f97316", accent2: "#facc15", design: "flames", price: 60 },
  { name: "Mango Yellow",   body: "#facc15", dark: "#b8920b", top: "#fef08a", accent: "#111827", accent2: "#ffffff", design: "checker", price: 60 },
  { name: "Royal Blue",     body: "#2563eb", dark: "#1a46a8", top: "#7aa7ff", accent: "#ffffff", accent2: "#facc15", design: "bolt", price: 80 },
  { name: "Sunset Orange",  body: "#f97316", dark: "#c2410c", top: "#fdba74", accent: "#1f2937", accent2: "#fde68a", design: "twotone", price: 80 },
  { name: "Calamansi Lime", body: "#84cc16", dark: "#4d7c0f", top: "#d9f99d", accent: "#111827", accent2: "#ffffff", design: "racing", price: 100 },
  { name: "Ube Purple",     body: "#7c3aed", dark: "#4c1d95", top: "#c4b5fd", accent: "#f472b6", accent2: "#fde68a", design: "flames", price: 120 },
  { name: "Gumamela Pink",  body: "#ec4899", dark: "#9d174d", top: "#f9a8d4", accent: "#ffffff", accent2: "#7c3aed", design: "twotone", price: 150 },
  { name: "Watawat",        body: "#1d4ed8", dark: "#1e3a8a", top: "#60a5fa", accent: "#dc2626", accent2: "#facc15", design: "flag", price: 150 },
];
// What each design is called (shown in the garage)
const DESIGN_NAMES = { stripes: "twin stripes", racing: "racing stripe", twotone: "two-tone", flames: "flames",
  checker: "checkers", bolt: "lightning", flag: "watawat" };
// Designs for traffic cars too (some cars on the road get stripes or two colors)
const TRAFFIC_DESIGNS = [
  { design: "stripes", accent: "#ffffff" },
  { design: "twotone", accent: "#1f2937", accent2: "#e5e7eb" },
  { design: "racing", accent: "#111827", accent2: "#ffffff" },
  { design: "checker", accent: "#111827", accent2: "#ffffff" },
];

// Paints a design on the BACK or FRONT of a car, inside the box x0..x1, yTop..yBot
// (painter units: x from -0.5 to 0.5, y goes up = more negative)
function paintDesign({ R, P, C }, col, x0, yTop, x1, yBot) {
  const w = x1 - x0, h = yBot - yTop, cx = (x0 + x1) / 2, a = col.accent, a2 = col.accent2 || col.dark;
  switch (col.design) {
    case "stripes":                                   // twin racing stripes
      R(cx - 0.085, yTop, 0.05, h, a);
      R(cx + 0.035, yTop, 0.05, h, a);
      break;
    case "racing":                                    // one wide stripe with thin lines beside it
      R(cx - 0.07, yTop, 0.14, h, a);
      R(cx - 0.1, yTop, 0.014, h, a2);
      R(cx + 0.086, yTop, 0.014, h, a2);
      break;
    case "twotone":                                   // bottom half in a second color
      R(x0, yTop + h * 0.55, w, h * 0.45, a);
      R(x0, yTop + h * 0.5, w, h * 0.06, a2);
      break;
    case "flames":                                    // flames coming up from both lower corners
      for (const sd of [-1, 1]) {
        const ex = sd < 0 ? x0 : x1;
        const flame = (k, c) => P(c, [ex, yBot, ex - sd * 0.32 * k, yBot, ex - sd * 0.24 * k, yBot - h * 0.4 * k,
          ex - sd * 0.28 * k, yBot - h * 0.75 * k, ex - sd * 0.15 * k, yBot - h * 0.45 * k, ex - sd * 0.12 * k, yBot - h * 0.95 * k,
          ex - sd * 0.04 * k, yBot - h * 0.5 * k, ex, yBot - h * 0.75 * k]);
        flame(1, a);
        flame(0.6, a2);
      }
      break;
    case "checker": {                                 // a checkered band across the middle
      const q = h * 0.2, y1 = yTop + h * 0.32;
      for (let i = 0; x0 + i * q < x1; i++) {
        R(x0 + i * q, y1, q, q, i % 2 ? a2 : a);
        R(x0 + i * q, y1 + q, q, q, i % 2 ? a : a2);
      }
      break;
    }
    case "bolt":                                      // a lightning bolt on each side
      for (const sd of [-1, 1]) {
        const bx = cx + sd * 0.3;
        P(a2, [bx - 0.03, yTop + h * 0.05, bx + 0.07, yTop + h * 0.05, bx + 0.01, yTop + h * 0.45, bx + 0.08, yTop + h * 0.45,
          bx - 0.06, yBot - h * 0.02, bx - 0.01, yTop + h * 0.58, bx - 0.08, yTop + h * 0.58]);
        P(a, [bx - 0.02, yTop + h * 0.1, bx + 0.05, yTop + h * 0.1, bx, yTop + h * 0.48, bx + 0.06, yTop + h * 0.48,
          bx - 0.05, yBot - h * 0.1, bx - 0.01, yTop + h * 0.55, bx - 0.065, yTop + h * 0.55]);
      }
      break;
    case "flag":                                      // Philippine flag: blue top, red bottom, white triangle and a sun
      R(x0, yTop + h * 0.5, w, h * 0.5, a);
      P("#ffffff", [x0, yTop, x0 + w * 0.32, yTop + h * 0.5, x0, yBot]);
      C(x0 + w * 0.1, yTop + h * 0.5, h * 0.13, a2);
      for (const [sx, sy] of [[0.03, 0.12], [0.03, 0.88], [0.24, 0.5]]) C(x0 + w * sx, yTop + h * sy, h * 0.045, a2);
      break;
  }
}
// The same designs on the SIDE of a car (garage pictures). Uses "source-atop" so the
// design only lands on the car's body that is already drawn (not on the background).
function paintDesignSide(col, x0, yTop, x1, yBot) {
  const w = x1 - x0, h = yBot - yTop, a = col.accent, a2 = col.accent2 || col.dark;
  g.save();
  g.globalCompositeOperation = "source-atop";
  const R = (x, y, ww, hh, c) => { g.fillStyle = c; g.fillRect(x, y, ww, hh); };
  const P = (c, pts) => fillPoly(g, c, pts);
  switch (col.design) {
    case "stripes":
      R(x0, yTop + h * 0.42, w, h * 0.1, a);
      R(x0, yTop + h * 0.58, w, h * 0.1, a);
      break;
    case "racing":
      R(x0, yTop + h * 0.4, w, h * 0.24, a);
      R(x0, yTop + h * 0.34, w, h * 0.04, a2);
      R(x0, yTop + h * 0.66, w, h * 0.04, a2);
      break;
    case "twotone":
      R(x0, yTop + h * 0.58, w, h * 0.42, a);
      R(x0, yTop + h * 0.53, w, h * 0.06, a2);
      break;
    case "flames":                                    // flames from the front, licking back along the side
      for (const [k, c] of [[1, a], [0.62, a2]]) {
        const fx = x1 - w * 0.06, y = yTop + h * 0.55;
        P(c, [fx, y - h * 0.32 * k, fx - w * 0.3 * k, y - h * 0.28 * k, fx - w * 0.2 * k, y - h * 0.12 * k,
          fx - w * 0.45 * k, y - h * 0.05 * k, fx - w * 0.25 * k, y + h * 0.08 * k, fx - w * 0.5 * k, y + h * 0.2 * k,
          fx - w * 0.22 * k, y + h * 0.26 * k, fx, y + h * 0.3 * k]);
      }
      break;
    case "checker": {
      const q = h * 0.16, y1 = yTop + h * 0.4;
      for (let i = 0; x0 + i * q < x1; i++) {
        R(x0 + i * q, y1, q, q, i % 2 ? a2 : a);
        R(x0 + i * q, y1 + q, q, q, i % 2 ? a : a2);
      }
      break;
    }
    case "bolt": {                                    // one long lightning bolt along the side
      const y = yTop + h * 0.5;
      P(a2, [x0 + w * 0.05, y - 5, x0 + w * 0.42, y - 7, x0 + w * 0.38, y - 1, x0 + w * 0.95, y - 5,
        x0 + w * 0.58, y + 7, x0 + w * 0.62, y + 1, x0 + w * 0.05, y + 3]);
      P(a, [x0 + w * 0.07, y - 3, x0 + w * 0.42, y - 5, x0 + w * 0.39, y + 0, x0 + w * 0.92, y - 4,
        x0 + w * 0.59, y + 5, x0 + w * 0.62, y - 0.5, x0 + w * 0.07, y + 1.5]);
      break;
    }
    case "flag":
      R(x0, yTop + h * 0.5, w, h * 0.5, a);
      P("#ffffff", [x0, yTop, x0 + w * 0.22, yTop + h * 0.5, x0, yBot]);
      g.fillStyle = a2;
      g.beginPath(); g.arc(x0 + w * 0.07, yTop + h * 0.5, h * 0.12, 0, Math.PI * 2); g.fill();
      break;
  }
  g.restore();
}

// Vehicles the player can drive (chosen in the garage on the home screen)
//   maxSpeed = top speed, w = width
//   hit = how much of the width counts for crashes (smaller = squeezes through)
// Steering is the same for every vehicle (PLAYER_GRIP).
const PLAYER_GRIP = 0.23;
const PLAYER_TYPES = [
  { id: "sports",   name: "Sports Car",   w: 580, hit: 1,    maxSpeed: 240, colors: true,
    special: "Fastest car. Built for speed." },
  { id: "electric", name: "Electric Car", w: 560, hit: 1,    maxSpeed: 222, colors: true, startSpeed: 125, powerMult: 1.6,
    special: "Quick start. Magnet and Slow-mo last longer." },
  { id: "muscle",   name: "Retro Muscle", w: 620, hit: 1,    maxSpeed: 234, colors: true, nearMult: 1.5,
    special: "Very fast. Close calls give +50% points." },
  { id: "jeepney",  name: "Jeepney",      w: 660, hit: 1,    maxSpeed: 195, refillShield: true,
    special: "Matibay! Free shield in every new place." },
  // The secret one: best at everything (even better than a fully upgraded car).
  // The only way to unlock it: pay ₱2000 from your Pera.
  { id: "hari", name: "Hari ng Daan", tag: "E-BIKE", w: 440, hit: 0.75, maxSpeed: 270, locked: true, price: 2000, maxed: true,
    startSpeed: 130, coinMult: 2, powerMult: 1.6, nearMult: 1.5, refillShield: true,
    special: "Ang Hari ng Daan! Max speed, slimmest, double ₱, all bonuses." },
];
const DEMO_SPEED = 110;      // speed of the self-driving car on the home screen

// ----- UPGRADES (bought with Pera in the garage) -----
// Each vehicle has 2 upgrades with 5 levels each:
//   Speed: +5 km/h top speed per level
//   Slim:  6% narrower crash size per level (squeezes past traffic more easily)
const UPGRADE_COST = [100, 200, 350, 500, 750];   // price of level 1, 2, 3, 4, 5
const UPGRADE_MAX = UPGRADE_COST.length;
const SPEED_PER_LEVEL = 5;
const SLIM_PER_LEVEL = 0.94;
let upgrades = loadUpgrades();         // e.g. { sports: { speed: 2, slim: 1 }, ... }
function loadUpgrades() {
  try { return JSON.parse(localStorage.getItem("highwayDashUpgrades")) || {}; }
  catch { return {}; }
}
function saveUpgrades() {
  try { localStorage.setItem("highwayDashUpgrades", JSON.stringify(upgrades)); } catch { /* ignore */ }
}
const upLevel = (pt, stat) => (upgrades[pt.id] && upgrades[pt.id][stat]) || 0;
// The REAL numbers the game uses (base + upgrades)
const topSpeed = (pt) => pt.maxSpeed + upLevel(pt, "speed") * SPEED_PER_LEVEL;
const crashWidth = (pt) => pt.w * pt.hit * Math.pow(SLIM_PER_LEVEL, upLevel(pt, "slim"));
// Turns them into a 1–10 rating for the garage (Hari ng Daan = 10 on both)
const speedRating = (v) => Math.max(1, Math.min(10, (v - 180) / 9));
const slimRating = (wid) => Math.max(1, Math.min(10, (700 - wid) / 37));

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

// HILLS: every road piece gets a height. Two smooth waves are added together.
// Each wave fits a whole number of times around the track, so the loop joins up.
const N_SEG = segments.length;
function roadHeight(n) {
  const a = (n / N_SEG) * Math.PI * 2;
  return 2200 * Math.sin(a * 6) + 700 * Math.sin(a * 17 + 1.3);
}
// HILL SIZE: the road is almost flat at the start and the hills slowly grow.
// Calauan is nearly flat (4%), then the hills grow through Bay and Los Baños,
// and they are full size only from Calamba onward.
let hillScale = -1;
function setHills(scale) {
  if (Math.abs(scale - hillScale) < 0.002) return;   // no visible change, skip the work
  hillScale = scale;
  for (const seg of segments) {
    seg.y1 = roadHeight(seg.index) * scale;        // height where this piece starts
    seg.y2 = roadHeight(seg.index + 1) * scale;    // height where it ends
  }
}
// How big the hills should be after driving a distance d
function hillsFor(d) {
  const t = Math.max(0, Math.min(1, (d - 200000) / 550000));  // grows from 200k to 750k
  return 0.04 + 0.96 * t * t * (3 - 2 * t);                   // smooth start and end
}
setHills(hillsFor(0));
// Road height at any distance z (in between two piece ends)
function heightAt(z) {
  const seg = findSegment(z);
  const t = (((z % SEG_LEN) + SEG_LEN) % SEG_LEN) / SEG_LEN;
  return seg.y1 + (seg.y2 - seg.y1) * t;
}

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

// Manila: tall city buildings. Two layers drawn the same way:
//  - manilaLayer = the buildings (windows dark)
//  - manilaLit   = only the windows that light up at night (drawn glowing on top)
const manilaLit = document.createElement("canvas");
manilaLit.width = LAYER_W;
manilaLit.height = HORIZON + 2;
const antennas = [];                       // tops of tall towers (red blinking lights)
const manilaLayer = makeLayer((g) => {
  const lit = manilaLit.getContext("2d");
  const colors = ["#8fa3b8", "#7d93aa", "#a9b8c8", "#6f86a0", "#94a3b8"];
  let x = 0;
  while (x < LAYER_W) {
    const bw = 34 + rand() * 50;                     // building width
    const bh = HORIZON * (0.28 + rand() * 0.62);     // building height
    const top = HORIZON - bh;
    const color = colors[Math.floor(rand() * colors.length)];
    const tall = bh > HORIZON * 0.7;
    const litChance = 0.35 + rand() * 0.4;
    const winColor = ["#ffe9a8", "#fff3c4", "#cfe8ff"][Math.floor(rand() * 3)];
    wrapped(x, (bx) => {
      g.fillStyle = color;
      g.fillRect(bx, top, bw, bh);
      g.fillStyle = "rgba(0,0,0,0.18)";              // shaded right side
      g.fillRect(bx + bw * 0.7, top, bw * 0.3, bh);
      if (tall) {                                    // stepped top + antenna
        g.fillStyle = color;
        g.fillRect(bx + bw * 0.2, top - 10, bw * 0.6, 10);
        g.fillRect(bx + bw * 0.48, top - 32, 3, 22);
      }
    });
    // windows: a grid of small squares
    for (let wy = top + 6; wy < HORIZON - 6; wy += 9) {
      for (let wx = x + 5; wx < x + bw - 6; wx += 8) {
        const on = rand() < litChance;
        wrapped(wx, (px) => {
          g.fillStyle = "#5b6b7d";
          g.fillRect(px, wy, 4, 5);
          if (on) {
            lit.fillStyle = winColor;
            lit.fillRect(px, wy, 4, 5);
          }
        });
      }
    }
    if (tall) antennas.push({ x: x + bw * 0.48 + 1.5, y: top - 32, phase: rand() * 60 });
    x += bw + 4 + rand() * 14;
  }
});

// Lights up the Manila windows at night. They are drawn glowing on top of the
// dark night, but only on the sky part of the screen and NOT on anything that
// is in front of the city (trees, vehicles, signs): those areas are cut out.
// A hidden canvas used as a stencil: we draw the lit windows into it, then
// ERASE every spot where a tree, car or building stands in front of the sky.
// (Erasing handles overlapping shapes correctly, so no light leaks onto them.)
const cityMask = document.createElement("canvas");
cityMask.width = W;
cityMask.height = HORIZON + 2;
const cityCtx = cityMask.getContext("2d");

function drawCityLights(boxes, groundTop) {
  const a = bgWeight.manila * atmo.night;
  if (a < 0.02) return;
  const g = cityCtx, h = cityMask.height;
  g.globalCompositeOperation = "source-over";
  g.clearRect(0, 0, W, h);
  // 1) copy only the part of the wide picture that is on screen
  const start = ((bgOffset * 0.6) % LAYER_W + LAYER_W) % LAYER_W;
  const first = Math.min(W, LAYER_W - start);
  g.drawImage(manilaLit, start, 0, first, h, 0, 0, first, h);
  if (first < W) g.drawImage(manilaLit, 0, 0, W - first, h, first, 0, W - first, h);  // wrap around
  // 2) blinking red lights on the tower antennas
  g.fillStyle = "#ff3030";
  for (const an of antennas) {
    if ((frame + an.phase) % 60 > 30) continue;
    let sx = an.x - start;
    if (sx < -10) sx += LAYER_W;
    if (sx < -10 || sx > W + 10) continue;
    g.globalAlpha = 1;
    g.beginPath(); g.arc(sx, an.y, 2.5, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 0.3;
    g.beginPath(); g.arc(sx, an.y, 7, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  // 3) erase the ground and everything standing in front of the sky
  g.globalCompositeOperation = "destination-out";
  g.fillStyle = "#000";
  g.fillRect(0, groundTop - 1, W, h);
  for (const b of boxes) g.fillRect(b.x0 - 2, b.y0 - 2, b.x1 - b.x0 + 4, b.y1 - b.y0 + 4);
  g.globalCompositeOperation = "source-over";
  // 4) add the glowing result on top of the night scene
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = a;
  ctx.drawImage(cityMask, 0, 0);
  ctx.restore();
}

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
  manila: manilaLayer,
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
// ----- New places after Manila: their backgrounds -----
// Mt. Arayat (Pampanga): one big lonely mountain with rice fields in front
backdrops.arayat = makeLayer((g) => {
  farPeaks(g, "#d4ecd9");
  for (const cx of [LAYER_W * 0.3, LAYER_W * 0.8]) {
    const h = HORIZON * 0.7, half = h * 1.9;
    smoothMountain(g, [[cx - half, 0], [cx - half * 0.6, h * 0.35], [cx - half * 0.3, h * 0.8], [cx - half * 0.1, h * 0.95],
      [cx + half * 0.05, h * 0.86], [cx + half * 0.18, h], [cx + half * 0.4, h * 0.7], [cx + half * 0.7, h * 0.3], [cx + half, 0]],
      "#5f9e6e", "#4d8a5c");
    for (let i = 0; i < 80; i++) {                    // forest texture
      const fx = (rand() - 0.5) * 1.6, tx = cx + fx * half;
      const top = HORIZON - h * (1 - Math.abs(fx) * 0.95) * rand() * 0.8 - 6;
      fillPoly(g, "rgba(30,90,50,0.4)", [tx - 6, top + 12, tx, top, tx + 6, top + 12]);
    }
  }
  for (let i = 0; i < 6; i++) {                       // flat green rice paddies near the horizon
    g.fillStyle = i % 2 ? "#9bd36a" : "#86c45a";
    g.fillRect(0, HORIZON - 18 + i * 3, LAYER_W, 3);
  }
  for (let i = 0; i < 30; i++) {                      // coconut trees standing in the fields
    const x = rand() * LAYER_W, h = 22 + rand() * 14;
    wrapped(x, (px) => {
      g.fillStyle = "#6b4f2a";
      g.fillRect(px, HORIZON - h, 2, h);
      g.fillStyle = "#3f8f4a";
      for (const a of [-2.6, -2.0, -1.2, -0.6]) {
        g.beginPath();
        g.ellipse(px + Math.cos(a) * 7, HORIZON - h + Math.sin(a) * 3 + 3, 8, 2.5, a + Math.PI / 2, 0, Math.PI * 2);
        g.fill();
      }
    });
  }
});

// Baguio: layers of mountain ridges covered in pine trees, with mist in between
backdrops.baguio = makeLayer((g) => {
  // A ridge line that joins up at both ends of the wide picture (waves with whole numbers of periods)
  const ridge = (base, amp, seedA, color, pines) => {
    const yAt = (x) => {
      const a = (x / LAYER_W) * Math.PI * 2;
      return HORIZON - base - amp * (0.5 * Math.sin(a * 3 + seedA) + 0.3 * Math.sin(a * 7 + seedA * 2) + 0.2 * Math.sin(a * 13 + seedA * 3));
    };
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, HORIZON + 2);
    for (let x = 0; x <= LAYER_W; x += 8) g.lineTo(x, yAt(x));
    g.lineTo(LAYER_W, HORIZON + 2);
    g.fill();
    if (pines) {                                      // little pine trees along the top of the ridge
      for (let x = 4; x < LAYER_W; x += 7 + rand() * 6) {
        const y = yAt(x) + 2, ph = 8 + rand() * 9;
        fillPoly(g, pines, [x - ph * 0.28, y + 2, x, y - ph, x + ph * 0.28, y + 2]);
      }
    }
  };
  const mist = (y) => {
    const m = g.createLinearGradient(0, y - 14, 0, y + 10);
    m.addColorStop(0, "rgba(240,245,248,0)");
    m.addColorStop(0.6, "rgba(240,245,248,0.75)");
    m.addColorStop(1, "rgba(240,245,248,0)");
    g.fillStyle = m;
    g.fillRect(0, y - 14, LAYER_W, 24);
  };
  ridge(HORIZON * 0.55, HORIZON * 0.25, 0.5, "#a9c4bd", null);
  mist(HORIZON * 0.5);
  ridge(HORIZON * 0.35, HORIZON * 0.2, 2.1, "#6f9a88", "#5d8a77");
  mist(HORIZON * 0.68);
  ridge(HORIZON * 0.15, HORIZON * 0.14, 4.2, "#3f6f58", "#2f5c47");
  mist(HORIZON * 0.88);
  for (let i = 0; i < 40; i++) {                      // houses on the hillside (Baguio is colorful!)
    const x = rand() * LAYER_W, y = HORIZON - 6 - rand() * HORIZON * 0.2;
    const col = ["#f87171", "#facc15", "#60a5fa", "#f9fafb", "#a78bfa", "#4ade80"][Math.floor(rand() * 6)];
    wrapped(x, (px) => {
      g.fillStyle = col;
      g.fillRect(px, y, 6, 5);
      g.fillStyle = "#475569";
      g.fillRect(px - 1, y - 2, 8, 2);
    });
  }
});

// Ilocos: the sea at the horizon, dunes on the shore and the Bangui windmills
const windmills = [];                       // blades are drawn turning, every frame
backdrops.ilocos = makeLayer((g) => {
  farPeaks(g, "#d7d2c4");
  g.fillStyle = "#3b82c4";                            // the West Philippine Sea
  g.fillRect(0, HORIZON - 24, LAYER_W, 26);
  g.fillStyle = "rgba(255,255,255,0.4)";
  for (let i = 0; i < 50; i++) g.fillRect(rand() * LAYER_W, HORIZON - 22 + rand() * 18, 16 + rand() * 30, 2);
  g.fillStyle = "#e9d8a6";                            // sandy shore
  g.fillRect(0, HORIZON - 6, LAYER_W, 8);
  for (let i = 0; i < 26; i++) {                      // a long row of white wind turbines along the coast
    const x = (i / 26) * LAYER_W + rand() * 20;
    const h = 46 + rand() * 18, top = HORIZON - 6 - h;
    wrapped(x, (px) => fillPoly(g, "#f1f5f9", [px - 2, HORIZON - 6, px + 2, HORIZON - 6, px + 1, top, px - 1, top]));
    windmills.push({ x, y: top, len: h * 0.42, phase: rand() * 6 });
  }
});

// The windmill blades turn (drawn on top of the Ilocos background every frame)
function drawWindmillBlades() {
  const a = bgWeight.ilocos;
  if (a < 0.02) return;
  const start = ((bgOffset * 0.6) % LAYER_W + LAYER_W) % LAYER_W;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = "#f8fafc";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  for (const m of windmills) {
    let sx = m.x - start;
    if (sx < -40) sx += LAYER_W;
    if (sx < -40 || sx > W + 40) continue;
    const turn = frame * 0.03 + m.phase;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const ang = turn + (i * Math.PI * 2) / 3;
      ctx.moveTo(sx, m.y);
      ctx.lineTo(sx + Math.cos(ang) * m.len, m.y + Math.sin(ang) * m.len);
    }
    ctx.stroke();
    ctx.fillStyle = "#cbd5e1";
    ctx.fillRect(sx - 2, m.y - 1.5, 4, 3);
  }
  ctx.restore();
}

// ----- VISAYAS backgrounds (sea, islands, beaches) -----
// A strip of sea at the horizon, with light sparkles on it
function seaStrip(g, top, deep, light) {
  const sea = g.createLinearGradient(0, HORIZON - top, 0, HORIZON);
  sea.addColorStop(0, deep);
  sea.addColorStop(1, light);
  g.fillStyle = sea;
  g.fillRect(0, HORIZON - top, LAYER_W, top + 2);
  g.fillStyle = "rgba(255,255,255,0.45)";
  for (let i = 0; i < 60; i++) g.fillRect(rand() * LAYER_W, HORIZON - top + 3 + rand() * (top - 6), 10 + rand() * 26, 1.5);
}
// A low island on the sea (x = middle, w = half-width, h = height)
function island(g, x, w, h, color) {
  wrapped(x, (px) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(px - w, HORIZON - 14);
    g.quadraticCurveTo(px - w * 0.5, HORIZON - 14 - h, px, HORIZON - 14 - h * 0.9);
    g.quadraticCurveTo(px + w * 0.6, HORIZON - 14 - h * 1.1, px + w, HORIZON - 14);
    g.fill();
  });
}
// Cebu City: green mountains behind a city of towers by the sea
backdrops.cebu = makeLayer((g) => {
  farPeaks(g, "#cfe3d6");
  for (const cx of [LAYER_W * 0.15, LAYER_W * 0.5, LAYER_W * 0.85]) {
    const h = HORIZON * (0.45 + rand() * 0.15), half = h * 2.4;
    smoothMountain(g, [[cx - half, 0], [cx - half * 0.4, h * 0.7], [cx, h], [cx + half * 0.5, h * 0.6], [cx + half, 0]], "#6fae7f", "#5a9a6b");
  }
  const colors = ["#e2e8f0", "#cbd5e1", "#bae6fd", "#f8fafc", "#a5b4fc"];
  for (let i = 0; i < 70; i++) {                      // the city towers
    const x = rand() * LAYER_W, w = 10 + rand() * 16, h = 18 + rand() * 60;
    const c = colors[Math.floor(rand() * colors.length)];
    wrapped(x, (px) => {
      g.fillStyle = c;
      g.fillRect(px, HORIZON - 12 - h, w, h);
      g.fillStyle = "rgba(30,64,120,0.35)";
      for (let wy = HORIZON - 12 - h + 4; wy < HORIZON - 16; wy += 6) g.fillRect(px + 2, wy, w - 4, 2);
    });
  }
  seaStrip(g, 12, "#2b7bb9", "#5fb0e0");
});
// Bohol: the famous Chocolate Hills (lots of round brown-green hills)
backdrops.bohol = makeLayer((g) => {
  farPeaks(g, "#d5e6d0");
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 46; i++) {
      const x = rand() * LAYER_W, r = (14 + rand() * 12) * (1 - row * 0.2), y = HORIZON - 4 - (2 - row) * 9;
      const c = row === 2 ? ["#8b6a3e", "#9a7848", "#7d6a36"] : ["#9c8a55", "#a99460", "#8f8a52"];
      const col = c[Math.floor(rand() * 3)];
      wrapped(x, (px) => {
        g.fillStyle = col;
        g.beginPath(); g.ellipse(px, y, r * 1.15, r, 0, Math.PI, Math.PI * 2); g.fill();
        g.fillStyle = "rgba(255,240,200,0.25)";      // sunny side
        g.beginPath(); g.ellipse(px - r * 0.3, y - r * 0.5, r * 0.45, r * 0.3, -0.4, 0, Math.PI * 2); g.fill();
      });
    }
  }
  g.fillStyle = "#6aa84f";
  g.fillRect(0, HORIZON - 4, LAYER_W, 6);
});
// Iloilo: the sea strait with Guimaras island across, and rice fields
backdrops.iloilo = makeLayer((g) => {
  seaStrip(g, 30, "#3b6fa0", "#6aa7d1");
  island(g, LAYER_W * 0.3, 260, 30, "#4f7f5c");
  island(g, LAYER_W * 0.78, 200, 24, "#5a8a66");
  for (let i = 0; i < 5; i++) {
    g.fillStyle = i % 2 ? "#9bd36a" : "#86c45a";
    g.fillRect(0, HORIZON - 12 + i * 2.6, LAYER_W, 2.6);
  }
});
// Bacolod: Mt. Kanlaon volcano (smoking) and tall sugarcane fields with a sugar mill
backdrops.sugarcane = makeLayer((g) => {
  farPeaks(g, "#d9e4d2");
  const cx = LAYER_W * 0.55, h = HORIZON * 0.72, half = h * 2.2;
  smoothMountain(g, [[cx - half, 0], [cx - half * 0.3, h * 0.75], [cx - h * 0.12, h], [cx + h * 0.12, h], [cx + half * 0.35, h * 0.7], [cx + half, 0]], "#6d8f6a", "#587a56");
  for (let i = 0; i < 6; i++) {                       // smoke from the crater
    g.fillStyle = `rgba(230,230,230,${0.6 - i * 0.08})`;
    g.beginPath(); g.arc(cx + i * 12, HORIZON - h - 10 - i * 12, 10 + i * 4, 0, Math.PI * 2); g.fill();
  }
  const mx = LAYER_W * 0.2;                           // sugar mill with a tall chimney
  wrapped(mx, (px) => {
    g.fillStyle = "#9ca3af"; g.fillRect(px, HORIZON - 34, 40, 22);
    g.fillStyle = "#b45309"; g.fillRect(px + 30, HORIZON - 70, 7, 58);
    g.fillStyle = "rgba(200,200,200,0.6)"; g.beginPath(); g.arc(px + 36, HORIZON - 78, 7, 0, Math.PI * 2); g.fill();
  });
  for (let x = 0; x < LAYER_W; x += 3) {              // the sugarcane: tall green stalks
    const h2 = 12 + rand() * 7;
    g.fillStyle = rand() < 0.5 ? "#4d9a34" : "#65b346";
    g.fillRect(x, HORIZON - h2, 1.6, h2);
  }
});
// Boracay: turquoise sea, white sand, small islands and paraw sailboats
backdrops.boracay = makeLayer((g) => {
  seaStrip(g, 40, "#0c7fb5", "#5eead4");
  island(g, LAYER_W * 0.4, 120, 34, "#3f8f5c");
  island(g, LAYER_W * 0.9, 80, 22, "#4b9a66");
  const sails = ["#ef4444", "#facc15", "#22c55e", "#3b82f6", "#f97316", "#ec4899"];
  for (let i = 0; i < 18; i++) {                      // paraw sailboats with colorful sails
    const x = rand() * LAYER_W, y = HORIZON - 12 - rand() * 18, c = sails[i % sails.length];
    wrapped(x, (px) => {
      g.fillStyle = "#7c4a1e"; g.fillRect(px - 8, y, 16, 2.5);
      g.strokeStyle = "#5b3a1e"; g.lineWidth = 1; g.beginPath(); g.moveTo(px - 12, y + 3); g.lineTo(px + 12, y + 3); g.stroke();   // outriggers
      fillPoly(g, c, [px, y - 18, px + 9, y - 1, px - 1, y - 1]);
      g.fillStyle = "#5b3a1e"; g.fillRect(px - 1, y - 19, 1.5, 19);
    });
  }
  g.fillStyle = "#f5ecd7";                            // white sand beach
  g.fillRect(0, HORIZON - 6, LAYER_W, 8);
});

// ----- MINDANAO backgrounds (rainforest, volcanoes, highlands, sea) -----
// Bumpy rainforest treetops along the horizon
function jungleCanopy(g, y, colors) {
  for (let x = -20; x < LAYER_W + 20; x += 9 + rand() * 8) {
    const r = 9 + rand() * 9, c = colors[Math.floor(rand() * colors.length)];
    g.fillStyle = c;
    g.beginPath(); g.arc(x, y - r * 0.5, r, Math.PI, Math.PI * 2); g.fill();
    g.fillRect(x - r, y - r * 0.5, r * 2, r * 0.5 + 3);
  }
}
// Cagayan de Oro: steep green hills and a river shining at the bottom
backdrops.cdo = makeLayer((g) => {
  farPeaks(g, "#c7d7cf");
  for (let i = 0; i < 9; i++) {
    const cx = (i / 9) * LAYER_W, h = HORIZON * (0.35 + rand() * 0.25), half = h * 1.1;
    smoothMountain(g, [[cx - half, 0], [cx - half * 0.3, h * 0.85], [cx, h], [cx + half * 0.35, h * 0.8], [cx + half, 0]], "#3f7d4f", "#2f6a40");
  }
  g.fillStyle = "#7fb7d9";                            // the river
  g.fillRect(0, HORIZON - 8, LAYER_W, 5);
  g.fillStyle = "rgba(255,255,255,0.6)";
  for (let i = 0; i < 40; i++) g.fillRect(rand() * LAYER_W, HORIZON - 7, 6 + rand() * 10, 1);   // white water
  jungleCanopy(g, HORIZON + 2, ["#2f6a40", "#3f7d4f", "#2a5e39"]);
});
// Bukidnon: a high, flat plateau with pineapple fields and the Kitanglad mountains in clouds
backdrops.bukidnon = makeLayer((g) => {
  for (let i = 0; i < 5; i++) {
    const cx = (i / 5) * LAYER_W + rand() * 60, h = HORIZON * (0.4 + rand() * 0.2), half = h * 2.6;
    smoothMountain(g, [[cx - half, 0], [cx - half * 0.4, h * 0.7], [cx, h], [cx + half * 0.4, h * 0.75], [cx + half, 0]], "#7f9db8", "#6a88a3");
    for (let k = 0; k < 4; k++) {                     // clouds sitting on the peaks
      g.fillStyle = "rgba(255,255,255,0.85)";
      g.beginPath(); g.ellipse(cx - 40 + k * 26, HORIZON - h + 6, 22, 9, 0, 0, Math.PI * 2); g.fill();
    }
  }
  for (let i = 0; i < 8; i++) {                       // pineapple field rows (grey-green and yellow-green)
    g.fillStyle = i % 2 ? "#7c9a6d" : "#a3b86c";
    g.fillRect(0, HORIZON - 18 + i * 2.4, LAYER_W, 2.4);
  }
});
// Davao: Mt. Apo, the highest mountain in the Philippines, with rainforest below
backdrops.apo = makeLayer((g) => {
  farPeaks(g, "#c9dccf");
  for (const cx of [LAYER_W * 0.3, LAYER_W * 0.8]) {
    const h = HORIZON * 0.85, half = h * 1.9;
    smoothMountain(g, [[cx - half, 0], [cx - half * 0.45, h * 0.55], [cx - half * 0.12, h * 0.95], [cx - half * 0.04, h],
      [cx + half * 0.04, h * 0.9], [cx + half * 0.12, h * 0.97], [cx + half * 0.5, h * 0.5], [cx + half, 0]], "#3d7a52", "#2e6643");
    for (let k = 0; k < 6; k++) {                     // a ring of clouds around the middle
      g.fillStyle = "rgba(255,255,255,0.8)";
      g.beginPath(); g.ellipse(cx - half * 0.5 + k * half * 0.2, HORIZON - h * 0.55, 30, 10, 0, 0, Math.PI * 2); g.fill();
    }
  }
  jungleCanopy(g, HORIZON + 2, ["#1f5e3a", "#2c7048", "#245f3c", "#3a8050"]);
});
// General Santos: a hot bay with big fishing boats and the fish port
backdrops.gensan = makeLayer((g) => {
  farPeaks(g, "#dccfb8");
  seaStrip(g, 26, "#2f6f9e", "#5ea1cf");
  for (let i = 0; i < 14; i++) {                      // big bancas (boats with outriggers)
    const x = rand() * LAYER_W, y = HORIZON - 8 - rand() * 12;
    const hull = ["#f8fafc", "#3b82f6", "#ef4444", "#facc15"][i % 4];
    wrapped(x, (px) => {
      fillPoly(g, hull, [px - 18, y, px + 18, y, px + 14, y + 5, px - 14, y + 5]);
      g.strokeStyle = "#3f3f46"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(px - 26, y + 6); g.lineTo(px + 26, y + 6); g.stroke();
      g.fillStyle = "#e5e7eb"; g.fillRect(px - 6, y - 7, 12, 7);
    });
  }
  for (let i = 0; i < 4; i++) {                       // port cranes
    const x = LAYER_W * (0.1 + i * 0.25);
    wrapped(x, (px) => {
      g.fillStyle = "#f97316";
      g.fillRect(px, HORIZON - 60, 4, 50);
      g.fillRect(px - 24, HORIZON - 60, 40, 4);
      g.fillRect(px - 22, HORIZON - 56, 2, 14);
    });
  }
  g.fillStyle = "#9ca3af";
  g.fillRect(0, HORIZON - 6, LAYER_W, 8);
});
// Zamboanga: the sea full of vintas (boats with striped, colorful sails) and Santa Cruz island
backdrops.zambo = makeLayer((g) => {
  seaStrip(g, 34, "#1d6fa5", "#55b3df");
  island(g, LAYER_W * 0.62, 160, 22, "#4f8f5c");
  wrapped(LAYER_W * 0.62, (px) => { g.fillStyle = "#f9b8c8"; g.fillRect(px - 150, HORIZON - 16, 300, 3); });   // pink sand beach
  const stripes = [["#ef4444", "#facc15", "#22c55e", "#3b82f6"], ["#f97316", "#a855f7", "#facc15", "#ef4444"], ["#22c55e", "#ec4899", "#3b82f6", "#facc15"]];
  for (let i = 0; i < 16; i++) {                      // vintas: rectangular sails with bright stripes
    const x = rand() * LAYER_W, y = HORIZON - 8 - rand() * 18, cols = stripes[i % 3], sw = 14, sh = 18;
    wrapped(x, (px) => {
      g.fillStyle = "#5b3a1e"; g.fillRect(px - 12, y, 24, 3);
      g.fillRect(px - 1, y - sh - 2, 1.5, sh + 2);
      for (let k = 0; k < 4; k++) {
        g.fillStyle = cols[k];
        g.fillRect(px, y - sh + k * (sh / 4), sw - k, sh / 4);
      }
    });
  }
  g.fillStyle = "#e9d8a6";
  g.fillRect(0, HORIZON - 5, LAYER_W, 7);
});

// The Visayas and Mindanao backgrounds (they draw their own hills, so the green hills hide)
const NEW_BG = ["cebu", "bohol", "iloilo", "sugarcane", "boracay", "cdo", "bukidnon", "apo", "gensan", "zambo", "airport"];
// How much each backdrop shows right now (they fade into each other)
const bgWeight = { generic: 1, kalisungan: 0, makiling: 0, taal: 0, manila: 0, arayat: 0, baguio: 0, ilocos: 0,
  cebu: 0, bohol: 0, iloilo: 0, sugarcane: 0, boracay: 0, cdo: 0, bukidnon: 0, apo: 0, gensan: 0, zambo: 0, airport: 0 };

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
let clearT = 0;        // ENFORCER power-up: frames left with no traffic
let crossing = null;   // the pedestrian crossing ahead (or null)
let crossTimer = 900;  // frames until the next crossing
let crashText = "WASAK!";
// Crash animation
let crashCar = null;     // the vehicle you hit (it gets knocked away)
let crashSide = 1;       // 1 = it was on your right, -1 = on your left
let crashKind = "hit";   // "hit" = hit a vehicle, "stop" = braked hard at a crossing (HINTO!)
let crashCracks = [];    // cracked-screen lines
let crashWords = [];     // little comic words ("BLAG!") flying from the crash
let combo, comboT, kita, floods, floodTimer, inFlood, splashT, magnetMax, slowMax, firstPickup;
// Roadside scenery (see section 9d-2)
let odo, zones, scenery, sceneryQueue, nextLandmarkAt, nextFillerAt, landmarkSide = 1;

let best = loadBest();
let ownedColors = loadOwnedColors(); // paint colors you bought
let carChoice = loadCarChoice();     // the color shown in the garage (can be one you're only trying on)
if (!PLAYER_COLORS[carChoice] || !ownedColors.includes(carChoice)) carChoice = 0;
let ownedChoice = carChoice;         // the last color you own that you picked (the one you drive with)
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

// withAirport = true: the run starts at an airport (the first 300 m)
function resetGame(withAirport = false) {
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
  pfx = null; edgeT = 0; enforcerT = 0; ghostXs = [];
  crossing = null;
  crossTimer = 900;      // first crossing after ~15 seconds
  parts = [];
  tilt = 0;
  recordShown = false;
  crashText = "WASAK!";
  crashCar = null;
  crashWords = [];
  crashCracks = [];
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
  setHills(hillsFor(0));            // small hills again for a new run
  lastPlaced["-1"] = lastPlaced["1"] = -Infinity;
  zones = [{ from: -Infinity, level: 0 }];
  scenery = [];
  sceneryQueue = [...LOCATIONS[0].landmarks];
  nextLandmarkAt = 0;
  nextSkywayAt = 20000;
  if (withAirport) {
    // the airport: terminal, control tower, a parked plane and the hangar along the first 300 m
    addWelcomeArch(12 * SEG_LEN, MAPS[mapChoice].name);          // "WELCOME TO VISAYAS"
    [["terminal", 22, -1], ["tower", 40, 1], ["parkedplane", 70, 1], ["hangar", 95, -1]].forEach(([kind, d, side]) =>
      addScenery(kind, d * SEG_LEN, side, true));
    for (let d = 18; d < DRAW_DIST * 0.9; d += 26) {             // small things: airport stuff first, then the first place's
      const at = d * SEG_LEN, side = d % 52 < 26 ? 1 : -1;
      const list = at < AIRPORT_LEN ? AIRPORT.fillers : LOCATIONS[0].fillers;
      if (list && sideFree(side, at, SCENERY_GAP)) addScenery(pickOne(list), at, side);
    }
    addWelcomeArch(AIRPORT_LEN + 1500, LOCATIONS[0].name);       // the first real place starts here
    nextLandmarkAt = AIRPORT_LEN + 3000;
  } else {
    // some small things already beside the road at the start
    for (let d = 15; d < DRAW_DIST * 0.9; d += 30) {
      addScenery(pickOne(LOCATIONS[0].fillers), d * SEG_LEN, d % 60 < 30 ? -1 : 1);
    }
    addWelcomeArch(30 * SEG_LEN, LOCATIONS[0].name);
  }
  nextFillerAt = DRAW_DIST * SEG_LEN;
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
// Which paint colors you own (a list of numbers). Everyone starts with Candy Red (0).
function loadOwnedColors() {
  try { const list = JSON.parse(localStorage.getItem("highwayDashColors")); return Array.isArray(list) ? list : [0]; }
  catch { return [0]; }
}
function saveOwnedColors() {
  try { localStorage.setItem("highwayDashColors", JSON.stringify(ownedColors)); } catch { /* ignore */ }
}
function loadTypeChoice() {
  try { return Number(localStorage.getItem("highwayDashType")) || 0; }
  catch { return 0; }
}
function saveTypeChoice(v) {
  try { localStorage.setItem("highwayDashType", v); } catch { /* ignore */ }
}
// Pera (money): all the pesos you ever collected. Spend ₱650 to unlock Hari ng Daan.
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
function loadMusicOn() {
  try { return localStorage.getItem("highwayDashMusic") !== "0"; }
  catch { return true; }
}
function saveMusicOn(v) {
  try { localStorage.setItem("highwayDashMusic", v ? "1" : "0"); } catch { /* ignore */ }
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
  if (k === "b") Music.toggle();               // B = background music on/off
  if ([" ", "arrowleft", "arrowright"].includes(k)) e.preventDefault(); // don't scroll the page
  if (mode === "flight" && (k === "enter" || k === " " || k === "escape")) { skipFlight(); return; }
  const onMaps = !mapsScreen.classList.contains("hidden");
  if ((k === "enter" || k === " ") && mode === "home" && onMaps) chooseMap(mapChoice);   // start on the picked map
  else if ((k === "enter" || k === " ") && mode === "home" && !homeScreen.classList.contains("hidden")) openMaps();
  else if ((k === "enter" || k === " ") && mode === "over") transition(startGame);
  if (k === "escape" && onMaps) transition(() => showScreen(homeScreen));
  if (k === "escape" && mode === "home" && (!wheelScreen.classList.contains("hidden") || !questScreen.classList.contains("hidden")) && !spinning) transition(goHomeScreen);
  if (onMaps && (k === "arrowleft" || k === "arrowright")) {        // move between the maps
    const keys = Object.keys(MAPS);
    const i = (keys.indexOf(mapChoice) + (k === "arrowright" ? 1 : -1) + keys.length) % keys.length;
    pickMap(keys[i]);
  }
  if (k === "escape" && mode === "over") transition(goHome);
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
musicBtn.addEventListener("click", () => Music.toggle());

// Home screen buttons
document.getElementById("play-btn").addEventListener("click", () => openMaps());
document.getElementById("again-btn").addEventListener("click", () => transition(startGame));
document.getElementById("home-btn").addEventListener("click", () => transition(goHome));
document.getElementById("howto-btn").addEventListener("click", () => transition(() => {
  homeScreen.classList.add("hidden");
  howtoScreen.classList.remove("hidden");
}));
document.getElementById("back-btn").addEventListener("click", () => transition(() => {
  howtoScreen.classList.add("hidden");
  homeScreen.classList.remove("hidden");
}));

// Car color picker: one button per paint. Locked colors show a 🔒 and their price.
// Clicking a locked color lets you try it on in the garage; "Bilhin" buys it.
const swatchBox = document.getElementById("swatches");
const colorBuyBtn = document.getElementById("color-buy");
const colorNameEl = document.getElementById("color-name");
PLAYER_COLORS.forEach((c, i) => {
  const sw = document.createElement("button");
  sw.className = "swatch";
  sw.dataset.car = i;
  // a shiny gradient: light top, main color, dark bottom
  // two colors: the main paint with a band of the design color across it
  sw.style.setProperty("--c", `linear-gradient(135deg, ${c.top} 0%, ${c.body} 40%, ${c.accent} 40%, ${c.accent} 58%, ${c.body} 58%, ${c.dark} 100%)`);
  sw.setAttribute("aria-label", c.name);
  sw.title = `${c.name} (${DESIGN_NAMES[c.design]})`;
  sw.innerHTML = `<span class="lock">🔒</span><span class="price">₱${c.price}</span>`;
  sw.addEventListener("click", () => {
    carChoice = i;
    if (ownedColors.includes(i)) {               // you own it: drive with it from now on
      ownedChoice = i;
      saveCarChoice(i);
    }
    if (typeof showGarage === "function") showGarage();   // redraw the garage picture
    showCarChoice();
  });
  swatchBox.appendChild(sw);
});
function showCarChoice() {
  const owned = ownedColors.includes(carChoice), c = PLAYER_COLORS[carChoice];
  for (const sw of swatchBox.children) {
    const i = Number(sw.dataset.car);
    sw.classList.toggle("selected", i === carChoice);
    sw.classList.toggle("locked", !ownedColors.includes(i));
  }
  colorNameEl.textContent = `${c.name} · ${DESIGN_NAMES[c.design]}`;
  colorBuyBtn.classList.toggle("hidden", owned);
  colorBuyBtn.textContent = `Bilhin ₱${c.price}`;
  colorBuyBtn.disabled = wallet < c.price;
}
colorBuyBtn.addEventListener("click", () => {
  const c = PLAYER_COLORS[carChoice];
  if (ownedColors.includes(carChoice) || wallet < c.price) return;
  wallet -= c.price;
  saveWallet(wallet);
  ownedColors.push(carChoice);
  saveOwnedColors();
  ownedChoice = carChoice;
  saveCarChoice(carChoice);
  Sound.init();
  Sound.coin();
  showGarage();
  showCarChoice();
});
showCarChoice();

// Garage: choose your vehicle with ◀ ▶ (or the arrow keys on the home screen)
if (!PLAYER_TYPES[typeChoice]) typeChoice = 0;      // an old save might point to a removed car
const previewCanvas = document.getElementById("car-preview");
let g = previewCanvas.getContext("2d");            // "g" = the garage picture
let svFlip = false;        // true while drawing the mirrored (left) side of a car
let noShadow = false;      // true while drawing car faces for the garage turntable

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
  // A smooth filled shape: fn draws the outline with moveTo / lineTo / curves
  path(fill, fn) {
    g.beginPath();
    fn(g);
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  },
  // A line or curve (not filled)
  line(color, width, fn) {
    g.beginPath();
    fn(g);
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = "round";
    g.stroke();
  },
  // Colors that blend from top (y0) to bottom (y1): gives a shiny, rounded look
  grad(y0, y1, stops) {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    for (const [at, c] of stops) gr.addColorStop(at, c);
    return gr;
  },
  // Wheel arch: a dark hole in the body with a thin edge around it
  arch(x, r, lip) {
    const y = GROUND - r;
    g.fillStyle = lip;
    g.beginPath(); g.arc(x, y, r + 5, Math.PI, Math.PI * 2); g.fill();
    sv.C(x, y, r + 3.5, "#0b0b0b");
  },
  // Alloy wheel: tire, shiny rim, spokes, (brake caliper), hub
  alloy(x, r, rim, spokes, caliper) {
    const y = GROUND - r;
    sv.C(x, y, r, "#0f0f0f");
    sv.C(x, y, r * 0.9, "#262626");
    const shine = g.createRadialGradient(x - r * 0.2, y - r * 0.25, 1, x, y, r * 0.7);
    shine.addColorStop(0, "#ffffff");
    shine.addColorStop(0.5, rim);
    shine.addColorStop(1, "#6b7280");
    sv.C(x, y, r * 0.68, shine);
    sv.C(x, y, r * 0.56, "#1f2937");
    if (caliper) {
      g.fillStyle = caliper;
      g.beginPath(); g.arc(x, y, r * 0.5, 3.6, 4.6); g.arc(x, y, r * 0.3, 4.6, 3.6, true); g.fill();
    }
    g.strokeStyle = rim;
    g.lineWidth = r * 0.14;
    g.lineCap = "round";
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2 + 0.3;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r * 0.58, y + Math.sin(a) * r * 0.58); g.stroke();
    }
    sv.C(x, y, r * 0.17, rim);
    sv.C(x, y, r * 0.07, "#111111");
  },
  shadow(x1, x2) {
    if (noShadow) return;              // (not on the garage turntable faces)
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

// Text that stays readable even when the side view is mirrored
function svText(text, x, y) {
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillText(text, svFlip ? FACE_W - x : x, y);
  g.restore();
}

// Sports car: smooth fastback body, wheel arches, side scoop, rear wing, alloy wheels
function sideSports(col) {
  sv.shadow(22, 264);
  const W1 = 72, W2 = 212, R = 18;
  sv.R(30, 80, 4, 9, "#111111");                              // rear wing struts (behind the body)
  sv.R(48, 79, 4, 9, "#111111");
  sv.path(sv.grad(58, 114, [[0, col.top], [0.42, col.body], [1, col.dark]]), (c) => {
    c.moveTo(24, 110);
    c.lineTo(19, 97);
    c.quadraticCurveTo(19, 88, 30, 87);                       // rounded rear corner
    c.lineTo(100, 83);                                        // trunk
    c.bezierCurveTo(122, 79, 138, 63, 162, 61);               // fastback up to the roof
    c.bezierCurveTo(184, 60, 198, 70, 214, 80);               // windshield down to the hood
    c.bezierCurveTo(232, 83, 250, 86, 258, 92);               // long low hood
    c.quadraticCurveTo(264, 98, 258, 106);                    // nose
    c.lineTo(250, 110);
  });
  paintDesignSide(col, 18, 82, 262, 111);                     // the paint's design (stripes, flames, ...)
  sv.path("#151515", (c) => { c.moveTo(94, 104); c.lineTo(192, 104); c.lineTo(190, 111); c.lineTo(96, 111); });   // side skirt
  sv.line("rgba(255,255,255,0.5)", 2, (c) => { c.moveTo(34, 89); c.bezierCurveTo(100, 85, 180, 84, 250, 90); });  // shine on the shoulder
  sv.path("#111111", (c) => { c.moveTo(104, 92); c.quadraticCurveTo(118, 87, 134, 89); c.lineTo(127, 101); c.quadraticCurveTo(114, 102, 106, 100); });   // air scoop
  sv.line(col.dark, 1.2, (c) => { c.moveTo(146, 84); c.quadraticCurveTo(143, 95, 148, 104); });   // door line
  sv.path(sv.grad(62, 84, [[0, "#4b5d70"], [1, "#0f172a"]]), (c) => {   // side windows
    c.moveTo(112, 83);
    c.bezierCurveTo(128, 79, 140, 66, 162, 65);
    c.bezierCurveTo(180, 64, 194, 72, 205, 81);
  });
  sv.R(157, 64, 3, 19, col.dark);                             // pillar between the windows
  sv.P("rgba(255,255,255,0.28)", [170, 66, 178, 66, 168, 82, 160, 82]);
  sv.path(col.body, (c) => { c.moveTo(196, 79); c.lineTo(206, 76); c.lineTo(207, 82); c.lineTo(198, 83); });   // mirror
  sv.path("#e0f2fe", (c) => { c.moveTo(244, 88); c.lineTo(259, 92); c.lineTo(258, 96); c.lineTo(246, 93); });  // headlight
  sv.path("#ff3b30", (c) => { c.moveTo(19, 92); c.lineTo(31, 90); c.lineTo(31, 95); c.lineTo(20, 97); });     // tail light
  sv.path("#111111", (c) => { c.moveTo(13, 74); c.lineTo(60, 72); c.lineTo(62, 77); c.lineTo(15, 80); });     // rear wing
  sv.R(13, 73, 49, 1.5, "#3f3f46");
  sv.arch(W1, R, col.dark);
  sv.arch(W2, R, col.dark);
  sv.alloy(W1, R, "#d1d5db", 5, "#dc2626");
  sv.alloy(W2, R, "#d1d5db", 5, "#dc2626");
}

// Electric car: smooth body, big glass roof, light strips, aero wheels
function sideElectric(col) {
  sv.shadow(30, 260);
  sv.P(col.body, [26, 112, 26, 94, 42, 86, 96, 82, 128, 62, 186, 60, 220, 79, 252, 87, 258, 99, 256, 112, 26, 112]);
  paintDesignSide(col, 24, 82, 260, 112);                     // the paint's design
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
  paintDesignSide(col, 16, 83, 262, 112);                     // the paint's design (before the window)
  sv.P(col.dark, [20, 90, 34, 85, 34, 83, 16, 86]);           // ducktail
  sv.glass([118, 82, 136, 69, 158, 67, 172, 82]);
  sv.P("#111111", [196, 85, 222, 85, 218, 79, 200, 79]);      // hood scoop
  sv.R(14, 102, 10, 6, "#d7dde2");                            // chrome bumpers
  sv.R(256, 98, 10, 6, "#d7dde2");
  sv.R(84, 108, 76, 4, "#c0c6cc");                            // side exhaust pipe
  sv.R(18, 92, 6, 7, "#ff3b30");
  sv.C(254, 92, 4, "#fde68a");
  sv.wheel(70, 19);
  sv.wheel(214, 17);
}

// Jeepney: passenger body with open windows, cab, long chrome hood, fenders and horses
function sideJeepney() {
  const look = JEEP_COLORS[0];
  sv.shadow(10, 272);
  const W1 = 62, W2 = 228, R = 16;
  const chrome = sv.grad(80, 110, [[0, "#f8fafc"], [0.5, "#aab3bc"], [1, "#e2e8f0"]]);
  // roof with stripes and a row of little lights
  sv.path(look.roof, (c) => { c.moveTo(10, 40); c.lineTo(204, 40); c.quadraticCurveTo(214, 40, 216, 48); c.lineTo(216, 51); c.lineTo(10, 51); });
  sv.R(10, 44, 205, 2, look.band);
  sv.R(10, 47, 205, 2, look.stripe);
  const bulbs = ["#ff3b30", "#facc15", "#4ade80", "#38bdf8"];
  for (let i = 0; i < 17; i++) sv.C(18 + i * 11, 39, 1.8, bulbs[i % 4]);
  // open window band with passengers
  sv.R(14, 51, 184, 28, "#2a1d12");
  const shirts = ["#38bdf8", "#f472b6", "#4ade80", "#facc15", "#a78bfa", "#fb923c", "#f87171"];
  for (let i = 0; i < 7; i++) {
    const px = 30 + i * 24;
    sv.C(px, 62, 4.5, "#8d5a3b");
    sv.R(px - 4, 57, 8, 2.5, "#1f1f1f");                      // hair
    sv.R(px - 6, 67, 12, 12, shirts[i]);
  }
  sv.R(14, 55, 184, 1.5, "#d7dde2");                          // grab rail
  for (let i = 0; i <= 8; i++) sv.R(14 + i * 23, 51, 2.5, 28, "#d7dde2");   // chrome posts
  // the cab: open driver window and the windshield edge
  sv.path("#2a1d12", (c) => { c.moveTo(198, 51); c.lineTo(213, 51); c.lineTo(223, 79); c.lineTo(198, 79); });
  sv.C(207, 63, 4.5, "#8d5a3b");                              // the driver
  sv.R(201, 68, 12, 11, "#f8fafc");
  sv.line("#bfe3f5", 3, (c) => { c.moveTo(213, 51); c.lineTo(223, 79); });
  sv.R(196, 51, 3, 28, look.roof);
  // painted body, with a rounded back corner
  sv.path(sv.grad(78, 110, [[0, look.band], [0.12, look.body], [1, look.dark]]), (c) => {
    c.moveTo(12, 79); c.lineTo(224, 79); c.lineTo(224, 108); c.lineTo(24, 108);
    c.quadraticCurveTo(12, 108, 12, 98);
  });
  sv.R(12, 80, 212, 8, look.band);                            // route sign band
  g.fillStyle = "#1e293b";
  g.font = "900 7px 'Trebuchet MS', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  svText("CALAUAN • MANILA", 110, 84.5);
  sv.R(12, 89, 212, 2, look.stripe);
  sv.R(14, 94, 208, 12, chrome);                              // stainless lower panel with ribs
  for (let x = 18; x < 220; x += 6) sv.R(x, 95, 1, 10, "rgba(100,116,139,0.45)");
  sv.R(4, 101, 12, 4, "#c9d0d6");                             // rear step
  // long chrome hood with louvers
  sv.path(chrome, (c) => { c.moveTo(222, 80); c.lineTo(256, 83); c.quadraticCurveTo(264, 85, 265, 92); c.lineTo(265, 108); c.lineTo(222, 108); });
  for (let i = 0; i < 6; i++) sv.R(230 + i * 4, 87, 2, 10, "#7b8794");
  sv.R(263, 86, 6, 21, "#9aa3ab");                            // grille seen from the side
  sv.C(264, 93, 4.5, "#e2e8f0");                              // headlight
  sv.C(265, 93, 3, "#fef9c3");
  sv.R(259, 104, 14, 5, "#d7dde2");                           // front bumper
  // front fender over the wheel
  sv.path(look.body, (c) => { c.moveTo(206, 108); c.quadraticCurveTo(208, 88, 228, 86); c.quadraticCurveTo(248, 88, 250, 108); });
  // two silver horses on the hood
  for (const hx of [244, 254]) {
    sv.P("#e5e7eb", [hx - 4, 83, hx + 3, 83, hx + 4, 78, hx + 6, 76, hx + 4, 74, hx + 1, 76, hx - 3, 77]);
  }
  sv.line("#cbd5e1", 1, (c) => { c.moveTo(260, 84); c.lineTo(262, 54); c.moveTo(250, 84); c.lineTo(251, 60); });   // antennas
  sv.P("#d62828", [262, 54, 272, 57, 262, 61]);
  sv.P("#1d4fbf", [251, 60, 259, 62, 251, 65]);
  sv.line("#cbd5e1", 1.5, (c) => { c.moveTo(222, 62); c.lineTo(232, 56); });   // side mirror
  sv.R(230, 50, 5, 10, "#e5e7eb");
  sv.arch(W1, R, "#9ca3af");
  sv.arch(W2, R, "#9ca3af");
  sv.alloy(W1, R, "#e5e7eb", 8, null);
  sv.alloy(W2, R, "#e5e7eb", 8, null);
}

// Hari ng Daan: a premium covered e-bike (3 wheels) in black and gold with a neon glow
function sideHari() {
  if (!noShadow) {                                            // cyan neon glow under it
    const glow = g.createRadialGradient(130, GROUND, 0, 130, GROUND, 120);
    glow.addColorStop(0, "rgba(34,211,238,0.55)");
    glow.addColorStop(1, "rgba(34,211,238,0)");
    g.fillStyle = glow;
    g.fillRect(10, GROUND - 25, 240, 30);
  }
  sv.shadow(30, 236);
  const W1 = 70, W2 = 212;
  const black = sv.grad(60, 112, [[0, "#3f3f46"], [0.3, "#18181b"], [1, "#050505"]]);
  // roof: rounded, gold edge, neon strip underneath
  sv.path(black, (c) => {
    c.moveTo(30, 28); c.quadraticCurveTo(30, 17, 44, 17); c.lineTo(186, 17);
    c.quadraticCurveTo(202, 17, 204, 28);
  });
  sv.R(30, 27, 174, 2, "#facc15");
  sv.R(32, 29, 170, 1.5, "#22d3ee");
  sv.R(100, 15, 30, 2, "#facc15");
  // rear canopy post (curved) and a gold grab bar
  sv.line("#0a0a0a", 5, (c) => { c.moveTo(38, 66); c.quadraticCurveTo(34, 44, 40, 28); });
  sv.line("#facc15", 1.2, (c) => { c.moveTo(40, 66); c.quadraticCurveTo(36, 44, 42, 28); });
  sv.line("#d4a017", 2, (c) => { c.moveTo(70, 44); c.lineTo(150, 44); });
  // red leather seat with stitching
  sv.path("#7f1d1d", (c) => { c.moveTo(52, 64); c.lineTo(52, 36); c.quadraticCurveTo(52, 32, 58, 32); c.lineTo(64, 32); c.lineTo(66, 64); });
  sv.path("#991b1b", (c) => { c.moveTo(60, 64); c.lineTo(128, 64); c.quadraticCurveTo(130, 57, 124, 56); c.lineTo(64, 56); });
  sv.line("#fca5a5", 0.8, (c) => { c.moveTo(58, 40); c.lineTo(58, 60); c.moveTo(66, 60); c.lineTo(124, 60); });
  // the body pod
  sv.path(black, (c) => {
    c.moveTo(30, 108); c.lineTo(27, 84); c.quadraticCurveTo(27, 64, 46, 64); c.lineTo(146, 64);
    c.quadraticCurveTo(160, 64, 160, 78); c.lineTo(160, 104); c.quadraticCurveTo(158, 109, 150, 109);
  });
  sv.line("#facc15", 1.5, (c) => { c.moveTo(46, 68); c.lineTo(148, 68); });
  sv.line("#facc15", 1.5, (c) => { c.moveTo(32, 101); c.lineTo(158, 101); });
  sv.P("#facc15", [64, 92, 100, 84, 92, 90, 128, 86, 118, 95, 64, 96]);   // gold flames
  g.fillStyle = "#facc15";
  g.font = "900 11px 'Trebuchet MS', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  svText("E-BIKE", 132, 79);
  sv.P("#facc15", [44, 82, 56, 82, 58, 74, 53, 78, 50, 72, 47, 78, 42, 74]);   // crown badge
  sv.path("#ff2d55", (c) => { c.moveTo(27, 80); c.lineTo(32, 80); c.lineTo(32, 92); c.lineTo(28, 92); });   // tail light
  sv.R(34, 106, 124, 2, "#22d3ee");                           // neon strip
  // footboard
  sv.path("#27272a", (c) => { c.moveTo(156, 95); c.lineTo(194, 95); c.lineTo(196, 104); c.lineTo(156, 104); });
  sv.R(156, 94, 38, 1.5, "#d4d4d8");
  // front cowl with the headlight
  sv.path(black, (c) => {
    c.moveTo(186, 98); c.quadraticCurveTo(190, 70, 204, 66); c.quadraticCurveTo(220, 64, 221, 80);
    c.lineTo(220, 96); c.quadraticCurveTo(214, 103, 200, 103);
  });
  sv.line("#facc15", 1.2, (c) => { c.moveTo(192, 76); c.quadraticCurveTo(204, 68, 218, 72); });
  sv.C(219, 80, 3.5, "#fef9c3");
  // curved windshield from the roof down to the cowl
  sv.path(sv.grad(28, 70, [[0, "rgba(51,65,85,0.95)"], [1, "rgba(15,23,42,0.9)"]]), (c) => {
    c.moveTo(188, 29); c.bezierCurveTo(200, 40, 205, 56, 204, 67); c.lineTo(197, 69);
    c.bezierCurveTo(197, 56, 193, 42, 182, 29);
  });
  sv.line("rgba(255,255,255,0.35)", 1.5, (c) => { c.moveTo(192, 34); c.quadraticCurveTo(199, 48, 199, 62); });
  sv.line("#0a0a0a", 3, (c) => { c.moveTo(188, 29); c.bezierCurveTo(200, 40, 205, 56, 204, 67); });   // windshield frame
  // handlebar and fork in gold
  sv.line("#facc15", 2.5, (c) => { c.moveTo(204, 68); c.lineTo(194, 58); });
  sv.R(191, 56, 5, 3, "#111111");
  sv.line("#facc15", 3, (c) => { c.moveTo(212, 84); c.lineTo(212, 104); });
  sv.arch(W1, 16, "#27272a");
  sv.alloy(W1, 16, "#d4a017", 6, null);
  sv.alloy(W2, 14, "#d4a017", 6, null);
}

// ===== GARAGE TURNTABLE (the car spins 360° on the home screen) =====
// A 2D picture can't really turn, so we cheat like old 3D games did:
// the car is a box with 4 faces (back, front, left side, right side).
// We draw each face as a flat picture, then squeeze and slant it to where
// that face would be at the current angle. Only faces that point at you are drawn.

// --- Front views (the game only needed back views before) ---
// Same units as the back views: x from -0.5 to 0.5, y goes up (negative).
function frontLights(R, P, C, y0, h, col) {          // headlights on both sides
  R(-0.47, y0, 0.2, h, "#fef9c3");
  R(0.27, y0, 0.2, h, "#fef9c3");
  R(-0.47, y0 + h - 0.012, 0.2, 0.012, "#fde047");
  R(0.27, y0 + h - 0.012, 0.2, 0.012, "#fde047");
}
function frontSports(x, y, w, col) {
  const { R, P, C, T, shade } = painter(x, y, w);
  tire(R, -0.5, -0.15, 0.17, 0.15);
  tire(R, 0.33, -0.15, 0.17, 0.15);
  P(col.body, [-0.5, -0.12, 0.5, -0.12, 0.53, -0.2, 0.5, -0.29, -0.5, -0.29, -0.53, -0.2]);
  shade(-0.53, -0.29, 1.06, 0.17);
  P("#111111", [-0.42, -0.05, 0.42, -0.05, 0.46, -0.12, -0.46, -0.12]);   // front splitter
  P("#0b0b0b", [-0.2, -0.2, 0.2, -0.2, 0.17, -0.13, -0.17, -0.13]);       // big middle intake
  for (let i = 0; i < 5; i++) R(-0.16 + i * 0.075, -0.195, 0.012, 0.06, "#27272a");
  P("#0b0b0b", [-0.46, -0.2, -0.27, -0.2, -0.3, -0.13, -0.44, -0.13]);    // side intakes
  P("#0b0b0b", [0.46, -0.2, 0.27, -0.2, 0.3, -0.13, 0.44, -0.13]);
  P("#e0f2fe", [-0.5, -0.28, -0.25, -0.27, -0.29, -0.235, -0.49, -0.235]);   // sharp LED headlights
  P("#e0f2fe", [0.5, -0.28, 0.25, -0.27, 0.29, -0.235, 0.49, -0.235]);
  R(-0.45, -0.262, 0.14, 0.008, "#38bdf8");
  R(0.31, -0.262, 0.14, 0.008, "#38bdf8");
  paintDesign({ R, P, C }, col, -0.5, -0.29, 0.5, -0.12);   // the paint's design
  C(0, -0.22, 0.025, "#facc15");                       // badge
}
function frontElectric(x, y, w, col) {
  const { R, P } = painter(x, y, w);
  tire(R, -0.48, -0.14, 0.15, 0.14);
  tire(R, 0.33, -0.14, 0.15, 0.14);
  R(-0.5, -0.36, 1, 0.24, col.body);
  paintDesign({ R, P, C: painter(x, y, w).C }, col, -0.5, -0.36, 0.5, -0.12);
  R(-0.48, -0.31, 0.96, 0.02, "#e0f2fe");                // full-width light bar
  R(-0.48, -0.312, 0.96, 0.006, "#ffffff");
  R(-0.3, -0.2, 0.6, 0.05, col.dark);                     // closed grille (no engine!)
  P("#e0f2fe", [0.01, -0.27, -0.02, -0.235, 0, -0.235, -0.01, -0.21, 0.022, -0.245, 0.002, -0.245]);   // ⚡
  R(-0.44, -0.14, 0.88, 0.03, "#38bdf8");
  P(col.top, [-0.5, -0.36, 0.5, -0.36, 0.44, -0.42, -0.44, -0.42]);
  P("#1e293b", [-0.38, -0.42, 0.38, -0.42, 0.3, -0.62, -0.3, -0.62]);   // big glass
  P(GLASS, [-0.16, -0.43, -0.08, -0.43, -0.13, -0.61, -0.2, -0.61]);
  R(-0.55, -0.45, 0.07, 0.05, col.body);
  R(0.48, -0.45, 0.07, 0.05, col.body);
}
function frontMuscle(x, y, w, col) {
  const { R, P, C } = painter(x, y, w);
  tire(R, -0.5, -0.16, 0.18, 0.16);
  tire(R, 0.32, -0.16, 0.18, 0.16);
  R(-0.5, -0.2, 1, 0.06, "#d7dde2");                      // chrome bumper
  R(-0.5, -0.38, 1, 0.18, col.body);
  R(-0.34, -0.35, 0.68, 0.12, "#111111");                 // big black grille
  for (let i = 0; i < 6; i++) R(-0.32, -0.34 + i * 0.02, 0.64, 0.006, "#4b5563");
  for (const hx of [-0.42, 0.42]) {                       // round headlights in chrome
    C(hx, -0.29, 0.06, "#d7dde2");
    C(hx, -0.29, 0.045, "#fef9c3");
  }
  C(0, -0.29, 0.025, "#d4a017");                          // gold badge
  paintDesign({ R, P, C }, col, -0.5, -0.38, 0.5, -0.2);
  P(col.top, [-0.5, -0.38, 0.5, -0.38, 0.44, -0.44, -0.44, -0.44]);
  P("#111111", [-0.1, -0.44, 0.1, -0.44, 0.08, -0.48, -0.08, -0.48]);   // hood scoop
  P("#1f2a33", [-0.32, -0.46, 0.32, -0.46, 0.28, -0.62, -0.28, -0.62]);
  P(GLASS, [-0.14, -0.47, -0.06, -0.47, -0.1, -0.61, -0.18, -0.61]);
  P(col.top, [-0.32, -0.62, 0.32, -0.62, 0.28, -0.66, -0.28, -0.66]);
}
function frontJeepney(x, y, w) {
  const look = JEEP_COLORS[0];
  const { R, P, C, shade } = painter(x, y, w);
  tire(R, -0.46, -0.22, 0.14, 0.22);
  tire(R, 0.32, -0.22, 0.14, 0.22);
  P(look.body, [-0.52, -0.22, -0.3, -0.22, -0.3, -0.5, -0.38, -0.56, -0.52, -0.5]);   // fenders
  P(look.body, [0.52, -0.22, 0.3, -0.22, 0.3, -0.5, 0.38, -0.56, 0.52, -0.5]);
  shade(-0.52, -0.56, 1.04, 0.34);
  R(-0.31, -0.6, 0.62, 0.36, "#e2e8f0");               // tall chrome grille
  shade(-0.31, -0.6, 0.62, 0.36);
  for (let i = 0; i < 11; i++) R(-0.28 + i * 0.053, -0.57, 0.026, 0.3, "#8b949c");
  R(-0.31, -0.6, 0.62, 0.025, "#f8fafc");
  for (const hx of [-0.41, 0.41]) {                    // round headlights in chrome rings
    C(hx, -0.44, 0.07, "#e5e7eb");
    C(hx, -0.44, 0.052, "#fef9c3");
    C(hx - 0.015, -0.455, 0.015, "#ffffff");
  }
  R(-0.54, -0.26, 1.08, 0.06, "#d7dde2");              // chrome bumper
  R(-0.54, -0.26, 1.08, 0.012, "#ffffff");
  R(-0.12, -0.25, 0.24, 0.05, "#f9d71c");              // plate
}
function frontHari(x, y, w) {
  const { R, P, C, shade } = painter(x, y, w);
  R(-0.07, -0.22, 0.14, 0.22, TIRE);                   // ONE front wheel in the middle
  R(-0.04, -0.19, 0.08, 0.16, "#d4a017");
  R(-0.11, -0.4, 0.03, 0.22, "#facc15");               // gold fork
  R(0.08, -0.4, 0.03, 0.22, "#facc15");
  P("#141414", [-0.2, -0.3, 0.2, -0.3, 0.22, -0.48, 0.14, -0.55, -0.14, -0.55, -0.22, -0.48]);   // narrow cowl
  shade(-0.22, -0.55, 0.44, 0.25);
  C(0, -0.42, 0.075, "rgba(253,230,138,0.5)");          // headlight
  C(0, -0.42, 0.05, "#fef9c3");
  R(-0.18, -0.33, 0.36, 0.015, "#22d3ee");
  R(-0.32, -0.56, 0.64, 0.025, "#facc15");              // handlebar
  R(-0.36, -0.575, 0.06, 0.04, "#111111");
  R(0.3, -0.575, 0.06, 0.04, "#111111");
  R(-0.5, -0.22, 0.12, 0.16, TIRE);                    // the two back wheels peeking out
  R(0.38, -0.22, 0.12, 0.16, TIRE);
  P("#141414", [-0.5, -0.24, -0.3, -0.24, -0.32, -0.5, -0.48, -0.5]);   // sides of the body behind
  P("#141414", [0.5, -0.24, 0.3, -0.24, 0.32, -0.5, 0.48, -0.5]);
  R(-0.48, -0.5, 0.18, 0.015, "#facc15");
  R(0.3, -0.5, 0.18, 0.015, "#facc15");
}
function drawFrontVehicle(pt, x, y, w) {
  const col = PLAYER_COLORS[carChoice];
  if (pt.id === "electric") frontElectric(x, y, w, col);
  else if (pt.id === "muscle") frontMuscle(x, y, w, col);
  else if (pt.id === "jeepney") frontJeepney(x, y, w);
  else if (pt.id === "hari") frontHari(x, y, w);
  else frontSports(x, y, w, col);
}

// --- Make the 4 face pictures once (again only when the car or color changes) ---
const FACE_W = 300, FACE_H = 150;
function makeFaceCanvas() {
  const c = document.createElement("canvas");
  c.width = FACE_W;
  c.height = FACE_H;
  return c;
}
// Finds the left, right and top edges of what was drawn (by looking at see-through pixels)
function measure(c) {
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, x1 = 0, y0 = c.height;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4 + 3] > 40) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
      }
    }
  }
  return { x0, x1: x1 + 1, y0 };
}
let faces = null, facesKey = "";
function buildFaces(pt) {
  const key = pt.id + carChoice;
  if (key === facesKey) return faces;
  try {
    return makeFaces(pt, key);
  } finally {                                    // always give the real screen back
    ctx = gameCtx;
    g = previewCanvas.getContext("2d");
    noShadow = false;
    svFlip = false;
  }
}
function makeFaces(pt, key) {
  facesKey = key;
  const col = PLAYER_COLORS[carChoice];
  // 1) side view (drawn by the old garage functions, which paint on "g")
  const side = makeFaceCanvas(), sideL = makeFaceCanvas();
  const keepG = g;
  noShadow = true;                                       // no shadow or glow on the face pictures
  for (const [c, flip] of [[side, false], [sideL, true]]) {
    g = c.getContext("2d");
    svFlip = flip;
    if (flip) { g.translate(FACE_W, 0); g.scale(-1, 1); }   // mirror for the other side
    if (pt.id === "electric") sideElectric(col);
    else if (pt.id === "muscle") sideMuscle(col);
    else if (pt.id === "jeepney") sideJeepney();
    else if (pt.id === "hari") sideHari();
    else sideSports(col);
  }
  g = keepG;
  svFlip = false;
  noShadow = false;
  // 2) back and front views (drawn by the road painters, which paint on "ctx").
  // x is set to the middle of the game screen so no extra side panel is added.
  const back = makeFaceCanvas(), front = makeFaceCanvas();
  const keepCtx = ctx;
  noShadow = true;
  for (const [c, fn] of [[back, drawPlayerVehicle], [front, drawFrontVehicle]]) {
    ctx = c.getContext("2d");
    ctx.translate(FACE_W / 2 - W / 2, 0);
    ctx.beginPath();
    ctx.rect(W / 2 - FACE_W / 2, 0, FACE_W, GROUND);     // nothing below the ground line
    ctx.clip();
    fn(pt, W / 2, GROUND, 100);
  }
  ctx = keepCtx;
  noShadow = false;
  // 3) measure them so all faces are the same height (same scale)
  const ms = measure(side), mb = measure(back), mf = measure(front);
  const sideH = GROUND - ms.y0;
  const k = sideH / (GROUND - mb.y0);                    // back/front are scaled by k
  faces = {
    side, sideL, back, front,
    sx0: ms.x0, sx1: ms.x1,                              // where the side picture starts/ends
    // back and front are drawn the same size and centered, so they share one left/right range
    // (that keeps a narrow front, like the e-bike's, narrow instead of stretching it)
    bx0: Math.min(mb.x0, mf.x0), bx1: Math.max(mb.x1, mf.x1),
    fx0: Math.min(mb.x0, mf.x0), fx1: Math.max(mb.x1, mf.x1), k,
    len: ms.x1 - ms.x0,                                  // car length (pixels)
    wid: (Math.max(mb.x1, mf.x1) - Math.min(mb.x0, mf.x0)) * k,   // car width (pixels)
    h: sideH,
  };
  return faces;
}

// --- The garage room (drawn every frame behind the car) ---
let spin = 0.6;            // the car's angle (radians)
let spinHold = 0;          // after you drag the car, wait a bit before auto-spinning again
let lastGarage = 0;
function drawGarageRoom(c, pw, ph) {
  const floorY = ph * 0.6;
  // back wall: painted concrete with a darker bottom
  const wall = c.createLinearGradient(0, 0, 0, floorY);
  wall.addColorStop(0, "#2a3442");
  wall.addColorStop(1, "#3c4756");
  c.fillStyle = wall;
  c.fillRect(0, 0, pw, floorY);
  // roll-up door in the middle (metal slats)
  const dx = pw * 0.3, dw = pw * 0.4, dy = ph * 0.12;
  c.fillStyle = "#56616f";
  c.fillRect(dx, dy, dw, floorY - dy);
  c.fillStyle = "#47515e";
  for (let y = dy + 6; y < floorY; y += 9) c.fillRect(dx, y, dw, 2);
  c.fillStyle = "#1f2732";
  c.fillRect(dx - 5, dy - 5, dw + 10, 6);
  c.fillRect(dx - 5, dy, 5, floorY - dy);
  c.fillRect(dx + dw, dy, 5, floorY - dy);
  // sign above the door with jeepney stripes
  const sw = dw * 0.9, sx = pw / 2 - sw / 2, sy = 4;
  c.fillStyle = "#0f172a";
  c.fillRect(sx, sy, sw, dy - 10);
  const stripe = ["#d62828", "#f9c80e", "#1d4fbf"];
  for (let i = 0; i < 18; i++) {
    c.fillStyle = stripe[i % 3];
    c.fillRect(sx + (i * sw) / 18, sy + dy - 13, sw / 18, 3);
  }
  c.fillStyle = "#f9c80e";
  c.font = `900 ${Math.round(ph * 0.065)}px 'Trebuchet MS', sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText("KASKASERO GARAGE", pw / 2, sy + (dy - 13) / 2);
  // left: pegboard with tools
  c.fillStyle = "#8a6a45";
  c.fillRect(pw * 0.04, ph * 0.14, pw * 0.21, ph * 0.3);
  c.fillStyle = "#6f5536";
  for (let y = ph * 0.17; y < ph * 0.43; y += 7) for (let x = pw * 0.055; x < pw * 0.245; x += 7) c.fillRect(x, y, 1.5, 1.5);
  c.fillStyle = "#cbd5e1";                       // wrench, hammer, screwdriver
  c.fillRect(pw * 0.07, ph * 0.19, 3, ph * 0.16);
  c.beginPath(); c.arc(pw * 0.07 + 1.5, ph * 0.19, 5, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#d62828";
  c.fillRect(pw * 0.12, ph * 0.18, 4, ph * 0.17);
  c.fillStyle = "#94a3b8";
  c.fillRect(pw * 0.105, ph * 0.18, 18, 7);
  c.fillStyle = "#f9c80e";
  c.fillRect(pw * 0.18, ph * 0.2, 5, ph * 0.08);
  c.fillStyle = "#cbd5e1";
  c.fillRect(pw * 0.181, ph * 0.28, 3, ph * 0.08);
  // right: red tool cabinet
  const tx = pw * 0.78, tw = pw * 0.17, ty = floorY - ph * 0.3;
  c.fillStyle = "#b91c1c";
  c.fillRect(tx, ty, tw, ph * 0.3);
  c.fillStyle = "#7f1d1d";
  for (let i = 1; i < 5; i++) c.fillRect(tx + 3, ty + (i * ph * 0.3) / 5, tw - 6, 2);
  c.fillStyle = "#e5e7eb";
  for (let i = 0; i < 5; i++) c.fillRect(tx + tw / 2 - 6, ty + 5 + (i * ph * 0.3) / 5, 12, 2);
  // a stack of tires on the left
  for (let i = 0; i < 3; i++) {
    const ty2 = floorY - 2 - i * 11;
    c.fillStyle = "#111827";
    c.beginPath(); c.ellipse(pw * 0.1, ty2, 22, 7, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#374151";
    c.beginPath(); c.ellipse(pw * 0.1, ty2 - 2, 22, 6, 0, 0, Math.PI); c.fill();
  }
  // floor: shiny grey with yellow safety lines
  const floor = c.createLinearGradient(0, floorY, 0, ph);
  floor.addColorStop(0, "#4b5563");
  floor.addColorStop(1, "#1f2937");
  c.fillStyle = floor;
  c.fillRect(0, floorY, pw, ph - floorY);
  c.strokeStyle = "rgba(250,204,21,0.8)";
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(pw * 0.08, ph); c.lineTo(pw * 0.2, floorY);
  c.moveTo(pw * 0.92, ph); c.lineTo(pw * 0.8, floorY);
  c.stroke();
  // hanging light: a lamp with a cone of light on the car
  c.fillStyle = "#111827";
  c.fillRect(pw / 2 - 1, 0, 2, 4);
  const cone = c.createLinearGradient(0, 0, 0, ph);
  cone.addColorStop(0, "rgba(255,248,220,0.28)");
  cone.addColorStop(1, "rgba(255,248,220,0.02)");
  c.fillStyle = cone;
  c.beginPath();
  c.moveTo(pw / 2 - 14, 0); c.lineTo(pw / 2 + 14, 0);
  c.lineTo(pw / 2 + pw * 0.34, ph); c.lineTo(pw / 2 - pw * 0.34, ph);
  c.fill();
}

// Draws one face: its bottom-left goes to point A, bottom-right to point B.
// Slanting the picture like this makes it look like it's at an angle.
function drawFace(c, img, x0, x1, A, B, s, keep = 0) {
  const iw = x1 - x0;
  const top = keep ? GROUND - keep : 0;                // keep = only the bottom part (cars' front/back)
  c.save();
  c.setTransform((B.x - A.x) / iw, (B.y - A.y) / iw, 0, s, A.x, A.y);
  c.drawImage(img, x0, top, iw, GROUND - top, 0, top - GROUND, iw, GROUND - top);
  c.restore();
}

function drawGarage(pt) {
  const pc = previewCanvas, c = g;
  const pw = pc.width, ph = pc.height;
  c.setTransform(1, 0, 0, 1, 0, 0);
  drawGarageRoom(c, pw, ph);
  const f = buildFaces(pt);
  const cx = pw / 2, gy = ph * 0.8;
  const s = Math.min((pw * 0.62) / f.len, (ph * 0.5) / f.h);   // fit the car in the picture
  const tilt = 0.18;                                   // we look down a little: far points go up
  // turntable: chrome ring + dark disc with marks that turn with the car
  const tr = pw * 0.36;
  c.fillStyle = "#94a3b8";
  c.beginPath(); c.ellipse(cx, gy + 3, tr + 5, (tr + 5) * tilt, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#1e293b";
  c.beginPath(); c.ellipse(cx, gy, tr, tr * tilt, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = "rgba(250,204,21,0.6)";
  c.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = spin + (i * Math.PI) / 4;
    c.beginPath();
    c.moveTo(cx + Math.cos(a) * tr * 0.82, gy + Math.sin(a) * tr * 0.82 * tilt);
    c.lineTo(cx + Math.cos(a) * tr * 0.95, gy + Math.sin(a) * tr * 0.95 * tilt);
    c.stroke();
  }
  // the 4 corners of the car seen from above
  const a = (f.len * s) / 2, b = (f.wid * s) / 2;
  const fx = Math.sin(spin), fz = -Math.cos(spin);     // the way the car points
  const rx = -fz, rz = fx;                             // the car's right-hand side
  const pt2 = (u, v) => {                              // u = forward, v = right
    const X = u * fx + v * rx, Z = u * fz + v * rz;
    return { x: cx + X, y: gy + Z * tilt, z: Z };
  };
  const FR = pt2(a, b), FL = pt2(a, -b), RR = pt2(-a, b), RL = pt2(-a, -b);
  // shadow under the car
  c.fillStyle = "rgba(0,0,0,0.45)";
  c.beginPath();
  c.moveTo(FR.x, FR.y); c.lineTo(FL.x, FL.y); c.lineTo(RL.x, RL.y); c.lineTo(RR.x, RR.y);
  c.closePath();
  c.fill();
  // which faces point at us, and in what order to draw them (far first)
  const list = [];
  // Cars: the back and front pictures are cut at the body line (the 3D top above
  // replaces their windows). Boxy vehicles keep the whole picture.
  const pr = PROFILES[pt.id] || {};
  const keepPart = (b) => (b && b < 1 ? b * f.h / f.k : 0);   // how much of the picture to keep (picture pixels)
  const cutBack = keepPart(pr.beltB ?? pr.belt), cutFront = keepPart(pr.beltF ?? pr.belt);
  if (fz < 0) list.push({ z: (RL.z + RR.z) / 2, d: () => drawFace(c, f.back, f.bx0, f.bx1, RL, RR, s * f.k, cutBack) });
  if (fz > 0) list.push({ z: (FR.z + FL.z) / 2, d: () => drawFace(c, f.front, f.fx0, f.fx1, FR, FL, s * f.k, cutFront) });
  if (rz > 0) list.push({ z: (RR.z + FR.z) / 2, d: () => drawFace(c, f.side, f.sx0, f.sx1, RR, FR, s) });
  if (rz < 0) list.push({ z: (FL.z + RL.z) / 2, d: () => drawFace(c, f.sideL, FACE_W - f.sx1, FACE_W - f.sx0, FL, RL, s) });
  list.sort((p, q) => p.z - q.z);
  // Seen from a little above, the top of the car shows: the body ("deck") and the roof.
  // u = along the car (-1 back, 1 front), v = across, h = how high (part of the car's height)
  const top = (u0, u1, v, hh, color) => {
    const lift = hh * f.h * s;
    const q = [pt2(u1 * a, v * b), pt2(u1 * a, -v * b), pt2(u0 * a, -v * b), pt2(u0 * a, v * b)];
    c.fillStyle = color;
    c.beginPath();
    q.forEach((p, i) => (i ? c.lineTo(p.x, p.y - lift) : c.moveTo(p.x, p.y - lift)));
    c.closePath();
    c.fill();
  };
  const col = PLAYER_COLORS[carChoice];
  const prof = PROFILES[pt.id];
  if (prof) {
    // CARS: the top is made of pieces along the car (trunk, rear window, roof,
    // windshield, hood). Each piece has a height at its back end and at its front end,
    // so windows slope like on a real car.
    const glassC = "#1f2a33";
    const paint = { body: col.body, top: col.top, glass: glassC, dark: "#1e293b", ...(prof.paint ? prof.paint() : {}) };
    const quad = (u0, u1, h0, h1, v0, v1) => {         // 4 corners of one piece, lifted to its heights
      const P = (u, v, hh) => { const q = pt2(u * a, v * b); return { x: q.x, y: q.y - hh * f.h * s, z: q.z }; };
      return [P(u1, v1, h1), P(u1, -v1, h1), P(u0, -v0, h0), P(u0, v0, h0)];
    };
    const area = (q) => {                              // + or - tells which way a piece is facing
      let A = 0;
      for (let i = 0; i < 4; i++) { const p1 = q[i], p2 = q[(i + 1) % 4]; A += p1.x * p2.y - p2.x * p1.y; }
      return A;
    };
    const ref = Math.sign(area(quad(-1, 1, 0, 0, 1, 1))) || 1;   // the direction "facing up" looks like now
    const fill = (q, color) => {
      c.fillStyle = color;
      c.beginPath();
      q.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.closePath();
      c.fill();
    };
    // the body top under everything (so there are no holes)
    const [d0, d1] = prof.deck || [-0.98, 0.98];
    fill(quad(d0, d1, prof.belt, prof.belt, 0.96, 0.96), paint.top);
    const pieces = prof.pieces.map(([u0, u1, h0, h1, v0, v1, kind], i) => {
      const q = quad(u0, u1, h0, h1, v0, v1);
      return { q, kind, src: [u0, u1, h0, h1], z: q.reduce((m, p) => m + p.z, 0) / 4 + i * 0.001 };   // (+ a tiny bit keeps the list order on ties)
    }).filter((pc) => Math.sign(area(pc.q)) === ref);   // skip pieces that face away from us
    pieces.sort((p1, p2) => p1.z - p2.z);              // far pieces first
    // stripes continue over the hood, roof and trunk (for striped paints)
    const bands = col.design === "stripes" ? [[-0.17, -0.07], [0.07, 0.17]] : col.design === "racing" ? [[-0.14, 0.14]] : [];
    const band = (pc, vA, vB, color) => {
      const [u0, u1, h0, h1] = pc.src;
      const P = (u, v, hh) => { const q = pt2(u * a, v * b); return { x: q.x, y: q.y - (hh + 0.004) * f.h * s }; };
      fill([P(u1, vB, h1), P(u1, vA, h1), P(u0, vA, h0), P(u0, vB, h0)], color);
    };
    for (const pc of pieces) {
      fill(pc.q, paint[pc.kind]);
      if (pt.colors && (pc.kind === "top" || pc.kind === "body")) for (const [vA, vB] of bands) band(pc, vA, vB, col.accent);
      if (pc.kind === "glass") {                       // a light shine line across the glass
        const m = (p1, p2, t) => ({ x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t });
        const A = m(pc.q[0], pc.q[1], 0.25), B = m(pc.q[0], pc.q[1], 0.38), C = m(pc.q[3], pc.q[2], 0.3), D = m(pc.q[3], pc.q[2], 0.17);
        c.fillStyle = "rgba(255,255,255,0.28)";
        c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.lineTo(C.x, C.y); c.lineTo(D.x, D.y); c.fill();
      }
    }
    for (const item of list) item.d();
    return;
  }
  // JEEPNEY and HARI are boxy: a flat roof on top is enough.
  // The tops go first and the faces after, so the windshield and windows
  // (which are part of the faces) are never covered by the roof.
  const R = ROOFS[pt.id];
  const deckC = pt.id === "jeepney" ? JEEP_COLORS[0].body : "#141414";
  const roofC = pt.id === "jeepney" ? JEEP_COLORS[0].roof : "#0a0a0a";
  top(-0.98, 0.98, 0.96, R.deck, deckC);
  top(R.r0, R.r1, R.rv, R.roof, roofC);
  if (pt.id === "jeepney") top(R.r0, R.r1, R.rv * 0.35, R.roof + 0.004, JEEP_COLORS[0].band);   // colored band
  if (pt.id === "hari") top(R.r0 + 0.1, R.r1 - 0.1, 0.12, R.roof + 0.004, "#facc15");   // gold roof stripe
  for (const item of list) item.d();
}
// The shape of each car's top, measured from its side picture.
// Each piece: [back u, front u, height at back, height at front, half-width at back, at front, color]
// u: -1 = rear bumper, 1 = front bumper. Heights are parts of the car's full height.
const PROFILES = {
  sports: { belt: 0.6, deck: [-0.31, 0.6], pieces: [
    [-0.95, -0.31, 0.6, 0.63, 0.96, 0.96, "top"],        // trunk
    [-0.31, 0.155, 0.62, 0.97, 0.72, 0.58, "glass"],     // rear window (fastback)
    [0.155, 0.33, 0.98, 0.98, 0.58, 0.58, "body"],       // roof
    [0.33, 0.6, 0.98, 0.67, 0.58, 0.74, "glass"],        // windshield
    [0.6, 0.97, 0.67, 0.53, 0.96, 0.9, "top"],           // hood
    [-0.99, -0.82, 0.78, 0.77, 1.02, 1.02, "dark"],      // rear wing
  ]},
  electric: { belt: 0.56, pieces: [
    [-1, -0.4, 0.58, 0.63, 0.96, 0.96, "top"],
    [-0.4, -0.12, 0.63, 0.97, 0.72, 0.6, "glass"],
    [-0.12, 0.38, 0.97, 0.97, 0.6, 0.6, "glass"],        // all-glass roof
    [0.38, 0.67, 0.97, 0.68, 0.6, 0.74, "glass"],
    [0.67, 1, 0.68, 0.5, 0.96, 0.9, "top"],
  ]},
  muscle: { belt: 0.6, pieces: [
    [-1, -0.38, 0.6, 0.66, 0.96, 0.96, "top"],
    [-0.38, -0.19, 0.66, 1, 0.7, 0.6, "glass"],
    [-0.19, 0.16, 1, 1, 0.6, 0.6, "body"],
    [0.16, 0.32, 1, 0.68, 0.6, 0.72, "glass"],
    [0.32, 1, 0.68, 0.6, 0.96, 0.92, "top"],             // long hood
    [0.62, 0.8, 0.69, 0.66, 0.12, 0.12, "dark"],         // hood scoop
  ]},
  // Jeepney: the back is a full box (keep the whole back picture), the front has a long hood
  jeepney: { belt: 0.48, beltB: 1, beltF: 0.48,
    paint: () => ({ top: JEEP_COLORS[0].body, body: JEEP_COLORS[0].body, roof: JEEP_COLORS[0].roof,
      band: JEEP_COLORS[0].band, stripe: JEEP_COLORS[0].stripe, chrome: "#d7dde2" }),
    pieces: [
      [-0.96, 0.58, 0.96, 0.96, 0.99, 0.99, "roof"],     // long roof
      [-0.96, 0.58, 0.965, 0.965, 0.32, 0.32, "band"],   // yellow band on the roof
      [-0.96, 0.58, 0.97, 0.97, 0.1, 0.1, "stripe"],     // blue line in the middle
      [0.5, 0.82, 0.41, 0.41, 0.99, 0.99, "body"],       // front fenders
      [0.555, 0.63, 0.86, 0.49, 0.85, 0.85, "glass"],    // windshield
      [0.62, 0.95, 0.48, 0.42, 0.62, 0.62, "chrome"],    // long chrome hood
    ]},
  // Hari ng Daan: canopy roof, curved windshield and a narrow front cowl
  hari: { belt: 0.53, beltB: 1, beltF: 0.53,
    paint: () => ({ top: "#141414", body: "#18181b", roof: "#18181b", gold: "#facc15", dark: "#27272a" }),
    pieces: [
      [0.32, 0.72, 0.24, 0.24, 0.6, 0.6, "dark"],        // footboard
      [-0.97, 0.81, 0.98, 0.98, 1, 1, "roof"],           // canopy roof
      [-0.6, 0.6, 0.985, 0.985, 0.1, 0.1, "gold"],       // gold stripe on the roof
      [0.643, 0.806, 0.87, 0.5, 0.95, 0.6, "glass"],     // curved windshield
      [0.66, 0.98, 0.51, 0.4, 0.55, 0.32, "body"],       // front cowl
    ]},
};
// Where each vehicle's body top and roof are (measured from the side pictures)
const ROOFS = {
  sports:   { deck: 0.58, roof: 0.98, r0: -0.02, r1: 0.36, rv: 0.55 },
  electric: { deck: 0.56, roof: 0.97, r0: -0.14, r1: 0.4, rv: 0.6, glass: true },
  muscle:   { deck: 0.6,  roof: 0.98, r0: -0.2, r1: 0.16, rv: 0.6 },
  jeepney:  { deck: 0.43, roof: 0.97, r0: -0.96, r1: 0.55, rv: 0.98 },
  hari:     { deck: 0.43, roof: 0.9,  r0: -0.9, r1: 0.58, rv: 0.98 },
};

// Turns the car a little every frame while the home screen is showing
function updateGarage(now) {
  const homeEl = document.getElementById("home");
  if (homeEl.classList.contains("hidden")) return;
  const dt = Math.min(3, (now - (lastGarage || now)) / (1000 / 60));
  lastGarage = now;
  if (spinHold > 0) spinHold -= dt;
  else spin += 0.012 * dt;                           // one full turn in about 9 seconds
  drawGarage(PLAYER_TYPES[typeChoice]);
}

// Drag the car with your mouse or finger to turn it yourself
(() => {
  let dragX = null;
  previewCanvas.addEventListener("pointerdown", (e) => { dragX = e.clientX; spinHold = 120; });
  window.addEventListener("pointermove", (e) => {
    if (dragX === null) return;
    spin += (e.clientX - dragX) * 0.02;
    dragX = e.clientX;
    spinHold = 120;
  });
  window.addEventListener("pointerup", () => { dragX = null; });
})();

function showGarage() {
  const pt = PLAYER_TYPES[typeChoice];
  const locked = isLocked(pt);
  const nameEl = document.getElementById("car-name");
  nameEl.textContent = "";
  if (pt.tag) {                                   // a big badge first, then a smaller name: [E-BIKE] "Hari ng Daan"
    const badge = document.createElement("span");
    badge.className = "tag big-tag";
    badge.textContent = pt.tag;
    const sub = document.createElement("span");
    sub.className = "car-sub";
    sub.textContent = `"${pt.name}"`;
    nameEl.append(badge, sub);
  } else {
    nameEl.append(pt.name);
  }
  document.getElementById("car-special").textContent = pt.special;
  // Speed and Slim: a 10-block meter. Yellow = the vehicle itself, green = your upgrades.
  const base = { speed: speedRating(pt.maxSpeed), slim: slimRating(pt.w * pt.hit) };
  const now = { speed: speedRating(topSpeed(pt)), slim: slimRating(crashWidth(pt)) };
  for (const stat of ["speed", "slim"]) {
    const meter = document.getElementById("stat-" + stat);
    meter.innerHTML = "";
    for (let i = 0; i < 10; i++) {
      const cell = document.createElement("i");
      if (i < Math.round(base[stat])) cell.className = "on";
      else if (i < Math.round(now[stat])) cell.className = "up";
      meter.appendChild(cell);
    }
    const lvl = upLevel(pt, stat);
    document.getElementById("val-" + stat).textContent =
      stat === "speed" ? `${topSpeed(pt)} km/h` : `${Math.round(now.slim)}/10`;
    const btn = document.getElementById("up-" + stat);
    if (pt.maxed) {                                // Hari ng Daan is already the best
      btn.textContent = "MAX";
      btn.disabled = true;
    } else if (lvl >= UPGRADE_MAX) {
      btn.textContent = "MAX ✓";
      btn.disabled = true;
    } else {
      btn.textContent = `⬆ ₱${UPGRADE_COST[lvl]}`;
      btn.disabled = locked || wallet < UPGRADE_COST[lvl];
    }
    btn.title = pt.maxed ? "Already maxed out" : `Level ${lvl}/${UPGRADE_MAX}`;
    document.getElementById("lvl-" + stat).textContent = pt.maxed ? "" : `Lv ${lvl}/${UPGRADE_MAX}`;
  }
  document.getElementById("buy-btn").textContent = `Bilhin ₱${pt.price || 0}`;
  document.getElementById("color-row").classList.toggle("hidden", !pt.colors);
  document.getElementById("lock-box").classList.toggle("hidden", !locked);
  document.getElementById("buy-btn").disabled = wallet < pt.price;
  document.getElementById("wallet").textContent = wallet;
  if (typeof showCarChoice === "function") showCarChoice();
  document.getElementById("play-btn").disabled = locked;
  previewCanvas.classList.toggle("locked", locked);
  drawGarage(pt);
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

// Buy one upgrade level for the vehicle you're looking at
function buyUpgrade(stat) {
  const pt = PLAYER_TYPES[typeChoice];
  const lvl = upLevel(pt, stat);
  if (pt.maxed || isLocked(pt) || lvl >= UPGRADE_MAX || wallet < UPGRADE_COST[lvl]) return;
  wallet -= UPGRADE_COST[lvl];
  saveWallet(wallet);
  upgrades[pt.id] = upgrades[pt.id] || { speed: 0, slim: 0 };
  upgrades[pt.id][stat] = lvl + 1;
  saveUpgrades();
  Sound.init();
  Sound.powerup();
  showGarage();
  const btn = document.getElementById("up-" + stat);   // a little "pop" on the meter
  btn.closest(".stat").classList.remove("pop");
  void btn.offsetWidth;
  btn.closest(".stat").classList.add("pop");
}
document.getElementById("up-speed").addEventListener("click", () => buyUpgrade("speed"));
document.getElementById("up-slim").addEventListener("click", () => buyUpgrade("slim"));

// Buy Hari ng Daan from your Pera (the price is in PLAYER_TYPES, now ₱2000)
document.getElementById("buy-btn").addEventListener("click", () => {
  const price = PLAYER_TYPES.find((t) => t.id === "hari").price;
  if (wallet < price) return;
  wallet -= price;
  saveWallet(wallet);
  Sound.init();
  Sound.powerup();
  unlockHari();
});

document.getElementById("prev-car").addEventListener("click", () => changeType(-1));
document.getElementById("next-car").addEventListener("click", () => changeType(1));
document.addEventListener("keydown", (e) => {
  if (mode !== "home" || homeScreen.classList.contains("hidden")) return;   // only on the garage screen
  if (e.key === "ArrowLeft") changeType(-1);
  if (e.key === "ArrowRight") changeType(1);
});


// Swipe controls for phones: swipe left or right on the game to change lanes
let touchX = null, touchY = null, touchTime = 0;
const stage = document.querySelector(".stage");
stage.addEventListener("pointerdown", () => skipFlight());   // tap to skip the flight
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
    // Two volume knobs: "master" for everything, and "sfx" for sound effects only.
    // Music goes straight into master, so turning off sound effects keeps the music
    // (and turning off the music keeps the sound effects).
    this.master = this.ac.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ac.destination);
    this.sfx = this.ac.createGain();
    this.sfx.gain.value = this.muted ? 0 : 1;
    this.sfx.connect(this.master);

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
    gain.connect(this.sfx);
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
    this.rainGain.connect(this.sfx);
    rain.start();
    Music.start();        // background music starts once sound is allowed
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
    g.connect(this.sfx);
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
    g.connect(this.sfx);
    src.start(t);
    src.stop(t + dur + 0.05);
  },

  coin()   { this.tone(988, 0.08, "square", 0.08); this.tone(1319, 0.22, "square", 0.08, null, 0.07); },
  crash()  { this.noise(0.9, 0.7, 900); this.tone(140, 0.7, "sawtooth", 0.3, 35); },
  // Glass breaking: a few quick, high "tssk" sounds one after another
  shatter() { [0, 0.05, 0.11, 0.19].forEach((d, i) => this.noise(0.18 - i * 0.03, 0.35, 4500 + i * 900, "highpass", d)); },
  // Metal parts hitting the road: short "klang" tones
  clank(delay = 0) { this.tone(420 + Math.random() * 300, 0.12, "square", 0.08, 180, delay); },
  // A jet plane flying by: a long rushing sound that rises and falls
  jet() { this.noise(3, 0.22, 500); this.noise(2.4, 0.08, 2200, "bandpass", 0.3); this.tone(80, 3, "sawtooth", 0.04, 120); },
  // Tires screeching when you brake hard
  screech() { this.tone(1300, 0.6, "sawtooth", 0.07, 900); this.noise(0.6, 0.25, 2600, "bandpass"); },
  introHorn() {  // the intro: "beep-beep-beeeep!" plus a little engine rev
    [[0, 0.14], [0.2, 0.14], [0.4, 0.55]].forEach(([d, len]) => {
      this.tone(415, len, "square", 0.09, null, d);
      this.tone(523, len, "square", 0.07, null, d);
    });
    this.tone(70, 0.9, "sawtooth", 0.12, 160, 0.5);
  },
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
  // A traffic enforcer's whistle: "PRRT! PRRRRT!"
  // A high tone whose pitch wobbles very fast (the ball rattling inside the whistle).
  whistle() {
    if (!this.ac) return;
    for (const [start, len] of [[0, 0.18], [0.26, 0.5]]) {
      const t = this.ac.currentTime + start;
      const o = this.ac.createOscillator();
      const wobble = this.ac.createOscillator();     // shakes the pitch 35 times a second
      const depth = this.ac.createGain();
      const g = this.ac.createGain();
      o.type = "sine";
      o.frequency.value = 2650;
      wobble.frequency.value = 35;
      depth.gain.value = 180;
      wobble.connect(depth);
      depth.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      g.gain.setValueAtTime(0.16, t + len - 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g);
      g.connect(this.sfx);
      o.start(t); wobble.start(t);
      o.stop(t + len + 0.05); wobble.stop(t + len + 0.05);
    }
  },

  // Sound effects on/off (the music has its own switch)
  toggleMute() {
    this.muted = !this.muted;
    saveMuted(this.muted);
    if (this.sfx) this.sfx.gain.value = this.muted ? 0 : 1;
    syncAudioButtons();
  },
};
// Shows the right icons and words on all the sound buttons (top bar and home screen)
function syncAudioButtons() {
  muteBtn.textContent = Sound.muted ? "🔇" : "🔊";
  muteBtn.classList.toggle("off", Sound.muted);
  musicBtn.classList.toggle("off", !Music.on);
  const sfxHome = document.getElementById("sfx-toggle"), musicHome = document.getElementById("music-toggle");
  sfxHome.textContent = Sound.muted ? "🔇 Sounds: OFF" : "🔊 Sounds: ON";
  sfxHome.classList.toggle("off", Sound.muted);
  sfxHome.setAttribute("aria-pressed", String(!Sound.muted));
  musicHome.textContent = Music.on ? "🎵 Music: ON" : "🎵 Music: OFF";
  musicHome.classList.toggle("off", !Music.on);
  musicHome.setAttribute("aria-pressed", String(Music.on));
}

// ----- 9c-2. BACKGROUND MUSIC: original loops made with the Web Audio API -----
// A tiny "sequencer" plays one step every 16th note: drums, bass, chord
// arpeggios and a melody. Notes are scheduled a little ahead of time, so the
// beat stays steady even while the game is busy drawing.
// There are 4 THEMES, and the music switches at the start of the next bar:
//   menu  = calm and friendly (home screen, game over)
//   drive = the upbeat jeepney-ride loop (normal driving)
//   night = moody synth (driving at night)
//   boss  = fast and intense (Manila, the final and hardest stretch)
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);   // note number → frequency

const THEMES = {
  menu: {
    BPM: 96,
    bass:   [41, 45, 46, 48, 41, 45, 46, 48],             // F – Am – Bb – C
    chords: [[65, 69, 72], [64, 69, 72], [65, 70, 74], [64, 67, 72],
             [65, 69, 72], [64, 69, 72], [65, 70, 74], [64, 67, 72]],
    melody: [
      72, 0, 0, 69, 0, 72, 74, 0,    76, 0, 0, 72, 0, 0, 69, 0,
      74, 0, 0, 70, 0, 74, 77, 0,    76, 0, 74, 0, 72, 0, 0, 0,
      72, 0, 74, 0, 76, 0, 77, 0,    76, 0, 72, 0, 69, 0, 0, 0,
      70, 0, 74, 0, 77, 0, 74, 0,    72, 0, 0, 0, 0, 0, 0, 0,
    ],
    kick: [0, 8], snare: [], hat: [], bassSteps: [0, 8], bassUp: [],
    bassType: "triangle", bassVol: 0.45, bassLen: 3.5,
    arpEvery: 2, arpType: "triangle", arpVol: 0.07, arpLen: 2.5,
    leadType: "triangle", leadVol: 0.12, leadLen: 3,
  },
  drive: {
    BPM: 132,
    bass:   [43, 38, 40, 36, 43, 38, 40, 36],             // G – D – Em – C
    chords: [[67, 71, 74], [62, 66, 69], [64, 67, 71], [60, 64, 67],
             [67, 71, 74], [62, 66, 69], [64, 67, 71], [60, 64, 67]],
    melody: [
      79, 76, 74, 76, 79, 0, 81, 79,     74, 0, 71, 74, 76, 74, 71, 69,
      71, 74, 76, 0, 79, 76, 74, 71,     72, 71, 69, 67, 69, 0, 71, 74,
      79, 81, 83, 81, 79, 0, 76, 79,     81, 0, 78, 76, 74, 0, 76, 78,
      79, 76, 74, 76, 71, 0, 74, 76,     72, 74, 76, 74, 72, 71, 69, 67,
    ],
    kick: [0, 4, 8, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14],
    bassSteps: [0, 3, 6, 8, 11, 14], bassUp: [6, 14],
    bassType: "triangle", bassVol: 0.5, bassLen: 1.8,
    arpEvery: 2, arpType: "square", arpVol: 0.05, arpLen: 1.5,
    leadType: "square", leadVol: 0.09, leadLen: 2.2,
  },
  night: {
    BPM: 116,
    bass:   [45, 41, 48, 43, 45, 41, 48, 43],             // Am – F – C – G
    chords: [[69, 72, 76], [65, 69, 72], [67, 72, 76], [67, 71, 74],
             [69, 72, 76], [65, 69, 72], [67, 72, 76], [67, 71, 74]],
    melody: [
      76, 0, 74, 72, 0, 69, 0, 72,     72, 0, 69, 0, 65, 0, 69, 0,
      72, 0, 74, 76, 0, 79, 0, 76,     74, 0, 71, 0, 67, 0, 0, 0,
      81, 0, 79, 76, 0, 74, 0, 76,     77, 0, 76, 72, 0, 69, 0, 0,
      76, 0, 79, 0, 84, 0, 79, 76,     74, 0, 71, 74, 0, 0, 0, 0,
    ],
    kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14],
    bassSteps: [0, 2, 4, 6, 8, 10, 12, 14], bassUp: [],    // pulsing synth bass
    bassType: "sawtooth", bassVol: 0.16, bassLen: 1.2,
    arpEvery: 1, arpType: "square", arpVol: 0.03, arpLen: 2,
    leadType: "sawtooth", leadVol: 0.05, leadLen: 3,
  },
  boss: {
    BPM: 152,
    bass:   [40, 36, 38, 35, 40, 36, 38, 35],             // Em – C – D – B
    chords: [[64, 67, 71], [60, 64, 67], [62, 66, 69], [59, 63, 66],
             [64, 67, 71], [60, 64, 67], [62, 66, 69], [59, 63, 66]],
    melody: [
      76, 79, 83, 79, 76, 79, 83, 86,    84, 83, 79, 76, 72, 76, 79, 76,
      78, 81, 86, 81, 78, 81, 86, 88,    87, 86, 83, 78, 75, 78, 83, 0,
      76, 79, 83, 79, 76, 79, 83, 86,    84, 83, 79, 76, 72, 76, 79, 76,
      78, 81, 86, 81, 78, 81, 86, 88,    88, 86, 83, 81, 79, 78, 76, 75,
    ],
    kick: [0, 3, 4, 8, 11, 12], snare: [4, 12, 14], hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    bassSteps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], bassUp: [2, 6, 10, 14],
    bassType: "sawtooth", bassVol: 0.14, bassLen: 0.9,
    arpEvery: 2, arpType: "square", arpVol: 0.04, arpLen: 1.2,
    leadType: "square", leadVol: 0.1, leadLen: 1.6,
  },
};

const Music = {
  on: loadMusicOn(),
  gain: null,
  timer: null,
  step: 0,
  nextTime: 0,
  theme: THEMES.menu,
  themeName: "menu",
  want: "menu",      // the theme we should switch to at the next bar

  start() {
    if (!Sound.ac || this.timer) return;
    this.gain = Sound.ac.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(Sound.master);
    this.nextTime = Sound.ac.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  },

  // Called every frame: picks the theme and the loudness for this moment
  update() {
    if (!this.gain) return;
    const driving = mode === "playing" || mode === "countdown" || mode === "crash";
    if (!driving) this.want = "menu";
    else if (currentLocation().boss) this.want = "boss";
    else if (atmo.night > 0.5) this.want = "night";
    else this.want = "drive";
    let target = driving ? 1 : 0.75;
    if (paused || mode === "over") target = 0.4;
    if (mode === "crash") target = 0.25;
    this.gain.gain.setTargetAtTime(this.on ? 0.2 * target : 0, Sound.ac.currentTime, 0.3);
  },

  toggle() {
    this.on = !this.on;
    saveMusicOn(this.on);
    syncAudioButtons();
  },

  // Plans the next few steps just ahead of time
  schedule() {
    while (this.nextTime < Sound.ac.currentTime + 0.12) {
      if (this.step % 16 === 0 && this.want !== this.themeName) {   // switch themes on a new bar
        this.themeName = this.want;
        this.theme = THEMES[this.want];
        this.step = 0;
      }
      const stepDur = 60 / this.theme.BPM / 4;      // one 16th note
      this.playStep(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % 128;            // 8 bars × 16 steps
    }
  },

  note(freq, t, dur, type, vol) {
    const ac = Sound.ac;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);   // quick start
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur); // fade out
    o.connect(g);
    g.connect(this.gain);
    o.start(t);
    o.stop(t + dur + 0.05);
  },

  drum(t, kind) {
    const ac = Sound.ac;
    if (kind === "kick") {                          // a low "boom" that drops in pitch
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.setValueAtTime(130, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g);
      g.connect(this.gain);
      o.start(t);
      o.stop(t + 0.2);
      return;
    }
    const src = ac.createBufferSource();            // snare and hi-hat are short noise bursts
    src.buffer = Sound.noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = kind === "snare" ? "bandpass" : "highpass";
    f.frequency.value = kind === "snare" ? 1800 : 7000;
    const g = ac.createGain();
    const len = kind === "snare" ? 0.14 : 0.04;
    g.gain.setValueAtTime(kind === "snare" ? 0.45 : 0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(f);
    f.connect(g);
    g.connect(this.gain);
    src.start(t, Math.random() * 0.5);
    src.stop(t + len + 0.02);
  },

  playStep(s, t, d) {
    const th = this.theme;
    const bar = Math.floor(s / 16);
    const i = s % 16;
    if (th.kick.includes(i)) this.drum(t, "kick");
    if (th.snare.includes(i)) this.drum(t, "snare");
    if (th.hat.includes(i)) this.drum(t, "hat");
    if (th.bassSteps.includes(i)) {
      const up = th.bassUp.includes(i) ? 12 : 0;    // jump up an octave sometimes
      this.note(midi(th.bass[bar] + up), t, d * th.bassLen, th.bassType, th.bassVol);
    }
    if (i % th.arpEvery === 0) {                    // the chord's notes one after another
      const ch = th.chords[bar];
      this.note(midi(ch[(i / th.arpEvery) % 3]), t, d * th.arpLen, th.arpType, th.arpVol);
    }
    if (i % 2 === 0) {                              // melody (eighth notes)
      const m = th.melody[bar * 8 + i / 2];
      if (m) this.note(midi(m), t, d * th.leadLen, th.leadType, th.leadVol);
    }
  },
};
// Home screen sound buttons (they do the same as 🔊 and 🎵 in the top bar)
document.getElementById("sfx-toggle").addEventListener("click", () => { Sound.init(); Sound.toggleMute(); if (!Sound.muted) Sound.coin(); });
document.getElementById("music-toggle").addEventListener("click", () => { Sound.init(); Music.start(); Music.toggle(); });
syncAudioButtons();

// ----- 9d. MAPS, LOCATIONS, WEATHER and TIME OF DAY -----
// There are 3 maps: Luzon, Visayas and Mindanao. Each map is a list of places.
// Every 2.5 km you reach the next place. Each place has its own time of day and
// weather. After the last place the trip starts again from the first one (lap 2).
// Special settings a place can have:
//   heat: true    = TAG-INIT challenge (wiggly hot road, less traffic, +₱100 bonus)
//   boss: true    = big city, plays the "boss" music
//   kalesa: true  = horse carriages in the traffic
//   palms / pines / jungle: true = which trees grow beside the road
//   skyway: true  = raised highways cross above the road, planes: true = airplanes in the sky
//   fog: true     = misty, grass: [[r,g,b],[r,g,b]] = ground color, icon = emoji for the map
const LOCATION_DIST = 250000;              // road distance from one place to the next
const UNITS_PER_KM = LOCATION_DIST / 2.5;  // so each place is 2.5 km apart
// landmarks = places you pass, in this order. fillers = smaller things in between.
// bg = which mountain is in the background. Places without fillers just have trees.
const LUZON = [
  { name: "Calauan", icon: "🍍", kalesa: true, time: "day", rain: false, bg: "kalisungan", note: "Pineapple country! Next stop: PUP Calauan",
    landmarks: ["pineapple", "farm", "burger", "chicken", "church", "pup"],
    fillers: ["kubo", "pinefield", "pinefield", "taho", "sorbetes"] },
  { name: "Bay", icon: "🥖", time: "day", rain: false, bg: "makiling", note: "Halaman at monay! Food trip in Bay",
    landmarks: ["garden", "bakery", "burger", "chicken", "garden", "church", "bucket", "hospital", "bakery"],
    fillers: ["house", "store", "fishball", "taho"] },
  { name: "Los Baños", icon: "🌧️", time: "day", rain: true, bg: "makiling", floods: true, note: "Rainy season! Baha sa daan!",
    landmarks: ["cafe", "mall", "school", "cafe", "mall", "school"],
    fillers: ["cafe", "house", "store", "fishball", "sorbetes"] },
  { name: "Calamba", icon: "🔥", heat: true, time: "day", rain: false, bg: "makiling", note: "Rizal Shrine and resorts! Swimming time",
    landmarks: ["rizal", "slides", "pool", "slides", "pool"],
    fillers: ["palm", "palm", "pool", "sorbetes"], palms: true },
  { name: "SLEX", icon: "🌙", skyway: true, time: "night",  rain: false, note: "Night drive. Watch the tail lights" },
  { name: "Tagaytay", icon: "🌋",  time: "sunset", rain: false, bg: "taal", note: "Taal Volcano at sunset" },
  { name: "Manila", icon: "🏙️", boss: true, kalesa: true, skyway: true, planes: true, time: "night",  rain: false, bg: "manila", note: "City lights at night!" },
  // After Manila the trip goes north on NLEX
  { name: "Pampanga", icon: "⭐", skyway: true, time: "day", rain: false, bg: "arayat", note: "Christmas capital! Giant parols and sisig",
    landmarks: ["parol", "sisig", "ricefield", "parol", "church", "sisig"],
    fillers: ["parolpole", "parolpole", "ricefield", "kubo"],
    grass: [[146, 214, 98], [134, 204, 88]] },              // bright rice-field green
  { name: "Baguio", icon: "🌲", time: "day", rain: false, bg: "baguio", fog: true, pines: true, note: "Summer capital! Cool air, fog and pine trees",
    landmarks: ["cathedral", "burnham", "strawberry", "ubestore", "strawberry"],
    fillers: ["pines", "pines", "house", "ubestore"],
    grass: [[86, 152, 106], [78, 142, 98]] },               // dark mountain green
  { name: "Ilocos", icon: "🌬️", kalesa: true, time: "sunset", rain: false, bg: "ilocos", palms: true, note: "Vigan heritage and Bangui windmills",
    landmarks: ["vigan", "windmill", "paoay", "empanada", "windmill", "vigan"],
    fillers: ["lamppost", "lamppost", "empanada", "windmill"],
    grass: [[206, 196, 132], [196, 186, 122]] },            // dry sandy ground by the sea
];
// VISAYAS: island hopping (beaches, churches, sea, sugarcane)
const VISAYAS = [
  { name: "Cebu City", icon: "✝️", boss: true, kalesa: true, skyway: true, planes: true, time: "day", rain: false, bg: "cebu", palms: true,
    note: "Queen City of the South! Magellan's Cross and lechon",
    landmarks: ["magellan", "santonino", "lechon", "santonino", "lechon", "magellan"],
    fillers: ["house", "store", "lechon", "palm"] },
  { name: "Bohol", icon: "🐒", time: "day", rain: false, bg: "bohol", palms: true,
    note: "Chocolate Hills and the tiny tarsier!",
    landmarks: ["tarsier", "loboc", "baclayon", "tarsier", "loboc"],
    fillers: ["chochill", "chochill", "kubo", "palm"],
    grass: [[130, 186, 92], [120, 176, 84]] },
  { name: "Iloilo", icon: "🍜", time: "sunset", rain: false, bg: "iloilo", palms: true,
    note: "Miagao Church and hot La Paz batchoy",
    landmarks: ["miagao", "batchoy", "ricefield", "miagao", "batchoy"],
    fillers: ["kubo", "ricefield", "house", "batchoy"] },
  { name: "Bacolod", icon: "🎭", time: "day", rain: false, bg: "sugarcane",
    note: "City of Smiles! MassKara masks and chicken inasal",
    landmarks: ["masskara", "ruins", "inasal", "masskara", "inasal"],
    fillers: ["cane", "cane", "house", "store"],
    grass: [[150, 200, 92], [140, 190, 84]] },
  { name: "Boracay", icon: "⛵", time: "sunset", rain: false, bg: "boracay", palms: true,
    note: "White sand, sailboats and the best sunsets!",
    landmarks: ["paraw", "willys", "beachbar", "paraw", "beachbar"],
    fillers: ["palm", "palm", "beachbar"],
    grass: [[240, 232, 210], [232, 222, 198]] },            // white sand
];
// MINDANAO: rainforest, volcanoes and highlands
const MINDANAO = [
  { name: "Cagayan de Oro", icon: "🛶", time: "day", rain: true, bg: "cdo", jungle: true,
    note: "Whitewater rafting and ziplines! (It's raining)",
    landmarks: ["rafting", "zipline", "rafting", "zipline"],
    fillers: ["house", "store", "kubo"],
    grass: [[96, 168, 90], [88, 158, 82]] },
  { name: "Bukidnon", icon: "🤠", fog: true, time: "day", rain: false, bg: "bukidnon",
    note: "Highlands! Pineapple fields, ranches and cool mist",
    landmarks: ["pineapples", "ranch", "monastery", "pineapples", "ranch"],
    fillers: ["pinefield", "pinefield", "kubo"],
    grass: [[122, 182, 98], [112, 172, 90]] },
  { name: "Davao", icon: "🦅", boss: true, skyway: true, planes: true, time: "day", rain: false, bg: "apo", jungle: true,
    note: "Mt. Apo, the Philippine Eagle and durian!",
    landmarks: ["eagle", "durian", "eagle", "durian"],
    fillers: ["durian", "house", "store"],
    grass: [[84, 156, 86], [76, 146, 78]] },
  { name: "General Santos", icon: "🐟", heat: true, time: "day", rain: false, bg: "gensan", palms: true,
    note: "Tuna Capital! So hot: TAG-INIT!",
    landmarks: ["tuna", "fishport", "tuna", "fishport"],
    fillers: ["palm", "house", "store"] },
  { name: "Zamboanga", icon: "🏰", time: "sunset", rain: false, bg: "zambo", palms: true,
    note: "Asia's Latin City! Fort Pilar and colorful vintas",
    landmarks: ["fortpilar", "vinta", "fortpilar", "vinta"],
    fillers: ["palm", "lamppost", "vinta"],
    grass: [[214, 200, 150], [204, 190, 140]] },
];
// The 3 maps (the map screen shows each one's route)
const MAPS = {
  luzon:    { name: "LUZON",    icon: "🌋", theme: "Mountains and cities",   color: "#16a34a", places: LUZON },
  visayas:  { name: "VISAYAS",  icon: "🏝️", theme: "Islands and beaches",    color: "#0ea5e9", places: VISAYAS },
  mindanao: { name: "MINDANAO", icon: "🦅", theme: "Rainforest and volcanoes", color: "#ea580c", places: MINDANAO },
};
function loadMapChoice() {
  try { const m = localStorage.getItem("highwayDashMap"); return MAPS[m] ? m : "luzon"; }
  catch { return "luzon"; }
}
function saveMapChoice(m) {
  try { localStorage.setItem("highwayDashMap", m); } catch { /* ignore */ }
}
let mapChoice = loadMapChoice();
let LOCATIONS = MAPS[mapChoice].places;                    // the places of the map you're driving
// The airport counts as a place for the first 300 m of a run (not on the home screen)
const inAirport = () => mode !== "home" && level === 0 && odo < AIRPORT_LEN;
const currentLocation = () => (inAirport() ? AIRPORT : LOCATIONS[level % LOCATIONS.length]);
// How many vehicles can be on the road at once in this place
function carLimit() {
  const normal = Math.min(14, 6 + level * 2);
  return currentLocation().heat ? 4 : normal;   // TAG-INIT: much less traffic (the heat is the challenge)
}

// How much night / sunset / rain there is right now (0 = none, 1 = full).
// These slowly move toward the current location's values (smooth changes).
const atmo = { night: 0, sunset: 0, rain: 0, mist: 0 };
// Ground color: each place can have its own (it slowly blends into the next one)
const GRASS = { g1: [...COL.grass1], g2: [...COL.grass2] };

function updateAtmosphere(dt) {
  const loc = mode === "home" ? LOCATIONS[0] : currentLocation();
  const target = {
    night: loc.time === "night" ? 1 : 0,
    sunset: loc.time === "sunset" ? 1 : 0,
    rain: loc.rain ? 1 : 0,
    mist: loc.fog ? 1 : 0,                          // Baguio fog
  };
  for (const key in atmo) atmo[key] += (target[key] - atmo[key]) * Math.min(1, 0.012 * dt);
  const [t1, t2] = loc.grass || [COL.grass1, COL.grass2];
  for (let i = 0; i < 3; i++) {
    GRASS.g1[i] += (t1[i] - GRASS.g1[i]) * Math.min(1, 0.012 * dt);
    GRASS.g2[i] += (t2[i] - GRASS.g2[i]) * Math.min(1, 0.012 * dt);
  }
}

function updateLevel() {
  const newLevel = Math.floor(odo / LOCATION_DIST);   // based on distance driven
  if (newLevel > level) {
    const leaving = currentLocation();
    level = newLevel;
    if (level >= 2) questAdd("place");                 // reached the 3rd place
    if (leaving.heat) {                                // survived the TAG-INIT challenge!
      questAdd("heat");
      kita += 100;
      popup("TAG-INIT SURVIVOR! +₱100", "#fb923c");
    }
    bannerT = 210;        // show "Now entering ..." for 3.5 seconds
    Sound.levelUp();
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
  if (mode !== "home" && dist < AIRPORT_LEN) return AIRPORT;   // the airport at the start of a run
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

let nextSkywayAt = 0;            // where the next skyway crosses the road
function updateScenery() {
  const spawnAt = odo + DRAW_DIST * 0.95 * SEG_LEN;   // new things appear near the horizon
  const loc = locationAt(spawnAt);
  if (loc.skyway && spawnAt >= nextSkywayAt) {        // cities and expressways have skyways overhead
    scenery.push({ kind: "skyway", at: spawnAt, end: spawnAt, side: 0, z: spawnAt % TRACK_LEN, x: 0, scale: 1,
      variant: Math.random() });
    nextSkywayAt = spawnAt + 45000 + Math.random() * 35000;
  }
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
  enforcer: { color: "#65a30d", label: "ENFORCER" }, // a traffic enforcer clears ALL vehicles off the road for 2 seconds
};
const MAGNET_TIME = 480;   // 8 seconds
const SLOW_TIME = 300;     // 5 seconds
const ENFORCER_TIME = 120; // 2 seconds

// Extra power-up visuals
let pfx = null;            // the "burst" when you grab a power-up: { kind, t }
let edgeT = 0, edgeKind = "shield";   // colored glow around the screen edges
let enforcerT = 0;         // ENFORCER: the traffic enforcer on screen blowing the whistle
const ENFORCER_SHOW = 90;  // how long the enforcer stays on screen (1.5 s)
let ghostXs = [];          // SLOW-MO: where the car was a moment ago (for afterimages)
// "#38bdf8" -> "56,189,248" (so we can add transparency)
const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",");

function spawnPickups(dt) {
  pickupTimer -= dt;
  if (pickupTimer <= 0 && pickups.length === 0) {
    const kind = firstPickup ? "shield" : pickOne(Object.keys(POWERS));
    firstPickup = false;
    pickups.push(placeOnLane({ kind }, farAhead()));
    // next one in 10–17 seconds, but much sooner after Los Baños (Calamba and on)
    pickupTimer = level >= 3 ? 260 + Math.random() * 200 : 600 + Math.random() * 420;
  }
}

function collectPowerUp(kind) {
  questAdd("power");
  if (kind === "enforcer") questAdd("enforcer");
  Sound.powerup();
  popup(POWERS[kind].label + "!", POWERS[kind].color);
  pfx = { kind, t: 0 };                      // ring + icon burst from the car
  edgeT = 40;                                // screen edges glow in the power's color
  edgeKind = kind;
  const p = playerScreen(), rgb = rgbOf(POWERS[kind].color);
  for (let i = 0; i < 36; i++) {             // sparkles fly out in every direction
    const a = (i / 36) * Math.PI * 2;
    addPart({ kind: "spark", x: p.x, y: p.y - p.w * 0.35, vx: Math.cos(a) * (3 + Math.random() * 3),
      vy: Math.sin(a) * (2 + Math.random() * 2), g: 0.05, life: 26, max: 26, size: 2.5,
      color: i % 3 ? rgb : "255,255,255" });
  }
  if (kind === "enforcer") enforcerT = ENFORCER_SHOW;   // the enforcer appears
  if (kind === "shield") shield = true;
  const mult = ptype().powerMult || 1;
  if (kind === "magnet") magnetT = magnetMax = MAGNET_TIME * mult;
  if (kind === "slowmo") slowT = slowMax = SLOW_TIME * mult;
  if (kind === "enforcer") {
    clearT = ENFORCER_TIME;      // the road is empty for 2 seconds
    Sound.whistle();             // PRRT! PRRRRT!
    popup("TABI! TABI!", "#a3e635");
    for (const car of cars) {    // every vehicle is waved off to the nearest side of the road
      car.exitDir = car.x < playerX - 0.05 ? -1 : car.x > playerX + 0.05 ? 1 : (car.lane < 2 ? -1 : 1);
    }
  }
}

// The shield takes the hit instead of you
function useShield(car) {
  questAdd("bump");                        // daily quest: hit vehicles using a shield
  shield = false;
  invulnT = 90;            // 1.5 seconds where you can't crash
  shake = 12;
  Sound.shieldBreak();
  popup("LIGTAS!", "#38bdf8");
  placeCar(car, farAhead());   // the vehicle you hit is knocked away
}

// CLOSE CALL: you got out of a vehicle's lane just before reaching it
function nearMiss(car) {
  questAdd("close");
  sparks(Math.sign(car.x - playerX) || 1);       // sparks on the side you slipped past
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

  // When you get close, people stop and wait (so they never step in front of you at the last second)
  const waiting = relZ(crossing.z, pz) < 32 * SEG_LEN;
  for (const p of crossing.peds) {                            // people walk across
    if (waiting) continue;
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
    const touch = ((PED_W + crashWidth(pt)) / 2 / ROAD_W) * 0.85;
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

// ----- 10b. "JUICE": particles, car tilt, confetti -----
// A particle is a tiny dot or line that moves, fades and disappears.
//   puff  = dust behind the tires          drop  = water spray (rain, floods)
//   spark = a quick bright line (close calls)
let parts = [];          // particles around the player (they shake/zoom with the world)
let confetti = [];       // confetti pieces on top of everything
let tilt = 0;            // how much the player's car leans while changing lanes
let recordShown = false; // did we already celebrate beating the best score this run?

function addPart(p) {
  if (parts.length < 320) parts.push(p);       // a limit, so it can never get slow
}

// Dust and water from the rear tires, every frame
function emitTireParticles(dt) {
  if (mode !== "playing" && mode !== "home") return;
  const p = playerScreen();
  const wheels = [p.x - p.w * 0.38, p.x + p.w * 0.38];
  const steering = LANE_POS[playerLane] - playerX;
  if (inFlood) {                                     // big splashes in a flood
    for (let i = 0; i < 6; i++) {
      const wx = wheels[i % 2];
      addPart({ kind: "drop", x: wx, y: p.y - 3, vx: (Math.random() - 0.5) * 8, vy: -3 - Math.random() * 5,
        g: 0.35, life: 28, max: 28, size: 2 + Math.random() * 3, color: "200,225,245" });
    }
  } else if (atmo.rain > 0.3) {                      // spray from wet tires
    for (let i = 0; i < 4; i++) {
      const wx = wheels[i % 2];
      addPart({ kind: "drop", x: wx, y: p.y - 2, vx: (Math.random() - 0.5) * 4, vy: -1.5 - Math.random() * 3,
        g: 0.25, life: 24, max: 24, size: 2 + Math.random() * 2, color: "215,232,255" });
    }
    if (Math.random() < 0.7 * dt) {                   // a misty cloud of water behind the wheels
      addPart({ kind: "puff", x: wheels[Math.random() < 0.5 ? 0 : 1], y: p.y - 6,
        vx: (Math.random() - 0.5) * 1.2, vy: 0.5 + Math.random() * 0.5, g: 0, life: 34, max: 34,
        size: 8, color: "225,235,245" });
    }
  } else if (speed > 120 && Math.random() < 0.3 * dt) { // light dust on a dry road
    addPart({ kind: "puff", x: wheels[Math.random() < 0.5 ? 0 : 1], y: p.y - 4,
      vx: (Math.random() - 0.5) * 0.8, vy: 0.6 + Math.random() * 0.6, g: 0, life: 30, max: 30,
      size: 5, color: "205,195,175" });
  }
  if (Math.abs(steering) > 0.08 && atmo.rain < 0.3 && Math.random() < 0.6 * dt) {
    // changing lanes kicks up extra dust on the outside of the turn
    const side = steering > 0 ? -1 : 1;
    addPart({ kind: "puff", x: p.x + side * p.w * 0.45, y: p.y - 4,
      vx: side * (0.8 + Math.random()), vy: 0.4 + Math.random() * 0.5, g: 0, life: 26, max: 26,
      size: 6, color: "205,195,175" });
  }
}

// Sparks fly out on the side where you just slipped past a vehicle
function sparks(side) {
  const p = playerScreen();
  for (let i = 0; i < 22; i++) {
    addPart({ kind: "spark", x: p.x + side * p.w * 0.5, y: p.y - p.w * 0.25 - Math.random() * p.w * 0.2,
      vx: side * (1.5 + Math.random() * 5), vy: -Math.random() * 4 + 0.5, g: 0.18, life: 22, max: 22,
      size: 2, color: Math.random() < 0.5 ? "255,214,10" : "255,140,30" });
  }
}

// Confetti rain for a new high score
function burstConfetti() {
  const colors = ["#d62828", "#f9c80e", "#1d4fbf", "#22c55e", "#f472b6", "#ffffff"];
  for (let i = 0; i < 160; i++) {
    confetti.push({ x: Math.random() * W, y: -20 - Math.random() * 200, vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 3, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 0.3,
      w: 6 + Math.random() * 6, h: 4 + Math.random() * 4, color: colors[i % colors.length], life: 240 });
  }
}

function updateParticles(dt) {
  for (const p of parts) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.g * dt;
    p.life -= dt;
    if (p.kind === "puff") p.size += 0.45 * dt;    // dust spreads out
    if (p.rot !== undefined) p.rot += p.spin * dt; // crash pieces turn as they fly
    if (p.floor !== undefined && p.y > p.floor && p.vy > 0) {   // they bounce on the road
      p.y = p.floor;
      p.vy *= -0.38;
      p.vx *= 0.7;
      p.spin *= 0.7;
      if (p.kind === "wheel") p.spin = p.vx * 0.07;   // the tire keeps rolling
    }
  }
  parts = parts.filter((p) => p.life > 0);
  for (const c of confetti) {
    c.x += (c.vx + Math.sin(c.rot) * 0.6) * dt;    // flutters side to side
    c.y += c.vy * dt;
    c.rot += c.spin * dt;
    c.life -= dt;
  }
  confetti = confetti.filter((c) => c.life > 0 && c.y < H + 20);
}

function drawParticles() {
  for (const p of parts) {
    const a = p.life / p.max;                       // fades out as it gets older
    if (p.kind === "debris" || p.kind === "wheel") {
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life / 25);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.kind === "wheel") {                     // tire with a rim and spokes
        ctx.fillStyle = "#111111";
        ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#c0c4c8";
        ctx.beginPath(); ctx.arc(0, 0, p.size * 0.55, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#4b5563";
        for (let i = 0; i < 4; i++) ctx.fillRect(-p.size * 0.08, 0, p.size * 0.16, p.size * 0.5), ctx.rotate(Math.PI / 2);
      } else if (p.shape === "tri") {               // glass shard
        ctx.fillStyle = p.fill;
        ctx.beginPath(); ctx.moveTo(0, -p.size); ctx.lineTo(p.size * 0.7, p.size * 0.6); ctx.lineTo(-p.size * 0.6, p.size * 0.4); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillRect(-1, -p.size * 0.5, 2, p.size * 0.6);
      } else {                                      // a bent piece of the car
        ctx.fillStyle = p.fill;
        ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.fillRect(-p.size / 2, p.size * 0.1, p.size, p.size * 0.2);
      }
      ctx.restore();
    } else if (p.kind === "spark") {
      ctx.strokeStyle = `rgba(${p.color},${a})`;
      ctx.lineWidth = p.size;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 2.5, p.y - p.vy * 2.5);   // a short streak behind it
      ctx.stroke();
    } else {
      ctx.fillStyle = `rgba(${p.color},${(p.kind === "puff" ? 0.35 : 0.8) * a})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawConfetti() {
  for (const c of confetti) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);
    ctx.fillStyle = c.color;
    ctx.globalAlpha = Math.min(1, c.life / 40);
    ctx.fillRect(-c.w / 2, -c.h / 2, c.w, Math.abs(Math.cos(c.rot * 2)) * c.h + 1);   // looks like it flips
    ctx.restore();
  }
}

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
    speed = Math.min(speed + 0.02 * wdt, topSpeed(ptype()));   // (upgrades raise the top speed)
  }

  const prevPz = playerZ();         // where we were at the start of this frame
  position = (position + speed * wdt) % TRACK_LEN;
  const wasAirport = !demo && level === 0 && odo < AIRPORT_LEN;
  odo += speed * wdt;
  if (!demo) {                                     // daily quest: km driven (added every 0.1 km)
    kmForQuest += (speed * wdt) / UNITS_PER_KM;
    if (kmForQuest >= 0.1) { questAdd("km", 0.1); kmForQuest -= 0.1; }
  }
  if (wasAirport && odo >= AIRPORT_LEN) {         // out of the airport: "Now entering Calauan"
    bannerT = 210;
    Sound.levelUp();
  }
  setHills(hillsFor(odo));          // the hills grow slowly as you drive further
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
  tilt = (LANE_POS[playerLane] - playerX) * 0.22;   // the car leans toward where it's going
  emitTireParticles(dt);

  // Camera leans a little on curves and while changing lanes (feels more 3D)
  const leanTarget = Math.max(-0.035, Math.min(0.035,
    findSegment(pz).curve * 0.004 + (LANE_POS[playerLane] - playerX) * 0.05));
  lean += (leanTarget - lean) * Math.min(1, 0.08 * dt);

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

  // More traffic in each new place (6 at the start, max 14). Calamba is lighter.
  if (cars.length < carLimit() && clearT <= 0) addCar(farAhead());

  // ENFORCER: while it lasts, traffic is gone. When it ends, traffic comes back far away.
  if (clearT > 0) {
    clearT = Math.max(0, clearT - dt);
    if (clearT === 0) for (const car of cars) placeCar(car, farAhead());
  }
  updateTrafficSpeeds(wdt);

  let goneCount = 0;                           // extra cars taken off the road this frame
  for (const car of cars) {
    if (clearT > 0) break;                     // waved off the road by the ENFORCER
    const before = relZ(car.z, prevPz);        // distance ahead of us last frame
    car.z = (car.z + car.speed * wdt) % TRACK_LEN;
    const now = relZ(car.z, pz);
    updateLaneChange(car, wdt);

    // How close sideways counts as touching: half of both widths added up
    // (x0.85 so a near miss doesn't count)
    const v = VEHICLES[car.type];
    const pt = ptype();
    const touchSide = ((v.w + crashWidth(pt)) / 2 / ROAD_W) * 0.85;
    const sameSide = Math.abs(car.x - playerX) < touchSide;
    if (Math.abs(car.x - playerX) < touchSide + 0.06 && now > 0) car.danger = frame;  // it's in my way

    // Crash: the vehicle is (or just went) right where we are
    // (only while it's still on screen: once its back is behind you, it's gone)
    if (sameSide && before >= -CAR_LEN * 0.5 && now < CAR_LEN && !demo && invulnT <= 0) {
      if (shield) {
        useShield(car);
        continue;
      }
      startCrash("WASAK!", car);
      return;
    }
    if (before >= 0 && now < 0 && !demo) {
      score += 10;                                  // +10 per vehicle passed
      questAdd("pass");
      if (car.type === "jeepney") Sound.horn();     // jeepneys honk as you pass
      if (car.danger && frame - car.danger < 50) nearMiss(car);   // dodged at the last moment
    }
    if (now < -PLAYER_Z - 2 * SEG_LEN) {
      // Too many cars for this place (like in Calamba)? Remove it. Otherwise reuse it ahead.
      if (cars.length - goneCount > carLimit()) { car.gone = true; goneCount++; }
      else placeCar(car, farAhead());
    }
  }
  if (goneCount > 0) {                         // really remove the extra cars
    for (let i = cars.length - 1; i >= 0; i--) if (cars[i].gone) cars.splice(i, 1);
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
        questAdd("coins");
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

  // Beat your best score during a run: confetti!
  if (!demo && !recordShown && best > 0 && score > best) {
    recordShown = true;
    popup("BAGONG RECORD!", "#f9c80e");
    burstConfetti();
    Sound.levelUp();
  }

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

// Crash: the cars spin and fly, parts and glass go everywhere, "WASAK!", then Game Over.
// At a crossing ("HINTO!") there's no crash: the car brakes hard and skids instead.
const CRASH_TIME = 140;          // frames until the Game Over screen (about 2.3 seconds)
function startCrash(text = "WASAK!", car = null) {
  crashText = text;
  mode = "crash";
  crashT = 0;
  crashCar = car;
  crashKind = car ? "hit" : "stop";
  crashSide = car ? (car.x > playerX ? 1 : car.x < playerX ? -1 : (Math.random() < 0.5 ? -1 : 1)) : 1;
  crashWords = [];
  crashCracks = [];
  const p = playerScreen();
  if (crashKind === "stop") {    // HINTO!: hard braking, tire smoke
    shake = 12;
    Sound.screech();
    return;
  }
  shake = 30;
  flashT = 10;
  Sound.crash();
  Sound.shatter();
  for (let i = 0; i < 4; i++) Sound.clank(0.25 + i * 0.13);   // parts landing on the road
  const ix = p.x + crashSide * p.w * 0.35, iy = p.y - p.w * 0.4;   // where they touched
  const col = PLAYER_COLORS[carChoice].body;
  // flying pieces: body parts (your color and a dark grey) and glass shards
  for (let i = 0; i < 34; i++) {
    const glass = i % 3 === 0;
    addPart({ kind: "debris", x: ix, y: iy, vx: (Math.random() - 0.5) * 14, vy: -4 - Math.random() * 8,
      g: 0.45, life: 110, max: 110, floor: p.y + Math.random() * 30, rot: Math.random() * 6,
      spin: (Math.random() - 0.5) * 0.6, size: glass ? 3 + Math.random() * 4 : 4 + Math.random() * 7,
      shape: glass ? "tri" : "rect", fill: glass ? "#bfe3f5" : i % 2 ? col : "#3f3f46" });
  }
  // a tire comes off and rolls away
  addPart({ kind: "wheel", x: ix, y: iy, vx: crashSide * (5 + Math.random() * 2), vy: -9, g: 0.5,
    life: 130, max: 130, floor: p.y + 6, rot: 0, spin: crashSide * 0.35, size: p.w * 0.11 });
  for (let i = 0; i < 40; i++) {                   // sparks
    const a = Math.random() * Math.PI * 2;
    addPart({ kind: "spark", x: ix, y: iy, vx: Math.cos(a) * (3 + Math.random() * 7), vy: Math.sin(a) * 5 - 2,
      g: 0.2, life: 26, max: 26, size: 2.5, color: Math.random() < 0.5 ? "255,214,10" : "255,140,30" });
  }
  // comic words flying out
  crashWords = [["BLAG!", -1], ["KRASH!", 1], ["ARAY!", 0]].map(([w, dir], i) => ({
    text: w, x: ix, y: iy - 20, vx: (dir || crashSide) * (3 + i), vy: -5 - i, t: 0, delay: i * 8 }));
  // cracked-screen lines going out from the crash (made once, drawn on top of the screen)
  const cx = p.x + crashSide * p.w * 0.2, cy = p.y - p.w * 0.6;
  for (let i = 0; i < 11; i++) {
    let a = (i / 11) * Math.PI * 2 + Math.random() * 0.4, x = cx, y = cy;
    const line = [[x, y]];
    const len = 120 + Math.random() * 260;
    for (let d = 0; d < len; d += 25 + Math.random() * 25) {
      a += (Math.random() - 0.5) * 0.5;            // zig-zag a little
      x += Math.cos(a) * 30;
      y += Math.sin(a) * 30;
      line.push([x, y]);
    }
    crashCracks.push(line);
  }
  crashCracks.center = [cx, cy];
}

// How far your car has spun, hopped and slid at this moment of the crash
function crashMotion(p) {
  if (mode !== "crash") return null;
  const t = crashT;
  if (crashKind === "stop") {                      // braking: the car dips forward and shakes a bit
    const dip = Math.max(0, 1 - t / 25);
    return { dx: 0, dy: dip * p.w * 0.04, rot: Math.sin(t * 0.8) * 0.02 * dip, sx: 1 };
  }
  const e = 1 - Math.pow(1 - Math.min(1, t / 50), 3);   // fast at first, then slows down
  const hop = t < 28 ? Math.sin((t / 28) * Math.PI) * p.w * 0.32
    : t < 44 ? Math.sin(((t - 28) / 16) * Math.PI) * p.w * 0.07 : 0;   // a big hop, then a small bounce
  return {
    dx: -crashSide * e * p.w * 0.6,                // thrown away from the vehicle you hit
    dy: -hop,
    rot: -crashSide * (e * 0.95 + Math.sin(t * 0.3) * 0.04 * (1 - e)),   // spins
    sx: 1 - 0.25 * Math.sin(e * Math.PI),          // squashes as if it's rolling over a little
  };
}

function updateCrash(dt) {
  crashT += dt;
  const t = Math.min(1, crashT / 35);
  crashZoom = 0.2 * (1 - (1 - t) * (1 - t));   // ease out: fast then slow
  const p = playerScreen();
  const m = crashMotion(p);
  if (crashKind === "stop") {
    if (crashT < 40) for (const wx of [-0.38, 0.38]) {   // thick tire smoke from both back wheels
      addPart({ kind: "puff", x: p.x + wx * p.w, y: p.y - 4, vx: (Math.random() - 0.5) * 2, vy: 0.5 + Math.random(),
        g: 0, life: 40, max: 40, size: 9, color: "225,225,225" });
    }
  } else if (Math.random() < 0.5 * dt) {           // dark smoke rising from the wreck
    addPart({ kind: "puff", x: p.x + m.dx + (Math.random() - 0.5) * p.w * 0.4, y: p.y + m.dy - p.w * 0.45,
      vx: (Math.random() - 0.5) * 0.8, vy: -1.2 - Math.random(), g: 0, life: 60, max: 60, size: 8,
      color: crashT > 30 ? "70,70,75" : "150,150,150" });
  }
  for (const w of crashWords) {
    if (w.delay > 0) { w.delay -= dt; continue; }
    w.t += dt;
    w.x += w.vx * dt;
    w.y += w.vy * dt;
    w.vy += 0.25 * dt;
  }
  if (crashT >= CRASH_TIME) gameOver();
}

// Drawn in the world, on top of the cars: the shockwave, fire and the comic words
function drawCrashWorld() {
  if (mode !== "crash" || crashKind !== "hit") return;
  const p = playerScreen(), m = crashMotion(p);
  if (crashT < 24) {                               // shockwave ring
    const k = crashT / 24;
    ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - k)})`;
    ctx.lineWidth = 8 * (1 - k) + 1;
    ctx.beginPath();
    ctx.ellipse(p.x + crashSide * p.w * 0.35, p.y - p.w * 0.3, p.w * (0.3 + k * 1.6), p.w * (0.12 + k * 0.5), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (crashT > 30) {                               // small fire on the wreck
    const fx = p.x + m.dx, fy = p.y + m.dy - p.w * 0.5;
    for (let i = 0; i < 5; i++) {
      const h = p.w * (0.14 + 0.08 * Math.sin(frame * 0.6 + i * 1.7)), x = fx + (i - 2) * p.w * 0.06;
      poly(i % 2 ? "rgba(255,140,30,0.9)" : "rgba(255,214,10,0.9)", [x - p.w * 0.04, fy, x + p.w * 0.04, fy, x, fy - h]);
    }
  }
  for (const w of crashWords) {
    if (w.delay > 0) continue;
    const a = Math.max(0, 1 - w.t / 70);
    if (a <= 0) continue;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(w.x, w.y);
    ctx.rotate(Math.sin(w.t * 0.2) * 0.2);
    const sc = Math.min(1, w.t / 6);
    ctx.scale(sc, sc);
    outlinedText(w.text, 0, 0, 30, w.text === "ARAY!" ? "#ffffff" : "#ffd23f");
    ctx.restore();
  }
}

// Drawn on top of the screen: cracks, red edges, and the starburst behind "WASAK!"
function drawCrashScreen() {
  if (mode !== "crash") return;
  if (crashKind === "hit" && crashT > 3) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, (crashT - 3) / 4);
    ctx.lineJoin = "round";
    for (const [color, width, off] of [["rgba(0,0,0,0.35)", 3, 1.5], ["rgba(255,255,255,0.8)", 1.6, 0]]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      for (const line of crashCracks) {
        ctx.beginPath();
        line.forEach(([x, y], i) => (i ? ctx.lineTo(x + off, y + off) : ctx.moveTo(x + off, y + off)));
        ctx.stroke();
      }
    }
    const [cx, cy] = crashCracks.center;           // rings around the middle of the crack
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    for (const r of [26, 60]) { ctx.beginPath(); ctx.arc(cx, cy, r, 0.3, 5.6); ctx.stroke(); }
    ctx.restore();
    const pulse = Math.max(0, 1 - crashT / 50);     // red edges that fade
    if (pulse > 0) {
      const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.65);
      v.addColorStop(0, "rgba(220,38,38,0)");
      v.addColorStop(1, `rgba(220,38,38,${0.55 * pulse})`);
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
    }
  }
  if (crashT > 6) {                                // comic starburst behind the big word
    const t = Math.min(1, (crashT - 6) / 10);
    const s = t * (1 + Math.sin(crashT * 0.3) * 0.04);
    ctx.save();
    ctx.translate(W / 2, H * 0.4);
    ctx.rotate(crashT * 0.01);
    ctx.scale(s, s);
    for (const [r1, r2, color] of [[250, 150, "#ffd23f"], [195, 120, "#ff7a00"]]) {
      const pts = [];
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2, r = i % 2 ? r2 : r1 * (0.85 + ((i * 37) % 10) / 40);
        pts.push(Math.cos(a) * r, Math.sin(a) * r * 0.62);
      }
      poly(color, pts);
    }
    ctx.restore();
  }
}

// Things that keep moving on every screen (unless paused)
function updateEffects(dt) {
  updatePlanes(dt);
  updateAtmosphere(dt);
  const hot = mode !== "home" && currentLocation().heat;
  heat += ((hot ? 1 : 0) - heat) * Math.min(1, 0.015 * dt);   // heat fades in and out smoothly
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
  edgeT = Math.max(0, edgeT - dt);
  enforcerT = Math.max(0, enforcerT - dt);
  if (pfx && (pfx.t += dt) > 45) pfx = null;
  splashT = Math.max(0, splashT - dt);
  const bgTarget = (mode === "home" ? LOCATIONS[0] : currentLocation()).bg || "generic";
  for (const key in bgWeight) bgWeight[key] += ((key === bgTarget ? 1 : 0) - bgWeight[key]) * Math.min(1, 0.02 * dt);
  bannerT = Math.max(0, bannerT - dt);
  goT = Math.max(0, goT - dt);
  for (const p of popups) p.t += dt;
  updateParticles(dt);
  popups = popups.filter((p) => p.t < 60);
}

// ----- 11. Projection: world position → screen position -----
// worldY = how high the road is there, camY = how high the camera is
function project(z, camX, camZ, out, worldY = 0, camY = CAM_H) {
  out.cz = z - camZ;                           // distance from the camera
  out.scale = CAM_DEPTH / out.cz;              // far = small, near = big
  out.x = W / 2 - out.scale * camX * W / 2;
  out.y = HORIZON + out.scale * (camY - worldY) * H / 2;   // higher road = higher on screen
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

  ctx.fillStyle = fogged(light ? GRASS.g1 : GRASS.g2, fog);
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
      if (noShadow) return;              // (no shadow on the garage turntable faces)
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
  if (col.design) paintDesign({ R, P, C: () => {} }, col, -0.5, -0.385, 0.5, -0.145);   // stripes or two colors
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
function drawEbike(x, y, w, look = EBIKE_COLORS[0]) {
  const { R, P, C, T, side, shade, shadow } = painter(x, y, w);
  shadow();
  tire(R, -0.47, -0.2, 0.13, 0.2);                    // two back wheels
  tire(R, 0.34, -0.2, 0.13, 0.2);
  R(-0.4, -0.17, 0.8, 0.05, "#2a2a2a");               // axle
  side(-0.52, -0.16, look.dark);
  // rounded colored body with a white stripe and a cargo rack
  P(look.body, [-0.44, -0.17, 0.44, -0.17, 0.46, -0.26, 0.44, -0.5, 0.38, -0.55, -0.38, -0.55, -0.44, -0.5, -0.46, -0.26]);
  shade(-0.46, -0.55, 0.92, 0.38);
  R(-0.45, -0.36, 0.9, 0.025, "rgba(255,255,255,0.85)");
  R(-0.4, -0.2, 0.8, 0.03, "#111111");                // rubber bumper
  for (const sx of [-0.43, 0.33]) {                   // tail lights and orange reflectors
    P("#ff3b30", [sx, -0.5, sx + 0.1, -0.5, sx + 0.1, -0.43, sx, -0.42]);
    R(sx + 0.01, -0.28, 0.08, 0.03, "#ff7a00");
  }
  plate(R, T, 0, -0.265, 0.2, 0.06, "EV 2026");
  // back seat with a passenger
  R(-0.34, -0.8, 0.68, 0.26, "#1f1f1f");
  R(-0.32, -0.68, 0.64, 0.01, "#3a3a3a");
  C(0.12, -0.85, 0.075, "#8d5a3b");                    // passenger's head and shirt
  R(0.05, -0.85, 0.14, 0.04, "#1f1f1f");
  R(0.03, -0.78, 0.18, 0.18, "#38bdf8");
  // canopy: posts, clear plastic back cover, roof with a rounded edge
  R(-0.47, -1.24, 0.05, 0.7, "#1a1a1a");
  R(0.42, -1.24, 0.05, 0.7, "#1a1a1a");
  R(-0.42, -1.2, 0.84, 0.32, "rgba(203,213,225,0.35)");   // see-through rain cover
  R(-0.42, -0.9, 0.84, 0.02, "#1a1a1a");
  P(GLASS, [0.1, -1.18, 0.18, -1.18, 0.1, -0.92, 0.02, -0.92]);
  P(look.roof, [-0.53, -1.2, 0.53, -1.2, 0.53, -1.26, 0.48, -1.33, -0.48, -1.33, -0.53, -1.26]);
  R(-0.53, -1.215, 1.06, 0.02, look.body);             // colored trim under the roof
  P("rgba(255,255,255,0.18)", [-0.46, -1.33, 0.46, -1.33, 0.42, -1.36, -0.42, -1.36]);
  R(-0.6, -1.02, 0.08, 0.06, "#111111");               // mirrors
  R(0.52, -1.02, 0.08, 0.06, "#111111");
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
  // painted body with stripes
  R(-0.5, -1.0, 1, 0.76, look.body);
  shade(-0.5, -1.0, 1, 0.76);
  R(-0.5, -0.5, 1, 0.06, look.band);
  R(-0.5, -0.36, 1, 0.04, look.stripe);
  R(-0.5, -0.32, 1, 0.08, "#c9d0d6");                 // stainless lower panel
  for (let i = 0; i < 16; i++) R(-0.49 + i * 0.062, -0.31, 0.012, 0.06, "#9aa3ab");
  // side windows with chrome frames
  for (const sx of [-0.46, 0.26]) {
    R(sx - 0.015, -0.965, 0.23, 0.2, "#d7dde2");
    R(sx, -0.95, 0.2, 0.17, "#bfe3f5");
    P(GLASS, [sx + 0.12, -0.95, sx + 0.17, -0.95, sx + 0.1, -0.78, sx + 0.05, -0.78]);
  }
  // art on the back: a sun on the left, stars on the right, a little horse in the middle
  C(-0.35, -0.64, 0.05, look.band);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    C(-0.35 + Math.cos(a) * 0.075, -0.64 + Math.sin(a) * 0.075, 0.012, look.band);
  }
  for (const [sx, sy] of [[0.28, -0.66], [0.36, -0.6], [0.43, -0.67]]) {
    P(look.band, [sx, sy - 0.03, sx + 0.01, sy - 0.008, sx + 0.03, sy, sx + 0.01, sy + 0.008, sx, sy + 0.03, sx - 0.01, sy + 0.008, sx - 0.03, sy, sx - 0.01, sy - 0.008]);
  }
  for (const sx of [-0.43, 0.43]) R(sx - 0.03, -0.46, 0.06, 0.08, "#ff3b30");   // round-ish tail lights
  for (const sx of [-0.43, 0.43]) R(sx - 0.02, -0.455, 0.02, 0.03, "#ffd0c8");
  // open back door: dark inside, seats on both sides, passengers, chrome hand rails
  R(-0.2, -1.0, 0.4, 0.76, "#2a1d12");
  R(-0.2, -0.64, 0.09, 0.24, "#c2410c");
  R(0.11, -0.64, 0.09, 0.24, "#c2410c");
  C(-0.15, -0.72, 0.045, "#8d5a3b");
  R(-0.19, -0.69, 0.08, 0.05, "#38bdf8");
  C(0.15, -0.74, 0.045, "#7a5c45");
  R(0.11, -0.71, 0.08, 0.07, "#f472b6");
  R(-0.2, -0.3, 0.4, 0.06, "#5a4330");
  R(-0.215, -1.0, 0.025, 0.76, "#e5e7eb");
  R(0.19, -1.0, 0.025, 0.76, "#e5e7eb");
  R(-0.2, -0.95, 0.4, 0.015, "#e5e7eb");               // grab bar
  // chrome bumper and step
  R(-0.52, -0.24, 1.04, 0.06, "#d7dde2");
  R(-0.52, -0.24, 1.04, 0.012, "#ffffff");
  R(-0.22, -0.2, 0.44, 0.035, "#9aa3ab");
  plate(R, T, 0, -0.275, 0.18, 0.06, "PUJ 143", "#f9d71c");
  R(-0.62, -0.93, 0.08, 0.1, "#d7dde2");               // chrome mirrors on stalks
  R(0.54, -0.93, 0.08, 0.1, "#d7dde2");
  // roof: rounded edge, stripes and a row of colored lights
  P(look.roof, [-0.56, -1.0, 0.56, -1.0, 0.56, -1.08, 0.52, -1.14, -0.52, -1.14, -0.56, -1.08]);
  R(-0.56, -1.05, 1.12, 0.025, look.band);
  R(-0.56, -1.025, 1.12, 0.02, look.stripe);
  P("rgba(255,255,255,0.25)", [-0.52, -1.14, 0.52, -1.14, 0.48, -1.17, -0.48, -1.17]);
  const bulbs = ["#ff3b30", "#facc15", "#4ade80", "#38bdf8"];
  for (let i = 0; i < 10; i++) C(-0.495 + i * 0.11, -1.1, 0.016, bulbs[i % 4]);
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
  else if (v.type === "ebike") drawEbike(x, y, w, v.look);
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
  side(-0.32, -0.12, col.dark);
  side(-0.12, 0, TIRE);
  tire(R, -0.5, -0.15, 0.19, 0.15);                    // wide tires
  tire(R, 0.31, -0.15, 0.19, 0.15);
  P("#111111", [-0.4, -0.15, 0.4, -0.15, 0.36, -0.03, -0.36, -0.03]);   // diffuser with fins
  for (let i = 0; i < 7; i++) R(-0.3 + i * 0.1, -0.14, 0.018, 0.1, "#2a2a2a");
  for (const ex of [-0.12, -0.045, 0.045, 0.12]) {     // quad exhausts
    C(ex, -0.075, 0.03, "#9aa1a8");
    C(ex, -0.075, 0.019, "#1a1a1a");
  }
  // body: wider at the hips, rounded corners
  P(col.body, [-0.5, -0.15, 0.5, -0.15, 0.53, -0.21, 0.51, -0.3, 0.45, -0.345, -0.45, -0.345, -0.51, -0.3, -0.53, -0.21]);
  shade(-0.53, -0.345, 1.06, 0.2);
  P(col.dark, [-0.53, -0.21, -0.4, -0.2, -0.38, -0.15, -0.5, -0.15]);   // dark lower corners
  P(col.dark, [0.53, -0.21, 0.4, -0.2, 0.38, -0.15, 0.5, -0.15]);
  paintDesign({ R, P, C }, col, -0.5, -0.345, 0.5, -0.15);   // the paint's design (stripes, flames, ...)
  R(-0.47, -0.305, 0.94, 0.03, "#5f0f0f");             // LED light bar
  R(-0.46, -0.298, 0.92, 0.014, "#ff2d2d");
  P("#ff3b30", [-0.5, -0.31, -0.3, -0.31, -0.32, -0.27, -0.5, -0.26]);   // tail lights
  P("#ff3b30", [0.5, -0.31, 0.3, -0.31, 0.32, -0.27, 0.5, -0.26]);
  R(-0.48, -0.305, 0.08, 0.012, "#ffd0c8");
  R(0.4, -0.305, 0.08, 0.012, "#ffd0c8");
  plate(R, T, 0, -0.205, 0.18, 0.055, "SPD 001");
  P(col.top, [-0.45, -0.345, 0.45, -0.345, 0.37, -0.395, -0.37, -0.395]);   // trunk lid
  // fastback cabin with a rounded roof
  P(col.body, [-0.35, -0.395, 0.35, -0.395, 0.27, -0.52, 0.19, -0.56, -0.19, -0.56, -0.27, -0.52]);
  P("#1f2a33", [-0.28, -0.405, 0.28, -0.405, 0.22, -0.51, 0.15, -0.54, -0.15, -0.54, -0.22, -0.51]);
  P(GLASS, [0.05, -0.405, 0.12, -0.405, 0.08, -0.53, 0.02, -0.53]);
  R(-0.4, -0.45, 0.06, 0.04, col.body);                // side mirrors
  R(0.34, -0.45, 0.06, 0.04, col.body);
  // big rear wing on two struts
  R(-0.25, -0.47, 0.03, 0.09, "#111111");
  R(0.22, -0.47, 0.03, 0.09, "#111111");
  P("#111111", [-0.52, -0.47, 0.52, -0.47, 0.5, -0.515, -0.5, -0.515]);
  R(-0.52, -0.515, 1.04, 0.01, "#3f3f46");
  R(-0.55, -0.55, 0.035, 0.1, "#111111");               // end plates
  R(0.515, -0.55, 0.035, 0.1, "#111111");
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
  paintDesign({ R, P, C: painter(x, y, w).C }, col, -0.5, -0.38, 0.5, -0.14);   // the paint's design
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
  paintDesign({ R, P, C }, col, -0.5, -0.4, 0.5, -0.2);   // the paint's design
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
  if (!noShadow) {
    const neon = ctx.createRadialGradient(x, y, 0, x, y, w * 0.8);
    neon.addColorStop(0, "rgba(34,211,238,0.55)");
    neon.addColorStop(1, "rgba(34,211,238,0)");
    ctx.fillStyle = neon;
    ctx.fillRect(x - w * 0.8, y - w * 0.25, w * 1.6, w * 0.5);
  }
  shadow();
  for (const tx of [-0.5, 0.34]) {                      // twin rear wheels with gold rims
    R(tx, -0.22, 0.16, 0.22, TIRE);
    R(tx + 0.03, -0.19, 0.1, 0.16, "#d4a017");
    R(tx + 0.055, -0.16, 0.05, 0.1, "#7a5c00");
  }
  side(-0.56, -0.18, "#1a1a1a");
  // the body: tapered and glossy black
  P("#141414", [-0.47, -0.18, 0.47, -0.18, 0.49, -0.3, 0.46, -0.5, 0.4, -0.57, -0.4, -0.57, -0.46, -0.5, -0.49, -0.3]);
  shade(-0.49, -0.57, 0.98, 0.39);
  P("#facc15", [-0.4, -0.57, 0.4, -0.57, 0.41, -0.555, -0.41, -0.555]);   // gold trim
  R(-0.47, -0.2, 0.94, 0.018, "#22d3ee");               // neon strip
  P("#facc15", [-0.47, -0.46, -0.26, -0.38, -0.48, -0.32]);   // gold flames
  P("#facc15", [0.47, -0.46, 0.26, -0.38, 0.48, -0.32]);
  R(-0.42, -0.51, 0.84, 0.045, "rgba(255,45,85,0.35)"); // LED light bar
  R(-0.42, -0.5, 0.84, 0.026, "#ff2d55");
  P("#facc15", [-0.09, -0.3, 0.09, -0.3, 0.1, -0.41, 0.045, -0.355, 0, -0.43, -0.045, -0.355, -0.1, -0.41]); // crown
  C(0, -0.33, 0.012, "#ef4444");
  plate(R, T, 0, -0.245, 0.2, 0.055, "HARI 01");
  // red leather seat back with stitching
  P("#7f1d1d", [-0.34, -0.57, 0.34, -0.57, 0.32, -0.82, 0.28, -0.85, -0.28, -0.85, -0.32, -0.82]);
  R(-0.3, -0.72, 0.6, 0.008, "#fca5a5");
  R(-0.01, -0.83, 0.02, 0.25, "#fca5a5");
  // canopy: curved posts and a rounded roof
  P("#0a0a0a", [-0.5, -0.56, -0.43, -0.56, -0.42, -1.22, -0.46, -1.28, -0.5, -1.22]);
  P("#0a0a0a", [0.5, -0.56, 0.43, -0.56, 0.42, -1.22, 0.46, -1.28, 0.5, -1.22]);
  R(-0.49, -1.22, 0.014, 0.64, "#facc15");
  R(0.476, -1.22, 0.014, 0.64, "#facc15");
  P("rgba(15,23,42,0.92)", [-0.4, -0.9, 0.4, -0.9, 0.4, -1.16, 0.36, -1.2, -0.36, -1.2, -0.4, -1.16]);   // tinted back window
  P(GLASS, [0.08, -0.9, 0.16, -0.9, 0.1, -1.18, 0.02, -1.18]);
  R(-0.4, -0.885, 0.8, 0.015, "#22d3ee");
  R(-0.2, -0.99, 0.4, 0.08, "#0a0a0a");
  T("E-BIKE", 0, -0.95, 0.075, "#facc15");
  R(-0.62, -1.02, 0.09, 0.06, "#facc15");               // gold mirrors
  R(0.53, -1.02, 0.09, 0.06, "#facc15");
  P("#18181b", [-0.55, -1.22, 0.55, -1.22, 0.55, -1.28, 0.5, -1.36, -0.5, -1.36, -0.55, -1.28]);   // rounded roof
  R(-0.55, -1.235, 1.1, 0.02, "#facc15");
  P("rgba(255,255,255,0.18)", [-0.48, -1.36, 0.48, -1.36, 0.44, -1.38, -0.44, -1.38]);
  P("#facc15", [-0.07, -1.38, 0.07, -1.38, 0.08, -1.46, 0.035, -1.42, 0, -1.48, -0.035, -1.42, -0.08, -1.46]);
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
// ----- Landmarks for the new places after Manila -----
// A 5-pointed star (for parols)
function starPts(cx, cy, r, inner = 0.45, spin = 0) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + spin + (i * Math.PI) / 5;
    const rr = i % 2 ? r * inner : r;
    pts.push(cx + Math.cos(a) * rr, cy - Math.sin(a) * rr);
  }
  return pts;
}
// How dark it is (so lanterns and lamps glow more at sunset and night)
const darkness = () => Math.max(atmo.night, atmo.sunset * 0.6, atmo.rain * 0.4);

Object.assign(LANDMARKS, {
  // PAMPANGA: a giant parol (San Fernando lantern) on a stage, glowing in rings of color
  parol: { w: 5200, draw(p) {
    p.box(-2200, 4400, 500, 1200, "#7c2d12", "#5a1f0c", "#9a3412");   // wooden stage
    for (let i = 0; i < 8; i++) p.R(-2200 + i * 560, 0, 40, 500, "#5a1f0c");
    p.R(-1700, 500, 140, 3400, "#475569");                  // two poles holding it up
    p.R(1560, 500, 140, 3400, "#475569");
    const cx = 0, cy = 3800, r = 2100;
    const glowA = 0.25 + darkness() * 0.55;
    p.C(cx, cy, r * 1.25, `rgba(250,204,21,${glowA * 0.35})`);   // soft glow around it
    p.P("#dc2626", starPts(cx, cy, r));                     // red star points
    p.P("#facc15", starPts(cx, cy, r * 0.82));
    const rings = ["#16a34a", "#2563eb", "#f97316", "#a855f7", "#facc15", "#ef4444"];
    rings.forEach((c, i) => p.C(cx, cy, r * (0.55 - i * 0.08), c));   // rings that light up in turns
    const on = Math.floor(frame / 10) % rings.length;
    p.C(cx, cy, r * (0.55 - on * 0.08), "rgba(255,255,255,0.45)");
    for (let i = 0; i < 12; i++) {                          // spokes like the real lantern
      const a = (i / 12) * Math.PI * 2;
      p.P("rgba(255,255,255,0.35)", [cx, cy, cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55,
        cx + Math.cos(a + 0.08) * r * 0.55, cy + Math.sin(a + 0.08) * r * 0.55]);
    }
    p.C(cx, cy, r * 0.1, "#ffffff");
    for (const tx of [-500, 0, 500]) {                      // tails ("buntot") hanging down
      p.P(tx === 0 ? "#facc15" : "#dc2626", [tx - 120, cy - r * 0.6, tx + 120, cy - r * 0.6, tx, cy - r * 1.25]);
    }
  }},
  // Small parol on a lamp post (fills the roadside in Pampanga)
  parolpole: { w: 1400, draw(p, o) {
    p.R(-50, 0, 100, 2600, "#64748b");
    p.R(-50, 2550, 450, 60, "#64748b");
    const colors = ["#dc2626", "#2563eb", "#16a34a", "#f97316"];
    const c = colors[Math.floor(o.variant * colors.length)];
    p.C(400, 2150, 560, `rgba(250,204,21,${0.15 + darkness() * 0.45})`);
    p.P(c, starPts(400, 2150, 420));
    p.P("#facc15", starPts(400, 2150, 250));
    p.C(400, 2150, 80, "#ffffff");
    p.P(c, [330, 1750, 470, 1750, 400, 1350]);
  }},
  // Sisig stall: open eatery with a big sizzling-plate sign on top
  sisig: { w: 4400, draw(p) {
    p.box(-2000, 4000, 1900, 2400, "#fef3c7", "#e9d9a5", "#78350f");
    for (let i = 0; i < 10; i++) p.P(i % 2 ? "#ffffff" : "#dc2626",   // striped awning
      [-2050 + i * 410, 1900, -2050 + (i + 1) * 410, 1900, -2020 + (i + 1) * 410, 1550, -2020 + i * 410, 1550]);
    p.R(-1800, 0, 3600, 1350, "#3f2a1a");                   // dark open front
    p.R(-1800, 750, 3600, 80, "#a16207");                   // counter
    for (const tx of [-1200, 0, 1200]) {                    // plates of sisig on the counter
      p.E(tx, 860, 330, 70, "#111827");
      p.E(tx, 880, 240, 45, "#9a3412");
      p.C(tx + 60, 900, 40, "#facc15");                     // egg on top
    }
    p.E(0, 2900, 1500, 420, "#111827");                     // giant sizzling plate sign
    p.E(0, 2950, 1250, 300, "#78350f");
    for (let i = 0; i < 9; i++) p.C(-900 + i * 225, 2980 + (i % 2) * 70, 90, i % 3 ? "#b45309" : "#dc2626");
    p.C(0, 3050, 180, "#fde047");
    for (const sx of [-600, 0, 600]) {                      // steam (wiggles)
      const w = Math.sin(frame * 0.1 + sx) * 60;
      p.curve("rgba(255,255,255,0.7)", 70, [sx, 3350, sx + 150 + w, 3600, sx - 150 - w, 3850, sx + w, 4100]);
    }
    p.R(-60, 2200, 120, 500, "#475569");
  }},
  // Rice field with a carabao and a farmer in a salakot hat
  ricefield: { w: 5200, draw(p) {
    p.R(-2600, 0, 5200, 160, "#6aa84f");
    for (let row = 3; row >= 0; row--) {
      p.R(-2600, row * 90, 5200, 30, "rgba(125,211,252,0.5)");   // water between the rows
      for (let i = 0; i < 18; i++) {
        const px = -2500 + i * 290 + (row % 2) * 140, py = row * 90;
        p.P("#4d9a34", [px - 70, py, px + 70, py, px, py + 330]);
        p.P("#6cc04a", [px - 40, py, px + 100, py + 280, px + 30, py]);
      }
    }
    p.E(1200, 650, 650, 330, "#57534e");                    // carabao body
    p.E(1850, 820, 230, 200, "#57534e");                    // head
    p.curve("#e7e5e4", 70, [1700, 980, 1600, 1180, 1850, 1250, 1900, 1100]);   // horns
    p.curve("#e7e5e4", 70, [2000, 980, 2100, 1180, 1850, 1250, 1800, 1100]);
    for (const lx of [800, 1050, 1350, 1550]) p.R(lx, 150, 110, 400, "#44403c");
    p.R(-1500, 100, 160, 700, "#1e3a8a");                   // farmer
    p.R(-1550, 750, 260, 500, "#f5f5f4");
    p.C(-1420, 1380, 130, "#8d5a3b");
    p.P("#d6b26b", [-1800, 1430, -1040, 1430, -1420, 1720]); // salakot hat
  }},

  // BAGUIO: the pink cathedral with twin towers on top of stairs
  cathedral: { w: 6800, draw(p) {
    p.R(-3000, 0, 6000, 700, "#a8a29e");                    // stairs up the hill
    for (let i = 1; i < 6; i++) p.R(-3000 + i * 120, i * 117, 6000 - i * 240, 30, "#d6d3d1");
    p.box(-2000, 4000, 3200, 2600, "#f4a6b4", "#dc8a9b", "#a3485a", 700);   // rose-pink main church
    p.P("#f4a6b4", [-2000, 3900, 0, 4900, 2000, 3900]);
    p.P("#64748b", [-2100, 3900, 0, 5000, 2100, 3900, 1900, 3900, 0, 4800, -1900, 3900]);
    for (const tx of [-2900, 1800]) {                       // twin square towers with pointed roofs
      p.box(tx, 1100, 5200, 1100, "#f8b4c0", "#e094a5", null, 700);
      p.R(tx, 5800, 1100, 100, "#ffffff");
      p.P("#475569", [tx - 100, 5900, tx + 1200, 5900, tx + 550, 7300]);
      p.R(tx + 520, 7300, 60, 400, "#ffffff");
      p.R(tx + 400, 7480, 300, 60, "#ffffff");
      for (const wy of [2600, 4100]) {
        p.R(tx + 300, wy + 700, 500, 800, "#1e293b");
        p.C(tx + 550, wy + 1500, 250, "#1e293b");
      }
    }
    p.C(0, 3300, 450, "#ffffff");                           // round rose window
    p.C(0, 3300, 360, "#93c5fd");
    p.P("#f472b6", starPts(0, 3300, 300, 0.4));
    p.R(-500, 700, 1000, 1500, "#7c2d12");                  // big wooden door
    p.C(0, 2200, 500, "#7c2d12");
    for (const wx of [-1600, 1200]) { p.R(wx, 1500, 400, 900, "#93c5fd"); p.C(wx + 200, 2400, 200, "#93c5fd"); }
    for (let i = 0; i < 6; i++) p.R(-2000, 700 + i * 520, 4000, 20, "rgba(160,60,80,0.25)");
  }},
  // Burnham Park: the lake with swan boats, surrounded by pine trees
  burnham: { w: 7400, draw(p) {
    p.E(0, 300, 3400, 420, "#94a3b8");                       // lake edge
    p.E(0, 320, 3200, 360, "#38bdf8");
    p.E(-800, 380, 1200, 70, "rgba(255,255,255,0.4)");
    for (const [bx, c] of [[-1800, "#ffffff"], [-300, "#fde047"], [1300, "#ffffff"], [2300, "#f472b6"]]) {
      const bob = Math.sin(frame * 0.05 + bx) * 30;          // swan boats bobbing
      p.E(bx, 350 + bob, 380, 180, c);
      p.curve(c, 110, [bx + 280, 400 + bob, bx + 420, 650 + bob, bx + 300, 850 + bob, bx + 360, 950 + bob]);
      p.C(bx + 360, 950 + bob, 90, c);
      p.P("#f97316", [bx + 430, 970 + bob, bx + 560, 930 + bob, bx + 430, 900 + bob]);
      p.R(bx - 200, 500 + bob, 300, 220, "#334155");        // the rider's seat
    }
    for (const tx of [-3500, -2700, 2900, 3600]) drawPine(p, tx, 3800 + (tx % 3) * 200);
    for (let i = 0; i < 14; i++) p.R(-3300 + i * 470, 0, 50, 350, "#e5e7eb");   // white railing posts
    p.R(-3300, 300, 6600, 50, "#e5e7eb");
  }},
  // Strawberry farm: rows of plants and a giant strawberry sign
  strawberry: { w: 5600, draw(p) {
    for (let row = 3; row >= 0; row--) {
      p.R(-2700, row * 130, 5400, 110, "#7c4a2d");           // soil beds
      for (let i = 0; i < 16; i++) {
        const px = -2600 + i * 340 + (row % 2) * 170, py = row * 130 + 100;
        p.E(px, py + 90, 150, 100, "#3f9e46");
        if ((i + row) % 2 === 0) p.C(px + 60, py + 50, 55, "#ef4444");
      }
    }
    p.R(-60, 0, 120, 2400, "#78350f");                       // the sign post
    p.P("#ef4444", [-900, 3600, 900, 3600, 700, 2900, 0, 2200, -700, 2900]);   // giant strawberry
    p.E(0, 3500, 920, 380, "#ef4444");
    for (let i = 0; i < 16; i++) p.C(-600 + (i % 5) * 300, 2700 + Math.floor(i / 5) * 280, 35, "#fde68a");
    p.P("#16a34a", [-700, 3700, 0, 3500, 700, 3700, 350, 3950, 0, 3750, -350, 3950]);   // leaves on top
  }},
  // Ube jam shop: purple store with a big jar on the roof
  ubestore: { w: 3400, draw(p) {
    p.box(-1500, 3000, 2000, 2200, "#ede9fe", "#d4cdf2", "#6d28d9");
    for (let i = 0; i < 8; i++) p.P(i % 2 ? "#ffffff" : "#7c3aed",
      [-1550 + i * 387, 2000, -1550 + (i + 1) * 387, 2000, -1520 + (i + 1) * 387, 1650, -1520 + i * 387, 1650]);
    p.R(-1300, 300, 1700, 1100, "#c4b5fd");                  // shelves full of ube jars
    for (let r = 0; r < 2; r++) for (let i = 0; i < 5; i++) {
      p.R(-1200 + i * 330, 380 + r * 500, 220, 300, "#6d28d9");
      p.R(-1210 + i * 330, 680 + r * 500, 240, 70, "#ffffff");
    }
    p.R(600, 0, 700, 1400, "#4c1d95");
    p.R(-600, 2000, 1200, 1300, "#6d28d9");                  // giant jar on the roof
    p.R(-680, 3250, 1360, 300, "#ffffff");
    p.E(0, 2650, 450, 300, "#ede9fe");
  }},
  // A small group of pine trees (Baguio roadside)
  pines: { w: 2600, draw(p, o) {
    drawPine(p, -800, 3200 + o.variant * 1500);
    drawPine(p, 700, 4200 - o.variant * 1000);
    drawPine(p, 0, 2600);
  }},

  // ILOCOS: Vigan heritage houses (Calle Crisologo): stone below, wood and capiz windows above
  vigan: { w: 8400, draw(p) {
    p.R(-4200, 0, 8400, 120, "#78716c");                     // cobblestone street
    for (let i = 0; i < 40; i++) p.E(-4100 + i * 210, 60, 80, 35, i % 2 ? "#a8a29e" : "#8a837c");
    for (const [hx, wall] of [[-4000, "#e7e0d4"], [100, "#efe7d8"]]) {
      p.box(hx, 3900, 1700, 2600, wall, "#cfc6b6", null, 120);   // whitewashed stone ground floor
      for (const ax of [hx + 300, hx + 1500, hx + 2700]) {
        p.R(ax, 120, 800, 1000, "#57412c");
        p.C(ax + 400, 1120, 400, "#57412c");
      }
      p.box(hx - 200, 4300, 1500, 2700, "#5b3a22", "#47301c", null, 1820);   // dark wooden upper floor
      for (let i = 0; i < 4; i++) {                          // capiz shell windows
        const wx = hx + i * 1050;
        p.R(wx, 1950, 900, 1100, "#3b2516");
        for (let r = 0; r < 4; r++) for (let c2 = 0; c2 < 4; c2++) p.R(wx + 40 + c2 * 215, 1990 + r * 260, 185, 230, "#f5ecd6");
      }
      p.P("#9a3412", [hx - 500, 3320, hx + 4400, 3320, hx + 3800, 4300, hx + 100, 4300]);   // red clay tile roof
      for (let i = 1; i < 5; i++) p.R(hx - 500 + i * 120, 3320 + i * 200, 4900 - i * 240, 30, "#7c2d12");
    }
    for (const lx of [-4150, 4050]) {                        // old-style street lamps
      p.R(lx - 40, 0, 80, 2600, "#1f2937");
      p.R(lx - 200, 2600, 400, 450, "#1f2937");
      p.R(lx - 140, 2650, 280, 330, `rgba(253,224,71,${0.5 + darkness() * 0.5})`);
    }
  }},
  // Paoay Church: earthquake-proof coral stone church with huge side buttresses
  paoay: { w: 8600, draw(p) {
    const stone = "#b08b5e", dark = "#8a6a43", light = "#c9a777";
    p.box(-2600, 5200, 3600, 2800, stone, dark, null);
    // stepped top edge, with a little stone point (finial) on each step
    const steps = [[-2000, 4300], [-1200, 4600], [-600, 5400], [0, 5800], [600, 5400], [1200, 4600], [2000, 4300]];
    p.P(stone, [-2600, 3600, ...steps.flat(), 2600, 3600]);
    for (const [fx, fy] of steps) p.P(light, [fx - 120, fy, fx + 120, fy, fx, fy + 400]);
    for (const side of [-1, 1]) {                            // the giant buttresses on both sides
      const bx = side * 2600;
      p.P(dark, [bx, 0, bx + side * 1500, 0, bx, 3300]);
      p.P(stone, [bx, 0, bx + side * 900, 0, bx, 2600]);
    }
    for (let i = 1; i < 9; i++) p.R(-2600, i * 400, 5200, 25, "rgba(90,60,30,0.25)");   // coral stone blocks
    for (const px of [-1900, -1100, 900, 1700]) p.R(px, 0, 220, 3600, light);   // flat columns
    p.R(-500, 0, 1000, 1600, "#4a3520");                     // arched door
    p.C(0, 1600, 500, "#4a3520");
    p.C(0, 2700, 280, "#4a3520");                            // round window
    for (const wx of [-1500, 1300]) { p.R(wx, 1900, 220, 600, "#4a3520"); p.C(wx + 110, 2500, 110, "#4a3520"); }
    for (let i = 0; i < 18; i++) p.C(-2400 + i * 280, 3300 + Math.sin(i) * 200, 70, "rgba(74,124,60,0.6)");   // moss
  }},
  // Empanada stall (Vigan empanada: orange and crispy)
  empanada: { w: 3000, draw(p) {
    p.box(-1300, 2600, 1500, 1800, "#fff7ed", "#f2dcc3", "#c2410c");
    for (let i = 0; i < 7; i++) p.P(i % 2 ? "#ffffff" : "#ea580c",
      [-1350 + i * 386, 1500, -1350 + (i + 1) * 386, 1500, -1320 + (i + 1) * 386, 1200, -1320 + i * 386, 1200]);
    p.R(-1100, 0, 2200, 1100, "#44291a");
    p.E(-500, 900, 300, 120, "#f97316");                     // empanadas frying
    p.E(400, 900, 300, 120, "#fb923c");
    p.P("#ea580c", [-900, 2100, 900, 2100, 700, 2500, 0, 2700, -700, 2500]);   // big empanada sign
    for (let i = 0; i < 7; i++) p.C(-750 + i * 250, 2150, 70, "#c2410c");
    p.R(-60, 1500, 120, 600, "#475569");
  }},
  // A Bangui wind turbine standing right next to the road (the blades turn!)
  windmill: { w: 3200, draw(p, o) {
    p.P("#f8fafc", [-260, 0, 260, 0, 110, 8200, -110, 8200]);
    p.P("#dfe5ec", [0, 0, 260, 0, 110, 8200, 0, 8200]);
    p.box(-300, 900, 450, 500, "#f1f5f9", "#cbd5e1", null, 7950);   // the box at the top
    const turn = frame * 0.03 + o.variant * 6;
    for (let i = 0; i < 3; i++) {
      const a = turn + (i * Math.PI * 2) / 3;
      const ex = Math.cos(a) * 3800, ey = 8180 + Math.sin(a) * 3800;
      const nx = -Math.sin(a) * 160, ny = Math.cos(a) * 160;
      p.P("#ffffff", [nx, 8180 + ny, ex, ey, -nx, 8180 - ny]);
    }
    p.C(0, 8180, 220, "#e2e8f0");
  }},
  // Old street lamp (Ilocos roadside)
  lamppost: { w: 900, draw(p) {
    p.R(-60, 0, 120, 3000, "#1f2937");
    p.R(-200, 3000, 400, 500, "#1f2937");
    p.C(0, 3250, 380, `rgba(253,224,71,${0.1 + darkness() * 0.35})`);
    p.R(-140, 3050, 280, 380, `rgba(253,230,138,${0.6 + darkness() * 0.4})`);
    p.P("#1f2937", [-260, 3500, 260, 3500, 0, 3800]);
  }},
});

// ----- Landmarks: VISAYAS -----
// A food stall with a striped awning and a big sign on top (used by several places)
function stall(p, w, wall, stripe, inside) {
  p.box(-w / 2, w, 1900, 1800, wall, "#d6d0c2", stripe);
  const n = Math.round(w / 400);
  for (let i = 0; i < n; i++) p.P(i % 2 ? "#ffffff" : stripe,
    [-w / 2 - 50 + i * (w + 100) / n, 1900, -w / 2 - 50 + (i + 1) * (w + 100) / n, 1900,
     -w / 2 - 20 + (i + 1) * (w + 100) / n, 1550, -w / 2 - 20 + i * (w + 100) / n, 1550]);
  p.R(-w / 2 + 200, 0, w - 400, 1350, inside);
  p.R(-w / 2 + 200, 750, w - 400, 80, "#a16207");        // counter
  p.R(-60, 1900, 120, 500, "#475569");                    // pole for the sign
}
Object.assign(LANDMARKS, {
  // SKYWAY: a raised highway crossing high above the road, on big concrete pillars,
  // with a green sign underneath and cars driving across the top
  skyway: { w: 9800, draw(p, o) {
    for (const px of [-3500, 3500]) {                      // the two pillars (outside the road)
      p.R(px - 280, 0, 560, 3350, "#d4d9e0");
      p.R(px + 140, 0, 140, 3350, "#a3adb9");             // shaded side
      p.P("#d4d9e0", [px - 280, 3200, px + 280, 3200, px + 650, 3620, px - 650, 3620]);   // wide top
    }
    p.R(-4900, 3600, 9800, 160, "#64748b");               // dark underside
    p.R(-4900, 3760, 9800, 560, "#e2e8f0");               // the deck
    for (let i = 0; i < 14; i++) p.R(-4900 + i * 700, 3760, 20, 560, "rgba(100,116,139,0.35)");   // panel lines
    p.R(-4900, 4180, 9800, 40, "#facc15");
    p.R(-4900, 4320, 9800, 220, "#cbd5e1");               // side barrier
    // traffic on top: small cars driving across, both ways
    const colors = ["#ef4444", "#3b82f6", "#f8fafc", "#facc15", "#22c55e", "#1f2937"];
    for (let i = 0; i < 4; i++) {
      const dir = i % 2 ? 1 : -1;
      const cx = ((((frame * 28 * dir + i * 2900 + o.variant * 9000) % 11000) + 11000) % 11000) - 5500;
      if (Math.abs(cx) > 4500) continue;
      const c = colors[(i + Math.floor(o.variant * 6)) % colors.length];
      const big = i === 3;                                // one bus
      p.R(cx - (big ? 700 : 420), 4540, big ? 1400 : 840, big ? 520 : 240, c);
      if (!big) p.R(cx - 230 + dir * 40, 4780, 460, 170, c);
      p.R(cx - (big ? 600 : 180) + dir * 30, big ? 4800 : 4790, big ? 1200 : 360, big ? 160 : 120, "#1e293b");   // windows
      p.C(cx - (big ? 450 : 260), 4550, 90, "#111111");
      p.C(cx + (big ? 450 : 260), 4550, 90, "#111111");
    }
    for (const lx of [-3600, -1200, 1200, 3600]) {         // lamp posts with lamps that glow at night
      p.R(lx - 35, 4540, 70, 1000, "#64748b");
      p.R(lx - 35, 5490, 380, 60, "#64748b");
      p.C(lx + 320, 5460, 150, `rgba(253,224,71,${0.25 + darkness() * 0.75})`);
    }
    p.R(-1400, 2850, 2800, 700, "#15803d");               // big green road sign hanging below
    p.R(-1400, 2850, 2800, 50, "#ffffff");
    p.R(-1400, 3500, 2800, 50, "#ffffff");
    p.R(-1000, 3550, 80, 60, "#94a3b8");
    p.R(920, 3550, 80, 60, "#94a3b8");
    p.T("SKYWAY ↑", 0, 3200, 360, "#ffffff");
  }},
  // Cebu: Magellan's Cross in its little octagon pavilion with a painted ceiling
  magellan: { w: 4600, draw(p) {
    p.R(-2300, 0, 4600, 250, "#d6d3d1");                    // steps
    p.box(-1900, 3800, 2600, 1600, "#f5f0e6", "#ddd5c4", null, 250);
    for (const ax of [-1600, -500, 600]) { p.R(ax, 250, 900, 1900, "#5b4636"); p.C(ax + 450, 2150, 450, "#5b4636"); }   // arches
    p.P("#9a3412", [-2200, 2850, 2200, 2850, 1300, 3900, -1300, 3900]);    // red tile roof (8 sides seen from the front)
    p.P("#7c2d12", [-1300, 3900, 1300, 3900, 700, 4500, -700, 4500]);
    p.C(0, 4600, 160, "#f5f0e6");
    p.R(-90, 600, 180, 2100, "#3b2516");                    // the big wooden cross inside
    p.R(-500, 2000, 1000, 170, "#3b2516");
    p.C(0, 2700, 380, "rgba(253,224,71,0.25)");
  }},
  // Cebu: Basilica del Santo Niño (stone front, bell tower on one side)
  santonino: { w: 6200, draw(p) {
    const stone = "#e7dcc4", shade = "#cbbd9f";
    p.box(-2400, 4000, 3600, 2600, stone, shade, null);
    p.P(stone, [-2400, 3600, 0, 4600, 1600, 3600]);
    p.box(1600, 1400, 5600, 1200, "#efe5ce", shade, null);   // bell tower
    p.R(1600, 5600, 1400, 120, "#ffffff");
    p.P("#9a3412", [1500, 5720, 3100, 5720, 2300, 6600]);
    p.R(2050, 4200, 500, 900, "#3b2f24"); p.C(2300, 5100, 250, "#3b2f24");   // bell window
    p.C(2300, 4750, 180, "#d4a017");
    p.R(-700, 0, 1400, 2000, "#5b3a22"); p.C(0, 2000, 700, "#5b3a22");      // main door
    for (const wx of [-1900, 900]) { p.R(wx, 1800, 450, 900, "#3b2f24"); p.C(wx + 225, 2700, 225, "#3b2f24"); }
    p.C(0, 3200, 300, "#3b2f24");
    p.R(-120, 4500, 240, 500, "#d4a017"); p.R(-280, 4700, 560, 110, "#d4a017");   // cross on top
    for (let i = 1; i < 8; i++) p.R(-2400, i * 450, 4000, 25, "rgba(120,90,50,0.18)");
  }},
  // Cebu lechon: a whole roast pig turning on a bamboo spit over coals
  lechon: { w: 3400, draw(p) {
    stall(p, 3000, "#fff7ed", "#b45309", "#3f2a1a");
    p.R(-1100, 900, 2200, 120, "#e8c07a");                  // bamboo spit
    p.E(0, 1150, 900, 330, "#a5521f");                       // the crispy pig
    p.E(0, 1250, 700, 160, "#c2692f");
    p.E(900, 1100, 200, 170, "#a5521f");                     // head
    p.C(1030, 1130, 40, "#1f1f1f");
    p.C(1120, 1060, 60, "#dc2626");                           // apple in the mouth
    p.R(-900, 780, 1800, 60, "#ef4444");                     // hot coals
    for (let i = 0; i < 6; i++) p.C(-750 + i * 300, 820, 50, i % 2 ? "#facc15" : "#f97316");
    p.E(0, 2700, 900, 450, "#a5521f");                       // pig sign
    p.E(0, 2780, 650, 230, "#c2692f");
    p.E(820, 2650, 220, 200, "#a5521f");
    p.C(950, 2700, 45, "#1f1f1f");
  }},
  // Bohol: a giant tarsier statue (tiny primate, HUGE eyes) on a branch
  tarsier: { w: 3600, draw(p) {
    p.R(-1600, 0, 3200, 500, "#78716c");                     // stone base
    p.R(-1500, 500, 3000, 120, "#a8a29e");
    p.curve("#5b3a22", 260, [-1500, 900, -500, 1100, 500, 1000, 1500, 1200]);   // branch
    p.E(0, 1900, 800, 1000, "#a1806a");                      // body
    p.E(-650, 1150, 260, 160, "#a1806a");                     // long fingers on the branch
    p.E(650, 1150, 260, 160, "#a1806a");
    p.C(0, 3300, 900, "#b08e78");                             // big round head
    p.E(-850, 3900, 260, 380, "#b08e78");                     // ears
    p.E(850, 3900, 260, 380, "#b08e78");
    p.E(-850, 3900, 140, 230, "#e7b9a5");
    p.E(850, 3900, 140, 230, "#e7b9a5");
    for (const ex of [-400, 400]) {                          // HUGE eyes
      p.C(ex, 3350, 420, "#fef3c7");
      p.C(ex, 3350, 330, "#d97706");
      p.C(ex, 3350, 210, "#111111");
      p.C(ex - 80, 3440, 70, "#ffffff");
    }
    p.C(0, 2950, 60, "#5b3a22");                              // tiny nose
    p.curve("#a1806a", 120, [600, 1200, 1400, 900, 1700, 600, 1500, 200]);   // thin tail
  }},
  // Bohol: Loboc River with a floating restaurant raft (bamboo, with a roof)
  loboc: { w: 6400, draw(p) {
    p.E(0, 250, 3200, 380, "#3f9a7a");                       // green river
    p.E(-600, 300, 1400, 80, "rgba(255,255,255,0.35)");
    const bob = Math.sin(frame * 0.05) * 40;
    p.R(-2200, 300 + bob, 4400, 250, "#d9b26f");             // bamboo raft
    for (let i = 0; i < 12; i++) p.R(-2200 + i * 370, 300 + bob, 30, 250, "#b8904f");
    for (const px of [-2000, -700, 700, 2000]) p.R(px - 50, 550 + bob, 100, 1300, "#8a6a3e");   // posts
    p.P("#7c4a1e", [-2500, 1850 + bob, 2500, 1850 + bob, 1900, 2500 + bob, -1900, 2500 + bob]);   // nipa roof
    for (let i = 0; i < 10; i++) p.R(-2400 + i * 500, 1850 + bob, 30, 600, "#5b3a1e");
    for (const tx of [-1200, 0, 1200]) {                     // tables with diners
      p.R(tx - 300, 900 + bob, 600, 60, "#ffffff");
      p.C(tx - 200, 1250 + bob, 120, "#8d5a3b"); p.R(tx - 320, 950 + bob, 240, 250, "#38bdf8");
      p.C(tx + 220, 1250 + bob, 120, "#7a5c45"); p.R(tx + 100, 950 + bob, 240, 250, "#f472b6");
    }
    for (const tx of [-3000, 3000]) {                        // jungle palms on the banks
      p.R(tx - 60, 0, 120, 3000, "#6b4f2a");
      for (const a of [-2.6, -2.0, -1.2, -0.5]) p.E(tx + Math.cos(a) * 700, 3000 + Math.sin(a) * 250, 750, 170, "#3f8f4a");
    }
  }},
  // Bohol: Baclayon Church, one of the oldest stone churches (coral stone, square bell tower)
  baclayon: { w: 6400, draw(p) {
    const stone = "#c4b08a", dark = "#a08b64";
    p.box(-2600, 3600, 3000, 2600, stone, dark, null);
    p.P(stone, [-2600, 3000, -1600, 3800, 0, 4100, 1000, 3000]);
    p.box(1000, 1800, 4800, 1400, "#b9a37c", dark, null);    // big square bell tower
    for (let i = 1; i < 4; i++) p.R(1000, i * 1200, 1800, 80, "#a08b64");
    p.R(1650, 3700, 500, 800, "#3b2f24"); p.C(1900, 4500, 250, "#3b2f24");
    p.P("#78716c", [900, 4800, 2900, 4800, 1900, 5700]);
    p.R(-1500, 0, 1300, 1800, "#4a3520"); p.C(-850, 1800, 650, "#4a3520");   // big arched porch
    for (const bx of [-2600, -200]) p.P(dark, [bx, 0, bx + 400, 0, bx + 400, 2200, bx, 2400]);   // buttresses
    for (let i = 0; i < 20; i++) p.C(-2400 + i * 230, 2900 + Math.sin(i) * 120, 60, "rgba(74,124,60,0.55)");   // moss
  }},
  // Iloilo: Miagao Church, a fortress church with a carved coconut-tree front
  miagao: { w: 7600, draw(p) {
    const stone = "#e0c58f", dark = "#c4a46c";
    p.box(-2200, 4400, 3400, 2400, stone, dark, null);
    p.P(stone, [-2200, 3400, -1400, 3900, 0, 4700, 1400, 3900, 2200, 3400]);
    for (const tx of [-3800, 2200]) {                       // two different towers (one taller)
      const th = tx < 0 ? 4600 : 5600;
      p.box(tx, 1600, th, 1200, "#d8bb83", dark, null);
      for (let i = 1; i < 4; i++) p.R(tx, (th / 4) * i, 1600, 70, dark);
      p.R(tx + 550, th - 1300, 500, 700, "#4a3520");
      p.P(stone, [tx - 100, th, tx + 1700, th, tx + 800, th + 500]);
    }
    p.R(-600, 0, 1200, 1700, "#4a3520"); p.C(0, 1700, 600, "#4a3520");
    // the famous carving: a big coconut tree in the middle of the front
    p.R(-60, 2100, 120, 1500, "#9a7a46");
    for (const a of [-2.7, -2.2, -1.6, -1.0, -0.5]) p.E(Math.cos(a) * 500, 3600 + Math.sin(a) * 200, 520, 120, "#b8955a");
    p.C(-700, 2600, 220, "#b8955a"); p.C(700, 2600, 220, "#b8955a");   // little carved figures
    for (let i = 1; i < 7; i++) p.R(-2200, i * 480, 4400, 25, "rgba(120,90,40,0.2)");
  }},
  // Iloilo: La Paz batchoy stall (a giant noodle bowl sign)
  batchoy: { w: 3200, draw(p) {
    stall(p, 2800, "#fffbeb", "#dc2626", "#3f2a1a");
    for (const bx of [-700, 700]) { p.E(bx, 900, 260, 110, "#f8fafc"); p.E(bx, 950, 200, 60, "#d97706"); }
    p.P("#f8fafc", [-900, 2500, 900, 2500, 650, 2050, -650, 2050]);   // the bowl
    p.R(-900, 2450, 1800, 100, "#dc2626");
    p.E(0, 2520, 880, 120, "#f59e0b");                        // soup
    p.curve("#fde68a", 60, [-500, 2560, -200, 2700, 100, 2560, 400, 2700]);   // noodles
    p.C(-300, 2600, 90, "#7c2d12"); p.C(250, 2620, 80, "#a3e635");   // meat and green onions
    p.curve("#ffffff", 50, [-300, 2700, -200, 2950, -400, 3150, -300, 3350]);   // steam
    p.curve("#ffffff", 50, [300, 2700, 400, 2950, 200, 3150, 300, 3350]);
    p.R(-900, 2600, 120, 900, "#78350f"); p.R(-700, 2600, 120, 900, "#78350f");   // chopsticks
  }},
  // Bacolod: a giant smiling MassKara festival mask on a stage
  masskara: { w: 5200, draw(p, o) {
    p.box(-2300, 4600, 600, 1400, "#7c3aed", "#5b21b6", "#a78bfa");   // stage
    const bulbs = ["#facc15", "#f472b6", "#22d3ee", "#4ade80"];
    for (let i = 0; i < 12; i++) p.C(-2200 + i * 400, 650, 70, bulbs[(i + Math.floor(frame / 12)) % 4]);
    p.R(-80, 600, 160, 900, "#475569");
    const tint = ["#facc15", "#22d3ee", "#f472b6"][Math.floor(o.variant * 3)];
    for (let i = 0; i < 9; i++) {                            // feathers fanning out
      const a = Math.PI * (0.15 + i * 0.0875);
      p.E(Math.cos(a) * 1500, 3300 + Math.sin(a) * 1500, 260, 700, ["#ef4444", "#facc15", "#22c55e", "#3b82f6", "#a855f7"][i % 5]);
    }
    p.E(0, 2800, 1500, 1300, tint);                           // the mask face
    p.E(0, 2800, 1300, 1100, "#ffffff");
    for (const ex of [-550, 550]) { p.E(ex, 3100, 330, 220, tint); p.E(ex, 3100, 180, 120, "#111111"); }
    p.curve("#dc2626", 200, [-800, 2400, -300, 1900, 300, 1900, 800, 2400]);   // BIG smile
    p.C(-950, 2500, 150, "#f9a8d4"); p.C(950, 2500, 150, "#f9a8d4");
    for (let i = 0; i < 10; i++) p.C(-1200 + i * 270, 3800 + Math.sin(i) * 100, 70, "#facc15");   // sparkly gems
  }},
  // Bacolod: The Ruins, the skeleton of an old mansion with tall columns
  ruins: { w: 7000, draw(p) {
    p.R(-3300, 0, 6600, 300, "#a8a29e");
    const wall = "#cfc6b4", dark = "#a89f8c";
    p.box(-3000, 6000, 2600, 1400, "rgba(207,198,180,0.95)", dark, null, 300);
    for (let i = 0; i < 6; i++) {                             // empty arched windows (you can see the sky)
      const wx = -2700 + i * 950;
      p.R(wx, 900, 600, 1300, "#9fc5e8");
      p.C(wx + 300, 2200, 300, "#9fc5e8");
    }
    for (const cx of [-3000, -1800, -600, 600, 1800, 2950]) p.R(cx, 300, 280, 3200, wall);   // tall columns
    p.R(-3100, 3500, 6200, 300, "#bfb6a3");
    p.P("rgba(207,198,180,0.9)", [-1500, 3800, 0, 4600, 1500, 3800]);
    for (let i = 0; i < 14; i++) p.C(-3000 + i * 460, 3700 + (i % 3) * 120, 140, "rgba(74,124,60,0.6)");   // vines
    p.R(-400, 0, 800, 1600, "#4a3d2c");
  }},
  // Bacolod: chicken inasal stall with a smoky grill
  inasal: { w: 3400, draw(p) {
    stall(p, 3000, "#fff7ed", "#ea580c", "#2a1d12");
    p.R(-1000, 800, 2000, 100, "#1f2937");                   // grill
    for (let i = 0; i < 5; i++) {                            // chicken on sticks (orange from annatto)
      p.R(-850 + i * 400, 900, 40, 500, "#d6b26b");
      p.E(-830 + i * 400, 1150, 140, 180, "#ea580c");
    }
    for (const sx of [-500, 300]) {
      const w = Math.sin(frame * 0.1 + sx) * 80;
      p.curve("rgba(220,220,220,0.7)", 90, [sx, 1400, sx + 150 + w, 1700, sx - 100 - w, 2000, sx + w, 2300]);
    }
    p.E(0, 2800, 700, 500, "#ea580c");                       // drumstick sign
    p.R(500, 2650, 600, 250, "#f8fafc");
    p.C(1150, 2650, 140, "#f8fafc"); p.C(1150, 2900, 140, "#f8fafc");
  }},
  // Boracay: a paraw sailboat on the white sand (big colorful sail, bamboo outriggers)
  paraw: { w: 5600, draw(p, o) {
    p.E(0, 120, 2800, 200, "#f5ecd7");                       // sand
    const c = ["#ef4444", "#22c55e", "#3b82f6", "#f97316"][Math.floor(o.variant * 4)];
    p.P("#8a5a2b", [-1800, 300, 1800, 300, 1500, 700, -1500, 700]);   // hull
    p.R(-1500, 650, 3000, 80, "#f8fafc");
    p.curve("#c8a46a", 80, [-2600, 400, -1400, 900, 1400, 900, 2600, 400]);   // outriggers
    p.R(-40, 700, 80, 4300, "#5b3a1e");                       // mast
    p.P(c, [0, 5000, 2300, 900, 60, 900]);                    // big sail
    p.P("rgba(255,255,255,0.35)", [60, 4200, 1300, 1600, 60, 1600]);
    p.P("#facc15", [0, 4600, -1300, 1100, -60, 1100]);        // small sail
  }},
  // Boracay: Willy's Rock, a rock in the water with a little statue on top
  willys: { w: 5000, draw(p) {
    p.E(0, 200, 2500, 300, "#5eead4");                       // shallow turquoise water
    p.E(-600, 260, 900, 60, "rgba(255,255,255,0.5)");
    p.P("#6b6157", [-1800, 200, -1500, 1600, -900, 2500, 0, 2900, 800, 2600, 1500, 1800, 1800, 200]);   // the rock
    p.P("#8a8076", [-1500, 1600, -900, 2500, 0, 2900, -200, 1700]);
    for (let i = 0; i < 8; i++) p.C(-1200 + i * 350, 2200 + Math.sin(i * 2) * 400, 140, "rgba(74,124,60,0.7)");   // little plants
    p.R(-300, 2900, 600, 250, "#e5e7eb");                     // grotto base
    p.P("#ffffff", [-180, 3150, 180, 3150, 120, 3800, -120, 3800]);   // white statue
    p.C(0, 3900, 120, "#ffffff");
    p.P("#93c5fd", [-200, 3500, 200, 3500, 150, 3800, -150, 3800]);
    p.R(-60, 3150, 120, 100, "#facc15");
  }},
  // Boracay: bamboo beach bar with a thatched roof, coconuts and torches
  beachbar: { w: 3800, draw(p) {
    p.E(0, 100, 1900, 160, "#f5ecd7");
    for (const px of [-1500, 1400]) p.R(px, 0, 120, 2100, "#c8a46a");
    p.R(-1500, 700, 3000, 900, "#d9b26f");                   // bamboo counter
    for (let i = 0; i < 14; i++) p.R(-1500 + i * 215, 700, 25, 900, "#b8904f");
    p.P("#a16207", [-2100, 2000, 2100, 2000, 1200, 3000, -1200, 3000]);   // thatched roof
    for (let i = 0; i < 16; i++) p.R(-2000 + i * 250, 1800, 40, 260, "#92400e");
    for (const cx of [-900, -300, 400]) {                    // coconut drinks with straws
      p.C(cx, 1750, 180, "#6b4f2a");
      p.R(cx + 40, 1850, 30, 300, "#f472b6");
    }
    for (const tx of [-1900, 1900]) {                        // tiki torches
      p.R(tx - 40, 0, 80, 1900, "#5b3a1e");
      const fl = 1 + Math.sin(frame * 0.5 + tx) * 0.15;
      p.P("#f97316", [tx - 120, 1900, tx + 120, 1900, tx, 1900 + 400 * fl]);
      p.P("#facc15", [tx - 60, 1900, tx + 60, 1900, tx, 1900 + 230 * fl]);
    }
  }},
  // Small Chocolate Hill beside the road (Bohol)
  chochill: { w: 4200, draw(p, o) {
    const h = 1700 + o.variant * 900, pts = [];
    for (let i = 0; i <= 16; i++) {                  // a dome: the top half of an oval
      const a = Math.PI - (i / 16) * Math.PI;
      pts.push(Math.cos(a) * 2000, Math.sin(a) * h);
    }
    p.P(o.variant > 0.5 ? "#9a7848" : "#8f8a52", pts);
    p.E(-500, h * 0.55, 700, h * 0.25, "rgba(255,240,200,0.22)");
  }},
  // A patch of tall sugarcane (Bacolod)
  cane: { w: 3000, draw(p, o) {
    for (let i = 0; i < 22; i++) {
      const x = -1400 + i * 135, h = 2200 + ((i * 37 + o.variant * 100) % 9) * 120;
      p.R(x, 0, 50, h, i % 2 ? "#5aa83c" : "#4d9a34");
      p.P("#6cc04a", [x, h, x + 450, h - 300, x + 40, h - 150]);
      p.P("#4d9a34", [x + 50, h - 200, x - 400, h - 500, x, h - 380]);
    }
  }},

  // ----- Landmarks: MINDANAO -----
  // Cagayan de Oro: whitewater rafting (a raft with paddlers going down rapids)
  rafting: { w: 6000, draw(p) {
    p.E(0, 300, 3000, 420, "#5b9bbf");                        // river
    for (let i = 0; i < 9; i++) p.E(-2400 + i * 600, 380 + (i % 2) * 80, 300, 70, "rgba(255,255,255,0.75)");   // white water
    for (const rx of [-2900, 2900]) p.P("#57534e", [rx - 600, 0, rx + 600, 0, rx + 300, 1800, rx - 400, 1400]);   // rocks
    const bob = Math.sin(frame * 0.12) * 80, tip = Math.sin(frame * 0.08) * 0.15;
    p.E(0, 650 + bob, 1500, 330, "#f97316");                  // orange raft
    p.E(0, 700 + bob, 1250, 200, "#c2410c");
    const helmets = ["#ef4444", "#facc15", "#3b82f6", "#22c55e"];
    for (let i = 0; i < 4; i++) {                             // paddlers with helmets and life vests
      const px = -900 + i * 600;
      p.R(px - 150, 750 + bob, 300, 450, "#f97316");
      p.C(px, 1350 + bob, 140, "#8d5a3b");
      p.E(px, 1430 + bob, 170, 90, helmets[i]);
      p.curve("#facc15", 60, [px + 150, 1100 + bob, px + 400, 800 + bob + tip * 400, px + 550, 500 + bob, px + 650, 300 + bob]);
    }
  }},
  // Cagayan de Oro / Bukidnon: a zipline tower with someone flying down the cable
  zipline: { w: 4400, draw(p) {
    p.R(-1600, 0, 180, 4600, "#8a6a3e");                      // wooden tower
    p.R(-900, 0, 180, 4600, "#8a6a3e");
    for (let i = 1; i < 6; i++) p.R(-1600, i * 750, 880, 80, "#a07a45");
    p.box(-1700, 1000, 300, 900, "#a07a45", "#8a6a3e", "#7c4a1e", 4600);   // platform
    p.curve("#1f2937", 40, [-1200, 4800, 0, 3900, 1200, 3000, 2200, 2400]);   // cable
    const t = (frame * 0.004) % 1;                            // the rider slides down and starts again
    const rx = -1200 + t * 3400, ry = 4800 - t * 2400;
    p.R(rx - 20, ry - 400, 40, 400, "#475569");
    p.R(rx - 200, ry - 1000, 400, 600, "#ef4444");
    p.C(rx, ry - 280, 150, "#8d5a3b");
    p.R(rx - 400, ry - 850, 300, 80, "#ef4444");             // arms out: wheee!
    p.R(rx + 100, ry - 850, 300, 80, "#ef4444");
  }},
  // Bukidnon: a pineapple plantation with rows of pineapples and a truck full of them
  pineapples: { w: 6400, draw(p) {
    for (let row = 3; row >= 0; row--) {
      for (let i = 0; i < 16; i++) {
        const px = -3000 + i * 400 + (row % 2) * 200, py = row * 140;
        p.P("#4d7c5f", [px - 200, py, px + 200, py, px, py + 420]);       // spiky leaves
        p.P("#6b9a7c", [px - 60, py, px + 260, py + 320, px + 60, py]);
        if ((i + row) % 3 === 0) { p.E(px, py + 300, 90, 130, "#eab308"); p.P("#4d7c5f", [px - 70, py + 410, px + 70, py + 410, px, py + 620]); }
      }
    }
    p.box(1200, 2400, 1200, 1300, "#facc15", "#ca8a04", null, 700);   // truck box full of pineapples
    for (let i = 0; i < 9; i++) p.E(1400 + i * 240, 2000 + (i % 2) * 120, 110, 150, "#eab308");
    p.box(3600, 900, 1500, 1100, "#16a34a", "#15803d", null, 500);    // truck cab
    p.R(3800, 1300, 500, 450, "#bfe3f5");
    for (const wx of [1600, 3100, 4100]) { p.C(wx, 400, 330, "#111111"); p.C(wx, 400, 150, "#9ca3af"); }
  }},
  // Bukidnon: a cattle ranch fence with cows and a cowboy on a horse
  ranch: { w: 6000, draw(p) {
    for (let i = 0; i < 9; i++) p.R(-2900 + i * 720, 0, 120, 1300, "#8a6a3e");   // fence
    p.R(-2900, 900, 5800, 100, "#a07a45"); p.R(-2900, 450, 5800, 100, "#a07a45");
    for (const [cx, spots] of [[-1500, "#1f1f1f"], [300, "#78350f"]]) {   // cows
      p.E(cx, 1500, 750, 420, "#f5f5f4");
      p.C(cx - 250, 1600, 180, spots); p.C(cx + 300, 1450, 140, spots);
      p.E(cx + 820, 1700, 240, 200, "#f5f5f4");
      p.E(cx + 980, 1650, 90, 70, "#fda4af");
      for (const lx of [-450, -150, 200, 500]) p.R(cx + lx, 1000, 110, 450, "#e7e5e4");
    }
    p.E(2000, 1900, 800, 400, "#7c4a1e");                     // horse
    p.E(2800, 2400, 260, 420, "#7c4a1e");
    p.E(3000, 2750, 280, 180, "#7c4a1e");
    for (const lx of [1500, 1800, 2200, 2450]) p.R(lx, 1100, 110, 600, "#6b3e18");
    p.R(1850, 2200, 300, 700, "#2563eb");                     // cowboy
    p.C(2000, 3050, 160, "#8d5a3b");
    p.E(2000, 3200, 400, 80, "#a16207"); p.R(1830, 3200, 340, 220, "#a16207");   // cowboy hat
  }},
  // Bukidnon: Monastery of the Transfiguration (a chapel shaped like a tall pyramid)
  monastery: { w: 5600, draw(p) {
    p.R(-2600, 0, 5200, 500, "#d6d3d1");
    p.P("#e7e5e4", [-2400, 500, 2400, 500, 0, 5600]);          // pyramid-shaped roof
    p.P("#cfcac4", [0, 500, 2400, 500, 0, 5600]);
    for (let i = 1; i < 6; i++) p.R(-2400 + i * 400, 500 + i * 850, 4800 - i * 800, 40, "rgba(120,110,100,0.35)");
    p.R(-500, 500, 1000, 1700, "#5b4636");                     // entrance
    p.P("#bfe3f5", [-300, 2600, 300, 2600, 0, 3900]);          // tall window
    p.R(-60, 5600, 120, 700, "#78716c"); p.R(-250, 6000, 500, 100, "#78716c");   // cross on top
  }},
  // Davao: a giant Philippine Eagle statue (the national bird) on a pedestal
  eagle: { w: 5200, draw(p) {
    p.box(-1200, 2400, 1400, 1200, "#a8a29e", "#8a847e", "#cbd5e1");   // pedestal
    p.E(0, 2700, 900, 1200, "#6b4423");                        // body
    p.E(0, 2400, 600, 800, "#f5f0e6");                         // white chest
    for (const s of [-1, 1]) {                                 // wings spread wide
      p.P("#5a3a1e", [s * 600, 3300, s * 2600, 4400, s * 2500, 3000, s * 1900, 2400, s * 800, 2300]);
      for (let i = 0; i < 5; i++) p.P("#3f2a14", [s * (1400 + i * 240), 2600 + i * 120, s * (1600 + i * 240), 2300 + i * 120, s * (1700 + i * 240), 2700 + i * 160]);
    }
    p.C(0, 4100, 520, "#f5f0e6");                              // head
    for (let i = 0; i < 9; i++) p.P(i % 2 ? "#8a5a2b" : "#a0713c", [-500 + i * 120, 4400, -400 + i * 120, 4400, -440 + i * 120, 4950]);   // shaggy crest
    p.C(180, 4150, 90, "#1e3a8a"); p.C(190, 4150, 40, "#111111");   // sharp blue-grey eye
    p.P("#475569", [350, 4150, 900, 3900, 450, 3800]);           // big curved beak
    p.P("#facc15", [400, 1500, 600, 1500, 500, 1400]);           // feet
  }},
  // Davao: a durian fruit stand (spiky, smelly, delicious) with a giant durian sign
  durian: { w: 3400, draw(p) {
    stall(p, 3000, "#f7fee7", "#65a30d", "#2a1d12");
    for (const dx of [-900, -300, 300, 900]) {                 // durians on the counter
      p.E(dx, 1050, 240, 280, "#a3a33a");
      for (let i = 0; i < 6; i++) p.P("#6b7a20", [dx - 200 + i * 80, 1100 + (i % 2) * 80, dx - 160 + i * 80, 1100, dx - 180 + i * 80, 1260]);
    }
    p.E(0, 2800, 800, 900, "#a3a33a");                         // giant durian sign
    for (let r = 0; r < 5; r++) for (let i = 0; i < 6; i++) {
      const sx = -550 + i * 220, sy = 2200 + r * 260;
      p.P("#6b7a20", [sx - 70, sy, sx + 70, sy, sx, sy + 170]);
    }
    p.P("#65a30d", [-100, 3700, 100, 3700, 60, 4100, -60, 4100]);
    p.E(500, 2600, 200, 300, "#fde047");                       // it's open: yellow fruit inside
  }},
  // General Santos: a giant tuna statue (Tuna Capital of the Philippines)
  tuna: { w: 6000, draw(p) {
    p.box(-1500, 3000, 900, 1200, "#64748b", "#475569", "#94a3b8");   // base
    const sw = Math.sin(frame * 0.06) * 120;                   // the tail swishes a little
    p.E(0, 2600, 2300, 900, "#1e3a8a");                         // dark blue back
    p.E(0, 2300, 2100, 600, "#cbd5e1");                         // silver belly
    p.P("#1e3a8a", [2000, 2600, 3000, 3600 + sw, 2600, 2600, 3000, 1600 - sw]);   // tail
    p.P("#facc15", [-300, 3400, 400, 3400, 0, 4200]);           // yellow fins
    p.P("#facc15", [-200, 1900, 400, 1900, 100, 1300]);
    for (let i = 0; i < 6; i++) p.P("#facc15", [900 + i * 180, 3300, 1000 + i * 180, 3300, 950 + i * 180, 3550]);
    p.C(-1600, 2700, 170, "#ffffff"); p.C(-1600, 2700, 90, "#111111");   // eye
    p.P("#0f172a", [-2300, 2500, -1900, 2450, -2250, 2350]);    // mouth
  }},
  // General Santos: the fish port with boats, crates of fish and an ice house
  fishport: { w: 6800, draw(p) {
    p.R(-3400, 0, 6800, 400, "#9ca3af");                       // concrete pier
    p.box(-3200, 2600, 2400, 1600, "#e2e8f0", "#cbd5e1", "#3b82f6", 400);   // ice house
    p.R(-2600, 400, 1200, 1500, "#1e3a8a");
    p.R(-3200, 2500, 2600, 250, "#3b82f6");
    for (let i = 0; i < 6; i++) {                              // crates of fish
      const cx = 200 + (i % 3) * 700, cy = 400 + Math.floor(i / 3) * 450;
      p.R(cx, cy, 600, 420, "#2563eb");
      for (let k = 0; k < 3; k++) p.E(cx + 150 + k * 150, cy + 380, 90, 50, "#cbd5e1");
    }
    p.P("#f8fafc", [500, 1500, 3300, 1500, 3000, 2000, 800, 2000]);   // a banca boat behind
    p.R(1400, 2000, 900, 600, "#ef4444");
    p.curve("#3f3f46", 50, [0, 1450, 1200, 1350, 2600, 1350, 3800, 1450]);
  }},
  // Zamboanga: Fort Pilar, an old Spanish fort with a shrine on its wall
  fortpilar: { w: 7600, draw(p) {
    const stone = "#b8a27c", dark = "#9a855f";
    p.box(-3600, 7200, 2800, 1600, stone, dark, null);
    for (let i = 0; i < 13; i++) p.R(-3600 + i * 560, 2800, 300, 350, stone);   // battlements
    for (let i = 1; i < 7; i++) p.R(-3600, i * 400, 7200, 25, "rgba(80,60,30,0.25)");
    p.R(-900, 300, 1800, 2200, "#e7dcc4");                     // the shrine
    p.P("#e7dcc4", [-1100, 2500, 1100, 2500, 0, 3400]);
    p.R(-450, 700, 900, 1300, "#1e3a8a");
    p.P("#93c5fd", [-200, 900, 200, 900, 150, 1800, -150, 1800]);   // statue of the Virgin
    p.C(0, 1900, 120, "#fde68a");
    for (let i = 0; i < 9; i++) p.C(-700 + i * 175, 380, 60, `rgba(253,224,71,${0.5 + 0.5 * Math.sin(frame * 0.2 + i)})`);   // candles
    p.R(-3300, 0, 1200, 1800, "#5b4636"); p.C(-2700, 1800, 600, "#5b4636");   // fort gate
    for (let i = 0; i < 10; i++) p.C(-3400 + i * 700, 2700 + Math.sin(i) * 150, 160, "rgba(74,124,60,0.55)");
  }},
  // Zamboanga: a vinta boat with its striped sail (very colorful!)
  vinta: { w: 4800, draw(p, o) {
    p.E(0, 120, 2400, 200, "#e9d8a6");
    const sets = [["#ef4444", "#facc15", "#22c55e", "#3b82f6", "#f97316"], ["#a855f7", "#facc15", "#ec4899", "#22c55e", "#3b82f6"]];
    const cols = sets[Math.floor(o.variant * 2)];
    p.P("#7c4a1e", [-2000, 300, 2000, 300, 1700, 650, -1700, 650]);   // hull
    for (let i = 0; i < 8; i++) p.R(-1600 + i * 420, 450, 200, 100, cols[i % 5]);   // painted pattern on the hull
    p.curve("#c8a46a", 70, [-2400, 400, -1400, 800, 1400, 800, 2400, 400]);   // outriggers
    p.R(-40, 650, 80, 4200, "#5b3a1e");                         // mast
    for (let i = 0; i < 5; i++) p.R(0, 1100 + i * 700, 2200 - i * 120, 700, cols[i]);   // striped sail
    p.R(0, 4600, 2000, 60, "#5b3a1e");
  }},
});

// Rainforest tree beside the road (Mindanao): tall trunk, wide leafy crown
function drawJungleTree(x, y, size) {
  const h = size * 1.2;
  ctx.fillStyle = "#5b3a22";
  ctx.fillRect(x - h * 0.035, y - h * 0.6, h * 0.07, h * 0.6);
  ctx.strokeStyle = "#5b3a22";                         // roots
  ctx.lineWidth = Math.max(1, h * 0.03);
  ctx.beginPath(); ctx.moveTo(x, y - h * 0.15); ctx.lineTo(x - h * 0.12, y); ctx.moveTo(x, y - h * 0.15); ctx.lineTo(x + h * 0.12, y); ctx.stroke();
  for (const [dx, dy, r, c] of [[-0.18, 0.62, 0.2, "#1f5e3a"], [0.18, 0.64, 0.2, "#245f3c"], [0, 0.78, 0.24, "#2c7048"],
    [-0.1, 0.9, 0.16, "#3a8050"], [0.12, 0.88, 0.15, "#2c7048"]]) {
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(x + dx * h, y - dy * h, r * h, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.beginPath(); ctx.arc(x - 0.08 * h, y - 0.86 * h, 0.08 * h, 0, Math.PI * 2); ctx.fill();
}

// ----- AIRPORT: every run starts at an airport (the first 300 m), then the first place -----
const AIRPORT_LEN = 30000;                 // 300 meters of road
const AIRPORT = { name: "Paliparan", icon: "✈️", time: "day", rain: false, bg: "airport", planes: true,
  note: "Welcome! Drive out of the airport",
  landmarks: ["terminal", "tower", "parkedplane", "hangar"],
  fillers: ["runwaylights", "windsock", "luggage", "runwaylights"],
  grass: [[170, 198, 142], [160, 188, 132]] };
// Background: a long runway at the horizon with planes waiting, and the terminal far away
backdrops.airport = makeLayer((g) => {
  farPeaks(g, "#d6e3dc");
  g.fillStyle = "#9ca3af";                               // the runway
  g.fillRect(0, HORIZON - 10, LAYER_W, 8);
  g.fillStyle = "#f8fafc";
  for (let x = 0; x < LAYER_W; x += 40) g.fillRect(x, HORIZON - 6.5, 20, 1.5);   // runway center line
  for (let x = 0; x < LAYER_W; x += 26) {                // runway lights
    g.fillStyle = x % 52 ? "#60a5fa" : "#fde047";
    g.fillRect(x, HORIZON - 11, 2, 2);
  }
  for (let i = 0; i < 6; i++) {                          // little planes waiting on the runway
    const x = (i / 6) * LAYER_W + 80;
    wrapped(x, (px) => {
      g.fillStyle = "#f1f5f9"; g.fillRect(px - 16, HORIZON - 16, 32, 5);
      fillPoly(g, "#1d4ed8", [px - 16, HORIZON - 16, px - 10, HORIZON - 16, px - 15, HORIZON - 24]);
      fillPoly(g, "#cbd5e1", [px - 2, HORIZON - 12, px + 4, HORIZON - 12, px - 4, HORIZON - 8]);
    });
  }
  for (let i = 0; i < 3; i++) {                          // terminal buildings far away
    const x = LAYER_W * (0.15 + i * 0.33);
    wrapped(x, (px) => {
      g.fillStyle = "#e2e8f0"; g.fillRect(px, HORIZON - 30, 120, 18);
      g.fillStyle = "#7dd3fc"; g.fillRect(px + 4, HORIZON - 27, 112, 8);
      g.fillStyle = "#94a3b8"; g.fillRect(px + 130, HORIZON - 52, 6, 40);
      g.fillStyle = "#334155"; g.fillRect(px + 124, HORIZON - 60, 18, 9);
    });
  }
});
Object.assign(LANDMARKS, {
  // Terminal building: long glass front, a curved roof and a jetway (tunnel to the plane)
  terminal: { w: 9600, draw(p) {
    p.box(-4600, 9000, 2600, 2400, "#e2e8f0", "#cbd5e1", null);
    p.R(-4400, 600, 8600, 1700, "#7dd3fc");               // big glass wall
    for (let i = 0; i < 18; i++) p.R(-4400 + i * 480, 600, 40, 1700, "#94a3b8");
    p.P("#f1f5f9", [-4900, 2600, 4500, 2600, 4200, 3300, -4600, 3300]);   // curved roof
    p.P("#cbd5e1", [-4600, 3300, 4200, 3300, 3800, 3500, -4200, 3500]);
    p.R(-1800, 2700, 3600, 450, "#1d4ed8");                // blue sign band
    p.R(-1600, 2780, 3200, 60, "#facc15");
    for (const dx of [-2200, 1400]) p.R(dx, 0, 900, 600, "#475569");   // entrances
    p.R(4400, 1200, 2600, 500, "#d1d5db");                 // jetway
    p.R(6800, 600, 200, 1100, "#94a3b8");
    for (let i = 0; i < 6; i++) p.R(-4300 + i * 1500, 0, 600, 420, ["#ef4444", "#3b82f6", "#facc15"][i % 3]);   // taxis and cars out front
  }},
  // Control tower: tall stem with a glass room on top and a blinking red light
  tower: { w: 3000, draw(p) {
    p.R(-1200, 0, 2400, 900, "#cbd5e1");                   // base building
    p.R(-450, 900, 900, 5600, "#e2e8f0");                  // tall stem
    p.R(150, 900, 300, 5600, "#cbd5e1");
    p.P("#94a3b8", [-1300, 6500, 1300, 6500, 1000, 6800, -1000, 6800]);
    p.P("#38bdf8", [-1250, 6800, 1250, 6800, 1050, 7700, -1050, 7700]);   // glass control room
    for (let i = 0; i < 6; i++) p.R(-1000 + i * 400, 6800, 40, 900, "#475569");
    p.P("#475569", [-1150, 7700, 1150, 7700, 800, 8000, -800, 8000]);
    p.R(-40, 8000, 80, 900, "#64748b");                    // antenna
    if (Math.floor(frame / 30) % 2) p.C(0, 8950, 160, "#ff2d2d");
  }},
  // A parked plane with stairs and a luggage truck beside it
  parkedplane: { w: 8000, draw(p, o) {
    const tail = ["#1d4ed8", "#dc2626", "#16a34a"][Math.floor(o.variant * 3)];
    p.E(0, 1300, 3800, 650, "#f1f5f9");                    // body (front view of the side)
    p.R(-3600, 1100, 7200, 160, tail);                     // stripe
    for (let i = 0; i < 16; i++) p.C(-3000 + i * 380, 1500, 90, "#1e293b");   // windows
    p.P("#1e293b", [3300, 1500, 3800, 1350, 3700, 1650]);  // cockpit
    p.P(tail, [-3800, 1500, -2700, 1500, -3500, 3300, -4100, 3300]);   // tail fin
    p.P("#cbd5e1", [-800, 1000, 900, 1000, -1400, 300, -2600, 300]);   // wing
    p.E(-1500, 600, 450, 230, "#94a3b8");                  // engine
    for (const lx of [-2400, 2600]) { p.R(lx, 0, 80, 650, "#475569"); p.C(lx + 40, 120, 160, "#111111"); }   // wheels
    p.P("#facc15", [2200, 0, 2800, 0, 3200, 1100, 2900, 1100]);   // stairs
    p.R(-3600, 0, 1300, 500, "#f97316");                   // luggage truck
    p.R(-3500, 500, 500, 300, "#bfe3f5");
  }},
  // Hangar: a big curved-roof building with open doors and a plane inside
  hangar: { w: 7600, draw(p) {
    const pts = [];
    for (let i = 0; i <= 16; i++) { const a = Math.PI - (i / 16) * Math.PI; pts.push(Math.cos(a) * 3600, Math.sin(a) * 3800); }
    p.P("#9ca3af", pts);
    for (let i = 1; i < 8; i++) p.R(-3600 + i * 900, 0, 30, 3800 * Math.sin(Math.acos((i * 900 - 3600) / 3600)), "rgba(71,85,105,0.4)");
    p.R(-2400, 0, 4800, 2400, "#1f2937");                  // open doors: dark inside
    p.E(0, 900, 1800, 350, "#e2e8f0");                     // a plane inside
    p.P("#dc2626", [-1800, 1000, -1300, 1000, -1700, 1900]);
    p.R(-2600, 2400, 5200, 200, "#facc15");
  }},
  // Rows of runway lights (blue and white)
  runwaylights: { w: 2600, draw(p) {
    for (let i = 0; i < 6; i++) {
      const x = -1200 + i * 480;
      p.R(x - 30, 0, 60, 380, "#475569");
      p.C(x, 420, 90, i % 2 ? "#60a5fa" : "#f8fafc");
      p.C(x, 420, 170, `rgba(147,197,253,${0.2 + darkness() * 0.5})`);
    }
  }},
  // Windsock: shows which way the wind blows (it flaps)
  windsock: { w: 1400, draw(p) {
    p.R(-50, 0, 100, 2600, "#e5e7eb");
    const flap = Math.sin(frame * 0.15) * 80;
    for (let i = 0; i < 5; i++) p.P(i % 2 ? "#ffffff" : "#f97316",
      [i * 200, 2500 - i * 20 + flap * i * 0.2, (i + 1) * 200, 2500 - (i + 1) * 20 + flap * (i + 1) * 0.2,
       (i + 1) * 200, 2200 + (i + 1) * 30 + flap * (i + 1) * 0.2, i * 200, 2200 + i * 30 + flap * i * 0.2]);
  }},
  // Luggage carts pulled by a little tug
  luggage: { w: 3200, draw(p) {
    p.R(-1500, 150, 700, 450, "#facc15"); p.R(-1450, 600, 300, 250, "#bfe3f5");   // tug
    for (let i = 0; i < 3; i++) {
      const cx = -700 + i * 800;
      p.R(cx, 150, 700, 120, "#64748b");
      for (let k = 0; k < 3; k++) p.R(cx + 40 + k * 220, 270, 200, 260 + (k % 2) * 80, ["#ef4444", "#1d4ed8", "#16a34a", "#a855f7"][(i + k) % 4]);
    }
    for (let i = 0; i < 6; i++) p.C(-1300 + i * 560, 120, 110, "#111111");
  }},
});

// A pine tree drawn with the landmark painter (layers of dark green triangles)
function drawPine(p, x, h) {
  p.R(x - 70, 0, 140, h * 0.25, "#5b3a22");
  for (let i = 0; i < 4; i++) {
    const y0 = h * (0.15 + i * 0.2), wdt = h * (0.32 - i * 0.065);
    p.P(i % 2 ? "#2f5c47" : "#264d3b", [x - wdt, y0, x + wdt, y0, x, y0 + h * 0.38]);
  }
}
// A pine tree beside the road in Baguio (instead of the usual trees)
function drawPineTree(x, y, size) {
  const h = size * 1.15;
  ctx.fillStyle = "#5b3a22";
  ctx.fillRect(x - h * 0.03, y - h * 0.25, h * 0.06, h * 0.25);
  for (let i = 0; i < 4; i++) {
    const y0 = y - h * (0.12 + i * 0.2), wdt = h * (0.24 - i * 0.045);
    poly(i % 2 ? "#2f5c47" : "#264d3b", [x - wdt, y0, x + wdt, y0, x, y0 - h * 0.36]);
  }
}


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
  const waiting = crossing && relZ(crossing.z, playerZ()) < 32 * SEG_LEN;
  const walking = ped.delay <= 0 && Math.abs(ped.x) < 1.38 && !waiting;
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

// ----- TAG-INIT (hot season) heat haze for Calamba -----
// The finished picture is copied to a hidden canvas, then pasted back in thin
// horizontal strips, each strip pushed a little left or right by a smooth wave.
// That makes the road "wiggle" like hot air. It's just ~100 image copies per
// frame (fast for the browser), so it doesn't slow the game down.
const heatBuf = document.createElement("canvas");
heatBuf.width = W;
heatBuf.height = H;
const heatCtx = heatBuf.getContext("2d");
let heat = 0;                                         // 0 = normal, 1 = full heat

function applyHeat() {
  if (heat < 0.01) return;
  heatCtx.drawImage(canvas, 0, 0);                    // copy the finished picture
  const t = frame * 0.05;
  const top = HORIZON - 70;
  const STRIP = 4;
  for (let y = top; y < H; y += STRIP) {
    const near = (y - top) / (H - top);               // 0 = far (horizon), 1 = close
    const amp = heat * (9 * (1 - near) + 1.5);        // stronger far away, over the hot road
    const dx = Math.sin(y * 0.07 + t) * amp + Math.sin(y * 0.021 - t * 0.6) * amp * 0.5;
    ctx.drawImage(heatBuf, 0, y, W, STRIP, dx, y, W, STRIP);
  }
  // warm orange tint over everything
  ctx.fillStyle = `rgba(255,140,40,${0.13 * heat})`;
  ctx.fillRect(0, 0, W, H);
  // mirage: a bright, shimmering band near the horizon that hides the far road
  const g = ctx.createLinearGradient(0, HORIZON - 25, 0, HORIZON + 70);
  g.addColorStop(0, "rgba(255,245,225,0)");
  g.addColorStop(0.35, `rgba(255,245,225,${0.6 * heat})`);
  g.addColorStop(1, "rgba(255,245,225,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, HORIZON - 25, W, 95);
}

// ----- 15. DRAW everything -----
function drawLayer(layer, offset) {
  const x = -(((offset % LAYER_W) + LAYER_W) % LAYER_W);
  ctx.drawImage(layer, x, 0);
  ctx.drawImage(layer, x + LAYER_W, 0);
}

// Where the road disappears on the horizon (updated every frame in drawWorld)
let vanishX = W / 2;
let groundTop = HORIZON;   // the highest point of ground on screen (hills can rise above the horizon)
let fgBoxes = [];          // screen areas of things standing in front of the sky
let lean = 0;              // camera tilt (radians) on curves and lane changes

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
// A Filipino traffic enforcer (feet at x, y; about h pixels tall).
// wave: -1..1 moves the raised arm that waves the traffic away.
function drawEnforcer(x, y, h, wave = 0) {
  const u = h / 100;                                       // 1 unit = 1% of the height
  const R = (x0, y0, w0, h0, c) => { ctx.fillStyle = c; ctx.fillRect(x + x0 * u, y - y0 * u, w0 * u, h0 * u); };
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.3)";                       // shadow
  ctx.beginPath(); ctx.ellipse(x, y, 20 * u, 4 * u, 0, 0, Math.PI * 2); ctx.fill();
  R(-11, 46, 9, 44, "#1e293b");                            // dark blue pants
  R(2, 46, 9, 44, "#1e293b");
  R(-13, 4, 12, 4, "#0b0b0b");                             // black shoes
  R(1, 4, 12, 4, "#0b0b0b");
  R(-14, 80, 28, 36, "#7dd3fc");                           // light blue polo
  R(-15, 78, 30, 32, "#a3e635");                           // reflective vest
  R(-15, 66, 30, 3, "#e5e7eb");                            // silver reflective stripes
  R(-15, 56, 30, 3, "#e5e7eb");
  R(-2, 78, 4, 32, "#7dd3fc");                             // vest opening
  R(-16, 48, 32, 4, "#111827");                            // belt
  R(-2, 48, 4, 4, "#d4a017");
  // left arm holding the orange glowing baton (down by the side)
  R(-19, 78, 6, 24, "#7dd3fc");
  R(-19, 55, 6, 4, "#8d5a3b");
  const glow = ctx.createRadialGradient(x - 22 * u, y - 45 * u, 0, x - 22 * u, y - 45 * u, 14 * u);
  glow.addColorStop(0, "rgba(251,146,60,0.7)");
  glow.addColorStop(1, "rgba(251,146,60,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(x - 36 * u, y - 60 * u, 28 * u, 30 * u);
  ctx.save();
  ctx.translate(x - 16 * u, y - 54 * u);
  ctx.rotate(0.35);
  ctx.fillStyle = "#fb923c";
  ctx.fillRect(-2 * u, 0, 4 * u, 22 * u);
  ctx.fillStyle = "#fed7aa";
  ctx.fillRect(-0.5 * u, 2 * u, 1.5 * u, 18 * u);
  ctx.restore();
  // right arm raised high with a white glove, waving the traffic away
  ctx.save();
  ctx.translate(x + 13 * u, y - 77 * u);
  ctx.rotate(-2.5 + wave * 0.4);
  ctx.fillStyle = "#7dd3fc";
  ctx.fillRect(-3 * u, 0, 6 * u, 15 * u);
  ctx.fillStyle = "#8d5a3b";
  ctx.fillRect(-2.5 * u, 15 * u, 5 * u, 9 * u);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(0, 27 * u, 4.5 * u, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // head: face, sunglasses, whistle, cap
  R(-3, 84, 6, 5, "#8d5a3b");                              // neck
  ctx.fillStyle = "#8d5a3b";
  ctx.beginPath(); ctx.arc(x, y - 91 * u, 8 * u, 0, Math.PI * 2); ctx.fill();
  R(-7, 94, 14, 3, "#0f172a");                             // sunglasses
  R(2, 88, 7, 3, "#d1d5db");                               // whistle in the mouth
  ctx.strokeStyle = "#ef4444";                             // whistle cord
  ctx.lineWidth = 1.2 * u;
  ctx.beginPath(); ctx.moveTo(x + 6 * u, y - 87 * u); ctx.quadraticCurveTo(x + 9 * u, y - 80 * u, x + 3 * u, y - 76 * u); ctx.stroke();
  R(-9, 103, 18, 7, "#f8fafc");                            // white cap
  R(-9, 98, 18, 3, "#1d4ed8");                             // blue band
  R(-2, 99, 4, 4, "#facc15");                              // badge
  R(0, 97, 13, 2.5, "#0f172a");                            // visor
  ctx.restore();
}

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
  } else if (kind === "enforcer") {   // a whistle
    ctx.beginPath();
    ctx.arc(x - 0.1 * r, y + 0.1 * r, 0.36 * r, 0, Math.PI * 2);   // round body
    ctx.fill();
    ctx.fillRect(x - 0.1 * r, y - 0.26 * r, 0.65 * r, 0.3 * r);     // mouthpiece
    ctx.lineWidth = 0.1 * r;
    ctx.beginPath();
    ctx.arc(x - 0.42 * r, y - 0.32 * r, 0.16 * r, 0, Math.PI * 2);  // ring for the cord
    ctx.stroke();
    ctx.fillStyle = POWERS.enforcer.color;
    ctx.beginPath();
    ctx.arc(x - 0.1 * r, y + 0.1 * r, 0.13 * r, 0, Math.PI * 2);    // hole
    ctx.fill();
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

// A floating power-up on the road: a beam of light, a glowing ring on the road,
// sparkles going round it, and a shiny bubble with the icon (and its name up close)
function drawPowerUp(kind, x, y, w) {
  const col = POWERS[kind].color, rgb = rgbOf(col);
  const r = w * 0.22;
  if (r < 1.5) return;
  const pulse = 0.5 + 0.5 * Math.sin(frame * 0.15);
  const cy = y - r * 1.9 - Math.sin(frame * 0.1) * r * 0.25;   // bobs up and down
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  // beam of light going up from the road (easy to spot far away)
  const beam = ctx.createLinearGradient(0, y, 0, y - r * 7);
  beam.addColorStop(0, `rgba(${rgb},0.45)`);
  beam.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = beam;
  ctx.fillRect(x - r * 0.7, y - r * 7, r * 1.4, r * 7);
  // glowing ring on the road
  ctx.strokeStyle = `rgba(${rgb},${0.5 + pulse * 0.4})`;
  ctx.lineWidth = Math.max(1, r * 0.14);
  ctx.beginPath();
  ctx.ellipse(x, y, r * (1.3 + pulse * 0.3), r * (0.32 + pulse * 0.08), 0, 0, Math.PI * 2);
  ctx.stroke();
  // soft halo around the bubble
  const halo = ctx.createRadialGradient(x, cy, r * 0.6, x, cy, r * 2.2);
  halo.addColorStop(0, `rgba(${rgb},${0.45 + pulse * 0.25})`);
  halo.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = halo;
  ctx.fillRect(x - r * 2.2, cy - r * 2.2, r * 4.4, r * 4.4);
  ctx.restore();
  // sparkles going round
  for (let i = 0; i < 3; i++) {
    const a = frame * 0.07 + (i * Math.PI * 2) / 3;
    const sx = x + Math.cos(a) * r * 1.5, sy = cy + Math.sin(a) * r * 0.5;
    const sr = r * 0.16 * (Math.sin(a) > 0 ? 1.2 : 0.8);
    poly("#ffffff", [sx, sy - sr * 2, sx + sr * 0.5, sy, sx, sy + sr * 2, sx - sr * 0.5, sy]);
    poly("#ffffff", [sx - sr * 2, sy, sx, sy - sr * 0.5, sx + sr * 2, sy, sx, sy + sr * 0.5]);
  }
  // the bubble: lighter in the middle, white rim, shine on top
  const ball = ctx.createRadialGradient(x - r * 0.3, cy - r * 0.35, r * 0.1, x, cy, r);
  ball.addColorStop(0, "#ffffff");
  ball.addColorStop(0.25, col);
  ball.addColorStop(1, `rgba(${rgb},0.85)`);
  ctx.fillStyle = ball;
  ctx.beginPath();
  ctx.arc(x, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.stroke();
  drawPowerIcon(kind, x, cy, r);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.ellipse(x - r * 0.35, cy - r * 0.5, r * 0.3, r * 0.15, -0.5, 0, Math.PI * 2);
  ctx.fill();
  if (r > 13) outlinedText(POWERS[kind].label, x, cy - r * 1.75, Math.min(22, r * 0.6), col);
}

// Effects on and around YOUR car while a power-up is on.
// behind = true: things drawn before the car; false: things drawn on top of it.
function drawPlayerPowerFx(p, behind) {
  const cx = p.x, cy = p.y - p.w * 0.35;
  if (behind) {
    // SLOW-MO: purple afterimages where the car just was, and slow ripples on the road
    if (slowT > 0) {
      for (let i = ghostXs.length - 1; i >= 0; i -= 4) {
        const gx = ghostXs[i];
        if (Math.abs(gx - cx) < 3) continue;
        ctx.globalAlpha = 0.18 * (1 - i / ghostXs.length);
        drawPlayerVehicle(ptype(), gx, p.y, p.w);
      }
      ctx.globalAlpha = 1;
      for (let i = 0; i < 3; i++) {
        const t = ((frame * 0.6 + i * 40) % 120) / 120;
        ctx.strokeStyle = `rgba(168,85,247,${0.55 * (1 - t)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(cx, p.y, p.w * (0.5 + t * 0.9), p.w * (0.08 + t * 0.14), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // MAGNET: red waves going out in front of the car, pulling coins in
    if (magnetT > 0) {
      for (let i = 0; i < 4; i++) {
        const t = ((frame * 1.2 + i * 30) % 120) / 120;   // 0 = at the car, 1 = far ahead
        const wy = p.y - p.w * 0.2 - t * p.w * 1.6;
        const ww = p.w * (0.9 - t * 0.55);
        ctx.strokeStyle = `rgba(239,68,68,${0.7 * (1 - t)})`;
        ctx.lineWidth = 4 * (1 - t) + 1;
        ctx.beginPath();
        ctx.ellipse(cx, wy, ww, ww * 0.18, 0, Math.PI, Math.PI * 2);
        ctx.stroke();
      }
    }
    return;
  }
  // SHIELD: a shiny blue bubble with a light that goes round it
  if (shield) {
    const rx = p.w * 0.72, ry = p.w * 0.6;
    const bub = ctx.createRadialGradient(cx, cy, rx * 0.4, cx, cy, rx);
    bub.addColorStop(0, "rgba(56,189,248,0.05)");
    bub.addColorStop(1, `rgba(56,189,248,${0.32 + Math.sin(frame * 0.15) * 0.1})`);
    ctx.fillStyle = bub;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(125,211,252,0.9)";
    ctx.lineWidth = 3;
    ctx.stroke();
    const a = frame * 0.06;
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, a, a + 0.7);
    ctx.stroke();
  }
  // A small badge above the car for each timed power-up, with a ring that empties
  const timed = [];
  if (magnetT > 0) timed.push(["magnet", magnetT / magnetMax]);
  if (slowT > 0) timed.push(["slowmo", slowT / slowMax]);
  if (clearT > 0) timed.push(["enforcer", clearT / ENFORCER_TIME]);
  const br = Math.max(10, p.w * 0.1);
  timed.forEach(([kind, left], i) => {
    if (left < 0.25 && Math.floor(frame / 6) % 2) return;   // blinks when almost over
    const bx = cx + (i - (timed.length - 1) / 2) * br * 2.6;
    const by = p.y - p.w * 0.95 - Math.sin(frame * 0.1 + i) * 3;
    ctx.fillStyle = "rgba(15,23,42,0.75)";
    ctx.beginPath();
    ctx.arc(bx, by, br * 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = POWERS[kind].color;
    ctx.lineWidth = br * 0.25;
    ctx.beginPath();
    ctx.arc(bx, by, br * 1.2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
    ctx.stroke();
    ctx.fillStyle = POWERS[kind].color;
    ctx.beginPath();
    ctx.arc(bx, by, br * 0.85, 0, Math.PI * 2);
    ctx.fill();
    drawPowerIcon(kind, bx, by, br * 0.85);
  });
  // The burst when you grab one: a ring grows from the car and the icon pops up
  if (pfx) {
    const t = pfx.t / 45, col = POWERS[pfx.kind].color;
    ctx.strokeStyle = `rgba(${rgbOf(col)},${1 - t})`;
    ctx.lineWidth = 6 * (1 - t) + 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, p.w * (0.4 + t * 1.2), p.w * (0.3 + t * 0.7), 0, 0, Math.PI * 2);
    ctx.stroke();
    const ir = p.w * 0.16 * (t < 0.2 ? t / 0.2 * 1.3 : 1.3 - (t - 0.2) * 0.4);
    const iy = cy - p.w * 0.5 - t * p.w * 0.5;
    ctx.globalAlpha = Math.min(1, (1 - t) * 2);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(cx, iy, ir, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.stroke();
    drawPowerIcon(pfx.kind, cx, iy, ir);
    ctx.globalAlpha = 1;
  }
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
// ----- AIRPLANES (Manila, Cebu City and Davao have big airports) -----
let planes = [];
let planeTimer = 60;
function updatePlanes(dt) {
  const loc = mode === "home" ? LOCATIONS[0] : currentLocation();
  if (loc.planes && (planeTimer -= dt) <= 0 && planes.length < 2) {
    const dir = Math.random() < 0.5 ? 1 : -1;          // 1 = flies to the right
    planes.push({ x: dir > 0 ? -140 : W + 140, y: HORIZON * (0.3 + Math.random() * 0.3), dir,
      vx: dir * (1.3 + Math.random() * 0.6), vy: -0.06 - Math.random() * 0.06,   // slowly climbing after take-off
      s: 0.8 + Math.random() * 0.5 });
    planeTimer = 260 + Math.random() * 260;
  }
  for (const pl of planes) { pl.x += pl.vx * dt; pl.y += pl.vy * dt; }
  planes = planes.filter((pl) => pl.x > -200 && pl.x < W + 200);
}
// A passenger plane seen from the side (dir = which way it faces, s = size)
function drawPlane(x, y, s, dir) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir * s, s);
  ctx.rotate(-0.07);                                  // nose a little up
  poly("#94a3b8", [-6, 2, 10, 2, -12, 16, -20, 16]);  // far wing
  ctx.fillStyle = "#f1f5f9";                          // body
  ctx.beginPath();
  ctx.moveTo(-44, -6); ctx.lineTo(36, -6);
  ctx.quadraticCurveTo(50, -4, 51, 0); ctx.quadraticCurveTo(48, 5, 36, 6);
  ctx.lineTo(-40, 6); ctx.quadraticCurveTo(-48, 4, -46, -2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(100,116,139,0.35)";           // shade on the belly
  ctx.fillRect(-42, 3, 80, 3);
  ctx.fillStyle = "#1d4ed8"; ctx.fillRect(-44, 0.5, 86, 1.6);   // blue and red stripes
  ctx.fillStyle = "#dc2626"; ctx.fillRect(-44, 2.3, 86, 0.9);
  ctx.fillStyle = "#1e293b";                          // windows
  for (let wx = -32; wx < 32; wx += 4.5) ctx.fillRect(wx, -3, 2.2, 2);
  poly("#1e293b", [42, -4.5, 48, -2.5, 47, -0.5, 41, -1.5]);   // cockpit
  poly("#1d4ed8", [-44, -6, -30, -6, -41, -25, -49, -25]);     // tail fin
  poly("#facc15", [-45.5, -16, -40, -16, -38, -12, -43.5, -12]);   // yellow sun on the tail
  poly("#94a3b8", [-46, 0, -33, 0, -48, 7]);          // small back wing
  poly("#cbd5e1", [-4, 2, 12, 2, -10, 20, -19, 20]);  // near wing
  ctx.fillStyle = "#64748b";                          // engine
  ctx.beginPath(); ctx.ellipse(-4, 11, 7, 3.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawPlanes() {
  for (const pl of planes) drawPlane(pl.x, pl.y, pl.s, pl.dir);
}
// Blinking lights on the planes (drawn after the night darkness, so they glow)
function drawPlaneLights() {
  const glow = Math.max(0.35, atmo.night);
  for (const pl of planes) {
    const blink = Math.floor((frame + pl.x) / 25) % 3 === 0;
    const lights = [[-19 * pl.dir, 20, pl.dir > 0 ? "255,40,40" : "40,255,90"], [-48 * pl.dir, -24, "255,255,255", blink],
      [-4 * pl.dir, 8, "255,60,60", !blink]];
    for (const [lx, ly, col, on = true] of lights) {
      if (!on) continue;
      const px = pl.x + lx * pl.s, py = pl.y + ly * pl.s;
      const g = ctx.createRadialGradient(px, py, 0, px, py, 9 * pl.s);
      g.addColorStop(0, `rgba(${col},${glow})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(px - 10 * pl.s, py - 10 * pl.s, 20 * pl.s, 20 * pl.s);
    }
  }
}

function drawWorld() {
  // Sky and background layers (far layers move slower = depth)
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, W, HORIZON + 1);
  drawLayer(cloudLayer, bgOffset * 0.3);
  drawPlanes();                                   // airplanes behind the mountains and buildings
  for (const key in backdrops) {                  // background mountains (they fade)
    if (bgWeight[key] < 0.01) continue;
    ctx.globalAlpha = bgWeight[key];
    drawLayer(backdrops[key], bgOffset * 0.6);
  }
  // fewer green hills so Taal Lake and the Manila buildings show
  drawWindmillBlades();                           // Ilocos: the turbines turn
  ctx.globalAlpha = Math.max(0, 1 - bgWeight.taal * 0.85 - bgWeight.manila * 0.95
    - bgWeight.arayat * 0.8 - bgWeight.baguio * 0.9 - bgWeight.ilocos * 0.9
    - NEW_BG.reduce((sum, k) => sum + bgWeight[k] * 0.9, 0));   // Visayas/Mindanao backgrounds hide the green hills
  drawLayer(hillLayer, bgOffset);
  ctx.globalAlpha = 1;
  ctx.fillStyle = fogged(GRASS.g1, 1);
  ctx.fillRect(0, HORIZON, W, H - HORIZON);

  // --- Road: project the segments from near to far ---
  const base = findSegment(position);
  const basePct = (position % SEG_LEN) / SEG_LEN;
  let x = 0;
  let dx = -base.curve * basePct;
  let maxY = H;
  const drawn = [];                       // road pieces we can see
  const projected = [];                   // all pieces in front of the camera (some hidden behind a hill)
  const camY = CAM_H + heightAt(playerZ()); // the camera rides up and down with the road

  for (let n = 0; n < DRAW_DIST; n++) {
    const seg = segments[(base.index + n) % segments.length];
    const looped = seg.index < base.index;           // we wrapped round the loop
    const camZ = position - (looped ? TRACK_LEN : 0);
    const camX = cameraX * ROAD_W;

    project(seg.z1, camX - x, camZ, seg.s1, seg.y1, camY);
    project(seg.z2, camX - x - dx, camZ, seg.s2, seg.y2, camY);
    x += dx;               // add up the curves: this is what bends the road
    dx += seg.curve;

    seg.fog = Math.min(1, Math.pow(n / DRAW_DIST, 1.5) * 1.1);
    seg.dist = odo + n * SEG_LEN;          // total distance of this piece of road
    // clip = the line where the nearer road (a hilltop) covers things on this piece
    seg.clip = maxY;
    if (seg.s1.cz <= CAM_DEPTH) continue;
    projected.push(seg);
    if (seg.s2.y >= maxY) continue;       // hidden behind a hilltop: don't draw the road

    drawn.push(seg);
    maxY = seg.s1.y;
  }
  const projSet = new Set(projected);
  if (drawn.length) vanishX = drawn[drawn.length - 1].s2.x;   // the farthest road piece
  groundTop = drawn.reduce((m, sg) => Math.min(m, sg.s2.y), HORIZON);   // highest ground on screen
  fgBoxes = [];
  // remembers the screen area of something standing up into the sky (for Manila's lights)
  const box = (x0, y0, x1, y1) => { if (y0 < HORIZON) fgBoxes.push({ x0, y0, x1, y1 }); };

  // Road pieces are painted far → near so near pieces cover far ones
  for (let i = drawn.length - 1; i >= 0; i--) drawSegment(drawn[i], drawn[i].fog);
  drawFloods(drawn);
  drawCrossing(drawn);

  // --- Sprites: collect everything, then draw far → near ---
  const things = [];
  const lights = [];

  for (const seg of projected) {
    const loc = locationAt(seg.dist);
    for (const sp of seg.sprites) {
      if (loc.fillers && !sp.keep) continue;   // towns: only a few trees, buildings instead
      const side = Math.sign(sp.offset);
      const insideBuilding = scenery.some((sc) => sc.side === side &&
        seg.dist > sc.at - 2500 && seg.dist < sc.end + 2500);
      if (insideBuilding) continue;
      const sx = seg.s1.x + seg.s1.scale * sp.offset * ROAD_W * W / 2;
      const size = seg.s1.scale * TREE_H * sp.size * W / 2;
      things.push({ depth: seg.s1.cz, fog: seg.fog, clip: seg.clip, draw: () => {
        box(sx - size * 0.45, seg.s1.y - size * 1.05, sx + size * 0.45, seg.s1.y);
        if (loc.palms) drawPalmTree(sx, seg.s1.y, size);
        else if (loc.pines) drawPineTree(sx, seg.s1.y, size);
        else if (loc.jungle) drawJungleTree(sx, seg.s1.y, size);
        else if (sp.type === "tree") drawTree(sx, seg.s1.y, size);
        else drawBush(sx, seg.s1.y, size * 0.5);
      }});
    }
  }

  // Vehicles, coins and power-ups sit between the two ends of their segment
  const placeOnRoad = (obj, drawFn) => {
    const seg = findSegment(obj.z);
    if (!projSet.has(seg)) return;
    const t = (obj.z % SEG_LEN) / SEG_LEN;
    const lerp = (a, b) => a + (b - a) * t;
    const scale = lerp(seg.s1.scale, seg.s2.scale);
    const sx = lerp(seg.s1.x, seg.s2.x) + scale * obj.x * ROAD_W * W / 2;
    const sy = lerp(seg.s1.y, seg.s2.y);
    const k = scale * W / 2;                   // screen pixels per world unit here
    things.push({ depth: lerp(seg.s1.cz, seg.s2.cz), fog: seg.fog, clip: seg.clip, draw: () => drawFn(sx, sy, k, seg.fog) });
  };

  // ENFORCER: for the first half second the vehicles slide off to the side, then they're gone
  const exitP = clearT > 0 ? (ENFORCER_TIME - clearT) / 30 : 0;
  for (const car of (clearT > 0 && exitP >= 1 ? [] : cars)) {
    placeOnRoad(car, (sx, sy, k, fog) => {
      const w = VEHICLES[car.type].w * k;
      if (clearT > 0) {
        sx += (car.exitDir || 1) * exitP * exitP * w * 3.5;   // speeds up as it goes
        ctx.globalAlpha *= 1 - exitP * 0.6;
      }
      box(sx - w * 0.65, sy - VEHICLES[car.type].h * w * 1.1, sx + w * 0.65, sy);
      if (mode === "crash" && car === crashCar) {     // the vehicle you hit spins away too
        const e = 1 - Math.pow(1 - Math.min(1, crashT / 45), 3);
        const hop = crashT < 26 ? Math.sin((crashT / 26) * Math.PI) * w * 0.18 : 0;
        ctx.save();
        ctx.translate(sx + crashSide * e * w * 0.5, sy - w * 0.3 - hop - e * w * 0.15);
        ctx.rotate(crashSide * e * 0.55);
        ctx.translate(-sx, -(sy - w * 0.3));
        drawVehicle(car, sx, sy, k);
        ctx.restore();
        lights.push({ x: sx, y: sy, w, fog });
        return;
      }
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
    placeOnRoad(sc, (sx, sy, k) => (box(sx - LANDMARKS[sc.kind].w * sc.scale * k * 0.6,
      sy - LANDMARKS[sc.kind].w * sc.scale * k * 1.1, sx + LANDMARKS[sc.kind].w * sc.scale * k * 0.6, sy),
      LANDMARKS[sc.kind].draw(landPainter(sx, sy, k * sc.scale, ["pup", "welcome", "caution", "skyway"].includes(sc.kind)), sc)));
  }
  for (const p of pickups) placeOnRoad(p, (sx, sy, k) => drawPowerUp(p.kind, sx, sy, k * CAR_W));

  // The player (always the same distance in front of the camera)
  things.push({ depth: PLAYER_Z, fog: 0, draw: () => {
    const p = playerScreen();
    const moving = mode === "playing" || mode === "home" || mode === "countdown";
    const bounce = moving && !paused && Math.floor(frame / 5) % 2 ? 1.5 : 0;  // engine wobble
    const blinkOff = invulnT > 0 && Math.floor(frame / 4) % 2;               // flicker after the shield breaks
    box(p.x - p.w * 0.7, p.y - p.w * 1.7, p.x + p.w * 0.7, p.y);
    // remember recent positions for the slow-mo afterimages
    if (slowT > 0 && !paused) { ghostXs.unshift(p.x); if (ghostXs.length > 16) ghostXs.pop(); }
    else if (slowT <= 0) ghostXs.length = 0;
    drawPlayerPowerFx(p, true);
    const cm = crashMotion(p);
    if (cm && crashKind === "stop") {                // skid marks behind the wheels
      const len = Math.min(1, crashT / 15) * p.w * 0.9;
      ctx.fillStyle = "rgba(20,20,20,0.55)";
      for (const wx of [-0.4, 0.31]) ctx.fillRect(p.x + wx * p.w, p.y - 2, p.w * 0.09, len);
    }
    if (!blinkOff) {
      ctx.save();                                    // lean the car while changing lanes
      if (cm) {                                      // crash: spin, hop and slide
        ctx.translate(p.x + cm.dx, p.y - p.w * 0.3 + cm.dy);
        ctx.rotate(cm.rot);
        ctx.scale(cm.sx, 1);
        ctx.translate(-p.x, -(p.y - p.w * 0.3));
      } else {
        ctx.translate(p.x, p.y);
        ctx.rotate(tilt);
        ctx.translate(-p.x, -p.y);
      }
      drawPlayerVehicle(ptype(), p.x, p.y - bounce, p.w);
      ctx.restore();
    }
    drawPlayerPowerFx(p, false);
    lights.push({ x: p.x, y: p.y, w: p.w, fog: 0, player: true });
  }});

  things.sort((a, b) => b.depth - a.depth);
  for (const t of things) {
    ctx.globalAlpha = 1 - t.fog * 0.85;   // far things fade into the haze
    if (t.clip !== undefined && t.clip < H - 1) {
      // behind a hilltop: only draw the part above the hill's edge
      ctx.save();
      ctx.beginPath();
      ctx.rect(-100, -100, W + 200, t.clip + 100);
      ctx.clip();
      t.draw();
      ctx.restore();
    } else {
      t.draw();
    }
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
  const { night, sunset, rain, mist } = atmo;

  if (mist > 0.01) {             // Baguio fog: thick near the horizon, thinner close to you
    const m = ctx.createLinearGradient(0, 0, 0, H);
    m.addColorStop(0, `rgba(232,238,242,${0.35 * mist})`);
    m.addColorStop(HORIZON / H, `rgba(236,241,244,${0.6 * mist})`);
    m.addColorStop(0.62, `rgba(236,241,244,${0.18 * mist})`);
    m.addColorStop(1, `rgba(236,241,244,${0.08 * mist})`);
    ctx.fillStyle = m;
    ctx.fillRect(0, 0, W, H);
  }

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
      if (s.y > groundTop - 4) continue;             // no stars on a hill
      const a = night * (0.5 + 0.5 * Math.sin(frame * 0.05 + s.tw)) * (1 - rain * 0.8);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
  }
  drawCityLights(fgBoxes, groundTop);               // Manila's windows glow at night

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
  if (clearT > 0) active.push(["enforcer", clearT / ENFORCER_TIME]);
  // Colored glow around the screen edges right after you grab a power-up
  if (edgeT > 0) {
    const rgb = rgbOf(POWERS[edgeKind].color), a = (edgeT / 40) * 0.45;
    const eg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
    eg.addColorStop(0, `rgba(${rgb},0)`);
    eg.addColorStop(1, `rgba(${rgb},${a})`);
    ctx.fillStyle = eg;
    ctx.fillRect(0, 0, W, H);
  }
  // ENFORCER: a traffic enforcer slides in, blows the whistle and waves the traffic away
  if (enforcerT > 0) {
    const t = 1 - enforcerT / ENFORCER_SHOW;               // 0 → 1
    const slide = t < 0.15 ? 1 - t / 0.15 : t > 0.85 ? (t - 0.85) / 0.15 : 0;
    const ex = 130 - slide * 300, ey = H + 6;
    const wave = Math.sin(t * Math.PI * 6);                 // the arm waves back and forth
    drawEnforcer(ex, ey, 300, wave);
    if (slide < 0.5) {
      // speech bubble: "PRRRT! TABI!"
      const bx = ex + 70, by = ey - 330;
      ctx.fillStyle = "#ffffff";
      roundRect(bx, by, 190, 58, 22);
      ctx.fill();
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 4;
      ctx.stroke();
      poly("#ffffff", [bx + 20, by + 54, bx + 50, by + 54, bx + 6, by + 80]);
      ctx.fillStyle = "#1e293b";
      ctx.font = "900 26px 'Trebuchet MS', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("PRRRT! TABI!", bx + 95, by + 30);
      ctx.strokeStyle = "rgba(255,255,255,0.85)";          // whistle sound lines
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const r = 14 + ((frame * 2 + i * 10) % 30);
        ctx.beginPath();
        ctx.arc(ex + 48, ey - 236, r, -0.7, 0.4);
        ctx.stroke();
      }
    }
  }

  for (const [kind, left] of active) {
    const ending = kind !== "shield" && left < 0.25;    // almost over: the card blinks
    ctx.fillStyle = ending && Math.floor(frame / 6) % 2 ? "rgba(127,29,29,0.85)" : "rgba(15,23,42,0.75)";
    roundRect(18, y, 190, 46, 12);
    ctx.fill();
    ctx.strokeStyle = POWERS[kind].color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = POWERS[kind].color;
    ctx.beginPath();
    ctx.arc(42, y + 23, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";                  // ring that empties as time runs out
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(42, y + 23, 19, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
    ctx.stroke();
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
    const next = inAirport() ? LOCATIONS[0].name : LOCATIONS[(level + 1) % LOCATIONS.length].name;
    const km = Math.max(0, ((inAirport() ? AIRPORT_LEN : (level + 1) * LOCATION_DIST) - odo) / UNITS_PER_KM);
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

  // TAG-INIT badge while the heat is on
  if (heat > 0.5 && (mode === "playing" || mode === "countdown")) {
    const showingCrossing = crossing && relZ(crossing.z, playerZ()) > 0;
    const temp = 38 + Math.round(Math.sin(frame * 0.01) + 1);
    const text = `🔥 TAG-INIT CHALLENGE · ${temp}°C · survive ${currentLocation().name} for +₱100`;
    ctx.font = "900 17px 'Trebuchet MS', sans-serif";
    const tw = ctx.measureText(text).width + 30;
    const by = showingCrossing ? 112 : 66;
    ctx.fillStyle = "rgba(194,65,12,0.9)";
    roundRect(W / 2 - tw / 2, by, tw, 34, 10);
    ctx.fill();
    ctx.fillStyle = "#fff7ed";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, W / 2, by + 18);
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
    if (currentLocation().heat) outlinedText("🔥 TAG-INIT CHALLENGE!", 0, 62, 32, "#fb923c", "#1e293b", 6);
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

  drawCrashScreen();         // crash: cracked screen, red edges, starburst

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

  drawConfetti();

  if (paused) {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, 0, W, H);
    outlinedText("PAUSED", W / 2, H / 2, 60, "#ffffff");
  }
}

function draw() {
  if (mode === "flight") { drawFlight(); return; }       // the plane flight has its own picture
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
  // Camera lean: rotate the whole scene a tiny bit (and zoom a little so no corner shows)
  if (Math.abs(lean) > 0.001) {
    const zoom = 1 + Math.abs(lean) * 1.6;
    ctx.translate(W / 2, H * 0.8);
    ctx.rotate(lean);
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H * 0.8);
  }
  const lights = drawWorld();
  drawParticles();           // dust, spray, sparks and crash pieces
  drawCrashWorld();          // crash: shockwave, fire and comic words
  drawAtmosphere(lights);
  drawPlaneLights();         // airplane lights blink on top of the darkness
  drawSpeedLines();
  ctx.restore();
  applyHeat();               // Calamba's TAG-INIT heat haze (does nothing elsewhere)
  drawOverlays();
}

// ----- 16. Game loop (~60 times per second) -----
// It always runs. What it does depends on which screen we are on.
// SAFETY: if something ever goes wrong in a frame, the game shows the problem in the
// browser console but keeps running (instead of freezing on a half-drawn picture).
function loop(now) {
  try {
    frameStep(now);
  } catch (err) {
    console.error("Kaskasero frame error:", err);
  }
  requestAnimationFrame(loop);
}
// Puts the drawing tools back to normal: drawing on the real screen, no leftover
// transparency, zoom or blend mode from the frame before.
function resetDrawing() {
  ctx = gameCtx;
  g = previewCanvas.getContext("2d");
  noShadow = false;
  svFlip = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}
function frameStep(now) {
  resetDrawing();
  const dt = Math.min((now - lastTime) / (1000 / 60), 3);  // same speed on any PC
  lastTime = now;

  if (mode === "home") update(dt, true);                 // self-driving demo
  else if (mode === "countdown") updateCountdown(dt);    // 3, 2, 1, GO!
  else if (mode === "playing" && !paused) update(dt);    // the real game
  else if (mode === "crash") updateCrash(dt);            // WASAK! replay
  else if (mode === "flight") updateFlight(dt);          // the plane flight to the island
  // (on "over" nothing moves: the crash scene stays frozen)

  if (!paused) updateEffects(dt);
  draw();

  const engineOn = (mode === "playing" && !paused) || mode === "countdown";
  Sound.updateEngine(speed, engineOn, slowT > 0);
  Sound.updateRain(atmo.rain, mode !== "home" && !paused);
  Music.update();
  updateGarage(now);         // the car turning on the garage turntable
  updateHowto(now);          // the little moving pictures on How to Play
}

// ===== HOW TO PLAY: little moving pictures =====
// Each card on the How to Play screen has a small canvas with a looping demo.
// To reuse the game's drawings (cars, coins, power-ups), we point "ctx" at the
// card's canvas for a moment, then point it back at the game.
const DEMO_W = 200, DEMO_H = 120, DEMO_HY = 38;           // card size and horizon line
const OFF = W / 2 - DEMO_W / 2;      // the road painters think the screen is 960 wide: shift by this
const DEMO_LANES = [-0.75, -0.25, 0.25, 0.75];
const heatCopy = document.createElement("canvas");      // for the TAG-INIT wiggle demo
heatCopy.width = DEMO_W;
heatCopy.height = DEMO_H;
// A point on the little road. lane: -1..1 across, t: 0 = horizon, 1 = bottom of the card
function dp(lane, t) {
  const half = 14 + 100 * t;
  return { x: DEMO_W / 2 + lane * half, y: DEMO_HY + (DEMO_H - DEMO_HY) * t, w: half * 0.5 };
}
function demoRoad(c, time, opts = {}) {
  const sky = c.createLinearGradient(0, 0, 0, DEMO_HY);
  sky.addColorStop(0, opts.night ? "#0f172a" : "#7dd3fc");
  sky.addColorStop(1, opts.night ? "#312e81" : "#e0f2fe");
  c.fillStyle = sky;
  c.fillRect(0, 0, DEMO_W, DEMO_HY);
  c.fillStyle = opts.grass || "#4ade80";
  c.fillRect(0, DEMO_HY, DEMO_W, DEMO_H - DEMO_HY);
  const a = dp(-1.1, 0), b = dp(1.1, 0), d = dp(1.1, 1), e = dp(-1.1, 1);
  c.fillStyle = "#475569";
  c.beginPath();
  c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(d.x, d.y); c.lineTo(e.x, e.y);
  c.fill();
  c.fillStyle = "#e2e8f0";                                // dashed lane lines that scroll
  for (const lane of [-0.5, 0, 0.5]) {
    for (let k = 0; k < 6; k++) {
      const t0 = ((k / 6 + time * (opts.slow ? 0.25 : 0.9)) % 1);
      const t1 = Math.min(1, t0 + 0.06);
      const p0 = dp(lane, t0 * t0), p1 = dp(lane, t1 * t1);
      c.fillRect(p0.x - 0.6 - t0, p0.y, 1.2 + t0 * 2, Math.max(1, p1.y - p0.y));
    }
  }
}
function demoText(c, text, x, y, size, color) {
  c.font = `900 ${size}px 'Trebuchet MS', sans-serif`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.lineWidth = size / 4;
  c.lineJoin = "round";                 // smooth outline corners (no spikes)
  c.strokeStyle = "#1e293b";
  c.strokeText(text, x, y);
  c.fillStyle = color;
  c.fillText(text, x, y);
}
function keyChip(c, label, x, y, on) {
  c.fillStyle = on ? "#facc15" : "rgba(15,23,42,0.75)";
  roundRect(x - 12, y - 10, 24, 20, 5);
  c.fill();
  c.strokeStyle = "#ffffff";
  c.lineWidth = 1.5;
  c.stroke();
  c.fillStyle = on ? "#1e293b" : "#ffffff";
  c.font = "900 12px 'Trebuchet MS', sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(label, x, y + 1);
}
// Runs a road painter with the canvas shifted, so x + OFF lands back on the card
function shifted(cb) {
  ctx.save();
  ctx.translate(-OFF, 0);
  cb();
  ctx.restore();
}
const smooth = (t) => t * t * (3 - 2 * t);       // 0..1 with a soft start and stop
const loopT = (time, len) => (time % len) / len;           // 0..1 again and again
// The player's car on the little road (lane can be in between, e.g. 1.5)
function demoPlayer(lane, t = 0.86, kind) {
  const i = Math.floor(lane), f = lane - i;
  const lx = DEMO_LANES[i] + (DEMO_LANES[Math.min(3, i + 1)] - DEMO_LANES[i]) * f;
  const p = dp(lx, t);
  const pt = PLAYER_TYPES.find((x) => x.id === kind) || PLAYER_TYPES[0];
  shifted(() => drawPlayerVehicle(pt, p.x + OFF, p.y, p.w));
  return p;
}
function demoCar(type, lane, t) {
  const p = dp(DEMO_LANES[lane], t);
  const look = type === "jeepney" ? JEEP_COLORS[1] : PLAYER_COLORS[1];
  shifted(() => drawVehicle({ type, look }, p.x + OFF, p.y, p.w / 580));   // same size as the game: a car = the lane's car width
  return p;
}

const DEMOS = {
  // ← → : the car slides between lanes
  steer(c, time) {
    demoRoad(c, time);
    const k = loopT(time, 2.4);
    const goingRight = k < 0.5;
    const move = smooth(Math.min(1, (k % 0.5) / 0.25));
    const lane = goingRight ? 1 + move : 2 - move;
    demoPlayer(lane);
    keyChip(c, "◀", 24, DEMO_H - 16, !goingRight && move < 1);
    keyChip(c, "▶", DEMO_W - 24, DEMO_H - 16, goingRight && move < 1);
    if (move < 1) demoText(c, goingRight ? "→" : "←", DEMO_W / 2, 20, 18, "#ffffff");
  },
  // pass vehicles (+10) and grab coins (+₱)
  pass(c, time) {
    demoRoad(c, time);
    const k = loopT(time, 2.6);
    const ct = 0.3 + k * 0.75;
    if (ct < 0.82) { const p = dp(DEMO_LANES[1], ct); drawCoin(p.x, p.y, p.w * 1.6); }
    const jt = 0.25 + k * 1.0;
    if (jt < 1.25) demoCar("jeepney", 2, jt);
    demoPlayer(1);
    if (k > 0.62) demoText(c, "+10", DEMO_W * 0.72, 46 - (k - 0.62) * 30, 16, "#ffffff");
    if (k > 0.7) demoText(c, "AYOS! +₱5", DEMO_W * 0.3, 40 - (k - 0.7) * 30, 14, "#ffd23f");
  },
  // close call: dodge at the very last second
  close(c, time) {
    demoRoad(c, time);
    const k = loopT(time, 2.6);
    const tt = 0.25 + k * 0.95;
    const dodge = smooth(Math.max(0, Math.min(1, (k - 0.48) / 0.08)));
    if (tt < 1.2) demoCar("boxtruck", 1, tt);
    const p = demoPlayer(1 + dodge);
    if (k > 0.55 && k < 0.75) {                         // sparks between them
      c.strokeStyle = "#facc15";
      c.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a = i * 1.1 + time * 9;
        c.beginPath();
        c.moveTo(p.x - p.w * 0.6, p.y - 12);
        c.lineTo(p.x - p.w * 0.6 - Math.cos(a) * 12, p.y - 12 - Math.abs(Math.sin(a)) * 12);
        c.stroke();
      }
    }
    if (k > 0.55) demoText(c, "GALING!", DEMO_W / 2, 22, 18, "#facc15");
  },
  // power-up cards: the pickup on the road, then what it does
  shield(c, time) {
    demoRoad(c, time);
    const k = loopT(time, 3);
    const hit = k > 0.55;
    const tt = 0.3 + k * 1.0;
    if (!hit) demoCar("car", 1, tt);
    else if (k < 0.8) {                                  // knocked away
      const p = dp(DEMO_LANES[1], 0.85);
      c.save();
      c.translate(0, -(k - 0.55) * 160);
      c.globalAlpha = 1 - (k - 0.55) * 4;
      shifted(() => drawVehicle({ type: "car", look: PLAYER_COLORS[1] }, p.x + OFF, p.y, p.w / 580));
      c.restore();
    }
    const p = demoPlayer(1);
    if (!hit || Math.floor(time * 10) % 2) {
      c.fillStyle = "rgba(56,189,248,0.25)";
      c.strokeStyle = "rgba(125,211,252,0.95)";
      c.lineWidth = 2.5;
      c.beginPath();
      c.ellipse(p.x, p.y - p.w * 0.35, p.w * 0.75, p.w * 0.6, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    if (hit) demoText(c, "LIGTAS!", DEMO_W / 2, 22, 18, "#38bdf8");
  },
  magnet(c, time) {
    demoRoad(c, time);
    const k = loopT(time, 2.2);
    for (const [lane, off] of [[0, 0], [2, 0.3], [3, 0.6]]) {   // coins slide into your lane
      const kk = (k + off) % 1;
      const t = 0.3 + kk * 0.55;
      const pull = smooth(Math.min(1, kk * 1.4));
      const from = DEMO_LANES[lane], to = DEMO_LANES[1];
      const p = dp(from + (to - from) * pull, t);
      if (kk < 0.95) drawCoin(p.x, p.y, p.w * 1.6);
    }
    const p = demoPlayer(1);
    for (let i = 0; i < 3; i++) {
      const t = (time * 1.2 + i / 3) % 1;
      c.strokeStyle = `rgba(239,68,68,${0.8 * (1 - t)})`;
      c.lineWidth = 2;
      const ww = p.w * (0.9 - t * 0.5);
      c.beginPath();
      c.ellipse(p.x, p.y - p.w * 0.2 - t * p.w * 1.5, ww, ww * 0.18, 0, Math.PI, Math.PI * 2);
      c.stroke();
    }
  },
  slowmo(c, time) {
    demoRoad(c, time, { slow: true });
    const k = loopT(time, 6);
    demoCar("jeepney", 2, 0.3 + k * 0.7);
    demoCar("ebike", 0, 0.45 + ((k + 0.5) % 1) * 0.6);
    demoPlayer(1);
    c.fillStyle = "rgba(168,85,247,0.2)";
    c.fillRect(0, 0, DEMO_W, DEMO_H);
    c.fillStyle = "#a855f7";
    c.beginPath();
    c.arc(DEMO_W - 22, 20, 14, 0, Math.PI * 2);
    c.fill();
    drawPowerIcon("slowmo", DEMO_W - 22, 20, 14);
  },
  enforcer(c, time) {
    demoRoad(c, time);
    const k = loopT(time, 3);
    const out = Math.max(0, Math.min(1, (k - 0.3) / 0.25));   // vehicles slide off the road
    const list = [["jeepney", 0, 0.45, -1], ["boxtruck", 2, 0.35, 1], ["car", 3, 0.6, 1], ["bus", 1, 0.3, -1]];
    if (k < 0.9) {
      for (const [type, lane, t, dir] of list) {
        if (out >= 1) continue;
        c.save();
        c.globalAlpha = 1 - out * 0.6;
        c.translate(dir * out * out * 90, 0);
        demoCar(type, lane, t);
        c.restore();
      }
    } else for (const [type, lane, t] of list) demoCar(type, lane, t);   // traffic comes back
    demoPlayer(1, 0.88);
    if (k > 0.15 && k < 0.85) {                          // the enforcer on the right side, waving
      const slide = k < 0.25 ? (0.25 - k) / 0.1 : 0;
      drawEnforcer(DEMO_W - 30 + slide * 60, DEMO_H - 4, 78, Math.sin(time * 12));
      if (k > 0.25) demoText(c, "PRRRT! TABI!", DEMO_W / 2 - 14, 18, 15, "#a3e635");
    }
  },
  // the trip: Calauan → ... → Manila
  places(c, time) {
    const names = LOCATIONS.map((l) => l.name);
    const icons = LOCATIONS.map((l) => l.icon || "📍");
    const skies = LOCATIONS.map((l) => (l.rain ? "#94a3b8" : l.time === "night" ? "#1e1b4b" : l.time === "sunset" ? "#fb923c" : l.heat ? "#fdba74" : "#7dd3fc"));
    const N = names.length;
    const pos = (time * 0.45) % N;
    const i = Math.floor(pos);
    c.fillStyle = skies[i];
    c.fillRect(0, 0, DEMO_W, DEMO_H);
    c.fillStyle = "rgba(15,23,42,0.35)";
    c.fillRect(0, 70, DEMO_W, 50);
    const x0 = 16, x1 = DEMO_W - 16, y = 92;
    c.strokeStyle = "#e2e8f0";
    c.lineWidth = 3;
    c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke();
    for (let n = 0; n < N; n++) {
      const x = x0 + (n / (N - 1)) * (x1 - x0);
      c.fillStyle = n <= i ? "#facc15" : "#64748b";
      c.beginPath(); c.arc(x, y, n === i ? 6 : 4, 0, Math.PI * 2); c.fill();
    }
    const carX = x0 + (Math.min(pos, N - 1) / (N - 1)) * (x1 - x0);
    c.fillStyle = "#e8264f";                             // a tiny car on the line
    roundRect(carX - 8, y - 15, 16, 8, 3); c.fill();
    c.fillStyle = "#111";
    c.fillRect(carX - 6, y - 8, 4, 3); c.fillRect(carX + 2, y - 8, 4, 3);
    c.font = "30px sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(icons[i], DEMO_W / 2, 26);
    demoText(c, names[i].toUpperCase(), DEMO_W / 2, 58, 16, "#facc15");
    c.fillStyle = "#ffffff";
    c.font = "bold 9px 'Trebuchet MS', sans-serif";
    c.fillText("2.5 km each", DEMO_W / 2, 112);
  },
  // dangers that show up later
  hazards(c, time) {
    const k = loopT(time, 10);
    const which = Math.floor(k * 4), kk = (k * 4) % 1;
    demoRoad(c, time, { grass: which === 3 ? "#ca8a04" : undefined });
    if (which === 0) {                                    // PARA!: a jeepney stops suddenly
      const t = Math.min(0.62, 0.3 + kk * 0.9);
      const p = demoCar("jeepney", 1, t);
      if (t >= 0.62) {
        c.fillStyle = "rgba(255,40,40,0.8)";
        for (const s of [-1, 1]) { c.beginPath(); c.arc(p.x + s * p.w * 0.44, p.y - p.w * 0.54, 3, 0, Math.PI * 2); c.fill(); }
      }
      demoPlayer(1 + smooth(Math.max(0, Math.min(1, (kk - 0.6) / 0.15))));
      demoText(c, "PARA!", DEMO_W / 2, 18, 18, "#ef4444");
    } else if (which === 1) {                             // BAHA: a flooded part of the road
      const t = 0.3 + kk * 0.6;
      const p = dp(DEMO_LANES[1] + 0.12, t);
      c.fillStyle = "rgba(96,165,250,0.85)";
      c.beginPath();
      c.ellipse(p.x, p.y, p.w * 1.4 + Math.sin(time * 6) * 1.5, p.w * 0.35, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "rgba(255,255,255,0.5)";
      c.beginPath();
      c.ellipse(p.x - p.w * 0.3, p.y - p.w * 0.06, p.w * 0.5, p.w * 0.08, 0, 0, Math.PI * 2);
      c.fill();
      demoPlayer(2);
      demoText(c, "BAHA! (slows you)", DEMO_W / 2, 18, 15, "#60a5fa");
    } else if (which === 2) {                             // TAWIRAN: people crossing
      const t = 0.42 + kk * 0.25;
      const z = dp(0, t);
      c.fillStyle = "#f8fafc";
      for (let s = -5; s <= 5; s++) {
        const a = dp(s / 5.5, t);
        c.fillRect(a.x - z.w * 0.18, a.y - 2, z.w * 0.3, 5);
      }
      for (const [start, dir, shirt] of [[-0.9, 1, "#f472b6"], [0.7, -1, "#38bdf8"]]) {
        const lx = start + dir * ((time * 0.35) % 1.6);
        const p = dp(lx, t);
        const sw = Math.sin(time * 10) * 2;
        c.fillStyle = "#1e293b";
        c.fillRect(p.x - 2 + sw, p.y - 7, 2, 7); c.fillRect(p.x + 1 - sw, p.y - 7, 2, 7);
        c.fillStyle = shirt;
        c.fillRect(p.x - 3, p.y - 15, 7, 9);
        c.fillStyle = "#8d5a3b";
        c.beginPath(); c.arc(p.x + 0.5, p.y - 18, 3, 0, Math.PI * 2); c.fill();
      }
      demoPlayer(3);
      demoText(c, "TAWIRAN! Iwasan!", DEMO_W / 2, 18, 15, "#facc15");
    } else {                                              // TAG-INIT: heat makes the road wiggle
      demoCar("bus", 2, 0.5);
      demoPlayer(1);
      heatCopy.getContext("2d").clearRect(0, 0, DEMO_W, DEMO_H);
      heatCopy.getContext("2d").drawImage(c.canvas, 0, 0);   // copy the picture first
      for (let y = 0; y < DEMO_H; y += 3) {                 // then redraw it in thin wavy strips
        const sh = Math.sin(y * 0.25 + time * 8) * 2.5;
        c.drawImage(heatCopy, 0, y, DEMO_W, 3, sh, y, DEMO_W, 3);
      }
      c.fillStyle = "rgba(251,146,60,0.25)";
      c.fillRect(0, 0, DEMO_W, DEMO_H);
      c.fillStyle = "#fde047";
      c.beginPath(); c.arc(DEMO_W - 22, 16, 9, 0, Math.PI * 2); c.fill();
      demoText(c, "🔥 TAG-INIT!", DEMO_W / 2, 18, 15, "#fb923c");
    }
  },
  // the secret vehicle
  hari(c, time) {
    const bg = c.createRadialGradient(DEMO_W / 2, 70, 5, DEMO_W / 2, 70, 110);
    bg.addColorStop(0, "#713f12");
    bg.addColorStop(1, "#0f0a05");
    c.fillStyle = bg;
    c.fillRect(0, 0, DEMO_W, DEMO_H);
    for (let i = 0; i < 10; i++) {                       // sparkles
      const a = i * 2.4 + time;
      const x = DEMO_W / 2 + Math.cos(a) * (40 + i * 5), y = 60 + Math.sin(a * 1.3) * 35;
      c.fillStyle = `rgba(250,204,21,${0.4 + 0.4 * Math.sin(time * 4 + i)})`;
      c.fillRect(x, y, 2, 2);
    }
    shifted(() => drawHari(DEMO_W / 2 + OFF, 114, 52 + Math.sin(time * 2) * 2));
    demoText(c, "👑 HARI NG DAAN", DEMO_W / 2, 14, 13, "#facc15");
  },
};

const demoCanvases = [...document.querySelectorAll("canvas[data-demo]")];
let demoStart = 0;
function updateHowto(now) {
  if (document.getElementById("howto").classList.contains("hidden")) return;
  if (!demoStart) demoStart = now;
  const time = (now - demoStart) / 1000;
  try {
    for (const cv of demoCanvases) {
      const fn = DEMOS[cv.dataset.demo];
      if (!fn) continue;
      ctx = cv.getContext("2d");
      ctx.save();
      ctx.clearRect(0, 0, DEMO_W, DEMO_H);
      try { fn(ctx, time); } finally {
        ctx.restore();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
    }
  } finally {
    ctx = gameCtx;                               // always give the real screen back
  }
}

// ----- 17. Switching screens -----
// Shows one screen (or none) and hides the others
function showScreen(screen) {
  for (const el of [homeScreen, howtoScreen, overScreen, mapsScreen, wheelScreen, questScreen]) el.classList.add("hidden");
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

// ----- ITEMS: shields and revives you own (won on the wheel or from quests) -----
function loadItems() {
  try { return { shield: 0, revive: 0, ...JSON.parse(localStorage.getItem("highwayDashItems")) }; }
  catch { return { shield: 0, revive: 0 }; }
}
let items = loadItems();
function saveItems() {
  try { localStorage.setItem("highwayDashItems", JSON.stringify(items)); } catch { /* ignore */ }
  showItems();
}
function showItems() {
  document.getElementById("item-shield").textContent = items.shield;
  document.getElementById("item-revive").textContent = items.revive;
}
// Gives a reward: { kind: "shield" | "revive" | "peso", n }
function giveReward(r) {
  if (r.kind === "peso") { wallet += r.n; saveWallet(wallet); }
  else { items[r.kind] += r.n; saveItems(); }
  document.getElementById("wallet").textContent = wallet;
}
const rewardText = (r) => (r.kind === "peso" ? `₱${r.n}` : `${r.kind === "shield" ? "🛡 Shield" : "❤️ Revive"}${r.n > 1 ? " x" + r.n : ""}`);

// REVIVE: after a crash, use a Revive to keep driving from the same spot
let kitaBanked = 0;                     // pesos from this run already added to your Pera
document.getElementById("revive-btn").addEventListener("click", revive);
function revive() {
  if (mode !== "over" || items.revive <= 0) return;
  items.revive--;
  saveItems();
  transition(() => {
    mode = "playing";
    showScreen(null);
    crashT = 0; crashZoom = 0; shake = 0; flashT = 0;
    crashWords = []; crashCracks = [];
    crossing = null;                              // (a crossing you stopped at is gone)
    for (const car of cars) {                     // clear the road just ahead so you can get going
      const d = relZ(car.z, playerZ());
      if (d > -CAR_LEN && d < 40 * SEG_LEN) placeCar(car, farAhead());
    }
    crashCar = null;
    invulnT = 150;                                // 2.5 seconds where you can't crash
    popup("BUHAY PA! ❤️", "#f43f5e");
    Sound.powerup();
  });
}

// ----- SPIN THE WHEEL (₱50 per spin) -----
// weight = the chance to win it, in percent (they add up to 100)
const WHEEL = [
  { reward: { kind: "peso", n: 25 },    color: "#f97316", weight: 30 },   // 30%
  { reward: { kind: "shield", n: 1 },   color: "#0ea5e9", weight: 20 },   // 20%
  { reward: { kind: "peso", n: 75 },    color: "#22c55e", weight: 15 },   // 15%
  { reward: { kind: "revive", n: 1 },   color: "#e11d48", weight: 20 },   // 20%
  { reward: { kind: "peso", n: 100 },   color: "#a855f7", weight: 10 },   // 10%
  { reward: { kind: "peso", n: 500 },   color: "#eab308", weight: 5 },    // 5%
];
const SPIN_COST = 50;
const wheelScreen = document.getElementById("wheel");
const wheelCanvas = document.getElementById("wheel-canvas");
let wheelAngle = 0, spinning = false;
function drawWheel() {
  const c = wheelCanvas.getContext("2d"), r = 140, cx = 160, cy = 165, n = WHEEL.length, slice = (Math.PI * 2) / n;
  c.clearRect(0, 0, 320, 320);
  c.fillStyle = "#7c2d12";                           // wooden rim with little lights
  c.beginPath(); c.arc(cx, cy, r + 12, 0, Math.PI * 2); c.fill();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    c.fillStyle = (i + Math.floor(performance.now() / 200)) % 2 ? "#fde047" : "#fff7ed";
    c.beginPath(); c.arc(cx + Math.cos(a) * (r + 6), cy + Math.sin(a) * (r + 6), 3.5, 0, Math.PI * 2); c.fill();
  }
  WHEEL.forEach((w, i) => {                           // the colored slices with their prizes
    const a0 = wheelAngle + i * slice - Math.PI / 2;  // slice 0 starts at the top
    c.fillStyle = w.color;
    c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, r, a0, a0 + slice); c.closePath(); c.fill();
    c.strokeStyle = "#ffffff"; c.lineWidth = 3; c.stroke();
    c.save();
    c.translate(cx, cy);
    c.rotate(a0 + slice / 2);
    c.textAlign = "right";
    c.textBaseline = "middle";
    c.font = "900 19px 'Trebuchet MS', sans-serif";
    c.lineWidth = 4; c.strokeStyle = "rgba(0,0,0,0.45)";
    const label = rewardText(w.reward);
    c.strokeText(label, r - 12, 0);
    c.fillStyle = "#ffffff";
    c.fillText(label, r - 12, 0);
    c.restore();
  });
  c.fillStyle = "#facc15";                            // middle button
  c.beginPath(); c.arc(cx, cy, 30, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#7c2d12";
  c.font = "900 13px 'Trebuchet MS', sans-serif";
  c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText("SUWERTE", cx, cy);
  c.fillStyle = "#ffffff";                            // the pointer at the top
  c.beginPath(); c.moveTo(cx - 14, 4); c.lineTo(cx + 14, 4); c.lineTo(cx, 34); c.closePath(); c.fill();
  c.strokeStyle = "#7c2d12"; c.lineWidth = 3; c.stroke();
}
function showWheelInfo() {
  document.getElementById("wheel-wallet").textContent = wallet;
  document.getElementById("spin-btn").disabled = spinning || wallet < SPIN_COST;
}
function openWheel() {
  Sound.init();
  showWheelInfo();
  drawWheel();
  transition(() => showScreen(wheelScreen));
}
function spinWheel() {
  if (spinning || wallet < SPIN_COST) return;
  wallet -= SPIN_COST;
  saveWallet(wallet);
  spinning = true;
  showWheelInfo();
  document.getElementById("spin-result").textContent = "Umiikot... 🎡";
  // pick the prize first (using the weights), then turn the wheel so it stops there
  let roll = Math.random() * WHEEL.reduce((sum, w) => sum + w.weight, 0), pick = 0;
  while (roll >= WHEEL[pick].weight) { roll -= WHEEL[pick].weight; pick++; }
  const slice = (Math.PI * 2) / WHEEL.length;
  const stopAt = -(pick * slice + slice / 2) + (Math.random() - 0.5) * slice * 0.6;   // that slice under the pointer
  const start = wheelAngle;
  const end = start + Math.PI * 2 * 6 + ((stopAt - start) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  const t0 = performance.now(), dur = 4200;
  let lastSlice = Math.floor(start / slice);
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    wheelAngle = start + (end - start) * (1 - Math.pow(1 - t, 3));   // fast, then slows down
    const s = Math.floor(wheelAngle / slice);
    if (s !== lastSlice) { lastSlice = s; Sound.tone(900, 0.03, "square", 0.05); }   // tick!
    drawWheel();
    if (t < 1) { requestAnimationFrame(step); return; }
    spinning = false;
    const prize = WHEEL[pick].reward;
    giveReward(prize);
    questAdd("spin");
    document.getElementById("spin-result").textContent = `Nanalo ka: ${rewardText(prize)}! 🎉`;
    if (prize.kind === "peso" && prize.n >= 500) burstConfetti();
    Sound.powerup();
    showWheelInfo();
  };
  requestAnimationFrame(step);
}
document.getElementById("spin-open").addEventListener("click", openWheel);
document.getElementById("spin-btn").addEventListener("click", spinWheel);
document.getElementById("wheel-back").addEventListener("click", () => { if (!spinning) transition(goHomeScreen); });
// keep the wheel's little lights blinking while it's open
setInterval(() => { if (!wheelScreen.classList.contains("hidden") && !spinning) drawWheel(); }, 200);

// ----- DAILY QUESTS -----
// Every day you get 3 quests (the same 3 all day). Progress counts across all your runs.
// {n} in the text is replaced by the goal.
const QUEST_POOL = [
  { id: "pass",     text: "Overtake {n} vehicles",             goal: 40 },
  { id: "close",    text: "Get {n} close calls (GALING!)",     goal: 8 },
  { id: "coins",    text: "Collect {n} ₱ coins",               goal: 25 },
  { id: "km",       text: "Drive {n} km in total",             goal: 6 },
  { id: "place",    text: "Reach the 3rd place in one run",    goal: 1 },
  { id: "bump",     text: "Hit {n} vehicles using a Shield",   goal: 3 },
  { id: "enforcer", text: "Call the Enforcer {n} times",       goal: 2 },
  { id: "power",    text: "Grab {n} power-ups",                goal: 8 },
  { id: "spin",     text: "Spin the wheel once",               goal: 1 },
  { id: "heat",     text: "Survive a TAG-INIT challenge",      goal: 1 },
];
const QUEST_REWARDS = [{ kind: "peso", n: 150 }, { kind: "shield", n: 1 }, { kind: "revive", n: 1 },
  { kind: "peso", n: 250 }, { kind: "shield", n: 2 }];
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
let quests = null;
function loadQuests() {
  try { const q = JSON.parse(localStorage.getItem("highwayDashQuests")); if (q && q.day === todayKey()) return q; }
  catch { /* make new ones */ }
  // a new day: pick 3 quests. The day's date is the "seed", so everyone gets the same 3 today.
  let seedQ = 0;
  for (const ch of todayKey()) seedQ = (seedQ * 31 + ch.charCodeAt(0)) % 2147483647;
  const rnd = () => (seedQ = (seedQ * 16807) % 2147483647) / 2147483647;
  const pool = [...QUEST_POOL], list = [];
  for (let i = 0; i < 3; i++) {
    const q = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    // rewards: one easy (pesos or shield), one medium, and the last one always gives a Revive
    const reward = i === 2 ? { kind: "revive", n: 1 } : QUEST_REWARDS[Math.floor(rnd() * QUEST_REWARDS.length)];
    list.push({ id: q.id, goal: q.goal, prog: 0, claimed: false, reward });
  }
  return { day: todayKey(), list };
}
function saveQuests() {
  try { localStorage.setItem("highwayDashQuests", JSON.stringify(quests)); } catch { /* ignore */ }
  showQuestBadge();
}
function ensureQuests() {
  if (!quests || quests.day !== todayKey()) { quests = loadQuests(); saveQuests(); }
}
// Adds progress to a quest (called from the game: passing cars, close calls, coins, ...)
function questAdd(id, n = 1) {
  ensureQuests();
  let changed = false;
  for (const q of quests.list) {
    if (q.id !== id || q.prog >= q.goal) continue;
    q.prog = Math.min(q.goal, q.prog + n);
    changed = true;
    if (q.prog >= q.goal && (mode === "playing" || mode === "crash")) {
      popup("📋 QUEST DONE!", "#4ade80");
      Sound.levelUp();
    }
  }
  if (changed) saveQuests();
}
function showQuestBadge() {
  const ready = quests ? quests.list.filter((q) => q.prog >= q.goal && !q.claimed).length : 0;
  const b = document.getElementById("quest-badge");
  b.textContent = ready;
  b.classList.toggle("hidden", ready === 0);
}
const questScreen = document.getElementById("quests");
function renderQuests() {
  ensureQuests();
  const box = document.getElementById("quest-list");
  box.innerHTML = "";
  for (const q of quests.list) {
    const def = QUEST_POOL.find((d) => d.id === q.id);
    const done = q.prog >= q.goal;
    const shown = q.id === "km" ? `${q.prog.toFixed(1)} / ${q.goal}` : `${Math.floor(q.prog)} / ${q.goal}`;
    const el = document.createElement("div");
    el.className = "quest" + (done ? " done" : "");
    el.innerHTML = `
      <div class="quest-text">${def.text.replace("{n}", q.goal)}</div>
      <button class="quest-btn${done && !q.claimed ? " claim" : ""}" ${done && !q.claimed ? "" : "disabled"}>
        ${q.claimed ? "✓ Nakuha" : done ? "Kunin!" : shown}</button>
      <div class="quest-bar"><i style="width:${(100 * q.prog) / q.goal}%"></i></div>
      <div class="quest-reward">Reward: ${rewardText(q.reward)}</div>`;
    el.querySelector("button").addEventListener("click", () => {
      if (!done || q.claimed) return;
      q.claimed = true;
      giveReward(q.reward);
      saveQuests();
      Sound.powerup();
      renderQuests();
    });
    box.appendChild(el);
  }
}
function openQuests() {
  Sound.init();
  renderQuests();
  transition(() => showScreen(questScreen));
}
document.getElementById("quest-open").addEventListener("click", openQuests);
document.getElementById("quest-back").addEventListener("click", () => transition(goHomeScreen));
// back to the home screen (from the wheel or quests)
function goHomeScreen() {
  showScreen(homeScreen);
  showGarage();
}
let kmForQuest = 0;                    // distance not yet added to the "km" quest
ensureQuests();
showItems();


// ----- Choosing a map -----
// Each card shows the map's name, its theme, a little picture and the whole route,
// so you know which places you'll drive through (Calauan → Bay → Los Baños → ...).
const mapGrid = document.getElementById("map-grid");
for (const [key, m] of Object.entries(MAPS)) {
  const card = document.createElement("button");
  card.className = "map-card";
  card.dataset.map = key;
  card.style.setProperty("--mc", m.color);
  const km = m.places.length * 2.5;
  card.innerHTML = `
    <canvas width="240" height="84"></canvas>
    <div class="map-title">${m.icon} ${m.name}</div>
    <div class="map-theme">${m.theme}</div>
    <div class="map-route">${m.places.map((pl) => `<span>${pl.icon || "📍"} ${pl.name}</span>`).join("<b>→</b>")}</div>
    <div class="map-count">${m.places.length} places · ${km} km</div>
    <span class="map-go">Tara na! ▶</span>`;
  card.addEventListener("click", () => chooseMap(key));
  card.addEventListener("pointerenter", () => pickMap(key));
  mapGrid.appendChild(card);
  drawMapPreview(card.querySelector("canvas"), m.places[0]);
}
// A small picture of the map's first place: sky, its background, grass and the road
function drawMapPreview(cv, place) {
  const c = cv.getContext("2d"), w = cv.width, h = cv.height, hy = h * 0.62;
  const sky = c.createLinearGradient(0, 0, 0, hy);
  sky.addColorStop(0, place.time === "sunset" ? "#fb923c" : place.time === "night" ? "#0f172a" : "#7dd3fc");
  sky.addColorStop(1, place.time === "sunset" ? "#fde68a" : place.time === "night" ? "#312e81" : "#e0f2fe");
  c.fillStyle = sky;
  c.fillRect(0, 0, w, hy);
  const bg = backdrops[place.bg] || backdrops.generic;
  c.drawImage(bg, 0, 0, W, bg.height, 0, hy - (bg.height * w) / W, w, (bg.height * w) / W);
  const [g1] = place.grass || [COL.grass1];
  c.fillStyle = `rgb(${g1.map(Math.round).join(",")})`;
  c.fillRect(0, hy, w, h - hy);
  c.fillStyle = "#475569";                       // the road going into the distance
  c.beginPath(); c.moveTo(w / 2 - 6, hy); c.lineTo(w / 2 + 6, hy); c.lineTo(w * 0.8, h); c.lineTo(w * 0.2, h); c.fill();
  c.fillStyle = "#f8fafc";
  for (let i = 0; i < 4; i++) c.fillRect(w / 2 - 1, hy + 4 + i * 7, 2, 4);
}
// Highlight a map (mouse over or arrow keys)
function pickMap(key) {
  mapChoice = key;
  for (const card of mapGrid.children) card.classList.toggle("selected", card.dataset.map === key);
}
function openMaps() {
  if (isLocked(PLAYER_TYPES[typeChoice])) return;   // can't drive a locked vehicle
  Sound.init();
  pickMap(loadMapChoice());
  transition(() => showScreen(mapsScreen));
}
// Start driving on this map
function chooseMap(key) {
  pickMap(key);
  saveMapChoice(key);
  LOCATIONS = MAPS[key].places;
  transition(startFlight);                       // first a short flight to the island, then drive
}

// ----- THE FLIGHT: a plane flies over the sea and islands to the map you picked -----
const FLIGHT_TIME = 210;                         // 3.5 seconds (tap or press a key to skip)
let flightT = 0;
let flightIslands = [];
function startFlight() {
  if (isLocked(PLAYER_TYPES[typeChoice])) return;
  Sound.init();
  Sound.jet();
  resetGame();                                   // gets the road ready (we fly over it first)
  mode = "flight";
  flightT = 0;
  showScreen(null);
  // islands below us: Luzon = big mountains, Visayas = lots of small islands, Mindanao = big green with a volcano
  const kind = mapChoice;
  flightIslands = [];
  for (let i = 0; i < (kind === "visayas" ? 9 : 4); i++) {
    const big = kind !== "visayas";
    flightIslands.push({ x: W * 0.2 + i * (big ? 420 : 210) + Math.random() * 80, y: H * (0.68 + Math.random() * 0.2),
      r: big ? 150 + Math.random() * 80 : 50 + Math.random() * 50, peak: kind === "mindanao" && i % 2 === 0, seed: Math.random() * 6 });
  }
}
function updateFlight(dt) {
  flightT += dt;
  if (flightT >= FLIGHT_TIME) startGame();
}
function skipFlight() {
  if (mode === "flight") flightT = Math.max(flightT, FLIGHT_TIME - 20);
}
function drawFlight() {
  const m = MAPS[mapChoice], t = flightT / FLIGHT_TIME, first = LOCATIONS[0];
  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.55);
  sky.addColorStop(0, "#38bdf8");
  sky.addColorStop(1, "#e0f2fe");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H * 0.55);
  ctx.fillStyle = "rgba(254,240,138,0.9)";                // sun
  ctx.beginPath(); ctx.arc(W * 0.82, H * 0.14, 34, 0, Math.PI * 2); ctx.fill();
  // the sea far below, with sparkles
  const sea = ctx.createLinearGradient(0, H * 0.55, 0, H);
  sea.addColorStop(0, "#7dd3fc");
  sea.addColorStop(1, "#0369a1");
  ctx.fillStyle = sea;
  ctx.fillRect(0, H * 0.55, W, H * 0.45);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  for (let i = 0; i < 40; i++) {
    const sx = ((i * 137 - flightT * 3) % (W + 40) + W + 40) % (W + 40) - 20, sy = H * 0.58 + ((i * 53) % 220);
    ctx.fillRect(sx, sy, 12 + (i % 3) * 6, 1.5);
  }
  // islands slide past underneath
  for (const isl of flightIslands) {
    const ix = isl.x - flightT * 4.5, iy = isl.y, r = isl.r;
    if (ix < -r * 2 || ix > W + r * 2) continue;
    ctx.fillStyle = "#fde68a";                            // sandy beach around it
    ctx.beginPath(); ctx.ellipse(ix, iy, r * 1.08, r * 0.36, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#4d9a54";
    ctx.beginPath(); ctx.ellipse(ix, iy, r, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#3b7f45";
    for (let k = 0; k < 6; k++) {                         // forest bumps
      ctx.beginPath(); ctx.ellipse(ix - r * 0.6 + k * r * 0.24, iy - r * 0.04 + Math.sin(k + isl.seed) * r * 0.06, r * 0.16, r * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (isl.peak || mapChoice === "luzon") {              // a mountain (or volcano) in the middle
      poly("#5b8f5f", [ix - r * 0.35, iy, ix, iy - r * 0.42, ix + r * 0.35, iy]);
      poly("#e5e7eb", [ix - r * 0.08, iy - r * 0.32, ix, iy - r * 0.42, ix + r * 0.08, iy - r * 0.32]);
    }
  }
  // clouds behind the plane
  const cloud = (cx, cy, sc, a) => {
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    for (const [dx, dy, rr] of [[0, 0, 40], [38, -12, 34], [70, 2, 30], [-34, 6, 28]]) {
      ctx.beginPath(); ctx.arc(cx + dx * sc, cy + dy * sc, rr * sc, 0, Math.PI * 2); ctx.fill();
    }
  };
  for (let i = 0; i < 5; i++) cloud(((i * 260 - flightT * 2) % (W + 300) + W + 300) % (W + 300) - 150, 70 + (i % 3) * 50, 0.8, 0.85);
  // the plane: flies in from the left, then cruises in the middle and bobs gently
  const px = -200 + Math.min(1, t / 0.35) * (W * 0.5 + 200) + Math.max(0, t - 0.75) * 900;
  const py = H * 0.4 + Math.sin(flightT * 0.06) * 8;
  ctx.strokeStyle = "rgba(255,255,255,0.75)";             // white trail behind
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(px - 170, py - 2); ctx.lineTo(px - 600, py + 6); ctx.stroke();
  drawPlane(px, py, 3.4, 1);
  // clouds in front (fast)
  for (let i = 0; i < 3; i++) cloud(((i * 430 - flightT * 9) % (W + 500) + W + 500) % (W + 500) - 250, 340 + i * 40, 1.6, 0.75);
  // the words
  const pop = Math.min(1, flightT / 25);
  ctx.save();
  ctx.translate(W / 2, 70);
  ctx.scale(pop, pop);
  outlinedText(`✈ Lipad papuntang ${m.name}!`, 0, 0, 46, "#ffffff", "#1e293b", 8);
  ctx.restore();
  outlinedText(`Unang hinto: ${first.icon || "📍"} ${first.name}`, W / 2, 122, 26, "#facc15", "#1e293b", 6);
  ctx.font = "bold 15px 'Trebuchet MS', sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.textAlign = "center";
  ctx.fillText("Tap to skip", W / 2, H - 14);
  // fade to white at the end, then the road appears
  if (t > 0.85) {
    ctx.fillStyle = `rgba(255,255,255,${(t - 0.85) / 0.15})`;
    ctx.fillRect(0, 0, W, H);
  }
}
document.getElementById("maps-back").addEventListener("click", () => transition(() => showScreen(homeScreen)));

function startGame() {
  if (isLocked(PLAYER_TYPES[typeChoice])) return;   // can't drive a locked vehicle
  if (!ownedColors.includes(carChoice)) {            // only trying a color on? drive with your own
    carChoice = ownedChoice;
    showCarChoice();
  }
  Sound.init();          // browsers only allow sound after a click or key press
  resetGame(true);       // every run starts at the airport
  kitaBanked = 0;
  mode = "countdown";
  if (!shield && items.shield > 0) {                  // you own a Shield item: start with a shield
    items.shield--;
    saveItems();
    shield = true;
    popup(`🛡 SHIELD! (${items.shield} left)`, POWERS.shield.color);
  }
  showScreen(null);
}

function gameOver() {
  mode = "over";
  if (score > best) {
    best = score;
    saveBest(best);
    bestEl.textContent = best;
    overTitle.textContent = "BAGONG RECORD!";
    burstConfetti();
  } else {
    overTitle.textContent = Math.random() < 0.5 ? "SAYANG!" : "HALA!";
  }
  document.getElementById("over-kita").textContent = kita;
  wallet += kita - kitaBanked;                        // save this run's pesos (only the new ones after a revive)
  kitaBanked = kita;
  saveWallet(wallet);
  const rb = document.getElementById("revive-btn");   // have a Revive? offer it
  rb.classList.toggle("hidden", items.revive <= 0);
  rb.textContent = `❤️ Revive (x${items.revive})`;
  document.getElementById("over-loc").textContent = currentLocation().name;
  finalScoreEl.textContent = score;
  overBestEl.textContent = best;
  showScreen(overScreen);
}

// ----- 17b. SCREEN WIPE and INTRO -----
// Jeepney-stripe wipe: stripes slide in and cover the screen, the screen
// changes behind them, then they slide away.
const wipe = document.getElementById("wipe");
function transition(change) {
  if (wipe.classList.contains("active")) {       // already wiping: just change
    change();
    return;
  }
  wipe.classList.remove("out");
  wipe.classList.add("active", "in");
  setTimeout(() => {
    change();                                    // switch screens while covered
    wipe.classList.remove("in");
    wipe.classList.add("out");
    setTimeout(() => wipe.classList.remove("active", "out"), 400);
  }, 330);
}

// Intro: the logo, then the first tap/key plays a jeepney horn and opens the game.
// (Browsers only allow sound after the player taps or presses a key.)
const intro = document.getElementById("intro");
function closeIntro(e) {
  if (!intro || !intro.isConnected || intro.classList.contains("go")) return;   // already gone
  if (e) {
    e.preventDefault();
    e.stopImmediatePropagation();                // this key press shouldn't also start a game
  }
  Sound.init();
  Sound.introHorn();
  intro.classList.add("go");                     // logo zooms away, stripes wipe
  window.removeEventListener("keydown", closeIntro, true);
  setTimeout(() => intro.remove(), 900);
}
window.addEventListener("keydown", closeIntro, true);
intro.addEventListener("pointerdown", closeIntro);

// ----- Vehicles driving on the intro road -----
// We reuse the side pictures from the garage (buildFaces), in different colors.
const introCanvas = document.getElementById("intro-cars");
const introSprites = (() => {
  const list = [], keepColor = carChoice;
  // [vehicle number, color number]: sports cars, electric, muscle, jeepney, Hari ng Daan
  for (const [t, c] of [[0, 0], [0, 5], [1, 1], [2, 6], [3, 0], [4, 0], [0, 4], [2, 8], [3, 0], [1, 2]]) {
    carChoice = c;
    facesKey = "";
    const f = buildFaces(PLAYER_TYPES[t]);
    const copy = (src) => { const cv = document.createElement("canvas"); cv.width = FACE_W; cv.height = FACE_H; cv.getContext("2d").drawImage(src, 0, 0); return cv; };
    list.push({ right: copy(f.side), left: copy(f.sideL), x0: f.sx0, x1: f.sx1, top: GROUND - f.h });
  }
  carChoice = keepColor;
  facesKey = "";                                 // the garage makes its own pictures again
  return list;
})();
let introCars = [], introLast = 0, introSpawn = 0;
function introLoop(now) {
  if (!intro.isConnected) return;                // the intro is gone: stop
  try { introFrame(now); } catch (err) { console.error("Intro error:", err); }
  requestAnimationFrame(introLoop);
}
function introFrame(now) {
  const dpr = window.devicePixelRatio || 1;
  const cw = introCanvas.clientWidth, ch = introCanvas.clientHeight;
  if (introCanvas.width !== Math.round(cw * dpr)) { introCanvas.width = Math.round(cw * dpr); introCanvas.height = Math.round(ch * dpr); }
  const c = introCanvas.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, cw, ch);
  const dt = Math.min(3, (now - (introLast || now)) / (1000 / 60));
  introLast = now;
  const roadTop = ch * (1 - 28 / 42);            // where the road starts in this canvas
  const lanes = [roadTop + (ch - roadTop) * 0.42, roadTop + (ch - roadTop) * 0.9];   // far lane, near lane
  if ((introSpawn -= dt) <= 0) {                 // a new vehicle every so often
    const lane = Math.random() < 0.5 ? 0 : 1;
    const dir = lane === 1 ? 1 : -1;             // near lane goes right, far lane comes the other way
    const sp = introSprites[Math.floor(Math.random() * introSprites.length)];
    const scale = (lane === 1 ? 0.9 : 0.62) * Math.min(1.4, ch / 260);
    introCars.push({ sp, lane, dir, scale, x: dir > 0 ? -320 * scale : cw + 20, vx: dir * (3 + Math.random() * 3) });
    introSpawn = 30 + Math.random() * 50;
  }
  introCars.sort((a, b) => a.lane - b.lane);     // far lane first
  for (const car of introCars) {
    car.x += car.vx * dt;
    const img = car.dir > 0 ? car.sp.right : car.sp.left;
    const ix0 = car.dir > 0 ? car.sp.x0 : FACE_W - car.sp.x1, iw = car.sp.x1 - car.sp.x0;
    const w = iw * car.scale, h = GROUND * car.scale, y = lanes[car.lane];
    const bounce = Math.floor(now / 90 + car.x) % 2;   // a tiny engine bounce
    c.fillStyle = "rgba(0,0,0,0.35)";
    c.beginPath(); c.ellipse(car.x + w / 2, y, w * 0.5, 5 * car.scale, 0, 0, Math.PI * 2); c.fill();
    c.drawImage(img, ix0, 0, iw, GROUND, car.x, y - h - bounce, w, h);
  }
  introCars = introCars.filter((car) => car.x > -400 && car.x < cw + 400);
}
requestAnimationFrame(introLoop);

// Start on the home screen
showGarage();
resetGame();
mode = "home";
showScreen(homeScreen);
lastTime = performance.now();
requestAnimationFrame(loop);