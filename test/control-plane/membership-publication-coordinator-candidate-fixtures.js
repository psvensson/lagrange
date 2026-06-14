import {test} from '../../src/test-helpers/tap.js';
import {
  deriveMembershipPublicationCandidate,
  MembershipPublicationCoordinator,
} from '../../src/control-plane/membership-publication-coordinator.js';
import {
  MEMBERSHIP_LIFECYCLE_STATE,
  isValidMembershipLifecycleTransition,
} from '../../src/control-plane/membership-lifecycle-constants.js';
import {CONTROL_PLANE_PRIORITY_RECOVERY_REASON} from '../../src/control-plane/control-plane-readiness-constants.js';
const MEMBERSHIP_PUBLICATION_ADMISSION_STATE_BLOCKED = 'blocked';

const MEMBERSHIP_PUBLICATION_ADMISSION_REASON_CLUSTER_INTEGRITY =
  'cluster_incarnation_identity_mismatch';

const MEMBERSHIP_PUBLICATION_BLOCKED_FENCE = Object.freeze({
  state: 'identity_mismatch',
  allowed: false,
  reasonCodes: Object.freeze([
    MEMBERSHIP_PUBLICATION_ADMISSION_REASON_CLUSTER_INTEGRITY,
  ]),
});

const MEMBERSHIP_PUBLICATION_CLOSURE_RECORD_ID_PRIORITY_SPREAD =
  'CL-003';

const MEMBERSHIP_PUBLICATION_CLOSURE_WITNESS_CLASS_PRIORITY_SPREAD =
  'publication_converged_priority_spread_pending';

const MEMBERSHIP_PUBLICATION_RECOVERY_PROTOCOL_STATE_STEADY_PUBLISHED =
  'steady_published';

const MEMBERSHIP_PUBLICATION_PRIORITY_DECISION_SNAPSHOT_ASSERTION =
  'priority recovery decision snapshots should remain available to planning consumers';

const MEMBERSHIP_PUBLICATION_TRIM_PUBLISHER_NODE_ID = 'seed-node';

const MEMBERSHIP_PUBLICATION_TRIM_NODE_ONE_ID = 'node-1';

const MEMBERSHIP_PUBLICATION_TRIM_NODE_TWO_ID = 'node-2';

const MEMBERSHIP_PUBLICATION_TRIM_NODE_THREE_ID = 'node-3';

const MEMBERSHIP_PUBLICATION_TRIM_STALE_NODE_FOUR_ID = 'node-4';

const MEMBERSHIP_PUBLICATION_TRIM_STALE_NODE_FIVE_ID = 'node-5';

const MEMBERSHIP_PUBLICATION_TRIM_ENDPOINT_SUFFIX = '-ws';

const MEMBERSHIP_PUBLICATION_TRIM_SERVICE_PREFIX = 'svc-';

const MEMBERSHIP_PUBLICATION_TRIM_WS_ADDRESS_PREFIX = 'ws://';

const MEMBERSHIP_PUBLICATION_TRIM_WS_ADDRESS_SUFFIX = ':8082';

const MEMBERSHIP_PUBLICATION_TRIM_STATUS_PUBLISHED = 'PUBLISHED';

const MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_STATUS_ACK_PENDING = 'ACK_PENDING';

const MEMBERSHIP_PUBLICATION_TRIM_NODE_STATUS_ACTIVE = 'active';

const MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_CONNECTION_STATE_CONNECTED =
  'connected';

const MEMBERSHIP_PUBLICATION_TRIM_CONNECTION_STATE_READY = 'ready';

const MEMBERSHIP_PUBLICATION_TRIM_TRANSPORT_WS = 'ws';

const MEMBERSHIP_PUBLICATION_TRIM_PUBLICATION_EPOCH = 7;

const MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLICATION_EPOCH = 17;

const MEMBERSHIP_PUBLICATION_TRIM_NEXT_PUBLICATION_EPOCH = 8;

const MEMBERSHIP_PUBLICATION_TRIM_READY_LEASE_EXPIRES_AT = 5000;

const MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_READY_LEASE_EXPIRES_AT = 0;

const MEMBERSHIP_PUBLICATION_TRIM_NOW_MS = 1000;

const MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_NOW_MS = 1000;

const MEMBERSHIP_PUBLICATION_TRIM_READY_DISTINCT_NODE_COUNT = 3;

const MEMBERSHIP_PUBLICATION_TRIM_TOTAL_PRIORITY_PARTITION_COUNT = 5;

const MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHER_NODE_ID = 'seed-node';

const MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID = 'node-1';

const MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PROCESS_DEAD_NODE_ID = 'node-2';

const MEMBERSHIP_PUBLICATION_TRIM_CANDIDATE_NODE_IDS = Object.freeze([
  MEMBERSHIP_PUBLICATION_TRIM_NODE_ONE_ID,
  MEMBERSHIP_PUBLICATION_TRIM_NODE_TWO_ID,
  MEMBERSHIP_PUBLICATION_TRIM_NODE_THREE_ID,
]);

const MEMBERSHIP_PUBLICATION_TRIM_STALE_PUBLISHED_NODE_IDS = Object.freeze([
  ...MEMBERSHIP_PUBLICATION_TRIM_CANDIDATE_NODE_IDS,
  MEMBERSHIP_PUBLICATION_TRIM_STALE_NODE_FOUR_ID,
  MEMBERSHIP_PUBLICATION_TRIM_STALE_NODE_FIVE_ID,
]);

const MEMBERSHIP_PUBLICATION_RECONCILE_PUBLICATION_ID = 'publication-epoch-3';

const MEMBERSHIP_PUBLICATION_RECONCILE_KIND = 'cluster_membership';

const MEMBERSHIP_PUBLICATION_RECONCILE_RECOVERY_ACTIVE_SOURCE =
  'locally_eligible_projection';

const MEMBERSHIP_PUBLICATION_RECONCILE_STALE_RECOVERY_ACTIVE_SOURCE =
  'published_membership';

const MEMBERSHIP_PUBLICATION_RECONCILE_STALE_READINESS_DECISION_MODE =
  'cluster_member_healthy_only';

const MEMBERSHIP_PUBLICATION_RECONCILE_STALE_READINESS_DIMENSION =
  'clusterMemberHealthy';

const MEMBERSHIP_PUBLICATION_RECONCILE_TEST_NAME =
  'reconcileClusterMembership keeps epoch 3 published-active 3/5 when ' +
  'active-gate best progress observes 5/5';

const MEMBERSHIP_PUBLICATION_RECONCILE_READINESS_ASSERTION =
  'the fixture should expose five active-gate-ready nodes to planning readiness';

const MEMBERSHIP_PUBLICATION_RECONCILE_TARGET_ASSERTION =
  'the publication target should stay on the durable owner baseline';

const MEMBERSHIP_PUBLICATION_RECONCILE_PERSIST_ASSERTION =
  'unchanged membership should refresh lifecycle metadata without widening the durable epoch';

const MEMBERSHIP_PUBLICATION_RECONCILE_LIFECYCLE_ASSERTION =
  'metadata refresh should carry the lifecycle owner-truth cohort';

const MEMBERSHIP_PUBLICATION_RECONCILE_ROW_ASSERTION =
  'the reconcile result should return the existing published epoch';

const MEMBERSHIP_PUBLICATION_RECONCILE_PUBLICATION_EPOCH = 3;

const MEMBERSHIP_PUBLICATION_RECONCILE_ROW_UPDATED_AT_MS = 3000;

const MEMBERSHIP_PUBLICATION_RECONCILE_NOW_MS = 3500;

const MEMBERSHIP_PUBLICATION_RECONCILE_EMPTY_ROWS = Object.freeze([]);

const MEMBERSHIP_PUBLICATION_RECONCILE_BASELINE_NODE_IDS = Object.freeze([
  MEMBERSHIP_PUBLICATION_TRIM_NODE_ONE_ID,
  MEMBERSHIP_PUBLICATION_TRIM_NODE_TWO_ID,
  MEMBERSHIP_PUBLICATION_TRIM_NODE_THREE_ID,
]);

const MEMBERSHIP_PUBLICATION_RECONCILE_ACTIVE_GATE_NODE_IDS = Object.freeze([
  ...MEMBERSHIP_PUBLICATION_RECONCILE_BASELINE_NODE_IDS,
  MEMBERSHIP_PUBLICATION_TRIM_STALE_NODE_FOUR_ID,
  MEMBERSHIP_PUBLICATION_TRIM_STALE_NODE_FIVE_ID,
]);

const MEMBERSHIP_PUBLICATION_RECONCILE_MISSING_RECOVERY_NODE_IDS =
  Object.freeze(
    MEMBERSHIP_PUBLICATION_RECONCILE_ACTIVE_GATE_NODE_IDS.filter(
      (nodeId) =>
        !MEMBERSHIP_PUBLICATION_RECONCILE_BASELINE_NODE_IDS.includes(nodeId),
    ),
  );

function buildMembershipPublicationReconcileBaselineRow() {
  return {
    publication_id: MEMBERSHIP_PUBLICATION_RECONCILE_PUBLICATION_ID,
    publication_kind: MEMBERSHIP_PUBLICATION_RECONCILE_KIND,
    publication_epoch: MEMBERSHIP_PUBLICATION_RECONCILE_PUBLICATION_EPOCH,
    published_active_node_ids: [
      ...MEMBERSHIP_PUBLICATION_RECONCILE_BASELINE_NODE_IDS,
    ],
    required_ack_node_ids: [
      ...MEMBERSHIP_PUBLICATION_RECONCILE_BASELINE_NODE_IDS,
    ],
    acknowledged_node_ids: [
      ...MEMBERSHIP_PUBLICATION_RECONCILE_BASELINE_NODE_IDS,
    ],
    status: MEMBERSHIP_PUBLICATION_TRIM_STATUS_PUBLISHED,
    updated_at: MEMBERSHIP_PUBLICATION_RECONCILE_ROW_UPDATED_AT_MS,
    published_at: MEMBERSHIP_PUBLICATION_RECONCILE_ROW_UPDATED_AT_MS,
    closed_at: MEMBERSHIP_PUBLICATION_RECONCILE_ROW_UPDATED_AT_MS,
    membership_lifecycle_summary: {
      lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE,
      publishedActiveNodeIds: [
        ...MEMBERSHIP_PUBLICATION_RECONCILE_BASELINE_NODE_IDS,
      ],
      projectedServingNodeIds: [
        ...MEMBERSHIP_PUBLICATION_RECONCILE_BASELINE_NODE_IDS,
      ],
      locallyEligibleNodeIds: [
        ...MEMBERSHIP_PUBLICATION_RECONCILE_BASELINE_NODE_IDS,
      ],
      recoveryActiveNodeIds: [
        ...MEMBERSHIP_PUBLICATION_RECONCILE_BASELINE_NODE_IDS,
      ],
      recoveryActiveNodeSource:
        MEMBERSHIP_PUBLICATION_RECONCILE_STALE_RECOVERY_ACTIVE_SOURCE,
      missingPublishedRecoveryActiveNodeIds: [],
      projectionDiagnostics: {
        readinessDecisionMode:
          MEMBERSHIP_PUBLICATION_RECONCILE_STALE_READINESS_DECISION_MODE,
        readinessDecisionDimensions: [
          MEMBERSHIP_PUBLICATION_RECONCILE_STALE_READINESS_DIMENSION,
        ],
        recoveryEligibleProjectionEnabled: false,
        recoveryEligibleIncludedNodeIds: [],
        readinessExcludedNodeIds: [],
        clusterMemberUnhealthyExcludedNodeIds: [],
      },
    },
  };
}

function buildMembershipPublicationTrimPriorityPartitionSummary() {
  return {
    satisfied: true,
    requiredDistinctNodeCount:
      MEMBERSHIP_PUBLICATION_TRIM_READY_DISTINCT_NODE_COUNT,
    readyEligibleNodeCount:
      MEMBERSHIP_PUBLICATION_TRIM_READY_DISTINCT_NODE_COUNT,
    totalPriorityPartitionCount:
      MEMBERSHIP_PUBLICATION_TRIM_TOTAL_PRIORITY_PARTITION_COUNT,
    missingPartitionIds: [],
    blockedPartitions: [],
  };
}

function buildMembershipPublicationTrimNodeRow(nodeId) {
  return {
    node_id: nodeId,
    status: MEMBERSHIP_PUBLICATION_TRIM_NODE_STATUS_ACTIVE,
    connection_state: MEMBERSHIP_PUBLICATION_TRIM_CONNECTION_STATE_READY,
    ready_lease_expires_at:
      MEMBERSHIP_PUBLICATION_TRIM_READY_LEASE_EXPIRES_AT,
  };
}

function buildMembershipPublicationTrimReadinessEntry(nodeId) {
  return {
    nodeId,
    dimensions: {clusterMemberHealthy: true},
  };
}

function buildMembershipPublicationTrimEndpointRow(nodeId) {
  return {
    endpoint_id: nodeId + MEMBERSHIP_PUBLICATION_TRIM_ENDPOINT_SUFFIX,
    node_id: nodeId,
    transport_type: MEMBERSHIP_PUBLICATION_TRIM_TRANSPORT_WS,
    status: MEMBERSHIP_PUBLICATION_TRIM_NODE_STATUS_ACTIVE,
    address:
      MEMBERSHIP_PUBLICATION_TRIM_WS_ADDRESS_PREFIX +
      nodeId +
      MEMBERSHIP_PUBLICATION_TRIM_WS_ADDRESS_SUFFIX,
  };
}

function buildMembershipPublicationTrimServiceRow(nodeId) {
  return {
    service_id: MEMBERSHIP_PUBLICATION_TRIM_SERVICE_PREFIX + nodeId,
    node_id: nodeId,
    status: MEMBERSHIP_PUBLICATION_TRIM_NODE_STATUS_ACTIVE,
  };
}

function buildMembershipPublicationAckDeferralNodeRow(nodeId, connectionState) {
  return {
    node_id: nodeId,
    status: MEMBERSHIP_PUBLICATION_TRIM_NODE_STATUS_ACTIVE,
    connection_state: connectionState,
    ready_lease_expires_at:
      MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_READY_LEASE_EXPIRES_AT,
  };
}

test('membership lifecycle model encodes the hard-cutover publication transitions',
  async (t) => {
    t.equal(
      isValidMembershipLifecycleTransition(
        MEMBERSHIP_LIFECYCLE_STATE.CAUGHT_UP,
        MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING,
      ),
      true,
      'caught-up members should be allowed to enter the publish-pending state',
    );
    t.equal(
      isValidMembershipLifecycleTransition(
        MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING,
        MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE,
      ),
      true,
      'publish-pending members should be allowed to become published active',
    );
    t.equal(
      isValidMembershipLifecycleTransition(
        MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE,
        MEMBERSHIP_LIFECYCLE_STATE.ADMITTED,
      ),
      false,
      'published-active members should not regress to admitted',
    );
  });

test('deriveMembershipPublicationCandidate increments publication epochs monotonically when the active membership changes',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      sourceTopologyEpoch: 11,
      sourceSnapshotVersion: 19,
      latestPublicationRow: {
        publication_epoch: 7,
        published_active_node_ids: ['node-1'],
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {nodeId: 'node-1', dimensions: {clusterMemberHealthy: true}},
        {nodeId: 'node-2', dimensions: {clusterMemberHealthy: true}},
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.equal(
      candidate.publicationEpoch,
      8,
      'publication epochs should advance from the last durable epoch when the canonical active set changes',
    );
    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2'],
      'the candidate should carry the canonical active node set forward in sorted order',
    );
    t.match(
      candidate.membershipLifecycleSummary,
      {
        lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING,
        publishedActiveNodeIds: ['node-1', 'node-2'],
        projectedServingNodeIds: ['node-1', 'node-2'],
        locallyEligibleNodeIds: ['node-1', 'node-2'],
        memberStatesByNodeId: {
          'node-1': 'serving',
          'node-2': 'joining',
        },
      },
      'new publication candidates should carry an explicit publish-pending lifecycle summary',
    );
  });

test('MembershipPublicationCoordinator resolves control-plane publications owner from membership publication runtime owner',
  async (t) => {
    const publicationsOwner = {
      upsertPublication: async () => ({success: true}),
    };
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: 'node-1',
      membershipPublicationRuntimeOwner: {
        getControlPlanePublicationsOwner: () => publicationsOwner,
      },
    });

    t.equal(
      coordinator.controlPlanePublicationsOwner,
      publicationsOwner,
      'steady-state publication paths should reuse the membership runtime owner surface when provided',
    );
  });

test('deriveMembershipPublicationCandidate trims stale published members after recovery projection settles',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: MEMBERSHIP_PUBLICATION_TRIM_PUBLISHER_NODE_ID,
      latestPublicationRow: {
        publication_epoch: MEMBERSHIP_PUBLICATION_TRIM_PUBLICATION_EPOCH,
        status: MEMBERSHIP_PUBLICATION_TRIM_STATUS_PUBLISHED,
        published_active_node_ids: [
          ...MEMBERSHIP_PUBLICATION_TRIM_STALE_PUBLISHED_NODE_IDS,
        ],
        required_ack_node_ids: [
          ...MEMBERSHIP_PUBLICATION_TRIM_STALE_PUBLISHED_NODE_IDS,
        ],
        acknowledged_node_ids: [
          ...MEMBERSHIP_PUBLICATION_TRIM_STALE_PUBLISHED_NODE_IDS,
        ],
        priority_partition_summary:
          buildMembershipPublicationTrimPriorityPartitionSummary(),
      },
      latestPublishedPublicationRow: {
        publication_epoch: MEMBERSHIP_PUBLICATION_TRIM_PUBLICATION_EPOCH,
        status: MEMBERSHIP_PUBLICATION_TRIM_STATUS_PUBLISHED,
        published_active_node_ids: [
          ...MEMBERSHIP_PUBLICATION_TRIM_STALE_PUBLISHED_NODE_IDS,
        ],
        required_ack_node_ids: [
          ...MEMBERSHIP_PUBLICATION_TRIM_STALE_PUBLISHED_NODE_IDS,
        ],
        acknowledged_node_ids: [
          ...MEMBERSHIP_PUBLICATION_TRIM_STALE_PUBLISHED_NODE_IDS,
        ],
        priority_partition_summary:
          buildMembershipPublicationTrimPriorityPartitionSummary(),
      },
      nodeRows: MEMBERSHIP_PUBLICATION_TRIM_CANDIDATE_NODE_IDS.map(
        buildMembershipPublicationTrimNodeRow,
      ),
      readinessEntries: MEMBERSHIP_PUBLICATION_TRIM_CANDIDATE_NODE_IDS.map(
        buildMembershipPublicationTrimReadinessEntry,
      ),
      nodeEndpointRows: MEMBERSHIP_PUBLICATION_TRIM_CANDIDATE_NODE_IDS.map(
        buildMembershipPublicationTrimEndpointRow,
      ),
      serviceRows: MEMBERSHIP_PUBLICATION_TRIM_CANDIDATE_NODE_IDS.map(
        buildMembershipPublicationTrimServiceRow,
      ),
      nowMs: MEMBERSHIP_PUBLICATION_TRIM_NOW_MS,
    });

    t.equal(
      candidate.publicationEpoch,
      MEMBERSHIP_PUBLICATION_TRIM_NEXT_PUBLICATION_EPOCH,
      'trimming stale published members should open a new publication epoch',
    );
    t.same(
      candidate.publishedActiveNodeIds,
      [...MEMBERSHIP_PUBLICATION_TRIM_CANDIDATE_NODE_IDS],
      'the next publication should use the settled serving projection',
    );
    t.same(
      candidate.requiredAckNodeIds,
      [...MEMBERSHIP_PUBLICATION_TRIM_CANDIDATE_NODE_IDS],
      'the trim publication should only require acknowledgements from serving members',
    );
    t.same(
      candidate.acknowledgedNodeIds,
      [...MEMBERSHIP_PUBLICATION_TRIM_CANDIDATE_NODE_IDS],
      'the trim publication should carry forward completed acknowledgements for retained members',
    );
    t.equal(
      candidate.publicationStatus,
      MEMBERSHIP_PUBLICATION_TRIM_STATUS_PUBLISHED,
      'a trim publication with no pending acknowledgement debt should close immediately',
    );
    t.equal(
      candidate.recoveryProtocolState,
      MEMBERSHIP_PUBLICATION_RECOVERY_PROTOCOL_STATE_STEADY_PUBLISHED,
      'the recovery protocol should not keep a fully acknowledged trim epoch pending',
    );
    t.same(
      candidate.recoveryActiveNodeIds,
      [...MEMBERSHIP_PUBLICATION_TRIM_CANDIDATE_NODE_IDS],
      'a settled trim target should replace the stale published recovery cohort',
    );
    t.equal(
      candidate.membershipLifecycleSummary.lifecycleState,
      MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE,
      'the persisted lifecycle summary should match the immediately closed publication',
    );
  });

test('deriveMembershipPublicationCandidate retains healthy connected nodes when endpoint metadata lags',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 7,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1', 'node-2'],
        priority_partition_summary: {
          satisfied: false,
          requiredDistinctNodeCount: 3,
          readyEligibleNodeCount: 2,
          totalPriorityPartitionCount: 5,
          missingPartitionIds: ['control_plane_publications-p1'],
          blockedPartitions: [],
        },
      },
      latestPublishedPublicationRow: {
        publication_epoch: 7,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1', 'node-2'],
        priority_partition_summary: {
          satisfied: false,
          requiredDistinctNodeCount: 3,
          readyEligibleNodeCount: 2,
          totalPriorityPartitionCount: 5,
          missingPartitionIds: ['control_plane_publications-p1'],
          blockedPartitions: [],
        },
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          nodeEvidence: {
            transportConnected: true,
          },
          dimensions: {clusterMemberHealthy: true},
        },
        {
          nodeId: 'node-2',
          nodeEvidence: {
            transportConnected: true,
          },
          dimensions: {clusterMemberHealthy: true},
        },
        {
          nodeId: 'node-3',
          nodeEvidence: {
            transportConnected: true,
          },
          dimensions: {
            clusterMemberHealthy: true,
            controlPlaneRecoveryEligible: true,
          },
        },
      ],
      connectedNodeIds: ['node-3'],
      nowMs: 1000,
    });

    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2', 'node-3'],
      'live connected healthy nodes should remain promotable until endpoint metadata catches up',
    );
    t.match(
      candidate.membershipLifecycleSummary,
      {
        projectedServingNodeIds: ['node-1', 'node-2', 'node-3'],
        locallyEligibleNodeIds: ['node-1', 'node-2', 'node-3'],
      },
      'lifecycle diagnostics should preserve the widened connected-node projection',
    );
  });

test('deriveMembershipPublicationCandidate ignores stale published membership when deriving the next active set',
  async (t) => {
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      sourceTopologyEpoch: 11,
      sourceSnapshotVersion: 19,
      latestPublicationRow: {
        publication_epoch: 7,
        published_active_node_ids: ['node-1'],
        required_ack_node_ids: ['node-1'],
        acknowledged_node_ids: ['node-1'],
        status: 'PUBLISHED',
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {nodeId: 'node-1', dimensions: {clusterMemberHealthy: true}},
        {nodeId: 'node-2', dimensions: {clusterMemberHealthy: true}},
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
      ],
      serviceRows: [
        {service_id: 'svc-1', node_id: 'node-1', status: 'active'},
        {service_id: 'svc-2', node_id: 'node-2', status: 'active'},
      ],
      nowMs: 1000,
    });

    t.equal(
      candidate.changed,
      true,
      'a stale published membership row should not suppress detection of newly active members',
    );
    t.equal(
      candidate.publicationEpoch,
      8,
      'the next publication epoch should advance from the stale published epoch',
    );
    t.same(
      candidate.publishedActiveNodeIds,
      ['node-1', 'node-2'],
      'the next publication candidate should be derived from current active members instead of the stale published set',
    );
  });

test('deriveMembershipPublicationCandidate refreshes stale priority spread metadata from in-flight replace evidence',
  async (t) => {
    const priorityTableIds = [
      'control_plane_publications',
      'replica_operations',
      'sql_transaction_participants',
      'sql_transactions',
      'sql_write_operations',
    ];
    const stalePriorityPartitionSummary = {
      satisfied: false,
      requiredDistinctNodeCount: 3,
      readyEligibleNodeCount: 3,
      totalPriorityPartitionCount: priorityTableIds.length,
      missingPartitionIds: priorityTableIds.map((tableId) => `${tableId}-p1`),
      blockedPartitions: priorityTableIds.map((tableId) => ({
        partitionId: `${tableId}-p1`,
        requiredDistinctNodeCount: 3,
        readyDistinctNodeCount: 2,
        spreadGap: 1,
      })),
    };
    const partitionRows = priorityTableIds.map((tableId) => ({
      table_id: tableId,
      table_name: tableId,
      partition_id: `${tableId}-p1`,
      state: 'NORMAL',
    }));
    const serviceRows = priorityTableIds.flatMap((tableId, index) => {
      const partitionId = `${tableId}-p1`;
      return [{
        service_id: `${tableId}-r${index + 1}-a`,
        node_id: 'node-1',
        partition_id: partitionId,
        service_type: 'partition',
        status: 'active',
        raft_role: 'leader',
        address: `node-1/partition/${partitionId}-r1`,
      }, {
        service_id: `${tableId}-r${index + 1}-b`,
        node_id: 'node-2',
        partition_id: partitionId,
        service_type: 'partition',
        status: 'active',
        raft_role: 'follower',
        address: `node-2/partition/${partitionId}-r2`,
      }];
    });
    const replicaOperationRows = priorityTableIds.map((tableId) => ({
      operation_id: `op-refresh-${tableId}`,
      partition_id: `${tableId}-p1`,
      entity_type: 'partition',
      operation_type: 'REPLACE',
      status: 'active',
      workflow_step: 'ACTIVE',
      source_node_id: 'node-2',
      target_node_id: 'node-3',
      replica_id: `${tableId}-p1-r3`,
      created_at: 1000,
      updated_at: 2000,
    }));
    const candidate = deriveMembershipPublicationCandidate({
      publisherNodeId: 'seed-node',
      latestPublicationRow: {
        publication_epoch: 12,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1', 'node-2', 'node-3'],
        required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
        acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
        priority_partition_summary: stalePriorityPartitionSummary,
      },
      latestPublishedPublicationRow: {
        publication_epoch: 12,
        status: 'PUBLISHED',
        published_active_node_ids: ['node-1', 'node-2', 'node-3'],
        required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
        acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
        priority_partition_summary: stalePriorityPartitionSummary,
      },
      nodeRows: [
        {
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
        {
          node_id: 'node-3',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
        },
      ],
      readinessEntries: [
        {
          nodeId: 'node-1',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-2',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
        {
          nodeId: 'node-3',
          dimensions: {
            clusterMemberHealthy: true,
            controlPlanePublished: true,
            controlPlaneWritable: true,
            repairEligible: true,
            serveEligible: true,
          },
        },
      ],
      nodeEndpointRows: [
        {
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        },
        {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        },
        {
          endpoint_id: 'node-3-ws',
          node_id: 'node-3',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-3:8082',
        },
      ],
      partitionRows,
      serviceRows,
      replicaOperationRows,
      nowMs: 3000,
    });

    t.equal(
      candidate.changed,
      false,
      'the active membership can stay stable while metadata still needs refresh',
    );
    t.match(candidate.priorityRecoveryClosureWitness, {
      state: 'closure_satisfied_stale_publication',
      closureRecordId:
        MEMBERSHIP_PUBLICATION_CLOSURE_RECORD_ID_PRIORITY_SPREAD,
      closureWitnessClass:
        MEMBERSHIP_PUBLICATION_CLOSURE_WITNESS_CLASS_PRIORITY_SPREAD,
    });
    t.match(candidate.priorityPartitionSummary, {
      satisfied: true,
      missingPartitionIds: [],
      blockedPartitions: [],
    });
    t.equal(
      candidate.priorityRecoveryDecisionSnapshots?.snapshotCount,
      priorityTableIds.length,
      MEMBERSHIP_PUBLICATION_PRIORITY_DECISION_SNAPSHOT_ASSERTION,
    );
    t.equal(
      candidate.priorityPartitionSummaryChanged,
      true,
      'the coordinator should mark stale durable spread metadata for refresh',
    );
    t.equal(
      candidate.recoveryProtocolState,
      MEMBERSHIP_PUBLICATION_RECOVERY_PROTOCOL_STATE_STEADY_PUBLISHED,
      'priority spread closure should return the protocol to steady published state',
    );
    t.notOk(
      candidate.priorityRecoveryReasonCodes.includes(
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
      ),
      'stale durable spread reasons should clear once the closure witness satisfies publication refresh',
    );
  });

export {
  MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_CONNECTION_STATE_CONNECTED,
  MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_NOW_MS,
  MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PROCESS_DEAD_NODE_ID,
  MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLICATION_EPOCH,
  MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHED_NODE_ID,
  MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_PUBLISHER_NODE_ID,
  MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_READY_LEASE_EXPIRES_AT,
  MEMBERSHIP_PUBLICATION_ACK_DEFERRAL_STATUS_ACK_PENDING,
  MEMBERSHIP_PUBLICATION_ADMISSION_REASON_CLUSTER_INTEGRITY,
  MEMBERSHIP_PUBLICATION_ADMISSION_STATE_BLOCKED,
  MEMBERSHIP_PUBLICATION_BLOCKED_FENCE,
  MEMBERSHIP_PUBLICATION_CLOSURE_RECORD_ID_PRIORITY_SPREAD,
  MEMBERSHIP_PUBLICATION_CLOSURE_WITNESS_CLASS_PRIORITY_SPREAD,
  MEMBERSHIP_PUBLICATION_PRIORITY_DECISION_SNAPSHOT_ASSERTION,
  MEMBERSHIP_PUBLICATION_RECONCILE_ACTIVE_GATE_NODE_IDS,
  MEMBERSHIP_PUBLICATION_RECONCILE_BASELINE_NODE_IDS,
  MEMBERSHIP_PUBLICATION_RECONCILE_EMPTY_ROWS,
  MEMBERSHIP_PUBLICATION_RECONCILE_KIND,
  MEMBERSHIP_PUBLICATION_RECONCILE_LIFECYCLE_ASSERTION,
  MEMBERSHIP_PUBLICATION_RECONCILE_MISSING_RECOVERY_NODE_IDS,
  MEMBERSHIP_PUBLICATION_RECONCILE_NOW_MS,
  MEMBERSHIP_PUBLICATION_RECONCILE_PERSIST_ASSERTION,
  MEMBERSHIP_PUBLICATION_RECONCILE_PUBLICATION_EPOCH,
  MEMBERSHIP_PUBLICATION_RECONCILE_PUBLICATION_ID,
  MEMBERSHIP_PUBLICATION_RECONCILE_READINESS_ASSERTION,
  MEMBERSHIP_PUBLICATION_RECONCILE_RECOVERY_ACTIVE_SOURCE,
  MEMBERSHIP_PUBLICATION_RECONCILE_ROW_ASSERTION,
  MEMBERSHIP_PUBLICATION_RECONCILE_ROW_UPDATED_AT_MS,
  MEMBERSHIP_PUBLICATION_RECONCILE_TARGET_ASSERTION,
  MEMBERSHIP_PUBLICATION_RECONCILE_TEST_NAME,
  MEMBERSHIP_PUBLICATION_RECOVERY_PROTOCOL_STATE_STEADY_PUBLISHED,
  MEMBERSHIP_PUBLICATION_TRIM_CANDIDATE_NODE_IDS,
  MEMBERSHIP_PUBLICATION_TRIM_CONNECTION_STATE_READY,
  MEMBERSHIP_PUBLICATION_TRIM_ENDPOINT_SUFFIX,
  MEMBERSHIP_PUBLICATION_TRIM_NEXT_PUBLICATION_EPOCH,
  MEMBERSHIP_PUBLICATION_TRIM_NODE_ONE_ID,
  MEMBERSHIP_PUBLICATION_TRIM_NODE_STATUS_ACTIVE,
  MEMBERSHIP_PUBLICATION_TRIM_NODE_THREE_ID,
  MEMBERSHIP_PUBLICATION_TRIM_NODE_TWO_ID,
  MEMBERSHIP_PUBLICATION_TRIM_NOW_MS,
  MEMBERSHIP_PUBLICATION_TRIM_PUBLICATION_EPOCH,
  MEMBERSHIP_PUBLICATION_TRIM_PUBLISHER_NODE_ID,
  MEMBERSHIP_PUBLICATION_TRIM_READY_DISTINCT_NODE_COUNT,
  MEMBERSHIP_PUBLICATION_TRIM_READY_LEASE_EXPIRES_AT,
  MEMBERSHIP_PUBLICATION_TRIM_SERVICE_PREFIX,
  MEMBERSHIP_PUBLICATION_TRIM_STALE_NODE_FIVE_ID,
  MEMBERSHIP_PUBLICATION_TRIM_STALE_NODE_FOUR_ID,
  MEMBERSHIP_PUBLICATION_TRIM_STALE_PUBLISHED_NODE_IDS,
  MEMBERSHIP_PUBLICATION_TRIM_STATUS_PUBLISHED,
  MEMBERSHIP_PUBLICATION_TRIM_TOTAL_PRIORITY_PARTITION_COUNT,
  MEMBERSHIP_PUBLICATION_TRIM_TRANSPORT_WS,
  MEMBERSHIP_PUBLICATION_TRIM_WS_ADDRESS_PREFIX,
  MEMBERSHIP_PUBLICATION_TRIM_WS_ADDRESS_SUFFIX,
  buildMembershipPublicationAckDeferralNodeRow,
  buildMembershipPublicationReconcileBaselineRow,
  buildMembershipPublicationTrimEndpointRow,
  buildMembershipPublicationTrimNodeRow,
  buildMembershipPublicationTrimPriorityPartitionSummary,
  buildMembershipPublicationTrimReadinessEntry,
  buildMembershipPublicationTrimServiceRow,
};
