import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {
  bookkeepingOwnerQuestId,
  inspectChangeArtifact,
  isForeignQuestBookkeeping,
} from '../../scripts/solve/change-artifact.js';
import {EVENT_ATTEMPT} from '../../scripts/solve/constants.js';
import {runStep} from '../../scripts/solve/step.js';
import {readLog, saveQuest} from '../../scripts/solve/store.js';

// Witness for the solver-streamlining P5 item: the attempt capture excludes
// ANOTHER declared quest's bookkeeping (its quest file, log, evidence,
// oracle), not only its regenerated receipt, names the excluded paths on
// stdout, and a scope refusal names the offending paths. Ownership is
// resolved against the declared quest ids under solve/quests (longest
// match), so a quest id containing dots or one that prefixes another id
// resolves exactly. Shared planning documents (solve/epics) have no owner
// and keep their previous treatment.

const TMP_PREFIX = 'solver-capture-foreign-bookkeeping-';
const QUEST_ID = 'granularity';
const PREFIXED_QUEST_ID = 'granularity-v2';
const DOTTED_QUEST_ID = 'release-0.2-rows';
const PRODUCT_QUEST_ID = 'product-runtime';
const UNDECLARED_NAME = 'nobody';
const WORKFLOW_SOURCE = 'scripts/solve/fixture-owner.js';
const PRODUCT_SOURCE = 'src/a.js';
const SOURCE_BASE = 'export const owner = 1;\n';
const SOURCE_CANDIDATE = 'export const owner = 2;\n';
const ORACLE_OPEN = {metric: 2, target: 0};
const ORACLE_CLOSER = {metric: 1, target: 0};
const SHARED_EPIC = 'solve/epics/shared-plan.md';
const SHARED_SPEC = 'solve/specs/shared-spec.md';
const EPIC_BASE = '# plan\n';
const EPIC_EDITED = '# plan\n\nedited\n';
const QUEST_JSON_EDITED = '{"edited":true}\n';
const DEP_SCOPE_BASE = '# dep scope\n';
const DEP_SCOPE_EDITED = '# dep scope\n\nrepair round\n';
const WORKFLOW_SCOPE_REFUSAL =
  /workflow changes must be recorded in a workflow\/Quest tooling Quest: /u;
const FOREIGN_NOTICE =
  /auto-diff: excluded another quest's bookkeeping from the attempt: /u;
const TEXT_ENCODING = 'utf8';
const RECEIPT_SCHEMA = 'test-receipt/1';
const FIXTURE_RECEIPT_ID = 'fixture-receipt';
const RECEIPT_GENERATED_AT = '2026-09-05T06:00:00.000Z';

function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: TEXT_ENCODING,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function writeFile(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
}

function tmpDir(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), TMP_PREFIX));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  return root;
}

function questFile(questId) {
  return `solve/quests/${questId}.json`;
}

function depScopeFile(questId) {
  return `solve/evidence/${questId}.dep-scope.md`;
}


function receiptBytes(questId) {
  return `${JSON.stringify({
    schema: RECEIPT_SCHEMA,
    quest: questId,
    status: 'fail',
    generatedAt: RECEIPT_GENERATED_AT,
    receipts: [{
      id: FIXTURE_RECEIPT_ID,
      passed: false,
      command: 'true',
      detail: 'fixture receipt',
    }],
  }, null, 2)}\n`;
}

// A product quest must measure non-oracle evidence: its own test receipt.
function sealedQuest(root, quest) {
  const oracle = path.join(root, 'solve', 'oracle', `${quest.id}.json`);
  const metric = quest.class === 'product' ? {
    probe: 'test-receipt',
    args: {
      file: path.join(root, `solve/evidence/${quest.id}.receipt.json`),
      requiredReceipts: [FIXTURE_RECEIPT_ID],
    },
  } : {probe: 'oracle', args: {file: oracle}};
  return {
    ...quest,
    authoringContractVersion: 1,
    verificationContractVersion: 2,
    priority: 1,
    doneWhen: metric,
    frontiers: [{id: `${quest.id}-main`, priority: 1, metric}],
    constraints: [],
  };
}

function processQuest(id) {
  return {
    id,
    class: 'process',
    statement: `The auto-capture owner ${WORKFLOW_SOURCE} excludes foreign ` +
      'bookkeeping.',
  };
}

function productQuest() {
  return {
    id: PRODUCT_QUEST_ID,
    class: 'product',
    statement: 'The runtime fixture reaches zero.',
    links: {planDoc: SHARED_EPIC},
  };
}

// A temporary repository with FOUR declared quests (this one, a prefixed
// sibling, a dotted id, a product quest), each with a committed quest file
// and dep-scope note, plus a shared epic and spec — the shared-worktree
// shape in which another quest's bookkeeping goes dirty.
function fixture(t, quest) {
  const root = tmpDir(t);
  git(root, ['init']);
  git(root, ['config', 'user.email', 'solver@example.com']);
  git(root, ['config', 'user.name', 'Solver']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  writeFile(root, WORKFLOW_SOURCE, SOURCE_BASE);
  writeFile(root, PRODUCT_SOURCE, SOURCE_BASE);
  writeFile(root, SHARED_EPIC, EPIC_BASE);
  writeFile(root, SHARED_SPEC, EPIC_BASE);
  const declared = [
    processQuest(QUEST_ID),
    processQuest(PREFIXED_QUEST_ID),
    processQuest(DOTTED_QUEST_ID),
    productQuest(),
  ];
  for (const declaredQuest of declared) {
    saveQuest(root, sealedQuest(root, declaredQuest));
    writeFile(root, depScopeFile(declaredQuest.id), DEP_SCOPE_BASE);
  }
  writeFile(root, `solve/evidence/${PRODUCT_QUEST_ID}.receipt.json`,
    receiptBytes(PRODUCT_QUEST_ID));
  // A note named after no declared quest: ownership unknown, never foreign.
  writeFile(root, depScopeFile(UNDECLARED_NAME), DEP_SCOPE_BASE);
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'base']);
  const sealed = sealedQuest(root, quest);
  const oracle = path.join(root, 'solve', 'oracle', `${quest.id}.json`);
  fs.mkdirSync(path.dirname(oracle), {recursive: true});
  fs.writeFileSync(oracle, JSON.stringify(ORACLE_OPEN));
  return {root, quest: sealed, oracleFile: oracle};
}

function captureStdout(run) {
  const chunks = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk) => {
    chunks.push(String(chunk));
    return true;
  };
  try {
    return {result: run(), stdout: chunks.join('')};
  } finally {
    process.stdout.write = original;
  }
}

function captureAttempt(fx, sourcePath, dirtyForeign) {
  assert.equal(runStep(fx.root, fx.quest).terminal, null, 'the step begins');
  writeFile(fx.root, sourcePath, SOURCE_CANDIDATE);
  fs.writeFileSync(fx.oracleFile, JSON.stringify(ORACLE_CLOSER));
  dirtyForeign(fx.root);
  return captureStdout(() => runStep(fx.root, fx.quest, {
    autoDiff: true,
    summary: 'auto-captured attempt beside foreign bookkeeping',
  }));
}

function recordedChangedPaths(fx) {
  const attempts = readLog(fx.root, fx.quest.id)
    .filter((event) => event.type === EVENT_ATTEMPT);
  assert.equal(attempts.length, 1, 'exactly one attempt is recorded');
  return [...inspectChangeArtifact(fx.root, fx.quest, attempts[0].changeRef)
    .changedPaths].sort();
}

function porcelain(root, relative) {
  return git(root, ['status', '--porcelain', '--', relative]);
}

test('foreign-quest-bookkeeping-excluded-and-named: another declared ' +
  'quest\'s dirty quest file and dep-scope note stay out of the attempt, ' +
  'stay dirty in the tree, and are named on stdout', (t) => {
  const fx = fixture(t, processQuest(QUEST_ID));
  const foreign = [questFile(PREFIXED_QUEST_ID), depScopeFile(PREFIXED_QUEST_ID)];
  const {stdout} = captureAttempt(fx, WORKFLOW_SOURCE, (root) => {
    writeFile(root, questFile(PREFIXED_QUEST_ID), QUEST_JSON_EDITED);
    writeFile(root, depScopeFile(PREFIXED_QUEST_ID), DEP_SCOPE_EDITED);
  });
  assert.deepEqual(recordedChangedPaths(fx), [WORKFLOW_SOURCE],
    'only this quest\'s source change is recorded');
  assert.match(stdout, FOREIGN_NOTICE);
  for (const relative of foreign) {
    assert.ok(stdout.includes(relative), `notice names ${relative}`);
    assert.match(porcelain(fx.root, relative), /^ ?M /u,
      `${relative} stays dirty and untouched`);
  }
});

test('foreign-owner-resolves-by-longest-declared-id: a sibling whose id ' +
  'prefixes this one, and a dotted id, resolve to their own quest', (t) => {
  const fx = fixture(t, processQuest(PREFIXED_QUEST_ID));
  const {stdout} = captureAttempt(fx, WORKFLOW_SOURCE, (root) => {
    writeFile(root, depScopeFile(QUEST_ID), DEP_SCOPE_EDITED);
    writeFile(root, depScopeFile(PREFIXED_QUEST_ID), DEP_SCOPE_EDITED);
    writeFile(root, questFile(DOTTED_QUEST_ID), QUEST_JSON_EDITED);
  });
  assert.deepEqual(recordedChangedPaths(fx),
    [WORKFLOW_SOURCE, depScopeFile(PREFIXED_QUEST_ID)].sort(),
    'the own dep-scope note rides; the prefix sibling and dotted quest ' +
    'are excluded');
  assert.ok(stdout.includes(depScopeFile(QUEST_ID)));
  assert.ok(stdout.includes(questFile(DOTTED_QUEST_ID)));
  assert.equal(bookkeepingOwnerQuestId(fx.root, questFile(DOTTED_QUEST_ID)),
    DOTTED_QUEST_ID, 'the dotted id is not split at its first dot');
  assert.equal(bookkeepingOwnerQuestId(fx.root, depScopeFile(QUEST_ID)),
    QUEST_ID, 'the shorter id does not swallow its longer sibling');
  assert.equal(bookkeepingOwnerQuestId(fx.root,
    depScopeFile(PREFIXED_QUEST_ID)), PREFIXED_QUEST_ID);
});

test('undeclared-owner-is-never-foreign: bookkeeping named after no ' +
  'declared quest stays inside the attempt where a verifier can see it',
(t) => {
  const fx = fixture(t, processQuest(QUEST_ID));
  const stray = depScopeFile(UNDECLARED_NAME);
  assert.equal(bookkeepingOwnerQuestId(fx.root, stray), null);
  assert.equal(isForeignQuestBookkeeping(fx.root, stray, QUEST_ID), false);
  const {stdout} = captureAttempt(fx, WORKFLOW_SOURCE, (root) => {
    writeFile(root, stray, DEP_SCOPE_EDITED);
  });
  assert.doesNotMatch(stdout, FOREIGN_NOTICE);
  assert.ok(recordedChangedPaths(fx).includes(stray),
    'the stray path is captured, not silently dropped');
});

test('shared-planning-doc-still-captured-and-named: a shared epic edit is ' +
  'owned by nobody and still rides with a product quest; a shared spec ' +
  'edit still refuses the product quest, naming the path', (t) => {
  const fx = fixture(t, productQuest());
  assert.equal(bookkeepingOwnerQuestId(fx.root, SHARED_EPIC), null);
  assert.equal(bookkeepingOwnerQuestId(fx.root, SHARED_SPEC), null);
  assert.equal(runStep(fx.root, fx.quest).terminal, null);
  writeFile(fx.root, PRODUCT_SOURCE, SOURCE_CANDIDATE);
  fs.writeFileSync(fx.oracleFile, JSON.stringify(ORACLE_CLOSER));
  writeFile(fx.root, SHARED_EPIC, EPIC_EDITED);
  writeFile(fx.root, SHARED_SPEC, EPIC_EDITED);
  let refusal = null;
  try {
    captureStdout(() => runStep(fx.root, fx.quest, {
      autoDiff: true,
      summary: 'runtime change beside shared planning documents',
    }));
  } catch (error) {
    refusal = error;
  }
  assert.ok(refusal instanceof Error, 'the shared spec refuses the product quest');
  assert.match(refusal.message, WORKFLOW_SCOPE_REFUSAL);
  assert.ok(refusal.message.includes(SHARED_SPEC),
    'the refusal names the offending path');
  assert.equal(refusal.message.includes(SHARED_EPIC), false,
    'the epic memo is not a workflow path');
  assert.equal(refusal.message.includes(PRODUCT_SOURCE), false,
    'the runtime source is not blamed');
});
