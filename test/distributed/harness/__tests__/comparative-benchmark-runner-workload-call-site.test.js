// The single B1 call site: B1's load-generator CLI runs from a checkout at the
// harness commit; its answer is mapped into stream A's fields; refusals,
// non-executions, a foreign endpoint, a plan off the manifest, an unverified
// dataset and a product setup failure are typed; the load generator is never
// a product host. Substituted: B1's runner (its record shape) and ssh.
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  COMPARATIVE_SMOKE_PROFILE,
  buildComparativeCampaignManifest,
} from '../comparative-benchmark-campaign-manifest.js';
import {
  createRemoteWorkloadRunner,
  createWorkloadRunExecutor,
} from '../comparative-benchmark-workload-call-site.js';
import {stringIncludes} from '../real-product-captured-intrinsics.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';
import {
  arrayFind,
} from '../real-product-captured-intrinsics.js';

const MANIFEST = buildComparativeCampaignManifest({campaignId: 'bench-x',
  profile: COMPARATIVE_SMOKE_PROFILE, targets: ['lagrange', 'tidb-tikv']});
const RUN = MANIFEST.runs[0];
const IMAGE = `sha256:${'a'.repeat(64)}`;

function deployment() {
  return {roles: [{role: 'n', host: '10.0.0.1', containerId: 'c1'}],
    endpoint: {protocol: 'postgresql', host: '10.0.0.1', port: 5433, containerId: 'c1'},
    access: {connection: {user: 'u', password: 'p', database: 'd'}},
    identity: {products: [{containerId: 'c1', imageId: IMAGE}]},
    operations: {observePlacement: async () => ({replicasByPartition: []})}};
}

function b1Record(overrides = {}) {
  return {recordKind: 'benchmark-workload-run',
    dispatch: {status: 'executed'},
    identity: {harness: {driverSourceSha256: 'feed', adapterIds: ['lagrange-pgwire']}},
    plan: {datasetDigest: MANIFEST.plan.datasetDigest.slice(7), profileClass: 'smoke',
      operationSliceDigest: 'slice', plannedOperationCounts: {payment: 2},
      workloadProfileId: 'scenario-a-smoke-v1'},
    deployment: {endpoint: {host: '10.0.0.1', port: 5433}, dataset: {
      resetMethod: 'fresh-formation', verification: {status: 'verified',
        method: 'm', observedLogicalChecksum: 'k', expectedLogicalChecksum: 'k',
        expectedTableRows: {item: 3}, observedTableRows: {item: 3}}}},
    observations: {runStatus: 'completed', requests: []},
    correctness: {semanticGate: null, finalState: null},
    loadGenerator: {nodeVersion: 'v22.23.2', nativeClients: {pg: '8.18.0', mysql2: '3.24.4'},
      checkout: {gitCommit: 'abc'}},
    ...overrides};
}

function executor(record, extra = {}) {
  const seen = [];
  const run = createWorkloadRunExecutor({clientHost: '10.0.0.9',
    runWorkload: async (request) => {
      seen.push(request);
      return typeof record === 'function' ? record() : record;
    },
    describeLoadGenerator: async () => ({hostname: 'lg', bootId: 'b'}), ...extra});
  return {seen, execute: () => run({run: RUN, manifest: MANIFEST, deployment: deployment()})};
}

test('a completed B1 run maps into stream A fields', async () => {
  const {seen, execute} = executor(b1Record());
  const result = await execute();
  assert.equal(seen[0].system, 'lagrange');
  assert.equal(seen[0].subkind, 'smoke');
  assert.deepEqual(seen[0].connection, {endpoint: {host: '10.0.0.1', port: 5433},
    credentials: {user: 'u', password: 'p', database: 'd'}});
  assert.equal(result.failure, null);
  assert.equal(result.productFailure, null);
  assert.deepEqual(result.plan.plannedOperationCounts, {payment: 2});
  assert.equal(result.dataset.verification.status, 'verified');
  assert.deepEqual(result.endpoint, {host: '10.0.0.1', port: 5433});
  assert.equal(result.plan.workloadProfileId, 'scenario-a-smoke-v1');
  assert.deepEqual(result.harness, {driverSourceSha256: 'feed', adapterIds: ['lagrange-pgwire']});
  assert.equal(seen[0].subkind, 'smoke');
  assert.equal(result.loadGenerator.nodeVersion, 'v22.23.2');
  assert.deepEqual(result.loadGenerator.driverVersions, {pg: '8.18.0', mysql2: '3.24.4'});
  assert.equal(result.correctness.semanticGate, null);
});

test('the semantic gate record from the gate stage lands in correctness', async () => {
  const run = createWorkloadRunExecutor({clientHost: '10.0.0.9',
    runWorkload: async () => b1Record(), describeLoadGenerator: async () => ({})});
  const gate = {status: 'passed', passed: ['p'], failed: [], missing: []};
  const result = await run({run: RUN, manifest: MANIFEST, deployment: deployment(),
    semanticGate: gate});
  assert.equal(result.correctness.semanticGate, gate);
});

test('a product setup failure (SQLSTATE 55P03) is a product failure with a complete record',
  async () => {
    const {execute} = executor(b1Record({observations: {runStatus: 'setup-failed',
      setup: {sqlstate: '55P03'}, requests: []}, deployment: {endpoint:
      {host: '10.0.0.1', port: 5433}, dataset: {resetMethod: 'fresh-formation',
      verification: {status: 'unobserved'}}}}));
    const result = await execute();
    assert.deepEqual(result.productFailure, {runStatus: 'setup-failed',
      setup: {sqlstate: '55P03'}});
    assert.equal(result.failure, null);
  });

test('refusals, non-executions, foreign endpoints, plan drift and unverified data are typed',
  async () => {
    const cases = [
      [{recordKind: 'benchmark-dispatch-refused', reason: 'no family', dispatch: {}},
        'benchmark_dispatch_refused', true],
      [b1Record({dispatch: {status: 'blocked', reason: 'x'}}), 'workload_not_executed', true],
      [b1Record({deployment: {endpoint: {host: '10.9.9.9', port: 5433}}}),
        'endpoint_unbound', false],
      [b1Record({plan: {...b1Record().plan, datasetDigest: 'other'}}), 'plan_mismatch', false],
      [b1Record({deployment: {endpoint: {host: '10.0.0.1', port: 5433}, dataset: {
        resetMethod: 'fresh-formation', verification: {status: 'mismatch'}}}}),
      'dataset_unverified', false],
    ];
    for (const [record, code, throws] of cases) {
      const {execute} = executor(record);
      if (throws) {
        await assert.rejects(execute(), (error) => error.code === code, code);
      } else {
        assert.equal((await execute()).failure.code, code);
      }
    }
  });

test('a load generator on a product host is refused before the workload runs', async () => {
  let called = false;
  const run = createWorkloadRunExecutor({clientHost: '10.0.0.1', runWorkload: async () => {
    called = true;
  }, describeLoadGenerator: async () => ({})});
  await assert.rejects(run({run: RUN, manifest: MANIFEST, deployment: deployment()}),
    (error) => error.code === 'load_generator_colocated');
  assert.equal(called, false);
});

test('the remote runner refuses a checkout off the harness commit and runs the B1 CLI',
  async () => {
    const host = {ip: '10.0.0.9', repoPath: '/srv/lagrange', nodePath: '/usr/bin/node'};
    const stale = createScriptedSsh([[/git rev-parse HEAD/u, 'deadbeef']]);
    await assert.rejects(createRemoteWorkloadRunner({sshRun: stale.sshRun, opts: {}, host,
      harnessCommit: 'abc', campaignId: 'bench-x'})({}, RUN),
    (error) => error.code === 'load_generator_commit_mismatch');
    const good = createScriptedSsh([[/git rev-parse HEAD/u, 'abc'],
      [/run-benchmark-workload\.js/u, '\n__exit_code=0'],
      [/tail -n 1/u, JSON.stringify(b1Record())]]);
    const record = await createRemoteWorkloadRunner({sshRun: good.sshRun, opts: {}, host,
      harnessCommit: 'abc', campaignId: 'bench-x'})({system: 'lagrange'}, RUN);
    assert.equal(record.dispatch.status, 'executed');
    const cli = arrayFind(good.calls, (call) => stringIncludes(call.command, 'run-benchmark'));
    assert.match(cli.command, /--manifest 'test-output\/bench\/bench-x\/[^']+\/request\.json'/u);
  });
