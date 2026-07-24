import Database from 'better-sqlite3';

import {test} from '../../src/test-helpers/tap.js';
import {REPLICA_OPERATIONS_SCHEMA} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {generateCreateIndexSQL, generateCreateTableSQL} from
  '../../src/bootstrap/system-table-schema-sql.js';
import {UNIFIED_SERVICE_TYPE} from
  '../../src/constants/unified-service-lifecycle.js';
import {
  REPLICA_OPERATION_INSERT_DISPOSITION,
} from '../../src/rebalancer/replica-operation-insert-disposition.js';
import {OperationType, ReplicaStatus} from
  '../../src/rebalancer/replica-status.js';
import {
  buildRuntimeServiceTargetClaimKey,
} from '../../src/rebalancer/runtime-service-replica-identity.js';
import {createTestCoordinator} from './test-helpers.js';

const ENTITY_ID = 'svc-runtime-target-claim';
const SOURCE_NODE_ID = 'node-target-claim-source';
const TARGET_NODE_ID = 'node-target-claim-target';
const SOURCE_REPLICA_ID = `${ENTITY_ID}-r1`;
const STABLE_REPLICA_ID = `${ENTITY_ID}-r2`;
const FIRST_TARGET_REPLICA_ID = `${ENTITY_ID}-r3`;
const SECOND_TARGET_REPLICA_ID = `${ENTITY_ID}-r4`;

function buildService(replicaId, nodeId) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    service_type: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    node_id: nodeId,
    status: ReplicaStatus.ACTIVE,
  };
}

function buildRuntimeOperationRow(operationId, targetClaimKey) {
  return {
    operation_id: operationId,
    type: OperationType.ADD,
    partition_id: ENTITY_ID,
    entity_type: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    entity_id: ENTITY_ID,
    replica_id: FIRST_TARGET_REPLICA_ID,
    target_claim_key: targetClaimKey,
    source_node_id: SOURCE_NODE_ID,
    target_node_id: TARGET_NODE_ID,
    status: ReplicaStatus.PENDING,
    workflow_step: 'PENDING',
    created_at: 1,
    updated_at: 1,
    completed_at: null,
    lease_expires_at: null,
    error_message: null,
    steps_history: '[]',
  };
}

test('replica_operations schema atomically rejects duplicate runtime target ' +
  'claims', async (t) => {
  const database = new Database(':memory:');
  try {
    database.exec(generateCreateTableSQL(REPLICA_OPERATIONS_SCHEMA));
    for (const indexSql of generateCreateIndexSQL(
      REPLICA_OPERATIONS_SCHEMA,
    )) {
      database.exec(indexSql);
    }
    const claimKey = buildRuntimeServiceTargetClaimKey(
      FIRST_TARGET_REPLICA_ID,
      ENTITY_ID,
    );
    const insert = database.prepare(`
      INSERT INTO replica_operations (
        operation_id, type, partition_id, entity_type, entity_id,
        replica_id, target_claim_key, source_node_id, target_node_id,
        status, workflow_step, created_at, updated_at, completed_at,
        lease_expires_at, error_message, steps_history
      ) VALUES (
        @operation_id, @type, @partition_id, @entity_type, @entity_id,
        @replica_id, @target_claim_key, @source_node_id, @target_node_id,
        @status, @workflow_step, @created_at, @updated_at, @completed_at,
        @lease_expires_at, @error_message, @steps_history
      )
    `);
    insert.run(buildRuntimeOperationRow('op-target-claim-a', claimKey));
    t.throws(
      () => insert.run(
        buildRuntimeOperationRow('op-target-claim-b', claimKey),
      ),
      /UNIQUE constraint failed/,
      'only one durable operation may claim a runtime target identity',
    );
  } finally {
    database.close();
  }
});

test('distinct-intent target conflict reallocates through the canonical ' +
  'operation owner', async (t) => {
  const coordinator = createTestCoordinator({
    cacheData: {
      services: [
        buildService(SOURCE_REPLICA_ID, SOURCE_NODE_ID),
        buildService(STABLE_REPLICA_ID, TARGET_NODE_ID),
      ],
    },
    enableTimeouts: false,
    nodeId: SOURCE_NODE_ID,
  });
  const persistedReplicaIds = [];
  coordinator.persistNewOperation = async (operation) => {
    persistedReplicaIds.push(operation.replicaId);
    if (persistedReplicaIds.length === 1) {
      return {
        persisted: true,
        disposition:
          REPLICA_OPERATION_INSERT_DISPOSITION.TARGET_CLAIM_CONFLICT,
        operation: {
          replicaId: FIRST_TARGET_REPLICA_ID,
        },
      };
    }
    return {
      persisted: true,
      disposition: REPLICA_OPERATION_INSERT_DISPOSITION.INSERTED,
      operation,
    };
  };

  try {
    const operation = await coordinator.createOperation({
      type: OperationType.ADD,
      partitionId: ENTITY_ID,
      entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      entityId: ENTITY_ID,
      nodeId: TARGET_NODE_ID,
    });
    t.same(
      persistedReplicaIds,
      [FIRST_TARGET_REPLICA_ID, SECOND_TARGET_REPLICA_ID],
      'the loser excludes the claimed ordinal before its bounded retry',
    );
    t.equal(operation.replicaId, SECOND_TARGET_REPLICA_ID);
    t.equal(
      operation.targetClaimKey,
      buildRuntimeServiceTargetClaimKey(
        SECOND_TARGET_REPLICA_ID,
        ENTITY_ID,
      ),
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('explicit opaque runtime ADD target is rejected before durable ' +
  'operation admission', async (t) => {
  const coordinator = createTestCoordinator({
    cacheData: {
      services: [
        buildService(SOURCE_REPLICA_ID, SOURCE_NODE_ID),
      ],
    },
    enableTimeouts: false,
    nodeId: SOURCE_NODE_ID,
  });
  let persistCalls = 0;
  coordinator.persistNewOperation = async () => {
    persistCalls++;
    throw new Error('opaque runtime target reached persistence');
  };

  try {
    await t.rejects(
      coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: ENTITY_ID,
        entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
        entityId: ENTITY_ID,
        nodeId: TARGET_NODE_ID,
        replicaId: 'replace-replica-explicit-opaque',
      }),
      {
        code: 'INVALID_RUNTIME_SERVICE_TARGET_IDENTITY',
      },
      'the coordinator rejects an explicit non-canonical target',
    );
    t.equal(
      persistCalls,
      0,
      'invalid runtime identity never reaches the durable operation ledger',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('same deterministic REPLACE intent adopts the persisted canonical ' +
  'winner when local snapshots derive another ordinal', async (t) => {
  const coordinator = createTestCoordinator({
    cacheData: {
      services: [
        buildService(SOURCE_REPLICA_ID, SOURCE_NODE_ID),
        buildService(STABLE_REPLICA_ID, TARGET_NODE_ID),
        buildService(FIRST_TARGET_REPLICA_ID, TARGET_NODE_ID),
      ],
    },
    enableTimeouts: false,
    nodeId: SOURCE_NODE_ID,
  });
  let localCandidate = null;
  coordinator.maybeRearmReusedPendingOperation =
    async (operation) => operation;
  coordinator.persistNewOperation = async (operation) => {
    localCandidate = operation;
    return {
      persisted: true,
      disposition: REPLICA_OPERATION_INSERT_DISPOSITION.EXISTING,
      operation: {
        ...operation,
        replicaId: FIRST_TARGET_REPLICA_ID,
        targetClaimKey: buildRuntimeServiceTargetClaimKey(
          FIRST_TARGET_REPLICA_ID,
          ENTITY_ID,
        ),
        sourceReplicaId: SOURCE_REPLICA_ID,
      },
    };
  };

  try {
    const operation = await coordinator.createOperation({
      type: OperationType.REPLACE,
      partitionId: ENTITY_ID,
      entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      entityId: ENTITY_ID,
      nodeId: TARGET_NODE_ID,
      sourceNodeId: SOURCE_NODE_ID,
      replicaId: SOURCE_REPLICA_ID,
    });
    t.equal(
      localCandidate.replicaId,
      SECOND_TARGET_REPLICA_ID,
      'the stale creator locally derives the later visible ordinal',
    );
    t.equal(
      operation.replicaId,
      FIRST_TARGET_REPLICA_ID,
      'the persisted same-intent winner remains authoritative',
    );
  } finally {
    await coordinator.shutdown();
  }
});
