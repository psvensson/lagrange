import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {landQuestWorkflow} from '../../scripts/solve/operator-workflow.js';
import {runStep} from '../../scripts/solve/step.js';
import {appendFinding, readLog, saveQuest} from '../../scripts/solve/store.js';
import {verificationState} from '../../scripts/solve/verification.js';

// Deterministic witness for the solver-land-generated-output-coverage quest:
// the exact 2026-08-30 landing sequence (verified on 81c30686e,
// solver-land-recorded-attempt-union-guard) driven through the REAL landing
// path (landQuestWorkflow -> union guard -> autoCommitQuest -> inventory
// refresh -> commit gate audit -> commit) on a temporary Git repository.
//
// The incident: the landing's own inventory refresh (handoff.js, run inside
// the final commit step) rewrote the tracked test/shards/impact-graph-seal.json
// AFTER the top-of-land union guard and BEFORE the commit gate's audit, so
// the audit's union guard found the seal dirty outside the recorded union
// and `land` reported committed: no (commit-gate); the operator restored the
// seal by hand and ran land a second time. The cure keeps the step order and
// the guard's semantics: a REGISTERED generated output (the classification
// manifests and the seal, generated-dependencies.js) is covered when, and
// only when, it is byte-identical to a fresh regeneration from the exact
// candidate; anything else stays an uncovered path and blocks as before.
//
// The fixture stages compatibility producers at the registered argv paths
// (the pattern of test/solve/handoff.test.js and operator-workflow.test.js):
// deterministic projections of the tree, so "fresh regeneration from the
// candidate" is a genuine byte comparison and the landing's own refresh
// rewrites the seal exactly as the real --refresh fallback does.
//
// Every scenario name below is anchored to one sealed receipt id so the
// evidence harness selects it with --test-name-pattern.

const TMP_PREFIX = 'solver-land-generated-output-';
const QUEST_ID = 'generated-output-land';
const FRONTIER_ID = `${QUEST_ID}-main`;
const SOURCE_A = 'src/a.js';
const SOURCE_B = 'src/b.js';
const SOURCE_A_BASE = 'export const a = 1;\n';
const SOURCE_B_BASE = 'export const b = 1;\n';
const SOURCE_A_CANDIDATE = 'export const a = 2;\n';
const SOURCE_B_UNCOVERED = 'export const b = 2;\n';
const NEW_TEST = 'test/new.test.js';
const NEW_TEST_CONTENT = 'export const witness = true;\n';
const SEAL_PATH = 'test/shards/impact-graph-seal.json';
const CLASSIFICATION_MANIFESTS = Object.freeze([
  'test/shards/primary-classes.json',
  'test/shards/resource-classes.json',
  'test/shards/subsystem-classes.json',
]);
const GLOBAL_INVENTORY =
  'solve/changes/global-owner-debt-inventory/inventory.json';
const PRIORITY_INVENTORY =
  'solve/changes/priority-recovery-owner-inventory/inventory.json';
const GLOBAL_GENERATOR = 'scripts/generate-global-owner-debt-inventory.js';
const PRIORITY_GENERATOR = 'scripts/generate-priority-recovery-owner-inventory.js';
const CLASSIFICATION_GENERATORS = Object.freeze([
  ['scripts/generate-test-primary-classes.js', CLASSIFICATION_MANIFESTS[0]],
  ['scripts/generate-test-resource-classes.js', CLASSIFICATION_MANIFESTS[1]],
  ['scripts/generate-test-subsystem-classes.js', CLASSIFICATION_MANIFESTS[2]],
]);
const IMPACT_REGISTRY_PATH = 'test/shards/impact-contracts.json';
const IMPACT_REGISTRY = {
  schemaVersion: 2,
  id: 'impact-contracts',
  description: 'generated output coverage fixture registry',
  contracts: {},
  coupledPairs: {},
};
const STALE_SEAL = `${JSON.stringify(
  {schemaVersion: 1, snapshotDigest: 'stale-by-hand'}, null, 2)}\n`;
const ORACLE_GREEN = {metric: 0, target: 0};
const ORACLE_OPEN = {metric: 2, target: 0};
const UNCOVERED_CODE = 'blocked-uncovered-source-paths';
const SKIP_COMMIT_GATE = 'commit-gate';
const VERDICT_APPROVE = 'approve';
const VERDICT_NOT_REQUIRED = 'not-required';
const VERIFIER_APPROVAL = 'verifier-approval';
const VERIFIER_EVIDENCE = 'subagent:generated-output-verifier';
const VERIFICATION_SCHEMA_VERSION = 2;
const AGGREGATE_SCOPE = 'aggregate';
const SOLVED_TERMINAL = 'solved';
const SOLVE_PREFIX = 'solve/';
const GIT_DIFF_ARGUMENTS = Object.freeze([
  'diff', '--binary', '--full-index', '--no-ext-diff', 'HEAD', '--',
]);
const TEXT_ENCODING = 'utf8';
const OUTCOME_BLOCKED_KIND = 'blocked';
const OUTCOME_LANDED_KIND = 'landed';

function gitRaw(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: TEXT_ENCODING,
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

function readFile(root, relative) {
  return fs.readFileSync(path.join(root, relative), TEXT_ENCODING);
}

// Compatibility producer for the global owner-debt inventory: the seal is a
// digest projection of every JavaScript file under src/ and scripts/ (the
// shape of the real seal: digests only, no wall-clock content); without
// --refresh-import-graph-only it also rewrites the tracked inventory, which
// is what the landing's own refresh runs.
const GLOBAL_GENERATOR_SOURCE = [
  'const fs = require(\'node:fs\');',
  'const path = require(\'node:path\');',
  'const crypto = require(\'node:crypto\');',
  'const root = process.cwd();',
  'function walk(directory, files) {',
  '  if (!fs.existsSync(directory)) return files;',
  '  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {',
  '    const file = path.join(directory, entry.name);',
  '    if (entry.isDirectory()) walk(file, files);',
  '    else if (entry.name.endsWith(\'.js\')) files.push(file);',
  '  }',
  '  return files;',
  '}',
  'const files = [...walk(path.join(root, \'src\'), []),',
  '  ...walk(path.join(root, \'scripts\'), [])].sort();',
  'const hash = crypto.createHash(\'sha256\');',
  'for (const file of files) {',
  '  hash.update(path.relative(root, file)).update(\'\\0\')',
  '    .update(fs.readFileSync(file));',
  '}',
  'const digest = hash.digest(\'hex\');',
  `const seal = path.join(root, ${JSON.stringify(SEAL_PATH)});`,
  'fs.mkdirSync(path.dirname(seal), {recursive: true});',
  'fs.writeFileSync(seal, JSON.stringify(',
  '  {schemaVersion: 1, snapshotDigest: digest}, null, 2) + \'\\n\');',
  'if (!process.argv.includes(\'--refresh-import-graph-only\')) {',
  `  const inventory = path.join(root, ${JSON.stringify(GLOBAL_INVENTORY)});`,
  '  fs.mkdirSync(path.dirname(inventory), {recursive: true});',
  '  fs.writeFileSync(inventory,',
  '    JSON.stringify({sourceDigest: digest}, null, 2) + \'\\n\');',
  '}',
  '',
].join('\n');

const PRIORITY_GENERATOR_SOURCE = [
  'const fs = require(\'node:fs\');',
  'const path = require(\'node:path\');',
  `const inventory = path.join(process.cwd(), ${JSON.stringify(PRIORITY_INVENTORY)});`,
  'fs.mkdirSync(path.dirname(inventory), {recursive: true});',
  'fs.writeFileSync(inventory, JSON.stringify({owners: []}, null, 2) + \'\\n\');',
  '',
].join('\n');

// Compatibility producer for one classification manifest: the sorted list
// of test files, a pure projection of the tree.
function classificationGeneratorSource(output) {
  return [
    'const fs = require(\'node:fs\');',
    'const path = require(\'node:path\');',
    'const root = process.cwd();',
    'function walk(directory, files) {',
    '  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {',
    '    const file = path.join(directory, entry.name);',
    '    if (entry.isDirectory()) walk(file, files);',
    '    else if (entry.name.endsWith(\'.test.js\')) {',
    '      files.push(path.relative(root, file));',
    '    }',
    '  }',
    '  return files;',
    '}',
    'const files = walk(path.join(root, \'test\'), []).sort();',
    `const output = path.join(root, ${JSON.stringify(output)});`,
    'fs.mkdirSync(path.dirname(output), {recursive: true});',
    'fs.writeFileSync(output, JSON.stringify({files}, null, 2) + \'\\n\');',
    '',
  ].join('\n');
}

function runGenerator(root, generator, extraArguments = []) {
  execFileSync(process.execPath, [generator, ...extraArguments], {
    cwd: root,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
}

function regenerateAll(root) {
  runGenerator(root, GLOBAL_GENERATOR);
  runGenerator(root, PRIORITY_GENERATOR);
  for (const [generator] of CLASSIFICATION_GENERATORS) {
    runGenerator(root, generator);
  }
}

// A temporary repository whose base commit holds two source files, the
// compatibility producers at the registered argv paths, and every generated
// output (seal, inventories, classification manifests) fresh for the base
// tree, so the only dirty generated bytes a landing sees are the ones its
// own candidate implies.
function fixture(oracle, t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), TMP_PREFIX));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'solver@example.com']);
  git(root, ['config', 'user.name', 'Solver']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  writeFile(root, SOURCE_A, SOURCE_A_BASE);
  writeFile(root, SOURCE_B, SOURCE_B_BASE);
  writeFile(root, GLOBAL_GENERATOR, GLOBAL_GENERATOR_SOURCE);
  writeFile(root, PRIORITY_GENERATOR, PRIORITY_GENERATOR_SOURCE);
  for (const [generator, output] of CLASSIFICATION_GENERATORS) {
    writeFile(root, generator, classificationGeneratorSource(output));
  }
  writeFile(root, IMPACT_REGISTRY_PATH,
    `${JSON.stringify(IMPACT_REGISTRY, null, 2)}\n`);
  regenerateAll(root);
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'base']);
  const oracleFile = path.join(root, 'solve', 'oracle', `${QUEST_ID}.json`);
  fs.mkdirSync(path.dirname(oracleFile), {recursive: true});
  fs.writeFileSync(oracleFile, JSON.stringify(oracle));
  const metric = {probe: 'oracle', args: {file: oracleFile}};
  const quest = {
    id: QUEST_ID,
    authoringContractVersion: 1,
    verificationContractVersion: VERIFICATION_SCHEMA_VERSION,
    statement: 'The generated output coverage fixture reaches zero.',
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
  writeFile(root, relative, gitRaw(root, [...GIT_DIFF_ARGUMENTS, ...paths]));
  return `diff:${relative}`;
}

function approveAggregate(fx) {
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
  return [...state.aggregate.paths].sort();
}

// A recorded, closed and aggregate-approved source attempt on src/a.js: the
// landing's own inventory refresh will rewrite the seal because the
// candidate changed a JavaScript source.
function approvedSourceCandidate(t) {
  const fx = fixture(ORACLE_OPEN, t);
  assert.equal(runStep(fx.root, fx.quest).terminal, null);
  writeFile(fx.root, SOURCE_A, SOURCE_A_CANDIDATE);
  fs.writeFileSync(fx.oracleFile, JSON.stringify(ORACLE_GREEN));
  const changeRef = canonicalArtifact(fx.root, 'attempt-1', [SOURCE_A]);
  const recorded = runStep(fx.root, fx.quest, {changeRef, summary: 'record a'});
  assert.equal(recorded.done, true, 'the recorded attempt closes the quest');
  const union = approveAggregate(fx);
  assert.deepEqual(union, [SOURCE_A]);
  assert.equal(git(fx.root, ['status', '--porcelain', '--', SEAL_PATH]), '',
    'the seal is clean before the landing runs its own refresh');
  return {fx, union};
}

// A recorded, closed and approved candidate that ADDS a test file, with the
// classification manifests regenerated by the operator (dirty, fresh).
function approvedTestCandidateWithFreshManifests(t) {
  const fx = fixture(ORACLE_OPEN, t);
  assert.equal(runStep(fx.root, fx.quest).terminal, null);
  writeFile(fx.root, NEW_TEST, NEW_TEST_CONTENT);
  git(fx.root, ['add', '-N', '--', NEW_TEST]);
  fs.writeFileSync(fx.oracleFile, JSON.stringify(ORACLE_GREEN));
  const changeRef = canonicalArtifact(fx.root, 'attempt-1', [NEW_TEST]);
  const recorded = runStep(fx.root, fx.quest, {changeRef, summary: 'add test'});
  assert.equal(recorded.done, true);
  const union = approveAggregate(fx);
  assert.deepEqual(union, [NEW_TEST]);
  for (const [generator] of CLASSIFICATION_GENERATORS) {
    runGenerator(fx.root, generator);
  }
  for (const manifest of CLASSIFICATION_MANIFESTS) {
    assert.match(git(fx.root, ['status', '--porcelain', '--', manifest]),
      /^ ?M /u, `${manifest} is dirty and fresh before landing`);
  }
  return {fx, union};
}

function committedFiles(root) {
  return git(root, ['show', '--name-only', '--format=', 'HEAD'])
    .split('\n').filter((line) => line.length > 0).sort();
}

function nonSolvePaths(paths) {
  return paths.filter((filePath) => !filePath.startsWith(SOLVE_PREFIX));
}

function landingOutcome(root) {
  try {
    const landed = landQuestWorkflow(root, {id: QUEST_ID});
    return {
      kind: OUTCOME_LANDED_KIND,
      verdict: landed.verdict,
      committed: landed.committed,
      skipped: landed.commit?.skipped || null,
      sealCommitted: landed.committed &&
        committedFiles(root).includes(SEAL_PATH),
    };
  } catch (error) {
    return {
      kind: OUTCOME_BLOCKED_KIND,
      code: error.code,
      uncoveredPaths: error.uncoveredPaths,
    };
  }
}

function assertBlockedNamingPaths(root, headBefore, paths, run) {
  assert.throws(run, (error) =>
    error.code === UNCOVERED_CODE &&
    JSON.stringify(error.uncoveredPaths) === JSON.stringify(paths) &&
    paths.every((filePath) => error.message.includes(filePath)),
  `land must refuse with the typed ${UNCOVERED_CODE} problem naming ${paths}`);
  assert.equal(git(root, ['rev-parse', 'HEAD']), headBefore,
    'a blocked landing commits nothing');
}

test('fresh-generated-seal-covered-at-land: the seal rewritten by the ' +
  'landing\'s own inventory refresh is covered and the first land commits ' +
  'instead of stopping at commit-gate', (t) => {
  const {fx} = approvedSourceCandidate(t);
  const headBefore = git(fx.root, ['rev-parse', 'HEAD']);
  const landed = landQuestWorkflow(fx.root, {id: QUEST_ID});
  assert.equal(landed.verdict, VERDICT_APPROVE);
  assert.notEqual(landed.commit?.skipped, SKIP_COMMIT_GATE,
    'the landing never stops at commit-gate on its own regenerated seal');
  assert.equal(landed.committed, true, 'the first land commits');
  assert.notEqual(git(fx.root, ['rev-parse', 'HEAD']), headBefore);
  assert.equal(git(fx.root, ['status', '--porcelain', '--', SEAL_PATH]), '',
    'no dirty seal is left behind for a hand checkout and a second land');
});

test('landing-commits-fresh-seal-with-union: the landing commit carries the ' +
  'recorded union plus the fresh seal, whose committed bytes equal a ' +
  'regeneration from the committed tree', (t) => {
  const {fx, union} = approvedSourceCandidate(t);
  const landed = landQuestWorkflow(fx.root, {id: QUEST_ID});
  assert.equal(landed.committed, true);
  const committed = committedFiles(fx.root);
  assert.deepEqual(nonSolvePaths(committed), [...union, SEAL_PATH].sort(),
    'outside solve/ the commit is exactly the union plus the fresh seal');
  const committedSeal = readFile(fx.root, SEAL_PATH);
  runGenerator(fx.root, GLOBAL_GENERATOR, ['--refresh-import-graph-only']);
  assert.equal(readFile(fx.root, SEAL_PATH), committedSeal,
    'the committed seal is byte-identical to a fresh regeneration');
  assert.equal(landed.commit.pushed, false, 'landing never pushes');
});

test('classification-manifest-fresh-covered: dirty classification manifests ' +
  'byte-identical to their regeneration from the candidate are covered ' +
  'and land with the union', (t) => {
  const {fx, union} = approvedTestCandidateWithFreshManifests(t);
  const landed = landQuestWorkflow(fx.root, {id: QUEST_ID});
  assert.equal(landed.verdict, VERDICT_APPROVE);
  assert.equal(landed.committed, true, 'the fresh manifests do not block');
  assert.deepEqual(nonSolvePaths(committedFiles(fx.root)),
    [...union, ...CLASSIFICATION_MANIFESTS].sort(),
    'the manifests ride the landing commit with the union');
});

test('stale-generated-output-stays-uncovered: a registered generated output ' +
  'whose bytes differ from a fresh regeneration blocks the landing with ' +
  'the typed problem naming it', (t) => {
  const {fx} = approvedSourceCandidate(t);
  writeFile(fx.root, SEAL_PATH, STALE_SEAL);
  const headBefore = git(fx.root, ['rev-parse', 'HEAD']);
  assertBlockedNamingPaths(fx.root, headBefore, [SEAL_PATH],
    () => landQuestWorkflow(fx.root, {id: QUEST_ID}));
  assert.equal(readFile(fx.root, SEAL_PATH), STALE_SEAL,
    'the block never rewrites the operator\'s bytes');
});

test('non-generated-uncovered-path-still-blocks-unchanged: a dirty source ' +
  'path outside the union blocks exactly as before, generated outputs or ' +
  'not', (t) => {
  const {fx} = approvedSourceCandidate(t);
  writeFile(fx.root, SOURCE_B, SOURCE_B_UNCOVERED);
  const headBefore = git(fx.root, ['rev-parse', 'HEAD']);
  assertBlockedNamingPaths(fx.root, headBefore, [SOURCE_B],
    () => landQuestWorkflow(fx.root, {id: QUEST_ID}));
});

test('evidence-only-landing-unchanged: a quest with no delta outside solve/ ' +
  'keeps its verdict not-required landing', (t) => {
  const fx = fixture(ORACLE_GREEN, t);
  assert.equal(runStep(fx.root, fx.quest).terminal, SOLVED_TERMINAL);
  const landed = landQuestWorkflow(fx.root, {id: QUEST_ID});
  assert.equal(landed.verdict, VERDICT_NOT_REQUIRED);
  assert.equal(landed.committed, true);
  assert.deepEqual(nonSolvePaths(committedFiles(fx.root)), [],
    'an evidence-only landing commits only solve/ artifacts');
});

test('witness-deterministic: two identical incident fixtures produce the ' +
  'identical landing outcome', (t) => {
  const first = landingOutcome(approvedSourceCandidate(t).fx.root);
  const second = landingOutcome(approvedSourceCandidate(t).fx.root);
  assert.deepEqual(first, second,
    'the landing outcome is a pure function of the recorded log and tree');
});
