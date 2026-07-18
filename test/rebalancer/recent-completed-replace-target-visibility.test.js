import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OPERATION_METADATA_KEY,
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  REBALANCE_COORDINATOR_SHARED,
} from '../../src/rebalancer/rebalance-coordinator-shared.js';
import {createTestCoordinator} from './test-helpers.js';

const TEST_PRIORITY_PARTITION_ID = 'schema_operations-p1';
const TEST_NON_PRIORITY_PARTITION_ID = 'tables-p1';
const TEST_LEDGER_PARTITION_ID = 'replica_operations-p1';
const TEST_ENTITY_TYPE = 'partition';
const TEST_STABLE_REPLICA_ID = TEST_PRIORITY_PARTITION_ID + '-r2';
const TEST_COMPLETED_TARGET_REPLICA_ID =
  TEST_PRIORITY_PARTITION_ID + '-r4';
const TEST_NEW_TARGET_NODE_ID = 'node-new-target';
const TEST_COMPLETED_TARGET_NODE_ID = 'node-completed-target';
const TEST_RECENT_COMPLETION_AGE_MS = 1;
const TEST_EXPIRED_COMPLETION_AGE_MS =
  REBALANCE_COORDINATOR_SHARED.PRIORITY_RECENT_INTENT_TTL_MS + 1;
const TEST_LEASE_ERROR =
  'replace source replica is protected by a recent completed-target placement lease';
const TEST_LEDGER_LEASE_ERROR =
  'operation-ledger REPLACE is protected by a recent completed self-move lease';

function buildServiceRow(partitionId, replicaId, nodeId, status) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    service_type: TEST_ENTITY_TYPE,
    partition_id: partitionId,
    node_id: nodeId,
    status,
    address: nodeId + '/partition/' + replicaId,
  };
}

function buildCompletedReplaceRow(partitionId, completedAgeMs) {
  const nowMs = Date.now();
  return {
    operation_id: partitionId + '-completed-replace',
    type: OperationType.REPLACE,
    partition_id: partitionId,
    entity_type: TEST_ENTITY_TYPE,
    entity_id: partitionId,
    replica_id: partitionId + '-r4',
    source_node_id: 'node-original-source',
    target_node_id: TEST_COMPLETED_TARGET_NODE_ID,
    status: ReplicaStatus.REMOVED,
    workflow_step: WORKFLOW_STEP.REMOVED,
    steps_history: JSON.stringify([
      {
        step: WORKFLOW_STEP.PENDING,
        [OPERATION_METADATA_KEY.SOURCE_REPLICA_ID]: partitionId + '-r1',
      },
    ]),
    created_at: nowMs - completedAgeMs,
    updated_at: nowMs - completedAgeMs,
    completed_at: nowMs - completedAgeMs,
  };
}

function createVisibilityCoordinator({
  partitionId = TEST_PRIORITY_PARTITION_ID,
  targetStatus = ReplicaStatus.SYNCING,
  completedAgeMs = TEST_RECENT_COMPLETION_AGE_MS,
} = {}) {
  return createTestCoordinator({
    cacheData: {
      services: [
        buildServiceRow(
          partitionId,
          partitionId + '-r2',
          'node-stable-a',
          ReplicaStatus.ACTIVE,
        ),
        buildServiceRow(
          partitionId,
          partitionId + '-r3',
          'node-stable-b',
          ReplicaStatus.ACTIVE,
        ),
        buildServiceRow(
          partitionId,
          partitionId + '-r4',
          TEST_COMPLETED_TARGET_NODE_ID,
          targetStatus,
        ),
      ],
      replicaOperations: [
        buildCompletedReplaceRow(partitionId, completedAgeMs),
      ],
    },
  });
}

function buildReplaceMove(partitionId, sourceReplicaId, sourceNodeId) {
  return {
    type: OperationType.REPLACE,
    partitionId,
    entityType: TEST_ENTITY_TYPE,
    entityId: partitionId,
    nodeId: TEST_NEW_TARGET_NODE_ID,
    sourceNodeId,
    replicaId: sourceReplicaId,
  };
}

async function captureCreateError(coordinator, move) {
  try {
    await coordinator.createOperation(move);
  } catch (error) {
    return error;
  }
  return null;
}

test('recent completed REPLACE target visibility guard', async (t) => {
  await t.test(
    'holds a priority replacement while its completed target is still syncing',
    async (t) => {
      const coordinator = createVisibilityCoordinator();
      try {
        const error = await captureCreateError(
          coordinator,
          buildReplaceMove(
            TEST_PRIORITY_PARTITION_ID,
            TEST_COMPLETED_TARGET_REPLICA_ID,
            TEST_COMPLETED_TARGET_NODE_ID,
          ),
        );
        t.equal(error?.message, TEST_LEASE_ERROR);
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'waits for planner cache settlement despite an owner-active row',
    async (t) => {
      const coordinator = createVisibilityCoordinator();
      coordinator.getAuthoritativeEntityServiceRowsObservation = async () => ({
        available: true,
        rows: [
          buildServiceRow(
            TEST_PRIORITY_PARTITION_ID,
            TEST_COMPLETED_TARGET_REPLICA_ID,
            TEST_COMPLETED_TARGET_NODE_ID,
            ReplicaStatus.ACTIVE,
          ),
        ],
      });
      try {
        const error = await captureCreateError(
          coordinator,
          buildReplaceMove(
            TEST_PRIORITY_PARTITION_ID,
            TEST_COMPLETED_TARGET_REPLICA_ID,
            TEST_COMPLETED_TARGET_NODE_ID,
          ),
        );
        t.equal(error?.message, TEST_LEASE_ERROR);
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'allows the next legitimate move against a different original source',
    async (t) => {
      const coordinator = createVisibilityCoordinator();
      try {
        const operation = await coordinator.createOperation(
          buildReplaceMove(
            TEST_PRIORITY_PARTITION_ID,
            TEST_STABLE_REPLICA_ID,
            'node-stable-a',
          ),
        );
        t.equal(operation.type, OperationType.REPLACE);
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'leases out a second ledger REPLACE against a different original source',
    async (t) => {
      const coordinator = createVisibilityCoordinator({
        partitionId: TEST_LEDGER_PARTITION_ID,
      });
      try {
        const error = await captureCreateError(
          coordinator,
          buildReplaceMove(
            TEST_LEDGER_PARTITION_ID,
            TEST_LEDGER_PARTITION_ID + '-r2',
            'node-stable-a',
          ),
        );
        t.equal(error?.message, TEST_LEDGER_LEASE_ERROR);
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'releases the ledger self-move lease after the recent-intent TTL',
    async (t) => {
      const coordinator = createVisibilityCoordinator({
        partitionId: TEST_LEDGER_PARTITION_ID,
        completedAgeMs: TEST_EXPIRED_COMPLETION_AGE_MS,
      });
      try {
        const error = await captureCreateError(
          coordinator,
          buildReplaceMove(
            TEST_LEDGER_PARTITION_ID,
            TEST_LEDGER_PARTITION_ID + '-r2',
            'node-stable-a',
          ),
        );
        t.equal(error, null);
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  await t.test(
    'keeps an active completed target stable for the placement lease',
    async (t) => {
      const coordinator = createVisibilityCoordinator({
        targetStatus: ReplicaStatus.ACTIVE,
      });
      try {
        const error = await captureCreateError(
          coordinator,
          buildReplaceMove(
            TEST_PRIORITY_PARTITION_ID,
            TEST_COMPLETED_TARGET_REPLICA_ID,
            TEST_COMPLETED_TARGET_NODE_ID,
          ),
        );
        t.equal(error?.message, TEST_LEASE_ERROR);
      } finally {
        await coordinator.shutdown();
      }
    },
  );

  for (const targetStatus of [
    ReplicaStatus.FAILED,
    ReplicaStatus.REMOVED,
  ]) {
    await t.test(
      'allows explicit completed-target status ' + targetStatus,
      async (t) => {
        const coordinator = createVisibilityCoordinator({targetStatus});
        try {
          const error = await captureCreateError(
            coordinator,
            buildReplaceMove(
              TEST_PRIORITY_PARTITION_ID,
              TEST_COMPLETED_TARGET_REPLICA_ID,
              TEST_COMPLETED_TARGET_NODE_ID,
            ),
          );
          t.equal(error, null);
        } finally {
          await coordinator.shutdown();
        }
      },
    );
  }

  await t.test('releases the placement lease on owner-terminal evidence',
    async (t) => {
      const coordinator = createVisibilityCoordinator();
      coordinator.getAuthoritativeEntityServiceRowsObservation = async () => ({
        available: true,
        rows: [
          buildServiceRow(
            TEST_PRIORITY_PARTITION_ID,
            TEST_COMPLETED_TARGET_REPLICA_ID,
            TEST_COMPLETED_TARGET_NODE_ID,
            ReplicaStatus.FAILED,
          ),
        ],
      });
      try {
        const error = await captureCreateError(
          coordinator,
          buildReplaceMove(
            TEST_PRIORITY_PARTITION_ID,
            TEST_COMPLETED_TARGET_REPLICA_ID,
            TEST_COMPLETED_TARGET_NODE_ID,
          ),
        );
        t.equal(error, null);
      } finally {
        await coordinator.shutdown();
      }
    });

  await t.test('bounds the placement lease by the priority intent TTL',
    async (t) => {
      const coordinator = createVisibilityCoordinator({
        completedAgeMs: TEST_EXPIRED_COMPLETION_AGE_MS,
      });
      try {
        const error = await captureCreateError(
          coordinator,
          buildReplaceMove(
            TEST_PRIORITY_PARTITION_ID,
            TEST_COMPLETED_TARGET_REPLICA_ID,
            TEST_COMPLETED_TARGET_NODE_ID,
          ),
        );
        t.equal(error, null);
      } finally {
        await coordinator.shutdown();
      }
    });

  await t.test('does not apply the priority hold to ordinary partitions',
    async (t) => {
      const coordinator = createVisibilityCoordinator({
        partitionId: TEST_NON_PRIORITY_PARTITION_ID,
      });
      try {
        const error = await captureCreateError(
          coordinator,
          buildReplaceMove(
            TEST_NON_PRIORITY_PARTITION_ID,
            TEST_NON_PRIORITY_PARTITION_ID + '-r4',
            TEST_COMPLETED_TARGET_NODE_ID,
          ),
        );
        t.equal(error, null);
      } finally {
        await coordinator.shutdown();
      }
    });
});
