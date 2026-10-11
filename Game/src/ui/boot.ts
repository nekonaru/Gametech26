import { UIElement } from './base.js';
import { i18n, t } from '../core/i18n.js';
import { settingsManager } from '../core/settings.js';

export class BootScreen implements UIElement {
  element: HTMLElement;
  private onAccept: () => void;
  private onDecline: () => void;

  constructor(onAccept: () => void, onDecline: () => void) {
    this.onAccept = onAccept;
    this.onDecline = onDecline;
    this.element = this.createElement();
    this.updateText();
    i18n.subscribe(() => this.updateText());
  }

  private createElement(): HTMLElement {
    const div = document.createElement('div');
    div.id = 'boot-screen';
    div.className = 'screen boot-screen';
    div.innerHTML = `
      <div class="boot-content">
        <div class="boot-title">ASAP YANG TAK PADAM</div>
        <div class="boot-subtitle" data-i18n="ui.contentWarning"></div>
        <div class="boot-warning" data-i18n="ui.contentWarningText"></div>
        <div class="boot-buttons">
          <button id="boot-accept" class="ui-btn primary" data-i18n="ui.accept"></button>
          <button id="boot-decline" class="ui-btn secondary" data-i18n="ui.decline"></button>
        </div>
      </div>
    `;
    return div;
  }

  private updateText(): void {
    const warning = this.element.querySelector('[data-i18n="ui.contentWarning"]');
    const warningText = this.element.querySelector('[data-i18n="ui.contentWarningText"]');
    const acceptBtn = this.element.querySelector('#boot-accept');
    const declineBtn = this.element.querySelector('#boot-decline');

    if (warning) warning.textContent = t('ui.contentWarning');
    if (warningText) warningText.textContent = t('ui.contentWarningText');
    if (acceptBtn) acceptBtn.textContent = t('ui.accept');
    if (declineBtn) declineBtn.textContent = t('ui.decline');

    this.element.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key && key !== 'ui.contentWarning' && key !== 'ui.contentWarningText' && key !== 'ui.accept' && key !== 'ui.decline') {
        el.textContent = t(key);
      }
    });
  }

  show(): void {
    this.element.style.display = 'flex';
    document.body.appendChild(this.element);
    this.setupListeners();
  }

  hide(): void {
    this.element.style.display = 'none';
    this.removeListeners();
  }

  destroy(): void {
    this.removeListeners();
    this.element.remove();
  }

  private setupListeners(): void {
    const acceptBtn = this.element.querySelector('#boot-accept') as HTMLButtonElement;
    const declineBtn = this.element.querySelector('#boot-decline') as HTMLButtonElement;

    acceptBtn?.addEventListener('click', this.handleAccept);
    declineBtn?.addEventListener('click', this.handleDecline);
  }

  private removeListeners(): void {
    const acceptBtn = this.element.querySelector('#boot-accept') as HTMLButtonElement;
    const declineBtn = this.element.querySelector('#boot-decline') as HTMLButtonElement;

    acceptBtn?.removeEventListener('click', this.handleAccept);
    declineBtn?.removeEventListener('click', this.handleDecline);
  }

  private handleAccept = (): void => {
    localStorage.setItem('contentWarningAccepted', 'true');
    this.onAccept();
  };

  private handleDecline = (): void => {
    this.onDecline();
  };
}

export class LanguageSelectScreen implements UIElement {
  element: HTMLElement;
  private onComplete: (lang: 'id' | 'en') => void;

  constructor(onComplete: (lang: 'id' | 'en') => void) {
    this.onComplete = onComplete;
    this.element = this.createElement();
    this.updateText();
    i18n.subscribe(() => this.updateText());
  }

  private createElement(): HTMLElement {
    const div = document.createElement('div');
    div.id = 'language-screen';
    div.className = 'screen language-screen';
    div.innerHTML = `
      <div class="language-content">
        <h2 data-i18n="menu.language"></h2>
        <div class="language-options">
          <button id="lang-id" class="ui-btn lang-btn" data-lang="id">
            <span class="lang-native">Bahasa Indonesia</span>
            <span class="lang-english">Indonesian</span>
          </button>
          <button id="lang-en" class="ui-btn lang-btn" data-lang="en">
            <span class="lang-native">English</span>
            <span class="lang-english">English</span>
          </button>
        </div>
      </div>
    `;
    return div;
  }

  private updateText(): void {
    const title = this.element.querySelector('[data-i18n="menu.language"]');
    if (title) title.textContent = t('menu.language');
  }

  show(): void {
    this.element.style.display = 'flex';
    document.body.appendChild(this.element);
    this.setupListeners();
  }

  hide(): void {
    this.element.style.display = 'none';
    this.removeListeners();
  }

  destroy(): void {
    this.removeListeners();
    this.element.remove();
  }

  private setupListeners(): void {
    this.element.querySelectorAll<HTMLElement>('.lang-btn').forEach(btn => {
      btn.addEventListener('click', this.handleLangSelect);
    });
  }

  private removeListeners(): void {
    this.element.querySelectorAll<HTMLElement>('.lang-btn').forEach(btn => {
      btn.removeEventListener('click', this.handleLangSelect);
    });
  }

  private handleLangSelect = (e: Event): void => {
    const btn = e.currentTarget as HTMLButtonElement;
    const lang = btn.dataset.lang as 'id' | 'en';
    i18n.setLocale(lang);
    settingsManager.setLanguage(lang);
    // Tandai bahwa pemain sudah memilih bahasa supaya layar ini tidak muncul
    // lagi pada sesi berikutnya.
    try { localStorage.setItem('languageChosen', lang); } catch { /* ignore */ }
    this.onComplete(lang);
  };
}