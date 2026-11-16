// Per-file comparison for the file-size owner. The owner's thresholds and line
// measurement are supplied here; the shared change-range owner selects the base.
// Aggregate counts remain a separate check and cannot pay for a new violation.

import fs from 'node:fs';
import path from 'node:path';
import {Buffer} from 'node:buffer';

import {changedRecords, resolvedCheckBaseCommit} from './changed-paths.js';
import {
  appendArrayValue, appendArrayValues,
  createOrderedStringMap, createOrderedStringSet,
  orderedStringMapGet, orderedStringMapHas, orderedStringMapSet,
  orderedStringSetAdd, orderedStringSetHas, orderedStringSetValues,
  sortStrings, stringCollectionHas,
} from './change-proof-string-collections.js';
import {execGit} from './git-invocation.js';
import {gitProcessEnvironment} from './git-process-environment.js';

const stringSplit = Function.call.bind(String.prototype.split);
const stringIndexOf = Function.call.bind(String.prototype.indexOf);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const arrayJoin = Function.call.bind(Array.prototype.join);
const bufferEquals = Function.call.bind(Buffer.prototype.equals);
const bufferToString = Function.call.bind(Buffer.prototype.toString);

const ENCODING = 'utf8';
const FILE_MISSING = 'ENOENT';
const GIT_BLOB = 'blob';
const REGULAR_FILE_MODES = Object.freeze(['100644', '100755']);
const TREE_ARGUMENTS = Object.freeze(['ls-tree', '-r', '-z', '--full-tree']);
const CAT_FILE = 'cat-file';
const GIT_RECORD_SEPARATOR = '\0';
const GIT_FIELD_SEPARATOR = '\t';
const GIT_HEADER_SEPARATOR = ' ';
const PATH_SEPARATOR = '/';
const PARENT_DIRECTORY = '..';
const OUTSIDE_ROOT_PREFIX = '../';
const HEAD = 'HEAD';
const COMPARISON_UNAVAILABLE = 'Unable to determine the file-size comparison range';

function git(root, args, encoding = ENCODING) {
  return execGit(args, {cwd: root, encoding, env: gitProcessEnvironment()});
}

function baselineFiles(root, base) {
  const entries = createOrderedStringMap();
  const records = stringSplit(git(root, [...TREE_ARGUMENTS, base]), GIT_RECORD_SEPARATOR);
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    const separator = stringIndexOf(record, GIT_FIELD_SEPARATOR);
    const [mode, type, oid] = stringSplit(stringSlice(record, 0, separator), GIT_HEADER_SEPARATOR);
    if (type === GIT_BLOB && stringCollectionHas(REGULAR_FILE_MODES, mode)) {
      orderedStringMapSet(entries, stringSlice(record, separator + 1), oid);
    }
  }
  return entries;
}

function currentFile(root, relative) {
  const absolute = path.join(root, relative);
  try {
    const stat = fs.lstatSync(absolute);
    if (!stat.isFile()) throw new Error(`File-size candidate is not a regular file: ${relative}`);
    return fs.readFileSync(absolute);
  } catch (error) {
    if (error.code === FILE_MISSING) return null;
    throw error;
  }
}

function relativePath(root, target) {
  const relative = arrayJoin(stringSplit(path.relative(root, path.resolve(root, target)),
    path.sep), PATH_SEPARATOR);
  if (relative === PARENT_DIRECTORY || stringStartsWith(relative, OUTSIDE_ROOT_PREFIX) ||
      path.isAbsolute(relative)) {
    throw new Error(`File-size candidate is outside the repository: ${target}`);
  }
  return relative;
}

function scopedMoves(records, selected, policyForPath) {
  const errors = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record.oldPath && record.path &&
        policyForPath(record.oldPath) && !policyForPath(record.path) &&
        (!selected || orderedStringSetHas(selected, record.oldPath) ||
          orderedStringSetHas(selected, record.path))) {
      appendArrayValue(errors,
        `Moved source file outside the file-size scan scope: ${record.oldPath} -> ${record.path}`);
    }
  }
  return errors;
}

function vanishedOrigins(root, records, files, policyForPath) {
  const origins = [];
  const seen = createOrderedStringSet();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const previousPath = record.oldPath;
    if (!previousPath || orderedStringSetHas(seen, previousPath) ||
        !orderedStringMapHas(files, previousPath)) continue;
    orderedStringSetAdd(seen, previousPath);
    const policy = policyForPath(previousPath);
    if (policy && currentFile(root, previousPath) === null) {
      appendArrayValue(origins,
        {path: previousPath, policy, oid: orderedStringMapGet(files, previousPath)});
    }
  }
  return origins;
}

function readBlob(root, oid, blobs) {
  if (!orderedStringMapHas(blobs, oid)) {
    orderedStringMapSet(blobs, oid, git(root, [CAT_FILE, GIT_BLOB, oid], null));
  }
  return orderedStringMapGet(blobs, oid);
}

function originalContent(context, relative, policy, content) {
  const {root, files, origins, claimedOrigins, blobs} = context;
  const oid = orderedStringMapGet(files, relative);
  if (oid) return readBlob(root, oid, blobs);
  // Similarity alone does not prove that debt kept its identity. A move can
  // inherit only identical bytes in the same scope, with the old path gone.
  // One vanished identity is consumed once; a remaining original is a copy.
  for (let index = 0; index < origins.length; index += 1) {
    const origin = origins[index];
    if (origin.policy.scope === policy.scope &&
        !orderedStringSetHas(claimedOrigins, origin.path) &&
        bufferEquals(readBlob(root, origin.oid, blobs), content)) {
      orderedStringSetAdd(claimedOrigins, origin.path);
      return content;
    }
  }
  return null;
}

function candidateProblem(context, relative, policy, content, countLines) {
  const lines = countLines(bufferToString(content, ENCODING));
  if (lines <= policy.threshold) return null;
  const previous = originalContent(context, relative, policy, content);
  const detail = `${relative}: ${lines} lines (threshold ${policy.threshold})`;
  if (previous === null) return `New ${policy.scope} file exceeds its threshold: ${detail}`;
  const previousLines = countLines(bufferToString(previous, ENCODING));
  if (previousLines <= policy.threshold) {
    return `Previously compliant ${policy.scope} file exceeds its threshold: ${detail}`;
  }
  return lines > previousLines ?
    `Inherited oversized ${policy.scope} file grew from ${previousLines} to ${lines}: ${relative}` :
    null;
}

function candidateErrors(context, candidates, selected, policyForPath, countLines) {
  const errors = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const relative = candidates[index];
    const policy = policyForPath(relative);
    if (!policy) continue;
    const content = currentFile(context.root, relative);
    if (content === null) {
      if (selected) appendArrayValue(errors, `File-size candidate is missing: ${relative}`);
      continue;
    }
    const problem = candidateProblem(context, relative, policy, content, countLines);
    if (problem) appendArrayValue(errors, problem);
  }
  return errors;
}

function selectedPaths(root, paths) {
  if (!paths) return null;
  const selected = createOrderedStringSet();
  for (let index = 0; index < paths.length; index += 1) {
    orderedStringSetAdd(selected, relativePath(root, paths[index]));
  }
  return selected;
}

function candidatePaths(records, selected) {
  const paths = selected || createOrderedStringSet();
  if (!selected) {
    for (let index = 0; index < records.length; index += 1) {
      if (records[index].path) orderedStringSetAdd(paths, records[index].path);
    }
  }
  return sortStrings(orderedStringSetValues(paths));
}

/**
 * Compare changed files (or an explicit selection) with the selected proof base.
 * A repository without a publication range measures its worktree against HEAD;
 * an invalid declared base always throws and is never replaced with HEAD.
 * @param {Object} options
 * @return {{base: string, errors: string[]}}
 */
export function fileSizeChangeErrors({root, base = null, paths = null, env = process.env,
  policyForPath, countLines}) {
  const comparisonBase = resolvedCheckBaseCommit(base, env, root) ||
    resolvedCheckBaseCommit(HEAD, {}, root);
  const records = changedRecords({root, base: comparisonBase});
  if (records === null) throw new Error(COMPARISON_UNAVAILABLE);
  const selected = selectedPaths(root, paths);
  const candidates = candidatePaths(records, selected);
  const files = baselineFiles(root, comparisonBase);
  const context = {root, files, origins: vanishedOrigins(root, records, files, policyForPath),
    claimedOrigins: createOrderedStringSet(), blobs: createOrderedStringMap()};
  const errors = scopedMoves(records, selected, policyForPath);
  appendArrayValues(errors,
    candidateErrors(context, candidates, selected, policyForPath, countLines));
  return {base: comparisonBase, errors};
}
