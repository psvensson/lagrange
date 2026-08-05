// Static import-closure completeness for a landing candidate. Independent
// verifiers repeatedly reject candidates whose files import a changed owner
// that was left out of the candidate's path set — each omission discovered one
// full verification cycle at a time. This projection finds those gaps
// deterministically before a verifier turn is spent: a source file changed
// relative to the candidate's base but absent from the candidate is suspect,
// and one that a candidate file directly imports is a near-certain rejection.
// Advisory by design: it never blocks the gate, it informs the pre-delegation
// decision in `next` and `checkpoint --dry-run`.

import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {
  initSync as initializeModuleLexer,
  parse as parseModuleImports,
} from 'es-module-lexer';

import {requiresSourceVerification} from './change-artifact.js';

const JS_EXTENSION = '.js';
const LINE_SEPARATOR = '\n';
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIsArray = Array.isArray;
const arrayPush = Function.call.bind(Array.prototype.push);
const arraySlice = Function.call.bind(Array.prototype.slice);
const arraySort = Function.call.bind(Array.prototype.sort);
const setAdd = Function.call.bind(Set.prototype.add);
const setHas = Function.call.bind(Set.prototype.has);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

initializeModuleLexer();

function gitLines(root, args) {
  // stderr is piped, not inherited: an unreadable base is an expected degrade
  // path (caller catches), and git's "fatal:" noise must not leak into `next`.
  const out = execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return arrayFilter(stringSplit(out, LINE_SEPARATOR), Boolean);
}

// Every tracked path changed between baseCommit and the working tree, plus
// untracked (not ignored) files — i.e. everything the candidate's byte
// comparison surface could differ on — filtered to source-verification scope.
export function changedSourcePathsSinceBase(root, baseCommit) {
  const changed = gitLines(root, ['diff', '--name-only', baseCommit]);
  const untracked = gitLines(root,
    ['ls-files', '--others', '--exclude-standard']);
  const unique = [];
  const seen = new Set();
  for (let index = 0; index < changed.length; index += 1) {
    const filePath = changed[index];
    if (!setHas(seen, filePath)) {
      setAdd(seen, filePath);
      arrayPush(unique, filePath);
    }
  }
  for (let index = 0; index < untracked.length; index += 1) {
    const filePath = untracked[index];
    if (!setHas(seen, filePath)) {
      setAdd(seen, filePath);
      arrayPush(unique, filePath);
    }
  }
  const sourcePaths = arrayFilter(unique, requiresSourceVerification);
  arraySort(sourcePaths);
  return sourcePaths;
}

function relativeImportSpecifiers(root, importer) {
  const absolute = path.join(root, importer);
  let source;
  try {
    source = fs.readFileSync(absolute, 'utf8');
  } catch {
    return [];
  }
  let parsed;
  try {
    parsed = parseModuleImports(source);
  } catch {
    return [];
  }
  const specifiers = [];
  const imports = arrayIsArray(parsed?.[0]) ? parsed[0] : [];
  for (let index = 0; index < imports.length; index += 1) {
    const entry = imports[index];
    if (entry.d !== -1) continue;
    const specifier = entry.n;
    if (typeof specifier === 'string' && stringStartsWith(specifier, '.')) {
      arrayPush(specifiers, specifier);
    }
  }
  return specifiers;
}

function resolveRepoRelative(importer, specifier) {
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(importer), specifier));
  return stringEndsWith(resolved, JS_EXTENSION) ?
    resolved : `${resolved}${JS_EXTENSION}`;
}

// Compute the candidate's closure gaps. `candidate` needs `baseCommit` and
// `paths`; both come from the landing candidate built by verificationState.
// Options: `changedPaths` injects the changed-file list (tests, callers that
// already ran git).
export function importClosureGaps(root, candidate, options = {}) {
  const empty = {omittedChangedPaths: [], importGaps: []};
  const candidatePaths = arraySlice(candidate?.paths || []);
  if (!candidate?.baseCommit || candidatePaths.length === 0) return empty;
  let changed;
  try {
    changed = arraySlice(options.changedPaths ||
      changedSourcePathsSinceBase(root, candidate.baseCommit));
  } catch {
    // An unreadable base (e.g. shallow history) yields no projection rather
    // than a false gap; the exact-fingerprint gate still guards correctness.
    return empty;
  }
  const candidateSet = new Set();
  for (let index = 0; index < candidatePaths.length; index += 1) {
    setAdd(candidateSet, candidatePaths[index]);
  }
  const omitted = arrayFilter(changed,
    (filePath) => !setHas(candidateSet, filePath));
  if (omitted.length === 0) return empty;
  const omittedSet = new Set();
  for (let index = 0; index < omitted.length; index += 1) {
    setAdd(omittedSet, omitted[index]);
  }
  const gapKeys = new Set();
  const gaps = [];
  for (let importerIndex = 0;
    importerIndex < candidatePaths.length;
    importerIndex += 1) {
    const importer = candidatePaths[importerIndex];
    if (!stringEndsWith(importer, JS_EXTENSION)) continue;
    const specifiers = relativeImportSpecifiers(root, importer);
    for (let specifierIndex = 0;
      specifierIndex < specifiers.length;
      specifierIndex += 1) {
      const specifier = specifiers[specifierIndex];
      const imported = resolveRepoRelative(importer, specifier);
      if (!setHas(omittedSet, imported)) continue;
      const gapKey = `${importer}\0${imported}`;
      if (setHas(gapKeys, gapKey)) continue;
      setAdd(gapKeys, gapKey);
      arrayPush(gaps, {importer, imported});
    }
  }
  arraySort(gaps, (left, right) => {
    const leftKey = `${left.importer}\0${left.imported}`;
    const rightKey = `${right.importer}\0${right.imported}`;
    if (leftKey < rightKey) return -1;
    if (leftKey > rightKey) return 1;
    return 0;
  });
  return {
    omittedChangedPaths: omitted,
    importGaps: gaps,
  };
}
