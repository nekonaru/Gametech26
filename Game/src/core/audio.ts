export interface AudioConfig {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  ambienceVolume: number;
  dialogBlipVolume: number;
  muteOnBlur: boolean;
}

export type AudioCategory = 'master' | 'music' | 'sfx' | 'ambience' | 'dialogBlip';

export class AudioManager {
  private audioContext: AudioContext | null = null;

  getAudioContext(): AudioContext | null {
    return this.audioContext;
  }
  private masterGain: GainNode | null = null;
  private categoryGains: Map<AudioCategory, GainNode> = new Map();
  private buffers: Map<string, AudioBuffer> = new Map();
  /**
   * Unduhan yang sedang berjalan per key. Tanpa ini, dua pemanggil bersamaan
   * (mis. ensureAudio bab + preload boot untuk key yang sama) mengunduh dan
   * mendekode file yang sama dua kali.
   */
  private inflight = new Map<string, Promise<void>>();
  private sources: Map<string, { source: AudioBufferSourceNode; gain: GainNode; category: AudioCategory }> = new Map();
  private config: AudioConfig;
  private listeners: Set<(config: AudioConfig) => void> = new Set();
  private suspended = false;

  constructor(config: Partial<AudioConfig> = {}) {
    this.config = {
      masterVolume: config.masterVolume ?? 0.8,
      musicVolume: config.musicVolume ?? 0.7,
      sfxVolume: config.sfxVolume ?? 0.8,
      ambienceVolume: config.ambienceVolume ?? 0.6,
      dialogBlipVolume: config.dialogBlipVolume ?? 0.5,
      muteOnBlur: config.muteOnBlur ?? true
    };
  }

  async initialize(): Promise<void> {
    if (this.audioContext) return;
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.connect(this.audioContext.destination);
    this.masterGain.gain.value = this.config.masterVolume;

    const categories: AudioCategory[] = ['music', 'sfx', 'ambience', 'dialogBlip'];
    categories.forEach(cat => {
      const gain = this.audioContext!.createGain();
      gain.connect(this.masterGain!);
      this.categoryGains.set(cat, gain);
      this.setCategoryVolume(cat, this.config[cat + 'Volume' as keyof AudioConfig] as number);
    });

    // Guard dibaca saat kejadian, bukan saat pemasangan: setelan "Bisu saat
    // jendela tidak fokus" bisa dinyalakan/dimatikan pemain tanpa reload.
    window.addEventListener('blur', () => { if (this.config.muteOnBlur) this.suspend(); });
    window.addEventListener('focus', () => { if (this.config.muteOnBlur) this.resume(); });

    document.addEventListener('click', () => this.resume(), { once: true });
    document.addEventListener('keydown', () => this.resume(), { once: true });
    // iOS/Safari memakai kebijakan autoplay yang ketat: konteks hanya boleh
    // di-resume di dalam gesture pengguna. `touchstart` dipasang agar unlock
    // terjadi tepat saat jari menyentuh layar; `click` pertama (mis. tombol
    // menu) tetap dipakai sebagai jaring pengaman di desktop.
    document.addEventListener('touchstart', () => this.resume(), { once: true, passive: true });
    document.addEventListener('pointerdown', () => this.resume(), { once: true, passive: true });
  }

  async loadAudio(key: string, url: string): Promise<void> {
    if (!this.audioContext) await this.initialize();
    // Sudah ada (atau sedang diunduh): jangan fetch ulang.
    if (this.buffers.has(key)) return;
    const ongoing = this.inflight.get(key);
    if (ongoing) {
      await ongoing;
      return;
    }
    const job = (async () => {
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = await this.audioContext!.decodeAudioData(arrayBuffer);
        this.buffers.set(key, buffer);
      } catch (error) {
        console.warn(`Failed to load audio: ${key} from ${url}`, error);
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, job);
    await job;
  }

  async loadAudioBatch(audioMap: Record<string, string>): Promise<void> {
    await Promise.all(Object.entries(audioMap).map(([key, url]) => this.loadAudio(key, url)));
  }

  /** Rekaman key ini sudah di buffer (siap dipakai play/playProcedural). */
  has(key: string): boolean {
    return this.buffers.has(key);
  }

  /**
   * Pastikan rekaman untuk key-key ini tersedia, tanpa menahan pemanggil.
   *
   * Dipakai `loadChapter`: tiap masuk bab, key `playSound` dari naskah bab
   * diminta di latar. Selama file belum tiba, `play()` memakai sintesis
   * prosedural sebagai fallback (kontrak lama yang dipertahankan), lalu
   * otomatis memakai rekaman untuk pemutaran berikutnya. Key tanpa URL di
   * katalog (mis. phone_hangup yang memang sintesis saja) dilewati diam.
   */
  async ensureAudio(keys: readonly string[], catalog: Record<string, string>): Promise<void> {
    const missing = keys.filter((key) => !this.buffers.has(key) && typeof catalog[key] === 'string');
    if (!missing.length) return;
    await Promise.all(missing.map((key) => this.loadAudio(key, catalog[key])));
  }

  play(key: string, options: {
    category?: AudioCategory;
    loop?: boolean;
    volume?: number;
    playbackRate?: number;
    spatial?: boolean;
    position?: [number, number, number];
    onEnded?: () => void;
  } = {}): string | null {
    if (!this.audioContext) return null;

    const buffer = this.getBuffer(key, options.loop ?? false);
    if (!buffer) return null;

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.loop = options.loop ?? false;
    source.playbackRate.value = options.playbackRate ?? 1;

    const category = options.category ?? 'sfx';
    if (options.loop) this.stopAll(category, 0.4);
    const gainNode = this.categoryGains.get(category) || this.masterGain!;
    const localGain = this.audioContext.createGain();
    localGain.gain.value = options.volume ?? 1;
    localGain.connect(gainNode);

    if (options.spatial && this.audioContext.listener) {
      const panner = this.audioContext.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'exponential';
      panner.refDistance = 1;
      panner.maxDistance = 50;
      panner.rolloffFactor = 1;
      if (options.position) {
        panner.positionX.value = options.position[0];
        panner.positionY.value = options.position[1];
        panner.positionZ.value = options.position[2];
      }
      source.connect(panner).connect(localGain);
    } else {
      source.connect(localGain);
    }

    const sourceId = `${key}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    this.sources.set(sourceId, { source, gain: localGain, category });

    source.onended = () => {
      this.sources.delete(sourceId);
      options.onEnded?.();
    };

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    source.start(0);
    return sourceId;
  }

  private getBuffer(key: string, loop: boolean): AudioBuffer | null {
    const cached = this.buffers.get(key);
    if (cached) return cached;
    const synthesized = this.synthesize(key, loop);
    if (synthesized) this.buffers.set(key, synthesized);
    return synthesized;
  }

  private synthesize(key: string, loop: boolean): AudioBuffer | null {
    if (!this.audioContext) return null;
    const recipe = this.recipeFor(key.toLowerCase());
    if (!recipe) return null;

    const sampleRate = this.audioContext.sampleRate;
    const length = Math.max(1, Math.floor(sampleRate * recipe.duration));
    const buffer = this.audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const value = recipe.sample(i / sampleRate, i);
      data[i] = Number.isFinite(value) ? value : 0;
    }

    let peak = 0;
    for (let i = 0; i < length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
    if (peak > 1e-6) {
      const gain = recipe.peak / peak;
      for (let i = 0; i < length; i++) data[i] *= gain;
    }

    if (loop) {
      const fade = Math.min(Math.floor(sampleRate * 0.04), Math.floor(length / 4));
      for (let i = 0; i < fade; i++) {
        const a = i / fade;
        data[i] *= a;
        data[length - 1 - i] *= a;
      }
    }

    return buffer;
  }

  private recipeFor(key: string): { duration: number; peak: number; sample: (t: number, i: number) => number } | null {
    const rnd = () => Math.random() * 2 - 1;
    let brown = 0;
    const brownNoise = (): number => {
      brown = brown * 0.985 + rnd() * 0.05;
      return brown;
    };
    const crackleAt = (t: number): number => {
      const step = Math.floor(t * 46);
      const hash = Math.abs(Math.sin(step * 12.9898) * 43758.5453) % 1;
      if (hash < 0.82) return 0;
      const phase = (t * 46) % 1;
      return rnd() * Math.exp(-phase * 9) * (hash - 0.82) * 5;
    };

    if (key.startsWith('ambience_')) {
      const kind = key.slice('ambience_'.length);
      return {
        duration: 12,
        peak: 0.3,
        sample: (t) => {
          let s = brownNoise() * 3;
          s *= 0.55 + 0.45 * Math.sin(2 * Math.PI * 0.08 * t + 1);

          if (kind === 'morning' || kind === 'pagi') {
            const period = 1.9;
            const phase = t % period;
            if (phase < 0.16 && Math.floor(t / period) % 4 !== 0) {
              s += Math.sin(2 * Math.PI * (2100 + 700 * Math.sin(phase * 90)) * t)
                * 0.4 * Math.sin(Math.PI * phase / 0.16);
            }
          }
          if (kind === 'hutan' || kind === 'forest' || kind === 'forest_night') {
            s += Math.sin(2 * Math.PI * 4200 * t) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 9 * t)) * 0.3;
          }
          if (kind === 'night' || kind === 'house_night') {
            s += Math.sin(2 * Math.PI * 3600 * t) * (0.5 + 0.5 * Math.sin(2 * Math.PI * 7 * t)) * 0.2;
            s += Math.sin(2 * Math.PI * 54 * t) * 0.3;
          }
          if (kind === 'fire' || kind === 'fire_distant') {
            s += Math.sin(2 * Math.PI * 48 * t) * 0.35 + crackleAt(t) * 0.8;
          }
          if (kind === 'bus') {
            s += Math.sin(2 * Math.PI * 58 * t) * 0.4 + Math.sin(2 * Math.PI * 91 * t) * 0.18;
          }
          if (kind === 'cafe' || kind === 'warung') {
            const phase = (t * 3.1) % 1;
            s += rnd() * 0.6 * Math.max(0, Math.sin(Math.PI * phase));
          }
          if (kind === 'village' || kind === 'hall' || kind === 'house') {
            s += rnd() * 0.12;
          }
          return s;
        }
      };
    }

    if (key === 'wind_low' || key === 'whisper_wind' || key === 'heat_wave') {
      return {
        duration: 8,
        peak: 0.3,
        sample: (t) => {
          const sweep = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.06 * t);
          let s = brownNoise() * 3.5 * sweep;
          if (key === 'whisper_wind') {
            const burst = Math.max(0, Math.sin(2 * Math.PI * 0.35 * t));
            s += rnd() * burst * 0.5;
          }
          if (key === 'heat_wave') {
            s += Math.sin(2 * Math.PI * 42 * t) * 0.3;
          }
          return s;
        }
      };
    }

    if (key === 'music_trek_petang' || key === 'music_trek_hujan' || key === 'music_trek_pulang') {
      const chords: number[][] = [
        [196, 247, 294],
        [175, 220, 262],
        [147, 196, 233]
      ];
      return {
        duration: 9,
        peak: 0.28,
        sample: (t) => {
          const index = Math.floor(t / 3) % chords.length;
          const chord = chords[index];
          let s = 0;
          chord.forEach((f, i) => {
            s += Math.sin(2 * Math.PI * f * t + i) * 0.18;
            s += Math.sin(2 * Math.PI * f * 2 * t + i) * 0.05;
          });
          const melody = [0, 1.2, 2.1, 3.4, 4.9, 6.2, 7.5];
          const nearest = melody.reduce((a, b) => Math.abs(b - (t % 9)) < Math.abs(a - (t % 9)) ? b : a);
          const mt = (t % 9) - nearest;
          if (mt >= 0 && mt < 0.9) {
            const freq = chord[Math.floor(t) % chord.length] * 2;
            s += Math.sin(2 * Math.PI * freq * mt) * 0.16 * Math.exp(-mt * 3.5);
          }
          return s * (0.7 + 0.3 * Math.sin(2 * Math.PI * 0.12 * t));
        }
      };
    }

    if (key.startsWith('footstep') || key.startsWith('langkah') || key === 'run_fast') {
      const fast = key === 'run_fast';
      return {
        duration: fast ? 0.7 : 0.35,
        peak: 0.6,
        sample: (t) => {
          const spacing = fast ? 0.28 : 0.34;
          const phase = t % spacing;
          if (t > spacing && !fast) return 0;
          const envelope = Math.exp(-phase * 34);
          const grit = key.includes('wet') || key.includes('ker')
            ? rnd() * envelope * 1.1
            : rnd() * envelope * 0.7;
          const thud = Math.sin(2 * Math.PI * 78 * phase) * Math.exp(-phase * 42) * 0.7;
          return grit + thud;
        }
      };
    }

    if (key === 'heartbeat') {
      const thump = (t: number, start: number): number => {
        const d = t - start;
        if (d < 0 || d > 0.45) return 0;
        return (Math.sin(2 * Math.PI * 52 * d) * 0.8 + rnd() * 0.15) * Math.exp(-d * 16);
      };
      return {
        duration: 1.5,
        peak: 0.65,
        sample: (t) => thump(t, 0) + thump(t, 0.34) * 0.7
      };
    }

    if (key === 'breath') {
      return {
        duration: 1.8,
        peak: 0.35,
        sample: (t) => {
          const env = Math.sin(Math.PI * t / 1.8);
          return (rnd() * 0.5 + Math.sin(2 * Math.PI * 165 * t) * 0.08) * env;
        }
      };
    }

    if (key === 'whisper') {
      return {
        duration: 2.2,
        peak: 0.3,
        sample: (t) => {
          const env = Math.sin(Math.PI * t / 2.2) * (0.4 + 0.6 * Math.abs(Math.sin(2 * Math.PI * 4.5 * t)));
          return rnd() * env;
        }
      };
    }

    if (key === 'static' || key === 'radio_berita') {
      const radio = key === 'radio_berita';
      return {
        duration: radio ? 7 : 1.2,
        peak: radio ? 0.45 : 0.4,
        sample: (t, _i) => {
          const noise = rnd();
          if (!radio) return noise;
          const voice = Math.max(0,
            Math.sin(2 * Math.PI * 2.7 * t) * Math.sin(2 * Math.PI * 0.9 * t + 1)
          );
          const syllable = 0.35 + 0.65 * Math.max(0, Math.sin(2 * Math.PI * 6.5 * t));
          return voice * syllable * 0.9 + noise * 0.4;
        }
      };
    }

    if (key.startsWith('phone_')) {
      if (key === 'phone_ring') {
        const beep = (t: number, start: number): number => {
          const d = t - start;
          if (d < 0 || d > 0.42) return 0;
          const env = Math.min(1, d * 40) * Math.min(1, (0.42 - d) * 20);
          return (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 480 * t)) * env * 0.5;
        };
        return {
          duration: 3,
          peak: 0.5,
          sample: (t) => beep(t, 0.1) + beep(t, 0.75) + beep(t, 1.7) + beep(t, 2.35)
        };
      }
      if (key === 'phone_vibrate') {
        return {
          duration: 0.7,
          peak: 0.45,
          sample: (t) => {
            const env = Math.min(1, t * 30) * Math.min(1, (0.7 - t) * 8);
            const buzz = Math.sign(Math.sin(2 * Math.PI * 175 * t)) * 0.5;
            const tremolo = 0.5 + 0.5 * Math.sin(2 * Math.PI * 28 * t);
            return buzz * tremolo * env;
          }
        };
      }
      if (key === 'phone_hangup') {
        return {
          duration: 0.5,
          peak: 0.5,
          sample: (t) => {
            const click = t < 0.02 ? rnd() * (1 - t / 0.02) : 0;
            const tone = t > 0.03 && t < 0.22
              ? Math.sin(2 * Math.PI * 480 * t) * Math.exp(-(t - 0.03) * 12)
              : 0;
            return click * 1.2 + tone * 0.7;
          }
        };
      }
      return {
        duration: 0.5,
        peak: 0.35,
        sample: (t) => rnd() * Math.exp(-t * 12) * 0.6
      };
    }

    if (key === 'journal_note') {
      return {
        duration: 0.5,
        peak: 0.4,
        sample: (t) => {
          const noise = rnd();
          return noise * Math.exp(-t * 7) * 0.9;
        }
      };
    }

    if (key === 'dog_bark') {
      const bark = (t: number, start: number): number => {
        const d = t - start;
        if (d < 0 || d > 0.22) return 0;
        const env = Math.min(1, d * 60) * Math.exp(-d * 14);
        const growl = Math.sin(2 * Math.PI * (240 - 60 * d) * t) + rnd() * 0.5;
        return growl * env;
      };
      return {
        duration: 1.2,
        peak: 0.6,
        sample: (t) => bark(t, 0.05) + bark(t, 0.5) * 0.8
      };
    }

    if (key === 'satwa_kabur') {
      return {
        duration: 1.4,
        peak: 0.45,
        sample: (t) => {
          const sweep = Math.sin(Math.PI * t / 1.4);
          const s = brownNoise() * 4 * sweep;
          const scatter = t < 0.9 ? Math.sin(2 * Math.PI * (2600 + 1400 * t) * t) * Math.exp(-t * 3) : 0;
          return s * 0.5 + scatter * 0.5;
        }
      };
    }

    if (key === 'distant_glow' || key === 'bara_jauh') {
      return {
        duration: 6,
        peak: 0.3,
        sample: (t) => {
          let s = Math.sin(2 * Math.PI * 46 * t) * 0.5 + brownNoise() * 1.5;
          s += crackleAt(t) * 0.5;
          return s;
        }
      };
    }

    return null;
  }

  stop(sourceId: string, fadeTime = 0): void {
    const entry = this.sources.get(sourceId);
    if (!entry) return;
    this.sources.delete(sourceId);
    this.fadeAndStop(entry, fadeTime);
  }

  private fadeAndStop(entry: { source: AudioBufferSourceNode; gain: GainNode; category: AudioCategory }, fadeTime: number): void {
    const context = this.audioContext;
    if (!context) {
      try { entry.source.stop(); } catch { /* already stopped */ }
      return;
    }
    if (fadeTime > 0) {
      const now = context.currentTime;
      entry.gain.gain.cancelScheduledValues(now);
      entry.gain.gain.setValueAtTime(entry.gain.gain.value, now);
      entry.gain.gain.linearRampToValueAtTime(0, now + fadeTime);
      window.setTimeout(() => {
        try { entry.source.stop(); } catch { /* already stopped */ }
      }, fadeTime * 1000 + 40);
    } else {
      try { entry.source.stop(); } catch { /* already stopped */ }
    }
  }

  stopAll(category?: AudioCategory, fadeTime = 0): void {
    this.sources.forEach((entry, sourceId) => {
      if (category && entry.category !== category) return;
      this.sources.delete(sourceId);
      this.fadeAndStop(entry, fadeTime);
    });
  }

  setMasterVolume(volume: number): void {
    this.config.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain) this.masterGain.gain.value = this.config.masterVolume;
    this.notify();
  }

  /** Setelan "Bisu saat jendela tidak fokus" bisa berubah saat permainan jalan. */
  setMuteOnBlur(enabled: boolean): void {
    if (this.config.muteOnBlur === enabled) return;
    this.config.muteOnBlur = enabled;
    // Baru dinyalakan sementara jendela memang sedang tidak fokus: langsung
    // bisukan supaya efeknya terasa seketika, bukan menunggu blur berikutnya.
    if (enabled && !document.hasFocus()) this.suspend();
    this.notify();
  }

  setCategoryVolume(category: AudioCategory, volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    if (category === 'master') {
      this.setMasterVolume(clamped);
      return;
    }
    const key = category + 'Volume' as keyof AudioConfig;
    (this.config as any)[key] = clamped;
    const gain = this.categoryGains.get(category);
    if (gain) gain.gain.value = clamped;
    this.notify();
  }

  getCategoryVolume(category: AudioCategory): number {
    if (category === 'master') return this.config.masterVolume;
    return this.config[category + 'Volume' as keyof AudioConfig] as number;
  }

  setListenerPosition(position: [number, number, number], orientation: [number, number, number, number, number, number] = [0, 0, -1, 0, 1, 0]): void {
    if (!this.audioContext?.listener) return;
    const listener = this.audioContext.listener;
    if (listener.positionX) {
      listener.positionX.value = position[0];
      listener.positionY.value = position[1];
      listener.positionZ.value = position[2];
      listener.forwardX.value = orientation[0];
      listener.forwardY.value = orientation[1];
      listener.forwardZ.value = orientation[2];
      listener.upX.value = orientation[3];
      listener.upY.value = orientation[4];
      listener.upZ.value = orientation[5];
    } else {
      listener.setPosition(position[0], position[1], position[2]);
      listener.setOrientation(orientation[0], orientation[1], orientation[2], orientation[3], orientation[4], orientation[5]);
    }
  }

  createProceduralSound(type: 'blip' | 'footstep' | 'heartbeat' | 'static' | 'whisper' | 'breath', options: {
    frequency?: number;
    duration?: number;
    volume?: number;
    category?: AudioCategory;
  } = {}): AudioBuffer | null {
    if (!this.audioContext) return null;

    const sampleRate = this.audioContext.sampleRate;
    const duration = options.duration ?? 0.1;
    const length = Math.ceil(sampleRate * duration);
    const buffer = this.audioContext.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    switch (type) {
      case 'blip': {
        const freq = options.frequency ?? 800;
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const envelope = Math.exp(-t * 30);
          data[i] = Math.sin(2 * Math.PI * freq * t) * envelope * 0.3;
        }
        break;
      }
      case 'footstep': {
        for (let i = 0; i < length; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * 0.05)) * 0.2;
        }
        break;
      }
      case 'heartbeat': {
        const freq = 60;
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const beat = Math.sin(2 * Math.PI * freq * t);
          const envelope = Math.exp(-t * 10);
          data[i] = beat * envelope * 0.4;
        }
        break;
      }
      case 'static': {
        for (let i = 0; i < length; i++) {
          data[i] = (Math.random() * 2 - 1) * 0.1;
        }
        break;
      }
      case 'whisper': {
        for (let i = 0; i < length; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * 0.3)) * 0.15;
        }
        break;
      }
      case 'breath': {
        const breathDuration = options.duration ?? 1.2;
        const breathLength = Math.ceil(sampleRate * breathDuration);
        for (let i = 0; i < length && i < breathLength; i++) {
          const t = i / sampleRate;
          const env = Math.sin((Math.PI * t) / breathDuration);
          data[i] = ((Math.random() * 2 - 1) * 0.4 + Math.sin(2 * Math.PI * 180 * t) * 0.05) * env * 0.25;
        }
        break;
      }
    }
    return buffer;
  }

  playProcedural(type: 'blip' | 'footstep' | 'heartbeat' | 'static' | 'whisper' | 'breath', options: {
    category?: AudioCategory;
    volume?: number;
    spatial?: boolean;
    position?: [number, number, number];
    loop?: boolean;
  } = {}): string | null {
    // Rekaman asli yang sudah di-preload diprioritaskan; sintesis hanya fallback.
    const recorded = type === 'blip' ? null : this.buffers.get(type) ?? null;
    const buffer = recorded ?? this.createProceduralSound(type, options);
    if (!buffer || !this.audioContext) return null;

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    const category = options.category ?? 'sfx';
    if (options.loop) this.stopAll(category, 0.4);
    const gainNode = this.categoryGains.get(category) || this.masterGain!;
    const localGain = this.audioContext.createGain();
    localGain.gain.value = options.volume ?? 1;
    localGain.connect(gainNode);
    source.connect(localGain);

    const sourceId = `proc_${type}_${Date.now()}`;
    this.sources.set(sourceId, { source, gain: localGain, category });
    source.onended = () => this.sources.delete(sourceId);
    if (options.loop) source.loop = true;
    source.start(0);
    return sourceId;
  }

  suspend(): void {
    if (this.audioContext && this.audioContext.state !== 'suspended') {
      this.audioContext.suspend();
      this.suspended = true;
    }
  }

  resume(): void {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
      this.suspended = false;
    }
  }

  getState(): 'running' | 'suspended' | 'closed' | 'interrupted' {
    return this.audioContext?.state ?? 'closed';
  }

  subscribe(listener: (config: AudioConfig) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getConfig(): Readonly<AudioConfig> {
    return { ...this.config };
  }

  private notify(): void {
    this.listeners.forEach(l => l({ ...this.config }));
  }

  async dispose(): Promise<void> {
    this.stopAll();
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
  }
}

export const audioManager = new AudioManager();