/**
 * Witness accounting for the fallback-branch census: which threads of a run
 * started under coverage and which of them left complete coverage
 * (scripts/checks/fallback-branch-census-preload.js writes the markers, and
 * scripts/checks/fallback-branch-census.js owns the pipeline and its
 * documentation).
 *
 * A coverage directory holds, per thread, a start marker
 * `witness-<pid>-<threadId>.json`, an end marker
 * `witness-<pid>-<threadId>-exit.json` once its coverage is complete, a
 * flush acknowledgement `witness-<pid>-<threadId>-flushed.json` when it
 * answered a pre-kill flush, the request `witness-<pid>-0-flush-request.json`
 * a harness wrote, and Node's coverage files
 * `coverage-<pid>-<epoch ms>-<threadId>.json`. A thread is complete when
 *
 * - it wrote its end marker (`exit`) AND a coverage file of that thread was
 *   written at or after that marker: the thread's final write. Node writes a
 *   thread's last coverage only after every `exit` listener has run, so the
 *   marker alone proves nothing about it - a process that dies after its
 *   marker (an abort, a V8 OOM inside the exit-time coverage write, a later
 *   `exit` listener that aborts or kills, a fatal signal in teardown) lost
 *   its last interval and is LOST. The order is read on one clock: the
 *   marker's `at` (Date.now) against the coverage file name's wall-clock
 *   millisecond (`writtenAtMs >= at`); a marker without a usable `at` (a
 *   process that polluted Object.prototype.toJSON before the census preload
 *   learned to build marker text itself wrote `{}`) is ordered by file
 *   modification time instead, the marker's against the coverage file's,
 *   both stamped by the same kernel clock, and only a strictly later
 *   coverage file counts (a tie cannot order them). That fallback needs the
 *   run directory copied with its modification times (rsync -a, scp -p,
 *   tar), as every collection so far was; or
 * - a worker thread only - the main thread of its process ended by `exit`
 *   and is itself complete by the rule above: an orderly process exit tears
 *   its workers down and writes their coverage, without running their
 *   `exit` listeners; or
 * - it acknowledged a FINAL pre-kill flush and the acknowledgement still
 *   stands (`flushed`): it ran no JavaScript between that flush and the kill
 *   (it froze, or - its own process killing itself - the kill followed in the
 *   same stack), and a thread whose freeze ran out withdrew it. A worker's
 *   acknowledgement counts only together with its main thread's final
 *   acknowledgement of the same request.
 *
 * So a process ended by a signal's default action is a lost witness UNLESS
 * it acknowledged a final pre-kill flush. Every other started thread is LOST:
 * its coverage after its last flush is gone. Its cause is
 * `pre-kill-flush-unanswered` when a harness asked it (its main thread) to
 * flush and no final acknowledgement stands, `final-write-missing` when it
 * wrote its end marker but no coverage file followed it, otherwise
 * `unknown`. A worker its parent terminated while the process later died is
 * counted lost although its coverage was written: an over-count, never an
 * acquittal.
 *
 * `splitExternal` moves to `external` the lost witnesses that cannot hold a
 * repository side: a thread whose entry script and working directory both lie
 * outside the run's root (a test's copy of the scripts under /tmp, a
 * placement checkout) and whose surviving coverage names no repository file
 * but the census preload itself (which collect loads into every process
 * from the root).
 * They void nothing; they are counted, never dropped.
 */

import fs from 'node:fs';
import path from 'node:path';

const START_MARKER = /^witness-(\d+)-(\d+)\.json$/u;
const END_MARKER = /^witness-(\d+)-(\d+)-exit\.json$/u;
const FLUSHED_MARKER = /^witness-(\d+)-(\d+)-flushed\.json$/u;
const FLUSH_REQUEST_MARKER = /^witness-(\d+)-0-flush-request\.json$/u;
const COVERAGE_FILE = /^coverage-(\d+)-(\d+)-(\d+)\.json$/u;
// The capture groups of COVERAGE_FILE.
const COVERAGE_GROUP = Object.freeze({PID: 1, WRITTEN_AT: 2, THREAD: 3});
const NO_TIME = null;
const MAIN_THREAD_ID = '0';
const END_BY_EXIT = 'exit';
const LOST_CAUSE_UNKNOWN = 'unknown';
const LOST_CAUSE_FLUSH_UNANSWERED = 'pre-kill-flush-unanswered';
const LOST_CAUSE_FINAL_WRITE_MISSING = 'final-write-missing';
export const WITNESS_LOST_CAUSE = Object.freeze({
  UNKNOWN: LOST_CAUSE_UNKNOWN,
  FLUSH_UNANSWERED: LOST_CAUSE_FLUSH_UNANSWERED,
  FINAL_WRITE_MISSING: LOST_CAUSE_FINAL_WRITE_MISSING,
});
// How a complete thread completed when no end marker of its own says so.
const COMPLETE_BY_FLUSH = 'flushed';
const KEY_SEPARATOR = ':';
// The census's own preload, which every process under collection loads from
// the run's root: never evidence that a process ran repository code.
const CENSUS_APPARATUS = Object.freeze([
  'scripts/checks/fallback-branch-census-preload.js',
  'scripts/checks/fallback-branch-census-constants.js',
]);
const PARENT_PREFIX = '..';
const TEXT_ENCODING = 'utf8';

const jsonParse = JSON.parse;
const regexpExec = Function.call.bind(RegExp.prototype.exec);
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayPush = Function.call.bind(Array.prototype.push);
const arraySort = Function.call.bind(Array.prototype.sort);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const mathMax = Math.max;
const arraySome = Function.call.bind(Array.prototype.some);
const dateParse = Date.parse;
const numberIsFinite = Number.isFinite;

export function witnessKey(pid, threadId) {
  return `${pid}${KEY_SEPARATOR}${threadId}`;
}

/**
 * The witness key of a Node coverage file name, or null.
 * @param {string} name
 * @return {?{key: string, writtenAtMs: number}}
 */
export function coverageFileWitness(name) {
  const match = regexpExec(COVERAGE_FILE, name);
  return match ? {key: witnessKey(match[COVERAGE_GROUP.PID], match[COVERAGE_GROUP.THREAD]),
    writtenAtMs: Number(match[COVERAGE_GROUP.WRITTEN_AT])} : null;
}

export function isCoverageFileName(name) {
  return regexpExec(COVERAGE_FILE, name) !== null;
}

function readMarker(directory, name) {
  try {
    return jsonParse(fs.readFileSync(path.join(directory, name), TEXT_ENCODING));
  } catch (_error) {
    return null;
  }
}

function indexDirectory(directory, names) {
  const index = {starts: {}, ends: {}, endNames: {}, flushed: {}, requested: new Set(),
    lastFlush: {}, coverage: {}};
  for (const name of names) {
    const start = regexpExec(START_MARKER, name);
    const end = regexpExec(END_MARKER, name);
    const flushed = regexpExec(FLUSHED_MARKER, name);
    const request = regexpExec(FLUSH_REQUEST_MARKER, name);
    const coverage = coverageFileWitness(name);
    if (start) {
      index.starts[witnessKey(start[1], start[2])] = {name, pid: start[1], threadId: start[2]};
    }
    if (end) {
      index.ends[witnessKey(end[1], end[2])] = readMarker(directory, name) || {};
      index.endNames[witnessKey(end[1], end[2])] = name;
    }
    if (flushed) index.flushed[witnessKey(flushed[1], flushed[2])] = readMarker(directory, name);
    if (request) index.requested.add(request[1]);
    if (coverage) {
      index.lastFlush[coverage.key] = mathMax(index.lastFlush[coverage.key] || 0,
        coverage.writtenAtMs);
      if (!objectHasOwn(index.coverage, coverage.key)) index.coverage[coverage.key] = [];
      arrayPush(index.coverage[coverage.key], {name, writtenAtMs: coverage.writtenAtMs});
    }
  }
  return index;
}

function finalAck(flushed, key) {
  const ack = flushed[key];
  return ack && ack.final === true && typeof ack.id === 'string' ? ack : null;
}

// The marker's own clock reading (its `at`), or null when it has none.
function markerAtMs(marker) {
  const at = typeof marker?.at === 'string' ? dateParse(marker.at) : NaN;
  return numberIsFinite(at) ? at : NO_TIME;
}

function modifiedNs(directory, name) {
  try {
    return fs.statSync(path.join(directory, name), {bigint: true}).mtimeNs;
  } catch (_error) {
    return NO_TIME;
  }
}

// Whether a coverage file of the thread `key` was written at or after its
// end marker: the thread's final write (see the header for the clocks).
function finalWriteFollows(directory, key, index) {
  const files = index.coverage[key] || [];
  const atMs = markerAtMs(index.ends[key]);
  if (atMs !== NO_TIME) return arraySome(files, (file) => file.writtenAtMs >= atMs);
  const markerNs = modifiedNs(directory, index.endNames[key]);
  if (markerNs === NO_TIME) return false;
  return arraySome(files, (file) => {
    const fileNs = modifiedNs(directory, file.name);
    return fileNs !== NO_TIME && fileNs > markerNs;
  });
}

// How a started thread completed: 'exit', 'flushed', or null (lost). A
// thread that wrote an end marker ran JavaScript after any flush it
// acknowledged, so only its final write can complete it.
function completion(directory, key, start, index) {
  const {ends, flushed} = index;
  if (objectHasOwn(ends, key)) return finalWriteFollows(directory, key, index) ? END_BY_EXIT : null;
  const mainKey = witnessKey(start.pid, MAIN_THREAD_ID);
  const mainAck = finalAck(flushed, mainKey);
  if (start.threadId === MAIN_THREAD_ID) return mainAck ? COMPLETE_BY_FLUSH : null;
  const main = ends[mainKey];
  if (main !== undefined && main.by === END_BY_EXIT &&
    finalWriteFollows(directory, mainKey, index)) {
    return END_BY_EXIT;
  }
  const ack = finalAck(flushed, key);
  return ack && mainAck && ack.id === mainAck.id ? COMPLETE_BY_FLUSH : null;
}

// The entry script of a thread's process (its main thread's argv[1]).
function processEntryOf(directory, start, marker, index) {
  const main = start.threadId === MAIN_THREAD_ID ? marker :
    readMarker(directory, index.starts[witnessKey(start.pid, MAIN_THREAD_ID)]?.name ?? '');
  return typeof main?.entry === 'string' ? main.entry : null;
}

function lostCause(start, index) {
  if (index.requested.has(start.pid)) return WITNESS_LOST_CAUSE.FLUSH_UNANSWERED;
  return objectHasOwn(index.ends, witnessKey(start.pid, start.threadId)) ?
    WITNESS_LOST_CAUSE.FINAL_WRITE_MISSING : WITNESS_LOST_CAUSE.UNKNOWN;
}

function lostWitness(directory, start, index) {
  const marker = readMarker(directory, start.name) || {};
  const isMainThread = start.threadId === MAIN_THREAD_ID;
  const lastFlushMs = index.lastFlush[witnessKey(start.pid, start.threadId)];
  return {
    pid: Number(start.pid), threadId: Number(start.threadId),
    ppid: marker.ppid ?? null, entry: typeof marker.entry === 'string' ? marker.entry : null,
    // A worker runs code its process's main thread chose: its closure starts
    // from that entry too.
    processEntry: processEntryOf(directory, start, marker, index),
    cwd: marker.cwd ?? null, startedAt: marker.startedAt ?? null, isMainThread,
    lastFlushAt: lastFlushMs ? new Date(lastFlushMs).toISOString() : null,
    cause: lostCause(start, index),
  };
}

/**
 * The witnesses of one coverage directory.
 * @param {string} directory
 * @param {Array<string>} names the directory's file names
 * @return {{started: number, complete: number, flushed: number,
 *   lost: Array<Object>}} `flushed` counts the complete threads whose
 *   completeness rests on a pre-kill flush acknowledgement
 */
export function accountWitnesses(directory, names) {
  const index = indexDirectory(directory, names);
  const lost = [];
  let complete = 0;
  let flushed = 0;
  for (const key of arraySort(objectKeys(index.starts))) {
    const how = completion(directory, key, index.starts[key], index);
    if (how === null) {
      arrayPush(lost, lostWitness(directory, index.starts[key], index));
    } else {
      complete += 1;
      if (how === COMPLETE_BY_FLUSH) flushed += 1;
    }
  }
  return {started: complete + lost.length, complete, flushed, lost};
}

function outsideRoots(file, roots) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) return false;
  return arrayEvery(roots, (root) => {
    const relative = path.relative(root, file);
    return stringStartsWith(relative, PARENT_PREFIX) || path.isAbsolute(relative);
  });
}

/**
 * Whether a lost witness lies outside the run's repository: its entry script
 * and working directory are absolute paths outside every root, and its
 * surviving coverage names no repository file but the census preload.
 * @param {Object} lost a lost witness with `seenFiles`
 * @param {Array<string>} roots the run root and its real path
 * @return {boolean}
 */
export function isExternalWitness(lost, roots) {
  return outsideRoots(lost.entry, roots) && outsideRoots(lost.cwd, roots) &&
    arrayEvery(lost.seenFiles || [], (file) => arrayIncludes(CENSUS_APPARATUS, file));
}

/**
 * Split an accounting's lost witnesses into lost and external.
 * @param {{lost: Array<Object>}} accounted lost witnesses carry `seenFiles`
 * @param {Array<string>} roots
 * @return {Object} the accounting with `lost` and `external`
 */
export function splitExternal(accounted, roots) {
  return {...accounted,
    lost: arrayFilter(accounted.lost, (lost) => !isExternalWitness(lost, roots)),
    external: arrayFilter(accounted.lost, (lost) => isExternalWitness(lost, roots))};
}
