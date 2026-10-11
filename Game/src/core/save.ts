export interface SaveData {
  saveVersion: number;
  createdAt: string;
  playtimeSec: number;
  location: {
    hari: number;
    jam: string;
    babak: string;
    sceneId: string;
    pos: [number, number, number];
    yaw: number;
  };
  pov: 'dimas' | 'raka';
  vars: GameVariables;
  flags: Record<string, boolean>;
  clues: string[];
  inventory: string[];
  echo: Record<string, boolean>;
  endingsUnlocked: string[];
  checksum: string;
  id?: string;
  /**
   * Bab yang sedang bermain. Tidak ada bila save ditulis sebelum bab pertama
   * dimuat (mis. autosave sisa "permainan baru"): save begitu tak bisa
   * dilanjutkan.
   */
  currentChapter?: string | null;
}

export interface GameVariables {
  terimaRudi: boolean;
  investigasi: number;
  buktiKalung: boolean;
  buktiCukong: boolean;
  empatiB15: boolean;
  empatiPoin: number;
  nurani: number;
  percayaDimas: number;
  konfrontasiDini: boolean;
  percayaRudi: boolean;
  joyDitemui: boolean;
  b20Pilihan: 'selamatkan_lapor' | 'diam' | 'biarkan' | '';
  keyakinan: number;
}

export const DEFAULT_VARIABLES: GameVariables = {
  terimaRudi: false,
  investigasi: 0,
  buktiKalung: false,
  buktiCukong: false,
  empatiB15: false,
  empatiPoin: 0,
  nurani: 0,
  percayaDimas: 3,
  konfrontasiDini: false,
  percayaRudi: false,
  joyDitemui: false,
  b20Pilihan: '',
  keyakinan: 0
};

export interface SaveSlot {
  id: string;
  label: string;
  data: SaveData | null;
  thumbnail?: string;
  timestamp: number;
}

const SAVE_VERSION = 1;
const DB_NAME = 'AsapYangTakPadam';
const STORE_NAME = 'saves';
const THUMBNAIL_STORE = 'thumbnails';
const DB_VERSION = 1;

export class SaveManager {
  private db: IDBDatabase | null = null;
  private currentSlot: string | null = null;
  private autoSaveEnabled = true;
  private playtimeStart = Date.now();
  private playtimeAccumulated = 0;
  private saveInterval: number | null = null;

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(THUMBNAIL_STORE)) {
          db.createObjectStore(THUMBNAIL_STORE, { keyPath: 'id' });
        }
      };
    });
  }

  async createSave(data: Omit<SaveData, 'saveVersion' | 'createdAt' | 'checksum'>, slotId: string): Promise<void> {
    const saveData: SaveData = {
      ...data,
      saveVersion: SAVE_VERSION,
      createdAt: new Date().toISOString(),
      checksum: this.generateChecksum(data)
    };
    await this.put(slotId, saveData);
    this.currentSlot = slotId;
  }

  async autoSave(data: Omit<SaveData, 'saveVersion' | 'createdAt' | 'checksum'>): Promise<void> {
    if (!this.autoSaveEnabled) return;
    await this.createSave(data, 'autosave');
  }

  async saveToSlot(slotId: string, data: Omit<SaveData, 'saveVersion' | 'createdAt' | 'checksum'>): Promise<void> {
    await this.createSave(data, slotId);
  }

  async loadSlot(slotId: string): Promise<SaveData | null> {
    return this.get(slotId);
  }

  async getAllSaves(): Promise<SaveSlot[]> {
    if (!this.db) await this.initialize();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const saves: SaveSlot[] = request.result.map((save: SaveData) => {
          const raw = save as any;
          const where = [raw.hari ?? raw.location?.hari ?? '', raw.jam ?? raw.location?.jam ?? '']
            .filter(part => part !== '' && part !== undefined && part !== null)
            .join(' ');
          const pov = raw.pov ? String(raw.pov).toUpperCase() : '';
          return {
            id: save.id || 'unknown',
            label: where ? `${where}${pov ? ' (' + pov + ')' : ''}` : (raw.currentChapter || 'save'),
            data: save,
            timestamp: new Date(save.createdAt).getTime()
          };
        });
        resolve(saves.sort((a, b) => b.timestamp - a.timestamp));
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save yang dipakai tombol "Lanjutkan": save terbaru yang benar-benar bisa
   * dilanjutkan (punya bab). Save tanpa `currentChapter`: misal autosave yang
   * ditulis saat permainan baru sebelum bab pertama dimuat: akan menaruh
   * pemain di dunia kosong, jadi dilewati.
   */
  async getContinueSave(): Promise<SaveSlot | null> {
    const saves = await this.getAllSaves();
    return saves.find(s => !!s?.data?.currentChapter) ?? null;
  }

  async deleteSlot(slotId: string): Promise<void> {
    if (!this.db) await this.initialize();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(slotId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async exportSave(slotId: string): Promise<string | null> {
    const save = await this.get(slotId);
    if (!save) return null;
    return JSON.stringify(save, null, 2);
  }

  async importSave(json: string, slotId: string): Promise<boolean> {
    try {
      const save = JSON.parse(json) as SaveData;
      if (!this.validateSave(save)) return false;
      await this.put(slotId, save);
      return true;
    } catch {
      return false;
    }
  }

  startPlaytimeTracking(): void {
    this.playtimeStart = Date.now();
    this.saveInterval = window.setInterval(() => {
      this.playtimeAccumulated += Date.now() - this.playtimeStart;
      this.playtimeStart = Date.now();
    }, 5000);
  }

  stopPlaytimeTracking(): number {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
    this.playtimeAccumulated += Date.now() - this.playtimeStart;
    return Math.floor(this.playtimeAccumulated / 1000);
  }

  getPlaytime(): number {
    return Math.floor((this.playtimeAccumulated + (Date.now() - this.playtimeStart)) / 1000);
  }

  setAutoSave(enabled: boolean): void {
    this.autoSaveEnabled = enabled;
  }

  getCurrentSlot(): string | null {
    return this.currentSlot;
  }

  private async put(id: string, data: SaveData): Promise<void> {
    if (!this.db) await this.initialize();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put({ ...data, id });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async get(id: string): Promise<SaveData | null> {
    if (!this.db) await this.initialize();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  private generateChecksum(data: Omit<SaveData, 'saveVersion' | 'createdAt' | 'checksum'>): string {
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  private validateSave(save: SaveData): boolean {
    if (!save || save.saveVersion !== SAVE_VERSION) return false;
    if (typeof save.createdAt !== 'string') return false;
    const raw = save as any;
    if (!raw.currentChapter || !Array.isArray(raw.clues) || !Array.isArray(raw.inventory)) return false;
    return true;
  }
}

export const saveManager = new SaveManager();