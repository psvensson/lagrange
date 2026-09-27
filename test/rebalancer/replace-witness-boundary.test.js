/**
 * Distributed trust-boundary contract for REPLACE membership reads.
 * Transport acknowledgement is not semantic processing, and a completed
 * handler response is not membership authority until its exact shape is
 * decoded.
 */

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {SERVICE_TYPE, WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType} from
  '../../src/rebalancer/replica-operation-progress.js';
import {
  ReplaceWitnessDeliveryOutcome,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  decideReplaceCompletion,
} from '../../src/rebalancer/operation-workflow-replace-owner.js';
import {
  deliverToReplaceWitness,
  readReplaceWitnessMembership,
} from '../../src/rebalancer/operation-workflow-replace-witness.js';
import {PARTITION_REPLICA_MEMBERSHIP_STATE} from
  '../../src/partition/partition-replica-membership-constants.js';
import {
  OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE,
  ROUTER_NO_CONNECTION_ERROR_CODE,
} from '../../src/transport/message-router-shared-vocabulary.js';

function operation() {
  return {
    operationId: 'replace-witness-boundary-op',
    type: OperationType.REPLACE,
    entityType: SERVICE_TYPE.PARTITION,
    entityId: 'replace-witness-boundary-p1',
    partitionId: 'replace-witness-boundary-p1',
    sourceNodeId: 'node-a',
    targetNodeId: 'node-b',
    replicaId: 'replace-witness-boundary-r2',
    workflowStep: WORKFLOW_STEP.STOPPING,
    stepsHistory: [{
      replaceRemovalIntent: true,
      replaceWitnessCommitIndex: 7,
    }],
  };
}

function owner(answer) {
  return {
    repository: {
      getReplaceSourceReplicaId: () => 'replace-witness-boundary-r1',
      getReplaceTargetReplicaId: () => 'replace-witness-boundary-r2',
      getObservedReplicaStatusFromCache: () => 'active',
    },
    getCachedCriticalReplicaRows: () => [],
    messageRouter: {deliver: async () => answer},
  };
}

function membership(overrides = {}) {
  return {
    state: PARTITION_REPLICA_MEMBERSHIP_STATE.ABSENT,
    replicaId: 'replace-witness-boundary-r2',
    partitionId: 'replace-witness-boundary-p1',
    leaderReplicaId: 'replace-witness-boundary-r2',
    voterReplicaIds: ['replace-witness-boundary-r2'],
    votersOutgoingReplicaIds: [],
    appliedIndex: 7,
    commitIndex: 7,
    term: 2,
    gateOpen: true,
    transferWindowMaxMs: 300,
    ...overrides,
  };
}

test('ACK-before-handler-lookup remains a named deferred delivery with its ' +
  'retry contract', async () => {
  const answer = {
    acknowledged: true,
    noHandler: true,
    deferRetry: true,
    retryAfterMs: 250,
  };
  const target = owner(answer);
  const delivered = await deliverToReplaceWitness(
    target, operation(), 'READ_REPLICA_MEMBERSHIP');
  assert.equal(delivered.outcome,
    ReplaceWitnessDeliveryOutcome.DELIVERY_DEFERRED);
  assert.equal(delivered.reason, 'no_handler');
  assert.equal(delivered.deferRetry, true);
  assert.equal(delivered.retryAfterMs, 250);
  const observation = await readReplaceWitnessMembership(target, operation());
  assert.equal(observation.state,
    PARTITION_REPLICA_MEMBERSHIP_STATE.UNAVAILABLE);
  assert.equal(observation.reason, 'no_handler');
  assert.equal(observation.deferRetry, true);
  assert.equal(observation.retryAfterMs, 250);
});

test('malformed completed membership answers fail closed across numeric and ' +
  'object-shape classes', async () => {
  const base = membership();
  const cases = [
    {...base, term: 'Infinity', appliedIndex: 'Infinity',
      commitIndex: 'Infinity'},
    {...base, commitIndex: NaN},
    {...base, appliedIndex: -0},
    {...base, voterReplicaIds: [Object(base.replicaId)]},
    {...base, voterReplicaIds: [base.replicaId, base.replicaId]},
    Object.create(base),
  ];
  for (const malformed of cases) {
    const target = owner({
      acknowledged: true,
      status: ReplicaOperationResponseStatus.COMPLETED,
      membership: malformed,
    });
    const decision = await decideReplaceCompletion(target, operation());
    assert.notEqual(decision.verdict, 'source_retired');
    assert.equal(decision.observation.state,
      PARTITION_REPLICA_MEMBERSHIP_STATE.UNAVAILABLE);
  }
});

test('valid-shaped membership is bound to the addressed replica and operation ' +
  'partition', async () => {
  const cases = [
    membership({replicaId: 'other-partition-r9'}),
    membership({partitionId: 'other-partition-p9'}),
  ];
  for (const mismatched of cases) {
    const target = owner({
      acknowledged: true,
      status: ReplicaOperationResponseStatus.COMPLETED,
      membership: mismatched,
    });
    const decision = await decideReplaceCompletion(target, operation());
    assert.notEqual(decision.verdict, 'source_retired');
    assert.equal(decision.observation.state,
      PARTITION_REPLICA_MEMBERSHIP_STATE.UNAVAILABLE);
  }
});

test('ACK cannot expose an application-looking witness across contradictory ' +
  'transport metadata', async () => {
  const cases = [
    {deferRetry: true, retryAfterMs: 25},
    {errorCode: 'ROUTER_CONNECTION_CLOSED'},
    {errorCode: ROUTER_NO_CONNECTION_ERROR_CODE},
    {errorCode: OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE},
    {deliveryState: 'failed'},
    {error: 'connection failed'},
  ];
  for (const conflict of cases) {
    const target = owner({
      acknowledged: true,
      status: ReplicaOperationResponseStatus.COMPLETED,
      membership: membership(),
      ...conflict,
    });
    const decision = await decideReplaceCompletion(target, operation());
    assert.notEqual(decision.verdict, 'source_retired');
    assert.equal(decision.observation.state,
      PARTITION_REPLICA_MEMBERSHIP_STATE.UNAVAILABLE);
  }
});
