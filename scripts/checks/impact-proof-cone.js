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
  COVERAGE_MINIMUM_TEST_SHARE,
  COVERAGE_STATE_ABSENT,
  COVERAGE_STATE_INSUFFICIENT,
  COVERAGE_STATE_STALE,
  DIRECTORY_PREFIX_SUFFIX,
  LIST_JOIN_SEPARATOR,
  PROBLEM_CONTRACTS_SCHEMA,
  PROBLEM_EMPTY_CHANGE_SET,
  PROBLEM_ZERO_SELECTED,
  CORE_METADATA_PREFIXES,
  COVERAGE_SCHEMA_VERSION,
  DOCUMENTATION_EXTENSIONS,
  DOCUMENTATION_PREFIXES,
  FULL_SUITE_TIERS,
  IMPORT_GRAPH_PATH,
  PROOF_CONE_CONTRACTS_PATH,
  PROOF_CONE_COVERAGE_PATH,
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
  PRIMARY_CLASS_MANIFEST_PATH,
  loadManifest as loadPrimaryManifest,
} from './test-primary-classification.js';

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

function readJson(root, relPath) {
  const absolute = path.join(root, relPath);
  if (!fs.existsSync(absolute)) {
    return {ok: false, problem: `missing required input: ${relPath}`};
  }
  try {
    return {ok: true, value: JSON.parse(fs.readFileSync(absolute, UTF8_ENCODING))};
  } catch (error) {
    return {ok: false, problem: `invalid JSON in ${relPath}: ${error.message}`};
  }
}

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
export function classifyChangedPath(changedPath, ownedContracts) {
  if (arrayIncludes(SELECTOR_SELF_PATHS, changedPath)) {
    return TIER_SELECTOR_SELF;
  }
  if (arraySome(CORE_METADATA_PREFIXES, (prefix) => pathMatchesPrefix(changedPath, prefix)) ||
      (stringStartsWith(changedPath, WIT_PREFIX) && stringEndsWith(changedPath, WIT_SUFFIX))) {
    return TIER_CORE_METADATA;
  }
  if (isDocumentationPath(changedPath)) {
    return TIER_DOCUMENTATION;
  }
  if (stringEndsWith(changedPath, WIT_SUFFIX) ||
      stringEndsWith(changedPath, PROTO_SUFFIX)) {
    return TIER_PROTOCOL_SHAPE;
  }
  if (stringEndsWith(changedPath, TEST_FILE_SUFFIX)) {
    return TIER_LEAF_IMPLEMENTATION;
  }
  const isBoundary = stringEndsWith(changedPath, INDEX_FILE_SUFFIX) ||
    changedPath === PUBLIC_API_PATH;
  if (stringStartsWith(changedPath, SRC_PREFIX) ||
      stringStartsWith(changedPath, SCRIPTS_PREFIX)) {
    if (isBoundary) return TIER_OWNER_BOUNDARY;
    return ownedContracts.length > 0 ?
      TIER_OWNER_IMPLEMENTATION : TIER_LEAF_IMPLEMENTATION;
  }
  // Anything the policy cannot classify — root files, generated artifacts,
  // unknown trees — fails closed to the full suite.
  return TIER_UNKNOWN;
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

function buildContractIndexes(root, contractsManifest) {
  const problems = [];
  if (contractsManifest.schemaVersion !== CONTRACT_SCHEMA_VERSION) {
    problems.push(`unsupported contracts schemaVersion: ${contractsManifest.schemaVersion}`);
  }
  const contracts = contractsManifest.contracts;
  if (!contracts || typeof contracts !== 'object' || Array.isArray(contracts)) {
    problems.push(PROBLEM_CONTRACTS_SCHEMA);
    return {problems, contractOwners: new Map(), contractTests: new Map()};
  }
  const contractOwners = new Map();
  const contractTests = new Map();
  for (const [name, entry] of Object.entries(contracts)) {
    if (!entry || !Array.isArray(entry.owners) || !Array.isArray(entry.tests)) {
      problems.push(`contract ${name} lacks owners/tests arrays`);
      continue;
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
  const problems = [];
  const receipt = {
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

  const sortedChanged = [...changedPaths].sort();
  if (sortedChanged.length === 0) {
    receipt.problems.push(PROBLEM_EMPTY_CHANGE_SET);
    receipt.escalation = TIER_UNKNOWN;
    receipt.fullSuite = true;
    return {selection: receipt, problems: receipt.problems};
  }

  // Inputs: primary classification census, contracts, import graph, coverage.
  const primary = loadPrimaryManifest(root, PRIMARY_CLASS_MANIFEST_PATH);
  if (!primary.ok) {
    receipt.problems.push(...primary.problems);
    receipt.escalation = TIER_UNKNOWN;
    receipt.fullSuite = true;
    return {selection: receipt, problems: receipt.problems};
  }
  const classified = primary.manifest.classes;
  const classifiedTests = Object.keys(classified);
  receipt.inputs.primaryClassDigest = primary.manifest.digest;
  receipt.counts.totalTests = classifiedTests.length;

  const contractsRead = readJson(root, PROOF_CONE_CONTRACTS_PATH);
  if (!contractsRead.ok) {
    receipt.problems.push(contractsRead.problem);
    receipt.escalation = TIER_UNKNOWN;
    receipt.fullSuite = true;
    return {selection: receipt, problems: receipt.problems};
  }
  const contractIndexes = buildContractIndexes(root, contractsRead.value);
  if (contractIndexes.problems.length > 0) {
    receipt.problems.push(...contractIndexes.problems);
    receipt.escalation = TIER_UNKNOWN;
    receipt.fullSuite = true;
    return {selection: receipt, problems: receipt.problems};
  }
  const resolvedOwners = contractOwnersByPath(contractIndexes);

  const graphRead = readJson(root, IMPORT_GRAPH_PATH);
  if (!graphRead.ok) {
    receipt.problems.push(graphRead.problem);
    receipt.escalation = TIER_UNKNOWN;
    receipt.fullSuite = true;
    return {selection: receipt, problems: receipt.problems};
  }
  const importers = graphRead.value.importers || {};
  receipt.inputs.importGraphDigest = graphRead.value.sourceDigest || null;

  const coverageRead = readJson(root, PROOF_CONE_COVERAGE_PATH);
  const coverageSnapshot = coverageRead.ok ? coverageRead.value : null;
  let coverageFresh = false;
  let coverageSufficient = false;
  if (coverageSnapshot) {
    coverageFresh = coverageSnapshot.schemaVersion === COVERAGE_SCHEMA_VERSION &&
      coverageSnapshot.sourceDigest === graphRead.value.sourceDigest;
    // The seed snapshot is intentionally a leaf corpus. Coverage can only
    // discharge owner-tier proof obligations once the snapshot covers a
    // meaningful share of the census; below that it cannot prove impact and
    // the cone widens exactly as if it were stale.
    const coveredShare = Object.keys(coverageSnapshot.tests || {}).length /
      Math.max(1, Object.keys(loadPrimaryManifest(root, PRIMARY_CLASS_MANIFEST_PATH)
        .manifest?.classes || {}).length);
    coverageSufficient = coverageFresh &&
      coveredShare >= COVERAGE_MINIMUM_TEST_SHARE;
    receipt.inputs.coverageTestShare = coveredShare;
  }
  receipt.inputs.coverageDigest = coverageSnapshot ?
    coverageSnapshot.sourceDigest || null : null;
  receipt.inputs.coverageFresh = coverageFresh;
  receipt.inputs.coverageSufficient = coverageSufficient;

  // Classify every changed path and compute the escalation tier.
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

  // Fail closed: unknown paths, stale/absent coverage for tiers that require
  // it, or full-suite tiers.
  if (unknownPaths.length > 0 || arrayIncludes(FULL_SUITE_TIERS, escalation)) {
    receipt.fullSuite = true;
    receipt.selectedTests = [...classifiedTests];
    receipt.counts.uniqueSelected = classifiedTests.length;
    if (unknownPaths.length > 0) {
      receipt.problems.push(`unclassified changed path(s) force full suite: ${unknownPaths.join(LIST_JOIN_SEPARATOR)}`);
    }
    return {selection: receipt, problems: receipt.problems};
  }

  const selected = new Set();
  const rationale = {[SELECTION_STATIC]: [], [SELECTION_COVERAGE]: [], [SELECTION_CONTRACT]: []};

  // Static reverse-dependency closure.
  const closure = reverseStaticClosure(
    arrayFilter(sortedChanged, (changedPath) => !stringEndsWith(changedPath, TEST_FILE_SUFFIX)),
    importers);
  for (const module of closure) {
    if (stringEndsWith(module, TEST_FILE_SUFFIX) && classified[module]) {
      selected.add(module);
      rationale[SELECTION_STATIC].push(module);
    }
  }

  // Observed coverage edges — only when fresh and corpus-sufficient; a
  // stale or too-small snapshot widens the cone by escalation rather than
  // silently narrowing it.
  if (coverageSnapshot && coverageSufficient) {
    const coverageSelected = coverageEdgesFor(coverageSnapshot, sortedChanged);
    for (const testPath of coverageSelected.keys()) {
      if (classified[testPath]) {
        selected.add(testPath);
        rationale[SELECTION_COVERAGE].push(testPath);
      }
    }
  } else if (escalation !== TIER_DOCUMENTATION &&
             tierRank(escalation) >= tierRank(TIER_OWNER_IMPLEMENTATION)) {
    // Coverage input is required once a change crosses owner scope; stale or
    // absent coverage cannot prove impact, so widen to the full suite.
    receipt.fullSuite = true;
    receipt.selectedTests = [...classifiedTests];
    receipt.counts.uniqueSelected = classifiedTests.length;
    const coverageState = !coverageSnapshot ? COVERAGE_STATE_ABSENT :
      (coverageFresh ? COVERAGE_STATE_INSUFFICIENT : COVERAGE_STATE_STALE);
    receipt.problems.push(
      `coverage snapshot ${coverageState} at tier ${escalation}; widened to full suite`);
    return {selection: receipt, problems: receipt.problems};
  }

  // Semantic contract edges.
  const contractTests = expandContractTests(
    contractIndexes.contractTests, receipt.changedContracts, classifiedTests);
  for (const testPath of contractTests) {
    if (classified[testPath]) {
      selected.add(testPath);
      rationale[SELECTION_CONTRACT].push(testPath);
    }
  }

  // Changed/new tests themselves.
  for (const changedPath of sortedChanged) {
    if (stringEndsWith(changedPath, TEST_FILE_SUFFIX) && classified[changedPath]) {
      selected.add(changedPath);
      receipt.counts[SELECTION_CHANGED_TEST] += 1;
    }
  }

  // Universal safety floor: always runs, never reduced by impact analysis.
  const safetyFloor = arrayFilter(
    readShardList(root, SAFETY_FLOOR_SHARD_PATH),
    (testPath) => classified[testPath]);
  for (const testPath of safetyFloor) selected.add(testPath);
  receipt.counts[SELECTION_SAFETY_FLOOR] = safetyFloor.length;

  receipt.selectedTests = [...selected].sort();
  receipt.counts[SELECTION_STATIC] = rationale[SELECTION_STATIC].length;
  receipt.counts[SELECTION_COVERAGE] = rationale[SELECTION_COVERAGE].length;
  receipt.counts[SELECTION_CONTRACT] = rationale[SELECTION_CONTRACT].length;
  receipt.counts.uniqueSelected = receipt.selectedTests.length;
  receipt.rationale = {
    [SELECTION_STATIC]: rationale[SELECTION_STATIC].sort(),
    [SELECTION_COVERAGE]: rationale[SELECTION_COVERAGE].sort(),
    [SELECTION_CONTRACT]: rationale[SELECTION_CONTRACT].sort(),
  };

  if (receipt.counts.uniqueSelected === 0 && escalation !== TIER_DOCUMENTATION) {
    receipt.problems.push(PROBLEM_ZERO_SELECTED);
  }
  problems.push(...receipt.problems);
  return {selection: receipt, problems};
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
