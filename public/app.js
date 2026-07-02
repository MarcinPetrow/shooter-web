const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const sceneCanvas = document.createElement("canvas");
sceneCanvas.width = canvas.width;
sceneCanvas.height = canvas.height;
const sceneCtx = sceneCanvas.getContext("2d");

const ui = {
  hp: document.getElementById("hpValue"),
  weapon: document.getElementById("weaponValue"),
  ammo: document.getElementById("ammoValue"),
  grenade: document.getElementById("grenadeValue"),
  kills: document.getElementById("killsValue"),
  status: document.getElementById("statusText"),
  botCountInput: document.getElementById("botCountInput"),
  botCountValue: document.getElementById("botCountValue"),
};

const WORLD_WIDTH = 4200;
const WORLD_HEIGHT = 1800;
const GRAVITY = 1800;
const PLAYER_RADIUS = 16;
const BOT_RADIUS = 16;
const GROUND_STEP = 8;
const MAX_BOTS = 10;

const keys = new Set();
const mouse = { x: 0, y: 0, down: false, rightDown: false };

let lastTime = performance.now();
let cameraX = 0;
let cameraY = 0;
let previousCameraX = 0;
let previousCameraY = 0;
let screenShake = 0;
let explosions = [];
let bullets = [];
let grenades = [];
let sparks = [];
let smoke = [];
let corpses = [];
let pickups = [];

const weaponCatalog = {
  rifle: {
    label: "Rifle",
    ammo: 30,
    reloadTime: 1.2,
    cooldown: 0.1,
    bulletSpeed: 1050,
    damage: 18,
    pellets: 1,
    spread: 0.012,
    recoilX: 52,
    recoilYUp: 18,
    recoilYDown: 8,
    terrainRadius: 8,
    flashSize: 1,
    burst: 1,
  },
  smg: {
    label: "SMG",
    ammo: 42,
    reloadTime: 1.0,
    cooldown: 0.055,
    bulletSpeed: 980,
    damage: 11,
    pellets: 1,
    spread: 0.05,
    recoilX: 30,
    recoilYUp: 10,
    recoilYDown: 4,
    terrainRadius: 6,
    flashSize: 0.82,
    burst: 1,
  },
  shotgun: {
    label: "Shotgun",
    ammo: 8,
    reloadTime: 1.45,
    cooldown: 0.55,
    bulletSpeed: 880,
    damage: 10,
    pellets: 7,
    spread: 0.18,
    recoilX: 95,
    recoilYUp: 28,
    recoilYDown: 12,
    terrainRadius: 7,
    flashSize: 1.24,
    burst: 1,
  },
  burst: {
    label: "Burst",
    ammo: 24,
    reloadTime: 1.15,
    cooldown: 0.24,
    bulletSpeed: 1100,
    damage: 16,
    pellets: 1,
    spread: 0.022,
    recoilX: 40,
    recoilYUp: 14,
    recoilYDown: 6,
    terrainRadius: 7,
    flashSize: 0.95,
    burst: 3,
  },
};

const weaponOrder = ["rifle", "smg", "shotgun", "burst"];
const teamSpawnPoints = {
  left: [
    { x: 230, yOffset: -28 },
    { x: 310, yOffset: -28 },
    { x: 430, yOffset: -28 },
  ],
  right: [
    { x: WORLD_WIDTH - 230, yOffset: -28 },
    { x: WORLD_WIDTH - 310, yOffset: -28 },
    { x: WORLD_WIDTH - 430, yOffset: -28 },
  ],
};
let leftSpawnCursor = 0;
let rightSpawnCursor = 0;
let desiredBotCount = 6;
const MAX_GRENADES = 3;
const pickupDefinitions = {
  medkit: {
    label: "Apteczka",
    color: "#d85e5e",
    accent: "#fff0f0",
    respawn: 16,
  },
  ammo: {
    label: "Ammo",
    color: "#d1b25d",
    accent: "#fff1bb",
    respawn: 13,
  },
  grenades: {
    label: "Granaty",
    color: "#70b978",
    accent: "#dbffe0",
    respawn: 20,
  },
};
const pickupSpawnPoints = [
  { type: "medkit", x: 930, y: 0 },
  { type: "medkit", x: WORLD_WIDTH - 930, y: 0 },
  { type: "ammo", x: 1500, y: 0 },
  { type: "ammo", x: WORLD_WIDTH - 1500, y: 0 },
  { type: "grenades", x: WORLD_WIDTH * 0.5, y: 0 },
  { type: "ammo", x: WORLD_WIDTH * 0.5 - 260, y: 0 },
  { type: "ammo", x: WORLD_WIDTH * 0.5 + 260, y: 0 },
];

const terrainCanvas = document.createElement("canvas");
terrainCanvas.width = WORLD_WIDTH;
terrainCanvas.height = WORLD_HEIGHT;
const terrainCtx = terrainCanvas.getContext("2d");

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function length(x, y) {
  return Math.hypot(x, y);
}

function normalize(x, y, fallbackX = 1, fallbackY = 0) {
  const len = Math.hypot(x, y);
  if (len < 0.0001) {
    return { x: fallbackX, y: fallbackY };
  }
  return { x: x / len, y: y / len };
}

function terrainSolid(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return false;
  }

  if (x < 0 || x >= WORLD_WIDTH || y < 0 || y >= WORLD_HEIGHT) {
    return y >= WORLD_HEIGHT;
  }

  const pixel = terrainCtx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
  return pixel[3] > 20;
}

function carveTerrain(x, y, radius) {
  terrainCtx.save();
  terrainCtx.globalCompositeOperation = "destination-out";
  terrainCtx.beginPath();
  terrainCtx.arc(x, y, radius, 0, Math.PI * 2);
  terrainCtx.fill();
  terrainCtx.restore();
}

function stampCraterDecor(x, y, radius) {
  for (let i = 0; i < 16; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = rand(80, 260);
    sparks.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 60,
      life: rand(0.25, 0.7),
      size: rand(1.5, 3.5),
      color: i % 2 === 0 ? "#ffcf73" : "#8a98a8",
    });
  }

  for (let i = 0; i < 18; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = rand(18, 90);
    smoke.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - rand(40, 110),
      life: rand(0.7, 1.8),
      maxLife: rand(0.7, 1.8),
      size: rand(radius * 0.22, radius * 0.52),
      growth: rand(22, 58),
      color: Math.random() < 0.4 ? "255,212,148" : "72,82,94",
    });
  }

  explosions.push({ x, y, radius, life: 0.45 });
  screenShake = Math.max(screenShake, Math.min(22, radius * 0.16));
}

function impactTerrain(x, y, radius) {
  carveTerrain(x, y, radius);
  stampCraterDecor(x, y, Math.max(8, radius * 1.6));
}

function createTerrain() {
  terrainCtx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  const heights = [];
  const arenaProfile = [
    { x: 0, y: 0.71 },
    { x: 0.08, y: 0.67 },
    { x: 0.16, y: 0.6 },
    { x: 0.25, y: 0.55 },
    { x: 0.34, y: 0.6 },
    { x: 0.43, y: 0.68 },
    { x: 0.5, y: 0.745 },
    { x: 0.57, y: 0.68 },
    { x: 0.66, y: 0.6 },
    { x: 0.75, y: 0.55 },
    { x: 0.84, y: 0.6 },
    { x: 0.92, y: 0.67 },
    { x: 1, y: 0.71 },
  ];

  function smoothstep(value) {
    return value * value * (3 - 2 * value);
  }

  function sampleProfile(normalizedX) {
    for (let i = 0; i < arenaProfile.length - 1; i += 1) {
      const left = arenaProfile[i];
      const right = arenaProfile[i + 1];
      if (normalizedX >= left.x && normalizedX <= right.x) {
        const rawT = (normalizedX - left.x) / (right.x - left.x);
        const t = smoothstep(rawT);
        return left.y + (right.y - left.y) * t;
      }
    }
    return arenaProfile[arenaProfile.length - 1].y;
  }

  for (let x = 0; x <= WORLD_WIDTH; x += GROUND_STEP) {
    const normalizedX = x / WORLD_WIDTH;
    const base = sampleProfile(normalizedX) * WORLD_HEIGHT;
    const distFromCenter = Math.abs(normalizedX - 0.5);
    const shaping =
      Math.sin(normalizedX * Math.PI * 4.2) * 7 +
      Math.sin(normalizedX * Math.PI * 9.6) * 2.5 +
      (0.5 - distFromCenter) * 8 +
      rand(-1.8, 1.8);
    const y = clamp(base + shaping, WORLD_HEIGHT * 0.52, WORLD_HEIGHT * 0.74);
    heights.push({ x, y });
  }

  function groundHeightAt(sampleX) {
    const clampedX = clamp(sampleX, 0, WORLD_WIDTH);
    const index = clampedX / GROUND_STEP;
    const leftIndex = Math.floor(index);
    const rightIndex = Math.min(heights.length - 1, leftIndex + 1);
    const blend = index - leftIndex;
    const left = heights[leftIndex];
    const right = heights[rightIndex];
    return left.y + (right.y - left.y) * blend;
  }

  function drawGroundTexture() {
    terrainCtx.save();
    terrainCtx.globalCompositeOperation = "source-atop";

    const rockGradient = terrainCtx.createLinearGradient(0, WORLD_HEIGHT * 0.46, 0, WORLD_HEIGHT);
    rockGradient.addColorStop(0, "rgba(94, 114, 96, 0.12)");
    rockGradient.addColorStop(0.28, "rgba(83, 95, 105, 0.24)");
    rockGradient.addColorStop(0.62, "rgba(55, 66, 74, 0.34)");
    rockGradient.addColorStop(1, "rgba(27, 33, 39, 0.46)");
    terrainCtx.fillStyle = rockGradient;
    terrainCtx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    for (let i = 0; i < 240; i += 1) {
      const patchX = rand(0, WORLD_WIDTH);
      const patchY = rand(WORLD_HEIGHT * 0.52, WORLD_HEIGHT * 0.96);
      terrainCtx.fillStyle = i % 3 === 0 ? "rgba(118, 108, 82, 0.08)" : "rgba(255, 255, 255, 0.035)";
      terrainCtx.beginPath();
      terrainCtx.ellipse(patchX, patchY, rand(18, 90), rand(8, 28), rand(0, Math.PI), 0, Math.PI * 2);
      terrainCtx.fill();
    }

    for (let i = 0; i < 130; i += 1) {
      const seamX = rand(0, WORLD_WIDTH);
      const seamY = rand(WORLD_HEIGHT * 0.54, WORLD_HEIGHT * 0.92);
      const seamLength = rand(18, 90);
      terrainCtx.strokeStyle = "rgba(24, 28, 34, 0.18)";
      terrainCtx.lineWidth = rand(1, 2.2);
      terrainCtx.beginPath();
      terrainCtx.moveTo(seamX, seamY);
      terrainCtx.lineTo(seamX + seamLength, seamY + rand(-12, 12));
      terrainCtx.stroke();
    }

    terrainCtx.restore();
  }

  function drawShelf(shelfX, shelfY, shelfWidth, shelfHeight, wobble = 6, withGapChance = 0.18) {
    const topGradient = terrainCtx.createLinearGradient(shelfX, shelfY, shelfX, shelfY + shelfHeight);
    topGradient.addColorStop(0, "#789369");
    topGradient.addColorStop(0.26, "#61775a");
    topGradient.addColorStop(1, "#39444d");

    terrainCtx.fillStyle = topGradient;
    terrainCtx.beginPath();
    terrainCtx.moveTo(shelfX, shelfY);
    terrainCtx.quadraticCurveTo(
      shelfX + shelfWidth * 0.22,
      shelfY - wobble,
      shelfX + shelfWidth * 0.48,
      shelfY - wobble * 0.35,
    );
    terrainCtx.quadraticCurveTo(
      shelfX + shelfWidth * 0.78,
      shelfY + wobble * 0.2,
      shelfX + shelfWidth,
      shelfY,
    );
    terrainCtx.lineTo(shelfX + shelfWidth - 18, shelfY + shelfHeight);
    terrainCtx.quadraticCurveTo(
      shelfX + shelfWidth * 0.54,
      shelfY + shelfHeight + wobble * 0.16,
      shelfX + 18,
      shelfY + shelfHeight,
    );
    terrainCtx.closePath();
    terrainCtx.fill();

    terrainCtx.strokeStyle = "#95ad7a";
    terrainCtx.lineWidth = 4;
    terrainCtx.beginPath();
    terrainCtx.moveTo(shelfX + 10, shelfY + 1.5);
    terrainCtx.quadraticCurveTo(
      shelfX + shelfWidth * 0.34,
      shelfY - wobble * 0.55,
      shelfX + shelfWidth - 10,
      shelfY + 1.5,
    );
    terrainCtx.stroke();

    for (let i = 0; i < Math.max(3, Math.floor(shelfWidth / 90)); i += 1) {
      const mossX = shelfX + rand(14, shelfWidth - 18);
      const mossY = shelfY + rand(5, shelfHeight - 4);
      terrainCtx.fillStyle = i % 2 === 0 ? "rgba(113, 132, 89, 0.24)" : "rgba(188, 166, 111, 0.12)";
      terrainCtx.beginPath();
      terrainCtx.ellipse(mossX, mossY, rand(10, 22), rand(4, 9), rand(0, Math.PI), 0, Math.PI * 2);
      terrainCtx.fill();
    }

    if (Math.random() < withGapChance) {
      carveTerrain(shelfX + rand(44, shelfWidth - 44), shelfY + rand(4, shelfHeight - 3), rand(8, 12));
    }
  }

  function stampCrate(x, y, size = 26) {
    terrainCtx.fillStyle = "#7c5a3a";
    terrainCtx.fillRect(x, y - size, size, size);
    terrainCtx.strokeStyle = "#4c3524";
    terrainCtx.lineWidth = 3;
    terrainCtx.strokeRect(x, y - size, size, size);
    terrainCtx.beginPath();
    terrainCtx.moveTo(x + 4, y - size + 4);
    terrainCtx.lineTo(x + size - 4, y - 4);
    terrainCtx.moveTo(x + size - 4, y - size + 4);
    terrainCtx.lineTo(x + 4, y - 4);
    terrainCtx.stroke();
  }

  function stampBarrel(x, y, width = 18, height = 30) {
    const barrelGradient = terrainCtx.createLinearGradient(x, y - height, x + width, y);
    barrelGradient.addColorStop(0, "#7a5438");
    barrelGradient.addColorStop(0.5, "#9d6a43");
    barrelGradient.addColorStop(1, "#633f2a");
    terrainCtx.fillStyle = barrelGradient;
    terrainCtx.beginPath();
    terrainCtx.roundRect(x, y - height, width, height, 6);
    terrainCtx.fill();
    terrainCtx.strokeStyle = "#352319";
    terrainCtx.lineWidth = 2;
    terrainCtx.stroke();
    terrainCtx.strokeStyle = "#c9b089";
    terrainCtx.lineWidth = 2;
    terrainCtx.beginPath();
    terrainCtx.moveTo(x + 2, y - height + 7);
    terrainCtx.lineTo(x + width - 2, y - height + 7);
    terrainCtx.moveTo(x + 2, y - height + 15);
    terrainCtx.lineTo(x + width - 2, y - height + 15);
    terrainCtx.lineTo(x + width - 2, y - height + 23);
    terrainCtx.stroke();
  }

  function placeObstacleSet(baseX, baseY, variant = "crate") {
    if (variant === "crate") {
      stampCrate(baseX, baseY, 24);
      if (Math.random() < 0.45) {
        stampCrate(baseX + 24, baseY, 20);
      }
      return;
    }

    stampBarrel(baseX, baseY, 18, 30);
    if (Math.random() < 0.4) {
      stampBarrel(baseX + 18, baseY, 18, 30);
    }
  }

  terrainCtx.fillStyle = "#2f3d47";
  terrainCtx.beginPath();
  terrainCtx.moveTo(0, WORLD_HEIGHT);
  terrainCtx.lineTo(0, heights[0].y);

  for (const point of heights) {
    terrainCtx.lineTo(point.x, point.y);
  }

  terrainCtx.lineTo(WORLD_WIDTH, WORLD_HEIGHT);
  terrainCtx.closePath();
  terrainCtx.fill();

  terrainCtx.strokeStyle = "#71905f";
  terrainCtx.lineWidth = 10;
  terrainCtx.lineJoin = "round";
  terrainCtx.beginPath();
  terrainCtx.moveTo(0, heights[0].y - 2);
  for (const point of heights) {
    terrainCtx.lineTo(point.x, point.y - 2);
  }
  terrainCtx.stroke();
  drawGroundTexture();

  terrainCtx.fillStyle = "rgba(255,255,255,0.05)";
  for (let i = 0; i < 40; i += 1) {
    const hillX = rand(0, WORLD_WIDTH);
    const hillY = rand(WORLD_HEIGHT * 0.62, WORLD_HEIGHT * 0.9);
    terrainCtx.beginPath();
    terrainCtx.ellipse(hillX, hillY, rand(40, 120), rand(18, 40), rand(0, Math.PI), 0, Math.PI * 2);
    terrainCtx.fill();
  }

  for (let i = 0; i < 4; i += 1) {
    carveTerrain(rand(220, WORLD_WIDTH - 220), rand(WORLD_HEIGHT * 0.2, WORLD_HEIGHT * 0.3), rand(16, 22));
  }

  terrainCtx.fillStyle = "#31414a";
  terrainCtx.strokeStyle = "#7e9a6c";
  terrainCtx.lineWidth = 5;
  terrainCtx.lineJoin = "round";

  function mirrorX(leftX, width) {
    return WORLD_WIDTH - leftX - width;
  }

  const leftSideShelves = [
    { role: "spawn_low", x: 150, width: 360, lift: 50, height: 20, wobble: 4 },
    { role: "spawn_high", x: 620, width: 280, lift: 118, height: 18, wobble: 6 },
    { role: "mid_path", x: 1020, width: 350, lift: 72, height: 20, wobble: 5 },
    { role: "sniper_perch", x: 1470, width: 260, lift: 144, height: 18, wobble: 6 },
  ];

  for (const shelf of leftSideShelves) {
    const localGround = groundHeightAt(shelf.x + shelf.width * 0.5);
    const shelfY = clamp(localGround - shelf.lift, WORLD_HEIGHT * 0.26, WORLD_HEIGHT * 0.66);
    drawShelf(shelf.x, shelfY, shelf.width, shelf.height, shelf.wobble, 0.14);
    const mirroredX = mirrorX(shelf.x, shelf.width);
    const mirroredGround = groundHeightAt(mirroredX + shelf.width * 0.5);
    const mirroredY = clamp(mirroredGround - shelf.lift, WORLD_HEIGHT * 0.26, WORLD_HEIGHT * 0.66);
    drawShelf(mirroredX, mirroredY, shelf.width, shelf.height, shelf.wobble, 0.14);
  }

  const bridgeShelves = [
    { x: 760, width: 170, lift: 188 },
    { x: 1710, width: 190, lift: 214 },
    { x: 2310, width: 190, lift: 214 },
    { x: 3270, width: 170, lift: 188 },
  ];

  for (const shelf of bridgeShelves) {
    const localGround = groundHeightAt(shelf.x + shelf.width * 0.5);
    const shelfY = clamp(localGround - shelf.lift, WORLD_HEIGHT * 0.22, WORLD_HEIGHT * 0.54);
    drawShelf(shelf.x, shelfY, shelf.width, 14, 4, 0);
  }

  const jumpAssistShelves = [
    { x: 340, width: 120, lift: 38 },
    { x: 1040, width: 120, lift: 42 },
    { x: 1520, width: 120, lift: 42 },
    { x: 1640, width: 110, lift: 34 },
  ];

  for (const shelf of jumpAssistShelves) {
    const leftGround = groundHeightAt(shelf.x + shelf.width * 0.5);
    const leftY = clamp(leftGround - shelf.lift, WORLD_HEIGHT * 0.44, WORLD_HEIGHT * 0.69);
    drawShelf(shelf.x, leftY, shelf.width, 13, 3, 0);

    const mirroredX = mirrorX(shelf.x, shelf.width);
    const rightGround = groundHeightAt(mirroredX + shelf.width * 0.5);
    const rightY = clamp(rightGround - shelf.lift, WORLD_HEIGHT * 0.44, WORLD_HEIGHT * 0.69);
    drawShelf(mirroredX, rightY, shelf.width, 13, 3, 0);
  }

  const centerX = WORLD_WIDTH * 0.5;
  const centerGround = groundHeightAt(centerX);

  terrainCtx.save();
  terrainCtx.globalCompositeOperation = "destination-out";
  terrainCtx.beginPath();
  terrainCtx.ellipse(centerX, centerGround - 8, 300, 120, 0, 0, Math.PI * 2);
  terrainCtx.fill();
  terrainCtx.restore();

  carveTerrain(centerX - 210, centerGround - 122, 30);
  carveTerrain(centerX + 210, centerGround - 122, 30);

  const leftTunnel = [
    { x: 520, y: groundHeightAt(520) + 42, r: 70 },
    { x: 760, y: groundHeightAt(760) + 56, r: 84 },
    { x: 1010, y: groundHeightAt(1010) + 64, r: 92 },
    { x: 1290, y: groundHeightAt(1290) + 58, r: 82 },
    { x: 1560, y: groundHeightAt(1560) + 42, r: 68 },
  ];

  const rightTunnel = [
    { x: WORLD_WIDTH - 520, y: groundHeightAt(WORLD_WIDTH - 520) + 42, r: 70 },
    { x: WORLD_WIDTH - 760, y: groundHeightAt(WORLD_WIDTH - 760) + 56, r: 84 },
    { x: WORLD_WIDTH - 1010, y: groundHeightAt(WORLD_WIDTH - 1010) + 64, r: 92 },
    { x: WORLD_WIDTH - 1290, y: groundHeightAt(WORLD_WIDTH - 1290) + 58, r: 82 },
    { x: WORLD_WIDTH - 1560, y: groundHeightAt(WORLD_WIDTH - 1560) + 42, r: 68 },
  ];

  for (const room of [...leftTunnel, ...rightTunnel]) {
    carveTerrain(room.x, room.y, room.r);
  }

  carveTerrain(centerX, centerGround + 82, 120);
  carveTerrain(centerX, centerGround + 154, 92);

  const spawnShelters = [
    { x: 120, width: 180, lift: 20 },
    { x: WORLD_WIDTH - 300, width: 180, lift: 20 },
  ];

  for (const shelter of spawnShelters) {
    const localGround = groundHeightAt(shelter.x + shelter.width * 0.5);
    const shelfY = clamp(localGround - shelter.lift, WORLD_HEIGHT * 0.54, WORLD_HEIGHT * 0.72);
    drawShelf(shelter.x, shelfY, shelter.width, 20, 3, 0);
  }

  const topCoverShelves = [
    { x: centerX - 110, width: 90, y: centerGround - 228 },
    { x: centerX + 20, width: 90, y: centerGround - 228 },
  ];

  for (const shelf of topCoverShelves) {
    drawShelf(shelf.x, shelf.y, shelf.width, 12, 2, 0);
  }

  const obstacleSpots = [
    { x: 278, y: groundHeightAt(278) - 2, variant: "crate" },
    { x: 688, y: groundHeightAt(688) - 2, variant: "barrel" },
    { x: 1184, y: groundHeightAt(1184) - 2, variant: "crate" },
    { x: 1724, y: groundHeightAt(1724) - 2, variant: "barrel" },
    { x: WORLD_WIDTH - 278, y: groundHeightAt(WORLD_WIDTH - 278) - 2, variant: "crate" },
    { x: WORLD_WIDTH - 688, y: groundHeightAt(WORLD_WIDTH - 688) - 2, variant: "barrel" },
    { x: WORLD_WIDTH - 1184, y: groundHeightAt(WORLD_WIDTH - 1184) - 2, variant: "crate" },
    { x: WORLD_WIDTH - 1724, y: groundHeightAt(WORLD_WIDTH - 1724) - 2, variant: "barrel" },
    { x: centerX - 64, y: centerGround - 118, variant: "crate" },
    { x: centerX + 36, y: centerGround - 118, variant: "barrel" },
  ];

  for (const spot of obstacleSpots) {
    placeObstacleSet(spot.x, spot.y, spot.variant);
  }
}

function createActor(options) {
  return {
    x: options.x,
    y: options.y,
    vx: 0,
    vy: 0,
    radius: options.radius,
    color: options.color,
    accent: options.accent,
    facing: 1,
    aimX: 1,
    aimY: 0,
    hp: 100,
    maxHp: 100,
    onGround: false,
    reload: 0,
    ammo: weaponCatalog.rifle.ammo,
    grenades: MAX_GRENADES,
    grenadeCooldown: 0,
    grapple: null,
    kills: 0,
    deadTimer: 0,
    isBot: options.isBot,
    name: options.name,
    jumpBuffer: 0,
    coyote: 0,
    sprinting: false,
    triggerHold: 0,
    targetId: null,
    weapon: options.weapon ?? "rifle",
    fireQueue: 0,
    fireQueueDelay: 0,
  };
}

const player = createActor({
  x: 320,
  y: 300,
  radius: PLAYER_RADIUS,
  color: "#596c60",
  accent: "#b7aa8f",
  isBot: false,
  name: "Player",
});

const bots = [];

function spawnBots() {
  bots.length = 0;
  for (let i = 0; i < desiredBotCount; i += 1) {
    bots.push(createActor({
      x: 840 + i * 360,
      y: 240,
      radius: BOT_RADIUS,
      color: i % 2 === 0 ? "#6d7f67" : "#6c767f",
      accent: i % 2 === 0 ? "#bea88a" : "#b7b0a4",
      isBot: true,
      name: `Bot ${i + 1}`,
    }));
  }
}

function rebuildPickups() {
  pickups = pickupSpawnPoints.map((spawn, index) => ({
    id: index,
    type: spawn.type,
    x: spawn.x,
    y: findSpawnY(spawn.x) - 18,
    active: true,
    timer: 0,
  }));
}

function setBotCount(count) {
  desiredBotCount = clamp(Number(count), 0, MAX_BOTS);
  ui.botCountValue.textContent = String(desiredBotCount);
  spawnBots();
  bots.forEach(respawnActor);
  ui.status.textContent = `Boty: ${desiredBotCount}`;
}

function allActors() {
  return [player, ...bots];
}

function getWeaponStats(actor) {
  return weaponCatalog[actor.weapon] ?? weaponCatalog.rifle;
}

function findSpawnY(spawnX) {
  for (let y = 80; y < WORLD_HEIGHT - 40; y += 2) {
    if (terrainSolid(spawnX, y + PLAYER_RADIUS + 4) && !terrainSolid(spawnX, y)) {
      return y;
    }
  }
  return WORLD_HEIGHT * 0.28;
}

function nextSpawnPoint(side) {
  if (side === "left") {
    const point = teamSpawnPoints.left[leftSpawnCursor % teamSpawnPoints.left.length];
    leftSpawnCursor += 1;
    return point;
  }

  const point = teamSpawnPoints.right[rightSpawnCursor % teamSpawnPoints.right.length];
  rightSpawnCursor += 1;
  return point;
}

function respawnActor(actor) {
  const isPlayerSide = actor === player || (actor.isBot && Number.parseInt(actor.name.replace(/\D/g, ""), 10) % 2 === 1);
  const spawnPoint = nextSpawnPoint(isPlayerSide ? "left" : "right");
  actor.x = spawnPoint.x;
  actor.y = findSpawnY(actor.x) + spawnPoint.yOffset;
  actor.vx = 0;
  actor.vy = 0;
  actor.hp = actor.maxHp;
  actor.deadTimer = 0;
  actor.reload = 0;
  actor.ammo = getWeaponStats(actor).ammo;
  actor.grenades = MAX_GRENADES;
  actor.grapple = null;
}

function switchWeapon(actor, weaponKey) {
  if (!weaponCatalog[weaponKey] || actor.weapon === weaponKey) {
    return;
  }

  actor.weapon = weaponKey;
  actor.reload = 0;
  actor.ammo = getWeaponStats(actor).ammo;
  actor.fireQueue = 0;
  actor.fireQueueDelay = 0;
  if (actor === player) {
    ui.status.textContent = `Bron: ${getWeaponStats(actor).label}`;
  }
}

function spawnCorpse(actor, source) {
  const impactDir = source ? normalize(actor.x - source.x, actor.y - source.y, actor.facing, -0.3) : { x: actor.facing, y: -0.4 };
  corpses.push({
    x: actor.x,
    y: actor.y,
    vx: actor.vx + impactDir.x * 180,
    vy: actor.vy + impactDir.y * 180 - 40,
    angle: 0,
    angularVelocity: rand(-7, 7),
    life: 2.4,
    color: actor.color,
    accent: actor.accent,
    facing: actor.facing,
    weapon: actor.weapon,
  });
}

function resolveTerrainCollision(actor) {
  actor.onGround = false;
  const footY = actor.y + actor.radius + 2;
  if (terrainSolid(actor.x, footY)) {
    while (terrainSolid(actor.x, actor.y + actor.radius) && actor.y > 0) {
      actor.y -= 1.5;
    }
    actor.vy = Math.min(actor.vy, 0);
    actor.onGround = true;
  }

  if (terrainSolid(actor.x + actor.radius, actor.y) || terrainSolid(actor.x - actor.radius, actor.y)) {
    const dir = terrainSolid(actor.x + actor.radius, actor.y) ? -1 : 1;
    let attempts = 0;
    while ((terrainSolid(actor.x + actor.radius, actor.y) || terrainSolid(actor.x - actor.radius, actor.y)) && attempts < 12) {
      actor.x += dir * 1.5;
      attempts += 1;
    }
    actor.vx *= 0.55;
  }

  if (terrainSolid(actor.x, actor.y - actor.radius)) {
    while (terrainSolid(actor.x, actor.y - actor.radius) && actor.y < WORLD_HEIGHT) {
      actor.y += 1.5;
    }
    actor.vy = Math.max(actor.vy, 40);
  }

  if (actor.onGround) {
    actor.coyote = 0.1;
  } else {
    actor.coyote = Math.max(0, actor.coyote - dtGlobal);
  }
}

function lineHitsTerrain(x1, y1, x2, y2) {
  if (![x1, y1, x2, y2].every(Number.isFinite)) {
    return null;
  }

  const dx = x2 - x1;
  const dy = y2 - y1;
  const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 5);

  if (steps <= 0) {
    return terrainSolid(x1, y1) ? { x: x1, y: y1 } : null;
  }

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = x1 + dx * t;
    const y = y1 + dy * t;
    if (terrainSolid(x, y)) {
      return { x, y };
    }
  }

  return null;
}

function shoot(actor) {
  if (actor.reload > 0 || actor.deadTimer > 0) {
    return;
  }

  const weapon = getWeaponStats(actor);
  if (actor.ammo <= 0) {
    actor.reload = weapon.reloadTime;
    ui.status.textContent = actor === player ? "Przeladowanie." : ui.status.textContent;
    return;
  }

  actor.fireQueue = Math.max(actor.fireQueue, weapon.burst - 1);
  actor.fireQueueDelay = weapon.burst > 1 ? 0.05 : 0;
  fireProjectile(actor, weapon);
  actor.reload = actor.isBot ? weapon.cooldown + rand(0.03, 0.08) : weapon.cooldown;
}

function throwGrenade(actor) {
  if (actor.grenadeCooldown > 0 || actor.deadTimer > 0 || actor.grenades <= 0) {
    return;
  }

  const aim = normalize(actor.aimX, actor.aimY, actor.facing, 0);
  grenades.push({
    x: actor.x + aim.x * 18,
    y: actor.y - 6,
    vx: aim.x * 360 + actor.vx * 0.4,
    vy: aim.y * 360 - 120,
    life: 1.6,
    owner: actor,
  });
  actor.grenades -= 1;
  actor.grenadeCooldown = 2.5;
}

function explode(x, y, radius, damage, owner) {
  carveTerrain(x, y, radius);
  stampCraterDecor(x, y, radius);

  for (const actor of allActors()) {
    if (actor.deadTimer > 0) {
      continue;
    }

    const dx = actor.x - x;
    const dy = actor.y - y;
    const dist = Math.hypot(dx, dy);
    if (dist > radius * 2.2) {
      continue;
    }

    const force = 1 - dist / (radius * 2.2);
    const dir = normalize(dx, dy, 0, -1);
    actor.vx += dir.x * force * 580;
    actor.vy += dir.y * force * 580 - 120;
    damageActor(actor, damage * force, owner);
  }
}

function damageActor(actor, amount, source) {
  actor.hp -= amount;
  if (actor.hp > 0 || actor.deadTimer > 0) {
    return;
  }

  actor.deadTimer = 2.4;
  actor.hp = 0;
  actor.grapple = null;
  actor.fireQueue = 0;
  actor.fireQueueDelay = 0;
  spawnCorpse(actor, source);
  stampCraterDecor(actor.x, actor.y, 28);

  if (source && source !== actor) {
    source.kills += 1;
    if (source === player) {
      ui.status.textContent = `Eliminacja: ${actor.name}`;
    }
  }
}

function updateActorMovement(actor, inputX, wantsJump, sprint, dt) {
  if (actor.deadTimer > 0) {
    actor.vx *= Math.pow(0.1, dt);
    actor.vy += GRAVITY * dt;
    actor.x += actor.vx * dt;
    actor.y += actor.vy * dt;
    resolveTerrainCollision(actor);
    actor.deadTimer -= dt;
    if (actor.deadTimer <= 0) {
      respawnActor(actor);
    }
    return;
  }

  const accel = actor.onGround ? 1600 : 850;
  const maxSpeed = sprint ? 320 : 230;
  if (Math.abs(inputX) > 0.01) {
    actor.vx += inputX * accel * dt;
    actor.facing = Math.sign(inputX) || actor.facing;
  } else if (actor.onGround) {
    actor.vx *= Math.pow(0.0008, dt);
  } else {
    actor.vx *= Math.pow(0.45, dt);
  }

  actor.vx = clamp(actor.vx, -maxSpeed, maxSpeed);
  actor.vy += GRAVITY * dt;

  if (wantsJump) {
    actor.jumpBuffer = 0.12;
  } else {
    actor.jumpBuffer = Math.max(0, actor.jumpBuffer - dt);
  }

  if (actor.jumpBuffer > 0 && (actor.onGround || actor.coyote > 0)) {
    actor.vy = -560;
    actor.onGround = false;
    actor.coyote = 0;
    actor.jumpBuffer = 0;
  }

  if (actor.grapple) {
    const dx = actor.grapple.x - actor.x;
    const dy = actor.grapple.y - actor.y;
    const dist = Math.hypot(dx, dy);
    const dir = normalize(dx, dy);
    if (dist > actor.grapple.length) {
      const pull = (dist - actor.grapple.length) * 18;
      actor.vx += dir.x * pull * dt;
      actor.vy += dir.y * pull * dt;
    }
    actor.vy -= 240 * dt;
  }

  actor.x += actor.vx * dt;
  resolveTerrainCollision(actor);

  actor.y += actor.vy * dt;
  resolveTerrainCollision(actor);

  if (actor.onGround && !wantsJump && Math.abs(inputX) < 0.05) {
    const slopeBias = Number(terrainSolid(actor.x + actor.radius + 4, actor.y + actor.radius + 4)) - Number(terrainSolid(actor.x - actor.radius - 4, actor.y + actor.radius + 4));
    actor.vx += slopeBias * 22 * dt;
  }

  actor.x = clamp(actor.x, actor.radius, WORLD_WIDTH - actor.radius);
  actor.y = Math.max(actor.radius, actor.y);
  if (actor.y <= actor.radius + 1 && actor.vy < 0) {
    actor.vy = 0;
  }
  if (actor.y > WORLD_HEIGHT + 220) {
    damageActor(actor, 200, null);
  }

  actor.reload = Math.max(0, actor.reload - dt);
  actor.grenadeCooldown = Math.max(0, actor.grenadeCooldown - dt);
  actor.fireQueueDelay = Math.max(0, actor.fireQueueDelay - dt);
  if (actor.ammo <= 0 && actor.reload === 0) {
    actor.ammo = getWeaponStats(actor).ammo;
  }
}

function updatePlayer(dt) {
  const inputX = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
  const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const worldMouseX = mouse.x + cameraX;
  const worldMouseY = mouse.y + cameraY;
  player.aimX = worldMouseX - player.x;
  player.aimY = worldMouseY - player.y;

  updateActorMovement(player, inputX, keys.has("KeyW"), sprint, dt);

  if (mouse.down) {
    shoot(player);
  }

  if (mouse.rightDown) {
    if (!player.grapple) {
      const hookEndX = player.x + normalize(player.aimX, player.aimY, player.facing, 0).x * 520;
      const hookEndY = player.y + normalize(player.aimX, player.aimY, player.facing, 0).y * 520;
      const hit = lineHitsTerrain(player.x, player.y, hookEndX, hookEndY);
      if (hit) {
        player.grapple = {
          x: hit.x,
          y: hit.y,
          length: Math.max(80, Math.hypot(hit.x - player.x, hit.y - player.y) * 0.72),
        };
        ui.status.textContent = "Hak zaczepiony.";
      }
    }
  } else {
    player.grapple = null;
  }
}

function updateBots(dt) {
  for (const bot of bots) {
    if (bot.deadTimer > 0) {
      updateActorMovement(bot, 0, false, false, dt);
      continue;
    }

    let target = player;
    let bestDist = Math.abs(player.x - bot.x);

    for (const other of bots) {
      if (other === bot || other.deadTimer > 0) {
        continue;
      }
      const dist = Math.abs(other.x - bot.x);
      if (dist < bestDist) {
        bestDist = dist;
        target = other;
      }
    }

    if (!Number.isFinite(target.x) || !Number.isFinite(target.y)) {
      continue;
    }

    const dx = target.x - bot.x;
    const dy = target.y - bot.y;
    bot.aimX = dx;
    bot.aimY = dy;

    if (Math.abs(dx) > 620) {
      switchWeapon(bot, "rifle");
    } else if (Math.abs(dx) < 150) {
      switchWeapon(bot, "shotgun");
    } else if (Math.abs(dx) < 320) {
      switchWeapon(bot, "smg");
    } else {
      switchWeapon(bot, "burst");
    }

    const preferredRange = 280;
    const moveDir = Math.abs(dx) > preferredRange ? Math.sign(dx) : -Math.sign(dx) * 0.35;
    const wallAhead = terrainSolid(bot.x + Math.sign(moveDir || 1) * 26, bot.y + 10);
    const needsJump = wallAhead || target.y + 60 < bot.y;

    updateActorMovement(bot, moveDir, needsJump, Math.abs(dx) > 700, dt);

    const hasShot = lineHitsTerrain(bot.x, bot.y, target.x, target.y);
    if (!hasShot && Math.abs(dx) < 760 && Math.abs(dy) < 260) {
      shoot(bot);
    }

    if (Math.abs(dx) < 220 && bot.grenadeCooldown === 0 && Math.random() < 0.012) {
      throwGrenade(bot);
    }

    if (Math.random() < 0.004) {
      const hookEndX = bot.x + normalize(bot.aimX, bot.aimY, bot.facing, 0).x * 420;
      const hookEndY = bot.y + normalize(bot.aimX, bot.aimY, bot.facing, 0).y * 420;
      const hit = lineHitsTerrain(bot.x, bot.y, hookEndX, hookEndY);
      bot.grapple = hit
        ? {
            x: hit.x,
            y: hit.y,
            length: Math.max(70, Math.hypot(hit.x - bot.x, hit.y - bot.y) * 0.75),
          }
        : null;
    } else if (Math.random() < 0.01) {
      bot.grapple = null;
    }
  }
}

function updateQueuedShots(dt) {
  for (const actor of allActors()) {
    if (actor.deadTimer > 0 || actor.fireQueue <= 0 || actor.fireQueueDelay > 0) {
      continue;
    }

    const weapon = getWeaponStats(actor);
    if (actor.ammo <= 0) {
      actor.fireQueue = 0;
      continue;
    }

    actor.fireQueue -= 1;
    actor.fireQueueDelay = actor.fireQueue > 0 ? 0.05 : 0;
    fireProjectile(actor, weapon);
  }
}

function applyPickup(actor, pickup) {
  if (pickup.type === "medkit") {
    actor.hp = Math.min(actor.maxHp, actor.hp + 55);
  } else if (pickup.type === "ammo") {
    actor.ammo = getWeaponStats(actor).ammo;
  } else if (pickup.type === "grenades") {
    actor.grenades = MAX_GRENADES;
  }

  pickup.active = false;
  pickup.timer = pickupDefinitions[pickup.type].respawn;

  if (actor === player) {
    ui.status.textContent = `Podniesiono: ${pickupDefinitions[pickup.type].label}`;
  }

  stampCraterDecor(pickup.x, pickup.y, 12);
}

function updatePickups(dt) {
  for (const pickup of pickups) {
    if (!pickup.active) {
      pickup.timer -= dt;
      if (pickup.timer <= 0) {
        pickup.active = true;
        pickup.y = findSpawnY(pickup.x) - 18;
      }
      continue;
    }

    for (const actor of allActors()) {
      if (actor.deadTimer > 0) {
        continue;
      }

      const dist = Math.hypot(actor.x - pickup.x, actor.y - pickup.y);
      if (dist > actor.radius + 16) {
        continue;
      }

      if (pickup.type === "medkit" && actor.hp >= actor.maxHp - 1) {
        continue;
      }

      if (pickup.type === "ammo" && actor.ammo >= getWeaponStats(actor).ammo) {
        continue;
      }

      if (pickup.type === "grenades" && actor.grenades >= MAX_GRENADES) {
        continue;
      }

      applyPickup(actor, pickup);
      break;
    }
  }
}

function fireProjectile(actor, weapon) {
  const baseAim = normalize(actor.aimX, actor.aimY, actor.facing, 0);
  const muzzleX = actor.x + baseAim.x * 24;
  const muzzleY = actor.y + baseAim.y * 24;

  for (let pellet = 0; pellet < weapon.pellets; pellet += 1) {
    const spread = (Math.random() - 0.5) * weapon.spread;
    const cos = Math.cos(spread);
    const sin = Math.sin(spread);
    const aimX = baseAim.x * cos - baseAim.y * sin;
    const aimY = baseAim.x * sin + baseAim.y * cos;

    bullets.push({
      x: muzzleX,
      y: muzzleY,
      vx: aimX * weapon.bulletSpeed + actor.vx * 0.25,
      vy: aimY * weapon.bulletSpeed + actor.vy * 0.1,
      life: actor.weapon === "shotgun" ? 0.45 : 1.1,
      owner: actor,
      damage: weapon.damage,
      terrainRadius: weapon.terrainRadius,
    });
  }

  actor.vx -= baseAim.x * weapon.recoilX;
  const verticalRecoil = baseAim.y < 0 ? weapon.recoilYUp : weapon.recoilYDown;
  actor.vy -= baseAim.y * verticalRecoil;
  actor.vy = clamp(actor.vy, -720, 980);
  actor.ammo -= 1;

  sparks.push({
    x: muzzleX,
    y: muzzleY,
    vx: baseAim.x * 120,
    vy: baseAim.y * 120,
    life: 0.08,
    size: 4 * weapon.flashSize,
    color: "#fff7bd",
  });

  smoke.push({
    x: muzzleX,
    y: muzzleY,
    vx: baseAim.x * 45 + rand(-10, 10),
    vy: baseAim.y * 45 - rand(10, 35),
    life: 0.22,
    maxLife: 0.22,
    size: 10 * weapon.flashSize,
    growth: 26,
    color: "255,235,178",
  });
}

function updateBullets(dt) {
  bullets = bullets.filter((bullet) => {
    bullet.life -= dt;
    if (bullet.life <= 0) {
      return false;
    }

    const prevX = bullet.x;
    const prevY = bullet.y;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;

    const hitTerrain = lineHitsTerrain(prevX, prevY, bullet.x, bullet.y);
    if (hitTerrain) {
      impactTerrain(hitTerrain.x, hitTerrain.y, bullet.terrainRadius ?? 8);
      return false;
    }

    for (const actor of allActors()) {
      if (actor === bullet.owner || actor.deadTimer > 0) {
        continue;
      }
      const dist = length(actor.x - bullet.x, actor.y - bullet.y);
      if (dist < actor.radius + 3) {
        actor.vx += bullet.vx * 0.04;
        actor.vy += bullet.vy * 0.02;
        damageActor(actor, bullet.damage, bullet.owner);
        stampCraterDecor(bullet.x, bullet.y, 9);
        return false;
      }
    }

    return bullet.x > -50 && bullet.x < WORLD_WIDTH + 50 && bullet.y > -50 && bullet.y < WORLD_HEIGHT + 50;
  });
}

function updateGrenades(dt) {
  grenades = grenades.filter((grenade) => {
    grenade.life -= dt;
    grenade.vy += GRAVITY * dt;
    grenade.x += grenade.vx * dt;
    grenade.y += grenade.vy * dt;

    if (terrainSolid(grenade.x, grenade.y + 6)) {
      grenade.y -= 4;
      grenade.vy *= -0.42;
      grenade.vx *= 0.82;
    }

    if (terrainSolid(grenade.x + 6, grenade.y) || terrainSolid(grenade.x - 6, grenade.y)) {
      grenade.vx *= -0.62;
    }

    if (grenade.life <= 0) {
      explode(grenade.x, grenade.y, 54, 90, grenade.owner);
      return false;
    }

    return grenade.x > -80 && grenade.x < WORLD_WIDTH + 80 && grenade.y < WORLD_HEIGHT + 80;
  });
}

function updateCorpses(dt) {
  corpses = corpses.filter((corpse) => {
    corpse.life -= dt;
    corpse.vy += GRAVITY * dt;
    corpse.x += corpse.vx * dt;
    corpse.y += corpse.vy * dt;
    corpse.angle += corpse.angularVelocity * dt;
    corpse.angularVelocity *= Math.pow(0.35, dt);

    if (terrainSolid(corpse.x, corpse.y + 10)) {
      corpse.y -= 3;
      corpse.vy *= -0.18;
      corpse.vx *= 0.82;
      corpse.angularVelocity *= 0.6;
    }

    if (terrainSolid(corpse.x + 10, corpse.y) || terrainSolid(corpse.x - 10, corpse.y)) {
      corpse.vx *= -0.24;
    }

    return corpse.life > 0;
  });
}

function updateEffects(dt) {
  explosions = explosions.filter((effect) => {
    effect.life -= dt;
    return effect.life > 0;
  });

  sparks = sparks.filter((spark) => {
    spark.life -= dt;
    spark.x += spark.vx * dt;
    spark.y += spark.vy * dt;
    spark.vx *= Math.pow(0.2, dt);
    spark.vy += 640 * dt;
    return spark.life > 0;
  });

  smoke = smoke.filter((puff) => {
    puff.life -= dt;
    puff.x += puff.vx * dt;
    puff.y += puff.vy * dt;
    puff.vx *= Math.pow(0.08, dt);
    puff.vy -= 16 * dt;
    puff.size += puff.growth * dt;
    return puff.life > 0;
  });

  screenShake = Math.max(0, screenShake - dt * 24);
}

function drawPickups(targetCtx) {
  for (const pickup of pickups) {
    if (!pickup.active) {
      continue;
    }

    const def = pickupDefinitions[pickup.type];
    const screenX = pickup.x - cameraX;
    const screenY = pickup.y - cameraY;
    const bob = Math.sin(performance.now() * 0.004 + pickup.id) * 4;

    targetCtx.globalAlpha = 0.22;
    targetCtx.fillStyle = def.color;
    targetCtx.beginPath();
    targetCtx.ellipse(screenX, screenY + 8, 16, 8, 0, 0, Math.PI * 2);
    targetCtx.fill();
    targetCtx.globalAlpha = 1;

    targetCtx.fillStyle = def.color;
    targetCtx.strokeStyle = "#0f1419";
    targetCtx.lineWidth = 2;
    targetCtx.beginPath();
    targetCtx.roundRect(screenX - 13, screenY - 12 + bob, 26, 20, 6);
    targetCtx.fill();
    targetCtx.stroke();

    targetCtx.fillStyle = def.accent;
    if (pickup.type === "medkit") {
      targetCtx.fillRect(screenX - 3, screenY - 8 + bob, 6, 12);
      targetCtx.fillRect(screenX - 8, screenY - 3 + bob, 16, 6);
    } else if (pickup.type === "ammo") {
      targetCtx.fillRect(screenX - 7, screenY - 7 + bob, 5, 10);
      targetCtx.fillRect(screenX + 2, screenY - 7 + bob, 5, 10);
    } else if (pickup.type === "grenades") {
      targetCtx.beginPath();
      targetCtx.arc(screenX - 4, screenY - 1 + bob, 4, 0, Math.PI * 2);
      targetCtx.arc(screenX + 4, screenY - 1 + bob, 4, 0, Math.PI * 2);
      targetCtx.fill();
      targetCtx.fillRect(screenX - 5, screenY - 8 + bob, 10, 3);
    }
  }
}

function drawBackground(targetCtx) {
  const sky = targetCtx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, "#7ca3c5");
  sky.addColorStop(0.48, "#314d68");
  sky.addColorStop(1, "#162636");
  targetCtx.fillStyle = sky;
  targetCtx.fillRect(0, 0, canvas.width, canvas.height);

  const verticalParallax = cameraY * 0.18;
  for (let i = 0; i < 5; i += 1) {
    const offset = (cameraX * (0.12 + i * 0.06)) % (canvas.width + 400);
    const ridgeLift = verticalParallax * (0.55 + i * 0.08);
    targetCtx.fillStyle = `rgba(18, 24, 34, ${0.12 + i * 0.045})`;
    targetCtx.beginPath();
    targetCtx.moveTo(-300 - offset, canvas.height);
    targetCtx.lineTo(100 - offset, 320 - i * 18 - ridgeLift);
    targetCtx.lineTo(340 - offset, canvas.height);
    targetCtx.fill();
    targetCtx.beginPath();
    targetCtx.moveTo(250 - offset, canvas.height);
    targetCtx.lineTo(650 - offset, 360 - i * 24 - ridgeLift);
    targetCtx.lineTo(980 - offset, canvas.height);
    targetCtx.fill();
  }
}

function drawTerrain(targetCtx) {
  targetCtx.drawImage(
    terrainCanvas,
    cameraX,
    cameraY,
    canvas.width,
    canvas.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
}

function drawActor(targetCtx, actor) {
  if (actor.deadTimer > 0) {
    return;
  }

  const screenX = actor.x - cameraX;
  const screenY = actor.y - cameraY;
  const aim = normalize(actor.aimX, actor.aimY, actor.facing, 0);
  const moveCycle = performance.now() * 0.014 + actor.x * 0.03;
  const runAmount = clamp(Math.abs(actor.vx) / 240, 0, 1);
  const airborne = actor.onGround ? 0 : 1;
  const bodyLean = clamp(actor.vx / 300, -0.2, 0.2) + aim.x * 0.04;
  const torsoX = screenX - aim.x * 1.5;
  const torsoY = screenY + 1;
  const shoulderX = torsoX + aim.x * 5;
  const shoulderY = torsoY - 8;
  const hipX = torsoX - aim.x * 1.5;
  const hipY = torsoY + 8;
  const headX = torsoX + aim.x * 3;
  const headY = torsoY - 16;
  const gunBaseX = shoulderX + aim.x * 7;
  const gunBaseY = shoulderY + aim.y * 7;
  const gunTipX = gunBaseX + aim.x * 30;
  const gunTipY = gunBaseY + aim.y * 30;
  const armBendX = shoulderX + aim.x * 6 - aim.y * 3;
  const armBendY = shoulderY + aim.y * 6 + aim.x * 3;
  const stepSwing = Math.sin(moveCycle) * 8 * runAmount;
  const oppositeSwing = Math.sin(moveCycle + Math.PI) * 8 * runAmount;
  const kneeLift = airborne ? -5 : 0;
  const trailAlpha = clamp((Math.abs(actor.vx) + Math.abs(actor.vy) * 0.35) / 420, 0, 0.22);

  if (actor.grapple) {
    targetCtx.strokeStyle = "rgba(224, 234, 246, 0.8)";
    targetCtx.lineWidth = 2;
    targetCtx.beginPath();
    targetCtx.moveTo(shoulderX, shoulderY);
    targetCtx.lineTo(actor.grapple.x - cameraX, actor.grapple.y - cameraY);
    targetCtx.stroke();
  }

  if (trailAlpha > 0.02) {
    targetCtx.globalAlpha = trailAlpha;
    targetCtx.strokeStyle = actor.color;
    targetCtx.lineWidth = 9;
    targetCtx.lineCap = "round";
    targetCtx.beginPath();
    targetCtx.moveTo(hipX - actor.vx * 0.02, hipY - actor.vy * 0.012);
    targetCtx.lineTo(shoulderX - actor.vx * 0.02, shoulderY - actor.vy * 0.012);
    targetCtx.stroke();
    targetCtx.globalAlpha = 1;
  }

  targetCtx.save();
  targetCtx.translate(torsoX, torsoY);
  targetCtx.rotate(bodyLean);

  targetCtx.strokeStyle = "rgba(0,0,0,0.42)";
  targetCtx.lineCap = "round";

  targetCtx.lineWidth = 4;
  targetCtx.beginPath();
  targetCtx.moveTo(-1, 7);
  targetCtx.lineTo(-7, 18 + stepSwing * 0.28 + kneeLift);
  targetCtx.lineTo(-11, 27 + Math.abs(stepSwing) * 0.16 + kneeLift);
  targetCtx.moveTo(1, 7);
  targetCtx.lineTo(8, 18 + oppositeSwing * 0.28 + kneeLift);
  targetCtx.lineTo(11, 27 + Math.abs(oppositeSwing) * 0.16 + kneeLift);
  targetCtx.stroke();

  targetCtx.lineWidth = 6;
  targetCtx.beginPath();
  targetCtx.moveTo(0, -8);
  targetCtx.lineTo(0, 9);
  targetCtx.stroke();

  targetCtx.strokeStyle = actor === player ? "#5d6f62" : "#65786b";
  targetCtx.lineWidth = 4;
  targetCtx.beginPath();
  targetCtx.moveTo(-1, 7);
  targetCtx.lineTo(-7, 18 + stepSwing * 0.28 + kneeLift);
  targetCtx.lineTo(-11, 27 + Math.abs(stepSwing) * 0.16 + kneeLift);
  targetCtx.moveTo(1, 7);
  targetCtx.lineTo(8, 18 + oppositeSwing * 0.28 + kneeLift);
  targetCtx.lineTo(11, 27 + Math.abs(oppositeSwing) * 0.16 + kneeLift);
  targetCtx.stroke();

  targetCtx.strokeStyle = actor === player ? "#5b6c5f" : "#6f8674";
  targetCtx.lineWidth = 5;
  targetCtx.beginPath();
  targetCtx.moveTo(0, -8);
  targetCtx.lineTo(0, 9);
  targetCtx.stroke();

  targetCtx.restore();

  targetCtx.strokeStyle = "#10151b";
  targetCtx.lineWidth = 5;
  targetCtx.lineCap = "round";
  targetCtx.beginPath();
  targetCtx.moveTo(shoulderX, shoulderY);
  targetCtx.lineTo(armBendX, armBendY);
  targetCtx.lineTo(gunBaseX, gunBaseY);
  targetCtx.moveTo(shoulderX - aim.y * 3, shoulderY + aim.x * 3);
  targetCtx.lineTo(gunBaseX - aim.x * 6 + aim.y * 6, gunBaseY - aim.y * 6 - aim.x * 6);
  targetCtx.stroke();

  targetCtx.strokeStyle = actor.accent;
  targetCtx.lineWidth = 2.6;
  targetCtx.beginPath();
  targetCtx.moveTo(shoulderX, shoulderY);
  targetCtx.lineTo(armBendX, armBendY);
  targetCtx.lineTo(gunBaseX, gunBaseY);
  targetCtx.moveTo(shoulderX - aim.y * 3, shoulderY + aim.x * 3);
  targetCtx.lineTo(gunBaseX - aim.x * 6 + aim.y * 6, gunBaseY - aim.y * 6 - aim.x * 6);
  targetCtx.stroke();

  targetCtx.save();
  targetCtx.translate(headX, headY);
  targetCtx.rotate(clamp(aim.x * 0.06 + bodyLean * 0.45, -0.16, 0.16));

  targetCtx.fillStyle = "#d4b08a";
  targetCtx.beginPath();
  targetCtx.ellipse(0, 0, 6.2, 7.8, 0, 0, Math.PI * 2);
  targetCtx.fill();

  targetCtx.fillStyle = actor === player ? "#5d7266" : "#72866b";
  targetCtx.beginPath();
  targetCtx.moveTo(-8, -1);
  targetCtx.quadraticCurveTo(-2, -10, 7, -4);
  targetCtx.lineTo(7, -1);
  targetCtx.quadraticCurveTo(1, -4, -8, -1);
  targetCtx.fill();

  targetCtx.fillStyle = "#1b2026";
  targetCtx.beginPath();
  targetCtx.ellipse(1.8 * actor.facing, 0.6, 4.4, 2.6, aim.y * 0.18, 0, Math.PI * 2);
  targetCtx.fill();

  targetCtx.strokeStyle = "rgba(255,255,255,0.1)";
  targetCtx.lineWidth = 1;
  targetCtx.beginPath();
  targetCtx.moveTo(-5, -3);
  targetCtx.lineTo(1, -5);
  targetCtx.stroke();
  targetCtx.restore();

  targetCtx.strokeStyle = "#0d1116";
  targetCtx.lineWidth = 6;
  targetCtx.lineCap = "round";
  targetCtx.beginPath();
  targetCtx.moveTo(gunBaseX - aim.x * 3, gunBaseY - aim.y * 3);
  targetCtx.lineTo(gunTipX, gunTipY);
  targetCtx.stroke();

  targetCtx.strokeStyle = "#5d6670";
  targetCtx.lineWidth = 3.8;
  targetCtx.beginPath();
  targetCtx.moveTo(gunBaseX - aim.x * 3, gunBaseY - aim.y * 3);
  targetCtx.lineTo(gunTipX, gunTipY);
  targetCtx.stroke();

  targetCtx.strokeStyle = "#7d6141";
  targetCtx.lineWidth = 3;
  targetCtx.beginPath();
  targetCtx.moveTo(gunBaseX - aim.x * 6 - aim.y * 3, gunBaseY - aim.y * 6 + aim.x * 3);
  targetCtx.lineTo(gunBaseX - aim.x * 1 - aim.y * 1, gunBaseY - aim.y * 1 + aim.x * 1);
  targetCtx.stroke();

  targetCtx.fillStyle = "rgba(0,0,0,0.45)";
  targetCtx.fillRect(screenX - 18, screenY - 48, 36, 6);
  targetCtx.fillStyle = actor === player ? "#ff7d58" : "#8ef16f";
  targetCtx.fillRect(screenX - 18, screenY - 48, 36 * (actor.hp / actor.maxHp), 6);

  if (actor.reload > 0.02 && actor.reload < 0.09) {
    targetCtx.globalAlpha = 0.85;
    targetCtx.fillStyle = "#ffe7a8";
    targetCtx.beginPath();
    targetCtx.arc(gunTipX + aim.x * 8, gunTipY + aim.y * 8, 8 + Math.random() * 4, 0, Math.PI * 2);
    targetCtx.fill();
    targetCtx.globalAlpha = 1;
  }
}

function drawCorpse(targetCtx, corpse) {
  const screenX = corpse.x - cameraX;
  const screenY = corpse.y - cameraY;
  const alpha = clamp(corpse.life / 2.4, 0, 1);

  targetCtx.save();
  targetCtx.globalAlpha = alpha;
  targetCtx.translate(screenX, screenY);
  targetCtx.rotate(corpse.angle);

  targetCtx.strokeStyle = "rgba(0,0,0,0.38)";
  targetCtx.lineCap = "round";
  targetCtx.lineWidth = 4;
  targetCtx.beginPath();
  targetCtx.moveTo(-2, 7);
  targetCtx.lineTo(-9, 20);
  targetCtx.lineTo(-11, 28);
  targetCtx.moveTo(1, 7);
  targetCtx.lineTo(7, 18);
  targetCtx.lineTo(10, 27);
  targetCtx.moveTo(0, -8);
  targetCtx.lineTo(0, 9);
  targetCtx.stroke();

  targetCtx.strokeStyle = corpse.color;
  targetCtx.lineWidth = 4;
  targetCtx.beginPath();
  targetCtx.moveTo(-2, 7);
  targetCtx.lineTo(-9, 20);
  targetCtx.lineTo(-11, 28);
  targetCtx.moveTo(1, 7);
  targetCtx.lineTo(7, 18);
  targetCtx.lineTo(10, 27);
  targetCtx.moveTo(0, -8);
  targetCtx.lineTo(0, 9);
  targetCtx.stroke();

  targetCtx.fillStyle = "#d4b08a";
  targetCtx.beginPath();
  targetCtx.ellipse(1, -16, 6, 7.4, 0, 0, Math.PI * 2);
  targetCtx.fill();
  targetCtx.fillStyle = "#1b2026";
  targetCtx.beginPath();
  targetCtx.ellipse(2, -15.5, 4.2, 2.4, 0, 0, Math.PI * 2);
  targetCtx.fill();
  targetCtx.restore();
}

function drawProjectiles(targetCtx) {
  targetCtx.fillStyle = "#ffe993";
  for (const bullet of bullets) {
    targetCtx.globalAlpha = 0.34;
    targetCtx.beginPath();
    targetCtx.arc(bullet.x - cameraX - bullet.vx * 0.008, bullet.y - cameraY - bullet.vy * 0.008, 4.6, 0, Math.PI * 2);
    targetCtx.fill();
    targetCtx.globalAlpha = 1;
    targetCtx.beginPath();
    targetCtx.arc(bullet.x - cameraX, bullet.y - cameraY, 2.3, 0, Math.PI * 2);
    targetCtx.fill();
  }

  for (const grenade of grenades) {
    targetCtx.fillStyle = "#a8d8a0";
    targetCtx.beginPath();
    targetCtx.arc(grenade.x - cameraX, grenade.y - cameraY, 7, 0, Math.PI * 2);
    targetCtx.fill();
    targetCtx.fillStyle = "#d3f6cf";
    targetCtx.fillRect(grenade.x - cameraX - 2, grenade.y - cameraY - 9, 4, 4);
  }
}

function drawEffects(targetCtx) {
  for (const spark of sparks) {
    targetCtx.fillStyle = spark.color;
    targetCtx.globalAlpha = clamp(spark.life * 2, 0, 1);
    targetCtx.beginPath();
    targetCtx.arc(spark.x - cameraX, spark.y - cameraY, spark.size, 0, Math.PI * 2);
    targetCtx.fill();
    targetCtx.globalAlpha = 1;
  }

  for (const puff of smoke) {
    const alpha = clamp(puff.life / puff.maxLife, 0, 1);
    const gradient = targetCtx.createRadialGradient(
      puff.x - cameraX,
      puff.y - cameraY,
      puff.size * 0.1,
      puff.x - cameraX,
      puff.y - cameraY,
      puff.size,
    );
    gradient.addColorStop(0, `rgba(${puff.color}, ${alpha * 0.32})`);
    gradient.addColorStop(0.55, `rgba(${puff.color}, ${alpha * 0.18})`);
    gradient.addColorStop(1, `rgba(${puff.color}, 0)`);
    targetCtx.fillStyle = gradient;
    targetCtx.beginPath();
    targetCtx.arc(puff.x - cameraX, puff.y - cameraY, puff.size, 0, Math.PI * 2);
    targetCtx.fill();
  }

  for (const effect of explosions) {
    const t = effect.life / 0.45;
    targetCtx.globalAlpha = t * 0.7;
    targetCtx.fillStyle = "#ffc86d";
    targetCtx.beginPath();
    targetCtx.arc(effect.x - cameraX, effect.y - cameraY, effect.radius * (1.5 - t), 0, Math.PI * 2);
    targetCtx.fill();
    targetCtx.globalAlpha = t * 0.48;
    targetCtx.fillStyle = "#ff6a3d";
    targetCtx.beginPath();
    targetCtx.arc(effect.x - cameraX, effect.y - cameraY, effect.radius * (0.78 - t * 0.2), 0, Math.PI * 2);
    targetCtx.fill();
    targetCtx.globalAlpha = 1;
  }
}

function drawHudOverlay(targetCtx) {
  targetCtx.fillStyle = "rgba(255,255,255,0.08)";
  targetCtx.beginPath();
  targetCtx.arc(mouse.x, mouse.y, 12, 0, Math.PI * 2);
  targetCtx.fill();
  targetCtx.strokeStyle = "rgba(255,255,255,0.9)";
  targetCtx.lineWidth = 2;
  targetCtx.beginPath();
  targetCtx.moveTo(mouse.x - 16, mouse.y);
  targetCtx.lineTo(mouse.x + 16, mouse.y);
  targetCtx.moveTo(mouse.x, mouse.y - 16);
  targetCtx.lineTo(mouse.x, mouse.y + 16);
  targetCtx.stroke();
}

function compositeScene() {
  const shakeX = rand(-screenShake, screenShake);
  const shakeY = rand(-screenShake, screenShake);
  const cameraDx = cameraX - previousCameraX;
  const cameraDy = cameraY - previousCameraY;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 0.24;
  ctx.filter = "blur(3px)";
  ctx.drawImage(sceneCanvas, -cameraDx * 0.18 + shakeX * 0.18, -cameraDy * 0.18 + shakeY * 0.18, canvas.width, canvas.height);
  ctx.filter = "none";
  ctx.globalAlpha = 1;
  ctx.drawImage(sceneCanvas, shakeX, shakeY, canvas.width, canvas.height);
  if (screenShake > 0.1) {
    ctx.fillStyle = `rgba(255, 244, 220, ${Math.min(0.09, screenShake * 0.0035)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  previousCameraX = cameraX;
  previousCameraY = cameraY;
}

let dtGlobal = 1 / 60;

function updateUi() {
  ui.hp.textContent = Math.max(0, Math.round(player.hp));
  ui.weapon.textContent = getWeaponStats(player).label;
  ui.ammo.textContent = player.ammo;
  ui.grenade.textContent = player.grenades;
  ui.kills.textContent = player.kills;
}

function gameLoop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.033);
  dtGlobal = dt;
  lastTime = now;

  updatePlayer(dt);
  updateBots(dt);
  updateQueuedShots(dt);
  updateBullets(dt);
  updateGrenades(dt);
  updatePickups(dt);
  updateCorpses(dt);
  updateEffects(dt);

  cameraX += (clamp(player.x - canvas.width * 0.4, 0, WORLD_WIDTH - canvas.width) - cameraX) * Math.min(1, dt * 6);
  cameraY += (clamp(player.y - canvas.height * 0.55, 0, WORLD_HEIGHT - canvas.height) - cameraY) * Math.min(1, dt * 6);

  drawBackground(sceneCtx);
  drawTerrain(sceneCtx);
  drawPickups(sceneCtx);
  drawProjectiles(sceneCtx);
  for (const corpse of corpses) {
    drawCorpse(sceneCtx, corpse);
  }
  for (const actor of allActors()) {
    drawActor(sceneCtx, actor);
  }
  drawEffects(sceneCtx);
  drawHudOverlay(sceneCtx);
  compositeScene();
  updateUi();

  requestAnimationFrame(gameLoop);
}

window.addEventListener("keydown", (event) => {
  keys.add(event.code);
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
    event.preventDefault();
  }

  if (event.code === "KeyG") {
    throwGrenade(player);
  }

  if (event.code === "Digit1") {
    switchWeapon(player, weaponOrder[0]);
  }

  if (event.code === "Digit2") {
    switchWeapon(player, weaponOrder[1]);
  }

  if (event.code === "Digit3") {
    switchWeapon(player, weaponOrder[2]);
  }

  if (event.code === "Digit4") {
    switchWeapon(player, weaponOrder[3]);
  }

  if (event.code === "KeyR") {
    respawnActor(player);
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

canvas.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  mouse.y = ((event.clientY - rect.top) / rect.height) * canvas.height;
});

canvas.addEventListener("mousedown", (event) => {
  if (event.button === 0) {
    mouse.down = true;
  }
  if (event.button === 2) {
    mouse.rightDown = true;
  }
});

window.addEventListener("mouseup", (event) => {
  if (event.button === 0) {
    mouse.down = false;
  }
  if (event.button === 2) {
    mouse.rightDown = false;
  }
});

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

createTerrain();
spawnBots();
rebuildPickups();
respawnActor(player);
bots.forEach(respawnActor);
ui.status.textContent = "Arena gotowa. LPM strzal, PPM hak.";
ui.botCountInput.value = String(desiredBotCount);
ui.botCountValue.textContent = String(desiredBotCount);
ui.botCountInput.addEventListener("input", (event) => {
  setBotCount(event.target.value);
});
requestAnimationFrame(gameLoop);
