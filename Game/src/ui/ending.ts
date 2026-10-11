import { UIElement } from './base.js';
import { i18n, t } from '../core/i18n.js';
import { eventBus } from '../core/events.js';

export interface EndingView {
  id: string;
  name: string;
  description: string;
  dimasFate: string;
  rudiFate: string;
  joyFound: boolean;
  cukongInvestigated: boolean;
  epilog: string;
}

export class EndingScreen implements UIElement {
  element: HTMLElement;
  private onMenu: () => void;
  private onGallery: () => void;
  private onReplay: () => void;
  private listenersAttached = false;

  constructor(onMenu: () => void, onGallery: () => void, onReplay: () => void) {
    this.onMenu = onMenu;
    this.onGallery = onGallery;
    this.onReplay = onReplay;
    this.element = this.createElement();
    this.updateText();
    i18n.subscribe(() => this.updateText());
  }

  private createElement(): HTMLElement {
    const div = document.createElement('div');
    div.id = 'ending-screen';
    div.className = 'screen ending-screen';
    div.innerHTML = `
      <div class="ending-content">
        <div class="ending-label" data-i18n="ending.title"></div>
        <h1 class="ending-title" id="ending-name"></h1>
        <p class="ending-desc" id="ending-desc"></p>
        <div class="ending-fates">
          <div class="fate-row"><span class="fate-label" data-i18n="ending.fateDimas"></span><span class="fate-value" id="ending-dimas"></span></div>
          <div class="fate-row"><span class="fate-label" data-i18n="ending.fateRudi"></span><span class="fate-value" id="ending-rudi"></span></div>
        </div>
        <div class="ending-epilog">
          <span class="fate-label" data-i18n="ending.epilog"></span>
          <p id="ending-epilog"></p>
        </div>
        <div class="ending-new" id="ending-new" hidden>
          <span data-i18n="ending.unlocked"></span>
        </div>
        <div class="ending-actions">
          <button id="ending-replay" class="ui-btn" data-i18n="ending.replay"></button>
          <button id="ending-gallery" class="ui-btn" data-i18n="ending.gallery"></button>
          <button id="ending-menu" class="ui-btn" data-i18n="menu.exit"></button>
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

  setEnding(view: EndingView, isNew: boolean): void {
    const name = this.element.querySelector('#ending-name');
    const desc = this.element.querySelector('#ending-desc');
    const dimas = this.element.querySelector('#ending-dimas');
    const rudi = this.element.querySelector('#ending-rudi');
    const epilog = this.element.querySelector('#ending-epilog');
    const newBadge = this.element.querySelector('#ending-new') as HTMLElement;

    if (name) name.textContent = view.name;
    if (desc) desc.textContent = view.description;
    if (dimas) dimas.textContent = view.dimasFate;
    if (rudi) rudi.textContent = view.rudiFate;
    if (epilog) epilog.textContent = view.epilog;
    if (newBadge) newBadge.hidden = !isNew;
  }

  show(): void {
    this.element.style.display = 'flex';
    document.body.appendChild(this.element);
    if (!this.listenersAttached) {
      this.listenersAttached = true;
      const replay = this.element.querySelector('#ending-replay');
      const gallery = this.element.querySelector('#ending-gallery');
      const menu = this.element.querySelector('#ending-menu');
      replay?.addEventListener('click', this.onReplay);
      gallery?.addEventListener('click', this.onGallery);
      menu?.addEventListener('click', this.onMenu);
    }
    eventBus.emit('audio:stopAll', {});
  }

  hide(): void {
    this.element.style.display = 'none';
  }

  destroy(): void {
    this.element.remove();
  }
}
