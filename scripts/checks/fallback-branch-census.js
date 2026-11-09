#!/usr/bin/env node
/**
 * Fallback-branch coverage census: which side of each fallback site ever
 * executes under the test corpus and a fresh formation.
 *
 *   node scripts/checks/fallback-branch-census.js collect --lane LANE --out DIR
 *   node scripts/checks/fallback-branch-census.js merge --runs DIR... --out FILE
 *   node scripts/checks/fallback-branch-census.js join --merged FILE --runs DIR...
 *     [--sites FILE] [--out data/fallback-census/census.json]
 *   node scripts/checks/fallback-branch-census.js report --census FILE
 *
 * collect runs one lane - `unit`, `packaging`, `integration`, `bootstrap`
 * through `scripts/run-classified-test-files.js --primary LANE`, or
 * `formation` through `scripts/checks/formation-health.js` (its thermal gate,
 * then the five-process formation-only demo, with the trend record sent to a
 * scratch file in DIR so the committed trend is never written) - with
 * NODE_V8_COVERAGE=DIR/v8 in the child environment, so every node process
 * the lane starts writes its block coverage there, and with
 * fallback-branch-census-preload.js appended to NODE_OPTIONS (`--import`), so
 * a process a SIGTERM or SIGINT ends - or that a driver SIGKILLs after one -
 * still flushes the coverage it had when the signal came.
 * The lane is kept on this machine (LAGRANGE_PLACEMENT=local): a shard placed
 * on another host would take its coverage with it. No file under src/ is
 * touched; instrumentation is the environment alone. DIR/run.json records
 * the run's id, lane, host, commit, start and finish, exit code, the
 * preload that was active (its option, path and sha256), the digest
 * of its coverage directory (sha256 over the sorted sha256s of its files)
 * and the sha256 of every src file at collection.
 *
 * The preload also accounts for every thread it ran in: a start marker at
 * load, a flush every FLUSH_INTERVAL_MS, and an end marker once the thread's
 * coverage is complete (fallback-branch-census-witnesses.js). A thread that
 * started and never completed - SIGKILLed, aborted, a worker that died with
 * its process - is a LOST witness; run.json lists them under `witnesses`
 * beside `incomplete`, which keeps meaning the lane process itself was
 * signalled.
 *
 * Losses the lanes cause on purpose are eliminated, not accepted. collect
 * sets CENSUS_COVERAGE_DIR_ENV, which arms the pre-kill flush: a test that
 * kills a child on purpose asks it to flush first
 * (test/test-helpers/census-pre-kill-flush.js; the preload documents the
 * protocol), and a thread that acknowledged a final flush is complete. It
 * raises the test runner's heap limit (TEST_HEAP_ENV): coverage writes parse
 * into the heap, and a 512 MB test process aborted on them. It turns off
 * piscina's Atomics.wait idling (PISCINA_ATOMICS_ENV): an idle pool worker
 * blocked there runs no flush timer and answers no flush request. For the
 * formation lane it lengthens the demo's node stop deadline
 * (DEMO_STOP_DEADLINE_ENV) so every node drains and exits by itself; a
 * formation node that still left no complete coverage is a run.json
 * `problems` entry and fails collect loudly. A lost witness whose entry
 * script and working directory lie outside the root and whose surviving
 * coverage names no repository file (a test's copy of the scripts under
 * /tmp) is `external`: counted, voiding nothing.
 *
 * merge folds the coverage of one or more runs, one coverage file at a time,
 * into per-file executed intervals per run (see
 * fallback-branch-census-coverage.js for the innermost-range semantics). It
 * refuses a run whose coverage changed since collection, lists every
 * coverage file it could not parse (that list makes the exit status 1), and
 * names every lost witness per run with the repository files its surviving
 * coverage shows.
 *
 * join reads the detector sites (scripts/checks/code-navigability-detectors.js,
 * rows two_source_fallback_reads, typeof_dual_paths, catch_returns_default)
 * or a fixture list (--sites), and gives each site one class:
 *
 *   unloaded       no run that loaded the file collected it at its current
 *                  content: no run loaded it, or the file's sha256 differs
 *                  from the digest every loading run recorded. Unloaded is
 *                  NOT never: nothing was observed, so the site is
 *                  uncensused and an incomplete census never acquits it.
 *   never          the file was loaded at its current content and neither
 *                  side executed.
 *   primary-only   only the primary side executed (the leftmost term of a
 *                  `||`/`??` chain, the then side of a typeof test, the try
 *                  block of a catch-and-default).
 *   fallback-only  only the fallback side executed (the last term, the else
 *                  side, the catch body).
 *   both           both sides executed.
 *   unobserved     the file was loaded at its current content and one side
 *                  (or both) was never seen, while a lost witness of a run
 *                  whose tree held the file at that content had it in its
 *                  static import closure - from its entry script (argv[1])
 *                  and every repository file its surviving coverage names,
 *                  over the sealed import graph (helper-import-closure.js);
 *                  a lost worker thread's closure starts from its process's
 *                  main entry too.
 *                  The missing side may have run there: unobserved is
 *                  uncensused, never an acquittal, and the record names the
 *                  lost witnesses (`run:pid:thread`). `both` stays `both`.
 *                  Dynamic imports are not graph edges: a lost witness's
 *                  closure is bounded by its static imports plus what its
 *                  coverage showed before it was lost.
 *
 * Each record carries `sidesByRun`, the sides each contributing run executed
 * on its own, so a consumer can ask whether a side ran under the formation or
 * only under unit tests.
 *
 * A run marked `incomplete` in its run.json (collect marks a lane stopped by
 * a signal; an operator marks one that did not reach every file, listing
 * them as `unreachedFiles`) can prove a side executed but never that one did
 * not: a site any incomplete run contributes to is `both` or `unloaded`.
 *
 * A side executed when any of its offsets lies in an executed interval of a
 * run that loaded the file at its current content; `runs` names exactly
 * those runs. The census is valid only for sites whose file digest matches
 * a collecting run, and a record binds to the site's content hash: a site
 * whose hash changed is uncensused again.
 *
 * report prints the counts per class and per row and the files with the
 * most sites in each class.
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
  RUN_RECORD_FILE,
  SOURCE_PREFIX,
  TEST_HEAP_ENV,
  V8_DIRECTORY,
} from './fallback-branch-census-constants.js';
import {
  accountRunWitnesses,
  coverageDirectoryDigest,
  coverageFileNames,
  intervalsOverlap,
  mergeRuns,
  readRunRecord,
  rootsOf,
  sha256Hex,
  unionIntervals,
} from './fallback-branch-census-coverage.js';
import {loadSealedImporters} from './helper-import-closure.js';
import {execGit} from './git-invocation.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayForEach = Function.call.bind(Array.prototype.forEach);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayPush = Function.call.bind(Array.prototype.push);
const arraySome = Function.call.bind(Array.prototype.some);
const arraySlice = Function.call.bind(Array.prototype.slice);
const arraySort = Function.call.bind(Array.prototype.sort);
const stringReplace = Function.call.bind(String.prototype.replace);
const stringReplaceAll = Function.call.bind(String.prototype.replaceAll);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);
const objectEntries = Object.entries;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLASS_ORDER = Object.freeze([CENSUS_CLASS.NEVER, CENSUS_CLASS.PRIMARY_ONLY,
  CENSUS_CLASS.FALLBACK_ONLY, CENSUS_CLASS.BOTH, CENSUS_CLASS.UNOBSERVED,
  CENSUS_CLASS.UNLOADED]);
// The classes a lost witness voids: each rests on a side never seen.
const VOIDABLE_CLASSES = Object.freeze([CENSUS_CLASS.NEVER, CENSUS_CLASS.PRIMARY_ONLY,
  CENSUS_CLASS.FALLBACK_ONLY]);
const WITNESS_ID_SEPARATOR = ':';
const PARENT_PREFIX = '..';
// The class of a loaded site, keyed by `primary|fallback` execution.
const CLASS_BY_SIDES = Object.freeze({
  'false|false': CENSUS_CLASS.NEVER,
  'true|false': CENSUS_CLASS.PRIMARY_ONLY,
  'false|true': CENSUS_CLASS.FALLBACK_ONLY,
  'true|true': CENSUS_CLASS.BOTH,
});
const SIDES_KEY_SEPARATOR = '|';
const LANES = Object.freeze(Object.values(LANE));
const CLASSIFIED_RUNNER = 'scripts/run-classified-test-files.js';
const PRIMARY_FLAG = '--primary';
const FORMATION_HEALTH = 'scripts/checks/formation-health.js';
const TREND_FLAG = '--trend';
const SCRATCH_TREND_FILE = 'formation-trend.ndjson';
const COVERAGE_ENV = 'NODE_V8_COVERAGE';
const NODE_OPTIONS_ENV = 'NODE_OPTIONS';
const IMPORT_FLAG = '--import=';
const OPTION_SEPARATOR = ' ';
// The coverage flush every node process of a lane preloads (see the module).
const COVERAGE_PRELOAD = path.join(path.dirname(fileURLToPath(import.meta.url)),
  'fallback-branch-census-preload.js');
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
  CENSUS: '--census', COMMAND: '--command',
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
  SITE_SHAPE: 'site lacks file, row, range, hash or sides: ',
  NO_DETECTOR: 'the detector module is not present; pass --sites FILE: ',
  NO_GRAPH: 'the sealed import graph is unavailable, so lost witnesses cannot be bounded: ',
  PARSE_FAILURES: 'the detector could not parse every file; the census would be incomplete: ',
  MISSING_FLAG: 'missing required flag ',
  UNKNOWN_SUBCOMMAND: 'unknown subcommand: ',
  FLAG_VALUE: 'flag needs a value: ',
  NODE_LOST: 'a formation node left no complete coverage (SIGKILLed past the stop deadline?): ',
});

function gitHead(root) {
  try {
    return stringTrim(execGit(GIT_HEAD_ARGS, {cwd: root, encoding: TEXT_ENCODING,
      stdio: GIT_HEAD_STDIO}));
  } catch (_error) {
    throw new Error(`${PROBLEM.NO_HEAD}${root}`);
  }
}

// 2026-11-08T10:00:00.000Z -> 20261108T100000Z
function compactTimestamp(iso) {
  let compact = stringReplace(iso, MILLISECONDS_SUFFIX, ZULU);
  for (const dropped of TIMESTAMP_DROPPED) compact = stringReplaceAll(compact, dropped, '');
  return compact;
}

function walkFiles(directory, root, into) {
  if (!fs.existsSync(directory)) return into;
  const entries = arraySort(fs.readdirSync(directory, {withFileTypes: true}),
    (left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
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

/**
 * The sha256 of every file under src/ in root, keyed by repository path.
 * @param {string} root
 * @return {Object<string, string>}
 */
export function sourceFileDigests(root) {
  return walkFiles(path.join(root, SOURCE_DIRECTORY), root, {});
}

/**
 * The command that runs a lane.
 * @param {string} lane
 * @param {string} out the run directory
 * @return {Array<string>}
 */
export function laneCommand(lane, out) {
  if (lane === LANE.FORMATION) {
    return [process.execPath, FORMATION_HEALTH, TREND_FLAG, path.join(out, SCRATCH_TREND_FILE)];
  }
  return [process.execPath, CLASSIFIED_RUNNER, PRIMARY_FLAG, lane];
}

/**
 * The NODE_OPTIONS entry that preloads the coverage flush: a file URL, so a
 * path with spaces needs no quoting.
 * @return {string}
 */
export function coveragePreloadOption() {
  return `${IMPORT_FLAG}${pathToFileURL(COVERAGE_PRELOAD).href}`;
}

/**
 * The lane's NODE_OPTIONS: what the caller had, then the preload.
 * @param {string|undefined} existing
 * @param {string} preload
 * @return {string}
 */
export function composeNodeOptions(existing, preload) {
  const kept = stringTrim(existing || '');
  return kept ? `${kept}${OPTION_SEPARATOR}${preload}` : preload;
}

// The run directory of a known lane, with an empty coverage directory.
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

/**
 * The environment a lane runs in: kept on this machine, under coverage and
 * the preload, with the pre-kill flush armed (CENSUS_COVERAGE_DIR_ENV), the
 * test heap raised for coverage writes, piscina's workers waiting on their
 * event loop (so flushes reach them) and, for the formation lane, a demo
 * stop deadline long enough for every node to exit by itself.
 * @param {string} lane
 * @param {{env: Object, coverageDir: string, preload: string}} options
 * @return {Object}
 */
export function laneEnvironment(lane, {env, coverageDir, preload}) {
  return {...env, [COVERAGE_ENV]: coverageDir, [CENSUS_COVERAGE_DIR_ENV]: coverageDir,
    [PLACEMENT_ENV]: PLACEMENT_LOCAL, [TEST_HEAP_ENV]: String(CENSUS_TEST_HEAP_MB),
    [PISCINA_ATOMICS_ENV]: PISCINA_ATOMICS_DISABLED,
    ...(lane === LANE.FORMATION ?
      {[DEMO_STOP_DEADLINE_ENV]: String(CENSUS_DEMO_STOP_DEADLINE_MS)} : {}),
    [NODE_OPTIONS_ENV]: composeNodeOptions(env[NODE_OPTIONS_ENV], preload)};
}

function runLaneProcess(argv, {lane, root, env, coverageDir, preload}) {
  return spawnSync(argv[0], arraySlice(argv, 1), {
    cwd: root, env: laneEnvironment(lane, {env, coverageDir, preload}), stdio: STDIO_INHERIT,
  });
}

/**
 * The problems that fail a lane loudly although it ran: in the formation
 * lane, a node (src/index.js) that left no complete coverage - it was killed
 * past the demo's stop deadline, so its shutdown drain overran even the
 * census deadline.
 * @param {string} lane
 * @param {{lost: Array<Object>}} witnesses
 * @param {string} root
 * @return {Array<string>}
 */
export function laneProblems(lane, witnesses, root) {
  if (lane !== LANE.FORMATION) return [];
  const problems = [];
  for (const lost of witnesses.lost) {
    const entry = typeof lost.entry === 'string' ?
      arrayJoin(stringSplit(path.relative(root, lost.entry), path.sep), POSIX_SEPARATOR) : null;
    if (lost.isMainThread && entry === NODE_ENTRY) {
      arrayPush(problems, `${PROBLEM.NODE_LOST}pid ${lost.pid} (${lost.cause})`);
    }
  }
  return problems;
}

/**
 * Run one lane under V8 coverage and write DIR/run.json.
 * @param {{lane: string, out: string, root?: string, command?: Array<string>,
 *   env?: Object, host?: string, commit?: string, now?: Function}} options
 * @return {Object} the run record
 */
export function collectRun({lane, out, root = ROOT, command = null, env = process.env,
  host = os.hostname(), commit = null, now = () => new Date()}) {
  const {runDir, coverageDir} = freshRunDirectory(lane, out);
  const resolvedCommit = commit || gitHead(root);
  const startedAt = now().toISOString();
  const preload = coveragePreloadOption();
  const result = runLaneProcess(command || laneCommand(lane, runDir), {lane, root, env,
    coverageDir, preload});
  const finishedAt = now().toISOString();
  const witnesses = accountRunWitnesses(coverageDir, coverageFileNames(coverageDir),
    rootsOf({root: path.resolve(root)}, runDir));
  const record = {
    id: arrayJoin([lane, host, compactTimestamp(startedAt)], RUN_ID_SEPARATOR),
    lane, host, commit: resolvedCommit, root: path.resolve(root),
    startedAt, finishedAt,
    exitCode: result.status, signal: result.signal,
    // A lane stopped by a signal did not reach every file: its coverage can
    // show a side executed, never that one did not.
    incomplete: result.signal !== null,
    // Every node process of the lane flushed its coverage on SIGTERM/SIGINT.
    coveragePreload: {
      active: true, option: preload,
      module: arrayJoin(stringSplit(path.relative(ROOT, COVERAGE_PRELOAD), path.sep),
        POSIX_SEPARATOR),
      sha256: sha256Hex(fs.readFileSync(COVERAGE_PRELOAD)),
    },
    // Every thread that started under coverage, the ones complete by a
    // pre-kill flush, the ones whose coverage is incomplete (lost witnesses:
    // named, never acquitting) and the external ones (outside the root).
    witnesses,
    problems: laneProblems(lane, witnesses, root),
    coverageDigest: coverageDirectoryDigest(coverageDir),
    fileDigests: sourceFileDigests(root),
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
  const keys = [[left.file, right.file], [left.range[0], right.range[0]],
    [left.range[1], right.range[1]], [left.row, right.row],
    [left.occurrence, right.occurrence]];
  for (const [a, b] of keys) {
    if (a < b) return -1;
    if (a > b) return 1;
  }
  return 0;
}

function currentDigestOf(root, file, cache) {
  if (!objectHasOwn(cache, file)) {
    const absolute = path.join(root, file);
    cache[file] = fs.existsSync(absolute) ? sha256Hex(fs.readFileSync(absolute)) : null;
  }
  return cache[file];
}

// The runs that loaded `file` at its current content, in run order.
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

// The lost witnesses whose closure holds the site's file, of runs whose tree
// had the file at its current content (a lost thread may have left no
// coverage at all, so loading is read from the run's digests, not from it).
function voidingWitnesses(site, digest, runs, closures) {
  const voiding = [];
  for (const closure of closures[site.file] || []) {
    const run = runs[closure.runIndex];
    if (run.fileDigests?.[site.file] === digest) arrayPush(voiding, closure.id);
  }
  return voiding;
}

function classifySite(site, entry, digest, runs, closures) {
  const contributing = matchingRuns(entry, site.file, digest, runs);
  if (contributing.length === 0) {
    return {klass: CENSUS_CLASS.UNLOADED, primary: false, fallback: false, runIds: [],
      sidesByRun: {}, lost: []};
  }
  let executed = [];
  const sidesByRun = {};
  for (const run of contributing) {
    executed = unionIntervals(executed, entry.runs[run.id]);
    sidesByRun[run.id] = sidesOf(entry.runs[run.id], site);
  }
  const {primary, fallback} = sidesOf(executed, site);
  const observed = CLASS_BY_SIDES[`${primary}${SIDES_KEY_SEPARATOR}${fallback}`];
  // An incomplete run may have lost the process that executed a side, so it
  // proves only what it saw: both sides. Anything less stays uncensused.
  const incomplete = arraySome(contributing, (run) => run.incomplete === true);
  let klass = incomplete && observed !== CENSUS_CLASS.BOTH ? CENSUS_CLASS.UNLOADED : observed;
  // A lost witness that could have loaded the file may have run the side no
  // surviving coverage shows: that side is unobserved, never acquitted.
  const lost = arrayIncludes(VOIDABLE_CLASSES, klass) ?
    voidingWitnesses(site, digest, runs, closures) : [];
  if (lost.length > 0) klass = CENSUS_CLASS.UNOBSERVED;
  return {klass, primary, fallback, runIds: arrayMap(contributing, (run) => run.id),
    sidesByRun, lost};
}

// path -> the paths it imports, from the sealed importer map.
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

function closureOf(imports, seeds) {
  const visited = new Set(seeds);
  const frontier = [...visited];
  for (let cursor = 0; cursor < frontier.length; cursor += 1) {
    for (const next of imports[frontier[cursor]] || []) {
      if (!visited.has(next)) {
        visited.add(next);
        arrayPush(frontier, next);
      }
    }
  }
  return visited;
}

// The repository path of an entry script, or null when it lies outside the
// run's root or is no path (`node -e ... -- argument`).
function entryPathOf(run, entry) {
  if (typeof entry !== 'string' || !path.isAbsolute(entry) || typeof run.root !== 'string') {
    return null;
  }
  const relative = arrayJoin(stringSplit(path.relative(run.root, entry), path.sep),
    POSIX_SEPARATOR);
  return relative === '' || stringStartsWith(relative, PARENT_PREFIX) || path.isAbsolute(relative) ?
    null : relative;
}

// A lost witness's entry and - a worker runs what its process chose - its
// process's main entry, as repository paths.
function entryPaths(run, lost) {
  const paths = [];
  for (const entry of [lost.entry, lost.isMainThread ? null : lost.processEntry]) {
    const entryPath = entryPathOf(run, entry);
    if (entryPath !== null) arrayPush(paths, entryPath);
  }
  return paths;
}

/**
 * src file -> the lost witnesses whose static import closure (from their entry
 * script and every repository file their surviving coverage names) holds it.
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
      const seeds = [...(lost.seenFiles || []), ...entryPaths(run, lost)];
      const id = arrayJoin([run.id, lost.pid, lost.threadId], WITNESS_ID_SEPARATOR);
      for (const file of closureOf(imports, seeds)) {
        if (!stringStartsWith(file, SOURCE_PREFIX)) continue;
        if (!objectHasOwn(closures, file)) closures[file] = [];
        arrayPush(closures[file], {id, runIndex});
      }
    }
  });
  return closures;
}

function sealedImporters(root) {
  const sealed = loadSealedImporters(root);
  if (!sealed.ok) throw new Error(`${PROBLEM.NO_GRAPH}${sealed.problem}`);
  return sealed.importers;
}

function bindRuns(merged, runDirs) {
  const mergedById = {};
  for (const run of merged.runs) mergedById[run.id] = run;
  return arrayMap(runDirs, (runDir) => {
    const run = readRunRecord(runDir);
    if (!objectHasOwn(mergedById, run.id)) throw new Error(`${PROBLEM.RUN_NOT_MERGED}${run.id}`);
    if (mergedById[run.id].coverageDigest !== run.coverageDigest) {
      throw new Error(`${PROBLEM.RUN_DIGEST_DIFFERS}${run.id}`);
    }
    return run;
  });
}

/**
 * Join merged coverage to fallback sites.
 * @param {{merged: Object, runDirs: Array<string>, sites: Array<Object>,
 *   root?: string, head?: string, now?: Function}} input
 * @return {Object} the census
 */
export function joinCensus({merged, runDirs, sites, root = ROOT, head = null,
  now = () => new Date(), importers = null}) {
  const runs = bindRuns(merged, runDirs);
  // The import graph bounds lost witnesses; a census without one needs none.
  const anyLost = arraySome(runs, (run) => (merged.witnesses?.[run.id]?.lost || []).length > 0);
  const closures = anyLost ?
    lostWitnessClosures(merged, runs, importers || sealedImporters(root)) : {};
  const digests = {};
  const records = [];
  for (const site of sites) {
    assertSiteShape(site);
    const digest = currentDigestOf(root, site.file, digests);
    const entry = objectHasOwn(merged.files, site.file) ? merged.files[site.file] : null;
    const {klass, primary, fallback, runIds, sidesByRun, lost} =
      classifySite(site, entry, digest, runs, closures);
    arrayPush(records, {
      file: site.file, row: site.row, range: [site.range[0], site.range[1]],
      hash: site.hash, occurrence: site.occurrence ?? 0, class: klass,
      sidesExecuted: {primary, fallback}, runs: runIds, sidesByRun,
      ...(lost.length > 0 ? {lostWitnesses: lost} : {}),
    });
  }
  arraySort(records, compareSites);
  return {
    schema: CENSUS_SCHEMA,
    generatedAt: now().toISOString(),
    head: head || gitHead(root),
    runs: arrayMap(runs, (run) => ({
      id: run.id, lane: run.lane, host: run.host, commit: run.commit,
      startedAt: run.startedAt, coverageDigest: run.coverageDigest,
      witnesses: witnessCounts(merged.witnesses?.[run.id]),
    })),
    sites: records,
  };
}

// A run's witness counts; null for a run collected without witness markers.
function witnessCounts(accounted) {
  if (!accounted || accounted.started === 0) return null;
  return {started: accounted.started, complete: accounted.complete,
    flushed: accounted.flushed ?? 0, lost: accounted.lost.length,
    external: (accounted.external || []).length};
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

/**
 * The census as text: counts per class and per row, top files per class.
 * @param {Object} census
 * @param {{top?: number}} [options]
 * @return {string}
 */
export function formatCensusReport(census, {top = TOP_FILE_COUNT} = {}) {
  const lines = [
    `fallback census at ${census.head} from ${census.runs.length} runs: ` +
      arrayJoin(arrayMap(census.runs, (run) => run.id), LIST_SEPARATOR),
    `sites: ${census.sites.length}`,
    REPORT_HEADING.CLASS,
  ];
  const byClass = countBy(census.sites, (site) => site.class);
  for (const klass of CLASS_ORDER) arrayPush(lines, `  ${klass}: ${byClass[klass] || 0}`);
  arrayPush(lines, REPORT_HEADING.ROW);
  const rows = arraySort(objectKeys(countBy(census.sites, (site) => site.row)));
  for (const row of rows) {
    const inRow = arrayFilter(census.sites, (site) => site.row === row);
    arrayPush(lines, `  ${row}: ${classCountsText(countBy(inRow, (site) => site.class))}`);
  }
  arrayPush(lines, REPORT_HEADING.TOP);
  for (const klass of CLASS_ORDER) {
    const files = objectEntries(countBy(arrayFilter(census.sites, (site) => site.class === klass),
      (site) => site.file));
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

/**
 * Parse `SUBCOMMAND --flag value ... --runs a b c`.
 * @param {Array<string>} argv
 * @return {{subcommand: string, flags: Object}}
 */
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

async function runJoin(flags, write) {
  const merged = jsonParse(fs.readFileSync(path.resolve(required(flags, FLAG.MERGED)),
    TEXT_ENCODING));
  const sites = await loadSites(ROOT, flags[FLAG.SITES]);
  const census = joinCensus({merged, runDirs: required(flags, FLAG.RUNS), sites, root: ROOT});
  const out = flags[FLAG.OUT] || DEFAULT_CENSUS_PATH;
  fs.mkdirSync(path.dirname(path.resolve(ROOT, out)), {recursive: true});
  fs.writeFileSync(path.resolve(ROOT, out),
    `${jsonStringify(census, null, JSON_INDENT)}${NEWLINE}`);
  write(formatCensusReport(census));
  write(`join: wrote ${out}`);
  return 0;
}

const SUBCOMMANDS = Object.freeze({
  [SUBCOMMAND.COLLECT]: (flags, write) => {
    const lane = required(flags, FLAG.LANE);
    const command = flags[FLAG.COMMAND] ? jsonParse(flags[FLAG.COMMAND]) : null;
    const record = collectRun({lane, out: required(flags, FLAG.OUT), command});
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
    return record.exitCode === 0 && record.problems.length === 0 ? 0 : FAILED_STATUS;
  },
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
