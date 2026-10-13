/**
 * Katalog rekaman audio asli (Mixkit License - bebas dipakai komersial,
 * tanpa atribusi) yang menggantikan sintesis prosedural.
 *
 * File diproses lewat tools/_build-audio.ps1 (mono 44.1 kHz, loudnorm -18 LUFS,
 * loop di-crossfade agar mulus). Disimpan di `AudioManager.buffers` dengan key
 * yang sama persis dengan resep sintesis, sehingga semua pemanggilan
 * play()/playProcedural() otomatis memakai rekaman tanpa perubahan naskah.
 * Koneksi gagal? Sintesis tetap jadi fallback.
 *
 * Strategi muat DUA TINGKAT (hemat bandwidth awal):
 * - Boot hanya memuat BOOT_AUDIO_SAMPLES: delapan SFX reaktif kecil (±165 KB)
 *   yang dipicu sistem real-time (langkah kaki, tension horror, telepon):
 *   fetch di tengah permainan untuk suara-suara ini terasa sebagai jeda.
 * - Tiap masuk bab, `loadChapter` meminta key `playSound` bab itu lewat
 *   `ensureAudio` (ambience, musik, SFX bab) di latar tanpa menahan permainan.
 *   Total unduhan boot turun dari ±3,3 MB ke ±0,2 MB.
 */

import { assetUrl } from './paths.js';

/** Path aset publik relatif base deployment; key = key suara pada naskah. */
const AUDIO_BASE = 'assets/audio/';

const FILES = [
  // Ambience loop (diputar dengan loop:true oleh naskah bab)
  'ambience_morning', 'ambience_pagi', 'ambience_night', 'ambience_house_night',
  'ambience_forest', 'ambience_hutan', 'ambience_forest_night', 'ambience_fire',
  'ambience_fire_distant', 'ambience_bus', 'ambience_cafe', 'ambience_warung',
  'ambience_hall', 'ambience_village', 'ambience_house',
  // Musik latar trek (loop)
  'music_trek_petang', 'music_trek_hujan', 'music_trek_pulang',
  // SFX one-shot
  'footstep', 'langkah_kering', 'footstep_wet', 'run_fast', 'heartbeat', 'breath',
  'whisper', 'static', 'radio_berita', 'dog_bark', 'phone_ring', 'journal_note',
  'satwa_kabur', 'wind_low', 'whisper_wind', 'heat_wave', 'distant_glow', 'bara_jauh',
] as const;

/** Key suara -> URL siap unduh. Dimuat via AudioManager.loadAudioBatch(). */
export const AUDIO_SAMPLES: Record<string, string> = Object.fromEntries(
  FILES.map((key) => [key, assetUrl(`${AUDIO_BASE}${key}.mp3`)])
);

/**
 * SFX reaktif kecil yang tetap dimuat saat boot: dipicu sistem real-time
 * (gerakan pemain, tension horror, telepon, prolog) di luar naskah bab,
 * sehingga tidak tercakup ensureAudio per bab. Delapan file ±165 KB;
 * sisanya (±3,1 MB ambience + musik + SFX bab) menyusul per bab.
 */
export const BOOT_AUDIO_KEYS = [
  'footstep', 'langkah_kering', 'footstep_wet', 'run_fast',
  'heartbeat', 'breath', 'whisper', 'static'
] as const;

/** Peta siap unduh untuk boot minimal (lihat BOOT_AUDIO_KEYS). */
export const BOOT_AUDIO_SAMPLES: Record<string, string> = Object.fromEntries(
  BOOT_AUDIO_KEYS.map((key) => [key, AUDIO_SAMPLES[key]])
);
