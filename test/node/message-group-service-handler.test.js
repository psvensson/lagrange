/**
 * Unit tests for MessageGroupServiceHandler.
 */

import {beforeEach, describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {LoggingService} from '../../src/logging/logging-service.js';
import {MessageGroupServiceHandler} from
  '../../src/node/message-group-service-handler.js';
import {
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  EXECUTOR_OUTCOME_TYPE,
} from '../../src/rebalancer/executor-outcome-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  SERVICE_STATUS,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';

const TEST_ALREADY_ACTIVE_OPERATION_ID = 'op-message-group-already-active';
const TEST_ALREADY_ACTIVE_GROUP_ID = 'mg-1';
const TEST_ALREADY_ACTIVE_REPLICA_ID = 'mg-1-r4';
const TEST_ALREADY_ACTIVE_NODE_ID = 'test-node';

function initEnv() {
  process.env.NODE_ENV = 'test';
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createMockCache(data = {}) {
  const tables = {};
  for (const [tableName, rows] of Object.entries(data)) {
    tables[tableName] = new Map();
    for (const row of rows) {
      const key = row.operation_id || row.service_id || row.id;
      tables[tableName].set(key, row);
    }
  }

  return {
    get(tableName, key) {
      return tables[tableName]?.get(key) || null;
    },
    filter(tableName, predicate) {
      const map = tables[tableName];
      if (!map) {
        return [];
      }
      return [...map.values()].filter(predicate);
    },
  };
}

function createMockCdc() {
  const operations = [];
  const upserts = [];
  const updates = [];
  const deletes = [];
  return {
    operations,
    upserts,
    updates,
    deletes,
    async upsertSystemTableRow(tableName, data) {
      const entry = {type: 'upsert', tableName, data};
      operations.push(entry);
      upserts.push(entry);
      return {success: true};
    },
    async updateSystemTableRow(tableName, keyObj, updateData) {
      const entry = {type: 'update', tableName, keyObj, updateData};
      operations.push(entry);
      updates.push(entry);
    },
    async deleteSystemTableRow(tableName, whereClause) {
      const entry = {type: 'delete', tableName, whereClause};
      operations.push(entry);
      deletes.push(entry);
    },
  };
}

function createHandler(overrides = {}) {
  const calls = [];
  const cache = overrides.cache || createMockCache({
    services: [
      {
        service_id: 'mg-1-r1',
        service_type: 'message_group',
        group_id: 'mg-1',
        node_id: 'node-a',
      },
      {
        service_id: 'mg-1-r2',
        service_type: 'message_group',
        group_id: 'mg-1',
        node_id: 'node-b',
      },
      {
        service_id: 'mg-1-r3',
        service_type: 'message_group',
        group_id: 'mg-1',
        node_id: 'node-c',
      },
    ],
    replica_operations: overrides.operations || [],
  });
  const cdc = overrides.cdc || createMockCdc();

  const handler = new MessageGroupServiceHandler({
    nodeId: overrides.nodeId || 'test-node',
    systemTableCache: cache,
    cdcIntegrationService: cdc,
    createMessageGroupReplica: async (options) => {
      calls.push({method: 'create', options});
      if (overrides.createError) {
        throw new Error(overrides.createError);
      }
      return {created: true};
    },
    startMessageGroupReplica: async (options) => {
      calls.push({method: 'start', options});
      if (overrides.startError) {
        throw new Error(overrides.startError);
      }
      return {started: true};
    },
    stopMessageGroupReplica: async (options) => {
      calls.push({method: 'stop', options});
      if (overrides.stopError) {
        throw new Error(overrides.stopError);
      }
      return {stopped: true};
    },
    resolveLocalMessageGroupReplica:
      overrides.resolveLocalMessageGroupReplica || null,
    messageRouter: overrides.messageRouter || null,
    executorOutcomeEmitter: overrides.executorOutcomeEmitter || null,
  });
  handler.initialize();

  return {handler, cache, cdc, calls};
}

function flushImmediate() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('MessageGroupServiceHandler', () => {
  beforeEach(initEnv);

  it('registers with the message router service address', () => {
    const {handler} = createHandler();
    const registered = new Map();
    const router = {
      register(address, callback) {
        registered.set(address, callback);
      },
    };

    handler.registerWithRouter(router);

    assert.ok(
      registered.has('test-node/service/message-group-handler'),
    );
  });

  it('emits active workflow progress when create is already active',
    async () => {
      const emittedOutcomes = [];
      const {handler} = createHandler({
        executorOutcomeEmitter: {
          emitOutcome(outcomeType, operationId, workflowStep, options) {
            emittedOutcomes.push({
              outcomeType,
              operationId,
              workflowStep,
              options,
            });
          },
        },
      });
      handler.localReplicas.set(TEST_ALREADY_ACTIVE_REPLICA_ID, {
        replicaId: TEST_ALREADY_ACTIVE_REPLICA_ID,
        groupId: TEST_ALREADY_ACTIVE_GROUP_ID,
        status: ReplicaStatus.ACTIVE,
      });

      const response = await handler.handleCreateReplica({
        [ReplicaOperationField.OPERATION_ID]: TEST_ALREADY_ACTIVE_OPERATION_ID,
        [ReplicaOperationField.ENTITY_ID]: TEST_ALREADY_ACTIVE_GROUP_ID,
        [ReplicaOperationField.REPLICA_ID]: TEST_ALREADY_ACTIVE_REPLICA_ID,
      });

      assert.equal(
        response.status,
        ReplicaOperationResponseStatus.ALREADY_EXISTS,
      );
      assert.deepEqual(
        emittedOutcomes,
        [
          {
            outcomeType: EXECUTOR_OUTCOME_TYPE.MESSAGE_GROUP_CREATE_ACTIVE,
            operationId: TEST_ALREADY_ACTIVE_OPERATION_ID,
            workflowStep: WORKFLOW_STEP.ACTIVE,
            options: {
              replicaId: TEST_ALREADY_ACTIVE_REPLICA_ID,
            },
          },
        ],
      );
      assert.equal(response.nodeId, TEST_ALREADY_ACTIVE_NODE_ID);
    });

  it('creates a message-group replica from cache-derived peer topology',
    async () => {
      const {handler, cdc, calls} = createHandler({
        messageRouter: {
          isRegistered(address) {
            return address === 'test-node/message-group/mg-1-r4';
          },
        },
      });

      const response = await handler.handleCreateReplica({
        [ReplicaOperationField.OPERATION_ID]: 'op-create-1',
        [ReplicaOperationField.ENTITY_ID]: 'mg-1',
        [ReplicaOperationField.REPLICA_ID]: 'mg-1-r4',
      });

      assert.equal(
        response.status,
        ReplicaOperationResponseStatus.INITIATED,
      );

      await flushImmediate();
      await flushImmediate();

      assert.equal(calls.length, 2);
      assert.equal(calls[0].method, 'create');
      assert.equal(calls[1].method, 'start');
      assert.deepEqual(
        calls[0].options.replicaIds,
        ['mg-1-r1', 'mg-1-r2', 'mg-1-r3', 'mg-1-r4'],
      );
      assert.ok(
        calls[0].options.peerAddresses.includes(
          'node-a/message-group/mg-1-r1',
        ),
      );
      assert.ok(
        calls[0].options.peerAddresses.includes(
          'test-node/message-group/mg-1-r4',
        ),
      );
      assert.equal(
        handler.localReplicas.get('mg-1-r4')?.status,
        ReplicaStatus.ACTIVE,
      );
      assert.equal(cdc.updates.length, 0);
      assert.equal(cdc.upserts.length, 1);
      assert.equal(cdc.upserts[0].tableName, 'services');
      assert.equal(cdc.upserts[0].data.service_id, 'mg-1-r4');
      assert.equal(cdc.upserts[0].data.group_id, 'mg-1');
      assert.equal(cdc.upserts[0].data.node_id, 'test-node');
      assert.equal(cdc.upserts[0].data.status, SERVICE_STATUS.ACTIVE);
      assert.equal(cdc.operations[0].type, 'upsert');
    });

  it('creates a message-group replica from explicit topology when cache is sparse',
    async () => {
      const {handler, cdc, calls} = createHandler({
        cache: createMockCache({
          services: [],
          replica_operations: [],
        }),
        messageRouter: {
          isRegistered(address) {
            return address === 'test-node/message-group/mg-1-r4';
          },
        },
      });

      const response = await handler.handleCreateReplica({
        [ReplicaOperationField.OPERATION_ID]: 'op-create-explicit',
        [ReplicaOperationField.ENTITY_ID]: 'mg-1',
        [ReplicaOperationField.REPLICA_ID]: 'mg-1-r4',
        [ReplicaOperationField.REPLICA_IDS]: [
          'mg-1-r1',
          'mg-1-r2',
          'mg-1-r3',
          'mg-1-r4',
        ],
        [ReplicaOperationField.PEER_ADDRESSES]: [
          'node-a/message-group/mg-1-r1',
          'node-b/message-group/mg-1-r2',
          'node-c/message-group/mg-1-r3',
          'test-node/message-group/mg-1-r4',
        ],
      });

      assert.equal(
        response.status,
        ReplicaOperationResponseStatus.INITIATED,
      );

      await flushImmediate();
      await flushImmediate();

      assert.equal(calls.length, 2);
      assert.deepEqual(
        calls[0].options.replicaIds,
        ['mg-1-r1', 'mg-1-r2', 'mg-1-r3', 'mg-1-r4'],
      );
      assert.deepEqual(
        calls[0].options.peerAddresses,
        [
          'test-node/message-group/mg-1-r4',
          'node-a/message-group/mg-1-r1',
          'node-b/message-group/mg-1-r2',
          'node-c/message-group/mg-1-r3',
        ],
      );
      assert.equal(cdc.upserts.length, 1);
    });

  it('rejects incomplete explicit topology for a message-group replica',
    async () => {
      const {handler, calls} = createHandler({
        cache: createMockCache({
          services: [],
          replica_operations: [],
        }),
      });

      const response = await handler.handleCreateReplica({
        [ReplicaOperationField.OPERATION_ID]: 'op-create-invalid-topology',
        [ReplicaOperationField.ENTITY_ID]: 'mg-1',
        [ReplicaOperationField.REPLICA_ID]: 'mg-1-r4',
        [ReplicaOperationField.REPLICA_IDS]: ['mg-1-r4'],
        [ReplicaOperationField.PEER_ADDRESSES]: [
          'test-node/message-group/mg-1-r4',
        ],
      });

      assert.equal(response.status, ReplicaOperationResponseStatus.ERROR);
      assert.match(response.error, /requires canonical peer topology/);
      assert.equal(calls.length, 0);
    });

  it('fails closed when the local replica handler is not registered',
    async () => {
      const {handler, cdc, calls} = createHandler({
        messageRouter: {
          isRegistered() {
            return false;
          },
        },
      });

      const response = await handler.handleCreateReplica({
        [ReplicaOperationField.OPERATION_ID]: 'op-create-unregistered',
        [ReplicaOperationField.ENTITY_ID]: 'mg-1',
        [ReplicaOperationField.REPLICA_ID]: 'mg-1-r4',
      });

      assert.equal(
        response.status,
        ReplicaOperationResponseStatus.INITIATED,
      );

      await flushImmediate();
      await flushImmediate();

      assert.equal(calls.length, 2);
      assert.equal(
        handler.localReplicas.get('mg-1-r4')?.status,
        ReplicaStatus.FAILED,
      );
      assert.equal(
        cdc.upserts.length,
        0,
        'services row publication should fail closed until the replica handler is routable',
      );
      assert.equal(cdc.updates.length, 0);
    });

  it('removes an existing local message-group replica discovered via resolver',
    async () => {
      const {handler, cdc, calls} = createHandler({
        resolveLocalMessageGroupReplica: (replicaId) =>
          replicaId === 'mg-1-r1' ? {replicaId} : null,
      });

      const response = await handler.handleRemoveReplica({
        [ReplicaOperationField.OPERATION_ID]: 'op-remove-1',
        [ReplicaOperationField.ENTITY_ID]: 'mg-1',
        [ReplicaOperationField.REPLICA_ID]: 'mg-1-r1',
      });

      assert.equal(
        response.status,
        ReplicaOperationResponseStatus.INITIATED,
      );

      await flushImmediate();
      await flushImmediate();

      assert.equal(calls.length, 1);
      assert.equal(calls[0].method, 'stop');
      assert.equal(calls[0].options.groupId, 'mg-1');
      assert.equal(calls[0].options.replicaId, 'mg-1-r1');
      assert.equal(
        handler.localReplicas.get('mg-1-r1')?.status,
        ReplicaStatus.REMOVED,
      );
      assert.equal(cdc.updates.length, 1);
      assert.equal(cdc.updates[0].tableName, 'services');
      assert.equal(cdc.updates[0].keyObj.service_id, 'mg-1-r1');
      assert.equal(cdc.updates[0].keyObj.service_type, 'message_group');
      assert.equal(cdc.updates[0].updateData.status, 'stopped');
      assert.equal(cdc.deletes.length, 1);
      assert.equal(cdc.deletes[0].tableName, 'services');
      assert.equal(cdc.deletes[0].whereClause.service_id, 'mg-1-r1');
      assert.equal(cdc.deletes[0].whereClause.node_id, 'test-node');
      assert.equal(cdc.operations[0].type, 'update');
      assert.equal(cdc.operations[1].type, 'delete');
    });
});
