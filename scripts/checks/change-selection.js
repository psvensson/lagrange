// Change-scoped test selection.
//
// Returns exactly one of three outcomes, and NEVER an "all tests" fallback:
//
//   PRECISE   nothing behavioural changed, or only a test changed
//   WIDENED   product source changed -> its whole owning subsystem(s) + witnesses
//   REFUSED   scope unknown, or a change no subsystem proof can cover
//
// A PRODUCT SOURCE CHANGE PROVES ITS WHOLE SUBSYSTEM. Measured on 2026-08-18,
// import-graph cover for a single file ranged from 1 direct importer to 283
// transitive ones - so direct cover was dangerously narrow for a Raft consensus
// fix (1 test, against a 75-test subsystem) while full closure was absurdly
// broad (350 tests for one planning-gate file). A fixed depth would look
// principled while actually being a property of today's module boundaries: a
// refactor could change its safety without changing any product semantics.
// Subsystem size is the only bound derived from MEANING rather than topology.
//
// AUTHORITIES:
//   source taxonomy          -> owning subsystem      [authority]
//   impact-contract registry -> foreign witnesses     [authority]
//   import graph             -> diagnostics only, never reduces mandatory proof
//
// Silent under-selection is the one failure mode indistinguishable from
// success, so uncertainty widens to a semantic subsystem and unclassifiable
// change refuses outright. Uncertainty must never mean "run nothing", and it
// must never mean "run everything" either - that is what check:release is for.
//
// THIS MODULE NEVER SELECTS THE SAFETY SPINE. The spine is unconditional and
// belongs to the top-level runner, so that a selector returning nothing still
// leaves the spine - including this module's own contract tests - executing.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {testsForSubsystem} from '../check-subsystem.js';
import {withoutWorkspaceInjections} from './changed-paths.js';
import {
  IMPACT_CONTRACTS_PATH,
  INERT_PATH_RULES,
  REASON_CHANGED_TEST,
  REASON_COUPLED_WITNESS,
  REASON_IMPACT_WITNESS,
  REASON_SUBSYSTEM,
  LOCKFILE_RELEASE_PROBLEM,
  PACKAGE_FIELDS_UNKNOWN_PROBLEM,
  CATEGORY_INERT,
  CATEGORY_OWNED,
  CATEGORY_RELEASE_PROOF,
  CATEGORY_TEST,
  PACKAGE_LOCKFILE_PATH,
  PACKAGE_MANIFEST_PATH,
  PACKAGE_RELEASE_SURFACE_FIELDS,
  PACKAGE_SURFACE_RELEASE_PROBLEM,
  RELEASE_SURFACE_PATHS,
  RELEASE_SURFACE_PROBLEM,
  REFUSAL_RELEASE_PROOF_REQUIRED,
  REFUSAL_UNKNOWN_SCOPE,
  REFUSED_UNCLASSIFIED_TEST_PROBLEM,
  REFUSED_UNKNOWN_OWNER_PROBLEM,
  SELECTION_PRECISE,
  SELECTION_REFUSED,
  SELECTION_WIDENED,
  SOURCE_SUBSYSTEM_RULES,
} from './change-selection-constants.js';
import {
  SUBSYSTEM_MANIFEST_PATH,
} from './test-subsystem-classification-constants.js';

// Intrinsics captured at module load. Changed paths and manifest contents are
// external data by the adversarial-intrinsics rule, and this module decides
// what CI proves: a replaced String.prototype.startsWith could drop a contract
// owner from the plan while every count still looked healthy.
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayReduce = Function.call.bind(Array.prototype.reduce);
const arraySome = Function.call.bind(Array.prototype.some);
const regExpTest = Function.call.bind(RegExp.prototype.test);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const UTF8 = 'utf8';
const TEST_SUFFIX = '.test.js';
const AMBIGUITY_SEPARATOR = ' + ';
const MAX_GIT_BUFFER = 64 * 1024 * 1024;
const REASON_SEPARATOR = ': ';
const PROBLEM_SEPARATOR = ', ';
const NEWLINE = '\n';
const GIT = 'git';
const LS_FILES = 'ls-files';
const OTHERS = '--others';
const EXCLUDE_STANDARD = '--exclude-standard';

function readJson(root, relative) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relative), UTF8));
  } catch {
    return null;
  }
}

export function isInertPath(changedPath) {
  return arraySome(INERT_PATH_RULES,
    (pattern) => regExpTest(pattern, changedPath));
}

// All rules, never first-match: more than one match is a hard error rather than
// a silent positional choice.
export function subsystemForSourcePath(changedPath) {
  const hits = arrayFilter(SOURCE_SUBSYSTEM_RULES,
    (rule) => regExpTest(rule.pattern, changedPath));
  if (hits.length === 1) return {subsystem: hits[0].subsystem, rule: hits[0].id};
  if (hits.length === 0) return {subsystem: null, rule: null};
  return {
    subsystem: null,
    rule: null,
    ambiguous: arrayMap(hits, (hit) => `${hit.id}->${hit.subsystem}`),
  };
}

function contractWitnesses(contracts, changedPath) {
  const witnesses = [];
  for (const [id, contract] of Object.entries(contracts?.contracts || {})) {
    if (!arraySome(contract.owners || [],
      (owner) => stringStartsWith(changedPath, owner))) {
      continue;
    }
    witnesses.push({id, tests: contract.tests || []});
  }
  return witnesses;
}

function coupledWitnesses(contracts, changedPath) {
  const witnesses = [];
  for (const [id, pair] of Object.entries(contracts?.coupledPairs || {})) {
    const endpoints = pair.endpoints || [];
    const touched = arrayFind(endpoints, (endpoint) =>
      arraySome(endpoint.owners || [],
        (owner) => stringStartsWith(changedPath, owner)));
    if (!touched) continue;
    for (const endpoint of endpoints) {
      if (endpoint.id === touched.id) continue;
      witnesses.push({id: `${id}:${endpoint.id}`, owners: endpoint.owners || []});
    }
  }
  return witnesses;
}

// A contract names witness tests directly, as files or directories. No import
// graph is consulted: the registry is curated, so its witnesses are authority.
function expandWitness(classes, entries) {
  const tests = new Set();
  for (const entry of entries) {
    if (stringEndsWith(entry, TEST_SUFFIX)) {
      if (classes[entry]) tests.add(entry);
      continue;
    }
    for (const testPath of Object.keys(classes)) {
      if (stringStartsWith(testPath, entry)) tests.add(testPath);
    }
  }
  return tests;
}

function addReason(plan, testPath, reason) {
  if (!plan.has(testPath)) plan.set(testPath, new Set());
  plan.get(testPath).add(reason);
}

// Which package.json edits are safe to prove modularly. `changedPackageFields`
// is supplied by the caller (it needs both revisions to compute); when it is
// unavailable we fail closed to a release proof rather than guessing.
export function packageChangeRequiresRelease(changedPaths, changedPackageFields) {
  const shipping = arrayFilter(changedPaths,
    (changedPath) => arrayIncludes(RELEASE_SURFACE_PATHS, changedPath));
  if (shipping.length > 0) {
    return `${RELEASE_SURFACE_PROBLEM}: ${arrayJoin(shipping, PROBLEM_SEPARATOR)}`;
  }
  if (arrayIncludes(changedPaths, PACKAGE_LOCKFILE_PATH)) {
    return LOCKFILE_RELEASE_PROBLEM;
  }
  if (!arrayIncludes(changedPaths, PACKAGE_MANIFEST_PATH)) return null;
  if (!Array.isArray(changedPackageFields)) {
    return PACKAGE_FIELDS_UNKNOWN_PROBLEM;
  }
  const surface = arrayFilter(changedPackageFields,
    (field) => arrayIncludes(PACKAGE_RELEASE_SURFACE_FIELDS, field));
  return surface.length > 0 ?
    `${PACKAGE_SURFACE_RELEASE_PROBLEM}: ` +
    `${arrayJoin(surface, PROBLEM_SEPARATOR)}` : null;
}

// The candidate universe: tracked files PLUS non-ignored untracked files.
// Untracked ones matter because a brand-new src/new-area/foo.js must be caught
// by the taxonomy before it is staged, which is the entire point of
// exhaustiveness - waiting for `git add` would let it evade the check exactly
// when a human is least likely to notice.
export function candidatePaths(root) {
  const list = (args) => arrayFilter(stringSplit(execFileSync(GIT, args,
    {cwd: root, encoding: UTF8, maxBuffer: MAX_GIT_BUFFER}), NEWLINE), Boolean);
  const tracked = list([LS_FILES]);
  // Workspace injections are dropped HERE, at the one place the candidate
  // universe is defined, so the census and the selector cannot disagree about
  // what counts as repository content.
  const untracked = withoutWorkspaceInjections(
    list([LS_FILES, OTHERS, EXCLUDE_STANDARD]));
  return {
    tracked,
    untracked,
    candidates: [...new Set([...tracked, ...untracked])],
  };
}

// Exactly one category per path. Callers must treat these as a partition.
export function categoryForPath(candidatePath, classes) {
  if (candidatePath === PACKAGE_MANIFEST_PATH ||
    candidatePath === PACKAGE_LOCKFILE_PATH ||
    arrayIncludes(RELEASE_SURFACE_PATHS, candidatePath)) {
    return {category: CATEGORY_RELEASE_PROOF};
  }
  if (stringEndsWith(candidatePath, TEST_SUFFIX)) {
    return classes[candidatePath] ?
      {category: CATEGORY_TEST} :
      {category: null, problem: REFUSED_UNCLASSIFIED_TEST_PROBLEM};
  }
  if (isInertPath(candidatePath)) return {category: CATEGORY_INERT};
  const owner = subsystemForSourcePath(candidatePath);
  if (owner.ambiguous) {
    return {
      category: null,
      problem: arrayJoin(owner.ambiguous, AMBIGUITY_SEPARATOR),
    };
  }
  if (owner.subsystem) return {category: CATEGORY_OWNED, subsystem: owner.subsystem};
  return {category: null, problem: REFUSED_UNKNOWN_OWNER_PROBLEM};
}

// The census, computed once so no caller has to assemble it by hand.
export function taxonomyCensus(root) {
  const {tracked, untracked, candidates} = candidatePaths(root);
  const manifest = readJson(root, SUBSYSTEM_MANIFEST_PATH);
  const classes = manifest?.classes || {};
  const buckets = {
    [CATEGORY_TEST]: [],
    [CATEGORY_OWNED]: [],
    [CATEGORY_INERT]: [],
    [CATEGORY_RELEASE_PROOF]: [],
  };
  const problems = [];
  for (const candidatePath of candidates) {
    const verdict = categoryForPath(candidatePath, classes);
    if (!verdict.category) {
      problems.push(`${candidatePath}: ${verdict.problem}`);
      continue;
    }
    buckets[verdict.category].push(candidatePath);
  }
  const counts = Object.fromEntries(arrayMap(
    Object.entries(buckets), ([key, list]) => [key, list.length]));
  const sum = arrayReduce(Object.values(counts), (total, n) => total + n, 0);
  return {
    trackedCount: tracked.length,
    untrackedCount: untracked.length,
    candidateCount: candidates.length,
    counts,
    buckets,
    problems,
    partitionOk: problems.length === 0 && sum === candidates.length,
  };
}

// ONE outcome constructor per refusal, so the decision is expressed once
// instead of being re-assembled at each exit. Refusal is a first-class outcome
// here, never a fallback: it carries a machine-readable code and the reasons,
// and it never carries tests.
function refusedSelection(refusalCode, refusals, subsystems) {
  return {
    kind: SELECTION_REFUSED,
    refusalCode,
    refusals,
    tests: [],
    subsystems,
  };
}

// A changed test proves itself. An UNCLASSIFIED one refuses: it would otherwise
// be the one test guaranteed to be skipped by its own change.
function admitChangedTest(evidence, changedPath, classes) {
  if (!classes[changedPath]) {
    evidence.refusals.push(
      `${REFUSED_UNCLASSIFIED_TEST_PROBLEM}: ${changedPath}`);
    return;
  }
  addReason(evidence.plan, changedPath, REASON_CHANGED_TEST);
}

function admitChangedSource(evidence, changedPath, classes, contracts) {
  const owner = subsystemForSourcePath(changedPath);
  if (!owner.subsystem) {
    evidence.refusals.push(`${REFUSED_UNKNOWN_OWNER_PROBLEM} ${changedPath}` +
      (owner.ambiguous ?
        ` [${arrayJoin(owner.ambiguous, AMBIGUITY_SEPARATOR)}]` : ''));
    return;
  }
  evidence.sourceChanged = true;
  evidence.subsystems.add(owner.subsystem);

  for (const witness of contractWitnesses(contracts, changedPath)) {
    for (const testPath of expandWitness(classes, witness.tests)) {
      addReason(evidence.plan, testPath,
        `${REASON_IMPACT_WITNESS}${REASON_SEPARATOR}${witness.id}`);
    }
  }
  // A coupled pair means the OPPOSITE endpoint must be proved too, so its
  // owning subsystem joins the selection rather than a guess at its tests. The
  // pair id is remembered so --explain can say a test is here because of a
  // declared coupling rather than because its own area changed.
  for (const witness of coupledWitnesses(contracts, changedPath)) {
    for (const ownerPath of witness.owners) {
      const opposite = subsystemForSourcePath(ownerPath);
      if (!opposite.subsystem) continue;
      evidence.subsystems.add(opposite.subsystem);
      if (!evidence.coupledBy.has(opposite.subsystem)) {
        evidence.coupledBy.set(opposite.subsystem, new Set());
      }
      evidence.coupledBy.get(opposite.subsystem).add(witness.id);
    }
  }
}

// One pass over the changed paths, gathering what they oblige. It decides
// nothing: the outcome is chosen once, by the caller, from this evidence.
function collectChangeEvidence({changedPaths, classes, contracts}) {
  const evidence = {
    plan: new Map(),
    subsystems: new Set(),
    coupledBy: new Map(),
    refusals: [],
    sourceChanged: false,
  };
  for (const changedPath of changedPaths) {
    if (isInertPath(changedPath)) continue;
    if (stringEndsWith(changedPath, TEST_SUFFIX)) {
      admitChangedTest(evidence, changedPath, classes);
      continue;
    }
    admitChangedSource(evidence, changedPath, classes, contracts);
  }
  return evidence;
}

// The whole decision. `changedPaths` are repository-relative.
//
// A product source change widens to its whole owning subsystem. That is
// deliberately conservative for version 1: narrowing an individual owner later
// requires independent evidence that the smaller set is complete, and there is
// no reason to spend that complexity on a subsystem that already runs quickly.
export function selectChangedTests({root, changedPaths, changedPackageFields}) {
  const releaseProblem = packageChangeRequiresRelease(
    changedPaths, changedPackageFields);
  if (releaseProblem) {
    return refusedSelection(
      REFUSAL_RELEASE_PROOF_REQUIRED, [releaseProblem], []);
  }

  const manifest = readJson(root, SUBSYSTEM_MANIFEST_PATH);
  const classes = manifest?.classes || {};
  const evidence = collectChangeEvidence({
    changedPaths,
    classes,
    contracts: readJson(root, IMPACT_CONTRACTS_PATH),
  });
  if (evidence.refusals.length > 0) {
    return refusedSelection(REFUSAL_UNKNOWN_SCOPE, evidence.refusals,
      [...evidence.subsystems]);
  }

  for (const subsystem of evidence.subsystems) {
    for (const testPath of testsForSubsystem(subsystem, root)) {
      addReason(evidence.plan, testPath,
        `${REASON_SUBSYSTEM}${REASON_SEPARATOR}${subsystem}`);
      for (const pairId of evidence.coupledBy.get(subsystem) || []) {
        addReason(evidence.plan, testPath,
          `${REASON_COUPLED_WITNESS}${REASON_SEPARATOR}${pairId}`);
      }
    }
  }

  return {
    kind: evidence.sourceChanged ? SELECTION_WIDENED : SELECTION_PRECISE,
    subsystems: [...evidence.subsystems].sort(),
    tests: arrayMap([...evidence.plan.keys()].sort(), (testPath) => ({
      path: testPath,
      reasons: [...evidence.plan.get(testPath)].sort(),
    })),
  };
}
