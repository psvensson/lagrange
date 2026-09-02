import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {preflightReport, renderPreflightReport}
  from '../../scripts/solve/preflight.js';
import {runStep} from '../../scripts/solve/step.js';
import {appendFinding, readLog, saveQuest} from '../../scripts/solve/store.js';
import {verificationState} from '../../scripts/solve/verification.js';

// Preflight is the batch read-only landing diagnostic: one invocation
// reports EVERY standing refusal (audit, union guard, untracked intent,
// stale generated outputs, oversized files) instead of the land verb's
// stop-at-first-gate discovery loop, and appends no log event.

const TMP_PREFIX = 'solver-preflight-';
const QUEST_ID = 'preflight-fixture';
const FRONTIER_ID = `${QUEST_ID}-main`;
const SOURCE_A = 'src/a.js';
const SOURCE_B = 'src/b.js';
const SOURCE_A_BASE = 'export const a = 1;\n';
const SOURCE_B_BASE = 'export const b = 1;\n';
const SOURCE_A_CANDIDATE = 'export const a = 2;\n';
const SOURCE_B_UNCOVERED = 'export const b = 2;\n';
const UNTRACKED_FILE = 'src/new-helper.js';
const UNTRACKED_CONTENT = 'export const helper = true;\n';
const SEAL_PATH = 'test/shards/impact-graph-seal.json';
const SEAL_GENERATOR = 'scripts/generate-global-owner-debt-inventory.js';
const STALE_SEAL = `${JSON.stringify(
  {schemaVersion: 1, snapshotDigest: 'stale-by-hand'}, null, 2)}\n`;
const IMPACT_REGISTRY_PATH = 'test/shards/impact-contracts.json';
const ORACLE_GREEN = {metric: 0, target: 0};
const ORACLE_OPEN = {metric: 2, target: 0};
const VERIFICATION_SCHEMA_VERSION = 2;
const AGGREGATE_SCOPE = 'aggregate';
const VERIFIER_APPROVAL = 'verifier-approval';
const VERIFIER_EVIDENCE = 'subagent:preflight-verifier';
const TEXT_ENCODING = 'utf8';
const GIT_DIFF_ARGUMENTS = Object.freeze([
  'diff', '--binary', '--full-index', '--no-ext-diff', 'HEAD', '--',
]);

// Deterministic seal producer: a digest projection of src/ + scripts/.
const SEAL_GENERATOR_SOURCE = [
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
  `const seal = path.join(root, ${JSON.stringify(SEAL_PATH)});`,
  'fs.mkdirSync(path.dirname(seal), {recursive: true});',
  'fs.writeFileSync(seal, JSON.stringify(',
  '  {schemaVersion: 1, snapshotDigest: hash.digest(\'hex\')}, null, 2)',
  '  + \'\\n\');',
  '',
].join('\n');

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

function fixture(t, contractVersion = VERIFICATION_SCHEMA_VERSION) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), TMP_PREFIX));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'solver@example.com']);
  git(root, ['config', 'user.name', 'Solver']);
  git(root, ['config', 'commit.gpgsign', 'false']);
  writeFile(root, SOURCE_A, SOURCE_A_BASE);
  writeFile(root, SOURCE_B, SOURCE_B_BASE);
  writeFile(root, SEAL_GENERATOR, SEAL_GENERATOR_SOURCE);
  writeFile(root, IMPACT_REGISTRY_PATH, `${JSON.stringify({
    schemaVersion: 2, id: 'impact-contracts', description: 'fixture',
    contracts: {}, coupledPairs: {}}, null, 2)}\n`);
  execFileSync(process.execPath, [SEAL_GENERATOR],
    {cwd: root, stdio: ['ignore', 'ignore', 'pipe']});
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'base']);
  const oracleFile = path.join(root, 'solve', 'oracle', `${QUEST_ID}.json`);
  fs.mkdirSync(path.dirname(oracleFile), {recursive: true});
  fs.writeFileSync(oracleFile, JSON.stringify(ORACLE_OPEN));
  const metric = {probe: 'oracle', args: {file: oracleFile}};
  const quest = {
    id: QUEST_ID,
    authoringContractVersion: 1,
    verificationContractVersion: contractVersion,
    statement: 'The preflight fixture reaches zero.',
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

// A recorded, closed, aggregate-approved candidate on src/a.js.
function approvedCandidate(t, contractVersion = VERIFICATION_SCHEMA_VERSION) {
  const fx = fixture(t, contractVersion);
  assert.equal(runStep(fx.root, fx.quest).terminal, null);
  writeFile(fx.root, SOURCE_A, SOURCE_A_CANDIDATE);
  fs.writeFileSync(fx.oracleFile, JSON.stringify(ORACLE_GREEN));
  const changeRef = canonicalArtifact(fx.root, 'attempt-1', [SOURCE_A]);
  const recorded = runStep(fx.root, fx.quest, {changeRef, summary: 'record'});
  assert.equal(recorded.done, true);
  const state = verificationState(
    fx.root, fx.quest, readLog(fx.root, QUEST_ID));
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
  return fx;
}

function sectionByName(report, name) {
  const section = report.sections.find((entry) => entry.name === name);
  assert.ok(section, `report has a ${name} section`);
  return section;
}

test('preflight-clean-candidate-is-green: an approved candidate with no ' +
  'standing refusal reports ok', (t) => {
  const fx = approvedCandidate(t);
  const report = preflightReport(fx.root, fx.quest);
  assert.equal(report.ok, true, renderPreflightReport(fx.quest, report));
  assert.equal(report.problemCount, 0);
});

test('preflight-reports-every-problem-in-one-pass: an uncovered path, a ' +
  'hand-staled generated output and an untracked source file are all ' +
  'named by one invocation, and no log event is appended', (t) => {
  const fx = approvedCandidate(t);
  writeFile(fx.root, SOURCE_B, SOURCE_B_UNCOVERED);
  writeFile(fx.root, SEAL_PATH, STALE_SEAL);
  writeFile(fx.root, UNTRACKED_FILE, UNTRACKED_CONTENT);
  const logBefore = readLog(fx.root, QUEST_ID).length;
  const report = preflightReport(fx.root, fx.quest);
  assert.equal(report.ok, false);
  const union = sectionByName(report, 'landing-union');
  assert.ok(union.problems.some((problem) => problem.includes(SOURCE_B)),
    'the union section names the uncovered source path');
  const untracked = sectionByName(report, 'untracked-intent');
  assert.ok(untracked.problems.some(
    (problem) => problem.includes(UNTRACKED_FILE)),
  'the untracked section names the invisible file');
  const generated = sectionByName(report, 'generated-outputs');
  assert.ok(generated.problems.some(
    (problem) => problem.includes(SEAL_PATH)),
  'the generated section names the stale output');
  assert.equal(readLog(fx.root, QUEST_ID).length, logBefore,
    'preflight appends no log event');
  const rendered = renderPreflightReport(fx.quest, report);
  for (const named of [SOURCE_B, UNTRACKED_FILE, SEAL_PATH]) {
    assert.ok(rendered.includes(named), `rendered report names ${named}`);
  }
});

test('preflight-collateral-contract-outputs-informational: under the ' +
  'collateral contract a stale registered output is a note, never a ' +
  'problem', (t) => {
  const fx = approvedCandidate(t, VERIFICATION_SCHEMA_VERSION + 1);
  writeFile(fx.root, SEAL_PATH, STALE_SEAL);
  const report = preflightReport(fx.root, fx.quest);
  const generated = sectionByName(report, 'generated-outputs');
  assert.equal(generated.problems.length, 0,
    'collateral outputs never surface as preflight problems');
  assert.ok(generated.notes.length > 0,
    'the collateral rule is stated as a note');
  assert.equal(report.ok, true,
    renderPreflightReport(fx.quest, report));
});
