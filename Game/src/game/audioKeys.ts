import type { ChapterScript, ScriptOperation } from './scriptRunner.js';

/**
 * Kumpulkan semua key `playSound` yang dipakai satu naskah bab.
 *
 * Dipakai `loadChapter` untuk meminta rekaman bab di latar (`ensureAudio`)
 * begitu bab dimuat, supaya unduhan ambience/musik/SFX bab tidak menumpuk
 * di boot. Penelusuran mencakup onEnter/onSpawn/onExit, semua onUse
 * interaktif, dan SEMUA node dialog (onEnter/onExit/pilihan onSelect):
 * cakupan sengaja superset statis, bukan mengikuti alur runtime, agar tidak
 * ada key yang terlewat karena cabang `if` yang belum terbuka.
 *
 * Murni (tanpa efek samping) supaya bisa diuji unit. Cermin struktur
 * penelusuran `assignInteractableRoles` di scriptRunner.
 */
export function collectChapterAudioKeys(script: ChapterScript): string[] {
  const keys = new Set<string>();

  const walkOps = (ops: ScriptOperation[] | undefined): void => {
    if (!Array.isArray(ops)) return;
    for (const op of ops) {
      if (!op || typeof op !== 'object') continue;
      if (op.op === 'playSound' && typeof op.key === 'string' && op.key) {
        keys.add(op.key);
      }
      if (op.op === 'if') {
        walkOps(op.then);
        walkOps(op.else);
      }
      if (op.op === 'choice' && Array.isArray(op.options)) {
        for (const opt of op.options) walkOps(opt?.onSelect);
      }
      if (op.op === 'startPuzzle' && op.config && typeof op.config === 'object') {
        walkOps(op.config.onSolve);
        walkOps(op.config.onSkip);
        walkOps(op.config.onHelp);
      }
    }
  };

  walkOps(script.onEnter);
  walkOps(script.onSpawn);
  walkOps(script.onExit);
  for (const inter of script.interactables || []) walkOps(inter.onUse);
  for (const nodes of Object.values(script.dialogs || {})) {
    if (!Array.isArray(nodes)) continue;
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      walkOps(node.onEnter);
      walkOps(node.onExit);
      for (const choice of node.choices || []) walkOps(choice?.onSelect);
    }
  }

  return [...keys];
}
