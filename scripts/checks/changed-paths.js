// ONE definition of "changed", shared by change selection and fast static.
//
// This is shared INPUT DERIVATION, not shared proof logic, so it does not
// recreate the circularity the rest of this work has been removing. The reason
// to share it is concrete: if the selector, eslint, the scoped ratchets and the
// guideline checks each asked git independently, "changed" would eventually
// mean four subtly different things around staged, unstaged and untracked
// files - and the differences would show up as a check that silently examined
// nothing.
//
// The worktree universe is what a developer intuitively expects:
//
//   committed diff from base
// + staged changes
// + tracked working-tree modifications
// + non-ignored untracked files
//
// Untracked files matter for the same reason they matter to the taxonomy: a
// brand-new src/foo.js must be linted and scoped-ratcheted BEFORE `git add`,
// not after, or the checks lapse exactly when a human is least likely to look.
//
// CHANGE RECORDS, NOT PATH STRINGS. A deleted file has no current path, so a
// list of existing paths would drop it from selection entirely - deleting
// src/raft/x.js would prove nothing at all. A rename has TWO semantic sides,
// and if it crosses a subsystem boundary both owners must be proved. Static
// checks consume the paths that still exist; the selector consumes both sides.

import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  CHANGE_ADDED,
  CHANGE_DELETED,
  CHANGE_MODIFIED,
  CHANGE_RENAMED,
  CHECK_BASE_ENV,
  RANGE_SOURCE,
  WORKSPACE_INJECTION_ENV,
} from './change-selection-constants.js';
import {
  appendArrayValue,
  appendArrayValues,
  createOrderedStringMap,
  createOrderedStringSet,
  orderedStringMapHas,
  orderedStringMapSet,
  orderedStringMapValues,
  orderedStringSetAdd,
  orderedStringSetHas,
  orderedStringSetValues,
  sortByStringProjection,
  sortStrings,
  stringCollectionHas,
} from './change-proof-string-collections.js';
import {execGit, isGitOutputTooLarge} from './git-invocation.js';
import {gitProcessEnvironment} from './git-process-environment.js';

// Intrinsics captured at module load. Every string below arrives from `git`,
// which is external data by the adversarial-intrinsics rule: a replaced
// String.prototype.startsWith could turn a deletion into a modification and
// quietly remove its owner from the proof.
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arraySome = Function.call.bind(Array.prototype.some);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const UTF8 = 'utf8';
const NEWLINE = '\n';
const TAB = '\t';
const DEFAULT_HEAD = 'HEAD';
const RENAME_DETECTION = '-M';
const NAME_STATUS = '--name-status';
const DIFF = 'diff';
const CACHED = '--cached';
const LS_FILES = 'ls-files';
const OTHERS = '--others';
const EXCLUDE_STANDARD = '--exclude-standard';
const STATUS_RENAMED_PREFIX = 'R';
const STATUS_DELETED_PREFIX = 'D';
const STATUS_ADDED_PREFIX = 'A';
const INJECTION_SEPARATOR = ',';
const PATH_SEPARATOR = '/';
const MERGE_BASE = 'merge-base';
const PUBLICATION_REMOTE = 'origin/main';
const REV_PARSE = 'rev-parse';
const VERIFY = '--verify';
const QUIET = '--quiet';
const END_OF_OPTIONS = '--end-of-options';
const COMMIT_PEEL = '^{commit}';
const UNRESOLVED_BASE = 'the declared check base does not name a commit here: ';
// The repository this process runs from: the one a declared range names.
const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Null when git cannot answer (no base, not a repository). Output past the
// git output bound is not that: it is a failure of its own and propagates.
function git(root, args) {
  try {
    return arrayFilter(
      stringSplit(execGit(args, {
        cwd: root,
        encoding: UTF8,
        env: gitProcessEnvironment(),
      }), NEWLINE),
      Boolean);
  } catch (error) {
    if (isGitOutputTooLarge(error)) throw error;
    return null;
  }
}

function parseNameStatus(lines) {
  const records = [];
  const sourceLines = lines || [];
  for (let index = 0; index < sourceLines.length; index += 1) {
    const line = sourceLines[index];
    const fields = stringSplit(line, TAB);
    const code = fields[0];
    if (stringStartsWith(code, STATUS_RENAMED_PREFIX)) {
      appendArrayValue(records, {
        status: CHANGE_RENAMED,
        oldPath: fields[1],
        path: fields[2],
      });
      continue;
    }
    if (stringStartsWith(code, STATUS_DELETED_PREFIX)) {
      appendArrayValue(records,
        {status: CHANGE_DELETED, oldPath: fields[1], path: null});
      continue;
    }
    appendArrayValue(records, {
      status: stringStartsWith(code, STATUS_ADDED_PREFIX) ?
        CHANGE_ADDED : CHANGE_MODIFIED,
      oldPath: null,
      path: fields[1],
    });
  }
  return records;
}

function dedupe(records) {
  const seen = createOrderedStringMap();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const key = `${record.status}:${record.oldPath || ''}:${record.path || ''}`;
    if (!orderedStringMapHas(seen, key)) {
      orderedStringMapSet(seen, key, record);
    }
  }
  return sortByStringProjection(orderedStringMapValues(seen),
    (record) => record.path || record.oldPath);
}

/**
 * The merge base with the publication remote, or null when the repository at
 * `root` has none. This is what a push would be measured against, so it is
 * the base an unqualified local proof means.
 * @param {string} root
 * @return {string|null}
 */
export function publicationBase(root) {
  const lines = git(root, [MERGE_BASE, PUBLICATION_REMOTE, DEFAULT_HEAD]);
  return lines && lines.length > 0 ? lines[0] : null;
}

// An explicit flag wins; otherwise the environment supplies the range; otherwise
// the range is what a push would carry: the merge base with the publication
// remote. Resolved HERE so the static layer and the change proof cannot
// disagree: `npm run check` runs them as two processes, and a base that reached
// only one of them would silently prove a narrower range on one side.
//
// The publication default exists because `HEAD` is the wrong base for a proof
// that gates a push: a change already committed locally - a `git am`, a direct
// commit, a rebase - differs from HEAD by nothing, so every changed-path
// checker examined nothing and reported ok. Only the working tree is proved
// when the repository has no publication remote, and the source says so.
export function resolvedCheckRange(explicitBase = null, env = process.env,
  root = null) {
  if (explicitBase) return {base: explicitBase, source: RANGE_SOURCE.FLAG};
  if (env[CHECK_BASE_ENV]) {
    return {base: env[CHECK_BASE_ENV], source: RANGE_SOURCE.ENVIRONMENT};
  }
  const published = root ? publicationBase(root) : null;
  if (published) return {base: published, source: RANGE_SOURCE.PUBLICATION};
  return {base: null, source: RANGE_SOURCE.WORKTREE};
}

// `root` is passed by every CLI boundary; a library caller that owns its own
// fallback omits it and receives only the declared base.
export function resolvedCheckBase(explicitBase = null, env = process.env,
  root = null) {
  return resolvedCheckRange(explicitBase, env, root).base;
}

/**
 * The base an edge walk over the repository at `root` measures from. A
 * declared range (LAGRANGE_CHECK_BASE) names a commit in the repository this
 * process runs from, so it applies to that repository alone; any other root -
 * a fixture, an audited clone - is measured from its own publication base.
 * Every check that walks history from "the base" asks here, so a placed lab
 * run, a land, the push gate and CI walk exactly the range they declared,
 * never a checkout's own (possibly stale) origin/main.
 * @param {string} root
 * @param {Object} [env]
 * @return {string|null}
 */
export function repositoryCheckBase(root, env = process.env) {
  return path.resolve(root) === REPOSITORY_ROOT ?
    resolvedCheckBase(null, env, root) : publicationBase(root);
}

/**
 * The resolved check base as a full commit id, or null when there is none -
 * what is handed to another checkout of this history, where a name such as
 * HEAD or origin/main would mean something else. A declared base that names
 * no commit here is refused, never dropped.
 * @param {string|null} explicitBase
 * @param {Object} env
 * @param {string} root
 * @return {string|null}
 */
export function resolvedCheckBaseCommit(explicitBase, env, root) {
  const base = resolvedCheckBase(explicitBase, env, root);
  if (!base) return null;
  const lines = git(root, [REV_PARSE, VERIFY, QUIET, END_OF_OPTIONS,
    `${base}${COMMIT_PEEL}`]);
  if (!lines || lines.length !== 1) throw new Error(`${UNRESOLVED_BASE}${base}`);
  return lines[0];
}

// What the assembling layer declared it injected into this worktree. Empty in
// an ordinary checkout, which is why local development still sees every
// nonignored untracked file: the workspace contents differ, the policy does
// not.
export function declaredWorkspaceInjections(env = process.env) {
  const declared = env[WORKSPACE_INJECTION_ENV];
  if (!declared) return createOrderedStringSet();
  return createOrderedStringSet(
    arrayFilter(stringSplit(declared, INJECTION_SEPARATOR), Boolean));
}

// A declared injection, or anything beneath one. Matching by DECLARED PATH
// rather than by file kind is the point: a symlink nobody declared is still
// repository content and must reach the taxonomy.
export function isWorkspaceInjection(candidate, injections) {
  if (!candidate || injections.size === 0) return false;
  if (stringCollectionHas(injections, candidate)) return true;
  const values = orderedStringSetValues(injections);
  for (let index = 0; index < values.length; index += 1) {
    const injection = values[index];
    if (stringStartsWith(candidate, `${injection}${PATH_SEPARATOR}`)) {
      return true;
    }
  }
  return false;
}

export function withoutWorkspaceInjections(paths, env = process.env) {
  const injections = declaredWorkspaceInjections(env);
  if (injections.size === 0) return paths;
  return arrayFilter(paths,
    (candidate) => !isWorkspaceInjection(candidate, injections));
}

// `base` optional: without it only the working tree is considered, which is the
// ordinary inner-loop case.
export function changedRecords({root, base = null, head = DEFAULT_HEAD}) {
  const records = [];
  if (base) {
    const committed = git(root,
      [DIFF, NAME_STATUS, RENAME_DETECTION, `${base}..${head}`]);
    if (committed === null) return null;
    appendArrayValues(records, parseNameStatus(committed));
  }
  appendArrayValues(records, parseNameStatus(
    git(root, [DIFF, NAME_STATUS, RENAME_DETECTION, DEFAULT_HEAD])));
  appendArrayValues(records, parseNameStatus(
    git(root, [DIFF, NAME_STATUS, RENAME_DETECTION, CACHED])));
  const untrackedPaths = git(root, [LS_FILES, OTHERS, EXCLUDE_STANDARD]) || [];
  for (let index = 0; index < untrackedPaths.length; index += 1) {
    appendArrayValue(records, {
      status: CHANGE_ADDED,
      oldPath: null,
      path: untrackedPaths[index],
    });
  }
  const injections = declaredWorkspaceInjections();
  return dedupe(arrayFilter(records, (record) =>
    !isWorkspaceInjection(record.path, injections) &&
    !isWorkspaceInjection(record.oldPath, injections)));
}

// Every path a change touches SEMANTICALLY, including the vanished side of a
// deletion and both sides of a rename. This is what the selector must classify.
export function semanticPaths(records) {
  const paths = createOrderedStringSet();
  const sourceRecords = records || [];
  for (let index = 0; index < sourceRecords.length; index += 1) {
    const record = sourceRecords[index];
    if (record.path) orderedStringSetAdd(paths, record.path);
    if (record.oldPath) orderedStringSetAdd(paths, record.oldPath);
  }
  return sortStrings(orderedStringSetValues(paths));
}

// Paths this change made VANISH: the old side of a deletion or rename, unless
// some other record still puts that same path in the tree. A vanished test
// cannot be run and cannot be under-tested, so it must not be mistaken for an
// unclassified one - deleting a test would otherwise refuse the whole proof.
export function vanishedPaths(records) {
  const sourceRecords = records || [];
  const present = createOrderedStringSet();
  for (let index = 0; index < sourceRecords.length; index += 1) {
    const record = sourceRecords[index];
    if (record.path) orderedStringSetAdd(present, record.path);
  }
  const vanished = createOrderedStringSet();
  for (let index = 0; index < sourceRecords.length; index += 1) {
    const record = sourceRecords[index];
    if (record.oldPath && !orderedStringSetHas(present, record.oldPath)) {
      orderedStringSetAdd(vanished, record.oldPath);
    }
  }
  return vanished;
}

// Paths that still exist, which is all a static checker can open.
export function existingPaths(records) {
  const paths = createOrderedStringSet();
  const sourceRecords = records || [];
  for (let index = 0; index < sourceRecords.length; index += 1) {
    if (sourceRecords[index].path) {
      orderedStringSetAdd(paths, sourceRecords[index].path);
    }
  }
  return sortStrings(orderedStringSetValues(paths));
}

const JAVASCRIPT_SUFFIXES = ['.js', '.mjs', '.cjs'];

export function javaScriptPaths(paths) {
  return arrayFilter(paths, (candidate) =>
    arraySome(JAVASCRIPT_SUFFIXES,
      (suffix) => stringEndsWith(candidate, suffix)));
}

// Backwards-compatible convenience for callers that only need existing paths.
export function changedCandidatePaths(options) {
  const records = changedRecords(options);
  return records === null ? null : existingPaths(records);
}
