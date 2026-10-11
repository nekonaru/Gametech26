#!/usr/bin/env node
/**
 * Validasi konten game: referensi dialog, kunci locale, operasi script,
 * interactable yang mengarah ke dialog tidak ada, dan posisi prop yang
 * menabrak geometry (dihitung terpisah oleh penempatan prop di game).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const KNOWN_OPS = new Set([
  'dialog', 'choice', 'setFlag', 'addVar', 'if', 'giveClue', 'giveItem', 'removeItem',
  'objective', 'chapterEnd', 'loadScene', 'gotoScene', 'cutscene', 'playSound', 'setLighting', 'wait',
  'cameraAnim',
  'checkpoint', 'startPuzzle', 'echo', 'ending', 'setPOV', 'setTime', 'teleport', 'setEcho',
  'addEmpati', 'addNurani', 'modifyPercayaDimas', 'modifyPercayaRudi', 'setKonfrontasiDini',
  'setEmpatiB15', 'setJoyDitemui', 'setB20Pilihan', 'calculateKeyakinan'
]);

const chaptersDir = path.join(root, 'public', 'data', 'chapters');
const localeDir = path.join(root, 'public', 'locales');
const chapterLocaleDir = path.join(localeDir, 'chapters');

// kumpulkan semua kunci locale
const localeKeys = { id: new Set(), en: new Set() };
for (const lang of ['id', 'en']) {
  const file = path.join(localeDir, `${lang}.json`);
  if (!fs.existsSync(file)) continue;
  const flat = (obj, prefix = '') => {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, key);
      else localeKeys[lang].add(key);
    }
  };
  flat(readJson(file));
}
const flattenKeys = (obj, prefix, out) => {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flattenKeys(v, key, out);
    else out.add(key);
  }
};
if (fs.existsSync(chapterLocaleDir)) {
  for (const f of fs.readdirSync(chapterLocaleDir)) {
    const data = readJson(path.join(chapterLocaleDir, f));
    for (const lang of ['id', 'en']) {
      if (data[lang]) flattenKeys(data[lang], '', localeKeys[lang]);
    }
  }
}

const files = fs.readdirSync(chaptersDir).filter(f => f.endsWith('.json'));
// loadScene merujuk bab lain: id bab = nama file tanpa ekstensi.
const chapterIds = new Set(files.map((f) => f.replace(/\.json$/, '')));
const problems = [];
const note = (file, msg) => problems.push(`[${file}] ${msg}`);

const isLocaleKey = (s) => typeof s === 'string' && /^[a-z0-9_]+(\.[a-z0-9_]+)+$/i.test(s);

for (const f of files) {
  const script = readJson(path.join(chaptersDir, f));
  const dialogs = new Set(Object.keys(script.dialogs || {}));

  const checkDialogRef = (id, where) => {
    if (id && !dialogs.has(id)) note(f, `dialog "${id}" tidak ada (dipakai di ${where})`);
  };

  const walkOps = (ops, where) => {
    if (!Array.isArray(ops)) return;
    for (const op of ops) {
      if (!op || typeof op.op !== 'string') { note(f, `operasi tidak valid di ${where}`); continue; }
      if (!KNOWN_OPS.has(op.op)) note(f, `operasi tidak dikenal "${op.op}" di ${where}`);
      if (op.op === 'dialog') checkDialogRef(op.node, where);
      if (op.op === 'loadScene') {
        // loadScene memuat bab lain (file chapters) atau scene dalam bab ini.
        // Dulu setiap pemakaian dicatat manual tanpa divalidasi; kini referensi
        // rusak benar-benar terdeteksi, yang valid tidak menimbulkan suara.
        if (typeof op.scene !== 'string'
          || (!chapterIds.has(op.scene) && op.scene !== script.scene && !(script.scenes || {})[op.scene])) {
          note(f, `loadScene "${op.scene}" tidak ada sebagai chapter/scene (di ${where})`);
        }
      }
      if (op.op === 'gotoScene') {
        const known = script.scenes || {};
        if (typeof op.scene !== 'string' || (op.scene !== script.scene && !known[op.scene])) {
          note(f, `gotoScene "${op.scene}" tidak ada di peta scenes (di ${where})`);
        }
      }
      if (op.op === 'objective' && op.text && isLocaleKey(op.text) && !localeKeys.id.has(op.text)) {
        note(f, `kunci locale objective hilang: "${op.text}"`);
      }
      if (op.op === 'if') { walkOps(op.then, where); walkOps(op.else, where); }
      if (op.op === 'choice' && Array.isArray(op.options)) {
        op.options.forEach((o, i) => { checkDialogRef(o?.next, `${where} choice#${i}`); walkOps(o?.onSelect, `${where} choice#${i}`); });
      }
      if (op.op === 'startPuzzle') {
        const cfg = op.config || {};
        if (cfg.onSolve) walkOps(cfg.onSolve, `${where} puzzle ${op.id} onSolve`);
        if (cfg.onSkip) walkOps(cfg.onSkip, `${where} puzzle ${op.id} onSkip`);
        if (cfg.onHelp) walkOps(cfg.onHelp, `${where} puzzle ${op.id} onHelp`);
      }
    }
  };

  walkOps(script.onEnter, 'onEnter');
  walkOps(script.onExit, 'onExit');
  walkOps(script.onSpawn, 'onSpawn');

  for (const inter of script.interactables || []) {
    walkOps(inter.onUse, `interactable ${inter.id}`);
  }

  for (const [id, nodes] of Object.entries(script.dialogs || {})) {
    if (!Array.isArray(nodes)) { note(f, `dialog "${id}" bukan array`); continue; }
    nodes.forEach((node, i) => {
      const where = `dialog ${id}[${i}]`;
      walkOps(node.onEnter, `${where} onEnter`);
      walkOps(node.onExit, `${where} onExit`);
      if (node.autoNext) checkDialogRef(node.autoNext, `${where} autoNext`);
      for (const c of node.choices || []) {
        checkDialogRef(c.next, `${where} choice "${c.text}"`);
        walkOps(c.onSelect, `${where} choice "${c.text}" onSelect`);
      }
      if (node.text && isLocaleKey(node.text) && !localeKeys.id.has(node.text)) {
        note(f, `kunci locale teks hilang: "${node.text}" di ${where}`);
      }
    });
  }

  // peta scene dalam satu bab (perpindahan tempat lewat gotoScene)
  for (const [sceneId, entry] of Object.entries(script.scenes || {})) {
    if (entry.spawn && !entry.spawn.every(Number.isFinite)) {
      note(f, `spawn scene "${sceneId}" tidak valid`);
    }
    if (entry.label && isLocaleKey(entry.label) && !localeKeys.id.has(entry.label)) {
      note(f, `kunci locale label scene "${sceneId}" hilang: "${entry.label}"`);
    }
  }

  // posisi prop
  for (const inter of script.interactables || []) {
    if (inter.scene && inter.scene !== script.scene && !(script.scenes || {})[inter.scene]) {
      note(f, `interactable ${inter.id} berada di scene tak dikenal "${inter.scene}"`);
    }
    if (!inter.position) continue;
    const [x, y, z] = inter.position;
    if (![x, y, z].every(Number.isFinite)) note(f, `posisi interactable ${inter.id} tidak valid`);
    // y ≠ 0 itu sah (b13-b15 memang menempatkan prompt pada ketinggian
    // berbeda); dulu setiap nilai non-nol ikut dicatat dan menimbulkan 27
    // keluhan noise yang menutupi masalah sungguhan.
  }
}

// cross-check: kunci locale yang dipakai tapi belum ada (dari locale id vs en)
const missingEn = [...localeKeys.id].filter(k => !localeKeys.en.has(k));
const missingId = [...localeKeys.en].filter(k => !localeKeys.id.has(k));

console.log(`Chapter diperiksa : ${files.length}`);
console.log(`Kunci locale id   : ${localeKeys.id.size}`);
console.log(`Kunci locale en   : ${localeKeys.en.size}`);
console.log(`Masalah konten    : ${problems.length}`);
for (const p of problems) console.log('  - ' + p);
if (missingEn.length) console.log(`\nKunci tanpa terjemahan EN (${missingEn.length}):\n  ` + missingEn.slice(0, 40).join('\n  ') + (missingEn.length > 40 ? '\n  ...' : ''));
if (missingId.length) console.log(`\nKunci tanpa terjemahan ID (${missingId.length}):\n  ` + missingId.slice(0, 40).join('\n  ') + (missingId.length > 40 ? '\n  ...' : ''));

// Selama ini file ini selalu exit 0 - masalah konten baru tidak pernah bisa
// menggagalkan apa pun. Kini daftar masalah benar-benar berbobot: audit dan
// CI berhenti bila ada referensi rusak.
if (problems.length) process.exitCode = 1;
