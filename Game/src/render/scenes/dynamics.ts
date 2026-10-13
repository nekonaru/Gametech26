/**
 * Bagian "dynamics" dari scenes.ts - dipecah agar mudah dinavigasi.
 * Konsumen mengimpor semuanya lewat barrel src/render/scenes.ts.
 */
import * as THREE from 'three';
import { Kit, mat, boxGeo, cylGeo, addGroupProxy, resetDrawerState } from './kit.js';
/* ==========================================================================
   Penghuni & prop adegan luar
   ========================================================================== */

export interface FigureOptions {
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
export function figureHash(x: number, z: number): number {
  let h = Math.imul(Math.round(x * 10) + 374761393, 668265263);
  h ^= Math.imul(Math.round(z * 10) + 1442695041, 2246822519);
  h = Math.imul(h ^ (h >>> 15), 3266489917);
  return (h ^ (h >>> 13)) >>> 0;
}

export const FIGURE_SKIN = [0xb08968, 0x9c7454, 0xc49a6c, 0x7f5a3c, 0xd8b08a, 0x8a6544];
export const FIGURE_SHIRT = [
  0x5d6b74, 0x7a4038, 0x3a4a6b, 0x6d5f52, 0xc9a227, 0x4f6b5c,
  0x8a5a3a, 0x74685a, 0x5a3a4a, 0x2f3d33, 0x8f6d4f, 0x455a64
];

export interface FigureIdle {
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
export const figureIdle: FigureIdle[] = [];

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

export const dynamicTicks: ((t: number) => void)[] = [];

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
  // tidak boleh tersisa sebagai target animasi. State-nya dimiliki kit
  // (deklarasi `let` tidak bisa di-assign lintas modul), jadi lepas lewat
  // fungsi pemiliknya.
  resetDrawerState();
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
export function figure(kit: Kit, x: number, z: number, opts: FigureOptions = {}): THREE.Group {
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
