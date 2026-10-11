import { eventBus, GameEvents } from '../core/events.js';
import { i18n } from '../core/i18n.js';
import { assetUrl } from '../core/paths.js';

export interface ClueData {
  id: string;
  title: string;
  description: string;
  chapter: string;
  category: 'motive' | 'time' | 'location' | 'victim' | 'physicalEvidence';
  points: number;
  discovered: boolean;
  discoveredAt?: number;
}

export interface NoteData {
  id: string;
  text: string;
  chapter: string;
  timestamp: number;
}

export class JournalManager {
  private clues: Map<string, ClueData> = new Map();
  private notes: NoteData[] = [];
  private clueDefinitions: Map<string, Omit<ClueData, 'discovered' | 'discoveredAt'>> = new Map();

  private rawDefinitions: {
    id: string;
    title_id?: string;
    title_en?: string;
    description_id?: string;
    description_en?: string;
    chapter?: string;
    category?: string;
    points?: number;
  }[] = [];

  constructor() {
    this.initializeClueDefinitions();
    eventBus.on(GameEvents.CLUE_FOUND, this.onClueFound.bind(this));
    eventBus.on('journal:addNote', (data: any) => this.addNote(data.text, data.chapter));
    eventBus.on('journal:open', this.openJournal.bind(this));
    eventBus.on('evidenceBoard:open', this.openEvidenceBoard.bind(this));
    i18n.subscribe(() => this.rebuildDefinitions());
  }

  async loadDefinitions(): Promise<void> {
    try {
      const response = await fetch(assetUrl('data/clues.json'));
      if (response.ok) {
        const data = await response.json();
        const list = Array.isArray(data) ? data : data?.clues;
        if (Array.isArray(list)) this.rawDefinitions = list;
      }
    } catch {
      // clues.json is optional, bundled definitions stay in place
    }
    this.rebuildDefinitions();
  }

  private rebuildDefinitions(): void {
    const discovered = new Map(this.clues);
    this.clueDefinitions.clear();

    if (this.rawDefinitions.length > 0) {
      const locale = i18n.getLocale();
      for (const raw of this.rawDefinitions) {
        if (!raw?.id) continue;
        this.clueDefinitions.set(raw.id, {
          id: raw.id,
          title: (locale === 'en' ? raw.title_en || raw.title_id : raw.title_id || raw.title_en) || raw.id,
          description: (locale === 'en' ? raw.description_en || raw.description_id : raw.description_id || raw.description_en) || '',
          chapter: raw.chapter || '',
          category: (raw.category as ClueData['category']) || 'motive',
          points: typeof raw.points === 'number' ? raw.points : 1
        });
      }
    }

    if (this.clueDefinitions.size === 0) {
      this.initializeClueDefinitions();
    }

    discovered.forEach((clue, id) => {
      const def = this.clueDefinitions.get(id);
      if (def) this.clues.set(id, { ...clue, title: def.title, description: def.description });
    });
  }

  private initializeClueDefinitions(): void {
    const definitions: Omit<ClueData, 'discovered' | 'discoveredAt'>[] = [
      { id: 'c1', title: 'Kwitansi Pinjol', description: 'Tumpukan kwitansi pinjol online dengan bunga tinggi. Nama Dimas tertera sebagai peminjam.', chapter: 'B4', category: 'motive', points: 1 },
      { id: 'c2a', title: 'Lokasi Kebakaran', description: 'Warga membicarakan titik kebakaran di ladang sebelah hutan. Bukan ladang Joy.', chapter: 'B5', category: 'location', points: 1 },
      { id: 'c2b', title: 'Penjaga Ladang Joy', description: 'Joy adalah penjaga ladang titipan keluarga, tinggal sendirian di pondok dekat hutan.', chapter: 'B5', category: 'victim', points: 1 },
      { id: 'c3', title: 'Pola Kebakaran', description: 'Kebakaran terjadi berulang pada malam hari. Pola waktu konsisten.', chapter: 'B9', category: 'time', points: 1 },
      { id: 'c4', title: 'Laporan Kehilangan Joy', description: 'Ibu Joy melapor ke balai desa. Foto Joy memakai kalung bulan sabit.', chapter: 'B11', category: 'victim', points: 1 },
      { id: 'c5', title: 'Rincian Utang', description: 'Struk robek menunjukkan total utang Dimas: 87 juta. Bunga 20% per minggu.', chapter: 'B13', category: 'motive', points: 1 },
      { id: 'c6', title: 'Jadwal Kebakaran & Dimas', description: 'Tiga tanggal kebakaran cocok dengan jam Dimas pulang telat dari "kerja".', chapter: 'B13', category: 'time', points: 1 },
      { id: 'c7', title: 'Bukti Cukong', description: 'Kartu nama perusahaan fiktif "PT Mandiri Lestari" ditemukan di saku jaket Dimas.', chapter: 'B13', category: 'physicalEvidence', points: 0 }
    ];

    definitions.forEach(d => this.clueDefinitions.set(d.id, d));
  }

  private onClueFound(data: { id: string }): void {
    const def = this.clueDefinitions.get(data.id);
    if (def && !this.clues.has(data.id)) {
      const clue: ClueData = {
        ...def,
        discovered: true,
        discoveredAt: Date.now()
      };
      this.clues.set(data.id, clue);
      eventBus.emit('ui:clueAdded', { clue });
    }
  }

  addNote(text: string, chapter: string): void {
    const note: NoteData = {
      id: `note_${Date.now()}`,
      text,
      chapter,
      timestamp: Date.now()
    };
    this.notes.push(note);
    eventBus.emit('ui:noteAdded', { note });
  }

  getClue(id: string): ClueData | undefined {
    return this.clues.get(id);
  }

  getClueTitle(id: string): string {
    return this.clues.get(id)?.title || this.clueDefinitions.get(id)?.title || id;
  }

  getCluePoints(id: string): number {
    const points = this.clueDefinitions.get(id)?.points;
    return typeof points === 'number' ? points : 1;
  }

  getPointsTotal(): number {
    let total = 0;
    this.clueDefinitions.forEach(def => { total += def.points; });
    return total;
  }

  getInvestigasiPoints(): number {
    let total = 0;
    this.clues.forEach((_, id) => { total += this.getCluePoints(id); });
    return Math.min(7, total);
  }

  getAllClues(): ClueData[] {
    return Array.from(this.clues.values()).sort((a, b) => (a.discoveredAt || 0) - (b.discoveredAt || 0));
  }

  getUndiscoveredClues(): string[] {
    return Array.from(this.clueDefinitions.keys()).filter(id => !this.clues.has(id));
  }

  getCluesByCategory(category: ClueData['category']): ClueData[] {
    return this.getAllClues().filter(c => c.category === category);
  }

  getNotes(): NoteData[] {
    return [...this.notes];
  }

  getNotesByChapter(chapter: string): NoteData[] {
    return this.notes.filter(n => n.chapter === chapter);
  }

  getClueCount(): { total: number; discovered: number } {
    return {
      total: this.clueDefinitions.size,
      discovered: this.clues.size
    };
  }

  hasClue(id: string): boolean {
    return this.clues.has(id);
  }

  private openJournal(): void {
    eventBus.emit('ui:openJournal', {
      clues: this.getAllClues(),
      notes: this.getNotes()
    });
  }

  private openEvidenceBoard(): void {
    const categories = ['motive', 'time', 'location', 'victim', 'physicalEvidence'] as const;
    const boardData = categories.map(cat => ({
      category: cat,
      clues: this.getCluesByCategory(cat)
    }));
    eventBus.emit('ui:openEvidenceBoard', { boardData });
  }

  serialize(): any {
    return {
      clues: Array.from(this.clues.entries()),
      notes: this.notes
    };
  }

  deserialize(data: any): void {
    this.clues = new Map(data.clues || []);
    this.notes = data.notes || [];
  }
}

export const journalManager = new JournalManager();