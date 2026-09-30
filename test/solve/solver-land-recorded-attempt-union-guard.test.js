import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {runAttemptCommand} from '../../scripts/solve/attempt.js';
import {
  EVENT_ATTEMPT,
  EVENT_FINDING,
  EVENT_GATE_DECISION,
  OUTCOME_BLOCKED,
  SCOPE_PRESSURE_FILE_LIMIT,
} from '../../scripts/solve/constants.js';
import {
  buildNextProjection,
  buildNextSummaryLines,
} from '../../scripts/solve/next.js';
import {landQuestWorkflow} from '../../scripts/solve/operator-workflow.js';
import {runStep} from '../../scripts/solve/step.js';
import {appendFinding, readLog, saveQuest} from '../../scripts/solve/store.js';
import {verificationState} from '../../scripts/solve/verification.js';

// Deterministic witness for the solver-land-recorded-attempt-union-guard
// quest: the exact 2026-08-30 sequence that produced commit ce0e4942d on
// learner-promotion-proof-channel-wake, driven through the REAL landing
// path (operator-workflow landQuestWorkflow -> landing preflight -> handoff
// scope -> commit) on a temporary Git repository.
//
// The incident: the doneWhen receipt was already green, so the quest
// projected SOLVED with zero recorded source attempts; the one-shot
// `solve attempt` that would have recorded the staged 19-path source was
// refused by the scope-pressure guard (a gate-decision with code
// blocked-scope, no attempt event); `land` then judged verification
// not-required and its scope-safe commit swept the STAGED source (named by
// the unrecorded diff artifact on disk) into ce0e4942d without a verifier.
//
// Every scenario name below is anchored to one sealed receipt id so the
// evidence harness can select it with --test-name-pattern. The witness
// imports only landing-path modules that exist on the pre-cure HEAD, so the
// receipts that must stay green on both sides (evidence-only landing,
// determinism) load and pass there too, while the guard receipts are RED on
// HEAD (land commits with verdict not-required) and green after.

const UNCOVERED_CODE = 'blocked-uncovered-source-paths';
const VERDICT_NOT_REQUIRED = 'not-required';
const VERDICT_APPROVE = 'approve';
const RECORDED_AGGREGATE_RECEIPT = 'recorded-aggregate-approval';
const REPAIR_AUDIT_ACTION = 'repair-audit';
const VERIFIER_APPROVAL = 'verifier-approval';
const VERIFIER_REJECTION = 'verifier-rejection';
const CONTINUATION_BLOCKED_SCOPE = 'blocked-scope';
const SCOPE_PRESSURE_PATTERN = /scope-pressure precommit blocked/iu;
const SOLVED_TERMINAL = 'solved';
const AGGREGATE_SCOPE = 'aggregate';
const VERIFICATION_SCHEMA_VERSION = 2;
const VERIFIER_EVIDENCE = 'subagent:union-guard-verifier';
const SOLVE_PREFIX = 'solve/';
const FRONTIER_BOARD_PATH = 'solve/FRONTIER.generated.md';
const DERIVED_INVENTORY_PREFIX = 'solve/changes/';
const DERIVED_INVENTORY_SUFFIX = '/inventory.json';
const QUEST_ID = 'union-guard-land';
const FRONTIER_ID = `${QUEST_ID}-main`;
const SOURCE_A = 'src/a.js';
const SOURCE_B = 'src/b.js';
const SOURCE_EXTRA = 'src/extra.js';
const SOURCE_A_BASE = 'export const a = 1;\n';
const SOURCE_B_BASE = 'export const b = 1;\n';
const SOURCE_A_CANDIDATE = 'export const a = 2;\n';
const SOURCE_EXTRA_CONTENT = 'export const extra = true;\n';
const SCOPE_DIRECTORY = 'src/scope';
// One file over the terminal bound so the REAL scope-pressure precommit guard
// refuses the attempt record exactly as it did on 2026-08-30.
const REFUSED_ATTEMPT_FILE_COUNT = SCOPE_PRESSURE_FILE_LIMIT + 1;
const IMPACT_REGISTRY_PATH = 'test/shards/impact-contracts.json';
const IMPACT_REGISTRY = {
  schemaVersion: 2,
  id: 'impact-contracts',
  description: 'union guard fixture registry',
  contracts: {},
  coupledPairs: {},
};
const ORACLE_GREEN = {metric: 0, target: 0};
const ORACLE_OPEN = {metric: 2, target: 0};
const HARNESS_NOOP = ['node', '-e', ''];
const GIT_DIFF_ARGUMENTS = Object.freeze([
  'diff', '--binary', '--full-index', '--no-ext-diff', 'HEAD', '--',
]);
const TMP_PREFIX = 'solver-land-union-guard-';
const OUTCOME_BLOCKED_KIND = 'blocked';
const OUTCOME_LANDED_KIND = 'landed';

function gitRaw(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function git(root, args) {
  return gitRaw(root, args).trim();
}

function writeFile(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
}

// A temporary repository whose base commit holds two source files and the
// impact-contract registry the terminal audit loads. The doneWhen is the
// repo's oracle probe: `oracle` green from the start plays the already-green
// test-receipt of the incident.
function fixture(oracle, t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), TMP_PREFIX));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'solver@example.com']);
  git(root, ['config', 'user.name', 'Solver']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  writeFile(root, SOURCE_A, SOURCE_A_BASE);
  writeFile(root, SOURCE_B, SOURCE_B_BASE);
  writeFile(root, IMPACT_REGISTRY_PATH,
    `${JSON.stringify(IMPACT_REGISTRY, null, 2)}\n`);
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'base']);
  const oracleFile = path.join(root, 'solve', 'oracle', `${QUEST_ID}.json`);
  fs.mkdirSync(path.dirname(oracleFile), {recursive: true});
  fs.writeFileSync(oracleFile, JSON.stringify(oracle));
  const metric = {probe: 'oracle', args: {file: oracleFile}};
  const quest = {
    id: QUEST_ID,
    authoringContractVersion: 1,
    verificationContractVersion: 2,
    statement: 'The union guard fixture reaches zero.',
    priority: 1,
    class: 'process',
    doneWhen: metric,
    frontiers: [{id: FRONTIER_ID, priority: 1, metric}],
    constraints: [],
  };
  saveQuest(root, quest);
  return {root, quest, oracleFile};
}

function canonicalArtifact(root, name, paths) {
  const relative = `solve/changes/${QUEST_ID}/${name}.diff`;
  // The artifact must be the byte-exact canonical delta (no trimming).
  writeFile(root, relative, gitRaw(root, [...GIT_DIFF_ARGUMENTS, ...paths]));
  return `diff:${relative}`;
}

// A hand-written change artifact on disk that no attempt event references:
// the shape the scope-refused `solve attempt` left behind on 2026-08-30.
function strayArtifact(root, name, relativePath) {
  const relative = `solve/changes/${QUEST_ID}/${name}.diff`;
  writeFile(root, relative, [
    `diff --git a/${relativePath} b/${relativePath}`,
    'new file mode 100644',
    '--- /dev/null',
    `+++ b/${relativePath}`,
    '@@ -0,0 +1 @@',
    `+${SOURCE_EXTRA_CONTENT.trim()}`,
    '',
  ].join('\n'));
}

function logEvents(root, type) {
  return readLog(root, QUEST_ID).filter((event) => event.type === type);
}

function verdictFindings(root) {
  return logEvents(root, EVENT_FINDING).filter((event) =>
    event.kind === VERIFIER_APPROVAL || event.kind === VERIFIER_REJECTION);
}

function committedFiles(root) {
  return git(root, ['show', '--name-only', '--format=', 'HEAD'])
    .split('\n').filter((line) => line.length > 0).sort();
}

function nonSolvePaths(paths) {
  return paths.filter((filePath) => !filePath.startsWith(SOLVE_PREFIX));
}

function stagedSourceOutcome(root) {
  try {
    return {
      kind: OUTCOME_LANDED_KIND,
      ...pick(landQuestWorkflow(root, {id: QUEST_ID}), ['verdict', 'committed']),
    };
  } catch (error) {
    return {
      kind: OUTCOME_BLOCKED_KIND,
      code: error.code,
      uncoveredPaths: error.uncoveredPaths,
      message: error.message,
    };
  }
}

function pick(value, keys) {
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}

function assertBlockedNamingPaths(root, headBefore, paths, run) {
  assert.throws(run, (error) =>
    error.code === UNCOVERED_CODE &&
    JSON.stringify(error.uncoveredPaths) === JSON.stringify(paths) &&
    paths.every((filePath) => error.message.includes(filePath)),
  `land must refuse with the typed ${UNCOVERED_CODE} problem naming ${paths}`);
  assert.equal(git(root, ['rev-parse', 'HEAD']), headBefore,
    'a blocked landing commits nothing');
  assert.deepEqual(verdictFindings(root), [],
    'a blocked landing records no verdict');
}

// The incident's opening: green receipt, quest SOLVED on the begin step with
// zero attempts, then a source edit staged in the index.
function greenReceiptWithStagedSource(t) {
  const fx = fixture(ORACLE_GREEN, t);
  assert.equal(runStep(fx.root, fx.quest).terminal, SOLVED_TERMINAL,
    'the already-green receipt closes the quest with zero attempts');
  writeFile(fx.root, SOURCE_A, SOURCE_A_CANDIDATE);
  git(fx.root, ['add', '--', SOURCE_A]);
  return fx;
}

// A recorded source attempt (src/a.js) carried to SOLVED and approved at
// aggregate scope by a content-bound verifier finding, plus the falsifier: an
// untracked extra source file named only by a stray unrecorded artifact.
function recordedAndApprovedUnion(t) {
  const fx = fixture(ORACLE_OPEN, t);
  assert.equal(runStep(fx.root, fx.quest).terminal, null);
  writeFile(fx.root, SOURCE_A, SOURCE_A_CANDIDATE);
  fs.writeFileSync(fx.oracleFile, JSON.stringify(ORACLE_GREEN));
  const changeRef = canonicalArtifact(fx.root, 'attempt-1', [SOURCE_A]);
  const recorded = runStep(fx.root, fx.quest, {changeRef, summary: 'record a'});
  assert.equal(recorded.done, true, 'the recorded attempt closes the quest');
  writeFile(fx.root, SOURCE_EXTRA, SOURCE_EXTRA_CONTENT);
  strayArtifact(fx.root, 'stray', SOURCE_EXTRA);
  const state = verificationState(fx.root, fx.quest, readLog(fx.root, QUEST_ID));
  assert.equal(state.aggregate.ok, true);
  appendFinding(fx.root, QUEST_ID, {
    frontier: FRONTIER_ID,
    kind: VERIFIER_APPROVAL,
    claim: 'independent landing verification passed',
    evidence: VERIFIER_EVIDENCE,
    verification: {
      schemaVersion: VERIFICATION_SCHEMA_VERSION,
      scope: AGGREGATE_SCOPE,
      fingerprint: state.aggregate.fingerprint,
      baseCommit: state.aggregate.baseCommit,
      paths: state.aggregate.paths,
      sourcePaths: state.aggregate.paths,
      firstAttemptIndex: state.attempts[0].index,
      lastAttemptIndex: state.attempts[state.attempts.length - 1].index,
    },
  });
  const union = [...state.aggregate.paths].sort();
  assert.deepEqual(union, [SOURCE_A], 'the recorded union is exactly src/a.js');
  const landed = landQuestWorkflow(fx.root, {id: QUEST_ID});
  assert.equal(landed.verdict, VERDICT_APPROVE);
  assert.equal(landed.receiptRef, RECORDED_AGGREGATE_RECEIPT);
  assert.equal(landed.committed, true, 'the verified union lands');
  return {fx, landed, union};
}

test('land-blocks-uncovered-source-paths: staged source outside the ' +
  'recorded attempt union blocks the landing with a typed problem naming ' +
  'the paths', (t) => {
  const fx = greenReceiptWithStagedSource(t);
  // The unrecorded artifact on disk names the staged path; before the cure
  // the handoff scope trusted it and swept src/a.js into the commit.
  canonicalArtifact(fx.root, 'attempt-1', [SOURCE_A]);
  const headBefore = git(fx.root, ['rev-parse', 'HEAD']);
  assertBlockedNamingPaths(fx.root, headBefore, [SOURCE_A],
    () => landQuestWorkflow(fx.root, {id: QUEST_ID}));
  assert.deepEqual(logEvents(fx.root, EVENT_ATTEMPT), [],
    'the block never records an attempt on the operator\'s behalf');
  assert.match(git(fx.root, ['status', '--porcelain', '--', SOURCE_A]),
    /^[AM]/u, 'the staged source stays staged and uncommitted');
  const next = buildNextProjection(fx.root, QUEST_ID);
  assert.equal(next.action.code, REPAIR_AUDIT_ACTION);
  assert.equal(next.action.payload.problemCode, UNCOVERED_CODE);
  assert.deepEqual(next.action.payload.requiredPaths, [SOURCE_A]);
  assert.ok(buildNextSummaryLines(fx.root, QUEST_ID).some((line) =>
    line.includes(`problem [${UNCOVERED_CODE}]`) && line.includes(SOURCE_A)),
  '`next` shows the typed landing problem');
});

test('refused-attempt-record-leaves-candidate-unlandable: an attempt record ' +
  'refused by the scope-pressure guard leaves its staged paths uncovered ' +
  'and the candidate un-landable', (t) => {
  const fx = fixture(ORACLE_GREEN, t);
  assert.equal(runStep(fx.root, fx.quest).terminal, SOLVED_TERMINAL);
  const paths = [];
  for (let index = 0; index < REFUSED_ATTEMPT_FILE_COUNT; index += 1) {
    const relative = `${SCOPE_DIRECTORY}/file-${index}.js`;
    writeFile(fx.root, relative, `export const value${index} = ${index};\n`);
    git(fx.root, ['add', '-N', '--', relative]);
    paths.push(relative);
  }
  paths.sort();
  const changeRef = canonicalArtifact(fx.root, 'wide', paths);
  assert.throws(() => runAttemptCommand(fx.root, {
    id: QUEST_ID,
    frontier: FRONTIER_ID,
    changeRef,
    summary: 'wide source change',
    _: HARNESS_NOOP,
  }), SCOPE_PRESSURE_PATTERN, 'the real scope guard refuses the record');
  const gateDecisions = logEvents(fx.root, EVENT_GATE_DECISION);
  assert.equal(gateDecisions.at(-1)?.code, CONTINUATION_BLOCKED_SCOPE);
  assert.equal(gateDecisions.at(-1)?.outcome, OUTCOME_BLOCKED);
  assert.deepEqual(logEvents(fx.root, EVENT_ATTEMPT), [],
    'the refused record leaves zero attempts');
  const headBefore = git(fx.root, ['rev-parse', 'HEAD']);
  assertBlockedNamingPaths(fx.root, headBefore, paths,
    () => landQuestWorkflow(fx.root, {id: QUEST_ID}));
  assert.deepEqual(logEvents(fx.root, EVENT_ATTEMPT), [],
    'the block auto-records nothing: the candidate stays un-landable until ' +
    'an attempt is honestly recorded and verified');
  assert.equal(buildNextProjection(fx.root, QUEST_ID).action.payload.problemCode,
    UNCOVERED_CODE);
});

test('green-receipt-never-authorizes-source-landing: a green doneWhen ' +
  'receipt with staged source and no recorded attempt is refused, never ' +
  'landed as verdict not-required', (t) => {
  const fx = greenReceiptWithStagedSource(t);
  const headBefore = git(fx.root, ['rev-parse', 'HEAD']);
  let outcome = null;
  try {
    outcome = landQuestWorkflow(fx.root, {id: QUEST_ID});
  } catch (error) {
    outcome = error;
  }
  assert.ok(outcome instanceof Error,
    'a green receipt with staged source must not produce a landing result');
  assert.notEqual(outcome.verdict, VERDICT_NOT_REQUIRED);
  assertBlockedNamingPaths(fx.root, headBefore, [SOURCE_A],
    () => landQuestWorkflow(fx.root, {id: QUEST_ID}));
});

test('scope-safe-commit-equals-recorded-union: the landing pathspec is ' +
  'derived from the recorded union plus the quest\'s own solve/ artifacts, ' +
  'never from an artifact on disk', (t) => {
  const {fx, landed, union} = recordedAndApprovedUnion(t);
  const pathspec = [...landed.commit.paths].sort();
  assert.deepEqual(nonSolvePaths(pathspec), union,
    'every non-solve path in the pathspec is in the recorded union');
  assert.ok(!pathspec.includes(SOURCE_EXTRA),
    'the stray artifact cannot widen the pathspec');
  for (const filePath of pathspec.filter((item) => item.startsWith(SOLVE_PREFIX))) {
    const owned = filePath === FRONTIER_BOARD_PATH ||
      filePath.includes(`/${QUEST_ID}`) ||
      (filePath.startsWith(DERIVED_INVENTORY_PREFIX) &&
        filePath.endsWith(DERIVED_INVENTORY_SUFFIX));
    assert.ok(owned, `${filePath} is one of the quest's own solve/ artifacts`);
  }
  assert.equal(git(fx.root, ['status', '--porcelain', '--', SOURCE_EXTRA]),
    `?? ${SOURCE_EXTRA}`, 'the extra source stays untracked and uncommitted');
});

test('recorded-and-verified-union-lands-exactly: a recorded attempt with a ' +
  'verifier approval commits exactly the union and nothing else', (t) => {
  const {fx, landed, union} = recordedAndApprovedUnion(t);
  const committed = committedFiles(fx.root);
  assert.deepEqual(nonSolvePaths(committed), union,
    'the commit contains exactly the recorded union outside solve/');
  assert.ok(!committed.includes(SOURCE_EXTRA),
    'the untracked extra file named by the stray artifact is not swept');
  assert.equal(landed.commit.pushed, false, 'landing never pushes');
  assert.ok(verdictFindings(fx.root).some((event) =>
    event.kind === VERIFIER_APPROVAL && event.evidence === VERIFIER_EVIDENCE),
  'the landing rests on the recorded content-bound approval');
});

test('evidence-only-landing-unchanged: a quest with no delta outside solve/ ' +
  'keeps its verdict not-required landing', (t) => {
  const fx = fixture(ORACLE_GREEN, t);
  assert.equal(runStep(fx.root, fx.quest).terminal, SOLVED_TERMINAL);
  const headBefore = git(fx.root, ['rev-parse', 'HEAD']);
  const landed = landQuestWorkflow(fx.root, {id: QUEST_ID});
  assert.equal(landed.verdict, VERDICT_NOT_REQUIRED);
  assert.equal(landed.committed, true, 'the evidence-only quest lands');
  assert.notEqual(git(fx.root, ['rev-parse', 'HEAD']), headBefore);
  assert.deepEqual(nonSolvePaths(committedFiles(fx.root)), [],
    'an evidence-only landing commits only solve/ artifacts');
  assert.deepEqual(verdictFindings(fx.root), [],
    'no verifier finding is invented for an evidence-only landing');
});

test('witness-deterministic: two identical incident fixtures produce the ' +
  'identical landing outcome', (t) => {
  const first = stagedSourceOutcome(greenReceiptWithStagedSource(t).root);
  const second = stagedSourceOutcome(greenReceiptWithStagedSource(t).root);
  assert.deepEqual(first, second,
    'the landing outcome is a pure function of the recorded log and tree');
  if (first.kind === OUTCOME_BLOCKED_KIND) {
    assert.deepEqual(first.uncoveredPaths, [SOURCE_A]);
    assert.deepEqual(first.uncoveredPaths, [...first.uncoveredPaths].sort(),
      'the named paths are sorted');
  }
});
