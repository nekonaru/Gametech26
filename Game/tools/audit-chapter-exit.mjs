// Audit: apakah tiap bab punya jalur yang benar-benar bisa memicu chapterEnd.
// - chapterEnd di belakang `if` flag: flag wajib diset (setFlag) di bab itu
// - pilihan yang menyetel flag punya condition: condition itu juga harus bisa
//   dipenuhi dari flag lain yang diset tanpa syarat.
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../public/data/chapters/', import.meta.url);
const files = readdirSync(dir).filter(f => f.endsWith('.json'));

function walk(node, cb) {
  if (!node) return;
  if (Array.isArray(node)) return node.forEach(n => walk(n, cb));
  if (typeof node !== 'object') return;
  cb(node);
  for (const v of Object.values(node)) walk(v, cb);
}

let problems = 0;
for (const f of files) {
  const raw = readFileSync(new URL(f, dir), 'utf8');
  const script = JSON.parse(raw);

  // semua setFlag di bab ini (op, pilihan, dialog, onEnter/onExit)
  const setFlags = new Set();
  const conditionalSetFlags = new Map(); // flag -> syarat
  walk(script, (n) => {
    if (n.op === 'setFlag' && typeof n.flag === 'string') {
      // cari apakah berada di dalam choice bersyarat -> kita hanya tandai kasar:
      // semua setFlag dianggap tersedia tanpa syarat kecuali ada condition
      setFlags.add(n.flag);
    }
    if (Array.isArray(n.choices)) {
      for (const c of n.choices) {
        if (!c || typeof c.condition !== 'string') continue;
        walk(c.onSelect ?? c, (m) => {
          if (m.op === 'setFlag') conditionalSetFlags.set(m.flag, c.condition);
        });
      }
    }
  });

  // cari chapterEnd + syaratnya
  const exits = [];
  walk(script, (n) => {
    if (Array.isArray(n.then)) {
      const has = n.then.some(x => x && x.op === 'chapterEnd');
      if (has) exits.push({ cond: n.condition ?? null });
    }
    if (n.op === 'chapterEnd') exits.push({ cond: null, direct: true });
  });

  if (!exits.length) {
    // Cabang alternatif boleh tanpa chapterEnd kalau mengandung op `ending`
    // (mis. b15alt yang bermuara pada ending_2 lewat opsi jalan_ke_hutan).
    let hasEnding = false;
    walk(script, (n) => { if (n.op === 'ending') hasEnding = true; });
    if (hasEnding) {
      console.log(`[cabang -> ending] ${script.id}`);
      continue;
    }
    console.log(`[TANPA chapterEnd] ${script.id}`);
    problems++;
    continue;
  }

  for (const e of exits) {
    if (!e.cond) continue;
    const m = [...e.cond.matchAll(/flags\.([A-Za-z0-9_]+)/g)].map(x => x[1]);
    for (const flag of m) {
      if (setFlags.has(flag)) continue;
      console.log(`[FLAG TAK DISET] ${script.id}: condition "${e.cond}" butuh flags.${flag}: tidak ada setFlag di bab ini`);
      problems++;
    }
  }

  // pilihan bersyarat yang menyetel flag keluar
  for (const [flag, cond] of conditionalSetFlags) {
    const m = [...cond.matchAll(/flags\.([A-Za-z0-9_]+)/g)].map(x => x[1]);
    for (const need of m) {
      if (!setFlags.has(need)) {
        console.log(`[SYARAT TAK TERPENUHI] ${script.id}: pilihan setFlag ${flag} butuh "${cond}", flags.${need} tak pernah diset`);
        problems++;
      }
    }
  }
}
console.log(problems ? `\n${problems} masalah` : '\nSemua bab punya jalur chapterEnd yang terpenuhi');
