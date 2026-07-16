import {test} from '../../src/test-helpers/tap.js';
import {
  buildPriorityRecoveryDecisionSnapshots,
} from '../../src/control-plane/priority-recovery-snapshot.js';
import {UnifiedRebalancer} from '../../src/rebalancer/unified-rebalancer.js';

const CONTROL_PLANE_PUBLICATIONS_PARTITION_ID =
  'control_plane_publications-p1';
const SCHEMA_OPERATIONS_PARTITION_ID = 'schema_operations-p1';
const SQL_WRITE_OPERATIONS_PARTITION_ID = 'sql_write_operations-p1';
const NODE_A = 'node-a';
const NODE_B = 'node-b';
const NODE_C = 'node-c';
const NODE_D = 'node-d';
const PRIORITY_RECOVERY_NEEDS_OPERATION = 'needs_operation';
const RAFT_ROLE_LEADER = 'leader';
const SERVICE_STATUS_ACTIVE = 'active';

function buildBlockedPriorityPartitionSummary(partitionId) {
  return Object.freeze({
    satisfied: false,
    requiredDistinctNodeCount: 3,
    readyEligibleNodeCount: 4,
    blockedPartitions: Object.freeze([Object.freeze({
      partitionId,
      readyReplicaCount: 3,
      readyDistinctNodeCount: 1,
      requiredDistinctNodeCount: 3,
      spreadGap: 2,
    })]),
  });
}

function buildLeaderServiceRow(partitionId, nodeId = NODE_A) {
  return Object.freeze({
    partition_id: partitionId,
    node_id: nodeId,
    raft_role: RAFT_ROLE_LEADER,
    status: SERVICE_STATUS_ACTIVE,
  });
}

function buildPlanningSnapshot({
  targetPartitionId = SQL_WRITE_OPERATIONS_PARTITION_ID,
  serviceRows = [],
  availableNodeIds = [NODE_A, NODE_B, NODE_C, NODE_D],
} = {}) {
  const priorityPartitionSummary =
    buildBlockedPriorityPartitionSummary(targetPartitionId);
  const priorityRecoveryDecisionSnapshots =
    buildPriorityRecoveryDecisionSnapshots({
      capturedAt: 1,
      publicationConvergence: {
        publicationEpoch: 1,
        publishedActiveNodeIds: availableNodeIds,
        recoveryActiveNodeIds: availableNodeIds,
        priorityPartitionSummary,
      },
      readinessByNodeId: {},
      workflowAdmissionsByWorkflowId: {},
      replicaOperationRows: [],
      serviceRows,
    });
  return Object.freeze({
    priorityPartitionSummary,
    priorityRecoveryDecisionSnapshots,
    priorityRecoveryClosureWitness:
      priorityRecoveryDecisionSnapshots.closureWitness,
  });
}

function findDecisionSnapshot(planningSnapshot, partitionId) {
  return planningSnapshot.priorityRecoveryDecisionSnapshots.snapshots.find(
    (snapshot) => snapshot.partitionId === partitionId,
  );
}

function createDecisionConsumer(entityId, targetPartitionId) {
  const rebalancer = Object.create(UnifiedRebalancer.prototype);
  rebalancer.entityId = entityId;
  rebalancer.isControlPlanePriorityPartition = () => true;
  rebalancer.resolvePriorityRecoveryClosureWitnessFollowUpPartitionId = () =>
    targetPartitionId;
  rebalancer.resolvePriorityRecoveryFollowUpPartitionId = (snapshot) =>
    snapshot?.partitionId || snapshot?.decisionSnapshot?.partitionId || '';
  rebalancer.normalizePriorityRecoverySurrogateFollowUpDecisionSnapshot =
    (planningSnapshot, partitionId) =>
      findDecisionSnapshot(planningSnapshot, partitionId) || null;
  rebalancer.isPriorityRecoveryFollowUpOperationRequired = (snapshot) =>
    snapshot?.semanticState === PRIORITY_RECOVERY_NEEDS_OPERATION;
  rebalancer.buildPriorityRecoverySurrogateDecisionFromPlanning = () => null;
  return rebalancer;
}

function acceptedSurrogateOwnerIds(planningSnapshot, targetPartitionId) {
  return [
    CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
    SCHEMA_OPERATIONS_PARTITION_ID,
  ].filter((entityId) => {
    const consumer = createDecisionConsumer(entityId, targetPartitionId);
    return consumer.buildPriorityRecoverySurrogateFollowUpDecisions(
      planningSnapshot,
    ).length === 1;
  });
}

test('priority recovery snapshot assigns an ownerless target to one live ' +
  'surrogate owner before consumers build moves', (t) => {
  const forwardServiceRows = [
    buildLeaderServiceRow(SCHEMA_OPERATIONS_PARTITION_ID),
    buildLeaderServiceRow(CONTROL_PLANE_PUBLICATIONS_PARTITION_ID),
  ];
  const forwardSnapshot = buildPlanningSnapshot({
    serviceRows: forwardServiceRows,
  });
  const reversedSnapshot = buildPlanningSnapshot({
    serviceRows: [...forwardServiceRows].reverse(),
  });
  const forwardDecision = findDecisionSnapshot(
    forwardSnapshot,
    SQL_WRITE_OPERATIONS_PARTITION_ID,
  );
  const reversedDecision = findDecisionSnapshot(
    reversedSnapshot,
    SQL_WRITE_OPERATIONS_PARTITION_ID,
  );

  t.same(
    forwardDecision.schedulingOwner,
    {
      partitionId: CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
      mode: 'surrogate_owner',
      candidatePartitionIds: [
        CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
        SCHEMA_OPERATIONS_PARTITION_ID,
      ],
      evidenceSource: 'live_priority_partition_leaders',
    },
    'the snapshot declares the deterministic live fallback owner as data',
  );
  t.same(
    reversedDecision.schedulingOwner,
    forwardDecision.schedulingOwner,
    'service-row input order cannot change the declared owner',
  );
  t.same(
    acceptedSurrogateOwnerIds(
      forwardSnapshot,
      SQL_WRITE_OPERATIONS_PARTITION_ID,
    ),
    [CONTROL_PLANE_PUBLICATIONS_PARTITION_ID],
    'only the declared rebalancer consumes the cluster-wide surrogate',
  );
  t.end();
});

test('priority recovery snapshot keeps ordinary recovery with the live ' +
  'current partition owner', (t) => {
  const planningSnapshot = buildPlanningSnapshot({
    serviceRows: [
      buildLeaderServiceRow(SQL_WRITE_OPERATIONS_PARTITION_ID),
      buildLeaderServiceRow(CONTROL_PLANE_PUBLICATIONS_PARTITION_ID),
    ],
  });
  const decision = findDecisionSnapshot(
    planningSnapshot,
    SQL_WRITE_OPERATIONS_PARTITION_ID,
  );
  const currentOwner = createDecisionConsumer(
    SQL_WRITE_OPERATIONS_PARTITION_ID,
    SQL_WRITE_OPERATIONS_PARTITION_ID,
  );
  const nonOwner = createDecisionConsumer(
    CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
    SQL_WRITE_OPERATIONS_PARTITION_ID,
  );

  t.equal(
    decision.schedulingOwner?.partitionId,
    SQL_WRITE_OPERATIONS_PARTITION_ID,
    'the live target leader remains the direct scheduling owner',
  );
  t.equal(
    decision.schedulingOwner?.mode,
    'current_owner',
    'the snapshot distinguishes direct work from fallback work',
  );
  t.equal(
    currentOwner.buildPriorityRecoverySurrogateFollowUpDecisions(
      planningSnapshot,
    ).length,
    1,
    'the current owner still receives its required recovery decision',
  );
  t.equal(
    nonOwner.buildPriorityRecoverySurrogateFollowUpDecisions(
      planningSnapshot,
    ).length,
    0,
    'a non-owner cannot duplicate the current owner decision',
  );
  t.end();
});

test('priority recovery snapshot excludes leaders outside the available ' +
  'recovery cohort from surrogate ownership', (t) => {
  const planningSnapshot = buildPlanningSnapshot({
    availableNodeIds: [NODE_B, NODE_C, NODE_D],
    serviceRows: [
      buildLeaderServiceRow(
        CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
        NODE_A,
      ),
      buildLeaderServiceRow(SCHEMA_OPERATIONS_PARTITION_ID, NODE_B),
      buildLeaderServiceRow(SQL_WRITE_OPERATIONS_PARTITION_ID, NODE_A),
    ],
  });
  const decision = findDecisionSnapshot(
    planningSnapshot,
    SQL_WRITE_OPERATIONS_PARTITION_ID,
  );

  t.same(
    decision.schedulingOwner,
    {
      partitionId: SCHEMA_OPERATIONS_PARTITION_ID,
      mode: 'surrogate_owner',
      candidatePartitionIds: [SCHEMA_OPERATIONS_PARTITION_ID],
      evidenceSource: 'live_priority_partition_leaders',
    },
    'an unavailable target or lexical leader cannot strand the owner decision',
  );
  t.same(
    acceptedSurrogateOwnerIds(
      planningSnapshot,
      SQL_WRITE_OPERATIONS_PARTITION_ID,
    ),
    [SCHEMA_OPERATIONS_PARTITION_ID],
    'only an available declared surrogate may consume the decision',
  );
  t.end();
});
