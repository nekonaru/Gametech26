// Pastikan flag yang diset oleh onSelect pilihan "Pergi" sama persis dengan
// flag yang dipakai sebagai syarat chapterEnd di onUse pintu.
import { readFileSync } from 'node:fs';

const cases = [
  { id: 'b01', node: 'b01.keluar', pergi: 'b01.keluar.pergi', tunggu: 'b01.keluar.tunggu', door: 'pintu_depan' },
  { id: 'b02', node: 'b02.keluar', pergi: 'b02.keluar.pergi', tunggu: 'b02.keluar.tunggu', door: 'pintu_keluar' },
  { id: 'b03', node: 'b03.turun', pergi: 'b03.turun.pergi', tunggu: 'b03.turun.tunggu', door: 'pintu_bus' },
  { id: 'b04', node: 'b04.keluar', pergi: 'b04.keluar.pergi', tunggu: 'b04.keluar.tunggu', door: 'pintu_keluar' },
];

let fail = 0;
const bad = (msg) => { console.log('  GAGAL: ' + msg); fail++; };

for (const c of cases) {
  const ch = JSON.parse(readFileSync(`public/data/chapters/${c.id}.json`, 'utf8'));
  const loc = JSON.parse(readFileSync(`public/locales/chapters/${c.id}.json`, 'utf8'));
  console.log(`\n===== ${c.id}`);

  const door = ch.interactables.find(i => i.id === c.door);
  if (!door) bad(`pintu ${c.door} tidak ada`);
  if (door && door.once !== undefined) bad('pintu masih once=true -> pemain tak bisa ulangi');
  if (door && !JSON.stringify(door.onUse).includes('chapterEnd')) bad('onUse tanpa chapterEnd');

  const ifOp = door?.onUse?.find(o => o.op === 'if');
  if (!ifOp) { bad('onUse tidak punya op if'); continue; }
  const m = String(ifOp.condition).match(/flags\.(\w+) === true/);
  if (!m) { bad('syarat if bukan bentuk flags.X === true: ' + ifOp.condition); continue; }
  const flagFromIf = m[1];
  console.log('  flag (chapterEnd): ' + flagFromIf);

  const node = ch.dialogs[c.node];
  const pergiChoice = node[0].choices.find(x => x.next === c.pergi);
  const setOp = (pergiChoice?.onSelect || []).find(o => o.op === 'setFlag');
  if (!setOp) { bad('pilihan Pergi tidak punya onSelect setFlag'); continue; }
  console.log('  flag (onSelect)  : ' + setOp.flag);
  if (setOp.flag !== flagFromIf) bad(`mismatch flag: if=${flagFromIf} vs onSelect=${setOp.flag}`);

  const tunggu = ch.dialogs[c.tunggu];
  if (tunggu[0].autoNext) bad('node tunggu masih autoNext -> loop tak berujung');
  else console.log('  tunggu: berakhir sendiri (tanpa autoNext)');

  // Kalimat tunggu harus benar-benar ada isinya (locale id + en)
  const path = c.node.split('.');
  const idText = path.reduce((o, k) => (o ? o[k] : undefined), loc.id);
  const enText = path.reduce((o, k) => (o ? o[k] : undefined), loc.en);
  const tungguId = idText?.tunggu?.['1'];
  const tungguEn = enText?.tunggu?.['1'];
  if (!tungguId) bad('teks tunggu (id) tidak ditemukan di locale');
  else console.log('  teks id : ' + tungguId);
  if (!tungguEn) bad('teks tunggu (en) tidak ditemukan di locale');
  else console.log('  teks en : ' + tungguEn);
}

console.log(fail === 0 ? '\nSEMUA CEK LOLOS' : `\n${fail} CEK GAGAL`);
process.exit(fail ? 1 : 0);
