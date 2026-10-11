export interface GraphicsSettings {
  preset: 'low' | 'medium' | 'high' | 'custom';
  /** Tinggi render internal. `0` = seukuran tampilan (tajam, 1:1). */
  internalResolution: 0 | 240 | 360 | 480 | 720 | 1080;
  vertexJitter: number;
  dithering: boolean;
  colorQuantization: boolean;
  scanlines: boolean;
  grain: boolean;
  fogDistance: number;
  fov: number;
  brightness: number;
  maxFps: 30 | 60 | 0;
  vsync: boolean;
  /**
   * Versi gaya render yang tersimpan di localStorage. Dinaikkan bila tampilan
   * berubah mendasar supaya setelan lama (mis. resolusi 360p) bisa dimigrasi
   * sekali ke nilai baru, bukan terus memakai preset lama.
   */
  styleVersion: number;
}

export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  ambience: number;
  dialogBlip: number;
  muteOnBlur: boolean;
}

export interface ControlSettings {
  mouseSensitivity: number;
  touchSensitivity: number;
  invertY: boolean;
  runToggle: boolean;
  keyBindings: Record<string, string>;
  joystickSize: number;
  joystickPosition: 'left' | 'right';
  /** HUD daftar petunjuk tombol kontekstual di sisi kanan layar. */
  showKeyHints: boolean;
}

export interface TextSettings {
  fontSize: number;
  typeSpeed: number;
  autoPlay: boolean;
  textBackground: boolean;
  dialogHistory: boolean;
}

export interface AccessibilitySettings {
  reduceFlashing: boolean;
  reduceCameraShake: boolean;
  softHorror: boolean;
  highContrast: boolean;
  colorBlindFriendly: boolean;
  puzzleHintLevel: 'none' | 'low' | 'medium' | 'high';
  /**
   * Mode Naratif: pemain datang demi cerita. Timer puzzle disembunyikan,
   * tombol petunjuk langsung terbuka, dan peristiwa tegangan acak dilewati.
   */
  narrativeMode: boolean;
}

export interface GameSettings {
  graphics: GraphicsSettings;
  audio: AudioSettings;
  controls: ControlSettings;
  text: TextSettings;
  accessibility: AccessibilitySettings;
  language: 'id' | 'en';
}

/**
 * Versi gaya render. Naikkan bila tampilan berubah secara mendasar sehingga
 * setelan yang sudah tersimpan di localStorage perlu dimigrasi sekali.
 *
 * v2: render internal naik ke ukuran tampilan (dulu 360p → gambar burik).
 */
export const GRAPHICS_STYLE_VERSION = 2;

export const DEFAULT_SETTINGS: GameSettings = {
  graphics: {
    preset: 'medium',
    internalResolution: 0,
    vertexJitter: 0.3,
    dithering: true,
    colorQuantization: true,
    scanlines: false,
    grain: true,
    fogDistance: 80,
    fov: 75,
    brightness: 1.0,
    maxFps: 60,
    vsync: true,
    styleVersion: GRAPHICS_STYLE_VERSION
  },
  audio: {
    master: 0.8,
    music: 0.7,
    sfx: 0.8,
    ambience: 0.6,
    dialogBlip: 0.5,
    muteOnBlur: true
  },
  controls: {
    mouseSensitivity: 0.002,
    touchSensitivity: 1.0,
    invertY: false,
    runToggle: false,
    keyBindings: {
      forward: 'KeyW',
      backward: 'KeyS',
      left: 'KeyA',
      right: 'KeyD',
      run: 'ShiftLeft',
      crouch: 'ControlLeft',
      interact: 'KeyE',
      flashlight: 'KeyF',
      phone: 'KeyQ',
      journal: 'Tab',
      pause: 'Escape'
    },
    joystickSize: 120,
    joystickPosition: 'left',
    showKeyHints: true
  },
  text: {
    fontSize: 16,
    typeSpeed: 30,
    autoPlay: false,
    textBackground: true,
    dialogHistory: true
  },
  accessibility: {
    reduceFlashing: false,
    reduceCameraShake: false,
    softHorror: false,
    highContrast: false,
    colorBlindFriendly: false,
    puzzleHintLevel: 'medium',
    narrativeMode: false
  },
  language: 'id'
};

export class SettingsManager {
  private settings: GameSettings;
  private listeners: Set<(settings: GameSettings) => void> = new Set();
  private storageKey = 'asap-settings';

  constructor() {
    this.settings = this.load();
    if (this.pendingSave) this.save();
  }

  private pendingSave = false;

  getSettings(): Readonly<GameSettings> {
    return this.settings;
  }

  get<K extends keyof GameSettings>(category: K): GameSettings[K] {
    return this.settings[category];
  }

  update<K extends keyof GameSettings>(category: K, partial: Partial<GameSettings[K]>): void {
    const current = this.settings[category];
    if (current && typeof current === 'object') {
      this.settings[category] = { ...(current as object), ...partial } as GameSettings[K];
    } else {
      this.settings[category] = partial as GameSettings[K];
    }
    this.save();
    this.notify();
  }

  updateGraphics(partial: Partial<GraphicsSettings>): void {
    this.update('graphics', partial);
    if (partial.preset && partial.preset !== 'custom') {
      this.applyPreset(partial.preset);
    }
  }

  private applyPreset(preset: Exclude<GraphicsSettings['preset'], 'custom'>): void {
    const presets: Record<Exclude<GraphicsSettings['preset'], 'custom'>, Partial<GraphicsSettings>> = {
      // Preset lama memakai resolusi internal 240-480 yang membuat gambar
      // burik. Sekarang preset menentukan efek, bukan mempertajam/mengaburkan:
      // hanya "low" yang masih menurunkan resolusi demi GPU lemah.
      low: { internalResolution: 480, vertexJitter: 0.5, dithering: true, colorQuantization: true, scanlines: false, grain: true, fogDistance: 50, fov: 70 },
      medium: { internalResolution: 0, vertexJitter: 0.3, dithering: true, colorQuantization: true, scanlines: false, grain: true, fogDistance: 80, fov: 75 },
      high: { internalResolution: 0, vertexJitter: 0.15, dithering: true, colorQuantization: false, scanlines: false, grain: false, fogDistance: 120, fov: 80 }
    };
    if (presets[preset]) {
      this.settings.graphics = { ...this.settings.graphics, ...presets[preset], preset };
      this.save();
      this.notify();
    }
  }

  setLanguage(lang: 'id' | 'en'): void {
    this.settings.language = lang;
    this.save();
    this.notify();
  }

  reset(): void {
    this.settings = { ...DEFAULT_SETTINGS };
    this.save();
    this.notify();
  }

  exportSettings(): string {
    return JSON.stringify(this.settings, null, 2);
  }

  importSettings(json: string): boolean {
    try {
      const imported = JSON.parse(json);
      this.settings = this.mergeDeep(DEFAULT_SETTINGS, imported);
      this.save();
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  private mergeDeep(target: any, source: any): any {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.mergeDeep(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  subscribe(listener: (settings: GameSettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach(l => l(this.settings));
  }

  private load(): GameSettings {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const raw = JSON.parse(stored);
        const merged = this.mergeDeep(DEFAULT_SETTINGS, raw);
        this.sanitize(merged);
        // `mergeDeep` mengisi nilai default untuk semua field yang hilang, jadi
        // versi harus dibaca dari data mentah. Kalau tidak, setelan lama otomatis
        // dianggap sudah versi terbaru dan tidak pernah dimigrasi.
        const storedVersion = Number(raw?.graphics?.styleVersion ?? 0);
        if (storedVersion < GRAPHICS_STYLE_VERSION) {
          this.migrateGraphicsStyle(merged.graphics);
          this.pendingSave = true;
        }
        return merged;
      }
    } catch {
      // Ignore parse errors
    }
    return { ...DEFAULT_SETTINGS };
  }

  /**
   * Setelan yang tersimpan sebelumnya memakai resolusi internal 240-480p -
   * itulah sumber tampilan "burik". Naikkan sekali ke ukuran tampilan penuh.
   * Pemain yang memang butuh render lebih ringan bisa menurunkannya lagi
   * lewat layar Pengaturan, dan pilihan itu tetap tersimpan.
   */
  private migrateGraphicsStyle(g: GraphicsSettings): void {
    g.internalResolution = g.preset === 'low' ? 480 : 0;
    g.scanlines = false;
    g.styleVersion = GRAPHICS_STYLE_VERSION;
  }

  private sanitize(settings: GameSettings): void {
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof GameSettings)[]) {
      const fallback = DEFAULT_SETTINGS[key];
      const value = settings[key];
      const typeMismatch =
        (typeof fallback === 'string' || typeof fallback === 'number' || typeof fallback === 'boolean') &&
        typeof value !== typeof fallback;
      if (typeMismatch || value === null || value === undefined) {
        (settings as any)[key] = fallback;
      }
    }
    if (settings.language !== 'id' && settings.language !== 'en') {
      settings.language = DEFAULT_SETTINGS.language;
    }
  }

  private save(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.settings));
    } catch {
      // Ignore quota errors
    }
  }
}

export const settingsManager = new SettingsManager();