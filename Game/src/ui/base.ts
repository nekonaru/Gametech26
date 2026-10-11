import { t, i18n } from '../core/i18n.js';

export interface UIElement {
  element: HTMLElement;
  show(): void;
  hide(): void;
  destroy(): void;
}

export class UIManager {
  private elements: Map<string, UIElement> = new Map();
  private activeScreen: string | null = null;
  private root: HTMLElement;

  constructor(root: HTMLElement = document.body) {
    this.root = root;
  }

  register(name: string, element: UIElement): void {
    this.elements.set(name, element);
  }

  unregister(name: string): void {
    const el = this.elements.get(name);
    if (el) {
      el.destroy();
      this.elements.delete(name);
    }
  }

  show(name: string): void {
    const el = this.elements.get(name);
    if (el) {
      if (this.activeScreen) {
        this.hide(this.activeScreen);
      }
      el.show();
      this.activeScreen = name;
    }
  }

  hide(name: string): void {
    const el = this.elements.get(name);
    if (el) {
      el.hide();
      if (this.activeScreen === name) {
        this.activeScreen = null;
      }
    }
  }

  get(name: string): UIElement | undefined {
    return this.elements.get(name);
  }

  getActiveScreen(): string | null {
    return this.activeScreen;
  }

  createOverlay(id: string, html: string): HTMLElement {
    const existing = document.getElementById(id);
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.id = id;
    div.innerHTML = html;
    this.root.appendChild(div);
    return div;
  }

  destroy(): void {
    this.elements.forEach(el => el.destroy());
    this.elements.clear();
  }
}

export function createButton(text: string, onClick: () => void, className = ''): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = text;
  btn.className = `ui-btn ${className}`;
  btn.addEventListener('click', onClick);
  return btn;
}

export function createSlider(min: number, max: number, step: number, value: number, onChange: (v: number) => void, className = ''): HTMLInputElement {
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = min.toString();
  slider.max = max.toString();
  slider.step = step.toString();
  slider.value = value.toString();
  slider.className = `ui-slider ${className}`;
  slider.addEventListener('input', (e) => onChange(parseFloat((e.target as HTMLInputElement).value)));
  return slider;
}

export function createSelect(options: { value: string; text: string }[], value: string, onChange: (v: string) => void, className = ''): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = `ui-select ${className}`;
  options.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.text;
    select.appendChild(option);
  });
  select.value = value;
  select.addEventListener('change', (e) => onChange((e.target as HTMLSelectElement).value));
  return select;
}

export function createCheckbox(checked: boolean, onChange: (v: boolean) => void, className = ''): HTMLInputElement {
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  checkbox.className = `ui-checkbox ${className}`;
  checkbox.addEventListener('change', (e) => onChange((e.target as HTMLInputElement).checked));
  return checkbox;
}

/**
 * Konfirmasi bawaan browser (`confirm`) memblokir main thread, tidak bisa
 * ditata gayanya, dan menghilangkan imersi. Fungsi ini menggantinya dengan
 * dialog kecil di dalam permainan; hasilnya dikembalikan sebagai Promise
 * sehingga alur pemanggil bisa tetap dibaca seperti `if (!confirm(...))`.
 */
export function confirmAction(
  message: string,
  options: { title?: string; confirmLabel?: string; cancelLabel?: string } = {}
): Promise<boolean> {
  return new Promise(resolve => {
    const root = document.createElement('div');
    root.className = 'confirm-dialog-backdrop';
    root.innerHTML = `
      <div class="confirm-dialog" role="dialog" aria-modal="true">
        <div class="confirm-dialog-title">${escapeHtml(options.title ?? '')}</div>
        <div class="confirm-dialog-message">${escapeHtml(message)}</div>
        <div class="confirm-dialog-actions">
          <button type="button" class="ui-btn confirm-cancel"></button>
          <button type="button" class="ui-btn primary confirm-ok"></button>
        </div>
      </div>
    `;

    const ok = root.querySelector('.confirm-ok') as HTMLButtonElement;
    const cancel = root.querySelector('.confirm-cancel') as HTMLButtonElement;
    const title = root.querySelector('.confirm-dialog-title') as HTMLElement;
    if (!options.title) title.remove();
    ok.textContent = options.confirmLabel ?? t('ui.ok');
    cancel.textContent = options.cancelLabel ?? t('ui.cancel');

    let settled = false;
    const finish = (value: boolean): void => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey, true);
      root.remove();
      resolve(value);
    };

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        finish(true);
      }
    };

    ok.addEventListener('click', () => finish(true));
    cancel.addEventListener('click', () => finish(false));
    root.addEventListener('click', (e) => {
      if (e.target === root) finish(false);
    });
    document.addEventListener('keydown', onKey, true);

    document.body.appendChild(root);
    // Fokus ke aksi utama agar Enter/Space langsung bekerja.
    ok.focus();
  });
}

/** Escape teks dari HTML agar pesan yang disuntikkan tetap aman. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Kunci deskripsi barang yang sesuai perangkat.
 *
 * Sebagian deskripsi menyebut tombol keyboard ("Tekan Q", "Tekan F") yang
 * tidak ada di layar sentuh. Varian `item.<id>.descTouch` dipakai bila ada dan
 * perangkat memakai penunjuk kasar; kalau tidak ada, kunci biasa dipakai
 * apa adanya sehingga teks yang belum dibuat varian tidak hilang.
 */
export function itemDescKey(id: string): string {
  const touchKey = `item.${id}.descTouch`;
  const coarse = typeof matchMedia === 'function'
    && matchMedia('(pointer: coarse)').matches;
  return coarse && i18n.hasKey(touchKey) ? touchKey : `item.${id}.desc`;
}

export function createKeyBindingInput(currentKey: string, onChange: (key: string) => void, className = ''): HTMLDivElement {
  const container = document.createElement('div');
  container.className = `key-binding ${className}`;

  const btn = document.createElement('button');
  btn.textContent = currentKey || 'None';
  btn.className = 'key-btn';
  btn.addEventListener('click', () => {
    btn.textContent = 'Press key...';
    btn.classList.add('listening');

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      const key = e.code;
      btn.textContent = key;
      btn.classList.remove('listening');
      onChange(key);
      document.removeEventListener('keydown', handler);
    };

    document.addEventListener('keydown', handler);
  });

  container.appendChild(btn);
  return container;
}