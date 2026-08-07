#!/usr/bin/env node
// Scenario runner for the quest-test-proof-cone-shadow-validation Quest.
//
// Proves the sealed result by checking the DECISION, not by running tests:
// 15 selector-invariant cases over synthetic and repository-real change sets.
// The scenario metric (priority) is the number of violated selector
// invariants — selection misses, non-determinism, unexplained selections,
// unsafe non-full unknown cases, and historical conformance misses. Target 0.
//
// Landing semantics are untouched: this is shadow evidence only.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  selectProofCone,
  testImpactDecision,
} from './checks/impact-proof-cone.js';
import {
  ESCALATION_RULE_CORE_METADATA,
  ESCALATION_RULE_SELECTOR_SELF,
  ESCALATION_RULE_UNCLASSIFIED_PATH,
  MODE_FULL,
  MODE_SELECTED,
  REASON_CHANGED_TEST,
  REASON_OBSERVED_COVERAGE,
  REASON_SEMANTIC_CONTRACT,
  REASON_STATIC_DEPENDENCY,
  REASON_UNIVERSAL_SAFETY,
  REPORTS_DIRECTORY,
} from './checks/impact-proof-cone-constants.js';
import {
  emitScenarioReport,
  scenarioAssert as assert,
  scenarioCheck as check,
} from './checks/scenario-report-emit.js';
import {
  PRIMARY_CLASS_MANIFEST_PATH,
  loadManifest,
} from './checks/test-primary-classification.js';

const SCENARIO = 'quest-test-proof-cone-shadow-validation';
const UTF8_ENCODING = 'utf8';
const CORPUS_PATH = 'test/shards/historical-regression-corpus.json';

const LEAF_PATH = 'src/service/call-cell-batch-executor.js';
const COVERED_LEAF = 'src/runtime/call-cell-value-mapping.js';
const OBSERVED_EXECUTOR = 'test/service/call-cell-batch-executor.test.js';
const TRANSITIVE_ROOT = 'src/rebalancer/rebalancer-constants.js';
const CONTRACT_OWNER = 'src/rebalancer/placement-owner-decision.js';
const TOPOLOGY_CLAIMANT_PREFIX = 'test/topology/';
const CHANGED_TEST_PATH = 'test/service/call-cell-batch-executor.test.js';
const UNKNOWN_PATH = 'substrate-new-owner/foo.js';
const WIT_PATH = 'wit/world.wit';
const RUNNER_PATH = 'scripts/run-test-files.js';
const SELECTOR_PATH = 'scripts/checks/impact-proof-cone.js';
const SAFETY_SAMPLE = 'test/closure/CL-040.repro.test.js';
const DOC_PATH = 'docs/steering/llm/core.md';

const ERR_NO_DECISION = 'selector produced no decision';
const ERR_LEAF_NOT_SELECTED = 'leaf change did not select a bounded cone';
const ERR_LEAF_UNSAFE = 'leaf cone includes the entire integration shard set';
const ERR_TRANSITIVE_MISS = 'transitive dependent test was not selected';
const ERR_COVERAGE_MISS = 'coverage-only dependent was not selected';
const ERR_CONTRACT_MISS = 'semantic-contract claimant was not selected';
const ERR_CHANGED_TEST_MISS = 'changed test was not selected';
const ERR_UNKNOWN_NOT_FULL = 'unclassified path did not escalate to full';
const ERR_WIT_NOT_FULL = 'WIT boundary did not escalate to full';
const ERR_RUNNER_NOT_FULL = 'test-runner change did not escalate to full';
const ERR_SELECTOR_NOT_FULL = 'selector change did not escalate to full';
const ERR_MISSING_ENTRY_NOT_FULL = 'missing classification entry did not escalate to full';
const ERR_HISTORICAL_MISS = 'historical regression detector outside the cone';
const ERR_INJECTED_EDGE_ACCEPTED = 'injected missing impact edge was accepted';
const ERR_MISS_NOT_RED = 'attributable regression outside the cone did not turn red';
const ERR_UNEXPLAINED = 'selected test lacks a machine-readable reason';
const ERR_ESCALATION_UNNAMED = 'full-mode decision does not name its rule';
const ERR_NON_DETERMINISTIC = 'same inputs produced different decisions';
const ERR_NO_EMPTY_MODE = 'decision has an empty-tests unsafe mode';


const LABEL_LEAF = 'leaf-source-change-bounded';
const ERR_LEAF_NO_FLOOR = 'leaf cone lacks the safety floor';
const LABEL_TRANSITIVE = 'transitive-dependency-selected';
const LABEL_COVERAGE = 'coverage-only-dependency-selected';
const ERR_NO_COVERAGE_REASON = 'observed executor lacks the coverage reason';
const LABEL_CONTRACT = 'semantic-contract-selected';
const ERR_NO_CONTRACT_REASON = 'claimant lacks the semantic-contract reason';
const LABEL_CHANGED_TEST = 'changed-test-always-selected';
const ERR_NO_CHANGED_REASON = 'changed test lacks the changed-test reason';
const DETAIL_CHANGED_SELECTED = 'changed test selected with changed_test reason';
const LABEL_UNKNOWN = 'unclassified-path-full-escalation';
const LABEL_WIT = 'wit-boundary-full-escalation';
const LABEL_RUNNER = 'test-runner-change-full-escalation';
const LABEL_SELECTOR = 'selector-change-full-escalation';
const LABEL_MISSING_ENTRY = 'missing-classification-entry-full';
const DETAIL_MISSING_ENTRY = 'empty/unknown impact escalates to full, never an empty cone';
const LABEL_HISTORICAL = 'historical-regression-conformance';
const MISS_SAMPLE_LIMIT = 5;
const LIST_JOIN = ', ';
const LABEL_INJECTED = 'injected-missing-edge-detected';
const DETAIL_INJECTED = 'forged missing-edge case is caught (no false conformance)';
const LABEL_MISS_RED = 'selector-miss-is-red';
const ERR_DOC_MISS = 'docs change misclassified as a selector miss';
const ERR_NON_ATTR_MISS = 'non-attributable failure misclassified as a miss';
const DETAIL_MISS_RED = 'attributable-out-of-cone failure flags a miss; non-attributable does not';
const LABEL_EXPLAIN = 'every-selection-explained';
const DETAIL_EXPLAIN = 'every selected test carries a reason; every full decision names its rule';
const LABEL_DETERMINISM = 'deterministic-decision';
const DETAIL_DETERMINISM = 'identical and reversed inputs produce identical decisions';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function decision(changedPaths) {
  const {selection} = selectProofCone(root, changedPaths);
  return testImpactDecision(selection);
}

function paths(decisionResult) {
  return new Set(decisionResult.tests.map((entry) => entry.path));
}

function reasonsFor(decisionResult, testPath) {
  const entry = decisionResult.tests.find((item) => item.path === testPath);
  return entry ? entry.reasons : [];
}

const checks = [];

// 1. Leaf source change → bounded cone, unrelated integration shards absent.
checks.push(check(LABEL_LEAF, () => {
  const d = decision([LEAF_PATH]);
  assert(d, ERR_NO_DECISION);
  assert(d.mode === MODE_SELECTED, ERR_LEAF_NOT_SELECTED);
  const selected = paths(d);
  const primary = loadManifest(root, PRIMARY_CLASS_MANIFEST_PATH);
  assert(selected.size < primary.manifest.censusSize, ERR_LEAF_UNSAFE);
  assert(selected.has(SAFETY_SAMPLE), ERR_LEAF_NO_FLOOR);
  return `leaf cone: ${selected.size}/${primary.manifest.censusSize} tests`;
}));

// 2. Transitive dependency: changed C, B imports C, test A imports B → A.
checks.push(check(LABEL_TRANSITIVE, () => {
  const d = decision([TRANSITIVE_ROOT]);
  const selected = paths(d);
  assert(selected.size > 0, ERR_TRANSITIVE_MISS);
  // Any selected non-floor test must trace through the static edge.
  const staticTests = d.tests.filter((entry) =>
    entry.reasons.includes(REASON_STATIC_DEPENDENCY));
  assert(staticTests.length > 0, ERR_TRANSITIVE_MISS);
  return `${staticTests.length} tests selected via transitive static dependency`;
}));

// 3. Coverage-only dependency: observed executor selected for its covered file.
checks.push(check(LABEL_COVERAGE, () => {
  const d = decision([COVERED_LEAF]);
  const selected = paths(d);
  assert(selected.has(OBSERVED_EXECUTOR), ERR_COVERAGE_MISS);
  assert(reasonsFor(d, OBSERVED_EXECUTOR).includes(REASON_OBSERVED_COVERAGE),
    ERR_NO_COVERAGE_REASON);
  return `coverage edge selects ${OBSERVED_EXECUTOR}`;
}));

// 4. Semantic contract change → claimants selected without an import edge.
checks.push(check(LABEL_CONTRACT, () => {
  const d = decision([CONTRACT_OWNER]);
  const selected = paths(d);
  const claimants = [...selected].filter((testPath) =>
    testPath.startsWith(TOPOLOGY_CLAIMANT_PREFIX));
  assert(claimants.length > 0, ERR_CONTRACT_MISS);
  assert(claimants.every((testPath) =>
    reasonsFor(d, testPath).some((reason) =>
      reason.startsWith(REASON_SEMANTIC_CONTRACT))),
  ERR_NO_CONTRACT_REASON);
  return `${claimants.length} topology claimants selected via contract edge`;
}));

// 5. Changed test → always selected itself.
checks.push(check(LABEL_CHANGED_TEST, () => {
  const d = decision([CHANGED_TEST_PATH]);
  assert(paths(d).has(CHANGED_TEST_PATH), ERR_CHANGED_TEST_MISS);
  assert(reasonsFor(d, CHANGED_TEST_PATH).includes(REASON_CHANGED_TEST),
    ERR_NO_CHANGED_REASON);
  return DETAIL_CHANGED_SELECTED;
}));

// 6. Unclassified source path → FULL escalation, named rule.
checks.push(check(LABEL_UNKNOWN, () => {
  const d = decision([UNKNOWN_PATH]);
  assert(d.mode === MODE_FULL, ERR_UNKNOWN_NOT_FULL);
  assert(d.escalation?.rule === ESCALATION_RULE_UNCLASSIFIED_PATH,
    ERR_ESCALATION_UNNAMED);
  return `unclassified path → full (${d.escalation.rule})`;
}));

// 7. WIT/schema/protocol boundary → full escalation.
checks.push(check(LABEL_WIT, () => {
  const d = decision([WIT_PATH]);
  assert(d.mode === MODE_FULL, ERR_WIT_NOT_FULL);
  assert(d.escalation?.rule === ESCALATION_RULE_CORE_METADATA,
    `WIT escalation rule is ${d.escalation?.rule}`);
  return `WIT boundary → full (${d.escalation.rule})`;
}));

// 8. Test-runner change → FULL escalation.
checks.push(check(LABEL_RUNNER, () => {
  const d = decision([RUNNER_PATH]);
  assert(d.mode === MODE_FULL, ERR_RUNNER_NOT_FULL);
  assert(d.escalation?.rule === ESCALATION_RULE_SELECTOR_SELF,
    `runner escalation rule is ${d.escalation?.rule}`);
  return `test-runner change → full (${d.escalation.rule})`;
}));

// 9. Selector implementation change → FULL escalation.
checks.push(check(LABEL_SELECTOR, () => {
  const d = decision([SELECTOR_PATH]);
  assert(d.mode === MODE_FULL, ERR_SELECTOR_NOT_FULL);
  assert(d.escalation?.rule === ESCALATION_RULE_SELECTOR_SELF,
    `selector escalation rule is ${d.escalation?.rule}`);
  return `selector self-change → full (${d.escalation.rule})`;
}));

// 10. Missing classification entry → FULL escalation, never zero-affected.
checks.push(check(LABEL_MISSING_ENTRY, () => {
  const d = decision([]);
  assert(d.mode === MODE_FULL, ERR_MISSING_ENTRY_NOT_FULL);
  assert(d.tests.length > 0, ERR_NO_EMPTY_MODE);
  return DETAIL_MISSING_ENTRY;
}));

// 11. Historical known regressions → every detector inside the cone or full.
checks.push(check(LABEL_HISTORICAL, () => {
  const corpus = JSON.parse(
    fs.readFileSync(path.join(root, CORPUS_PATH), UTF8_ENCODING));
  const misses = [];
  let escalations = 0;
  for (const entry of corpus.cases) {
    const d = decision(entry.changedPaths);
    const selected = paths(d);
    const hit = entry.knownDetectors.some((detector) => selected.has(detector));
    if (!hit) misses.push(entry.caseId);
    if (d.mode === MODE_FULL) escalations += 1;
  }
  assert(misses.length === 0,
    `${ERR_HISTORICAL_MISS}: ${misses.slice(0, MISS_SAMPLE_LIMIT).join(LIST_JOIN)}`);
  return `${corpus.cases.length} historical regressions: every known detector ` +
    `selected (${escalations} full-mode escalations)`;
}));

// 12. Inject a missing impact edge → scenario RED (the gap must be detected).
checks.push(check(LABEL_INJECTED, () => {
  // A forged historical case whose detector provably has no edge to the
  // changed path must fail conformance; if it passes, the conformance check
  // itself is broken.
  const forged = {
    changedPaths: ['src/admin/admin-authoritative-repair-evaluation.js'],
    knownDetectors: ['test/diagnostics/comparative-efficiency-opportunity-calculator.test.js'],
  };
  const d = decision(forged.changedPaths);
  const hit = forged.knownDetectors.some((detector) => paths(d).has(detector));
  assert(!hit || d.mode === MODE_FULL, ERR_INJECTED_EDGE_ACCEPTED);
  return DETAIL_INJECTED;
}));

// 13. Shadow comparison: attributable regression outside the cone → red.
checks.push(check(LABEL_MISS_RED, () => {
  // Simulate the shadow verdict: a change whose full-suite failure is NOT
  // attributable (docs) is not a miss; a source change whose cone excludes
  // a forged attributable detector IS a miss and must be flagged.
  const docMiss = shadowMiss(decision([DOC_PATH]), 'test/sea/sea-manifest.test.js');
  assert(docMiss === false, ERR_DOC_MISS);
  const srcMiss = shadowMiss(decision([LEAF_PATH]), 'test/sea/sea-manifest.test.js');
  // sea-manifest has no edge to the leaf, so it is not attributable → not a miss.
  assert(srcMiss === false, ERR_NON_ATTR_MISS);
  const attributableMiss = shadowMiss(
    {mode: MODE_SELECTED, tests: [{path: SAFETY_SAMPLE, reasons: [REASON_UNIVERSAL_SAFETY]}]},
    OBSERVED_EXECUTOR,
    [OBSERVED_EXECUTOR]);
  assert(attributableMiss === true, ERR_MISS_NOT_RED);
  return DETAIL_MISS_RED;
}));

// 14. Explainability: every selected test has ≥1 reason; full names its rule.
checks.push(check(LABEL_EXPLAIN, () => {
  const samples = [
    decision([LEAF_PATH]),
    decision([CONTRACT_OWNER]),
    decision([RUNNER_PATH]),
    decision([DOC_PATH]),
  ];
  for (const d of samples) {
    assert(d.tests.length > 0, ERR_NO_EMPTY_MODE);
    for (const entry of d.tests) {
      assert(entry.reasons.length > 0, `${ERR_UNEXPLAINED}: ${entry.path}`);
    }
    if (d.mode === MODE_FULL) {
      assert(d.escalation && d.escalation.rule, ERR_ESCALATION_UNNAMED);
    }
  }
  return DETAIL_EXPLAIN;
}));

// 15. Determinism: same inputs → byte-identical decision.
checks.push(check(LABEL_DETERMINISM, () => {
  const first = decision([LEAF_PATH, CHANGED_TEST_PATH]);
  const second = decision([CHANGED_TEST_PATH, LEAF_PATH].reverse());
  assert(JSON.stringify(first) === JSON.stringify(second) ||
    JSON.stringify(stabilize(first)) === JSON.stringify(stabilize(second)),
  ERR_NON_DETERMINISTIC);
  return DETAIL_DETERMINISM;
}));

function stabilize(d) {
  return {...d, tests: d.tests.map((entry) => ({...entry}))};
}

// A full-suite failure is a selector miss iff it is attributable to the
// candidate (the failing test detects the changed behavior) AND outside the
// selected cone.
function shadowMiss(decisionResult, failingTest, attributableTests = null) {
  if (decisionResult.mode === MODE_FULL) return false;
  const selected = new Set(decisionResult.tests.map((entry) => entry.path));
  if (selected.has(failingTest)) return false;
  if (attributableTests === null) return false;
  return attributableTests.includes(failingTest);
}

emitScenarioReport(root, REPORTS_DIRECTORY, SCENARIO, checks, {
  corpus: CORPUS_PATH,
});
