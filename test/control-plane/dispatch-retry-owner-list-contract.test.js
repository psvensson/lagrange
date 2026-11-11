// The two ready-node dispatch-retry consumers of the incomplete-operation
// list contract (incomplete-operation-list-observation.js): the replica
// dispatch service and the membership publication coordinator. Each decides
// on the observation's NAMED state: a DEFERRED owner list is not "no rows"
// (the ready-node replay stays owed), and an answer without a named state is
// refused, never read as an empty list.
//
// The observations are built by the contract's own builders; the readiness
// evidence is the shape the readiness owner publishes while priority spread
// is blocked (the condition under which both consumers ask the owner).
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  SERVICE_STATUS,
  STATE,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {MembershipPublicationCoordinator} from
  '../../src/control-plane/membership-publication-coordinator.js';
import {
  DISPATCH_RETRY_OWNER_LIST,
} from '../../src/control-plane/membership-publication-row-helpers.js';
import {
  buildAnsweredIncompleteOperationListObservation,
  buildDeferredIncompleteOperationListObservation,
} from '../../src/rebalancer/incomplete-operation-list-observation.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  createService,
  initEnv,
} from './replica-dispatch-node-state-update-test-support.js';

const OWNER_NODE_ID = 'node-1';
const READY_NODE_ID = 'node-2';
const BLOCKED_PARTITION_ID = 'replica_operations-p1';
const NO_NAMED_STATE = /without a named state/u;

function readyNodeRow(nowMs) {
  return {
    node_id: READY_NODE_ID,
    status: SERVICE_STATUS.ACTIVE,
    connection_state: STATE.READY,
    last_heartbeat: nowMs,
    ready_lease_expires_at: nowMs + 60000,
  };
}

// Priority spread is blocked on a partition the cache shows no operation
// for: the condition under which a ready-node retry asks the owner.
function blockedSpreadDiagnostics() {
  return {
    publicationEpoch: 14,
    publicationStatus: 'PUBLISHED',
    publishedActiveNodeIds: [OWNER_NODE_ID],
    priorityPartitionSummary: {
      satisfied: false,
      requiredDistinctNodeCount: 2,
      readyEligibleNodeCount: 1,
      blockedPartitions: [{
        partitionId: BLOCKED_PARTITION_ID,
        requiredDistinctNodeCount: 2,
        readyDistinctNodeCount: 1,
        spreadGap: 1,
      }],
      missingPartitionIds: [BLOCKED_PARTITION_ID],
    },
    membershipLifecycleSummary: {
      locallyEligibleNodeIds: [READY_NODE_ID],
      projectedServingNodeIds: [READY_NODE_ID],
    },
  };
}

function pendingOperation() {
  return {
    operationId: 'op-owner-list-1',
    partitionId: BLOCKED_PARTITION_ID,
    entityType: 'partition',
    entityId: BLOCKED_PARTITION_ID,
    type: OperationType.REPLACE,
    sourceNodeId: OWNER_NODE_ID,
    targetNodeId: READY_NODE_ID,
    status: 'pending',
    workflowStep: WORKFLOW_STEP.PENDING,
    stepsHistory: [],
  };
}

function deferredObservation() {
  return buildDeferredIncompleteOperationListObservation({
    completionState: 'incomplete_operation_read_unavailable',
    retryAfterMs: 250,
  });
}

// A repository port that answers what the test hands it and counts asks.
function repositoryAnswering(answers) {
  const repository = {
    asked: 0,
    async queryIncompleteOperations() {
      const answer = answers[Math.min(repository.asked, answers.length - 1)];
      repository.asked += 1;
      return answer;
    },
  };
  return repository;
}

function dispatchServiceOver(repository, nowMs) {
  initEnv();
  const service = createService({
    cacheNodes: [readyNodeRow(nowMs)],
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
          },
        };
      },
      getMembershipPublicationDiagnosticsSync: blockedSpreadDiagnostics,
    },
    rebalanceCoordinator: {
      repository,
      isOperationLocallyOwned: (operation) =>
        (operation?.sourceNodeId ?? operation?.source_node_id) ===
          OWNER_NODE_ID,
    },
  });
  const enqueued = [];
  service.operationDispatchQueue = {
    enqueue(operationId, reason, context) {
      enqueued.push({operationId, reason, context});
    },
  };
  return {service, enqueued};
}

function coordinatorOver(repository) {
  return new MembershipPublicationCoordinator({
    nodeId: OWNER_NODE_ID,
    systemTableCache: {getAll: () => []},
    controlPlaneReadinessService: {
      getMembershipPublicationDiagnosticsSync: blockedSpreadDiagnostics,
    },
    replicaOperationRepository: repository,
  });
}

test('dispatch service: a DEFERRED owner list keeps the ready-node replay owed - the same READY row asks the owner again', async () => {
  const nowMs = Date.now();
  const repository = repositoryAnswering([
    deferredObservation(),
    buildAnsweredIncompleteOperationListObservation([pendingOperation()]),
  ]);
  const {service, enqueued} = dispatchServiceOver(repository, nowMs);
  try {
    const nodeRow = readyNodeRow(nowMs);
    assert.equal(await service.retryPendingDispatchesForReadyNode(
      {nodeId: READY_NODE_ID, nodeRow}), true);
    assert.equal(repository.asked, 1, 'the owner was asked once');
    assert.deepEqual(enqueued, [], 'a DEFERRED list replays nothing');

    // The same READY row again (no newer heartbeat): the replay is still
    // owed, so the trigger is not a duplicate.
    assert.equal(await service.retryPendingDispatchesForReadyNode(
      {nodeId: READY_NODE_ID, nodeRow}), true,
    'the replay a DEFERRED owner list left owed runs on the next trigger');
    assert.equal(repository.asked, 2, 'the owner was asked again');
    assert.deepEqual(enqueued.map((entry) => entry.operationId),
      ['op-owner-list-1'], 'the owner\'s answer is replayed');

    // The owner answered: the same READY row is now a duplicate trigger.
    assert.equal(await service.retryPendingDispatchesForReadyNode(
      {nodeId: READY_NODE_ID, nodeRow}), false);
    assert.equal(repository.asked, 2);
  } finally {
    service.stop();
  }
});

test('dispatch service: an owner list that answered empty is a completed replay - the same READY row is a duplicate', async () => {
  const nowMs = Date.now();
  const repository = repositoryAnswering([
    buildAnsweredIncompleteOperationListObservation([]),
  ]);
  const {service, enqueued} = dispatchServiceOver(repository, nowMs);
  try {
    const nodeRow = readyNodeRow(nowMs);
    assert.equal(await service.retryPendingDispatchesForReadyNode(
      {nodeId: READY_NODE_ID, nodeRow}), true);
    assert.equal(await service.retryPendingDispatchesForReadyNode(
      {nodeId: READY_NODE_ID, nodeRow}), false);
    assert.equal(repository.asked, 1);
    assert.deepEqual(enqueued, []);
  } finally {
    service.stop();
  }
});

test('dispatch service: an owner answer without a named state is refused, not read as no rows', async () => {
  for (const malformed of [
    [pendingOperation()],
    {operations: []},
    {operations: [pendingOperation()], complete: true},
  ]) {
    const {service} = dispatchServiceOver(
      repositoryAnswering([malformed]), Date.now());
    try {
      await assert.rejects(
        service.getAuthoritativeDispatchRetryRowsForNode(READY_NODE_ID),
        NO_NAMED_STATE);
    } finally {
      service.stop();
    }
  }
});

test('publication coordinator: the dispatch-retry answer names what the owner list said', async () => {
  const deferred = await coordinatorOver(
    repositoryAnswering([deferredObservation()]))
    .getDispatchRetryRowsForNode(READY_NODE_ID);
  assert.equal(deferred.ownerList, DISPATCH_RETRY_OWNER_LIST.DEFERRED);
  assert.deepEqual(deferred.rows, [], 'a DEFERRED list adds no row');
  assert.equal(deferred.deferredOutcome.retryAfterMs, 250,
    'the answer carries the owner\'s deferred outcome');

  const answered = await coordinatorOver(repositoryAnswering([
    buildAnsweredIncompleteOperationListObservation([pendingOperation()]),
  ])).getDispatchRetryRowsForNode(READY_NODE_ID);
  assert.equal(answered.ownerList, DISPATCH_RETRY_OWNER_LIST.ANSWERED);
  assert.deepEqual(answered.rows.map((row) => row.operation_id),
    ['op-owner-list-1']);

  const empty = await coordinatorOver(repositoryAnswering([
    buildAnsweredIncompleteOperationListObservation([]),
  ])).getDispatchRetryRowsForNode(READY_NODE_ID);
  assert.equal(empty.ownerList, DISPATCH_RETRY_OWNER_LIST.ANSWERED);
  assert.deepEqual(empty.rows, []);

  // No priority recovery evidence: the owner is not asked.
  const repository = repositoryAnswering([deferredObservation()]);
  const notAsked = await new MembershipPublicationCoordinator({
    nodeId: OWNER_NODE_ID,
    systemTableCache: {getAll: () => []},
    replicaOperationRepository: repository,
  }).getDispatchRetryRowsForNode(READY_NODE_ID);
  assert.equal(notAsked.ownerList, DISPATCH_RETRY_OWNER_LIST.NOT_ASKED);
  assert.equal(repository.asked, 0);
});

test('publication coordinator: an owner answer without a named state is refused, not read as no rows', async () => {
  for (const malformed of [
    [pendingOperation()],
    {operations: []},
  ]) {
    await assert.rejects(
      coordinatorOver(repositoryAnswering([malformed]))
        .getDispatchRetryRowsForNode(READY_NODE_ID),
      NO_NAMED_STATE);
  }
});

test('dispatch service over the real coordinator: the coordinator\'s DEFERRED answer keeps the replay owed', async () => {
  const nowMs = Date.now();
  const repository = repositoryAnswering([deferredObservation()]);
  initEnv();
  const coordinator = coordinatorOver(repository);
  const service = createService({
    cacheNodes: [readyNodeRow(nowMs)],
    cdcIntegrationService: {
      updateSystemTableRow: async () => ({success: true}),
      upsertSystemTableRow: async () => ({success: true}),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
          },
        };
      },
      // The dispatch layer sees no priority-recovery evidence of its own:
      // only the coordinator asks the owner.
      membershipPublicationService: coordinator,
    },
    rebalanceCoordinator: {repository},
  });
  try {
    const nodeRow = readyNodeRow(nowMs);
    assert.equal(await service.retryPendingDispatchesForReadyNode(
      {nodeId: READY_NODE_ID, nodeRow}), true);
    const askedAfterFirst = repository.asked;
    assert.ok(askedAfterFirst >= 1, 'the coordinator asked the owner');
    assert.equal(await service.retryPendingDispatchesForReadyNode(
      {nodeId: READY_NODE_ID, nodeRow}), true,
    'the same READY row is not a duplicate while the owner list is DEFERRED');
    assert.ok(repository.asked > askedAfterFirst, 'the owner was asked again');
  } finally {
    service.stop();
    coordinator.stopOwnerMembershipDriver();
  }
});
