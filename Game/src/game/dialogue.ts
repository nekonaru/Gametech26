import { eventBus, GameEvents } from '../core/events.js';
import { audioManager } from '../core/audio.js';
import { settingsManager } from '../core/settings.js';

export interface DialogLine {
  speaker: string;
  text: string;
  timestamp: number;
}

export class DialogueManager {
  private active = false;
  private currentSpeaker = '';
  private currentText = '';
  private currentChoices: Array<{ text: string; next: string; important: boolean }> = [];
  private history: DialogLine[] = [];
  private typing = false;
  private typeSpeed = 30;
  private autoPlay = false;
  private skipRequested = false;
  private resolveContinue: (() => void) | null = null;
  private resolveChoice: ((choice: string) => void) | null = null;

  constructor() {
    eventBus.on(GameEvents.DIALOG_START, this.onDialogStart.bind(this));
    eventBus.on(GameEvents.DIALOG_END, this.onDialogEnd.bind(this));
    eventBus.on('dialog:continue', this.onContinue.bind(this));
    eventBus.on('dialog:choice', this.onChoice.bind(this));
    eventBus.on('dialog:choices', this.onChoices.bind(this));

    settingsManager.subscribe(() => this.updateSettings());
    this.updateSettings();
  }

  private updateSettings(): void {
    const text = settingsManager.get('text');
    this.typeSpeed = text.typeSpeed;
    this.autoPlay = text.autoPlay;
  }

  private onDialogStart(data: { speaker?: string; text: string; choices?: any[] }): void {
    this.active = true;
    this.currentSpeaker = data.speaker || '';
    this.currentText = data.text;
    this.typing = true;
    this.skipRequested = false;
    this.typeText(data.text);
  }

  private onDialogEnd(): void {
    this.active = false;
    this.currentSpeaker = '';
    this.currentText = '';
    this.currentChoices = [];
  }

  private onContinue(): void {
    if (this.typing) {
      this.skipRequested = true;
    } else if (this.resolveContinue) {
      this.resolveContinue();
    }
  }

  private onChoice(data: { choice: string }): void {
    if (this.resolveChoice) {
      this.resolveChoice(data.choice);
    }
  }

  private onChoices(data: { choices: Array<{ text: string; next: string; important: boolean }> }): void {
    this.currentChoices = data.choices;
  }

  private async typeText(text: string): Promise<void> {
    let i = 0;

    const typeNext = () => {
      if (i >= text.length || this.skipRequested) {
        this.typing = false;
        this.currentText = text;
        if (this.resolveContinue) {
          this.resolveContinue();
        }
        return;
      }

      this.currentText = text.slice(0, i + 1);
      i++;

      if (i % 2 === 0) {
        audioManager.playProcedural('blip', { category: 'dialogBlip', volume: 0.3 });
      }

      setTimeout(typeNext, this.typeSpeed);
    };

    typeNext();
  }

  async showText(speaker: string, text: string): Promise<void> {
    this.currentSpeaker = speaker;
    this.currentText = text;
    this.typing = true;
    this.skipRequested = false;

    this.history.push({ speaker, text, timestamp: Date.now() });

    return new Promise(resolve => {
      this.resolveContinue = resolve;
      this.typeText(text);
    });
  }

  async showChoices(choices: Array<{ text: string; next: string; important: boolean }>): Promise<string> {
    this.currentChoices = choices;
    eventBus.emit('ui:showChoices', { choices });

    return new Promise(resolve => {
      this.resolveChoice = resolve;
    });
  }

  skip(): void {
    this.skipRequested = true;
    if (this.typing) {
      this.currentText = this.currentText; // Will be completed in typeText
    }
  }

  getHistory(): DialogLine[] {
    return [...this.history];
  }

  getCurrentSpeaker(): string {
    return this.currentSpeaker;
  }

  getCurrentText(): string {
    return this.currentText;
  }

  getChoices(): Array<{ text: string; next: string; important: boolean }> {
    return [...this.currentChoices];
  }

  isActive(): boolean {
    return this.active;
  }

  isTyping(): boolean {
    return this.typing;
  }

  clearHistory(): void {
    this.history = [];
  }
}

export const dialogueManager = new DialogueManager();