#!/usr/bin/env node
// The change-proof orchestrator.
//
//   node scripts/select-change-tests.js [--base <sha>] [--head <sha>] [--explain]
//
// This is what `npm test` runs. Without --base it proves the WORKING TREE,
// which is the inner-loop case; --base adds a committed range on top of it.
//
// It has exactly four responsibilities and no others:
//
//   1. load the fixed safety spine        (unconditional)
//   2. ask the selector for variable proof (PRECISE / WIDENED / REFUSED)
//   3. union and deduplicate
//   4. execute
//
// No ownership inference, no impact reasoning, no classification logic lives
// here - those belong to the selector library, which is itself exercised by
// tests inside the unconditional spine. That separation is what makes it safe
// for the spine to contain the selector's own contracts:
//
//   Layer 0  runner        can we execute an explicit list of files?
//   Layer 1  safety spine  is the machinery that makes selection trustworthy intact?
//   Layer 2  selector      which additional tests does THIS change require?
//
// Each layer proves the next. A selector that returned nothing would still
// leave the spine running, and the spine contains the selector's contract.

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';

import {selectChangedTests} from './checks/change-selection.js';
import {
  appendArrayValue,
  copyOwnDataArray,
  copyOwnDataRecord,
  copyOwnStringArray,
  createOrderedStringMap,
  createOrderedStringSet,
  orderedStringMapGet,
  orderedStringMapHas,
  orderedStringMapKeys,
  orderedStringMapSet,
  orderedStringSetAdd,
  orderedStringSetValues,
  sortStrings,
} from './checks/change-proof-string-collections.js';
import {
  changedRecords,
  resolvedCheckBase,
  semanticPaths,
  vanishedPaths,
} from './checks/changed-paths.js';
import {
  JSON_DIGIT_MAX,
  JSON_DIGIT_MIN,
  JSON_NUMBER_DECIMAL,
  JSON_NUMBER_EXPONENT_LOWER,
  JSON_NUMBER_EXPONENT_UPPER,
  JSON_NUMBER_MINUS,
  JSON_NUMBER_PLUS,
  JSON_STRING_ESCAPE,
  JSON_STRING_QUOTE,
  INVALID_EXECUTION_PLAN_INPUT_PROBLEM,
  INVALID_SELECTION_RESULT_PROBLEM,
  LOCKFILE_PACKAGES_FIELD,
  LOCKFILE_ROOT_PACKAGE_KEY,
  PACKAGE_MANIFEST_PATH,
  PACKAGE_LOCKFILE_PATH,
  INVALID_SAFETY_SPINE_PROBLEM,
  REASON_SAFETY_SPINE,
  REFUSAL_RELEASE_PROOF_REQUIRED,
  REFUSAL_BANNER,
  RELEASE_PROOF_HINT,
  SAFETY_SPINE_PATH,
  SAFETY_SPINE_TESTS_FIELD,
  SELECTION_PRECISE,
  SELECTION_REFUSED,
  SELECTION_WIDENED,
} from './checks/change-selection-constants.js';
import {runClassifiedTestFiles} from './run-classified-test-files.js';

const UTF8 = 'utf8';
const BASE_FLAG = '--base';
const HEAD_FLAG = '--head';
const EXPLAIN_FLAG = '--explain';
const LIST_FLAG = '--list';
const DEFAULT_HEAD = 'HEAD';
const NEWLINE = '\n';
const INDENT = '  ';
const BLANK = '';
const LABEL_CHANGED = 'changed:';
const LABEL_SUBSYSTEMS = 'subsystems:';
const LABEL_SELECTED_BY = 'selected by:';
const LABEL_SELECTION = 'selection:';
const LABEL_REASON = 'reason:';
const LABEL_TOTAL = 'total:';
const REFUSED_LABEL = 'REFUSED';
const TESTS_SUFFIX = ' test(s)';
const UNIQUE_TESTS_SUFFIX = ' unique test(s)';
const USAGE =
  'usage: node scripts/select-change-tests.js [--base <sha>] [--head <sha>] ' +
  '[--explain] [--list]\n';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayIndexOf = Function.call.bind(Array.prototype.indexOf);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arraySlice = Function.call.bind(Array.prototype.slice);
const jsonParse = JSON.parse.bind(JSON);
const numberIsSafeInteger = Number.isSafeInteger;
const objectHasOwn = Object.hasOwn;
const objectIs = Object.is;
const objectKeys = Object.keys;
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringSlice = Function.call.bind(String.prototype.slice);
const toNumber = Number;
const NEGATIVE_ZERO = -0;

export function loadSafetySpine(spineRoot = root) {
  const manifest = copyOwnDataRecord(jsonParse(
    fs.readFileSync(path.join(spineRoot, SAFETY_SPINE_PATH), UTF8)));
  return requireValidSafetySpine(manifest?.[SAFETY_SPINE_TESTS_FIELD]);
}

function requireValidSafetySpine(value) {
  const tests = copyOwnStringArray(value);
  if (!tests || tests.length === 0) {
    throw new Error(INVALID_SAFETY_SPINE_PROBLEM);
  }
  const unique = createOrderedStringSet(tests);
  if (orderedStringSetValues(unique).length !== tests.length) {
    throw new Error(INVALID_SAFETY_SPINE_PROBLEM);
  }
  return tests;
}

// Both sides of a rename and the vanished side of a deletion: a change that
// removed src/raft/x.js must still prove storage-raft, and a rename that
// crosses a subsystem boundary must prove BOTH owners.
export function changedPathsBetween(base, head, gitRoot = root) {
  const records = changedRecords({root: gitRoot, base, head});
  return records === null ? null : semanticPaths(records);
}

// Which of those paths this change REMOVED. Kept separate from the path list
// because the selector needs both: a vanished test is not unclassified, while
// a vanished source file must still prove its former owner.
export function vanishedPathsBetween(base, head, gitRoot = root) {
  const records = changedRecords({root: gitRoot, base, head});
  return records === null ? createOrderedStringSet() : vanishedPaths(records);
}

// Which top-level package.json keys differ between the two states. Computed
// here because it needs both; the selector stays a pure function of what it is
// told, and refuses when this cannot be determined.
//
// The AFTER state is the WORKING TREE unless a head revision is named, because
// the worktree is exactly what changedRecords already reports on. Comparing two
// committed revisions instead would read "no fields changed" for an
// uncommitted `dependencies` edit and let a dependency change - the broadest
// change there is - take the modular path.
export function changedPackageFields(base, head, gitRoot = root) {
  const changed = createOrderedStringSet();
  const comparisons = jsonStateComparisons(
    PACKAGE_MANIFEST_PATH, base, head, gitRoot);
  for (let comparisonIndex = 0;
    comparisonIndex < comparisons.length;
    comparisonIndex += 1) {
    const before = copyOwnDataRecord(comparisons[comparisonIndex][0]);
    const after = copyOwnDataRecord(comparisons[comparisonIndex][1]);
    if (!before || !after) return null;
    const keys = createOrderedStringSet(objectKeys(before));
    const afterKeys = objectKeys(after);
    for (let index = 0; index < afterKeys.length; index += 1) {
      orderedStringSetAdd(keys, afterKeys[index]);
    }
    const keyValues = orderedStringSetValues(keys);
    for (let index = 0; index < keyValues.length; index += 1) {
      const key = keyValues[index];
      const beforeOwn = objectHasOwn(before, key);
      const afterOwn = objectHasOwn(after, key);
      if (beforeOwn !== afterOwn ||
          (beforeOwn && !isDeepStrictEqual(before[key], after[key]))) {
        orderedStringSetAdd(changed, key);
      }
    }
  }
  return sortStrings(orderedStringSetValues(changed));
}

function parseJson(text) {
  try {
    if (hasPotentiallyLossyJsonNumber(text)) return null;
    return jsonParse(text);
  } catch {
    return null;
  }
}

function isDigit(character) {
  return character >= JSON_DIGIT_MIN && character <= JSON_DIGIT_MAX;
}

// Native JSON.parse rounds integers beyond Number's safe range and may also
// collapse distinct decimal/exponent spellings. Those forms are not needed by
// package manifests or npm lockfiles, so treat their presence as an unavailable
// semantic comparison and let the selector fail closed instead of guessing.
function hasPotentiallyLossyJsonNumber(text) {
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === JSON_STRING_ESCAPE) {
        escaped = true;
      } else if (character === JSON_STRING_QUOTE) {
        inString = false;
      }
      continue;
    }
    if (character === JSON_STRING_QUOTE) {
      inString = true;
      continue;
    }
    if (character !== JSON_NUMBER_MINUS && !isDigit(character)) continue;
    let end = index + 1;
    while (
      end < text.length &&
      (isDigit(text[end]) || text[end] === JSON_NUMBER_DECIMAL ||
        text[end] === JSON_NUMBER_EXPONENT_LOWER ||
        text[end] === JSON_NUMBER_EXPONENT_UPPER ||
        text[end] === JSON_NUMBER_PLUS || text[end] === JSON_NUMBER_MINUS)
    ) {
      end += 1;
    }
    const token = stringSlice(text, index, end);
    const numericValue = toNumber(token);
    if (
      stringIncludes(token, JSON_NUMBER_DECIMAL) ||
      stringIncludes(token, JSON_NUMBER_EXPONENT_LOWER) ||
      stringIncludes(token, JSON_NUMBER_EXPONENT_UPPER) ||
      !numberIsSafeInteger(numericValue) ||
      objectIs(numericValue, NEGATIVE_ZERO)
    ) {
      return true;
    }
    index = end - 1;
  }
  return false;
}

function jsonFromRevision(relativePath, revision, gitRoot) {
  const result = spawnSync('git', ['show', `${revision}:${relativePath}`],
    {cwd: gitRoot, encoding: UTF8});
  return result.status === 0 ? parseJson(result.stdout) : null;
}

function jsonFromWorktree(relativePath, gitRoot) {
  try {
    return parseJson(fs.readFileSync(path.join(gitRoot, relativePath), UTF8));
  } catch {
    return null;
  }
}

// changedRecords defines one proof input as the union of a committed range and
// current dirty state. Semantic JSON classification must use the same two
// comparisons or an explicit --head could make a visible dirty path disappear
// from the field/graph decision.
function jsonStateComparisons(relativePath, base, head, gitRoot) {
  const comparisons = [];
  if (base) {
    appendArrayValue(comparisons, [
      jsonFromRevision(relativePath, base, gitRoot),
      jsonFromRevision(relativePath, head || DEFAULT_HEAD, gitRoot),
    ]);
  }
  appendArrayValue(comparisons, [
    jsonFromRevision(relativePath, DEFAULT_HEAD, gitRoot),
    jsonFromWorktree(relativePath, gitRoot),
  ]);
  return comparisons;
}

function lockfileDependencyGraph(lockfile) {
  const graph = copyOwnDataRecord(lockfile);
  if (
    !graph ||
    !objectHasOwn(graph, LOCKFILE_PACKAGES_FIELD)
  ) {
    return null;
  }
  const packages = copyOwnDataRecord(graph.packages);
  if (!packages || !objectHasOwn(packages, LOCKFILE_ROOT_PACKAGE_KEY)) {
    return null;
  }
  const packagePaths = objectKeys(packages);
  for (let index = 0; index < packagePaths.length; index += 1) {
    const packagePath = packagePaths[index];
    const packageRecord = copyOwnDataRecord(packages[packagePath]);
    if (!packageRecord) return null;
    packages[packagePath] = packageRecord;
  }
  const rootPackage = packages[LOCKFILE_ROOT_PACKAGE_KEY];
  graph.packages = packages;
  delete graph.version;
  delete rootPackage.version;
  return graph;
}

// package-lock.json mixes root release identity with installed graph state.
// Compare the graph rather than the path: changing only the package's own
// version still needs packaging proof, but it does not need the full release
// proof reserved for a dependency graph that every subsystem consumes.
export function lockfileDependencyGraphChanged(base, head, gitRoot = root) {
  let unavailable = false;
  const comparisons = jsonStateComparisons(
    PACKAGE_LOCKFILE_PATH, base, head, gitRoot);
  for (let index = 0; index < comparisons.length; index += 1) {
    const beforeState = comparisons[index][0];
    const afterState = comparisons[index][1];
    const before = lockfileDependencyGraph(beforeState);
    const after = lockfileDependencyGraph(afterState);
    if (!before || !after) {
      unavailable = true;
    } else if (!isDeepStrictEqual(before, after)) {
      return true;
    }
  }
  return unavailable ? null : false;
}

// The union. The spine is added HERE, unconditionally, never by the selector.
export function buildExecutionPlan(options) {
  const input = copyOwnDataRecord(options);
  if (!input) throw new Error(INVALID_EXECUTION_PLAN_INPUT_PROBLEM);
  const {
    changedPaths: changedPathInput,
    packageFields: packageFieldInput,
    lockfileGraphChanged,
    vanished = createOrderedStringSet(),
    planRoot = root,
    selector = selectChangedTests,
    spine = loadSafetySpine,
  } = input;
  const changedPaths = copyOwnStringArray(changedPathInput);
  const packageFields = packageFieldInput === null ||
    packageFieldInput === undefined ? packageFieldInput :
    copyOwnStringArray(packageFieldInput);
  if (!changedPaths ||
      (packageFieldInput !== null && packageFieldInput !== undefined &&
        !packageFields) ||
      typeof planRoot !== 'string' || planRoot.length === 0 ||
      typeof selector !== 'function' || typeof spine !== 'function') {
    throw new Error(INVALID_EXECUTION_PLAN_INPUT_PROBLEM);
  }
  const selection = normalizeSelection(selector({
    root: planRoot,
    changedPaths,
    changedPackageFields: packageFields,
    lockfileGraphChanged,
    vanishedPaths: vanished,
  }));
  const selected = selection.tests;
  const spineTests = requireValidSafetySpine(spine(planRoot));
  const merged = createOrderedStringMap();
  for (let index = 0; index < spineTests.length; index += 1) {
    addPlanReasons(merged, spineTests[index], [REASON_SAFETY_SPINE]);
  }
  for (let index = 0; index < selected.length; index += 1) {
    const entry = selected[index];
    addPlanReasons(merged, entry.path, entry.reasons);
  }
  const tests = [];
  const testPaths = sortStrings(orderedStringMapKeys(merged));
  for (let index = 0; index < testPaths.length; index += 1) {
    const testPath = testPaths[index];
    appendArrayValue(tests, {
      path: testPath,
      reasons: orderedStringSetValues(orderedStringMapGet(merged, testPath)),
    });
  }
  return {
    kind: selection.kind,
    refusals: selection.refusals || [],
    refusalCode: selection.refusalCode || null,
    subsystems: selection.subsystems || [],
    changedPaths,
    spineCount: spineTests.length,
    selectedCount: selected.length,
    tests,
  };
}

function normalizeSelection(value) {
  const selection = copyOwnDataRecord(value);
  if (!selection ||
      (selection.kind !== SELECTION_PRECISE &&
        selection.kind !== SELECTION_WIDENED &&
        selection.kind !== SELECTION_REFUSED)) {
    throw new Error(INVALID_SELECTION_RESULT_PROBLEM);
  }
  const sourceTests = copyOwnDataArray(selection.tests);
  const tests = [];
  const selectedPaths = createOrderedStringSet();
  if (!sourceTests) throw new Error(INVALID_SELECTION_RESULT_PROBLEM);
  for (let index = 0; index < sourceTests.length; index += 1) {
    const entry = copyOwnDataRecord(sourceTests[index]);
    const reasons = copyOwnStringArray(entry?.reasons);
    if (!entry || typeof entry.path !== 'string' || entry.path.length === 0 ||
        !reasons || reasons.length === 0 ||
        orderedStringSetValues(selectedPaths).length !== index) {
      throw new Error(INVALID_SELECTION_RESULT_PROBLEM);
    }
    orderedStringSetAdd(selectedPaths, entry.path);
    appendArrayValue(tests, {path: entry.path, reasons});
  }
  if (orderedStringSetValues(selectedPaths).length !== tests.length ||
      (selection.kind === SELECTION_REFUSED && tests.length > 0)) {
    throw new Error(INVALID_SELECTION_RESULT_PROBLEM);
  }
  const subsystems = selection.subsystems === undefined ? [] :
    copyOwnStringArray(selection.subsystems);
  const refusals = selection.refusals === undefined ? [] :
    copyOwnStringArray(selection.refusals);
  const refusalCode = selection.refusalCode === undefined ? null :
    selection.refusalCode;
  if (!subsystems || !refusals ||
      (refusalCode !== null && typeof refusalCode !== 'string') ||
      (selection.kind === SELECTION_REFUSED &&
        (refusalCode === null || refusalCode.length === 0))) {
    throw new Error(INVALID_SELECTION_RESULT_PROBLEM);
  }
  return {
    kind: selection.kind,
    refusalCode,
    refusals,
    subsystems,
    tests,
  };
}

function addPlanReasons(plan, testPath, reasons) {
  if (!orderedStringMapHas(plan, testPath)) {
    orderedStringMapSet(plan, testPath, createOrderedStringSet());
  }
  const ownedReasons = orderedStringMapGet(plan, testPath);
  for (let index = 0; index < reasons.length; index += 1) {
    orderedStringSetAdd(ownedReasons, reasons[index]);
  }
}

// The ONE refusal rendering, shared by the dry run and the real command, so a
// caller can never meet a refusal shape it has not been taught to read. It
// always carries the banner and the machine-readable code; the release hint is
// added only where a release proof is actually the answer, because suggesting
// `check:release` for an unclassifiable path would teach operators to reach for
// the expensive command instead of fixing the taxonomy.
function renderRefusal(plan) {
  const lines = [REFUSAL_BANNER, `${INDENT}${LABEL_REASON} ${plan.refusalCode}`];
  for (let index = 0; index < plan.refusals.length; index += 1) {
    appendArrayValue(lines, INDENT + plan.refusals[index]);
  }
  if (plan.refusalCode === REFUSAL_RELEASE_PROOF_REQUIRED) {
    appendArrayValue(lines, INDENT + RELEASE_PROOF_HINT);
  }
  return arrayJoin(lines, NEWLINE) + NEWLINE;
}

function renderExplain(plan) {
  const lines = [LABEL_CHANGED];
  for (let index = 0; index < plan.changedPaths.length; index += 1) {
    appendArrayValue(lines, INDENT + plan.changedPaths[index]);
  }
  if (plan.kind === SELECTION_REFUSED) {
    appendArrayValue(lines, BLANK);
    appendArrayValue(lines, LABEL_SELECTION);
    appendArrayValue(lines, `${INDENT}${REFUSED_LABEL}`);
    appendArrayValue(lines, BLANK);
    return arrayJoin(lines, NEWLINE) + NEWLINE + renderRefusal(plan);
  }
  appendArrayValue(lines, BLANK);
  appendArrayValue(lines, LABEL_SUBSYSTEMS);
  for (let index = 0; index < plan.subsystems.length; index += 1) {
    appendArrayValue(lines, INDENT + plan.subsystems[index]);
  }
  const byReason = createOrderedStringMap();
  for (let testIndex = 0; testIndex < plan.tests.length; testIndex += 1) {
    const entry = plan.tests[testIndex];
    for (let reasonIndex = 0;
      reasonIndex < entry.reasons.length;
      reasonIndex += 1) {
      const reason = entry.reasons[reasonIndex];
      if (!orderedStringMapHas(byReason, reason)) {
        orderedStringMapSet(byReason, reason, []);
      }
      appendArrayValue(orderedStringMapGet(byReason, reason), entry.path);
    }
  }
  appendArrayValue(lines, BLANK);
  appendArrayValue(lines, LABEL_SELECTED_BY);
  const reasons = sortStrings(orderedStringMapKeys(byReason));
  for (let index = 0; index < reasons.length; index += 1) {
    const reason = reasons[index];
    appendArrayValue(lines, `${INDENT}${reason}: ` +
      `${orderedStringMapGet(byReason, reason).length}${TESTS_SUFFIX}`);
  }
  appendArrayValue(lines, BLANK);
  appendArrayValue(lines, LABEL_SELECTION);
  appendArrayValue(lines, `${INDENT}${plan.kind}`);
  appendArrayValue(lines, BLANK);
  appendArrayValue(lines, LABEL_TOTAL);
  appendArrayValue(lines,
    `${INDENT}${plan.tests.length}${UNIQUE_TESTS_SUFFIX}`);
  return arrayJoin(lines, NEWLINE) + NEWLINE;
}

// An optional flag that is present but has no value is a usage error, never a
// silently ignored one: `--base` with a missing sha must not quietly downgrade
// to a worktree-only proof.
function flagValue(argv, flag) {
  if (!arrayIncludes(argv, flag)) return {present: false, value: null};
  return {present: true, value: argv[arrayIndexOf(argv, flag) + 1] || null};
}

function parseInvocation(argv) {
  const base = flagValue(argv, BASE_FLAG);
  const head = flagValue(argv, HEAD_FLAG);
  return {
    valid: !(base.present && !base.value) && !(head.present && !head.value),
    base: resolvedCheckBase(base.value, process.env, root),
    head: head.value,
    headRevision: head.value || DEFAULT_HEAD,
    explain: arrayIncludes(argv, EXPLAIN_FLAG),
    list: arrayIncludes(argv, LIST_FLAG),
  };
}

function main() {
  const invocation = parseInvocation(arraySlice(process.argv, 2));
  if (!invocation.valid) {
    process.stderr.write(USAGE);
    process.exitCode = 1;
    return;
  }
  const changedPaths = changedPathsBetween(
    invocation.base, invocation.headRevision);
  if (changedPaths === null) {
    process.stderr.write(
      `cannot diff ${invocation.base}..${invocation.headRevision}${NEWLINE}`);
    process.exitCode = 1;
    return;
  }
  const plan = buildExecutionPlan({
    changedPaths,
    packageFields: changedPackageFields(invocation.base, invocation.head),
    lockfileGraphChanged: lockfileDependencyGraphChanged(
      invocation.base, invocation.head),
    vanished: vanishedPathsBetween(invocation.base, invocation.headRevision),
  });

  if (invocation.explain) {
    process.stdout.write(renderExplain(plan));
    if (plan.kind === SELECTION_REFUSED) process.exitCode = 1;
    return;
  }
  if (plan.kind === SELECTION_REFUSED) {
    process.stderr.write(renderRefusal(plan));
    process.exitCode = 1;
    return;
  }
  if (invocation.list) {
    process.stdout.write(
      arrayJoin(planTestPaths(plan), NEWLINE) + NEWLINE);
    return;
  }
  process.stdout.write(
    `${plan.kind}: ${plan.tests.length}${TESTS_SUFFIX} ` +
    `(${plan.spineCount} spine, ${plan.selectedCount} selected)${NEWLINE}`);
  process.exitCode = runClassifiedTestFiles(
    planTestPaths(plan), {root});
}

function planTestPaths(plan) {
  const paths = [];
  for (let index = 0; index < plan.tests.length; index += 1) {
    appendArrayValue(paths, plan.tests[index].path);
  }
  return paths;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
