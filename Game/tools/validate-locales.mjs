/**
 * Validasi kunci terjemahan.
 *
 * Setiap string pada field `text`, `prompt`, dan `label` di naskah bab yang
 * berbentuk kunci (mengandung titik, tanpa spasi) wajib tersedia pada locale
 * berbahasa Indonesia DAN Inggris: kalau tidak, pemain akan melihat kunci
 * mentah seperti `b09.ember.1` di layar.
 *
 * Selain itu memeriksa kesimetrian kunci `id` vs `en` di tiap file locale bab
 * (kunci yang hanya ada di salah satu bahasa tidak akan tampil saat pemain
 * berpindah bahasa).
 *
 * Pakai: node tools/validate-locales.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localesDir = path.join(root, 'public', 'locales');
const chaptersDir = path.join(root, 'public', 'data', 'chapters');

const KEY_RE = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/i;
const TEXT_FIELDS = new Set(['text', 'prompt', 'label']);

/** Objek locale bersarang -> pemetaan kunci titik -> nilai. */
function flatten(obj, prefix = '', out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const dotted = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value, dotted, out);
    } else if (typeof value === 'string') {
      out.set(dotted, value);
    }
  }
  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const base = {
  id: flatten(readJson(path.join(localesDir, 'id.json'))),
  en: flatten(readJson(path.join(localesDir, 'en.json')))
};

const problems = [];
let keyRefs = 0;
let checkedFiles = 0;

const chapterFiles = fs.readdirSync(chaptersDir).filter((f) => f.endsWith('.json')).sort();

for (const file of chapterFiles) {
  const chapterId = path.basename(file, '.json');
  const localeFile = path.join(localesDir, 'chapters', file);
  if (!fs.existsSync(localeFile)) {
    problems.push(`[${chapterId}] file locale hilang: public/locales/chapters/${file}`);
    continue;
  }
  checkedFiles++;
  const locale = readJson(localeFile);
  const flat = {
    id: flatten(locale.id ?? {}),
    en: flatten(locale.en ?? {})
  };

  // Kesimetrian bahasa pada locale bab.
  for (const lang of ['id', 'en']) {
    const other = lang === 'id' ? 'en' : 'id';
    for (const key of flat[lang].keys()) {
      if (!flat[other].has(key)) {
        problems.push(`[${chapterId}] kunci "${key}" hanya ada di ${lang}, hilang di ${other}`);
      }
    }
  }

  const chapter = readJson(path.join(chaptersDir, file));
  const seen = new Set();

  const visit = (node, where) => {
    if (Array.isArray(node)) {
      node.forEach((child, i) => visit(child, `${where}[${i}]`));
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const [field, value] of Object.entries(node)) {
      if (typeof value === 'string' && TEXT_FIELDS.has(field) && KEY_RE.test(value)) {
        keyRefs++;
        const id = `${where}.${field}=${value}`;
        if (seen.has(id)) continue;
        seen.add(id);
        for (const lang of ['id', 'en']) {
          if (!flat[lang].has(value) && !base[lang].has(value)) {
            problems.push(`[${chapterId}] ${where}.${field}: kunci "${value}" tidak ada di locale ${lang}`);
          }
        }
      } else if (value && typeof value === 'object') {
        visit(value, `${where}.${field}`);
      }
    }
  };

  visit(chapter, chapterId);
}

const unique = [...new Set(problems)];
console.log(`Bab diperiksa      : ${checkedFiles}`);
console.log(`Rujukan kunci teks : ${keyRefs}`);
console.log(`Masalah locale     : ${unique.length}`);
for (const p of unique.slice(0, 40)) console.log(`  - ${p}`);
if (unique.length > 40) console.log(`  ... dan ${unique.length - 40} lainnya`);
process.exit(unique.length ? 1 : 0);
