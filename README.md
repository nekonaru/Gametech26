# Gametech26 — Asap yang Tak Padam

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Made with Three.js](https://img.shields.io/badge/Made%20with-Three.js-black?logo=three.js)](https://threejs.org/)
[![Built with Vite](https://img.shields.io/badge/Built%20with-Vite-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)

**Asap yang Tak Padam** — game horor naratif psikologis 3D yang berjalan di browser.
Api bisa padam. Rasa bersalah tidak.

Dibangun dengan **Three.js** + **TypeScript** + **Vite**. Naskah 22 bab dengan
dua bahasa (Indonesia & Inggris), puzzle interaktif, sistem clue & journal,
berbagai ending, dan mode naratif tanpa timer.

## 👥 Tim

| Anggota |
| --- |
| **Aigy** |
| **Nicolas** |
| **Nabil** |

## 🎮 Memainkan

Game ini di-deploy otomatis ke **GitHub Pages** setiap push ke `main`:

▶️ **[Mainkan di sini](https://nekonaru.github.io/Gametech26/)**

## 🛠️ Menjalankan secara lokal

```bash
cd Game
npm install
npm run dev      # server pengembangan (http://localhost:3000)
npm run build    # build produksi ke Game/dist
npm run preview  # pratinjau hasil build
npm run audit    # 7 pemeriksaan konten & konsistensi naskah
```

Struktur repo:

- `Game/src/` — kode TypeScript (engine, scene 3D, UI, puzzle)
- `Game/public/data/chapters/` — naskah 22 bab (id)
- `Game/public/locales/` — terjemahan teks id & en
- `Game/tools/` — harness auto-play & audit otomatis
- `Game/shots/` — arsip screenshot verifikasi gameplay

## 📄 Lisensi

Kode di bawah [Lisensi MIT](LICENSE) — © 2026 Nicolas Dwi Dharma.
