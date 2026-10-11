# Asap yang Tak Padam

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../LICENSE)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-live-brightgreen)](https://nekonaru.github.io/Gametech26/)

Game horor naratif psikologis orang pertama bergaya PS1, berbahasa Indonesia dengan penuh English (ID/EN). dibangun dengan Vite + Three.js + TypeScript. Kode di repositori ini berada di bawah [Lisensi MIT](../LICENSE).

## Menjalankan

> **Penting: jangan klik dua kali `index.html`.** Game ini adalah situs web, bukan file HTML mandiri. Browser memblokir modul JavaScript dan file data pada protocol `file:`, jadi layar akan berhenti di "Memuat aset". Harus dijalankan lewat server HTTP seperti di bawah ini.

Cara paling cepat, klik dua kali **`MAINKAN.bat`**. Server menyala di `http://localhost:8000` dan browser terbuka sendiri. Tidak perlu `npm install` selama folder `dist` sudah ada.

Kalau terminal lebih disukai:

```bash
npm install
npm run dev      # server pengembangan, http://localhost:3000
npm run build    # cek tsc lalu bundel ke dist/
node serve.cjs   # sajikan dist tanpa dependensi, http://localhost:8000
npm run preview  # sajikan dist memakai Vite, http://localhost:4173
```

`DEV.bat` menjalankan mode pengembangan. `node serve.cjs` memakai modul bawaan Node, jadi tetap jalan tanpa `node_modules`.

Hasil `npm run build` berupa situs statis di folder `dist/`. Seluruh pemuatan data (babak, locale, aset) memakai helper `src/core/paths.ts` yang berpatok pada `BASE_URL`, jadi `dist/` bisa disajikan dari root domain maupun subfolder (misalnya GitHub Pages di `/Gametech26/`). Build Pages memakai `vite build --base=/Gametech26/` yang diotomatiskan oleh workflow `.github/workflows/deploy-pages.yml`.


## Kontrol

Desktop:

| Aksi | Tombol |
|---|---|
| Bergerak | W A S D |
| Melihat | Mouse (klik layar untuk pointer lock) |
| Interaksi | E |
| Senter | F |
| Ponsel | Q |
| Jurnal dan Papan Petunjuk | Tab |
| Jeda | Esc |
| Lanjut dialog | Klik, Spasi, atau Enter |
| Pilihan dialog | 1 sampai 4 |

Mobile: joystick sentuh di sisi layar untuk bergerak dan menoleh, tap untuk lanjut dialog, tombol interaksi muncul di dekat objek.

## Struktur proyek

- `src/core` events, i18n, settings, save IndexedDB, audio sintesis, input, achievements
- `src/render` material PSX, post process 360p dengan dithering, kamera, partikel, pencahayaan, 18 pembangun adegan
- `src/game` state, script runner op JSON, dialog, interaksi, jurnal, manajer babak, tension, ending, main
- `src/ui` boot, menu, pengaturan, simpan muat, HUD, jurnal, papan petunjuk, ponsel, dialog, galeri, puzzle, ending, prolog
- `public/data` data babak (23 file), clue, ending, variabel, item
- `public/locales` terjemahan ID dan EN, termasuk terjemahan per babak
- `docs/chapter-spec.md` kontrak penulisan babak untuk penulis naskah

## Yang sudah selesai

- 23 babak (B1 sampai B20 termasuk B5B, B12B, dan B15-ALT) seluruhnya dibaca dari JSON di `public/data/chapters`
- 9 ending dan epilog, matriks syarat diuji untuk semua cabang (ending 1 sampai 9 sesuai prioritas Bagian 15 GDD)
- Sistem Jejak Silang (echo), ponsel masuk panggilan, jurnal clue, dan papan petunjuk dengan penarikan kartu
- Variabel sesuai GDD: nurani 0 sampai 4, empati 0 sampai 3, investigasi 0 sampai 7 (dihitung dari poin clue, clue bonus bernilai 0), keyakinan 0 sampai 9, percaya Dimas, dan flag percabangan
- 6 puzzle unik: dial laci (B4), struk robek (B13), kalender dinding (B13), papan petunjuk (B18), jalan berputar (B19), dan timing cincin (B20). Semua punya tombol Bantuan dan Lewati
- Tombol Bantuan terkunci selama dua menit pertama, sesuai GDD
- Simpan IndexedDB: tiga slot manual, autosave, dan checkpoint; pengaturan di localStorage; pencapaian di profil global
- Pencapaian "Detektif" untuk menyelesaikan semua puzzle tanpa tombol Lewati, lengkap dengan notifikasi dan tampilan di Galeri Ending
- Pilih Babak dari menu utama untuk mengulang babak yang sudah terbuka
- Ringkasan Hari menampilkan jumlah poin clue dan daftar clue yang terlewat
- Terjemahan penuh ID/EN, seluruh teks diambil dari i18n, tidak ada teks keras di kode (diaudit 120 kunci statis)
- Gaya PS1: render internal 360p, vertex snapping, dithering, kuantisasi warna, kabut, dan gerak snap
- Desktop dan mobile controls, layar peringatan konten, manifest PWA
- Audio disintesis prosedural, tidak ada file audio eksternal

## Penyimpangan dan pekerjaan yang belum ada

- Tidak ada file audio OGG per babak. Seluruh suara dibangkitkan prosedural oleh `AudioManager`
- Tidak ada aset 3D, tekstur, atau font eksternal. Semua adegan dibangun prosedural dari geometri sederhana, folder `assets/` hanya berisi subfolder kosong
- Ikon PWA memakai SVG satu berkas, tanpa PNG 192 dan 512 piksel
- Penanda konfirmasi puzzle memakai dialog bawaan browser, belum diganti dengan dialog dalam game
- Tidak ada sistem pencapaian selain "Detektif", baru ada satu pencapaian karena GDD hanya menyebut satu
- Profil pencapaian dan galeri ending memakai localStorage, belum tersinkron antar perangkat

## Audit dan pengujian

- `npm run audit` menjalankan seluruh suite validator dalam satu perintah: referensi konten & posisi prop (`validate-content`), kunci teks id/en (`validate-locales`), jalur keluar bab (`verify-keluar`, `audit-keluar`), jalur `chapterEnd` tiap bab (`audit-chapter-exit`), objektif yang bisa mundur (`audit-objective-guards`), dan siklus dialog (`scan-dialog-loops`)
- `tools/validate-locales.mjs` memastikan setiap kunci `text`/`prompt`/`label` di naskah tersedia di bahasa Indonesia dan Inggris, serta kedua bahasa saling simetris, tidak ada kunci mentah yang tampil di layar
- `tools/audit-objective-guards.mjs` melaporkan operasi `objective` tanpa syarat `if` pada jalur yang bisa diulang pemain; ScriptRunner menolak id yang sudah digantikan supaya objektif maju terus
- `tools/auto-play.js` adalah harness smoke-test tanpa pointer: memajukan simulasi sendiri, membuka dialog/puzzle, dan kini mengingat pemakaian interaktif per cakupan bab+objektif. Salin ke `dist/tools/` kalau diuji terhadap build
- `tools/screenshot-sink.cjs` menerima screenshot in-page (POST base64 ke port 8099) untuk dokumentasi visual

## Pesan commit

```
feat: ship full Asap yang Tak Padam narrative game
```
