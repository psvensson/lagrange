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
  arrayFilter,
  arrayFind,
  arrayMap,
  arraySome,
} from '../real-product-captured-intrinsics.js';

const MANIFEST = buildComparativeCampaignManifest({campaignId: 'bench-c-1',
  profile: COMPARATIVE_SMOKE_PROFILE, targets: ['lagrange', 'pg-single-primary']});
const HEADER = Object.freeze({executionTarget: 'lab', physicalHosts: [],
  harness: {gitCommit: 'f'.repeat(40), driverSourceSha256: null, adapterIds: []}});

const CONTENT = `sha256:${'c'.repeat(64)}`;

function product(containerId, startedAt = '2026-11-01T10:00:00Z') {
  return {role: 'node', host: '10.0.0.1', containerId, imageRef: 'img:1',
    imageId: `sha256:${'a'.repeat(64)}`, repoDigest: 'img@sha256:1', entrypoint: ['x'],
    cmd: [], startedAt, reportedVersion: '1', contentIdentity: CONTENT,
    imageStore: 'containerd', provenance: 'registry:img@sha256:1'};
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
      assert.equal(record.plan.manifestDigest, MANIFEST.manifestDigest);
      assert.ok(record.plan.warmup);
      assert.deepEqual(record.identity.productsAfterWindow, record.identity.products);
    }
    assert.equal(summary.exitCode, 0);
    assert.equal(summary.attempted.length, MANIFEST.runs.length);
  });

// The deployer's description of an arm whose readiness was exhausted: its
// running containers, inspected, and the exhausted readiness evidence.
function exhaustedFailure(described = true) {
  return Object.assign(new Error('readyz 503'), {code: 'readiness_exhausted',
    diagnostic: {last: 'seed-contact'},
    ...(described ? {deployment: {...deployment('exhausted'), endpoint: null,
      readiness: {state: 'exhausted', observedAt: '2026-11-01T10:00:00Z',
        evidence: {last: 'seed-contact'}}}} : {})});
}

// A harness whose lagrange arm fails as given; the other arm deploys and pins.
function failingLagrange(failure) {
  return async (one) => {
    if (one.targetId === 'lagrange') throw failure;
    return deployment(one.runId);
  };
}

test('J7: readiness exhausted - measurement never starts; the record is a complete ' +
  'setup-failed product failure with every planned request unissued', async () => {
  const workloadCalls = [];
  let validated = 0;
  const owner = recordOwner();
  const {deps, records, calls} = harness({
    deployRun: async () => {
      throw exhaustedFailure();
    },
    recordOwner: {...owner, validateRunRecord: (record) => {
      validated += 1;
      return record;
    }},
    executeWorkloadRun: async (input) => {
      workloadCalls.push(input);
      return {observations: {runStatus: 'setup-failed',
        setup: input.setupFailure, requests: [{outcome: 'unissued'}],
        accounting: {offered: 1, issued: 0, unissued: 1}},
      correctness: {semanticGate: null, finalState: null},
      plan: {operationSliceDigest: 'sha256:slice', plannedOperationCounts: {payment: 1}},
      endpoint: null, harness: {driverSourceSha256: 'feed', adapterIds: ['a']},
      dataset: {resetMethod: 'fresh-formation', verification: {status: 'failed'}},
      placement: null, loadGenerator: {host: '10.0.0.9', nodeVersion: 'v22', driverVersions: {}},
      events: [], failure: null,
      productFailure: {runStatus: 'setup-failed', setup: input.setupFailure}};
    },
  });
  const summary = await run(deps);
  assert.equal(workloadCalls.length, MANIFEST.runs.length);
  assert.equal(workloadCalls[0].setupFailure.code, 'readiness_exhausted');
  assert.equal(workloadCalls[0].setupFailure.failureClass, 'product_error');
  assert.equal(workloadCalls[0].semanticGate, null);
  assert.equal(calls.teardown.length, MANIFEST.runs.length);
  const first = records[1];
  assert.equal(first.execution.state, 'product-failure');
  assert.equal(first.execution.failure.code, 'readiness_exhausted');
  assert.deepEqual(first.execution.failure.diagnostic, {last: 'seed-contact'});
  assert.notEqual(first.observations, null);
  assert.equal(first.observations.runStatus, 'setup-failed');
  assert.equal(first.observations.accounting.issued, 0);
  assert.equal(first.deployment.readiness.state, 'exhausted');
  assert.equal(first.deployment.endpoint, null);
  assert.deepEqual(first.identity.products, [product('c1')]);
  assert.equal(validated, MANIFEST.runs.length);
  assert.equal(summary.exitCode, 1);
  assert.ok(arrayEvery(summary.attempted, (entry) => entry.state === 'product-failure'));
});

test('J7: a readiness exhaustion the deployer could not describe is a failed run, never ' +
  'a product failure without its product', async () => {
  const {deps, records, calls} = harness({deployRun: failingLagrange(exhaustedFailure(false))});
  await run(deps);
  const failedRuns = arrayFilter(records.slice(1),
    (record) => record.execution.failure?.code === 'readiness_exhausted');
  assert.ok(failedRuns.length > 0);
  assert.ok(arrayEvery(failedRuns, (record) => record.execution.state === 'failed' &&
    record.observations === null));
  assert.equal(calls.workload.length, arrayFilter(MANIFEST.runs,
    (one) => one.targetId !== 'lagrange').length);
});

test('header: pins every target\'s product identity from its running containers, ' +
  'before any run record', async () => {
  const {deps, records} = harness();
  await run(deps);
  const header = records[0];
  assert.equal(header.recordType, 'campaign-header');
  assert.deepEqual(header.products, arrayMap(MANIFEST.targets, (targetId) => ({targetId,
    product: arrayFind(MANIFEST.runs, (one) => one.targetId === targetId).system,
    role: 'node', contentIdentity: CONTENT, reportedVersion: '1',
    images: [{host: '10.0.0.1', imageId: `sha256:${'a'.repeat(64)}`,
      repoDigest: 'img@sha256:1', imageStore: 'containerd',
      provenance: 'registry:img@sha256:1'}]})));
  assert.ok(arrayEvery(records.slice(1), (record) => record.recordType === 'run'));
  assert.equal(records.length, MANIFEST.runs.length + 1);
});

test('header: a target whose containers of one role differ is not pinned, and says why',
  async () => {
    const {deps, records} = harness({deployRun: async (one) => (one.targetId === 'lagrange' ?
      {...deployment(one.runId), identity: {products: [product('c1'),
        {...product('c2'), reportedVersion: '2'}]}} : deployment(one.runId))});
    await run(deps);
    const header = records[0];
    assert.deepEqual(arrayMap(header.products, (pin) => pin.targetId), ['pg-single-primary']);
    assert.equal(header.unpinnedTargets[0].targetId, 'lagrange');
    assert.equal(header.unpinnedTargets[0].failure.code, 'identity_unverified');
  });

test('header: a campaign that pinned no product identity writes no header and fails',
  async () => {
    const {deps, records} = harness({deployRun: async () => {
      throw Object.assign(new Error('ssh down'), {code: 'deployment_command_failed'});
    }});
    await assert.rejects(run(deps), (error) => error.code === 'campaign_products_unpinned' &&
      // Live campaign bench-live-20261101-b-r2 wrote nothing and its
      // diagnostic was `{"unpinned":{}}`: each attempted run's own failure
      // must survive in the refusal, or the campaign leaves no evidence.
      error.diagnostic.runs.length === MANIFEST.runs.length &&
      error.diagnostic.runs[0].failure.code === 'deployment_command_failed' &&
      error.diagnostic.runs[0].failure.message === 'ssh down' &&
      typeof error.diagnostic.runs[0].runId === 'string');
    assert.deepEqual(records, []);
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
  const {deps, records} = harness({deployRun: failingLagrange(
    Object.assign(new Error('needs 3 hosts'), {code: 'refused_insufficient_host_topology'}))});
  const summary = await run(deps);
  const lagrange = arrayFilter(records.slice(1), (record) => record.targetId === 'lagrange');
  assert.ok(lagrange.length > 0);
  assert.ok(arrayEvery(lagrange, (record) => record.execution.state === 'blocked'));
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

test('the semantic gate stage runs before the workload on the deployment it hands back',
  async () => {
    const order = [];
    const reformed = {...deployment('reformed'), endpoint: {host: '10.0.0.1', port: 5433,
      containerId: 'c1'}};
    const {deps, records} = harness({
      runSemanticGate: async ({deployment: first}) => {
        order.push(['gate', first.targetId]);
        return {gate: {status: 'passed'}, deployment: reformed,
          events: [{kind: 're-formation', at: '2026-11-01T10:00:00Z', caseId: 'payment'}]};
      },
      executeWorkloadRun: async ({deployment: used, semanticGate}) => {
        order.push(['workload', used.targetId, semanticGate.status]);
        return {observations: {}, correctness: {semanticGate}, plan: null, events: [],
          loadGenerator: {host: '10.0.0.9'}, failure: null, productFailure: null};
      },
    });
    await run(deps);
    assert.deepEqual(order.slice(0, 2), [['gate', MANIFEST.runs[0].runId],
      ['workload', 'reformed', 'passed']]);
    assert.equal(records[1].harnessEvents[0].kind, 're-formation');
  });

test('without a gate stage the run records that the semantic gate was unavailable',
  async () => {
    const {deps, records} = harness();
    await run(deps);
    assert.equal(records[1].harnessEvents[0].kind, 'semantic-gate-unavailable');
  });

// Coordinator decision 1 (2026-11-02), from live campaign bench-live-20261101-b-r6:
// the pin compares content identity per role; image ids, repo digests, image
// stores and provenance differ legitimately across hosts (lenovo-laptop's
// overlay2 store holds a docker-loaded copy) and are recorded, never compared.
// Decision 2: a role whose product never answered its version on any container
// (an exhausted arm) pins version null with the reason.
test('header: a role pins its content identity; per-host image facts are recorded only',
  async () => {
    const loaded = {...product('c2'), host: '10.0.0.2', imageId: `sha256:${'b'.repeat(64)}`,
      repoDigest: null, imageStore: 'overlay2', provenance: `loaded:sha256:${'b'.repeat(64)}`};
    const {deps, records} = harness({deployRun: async (one) => (one.targetId === 'lagrange' ?
      {...deployment(one.runId), identity: {products: [product('c1'), loaded]}} :
      deployment(one.runId))});
    await run(deps);
    const pin = arrayFind(records[0].products, (one) => one.targetId === 'lagrange');
    assert.equal(pin.contentIdentity, CONTENT);
    assert.deepEqual(arrayMap(pin.images, (image) => [image.host, image.imageStore]),
      [['10.0.0.1', 'containerd'], ['10.0.0.2', 'overlay2']]);
    assert.equal(records[0].unpinnedTargets.length, 0);
  });

test('header: different or missing content identity in one role is not pinned', async () => {
  for (const other of [{contentIdentity: `sha256:${'e'.repeat(64)}`},
    {contentIdentity: null}]) {
    const {deps, records} = harness({deployRun: async (one) => (one.targetId === 'lagrange' ?
      {...deployment(one.runId), identity: {products: [product('c1'),
        {...product('c2'), ...other}]}} : deployment(one.runId))});
    await run(deps);
    assert.equal(records[0].unpinnedTargets[0].targetId, 'lagrange');
    assert.equal(records[0].unpinnedTargets[0].failure.code, 'identity_unverified');
  }
});

test('header: a role whose version no container answered pins null with the reason',
  async () => {
    const unread = (id) => ({...product(id), reportedVersion: null,
      reportedVersionError: 'facts endpoint did not answer'});
    const {deps, records} = harness({deployRun: async (one) => (one.targetId === 'lagrange' ?
      {...deployment(one.runId), identity: {products: [unread('c1'), unread('c2')]}} :
      deployment(one.runId))});
    await run(deps);
    const pin = arrayFind(records[0].products, (one) => one.targetId === 'lagrange');
    assert.equal(pin.reportedVersion, null);
    assert.equal(pin.reportedVersionError, 'facts endpoint did not answer');
    const mixed = harness({deployRun: async (one) => (one.targetId === 'lagrange' ?
      {...deployment(one.runId), identity: {products: [product('c1'), unread('c2')]}} :
      deployment(one.runId))});
    await run(mixed.deps);
    assert.equal(mixed.records[0].unpinnedTargets[0].targetId, 'lagrange');
  });
