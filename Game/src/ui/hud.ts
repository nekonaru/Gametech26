import { UIManager, UIElement, escapeHtml } from './base.js';
import { i18n, t } from '../core/i18n.js';
import { settingsManager } from '../core/settings.js';
import { ITEM_ICON } from './inventory.js';
import { eventBus } from '../core/events.js';

/** Kompas HUD: piksel per derajat (tampilan ±90 derajat pada lebar 260px). */
const COMPASS_PX_PER_DEG = 1.4;
const COMPASS_W = 260;

export class HUD implements UIElement {
  element: HTMLElement;
  private objectiveElement: HTMLElement | null = null;
  private crosshairElement: HTMLElement | null = null;
  private dayIndicatorElement: HTMLElement | null = null;
  private flashlightElement: HTMLElement | null = null;
  private interactionPromptElement: HTMLElement | null = null;
  private pointerHintElement: HTMLElement | null = null;
  private sensoryElement: HTMLElement | null = null;
  private vignetteElement: HTMLElement | null = null;
  private hotbarSlotsElement: HTMLElement | null = null;
  private hotbarItems: string[] = [];
  /** Popup keterangan item hotbar (tombol angka / hover) + status pilihannya. */
  private hotbarPopupElement: HTMLElement | null = null;
  private hotbarSelected = -1;
  private hotbarPopupTimer: number | null = null;
  /** Daftar petunjuk tombol kontekstual di sisi kanan layar. */
  private keyHintsElement: HTMLElement | null = null;
  private compassElement: HTMLElement | null = null;
  private compassTape: HTMLElement | null = null;
  private compassGoal: HTMLElement | null = null;
  private lastCompassHeading = Number.NaN;
  private lastCompassRel = Number.NaN;
  private sensoryTimer: number | null = null;
  private flickerTimer: number | null = null;
  private visible = true;
  private touchControlsElement: HTMLElement | null = null;
  private coarsePointer = false;
  private runIndicator: HTMLElement | null = null;

  constructor() {
    this.element = this.createElement();
    // Deteksi perangkat sentuh sekali; dipakai prompt, petunjuk, dan visibilitas
    // kontrol sentuh. MediaQueryList ikut berubah bila perangkat berpindah.
    this.coarsePointer = typeof matchMedia === 'function'
      && matchMedia('(pointer: coarse)').matches;
    this.cacheElements();
    this.updateText();
    i18n.subscribe(() => this.updateText());
    // Rebind kunci harus langsung tercermin di prompt interaksi.
    settingsManager.subscribe(() => this.updatePromptKey());
    this.wireTouchControls();
  }

  private createElement(): HTMLElement {
    const div = document.createElement('div');
    div.id = 'hud';
    div.className = 'hud';
    div.innerHTML = `
      <div id="crosshair" class="crosshair"></div>
      <div id="objective" class="objective hidden">
        <span class="objective-label" data-i18n="ui.objective"></span>
        <span class="objective-text"></span>
      </div>
      <div id="compass" class="compass hidden" aria-hidden="true">
        <div class="compass-tape"></div>
        <div class="compass-goal hidden"></div>
        <div class="compass-caret"></div>
      </div>
      <div id="day-indicator" class="day-indicator hidden">
        <span class="day-text"></span>
      </div>
      <div id="flashlight-indicator" class="flashlight-indicator hidden">
        <span class="flashlight-icon">🔦</span>
        <div class="battery-bar"><div class="battery-fill"></div></div>
      </div>
      <div id="interaction-prompt" class="interaction-prompt hidden">
        <span class="prompt-icon" aria-hidden="true"></span>
        <span class="prompt-goal-tag" aria-hidden="true"></span>
        <span class="prompt-key">E</span>
        <span class="prompt-text" data-i18n="ui.interact"></span>
      </div>
      <div id="pointer-hint" class="pointer-hint hidden">
        <span data-i18n="ui.clickToLook"></span>
      </div>
      <div id="hotbar" class="hotbar" aria-label="hotbar">
        <div class="hotbar-slots"></div>
      </div>
      <div id="hotbar-popup" class="hotbar-popup hidden" aria-live="polite"></div>
      <div id="key-hints" class="key-hints hidden" aria-label="key hints"></div>
      <div id="touch-controls" class="touch-controls hidden" aria-label="touch controls">
        <button type="button" class="touch-btn touch-run" data-action="run" aria-label="run"></button>
        <button type="button" class="touch-btn" data-action="interact" aria-label="interact"></button>
        <button type="button" class="touch-btn" data-action="flashlight" aria-label="flashlight"></button>
        <button type="button" class="touch-btn" data-action="phone" aria-label="phone"></button>
        <button type="button" class="touch-btn" data-action="journal" aria-label="journal"></button>
        <button type="button" class="touch-btn" data-action="inventory" aria-label="inventory"></button>
        <button type="button" class="touch-btn" data-action="pause" aria-label="pause"></button>
      </div>
      <div id="sensory-text" class="sensory-text hidden"></div>
      <div id="horror-vignette" class="horror-vignette"></div>
    `;
    return div;
  }

  private updateText(): void {
    this.element.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
    });
    this.updatePromptKey();
    this.updateTouchLabels();
    // Nama barang di hotbar ikut bahasa yang aktif.
    this.renderHotbar(this.hotbarItems, new Set());
  }

  /** Label (aria/title) tombol sentuh mengikuti bahasa yang aktif. */
  private updateTouchLabels(): void {
    const labels: Record<string, string> = {
      run: 'controls.run', interact: 'ui.interact', flashlight: 'ui.keys.flashlight',
      phone: 'ui.keys.phone', journal: 'ui.keys.journal',
      inventory: 'ui.keys.inventory', pause: 'ui.keys.pause'
    };
    this.touchControlsElement?.querySelectorAll<HTMLElement>('.touch-btn').forEach(btn => {
      const labelKey = labels[btn.dataset.action ?? ''];
      const label = labelKey ? t(labelKey) : (btn.dataset.action ?? '');
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
    });
  }

  /**
   * Tombol yang ditulis di prompt harus mengikuti kunci yang benar-benar
   * dipakai pemain: kalau interaksi dipindah ke F tapi prompt tetap bilang
   * "E", pemain kebingungan mencari tombol yang salah.
   */
  private updatePromptKey(): void {
    const el = this.interactionPromptElement?.querySelector('.prompt-key');
    if (!el) return;
    // Perangkat sentuh tidak punya tombol "E": pakai ajakan mengetuk layar.
    if (this.coarsePointer) {
      el.textContent = t('ui.touchTap');
      return;
    }
    const binding = settingsManager.get('controls')?.keyBindings?.interact || 'KeyE';
    const names: Record<string, string> = {
      Space: 'Space',
      ShiftLeft: 'Shift',
      ShiftRight: 'Shift',
      ControlLeft: 'Ctrl',
      ControlRight: 'Ctrl',
      AltLeft: 'Alt',
      AltRight: 'Alt',
      Escape: 'Esc',
      Enter: 'Enter'
    };
    let label = names[binding];
    if (!label) {
      if (binding.startsWith('Key')) label = binding.slice(3);
      else if (binding.startsWith('Digit')) label = binding.slice(5);
      else label = binding;
    }
    el.textContent = label;
  }

  show(): void {
    this.element.style.display = 'block';
    document.body.appendChild(this.element);
    this.cacheElements();
  }

  hide(): void {
    this.element.style.display = 'none';
  }

  destroy(): void {
    if (this.sensoryTimer !== null) window.clearTimeout(this.sensoryTimer);
    if (this.flickerTimer !== null) window.clearTimeout(this.flickerTimer);
    if (this.hotbarPopupTimer !== null) window.clearTimeout(this.hotbarPopupTimer);
    this.element.remove();
  }

  private cacheElements(): void {
    this.objectiveElement = this.element.querySelector('#objective');
    this.crosshairElement = this.element.querySelector('#crosshair');
    this.dayIndicatorElement = this.element.querySelector('#day-indicator');
    this.flashlightElement = this.element.querySelector('#flashlight-indicator');
    this.interactionPromptElement = this.element.querySelector('#interaction-prompt');
    this.pointerHintElement = this.element.querySelector('#pointer-hint');
    this.sensoryElement = this.element.querySelector('#sensory-text');
    this.hotbarSlotsElement = this.element.querySelector('.hotbar-slots');
    this.hotbarPopupElement = this.element.querySelector('#hotbar-popup');
    this.keyHintsElement = this.element.querySelector('#key-hints');
    this.vignetteElement = this.element.querySelector('#horror-vignette');
    this.compassElement = this.element.querySelector('#compass');
    this.compassTape = this.element.querySelector('.compass-tape');
    this.compassGoal = this.element.querySelector('.compass-goal');
    this.touchControlsElement = this.element.querySelector('#touch-controls');
    this.buildCompassTape();
  }

  /** Isi pita kompas: huruf mata angin di kelipatan 90 derajat + tick 45. */
  private buildCompassTape(): void {
    const tape = this.compassTape;
    if (!tape || tape.childElementCount > 0) return;
    const parts: string[] = [];
    for (let bearing = -180; bearing <= 540; bearing += 45) {
      const x = ((bearing + 180) * COMPASS_PX_PER_DEG).toFixed(1);
      const norm = ((bearing % 360) + 360) % 360;
      if (norm % 90 === 0) {
        const key = norm === 0 ? 'compass.n' : norm === 90 ? 'compass.e' : norm === 180 ? 'compass.s' : 'compass.w';
        parts.push(`<span class="c-mark major" data-i18n="${key}" style="left:${x}px"></span>`);
      } else {
        parts.push(`<i class="c-mark tick" style="left:${x}px"></i>`);
      }
    }
    tape.innerHTML = parts.join('');
  }

  setObjective(text: string): void {
    if (this.objectiveElement) {
      const textEl = this.objectiveElement.querySelector('.objective-text');
      if (textEl) {
        const changed = textEl.textContent !== text;
        textEl.textContent = text;
        this.objectiveElement.classList.remove('hidden');
        // Objektif baru harus terlihat: mainkan animasi sorotan sekali saja
        // saat isinya benar-benar berubah (bukan tiap frame/ulang event).
        if (changed) {
          this.objectiveElement.classList.remove('objective-updated');
          void this.objectiveElement.offsetWidth; // paksa reflow
          this.objectiveElement.classList.add('objective-updated');
        }
      }
    }
  }

  clearObjective(): void {
    if (this.objectiveElement) {
      this.objectiveElement.classList.add('hidden');
    }
  }

  /**
   * Kompas kecil di tengah atas layar. Pita mata angin bergulir mengikuti
   * arah pandang; pip emas menunjuk penanda objektif utama, menempel di tepi
   * bila sasaran ada di belakang pemain. Dipanggil tiap frame oleh
   * updatePropPulse, tapi DOM hanya disentuh bila sudutnya benar-benar
   * berubah supaya tidak membebani render.
   */
  setCompass(headingRad: number, goalRelRad: number | null): void {
    const el = this.compassElement;
    if (!el) return;
    el.classList.remove('hidden');

    const heading = ((headingRad * 180 / Math.PI) % 360 + 360) % 360;
    const tape = this.compassTape;
    if (tape) {
      let headingChanged = false;
      if (Number.isNaN(this.lastCompassHeading)) {
        this.lastCompassHeading = heading;
        headingChanged = true;
      } else {
        // Delta busur terpendek supaya garis 360/0 tidak dianggap lompatan.
        const delta = ((heading - this.lastCompassHeading + 540) % 360) - 180;
        if (Math.abs(delta) >= 0.2) {
          this.lastCompassHeading = heading;
          headingChanged = true;
        }
      }
      if (headingChanged) {
        const x = COMPASS_W / 2 - (heading + 180) * COMPASS_PX_PER_DEG;
        tape.style.transform = `translateX(${x.toFixed(1)}px)`;
      }
    }

    const pip = this.compassGoal;
    if (!pip) return;
    if (goalRelRad === null) {
      if (!pip.classList.contains('hidden')) pip.classList.add('hidden');
      this.lastCompassRel = Number.NaN;
      return;
    }
    const rel = goalRelRad * 180 / Math.PI;
    if (!Number.isNaN(this.lastCompassRel) && Math.abs(rel - this.lastCompassRel) < 0.3) return;
    this.lastCompassRel = rel;
    pip.classList.remove('hidden');
    const raw = COMPASS_W / 2 + rel * COMPASS_PX_PER_DEG;
    const clamped = Math.max(10, Math.min(COMPASS_W - 10, raw));
    pip.classList.toggle('edge', clamped !== raw);
    pip.style.left = `${clamped.toFixed(1)}px`;
  }

  /**
   * Perbarui hotbar: baris kotak item di bawah layar (ala Minecraft).
   * Slot kosong tetap tampil supaya pemain tahu masih ada ruang di tas, dan
   * slot berisi barang baru mendapat kilat animasi `item-new`.
   */
  setHotbar(items: string[]): void {
    const prev = new Set(this.hotbarItems);
    const fresh = new Set(items.filter(id => !prev.has(id)));
    this.renderHotbar(items, fresh);
  }

  private renderHotbar(items: string[], fresh: Set<string>): void {
    this.hotbarItems = [...items];
    if (this.hotbarSelected >= items.length) this.hotbarSelected = -1;
    const slots = this.hotbarSlotsElement
      ?? (this.hotbarSlotsElement = this.element.querySelector('.hotbar-slots'));
    if (!slots) return;
    const SLOTS = Math.max(9, items.length);
    const cells: string[] = [];
    for (let i = 0; i < SLOTS; i++) {
      const id = items[i];
      if (!id) {
        cells.push('<div class="hotbar-slot empty" aria-hidden="true"></div>');
        continue;
      }
      const icon = ITEM_ICON[id] ?? '📦';
      const nameKey = `item.${id}.name`;
      const name = i18n.hasKey(nameKey) ? t(nameKey) : id;
      const selected = i === this.hotbarSelected ? ' selected' : '';
      cells.push(
        `<div class="hotbar-slot${selected}${fresh.has(id) ? ' item-new' : ''}" data-index="${i}" title="${escapeHtml(name)}">`
        + `<span class="hotbar-icon" aria-hidden="true">${icon}</span></div>`
      );
    }
    slots.innerHTML = cells.join('');
    // Slot berisi bisa disorot kursor (saat kursor bebas) dan langsung
    // menampilkan keterangan singkat tanpa menekan tombol angka. Klik juga
    // dipakai di layar sentuh, di mana tidak ada mouseenter.
    slots.querySelectorAll<HTMLElement>('.hotbar-slot:not(.empty)').forEach(slot => {
      const index = Number(slot.dataset.index);
      slot.addEventListener('mouseenter', () => this.showHotbarInfo(index));
      slot.addEventListener('click', () => this.selectHotbarSlot(index));
    });
  }

  /**
   * Pilih slot hotbar lewat tombol angka 1-9: sorot slot dan tampilkan
   * keterangan nama + fungsi item sebagai popup beberapa detik. Berguna
   * saat kursor terkunci dan tidak ada tooltip mouse.
   */
  selectHotbarSlot(index: number): void {
    if (index < 0 || index >= this.hotbarItems.length) return;
    this.hotbarSelected = index;
    this.renderHotbar(this.hotbarItems, new Set());
    this.showHotbarInfo(index);
  }

  private showHotbarInfo(index: number): void {
    const id = this.hotbarItems[index];
    if (!id || !this.hotbarPopupElement) return;
    const nameKey = `item.${id}.name`;
    const descKey = `item.${id}.desc`;
    const name = i18n.hasKey(nameKey) ? t(nameKey) : id;
    const desc = i18n.hasKey(descKey) ? t(descKey) : '';
    this.hotbarPopupElement.innerHTML = `<span class="hp-num">${index + 1}</span>`
      + `<span class="hp-name">${escapeHtml(name)}</span>`
      + `<span class="hp-desc">${escapeHtml(desc)}</span>`;
    this.hotbarPopupElement.classList.remove('hidden');
    if (this.hotbarPopupTimer !== null) window.clearTimeout(this.hotbarPopupTimer);
    this.hotbarPopupTimer = window.setTimeout(() => {
      this.hotbarPopupElement?.classList.add('hidden');
      this.hotbarPopupTimer = null;
    }, 3000);
  }

  /** Ganti daftar petunjuk tombol kontekstual (null = sembunyikan). */
  setKeyHints(items: Array<{ key: string; label: string }> | null): void {
    if (!this.keyHintsElement) return;
    if (!items || !items.length) {
      this.keyHintsElement.classList.add('hidden');
      return;
    }
    this.keyHintsElement.innerHTML = items.map(item =>
      `<span class="kh-row"><span class="kh-key">${escapeHtml(item.key)}</span>`
      + `<span class="kh-label">${escapeHtml(item.label)}</span></span>`
    ).join('');
    this.keyHintsElement.classList.remove('hidden');
  }

  setDayIndicator(hari: number, babak: string, pov: string): void {
    if (this.dayIndicatorElement) {
      const textEl = this.dayIndicatorElement.querySelector('.day-text');
      if (textEl) {
        textEl.textContent = `${t('ui.day')} ${hari} - ${babak} (${pov})`;
        this.dayIndicatorElement.classList.remove('hidden');
        setTimeout(() => this.dayIndicatorElement?.classList.add('hidden'), 5000);
      }
    }
  }

  setFlashlightVisible(visible: boolean, battery = 1): void {
    if (this.flashlightElement) {
      if (visible) {
        this.flashlightElement.classList.remove('hidden');
        const fill = this.flashlightElement.querySelector('.battery-fill') as HTMLElement;
        if (fill) fill.style.width = `${battery * 100}%`;
      } else {
        this.flashlightElement.classList.add('hidden');
      }
    }
  }

  /**
   * @param goal Tujuan cerita (disorot emas + label) atau interaksi biasa
   * (netral). Prompt dipisah visualnya supaya pemain langsung tahu mana yang
   * menggerakkan alur dan mana yang sekadar pemeriksaan.
   */
  setInteractionPrompt(text: string, show: boolean, goal = false): void {
    if (this.interactionPromptElement) {
      const textEl = this.interactionPromptElement.querySelector('.prompt-text');
      if (textEl) {
        textEl.textContent = text;
      }
      const tagEl = this.interactionPromptElement.querySelector('.prompt-goal-tag');
      if (tagEl) {
        tagEl.textContent = goal ? t('ui.objectiveTag') : '';
      }
      this.interactionPromptElement.classList.toggle('prompt-is-goal', show && goal);
      this.interactionPromptElement.classList.toggle('prompt-is-ambient', show && !goal);
      if (show) {
        this.interactionPromptElement.classList.remove('hidden');
      } else {
        this.interactionPromptElement.classList.add('hidden');
      }
    }
  }

  setCrosshairVisible(visible: boolean): void {
    if (this.crosshairElement) {
      this.crosshairElement.style.display = visible ? 'block' : 'none';
    }
  }

  /**
   * Retikel membesar dan menyala saat ada objek interaktif yang benar-benar
   * bisa dicapai: umpan balik utama agar pemain tahu arah mana yang perlu
   * dipandang, bukan sekadar titik statis di tengah layar.
   */
  setCrosshairTarget(targeted: boolean): void {
    if (!this.crosshairElement) return;
    this.crosshairElement.classList.toggle('targeted', targeted);
  }

  /**
   * Baris naratif sensoris ("tercium bau asap…"): muncul pelan di bawah
   * retikel lalu memudar, menggantikan deskripsi yang sebelumnya hilang begitu
   * saja karena event-nya tidak punya pendengar.
   */
  showSensoryText(text: string, durationMs = 4000): void {
    if (!this.sensoryElement || !text) return;
    if (this.sensoryTimer !== null) window.clearTimeout(this.sensoryTimer);
    this.sensoryElement.textContent = text;
    this.sensoryElement.classList.remove('hidden', 'fading');
    this.sensoryTimer = window.setTimeout(() => {
      this.sensoryElement?.classList.add('fading');
      this.sensoryTimer = window.setTimeout(() => {
        this.sensoryElement?.classList.add('hidden');
        this.sensoryTimer = null;
      }, 700);
    }, Math.max(800, durationMs));
  }

  /**
   * Redupan tepi layar untuk peristiwa horor (kilatan lampu, suara napas).
   * Dipakai sebagai "jeda" visual yang halus; intensitas 0..1.
   */
  flashHorror(intensity = 0.5, durationMs = 900): void {
    if (!this.vignetteElement) return;
    const reduce = settingsManager.get('accessibility')?.reduceFlashing;
    const safeIntensity = reduce ? Math.min(intensity, 0.3) * 0.5 : intensity;
    this.vignetteElement.style.setProperty('--horror-strength', safeIntensity.toFixed(2));
    this.vignetteElement.classList.add('active');
    if (this.flickerTimer !== null) window.clearTimeout(this.flickerTimer);
    this.flickerTimer = window.setTimeout(() => {
      this.vignetteElement?.classList.remove('active');
      this.flickerTimer = null;
    }, durationMs);
  }

  /** Shown while playing on desktop when pointer lock is not active. */
  setPointerHint(visible: boolean): void {
    if (!this.pointerHintElement) return;
    this.pointerHintElement.classList.toggle('hidden', !visible);
  }

  /**
   * Kontrol layar sentuh hanya tampil di perangkat sentuh dan selama benar-benar
   * sedang bermain (tidak saat dialog/teka-teki/menu menutup layar).
   */
  setTouchControlsVisible(visible: boolean): void {
    if (!this.touchControlsElement) return;
    this.touchControlsElement.classList.toggle('hidden', !visible);
  }

  /** Sorot tombol Lari agar pemain tahu sakelar lari sedang aktif. */
  setTouchRunActive(active: boolean): void {
    this.runIndicator?.classList.toggle('active', active);
  }

  /**
   * Pasang satu handler delegasi untuk semua tombol sentuh. Setiap tombol
   * memancarkan `hud:touchAction` yang ditangani main.ts memakai penjaga yang
   * sama persis dengan pintasan keyboard, jadi tidak ada jalur alternatif yang
   * bisa membuka layar di saat seharusnya terkunci.
   */
  private wireTouchControls(): void {
    const icons: Record<string, string> = {
      run: '≫', interact: '◉', flashlight: '☀', phone: '☎',
      journal: '☰', inventory: '▦', pause: '❚❚'
    };
    this.touchControlsElement?.querySelectorAll<HTMLElement>('.touch-btn').forEach(btn => {
      const action = btn.dataset.action ?? '';
      btn.textContent = icons[action] ?? '';
      if (action === 'run') this.runIndicator = btn;
      btn.addEventListener('click', (e) => {
        // Tombol di atas kanvas: cegah gerakan menoleh tersentak saat menekan.
        e.stopPropagation();
        // Umpan balik getar singkat (opsional; HP tanpa motor getar diabaikan
        // browser tanpa error) supaya pemain tahu tombol benar-benar terkena.
        try {
          navigator.vibrate?.(12);
        } catch { /* platform tanpa getar: abaikan */ }
        eventBus.emit('hud:touchAction', { action });
      });
    });
    this.updateTouchLabels();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.element.style.display = visible ? 'block' : 'none';
  }
}

export class DaySummaryScreen implements UIElement {
  element: HTMLElement;
  private onContinue: () => void;
  private data: {
    hari: number;
    cluesFound: number;
    cluesTotal: number;
    cluesMissed: string[];
    importantNotes: string[];
  } | null = null;

  constructor(onContinue: () => void) {
    this.onContinue = onContinue;
    this.element = this.createElement();
    this.updateText();
    i18n.subscribe(() => this.updateText());
  }

  private createElement(): HTMLElement {
    const div = document.createElement('div');
    div.id = 'day-summary';
    div.className = 'screen day-summary';
    div.innerHTML = `
      <div class="summary-content">
        <h2 class="summary-title" data-i18n="ui.day">Hari 1</h2>
        <div class="summary-section">
          <h3 data-i18n="journal.clues"></h3>
          <div class="clues-summary">
            <div class="clue-count">
              <span class="found">0</span> / <span class="total">0</span>
              <span class="label" data-i18n="journal.clues"></span>
            </div>
            <div class="missed-clues hidden">
              <h4 data-i18n="ui.warning"></h4>
              <ul class="missed-list"></ul>
            </div>
          </div>
        </div>
        <div class="summary-section">
          <h3 data-i18n="journal.notes"></h3>
          <ul class="notes-list"></ul>
        </div>
        <button id="summary-continue" class="ui-btn primary" data-i18n="ui.continue"></button>
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

  setData(data: DaySummaryScreen['data']): void {
    this.data = data;
    this.render();
  }

  private render(): void {
    if (!this.data) return;

    const title = this.element.querySelector('.summary-title');
    if (title) title.textContent = `${t('ui.day')} ${this.data.hari}`;

    const foundEl = this.element.querySelector('.found');
    const totalEl = this.element.querySelector('.total');
    if (foundEl) foundEl.textContent = this.data.cluesFound.toString();
    if (totalEl) totalEl.textContent = this.data.cluesTotal.toString();

    const missedSection = this.element.querySelector('.missed-clues') as HTMLElement;
    const missedList = this.element.querySelector('.missed-list') as HTMLElement;
    if (this.data.cluesMissed.length > 0) {
      missedSection?.classList.remove('hidden');
      missedList.innerHTML = this.data.cluesMissed.map(c => `<li>${c}</li>`).join('');
    } else {
      missedSection?.classList.add('hidden');
    }

    const notesList = this.element.querySelector('.notes-list') as HTMLElement;
    notesList.innerHTML = this.data.importantNotes.map(n => `<li>${n}</li>`).join('');
  }

  private setupListeners(): void {
    const continueBtn = this.element.querySelector('#summary-continue');
    continueBtn?.addEventListener('click', this.onContinue);
  }

  private removeListeners(): void {
    const continueBtn = this.element.querySelector('#summary-continue');
    continueBtn?.removeEventListener('click', this.onContinue);
  }
}