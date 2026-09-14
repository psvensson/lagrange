#!/usr/bin/env node
// Subsystem classification owner.
//
// Exactly one authority assigns every tracked `*.test.js` file exactly one
// subsystem — the product responsibility it proves. This is the THIRD
// orthogonal dimension alongside primary (what kind of proof) and resource
// (how it may execute); see the constants module for why the three are
// independent.
//
// EVALUATION IS ALL-RULES, NEVER FIRST-MATCH:
//
//   exact override?  yes -> exactly that subsystem
//                    no  -> evaluate EVERY general rule
//   0 matches -> FAIL unclassified
//   1 match   -> classify
//   >1 match  -> FAIL ambiguous, naming every matching rule
//
// Rule order is presentation only. Disjointness is a property of the patterns,
// proven by the ambiguity audit rather than hidden behind precedence. A
// first-match chain would let a reordering silently change what CI runs.
//
// There is deliberately no fallback subsystem. A test the taxonomy cannot
// place must fail by name, because silent under-classification looks exactly
// like correct classification.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {collectTestFiles} from './test-primary-classification.js';
import {
  OBSERVATION_ARRAY_MINIMUM_ROOTS,
  OBSERVATION_BARE_ROOT_ARRAY_PATTERN,
  OBSERVATION_BARE_ROOT_CALL_PATTERN,
  OBSERVATION_CALL_OPENER_PATTERN,
  OBSERVATION_FILESYSTEM_CALL_NAME_PATTERN,
  OBSERVATION_HELPER_ROOTS,
  OBSERVATION_HELPER_SUFFIXES,
  OBSERVATION_IMPORT_SPECIFIER_PATTERN,
  OBSERVATION_TEST_SUFFIX,
  OBSERVATION_VOCABULARY_MODULE_SUFFIX,
  OBSERVATION_DRIFT_PROBLEM,
  OBSERVATION_ENV_DESTRUCTURING_PATTERN,
  OBSERVATION_ENV_NAME_PATTERN,
  OBSERVATION_ENV_PATTERNS,
  OBSERVATION_IGNORED_SEGMENT,
  OBSERVATION_IMPORT_LINE_PATTERN,
  OBSERVATION_KIND_DIRECTORY,
  OBSERVATION_KIND_ENV,
  OBSERVATION_KIND_FILE,
  OBSERVATION_KIND_NONE,
  OBSERVATION_LITERAL_PATTERN,
  OBSERVATION_RELATIVE_PATTERN,
  OBSERVATION_REPOSITORY_FILES,
  OBSERVATION_REPOSITORY_ROOTS,
  OBSERVATION_SCHEMA_VERSION,
  OBSERVATION_TEMPLATE_HOLE,
  OBSERVATION_TEST_DIRECTORY_ANCHOR_PATTERN,
  OBSERVATION_URL_CALL_PREFIX,
} from './test-subsystem-classification-constants.js';
import {
  SUBSYSTEM_AMBIGUOUS_PROBLEM,
  SUBSYSTEM_DEAD_OVERRIDE_PROBLEM,
  SUBSYSTEM_DEAD_RULE_PROBLEM,
  SUBSYSTEM_DIGEST_ALGORITHM_LABEL,
  SUBSYSTEM_DIGEST_HEX_WIDTH,
  SUBSYSTEM_EMPTY_SUBSYSTEM_PROBLEM,
  SUBSYSTEM_FNV1A32_OFFSET_BASIS,
  SUBSYSTEM_FNV1A32_PRIME,
  SUBSYSTEM_MANIFEST_ID,
  SUBSYSTEM_OVERRIDES,
  SUBSYSTEM_RULES,
  SUBSYSTEM_OVERRIDE_REASON_PROBLEM,
  SUBSYSTEM_SCHEMA_VERSION,
  SUBSYSTEM_SEPARATOR,
  SUBSYSTEM_UNCLASSIFIED_PROBLEM,
  SUBSYSTEM_UNKNOWN_SUBSYSTEM_PROBLEM,
  SUBSYSTEMS,
} from './test-subsystem-classification-constants.js';

export {
  SUBSYSTEM_MANIFEST_PATH,
  SUBSYSTEM_OVERRIDES,
  SUBSYSTEM_RULES,
  SUBSYSTEM_SCHEMA_VERSION,
  SUBSYSTEMS,
} from './test-subsystem-classification-constants.js';

// Ambient-intrinsic hardening (system-guidelines): capture the primitives at
// module load so a poisoned prototype cannot reroute the census.
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arraySome = Function.call.bind(Array.prototype.some);
const arraySort = Function.call.bind(Array.prototype.sort);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringMatchAll = Function.call.bind(String.prototype.matchAll);
const regExpTest = Function.call.bind(RegExp.prototype.test);
const objectKeys = Object.keys;
const objectHasOwn = Object.hasOwn;
const objectCreate = Object.create;
const stringIndexOf = Function.call.bind(String.prototype.indexOf);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringLastIndexOf = Function.call.bind(String.prototype.lastIndexOf);
const stringTrim = Function.call.bind(String.prototype.trim);
const UTF8 = 'utf8';
const POSIX_SEPARATOR = '/';
const CURRENT_DIRECTORY = '.';
const OBSERVATIONS_FIELD = 'observations';
const PARENT_DIRECTORY = '..';
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const stringPadStart = Function.call.bind(String.prototype.padStart);

const NEWLINE_SEPARATOR = '\n';
const HEX_RADIX = 16;
const PAD_CHARACTER = '0';
const RULE_JOIN = ' + ';
const OVERRIDE_RULE_ID = 'override';

// Every rule whose pattern matches. Callers decide what 0 or >1 means; this
// function never picks a winner.
export function subsystemRulesMatching(testPath) {
  return arrayFilter(SUBSYSTEM_RULES, (rule) => regExpTest(rule.pattern, testPath));
}

function classifyOne(testPath) {
  const override = Object.hasOwn(SUBSYSTEM_OVERRIDES, testPath) ?
    SUBSYSTEM_OVERRIDES[testPath] : null;
  if (override) {
    return {
      subsystem: override.subsystem,
      rule: OVERRIDE_RULE_ID,
      reason: override.reason,
      matched: 1,
    };
  }
  const hits = subsystemRulesMatching(testPath);
  if (hits.length === 1) {
    return {subsystem: hits[0].subsystem, rule: hits[0].id, matched: 1};
  }
  return {
    subsystem: null,
    rule: arrayMap(hits, (hit) => `${hit.id}->${hit.subsystem}`).join(RULE_JOIN),
    matched: hits.length,
  };
}

function pushOverrideProblems(censusSet, problems) {
  for (const testPath of Object.keys(SUBSYSTEM_OVERRIDES)) {
    if (!censusSet.has(testPath)) {
      problems.push(`${SUBSYSTEM_DEAD_OVERRIDE_PROBLEM}: ${testPath}`);
      continue;
    }
    if (!SUBSYSTEM_OVERRIDES[testPath].reason) {
      problems.push(`${SUBSYSTEM_OVERRIDE_REASON_PROBLEM}: ${testPath}`);
    }
  }
}

function pushLivenessProblems(ruleHits, counts, problems) {
  for (const rule of SUBSYSTEM_RULES) {
    if (ruleHits.get(rule.id) === 0) {
      problems.push(`${SUBSYSTEM_DEAD_RULE_PROBLEM}: ${rule.id}`);
    }
  }
  for (const subsystem of SUBSYSTEMS) {
    if (!counts[subsystem]) {
      problems.push(`${SUBSYSTEM_EMPTY_SUBSYSTEM_PROBLEM}: ${subsystem}`);
    }
  }
}

// Pure function of the live census plus the sealed taxonomy, so the manifest is
// fully reproducible. Returns the assignment plus every integrity problem found
// while building it (never throws: callers decide fatality).
export function deriveSubsystemClasses(root) {
  const census = collectTestFiles(root);
  const censusSet = new Set(census);
  const classes = {};
  const problems = [];
  const ruleHits = new Map(arrayMap(SUBSYSTEM_RULES, (rule) => [rule.id, 0]));
  const counts = {};
  for (const testPath of census) {
    const verdict = classifyOne(testPath);
    if (verdict.matched === 0) {
      problems.push(`${SUBSYSTEM_UNCLASSIFIED_PROBLEM}: ${testPath}`);
      continue;
    }
    if (verdict.matched > 1) {
      problems.push(
        `${SUBSYSTEM_AMBIGUOUS_PROBLEM}: ${testPath} [${verdict.rule}]`);
      continue;
    }
    if (!arrayIncludes(SUBSYSTEMS, verdict.subsystem)) {
      problems.push(
        `${SUBSYSTEM_UNKNOWN_SUBSYSTEM_PROBLEM}: ${testPath} -> ${verdict.subsystem}`);
      continue;
    }
    if (verdict.rule !== OVERRIDE_RULE_ID) {
      ruleHits.set(verdict.rule, ruleHits.get(verdict.rule) + 1);
    }
    classes[testPath] = verdict.subsystem;
    counts[verdict.subsystem] = (counts[verdict.subsystem] || 0) + 1;
  }
  pushOverrideProblems(censusSet, problems);
  pushLivenessProblems(ruleHits, counts, problems);
  return {census, classes, counts, problems};
}


// --- Observation census -------------------------------------------------------
const QUOTE_CHARACTERS = Object.freeze(['\'', '"', '`']);
const OPEN_PAREN = '(';
const CLOSE_PAREN = ')';
const ARGUMENT_COMMA = ',';
const BACKSLASH = '\\';
const IMPORT_META_URL = 'import.meta.url';

function stripTrailingSeparators(candidate) {
  let end = candidate.length;
  while (end > 1 && candidate[end - 1] === POSIX_SEPARATOR) end -= 1;
  return candidate.slice(0, end);
}

// A bare root name ('test', 'data') is ambiguous with an ordinary string, so
// a repository-relative literal must carry a separator; a bare root reaches
// the census only as a call or array argument, or through a joined call.
function isRepositoryLiteral(literal) {
  if (arrayIncludes(OBSERVATION_REPOSITORY_FILES, literal)) return true;
  const segments = stringSplit(literal, POSIX_SEPARATOR);
  return segments.length > 1 &&
    arrayIncludes(OBSERVATION_REPOSITORY_ROOTS, segments[0]);
}

function isBareRoot(literal) {
  return arrayIncludes(OBSERVATION_REPOSITORY_ROOTS, literal);
}

// A template literal observes its static prefix: `solve/quests/${id}/x`
// observes the solve/quests tree.
function staticPrefix(literal) {
  const hole = stringIndexOf(literal, OBSERVATION_TEMPLATE_HOLE);
  return hole < 0 ? literal : literal.slice(0, hole);
}

function resolveCandidate(testPath, rawLiteral, options = {}) {
  const literal = staticPrefix(rawLiteral);
  if (literal.length === 0) return null;
  const relative = regExpTest(OBSERVATION_RELATIVE_PATTERN, literal);
  if (options.anchoredAtTest || relative) {
    const resolved = stripTrailingSeparators(path.posix.normalize(
      path.posix.join(path.posix.dirname(testPath), literal)));
    return stringStartsWith(resolved, PARENT_DIRECTORY) ? null : resolved;
  }
  if (options.repositoryRoot || isRepositoryLiteral(literal)) {
    return stripTrailingSeparators(path.posix.normalize(literal));
  }
  return null;
}

const GIT_BINARY = 'git';
const GIT_TRACKED_ARGUMENTS = Object.freeze(['ls-files', '-z']);
const GIT_UNTRACKED_ARGUMENTS = Object.freeze(
  ['ls-files', '-z', '--others', '--exclude-standard']);
const NUL = '\0';
const pathIndexByRoot = objectCreate(null);

// A surface is REPOSITORY content: a tracked file, an untracked file git does
// not ignore, or a directory holding one. Resolving against the raw
// filesystem made an ignored leftover directory (solve/log in one working
// tree) a surface there and not in an exact checkout of the same commit, so
// the committed census disagreed with the gate's regeneration. Outside a git
// repository (the census witness's scratch tree) the filesystem is the index.
function buildPathIndex(root) {
  const files = objectCreate(null);
  const directories = objectCreate(null);
  let listed;
  try {
    listed = execFileSync(GIT_BINARY, [...GIT_TRACKED_ARGUMENTS],
      {cwd: root, encoding: UTF8}) +
      execFileSync(GIT_BINARY, [...GIT_UNTRACKED_ARGUMENTS],
        {cwd: root, encoding: UTF8});
  } catch {
    return null;
  }
  for (const entry of stringSplit(listed, NUL)) {
    if (entry.length === 0) continue;
    files[entry] = true;
    let parent = path.posix.dirname(entry);
    while (parent !== CURRENT_DIRECTORY && directories[parent] !== true) {
      directories[parent] = true;
      parent = path.posix.dirname(parent);
    }
  }
  return {files, directories};
}

function pathIndex(root) {
  if (!objectHasOwn(pathIndexByRoot, root)) {
    pathIndexByRoot[root] = buildPathIndex(root);
  }
  return pathIndexByRoot[root];
}

function filesystemKind(root, relative) {
  try {
    const stat = fs.statSync(path.join(root, relative));
    if (stat.isDirectory()) return OBSERVATION_KIND_DIRECTORY;
    if (stat.isFile()) return OBSERVATION_KIND_FILE;
  } catch {
    // A literal naming nothing in the tree is not a surface.
  }
  return OBSERVATION_KIND_NONE;
}

function surfaceKind(root, relative) {
  const index = pathIndex(root);
  if (index === null) return filesystemKind(root, relative);
  if (index.files[relative] === true) return OBSERVATION_KIND_FILE;
  if (index.directories[relative] === true) return OBSERVATION_KIND_DIRECTORY;
  return OBSERVATION_KIND_NONE;
}

// Uniqueness through an own-property map: `new Set(values)` looks up the
// prototype's add dynamically, which the collection-pollution falsifier
// replaces.
function sortedUnique(values) {
  const seen = objectCreate(null);
  const unique = [];
  for (const value of values) {
    if (seen[value] === true) continue;
    seen[value] = true;
    unique.push(value);
  }
  return arraySort(unique);
}

// The argument text of the call opening at `openIndex` (the index of its
// '('), read with balanced parentheses and quote awareness, or null when the
// call never closes. Returns the closing index too.
function callArgumentText(source, openIndex) {
  let depth = 0;
  let quote = null;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== null) {
      if (character === BACKSLASH) index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (arrayIncludes(QUOTE_CHARACTERS, character)) {
      quote = character;
    } else if (character === OPEN_PAREN) {
      depth += 1;
    } else if (character === CLOSE_PAREN) {
      depth -= 1;
      if (depth === 0) {
        return {text: source.slice(openIndex + 1, index), closeIndex: index};
      }
    }
  }
  return null;
}

// Top-level comma-separated arguments of a call's argument text.
function splitArguments(text) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = '';
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote !== null) {
      current += character;
      if (character === BACKSLASH) {
        current += text[index + 1] || '';
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (arrayIncludes(QUOTE_CHARACTERS, character)) quote = character;
    else if (character === OPEN_PAREN) depth += 1;
    else if (character === CLOSE_PAREN) depth -= 1;
    if (character === ARGUMENT_COMMA && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  parts.push(current);
  return parts;
}

function quotedBody(argument) {
  const trimmed = stringTrim(argument);
  if (trimmed.length < 2) return null;
  const quote = trimmed[0];
  if (!arrayIncludes(QUOTE_CHARACTERS, quote) ||
      trimmed[trimmed.length - 1] !== quote) return null;
  return trimmed.slice(1, -1);
}

// One joined path per join/resolve/new URL call: the literal arguments in
// order, anchored at the test's directory when a leading __dirname,
// dirname(...), import.meta or a URL base of import.meta.url says so.
function joinedCallCandidates(source) {
  const candidates = [];
  const consumed = objectCreate(null);
  for (const opener of stringMatchAll(source, OBSERVATION_CALL_OPENER_PATTERN)) {
    const openIndex = opener.index + opener[0].length - 1;
    const call = callArgumentText(source, openIndex);
    if (call === null) continue;
    const isUrl = stringStartsWith(opener[0], OBSERVATION_URL_CALL_PREFIX);
    const parts = splitArguments(call.text);
    const literals = [];
    let anchoredAtTest = false;
    for (let index = 0; index < parts.length; index += 1) {
      const body = quotedBody(parts[index]);
      if (body !== null) {
        if (isUrl && index > 0) continue;
        literals.push(body);
        consumed[body] = true;
      } else if (literals.length === 0 &&
          regExpTest(OBSERVATION_TEST_DIRECTORY_ANCHOR_PATTERN, parts[index])) {
        anchoredAtTest = true;
      } else if (isUrl && stringIncludes(parts[index], IMPORT_META_URL)) {
        anchoredAtTest = true;
      }
    }
    if (literals.length === 0) continue;
    const joinedLiteral = literals.join(POSIX_SEPARATOR);
    const repositoryRoot = !anchoredAtTest &&
      !regExpTest(OBSERVATION_RELATIVE_PATTERN, joinedLiteral) &&
      isBareRoot(stringSplit(joinedLiteral, POSIX_SEPARATOR)[0]);
    candidates.push({literal: joinedLiteral, anchoredAtTest, repositoryRoot});
  }
  return {candidates, consumed};
}

const BARE_ROOT_CONTEXT_WINDOW = 80;
const ARRAY_OPEN = '[';
const ARRAY_CLOSE = ']';

// Whether a bare root literal at `index` is a surface: the argument of a
// file-system-flavoured call, or one of several roots in an array literal.
function bareRootIsSurface(source, index) {
  const before = source.slice(Math.max(0, index - BARE_ROOT_CONTEXT_WINDOW), index);
  const call = OBSERVATION_BARE_ROOT_CALL_PATTERN.exec(before);
  if (call) {
    return regExpTest(OBSERVATION_FILESYSTEM_CALL_NAME_PATTERN, call[1]);
  }
  if (!regExpTest(OBSERVATION_BARE_ROOT_ARRAY_PATTERN, before)) return false;
  const arrayStart = stringLastIndexOf(source, ARRAY_OPEN, index);
  const arrayEnd = stringIndexOf(source, ARRAY_CLOSE, index);
  if (arrayStart < 0 || arrayEnd < 0) return false;
  let roots = 0;
  for (const entry of stringMatchAll(source.slice(arrayStart, arrayEnd),
    OBSERVATION_LITERAL_PATTERN)) {
    if (isBareRoot(entry[2])) roots += 1;
  }
  return roots >= OBSERVATION_ARRAY_MINIMUM_ROOTS;
}

function lineOf(source, index) {
  const lineStart = stringLastIndexOf(source, NEWLINE_SEPARATOR, index - 1) + 1;
  let lineEnd = stringIndexOf(source, NEWLINE_SEPARATOR, index);
  if (lineEnd < 0) lineEnd = source.length;
  return source.slice(lineStart, lineEnd);
}

function envSurfaces(source) {
  const names = [];
  for (const pattern of OBSERVATION_ENV_PATTERNS) {
    for (const match of stringMatchAll(source, pattern)) names.push(match[1]);
  }
  for (const match of stringMatchAll(source, OBSERVATION_ENV_DESTRUCTURING_PATTERN)) {
    for (const name of stringMatchAll(match[1], OBSERVATION_ENV_NAME_PATTERN)) {
      names.push(name[1]);
    }
  }
  return names;
}

// The surfaces one module's own source text names, anchored at that module.
function ownSurfaces(root, modulePath, source) {
  const files = [];
  const directories = [];
  const record = (resolved) => {
    if (resolved === null || resolved === modulePath ||
        resolved === CURRENT_DIRECTORY ||
        stringIncludes(resolved, OBSERVATION_IGNORED_SEGMENT)) return;
    const kind = surfaceKind(root, resolved);
    if (kind === OBSERVATION_KIND_FILE) files.push(resolved);
    else if (kind === OBSERVATION_KIND_DIRECTORY) directories.push(resolved);
  };
  const joined = joinedCallCandidates(source);
  for (const candidate of joined.candidates) {
    record(resolveCandidate(modulePath, candidate.literal, candidate));
  }
  for (const match of stringMatchAll(source, OBSERVATION_LITERAL_PATTERN)) {
    const literal = match[2];
    if (joined.consumed[literal] === true) continue;
    if (regExpTest(OBSERVATION_IMPORT_LINE_PATTERN, lineOf(source, match.index))) {
      continue;
    }
    const bareRootArgument = isBareRoot(literal) &&
      bareRootIsSurface(source, match.index);
    record(resolveCandidate(modulePath, literal, {repositoryRoot: bareRootArgument}));
  }
  return {files, directories, env: envSurfaces(source)};
}

function isHelperModule(relative) {
  if (stringEndsWith(relative, OBSERVATION_TEST_SUFFIX) ||
      stringEndsWith(relative, OBSERVATION_VOCABULARY_MODULE_SUFFIX)) {
    return false;
  }
  return arraySome(OBSERVATION_HELPER_ROOTS,
    (prefix) => stringStartsWith(relative, prefix)) &&
    arraySome(OBSERVATION_HELPER_SUFFIXES,
      (suffix) => stringEndsWith(relative, suffix));
}

// The helper modules a source imports by relative specifier, resolved
// against the importing module's directory; only existing non-test modules
// under the helper roots are followed.
function importedHelpers(modulePath, source) {
  const helpers = [];
  for (const match of stringMatchAll(source, OBSERVATION_IMPORT_SPECIFIER_PATTERN)) {
    const specifier = match[2] || match[4];
    if (!specifier || !regExpTest(OBSERVATION_RELATIVE_PATTERN, specifier)) {
      continue;
    }
    const resolved = path.posix.normalize(
      path.posix.join(path.posix.dirname(modulePath), specifier));
    if (isHelperModule(resolved)) helpers.push(resolved);
  }
  return helpers;
}

/**
 * The observation surfaces of one test: what its own source names plus what
 * every helper in its relative import closure (non-test modules under test/,
 * scripts/ and src/test-helpers/) names, anchored at each module. A checker
 * under scripts/ that walks src/ makes the test that calls it a whole-src
 * observer; a fixture loader under test/ makes its callers observers of the
 * fixtures. Every quoted literal that names an existing repository file or
 * directory counts (repository-relative with a separator, relative to the
 * module's own directory, joined through path.join/resolve or new URL, a
 * template's static prefix, or a bare root name given to a
 * filesystem-flavoured call), except import specifiers; plus every
 * process.env variable read. Over-inclusion only widens proof; a literal the
 * census cannot resolve is not a surface.
 * @param {string} root repository root
 * @param {string} testPath repository-relative test path
 * @return {{files: string[], directories: string[], env: string[]}}
 */
export function observationSurfacesOf(root, testPath) {
  const files = [];
  const directories = [];
  const env = [];
  const visited = objectCreate(null);
  const frontier = [testPath];
  visited[testPath] = true;
  for (let cursor = 0; cursor < frontier.length; cursor += 1) {
    const modulePath = frontier[cursor];
    let source;
    try {
      source = fs.readFileSync(path.join(root, modulePath), UTF8);
    } catch {
      continue;
    }
    const own = ownSurfaces(root, modulePath, source);
    files.push(...own.files);
    directories.push(...own.directories);
    env.push(...own.env);
    for (const helper of importedHelpers(modulePath, source)) {
      if (visited[helper] === true) continue;
      visited[helper] = true;
      frontier.push(helper);
    }
  }
  const surfaces = {};
  if (files.length > 0) surfaces[OBSERVATION_KIND_FILE] = sortedUnique(files);
  if (directories.length > 0) {
    surfaces[OBSERVATION_KIND_DIRECTORY] = sortedUnique(directories);
  }
  if (env.length > 0) surfaces[OBSERVATION_KIND_ENV] = sortedUnique(env);
  return surfaces;
}

/**
 * The observation census over every classified test: test path -> surfaces,
 * omitting tests that observe nothing.
 * @param {string} root
 * @param {string[]} census the test paths
 * @return {Object<string, Object>}
 */
export function deriveObservations(root, census) {
  const observations = {};
  for (const testPath of arraySort([...census])) {
    const surfaces = observationSurfacesOf(root, testPath);
    if (objectKeys(surfaces).length > 0) observations[testPath] = surfaces;
  }
  return observations;
}

// Structural comparison: a polluted JSON.stringify must not turn every
// census into drift (the collection-pollution falsifier exercises this).
function stringListsEqual(left, right) {
  const leftList = left || [];
  const rightList = right || [];
  if (leftList.length !== rightList.length) return false;
  for (let index = 0; index < leftList.length; index += 1) {
    if (leftList[index] !== rightList[index]) return false;
  }
  return true;
}

function surfacesEqual(left, right) {
  const leftSurfaces = left || {};
  const rightSurfaces = right || {};
  for (const kind of [OBSERVATION_KIND_FILE, OBSERVATION_KIND_DIRECTORY,
    OBSERVATION_KIND_ENV]) {
    if (!stringListsEqual(leftSurfaces[kind], rightSurfaces[kind])) return false;
  }
  return true;
}

// The observation digest over a canonical line form, so no serializer's
// prototype takes part in it.
export function observationDigestOf(observations) {
  const lines = [];
  for (const testPath of arraySort(objectKeys(observations))) {
    const surfaces = observations[testPath];
    for (const kind of [OBSERVATION_KIND_FILE, OBSERVATION_KIND_DIRECTORY,
      OBSERVATION_KIND_ENV]) {
      for (const surface of surfaces[kind] || []) {
        lines.push(`${testPath}${SUBSYSTEM_SEPARATOR}${kind}` +
          `${SUBSYSTEM_SEPARATOR}${surface}`);
      }
    }
  }
  return fnv1a32(lines.join(NEWLINE_SEPARATOR));
}

/**
 * The tests whose committed observation entry differs from the live census.
 * Only tests present both in the tree and in the manifest are compared: an
 * unclassified test is the classification's problem, a deleted one nobody's.
 * A caller may ignore tests it already selects (its own changed tests): drift
 * matters for the UNCHANGED test the census would otherwise misplace.
 * @param {string} root
 * @param {Object} manifest the committed subsystem manifest
 * @param {{ignore?: Object<string, boolean>}} [options]
 * @return {string[]} sorted test paths that drifted
 */
export function observationDrift(root, manifest, options = {}) {
  const classes = manifest?.classes || {};
  const declared = manifest?.[OBSERVATIONS_FIELD] || {};
  const ignored = options.ignore || {};
  const drifted = [];
  for (const testPath of objectKeys(classes)) {
    if (objectHasOwn(ignored, testPath)) continue;
    if (!fs.existsSync(path.join(root, testPath))) continue;
    if (!surfacesEqual(declared[testPath],
      observationSurfacesOf(root, testPath))) {
      drifted.push(testPath);
    }
  }
  return arraySort(drifted);
}

/**
 * Every classified test that observes changedPath: by file, or by a directory
 * the path lies under.
 * @param {Object} observations manifest observations
 * @param {string} changedPath repository-relative
 * @param {Object} classes the classification (only classified tests count)
 * @return {Array<{test: string, kind: string}>} sorted by test path
 */
export function observersOf(observations, changedPath, classes) {
  const observers = [];
  for (const testPath of arraySort(objectKeys(observations || {}))) {
    if (!objectHasOwn(classes, testPath)) continue;
    const surfaces = observations[testPath];
    if (arrayIncludes(surfaces[OBSERVATION_KIND_FILE] || [], changedPath)) {
      observers.push({test: testPath, kind: OBSERVATION_KIND_FILE});
      continue;
    }
    if (arraySome(surfaces[OBSERVATION_KIND_DIRECTORY] || [],
      (directory) => stringStartsWith(changedPath, directory + POSIX_SEPARATOR))) {
      observers.push({test: testPath, kind: OBSERVATION_KIND_DIRECTORY});
    }
  }
  return observers;
}

export {OBSERVATION_DRIFT_PROBLEM, OBSERVATION_SCHEMA_VERSION};

function fnv1a32(input) {
  let hash = SUBSYSTEM_FNV1A32_OFFSET_BASIS;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, SUBSYSTEM_FNV1A32_PRIME) >>> 0;
  }
  const hex = stringPadStart(
    hash.toString(HEX_RADIX), SUBSYSTEM_DIGEST_HEX_WIDTH, PAD_CHARACTER);
  return `${SUBSYSTEM_DIGEST_ALGORITHM_LABEL}-${hex}`;
}

// The manifest's only digest: path -> subsystem. There is deliberately no second
// digest over rule identity. Three earlier review rounds all failed the same way
// - an extra representation became a thing that itself needed verifying - so the
// rule that placed a test is DERIVED on demand by --explain, never published.
export function subsystemManifestDigest(classes) {
  return fnv1a32(arrayMap(
    Object.keys(classes).sort(),
    (testPath) => `${testPath}${SUBSYSTEM_SEPARATOR}${classes[testPath]}`)
    .join(NEWLINE_SEPARATOR));
}

export function buildSubsystemManifest(root) {
  const {census, classes, counts, problems} = deriveSubsystemClasses(root);
  const sortedCounts = {};
  for (const subsystem of SUBSYSTEMS) {
    if (counts[subsystem]) sortedCounts[subsystem] = counts[subsystem];
  }
  const observations = deriveObservations(root, Object.keys(classes));
  return {
    schemaVersion: SUBSYSTEM_SCHEMA_VERSION,
    id: SUBSYSTEM_MANIFEST_ID,
    counts: sortedCounts,
    censusSize: census.length,
    digest: subsystemManifestDigest(classes),
    observationSchemaVersion: OBSERVATION_SCHEMA_VERSION,
    observationDigest: observationDigestOf(observations),
    classes,
    observations,
    problems,
  };
}

// Why one test landed where it did. Derived live, so no stored explanation can
// drift from the rules that actually run.
export function explainSubsystemClassification(testPath) {
  if (Object.hasOwn(SUBSYSTEM_OVERRIDES, testPath)) {
    const override = SUBSYSTEM_OVERRIDES[testPath];
    return {
      subsystem: override.subsystem,
      rule: OVERRIDE_RULE_ID,
      reason: override.reason,
    };
  }
  const hits = subsystemRulesMatching(testPath);
  if (hits.length === 1) return {subsystem: hits[0].subsystem, rule: hits[0].id};
  return {
    subsystem: null,
    rule: null,
    matched: arrayMap(hits, (hit) => `${hit.id}->${hit.subsystem}`),
  };
}

// The selector's question, reserved for Stage 2: which files prove this area.
export function testsForSubsystem(manifest, subsystem) {
  return arrayFilter(
    Object.keys(manifest.classes).sort(),
    (testPath) => manifest.classes[testPath] === subsystem);
}
