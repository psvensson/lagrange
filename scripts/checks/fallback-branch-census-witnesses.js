/**
 * Witness and expected-participant roster accounting for the fallback-branch
 * census: which processes and worker threads a lane launched, which started
 * under preload instrumentation, and which left complete V8 coverage
 * (scripts/checks/fallback-branch-census-preload.js and the process launch
 * owners write the markers, and scripts/checks/fallback-branch-census.js owns
 * the pipeline and its documentation).
 *
 * A coverage directory holds, per participant `(pid, threadId)`:
 * - an expected-participant record `roster-<pid>-<threadId>.json` written by
 *   the launching parent process (the lane runner or the preload's
 *   `child_process` and `worker_threads.Worker` hooks);
 * - a self-reported start marker `witness-<pid>-<threadId>.json` written when
 *   the preload runs at thread load;
 * - an end marker `witness-<pid>-<threadId>-exit.json` once its `exit`
 *   listener runs, ordered against a coverage file written at or after it;
 * - a pre-kill flush request `witness-<pid>-0-flush-request.json` and standing
 *   acknowledgement `witness-<pid>-<threadId>-flushed.json`; and
 * - Node's coverage files `coverage-<pid>-<epoch ms>-<threadId>.json`.
 *
 * `accountWitnesses` reconciles the roster against start/exit/flush markers
 * and validated V8 coverage payloads. Missing instrumentation, corrupt JSON or
 * malformed V8 coverage payloads, missing final writes, and unanswered pre-kill
 * flushes fail closed as lost witnesses and never acquit a site.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {
  CENSUS_COVERAGE_DIR_ENV,
  PRELOAD_MODULE_RELATIVE,
  ROSTER_MARKER,
  WITNESS_LOST_CAUSE,
} from './fallback-branch-census-constants.js';
import {
  collectWorkerSeedFiles,
  normalizeNodeLaunch,
  nowIsoString,
  parseNodeScriptArgs,
  resolveFileCandidate,
  serializeFlatJson,
} from './fallback-branch-census-shell.js';

const {process} = globalThis;

const ROSTER_FILE_PATTERN = /^roster-(\d+)-(\d+)\.json$/u;
const START_MARKER = /^witness-(\d+)-(\d+)\.json$/u;
const END_MARKER = /^witness-(\d+)-(\d+)-exit\.json$/u;
const FLUSHED_MARKER = /^witness-(\d+)-(\d+)-flushed\.json$/u;
const FLUSH_REQUEST_MARKER = /^witness-(\d+)-0-flush-request\.json$/u;
const COVERAGE_FILE = /^coverage-(\d+)-(\d+)-(\d+)\.json$/u;
const COVERAGE_GROUP = Object.freeze({PID: 1, WRITTEN_AT: 2, THREAD: 3});

const NO_TIME = null;
const MAIN_THREAD_ID = '0';
const END_BY_EXIT = 'exit';
const COMPLETE_BY_FLUSH = 'flushed';
const KEY_SEPARATOR = ':';
const COVERAGE_ENV = 'NODE_V8_COVERAGE';
const PARENT_PREFIX = '..';
const TEXT_ENCODING = 'utf8';
const OBJECT_TYPE = 'object';
const ENTRY_ARGUMENT = 1;
const NODE_INTERNAL_URL_PREFIX = 'node:';
const ESM_HOOKS_WORKER_URL = 'node:internal/modules/esm/worker';
const FILE_URL_SCHEME_PREFIX = 'file://';
const NODE_MODULES_PATH_SEGMENT = '/node_modules/';

const PARTICIPANT_TYPE = Object.freeze({
  PROCESS: 'process',
  WORKER: 'worker',
});
const MARKER_FIELD = Object.freeze({
  PID: 'pid', THREAD_ID: 'threadId', PPID: 'ppid', KIND: 'kind', SHELL: 'shell',
  TEST_RUNNER: 'testRunner', HAS_STRIPPED_CLAUSE: 'hasStrippedClause', EVAL: 'eval',
  EXPECTED_CHILDREN: 'expectedChildren', ENTRY: 'entry', PARENT_ENTRY: 'parentEntry',
  SEED_FILES: 'seedFiles', CWD: 'cwd', RECORDED_AT: 'recordedAt', STARTED_AT: 'startedAt',
  ENV: 'env', WORKER_DATA: 'workerData', START_OFFSET: 'startOffset', END_OFFSET: 'endOffset',
  COUNT: 'count', RANGES: 'ranges', URL: 'url', FUNCTIONS: 'functions', RESULT: 'result',
  FINAL: 'final', ID: 'id', AT: 'at', BY: 'by',
});

// All preload apparatus modules loaded into every instrumented process from
// the run root; never evidence that an external /tmp copy ran repository code.
const CENSUS_APPARATUS = Object.freeze([
  PRELOAD_MODULE_RELATIVE,
  'scripts/checks/fallback-branch-census-constants.js',
  'scripts/checks/fallback-branch-census-witnesses.js',
  'scripts/checks/fallback-branch-census-shell.js',
]);

// Primordials captured at module load so global pollution cannot forge markers.
const toBoolean = Boolean;
const DateConstructor = Date;
const dateToISOString = Function.call.bind(Date.prototype.toISOString);
const toNumber = Number;
const SetConstructor = Set;
const setAdd = Function.call.bind(Set.prototype.add);
const setForEach = Function.call.bind(Set.prototype.forEach);
const setHas = Function.call.bind(Set.prototype.has);
const toStringValue = String;
const URLConstructor = URL;
const jsonParse = JSON.parse;
const existsSync = fs.existsSync;
const readFileSync = fs.readFileSync;
const statSync = fs.statSync;
const writeFileSync = fs.writeFileSync;
const pathJoin = path.join;
const pathRelative = path.relative;
const pathIsAbsolute = path.isAbsolute;
const processCwd = process.cwd.bind(process);
const regexpExec = Function.call.bind(RegExp.prototype.exec);
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayIsArray = Array.isArray;
const arrayPush = Function.call.bind(Array.prototype.push);
const arraySome = Function.call.bind(Array.prototype.some);
const arraySort = Function.call.bind(Array.prototype.sort);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const objectCreate = Object.create;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const mathMax = Math.max;
const dateParse = Date.parse;
const numberIsFinite = Number.isFinite;
const numberIsInteger = Number.isInteger;

function isPlainObject(value) {
  if (typeof value !== OBJECT_TYPE || value === null || arrayIsArray(value)) return false;
  const proto = objectGetPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function ownProp(record, key) {
  return isPlainObject(record) && objectHasOwn(record, key) ? record[key] : undefined;
}

function ownEnvProp(env, key) {
  return env !== null && typeof env === OBJECT_TYPE && objectHasOwn(env, key) ?
    env[key] : undefined;
}

export function witnessKey(pid, threadId) {
  return `${pid}${KEY_SEPARATOR}${threadId}`;
}

function rosterFileName(pid, threadId) {
  return `${ROSTER_MARKER.PREFIX}${pid}${ROSTER_MARKER.SEPARATOR}${threadId}${ROSTER_MARKER.SUFFIX}`;
}

/**
 * The witness key of a Node coverage file name, or null.
 * @param {string} name
 * @return {?{key: string, pid: string, threadId: string, writtenAtMs: number}}
 */
export function coverageFileWitness(name) {
  const match = regexpExec(COVERAGE_FILE, name);
  return match ? {
    key: witnessKey(match[COVERAGE_GROUP.PID], match[COVERAGE_GROUP.THREAD]),
    pid: match[COVERAGE_GROUP.PID],
    threadId: match[COVERAGE_GROUP.THREAD],
    writtenAtMs: toNumber(match[COVERAGE_GROUP.WRITTEN_AT]),
  } : null;
}

export function isCoverageFileName(name) {
  return regexpExec(COVERAGE_FILE, name) !== null;
}

function readJsonMarker(directory, name) {
  try {
    return jsonParse(readFileSync(pathJoin(directory, name), TEXT_ENCODING));
  } catch (_error) {
    return null;
  }
}

function addArrayStringsToSet(target, list) {
  if (!arrayIsArray(list)) return;
  for (let index = 0; index < list.length; index += 1) {
    if (typeof list[index] === 'string') setAdd(target, list[index]);
  }
}

function setToSortedArray(set) {
  const values = [];
  setForEach(set, (item) => {
    arrayPush(values, item);
  });
  return arraySort(values);
}

function mergeSeedFiles(left, right) {
  const merged = new SetConstructor();
  addArrayStringsToSet(merged, left);
  addArrayStringsToSet(merged, right);
  return setToSortedArray(merged);
}

function isValidPidAndThread(pid, threadId) {
  return numberIsInteger(pid) && pid > 0 &&
    numberIsInteger(threadId) && threadId >= 0;
}

function pickString(primary, fallback) {
  if (typeof primary === 'string') return primary;
  return typeof fallback === 'string' ? fallback : null;
}

function pickTruthyOr(primary, secondary, fallback) {
  if (primary) return primary;
  return secondary || fallback;
}

function rosterFlags(participant, existing) {
  const F = MARKER_FIELD;
  return {
    shell: toBoolean(ownProp(participant, F.SHELL)) || toBoolean(ownProp(existing, F.SHELL)),
    testRunner: toBoolean(ownProp(participant, F.TEST_RUNNER)) ||
      toBoolean(ownProp(existing, F.TEST_RUNNER)),
    hasStrippedClause: toBoolean(ownProp(participant, F.HAS_STRIPPED_CLAUSE)) ||
      toBoolean(ownProp(existing, F.HAS_STRIPPED_CLAUSE)),
    eval: toBoolean(ownProp(participant, F.EVAL)) || toBoolean(ownProp(existing, F.EVAL)),
  };
}

function buildRosterRecord(pid, threadId, participant, existing) {
  const F = MARKER_FIELD;
  const defaultType = threadId === 0 ? PARTICIPANT_TYPE.PROCESS : PARTICIPANT_TYPE.WORKER;
  const expectedChildren = mathMax(
    toNumber(ownProp(participant, F.EXPECTED_CHILDREN)) || 0,
    toNumber(ownProp(existing, F.EXPECTED_CHILDREN)) || 0,
    1,
  );
  return {
    pid,
    threadId,
    ppid: ownProp(participant, F.PPID) ?? ownProp(existing, F.PPID) ?? process.pid,
    kind: pickTruthyOr(ownProp(participant, F.KIND), ownProp(existing, F.KIND), defaultType),
    ...rosterFlags(participant, existing),
    expectedChildren,
    entry: pickString(ownProp(participant, F.ENTRY), ownProp(existing, F.ENTRY)),
    parentEntry: pickString(ownProp(participant, F.PARENT_ENTRY),
      ownProp(existing, F.PARENT_ENTRY)),
    seedFiles: mergeSeedFiles(ownProp(existing, F.SEED_FILES), ownProp(participant, F.SEED_FILES)),
    cwd: pickTruthyOr(pickString(ownProp(participant, F.CWD), ownProp(existing, F.CWD)), null,
      processCwd()),
    recordedAt: pickTruthyOr(ownProp(existing, F.RECORDED_AT), ownProp(participant, F.RECORDED_AT),
      nowIsoString()),
  };
}

function recordExpectedParticipant(directory, participant) {
  if (typeof directory !== 'string' || directory.length === 0) return false;
  const pid = toNumber(ownProp(participant, MARKER_FIELD.PID));
  const threadId = toNumber(ownProp(participant, MARKER_FIELD.THREAD_ID) ?? 0);
  if (!isValidPidAndThread(pid, threadId)) return false;
  const name = rosterFileName(pid, threadId);
  const target = pathJoin(directory, name);
  const existing = existsSync(target) ? readJsonMarker(directory, name) : null;
  const normalizedExisting = isPlainObject(existing) ? existing : objectCreate(null);
  const body = buildRosterRecord(pid, threadId, participant, normalizedExisting);
  try {
    writeFileSync(target, serializeFlatJson(body));
    return true;
  } catch (_error) {
    return false;
  }
}

function resolveCoverageDirectory(launchEnv) {
  const candidates = [
    ownEnvProp(launchEnv, COVERAGE_ENV),
    ownEnvProp(process.env, CENSUS_COVERAGE_DIR_ENV),
    ownEnvProp(process.env, COVERAGE_ENV),
  ];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  }
  return null;
}

function resolveLaunchCwd(cwdOption) {
  if (typeof cwdOption === 'string' && cwdOption.length > 0) return cwdOption;
  if (cwdOption instanceof URLConstructor) return fileURLToPath(cwdOption);
  return processCwd();
}

/**
 * Record a child Node process launched by `spawn`, `spawnSync`, `exec`,
 * `execSync`, `execFile`, or `execFileSync` when census coverage is active.
 * @param {string} command
 * @param {Array<string>|Object} [args]
 * @param {Object} [options]
 * @param {number} [pid]
 * @return {boolean}
 */
export function recordExpectedNodeProcess(command, args, options, pid) {
  const normalized = normalizeNodeLaunch(command, args, options);
  if (!normalized) return false;
  const {shell, testRunner, argList, launchOptions, expectedChildren, hasStrippedClause} =
    normalized;
  const directory = resolveCoverageDirectory(ownProp(launchOptions, MARKER_FIELD.ENV));
  if (!directory) return false;
  const cwd = resolveLaunchCwd(ownProp(launchOptions, MARKER_FIELD.CWD));
  const parsed = parseNodeScriptArgs(argList, cwd);
  return recordExpectedParticipant(directory, {
    pid,
    threadId: 0,
    ppid: process.pid,
    kind: PARTICIPANT_TYPE.PROCESS,
    shell,
    testRunner,
    expectedChildren,
    hasStrippedClause,
    eval: parsed.eval,
    entry: parsed.entry,
    parentEntry: process.argv[ENTRY_ARGUMENT] ?? null,
    cwd,
  });
}

/**
 * Record a child Node process launched by `fork` when census coverage is active.
 * @param {string|URL} modulePath
 * @param {Array<string>|Object} [args]
 * @param {Object} [options]
 * @param {number} [pid]
 * @return {boolean}
 */
export function recordExpectedForkProcess(modulePath, args, options, pid) {
  const launchOptions = arrayIsArray(args) ? options : args;
  const directory = resolveCoverageDirectory(ownProp(launchOptions, MARKER_FIELD.ENV));
  if (!directory) return false;
  const cwd = resolveLaunchCwd(ownProp(launchOptions, MARKER_FIELD.CWD));
  const normalized = normalizeNodeLaunch(
    process.execPath,
    [toStringValue(modulePath)],
    launchOptions,
  );
  return recordExpectedParticipant(directory, {
    pid,
    threadId: 0,
    ppid: process.pid,
    kind: PARTICIPANT_TYPE.PROCESS,
    hasStrippedClause: normalized ? normalized.hasStrippedClause : false,
    eval: false,
    entry: resolveFileCandidate(modulePath, cwd),
    parentEntry: process.argv[ENTRY_ARGUMENT] ?? null,
    cwd,
  });
}

/**
 * Record a Worker thread launched by `new Worker(filename, options)`.
 * @param {?string} directory
 * @param {number} threadId
 * @param {string|URL} filename
 * @param {Object} [options]
 * @param {boolean} [isInstrumentedEnv]
 * @return {boolean}
 */
export function recordExpectedWorker(
  directory,
  threadId,
  filename,
  options,
  isInstrumentedEnv = true,
) {
  if (!directory) return false;
  const isEval = toBoolean(ownProp(options, MARKER_FIELD.EVAL));
  const cwd = processCwd();
  const entry = isEval ? null : resolveFileCandidate(filename, cwd);
  const seedFiles = collectWorkerSeedFiles(
    isEval ? filename : null,
    ownProp(options, MARKER_FIELD.WORKER_DATA),
    cwd,
  );
  return recordExpectedParticipant(directory, {
    pid: process.pid,
    threadId,
    ppid: process.pid,
    kind: PARTICIPANT_TYPE.WORKER,
    hasStrippedClause: !isInstrumentedEnv,
    eval: isEval,
    entry,
    parentEntry: process.argv[ENTRY_ARGUMENT] ?? null,
    seedFiles,
    cwd,
  });
}

function isValidCoverageRange(range) {
  const startOffset = ownProp(range, MARKER_FIELD.START_OFFSET);
  const endOffset = ownProp(range, MARKER_FIELD.END_OFFSET);
  const count = ownProp(range, MARKER_FIELD.COUNT);
  return isPlainObject(range) &&
    numberIsInteger(startOffset) && startOffset >= 0 &&
    numberIsInteger(endOffset) && endOffset >= startOffset &&
    numberIsInteger(count) && count >= 0;
}

function isValidCoverageFunction(fn) {
  const ranges = ownProp(fn, MARKER_FIELD.RANGES);
  return isPlainObject(fn) &&
    arrayIsArray(ranges) &&
    arrayEvery(ranges, isValidCoverageRange);
}

function isValidCoverageScript(script) {
  const url = ownProp(script, MARKER_FIELD.URL);
  const functions = ownProp(script, MARKER_FIELD.FUNCTIONS);
  return isPlainObject(script) &&
    typeof url === 'string' &&
    arrayIsArray(functions) &&
    arrayEvery(functions, isValidCoverageFunction);
}

export function isValidCoveragePayload(parsed) {
  const result = ownProp(parsed, MARKER_FIELD.RESULT);
  return isPlainObject(parsed) &&
    arrayIsArray(result) &&
    arrayEvery(result, isValidCoverageScript);
}

function storeIndexedMarker(table, corruptMarkers, directory, name, match) {
  const pid = match[1];
  const threadId = match[2];
  const key = witnessKey(pid, threadId);
  const marker = readJsonMarker(directory, name);
  if (!isPlainObject(marker)) corruptMarkers[key] = true;
  table[key] = {name, pid, threadId, marker};
}

function isBuiltinScriptUrl(url) {
  return stringStartsWith(url, NODE_INTERNAL_URL_PREFIX);
}

function isPackageOrBuiltinScriptUrl(url) {
  if (isBuiltinScriptUrl(url)) return true;
  return stringStartsWith(url, FILE_URL_SCHEME_PREFIX) &&
    stringIncludes(url, NODE_MODULES_PATH_SEGMENT);
}

function isBuiltinOnlyWorkerPayload(parsed) {
  return parsed.result.length > 0 &&
    arrayEvery(parsed.result, (script) => isBuiltinScriptUrl(script.url));
}

function isEsmPackageLoaderPayload(parsed) {
  if (isBuiltinOnlyWorkerPayload(parsed)) return true;
  return arraySome(parsed.result, (script) => script.url === ESM_HOOKS_WORKER_URL) &&
    arrayEvery(parsed.result, (script) => isPackageOrBuiltinScriptUrl(script.url));
}

function indexCoverageEntry(index, directory, name, coverage) {
  index.coverageWriters[coverage.key] = {pid: coverage.pid, threadId: coverage.threadId};
  const parsed = readJsonMarker(directory, name);
  if (!isValidCoveragePayload(parsed)) {
    index.unreadable[coverage.key] = true;
    return;
  }
  const previousLoaderOnly = objectHasOwn(index.esmLoaderOnly, coverage.key) ?
    index.esmLoaderOnly[coverage.key] : true;
  index.esmLoaderOnly[coverage.key] = previousLoaderOnly && isEsmPackageLoaderPayload(parsed);
  index.lastFlush[coverage.key] = mathMax(
    index.lastFlush[coverage.key] || 0,
    coverage.writtenAtMs,
  );
  if (!objectHasOwn(index.coverage, coverage.key)) index.coverage[coverage.key] = [];
  arrayPush(index.coverage[coverage.key], {name, writtenAtMs: coverage.writtenAtMs});
}

function indexDirectory(directory, names) {
  const index = {
    rosters: objectCreate(null), starts: objectCreate(null), ends: objectCreate(null),
    flushed: objectCreate(null), requested: new SetConstructor(),
    coverageWriters: objectCreate(null), coverage: objectCreate(null),
    lastFlush: objectCreate(null), unreadable: objectCreate(null),
    corruptMarkers: objectCreate(null), esmLoaderOnly: objectCreate(null),
  };
  for (let entryIndex = 0; entryIndex < names.length; entryIndex += 1) {
    const name = names[entryIndex];
    const roster = regexpExec(ROSTER_FILE_PATTERN, name);
    const start = regexpExec(START_MARKER, name);
    const end = regexpExec(END_MARKER, name);
    const ack = regexpExec(FLUSHED_MARKER, name);
    const request = regexpExec(FLUSH_REQUEST_MARKER, name);
    const coverage = coverageFileWitness(name);
    if (roster) storeIndexedMarker(index.rosters, index.corruptMarkers, directory, name, roster);
    if (start) storeIndexedMarker(index.starts, index.corruptMarkers, directory, name, start);
    if (end) storeIndexedMarker(index.ends, index.corruptMarkers, directory, name, end);
    if (ack) storeIndexedMarker(index.flushed, index.corruptMarkers, directory, name, ack);
    if (request) {
      setAdd(index.requested, request[1]);
      if (!isPlainObject(readJsonMarker(directory, name))) {
        index.corruptMarkers[witnessKey(request[1], MAIN_THREAD_ID)] = true;
      }
    }
    if (coverage) indexCoverageEntry(index, directory, name, coverage);
  }
  return index;
}

function isDelegatedCoordinatorRoster(key, rosters, starts) {
  const F = MARKER_FIELD;
  const marker = rosters[key]?.marker;
  if (objectHasOwn(starts, key) || !isPlainObject(marker)) return false;
  if (ownProp(marker, F.SHELL) !== true && ownProp(marker, F.TEST_RUNNER) !== true) return false;
  if (ownProp(marker, F.HAS_STRIPPED_CLAUSE) === true) return false;
  const coordinatorPid = toNumber(rosters[key].pid);
  const rawExpected = ownProp(marker, F.EXPECTED_CHILDREN);
  const expected = numberIsInteger(rawExpected) && rawExpected > 0 ? rawExpected : 1;
  const startedChildren = arrayFilter(
    objectKeys(starts),
    (startKey) => ownProp(starts[startKey]?.marker, F.PPID) === coordinatorPid,
  );
  return startedChildren.length >= expected;
}

function hasParticipantMarker(key, {rosters, starts, ends, flushed, unreadable, corruptMarkers}) {
  return objectHasOwn(rosters, key) || objectHasOwn(starts, key) ||
    objectHasOwn(ends, key) || objectHasOwn(flushed, key) ||
    objectHasOwn(unreadable, key) || objectHasOwn(corruptMarkers, key);
}

function isInternalPackageLoaderThread(key, index) {
  const writer = index.coverageWriters[key];
  if (!writer || writer.threadId === MAIN_THREAD_ID) return false;
  if (hasParticipantMarker(key, index) || index.esmLoaderOnly[key] !== true) return false;
  return hasValidStart(witnessKey(writer.pid, MAIN_THREAD_ID), index.starts);
}

function reconciledKeys(index) {
  const {rosters, starts, ends, flushed, coverageWriters} = index;
  const rosterKeys = arrayFilter(
    objectKeys(rosters),
    (key) => !isDelegatedCoordinatorRoster(key, rosters, starts),
  );
  const writerKeys = arrayFilter(
    objectKeys(coverageWriters),
    (key) => !isInternalPackageLoaderThread(key, index),
  );
  const keys = new SetConstructor();
  addArrayStringsToSet(keys, rosterKeys);
  addArrayStringsToSet(keys, objectKeys(starts));
  addArrayStringsToSet(keys, objectKeys(ends));
  addArrayStringsToSet(keys, objectKeys(flushed));
  addArrayStringsToSet(keys, writerKeys);
  return setToSortedArray(keys);
}

function participantIdentity(key, {rosters, starts, ends, flushed, coverageWriters}) {
  const found = starts[key] || rosters[key] || ends[key] || flushed[key] || coverageWriters[key];
  return {pid: found.pid, threadId: found.threadId};
}

function hasValidStart(key, starts) {
  const marker = starts[key]?.marker;
  return isPlainObject(marker) &&
    numberIsInteger(ownProp(marker, MARKER_FIELD.PID)) &&
    numberIsInteger(ownProp(marker, MARKER_FIELD.THREAD_ID));
}

function finalAck(flushed, key) {
  const ack = flushed[key]?.marker;
  return isPlainObject(ack) && ownProp(ack, MARKER_FIELD.FINAL) === true &&
    typeof ownProp(ack, MARKER_FIELD.ID) === 'string' ? ack : null;
}

function markerAtMs(marker) {
  const rawAt = ownProp(marker, MARKER_FIELD.AT);
  const at = typeof rawAt === 'string' ? dateParse(rawAt) : NaN;
  return numberIsFinite(at) ? at : NO_TIME;
}

function modifiedNs(directory, name) {
  try {
    return statSync(pathJoin(directory, name), {bigint: true}).mtimeNs;
  } catch (_error) {
    return NO_TIME;
  }
}

function finalWriteFollows(directory, key, index) {
  const files = index.coverage[key] || [];
  const endRecord = index.ends[key];
  if (!isPlainObject(endRecord?.marker)) return false;
  const atMs = markerAtMs(endRecord.marker);
  if (atMs !== NO_TIME) return arraySome(files, (file) => file.writtenAtMs >= atMs);
  const markerNs = modifiedNs(directory, endRecord.name);
  if (markerNs === NO_TIME) return false;
  return arraySome(files, (file) => {
    const fileNs = modifiedNs(directory, file.name);
    return fileNs !== NO_TIME && fileNs > markerNs;
  });
}

function canCompleteParticipant(key, index) {
  if (objectHasOwn(index.unreadable, key) || objectHasOwn(index.corruptMarkers, key)) return false;
  if (!hasValidStart(key, index.starts)) return false;
  if (ownProp(index.rosters[key]?.marker, MARKER_FIELD.HAS_STRIPPED_CLAUSE) === true) return false;
  return !objectHasOwn(index.rosters, key) || objectHasOwn(index.lastFlush, key);
}

function hasExitedMainProcess(directory, mainKey, index) {
  const mainEnd = index.ends[mainKey]?.marker;
  return isPlainObject(mainEnd) && ownProp(mainEnd, MARKER_FIELD.BY) === END_BY_EXIT &&
    canCompleteParticipant(mainKey, index) &&
    finalWriteFollows(directory, mainKey, index);
}

function workerCompletion(directory, key, mainKey, mainAck, index) {
  if (ownProp(index.rosters[key]?.marker, MARKER_FIELD.EVAL) === true) return null;
  if (hasExitedMainProcess(directory, mainKey, index)) return END_BY_EXIT;
  const ack = finalAck(index.flushed, key);
  return ack && mainAck && ownProp(ack, MARKER_FIELD.ID) === ownProp(mainAck, MARKER_FIELD.ID) ?
    COMPLETE_BY_FLUSH : null;
}

function completion(directory, key, index) {
  if (!canCompleteParticipant(key, index)) return null;
  if (objectHasOwn(index.ends, key)) {
    return finalWriteFollows(directory, key, index) ? END_BY_EXIT : null;
  }
  const {pid, threadId} = participantIdentity(key, index);
  const mainKey = witnessKey(pid, MAIN_THREAD_ID);
  const mainAck = finalAck(index.flushed, mainKey);
  if (threadId === MAIN_THREAD_ID) return mainAck ? COMPLETE_BY_FLUSH : null;
  return workerCompletion(directory, key, mainKey, mainAck, index);
}

function isStrippedOrMissingStart(key, index) {
  return !objectHasOwn(index.starts, key) ||
    ownProp(index.rosters[key]?.marker, MARKER_FIELD.HAS_STRIPPED_CLAUSE) === true;
}

function selectLostCause(directory, key, pid, index) {
  if (objectHasOwn(index.unreadable, key)) return WITNESS_LOST_CAUSE.UNREADABLE_COVERAGE;
  if (isStrippedOrMissingStart(key, index)) return WITNESS_LOST_CAUSE.UNINSTRUMENTED;
  if (!hasValidStart(key, index.starts) || objectHasOwn(index.corruptMarkers, key)) {
    return WITNESS_LOST_CAUSE.UNKNOWN;
  }
  if (setHas(index.requested, pid)) return WITNESS_LOST_CAUSE.FLUSH_UNANSWERED;
  if (objectHasOwn(index.ends, key) && !finalWriteFollows(directory, key, index)) {
    return WITNESS_LOST_CAUSE.FINAL_WRITE_MISSING;
  }
  if (objectHasOwn(index.rosters, key) && !objectHasOwn(index.lastFlush, key)) {
    return WITNESS_LOST_CAUSE.NO_COVERAGE;
  }
  return WITNESS_LOST_CAUSE.UNKNOWN;
}

function resolveLostEntry(startMarker, rosterMarker) {
  const startEntry = ownProp(startMarker, MARKER_FIELD.ENTRY);
  if (typeof startEntry === 'string') return startEntry;
  const rosterEntry = ownProp(rosterMarker, MARKER_FIELD.ENTRY);
  if (typeof rosterEntry === 'string') return rosterEntry;
  const parentEntry = ownProp(rosterMarker, MARKER_FIELD.PARENT_ENTRY);
  return typeof parentEntry === 'string' ? parentEntry : null;
}

function processEntryOf(pid, threadId, startMarker, rosterMarker, index) {
  const F = MARKER_FIELD;
  if (threadId === MAIN_THREAD_ID) {
    const startEntry = ownProp(startMarker, F.ENTRY);
    if (typeof startEntry === 'string') return startEntry;
    const rosterEntry = ownProp(rosterMarker, F.ENTRY);
    return typeof rosterEntry === 'string' ? rosterEntry : null;
  }
  const mainKey = witnessKey(pid, MAIN_THREAD_ID);
  const mainStartEntry = ownProp(index.starts[mainKey]?.marker, F.ENTRY);
  if (typeof mainStartEntry === 'string') return mainStartEntry;
  const mainRosterEntry = ownProp(index.rosters[mainKey]?.marker, F.ENTRY);
  if (typeof mainRosterEntry === 'string') return mainRosterEntry;
  const parentEntry = ownProp(rosterMarker, F.PARENT_ENTRY);
  return typeof parentEntry === 'string' ? parentEntry : null;
}

function optionalLostMetadata(rosterMarker, uninstrumented) {
  const F = MARKER_FIELD;
  const rawParentEntry = ownProp(rosterMarker, F.PARENT_ENTRY);
  const parentEntry = typeof rawParentEntry === 'string' ? rawParentEntry : null;
  const rawSeedFiles = ownProp(rosterMarker, F.SEED_FILES);
  const seedFiles = arrayFilter(
    arrayIsArray(rawSeedFiles) ? rawSeedFiles : [],
    (item) => typeof item === 'string',
  );
  return {
    ...(parentEntry !== null ? {parentEntry} : {}),
    ...(seedFiles.length > 0 ? {seedFiles} : {}),
    ...(ownProp(rosterMarker, F.EVAL) === true ? {eval: true} : {}),
    ...(uninstrumented ? {uninstrumented: true} : {}),
  };
}

function markerObject(record) {
  return isPlainObject(record?.marker) ? record.marker : objectCreate(null);
}

function isLostUninstrumented(key, rosterMarker, index) {
  return !objectHasOwn(index.starts, key) ||
    ownProp(rosterMarker, MARKER_FIELD.HAS_STRIPPED_CLAUSE) === true ||
    objectHasOwn(index.unreadable, key);
}

function pickNullish(primary, secondary) {
  return primary ?? secondary ?? null;
}

function lostWitness(directory, key, index) {
  const F = MARKER_FIELD;
  const {pid, threadId} = participantIdentity(key, index);
  const startMarker = markerObject(index.starts[key]);
  const rosterMarker = markerObject(index.rosters[key]);
  const lastFlushMs = index.lastFlush[key];
  const uninstrumented = isLostUninstrumented(key, rosterMarker, index);
  return {
    pid: toNumber(pid),
    threadId: toNumber(threadId),
    ppid: pickNullish(ownProp(startMarker, F.PPID), ownProp(rosterMarker, F.PPID)),
    entry: resolveLostEntry(startMarker, rosterMarker),
    processEntry: processEntryOf(pid, threadId, startMarker, rosterMarker, index),
    ...optionalLostMetadata(rosterMarker, uninstrumented),
    cwd: pickNullish(ownProp(startMarker, F.CWD), ownProp(rosterMarker, F.CWD)),
    startedAt: pickNullish(
      ownProp(startMarker, F.STARTED_AT),
      ownProp(rosterMarker, F.RECORDED_AT),
    ),
    isMainThread: threadId === MAIN_THREAD_ID,
    lastFlushAt: lastFlushMs ? dateToISOString(new DateConstructor(lastFlushMs)) : null,
    cause: selectLostCause(directory, key, pid, index),
  };
}

/**
 * The witnesses of one coverage directory, reconciled against the expected
 * participant roster, start/exit/flush markers, and validated V8 coverage.
 * @param {string} directory
 * @param {Array<string>} names the directory's file names
 * @return {{started: number, complete: number, flushed: number, lost: Array<Object>}}
 */
export function accountWitnesses(directory, names) {
  const index = indexDirectory(directory, names);
  const keys = reconciledKeys(index);
  const lost = [];
  let complete = 0;
  let flushed = 0;
  for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
    const key = keys[keyIndex];
    const how = completion(directory, key, index);
    if (how === null) {
      arrayPush(lost, lostWitness(directory, key, index));
    } else {
      complete += 1;
      if (how === COMPLETE_BY_FLUSH) flushed += 1;
    }
  }
  return {started: complete + lost.length, complete, flushed, lost};
}

function outsideRoots(file, roots) {
  if (typeof file !== 'string' || !pathIsAbsolute(file)) return false;
  return arrayEvery(roots, (root) => {
    const relative = pathRelative(root, file);
    return stringStartsWith(relative, PARENT_PREFIX) || pathIsAbsolute(relative);
  });
}

function isExternalWitness(lost, roots) {
  if (lost.uninstrumented === true || lost.cause === WITNESS_LOST_CAUSE.UNREADABLE_COVERAGE) {
    return false;
  }
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
  return {
    ...accounted,
    lost: arrayFilter(accounted.lost, (lost) => !isExternalWitness(lost, roots)),
    external: arrayFilter(accounted.lost, (lost) => isExternalWitness(lost, roots)),
  };
}
