// Machines and lanes the placement witnesses share (test-placement.test.js and
// test-placement-lab-split.test.js): a placement candidate, the controller,
// the runner's lane names and a fake fleet inventory.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {gitProcessEnvironment} from '../../scripts/checks/git-process-environment.js';

export const CONTROLLER = Object.freeze({name: '(controller)', controller: true, speed: 1});

export function lab(name, speed, extra = {}) {
  return {name, controller: false, speed, avoid: [], gapsKey: 'k', ...extra};
}

// The real placement owner's collaborators, with execution substituted by
// recorded calls and complete runner verdicts. No placement decision is faked.
export function placementRunFixture(overrides = {}) {
  const calls = {local: [], discover: 0, commit: 0, remote: [], record: [], lines: [],
    order: [], options: []};
  const deps = {
    env: {},
    write: (line) => calls.lines.push(line),
    planCosts: (files) => files.map((file) =>
      ({file, ms: 120000, jobs: 1, lane: 'ordinary'})),
    runLocal: (files) => {
      calls.order.push('local');
      calls.local.push([...files]);
      return 0;
    },
    // The finite executor is already settled; its owned-child interface
    // preserves the same recorded call and verdict as the local substitute.
    runLocalChild: (files) => ({
      done: Promise.resolve(deps.runLocal(files, {})),
      abort: () => {},
    }),
    lastGreen: () => true,
    checkBase: () => 'b'.repeat(40),
    commitAt: () => {
      calls.commit += 1;
      return 'a'.repeat(40);
    },
    discover: async () => {
      calls.discover += 1;
      return {machines: [lab('lab', 1)], record: async (...args) => calls.record.push(args)};
    },
    runRemote: (shard, options) => {
      calls.order.push('remote');
      calls.remote.push(shard.files);
      calls.options.push({shard, options});
      return {done: Promise.resolve({status: 0,
        log: shard.files.map((file) => `ok ${file} (1 assertions, 5ms)`).join('\n')})};
    },
    ...overrides,
  };
  return {deps, calls};
}

export const LANE = Object.freeze({ORDINARY: 'ordinary', EXCLUSIVE: 'exclusive',
  BOOTSTRAP: 'bootstrap', EXTERNAL: 'external-toolchain'});

// A fake inventory: the machines, their measured facts and the controller's.
export function fakeInventory() {
  const ready = {ready: true, missing: [], gaps: []};
  const cap = (extra = {}) => ({repoPath: '/srv/lagrange', cpuSampleMs: 260, cores: 12,
    memKiB: 16 * 1024 * 1024, nodeVersion: 'v22.22.3', repo: {head: 'c'.repeat(40)}, ...extra});
  const fleet = [
    {name: '(controller)', controller: true,
      capability: {cpuSampleMs: 200, cores: 20, memKiB: 32 * 1024 * 1024}, readiness: ready},
    {name: 'alpha', capability: cap(), readiness: ready},
    {name: 'beta', capability: cap({cpuSampleMs: 150, cores: 8}), readiness: ready},
    {name: 'gamma', capability: cap(), readiness: {ready: false, missing: ['no-repository'],
      gaps: []}},
  ];
  const nodes = Object.fromEntries(fleet.filter((entry) => !entry.controller)
    .map((entry) => [entry.name, {name: entry.name, ssh: `peer@${entry.name}`}]));
  return {fleet, state: {nodes}};
}

// The import-graph producer a fixture commit carries unless a witness asks
// for the real one: it says where and how it ran, and writes the graph.
export const IMPORT_GRAPH_PRODUCER = 'scripts/generate-global-owner-debt-inventory.js';
export const PRODUCER_STUB = [
  'import {execSync} from \'node:child_process\';',
  'import fs from \'node:fs\';',
  'const head = execSync(\'git rev-parse HEAD\', {encoding: \'utf8\'}).trim();',
  'process.stderr.write(`producer ${process.argv.slice(2).join(\' \')} at ${head}\\n`);',
  'if (process.env.PRODUCER_FAILS) process.exit(1);',
  'if (process.env.PRODUCER_REWRITES) fs.appendFileSync(process.env.PRODUCER_REWRITES, \'\\n\');',
  'fs.mkdirSync(\'test-output/analysis\', {recursive: true});',
  'fs.writeFileSync(\'test-output/analysis/global-owner-debt-import-graph.json\', \'{}\');',
  '',
].join('\n');

// The placed commit carries its regenerated seal, as every commit does
// through the pre-commit hook: a stale one is refused on the lab machine.
export function sealPlacedCommit(controller) {
  const modules = path.join(controller, 'node_modules');
  fs.symlinkSync(path.join(process.cwd(), 'node_modules'), modules);
  const env = gitProcessEnvironment();
  delete env.NODE_TEST_CONTEXT;
  const sealed = spawnSync(process.execPath, [IMPORT_GRAPH_PRODUCER, '--refresh-import-graph-only'],
    {cwd: controller, env, encoding: 'utf8'});
  fs.unlinkSync(modules);
  assert.equal(sealed.status, 0, sealed.stderr);
}

// Waits, bounded, for the witness to create the gate file; writes an initial
// TAP diagnostic line on JS entry so `.tap` size > 0 proves preload ran.
export function gateTestSource(gate) {
  return [
    'import assert from \'node:assert/strict\';',
    'import fs from \'node:fs\';',
    'import {test} from \'node:test\';',
    'process.stdout.write(\'# started\\n\');',
    'test(\'waits for the witness\', async () => {',
    `  for (let poll = 0; poll < 2400 && !fs.existsSync(${JSON.stringify(gate)}); poll += 1) {`,
    '    await new Promise((resolve) => setTimeout(resolve, 50));',
    '  }',
    `  assert.ok(fs.existsSync(${JSON.stringify(gate)}));`,
    '});',
    '',
  ].join('\n');
}

export function worktreeTap(parent, runId, file) {
  return path.join(parent, runId, '.tap', 'test-results', `${file}.tap`);
}

export async function waitForNonEmptyFile(filePath) {
  for (let poll = 0; poll < 1200; poll += 1) {
    const stat = fs.statSync(filePath, {throwIfNoEntry: false});
    if (stat && stat.size > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`timed out waiting for non-empty ${filePath}`);
}
