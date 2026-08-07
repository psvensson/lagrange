#!/usr/bin/env node
// Impact proof-cone selector (developer-velocity epic V4a).
//
// Given an exact changed-file set, deterministically derives the proof cone:
// the union of
//   1. STATIC edges   — reverse import closure over the dependency-cruiser
//      import-graph artifact (generated);
//   2. COVERAGE edges — observed test→production execution map with a
//      freshness bound (generated; stale input widens, never narrows);
//   3. CONTRACT edges — explicit semantic contracts from
//      test/shards/impact-contracts.json (curated);
// plus changed/new tests themselves, contract/architecture guards, and the
// universal safety floor (test/shards/safety-pregate.txt).
//
// Escalation tiers are policy owned here, not per-Quest judgement:
// selector/runner self-change, core metadata (Raft/bootstrap/WIT/routing/
// SQL/system-table), and any unknown or unclassified path force the FULL
// suite. The agent never chooses the tests; the repository derives them.
//
// Every selection emits a versioned rationale receipt binding the exact
// inputs (changed paths, tier, per-edge-kind counts, selector version,
// manifest digests) so a Quest landing receipt records WHY each proof was
// relevant.

import fs from 'node:fs';
import path from 'node:path';

import {
  CONTRACT_SCHEMA_VERSION,
  COVERAGE_STATE_ABSENT,
  COVERAGE_STATE_INSUFFICIENT,
  COVERAGE_STATE_STALE,
  DIRECTORY_PREFIX_SUFFIX,
  ESCALATION_RULE_CORE_METADATA,
  ESCALATION_RULE_DEAD_CONTRACT,
  ESCALATION_RULE_EMPTY_CHANGE_SET,
  ESCALATION_RULE_INPUT_MISSING,
  ESCALATION_RULE_SELECTOR_SELF,
  ESCALATION_RULE_TIER_POLICY,
  ESCALATION_RULE_UNCLASSIFIED_PATH,
  LIST_JOIN_SEPARATOR,
  MODE_FULL,
  MODE_SELECTED,
  PROBLEM_CONTRACTS_SCHEMA,
  PROBLEM_EMPTY_CHANGE_SET,
  PROBLEM_ZERO_SELECTED,
  REASON_CHANGED_TEST,
  REASON_ESCALATION,
  REASON_OBSERVED_COVERAGE,
  REASON_SEMANTIC_CONTRACT,
  REASON_STATIC_DEPENDENCY,
  REASON_UNIVERSAL_SAFETY,
  CORE_METADATA_PREFIXES,
  DOCUMENTATION_EXTENSIONS,
  DOCUMENTATION_PREFIXES,
  FULL_SUITE_TIERS,
  PROOF_CONE_RECEIPT_DIR,
  PROOF_CONE_SELECTOR_VERSION,
  RECEIPT_SCHEMA_VERSION,
  SAFETY_FLOOR_SHARD_PATH,
  SELECTION_CHANGED_TEST,
  SELECTION_CONTRACT,
  SELECTION_COVERAGE,
  SELECTION_SAFETY_FLOOR,
  SELECTION_STATIC,
  SELECTOR_SELF_PATHS,
  TIER_CORE_METADATA,
  TIER_DOCUMENTATION,
  TIER_LEAF_IMPLEMENTATION,
  TIER_OWNER_BOUNDARY,
  TIER_OWNER_IMPLEMENTATION,
  TIER_PROTOCOL_SHAPE,
  TIER_SELECTOR_SELF,
  TIER_UNKNOWN,
} from './impact-proof-cone-constants.js';
import {
  coverageEscalationRule,
  evaluateCoverage,
  fullCensusEscalation,
  loadSelectorInputs,
} from './impact-proof-cone-inputs.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const arraySome = Function.call.bind(Array.prototype.some);
const stringReplace = Function.call.bind(String.prototype.replace);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringSplit = Function.call.bind(String.prototype.split);
const stringTrim = Function.call.bind(String.prototype.trim);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayMap = Function.call.bind(Array.prototype.map);

const UTF8_ENCODING = 'utf8';
const NEWLINE_SEPARATOR = '\n';
const TEST_FILE_SUFFIX = '.test.js';
const SRC_PREFIX = 'src/';
const SCRIPTS_PREFIX = 'scripts/';
const WIT_PREFIX = 'wit/';
const WIT_SUFFIX = '.wit';
const PROTO_SUFFIX = '.proto';
const INDEX_FILE_SUFFIX = '/index.js';
const PUBLIC_API_PATH = 'src/public-api.js';

function readShardList(root, relPath) {
  const absolute = path.join(root, relPath);
  if (!fs.existsSync(absolute)) return [];
  const lines = stringSplit(fs.readFileSync(absolute, UTF8_ENCODING), NEWLINE_SEPARATOR);
  return arrayMap(
    arrayFilter(lines, (line) => stringTrim(line).length > 0),
    (line) => stringTrim(line));
}

function pathMatchesPrefix(changedPath, prefix) {
  return stringStartsWith(changedPath, prefix);
}

function isDocumentationPath(changedPath) {
  if (arraySome(DOCUMENTATION_PREFIXES, (prefix) => pathMatchesPrefix(changedPath, prefix))) {
    return true;
  }
  return arraySome(DOCUMENTATION_EXTENSIONS, (extension) =>
    stringEndsWith(changedPath, extension));
}

// The escalation tier for a single changed path.
function isCoreMetadataPath(changedPath) {
  return arraySome(CORE_METADATA_PREFIXES, (prefix) => pathMatchesPrefix(changedPath, prefix)) ||
    (stringStartsWith(changedPath, WIT_PREFIX) && stringEndsWith(changedPath, WIT_SUFFIX));
}

function isProtocolShapePath(changedPath) {
  return stringEndsWith(changedPath, WIT_SUFFIX) ||
    stringEndsWith(changedPath, PROTO_SUFFIX);
}

function isBoundaryPath(changedPath) {
  return stringEndsWith(changedPath, INDEX_FILE_SUFFIX) ||
    changedPath === PUBLIC_API_PATH;
}

function isSourceTreePath(changedPath) {
  return stringStartsWith(changedPath, SRC_PREFIX) ||
    stringStartsWith(changedPath, SCRIPTS_PREFIX);
}

// Tier classification is a precedence chain: each rule either resolves a
// tier or defers to the next. Anything the policy cannot classify — root
// files, generated artifacts, unknown trees — fails closed to the full suite.
export function classifyChangedPath(changedPath, ownedContracts) {
  if (arrayIncludes(SELECTOR_SELF_PATHS, changedPath)) return TIER_SELECTOR_SELF;
  if (isCoreMetadataPath(changedPath)) return TIER_CORE_METADATA;
  if (isDocumentationPath(changedPath)) return TIER_DOCUMENTATION;
  if (isProtocolShapePath(changedPath)) return TIER_PROTOCOL_SHAPE;
  if (stringEndsWith(changedPath, TEST_FILE_SUFFIX)) return TIER_LEAF_IMPLEMENTATION;
  if (!isSourceTreePath(changedPath)) return TIER_UNKNOWN;
  if (isBoundaryPath(changedPath)) return TIER_OWNER_BOUNDARY;
  return ownedContracts.length > 0 ?
    TIER_OWNER_IMPLEMENTATION : TIER_LEAF_IMPLEMENTATION;
}

function tierRank(tier) {
  const order = [
    TIER_DOCUMENTATION,
    TIER_LEAF_IMPLEMENTATION,
    TIER_OWNER_IMPLEMENTATION,
    TIER_OWNER_BOUNDARY,
    TIER_PROTOCOL_SHAPE,
    TIER_CORE_METADATA,
    TIER_SELECTOR_SELF,
    TIER_UNKNOWN,
  ];
  const rank = arrayIndexOf(order, tier);
  return rank === -1 ? order.length : rank;
}

// A contract owner/test entry is live when it names an existing directory
// prefix or an existing file. Dead edges fail closed (a contract defect
// widens the cone) rather than decaying into silent under-selection.
function contractEntryExists(root, entry) {
  const absolute = path.join(root, entry);
  if (fs.existsSync(absolute)) return true;
  if (!stringEndsWith(entry, DIRECTORY_PREFIX_SUFFIX) &&
      fs.existsSync(path.join(root, path.dirname(entry)))) {
    // Prefix-style entries (e.g. src/rebalancer/replica-operation-) match any
    // sibling whose name starts with the entry's basename.
    const base = path.basename(entry);
    const dir = path.join(root, path.dirname(entry));
    return arraySome(fs.readdirSync(dir), (name) => stringStartsWith(name, base));
  }
  return false;
}

function validateContractEntry(root, name, entry, problems,
  contractOwners, contractTests) {
  if (!entry || !Array.isArray(entry.owners) || !Array.isArray(entry.tests)) {
    problems.push(`contract ${name} lacks owners/tests arrays`);
    return;
  }
  for (const owner of entry.owners) {
    if (!contractEntryExists(root, owner)) {
      problems.push(`contract ${name} has a dead owner path: ${owner}`);
    }
    if (!contractOwners.has(owner)) contractOwners.set(owner, []);
    contractOwners.get(owner).push(name);
  }
  for (const testEntry of entry.tests) {
    if (!contractEntryExists(root, testEntry)) {
      problems.push(`contract ${name} has a dead test path: ${testEntry}`);
    }
  }
  contractTests.set(name, entry.tests);
}

function buildContractIndexes(root, contractsManifest) {
  const problems = [];
  const contractOwners = new Map();
  const contractTests = new Map();
  if (contractsManifest.schemaVersion !== CONTRACT_SCHEMA_VERSION) {
    problems.push(`unsupported contracts schemaVersion: ${contractsManifest.schemaVersion}`);
  }
  const contracts = contractsManifest.contracts;
  if (!contracts || typeof contracts !== 'object' || Array.isArray(contracts)) {
    problems.push(PROBLEM_CONTRACTS_SCHEMA);
    return {problems, contractOwners, contractTests};
  }
  for (const [name, entry] of Object.entries(contracts)) {
    validateContractEntry(root, name, entry, problems, contractOwners, contractTests);
  }
  return {problems, contractOwners, contractTests};
}

// Resolve the contracts a changed path owns. Owner entries ending in '/' are
// directory prefixes; anything else is an exact path.
function contractOwnersByPath(contractIndexes) {
  const exactOwners = new Map();
  const prefixOwners = [];
  for (const [owner, names] of contractIndexes.contractOwners.entries()) {
    if (stringEndsWith(owner, DIRECTORY_PREFIX_SUFFIX)) {
      prefixOwners.push([owner, names]);
    } else {
      exactOwners.set(owner, names);
    }
  }
  return {exactOwners, prefixOwners};
}

function contractsForPath(changedPath, resolved) {
  const exact = resolved.exactOwners.get(changedPath);
  const names = new Set(exact || []);
  for (const [prefix, prefixNames] of resolved.prefixOwners) {
    if (pathMatchesPrefix(changedPath, prefix)) {
      for (const name of prefixNames) names.add(name);
    }
  }
  return [...names].sort();
}

function reverseStaticClosure(changedPaths, importers) {
  const seen = new Set();
  const stack = [...changedPaths];
  while (stack.length > 0) {
    const module = stack.pop();
    if (seen.has(module)) continue;
    seen.add(module);
    for (const importer of importers[module] || []) {
      if (!seen.has(importer)) stack.push(importer);
    }
  }
  return seen;
}

function coverageEdgesFor(coverageSnapshot, changedPaths) {
  // coverageSnapshot.tests: {testPath: [productionPath, ...]}
  const selected = new Map();
  const tests = coverageSnapshot.tests || {};
  for (const [testPath, covered] of Object.entries(tests)) {
    for (const changedPath of changedPaths) {
      if (arrayIncludes(covered, changedPath)) {
        if (!selected.has(testPath)) selected.set(testPath, []);
        selected.get(testPath).push(changedPath);
        break;
      }
    }
  }
  return selected;
}

function expandContractTests(contractTests, contractNames, classifiedTests) {
  const selected = new Set();
  for (const name of contractNames) {
    const entries = contractTests.get(name) || [];
    for (const entry of entries) {
      if (stringEndsWith(entry, TEST_FILE_SUFFIX)) {
        selected.add(entry);
      } else {
        for (const testPath of classifiedTests) {
          if (pathMatchesPrefix(testPath, entry)) selected.add(testPath);
        }
      }
    }
  }
  return selected;
}

export function selectProofCone(root, changedPaths) {
  const receipt = emptyReceipt(changedPaths);
  const sortedChanged = [...changedPaths].sort();
  const inputs = loadSelectorInputs(root);
  const censusTests = inputs.ok ? Object.keys(inputs.primary.classes) : [];

  // Empty change set or missing input is unknown impact: escalate to the
  // full census (never an empty-tests "probably safe" mode).
  if (sortedChanged.length === 0 || !inputs.ok) {
    return escalateUnknown(receipt, sortedChanged, inputs, censusTests);
  }

  const classified = inputs.primary.classes;
  receipt.inputs.primaryClassDigest = inputs.primary.digest;
  receipt.inputs.importGraphDigest = inputs.importGraphDigest;
  receipt.counts.totalTests = censusTests.length;

  const contractIndexes = buildContractIndexes(root, inputs.contracts);
  if (contractIndexes.problems.length > 0) {
    receipt.problems.push(...contractIndexes.problems);
    receipt.escalation = TIER_UNKNOWN;
    fullCensusEscalation(receipt, censusTests, ESCALATION_RULE_DEAD_CONTRACT);
    return {selection: receipt, problems: receipt.problems};
  }

  const coverageEval = evaluateCoverage(root, inputs.coverage, censusTests.length);
  recordCoverageInputs(receipt, coverageEval);
  const tiers = classifyChangedPaths(sortedChanged, contractIndexes, receipt);

  // Fail closed: unknown paths or full-suite tiers.
  const policyEscalation = resolvePolicyEscalation(receipt, tiers, censusTests);
  if (policyEscalation) return policyEscalation;

  // Observed coverage is required once a change crosses owner scope; a stale
  // or too-small snapshot cannot prove impact, so widen rather than narrow.
  const coverageUsable = Boolean(inputs.coverage) && coverageEval.sufficient;
  if (coverageRequiredTier(tiers.escalation) && !coverageUsable) {
    receipt.problems.push(
      `coverage snapshot ${coverageStateName(coverageEval)} at tier ${tiers.escalation}; widened to full suite`);
    fullCensusEscalation(receipt, censusTests, coverageEscalationRule(coverageEval));
    return {selection: receipt, problems: receipt.problems};
  }

  const cone = buildBoundedCone(root, {
    sortedChanged,
    importers: inputs.importers,
    classified,
    classifiedTests: censusTests,
    contractIndexes,
    changedContracts: receipt.changedContracts,
    coverageSnapshot: coverageUsable ? inputs.coverage : null,
  });
  applyCone(receipt, cone, tiers.escalation);
  return {selection: receipt, problems: [...receipt.problems]};
}

function emptyReceipt(changedPaths) {
  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,
    selectorVersion: PROOF_CONE_SELECTOR_VERSION,
    selectedAt: new Date().toISOString(),
    changedPaths: [...changedPaths].sort(),
    tiers: {},
    escalation: TIER_DOCUMENTATION,
    fullSuite: false,
    counts: {
      [SELECTION_STATIC]: 0,
      [SELECTION_COVERAGE]: 0,
      [SELECTION_CONTRACT]: 0,
      [SELECTION_CHANGED_TEST]: 0,
      [SELECTION_SAFETY_FLOOR]: 0,
      uniqueSelected: 0,
      totalTests: 0,
    },
    inputs: {},
    selectedTests: [],
    problems: [],
  };
}

function escalateUnknown(receipt, sortedChanged, inputs, censusTests) {
  if (sortedChanged.length === 0) {
    receipt.problems.push(PROBLEM_EMPTY_CHANGE_SET);
    fullCensusEscalation(receipt, censusTests, ESCALATION_RULE_EMPTY_CHANGE_SET);
  } else {
    receipt.problems.push(...inputs.problems);
    fullCensusEscalation(receipt, censusTests, ESCALATION_RULE_INPUT_MISSING);
  }
  receipt.escalation = TIER_UNKNOWN;
  receipt.counts.totalTests = censusTests.length;
  return {selection: receipt, problems: receipt.problems};
}

function recordCoverageInputs(receipt, coverageEval) {
  receipt.inputs.coverageTestShare = coverageEval.share;
  receipt.inputs.coverageStaleEdges = coverageEval.staleEdges;
  receipt.inputs.coverageDigest = coverageEval.digest || null;
  receipt.inputs.coverageFresh = coverageEval.fresh;
  receipt.inputs.coverageSufficient = coverageEval.sufficient;
}

function classifyChangedPaths(sortedChanged, contractIndexes, receipt) {
  const resolvedOwners = contractOwnersByPath(contractIndexes);
  const changedContracts = new Set();
  const unknownPaths = [];
  let escalation = TIER_DOCUMENTATION;
  for (const changedPath of sortedChanged) {
    const owned = contractsForPath(changedPath, resolvedOwners);
    const tier = classifyChangedPath(changedPath, owned);
    receipt.tiers[changedPath] = tier;
    for (const name of owned) changedContracts.add(name);
    if (tierRank(tier) > tierRank(escalation)) escalation = tier;
    if (tier === TIER_UNKNOWN) unknownPaths.push(changedPath);
  }
  receipt.escalation = escalation;
  receipt.changedContracts = [...changedContracts].sort();
  return {escalation, unknownPaths};
}

function resolvePolicyEscalation(receipt, tiers, censusTests) {
  if (tiers.unknownPaths.length === 0 &&
      !arrayIncludes(FULL_SUITE_TIERS, tiers.escalation)) {
    return null;
  }
  if (tiers.unknownPaths.length > 0) {
    receipt.problems.push(`unclassified changed path(s) force full suite: ${tiers.unknownPaths.join(LIST_JOIN_SEPARATOR)}`);
    fullCensusEscalation(receipt, censusTests, ESCALATION_RULE_UNCLASSIFIED_PATH);
  } else {
    const rule = tiers.escalation === TIER_SELECTOR_SELF ?
      ESCALATION_RULE_SELECTOR_SELF : ESCALATION_RULE_CORE_METADATA;
    fullCensusEscalation(receipt, censusTests, rule);
  }
  return {selection: receipt, problems: receipt.problems};
}

function coverageRequiredTier(escalation) {
  return escalation !== TIER_DOCUMENTATION &&
    tierRank(escalation) >= tierRank(TIER_OWNER_IMPLEMENTATION);
}

function applyCone(receipt, cone, escalation) {
  receipt.counts[SELECTION_CHANGED_TEST] = cone.changedTestCount;
  receipt.counts[SELECTION_SAFETY_FLOOR] = cone.safetyFloorCount;
  receipt.counts[SELECTION_STATIC] = cone.rationale[SELECTION_STATIC].length;
  receipt.counts[SELECTION_COVERAGE] = cone.rationale[SELECTION_COVERAGE].length;
  receipt.counts[SELECTION_CONTRACT] = cone.rationale[SELECTION_CONTRACT].length;
  receipt.rationale = cone.rationale;
  receipt.testReasons = cone.testReasons;
  receipt.selectedTests = [...cone.selected].sort();
  receipt.counts.uniqueSelected = receipt.selectedTests.length;
  if (receipt.counts.uniqueSelected === 0 && escalation !== TIER_DOCUMENTATION) {
    receipt.problems.push(PROBLEM_ZERO_SELECTED);
  }
}

// The bounded cone: union of static reverse-closure, observed coverage
// (already vetted fresh+sufficient by the caller), semantic-contract
// claimants, changed tests, and the universal safety floor. Per-test reasons
// accumulate every edge that binds a test to the change.
function buildBoundedCone(root, args) {
  const {
    sortedChanged,
    importers,
    classified,
    classifiedTests,
    contractIndexes,
    changedContracts,
    coverageSnapshot,
  } = args;
  const selected = new Set();
  const reasons = new Map();
  const addReason = (testPath, reason) => {
    if (!reasons.has(testPath)) reasons.set(testPath, new Set());
    reasons.get(testPath).add(reason);
  };
  const rationale = {
    [SELECTION_STATIC]: [],
    [SELECTION_COVERAGE]: [],
    [SELECTION_CONTRACT]: [],
  };

  collectStaticEdges(sortedChanged, importers, classified, selected, rationale, addReason);
  if (coverageSnapshot) {
    collectCoverageEdges(coverageSnapshot, sortedChanged, classified,
      selected, rationale, addReason);
  }
  collectContractEdges(contractIndexes, changedContracts, classified,
    classifiedTests, selected, rationale, addReason);
  const changedTestCount = collectChangedTests(sortedChanged, classified, selected, addReason);
  const safetyFloorCount = collectSafetyFloor(root, classified, selected, addReason);

  return {
    selected,
    changedTestCount,
    safetyFloorCount,
    rationale: {
      [SELECTION_STATIC]: rationale[SELECTION_STATIC].sort(),
      [SELECTION_COVERAGE]: rationale[SELECTION_COVERAGE].sort(),
      [SELECTION_CONTRACT]: rationale[SELECTION_CONTRACT].sort(),
    },
    testReasons: reasonsRecord(reasons),
  };
}

function collectStaticEdges(sortedChanged, importers, classified, selected, rationale, addReason) {
  const closure = reverseStaticClosure(
    arrayFilter(sortedChanged, (changedPath) => !stringEndsWith(changedPath, TEST_FILE_SUFFIX)),
    importers);
  for (const module of closure) {
    if (stringEndsWith(module, TEST_FILE_SUFFIX) && classified[module]) {
      selected.add(module);
      rationale[SELECTION_STATIC].push(module);
      addReason(module, REASON_STATIC_DEPENDENCY);
    }
  }
}

function collectCoverageEdges(coverageSnapshot, sortedChanged, classified,
  selected, rationale, addReason) {
  const coverageSelected = coverageEdgesFor(coverageSnapshot, sortedChanged);
  for (const testPath of coverageSelected.keys()) {
    if (classified[testPath]) {
      selected.add(testPath);
      rationale[SELECTION_COVERAGE].push(testPath);
      addReason(testPath, REASON_OBSERVED_COVERAGE);
    }
  }
}

function collectContractEdges(contractIndexes, changedContracts, classified,
  classifiedTests, selected, rationale, addReason) {
  const contractTests = expandContractTests(
    contractIndexes.contractTests, changedContracts, classifiedTests);
  for (const testPath of contractTests) {
    if (classified[testPath]) {
      selected.add(testPath);
      rationale[SELECTION_CONTRACT].push(testPath);
      for (const contract of changedContracts) {
        addReason(testPath, `${REASON_SEMANTIC_CONTRACT}:${contract}`);
      }
    }
  }
}

function collectChangedTests(sortedChanged, classified, selected, addReason) {
  let count = 0;
  for (const changedPath of sortedChanged) {
    if (stringEndsWith(changedPath, TEST_FILE_SUFFIX) && classified[changedPath]) {
      selected.add(changedPath);
      count += 1;
      addReason(changedPath, REASON_CHANGED_TEST);
    }
  }
  return count;
}

function collectSafetyFloor(root, classified, selected, addReason) {
  const safetyFloor = arrayFilter(
    readShardList(root, SAFETY_FLOOR_SHARD_PATH),
    (testPath) => classified[testPath]);
  for (const testPath of safetyFloor) {
    selected.add(testPath);
    addReason(testPath, REASON_UNIVERSAL_SAFETY);
  }
  return safetyFloor.length;
}

function coverageStateName(evaluation) {
  if (!evaluation.present) return COVERAGE_STATE_ABSENT;
  if (evaluation.fresh) return COVERAGE_STATE_INSUFFICIENT;
  return COVERAGE_STATE_STALE;
}

function reasonsRecord(testReasons) {
  const record = {};
  for (const [testPath, reasons] of testReasons.entries()) {
    record[testPath] = [...reasons].sort();
  }
  return record;
}

export function writeReceipt(root, receipt) {
  const dir = path.join(root, PROOF_CONE_RECEIPT_DIR);
  fs.mkdirSync(dir, {recursive: true});
  const stamp = stringReplace(receipt.selectedAt, /[:.]/g, '-');
  const target = path.join(dir, `proof-cone-${stamp}.receipt.json`);
  fs.writeFileSync(target, JSON.stringify(receipt, null, 2));
  return target;
}

// Test-only export: the shadow validator replays contract indexes without
// going through a full selection.
export function buildContractIndexesForTest(root, contractsManifest) {
  return buildContractIndexes(root, contractsManifest);
}

// The canonical TestImpactDecision projection (developer-velocity epic):
// the single structured decision every consumer (package scripts, Solver
// landing, CI wrappers, agents, test runners) reads instead of re-deriving
// affected tests. mode is `selected` (bounded cone) or `full` (escalated);
// there is deliberately no empty-tests "probably safe" mode. Every selected
// test carries at least one machine-readable reason; every full-mode
// decision names the escalation rule.
export function testImpactDecision(receipt) {
  const tests = arrayMap(receipt.selectedTests || [], (testPath) => ({
    path: testPath,
    reasons: (receipt.testReasons || {})[testPath] ||
      (receipt.fullSuite ? [REASON_ESCALATION] : []),
  }));
  return {
    mode: receipt.fullSuite ? MODE_FULL : MODE_SELECTED,
    changedPaths: receipt.changedPaths || [],
    impactedContracts: receipt.changedContracts || [],
    escalation: receipt.fullSuite ? {
      tier: receipt.escalation,
      rule: receipt.escalationRule || ESCALATION_RULE_TIER_POLICY,
    } : null,
    tier: receipt.escalation,
    tests,
    selectorVersion: receipt.selectorVersion,
    sourceFingerprint: receipt.inputs?.importGraphDigest || null,
    inputs: receipt.inputs || {},
    counts: receipt.counts || {},
    problems: receipt.problems || [],
  };
}
