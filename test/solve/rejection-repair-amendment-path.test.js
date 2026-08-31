// Witness for the solver-rejection-repair-amendment-path quest.
// Raw node:test (not the tap shim) so --test-name-pattern selects exactly one
// scenario and each receipt is independently honest.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

import {
  appendEvent, loadQuest, readLog, saveQuest,
} from '../../scripts/solve/store.js';
import {
  AMENDMENT_KINDS,
  applyAmendments,
  questAmendments,
  runAmendCommand,
} from '../../scripts/solve/amend.js';
import {ensureSealedGoal} from '../../scripts/solve/loop.js';
import {reviewIdFor} from '../../scripts/solve/review-request.js';

const CLI = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '../../scripts/solve.js');
const QUEST_ID = 'repair-path-fixture';
const SEALED_RECEIPTS = ['alpha-receipt', 'beta-receipt'];
const RECEIPT_FILE = 'solve/evidence/repair-path-fixture.receipt.json';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'repair-path-'));
}

function cli(root, args) {
  return execFileSync('node', [CLI, ...args, '--root', root],
    {encoding: 'utf8'});
}

function cliError(root, args) {
  try {
    cli(root, args);
    return '';
  } catch (error) {
    return `${error.stdout || ''}${error.stderr || ''}${error.message || ''}`;
  }
}

function goal() {
  const args = {file: RECEIPT_FILE, requiredReceipts: [...SEALED_RECEIPTS]};
  return {
    id: QUEST_ID,
    authoringContractVersion: 1,
    statement: 'The process contract holds.',
    class: 'process',
    priority: 1,
    constraints: [],
    links: {roadmapRow: 'row-1'},
    doneWhen: {probe: 'test-receipt', args},
    frontiers: [
      {id: `${QUEST_ID}-main`, priority: 1,
        metric: {probe: 'test-receipt', args}},
      // A frontier on a DIFFERENT oracle must not be swept along.
      {id: `${QUEST_ID}-other`, priority: 2,
        metric: {probe: 'test-receipt',
          args: {file: 'solve/evidence/other.receipt.json',
            requiredReceipts: ['other-receipt']}}},
    ],
  };
}

function sealed(root) {
  const quest = goal();
  saveQuest(root, quest);
  ensureSealedGoal(root, quest);
  return quest;
}

// A quest WITH a candidate-contract attempt. Without this the bytes branch in
// cmdFinding never runs, so a scope-ordering assertion would be satisfied by
// the pre-change code too — the receipt could not fail.
function sealedWithCandidateAttempt(root) {
  const quest = sealed(root);
  const diff = [
    'diff --git a/scripts/example.js b/scripts/example.js',
    'new file mode 100644',
    `index ${'0'.repeat(40)}..${'1'.repeat(40)}`,
    '--- /dev/null',
    '+++ b/scripts/example.js',
    '@@ -0,0 +1 @@',
    '+// example',
    '',
  ].join('\n');
  const artifact = path.join(root, 'solve', 'changes', QUEST_ID,
    'attempt-1.diff');
  fs.mkdirSync(path.dirname(artifact), {recursive: true});
  fs.writeFileSync(artifact, diff);
  appendEvent(root, QUEST_ID, {
    type: 'attempt',
    frontier: `${QUEST_ID}-main`,
    name: 'candidate-attempt',
    changeRef: `diff:solve/changes/${QUEST_ID}/attempt-1.diff`,
    verificationContractVersion: 2,
  });
  return quest;
}

// Mint a review manifest the way the real flow does, so loadReviewRequest's
// immutable-identity check passes.
function mintReview(root, questId, fingerprints = {}) {
  const manifest = {
    schemaVersion: 1,
    questId,
    candidate: {
      fingerprint: fingerprints.candidate || `sha256:${'1'.repeat(64)}`,
      baseCommit: 'a'.repeat(40),
      paths: ['scripts/solve/amend.js'],
      sourcePaths: [],
      firstAttemptIndex: 0,
      lastAttemptIndex: 0,
    },
    aggregate: {
      fingerprint: fingerprints.aggregate || `sha256:${'2'.repeat(64)}`,
      baseCommit: 'a'.repeat(40),
      paths: ['scripts/solve/amend.js'],
    },
  };
  const id = reviewIdFor(manifest);
  const file = path.join(root, 'solve', 'state', 'reviews', `${id}.json`);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(
    {id, createdAt: new Date().toISOString(), manifest}, null, 2)}\n`);
  return {id, manifest};
}

function strengthenArgs(extra) {
  return JSON.stringify({
    file: RECEIPT_FILE,
    requiredReceipts: [...SEALED_RECEIPTS, ...extra],
  });
}

function recordRejection(root, questId, reviewId, fingerprint) {
  return cli(root, [
    'finding', '--id', questId, '--frontier', `${questId}-main`,
    '--kind', 'verifier-rejection', '--evidence', 'subagent:verifier-1',
    '--review', reviewId,
    '--verification-scope', 'candidate',
    '--verification-fingerprint', fingerprint,
    '--finding', 'harness-fidelity: the guard was not exercised by any fixture',
    '--claim', 'the verifier rejected this candidate',
  ]);
}

test('rejection-binds-to-sealed-review-manifest', () => {
  const root = tmp();
  sealed(root);
  const {id, manifest} = mintReview(root, QUEST_ID);

  // The repair has already changed the worktree: no current-bytes projection
  // can reproduce the reviewed fingerprint. Binding to the manifest still works.
  recordRejection(root, QUEST_ID, id, manifest.candidate.fingerprint);

  const rejection = readLog(root, QUEST_ID)
    .filter((event) => event.kind === 'verifier-rejection').at(-1);
  assert.ok(rejection, 'the rejection is recorded after the repair');
  assert.equal(rejection.verification.fingerprint,
    manifest.candidate.fingerprint);
  fs.rmSync(root, {recursive: true, force: true});
});

test('rejection-binding-refuses-wrong-fingerprint', () => {
  const root = tmp();
  sealed(root);
  const {id} = mintReview(root, QUEST_ID);

  const message = cliError(root, [
    'finding', '--id', QUEST_ID, '--frontier', `${QUEST_ID}-main`,
    '--kind', 'verifier-rejection', '--evidence', 'subagent:verifier-1',
    '--review', id,
    '--verification-scope', 'candidate',
    '--verification-fingerprint', `sha256:${'9'.repeat(64)}`,
    '--finding', 'harness-fidelity: the guard was not exercised by any fixture',
    '--claim', 'the verifier rejected this candidate',
  ]);
  assert.match(message, /does not match review/u);
  fs.rmSync(root, {recursive: true, force: true});
});

test('rejection-requires-review-when-one-exists', () => {
  const root = tmp();
  sealed(root);
  mintReview(root, QUEST_ID);

  const message = cliError(root, [
    'finding', '--id', QUEST_ID, '--frontier', `${QUEST_ID}-main`,
    '--kind', 'verifier-rejection', '--evidence', 'subagent:verifier-1',
    '--verification-scope', 'attempt',
    '--verification-fingerprint', `sha256:${'a'.repeat(64)}`,
    '--finding', 'harness-fidelity: the guard was not exercised by any fixture',
    '--claim', 'the verifier rejected this candidate',
  ]);
  assert.match(message, /requires --review/u,
    'the unchecked attempt path is closed once a sealed referent exists');
  fs.rmSync(root, {recursive: true, force: true});
});

test('receipt-bar-strengthen-needs-no-rejection-finding', () => {
  const root = tmp();
  const quest = sealed(root);
  assert.equal(questAmendments(readLog(root, QUEST_ID)).length, 0);

  runAmendCommand(root, {
    'id': QUEST_ID,
    'kind': 'receipt-bar-strengthen',
    'done-when-args': strengthenArgs(['gamma-receipt']),
    'evidence': 'verifier demanded a receipt for the unexercised guard',
  });

  const amended = loadQuest(root, QUEST_ID);
  assert.deepEqual(amended.doneWhen.args.requiredReceipts,
    [...SEALED_RECEIPTS, 'gamma-receipt']);
  assert.doesNotThrow(() => ensureSealedGoal(root, amended),
    'the strengthened bar is legal against sealed + amendments');
  assert.equal(amended.doneWhen.probe, quest.doneWhen.probe);
  fs.rmSync(root, {recursive: true, force: true});
});

test('receipt-bar-strengthen-refuses-removal', () => {
  const root = tmp();
  sealed(root);

  assert.throws(() => runAmendCommand(root, {
    'id': QUEST_ID,
    'kind': 'receipt-bar-strengthen',
    'done-when-args': JSON.stringify({
      file: RECEIPT_FILE,
      requiredReceipts: ['alpha-receipt', 'gamma-receipt'],
    }),
    'evidence': 'attempting to drop a sealed receipt',
  }), /only ADDS receipts — it cannot drop beta-receipt/u);

  assert.throws(() => runAmendCommand(root, {
    'id': QUEST_ID,
    'kind': 'receipt-bar-strengthen',
    'done-when-args': strengthenArgs([]),
    'evidence': 'attempting a no-op',
  }), /must add at least one receipt/u);

  // Padding with a duplicate makes the array LONGER while adding nothing, so
  // a length comparison would accept it and burn an amendment on a no-op.
  assert.throws(() => runAmendCommand(root, {
    'id': QUEST_ID,
    'kind': 'receipt-bar-strengthen',
    'done-when-args': JSON.stringify({
      file: RECEIPT_FILE,
      requiredReceipts: [...SEALED_RECEIPTS, 'beta-receipt'],
    }),
    'evidence': 'attempting duplicate padding',
  }), /unique, non-empty receipt ids/u);

  // An id no receipt can ever match, and which this kind can never drop.
  for (const bad of [123, '', null, {}, '   ', ' alpha-receipt']) {
    assert.throws(() => runAmendCommand(root, {
      'id': QUEST_ID,
      'kind': 'receipt-bar-strengthen',
      'done-when-args': JSON.stringify({
        file: RECEIPT_FILE,
        requiredReceipts: [...SEALED_RECEIPTS, bad],
      }),
      'evidence': 'attempting an unsatisfiable receipt id',
    }), /unique, non-empty receipt ids/u);
  }

  assert.deepEqual(loadQuest(root, QUEST_ID).doneWhen.args.requiredReceipts,
    SEALED_RECEIPTS, 'a refused amendment changes nothing');
  fs.rmSync(root, {recursive: true, force: true});
});

test('receipt-bar-strengthen-refuses-probe-or-file-change', () => {
  const root = tmp();
  sealed(root);

  assert.throws(() => runAmendCommand(root, {
    'id': QUEST_ID,
    'kind': 'receipt-bar-strengthen',
    'done-when-args': JSON.stringify({
      file: 'solve/evidence/somewhere-else.receipt.json',
      requiredReceipts: [...SEALED_RECEIPTS, 'gamma-receipt'],
    }),
    'evidence': 'attempting to swap the oracle',
  }), /cannot change the receipt file/u);

  assert.throws(() => runAmendCommand(root, {
    'id': QUEST_ID,
    'kind': 'receipt-bar-strengthen',
    'done-when-args': JSON.stringify({
      file: RECEIPT_FILE,
      requiredReceipts: [...SEALED_RECEIPTS, 'gamma-receipt'],
      consecutive: 3,
    }),
    'evidence': 'attempting to smuggle another arg',
  }), /must restate the sealed doneWhen args exactly/u);

  assert.equal(loadQuest(root, QUEST_ID).doneWhen.args.file, RECEIPT_FILE);
  fs.rmSync(root, {recursive: true, force: true});
});

test('receipt-bar-strengthen-preserves-sibling-args', () => {
  // A sealed arg other than requiredReceipts is part of the oracle. Checking
  // only for UNEXPECTED keys let a sealed key be dropped or rewritten with no
  // verifier gate at all.
  const root = tmp();
  const quest = goal();
  quest.doneWhen.args = {...quest.doneWhen.args, minRuns: 5};
  quest.frontiers[0].metric.args = quest.doneWhen.args;
  saveQuest(root, quest);
  ensureSealedGoal(root, quest);

  assert.throws(() => runAmendCommand(root, {
    'id': QUEST_ID,
    'kind': 'receipt-bar-strengthen',
    'done-when-args': strengthenArgs(['gamma-receipt']),
    'evidence': 'attempting to drop a sealed sibling arg',
  }), /must restate the sealed doneWhen args exactly/u);

  assert.throws(() => runAmendCommand(root, {
    'id': QUEST_ID,
    'kind': 'receipt-bar-strengthen',
    'done-when-args': JSON.stringify({
      file: RECEIPT_FILE,
      requiredReceipts: [...SEALED_RECEIPTS, 'gamma-receipt'],
      minRuns: 1,
    }),
    'evidence': 'attempting to weaken a sealed sibling arg',
  }), /cannot change the sealed doneWhen arg minRuns/u);

  assert.equal(loadQuest(root, QUEST_ID).doneWhen.args.minRuns, 5);

  /* eslint-disable no-extend-native */
  const pollutionRoot = tmp();
  sealed(pollutionRoot);
  try {
    // A plain `args.file` read would inherit this and accept args that never
    // wrote `file`, silently dropping the sealed key from the saved oracle.
    Object.prototype.file = RECEIPT_FILE;
    assert.throws(() => runAmendCommand(pollutionRoot, {
      'id': QUEST_ID,
      'kind': 'receipt-bar-strengthen',
      'done-when-args': JSON.stringify({
        requiredReceipts: [...SEALED_RECEIPTS, 'gamma-receipt'],
      }),
      'evidence': 'omitting file under a polluted prototype',
    }), /cannot change the receipt file/u);
  } finally {
    delete Object.prototype.file;
  }
  /* eslint-enable no-extend-native */
  assert.equal(loadQuest(pollutionRoot, QUEST_ID).doneWhen.args.file,
    RECEIPT_FILE, 'the sealed oracle survived the polluted read');

  fs.rmSync(pollutionRoot, {recursive: true, force: true});
  fs.rmSync(root, {recursive: true, force: true});
});

test('receipt-bar-strengthen-updates-frontier-metric', () => {
  const root = tmp();
  sealed(root);

  runAmendCommand(root, {
    'id': QUEST_ID,
    'kind': 'receipt-bar-strengthen',
    'done-when-args': strengthenArgs(['gamma-receipt']),
    'evidence': 'verifier demanded a receipt for the unexercised guard',
  });

  const amended = loadQuest(root, QUEST_ID);
  const main = amended.frontiers.find((f) => f.id === `${QUEST_ID}-main`);
  const other = amended.frontiers.find((f) => f.id === `${QUEST_ID}-other`);

  // The probe measures ONLY requiredReceipts, so a bar raised in doneWhen
  // alone would be a bar nothing measures.
  assert.deepEqual(main.metric.args.requiredReceipts,
    [...SEALED_RECEIPTS, 'gamma-receipt'],
    'the frontier that shares the oracle is raised too');
  assert.deepEqual(other.metric.args.requiredReceipts, ['other-receipt'],
    'a frontier on a different oracle is untouched');
  fs.rmSync(root, {recursive: true, force: true});
});

test('scope-validated-before-bytes', () => {
  const root = tmp();
  // The discriminating shape: with a candidate-contract attempt present, the
  // pre-change code reached the aggregate bytes comparison FIRST and reported
  // a fingerprint mismatch for the very same wrong flag.
  sealedWithCandidateAttempt(root);

  // Scope validity must not depend on quest state: an invalid rejection scope
  // reports the actionable flag, never a fingerprint mismatch.
  for (const scope of ['aggregate', 'both']) {
    const message = cliError(root, [
      'finding', '--id', QUEST_ID, '--frontier', `${QUEST_ID}-main`,
      '--kind', 'verifier-rejection', '--evidence', 'subagent:verifier-1',
      '--verification-scope', scope,
      '--verification-fingerprint', `sha256:${'a'.repeat(64)}`,
      '--finding', 'harness-fidelity: the guard was not exercised by fixtures',
      '--claim', 'the verifier rejected this candidate',
    ]);
    assert.match(message,
      /verifier-rejection requires --verification-scope attempt\|candidate/u);
    assert.doesNotMatch(message, /does not match current bytes/u);
  }
  fs.rmSync(root, {recursive: true, force: true});
});

test('amend-refusal-names-the-actionable-flags', () => {
  const root = tmp();
  sealed(root);

  let message = '';
  try {
    runAmendCommand(root, {
      'id': QUEST_ID,
      'kind': 'oracle-command-correction',
      'done-when-args': strengthenArgs(['gamma-receipt']),
      'evidence': 'no such finding is recorded here',
    });
  } catch (error) {
    message = error.message;
  }

  assert.match(message, /--kind verifier-rejection/u);
  assert.match(message, /--verification-fingerprint/u);
  assert.match(message, /--review <reviewId>/u);
  assert.match(message, /receipt-bar-strengthen/u,
    'the refusal points at the ungated path for pure strengthening');
  fs.rmSync(root, {recursive: true, force: true});
});

test('existing-amendment-kinds-unchanged', () => {
  // CONTROL: the sealed amendment vocabulary and its gate are intact.
  assert.deepEqual([...AMENDMENT_KINDS], [
    'class-correction', 'oracle-command-correction', 'statement-strengthen',
    'verification-bar-expansion', 'receipt-bar-strengthen',
  ]);

  const root = tmp();
  const quest = sealed(root);
  runAmendCommand(root, {id: QUEST_ID, kind: 'class-correction',
    class: 'product', evidence: 'quest-lint: statement classifies as product'});
  assert.equal(loadQuest(root, QUEST_ID).class, 'product',
    'class-correction still works and still needs no verifier finding');

  const effective = applyAmendments(quest, questAmendments(readLog(root, QUEST_ID)));
  assert.equal(effective.class, 'product');
  fs.rmSync(root, {recursive: true, force: true});
});

test('existing-rejection-flow-unchanged', () => {
  // CONTROL: a quest with NO minted review keeps the previous contract, so the
  // CLI contract tests that model review-less quests are unaffected.
  const root = tmp();
  sealed(root);

  cli(root, [
    'finding', '--id', QUEST_ID, '--frontier', `${QUEST_ID}-main`,
    '--kind', 'verifier-rejection', '--evidence', 'subagent:verifier-1',
    '--verification-scope', 'attempt',
    '--verification-fingerprint', `sha256:${'a'.repeat(64)}`,
    '--finding', 'harness-fidelity: the guard was not exercised by any fixture',
    '--claim', 'the verifier rejected this candidate',
  ]);

  const rejection = readLog(root, QUEST_ID)
    .filter((event) => event.kind === 'verifier-rejection').at(-1);
  assert.ok(rejection, 'attempt-scope rejection still records without a review');
  assert.equal(rejection.verification.scope, 'attempt');
  fs.rmSync(root, {recursive: true, force: true});
});

test('witness-deterministic', () => {
  const fingerprints = [];
  for (let run = 0; run < 3; run += 1) {
    const root = tmp();
    sealed(root);
    runAmendCommand(root, {
      'id': QUEST_ID,
      'kind': 'receipt-bar-strengthen',
      'done-when-args': strengthenArgs(['gamma-receipt']),
      'evidence': 'verifier demanded a receipt for the unexercised guard',
    });
    const amended = loadQuest(root, QUEST_ID);
    fingerprints.push(JSON.stringify({
      doneWhen: amended.doneWhen,
      frontiers: amended.frontiers.map((f) => f.metric.args),
    }));
    fs.rmSync(root, {recursive: true, force: true});
  }
  assert.equal(new Set(fingerprints).size, 1,
    'repeated runs on fresh roots produce one identical projection');
});

test('review-binding-refuses-another-quests-review', () => {
  const root = tmp();
  sealed(root);
  // A review minted for a DIFFERENT quest must not launder a fingerprint into
  // this one's log.
  const foreign = mintReview(root, 'some-other-quest');

  const message = cliError(root, [
    'finding', '--id', QUEST_ID, '--frontier', `${QUEST_ID}-main`,
    '--kind', 'verifier-rejection', '--evidence', 'subagent:verifier-1',
    '--review', foreign.id,
    '--verification-scope', 'candidate',
    '--verification-fingerprint', foreign.manifest.candidate.fingerprint,
    '--finding', 'harness-fidelity: the guard was not exercised by any fixture',
    '--claim', 'the verifier rejected this candidate',
  ]);

  assert.match(message, /belongs to another Quest/u);
  const rejections = readLog(root, QUEST_ID)
    .filter((event) => event.kind === 'verifier-rejection');
  assert.equal(rejections.length, 0, 'nothing is recorded on refusal');
  fs.rmSync(root, {recursive: true, force: true});
});
