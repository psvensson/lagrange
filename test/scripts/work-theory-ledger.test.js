import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';
import {
  appendTheoryLedgerEntry,
  extractTheoryLedgerEntries,
  findMissingTheoryLedgerRefs,
  findRelatedTheoryLedgerEntries,
  filterTheoryLedgerEntries,
  renderTheoryLedgerList,
  runCli,
  summarizeTheoryLedgerEntry,
  validateTheoryLedgerContent,
} from '../../scripts/work-theory-ledger.js';

const TEMP_DIR_PREFIX = 'work-theory-ledger-';
const LEDGER_FILE_NAME = 'theory-ledger.md';
const THEORY_ID = 'theory-20260522-snapshot-watch-handoff';
const SUPERSEDED_THEORY_ID = 'theory-20260522-snapshot-watch-fixture';
const STATUS_ACTIVE = 'active';
const STATUS_SUPPORTED = 'supported';
const OWNER_BOUNDARY = 'startup_active_gate_owner / snapshot_coverage';
const TEST_LEDGER_HEADER = [
  '# Experiment And Theory Ledger',
  '',
  '## Entries',
  '',
].join('\n');
const VALID_ENTRY = [
  `## ${THEORY_ID}`,
  '',
  '- Status: active',
  '- Scenario/gate: node-failure-rebalance / active_gate_snapshot_coverage',
  `- Owner/boundary: ${OWNER_BOUNDARY}`,
  '- Hypothesis: typed handoff contract emission moves selected snapshot evidence.',
  '- Probe: `npm run analyze:topology-convergence -- test-output/report.json --handoff-probe`',
  '- Artifact/result: `test-output/report.json` - handoff not detected yet.',
  '- Representative movement: pending-before-probe',
  '- Linked packages: `work/packages/todo-20260522-node-failure-rebalance-startup-active-gate-snapshot-watch-handoff-contract.md`',
  '- Supersedes: none',
  '- Superseded by: none',
  '- Next implication: implement the typed handoff package.',
].join('\n');
const SUPERSEDED_ENTRY = [
  `## ${SUPERSEDED_THEORY_ID}`,
  '',
  '- Status: superseded',
  '- Scenario/gate: node-failure-rebalance / active_gate_snapshot_coverage',
  '- Owner/boundary: startup_active_gate_owner / snapshot_coverage',
  '- Hypothesis: fixture-only proof is sufficient.',
  '- Probe: `npm run analyze:topology-convergence -- test-output/report.json --replay-fixture`',
  '- Artifact/result: `work/packages/done-20260522-node-failure-rebalance-startup-active-gate-handoff-fixture.md` - fixture preserved evidence.',
  '- Representative movement: same-frontier',
  '- Linked packages: `work/packages/done-20260522-node-failure-rebalance-startup-active-gate-handoff-fixture.md`',
  '- Supersedes: none',
  `- Superseded by: ${THEORY_ID}`,
  '- Next implication: replaced by typed handoff contract work.',
].join('\n');

async function makeTempLedger(content) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_DIR_PREFIX));
  const ledgerPath = path.join(directory, LEDGER_FILE_NAME);
  await fs.writeFile(ledgerPath, content, 'utf8');
  return ledgerPath;
}

function ledgerWithEntries(...entries) {
  return `${TEST_LEDGER_HEADER}${entries.join('\n\n')}\n`;
}

test('valid ledger entries parse and validate', (t) => {
  const content = ledgerWithEntries(SUPERSEDED_ENTRY, VALID_ENTRY);
  const validation = validateTheoryLedgerContent(content, { packagesDir: 'non-existent' });

  t.same(validation.errors, []);
  t.equal(validation.entries.length, 2);
  t.equal(validation.entries[1].id, THEORY_ID);
  t.equal(
    validation.entries[1].fields['Owner/boundary'],
    OWNER_BOUNDARY,
  );
  t.end();
});

test('empty ledger validates before initial seed', (t) => {
  const validation = validateTheoryLedgerContent(TEST_LEDGER_HEADER, { packagesDir: 'non-existent' });

  t.same(validation.errors, []);
  t.equal(validation.entries.length, 0);
  t.end();
});

test('invalid status is rejected', (t) => {
  const content = ledgerWithEntries(
    VALID_ENTRY.replace('- Status: active', '- Status: maybe'),
  );
  const validation = validateTheoryLedgerContent(content, { packagesDir: 'non-existent' });

  t.match(validation.errors.join('\n'), /invalid status maybe/u);
  t.end();
});

test('missing evidence links are rejected', (t) => {
  const content = ledgerWithEntries(
    VALID_ENTRY
      .replace(
        '- Artifact/result: `test-output/report.json` - handoff not detected yet.',
        '- Artifact/result: handoff not detected yet.',
      )
      .replace(
        '- Linked packages: `work/packages/todo-20260522-node-failure-rebalance-startup-active-gate-snapshot-watch-handoff-contract.md`',
        '- Linked packages: none',
      ),
  );
  const validation = validateTheoryLedgerContent(content, { packagesDir: 'non-existent' });

  t.match(validation.errors.join('\n'), /Artifact\/result must include/u);
  t.match(validation.errors.join('\n'), /Linked packages must include/u);
  t.end();
});

test('duplicate ids are rejected', (t) => {
  const validation = validateTheoryLedgerContent(
    ledgerWithEntries(VALID_ENTRY, VALID_ENTRY),
    { packagesDir: 'non-existent' },
  );

  t.match(validation.errors.join('\n'), /duplicate theory id/u);
  t.end();
});

test('broken supersession references are rejected', (t) => {
  const brokenEntry = VALID_ENTRY.replace(
    '- Supersedes: none',
    '- Supersedes: theory-20260522-missing',
  );
  const validation = validateTheoryLedgerContent(ledgerWithEntries(brokenEntry), { packagesDir: 'non-existent' });

  t.match(validation.errors.join('\n'), /references missing/u);
  t.end();
});

test('list output can filter by status and owner', (t) => {
  const entries = extractTheoryLedgerEntries(
    ledgerWithEntries(SUPERSEDED_ENTRY, VALID_ENTRY),
  );
  const activeEntries = filterTheoryLedgerEntries(entries, {
    status: STATUS_ACTIVE,
    owner: 'startup_active_gate_owner',
  });
  const output = renderTheoryLedgerList(activeEntries);

  t.equal(activeEntries.length, 1);
  t.match(output, new RegExp(THEORY_ID, 'u'));
  t.notMatch(output, new RegExp(SUPERSEDED_THEORY_ID, 'u'));
  t.end();
});

test('related theory lookup finds prior owner and boundary theories', (t) => {
  const entries = extractTheoryLedgerEntries(
    ledgerWithEntries(SUPERSEDED_ENTRY, VALID_ENTRY),
  );
  const related = findRelatedTheoryLedgerEntries(entries, {
    scenario: 'node-failure-rebalance',
    owner: 'startup_active_gate_owner',
    boundary: 'snapshot_coverage',
  });

  t.same(related.map((entry) => entry.id), [
    SUPERSEDED_THEORY_ID,
    THEORY_ID,
  ]);
  t.match(summarizeTheoryLedgerEntry(related[0]), /superseded/u);
  t.same(findMissingTheoryLedgerRefs(entries, [
    THEORY_ID,
    'theory-20260522-missing',
  ]), ['theory-20260522-missing']);
  t.end();
});

test('new command appends a valid entry', async (t) => {
  const ledgerPath = await makeTempLedger(TEST_LEDGER_HEADER);
  const output = await runCli([
    'new',
    '--ledger',
    ledgerPath,
    '--packages-dir',
    'non-existent',
    '--id',
    'theory-20260522-ledger-tooling',
    '--status',
    STATUS_SUPPORTED,
    '--scenario-gate',
    'none / workflow_tooling',
    '--owner-boundary',
    'workflow_tooling_owner / experiment_theory_memory',
    '--hypothesis',
    'minimal tooling keeps ledger entries consistent.',
    '--probe',
    'npm run work:theory-ledger -- validate',
    '--artifact-result',
    '`work/packages/todo-20260522-experiment-theory-ledger-tooling.md` - tooling package owns validation.',
    '--representative-movement',
    'none',
    '--linked-package',
    'work/packages/todo-20260522-experiment-theory-ledger-tooling.md',
    '--next-implication',
    'tracker integration can cite validated theory ids.',
  ]);
  const content = await fs.readFile(ledgerPath, 'utf8');
  const validation = validateTheoryLedgerContent(content, { packagesDir: 'non-existent' });

  t.match(output, /Added theory-20260522-ledger-tooling/u);
  t.same(validation.errors, []);
  t.equal(validation.entries.length, 1);
});

test('validate command reports clean ledger', async (t) => {
  const ledgerPath = await makeTempLedger(ledgerWithEntries(VALID_ENTRY));
  const output = await runCli(['validate', '--ledger', ledgerPath, '--packages-dir', 'non-existent']);

  t.equal(output, 'Theory ledger validation OK for 1 entry.');
});

test('stale active theory is detected and warns/fails', async (t) => {
  // Create a temporary packages directory with a newer closed package
  const packagesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'packages-test-'));
  const pkgContent = [
    '<!-- work-package',
    JSON.stringify({
      owner: 'startup_active_gate_owner',
      boundary: 'snapshot_coverage',
      theoryLedgerRefs: [THEORY_ID]
    }),
    '-->'
  ].join('\n');
  const pkgFilename = `done-20260523-some-successor.md`;
  await fs.writeFile(path.join(packagesDir, pkgFilename), pkgContent, 'utf8');

  // Ledger does not link the package yet
  const content = ledgerWithEntries(VALID_ENTRY);
  const validation = validateTheoryLedgerContent(content, { packagesDir });

  t.equal(validation.errors.length, 1);
  t.match(validation.errors[0], /active theory is stale because newer closed package/u);

  // Link the package in the ledger
  const linkedEntry = VALID_ENTRY.replace(
    '- Linked packages: `work/packages/todo-20260522-node-failure-rebalance-startup-active-gate-snapshot-watch-handoff-contract.md`',
    `- Linked packages: \`work/packages/todo-20260522-node-failure-rebalance-startup-active-gate-snapshot-watch-handoff-contract.md\`, \`work/packages/${pkgFilename}\``
  );
  const validationClean = validateTheoryLedgerContent(ledgerWithEntries(linkedEntry), { packagesDir });
  t.same(validationClean.errors, []);

  // Cleanup temp directory
  await fs.rm(packagesDir, { recursive: true, force: true });
});
