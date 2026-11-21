import * as THREE from 'three';

export function randomGenerator(seed = 42) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ *
 *  Procedural, tileable noise
 * ------------------------------------------------------------------ */

const smoothStep = t => t * t * (3 - 2 * t);

function periodicNoise(size, frequency, seed) {
  const rng = randomGenerator(seed);
  const lattice = new Float32Array(frequency * frequency);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng();
  const out = new Float32Array(size * size);
  const scale = frequency / size;
  for (let y = 0; y < size; y++) {
    const fy = y * scale;
    const y0 = Math.floor(fy);
    const ty = smoothStep(fy - y0);
    const ya = ((y0 % frequency) + frequency) % frequency;
    const yb = (ya + 1) % frequency;
    for (let x = 0; x < size; x++) {
      const fx = x * scale;
      const x0 = Math.floor(fx);
      const tx = smoothStep(fx - x0);
      const xa = ((x0 % frequency) + frequency) % frequency;
      const xb = (xa + 1) % frequency;
      const top = lattice[ya * frequency + xa] * (1 - tx) + lattice[ya * frequency + xb] * tx;
      const bottom = lattice[yb * frequency + xa] * (1 - tx) + lattice[yb * frequency + xb] * tx;
      out[y * size + x] = top * (1 - ty) + bottom * ty;
    }
  }
  return out;
}

function fbm(size, octaves, baseFrequency, seed) {
  const out = new Float32Array(size * size);
  let amplitude = 1, total = 0;
  for (let octave = 0; octave < octaves; octave++) {
    const noise = periodicNoise(size, baseFrequency * (2 ** octave), seed + octave * 131);
    for (let i = 0; i < out.length; i++) out[i] += noise[i] * amplitude;
    total += amplitude;
    amplitude *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/* ------------------------------------------------------------------ *
 *  Canvas helpers
 * ------------------------------------------------------------------ */

function canvasOf(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  return canvas;
}

function paint(size, painter) {
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const data = image.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = painter(x, y);
      const o = (y * size + x) * 4;
      data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = c[3] ?? 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function drawCanvas(size, draw) {
  const canvas = canvasOf(size);
  draw(canvas.getContext('2d'), size, canvas);
  return canvas;
}

function heightFromCanvas(canvas, size) {
  const data = canvas.getContext('2d').getImageData(0, 0, size, size).data;
  const height = new Float32Array(size * size);
  for (let i = 0; i < height.length; i++) height[i] = data[i * 4] / 255;
  return height;
}

function normalCanvas(height, size, strength = 2) {
  return paint(size, (x, y) => {
    const left = height[y * size + ((x - 1 + size) % size)];
    const right = height[y * size + ((x + 1) % size)];
    const up = height[((y - 1 + size) % size) * size + x];
    const down = height[((y + 1) % size) * size + x];
    const nx = (left - right) * strength;
    const ny = (up - down) * strength;
    const inverse = 1 / Math.hypot(nx, ny, 1);
    return [(nx * inverse * 0.5 + 0.5) * 255, (ny * inverse * 0.5 + 0.5) * 255, (inverse * 0.5 + 0.5) * 255];
  });
}

function roughnessCanvas(values, size) {
  return paint(size, (x, y) => {
    const v = THREE.MathUtils.clamp(values[y * size + x], 0, 1) * 255;
    return [v, v, v];
  });
}

function texture(canvas, { srgb = false, repeat = 1 } = {}) {
  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeat, repeat);
  map.anisotropy = 8;
  if (srgb) map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

function rgb(r, g, b) { return [r, g, b]; }
const mix = (a, b, t) => a + (b - a) * t;
const clampByte = v => v < 0 ? 0 : v > 255 ? 255 : v;

/* ------------------------------------------------------------------ *
 *  Material map set: albedo + normal + roughness
 * ------------------------------------------------------------------ */

function material({ map, normal, rough, meters, color = '#ffffff', roughness = 1, metalness = 0, normalScale = 1, opacity = 1, extra = {} }) {
  const mat = new THREE.MeshStandardMaterial({
    map, normalMap: normal, roughnessMap: rough,
    color, roughness, metalness,
    normalScale: new THREE.Vector2(normalScale, normalScale),
    envMapIntensity: extra.envMapIntensity ?? 0.75,
    ...extra,
  });
  mat.userData.uvMeters = meters;
  return mat;
}

function surface(size, meters, albedoFn, heightFn, roughFn, strength = 2) {
  const albedo = paint(size, albedoFn);
  const heightCanvas = drawCanvas(size, heightFn);
  const height = heightFromCanvas(heightCanvas, size);
  const roughValues = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) roughValues[y * size + x] = roughFn(x, y);
  return {
    map: texture(albedo, { srgb: true }),
    normal: texture(normalCanvas(height, size, strength)),
    rough: texture(roughnessCanvas(roughValues, size)),
    meters,
  };
}

export function createMaterials() {
  /* ---------------- plaster (whitewashed wall) ---------------- */
  const plasterSize = 512;
  const plasterNoise = fbm(plasterSize, 5, 3, 11);
  const plasterFine = fbm(plasterSize, 3, 28, 12);
  const plaster = surface(
    plasterSize, 3.2,
    (x, y) => {
      const i = y * plasterSize + x;
      const mottle = (plasterNoise[i] - 0.5) * 26 + (plasterFine[i] - 0.5) * 12;
      // faint vertical rain-wash marks and lime bloom
      const streak = Math.sin((x / plasterSize) * Math.PI * 2 * 7 + plasterNoise[i] * 4) * 3;
      const v = 224 + mottle + streak;
      return rgb(clampByte(v + 4), clampByte(v + 2), clampByte(v - 9));
    },
    (ctx, s) => {
      const img = ctx.createImageData(s, s);
      for (let i = 0; i < s * s; i++) {
        const v = 150 + (plasterNoise[i] - 0.5) * 46 + (plasterFine[i] - 0.5) * 60;
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    },
    (x, y) => 0.86 + (plasterFine[y * plasterSize + x] - 0.5) * 0.1,
    1.1,
  );

  /* ---------------- brick base (grey blue kiln brick) ---------------- */
  const brickSize = 512;
  const brickRng = randomGenerator(404);
  const brickCanvas = drawCanvas(brickSize, (ctx, s) => {
    ctx.fillStyle = '#8f8e85';
    ctx.fillRect(0, 0, s, s);
    const courses = 8, brickW = s / 3.6;
    const rowH = s / courses;
    for (let row = 0; row < courses; row++) {
      const offset = (row % 2) * brickW * 0.5;
      for (let col = -1; col < 4; col++) {
        const x = col * brickW + offset;
        const v = 108 + brickRng() * 34;
        const warm = brickRng() * 8;
        ctx.fillStyle = `rgb(${v + warm},${v + warm - 1},${v - 4})`;
        ctx.fillRect(x + 2.5, row * rowH + 2.5, brickW - 5, rowH - 5);
        // subtle wear along the brick face
        for (let k = 0; k < 14; k++) {
          ctx.fillStyle = `rgba(40,44,42,${brickRng() * 0.09})`;
          ctx.fillRect(x + brickRng() * brickW, row * rowH + brickRng() * rowH, 2 + brickRng() * 14, 1);
        }
        ctx.fillStyle = 'rgba(255,255,248,.09)';
        ctx.fillRect(x + 4, row * rowH + 4, brickW - 8, 1.4);
      }
    }
  });
  const brickHeight = drawCanvas(brickSize, (ctx, s) => {
    ctx.fillStyle = '#5a5a5a';
    ctx.fillRect(0, 0, s, s);
    const courses = 8, brickW = s / 3.6, rowH = s / courses;
    for (let row = 0; row < courses; row++) {
      const offset = (row % 2) * brickW * 0.5;
      for (let col = -1; col < 4; col++) {
        const x = col * brickW + offset;
        ctx.fillStyle = `rgb(${196 + brickRng() * 30},0,0)`;
        ctx.fillRect(x + 3, row * rowH + 3, brickW - 6, rowH - 6);
      }
    }
  });
  const brickData = heightFromCanvas(brickHeight, brickSize);
  const brickRough = new Float32Array(brickSize * brickSize);
  for (let i = 0; i < brickRough.length; i++) brickRough[i] = 0.9 + (brickRng() - 0.5) * 0.07;
  const brick = {
    map: texture(brickCanvas, { srgb: true }),
    normal: texture(normalCanvas(brickData, brickSize, 3.4)),
    rough: texture(roughnessCanvas(brickRough, brickSize)),
    meters: 0.9,
  };

  /* ---------------- roof tile surface ---------------- */
  const tileSize = 512;
  const tileNoise = fbm(tileSize, 5, 4, 21);
  const tileRng = randomGenerator(22);
  const tileCanvas = drawCanvas(tileSize, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let i = 0; i < s * s; i++) {
      const n = tileNoise[i];
      const dirt = Math.max(0, n - 0.55) * 60;
      const v = 98 + (n - 0.5) * 38 - dirt;
      img.data[i * 4] = v * 0.98;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v * 0.94;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // soot streaks and a little moss in the valleys
    for (let i = 0; i < 220; i++) {
      ctx.fillStyle = `rgba(30,32,28,${0.04 + tileRng() * 0.07})`;
      ctx.fillRect(tileRng() * s, tileRng() * s, 1 + tileRng() * 3, 8 + tileRng() * 60);
    }
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = `rgba(84,92,58,${0.05 + tileRng() * 0.07})`;
      ctx.beginPath();
      ctx.arc(tileRng() * s, tileRng() * s, 3 + tileRng() * 12, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  const tileHeight = new Float32Array(tileSize * tileSize);
  for (let i = 0; i < tileHeight.length; i++) tileHeight[i] = tileNoise[i] * 0.5;
  const tileRough = new Float32Array(tileSize * tileSize);
  for (let i = 0; i < tileRough.length; i++) tileRough[i] = 0.78 + tileNoise[i] * 0.18;
  const tile = {
    map: texture(tileCanvas, { srgb: true }),
    normal: texture(normalCanvas(tileHeight, tileSize, 1.6)),
    rough: texture(roughnessCanvas(tileRough, tileSize)),
    meters: 1,
  };

  /* ---------------- timber (gate, pergola, furniture) ---------------- */
  const woodSize = 512;
  const woodRng = randomGenerator(77);
  const woodCanvas = drawCanvas(woodSize, (ctx, s) => {
    ctx.fillStyle = '#a07749';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 280; i++) {
      const x = woodRng() * s;
      const dark = woodRng() > 0.48;
      ctx.strokeStyle = dark
        ? `rgba(52,33,18,${0.04 + woodRng() * 0.13})`
        : `rgba(238,199,148,${0.04 + woodRng() * 0.12})`;
      ctx.lineWidth = 0.6 + woodRng() * 2.2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      for (let y = 0; y <= s; y += 16) {
        ctx.lineTo(x + Math.sin(y * 0.014 + i * 0.7) * (1.5 + woodRng() * 3.5), y);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 9; i++) {
      const x = woodRng() * s, y = woodRng() * s;
      ctx.strokeStyle = 'rgba(38,23,12,.3)';
      ctx.lineWidth = 1.2;
      for (let r = 2; r < 9; r += 1.6) {
        ctx.beginPath();
        ctx.ellipse(x, y, r * 1.9, r * 3.4, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  });
  const woodHeight = drawCanvas(woodSize, (ctx, s) => {
    ctx.fillStyle = '#888';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 280; i++) {
      const x = woodRng() * s;
      ctx.strokeStyle = `rgba(${40 + woodRng() * 90},0,0,.5)`;
      ctx.lineWidth = 0.6 + woodRng() * 1.8;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      for (let y = 0; y <= s; y += 16) ctx.lineTo(x + Math.sin(y * 0.014 + i * 0.7) * 2, y);
      ctx.stroke();
    }
  });
  const woodData = heightFromCanvas(woodHeight, woodSize);
  const woodRough = new Float32Array(woodSize * woodSize);
  for (let i = 0; i < woodRough.length; i++) woodRough[i] = 0.7 + (woodRng() - 0.5) * 0.14;
  const wood = {
    map: texture(woodCanvas, { srgb: true }),
    normal: texture(normalCanvas(woodData, woodSize, 1.8)),
    rough: texture(roughnessCanvas(woodRough, woodSize)),
    meters: 1.05,
  };

  /* ---------------- deck boards (weathered) ---------------- */
  const deckSize = 512;
  const deckRng = randomGenerator(88);
  const deckCanvas = drawCanvas(deckSize, (ctx, s) => {
    ctx.fillStyle = '#94704d';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 340; i++) {
      const x = deckRng() * s;
      const grey = deckRng() > 0.55;
      ctx.strokeStyle = grey
        ? `rgba(150,146,134,${0.05 + deckRng() * 0.14})`
        : `rgba(48,32,19,${0.05 + deckRng() * 0.14})`;
      ctx.lineWidth = 0.7 + deckRng() * 2.6;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      for (let y = 0; y <= s; y += 20) ctx.lineTo(x + Math.sin(y * 0.011 + i) * 3, y);
      ctx.stroke();
    }
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `rgba(70,62,48,${0.05 + deckRng() * 0.1})`;
      ctx.fillRect(deckRng() * s, deckRng() * s, 2 + deckRng() * 34, 2 + deckRng() * 8);
    }
  });
  const deckHeight = new Float32Array(deckSize * deckSize);
  for (let i = 0; i < deckHeight.length; i++) deckHeight[i] = 0.44 + (deckRng() - 0.5) * 0.2;
  const deckRough = new Float32Array(deckSize * deckSize);
  for (let i = 0; i < deckRough.length; i++) deckRough[i] = 0.84 + (deckRng() - 0.5) * 0.1;
  const deck = {
    map: texture(deckCanvas, { srgb: true }),
    normal: texture(normalCanvas(deckHeight, deckSize, 0.6)),
    rough: texture(roughnessCanvas(deckRough, deckSize)),
    meters: 1.6,
  };

  /* ---------------- granite slabs / rocks ---------------- */
  const stoneSize = 512;
  const stoneNoise = fbm(stoneSize, 5, 5, 33);
  const stoneFine = fbm(stoneSize, 2, 40, 34);
  const stoneRng = randomGenerator(35);
  const stoneCanvas = drawCanvas(stoneSize, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let i = 0; i < s * s; i++) {
      const v = 172 + (stoneNoise[i] - 0.5) * 42 + (stoneFine[i] - 0.5) * 30;
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v + 1;
      img.data[i * 4 + 2] = v - 4;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    for (let i = 0; i < 2400; i++) {
      const v = 90 + stoneRng() * 150;
      ctx.fillStyle = `rgba(${v},${v},${v},${0.2 + stoneRng() * 0.4})`;
      const r = 0.4 + stoneRng() * 1.7;
      ctx.fillRect(stoneRng() * s, stoneRng() * s, r, r);
    }
    for (let i = 0; i < 8; i++) {
      ctx.strokeStyle = 'rgba(72,74,70,.14)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      let x = stoneRng() * s, y = stoneRng() * s;
      ctx.moveTo(x, y);
      for (let j = 0; j < 6; j++) ctx.lineTo(x += stoneRng() * 26 - 13, y += stoneRng() * 20);
      ctx.stroke();
    }
  });
  const stoneHeight = new Float32Array(stoneSize * stoneSize);
  for (let i = 0; i < stoneHeight.length; i++) stoneHeight[i] = stoneNoise[i] * 0.7 + stoneFine[i] * 0.3;
  const stoneRough = new Float32Array(stoneSize * stoneSize);
  for (let i = 0; i < stoneRough.length; i++) stoneRough[i] = 0.82 + stoneFine[i] * 0.14;
  const stone = {
    map: texture(stoneCanvas, { srgb: true }),
    normal: texture(normalCanvas(stoneHeight, stoneSize, 1.5)),
    rough: texture(roughnessCanvas(stoneRough, stoneSize)),
    meters: 1.15,
  };

  /* ---------------- dark stone (veranda slab) ---------------- */
  const darkStone = {
    map: stone.map,
    normal: stone.normal,
    rough: stone.rough,
    meters: stone.meters,
  };

  /* ---------------- concrete ---------------- */
  const concreteSize = 512;
  const concreteNoise = fbm(concreteSize, 4, 6, 41);
  const concreteFine = fbm(concreteSize, 3, 30, 42);
  const concreteRng = randomGenerator(43);
  const concreteCanvas = paint(concreteSize, (x, y) => {
    const i = y * concreteSize + x;
    const v = 148 + (concreteNoise[i] - 0.5) * 28 + (concreteFine[i] - 0.5) * 18;
    return rgb(v, v + 1, v - 3);
  });
  const concreteHeight = new Float32Array(concreteSize * concreteSize);
  for (let i = 0; i < concreteHeight.length; i++) concreteHeight[i] = concreteFine[i];
  const concreteRough = new Float32Array(concreteSize * concreteSize);
  for (let i = 0; i < concreteRough.length; i++) concreteRough[i] = 0.9 + (concreteRng() - 0.5) * 0.06;
  const concrete = {
    map: texture(concreteCanvas, { srgb: true }),
    normal: texture(normalCanvas(concreteHeight, concreteSize, 1.2)),
    rough: texture(roughnessCanvas(concreteRough, concreteSize)),
    meters: 1.3,
  };

  /* ---------------- bamboo ---------------- */
  const bambooSize = 256;
  const bambooRng = randomGenerator(51);
  const bambooCanvas = drawCanvas(bambooSize, (ctx, s) => {
    ctx.fillStyle = '#b9a276';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 190; i++) {
      const x = bambooRng() * s;
      ctx.strokeStyle = bambooRng() > 0.5
        ? `rgba(255,240,205,${0.05 + bambooRng() * 0.14})`
        : `rgba(92,74,42,${0.05 + bambooRng() * 0.13})`;
      ctx.lineWidth = 0.5 + bambooRng() * 1.4;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      for (let y = 0; y <= s; y += 12) ctx.lineTo(x + Math.sin(y * 0.03 + i) * 1.2, y);
      ctx.stroke();
    }
    // node bands
    for (const y of [0.31, 0.68]) {
      ctx.fillStyle = 'rgba(88,70,40,.3)';
      ctx.fillRect(0, y * s - 2, s, 3);
      ctx.fillStyle = 'rgba(255,243,212,.2)';
      ctx.fillRect(0, y * s + 1, s, 1.4);
    }
  });
  const bambooHeight = new Float32Array(bambooSize * bambooSize);
  for (let i = 0; i < bambooHeight.length; i++) bambooHeight[i] = 0.4 + bambooRng() * 0.6;
  const bambooRough = new Float32Array(bambooSize * bambooSize);
  for (let i = 0; i < bambooRough.length; i++) bambooRough[i] = 0.72 + bambooRng() * 0.16;
  const bamboo = {
    map: texture(bambooCanvas, { srgb: true }),
    normal: texture(normalCanvas(bambooHeight, bambooSize, 0.35)),
    rough: texture(roughnessCanvas(bambooRough, bambooSize)),
    meters: 0.85,
  };

  /* ---------------- woven rattan ---------------- */
  const wickerSize = 256;
  const wickerCanvas = drawCanvas(wickerSize, (ctx, s) => {
    ctx.fillStyle = '#6f5133';
    ctx.fillRect(0, 0, s, s);
    const step = 12;
    for (let d = -s; d < s * 2; d += step) {
      ctx.strokeStyle = 'rgba(170,130,84,.85)';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(d, 0); ctx.lineTo(d + s, s); ctx.stroke();
      ctx.strokeStyle = 'rgba(48,32,18,.5)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(d + 6, 0); ctx.lineTo(d + s + 6, s); ctx.stroke();
    }
    for (let d = -s; d < s * 2; d += step) {
      ctx.strokeStyle = 'rgba(126,94,58,.45)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(d + s, 0); ctx.lineTo(d, s); ctx.stroke();
    }
  });
  const wickerHeight = drawCanvas(wickerSize, (ctx, s) => {
    ctx.fillStyle = '#555';
    ctx.fillRect(0, 0, s, s);
    const step = 12;
    for (let d = -s; d < s * 2; d += step) {
      ctx.strokeStyle = '#ddd';
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(d, 0); ctx.lineTo(d + s, s); ctx.stroke();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(d + s, 0); ctx.lineTo(d, s); ctx.stroke();
    }
  });
  const wickerData = heightFromCanvas(wickerHeight, wickerSize);
  const wickerRough = new Float32Array(wickerSize * wickerSize).fill(0.72);
  const wicker = {
    map: texture(wickerCanvas, { srgb: true }),
    normal: texture(normalCanvas(wickerData, wickerSize, 2.6)),
    rough: texture(roughnessCanvas(wickerRough, wickerSize)),
    meters: 0.36,
  };

  /* ---------------- canvas fabric ---------------- */
  const fabricSize = 256;
  const fabricRng = randomGenerator(61);
  const fabricCanvas = drawCanvas(fabricSize, (ctx, s) => {
    ctx.fillStyle = '#cdbb98';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 2) {
      ctx.strokeStyle = 'rgba(84,68,44,.16)';
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, s); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,248,226,.18)';
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(s, i); ctx.stroke();
    }
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `rgba(120,102,72,${0.03 + fabricRng() * 0.05})`;
      ctx.fillRect(0, fabricRng() * s, s, 1 + fabricRng() * 3);
    }
  });
  const fabricHeight = new Float32Array(fabricSize * fabricSize);
  for (let i = 0; i < fabricHeight.length; i++) fabricHeight[i] = 0.5 + (fabricRng() - 0.5) * 0.5;
  const fabricRough = new Float32Array(fabricSize * fabricSize).fill(0.95);
  const fabric = {
    map: texture(fabricCanvas, { srgb: true }),
    normal: texture(normalCanvas(fabricHeight, fabricSize, 0.9)),
    rough: texture(roughnessCanvas(fabricRough, fabricSize)),
    meters: 0.5,
  };

  /* ---------------- lawn ---------------- */
  const grassSize = 1024;
  const grassNoise = fbm(grassSize, 5, 3, 71);
  const grassFine = fbm(grassSize, 3, 26, 72);
  const grassRng = randomGenerator(73);
  const grassCanvas = paint(grassSize, (x, y) => {
    const i = y * grassSize + x;
    const n = grassNoise[i];
    const f = grassFine[i];
    // patchy late-autumn lawn: olive green with straw and bare earth
    const dry = Math.max(0, n - 0.53) * 2.2;
    const bare = Math.max(0, n - 0.7) * 2.4;
    let r = mix(74, 132, dry) + (f - 0.5) * 24;
    let g = mix(94, 134, dry) + (f - 0.5) * 20;
    let b = mix(46, 76, dry) + (f - 0.5) * 14;
    r = mix(r, 118, bare * 0.6);
    g = mix(g, 104, bare * 0.6);
    b = mix(b, 74, bare * 0.6);
    return rgb(clampByte(r), clampByte(g), clampByte(b));
  });
  const grassHeight = new Float32Array(grassSize * grassSize);
  for (let i = 0; i < grassHeight.length; i++) grassHeight[i] = grassFine[i];
  const grassRough = new Float32Array(grassSize * grassSize).fill(0.98);
  const grass = {
    map: texture(grassCanvas, { srgb: true }),
    normal: texture(normalCanvas(grassHeight, grassSize, 1.1)),
    rough: texture(roughnessCanvas(grassRough, grassSize)),
    meters: 2.6,
  };

  /* ---------------- thatch ---------------- */
  const thatchSize = 512;
  const thatchRng = randomGenerator(81);
  const thatchCanvas = drawCanvas(thatchSize, (ctx, s) => {
    ctx.fillStyle = '#a08a5e';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 3200; i++) {
      const v = 90 + thatchRng() * 110;
      ctx.strokeStyle = `rgba(${v + 30},${v + 16},${v - 8},${0.25 + thatchRng() * 0.5})`;
      ctx.lineWidth = 0.5 + thatchRng() * 1.8;
      const x = thatchRng() * s, y = thatchRng() * s;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + thatchRng() * 4 - 2, y + 20 + thatchRng() * 70);
      ctx.stroke();
    }
  });
  const thatchHeight = drawCanvas(thatchSize, (ctx, s) => {
    ctx.fillStyle = '#777';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 2400; i++) {
      const v = 40 + thatchRng() * 180;
      ctx.strokeStyle = `rgba(${v},0,0,.6)`;
      ctx.lineWidth = 1 + thatchRng() * 2;
      const x = thatchRng() * s, y = thatchRng() * s;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 30 + thatchRng() * 60); ctx.stroke();
    }
  });
  const thatchData = heightFromCanvas(thatchHeight, thatchSize);
  const thatchRough = new Float32Array(thatchSize * thatchSize).fill(0.98);
  const thatch = {
    map: texture(thatchCanvas, { srgb: true }),
    normal: texture(normalCanvas(thatchData, thatchSize, 3.2)),
    rough: texture(roughnessCanvas(thatchRough, thatchSize)),
    meters: 0.85,
  };

  /* ---------------- soil ---------------- */
  const soilSize = 256;
  const soilNoise = fbm(soilSize, 5, 6, 91);
  const soilRng = randomGenerator(92);
  const soilCanvas = paint(soilSize, (x, y) => {
    const n = soilNoise[y * soilSize + x];
    const v = 58 + (n - 0.5) * 40;
    return rgb(clampByte(v + 12), clampByte(v + 4), clampByte(v - 12));
  });
  const soilHeight = new Float32Array(soilSize * soilSize);
  for (let i = 0; i < soilHeight.length; i++) soilHeight[i] = soilNoise[i];
  const soilRough = new Float32Array(soilSize * soilSize).fill(1);
  const soil = {
    map: texture(soilCanvas, { srgb: true }),
    normal: texture(normalCanvas(soilHeight, soilSize, 2.4)),
    rough: texture(roughnessCanvas(soilRough, soilSize)),
    meters: 0.7,
  };

  /* ---------------- night window glow plane ---------------- */
  const warmNoise = fbm(256, 3, 5, 99);
  const windowGlowCanvas = paint(256, (x, y) => {
    const n = warmNoise[y * 256 + x];
    const v = 150 + n * 90;
    return rgb(clampByte(v), clampByte(v * 0.72), clampByte(v * 0.38));
  });

  /* ---------------- contact shadow decal ---------------- */
  const shadowCanvas = drawCanvas(256, (ctx, s) => {
    const gradient = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gradient.addColorStop(0, 'rgba(0,0,0,.72)');
    gradient.addColorStop(0.45, 'rgba(0,0,0,.38)');
    gradient.addColorStop(0.75, 'rgba(0,0,0,.11)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, s, s);
  });
  const contactShadow = texture(shadowCanvas);

  /* ---------------- packaged materials ---------------- */
  const materials = {
    plaster: material({ ...plaster, color: '#f4f0e2', normalScale: 0.55 }),
    whitePaint: material({ ...plaster, color: '#f1eee2', normalScale: 0.4, extra: { roughness: 1 } }),
    brick: material({ ...brick, normalScale: 1 }),
    tile: material({ ...tile, color: '#d8d8d0', normalScale: 0.6, extra: { metalness: 0.02 } }),
    tileCap: material({ ...tile, color: '#c8c8c0', normalScale: 0.4 }),
    wood: material({ ...wood, color: '#d9b382', normalScale: 0.7, extra: { roughness: 1 } }),
    darkWood: material({ ...wood, color: '#584636', normalScale: 0.8, extra: { roughness: 1 } }),
    deck: material({ ...deck, color: '#c19a78', normalScale: 0.6, extra: { roughness: 1 } }),
    stone: material({ ...stone, color: '#b9b7a8', normalScale: 0.8 }),
    darkStone: material({ ...stone, color: '#6b6f68', normalScale: 1 }),
    concrete: material({ ...concrete, color: '#e6e4da', normalScale: 0.6 }),
    bamboo: material({ ...bamboo, color: '#f0d9ab', normalScale: 0.8, extra: { roughness: 1 } }),
    wicker: material({ ...wicker, color: '#b28a5f', normalScale: 1, extra: { roughness: 1 } }),
    fabric: material({ ...fabric, color: '#fff4dd', normalScale: 0.6, extra: { roughness: 1 } }),
    curtain: material({
      ...fabric, color: '#f4efe0', normalScale: 0.35,
      extra: { roughness: 1, transparent: true, opacity: 0.93, side: THREE.DoubleSide, envMapIntensity: 0.6 },
    }),
    sheer: new THREE.MeshStandardMaterial({
      color: '#f7f2e4', roughness: 0.97, side: THREE.DoubleSide, transparent: true,
      opacity: 0.95, normalMap: fabric.normal, normalScale: new THREE.Vector2(0.18, 0.18),
      envMapIntensity: 0.7,
    }),
    grass: material({ ...grass, normalScale: 1, extra: { roughness: 1, envMapIntensity: 0.5 } }),
    thatch: material({ ...thatch, color: '#cfba92', normalScale: 1, extra: { roughness: 1, side: THREE.DoubleSide } }),
    soil: material({ ...soil, normalScale: 1, extra: { roughness: 1 } }),
    blackMetal: new THREE.MeshStandardMaterial({ color: '#20221f', roughness: 0.44, metalness: 0.68, envMapIntensity: 0.9 }),
    darkFrame: new THREE.MeshStandardMaterial({ color: '#2b2a24', roughness: 0.52, metalness: 0.28, envMapIntensity: 0.7 }),
    aluminium: new THREE.MeshStandardMaterial({ color: '#c3c6c1', roughness: 0.3, metalness: 0.82, envMapIntensity: 1.1 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: '#101a15', roughness: 0.06, metalness: 0.05,
      transparent: true, opacity: 0.38, envMapIntensity: 0.65,
      clearcoat: 0.6, clearcoatRoughness: 0.08, depthWrite: false,
    }),
    blackGlass: new THREE.MeshPhysicalMaterial({ color: '#0b1210', roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.78, envMapIntensity: 1.3 }),
    ceramic: new THREE.MeshStandardMaterial({ color: '#ded6c0', roughness: 0.24, metalness: 0.02, envMapIntensity: 1.2 }),
    windowGlow: new THREE.MeshBasicMaterial({ map: texture(windowGlowCanvas, { srgb: true }), color: '#ffd9a0', transparent: true, opacity: 0.8, depthWrite: false }),
    contactShadow: new THREE.MeshBasicMaterial({
      map: contactShadow, color: '#141712', transparent: true, opacity: 0.34,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    }),
  };

  materials.windowGlow.userData.uvMeters = 1;
  materials.tile.userData.uvMeters = 1;
  return materials;
}

/* ------------------------------------------------------------------ *
 *  Foliage cards — alpha-cut leaf textures
 * ------------------------------------------------------------------ */

function leafCanvas(size, draw) {
  const canvas = canvasOf(size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  draw(ctx, size);
  return canvas;
}

function leafTexture(canvas) {
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

export function createFoliageTextures() {
  const broad = leafCanvas(128, (ctx, s) => {
    const drawLeaf = (cx, cy, w, h, rot, tone) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.fillStyle = tone;
      ctx.beginPath();
      ctx.moveTo(0, -h / 2);
      ctx.bezierCurveTo(w / 2, -h * 0.22, w / 2.1, h * 0.2, 0, h / 2);
      ctx.bezierCurveTo(-w / 2.1, h * 0.2, -w / 2, -h * 0.22, 0, -h / 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(70,72,48,.5)';
      ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(0, -h * 0.46); ctx.lineTo(0, h * 0.46); ctx.stroke();
      ctx.lineWidth = 0.7;
      for (let i = -3; i <= 3; i++) {
        const y = i * h * 0.12;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w * 0.3, y + h * 0.08); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(-w * 0.3, y + h * 0.08); ctx.stroke();
      }
      ctx.restore();
    };
    drawLeaf(s * 0.32, s * 0.38, s * 0.34, s * 0.52, -0.5, '#cdc7ad');
    drawLeaf(s * 0.68, s * 0.34, s * 0.3, s * 0.48, 0.6, '#ddd8c0');
    drawLeaf(s * 0.5, s * 0.66, s * 0.38, s * 0.56, 0.15, '#c4bfa4');
  });

  const narrow = leafCanvas(128, (ctx, s) => {
    const drawBlade = (cx, cy, w, h, rot, tone) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.fillStyle = tone;
      ctx.beginPath();
      ctx.moveTo(0, -h / 2);
      ctx.quadraticCurveTo(w / 2, -h * 0.1, 0, h / 2);
      ctx.quadraticCurveTo(-w / 2, -h * 0.1, 0, -h / 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(80,86,52,.45)';
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(0, -h * 0.44); ctx.lineTo(0, h * 0.44); ctx.stroke();
      ctx.restore();
    };
    drawBlade(s * 0.3, s * 0.4, s * 0.16, s * 0.7, -0.72, '#d2d0b4');
    drawBlade(s * 0.55, s * 0.34, s * 0.15, s * 0.66, 0.22, '#c3c2a2');
    drawBlade(s * 0.7, s * 0.55, s * 0.16, s * 0.72, 0.85, '#dad7bc');
    drawBlade(s * 0.42, s * 0.62, s * 0.13, s * 0.58, -0.25, '#c8c8a9');
  });

  const maple = leafCanvas(128, (ctx, s) => {
    const cx = s / 2, cy = s / 2, r = s * 0.42;
    ctx.fillStyle = '#d8c8ae';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const radius = i % 2 === 0 ? r : r * 0.56;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,66,44,.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(cx, cy + r * 0.8); ctx.lineTo(cx, cy - r * 0.7); ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * r * 0.82, cy + Math.sin(angle) * r * 0.82);
      ctx.stroke();
    }
  });

  return {
    broad: leafTexture(broad),
    narrow: leafTexture(narrow),
    maple: leafTexture(maple),
  };
}
