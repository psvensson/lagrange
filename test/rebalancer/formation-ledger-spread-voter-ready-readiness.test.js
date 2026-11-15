/**
 * R09 supersession: committed-node-remove-safety-wake replaces the exhausted
 * predecessor Quest's evidence-absent/lease-zero floor carve-out. Its original
 * seal, red evidence and separate five-node gate remain in the append-only
 * history. This controlled placement fixture now requires committed current
 * node leases; projection reason codes never grant floor credit.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  buildClusterIncarnationFence,
} from '../../src/bootstrap/cluster-incarnation-fence.js';
import {
  MEMBERSHIP_LIFECYCLE_INTENT,
} from '../../src/control-plane/membership-lifecycle-controller.js';
import {
  NodeRegistrationOwner,
} from '../../src/bootstrap/shared/node-registration-owner.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {COLUMN, NODE_STATE, TABLES, WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  PROJECTION_READINESS_REASON,
} from '../../src/control-plane/projection-readiness-constants.js';
import {
  OPERATION_METADATA_KEY,
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  EntityType,
  UnifiedRebalancer,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
  getAuthoritativeOperationLedgerPlacementObservation,
} from '../../src/rebalancer/operation-ledger-quorum-concentration.js';
import {
  buildMockPolicyAuthorityWitness,
  createMockControlPlaneReadinessService,
  createMockPolicyService,
  createTestCoordinator,
} from './test-helpers.js';

const TEST_LEDGER_PARTITION_ID = 'replica_operations-p1';
const TEST_SEED_NODE_ID = 'seed-node';
const TEST_JOINER_NODE_ID_B = 'joiner-node-b';
const TEST_JOINER_NODE_ID_C = 'joiner-node-c';
const TEST_SEED_LEADER_REPLICA_ID = 'replica_operations-p1-r1';
const TEST_SEED_SURPLUS_REPLICA_ID = 'replica_operations-p1-r2';
const TEST_JOINER_REPLACEMENT_REPLICA_ID =
  'replace-replica-formation-ledger-spread';
const TEST_JOINER_SPREAD_REPLICA_ID = 'replica_operations-p1-r4';
const TEST_TARGET_REPLICA_COUNT = 3;
const TEST_MIN_REPLICA_COUNT = 3;
const TEST_AUTHORITATIVE_SOURCE = 'owner_rpc_lane';
const TEST_PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
const TEST_SAFE_CLASSIFICATION = 'safe';
const TEST_VOTER_READY_FLOOR_PATTERN =
  /would drop voter-ready replicas below minimum/;
// The evidence-absent denial class approved for fail-open carve-outs
// (query-executor-partition-routing-snapshot.js:80-83 discipline).
const TEST_EVIDENCE_ABSENT_DENIAL_REASON_CODES = Object.freeze([
  CONTROL_PLANE_READINESS_REASON.PLANNING_SNAPSHOT_REFRESH_PENDING,
  PROJECTION_READINESS_REASON.OWNER_EVIDENCE_MISSING,
]);
// A substantive denial that must NEVER be carved out.
const TEST_SUBSTANTIVE_DENIAL_REASON_CODES = Object.freeze([
  CONTROL_PLANE_READINESS_REASON.CLUSTER_MEMBER_UNHEALTHY,
]);

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
}

function resetTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function createSeedReadyNodeRow() {
  return {
    node_id: TEST_SEED_NODE_ID,
    status: NODE_STATE.ACTIVE,
    connection_state: NODE_STATE.READY,
    ready_lease_expires_at: Date.now() + 60000,
  };
}

// A pre-lease joiner: process-alive and CONNECTED (heartbeat-only
// publication), before its READY lease is published.
function createBarrierHeldJoinerNodeRow(nodeId) {
  return {
    node_id: nodeId,
    status: NODE_STATE.ACTIVE,
    connection_state: NODE_STATE.CONNECTED,
    ready_lease_expires_at: 0,
  };
}

function createLedgerVoterServiceRow({replicaId, nodeId, raftRole}) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: TEST_LEDGER_PARTITION_ID,
    node_id: nodeId,
    service_type: 'partition',
    status: 'active',
    raft_role: raftRole,
    address: `${nodeId}/partition/${replicaId}`,
  };
}

// The settled live wedge (run4): the REPLACE completed without draining its
// source, then a spread ADD landed — 4 ACTIVE voters, seed hosts two.
function createSettledWedgeServiceRows() {
  return [
    createLedgerVoterServiceRow({
      replicaId: TEST_SEED_LEADER_REPLICA_ID,
      nodeId: TEST_SEED_NODE_ID,
      raftRole: 'leader',
    }),
    createLedgerVoterServiceRow({
      replicaId: TEST_SEED_SURPLUS_REPLICA_ID,
      nodeId: TEST_SEED_NODE_ID,
      raftRole: 'follower',
    }),
    createLedgerVoterServiceRow({
      replicaId: TEST_JOINER_REPLACEMENT_REPLICA_ID,
      nodeId: TEST_JOINER_NODE_ID_B,
      raftRole: 'follower',
    }),
    createLedgerVoterServiceRow({
      replicaId: TEST_JOINER_SPREAD_REPLICA_ID,
      nodeId: TEST_JOINER_NODE_ID_C,
      raftRole: 'follower',
    }),
  ];
}

/**
 * Cold-formation readiness projection: the seed satisfies every readiness
 * dimension; each denied node fails EVERY dimension and carries exactly the
 * given reason codes. The published-membership planning snapshot names the
 * whole formation cohort so the voter-ready floor is the only
 * readiness-discriminating gate on the drain path under test.
 */
function createColdFormationReadinessService({
  denialReasonCodesByNodeId,
  nodeRows,
  prioritySummarySatisfied = false,
  publicationEpoch = 1,
}) {
  const cohortNodeIds = Object.freeze([
    TEST_SEED_NODE_ID,
    TEST_JOINER_NODE_ID_B,
    TEST_JOINER_NODE_ID_C,
  ]);
  const buildPlanningSnapshot = (nodeId) => ({
    publicationStatus: TEST_PUBLICATION_STATUS_PUBLISHED,
    publicationEpoch,
    publishedActiveNodeIdsPresent: true,
    publishedActiveNodeIds: cohortNodeIds,
    recoveryActiveNodeIds: cohortNodeIds,
    projectedServingNodeIds: cohortNodeIds,
    publishedMembershipIncludesTargetNode: cohortNodeIds.includes(nodeId),
    priorityPartitionSummary: Object.freeze({
      satisfied: Boolean(prioritySummarySatisfied),
      requiredDistinctNodeCount: TEST_TARGET_REPLICA_COUNT,
      missingPartitionIds: [],
      blockedPartitions: [],
      spreadGap: prioritySummarySatisfied ? 0 : 1,
      largestSpreadGap: prioritySummarySatisfied ? 0 : 1,
      totalSpreadGap: prioritySummarySatisfied ? 0 : 1,
    }),
  });
  return createMockControlPlaneReadinessService({
    readNodeRows: () => nodeRows,
    callbacks: {
      getNodeReadinessSync(nodeId) {
        const denialReasonCodes = denialReasonCodesByNodeId[nodeId] || null;
        const eligible = !denialReasonCodes;
        const dimensions = {};
        for (const dimensionName of Object.values(
          CONTROL_PLANE_READINESS_DIMENSION,
        )) {
          if (typeof dimensionName === 'string') {
            dimensions[dimensionName] = eligible;
          }
        }
        // Both denial-reason surfaces of the production snapshot: `reasons`
        // ([{code}] — the shape the query-executor fail-open consumes) and
        // the flat `reasonCodes` list.
        return {
          nodeId,
          dimensions,
          reasons: denialReasonCodes ?
            denialReasonCodes.map((code) => ({code})) :
            [],
          reasonCodes: denialReasonCodes ? [...denialReasonCodes] : [],
          observedAt: Date.now(),
        };
      },
      // REMOVE safety reads the owner surface; the same modelled formation
      // planning state is presented there, unchanged. The best-effort surfaces
      // stay for the AVAILABLE consumers in this scenario.
      async getPriorityRecoveryPlanningAnswerForOwnerRead(nodeId) {
        return buildPlanningSnapshot(nodeId);
      },
      async getPriorityRecoveryPlanningSnapshotBestEffort(nodeId) {
        return buildPlanningSnapshot(nodeId);
      },
      getPriorityRecoveryPlanningAnswerSync(nodeId) {
        return buildPlanningSnapshot(nodeId);
      },
    },
  });
}

// Answer the coordinator's authoritative (owner_rpc_lane) services reads
// from the wedge rows: both the surplus-REMOVE placement fence
// (rebalance-coordinator-topology-guard-methods.js
// ensurePrioritySurplusRemovePlacementFenceAllowed) and
// getCriticalReplicaRowsForSafety consume this lane. The fence judges RAFT
// topology (active voters / distinct nodes) and correctly ALLOWS the drain;
// only the remove-safety floor's readiness-filtered projection refuses it.
function installAuthoritativeServicesRead(coordinator, rowsProvider) {
  const gateway = coordinator.controlPlaneSystemTableGateway;
  const originalReadAuthoritativeRows =
    gateway.readAuthoritativeRows.bind(gateway);
  gateway.readAuthoritativeRows = async (
    tableName,
    sql,
    params = [],
    options = {},
  ) => {
    if (
      tableName === 'services' &&
      String(sql).includes('WHERE service_type = ? AND partition_id = ?')
    ) {
      const rows = typeof rowsProvider === 'function' ?
        rowsProvider(params[1]) :
        rowsProvider;
      return {
        success: true,
        source: TEST_AUTHORITATIVE_SOURCE,
        rows: Array.isArray(rows) ? rows.map((row) => ({...row})) : [],
        rowSetComplete: true,
        readAuthorityWitness: buildMockPolicyAuthorityWitness('services-p1'),
      };
    }
    return originalReadAuthoritativeRows(tableName, sql, params, options);
  };
}

function createWedgeCoordinator({
  denialReasonCodesByNodeId,
  committedJoinersReady = false,
  prioritySummarySatisfied = false,
  publicationEpoch = 1,
  serviceRows = null,
  nodeRowsOverride = null,
}) {
  const defaultNodeRows = [createSeedReadyNodeRow(),
    createBarrierHeldJoinerNodeRow(TEST_JOINER_NODE_ID_B),
    createBarrierHeldJoinerNodeRow(TEST_JOINER_NODE_ID_C)];
  if (committedJoinersReady) {
    for (const row of defaultNodeRows) row.ready_lease_expires_at = Date.now() + 60000;
  }
  const nodeRows = Array.isArray(nodeRowsOverride) ?
    nodeRowsOverride :
    defaultNodeRows;
  const rows = Array.isArray(serviceRows) ?
    serviceRows :
    createSettledWedgeServiceRows();
  const coordinator = createTestCoordinator({
    nodeId: TEST_SEED_NODE_ID,
    enableTimeouts: false,
    controlPlaneReadinessService: createColdFormationReadinessService({
      denialReasonCodesByNodeId,
      nodeRows,
      prioritySummarySatisfied,
      publicationEpoch,
    }),
    tablePolicyService: createMockPolicyService({
      getPolicyForPartition: () => ({
        minReplicaCount: TEST_MIN_REPLICA_COUNT,
        targetReplicaCount: TEST_TARGET_REPLICA_COUNT,
      }),
    }),
    cacheData: {
      nodes: nodeRows.map((row) => ({...row})),
      services: rows.map((row) => ({...row})),
      partitions: [
        {
          partition_id: TEST_LEDGER_PARTITION_ID,
          leader_node_id: TEST_SEED_NODE_ID,
          replica_count: TEST_TARGET_REPLICA_COUNT,
        },
      ],
    },
  });
  installAuthoritativeServicesRead(
    coordinator,
    () => rows.map((row) => ({...row})),
  );
  return coordinator;
}

function describeEvaluation(evaluation) {
  return JSON.stringify({
    classification: evaluation?.classification || null,
    error: evaluation?.error || null,
    deferReason: evaluation?.deferReason || null,
  });
}

for (const committedJoinersReady of [false, true]) {
  test(`R09 surplus drain consumes committed joiner leases (current=${committedJoinersReady})`,
    async (t) => {
      initializeTestEnvironment();
      const coordinator = createWedgeCoordinator({committedJoinersReady,
        denialReasonCodesByNodeId: {
          [TEST_JOINER_NODE_ID_B]: TEST_EVIDENCE_ABSENT_DENIAL_REASON_CODES,
          [TEST_JOINER_NODE_ID_C]: TEST_EVIDENCE_ABSENT_DENIAL_REASON_CODES,
        },
      });
      try {
        const row = coordinator.systemTableCache.get('services', TEST_JOINER_REPLACEMENT_REPLICA_ID);
        t.equal(coordinator.workflowOwner.isVoterReadyReplicaTopology(row), true);
        const operation = await coordinator.createOperation({
          type: OperationType.REMOVE, partitionId: TEST_LEDGER_PARTITION_ID,
          nodeId: TEST_SEED_NODE_ID, replicaId: TEST_SEED_SURPLUS_REPLICA_ID,
        });
        const evaluation = await coordinator.workflowOwner.evaluateRemoveSafety(operation);
        t.equal(evaluation.classification === TEST_SAFE_CLASSIFICATION, committedJoinersReady,
          'a known expired lease never becomes credit through evidence-absent reasons: ' +
          describeEvaluation(evaluation));
        if (!committedJoinersReady) t.match(evaluation.error, TEST_VOTER_READY_FLOOR_PATTERN);
      } finally {
        await coordinator.shutdown();
        resetTestEnvironment();
      }
    });
}

test('replacement completion guards remain distinct from the committed node floor', async (t) => {
  initializeTestEnvironment();
  const coordinator = createWedgeCoordinator({
    committedJoinersReady: true,
    denialReasonCodesByNodeId: {
      [TEST_JOINER_NODE_ID_B]: TEST_EVIDENCE_ABSENT_DENIAL_REASON_CODES,
      [TEST_JOINER_NODE_ID_C]: TEST_EVIDENCE_ABSENT_DENIAL_REASON_CODES,
    },
  });
  coordinator.initialize();
  try {
    const operation = await coordinator.createOperation({
      type: OperationType.REPLACE,
      partitionId: TEST_LEDGER_PARTITION_ID,
      nodeId: TEST_JOINER_NODE_ID_B,
      sourceNodeId: TEST_SEED_NODE_ID,
      replicaId: TEST_SEED_SURPLUS_REPLICA_ID,
    });
    // Replicate the live drain leg: replacement created and promoted, the
    // workflow at ACTIVE dispatches source removal (repository
    // isReplaceRemovePhase).
    operation.replicaId = TEST_JOINER_REPLACEMENT_REPLICA_ID;
    operation.workflowStep = WORKFLOW_STEP.ACTIVE;
    operation.status = 'active';

    const evaluation =
      await coordinator.workflowOwner.evaluateRemoveSafety(operation);

    // Scoped assertion: later REPLACE-specific gates (source-leader handoff
    // serialization) may legitimately defer this leg; the voter-ready FLOOR
    // must never be what refuses it — before or after the fix.
    t.notMatch(
      String(evaluation?.error || ''),
      TEST_VOTER_READY_FLOOR_PATTERN,
      'the REPLACE remove-leg must not defer on the voter-ready floor when ' +
        'the only uncounted voters are topology-voter-ready replicas on ' +
        'evidence-absent-denied barrier-held joiners. Got: ' +
        describeEvaluation(evaluation),
    );
  } finally {
    await coordinator.shutdown();
    resetTestEnvironment();
  }
});

test('expired committed joiners remain below the floor with substantive projection denial', async (t) => {
  initializeTestEnvironment();
  const coordinator = createWedgeCoordinator({
    denialReasonCodesByNodeId: {
      // One joiner is genuinely unhealthy: the projection may not count it,
      // so the post-removal voter-ready count is at most 2/3 and the floor
      // must keep refusing the drain.
      [TEST_JOINER_NODE_ID_B]: TEST_SUBSTANTIVE_DENIAL_REASON_CODES,
      [TEST_JOINER_NODE_ID_C]: TEST_EVIDENCE_ABSENT_DENIAL_REASON_CODES,
    },
  });
  coordinator.initialize();
  try {
    const operation = await coordinator.createOperation({
      type: OperationType.REMOVE,
      partitionId: TEST_LEDGER_PARTITION_ID,
      nodeId: TEST_SEED_NODE_ID,
      replicaId: TEST_SEED_SURPLUS_REPLICA_ID,
    });

    const evaluation =
      await coordinator.workflowOwner.evaluateRemoveSafety(operation);

    t.not(
      evaluation.classification,
      TEST_SAFE_CLASSIFICATION,
      'expired committed leases keep the floor closed regardless of reason class. Got: ' + describeEvaluation(evaluation),
    );
  } finally {
    await coordinator.shutdown();
    resetTestEnvironment();
  }
});

test('coupling sanity: the refused drain is exactly the formation ' +
'barrier\'s release condition — the settled wedge placement is UNSPREAD ' +
'(concentrated) and flips to SPREAD once one seed voter drains', (t) => {
  const wedgeObservation = getAuthoritativeOperationLedgerPlacementObservation({
    available: true,
    rows: createSettledWedgeServiceRows(),
    source: TEST_AUTHORITATIVE_SOURCE,
    partitionId: TEST_LEDGER_PARTITION_ID,
    targetReplicaCount: TEST_TARGET_REPLICA_COUNT,
  });
  t.equal(
    wedgeObservation.observedVoterCount,
    4,
    'the settled wedge observes 4 voters (live: totalVoters 4)',
  );
  t.equal(
    wedgeObservation.maxVotersOnOneNode,
    2,
    'the seed hosts two co-located voters (live: maxVotersOnOneNode 2)',
  );
  t.equal(
    wedgeObservation.concentrated,
    true,
    'the wedge is quorum-concentrated, so the startup-authority owner keeps ' +
      'the joiner barrier closed',
  );
  t.equal(
    wedgeObservation.spreadComplete,
    false,
    'the canonical spread evidence stays false while the surplus persists',
  );

  const drainedRows = createSettledWedgeServiceRows().filter(
    (row) => row.replica_id !== TEST_SEED_SURPLUS_REPLICA_ID,
  );
  const drainedObservation =
    getAuthoritativeOperationLedgerPlacementObservation({
      available: true,
      rows: drainedRows,
      source: TEST_AUTHORITATIVE_SOURCE,
      partitionId: TEST_LEDGER_PARTITION_ID,
      targetReplicaCount: TEST_TARGET_REPLICA_COUNT,
    });
  t.equal(
    drainedObservation.spreadComplete,
    true,
    'draining ONE seed voter completes the spread (3 voters on 3 distinct ' +
      'nodes), allowing the readiness owner to release the barrier — the ' +
      'REMOVE refused by the voter-ready floor is the exact missing step',
  );
  t.end();
});

test('converged priorityPartitionSummary refuses surplus seed REMOVE when a remote voter is SYNCING (projectedVoterReadyCount 2/3)', async (t) => {
  initializeTestEnvironment();
  let currentServiceRows = createSettledWedgeServiceRows();
  const coordinator = createWedgeCoordinator({
    committedJoinersReady: true,
    prioritySummarySatisfied: true,
    denialReasonCodesByNodeId: {},
  });
  installAuthoritativeServicesRead(coordinator, () => currentServiceRows);
  coordinator.initialize();
  try {
    const operation = await coordinator.createOperation({
      type: OperationType.REMOVE,
      partitionId: TEST_LEDGER_PARTITION_ID,
      nodeId: TEST_SEED_NODE_ID,
      replicaId: TEST_SEED_SURPLUS_REPLICA_ID,
    });
    currentServiceRows = createSettledWedgeServiceRows().map((row) =>
      row.node_id === TEST_JOINER_NODE_ID_B ?
        {...row, status: 'syncing'} :
        row,
    );
    const evaluation =
      await coordinator.workflowOwner.evaluateRemoveSafety(operation);
    t.not(
      evaluation.classification,
      TEST_SAFE_CLASSIFICATION,
      'a remote voter in SYNCING must not count toward post-REMOVE active voter floor: ' +
        describeEvaluation(evaluation),
    );
    t.match(
      String(evaluation?.error || ''),
      /would drop voter-ready replicas below minimum \(2\/3\)/,
    );
  } finally {
    await coordinator.shutdown();
    resetTestEnvironment();
  }
});

test('converged priorityPartitionSummary refuses surplus seed REMOVE when a remote voter has an expired READY lease (9e943db3 witness, projectedVoterReadyCount 2/3)', async (t) => {
  initializeTestEnvironment();
  const nowMs = Date.now();
  const expiredLeaseNodeRows = [
    {
      node_id: TEST_SEED_NODE_ID,
      status: NODE_STATE.ACTIVE,
      connection_state: NODE_STATE.READY,
      ready_lease_expires_at: nowMs + 60000,
    },
    {
      node_id: TEST_JOINER_NODE_ID_B,
      status: NODE_STATE.ACTIVE,
      connection_state: NODE_STATE.READY,
      ready_lease_expires_at: nowMs - 599,
    },
    {
      node_id: TEST_JOINER_NODE_ID_C,
      status: NODE_STATE.ACTIVE,
      connection_state: NODE_STATE.READY,
      ready_lease_expires_at: nowMs + 60000,
    },
  ];
  const coordinator = createWedgeCoordinator({
    prioritySummarySatisfied: true,
    publicationEpoch: 9,
    denialReasonCodesByNodeId: {},
    nodeRowsOverride: expiredLeaseNodeRows,
  });
  coordinator.initialize();
  try {
    const operation = await coordinator.createOperation({
      type: OperationType.REMOVE,
      partitionId: TEST_LEDGER_PARTITION_ID,
      nodeId: TEST_SEED_NODE_ID,
      replicaId: TEST_SEED_SURPLUS_REPLICA_ID,
    });
    const evaluation =
      await coordinator.workflowOwner.evaluateRemoveSafety(operation);
    t.not(
      evaluation.classification,
      TEST_SAFE_CLASSIFICATION,
      'an expired READY lease on a published-active remote voter must refuse REMOVE at 2/3: ' +
        describeEvaluation(evaluation),
    );
    t.match(
      String(evaluation?.error || ''),
      /would drop voter-ready replicas below minimum \(2\/3\)/,
    );
  } finally {
    await coordinator.shutdown();
    resetTestEnvironment();
  }
});

test('NodeRegistrationOwner + UnifiedRebalancer storageIncarnation continuity contract across durable rejoin, wiped-disk restart with ACTIVE membership row, cleared tombstones, and clock rollback', async (t) => {
  initializeTestEnvironment();
  const coordinator = createWedgeCoordinator({
    committedJoinersReady: true,
    prioritySummarySatisfied: true,
    denialReasonCodesByNodeId: {},
  });
  coordinator.initialize();
  try {
    const cache = coordinator.systemTableCache;
    const buildRegistrationOwner = ({
      bootIncarnation,
      durableStateDetected,
      nowMs,
    }) => {
      const fence = buildClusterIncarnationFence(
        durableStateDetected ? {
          durableStateDetected: true,
          localIdentityMatched: true,
          peerProofRequired: true,
          peerAddresses: ['ws://seed-node:9000'],
        } : {
          durableStateDetected: false,
        },
      );
      const owner = new NodeRegistrationOwner({
        nodeId: TEST_JOINER_NODE_ID_B,
        nodeAddress: `ws://${TEST_JOINER_NODE_ID_B}:9000`,
        delegates: {
          getLogger: () => ({
            info() {},
            warn() {},
            error() {},
            debug() {},
          }),
          getNow: () => () => nowMs,
          getBootIncarnation: () => bootIncarnation,
          getNodeCapabilities: () => [],
          getClusterIncarnationFence: async () => fence,
          getJoinLifecycleIntentType: () =>
            durableStateDetected ?
              MEMBERSHIP_LIFECYCLE_INTENT.RESTART_REENTRY :
              MEMBERSHIP_LIFECYCLE_INTENT.FRESH_BOOT_ADMISSION,
          getSystemTableCache: () => cache,
          getNodeStorageBudgetService: () => ({
            resolveBudgetRow: (nodeRow) => ({
              budgetRow: {
                ...nodeRow,
                [COLUMN.STORAGE_BUDGET_BYTES]: 1024 * 1024 * 1024,
                [COLUMN.STORAGE_BUDGET_SOURCE]: 'configured',
                [COLUMN.STORAGE_BUDGET_UPDATED_AT]: nowMs,
              },
              resolution: {
                isValid: true,
                budgetBytes: 1024 * 1024 * 1024,
                source: 'configured',
                diskBytes: 1024 * 1024 * 1024,
              },
            }),
          }),
        },
      });
      owner.authoritativeControlPlaneView = {
        canRead: () => true,
        syncOwnerDependencies: () => {},
        readRows: async (tableName) => ({
          success: true,
          rows: cache.getAll(tableName).filter(
            (row) => row?.[COLUMN.NODE_ID] === TEST_JOINER_NODE_ID_B,
          ),
        }),
      };
      owner.upsertSystemTableRowWithRetry = async (tableName, rowData) => {
        cache.applySystemTableChange(tableName, 'UPSERT', rowData);
        return {success: true, partitionResult: {affectedRows: 1}};
      };
      owner.advanceNodeBootIncarnation = async (_observedRow, nextNodeRow) => {
        cache.applySystemTableChange(TABLES.NODES, 'UPSERT', nextNodeRow);
        return nextNodeRow;
      };
      return owner;
    };

    // Initial fresh registration at bootIncarnation = 1, now = 1000.
    cache.delete(TABLES.NODES, TEST_JOINER_NODE_ID_B);
    await buildRegistrationOwner({
      bootIncarnation: 1,
      durableStateDetected: false,
      nowMs: 1000,
    }).registerNodeInCluster();

    // Terminal ADD operation completed at timestamp 2000 for storageIncarnation = 1.
    const terminalAddOperation = {
      operation_id: 'op-add-joiner-b-inc1',
      type: OperationType.ADD,
      partition_id: TEST_LEDGER_PARTITION_ID,
      entity_type: EntityType.PARTITION,
      entity_id: TEST_LEDGER_PARTITION_ID,
      source_node_id: TEST_SEED_NODE_ID,
      target_node_id: TEST_JOINER_NODE_ID_B,
      replica_id: TEST_JOINER_REPLACEMENT_REPLICA_ID,
      status: ReplicaStatus.ACTIVE,
      workflow_step: WORKFLOW_STEP.ACTIVE,
      created_at: 1500,
      updated_at: 2000,
      completed_at: 2000,
      steps_history: JSON.stringify([
        {
          step: WORKFLOW_STEP.ACTIVE,
          timestamp: 2000,
          [OPERATION_METADATA_KEY.TARGET_NODE_BOOT_INCARNATION]: 1,
          [OPERATION_METADATA_KEY.TARGET_NODE_STORAGE_INCARNATION]: 1,
        },
      ]),
    };
    cache.set(
      TABLES.REPLICA_OPERATIONS,
      terminalAddOperation.operation_id,
      terminalAddOperation,
    );

    const rebalancer = new UnifiedRebalancer({
      entityId: TEST_LEDGER_PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: TEST_SEED_NODE_ID,
      systemTableCache: cache,
      cdcIntegrationService: coordinator.cdcIntegrationService,
      tablePolicyService: coordinator.tablePolicyService,
      messageRouter: coordinator.messageRouter,
      rebalanceCoordinator: coordinator,
      sqlQueryEngine: coordinator.sqlQueryEngine,
      controlPlaneSystemTableGateway:
        coordinator.controlPlaneSystemTableGateway,
      controlPlaneReadinessService: coordinator.controlPlaneReadinessService,
    });

    // 1. Durable rejoin (durableStateDetected: true) at bootIncarnation = 2, now = 3000:
    // boot_incarnation advances (1 -> 2), storageIncarnation remains 1,
    // SERVICES row remains ACTIVE, and terminal ADD is NOT superseded even if
    // SERVICES row is temporarily lagging/absent in cache.
    await buildRegistrationOwner({
      bootIncarnation: 2,
      durableStateDetected: true,
      nowMs: 3000,
    }).registerNodeInCluster();
    t.equal(
      cache.get(TABLES.NODES, TEST_JOINER_NODE_ID_B)?.[COLUMN.BOOT_INCARNATION],
      2,
      'durable rejoin advances boot_incarnation to 2',
    );
    t.equal(
      JSON.parse(
        cache.get(TABLES.NODE_ENDPOINTS, `ep-${TEST_JOINER_NODE_ID_B}-ws`)?.[
          COLUMN.METADATA
        ] || '{}',
      ).storageIncarnation,
      1,
      'durable rejoin preserves storageIncarnation = 1 in NODE_ENDPOINTS.metadata',
    );
    t.equal(
      rebalancer.isTerminalCreateSupersededByNodeRegistration(
        terminalAddOperation,
        TEST_JOINER_NODE_ID_B,
        TEST_JOINER_REPLACEMENT_REPLICA_ID,
      ),
      false,
      'durable rejoin does not supersede terminal ADD from the same storageIncarnation',
    );

    // 2. Wiped-disk restart (durableStateDetected: false) at bootIncarnation = 3
    // while old NODES row is still ACTIVE/CONNECTED and SERVICES row is still
    // ACTIVE in the cluster store, AND with clock rollback (nowMs = 500 < completed_at = 2000):
    await buildRegistrationOwner({
      bootIncarnation: 3,
      durableStateDetected: false,
      nowMs: 500,
    }).registerNodeInCluster();
    const nodeAfterWipe = cache.get(TABLES.NODES, TEST_JOINER_NODE_ID_B);
    t.equal(
      nodeAfterWipe?.[COLUMN.BOOT_INCARNATION],
      3,
      'wiped-disk registration advances boot_incarnation to 3',
    );
    t.equal(
      nodeAfterWipe?.[COLUMN.CREATED_AT],
      500,
      'wiped-disk registration refuses to reuse old ACTIVE NODES row and mints fresh row even under rolled-back clock',
    );
    t.equal(
      JSON.parse(
        cache.get(TABLES.NODE_ENDPOINTS, `ep-${TEST_JOINER_NODE_ID_B}-ws`)?.[
          COLUMN.METADATA
        ] || '{}',
      ).storageIncarnation,
      3,
      'wiped-disk registration advances storageIncarnation to 3',
    );
    const serviceAfterWipe = cache.get(
      TABLES.SERVICES,
      TEST_JOINER_REPLACEMENT_REPLICA_ID,
    );
    t.equal(
      serviceAfterWipe?.[COLUMN.STATUS],
      ReplicaStatus.FAILED,
      'NodeRegistrationOwner transitions untouched SERVICES row on wiped node to FAILED',
    );
    t.equal(
      serviceAfterWipe?.[COLUMN.TRIGGER_REASON],
      'node_storage_lost_on_fresh_registration',
      'failed SERVICES row carries node_storage_lost_on_fresh_registration trigger reason',
    );

    // 3 & 4. Delete SERVICES row and clear all cache tombstones while clock is
    // rolled back (node.created_at = 500 < operation.completed_at = 2000):
    // storageIncarnation (3 > 1) still supersedes the terminal ADD and prevents
    // ghost replica projection.
    cache.delete(TABLES.SERVICES, TEST_JOINER_REPLACEMENT_REPLICA_ID);
    cache.tombstoneStore?.clearAll?.();
    t.equal(
      rebalancer.hasActiveServiceTombstone(TEST_JOINER_REPLACEMENT_REPLICA_ID),
      false,
      'cache tombstones are cleared/absent',
    );
    t.equal(
      rebalancer.isTerminalCreateSupersededByNodeRegistration(
        terminalAddOperation,
        TEST_JOINER_NODE_ID_B,
        TEST_JOINER_REPLACEMENT_REPLICA_ID,
      ),
      true,
      'storageIncarnation supersession (3 > 1) detects wiped-disk restart without tombstones and under clock rollback',
    );
    const projectedReplicas = rebalancer.getCurrentReplicas();
    t.equal(
      projectedReplicas.some(
        (row) => row.replica_id === TEST_JOINER_REPLACEMENT_REPLICA_ID,
      ),
      false,
      'superseded terminal ADD does not project a ghost ACTIVE replica',
    );
  } finally {
    await coordinator.shutdown();
    resetTestEnvironment();
  }
});
