import {validateStickyTheoryLedger} from './scripts/work-tracker.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sticky-ledger-'));
const seq = [
  ['done-20260520-a.md', 'transition_gap', null],
  ['done-20260521-b.md', 'transition_gap', null],
  ['done-20260522-c.md', 'transition_gap', null],
];
for (const [name, mech, outcome] of seq) {
  const meta = {
    schema: 'work-package-v1', status: 'done',
    opened: `2026-05-${name.slice(11, 13)}`,
    lane: 'runtime-owner-boundary', owner: 'owner_a', boundary: 'boundary_x',
    scenario: 'rolling-restart',
    artifact: `test/output/${name}.json`,
    mechanismCard: {failureMechanism: mech, expectedMovement: 'x', negativeResultMeans: 'y'},
  };
  if (outcome) meta.theoryLoop = {outcome};
  fs.writeFileSync(path.join(dir, name),
    `# t\n\n<!-- work-package\n${JSON.stringify(meta, null, 2)}\n-->\n`);
}
const ledger = ['theory-20260520-foo'].map((s) => `## \`${s}\`\n\nbody\n`).join('\n');
const ledgerPath = path.join(dir, 'theory-ledger.md');
fs.writeFileSync(ledgerPath, ledger);

console.log('Test dir:', dir);
console.log('Files:', fs.readdirSync(dir));

const errors = validateStickyTheoryLedger(
  {status: 'active', owner: 'owner_a', boundary: 'boundary_x',
   lane: 'runtime-owner-boundary',
   writeScope: ['src/foo.js'],
   theoryLedgerRefs: []},
  'work/packages/active-new.md',
  {phase: 'pre-impl', packageDir: dir, ledgerPath},
);
console.log('errors:', errors);
console.log('Expected: sticky-theory-ledger-empty');
console.log('Has error?', errors.some((e) => e.includes('sticky-theory-ledger-empty')));
fs.rmSync(dir, {recursive: true, force: true});
