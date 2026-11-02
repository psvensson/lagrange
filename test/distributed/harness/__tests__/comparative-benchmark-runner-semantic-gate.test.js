// The semantic gate stage: B1's proof journey runs bound to the endpoint
// container; every case after the first gets a fresh Lagrange formation
// (PostgreSQL resets through its adapter); the durability restart restarts
// exactly the endpoint container, waits for readiness and re-inspects it; a
// Lagrange arm is re-formed once more before the measured window; TiDB is
// not run here and says so. Substituted: the journey, redeploy and ssh.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {createSemanticGateStage} from '../comparative-benchmark-semantic-gate.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';
import {
  createContainerLedger,
  dockerRules,
} from './real-product-deployer-product-answers-fixture.js';
import {
  arrayFilter,
  arrayMap,
  stringTrim,
} from '../real-product-captured-intrinsics.js';

const IMAGE = `sha256:${'a'.repeat(64)}`;

function armOf(ledger, generation) {
  const id = stringTrim(ledger.run(`docker run -d --name bench-c-lagrange-node-${generation} ` +
    '--network host psvensson/lagrange:0.4.0', '10.0.0.1'));
  return {roles: [{role: 'lagrange-node', host: '10.0.0.1', containerId: id}],
    endpoint: {host: '10.0.0.1', port: 5433 + generation, containerId: id},
    access: {connection: {user: 'u'}},
    identity: {products: [{role: 'lagrange-node', host: '10.0.0.1', containerId: id,
      imageId: IMAGE, startedAt: 'before', reportedVersion: '0.4.0'}]},
    operations: {awaitReady: async () => ({ready: true})}};
}

function journey(log) {
  return async ({binding, beforeCase, restartProduct}) => {
    log.push(['binding', binding.endpoint, binding.campaignId]);
    for (const caseId of ['payment', 'delivery', 'durability']) {
      const fresh = await beforeCase({caseId});
      if (fresh) log.push(['fresh', caseId, fresh.binding.endpoint]);
      if (caseId === 'durability') log.push(['restart', (await restartProduct({})).containerId]);
    }
    return {status: 'passed', passed: [], failed: [], missing: [], binding};
  };
}

test('Lagrange: fresh formation per case, restart of the endpoint container only, ' +
  'a final fresh formation before measurement', async () => {
  const ledger = createContainerLedger();
  const {sshRun, calls} = createScriptedSsh([[/docker image inspect/u,
    JSON.stringify({RepoDigests: [], Created: '2026-10-30T10:00:00Z',
      Config: {Labels: null}, RootFS: {Layers: ['sha256:' + '7'.repeat(64)]}})], ...dockerRules(ledger), [/docker restart/u, '']]);
  let generation = 0;
  const first = armOf(ledger, generation);
  const log = [];
  const stage = createSemanticGateStage({journey: journey(log), sshRun, opts: {},
    evidenceDirOf: (run) => `/tmp/ev/${run.runId}`, now: () => 0,
    redeploy: async () => armOf(ledger, generation += 1)});
  const result = await stage({run: {runId: 'r1', system: 'lagrange'},
    manifest: {campaignId: 'camp'}, deployment: first});
  assert.deepEqual(log.slice(0, 3), [['binding', '10.0.0.1:5433', 'camp'],
    ['fresh', 'delivery', '10.0.0.1:5434'], ['fresh', 'durability', '10.0.0.1:5435']]);
  const restarts = arrayFilter(calls, (call) => /docker restart/u.test(call.command));
  assert.equal(restarts.length, 1);
  assert.match(restarts[0].command, new RegExp(`docker restart -t 1 ${log[3][1]}$`, 'u'));
  assert.deepEqual(arrayMap(result.events, (event) => event.kind), ['re-formation',
    're-formation', 'product-restart', 're-formation']);
  assert.equal(result.events[3].caseId, 'before-measurement');
  assert.equal(result.deployment.endpoint.port, 5436);
  assert.equal(result.gate.status, 'passed');
});

test('PostgreSQL resets through its adapter; TiDB keeps its own proof harness', async () => {
  const ledger = createContainerLedger();
  const {sshRun} = createScriptedSsh([[/docker image inspect/u,
    JSON.stringify({RepoDigests: [], Created: '2026-10-30T10:00:00Z',
      Config: {Labels: null}, RootFS: {Layers: ['sha256:' + '7'.repeat(64)]}})], ...dockerRules(ledger)]);
  let redeploys = 0;
  const stage = createSemanticGateStage({journey: async ({beforeCase}) => {
    await beforeCase({caseId: 'a'});
    await beforeCase({caseId: 'b'});
    return {status: 'incomplete'};
  }, sshRun, opts: {}, evidenceDirOf: () => '/tmp/ev', now: () => 0,
  redeploy: async () => {
    redeploys += 1;
  }});
  const pg = await stage({run: {runId: 'r', system: 'postgresql'}, manifest: {campaignId: 'c'},
    deployment: armOf(ledger, 0)});
  assert.equal(redeploys, 0);
  assert.deepEqual(arrayMap(pg.events, (event) => event.kind), ['dataset-reset']);
  const tidb = await stage({run: {runId: 'r', system: 'tidb-tikv'}, manifest: {campaignId: 'c'},
    deployment: armOf(ledger, 0)});
  assert.equal(tidb.gate, null);
  assert.equal(tidb.events[0].kind, 'semantic-gate-not-run');
});

// Coordinator decision 4 (2026-11-02): the journey learns whether the arm's
// data lives on persistent storage (every data directory a host volume);
// durability on container-layer storage is probe_inapplicable.
test('the journey is told whether the arm\'s storage is persistent', async () => {
  const ledger = createContainerLedger();
  const {sshRun} = createScriptedSsh([...dockerRules(ledger)]);
  const seen = [];
  const stage = createSemanticGateStage({journey: async ({persistentStorage}) => {
    seen.push(persistentStorage);
    return {status: 'incomplete'};
  }, sshRun, opts: {}, evidenceDirOf: () => '/tmp/ev', now: () => 0,
  redeploy: async () => {}});
  for (const kinds of [['container-layer'], ['host-volume', 'container-layer'],
    ['host-volume', 'host-volume'], []]) {
    const deployment = {...armOf(ledger, 0), storage: arrayMap(kinds, (kind) => ({kind}))};
    await stage({run: {runId: 'r', system: 'postgresql'}, manifest: {campaignId: 'c'},
      deployment});
  }
  assert.deepEqual(seen, [false, false, true, false]);
});
