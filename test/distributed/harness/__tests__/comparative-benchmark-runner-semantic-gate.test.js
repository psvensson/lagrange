// The semantic gate stage: B1's proof journey runs bound to the endpoint
// container; every case after the first gets a fresh Lagrange formation
// (PostgreSQL resets through its adapter); the durability restart restarts
// exactly the endpoint container, waits for readiness and re-inspects it; a
// Lagrange arm is re-formed once more before the measured window; TiDB is
// not run here and says so. Substituted: the journey, redeploy and ssh.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  createSemanticGateStage,
  runTiDbSemanticGate,
} from '../comparative-benchmark-semantic-gate.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';
import {
  createContainerLedger,
  dockerRules,
} from './real-product-deployer-product-answers-fixture.js';
import {
  arrayFilter,
  arrayMap,
  stringIncludes,
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

test('PostgreSQL resets through its adapter; unknown systems record semantic-gate-not-run',
  async () => {
    const ledger = createContainerLedger();
    const {sshRun} = createScriptedSsh([[/docker image inspect/u,
      JSON.stringify({RepoDigests: [], Created: '2026-10-30T10:00:00Z',
        Config: {Labels: null}, RootFS: {Layers: ['sha256:' + '7'.repeat(64)]}})],
    ...dockerRules(ledger)]);
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
    const unknown = await stage({run: {runId: 'r', system: 'cockroachdb'},
      manifest: {campaignId: 'c'}, deployment: armOf(ledger, 0)});
    assert.equal(unknown.gate, null);
    assert.equal(unknown.events[0].kind, 'semantic-gate-not-run');
  });

function applyFakeTiDbUpdate(state, sql) {
  const target = state.staged || state.rows;
  const updates = [
    [/UPDATE semantic_gate_probe SET balance = 850/iu, 1, {id: 1, balance: 850, note: 'paid'}],
    [/UPDATE semantic_gate_probe SET balance = 1150/iu, 2, {id: 2, balance: 1150, note: 'credited'}],
    [/UPDATE semantic_gate_probe SET balance = 0/iu, 1, {id: 1, balance: 0, note: 'zero'}],
  ];
  for (const [pattern, id, row] of updates) {
    if (pattern.test(sql)) {
      target.set(id, row);
      state.dirty = true;
      return true;
    }
  }
  return false;
}

function createFakeTiDbFactory({violateIsolation = false} = {}) {
  const rows = new Map([[1, {id: 1, balance: 1000, note: 'seed-1'}],
    [2, {id: 2, balance: 1000, note: 'seed-2'}]]);
  return async () => {
    const state = {rows, snapshot: null, staged: null, dirty: false};
    return {
      query: async (sql) => {
        if (/^BEGIN$/iu.test(sql)) {
          state.snapshot = new Map(arrayMap([...rows.entries()], ([k, v]) => [k, {...v}]));
          state.staged = new Map(arrayMap([...rows.entries()], ([k, v]) => [k, {...v}]));
          state.dirty = false;
          return [[]];
        }
        if (/^COMMIT$/iu.test(sql)) {
          if (state.staged && state.dirty) {
            for (const [k, v] of state.staged.entries()) rows.set(k, {...v});
          }
          state.snapshot = null;
          state.staged = null;
          state.dirty = false;
          return [[]];
        }
        if (/^ROLLBACK$/iu.test(sql)) {
          state.snapshot = null;
          state.staged = null;
          state.dirty = false;
          return [[]];
        }
        if (applyFakeTiDbUpdate(state, sql)) return [[]];
        if (/SELECT balance FROM semantic_gate_probe WHERE id = 1/iu.test(sql)) {
          const view = !violateIsolation && state.snapshot ? state.snapshot : rows;
          return [[{balance: view.get(1).balance}]];
        }
        if (/SELECT id, balance/iu.test(sql)) {
          return [[{...rows.get(1)}, {...rows.get(2)}]];
        }
        return [[]];
      },
      end: async () => {},
    };
  };
}

test('TiDB semantic gate verifies repeatable-read isolation, rollback atomicity, and remote ' +
  'loadGeneratorHost execution', async () => {
  const ledger = createContainerLedger();
  const {sshRun} = createScriptedSsh([[/docker image inspect/u,
    JSON.stringify({RepoDigests: [], Created: '2026-10-30T10:00:00Z',
      Config: {Labels: null}, RootFS: {Layers: ['sha256:' + '7'.repeat(64)]}})],
  ...dockerRules(ledger)]);
  const deployment = armOf(ledger, 0);
  const passingStage = createSemanticGateStage({journey: async () => ({status: 'passed'}),
    sshRun, opts: {}, createMysqlConnection: createFakeTiDbFactory(),
    evidenceDirOf: () => null, now: () => 0, redeploy: async () => deployment});
  const passed = await passingStage({run: {runId: 'r-tidb', system: 'tidb-tikv'},
    manifest: {campaignId: 'c'}, deployment});
  assert.equal(passed.gate.status, 'passed');
  assert.equal(passed.gate.binding.containerId, deployment.endpoint.containerId);
  assert.equal(passed.gate.failed.length, 0);
  assert.equal(passed.gate.missing.length, 0);
  assert.ok(passed.gate.passed.length > 0);

  const failingGate = await runTiDbSemanticGate({
    connection: {endpoint: {host: '10.0.0.1', port: 4000}, credentials: {user: 'root'}},
    binding: passed.gate.binding, evidenceDir: null, persistentStorage: false,
    restartProduct: null, sshRun, opts: {}, loadGeneratorHost: null,
    createMysqlConnection: createFakeTiDbFactory({violateIsolation: true}),
  });
  assert.equal(failingGate.status, 'failed');

  const remoteSsh = createScriptedSsh([
    [(command, host) => host === '10.0.0.9' && stringIncludes(command, '--input-type=module'),
      JSON.stringify({snapshotBefore: 1000, snapshotDuring: 1000,
        committedBalances: [850, 1150], afterRollbackBalance: 850})],
    ...dockerRules(ledger),
  ]);
  const remoteStage = createSemanticGateStage({journey: async () => ({status: 'passed'}),
    sshRun: remoteSsh.sshRun, opts: {},
    loadGeneratorHost: {ip: '10.0.0.9', repoPath: '/srv/repo', nodePath: '/usr/bin/node'},
    evidenceDirOf: () => null, now: () => 0, redeploy: async () => deployment});
  const remoteResult = await remoteStage({run: {runId: 'r-tidb-remote', system: 'tidb-tikv'},
    manifest: {campaignId: 'c'}, deployment});
  assert.equal(remoteResult.gate.status, 'passed');
  assert.equal(arrayFilter(remoteSsh.calls, (call) => call.host === '10.0.0.9').length, 1);
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
