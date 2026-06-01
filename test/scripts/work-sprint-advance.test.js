import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';
import {
  applySprintAdvancePlan,
  assertTheoryLoopQueueWillRemainValidAfterPackageClose,
  buildSprintAdvancePlan,
  buildTheoryLoopContinuationGuard,
  renderSprintAdvancePlan,
  runCli,
  updateReferenceContent,
} from '../../scripts/work-sprint-advance.js';

const TEMP_PREFIX = 'work-sprint-advance-';
const ENCODING_UTF8 = 'utf8';
const WORK_DIRECTORY = 'work';
const PACKAGES_DIRECTORY = path.join(WORK_DIRECTORY, 'packages');
const SPRINTS_DIRECTORY = path.join(WORK_DIRECTORY, 'sprints');
const TRACKS_DIRECTORY = path.join(WORK_DIRECTORY, 'tracks');
const RELEASES_DIRECTORY = path.join(WORK_DIRECTORY, 'releases');
const ACTIVE_SPRINT = path.join(SPRINTS_DIRECTORY, 'active-alpha.md');
const DONE_SPRINT = path.join(SPRINTS_DIRECTORY, 'done-alpha.md');
const DONE_PACKAGE = path.join(PACKAGES_DIRECTORY, 'done-alpha-package.md');
const ACTIVE_PACKAGE = path.join(PACKAGES_DIRECTORY, 'active-alpha-package.md');
const TODO_PACKAGE = path.join(PACKAGES_DIRECTORY, 'todo-alpha-package.md');
const TRACK_FILE = path.join(TRACKS_DIRECTORY, 'alpha.md');
const RELEASE_FILE = path.join(RELEASES_DIRECTORY, '0.1-dependency-map.md');

function packageFile(status) {
  return [
    '# Package',
    '',
    '<!-- work-package',
    JSON.stringify({
      schema: 'work-package-v2',
      status,
      intent: {
        lane: 'lightweight-maintenance',
        owner: 'workflow_tooling_owner',
        boundary: 'workflow_acceleration',
        dominantReason: 'test',
        nextAction: 'test',
      },
      scope: {
        writeScope: [],
        handoffFiles: [],
        generatedFiles: [],
        candidateRuntimeFiles: [],
        commitScope: [],
      },
      gates: {
        stabilityCredit: 'local-proof-only',
        whyHighestLeverageNow: 'test',
      },
      execution: {
        theoryLedgerRefs: [],
      },
    }, null, 2),
    '-->',
    '',
  ].join('\n');
}

async function makeTempRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX));
  t.teardown(async () => {
    await fs.rm(root, {recursive: true, force: true});
  });
  await fs.mkdir(path.join(root, PACKAGES_DIRECTORY), {recursive: true});
  await fs.mkdir(path.join(root, SPRINTS_DIRECTORY), {recursive: true});
  await fs.mkdir(path.join(root, TRACKS_DIRECTORY), {recursive: true});
  await fs.mkdir(path.join(root, RELEASES_DIRECTORY), {recursive: true});
  return root;
}

async function writeFixture(root, relativePath, content) {
  await fs.writeFile(path.join(root, relativePath), content, ENCODING_UTF8);
}

async function readFixture(root, relativePath) {
  return fs.readFile(path.join(root, relativePath), ENCODING_UTF8);
}

async function writeCompleteSprintFixture(t) {
  const root = await makeTempRoot(t);
  await writeFixture(root, ACTIVE_SPRINT, [
    '# Alpha Sprint',
    '',
    'Status: active. Opened for tests.',
    '',
    '## Package Queue',
    '',
    `1. [Done](../packages/${path.basename(DONE_PACKAGE)})`,
    '',
  ].join('\n'));
  await writeFixture(root, DONE_PACKAGE, packageFile('done'));
  await writeFixture(root, TRACK_FILE, [
    '# Track',
    '',
    '## Sprint Membership',
    '',
    '| Sprint | Sprint kind | Status | Track relation | Notes |',
    '| --- | --- | --- | --- | --- |',
    `| \`${ACTIVE_SPRINT}\` | \`maintenance\` | active | primary | Current. |`,
    '',
  ].join('\n'));
  await writeFixture(root, RELEASE_FILE, [
    '# Dependency Map',
    '',
    '## Current Execution Attachment',
    '',
    '| Execution item | Attached track | Depends on | Unblocks | Status |',
    '| --- | --- | --- | --- | --- |',
    `| \`${ACTIVE_SPRINT}\` | alpha | proof | next | active |`,
    '',
  ].join('\n'));
  return root;
}

test('reference updater rewrites sprint paths and matching status cells', (t) => {
  const content = [
    `| \`${ACTIVE_SPRINT}\` | maintenance | active | primary |`,
    '| unrelated | active | untouched |',
  ].join('\n');

  const updated = updateReferenceContent(content, ACTIVE_SPRINT, DONE_SPRINT);

  t.match(updated, DONE_SPRINT);
  t.match(updated, '| done |');
  t.match(updated, '| unrelated | active | untouched |');
  t.end();
});

test('sprint advance applies rename plus track and release reference updates', async (t) => {
  const root = await writeCompleteSprintFixture(t);
  const plan = await buildSprintAdvancePlan({root});

  t.equal(plan.packagesLeft, 0);
  t.same(plan.referenceUpdates.map((update) => update.path).sort(), [
    RELEASE_FILE,
    TRACK_FILE,
  ]);

  await applySprintAdvancePlan(plan);

  await t.rejects(readFixture(root, ACTIVE_SPRINT));
  t.match(await readFixture(root, DONE_SPRINT), 'Status: done.');
  t.match(await readFixture(root, TRACK_FILE), DONE_SPRINT);
  t.match(await readFixture(root, TRACK_FILE), '| done |');
  t.match(await readFixture(root, RELEASE_FILE), DONE_SPRINT);
  t.match(await readFixture(root, RELEASE_FILE), '| done |');
});

test('sprint advance dry run leaves files unchanged', async (t) => {
  const root = await writeCompleteSprintFixture(t);

  const output = await runCli(['--dry-run'], {root});

  t.match(output, 'Mode: `dry-run`');
  t.match(output, DONE_SPRINT);
  t.match(await readFixture(root, ACTIVE_SPRINT), 'Status: active.');
  await t.rejects(readFixture(root, DONE_SPRINT));
});

test('sprint advance refuses a sprint with active packages', async (t) => {
  const root = await makeTempRoot(t);
  await writeFixture(root, ACTIVE_SPRINT, [
    '# Alpha Sprint',
    '',
    'Status: active.',
    '',
    `1. [Active](../packages/${path.basename(ACTIVE_PACKAGE)})`,
    '',
  ].join('\n'));
  await writeFixture(root, ACTIVE_PACKAGE, packageFile('active'));

  await t.rejects(
    buildSprintAdvancePlan({root}),
    /Sprint still has 1 active\/todo package/u,
  );
});

test('sprint advance refuses theory-loop closure on alternate success metric', async (t) => {
  const root = await makeTempRoot(t);
  await writeFixture(root, ACTIVE_SPRINT, [
    '# Alpha Sprint',
    '',
    'Status: active.',
    '',
    '## Evidence Anchor',
    '',
    '- Success condition: rolling-restart representative run passes with all nodes ACTIVE',
    '',
    '## Theory Option Set',
    '',
    '1. H1',
    '',
    '## Discriminator First',
    '',
    '- run the discriminator',
    '',
    '## Real Package Rule',
    '',
    '- source packages only',
    '',
    '## Theory Loop Success Evidence',
    '',
    '- Success condition met: yes',
    '- Matched success condition: rolling-restart representative run passes with all nodes ACTIVE',
    '- Fresh representative evidence: npm run work:scenario-route -- test-output/reports/rolling-restart.report.json',
    '- Result: architecture-gap',
    '- Continuation stopped because: the architecture path selected a stop.',
    '',
  ].join('\n'));

  await t.rejects(
    buildSprintAdvancePlan({root}),
    /closure result must be success-condition-met/u,
  );
});

test('sprint advance requires closure to match the original success condition', async (t) => {
  const root = await makeTempRoot(t);
  await writeFixture(root, ACTIVE_SPRINT, [
    '# Alpha Sprint',
    '',
    'Status: active.',
    '',
    '## Evidence Anchor',
    '',
    '- Success condition: rolling-restart representative run passes with all nodes ACTIVE',
    '',
    '## Theory Option Set',
    '',
    '1. H1',
    '',
    '## Discriminator First',
    '',
    '- run the discriminator',
    '',
    '## Real Package Rule',
    '',
    '- source packages only',
    '',
    '## Theory Loop Success Evidence',
    '',
    '- Success condition met: yes',
    '- Matched success condition: architecture-gap',
    '- Fresh representative evidence: npm run work:scenario-route -- test-output/reports/rolling-restart.report.json',
    '- Result: success-condition-met',
    '- Continuation stopped because: the representative success condition is met.',
    '',
  ].join('\n'));

  await t.rejects(
    buildSprintAdvancePlan({root}),
    /Matched success condition must exactly match/u,
  );
});

test('sprint advance rejects alternate stop labels in theory-loop success condition', async (t) => {
  const root = await makeTempRoot(t);
  await writeFixture(root, ACTIVE_SPRINT, [
    '# Alpha Sprint',
    '',
    'Status: active.',
    '',
    '## Evidence Anchor',
    '',
    '- Success condition: rolling-restart representative run passes or closes as architecture-gap',
    '',
    '## Theory Option Set',
    '',
    '1. H1',
    '',
    '## Discriminator First',
    '',
    '- run the discriminator',
    '',
    '## Real Package Rule',
    '',
    '- source packages only',
    '',
    '## Theory Loop Success Evidence',
    '',
    '- Success condition met: yes',
    '- Matched success condition: rolling-restart representative run passes or closes as architecture-gap',
    '- Fresh representative evidence: npm run work:scenario-route -- test-output/reports/rolling-restart.report.json',
    '- Result: success-condition-met',
    '- Continuation stopped because: the representative success condition is met.',
    '',
  ].join('\n'));

  await t.rejects(
    buildSprintAdvancePlan({root}),
    /must name the original representative or release success metric/u,
  );
});

test('sprint advance treats Theory Loop Shape sprints as theory-loop closures', async (t) => {
  const root = await makeTempRoot(t);
  await writeFixture(root, ACTIVE_SPRINT, [
    '# Alpha Sprint',
    '',
    'Status: active.',
    '',
    '## Evidence Anchor',
    '',
    '- Success condition: rolling-restart representative run passes with all nodes ACTIVE',
    '',
    '## Theory Loop Shape',
    '',
    '- System theory: continue until representative green.',
    '- Promotion rule: create one executable package after each discriminator.',
    '',
  ].join('\n'));

  await t.rejects(
    buildSprintAdvancePlan({root}),
    /cannot close without ## Theory Loop Success Evidence/u,
  );
});

test('sprint advance accepts theory-loop closure only on the original success condition', async (t) => {
  const root = await makeTempRoot(t);
  await writeFixture(root, ACTIVE_SPRINT, [
    '# Alpha Sprint',
    '',
    'Status: active.',
    '',
    '## Evidence Anchor',
    '',
    '- Success condition: rolling-restart representative run passes with all nodes ACTIVE',
    '',
    '## Theory Option Set',
    '',
    '1. H1',
    '',
    '## Discriminator First',
    '',
    '- run the discriminator',
    '',
    '## Real Package Rule',
    '',
    '- source packages only',
    '',
    '## Theory Loop Success Evidence',
    '',
    '- Success condition met: yes',
    '- Matched success condition: rolling-restart representative run passes with all nodes ACTIVE',
    '- Fresh representative evidence: npm run work:scenario-route -- test-output/reports/rolling-restart-green.report.json',
    '- Result: success-condition-met',
    '- Continuation stopped because: the representative success condition is met.',
    '',
  ].join('\n'));

  const plan = await buildSprintAdvancePlan({root});

  t.equal(plan.packagesLeft, 0);
  t.equal(plan.doneSprintPath, DONE_SPRINT);
});

test('theory-loop continuation guard rejects an exhausted active package queue', async (t) => {
  const root = await makeTempRoot(t);
  await writeFixture(root, ACTIVE_SPRINT, [
    '# Alpha Sprint',
    '',
    'Status: active.',
    '',
    '## Evidence Anchor',
    '',
    '- Success condition: rolling-restart representative run passes with all nodes ACTIVE',
    '',
    '## Theory Loop Shape',
    '',
    '- System theory: continue until representative green.',
    '',
  ].join('\n'));

  await t.rejects(
    buildTheoryLoopContinuationGuard({root}),
    /no active\/todo packages but no terminal success evidence/u,
  );
});

test('theory-loop continuation guard accepts a blocked termination handoff', async (t) => {
  const root = await makeTempRoot(t);
  await writeFixture(root, ACTIVE_SPRINT, [
    '# Alpha Sprint',
    '',
    'Status: active.',
    '',
    '## Evidence Anchor',
    '',
    '- Success condition: rolling-restart representative run passes with all nodes ACTIVE',
    '',
    '## Theory Loop Shape',
    '',
    '- System theory: continue until representative green.',
    '',
    '## Theory Loop Termination',
    '',
    '- Loop status: terminated',
    '- Termination reason: blocked-external-dependency',
    '- Evidence: upstream scenario harness artifact is unavailable in CI incident 42',
    '',
  ].join('\n'));

  const result = await buildTheoryLoopContinuationGuard({root});

  t.equal(result.theoryLoop, true);
  t.equal(result.packagesLeft, 0);
});

test('package close preflight rejects exhausting a running theory-loop queue', async (t) => {
  const root = await makeTempRoot(t);
  await writeFixture(root, ACTIVE_SPRINT, [
    '# Alpha Sprint',
    '',
    'Status: active.',
    '',
    '## Evidence Anchor',
    '',
    '- Success condition: rolling-restart representative run passes with all nodes ACTIVE',
    '',
    '## Theory Loop Shape',
    '',
    '- System theory: continue until representative green.',
    '',
    `1. [Active](../packages/${path.basename(ACTIVE_PACKAGE)})`,
    '',
  ].join('\n'));
  await writeFixture(root, ACTIVE_PACKAGE, packageFile('active'));

  await t.rejects(
    assertTheoryLoopQueueWillRemainValidAfterPackageClose({
      root,
      packagePath: ACTIVE_PACKAGE,
    }),
    /would exhaust the active theory-loop package queue/u,
  );
});

test('package close preflight accepts a remaining successor package', async (t) => {
  const root = await makeTempRoot(t);
  await writeFixture(root, ACTIVE_SPRINT, [
    '# Alpha Sprint',
    '',
    'Status: active.',
    '',
    '## Evidence Anchor',
    '',
    '- Success condition: rolling-restart representative run passes with all nodes ACTIVE',
    '',
    '## Theory Loop Shape',
    '',
    '- System theory: continue until representative green.',
    '',
    `1. [Active](../packages/${path.basename(ACTIVE_PACKAGE)})`,
    `2. [Todo](../packages/${path.basename(TODO_PACKAGE)})`,
    '',
  ].join('\n'));
  await writeFixture(root, ACTIVE_PACKAGE, packageFile('active'));
  await writeFixture(root, TODO_PACKAGE, packageFile('todo'));

  await assertTheoryLoopQueueWillRemainValidAfterPackageClose({
    root,
    packagePath: ACTIVE_PACKAGE,
  });

  t.pass('successor package keeps the theory-loop queue non-empty');
});

test('sprint advance renderer shows the files that will change', async (t) => {
  const root = await writeCompleteSprintFixture(t);
  const plan = await buildSprintAdvancePlan({root});
  const rendered = renderSprintAdvancePlan(plan);

  t.match(rendered, '# Sprint Advance');
  t.match(rendered, TRACK_FILE);
  t.match(rendered, RELEASE_FILE);
});
