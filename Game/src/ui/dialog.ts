import { UIManager, UIElement } from './base.js';
import { i18n, t } from '../core/i18n.js';
import { settingsManager } from '../core/settings.js';
import { audioManager } from '../core/audio.js';
import { eventBus, GameEvents } from '../core/events.js';

export interface DialogNode {
  speaker?: string;
  text: string;
  choices?: DialogChoice[];
  autoNext?: string;
  onEnter?: () => void;
  onExit?: () => void;
}

export interface DialogChoice {
  text: string;
  next: string;
  condition?: () => boolean;
  onSelect?: () => void;
  important?: boolean;
  once?: boolean;
}

export class DialogScreen implements UIElement {
  element: HTMLElement;
  private onClose: () => void;
  private dialogData: Map<string, DialogNode> = new Map();
  private currentNode: string | null = null;
  private history: Array<{ speaker: string; text: string }> = [];
  private typing = false;
  private typingInterval: number | null = null;
  private currentText = '';
  private targetText = '';
  private typeSpeed = 30;
  private autoPlay = false;
  private showHistory = false;
  private waitingForChoice = false;
  private chosenPath: string | null = null;
  private eventMode = false;
  private scriptListenersAttached = false;
  /** Esc "lewati dialog": maju cepat melewati semua baris sampai pilihan/akhir. */
  private skipMode = false;
  private autoAdvanceTimer: number | null = null;
  private choiceIndex = 0;

  constructor(onClose: () => void) {
    this.onClose = onClose;
    this.element = this.createElement();
    this.updateText();
    this.updateSettings();
    i18n.subscribe(() => this.updateText());
    settingsManager.subscribe(() => this.updateSettings());

    eventBus.on<any>(GameEvents.DIALOG_START, (data) => this.onScriptLine(data));
    eventBus.on<any>('dialog:choices', (data) => this.onScriptChoices(data?.choices ?? []));
    eventBus.on(GameEvents.DIALOG_END, () => this.onScriptEnd());
  }

  private onScriptLine(data: { speaker?: string; text: string }): void {
    if (!data || typeof data.text !== 'string') return;
    this.eventMode = true;
    this.hideChoices();
    this.history.push({ speaker: data.speaker ?? '', text: data.text });
    if (this.history.length > 60) this.history.shift();

    if (this.element.style.display === 'none' || !this.element.isConnected) {
      this.show();
    }

    const speakerEl = this.element.querySelector('#dialog-speaker') as HTMLElement;
    if (speakerEl) speakerEl.textContent = data.speaker ?? '';

    this.currentNode = 'script';
    this.startTyping(data.text);
  }

  private onScriptChoices(choices: any[]): void {
    const translated = (choices || []).map((c: any) => ({
      text: t(String(c.text)),
      next: String(c.next),
      important: !!c.important,
      once: !!c.once
    }));
    if (this.element.style.display === 'none' || !this.element.isConnected) {
      this.show();
    }
    this.showChoices(translated);
  }

  private onScriptEnd(): void {
    this.eventMode = false;
    this.currentNode = null;
    this.hideChoices();
    const textEl = this.element.querySelector('#dialog-text') as HTMLElement;
    if (textEl) textEl.textContent = '';
    const speakerEl = this.element.querySelector('#dialog-speaker') as HTMLElement;
    if (speakerEl) speakerEl.textContent = '';
    this.hide();
  }

  private createElement(): HTMLElement {
    const div = document.createElement('div');
    div.id = 'dialog-screen';
    div.className = 'screen dialog-screen';
    div.innerHTML = `
      <div class="dialog-container">
        <div class="dialog-box">
          <div class="dialog-header">
            <span class="speaker-name" id="dialog-speaker"></span>
            <button id="dialog-history-btn" class="ui-btn small" data-i18n="dialog.history"></button>
          </div>
          <div class="dialog-text" id="dialog-text"></div>
          <div class="dialog-choices" id="dialog-choices"></div>
          <div class="dialog-hints">
            <span class="hint-next" data-i18n="dialog.hintNext"></span>
            <span class="hint-skip" data-i18n="dialog.hintSkip"></span>
            <span class="hint-hist" data-i18n="dialog.hintHistory"></span>
            <span class="hint-choice hidden" data-i18n="dialog.hintChoice"></span>
            <span class="hint-auto" data-i18n="dialog.autoPlayOff"></span>
          </div>
        </div>
        <div class="dialog-history hidden" id="dialog-history">
          <h3 data-i18n="dialog.history"></h3>
          <div class="history-list" id="history-list"></div>
          <button class="ui-btn" id="history-close" data-i18n="ui.close"></button>
        </div>
      </div>
    `;
    return div;
  }

  private updateText(): void {
    this.element.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
    });
  }

  private updateSettings(): void {
    const textSettings = settingsManager.get('text');
    this.typeSpeed = textSettings.typeSpeed;
    this.autoPlay = textSettings.autoPlay;
    this.showHistory = textSettings.dialogHistory;
    this.applyAutoPlayHint();
  }

  /**
   * Petunjuk auto-play selalu tampil lengkap dengan tombol dan keadaannya
   * (ON/OFF), supaya pemain tahu persis tombol apa yang menyalakan fitur ini.
   * Elemen memakai kelas 'active' saat menyala, bukan disembunyikan.
   */
  private applyAutoPlayHint(): void {
    const el = this.element.querySelector('.hint-auto');
    if (!el) return;
    const key = this.autoPlay ? 'dialog.autoPlayOn' : 'dialog.autoPlayOff';
    el.setAttribute('data-i18n', key);
    el.textContent = t(key);
    el.classList.toggle('active', this.autoPlay);
  }

  show(): void {
    this.element.style.display = 'flex';
    document.body.appendChild(this.element);
    if (!this.scriptListenersAttached) {
      this.scriptListenersAttached = true;
      this.setupListeners();
    }
  }

  hide(): void {
    this.element.style.display = 'none';
    if (this.scriptListenersAttached) {
      this.scriptListenersAttached = false;
      this.removeListeners();
    }
    if (this.typingInterval) {
      clearInterval(this.typingInterval);
      this.typingInterval = null;
    }
    this.clearAutoAdvance();
    this.skipMode = false;
    this.typing = false;
  }

  destroy(): void {
    this.removeListeners();
    if (this.typingInterval) clearInterval(this.typingInterval);
    this.clearAutoAdvance();
    this.element.remove();
  }

  private abortController: AbortController | null = null;

  private setupListeners(): void {
    this.removeListeners();
    const controller = new AbortController();
    this.abortController = controller;
    const { signal } = controller;

    const historyBtn = this.element.querySelector('#dialog-history-btn');
    const historyClose = this.element.querySelector('#history-close');
    const container = this.element.querySelector('.dialog-box');

    historyBtn?.addEventListener('click', () => this.toggleHistory(), { signal });
    historyClose?.addEventListener('click', () => this.toggleHistory(), { signal });
    container?.addEventListener('click', () => this.onContainerClick(), { signal });

    document.addEventListener('keydown', this.handleKeyDown, { signal });
  }

  private removeListeners(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    // Daftar kunci yang benar-benar dikonsumsi dialog saat ini. Kunci yang
    // dikonsumsi di-stopPropagation-nya: handler global (pause, hotbar,
    // inventaris) berada di window, satu tingkat di atas document ini.
    // Tanpa stop, kunci yang sama membocorkan dua efek sekaligus pada satu
    // keydown: Esc menutup dialog lewat skip lalu handler global melihat
    // inDialog sudah false dan langsung membuka pause, atau angka pilihan
    // bocor ke pemilihan slot hotbar setelah dialog selesai.
    const choiceKeys = e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp'
      || e.key === 's' || e.key === 'S' || e.key === 'ArrowDown'
      || (e.key >= '1' && e.key <= '4');
    const handled = e.key === ' ' || e.key === 'Enter' || e.key === 'Escape'
      || (this.waitingForChoice && choiceKeys)
      || e.key === 'h' || e.key === 'H' || e.key === 'p' || e.key === 'P';
    if (handled) e.stopPropagation();
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (this.waitingForChoice) {
        // Spasi saat pilihan tampil = konfirmasi opsi yang sedang tersorot.
        this.selectChoice(this.choiceIndex);
        return;
      }
      this.onContainerClick();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.skipAll();
    } else if (this.waitingForChoice && (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp')) {
      e.preventDefault();
      this.moveChoice(-1);
    } else if (this.waitingForChoice && (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown')) {
      e.preventDefault();
      this.moveChoice(1);
    } else if (e.key >= '1' && e.key <= '4' && this.waitingForChoice) {
      const index = parseInt(e.key) - 1;
      this.selectChoice(index);
    } else if (e.key === 'h' || e.key === 'H') {
      this.toggleHistory();
    } else if (e.key === 'p' || e.key === 'P') {
      this.toggleAutoPlay();
    }
  };

  private onContainerClick(): void {
    if (this.typing) {
      this.finishTyping();
      return;
    }
    if (this.waitingForChoice) return;

    if (this.eventMode) {
      this.eventBusContinue();
      return;
    }

    if (this.currentNode && this.currentNode !== 'script') {
      this.advanceDialog();
    }
  }

  private eventBusContinue(): void {
    this.currentNode = null;
    eventBus.emit('dialog:continue', {});
  }

  private toggleHistory(): void {
    const history = this.element.querySelector('#dialog-history') as HTMLElement;
    history?.classList.toggle('hidden');
    if (!history?.classList.contains('hidden')) {
      this.renderHistory();
    }
  }

  private renderHistory(): void {
    const list = this.element.querySelector('#history-list') as HTMLElement;
    if (!list) return;

    list.innerHTML = this.history.map(entry => `
      <div class="history-entry">
        <span class="history-speaker">${entry.speaker}:</span>
        <span class="history-text">${entry.text}</span>
      </div>
    `).join('');
  }

  setDialogData(data: Map<string, DialogNode>): void {
    this.dialogData = data;
  }

  startDialog(nodeId: string): void {
    this.currentNode = nodeId;
    this.chosenPath = null;
    this.showNode(nodeId);
  }

  private showNode(nodeId: string): void {
    const node = this.dialogData.get(nodeId);
    if (!node) {
      this.endDialog();
      return;
    }

    node.onEnter?.();

    if (node.speaker) {
      const speakerEl = this.element.querySelector('#dialog-speaker') as HTMLElement;
      if (speakerEl) speakerEl.textContent = node.speaker;
    }

    this.targetText = node.text;
    this.startTyping(node.text);

    if (node.choices && node.choices.length > 0) {
      this.showChoices(node.choices);
    } else {
      this.hideChoices();
    }
  }

  private startTyping(text: string): void {
    this.typing = true;
    this.targetText = text;
    this.currentText = '';
    this.clearAutoAdvance();
    const textEl = this.element.querySelector('#dialog-text') as HTMLElement;
    if (textEl) textEl.textContent = '';

    const speed = this.typeSpeed;
    let i = 0;
    this.typingInterval = window.setInterval(() => {
      if (i < text.length) {
        this.currentText += text[i];
        if (textEl) textEl.textContent = this.currentText;
        i++;

        if (i % 2 === 0) {
          audioManager.playProcedural('blip', { category: 'dialogBlip', volume: 0.3 });
        }
      } else {
        this.finishTyping();
      }
    }, speed);
  }

  private finishTyping(): void {
    if (this.typingInterval) {
      clearInterval(this.typingInterval);
      this.typingInterval = null;
    }
    this.typing = false;
    const textEl = this.element.querySelector('#dialog-text') as HTMLElement;
    if (textEl) textEl.textContent = this.targetText;
    this.currentText = this.targetText;
    // Baris selesai diketik: kalau auto-play atau mode lewati aktif,
    // jadwalkan maju otomatis dengan jeda membaca.
    this.scheduleAutoAdvance();
  }

  /**
   * Auto-advance: jeda membaca sebandung panjang baris, dibatasi supaya
   * tidak terasa menggantung. Mode lewati (Esc) memakai jeda super cepat.
   */
  private scheduleAutoAdvance(): void {
    if (this.typing || this.waitingForChoice || this.currentNode === null) return;
    if (!this.autoPlay && !this.skipMode) return;
    this.clearAutoAdvance();
    const delay = this.skipMode ? 120 : Math.min(4000, 700 + this.targetText.length * 30);
    this.autoAdvanceTimer = window.setTimeout(() => {
      this.autoAdvanceTimer = null;
      if (this.typing || this.waitingForChoice || this.currentNode === null) return;
      if (this.element.style.display === 'none') return;
      this.onContainerClick();
    }, delay);
  }

  private clearAutoAdvance(): void {
    if (this.autoAdvanceTimer !== null) {
      clearTimeout(this.autoAdvanceTimer);
      this.autoAdvanceTimer = null;
    }
  }

  /** Esc: lewati seluruh dialog berjalan sampai selesai atau sampai pilihan. */
  private skipAll(): void {
    if (this.typing) this.finishTyping(); // ketikan tuntas dulu; auto-advance batal sendiri bila menunggu pilihan
    if (this.waitingForChoice) return;
    this.skipMode = true;
    this.clearAutoAdvance();
    this.scheduleAutoAdvance();
  }

  private moveChoice(delta: number): void {
    const btns = this.element.querySelectorAll<HTMLElement>('.choice-btn');
    if (!btns.length) return;
    this.choiceIndex = (this.choiceIndex + delta + btns.length) % btns.length;
    btns.forEach((b, i) => b.classList.toggle('kb-selected', i === this.choiceIndex));
  }

  private toggleAutoPlay(): void {
    const current = settingsManager.get('text').autoPlay;
    // settingsManager.subscribe memicu updateSettings() -> applyAutoPlayHint(),
    // sehingga badge dan teks petunjuk ikut berubah tanpa duplikasi logika.
    settingsManager.update('text', { autoPlay: !current });
    // Baris yang sedang tampil penuh ikut dijadwalkan maju: menyalankan
    // auto-play di tengah kalimat langsung terasa efeknya, bukan baru aktif
    // pada baris berikutnya.
    this.scheduleAutoAdvance();
  }

  showChoices(choices: DialogChoice[]): void {
    const container = this.element.querySelector('#dialog-choices') as HTMLElement;
    if (!container) return;

    const validChoices = choices.filter(c => typeof c.condition !== 'function' || c.condition());
    this.waitingForChoice = validChoices.length > 0;

    container.innerHTML = validChoices.map((choice, index) => `
      <button class="ui-btn choice-btn ${choice.important ? 'important' : ''}" 
              data-choice="${choice.next}"
              data-once="${choice.once || false}">
        <span class="choice-number">${index + 1}.</span>
        <span class="choice-text">${choice.text}</span>
        ${choice.important ? '<span class="choice-important" data-i18n="dialog.willBeRemembered"></span>' : ''}
      </button>
    `).join('');

    container.querySelectorAll<HTMLElement>('.choice-btn').forEach((btn, index) => {
      btn.addEventListener('click', () => this.selectChoice(index));
    });

    // Sorotan keyboard mulai di opsi pertama: W/S menggeser, Spasi memilih.
    // Mode lewati berhenti di pilihan karena pemain harus menentukan sendiri.
    this.skipMode = false;
    this.choiceIndex = 0;
    container.querySelector('.choice-btn')?.classList.add('kb-selected');
    this.element.querySelector('.hint-choice')?.classList.remove('hidden');

    this.updateText();
  }

  private hideChoices(): void {
    const container = this.element.querySelector('#dialog-choices') as HTMLElement;
    if (container) container.innerHTML = '';
    this.waitingForChoice = false;
    this.choiceIndex = 0;
    this.element.querySelector('.hint-choice')?.classList.add('hidden');
  }

  private selectChoice(index: number): void {
    const container = this.element.querySelector('#dialog-choices') as HTMLElement;
    const buttons = container?.querySelectorAll<HTMLElement>('.choice-btn');
    const btn = buttons?.[index] as HTMLButtonElement;

    if (!btn) return;

    this.clearAutoAdvance();
    buttons?.forEach(b => b.classList.remove('kb-selected'));

    const nextNode = btn.dataset.choice!;
    const once = btn.dataset.once === 'true';

    this.chosenPath = nextNode;
    this.waitingForChoice = false;

    if (this.eventMode) {
      this.hideChoices();
      eventBus.emit('dialog:choice', { choice: nextNode });
      return;
    }

    const node = this.dialogData.get(this.currentNode!);
    const choice = node?.choices?.find(c => c.next === nextNode);
    choice?.onSelect?.();

    if (once) {
      btn.disabled = true;
      btn.classList.add('used');
    }

    this.hideChoices();
    this.advanceDialog(nextNode);
  }

  private advanceDialog(nextNode?: string): void {
    if (this.currentNode) {
      const node = this.dialogData.get(this.currentNode);
      if (node?.speaker && node.text) {
        this.history.push({ speaker: node.speaker, text: node.text });
      }
      node?.onExit?.();
    }

    if (nextNode) {
      this.currentNode = nextNode;
      this.showNode(nextNode);
    } else if (this.currentNode) {
      const node = this.dialogData.get(this.currentNode);
      if (node?.autoNext) {
        this.currentNode = node.autoNext;
        this.showNode(node.autoNext);
      } else {
        this.endDialog();
      }
    }
  }

  private endDialog(): void {
    this.currentNode = null;
    this.hideChoices();
    const textEl = this.element.querySelector('#dialog-text') as HTMLElement;
    if (textEl) textEl.textContent = '';
    const speakerEl = this.element.querySelector('#dialog-speaker') as HTMLElement;
    if (speakerEl) speakerEl.textContent = '';
    this.onClose();
  }

  skipTyping(): void {
    if (this.typing) {
      this.finishTyping();
    }
  }

  setAutoPlay(enabled: boolean): void {
    this.autoPlay = enabled;
    this.applyAutoPlayHint();
  }

  getCurrentNode(): string | null {
    return this.currentNode;
  }

  getChosenPath(): string | null {
    return this.chosenPath;
  }

  isActive(): boolean {
    return this.currentNode !== null;
  }
}