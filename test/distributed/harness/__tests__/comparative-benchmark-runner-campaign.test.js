// J7/J15/D15 and the campaign contract: header and run records are appended
// (never overwritten) as v2; every attempted run is recorded, failed ones
// included; readiness failure never starts measurement; product containers
// that vanish or change across the measured window fail the run; the
// watchdog stops issuing and records the interrupted state. Real entry: the
// campaign owner; substituted: deploy/workload/inspect/teardown seams and
// stream A's record owner (a recording stand-in for validateRunRecord /
// computeRunObservationsDigest; the real one is wired by the runner CLI).
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {runComparativeCampaign} from '../comparative-benchmark-campaign-runner.js';
import {
  createSemanticGateStage,
  runTiDbSemanticGate,
} from '../comparative-benchmark-semantic-gate.js';
import * as deployers from '../real-product-cluster-deployers.js';
import {
  DEPLOYMENT_FAILURE,
  deploymentFailure,
} from '../real-product-deployment-contract.js';
import {
  createWorkloadRunExecutor,
} from '../comparative-benchmark-workload-call-site.js';
import {runScenarioASemanticProofJourney} from '../../scenarios/scenario-a-semantic-proof-journey.js';
import {
  COMPARATIVE_SMOKE_PROFILE,
  buildComparativeCampaignManifest,
} from '../comparative-benchmark-campaign-manifest.js';
import {createScriptedSsh} from './real-product-deployer-scripted-ssh-fixture.js';
import {
  LAGRANGE_IMAGE,
  createContainerLedger,
  http,
  lagrangeHealthyRules,
} from './real-product-deployer-product-answers-fixture.js';
import {
  arrayEvery,
  arrayFilter,
  arrayFind,
  arrayJoin,
  arrayMap,
  arraySome,
  stringIncludes,
  stringReplace,
  stringSplit,
  stringTrim,
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
  access: {connection: {user: 'postgres', database: 'postgres'}},
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
    const receivedSignals = [];
    const {deps, records, calls} = harness({
      deadlineAt: 5000,
      deployRun: async (one, context = {}) => {
        receivedSignals.push(Boolean(context.signal && typeof context.signal.aborted === 'boolean'));
        return deployment(one.runId);
      },
    });
    const summary = await run(deps);
    assert.equal(calls.workload.length, 1);
    assert.deepEqual(receivedSignals, [true],
      'runComparativeCampaign must forward the watchdog AbortSignal into deployRun(run, {signal})');
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

test('an inspection after the window that fails is identity_unverified on a failed run ' +
  'that keeps its deployment, never read as an absent container', async () => {
  const {deps, records} = harness({inspectProducts: async () => {
    throw Object.assign(new Error('ssh: connection timed out'), {code: 'identity_unverified'});
  }});
  await run(deps);
  const first = records[1];
  assert.equal(first.execution.state, 'failed');
  assert.equal(first.execution.failure.code, 'identity_unverified');
  assert.notEqual(first.deployment, null);
  assert.equal(arraySome(first.harnessEvents, (event) => event.kind === 'container-absent'),
    false);
});

test('watchdog cancellation during Lagrange readiness polling records failureClass interrupted ' +
  '(never product_error) and retains deployment identity, lastObservation, and cleanup',
async () => {
  const hosts = ['10.0.0.1', '10.0.0.2', '10.0.0.3'];
  const ledger = createContainerLedger();
  const {sshRun} = createScriptedSsh([
    [/^docker ps -aq --filter label=lagrange\.bench\.campaign=/u, (_command, host) => {
      const ids = [];
      for (const entry of ledger.containers.values()) {
        if (entry.host === host && !entry.removed) ids.push(entry.id);
      }
      return `${arrayJoin(ids, '\n')}\n`;
    }],
    [/^docker rm -f /u, (command) => {
      const ids = arrayFilter(
        arrayMap(stringSplit(stringReplace(command, /^docker rm -f\s+/u, ''), /\s+/u),
          (part) => stringReplace(stringTrim(part), /^'|'$/gu, '')),
        Boolean,
      );
      for (const id of ids) {
        const entry = ledger.containers.get(id);
        if (entry) entry.removed = true;
        ledger.containers.delete(id);
      }
      return `${arrayJoin(ids, '\n')}\n`;
    }],
    [(command) => stringIncludes(command, 'http://10.0.0.1:8080/readyz'), () =>
      http(503, {ready: false, phase: 'joining', reasons: ['awaiting-quorum']})],
    ...lagrangeHealthyRules(ledger, {hosts}),
  ]);
  const {deps, records} = harness({
    deadlineAt: 15,
    deployRun: async (one, {signal} = {}) => {
      if (one.targetId !== 'lagrange') return deployment(one.runId);
      return deployers.deployLagrangeCluster({
        hosts,
        clientIp: '10.0.0.9',
        sshRun,
        campaignId: `${MANIFEST.campaignId}-${one.runId}`,
        signal,
        sleep: () => new Promise((resolve) => {
          setTimeout(resolve, 50);
        }),
        opts: {
          lagrangeImage: LAGRANGE_IMAGE,
          readiness: {stablePolls: 1, attempts: 420, intervalMs: 60_000},
        },
      });
    },
    inspectProducts: async (deployed) => deployed?.identity?.products ?? [product('c1')],
    executeWorkloadRun: async (input) => {
      if (input.setupFailure) {
        return {
          observations: {
            runStatus: 'setup-failed',
            setup: input.setupFailure,
            requests: [{outcome: 'unissued'}],
            accounting: {offered: 1, issued: 0, unissued: 1},
          },
          correctness: {semanticGate: null, finalState: null},
          plan: {operationSliceDigest: 'sha256:slice', plannedOperationCounts: {payment: 1}},
          endpoint: null,
          harness: {driverSourceSha256: 'feed', adapterIds: ['a']},
          dataset: {resetMethod: 'fresh-formation', verification: {status: 'failed'}},
          placement: null,
          loadGenerator: {host: '10.0.0.9', nodeVersion: 'v22', driverVersions: {}},
          events: [],
          failure: null,
          productFailure: {runStatus: 'setup-failed', setup: input.setupFailure},
        };
      }
      return {
        observations: {accounting: {offered: 1}},
        correctness: {semanticGate: null},
        plan: {operationSliceDigest: 'sha256:slice', plannedOperationCounts: {payment: 1}},
        dataset: {resetMethod: 'fresh-formation'},
        loadGenerator: {host: '10.0.0.9', nodeVersion: 'v22', driverVersions: {}},
      };
    },
    teardownRun: async (one) => deployers.removeCampaignContainers({
      hosts,
      sshRun,
      opts: {},
      campaignId: `${MANIFEST.campaignId}-${one.runId}`,
    }),
  });
  await run(deps);
  const lagrangeRun = arrayFind(records.slice(1), (record) => record.targetId === 'lagrange');
  assert.ok(lagrangeRun, 'interrupted Lagrange run must be recorded');
  assert.equal(lagrangeRun.execution.state, 'interrupted');
  assert.equal(lagrangeRun.failureClass, 'interrupted');
  assert.equal(lagrangeRun.execution.failureClass, 'interrupted');
  assert.equal(lagrangeRun.execution.failure.failureClass, 'interrupted');
  assert.notEqual(lagrangeRun.failureClass, 'product_error');
  assert.equal(lagrangeRun.observations.setup.failureClass, 'interrupted');
  assert.notEqual(lagrangeRun.observations.setup.failureClass, 'product_error');
  assert.equal(lagrangeRun.identity.products.length, hosts.length);
  assert.match(JSON.stringify(lagrangeRun.lastObservation), /awaiting-quorum/u);
  assert.match(JSON.stringify(lagrangeRun.execution.failure.lastObservation), /awaiting-quorum/u);
  assert.equal(lagrangeRun.cleanup.status, 'complete');
  assert.equal(lagrangeRun.deployment.closure.status, 'complete');
  assert.equal(ledger.containers.size, 0,
    'teardownComparativeDeployment must remove all 3 Lagrange containers');
});

test('watchdog cancellation & deadline inside semantic gate (remote loadGeneratorHost and local ' +
  'journey) bounds sshRun timeoutMs, stops on case 1 without starting case 2, and records ' +
  'interrupted without synthetic dataset-reset events', async () => {
  const remoteCasesStarted = [];
  const remoteTimeouts = [];
  const clock = 1_000;
  const deadlineAt = 1_015;
  const remoteStage = createSemanticGateStage({
    journey: runScenarioASemanticProofJourney,
    sshRun: async (_host, callOpts, command, timeoutMs) => {
      remoteTimeouts.push(timeoutMs ?? callOpts?.timeoutMs ?? null);
      const encoded = stringTrim(stringSplit(command, /\s+/u).at(-1));
      const payload = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
      remoteCasesStarted.push(payload.caseId ?? payload.action);
      return new Promise((_resolve, reject) => {
        const hold = setTimeout(() => {}, 500);
        const onAbort = () => {
          clearTimeout(hold);
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        };
        if (callOpts?.signal?.aborted) {
          onAbort();
          return;
        }
        callOpts?.signal?.addEventListener('abort', onAbort, {once: true});
      });
    },
    opts: {},
    loadGeneratorHost: {ip: '10.0.0.9', repoPath: '/srv/repo', nodePath: '/usr/bin/node'},
    evidenceDirOf: () => null,
    now: () => clock,
    redeploy: async () => deployment('r-lagrange'),
  });
  const {deps, records} = harness({
    now: () => clock,
    deadlineAt,
    runSemanticGate: ({run: activeRun, manifest, deployment: deployed, signal, deadlineAtMs}) =>
      remoteStage({
        run: {...activeRun, system: activeRun.targetId === 'lagrange' ? 'lagrange' : 'postgresql'},
        manifest,
        deployment: {
          ...deployed,
          access: {
            endpoint: {host: '10.0.0.1', port: 5432, protocol: 'pg-wire'},
            connection: {user: 'postgres', database: 'lagrange'},
          },
          operations: {awaitReady: async () => ({ready: true})},
        },
        signal,
        deadlineAtMs,
      }),
    executeWorkloadRun: async (input) => {
      if (input.setupFailure) {
        return {
          observations: {
            runStatus: 'setup-failed',
            setup: input.setupFailure,
            requests: [{outcome: 'unissued'}],
            accounting: {offered: 1, issued: 0, unissued: 1},
          },
          correctness: {semanticGate: null, finalState: null},
          plan: {operationSliceDigest: 'sha256:slice', plannedOperationCounts: {payment: 1}},
          endpoint: null,
          harness: {driverSourceSha256: 'feed', adapterIds: ['a']},
          dataset: {resetMethod: 'fresh-formation', verification: {status: 'failed'}},
          placement: null,
          loadGenerator: {host: '10.0.0.9', nodeVersion: 'v22', driverVersions: {}},
          events: [],
          failure: null,
          productFailure: {runStatus: 'setup-failed', setup: input.setupFailure},
        };
      }
      return {
        observations: {accounting: {offered: 1}},
        correctness: {semanticGate: input.semanticGate},
        plan: {operationSliceDigest: 'sha256:slice', plannedOperationCounts: {payment: 1}},
        dataset: {resetMethod: 'fresh-formation'},
        loadGenerator: {host: '10.0.0.9', nodeVersion: 'v22', driverVersions: {}},
      };
    },
  });
  await run(deps);
  assert.deepEqual(remoteCasesStarted, ['new-order-contention'],
    'watchdog firing during case 1 must never start case 2');
  assert.deepEqual(remoteTimeouts, [15],
    'runRemoteNodeJson must bound timeoutMs to remaining campaign deadline');
  const interruptedLagrange = arrayFind(records.slice(1), (r) => r.targetId === 'lagrange');
  assert.equal(interruptedLagrange.execution.state, 'interrupted');
  assert.equal(interruptedLagrange.failureClass, 'interrupted');
  assert.equal(interruptedLagrange.execution.failure.code, 'watchdog_stopped');

  // Local journey without outer resetDataset stops immediately when signal aborts on case 1:
  const localAbort = new AbortController();
  let localConnectCalls = 0;
  const localStage = createSemanticGateStage({
    journey: (gateArgs) => runScenarioASemanticProofJourney({
      ...gateArgs,
      createClient: () => ({
        connect: async () => {
          localConnectCalls += 1;
          localAbort.abort();
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          throw err;
        },
        query: async () => ({rows: []}),
        end: async () => {},
      }),
    }),
    sshRun: async () => '',
    opts: {},
    evidenceDirOf: () => null,
    now: () => 5_000,
    redeploy: async () => deployment('r-local'),
  });
  await assert.rejects(
    localStage({
      run: {runId: 'r-local', system: 'lagrange'},
      manifest: MANIFEST,
      deployment: {
        ...deployment('r-local'),
        access: {
          endpoint: {host: '10.0.0.1', port: 5432, protocol: 'pg-wire'},
          connection: {user: 'postgres', database: 'lagrange'},
        },
        operations: {awaitReady: async () => ({ready: true})},
      },
      signal: localAbort.signal,
      deadlineAtMs: 60_000,
    }),
    (error) => {
      assert.equal(error.code, 'watchdog_stopped');
      assert.equal(error.failureClass, 'interrupted');
      assert.equal(error.aborted, true);
      return true;
    },
  );
  assert.equal(localConnectCalls, 1,
    'aborting during case 1 must never start case 2');

  // Without an outer resetDataset, dataset-reset events are recorded only when cases 2..N
  // actually prepare/reset their adapter dataset (and never from a no-op outer reset()):
  const erroredStage = createSemanticGateStage({
    journey: async ({beforeCase, onCaseDatasetPrepared, binding}) => {
      await beforeCase({caseId: 'new-order-contention'});
      onCaseDatasetPrepared({caseId: 'new-order-contention'});
      await beforeCase({caseId: 'visibility'});
      onCaseDatasetPrepared({caseId: 'visibility'});
      await beforeCase({caseId: 'payment'});
      return {status: 'incomplete', passed: [], failed: [], missing: ['payment'], binding};
    },
    sshRun: async () => '',
    opts: {},
    evidenceDirOf: () => null,
    now: () => 5_000,
    redeploy: async () => deployment('r-events'),
  });
  const erroredGate = await erroredStage({
    run: {runId: 'r-events', system: 'lagrange'},
    manifest: MANIFEST,
    deployment: {
      ...deployment('r-events'),
      access: {
        endpoint: {host: '10.0.0.1', port: 5432, protocol: 'pg-wire'},
        connection: {user: 'postgres', database: 'lagrange'},
      },
      operations: {awaitReady: async () => ({ready: true})},
    },
  });
  assert.deepEqual(arrayMap(erroredGate.events, (e) => [e.kind, e.caseId]), [
    ['dataset-reset', 'visibility'],
  ]);
});

test('Review #6: delayed in-flight semantic-gate operation settles before teardownRun, and ' +
  'earlier Case 1 failure/error + harnessEvents are preserved on the interrupted run record',
async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'lagrange-campaign-rev6-'));
  try {
    const timeline = [];
    let clock = 1_000;
    const deadlineAt = 1_020;
    const stage = createSemanticGateStage({
      journey: (gateArgs) => runScenarioASemanticProofJourney({
        ...gateArgs,
        createClient: () => {
          let connectNum = 0;
          return {
            connect: async () => {
              connectNum += 1;
            },
            query: async () => {
              if (gateArgs.onCaseDatasetPrepared && connectNum === 1) {
                // Case 1 fails with an adapter/query error; Case 2 delays 35ms past abort.
              }
              throw new Error('unexpected query');
            },
            end: async () => {},
          };
        },
      }),
      sshRun: async (_host, _callOpts, command) => {
        const encoded = stringTrim(stringSplit(command, /\s+/u).at(-1));
        const payload = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
        if (payload.caseId === 'new-order-contention') {
          timeline.push('case1-error');
          throw new Error('case-1-contention-boom');
        }
        timeline.push(`case2-start:${payload.caseId}`);
        await new Promise((resolve) => setTimeout(resolve, 45));
        timeline.push(`case2-settled:${payload.caseId}`);
        return JSON.stringify({evaluation: {passed: true}, proofRecord: null, evidence: {}});
      },
      opts: {},
      loadGeneratorHost: {ip: '10.0.0.9', repoPath: '/srv/repo', nodePath: '/usr/bin/node'},
      evidenceDirOf: (activeRun) => path.join(tempDir, activeRun.runId),
      now: () => clock,
      redeploy: async () => deployment('r-lagrange'),
    });

    const {deps, records} = harness({
      now: () => clock,
      deadlineAt,
      runSemanticGate: ({run: activeRun, manifest, deployment: deployed, signal, deadlineAtMs}) => {
        if (activeRun.targetId !== 'lagrange') {
          return Promise.resolve({gate: {status: 'passed'}, deployment: deployed, events: []});
        }
        return stage({
          run: {
            ...activeRun,
            system: 'lagrange',
            resetDataset: async () => {
              clock = 1_005;
            },
          },
          manifest,
          deployment: {
            ...deployed,
            access: {
              endpoint: {host: '10.0.0.1', port: 5432, protocol: 'pg-wire'},
              connection: {user: 'postgres', database: 'lagrange'},
            },
            operations: {awaitReady: async () => ({ready: true})},
          },
          signal,
          deadlineAtMs,
        });
      },
      teardownRun: async (activeRun) => {
        if (activeRun.targetId === 'lagrange') {
          timeline.push('teardown-run');
        }
        return {complete: true, removed: ['c1'], unclosed: []};
      },
    });

    await run(deps);

    const lagrangeRecord = arrayFind(records.slice(1), (r) => r.targetId === 'lagrange');
    assert.ok(lagrangeRecord, 'interrupted Lagrange run record must be present');
    assert.deepEqual(timeline, [
      'case1-error',
      'case2-start:visibility',
      'case2-settled:visibility',
      'teardown-run',
    ], 'teardownRun must not execute until Case 2 in-flight SSH operation has settled');
    assert.equal(lagrangeRecord.execution.state, 'interrupted');
    assert.equal(lagrangeRecord.failureClass, 'interrupted');
    assert.equal(lagrangeRecord.execution.failure.code, 'watchdog_stopped');

    // Verify Case 1 errored artifact was persisted to disk before Case 2 was interrupted:
    const case1ArtifactPath = path.join(
      tempDir,
      lagrangeRecord.runId,
      'scenario-a-new-order-contention-lagrange.json',
    );
    const persistedCase1 = JSON.parse(await readFile(case1ArtifactPath, 'utf8'));
    assert.equal(persistedCase1.caseId, 'new-order-contention');
    assert.equal(persistedCase1.status, 'errored');
    assert.match(persistedCase1.error, /case-1-contention-boom/u);

    // Verify the final campaign run record preserves Case 1's failure/error in correctness:
    assert.ok(lagrangeRecord.correctness, 'interrupted run with prior case result must retain correctness');
    assert.equal(lagrangeRecord.correctness.status, 'fail');
    assert.ok(lagrangeRecord.correctness.semanticGate);
    assert.equal(lagrangeRecord.correctness.semanticGate.cases.length, 1);
    assert.equal(lagrangeRecord.correctness.semanticGate.cases[0].caseId, 'new-order-contention');
    assert.equal(lagrangeRecord.correctness.semanticGate.cases[0].status, 'errored');
    assert.match(lagrangeRecord.correctness.semanticGate.cases[0].error, /case-1-contention-boom/u);
    assert.equal(lagrangeRecord.correctness.semanticGate.cases[0].evidencePath, case1ArtifactPath);

    // Verify prior gate harnessEvents (dataset-reset before visibility) are retained alongside watchdog-stop:
    assert.deepEqual(
      arrayMap(lagrangeRecord.harnessEvents, (e) => [e.kind, e.caseId ?? null]),
      [
        ['dataset-reset', 'visibility'],
        ['watchdog-stop', null],
      ],
    );

    // Also verify runTiDbSemanticGate waits for in-flight SQL queries to settle on abort:
    const tidbTimeline = [];
    const tidbAbort = new AbortController();
    await assert.rejects(
      async () => {
        try {
          await runTiDbSemanticGate({
            connection: {endpoint: {host: '10.0.0.1', port: 4000}, credentials: {user: 'root'}},
            binding: {
              campaignId: 'camp-rev6',
              containerId: 'c'.repeat(64),
              imageId: `sha256:${'a'.repeat(64)}`,
              endpoint: '10.0.0.1:4000',
            },
            persistentStorage: false,
            executedCaseIds: ['visibility'],
            signal: tidbAbort.signal,
            createMysqlConnection: async () => ({
              query: async () => {
                tidbTimeline.push('sql-query-start');
                setTimeout(() => {
                  tidbTimeline.push('tidb-signal-abort');
                  tidbAbort.abort();
                }, 5);
                await new Promise((resolve) => setTimeout(resolve, 35));
                tidbTimeline.push('sql-query-settled');
                return [[]];
              },
              end: async () => {
                tidbTimeline.push('sql-conn-ended');
              },
            }),
          });
        } finally {
          tidbTimeline.push('tidb-gate-exited');
        }
      },
      (error) => error.code === 'watchdog_stopped',
    );
    assert.deepEqual(tidbTimeline, [
      'sql-query-start',
      'tidb-signal-abort',
      'sql-conn-ended',
      'sql-query-settled',
      'tidb-gate-exited',
    ], 'runTiDbSemanticGate must wait for delayed in-flight SQL query to settle before exiting');
  } finally {
    await rm(tempDir, {recursive: true, force: true});
  }
});

test('pure observer-infrastructure readiness exhaustion classifies as infrastructure_error ' +
  'and failed, while keeping record.cleanup even when deployment is null', async () => {
  const manifest = buildComparativeCampaignManifest({
    campaignId: 'camp-infra-01',
    profile: COMPARATIVE_SMOKE_PROFILE,
    targets: ['lagrange', 'pg-single-primary'],
  });
  const {deps} = harness({
    deadlineAt: null,
    deployRun: async (currentRun) => {
      if (currentRun.targetId === 'lagrange') {
        const ledger = createContainerLedger();
        const ssh = createScriptedSsh([
          [/curl .*8080\/readyz/u, Object.assign(
            new Error('ssh: connect to host 10.0.0.1 port 22: No route to host'),
            {code: 255},
          )],
          ...lagrangeHealthyRules(ledger, {hosts: ['10.0.0.1', '10.0.0.2', '10.0.0.3']}),
        ]).sshRun;
        return deployers.deployComparativeTarget('lagrange', {
          hosts: ['10.0.0.1', '10.0.0.2', '10.0.0.3'],
          clientIp: '10.0.0.9',
          sshRun: ssh,
          opts: {
            lagrangeImage: LAGRANGE_IMAGE,
            readiness: {attempts: 2, intervalMs: 1, stablePolls: 1},
          },
          campaignId: manifest.campaignId,
          sleep: async () => {},
        });
      }
      throw Object.assign(
        new Error('ssh: connect to host 10.0.0.1 port 22: No route to host'),
        {code: 255, observerInfrastructure: true},
      );
    },
    inspectProducts: async (dep) => dep.identity.products,
    teardownRun: async () => ({
      complete: true,
      removed: [{host: '10.0.0.1', containerIds: ['c1']}],
      unclosed: [],
    }),
  });
  const summary = await runComparativeCampaign({
    manifest: {...manifest, runs: [manifest.runs[0], manifest.runs[1]]},
    header: {
      executionTarget: 'lab',
      physicalHosts: arrayMap(['10.0.0.1', '10.0.0.2', '10.0.0.3'], (ip) => ({
        hostId: ip, ip, hostname: ip, bootId: 'b', cpus: 8, memGb: 16,
      })),
      harness: {gitCommit: '0'.repeat(40)},
    },
    deps,
  });
  const firstRun = summary.records[0];
  assert.equal(firstRun.failureClass, 'infrastructure_error');
  assert.equal(firstRun.execution.state, 'failed');
  assert.equal(firstRun.cleanup?.status, 'complete');
  assert.equal(firstRun.deployment?.closure?.status, 'complete');
  const secondRun = summary.records[1];
  assert.equal(secondRun.deployment, null);
  assert.equal(secondRun.failureClass, 'infrastructure_error');
  assert.equal(secondRun.execution.state, 'failed');
  assert.equal(secondRun.cleanup?.status, 'complete');
});

test('campaign run crossing t = 450_000ms during workload measurement succeeds in ' +
  'placementAfterWindow and rolesAfter with execution.state completed and 0 ' +
  'role-observation-failed events', async () => {
  const manifest = buildComparativeCampaignManifest({
    campaignId: 'camp-crossing-deadline-01',
    profile: COMPARATIVE_SMOKE_PROFILE,
    targets: ['lagrange'],
  });
  let clock = 100_000;
  let placementObservedAt = null;
  let rolesObservedAfterAt = null;
  const targetRun = manifest.runs[0];
  const {deps} = harness({
    now: () => clock,
    deadlineAt: 1_000_000,
    deployRun: async () => ({
      ...deployment(targetRun.runId),
      operations: {
        observePlacement: async ({signal: _signal, deadlineAtMs: _deadlineAtMs}) => {
          placementObservedAt = clock;
          return {partitions: ['p0']};
        },
        observeRoles: async ({signal: _signal, deadlineAtMs: _deadlineAtMs}) => {
          if (clock > 420_000) {
            rolesObservedAfterAt = clock;
          }
          return [{host: '10.0.0.1', role: 'node'}];
        },
      },
    }),
    executeWorkloadRun: createWorkloadRunExecutor({
      clientHost: '10.0.0.9',
      describeLoadGenerator: async () => ({
        hostname: 'node-client',
        nodeVersion: 'v22',
        nativeClients: {},
        checkout: {commit: 'f'.repeat(40), clean: true},
      }),
      runWorkload: async () => {
        // Cross t = 450_000ms (> 420_000ms formation deadline) during workload measurement:
        clock = 450_000;
        return {
          recordKind: 'benchmark-workload-record',
          dispatch: {status: 'executed'},
          observations: {accounting: {offered: 1}},
          correctness: {},
          plan: {
            datasetDigest: manifest.plan.datasetDigest,
            profileClass: 'smoke',
          },
          deployment: {
            endpoint: {host: '10.0.0.1', port: 5432},
            dataset: {verification: {status: 'verified'}},
          },
          identity: {harness: {}},
          loadGenerator: {
            hostname: 'node-client',
            nodeVersion: 'v22',
            nativeClients: {},
            checkout: {commit: 'f'.repeat(40), clean: true},
          },
        };
      },
    }),
  });

  const summary = await runComparativeCampaign({
    manifest,
    header: HEADER,
    deps,
  });

  const runRecord = summary.records[0];
  assert.equal(runRecord.execution.state, 'completed');
  assert.equal(placementObservedAt, 450_000);
  assert.equal(rolesObservedAfterAt, 450_000);
  const roleObsFailedEvents = arrayFilter(
    runRecord.harnessEvents,
    (e) => e.kind === 'role-observation-failed',
  );
  assert.equal(roleObsFailedEvents.length, 0);
});

test('campaign watchdog signal firing during placementAfterWindow or observeRoles classifies ' +
  'the run as interrupted, never workload_failed or role-observation-failed', async () => {
  const manifest = buildComparativeCampaignManifest({
    campaignId: 'camp-watchdog-post-window-01',
    profile: COMPARATIVE_SMOKE_PROFILE,
    targets: ['lagrange'],
  });
  const targetRun = manifest.runs[0];

  // Subcase A: signal fires during placementAfterWindow
  {
    const {deps} = harness({
      deployRun: async () => ({
        ...deployment(targetRun.runId),
        operations: {
          observePlacement: async () => {
            throw Object.assign(new Error('watchdog fired during placement observation'), {
              code: DEPLOYMENT_FAILURE.WATCHDOG_STOPPED,
              aborted: true,
            });
          },
        },
      }),
      executeWorkloadRun: createWorkloadRunExecutor({
        clientHost: '10.0.0.9',
        describeLoadGenerator: async () => ({
          hostname: 'node-client',
          nodeVersion: 'v22',
          nativeClients: {},
          checkout: {commit: 'f'.repeat(40), clean: true},
        }),
        runWorkload: async () => ({
          recordKind: 'benchmark-workload-record',
          dispatch: {status: 'executed'},
          observations: {accounting: {offered: 1}},
          correctness: {},
          plan: {
            datasetDigest: manifest.plan.datasetDigest,
            profileClass: 'smoke',
          },
          deployment: {
            endpoint: {host: '10.0.0.1', port: 5432},
            dataset: {verification: {status: 'verified'}},
          },
          identity: {harness: {}},
          loadGenerator: {
            hostname: 'node-client',
            nodeVersion: 'v22',
            nativeClients: {},
            checkout: {commit: 'f'.repeat(40), clean: true},
          },
        }),
      }),
    });

    const summary = await runComparativeCampaign({
      manifest,
      header: HEADER,
      deps,
    });

    const runRecord = summary.records[0];
    assert.equal(runRecord.execution.state, 'interrupted');
    assert.equal(runRecord.failureClass, 'interrupted');
    assert.notEqual(runRecord.execution.failure?.code, 'workload_failed');
    const roleFailedEvents = arrayFilter(
      runRecord.harnessEvents,
      (e) => e.kind === 'role-observation-failed',
    );
    assert.equal(roleFailedEvents.length, 0);
  }

  // Subcase B: signal fires during observeRoles
  {
    let rolesCalls = 0;
    const {deps} = harness({
      deployRun: async () => ({
        ...deployment(targetRun.runId),
        operations: {
          observeRoles: async () => {
            if (rolesCalls === 0) {
              rolesCalls += 1;
              return [{host: '10.0.0.1', role: 'node'}];
            }
            throw Object.assign(new Error('watchdog aborted during role observation'), {
              code: DEPLOYMENT_FAILURE.WATCHDOG_STOPPED,
              aborted: true,
            });
          },
        },
      }),
    });

    const summary = await runComparativeCampaign({
      manifest,
      header: HEADER,
      deps,
    });

    const runRecord = summary.records[0];
    assert.equal(runRecord.execution.state, 'interrupted');
    assert.equal(runRecord.failureClass, 'interrupted');
    const roleFailedEvents = arrayFilter(
      runRecord.harnessEvents,
      (e) => e.kind === 'role-observation-failed',
    );
    assert.equal(roleFailedEvents.length, 0);
  }
});

test('post-window observePlacement throwing readiness_exhausted with observerInfrastructure ' +
  'true classifies as infrastructure_error and failed, not product_error', async () => {
  const manifest = buildComparativeCampaignManifest({
    campaignId: 'camp-placement-infra-01',
    profile: COMPARATIVE_SMOKE_PROFILE,
    targets: ['lagrange'],
  });
  const targetRun = manifest.runs[0];
  const {deps} = harness({
    deployRun: async () => ({
      ...deployment(targetRun.runId),
      operations: {
        observePlacement: async () => {
          throw Object.assign(
            deploymentFailure(
              DEPLOYMENT_FAILURE.READINESS_EXHAUSTED,
              'ssh connection lost during post-window placement observation',
            ),
            {observerInfrastructure: true},
          );
        },
      },
    }),
    executeWorkloadRun: createWorkloadRunExecutor({
      clientHost: '10.0.0.9',
      describeLoadGenerator: async () => ({
        hostname: 'node-client',
        nodeVersion: 'v22',
        nativeClients: {},
        checkout: {commit: 'f'.repeat(40), clean: true},
      }),
      runWorkload: async () => ({
        recordKind: 'benchmark-workload-record',
        dispatch: {status: 'executed'},
        observations: {accounting: {offered: 1}},
        correctness: {},
        plan: {
          datasetDigest: manifest.plan.datasetDigest,
          profileClass: 'smoke',
        },
        deployment: {
          endpoint: {host: '10.0.0.1', port: 5432},
          dataset: {verification: {status: 'verified'}},
        },
        identity: {harness: {}},
        loadGenerator: {
          hostname: 'node-client',
          nodeVersion: 'v22',
          nativeClients: {},
          checkout: {commit: 'f'.repeat(40), clean: true},
        },
      }),
    }),
  });

  const summary = await runComparativeCampaign({
    manifest,
    header: HEADER,
    deps,
  });

  const runRecord = summary.records[0];
  assert.equal(runRecord.execution.state, 'failed');
  assert.equal(runRecord.failureClass, 'infrastructure_error');
  assert.notEqual(runRecord.failureClass, 'product_error');
});

test('teardown returning containersClosed true and storageClosed false projects closure ' +
  'incomplete and closureComplete false', async () => {
  const manifest = buildComparativeCampaignManifest({
    campaignId: 'camp-teardown-storage-01',
    profile: COMPARATIVE_SMOKE_PROFILE,
    targets: ['lagrange'],
  });
  const {deps} = harness({
    teardownRun: async () => ({
      complete: false,
      containersClosed: true,
      storageClosed: false,
      removed: [{host: '10.0.0.1', containerIds: ['c1']}],
      unclosed: [],
      storageCleanup: {errors: ['permission denied removing /var/lib/lagrange/storage']},
    }),
  });

  const summary = await runComparativeCampaign({
    manifest,
    header: HEADER,
    deps,
  });

  assert.equal(summary.attempted[0].closureComplete, false);
  const runRecord = summary.records[0];
  assert.equal(runRecord.deployment.closure.status, 'incomplete');
  assert.deepEqual(runRecord.deployment.closure.storageCleanup, {
    errors: ['permission denied removing /var/lib/lagrange/storage'],
  });
});
