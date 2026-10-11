import { UIElement } from './base.js';
import { i18n, t } from '../core/i18n.js';
import { settingsManager } from '../core/settings.js';
import { saveManager, SaveSlot } from '../core/save.js';

export class MainMenuScreen implements UIElement {
  element: HTMLElement;
  private callbacks: {
    onStart: () => void;
    onContinue: () => void;
    onLoad: () => void;
    onChapters: () => void;
    onSettings: () => void;
    onExit: () => void;
    onGallery: () => void;
  };

  constructor(callbacks: MainMenuScreen['callbacks']) {
    this.callbacks = callbacks;
    this.element = this.createElement();
    this.updateText();
    i18n.subscribe(() => this.updateText());
  }

  private createElement(): HTMLElement {
    const div = document.createElement('div');
    div.id = 'main-menu';
    div.className = 'screen main-menu';
    div.innerHTML = `
      <div class="menu-background">
        <canvas id="menu-scene-canvas"></canvas>
        <div class="menu-overlay"></div>
      </div>
      <div class="menu-content">
        <h1 class="menu-title" data-i18n="prologue.title">ASAP YANG TAK PADAM</h1>
        <div class="menu-version">v1.0.0</div>
        <nav class="menu-nav">
          <button id="menu-start" class="ui-btn menu-item primary" data-i18n="menu.start"></button>
          <button id="menu-continue" class="ui-btn menu-item" data-i18n="menu.continue" disabled></button>
          <button id="menu-load" class="ui-btn menu-item" data-i18n="menu.load"></button>
          <button id="menu-chapters" class="ui-btn menu-item" data-i18n="ending.chapterSelect"></button>
          <button id="menu-gallery" class="ui-btn menu-item" data-i18n="menu.gallery"></button>
          <button id="menu-settings" class="ui-btn menu-item" data-i18n="menu.settings"></button>
          <button id="menu-exit" class="ui-btn menu-item danger" data-i18n="menu.exit"></button>
        </nav>
        <div class="menu-footer">
          <div class="language-switcher">
            <button id="lang-id" class="lang-switch-btn" data-lang="id">ID</button>
            <button id="lang-en" class="lang-switch-btn" data-lang="en">EN</button>
          </div>
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
    this.updateContinueButton();
  }

  private updateContinueButton(): void {
    const continueBtn = this.element.querySelector('#menu-continue') as HTMLButtonElement;
    // Harus memakai kandidat yang sama dengan Game.continueGame(), kalau tidak
    // label tombol dan save yang benar-benar dimuat bisa berbeda.
    const pending = saveManager.getContinueSave?.() ?? Promise.resolve(null);
    pending.then((slot: SaveSlot | null) => {
      if (!continueBtn) return;
      continueBtn.disabled = !slot;
      continueBtn.textContent = slot
        ? `${t('menu.continue')} (${slot.label})`
        : t('menu.continue');
    });
  }

  show(): void {
    this.element.style.display = 'flex';
    document.body.appendChild(this.element);
    this.setupListeners();
    this.updateContinueButton();
    this.startBackground();
  }

  hide(): void {
    this.element.style.display = 'none';
    this.removeListeners();
    this.stopBackground();
  }

  destroy(): void {
    this.stopBackground();
    this.removeListeners();
    this.element.remove();
  }

  /**
   * Latar menu: kanvas kecil berisi asap yang merayap pelan ke atas di atas
   * siluet atap desa. Semuanya digambar prosedural: memberi kesan hidup pada
   * layar yang sebelumnya hanya kotak hitam kosong, dengan biaya render yang
   * sangat murah dan berhenti otomatis saat menu ditutup.
   */
  private bgHandle: number | null = null;
  private bgTime = 0;

  private startBackground(): void {
    const canvas = this.element.querySelector('#menu-scene-canvas') as HTMLCanvasElement | null;
    if (!canvas || this.bgHandle !== null) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const embers = Array.from({ length: 34 }, () => ({
      x: Math.random(),
      y: Math.random(),
      speed: 0.008 + Math.random() * 0.02,
      size: 0.6 + Math.random() * 1.8,
      drift: Math.random() * Math.PI * 2,
      alpha: 0.15 + Math.random() * 0.5
    }));

    const resize = (): void => {
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    resize();
    window.addEventListener('resize', resize);

    let last = performance.now();
    const frame = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.bgTime += dt;
      resize();

      const w = canvas.width;
      const h = canvas.height;
      if (!w || !h) {
        this.bgHandle = requestAnimationFrame(frame);
        return;
      }

      // Langit: gradasi dari arang ke merah bara tipis di cakrawala.
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#07070a');
      sky.addColorStop(0.55, '#12100f');
      sky.addColorStop(0.82, '#2a1710');
      sky.addColorStop(1, '#120b09');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      // Bulan samar.
      ctx.beginPath();
      ctx.arc(w * 0.78, h * 0.22, Math.min(w, h) * 0.05, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(214, 226, 232, 0.16)';
      ctx.fill();

      // Siluet pegunungan/hutan: dua lapis yang sedikit berbeda gelapnya.
      const drawRidge = (baseline: number, amp: number, color: string, seed: number): void => {
        ctx.beginPath();
        ctx.moveTo(0, h);
        ctx.lineTo(0, baseline);
        for (let x = 0; x <= w; x += 14) {
          const t = x / w;
          const y = baseline
            - Math.sin(t * 6.0 + seed) * amp
            - Math.sin(t * 13.0 + seed * 2) * amp * 0.35;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
      };
      drawRidge(h * 0.74, h * 0.05, '#171412', 1.3);
      drawRidge(h * 0.84, h * 0.04, '#0d0b0a', 4.1);

      // Asap: gumpalan lembut yang merayap ke atas dan ke samping.
      for (let i = 0; i < 7; i++) {
        const phase = this.bgTime * 0.09 + i * 1.7;
        const cx = w * (0.2 + i * 0.12) + Math.sin(phase) * w * 0.05;
        const cy = h * (1.05 - ((phase * 0.16) % 1.4));
        const r = Math.min(w, h) * (0.16 + i * 0.02);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, 'rgba(126, 116, 106, 0.12)');
        grad.addColorStop(1, 'rgba(126, 116, 106, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }

      // Bara beterbangan pelan.
      for (const e of embers) {
        if (!reduceMotion) {
          e.y -= e.speed * dt;
          if (e.y < -0.05) {
            e.y = 1.05;
            e.x = Math.random();
          }
        }
        const px = (e.x + Math.sin(this.bgTime * 0.6 + e.drift) * 0.015) * w;
        const py = e.y * h;
        const twinkle = 0.6 + Math.sin(this.bgTime * 3 + e.drift) * 0.4;
        ctx.beginPath();
        ctx.arc(px, py, e.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 158, 84, ${(e.alpha * twinkle).toFixed(3)})`;
        ctx.fill();
      }

      this.bgHandle = requestAnimationFrame(frame);
    };

    this.bgHandle = requestAnimationFrame(frame);
    this.bgStopResize = resize;
  }

  private bgStopResize: (() => void) | null = null;

  private stopBackground(): void {
    if (this.bgHandle !== null) {
      cancelAnimationFrame(this.bgHandle);
      this.bgHandle = null;
    }
    if (this.bgStopResize) {
      window.removeEventListener('resize', this.bgStopResize);
      this.bgStopResize = null;
    }
  }

  private setupListeners(): void {
    const startBtn = this.element.querySelector('#menu-start');
    const continueBtn = this.element.querySelector('#menu-continue');
    const loadBtn = this.element.querySelector('#menu-load');
    const chaptersBtn = this.element.querySelector('#menu-chapters');
    const galleryBtn = this.element.querySelector('#menu-gallery');
    const settingsBtn = this.element.querySelector('#menu-settings');
    const exitBtn = this.element.querySelector('#menu-exit');
    const langIdBtn = this.element.querySelector('#lang-id');
    const langEnBtn = this.element.querySelector('#lang-en');

    startBtn?.addEventListener('click', this.callbacks.onStart);
    continueBtn?.addEventListener('click', this.callbacks.onContinue);
    loadBtn?.addEventListener('click', this.callbacks.onLoad);
    chaptersBtn?.addEventListener('click', this.callbacks.onChapters);
    galleryBtn?.addEventListener('click', this.callbacks.onGallery);
    settingsBtn?.addEventListener('click', this.callbacks.onSettings);
    exitBtn?.addEventListener('click', this.callbacks.onExit);
    langIdBtn?.addEventListener('click', this.onLangId);
    langEnBtn?.addEventListener('click', this.onLangEn);
  }

  private removeListeners(): void {
    const startBtn = this.element.querySelector('#menu-start');
    const continueBtn = this.element.querySelector('#menu-continue');
    const loadBtn = this.element.querySelector('#menu-load');
    const chaptersBtn = this.element.querySelector('#menu-chapters');
    const galleryBtn = this.element.querySelector('#menu-gallery');
    const settingsBtn = this.element.querySelector('#menu-settings');
    const exitBtn = this.element.querySelector('#menu-exit');
    const langIdBtn = this.element.querySelector('#lang-id');
    const langEnBtn = this.element.querySelector('#lang-en');

    startBtn?.removeEventListener('click', this.callbacks.onStart);
    continueBtn?.removeEventListener('click', this.callbacks.onContinue);
    loadBtn?.removeEventListener('click', this.callbacks.onLoad);
    chaptersBtn?.removeEventListener('click', this.callbacks.onChapters);
    galleryBtn?.removeEventListener('click', this.callbacks.onGallery);
    settingsBtn?.removeEventListener('click', this.callbacks.onSettings);
    exitBtn?.removeEventListener('click', this.callbacks.onExit);
    langIdBtn?.removeEventListener('click', this.onLangId);
    langEnBtn?.removeEventListener('click', this.onLangEn);
  }

  private onLangId = (): void => this.switchLanguage('id');
  private onLangEn = (): void => this.switchLanguage('en');

  private switchLanguage(lang: 'id' | 'en'): void {
    i18n.setLocale(lang);
    settingsManager.setLanguage(lang);
    try { localStorage.setItem('languageChosen', lang); } catch { /* ignore */ }
    this.updateText();
    this.updateLanguageButtons(lang);
  }

  private updateLanguageButtons(activeLang: 'id' | 'en'): void {
    this.element.querySelectorAll<HTMLElement>('.lang-switch-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === activeLang);
    });
  }

  refresh(): void {
    this.updateContinueButton();
  }
}