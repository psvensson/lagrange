// The push gate's test stage decides between the change proof and the whole
// corpus as a pure function of the plan, and the gate is wired to that
// decision: the post-push manifest ends in it, the hook feeds it the remote
// base, and the corpus ratchets no longer materialise a second worktree.

import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

import {
  FULL_CORPUS_SHARE,
  FULL_CORPUS_TRIGGER_RULES,
  PROOF_MODE,
  PUSH_FULL_CORPUS_ENV,
  RANGE_SOURCE,
  REFUSAL_UNKNOWN_SCOPE,
  SELECTION_PRECISE,
  SELECTION_REFUSED,
  SELECTION_WIDENED,
} from '../../scripts/checks/change-selection-constants.js';
import {
  decidePushProof,
  fullCorpusTriggers,
} from '../../scripts/checks/push-gate-change-proof.js';

const UTF8 = 'utf8';
const CORPUS_SIZE = 2000;
const SPINE_COUNT = 29;
const CHANGE_PROOF_SCRIPT = 'scripts/checks/push-gate-change-proof.js';
const POSTPUSH_MANIFEST =
  'test/manifests/project-hardening-proof-postpush-manifest.json';
const PRE_PUSH_HOOK = '.githooks/pre-push';
const ORDINARY_SOURCE = 'src/raft/log.js';
const ENV_UNSET = Object.freeze({});
// One real file per trigger rule, so a rule can never match nothing.
const TRIGGERING_FILES = Object.freeze([
  'test/shards/safety-spine.json',
  'test/shards/impact-contracts.json',
  'test/manifests/project-hardening-proof-postpush-manifest.json',
  'scripts/run-test-files.js',
  'scripts/run-classified-test-files.js',
  'scripts/plan-test-lane.js',
  'scripts/select-change-tests.js',
  'scripts/check-subsystem.js',
  'scripts/checks/change-selection.js',
  'scripts/checks/change-selection-constants.js',
  'scripts/checks/changed-paths.js',
  'scripts/checks/change-proof-string-collections.js',
  'scripts/checks/helper-import-closure.js',
  'scripts/checks/push-gate-change-proof.js',
  'scripts/checks/test-primary-classification.js',
  'scripts/checks/impact-proof-cone-constants.js',
  'scripts/checks/test-timeout-declarations.js',
  'scripts/generate-test-subsystem-classes.js',
  'scripts/run-project-hardening-acceptance.js',
  'scripts/checks/acceptance-proof-manifest-runner.js',
  '.githooks/pre-push',
  '.taprc',
]);
// Generated state travels with ordinary changes: the seal with every JS edit,
// the census manifests with every changed test. Neither may trip the corpus.
const ORDINARY_FILES = Object.freeze([
  ORDINARY_SOURCE,
  'test/shards/impact-graph-seal.json',
  'test/shards/subsystem-classes.json',
  'test/shards/primary-classes.json',
  'test/shards/resource-classes.json',
  'test/shards/impact-coverage.json',
  // The selector owns package semantics; the gate carries no second authority.
  'package.json',
  'package-lock.json',
  'test/raft/log.test.js',
  'scripts/checks/release-preflight.js',
  'scripts/solve.js',
  'docs/development/solver-runbook.md',
  'test/bootstrap/api-fixtures.js',
]);

function planOf(overrides = {}) {
  const selectedCount = 271;
  const tests = [];
  for (let index = 0; index < SPINE_COUNT + selectedCount; index += 1) {
    tests.push({path: `test/x/${index}.test.js`, reasons: ['r']});
  }
  return {
    kind: SELECTION_WIDENED,
    refusalCode: null,
    refusals: [],
    changedPaths: [ORDINARY_SOURCE],
    spineCount: SPINE_COUNT,
    selectedCount,
    tests,
    ...overrides,
  };
}

function decide(overrides = {}, env = ENV_UNSET,
  rangeSource = RANGE_SOURCE.ENVIRONMENT) {
  return decidePushProof({
    plan: planOf(overrides), corpusSize: CORPUS_SIZE, rangeSource, env,
  });
}

test('an ordinary source change runs the change proof', () => {
  assert.deepEqual(decide(), {mode: PROOF_MODE.CHANGE_PROOF, reasons: []});
  assert.equal(decide({kind: SELECTION_PRECISE, changedPaths: ['docs/x.md']})
    .mode, PROOF_MODE.CHANGE_PROOF);
});

test('the operator can ask for the whole corpus', () => {
  const decision = decide({}, {[PUSH_FULL_CORPUS_ENV]: '1'});
  assert.equal(decision.mode, PROOF_MODE.FULL_CORPUS);
  assert.match(decision.reasons[0], new RegExp(PUSH_FULL_CORPUS_ENV));
});

test('a refused selection runs the whole corpus, never nothing', () => {
  const decision = decide({
    kind: SELECTION_REFUSED, refusalCode: REFUSAL_UNKNOWN_SCOPE,
    refusals: ['SAFE TEST SCOPE UNKNOWN'], selectedCount: 0,
  });
  assert.equal(decision.mode, PROOF_MODE.FULL_CORPUS);
  assert.deepEqual(decision.reasons,
    [`selection refused: ${REFUSAL_UNKNOWN_SCOPE}`]);
});

test('a change to the selection machinery, runner, curated state or hook runs the whole corpus', () => {
  for (const file of TRIGGERING_FILES) {
    assert.ok(fs.existsSync(file), `${file} is a real file`);
    assert.equal(fullCorpusTriggers([file]).length, 1,
      `${file} triggers exactly one rule`);
    assert.equal(decide({changedPaths: [ORDINARY_SOURCE, file]}).mode,
      PROOF_MODE.FULL_CORPUS);
  }
  for (const file of ORDINARY_FILES) {
    assert.deepEqual(fullCorpusTriggers([file]), [], `${file} is ordinary`);
  }
  const hitRules = new Set(fullCorpusTriggers([...TRIGGERING_FILES])
    .map((reason) => reason.split(':')[0]));
  for (const rule of FULL_CORPUS_TRIGGER_RULES) {
    assert.ok(hitRules.has(`changed ${rule.id}`),
      `rule ${rule.id} matches a real file`);
  }
});

test('a cone above half the corpus runs the whole corpus', () => {
  const limit = CORPUS_SIZE * FULL_CORPUS_SHARE;
  const large = planOf().tests.slice(0, 1);
  while (large.length <= limit) large.push({path: `t${large.length}`, reasons: ['r']});
  const decision = decide({tests: large, selectedCount: large.length - SPINE_COUNT});
  assert.equal(decision.mode, PROOF_MODE.FULL_CORPUS);
  assert.match(decision.reasons[0], /cone is 1001 of 2000/u);
  assert.equal(decide({tests: large.slice(0, limit)}).mode,
    PROOF_MODE.CHANGE_PROOF, 'exactly half is still a saving');
});

test('a proof range that is only the working tree runs the whole corpus', () => {
  assert.equal(decide({}, ENV_UNSET, RANGE_SOURCE.WORKTREE).mode,
    PROOF_MODE.FULL_CORPUS);
  assert.equal(decide({}, ENV_UNSET, RANGE_SOURCE.PUBLICATION).mode,
    PROOF_MODE.CHANGE_PROOF);
});

test('the gate is wired to the decision', () => {
  const manifest = JSON.parse(fs.readFileSync(POSTPUSH_MANIFEST, UTF8));
  const last = manifest.commands[manifest.commands.length - 1];
  assert.equal(last.executable, 'node');
  assert.deepEqual(last.argv, [CHANGE_PROOF_SCRIPT],
    'the post-push manifest ends in the change proof');
  for (const command of manifest.commands) {
    for (const argument of command.argv) {
      assert.doesNotMatch(argument, /^test:(fast|all)$/u,
        `${command.id} must not run a corpus script unconditionally`);
    }
  }
  const hook = fs.readFileSync(PRE_PUSH_HOOK, UTF8);
  assert.match(hook, /export LAGRANGE_CHECK_BASE="\$\{MAIN_REMOTE_SHA\}"/u,
    'the hook feeds the remote sha of main as the proof base');
  assert.match(hook, /push-gate-corpus-worktree\.js --in-place/u,
    'inside the exact-HEAD worktree the ratchets run in place');
  assert.match(hook, /test:gate:postpush/u);
});

test('the stage explains its decision without running a test', () => {
  const result = spawnSync(process.execPath, [CHANGE_PROOF_SCRIPT, '--explain'],
    {encoding: UTF8, env: {...process.env, LAGRANGE_CHECK_BASE: 'HEAD'}});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /proof range: HEAD \(environment\)/u);
  assert.match(result.stdout, /test stage: (change-proof|full-corpus)/u);
});

// The gate must not be proved by the thing a change altered: every repository
// module the gate's entry points import, transitively, must trip a full-corpus
// trigger. Derived from the sources here (static import specifiers, relative
// only), so the trigger list cannot drift away from the gate's real closure.
const GATE_ENTRY_POINTS = Object.freeze([
  'scripts/checks/push-gate-change-proof.js',
  'scripts/select-change-tests.js',
  'scripts/run-classified-test-files.js',
  'scripts/run-test-files.js',
  'scripts/plan-test-lane.js',
  'scripts/check-subsystem.js',
  'scripts/generate-test-primary-classes.js',
  'scripts/generate-test-resource-classes.js',
  'scripts/generate-test-subsystem-classes.js',
  // The scheduler that launches the proof and hands it its environment.
  'scripts/run-project-hardening-acceptance.js',
  'scripts/checks/acceptance-proof-manifest-runner.js',
]);
// `from './x'`, `import('./x')` and the bare side-effect `import './x'`.
const IMPORT_SPECIFIER_PATTERN =
  /(?:from\s*|import\s*\(\s*|import\s*)['"](\.{1,2}\/[^'"]+)['"]/gu;

function gateImportClosure() {
  const closure = new Set();
  const frontier = [...GATE_ENTRY_POINTS];
  while (frontier.length > 0) {
    const current = frontier.pop();
    if (closure.has(current)) continue;
    closure.add(current);
    const source = fs.readFileSync(current, UTF8);
    for (const match of source.matchAll(IMPORT_SPECIFIER_PATTERN)) {
      const resolved = path.posix.normalize(
        path.posix.join(path.posix.dirname(current), match[1]));
      if (fs.existsSync(resolved)) frontier.push(resolved);
    }
  }
  return [...closure].sort();
}

test('every module in the gate\'s own import closure trips a full-corpus trigger', () => {
  const closure = gateImportClosure();
  assert.ok(closure.length > GATE_ENTRY_POINTS.length,
    'the closure reaches beyond the entry points');
  const untriggered = closure.filter((file) =>
    fullCorpusTriggers([file]).length === 0);
  assert.deepEqual(untriggered, [],
    'a change here would select, schedule or execute its own proof');
});
