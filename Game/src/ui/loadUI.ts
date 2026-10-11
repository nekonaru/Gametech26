import { UIElement, confirmAction } from './base.js';
import { i18n, t } from '../core/i18n.js';
import { saveManager, SaveSlot } from '../core/save.js';

export class LoadGameScreen implements UIElement {
  element: HTMLElement;
  private onBack: () => void;
  private onLoad: (slot: SaveSlot) => void;
  private onSave?: (slotId: string) => void;
  private slots: SaveSlot[] = [];
  /** 'load' = layar muat (dari menu/jeda); 'save' = layar simpan (dari jeda). */
  private mode: 'load' | 'save' = 'load';

  constructor(onBack: () => void, onLoad: (slot: SaveSlot) => void, opts?: { onSave?: (slotId: string) => void }) {
    this.onBack = onBack;
    this.onLoad = onLoad;
    this.onSave = opts?.onSave;
    this.element = this.createElement();
    this.updateText();
    i18n.subscribe(() => this.updateText());
  }

  /** Ganti mode layar: judul, daftar slot, dan tombol aksi ikut berubah. */
  setMode(mode: 'load' | 'save'): void {
    if (this.mode === mode) return;
    this.mode = mode;
    const h2 = this.element.querySelector('.load-header h2');
    if (h2) h2.setAttribute('data-i18n', mode === 'save' ? 'ui.save' : 'menu.load');
    this.updateText();
    void this.refresh();
  }

  private createElement(): HTMLElement {
    const div = document.createElement('div');
    div.id = 'load-screen';
    div.className = 'screen load-screen';
    div.innerHTML = `
      <div class="load-container">
        <header class="load-header">
          <h2 data-i18n="menu.load"></h2>
          <button id="load-back" class="ui-btn back-btn" data-i18n="ui.back"></button>
        </header>
        <div class="load-slots" id="load-slots"></div>
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
    this.refresh();
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
    const backBtn = this.element.querySelector('#load-back');
    backBtn?.addEventListener('click', this.onBack);
  }

  private removeListeners(): void {
    const backBtn = this.element.querySelector('#load-back');
    backBtn?.removeEventListener('click', this.onBack);
  }

  async refresh(): Promise<void> {
    this.slots = await saveManager.getAllSaves();
    this.renderSlots();
  }

  private renderSlots(): void {
    const container = this.element.querySelector('#load-slots') as HTMLElement;
    container.innerHTML = '';

    const slotConfigs: Array<{ id: string; label: string; readOnly?: boolean }> = [
      { id: 'slot-1', label: 'Slot 1' },
      { id: 'slot-2', label: 'Slot 2' },
      { id: 'slot-3', label: 'Slot 3' },
      { id: 'slot-4', label: 'Slot 4' },
      { id: 'slot-5', label: 'Slot 5' },
      // Autosave hanya bisa ditimpa oleh sistem (awal/akhir bab), bukan pemain.
      { id: 'autosave', label: t('ui.autosave'), readOnly: this.mode === 'save' },
      ...(this.mode === 'load'
        ? this.slots.filter(s => s.id.startsWith('checkpoint-')).map(s => ({ id: s.id, label: `Checkpoint: ${s.label}` }))
        : [])
    ];

    slotConfigs.forEach(config => {
      const slot = this.slots.find(s => s.id === config.id);
      const slotEl = document.createElement('div');
      slotEl.className = `save-slot ${slot ? 'occupied' : 'empty'}`;
      slotEl.dataset.slotId = config.id;

      const data = slot?.data;
      if (slot && data) {
        const raw = data as any;
        const playtime = this.formatTime(Number(raw.playtimeSec ?? raw.playtime ?? 0) || 0);
        const date = new Date(data.createdAt || Date.now()).toLocaleString();
        const hari = raw.hari ?? raw.location?.hari ?? '-';
        const jam = raw.jam ?? raw.location?.jam ?? '';
        const pov = data.pov ? String(data.pov).toUpperCase() : '';
        slotEl.innerHTML = `
          <div class="slot-info">
            <div class="slot-label">${config.label}</div>
            <div class="slot-meta">${t('ui.day')} ${hari} - ${jam} (${pov})</div>
            <div class="slot-meta">${playtime} | ${date}</div>
          </div>
          <div class="slot-actions">
            ${this.mode === 'save' && !config.readOnly
              ? '<button class="ui-btn small save-btn" data-action="save" data-i18n="ui.save"></button>'
              : ''}
            <button class="ui-btn small load-btn" data-action="load" data-i18n="ui.load"></button>
            <button class="ui-btn small export-btn" data-action="export" data-i18n="ui.export"></button>
            <button class="ui-btn small delete-btn" data-action="delete" data-i18n="ui.delete"></button>
          </div>
        `;
      } else {
        slotEl.innerHTML = `
          <div class="slot-info">
            <div class="slot-label">${config.label}</div>
            <div class="slot-meta empty" data-i18n="ui.empty"></div>
          </div>
          <div class="slot-actions">
            ${this.mode === 'save' && !config.readOnly
              ? '<button class="ui-btn small save-btn" data-action="save" data-i18n="ui.save"></button>'
              : ''}
          </div>
        `;
      }

      container.appendChild(slotEl);
    });

    container.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
    });
    this.setupSlotListeners();
  }

  private setupSlotListeners(): void {
    this.element.querySelectorAll<HTMLElement>('.save-slot').forEach(slotEl => {
      slotEl.querySelectorAll<HTMLElement>('button').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;
          const slotId = slotEl.dataset.slotId!;
          const slot = this.slots.find(s => s.id === slotId);

          // Simpan boleh menyasar slot yang masih kosong; aksi lain
          // (muat/ekspor/hapus) butuh save yang benar-benar ada.
          if (action === 'save') {
            void this.handleSaveAction(slotId, slot);
            return;
          }
          if (!slot) return;

          switch (action) {
            case 'load':
              this.onLoad(slot);
              break;
            case 'export':
              this.exportSlot(slot);
              break;
            case 'delete':
              this.deleteSlot(slotId);
              break;
          }
        });
      });
    });
  }

  private async handleSaveAction(slotId: string, existing?: SaveSlot): Promise<void> {
    if (existing) {
      const ok = await confirmAction(t('ui.overwrite'), {
        title: t('ui.save'),
        confirmLabel: t('ui.yes'),
        cancelLabel: t('ui.no')
      });
      if (!ok) return;
    }
    this.onSave?.(slotId);
  }

  private async exportSlot(slot: SaveSlot): Promise<void> {
    const json = await saveManager.exportSave(slot.id);
    if (json) {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `asap-save-${slot.id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  private async deleteSlot(slotId: string): Promise<void> {
    const ok = await confirmAction(t('ui.confirm') || 'Delete this save?', {
      title: t('ui.delete'),
      confirmLabel: t('ui.yes'),
      cancelLabel: t('ui.no')
    });
    if (ok) {
      await saveManager.deleteSlot(slotId);
      this.refresh();
    }
  }

  private formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${m}m ${s}s`;
  }
}

export class PauseMenu implements UIElement {
  element: HTMLElement;
  private callbacks: {
    onResume: () => void;
    onSave: () => void;
    onLoad: () => void;
    onJournal: () => void;
    onInventory: () => void;
    onBoard: () => void;
    onSettings: () => void;
    onControls: () => void;
    onMainMenu: () => void;
  };

  constructor(callbacks: PauseMenu['callbacks']) {
    this.callbacks = callbacks;
    this.element = this.createElement();
    this.updateText();
    i18n.subscribe(() => this.updateText());
  }

  private createElement(): HTMLElement {
    const div = document.createElement('div');
    div.id = 'pause-menu';
    div.className = 'screen pause-menu';
    div.innerHTML = `
      <div class="pause-overlay"></div>
      <div class="pause-content">
        <h2 data-i18n="ui.pause"></h2>
        <nav class="pause-nav">
          <button id="pause-resume" class="ui-btn pause-item" data-i18n="ui.resume"></button>
          <button id="pause-save" class="ui-btn pause-item" data-i18n="ui.save"></button>
          <button id="pause-settings" class="ui-btn pause-item" data-i18n="menu.settings"></button>
          <button id="pause-mainmenu" class="ui-btn pause-item danger" data-i18n="menu.mainMenu"></button>
          <div class="pause-divider" aria-hidden="true"></div>
          <button id="pause-load" class="ui-btn pause-item" data-i18n="ui.load"></button>
          <button id="pause-journal" class="ui-btn pause-item" data-i18n="ui.journal"></button>
          <button id="pause-inventory" class="ui-btn pause-item" data-i18n="ui.inventory"></button>
          <button id="pause-board" class="ui-btn pause-item" data-i18n="journal.evidenceBoard"></button>
          <button id="pause-controls" class="ui-btn pause-item" data-i18n="ui.controls"></button>
        </nav>
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

  private setupListeners(): void {
    const resumeBtn = this.element.querySelector('#pause-resume');
    const saveBtn = this.element.querySelector('#pause-save');
    const loadBtn = this.element.querySelector('#pause-load');
    const journalBtn = this.element.querySelector('#pause-journal');
    const inventoryBtn = this.element.querySelector('#pause-inventory');
    const boardBtn = this.element.querySelector('#pause-board');
    const controlsBtn = this.element.querySelector('#pause-controls');
    const settingsBtn = this.element.querySelector('#pause-settings');
    const mainMenuBtn = this.element.querySelector('#pause-mainmenu');
    const overlay = this.element.querySelector('.pause-overlay');

    resumeBtn?.addEventListener('click', this.callbacks.onResume);
    saveBtn?.addEventListener('click', this.callbacks.onSave);
    loadBtn?.addEventListener('click', this.callbacks.onLoad);
    journalBtn?.addEventListener('click', this.callbacks.onJournal);
    inventoryBtn?.addEventListener('click', this.callbacks.onInventory);
    boardBtn?.addEventListener('click', this.callbacks.onBoard);
    controlsBtn?.addEventListener('click', this.callbacks.onControls);
    settingsBtn?.addEventListener('click', this.callbacks.onSettings);
    mainMenuBtn?.addEventListener('click', this.callbacks.onMainMenu);
    overlay?.addEventListener('click', this.callbacks.onResume);
  }

  private removeListeners(): void {
    const resumeBtn = this.element.querySelector('#pause-resume');
    const saveBtn = this.element.querySelector('#pause-save');
    const loadBtn = this.element.querySelector('#pause-load');
    const journalBtn = this.element.querySelector('#pause-journal');
    const inventoryBtn = this.element.querySelector('#pause-inventory');
    const boardBtn = this.element.querySelector('#pause-board');
    const controlsBtn = this.element.querySelector('#pause-controls');
    const settingsBtn = this.element.querySelector('#pause-settings');
    const mainMenuBtn = this.element.querySelector('#pause-mainmenu');
    const overlay = this.element.querySelector('.pause-overlay');

    resumeBtn?.removeEventListener('click', this.callbacks.onResume);
    saveBtn?.removeEventListener('click', this.callbacks.onSave);
    loadBtn?.removeEventListener('click', this.callbacks.onLoad);
    journalBtn?.removeEventListener('click', this.callbacks.onJournal);
    inventoryBtn?.removeEventListener('click', this.callbacks.onInventory);
    boardBtn?.removeEventListener('click', this.callbacks.onBoard);
    controlsBtn?.removeEventListener('click', this.callbacks.onControls);
    settingsBtn?.removeEventListener('click', this.callbacks.onSettings);
    mainMenuBtn?.removeEventListener('click', this.callbacks.onMainMenu);
    overlay?.removeEventListener('click', this.callbacks.onResume);
  }
}