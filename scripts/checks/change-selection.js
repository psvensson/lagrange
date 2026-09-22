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
//   import graph             -> importers of changed test support code
//                               [adds proof; never narrows it]
//
// TEST SUPPORT CODE HAS NO SUBSYSTEM. A fixture under test/bootstrap/ or a
// helper under src/test-helpers/ is imported across subsystems, and the path
// taxonomy can only route it to test-infrastructure - which is how a fixture
// change broke placement-rebalance tests the cone never ran (a6d99aa3d,
// 2026-09-05). So a changed support file ALSO selects every test whose import
// closure reaches it, from the sealed import graph (helper-import-closure.js);
// without that graph the change refuses rather than guesses.
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
import {
  OBSERVATION_DRIFT_PROBLEM,
  observationDrift,
  observersOf,
} from './test-subsystem-classification.js';
import {withoutWorkspaceInjections} from './changed-paths.js';
import {
  helperImportClosure,
  isTestSupportPath,
  loadSealedImporters,
} from './helper-import-closure.js';
import {
  appendArrayValue,
  createOrderedStringMap,
  createOrderedStringSet,
  orderedStringMapGet,
  orderedStringMapHas,
  orderedStringMapKeys,
  orderedStringMapSet,
  orderedStringSetAdd,
  orderedStringSetValues,
  sortStrings,
  stringCollectionHas,
} from './change-proof-string-collections.js';
import {
  IMPACT_CONTRACTS_PATH,
  INERT_PATH_RULES,
  REASON_CHANGED_TEST,
  REASON_COUPLED_WITNESS,
  REASON_HELPER_IMPORTER,
  REASON_IMPACT_WITNESS,
  REASON_SUBSYSTEM,
  LOCKFILE_RELEASE_PROBLEM,
  PACKAGE_FIELDS_UNKNOWN_PROBLEM,
  CATEGORY_INERT,
  CATEGORY_OWNED,
  CATEGORY_RELEASE_PROOF,
  CATEGORY_TEST,
  HELPER_IMPORT_GRAPH_HINT,
  PACKAGE_LOCKFILE_PATH,
  PACKAGE_MANIFEST_PATH,
  PACKAGE_DEV_TOOLING_FIELDS,
  PACKAGE_RELEASE_SURFACE_FIELDS,
  SUBSYSTEM_TEST_INFRASTRUCTURE,
  PACKAGE_SURFACE_RELEASE_PROBLEM,
  RELEASE_SURFACE_PATHS,
  RELEASE_SURFACE_PREFIXES,
  RELEASE_SURFACE_PROBLEM,
  REFUSAL_RELEASE_PROOF_REQUIRED,
  REFUSAL_UNKNOWN_SCOPE,
  REFUSED_IMPORT_GRAPH_PROBLEM,
  REFUSED_UNCLASSIFIED_TEST_PROBLEM,
  REFUSED_UNKNOWN_OWNER_PROBLEM,
  SELECTION_PRECISE,
  SELECTION_REFUSED,
  SELECTION_WIDENED,
  SOURCE_SUBSYSTEM_RULES,
  OBSERVATION_DRIFT_HINT,
  OBSERVATION_DRIFT_LIMIT,
  REASON_OBSERVER,
} from './change-selection-constants.js';
import {
  SUBSYSTEM_MANIFEST_PATH,
} from './test-subsystem-classification-constants.js';

// Intrinsics captured at module load. Changed paths and manifest contents are
// external data by the adversarial-intrinsics rule, and this module decides
// what CI proves: a replaced String.prototype.startsWith could drop a contract
// owner from the plan while every count still looked healthy.
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayIsArray = Array.isArray;
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arraySlice = Function.call.bind(Array.prototype.slice);
const DRIFT_ELLIPSIS = ', ...';
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayReduce = Function.call.bind(Array.prototype.reduce);
const arraySome = Function.call.bind(Array.prototype.some);
const regExpTest = Function.call.bind(RegExp.prototype.test);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const jsonParse = JSON.parse.bind(JSON);
const objectEntries = Object.entries;
const objectFromEntries = Object.fromEntries;
const objectKeys = Object.keys;
const objectValues = Object.values;

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
    return jsonParse(fs.readFileSync(path.join(root, relative), UTF8));
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
  const ownedContracts = contracts?.contracts || {};
  const ids = objectKeys(ownedContracts);
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    const contract = ownedContracts[id];
    if (!arraySome(contract.owners || [],
      (owner) => stringStartsWith(changedPath, owner))) {
      continue;
    }
    appendArrayValue(witnesses, {id, tests: contract.tests || []});
  }
  return witnesses;
}

function coupledWitnesses(contracts, changedPath) {
  const witnesses = [];
  const ownedPairs = contracts?.coupledPairs || {};
  const ids = objectKeys(ownedPairs);
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    const pair = ownedPairs[id];
    const endpoints = pair.endpoints || [];
    const touched = arrayFind(endpoints, (endpoint) =>
      arraySome(endpoint.owners || [],
        (owner) => stringStartsWith(changedPath, owner)));
    if (!touched) continue;
    for (let endpointIndex = 0;
      endpointIndex < endpoints.length;
      endpointIndex += 1) {
      const endpoint = endpoints[endpointIndex];
      if (endpoint.id === touched.id) continue;
      appendArrayValue(witnesses,
        {id: `${id}:${endpoint.id}`, owners: endpoint.owners || []});
    }
  }
  return witnesses;
}

// A contract names witness tests directly, as files or directories. No import
// graph is consulted: the registry is curated, so its witnesses are authority.
function expandWitness(classes, entries) {
  const tests = createOrderedStringSet();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (stringEndsWith(entry, TEST_SUFFIX)) {
      if (classes[entry]) orderedStringSetAdd(tests, entry);
      continue;
    }
    const classPaths = objectKeys(classes);
    for (let pathIndex = 0;
      pathIndex < classPaths.length;
      pathIndex += 1) {
      const testPath = classPaths[pathIndex];
      if (stringStartsWith(testPath, entry)) {
        orderedStringSetAdd(tests, testPath);
      }
    }
  }
  return orderedStringSetValues(tests);
}

function addReason(plan, testPath, reason) {
  if (!orderedStringMapHas(plan, testPath)) {
    orderedStringMapSet(plan, testPath, createOrderedStringSet());
  }
  orderedStringSetAdd(orderedStringMapGet(plan, testPath), reason);
}

// Which changed paths alter bytes consumers receive/execute. Published trees
// need prefix ownership because enumerating today's generated files would make
// a newly generated sibling silently unclassified.
function isReleaseSurfacePath(changedPath) {
  return arrayIncludes(RELEASE_SURFACE_PATHS, changedPath) ||
    arraySome(RELEASE_SURFACE_PREFIXES,
      (prefix) => stringStartsWith(changedPath, prefix));
}

export function packageChangeRequiresRelease(
  changedPaths,
  changedPackageFields,
  lockfileGraphChanged,
) {
  const shipping = arrayFilter(changedPaths, isReleaseSurfacePath);
  if (shipping.length > 0) {
    return `${RELEASE_SURFACE_PROBLEM}: ` +
      arrayJoin(shipping, PROBLEM_SEPARATOR);
  }
  if (arrayIncludes(changedPaths, PACKAGE_LOCKFILE_PATH)) {
    if (lockfileGraphChanged !== false) return LOCKFILE_RELEASE_PROBLEM;
  }
  if (!arrayIncludes(changedPaths, PACKAGE_MANIFEST_PATH)) return null;
  if (!arrayIsArray(changedPackageFields)) {
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
  // `git ls-files` includes an index entry whose worktree file has been
  // deleted. That path matters to changed-path selection (which carries an
  // explicit vanished set), but it is not part of the CURRENT taxonomy
  // universe and cannot have a current manifest assignment. lstat preserves
  // tracked symlinks, including broken ones, while excluding true deletions.
  const tracked = arrayFilter(list([LS_FILES]), (candidatePath) => {
    try {
      fs.lstatSync(path.join(root, candidatePath));
      return true;
    } catch {
      return false;
    }
  });
  // Workspace injections are dropped HERE, at the one place the candidate
  // universe is defined, so the census and the selector cannot disagree about
  // what counts as repository content.
  const untracked = withoutWorkspaceInjections(
    list([LS_FILES, OTHERS, EXCLUDE_STANDARD]));
  const candidates = createOrderedStringSet(tracked);
  for (let index = 0; index < untracked.length; index += 1) {
    orderedStringSetAdd(candidates, untracked[index]);
  }
  return {
    tracked,
    untracked,
    candidates: orderedStringSetValues(candidates),
  };
}

// Exactly one category per path. Callers must treat these as a partition.
export function categoryForPath(candidatePath, classes) {
  if (candidatePath === PACKAGE_MANIFEST_PATH ||
    candidatePath === PACKAGE_LOCKFILE_PATH ||
    isReleaseSurfacePath(candidatePath)) {
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
  for (let index = 0; index < candidates.length; index += 1) {
    const candidatePath = candidates[index];
    const verdict = categoryForPath(candidatePath, classes);
    if (!verdict.category) {
      appendArrayValue(problems, `${candidatePath}: ${verdict.problem}`);
      continue;
    }
    appendArrayValue(buckets[verdict.category], candidatePath);
  }
  const counts = objectFromEntries(arrayMap(
    objectEntries(buckets), ([key, list]) => [key, list.length]));
  const sum = arrayReduce(objectValues(counts), (total, n) => total + n, 0);
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
function admitChangedTest(evidence, changedPath, classes, vanished) {
  // A DELETED test is not an unclassified test. It cannot run and cannot be
  // silently skipped, and its removal still widens through the classification
  // manifest, which audit:shards forces to be regenerated. Refusing here would
  // make deleting any test demand a full release proof.
  if (stringCollectionHas(vanished, changedPath)) return;
  if (!classes[changedPath]) {
    appendArrayValue(evidence.refusals,
      `${REFUSED_UNCLASSIFIED_TEST_PROBLEM}: ${changedPath}`);
    return;
  }
  addReason(evidence.plan, changedPath, REASON_CHANGED_TEST);
}

function admitChangedSource(evidence, changedPath, classes, contracts) {
  const owner = subsystemForSourcePath(changedPath);
  if (!owner.subsystem) {
    appendArrayValue(evidence.refusals,
      `${REFUSED_UNKNOWN_OWNER_PROBLEM} ${changedPath}` +
        (owner.ambiguous ?
          ` [${arrayJoin(owner.ambiguous, AMBIGUITY_SEPARATOR)}]` : ''));
    return;
  }
  evidence.sourceChanged = true;
  orderedStringSetAdd(evidence.subsystems, owner.subsystem);

  const impactWitnesses = contractWitnesses(contracts, changedPath);
  for (let witnessIndex = 0;
    witnessIndex < impactWitnesses.length;
    witnessIndex += 1) {
    const witness = impactWitnesses[witnessIndex];
    const witnessTests = expandWitness(classes, witness.tests);
    for (let testIndex = 0;
      testIndex < witnessTests.length;
      testIndex += 1) {
      const testPath = witnessTests[testIndex];
      addReason(evidence.plan, testPath,
        `${REASON_IMPACT_WITNESS}${REASON_SEPARATOR}${witness.id}`);
    }
  }
  // A coupled pair means the OPPOSITE endpoint must be proved too, so its
  // owning subsystem joins the selection rather than a guess at its tests. The
  // pair id is remembered so --explain can say a test is here because of a
  // declared coupling rather than because its own area changed.
  const coupled = coupledWitnesses(contracts, changedPath);
  for (let witnessIndex = 0;
    witnessIndex < coupled.length;
    witnessIndex += 1) {
    const witness = coupled[witnessIndex];
    for (let ownerIndex = 0;
      ownerIndex < witness.owners.length;
      ownerIndex += 1) {
      const ownerPath = witness.owners[ownerIndex];
      const opposite = subsystemForSourcePath(ownerPath);
      if (!opposite.subsystem) continue;
      orderedStringSetAdd(evidence.subsystems, opposite.subsystem);
      if (!orderedStringMapHas(evidence.coupledBy, opposite.subsystem)) {
        orderedStringMapSet(
          evidence.coupledBy, opposite.subsystem, createOrderedStringSet());
      }
      orderedStringSetAdd(
        orderedStringMapGet(evidence.coupledBy, opposite.subsystem),
        witness.id,
      );
    }
  }
}

// The sealed import graph, read once per selection and only when a support
// file changed: an ordinary source change never pays for it.
function sealedImporters(evidence, root) {
  if (evidence.importers === null) evidence.importers = loadSealedImporters(root);
  return evidence.importers;
}

// Changed test support code selects every test whose import closure reaches
// it, on top of the subsystem the taxonomy gave it. No graph, no guess: the
// refusal names the file and the command that regenerates the graph.
function admitHelperImporters(evidence, changedPath, classes, root) {
  const graph = sealedImporters(evidence, root);
  if (!graph.ok) {
    appendArrayValue(evidence.refusals,
      `${REFUSED_IMPORT_GRAPH_PROBLEM} ${changedPath} (${graph.problem}); ` +
        HELPER_IMPORT_GRAPH_HINT);
    return;
  }
  const tests = helperImportClosure(graph.importers, changedPath, classes);
  for (let index = 0; index < tests.length; index += 1) {
    addReason(evidence.plan, tests[index],
      `${REASON_HELPER_IMPORTER}${REASON_SEPARATOR}${changedPath}`);
  }
}

// package.json is not one semantic subsystem, so its OWNER depends on which
// fields moved. The runtime surface and the dependency set are broader than any
// subsystem and have already refused above; a dev-tooling-only edit is the
// development loop and belongs to test-infrastructure; anything else stays
// packaging metadata.
//
// Deliberately decided HERE and not in the path taxonomy: that table's job is
// classifying PATHS, and teaching it to read JSON fields would give it a second
// kind of authority. This is the boundary where changedPackageFields exists.
export function packageDevToolingSubsystem(changedPackageFields) {
  if (!arrayIsArray(changedPackageFields) ||
    changedPackageFields.length === 0) {
    return null;
  }
  return arrayEvery(changedPackageFields,
    (field) => arrayIncludes(PACKAGE_DEV_TOOLING_FIELDS, field)) ?
    SUBSYSTEM_TEST_INFRASTRUCTURE : null;
}

// One pass over the changed paths, gathering what they oblige. It decides
// nothing: the outcome is chosen once, by the caller, from this evidence.
// A test that observes the changed path without importing it is selected
// whatever else the path is - an inert document a test reads is still that
// test's input. Observation only ever adds proof.
function admitObservers(evidence, changedPath, observations, classes) {
  const observers = observersOf(observations, changedPath, classes);
  for (let index = 0; index < observers.length; index += 1) {
    addReason(evidence.plan, observers[index].test,
      `${REASON_OBSERVER}${REASON_SEPARATOR}${observers[index].kind}` +
        `${REASON_SEPARATOR}${changedPath}`);
  }
}

function collectChangeEvidence({
  root,
  changedPaths,
  classes,
  observations,
  contracts,
  vanished,
  packageSubsystem,
}) {
  const evidence = {
    plan: createOrderedStringMap(),
    subsystems: createOrderedStringSet(),
    coupledBy: createOrderedStringMap(),
    refusals: [],
    sourceChanged: false,
    importers: null,
  };
  for (let index = 0; index < changedPaths.length; index += 1) {
    const changedPath = changedPaths[index];
    admitObservers(evidence, changedPath, observations, classes);
    if (isInertPath(changedPath)) continue;
    if (stringEndsWith(changedPath, TEST_SUFFIX)) {
      admitChangedTest(evidence, changedPath, classes, vanished);
      continue;
    }
    if (changedPath === PACKAGE_MANIFEST_PATH && packageSubsystem) {
      evidence.sourceChanged = true;
      orderedStringSetAdd(evidence.subsystems, packageSubsystem);
      continue;
    }
    admitChangedSource(evidence, changedPath, classes, contracts);
    if (isTestSupportPath(changedPath)) {
      admitHelperImporters(evidence, changedPath, classes, root);
    }
  }
  return evidence;
}

// The whole decision. `changedPaths` are repository-relative.
//
// A product source change widens to its whole owning subsystem. That is
// deliberately conservative for version 1: narrowing an individual owner later
// requires independent evidence that the smaller set is complete, and there is
// no reason to spend that complexity on a subsystem that already runs quickly.
export function selectChangedTests({
  root,
  changedPaths,
  changedPackageFields,
  lockfileGraphChanged,
  vanishedPaths = createOrderedStringSet(),
}) {
  const releaseProblem = packageChangeRequiresRelease(
    changedPaths, changedPackageFields, lockfileGraphChanged);
  if (releaseProblem) {
    return refusedSelection(
      REFUSAL_RELEASE_PROOF_REQUIRED, [releaseProblem], []);
  }

  const manifest = readJson(root, SUBSYSTEM_MANIFEST_PATH);
  const classes = manifest?.classes || {};
  // The committed observation census is an authority only while it is the
  // live one: a test whose surfaces changed without the manifest following
  // could be silently unselected, so drift refuses (the gate then runs the
  // whole corpus) and names the regeneration.
  const changedTests = Object.create(null);
  for (let index = 0; index < changedPaths.length; index += 1) {
    changedTests[changedPaths[index]] = true;
  }
  const drifted = observationDrift(root, manifest, {ignore: changedTests});
  if (drifted.length > 0) {
    return refusedSelection(REFUSAL_UNKNOWN_SCOPE, [
      `${OBSERVATION_DRIFT_PROBLEM}: ` +
        arrayJoin(arraySlice(drifted, 0, OBSERVATION_DRIFT_LIMIT),
          AMBIGUITY_SEPARATOR) +
        (drifted.length > OBSERVATION_DRIFT_LIMIT ? DRIFT_ELLIPSIS : '') +
        `${REASON_SEPARATOR} ${OBSERVATION_DRIFT_HINT}`,
    ], []);
  }
  const evidence = collectChangeEvidence({
    root,
    changedPaths,
    classes,
    observations: manifest?.observations || {},
    contracts: readJson(root, IMPACT_CONTRACTS_PATH),
    vanished: vanishedPaths,
    packageSubsystem: packageDevToolingSubsystem(changedPackageFields),
  });
  if (evidence.refusals.length > 0) {
    return refusedSelection(REFUSAL_UNKNOWN_SCOPE, evidence.refusals,
      orderedStringSetValues(evidence.subsystems));
  }

  const subsystems = orderedStringSetValues(evidence.subsystems);
  for (let subsystemIndex = 0;
    subsystemIndex < subsystems.length;
    subsystemIndex += 1) {
    const subsystem = subsystems[subsystemIndex];
    const subsystemTests = testsForSubsystem(subsystem, root);
    for (let testIndex = 0;
      testIndex < subsystemTests.length;
      testIndex += 1) {
      const testPath = subsystemTests[testIndex];
      addReason(evidence.plan, testPath,
        `${REASON_SUBSYSTEM}${REASON_SEPARATOR}${subsystem}`);
      const pairIds = orderedStringMapGet(evidence.coupledBy, subsystem);
      const coupledReasons = pairIds ? orderedStringSetValues(pairIds) : [];
      for (let pairIndex = 0;
        pairIndex < coupledReasons.length;
        pairIndex += 1) {
        const pairId = coupledReasons[pairIndex];
        addReason(evidence.plan, testPath,
          `${REASON_COUPLED_WITNESS}${REASON_SEPARATOR}${pairId}`);
      }
    }
  }

  const tests = [];
  const plannedPaths = sortStrings(orderedStringMapKeys(evidence.plan));
  for (let index = 0; index < plannedPaths.length; index += 1) {
    const testPath = plannedPaths[index];
    appendArrayValue(tests, {
      path: testPath,
      reasons: sortStrings(orderedStringSetValues(
        orderedStringMapGet(evidence.plan, testPath))),
    });
  }
  return {
    kind: evidence.sourceChanged ? SELECTION_WIDENED : SELECTION_PRECISE,
    subsystems: sortStrings(subsystems),
    tests,
  };
}
