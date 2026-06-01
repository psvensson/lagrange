import {test} from '../../src/test-helpers/tap.js';
import {
  appendSprintQueueItem,
  appendTheoryLoopResult,
  buildPackageNewArgs,
  renderTheoryLoopPackageSection,
  renderTheoryLoopResultLine,
  renderTheoryLoopSprintSection,
  runCli,
  updateTheoryLedgerEntryStatus,
  upsertSection,
} from '../../scripts/work-theory-loop.js';

const PACKAGE_PATH = 'work/packages/todo-20260526-priority-recovery-theory-loop.md';
const THEORY_ID = 'theory-20260526-priority-recovery-wait';
const DISCRIMINATOR = 'npm run work:scenario-route -- artifact.json';
const THEORY_OPTIONS = Object.freeze([
  'H1 priority waiter misses admission; mechanism: admission_gap; intervention: add owner admission proof; modification: src/rebalancer/priority-recovery.js; discriminator: npm run work:scenario-route -- artifact.json; promotion: artifact shows wait without admission; rejection: admission is already visible; layer: ownership',
  'H2 priority recovery wake is stale; mechanism: scheduling_gap; intervention: rearm recovery wake; modification: src/rebalancer/priority-recovery.js; discriminator: node --test test/rebalancer/priority-recovery.test.js; promotion: admission exists without wake; rejection: wake fires before wait repeats; layer: scheduling',
  'H3 workflow owner is wrong; mechanism: ownership_gap; intervention: migrate owner boundary; modification: src/rebalancer/owner-boundary.js; discriminator: npm run analyze:owner-explain -- artifact.json workflow_progress; promotion: route names another owner; rejection: workflow owner has authority; layer: protocol',
]);
const CONTEXT = Object.freeze({
  owner: 'operation_workflow_owner',
  mechanism: 'admission_gap',
  stableFacts: ['priority waiter remains pending'],
  changedFacts: ['retry cadence moved but progress did not'],
  rejectedAlternatives: ['observation_gap is rejected because wait evidence is visible'],
  currentAction: 'workflow retries while recovery remains pending',
  missingEdge: 'priority recovery must be admitted into workflow progress',
  discriminator: DISCRIMINATOR,
  expectedMovement: 'pending priority wait clears or owner boundary migrates',
  negativeResult: 'stop for owner-boundary migration',
  escalation: 'do not open another local patch on unchanged priority wait evidence',
});

test('start section records central problem and ceremony budget', (t) => {
  const section = renderTheoryLoopSprintSection({
    problem: 'rolling restart stalls on priority recovery',
    artifact: 'test-output/reports/rolling-restart.report.json',
    success: 'representative rerun migrates or passes',
    ...CONTEXT,
    theories: THEORY_OPTIONS,
  });

  t.match(section, /## Theory Loop Sprint/u);
  t.match(section, /Evidence anchor: central problem = rolling restart stalls/u);
  t.match(section, /Mechanism card: mechanism = admission_gap/u);
  t.match(section, /Stable facts:\n- priority waiter remains pending/u);
  t.match(section, /Theory option set: options are hypotheses/u);
  t.match(section, /src\/ source-code modification/u);
  t.match(section, /2\. H2 priority recovery wake is stale/u);
  t.match(section, /Creative move menu:/u);
  t.match(section, /Real package rule: a theory-loop work package exists only/u);
  t.match(section, /Promotion rule: create or activate one executable package/u);
  t.match(section, /work:theory-loop -- next\|record\|fix/u);
  t.throws(
    () => renderTheoryLoopSprintSection({
      problem: 'missing success',
      artifact: 'artifact.json',
      ...CONTEXT,
      theories: THEORY_OPTIONS.slice(0, 2),
    }),
    /requires problem and success/u,
  );
  t.end();
});

test('package section requires a concrete option set and discriminator', (t) => {
  const section = renderTheoryLoopPackageSection({
    problem: 'operation workflow priority wait',
    artifact: 'artifact.json',
    success: 'fresh route migrates or passes',
    ...CONTEXT,
    inspect: ['src/rebalancer/priority-recovery.js'],
    writeScope: ['src/rebalancer/priority-recovery.js'],
    theories: THEORY_OPTIONS,
  });

  t.match(section, /smallest falsifier = `npm run work:scenario-route -- artifact.json`/u);
  t.match(section, /Promoted modification scope:\n- src\/rebalancer\/priority-recovery\.js/u);
  t.match(section, /Theory option set: first option is the promoted path/u);
  t.match(section, /1\. H1 priority waiter misses admission/u);
  t.match(section, /3\. H3 workflow owner is wrong/u);
  t.match(section, /must test the promoted theory by changing src\/ source code/u);
  t.match(section, /Promotion rule: this package may change code only for the promoted option/u);
  t.throws(
    () => renderTheoryLoopPackageSection({
      problem: 'too few',
      artifact: 'artifact.json',
      success: 'fresh route moves',
      ...CONTEXT,
      writeScope: ['src/rebalancer/priority-recovery.js'],
      theories: ['one'],
    }),
    /require 2-4 --theory values/u,
  );
  t.throws(
    () => renderTheoryLoopPackageSection({
      problem: 'bare options',
      artifact: 'artifact.json',
      success: 'fresh route moves',
      ...CONTEXT,
      writeScope: ['src/rebalancer/priority-recovery.js'],
      theories: ['one', 'two'],
    }),
    /must include mechanism, intervention, modification, discriminator, promotion, rejection, layer fields/u,
  );
  t.throws(
    () => renderTheoryLoopPackageSection({
      problem: 'no code modification',
      artifact: 'artifact.json',
      success: 'fresh route moves',
      ...CONTEXT,
      writeScope: ['work/packages/todo-only.md'],
      theories: THEORY_OPTIONS.slice(0, 2),
    }),
    /require at least one --write-scope src\/ source code file/u,
  );
  t.end();
});

test('sprint queue links point at packages from the sprint directory', (t) => {
  const sprint = [
    '# Sprint',
    '',
    '## Package Queue',
    '',
    '1. [Existing](../packages/todo-existing.md)',
    '',
    '## Current Edge Card',
    '',
    '- Owner: operation_workflow_owner',
  ].join('\n');
  const updated = appendSprintQueueItem(sprint, {
    packagePath: PACKAGE_PATH,
    title: 'Priority Recovery Theory Loop',
    purpose: 'Test a concrete option set.',
    firstRunReason: 'Fresh evidence selected a priority wait.',
  });

  t.match(updated, /\.\.\/packages\/todo-20260526-priority-recovery-theory-loop\.md/u);
  t.notMatch(updated, /\.\.\/work\/packages/u);
  t.equal(appendSprintQueueItem(updated, {packagePath: PACKAGE_PATH}), updated);
  t.end();
});

test('package scaffolder args select causal-escalation proof and scopes', (t) => {
  const args = buildPackageNewArgs({
    title: 'Priority Recovery Theory Loop',
    slug: 'priority-recovery-theory-loop',
    owner: 'operation_workflow_owner',
    boundary: 'workflow_progress',
    dominantReason: 'priority_recovery_event_driven_wait',
    problem: 'rolling restart priority wait',
    artifact: 'artifact.json',
    discriminator: DISCRIMINATOR,
    validation: 'node --test test/rebalancer/priority-recovery.test.js',
    inspect: ['src/rebalancer/priority-recovery.js'],
    writeScope: ['src/rebalancer/priority-recovery.js'],
  });
  const joined = args.join('\n');

  t.equal(args[args.indexOf('--lane') + 1], 'causal-escalation');
  t.equal(args[args.indexOf('--status') + 1], 'todo');
  t.match(joined, /falsifier: npm run work:scenario-route -- artifact\.json/u);
  t.match(joined, /regression: node --test test\/rebalancer\/priority-recovery\.test\.js/u);
  t.match(joined, /supporting: npm run work:frontier-history -- --owner operation_workflow_owner --boundary workflow_progress --limit 12/u);
  t.match(joined, /--candidate-runtime-file\nsrc\/rebalancer\/priority-recovery\.js/u);
  t.match(joined, /--theory-loop/u);
  t.match(joined, /--write-scope\nsrc\/rebalancer\/priority-recovery\.js/u);
  t.throws(
    () => buildPackageNewArgs({
      title: 'Priority Recovery Theory Loop',
      slug: 'priority-recovery-theory-loop',
      owner: 'operation_workflow_owner',
      boundary: 'workflow_progress',
      dominantReason: 'priority_recovery_event_driven_wait',
      problem: 'rolling restart priority wait',
      artifact: 'none',
      discriminator: DISCRIMINATOR,
    }),
    /requires a concrete representative artifact/u,
  );
  t.throws(
    () => buildPackageNewArgs({
      title: 'Priority Recovery Theory Loop',
      slug: 'priority-recovery-theory-loop',
      owner: 'operation_workflow_owner',
      boundary: 'workflow_progress',
      dominantReason: 'priority_recovery_event_driven_wait',
      problem: 'rolling restart priority wait',
      artifact: 'artifact.json',
      discriminator: DISCRIMINATOR,
      writeScope: ['work/packages/todo-only.md'],
    }),
    /require at least one --write-scope src\/ source code file/u,
  );
  t.end();
});

test('result records append compact theory-loop evidence', (t) => {
  const content = ['# Package', '', '## Validation', '', '1. npm test'].join('\n');
  const updated = appendTheoryLoopResult(content, {
    theory: THEORY_ID,
    result: 'fixed',
    evidence: 'focused proof now passes',
    files: 'src/rebalancer/priority-recovery.js',
    validation: 'node --test test/rebalancer/priority-recovery.test.js',
    nextAction: 'rerun representative scenario',
  });

  t.match(updated, /## Theory Loop Results/u);
  t.match(updated, /result: fixed; evidence: focused proof now passes/u);
  t.match(updated, /next: rerun representative scenario\./u);
  t.throws(
    () => renderTheoryLoopResultLine({
      theory: THEORY_ID,
      result: 'unknown',
      evidence: 'invalid status',
    }),
    /--result must be one of/u,
  );
  t.end();
});

test('ledger status update only mutates matching theory ids', (t) => {
  const content = [
    '# Experiment And Theory Ledger',
    '',
    `## ${THEORY_ID}`,
    '',
    '- Status: active',
    '- Hypothesis: priority wait is caused by missing event.',
    '',
    '## theory-20260526-other-route',
    '',
    '- Status: active',
  ].join('\n');
  const updated = updateTheoryLedgerEntryStatus(content, THEORY_ID, 'avoided');
  const unchanged = updateTheoryLedgerEntryStatus(updated, 'not-a-theory-id', 'supported');

  t.match(updated, /## theory-20260526-priority-recovery-wait[\s\S]*- Status: avoided/u);
  t.match(updated, /## theory-20260526-other-route[\s\S]*- Status: active/u);
  t.equal(unchanged, updated);
  t.end();
});

test('upsert replaces existing sections and preserves later content', (t) => {
  const content = [
    '# Package',
    '',
    '## Theory Loop',
    '',
    '- old',
    '',
    '## Validation',
    '',
    '1. npm test',
  ].join('\n');
  const updated = upsertSection(content, 'Theory Loop', '## Theory Loop\n\n- new');

  t.match(updated, /## Theory Loop\n\n- new\n\n## Validation/u);
  t.notMatch(updated, /- old/u);
  t.end();
});

test('dry-run cli prints package creation command without writing files', async (t) => {
  const output = await runCli([
    'next',
    '--title',
    'Priority Recovery Theory Loop',
    '--slug',
    'priority-recovery-theory-loop',
    '--problem',
    'rolling restart priority wait',
    '--artifact',
    'artifact.json',
    '--success',
    'fresh route migrates or passes',
    '--owner',
    'operation_workflow_owner',
    '--boundary',
    'workflow_progress',
    '--dominant-reason',
    'priority_recovery_event_driven_wait',
    '--mechanism',
    'admission_gap',
    '--stable-fact',
    'priority waiter remains pending',
    '--changed-fact',
    'retry cadence moved but progress did not',
    '--rejected-alternative',
    'observation_gap is rejected because wait evidence is visible',
    '--current-action',
    'workflow retries while recovery remains pending',
    '--missing-edge',
    'priority recovery must be admitted into workflow progress',
    '--theory',
    THEORY_OPTIONS[0],
    '--theory',
    THEORY_OPTIONS[1],
    '--discriminator',
    DISCRIMINATOR,
    '--expected-movement',
    'pending priority wait clears or owner boundary migrates',
    '--negative-result',
    'stop for owner-boundary migration',
    '--escalation',
    'do not open another local patch on unchanged priority wait evidence',
    '--write-scope',
    'src/rebalancer/priority-recovery.js',
  ]);

  t.match(output, /Would create work\/packages\/todo-\d{8}-priority-recovery-theory-loop\.md/u);
  t.match(output, /node scripts\/work-package-new\.js --theory-loop --status todo/u);
  t.match(output, /"Priority Recovery Theory Loop"/u);
  t.match(output, /## Theory Loop/u);
  t.match(output, /Theory option set: first option is the promoted path/u);
});

test('record dry-run maps theory evidence into one ledger-ready line', async (t) => {
  const output = await runCli([
    'record',
    '--package',
    PACKAGE_PATH,
    '--theory',
    THEORY_ID,
    '--result',
    'avoided',
    '--evidence',
    'fresh artifact selected a different owner boundary',
  ]);

  t.match(output, new RegExp(`theory: ${THEORY_ID}; result: avoided`, 'u'));
  t.match(output, /evidence: fresh artifact selected a different owner boundary/u);
});

test('help works with command and flag spelling', async (t) => {
  t.match(await runCli(['help']), /Usage:/u);
  t.match(await runCli(['--help']), /Results: fixed, avoided/u);
});
