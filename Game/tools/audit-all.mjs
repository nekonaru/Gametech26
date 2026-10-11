#!/usr/bin/env node
/**
 * Menjalankan seluruh suite audit/validator dengan satu perintah:
 *
 *   node tools/audit-all.mjs        (atau: npm run audit)
 *
 * Setiap tool dijalankan berurutan; keluarannya ditampilkan apa adanya,
 * lalu dirangkum di akhir. Proses keluar dengan kode 1 bila ada tool yang
 * gagal (exit code non-zero), sehingga cocok dipakai sebelum commit/build.
 *
 * Catatan: validate-content memang selalu exit 0: laporan baseline-nya
 * (posisi y legacy, loadScene) dibaca dari output, bukan dari kode keluar.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SUITE = [
  { file: 'validate-content.mjs', desc: 'referensi konten, op, posisi prop' },
  { file: 'validate-locales.mjs', desc: 'kunci teks id/en + simetri bahasa' },
  { file: 'verify-keluar.mjs', desc: 'jalur keluar bab b04' },
  { file: 'audit-keluar.mjs', desc: 'flag & dialog keluar b04' },
  { file: 'audit-chapter-exit.mjs', desc: 'tiap bab punya jalur chapterEnd' },
  { file: 'audit-objective-guards.mjs', desc: 'objektif tanpa syarat pada jalur berulang' },
  { file: 'scan-dialog-loops.mjs', desc: 'siklus dialog & choice bersyarat' }
];

const results = [];

for (const tool of SUITE) {
  console.log(`\n===== ${tool.file}: ${tool.desc} =====`);
  const run = spawnSync(process.execPath, [path.join(root, 'tools', tool.file)], {
    cwd: root,
    encoding: 'utf8',
    shell: false
  });
  const out = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  process.stdout.write(out.endsWith('\n') || out === '' ? out : `${out}\n`);
  results.push({ ...tool, code: run.status ?? -1 });
}

console.log('\n===== RINGKASAN =====');
let failed = 0;
for (const r of results) {
  const ok = r.code === 0;
  if (!ok) failed++;
  console.log(`  ${ok ? 'LOLOS' : 'GAGAL'} (${r.code})  ${r.file}: ${r.desc}`);
}
console.log(failed === 0 ? '\nSEMUA AUDIT LOLOS' : `\n${failed} audit gagal`);
process.exit(failed === 0 ? 0 : 1);
