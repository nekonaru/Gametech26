/**
 * Bagian "props" dari scenes.ts — dipecah agar mudah dinavigasi.
 * Konsumen mengimpor semuanya lewat barrel src/render/scenes.ts.
 */
import * as THREE from 'three';
import { getSoftDotTexture, getFlameGradientTexture } from '../textures.js';
import { SceneDoor, Kit, palette, mat, boxGeo, cylGeo, cylGeoTiled, coneGeo, sphereGeo, torusGeo, box, cylinder, floor, wall, ceiling, addGroupProxy } from './kit.js';
import { addDynamicTick } from './dynamics.js';

/** Mobil sedan: badan, kabin, kaca, grill, lampu, dan empat roda. */
export function car(kit: Kit, x: number, z: number, rotY = 0, color = 0x4a5b6b): void {
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
export function bush(kit: Kit, x: number, z: number, r = 0.5, color = palette.leafDark): void {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const rr = r * (0.7 + (i % 2) * 0.32);
    const s = new THREE.Mesh(sphereGeo(rr, 6, 5), mat(i % 2 ? color : palette.leaf));
    s.position.set(x + Math.cos(a) * r * 0.4, rr * 0.66, z + Math.sin(a) * r * 0.4);
    kit.group.add(s);
  }
}

/** Botol air minum: badan, leher, dan tutup. */
export function bottle(kit: Kit, x: number, y: number, z: number, color = 0x8fb6d6): void {
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
export function footprints(kit: Kit, x: number, z: number, rotY: number, count = 6, color = 0x2a2620): void {
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
export function wallBoard(
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
export function coffeeMachine(kit: Kit, x: number, y: number, z: number, rotY = 0): void {
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
export function cupStack(kit: Kit, x: number, y: number, z: number, count = 4): void {
  for (let i = 0; i < count; i++) {
    const cup = new THREE.Mesh(cylGeo(0.05, 0.038, 0.09, 8), mat(palette.paper));
    cup.position.set(x, y + 0.045 + i * 0.05, z);
    kit.group.add(cup);
  }
}

/** Stoples kue: kaca bening, isian, dan tutup kayu. */
export function jar(kit: Kit, x: number, y: number, z: number, color = 0xc9b48a): void {
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
export function ribbon(kit: Kit, x: number, y: number, z: number, color = 0xc23a3a): void {
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
export function lampPost(kit: Kit, x: number, z: number, h = 4, color = 0xffd9a0, intensity = 0.7): void {
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
export function gateArch(kit: Kit, x: number, z: number, rotY = 0, w = 6): void {
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
export function hutSmall(
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
export function flameMat(): THREE.MeshLambertMaterial {
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
export function fireRing(kit: Kit, x: number, z: number, radius = 6): void {
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
export function markerPost(kit: Kit, x: number, z: number, h = 1.1, color = palette.woodDark): void {
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
export function pane(
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
export function groundDisc(kit: Kit, radius: number, color: number, y = -0.06): void {
  const geo = cylGeoTiled(radius, radius, 0.1, 48, radius, 0.1, 4);
  const mesh = new THREE.Mesh(geo, mat(color));
  mesh.position.set(0, y, 0);
  kit.group.add(mesh);
  kit.colliders.push(mesh);
}

export interface BackdropOptions {
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
export function distantBackdrop(kit: Kit, opts: BackdropOptions = {}): void {
  const radius = opts.radius ?? 140;
  const seed = opts.seed ?? 7;
  const color = opts.color ?? 0x35402f;
  const rnd = (n: number): number => ((Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;

  // Backdrop adalah penghasil mesh terbesar per adegan luar (hingga ~92 mesh)
  // namun seluruh isinya geometri + material berbagi, tanpa collider. Semua
  // dipadatkan jadi InstancedMesh per jenis: satu draw call menggantikan
  // puluhan mesh, dengan matriks per instance meniru transformasi lama persis
  // (UV three.js relatif per segmen sehingga tekstur tampil sama).
  const M = new THREE.Matrix4();
  const V = new THREE.Vector3();
  const S = new THREE.Vector3();
  const Q = new THREE.Quaternion();
  const E = new THREE.Euler();
  const compose = (
    mesh: THREE.InstancedMesh, i: number,
    px: number, py: number, pz: number, rotY: number,
    sx: number, sy: number, sz: number
  ): void => {
    E.set(0, rotY, 0);
    Q.setFromEuler(E);
    V.set(px, py, pz);
    S.set(sx, sy, sz);
    M.compose(V, Q, S);
    mesh.setMatrixAt(i, M);
  };
  const finish = (mesh: THREE.InstancedMesh): void => {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    kit.group.add(mesh);
  };

  const hills = opts.hills ?? 8;
  if (hills > 0) {
    const hillMesh = new THREE.InstancedMesh(coneGeo(1, 1, 5), mat(color), hills);
    for (let i = 0; i < hills; i++) {
      const a = (i / hills) * Math.PI * 2 + rnd(i) * 0.5;
      const r = radius + rnd(i + 40) * 60;
      const w = 40 + rnd(i + 80) * 55;
      const h = 10 + rnd(i + 120) * 18;
      compose(
        hillMesh, i,
        Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r, rnd(i + 160) * Math.PI,
        w, h, w * 0.7
      );
    }
    finish(hillMesh);
  }

  const trees = opts.trees ?? 22;
  if (trees > 0) {
    const trunkMesh = new THREE.InstancedMesh(cylGeo(0.5, 0.7, 1, 5), mat(palette.woodDark), trees);
    const crownMesh = new THREE.InstancedMesh(coneGeo(1, 1, 6), mat(color), trees);
    const underMesh = new THREE.InstancedMesh(coneGeo(1, 1, 6), mat(0x2b3426), trees);
    for (let i = 0; i < trees; i++) {
      const a = (i / trees) * Math.PI * 2 + rnd(i + 7) * 0.4;
      const r = radius * 0.75 + rnd(i + 55) * 30;
      const h = 16 + rnd(i + 95) * 14;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const crownR = 3.4 + rnd(i + 130) * 2;
      const underR = 2.1 + rnd(i + 130) * 1.3;
      compose(trunkMesh, i, x, h * 0.25, z, 0, 1, h * 0.5, 1);
      compose(crownMesh, i, x, h * 0.75, z, 0, crownR, h, crownR);
      compose(underMesh, i, x, h * 0.52, z, 0, underR, h * 0.5, underR);
    }
    finish(trunkMesh);
    finish(crownMesh);
    finish(underMesh);
  }

  const houses = opts.houses ?? 6;
  if (houses > 0) {
    // Dua kemungkinan warna dinding: pisah instance per material agar
    // materialCache tetap dipakai bersama persis seperti versi lama.
    const plaster: number[] = [];
    const wallIdx: number[] = [];
    const placements: Array<{ x: number; z: number; a: number; w: number; h: number; d: number }> = [];
    for (let i = 0; i < houses; i++) {
      const a = (i / houses) * Math.PI * 2 + 0.7 + rnd(i + 3) * 0.5;
      const r = radius * 0.62 + rnd(i + 23) * 25;
      const w = 7 + rnd(i + 33) * 5;
      const h = 4 + rnd(i + 43) * 2.5;
      const d = 6 + rnd(i + 53) * 4;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      placements.push({ x, z, a, w, h, d });
      if (rnd(i + 63) > 0.5) plaster.push(i);
      else wallIdx.push(i);
    }

    for (const [indices, wallColor] of [[plaster, palette.plaster], [wallIdx, palette.wall]] as const) {
      if (!indices.length) continue;
      const bodyMesh = new THREE.InstancedMesh(boxGeo(1, 1, 1), mat(wallColor), indices.length);
      indices.forEach((src, n) => {
        const p = placements[src];
        compose(bodyMesh, n, p.x, p.h / 2, p.z, -p.a, p.w, p.h, p.d);
      });
      finish(bodyMesh);
    }

    const roofMesh = new THREE.InstancedMesh(
      coneGeo(Math.SQRT1_2, 1, 4, 1, false, Math.PI / 4), mat(0x6b4536), houses
    );
    const glowMesh = new THREE.InstancedMesh(
      boxGeo(1.2, 0.9, 0.1),
      mat(0xffe6b0, { emissive: 0xffc46a }),
      houses
    );
    placements.forEach((p, i) => {
      compose(roofMesh, i, p.x, p.h + 1.1, p.z, -p.a, p.w + 1.4, 2.2, p.d + 1.4);
      // Jendela menyala menghadap pusat: cahaya desa di kejauhan.
      const fx = p.x - Math.cos(p.a) * (p.d / 2 + 0.1);
      const fz = p.z - Math.sin(p.a) * (p.d / 2 + 0.1);
      compose(glowMesh, i, fx, p.h * 0.5, fz, -p.a, 1, 1, 1);
    });
    finish(roofMesh);
    finish(glowMesh);
  }
}

export interface RoomShellOptions {
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
export function trimRing(kit: Kit, w: number, d: number, h: number, color: number): void {
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
export function windowPanel(
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
export interface WallHole {
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
export function wallWithHoles(
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
export function windowPortal(
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
export function roofHip(
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
export function makeHingedDoor(
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
export function doorOnZ(kit: Kit, d: number, trim: number, blockOutside = true): void {
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
export function doorwayOnX(kit: Kit, x: number, z: number, gap = 1.3, h = 3, id = 'pintu_kamar'): void {
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

export function roomShell(kit: Kit, w: number, d: number, h: number, opts: RoomShellOptions = {}): void {
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

