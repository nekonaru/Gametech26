import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, SettingsManager } from './settings.js';

// localStorage stub disediakan src/test/setup.ts; kosongkan antar test
// karena SettingsManager membaca storage saat konstruktor.
beforeEach(() => {
  localStorage.clear();
});

describe('SettingsManager', () => {
  it('tanpa data tersimpan: memakai DEFAULT_SETTINGS', () => {
    const s = new SettingsManager();
    expect(s.getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('merge parsial: field yang hilang terisi default', () => {
    localStorage.setItem('asap-settings', JSON.stringify({
      language: 'en',
      graphics: { fov: 88 }
    }));
    const s = new SettingsManager();
    expect(s.get('language')).toBe('en');
    expect(s.get('graphics').fov).toBe(88);
    // Field lain di kategori yang sama ikut default, bukan undefined.
    expect(s.get('graphics').brightness).toBe(DEFAULT_SETTINGS.graphics.brightness);
    expect(s.get('audio').master).toBe(DEFAULT_SETTINGS.audio.master);
  });

  it('sanitize: tipe yang salah di kategori jatuh ke default', () => {
    localStorage.setItem('asap-settings', JSON.stringify({
      audio: 'bukan-objek',
      language: 'fr'
    }));
    const s = new SettingsManager();
    expect(s.get('audio')).toEqual(DEFAULT_SETTINGS.audio);
    expect(s.get('language')).toBe('id');
  });

  it('migrasi gaya render: styleVersion lama dinaikkan sekali', () => {
    localStorage.setItem('asap-settings', JSON.stringify({
      graphics: { preset: 'medium', styleVersion: 0, internalResolution: 360, scanlines: true }
    }));
    const s = new SettingsManager();
    const g = s.get('graphics');
    expect(g.styleVersion).toBe(2);
    expect(g.internalResolution).toBe(0); // preset medium -> resolusi tampilan
    expect(g.scanlines).toBe(false);
  });

  it('update memicu subscriber dan nilai langsung terbaca', () => {
    const s = new SettingsManager();
    const seen = vi.fn();
    s.subscribe(seen);
    s.update('audio', { master: 0.3 });
    expect(s.get('audio').master).toBe(0.3);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('preset graphics menurunkan/menaikkan fov & efek sesuai tabel', () => {
    const s = new SettingsManager();
    s.updateGraphics({ preset: 'low' });
    expect(s.get('graphics').fov).toBe(70);
    expect(s.get('graphics').internalResolution).toBe(480);
    s.updateGraphics({ preset: 'high' });
    expect(s.get('graphics').fov).toBe(80);
    expect(s.get('graphics').internalResolution).toBe(0);
    expect(s.get('graphics').preset).toBe('high');
  });

  it('importSettings: JSON rusak ditolak tanpa mengubah setelan', () => {
    const s = new SettingsManager();
    const before = JSON.stringify(s.getSettings());
    expect(s.importSettings('{tidak valid')).toBe(false);
    expect(JSON.stringify(s.getSettings())).toBe(before);
  });

  it('export/import round-trip mempertahankan setelan', () => {
    const s = new SettingsManager();
    s.update('text', { fontSize: 22 });
    s.setLanguage('en');
    const json = s.exportSettings();

    localStorage.clear();
    const s2 = new SettingsManager();
    expect(s2.importSettings(json)).toBe(true);
    expect(s2.get('text').fontSize).toBe(22);
    expect(s2.get('language')).toBe('en');
  });

  it('reset mengembalikan semua ke DEFAULT dan tersimpan ke storage', () => {
    const s = new SettingsManager();
    s.update('accessibility', { uiScale: 1.3, highContrast: true });
    s.reset();
    expect(s.get('accessibility')).toEqual(DEFAULT_SETTINGS.accessibility);
    const stored = JSON.parse(localStorage.getItem('asap-settings')!);
    expect(stored.accessibility.uiScale).toBe(1);
  });

  it('setelan tersimpan di localStorage dengan kunci asap-settings', () => {
    const s = new SettingsManager();
    s.update('audio', { music: 0.2 });
    const stored = JSON.parse(localStorage.getItem('asap-settings')!);
    expect(stored.audio.music).toBe(0.2);
  });
});
