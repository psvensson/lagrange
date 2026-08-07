#!/usr/bin/env node
// Scenario runner for the impact-graph-proof-cone-owner Quest (V4a).
// Proves the sealed result: the selector selects by static + coverage +
// contract edges, escalation tiers fail closed (selector self-change, core
// metadata, unknown paths, stale coverage), the safety floor always runs,
// and the rationale receipt binds the exact inputs.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  classifyChangedPath,
  selectProofCone,
} from './checks/impact-proof-cone.js';
import {
  CALL_CELL_NAME_FRAGMENT,
  CONTRACT_PARTITION_TOPOLOGY,
  OUTCOME_FAIL,
  OUTCOME_PASS,
  PROBLEM_JOIN_SEPARATOR,
  PROOF_CONE_CONTRACTS_PATH,
  PROOF_CONE_COVERAGE_PATH,
  RUNTIME_NAME_FRAGMENT,
  SELECTION_CHANGED_TEST,
  SELECTION_SAFETY_FLOOR,
  STALE_DIGEST_FORGE,
  TAP_NOT_OK,
  TAP_OK,
  TOPOLOGY_TEST_PREFIX,
  PROOF_CONE_SCENARIO,
  REPORTS_DIRECTORY,
  TIER_CORE_METADATA,
  TIER_DOCUMENTATION,
  TIER_LEAF_IMPLEMENTATION,
  TIER_OWNER_BOUNDARY,
  TIER_PROTOCOL_SHAPE,
  TIER_SELECTOR_SELF,
  TIER_UNKNOWN,
  VERDICT_FAIL,
  VERDICT_PASS,
  VERDICT_REASON_ALL_PASS,
  VERDICT_REASON_CHECK_FAILED,
} from './checks/impact-proof-cone-constants.js';
import {
  PRIMARY_CLASS_MANIFEST_PATH,
  loadManifest,
} from './checks/test-primary-classification.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportDir = path.join(root, REPORTS_DIRECTORY);

const LABEL_TIER_CLASSIFICATION = 'escalation-tier-classification';
const LABEL_STATIC_EDGE = 'static-edge-selects-dependents';
const LABEL_COVERAGE_EDGE = 'coverage-edge-selects-observed';
const LABEL_CONTRACT_EDGE = 'contract-edge-selects-claimants';
const LABEL_SAFETY_FLOOR = 'safety-floor-always-present';
const LABEL_SELF_CHANGE_FULL = 'selector-self-change-forces-full-suite';
const LABEL_CORE_METADATA_FULL = 'core-metadata-forces-full-suite';
const LABEL_UNKNOWN_FULL = 'unknown-path-forces-full-suite';
const LABEL_STALE_COVERAGE_WIDENS = 'stale-coverage-widens';
const LABEL_RECEIPT_RATIONALE = 'receipt-binds-inputs';
const LABEL_DEAD_CONTRACT_FAILS = 'dead-contract-edge-fails-closed';
const LABEL_DOCUMENTATION_TIER = 'documentation-tier-is-narrow';

const CHANGED_LEAF = 'src/runtime/call-cell-value-mapping.js';
const CHANGED_CONTRACT_OWNER = 'src/rebalancer/placement-owner-decision.js';
const CHANGED_TEST = 'test/service/call-cell-batch-executor.test.js';
const SELF_CHANGE_PATH = 'scripts/run-test-files.js';
const CORE_METADATA_PATH = 'src/raft/raft-node.js';
const UNKNOWN_PATH = 'substrate.toml';
const DOC_PATH = 'docs/steering/llm/core.md';
const WIT_PATH = 'wit/world.wit';
const SAFETY_FLOOR_SAMPLE = 'test/closure/CL-040.repro.test.js';
const LIST_JOIN = ',';
const COVERAGE_STATE_STALE_WORD = 'stale';
const SELECTOR_VERSION_PIN = 'proof-cone-selector/1';
const ERR_STATIC_EMPTY = 'static edge selected nothing';
const ERR_STATIC_MISS = 'static edge did not select dependent runtime/call-cell tests';
const ERR_COVERAGE_EMPTY = 'coverage edge selected nothing';
const ERR_CONTRACT_EMPTY = 'contract edge selected nothing';
const ERR_CONTRACT_MISS = 'contract edge did not select topology claimant tests';
const ERR_FLOOR_EMPTY = 'safety floor is empty';
const ERR_SELF_NOT_FULL = 'selector self-change did not force full suite';
const ERR_FULL_NOT_CENSUS = 'full suite is not the complete census';
const ERR_RAFT_NOT_FULL = 'raft change did not force full suite';
const ERR_WIT_NOT_FULL = 'wit change did not force full suite';
const DETAIL_CORE_FULL = 'raft and wit changes both force the full suite';
const ERR_UNKNOWN_NOT_FULL = 'unknown path did not force full suite';
const ERR_UNKNOWN_UNNAMED = 'unknown path was not named in the problems';
const ERR_STALE_NOT_FULL = 'stale coverage did not widen to full suite';
const ERR_STALE_UNNAMED = 'staleness was not named in the problems';
const DETAIL_STALE_WIDENS = 'stale coverage widened to the full suite instead of narrowing';
const ERR_NO_VERSION = 'receipt lacks the selector version pin';
const ERR_NO_CENSUS_DIGEST = 'receipt lacks the census digest';
const ERR_NO_GRAPH_DIGEST = 'receipt lacks the import-graph digest';
const ERR_NO_CHANGED_TEST = 'receipt lacks the changed test';
const ERR_CHANGED_NOT_COUNTED = 'changed test itself not selected';
const ERR_CHANGED_NOT_SELECTED = 'changed test is not in the selected set';
const ERR_DOC_FULL = 'documentation change forced full suite';
const ERR_DOC_NOT_FLOOR_ONLY = 'expected only the safety floor';
const DETAIL_RECEIPT_BINDS = 'receipt binds digests (census=';
const DETAIL_CHANGED_TEST_SELECTED = ') and selects the changed test itself';
const GHOST_OWNER_PATH = 'src/ghost-nowhere/';
const ERR_DEAD_NOT_FULL = 'dead contract edge did not force full suite';
const ERR_DEAD_UNNAMED = 'dead contract edge was not named in the problems';
const DETAIL_DEAD_FAILS = 'dead contract owner path widened to the full suite';

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

checks.push(check(LABEL_TIER_CLASSIFICATION, () => {
  const cases = [
    [DOC_PATH, TIER_DOCUMENTATION],
    [SELF_CHANGE_PATH, TIER_SELECTOR_SELF],
    [CORE_METADATA_PATH, TIER_CORE_METADATA],
    [WIT_PATH, TIER_CORE_METADATA],
    [CHANGED_LEAF, TIER_LEAF_IMPLEMENTATION],
    [CHANGED_TEST, TIER_LEAF_IMPLEMENTATION],
    [UNKNOWN_PATH, TIER_UNKNOWN],
    ['proto/envelope.proto', TIER_PROTOCOL_SHAPE],
    ['src/index.js', TIER_OWNER_BOUNDARY],
    ['src/public-api.js', TIER_OWNER_BOUNDARY],
  ];
  for (const [changedPath, expected] of cases) {
    const actual = classifyChangedPath(changedPath, []);
    assert(actual === expected, `${changedPath}: expected ${expected}, got ${actual}`);
  }
  const witDoc = classifyChangedPath('docs/guide.wit', []);
  assert(witDoc === TIER_DOCUMENTATION, `docs .wit: expected ${TIER_DOCUMENTATION}, got ${witDoc}`);
  return `${cases.length + 1} tier classifications correct`;
}));

checks.push(check(LABEL_STATIC_EDGE, () => {
  const {selection} = selectProofCone(root, [CHANGED_LEAF]);
  assert(!selection.fullSuite, `unexpected full suite: ${selection.problems.join(PROBLEM_JOIN_SEPARATOR)}`);
  assert(selection.counts.static > 0, ERR_STATIC_EMPTY);
  assert(selection.rationale.static.some((testPath) =>
    testPath.includes(CALL_CELL_NAME_FRAGMENT) || testPath.includes(RUNTIME_NAME_FRAGMENT)),
  ERR_STATIC_MISS);
  return `static edge selected ${selection.counts.static} dependent test(s)`;
}));

checks.push(check(LABEL_COVERAGE_EDGE, () => {
  const {selection} = selectProofCone(root, [CHANGED_LEAF]);
  assert(!selection.fullSuite, `unexpected full suite: ${selection.problems.join(PROBLEM_JOIN_SEPARATOR)}`);
  assert(selection.counts.coverage > 0, ERR_COVERAGE_EMPTY);
  assert(selection.rationale.coverage.includes(CHANGED_TEST),
    `coverage edge missed the observed executor ${CHANGED_TEST}`);
  return `coverage edge selected ${selection.counts.coverage} observed test(s)`;
}));

checks.push(check(LABEL_CONTRACT_EDGE, () => {
  const {selection} = selectProofCone(root, [CHANGED_CONTRACT_OWNER]);
  assert(!selection.fullSuite, `unexpected full suite: ${selection.problems.join(PROBLEM_JOIN_SEPARATOR)}`);
  assert(selection.counts.contract > 0, ERR_CONTRACT_EMPTY);
  assert(selection.changedContracts.includes(CONTRACT_PARTITION_TOPOLOGY),
    `expected partition-topology contract, got ${selection.changedContracts.join(LIST_JOIN)}`);
  assert(selection.rationale.contract.some((testPath) =>
    testPath.startsWith(TOPOLOGY_TEST_PREFIX)),
  ERR_CONTRACT_MISS);
  return `contract edge selected ${selection.counts.contract} claimant test(s) ` +
    `via ${selection.changedContracts.join(LIST_JOIN)}`;
}));

checks.push(check(LABEL_SAFETY_FLOOR, () => {
  const {selection} = selectProofCone(root, [CHANGED_LEAF]);
  assert(selection.counts[SELECTION_SAFETY_FLOOR] > 0, ERR_FLOOR_EMPTY);
  assert(selection.selectedTests.includes(SAFETY_FLOOR_SAMPLE),
    `safety floor test ${SAFETY_FLOOR_SAMPLE} not selected`);
  return `safety floor contributes ${selection.counts[SELECTION_SAFETY_FLOOR]} test(s) on every selection`;
}));

checks.push(check(LABEL_SELF_CHANGE_FULL, () => {
  const {selection} = selectProofCone(root, [SELF_CHANGE_PATH]);
  assert(selection.fullSuite, ERR_SELF_NOT_FULL);
  const primary = loadManifest(root, PRIMARY_CLASS_MANIFEST_PATH);
  assert(selection.selectedTests.length === primary.manifest.censusSize,
    ERR_FULL_NOT_CENSUS);
  return `self-change selected all ${selection.selectedTests.length} tests`;
}));

checks.push(check(LABEL_CORE_METADATA_FULL, () => {
  const raft = selectProofCone(root, [CORE_METADATA_PATH]);
  assert(raft.selection.fullSuite, ERR_RAFT_NOT_FULL);
  const wit = selectProofCone(root, [WIT_PATH]);
  assert(wit.selection.fullSuite, ERR_WIT_NOT_FULL);
  return DETAIL_CORE_FULL;
}));

checks.push(check(LABEL_UNKNOWN_FULL, () => {
  const {selection, problems} = selectProofCone(root, [UNKNOWN_PATH]);
  assert(selection.fullSuite, ERR_UNKNOWN_NOT_FULL);
  assert(problems.some((problem) => problem.includes(UNKNOWN_PATH)),
    ERR_UNKNOWN_UNNAMED);
  return `unknown path fails closed: ${problems[0]}`;
}));

checks.push(check(LABEL_STALE_COVERAGE_WIDENS, () => {
  const snapshot = JSON.parse(
    fs.readFileSync(path.join(root, PROOF_CONE_COVERAGE_PATH), 'utf8'));
  snapshot.sourceDigest = STALE_DIGEST_FORGE;
  const tempPath = path.join(root, PROOF_CONE_COVERAGE_PATH);
  const original = fs.readFileSync(tempPath, 'utf8');
  fs.writeFileSync(tempPath, JSON.stringify(snapshot));
  try {
    const {selection, problems} = selectProofCone(root, [CHANGED_LEAF]);
    assert(selection.fullSuite, ERR_STALE_NOT_FULL);
    assert(problems.some((problem) => problem.includes(COVERAGE_STATE_STALE_WORD)),
      ERR_STALE_UNNAMED);
    return DETAIL_STALE_WIDENS;
  } finally {
    fs.writeFileSync(tempPath, original);
  }
}));

checks.push(check(LABEL_RECEIPT_RATIONALE, () => {
  const {selection} = selectProofCone(root, [CHANGED_LEAF, CHANGED_TEST]);
  assert(selection.selectorVersion === SELECTOR_VERSION_PIN,
    ERR_NO_VERSION);
  assert(selection.inputs.primaryClassDigest, ERR_NO_CENSUS_DIGEST);
  assert(selection.inputs.importGraphDigest, ERR_NO_GRAPH_DIGEST);
  assert(selection.changedPaths.includes(CHANGED_TEST), ERR_NO_CHANGED_TEST);
  assert(selection.counts[SELECTION_CHANGED_TEST] >= 1, ERR_CHANGED_NOT_COUNTED);
  assert(selection.selectedTests.includes(CHANGED_TEST),
    ERR_CHANGED_NOT_SELECTED);
  return DETAIL_RECEIPT_BINDS + selection.inputs.primaryClassDigest +
    DETAIL_CHANGED_TEST_SELECTED;
}));

checks.push(check(LABEL_DEAD_CONTRACT_FAILS, () => {
  const contractsPath = path.join(root, PROOF_CONE_CONTRACTS_PATH);
  const original = fs.readFileSync(contractsPath, 'utf8');
  const forged = JSON.parse(original);
  forged.contracts[CONTRACT_PARTITION_TOPOLOGY].owners.push(GHOST_OWNER_PATH);
  fs.writeFileSync(contractsPath, JSON.stringify(forged, null, 2));
  try {
    const {selection, problems} = selectProofCone(root, [CHANGED_CONTRACT_OWNER]);
    assert(selection.fullSuite, ERR_DEAD_NOT_FULL);
    assert(problems.some((problem) => problem.includes(GHOST_OWNER_PATH)),
      ERR_DEAD_UNNAMED);
    return DETAIL_DEAD_FAILS;
  } finally {
    fs.writeFileSync(contractsPath, original);
  }
}));

checks.push(check(LABEL_DOCUMENTATION_TIER, () => {
  const {selection} = selectProofCone(root, [DOC_PATH]);
  assert(!selection.fullSuite, ERR_DOC_FULL);
  assert(selection.escalation === TIER_DOCUMENTATION,
    `expected documentation tier, got ${selection.escalation}`);
  assert(selection.counts.uniqueSelected === selection.counts[SELECTION_SAFETY_FLOOR],
    `documentation tier selected ${selection.counts.uniqueSelected} tests; ` +
    ERR_DOC_NOT_FLOOR_ONLY);
  return `documentation tier runs only the ${selection.counts[SELECTION_SAFETY_FLOOR]}-test safety floor`;
}));

const failed = checks.filter((entry) => !entry.passed).length;
const passed = failed === 0;
const report = {
  timestamp: new Date().toISOString(),
  scenario: PROOF_CONE_SCENARIO,
  summary: {total: checks.length, passed: checks.length - failed, failed},
  optimizationSummary: {totalPriorityItems: failed},
  standardSummary: {
    scenarios: [{
      scenario: PROOF_CONE_SCENARIO,
      passed,
      current: {
        passed,
        verdict: passed ? VERDICT_PASS : VERDICT_FAIL,
        verdictReason: passed ? VERDICT_REASON_ALL_PASS : VERDICT_REASON_CHECK_FAILED,
      },
      detail: {checks},
    }],
  },
};

fs.mkdirSync(reportDir, {recursive: true});
const reportPath = path.join(
  reportDir,
  `${PROOF_CONE_SCENARIO}-${report.timestamp.replace(/[:.]/g, '-')}.report.json`);
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`${passed ? OUTCOME_PASS : OUTCOME_FAIL} ${PROOF_CONE_SCENARIO}: ` +
  `${checks.length - failed}/${checks.length} checks`);
for (const entry of checks) {
  console.log(`  ${entry.passed ? TAP_OK : TAP_NOT_OK} ${entry.label} - ${entry.detail}`);
}
console.log(`report: ${path.relative(root, reportPath)}`);
process.exitCode = passed ? 0 : 1;
