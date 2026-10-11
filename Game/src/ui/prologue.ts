import { UIElement } from './base.js';
import { i18n, t } from '../core/i18n.js';
import { audioManager } from '../core/audio.js';

export class PrologueScreen implements UIElement {
  element: HTMLElement;
  private onDone: () => void;
  private timer: number | null = null;
  private phase = 0;
  private finished = false;

  constructor(onDone: () => void) {
    this.onDone = onDone;
    this.element = this.createElement();
    this.updateText();
    i18n.subscribe(() => this.updateText());
  }

  private createElement(): HTMLElement {
    const div = document.createElement('div');
    div.id = 'prologue-screen';
    div.className = 'screen prologue-screen';
    div.innerHTML = `
      <div class="prologue-fade" id="prologue-fade"></div>
      <div class="prologue-lines" id="prologue-lines">
        <p class="prologue-line" data-prologue="0" data-i18n="prologue.line1"></p>
        <p class="prologue-line" data-prologue="1" data-i18n="prologue.line2"></p>
        <p class="prologue-line" data-prologue="2" data-i18n="prologue.line3"></p>
      </div>
      <div class="prologue-title" id="prologue-title" data-i18n="prologue.title"></div>
      <button id="prologue-skip" class="ui-btn prologue-skip" data-i18n="ui.skip"></button>
    `;
    return div;
  }

  private updateText(): void {
    this.element.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
    });
  }

  private reset(): void {
    this.phase = 0;
    this.finished = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const lines = this.element.querySelectorAll<HTMLElement>('.prologue-line');
    lines.forEach(l => l.classList.remove('visible'));
    const title = this.element.querySelector('#prologue-title') as HTMLElement;
    if (title) title.classList.remove('visible');
    const fade = this.element.querySelector('#prologue-fade') as HTMLElement;
    if (fade) fade.style.opacity = '0';
  }

  private advance(): void {
    if (this.finished) return;
    const lines = this.element.querySelectorAll<HTMLElement>('.prologue-line');
    const title = this.element.querySelector('#prologue-title') as HTMLElement;
    const fade = this.element.querySelector('#prologue-fade') as HTMLElement;

    if (this.phase <= lines.length - 1) {
      if (lines[this.phase]) lines[this.phase].classList.add('visible');
      this.phase++;
      this.timer = window.setTimeout(() => this.advance(), 4500);
      return;
    }

    if (this.phase === lines.length) {
      if (fade) fade.style.opacity = '1';
      this.phase++;
      this.timer = window.setTimeout(() => this.advance(), 2500);
      return;
    }

    if (title) title.classList.add('visible');
    audioManager.playProcedural('whisper', { category: 'ambience', volume: 0.35 });
    this.timer = window.setTimeout(() => this.finish(), 4200);
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.onDone();
  }

  show(): void {
    this.element.style.display = 'flex';
    document.body.appendChild(this.element);
    this.reset();
    const skip = this.element.querySelector('#prologue-skip');
    skip?.addEventListener('click', () => this.finish());
    this.timer = window.setTimeout(() => this.advance(), 600);
  }

  hide(): void {
    this.element.style.display = 'none';
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  destroy(): void {
    if (this.timer) clearTimeout(this.timer);
    this.element.remove();
  }
}
