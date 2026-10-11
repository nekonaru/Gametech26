import { UIElement, escapeHtml, itemDescKey } from './base.js';
import { i18n, t } from '../core/i18n.js';

/**
 * Layar inventaris: daftar benda yang sudah dikumpulkan pemain, lengkap
 * dengan ikon dan deskripsi. Daftarnya disalin dari luar (main.ts) tiap
 * layar dibuka, sama seperti jurnal menyalin daftar petunjuknya sendiri.
 */

/** Ikon per barang: sedikit, jadi ditulis langsung di sini. */
export const ITEM_ICON: Record<string, string> = {
  ponsel: '📱',
  senter: '🔦',
  obeng: '🪛',
  kunci_laci: '🔑',
  kwitansi: '🧾',
  peta_lahan: '🗺️',
  uang_muka: '💵',
  kartu_nama: '💳',
  struk_robek: '🧾',
  nasi_goreng: '🍚'
};

export class InventoryScreen implements UIElement {
  element: HTMLElement;
  private onClose: () => void;
  private items: string[] = [];

  constructor(onClose: () => void) {
    this.onClose = onClose;
    this.element = this.createElement();
    this.render();
    i18n.subscribe(() => this.render());
    // Perangkat berpindah sentuh <-> mouse saat game berjalan: ganti petunjuk
    // "TEKAN I" <-> "KETUK TOMBOL" supaya tidak menyesatkan pemain.
    if (typeof matchMedia === 'function') {
      matchMedia('(pointer: coarse)')
        .addEventListener('change', () => this.render());
    }
  }

  private createElement(): HTMLElement {
    const div = document.createElement('div');
    div.id = 'inventory-screen';
    div.className = 'screen inventory-screen';
    div.innerHTML = `
      <div class="inventory-container">
        <header class="inventory-header">
          <h2 data-i18n="ui.inventory"></h2>
          <button id="inventory-close" class="ui-btn close-btn" data-i18n="ui.close"></button>
        </header>
        <div id="inventory-grid" class="inventory-grid"></div>
        <footer class="inventory-footer">
          <span data-i18n="inventory.hint"></span>
        </footer>
      </div>
    `;
    return div;
  }

  /** Salin daftar benda dari gameState. Dipanggil main sebelum show(). */
  setItems(items: string[]): void {
    this.items = [...items];
    this.render();
  }

  private render(): void {
    this.element.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
    });

    // Setelah loop, petunjuk pembuka/tutup ditimpa dengan varian yang sesuai
    // perangkat (sentuh tidak punya tombol I). Teks disetel langsung, bukan lewat
    // mutasi atribut data-i18n, supaya pilihan kunci dihitung ulang tiap render
    // dan tidak lengket pada satu varian.
    const hintEl = this.element.querySelector<HTMLElement>('.inventory-footer span');
    if (hintEl) {
      hintEl.textContent = t(typeof matchMedia === 'function'
        && matchMedia('(pointer: coarse)').matches
        ? 'inventory.hintTouch' : 'inventory.hint');
    }

    const grid = this.element.querySelector('#inventory-grid');
    if (!grid) return;

    if (!this.items.length) {
      grid.innerHTML = `<p class="inventory-empty">${escapeHtml(t('inventory.kosong'))}</p>`;
      return;
    }

    grid.innerHTML = this.items.map(id => {
      const icon = ITEM_ICON[id] ?? '📦';
      const nameKey = `item.${id}.name`;
      const descKey = itemDescKey(id);
      // Barang tanpa terjemahan tetap tampil (pakai id mentah): daftar
      // inventori tidak boleh menghilang hanya karena locale kurang kunci.
      const name = i18n.hasKey(nameKey) ? t(nameKey) : id;
      const desc = i18n.hasKey(descKey) ? t(descKey) : '';
      return `
        <div class="inventory-item">
          <span class="inventory-icon" aria-hidden="true">${icon}</span>
          <div class="inventory-meta">
            <h3>${escapeHtml(name)}</h3>
            <p>${escapeHtml(desc)}</p>
          </div>
        </div>`;
    }).join('');
  }

  show(): void {
    this.render();
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
    const closeBtn = this.element.querySelector('#inventory-close');
    closeBtn?.addEventListener('click', this.onClose);
  }

  private removeListeners(): void {
    const closeBtn = this.element.querySelector('#inventory-close');
    closeBtn?.removeEventListener('click', this.onClose);
  }
}
