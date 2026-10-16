<div align="center">

# 🔥 Asap yang Tak Padam

**Game horor naratif psikologis 3D yang berjalan di browser. Api bisa padam. Rasa bersalah tidak.**

![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)
![Three.js](https://img.shields.io/badge/Three.js-0.186-black?style=flat-square&logo=three.js&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Web-orange?style=flat-square)
![Status](https://img.shields.io/badge/Status-Active-brightgreen?style=flat-square)
![CI](https://github.com/nekonaru/gametech26/actions/workflows/ci.yml/badge.svg)

</div>

## ✨ Tentang

**Asap yang Tak Padam** adalah game horor naratif psikologis orang pertama bergaya PS1. Kamu bergantian menjadi **Dimas** dan **Raka** selama 7 hari di sebuah desa: memeriksa benda, mengajak warga bicara, mengumpulkan clue ke jurnal, memecahkan puzzle, dan menentukan salah satu dari **10 ending** lewat pilihan dan nuranimu sendiri.

> _"Api bisa padam. Rasa bersalah tidak."_

Dibangun dengan **Three.js** + **TypeScript** + **Vite**. Seluruh naskah dibaca dari JSON (24 berkas bab, dua bahasa), jadi penulis cerita bisa menambah bab tanpa menyentuh kode.

## 🎯 Fitur

| Fitur | Keterangan |
|-------|------------|
| 📖 **24 bab JSON** | B1 sampai B20 plus B5B, B10ALT, B12B, dan B15-ALT; dua POV (Dimas/Raka), 2 bab cabang opsional |
| 🔚 **10 ending + epilog** | Pohon keputusan diuji unit untuk semua cabang, termasuk true ending |
| 🌍 **Indonesia + English** | Seluruh teks lewat i18n, simetri ID/EN diaudit otomatis |
| 🔶 **Penanda 3 bentuk** | NPC (ketupat di atas kepala), objek dinding (ketupat bersayap), objek meja/lantai (chevron + pilar cahaya): beda bentuk, bukan cuma warna |
| 📓 **Jurnal & papan petunjuk** | Clue, evidence board dengan penarikan kartu, ringkasan hari + daftar clue terlewat |
| 🧩 **6 puzzle unik** | Dial laci, struk robek, kalender dinding, papan petunjuk, jalan berputar, timing cincin; semua punya Bantuan dan Lewati |
| 🎨 **Gaya PS1** | Render internal 360p, vertex snapping, dithering, kuantisasi warna, kabut |
| 🔊 **Audio adaptif** | 36 rekaman Mixkit + sintesis prosedural sebagai fallback; boot hanya memuat 8 SFX kecil, sisanya menyusul per bab |
| ⚡ **Muat cepat** | Bundle game (±940 KB) baru diunduh sesudah tombol MULAI ditekan; halaman awal ±10 KB |
| 💾 **Simpan fleksibel** | 3 slot manual, autosave, checkpoint (IndexedDB); pengaturan di localStorage |
| 📱 **Desktop + mobile** | WASD/mouse pointer-lock, atau joystick sentuh + tombol aksi; manifest PWA |
| 🗺️ **Pilih Babak & galeri** | Ulangi babak terbuka dari menu utama; galeri ending + pencapaian Detektif |

## 📦 Syarat

- **Node.js** 22 atau lebih baru
- **npm** (ikut bersama Node.js)
- Browser modern dengan WebGL (Chrome/Edge/Firefox terbaru)

## 🚀 Memainkan

### Opsi A: Main di browser (termudah)

Buka **[https://nekonaru.github.io/gametech26/](https://nekonaru.github.io/gametech26/)**. Game di-deploy otomatis ke GitHub Pages setiap push ke `main`. Tanpa install apa pun.

### Opsi B: Main lokal tanpa install

1. Pastikan folder `Game/dist` sudah ada (ikut terkirim di repo ini)
2. Klik dua kali **`Game/MAINKAN.bat`**. Kalau `dist` belum ada, skrip ini membangunnya sendiri
3. Browser terbuka sendiri di `http://localhost:8000`

Tanpa mouse (atau di luar Windows), dari folder `Game`:

```bash
node serve.cjs   # sajikan dist tanpa dependensi, http://localhost:8000
```

### Opsi C: Jalan dari source (untuk development / membaca kode)

**1. Ambil kode proyek**

<details>
<summary><b>Sudah install Git</b></summary>

```bash
git clone https://github.com/nekonaru/gametech26.git
cd gametech26/Game
```

</details>

<details>
<summary><b>Belum install Git</b></summary>

1. Buka halaman repositori di GitHub
2. Klik tombol hijau **`Code`**, pilih **`Download ZIP`**
3. Ekstrak ZIP ke folder pilihanmu
4. Buka terminal di dalam folder `Game` hasil ekstrak

</details>

<details>
<summary><b>Belum pernah buka terminal? Mulai di sini</b></summary>

1. Tekan tombol **Windows**, ketik `PowerShell`, tekan **Enter**
2. Jendela biru terbuka. Di situlah perintah diketik
3. Pindah ke folder game, contoh: `cd Downloads\gametech26\Game`
4. Setiap perintah `npm ...` di panduan ini diketik di jendela itu, diikuti **Enter**

</details>

**2. Install dependensi dan jalankan**

```bash
npm install
npm run dev      # server pengembangan, http://localhost:3000
```

Perintah lain di folder `Game`:

```bash
npm run build    # cek tsc lalu bundel ke dist/
npm run preview  # sajikan dist memakai Vite, http://localhost:4173
```

> **Penting: jangan klik dua kali `index.html`.** Browser memblokir modul JavaScript dan file data pada protocol `file:`, jadi layar akan berhenti. Selalu jalankan lewat server HTTP seperti di atas.

## 🖥️ Kontrol

Desktop:

| Aksi | Tombol |
|---|---|
| Bergerak | W A S D |
| Menoleh | Mouse (klik layar untuk pointer lock) |
| Interaksi | E |
| Senter | F |
| Ponsel | Q |
| Jurnal dan papan petunjuk | Tab |
| Jeda | Esc |
| Lanjut dialog | Klik, Spasi, atau Enter |
| Pilihan dialog | 1 sampai 4 |

Mobile: joystick kiri untuk bergerak (dorong ke tepi = lari), geser kanan untuk menoleh, tap untuk berinteraksi, tombol aksi di tepi kanan untuk lari, interaksi, senter, ponsel, jurnal, inventaris, dan jeda.

## 🗂️ Struktur Proyek

```
gametech26/
├── .github/workflows/      # CI (lint, test, audit, Lighthouse, auto-play,
│                           #   visual regression) + Deploy Pages + Dependabot
├── Game/
│   ├── src/
│   │   ├── shell.ts          # gerbang boot 3 KB: tombol MULAI + impor dinamis game
│   │   ├── main.ts           # entry game (dimuat hanya sesudah MULAI)
│   │   ├── core/             # engine, audio (+ lazy-load per bab), i18n,
│   │   │                     #   settings, save IndexedDB, input, achievements
│   │   ├── render/           # material PSX, kamera, partikel, pencahayaan, adegan
│   │   ├── game/             # state, script runner op JSON, dialog, interaksi,
│   │   │                     #   jurnal, manajer babak, tension, ending
│   │   ├── ui/               # boot, menu, HUD, ponsel, dialog, galeri, puzzle
│   │   └── puzzles/          # logika 6 puzzle
│   ├── public/data/chapters/ # 24 naskah bab JSON (termasuk 2 bab cabang)
│   ├── public/locales/       # teks ID/EN global + per bab (simetri diaudit)
│   ├── public/assets/audio/  # 36 rekaman Mixkit (lisensi bebas komersial)
│   ├── tools/                # 7 suite audit, auto-play, visual regression,
│   │                         #   Lighthouse budget, bangun audio
│   ├── docs/                 # kontrak penulisan babak untuk penulis naskah
│   └── shots/                # arsip screenshot verifikasi gameplay
├── LICENSE
└── README.md                 # dokumentasi ini
```

**Menambah bab baru:** salin pola `b15alt` (bab cabang kecil): satu JSON naskah di `public/data/chapters/`, satu JSON locale di `public/locales/chapters/`, satu baris definisi `branch: true` di `src/game/chapter.ts`. Kontrak lengkapnya ada di `Game/docs/chapter-spec.md`.

## 🧪 Pengujian

Verifikasi statis sebelum setiap push (semuanya juga jalan di CI):

```bash
npm run lint        # eslint, harus 0 errors
npm test            # vitest, 45 test
npm run audit       # 7 suite validator: referensi konten, simetri locale,
                    #   jalur keluar bab, chapterEnd tiap bab, objektif,
                    #   siklus dialog
npm run lighthouse  # budget bobot + skor (LH_RUNS=3 di CI untuk meredam noise)
```

Verifikasi runtime:

```bash
node tools/auto-play-ci.mjs     # main penuh b01 sampai ending tanpa error/stall
                                #   (butuh Playwright, dipasang otomatis di CI)
node tools/visual-regression.mjs  # 4 view kanvas vs baseline JPEG
UPDATE_BASELINE=1 node tools/visual-regression.mjs  # tulis ulang baseline
                                                    #   bila perubahan visual disengaja
```

## ❓ FAQ

<details>
<summary><b>Layar berhenti di "Memuat aset"?</b></summary>

Kamu membuka `index.html` langsung (protocol `file:`). Browser memblokir modul JavaScript dan file data di situ. Jalankan lewat server HTTP: klik dua kali `Game/MAINKAN.bat`, atau `node serve.cjs` dari folder `Game`.

</details>

<details>
<summary><b>MAINKAN.bat bilang Node.js tidak ditemukan?</b></summary>

Install Node.js 22+ dari [https://nodejs.org](https://nodejs.org), lalu jalankan file bat-nya lagi.

</details>

<details>
<summary><b>Di mana progres tersimpan? Bagaimana mengulang dari nol?</b></summary>

Progres tersimpan di browser (IndexedDB + localStorage), bukan di file. Untuk mulai dari nol, hapus data situs `localhost` (atau domain Pages) di pengaturan browser. Untuk mengulang babak tertentu tanpa menghapus semua, pakai **Pilih Babak** di menu utama.

</details>

<details>
<summary><b>Bab cabang tidak muncul di Pilih Babak?</b></summary>

Sengaja. Bab cabang (`branch: true`, mis. B10ALT dan B15-ALT) hanya bisa dicapai lewat pilihan cerita di dalam game, bukan dari menu. Menyelesaikannya tetap membuka babak linear berikutnya.

</details>

## 👥 Tim

| Anggota |
| --- |
| **Aigy** |
| **Nicolas** |
| **Nabil** |

## 📄 Lisensi

Kode di bawah [Lisensi MIT](LICENSE). Lihat [`LICENSE`](LICENSE) untuk info lengkap.

<div align="center">

Dibuat oleh **Tim Gametech26**

*Star repo ini kalau game-nya berkesan!*

</div>
