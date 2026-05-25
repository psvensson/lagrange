import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';
import {
  applySprintAdvancePlan,
  buildSprintAdvancePlan,
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

test('sprint advance renderer shows the files that will change', async (t) => {
  const root = await writeCompleteSprintFixture(t);
  const plan = await buildSprintAdvancePlan({root});
  const rendered = renderSprintAdvancePlan(plan);

  t.match(rendered, '# Sprint Advance');
  t.match(rendered, TRACK_FILE);
  t.match(rendered, RELEASE_FILE);
});
