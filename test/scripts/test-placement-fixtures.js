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
