/**
 * Quest replica-retirement-terminal-actuals-coherence — guard tests.
 *
 * Contract under guard: a replica-retiring operation (REMOVE, or the
 * source-retirement half of a REPLACE) may rest terminal
 * (workflow_step REMOVED / status removed) only when the retired
 * replica's `services` row has actually been retired — the row is gone
 * (or no longer active), a services-row delete was at least issued, or
 * a follow-up retirement operation exists to cure the surplus within
 * the bounded reconcile window.
 *
 * Mechanism reproduced (hypothesis 1 — observed-completion inference):
 * the STOPPING reconciler trusts a single authoritative services read
 * that SUCCEEDS with zero rows as proof of retirement.
 * `getActualReplicaObservation`
 * (src/rebalancer/replica-operation-repository-observation-methods.js)
 * classifies success-with-no-rows as ABSENT, deliberately skipping the
 * cache fallback because the read "succeeded", and the caller
 * `observeStoppingReplicaProgress` disables the partition+node
 * fallback. `reconcileStoppingOperationProgress`
 * (src/rebalancer/operation-workflow-recovery-observation.js) then
 * calls completeOperation on ABSENT without dispatching any delete and
 * without cross-checking the cache. One lagging or diverged
 * authoritative services-p1 read (the 'Bootstrap snapshot diverged
 * from local authoritative partition state' shape, where the
 * authoritative store holds fewer rows than the cache) is enough to
 * drive a retirement terminal while its actuals still exist — and the
 * terminal record is absorbing: once the read heals, nothing re-opens
 * the operation or retires the surviving row.
 *
 * The fault is injected at the real seam (the gateway's authoritative
 * read returning {success: true, rows: []}), not by overriding
 * repository logic, so the production ABSENT classification and the
 * production completion decision both run for real.
 *
 * These tests are RED on current HEAD by design: they assert the
 * correct coherence contract, which today's owner violates. A fix that
 * refuses phantom-absent completion (or retires actuals before
 * terminal) turns them green without weakening the surplus-REMOVE
 * fence, count/diversity safety, or quorum admission — the scenarios
 * here pass those gates legitimately (4 active replicas, minimum 3,
 * three distinct surviving nodes).
 */

import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {createTestCoordinator} from './test-helpers.js';

const GUARD_ACTIVE_STATUS = 'active';
const GUARD_MUTATION_DELETE = 'delete';
const GUARD_SERVICE_ID_PREDICATE = 'service_id = ?';
const GUARD_BOUNDED_RECONCILE_PASSES = 3;
const RETIRING_OPERATION_TYPES = new Set([
  OperationType.REMOVE,
  OperationType.REPLACE,
]);

function buildPartitionServiceRow({partitionId, replicaId, nodeId, raftRole}) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: partitionId,
    node_id: nodeId,
    service_type: 'partition',
    status: GUARD_ACTIVE_STATUS,
    raft_role: raftRole,
    address: `${nodeId}/partition/${replicaId}`,
  };
}

function buildReadyNodeRow(nodeId) {
  return {
    node_id: nodeId,
    status: 'active',
    connection_state: 'ready',
    ready_lease_expires_at: Date.now() + 60000,
  };
}

/**
 * Emulate one diverged/lagging authoritative services read at the real
 * gateway seam: while armed, the exact-replica-id status probe for
 * `replicaId` SUCCEEDS with zero rows (the diverged-bootstrap-snapshot
 * shape), while every other read — and every read after disarm — sees
 * the true rows.
 * @param {Object} coordinator
 * @param {string} replicaId
 * @return {{armed: boolean, phantomReadCount: number}}
 */
function installPhantomAbsentServiceRead(coordinator, replicaId) {
  const gateway = coordinator.controlPlaneSystemTableGateway;
  const originalRead = gateway.readAuthoritativeRows.bind(gateway);
  const fault = {armed: false, phantomReadCount: 0};
  gateway.readAuthoritativeRows = async (
    tableName,
    sql,
    params = [],
    options = {},
  ) => {
    if (
      fault.armed &&
      tableName === SYSTEM_TABLE_NAME.SERVICES &&
      String(sql).includes(GUARD_SERVICE_ID_PREDICATE) &&
      params[0] === replicaId
    ) {
      fault.phantomReadCount += 1;
      return {success: true, rows: []};
    }
    return originalRead(tableName, sql, params, options);
  };
  return fault;
}

/**
 * Record every services-row delete the coordinator submits through the
 * gateway, so the guard can prove no delete was ever issued for the
 * "retired" replica.
 * @param {Object} coordinator
 * @return {{deletes: Array<Object>}}
 */
function recordServicesDeleteMutations(coordinator) {
  const gateway = coordinator.controlPlaneSystemTableGateway;
  const originalSubmit = gateway.submitMutation.bind(gateway);
  const record = {deletes: []};
  gateway.submitMutation = async (mutation, options = {}) => {
    if (
      mutation?.operation === GUARD_MUTATION_DELETE &&
      mutation?.tableName === SYSTEM_TABLE_NAME.SERVICES
    ) {
      record.deletes.push({...mutation});
    }
    return originalSubmit(mutation, options);
  };
  return record;
}

function listFollowUpRetirementOperations(coordinator, partitionId, operationId) {
  const rows =
    coordinator.systemTableCache.getAll(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    ) || [];
  return rows.filter((row) =>
    row.operation_id !== operationId &&
    row.partition_id === partitionId &&
    RETIRING_OPERATION_TYPES.has(row.type));
}

function buildInitiatedDeliveryRouter(deliveries) {
  return {
    async deliver(target, payload) {
      deliveries.push({target, payload});
      return {
        acknowledged: true,
        status: ReplicaOperationResponseStatus.INITIATED,
      };
    },
    getConnectionState: () => 'connected',
    pingNode: async () => true,
    isOutboundQueueAvailable: () => true,
  };
}

async function runBoundedReconcileWindow(coordinator) {
  for (let pass = 0; pass < GUARD_BOUNDED_RECONCILE_PASSES; pass++) {
    await coordinator.checkTimeouts();
  }
}

function assertRetirementActualsCoherence(t, {
  label,
  persistedOperation,
  retiredReplicaRow,
  servicesDeleteRecord,
  followUpRetirements,
}) {
  const terminalRemoved =
    persistedOperation?.workflowStep === WORKFLOW_STEP.REMOVED;
  const rowStillActive =
    retiredReplicaRow?.status === GUARD_ACTIVE_STATUS;
  const retiredReplicaDeleteIssued = servicesDeleteRecord.deletes.length > 0;
  const cureVisible = followUpRetirements.length > 0;
  const actualsRetired =
    !rowStillActive || retiredReplicaDeleteIssued || cureVisible;

  t.comment(`${label}: workflowStep=${persistedOperation?.workflowStep} ` +
    `status=${persistedOperation?.status} ` +
    `rowStillActive=${rowStillActive} ` +
    `deletesIssued=${servicesDeleteRecord.deletes.length} ` +
    `followUpRetirements=${followUpRetirements.length}`);

  t.ok(
    !terminalRemoved || actualsRetired,
    `${label}: a terminal REMOVED retirement must imply retired actuals — ` +
      'the retired replica\'s active services row is gone, a services-row ' +
      'delete was issued, or a follow-up retirement cure is planned within ' +
      'the bounded reconcile window',
  );
}

test('REMOVE must not rest terminal REMOVED while the retired ' +
  'replica\'s active services row survives (phantom-absent ' +
  'authoritative read)', async (t) => {
  const TEST_PARTITION_ID = 'guard-table-p1';
  const RETIRING_REPLICA_ID = 'guard-table-p1-r4';
  const deliveries = [];
  const coordinator = createTestCoordinator({
    nodeId: 'seed-node',
    enableTimeouts: false,
    messageRouter: buildInitiatedDeliveryRouter(deliveries),
    tablePolicyService: {
      getPolicyForPartition: () => ({minReplicaCount: 3}),
    },
    cacheData: {
      nodes: [
        buildReadyNodeRow('seed-node'),
        buildReadyNodeRow('node-b'),
        buildReadyNodeRow('node-c'),
      ],
      services: [
        buildPartitionServiceRow({
          partitionId: TEST_PARTITION_ID,
          replicaId: 'guard-table-p1-r1',
          nodeId: 'seed-node',
          raftRole: 'leader',
        }),
        buildPartitionServiceRow({
          partitionId: TEST_PARTITION_ID,
          replicaId: 'guard-table-p1-r2',
          nodeId: 'node-b',
          raftRole: 'follower',
        }),
        buildPartitionServiceRow({
          partitionId: TEST_PARTITION_ID,
          replicaId: 'guard-table-p1-r3',
          nodeId: 'node-c',
          raftRole: 'follower',
        }),
        buildPartitionServiceRow({
          partitionId: TEST_PARTITION_ID,
          replicaId: RETIRING_REPLICA_ID,
          nodeId: 'seed-node',
          raftRole: 'follower',
        }),
      ],
    },
  });

  const servicesDeleteRecord = recordServicesDeleteMutations(coordinator);
  const phantomReadFault =
    installPhantomAbsentServiceRead(coordinator, RETIRING_REPLICA_ID);

  try {
    // Surplus drain: 4 active replicas, minimum 3, three distinct
    // surviving nodes — the remove-safety fences legitimately admit
    // this retirement.
    const operation = await coordinator.createOperation({
      type: OperationType.REMOVE,
      partitionId: TEST_PARTITION_ID,
      nodeId: 'seed-node',
      replicaId: RETIRING_REPLICA_ID,
    });

    const dispatchResult = await coordinator.executeOperation(operation);
    t.equal(
      dispatchResult?.success,
      true,
      'surplus REMOVE should pass the safety fences and dispatch',
    );
    t.equal(
      operation.workflowStep,
      WORKFLOW_STEP.STOPPING,
      'INITIATED remove dispatch should place the REMOVE in STOPPING',
    );
    const removeDispatches = deliveries.filter((entry) =>
      entry.payload?.type === ReplicaOperationMessageType.REMOVE_REPLICA);
    t.equal(
      removeDispatches.length,
      1,
      'exactly one REMOVE_REPLICA dispatch should have been delivered',
    );

    // The handler never reports back (slow drain on the seed) while the
    // coordinator's reconcile observes one diverged authoritative read.
    phantomReadFault.armed = true;
    coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs = 0;
    await coordinator.checkTimeouts();
    phantomReadFault.armed = false;

    t.ok(
      phantomReadFault.phantomReadCount > 0,
      'the STOPPING reconcile should have consumed the phantom-absent ' +
        'authoritative read (mechanism precondition)',
    );

    // The misread was transient: every later authoritative read sees
    // the surviving row again. Give the owner a bounded reconcile
    // window to self-correct.
    await runBoundedReconcileWindow(coordinator);

    const persistedOperation =
      await coordinator.getOperation(operation.operationId);
    const retiredReplicaRow = coordinator.systemTableCache.get(
      SYSTEM_TABLE_NAME.SERVICES,
      RETIRING_REPLICA_ID,
    );
    const followUpRetirements = listFollowUpRetirementOperations(
      coordinator,
      TEST_PARTITION_ID,
      operation.operationId,
    );

    assertRetirementActualsCoherence(t, {
      label: 'REMOVE guard',
      persistedOperation,
      retiredReplicaRow,
      servicesDeleteRecord,
      followUpRetirements,
    });
  } finally {
    await coordinator.shutdown();
  }
});

test('REPLACE must not rest terminal REMOVED while the retired ' +
  'source replica\'s active services row survives (phantom-absent ' +
  'authoritative read)', async (t) => {
  const TEST_GROUP_ID = 'mg-1';
  const SOURCE_REPLICA_ID = 'mg-1-r1';
  const deliveries = [];
  const coordinator = createTestCoordinator({
    nodeId: 'seed-node',
    enableTimeouts: false,
    messageRouter: buildInitiatedDeliveryRouter(deliveries),
    storageAdmissionService: {
      async checkReplace() {
        return {
          allowed: true,
          decision: 'allow',
          decisionType: 'admitted',
        };
      },
    },
    storageAccountingService: {
      estimateReplicaBytes() {
        return 0;
      },
    },
    cacheData: {
      services: [
        {
          service_id: SOURCE_REPLICA_ID,
          replica_id: SOURCE_REPLICA_ID,
          service_type: 'message_group',
          group_id: TEST_GROUP_ID,
          node_id: 'seed-node',
          status: GUARD_ACTIVE_STATUS,
          address: `seed-node/message-group/${SOURCE_REPLICA_ID}`,
        },
        {
          service_id: 'mg-1-r2',
          replica_id: 'mg-1-r2',
          service_type: 'message_group',
          group_id: TEST_GROUP_ID,
          node_id: 'node-2',
          status: GUARD_ACTIVE_STATUS,
          address: 'node-2/message-group/mg-1-r2',
        },
      ],
    },
  });

  const servicesDeleteRecord = recordServicesDeleteMutations(coordinator);
  const phantomReadFault =
    installPhantomAbsentServiceRead(coordinator, SOURCE_REPLICA_ID);

  try {
    const operation = await coordinator.createOperation({
      type: OperationType.REPLACE,
      partitionId: TEST_GROUP_ID,
      entityType: 'message_group',
      entityId: TEST_GROUP_ID,
      nodeId: 'node-3',
      sourceNodeId: 'seed-node',
      replicaId: SOURCE_REPLICA_ID,
    });

    // The universal remove-safety floor (lenient REPLACE) evaluates the
    // source removal against the replacement replica holding quorum:
    // seed the minted target replica as voter-ready.
    coordinator.systemTableCache.upsert(SYSTEM_TABLE_NAME.SERVICES, {
      service_id: operation.replicaId,
      replica_id: operation.replicaId,
      partition_id: TEST_GROUP_ID,
      node_id: 'node-3',
      service_type: 'partition',
      status: GUARD_ACTIVE_STATUS,
      raft_role: 'leader',
      address: `node-3/partition/${operation.replicaId}`,
    });

    await coordinator.executeOperation(operation);
    await coordinator.updateStep(operation, WORKFLOW_STEP.ACTIVE);
    await coordinator.executeOperation(operation);

    t.equal(
      operation.workflowStep,
      WORKFLOW_STEP.STOPPING,
      'INITIATED source-removal dispatch should place the REPLACE in ' +
        'STOPPING',
    );

    // The source handler never reports back while the coordinator's
    // reconcile observes one diverged authoritative read of the source
    // replica's row.
    phantomReadFault.armed = true;
    coordinator.workflowOwner.incompleteOperationQueryEmptyBackoffMs = 0;
    await coordinator.checkTimeouts();
    phantomReadFault.armed = false;

    t.ok(
      phantomReadFault.phantomReadCount > 0,
      'the STOPPING reconcile should have consumed the phantom-absent ' +
        'authoritative read (mechanism precondition)',
    );

    await runBoundedReconcileWindow(coordinator);

    const persistedOperation =
      await coordinator.getOperation(operation.operationId);
    const retiredReplicaRow = coordinator.systemTableCache.get(
      SYSTEM_TABLE_NAME.SERVICES,
      SOURCE_REPLICA_ID,
    );
    const followUpRetirements = listFollowUpRetirementOperations(
      coordinator,
      TEST_GROUP_ID,
      operation.operationId,
    );

    assertRetirementActualsCoherence(t, {
      label: 'REPLACE guard',
      persistedOperation,
      retiredReplicaRow,
      servicesDeleteRecord,
      followUpRetirements,
    });
  } finally {
    await coordinator.shutdown();
  }
});
