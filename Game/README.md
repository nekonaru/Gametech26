# Asap yang Tak Padam

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](../LICENSE)
[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-live-brightgreen)](https://nekonaru.github.io/gametech26/)
[![CI](https://github.com/nekonaru/gametech26/actions/workflows/ci.yml/badge.svg)](https://github.com/nekonaru/gametech26/actions/workflows/ci.yml)

Game horor naratif psikologis orang pertama bergaya PS1, berbahasa Indonesia dan Inggris (ID/EN). Dibangun dengan Vite + Three.js + TypeScript. Kode di repositori ini berada di bawah [Lisensi MIT](../LICENSE).

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

Hasil `npm run build` berupa situs statis di folder `dist/`. Seluruh pemuatan data (babak, locale, aset) memakai helper `src/core/paths.ts` yang berpatok pada `BASE_URL`, jadi `dist/` bisa disajikan dari root domain maupun subfolder (misalnya GitHub Pages di `/gametech26/`). Build Pages memakai `vite build --base=/<nama-repo>/` (nama repo dibaca dinamis dari `github.event.repository.name`), jadi menamai ulang repositori tidak memerlukan perubahan apa pun; diotomatiskan oleh workflow `.github/workflows/deploy-pages.yml`.


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

Mobile: joystick sentuh di sisi kiri untuk bergerak (dorong ke tepi = lari), geser sisi kanan untuk menoleh, tap untuk berinteraksi, dan tombol aksi di tepi kanan untuk lari, interaksi, senter, ponsel, jurnal, inventaris, dan jeda.

## Struktur proyek

- `src/shell.ts` gerbang boot 3 KB (tombol MULAI + impor dinamis game); `src/main.ts` entry game yang tunda-muat
- `src/core` events, i18n, settings, save IndexedDB, audio (rekaman + sintesis fallback + lazy-load per bab), input, achievements
- `src/render` material PSX, post process 360p dengan dithering, kamera, partikel, pencahayaan, 18 pembangun adegan
- `src/game` state, script runner op JSON, dialog, interaksi, jurnal, manajer babak, tension, ending, main
- `src/ui` boot, menu, pengaturan, simpan muat, HUD, jurnal, papan petunjuk, ponsel, dialog, galeri, puzzle, ending, prolog
- `public/data` data babak (24 file), clue, ending, variabel, item
- `public/locales` terjemahan ID dan EN, termasuk terjemahan per babak
- `docs/chapter-spec.md` kontrak penulisan babak untuk penulis naskah
- `tools/` 7 suite audit, auto-play, visual regression, Lighthouse budget

## Yang sudah selesai

- 24 babak (B1 sampai B20 termasuk B5B, B10ALT, B12B, dan B15-ALT) seluruhnya dibaca dari JSON di `public/data/chapters`
- 10 ending dan epilog, matriks syarat diuji untuk semua cabang (ending 1 sampai 10)
- Sistem Jejak Silang (echo), ponsel masuk panggilan, jurnal clue, dan papan petunjuk dengan penarikan kartu
- Variabel sesuai GDD: nurani 0 sampai 4, empati 0 sampai 3, investigasi 0 sampai 7 (dihitung dari poin clue, clue bonus bernilai 0), keyakinan 0 sampai 9, percaya Dimas, dan flag percabangan
- 6 puzzle unik: dial laci (B4), struk robek (B13), kalender dinding (B13), papan petunjuk (B18), jalan berputar (B19), dan timing cincin (B20). Semua punya tombol Bantuan dan Lewati
- Tombol Bantuan terkunci selama dua menit pertama, sesuai GDD
- Simpan IndexedDB: tiga slot manual, autosave, dan checkpoint; pengaturan di localStorage; pencapaian di profil global
- Pencapaian "Detektif" untuk menyelesaikan semua puzzle tanpa tombol Lewati, lengkap dengan notifikasi dan tampilan di Galeri Ending
- Pilih Babak dari menu utama untuk mengulang babak yang sudah terbuka
- Ringkasan Hari menampilkan jumlah poin clue dan daftar clue yang terlewat
- Terjemahan penuh ID/EN, seluruh teks diambil dari i18n, tidak ada teks keras di kode (diaudit 83 rujukan `t()` statis di kode, 300 kunci locale id/en)
- Gaya PS1: render internal 360p, vertex snapping, dithering, kuantisasi warna, kabut, dan gerak snap
- Desktop dan mobile controls, layar peringatan konten, manifest PWA
- Penanda interaksi 3 bentuk (npc di atas kepala, wall bersayap, ground chevron + pilar), dibedakan lewat geometri/tekstur bukan warna
- Bundle game tunda-muat: halaman awal hanya cangkang ±10 KB, chunk game diimpor dinamis sesudah tombol MULAI
- Regresi visual di CI: 4 view kanvas dibanding baseline JPEG (ambang 1,5%, dapur 4%)
- Audio rekaman bebas lisensi (Mixkit) untuk 36 kunci suara, dengan sintesis prosedural sebagai fallback offline. Boot hanya memuat 8 SFX kecil; ambience, musik, dan SFX tiap bab diminta `loadChapter` via `ensureAudio` di latar

## Aset dan lisensi

- Seluruh audio di `public/assets/audio` diambil dari [Mixkit](https://mixkit.co) dengan Mixkit License: bebas dipakai, termasuk komersial, tanpa atribusi wajib
- Pemetaan kunci suara ke ID Mixkit beserta langkah pemrosesan (loudnorm, crossfade loop) tercatat di `tools/_build-audio.ps1`, jadi bisa diunduh ulang kapan saja
- `AudioManager` memuat rekaman itu ke buffer dengan kunci yang sama milik resep sintesis, sehingga pemanggilan yang ada tidak perlu diubah; bila unduhan gagal, permainan tetap berjalan memakai sintesis
- Kode berada di bawah Lisensi MIT; lihat `../LICENSE`

## Penyimpangan dan pekerjaan yang belum ada

- Tidak ada file audio per babak. 36 rekaman umum dipakai lintas babak, dimuat malas per bab di latar; sintesis prosedural hanya dipakai sebagai fallback bila unduhan gagal atau belum tiba
- Tidak ada aset 3D, tekstur, atau font eksternal. Semua adegan dibangun prosedural dari geometri sederhana; folder `assets/` hanya berisi audio
- Ikon PWA memakai SVG satu berkas, tanpa PNG 192 dan 512 piksel
- Penanda konfirmasi puzzle memakai dialog bawaan browser, belum diganti dengan dialog dalam game
- Tidak ada sistem pencapaian selain "Detektif", baru ada satu pencapaian karena GDD hanya menyebut satu
- Profil pencapaian dan galeri ending memakai localStorage, belum tersinkron antar perangkat

## Audit dan pengujian

- `npm run audit` menjalankan seluruh suite validator dalam satu perintah: referensi konten & posisi prop (`validate-content`), kunci teks id/en (`validate-locales`), jalur keluar bab (`verify-keluar`, `audit-keluar`), jalur `chapterEnd` tiap bab (`audit-chapter-exit`), objektif yang bisa mundur (`audit-objective-guards`), dan siklus dialog (`scan-dialog-loops`)
- `tools/validate-locales.mjs` memastikan setiap kunci `text`/`prompt`/`label` di naskah tersedia di bahasa Indonesia dan Inggris, serta kedua bahasa saling simetris, tidak ada kunci mentah yang tampil di layar
- `tools/audit-objective-guards.mjs` melaporkan operasi `objective` tanpa syarat `if` pada jalur yang bisa diulang pemain; ScriptRunner menolak id yang sudah digantikan supaya objektif maju terus
- `tools/auto-play.js` adalah harness smoke-test tanpa pointer: memajukan simulasi sendiri, membuka dialog/puzzle, dan kini mengingat pemakaian interaktif per cakupan bab+objektif. Salin ke `dist/tools/` kalau diuji terhadap build
- `npm test` menjalankan 45 unit test Vitest (state, settings, events, endings, audio keys)
- `tools/visual-regression.mjs` memfoto 4 view kanvas dan membandingkannya dengan baseline JPEG memakai pixelmatch; `UPDATE_BASELINE=1` menulis ulang baseline bila perubahan visual disengaja
- `npm run lighthouse` menguji skor kategori + bobot byte terhadap budget (`LH_RUNS=3` di CI)
- `tools/screenshot-sink.cjs` menerima screenshot in-page (POST base64 ke port 8099) untuk dokumentasi visual
