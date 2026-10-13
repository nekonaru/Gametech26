/**
 * Bagian "builders" dari scenes.ts - dipecah agar mudah dinavigasi.
 * Konsumen mengimpor semuanya lewat barrel src/render/scenes.ts.
 */
import * as THREE from 'three';
import { Kit, palette, mat, anchor, boxGeo, cylGeo, coneGeo, sphereGeo, torusGeo, box, cylinder, floor, wall, ceiling, lampAt, tree, scatterTrees, table, chair, shelf, poster, benchRow, crate, bed, rug, sofa, addGroupProxy, wardrobe, fridge, stove, kitchenCounter, tvSet, radioBox, calendarSheet, mirrorPanel, pictureFrame, wallClock, envelope, wallet, plate, cup, screwdriver, fuseBox, hangingLamp, ceilingFan, signBoard, banner, sachetStrip, motorbike, bicycle, scarecrow, haystack, basket, sack, woodPile, bucket, doorPanel, chestOfDrawers, phoneDevice, shoesPair, firePit } from './kit.js';
import { addDynamicTick, figure } from './dynamics.js';
import { car, bush, bottle, footprints, wallBoard, coffeeMachine, cupStack, jar, ribbon, lampPost, gateArch, hutSmall, flameMat, fireRing, markerPost, pane, groundDisc, distantBackdrop, trimRing, windowPanel, roofHip, doorwayOnX, roomShell } from './props.js';
export function buildRumah(kit: Kit): void {
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
export function buildExteriorRumah(kit: Kit): void {
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

export function buildKedai(kit: Kit): void {
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

export function buildBus(kit: Kit): void {
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

export function buildWarung(kit: Kit): void {
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

export function buildGubuk(kit: Kit): void {
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

export function buildForest(kit: Kit, dense: number): void {
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
export function powerLine(kit: Kit, x: number, y: number, z0: number, z1: number): void {
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

export function buildJalan(kit: Kit): void {
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

export function buildLadang(kit: Kit): void {
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

export function buildBalai(kit: Kit): void {
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

export function buildTepiHutan(kit: Kit): void {
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

export function buildHutanBerputar(kit: Kit): void {
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

export function buildHutanApi(kit: Kit): void {
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
export function ashPile(kit: Kit, x: number, z: number): void {
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

export function buildPasar(kit: Kit): void {
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

export function buildProyek(kit: Kit): void {
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

export function buildTerminal(kit: Kit): void {
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

export function buildMimpi(kit: Kit): void {
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

export function buildPenjara(kit: Kit): void {
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

export const builders: Record<string, (kit: Kit) => void> = {
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
