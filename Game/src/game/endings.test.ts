import { beforeEach, describe, expect, it } from 'vitest';
import { EndingManager } from './endings.js';
import { gameState } from './state.js';

/**
 * Uji decision tree penentuan ending.
 *
 * loadFromData() memanggil fetch() yang gagal di environment node, sehingga
 * EndingManager jatuh ke built-in endings - itulah yang diuji di sini.
 */
async function freshManager(): Promise<EndingManager> {
  const m = new EndingManager();
  await m.loadFromData();
  return m;
}

/** Set variabel permainan sekaligus (sisanya tetap default). */
function vars(partial: Record<string, unknown>): void {
  gameState.update({ variables: { ...gameState.get('variables'), ...partial } });
}

beforeEach(() => {
  gameState.reset();
});

describe('EndingManager.evaluateEnding', () => {
  it('built-in endings termuat (10 ending)', async () => {
    const m = await freshManager();
    expect(m.getAllEndings()).toHaveLength(10);
  });

  it('menolak tawaran Rudi -> ending_1', async () => {
    const m = await freshManager();
    vars({ terimaRudi: false });
    expect(m.evaluateEnding()?.id).toBe('ending_1');
  });

  it('konfrontasi dini tanpa investigasi cukup -> ending_2', async () => {
    const m = await freshManager();
    vars({ terimaRudi: true, konfrontasiDini: true, investigasi: 3 });
    expect(m.evaluateEnding()?.id).toBe('ending_2');
  });

  it('percaya Rudi dengan keyakinan Raka rendah -> ending_9', async () => {
    const m = await freshManager();
    vars({ terimaRudi: true, percayaDimas: 1 });
    gameState.addFlag('percayaRudi');
    expect(m.evaluateEnding()?.id).toBe('ending_9');
  });

  it('nurani pulih + mengaku di patroli -> ending_7', async () => {
    const m = await freshManager();
    vars({ terimaRudi: true, nurani: 2 });
    gameState.addFlag('b17_confess');
    expect(m.evaluateEnding()?.id).toBe('ending_7');
  });

  it('keyakinan rendah + pulang ke kota -> ending_8', async () => {
    const m = await freshManager();
    vars({ terimaRudi: true, keyakinan: 3 });
    gameState.addFlag('b18_goHome');
    expect(m.evaluateEnding()?.id).toBe('ending_8');
  });

  it('b20 memilih "biarkan" -> ending_5', async () => {
    const m = await freshManager();
    vars({ terimaRudi: true, b20Pilihan: 'biarkan' });
    expect(m.evaluateEnding()?.id).toBe('ending_5');
  });

  it('b20 memilih "diam" -> ending_4', async () => {
    const m = await freshManager();
    vars({ terimaRudi: true, b20Pilihan: 'diam' });
    expect(m.evaluateEnding()?.id).toBe('ending_4');
  });

  it('syarat true ending terpenuhi -> ending_6', async () => {
    const m = await freshManager();
    vars({
      terimaRudi: true,
      b20Pilihan: 'selamatkan_lapor',
      investigasi: 7,
      empatiB15: true,
      nurani: 3
    });
    expect(m.evaluateEnding()?.id).toBe('ending_6');
  });

  it('selamatkan_lapor tanpa syarat penuh -> ending_3', async () => {
    const m = await freshManager();
    vars({
      terimaRudi: true,
      b20Pilihan: 'selamatkan_lapor',
      investigasi: 5, // kurang dari 7
      empatiB15: false,
      nurani: 1
    });
    expect(m.evaluateEnding()?.id).toBe('ending_3');
  });

  it('sumpah di ladang + nurani terjaga -> ending_10', async () => {
    const m = await freshManager();
    vars({ terimaRudi: true, nurani: 2 });
    gameState.addFlag('b10alt_sumpah');
    expect(m.evaluateEnding()?.id).toBe('ending_10');
  });

  it('sumpah tanpa nurani cukup -> jatuh ke cabang b20', async () => {
    const m = await freshManager();
    vars({ terimaRudi: true, nurani: 1, b20Pilihan: 'diam' });
    gameState.addFlag('b10alt_sumpah');
    expect(m.evaluateEnding()?.id).toBe('ending_4');
  });

  it('evaluasi hanya sekali: panggilan berikutnya memakai hasil tersimpan', async () => {
    const m = await freshManager();
    vars({ terimaRudi: false });
    expect(m.evaluateEnding()?.id).toBe('ending_1');
    // Ubah variabel setelah evaluasi: ending tidak berubah lagi.
    vars({ terimaRudi: true, b20Pilihan: 'diam' });
    expect(m.evaluateEnding()?.id).toBe('ending_1');
  });

  it('ending yang dicapai tercatat di gameState.endingsUnlocked', async () => {
    const m = await freshManager();
    vars({ terimaRudi: false });
    m.evaluateEnding();
    expect(gameState.hasEnding('ending_1')).toBe(true);
    expect(m.getUnlockedEndings().map(e => e.id)).toContain('ending_1');
  });

  it('serialize/deserialize mempertahankan ending terkini', async () => {
    const m = await freshManager();
    vars({ terimaRudi: false });
    m.evaluateEnding();
    const data = m.serialize();

    const m2 = await freshManager();
    m2.deserialize(data);
    expect(m2.getCurrentEnding()?.id).toBe('ending_1');
  });
});
