#!/usr/bin/env node
/**
 * Audit regresi objektif.
 *
 * Sebuah operasi `objective` yang dijalankan ulang akan menarik penanda
 * tujuan mundur ke tahap sebelumnya. Kalau operasi itu dipicu oleh
 * interaktif/percakapan yang bisa diulang pemain (mis. memeriksa kasur lagi,
 * mengajak pedagang bicara kedua kalinya) tanpa syarat `if` flag, objektif
 * bisa mundur sendiri di tengah bab.
 *
 * Bab yang dibuka lewat `onEnter` memang sengaja tanpa syarat: itu bukan
 * masalah. Yang dilaporkan adalah objective tanpa syarat pada jalur yang
 * bisa dijalankan ulang: `onUse` interaktif, `onEnter/onExit` dialog, dan
 * `onSelect` pilihan.
 *
 * Pakai: node tools/audit-objective-guards.mjs
 * Selalu exit 0 (laporan), seperti validate-content.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chaptersDir = path.join(root, 'public', 'data', 'chapters');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/**
 * Kumpulkan semua operasi objective beserta sumber pemicunya.
 * `guarded` berisi kondisi `if` terdekat bila ada.
 */
function collectObjectives(node, where, guarded, source, out) {
  if (Array.isArray(node)) {
    node.forEach((child, i) => collectObjectives(child, `${where}[${i}]`, guarded, source, out));
    return;
  }
  if (!node || typeof node !== 'object') return;

  if (node.op === 'objective') {
    out.push({ where, id: node.id, guarded: guarded || null, source });
    return;
  }

  const nextGuard = node.condition || guarded;
  for (const [key, value] of Object.entries(node)) {
    if (key === 'condition') continue;
    if (key === 'then' || key === 'else') {
      collectObjectives(value, `${where}.${key}`, nextGuard, source, out);
    } else if (key === 'onEnter' || key === 'onExit' || key === 'onUse' || key === 'onSelect' || key === 'autoNext') {
      // Sumber pemicu ditentukan oleh pintu masuk pertama: onUse interaktif,
      // onEnter dialog, dst.
      const sub = source ?? key.replace(/^on/, '');
      collectObjectives(value, `${where}.${key}`, nextGuard, sub, out);
    } else if (value && typeof value === 'object') {
      collectObjectives(value, `${where}.${key}`, nextGuard, source, out);
    }
  }
}

/** Dialog dapat bersarang: nilai berupa array node ATAU peta id -> lagi. */
function walkDialogs(node, where, out, source) {
  if (Array.isArray(node)) {
    node.forEach((entry, i) => {
      const at = `${where}[${i}]`;
      collectObjectives(entry?.onEnter, `${at}.onEnter`, null, source ?? 'dialogEnter', out);
      collectObjectives(entry?.onExit, `${at}.onExit`, null, source ?? 'dialogExit', out);
      (entry?.choices || []).forEach((choice, ci) => {
        collectObjectives(choice?.onSelect, `${at}.choices[${ci}].onSelect`, null, source ?? 'choice', out);
      });
      if (entry?.autoNext) walkDialogs(entry.autoNext, `${at}.autoNext`, out, source);
    });
    return;
  }
  if (node && typeof node === 'object') {
    for (const [id, child] of Object.entries(node)) walkDialogs(child, `${where}.${id}`, out, source);
  }
}

const files = fs.readdirSync(chaptersDir).filter(f => f.endsWith('.json')).sort();
const repeatable = [];   // objective tanpa syarat pada jalur yang bisa diulang
let total = 0;

for (const file of files) {
  const script = readJson(path.join(chaptersDir, file));
  const out = [];
  collectObjectives(script.onEnter, 'onEnter', null, 'chapterEnter', out);
  for (const inter of script.interactables || []) {
    collectObjectives(inter.onUse, `interactables.${inter.id}.onUse`, null, 'interact', out);
  }
  walkDialogs(script.dialogs || {}, 'dialogs', out, null);

  for (const entry of out) {
    total++;
    const isRepeatable = entry.source === 'interact' || entry.source === 'dialogEnter' ||
      entry.source === 'dialogExit' || entry.source === 'choice';
    if (isRepeatable && !entry.guarded) {
      repeatable.push({ file, ...entry });
    }
  }
}

const byChapter = new Map();
for (const r of repeatable) {
  if (!byChapter.has(r.file)) byChapter.set(r.file, []);
  byChapter.get(r.file).push(r);
}

console.log(`Chapter diperiksa   : ${files.length}`);
console.log(`Operasi objective   : ${total}`);
console.log(`Tanpa syarat+ulang  : ${repeatable.length}`);
for (const [file, list] of byChapter) {
  console.log(`\n=== ${file} ===`);
  for (const r of list) {
    console.log(`  obj "${r.id}" <- ${r.source} @ ${r.where}`);
  }
}
process.exit(0);
