import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  questHarnessPath,
  renderQuestHarness,
  scaffoldQuestHarness,
} from '../../scripts/solve/harness-scaffold.js';
import {lintQuest} from '../../scripts/solve/quest-lint.js';

// Harness scaffold (solver-streamlining P6b): a test-receipt quest without
// scripts/quest-evidence-<id>.js gets a skeleton with one fail-closed
// placeholder per required receipt id, intent-added so the sealed diff sees
// it; an existing harness is never overwritten; lint warns while the harness
// is missing; and the rendered skeleton runs through the REAL runtime and
// fails every placeholder receipt, so nothing can go green by scaffolding.

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const RUNTIME_RELATIVE = 'scripts/quest-evidence-harness-runtime.js';
const QUEST_ID = 'scaffold-demo';
const RECEIPT_IDS = ['R1-first-claim', 'R2-second-claim'];
const TEXT_ENCODING = 'utf8';

function tmpRepo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-scaffold-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  execFileSync('git', ['init', '-q'], {cwd: root});
  return root;
}

function quest(overrides = {}) {
  return {
    id: QUEST_ID,
    authoringContractVersion: 1,
    statement: 'The scaffold demo reaches its receipts.',
    class: 'process',
    priority: 1,
    doneWhen: {probe: 'test-receipt', args: {
      file: `solve/evidence/${QUEST_ID}.receipt.json`,
      requiredReceipts: RECEIPT_IDS,
    }},
    frontiers: [],
    constraints: [],
    ...overrides,
  };
}

test('scaffold-writes-one-placeholder-per-required-receipt-and-stages-intent',
  (t) => {
    const root = tmpRepo(t);
    const result = scaffoldQuestHarness(root, quest());
    assert.deepEqual(result, {path: questHarnessPath(QUEST_ID), created: true});
    const source = fs.readFileSync(path.join(root, result.path), TEXT_ENCODING);
    for (const id of RECEIPT_IDS) assert.ok(source.includes(`id: "${id}"`));
    assert.equal((source.match(/testFile: null/gu) || []).length, 2,
      'every placeholder is fail-closed');
    const status = execFileSync('git', ['status', '--porcelain', '--',
      result.path], {cwd: root, encoding: TEXT_ENCODING});
    assert.match(status, /^ ?A /u, 'the skeleton is intent-added');
  });

test('scaffold-never-overwrites-and-skips-non-receipt-quests', (t) => {
  const root = tmpRepo(t);
  const relative = questHarnessPath(QUEST_ID);
  fs.mkdirSync(path.join(root, 'scripts'), {recursive: true});
  fs.writeFileSync(path.join(root, relative), '// hand-written\n');
  assert.deepEqual(scaffoldQuestHarness(root, quest()),
    {path: relative, created: false});
  assert.equal(fs.readFileSync(path.join(root, relative), TEXT_ENCODING),
    '// hand-written\n', 'existing bytes are untouched');
  assert.equal(scaffoldQuestHarness(root, quest({
    id: 'oracle-quest',
    doneWhen: {probe: 'oracle', args: {file: 'oracle.json'}},
  })).created, false, 'an oracle quest gets no harness');
});

test('lint-warns-while-the-harness-is-missing', (t) => {
  const root = tmpRepo(t);
  const missing = lintQuest(quest(), {root});
  assert.ok(missing.warnings.some((warning) =>
    warning.includes(questHarnessPath(QUEST_ID))),
  'the warning names the expected path');
  assert.equal(missing.errors.some((error) => error.includes('harness')),
    false, 'a warning, never an error');
  scaffoldQuestHarness(root, quest());
  assert.equal(lintQuest(quest(), {root}).warnings.some((warning) =>
    warning.includes('evidence harness')), false);
  assert.equal(lintQuest(quest()).warnings.some((warning) =>
    warning.includes('evidence harness')), false,
  'without a root the check is skipped');
});

test('rendered-skeleton-runs-through-the-real-runtime-and-fails-closed', (t) => {
  const root = tmpRepo(t);
  fs.mkdirSync(path.join(root, 'scripts'), {recursive: true});
  fs.symlinkSync(path.join(REPO_ROOT, RUNTIME_RELATIVE),
    path.join(root, RUNTIME_RELATIVE));
  const relative = questHarnessPath(QUEST_ID);
  fs.writeFileSync(path.join(root, relative), renderQuestHarness(quest()));
  const run = spawnSync(process.execPath, [relative, '--output',
    'scratch.receipt.json'], {cwd: root, encoding: TEXT_ENCODING});
  assert.notEqual(run.status, 0, 'placeholders cannot pass');
  const receipt = JSON.parse(fs.readFileSync(
    path.join(root, 'scratch.receipt.json'), TEXT_ENCODING));
  assert.equal(receipt.quest, QUEST_ID);
  assert.equal(receipt.status, 'fail');
  assert.deepEqual(receipt.receipts.map((entry) => entry.id), RECEIPT_IDS);
  assert.ok(receipt.receipts.every((entry) => entry.passed === false));
});
