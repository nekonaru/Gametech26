import { t, i18n } from '../core/i18n.js';
import { settingsManager } from '../core/settings.js';

/**
 * Petunjuk tombol: daftar tombol yang berfungsi (gerak, interaksi,
 * inventori, jurnal, settings) dalam satu panel kecil.
 *
 * Dua mode pemakaian:
 *  - "once": muncul sekali pertama kali masuk permainan, non-modal, dan
 *    menutup diri sendiri begitu pemain menekan tombol apa saja / klik /
 *    lewat timer: tidak pernah memblokir permainan (auto-play pun aman).
 *  - "manual": dibuka dari menu jeda; hanya tombol Tutup yang menutup,
 *    Escape ditahan agar tidak ikut me-resume permainan.
 */

const SEEN_KEY = 'asap_controls_seen';
const AUTO_DISMISS_MS = 12000;
const GRACE_MS = 600;

let panel: HTMLElement | null = null;
let mode: 'once' | 'manual' = 'once';
let autoTimer: number | null = null;
let bornAt = 0;
let wired = false;

/** Format kode tombol DOM jadi label yang bisa dibaca manusia. */
function keyLabel(code: string): string {
  const names: Record<string, string> = {
    Space: 'Space',
    ShiftLeft: 'Shift',
    ShiftRight: 'Shift',
    ControlLeft: 'Ctrl',
    ControlRight: 'Ctrl',
    AltLeft: 'Alt',
    AltRight: 'Alt',
    Escape: 'Esc',
    Enter: 'Enter',
    Tab: 'Tab'
  };
  if (names[code]) return names[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return code.slice(5);
  return code;
}

function bindingLabel(action: string): string {
  const keys = settingsManager.get('controls')?.keyBindings as Record<string, string> | undefined;
  return keyLabel(keys?.[action] ?? action);
}

function rowsHtml(): string {
  const rows: Array<[string, string]> = [
    [t('controls.move'), 'W A S D'],
    [t('controls.run'), bindingLabel('run')],
    [t('controls.crouch'), bindingLabel('crouch')],
    [t('controls.interact'), bindingLabel('interact')],
    [t('controls.flashlight'), bindingLabel('flashlight')],
    [t('controls.phone'), bindingLabel('phone')],
    [t('controls.inventory'), 'I'],
    [t('controls.journal'), bindingLabel('journal')],
    [t('controls.pause'), bindingLabel('pause')]
  ];
  return rows
    .map(([label, key]) => `
      <div class="controls-row">
        <span class="controls-action">${label}</span>
        <span class="controls-keys"><kbd>${key}</kbd></span>
      </div>`)
    .join('');
}

function ensurePanel(): HTMLElement {
  if (panel) return panel;
  const div = document.createElement('div');
  div.id = 'controls-hint';
  div.className = 'controls-hint hidden';
  div.setAttribute('role', 'dialog');
  div.setAttribute('aria-label', t('controls.title'));
  div.innerHTML = `
    <header class="controls-header">
      <h3 data-i18n="controls.title"></h3>
      <button id="controls-close" class="ui-btn close-btn" data-i18n="ui.close"></button>
    </header>
    <div class="controls-body" id="controls-body"></div>
    <footer class="controls-footer">
      <span data-i18n="controls.mouse"></span>
      <span class="controls-dismiss" data-i18n="controls.dismiss"></span>
    </footer>
  `;
  document.body.appendChild(div);
  panel = div;
  wire();
  return div;
}

function renderContent(): void {
  if (!panel) return;
  panel.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
  const body = panel.querySelector('#controls-body');
  if (body) body.innerHTML = rowsHtml();
}

function wire(): void {
  if (wired) return;
  wired = true;
  panel!.querySelector('#controls-close')?.addEventListener('click', () => hideControlsHint());

  // Tutup dengan tombol apa saja / klik. Mode manual hanya bereaksi setelah
  // grace period supaya klik yang membuka panel tidak langsung menutupnya;
  // Escape ditahan di mode manual supaya tidak ikut me-resume permainan.
  window.addEventListener('keydown', (e) => {
    if (!panel || panel.classList.contains('hidden')) return;
    if (mode === 'manual' && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      hideControlsHint();
      return;
    }
    if (performance.now() - bornAt < GRACE_MS) return;
    hideControlsHint();
  }, true);
  window.addEventListener('mousedown', () => {
    if (!panel || panel.classList.contains('hidden')) return;
    if (performance.now() - bornAt < GRACE_MS) return;
    if (mode === 'once') hideControlsHint();
  }, true);

  i18n.subscribe(() => {
    if (panel && !panel.classList.contains('hidden')) renderContent();
  });
}

export function showControlsHint(nextMode: 'once' | 'manual'): void {
  const el = ensurePanel();
  mode = nextMode;
  renderContent();
  el.classList.remove('hidden');
  el.classList.remove('controls-enter');
  void el.offsetWidth;
  el.classList.add('controls-enter');
  bornAt = performance.now();
  if (autoTimer !== null) window.clearTimeout(autoTimer);
  if (nextMode === 'once') {
    autoTimer = window.setTimeout(() => hideControlsHint(), AUTO_DISMISS_MS);
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* storage penuh: abaikan */ }
  }
}

export function hideControlsHint(): void {
  if (autoTimer !== null) {
    window.clearTimeout(autoTimer);
    autoTimer = null;
  }
  panel?.classList.add('hidden');
}

/** Tampilkan petunjuk tombol sekali saja di awal permainan baru. */
export function maybeShowControlsOnce(): void {
  let seen = false;
  try { seen = localStorage.getItem(SEEN_KEY) === '1'; } catch { seen = false; }
  if (seen) return;
  showControlsHint('once');
}

export function destroyControlsHint(): void {
  hideControlsHint();
  panel?.remove();
  panel = null;
}
