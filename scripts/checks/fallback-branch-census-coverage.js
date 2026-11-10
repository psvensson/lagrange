/**
 * V8 block coverage as executed source intervals, run-directory validation,
 * and lost-witness closure computation for the fallback-branch census
 * (scripts/checks/fallback-branch-census.js owns the pipeline and its
 * documentation).
 *
 * `mergeRuns` validates every run's `run.json` metadata (canonical lane, commit
 * hash, timestamps, coverage digest, preload sha256, non-empty `v8/` coverage
 * directory, and empty `problems`), reads every file in `v8/` one file at a
 * time, records any corrupt marker or malformed V8 coverage payload in
 * `unreadable`, and accounts all expected and observed witnesses.
 */

import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  MERGED_SCHEMA,
  PRELOAD_MODULE_RELATIVE,
  REQUIRED_CENSUS_LANES,
  RUN_RECORD_FILE,
  SOURCE_PREFIX,
  V8_DIRECTORY,
  WITNESS_LOST_CAUSE,
} from './fallback-branch-census-constants.js';
import {
  accountWitnesses,
  coverageFileWitness,
  isCoverageFileName,
  isValidCoveragePayload,
  splitExternal,
  witnessKey,
} from './fallback-branch-census-witnesses.js';

const PRELOAD_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  path.basename(PRELOAD_MODULE_RELATIVE),
);

const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayForEach = Function.call.bind(Array.prototype.forEach);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayIsArray = Array.isArray;
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayPush = Function.call.bind(Array.prototype.push);
const arraySome = Function.call.bind(Array.prototype.some);
const arraySort = Function.call.bind(Array.prototype.sort);
const stringIndexOf = Function.call.bind(String.prototype.indexOf);
const stringMatchAll = Function.call.bind(String.prototype.matchAll);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringEndsWith = Function.call.bind(String.prototype.endsWith);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);
const objectEntries = Object.entries;
const objectKeys = Object.keys;
const objectHasOwn = Object.hasOwn;
const jsonParse = JSON.parse;
const mathMax = Math.max;
const mathMin = Math.min;
const dateParse = Date.parse;
const numberIsFinite = Number.isFinite;
const regexpExec = Function.call.bind(RegExp.prototype.exec);

const COVERAGE_FILE_SUFFIX = '.json';
const FILE_URL_PREFIX = 'file:';
const RELATIVE_SPECIFIER_PREFIX = '.';
const URL_SUFFIX_SEPARATORS = Object.freeze(['?', '#']);
const POSIX_SEPARATOR = '/';
const WITNESS_ID_SEPARATOR = ':';
const UNREADABLE_WITNESS_TAG = 'unreadable';
const DYNAMIC_LOAD_PATTERN = /\bimport\s*\(|\bcreateRequire\b|\bvm\b|\bWorker\b/u;
const STATIC_SPECIFIER_PATTERN =
  /(?:(?:\bimport|\bexport)\s+(?:[^'"`;]*?\s+from\s+)?|\brequire\s*\(\s*)['"]([^'"]+)['"]/gu;
const COMMIT_HASH_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/u;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const PARENT_PREFIX = '..';
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const DIGEST_SEPARATOR = '\n';
const TEXT_ENCODING = 'utf8';
const OBJECT_TYPE = 'object';
const STRING_TYPE = 'string';
const NOT_FOUND = -1;

const PROBLEM = Object.freeze({
  RUN_RECORD: 'not a collected census run (no readable run.json): ',
  RUN_ID: 'run.json names no run id: ',
  RUN_LANE: 'run.json names an unknown lane: ',
  RUN_METADATA: 'run.json lacks required host, commit, timestamp, or fileDigests metadata: ',
  RUN_PROBLEMS: 'run.json recorded collection problems: ',
  RUN_PRELOAD: 'run.json coveragePreload is missing or does not match current preload sha256: ',
  COVERAGE_DIRECTORY: 'missing or unreadable coverage directory: ',
  EMPTY_COVERAGE: 'coverage directory holds zero V8 coverage files: ',
  DUPLICATE_RUN: 'one run given twice: ',
  DIGEST: 'coverage digest of the run directory differs from its run.json ' +
    '(the coverage changed after collection): ',
});

function isPlainObject(value) {
  return typeof value === OBJECT_TYPE && value !== null && !arrayIsArray(value);
}

function isNonBlankString(value) {
  return typeof value === STRING_TYPE && stringTrim(value).length > 0;
}

function isIsoTimestamp(value) {
  return typeof value === STRING_TYPE &&
    regexpExec(ISO_TIMESTAMP_PATTERN, value) !== null &&
    numberIsFinite(dateParse(value));
}

function isValidFileDigestsMap(value) {
  if (!isPlainObject(value)) return false;
  for (const [, digest] of objectEntries(value)) {
    if (!isNonBlankString(digest)) return false;
  }
  return true;
}

export function sha256Hex(content) {
  return createHash(HASH_ALGORITHM).update(content).digest(HASH_ENCODING);
}

export function currentPreloadSha256() {
  return sha256Hex(fs.readFileSync(PRELOAD_PATH));
}

export function digestOfFileDigests(fileDigests) {
  const sorted = arraySort([...fileDigests]);
  return sha256Hex(arrayJoin(sorted, DIGEST_SEPARATOR));
}

export function coverageFileNames(directory) {
  let stat = null;
  try {
    stat = fs.statSync(directory);
  } catch (_error) {
    throw new Error(`${PROBLEM.COVERAGE_DIRECTORY}${directory}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`${PROBLEM.COVERAGE_DIRECTORY}${directory}`);
  }
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
  if (typeof url !== STRING_TYPE || !stringStartsWith(url, FILE_URL_PREFIX)) return null;
  let bare = url;
  for (const separator of URL_SUFFIX_SEPARATORS) {
    const at = stringIndexOf(bare, separator);
    if (at !== NOT_FOUND) bare = stringSlice(bare, 0, at);
  }
  let absolute;
  try {
    absolute = fileURLToPath(bare);
  } catch (_error) {
    return null;
  }
  for (const root of roots) {
    const relative = relativePosix(root, absolute);
    if (relative !== '' && !stringStartsWith(relative, PARENT_PREFIX) &&
        !path.isAbsolute(relative)) {
      return relative;
    }
  }
  return null;
}

function isPatternString(value, pattern) {
  return typeof value === STRING_TYPE && regexpExec(pattern, value) !== null;
}

function hasValidRunMetadata(record) {
  return isNonBlankString(record.host) &&
    isPatternString(record.commit, COMMIT_HASH_PATTERN) &&
    isIsoTimestamp(record.startedAt) &&
    isIsoTimestamp(record.finishedAt) &&
    isPatternString(record.coverageDigest, SHA256_HEX_PATTERN) &&
    isValidFileDigestsMap(record.fileDigests);
}

function hasRecordedProblems(problems) {
  if (problems === undefined) return false;
  return !arrayIsArray(problems) || problems.length > 0;
}

function hasValidPreloadRecord(preload) {
  return isPlainObject(preload) && preload.active === true &&
    preload.sha256 === currentPreloadSha256();
}

function assertValidRunRecord(record, runDir) {
  if (!isPlainObject(record) || !isNonBlankString(record.id)) {
    throw new Error(`${PROBLEM.RUN_ID}${runDir}`);
  }
  if (!arrayIncludes(REQUIRED_CENSUS_LANES, record.lane)) {
    throw new Error(`${PROBLEM.RUN_LANE}${runDir}`);
  }
  if (!hasValidRunMetadata(record)) throw new Error(`${PROBLEM.RUN_METADATA}${runDir}`);
  if (hasRecordedProblems(record.problems)) throw new Error(`${PROBLEM.RUN_PROBLEMS}${runDir}`);
  if (!hasValidPreloadRecord(record.coveragePreload)) {
    throw new Error(`${PROBLEM.RUN_PRELOAD}${runDir}`);
  }
}

export function readRunRecord(runDir) {
  let record;
  try {
    record = jsonParse(fs.readFileSync(path.join(runDir, RUN_RECORD_FILE), TEXT_ENCODING));
  } catch (error) {
    throw new Error(`${PROBLEM.RUN_RECORD}${runDir}: ${error.message}`);
  }
  assertValidRunRecord(record, runDir);
  return record;
}

/**
 * A run's root and, when it exists here, its real path.
 * @param {Object} record the run record
 * @param {string} runDir
 * @return {Array<string>}
 */
export function rootsOf(record, runDir) {
  const root = typeof record.root === STRING_TYPE ? record.root : path.resolve(runDir);
  const roots = [root];
  if (fs.existsSync(root)) arrayPush(roots, fs.realpathSync(root));
  return roots;
}

function foldCoverageFile(buffer, runId, roots, files) {
  let parsed;
  try {
    parsed = jsonParse(buffer.toString(TEXT_ENCODING));
  } catch (_error) {
    return false;
  }
  if (!isValidCoveragePayload(parsed)) return false;
  for (const script of parsed.result) {
    const file = sourcePathOfUrl(script.url, roots);
    if (!file) continue;
    if (!objectHasOwn(files, file)) files[file] = {loaded: true, runs: {}};
    const perRun = files[file].runs;
    const intervals = executedIntervalsOfScript(script.functions);
    perRun[runId] = objectHasOwn(perRun, runId) ?
      unionIntervals(perRun[runId], intervals) : intervals;
  }
  return true;
}

function isReadableMarkerBuffer(buffer) {
  try {
    return isPlainObject(jsonParse(buffer.toString(TEXT_ENCODING)));
  } catch (_error) {
    return false;
  }
}

function foldRunDirectory({directory, names, record, roots, files, unreadable, onFile}) {
  const digests = [];
  let processes = 0;
  for (const name of names) {
    const buffer = fs.readFileSync(path.join(directory, name));
    arrayPush(digests, sha256Hex(buffer));
    const writer = coverageFileWitness(name);
    if (writer === null) {
      if (!isReadableMarkerBuffer(buffer)) {
        arrayPush(unreadable, {run: record.id, file: name});
      }
      continue;
    }
    if (foldCoverageFile(buffer, record.id, roots, files)) {
      processes += 1;
    } else {
      arrayPush(unreadable, {run: record.id, file: name});
    }
    if (onFile) onFile(record.id, name, buffer.length);
  }
  return {digests, processes};
}

function repositoryPathsOf(file, roots, into) {
  let parsed;
  try {
    parsed = jsonParse(fs.readFileSync(file, TEXT_ENCODING));
  } catch (_error) {
    return;
  }
  if (!isValidCoveragePayload(parsed)) return;
  for (const script of parsed.result) {
    const repositoryPath = repositoryPathOfUrl(script.url, roots);
    if (repositoryPath !== null) into.add(repositoryPath);
  }
}

/**
 * The witnesses of one run's coverage directory: started, complete, flushed,
 * lost (with `seenFiles`), and external.
 * @param {string} directory
 * @param {Array<string>} names
 * @param {Array<string>} roots
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
  return splitExternal({
    ...accounted,
    lost: arrayMap(accounted.lost, (lost) => ({
      ...lost,
      seenFiles: arraySort([...seenByLost[witnessKey(lost.pid, lost.threadId)]]),
    })),
  }, roots);
}

function runSummary(record) {
  return {
    id: record.id,
    lane: record.lane,
    host: record.host,
    commit: record.commit,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    exitCode: record.exitCode,
    coverageDigest: record.coverageDigest,
    ...(record.incomplete === true ? {incomplete: true} : {}),
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
    if (!arraySome(names, isCoverageFileName)) {
      throw new Error(`${PROBLEM.EMPTY_COVERAGE}${directory}`);
    }
    const folded = foldRunDirectory({directory, names, record, roots, files, unreadable, onFile});
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
    schema: MERGED_SCHEMA,
    generatedAt: now().toISOString(),
    runs,
    processes,
    unreadable,
    witnesses,
    files: sorted,
  };
}

function importsOf(importers) {
  const imports = {};
  for (const [imported, importing] of objectEntries(importers)) {
    for (const importer of importing) {
      if (!objectHasOwn(imports, importer)) imports[importer] = [];
      arrayPush(imports[importer], imported);
    }
  }
  return imports;
}

function repoPathOf(run, filePath) {
  if (typeof filePath !== STRING_TYPE || !path.isAbsolute(filePath) ||
      typeof run.root !== STRING_TYPE) {
    return null;
  }
  const relative = relativePosix(run.root, filePath);
  return relative === '' || stringStartsWith(relative, PARENT_PREFIX) || path.isAbsolute(relative) ?
    null : relative;
}

function resolveStaticSpecifier(run, fromRelative, specifier) {
  if (stringStartsWith(specifier, FILE_URL_PREFIX)) {
    return repositoryPathOfUrl(specifier, [run.root]);
  }
  if (!stringStartsWith(specifier, RELATIVE_SPECIFIER_PREFIX)) return null;
  const baseDir = path.dirname(path.join(run.root, fromRelative));
  return repoPathOf(run, path.resolve(baseDir, specifier));
}

function scanDiskImports(run, relativePath) {
  if (typeof run.root !== STRING_TYPE) return [];
  const absolute = path.join(run.root, relativePath);
  if (!fs.existsSync(absolute)) return [];
  let source;
  try {
    source = fs.readFileSync(absolute, TEXT_ENCODING);
  } catch (_error) {
    return [];
  }
  const resolved = [];
  for (const match of stringMatchAll(source, STATIC_SPECIFIER_PATTERN)) {
    const next = resolveStaticSpecifier(run, relativePath, match[1]);
    if (next !== null) arrayPush(resolved, next);
  }
  return resolved;
}

function closureOf(run, imports, seeds) {
  const visited = new Set(seeds);
  const frontier = [...visited];
  for (let cursor = 0; cursor < frontier.length; cursor += 1) {
    const current = frontier[cursor];
    const edges = [...(imports[current] || []), ...scanDiskImports(run, current)];
    for (const next of edges) {
      if (!visited.has(next)) {
        visited.add(next);
        arrayPush(frontier, next);
      }
    }
  }
  return visited;
}

function lostSeedsOf(run, lost) {
  const seeds = new Set(lost.seenFiles || []);
  const candidates = [
    lost.entry,
    lost.isMainThread ? null : lost.processEntry,
    lost.parentEntry,
    ...(lost.seedFiles || []),
  ];
  for (const candidate of candidates) {
    const repoPath = repoPathOf(run, candidate);
    if (repoPath !== null) seeds.add(repoPath);
  }
  return [...seeds];
}

function fileHasDynamicLoad(root, relativePath) {
  if (typeof root !== STRING_TYPE || typeof relativePath !== STRING_TYPE) return true;
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) return false;
  try {
    return regexpExec(DYNAMIC_LOAD_PATTERN, fs.readFileSync(absolute, TEXT_ENCODING)) !== null;
  } catch (_error) {
    return true;
  }
}

function hasUnboundedClosure(run, lost, closureFiles) {
  if (lost.uninstrumented === true || lost.eval === true ||
      lost.cause === WITNESS_LOST_CAUSE.UNREADABLE_COVERAGE) {
    return true;
  }
  return arraySome(closureFiles, (file) => fileHasDynamicLoad(run.root, file));
}

function appendUnreadableRunClosures(merged, runs, closures) {
  const unreadable = merged.unreadable || [];
  if (unreadable.length === 0) return;
  arrayForEach(runs, (run, runIndex) => {
    if ((merged.witnesses?.[run.id]?.lost || []).length > 0) return;
    for (const item of unreadable) {
      if (item?.run !== run.id) continue;
      const id = arrayJoin([run.id, UNREADABLE_WITNESS_TAG, item.file], WITNESS_ID_SEPARATOR);
      for (const file of objectKeys(run.fileDigests || {})) {
        if (!stringStartsWith(file, SOURCE_PREFIX)) continue;
        if (!objectHasOwn(closures, file)) closures[file] = [];
        arrayPush(closures[file], {id, runIndex});
      }
    }
  });
}

/**
 * src file -> the lost witnesses whose import closure holds it.
 * @param {Object} merged
 * @param {Array<Object>} runs
 * @param {Object<string, string[]>} importers the sealed importer map
 * @return {Object<string, Array<{id: string, runIndex: number}>>}
 */
export function lostWitnessClosures(merged, runs, importers) {
  const imports = importsOf(importers);
  const closures = {};
  arrayForEach(runs, (run, runIndex) => {
    for (const lost of merged.witnesses?.[run.id]?.lost || []) {
      const seeds = lostSeedsOf(run, lost);
      const closureFiles = [...closureOf(run, imports, seeds)];
      const reached = arrayFilter(
        closureFiles,
        (file) => stringStartsWith(file, SOURCE_PREFIX),
      );
      const voidedFiles = hasUnboundedClosure(run, lost, closureFiles) ?
        objectKeys(run.fileDigests || {}) : reached;
      const id = arrayJoin([run.id, lost.pid, lost.threadId], WITNESS_ID_SEPARATOR);
      for (const file of voidedFiles) {
        if (!stringStartsWith(file, SOURCE_PREFIX)) continue;
        if (!objectHasOwn(closures, file)) closures[file] = [];
        arrayPush(closures[file], {id, runIndex});
      }
    }
  });
  appendUnreadableRunClosures(merged, runs, closures);
  return closures;
}
