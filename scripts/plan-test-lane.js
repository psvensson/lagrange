#!/usr/bin/env node
// Gate lane planner: prints the test files for one lane, newline separated.
//
// The fast gate used to select its files with a shell glob that excluded
// `test/integration/*` and `test/bootstrap/*` by PATH. That silently disagreed
// with the classification owner: 14 files named `*.integration.test.js` live
// outside test/integration/, so they were classified `integration` yet ran in
// the parallel fast lane anyway. Selecting by class instead makes the gate and
// the classifier agree by construction — a new test lands in the right lane
// because of what it IS, not because of where it happens to sit.
//
// Two orthogonal filters, matching the two classification dimensions:
//   --primary  <class[,class...]>   what kind of test (unit, packaging, ...)
//   --resource <class[,class...]>   what it costs (ordinary, external-toolchain)
//   --exclude  <path>               repeatable; re-homed elsewhere by name
//
// Usage:
//   node scripts/plan-test-lane.js --primary unit,packaging --resource ordinary

import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import {derivePrimaryClasses} from './checks/test-primary-classification.js';
import {deriveResourceClasses} from './checks/test-resource-classification.js';

const PRIMARY_FLAG = '--primary';
const RESOURCE_FLAG = '--resource';
const EXCLUDE_FLAG = '--exclude';
const EXCLUDE_PREFIX_FLAG = '--exclude-prefix';
const VALUE_SEPARATOR = ',';
const NEWLINE = '\n';
const MISSING_VALUE_ERROR = 'plan-test-lane: option requires a value: ';
const ENTRY_BASENAME = 'plan-test-lane.js';
const NO_FILTER_ERROR =
  'plan-test-lane: at least one of --primary/--resource is required';
const EMPTY_LANE_ERROR =
  'plan-test-lane: selection is empty — a lane that runs no files would ' +
  'silently pass; fix the filters or the classification';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const LANE_TARGETS = Object.freeze({
  [PRIMARY_FLAG]: 'primary',
  [RESOURCE_FLAG]: 'resource',
  [EXCLUDE_FLAG]: 'exclude',
  [EXCLUDE_PREFIX_FLAG]: 'excludePrefix',
});

export function parseLaneArgs(argv) {
  const parsed = {
    exclude: new Set(),
    excludePrefix: new Set(),
    primary: new Set(),
    resource: new Set(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const targetName = LANE_TARGETS[argv[index]];
    if (targetName === undefined) continue;
    const value = argv[index + 1];
    if (value === undefined) {
      throw new Error(MISSING_VALUE_ERROR + argv[index]);
    }
    index += 1;
    for (const item of value.split(VALUE_SEPARATOR)) {
      if (item.length > 0) parsed[targetName].add(item);
    }
  }
  if (parsed.primary.size === 0 && parsed.resource.size === 0) {
    throw new Error(NO_FILTER_ERROR);
  }
  return parsed;
}

export function planLane(repoRoot, filters) {
  const {primary, resource, exclude} = filters;
  const excludePrefix = filters.excludePrefix ?? new Set();
  const primaryClasses = derivePrimaryClasses(repoRoot).classes;
  const resourceClasses = deriveResourceClasses(repoRoot).classes;
  return Object.keys(primaryClasses)
    .filter((file) => {
      if (exclude.has(file)) return false;
      for (const prefix of excludePrefix) {
        if (file.startsWith(prefix)) return false;
      }
      if (primary.size > 0 && !primary.has(primaryClasses[file])) return false;
      if (resource.size > 0 && !resource.has(resourceClasses[file])) {
        return false;
      }
      return true;
    })
    .sort();
}

function main() {
  const selection = planLane(root, parseLaneArgs(process.argv.slice(2)));
  if (selection.length === 0) throw new Error(EMPTY_LANE_ERROR);
  process.stdout.write(selection.join(NEWLINE) + NEWLINE);
}

if (process.argv[1] && process.argv[1].endsWith(ENTRY_BASENAME)) {
  main();
}
