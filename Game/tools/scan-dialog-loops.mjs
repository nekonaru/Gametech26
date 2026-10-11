// Pindai semua babak: cari dialog yang bisa memutar (cycle) dan menyisakan
// hanya opsi bersyarat sehingga pemain terkunci tanpa bisa keluar.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url)) + '/../public/data/chapters/';

for (const file of readdirSync(dir).sort()) {
  if (!file.endsWith('.json')) continue;
  const ch = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  const dialogs = ch.dialogs || {};

  const edges = new Map(); // node -> [{to, label, condition}]
  const nodesWithConditionalChoice = [];
  const nodesWithChoices = [];

  for (const [id, nodes] of Object.entries(dialogs)) {
    const list = [];
    for (const node of nodes) {
      if (node.choices?.length) {
        for (const c of node.choices) {
          list.push({ to: c.next, label: c.text, condition: c.condition || null });
        }
      }
      if (node.autoNext) list.push({ to: node.autoNext, label: '(autoNext)', condition: null });
    }
    edges.set(id, list);

    const lastWithChoices = nodes.filter(n => n.choices?.length);
    for (const n of lastWithChoices) {
      nodesWithChoices.push({ id, choices: n.choices.map(c => ({ t: c.text, cond: c.condition || null })) });
      if (n.choices.some(c => c.condition)) nodesWithConditionalChoice.push(id);
    }
  }

  // Cari cycle lewat DFS sederhana
  const cycles = [];
  const stack = [];
  const seen = new Set();
  const walk = (id) => {
    const at = stack.indexOf(id);
    if (at !== -1) { cycles.push(stack.slice(at).concat(id)); return; }
    if (seen.has(id)) return;
    seen.add(id);
    stack.push(id);
    for (const e of edges.get(id) || []) if (e.to) walk(e.to);
    stack.pop();
  };
  for (const id of Object.keys(dialogs)) walk(id);

  const uniq = new Set(cycles.map(c => c.join(' -> ')));
  const loopWithCond = [...uniq].filter(s => {
    const nodes = s.split(' -> ');
    return nodes.some(n => nodesWithConditionalChoice.includes(n)) ||
           nodes.some(n => (edges.get(n) || []).some(e => e.condition));
  });

  if (uniq.size || nodesWithConditionalChoice.length) {
    console.log(`\n=== ${file} (chapter ${ch.id}) ===`);
    if (uniq.size) console.log('  CYCLE:', [...uniq].join('  |  '));
    else console.log('  CYCLE: -');
    if (loopWithCond.length) console.log('  *** CYCLE + PILIHAN BERSYARAT:', loopWithCond.join('  |  '));
    for (const n of nodesWithConditionalChoice) {
      const node = dialogs[n].find(x => x.choices?.some(c => c.condition));
      console.log(`  cond-choice @ ${n}:`, JSON.stringify(node.choices.map(c => ({ t: c.text, cond: c.condition }))));
    }
  }
}
