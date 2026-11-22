// Compare the export names of given modules between a ref and the working tree; list importers of removed names.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {init, parse} from '/mnt/data/peter/projects/.worktrees/integration-candidate-20261121/node_modules/es-module-lexer/dist/lexer.js';
await init;
const [ref, ...files] = process.argv.slice(2);
const names = (src) => new Set(parse(src)[1].map((e) => e.n));
const removed = {};
for (const f of files) {
  let before = '';
  try { before = execFileSync('git', ['show', `${ref}:${f}`], {encoding: 'utf8', maxBuffer: 1 << 26}); } catch { continue; }
  const now = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
  const a = names(before), b = names(now);
  const gone = [...a].filter((n) => !b.has(n));
  if (gone.length) removed[f] = gone;
}
console.log(JSON.stringify(removed, null, 1));
