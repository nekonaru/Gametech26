import * as THREE from 'three';
import { getTexture, getSoftDotTexture, getFlameGradientTexture, Pattern } from './textures.js';
import { applyVertexSnap } from './snap.js';

/**
 * Pintu bergerak milik scene: daun yang bisa dibuka/ditutup, lengkap dengan
 * target interaksi dan titik pusat untuk mendeteksi pemakaian pintu oleh
 * naskah bab (misal `pintu_depan` yang membuka animasi keluar).
 */
export interface SceneDoor {
  id: string;
  /**
   * True kalau pintu ini didaftarkan sebagai interaktif E milik scene
   * (pintu kamar). Pintu keluar memakai `false`: naskah bab sudah punya
   * interaktifnya sendiri di titik yang sama dan dua prompt di satu pintu
   * hanya akan saling berebut.
   */
  interactive: boolean;
  /** Titik target E; menempel pada daun sehingga ikut berputar. */
  target: THREE.Object3D;
  /** Posisi dunia pusat daun (untuk proximiti pemakaian naskah). */
  center: THREE.Vector3;
  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
}

export interface BuiltScene {
  group: THREE.Group;
  colliders: THREE.Object3D[];
  spawn: { pos: [number, number, number]; yaw: number };
  /**
   * Posisi dunia prop yang benar-benar ada di adegan, dipetakan lewat id
   * interactable naskah. Penanda interaksi memakai titik ini lebih dulu
   * supaya penanda muncul *di atas benda yang benar* (kasur, pintu, kompor)
   * alih-alih di titik kira-kira hasil hitung ulang.
   */
  anchors: Record<string, [number, number, number]>;
  /** Pintu yang bisa dibuka/tutup pada scene ini. */
  doors: SceneDoor[];
}

interface Kit {
  group: THREE.Group;
  colliders: THREE.Object3D[];
  anchors: Record<string, [number, number, number]>;
  doors: SceneDoor[];
}

const palette = {
  floorWood: 0x6b5340,
  floorStone: 0x7a766c,
  floorDirt: 0x5b4a36,
  floorRoad: 0x4a4741,
  floorGrass: 0x4b5a3a,
  wall: 0x9d8f7a,
  wallDark: 0x6f6355,
  plaster: 0xb3a791,
  wood: 0x7c5f42,
  woodDark: 0x4f3c2a,
  fabric: 0x5d6b74,
  fabricRed: 0x7a4038,
  metal: 0x6d7076,
  paper: 0xd8cfbc,
  leaf: 0x3d5230,
  leafDark: 0x2c3d24,
  ember: 0xff7a2f,
  glass: 0x8fa3ad,
  lamp: 0xffe6b0
};

/**
 * Petakan tiap warna palet ke pola teksturnya. Tanpa ini semua permukaan hanya
 * warna datar: dinding jadi kotak polos dan ruangan terasa seperti prototipe.
 * Warna yang tidak terdaftar tetap mendapat pola `plain` supaya tidak ada
 * permukaan yang benar-benar rata tanpa material.
 */
const PATTERN_BY_COLOR = new Map<number, Pattern>([
  [palette.floorWood, 'planks'],
  [palette.floorStone, 'tile'],
  [palette.floorDirt, 'dirt'],
  [palette.floorRoad, 'asphalt'],
  [palette.floorGrass, 'grass'],
  [palette.wall, 'plaster'],
  [palette.wallDark, 'plaster'],
  [palette.plaster, 'plaster'],
  [palette.wood, 'planks'],
  [palette.woodDark, 'grain'],
  [palette.fabric, 'weave'],
  [palette.fabricRed, 'weave'],
  [palette.metal, 'brushed'],
  [palette.paper, 'paper'],
  [palette.leaf, 'foliage'],
  [palette.leafDark, 'foliage'],
  [palette.glass, 'plain'],
  [palette.lamp, 'plain'],
  [palette.ember, 'plain'],
  // Warna literal yang dipakai langsung oleh beberapa builder.
  [0x8a8578, 'plaster'],
  [0x8a6a4a, 'planks'],
  [0x55504a, 'dirt'],
  [0x3a3026, 'dirt'],
  [0x9c8b63, 'brushed'],
  [0x6a655c, 'brushed'],
  [0x8a7f66, 'paper'],
  [0x94a7b3, 'paper'],
  [0x7f8d99, 'paper'],
  // Genteng & bata atap.
  [0x8a4a3a, 'roof'],
  [0x6b4536, 'roof'],
  [0x4a5b6b, 'roof'],
  [0x9b968b, 'tile'],
  // Daun pintu dicat hijau pudar & kain biru Raka: cat menutup serat kayu
  // tapi pola seratnya masih membayang, bukan bidang warna datar.
  [0x4f6b5c, 'grain'],
  [0x3a4a6b, 'weave'],
  [0x9fb0aa, 'tile'],
  // Kaca jendela: pemandangan langit dan siluet bukit, bukan panel datar.
  [0xd6e8f2, 'windowview']
]);

/** Key material supaya ratusan kotak berbagi satu material, bukan bikin baru. */
const materialCache = new Map<string, THREE.MeshLambertMaterial>();

function mat(color: number, opts: { emissive?: number; transparent?: boolean; opacity?: number } = {}): THREE.MeshLambertMaterial {
  const pattern = PATTERN_BY_COLOR.get(color) ?? 'plain';
  const key = `${color}|${pattern}|${opts.emissive ?? ''}|${opts.transparent ? 1 : 0}|${opts.opacity ?? ''}`;
  const cached = materialCache.get(key);
  if (cached) return cached;

  const m = new THREE.MeshLambertMaterial({
    color,
    map: getTexture(pattern),
    flatShading: true
  });
  if (opts.emissive !== undefined) {
    m.emissive = new THREE.Color(opts.emissive);
    // Cahaya emissive ikut mengikuti pola tekstur. Pada kaca jendela ini
    // membuat siluet bukit tetap gelap saat malam; tanpanya seluruh kaca
    // menyala rata dan pemandangan di baliknya hilang.
    if (m.map) m.emissiveMap = m.map;
  }
  if (opts.transparent) {
    m.transparent = true;
    m.opacity = opts.opacity ?? 0.5;
  }
  // Rasa PS1: seluruh permukaan adegan ikut penyimpangan verteks. Disimpan di
  // sini (bukan di pemanggil) supaya tidak ada satu pun material yang lolos.
  applyVertexSnap(m);
  m.userData.cached = true;
  materialCache.set(key, m);
  return m;
}

/**
 * Pasang titik jangkar untuk suatu id interactable.
 * Dipakai Game untuk menaruh penanda interaksi tepat di atas prop terkait.
 */
function anchor(kit: Kit, id: string, x: number, y: number, z: number): void {
  kit.anchors[id] = [x, y, z];
}

/**
 * BoxGeometry memetakan UV 0..1 di tiap muka, sehingga tekstur akan "melar"
 * mengikuti ukuran objek. Skalakan UV agar pola selalu punya skala dunia yang
 * sama: dinding 10 meter dan pintu 1 meter tetap punya serat dengan ukuran
 * seragam.
 */
function tileBoxUVs(geo: THREE.BoxGeometry, w: number, h: number, d: number, tile = 2): void {
  const uv = geo.attributes.uv as THREE.BufferAttribute | undefined;
  if (!uv || uv.count < 24) return;
  // Urutan muka BoxGeometry: +X, -X, +Y, -Y, +Z, -Z.
  const dims: Array<[number, number]> = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [fw, fh] = dims[f];
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, uv.getX(idx) * (fw / tile), uv.getY(idx) * (fh / tile));
    }
  }
  uv.needsUpdate = true;
}

/* ==========================================================================
   Cache geometri
   Scene dibangun ulang di TIAP transisi (54× dalam satu permainan): tanpa
   cache, ratusan balok/silinder dialokasikan ulang dan buffer GPU dibuang
   lalu diunggah lagi tiap pemain pindah tempat: sumber jeda hal yang
   terasa. Geometri di sini dipakai bersama; `disposeObject` (main.ts)
   memeriksa `userData.cached` sehingga cache tidak ikut dibuang.
   ========================================================================== */

const geometryCache = new Map<string, THREE.BufferGeometry>();

function cachedGeo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  const hit = geometryCache.get(key);
  if (hit) return hit;
  const geo = make();
  geo.userData.cached = true;
  geometryCache.set(key, geo);
  return geo;
}

type GeoArgs<T extends abstract new (...args: any) => any> = ConstructorParameters<T>;

function boxGeo(...args: GeoArgs<typeof THREE.BoxGeometry>): THREE.BoxGeometry {
  return cachedGeo(`b|${args.join(',')}`, () => new THREE.BoxGeometry(...args)) as THREE.BoxGeometry;
}

/** Box dengan UV dunia-tertile yang sudah dipasang sekali di pembuatan. */
function boxGeoTiled(
  w: number, h: number, d: number, tile = 2
): THREE.BoxGeometry {
  return cachedGeo(`bt|${w},${h},${d},${tile}`, () => {
    const g = new THREE.BoxGeometry(w, h, d);
    tileBoxUVs(g, w, h, d, tile);
    return g;
  }) as THREE.BoxGeometry;
}

function cylGeo(...args: GeoArgs<typeof THREE.CylinderGeometry>): THREE.CylinderGeometry {
  return cachedGeo(`c|${args.join(',')}`, () => new THREE.CylinderGeometry(...args)) as THREE.CylinderGeometry;
}

/** Silinder dengan UV dunia-tertile (dipakai groundDisc). */
function cylGeoTiled(
  rTop: number, rBottom: number, h: number, seg: number, uvR: number, uvH: number, uvTile: number
): THREE.CylinderGeometry {
  return cachedGeo(`ct|${rTop},${rBottom},${h},${seg},${uvR},${uvH},${uvTile}`, () => {
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg);
    tileCylinderUVs(g, uvR, uvH, uvTile);
    return g;
  }) as THREE.CylinderGeometry;
}

function coneGeo(...args: GeoArgs<typeof THREE.ConeGeometry>): THREE.ConeGeometry {
  return cachedGeo(`k|${args.join(',')}`, () => new THREE.ConeGeometry(...args)) as THREE.ConeGeometry;
}

function sphereGeo(...args: GeoArgs<typeof THREE.SphereGeometry>): THREE.SphereGeometry {
  return cachedGeo(`s|${args.join(',')}`, () => new THREE.SphereGeometry(...args)) as THREE.SphereGeometry;
}

function torusGeo(...args: GeoArgs<typeof THREE.TorusGeometry>): THREE.TorusGeometry {
  return cachedGeo(`r|${args.join(',')}`, () => new THREE.TorusGeometry(...args)) as THREE.TorusGeometry;
}

function box(
  kit: Kit,
  w: number,
  h: number,
  d: number,
  color: number,
  x: number,
  y: number,
  z: number,
  collide = true,
  opts?: { emissive?: number; transparent?: boolean; opacity?: number }
): THREE.Mesh {
  const geo = boxGeoTiled(w, h, d);
  const mesh = new THREE.Mesh(geo, mat(color, opts));
  mesh.position.set(x, y, z);
  kit.group.add(mesh);
  if (collide) kit.colliders.push(mesh);
  return mesh;
}

function cylinder(
  kit: Kit,
  rTop: number,
  rBottom: number,
  h: number,
  color: number,
  x: number,
  y: number,
  z: number,
  collide = true
): THREE.Mesh {
  const mesh = new THREE.Mesh(cylGeo(rTop, rBottom, h, 6), mat(color));
  mesh.position.set(x, y, z);
  kit.group.add(mesh);
  if (collide) kit.colliders.push(mesh);
  return mesh;
}

function floor(kit: Kit, w: number, d: number, color: number, y = 0): void {
  const geo = boxGeoTiled(w, 0.2, d, 2.5);
  const mesh = new THREE.Mesh(geo, mat(color));
  mesh.position.set(0, y - 0.1, 0);
  kit.group.add(mesh);
  kit.colliders.push(mesh);
}

function wall(kit: Kit, w: number, h: number, d: number, x: number, z: number, color = palette.wall): THREE.Mesh {
  return box(kit, w, h, d, color, x, h / 2, z, true);
}

function ceiling(kit: Kit, w: number, d: number, y: number, color: number): void {
  const geo = boxGeoTiled(w, 0.15, d, 2.5);
  const mesh = new THREE.Mesh(geo, mat(color));
  mesh.position.set(0, y, 0);
  kit.group.add(mesh);
}

function lampAt(kit: Kit, x: number, y: number, z: number, color = palette.lamp, intensity = 0.9, distance = 9): void {
  const shade = new THREE.Mesh(coneGeo(0.25, 0.3, 6), mat(color, { emissive: color }));
  shade.position.set(x, y, z);
  kit.group.add(shade);
  const light = new THREE.PointLight(color, intensity, distance);
  light.position.set(x, y - 0.2, z);
  kit.group.add(light);
}

function tree(kit: Kit, x: number, z: number, h = 4, trunkColor = palette.woodDark): void {
  cylinder(kit, 0.14, 0.2, h, trunkColor, x, h / 2, z, true);
  const crown = new THREE.Mesh(coneGeo(1.1, 2.4, 6), mat(palette.leaf));
  crown.position.set(x, h + 0.6, z);
  kit.group.add(crown);
  const crown2 = new THREE.Mesh(coneGeo(0.8, 1.8, 6), mat(palette.leafDark));
  crown2.position.set(x, h + 1.6, z);
  kit.group.add(crown2);
}

function scatterTrees(kit: Kit, count: number, radius: number, seedOffset = 0, minRadius = 4): void {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 * 3.7 + seedOffset;
    const r = minRadius + ((i * 137.5 + seedOffset * 31) % (radius - minRadius));
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    tree(kit, x, z, 3.4 + ((i * 53) % 20) / 10);
  }
}

function table(kit: Kit, x: number, z: number, w = 1.4, d = 0.8, h = 0.78, color = palette.wood): void {
  box(kit, w, 0.08, d, color, x, h, z, true);
  // Badan padat di bawah tabletop. Kapsul pemain hanya mengecek dua bola
  // (kaki setinggi 0,3 dan kepala), jadi tabletop setinggi 0,78 berada di
  // antara keduanya dan bisa dilewati langkah. Balok tak terlihat ini
  // memadatkan meja dari lantai sampai permukaan: meja benar-benar tembus-
  // tidak, sesuai yang diminta.
  const body = new THREE.Mesh(
    boxGeo(w - 0.06, h - 0.06, d - 0.06),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  body.position.set(x, (h - 0.06) / 2, z);
  kit.group.add(body);
  kit.colliders.push(body);
  const legOffsetX = w / 2 - 0.08;
  const legOffsetZ = d / 2 - 0.08;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(kit, 0.08, h, 0.08, palette.woodDark, x + sx * legOffsetX, h / 2, z + sz * legOffsetZ, false);
    }
  }
  // Rel apron di bawah tabletop + palang kaki dekat lantai: siluet meja
  // kini punya rangka kayu, bukan bidang melayang di atas empat batang.
  box(kit, w - 0.16, 0.07, 0.04, palette.woodDark, x, h - 0.075, z - d / 2 + 0.06, false);
  box(kit, w - 0.16, 0.07, 0.04, palette.woodDark, x, h - 0.075, z + d / 2 - 0.06, false);
  box(kit, 0.04, 0.07, d - 0.16, palette.woodDark, x - w / 2 + 0.06, h - 0.075, z, false);
  box(kit, 0.04, 0.07, d - 0.16, palette.woodDark, x + w / 2 - 0.06, h - 0.075, z, false);
  box(kit, w - 0.24, 0.05, 0.04, palette.wood, x, 0.14, z - legOffsetZ, false);
  box(kit, w - 0.24, 0.05, 0.04, palette.wood, x, 0.14, z + legOffsetZ, false);
}

function chair(kit: Kit, x: number, z: number, facing = 0): void {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(boxGeo(0.45, 0.07, 0.45), mat(palette.wood));
  seat.position.y = 0.45;
  g.add(seat);
  const back = new THREE.Mesh(boxGeo(0.45, 0.5, 0.07), mat(palette.wood));
  back.position.set(0, 0.72, -0.19);
  g.add(back);
  // Puncak sandaran + dua alur tegak: sandaran terbaca sebagai kayu berbilah,
  // bukan balok datar yang menempel di belakang dudukan.
  const cap = new THREE.Mesh(boxGeo(0.49, 0.06, 0.1), mat(palette.woodDark));
  cap.position.set(0, 0.99, -0.19);
  g.add(cap);
  for (const sx of [-0.12, 0.12]) {
    const groove = new THREE.Mesh(boxGeo(0.05, 0.4, 0.02), mat(palette.woodDark));
    groove.position.set(sx, 0.72, -0.15);
    g.add(groove);
  }
  // Bantalan dudukan tipis memberi warna kain di antara kayu-kayu cokelat.
  const cushion = new THREE.Mesh(boxGeo(0.41, 0.05, 0.41), mat(palette.fabricRed));
  cushion.position.y = 0.5;
  g.add(cushion);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(boxGeo(0.06, 0.45, 0.06), mat(palette.woodDark));
      leg.position.set(sx * 0.18, 0.22, sz * 0.18);
      g.add(leg);
    }
  }
  // Palang kaki melintang: ciri kursi makan kayu yang kokoh.
  for (const sz of [-1, 1]) {
    const stretcher = new THREE.Mesh(boxGeo(0.34, 0.04, 0.04), mat(palette.woodDark));
    stretcher.position.set(0, 0.15, sz * 0.18);
    g.add(stretcher);
  }
  g.position.set(x, 0, z);
  g.rotation.y = facing;
  kit.group.add(g);

  const proxy = new THREE.Mesh(
    boxGeo(0.5, 0.9, 0.5),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  proxy.position.set(x, 0.45, z);
  kit.group.add(proxy);
  kit.colliders.push(proxy);
}

function shelf(kit: Kit, x: number, z: number, w = 1.6, h = 1.9): void {
  box(kit, w, 0.08, 0.4, palette.woodDark, x, 0.1, z, true);
  box(kit, w, 0.08, 0.4, palette.woodDark, x, h / 2, z, false);
  box(kit, w, 0.08, 0.4, palette.woodDark, x, h, z, false);
  box(kit, 0.08, h, 0.4, palette.woodDark, x - w / 2, h / 2, z, true);
  box(kit, 0.08, h, 0.4, palette.woodDark, x + w / 2, h / 2, z, true);
  // Panel belakang lebih terang membingkai isi rak dan menutup tembus pandang
  // antara papan ke tembok di belakangnya.
  box(kit, w - 0.06, h - 0.04, 0.03, palette.wood, x, h / 2, z - 0.19, false);
  box(kit, w * 0.4, 0.3, 0.3, palette.paper, x - w * 0.2, h / 2 + 0.2, z, false);
  box(kit, w * 0.3, 0.25, 0.3, palette.fabricRed, x + w * 0.2, h / 2 + 0.19, z, false);
  // Deretan buku berdiri di rak atas (sisi kanan, bebas dari radio yang
  // menempati sisi kiri rak) + tumpukan kotak di rak bawah: setiap papan
  // punya pekerjaan, rak tak lagi terbaca sebagai kisi kosong.
  const bookColors = [palette.paper, palette.fabricRed, 0x4a5a4a, 0x7a5a3a];
  for (let i = 0; i < 4; i++) {
    const lean = i === 3 ? -0.18 : 0;
    const book = box(kit, 0.06, 0.26 - i * 0.02, 0.26, bookColors[i],
      x + w * 0.34 - i * 0.075, h + 0.17 - i * 0.01, z, false);
    book.rotation.z = lean;
  }
  box(kit, 0.34, 0.18, 0.3, palette.woodDark, x + w * 0.22, 0.23, z, false);
  box(kit, 0.26, 0.14, 0.24, palette.paper, x - w * 0.24, 0.21, z, false);
}

function poster(kit: Kit, x: number, y: number, z: number, w: number, h: number, color: number, rotY = 0): void {
  const mesh = new THREE.Mesh(boxGeo(w, h, 0.03), mat(color));
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  kit.group.add(mesh);
}

function benchRow(kit: Kit, z: number, count: number, spacing: number, color = palette.wood): void {
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * spacing;
    box(kit, 1.6, 0.09, 0.45, color, x, 0.45, z, true);
    box(kit, 1.6, 0.5, 0.07, color, x, 0.7, z - 0.2, false);
    box(kit, 0.1, 0.45, 0.4, palette.woodDark, x - 0.7, 0.22, z, false);
    box(kit, 0.1, 0.45, 0.4, palette.woodDark, x + 0.7, 0.22, z, false);
  }
}

function crate(kit: Kit, x: number, z: number, size = 0.7, color = palette.wood): void {
  box(kit, size, size, size, color, x, size / 2, z, true);
  // Tiga pita papan gelap melingkupi badan: peti terbaca sebagai kayu
  // berplank, bukan kubus satu warna.
  for (const fy of [0.28, 0.5, 0.72]) {
    box(kit, size + 0.015, size * 0.05, size + 0.015, 0x3a2c22, x, size * fy, z, false);
  }
}

function bed(kit: Kit, x: number, z: number, blanket = palette.fabricRed): void {
  // Struktur ranjang berlapis dan RAPI: rangka penuh (dasar, kepala, rel
  // sisi, kaki) memeluk kasur, dan tiap lapisan benar-benar menempel -
  // kasur duduk di atas dasar rangka tanpa celah melayang, selimut tergelar
  // lurus dengan tepi terlipat, bantal ditumpuk rapi di kepala ranjang.
  // Kotak dasar dipertahankan persis seperti semula (ukuran + posisi +
  // kolider) karena penanda interaktif kasur menyesuaikan benda ini.
  box(kit, 1.1, 0.28, 2.0, palette.woodDark, x, 0.14, z, true);          // dasar rangka (kolider)
  box(kit, 1.16, 0.62, 0.1, palette.wood, x, 0.5, z - 1.05, false);      // kepala ranjang
  // Dua bilah horizontal di kepala ranjang: kepala kayu punya sosok, bukan
  // panel polos yang tenggelam di kegelapan dinding.
  box(kit, 1.0, 0.05, 0.03, palette.woodDark, x, 0.66, z - 1.0, false);
  box(kit, 1.0, 0.05, 0.03, palette.woodDark, x, 0.76, z - 1.0, false);
  // Rel sisi kiri-kanan menempel di pinggir dasar: rangka terbaca memeluk
  // kasur, bukan balok telanjang yang kasurnya sekadar ditumpuk di atas.
  for (const sx of [-1, 1]) {
    box(kit, 0.07, 0.16, 2.0, palette.wood, x + sx * 0.535, 0.3, z, false);
  }
  // Rel kaki: penutup ujung kasur supaya tepi bawah selimut tidak menonjol.
  box(kit, 1.1, 0.2, 0.08, palette.woodDark, x, 0.24, z + 1.0, false);
  // Kasur: duduk tepat di puncak dasar rangka (0.28), pipih dan segaris.
  box(kit, 1.0, 0.2, 1.88, palette.paper, x, 0.38, z, false);
  // Selimut tergelar menutup dua pertiga bawah, tepi kepala dilipat putih.
  box(kit, 1.04, 0.09, 1.2, blanket, x, 0.52, z + 0.32, false);
  box(kit, 1.04, 0.05, 0.14, palette.paper, x, 0.567, z - 0.28, false);  // lipatan rapi
  // Sisi selimut terjuntai lurus ke bawah melewati rel: kain, bukan balok.
  for (const sx of [-1, 1]) {
    box(kit, 0.03, 0.16, 1.2, blanket, x + sx * 0.515, 0.47, z + 0.32, false);
  }
  // Bantal dua lapis: alas pipih plus bantal gembul di atasnya.
  box(kit, 0.6, 0.08, 0.36, palette.paper, x, 0.5, z - 0.66, false);
  box(kit, 0.52, 0.07, 0.3, palette.paper, x, 0.575, z - 0.66, false);
}

/* ==========================================================================
   Pustaka prop
   Tiap fungsi membangun satu benda yang langsung dikenali mata: tempat tidur
   berkepala, kulkas bertekan, kompor berpenggorengan, motor roda dua. Semua
   memakai material dari palet yang sama supaya adegan tetap satu bahasa.
   ========================================================================== */

function rug(kit: Kit, x: number, z: number, w: number, d: number, color = palette.fabricRed): void {
  box(kit, w, 0.03, d, color, x, 0.02, z, false);
  // Bingkai karpet: empat jalur tepi gelap memberi pola pada bidang datar,
  // sekaligus mengingatkan tepi karpet saat pemain menoleh ke bawah.
  box(kit, w, 0.012, 0.1, palette.woodDark, x, 0.04, z - d / 2 + 0.07, false);
  box(kit, w, 0.012, 0.1, palette.woodDark, x, 0.04, z + d / 2 - 0.07, false);
  box(kit, 0.1, 0.012, d - 0.2, palette.woodDark, x - w / 2 + 0.07, 0.04, z, false);
  box(kit, 0.1, 0.012, d - 0.2, palette.woodDark, x + w / 2 - 0.07, 0.04, z, false);
}

function sofa(kit: Kit, x: number, z: number, facing = 0, color = palette.fabric): void {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(boxGeo(1.9, 0.24, 0.8), mat(color));
  seat.position.y = 0.36;
  g.add(seat);
  const back = new THREE.Mesh(boxGeo(1.9, 0.6, 0.2), mat(color));
  back.position.set(0, 0.7, -0.3);
  g.add(back);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(boxGeo(0.2, 0.5, 0.8), mat(palette.woodDark));
    arm.position.set(sx * 0.85, 0.5, 0);
    g.add(arm);
    const cushion = new THREE.Mesh(boxGeo(0.78, 0.1, 0.62), mat(palette.fabricRed));
    cushion.position.set(sx * 0.42, 0.52, 0.04);
    g.add(cushion);
  }
  // Kaki kayu mengangkat badan dari lantai: dulu sofa mengambang setinggi
  // 24 cm tanpa apa pun di bawahnya.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(boxGeo(0.1, 0.26, 0.1), mat(palette.woodDark));
      leg.position.set(sx * 0.8, 0.13, sz * 0.28);
      g.add(leg);
    }
  }
  // Bantal lempar bersandar di pojok kanan: sentuhan kain terang yang
  // memecah bidang sandaran.
  const pillow = new THREE.Mesh(boxGeo(0.3, 0.26, 0.09), mat(palette.paper));
  pillow.position.set(0.4, 0.66, -0.14);
  pillow.rotation.x = -0.45;
  pillow.rotation.z = 0.18;
  g.add(pillow);
  g.position.set(x, 0, z);
  g.rotation.y = facing;
  kit.group.add(g);
  addGroupProxy(kit, g, 2.0, 0.9, 0.9);
}

/** Ganti rugositas grup: satu collider box mengikuti posisi dan rotasi grup. */
function addGroupProxy(kit: Kit, g: THREE.Group, w: number, h: number, d: number): void {
  const proxy = new THREE.Mesh(
    boxGeo(w, h, d),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  proxy.position.set(0, h / 2, 0);
  g.add(proxy);
  kit.colliders.push(proxy);
}

function wardrobe(kit: Kit, x: number, z: number, facing = 0, w = 1.3, h = 2.0): void {
  const g = new THREE.Group();
  const body = new THREE.Mesh(boxGeo(w, h, 0.55), mat(palette.wood));
  body.position.y = h / 2;
  g.add(body);
  // Belah dua daun pintu + gagang = terbaca sebagai lemari, bukan kubus.
  const seam = new THREE.Mesh(boxGeo(0.03, h - 0.1, 0.03), mat(palette.woodDark));
  seam.position.set(0, h / 2, 0.28);
  g.add(seam);
  for (const sx of [-0.16, 0.16]) {
    const handle = new THREE.Mesh(boxGeo(0.04, 0.22, 0.05), mat(palette.metal));
    handle.position.set(sx, h * 0.55, 0.3);
    g.add(handle);
  }
  const topTrim = new THREE.Mesh(boxGeo(w + 0.08, 0.07, 0.62), mat(palette.woodDark));
  topTrim.position.y = h + 0.03;
  g.add(topTrim);
  // Plinth dasar + dua alur horizontal tiap daun: lemari punya kaki dan
  // panel, bukan kubus polos yang menempel dari lantai ke langit-langit.
  const plinth = new THREE.Mesh(boxGeo(w + 0.06, 0.12, 0.6), mat(palette.woodDark));
  plinth.position.y = 0.06;
  g.add(plinth);
  for (const py of [h * 0.3, h * 0.75]) {
    for (const sx of [-1, 1]) {
      const line = new THREE.Mesh(boxGeo(w * 0.36, 0.03, 0.015), mat(palette.woodDark));
      line.position.set(sx * w * 0.24, py, 0.282);
      g.add(line);
    }
  }
  g.position.set(x, 0, z);
  g.rotation.y = facing;
  kit.group.add(g);
  addGroupProxy(kit, g, w + 0.1, h, 0.6);
}

function fridge(kit: Kit, x: number, z: number, facing = 0): void {
  const g = new THREE.Group();
  const body = new THREE.Mesh(boxGeo(0.7, 1.7, 0.65), mat(0xdcdcd4));
  body.position.y = 0.85;
  g.add(body);
  // Garis pemisah pintu atas/bawah dan dua gagang.
  const split = new THREE.Mesh(boxGeo(0.72, 0.03, 0.02), mat(palette.metal));
  split.position.set(0, 1.1, 0.34);
  g.add(split);
  for (const y of [1.4, 0.7]) {
    const handle = new THREE.Mesh(boxGeo(0.05, 0.34, 0.06), mat(palette.metal));
    handle.position.set(0.26, y, 0.35);
    g.add(handle);
  }
  // Magnet dan catatan kecil di pintu kulkas.
  const note = new THREE.Mesh(boxGeo(0.2, 0.24, 0.02), mat(palette.paper));
  note.position.set(-0.12, 1.4, 0.35);
  g.add(note);
  g.position.set(x, 0, z);
  g.rotation.y = facing;
  kit.group.add(g);
  addGroupProxy(kit, g, 0.75, 1.7, 0.7);
}

function stove(kit: Kit, x: number, z: number, facing = 0): void {
  const g = new THREE.Group();
  const body = new THREE.Mesh(boxGeo(0.7, 0.8, 0.6), mat(palette.metal));
  body.position.y = 0.4;
  g.add(body);
  const top = new THREE.Mesh(boxGeo(0.72, 0.05, 0.62), mat(0x3a3a3e));
  top.position.y = 0.82;
  g.add(top);
  for (const sx of [-0.16, 0.16]) {
    const burner = new THREE.Mesh(cylGeo(0.13, 0.13, 0.04, 8), mat(palette.metal));
    burner.position.set(sx, 0.86, 0);
    g.add(burner);
  }
  // Wajan di salah satu tungku.
  const pan = new THREE.Mesh(cylGeo(0.16, 0.13, 0.07, 8), mat(0x2f2f33));
  pan.position.set(-0.16, 0.9, 0);
  g.add(pan);
  const ovenDoor = new THREE.Mesh(boxGeo(0.56, 0.3, 0.03), mat(0x2b2b2f));
  ovenDoor.position.set(0, 0.34, 0.31);
  g.add(ovenDoor);
  // Deretan kenop + penangas belakang: muka kompor punya kontrol dan
  // perisai, bukan bidang logam kosong.
  for (const kx of [-0.2, 0, 0.2]) {
    const knob = new THREE.Mesh(cylGeo(0.025, 0.025, 0.03, 6), mat(palette.woodDark));
    knob.rotation.x = Math.PI / 2;
    knob.position.set(kx, 0.6, 0.315);
    g.add(knob);
  }
  const guard = new THREE.Mesh(boxGeo(0.68, 0.1, 0.04), mat(0x3a3a3e));
  guard.position.set(0, 0.9, -0.27);
  g.add(guard);
  g.position.set(x, 0, z);
  g.rotation.y = facing;
  kit.group.add(g);
  addGroupProxy(kit, g, 0.75, 0.9, 0.65);
}

function kitchenCounter(kit: Kit, x: number, z: number, w = 2.4, facing = 0): void {
  const g = new THREE.Group();
  const body = new THREE.Mesh(boxGeo(w, 0.85, 0.6), mat(palette.wallDark));
  body.position.y = 0.42;
  g.add(body);
  const top = new THREE.Mesh(boxGeo(w + 0.06, 0.06, 0.66), mat(0x9c8b63));
  top.position.y = 0.88;
  g.add(top);
  // Bak cuci piring.
  const sink = new THREE.Mesh(boxGeo(0.5, 0.1, 0.36), mat(palette.metal));
  sink.position.set(-w * 0.28, 0.87, 0);
  g.add(sink);
  const tap = new THREE.Mesh(cylGeo(0.03, 0.03, 0.24, 6), mat(palette.metal));
  tap.position.set(-w * 0.28, 1.0, -0.2);
  g.add(tap);
  // Kabinet: dua daun pintu.
  for (const sx of [-1, 1]) {
    const door = new THREE.Mesh(boxGeo(w * 0.44, 0.7, 0.03), mat(palette.woodDark));
    door.position.set(sx * w * 0.24, 0.4, 0.31);
    g.add(door);
  }
  // Laci di atas kabinet dengan gagang: baris horizontal yang memecah muka
  // counter menjadi kabinet yang masuk akal.
  const drawer = new THREE.Mesh(boxGeo(w - 0.06, 0.09, 0.03), mat(palette.wood));
  drawer.position.set(0, 0.797, 0.31);
  g.add(drawer);
  const drawerHandle = new THREE.Mesh(boxGeo(0.22, 0.035, 0.045), mat(palette.metal));
  drawerHandle.position.set(0, 0.797, 0.34);
  g.add(drawerHandle);
  for (const sx of [-1, 1]) {
    const dh = new THREE.Mesh(boxGeo(0.16, 0.035, 0.04), mat(palette.metal));
    dh.position.set(sx * w * 0.24, 0.66, 0.34);
    g.add(dh);
  }
  // Pita plinth gelap di garis dasar.
  const kick = new THREE.Mesh(boxGeo(w, 0.05, 0.03), mat(0x1f1f22));
  kick.position.set(0, 0.025, 0.315);
  g.add(kick);
  g.position.set(x, 0, z);
  g.rotation.y = facing;
  kit.group.add(g);
  addGroupProxy(kit, g, w + 0.1, 0.9, 0.65);
}

function tvSet(kit: Kit, x: number, z: number, facing = 0): void {
  const g = new THREE.Group();
  const stand = new THREE.Mesh(boxGeo(1.3, 0.5, 0.45), mat(palette.woodDark));
  stand.position.y = 0.25;
  g.add(stand);
  const body = new THREE.Mesh(boxGeo(1.0, 0.62, 0.24), mat(0x2b2b2f));
  body.position.y = 0.82;
  g.add(body);
  const screen = new THREE.Mesh(boxGeo(0.86, 0.48, 0.03), mat(0x11141a, { emissive: 0x0a1418 }));
  screen.position.set(0, 0.82, 0.13);
  g.add(screen);
  // Antena V di atas: TV lawas terbaca dari kejauhan, bukan kotak hitam.
  for (const sx of [-1, 1]) {
    const ant = new THREE.Mesh(cylGeo(0.008, 0.008, 0.42, 4), mat(palette.metal));
    ant.position.set(sx * 0.16, 1.34, -0.04);
    ant.rotation.z = sx * 0.45;
    g.add(ant);
  }
  // Dua laci ragam di kaki stand + kenop kuningan.
  for (const sx of [-1, 1]) {
    const door = new THREE.Mesh(boxGeo(0.5, 0.34, 0.02), mat(0x1f1f23));
    door.position.set(sx * 0.28, 0.25, 0.235);
    g.add(door);
    const knob = new THREE.Mesh(sphereGeo(0.02, 6, 5), mat(palette.metal));
    knob.position.set(sx * 0.04, 0.25, 0.25);
    g.add(knob);
  }
  g.position.set(x, 0, z);
  g.rotation.y = facing;
  kit.group.add(g);
  addGroupProxy(kit, g, 1.3, 1.1, 0.5);
}

function radioBox(kit: Kit, x: number, y: number, z: number, facing = 0): void {
  const g = new THREE.Group();
  const body = new THREE.Mesh(boxGeo(0.34, 0.2, 0.16), mat(palette.wood));
  body.position.y = 0.1;
  g.add(body);
  const speaker = new THREE.Mesh(cylGeo(0.07, 0.07, 0.02, 8), mat(0x2b2b2f));
  speaker.rotation.x = Math.PI / 2;
  speaker.position.set(-0.08, 0.1, 0.09);
  g.add(speaker);
  const dial = new THREE.Mesh(cylGeo(0.03, 0.03, 0.03, 8), mat(palette.metal));
  dial.rotation.x = Math.PI / 2;
  dial.position.set(0.1, 0.1, 0.09);
  g.add(dial);
  const antenna = new THREE.Mesh(cylGeo(0.008, 0.008, 0.34, 4), mat(palette.metal));
  antenna.position.set(0.12, 0.3, -0.02);
  antenna.rotation.z = -0.3;
  g.add(antenna);
  // Pegangan atas: radio bisa dijinjing, siluetnya tak lagi kubus datar.
  const grip = new THREE.Mesh(cylGeo(0.009, 0.009, 0.2, 4), mat(palette.woodDark));
  grip.rotation.z = Math.PI / 2;
  grip.position.set(0, 0.235, 0);
  g.add(grip);
  for (const sx of [-0.09, 0.09]) {
    const post = new THREE.Mesh(cylGeo(0.008, 0.008, 0.04, 4), mat(palette.woodDark));
    post.position.set(sx, 0.215, 0);
    g.add(post);
  }
  g.position.set(x, y, z);
  g.rotation.y = facing;
  kit.group.add(g);
}

function calendarSheet(kit: Kit, x: number, y: number, z: number, rotY = 0): void {
  const g = new THREE.Group();
  const sheet = new THREE.Mesh(boxGeo(0.4, 0.5, 0.02), mat(palette.paper));
  sheet.position.y = -0.25;
  g.add(sheet);
  const head = new THREE.Mesh(boxGeo(0.4, 0.12, 0.03), mat(0xa33a2a));
  head.position.y = 0.04;
  g.add(head);
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  kit.group.add(g);
}

function mirrorPanel(kit: Kit, x: number, y: number, z: number, w: number, h: number, rotY = 0): void {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(boxGeo(w + 0.1, h + 0.1, 0.05), mat(palette.woodDark));
  g.add(frame);
  const glass = new THREE.Mesh(
    boxGeo(w, h, 0.06),
    mat(0xc9dced, { emissive: 0x2a3d4a })
  );
  g.add(glass);
  // Pantulan miring: garis cahaya tipis membuat bidang kaca terbaca sebagai
  // cermin, bukan panel biru datar yang menempel di dinding.
  const streak = new THREE.Mesh(
    boxGeo(0.05, h * 0.7, 0.008),
    mat(0xe9f2f8, { emissive: 0x2f4450 })
  );
  streak.position.set(-w * 0.18, 0, 0.035);
  streak.rotation.z = 0.35;
  g.add(streak);
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  kit.group.add(g);
}

function pictureFrame(kit: Kit, x: number, y: number, z: number, w: number, h: number, rotY = 0): void {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(boxGeo(w, h, 0.03), mat(palette.woodDark));
  g.add(frame);
  const photo = new THREE.Mesh(boxGeo(w - 0.08, h - 0.08, 0.04), mat(palette.paper));
  photo.position.z = 0.01;
  g.add(photo);
  // Dua siluet penghuni: foto keluarga terbaca sebagai potret orang, bukan
  // kertas putih di balik kaca. Posisi dinyatakan relatif lebar/tinggi bingkai
  // supaya proporsinya ikut mengecil pada frame kecil.
  const headY = h * 0.16;
  for (const [fx, sc] of [[-0.16, 1], [0.14, 0.82]] as const) {
    const headR = 0.045 * sc;
    const bx = fx * w * 2.2;
    const head = new THREE.Mesh(sphereGeo(headR, 6, 5), mat(0x3f3a34));
    head.position.set(bx, headY, 0.032);
    g.add(head);
    const bh = 0.2 * sc;
    const body = new THREE.Mesh(boxGeo(0.11 * sc, bh, 0.012), mat(0x3f3a34));
    body.position.set(bx, headY - headR - bh / 2 + 0.01, 0.032);
    g.add(body);
  }
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  kit.group.add(g);
}

function wallClock(kit: Kit, x: number, y: number, z: number, rotY = 0): void {
  const g = new THREE.Group();
  const face = new THREE.Mesh(cylGeo(0.16, 0.16, 0.04, 12), mat(palette.paper));
  face.rotation.x = Math.PI / 2;
  g.add(face);
  const rim = new THREE.Mesh(torusGeo(0.16, 0.02, 6, 12), mat(palette.woodDark));
  g.add(rim);
  // Dua jarum yang berputar dari pusat jam, bukan dari ujungnya sendiri.
  // Jam ini berhenti di 07.05: angka yang sama dipakai kombinasi laci pada
  // bab pertama ("jam dinding menunjuk tujuh lewat lima"), jadi jarumnya
  // harus benar-benar terbaca: jam di arah 7, menit di arah 1.
  const hand = (len: number, angle: number, thick: number): void => {
    const geo = new THREE.BoxGeometry(thick, len, 0.02);
    geo.translate(0, len / 2, 0); // pangkal jarum menempel di pusat jam
    const mesh = new THREE.Mesh(geo, mat(0x2b2b2f));
    mesh.position.set(0, 0, 0.03);
    mesh.rotation.z = angle;
    g.add(mesh);
  };
  hand(0.08, (5 * Math.PI) / 6, 0.026); // jarum jam  -> arah angka 7
  hand(0.12, -Math.PI / 6, 0.018);      // jarum menit -> arah 1 (05 menit)
  // Empat penanda jam (12, 3, 6, 9) supaya wajah jam tak terbaca sebagai
  // lingkaran kosong dari dekat.
  for (const [tx, ty, tw, th] of [
    [0, 0.115, 0.02, 0.045], [0.115, 0, 0.045, 0.02],
    [0, -0.115, 0.02, 0.045], [-0.115, 0, 0.045, 0.02]
  ] as const) {
    const tick = new THREE.Mesh(boxGeo(tw, th, 0.01), mat(0x2b2b2f));
    tick.position.set(tx, ty, 0.025);
    g.add(tick);
  }
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  kit.group.add(g);
}

/** Amplop: badan kertas, lidah yang terbuka setengah, dan segel lilin. */
function envelope(kit: Kit, x: number, y: number, z: number, rotY = 0): void {
  const g = new THREE.Group();
  const body = new THREE.Mesh(boxGeo(0.3, 0.015, 0.2), mat(palette.paper));
  g.add(body);
  const flap = new THREE.Mesh(boxGeo(0.28, 0.01, 0.11), mat(palette.paper));
  flap.position.set(0, 0.03, -0.12);
  flap.rotation.x = -0.7;
  g.add(flap);
  const seal = new THREE.Mesh(cylGeo(0.025, 0.025, 0.012, 8), mat(0x7a3b34));
  seal.position.set(0, 0.014, 0.055);
  g.add(seal);
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  kit.group.add(g);
}

/** Dompet: dua lapis kulit yang ditutup miring + kancing kuningan. */
function wallet(kit: Kit, x: number, y: number, z: number, rotY = 0): void {
  const g = new THREE.Group();
  const base = new THREE.Mesh(boxGeo(0.22, 0.03, 0.14), mat(palette.woodDark));
  g.add(base);
  const cover = new THREE.Mesh(boxGeo(0.22, 0.02, 0.14), mat(0x4a382c));
  cover.position.set(0, 0.032, -0.006);
  cover.rotation.x = -0.1;
  g.add(cover);
  const clasp = new THREE.Mesh(boxGeo(0.03, 0.012, 0.02), mat(palette.metal));
  clasp.position.set(0.07, 0.04, 0.07);
  g.add(clasp);
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  kit.group.add(g);
}

/** Piring: badan cekung + cincin pinggiran supaya terbaca dari atas. */
function plate(kit: Kit, x: number, y: number, z: number): void {
  const base = new THREE.Mesh(cylGeo(0.11, 0.09, 0.025, 10), mat(palette.paper));
  base.position.set(x, y, z);
  kit.group.add(base);
  const rim = new THREE.Mesh(torusGeo(0.1, 0.014, 4, 12), mat(palette.paper));
  rim.rotation.x = Math.PI / 2;
  rim.position.set(x, y + 0.014, z);
  kit.group.add(rim);
}

/** Gelas: tabung berkaca, cincin bibir, telinga di samping, teh di dalam. */
function cup(kit: Kit, x: number, y: number, z: number): void {
  const body = new THREE.Mesh(cylGeo(0.05, 0.045, 0.16, 8), mat(palette.glass));
  body.position.set(x, y, z);
  kit.group.add(body);
  const lip = new THREE.Mesh(torusGeo(0.05, 0.008, 4, 10), mat(palette.glass));
  lip.rotation.x = Math.PI / 2;
  lip.position.set(x, y + 0.08, z);
  kit.group.add(lip);
  const ear = new THREE.Mesh(torusGeo(0.03, 0.008, 4, 8, Math.PI * 1.3), mat(palette.glass));
  ear.position.set(x + 0.055, y + 0.01, z);
  kit.group.add(ear);
  const tea = new THREE.Mesh(cylGeo(0.042, 0.042, 0.01, 8), mat(0x4a3320));
  tea.position.set(x, y + 0.05, z);
  kit.group.add(tea);
}

/** Obeng: gagang oranye tebal + batang baja tipis, tergeletak di meja. */
function screwdriver(kit: Kit, x: number, y: number, z: number, rotY = 0): void {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(cylGeo(0.03, 0.026, 0.13, 8), mat(0xb35a2a));
  handle.rotation.z = Math.PI / 2;
  handle.position.x = -0.075;
  g.add(handle);
  const collar = new THREE.Mesh(cylGeo(0.018, 0.018, 0.03, 8), mat(palette.metal));
  collar.rotation.z = Math.PI / 2;
  collar.position.x = 0.005;
  g.add(collar);
  const shaft = new THREE.Mesh(cylGeo(0.009, 0.009, 0.17, 6), mat(palette.metal));
  shaft.rotation.z = Math.PI / 2;
  shaft.position.x = 0.1;
  g.add(shaft);
  const tip = new THREE.Mesh(boxGeo(0.02, 0.014, 0.006), mat(0x8a8a90));
  tip.position.x = 0.19;
  g.add(tip);
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  kit.group.add(g);
}

/** Kotak sekring: pelat logam di dinding, tutup kotak, tiga sakelar. */
function fuseBox(kit: Kit, x: number, y: number, z: number, facing = 0): void {
  const g = new THREE.Group();
  const body = new THREE.Mesh(boxGeo(0.34, 0.42, 0.07), mat(palette.metal));
  g.add(body);
  const cover = new THREE.Mesh(boxGeo(0.28, 0.3, 0.02), mat(0x6b7076));
  cover.position.set(0, -0.03, 0.04);
  g.add(cover);
  for (let i = 0; i < 3; i++) {
    const sw = new THREE.Mesh(boxGeo(0.05, 0.07, 0.03), mat(i === 1 ? 0x9fb6cc : 0x3a3f45));
    sw.position.set(-0.08 + i * 0.08, 0.02, 0.055);
    g.add(sw);
  }
  const label = new THREE.Mesh(boxGeo(0.14, 0.05, 0.008), mat(palette.paper));
  label.position.set(0, 0.16, 0.045);
  g.add(label);
  g.position.set(x, y, z);
  g.rotation.y = facing;
  kit.group.add(g);
}

function hangingLamp(kit: Kit, x: number, ceilY: number, z: number, color = palette.lamp, intensity = 1.0, drop = 0.6): void {
  const cord = new THREE.Mesh(cylGeo(0.015, 0.015, drop, 4), mat(0x1a1a1a));
  cord.position.set(x, ceilY - drop / 2, z);
  kit.group.add(cord);
  const shade = new THREE.Mesh(coneGeo(0.26, 0.3, 8), mat(color, { emissive: color }));
  shade.position.set(x, ceilY - drop - 0.1, z);
  kit.group.add(shade);
  const bulb = new THREE.Mesh(sphereGeo(0.07, 6, 5), mat(color, { emissive: color }));
  bulb.position.set(x, ceilY - drop - 0.22, z);
  kit.group.add(bulb);
  const light = new THREE.PointLight(color, intensity, 10);
  light.position.set(x, ceilY - drop - 0.3, z);
  kit.group.add(light);
}

function ceilingFan(kit: Kit, x: number, ceilY: number, z: number): void {
  const rod = new THREE.Mesh(cylGeo(0.03, 0.03, 0.3, 6), mat(palette.metal));
  rod.position.set(x, ceilY - 0.15, z);
  kit.group.add(rod);
  const hub = new THREE.Mesh(cylGeo(0.12, 0.12, 0.1, 8), mat(palette.metal));
  hub.position.set(x, ceilY - 0.32, z);
  kit.group.add(hub);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const blade = new THREE.Mesh(boxGeo(0.85, 0.03, 0.16), mat(0x8a8578));
    blade.position.set(x + Math.cos(a) * 0.5, ceilY - 0.35, z + Math.sin(a) * 0.5);
    blade.rotation.y = -a;
    kit.group.add(blade);
  }
}

/** Papan nama berdiri: dua kaki, papan, dan garis "tulisan". */
function signBoard(kit: Kit, x: number, z: number, rotY = 0, boardColor = palette.wood, w = 1.6, h = 0.7): void {
  const g = new THREE.Group();
  const board = new THREE.Mesh(boxGeo(w, h, 0.08), mat(boardColor));
  board.position.y = 1.1;
  g.add(board);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(boxGeo(0.08, 1.1, 0.08), mat(palette.woodDark));
    leg.position.set(sx * (w / 2 - 0.1), 0.55, 0);
    g.add(leg);
  }
  for (let i = 0; i < 3; i++) {
    const line = new THREE.Mesh(boxGeo(w * 0.7, 0.05, 0.02), mat(palette.paper));
    line.position.set(0, 1.28 - i * 0.16, 0.05);
    g.add(line);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  kit.group.add(g);
  addGroupProxy(kit, g, w, 1.4, 0.2);
}

/** Spanduk/kain tergantung: tiang dua sisi + kain yang sedikit melengkung. */
function banner(kit: Kit, x: number, y: number, z: number, w: number, rotY = 0, color = palette.fabricRed): void {
  const g = new THREE.Group();
  const cloth = new THREE.Mesh(boxGeo(w, 0.7, 0.04), mat(color));
  g.add(cloth);
  for (const sx of [-1, 1]) {
    const line = new THREE.Mesh(boxGeo(w * 0.28, 0.06, 0.02), mat(palette.paper));
    line.position.set(sx * w * 0.16, 0.12, 0.03);
    g.add(line);
  }
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  kit.group.add(g);
}

/** Deret sachet/kopi tergantung: rel kecil dan kantong yang berayun. */
function sachetStrip(kit: Kit, x: number, y: number, z: number, count = 6, rotY = 0): void {
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const pouch = new THREE.Mesh(
      boxGeo(0.09, 0.15, 0.02),
      mat(i % 2 ? 0xc23a3a : 0x3a6ea5)
    );
    pouch.position.set((i - (count - 1) / 2) * 0.11, -0.08 - (i % 2) * 0.03, 0);
    g.add(pouch);
  }
  const rail = new THREE.Mesh(boxGeo(count * 0.12, 0.03, 0.03), mat(palette.metal));
  rail.position.y = 0.02;
  g.add(rail);
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  kit.group.add(g);
}

function motorbike(kit: Kit, x: number, z: number, rotY = 0): void {
  const g = new THREE.Group();
  const body = new THREE.Mesh(boxGeo(0.34, 0.36, 1.5), mat(0x7a2f2a));
  body.position.y = 0.62;
  g.add(body);
  const seat = new THREE.Mesh(boxGeo(0.3, 0.12, 0.6), mat(0x1f1f22));
  seat.position.set(0, 0.86, -0.15);
  g.add(seat);
  for (const sz of [-0.62, 0.62]) {
    const wheel = new THREE.Mesh(cylGeo(0.3, 0.3, 0.14, 10), mat(0x17171a));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0, 0.3, sz);
    g.add(wheel);
    const fender = new THREE.Mesh(boxGeo(0.2, 0.1, 0.5), mat(0x7a2f2a));
    fender.position.set(0, 0.58, sz);
    g.add(fender);
  }
  const bar = new THREE.Mesh(boxGeo(0.6, 0.05, 0.05), mat(palette.metal));
  bar.position.set(0, 1.0, 0.62);
  g.add(bar);
  const head = new THREE.Mesh(sphereGeo(0.09, 6, 5), mat(0xd8cfbc, { emissive: 0x2a2a20 }));
  head.position.set(0, 0.9, 0.72);
  g.add(head);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  kit.group.add(g);
  addGroupProxy(kit, g, 0.6, 1.0, 1.7);
}

function bicycle(kit: Kit, x: number, z: number, rotY = 0): void {
  const g = new THREE.Group();
  for (const sz of [-0.55, 0.55]) {
    const wheel = new THREE.Mesh(torusGeo(0.32, 0.04, 5, 12), mat(0x17171a));
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(0, 0.32, sz);
    g.add(wheel);
  }
  const frame = new THREE.Mesh(boxGeo(0.05, 0.05, 1.0), mat(0x2f5f6b));
  frame.position.set(0, 0.6, 0);
  g.add(frame);
  const seat = new THREE.Mesh(boxGeo(0.16, 0.06, 0.28), mat(0x1f1f22));
  seat.position.set(0, 0.86, -0.35);
  g.add(seat);
  const bar = new THREE.Mesh(boxGeo(0.5, 0.04, 0.04), mat(palette.metal));
  bar.position.set(0, 0.95, 0.5);
  g.add(bar);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  kit.group.add(g);
  addGroupProxy(kit, g, 0.4, 1.0, 1.4);
}

function scarecrow(kit: Kit, x: number, z: number, rotY = 0): void {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(cylGeo(0.06, 0.07, 2.0, 6), mat(palette.woodDark));
  pole.position.y = 1.0;
  g.add(pole);
  const arms = new THREE.Mesh(boxGeo(1.5, 0.08, 0.08), mat(palette.woodDark));
  arms.position.y = 1.5;
  g.add(arms);
  const shirt = new THREE.Mesh(boxGeo(0.6, 0.6, 0.3), mat(palette.fabric));
  shirt.position.y = 1.45;
  g.add(shirt);
  const head = new THREE.Mesh(sphereGeo(0.18, 6, 5), mat(0xcbb98a));
  head.position.y = 1.92;
  g.add(head);
  const hat = new THREE.Mesh(coneGeo(0.32, 0.24, 8), mat(0x8a7f66));
  hat.position.y = 2.08;
  g.add(hat);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  kit.group.add(g);
  const proxy = new THREE.Mesh(boxGeo(0.5, 2.1, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
  proxy.position.set(x, 1.05, z);
  kit.group.add(proxy);
  kit.colliders.push(proxy);
}

function haystack(kit: Kit, x: number, z: number, size = 1.4): void {
  const hay = new THREE.Mesh(coneGeo(size, size * 1.2, 8), mat(0xb59a5e));
  hay.position.set(x, size * 0.6, z);
  kit.group.add(hay);
  const proxy = new THREE.Mesh(cylGeo(size * 0.7, size * 0.7, size, 6), new THREE.MeshBasicMaterial({ visible: false }));
  proxy.position.set(x, size * 0.5, z);
  kit.group.add(proxy);
  kit.colliders.push(proxy);
}

function basket(kit: Kit, x: number, z: number, size = 0.34, color = 0x9a7b4a): void {
  const body = new THREE.Mesh(cylGeo(size, size * 0.75, size * 1.1, 8), mat(color));
  body.position.set(x, size * 0.55, z);
  kit.group.add(body);
  const rim = new THREE.Mesh(torusGeo(size, 0.03, 5, 10), mat(palette.woodDark));
  rim.rotation.x = Math.PI / 2;
  rim.position.set(x, size * 1.1, z);
  kit.group.add(rim);
}

function sack(kit: Kit, x: number, z: number, size = 0.4, color = palette.paper): void {
  const body = new THREE.Mesh(cylGeo(size * 0.7, size, size * 1.4, 7), mat(color));
  body.position.set(x, size * 0.7, z);
  kit.group.add(body);
  const neck = new THREE.Mesh(cylGeo(size * 0.3, size * 0.5, size * 0.3, 7), mat(color));
  neck.position.set(x, size * 1.5, z);
  kit.group.add(neck);
}

function woodPile(kit: Kit, x: number, z: number, rows = 3): void {
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < 4 - (r % 2); i++) {
      const log = new THREE.Mesh(cylGeo(0.11, 0.11, 1.2, 6), mat(palette.woodDark));
      log.rotation.z = Math.PI / 2;
      log.position.set(x, 0.12 + r * 0.22, z + (i - 1.5) * 0.24);
      kit.group.add(log);
    }
  }
}

function bucket(kit: Kit, x: number, z: number, color = palette.metal): void {
  const body = new THREE.Mesh(cylGeo(0.18, 0.14, 0.32, 8), mat(color));
  body.position.set(x, 0.16, z);
  kit.group.add(body);
  const handle = new THREE.Mesh(torusGeo(0.18, 0.015, 4, 10, Math.PI), mat(color));
  handle.position.set(x, 0.32, z);
  kit.group.add(handle);
}

/**
 * Pintu lepas dari tembok: kusen, daun, ambang, dan gagang, bisa dipasang di
 * dinding mana pun lewat `rotY`. Berbeda dengan `doorOnZ` yang menempel di
 * dinding +z ruangan.
 */
function doorPanel(kit: Kit, x: number, z: number, rotY = 0, trim = palette.woodDark): void {
  const g = new THREE.Group();
  const frameW = 1.3;
  const frameH = 2.15;
  const jambL = new THREE.Mesh(boxGeo(0.1, frameH, 0.16), mat(trim));
  jambL.position.set(-frameW / 2, frameH / 2, 0);
  g.add(jambL);
  const jambR = jambL.clone();
  jambR.position.x = frameW / 2;
  g.add(jambR);
  const head = new THREE.Mesh(boxGeo(frameW + 0.1, 0.12, 0.16), mat(trim));
  head.position.y = frameH + 0.06;
  g.add(head);
  const leaf = new THREE.Mesh(boxGeo(1.05, 2.0, 0.07), mat(trim));
  leaf.position.y = 1.0;
  g.add(leaf);
  const panel = new THREE.Mesh(boxGeo(0.4, 0.7, 0.08), mat(palette.wood));
  panel.position.set(0, 1.2, 0.01);
  g.add(panel);
  const knob = new THREE.Mesh(sphereGeo(0.05, 6, 5), mat(palette.metal));
  knob.position.set(0.4, 1.0, 0.06);
  g.add(knob);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  kit.group.add(g);
}

/* ==========================================================================
   Laci ruang tengah: prop yang benar-benar bisa dibuka

   Laci ini bagian dari rantai naskah b01/b04: kunci di kotak sekring
   membuka pelat angka, angka 0705 (jam dinding yang berhenti) membuat daun
   laci meluncur keluar, dan senter menunggu di dalam. Karena otomatisasi
   memainkan bab berulang, semua kendali harus idempoten: status disimpan
   di modul, dibangun ulang TERTUTUP tiap scene, lalu main.ts
   menyinkronkannya dengan naskah (sudah pernah mengambil isinya → langsung
   terbuka tanpa animasi).
   ========================================================================== */

let drawerSlide: THREE.Group | null = null;
let drawerSenter: THREE.Group | null = null;
/** 0 = tertutup, 1 = terbuka; nilai animasi berjalan di antaranya. */
let drawerT = 0;
let drawerTarget = 0;
let drawerSenterVisible = true;
let drawerLastTick = 0;

/**
 * Buka atau tutup laci (beranimasi). `instant` dipakai saat sinkron state
 * bab supaya laci tidak meluncur di depan pemain setiap masuk scene.
 */
export function setDrawerOpen(open: boolean, instant = false): void {
  drawerTarget = open ? 1 : 0;
  if (instant) {
    drawerT = drawerTarget;
    if (drawerSlide) drawerSlide.position.z = drawerT * 0.3;
  }
}

/** Senter di dalam laci hilang begitu barangnya masuk tas pemain. */
export function setDrawerSenterVisible(visible: boolean): void {
  drawerSenterVisible = visible;
  if (drawerSenter) drawerSenter.visible = visible;
}

/**
 * Laci: badan BERONGGA, dua daun statis, dan satu daun yang meluncur keluar.
 * Slot laci tengah dibiarkan kosong: saat daun meluncur yang terlihat adalah
 * gelapnya rongga (sisi, sekat, dan belakang), bukan balak kayu utuh yang
 * menolak dibuka. Daun laci tengah membawa bak berisi senter.
 */
function chestOfDrawers(kit: Kit, x: number, z: number, rotY = 0): void {
  const g = new THREE.Group();
  const W = 1.1, H = 0.95, D = 0.5;
  const add = (w: number, h: number, d: number, color: number, px: number, py: number, pz: number): THREE.Mesh => {
    const m = new THREE.Mesh(boxGeo(w, h, d), mat(color));
    m.position.set(px, py, pz);
    g.add(m);
    return m;
  };

  // Badan: sisi kiri/kanan, tutup, dasar, belakang.
  add(0.04, H, D, palette.wood, -(W / 2 - 0.02), H / 2, 0);
  add(0.04, H, D, palette.wood, W / 2 - 0.02, H / 2, 0);
  add(W, 0.04, D, palette.wood, 0, H - 0.02, 0);
  add(W, 0.04, D, palette.wood, 0, 0.02, 0);
  add(W, H, 0.04, palette.wood, 0, H / 2, -(D / 2 - 0.02));
  // Dua sekat yang membatasi slot laci tengah (rongga y 0,375..0,625).
  add(W - 0.02, 0.03, D - 0.06, palette.woodDark, 0, 0.36, 0);
  add(W - 0.02, 0.03, D - 0.06, palette.woodDark, 0, 0.64, 0);

  // Daun laci berpegang gagang; dipakai untuk daun statis maupun yang meluncur.
  const addFront = (parent: THREE.Object3D, y: number): void => {
    const front = new THREE.Mesh(boxGeo(1.0, 0.25, 0.03), mat(palette.woodDark));
    front.position.set(0, y, 0.26);
    parent.add(front);
    const handle = new THREE.Mesh(boxGeo(0.24, 0.04, 0.05), mat(palette.metal));
    handle.position.set(0, y, 0.29);
    parent.add(handle);
  };
  addFront(g, 0.22);
  addFront(g, 0.78);

  // Laci tengah: daun + bak laci berisi senter, meluncur ke arah +z lokal
  // (muka laci menghadap ke ruangan pada pemakaian bawaan rotY = 0).
  const slide = new THREE.Group();
  addFront(slide, 0.5);
  const tray = (w: number, h: number, d: number, px: number, py: number, pz: number): void => {
    const m = new THREE.Mesh(boxGeo(w, h, d), mat(palette.woodDark));
    m.position.set(px, py, pz);
    slide.add(m);
  };
  tray(0.94, 0.02, 0.4, 0, 0.385, 0.04);        // dasar bak
  tray(0.02, 0.18, 0.4, -0.46, 0.48, 0.04);     // dinding kiri
  tray(0.02, 0.18, 0.4, 0.46, 0.48, 0.04);      // dinding kanan
  tray(0.94, 0.18, 0.02, 0, 0.48, -0.16);       // dinding belakang

  // Senter terbaring di dasar bak: isi laci yang dicari pemain di b01.
  const senter = new THREE.Group();
  const bodyM = new THREE.Mesh(cylGeo(0.017, 0.017, 0.12, 8), mat(0x2b2f33));
  bodyM.rotation.z = Math.PI / 2;
  senter.add(bodyM);
  const headM = new THREE.Mesh(cylGeo(0.03, 0.02, 0.05, 8), mat(palette.metal));
  headM.rotation.z = Math.PI / 2;
  headM.position.x = 0.085;
  senter.add(headM);
  const lensM = new THREE.Mesh(
    cylGeo(0.024, 0.024, 0.012, 8),
    mat(0xfff2c0, { emissive: 0x6a5c38 })
  );
  lensM.rotation.z = Math.PI / 2;
  lensM.position.x = 0.114;
  senter.add(lensM);
  senter.position.set(-0.1, 0.415, 0.06);
  senter.rotation.y = 0.3;
  slide.add(senter);

  g.add(slide);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  kit.group.add(g);
  addGroupProxy(kit, g, 1.15, 1.0, 0.55);

  // Scene dibangun ulang selalu dari tertutup; main.ts menyinkronkannya
  // setelah scene siap (lihat Game.syncDrawerState).
  drawerSlide = slide;
  drawerSenter = senter;
  drawerT = 0;
  drawerTarget = 0;
  drawerSenterVisible = true;
  drawerLastTick = 0;
  slide.position.z = 0;
  senter.visible = true;

  addDynamicTick((t) => {
    if (drawerT !== drawerTarget) {
      const dt = Math.min(0.08, Math.max(0, t - drawerLastTick));
      drawerT += (drawerTarget > drawerT ? 1 : -1) * 1.7 * dt;
      if (drawerTarget === 1 && drawerT > 1) drawerT = 1;
      if (drawerTarget === 0 && drawerT < 0) drawerT = 0;
      // Smoothstep: mulai pelan, meluncur, mereda sebelum mentok.
      const e = drawerT * drawerT * (3 - 2 * drawerT);
      slide.position.z = e * 0.3;
    }
    drawerLastTick = t;
    senter.visible = drawerSenterVisible;
  });
}

/** Genggam telepon rumah / ponsel di atas permukaan. */
function phoneDevice(kit: Kit, x: number, y: number, z: number, rotY = 0): void {
  const g = new THREE.Group();
  const body = new THREE.Mesh(boxGeo(0.16, 0.03, 0.3), mat(0x1f1f22));
  g.add(body);
  const screen = new THREE.Mesh(boxGeo(0.12, 0.01, 0.2), mat(0x8fb6d6, { emissive: 0x2a4a6a }));
  screen.position.y = 0.02;
  g.add(screen);
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  kit.group.add(g);
}

function shoesPair(kit: Kit, x: number, z: number, rotY = 0): void {
  for (const sx of [-0.12, 0.12]) {
    const shoe = new THREE.Mesh(boxGeo(0.12, 0.09, 0.3), mat(0x2f2f33));
    shoe.position.set(x + sx, 0.05, z);
    shoe.rotation.y = rotY;
    kit.group.add(shoe);
  }
}

/** Percikan api: inti menyala + cincin kayu bakar. */
function firePit(kit: Kit, x: number, z: number, size = 1.0): void {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const stone = new THREE.Mesh(sphereGeo(0.16, 5, 4), mat(0x6a655c));
    stone.position.set(x + Math.cos(a) * size, 0.1, z + Math.sin(a) * size);
    kit.group.add(stone);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const log = new THREE.Mesh(cylGeo(0.08, 0.08, size * 1.1, 5), mat(palette.woodDark));
    log.rotation.z = Math.PI / 2;
    log.rotation.y = a;
    log.position.set(x, 0.14, z);
    kit.group.add(log);
  }
  const core = new THREE.Mesh(
    sphereGeo(size * 0.4, 6, 5),
    mat(palette.ember, { emissive: palette.ember })
  );
  core.position.set(x, 0.2, z);
  kit.group.add(core);
  const light = new THREE.PointLight(palette.ember, 1.4, 12);
  light.position.set(x, 0.9, z);
  kit.group.add(light);
}

/* ==========================================================================
   Penghuni & prop adegan luar
   ========================================================================== */

interface FigureOptions {
  rotY?: number;
  shirt?: number;
  pants?: number;
  skin?: number;
  /** Duduk: paha mendatar, betis turun: dipakai di kursi dan bangku. */
  seated?: boolean;
  /** Siluet gelap tanpa wajah untuk sosok horor. */
  shadow?: boolean;
  /** Topi petani/patroli. */
  hat?: boolean;
  scale?: number;
  /** Kerudung menutup kepala dan bahu (warga muslimah). */
  hijab?: boolean;
  hijabColor?: number;
  /** Sarong: rok lebar satu potong menggantikan celana. */
  sarong?: boolean;
  sarongColor?: number;
}

/** Hash kecil deterministik dari posisi: figur di tempat sama selalu sama. */
function figureHash(x: number, z: number): number {
  let h = Math.imul(Math.round(x * 10) + 374761393, 668265263);
  h ^= Math.imul(Math.round(z * 10) + 1442695041, 2246822519);
  h = Math.imul(h ^ (h >>> 15), 3266489917);
  return (h ^ (h >>> 13)) >>> 0;
}

const FIGURE_SKIN = [0xb08968, 0x9c7454, 0xc49a6c, 0x7f5a3c, 0xd8b08a, 0x8a6544];
const FIGURE_SHIRT = [
  0x5d6b74, 0x7a4038, 0x3a4a6b, 0x6d5f52, 0xc9a227, 0x4f6b5c,
  0x8a5a3a, 0x74685a, 0x5a3a4a, 0x2f3d33, 0x8f6d4f, 0x455a64
];

interface FigureIdle {
  group: THREE.Group;
  head?: THREE.Object3D;
  torso?: THREE.Object3D;
  arms: THREE.Object3D[];
  /** Fase acak per figur supaya tidak serempak. */
  phase: number;
  sway: number;
  bob: number;
  turnAt: number;
  turnTo: number;
  turnHold: number;
}

/** Registri figur yang sedang diam di adegan; dikosongkan tiap ganti scene. */
const figureIdle: FigureIdle[] = [];

/** Bersihkan registri figur ketika scene dibongkar (SceneFactory.build). */
export function resetFigures(): void {
  figureIdle.length = 0;
}

/* ==========================================================================
   Animasi dinamis scene (bukan figur)
   Pintu yang berayun, awan yang melintas, siluet pohon yang mengayun, dan
   burung yang menyeberang semuanya mendaftar tick di sini. Registri dibuang
   tiap SceneFactory.build supaya tick scene lama tidak menyentuh mesh yang
   sudah dibongkar.
   ========================================================================== */

const dynamicTicks: ((t: number) => void)[] = [];

/**
 * Daftarkan tick animasi scene; `t` dalam detik nyata (performance.now/1000).
 * Mengembalikan fungsi pembuang: dipakai animasi sekali-jalan seperti
 * `animatePickup` supaya tick-nya tidak menumpuk.
 */
export function addDynamicTick(fn: (t: number) => void): () => void {
  dynamicTicks.push(fn);
  return () => {
    const i = dynamicTicks.indexOf(fn);
    if (i >= 0) dynamicTicks.splice(i, 1);
  };
}

/**
 * Animasi "barang diambil": prop mengecil sambil sedikit terangkat lalu
 * hilang dari pandangan. Skala-saja (bukan opacity) karena material prop
 * berbagi dengan prop lain lewat materialCache: mengubah opasitas berarti
 * ikut memudar benda lain di scene yang sama.
 */
export function animatePickup(objects: THREE.Object3D[], duration = 0.4): void {
  if (!objects.length) return;
  const states = objects.map(o => {
    // Prop ini dianimasikan sendiri (mengecil & terangkat): aktifkan kembali
    // penyusunan matriks lokal yang dibekukan SceneFactory.build.
    o.matrixAutoUpdate = true;
    return { obj: o, s: o.scale.x, y: o.position.y };
  });
  let start = -1;
  const remove = addDynamicTick((t) => {
    if (start < 0) start = t;
    const k = Math.min(1, (t - start) / duration);
    const e = k * k; // percepat di akhir: terasa seperti "terangkat lalu habis"
    for (const st of states) {
      st.obj.scale.setScalar(Math.max(0.001, st.s * (1 - e)));
      st.obj.position.y = st.y + 0.12 * e;
    }
    if (k >= 1) {
      for (const st of states) {
        st.obj.visible = false;
        st.obj.scale.setScalar(st.s);
        st.obj.position.y = st.y;
      }
      remove();
    }
  });
}

/** Sembunyikan prop tanpa animasi (dipakai saat sinkronisasi awal scene). */
export function hidePickupInstantly(objects: THREE.Object3D[]): void {
  for (const o of objects) o.visible = false;
}

/** Buang semua tick animasi scene (dipanggil SceneFactory.build). */
export function resetDynamics(): void {
  dynamicTicks.length = 0;
  // Prop laci juga terikat scene: grup dari scene lama yang sudah dibongkar
  // tidak boleh tersisa sebagai target animasi.
  drawerSlide = null;
  drawerSenter = null;
}

/** Jalankan semua tick animasi scene tiap frame dari loop utama. */
export function updateDynamics(t: number): void {
  for (const fn of dynamicTicks) fn(t);
}

/**
 * Animasi idle figur warga: napas dada, goyang berat badan yang sangat
 * halus, ayun lengan, dan sesekali menoleh kepala. Tanpa ini figur terbaca
 * sebagai patung kaku; dengan ini ruangan terasa berpenghuni. Dipanggil tiap
 * frame dari loop utama (main.ts), memakai detik nyata: fase tiap figur
 * berbeda supaya tidak bergerak serempak.
 */
export function updateFigures(t: number): void {
  for (const f of figureIdle) {
    if (!f.group.parent) continue;
    // Goyang berat badan + bob sangat halus.
    f.group.rotation.z = Math.sin(t * 0.55 + f.phase) * 0.018 * f.sway;
    f.group.position.y = Math.sin(t * 0.85 + f.phase) * 0.012 * f.bob;
    if (f.torso) {
      // Tarikan napas: dada mengembang-menyusut nyaris tak terasa.
      f.torso.scale.y = 1 + Math.sin(t * 1.15 + f.phase) * 0.012;
    }
    // Menoleh sesekali: kepala berputar pelan lalu diam sebentar.
    if (f.turnAt < 0) {
      f.turnAt = t + (f.phase / (Math.PI * 2)) * 5.5;
    } else if (t > f.turnAt) {
      f.turnAt = t + 3 + (f.phase % 1.7);
      f.turnTo = Math.sin(f.phase * 2.3) * 0.42;
      f.turnHold = t + 1.1 + (f.phase % 0.9);
    }
    if (f.head) {
      const target = t < f.turnHold ? f.turnTo : 0;
      f.head.rotation.y += (target - f.head.rotation.y) * 0.05;
    }
    // Ayun lengan sangat pelan, bergantian kiri-kanan.
    for (let i = 0; i < f.arms.length; i++) {
      f.arms[i].rotation.x = Math.sin(t * 0.75 + f.phase + i * 2.1) * 0.05;
    }
  }
}

/**
 * Orang sederhana yang langsung terbaca sebagai manusia: kaki, badan, lengan,
 * leher, kepala, dan rambut. Tanpa ini adegan berisi meja dan kursi yang
 * dibiarkan kosong, sementara naskah menyebut "warga berkumpul", "sopir",
 * dan "Rudi menunggu".
 *
 * Tiap figur divariasi deterministik dari hash posisi (x, z): tinggi, lebar
 * badan, warna kulit dan baju default, model rambut (pendek/panjang/sanggul),
 * kerudung, dan lebar kaki: jadi warga tidak seragam seperti cetakan, tapi
 * juga tidak berubah antar pemuatan. Semua komponen kepala (rambut, mata,
 * kerudung, topi) menempel pada mesh kepala supaya ikut menoleh saat animasi
 * idle berjalan.
 */
function figure(kit: Kit, x: number, z: number, opts: FigureOptions = {}): THREE.Group {
  const g = new THREE.Group();
  // Grup figur dianimasikan di tempat (napas dada, menoleh, ayun lengan):
  // seluruh mesh anaknya tidak boleh dibekukan oleh SceneFactory.build.
  g.userData.animatedLocal = true;
  const seed = figureHash(x, z);
  const heightVar = 0.94 + ((seed >>> 0) % 13) / 13 * 0.12; // 0,94..1,06
  const bw = 0.92 + ((seed >>> 4) % 9) / 9 * 0.18;           // 0,92..1,10
  const hairStyle = (seed >>> 7) % 3;                        // 0 pendek, 1 panjang, 2 sanggul
  const shirt = opts.shirt ?? FIGURE_SHIRT[(seed >>> 10) % FIGURE_SHIRT.length];
  const pants = opts.pants ?? 0x33333c;
  const skin = opts.shadow ? 0x121218 : (opts.skin ?? FIGURE_SKIN[(seed >>> 16) % FIGURE_SKIN.length]);
  const seated = opts.seated ?? false;
  const hijab = opts.hijab ?? false;
  const sarong = opts.sarong ?? false;
  const sarongColor = opts.sarongColor ?? shirt;
  const hijabColor = opts.hijabColor ?? FIGURE_SHIRT[(seed >>> 22) % FIGURE_SHIRT.length];
  const legX = 0.1 + ((seed >>> 26) % 4) * 0.012;            // 0,10..0,14
  const hipY = seated ? 0.46 : 0.86;
  const phase = ((seed >>> 0) % 1000) / 1000 * Math.PI * 2;

  if (sarong && !seated) {
    // Sarong: rok lebar satu potong; kaki pendek dan sepatu di bawahnya.
    const skirt = new THREE.Mesh(boxGeo(0.44 * bw, hipY - 0.02, 0.32 * bw), mat(sarongColor));
    skirt.position.set(0, (hipY - 0.02) / 2, 0);
    g.add(skirt);
    for (const sx of [-legX, legX]) {
      const shin = new THREE.Mesh(boxGeo(0.13, 0.2, 0.15), mat(skin));
      shin.position.set(sx, 0.12, 0.02);
      g.add(shin);
      const shoe = new THREE.Mesh(boxGeo(0.16, 0.08, 0.26), mat(0x1f1f22));
      shoe.position.set(sx, 0.04, 0.05);
      g.add(shoe);
    }
  } else {
    for (const sx of [-legX, legX]) {
      if (seated) {
        const thigh = new THREE.Mesh(boxGeo(0.16 * bw, 0.16, 0.4), mat(pants));
        thigh.position.set(sx, hipY, 0.18);
        g.add(thigh);
        const shin = new THREE.Mesh(boxGeo(0.15, hipY - 0.06, 0.15), mat(pants));
        shin.position.set(sx, (hipY - 0.06) / 2, 0.36);
        g.add(shin);
        const shoe = new THREE.Mesh(boxGeo(0.17, 0.08, 0.28), mat(0x1f1f22));
        shoe.position.set(sx, 0.04, 0.42);
        g.add(shoe);
      } else {
        const leg = new THREE.Mesh(boxGeo(0.16 * bw, hipY, 0.18 * bw), mat(pants));
        leg.position.set(sx, hipY / 2, 0);
        g.add(leg);
        const shoe = new THREE.Mesh(boxGeo(0.17, 0.08, 0.28), mat(0x1f1f22));
        shoe.position.set(sx, 0.04, 0.04);
        g.add(shoe);
      }
    }
  }

  const torsoH = 0.62;
  const torsoY = hipY + torsoH / 2;
  const torso = new THREE.Mesh(boxGeo(0.44 * bw, torsoH, 0.24 * bw), mat(shirt));
  torso.position.y = torsoY;
  g.add(torso);

  // Ikat pinggang: pita gelap tipis di pangkal torso supaya figur tidak
  // terbaca sebagai balok satu warna (dilewati untuk siluet bayangan).
  if (!opts.shadow) {
    const belt = new THREE.Mesh(boxGeo(0.455 * bw, 0.075, 0.255 * bw), mat(0x241f1a));
    belt.position.y = hipY + 0.05;
    g.add(belt);
  }

  const armX = 0.27 * bw;
  const arms: THREE.Object3D[] = [];
  for (const sx of [-armX, armX]) {
    const arm = new THREE.Mesh(boxGeo(0.12, 0.54, 0.14), mat(shirt));
    arm.position.set(sx, torsoY + 0.03, 0);
    arm.rotation.z = sx > 0 ? -0.07 : 0.07;
    g.add(arm);
    arms.push(arm);
    const hand = new THREE.Mesh(boxGeo(0.11, 0.12, 0.13), mat(skin));
    hand.position.set(sx, torsoY - 0.3, 0.01);
    g.add(hand);
  }

  const neckY = hipY + torsoH;
  const headD = 0.24 * (1 + (bw - 1) * 0.5);
  const head = new THREE.Mesh(boxGeo(headD, 0.27, headD), mat(skin));
  head.position.set(0, neckY + 0.16, 0);
  g.add(head);
  // Semua komponen kepala jadi anak dari mesh kepala: saat animasi idle
  // menolehkan kepala, rambut/mata/kerudung/topi ikut berputar bersamanya.
  if (!opts.shadow) {
    if (hijab) {
      const hood = new THREE.Mesh(boxGeo(0.3, 0.36, 0.3), mat(hijabColor));
      hood.position.set(0, 0.01, -0.045);
      head.add(hood);
      const drape = new THREE.Mesh(boxGeo(0.36, 0.22, 0.28), mat(hijabColor));
      drape.position.set(0, -0.2, -0.02);
      head.add(drape);
    } else if (hairStyle === 1) {
      // Rambut panjang: mahkota + panel belakang dan samping sampai bahu.
      const top = new THREE.Mesh(boxGeo(headD + 0.015, 0.1, headD + 0.015), mat(0x1c1712));
      top.position.set(0, 0.11, -0.01);
      head.add(top);
      const back = new THREE.Mesh(boxGeo(headD + 0.015, 0.34, 0.07), mat(0x1c1712));
      back.position.set(0, -0.04, -headD / 2 - 0.02);
      head.add(back);
      for (const sx of [-headD / 2 - 0.01, headD / 2 + 0.01]) {
        const side = new THREE.Mesh(boxGeo(0.05, 0.28, headD - 0.02), mat(0x1c1712));
        side.position.set(sx, -0.04, -0.01);
        head.add(side);
      }
    } else if (hairStyle === 2) {
      // Sanggul: mahkota + buntut kecil di belakang kepala.
      const top = new THREE.Mesh(boxGeo(headD + 0.015, 0.1, headD + 0.015), mat(0x1c1712));
      top.position.set(0, 0.11, -0.01);
      head.add(top);
      const bun = new THREE.Mesh(cylGeo(0.07, 0.08, 0.1, 6), mat(0x1c1712));
      bun.rotation.x = Math.PI / 2;
      bun.position.set(0, 0.06, -headD / 2 - 0.04);
      head.add(bun);
    } else {
      const top = new THREE.Mesh(boxGeo(headD + 0.015, 0.1, headD + 0.015), mat(0x1c1712));
      top.position.set(0, 0.11, -0.01);
      head.add(top);
    }
    // Dua mata gelap di sisi depan kepala (+z, searah sepatu): figur
    // langsung "menatap" ke arah yang sama dengan badannya, bukan patung
    // tanpa wajah.
    for (const ex of [-0.055, 0.055]) {
      const eye = new THREE.Mesh(boxGeo(0.05, 0.06, 0.02), mat(0x14100c));
      eye.position.set(ex, 0.025, headD / 2 + 0.004);
      head.add(eye);
    }
  }
  if (opts.hat) {
    const brim = new THREE.Mesh(cylGeo(0.24, 0.24, 0.03, 8), mat(0x8a7f66));
    brim.position.set(0, 0.12, 0);
    head.add(brim);
    const cap = new THREE.Mesh(cylGeo(0.14, 0.17, 0.13, 8), mat(0x8a7f66));
    cap.position.set(0, 0.19, 0);
    head.add(cap);
  }

  g.position.set(x, 0, z);
  g.rotation.y = opts.rotY ?? 0;
  g.scale.setScalar((opts.scale ?? 1) * heightVar);
  kit.group.add(g);
  addGroupProxy(kit, g, 0.55, neckY + 0.32, 0.5);
  // Daftarkan ke registri idle: napas, goyang berat badan, dan sesekali
  // menoleh: dipanggil tiap frame oleh updateFigures dari main loop.
  figureIdle.push({
    group: g,
    head,
    torso,
    arms,
    phase,
    sway: 0.8 + ((seed >>> 2) % 5) * 0.1,
    bob: seated ? 0 : 0.7 + ((seed >>> 5) % 6) * 0.1,
    turnAt: -1,
    turnTo: 0,
    turnHold: 0
  });
  return g;
}

/** Mobil sedan: badan, kabin, kaca, grill, lampu, dan empat roda. */
function car(kit: Kit, x: number, z: number, rotY = 0, color = 0x4a5b6b): void {
  const g = new THREE.Group();
  const body = new THREE.Mesh(boxGeo(1.7, 0.55, 3.6), mat(color));
  body.position.y = 0.6;
  g.add(body);
  const cabin = new THREE.Mesh(boxGeo(1.55, 0.58, 1.9), mat(color));
  cabin.position.set(0, 1.16, -0.3);
  g.add(cabin);
  const glass = new THREE.Mesh(boxGeo(1.5, 0.48, 1.95), mat(0x9fb6c4, { transparent: true, opacity: 0.6 }));
  glass.position.set(0, 1.18, -0.3);
  g.add(glass);
  const grill = new THREE.Mesh(boxGeo(1.3, 0.26, 0.08), mat(0x2b2b2f));
  grill.position.set(0, 0.6, 1.83);
  g.add(grill);
  for (const sx of [-0.6, 0.6]) {
    const head = new THREE.Mesh(boxGeo(0.32, 0.18, 0.08), mat(0xf1e7c8, { emissive: 0x4a4022 }));
    head.position.set(sx, 0.78, 1.83);
    g.add(head);
  }
  const bumper = new THREE.Mesh(boxGeo(1.78, 0.16, 0.16), mat(palette.metal));
  bumper.position.set(0, 0.4, 1.85);
  g.add(bumper);
  for (const sx of [-0.84, 0.84]) {
    for (const sz of [-1.15, 1.15]) {
      const wheel = new THREE.Mesh(cylGeo(0.34, 0.34, 0.2, 10), mat(0x17171a));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx, 0.34, sz);
      g.add(wheel);
      const hub = new THREE.Mesh(cylGeo(0.13, 0.13, 0.22, 8), mat(palette.metal));
      hub.rotation.z = Math.PI / 2;
      hub.position.set(sx, 0.34, sz);
      g.add(hub);
    }
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  kit.group.add(g);
  addGroupProxy(kit, g, 1.9, 1.5, 3.8);
}

/** Semak: tiga kubah saling tindih supaya tepinya tidak bulat sempurna. */
function bush(kit: Kit, x: number, z: number, r = 0.5, color = palette.leafDark): void {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const rr = r * (0.7 + (i % 2) * 0.32);
    const s = new THREE.Mesh(sphereGeo(rr, 6, 5), mat(i % 2 ? color : palette.leaf));
    s.position.set(x + Math.cos(a) * r * 0.4, rr * 0.66, z + Math.sin(a) * r * 0.4);
    kit.group.add(s);
  }
}

/** Botol air minum: badan, leher, dan tutup. */
function bottle(kit: Kit, x: number, y: number, z: number, color = 0x8fb6d6): void {
  const body = new THREE.Mesh(cylGeo(0.045, 0.05, 0.2, 8), mat(color, { transparent: true, opacity: 0.75 }));
  body.position.set(x, y + 0.1, z);
  kit.group.add(body);
  const neck = new THREE.Mesh(cylGeo(0.022, 0.03, 0.07, 8), mat(color, { transparent: true, opacity: 0.75 }));
  neck.position.set(x, y + 0.23, z);
  kit.group.add(neck);
  const cap = new THREE.Mesh(cylGeo(0.025, 0.025, 0.03, 8), mat(0xc23a3a));
  cap.position.set(x, y + 0.28, z);
  kit.group.add(cap);
}

/** Jejak kaki berjejal di tanah: sepasang tapak selang-seling. */
function footprints(kit: Kit, x: number, z: number, rotY: number, count = 6, color = 0x2a2620): void {
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const step = new THREE.Mesh(boxGeo(0.13, 0.02, 0.27), mat(color));
    step.position.set(side * 0.15, 0, i * 0.52);
    step.rotation.y = side * 0.14;
    g.add(step);
  }
  g.position.set(x, 0.05, z);
  g.rotation.y = rotY;
  kit.group.add(g);
}

/** Papan tulis di dinding: bingkai, papan gelap, dan baris tulisan. */
function wallBoard(
  kit: Kit,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  rotY = 0,
  boardColor = 0x2f3d33
): void {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(boxGeo(w + 0.1, h + 0.1, 0.05), mat(palette.woodDark));
  g.add(frame);
  const board = new THREE.Mesh(boxGeo(w, h, 0.06), mat(boardColor));
  g.add(board);
  for (let i = 0; i < 4; i++) {
    const line = new THREE.Mesh(
      boxGeo(w * (0.45 + ((i * 7) % 4) * 0.13), 0.04, 0.02),
      mat(palette.paper)
    );
    line.position.set(-w * 0.07, h * 0.3 - i * h * 0.19, 0.04);
    g.add(line);
  }
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  kit.group.add(g);
}

/** Mesin espresso: badan, dua group head, pompa uji tekan, dan wand susu. */
function coffeeMachine(kit: Kit, x: number, y: number, z: number, rotY = 0): void {
  const g = new THREE.Group();
  const body = new THREE.Mesh(boxGeo(0.7, 0.5, 0.42), mat(0x9a9ba0));
  body.position.y = 0.25;
  g.add(body);
  const top = new THREE.Mesh(boxGeo(0.74, 0.08, 0.46), mat(0x2f2f33));
  top.position.y = 0.54;
  g.add(top);
  for (const sx of [-0.17, 0.17]) {
    const head = new THREE.Mesh(cylGeo(0.08, 0.08, 0.16, 8), mat(0x2b2b2f));
    head.position.set(sx, 0.12, 0.24);
    g.add(head);
    const cup = new THREE.Mesh(cylGeo(0.05, 0.04, 0.08, 8), mat(palette.paper));
    cup.position.set(sx, 0.05, 0.24);
    g.add(cup);
  }
  const wand = new THREE.Mesh(cylGeo(0.02, 0.02, 0.26, 6), mat(palette.metal));
  wand.position.set(0.3, 0.2, 0.18);
  wand.rotation.z = 0.45;
  g.add(wand);
  const gauge = new THREE.Mesh(cylGeo(0.05, 0.05, 0.03, 10), mat(palette.paper));
  gauge.rotation.x = Math.PI / 2;
  gauge.position.set(-0.24, 0.36, 0.22);
  g.add(gauge);
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  kit.group.add(g);
}

/** Tumpukan gelas kertas / keramik. */
function cupStack(kit: Kit, x: number, y: number, z: number, count = 4): void {
  for (let i = 0; i < count; i++) {
    const cup = new THREE.Mesh(cylGeo(0.05, 0.038, 0.09, 8), mat(palette.paper));
    cup.position.set(x, y + 0.045 + i * 0.05, z);
    kit.group.add(cup);
  }
}

/** Stoples kue: kaca bening, isian, dan tutup kayu. */
function jar(kit: Kit, x: number, y: number, z: number, color = 0xc9b48a): void {
  const fill = new THREE.Mesh(cylGeo(0.11, 0.11, 0.17, 10), mat(color));
  fill.position.set(x, y + 0.1, z);
  kit.group.add(fill);
  const glass = new THREE.Mesh(
    cylGeo(0.13, 0.13, 0.24, 10),
    mat(0xd8e2e0, { transparent: true, opacity: 0.45 })
  );
  glass.position.set(x, y + 0.13, z);
  kit.group.add(glass);
  const lid = new THREE.Mesh(cylGeo(0.135, 0.135, 0.05, 10), mat(palette.woodDark));
  lid.position.set(x, y + 0.27, z);
  kit.group.add(lid);
}

/** Pita penanda yang diikatkan pada batang/pohon: simpul + dua ekor kain. */
function ribbon(kit: Kit, x: number, y: number, z: number, color = 0xc23a3a): void {
  const knot = new THREE.Mesh(sphereGeo(0.07, 6, 5), mat(color));
  knot.position.set(x, y, z);
  kit.group.add(knot);
  for (const sx of [-1, 1]) {
    const tail = new THREE.Mesh(boxGeo(0.05, 0.3, 0.02), mat(color));
    tail.position.set(x + sx * 0.05, y - 0.17, z + 0.02);
    tail.rotation.z = sx * 0.22;
    kit.group.add(tail);
  }
}

/** Tiang lampu jalan: tiang, lengan, kepala menyala, dan titik cahaya. */
function lampPost(kit: Kit, x: number, z: number, h = 4, color = 0xffd9a0, intensity = 0.7): void {
  cylinder(kit, 0.07, 0.1, h, palette.metal, x, h / 2, z, true);
  box(kit, 0.7, 0.07, 0.07, palette.metal, x + 0.3, h - 0.06, z, false);
  const head = new THREE.Mesh(boxGeo(0.36, 0.14, 0.22), mat(color, { emissive: color }));
  head.position.set(x + 0.6, h - 0.18, z);
  kit.group.add(head);
  const light = new THREE.PointLight(color, intensity, 13);
  light.position.set(x + 0.6, h - 0.5, z);
  kit.group.add(light);
}

/** Gerbang desa: dua tiang bertopi, balok melintang, dan papan nama. */
function gateArch(kit: Kit, x: number, z: number, rotY = 0, w = 6): void {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(boxGeo(0.35, 3.2, 0.35), mat(palette.woodDark));
    post.position.set((sx * w) / 2, 1.6, 0);
    g.add(post);
    const cap = new THREE.Mesh(boxGeo(0.52, 0.18, 0.52), mat(palette.wood));
    cap.position.set((sx * w) / 2, 3.3, 0);
    g.add(cap);
    const proxy = new THREE.Mesh(
      boxGeo(0.5, 3.4, 0.5),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    proxy.position.set((sx * w) / 2, 1.7, 0);
    g.add(proxy);
    kit.colliders.push(proxy);
  }
  const beam = new THREE.Mesh(boxGeo(w + 1.0, 0.3, 0.3), mat(palette.wood));
  beam.position.y = 2.9;
  g.add(beam);
  const board = new THREE.Mesh(boxGeo(w * 0.7, 0.66, 0.08), mat(palette.woodDark));
  board.position.y = 2.38;
  g.add(board);
  for (let i = 0; i < 2; i++) {
    const line = new THREE.Mesh(boxGeo(w * (0.5 - i * 0.12), 0.09, 0.03), mat(palette.paper));
    line.position.set(0, 2.53 - i * 0.26, 0.06);
    g.add(line);
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  kit.group.add(g);
}

/** Gubuk kecil beratap limasan: badan, pintu, jendela, dan atap. */
function hutSmall(
  kit: Kit,
  x: number,
  z: number,
  w = 3,
  d = 3,
  h = 2.4,
  rotY = 0,
  wallColor = palette.wallDark,
  roofColor = 0x6b4536
): void {
  const g = new THREE.Group();
  const body = new THREE.Mesh(boxGeo(w, h, d), mat(wallColor));
  body.position.y = h / 2;
  g.add(body);
  const roof = new THREE.Mesh(
    coneGeo(Math.SQRT1_2, 1, 4, 1, false, Math.PI / 4),
    mat(roofColor)
  );
  roof.scale.set(w + 0.9, 1.3, d + 0.9);
  roof.position.y = h + 0.65;
  g.add(roof);
  const door = new THREE.Mesh(boxGeo(0.9, 1.9, 0.1), mat(palette.woodDark));
  door.position.set(0, 0.95, d / 2 + 0.03);
  g.add(door);
  const knob = new THREE.Mesh(sphereGeo(0.05, 6, 5), mat(palette.metal));
  knob.position.set(0.32, 1.0, d / 2 + 0.1);
  g.add(knob);
  const win = new THREE.Mesh(
    boxGeo(0.8, 0.6, 0.1),
    mat(0xd6e8f2, { emissive: 0x33505e })
  );
  win.position.set(w / 2 + 0.03, 1.5, 0);
  win.rotation.y = Math.PI / 2;
  g.add(win);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  kit.group.add(g);
  addGroupProxy(kit, g, w + 0.2, h, d + 0.2);
}

/** Cincin api: dua belas lidah api melingkar di sekeliling rongga. */
/** Material lidah api: menyala, ujung menipis, tidak menghalangi pandangan. */
function flameMat(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color: 0xffb14a,
    emissive: 0xff7d22,
    map: getFlameGradientTexture(),
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
}

/**
 * Cincin api yang mengelilingi reruntuhan.
 *
 * Versi lama memakai satu `Torus` oranye pekat: dari jauh terbaca sebagai
 * pita plastik menyala, bukan bara. Kini cincin diganti barisan sprite lembut
 * bertumpuk di atas bara gelap: tepinya memudar sehingga cahayanya merambat -
 * ditambah kolom asap yang menanjak supaya kebakaran punya tinggi, bukan
 * sekadar garis di tanah.
 */
function fireRing(kit: Kit, x: number, z: number, radius = 6): void {
  const dot = getSoftDotTexture();

  // Tempat duduk api: cincin bara gelap.
  const base = new THREE.Mesh(
    torusGeo(radius, 0.2, 6, 44),
    mat(0x59200c, { emissive: 0x4a1a08 })
  );
  base.rotation.x = Math.PI / 2;
  base.position.set(x, 0.2, z);
  kit.group.add(base);

  // Baris nyala: sprite menyala yang tumpang tindih mengikuti lingkaran.
  const glowMat = new THREE.SpriteMaterial({
    map: dot,
    color: 0xff7626,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const coreMat = new THREE.SpriteMaterial({
    map: dot,
    color: 0xffc061,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const segs = 40;
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const px = x + Math.cos(a) * radius;
    const pz = z + Math.sin(a) * radius;
    const s = 1.15 + ((i * 7) % 5) * 0.17;
    const puff = new THREE.Sprite(glowMat);
    puff.position.set(px, 0.5, pz);
    puff.scale.set(s, s * 1.3, 1);
    kit.group.add(puff);
    if (i % 2 === 0) {
      const core = new THREE.Sprite(coreMat);
      core.position.set(px, 0.45, pz);
      core.scale.set(s * 0.5, s * 0.62, 1);
      kit.group.add(core);
    }
  }

  // Lidah api bergradasi di sekeliling cincin.
  const tongue = flameMat();
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const flame = new THREE.Mesh(
      coneGeo(0.34, 1.0 + (i % 3) * 0.35, 5),
      tongue
    );
    flame.position.set(x + Math.cos(a) * radius, 0.6, z + Math.sin(a) * radius);
    kit.group.add(flame);
  }

  // Kolom asap: menanjak ke atas supaya kebakaran terasa menjulang.
  const smokeTiers = [
    { color: 0x8a5a3c, opacity: 0.4 },
    { color: 0x55483e, opacity: 0.32 },
    { color: 0x3b342e, opacity: 0.26 }
  ].map(t => new THREE.SpriteMaterial({
    map: dot,
    color: t.color,
    transparent: true,
    opacity: t.opacity,
    depthWrite: false
  }));
  for (let i = 0; i < 12; i++) {
    const t = i / 12;
    const a = i * 1.9;
    const drift = 1.0 + t * 3.0;
    const tier = smokeTiers[t < 0.33 ? 0 : t < 0.7 ? 1 : 2];
    const puff = new THREE.Sprite(tier);
    puff.position.set(x + Math.cos(a) * drift, 1.6 + t * 9, z + Math.sin(a) * drift);
    const s = 2.4 + t * 4.4;
    puff.scale.set(s, s, 1);
    kit.group.add(puff);
  }

  const light = new THREE.PointLight(palette.ember, 1.8, radius * 3.5);
  light.position.set(x, 2.2, z);
  kit.group.add(light);
}

/** Patok/penanda jalur: tiang pendek dengan kepala merah. */
function markerPost(kit: Kit, x: number, z: number, h = 1.1, color = palette.woodDark): void {
  cylinder(kit, 0.05, 0.06, h, color, x, h / 2, z, true);
  const cap = new THREE.Mesh(boxGeo(0.2, 0.16, 0.06), mat(0xc23a3a));
  cap.position.set(x, h - 0.08, z);
  kit.group.add(cap);
}

/**
 * Panel kaca jendela tanpa penskalaan UV.
 *
 * Berbeda dengan `box()`, tekstur dipetakan penuh 0..1 di tiap muka sehingga
 * pemandangan langit dan siluet bukit tidak ikut "melar" mengikuti ukuran
 * kaca: jendela kecil tetap menunjukkan horizon, bukan hanya sepetak warna.
 */
function pane(
  kit: Kit,
  w: number,
  h: number,
  d: number,
  color: number,
  x: number,
  y: number,
  z: number,
  opts?: { emissive?: number; transparent?: boolean; opacity?: number }
): THREE.Mesh {
  const mesh = new THREE.Mesh(boxGeo(w, h, d), mat(color, opts));
  mesh.position.set(x, y, z);
  kit.group.add(mesh);
  return mesh;
}

/**
 * Tanah yang menjorok sampai ke cakrawala: adegan luar tak lagi berdiri di
 * atas balok.
 *
 * Cakram ini ikut menjadi kolider supaya tepi lantai 70 meter tidak lagi
 * berujung pada jurang: pemain yang berjalan keluar batas halaman tetap
 * berpijak pada tanah, bukan jatuh tanpa dasar.
 */
function groundDisc(kit: Kit, radius: number, color: number, y = -0.06): void {
  const geo = cylGeoTiled(radius, radius, 0.1, 48, radius, 0.1, 4);
  const mesh = new THREE.Mesh(geo, mat(color));
  mesh.position.set(0, y, 0);
  kit.group.add(mesh);
  kit.colliders.push(mesh);
}

function tileCylinderUVs(geo: THREE.CylinderGeometry, radius: number, height: number, tile = 2): void {
  const uv = geo.attributes.uv as THREE.BufferAttribute | undefined;
  if (!uv) return;
  const su = (Math.PI * 2 * radius) / tile;
  const sv = height / tile;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
  uv.needsUpdate = true;
}

interface BackdropOptions {
  /** Gugusan bukit jauh. */
  hills?: number;
  /** Deret pohon di kejauhan. */
  trees?: number;
  /** Rumah desa beratap limasan di kejauhan (dengan jendela menyala). */
  houses?: number;
  radius?: number;
  seed?: number;
  /** Warna dasar siluet; kabut preset akan melembutkannya. */
  color?: number;
}

/**
 * Cakrawala adegan luar.
 *
 * Tanpa ini horizon berhenti di tepi lantai 70 meter dan pemain melihat
 * ruang kosong. Bukit, hutan jauh, dan deret rumah desa memberi arah serta
 * kedalaman; jendela yang menyala tetap terbaca pada adegan malam.
 */
function distantBackdrop(kit: Kit, opts: BackdropOptions = {}): void {
  const radius = opts.radius ?? 140;
  const seed = opts.seed ?? 7;
  const color = opts.color ?? 0x35402f;
  const rnd = (n: number): number => ((Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;

  const hills = opts.hills ?? 8;
  for (let i = 0; i < hills; i++) {
    const a = (i / hills) * Math.PI * 2 + rnd(i) * 0.5;
    const r = radius + rnd(i + 40) * 60;
    const w = 40 + rnd(i + 80) * 55;
    const h = 10 + rnd(i + 120) * 18;
    const hill = new THREE.Mesh(coneGeo(1, 1, 5), mat(color));
    hill.scale.set(w, h, w * 0.7);
    hill.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r);
    hill.rotation.y = rnd(i + 160) * Math.PI;
    kit.group.add(hill);
  }

  const trees = opts.trees ?? 22;
  for (let i = 0; i < trees; i++) {
    const a = (i / trees) * Math.PI * 2 + rnd(i + 7) * 0.4;
    const r = radius * 0.75 + rnd(i + 55) * 30;
    const h = 16 + rnd(i + 95) * 14;
    const trunk = new THREE.Mesh(cylGeo(0.5, 0.7, h * 0.5, 5), mat(palette.woodDark));
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    trunk.position.set(x, h * 0.25, z);
    kit.group.add(trunk);
    const crown = new THREE.Mesh(coneGeo(3.4 + rnd(i + 130) * 2, h, 6), mat(color));
    crown.position.set(x, h * 0.75, z);
    kit.group.add(crown);
    // Lapisan dedaunan bawah yang lebih gelap: siluet pohon bergradasi,
    // bukan kerucut polos satu warna.
    const underCrown = new THREE.Mesh(coneGeo(2.1 + rnd(i + 130) * 1.3, h * 0.5, 6), mat(0x2b3426));
    underCrown.position.set(x, h * 0.52, z);
    kit.group.add(underCrown);
  }

  const houses = opts.houses ?? 6;
  for (let i = 0; i < houses; i++) {
    const a = (i / houses) * Math.PI * 2 + 0.7 + rnd(i + 3) * 0.5;
    const r = radius * 0.62 + rnd(i + 23) * 25;
    const w = 7 + rnd(i + 33) * 5;
    const h = 4 + rnd(i + 43) * 2.5;
    const d = 6 + rnd(i + 53) * 4;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const body = new THREE.Mesh(boxGeo(w, h, d), mat(rnd(i + 63) > 0.5 ? palette.plaster : palette.wall));
    body.position.set(x, h / 2, z);
    body.rotation.y = -a;
    kit.group.add(body);
    const roof = new THREE.Mesh(coneGeo(Math.SQRT1_2, 1, 4, 1, false, Math.PI / 4), mat(0x6b4536));
    roof.scale.set(w + 1.4, 2.2, d + 1.4);
    roof.position.set(x, h + 1.1, z);
    roof.rotation.y = -a;
    kit.group.add(roof);
    // Jendela menyala menghadap pusat: cahaya desa di kejauhan.
    const glow = new THREE.Mesh(
      boxGeo(1.2, 0.9, 0.1),
      mat(0xffe6b0, { emissive: 0xffc46a })
    );
    const fx = x - Math.cos(a) * (d / 2 + 0.1);
    const fz = z - Math.sin(a) * (d / 2 + 0.1);
    glow.position.set(fx, h * 0.5, fz);
    glow.rotation.y = -a;
    kit.group.add(glow);
  }
}

interface RoomShellOptions {
  floorColor?: number;
  wallColor?: number;
  /** Pasang pintu berbingkai di dinding +z (semua ruangan menghadap ke sana). */
  doorZ?: boolean;
  /** Jumlah jendela di dinding -z. Otomatis 0 untuk ruangan sempit. */
  windows?: number;
  /** Lubang jendela tembus eksplisit di dinding -z (utara). */
  northWindows?: WallHole[];
  /** Lubang jendela tembus eksplisit di dinding +z (selatan). */
  southWindows?: WallHole[];
  /** Pasang tirai kain di sisi dalam setiap jendela tembus (khas rumah). */
  windowCurtains?: boolean;
  /**
   * Adegan membangun dunia luar sendiri (pekarangan lewat buildExteriorRumah):
   * jendela menjadi lubang tembus TANPA niche diorama, dan pintu depan tidak
   * ditutup panel gelap: yang terlihat dari balik daun pintu adalah halaman.
   */
  exterior?: boolean;
}

/**
 * Plintir lantai (baseboard) dan mahkota bawah plafon di keempat dinding.
 *
 * Dinding setebal 0,2 terasa seperti balok datar tanpa tepi. Dua strip tipis
 * ini memberi ketebalan dan bayangan alami sehingga ruangan terasa dibangun,
 * bukan dikotakkan. Sengaja bukan collider supaya pemain tidak tersangkut pada
 * tonjolan 3 cm.
 */
function trimRing(kit: Kit, w: number, d: number, h: number, color: number): void {
  const baseH = 0.14;
  const inset = 0.13; // 0,1 (setengah ketebalan dinding) + 0,03 menonjol
  for (const z of [-d / 2 + inset, d / 2 - inset]) {
    box(kit, w - 0.36, baseH, 0.06, color, 0, baseH / 2, z, false);
    box(kit, w - 0.36, 0.1, 0.05, color, 0, h - 0.05, z, false);
  }
  for (const x of [-w / 2 + inset, w / 2 - inset]) {
    box(kit, 0.06, baseH, d - 0.36, color, x, baseH / 2, 0, false);
    box(kit, 0.05, 0.1, d - 0.36, color, x, h - 0.05, 0, false);
  }
}

/**
 * Panel jendela berbingkai: kusen, kaca, dan palang salib.
 *
 * Dinding adalah satu balok penuh sehingga tidak bisa dilubangi, jadi kaca
 * dibuat sedikit menyala (emissive redup): tetap terbaca sebagai jendela di
 * ruangan terang maupun gelap tanpa berubah jadi lampu di adegan malam.
 *
 * `axis` menentukan arah tembus panel: 'z' untuk dinding sepanjang sumbu X.
 */
function windowPanel(
  kit: Kit,
  x: number,
  y: number,
  z: number,
  wW: number,
  hW: number,
  axis: 'x' | 'z'
): void {
  const trim = palette.woodDark;
  const glow = { emissive: 0x33505e };
  const frame = 0.18;
  let glass: THREE.Mesh;
  if (axis === 'z') {
    box(kit, wW + frame, hW + frame, 0.06, trim, x, y, z, false);
    glass = pane(kit, wW, hW, 0.08, 0xd6e8f2, x, y, z, glow);
    box(kit, 0.05, hW, 0.1, trim, x, y, z, false);
    box(kit, wW, 0.05, 0.1, trim, x, y, z, false);
  } else {
    box(kit, 0.06, hW + frame, wW + frame, trim, x, y, z, false);
    glass = pane(kit, 0.08, hW, wW, 0xd6e8f2, x, y, z, glow);
    box(kit, 0.1, hW, 0.05, trim, x, y, z, false);
    box(kit, 0.1, 0.05, wW, trim, x, y, z, false);
  }

  // Cahaya dalam kaca mengikuti bentuk pemandangan (langit terang, bukit
  // gelap). Tanpa emissiveMap, siluet bukit ikut menyala sama terangnya saat
  // malam dan jendela kembali terbaca sebagai panel datar.
  const material = glass.material as THREE.MeshLambertMaterial;
  if (material.map && !material.emissiveMap) {
    material.emissiveMap = material.map;
    material.needsUpdate = true;
  }
}

/**
 * Titik potong jendela pada dinding sepanjang sumbu X.
 *
 * `x` = titik tengah lubang pada sumbu panjang dinding; `w` = lebar lubang;
 * `y0`/`y1` = tinggi ambang dan atas lubang dihitung dari lantai. Dipakai
 * `wallWithHoles` untuk memotong dinding dan `windowPortal` untuk memasang
 * kaca plus diorama pemandangan di luar dinding.
 */
interface WallHole {
  x: number;
  w: number;
  y0: number;
  y1: number;
}

/**
 * Dinding sepanjang sumbu X (z tetap) dengan lubang jendela tembus.
 *
 * Sama seperti `wall()`: balok kolider penuh: kecuali tiap lubang dipotong
 * benar-benar: tebing kiri-kanan di sela lubang, ambang di bawah, dan
 * mahkota di atas semuanya tetap kolider sehingga pemain tidak bisa menembus
 * jendela. Beda dengan `windowPanel` lama yang menempel di atas tembok utuh,
 * lubang di sini tembus: di luar dinding dipasang diorama oleh
 * `windowPortal`, bukan kekosongan.
 */
function wallWithHoles(
  kit: Kit,
  w: number,
  h: number,
  t: number,
  z: number,
  color: number,
  holes: WallHole[]
): void {
  const sorted = [...holes].sort((a, b) => a.x - b.x);
  let cursor = -w / 2;
  for (const hole of sorted) {
    const left = Math.max(hole.x - hole.w / 2, -w / 2);
    const right = Math.min(hole.x + hole.w / 2, w / 2);
    if (left > cursor) {
      const segW = left - cursor;
      box(kit, segW, h, t, color, cursor + segW / 2, h / 2, z, true);
    }
    if (hole.y0 > 0.001) {
      box(kit, right - left, hole.y0, t, color, (left + right) / 2, hole.y0 / 2, z, true);
    }
    if (hole.y1 < h - 0.001) {
      const topH = h - hole.y1;
      box(kit, right - left, topH, t, color, (left + right) / 2, hole.y1 + topH / 2, z, true);
    }
    cursor = right;
  }
  if (cursor < w / 2) {
    const segW = w / 2 - cursor;
    box(kit, segW, h, t, color, cursor + segW / 2, h / 2, z, true);
  }
}

/**
 * Jendela tembus: kaca bening di lubang dinding + pemandangan di luar
 * dinding.
 *
 * Semua ruangan tertutup berdiri di atas kekosongan: tidak ada tanah di
 * luar dinding: sehingga lubang dinding yang polos akan memamerkan void.
 * Karena itu di luar lubang dipasang niche tertutup sedalam 1,7 m: dinding
 * samping, langit-langit, dan dasar niche dari warna dinding yang sama, lalu
 * panel `windowview` menyala sebagai cakrawala di ujungnya. Siluet pohon dan
 * bukit diletakkan di kedalaman berbeda sehingga pemandangan benar-benar
 * bergerak parallax saat pemain melangkah: bukan stiker yang menempel di
 * kaca. Seluruh kotaknya tertutup penuh di keenam sisi; tidak ada sinar
 * pandang yang bisa bocor melewati aperture ke luar scene.
 *
 * Mode `exterior`: niche tidak dibuat: lubang dibiarkan tembus apa adanya
 * karena adegan membangun dunia luar sendiri (buildExteriorRumah: tanah,
 * pagar, pohon, dan cakrawala desa). Pemain benar-benar melihat keluar ke
 * pekarangan dengan kedalaman dan parallax sungguhan.
 *
 * `dir` arah keluar lubang: -1 untuk dinding utara (-z), +1 selatan (+z).
 * `curtain` memasang tirai kain di sisi dalam (khas rumah tinggal).
 */
function windowPortal(
  kit: Kit,
  hole: WallHole,
  zWall: number,
  dir: -1 | 1,
  opts: { curtain?: boolean; exterior?: boolean } = {}
): void {
  const trim = palette.woodDark;
  const t = 0.2;
  const nT = 0.16;                              // ketebalan dinding niche
  const zInner = zWall - dir * (t / 2 + 0.03);  // muka dalam, tempat bingkai
  const zOut = zWall + dir * (t / 2);           // muka luar dinding
  const wW = hole.w;
  const hW = hole.y1 - hole.y0;
  const yMid = (hole.y0 + hole.y1) / 2;
  const D = 1.7;                                // kedalaman niche
  const zMid = zOut + dir * D / 2;
  const zBack = zOut + dir * (D - nT / 2);      // pusat panel pemandangan
  const zGround = zOut + dir * ((D - nT) / 2);  // pusat strip tanah

  // --- Kusen, palang salib, dan kaca bening di lubang dinding ---
  // Kusen berupa EMPAT bilah melingkari lubang, bukan satu pelat utuh:
  // pelat utuh (desain windowPanel lama) menutup seluruh aperture: di
  // windowPanel lama penutupnya tertutup panel pemandangan opak, tapi di
  // sini kaca bening sehingga pelat akan memamerkan kayu gelap, bukan
  // pemandangan. Bilah bertemu di sudut, jadi kusen tetap terbaca utuh.
  const fr = 0.1;
  box(kit, fr, hW, 0.06, trim, hole.x - wW / 2, yMid, zInner, false);   // tiang kiri
  box(kit, fr, hW, 0.06, trim, hole.x + wW / 2, yMid, zInner, false);   // tiang kanan
  box(kit, wW, fr, 0.06, trim, hole.x, hole.y0, zInner, false);         // ambang
  box(kit, wW, fr, 0.06, trim, hole.x, hole.y1, zInner, false);         // mahkota
  box(kit, 0.05, hW, 0.07, trim, hole.x, yMid, zInner, false);          // palang tegak
  box(kit, wW, 0.05, 0.07, trim, hole.x, yMid, zInner, false);          // palang mendatar
  const glass = pane(kit, wW - 0.04, hW - 0.04, 0.03, 0xbcd8e2, hole.x, yMid, zWall, {
    transparent: true,
    opacity: 0.14,
    emissive: 0x22313a
  });
  // Kaca ikut memadat: dinding di bawah dan atas lubang sudah jadi kolider,
  // tapi kapsul pemain bisa melompat dari ambang: kaca menutup sisa lubang
  // sehingga jendela tidak pernah bisa ditembus, baik berdiri maupun lompat.
  kit.colliders.push(glass);

  // Tirai di sisi DALAM dinding: milik ruangan, dipasang sebelum apa pun di
  // luar dinding: termasuk saat mode eksterior melewatkan niche.
  if (opts.curtain) {
    const cZ = zInner - dir * 0.055;
    const curL = box(kit, 0.26, hW + 0.26, 0.07, palette.fabricRed, hole.x - (wW / 2 + 0.17), yMid - 0.06, cZ, false);
    const curR = box(kit, 0.26, hW + 0.26, 0.07, palette.fabricRed, hole.x + (wW / 2 + 0.17), yMid - 0.06, cZ, false);
    // Kain bergoyang: transformasi lokal ikut dianimasikan, jangan dibekukan.
    curL.userData.animatedLocal = true;
    curR.userData.animatedLocal = true;
    // Kain bergoyang sangat halus: fase berbeda tiap sisi supaya tidak
    // bergerak serempak seperti oppel, dan amplitudo dijaga kecil (±1 cm)
    // agar tetap terasa "sedang tertiup", bukan bergelantungan.
    const phase = hole.x * 0.37 + (dir > 0 ? 1.1 : 0);
    const lx = curL.position.x;
    const rx = curR.position.x;
    addDynamicTick((t) => {
      curL.position.x = lx + Math.sin(t * 0.85 + phase) * 0.012;
      curR.position.x = rx + Math.sin(t * 0.85 + phase + 1.4) * 0.012;
      curL.rotation.z = Math.sin(t * 0.62 + phase) * 0.012;
      curR.rotation.z = -Math.sin(t * 0.62 + phase + 0.9) * 0.012;
    });
  }

  // Mode eksterior: lubang dibiarkan tembus apa adanya: pekarangan sudah
  // dibangun terpisah, niche di sini justru akan menutup pemandangan itu
  // kembali menjadi kotak diorama.
  if (opts.exterior) return;

  // --- Niche diorama: kotak tertutup di luar dinding ---
  box(kit, nT, hW + nT * 2, D, palette.wall, hole.x - (wW / 2 + nT / 2), yMid, zMid, false);
  box(kit, nT, hW + nT * 2, D, palette.wall, hole.x + (wW / 2 + nT / 2), yMid, zMid, false);
  box(kit, wW, nT, D, palette.wall, hole.x, hole.y0 - nT / 2, zMid, false);
  box(kit, wW, nT, D, palette.wall, hole.x, hole.y1 + nT / 2, zMid, false);
  // Panel pemandangan: tekstur `windowview` (langit, bukit, siluet pohon)
  // menyala lewat emissiveMap sehingga cakrawala tetap terbaca saat malam.
  pane(kit, wW, hW, nT, 0xd6e8f2, hole.x, yMid, zBack, { emissive: 0x6f8b9c });

  // Strip tanah rumput di dasar niche. Permukaannya naik 5 cm di atas top
  // pelat dasar supaya tidak coplanar (z-fighting): dulu kedua muka saling
  // menimpa dan tekstur plester pelat yang menang, sehingga dasar niche
  // terlihat seperti lantai plester, bukan rerumputan.
  box(kit, wW, 0.28, D - nT - 0.02, palette.floorGrass, hole.x, hole.y0 - 0.09, zGround, false);

  // --- Pemandangan HIDUP di luar jendela ---
  // Siluet pohon di dua kedalaman (parallax saat pemain melangkah) yang kini
  // ikut MENGAYUN, awan yang melintas perlahan di depan panel, dan sesekali
  // seekor burung menyeberang. Di luar jendela ada kehidupan, bukan gambar
  // diam: semuanya lewat registry dinamis yang dibuang tiap ganti scene.

  // Pohon: batang + tajuk dalam satu grup berporos di akar, jadi ayunan
  // terbaca seperti pohon tertiup angin, bukan tajuk yang putus sendiri.
  const tree = (tx: number, tz: number, s: number, phase: number): void => {
    const g = new THREE.Group();
    g.position.set(tx, hole.y0, tz);
    const trunk = new THREE.Mesh(
      cylGeo(0.02 * s, 0.035 * s, 0.3 * s, 5),
      mat(0x1c241e)
    );
    trunk.position.y = 0.15 * s;
    g.add(trunk);
    const crown = new THREE.Mesh(coneGeo(0.16 * s, 0.52 * s, 6), mat(0x1c241e));
    crown.position.y = 0.52 * s;
    g.add(crown);
    kit.group.add(g);
    addDynamicTick((t) => {
      g.rotation.z = Math.sin(t * 0.7 + phase) * 0.05;
      g.rotation.x = Math.sin(t * 0.53 + phase * 1.7) * 0.03;
    });
  };
  tree(hole.x - wW * 0.24, zOut + dir * 0.55, 1.0, Math.abs(hole.x) * 1.7);
  tree(hole.x + wW * 0.26, zOut + dir * 1.05, 0.72, Math.abs(hole.x) * 2.3 + 1.1);
  // Bukit rendah dekat panel pemandangan, menutup garis dasar panel.
  box(kit, wW, 0.22, 0.12, 0x243026, hole.x - wW * 0.06, hole.y0 + 0.11, zOut + dir * (D - nT - 0.12), false);

  // Awan: dua panel tipis menyala redup yang melintas melawan arah, lewat
  // aperture lebih lebar dari lubang jendela supaya tidak pernah terlihat
  // "muncul" di tepi: wrap terjadi di balik kusen.
  const zCloud = zBack - dir * (nT / 2 + 0.08);
  const mkCloud = (cw: number, ch: number, yFrac: number, speed: number, off: number): void => {
    const c = new THREE.Mesh(
      boxGeo(cw, ch, 0.02),
      mat(0xdfeaf0, { emissive: 0x51666f, transparent: true, opacity: 0.85 })
    );
    c.position.set(hole.x, hole.y0 + hW * yFrac, zCloud);
    c.userData.animatedLocal = true; // awan melintas: posisi lokal dianimasikan
    kit.group.add(c);
    const span = wW * 1.9;
    addDynamicTick((t) => {
      const u = (t * speed + off) % 1;
      c.position.x = hole.x + (u - 0.5) * span;
    });
  };
  mkCloud(wW * 0.42, 0.09, 0.78, 0.062, 0);
  mkCloud(wW * 0.26, 0.06, 0.63, 0.043, 0.45);

  // Burung: siluet V kecil yang menyeberang tiap ±17 detik, fase berbeda
  // tiap jendela supaya tidak serempak. Sayap mengepak selama terlihat.
  const bird = new THREE.Group();
  const wingA = new THREE.Mesh(boxGeo(0.08, 0.02, 0.04), mat(0x141a16));
  wingA.position.x = -0.04;
  const wingB = wingA.clone();
  wingB.position.x = 0.04;
  bird.add(wingA, wingB);
  bird.position.z = zBack - dir * (nT / 2 + 0.14);
  bird.visible = false;
  bird.userData.animatedLocal = true; // burung menyeberang: sayap mengepak
  kit.group.add(bird);
  const birdPhase = Math.abs(hole.x) * 2.7 + hW;
  addDynamicTick((t) => {
    const cycle = 17;
    const u = (((t + birdPhase) % cycle) + cycle) % cycle;
    if (u > 5.2) {
      if (bird.visible) bird.visible = false;
      return;
    }
    bird.visible = true;
    const p = u / 5.2;
    bird.position.x = hole.x + (0.5 - p) * (wW + 0.6);
    bird.position.y = hole.y0 + hW * 0.82 + Math.sin(p * Math.PI * 2) * 0.05;
    const flap = Math.sin(t * 9) * 0.45;
    wingA.rotation.z = 0.4 + flap;
    wingB.rotation.z = -0.4 - flap;
  });

}

/**
 * Atap limasan (piramida empat sisi) di atas suatu denah persegi.
 *
 * Atap lempeng datar membuat bangunan luar ruangan terlihat seperti kubus
 * debug; piramida langsung memberi siluet rumah desa yang dikenali orang.
 */
function roofHip(
  kit: Kit,
  x: number,
  z: number,
  w: number,
  d: number,
  baseY: number,
  height: number,
  color: number
): void {
  // Kerucut dibuat dari denah 1x1 lalu diskalakan, supaya atap benar-benar
  // menutupi denah persegi panjang w x d (kerucut bawaan selalu berbentuk
  // piramida persegi). Overhang 0,35 agar tepi atap menonjol melewati dinding
  // seperti genteng sungguhan.
  const roof = new THREE.Mesh(
    coneGeo(Math.SQRT1_2, 1, 4, 1, false, Math.PI / 4),
    mat(color)
  );
  roof.scale.set(w + 0.7, height, d + 0.7);
  roof.position.set(x, baseY + height / 2, z);
  kit.group.add(roof);
}

/** Pintu berbingkai: kusen, ambang, daun pintu, dan gagang. */
/**
 * Membuat pintu berengsel: daun berputar di antara `0` (tertutup rapat) dan
 * `openAngle` (terbuka), dengan animasi eksponensial lewat registry dinamis.
 *
 * Pintu tembus (`collar` = proxy ambang) menutup celah hanya selama daun
 * benar-benar tertutup: kapsul pemain tidak mengenai daun tipis yang sedang
 * berputar, jadi proxy inilah yang membuat pintu benar-benar memblokir langkah
 * saat tertutup dan benar-benar bebas saat terbuka.
 */
function makeHingedDoor(
  kit: Kit,
  opts: {
    id: string;
    interactive: boolean;
    leaf: THREE.Group;
    /** Titik target E dalam lokal grup daun (mengikuti daun saat berputar). */
    targetPos: [number, number, number];
    /** Posisi dunia pusat daun untuk deteksi proximiti pemakaian naskah. */
    center: [number, number, number];
    openAngle: number;
    startOpen: boolean;
    collar?: THREE.Mesh;
  }
): SceneDoor {
  const st = {
    angle: opts.startOpen ? opts.openAngle : 0,
    target: opts.startOpen ? opts.openAngle : 0,
    lastT: -1
  };
  opts.leaf.rotation.y = st.angle;

  const target = new THREE.Object3D();
  target.position.set(...opts.targetPos);
  opts.leaf.add(target);

  addDynamicTick((t) => {
    const dt = st.lastT < 0 ? 0 : Math.min(0.1, Math.max(0, t - st.lastT));
    st.lastT = t;
    if (st.angle !== st.target) {
      st.angle += (st.target - st.angle) * Math.min(1, dt * 7);
      if (Math.abs(st.target - st.angle) < 0.004) st.angle = st.target;
      opts.leaf.rotation.y = st.angle;
    }
    if (opts.collar) {
      // Proxy aktif hanya saat target tertutup dan daun hampir sampai -
      // pemain yang berdiri di ambang saat ditutup didorong keluar halus,
      // bukan tersentak di tengah animasi.
      opts.collar.userData.colliderEnabled =
        st.target === 0 && Math.abs(st.angle) < 0.4;
    }
  });

  return {
    id: opts.id,
    interactive: opts.interactive,
    target,
    center: new THREE.Vector3(...opts.center),
    open: () => { st.target = opts.openAngle; },
    close: () => { st.target = 0; },
    toggle: () => { st.target = Math.abs(st.target) > opts.openAngle / 2 ? 0 : opts.openAngle; },
    isOpen: () => st.target !== 0
  };
}

/**
 * Pintu depan di dinding +z dengan LUBANG TEMBUS setinggi 2,15 m.
 *
 * Dahulu daun pintu menempel rata pada tembok utuh (murni penampil), sehingga
 * membukanya justru memperlihatkan tembok di belakangnya. Kini `roomShell`
 * memotong celah di dinding, lalu fungsi ini memasang panel gelap di muka
 * luar celah: pintu membuka ke kegelapan (sahabat vibe horor: void memang
 * tidak apa-apa), sekaligus panel itu menutup lubang supaya pemain tetap
 * tidak bisa berjalan keluar tanpa naskah. Daun berengsel di sisi kanan
 * terbuka ke luar, jadi ruang di dalam tidak tersapu daun yang menonjol.
 *
 * `blockOutside = false` (adegan ber-eksterior): panel gelap dan kolidernya
 * ditiadakan: balik daun memperlihatkan pekarangan, dan pemain boleh
 * berjalan keluar sampai pagar; pintu keluar bab tetap lewat naskah.
 */
function doorOnZ(kit: Kit, d: number, trim: number, blockOutside = true): void {
  const zInner = d / 2 - 0.1;
  const jambZ = zInner - 0.07;
  box(kit, 0.1, 2.1, 0.14, trim, -0.65, 1.05, jambZ, false);
  box(kit, 0.1, 2.1, 0.14, trim, 0.65, 1.05, jambZ, false);
  box(kit, 1.4, 0.12, 0.14, trim, 0, 2.16, jambZ, false);

  // Panel gelap di muka luar celah: penutup lubang sekaligus "langit malam"
  // yang terlihat saat daun terbuka. Ikut jadi kolider. Tidak dipasang bila
  // adegan punya dunia luar: di belakang celah sudah ada teras & pekarangan.
  if (blockOutside) {
    box(kit, 1.3, 2.15, 0.08, 0x0b0d10, 0, 1.075, d / 2 + 0.06, true);
  }

  const leafW = 1.25;
  const leaf = new THREE.Group();
  const panel = new THREE.Mesh(boxGeo(leafW, 2.02, 0.08), mat(trim));
  panel.position.set(-leafW / 2, 1.01, 0);
  leaf.add(panel);
  const inset = new THREE.Mesh(boxGeo(0.34, 0.7, 0.09), mat(palette.wood));
  inset.position.set(-leafW / 2, 1.18, 0);
  leaf.add(inset);
  const knob = new THREE.Mesh(sphereGeo(0.05, 6, 5), mat(palette.metal));
  knob.position.set(-leafW + 0.16, 1.0, -0.06);
  leaf.add(knob);
  // Engsel di tepi kanan kusen (x=+0.6); tertutup = daun membentang -0,65..+0,6.
  leaf.position.set(0.6, 0, zInner - 0.04);
  kit.group.add(leaf);

  kit.doors.push(makeHingedDoor(kit, {
    id: 'pintu_depan',
    interactive: false,   // naskah bab punya interaktif keluar sendiri
    leaf,
    targetPos: [-leafW / 2, 1.0, 0],
    center: [0, 1.0, zInner],
    openAngle: 1.6,       // terbuka ke luar, hampir 90° ke teras
    startOpen: false
  }));
}

/**
 * Pintu tembus pada dinding bagian dalam (dinding sepanjang sumbu X).
 *
 * Berbeda dengan `doorOnZ` yang daunnya membuka ke luar, celah di sini
 * benar-benar terbuka: pemain bisa bolak-balik antar ruang: asalkan pintunya
 * dibuka. Pintu berengsel dengan logika buka/tutup: mulai TERTUTUP (kamar
 * benar-benar terasa sebagai ruangan sendiri), menutup celah lewat proxy
 * ambang saat tertutup, dan berayun ~100° ke dalam kamar saat dibuka.
 */
function doorwayOnX(kit: Kit, x: number, z: number, gap = 1.3, h = 3, id = 'pintu_kamar'): void {
  const doorH = 2.15;
  const trim = palette.woodDark;
  // Dinding di atas ambang menutup celah sampai plafon.
  box(kit, 0.2, h - doorH - 0.06, gap, palette.wall, x, doorH + 0.06 + (h - doorH - 0.06) / 2, z, true);
  // Kusen.
  box(kit, 0.26, doorH, 0.14, trim, x, doorH / 2, z - gap / 2, false);
  box(kit, 0.26, doorH, 0.14, trim, x, doorH / 2, z + gap / 2, false);
  box(kit, 0.26, 0.12, gap + 0.28, trim, x, doorH + 0.06, z, false);

  // Daun pintu tergantung di engsel selatan (z + gap/2) dan menutup rapat
  // saat posisi 0: panjang daun sedikit melewati kusen supaya tidak ada
  // celah bayangan di tepi utara.
  const leafW = gap - 0.04;
  const leaf = new THREE.Group();
  const panel = new THREE.Mesh(
    boxGeo(0.07, doorH - 0.16, leafW),
    mat(0x4f6b5c)
  );
  panel.position.set(0, (doorH - 0.16) / 2 + 0.04, -leafW / 2);
  leaf.add(panel);
  const inset = new THREE.Mesh(boxGeo(0.08, 0.7, leafW * 0.5), mat(palette.woodDark));
  inset.position.set(0, 1.15, -leafW * 0.55);
  leaf.add(inset);
  const knob = new THREE.Mesh(sphereGeo(0.05, 6, 5), mat(palette.metal));
  knob.position.set(0, 1.0, -leafW + 0.12);
  leaf.add(knob);
  leaf.position.set(x, 0, z + gap / 2);
  kit.group.add(leaf);

  // Proxy ambang: memadatkan celah selama pintu tertutup. Tanpa ini kapsul
  // pemain hanya mengecek dua bola (kaki & kepala) dan daun setebal 7 cm
  // berada di antara keduanya: pemain akan menembus pintu tertutup.
  const collar = new THREE.Mesh(
    boxGeo(0.18, doorH, gap + 0.1),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  collar.position.set(x, doorH / 2, z);
  kit.group.add(collar);
  kit.colliders.push(collar);

  kit.doors.push(makeHingedDoor(kit, {
    id,
    interactive: true,
    leaf,
    targetPos: [0, 1.0, -leafW * 0.55],
    center: [x, 1.0, z],
    openAngle: 1.75,       // ~100° ke dalam kamar, lorong selalu jelas
    startOpen: false,      // kamar terkunci awal: pemain membukanya dengan E
    collar
  }));
}

function roomShell(kit: Kit, w: number, d: number, h: number, opts: RoomShellOptions = {}): void {
  const fc = opts.floorColor ?? palette.floorWood;
  const wc = opts.wallColor ?? palette.wall;
  const trim = palette.woodDark;
  const t = 0.2;

  floor(kit, w, d, fc);

  // Keempat dinding selalu dibuat.
  //
  // Dulu dinding kanan hanya dibuat ketika `doorZ` tidak dipakai, sehingga
  // lima ruangan (rumah, kedai, warung, gubuk, balai) terbuka di satu sisi dan
  // pemain bisa melihat ruang kosong. Lalu cabang `doorZ` menambah dua segmen
  // dinding yang saling menimpa dinding depan, sehingga permukaannya berkedip
  // (z-fighting) dan pintunya tidak pernah benar-benar terbentuk.
  //
  // Jendela kini berupa lubang tembus (wallWithHoles): bukan panel yang
  // ditempel di atas tembok: sehingga pemain benar-benar melihat keluar:
  // diorama pemandangan yang dipasang windowPortal di luar dinding.
  const windows = opts.windows ?? (w >= 7 ? 2 : 0);
  const northHoles: WallHole[] = [...(opts.northWindows ?? [])];
  if (windows > 0) {
    const yc = Math.min(1.65, h - 1.1);
    const spread = w * 0.24;
    for (let i = 0; i < windows; i++) {
      const x = (i - (windows - 1) / 2) * spread;
      northHoles.push({ x, w: 1.4, y0: yc - 0.6, y1: yc + 0.6 });
    }
  }
  const southHoles = [...(opts.southWindows ?? [])];
  // Pintu depan kini berupa LUBANG TEMBUS di dinding +z (bukan daun yang
  // ditempel di tembok utuh), sehingga membukanya memperlihatkan celah gelap
  // di baliknya: bukan tembok. Lubangnya ikut masuk daftar potongan dinding.
  if (opts.doorZ) southHoles.push({ x: 0, w: 1.3, y0: 0, y1: 2.15 });

  if (northHoles.length) wallWithHoles(kit, w, h, t, -d / 2, wc, northHoles);
  else wall(kit, w, h, t, 0, -d / 2, wc);
  if (southHoles.length) wallWithHoles(kit, w, h, t, d / 2, wc, southHoles);
  else wall(kit, w, h, t, 0, d / 2, wc);
  wall(kit, t, h, d, -w / 2, 0, wc);
  wall(kit, t, h, d, w / 2, 0, wc);

  trimRing(kit, w, d, h, trim);
  ceiling(kit, w, d, h + 0.07, palette.wallDark);

  if (opts.doorZ) doorOnZ(kit, d, trim, !opts.exterior);

  // Lubang pintu (y0 = 0) bukan jendela: tidak dipasangi diorama.
  for (const hole of northHoles) {
    if (hole.y0 > 0.01) windowPortal(kit, hole, -d / 2, -1, { curtain: opts.windowCurtains, exterior: opts.exterior });
  }
  for (const hole of southHoles) {
    if (hole.y0 > 0.01) windowPortal(kit, hole, d / 2, 1, { curtain: opts.windowCurtains, exterior: opts.exterior });
  }
}

function buildRumah(kit: Kit): void {
  // Jendela rumah kini lubang tembus + diorama pemandangan (windowPortal):
  // kamar dan ruang tamu menghadap utara (-z), teras menghadap selatan (+z).
  // Posisi bawaan shell (±1,32) jatuh di jalur partisi dan di belakang rak,
  // jadi posisi lubangnya ditentukan sendiri di sini.
  roomShell(kit, 11, 9, 3, {
    doorZ: true,
    windows: 0,
    windowCurtains: true,
    // Jendela tembus langsung ke pekarangan: dunia luar dibangun sendiri di
    // akhir buildRumah, tanpa niche diorama.
    exterior: true,
    northWindows: [
      { x: -4.3, w: 1.4, y0: 1.05, y1: 2.25 },  // jendela kamar
      { x: 1.35, w: 1.4, y0: 1.05, y1: 2.25 }   // jendela ruang tamu
    ],
    southWindows: [
      { x: 2.6, w: 1.4, y0: 1.1, y1: 2.3 }      // jendela teras
    ]
  });

  // --- Struktur rumah: DUA kamar terpisah + ruang tamu ---
  // Partisi di x=-1.6 kini punya dua pintu engsel: utara ke kamar Dimas,
  // selatan ke kamar Raka. Segmen dinding disusun mengikuti kedua celah itu
  // sehingga tiap kamar adalah ruangan sendiri dengan pintunya sendiri.
  wall(kit, 0.2, 3, 0.75, -1.6, -4.125, palette.wall);     // segmen ujung utara
  doorwayOnX(kit, -1.6, -3.1, 1.3, 3, 'pintu_kamar');      // pintu kamar Dimas
  wall(kit, 0.2, 3, 1.5, -1.6, -1.7, palette.wall);        // segmen antara pintu
  doorwayOnX(kit, -1.6, -0.3, 1.3, 3, 'pintu_kamar_raka'); // pintu kamar Raka
  wall(kit, 0.2, 3, 0.65, -1.6, 0.675, palette.wall);      // segmen ujung selatan
  box(kit, 0.26, 0.2, 5.5, palette.woodDark, -1.6, 2.88, -1.75, false); // balok di atas partisi
  // Dinding pemisah kedua kamar (z=-1.9): kepala kasur Raka menempel di
  // sisi utaranya, kaki kasur Dimas berhenti di sisi selatannya, jadi
  // kamar tidur lama yang berbagi satu ruang kini terbelah rapi dua kamar.
  wall(kit, 3.9, 3, 0.2, -3.55, -1.9, palette.wall);
  box(kit, 3.9, 0.2, 0.26, palette.woodDark, -3.55, 2.88, -1.9, false); // balok pemisah
  // Dinding selatan kamar Raka memisahkan kamar dari dapur; akses dapur
  // tetap lewat ruang tengah (partisi berhenti di z=1.0, sebelahnya terbuka).
  wall(kit, 3.9, 3, 0.2, -3.55, 1.0, palette.wall);
  // Kotak sekring di sisi ruang tengah partisi: tutupnya butuh obeng.
  fuseBox(kit, -1.465, 1.7, 0.62, Math.PI / 2);
  // Lampu di atas tiap pintu kamar: kedua lorong menyala dari ruang tamu
  // supaya jalurnya terlihat jelas sejak pemain masuk rumah.
  lampAt(kit, -1.2, 2.45, -3.1, palette.lamp, 0.7, 5);
  lampAt(kit, -1.2, 2.45, -0.3, palette.lamp, 0.7, 5);
  lampAt(kit, -3.4, 2.6, -2.4, palette.lamp, 0.7, 8);     // lampu kamar Dimas
  lampAt(kit, -3.4, 2.6, -0.4, palette.lamp, 0.65, 7);    // lampu kamar Raka

  // --- Kamar Dimas (utara) & kamar Raka (selatan) ---
  bed(kit, -3.9, -3.1);                                   // kasur Dimas
  bed(kit, -3.9, -0.7, 0x3a4a6b); // kasur Raka: selimut biru, bukan merah kembar
  // Karpet kecil di lorong antara pintu dan kasur: lantai tiap kamar terasa
  // tertata. Tipis tanpa kolider, pemain melangkahinya begitu saja.
  rug(kit, -2.55, -4.0, 0.9, 0.6, palette.fabricRed);    // kamar Dimas
  rug(kit, -2.7, -1.4, 1.0, 0.8, palette.fabricRed);     // kamar Raka
  box(kit, 0.5, 0.6, 0.5, palette.woodDark, -4.8, 0.3, -3.6, true);   // nakas Dimas
  phoneDevice(kit, -4.8, 0.616, -3.6, 0.4);
  radioBox(kit, -4.8, 0.6, -3.42, 0.2);
  // Nakas Raka: meja kecil berisi buku bacaan tersimpan rapi di sisi
  // tempat tidurnya sendiri, sebangun dengan nakas di kamar sebelah.
  box(kit, 0.45, 0.55, 0.4, palette.woodDark, -4.85, 0.275, -1.3, true);
  box(kit, 0.18, 0.04, 0.13, 0x3a4a6b, -4.85, 0.57, -1.3, false);
  // Laci ruang tengah: badan berongga + daun yang bisa meluncur (lihat
  // chestOfDrawers). Kolidernya satu (addGroupProxy): balok badan yang dulu
  // menumpuk di posisi sama ikut dibuang supaya kapsul tidak tersentak.
  chestOfDrawers(kit, 1.0, -4.05);
  radioBox(kit, 0.35, 0.95, -4.0, 0.1);
  // Tumpukan tagihan: enam lembar bertumpuk, alur pembuka bab pertama.
  for (let i = 0; i < 6; i++) {
    const sheet = box(kit, 0.34 - i * 0.01, 0.02, 0.24, palette.paper,
      1.4, 0.962 + i * 0.022, -4.0, false);
    // Tiap lembar sedikit berputar: tumpukan yang disusun tangan, bukan
    // cetakan mesin yang semua tepinya segaris.
    sheet.rotation.y = (i % 2 ? -1 : 1) * (0.03 + i * 0.02);
  }
  // Rak terbuka dengan papan dan buku: pengganti balok padat yang dulu
  // menutupi separuh jendela dan terbaca sebagai kotak kuning polos.
  shelf(kit, -0.6, -4.1, 1.4, 1.9);
  radioBox(kit, -0.6, 1.94, -4.1, 0);
  wardrobe(kit, 4.6, 1.5, -Math.PI / 2);
  pictureFrame(kit, 2.4, 1.9, -4.35, 0.5, 0.6, 0);
  pictureFrame(kit, 3.3, 1.9, -4.35, 0.45, 0.55, 0);
  mirrorPanel(kit, 5.35, 1.7, 0, 0.8, 1.1, -Math.PI / 2);

  // --- Dapur (dinding depan kiri) ---
  // Lantai keramik & backsplash membatasi zona dapur tanpa dinding yang
  // menghalangi langkah: struktur ruang terbaca dari warna lantainya.
  box(kit, 4.4, 0.04, 1.4, palette.floorStone, -3.1, 0, 3.75, true);
  box(kit, 3.5, 0.5, 0.05, 0x9fb0aa, -2.9, 1.15, 4.37, false);
  kitchenCounter(kit, -3.4, 4.05, 2.4, Math.PI);
  stove(kit, -1.6, 4.05, Math.PI);
  fridge(kit, -5.0, 3.0, Math.PI / 2);
  box(kit, 1.0, 1.5, 0.45, palette.woodDark, -1.0, 0.75, 4.15, true); // lemari makan
  box(kit, 0.9, 0.04, 0.4, palette.paper, -1.0, 1.52, 4.15, false);
  // Belah dua daun + gagang kuningan: kabinet terbaca sebagai lemari yang
  // bisa dibuka, bukan balok kayu polos di dinding dapur.
  box(kit, 0.03, 1.36, 0.02, palette.wood, -1.0, 0.73, 4.385, false);
  box(kit, 0.04, 0.2, 0.04, palette.metal, -1.07, 0.95, 4.39, false);
  box(kit, 0.04, 0.2, 0.04, palette.metal, -0.93, 0.95, 4.39, false);
  cup(kit, -2.4, 0.99, 4.0);                                          // air minum
  box(kit, 0.3, 0.015, 0.22, palette.paper, -3.0, 0.92, 3.95, false); // catatan resep
  const resepPen = cylinder(kit, 0.007, 0.007, 0.13, 0x3a4a6b, -3.0, 0.938, 3.89, false);
  resepPen.rotation.z = Math.PI / 2; // pulpen terguling di atas catatan
  resepPen.rotation.y = 0.5;
  screwdriver(kit, -4.1, 0.94, 4.0, 0.35);                             // obeng rantai b01

  // --- Ruang makan & keluarga ---
  table(kit, 2.6, -2.4, 1.6, 0.9);
  chair(kit, 2.6, -1.6, 0);
  chair(kit, 2.6, -3.2, Math.PI);
  // Permukaan meja ada di y=0.82 (tabletop 0,78 + setengah tebal 0,08):
  // benda kecil diturunkan supaya benar-benar menempel, bukan melayang.
  envelope(kit, 2.0, 0.828, -2.7, 0.15);                               // amplop
  wallet(kit, 3.1, 0.835, -2.7, -0.2);                                 // dompet
  // Struk robek jadi dua helai yang merosak: sobekannya yang bikin benda
  // ini terbaca sebagai bukti, bukan sekadar kertas datar.
  const strukA = box(kit, 0.24, 0.012, 0.14, palette.paper, 2.56, 0.826, -2.24, false);
  strukA.rotation.y = -0.14;
  const strukB = box(kit, 0.18, 0.012, 0.1, palette.paper, 2.68, 0.826, -2.1, false);
  strukB.rotation.y = 0.5;
  plate(kit, 2.1, 0.832, -2.2);
  phoneDevice(kit, 3.2, 0.835, -2.35, 0.7);
  sofa(kit, 3.4, 1.6, 0);
  rug(kit, 3.4, 2.7, 2.2, 1.6);
  tvSet(kit, 3.4, 3.6, Math.PI);
  shelf(kit, 4.6, -3.6, 1.6, 2.0);
  hangingLamp(kit, 2.6, 3.0, -2.4, palette.lamp, 1.0, 0.7);
  lampAt(kit, -1.0, 2.6, 1.0, palette.lamp, 0.9, 11);
  // Dinding timur kini bersih: panel pintu palsu diganti bingkai foto,
  // pintu Raka yang sesungguhnya sudah ada di partisi kamar.
  pictureFrame(kit, 5.35, 1.9, -2.5, 0.5, 0.6, -Math.PI / 2);
  doorPanel(kit, -5.35, 1.5, Math.PI / 2);
  shoesPair(kit, 0.5, 4.1, 0.3);
  // Jaket yang tergantung di punggung kursi meja makan.
  box(kit, 0.4, 0.42, 0.16, 0x3a4a6b, 2.6, 0.86, -1.78, false);
  box(kit, 0.14, 0.3, 0.14, 0x3a4a6b, 2.4, 0.7, -1.78, false);

  // Rumah ini milik Dimas: tidak ada tamu yang tinggal di dalamnya.
  // Dulu dua figur (pedagang pasar & mandor proyek) berdiri di ruang tamu;
  // kini ruang tamu kosong, hanya perabot.
  calendarSheet(kit, -1.6, 2.1, 4.35, Math.PI);
  wallClock(kit, 2.4, 2.4, 4.35, Math.PI);
  poster(kit, -4.9, 1.9, -1.0, 0.7, 0.9, palette.paper, Math.PI / 2);

  // --- Jangkar penanda interaksi ---
  // Semua id fisik yang dipakai naskah 8 bab berlatar rumah ini.
  const A = (id: string, x: number, y: number, z: number): void => anchor(kit, id, x, y, z);
  A('kasur', -3.9, 0.75, -3.1);
  A('kasur_dimas', -3.9, 0.75, -3.1);
  A('kamar_dimas', -3.9, 0.9, -3.1);
  A('kasur_raka', -3.9, 0.75, -0.7);
  A('catatan_raka', -3.7, 0.8, -1.6);
  A('lemari', 4.1, 1.3, 1.5);
  A('lemari_dimas', 4.1, 1.3, 1.5);
  A('lemari_makan', -1.0, 1.3, 3.85);
  A('meja_makan', 2.6, 1.05, -2.45);
  A('piring', 2.1, 1.0, -2.2);
  A('amplop', 2.0, 1.0, -2.7);
  A('dompet', 3.1, 1.0, -2.7);
  A('struk_robek', 2.6, 1.0, -2.2);
  A('ponsel', 3.2, 1.0, -2.35);
  A('ponsel_pinjol', 3.2, 1.0, -2.35);
  A('ponsel_rudi', 3.2, 1.0, -2.35);
  A('telepon', -4.8, 0.85, -3.5);
  A('telepon_rudi', -4.8, 0.85, -3.5);
  A('laci', 1.0, 0.7, -3.7);
  A('tumpukan_tagihan', 1.4, 1.15, -3.95);
  A('radio', 0.35, 1.2, -3.95);
  A('radio_kamar', -0.6, 2.1, -4.05);
  A('kompor', -1.6, 1.0, 3.7);
  A('kulkas', -4.7, 1.3, 3.0);
  A('dapur', -3.4, 1.1, 3.7);
  A('air', -2.4, 1.15, 4.0);
  A('catatan_resep', -3.0, 1.1, 3.95);
  A('obeng', -4.1, 1.0, 4.0);
  A('kotak_sekring', -1.25, 1.7, 0.62);
  A('cermin', 5.15, 1.7, 0);
  A('kalender', -1.6, 1.75, 4.2);
  A('kalender_dinding', -1.6, 1.75, 4.2);
  A('foto_keluarga', 2.4, 1.9, -4.2);
  A('foto_orang_tua', 3.3, 1.9, -4.2);
  A('jendela', 1.35, 1.7, -4.2);
  A('jendela_teras', 2.6, 1.7, 4.2);
  A('pintu_depan', 0, 1.3, 4.15);
  A('pintu_keluar', 0, 1.3, 4.15);
  A('gerendel_pintu', 0.7, 1.1, 4.15);
  A('pintu_belakang', -5.1, 1.3, 1.5);
  A('pintu_kamar_dimas', -1.25, 1.3, -3.1);
  A('pintu_raka', -1.25, 1.3, -0.3);
  A('jejak_basah', 0.4, 0.4, 3.5);
  A('bayangan_lorong', -0.6, 1.5, -3.4);
  A('jaket_kursi', 2.6, 1.0, -1.75);

  // --- Dunia luar rumah ---
  // Jendela & pintu depan memandang ke sini: pekarangan dengan tanah,
  // pagar, pohon berayun, dan cakrawala desa: pengganti niche diorama.
  buildExteriorRumah(kit);
}

/**
 * Pekarangan rumah Dimas: dunia yang terlihat dari balik jendela dan pintu.
 *
 * Semula jendela rumah memakai niche diorama tertutup: pemandangan yang
 * "menempel" di balik lubang dan mudah terbaca sebagai kotak. Kini shell
 * rumah memakai opsi `exterior`, lubang jendela tembus apa adanya, dan
 * fungsi ini membangun dunia nyata di sekelilingnya: tanah rumput yang
 * melingkupi rumah, emper teras dan jalur setapak ke pagar, pohon yang
 * berayun (parallax sungguhan saat pemain melangkah), semak di garis dasar
 * dinding, awan yang melintas, burung menyeberang, dan cakrawala desa.
 *
 * Tidak ada lampu tambahan: warna netral diwarnai kabut preset cahaya bab -
 * pagi terang di b01, kabut pekat di bab malam: sehingga eksterior selalu
 * satu bahasa dengan interior.
 */
function buildExteriorRumah(kit: Kit): void {
  // Tanah pekarangan melingkupi rumah sampai cakrawala. Top -0,02 m: sedikit
  // di bawah lantai dalam (y = 0) supaya tidak pernah menimpa.
  groundDisc(kit, 110, palette.floorGrass, -0.07);

  // Emper teras di depan pintu + jalur setapak menyeberangi halaman.
  box(kit, 3.2, 0.14, 2.4, palette.floorStone, 0, -0.03, 5.8, false);
  box(kit, 1.3, 0.09, 9.6, palette.floorStone, 0, -0.05, 11.8, false);

  // --- Pagar pekarangan ---
  // Tiang + dua rel per sisi; celah gerbang di sisi selatan (muka rumah)
  // searah jalur setapak. Kolider penuh: pemain yang keluar pintu depan
  // berhenti di pagar, bukan menembus ke kekosongan.
  const F = 17;
  const post = (px: number, pz: number): void => {
    cylinder(kit, 0.04, 0.055, 1.1, palette.woodDark, px, 0.55, pz, true);
  };
  for (let i = -F; i <= F + 0.01; i += 2.85) {
    post(i, -F);                           // sisi utara
    if (Math.abs(i) > 1.7) post(i, F);     // sisi selatan (celah gerbang)
  }
  for (let i = -F + 2.85; i < F; i += 2.85) {
    post(-F, i);                           // sisi barat
    post(F, i);                            // sisi timur
  }
  const rail = (w: number, d: number, px: number, pz: number): void => {
    for (const y of [0.42, 0.86]) box(kit, w, 0.06, d, palette.wood, px, y, pz, true);
  };
  rail(2 * F + 0.1, 0.06, 0, -F);                    // utara
  rail(0.06, 2 * F + 0.1, -F, 0);                    // barat
  rail(0.06, 2 * F + 0.1, F, 0);                     // timur
  rail(F - 1.7, 0.06, -(1.7 + F) / 2, F);            // selatan, segmen barat
  rail(F - 1.7, 0.06, (1.7 + F) / 2, F);             // selatan, segmen timur

  // --- Pohon berayun: parallax hidup di balik jendela ---
  // Empat pohon menghadap jendela utara (kamar & ruang tamu), dua menghadap
  // jendela teras; tajuk kerucut berlapis memberi siluet pinus desa.
  const tree = (tx: number, tz: number, s: number, phase: number): void => {
    const g = new THREE.Group();
    g.position.set(tx, 0, tz);
    const trunk = new THREE.Mesh(
      cylGeo(0.09 * s, 0.13 * s, 1.6 * s, 6),
      mat(palette.woodDark)
    );
    trunk.position.y = 0.8 * s;
    g.add(trunk);
    kit.colliders.push(trunk);
    const lower = new THREE.Mesh(coneGeo(1.05 * s, 2.5 * s, 7), mat(0x2c3a28));
    lower.position.y = 2.5 * s;
    g.add(lower);
    const upper = new THREE.Mesh(coneGeo(0.72 * s, 1.8 * s, 7), mat(0x33452f));
    upper.position.y = 3.6 * s;
    g.add(upper);
    kit.group.add(g);
    addDynamicTick((t) => {
      g.rotation.z = Math.sin(t * 0.6 + phase) * 0.02;
      g.rotation.x = Math.sin(t * 0.47 + phase * 1.7) * 0.014;
    });
  };
  tree(-4.6, -10.5, 1.3, 0.4);
  tree(1.8, -9.6, 1.1, 1.9);
  tree(-8.5, -8.0, 1.0, 3.4);
  tree(7.6, -9.0, 1.2, 4.7);
  tree(3.0, 10.0, 1.25, 2.6);
  tree(-6.8, 9.4, 1.0, 5.3);

  // Semak di sekeliling dinding: garis dasar rumah yang tidak kosong.
  for (const [bx, bz, br] of [
    [-6.6, -5.4, 0.55], [6.7, -4.6, 0.5], [-6.9, 3.6, 0.6],
    [6.6, 5.4, 0.5], [-4.4, 6.2, 0.45], [4.9, -6.4, 0.55]
  ] as const) {
    bush(kit, bx, bz, br);
  }

  // --- Awan melintas ---
  // Jauh dan tinggi (z ±46, y 15..20): terlihat lewat atas jendela, memberi
  // langit gerak tanpa mengganggu pandangan rendah ke pekarangan.
  const cloud = (cz: number, y: number, w: number, speed: number, off: number): void => {
    const c = new THREE.Mesh(
      boxGeo(w, 0.7, 0.4),
      mat(0xdfeaf0, { emissive: 0x51666f, transparent: true, opacity: 0.85 })
    );
    c.position.set(0, y, cz);
    c.userData.animatedLocal = true; // awan melintas: posisi lokal dianimasikan
    kit.group.add(c);
    addDynamicTick((t) => {
      c.position.x = ((((t * speed + off) % 64) + 64) % 64) - 32;
    });
  };
  cloud(-46, 15, 7, 0.45, 0);
  cloud(-52, 19, 5, 0.32, 21);
  cloud(48, 16, 6, -0.38, 12);
  cloud(55, 20, 4.5, -0.28, 37);

  // --- Burung menyeberang ---
  // Siluet V yang menyeberang tiap ±19 detik di belakang halaman: gerak
  // kecil yang membuat langit terasa ditempati.
  const bird = (cz: number, y: number, phase: number): void => {
    const g = new THREE.Group();
    const wingA = new THREE.Mesh(boxGeo(0.5, 0.05, 0.22), mat(0x141a16));
    wingA.position.x = -0.26;
    const wingB = wingA.clone();
    wingB.position.x = 0.26;
    g.add(wingA, wingB);
    g.position.set(0, y, cz);
    g.visible = false;
    g.userData.animatedLocal = true; // burung menyeberang: sayap mengepak
    kit.group.add(g);
    addDynamicTick((t) => {
      const u = (((t + phase) % 19) + 19) % 19;
      if (u > 5.4) {
        if (g.visible) g.visible = false;
        return;
      }
      g.visible = true;
      const p = u / 5.4;
      g.position.x = (0.5 - p) * 56;
      g.position.y = y + Math.sin(p * Math.PI * 2) * 0.6;
      const flap = Math.sin(t * 8) * 0.5;
      wingA.rotation.z = 0.35 + flap;
      wingB.rotation.z = -0.35 - flap;
    });
  };
  bird(-26, 6.5, 0);
  bird(28, 7.4, 7);

  // --- Cakrawala desa ---
  // Bukit, hutan jauh, dan deret rumah berjendela menyala. Kabut preset
  // melembutkannya sesuai bab: kabut tipis di pagi, hitam pekat di malam.
  distantBackdrop(kit, { radius: 85, houses: 5, trees: 18, hills: 7, color: 0x39452f, seed: 21 });

  // --- Atap rumah tampak dari luar ---
  // Lisplang tepi atap menutup pita pertemuan langit-langit (sisi langit-
  // langit rata dengan muka dinding, jadi dari luar bisa berkedip) sekaligus
  // memberi tepi kayu pada fasad. Atap limasan dipaksa lebih lebar dari
  // langit-langit supaya sudutnya tidak menembus permukaan atap.
  box(kit, 11.08, 0.16, 9.08, palette.woodDark, 0, 3.0, 0, false);
  roofHip(kit, 0, 0, 11.4, 9.4, 3, 1.7, 0x74493a);
}

function buildKedai(kit: Kit): void {
  roomShell(kit, 13, 10, 3.2, { floorColor: palette.floorStone, doorZ: true });

  // --- Bar: meja bar, mesin espresso, etalase kue, dan barista ---
  box(kit, 4.5, 1.1, 0.8, palette.woodDark, -3.5, 0.55, -3.4, true);
  box(kit, 4.5, 0.1, 1.0, palette.metal, -3.5, 1.15, -3.4, false);
  coffeeMachine(kit, -4.4, 1.2, -3.5, 0);
  cupStack(kit, -2.6, 1.2, -3.5, 5);
  jar(kit, -1.9, 1.2, -3.5, 0xc9b48a);
  jar(kit, -1.9, 1.2, -3.0, 0x8a5a3a);
  shelf(kit, -4.8, -4.4, 2.4, 2.2);
  jar(kit, -5.4, 1.98, -4.4, 0xc9b48a);
  jar(kit, -4.7, 1.98, -4.4, 0x7a9a5a);
  cupStack(kit, -4.0, 1.98, -4.4, 4);
  radioBox(kit, -5.6, 0.1, -4.3, 0.4);
  figure(kit, -2.4, -4.25, { shirt: 0x6d5f52, pants: 0x2f2f33 }); // barista

  // Menu harian tertulis di papan gelap dinding kanan.
  wallBoard(kit, 6.32, 2.2, -2.0, 2.4, 1.2, -Math.PI / 2);

  // --- Meja tamu ---
  for (const tx of [-1.5, 1.1]) {
    table(kit, tx, 0.6, 1.3, 0.8);
    chair(kit, tx, 1.5, Math.PI);
    chair(kit, tx, -0.3, 0);
  }

  // Meja Rudi: dua gelas dan kotak korek api ditinggal begitu saja.
  table(kit, 3.7, 0.6, 1.4, 0.9);
  chair(kit, 3.7, 1.5, Math.PI);
  chair(kit, 3.7, -0.3, 0);
  rug(kit, 3.7, 0.7, 2.6, 2.2, palette.fabric);
  cupStack(kit, 3.4, 0.82, 0.5, 2);
  box(kit, 0.15, 0.04, 0.1, 0xc23a3a, 4.05, 0.84, 0.75, false);
  phoneDevice(kit, 3.15, 0.82, 0.7, 0.5);
  // Rudi benar-benar duduk di kursi mejanya menghadap pintu: saat dialog
  // bab b02 pemain berbicara tatap muka dengannya, bukan dengan suara
  // tanpa rupa. Kaus biru-abu adalah warna khas Rudi di scene lain.
  figure(kit, 3.7, -0.3, { seated: true, rotY: 0, shirt: 0x4a5b6b, pants: 0x2f2f33 });

  // --- Foto kenangan di dinding kiri ---
  pictureFrame(kit, -6.32, 1.9, 1.4, 0.7, 0.55, Math.PI / 2);
  pictureFrame(kit, -6.32, 1.9, -1.4, 0.7, 0.55, Math.PI / 2);

  // --- Pencahayaan & ornamen ---
  poster(kit, -6.32, 2.0, 3.4, 1.1, 0.8, 0x94a7b3, Math.PI / 2);
  poster(kit, 3.0, 2.1, -4.82, 1.4, 0.9, palette.paper, 0);
  for (const tx of [-1.5, 1.1, 3.7]) {
    hangingLamp(kit, tx, 3.2, 0.6, palette.lamp, 1.05, 0.55);
  }
  ceilingFan(kit, 0, 3.2, 2.6);
  lampAt(kit, -3.5, 2.6, -3.2, 0xffd9a0, 0.95, 9);
  // Lampu kecil dekat pintu: ruang depan yang dulu gelap kini terang
  // saat pemain masuk dan menghampiri meja Rudi.
  lampAt(kit, 0, 2.7, 3.6, 0xffd9a0, 0.65, 8);
  // Sorot lembut di belakang bahu Rudi: menjaga siluet kepala & kaus
  // biru-abunya menonjol dari arah pintu tanpa membuat meja silau.
  lampAt(kit, 3.7, 2.2, -0.55, 0xffd9a0, 0.7, 5);
  bucket(kit, 5.9, 4.2);

  const A = (id: string, x: number, y: number, z: number): void => anchor(kit, id, x, y, z);
  A('pintu_keluar', 0, 1.3, 4.8);
  A('meja_rudi', 4.25, 0.95, 0.85);
  A('gelas', 3.4, 0.95, 0.5);
  A('korek_api', 4.05, 0.95, 0.75);
  A('foto_kedai', -6.1, 1.9, 1.4);
  A('foto_sungai', -6.1, 1.9, -1.4);
}

function buildBus(kit: Kit): void {
  // Koridor sempit tertutup di kedua ujung: pemain tidak melihat ruang kosong
  // di belakang bus, dan setiap jendela menunjukkan pemandangan, bukan tembok.
  floor(kit, 3.0, 12, palette.floorRoad);
  box(kit, 3.2, 0.15, 12, palette.metal, 0, 2.6, 0, false);
  box(kit, 0.15, 2.4, 12, palette.metal, -1.55, 1.35, 0, true);
  box(kit, 0.15, 2.4, 12, palette.metal, 1.55, 1.35, 0, true);
  box(kit, 3.2, 2.5, 0.15, palette.metal, 0, 1.35, -6, true);
  box(kit, 3.2, 2.5, 0.15, palette.metal, 0, 1.35, 6, true);
  pane(kit, 1.7, 1.0, 0.1, 0xd6e8f2, 0, 1.75, 5.9, { emissive: 0x2a3d4a });

  // Karpet lorong memberi arah pandang dari pintu belakang ke kabin sopir.
  box(kit, 1.3, 0.03, 11, palette.fabric, 0, 0.03, 0, false);

  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 6; i++) {
      const z = -4.6 + i * 1.8;
      box(kit, 0.5, 0.12, 1.2, palette.fabricRed, side * 1.0, 0.46, z, true);
      box(kit, 0.14, 0.72, 1.2, palette.fabricRed, side * 1.32, 0.82, z, false);
      box(kit, 0.42, 0.4, 1.2, palette.metal, side * 1.05, 0.2, z, false);
      pane(kit, 0.1, 1.0, 1.3, 0xd6e8f2, side * 1.45, 1.7, z, { emissive: 0x2a3d4a });
    }
  }

  // Rel pegangan atas dan cincin strap: ciri khas kabin bus yang langsung
  // dikenali bahkan sebelum membaca prompt.
  for (const sx of [-0.9, 0.9]) {
    const rail = new THREE.Mesh(cylGeo(0.035, 0.035, 10.6, 6), mat(palette.metal));
    rail.rotation.x = Math.PI / 2;
    rail.position.set(sx, 2.2, 0);
    kit.group.add(rail);
  }
  for (let i = 0; i < 5; i++) {
    const z = -4 + i * 2;
    for (const sx of [-0.9, 0.9]) {
      const stem = new THREE.Mesh(boxGeo(0.03, 0.18, 0.03), mat(palette.metal));
      stem.position.set(sx, 2.08, z);
      kit.group.add(stem);
      const strap = new THREE.Mesh(torusGeo(0.09, 0.02, 5, 10), mat(0x2b2b2f));
      strap.position.set(sx, 1.9, z);
      kit.group.add(strap);
    }
  }

  // --- Kabin sopir ---
  box(kit, 1.4, 0.9, 0.6, palette.metal, 0, 0.5, -5.4, true);
  box(kit, 1.2, 0.3, 0.5, 0x2b2b2f, 0, 1.05, -5.4, false);
  const wheel = new THREE.Mesh(torusGeo(0.23, 0.045, 6, 14), mat(0x1f1f22));
  wheel.position.set(-0.5, 1.15, -5.05);
  wheel.rotation.x = Math.PI / 2 - 0.55;
  kit.group.add(wheel);
  cylinder(kit, 0.035, 0.035, 0.4, palette.metal, -0.5, 0.98, -5.15, false);
  box(kit, 0.5, 0.14, 0.5, palette.fabricRed, -0.5, 0.5, -4.6, true);
  box(kit, 0.5, 0.6, 0.12, palette.fabricRed, -0.5, 0.85, -4.85, false);
  box(kit, 0.24, 0.3, 0.2, palette.metal, 0.5, 1.2, -5.3, false);   // kotak karcis
  figure(kit, -0.5, -4.55, { rotY: Math.PI, seated: true, shirt: 0x3a4a6b, pants: 0x2b2b33 });

  // --- Pintu lipat penumpang di sisi kanan depan ---
  box(kit, 0.1, 2.2, 1.6, palette.woodDark, 1.5, 1.15, -3.4, false);
  for (const dz of [-0.37, 0.37]) {
    box(kit, 0.07, 1.9, 0.68, palette.metal, 1.44, 1.0, -3.4 + dz, false);
    pane(kit, 0.06, 0.7, 0.5, 0xd6e8f2, 1.42, 1.5, -3.4 + dz, { emissive: 0x2a3d4a });
  }

  // Lantai kabin dan lampu plafon.
  lampAt(kit, 0, 2.4, -2.5, 0xdfe7ff, 0.55, 8);
  lampAt(kit, 0, 2.4, 2.5, 0xdfe7ff, 0.55, 8);

  // Barang yang tertinggal di kursi penumpang.
  phoneDevice(kit, -1.0, 0.53, 0.8, 0.6);
  for (const dx of [-0.06, 0.06]) {
    const bud = new THREE.Mesh(boxGeo(0.05, 0.04, 0.06), mat(0xf0f0ea));
    bud.position.set(-1.0 + dx, 0.54, -1.0 + (dx > 0 ? 0.08 : -0.02));
    kit.group.add(bud);
  }
  const wire = new THREE.Mesh(boxGeo(0.02, 0.01, 0.3), mat(0xf0f0ea));
  wire.position.set(-1.0, 0.54, -1.18);
  kit.group.add(wire);
  box(kit, 0.24, 0.012, 0.32, palette.paper, 1.0, 0.54, -1.0, false);

  const A = (id: string, x: number, y: number, z: number): void => anchor(kit, id, x, y, z);
  A('kursi', -1.0, 0.7, 0.8);
  A('jendela', 1.4, 1.7, 0.8);
  A('hp_chat', -1.0, 0.62, 0.8);
  A('earphone', -1.0, 0.62, -1.05);
  A('foto_halaman', 1.0, 0.62, -1.0);
  A('sopir', -0.5, 1.1, -4.55);
  A('pintu_bus', 1.4, 1.3, -3.4);
}

function buildWarung(kit: Kit): void {
  roomShell(kit, 9, 8, 2.9, { floorColor: palette.floorStone, doorZ: true });

  // --- Loket Mak Yah ---
  box(kit, 3.6, 1.0, 0.7, palette.wood, -2.2, 0.5, -3.0, true);
  box(kit, 3.7, 0.06, 0.8, 0x9c8b63, -2.2, 1.03, -3.0, false);
  jar(kit, -3.4, 1.06, -3.0, 0xc9b48a);
  jar(kit, -2.7, 1.06, -3.0, 0x8a5a3a);
  jar(kit, -2.0, 1.06, -3.0, 0x7a9a5a);
  cylinder(kit, 0.19, 0.21, 0.3, 0xd8d8d0, -1.1, 1.22, -3.0, false);  // rice cooker
  figure(kit, -2.2, -3.85, { shirt: 0x7a4038, pants: 0x3a3a42 });      // Mak Yah

  shelf(kit, 3.6, -3.7, 2.6, 2.1);
  radioBox(kit, 3.0, 2.14, -3.7, 0.2);                                 // radio warung
  sack(kit, 4.5, -3.1, 0.4);
  sack(kit, 4.0, -3.0, 0.36, 0x8a7f66);
  sachetStrip(kit, -2.2, 2.4, -3.25, 8);
  wallBoard(kit, -4.4, 2.1, -1.0, 1.6, 1.0, Math.PI / 2, 0x5a3a2a);

  // --- Meja warga: dua warga duduk menghadap nasi bungkus ---
  table(kit, 0.4, 1.4, 1.8, 0.9);
  chair(kit, -0.7, 1.4, Math.PI / 2);
  chair(kit, 1.5, 1.4, -Math.PI / 2);
  figure(kit, -0.7, 1.4, { rotY: Math.PI / 2, seated: true, shirt: 0x6b7a52 });
  figure(kit, 1.5, 1.4, { rotY: -Math.PI / 2, seated: true, shirt: 0x7a5a4a });
  box(kit, 0.24, 0.16, 0.24, palette.paper, 0.6, 0.9, 1.3, false);
  box(kit, 0.24, 0.16, 0.24, palette.paper, 0.3, 0.9, 1.55, false);
  box(kit, 0.3, 0.02, 0.22, palette.paper, 0.0, 0.83, 1.4, false);

  // --- Meja pojok tempat Joy duduk termenung ---
  table(kit, 2.6, -0.6, 1.2, 0.7);
  chair(kit, 2.6, 0.3, Math.PI);
  figure(kit, 2.6, 0.3, { rotY: Math.PI, seated: true, shirt: 0x8a4038 });
  bottle(kit, 2.25, 0.82, -0.6);
  cylinder(kit, 0.1, 0.09, 0.03, palette.paper, 2.9, 0.83, -0.7, false);

  // --- Sisi lain: foto, ember, dan kotak barang ---
  pictureFrame(kit, 4.4, 2.0, 1.2, 0.5, 0.6, -Math.PI / 2);
  bucket(kit, 4.0, 3.3);
  crate(kit, -4.0, 3.3, 0.6);
  crate(kit, -3.3, 3.5, 0.5, palette.woodDark);
  lampAt(kit, 0, 2.5, 0, 0xffdca8, 1.0, 9);
  hangingLamp(kit, 0.4, 2.9, 1.4, 0xffdca8, 0.7, 0.5);

  const A = (id: string, x: number, y: number, z: number): void => anchor(kit, id, x, y, z);
  A('pintu_warung', 0, 1.3, 3.85);
  A('mak_yah', -2.2, 1.2, -3.7);
  A('meja_warga', 0.4, 1.0, 1.4);
  A('nasi_bungkus', 0.6, 1.0, 1.3);
  A('joy', 2.6, 1.1, 0.35);
  A('radio_warung', 3.0, 2.35, -3.7);
}

function buildGubuk(kit: Kit): void {
  // Halaman tanah terbuka: gubuk kini berdiri di tengah halaman, sehingga
  // mobil, jalan setapak, dan siluet desa di kejauhan ikut terlihat dari
  // dalam: bukan ruang tertutup tanpa konteks sama sekali.
  floor(kit, 34, 34, palette.floorDirt);
  groundDisc(kit, 150, 0x55504a, -0.16);
  distantBackdrop(kit, { radius: 120, houses: 4, trees: 18, hills: 7, color: 0x39412f });

  // Jalan setapak dari halaman menuju mulut gubuk.
  const path = new THREE.Mesh(boxGeo(3, 0.04, 16), mat(0x4a4034));
  path.position.set(0, 0.02, 10);
  kit.group.add(path);

  // --- Pondok: lantai kayu, tiga dinding, sisi depan terbuka ---
  const W = 9;
  const D = 7;
  const H = 2.9;
  floor(kit, W, D, palette.floorWood, 0.02);
  wall(kit, W, H, 0.2, 0, -D / 2, palette.wallDark);
  wall(kit, 0.2, H, D, -W / 2, 0, palette.wallDark);
  wall(kit, 0.2, H, D, W / 2, 0, palette.wallDark);
  // Dinding depan bersayap: celah tengah selebar pintu jadi akses masuk-keluar.
  wall(kit, 3, H, 0.2, -3, D / 2, palette.wallDark);
  wall(kit, 3, H, 0.2, 3, D / 2, palette.wallDark);
  box(kit, 3, 0.5, 0.2, palette.wallDark, 0, H - 0.25, D / 2, false);
  for (const sx of [-1.5, 1.5]) {
    cylinder(kit, 0.09, 0.11, H, palette.woodDark, sx, H / 2, D / 2 - 0.1, true);
  }
  ceiling(kit, W, D, H + 0.07, palette.wallDark);
  trimRing(kit, W, D, H, palette.woodDark);
  roofHip(kit, 0, 0, W, D, H + 0.15, 1.7, 0x6b4536);

  // --- Meja briefing & penghuni ---
  table(kit, 0, -1.2, 2.4, 1.1, 0.8, palette.wood);
  chair(kit, -1.4, 0.2, 0);
  chair(kit, 0, 0.2, 0);
  chair(kit, 1.4, 0.2, 0);
  // Peta operasi terbentang di atas meja, ditimbang amplop dan pensil.
  box(kit, 1.3, 0.02, 0.8, palette.paper, -0.2, 0.83, -1.3, false);
  box(kit, 0.24, 0.03, 0.16, palette.paper, 0.85, 0.85, -1.5, false);
  cylinder(kit, 0.012, 0.012, 0.24, 0xc9b48a, 0.4, 0.85, -1.0, false);
  for (const p of [[-0.6, -1.5], [0.1, -1.0], [-0.1, -1.6]]) {
    box(kit, 0.3, 0.01, 0.2, 0x8a9a7a, p[0], 0.845, p[1], false);
  }

  figure(kit, -1.9, -0.4, { rotY: Math.PI / 2, shirt: 0x4a5b6b });       // Rudi
  figure(kit, 1.4, 0.2, { seated: true, shirt: 0x6d5f52 });              // pekerja
  figure(kit, -2.6, 1.6, { rotY: Math.PI / 4, shirt: 0x7a6a4a, hat: true });
  figure(kit, 2.6, 1.4, { rotY: -Math.PI / 3, shirt: 0x5a6a5a });

  crate(kit, -3.4, 2.2, 0.8);
  crate(kit, -2.7, 2.5, 0.7, palette.woodDark);
  sack(kit, 3.6, -2.6, 0.42);
  sack(kit, 3.2, -2.4, 0.38, 0x8a7f66);
  woodPile(kit, -3.9, -2.8, 2);
  hangingLamp(kit, 0, H + 0.05, -1.2, 0xffcf8a, 1.1, 0.7);
  poster(kit, 0, 2.0, -D / 2 + 0.11, 1.6, 1.0, 0x8a7f66, 0);

  // --- Halaman luar ---
  car(kit, 3.2, 7.5, Math.PI / 2, 0x6a655c);
  lampPost(kit, -8, 9, 4, 0xffd9a0, 0.6);
  markerPost(kit, -2.2, 8.5);
  markerPost(kit, 2.2, 12);
  bush(kit, -7, 4.5, 0.7);
  bush(kit, 8, -3, 0.8);
  bush(kit, -9, -6, 0.6);
  bucket(kit, -4.6, 3.9);
  for (let i = 0; i < 5; i++) {
    tree(kit, -14 + i * 7, -14 - (i % 3) * 3, 4 + (i % 3));
  }

  const A = (id: string, x: number, y: number, z: number): void => anchor(kit, id, x, y, z);
  A('meja_gubuk', 0, 0.95, -1.2);
  A('peta_kertas', -0.2, 0.95, -1.3);
  A('amplop', 0.85, 0.95, -1.5);
  A('rudi', -1.9, 1.2, -0.4);
  A('pekerja', 1.4, 1.15, 0.2);
  A('mobil', 1.1, 1.2, 3.6);
  A('jalan_keluar', -0.6, 1.1, 5.6);
}

function buildForest(kit: Kit, dense: number): void {
  floor(kit, 60, 60, palette.floorGrass);
  groundDisc(kit, 150, 0x4b5a3a, -0.16);
  distantBackdrop(kit, { radius: 115, trees: 28, hills: 7, houses: 0, color: 0x2c3d24 });

  // Jalur setapak yang menghubungkan posisi pita penanda.
  const trail: Array<[number, number]> = [[0, 13], [-1.5, 5], [1.0, -2], [-2.4, -11]];
  for (let i = 0; i < trail.length - 1; i++) {
    const [x0, z0] = trail[i];
    const [x1, z1] = trail[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const seg = new THREE.Mesh(boxGeo(2.4, 0.05, len + 1.2), mat(0x55504a));
    seg.position.set((x0 + x1) / 2, 0.03, (z0 + z1) / 2);
    seg.rotation.y = Math.atan2(x1 - x0, z1 - z0);
    kit.group.add(seg);
  }

  scatterTrees(kit, dense, 26, 1.1, 5);
  scatterTrees(kit, Math.floor(dense / 2), 26, 2.4, 11);

  // --- Tiga pita penanda pada pohon yang ditumbuhi lumut ---
  const ribbonTrees: Array<[number, number]> = [[-3.5, 6.0], [3.0, -1.0], [-4.5, -8.0]];
  const ribbonColors = [0xc23a3a, 0xe0a02a, 0x3a8a5a];
  ribbonTrees.forEach(([tx, tz], i) => {
    tree(kit, tx, tz, 4.6);
    ribbon(kit, tx + 0.22, 1.5, tz + 0.16, ribbonColors[i]);
  });

  // --- Titik pertemuan jalur: patok dan lingkaran batu ---
  markerPost(kit, 0.6, -0.6);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const stone = new THREE.Mesh(sphereGeo(0.16, 5, 4), mat(0x6a655c));
    stone.position.set(Math.cos(a) * 1.1, 0.1, Math.sin(a) * 1.1 - 0.6);
    kit.group.add(stone);
  }

  // --- Papan peta jalur dan semak tempat bersembunyi ---
  signBoard(kit, -1.6, 8.6, 0.25);
  bush(kit, 5.6, 3.2, 1.15);
  bush(kit, -6.4, -3.5, 0.9);
  bush(kit, 6.8, -7.5, 1.0);

  // Batang tumbang dan reruntuhan batu di pinggir jalur.
  const log = new THREE.Mesh(cylGeo(0.26, 0.3, 3.4, 7), mat(palette.woodDark));
  log.rotation.z = Math.PI / 2;
  log.rotation.y = 0.5;
  log.position.set(6.5, 0.3, 7.5);
  kit.group.add(log);
  for (let i = 0; i < 10; i++) {
    const a = i * 1.7;
    const r = 4 + (i % 5) * 1.4;
    const rock = new THREE.Mesh(sphereGeo(0.3 + (i % 3) * 0.12, 5, 4), mat(0x6a655c));
    rock.position.set(Math.cos(a) * r, 0.16, Math.sin(a) * r);
    kit.group.add(rock);
  }

  const A = (id: string, x: number, y: number, z: number): void => anchor(kit, id, x, y, z);
  A('pita_1', -3.28, 1.5, 6.16);
  A('pita_2', 3.22, 1.5, -0.84);
  A('pita_3', -4.28, 1.5, -7.84);
  A('titik', 0.6, 1.1, -0.6);
  A('peta', -1.6, 1.25, 8.6);
  A('semak', 5.6, 1.0, 3.2);
  A('jalur_pulang', 0.4, 1.1, 11.5);
}

/** Kabel listrik melengkung antar tiang (mengikuti parabola, bukan garis kaku). */
function powerLine(kit: Kit, x: number, y: number, z0: number, z1: number): void {
  const seg = 8;
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    points.push(new THREE.Vector3(x, y - Math.sin(Math.PI * t) * 0.55, z0 + (z1 - z0) * t));
  }
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color: 0x151515 })
  );
  kit.group.add(line);
}

function buildJalan(kit: Kit): void {
  floor(kit, 70, 70, palette.floorGrass);
  groundDisc(kit, 150, 0x4b5a3a, -0.16);
  distantBackdrop(kit, { radius: 130, houses: 9, trees: 20, hills: 8, color: 0x35402f });

  // Jalan + bahu jalan, supaya jalan punya tepi dan tidak sekadar pita hitam
  // yang melayang di atas rumput.
  const road = new THREE.Mesh(boxGeo(6, 0.05, 60), mat(palette.floorRoad));
  road.position.set(0, 0.03, 0);
  kit.group.add(road);
  kit.colliders.push(road);
  for (const side of [-1, 1]) {
    box(kit, 1.4, 0.12, 60, 0x9b968b, side * 3.7, 0.06, 0, false);
    // Parit berumput di tepi bahu.
    for (let i = 0; i < 7; i++) {
      const z = -26 + i * 8;
      bush(kit, side * (4.6 + (i % 3) * 0.3), z, 0.55);
    }
  }

  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 6; i++) {
      const z = -22 + i * 9;
      const w = 5 + (i % 3);
      const h = 2.8 + (i % 2) * 0.7;
      const x = side * (8 + (i % 3));
      const face = x - side * (w / 2); // dinding yang menghadap jalan

      box(kit, w, h, 5, i % 2 ? palette.plaster : palette.wall, x, h / 2, z, true);

      // Atap limasan menggantikan lempeng datar; tanpa ini setiap rumah
      // terbaca sebagai kubus kotak polos.
      roofHip(kit, x, z, w, 5, h, 1.7, i % 2 ? 0x8a4a3a : 0x6b4536);

      // Kusen dan daun pintu menghadap jalan.
      box(kit, 0.2, 2.1, 1.2, palette.wood, face - side * 0.04, 1.05, z + 1.3, false);
      box(kit, 0.14, 1.95, 1.0, palette.woodDark, face - side * 0.09, 0.98, z + 1.3, false);

      // Dua jendela menghadap jalan.
      windowPanel(kit, face - side * 0.05, 1.7, z - 1.6, 1.1, 0.9, 'x');
      windowPanel(kit, face - side * 0.05, 1.7, z - 0.1, 1.1, 0.9, 'x');

      // Teras: emper kayu di depan rumah supaya pintu tidak menempel di tanah.
      box(kit, 1.6, 0.12, 1.6, palette.woodDark, face - side * 0.8, 0.06, z + 1.3, false);
    }

    // Tiang listrik dan kabel yang melengkung di antaranya.
    const poles: number[] = [];
    for (let i = 0; i < 8; i++) {
      const z = -26 + i * 7;
      cylinder(kit, 0.08, 0.1, 3.4, palette.woodDark, side * 3.6, 1.7, z, true);
      box(kit, 0.5, 0.12, 0.2, palette.metal, side * 3.2, 3.3, z, false);
      poles.push(z);
    }
    for (let i = 0; i < poles.length - 1; i++) {
      powerLine(kit, side * 3.2 - 0.18, 3.34, poles[i], poles[i + 1]);
      powerLine(kit, side * 3.2 + 0.18, 3.34, poles[i], poles[i + 1]);
    }
  }

  // --- Gerbang desa di kedua ujung jalan ---
  gateArch(kit, 0, 22, 0, 7);
  gateArch(kit, 0, -22, 0, 7);

  // --- Pos jaga & papan pengumuman ---
  hutSmall(kit, -5.6, 9.5, 2.6, 2.6, 2.4, Math.PI / 2, 0x7a7264);
  lampPost(kit, -3.95, 7.6, 3.4, 0xffd9a0, 0.55);
  signBoard(kit, 4.4, 9.0, -Math.PI / 2, palette.wood, 1.7, 1.1);

  // --- Kerucun cahaya lampu pos yang jatuh ke aspal ---
  const lampHead = new THREE.Mesh(
    boxGeo(0.34, 0.14, 0.22),
    mat(palette.lamp, { emissive: palette.lamp })
  );
  lampHead.position.set(-3.0, 3.24, -5);
  kit.group.add(lampHead);
  box(kit, 0.5, 0.1, 0.2, palette.metal, -3.3, 3.3, -5, false);
  const beam = new THREE.Mesh(
    coneGeo(1.5, 3.1, 14, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffe6b0,
      transparent: true,
      opacity: 0.13,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  beam.position.set(-3.0, 1.6, -5);
  kit.group.add(beam);
  const beamLight = new THREE.PointLight(0xffe6b0, 0.8, 9);
  beamLight.position.set(-3.0, 3.0, -5);
  kit.group.add(beamLight);

  // --- Teras rumah: barang harian yang ditinggal di depan pintu ---
  box(kit, 0.45, 0.06, 0.6, palette.woodDark, 5.25, 1.0, 5.0, false);
  radioBox(kit, 5.1, 1.03, 5.0, -Math.PI / 2);
  shoesPair(kit, 5.1, 5.5, 0.4);
  bucket(kit, 5.1, 6.3);
  const broomHandle = new THREE.Mesh(cylGeo(0.03, 0.03, 1.5, 6), mat(palette.wood));
  broomHandle.position.set(5.2, 0.78, 4.2);
  broomHandle.rotation.z = 0.22;
  kit.group.add(broomHandle);
  const broomHead = new THREE.Mesh(coneGeo(0.16, 0.4, 7), mat(0x8a7f66));
  broomHead.position.set(5.37, 0.19, 4.2);
  kit.group.add(broomHead);
  bottle(kit, -3.4, 0, 1.5);
  woodPile(kit, -5.6, 4.0, 2);

  // --- Pohon tumbang: tunggul berserat dan batang yang rebah ke parit ---
  const stump = new THREE.Mesh(cylGeo(0.34, 0.42, 1.5, 7), mat(palette.woodDark));
  stump.position.set(6.9, 0.75, -17.5);
  kit.group.add(stump);
  for (let i = 0; i < 5; i++) {
    const splinter = new THREE.Mesh(coneGeo(0.1, 0.5, 4), mat(palette.wood));
    splinter.position.set(6.9 + Math.cos(i * 1.3) * 0.2, 1.7, -17.5 + Math.sin(i * 1.3) * 0.2);
    kit.group.add(splinter);
  }
  const fallen = new THREE.Mesh(cylGeo(0.28, 0.34, 5.5, 7), mat(palette.woodDark));
  fallen.rotation.z = Math.PI / 2;
  fallen.rotation.y = 0.4;
  fallen.position.set(8.2, 0.3, -14.5);
  kit.group.add(fallen);

  // --- Jejak kaki basah di sepanjang bahu jalan ---
  footprints(kit, -2.4, 6.5, Math.PI, 10);

  // --- Warga & sosok ---
  figure(kit, -5.0, 18.5, { rotY: -0.6, shirt: 0x6b7a52 });
  figure(kit, -5.7, 18.0, { rotY: -0.2, shirt: 0x7a5a4a, hat: true });
  figure(kit, -4.6, 19.1, { rotY: -1.0, shirt: 0x55606b });
  figure(kit, 4.6, -3.0, { rotY: 2.4, shirt: 0x7a4038 });
  figure(kit, 5.2, -3.7, { rotY: 2.0, shirt: 0x4a5b6b });
  figure(kit, 1.2, -20, { rotY: Math.PI, shadow: true });

  scatterTrees(kit, 8, 24, 0.7, 13);

  const A = (id: string, x: number, y: number, z: number): void => anchor(kit, id, x, y, z);
  A('gerbang_desa', 0, 1.4, 21.5);
  A('gerbang_pulang', 0, 1.4, -21.5);
  A('pos_patroli', -3.8, 1.3, 9.5);
  A('papan_pengumuman', 4.0, 1.3, 9.0);
  A('kerucut_cahaya', -2.8, 1.6, -5);
  A('pohon_patah', 6.2, 1.3, -17.5);
  A('ember', 5.1, 0.9, 6.3);
  A('sapu_abu', 5.2, 1.0, 4.2);
  A('sepatu_teras', 5.1, 0.9, 5.5);
  A('radio_warung', 5.1, 1.3, 5.0);
  A('botol_air', -3.4, 0.9, 1.5);
  A('jejak_kaki', -2.4, 0.9, 4.2);
  A('semak_parit', -4.9, 0.9, 3.2);
  A('warga_berkumpul', -4.3, 1.3, 18.3);
  A('warga_dua', 4.0, 1.3, -3.0);
  A('sosok_raka', 0.4, 1.3, -20);
  A('jalan_ke_hutan', 0.8, 1.1, -19);
  A('jalan_pulang', -0.8, 1.1, 19);
}

function buildLadang(kit: Kit): void {
  floor(kit, 70, 70, palette.floorGrass);
  groundDisc(kit, 150, 0x4b5a3a, -0.16);
  distantBackdrop(kit, { radius: 125, houses: 5, trees: 18, hills: 8, color: 0x3a4232 });

  for (let i = -6; i <= 6; i++) {
    const row = new THREE.Mesh(boxGeo(1.1, 0.45, 44), mat(palette.leafDark));
    row.position.set(i * 2.2, 0.22, -4);
    kit.group.add(row);
  }

  // Jejak pijakan yang terinjak-injak di antara barisan tanaman.
  const trail: Array<[number, number]> = [[0, 6], [5, -1], [10, -8], [15, -13]];
  for (let i = 0; i < trail.length - 1; i++) {
    const [x0, z0] = trail[i];
    const [x1, z1] = trail[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const seg = new THREE.Mesh(boxGeo(1.6, 0.05, len + 1), mat(0x55504a));
    seg.position.set((x0 + x1) / 2, 0.03, (z0 + z1) / 2);
    seg.rotation.y = Math.atan2(x1 - x0, z1 - z0);
    kit.group.add(seg);
  }

  // --- Pondok Joy di ujung petak ---
  box(kit, 4.5, 2.6, 4, palette.wallDark, 16, 1.3, -16, true);
  roofHip(kit, 16, -16, 4.5, 4, 2.6, 1.5, 0x6b4536);
  box(kit, 1.0, 1.9, 0.15, palette.wood, 16, 0.95, -14.0, true);
  cylinder(kit, 0.05, 0.05, 0.1, palette.metal, 16.35, 1.0, -13.92, false);
  windowPanel(kit, 14.4, 1.6, -13.96, 0.9, 0.7, 'z');
  cylinder(kit, 0.5, 0.6, 1.2, 0x6a655c, 12, 0.6, -14, true);
  phoneDevice(kit, 14.5, 0.0, -12.5, 0.8);

  // --- Lahan: jagung, orang-orangan sawah, dan tumpukan jerami ---
  scarecrow(kit, 5.0, -6.0, 0.4);
  scarecrow(kit, -8.5, -13.0, -0.7);
  haystack(kit, -7.5, 6.5, 1.5);
  haystack(kit, 9.5, 4.5, 1.2);
  basket(kit, 3.4, 7.4, 0.4);
  basket(kit, 3.9, 7.8, 0.34, 0x8a7f66);
  sack(kit, -6.0, 4.6, 0.44);
  markerPost(kit, 4.6, 0.8);
  markerPost(kit, 11.5, -8.6);

  // --- Sisa unggun yang masih mengepul: asap naik memudar ke langit ---
  firePit(kit, -9.5, -11, 0.9);
  for (let i = 0; i < 6; i++) {
    const puff = new THREE.Mesh(
      sphereGeo(0.5 + i * 0.28, 7, 6),
      mat(0x6a6a70, { transparent: true, opacity: 0.16 - i * 0.02 })
    );
    puff.position.set(-9.5 + i * 0.4, 1.2 + i * 1.1, -11 - i * 0.3);
    kit.group.add(puff);
  }

  footprints(kit, 7.0, 3.0, 2.6, 9);
  woodPile(kit, 13.5, -13.0, 3);
  bucket(kit, 17.6, -14.2);
  scatterTrees(kit, 10, 30, 1.9, 22);

  const A = (id: string, x: number, y: number, z: number): void => anchor(kit, id, x, y, z);
  A('pondok_joy', 16, 1.3, -13.4);
  A('ponsel', 14.5, 0.9, -12.5);
  A('jalur_asap', -9.5, 1.5, -11);
  A('bekas_diri', 7.0, 0.9, 3.5);
  A('bekas_jalur', 7.5, 1.0, -1.5);
  A('jalan_pulang', 0, 1.1, 14);
}

function buildBalai(kit: Kit): void {
  roomShell(kit, 16, 11, 3.6, { floorColor: palette.floorStone, doorZ: true });
  benchRow(kit, -1.0, 4, 3.2);
  benchRow(kit, 2.4, 4, 3.2);

  // Mimbar + papan tulis: pusat perhatian ruang rapat.
  box(kit, 3.2, 0.9, 1.0, palette.woodDark, 0, 0.45, -4.4, true);
  box(kit, 3.3, 0.06, 1.1, palette.wood, 0, 0.93, -4.4, false);
  box(kit, 0.34, 0.03, 0.24, palette.paper, 0.5, 0.98, -4.4, false);   // laporan
  box(kit, 0.3, 0.03, 0.2, palette.paper, -0.4, 0.98, -4.35, false);
  chair(kit, 0, -3.6, Math.PI);
  box(kit, 6.5, 2.4, 0.12, 0x2f3d33, -6.5, 1.9, -5.4, false);
  poster(kit, -6.5, 1.9, -5.3, 6.0, 2.0, 0x3b4a3f, 0);
  poster(kit, 6.5, 2.0, -5.4, 2.2, 1.5, palette.paper, 0);

  // Spanduk rapat melintang di atas papan tulis.
  banner(kit, -2.5, 3.0, -5.2, 7.5, 0, palette.fabricRed);

  // Papan "daftar pencarian" di dinding kanan dekat pintu.
  wallBoard(kit, 7.85, 1.8, 2.6, 2.0, 1.5, -Math.PI / 2, 0x2f3d33);
  for (let i = 0; i < 4; i++) {
    poster(kit, 7.7, 2.35 - (i % 2) * 0.5, 2.0 + Math.floor(i / 2) * 0.7, 0.4, 0.5, palette.paper, -Math.PI / 2);
  }

  // Meja tamu undangan + buku tamu di dekat pintu.
  table(kit, -5.6, 4.2, 1.4, 0.7, 0.78, palette.wood);
  chair(kit, -5.6, 3.4, Math.PI);
  box(kit, 0.3, 0.02, 0.22, palette.paper, -5.6, 0.83, 4.2, false);
  cupStack(kit, -5.1, 0.82, 4.3, 3);

  // --- Penghuni rapat ---
  for (const [fx, fz] of [[-1.6, -1.0], [1.6, -1.0], [4.8, -1.0], [-4.8, 2.4], [-1.6, 2.4]] as Array<[number, number]>) {
    figure(kit, fx, fz, { seated: true, shirt: 0x6b7a52 });
  }
  figure(kit, -2.5, -3.0, { rotY: Math.PI / 4, shirt: 0x7a4038 });    // Ibu Joy
  figure(kit, 3.0, 4.0, { rotY: -2.6, shirt: 0x4a5b6b, hat: true });   // teman lama
  figure(kit, -0.9, -3.6, { rotY: Math.PI, shirt: 0x55606b });

  lampAt(kit, 0, 3.2, 0, 0xe9edff, 1.2, 13);
  lampAt(kit, -4, 3.2, 2, 0xe9edff, 0.8, 10);
  lampAt(kit, 4, 3.2, 2, 0xe9edff, 0.8, 10);
  ceilingFan(kit, -4, 3.6, -2.5);
  ceilingFan(kit, 4, 3.6, -2.5);

  const A = (id: string, x: number, y: number, z: number): void => anchor(kit, id, x, y, z);
  A('pintu_balai', 0, 1.3, 5.3);
  A('daftar_pencarian', 7.5, 1.7, 2.6);
  A('laporan_kehilangan', 0.5, 1.25, -4.4);
  A('ibu_joy', -1.8, 1.3, -3.0);
  A('teman_lama', 3.8, 1.3, 4.0);
  A('kumpul_warga', 3.2, 1.2, -1.0);
  A('dimas_singgah', 0, 1.1, 4.2);
}

function buildTepiHutan(kit: Kit): void {
  floor(kit, 60, 60, palette.floorGrass);
  groundDisc(kit, 150, 0x4b5a3a, -0.16);
  distantBackdrop(kit, { radius: 120, houses: 5, trees: 24, hills: 8, color: 0x2c3d24 });

  const path = new THREE.Mesh(boxGeo(5, 0.05, 40), mat(palette.floorDirt));
  path.position.set(0, 0.03, -6);
  kit.group.add(path);
  kit.colliders.push(path);

  for (let i = 0; i < 26; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (4.5 + ((i * 7) % 12));
    const z = -26 + ((i * 11) % 52);
    tree(kit, x, z, 4 + ((i * 3) % 15) / 10);
  }

  // --- Papan petunjuk arah di mulut jalur ---
  cylinder(kit, 0.07, 0.09, 2.3, palette.woodDark, 1.7, 1.15, 8.0, true);
  const arrows: Array<[number, number, number]> = [
    [1.95, 0.45, -0.35],
    [1.5, 0.1, 0.3],
    [1.9, -0.25, -0.15]
  ];
  arrows.forEach(([, ay, rot], i) => {
    const board = new THREE.Mesh(boxGeo(1.1, 0.24, 0.06), mat(i % 2 ? palette.wood : 0x8a6a4a));
    board.position.set(1.7 + Math.cos(rot) * 0.5, 1.9 + ay, 8.0 + Math.sin(rot) * 0.5);
    board.rotation.y = rot;
    kit.group.add(board);
    const tip = new THREE.Mesh(coneGeo(0.16, 0.3, 4), mat(i % 2 ? palette.wood : 0x8a6a4a));
    tip.rotation.z = -Math.PI / 2;
    tip.rotation.y = rot;
    tip.position.set(1.7 + Math.cos(rot) * 1.1, 1.9 + ay, 8.0 + Math.sin(rot) * 1.1);
    kit.group.add(tip);
  });
  box(kit, 0.28, 0.34, 0.03, palette.paper, 1.62, 1.35, 7.86, false);   // catatan tertempel

  // --- Rumah Rudi dan halamannya di kejauhan ---
  hutSmall(kit, -9.5, -17, 5.5, 4.5, 3.0, 0.5, palette.plaster, 0x6b4536);
  box(kit, 2.2, 0.1, 2.2, palette.woodDark, -7.6, 0.05, -14.6, false);
  figure(kit, -7.0, -13.6, { rotY: 0.9, shirt: 0x4a5b6b });            // Rudi

  // --- Pos patroli di kejauhan: satu lampu yang menyala sendirian ---
  lampPost(kit, 15.5, -18, 4.2, 0xdfe7ff, 0.9);
  figure(kit, 14.6, -17.4, { rotY: -2.2, shirt: 0x3a4a4a, hat: true });

  // --- Sisa-sisa di sepanjang jalur ---
  // Ranting patah.
  const branch = new THREE.Mesh(cylGeo(0.06, 0.09, 1.6, 6), mat(palette.woodDark));
  branch.rotation.z = Math.PI / 2 - 0.2;
  branch.rotation.y = 0.6;
  branch.position.set(2.7, 0.1, -4.2);
  kit.group.add(branch);
  for (const [bx, bz] of [[2.2, -4.6], [3.2, -3.8]]) {
    const twig = new THREE.Mesh(cylGeo(0.03, 0.04, 0.7, 5), mat(palette.woodDark));
    twig.rotation.z = Math.PI / 2;
    twig.rotation.y = bx > 0 ? 1.2 : -0.8;
    twig.position.set(bx, 0.08, bz);
    kit.group.add(twig);
  }

  // Sisa makanan: mangkuk berisi remah dan bungkus.
  cylinder(kit, 0.15, 0.12, 0.08, palette.paper, -2.4, 0.09, -8.0, false);
  for (let i = 0; i < 6; i++) {
    const crumb = new THREE.Mesh(boxGeo(0.05, 0.03, 0.05), mat(0xc9b48a));
    crumb.position.set(-2.4 + Math.cos(i * 2.1) * 0.32, 0.07, -8.0 + Math.sin(i * 2.1) * 0.32);
    kit.group.add(crumb);
  }
  box(kit, 0.2, 0.02, 0.14, 0x7a9a5a, -2.0, 0.07, -8.4, false);

  // Kalung bulan sabit yang tertinggal di tanah.
  const chain = new THREE.Mesh(torusGeo(0.14, 0.015, 5, 14), mat(palette.metal));
  chain.rotation.x = Math.PI / 2;
  chain.position.set(1.6, 0.07, -11);
  kit.group.add(chain);
  const pendant = new THREE.Mesh(torusGeo(0.06, 0.02, 5, 10, Math.PI * 1.4), mat(0xd8c46a));
  pendant.rotation.x = Math.PI / 2;
  pendant.position.set(1.6, 0.07, -10.82);
  kit.group.add(pendant);

  // Foto Joy dan catatan Rudi yang tergeletak di jalur.
  box(kit, 0.26, 0.02, 0.34, palette.paper, -1.8, 0.08, -13, false);
  box(kit, 0.2, 0.04, 0.16, 0x1f1f22, -1.78, 0.1, -13.02, false);
  box(kit, 0.24, 0.02, 0.3, palette.paper, 1.62, 1.5, 7.9, false);

  // Jejak kaki: dua jalur yang berbeda waktu.
  footprints(kit, -1.6, 6.0, Math.PI, 8);
  footprints(kit, 1.4, -6.0, 0, 10, 0x1c1a18);

  // Tanah malam yang menghitam dan genangan embun.
  const darkSoil = new THREE.Mesh(new THREE.CircleGeometry(3.4, 18), mat(0x2a2a26));
  darkSoil.rotation.x = -Math.PI / 2;
  darkSoil.position.set(-2.2, 0.06, -16);
  kit.group.add(darkSoil);
  for (let i = 0; i < 7; i++) {
    const mist = new THREE.Mesh(
      sphereGeo(0.9 + i * 0.2, 7, 6),
      mat(0xa8b6c0, { transparent: true, opacity: 0.1 - i * 0.011 })
    );
    mist.position.set(Math.cos(i * 1.9) * 3.5, 0.7 + (i % 3) * 0.4, -17 + Math.sin(i * 1.9) * 4);
    kit.group.add(mist);
  }

  // Sosok yang berdiri diam di ujung jalur.
  figure(kit, -3.0, -19.5, { rotY: 0.3, shadow: true });

  // Tempat berlindung dan unggun sisa.
  bush(kit, -5.2, 3.4, 1.35);
  bush(kit, 5.8, -2.5, 1.1);
  bush(kit, -6.5, -8.5, 1.2);
  firePit(kit, 6.5, 6.0, 0.85);
  bucket(kit, -4.6, 7.2);
  markerPost(kit, -1.9, 1.5);
  markerPost(kit, 1.9, -20);

  const A = (id: string, x: number, y: number, z: number): void => anchor(kit, id, x, y, z);
  A('papan_petunjuk', 1.0, 1.3, 8.0);
  A('catatan_rudi', 1.62, 1.6, 7.9);
  A('rumah_rudi', -6.5, 1.5, -14.5);
  A('rudi', -6.2, 1.3, -13.2);
  A('patroli_jauh', 14.0, 1.4, -16.5);
  A('ranting_patah', 2.7, 0.9, -4.2);
  A('sisa_makanan', -2.4, 0.9, -8.0);
  A('kalung_bulan_sabit', 1.6, 0.9, -11);
  A('foto_joy', -1.8, 0.9, -13);
  A('tanah_malam', -2.2, 1.0, -16);
  A('napas_berembun', 2.2, 1.3, -18);
  A('bayangan', -2.2, 1.3, -19.5);
  A('jejak_kaki', -1.6, 0.9, 3.6);
  A('jejak_semalam', 1.4, 0.9, -4.5);
  A('semak_berlindung', -4.4, 1.0, 3.4);
  A('jalan_pulang', 0, 1.1, 12);
  A('pulang', -2.0, 1.1, 9.5);
  A('keputusan_pulang', 2.0, 1.1, 5.5);
  A('cari_dimas', -2.0, 1.1, 2.5);
  A('ujung_lari', 0, 1.1, -24);
}

function buildHutanBerputar(kit: Kit): void {
  floor(kit, 70, 70, palette.leafDark);
  groundDisc(kit, 150, 0x2c3d24, -0.16);
  distantBackdrop(kit, { radius: 130, trees: 30, hills: 8, color: 0x1f2b1a });

  // Cincin pohon konsentris. Dua cincin terluar sengaja membuka celah ke
  // arah +z supaya pemain punya satu arah yang jelas untuk keluar.
  for (let ring = 0; ring < 5; ring++) {
    const radius = 3.5 + ring * 3.4;
    const count = 7 + ring * 3;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + ring * 0.6;
      const gap = Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2));
      if (ring >= 3 && Math.abs(gap) < 0.35) continue;
      tree(kit, Math.cos(a) * radius, Math.sin(a) * radius, 4.5 + ring * 0.4);
    }
  }

  // --- Pusat: tunggul kompas ---
  cylinder(kit, 1.4, 1.6, 0.6, 0x3a3128, 0, 0.3, 0, true);
  cylinder(kit, 0.42, 0.46, 0.16, palette.woodDark, 0, 0.68, 0, false);
  const dial = new THREE.Mesh(cylGeo(0.3, 0.3, 0.05, 12), mat(palette.paper));
  dial.position.set(0, 0.78, 0);
  kit.group.add(dial);
  const needle = new THREE.Mesh(boxGeo(0.04, 0.03, 0.4), mat(0xc23a3a));
  needle.position.set(0, 0.82, 0);
  needle.rotation.y = 0.7;
  kit.group.add(needle);

  // --- Pohon sama: pohon besar berpita yang muncul berulang kali ---
  cylinder(kit, 0.34, 0.46, 6.5, palette.woodDark, 0, 3.25, -7, true);
  const crownA = new THREE.Mesh(coneGeo(2.6, 4.4, 7), mat(palette.leafDark));
  crownA.position.set(0, 8.0, -7);
  kit.group.add(crownA);
  const crownB = new THREE.Mesh(coneGeo(1.8, 3.0, 7), mat(palette.leaf));
  crownB.position.set(0, 10.0, -7);
  kit.group.add(crownB);
  ribbon(kit, 0.36, 1.7, -7, 0xc23a3a);
  ribbon(kit, -0.36, 2.2, -7, 0xc23a3a);

  // --- Api ilusi: lidah api yang menjalar tanpa panas ---
  const illusion = flameMat();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const flame = new THREE.Mesh(
      coneGeo(0.35, 1.2 + (i % 3) * 0.4, 5),
      illusion
    );
    flame.position.set(7 + Math.cos(a) * 1.4, 0.7, -5 + Math.sin(a) * 1.4);
    kit.group.add(flame);
  }
  const flameLight = new THREE.PointLight(0xff7a2f, 1.1, 12);
  flameLight.position.set(7, 1.6, -5);
  kit.group.add(flameLight);

  // Jejak kaki di lorong bercelah cincin luar: mulai setelah pohon cincin
  // dalam supaya tidak menembus batang, lurus ke pos patok dan glow keluar.
  // Warna lumut terang supaya terbaca di bawah cahaya bulan.
  footprints(kit, 0, 10.6, 0, 8, 0x4c5438);

  // --- Celah jalan keluar: cahaya pucat di ujung lorong pohon ---
  markerPost(kit, -1.6, 14);
  markerPost(kit, 1.6, 14);
  const exitGlow = new THREE.Mesh(
    boxGeo(3.2, 3.4, 0.2),
    mat(0xdfe7ff, { emissive: 0x7f8fbf, transparent: true, opacity: 0.5 })
  );
  exitGlow.position.set(0, 1.7, 19);
  kit.group.add(exitGlow);
  const exitLight = new THREE.PointLight(0xcfe0ff, 0.9, 16);
  exitLight.position.set(0, 2.2, 16);
  kit.group.add(exitLight);

  // --- Sosok & sisa ---
  figure(kit, -5, -9, { rotY: 0.7, shadow: true });
  figure(kit, 6.5, 9, { rotY: -2.4, shadow: true, scale: 0.95 });
  bush(kit, -8, 4, 1.1);
  bush(kit, 9, -1, 1.0);
  firePit(kit, -7, -6, 0.8);

  const light = new THREE.PointLight(0x88a0ff, 0.7, 16);
  light.position.set(0, 4, 0);
  kit.group.add(light);

  const A = (id: string, x: number, y: number, z: number): void => anchor(kit, id, x, y, z);
  A('kompas_jalan', 0.4, 1.0, 0.4);
  A('pohon_sama', 1.3, 1.5, -7);
  A('api_ilusi', 6.2, 1.3, -5);
  A('keluar_kebun', 0, 1.3, 15);
  A('sosok_joy', -4.2, 1.3, -9);
  A('bisikan_pertama', 0, 1.3, 4.5);
}

function buildHutanApi(kit: Kit): void {
  floor(kit, 70, 70, 0x3a3026);
  groundDisc(kit, 150, 0x241d16, -0.16);
  distantBackdrop(kit, { radius: 125, trees: 18, hills: 7, houses: 0, color: 0x2a2018 });

  // Pohon gosong: batang hitam tanpa daun, bertumpuk di sekitar cincin api.
  for (let i = 0; i < 26; i++) {
    const a = i * 1.37;
    const r = 5 + ((i * 17) % 20);
    const h = 3.5 + ((i * 13) % 25) / 10;
    cylinder(kit, 0.13, 0.22, h, 0x1e1712, Math.cos(a) * r, h / 2, Math.sin(a) * r, true);
    if (i % 3 === 0) {
      const limb = new THREE.Mesh(cylGeo(0.07, 0.1, 1.6, 5), mat(0x1e1712));
      limb.rotation.z = 1.0;
      limb.position.set(Math.cos(a) * r, h * 0.7, Math.sin(a) * r);
      kit.group.add(limb);
    }
  }

  // --- Cincin api yang mengelilingi reruntuhan ---
  fireRing(kit, 0, 0, 7);

  // Jejak abu dari titik muncul pemain menuju gugusan barang di utara -
  // tanpanya rimba gelap seragam dan arah "ke mana dulu" hilang. Warna abu
  // pucat sengaja lebih terang dari tanah gosong supaya terbaca di cahaya api.
  footprints(kit, 0, 0.6, Math.PI, 10, 0x7a6f60);

  // Percikan dan bara di antara abu.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const r = 5 + (i % 4) * 2.5;
    const glow = new THREE.Mesh(
      sphereGeo(0.35, 6, 5),
      mat(palette.ember, { emissive: palette.ember })
    );
    glow.position.set(Math.cos(a) * r, 0.3, Math.sin(a) * r);
    kit.group.add(glow);
    const light = new THREE.PointLight(palette.ember, 1.0, 9);
    light.position.set(Math.cos(a) * r, 1.0, Math.sin(a) * r);
    kit.group.add(light);
  }

  // --- Batu api dan sisa yang tertinggal ---
  for (let i = 0; i < 8; i++) {
    const a = i * 0.9;
    const stone = new THREE.Mesh(sphereGeo(0.4 + (i % 3) * 0.14, 6, 5), mat(0x4a423a));
    stone.position.set(Math.cos(a) * (2.4 + (i % 3)), 0.2, Math.sin(a) * (2.4 + (i % 3)));
    kit.group.add(stone);
  }
  // Catatan Raka yang diselipkan di sela batu.
  box(kit, 0.5, 0.34, 0.4, 0x4a423a, -3.1, 0.34, -2.4, true);
  box(kit, 0.26, 0.02, 0.32, palette.paper, -3.1, 0.53, -2.4, false);
  // Ponsel Raka yang masih menyala redup.
  phoneDevice(kit, 2.6, 0.05, -3.8, 0.9);
  const screenGlow = new THREE.PointLight(0x8fb6d6, 0.35, 3.5);
  screenGlow.position.set(2.6, 0.5, -3.8);
  kit.group.add(screenGlow);

  // --- Sosok yang menunggu di tepi cincin ---
  figure(kit, -5.2, -7.4, { rotY: 0.6, shadow: true });
  figure(kit, 4.6, 6.8, { rotY: -2.5, shadow: true });

  ashPile(kit, -6.5, 3.5);
  ashPile(kit, 5.5, -6.0);

  const A = (id: string, x: number, y: number, z: number): void => anchor(kit, id, x, y, z);
  A('cincin_api', 0, 1.5, 6.6);
  A('catatan_raka', -3.1, 1.0, -2.4);
  A('ponsel_raka', 2.6, 0.9, -3.8);
  A('bayangan_joy', -4.4, 1.3, -7.4);
  A('suara_dimas', 0, 1.3, 2.5);
  A('pilihan_akhir', 0, 1.3, -5.5);
}

/** Gugusan abu dan tulang kayu yang tersisa setelah api padam. */
function ashPile(kit: Kit, x: number, z: number): void {
  const mound = new THREE.Mesh(sphereGeo(0.9, 8, 6), mat(0x35302b));
  mound.scale.y = 0.45;
  mound.position.set(x, 0.1, z);
  kit.group.add(mound);
  for (let i = 0; i < 4; i++) {
    const log = new THREE.Mesh(cylGeo(0.07, 0.07, 0.9, 5), mat(0x1e1712));
    log.rotation.z = Math.PI / 2 - 0.3;
    log.rotation.y = i * 0.9;
    log.position.set(x + Math.cos(i) * 0.3, 0.28, z + Math.sin(i) * 0.3);
    kit.group.add(log);
  }
}

function buildPasar(kit: Kit): void {
  floor(kit, 40, 40, palette.floorDirt);
  groundDisc(kit, 150, 0x55504a, -0.16);
  distantBackdrop(kit, { radius: 110, houses: 8, trees: 14, hills: 7, color: 0x35402f });

  for (let i = 0; i < 6; i++) {
    const x = -10 + (i % 3) * 8;
    const z = -6 + Math.floor(i / 3) * 9;
    box(kit, 3.6, 0.9, 2.2, palette.wood, x, 0.45, z, true);
    // Kain peneduh berbentuk limasan, bukan lempeng datar.
    roofHip(kit, x, z, 4.2, 2.8, 2.4, 0.7, i % 2 ? palette.fabricRed : palette.fabric);
    for (const dx of [-1.8, 1.8]) {
      box(kit, 0.1, 2.4, 0.1, palette.woodDark, x + dx, 1.2, z - 1.2, true);
      box(kit, 0.1, 2.4, 0.1, palette.woodDark, x + dx, 1.2, z + 1.2, true);
    }
    box(kit, 1.0, 0.5, 0.8, palette.paper, x - 0.8, 1.15, z, false);
    box(kit, 0.8, 0.4, 0.7, palette.leaf, x + 0.7, 1.1, z, false);
    basket(kit, x - 1.3, z + 0.7, 0.34);
    basket(kit, x + 1.3, z - 0.7, 0.3, 0x8a7f66);
    figure(kit, x, z - 1.6, { rotY: 0, shirt: i % 2 ? 0x7a4038 : 0x4a5b6b });
    hangingLamp(kit, x, 2.5, z, 0xffdca8, 0.5, 0.35);
  }

  // Lorong pasar: petak dagang dan barang yang ditumpuk di pinggir.
  crate(kit, -15, 12, 0.7);
  crate(kit, -14.2, 12.4, 0.6, palette.woodDark);
  sack(kit, 14, -12, 0.45);
  sack(kit, 13.4, -11.6, 0.4, 0x8a7f66);
  bucket(kit, 15, 11);
  motorbike(kit, -15, -13, 0.7);
  signBoard(kit, 0, 15, Math.PI, palette.wood, 2.4, 1.0);
  for (const bx of [-4.5, 4.5]) {
    cylinder(kit, 0.1, 0.12, 3.6, palette.woodDark, bx, 1.8, 13.5, true);
  }
  banner(kit, 0, 3.1, 13.5, 9, 0, palette.fabricRed);
  lampPost(kit, -16, 4, 4);
  lampPost(kit, 16, -4, 4);
  scatterTrees(kit, 6, 18, 3.2, 17);

  // --- Lorong & pinggir pasar --------------------------------------------
  // Lorong dari gerbang ke lapak dibumbui barang dan orang supaya tidak terasa
  // kosong saat pemain berjalan sendirian.
  bicycle(kit, -15.4, -10.6, 1.2);
  bucket(kit, -14.4, -11.4);
  crate(kit, -15.6, 10.4, 0.6, palette.woodDark);
  crate(kit, -15.0, 11.0, 0.5);
  basket(kit, 15.4, 10.4, 0.5, 0x8a7f66);
  sack(kit, 15.0, -11.4, 0.42);
  bottle(kit, 14.2, 0.28, 9.6);
  bottle(kit, -13.6, 0.28, 8.2, 0xc7d9e4);

  // Kandang ayam di sudut: rangka, jeruji, dan atap seng.
  for (const dx of [-0.55, 0.55]) {
    for (const dz of [-0.55, 0.55]) {
      cylinder(kit, 0.05, 0.05, 0.9, palette.woodDark, 14.6 + dx, 0.45, -13.8 + dz, true);
    }
  }
  box(kit, 1.3, 0.08, 1.3, 0x8a6a4a, 14.6, 0.1, -13.8, false);
  box(kit, 1.3, 0.08, 1.3, 0x8a6a4a, 14.6, 0.9, -13.8, false);
  for (let i = 0; i < 5; i++) {
    box(kit, 0.04, 0.7, 0.04, palette.metal, 14.05, 0.5, -14.35 + i * 0.28, false);
    box(kit, 0.04, 0.7, 0.04, palette.metal, 15.15, 0.5, -14.35 + i * 0.28, false);
  }
  box(kit, 1.5, 0.06, 1.5, 0x6d5f52, 14.6, 1.1, -13.8, false);

  // Pengunjung yang lalu-lalang.
  figure(kit, -6.5, 11.5, { rotY: 0.6, shirt: 0x7a4038 });
  figure(kit, 7.2, 12.4, { rotY: -0.9, shirt: 0x4a5b6b });
  figure(kit, -12.5, -6.0, { rotY: 2.1, shirt: 0x6d5f52 });

  // Jejak kaki di tanah lorong dari gerbang masuk.
  footprints(kit, 0, 10.5, Math.PI, 7, 0x241f1a);

  // Gerbang bendera melintasi lorong: tiang di kiri-kanan jalur dan tali
  // dengan bendera kecil supaya pemain berjalan melewatinya saat masuk.
  for (const px of [-3.4, 3.4]) {
    cylinder(kit, 0.09, 0.12, 3.7, palette.woodDark, px, 1.85, 7, true);
  }
  box(kit, 6.8, 0.03, 0.03, 0x4a4038, 0, 3.6, 7, false);
  for (let i = 0; i < 7; i++) {
    const color = i % 3 === 0 ? 0xc23a3a : i % 3 === 1 ? 0xd8b23a : 0x4a7a5a;
    box(kit, 0.3, 0.36, 0.02, color, -2.85 + i * 0.95, 3.4, 7, false);
  }

  // Barang, kendaraan, dan orang di lorong gerbang.
  crate(kit, -6.2, 7.4, 0.65, palette.woodDark);
  crate(kit, -6.6, 8.0, 0.55);
  crate(kit, 6.4, 7.2, 0.6, palette.woodDark);
  sack(kit, 6.0, 7.9, 0.42, 0x9c8b63);
  motorbike(kit, 8.6, 5.4, 1.1);
  chair(kit, -7.6, 9.4, 0.4);
  table(kit, -8.4, 8.6, 1.2, 0.7, 0.72);
  bucket(kit, -8.9, 9.6);
  basket(kit, 5.6, 9.4, 0.44, 0x8a7f66);
  bottle(kit, -4.4, 0.28, 6.4, 0xc7d9e4);
  bottle(kit, 4.2, 0.28, 8.6);

  figure(kit, -3.4, 5.6, { rotY: 2.7, shirt: 0x6d5f52 });
  figure(kit, 3.6, 4.2, { rotY: -2.2, shirt: 0x7a4038 });

  // Titik penanda interaktif: sengaja ditaruh tepat di atas benda aslinya
  // (penjual, lapak, keranjang, gerbang pasar) supaya penanda tidak melayang
  // di ruang kosong.
  const A = (id: string, x: number, y: number, z: number): void => anchor(kit, id, x, y, z);
  A('pedagang', 6, 1.5, 1.4);
  A('jalan_pasar', 0, 1.5, 12.5);
  A('lapak_sayur', -2, 1.3, 4.4);
  A('keranjang', -3.3, 1.3, 3.7);
  A('spanduk_pasar', 0, 2.2, 13.5);
}

function buildProyek(kit: Kit): void {
  floor(kit, 40, 40, palette.floorDirt);
  groundDisc(kit, 150, 0x55504a, -0.16);
  distantBackdrop(kit, { radius: 115, houses: 5, trees: 14, hills: 7, color: 0x39412f });

  // Tiga dinding berdiri: belakang, barat, dan timur. Bangunan dibiarkan
  // tanpa atap dan muka selatan hanya setinggi dada supaya terbaca sebagai
  // proyek yang sedang berjalan, sekaligus memberi tembokan nyata yang
  // menggantikan kerangka lama yang dulu bisa ditembus pemain dari mana
  // pun. Pagar & setapak di bawah menata satu-satunya jalan masuk.
  box(kit, 12, 3.0, 0.4, palette.plaster, 0, 1.5, -8, true);
  box(kit, 0.4, 3.0, 8, palette.plaster, -6, 1.5, -4, true);
  box(kit, 0.4, 3.0, 8, palette.plaster, 6, 1.5, -4, true);
  // Dinding yang belum diplester: bata terlihat di bagian bawah.
  box(kit, 11.6, 1.2, 0.1, 0x8a4a3a, 0, 0.6, -7.75, false);
  box(kit, 0.1, 1.2, 7.6, 0x8a4a3a, -5.75, 0.6, -4, false);
  box(kit, 0.1, 1.2, 7.6, 0x8a4a3a, 5.75, 0.6, -4, false);
  // Muka selatan setinggi dada: dua segmen bata dengan gerbang kerja
  // (x 1..4) yang menyambung halaman ke tumpukan semen di dalam gedung.
  box(kit, 7, 2.0, 0.4, 0x8a4a3a, -2.5, 1.0, -2, true);
  box(kit, 2, 2.0, 0.4, 0x8a4a3a, 5, 1.0, -2, true);

  // Perancah menyatu dengan dinding belakang, bukan berdiri di tengah
  // halaman. Dua deret tiang di dalam garis bangunan, palang atas di atas
  // tinggi dinding, dan papan pijakan dua tingkat hanya menutupi zona
  // kerja: halaman selatan kini terbuka sebagai jalur yang jelas.
  for (let i = 0; i < 5; i++) {
    const px = -5 + i * 2.5;
    box(kit, 0.15, 4.2, 0.15, palette.metal, px, 2.1, -6.4, true);
    box(kit, 0.15, 4.2, 0.15, palette.metal, px, 2.1, -7.6, true);
  }
  box(kit, 12, 0.15, 0.4, palette.metal, 0, 4.05, -6.4, false);
  box(kit, 12, 0.15, 0.4, palette.metal, 0, 4.05, -7.6, false);
  for (const y of [1.4, 2.8]) {
    box(kit, 12, 0.08, 0.1, palette.metal, 0, y, -6.4, false);
    box(kit, 12, 0.08, 0.1, palette.metal, 0, y, -7.6, false);
    box(kit, 0.1, 0.08, 1.5, palette.metal, -5, y, -7, false);
    box(kit, 0.1, 0.08, 1.5, palette.metal, 5, y, -7, false);
  }
  box(kit, 11, 0.1, 1.5, 0x8a6a4a, 0, 2.85, -7, false);   // papan pijakan
  box(kit, 11, 0.1, 1.5, 0x8a6a4a, 0, 1.45, -7, false);

  // Material: peti semen, karung, dan ember.
  for (let i = 0; i < 8; i++) {
    crate(kit, -4 + (i % 4) * 0.9, -3 + Math.floor(i / 4) * 0.9, 0.6, 0x8a6a4a);
  }
  for (let i = 0; i < 5; i++) {
    sack(kit, 6.6 + (i % 2) * 0.5, -2 + i * 0.5, 0.42, 0x9c8b63);
  }
  cylinder(kit, 1.6, 1.9, 1.2, 0x9c8b63, 7, 0.6, 4, true);
  bucket(kit, -5.4, 7.6);
  bucket(kit, -4.9, 7.9, palette.woodDark);
  woodPile(kit, 8, -6, 3);

  // Papan peringatan & spanduk proyek: spanduk kini melengkapi pagar zona
  // kerja menghadap halaman, bukan tersembunyi di dalam gedung.
  signBoard(kit, 4.5, 10, Math.PI, 0xc9a227, 1.8, 0.9);
  for (const bx of [-7.8, -1.2]) {
    cylinder(kit, 0.1, 0.12, 3.2, palette.metal, bx, 1.6, 1.05, true);
  }
  banner(kit, -4.5, 2.55, 1.1, 6.4, 0, 0xc9a227);

  figure(kit, 7.9, 1.3, { rotY: -1.9, shirt: 0xc9a227, hat: true });
  figure(kit, -3.4, 6.0, { rotY: 0.8, shirt: 0x4a5b6b, hat: true });
  figure(kit, -1.3, -5.6, { rotY: 2.8, shirt: 0x6d5f52 });

  lampAt(kit, 0, 3.4, -4.6, 0xffe6b0, 0.8, 12);
  lampPost(kit, 3.6, 6.5, 4.2);
  lampPost(kit, -14, 12, 4.5);
  scatterTrees(kit, 5, 18, 5.1, 16);

  // --- Area kerja dekat spawn (1.2, 11) ---------------------------------
  // Depan lokasi tadinya kosong dan gelap; isi dengan bahan, alat, dan batas
  // proyek supaya pemain langsung merasa berdiri di tengah bangunan.
  hutSmall(kit, -11, 9.5, 3.4, 3, 2.4, Math.PI / 2, 0x55453a, 0x6b4536); // pos jaga
  lampAt(kit, -11, 2.5, 8.1, 0xffd9a0, 0.75, 11);
  lampPost(kit, 13, 12, 4.5);
  ashPile(kit, -7.6, 11.4);

  // Gundukan pasir dan ember bekas adukan.
  cylinder(kit, 0.12, 2.1, 1.5, 0x9c8b63, -8.4, 0.75, 6.6, true);
  bucket(kit, -7.2, 7.6);
  bucket(kit, -6.8, 8.0, 0x8a6a4a);

  // Tumpukan bata yang disusun sedikit miring.
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 6; c++) {
      box(kit, 0.42, 0.19, 0.2, 0x8a4a3a, -7.4 + (r % 2) * 0.16 + c * 0.46, 0.1 + r * 0.19, 9.4, false);
    }
  }

  // Bundel besi bertulang di atas tumpuan kayu.
  for (let i = 0; i < 6; i++) {
    box(kit, 0.06, 0.06, 5.2, 0x6d5f52, 9.2 + (i % 3) * 0.14, 0.3 + Math.floor(i / 3) * 0.12, 5.4, false);
  }
  for (const pz of [3.4, 7.4]) {
    box(kit, 0.9, 0.2, 0.4, palette.woodDark, 9.5, 0.1, pz, false);
  }

  // Material yang belum terpakai ditutup terpal biru.
  box(kit, 3.0, 1.4, 2.4, 0x4a5b6b, -9.8, 0.7, 2.4, true);
  box(kit, 3.2, 0.1, 2.6, 0x3d4a57, -9.8, 1.45, 2.4, false);

  // Tangga kayu bersandar di perancah, terlihat dari gerbang kerja.
  for (const dx of [-0.34, 0.34]) {
    box(kit, 0.09, 3.5, 0.09, 0x8a6a4a, 4.2 + dx, 1.75, -5.9, false);
  }
  for (let i = 0; i < 7; i++) {
    box(kit, 0.78, 0.07, 0.07, 0x8a6a4a, 4.2, 0.45 + i * 0.5, -5.9, false);
  }

  // Pagar proyek: patok dan pita merah-putih di sisi kanan.
  for (const pz of [2, 6, 10]) markerPost(kit, 13, pz, 1.0, palette.woodDark);
  for (let i = 0; i < 2; i++) {
    box(kit, 0.03, 0.1, 4, 0xc23a3a, 13, 1.0, 4 + i * 4, false);
    box(kit, 0.03, 0.1, 4, 0xd8d3c8, 13, 0.8, 4 + i * 4, false);
  }

  // Jejak kaki menuju bangunan: jejak yang tidak diakui siapa pun.
  footprints(kit, 1.2, 10.4, Math.PI, 9, 0x241f1a);
  footprints(kit, -5.2, 3.0, Math.PI * 1.15, 6, 0x241f1a);

  // --- Jalur & pagar zona kerja -------------------------------------------
  // Pagar kayu memisahkan halaman selatan (bebas dilalui) dari gedung di
  // utara. Gerbangnya sengaja lebar dan lurus dengan setapak papan dari
  // titik turun bus: pemain punya jalan sungguhan ke pintu kerja, bukan
  // kerangka yang ditembus. Ujung timur pagar dibiarkan terbuka menuju
  // pos mandor.
  box(kit, 7, 1.0, 0.08, 0x74563c, -4.5, 0.5, 1.05, true);
  box(kit, 2, 1.0, 0.08, 0x74563c, 5, 0.5, 1.05, true);
  for (const [fx, fw] of [[-4.5, 7], [5, 2]] as Array<[number, number]>) {
    box(kit, fw, 0.09, 0.02, 0xc23a3a, fx, 0.82, 1.1, false);
    box(kit, fw, 0.09, 0.02, 0xd8d3c8, fx, 0.62, 1.1, false);
  }
  for (const px of [-8, -1, 4, 6]) markerPost(kit, px, 1.05, 1.25);

  // Setapak papan: dari spawn (1.2, 11) lurus ke gerbang, lalu menyerong
  // lewat pintu kerja menuju tumpukan semen dan kaki perancah.
  for (let i = 0; i < 8; i++) {
    box(kit, 1.1, 0.06, 1.0, 0x8a6a4a, 1.2, 0.03, 10.2 - i * 1.15, false);
  }
  for (const wz of [0.2, -0.9, -2, -3.1, -4.2]) {
    box(kit, 1.1, 0.06, 1.0, 0x8a6a4a, 2.5, 0.03, wz, false);
  }
  // Anak cabang setapak ke arah mandor di ujung timur pagar.
  for (let i = 0; i < 5; i++) {
    box(kit, 1.0, 0.06, 0.9, 0x8a6a4a, 3 + i * 1.05, 0.03, 1.65, false);
  }
  box(kit, 1.0, 0.06, 0.9, 0x8a6a4a, 7.2, 0.03, 0.6, false);

  // Puing di jalur masuk: bata copot, kerikil, dan puing ringan. Setapak
  // papan (|x - 1.2| < 0.9) dan garis pagar (z < 1.5) dibiarkan bersih.
  for (let i = 0; i < 16; i++) {
    const rx = -5 + ((i * 37) % 11);
    const rz = 1 + ((i * 53) % 10);
    if (Math.abs(rx - 1.2) < 0.9 || rz < 1.5) continue;
    box(kit, 0.26 + (i % 3) * 0.14, 0.13, 0.24, i % 4 === 0 ? 0x8a4a3a : 0x6f6a61, rx, 0.07, rz, false);
  }

  // Sak semen menumpuk di kiri jalur.
  sack(kit, -2.2, 6.5, 0.42, 0x9c8b63);
  sack(kit, -2.7, 6.9, 0.4, 0x9c8b63);
  sack(kit, -2.4, 6.2, 0.36, 0x8a7f66);

  // Papan bersandar di tiang perancah.
  for (let i = 0; i < 4; i++) {
    box(kit, 0.9, 3.0, 0.08, i % 2 ? 0x8a6a4a : 0x74563c, 5.6 + i * 0.16, 1.5, 8.6 + i * 0.1, false);
  }

  // Genangan air bekas hujan di tanah proyek.
  box(kit, 2.4, 0.03, 1.6, 0x2b3238, -3.2, 0.03, 10.2, false);
  box(kit, 1.5, 0.03, 1.1, 0x2b3238, 4.6, 0.03, 9.4, false);

  // Pekerja tambahan & sampah bekas kerja supaya lokasi terasa dipakai.
  figure(kit, -6.4, 9.0, { rotY: 2.4, shirt: 0x6d5f52, hat: true });
  figure(kit, 8.6, 8.6, { rotY: -2.6, shirt: 0x4a5b6b });
  bottle(kit, -12.2, 0.28, 5.4);
  bottle(kit, 11.6, 0.28, 9.4, 0xc7d9e4);
  crate(kit, 12.4, 3.2, 0.55, 0x8a6a4a);

  // Titik penanda interaktif proyek bangunan.
  const A = (id: string, x: number, y: number, z: number): void => anchor(kit, id, x, y, z);
  A('mandor', 7.4, 1.5, 0.9);
  A('jalan_proyek', 4.5, 1.5, 11.5);
  A('tumpukan_semen', -2.6, 1.1, -2.5);
  A('perancah', 1.2, 1.3, -5.4);
  A('spanduk_proyek', -4.5, 2.3, 1.15);
}

function buildTerminal(kit: Kit): void {
  floor(kit, 40, 40, palette.floorRoad);
  groundDisc(kit, 150, 0x4a4741, -0.16);
  distantBackdrop(kit, { radius: 115, houses: 7, trees: 14, hills: 7, color: 0x35402f });

  // Bangunan peron: kanopi, tiang, dan dinding informasi.
  box(kit, 14, 0.2, 6, palette.wallDark, 0, 3.0, -6, false);
  for (let i = 0; i < 5; i++) {
    cylinder(kit, 0.14, 0.16, 3.0, palette.metal, -6 + i * 3, 1.5, -8.6, true);
    cylinder(kit, 0.14, 0.16, 3.0, palette.metal, -6 + i * 3, 1.5, -3.4, true);
  }
  benchRow(kit, -6, 4, 3.4, palette.metal);
  box(kit, 6, 1.4, 0.4, palette.wall, 0, 0.7, 8, true);
  poster(kit, 0, 2.4, 7.9, 4.5, 1.2, palette.paper, 0);
  wallBoard(kit, -4.5, 1.9, 7.75, 4.2, 1.4, Math.PI, 0x1f2a33);
  wallBoard(kit, 4.5, 1.9, 7.75, 4.2, 1.4, Math.PI, 0x1f2a33);

  // Loket tiket: dinding loket, kaca, dan lubang antrean.
  box(kit, 3.2, 1.2, 0.6, palette.woodDark, -12, 0.6, -2, true);
  box(kit, 3.0, 2.4, 0.14, palette.wallDark, -12, 1.2, -2.35, false);
  pane(kit, 2.4, 0.8, 0.1, 0xd6e8f2, -12, 1.6, -2.3, { emissive: 0x2a3d4a });
  box(kit, 0.8, 0.3, 0.12, palette.metal, -12, 1.05, -1.68, false);
  chair(kit, -12.6, -1.3, 0);

  // Dua bus yang tertahan di jalur masuk.
  for (const [bx, bz, brot] of [[-10, 8, 0.2], [10, -8, Math.PI + 0.15]] as Array<[number, number, number]>) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(boxGeo(2.6, 2.4, 9), mat(0x9a9ba0));
    body.position.y = 1.5;
    g.add(body);
    const stripe = new THREE.Mesh(boxGeo(2.66, 0.4, 9.06), mat(0x3a6ea5));
    stripe.position.y = 1.0;
    g.add(stripe);
    for (let i = 0; i < 5; i++) {
      for (const sx of [-1.33, 1.33]) {
        const win = new THREE.Mesh(boxGeo(0.1, 0.8, 1.4), mat(0xd6e8f2, { emissive: 0x2a3d4a }));
        win.position.set(sx, 1.9, -3 + i * 1.5);
        g.add(win);
      }
    }
    for (const sz of [-3, 1, 3]) {
      for (const sx of [-1.2, 1.2]) {
        const wheel = new THREE.Mesh(cylGeo(0.42, 0.42, 0.24, 10), mat(0x17171a));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(sx, 0.42, sz);
        g.add(wheel);
      }
    }
    const door = new THREE.Mesh(boxGeo(0.1, 1.7, 1.0), mat(0x2b2b2f));
    door.position.set(1.34, 1.0, -4.0);
    g.add(door);
    g.position.set(bx, 0, bz);
    g.rotation.y = brot;
    kit.group.add(g);
    addGroupProxy(kit, g, 2.8, 2.7, 9.2);
  }

  figure(kit, -5.1, -6.0, { seated: true, shirt: 0x6b7a52 });
  figure(kit, -1.7, -6.0, { seated: true, shirt: 0x7a5a4a });
  figure(kit, 1.7, -6.0, { seated: true, shirt: 0x4a5b6b });
  figure(kit, -1.5, 4.5, { rotY: 3.0, shirt: 0x55606b });

  bucket(kit, 6.6, -1.6);
  signBoard(kit, 8, 6, -Math.PI / 2, palette.wood, 2.2, 1.0);
  lampPost(kit, -16, 0, 4.5);
  lampPost(kit, 16, 2, 4.5);
  lampAt(kit, 0, 2.85, -6, 0xdfe7ff, 0.7, 12);
}

function buildMimpi(kit: Kit): void {
  // Lantai sengaja diangkat sedikit dari near-hitam supaya preset `mimpi`
  // punya sesuatu untuk menerangi; nuansa ungu dingin tetap dipertahankan.
  floor(kit, 50, 50, 0x23233a);
  groundDisc(kit, 150, 0x12121e, -0.16);

  for (let i = 0; i < 14; i++) {
    const a = i * 0.9;
    const r = 4 + i * 1.4;
    box(kit, 2.5, 0.3, 2.5, i % 2 ? 0x2b2b3d : 0x34344a, Math.cos(a) * r, 1.2 + (i % 4) * 0.8, Math.sin(a) * r, false);
  }

  // Lorong pintu yang berjajar tanpa tembok: setiap ambang mengarah ke ruang
  // yang sama sekali berbeda, ciri khas mimpi yang tidak mau selesai.
  for (let i = 0; i < 7; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    doorPanel(kit, side * (2.4 + (i % 3) * 1.6), -3 - i * 1.6, side > 0 ? -Math.PI / 2 : Math.PI / 2);
  }

  // Bingkai foto yang melayang tanpa dinding.
  for (let i = 0; i < 6; i++) {
    const a = i * 1.1 + 0.4;
    pictureFrame(kit, Math.cos(a) * 7.5, 2.0 + (i % 3) * 0.7, Math.sin(a) * 7.5 - 3, 0.8, 1.0, -a + Math.PI / 2);
  }

  const glow = new THREE.PointLight(0xff5a2a, 1.4, 30);
  glow.position.set(0, 6, -6);
  kit.group.add(glow);

  // Bulan yang terlalu dekat: satu bola cahaya tanpa wajah.
  const moon = new THREE.Mesh(
    sphereGeo(3.2, 16, 12),
    mat(0xffd9a0, { emissive: 0xffb454 })
  );
  moon.position.set(-16, 18, -34);
  kit.group.add(moon);
  const moonLight = new THREE.PointLight(0xbfd0ff, 0.6, 70);
  moonLight.position.copy(moon.position);
  kit.group.add(moonLight);

  box(kit, 3, 5, 0.3, 0x101018, 0, 2.5, -12, true);
  box(kit, 3.4, 5.4, 0.1, 0x34344a, 0, 2.7, -12.2, false);

  // Pintu besar di ujung lorong = tujuan bab mimpi (b14). Anchor menaruh
  // penanda interaksi persis di ambangnya, bebas dari tabrakan geometry.
  anchor(kit, 'gerendel_pintu', 0, 1.05, -11.35);

  for (let i = 0; i < 10; i++) {
    const a = i * 2.3;
    const shard = new THREE.Mesh(
      boxGeo(0.12, 2.4, 0.5),
      mat(i % 2 ? 0x2b2b3d : 0x34344a)
    );
    shard.position.set(Math.cos(a) * (10 + (i % 4) * 2), 1.2, Math.sin(a) * (10 + (i % 4) * 2));
    shard.rotation.y = a;
    kit.group.add(shard);
  }
}

function buildPenjara(kit: Kit): void {
  roomShell(kit, 12, 9, 3.2, { floorColor: palette.floorStone, wallColor: 0x8a8578 });

  // Sel: meja kayu, bangku, dan sekat besi di seberang ruangan.
  table(kit, 0, -1.0, 2.2, 1.0, 0.78, palette.woodDark);
  chair(kit, -1.2, 0.2, 0);
  chair(kit, 1.2, -2.2, Math.PI);
  box(kit, 8, 2.6, 0.1, palette.glass, 0, 1.6, -3.5, false);
  for (let i = 0; i < 11; i++) {
    cylinder(kit, 0.05, 0.05, 2.8, palette.metal, -4 + i * 0.8, 1.4, -3.6, false);
  }
  // Palang jendela: sekat yang mengingatkan ini bukan kamar biasa.
  for (const wx of [-1.44, 1.44]) {
    for (let i = -2; i <= 2; i++) {
      cylinder(kit, 0.04, 0.04, 1.4, palette.metal, wx + i * 0.28, 1.7, -4.35, false);
    }
    box(kit, 1.5, 0.07, 0.07, palette.metal, wx, 1.1, -4.35, false);
    box(kit, 1.5, 0.07, 0.07, palette.metal, wx, 2.3, -4.35, false);
  }

  // Tempat tidur: rangka besi dua tingkat dengan kasur tipis.
  const bunk = new THREE.Group();
  for (const by of [0.45, 1.35]) {
    const slab = new THREE.Mesh(boxGeo(1.0, 0.12, 1.9), mat(0x55504a));
    slab.position.set(0, by, 0);
    bunk.add(slab);
    const mattress = new THREE.Mesh(boxGeo(0.92, 0.1, 1.8), mat(palette.fabric));
    mattress.position.set(0, by + 0.11, 0);
    bunk.add(mattress);
    const pillow = new THREE.Mesh(boxGeo(0.5, 0.1, 0.3), mat(palette.paper));
    pillow.position.set(0, by + 0.2, -0.7);
    bunk.add(pillow);
  }
  for (const sx of [-0.5, 0.5]) {
    for (const sz of [-0.95, 0.95]) {
      const post = new THREE.Mesh(cylGeo(0.05, 0.05, 2.0, 6), mat(palette.metal));
      post.position.set(sx, 1.0, sz);
      bunk.add(post);
    }
  }
  bunk.position.set(-4.4, 0, -2.4);
  bunk.rotation.y = Math.PI / 2;
  kit.group.add(bunk);
  addGroupProxy(kit, bunk, 1.2, 1.8, 2.1);

  // Kamar mandi seadanya: ember dan lubang air di pojok.
  bucket(kit, 4.6, 3.2, 0x4a4a44);
  const drain = new THREE.Mesh(cylGeo(0.3, 0.3, 0.04, 12), mat(0x3a3a3e));
  drain.position.set(4.6, 0.03, 3.2);
  kit.group.add(drain);

  // Goresan di dinding dan kertas yang diselipkan.
  for (let i = 0; i < 7; i++) {
    const scratch = new THREE.Mesh(boxGeo(0.03, 0.4 + (i % 3) * 0.2, 0.02), mat(0x55504a));
    scratch.position.set(-5.6 + i * 0.16, 1.6 + (i % 4) * 0.2, -3.4);
    kit.group.add(scratch);
  }
  poster(kit, 5.7, 1.9, 1.2, 0.5, 0.7, palette.paper, -Math.PI / 2);
  box(kit, 0.26, 0.02, 0.3, palette.paper, 0.6, 0.83, -1.2, false);
  phoneDevice(kit, -0.6, 0.82, -0.9, 0.4);

  // Lampu yang berdenyut di atas meja.
  lampAt(kit, 0, 2.8, -1.0, 0xe8ecf5, 1.1, 10);
  const cage = new THREE.Mesh(
    sphereGeo(0.2, 8, 6),
    mat(0xe8ecf5, { emissive: 0xe8ecf5, transparent: true, opacity: 0.85 })
  );
  cage.position.set(0, 2.8, -1.0);
  kit.group.add(cage);
}

const builders: Record<string, (kit: Kit) => void> = {
  rumah_dimas: buildRumah,
  kedai_kopi: buildKedai,
  bus: buildBus,
  warung_mak_yah: buildWarung,
  gubuk_briefing: buildGubuk,
  hutan_kecil: (kit) => buildForest(kit, 26),
  jalan_desa: buildJalan,
  ladang_joy: buildLadang,
  ladang_joy_pondok: buildLadang,
  balai_desa: buildBalai,
  tepi_hutan: buildTepiHutan,
  hutan_berputar: buildHutanBerputar,
  hutan_api: buildHutanApi,
  pasar: buildPasar,
  proyek: buildProyek,
  terminal: buildTerminal,
  mimpi: buildMimpi,
  penjara: buildPenjara
};

export class SceneFactory {
  build(sceneId: string): BuiltScene {
    // Registri figur scene lama ikut dibuang: figur yang tidak lagi ada di
    // scene baru tak boleh terus dianimasikan oleh updateFigures tiap frame.
    // Tick dinamis (pintu bergerak, awan, burung) dibuang demi alasan sama:
    // mesh scene lama sudah dibongkar.
    resetFigures();
    resetDynamics();
    const kit: Kit = { group: new THREE.Group(), colliders: [], anchors: {}, doors: [] };
    const builder = builders[sceneId];

    if (builder) {
      builder(kit);
    } else {
      floor(kit, 14, 12, palette.floorWood);
      wall(kit, 14, 3, 0.2, 0, -6);
      wall(kit, 14, 3, 0.2, 0, 6);
      wall(kit, 0.2, 3, 12, -7, 0);
      wall(kit, 0.2, 3, 12, 7, 0);
      lampAt(kit, 0, 2.6, 0);
      console.warn(`SceneFactory: unknown scene "${sceneId}", using fallback room`);
    }

    // Prop statis: matriks lokal disusun sekali lalu dibekukan, karena
    // ratusan mesh per scene tidak perlu menyusun ulang matriks sendiri
    // tiap frame (hemat CPU, terasa di perangkat kelas menengah). Grup tetap
    // bebas bergerak; mesh yang sendiri dianimasikan di tempat (kepala/lengan
    // figur, tirai, awan, burung, prop yang diambil) ditandai `animatedLocal`
    // sehingga dilewati. Mesh beku di bawah grup bergerak tetap mengikuti
    // dengan benar: matriks dunia dihitung ulang oleh induk, sementara
    // matriks lokalnya hanya sekali.
    kit.group.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (obj.userData.animatedLocal) return;
      let p: THREE.Object3D | null = obj.parent;
      while (p && p !== kit.group) {
        if (p.userData.animatedLocal) return;
        p = p.parent;
      }
      obj.updateMatrix();
      obj.matrixAutoUpdate = false;
    });

    return {
      group: kit.group,
      colliders: kit.colliders,
      spawn: { pos: [0, 0, 0], yaw: 0 },
      anchors: kit.anchors,
      doors: kit.doors
    };
  }
}

export const sceneFactory = new SceneFactory();
