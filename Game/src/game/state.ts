export interface GameState {
  currentChapter: string | null;
  previousChapter: string | null;
  pov: 'dimas' | 'raka';
  hari: number;
  jam: string;
  location: {
    sceneId: string;
    pos: [number, number, number];
    yaw: number;
  };
  variables: GameVariables;
  flags: Record<string, boolean>;
  clues: string[];
  inventory: string[];
  echo: Record<string, boolean>;
  playtime: number;
  endingsUnlocked: string[];
  currentDialog: string | null;
  inDialog: boolean;
  inPuzzle: boolean;
  inPhone: boolean;
  inJournal: boolean;
  gameStarted: boolean;
  contentWarningAccepted: boolean;
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

export class GameStateManager {
  private state: GameState;
  private listeners: Set<(state: GameState) => void> = new Set();
  private history: GameState[] = [];
  private maxHistory = 50;

  constructor() {
    this.state = this.getDefaultState();
  }

  private getDefaultState(): GameState {
    return {
      currentChapter: null,
      previousChapter: null,
      pov: 'dimas',
      hari: 1,
      jam: '07:00',
      location: {
        sceneId: 'rumah_dimas',
        pos: [0, 0, 0],
        yaw: 0
      },
      variables: { ...DEFAULT_VARIABLES },
      flags: {},
      clues: [],
      inventory: ['ponsel'],
      echo: {},
      playtime: 0,
      endingsUnlocked: [],
      currentDialog: null,
      inDialog: false,
      inPuzzle: false,
      inPhone: false,
      inJournal: false,
      gameStarted: false,
      contentWarningAccepted: false
    };
  }

  getState(): Readonly<GameState> {
    return this.state;
  }

  get<K extends keyof GameState>(key: K): GameState[K] {
    return this.state[key];
  }

  set<K extends keyof GameState>(key: K, value: GameState[K]): void {
    this.saveToHistory();
    (this.state as any)[key] = value;
    this.notify();
  }

  update(partial: Partial<GameState>): void {
    this.saveToHistory();
    Object.assign(this.state, partial);
    this.notify();
  }

  setVariable(name: keyof GameVariables, value: any): void {
    this.saveToHistory();
    (this.state.variables as any)[name] = value;
    this.notify();
  }

  getVariable(name: keyof GameVariables): any {
    return this.state.variables[name];
  }

  addFlag(flag: string, value = true): void {
    this.saveToHistory();
    this.state.flags[flag] = value;
    this.notify();
  }

  getFlag(flag: string): boolean {
    return !!this.state.flags[flag];
  }

  addClue(clueId: string): void {
    if (!this.state.clues.includes(clueId)) {
      this.saveToHistory();
      this.state.clues.push(clueId);
      this.notify();
    }
  }

  hasClue(clueId: string): boolean {
    return this.state.clues.includes(clueId);
  }

  addInventory(item: string): void {
    if (!this.state.inventory.includes(item)) {
      this.saveToHistory();
      this.state.inventory.push(item);
      this.notify();
    }
  }

  removeInventory(item: string): void {
    const idx = this.state.inventory.indexOf(item);
    if (idx >= 0) {
      this.saveToHistory();
      this.state.inventory.splice(idx, 1);
      this.notify();
    }
  }

  hasInventory(item: string): boolean {
    return this.state.inventory.includes(item);
  }

  setEcho(key: string, value: boolean): void {
    this.saveToHistory();
    this.state.echo[key] = value;
    this.notify();
  }

  getEcho(key: string): boolean {
    return !!this.state.echo[key];
  }

  addPlaytime(seconds: number): void {
    this.state.playtime += seconds;
  }

  unlockEnding(endingId: string): void {
    if (!this.state.endingsUnlocked.includes(endingId)) {
      this.state.endingsUnlocked.push(endingId);
      this.notify();
    }
  }

  hasEnding(endingId: string): boolean {
    return this.state.endingsUnlocked.includes(endingId);
  }

  startChapter(chapterId: string, data: { hari: number; jam: string; pov: 'dimas' | 'raka'; sceneId: string; pos: [number, number, number]; yaw: number }): void {
    this.saveToHistory();
    this.state.previousChapter = this.state.currentChapter;
    this.state.currentChapter = chapterId;
    this.state.hari = data.hari;
    this.state.jam = data.jam;
    this.state.pov = data.pov;
    this.state.location = data;
    this.state.gameStarted = true;
    this.notify();
  }

  private saveToHistory(): void {
    this.history.push(JSON.parse(JSON.stringify(this.state)));
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  undo(): boolean {
    if (this.history.length > 0) {
      this.state = this.history.pop()!;
      this.notify();
      return true;
    }
    return false;
  }

  reset(): void {
    this.state = this.getDefaultState();
    this.history = [];
    this.notify();
  }

  subscribe(listener: (state: GameState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach(l => l(this.state));
  }

  serialize(): string {
    return JSON.stringify(this.state);
  }

  deserialize(json: string): void {
    this.state = JSON.parse(json);
    this.notify();
  }
}

export const gameState = new GameStateManager();