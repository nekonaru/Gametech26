import { createButton, createSlider, createSelect, createCheckbox, createKeyBindingInput, UIElement, confirmAction, escapeHtml } from './base.js';
import { i18n, t } from '../core/i18n.js';
import { settingsManager, GameSettings } from '../core/settings.js';

export class SettingsScreen implements UIElement {
  element: HTMLElement;
  private onBack: () => void;
  private currentTab: string = 'graphics';
  private tabs: string[] = ['graphics', 'audio', 'controls', 'text', 'accessibility', 'data', 'help'];

  constructor(onBack: () => void) {
    this.onBack = onBack;
    this.element = this.createElement();
    this.updateText();
    i18n.subscribe(() => this.updateText());
    settingsManager.subscribe(() => this.updateValues());
  }

  private createElement(): HTMLElement {
    const div = document.createElement('div');
    div.id = 'settings-screen';
    div.className = 'screen settings-screen';
    div.innerHTML = `
      <div class="settings-container">
        <header class="settings-header">
          <h2 data-i18n="settings.title"></h2>
          <button id="settings-back" class="ui-btn back-btn" data-i18n="ui.back"></button>
        </header>
        <nav class="settings-tabs">
          ${this.tabs.map(tab => `<button class="tab-btn" data-tab="${tab}" data-i18n="settings.${tab}"></button>`).join('')}
        </nav>
        <div class="settings-content">
          <div id="tab-graphics" class="tab-panel"></div>
          <div id="tab-audio" class="tab-panel"></div>
          <div id="tab-controls" class="tab-panel"></div>
          <div id="tab-text" class="tab-panel"></div>
          <div id="tab-accessibility" class="tab-panel"></div>
          <div id="tab-data" class="tab-panel"></div>
          <div id="tab-help" class="tab-panel"></div>
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

  private updateValues(): void {
    this.renderGraphicsTab();
    this.renderAudioTab();
    this.renderControlsTab();
    this.renderTextTab();
    this.renderAccessibilityTab();
    this.renderDataTab();
    this.renderHelpTab();
  }

  show(): void {
    this.element.style.display = 'flex';
    document.body.appendChild(this.element);
    this.setupListeners();
    this.showTab(this.currentTab);
    this.updateValues();
    this.updateText();
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
    const backBtn = this.element.querySelector('#settings-back');
    backBtn?.addEventListener('click', this.onBack);

    this.element.querySelectorAll<HTMLElement>('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = (e.currentTarget as HTMLButtonElement).dataset.tab as keyof GameSettings;
        this.showTab(tab);
      });
    });
  }

  private removeListeners(): void {
    const backBtn = this.element.querySelector('#settings-back');
    backBtn?.removeEventListener('click', this.onBack);

    this.element.querySelectorAll<HTMLElement>('.tab-btn').forEach(btn => {
      btn.replaceWith(btn.cloneNode(true));
    });
  }

  private showTab(tab: string): void {
    this.currentTab = tab;
    this.element.querySelectorAll<HTMLElement>('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    this.element.querySelectorAll<HTMLElement>('.tab-panel').forEach(panel => {
      panel.style.display = panel.id === `tab-${tab}` ? 'block' : 'none';
    });
  }

  private renderGraphicsTab(): void {
    const panel = this.element.querySelector('#tab-graphics') as HTMLElement;
    const gfx = settingsManager.get('graphics');

    panel.innerHTML = `
      <div class="setting-group">
        <label data-i18n="settings.preset"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.internalResolution"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.vertexJitter"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.dithering"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.colorQuantization"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.scanlines"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.grain"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.fogDistance"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.fov"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.brightness"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.maxFps"></label>
        <div class="setting-control"></div>
      </div>
    `;

    const groups = panel.querySelectorAll<HTMLElement>('.setting-group');
    const presetSelect = createSelect(
      [{value: 'low', text: t('settings.low')}, {value: 'medium', text: t('settings.medium')}, {value: 'high', text: t('settings.high')}, {value: 'custom', text: t('settings.custom')}],
      gfx.preset,
      (v) => settingsManager.updateGraphics({ preset: v as any })
    );
    groups[0].querySelector('.setting-control')!.appendChild(presetSelect);

    const resSelect = createSelect(
      [
        {value: '0', text: t('settings.resolutionNative')},
        {value: '1080', text: '1080p'},
        {value: '720', text: '720p'},
        {value: '480', text: '480p'},
        {value: '360', text: '360p'},
        {value: '240', text: '240p'}
      ],
      gfx.internalResolution.toString(),
      (v) => settingsManager.updateGraphics({ internalResolution: parseInt(v) as any })
    );
    groups[1].querySelector('.setting-control')!.appendChild(resSelect);

    const jitterSlider = createSlider(0, 1, 0.01, gfx.vertexJitter, (v) => settingsManager.updateGraphics({ vertexJitter: v }));
    groups[2].querySelector('.setting-control')!.appendChild(jitterSlider);

    const ditheringCheck = createCheckbox(gfx.dithering, (v) => settingsManager.updateGraphics({ dithering: v }));
    groups[3].querySelector('.setting-control')!.appendChild(ditheringCheck);

    const quantCheck = createCheckbox(gfx.colorQuantization, (v) => settingsManager.updateGraphics({ colorQuantization: v }));
    groups[4].querySelector('.setting-control')!.appendChild(quantCheck);

    const scanlinesCheck = createCheckbox(gfx.scanlines, (v) => settingsManager.updateGraphics({ scanlines: v }));
    groups[5].querySelector('.setting-control')!.appendChild(scanlinesCheck);

    const grainCheck = createCheckbox(gfx.grain, (v) => settingsManager.updateGraphics({ grain: v }));
    groups[6].querySelector('.setting-control')!.appendChild(grainCheck);

    const fogSlider = createSlider(10, 300, 1, gfx.fogDistance, (v) => settingsManager.updateGraphics({ fogDistance: v }));
    groups[7].querySelector('.setting-control')!.appendChild(fogSlider);

    const fovSlider = createSlider(60, 90, 1, gfx.fov, (v) => settingsManager.updateGraphics({ fov: v }));
    groups[8].querySelector('.setting-control')!.appendChild(fovSlider);

    const brightSlider = createSlider(0.5, 2, 0.01, gfx.brightness, (v) => settingsManager.updateGraphics({ brightness: v }));
    groups[9].querySelector('.setting-control')!.appendChild(brightSlider);

    const fpsSelect = createSelect(
      [{value: '30', text: '30'}, {value: '60', text: '60'}, {value: '0', text: 'Unlimited'}],
      gfx.maxFps.toString(),
      (v) => settingsManager.updateGraphics({ maxFps: parseInt(v) as any })
    );
    groups[10].querySelector('.setting-control')!.appendChild(fpsSelect);
  }

  private renderAudioTab(): void {
    const panel = this.element.querySelector('#tab-audio') as HTMLElement;
    const audio = settingsManager.get('audio');

    panel.innerHTML = `
      <div class="setting-group">
        <label data-i18n="settings.masterVolume"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.musicVolume"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.sfxVolume"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.ambienceVolume"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.dialogBlipVolume"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.muteOnBlur"></label>
        <div class="setting-control"></div>
      </div>
    `;

    const groups = panel.querySelectorAll<HTMLElement>('.setting-group');
    const masterSlider = createSlider(0, 1, 0.01, audio.master, (v) => settingsManager.update('audio', { master: v }));
    groups[0].querySelector('.setting-control')!.appendChild(masterSlider);

    const musicSlider = createSlider(0, 1, 0.01, audio.music, (v) => settingsManager.update('audio', { music: v }));
    groups[1].querySelector('.setting-control')!.appendChild(musicSlider);

    const sfxSlider = createSlider(0, 1, 0.01, audio.sfx, (v) => settingsManager.update('audio', { sfx: v }));
    groups[2].querySelector('.setting-control')!.appendChild(sfxSlider);

    const ambienceSlider = createSlider(0, 1, 0.01, audio.ambience, (v) => settingsManager.update('audio', { ambience: v }));
    groups[3].querySelector('.setting-control')!.appendChild(ambienceSlider);

    const blipSlider = createSlider(0, 1, 0.01, audio.dialogBlip, (v) => settingsManager.update('audio', { dialogBlip: v }));
    groups[4].querySelector('.setting-control')!.appendChild(blipSlider);

    const muteCheck = createCheckbox(audio.muteOnBlur, (v) => settingsManager.update('audio', { muteOnBlur: v }));
    groups[5].querySelector('.setting-control')!.appendChild(muteCheck);
  }

  private renderControlsTab(): void {
    const panel = this.element.querySelector('#tab-controls') as HTMLElement;
    const controls = settingsManager.get('controls');

    panel.innerHTML = `
      <div class="setting-group">
        <label data-i18n="settings.mouseSensitivity"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.touchSensitivity"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.invertY"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.runToggle"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.joystickSize"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.joystickPosition"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.showKeyHints"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group key-bindings">
        <label data-i18n="settings.keyBindings"></label>
        <div class="setting-control"></div>
      </div>
    `;

    const groups = panel.querySelectorAll<HTMLElement>('.setting-group');
    const mouseSlider = createSlider(0.0005, 0.01, 0.0001, controls.mouseSensitivity, (v) => settingsManager.update('controls', { mouseSensitivity: v }));
    groups[0].querySelector('.setting-control')!.appendChild(mouseSlider);

    const touchSlider = createSlider(0.5, 3, 0.05, controls.touchSensitivity, (v) => settingsManager.update('controls', { touchSensitivity: v }));
    groups[1].querySelector('.setting-control')!.appendChild(touchSlider);

    const invertCheck = createCheckbox(controls.invertY, (v) => settingsManager.update('controls', { invertY: v }));
    groups[2].querySelector('.setting-control')!.appendChild(invertCheck);

    const runCheck = createCheckbox(controls.runToggle, (v) => settingsManager.update('controls', { runToggle: v }));
    groups[3].querySelector('.setting-control')!.appendChild(runCheck);

    const joySizeSlider = createSlider(80, 200, 5, controls.joystickSize, (v) => settingsManager.update('controls', { joystickSize: v }));
    groups[4].querySelector('.setting-control')!.appendChild(joySizeSlider);

    const joyPosSelect = createSelect(
      [{value: 'left', text: 'Left'}, {value: 'right', text: 'Right'}],
      controls.joystickPosition,
      (v) => settingsManager.update('controls', { joystickPosition: v as any })
    );
    groups[5].querySelector('.setting-control')!.appendChild(joyPosSelect);

    const keyHintsCheck = createCheckbox(controls.showKeyHints, (v) => settingsManager.update('controls', { showKeyHints: v }));
    groups[6].querySelector('.setting-control')!.appendChild(keyHintsCheck);

    const keyContainer = groups[7].querySelector('.setting-control')!;
    Object.entries(controls.keyBindings).forEach(([action, key]) => {
      const row = document.createElement('div');
      row.className = 'key-binding-row';
      row.innerHTML = `<span class="key-label" data-i18n="controls.${action}">${action}</span>`;
      const input = createKeyBindingInput(key, (newKey) => {
        settingsManager.update('controls', { keyBindings: { ...controls.keyBindings, [action]: newKey } });
      });
      row.appendChild(input);
      keyContainer.appendChild(row);
    });
  }

  private renderTextTab(): void {
    const panel = this.element.querySelector('#tab-text') as HTMLElement;
    const text = settingsManager.get('text');

    panel.innerHTML = `
      <div class="setting-group">
        <label data-i18n="settings.fontSize"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.typeSpeed"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.autoPlay"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.textBackground"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.dialogHistory"></label>
        <div class="setting-control"></div>
      </div>
    `;

    const groups = panel.querySelectorAll<HTMLElement>('.setting-group');
    const fontSlider = createSlider(12, 28, 1, text.fontSize, (v) => settingsManager.update('text', { fontSize: v }));
    groups[0].querySelector('.setting-control')!.appendChild(fontSlider);

    const speedSlider = createSlider(10, 100, 1, text.typeSpeed, (v) => settingsManager.update('text', { typeSpeed: v }));
    groups[1].querySelector('.setting-control')!.appendChild(speedSlider);

    const autoCheck = createCheckbox(text.autoPlay, (v) => settingsManager.update('text', { autoPlay: v }));
    groups[2].querySelector('.setting-control')!.appendChild(autoCheck);

    const bgCheck = createCheckbox(text.textBackground, (v) => settingsManager.update('text', { textBackground: v }));
    groups[3].querySelector('.setting-control')!.appendChild(bgCheck);

    const histCheck = createCheckbox(text.dialogHistory, (v) => settingsManager.update('text', { dialogHistory: v }));
    groups[4].querySelector('.setting-control')!.appendChild(histCheck);
  }

  private renderAccessibilityTab(): void {
    const panel = this.element.querySelector('#tab-accessibility') as HTMLElement;
    const acc = settingsManager.get('accessibility');

    panel.innerHTML = `
      <div class="setting-group">
        <label data-i18n="settings.reduceFlashing"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.reduceCameraShake"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.softHorror"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.highContrast"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.colorBlindFriendly"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.puzzleHintLevel"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.narrativeMode"></label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label data-i18n="settings.uiScale"></label>
        <div class="setting-control"></div>
      </div>
    `;

    const groups = panel.querySelectorAll<HTMLElement>('.setting-group');
    const flashCheck = createCheckbox(acc.reduceFlashing, (v) => settingsManager.update('accessibility', { reduceFlashing: v }));
    groups[0].querySelector('.setting-control')!.appendChild(flashCheck);

    const shakeCheck = createCheckbox(acc.reduceCameraShake, (v) => settingsManager.update('accessibility', { reduceCameraShake: v }));
    groups[1].querySelector('.setting-control')!.appendChild(shakeCheck);

    const horrorCheck = createCheckbox(acc.softHorror, (v) => settingsManager.update('accessibility', { softHorror: v }));
    groups[2].querySelector('.setting-control')!.appendChild(horrorCheck);

    const contrastCheck = createCheckbox(acc.highContrast, (v) => settingsManager.update('accessibility', { highContrast: v }));
    groups[3].querySelector('.setting-control')!.appendChild(contrastCheck);

    const colorCheck = createCheckbox(acc.colorBlindFriendly, (v) => settingsManager.update('accessibility', { colorBlindFriendly: v }));
    groups[4].querySelector('.setting-control')!.appendChild(colorCheck);

    const hintSelect = createSelect(
      [{value: 'none', text: 'None'}, {value: 'low', text: 'Low'}, {value: 'medium', text: 'Medium'}, {value: 'high', text: 'High'}],
      acc.puzzleHintLevel,
      (v) => settingsManager.update('accessibility', { puzzleHintLevel: v as any })
    );
    groups[5].querySelector('.setting-control')!.appendChild(hintSelect);

    const narrativeCheck = createCheckbox(acc.narrativeMode, (v) => settingsManager.update('accessibility', { narrativeMode: v }));
    groups[6].querySelector('.setting-control')!.appendChild(narrativeCheck);

    const uiScaleSlider = createSlider(0.85, 1.4, 0.05, acc.uiScale, (v) => settingsManager.update('accessibility', { uiScale: v }));
    groups[7].querySelector('.setting-control')!.appendChild(uiScaleSlider);
  }

  private renderDataTab(): void {
    const panel = this.element.querySelector('#tab-data') as HTMLElement;
    panel.innerHTML = `
      <div class="setting-group">
        <label>Export Save</label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label>Import Save</label>
        <div class="setting-control"></div>
      </div>
      <div class="setting-group">
        <label>Reset Settings</label>
        <div class="setting-control"></div>
      </div>
    `;

    const groups = panel.querySelectorAll<HTMLElement>('.setting-group');
    const exportBtn = createButton('Export', () => this.exportSave());
    groups[0].querySelector('.setting-control')!.appendChild(exportBtn);

    const importBtn = createButton('Import', () => this.importSave());
    groups[1].querySelector('.setting-control')!.appendChild(importBtn);

    const resetBtn = createButton('Reset', () => {
      void confirmAction(t('settings.resetConfirm'), {
        title: t('settings.resetSettings'),
        confirmLabel: t('ui.yes'),
        cancelLabel: t('ui.no')
      }).then(ok => {
        if (ok) settingsManager.reset();
      });
    }, 'danger');
    groups[2].querySelector('.setting-control')!.appendChild(resetBtn);
  }

  /**
   * Tab Petunjuk: daftar lengkap tombol yang dipakai permainan, digambar dari
   * keyBindings aktif (ikut bahasa & hasil rebind pemain) plus tombol khusus
   * dialog dan hotbar yang tidak bisa diubah.
   */
  private renderHelpTab(): void {
    const panel = this.element.querySelector('#tab-help') as HTMLElement;
    if (!panel) return;
    const controls = settingsManager.get('controls');
    const actionRows = Object.entries(controls.keyBindings).map(([action, key]) =>
      `<div class="help-row"><span class="help-key">${escapeHtml(prettyKey(key))}</span>`
      + `<span class="help-label">${escapeHtml(t(`controls.${action}`))}</span></div>`
    ).join('');
    const rows = (pairs: Array<[string, string]>): string => pairs.map(([key, labelKey]) =>
      `<div class="help-row"><span class="help-key">${escapeHtml(key)}</span>`
      + `<span class="help-label">${escapeHtml(t(labelKey))}</span></div>`
    ).join('');
    panel.innerHTML = `
      <h3 class="help-heading" data-i18n="help.gameplay"></h3>
      ${actionRows}
      ${rows([
        ['1-9', 'help.hotbar'],
        ['`', 'ui.keys.lock']
      ])}
      <h3 class="help-heading" data-i18n="help.dialog"></h3>
      ${rows([
        ['SPASI/ENTER', 'help.dNext'],
        ['ESC', 'help.dSkip'],
        ['H', 'help.dHistory'],
        ['P', 'help.dAuto'],
        ['W/S', 'help.dChoice'],
        ['SPASI', 'help.dConfirm'],
        ['1-4', 'help.dDirect']
      ])}
      <p class="help-note" data-i18n="help.rebind"></p>
    `;
  }

  private exportSave(): void {
    const json = settingsManager.exportSettings();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'asap-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  private importSave(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => {
          settingsManager.importSettings(reader.result as string);
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }
}

/** Ubah kode tombol jadi label pendek untuk tab Petunjuk (KeyW -> W). */
function prettyKey(code: string): string {
  if (!code) return '';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return code.slice(5).toUpperCase();
  const special: Record<string, string> = {
    Space: 'SPASI', Escape: 'ESC', Tab: 'TAB', Enter: 'ENTER',
    Backquote: '`', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT',
    ControlLeft: 'CTRL', ControlRight: 'CTRL', AltLeft: 'ALT', AltRight: 'ALT'
  };
  return special[code] ?? code;
}