import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {
  createOciHostAgentEngineTranslation,
} from '../../src/runtime/oci-host-agent-engine-translation.js';
import {
  validateOciHostAgentResult,
} from '../../src/runtime/oci-host-agent-schema.js';

const HEX_A = 'a'.repeat(64);
const HEX_B = 'b'.repeat(64);
const HEX_C = 'c'.repeat(64);
const HEX_D = 'd'.repeat(64);
const IMAGE_DIGEST = `sha256:${HEX_A}`;
const OTHER_IMAGE_DIGEST = `sha256:${HEX_B}`;
const RUNTIME_CONFIG_DIGEST = `sha256:${HEX_C}`;
const INTENT_DIGEST = `sha256:${HEX_D}`;
const OTHER_INTENT_DIGEST = `sha256:${'e'.repeat(64)}`;
const CREATE_OPERATION_ID = `oci-v1:${'f'.repeat(64)}`;
const OPERATION_ID = `oci-v1:${'0'.repeat(64)}`;
const CONTAINER_ID = `${'0'.repeat(63)}1`;
const OTHER_CONTAINER_ID = `${'0'.repeat(63)}2`;
const ARTIFACT_REF =
  `registry.example.com:5000/lagrange/app@sha256:${HEX_A}`;
const NOW_MS = 1_000_000;
const DEADLINE_AT_MS = 1_030_000;
const EXPIRED_NOW_MS = 1_030_000;
const RAW_ENGINE_SECRET = 'RAW-ENGINE-DETAIL-MUST-NOT-LEAK';

const IDENTITY = Object.freeze({
  clusterIncarnation: 'ci-2026',
  nodeId: 'node-a',
  serviceId: 'svc-app',
  revisionId: 'rev-7',
  instanceId: 'replica-0',
});

const POLICY = Object.freeze({
  workloadNetwork: 'lagrange-workload-net',
  allowedEnvironmentNames: Object.freeze(['APP_MODE', 'APP_TOKEN']),
  allowedPortProtocols: Object.freeze(['tcp']),
  maximumCpuMillis: 2_000,
  maximumMemoryBytes: 1_073_741_824,
});

function stableLabels(overrides = {}) {
  return {
    'io.lagrange.managed': 'true',
    'io.lagrange.cluster_incarnation': IDENTITY.clusterIncarnation,
    'io.lagrange.node_id': IDENTITY.nodeId,
    'io.lagrange.service_id': IDENTITY.serviceId,
    'io.lagrange.revision_id': IDENTITY.revisionId,
    'io.lagrange.instance_id': IDENTITY.instanceId,
    'io.lagrange.image_digest': IMAGE_DIGEST,
    'io.lagrange.runtime_config_digest': RUNTIME_CONFIG_DIGEST,
    'io.lagrange.create_operation_id': CREATE_OPERATION_ID,
    'io.lagrange.create_intent_digest': INTENT_DIGEST,
    ...overrides,
  };
}

function containerMatch(overrides = {}) {
  return {
    containerId: CONTAINER_ID,
    state: 'created',
    labels: stableLabels(),
    ...overrides,
  };
}

function fakeEngine(overrides = {}) {
  const calls = [];
  const respond = (name, request, fallback) => {
    calls.push({name, request});
    if (Object.hasOwn(overrides, name)) {
      const handler = overrides[name];
      if (typeof handler === 'function') return handler(request);
      return handler;
    }
    return fallback;
  };
  const engine = {
    pullImage: async (request) => respond('pullImage', request, {}),
    inspectImage: async (request) =>
      respond('inspectImage', request, {present: false}),
    listManagedContainers: async (request) =>
      respond('listManagedContainers', request, {matches: []}),
    inspectContainer: async (request) =>
      respond('inspectContainer', request, {present: false}),
    createContainer: async (request) =>
      respond('createContainer', request, {containerId: CONTAINER_ID}),
    startContainer: async (request) => respond('startContainer', request, {}),
    stopContainer: async (request) => respond('stopContainer', request, {}),
    removeContainer: async (request) =>
      respond('removeContainer', request, {}),
  };
  return {calls, engine};
}

function translation(engineOverrides = {}, policyOverrides = {}) {
  const {calls, engine} = fakeEngine(engineOverrides);
  const instance = createOciHostAgentEngineTranslation({
    engine,
    policy: {...POLICY, ...policyOverrides},
  });
  return {calls, instance};
}

function pullPayload(overrides = {}) {
  return {
    artifactRef: ARTIFACT_REF,
    expectedDigest: IMAGE_DIGEST,
    ...overrides,
  };
}

function createPayload(overrides = {}) {
  return {
    imageDigest: IMAGE_DIGEST,
    runtimeConfigDigest: RUNTIME_CONFIG_DIGEST,
    entrypoint: ['/bin/app'],
    args: ['--serve'],
    environment: {values: {APP_MODE: 'production'}},
    ports: [{protocol: 'tcp', containerPort: 5432}],
    resources: {cpuMillis: 500, memoryBytes: 268_435_456},
    ...overrides,
  };
}

function classifyContext(overrides = {}) {
  return {
    operationId: OPERATION_ID,
    intentDigest: INTENT_DIGEST,
    nowMs: NOW_MS,
    deadlineAtMs: DEADLINE_AT_MS,
    ...overrides,
  };
}

function preClassify(instance, operation, payload, snapshot, overrides = {}) {
  return instance.classifyPreDispatch({
    operation,
    identity: IDENTITY,
    payload,
    snapshot,
    ...classifyContext(overrides),
  });
}

function postClassify(instance, operation, payload, snapshot, overrides = {}) {
  return instance.classifyPostMutation({
    operation,
    identity: IDENTITY,
    payload,
    postSnapshot: snapshot,
    fenceState: 'mutation_unresolved',
    ...classifyContext(overrides),
  });
}

function imageSnapshot(image) {
  return {kind: 'image', image};
}

function containersSnapshot(matches) {
  return {kind: 'containers', matches};
}

function assertValidResult(result, operationId = OPERATION_ID) {
  validateOciHostAgentResult(result, operationId);
}

function assertRejected(decision, errorCode) {
  assert.equal(decision.kind, 'result');
  assert.equal(decision.result.status, 'rejected');
  assert.equal(decision.result.errorCode, errorCode);
  assert.equal(Object.hasOwn(decision.result, 'observation'), false);
  assert.equal(Object.hasOwn(decision.result, 'lastObservation'), false);
  assertValidResult(decision.result);
}

describe('oci host agent engine translation construction', () => {
  it('rejects a facade missing an engine method', () => {
    const {engine} = fakeEngine();
    delete engine.removeContainer;
    assert.throws(
      () => createOciHostAgentEngineTranslation({engine, policy: POLICY}),
      (error) => /removeContainer/u.test(error.message),
    );
  });

  it('rejects a policy missing boot-owned fields', () => {
    const {engine} = fakeEngine();
    const policy = {...POLICY};
    delete policy.workloadNetwork;
    assert.throws(
      () => createOciHostAgentEngineTranslation({engine, policy}),
      (error) => /workloadNetwork/u.test(error.message),
    );
  });
});

describe('oci host agent engine translation observe', () => {
  it('observes pull through authoritative image inspection only', async () => {
    const {calls, instance} = translation({
      inspectImage: {present: true, imageDigest: IMAGE_DIGEST},
    });
    const snapshot = await instance.observe({
      operation: 'pull',
      identity: IDENTITY,
      payload: pullPayload(),
    });
    assert.deepEqual(snapshot, imageSnapshot({
      present: true,
      imageDigest: IMAGE_DIGEST,
    }));
    assert.deepEqual(calls.map((entry) => entry.name), ['inspectImage']);
    assert.equal(calls[0].request.artifactRef, ARTIFACT_REF);
  });

  it('observes container operations through the managed listing', async () => {
    const {calls, instance} = translation({
      listManagedContainers: {matches: [containerMatch()]},
    });
    const snapshot = await instance.observe({
      operation: 'inspect',
      identity: IDENTITY,
      payload: {},
    });
    assert.equal(snapshot.kind, 'containers');
    assert.equal(snapshot.matches.length, 1);
    assert.deepEqual(calls.map((entry) => entry.name),
      ['listManagedContainers']);
    assert.deepEqual(calls[0].request.identity, IDENTITY);
  });

  it('collapses observe engine failures to typed codes', async () => {
    const {instance} = translation({
      listManagedContainers: () => {
        throw new Error(RAW_ENGINE_SECRET);
      },
    });
    const snapshot = await instance.observe({
      operation: 'stop',
      identity: IDENTITY,
      payload: {graceMs: 100},
    });
    assert.equal(snapshot.kind, 'engine_error');
    assert.equal(snapshot.errorCode, 'engine_failure');
    assert.equal(JSON.stringify(snapshot).includes(RAW_ENGINE_SECRET), false);
  });

  it('never treats a malformed listing shape as an authoritative listing',
    async () => {
      for (const listing of [
        'GARBAGE-NOT-A-LISTING',
        {},
        {matches: undefined},
        {matches: {length: 1}},
      ]) {
        const {instance} = translation({listManagedContainers: listing});
        const snapshot = await instance.observe({
          operation: 'remove',
          identity: IDENTITY,
          payload: {},
        });
        assert.equal(snapshot.kind, 'engine_error');
        assert.equal(snapshot.errorCode, 'engine_failure');
      }
    });

  it('never treats a malformed image inspection as authoritative', async () => {
    for (const image of [
      'GARBAGE',
      {},
      {present: 'true'},
      {present: true},
      {present: true, imageDigest: 'sha256:not-hex'},
    ]) {
      const {instance} = translation({inspectImage: image});
      const snapshot = await instance.observe({
        operation: 'pull',
        identity: IDENTITY,
        payload: pullPayload(),
      });
      assert.equal(snapshot.kind, 'engine_error');
      assert.equal(snapshot.errorCode, 'engine_failure');
    }
  });

  it('preserves malformed listing entries for fail-closed resolution',
    async () => {
      const {instance} = translation({
        listManagedContainers: {matches: [{bogus: true}]},
      });
      const snapshot = await instance.observe({
        operation: 'stop',
        identity: IDENTITY,
        payload: {},
      });
      assert.equal(snapshot.kind, 'containers');
      assert.equal(snapshot.matches.length, 1);
    });

  it('preserves a typed engine_unavailable observe failure', async () => {
    const failure = new Error(RAW_ENGINE_SECRET);
    failure.code = 'engine_unavailable';
    const {instance} = translation({
      inspectImage: () => {
        throw failure;
      },
    });
    const snapshot = await instance.observe({
      operation: 'pull',
      identity: IDENTITY,
      payload: pullPayload(),
    });
    assert.equal(snapshot.errorCode, 'engine_unavailable');
    assert.equal(JSON.stringify(snapshot).includes(RAW_ENGINE_SECRET), false);
  });
});

describe('oci host agent engine translation create labels', () => {
  it('builds exactly the ten immutable labels from agent inputs', () => {
    const {instance} = translation();
    const labels = instance.labelsForCreate({
      identity: IDENTITY,
      imageDigest: IMAGE_DIGEST,
      runtimeConfigDigest: RUNTIME_CONFIG_DIGEST,
      createOperationId: CREATE_OPERATION_ID,
      createIntentDigest: INTENT_DIGEST,
    });
    assert.deepEqual(labels, stableLabels());
  });
});

describe('oci host agent engine translation pre-dispatch classification', () => {
  it('returns a retryable deadline result when expired before dispatch', () => {
    const {instance} = translation();
    const decision = preClassify(instance, 'pull', pullPayload(),
      imageSnapshot({present: false}), {nowMs: EXPIRED_NOW_MS});
    assert.equal(decision.kind, 'result');
    assert.equal(decision.result.status, 'retryable_failure');
    assert.equal(decision.result.errorCode, 'deadline_before_dispatch');
    assert.deepEqual(decision.result.lastObservation, {kind: 'not_observed'});
    assertValidResult(decision.result);
  });

  it('returns a retryable result when the observe snapshot failed', () => {
    const {instance} = translation();
    const decision = preClassify(instance, 'start', {},
      {kind: 'engine_error', errorCode: 'engine_unavailable'});
    assert.equal(decision.result.status, 'retryable_failure');
    assert.equal(decision.result.errorCode, 'engine_unavailable');
    assertValidResult(decision.result);
  });

  it('plans a pull mutation when the image is absent', () => {
    const {instance} = translation();
    const decision = preClassify(instance, 'pull', pullPayload(),
      imageSnapshot({present: false}));
    assert.equal(decision.kind, 'mutate');
    assert.equal(decision.plan.kind, 'pull_image');
    assert.equal(decision.plan.request.artifactRef, ARTIFACT_REF);
  });

  it('returns already_applied for a present matching image digest', () => {
    const {instance} = translation();
    const decision = preClassify(instance, 'pull', pullPayload(),
      imageSnapshot({present: true, imageDigest: IMAGE_DIGEST}));
    assert.equal(decision.result.status, 'already_applied');
    assert.deepEqual(decision.result.observation,
      {kind: 'image', imageDigest: IMAGE_DIGEST});
    assertValidResult(decision.result);
  });

  it('rejects a present image whose digest mismatches before dispatch', () => {
    const {instance} = translation();
    const decision = preClassify(instance, 'pull', pullPayload(),
      imageSnapshot({present: true, imageDigest: OTHER_IMAGE_DIGEST}));
    assertRejected(decision, 'digest_mismatch');
  });

  it('plans a create mutation with agent-owned labels and policy network',
    () => {
      const {instance} = translation();
      const decision = preClassify(instance, 'create', createPayload(),
        containersSnapshot([]));
      assert.equal(decision.kind, 'mutate');
      assert.equal(decision.plan.kind, 'create_container');
      assert.deepEqual(decision.plan.request.labels, stableLabels({
        'io.lagrange.create_operation_id': OPERATION_ID,
      }));
      assert.equal(decision.plan.request.config.network,
        POLICY.workloadNetwork);
      assert.equal(decision.plan.request.config.imageDigest, IMAGE_DIGEST);
    });

  it('returns already_applied for a created container with this provenance',
    () => {
      const {instance} = translation();
      const match = containerMatch({
        labels: stableLabels({
          'io.lagrange.create_operation_id': OPERATION_ID,
        }),
      });
      const decision = preClassify(instance, 'create', createPayload(),
        containersSnapshot([match]));
      assert.equal(decision.result.status, 'already_applied');
      assert.equal(decision.result.observation.kind, 'container');
      assert.equal(decision.result.observation.state, 'created');
      assertValidResult(decision.result);
    });

  it('rejects create when the same identity carries another intent', () => {
    const {instance} = translation();
    const match = containerMatch({
      labels: stableLabels({
        'io.lagrange.create_operation_id': OPERATION_ID,
        'io.lagrange.create_intent_digest': OTHER_INTENT_DIGEST,
      }),
    });
    const decision = preClassify(instance, 'create', createPayload(),
      containersSnapshot([match]));
    assertRejected(decision, 'intent_conflict');
  });

  it('rejects create when the provenance container already progressed', () => {
    const {instance} = translation();
    const match = containerMatch({
      state: 'running',
      labels: stableLabels({
        'io.lagrange.create_operation_id': OPERATION_ID,
      }),
    });
    const decision = preClassify(instance, 'create', createPayload(),
      containersSnapshot([match]));
    assertRejected(decision, 'resource_conflict');
  });

  it('rejects create requests that widen the resource ceiling', () => {
    const {instance} = translation();
    const payload = createPayload({
      resources: {cpuMillis: POLICY.maximumCpuMillis + 1},
    });
    const decision = preClassify(instance, 'create', payload,
      containersSnapshot([]));
    assertRejected(decision, 'policy_denied');
  });

  it('rejects create environment names outside the boot allowlist', () => {
    const {instance} = translation();
    const payload = createPayload({
      environment: {values: {UNLISTED_NAME: 'x'}},
    });
    const decision = preClassify(instance, 'create', payload,
      containersSnapshot([]));
    assertRejected(decision, 'policy_denied');
  });

  it('rejects create secret reference names outside the allowlist', () => {
    const {instance} = translation();
    const payload = createPayload({
      environment: {secretRefs: {UNLISTED_SECRET: 'credential-1'}},
    });
    const decision = preClassify(instance, 'create', payload,
      containersSnapshot([]));
    assertRejected(decision, 'policy_denied');
  });

  it('rejects create port protocols outside the boot policy', () => {
    const {instance} = translation();
    const payload = createPayload({
      ports: [{protocol: 'udp', containerPort: 53}],
    });
    const decision = preClassify(instance, 'create', payload,
      containersSnapshot([]));
    assertRejected(decision, 'policy_denied');
  });

  it('plans a start mutation for a created container', () => {
    const {instance} = translation();
    const decision = preClassify(instance, 'start', {},
      containersSnapshot([containerMatch()]));
    assert.equal(decision.kind, 'mutate');
    assert.equal(decision.plan.kind, 'start_container');
    assert.equal(decision.plan.request.containerId, CONTAINER_ID);
  });

  it('returns already_applied for an already running start target', () => {
    const {instance} = translation();
    const decision = preClassify(instance, 'start', {},
      containersSnapshot([containerMatch({state: 'running'})]));
    assert.equal(decision.result.status, 'already_applied');
    assert.equal(decision.result.observation.state, 'running');
    assertValidResult(decision.result);
  });

  it('rejects start when the target container is absent', () => {
    const {instance} = translation();
    const decision = preClassify(instance, 'start', {},
      containersSnapshot([]));
    assertRejected(decision, 'resource_conflict');
  });

  it('completes inspect from the authoritative pre snapshot', () => {
    const {instance} = translation();
    const decision = preClassify(instance, 'inspect', {},
      containersSnapshot([containerMatch({state: 'exited'})]));
    assert.equal(decision.result.status, 'completed');
    assert.equal(decision.result.observation.kind, 'container');
    assert.equal(decision.result.observation.state, 'exited');
    assertValidResult(decision.result);
  });

  it('rejects inspect when the target container is absent', () => {
    const {instance} = translation();
    const decision = preClassify(instance, 'inspect', {},
      containersSnapshot([]));
    assertRejected(decision, 'resource_conflict');
  });

  it('never plans a mutation for inspect', () => {
    const {instance} = translation();
    for (const state of ['created', 'running', 'exited']) {
      const decision = preClassify(instance, 'inspect', {},
        containersSnapshot([containerMatch({state})]));
      assert.equal(decision.kind, 'result');
    }
  });

  it('plans a stop mutation for a running container', () => {
    const {instance} = translation();
    const decision = preClassify(instance, 'stop', {graceMs: 1_000},
      containersSnapshot([containerMatch({state: 'running'})]));
    assert.equal(decision.kind, 'mutate');
    assert.equal(decision.plan.kind, 'stop_container');
    assert.equal(decision.plan.request.graceMs, 1_000);
  });

  it('returns already_applied for an exited stop target', () => {
    const {instance} = translation();
    const decision = preClassify(instance, 'stop', {},
      containersSnapshot([containerMatch({state: 'exited'})]));
    assert.equal(decision.result.status, 'already_applied');
    assert.equal(decision.result.observation.state, 'exited');
    assertValidResult(decision.result);
  });

  it('returns already_absent for a proven absent stop target', () => {
    const {instance} = translation();
    const decision = preClassify(instance, 'stop', {},
      containersSnapshot([]));
    assert.equal(decision.result.status, 'already_absent');
    assert.deepEqual(decision.result.observation,
      {kind: 'absence', state: 'absent'});
    assertValidResult(decision.result);
  });

  it('rejects stop grace beyond the remaining deadline budget', () => {
    const {instance} = translation();
    const decision = preClassify(instance, 'stop', {graceMs: 30_000},
      containersSnapshot([containerMatch({state: 'running'})]),
      {nowMs: DEADLINE_AT_MS - 1_000});
    assertRejected(decision, 'deadline_invalid');
  });

  it('plans a remove mutation for a stopped container', () => {
    const {instance} = translation();
    const decision = preClassify(instance, 'remove', {},
      containersSnapshot([containerMatch({state: 'exited'})]));
    assert.equal(decision.kind, 'mutate');
    assert.equal(decision.plan.kind, 'remove_container');
  });

  it('rejects remove while the target is still running', () => {
    const {instance} = translation();
    const decision = preClassify(instance, 'remove', {},
      containersSnapshot([containerMatch({state: 'running'})]));
    assertRejected(decision, 'resource_conflict');
  });

  it('returns already_absent for a proven absent remove target', () => {
    const {instance} = translation();
    const decision = preClassify(instance, 'remove', {},
      containersSnapshot([]));
    assert.equal(decision.result.status, 'already_absent');
    assertValidResult(decision.result);
  });

  it('rejects unmanaged containers returned by the engine', () => {
    const {instance} = translation();
    const match = containerMatch({
      labels: stableLabels({'io.lagrange.managed': 'false'}),
    });
    const decision = preClassify(instance, 'start', {},
      containersSnapshot([match]));
    assertRejected(decision, 'identity_conflict');
  });

  it('rejects partially labelled containers', () => {
    const {instance} = translation();
    const labels = stableLabels();
    delete labels['io.lagrange.create_intent_digest'];
    const decision = preClassify(instance, 'stop', {},
      containersSnapshot([containerMatch({state: 'running', labels})]));
    assertRejected(decision, 'identity_conflict');
  });

  it('rejects tampered identity labels', () => {
    const {instance} = translation();
    const match = containerMatch({
      labels: stableLabels({'io.lagrange.service_id': 'svc-other'}),
    });
    const decision = preClassify(instance, 'inspect', {},
      containersSnapshot([match]));
    assertRejected(decision, 'identity_conflict');
  });

  it('rejects a container carrying an extra eleventh label', () => {
    const {instance} = translation();
    const match = containerMatch({
      labels: stableLabels({'io.lagrange.extra': 'tampered'}),
    });
    const decision = preClassify(instance, 'stop', {},
      containersSnapshot([match]));
    assertRejected(decision, 'identity_conflict');
  });

  it('throws on a snapshot shape observe never produces', () => {
    const {instance} = translation();
    for (const snapshot of [
      {kind: 'containers'},
      {kind: 'containers', matches: 'not-an-array'},
      {kind: 'image', image: 'garbage'},
      {kind: 'engine_error', errorCode: 'raw engine text'},
    ]) {
      assert.throws(
        () => preClassify(instance, snapshot.kind === 'image' ?
          'pull' : 'remove', snapshot.kind === 'image' ?
          pullPayload() : {}, snapshot),
        (error) => /snapshot/u.test(error.message),
      );
    }
  });

  it('rejects ambiguous multiple full-identity matches', () => {
    const {instance} = translation();
    const decision = preClassify(instance, 'stop', {},
      containersSnapshot([
        containerMatch({state: 'running'}),
        containerMatch({
          containerId: OTHER_CONTAINER_ID,
          state: 'running',
        }),
      ]));
    assertRejected(decision, 'resource_conflict');
  });
});

describe('oci host agent engine translation mutation', () => {
  it('invokes exactly one engine call synchronously on entry', async () => {
    const order = [];
    const {calls, instance} = translation({
      startContainer: () => {
        order.push('engine');
        return {};
      },
    });
    const decision = preClassify(instance, 'start', {},
      containersSnapshot([containerMatch()]));
    const pending = instance.mutate(decision.plan);
    order.push('after-mutate-entry');
    const outcome = await pending;
    assert.deepEqual(order, ['engine', 'after-mutate-entry']);
    assert.deepEqual(calls.map((entry) => entry.name),
      ['startContainer']);
    assert.deepEqual(outcome, {invoked: true, settled: true});
  });

  it('collapses mutation engine errors without leaking raw detail',
    async () => {
      const {instance} = translation({
        pullImage: () => {
          throw new Error(RAW_ENGINE_SECRET);
        },
      });
      const decision = preClassify(instance, 'pull', pullPayload(),
        imageSnapshot({present: false}));
      const outcome = await instance.mutate(decision.plan);
      assert.equal(outcome.invoked, true);
      assert.equal(outcome.settled, false);
      assert.equal(outcome.errorCode, 'engine_failure');
      assert.equal(
        JSON.stringify(outcome).includes(RAW_ENGINE_SECRET), false);
    });
});

describe('oci host agent engine translation post-mutation classification',
  () => {
    it('completes pull when the inspected digest matches', () => {
      const {instance} = translation();
      const result = postClassify(instance, 'pull', pullPayload(),
        imageSnapshot({present: true, imageDigest: IMAGE_DIGEST}));
      assert.equal(result.status, 'completed');
      assert.deepEqual(result.observation,
        {kind: 'image', imageDigest: IMAGE_DIGEST});
      assertValidResult(result);
    });

    it('classifies a post-pull digest mismatch as ambiguous', () => {
      const {instance} = translation();
      const result = postClassify(instance, 'pull', pullPayload(),
        imageSnapshot({present: true, imageDigest: OTHER_IMAGE_DIGEST}));
      assert.equal(result.status, 'ambiguous');
      assert.equal(result.errorCode, 'engine_outcome_unknown');
      assert.equal(result.fenceState, 'mutation_unresolved');
      assertValidResult(result);
    });

    it('completes create from a matching created container', () => {
      const {instance} = translation();
      const match = containerMatch({
        labels: stableLabels({
          'io.lagrange.create_operation_id': OPERATION_ID,
        }),
      });
      const result = postClassify(instance, 'create', createPayload(),
        containersSnapshot([match]));
      assert.equal(result.status, 'completed');
      assert.equal(result.observation.state, 'created');
      assertValidResult(result);
    });

    it('classifies an absent post-create container as ambiguous', () => {
      const {instance} = translation();
      const result = postClassify(instance, 'create', createPayload(),
        containersSnapshot([]));
      assert.equal(result.status, 'ambiguous');
      assert.equal(result.errorCode, 'engine_outcome_unknown');
      assert.deepEqual(result.lastObservation, {kind: 'not_observed'});
      assertValidResult(result);
    });

    it('completes start only on an authoritative running state', () => {
      const {instance} = translation();
      const running = postClassify(instance, 'start', {},
        containersSnapshot([containerMatch({state: 'running'})]));
      assert.equal(running.status, 'completed');
      assertValidResult(running);
      const stillCreated = postClassify(instance, 'start', {},
        containersSnapshot([containerMatch()]));
      assert.equal(stillCreated.status, 'ambiguous');
      assert.equal(stillCreated.errorCode, 'engine_outcome_unknown');
      assertValidResult(stillCreated);
    });

    it('completes stop on exited and never converts absence to success',
      () => {
        const {instance} = translation();
        const exited = postClassify(instance, 'stop', {},
          containersSnapshot([containerMatch({state: 'exited'})]));
        assert.equal(exited.status, 'completed');
        assertValidResult(exited);
        const absent = postClassify(instance, 'stop', {},
          containersSnapshot([]));
        assert.equal(absent.status, 'ambiguous');
        assert.equal(absent.errorCode, 'engine_outcome_unknown');
        assert.deepEqual(absent.lastObservation,
          {kind: 'absence', state: 'absent'});
        assertValidResult(absent);
      });

    it('completes remove only on proven absence', () => {
      const {instance} = translation();
      const absent = postClassify(instance, 'remove', {},
        containersSnapshot([]));
      assert.equal(absent.status, 'completed');
      assert.deepEqual(absent.observation,
        {kind: 'absence', state: 'absent'});
      assertValidResult(absent);
      const present = postClassify(instance, 'remove', {},
        containersSnapshot([containerMatch({state: 'exited'})]));
      assert.equal(present.status, 'ambiguous');
      assertValidResult(present);
    });

    it('classifies a failed post snapshot as ambiguous', () => {
      const {instance} = translation();
      const result = postClassify(instance, 'start', {},
        {kind: 'engine_error', errorCode: 'engine_unavailable'});
      assert.equal(result.status, 'ambiguous');
      assert.equal(result.errorCode, 'engine_outcome_unknown');
      assertValidResult(result);
    });

    it('classifies a tampered post snapshot as ambiguous', () => {
      const {instance} = translation();
      const match = containerMatch({
        state: 'running',
        labels: stableLabels({'io.lagrange.instance_id': 'replica-9'}),
      });
      const result = postClassify(instance, 'start', {},
        containersSnapshot([match]));
      assert.equal(result.status, 'ambiguous');
      assertValidResult(result);
    });

    it('threads the caller fence state into ambiguous results', () => {
      const {instance} = translation();
      const result = instance.classifyPostMutation({
        operation: 'start',
        identity: IDENTITY,
        payload: {},
        postSnapshot: containersSnapshot([]),
        fenceState: 'none',
        ...classifyContext(),
      });
      assert.equal(result.status, 'ambiguous');
      assert.equal(result.fenceState, 'none');
      assertValidResult(result);
    });
  });
