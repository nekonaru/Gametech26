export type EventCallback<T = unknown> = (data: T) => void;

export class EventBus {
  private events: Map<string, Set<EventCallback<any>>> = new Map();

  on<T = unknown>(event: string, callback: EventCallback<T>): () => void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(callback as EventCallback<any>);
    return () => this.off(event, callback);
  }

  off<T = unknown>(event: string, callback: EventCallback<T>): void {
    this.events.get(event)?.delete(callback as EventCallback<any>);
  }

  emit<T = unknown>(event: string, data: T): void {
    const listeners = this.events.get(event);
    if (!listeners) return;
    // Disalin dulu: pendengar boleh menambah/menghapus listener selama iterasi
    // (mis. dialog yang membuka overlay lain) tanpa memutus rangkaian.
    for (const cb of Array.from(listeners)) {
      try {
        cb(data);
      } catch (error) {
        // Satu pendengar yang melempar error tidak boleh mematikan rangkaian
        // frame. Tanpa isolasi ini error merambat ke Engine.animate() yang sudah
        // menjadwalkan frame berikutnya: render() tidak pernah terpanggil lagi
        // dan layar membeku selamanya sementara requestAnimationFrame tetap
        // hidup: gejala "karakter dan kamera macet total".
        console.error(`[events] listener "${event}" melempar error:`, error);
      }
    }
  }

  clear(event?: string): void {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
  }
}

export const eventBus = new EventBus();

export const GameEvents = {
  SCENE_LOAD_START: 'scene:load:start',
  SCENE_LOAD_PROGRESS: 'scene:load:progress',
  SCENE_LOAD_COMPLETE: 'scene:load:complete',
  SCENE_UNLOAD: 'scene:unload',
  CHAPTER_START: 'chapter:start',
  CHAPTER_COMPLETE: 'chapter:complete',
  DIALOG_START: 'dialog:start',
  DIALOG_END: 'dialog:end',
  DIALOG_CHOICE: 'dialog:choice',
  CLUE_FOUND: 'clue:found',
  VARIABLE_CHANGED: 'variable:changed',
  SETTINGS_CHANGED: 'settings:changed',
  LANGUAGE_CHANGED: 'language:changed',
  SAVE_GAME: 'save:game',
  LOAD_GAME: 'load:game',
  GAME_PAUSE: 'game:pause',
  GAME_RESUME: 'game:resume',
  TENSION_CHANGED: 'tension:changed',
  ENDING_REACHED: 'ending:reached',
  INPUT_LOCK: 'input:lock',
  INPUT_UNLOCK: 'input:unlock'
} as const;