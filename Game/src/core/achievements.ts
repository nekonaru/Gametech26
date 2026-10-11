import { eventBus } from './events.js';

export interface AchievementDef {
  id: string;
  nameKey: string;
  descKey: string;
}

export interface AchievementState extends AchievementDef {
  unlocked: boolean;
}

const ACHIEVEMENT_DEFS: AchievementDef[] = [
  {
    id: 'detektif',
    nameKey: 'achievements.detektif.name',
    descKey: 'achievements.detektif.desc'
  }
];

const REQUIRED_PUZZLES = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
const STORAGE_KEY = 'asap.achievements.profile';

interface AchievementProfile {
  unlocked: string[];
  solved: string[];
  skipped: string[];
}

const createEmptyProfile = (): AchievementProfile => ({ unlocked: [], solved: [], skipped: [] });

/**
 * Global profile stored outside save slots so achievements survive slot deletion.
 */
export class AchievementManager {
  private profile: AchievementProfile = createEmptyProfile();
  private loaded = false;

  load(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        this.profile = {
          unlocked: Array.isArray(parsed.unlocked) ? parsed.unlocked : [],
          solved: Array.isArray(parsed.solved) ? parsed.solved : [],
          skipped: Array.isArray(parsed.skipped) ? parsed.skipped : []
        };
      }
    } catch {
      this.profile = createEmptyProfile();
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
    } catch {
      // storage unavailable, achievements stay session only
    }
  }

  markPuzzleSolved(puzzleId: string): void {
    this.load();
    if (!this.profile.solved.includes(puzzleId)) {
      this.profile.solved.push(puzzleId);
      this.persist();
    }
    this.evaluate();
  }

  markPuzzleSkipped(puzzleId: string): void {
    this.load();
    if (!this.profile.skipped.includes(puzzleId)) {
      this.profile.skipped.push(puzzleId);
      this.persist();
    }
  }

  private evaluate(): void {
    if (this.profile.unlocked.includes('detektif')) return;
    if (this.profile.skipped.length > 0) return;
    const solvedAll = REQUIRED_PUZZLES.every(id => this.profile.solved.includes(id));
    if (solvedAll) this.unlock('detektif');
  }

  unlock(id: string): void {
    this.load();
    if (this.profile.unlocked.includes(id)) return;
    this.profile.unlocked.push(id);
    this.persist();
    eventBus.emit('achievement:unlocked', { id });
  }

  isUnlocked(id: string): boolean {
    this.load();
    return this.profile.unlocked.includes(id);
  }

  get(id: string): AchievementDef | undefined {
    return ACHIEVEMENT_DEFS.find(def => def.id === id);
  }

  getAll(): AchievementState[] {
    this.load();
    return ACHIEVEMENT_DEFS.map(def => ({ ...def, unlocked: this.profile.unlocked.includes(def.id) }));
  }

  reset(): void {
    this.load();
    this.profile = createEmptyProfile();
    this.persist();
  }
}

export const achievementManager = new AchievementManager();
