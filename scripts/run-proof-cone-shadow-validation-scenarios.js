#!/usr/bin/env node
// Shadow-mode proof-cone validation (developer-velocity epic V4b).
//
// Replays historical Quest attempt diffs (content-addressed under
// solve/changes/<quest>/attempt-*.diff.json with gzipped unified diffs in
// solve/artifacts/sha256/) through the proof-cone selector WITHOUT changing
// any landing behavior, and proves the decisive safety properties:
//
//   1. Every replayed diff derives a deterministic selection receipt.
//   2. Contract recall: whenever a diff touches a contract-owning path, the
//      cone contains at least one claimant of that contract — zero misses.
//   3. Full-suite tiers (selector self-change, core metadata, unknown path)
//      select the complete census.
//   4. Synthetic mutation: for a changed production file with observed
//      coverage, a test covering it is inside its cone.
//
// A single contract-selection miss is a selector defect and fails the Quest.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import zlib from 'node:zlib';

import {
  buildContractIndexesForTest,
  selectProofCone,
} from './checks/impact-proof-cone.js';
import {
  FULL_SUITE_TIERS,
  PROOF_CONE_CONTRACTS_PATH,
  REPORTS_DIRECTORY,
  VERDICT_FAIL,
  VERDICT_PASS,
  VERDICT_REASON_ALL_PASS,
  VERDICT_REASON_CHECK_FAILED,
} from './checks/impact-proof-cone-constants.js';

const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const SHADOW_SCENARIO = 'proof-cone-shadow-validation';
const CHANGES_DIRECTORY = 'solve/changes';
const UTF8_ENCODING = 'utf8';
const DIFF_HEADER_PREFIX = 'diff --git a/';
const ATTEMPT_FILE_PATTERN = /^attempt-\d+\.diff\.json$/u;
const REPLAY_LIMIT = 250;
const TEST_FILE_SUFFIX = '.test.js';
const SOLVE_BOOKKEEPING_PREFIX = 'solve/';
const TEST_OUTPUT_PREFIX = 'test-output/';
const SRC_PREFIX = 'src/';

const NEWLINE_SEPARATOR = '\n';
const SPACE_SEPARATOR = ' ';
const LIST_JOIN = ', ';
const LABEL_CORPUS = 'replay-corpus-loaded';
const LABEL_REPLAY = 'shadow-replay-deterministic-selections';
const LABEL_CONTRACT_MISSES = 'zero-contract-selection-misses';
const LABEL_FULL_TIERS = 'full-suite-tiers-select-complete-census';
const LABEL_MUTATION = 'synthetic-mutation-covered-test-in-cone';
const MIN_CORPUS_SIZE = 100;
const MIN_SOURCE_TOUCHING = 50;
const MISS_SAMPLE_LIMIT = 5;
const MUTATION_SAMPLE_LIMIT = 50;
const TIER_UNKNOWN_WORD = 'unknown';
const DETAIL_FULL_TIERS = 'self-change, core metadata, and unknown path each select the complete census';
const ERR_NO_CONE_REPLAY = 'every replay escalated to full suite; cone path unexercised';
const ERR_NO_PRODUCTION_EDGES = 'coverage snapshot has no production edges';
const OUTCOME_PASS = 'PASS';
const OUTCOME_FAIL = 'FAIL';
const TAP_OK = 'ok';
const TAP_NOT_OK = 'not ok';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function changedPathsFromArtifact(artifactPath) {
  let descriptor;
  try {
    descriptor = JSON.parse(fs.readFileSync(artifactPath, UTF8_ENCODING));
  } catch {
    return null;
  }
  const objectPath = descriptor.objectPath;
  if (!objectPath) return null;
  const absolute = path.join(root, objectPath);
  if (!fs.existsSync(absolute)) return null;
  let content;
  try {
    content = zlib.gunzipSync(fs.readFileSync(absolute)).toString(UTF8_ENCODING);
  } catch {
    return null;
  }
  const changed = [];
  for (const line of content.split(NEWLINE_SEPARATOR)) {
    if (stringStartsWith(line, DIFF_HEADER_PREFIX)) {
      changed.push(line.slice(DIFF_HEADER_PREFIX.length).split(SPACE_SEPARATOR)[0]);
    }
  }
  return changed.length > 0 ? changed : null;
}

function collectReplayCorpus() {
  const changesRoot = path.join(root, CHANGES_DIRECTORY);
  const corpus = [];
  for (const questDir of fs.readdirSync(changesRoot).sort()) {
    const questPath = path.join(changesRoot, questDir);
    if (!fs.statSync(questPath).isDirectory()) continue;
    for (const entry of fs.readdirSync(questPath).sort()) {
      if (!ATTEMPT_FILE_PATTERN.test(entry)) continue;
      const changed = changedPathsFromArtifact(path.join(questPath, entry));
      if (changed) {
        corpus.push({quest: questDir, artifact: entry, changedPaths: changed});
      }
      if (corpus.length >= REPLAY_LIMIT) return corpus;
    }
  }
  return corpus;
}

// Only paths the selector is asked to reason about: source, scripts, tests,
// contracts, docs. Solver bookkeeping and derived output are excluded (they
// would force the unknown tier on every historical diff for the wrong
// reason).
function selectableChangedPaths(changedPaths) {
  return changedPaths.filter((changedPath) =>
    !stringStartsWith(changedPath, SOLVE_BOOKKEEPING_PREFIX) &&
    !stringStartsWith(changedPath, TEST_OUTPUT_PREFIX));
}

function contractClaimantPresent(selection, contractsForChanged, contractTests, classifiedTests) {
  for (const contract of contractsForChanged) {
    const claimants = contractTests.get(contract) || [];
    const hit = claimants.some((entry) => {
      if (stringEndsWith(entry, TEST_FILE_SUFFIX)) {
        return selection.selectedTests.includes(entry);
      }
      return selection.selectedTests.some((testPath) =>
        stringStartsWith(testPath, entry));
    });
    if (!hit && claimants.length > 0 &&
        claimants.some((entry) => classifiedTests.some((testPath) =>
          stringStartsWith(testPath, entry) || testPath === entry))) {
      return contract;
    }
  }
  return null;
}

function check(label, fn) {
  try {
    const detail = fn();
    return {label, passed: true, detail};
  } catch (error) {
    return {label, passed: false, detail: error.message};
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const checks = [];

const corpus = collectReplayCorpus();
const contractsManifest = JSON.parse(
  fs.readFileSync(path.join(root, PROOF_CONE_CONTRACTS_PATH), UTF8_ENCODING));
const contractIndexes = buildContractIndexesForTest(root, contractsManifest);

checks.push(check(LABEL_CORPUS, () => {
  assert(corpus.length >= MIN_CORPUS_SIZE, `corpus too small: ${corpus.length}`);
  const withSource = corpus.filter((entry) =>
    selectableChangedPaths(entry.changedPaths).some((changedPath) =>
      stringStartsWith(changedPath, SRC_PREFIX)));
  assert(withSource.length >= MIN_SOURCE_TOUCHING, `too few source-touching diffs: ${withSource.length}`);
  return `${corpus.length} historical attempt diffs loaded (${withSource.length} source-touching)`;
}));

checks.push(check(LABEL_REPLAY, () => {
  let replayed = 0;
  let fullSuiteCount = 0;
  let coneCount = 0;
  const fingerprints = new Set();
  for (const entry of corpus) {
    const selectable = selectableChangedPaths(entry.changedPaths);
    if (selectable.length === 0) continue;
    const first = selectProofCone(root, selectable);
    const second = selectProofCone(root, [...selectable].reverse());
    assert(
      JSON.stringify(first.selection.selectedTests) ===
      JSON.stringify(second.selection.selectedTests),
      `non-deterministic selection for ${entry.quest}/${entry.artifact}`);
    replayed += 1;
    if (first.selection.fullSuite) fullSuiteCount += 1; else coneCount += 1;
    fingerprints.add(`${entry.quest}:${first.selection.selectedTests.length}`);
  }
  assert(replayed >= MIN_CORPUS_SIZE, `too few replayable diffs: ${replayed}`);
  assert(coneCount > 0, ERR_NO_CONE_REPLAY);
  return `${replayed} diffs replayed deterministically ` +
    `(${coneCount} cones, ${fullSuiteCount} full-suite escalations)`;
}));

checks.push(check(LABEL_CONTRACT_MISSES, () => {
  const misses = [];
  let contractDiffs = 0;
  for (const entry of corpus) {
    const selectable = selectableChangedPaths(entry.changedPaths);
    if (selectable.length === 0) continue;
    const {selection} = selectProofCone(root, selectable);
    if (selection.fullSuite) continue;
    const contractsForChanged = selection.changedContracts || [];
    if (contractsForChanged.length === 0) continue;
    contractDiffs += 1;
    const classifiedTests = Object.keys(
      JSON.parse(fs.readFileSync(
        path.join(root, 'test/shards/primary-classes.json'), UTF8_ENCODING)).classes);
    const miss = contractClaimantPresent(
      selection, contractsForChanged, contractIndexes.contractTests, classifiedTests);
    if (miss) misses.push(`${entry.quest}:${miss}`);
  }
  assert(misses.length === 0,
    `contract selection misses: ${misses.slice(0, MISS_SAMPLE_LIMIT).join(LIST_JOIN)}`);
  return `${contractDiffs} contract-touching diffs replayed with zero selection misses`;
}));

checks.push(check(LABEL_FULL_TIERS, () => {
  const probes = [
    ['scripts/run-test-files.js'],
    ['src/raft/raft-node.js'],
    ['substrate-unknown.file'],
  ];
  for (const changed of probes) {
    const {selection} = selectProofCone(root, changed);
    assert(selection.fullSuite, `${changed[0]} did not escalate`);
    assert(selection.selectedTests.length === selection.counts.totalTests,
      `${changed[0]} full suite is not the complete census`);
    assert(FULL_SUITE_TIERS.includes(selection.escalation) ||
      selection.escalation === TIER_UNKNOWN_WORD,
    `${changed[0]} unexpected tier ${selection.escalation}`);
  }
  return DETAIL_FULL_TIERS;
}));

checks.push(check(LABEL_MUTATION, () => {
  // Revert-style proof: pretend a production file with observed coverage was
  // mutated; the test that covers it must be inside the cone.
  const coverage = JSON.parse(
    fs.readFileSync(path.join(root, 'test/shards/impact-coverage.json'), UTF8_ENCODING));
  const pairs = [];
  for (const [testPath, covered] of Object.entries(coverage.tests || {})) {
    for (const production of covered) {
      if (stringStartsWith(production, SRC_PREFIX)) pairs.push([production, testPath]);
    }
  }
  assert(pairs.length > 0, ERR_NO_PRODUCTION_EDGES);
  let verified = 0;
  for (const [production, testPath] of pairs.slice(0, MUTATION_SAMPLE_LIMIT)) {
    const {selection} = selectProofCone(root, [production]);
    if (selection.fullSuite) {
      verified += 1;
      continue;
    }
    assert(selection.selectedTests.includes(testPath),
      `mutation in ${production}: covering test ${testPath} not in cone`);
    verified += 1;
  }
  return `${verified} synthetic mutations: every covering test was inside its cone`;
}));

const failed = checks.filter((entry) => !entry.passed).length;
const passed = failed === 0;
const report = {
  timestamp: new Date().toISOString(),
  scenario: SHADOW_SCENARIO,
  summary: {total: checks.length, passed: checks.length - failed, failed},
  optimizationSummary: {totalPriorityItems: failed},
  standardSummary: {
    scenarios: [{
      scenario: SHADOW_SCENARIO,
      passed,
      current: {
        passed,
        verdict: passed ? VERDICT_PASS : VERDICT_FAIL,
        verdictReason: passed ? VERDICT_REASON_ALL_PASS : VERDICT_REASON_CHECK_FAILED,
      },
      detail: {checks, corpusSize: corpus.length},
    }],
  },
};

const reportDir = path.join(root, REPORTS_DIRECTORY);
fs.mkdirSync(reportDir, {recursive: true});
const reportPath = path.join(
  reportDir, `${SHADOW_SCENARIO}-${report.timestamp.replace(/[:.]/g, '-')}.report.json`);
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`${passed ? OUTCOME_PASS : OUTCOME_FAIL} ${SHADOW_SCENARIO}: ` +
  `${checks.length - failed}/${checks.length} checks`);
for (const entry of checks) {
  console.log(`  ${entry.passed ? TAP_OK : TAP_NOT_OK} ${entry.label} - ${entry.detail}`);
}
console.log(`report: ${path.relative(root, reportPath)}`);
process.exitCode = passed ? 0 : 1;
