#!/usr/bin/env node
/**
 * Fallback-branch coverage census: which side of each fallback site ever
 * executes under the five canonical lanes (`unit`, `packaging`, `integration`,
 * `bootstrap`, `formation`).
 *
 *   node scripts/checks/fallback-branch-census.js collect --lane LANE --out DIR
 *   node scripts/checks/fallback-branch-census.js merge --runs DIR... --out FILE
 *   node scripts/checks/fallback-branch-census.js join --merged FILE --runs DIR...
 *     [--sites FILE] [--out data/fallback-census/census.json]
 *   node scripts/checks/fallback-branch-census.js report --census FILE
 *
 * collect runs one lane locally under `NODE_V8_COVERAGE=DIR/v8` with
 * `fallback-branch-census-preload.js` in `NODE_OPTIONS` (`--import`), records
 * the expected lane process in the participant roster, and writes `DIR/run.json`
 * with preload sha256, coverage directory digest, witness accounting, problems,
 * and `src/` file sha256 digests.
 *
 * merge validates each run's metadata, preload sha256, non-empty `v8/`, and
 * coverage digest, folds valid V8 coverage intervals per `src/` file, records
 * any unreadable coverage or marker file in `unreadable`, and accounts all
 * expected and observed witnesses.
 *
 * join binds each fallback site to the verified runs whose `fileDigests` match
 * the current `src/` file bytes and whose source slice matches `site.hash`,
 * voids acquittals in any lost witness's closure to `unobserved`, and in CLI
 * mode refuses unreadable coverage, missing canonical lanes, incomplete runs,
 * or lost witnesses. Zero uncensused sites means every detected fallback site
 * was observed and accounted for, never zero fallback logic.
 */

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath, pathToFileURL} from 'node:url';

import {
  CENSUS_CLASS,
  CENSUS_COVERAGE_DIR_ENV,
  CENSUS_DEMO_STOP_DEADLINE_MS,
  CENSUS_LANE as LANE,
  CENSUS_ROWS,
  CENSUS_SCHEMA,
  CENSUS_TEST_HEAP_MB,
  DEFAULT_CENSUS_PATH,
  DEMO_STOP_DEADLINE_ENV,
  PISCINA_ATOMICS_DISABLED,
  PISCINA_ATOMICS_ENV,
  PRELOAD_MODULE_RELATIVE,
  REQUIRED_CENSUS_LANES,
  RUN_RECORD_FILE,
  SOURCE_PREFIX,
  TEST_HEAP_ENV,
  V8_DIRECTORY,
} from './fallback-branch-census-constants.js';
import {
  accountRunWitnesses,
  coverageDirectoryDigest,
  coverageFileNames,
  currentPreloadSha256,
  intervalsOverlap,
  lostWitnessClosures,
  mergeRuns,
  readRunRecord,
  rootsOf,
  sha256Hex,
  unionIntervals,
} from './fallback-branch-census-coverage.js';
import {
  isCoverageFileName,
  recordExpectedNodeProcess,
} from './fallback-branch-census-witnesses.js';
import {loadSealedImporters} from './helper-import-closure.js';
import {execGit} from './git-invocation.js';

export {lostWitnessClosures};

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayPush = Function.call.bind(Array.prototype.push);
const arraySome = Function.call.bind(Array.prototype.some);
const arraySlice = Function.call.bind(Array.prototype.slice);
const arraySort = Function.call.bind(Array.prototype.sort);
const stringReplace = Function.call.bind(String.prototype.replace);
const stringReplaceAll = Function.call.bind(String.prototype.replaceAll);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);
const objectEntries = Object.entries;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLASS_ORDER = Object.freeze([
  CENSUS_CLASS.NEVER, CENSUS_CLASS.PRIMARY_ONLY, CENSUS_CLASS.FALLBACK_ONLY,
  CENSUS_CLASS.BOTH, CENSUS_CLASS.UNOBSERVED, CENSUS_CLASS.UNLOADED,
]);
const CENSUSED_CLASSES = Object.freeze([
  CENSUS_CLASS.NEVER, CENSUS_CLASS.PRIMARY_ONLY, CENSUS_CLASS.FALLBACK_ONLY, CENSUS_CLASS.BOTH,
]);
const VOIDABLE_CLASSES = Object.freeze([
  CENSUS_CLASS.NEVER, CENSUS_CLASS.PRIMARY_ONLY, CENSUS_CLASS.FALLBACK_ONLY,
]);
const CLASS_BY_SIDES = Object.freeze({
  'false|false': CENSUS_CLASS.NEVER,
  'true|false': CENSUS_CLASS.PRIMARY_ONLY,
  'false|true': CENSUS_CLASS.FALLBACK_ONLY,
  'true|true': CENSUS_CLASS.BOTH,
});
const SIDES_KEY_SEPARATOR = '|';
const LANES = REQUIRED_CENSUS_LANES;
const CLASSIFIED_RUNNER = 'scripts/run-classified-test-files.js';
const PRIMARY_FLAG = '--primary';
const FORMATION_HEALTH = 'scripts/checks/formation-health.js';
const TREND_FLAG = '--trend';
const SCRATCH_TREND_FILE = 'formation-trend.ndjson';
const COVERAGE_ENV = 'NODE_V8_COVERAGE';
const NODE_OPTIONS_ENV = 'NODE_OPTIONS';
const IMPORT_FLAG = '--import=';
const OPTION_SEPARATOR = ' ';
const COVERAGE_PRELOAD = path.join(ROOT, PRELOAD_MODULE_RELATIVE);
const PLACEMENT_ENV = 'LAGRANGE_PLACEMENT';
const PLACEMENT_LOCAL = 'local';
const NODE_ENTRY = 'src/index.js';
const DETECTOR_MODULE = './code-navigability-detectors.js';
const SOURCE_DIRECTORY = 'src';
const POSIX_SEPARATOR = '/';
const TEXT_ENCODING = 'utf8';
const NEWLINE = '\n';
const LIST_SEPARATOR = ', ';
const REPORT_HEADING = Object.freeze({
  CLASS: 'per class:', ROW: 'per row:', TOP: 'top files per class:',
});
const JSON_INDENT = 2;
const STDIO_INHERIT = 'inherit';
const GIT_HEAD_ARGS = Object.freeze(['rev-parse', 'HEAD']);
const GIT_HEAD_STDIO = Object.freeze(['ignore', 'pipe', 'pipe']);
const RUN_ID_SEPARATOR = '-';
const TIMESTAMP_DROPPED = Object.freeze(['-', ':']);
const MILLISECONDS_SUFFIX = /\.\d{3}Z$/u;
const ZULU = 'Z';
const FAILED_STATUS = 1;
const TOP_FILE_COUNT = 10;
const FLAG_PREFIX = '--';
const SUBCOMMAND = Object.freeze({
  COLLECT: 'collect', MERGE: 'merge', JOIN: 'join', REPORT: 'report',
});
const FLAG = Object.freeze({
  LANE: '--lane', OUT: '--out', RUNS: '--runs', MERGED: '--merged', SITES: '--sites',
  CENSUS: '--census', COMMAND: '--command', ROOT: '--root', HEAD: '--head',
});
const MULTI_VALUE_FLAGS = Object.freeze([FLAG.RUNS]);
const USAGE = [
  'usage: fallback-branch-census.js collect --lane unit|packaging|integration|bootstrap|' +
    'formation --out DIR',
  '       fallback-branch-census.js merge --runs DIR... --out FILE',
  '       fallback-branch-census.js join --merged FILE --runs DIR... [--sites FILE] [--out FILE]',
  '       fallback-branch-census.js report --census FILE',
].join(NEWLINE);
const PROBLEM = Object.freeze({
  UNKNOWN_LANE: 'unknown lane: ',
  NO_OUT: 'collect needs --out DIR',
  COVERAGE_NOT_EMPTY: 'the coverage directory already holds coverage; collect into a fresh ' +
    'directory: ',
  NO_HEAD: 'cannot read the git HEAD of ',
  RUN_NOT_MERGED: 'run is not in the merged coverage (merge it first): ',
  RUN_DIGEST_DIFFERS: 'run coverage digest differs from the merged coverage: ',
  UNREADABLE_MERGED: 'merged coverage contains unreadable files; refusing join: ',
  MISSING_LANES: 'join requires all five canonical lanes; missing: ',
  INCOMPLETE_RUNS: 'join requires complete runs with zero lost witnesses; offending runs: ',
  SITE_SHAPE: 'site lacks file, row, range, hash or sides: ',
  NO_DETECTOR: 'the detector module is not present; pass --sites FILE: ',
  NO_GRAPH: 'the sealed import graph is unavailable, so lost witnesses cannot be bounded: ',
  PARSE_FAILURES: 'the detector could not parse every file; the census would be incomplete: ',
  MISSING_FLAG: 'missing required flag ',
  UNKNOWN_SUBCOMMAND: 'unknown subcommand: ',
  FLAG_VALUE: 'flag needs a value: ',
  NODE_LOST: 'a formation node left no complete coverage (SIGKILLed past the stop deadline?): ',
  EMPTY_COVERAGE: 'lane produced zero V8 coverage files: ',
});
const SHARD_APPLICABILITY_REASON = Object.freeze({
  PRELOAD_DIGEST_MISMATCH: 'preload-digest-mismatch',
  INCOMPLETE_WITNESSES: 'incomplete-witnesses',
  SRC_DIGEST_MISMATCH: 'src-digest-mismatch',
  DEPENDENCY_FINGERPRINT_MISMATCH: 'dependency-fingerprint-mismatch',
  VALID: 'valid',
});
const NO_PACKAGE_LOCK = 'no-package-lock';
const NO_SRC_DIGEST = 'no-src';
const FILE_MISSING_PREFIX = 'file-missing:';
const FILE_DRIFT_PREFIX = 'file-drift:';

function gitHead(root) {
  try {
    return stringTrim(execGit(GIT_HEAD_ARGS, {
      cwd: root, encoding: TEXT_ENCODING, stdio: GIT_HEAD_STDIO,
    }));
  } catch (_error) {
    throw new Error(`${PROBLEM.NO_HEAD}${root}`);
  }
}

function compactTimestamp(iso) {
  let compact = stringReplace(iso, MILLISECONDS_SUFFIX, ZULU);
  for (const dropped of TIMESTAMP_DROPPED) compact = stringReplaceAll(compact, dropped, '');
  return compact;
}

function walkFiles(directory, root, into) {
  if (!fs.existsSync(directory)) return into;
  const entries = arraySort(
    fs.readdirSync(directory, {withFileTypes: true}),
    (left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0),
  );
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walkFiles(absolute, root, into);
    } else if (entry.isFile()) {
      const relative = arrayJoin(stringSplit(path.relative(root, absolute), path.sep),
        POSIX_SEPARATOR);
      into[relative] = sha256Hex(fs.readFileSync(absolute));
    }
  }
  return into;
}

export function sourceFileDigests(root) {
  return walkFiles(path.join(root, SOURCE_DIRECTORY), root, {});
}

export function computeSrcDigest(fileDigests) {
  if (!fileDigests || typeof fileDigests !== 'object') return '';
  const keys = arraySort(objectKeys(fileDigests));
  const lines = arrayMap(keys, (key) => `${key}:${fileDigests[key]}`);
  return sha256Hex(arrayJoin(lines, NEWLINE));
}

export function computeDependencyFingerprint(root, fileDigests = null) {
  const lockPath = path.join(root, 'package-lock.json');
  const lockHash = fs.existsSync(lockPath) ?
    sha256Hex(fs.readFileSync(lockPath)) : NO_PACKAGE_LOCK;
  const preloadHash = currentPreloadSha256();
  const srcHash = fileDigests ? computeSrcDigest(fileDigests) : NO_SRC_DIGEST;
  return sha256Hex(arrayJoin([lockHash, preloadHash, srcHash], NEWLINE));
}

function checkFileDigests(root, fileDigests) {
  for (const [file, recordedDigest] of objectEntries(fileDigests)) {
    const fullPath = path.join(root, file);
    if (!fs.existsSync(fullPath)) {
      return `${FILE_MISSING_PREFIX}${file}`;
    }
    const currentDigest = sha256Hex(fs.readFileSync(fullPath));
    if (currentDigest !== recordedDigest) {
      return `${FILE_DRIFT_PREFIX}${file}`;
    }
  }
  return SHARD_APPLICABILITY_REASON.VALID;
}

function determineInapplicabilityReason(shardRecord, options, root, currentPreloadDigest) {
  if (shardRecord.preloadDigest && shardRecord.preloadDigest !== currentPreloadDigest) {
    return SHARD_APPLICABILITY_REASON.PRELOAD_DIGEST_MISMATCH;
  }
  if (shardRecord.witnessAccounting && shardRecord.witnessAccounting.complete !== true) {
    return SHARD_APPLICABILITY_REASON.INCOMPLETE_WITNESSES;
  }
  if (shardRecord.fileDigests) {
    const fileResult = checkFileDigests(root, shardRecord.fileDigests);
    if (fileResult !== SHARD_APPLICABILITY_REASON.VALID) return fileResult;
  }
  const currentSrc = options.currentSrcDigest || (shardRecord.fileDigests ?
    computeSrcDigest(sourceFileDigests(root)) : null);
  if (shardRecord.srcDigest && currentSrc && shardRecord.srcDigest !== currentSrc) {
    return SHARD_APPLICABILITY_REASON.SRC_DIGEST_MISMATCH;
  }
  if (options.currentDependencyFingerprint && shardRecord.dependencyFingerprint &&
      shardRecord.dependencyFingerprint !== options.currentDependencyFingerprint) {
    return SHARD_APPLICABILITY_REASON.DEPENDENCY_FINGERPRINT_MISMATCH;
  }
  return SHARD_APPLICABILITY_REASON.VALID;
}

export function validateShardApplicability(shardRecord, options = {}) {
  const root = options.root ? path.resolve(options.root) : ROOT;
  const currentPreloadDigest = options.currentPreloadDigest || currentPreloadSha256();
  const reason = determineInapplicabilityReason(shardRecord, options, root, currentPreloadDigest);
  const applicable = reason === SHARD_APPLICABILITY_REASON.VALID;
  return {applicable, reason};
}

export function laneCommand(lane, out) {
  if (lane === LANE.FORMATION) {
    return [process.execPath, FORMATION_HEALTH, TREND_FLAG, path.join(out, SCRATCH_TREND_FILE)];
  }
  return [process.execPath, CLASSIFIED_RUNNER, PRIMARY_FLAG, lane];
}

export function coveragePreloadOption() {
  return `${IMPORT_FLAG}${pathToFileURL(COVERAGE_PRELOAD).href}`;
}

export function composeNodeOptions(existing, preload) {
  const kept = stringTrim(existing || '');
  return kept ? `${kept}${OPTION_SEPARATOR}${preload}` : preload;
}

function freshRunDirectory(lane, out) {
  if (!arrayIncludes(LANES, lane)) throw new Error(`${PROBLEM.UNKNOWN_LANE}${lane}`);
  if (!out) throw new Error(PROBLEM.NO_OUT);
  const runDir = path.resolve(out);
  const coverageDir = path.join(runDir, V8_DIRECTORY);
  if (fs.existsSync(coverageDir) && fs.readdirSync(coverageDir).length > 0) {
    throw new Error(`${PROBLEM.COVERAGE_NOT_EMPTY}${coverageDir}`);
  }
  fs.mkdirSync(coverageDir, {recursive: true});
  return {runDir, coverageDir};
}

export function laneEnvironment(lane, {env, coverageDir, preload}) {
  return {
    ...env,
    [COVERAGE_ENV]: coverageDir,
    [CENSUS_COVERAGE_DIR_ENV]: coverageDir,
    [PLACEMENT_ENV]: PLACEMENT_LOCAL,
    [TEST_HEAP_ENV]: String(CENSUS_TEST_HEAP_MB),
    [PISCINA_ATOMICS_ENV]: PISCINA_ATOMICS_DISABLED,
    ...(lane === LANE.FORMATION ?
      {[DEMO_STOP_DEADLINE_ENV]: String(CENSUS_DEMO_STOP_DEADLINE_MS)} : {}),
    [NODE_OPTIONS_ENV]: composeNodeOptions(env[NODE_OPTIONS_ENV], preload),
  };
}

function runLaneProcess(argv, {lane, root, env, coverageDir, preload}) {
  const args = arraySlice(argv, 1);
  const options = {
    cwd: root,
    env: laneEnvironment(lane, {env, coverageDir, preload}),
    stdio: STDIO_INHERIT,
  };
  const result = spawnSync(argv[0], args, options);
  recordExpectedNodeProcess(argv[0], args, options, result?.pid);
  return result;
}

export function laneProblems(lane, witnesses, root, names = null) {
  const problems = [];
  if (Array.isArray(names) && !arraySome(names, isCoverageFileName)) {
    arrayPush(problems, `${PROBLEM.EMPTY_COVERAGE}${lane}`);
  }
  if (lane !== LANE.FORMATION) return problems;
  for (const lost of witnesses.lost) {
    const entry = typeof lost.entry === 'string' ?
      arrayJoin(stringSplit(path.relative(root, lost.entry), path.sep), POSIX_SEPARATOR) : null;
    if (lost.isMainThread && entry === NODE_ENTRY) {
      arrayPush(problems, `${PROBLEM.NODE_LOST}pid ${lost.pid} (${lost.cause})`);
    }
  }
  return problems;
}

export function collectRun({lane, out, root = ROOT, command = null, env = process.env,
  host = os.hostname(), commit = null, now = () => new Date()}) {
  const {runDir, coverageDir} = freshRunDirectory(lane, out);
  const resolvedCommit = commit || gitHead(root);
  const startedAt = now().toISOString();
  const preload = coveragePreloadOption();
  const result = runLaneProcess(command || laneCommand(lane, runDir), {
    lane, root, env, coverageDir, preload,
  });
  const finishedAt = now().toISOString();
  const names = coverageFileNames(coverageDir);
  const witnesses = accountRunWitnesses(coverageDir, names,
    rootsOf({root: path.resolve(root)}, runDir));
  const incomplete = result.signal !== null;
  const fileDigests = sourceFileDigests(root);
  const srcDigest = computeSrcDigest(fileDigests);
  const preloadDigest = currentPreloadSha256();
  const dependencyFingerprint = computeDependencyFingerprint(root, fileDigests);
  const missingWitnesses = (witnesses.lost || []).length;
  const uninstrumentedCount = arrayFilter(witnesses.lost || [],
    (w) => w.uninstrumented === true || w.cause === 'uninstrumented').length;
  const exitCode = result.status ?? 0;
  const problems = laneProblems(lane, witnesses, root, incomplete ? null : names);
  const complete = exitCode === 0 && !incomplete &&
    problems.length === 0 && missingWitnesses === 0 && uninstrumentedCount === 0;
  const witnessAccounting = {
    complete,
    started: witnesses.started,
    completeCount: witnesses.complete,
    missingWitnesses,
    uninstrumentedCount,
    exitCode,
  };
  const record = {
    id: arrayJoin([lane, host, compactTimestamp(startedAt)], RUN_ID_SEPARATOR),
    lane,
    host,
    commit: resolvedCommit,
    root: path.resolve(root),
    startedAt,
    finishedAt,
    exitCode,
    signal: result.signal,
    incomplete,
    srcDigest,
    preloadDigest,
    dependencyFingerprint,
    witnessAccounting,
    coveragePreload: {
      active: true,
      option: preload,
      module: PRELOAD_MODULE_RELATIVE,
      sha256: preloadDigest,
    },
    witnesses,
    problems,
    coverageDigest: coverageDirectoryDigest(coverageDir),
    fileDigests,
  };
  fs.writeFileSync(path.join(runDir, RUN_RECORD_FILE),
    `${jsonStringify(record, null, JSON_INDENT)}${NEWLINE}`);
  return record;
}

function isRange(value) {
  return Array.isArray(value) && value.length === 2 &&
    Number.isInteger(value[0]) && Number.isInteger(value[1]);
}

function assertSiteShape(site) {
  const valid = typeof site?.file === 'string' && typeof site.row === 'string' &&
    isRange(site.range) && typeof site.hash === 'string' &&
    isRange(site.sides?.primary) && isRange(site.sides?.fallback);
  if (!valid) throw new Error(`${PROBLEM.SITE_SHAPE}${jsonStringify(site)}`);
}

function compareSites(left, right) {
  const keys = [
    [left.file, right.file], [left.range[0], right.range[0]],
    [left.range[1], right.range[1]], [left.row, right.row],
    [left.occurrence, right.occurrence],
  ];
  for (const [a, b] of keys) {
    if (a < b) return -1;
    if (a > b) return 1;
  }
  return 0;
}

function currentSourceRecord(root, file, cache) {
  if (!objectHasOwn(cache, file)) {
    const absolute = path.join(root, file);
    if (fs.existsSync(absolute)) {
      const buffer = fs.readFileSync(absolute);
      cache[file] = {digest: sha256Hex(buffer), text: buffer.toString(TEXT_ENCODING)};
    } else {
      cache[file] = {digest: null, text: null};
    }
  }
  return cache[file];
}

function siteSliceMatchesHash(site, sourceText) {
  if (typeof sourceText !== 'string') return false;
  const [start, end] = site.range;
  if (start < 0 || end < start || end > sourceText.length) return false;
  const sliceHash = sha256Hex(`${site.file}${NEWLINE}${stringSlice(sourceText, start, end)}`);
  return sliceHash === site.hash;
}

function matchingRuns(entry, file, digest, runs) {
  const matching = [];
  if (!entry || digest === null) return matching;
  for (const run of runs) {
    if (objectHasOwn(entry.runs, run.id) && run.fileDigests?.[file] === digest) {
      arrayPush(matching, run);
    }
  }
  return matching;
}

function sidesOf(intervals, site) {
  return {
    primary: intervalsOverlap(intervals, site.sides.primary),
    fallback: intervalsOverlap(intervals, site.sides.fallback),
  };
}

function voidingWitnesses(site, digest, runs, closures) {
  const voiding = [];
  for (const closure of closures[site.file] || []) {
    const run = runs[closure.runIndex];
    if (run.fileDigests?.[site.file] === digest) arrayPush(voiding, closure.id);
  }
  return voiding;
}

function classifySite(site, entry, source, runs, closures) {
  if (!siteSliceMatchesHash(site, source.text)) {
    return {
      klass: CENSUS_CLASS.UNLOADED, primary: false, fallback: false,
      runIds: [], sidesByRun: {}, lost: [],
    };
  }
  const contributing = matchingRuns(entry, site.file, source.digest, runs);
  if (contributing.length === 0) {
    return {
      klass: CENSUS_CLASS.UNLOADED, primary: false, fallback: false,
      runIds: [], sidesByRun: {}, lost: [],
    };
  }
  let executed = [];
  const sidesByRun = {};
  for (const run of contributing) {
    executed = unionIntervals(executed, entry.runs[run.id]);
    sidesByRun[run.id] = sidesOf(entry.runs[run.id], site);
  }
  const {primary, fallback} = sidesOf(executed, site);
  const observed = CLASS_BY_SIDES[`${primary}${SIDES_KEY_SEPARATOR}${fallback}`];
  const incomplete = arraySome(contributing, (run) => run.incomplete === true);
  let klass = incomplete && observed !== CENSUS_CLASS.BOTH ? CENSUS_CLASS.UNLOADED : observed;
  const lost = arrayIncludes(VOIDABLE_CLASSES, klass) ?
    voidingWitnesses(site, source.digest, runs, closures) : [];
  if (lost.length > 0) klass = CENSUS_CLASS.UNOBSERVED;
  return {
    klass, primary, fallback, runIds: arrayMap(contributing, (run) => run.id), sidesByRun, lost,
  };
}

function sealedImporters(root) {
  const sealed = loadSealedImporters(root);
  if (!sealed.ok) throw new Error(`${PROBLEM.NO_GRAPH}${sealed.problem}`);
  return sealed.importers;
}

function bindRuns(merged, runDirs) {
  const mergedById = {};
  for (const run of merged.runs || []) mergedById[run.id] = run;
  return arrayMap(runDirs, (runDir) => {
    const run = readRunRecord(runDir);
    if (!objectHasOwn(mergedById, run.id)) throw new Error(`${PROBLEM.RUN_NOT_MERGED}${run.id}`);
    if (mergedById[run.id].coverageDigest !== run.coverageDigest) {
      throw new Error(`${PROBLEM.RUN_DIGEST_DIFFERS}${run.id}`);
    }
    return run;
  });
}

function witnessCounts(accounted) {
  if (!accounted || accounted.started === 0) return null;
  return {
    started: accounted.started,
    complete: accounted.complete,
    flushed: accounted.flushed ?? 0,
    lost: accounted.lost.length,
    external: (accounted.external || []).length,
  };
}

function resolveLostClosures(merged, runs, root, importers) {
  const hasUnreadable = (merged.unreadable || []).length > 0;
  const hasLostWitness = arraySome(
    runs,
    (run) => (merged.witnesses?.[run.id]?.lost || []).length > 0,
  );
  if (!hasUnreadable && !hasLostWitness) return {};
  return lostWitnessClosures(merged, runs, importers || sealedImporters(root));
}

function buildSiteRecord(site, merged, root, sources, runs, closures) {
  assertSiteShape(site);
  const source = currentSourceRecord(root, site.file, sources);
  const entry = objectHasOwn(merged.files, site.file) ? merged.files[site.file] : null;
  const {klass, primary, fallback, runIds, sidesByRun, lost} =
    classifySite(site, entry, source, runs, closures);
  return {
    file: site.file,
    row: site.row,
    range: [site.range[0], site.range[1]],
    hash: site.hash,
    occurrence: site.occurrence ?? 0,
    class: klass,
    sidesExecuted: {primary, fallback},
    runs: runIds,
    sidesByRun,
    ...(lost.length > 0 ? {lostWitnesses: lost} : {}),
  };
}

function summarizeRunForCensus(run, merged) {
  return {
    id: run.id,
    lane: run.lane,
    host: run.host,
    commit: run.commit,
    startedAt: run.startedAt,
    coverageDigest: run.coverageDigest,
    ...(run.incomplete === true ? {incomplete: true} : {}),
    witnesses: witnessCounts(merged.witnesses?.[run.id]),
  };
}

export function joinCensus({merged, runDirs, sites, root = ROOT, head = null,
  now = () => new Date(), importers = null}) {
  const runs = bindRuns(merged, runDirs);
  const closures = resolveLostClosures(merged, runs, root, importers);
  const sources = {};
  const records = arrayMap(
    sites,
    (site) => buildSiteRecord(site, merged, root, sources, runs, closures),
  );
  arraySort(records, compareSites);
  return {
    schema: CENSUS_SCHEMA,
    generatedAt: now().toISOString(),
    head: head || gitHead(root),
    runs: arrayMap(runs, (run) => summarizeRunForCensus(run, merged)),
    sites: records,
  };
}

function countBy(items, keyOf) {
  const counts = {};
  for (const item of items) {
    const key = keyOf(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function classCountsText(counts) {
  const parts = [];
  for (const klass of CLASS_ORDER) {
    if (counts[klass]) arrayPush(parts, `${klass} ${counts[klass]}`);
  }
  return arrayJoin(parts, LIST_SEPARATOR);
}

export function formatCensusReport(census, {top = TOP_FILE_COUNT} = {}) {
  const byClass = countBy(census.sites, (site) => site.class);
  const total = census.sites.length;
  let censused = 0;
  for (const klass of CENSUSED_CLASSES) censused += byClass[klass] || 0;
  const uncensused = total - censused;
  const lines = [
    `fallback census at ${census.head} from ${census.runs.length} runs: ` +
      arrayJoin(arrayMap(census.runs, (run) => run.id), LIST_SEPARATOR),
    `sites: ${total} (fallback logic sites detected: ${total}; censused: ${censused}, ` +
      `uncensused: ${uncensused} -- 0 uncensused never means zero fallback logic)`,
    REPORT_HEADING.CLASS,
  ];
  for (const klass of CLASS_ORDER) arrayPush(lines, `  ${klass}: ${byClass[klass] || 0}`);
  arrayPush(lines, REPORT_HEADING.ROW);
  const rows = arraySort(objectKeys(countBy(census.sites, (site) => site.row)));
  for (const row of rows) {
    const inRow = arrayFilter(census.sites, (site) => site.row === row);
    arrayPush(lines, `  ${row}: ${classCountsText(countBy(inRow, (site) => site.class))}`);
  }
  arrayPush(lines, REPORT_HEADING.TOP);
  for (const klass of CLASS_ORDER) {
    const files = objectEntries(countBy(
      arrayFilter(census.sites, (site) => site.class === klass),
      (site) => site.file,
    ));
    if (files.length === 0) continue;
    arraySort(files, (left, right) => right[1] - left[1] || (left[0] < right[0] ? -1 : 1));
    const shown = arrayMap(arraySlice(files, 0, top), ([file, count]) => `${file} ${count}`);
    arrayPush(lines, `  ${klass}: ${arrayJoin(shown, LIST_SEPARATOR)}`);
  }
  return arrayJoin(lines, NEWLINE);
}

async function loadSites(root, sitesFile) {
  if (sitesFile) {
    const parsed = jsonParse(fs.readFileSync(path.resolve(sitesFile), TEXT_ENCODING));
    return Array.isArray(parsed) ? parsed : parsed.sites;
  }
  let detectors;
  try {
    detectors = await import(DETECTOR_MODULE);
  } catch (error) {
    throw new Error(`${PROBLEM.NO_DETECTOR}${error.message}`);
  }
  const {sites, parseFailures} = detectors.detectNavigabilityPatterns(root);
  if (parseFailures && parseFailures.length > 0) {
    throw new Error(`${PROBLEM.PARSE_FAILURES}${jsonStringify(parseFailures)}`);
  }
  return arrayFilter(sites, (site) => arrayIncludes(CENSUS_ROWS, site.row) &&
    stringStartsWith(site.file, SOURCE_PREFIX));
}

export function parseCensusArguments(argv) {
  const flags = {};
  let index = 1;
  while (index < argv.length) {
    const flag = argv[index];
    if (arrayIncludes(MULTI_VALUE_FLAGS, flag)) {
      const values = [];
      index += 1;
      while (index < argv.length && !stringStartsWith(argv[index], FLAG_PREFIX)) {
        arrayPush(values, argv[index]);
        index += 1;
      }
      flags[flag] = values;
    } else {
      if (index + 1 >= argv.length) throw new Error(`${PROBLEM.FLAG_VALUE}${flag}`);
      flags[flag] = argv[index + 1];
      index += 2;
    }
  }
  return {subcommand: argv[0], flags};
}

function required(flags, flag) {
  const value = flags[flag];
  if (value === undefined || (Array.isArray(value) && value.length === 0)) {
    throw new Error(`${PROBLEM.MISSING_FLAG}${flag}`);
  }
  return value;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(path.resolve(file)), {recursive: true});
  fs.writeFileSync(path.resolve(file), `${jsonStringify(value)}${NEWLINE}`);
}

function runMerge(flags, write) {
  const started = Date.now();
  const merged = mergeRuns(required(flags, FLAG.RUNS));
  const out = required(flags, FLAG.OUT);
  writeJson(out, merged);
  const bytes = fs.statSync(path.resolve(out)).size;
  for (const run of merged.runs) {
    write(`merge: ${run.id}: ${merged.processes[run.id]} coverage files`);
  }
  write(`merge: ${objectKeys(merged.files).length} src files loaded, ${bytes} bytes, ` +
    `${Date.now() - started} ms -> ${out}`);
  for (const lost of merged.unreadable) write(`merge: UNREADABLE ${lost.run} ${lost.file}`);
  return merged.unreadable.length === 0 ? 0 : FAILED_STATUS;
}

export function assertCompleteFiveLaneJoin(merged, census) {
  if ((merged.unreadable || []).length > 0) {
    const names = arrayMap(merged.unreadable, (item) => `${item.run}:${item.file}`);
    throw new Error(`${PROBLEM.UNREADABLE_MERGED}${arrayJoin(names, LIST_SEPARATOR)}`);
  }
  const presentLanes = new Set(arrayMap(census.runs, (run) => run.lane));
  const missingLanes = arrayFilter(REQUIRED_CENSUS_LANES, (lane) => !presentLanes.has(lane));
  if (missingLanes.length > 0) {
    throw new Error(`${PROBLEM.MISSING_LANES}${arrayJoin(missingLanes, LIST_SEPARATOR)}`);
  }
  const badRuns = arrayFilter(
    census.runs,
    (run) => run.incomplete === true ||
      (run.exitCode !== undefined && run.exitCode !== 0) ||
      !run.witnesses ||
      run.witnesses.lost > 0 ||
      (run.witnessAccounting && run.witnessAccounting.complete !== true),
  );
  if (badRuns.length > 0) {
    const ids = arrayMap(badRuns, (run) => run.id);
    throw new Error(`${PROBLEM.INCOMPLETE_RUNS}${arrayJoin(ids, LIST_SEPARATOR)}`);
  }
}

async function runJoin(flags, write) {
  const root = flags[FLAG.ROOT] ? path.resolve(flags[FLAG.ROOT]) : ROOT;
  const merged = jsonParse(fs.readFileSync(path.resolve(required(flags, FLAG.MERGED)),
    TEXT_ENCODING));
  const sites = await loadSites(root, flags[FLAG.SITES]);
  const census = joinCensus({
    merged, runDirs: required(flags, FLAG.RUNS), sites, root, head: flags[FLAG.HEAD] || null,
  });
  assertCompleteFiveLaneJoin(merged, census);
  const out = flags[FLAG.OUT] || DEFAULT_CENSUS_PATH;
  const outPath = path.resolve(root, out);
  fs.mkdirSync(path.dirname(outPath), {recursive: true});
  fs.writeFileSync(outPath, `${jsonStringify(census, null, JSON_INDENT)}${NEWLINE}`);
  write(formatCensusReport(census));
  write(`join: wrote ${out}`);
  const allCensused = arrayEvery(
    census.sites,
    (site) => arrayIncludes(CENSUSED_CLASSES, site.class),
  );
  return allCensused ? 0 : FAILED_STATUS;
}

function runCollect(flags, write) {
  const root = flags[FLAG.ROOT] ? path.resolve(flags[FLAG.ROOT]) : ROOT;
  const lane = required(flags, FLAG.LANE);
  const command = flags[FLAG.COMMAND] ? jsonParse(flags[FLAG.COMMAND]) : null;
  const record = collectRun({
    lane, out: required(flags, FLAG.OUT), root, command, commit: flags[FLAG.HEAD] || null,
  });
  write(`collect: ${record.id} exit ${record.exitCode}` +
    `${record.signal ? ` signal ${record.signal}` : ''} ${record.startedAt} .. ` +
    `${record.finishedAt} -> ${path.join(required(flags, FLAG.OUT), RUN_RECORD_FILE)}`);
  const {witnesses} = record;
  write(`collect: witnesses started ${witnesses.started} complete ${witnesses.complete} ` +
    `(flushed before a kill ${witnesses.flushed}) lost ${witnesses.lost.length} ` +
    `external ${witnesses.external.length}`);
  for (const lost of witnesses.lost) {
    write(`collect: LOST ${lost.pid}:${lost.threadId} ${lost.entry} (${lost.cause})`);
  }
  for (const problem of record.problems) write(`collect: PROBLEM ${problem}`);
  const clean = record.exitCode === 0 && !record.incomplete &&
    record.problems.length === 0 && witnesses.lost.length === 0;
  return clean ? 0 : FAILED_STATUS;
}

const SUBCOMMANDS = Object.freeze({
  [SUBCOMMAND.COLLECT]: runCollect,
  [SUBCOMMAND.MERGE]: runMerge,
  [SUBCOMMAND.JOIN]: runJoin,
  [SUBCOMMAND.REPORT]: (flags, write) => {
    write(formatCensusReport(jsonParse(fs.readFileSync(path.resolve(
      required(flags, FLAG.CENSUS)), TEXT_ENCODING))));
    return 0;
  },
});

async function main(argv) {
  const write = (line) => process.stdout.write(`${line}${NEWLINE}`);
  const {subcommand, flags} = parseCensusArguments(argv);
  if (!objectHasOwn(SUBCOMMANDS, subcommand)) {
    process.stderr.write(`${PROBLEM.UNKNOWN_SUBCOMMAND}${subcommand}${NEWLINE}${USAGE}${NEWLINE}`);
    return FAILED_STATUS;
  }
  return SUBCOMMANDS[subcommand](flags, write);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main(arraySlice(process.argv, 2));
  } catch (error) {
    process.stderr.write(`fallback-branch-census: ${error.message}${NEWLINE}`);
    process.exitCode = FAILED_STATUS;
  }
}
