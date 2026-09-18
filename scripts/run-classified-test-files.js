#!/usr/bin/env node

// The single execution-policy owner for test files.
//
// Selection decides WHICH tests are required. This runner decides HOW that
// exact set may share a machine. Every caller uses the same primary/resource
// classifications, so a widened change proof cannot bypass the serial policy
// used by the complete release proof.

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {
  PRIMARY_CLASSES,
  PRIMARY_CLASS_BOOTSTRAP,
  PRIMARY_CLASS_CONVERGENCE_PROBE,
  PRIMARY_CLASS_INTEGRATION,
  derivePrimaryClasses,
} from './checks/test-primary-classification.js';
import {
  deriveResourceClasses,
} from './checks/test-resource-classification.js';
import {
  RESOURCE_CLASSES,
  RESOURCE_CLASS_CPU_HEAVY,
  RESOURCE_CLASS_EXCLUSIVE,
  RESOURCE_CLASS_EXTERNAL_TOOLCHAIN,
  RESOURCE_CLASS_JOBS,
  RESOURCE_CLASS_ORDINARY,
} from './checks/test-resource-classification-constants.js';
import {parseLaneArgs, planLane} from './plan-test-lane.js';
import {placementDeps, runPlacedTestFiles} from './lab/probe.js';
import {
  appendArrayValue,
  appendArrayValues,
  copyOwnDataRecord,
  copyOwnStringArray,
  createOrderedStringMap,
  createOrderedStringSet,
  orderedStringMapGet,
  orderedStringMapSet,
  orderedStringSetValues,
  sortByStringProjection,
  sortStrings,
  stringCollectionHas,
} from './checks/change-proof-string-collections.js';

const arrayJoin = Function.call.bind(Array.prototype.join);
const arraySort = Function.call.bind(Array.prototype.sort);
const arraySlice = Function.call.bind(Array.prototype.slice);
const mathRound = Math.round;
const numberParseFloat = Number.parseFloat;
const objectHasOwn = Object.hasOwn;
const regExpExec = Function.call.bind(RegExp.prototype.exec);
const stringLastIndexOf = Function.call.bind(String.prototype.lastIndexOf);
const stringPadStart = Function.call.bind(String.prototype.padStart);
const stringSlice = Function.call.bind(String.prototype.slice);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNNER = 'scripts/run-test-files.js';
const STDIN_FLAG = '--stdin';
const PRIMARY_FLAG = '--primary';
const RESOURCE_FLAG = '--resource';
const EXCLUDE_FLAG = '--exclude';
const EXCLUDE_PREFIX_FLAG = '--exclude-prefix';
// A finder, not a gate: run every lane and batch and report the first
// non-zero status at the end, so one red ordinary batch cannot hide the
// exclusive lane that holds every integration and bootstrap file.
const KEEP_GOING_FLAG = '--keep-going';
const MAX_FILES_PER_RUN = 100;
const EXCLUSIVE_TAP_TIMEOUT_FLOOR_SECONDS = '120';
const NEWLINE = '\n';
const UTF8 = 'utf8';
const LAST_RESULTS_DIRECTORY = '.tap/test-results';
const LAST_RESULT_EXTENSION = '.tap';
const LAST_RESULT_TIME_MARKER = '\n# time=';
const LAST_RESULT_TIME_PATTERN = /^# time=(\d+(?:\.\d+)?)ms$/mu;
const LAST_RESULT_RED_PATTERN = /^not ok /mu;
const LAST_RESULT_GREEN_PATTERN = /^ok /mu;
const GIT_FILE = '.git';
const GIT_DIR_PREFIX = 'gitdir: ';
const GIT_COMMON_DIR_FILE = 'commondir';
const DISPATCH_RANK_RED_OR_UNKNOWN = '0';
const DISPATCH_RANK_MEASURED = '1';
const DISPATCH_KEY_SEPARATOR = '\u0000';
const DISPATCH_DURATION_WIDTH = 12;
const DISPATCH_DURATION_CEILING = 999999999999;
const DISPATCH_DURATION_PAD = '0';
const SERIAL_JOBS = 1;
// A file this machine has never timed: what placement assumes it costs when
// its lane has no timed file either.
const UNTIMED_FILE_MS = 10000;
const MEDIAN_DIVISOR = 2;
const INVALID_RESULTS_ROOTS_PROBLEM =
  'classified test plan requires an own-data string array of results roots';
const DUPLICATE_FILES_PROBLEM =
  'classified test plan contains duplicate files';
const NO_FILES_PROBLEM =
  'run-classified-test-files: no test files provided';
const INVALID_FILES_PROBLEM =
  'classified test plan requires an own-data string array';
const BOOTSTRAP_RESOURCE_PROBLEM =
  'a bootstrap test cannot also carry a curated resource class: ';
const UNKNOWN_LANE_JOBS_PROBLEM =
  'lane order names a lane with no worker count: ';
const INVALID_OPTIONS_PROBLEM =
  'classified test runner requires an own-data options record';
const INCOMPLETE_PLAN_PROBLEM =
  'classified test plan did not preserve every input file';
const MIXED_INPUT_PROBLEM =
  'classified test plan cannot combine filters and stdin';
const UNEXPECTED_FILTER_ARGUMENT_PREFIX =
  'classified test plan has an unexpected filter argument: ';
const LANE_FILTER_FLAGS = Object.freeze([
  PRIMARY_FLAG,
  RESOURCE_FLAG,
  EXCLUDE_FLAG,
  EXCLUDE_PREFIX_FLAG,
]);
// The bootstrap class owns a lane of its own, at two workers. It is not
// ordinary - these are cluster tests with wall-clock budgets, so they never
// share a machine with the ordinary lane - but it is not exclusive either:
// measured 2026-09-17 over 13 runs on three hosts (20, 12 and 8 threads), two
// workers halved the lane on the dev box and took a third off the lab nodes
// with no contention failure. The one red in those runs was
// fresh-join-via-non-seed-node, which this repository already records as
// flaky at 1 in 6 on HEAD, and 8 standalone repeats of it passed. Integration
// and the convergence probes stay serial: overlapping THEM is measured to red
// five contention-sensitive SLOs, which is a different question from running
// one bounded class two-up.
const LANE_BOOTSTRAP = 'bootstrap';
const BOOTSTRAP_LANE_JOBS = 2;
const LANE_ORDER = Object.freeze([
  RESOURCE_CLASS_ORDINARY,
  RESOURCE_CLASS_CPU_HEAVY,
  RESOURCE_CLASS_EXTERNAL_TOOLCHAIN,
  LANE_BOOTSTRAP,
  RESOURCE_CLASS_EXCLUSIVE,
]);
// The classes that may never share a machine with anything else.
const SERIAL_PRIMARY_CLASSES = Object.freeze([
  PRIMARY_CLASS_CONVERGENCE_PROBE,
  PRIMARY_CLASS_INTEGRATION,
]);
// Every lane a file can be assigned to, and the workers it runs with.
const LANE_JOBS = Object.freeze({
  ...RESOURCE_CLASS_JOBS,
  [LANE_BOOTSTRAP]: BOOTSTRAP_LANE_JOBS,
});
// A lane whose files carry cluster wall-clock budgets advises the runner's
// timeout floor, whatever its worker count.
const TIMEOUT_FLOOR_LANES = Object.freeze([
  LANE_BOOTSTRAP,
  RESOURCE_CLASS_EXCLUSIVE,
]);

function effectiveResourceClass(primaryClass, resourceClass, file) {
  if (stringCollectionHas(SERIAL_PRIMARY_CLASSES, primaryClass)) {
    return RESOURCE_CLASS_EXCLUSIVE;
  }
  if (primaryClass !== PRIMARY_CLASS_BOOTSTRAP) return resourceClass;
  // The bootstrap lane answers before the resource class does, so a curated
  // shard entry on a bootstrap test would be inert - and silently so, in the
  // less conservative direction (two workers where the curator asked for
  // one). Refuse instead: the next curator to declare a bootstrap test
  // exclusive is told, rather than ignored (verifier round 1).
  if (resourceClass !== RESOURCE_CLASS_ORDINARY) {
    throw new Error(`${BOOTSTRAP_RESOURCE_PROBLEM}${file} is ${resourceClass}`);
  }
  return LANE_BOOTSTRAP;
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    const batch = [];
    const end = index + size < values.length ? index + size : values.length;
    for (let valueIndex = index; valueIndex < end; valueIndex += 1) {
      appendArrayValue(batch, values[valueIndex]);
    }
    appendArrayValue(result, batch);
  }
  return result;
}

// The last results decide dispatch order, never membership. The runner leaves
// .tap/test-results/<file>.tap with a top-level `# time=<ms>ms` line: tap's
// own, or the wall time it appends when there is none. A file with no result,
// no time, a top-level `not ok`, or no top-level `ok` at all (a crash at
// import leaves only the appended time) is red or unknown and dispatches
// first, so a persisting red refuses a gate in minutes. The rest
// dispatch longest-first on a parallel lane, so the long files share the
// first batch instead of trailing every batch, and shortest-first on a serial
// lane, where packing gains nothing and the earliest red is what order buys.
export function lastResultsRoots(root) {
  const roots = [root];
  // A fresh linked worktree (a quest, the push gate's corpus checkout) has no
  // results of its own; the main checkout's are the last ones this machine
  // measured. A plain checkout's .git is a directory and reads throw.
  try {
    const gitFile = fs.readFileSync(path.join(root, GIT_FILE), UTF8);
    if (!stringStartsWith(gitFile, GIT_DIR_PREFIX)) return roots;
    const gitDir = path.resolve(root,
      stringTrim(stringSlice(gitFile, GIT_DIR_PREFIX.length)));
    const commonDir = path.resolve(gitDir, stringTrim(
      fs.readFileSync(path.join(gitDir, GIT_COMMON_DIR_FILE), UTF8)));
    const mainRoot = path.dirname(commonDir);
    if (path.basename(commonDir) === GIT_FILE && mainRoot !== root) {
      appendArrayValue(roots, mainRoot);
    }
  } catch {
    return roots;
  }
  return roots;
}

function readLastResult(resultsRoots, file) {
  for (let index = 0; index < resultsRoots.length; index += 1) {
    let output;
    try {
      output = fs.readFileSync(path.join(resultsRoots[index],
        LAST_RESULTS_DIRECTORY, file + LAST_RESULT_EXTENSION), UTF8);
    } catch {
      continue;
    }
    const tail = regExpExec(LAST_RESULT_TIME_PATTERN, stringSlice(output,
      stringLastIndexOf(output, LAST_RESULT_TIME_MARKER) + NEWLINE.length));
    if (!tail || regExpExec(LAST_RESULT_RED_PATTERN, output) ||
        !regExpExec(LAST_RESULT_GREEN_PATTERN, output)) {
      return null;
    }
    const milliseconds = mathRound(numberParseFloat(tail[1]));
    return milliseconds < DISPATCH_DURATION_CEILING ?
      milliseconds : DISPATCH_DURATION_CEILING;
  }
  return null;
}

export function orderLaneFiles(files, resultsRoots, jobs) {
  const keys = createOrderedStringMap();
  for (let index = 0; index < files.length; index += 1) {
    const milliseconds = readLastResult(resultsRoots, files[index]);
    const rank = milliseconds === null ?
      DISPATCH_RANK_RED_OR_UNKNOWN : DISPATCH_RANK_MEASURED;
    const duration = milliseconds === null ? 0 :
      jobs === SERIAL_JOBS ? milliseconds :
        DISPATCH_DURATION_CEILING - milliseconds;
    orderedStringMapSet(keys, files[index], rank + DISPATCH_KEY_SEPARATOR +
      stringPadStart(`${duration}`, DISPATCH_DURATION_WIDTH,
        DISPATCH_DURATION_PAD) +
      DISPATCH_KEY_SEPARATOR + files[index]);
  }
  return sortByStringProjection(files,
    (file) => orderedStringMapGet(keys, file));
}

function medianOf(values) {
  const sorted = arraySort([...values], (left, right) => left - right);
  return sorted[mathRound((sorted.length - 1) / MEDIAN_DIVISOR)];
}

// What each planned file is expected to cost, for placement: its last green
// duration here, else the median of its lane's timed files, else a default.
// A red or unknown file is priced like its lane, never as free.
export function estimateFileCosts(plan, resultsRoots) {
  const costs = [];
  for (let laneIndex = 0; laneIndex < plan.length; laneIndex += 1) {
    const lane = plan[laneIndex];
    const timed = [];
    const measured = [];
    for (let index = 0; index < lane.files.length; index += 1) {
      const milliseconds = readLastResult(resultsRoots, lane.files[index]);
      appendArrayValue(measured, milliseconds);
      if (milliseconds !== null) appendArrayValue(timed, milliseconds);
    }
    const fallback = timed.length > 0 ? medianOf(timed) : UNTIMED_FILE_MS;
    for (let index = 0; index < lane.files.length; index += 1) {
      appendArrayValue(costs, {
        file: lane.files[index],
        jobs: lane.jobs,
        ms: measured[index] === null ? fallback : measured[index],
      });
    }
  }
  return costs;
}

export function planClassifiedTestFiles(
  root, inputFiles, resultsRoots = lastResultsRoots(root)) {
  const copiedInput = copyOwnStringArray(inputFiles);
  if (!copiedInput) throw new Error(INVALID_FILES_PROBLEM);
  const copiedResultsRoots = copyOwnStringArray(resultsRoots);
  if (!copiedResultsRoots) throw new Error(INVALID_RESULTS_ROOTS_PROBLEM);
  if (copiedInput.length === 0) throw new Error(NO_FILES_PROBLEM);
  const primary = derivePrimaryClasses(root);
  const resource = deriveResourceClasses(root);
  if (resource.problems.length > 0) {
    throw new Error(arrayJoin(resource.problems, NEWLINE));
  }
  const uniqueFiles = createOrderedStringSet(copiedInput);
  const files = sortStrings(orderedStringSetValues(uniqueFiles));
  if (files.length !== copiedInput.length) {
    throw new Error(DUPLICATE_FILES_PROBLEM);
  }
  const lanes = createOrderedStringMap();
  for (let index = 0; index < RESOURCE_CLASSES.length; index += 1) {
    orderedStringMapSet(lanes, RESOURCE_CLASSES[index], []);
  }
  orderedStringMapSet(lanes, LANE_BOOTSTRAP, []);
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    if (!objectHasOwn(primary.classes, file) ||
        !objectHasOwn(resource.classes, file)) {
      throw new Error(`unclassified or missing test file: ${file}`);
    }
    const primaryClass = primary.classes[file];
    const resourceClass = resource.classes[file];
    if (!stringCollectionHas(PRIMARY_CLASSES, primaryClass) ||
        !stringCollectionHas(RESOURCE_CLASSES, resourceClass)) {
      throw new Error(`unclassified or missing test file: ${file}`);
    }
    appendArrayValue(orderedStringMapGet(lanes,
      effectiveResourceClass(primaryClass, resourceClass, file)), file);
  }
  const plan = [];
  let plannedFiles = 0;
  for (let index = 0; index < LANE_ORDER.length; index += 1) {
    const resourceClass = LANE_ORDER[index];
    const laneFiles = orderedStringMapGet(lanes, resourceClass);
    if (laneFiles.length === 0) continue;
    plannedFiles += laneFiles.length;
    if (!objectHasOwn(LANE_JOBS, resourceClass)) {
      throw new Error(`${UNKNOWN_LANE_JOBS_PROBLEM}${resourceClass}`);
    }
    const jobs = LANE_JOBS[resourceClass];
    appendArrayValue(plan, {
      files: orderLaneFiles(laneFiles, copiedResultsRoots, jobs),
      jobs,
      resourceClass,
    });
  }
  if (plannedFiles !== files.length || plan.length === 0) {
    throw new Error(INCOMPLETE_PLAN_PROBLEM);
  }
  return plan;
}

export function runClassifiedTestFiles(inputFiles, options = {}) {
  const ownedOptions = copyOwnDataRecord(options);
  if (!ownedOptions) throw new Error(INVALID_OPTIONS_PROBLEM);
  const {root = ROOT, spawn = spawnSync, keepGoing = false,
    env = process.env} = ownedOptions;
  if (typeof root !== 'string' || root.length === 0 ||
      typeof spawn !== 'function' || typeof keepGoing !== 'boolean' ||
      !env || typeof env !== 'object') {
    throw new Error(INVALID_OPTIONS_PROBLEM);
  }
  const plan = planClassifiedTestFiles(root, inputFiles);
  let firstFailure = 0;
  for (let laneIndex = 0; laneIndex < plan.length; laneIndex += 1) {
    const lane = plan[laneIndex];
    process.stdout.write(
      `classified lane ${lane.resourceClass}: ${lane.files.length} file(s), ` +
      `jobs=${lane.jobs}${NEWLINE}`,
    );
    const laneBatches = chunks(lane.files, MAX_FILES_PER_RUN);
    for (let batchIndex = 0;
      batchIndex < laneBatches.length;
      batchIndex += 1) {
      const batch = laneBatches[batchIndex];
      // A floor, not a cap: the runner owns the final TAP_TIMEOUT and
      // lifts it to the file's declared budget when that is larger. An
      // explicit caller TAP_TIMEOUT flows through process.env and wins.
      const laneEnv = stringCollectionHas(TIMEOUT_FLOOR_LANES, lane.resourceClass) ? {
        ...env,
        TAP_TIMEOUT_FLOOR: EXCLUSIVE_TAP_TIMEOUT_FLOOR_SECONDS,
      } : env;
      const args = [RUNNER, `--jobs=${lane.jobs}`];
      appendArrayValues(args, batch);
      const result = spawn(process.execPath,
        args,
        {cwd: root, env: laneEnv, stdio: 'inherit'});
      if (result.status !== 0) {
        if (!keepGoing) return result.status ?? 1;
        if (firstFailure === 0) firstFailure = result.status ?? 1;
      }
    }
  }
  return firstFailure;
}

function readInputFiles(argv) {
  if (stringCollectionHas(argv, PRIMARY_FLAG) ||
      stringCollectionHas(argv, RESOURCE_FLAG)) {
    if (stringCollectionHas(argv, STDIN_FLAG)) {
      throw new Error(MIXED_INPUT_PROBLEM);
    }
    for (let index = 0; index < argv.length; index += 2) {
      if (!stringCollectionHas(LANE_FILTER_FLAGS, argv[index])) {
        throw new Error(UNEXPECTED_FILTER_ARGUMENT_PREFIX + argv[index]);
      }
    }
    const laneFiles = copyOwnStringArray(planLane(ROOT, parseLaneArgs(argv)));
    if (!laneFiles) throw new Error(INVALID_FILES_PROBLEM);
    return laneFiles;
  }
  const useStdin = stringCollectionHas(argv, STDIN_FLAG);
  const files = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== STDIN_FLAG) appendArrayValue(files, argv[index]);
  }
  if (useStdin) {
    const stdinLines = stringSplit(fs.readFileSync(0, 'utf8'), NEWLINE);
    for (let index = 0; index < stdinLines.length; index += 1) {
      const line = stringTrim(stdinLines[index]);
      if (line.length > 0) appendArrayValue(files, line);
    }
  }
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = arraySlice(process.argv, 2);
  const keepGoing = stringCollectionHas(argv, KEEP_GOING_FLAG);
  const laneArgv = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== KEEP_GOING_FLAG) appendArrayValue(laneArgv, argv[index]);
  }
  const files = readInputFiles(laneArgv);
  if (files.length === 0) {
    process.stderr.write(NO_FILES_PROBLEM + NEWLINE);
    process.exitCode = 1;
  } else {
    // Placement decides whether lab machines can shorten this run; when they
    // cannot, or may not, it is exactly the local run it always was.
    process.exitCode = await runPlacedTestFiles(files, placementDeps({
      root: ROOT,
      keepGoing,
      planCosts: (planned) => estimateFileCosts(
        planClassifiedTestFiles(ROOT, planned), lastResultsRoots(ROOT)),
      runLocal: (planned, options) => runClassifiedTestFiles(planned, options),
      lastGreen: (file) => readLastResult([ROOT], file) !== null,
    }));
  }
}
