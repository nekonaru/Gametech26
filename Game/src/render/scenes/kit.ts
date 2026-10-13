/**
 * Bagian "kit" dari scenes.ts — dipecah agar mudah dinavigasi.
 * Konsumen mengimpor semuanya lewat barrel src/render/scenes.ts.
 */
import * as THREE from 'three';
import { getTexture, Pattern } from '../textures.js';
import { applyVertexSnap } from '../snap.js';
// Circular runtime-only: chestOfDrawers mendaftarkan tick animasi laci;
// addDynamicTick hanya dipanggil saat runtime, bukan saat evaluasi modul.
import { addDynamicTick } from './dynamics.js';

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

export interface Kit {
  group: THREE.Group;
  colliders: THREE.Object3D[];
  anchors: Record<string, [number, number, number]>;
  doors: SceneDoor[];
}

export const palette = {
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
export const PATTERN_BY_COLOR = new Map<number, Pattern>([
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
export const materialCache = new Map<string, THREE.MeshLambertMaterial>();

export function mat(color: number, opts: { emissive?: number; transparent?: boolean; opacity?: number } = {}): THREE.MeshLambertMaterial {
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
export function anchor(kit: Kit, id: string, x: number, y: number, z: number): void {
  kit.anchors[id] = [x, y, z];
}

/**
 * BoxGeometry memetakan UV 0..1 di tiap muka, sehingga tekstur akan "melar"
 * mengikuti ukuran objek. Skalakan UV agar pola selalu punya skala dunia yang
 * sama: dinding 10 meter dan pintu 1 meter tetap punya serat dengan ukuran
 * seragam.
 */
export function tileBoxUVs(geo: THREE.BoxGeometry, w: number, h: number, d: number, tile = 2): void {
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

export function tileCylinderUVs(geo: THREE.CylinderGeometry, radius: number, height: number, tile = 2): void {
  const uv = geo.attributes.uv as THREE.BufferAttribute | undefined;
  if (!uv) return;
  const su = (Math.PI * 2 * radius) / tile;
  const sv = height / tile;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
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

export const geometryCache = new Map<string, THREE.BufferGeometry>();

export function cachedGeo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  const hit = geometryCache.get(key);
  if (hit) return hit;
  const geo = make();
  geo.userData.cached = true;
  geometryCache.set(key, geo);
  return geo;
}

export type GeoArgs<T extends abstract new (...args: any) => any> = ConstructorParameters<T>;

export function boxGeo(...args: GeoArgs<typeof THREE.BoxGeometry>): THREE.BoxGeometry {
  return cachedGeo(`b|${args.join(',')}`, () => new THREE.BoxGeometry(...args)) as THREE.BoxGeometry;
}

/** Box dengan UV dunia-tertile yang sudah dipasang sekali di pembuatan. */
export function boxGeoTiled(
  w: number, h: number, d: number, tile = 2
): THREE.BoxGeometry {
  return cachedGeo(`bt|${w},${h},${d},${tile}`, () => {
    const g = new THREE.BoxGeometry(w, h, d);
    tileBoxUVs(g, w, h, d, tile);
    return g;
  }) as THREE.BoxGeometry;
}

export function cylGeo(...args: GeoArgs<typeof THREE.CylinderGeometry>): THREE.CylinderGeometry {
  return cachedGeo(`c|${args.join(',')}`, () => new THREE.CylinderGeometry(...args)) as THREE.CylinderGeometry;
}

/** Silinder dengan UV dunia-tertile (dipakai groundDisc). */
export function cylGeoTiled(
  rTop: number, rBottom: number, h: number, seg: number, uvR: number, uvH: number, uvTile: number
): THREE.CylinderGeometry {
  return cachedGeo(`ct|${rTop},${rBottom},${h},${seg},${uvR},${uvH},${uvTile}`, () => {
    const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg);
    tileCylinderUVs(g, uvR, uvH, uvTile);
    return g;
  }) as THREE.CylinderGeometry;
}

export function coneGeo(...args: GeoArgs<typeof THREE.ConeGeometry>): THREE.ConeGeometry {
  return cachedGeo(`k|${args.join(',')}`, () => new THREE.ConeGeometry(...args)) as THREE.ConeGeometry;
}

export function sphereGeo(...args: GeoArgs<typeof THREE.SphereGeometry>): THREE.SphereGeometry {
  return cachedGeo(`s|${args.join(',')}`, () => new THREE.SphereGeometry(...args)) as THREE.SphereGeometry;
}

export function torusGeo(...args: GeoArgs<typeof THREE.TorusGeometry>): THREE.TorusGeometry {
  return cachedGeo(`r|${args.join(',')}`, () => new THREE.TorusGeometry(...args)) as THREE.TorusGeometry;
}

export function box(
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

export function cylinder(
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

export function floor(kit: Kit, w: number, d: number, color: number, y = 0): void {
  const geo = boxGeoTiled(w, 0.2, d, 2.5);
  const mesh = new THREE.Mesh(geo, mat(color));
  mesh.position.set(0, y - 0.1, 0);
  kit.group.add(mesh);
  kit.colliders.push(mesh);
}

export function wall(kit: Kit, w: number, h: number, d: number, x: number, z: number, color = palette.wall): THREE.Mesh {
  return box(kit, w, h, d, color, x, h / 2, z, true);
}

export function ceiling(kit: Kit, w: number, d: number, y: number, color: number): void {
  const geo = boxGeoTiled(w, 0.15, d, 2.5);
  const mesh = new THREE.Mesh(geo, mat(color));
  mesh.position.set(0, y, 0);
  kit.group.add(mesh);
}

export function lampAt(kit: Kit, x: number, y: number, z: number, color = palette.lamp, intensity = 0.9, distance = 9): void {
  const shade = new THREE.Mesh(coneGeo(0.25, 0.3, 6), mat(color, { emissive: color }));
  shade.position.set(x, y, z);
  kit.group.add(shade);
  const light = new THREE.PointLight(color, intensity, distance);
  light.position.set(x, y - 0.2, z);
  kit.group.add(light);
}

export function tree(kit: Kit, x: number, z: number, h = 4, trunkColor = palette.woodDark): void {
  cylinder(kit, 0.14, 0.2, h, trunkColor, x, h / 2, z, true);
  const crown = new THREE.Mesh(coneGeo(1.1, 2.4, 6), mat(palette.leaf));
  crown.position.set(x, h + 0.6, z);
  kit.group.add(crown);
  const crown2 = new THREE.Mesh(coneGeo(0.8, 1.8, 6), mat(palette.leafDark));
  crown2.position.set(x, h + 1.6, z);
  kit.group.add(crown2);
}

export function scatterTrees(kit: Kit, count: number, radius: number, seedOffset = 0, minRadius = 4): void {
  if (count <= 0) return;

  // Pohon taburan seragam jenisnya (batang + dua mahkota, tanpa rotasi), jadi
  // dipadatkan menjadi tiga InstancedMesh — ~39 pohon x 3 mesh menjadi 3 draw
  // call pada hutan. Tinggi bervariasi per pohon lewat skala matriks; UV
  // three.js relatif per segmen sehingga tekstur tampil sama persis.
  //
  // Collider tidak bisa memakai InstancedMesh: Box3.setFromObject menghasilkan
  // satu box gabungan semua instance. Setiap batang tetap diberi balok tak
  // terlihat (0,4 x h x 0,4 = bbox silinder lama, persis seperti pola proxy
  // di tempat lain) supaya tabrakan, occlusion, dan interaksi tak berubah.
  const trunkMesh = new THREE.InstancedMesh(cylGeo(0.14, 0.2, 1, 6), mat(palette.woodDark), count);
  const crownMesh = new THREE.InstancedMesh(coneGeo(1.1, 2.4, 6), mat(palette.leaf), count);
  const crown2Mesh = new THREE.InstancedMesh(coneGeo(0.8, 1.8, 6), mat(palette.leafDark), count);
  const M = new THREE.Matrix4();
  const V = new THREE.Vector3();
  const S = new THREE.Vector3();
  const Q = new THREE.Quaternion(); // identitas: pohon taburan tidak berputar

  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 * 3.7 + seedOffset;
    const r = minRadius + ((i * 137.5 + seedOffset * 31) % (radius - minRadius));
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = 3.4 + ((i * 53) % 20) / 10;

    V.set(x, h / 2, z);
    S.set(1, h, 1);
    M.compose(V, Q, S);
    trunkMesh.setMatrixAt(i, M);
    V.set(x, h + 0.6, z);
    S.set(1, 1, 1);
    M.compose(V, Q, S);
    crownMesh.setMatrixAt(i, M);
    V.set(x, h + 1.6, z);
    M.compose(V, Q, S);
    crown2Mesh.setMatrixAt(i, M);

    const proxy = new THREE.Mesh(
      boxGeo(0.4, h, 0.4),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    proxy.position.set(x, h / 2, z);
    kit.group.add(proxy);
    kit.colliders.push(proxy);
  }

  for (const m of [trunkMesh, crownMesh, crown2Mesh]) {
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    kit.group.add(m);
  }
}

export function table(kit: Kit, x: number, z: number, w = 1.4, d = 0.8, h = 0.78, color = palette.wood): void {
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

export function chair(kit: Kit, x: number, z: number, facing = 0): void {
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

export function shelf(kit: Kit, x: number, z: number, w = 1.6, h = 1.9): void {
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

export function poster(kit: Kit, x: number, y: number, z: number, w: number, h: number, color: number, rotY = 0): void {
  const mesh = new THREE.Mesh(boxGeo(w, h, 0.03), mat(color));
  mesh.position.set(x, y, z);
  mesh.rotation.y = rotY;
  kit.group.add(mesh);
}

export function benchRow(kit: Kit, z: number, count: number, spacing: number, color = palette.wood): void {
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * spacing;
    box(kit, 1.6, 0.09, 0.45, color, x, 0.45, z, true);
    box(kit, 1.6, 0.5, 0.07, color, x, 0.7, z - 0.2, false);
    box(kit, 0.1, 0.45, 0.4, palette.woodDark, x - 0.7, 0.22, z, false);
    box(kit, 0.1, 0.45, 0.4, palette.woodDark, x + 0.7, 0.22, z, false);
  }
}

export function crate(kit: Kit, x: number, z: number, size = 0.7, color = palette.wood): void {
  box(kit, size, size, size, color, x, size / 2, z, true);
  // Tiga pita papan gelap melingkupi badan: peti terbaca sebagai kayu
  // berplank, bukan kubus satu warna.
  for (const fy of [0.28, 0.5, 0.72]) {
    box(kit, size + 0.015, size * 0.05, size + 0.015, 0x3a2c22, x, size * fy, z, false);
  }
}

export function bed(kit: Kit, x: number, z: number, blanket = palette.fabricRed): void {
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

export function rug(kit: Kit, x: number, z: number, w: number, d: number, color = palette.fabricRed): void {
  box(kit, w, 0.03, d, color, x, 0.02, z, false);
  // Bingkai karpet: empat jalur tepi gelap memberi pola pada bidang datar,
  // sekaligus mengingatkan tepi karpet saat pemain menoleh ke bawah.
  box(kit, w, 0.012, 0.1, palette.woodDark, x, 0.04, z - d / 2 + 0.07, false);
  box(kit, w, 0.012, 0.1, palette.woodDark, x, 0.04, z + d / 2 - 0.07, false);
  box(kit, 0.1, 0.012, d - 0.2, palette.woodDark, x - w / 2 + 0.07, 0.04, z, false);
  box(kit, 0.1, 0.012, d - 0.2, palette.woodDark, x + w / 2 - 0.07, 0.04, z, false);
}

export function sofa(kit: Kit, x: number, z: number, facing = 0, color = palette.fabric): void {
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
export function addGroupProxy(kit: Kit, g: THREE.Group, w: number, h: number, d: number): void {
  const proxy = new THREE.Mesh(
    boxGeo(w, h, d),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  proxy.position.set(0, h / 2, 0);
  g.add(proxy);
  kit.colliders.push(proxy);
}

export function wardrobe(kit: Kit, x: number, z: number, facing = 0, w = 1.3, h = 2.0): void {
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

export function fridge(kit: Kit, x: number, z: number, facing = 0): void {
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

export function stove(kit: Kit, x: number, z: number, facing = 0): void {
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

export function kitchenCounter(kit: Kit, x: number, z: number, w = 2.4, facing = 0): void {
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

export function tvSet(kit: Kit, x: number, z: number, facing = 0): void {
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

export function radioBox(kit: Kit, x: number, y: number, z: number, facing = 0): void {
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

export function calendarSheet(kit: Kit, x: number, y: number, z: number, rotY = 0): void {
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

export function mirrorPanel(kit: Kit, x: number, y: number, z: number, w: number, h: number, rotY = 0): void {
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

export function pictureFrame(kit: Kit, x: number, y: number, z: number, w: number, h: number, rotY = 0): void {
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

export function wallClock(kit: Kit, x: number, y: number, z: number, rotY = 0): void {
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
export function envelope(kit: Kit, x: number, y: number, z: number, rotY = 0): void {
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
export function wallet(kit: Kit, x: number, y: number, z: number, rotY = 0): void {
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
export function plate(kit: Kit, x: number, y: number, z: number): void {
  const base = new THREE.Mesh(cylGeo(0.11, 0.09, 0.025, 10), mat(palette.paper));
  base.position.set(x, y, z);
  kit.group.add(base);
  const rim = new THREE.Mesh(torusGeo(0.1, 0.014, 4, 12), mat(palette.paper));
  rim.rotation.x = Math.PI / 2;
  rim.position.set(x, y + 0.014, z);
  kit.group.add(rim);
}

/** Gelas: tabung berkaca, cincin bibir, telinga di samping, teh di dalam. */
export function cup(kit: Kit, x: number, y: number, z: number): void {
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
export function screwdriver(kit: Kit, x: number, y: number, z: number, rotY = 0): void {
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
export function fuseBox(kit: Kit, x: number, y: number, z: number, facing = 0): void {
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

export function hangingLamp(kit: Kit, x: number, ceilY: number, z: number, color = palette.lamp, intensity = 1.0, drop = 0.6): void {
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

export function ceilingFan(kit: Kit, x: number, ceilY: number, z: number): void {
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
export function signBoard(kit: Kit, x: number, z: number, rotY = 0, boardColor = palette.wood, w = 1.6, h = 0.7): void {
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
export function banner(kit: Kit, x: number, y: number, z: number, w: number, rotY = 0, color = palette.fabricRed): void {
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
export function sachetStrip(kit: Kit, x: number, y: number, z: number, count = 6, rotY = 0): void {
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

export function motorbike(kit: Kit, x: number, z: number, rotY = 0): void {
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

export function bicycle(kit: Kit, x: number, z: number, rotY = 0): void {
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

export function scarecrow(kit: Kit, x: number, z: number, rotY = 0): void {
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

export function haystack(kit: Kit, x: number, z: number, size = 1.4): void {
  const hay = new THREE.Mesh(coneGeo(size, size * 1.2, 8), mat(0xb59a5e));
  hay.position.set(x, size * 0.6, z);
  kit.group.add(hay);
  const proxy = new THREE.Mesh(cylGeo(size * 0.7, size * 0.7, size, 6), new THREE.MeshBasicMaterial({ visible: false }));
  proxy.position.set(x, size * 0.5, z);
  kit.group.add(proxy);
  kit.colliders.push(proxy);
}

export function basket(kit: Kit, x: number, z: number, size = 0.34, color = 0x9a7b4a): void {
  const body = new THREE.Mesh(cylGeo(size, size * 0.75, size * 1.1, 8), mat(color));
  body.position.set(x, size * 0.55, z);
  kit.group.add(body);
  const rim = new THREE.Mesh(torusGeo(size, 0.03, 5, 10), mat(palette.woodDark));
  rim.rotation.x = Math.PI / 2;
  rim.position.set(x, size * 1.1, z);
  kit.group.add(rim);
}

export function sack(kit: Kit, x: number, z: number, size = 0.4, color = palette.paper): void {
  const body = new THREE.Mesh(cylGeo(size * 0.7, size, size * 1.4, 7), mat(color));
  body.position.set(x, size * 0.7, z);
  kit.group.add(body);
  const neck = new THREE.Mesh(cylGeo(size * 0.3, size * 0.5, size * 0.3, 7), mat(color));
  neck.position.set(x, size * 1.5, z);
  kit.group.add(neck);
}

export function woodPile(kit: Kit, x: number, z: number, rows = 3): void {
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < 4 - (r % 2); i++) {
      const log = new THREE.Mesh(cylGeo(0.11, 0.11, 1.2, 6), mat(palette.woodDark));
      log.rotation.z = Math.PI / 2;
      log.position.set(x, 0.12 + r * 0.22, z + (i - 1.5) * 0.24);
      kit.group.add(log);
    }
  }
}

export function bucket(kit: Kit, x: number, z: number, color = palette.metal): void {
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
export function doorPanel(kit: Kit, x: number, z: number, rotY = 0, trim = palette.woodDark): void {
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

export let drawerSlide: THREE.Group | null = null;
export let drawerSenter: THREE.Group | null = null;
/** 0 = tertutup, 1 = terbuka; nilai animasi berjalan di antaranya. */
export let drawerT = 0;
export let drawerTarget = 0;
export let drawerSenterVisible = true;
export let drawerLastTick = 0;

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
 * Lepas referensi grup laci scene lama. Grup dari scene yang sudah dibongkar
 * tidak boleh tersisa sebagai target animasi; state `let` ini dimiliki modul
 * ini sehingga reset-nya harus lewat fungsi (assignment `let` lintas modul
 * dilarang ES modules).
 */
export function resetDrawerState(): void {
  drawerSlide = null;
  drawerSenter = null;
}

/**
 * Laci: badan BERONGGA, dua daun statis, dan satu daun yang meluncur keluar.
 * Slot laci tengah dibiarkan kosong: saat daun meluncur yang terlihat adalah
 * gelapnya rongga (sisi, sekat, dan belakang), bukan balak kayu utuh yang
 * menolak dibuka. Daun laci tengah membawa bak berisi senter.
 */
export function chestOfDrawers(kit: Kit, x: number, z: number, rotY = 0): void {
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
export function phoneDevice(kit: Kit, x: number, y: number, z: number, rotY = 0): void {
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

export function shoesPair(kit: Kit, x: number, z: number, rotY = 0): void {
  for (const sx of [-0.12, 0.12]) {
    const shoe = new THREE.Mesh(boxGeo(0.12, 0.09, 0.3), mat(0x2f2f33));
    shoe.position.set(x + sx, 0.05, z);
    shoe.rotation.y = rotY;
    kit.group.add(shoe);
  }
}

/** Percikan api: inti menyala + cincin kayu bakar. */
export function firePit(kit: Kit, x: number, z: number, size = 1.0): void {
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

