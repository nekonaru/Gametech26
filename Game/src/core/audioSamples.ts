/**
 * Katalog rekaman audio asli (Mixkit License - bebas dipakai komersial,
 * tanpa atribusi) yang menggantikan sintesis prosedural.
 *
 * File diproses lewat tools/_build-audio.ps1 (mono 44.1 kHz, loudnorm -18 LUFS,
 * loop di-crossfade agar mulus). Dimuat sekali saat boot lalu disimpan di
 * `AudioManager.buffers` dengan key yang sama persis dengan resep sintesis,
 * sehingga semua pemanggilan play()/playProcedural() otomatis memakai rekaman
 * tanpa perubahan naskah. Koneksi gagal? Sintesis tetap jadi fallback.
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
