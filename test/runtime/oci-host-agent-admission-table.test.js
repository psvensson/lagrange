import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  createOciHostAgentAdmissionTable,
} from '../../src/runtime/oci-host-agent-admission-table.js';

const DIGEST = `sha256:${'a'.repeat(64)}`;
const OTHER_DIGEST = `sha256:${'b'.repeat(64)}`;

function identity(overrides = {}) {
  return {
    clusterIncarnation: 'cluster-1',
    nodeId: 'node-1',
    serviceId: 'service-1',
    revisionId: 'revision-1',
    instanceId: 'instance-1',
    ...overrides,
  };
}

function candidate(number, overrides = {}) {
  return {
    operationId: `oci-v1:${number.toString(16).padStart(64, '0')}`,
    intentDigest: DIGEST,
    operation: 'inspect',
    identity: identity(),
    deadlineAtMs: 1_000,
    ...overrides,
  };
}

function terminalReceipt(admitted) {
  return {
    operationId: admitted.operationId,
    intentDigest: admitted.intentDigest,
    operation: admitted.operation,
    identity: admitted.identity,
    state: 'terminal',
    generation: 2,
    result: {
      status: 'retryable_failure',
      operation: admitted.operation,
      intentDigest: admitted.intentDigest,
      identity: admitted.identity,
      cleanup: {state: 'not_required', residualResources: []},
      errorCode: 'engine_failure',
      lastObservation: {kind: 'not_observed'},
    },
  };
}

describe('OCI host-agent synchronous admission table', () => {
  it('dispatches different resources but never waits a duplicate operation', () => {
    const table = createOciHostAgentAdmissionTable();
    const firstCandidate = candidate(1);
    const first = table.admit(firstCandidate, 10);
    const other = table.admit(candidate(2, {
      identity: identity({instanceId: 'instance-2'}),
    }), 10);
    assert.equal(first.status, 'dispatch');
    assert.equal(other.status, 'dispatch');
    assert.deepEqual(table.admit(firstCandidate, 10), {
      status: 'retryable_failure',
      errorCode: 'operation_in_progress',
    });
    assert.deepEqual(table.admit(candidate(1, {intentDigest: OTHER_DIGEST}), 10), {
      status: 'rejected',
      errorCode: 'intent_conflict',
    });
  });

  it('queues different operations on one resource in exact FIFO order', () => {
    const table = createOciHostAgentAdmissionTable();
    const firstCandidate = candidate(1);
    const secondCandidate = candidate(2);
    const thirdCandidate = candidate(3);
    const first = table.admit(firstCandidate, 10);
    const second = table.admit(secondCandidate, 10);
    const third = table.admit(thirdCandidate, 10);
    assert.equal(second.status, 'queued');
    assert.equal(third.status, 'queued');

    const afterFirst = table.settle(
      first.lease,
      terminalReceipt(firstCandidate),
      20,
    );
    assert.deepEqual(afterFirst.expired, []);
    assert.deepEqual(
      afterFirst.ready.map(({candidate: ready}) => ready.operationId),
      [secondCandidate.operationId],
    );
    const afterSecond = table.settle(
      afterFirst.ready[0].lease,
      terminalReceipt(secondCandidate),
      30,
    );
    assert.deepEqual(
      afterSecond.ready.map(({candidate: ready}) => ready.operationId),
      [thirdCandidate.operationId],
    );
  });

  it('enforces boot-lowered global, node, and resource queue limits', () => {
    const table = createOciHostAgentAdmissionTable({
      maximumDispatched: 1,
      maximumQueued: 3,
      maximumQueuedPerNode: 1,
      maximumQueuedPerResource: 1,
    });
    table.admit(candidate(1), 10);
    assert.equal(table.admit(candidate(2), 10).status, 'queued');
    assert.deepEqual(table.admit(candidate(3), 10), {
      status: 'retryable_failure',
      errorCode: 'agent_busy',
    });
    assert.equal(table.admit(candidate(4, {
      identity: identity({nodeId: 'node-2', instanceId: 'instance-2'}),
    }), 10).status, 'queued');
    assert.deepEqual(table.admit(candidate(5, {
      identity: identity({nodeId: 'node-2', instanceId: 'instance-3'}),
    }), 10), {
      status: 'retryable_failure',
      errorCode: 'agent_busy',
    });
  });

  it('expires queued work without dispatch and rejects already-late work', () => {
    const table = createOciHostAgentAdmissionTable({maximumDispatched: 1});
    table.admit(candidate(1), 10);
    const queuedCandidate = candidate(2, {deadlineAtMs: 50});
    const queued = table.admit(queuedCandidate, 10);
    assert.equal(queued.status, 'queued');
    const drained = table.drain(50);
    assert.deepEqual(drained.ready, []);
    assert.equal(drained.expired.length, 1);
    assert.equal(drained.expired[0].ticket, queued.ticket);
    assert.deepEqual(drained.expired[0].outcome, {
      status: 'retryable_failure',
      errorCode: 'queue_deadline_expired',
    });
    assert.deepEqual(table.admit(candidate(3, {deadlineAtMs: 50}), 50), {
      status: 'retryable_failure',
      errorCode: 'deadline_before_dispatch',
    });
  });

  it('releases a gate only after an exact durable terminal receipt', () => {
    const table = createOciHostAgentAdmissionTable();
    const admitted = candidate(1);
    const active = table.admit(admitted, 10);
    assert.throws(
      () => table.settle(active.lease, terminalReceipt(candidate(2)), 20),
      /admission_settlement_invalid/u,
    );
    const receipt = terminalReceipt(admitted);
    table.settle(active.lease, receipt, 20);
    assert.deepEqual(table.admit(admitted, 30), {
      status: 'terminal',
      receipt,
    });
    assert.throws(
      () => table.settle(active.lease, receipt, 30),
      /admission_settlement_invalid/u,
    );
  });

  it('rebuilds unresolved resource quarantine and cannot clear it at runtime', () => {
    const fencedIdentity = identity();
    const table = createOciHostAgentAdmissionTable({
      unresolvedFences: [{identity: fencedIdentity}],
    });
    assert.deepEqual(table.admit(candidate(1), 10), {
      status: 'ambiguous',
      errorCode: 'resource_fenced',
      fenceState: 'mutation_unresolved',
    });
    assert.equal('clearFence' in table, false);
  });

  it('rejects configuration above the sealed hard ceilings', () => {
    for (const options of [
      {maximumDispatched: 33},
      {maximumQueued: 65},
      {maximumQueuedPerNode: 17},
      {maximumQueuedPerResource: 9},
      {maximumDispatched: 0},
    ]) {
      assert.throws(
        () => createOciHostAgentAdmissionTable(options),
        /admission_configuration_invalid/u,
      );
    }
  });
});
