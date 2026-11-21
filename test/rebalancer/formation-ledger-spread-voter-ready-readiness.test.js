/**
 * R09 supersession: committed-node-remove-safety-wake replaces the exhausted
 * predecessor Quest's evidence-absent/lease-zero floor carve-out. Its original
 * seal, red evidence and separate five-node gate remain in the append-only
 * history. This controlled placement fixture now requires committed current
 * node leases; projection reason codes never grant floor credit.
 */

import {LOCAL_MACHINE_HOST_ID} from '../test-helpers/declared-node-host.js';
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
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  NODE_REGISTRATION_OUTCOME,
} from '../../src/control-plane/owners/node-registration-incarnation-write.js';
import {
  ServicesOwner,
} from '../../src/control-plane/owners/services-owner.js';
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
  preserveOperationTargetNodeIncarnations,
  readOperationTargetNodeBootIncarnation,
  readOperationTargetNodeStorageIncarnation,
  resolveTargetNodeIncarnationSnapshot,
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
    boot_incarnation: 1,
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
    boot_incarnation: 1,
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
      node_endpoints: nodeRows.map((row) => {
        const bootIncarnation = row.boot_incarnation ?? 1;
        const storageIncarnation = row.storage_incarnation ?? bootIncarnation;
        return {
          endpoint_id: `ep-${row.node_id}-ws`,
          node_id: row.node_id,
          transport_type: 'websocket',
          address: `ws://${row.node_id}:9000`,
          status: 'active',
          boot_incarnation: bootIncarnation,
          metadata: JSON.stringify({storageIncarnation}),
        };
      }),
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

function seedStorageIncarnationCacheRows(cache, sourceCache) {
  for (const tableName of [
    TABLES.NODES,
    TABLES.SERVICES,
    TABLES.PARTITIONS,
    TABLES.REPLICA_OPERATIONS,
  ]) {
    for (const row of sourceCache.getAll(tableName)) {
      const key =
        row[COLUMN.NODE_ID] ||
        row[COLUMN.SERVICE_ID] ||
        row[COLUMN.PARTITION_ID] ||
        row[COLUMN.OPERATION_ID];
      if (key) {
        cache.set(tableName, key, {...row});
      }
    }
  }
}

function createStorageIncarnationTestCache(coordinator) {
  const cache = new SystemTableCache();
  cache.set = (tableName, key, row) => {
    cache.tables.get(tableName)?.delete(key);
    cache.tombstoneStore.clear();
    cache.applySystemTableChange(tableName, 'INSERT', {...row});
  };
  cache.delete = (tableName, key) => {
    const keyColumnByTable = {
      [TABLES.NODES]: COLUMN.NODE_ID,
      [TABLES.NODE_ENDPOINTS]: COLUMN.ENDPOINT_ID,
      [TABLES.SERVICE_ENDPOINTS]: COLUMN.ENDPOINT_ID,
      [TABLES.SERVICES]: COLUMN.SERVICE_ID,
      [TABLES.PARTITIONS]: COLUMN.PARTITION_ID,
      [TABLES.REPLICA_OPERATIONS]: COLUMN.OPERATION_ID,
    };
    const keyColumn = keyColumnByTable[tableName] || COLUMN.SERVICE_ID;
    cache.applySystemTableChange(tableName, 'DELETE', {[keyColumn]: key});
  };
  seedStorageIncarnationCacheRows(cache, coordinator.systemTableCache);
  return cache;
}

function readEndpointStorageIncarnation(cache, nodeId) {
  const endpointRow = cache.get(TABLES.NODE_ENDPOINTS, `ep-${nodeId}-ws`);
  const metadataText = endpointRow ? endpointRow[COLUMN.METADATA] : '{}';
  return JSON.parse(metadataText || '{}').storageIncarnation;
}

test('NodeRegistrationOwner + UnifiedRebalancer storageIncarnation continuity contract across durable rejoin, wiped-disk restart with ACTIVE membership row, cleared tombstones, and clock rollback', async (t) => {
  initializeTestEnvironment();
  const coordinator = createWedgeCoordinator({
    committedJoinersReady: true,
    prioritySummarySatisfied: true,
    denialReasonCodesByNodeId: {},
  });
  coordinator.initialize();
  try {
    const cache = createStorageIncarnationTestCache(coordinator);

    const updateWhereCalls = [];
    const servicesOwner = new ServicesOwner({
      controlPlaneSystemTableGateway: {
        updateSystemTableRow: async (
          tableName,
          whereClause,
          data,
          options,
        ) => {
          updateWhereCalls.push({tableName, whereClause, data, options});
          const existing = cache.get(
            TABLES.SERVICES,
            whereClause[COLUMN.SERVICE_ID],
          );
          if (
            !existing ||
            existing[COLUMN.NODE_ID] !== whereClause[COLUMN.NODE_ID]
          ) {
            return {
              success: true,
              changes: 0,
              partitionResult: {affectedRows: 0},
            };
          }
          const updatedRow = {...existing, ...data};
          cache.set(
            TABLES.SERVICES,
            whereClause[COLUMN.SERVICE_ID],
            updatedRow,
          );
          return {
            success: true,
            changes: 1,
            partitionResult: {affectedRows: 1},
          };
        },
      },
    });
    const membershipPublicationRuntimeOwner = {
      servicesOwner,
      registerJoinNodeAtIncarnation: async (row, bootIncarnation) => {
        const nextRow = {...row, [COLUMN.BOOT_INCARNATION]: bootIncarnation};
        cache.set(TABLES.NODES, nextRow[COLUMN.NODE_ID], nextRow);
        return {
          outcome: NODE_REGISTRATION_OUTCOME.ACCEPTED,
          observedRow: null,
          error: null,
        };
      },
      writeJoinEndpointAtIncarnation: async (
        tableName,
        row,
        bootIncarnation,
      ) => {
        const nextRow = {...row, [COLUMN.BOOT_INCARNATION]: bootIncarnation};
        cache.set(tableName, nextRow[COLUMN.ENDPOINT_ID], nextRow);
        return {outcome: 'applied', result: {success: true}};
      },
      advanceJoinNodeBootIncarnation: async (_whereClause, nextNodeRow) => {
        cache.set(TABLES.NODES, nextNodeRow[COLUMN.NODE_ID], nextNodeRow);
        return {success: true, partitionResult: {affectedRows: 1}};
      },
    };

    const buildRegistrationOwner = ({
      bootIncarnation,
      durableStateDetected,
      nowMs,
    }) => {
      let localBootIncarnation = bootIncarnation;
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
        hostId: LOCAL_MACHINE_HOST_ID,
        nodeId: TEST_JOINER_NODE_ID_B,
        nodeAddress: `ws://${TEST_JOINER_NODE_ID_B}:9000`,
        membershipPublicationRuntimeOwner,
        delegates: {
          getLogger: () => ({
            info() {},
            warn() {},
            error() {},
            debug() {},
          }),
          getNow: () => () => nowMs,
          getBootIncarnation: () => localBootIncarnation,
          raiseBootIncarnationFloor: async (nextFloor) => {
            if (
              Number.isSafeInteger(nextFloor) &&
              nextFloor > localBootIncarnation
            ) {
              localBootIncarnation = nextFloor;
            }
          },
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
      owner.seedJoinTimeCacheRow = (tableName, row) => {
        const key =
          row?.[COLUMN.NODE_ID] && tableName === TABLES.NODES ?
            row[COLUMN.NODE_ID] :
            row?.[COLUMN.ENDPOINT_ID] || row?.[COLUMN.SERVICE_ID];
        if (key) {
          cache.set(tableName, key, {...row});
        }
      };
      return owner;
    };

    // Initial fresh registration at bootIncarnation = 1, now = 1000.
    cache.delete(TABLES.NODES, TEST_JOINER_NODE_ID_B);
    const initialServiceRow = createLedgerVoterServiceRow({
      replicaId: TEST_JOINER_REPLACEMENT_REPLICA_ID,
      nodeId: TEST_JOINER_NODE_ID_B,
      raftRole: 'follower',
    });
    cache.delete(TABLES.SERVICES, TEST_JOINER_REPLACEMENT_REPLICA_ID);
    cache.tombstoneStore.clear();
    await buildRegistrationOwner({
      bootIncarnation: 1,
      durableStateDetected: false,
      nowMs: 1000,
    }).registerNodeInCluster();
    cache.set(
      TABLES.SERVICES,
      TEST_JOINER_REPLACEMENT_REPLICA_ID,
      initialServiceRow,
    );

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
      readEndpointStorageIncarnation(cache, TEST_JOINER_NODE_ID_B),
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

    // 2. Complete data-directory wipe restart (durableStateDetected: false)
    // where local boot reservation was also lost and reset to 1 (bootIncarnation: 1)
    // while old NODES row is still ACTIVE/CONNECTED at boot_incarnation = 2 and
    // SERVICES row is still ACTIVE in the cluster store, AND with clock rollback
    // (nowMs = 500 < completed_at = 2000):
    await buildRegistrationOwner({
      bootIncarnation: 1,
      durableStateDetected: false,
      nowMs: 500,
    }).registerNodeInCluster();
    const nodeAfterWipe = cache.get(TABLES.NODES, TEST_JOINER_NODE_ID_B);
    t.equal(
      nodeAfterWipe?.[COLUMN.BOOT_INCARNATION],
      3,
      'wiped-disk registration advances boot_incarnation from cluster floor (2 -> 3) even when local boot counter reset to 1',
    );
    t.equal(
      nodeAfterWipe?.[COLUMN.CREATED_AT],
      500,
      'wiped-disk registration refuses to reuse old ACTIVE NODES row and mints fresh row even under rolled-back clock',
    );
    t.equal(
      readEndpointStorageIncarnation(cache, TEST_JOINER_NODE_ID_B),
      3,
      'wiped-disk registration advances storageIncarnation to 3',
    );
    t.equal(
      updateWhereCalls.length,
      1,
      'lost-storage reconciliation invokes 4-argument ServicesOwner.updateService',
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

    // 3 & 4. Delete SERVICES row and clear all cache tombstones via
    // tombstoneStore.clear() while clock is rolled back
    // (node.created_at = 500 < operation.completed_at = 2000):
    // storageIncarnation (3 > 1) still supersedes the terminal ADD, AND a
    // retained operation lacking storageIncarnation metadata is also refused
    // when its SERVICES row is absent.
    cache.delete(TABLES.SERVICES, TEST_JOINER_REPLACEMENT_REPLICA_ID);
    t.equal(
      rebalancer.hasActiveServiceTombstone(TEST_JOINER_REPLACEMENT_REPLICA_ID),
      true,
      'deleting SERVICES row records a tombstone before clear()',
    );
    cache.tombstoneStore.clear();
    t.equal(
      rebalancer.hasActiveServiceTombstone(TEST_JOINER_REPLACEMENT_REPLICA_ID),
      false,
      'tombstoneStore.clear() removes all SERVICES tombstones',
    );
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
    const legacyOperationWithoutStorageIncarnation = {
      ...terminalAddOperation,
      operation_id: 'op-add-joiner-b-no-incarnation',
      steps_history: JSON.stringify([
        {
          step: WORKFLOW_STEP.ACTIVE,
          timestamp: 2000,
        },
      ]),
    };
    t.equal(
      rebalancer.isTerminalCreateSupersededByNodeRegistration(
        legacyOperationWithoutStorageIncarnation,
        TEST_JOINER_NODE_ID_B,
        TEST_JOINER_REPLACEMENT_REPLICA_ID,
      ),
      true,
      'retained terminal operation without storageIncarnation metadata is never synthesized when SERVICES row is absent',
    );
    const projectedReplicas = rebalancer.getCurrentReplicas();
    t.equal(
      projectedReplicas.some(
        (row) => row.replica_id === TEST_JOINER_REPLACEMENT_REPLICA_ID,
      ),
      false,
      'superseded terminal ADD does not project a ghost ACTIVE replica',
    );

    // 5. Boot-only historical operation metadata (targetNodeBootIncarnation: 1,
    // no targetNodeStorageIncarnation): readOperationTargetNodeStorageIncarnation
    // returns null, preserveOperationTargetNodeIncarnations does not fabricate
    // targetNodeStorageIncarnation, and terminal projection is withheld when
    // SERVICES row is absent.
    const bootOnlyOperation = {
      ...terminalAddOperation,
      operation_id: 'op-add-joiner-b-boot-only',
      steps_history: JSON.stringify([
        {
          step: WORKFLOW_STEP.ACTIVE,
          timestamp: 2000,
          [OPERATION_METADATA_KEY.TARGET_NODE_BOOT_INCARNATION]: 1,
        },
      ]),
    };
    const bootOnlyHistory = JSON.parse(bootOnlyOperation.steps_history);
    t.equal(
      readOperationTargetNodeBootIncarnation(
        bootOnlyOperation,
        bootOnlyHistory,
      ),
      1,
      'boot-only operation preserves targetNodeBootIncarnation = 1',
    );
    t.equal(
      readOperationTargetNodeStorageIncarnation(
        bootOnlyOperation,
        bootOnlyHistory,
      ),
      null,
      'readOperationTargetNodeStorageIncarnation returns null when storageIncarnation is absent',
    );
    const preservedStep = preserveOperationTargetNodeIncarnations(
      bootOnlyOperation,
      {step: WORKFLOW_STEP.ACTIVE, timestamp: 2500},
    );
    t.equal(
      preservedStep[OPERATION_METADATA_KEY.TARGET_NODE_BOOT_INCARNATION],
      1,
      'preserveOperationTargetNodeIncarnations keeps explicit boot incarnation',
    );
    t.equal(
      OPERATION_METADATA_KEY.TARGET_NODE_STORAGE_INCARNATION in preservedStep,
      false,
      'preserveOperationTargetNodeIncarnations never fabricates targetNodeStorageIncarnation from bootIncarnation',
    );
    // Restore coherent boot=2, storage=1 in cache (valid durable restart state)
    // and verify bootOnlyOperation is still withheld when SERVICES row is absent.
    cache.set(TABLES.NODES, TEST_JOINER_NODE_ID_B, {
      [COLUMN.NODE_ID]: TEST_JOINER_NODE_ID_B,
      [COLUMN.NODE_ADDRESS]: `ws://${TEST_JOINER_NODE_ID_B}:9000`,
      [COLUMN.STATUS]: NODE_STATE.ACTIVE,
      [COLUMN.CONNECTION_STATE]: NODE_STATE.READY,
      [COLUMN.BOOT_INCARNATION]: 2,
      [COLUMN.CREATED_AT]: 1000,
      [COLUMN.LAST_HEARTBEAT]: 3000,
    });
    cache.set(TABLES.NODE_ENDPOINTS, `ep-${TEST_JOINER_NODE_ID_B}-ws`, {
      [COLUMN.ENDPOINT_ID]: `ep-${TEST_JOINER_NODE_ID_B}-ws`,
      [COLUMN.NODE_ID]: TEST_JOINER_NODE_ID_B,
      [COLUMN.TRANSPORT_TYPE]: 'websocket',
      [COLUMN.ADDRESS]: `ws://${TEST_JOINER_NODE_ID_B}:9000`,
      [COLUMN.STATUS]: 'active',
      [COLUMN.BOOT_INCARNATION]: 2,
      [COLUMN.METADATA]: JSON.stringify({storageIncarnation: 1}),
    });
    t.equal(
      rebalancer.isTerminalCreateSupersededByNodeRegistration(
        bootOnlyOperation,
        TEST_JOINER_NODE_ID_B,
        TEST_JOINER_REPLACEMENT_REPLICA_ID,
      ),
      true,
      'boot-only operation metadata is withheld when SERVICES row is absent',
    );
    t.equal(
      rebalancer.isTerminalCreateSupersededByNodeRegistration(
        terminalAddOperation,
        TEST_JOINER_NODE_ID_B,
        TEST_JOINER_REPLACEMENT_REPLICA_ID,
      ),
      false,
      'valid same-storage durable restart (boot 1 -> 2, storageIncarnation 1 in NODE_ENDPOINTS) remains authorized',
    );

    // 6. Staggered NODES vs NODE_ENDPOINTS delivery in both orders using
    // persisted-schema-conformant rows (no storage_incarnation column on NODES):
    // Order A: new NODES (boot 3) arrives before new NODE_ENDPOINTS (boot 3)
    // while old NODE_ENDPOINTS (boot 1, storageIncarnation 1) is still in cache.
    cache.set(TABLES.NODES, TEST_JOINER_NODE_ID_B, {
      [COLUMN.NODE_ID]: TEST_JOINER_NODE_ID_B,
      [COLUMN.NODE_ADDRESS]: `ws://${TEST_JOINER_NODE_ID_B}:9000`,
      [COLUMN.STATUS]: NODE_STATE.ACTIVE,
      [COLUMN.CONNECTION_STATE]: NODE_STATE.READY,
      [COLUMN.BOOT_INCARNATION]: 3,
      [COLUMN.CREATED_AT]: 4000,
      [COLUMN.LAST_HEARTBEAT]: 4000,
    });
    cache.set(TABLES.NODE_ENDPOINTS, `ep-${TEST_JOINER_NODE_ID_B}-ws`, {
      [COLUMN.ENDPOINT_ID]: `ep-${TEST_JOINER_NODE_ID_B}-ws`,
      [COLUMN.NODE_ID]: TEST_JOINER_NODE_ID_B,
      [COLUMN.TRANSPORT_TYPE]: 'websocket',
      [COLUMN.ADDRESS]: `ws://${TEST_JOINER_NODE_ID_B}:9000`,
      [COLUMN.STATUS]: 'active',
      [COLUMN.BOOT_INCARNATION]: 1,
      [COLUMN.METADATA]: JSON.stringify({storageIncarnation: 1}),
    });
    t.same(
      resolveTargetNodeIncarnationSnapshot(cache, TEST_JOINER_NODE_ID_B),
      {bootIncarnation: 3, storageIncarnation: null},
      'Order A staggered delivery (NODES boot 3, NODE_ENDPOINTS boot 1) yields storageIncarnation: null',
    );
    t.equal(
      rebalancer.isTerminalCreateSupersededByNodeRegistration(
        terminalAddOperation,
        TEST_JOINER_NODE_ID_B,
        TEST_JOINER_REPLACEMENT_REPLICA_ID,
      ),
      true,
      'Order A staggered delivery withholds terminal projection until coherent NODE_ENDPOINTS arrives',
    );
    // Now new NODE_ENDPOINTS (boot 3) arrives:
    // - If durable restart preserved storageIncarnation: 1 -> authorized (false)
    // - If wiped-disk rejoin minted storageIncarnation: 3 -> superseded (true)
    cache.set(TABLES.NODE_ENDPOINTS, `ep-${TEST_JOINER_NODE_ID_B}-ws`, {
      [COLUMN.ENDPOINT_ID]: `ep-${TEST_JOINER_NODE_ID_B}-ws`,
      [COLUMN.NODE_ID]: TEST_JOINER_NODE_ID_B,
      [COLUMN.TRANSPORT_TYPE]: 'websocket',
      [COLUMN.ADDRESS]: `ws://${TEST_JOINER_NODE_ID_B}:9000`,
      [COLUMN.STATUS]: 'active',
      [COLUMN.BOOT_INCARNATION]: 3,
      [COLUMN.METADATA]: JSON.stringify({storageIncarnation: 1}),
    });
    t.equal(
      rebalancer.isTerminalCreateSupersededByNodeRegistration(
        terminalAddOperation,
        TEST_JOINER_NODE_ID_B,
        TEST_JOINER_REPLACEMENT_REPLICA_ID,
      ),
      false,
      'Order A coherent NODE_ENDPOINTS (boot 3, storage 1) authorizes projection',
    );
    cache.set(TABLES.NODE_ENDPOINTS, `ep-${TEST_JOINER_NODE_ID_B}-ws`, {
      [COLUMN.ENDPOINT_ID]: `ep-${TEST_JOINER_NODE_ID_B}-ws`,
      [COLUMN.NODE_ID]: TEST_JOINER_NODE_ID_B,
      [COLUMN.TRANSPORT_TYPE]: 'websocket',
      [COLUMN.ADDRESS]: `ws://${TEST_JOINER_NODE_ID_B}:9000`,
      [COLUMN.STATUS]: 'active',
      [COLUMN.BOOT_INCARNATION]: 3,
      [COLUMN.METADATA]: JSON.stringify({storageIncarnation: 3}),
    });
    t.equal(
      rebalancer.isTerminalCreateSupersededByNodeRegistration(
        terminalAddOperation,
        TEST_JOINER_NODE_ID_B,
        TEST_JOINER_REPLACEMENT_REPLICA_ID,
      ),
      true,
      'Order A coherent NODE_ENDPOINTS (boot 3, storage 3) supersedes projection',
    );

    // Order B: new NODE_ENDPOINTS (boot 3, storage 1) arrives before new NODES
    // (boot 3) while old NODES (boot 1) is still in cache.
    cache.set(TABLES.NODES, TEST_JOINER_NODE_ID_B, {
      [COLUMN.NODE_ID]: TEST_JOINER_NODE_ID_B,
      [COLUMN.NODE_ADDRESS]: `ws://${TEST_JOINER_NODE_ID_B}:9000`,
      [COLUMN.STATUS]: NODE_STATE.ACTIVE,
      [COLUMN.CONNECTION_STATE]: NODE_STATE.READY,
      [COLUMN.BOOT_INCARNATION]: 1,
      [COLUMN.CREATED_AT]: 1000,
      [COLUMN.LAST_HEARTBEAT]: 1000,
    });
    cache.set(TABLES.NODE_ENDPOINTS, `ep-${TEST_JOINER_NODE_ID_B}-ws`, {
      [COLUMN.ENDPOINT_ID]: `ep-${TEST_JOINER_NODE_ID_B}-ws`,
      [COLUMN.NODE_ID]: TEST_JOINER_NODE_ID_B,
      [COLUMN.TRANSPORT_TYPE]: 'websocket',
      [COLUMN.ADDRESS]: `ws://${TEST_JOINER_NODE_ID_B}:9000`,
      [COLUMN.STATUS]: 'active',
      [COLUMN.BOOT_INCARNATION]: 3,
      [COLUMN.METADATA]: JSON.stringify({storageIncarnation: 1}),
    });
    t.same(
      resolveTargetNodeIncarnationSnapshot(cache, TEST_JOINER_NODE_ID_B),
      {bootIncarnation: 1, storageIncarnation: null},
      'Order B staggered delivery (NODES boot 1, NODE_ENDPOINTS boot 3) yields storageIncarnation: null',
    );
    t.equal(
      rebalancer.isTerminalCreateSupersededByNodeRegistration(
        terminalAddOperation,
        TEST_JOINER_NODE_ID_B,
        TEST_JOINER_REPLACEMENT_REPLICA_ID,
      ),
      true,
      'Order B staggered delivery withholds terminal projection until NODES boot 3 arrives',
    );
    cache.set(TABLES.NODES, TEST_JOINER_NODE_ID_B, {
      [COLUMN.NODE_ID]: TEST_JOINER_NODE_ID_B,
      [COLUMN.NODE_ADDRESS]: `ws://${TEST_JOINER_NODE_ID_B}:9000`,
      [COLUMN.STATUS]: NODE_STATE.ACTIVE,
      [COLUMN.CONNECTION_STATE]: NODE_STATE.READY,
      [COLUMN.BOOT_INCARNATION]: 3,
      [COLUMN.CREATED_AT]: 1000,
      [COLUMN.LAST_HEARTBEAT]: 4000,
    });
    t.equal(
      rebalancer.isTerminalCreateSupersededByNodeRegistration(
        terminalAddOperation,
        TEST_JOINER_NODE_ID_B,
        TEST_JOINER_REPLACEMENT_REPLICA_ID,
      ),
      false,
      'Order B authorizes projection once NODES boot 3 arrives to match NODE_ENDPOINTS boot 3',
    );
  } finally {
    await coordinator.shutdown();
    resetTestEnvironment();
  }
});
