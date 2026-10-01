// The retired consensus runtime is gone from every active surface (quest
// consensus-cutover quest). Each assertion reads a real artifact: the
// package manifests, the source tree, the process dry-run report and the
// distributed harness's own config merge. The retired vocabulary is
// assembled from fragments so this witness never spells it.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';

import {reportDryRunCompletion} from
  '../../../src/entrypoint-runtime-provenance.js';
import {mergeWithDefaults} from
  '../../distributed/harness/config-parser.js';
import * as harnessConstants from '../../distributed/harness/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..');
const RETIRED_RUNTIME = ['life', 'raft'].join('');
const RETIRED_SCOPE = ['mark', 'wylde'].join('');
const RETIRED_SPIKE_DEPENDENCY = ['raft', 'logic'].join('-');
const RETIRED_SELECTION = ['raft', '[-_]?', 'pro', 'vider'].join('');
const RETIRED = new RegExp(
  [RETIRED_RUNTIME, RETIRED_SCOPE, RETIRED_SELECTION].join('|'), 'i');
const RETIRED_DEPENDENCY = new RegExp(
  [RETIRED_RUNTIME, RETIRED_SCOPE, RETIRED_SPIKE_DEPENDENCY].join('|'), 'i');
const RETIRED_IMPLEMENTATION = Object.freeze([
  'src/raft/committed-prefix-divergence.js',
  'src/raft/in-memory-log-adapter.js',
  ['src/raft/', RETIRED_RUNTIME, '.js'].join(''),
  ['src/raft/', RETIRED_RUNTIME, '-provider.js'].join(''),
  ['src/raft/', RETIRED_RUNTIME, '-commit-scheduler.js'].join(''),
  ['src/raft/', RETIRED_RUNTIME, '-follower-batch.js'].join(''),
  ['src/raft/', RETIRED_RUNTIME, '-incoming-data.js'].join(''),
  ['src/raft/', RETIRED_RUNTIME, '-timing-api.js'].join(''),
  'src/raft/raft-group.js',
  'src/raft/raft-group-constants.js',
  'src/raft/raft-peer-backpressure-mute.js',
  'src/raft/raft-timing-utils.js',
  'src/raft/remote-peer-representation.js',
  'src/raft/virtual-tick.js',
  'src/raft/spike',
  ['scripts/run-', RETIRED_SPIKE_DEPENDENCY, '-investigation-spike.js']
    .join(''),
  'scripts/run-raft-migration-benchmarks.js',
  'scripts/run-raft-migration-rollback-drill.js',
  'scripts/run-raft-migration-stage-gate.js',
]);
const SOURCE_SUFFIX = '.js';

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function filesUnder(relative, accept = () => true) {
  const absolute = path.join(ROOT, relative);
  if (!fs.existsSync(absolute)) {
    return [];
  }
  const found = [];
  for (const entry of fs.readdirSync(absolute, {withFileTypes: true})) {
    const child = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) {
      found.push(...filesUnder(child, accept));
    } else if (entry.isFile() && accept(child)) {
      found.push(child);
    }
  }
  return found;
}

function dependencyNames(manifest) {
  return Object.keys({
    ...(manifest.dependencies || {}),
    ...(manifest.devDependencies || {}),
    ...(manifest.optionalDependencies || {}),
    ...(manifest.peerDependencies || {}),
  });
}

function keysDeep(value, prefix = '') {
  if (value === null || typeof value !== 'object') {
    return [];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    [`${prefix}${key}`, ...keysDeep(child, `${prefix}${key}.`)]);
}

test('legacy dependency and implementation are absent', () => {
  const manifest = JSON.parse(read('package.json'));
  assert.deepEqual(
    dependencyNames(manifest).filter((name) => RETIRED_DEPENDENCY.test(name)),
    [], 'package.json declares no retired consensus dependency');
  assert.deepEqual(Object.entries(manifest.scripts || {})
    .filter(([name, command]) =>
      RETIRED_DEPENDENCY.test(name) || RETIRED_DEPENDENCY.test(command) ||
      /raft-migration/.test(command))
    .map(([name]) => name), [],
  'no package script drives a retired runtime, spike or migration drill');
  const lock = JSON.parse(read('package-lock.json'));
  assert.deepEqual(Object.keys(lock.packages || {})
    .filter((key) => RETIRED_DEPENDENCY.test(key)), [],
  'the lockfile resolves no retired consensus package');
  for (const relative of RETIRED_IMPLEMENTATION) {
    assert.equal(fs.existsSync(path.join(ROOT, relative)), false,
      `${relative} is deleted`);
  }
  for (const relative of filesUnder('src',
    (file) => file.endsWith(SOURCE_SUFFIX))) {
    const specifiers = [...read(relative).matchAll(
      /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)]
      .map((match) => match[1] || match[2]);
    assert.deepEqual(specifiers.filter((specifier) =>
      RETIRED_DEPENDENCY.test(specifier) || RETIRED.test(specifier)), [],
    `${relative} imports no retired consensus module`);
  }
});

test('process and harness provider selection is absent', () => {
  const reports = [];
  const logger = {
    info: (message, report) => reports.push(report),
    error: (message, report) => reports.push(report),
  };
  reportDryRunCompletion({logger, nodeId: 'dry-run-node', dataDir: ROOT});
  assert.equal(reports.length, 1);
  assert.deepEqual(Object.keys(reports[0]).filter((key) =>
    /provider/i.test(key)), [],
  'the dry-run report names no selected consensus implementation');

  const selectionKey = ['raft', 'Pro', 'vider'].join('');
  for (const partial of [{}, {[selectionKey]: RETIRED_RUNTIME}]) {
    assert.deepEqual(keysDeep(mergeWithDefaults(partial))
      .filter((key) => RETIRED.test(key)), [],
    'the harness config merge carries no consensus selection');
  }
  assert.deepEqual(Object.keys(harnessConstants)
    .filter((name) => RETIRED.test(name)), [],
  'the harness constants export no consensus selection default');

  const surfaces = [
    ...filesUnder('src'),
    ...filesUnder('test/distributed/harness'),
    ...filesUnder('test/distributed/config'),
    'Dockerfile',
  ].filter((relative) => fs.existsSync(path.join(ROOT, relative)));
  for (const relative of surfaces) {
    assert.doesNotMatch(read(relative), RETIRED,
      `${relative} carries no consensus selection or retired runtime`);
  }
});
