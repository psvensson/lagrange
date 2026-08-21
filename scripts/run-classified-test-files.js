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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNNER = 'scripts/run-test-files.js';
const STDIN_FLAG = '--stdin';
const PRIMARY_FLAG = '--primary';
const RESOURCE_FLAG = '--resource';
const EXCLUDE_FLAG = '--exclude';
const EXCLUDE_PREFIX_FLAG = '--exclude-prefix';
const MAX_FILES_PER_RUN = 100;
const EXCLUSIVE_TAP_TIMEOUT_SECONDS = '120';
const NEWLINE = '\n';
const DUPLICATE_FILES_PROBLEM =
  'classified test plan contains duplicate files';
const NO_FILES_PROBLEM =
  'run-classified-test-files: no test files provided\n';
const MIXED_INPUT_PROBLEM =
  'classified test plan cannot combine filters and stdin';
const UNEXPECTED_FILTER_ARGUMENT_PREFIX =
  'classified test plan has an unexpected filter argument: ';
const LANE_FILTER_FLAGS = new Set([
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
const SERIAL_PRIMARY_CLASSES = new Set([
  PRIMARY_CLASS_BOOTSTRAP,
  PRIMARY_CLASS_CONVERGENCE_PROBE,
  PRIMARY_CLASS_INTEGRATION,
]);

function effectiveResourceClass(primaryClass, resourceClass) {
  return SERIAL_PRIMARY_CLASSES.has(primaryClass) ?
    RESOURCE_CLASS_EXCLUSIVE : resourceClass;
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export function planClassifiedTestFiles(root, inputFiles) {
  const primary = derivePrimaryClasses(root);
  const resource = deriveResourceClasses(root);
  if (resource.problems.length > 0) {
    throw new Error(resource.problems.join(NEWLINE));
  }
  const files = [...new Set(inputFiles)].sort();
  if (files.length !== inputFiles.length) {
    throw new Error(DUPLICATE_FILES_PROBLEM);
  }
  const lanes = Object.fromEntries(
    RESOURCE_CLASSES.map((resourceClass) => [resourceClass, []]));
  for (const file of files) {
    const primaryClass = primary.classes[file];
    const resourceClass = resource.classes[file];
    if (primaryClass === undefined || resourceClass === undefined) {
      throw new Error(`unclassified or missing test file: ${file}`);
    }
    lanes[effectiveResourceClass(primaryClass, resourceClass)].push(file);
  }
  return LANE_ORDER.map((resourceClass) => ({
    files: lanes[resourceClass],
    jobs: RESOURCE_CLASS_JOBS[resourceClass],
    resourceClass,
  })).filter((lane) => lane.files.length > 0);
}

export function runClassifiedTestFiles(inputFiles, options = {}) {
  const root = options.root ?? ROOT;
  const spawn = options.spawn ?? spawnSync;
  const plan = planClassifiedTestFiles(root, inputFiles);
  for (const lane of plan) {
    process.stdout.write(
      `classified lane ${lane.resourceClass}: ${lane.files.length} file(s), ` +
      `jobs=${lane.jobs}${NEWLINE}`,
    );
    for (const batch of chunks(lane.files, MAX_FILES_PER_RUN)) {
      const env = lane.resourceClass === RESOURCE_CLASS_EXCLUSIVE ? {
        ...process.env,
        TAP_TIMEOUT: process.env.TAP_TIMEOUT ?? EXCLUSIVE_TAP_TIMEOUT_SECONDS,
      } : process.env;
      const result = spawn(process.execPath,
        [RUNNER, `--jobs=${lane.jobs}`, ...batch],
        {cwd: root, env, stdio: 'inherit'});
      if (result.status !== 0) return result.status ?? 1;
    }
  }
  return 0;
}

function readInputFiles(argv) {
  if (argv.includes(PRIMARY_FLAG) || argv.includes(RESOURCE_FLAG)) {
    if (argv.includes(STDIN_FLAG)) {
      throw new Error(MIXED_INPUT_PROBLEM);
    }
    for (let index = 0; index < argv.length; index += 2) {
      if (!LANE_FILTER_FLAGS.has(argv[index])) {
        throw new Error(UNEXPECTED_FILTER_ARGUMENT_PREFIX + argv[index]);
      }
    }
    return planLane(ROOT, parseLaneArgs(argv));
  }
  const useStdin = argv.includes(STDIN_FLAG);
  const argumentsWithoutFlags = argv.filter((argument) => argument !== STDIN_FLAG);
  const stdinFiles = useStdin ? fs.readFileSync(0, 'utf8')
    .split(NEWLINE).map((line) => line.trim()).filter(Boolean) : [];
  return [...argumentsWithoutFlags, ...stdinFiles];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = readInputFiles(process.argv.slice(2));
  if (files.length === 0) {
    process.stderr.write(NO_FILES_PROBLEM);
    process.exitCode = 1;
  } else {
    process.exitCode = runClassifiedTestFiles(files);
  }
}
