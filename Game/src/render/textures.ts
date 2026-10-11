import * as THREE from 'three';

/**
 * Pustaka tekstur prosedural.
 *
 * Semua tekstur sengaja dibuat *putih dengan detail gelap* (bukan berwarna),
 * karena THREE mengalikan `map` dengan `material.color`. Dengan begitu satu
 * tekstur bisa dipakai untuk banyak warna palet tanpa kehilangan nuansa aslinya.
 *
 * Filter `NearestFilter` untuk magnifikasi memberi rasa texel tajam ala PS1,
 * sementara mipmaps tetap aktif supaya permukaan jauh tidak berkedip (shimmer).
 */

export type Pattern =
  | 'plain'
  | 'planks'
  | 'grain'
  | 'plaster'
  | 'tile'
  | 'weave'
  | 'grass'
  | 'dirt'
  | 'asphalt'
  | 'brushed'
  | 'paper'
  | 'foliage'
  | 'roof'
  | 'windowview';

const SIZE = 128;
const cache = new Map<Pattern, THREE.Texture>();

/** xorshift32: deterministik supaya tekstur sama di setiap pemuatan. */
function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function surface(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SIZE, SIZE);
  return [canvas, ctx];
}

/** Sapuan noise luminance tipis supaya permukaan tidak terasa "datar digital". */
function grain(ctx: CanvasRenderingContext2D, amount: number, seed: number, step = 4): void {
  const rnd = seeded(seed);
  for (let y = 0; y < SIZE; y += step) {
    for (let x = 0; x < SIZE; x += step) {
      const v = rnd();
      const a = (v - 0.5) * amount;
      if (a >= 0) {
        ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      } else {
        ctx.fillStyle = `rgba(0,0,0,${(-a).toFixed(3)})`;
      }
      ctx.fillRect(x, y, step, step);
    }
  }
}

function drawPlanks(ctx: CanvasRenderingContext2D): void {
  const rnd = seeded(1337);
  const rows = 4;
  const rowH = SIZE / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * rowH;
    // Sambungan papan antar-baris (bergeser supaya tidak membentuk garis lurus).
    const seam = ((r * 43) % SIZE);
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(0, y, SIZE, 2);
    ctx.fillRect(seam, y, 2, rowH);
    ctx.fillRect((seam + SIZE / 2) % SIZE, y, 2, rowH);

    // Serat kayu memanjang.
    for (let i = 0; i < 10; i++) {
      const gy = y + 3 + rnd() * (rowH - 6);
      ctx.strokeStyle = `rgba(0,0,0,${(0.05 + rnd() * 0.1).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.bezierCurveTo(SIZE * 0.3, gy + (rnd() - 0.5) * 4, SIZE * 0.7, gy + (rnd() - 0.5) * 4, SIZE, gy);
      ctx.stroke();
    }
    // Variasi terang-redup antar papan.
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.07)';
    ctx.fillRect(0, y + 2, SIZE, rowH - 2);
  }
  grain(ctx, 0.06, 91, 4);
}

function drawGrain(ctx: CanvasRenderingContext2D): void {
  const rnd = seeded(4242);
  for (let i = 0; i < 46; i++) {
    const x = rnd() * SIZE;
    ctx.strokeStyle = `rgba(0,0,0,${(0.04 + rnd() * 0.11).toFixed(3)})`;
    ctx.lineWidth = 1 + Math.round(rnd());
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + (rnd() - 0.5) * 14, SIZE * 0.35, x + (rnd() - 0.5) * 14, SIZE * 0.7, x + (rnd() - 0.5) * 8, SIZE);
    ctx.stroke();
  }
  grain(ctx, 0.05, 5150, 4);
}

function drawPlaster(ctx: CanvasRenderingContext2D): void {
  const rnd = seeded(77);
  // Bercak/kerak usia: noda lembut.
  for (let i = 0; i < 26; i++) {
    const x = rnd() * SIZE;
    const y = rnd() * SIZE;
    const r = 8 + rnd() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() > 0.35;
    g.addColorStop(0, dark ? 'rgba(0,0,0,0.13)' : 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Retak rambut.
  ctx.strokeStyle = 'rgba(0,0,0,0.14)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    let x = rnd() * SIZE;
    let y = 0;
    ctx.beginPath();
    ctx.moveTo(x, y);
    while (y < SIZE) {
      x += (rnd() - 0.5) * 16;
      y += 8 + rnd() * 14;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  grain(ctx, 0.08, 311, 4);
}

function drawTile(ctx: CanvasRenderingContext2D): void {
  const rnd = seeded(2024);
  const cells = 4;
  const c = SIZE / cells;
  grain(ctx, 0.05, 66, 8);
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      // Nat/retak antar ubin.
      ctx.fillStyle = 'rgba(0,0,0,0.40)';
      ctx.fillRect(x * c, y * c, c, 2);
      ctx.fillRect(x * c, y * c, 2, c);
      // Tiap ubin sedikit berbeda tingkat kecerahan.
      const v = (rnd() - 0.5) * 0.14;
      ctx.fillStyle = v >= 0 ? `rgba(255,255,255,${v.toFixed(3)})` : `rgba(0,0,0,${(-v).toFixed(3)})`;
      ctx.fillRect(x * c + 2, y * c + 2, c - 2, c - 2);
    }
  }
  grain(ctx, 0.04, 77, 4);
}

function drawWeave(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(0,0,0,0.13)';
  for (let i = 0; i < SIZE; i += 4) ctx.fillRect(i, 0, 2, SIZE);
  ctx.fillStyle = 'rgba(255,255,255,0.13)';
  for (let i = 2; i < SIZE; i += 4) ctx.fillRect(0, i, SIZE, 2);
  grain(ctx, 0.1, 4004, 4);
}

function drawGrass(ctx: CanvasRenderingContext2D): void {
  const rnd = seeded(8080);
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 340; i++) {
    const x = rnd() * SIZE;
    const y = rnd() * SIZE;
    const len = 3 + rnd() * 6;
    ctx.strokeStyle = rnd() > 0.5
      ? `rgba(0,0,0,${(0.12 + rnd() * 0.2).toFixed(3)})`
      : `rgba(255,255,255,${(0.10 + rnd() * 0.18).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rnd() - 0.5) * 4, y - len);
    ctx.stroke();
  }
}

function drawDirt(ctx: CanvasRenderingContext2D): void {
  const rnd = seeded(9090);
  grain(ctx, 0.16, 1212, 4);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * SIZE;
    const y = rnd() * SIZE;
    const r = 1 + rnd() * 3;
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(0,0,0,0.30)' : 'rgba(255,255,255,0.24)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawAsphalt(ctx: CanvasRenderingContext2D): void {
  const rnd = seeded(555);
  grain(ctx, 0.2, 3500, 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    let x = rnd() * SIZE;
    let y = 0;
    ctx.beginPath();
    ctx.moveTo(x, y);
    while (y < SIZE) {
      x += (rnd() - 0.5) * 22;
      y += 10 + rnd() * 16;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function drawBrushed(ctx: CanvasRenderingContext2D): void {
  const rnd = seeded(606);
  for (let y = 0; y < SIZE; y += 2) {
    ctx.fillStyle = `rgba(0,0,0,${(0.03 + rnd() * 0.09).toFixed(3)})`;
    ctx.fillRect(0, y, SIZE, 1);
  }
  grain(ctx, 0.05, 1616, 4);
}

function drawPaper(ctx: CanvasRenderingContext2D): void {
  const rnd = seeded(303);
  grain(ctx, 0.07, 909, 2);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(0,0,0,${(0.05 + rnd() * 0.1).toFixed(3)})`;
    ctx.fillRect(rnd() * SIZE, rnd() * SIZE, 1 + rnd() * 3, 1);
  }
}

function drawFoliage(ctx: CanvasRenderingContext2D): void {
  const rnd = seeded(2718);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 190; i++) {
    const x = rnd() * SIZE;
    const y = rnd() * SIZE;
    const r = 3 + rnd() * 7;
    ctx.fillStyle = rnd() > 0.45
      ? `rgba(0,0,0,${(0.14 + rnd() * 0.24).toFixed(3)})`
      : `rgba(255,255,255,${(0.10 + rnd() * 0.2).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.55 + rnd() * 0.5), rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRoof(ctx: CanvasRenderingContext2D): void {
  const rnd = seeded(1010);
  const rows = 6;
  const h = SIZE / rows;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? h : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.fillRect(0, r * h, SIZE, 2);
    for (let x = -h; x < SIZE; x += h * 2) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(x + off, r * h, 2, h);
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.07)';
      ctx.fillRect(x + off + 2, r * h + 2, h * 2 - 2, h - 2);
    }
  }
  grain(ctx, 0.06, 1717, 4);
}

function drawPlain(ctx: CanvasRenderingContext2D): void {
  // Tetap sedikit "materialitas": permukaan murni putih terasa seperti plastik.
  grain(ctx, 0.05, 11, 4);
}

/**
 * Pemandangan dari balik kaca: langit yang memudar menuju horizon, siluet
 * bukit bertumpuk, dan barisan pohon di garis tanah.
 *
 * Tanpa ini jendela hanya kotak biru pucat. Yang dilihat pemain lewat kaca
 * kini memberi arah: tahu sedang pagi atau malam, tahu desa membentang di
 * luar: tanpa perlu membuka lubang di dinding.
 *
 * Catatan warna: tekstur ini dibuat terang-di-atas/gelap-di-bawah, lalu
 * dikalikan `material.color` (0xd6e8f2) sehingga langit jadi biru muda dan
 * bukit jadi biru tua yang pekat.
 */
function drawWindowView(ctx: CanvasRenderingContext2D): void {
  const rnd = seeded(6013);

  // Langit: putih di atas memudar ke abu muda di horizon.
  const sky = ctx.createLinearGradient(0, 0, 0, SIZE);
  sky.addColorStop(0, '#ffffff');
  sky.addColorStop(0.5, '#eef4f8');
  sky.addColorStop(0.72, '#c9d6de');
  sky.addColorStop(1, '#8e9aa4');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Awan lembut.
  for (let i = 0; i < 5; i++) {
    const cx = rnd() * SIZE;
    const cy = 14 + rnd() * 46;
    const rw = 16 + rnd() * 26;
    const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, rw);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rw, rw * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bukit jauh (lebih terang karena kabut) lalu bukit dekat.
  const hill = (baseY: number, amp: number, color: string): void => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, SIZE);
    ctx.lineTo(0, baseY);
    for (let x = 0; x <= SIZE; x += 8) {
      const y = baseY - Math.sin(x * 0.035 + baseY) * amp - Math.sin(x * 0.011) * amp * 0.7;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(SIZE, SIZE);
    ctx.closePath();
    ctx.fill();
  };
  hill(84, 12, 'rgba(70,86,96,0.55)');
  hill(98, 9, 'rgba(38,50,58,0.85)');

  // Barisan pohon di garis tanah.
  for (let i = 0; i < 22; i++) {
    const x = rnd() * SIZE;
    const h = 8 + rnd() * 14;
    const w = 4 + rnd() * 5;
    ctx.fillStyle = 'rgba(24,32,30,0.9)';
    ctx.beginPath();
    ctx.moveTo(x, 104);
    ctx.lineTo(x - w, 104);
    ctx.lineTo(x, 104 - h);
    ctx.lineTo(x + w, 104);
    ctx.closePath();
    ctx.fill();
  }

  // Tanah dekat.
  ctx.fillStyle = 'rgba(20,26,24,0.95)';
  ctx.fillRect(0, 104, SIZE, SIZE - 104);
  grain(ctx, 0.12, 771, 4);
}

const painters: Record<Pattern, (ctx: CanvasRenderingContext2D) => void> = {
  plain: drawPlain,
  planks: drawPlanks,
  grain: drawGrain,
  plaster: drawPlaster,
  tile: drawTile,
  weave: drawWeave,
  grass: drawGrass,
  dirt: drawDirt,
  asphalt: drawAsphalt,
  brushed: drawBrushed,
  paper: drawPaper,
  foliage: drawFoliage,
  roof: drawRoof,
  windowview: drawWindowView
};

export function getTexture(pattern: Pattern): THREE.Texture {
  const hit = cache.get(pattern);
  if (hit) return hit;

  const [canvas, ctx] = surface();
  painters[pattern](ctx);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;

  cache.set(pattern, texture);
  return texture;
}

let softDot: THREE.Texture | null = null;

/**
 * Bintik lembut untuk partikel (kabut, debu, abu, bara).
 *
 * `THREE.Points` tanpa `map` menggambar tiap partikel sebagai kotak solid -
 * kabut 1 meter langsung terbaca sebagai kotak abu-abu raksasa yang menutupi
 * layar. Gradasi radial ini mengubahnya jadi gumpalan bulat yang memudar di
 * tepinya, tanpa tepi keras yang memecah suasana.
 */
export function getSoftDotTexture(): THREE.Texture {
  if (softDot) return softDot;

  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const r = size / 2;
  const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  gradient.addColorStop(0.7, 'rgba(255,255,255,0.3)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  // Tidak memakai RepeatWrapping: tepi partikel harus benar-benar transparan,
  // dan magnifikasi halus supaya tidak terlihat langkah piksel.
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;

  softDot = texture;
  return texture;
}

let flameGradient: THREE.Texture | null = null;

/**
 * Gradasi vertikal untuk lidah api: pekat di dasar, menipis di puncak.
 *
 * Kerucut lidah api tanpa peta selamanya berupa segitiga oranye pekat.
 * Dengan peta ini (dan blending menyala) ujung lidah meleleh ke udara
 * sehingga api terbaca sebagai bara, bukan kerucut mainan.
 *
 * Pemetaan UV `ConeGeometry`/`CylinderGeometry`: `uv.y = 1` di puncak,
 * `uv.y = 0` di dasar: karena itu transparan disimpan di atas.
 */
export function getFlameGradientTexture(): THREE.Texture {
  if (flameGradient) return flameGradient;

  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, size, 0, 0);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.35, 'rgba(255,246,230,0.85)');
  gradient.addColorStop(0.72, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  flameGradient = texture;
  return texture;
}

export function disposeTextures(): void {
  cache.forEach(t => t.dispose());
  cache.clear();
  if (softDot) {
    softDot.dispose();
    softDot = null;
  }
  if (flameGradient) {
    flameGradient.dispose();
    flameGradient = null;
  }
}
