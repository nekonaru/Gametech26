// Audit gerbang keluar b01-b04: apakah prasyarat bisa dicapai, pintu once?,
// dan teks "tunggu" masuk akal sebagai kalimat penutup.
import { readFileSync } from 'node:fs';

const chapters = ['b01', 'b02', 'b03', 'b04'];
const gates = {
  b01: { flag: 'flags.b01_panggilan === true', node: 'b01.keluar', tunggu: 'b01.keluar.tunggu', pergi: 'b01.keluar.pergi' },
  b02: { flag: 'flags.b02_talk === true', node: 'b02.keluar', tunggu: 'b02.keluar.tunggu', pergi: 'b02.keluar.pergi' },
  b03: { flag: 'flags.b03_chat === true', node: 'b03.turun', tunggu: 'b03.turun.tunggu', pergi: 'b03.turun.pergi' },
  b04: { flag: "clues.includes('c1')", node: 'b04.keluar', tunggu: 'b04.keluar.tunggu', pergi: 'b04.keluar.pergi' },
};

for (const id of chapters) {
  const g = gates[id];
  const ch = JSON.parse(readFileSync(`public/data/chapters/${id}.json`, 'utf8'));
  const loc = JSON.parse(readFileSync(`public/locales/chapters/${id}.json`, 'utf8'));

  console.log(`\n===== ${id}`);
  const door = (ch.interactables || []).find(i => JSON.stringify(i.onUse || '').includes(g.node));
  console.log(`  pintu      : ${door?.id}  once=${JSON.stringify(door?.once)}`);
  console.log(`  onUse      : ${JSON.stringify(door?.onUse)}`);
  console.log(`  gerbang    : ${g.flag}`);
  console.log(`  node tunggu: ${JSON.stringify(ch.dialogs[g.tunggu])}`);
  console.log(`  node pergi : ${JSON.stringify(ch.dialogs[g.pergi])}`);

  // Siapa yang menyetel prasyarat?
  const setters = [];
  const scan = (o, trail) => {
    if (Array.isArray(o)) return o.forEach((v, i) => scan(v, `${trail}[${i}]`));
    if (o && typeof o === 'object') {
      if (o.op === 'setFlag') setters.push(`${trail} -> ${o.flag}`);
      if (o.op === 'giveClue') setters.push(`${trail} -> giveClue ${o.id}`);
      for (const k of Object.keys(o)) scan(o[k], `${trail}.${k}`);
    }
  };
  scan(ch, id);
  console.log('  pemicu    :');
  for (const s of [...new Set(setters)]) console.log('    ' + s);

  // Teks penutup
  const flat = JSON.stringify(loc.id);
  const m = flat.match(new RegExp(`"${g.tunggu.split('.').slice(2).join('.')}":\\s*\\{[^}]*"1":"([^"]*)"`));
  console.log(`  teks tunggu: ${m ? m[1] : '(tidak ditemukan)'}`);
}
