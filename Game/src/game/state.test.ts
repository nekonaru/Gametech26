import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameStateManager } from './state.js';

describe('GameStateManager', () => {
  let m: GameStateManager;

  beforeEach(() => {
    m = new GameStateManager();
  });

  it('state awal: bab null, hari 1, inventori berisi ponsel', () => {
    expect(m.get('currentChapter')).toBeNull();
    expect(m.get('hari')).toBe(1);
    expect(m.get('inventory')).toEqual(['ponsel']);
    expect(m.get('gameStarted')).toBe(false);
  });

  it('addClue mencegah duplikat', () => {
    m.addClue('kalung');
    m.addClue('kalung');
    expect(m.get('clues')).toEqual(['kalung']);
    expect(m.hasClue('kalung')).toBe(true);
    expect(m.hasClue('surat')).toBe(false);
  });

  it('inventori: tambah, cek, hapus', () => {
    m.addInventory('kunci');
    expect(m.hasInventory('kunci')).toBe(true);
    m.removeInventory('kunci');
    expect(m.hasInventory('kunci')).toBe(false);
    // Item default tidak ikut hilang.
    expect(m.hasInventory('ponsel')).toBe(true);
  });

  it('flag: default false, set true setelah addFlag', () => {
    expect(m.getFlag('b17_confess')).toBe(false);
    m.addFlag('b17_confess');
    expect(m.getFlag('b17_confess')).toBe(true);
  });

  it('variabel: set dan get', () => {
    m.setVariable('terimaRudi', true);
    m.setVariable('investigasi', 7);
    expect(m.getVariable('terimaRudi')).toBe(true);
    expect(m.getVariable('investigasi')).toBe(7);
  });

  it('unlockEnding mencegah duplikat dan tercatat di hasEnding', () => {
    m.unlockEnding('ending_3');
    m.unlockEnding('ending_3');
    expect(m.get('endingsUnlocked')).toEqual(['ending_3']);
    expect(m.hasEnding('ending_3')).toBe(true);
  });

  it('startChapter menyetel bab sebelumnya, bab kini, dan gameStarted', () => {
    m.startChapter('b01', { hari: 1, jam: '07:30', pov: 'dimas', sceneId: 'rumah_dimas', pos: [1, 0, 2], yaw: 0.5 });
    m.startChapter('b02', { hari: 1, jam: '09:00', pov: 'raka', sceneId: 'kedai_kopi', pos: [0, 0, 0], yaw: 0 });
    expect(m.get('currentChapter')).toBe('b02');
    expect(m.get('previousChapter')).toBe('b01');
    expect(m.get('gameStarted')).toBe(true);
    expect(m.get('pov')).toBe('raka');
  });

  it('undo mengembalikan snapshot sebelum perubahan terakhir', () => {
    m.addClue('a');
    m.addClue('b');
    expect(m.undo()).toBe(true);
    expect(m.get('clues')).toEqual(['a']);
    expect(m.undo()).toBe(true);
    expect(m.get('clues')).toEqual([]);
    // History habis: undo gagal tanpa melempar error.
    m.get('clues'); // pasti state terkini
    expect(m.undo()).toBe(false);
  });

  it('serialize/deserialize round-trip mempertahankan state', () => {
    m.setVariable('nurani', 3);
    m.addFlag('b18_goHome');
    const json = m.serialize();

    const m2 = new GameStateManager();
    m2.deserialize(json);
    expect(m2.getVariable('nurani')).toBe(3);
    expect(m2.getFlag('b18_goHome')).toBe(true);
  });

  it('subscribe dipanggil saat update, dan unsubscribe berhenti', () => {
    const seen = vi.fn();
    const unsub = m.subscribe(seen);
    m.update({ hari: 2 });
    expect(seen).toHaveBeenCalledTimes(1);
    unsub();
    m.update({ hari: 3 });
    expect(seen).toHaveBeenCalledTimes(1);
    expect(m.get('hari')).toBe(3);
  });

  it('reset mengembalikan state awal dan menghapus history', () => {
    m.addClue('x');
    m.reset();
    expect(m.get('clues')).toEqual([]);
    expect(m.get('currentChapter')).toBeNull();
    expect(m.undo()).toBe(false);
  });
});
