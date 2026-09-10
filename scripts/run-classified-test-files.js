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
  sortStrings,
  stringCollectionHas,
} from './checks/change-proof-string-collections.js';

const arrayJoin = Function.call.bind(Array.prototype.join);
const arraySlice = Function.call.bind(Array.prototype.slice);
const objectHasOwn = Object.hasOwn;
const stringSplit = Function.call.bind(String.prototype.split);
const stringTrim = Function.call.bind(String.prototype.trim);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNNER = 'scripts/run-test-files.js';
const STDIN_FLAG = '--stdin';
const PRIMARY_FLAG = '--primary';
const RESOURCE_FLAG = '--resource';
const EXCLUDE_FLAG = '--exclude';
const EXCLUDE_PREFIX_FLAG = '--exclude-prefix';
const MAX_FILES_PER_RUN = 100;
const EXCLUSIVE_TAP_TIMEOUT_FLOOR_SECONDS = '120';
const NEWLINE = '\n';
const DUPLICATE_FILES_PROBLEM =
  'classified test plan contains duplicate files';
const NO_FILES_PROBLEM =
  'run-classified-test-files: no test files provided';
const INVALID_FILES_PROBLEM =
  'classified test plan requires an own-data string array';
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
const LANE_ORDER = Object.freeze([
  RESOURCE_CLASS_ORDINARY,
  RESOURCE_CLASS_CPU_HEAVY,
  RESOURCE_CLASS_EXTERNAL_TOOLCHAIN,
  RESOURCE_CLASS_EXCLUSIVE,
]);
const SERIAL_PRIMARY_CLASSES = Object.freeze([
  PRIMARY_CLASS_BOOTSTRAP,
  PRIMARY_CLASS_CONVERGENCE_PROBE,
  PRIMARY_CLASS_INTEGRATION,
]);

function effectiveResourceClass(primaryClass, resourceClass) {
  return stringCollectionHas(SERIAL_PRIMARY_CLASSES, primaryClass) ?
    RESOURCE_CLASS_EXCLUSIVE : resourceClass;
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

export function planClassifiedTestFiles(root, inputFiles) {
  const copiedInput = copyOwnStringArray(inputFiles);
  if (!copiedInput) throw new Error(INVALID_FILES_PROBLEM);
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
      effectiveResourceClass(primaryClass, resourceClass)), file);
  }
  const plan = [];
  let plannedFiles = 0;
  for (let index = 0; index < LANE_ORDER.length; index += 1) {
    const resourceClass = LANE_ORDER[index];
    const laneFiles = orderedStringMapGet(lanes, resourceClass);
    if (laneFiles.length === 0) continue;
    plannedFiles += laneFiles.length;
    appendArrayValue(plan, {
      files: laneFiles,
      jobs: RESOURCE_CLASS_JOBS[resourceClass],
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
  const {root = ROOT, spawn = spawnSync} = ownedOptions;
  if (typeof root !== 'string' || root.length === 0 ||
      typeof spawn !== 'function') {
    throw new Error(INVALID_OPTIONS_PROBLEM);
  }
  const plan = planClassifiedTestFiles(root, inputFiles);
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
      const env = lane.resourceClass === RESOURCE_CLASS_EXCLUSIVE ? {
        ...process.env,
        TAP_TIMEOUT_FLOOR: EXCLUSIVE_TAP_TIMEOUT_FLOOR_SECONDS,
      } : process.env;
      const args = [RUNNER, `--jobs=${lane.jobs}`];
      appendArrayValues(args, batch);
      const result = spawn(process.execPath,
        args,
        {cwd: root, env, stdio: 'inherit'});
      if (result.status !== 0) return result.status ?? 1;
    }
  }
  return 0;
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
  const files = readInputFiles(arraySlice(process.argv, 2));
  if (files.length === 0) {
    process.stderr.write(NO_FILES_PROBLEM + NEWLINE);
    process.exitCode = 1;
  } else {
    process.exitCode = runClassifiedTestFiles(files);
  }
}
