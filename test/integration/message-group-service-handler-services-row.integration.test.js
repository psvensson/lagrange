import {test} from '../../src/test-helpers/tap.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {MessageGroupServiceHandler} from
  '../../src/node/message-group-service-handler.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';

function flushImmediate() {
  return new Promise((resolve) => setImmediate(resolve));
}

function seedReplicaOperation(
  cache,
  operationId,
  groupId,
  replicaId,
  nodeId,
) {
  const now = Date.now();
  cache.applySystemTableChange(
    SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    'INSERT',
    {
      operation_id: operationId,
      type: 'REPLACE',
      partition_id: groupId,
      replica_id: replicaId,
      source_node_id: nodeId,
      target_node_id: nodeId,
      status: ReplicaStatus.PENDING,
      workflow_step: WORKFLOW_STEP.PENDING,
      created_at: now,
      updated_at: now,
      steps_history: '[]',
    },
  );
}

function createMockCdc(cache) {
  return {
    async upsertSystemTableRow(tableName, data) {
      cache.applySystemTableChange(tableName, 'INSERT', data);
      return {success: true};
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      cache.applySystemTableChange(
        tableName,
        'UPDATE',
        {...whereClause, ...data},
      );
      return {success: true};
    },
    async deleteSystemTableRow(tableName, whereClause) {
      cache.applySystemTableChange(tableName, 'DELETE', whereClause);
      return {success: true};
    },
  };
}

function createMockExecutorOutcomeEmitter(cache) {
  return {
    emitOutcome(_outcomeType, operationId, workflowStep) {
      cache.applySystemTableChange(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        'UPDATE',
        {
          operation_id: operationId,
          workflow_step: workflowStep,
          updated_at: Date.now(),
        },
      );
    },
  };
}

test('MessageGroupServiceHandler services-row integration', async (t) => {
  await t.test('publishes and removes services rows through the cache-visible CDC path',
    async (t) => {
      const cache = new SystemTableCache();
      const cdcIntegrationService = createMockCdc(cache);
      const localServices = new Map();
      const nodeId = 'integration-node';
      const groupId = 'mg-1';
      const replicaId = 'mg-1-r4';

      seedReplicaOperation(
        cache,
        'op-create',
        groupId,
        replicaId,
        nodeId,
      );

      const handler = new MessageGroupServiceHandler({
        nodeId,
        systemTableCache: cache,
        cdcIntegrationService,
        executorOutcomeEmitter: createMockExecutorOutcomeEmitter(cache),
        messageRouter: {
          isRegistered: () => true,
        },
        createMessageGroupReplica: async (options) => {
          localServices.set(options.replicaId, {
            replicaId: options.replicaId,
            groupId: options.groupId,
            getRole() {
              return 'follower';
            },
          });
        },
        startMessageGroupReplica: async () => {},
        stopMessageGroupReplica: async (options) => {
          localServices.delete(options.replicaId);
        },
        resolveLocalMessageGroupReplica: (localReplicaId) =>
          localServices.get(localReplicaId) || null,
      });
      handler.initialize();
      t.teardown(() => handler.shutdown());

      const createResponse = await handler.handleCreateReplica({
        [ReplicaOperationField.OPERATION_ID]: 'op-create',
        [ReplicaOperationField.ENTITY_ID]: groupId,
        [ReplicaOperationField.REPLICA_ID]: replicaId,
      });

      t.equal(
        createResponse.status,
        ReplicaOperationResponseStatus.INITIATED,
        'create request should be acknowledged immediately',
      );

      await flushImmediate();
      await flushImmediate();

      const createdRow = cache.get(
        SYSTEM_TABLE_NAME.SERVICES,
        replicaId,
      );
      t.equal(createdRow?.service_id, replicaId);
      t.equal(createdRow?.group_id, groupId);
      t.equal(createdRow?.node_id, nodeId);
      t.equal(createdRow?.status, ReplicaStatus.ACTIVE);

      const createOperation = cache.get(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        'op-create',
      );
      t.equal(
        createOperation?.workflow_step,
        WORKFLOW_STEP.ACTIVE,
        'operation should advance only after the services row is present',
      );

      seedReplicaOperation(
        cache,
        'op-remove',
        groupId,
        replicaId,
        nodeId,
      );

      const removeResponse = await handler.handleRemoveReplica({
        [ReplicaOperationField.OPERATION_ID]: 'op-remove',
        [ReplicaOperationField.ENTITY_ID]: groupId,
        [ReplicaOperationField.REPLICA_ID]: replicaId,
      });

      t.equal(
        removeResponse.status,
        ReplicaOperationResponseStatus.INITIATED,
        'remove request should be acknowledged immediately',
      );

      await flushImmediate();
      await flushImmediate();

      t.equal(
        cache.get(SYSTEM_TABLE_NAME.SERVICES, replicaId),
        undefined,
        'services row should be removed after local replica shutdown',
      );

      const removeOperation = cache.get(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        'op-remove',
      );
      t.equal(removeOperation?.workflow_step, WORKFLOW_STEP.REMOVED);
    });
});
