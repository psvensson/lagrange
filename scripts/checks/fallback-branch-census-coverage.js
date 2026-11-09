/**
 * V8 block coverage as executed source intervals, for the fallback-branch
 * census (scripts/checks/fallback-branch-census.js owns the pipeline and its
 * documentation).
 *
 * One process's coverage of one script is a list of functions, each a list
 * of ranges `{startOffset, endOffset, count}`; ranges nest, and an offset is
 * executed when the INNERMOST range containing it has a count above zero (an
 * executed function whose `else` block never ran carries a zero-count inner
 * range over that block). `executedIntervalsOfScript` flattens that nesting
 * into sorted, disjoint, half-open `[start, end)` intervals of executed
 * source; `unionIntervals` is the merge across processes (a side executed in
 * any process is executed); `intervalsOverlap` answers whether any offset of
 * a side executed.
 *
 * `mergeRuns` reads every coverage file of every run directory one file at a
 * time - never all of them at once - keeps only scripts under the run's
 * `src/`, and records per file the runs that loaded it and, per run, the
 * union of its executed intervals. It recomputes each run's coverage digest
 * and refuses a directory that changed since collection, and it lists every
 * coverage file it could not parse rather than skipping it: a lost process
 * can only hide an executed side, which would condemn a live branch.
 * `accountRunWitnesses` names a run's witnesses (complete, complete by a
 * pre-kill flush, lost with the repository files their surviving coverage
 * shows, external), the same accounting collect writes into run.json.
 */

import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  MERGED_SCHEMA,
  RUN_RECORD_FILE,
  SOURCE_PREFIX,
  V8_DIRECTORY,
} from './fallback-branch-census-constants.js';
import {
  accountWitnesses,
  coverageFileWitness,
  splitExternal,
  witnessKey,
} from './fallback-branch-census-witnesses.js';

const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayPush = Function.call.bind(Array.prototype.push);
const arraySort = Function.call.bind(Array.prototype.sort);
const stringIndexOf = Function.call.bind(String.prototype.indexOf);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const objectKeys = Object.keys;
const objectHasOwn = Object.hasOwn;
const jsonParse = JSON.parse;
const mathMax = Math.max;
const mathMin = Math.min;

const COVERAGE_FILE_SUFFIX = '.json';
const FILE_URL_PREFIX = 'file:';
const URL_SUFFIX_SEPARATORS = Object.freeze(['?', '#']);
const POSIX_SEPARATOR = '/';
const PARENT_PREFIX = '..';
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const DIGEST_SEPARATOR = '\n';
const TEXT_ENCODING = 'utf8';
const NOT_FOUND = -1;
const PROBLEM = Object.freeze({
  RUN_RECORD: 'not a collected census run (no readable run.json): ',
  RUN_ID: 'run.json names no run id: ',
  DUPLICATE_RUN: 'one run given twice: ',
  DIGEST: 'coverage digest of the run directory differs from its run.json ' +
    '(the coverage changed after collection): ',
});

export function sha256Hex(content) {
  return createHash(HASH_ALGORITHM).update(content).digest(HASH_ENCODING);
}

// The digest a run records for its coverage directory: sha256 over the
// sorted sha256s of its coverage files, so file order and names are moot.
export function digestOfFileDigests(fileDigests) {
  const sorted = arraySort([...fileDigests]);
  return sha256Hex(arrayJoin(sorted, DIGEST_SEPARATOR));
}

export function coverageFileNames(directory) {
  if (!fs.existsSync(directory)) return [];
  const names = [];
  for (const name of fs.readdirSync(directory)) {
    if (stringEndsWith(name, COVERAGE_FILE_SUFFIX)) arrayPush(names, name);
  }
  return arraySort(names);
}

export function coverageDirectoryDigest(directory) {
  const digests = [];
  for (const name of coverageFileNames(directory)) {
    arrayPush(digests, sha256Hex(fs.readFileSync(path.join(directory, name))));
  }
  return digestOfFileDigests(digests);
}

function compareRanges(left, right) {
  if (left.start !== right.start) return left.start - right.start;
  return right.end - left.end;
}

/**
 * The executed source of one script in one process.
 * @param {Array<{ranges: Array<{startOffset: number, endOffset: number,
 *   count: number}>}>} functions
 * @return {Array<Array<number>>} sorted disjoint [start, end) intervals
 */
export function executedIntervalsOfScript(functions) {
  const ranges = [];
  for (const fn of functions || []) {
    for (const range of fn.ranges || []) {
      if (range.endOffset > range.startOffset) {
        arrayPush(ranges, {start: range.startOffset, end: range.endOffset, count: range.count});
      }
    }
  }
  // Outer ranges before the ranges they contain; a stable sort keeps a later
  // range with identical bounds innermost.
  arraySort(ranges, compareRanges);
  const executed = [];
  const emit = (start, end, count) => {
    if (end <= start || count <= 0) return;
    const last = executed[executed.length - 1];
    if (last && last[1] >= start) {
      last[1] = mathMax(last[1], end);
    } else {
      arrayPush(executed, [start, end]);
    }
  };
  const open = [];
  let cursor = 0;
  const closeUntil = (offset) => {
    while (open.length > 0 && open[open.length - 1].end <= offset) {
      const top = open.pop();
      emit(cursor, top.end, top.count);
      cursor = mathMax(cursor, top.end);
    }
  };
  for (const range of ranges) {
    closeUntil(range.start);
    const parent = open[open.length - 1];
    if (parent) emit(cursor, range.start, parent.count);
    cursor = mathMax(cursor, range.start);
    // Ranges nest; a range that overran its parent is clamped to it.
    const end = parent ? mathMin(range.end, parent.end) : range.end;
    arrayPush(open, {end, count: range.count});
  }
  closeUntil(Number.POSITIVE_INFINITY);
  return executed;
}

/**
 * The union of two sorted disjoint interval lists; touching intervals join.
 * @param {Array<Array<number>>} left
 * @param {Array<Array<number>>} right
 * @return {Array<Array<number>>}
 */
export function unionIntervals(left, right) {
  const result = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length || rightIndex < right.length) {
    const takeLeft = rightIndex >= right.length ||
      (leftIndex < left.length && left[leftIndex][0] <= right[rightIndex][0]);
    const next = takeLeft ? left[leftIndex++] : right[rightIndex++];
    const last = result[result.length - 1];
    if (last && last[1] >= next[0]) {
      last[1] = mathMax(last[1], next[1]);
    } else {
      arrayPush(result, [next[0], next[1]]);
    }
  }
  return result;
}

/**
 * Whether any offset of `[start, end)` lies in an executed interval. An empty
 * side is the single offset at its start.
 * @param {Array<Array<number>>} intervals sorted disjoint
 * @param {Array<number>} side
 * @return {boolean}
 */
export function intervalsOverlap(intervals, side) {
  const start = side[0];
  const end = side[1] > start ? side[1] : start + 1;
  let low = 0;
  let high = intervals.length;
  // The first interval that ends after `start`.
  while (low < high) {
    const middle = (low + high) >> 1;
    if (intervals[middle][1] <= start) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low < intervals.length && intervals[low][0] < end;
}

function relativePosix(root, absolute) {
  return arrayJoin(stringSplit(path.relative(root, absolute), path.sep), POSIX_SEPARATOR);
}

/**
 * The repository path of a coverage script URL under `roots`' `src/`, or null.
 * @param {string} url
 * @param {Array<string>} roots the run root and its real path
 * @return {?string}
 */
export function sourcePathOfUrl(url, roots) {
  const relative = repositoryPathOfUrl(url, roots);
  return relative !== null && stringStartsWith(relative, SOURCE_PREFIX) ? relative : null;
}

/**
 * The repository path of a coverage script URL inside one of `roots`, or null.
 * @param {string} url
 * @param {Array<string>} roots the run root and its real path
 * @return {?string}
 */
export function repositoryPathOfUrl(url, roots) {
  if (typeof url !== 'string' || !stringStartsWith(url, FILE_URL_PREFIX)) return null;
  let bare = url;
  for (const separator of URL_SUFFIX_SEPARATORS) {
    const at = stringIndexOf(bare, separator);
    if (at !== NOT_FOUND) bare = stringSlice(bare, 0, at);
  }
  const absolute = fileURLToPath(bare);
  for (const root of roots) {
    const relative = relativePosix(root, absolute);
    if (relative !== '' && !stringStartsWith(relative, PARENT_PREFIX) &&
        !path.isAbsolute(relative)) {
      return relative;
    }
  }
  return null;
}

export function readRunRecord(runDir) {
  let record;
  try {
    record = jsonParse(fs.readFileSync(path.join(runDir, RUN_RECORD_FILE), TEXT_ENCODING));
  } catch (error) {
    throw new Error(`${PROBLEM.RUN_RECORD}${runDir}: ${error.message}`);
  }
  if (typeof record?.id !== 'string' || record.id.length === 0) {
    throw new Error(`${PROBLEM.RUN_ID}${runDir}`);
  }
  return record;
}

/**
 * A run's root and, when it exists here, its real path.
 * @param {Object} record the run record
 * @param {string} runDir
 * @return {Array<string>}
 */
export function rootsOf(record, runDir) {
  const root = typeof record.root === 'string' ? record.root : path.resolve(runDir);
  const roots = [root];
  if (fs.existsSync(root)) arrayPush(roots, fs.realpathSync(root));
  return roots;
}

// One coverage file of one run folded into `files`; returns false when the
// file could not be parsed.
function foldCoverageFile(buffer, runId, roots, files) {
  let parsed;
  try {
    parsed = jsonParse(buffer.toString(TEXT_ENCODING));
  } catch (_error) {
    return false;
  }
  for (const script of parsed?.result || []) {
    const file = sourcePathOfUrl(script?.url, roots);
    if (!file) continue;
    if (!objectHasOwn(files, file)) files[file] = {loaded: true, runs: {}};
    const perRun = files[file].runs;
    const intervals = executedIntervalsOfScript(script.functions);
    perRun[runId] = objectHasOwn(perRun, runId) ?
      unionIntervals(perRun[runId], intervals) : intervals;
  }
  return true;
}

// Every file of one run's coverage directory digested, and every Node
// coverage file among them folded (markers are digested, never folded).
function foldRunDirectory({directory, names, record, roots, files, unreadable, onFile}) {
  const digests = [];
  let processes = 0;
  for (const name of names) {
    const buffer = fs.readFileSync(path.join(directory, name));
    arrayPush(digests, sha256Hex(buffer));
    const writer = coverageFileWitness(name);
    if (writer === null) continue;
    if (foldCoverageFile(buffer, record.id, roots, files)) {
      processes += 1;
    } else {
      arrayPush(unreadable, {run: record.id, file: name});
    }
    if (onFile) onFile(record.id, name, buffer.length);
  }
  return {digests, processes};
}

// Every repository path one coverage file names (unparsable: none).
function repositoryPathsOf(file, roots, into) {
  let parsed;
  try {
    parsed = jsonParse(fs.readFileSync(file, TEXT_ENCODING));
  } catch (_error) {
    return;
  }
  for (const script of parsed?.result || []) {
    const repositoryPath = repositoryPathOfUrl(script?.url, roots);
    if (repositoryPath !== null) into.add(repositoryPath);
  }
}

/**
 * The witnesses of one run's coverage directory: started, complete, flushed
 * (complete by a pre-kill flush), the lost ones - each with `seenFiles`, the
 * repository paths its surviving coverage names, the seeds of its import
 * closure - and the external ones (fallback-branch-census-witnesses.js).
 * @param {string} directory
 * @param {Array<string>} names the directory's file names
 * @param {Array<string>} roots the run root and its real path
 * @return {{started: number, complete: number, flushed: number,
 *   lost: Array<Object>, external: Array<Object>}}
 */
export function accountRunWitnesses(directory, names, roots) {
  const accounted = accountWitnesses(directory, names);
  const seenByLost = {};
  for (const lost of accounted.lost) {
    seenByLost[witnessKey(lost.pid, lost.threadId)] = new Set();
  }
  for (const name of names) {
    const writer = coverageFileWitness(name);
    if (writer !== null && objectHasOwn(seenByLost, writer.key)) {
      repositoryPathsOf(path.join(directory, name), roots, seenByLost[writer.key]);
    }
  }
  return splitExternal({...accounted,
    lost: arrayMap(accounted.lost, (lost) => ({...lost,
      seenFiles: arraySort([...seenByLost[witnessKey(lost.pid, lost.threadId)]])}))}, roots);
}

function runSummary(record) {
  return {
    id: record.id, lane: record.lane, host: record.host, commit: record.commit,
    startedAt: record.startedAt, finishedAt: record.finishedAt,
    exitCode: record.exitCode, coverageDigest: record.coverageDigest,
  };
}

/**
 * Merge the coverage of run directories (each holding run.json and v8/).
 * @param {Array<string>} runDirs
 * @param {{now?: Function, onFile?: Function}} [options]
 * @return {Object} the merged coverage record
 */
export function mergeRuns(runDirs, {now = () => new Date(), onFile = null} = {}) {
  const files = {};
  const runs = [];
  const processes = {};
  const unreadable = [];
  const witnesses = {};
  for (const runDir of runDirs) {
    const record = readRunRecord(runDir);
    if (objectHasOwn(processes, record.id)) throw new Error(`${PROBLEM.DUPLICATE_RUN}${record.id}`);
    const roots = rootsOf(record, runDir);
    const directory = path.join(runDir, V8_DIRECTORY);
    const names = coverageFileNames(directory);
    const folded = foldRunDirectory({directory, names, record, roots, files, unreadable,
      onFile});
    processes[record.id] = folded.processes;
    if (digestOfFileDigests(folded.digests) !== record.coverageDigest) {
      throw new Error(`${PROBLEM.DIGEST}${runDir}`);
    }
    witnesses[record.id] = accountRunWitnesses(directory, names, roots);
    arrayPush(runs, runSummary(record));
  }
  const sorted = {};
  for (const file of arraySort(objectKeys(files))) sorted[file] = files[file];
  return {
    schema: MERGED_SCHEMA, generatedAt: now().toISOString(), runs, processes, unreadable,
    witnesses, files: sorted,
  };
}
