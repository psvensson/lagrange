// J7/J15/D15 and the campaign contract: header and run records are appended
// (never overwritten) as v2; every attempted run is recorded, failed ones
// included; readiness failure never starts measurement; product containers
// that vanish or change across the measured window fail the run; the
// watchdog stops issuing and records the interrupted state. Real entry: the
// campaign owner; substituted: deploy/workload/inspect/teardown seams and
// stream A's record owner (a recording stand-in for validateRunRecord /
// computeRunObservationsDigest; the real one is wired by the runner CLI).
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {runComparativeCampaign} from '../comparative-benchmark-campaign-runner.js';
import {
  COMPARATIVE_SMOKE_PROFILE,
  buildComparativeCampaignManifest,
} from '../comparative-benchmark-campaign-manifest.js';
import {
  arrayEvery,
  arrayMap,
  arraySome,
} from '../real-product-captured-intrinsics.js';

const MANIFEST = buildComparativeCampaignManifest({campaignId: 'bench-c-1',
  profile: COMPARATIVE_SMOKE_PROFILE, targets: ['lagrange', 'pg-single-primary']});
const HEADER = Object.freeze({executionTarget: 'lab', physicalHosts: [],
  harness: {gitCommit: 'f'.repeat(40), driverSourceSha256: null, adapterIds: []}});

function product(containerId, startedAt = '2026-11-01T10:00:00Z') {
  return {role: 'node', host: '10.0.0.1', containerId, imageRef: 'img:1',
    imageId: `sha256:${'a'.repeat(64)}`, repoDigest: 'img@sha256:1', entrypoint: ['x'],
    cmd: [], startedAt, reportedVersion: '1'};
}

function deployment(runId) {
  return {targetId: runId, runClass: 'smoke', roles: [{role: 'node', host: '10.0.0.1',
    containerId: 'c1'}], endpoint: {host: '10.0.0.1', port: 5432, containerId: 'c1'},
  storage: [], hosts: [], readiness: {state: 'ready'}, placement: null,
  identity: {products: [product('c1')]}};
}

function recordOwner(rejectRun = null) {
  return {
    validateCampaignHeader: (header) => header,
    validateRunRecord: (record) => {
      if (rejectRun) throw Object.assign(new Error(rejectRun), {code: 'missing-field'});
      return record;
    },
    computeRunObservationsDigest: (record) => `sha256:${'d'.repeat(63)}` +
      String(record.plan.orderIndex % 10),
  };
}

function harness(overrides = {}) {
  const records = [];
  const calls = {workload: [], teardown: []};
  let clock = 0;
  const deps = {
    now: () => clock,
    recordOwner: recordOwner(),
    deadlineAt: null,
    deployRun: async (run) => deployment(run.runId),
    executeWorkloadRun: async ({run}) => {
      calls.workload.push(run.runId);
      clock += 10000;
      return {observations: {accounting: {offered: 1}}, correctness: {semanticGate: null},
        plan: {operationSliceDigest: 'sha256:slice', plannedOperationCounts: {payment: 1}},
        dataset: {resetMethod: 'fresh-formation'},
        loadGenerator: {host: '10.0.0.9', nodeVersion: 'v22', driverVersions: {}}};
    },
    inspectProducts: async () => [product('c1')],
    teardownRun: async (run) => {
      calls.teardown.push(run.runId);
      return {complete: true, removed: [], unclosed: []};
    },
    appendRecords: async (lines) => records.push(...lines),
    ...overrides,
  };
  return {deps, records, calls};
}

const run = (deps) => runComparativeCampaign({manifest: MANIFEST, header: HEADER, deps});

test('campaign: header first, one v2 run record per attempted run, append only',
  async () => {
    const {deps, records} = harness();
    const summary = await run(deps);
    assert.equal(records[0].recordType, 'campaign-header');
    assert.equal(records[0].manifestDigest, MANIFEST.manifestDigest);
    const runs = records.slice(1);
    assert.equal(runs.length, MANIFEST.runs.length);
    for (const record of runs) {
      assert.equal(record.schemaVersion, 'lagrange-raw-observation-v2');
      assert.equal(record.campaignId, 'bench-c-1');
      assert.equal(record.execution.state, 'completed');
      assert.equal(record.identity.publication, null);
      assert.equal(record.plan.manifestDigest, MANIFEST.manifestDigest);
      assert.match(record.rawObservationsDigest, /^sha256:[0-9a-f]{64}$/u);
      assert.deepEqual(record.deployment.events, []);
      assert.equal(record.deployment.closure.status, 'complete');
      assert.equal(record.deployment.loadGenerator.host, '10.0.0.9');
      assert.equal(record.deployment.dataset.resetMethod, 'fresh-formation');
      assert.equal(record.plan.profileClass, 'smoke');
      assert.equal(record.plan.operationSliceDigest, 'sha256:slice');
      assert.deepEqual(record.identity.productsAfterWindow, record.identity.products);
    }
    assert.equal(summary.exitCode, 0);
    assert.equal(summary.attempted.length, MANIFEST.runs.length);
  });

test('J7: readiness exhausted - measurement never starts, the run is recorded failed and ' +
  'torn down', async () => {
  const failure = Object.assign(new Error('readyz 503'), {code: 'readiness_exhausted',
    diagnostic: {last: 'seed-contact'}});
  const {deps, records, calls} = harness({deployRun: async () => {
    throw failure;
  }});
  const summary = await run(deps);
  assert.deepEqual(calls.workload, []);
  assert.equal(calls.teardown.length, MANIFEST.runs.length);
  const first = records[1];
  assert.equal(first.execution.state, 'failed');
  assert.equal(first.execution.failure.code, 'readiness_exhausted');
  assert.deepEqual(first.execution.failure.diagnostic, {last: 'seed-contact'});
  assert.equal(first.observations, null);
  assert.equal(summary.exitCode, 1);
  assert.ok(arrayEvery(summary.attempted, (entry) => entry.state === 'failed'));
});

test('J15: product containers removed while the harness lives - no successful completion',
  async () => {
    const {deps, records} = harness({inspectProducts: async () => []});
    const summary = await run(deps);
    const first = records[1];
    assert.equal(first.execution.state, 'failed');
    assert.equal(first.execution.failure.code, 'product_changed');
    assert.ok(arraySome(first.harnessEvents, (event) => event.kind === 'container-absent' &&
      event.containerId === 'c1'));
    assert.deepEqual(first.identity.productsAfterWindow, []);
    assert.notEqual(summary.exitCode, 0);
  });

test('identity after the window: a restarted container is an event and fails the run',
  async () => {
    const {deps, records} = harness({inspectProducts: async () =>
      [product('c1', '2026-11-01T10:05:00Z')]});
    await run(deps);
    assert.equal(records[1].execution.failure.code, 'product_changed');
    assert.equal(records[1].deployment.events[0].kind, 'restart');
    assert.match(records[1].deployment.events[0].at, /^\d{4}-/u);
  });

test('endpoint bound to a container outside the recorded roles is topology-false',
  async () => {
    const {deps, records, calls} = harness({deployRun: async (one) => ({
      ...deployment(one.runId), endpoint: {host: '10.0.0.7', port: 5432, containerId: 'zz'}})});
    await run(deps);
    assert.equal(records[1].execution.failure.code, 'endpoint_unbound');
    assert.deepEqual(calls.workload, []);
  });

test('watchdog: past the campaign deadline the remaining runs are recorded interrupted',
  async () => {
    const {deps, records, calls} = harness({deadlineAt: 5000});
    const summary = await run(deps);
    assert.equal(calls.workload.length, 1);
    const states = arrayMap(records.slice(1), (record) => record.execution.state);
    assert.equal(states[0], 'completed');
    assert.ok(arrayEvery(states.slice(1), (state) => state === 'interrupted'));
    assert.ok(arraySome(records[2].harnessEvents, (event) => event.kind === 'watchdog-stop'));
    assert.notEqual(summary.exitCode, 0);
  });

test('teardown failure is recorded in closure and the campaign continues', async () => {
  const {deps, records} = harness({teardownRun: async () => {
    throw new Error('ssh: no route to host');
  }});
  await run(deps);
  assert.equal(records.length, MANIFEST.runs.length + 1);
  assert.equal(records[1].deployment.closure.status, 'incomplete');
  assert.match(records[1].deployment.closure.error, /no route/u);
});

test('a topology refusal is blocked, never failed or passed', async () => {
  const {deps, records} = harness({deployRun: async () => {
    throw Object.assign(new Error('needs 3 hosts'),
      {code: 'refused_insufficient_host_topology'});
  }});
  const summary = await run(deps);
  assert.equal(records[1].execution.state, 'blocked');
  assert.equal(summary.exitCode, 3);
});

test('a completed run whose record stream A\'s validator rejects is recorded failed',
  async () => {
    const {deps, records} = harness({recordOwner: recordOwner('plan.operationSliceDigest')});
    const summary = await run(deps);
    assert.equal(records[1].execution.state, 'failed');
    assert.equal(records[1].execution.failure.code, 'record_rejected');
    assert.equal(summary.exitCode, 1);
  });

test('a product setup failure is a complete, validated product-failure record, not skipped',
  async () => {
    let validated = 0;
    const owner = recordOwner();
    const {deps, records} = harness({
      recordOwner: {...owner, validateRunRecord: (record) => {
        validated += 1;
        return record;
      }},
      executeWorkloadRun: async () => ({observations: {runStatus: 'setup-failed'},
        correctness: {semanticGate: null}, plan: {operationSliceDigest: 's',
          plannedOperationCounts: {}}, dataset: {resetMethod: 'fresh-formation'},
        harness: {driverSourceSha256: 'feed', adapterIds: ['a']},
        loadGenerator: {host: '10.0.0.9', nodeVersion: 'v22', driverVersions: {}},
        events: [], failure: null,
        productFailure: {runStatus: 'setup-failed', setup: {sqlstate: '55P03'}}}),
    });
    const summary = await run(deps);
    assert.equal(validated, MANIFEST.runs.length);
    assert.equal(records[1].execution.state, 'product-failure');
    assert.equal(records[1].execution.failure.diagnostic.setup.sqlstate, '55P03');
    assert.equal(records[1].identity.harness.driverSourceSha256, 'feed');
    assert.equal(records[1].identity.harness.gitCommit, HEADER.harness.gitCommit);
    assert.ok(arrayEvery(summary.attempted, (entry) => entry.state === 'product-failure'));
    assert.equal(summary.exitCode, 1);
  });

test('a workload failure (e.g. unverified dataset) keeps the attempt in the record', async () => {
  const {deps, records} = harness({executeWorkloadRun: async () => ({
    observations: {runStatus: 'completed'}, correctness: null, plan: null,
    dataset: {resetMethod: 'fresh-formation', keyCoverage: {present: null}},
    loadGenerator: {host: '10.0.0.9'}, events: [], productFailure: null,
    failure: {code: 'dataset_unverified', message: 'loaded dataset mismatch'}})});
  await run(deps);
  assert.equal(records[1].execution.failure.code, 'dataset_unverified');
  assert.equal(records[1].deployment.dataset.keyCoverage.present, null);
  assert.equal(records[1].deployment.loadGenerator.host, '10.0.0.9');
});
