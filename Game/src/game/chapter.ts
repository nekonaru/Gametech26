import { eventBus, GameEvents } from '../core/events.js';
import { gameState } from './state.js';
import { scriptRunner } from './scriptRunner.js';
import { saveManager } from '../core/save.js';

export interface ChapterData {
  id: string;
  name: string;
  hari: number;
  jam: string;
  pov: 'dimas' | 'raka';
  sceneId: string;
  pos: [number, number, number];
  yaw: number;
  completed: boolean;
  cluesFound: number;
  available: boolean;
  /**
   * Cabang alternatif (bukan bagian alur linear). Bab seperti ini hanya bisa
   * dicapai lewat opsi `loadScene` di dalam naskah, jadi tidak pernah menjadi
   * "bab berikutnya" setelah bab linear selesai.
   */
  branch?: boolean;
}

export class ChapterManager {
  private chapters: ChapterData[] = [];
  private currentChapterIndex = -1;
  private chapterDefinitions: Map<string, ChapterData> = new Map();
  private autoSaveEnabled = true;

  constructor() {
    this.initializeChapters();
    eventBus.on(GameEvents.CHAPTER_START, this.onChapterStart.bind(this));
    eventBus.on(GameEvents.CHAPTER_COMPLETE, this.onChapterComplete.bind(this));
    eventBus.on('chapter:select', this.selectChapter.bind(this));
    eventBus.on('chapter:next', this.nextChapter.bind(this));
  }

  private initializeChapters(): void {
    const defs: ChapterData[] = [
      { id: 'b01', name: 'Tagihan', hari: 1, jam: '07:00', pov: 'dimas', sceneId: 'rumah_dimas', pos: [0, 0, 0], yaw: 0, completed: false, cluesFound: 0, available: true },
      { id: 'b02', name: 'Kedai Kopi', hari: 1, jam: '16:00', pov: 'dimas', sceneId: 'kedai_kopi', pos: [0, 0, 0], yaw: 0, completed: false, cluesFound: 0, available: false },
      { id: 'b03', name: 'Bus Pulang', hari: 1, jam: '15:00', pov: 'raka', sceneId: 'bus', pos: [0, 0, 0], yaw: 0, completed: false, cluesFound: 0, available: false },
      { id: 'b04', name: 'Rumah Kosong', hari: 1, jam: '17:30', pov: 'raka', sceneId: 'rumah_dimas', pos: [0, 0, 0], yaw: 0, completed: false, cluesFound: 0, available: false },
      { id: 'b05', name: 'Warung dan Gosip', hari: 1, jam: '19:00', pov: 'raka', sceneId: 'warung_mak_yah', pos: [0, 0, 0], yaw: 0, completed: false, cluesFound: 0, available: false },
      { id: 'b05b', name: 'Makan Malam Berdua', hari: 1, jam: '20:30', pov: 'raka', sceneId: 'rumah_dimas', pos: [0, 0, 0], yaw: 0, completed: false, cluesFound: 0, available: false },
      { id: 'b06', name: 'Tawaran Kedua', hari: 1, jam: '23:00', pov: 'dimas', sceneId: 'rumah_dimas', pos: [0, 0, 0], yaw: 0, completed: false, cluesFound: 0, available: false },
      { id: 'b07', name: 'Briefing', hari: 2, jam: '10:00', pov: 'dimas', sceneId: 'gubuk_briefing', pos: [0, 0, 0], yaw: 0, completed: false, cluesFound: 0, available: false },
      { id: 'b08', name: 'Malam Pertama', hari: 2, jam: '22:00', pov: 'dimas', sceneId: 'hutan_kecil', pos: [0, 0, 0], yaw: 0, completed: false, cluesFound: 0, available: false },
      { id: 'b09', name: 'Curiga Pertama', hari: 3, jam: '07:00', pov: 'raka', sceneId: 'jalan_desa', pos: [0, 0, 0], yaw: 0, completed: false, cluesFound: 0, available: false },
      { id: 'b10', name: 'Ladang Joy', hari: 3, jam: '22:30', pov: 'dimas', sceneId: 'ladang_joy', pos: [0, 0, 0], yaw: 0, completed: false, cluesFound: 0, available: false },
      { id: 'b11', name: 'Berita yang Tenggelam', hari: 4, jam: '09:00', pov: 'raka', sceneId: 'balai_desa', pos: [0, 0, 0], yaw: 0, completed: false, cluesFound: 0, available: false },
      { id: 'b12b', name: 'Titik Terakhir', hari: 4, jam: '22:00', pov: 'dimas', sceneId: 'tepi_hutan', pos: [0, 0, 0], yaw: 0, completed: false, cluesFound: 0, available: false },
      { id: 'b12', name: 'Teror Kecil', hari: 5, jam: '02:30', pov: 'dimas', sceneId: 'rumah_dimas', pos: [0, 0, 0], yaw: 0, completed: false, cluesFound: 0, available: false },
      { id: 'b13', name: 'Jejak yang Menumpuk', hari: 5, jam: '11:00', pov: 'raka', sceneId: 'rumah_dimas', pos: [0, 0, 0], yaw: 0, completed: false, cluesFound: 0, available: false },
      { id: 'b14', name: 'Teror Membesar', hari: 5, jam: '23:00', pov: 'dimas', sceneId: 'rumah_dimas', pos: [0, 0, 0], yaw: 0, completed: false, cluesFound: 0, available: false },
      { id: 'b15', name: 'Konfrontasi Kecil', hari: 6, jam: '10:00', pov: 'raka', sceneId: 'rumah_dimas', pos: [0, 0, 0], yaw: 0, completed: false, cluesFound: 0, available: false },
      { id: 'b16', name: 'Barang Bukti Tertinggal', hari: 6, jam: '21:00', pov: 'dimas', sceneId: 'tepi_hutan', pos: [0, 0, 0], yaw: 0, completed: false, cluesFound: 0, available: false },
      { id: 'b17', name: 'Patroli Warga', hari: 6, jam: '22:00', pov: 'dimas', sceneId: 'jalan_desa', pos: [0, 0, 0], yaw: 0, completed: false, cluesFound: 0, available: false },
      { id: 'b18', name: 'Kepingan Terakhir', hari: 7, jam: '08:00', pov: 'raka', sceneId: 'tepi_hutan', pos: [0, 0, 0], yaw: 0, completed: false, cluesFound: 0, available: false },
      { id: 'b19', name: 'Jebakan Arwah', hari: 7, jam: '20:00', pov: 'dimas', sceneId: 'hutan_berputar', pos: [0, 0, 0], yaw: 0, completed: false, cluesFound: 0, available: false },
      { id: 'b20', name: 'Pilihan Akhir', hari: 7, jam: '21:00', pov: 'raka', sceneId: 'hutan_api', pos: [0, 0, 0], yaw: 0, completed: false, cluesFound: 0, available: false },
      { id: 'b15alt', name: 'Terlambat Sedikit', hari: 6, jam: '10:00', pov: 'raka', sceneId: 'jalan_desa', pos: [0, 0, 0], yaw: 0, completed: false, cluesFound: 0, available: false, branch: true }
    ];

    defs.forEach(d => this.chapterDefinitions.set(d.id, { ...d }));
    this.chapters = [...defs];
  }

  private onChapterStart(data: { chapterId: string }): void {
    const chapter = this.chapters.find(c => c.id === data.chapterId);
    if (chapter) {
      chapter.completed = false;
      this.currentChapterIndex = this.chapters.findIndex(c => c.id === data.chapterId);
      this.unlockNextChapter();
      // Save the moment a chapter becomes playable so closing the tab mid-bab
      // (or after a brand-new game) never leaves "Lanjutkan" pointing at a save
      // that has no chapter to resume.
      void this.autoSave();
    }
  }

  private onChapterComplete(data: { chapterId: string; cluesFound: number }): void {
    const chapter = this.chapters.find(c => c.id === data.chapterId);
    if (chapter) {
      chapter.completed = true;
      chapter.cluesFound = data.cluesFound;
      this.unlockNextChapter();
      this.autoSave();
    }
  }

  private unlockNextChapter(): void {
    const nextChapter = this.nextLinearChapter(this.currentChapterIndex);
    if (nextChapter) {
      nextChapter.available = true;
    }
  }

  /**
   * Bab linear berikutnya setelah indeks yang diberikan: selalu melompati
   * bab cabang (branch) supaya menyelesaikan bab terakhir tidak salah lanjut
   * ke bab cabang yang mengakhiri cerita.
   */
  private nextLinearChapter(fromIndex: number): ChapterData | undefined {
    return this.chapters.slice(fromIndex + 1).find(c => !c.branch);
  }

  /** Bab linear berikutnya setelah bab tertentu; undefined bila sudah terakhir. */
  getNextChapterAfter(chapterId: string): ChapterData | undefined {
    const index = this.chapters.findIndex(c => c.id === chapterId);
    if (index < 0) return undefined;
    return this.nextLinearChapter(index);
  }

  getChapters(): ChapterData[] {
    return [...this.chapters];
  }

  getCurrentChapter(): ChapterData | null {
    if (this.currentChapterIndex >= 0) {
      return this.chapters[this.currentChapterIndex];
    }
    return null;
  }

  getChapter(id: string): ChapterData | undefined {
    return this.chapters.find(c => c.id === id);
  }

  getAvailableChapters(): ChapterData[] {
    return this.chapters.filter(c => c.available || c.completed);
  }

  async selectChapter(chapterId: string): Promise<void> {
    const chapter = this.chapters.find(c => c.id === chapterId);
    if (!chapter || (!chapter.available && !chapter.completed)) return;

    await saveManager.saveToSlot('chapter-select', {
      ...gameState.getState(),
      currentChapter: chapterId,
      hari: chapter.hari,
      jam: chapter.jam,
      pov: chapter.pov,
      location: { sceneId: chapter.sceneId, pos: chapter.pos, yaw: chapter.yaw }
    } as any);

    await scriptRunner.loadChapter(chapterId);
  }

  async nextChapter(): Promise<void> {
    const nextChapter = this.nextLinearChapter(this.currentChapterIndex);
    if (nextChapter && nextChapter.available) {
      await this.selectChapter(nextChapter.id);
    }
  }

  completeCurrentChapter(cluesFound: number): void {
    const chapter = this.getCurrentChapter();
    if (chapter) {
      eventBus.emit(GameEvents.CHAPTER_COMPLETE, { chapterId: chapter.id, cluesFound });
    }
  }

  getProgress(): { completed: number; total: number; current: string | null } {
    const main = this.chapters.filter(c => !c.branch);
    return {
      completed: main.filter(c => c.completed).length,
      total: main.length,
      current: this.getCurrentChapter()?.id || null
    };
  }

  setAutoSave(enabled: boolean): void {
    this.autoSaveEnabled = enabled;
  }

  private autoSave(): void {
    if (!this.autoSaveEnabled) return;
    // Pemicu saja: penulisan state penuh (bab + naskah + jurnal + inventori)
    // ditangani Game lewat listener `save:auto`, termasuk indikator singkat
    // "Tersimpan otomatis" agar pemain tahu progresnya aman.
    eventBus.emit('save:auto', {});
  }

  getChapterSelectData(): Array<{ id: string; name: string; hari: number; jam: string; pov: string; completed: boolean; clues: number }> {
    // Bab cabang tidak ditampilkan: tidak bisa dipilih langsung (hanya lewat
    // alur cerita), jadi menampilkannya hanya membuat daftar penuh entri mati.
    return this.chapters.filter(c => !c.branch).map(c => ({
      id: c.id,
      name: c.name,
      hari: c.hari,
      jam: c.jam,
      pov: c.pov,
      completed: c.completed,
      clues: c.cluesFound
    }));
  }

  serialize(): any {
    return {
      chapters: this.chapters,
      currentChapterIndex: this.currentChapterIndex
    };
  }

  deserialize(data: any): void {
    if (data.chapters) {
      // Save lama tidak menyimpan penanda `branch`; selalu ambil dari definisi
      // supaya bab cabang tetap dikenali dan tidak masuk urutan linear.
      this.chapters = data.chapters.map((c: any) => ({
        ...c,
        branch: this.chapterDefinitions.get(c.id)?.branch
      }));
    }
    if (data.currentChapterIndex !== undefined) {
      this.currentChapterIndex = data.currentChapterIndex;
    }
  }
}

export const chapterManager = new ChapterManager();