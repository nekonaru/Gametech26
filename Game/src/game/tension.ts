import { eventBus, GameEvents } from '../core/events.js';
import { gameState } from './state.js';
import { audioManager } from '../core/audio.js';
import { settingsManager } from '../core/settings.js';

export interface HorrorEvent {
  id: string;
  type: 'flicker' | 'shadow' | 'footsteps' | 'whisper' | 'breath' | 'door' | 'temperature' | 'jumpscare';
  intensity: number;
  duration: number;
  cooldown: number;
  conditions: {
    minTension?: number;
    maxTension?: number;
    chapter?: string[];
    pov?: ('dimas' | 'raka')[];
    timeOfDay?: ('day' | 'night')[];
    flags?: Record<string, boolean>;
  };
  execute: () => void;
  lastTriggered?: number;
}

export class TensionDirector {
  private tension = 0;
  private baseTension = 0;
  private events: HorrorEvent[] = [];
  private activeEvents: Set<string> = new Set();
  private lastEventTime = 0;
  private minEventInterval = 90000;
  private breathInterval: number | null = null;
  private enabled = true;
  private softHorror = false;
  private narrative = false;

  constructor() {
    this.initializeEvents();
    eventBus.on('tension:set', this.setTension.bind(this));
    eventBus.on('tension:modify', this.modifyTension.bind(this));
    eventBus.on(GameEvents.CHAPTER_START, this.onChapterStart.bind(this));
    eventBus.on('settings:changed', this.onSettingsChanged.bind(this));
    settingsManager.subscribe(() => this.onSettingsChanged(settingsManager.getSettings()));
  }

  private initializeEvents(): void {
    this.events = [
      {
        id: 'flicker_lights',
        type: 'flicker',
        intensity: 0.3,
        duration: 2000,
        cooldown: 120000,
        conditions: { minTension: 0.2, timeOfDay: ['night'] },
        execute: () => this.executeFlicker()
      },
      {
        id: 'shadow_corner',
        type: 'shadow',
        intensity: 0.4,
        duration: 3000,
        cooldown: 180000,
        conditions: { minTension: 0.3, pov: ['dimas'] },
        execute: () => this.executeShadow()
      },
      {
        id: 'wet_footsteps',
        type: 'footsteps',
        intensity: 0.5,
        duration: 5000,
        cooldown: 150000,
        conditions: { minTension: 0.4, chapter: ['b12', 'b14', 'b16'] },
        execute: () => this.executeFootsteps()
      },
      {
        id: 'whisper_name',
        type: 'whisper',
        intensity: 0.6,
        duration: 4000,
        cooldown: 200000,
        conditions: { minTension: 0.5, pov: ['dimas'] },
        execute: () => this.executeWhisper()
      },
      {
        id: 'cold_breath',
        type: 'breath',
        intensity: 0.4,
        duration: 3000,
        cooldown: 180000,
        conditions: { minTension: 0.3 },
        execute: () => this.executeBreath()
      },
      {
        id: 'door_creak',
        type: 'door',
        intensity: 0.3,
        duration: 2000,
        cooldown: 120000,
        conditions: { minTension: 0.2, timeOfDay: ['night'] },
        execute: () => this.executeDoorCreak()
      },
      {
        id: 'temperature_drop',
        type: 'temperature',
        intensity: 0.5,
        duration: 10000,
        cooldown: 300000,
        conditions: { minTension: 0.4 },
        execute: () => this.executeTemperatureDrop()
      },
      {
        id: 'joy_jumpscare',
        type: 'jumpscare',
        intensity: 1.0,
        duration: 1000,
        cooldown: 600000,
        conditions: { minTension: 0.7, chapter: ['b14', 'b16', 'b19'], flags: { softHorror: false } },
        execute: () => this.executeJumpscare()
      }
    ];
  }

  private onSettingsChanged(settings: any): void {
    this.softHorror = settings.accessibility?.softHorror || false;
    this.narrative = settings.accessibility?.narrativeMode === true;
  }

  private onChapterStart(data: { chapterId: string }): void {
    const chapter = data.chapterId;
    const chapterTensions: Record<string, number> = {
      'b01': 0.1, 'b02': 0.1, 'b03': 0.1, 'b04': 0.15, 'b05': 0.15, 'b05b': 0.1,
      'b06': 0.2, 'b07': 0.25, 'b08': 0.3, 'b09': 0.35, 'b10': 0.6,
      'b11': 0.4, 'b12b': 0.5, 'b12': 0.55, 'b13': 0.5, 'b14': 0.7,
      'b15': 0.6, 'b16': 0.8, 'b17': 0.75, 'b18': 0.7, 'b19': 0.9, 'b20': 0.85
    };
    this.baseTension = chapterTensions[chapter] || 0;
    this.tension = this.baseTension;
    this.startBreathCycle();
    eventBus.emit(GameEvents.TENSION_CHANGED, { tension: this.tension });
  }

  private startBreathCycle(): void {
    if (this.breathInterval) clearInterval(this.breathInterval);
    this.breathInterval = window.setInterval(() => {
      if (this.tension > 0.3 && this.enabled && !this.narrative) {
        audioManager.playProcedural('breath', { category: 'ambience', volume: 0.1 * this.tension });
      }
    }, 8000 + Math.random() * 4000);
  }

  setTension(value: number): void {
    this.tension = Math.max(0, Math.min(1, value));
    eventBus.emit(GameEvents.TENSION_CHANGED, { tension: this.tension });
  }

  modifyTension(delta: number): void {
    this.setTension(this.tension + delta);
  }

  getTension(): number {
    return this.tension;
  }

  getBaseTension(): number {
    return this.baseTension;
  }

  update(deltaTime: number): void {
    if (!this.enabled) return;

    this.tension = Math.max(this.baseTension, this.tension - deltaTime * 0.02);
    eventBus.emit(GameEvents.TENSION_CHANGED, { tension: this.tension });

    // Mode Naratif: pemain datang demi cerita, bukan mengejar-ngejar kejutan.
    // Peristiwa tegangan acak (bayangan, bisikan, jumpscare) dilewati; meter
    // tegangan tetap hidup untuk keperluan naskah.
    if (this.narrative) return;

    const now = Date.now();
    if (now - this.lastEventTime < this.minEventInterval) return;

    const availableEvents = this.events.filter(e => {
      if (this.activeEvents.has(e.id)) return false;
      if (now - (e.lastTriggered || 0) < e.cooldown) return false;
      if (!this.checkConditions(e.conditions)) return false;
      return true;
    });

    if (availableEvents.length > 0 && Math.random() < 0.1 * deltaTime * 60) {
      const event = availableEvents[Math.floor(Math.random() * availableEvents.length)];
      this.triggerEvent(event);
    }
  }

  private checkConditions(conditions: HorrorEvent['conditions']): boolean {
    const state = gameState.getState();

    if (conditions.minTension !== undefined && this.tension < conditions.minTension) return false;
    if (conditions.maxTension !== undefined && this.tension > conditions.maxTension) return false;
    if (conditions.chapter && !conditions.chapter.includes(state.currentChapter || '')) return false;
    if (conditions.pov && !conditions.pov.includes(state.pov)) return false;
    if (conditions.timeOfDay) {
      const hour = parseInt(state.jam.split(':')[0]);
      const isNight = hour >= 18 || hour < 6;
      if (conditions.timeOfDay.includes('night') && !isNight) return false;
      if (conditions.timeOfDay.includes('day') && isNight) return false;
    }
    if (conditions.flags) {
      for (const [flag, value] of Object.entries(conditions.flags)) {
        if (state.flags[flag] !== value) return false;
      }
    }
    return true;
  }

  private triggerEvent(event: HorrorEvent): void {
    this.activeEvents.add(event.id);
    event.lastTriggered = Date.now();
    this.lastEventTime = Date.now();
    this.modifyTension(event.intensity * 0.1);
    event.execute();

    setTimeout(() => {
      this.activeEvents.delete(event.id);
    }, event.duration);
  }

  private executeFlicker(): void {
    eventBus.emit('horror:flicker', { duration: 2000 });
    audioManager.playProcedural('static', { category: 'ambience', volume: 0.2 });
  }

  private executeShadow(): void {
    eventBus.emit('horror:shadow', { position: 'peripheral', duration: 3000 });
  }

  private executeFootsteps(): void {
    eventBus.emit('horror:footsteps', { direction: 'behind', duration: 5000 });
    audioManager.playProcedural('footstep', { category: 'sfx', volume: 0.4, spatial: true, position: [0, 0, -5] });
  }

  private executeWhisper(): void {
    const name = gameState.get('pov') === 'dimas' ? 'Dimas' : 'Raka';
    eventBus.emit('horror:whisper', { text: `${name}...`, duration: 4000 });
    audioManager.playProcedural('whisper', { category: 'ambience', volume: 0.3, spatial: true, position: [2, 1.5, -3] });
  }

  private executeBreath(): void {
    eventBus.emit('horror:breath', { duration: 3000 });
    audioManager.playProcedural('breath', { category: 'ambience', volume: 0.3, spatial: true, position: [0, 1.6, -1] });
  }

  private executeDoorCreak(): void {
    eventBus.emit('horror:door', { duration: 2000 });
    audioManager.playProcedural('static', { category: 'sfx', volume: 0.2 });
  }

  private executeTemperatureDrop(): void {
    eventBus.emit('horror:temperature', { intensity: 0.5, duration: 10000 });
    eventBus.emit('ui:sensoryText', { text: 'Tercium bau tanah basah dan asap.' });
  }

  private executeJumpscare(): void {
    if (this.softHorror) return;
    eventBus.emit('horror:jumpscare', { type: 'joy', duration: 1000 });
    audioManager.playProcedural('heartbeat', { category: 'sfx', volume: 1.0 });
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  forceEvent(eventId: string): void {
    const event = this.events.find(e => e.id === eventId);
    if (event) this.triggerEvent(event);
  }

  addCustomEvent(event: HorrorEvent): void {
    this.events.push(event);
  }

  serialize(): any {
    return {
      tension: this.tension,
      baseTension: this.baseTension
    };
  }

  deserialize(data: any): void {
    this.tension = data.tension || 0;
    this.baseTension = data.baseTension || 0;
  }
}

export const tensionDirector = new TensionDirector();