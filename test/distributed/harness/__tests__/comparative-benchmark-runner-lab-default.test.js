// D25: the runner defaults to the lab; lab hosts come from the registered
// inventory (harness role, reachable, free), each taken with the machine-wide
// lock under purpose bench:<campaignId> and released failure-safe; GCP is
// explicit and needs --hosts. Real entry: the CLI and the lab-host owner;
// substituted: the inventory directory and the lock session.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {EXIT_CODES} from '../constants.js';
import {
  arrayEvery,
  arrayMap,
  stringIncludes,
} from '../real-product-captured-intrinsics.js';
import {recordedThermalFacts} from '../../../scripts/native-thermal-fixture.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const RUNNER = path.join(ROOT, 'docs/benchmarks/cloud/run-comparative-benchmarks.mjs');

function labNode(name, ip, {lock = 'free', docker = true, roles = ['harness'],
  bootId = `boot-${name}`, thermal = 'measured'} = {}) {
  const thermalFacts = recordedThermalFacts(bootId);
  return {name, ip, ssh: `bench@${ip}`, os: 'linux', roles,
    testCapability: {bootId, dockerReachable: docker, repoPath: '/home/bench/lagrange',
      nodePath: '/usr/bin/node', nodeVersion: 'v22.23.2', ...thermalFacts,
      thermalObservation: thermal === 'measured' ? thermalFacts.thermalObservation : null,
      dockerRootFreeBytes: 100 * 2 ** 30, repoFreeBytes: 100 * 2 ** 30,
      machineLock: {state: lock, holder: null}}};
}

function inventoryDir(nodes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-lab-'));
  fs.writeFileSync(path.join(dir, 'inventory.json'), JSON.stringify({version: 1,
    nodes: Object.fromEntries(arrayMap(nodes, (node) => [node.name, node]))}));
  return dir;
}

function runCli(args, env) {
  const clean = {...process.env};
  for (const key of ['HOSTS', 'SSH_HOSTS', 'EXECUTION_TARGET']) delete clean[key];
  return spawnSync(process.execPath, [RUNNER, ...args], {cwd: ROOT, encoding: 'utf8',
    env: {...clean, ...env}, timeout: 60000});
}

const FLEET = [
  labNode('alpha', '192.168.1.11'), labNode('bravo', '192.168.1.12'),
  labNode('charlie', '192.168.1.13', {lock: 'busy'}),
  labNode('delta', '192.168.1.14'), labNode('echo', '192.168.1.15', {docker: false}),
  labNode('dwsl', '192.168.1.18', {thermal: 'unmeasurable'}),
  labNode('foxtrot', '192.168.1.16'), labNode('golf', '192.168.1.17', {roles: ['runner']}),
];

test('D25: --dry-run defaults to the lab and names the inventory hosts it would lock',
  () => {
    const result = runCli(['--dry-run', '--from-recorded-facts', '--campaign-id', 'bench-test-1'],
      {LAGRANGE_LAB_HOME: inventoryDir(FLEET)});
    assert.equal(result.status, 0, result.stderr);
    const plan = JSON.parse(result.stdout);
    assert.equal(plan.executionTarget, 'lab');
    assert.deepEqual(arrayMap(plan.labHosts, (host) => host.name),
      ['alpha', 'bravo', 'delta', 'foxtrot']);
    assert.deepEqual(arrayMap(plan.labHosts, (host) => host.role),
      ['data', 'data', 'data', 'client']);
    assert.ok(arrayEvery(plan.wouldLock, (lock) => lock.purpose === 'bench:bench-test-1'));
    assert.equal(plan.wouldLock.length, 4);
    assert.match(plan.manifestDigest, /^sha256:[0-9a-f]{64}$/u);
    assert.equal(plan.manifest.runs.length, 3, 'a smoke campaign is one run per arm');
    assert.equal(plan.manifest.comparable, false);
  });

test('D25: the lab target refuses hand-typed hosts', () => {
  const result = runCli(['--dry-run', '--from-recorded-facts', '--hosts',
    '10.0.0.1,10.0.0.2,10.0.0.3,10.0.0.4'],
  {LAGRANGE_LAB_HOME: inventoryDir(FLEET)});
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /lab hosts come from the registered lab inventory/u);
});

test('D25: too few free harness hosts is a typed topology refusal', () => {
  const result = runCli(['--dry-run', '--from-recorded-facts'],
    {LAGRANGE_LAB_HOME: inventoryDir(FLEET.slice(0, 3))});
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /refused_insufficient_host_topology/u);
  // Live campaign bench-live-20261101-b failed as campaign_products_unpinned
  // and the CLI printed only the message: a typed failure's diagnostic (here
  // the excluded hosts, there each target's failure) reaches the operator.
  const diagnostic = /^diagnostic: (.*)$/mu.exec(result.stderr);
  assert.ok(diagnostic, result.stderr);
  const parsed = JSON.parse(diagnostic[1]);
  assert.equal(parsed.required, 4);
  assert.ok(Array.isArray(parsed.excluded));
});

test('D25: GCP is explicit and requires --hosts; it creates no infrastructure', () => {
  const missing = runCli(['--dry-run', '--execution-target', 'gcp'], {});
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /--hosts/u);
  const given = runCli(['--dry-run', '--execution-target', 'gcp', '--hosts',
    '10.1.0.1,10.1.0.2,10.1.0.3,10.1.0.4', '--campaign-id', 'bench-gcp-1'], {});
  assert.equal(given.status, 0, given.stderr);
  const plan = JSON.parse(given.stdout);
  assert.equal(plan.executionTarget, 'gcp');
  assert.deepEqual(plan.wouldLock, []);
  assert.equal(stringIncludes(given.stdout, 'gcloud'), false);
});


test('the lab dry run binds the named load generator and refuses an ineligible one', () => {
  const env = {LAGRANGE_LAB_HOME: inventoryDir(FLEET)};
  const args = ['--dry-run', '--from-recorded-facts', '--load-generator'];
  const selected = runCli([...args, 'alpha'], env);
  assert.equal(selected.status, 0, selected.stderr);
  const plan = JSON.parse(selected.stdout);
  assert.deepEqual(arrayMap(plan.labHosts, ({name, role}) => [name, role]),
    [['bravo', 'data'], ['delta', 'data'], ['foxtrot', 'data'], ['alpha', 'client']]);
  assert.deepEqual(arrayMap(plan.wouldLock, (lock) => lock.name),
    ['bravo', 'delta', 'foxtrot', 'alpha']);
  for (const [name, reason] of [['ghost', 'not registered in the lab inventory'],
    ['golf', 'no harness role in the lab inventory'], ['echo', 'docker not reachable']]) {
    const refused = runCli([...args, name], env);
    assert.equal(refused.status, EXIT_CODES.REFUSED, refused.stderr);
    assert.equal(refused.stdout, '', 'no plan, so no substituted load generator');
    assert.match(refused.stderr, /^refused_load_generator_selection: /mu);
    assert.deepEqual(JSON.parse(/^diagnostic: (.*)$/mu.exec(refused.stderr)[1]),
      {loadGeneratorName: name, reason});
  }
});

test('an empty --load-generator is a usage error, not automatic selection', () => {
  const result = runCli(['--dry-run', '--from-recorded-facts', '--load-generator', ''],
    {LAGRANGE_LAB_HOME: inventoryDir(FLEET)});
  assert.equal(result.status, EXIT_CODES.FAILURE);
  assert.match(result.stderr, /--load-generator needs a registered lab host name, got ""/u);
});

test('the real lab campaign selects with the named load generator before any hold', () => {
  // No ssh target: discovery probes nothing and selection refuses before any
  // hold, so the forwarded name decides which typed refusal the CLI reports.
  const unreachable = arrayMap(FLEET.slice(0, 4), ({ssh: _ssh, ...node}) => node);
  const env = {LAGRANGE_LAB_HOME: inventoryDir(unreachable)};
  const named = runCli(['--campaign-id', 'bench-test-2', '--load-generator', 'alpha'], env);
  assert.equal(named.status, EXIT_CODES.REFUSED, named.stderr);
  assert.match(named.stderr,
    /^refused_load_generator_selection: alpha: no ssh target or ip in the inventory$/mu);
  const automatic = runCli(['--campaign-id', 'bench-test-3'], env);
  assert.equal(automatic.status, EXIT_CODES.REFUSED, automatic.stderr);
  assert.match(automatic.stderr, /^refused_insufficient_host_topology: /mu);
});

test('GCP rejects the lab role option without reinterpreting client-node', () => {
  const result = runCli(['--dry-run', '--execution-target', 'gcp', '--hosts',
    '10.1.0.1,10.1.0.2,10.1.0.3,10.1.0.4', '--load-generator', 'alpha',
    '--client-node', '/usr/bin/node'], {});
  assert.equal(result.status, EXIT_CODES.FAILURE);
  assert.match(result.stderr, /--load-generator is only for --execution-target lab/u);
});
