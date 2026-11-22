// Check that every named import (static `import {..} from 'rel'`) of the given files resolves to an export.
import fs from 'node:fs'; import path from 'node:path';
import {init, parse} from '/mnt/data/peter/projects/.worktrees/integration-candidate-20261121/node_modules/es-module-lexer/dist/lexer.js';
await init;
const root = '/mnt/data/peter/projects/.worktrees/integration-candidate-20261121';
const exportsOf = new Map();
function exportNames(file) {
  if (exportsOf.has(file)) return exportsOf.get(file);
  const src = fs.readFileSync(file, 'utf8'); const [imps, exps] = parse(src);
  const names = new Set(exps.map((e) => e.n));
  // export * from '...'
  for (const m of src.matchAll(/export \* from ['"]([^'"]+)['"]/g)) {
    const t = path.resolve(path.dirname(file), m[1]); if (fs.existsSync(t)) for (const n of exportNames(t)) names.add(n);
  }
  exportsOf.set(file, names); return names;
}
const files = process.argv.slice(2); let bad = 0, checked = 0;
for (const rel of files) {
  const file = path.join(root, rel); if (!fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/g)) {
    const target = path.resolve(path.dirname(file), m[2]);
    if (!fs.existsSync(target)) { console.log(`MISSING MODULE ${rel} -> ${m[2]}`); bad++; continue; }
    const names = exportNames(target);
    for (const part of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
      const name = part.split(/\s+as\s+/)[0].trim(); checked++;
      if (!names.has(name)) { console.log(`UNRESOLVED ${rel}: ${name} from ${m[2]}`); bad++; }
    }
  }
}
console.log(`checked ${checked} named imports in ${files.length} files; unresolved ${bad}`);
