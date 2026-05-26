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

test('start section records central problem and ceremony budget', (t) => {
  const section = renderTheoryLoopSprintSection({
    problem: 'rolling restart stalls on priority recovery',
    artifact: 'test-output/reports/rolling-restart.report.json',
    success: 'representative rerun migrates or passes',
  });

  t.match(section, /## Theory Loop Sprint/u);
  t.match(section, /Central problem: rolling restart stalls/u);
  t.match(section, /work:theory-loop -- next\|record\|fix/u);
  t.throws(
    () => renderTheoryLoopSprintSection({problem: 'missing success'}),
    /requires problem and success/u,
  );
  t.end();
});

test('package section requires a small theory batch and discriminator', (t) => {
  const section = renderTheoryLoopPackageSection({
    problem: 'operation workflow priority wait',
    artifact: 'artifact.json',
    discriminator: 'npm run work:scenario-route -- artifact.json',
    inspect: ['src/rebalancer/priority-recovery.js'],
    theories: [
      'waiter never observes priority recovery',
      'event publication is missing',
      'diagnostics classify the wrong edge',
    ],
  });

  t.match(section, /Cheap discriminator: `npm run work:scenario-route -- artifact.json`/u);
  t.match(section, /1\. waiter never observes priority recovery/u);
  t.match(section, /3\. diagnostics classify the wrong edge/u);
  t.throws(
    () => renderTheoryLoopPackageSection({
      problem: 'too many',
      discriminator: 'npm test',
      theories: ['one', 'two', 'three', 'four'],
    }),
    /require 1-3 --theory values/u,
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
    purpose: 'Test a compact theory batch.',
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
    discriminator: 'npm run work:scenario-route -- artifact.json',
    validation: 'node --test test/rebalancer/priority-recovery.test.js',
    inspect: ['src/rebalancer/priority-recovery.js'],
    writeScope: ['test/rebalancer/priority-recovery.test.js'],
  });
  const joined = args.join('\n');

  t.equal(args[args.indexOf('--lane') + 1], 'causal-escalation');
  t.equal(args[args.indexOf('--status') + 1], 'todo');
  t.match(joined, /falsifier: npm run work:scenario-route -- artifact\.json/u);
  t.match(joined, /regression: node --test test\/rebalancer\/priority-recovery\.test\.js/u);
  t.match(joined, /--candidate-runtime-file\nsrc\/rebalancer\/priority-recovery\.js/u);
  t.match(joined, /--write-scope\ntest\/rebalancer\/priority-recovery\.test\.js/u);
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
    '--owner',
    'operation_workflow_owner',
    '--boundary',
    'workflow_progress',
    '--dominant-reason',
    'priority_recovery_event_driven_wait',
    '--theory',
    'event waiter missed the signal',
    '--theory',
    'diagnostics classified an old edge',
    '--discriminator',
    'npm run work:scenario-route -- artifact.json',
  ]);

  t.match(output, /Would create work\/packages\/todo-\d{8}-priority-recovery-theory-loop\.md/u);
  t.match(output, /node scripts\/work-package-new\.js --status todo/u);
  t.match(output, /"Priority Recovery Theory Loop"/u);
  t.match(output, /## Theory Loop/u);
});

test('record dry-run maps theory evidence into one ledger-ready line', async (t) => {
  const output = await runCli([
    'record',
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
