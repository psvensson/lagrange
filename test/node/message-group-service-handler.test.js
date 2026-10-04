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
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {SERVICE_STATUS} from '../../src/constants/index.js';
import {REBALANCER_SKIP_REASON} from
  '../../src/rebalancer/rebalancer-constants.js';

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

function createMockCdc(cache) {
  const operations = [];
  const inserts = [];
  const upserts = [];
  const updates = [];
  const deletes = [];
  return {
    operations,
    inserts,
    upserts,
    updates,
    deletes,
    async executeAuthoritativeSystemTableRead(tableName, _sql, params) {
      const serviceId = params[0];
      let row = cache.get(tableName, serviceId);
      for (const operation of operations) {
        const operationServiceId = operation.data?.service_id ||
          operation.keyObj?.service_id || operation.whereClause?.service_id;
        if (operation.tableName !== tableName ||
            operationServiceId !== serviceId) {
          continue;
        }
        if (operation.type === 'delete') {
          row = null;
        } else {
          row = {
            ...(row || operation.keyObj),
            ...(operation.data || operation.updateData),
          };
        }
      }
      return {success: true, rows: row ? [row] : []};
    },
    async readAuthoritativeRows(tableName, sql, params) {
      return this.executeAuthoritativeSystemTableRead(tableName, sql, params);
    },
    async insertSystemTableRow(tableName, data) {
      const entry = {type: 'insert', tableName, data};
      operations.push(entry);
      inserts.push(entry);
      return {success: true, partitionResult: {affectedRows: 1}};
    },
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
      return {success: true, partitionResult: {affectedRows: 1}};
    },
    async deleteSystemTableRow(tableName, whereClause) {
      const entry = {type: 'delete', tableName, whereClause};
      operations.push(entry);
      deletes.push(entry);
      return {success: true, partitionResult: {affectedRows: 1}};
    },
  };
}

function createHandler(overrides = {}) {
  const calls = [];
  const cache = overrides.cache || createMockCache({
    services: [
      {
        service_id: 'mg-1-r1',
        replica_id: 'mg-1-r1',
        service_type: 'message_group',
        group_id: 'mg-1',
        node_id: 'test-node',
        status: SERVICE_STATUS.ACTIVE,
        address: 'test-node/message-group/mg-1-r1',
        created_at: 100,
        updated_at: 101,
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
  const cdc = overrides.cdc || createMockCdc(cache);
  const nodeId = overrides.nodeId || 'test-node';
  const createdReplicas = new Map();

  const handler = new MessageGroupServiceHandler({
    nodeId,
    systemTableCache: cache,
    cdcIntegrationService: cdc,
    // A message-group CREATE_REPLICA is refused at the handler's
    // admission: these spies record any create or start it reached.
    createMessageGroupReplica: async (options) => {
      calls.push({method: 'create', options});
      return {created: true};
    },
    startMessageGroupReplica: async (options) => {
      calls.push({method: 'start', options});
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
      overrides.resolveLocalMessageGroupReplica ||
      ((replicaId) => createdReplicas.get(replicaId) || null),
    executorOutcomeEmitter: overrides.executorOutcomeEmitter || null,
  });
  handler.initialize();

  return {handler, cache, cdc, calls, createdReplicas};
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

  // Owner decision 2026-10-04 (zero-Liferaft cutover): a message group's
  // replica membership does not change until the fresh-identity ADD path
  // exists. CREATE_REPLICA opened a GENESIS self-founder from the services
  // rows that elected at once; under a reissued replica name it reused a
  // raft id whose history the group holds elsewhere. Every CREATE_REPLICA
  // a message-group handler receives - from the wire or called directly,
  // whatever topology it carries and whether or not the replica is already
  // local - is refused with the one typed reason and opens nothing: no
  // create or start call, no services row, no tracked operation, no local
  // replica record, no executor outcome. (The executor half the next quest
  // reuses, createReplicaAsync, keeps its own N2/D8 witnesses.)
  const CREATE_SHAPES = Object.freeze([
    ['cache-derived topology (a fresh name)', {
      [ReplicaOperationField.REPLICA_ID]: 'mg-1-r4',
    }],
    ['explicit topology', {
      [ReplicaOperationField.REPLICA_ID]: 'mg-1-r4',
      [ReplicaOperationField.REPLICA_IDS]: [
        'mg-1-r1', 'mg-1-r2', 'mg-1-r3', 'mg-1-r4'],
      [ReplicaOperationField.PEER_ADDRESSES]: [
        'node-a/message-group/mg-1-r1',
        'node-b/message-group/mg-1-r2',
        'node-c/message-group/mg-1-r3',
        'test-node/message-group/mg-1-r4',
      ],
    }],
    ['a reissued name the group already holds elsewhere', {
      [ReplicaOperationField.REPLICA_ID]: 'mg-1-r2',
    }],
    ['a replica already active on this node', {
      [ReplicaOperationField.REPLICA_ID]: 'mg-1-r1',
    }],
  ]);

  for (const [shape, fields] of CREATE_SHAPES) {
    it(`refuses CREATE_REPLICA (${shape}) and opens nothing`, async () => {
      const emittedOutcomes = [];
      const {handler, cdc, calls} = createHandler({
        executorOutcomeEmitter: {
          emitOutcome: (...outcome) => emittedOutcomes.push(outcome),
        },
      });
      const replicaId = fields[ReplicaOperationField.REPLICA_ID];

      const response = await handler.handleMessage({
        correlationId: 'c-1',
        payload: {
          [ReplicaOperationField.TYPE]: ReplicaOperationMessageType
            .CREATE_REPLICA,
          [ReplicaOperationField.OPERATION_ID]: `op-${shape}`,
          [ReplicaOperationField.ENTITY_ID]: 'mg-1',
          ...fields,
        },
      });
      await flushImmediate();
      await flushImmediate();

      assert.equal(response.status, ReplicaOperationResponseStatus.ERROR);
      assert.equal(response.reason, REBALANCER_SKIP_REASON
        .MESSAGE_GROUP_MEMBERSHIP_CHANGE_UNSUPPORTED);
      assert.equal(response.error, response.reason);
      assert.equal(response.correlationId, 'c-1');
      assert.deepEqual(calls, [], 'no create or start call');
      assert.deepEqual(cdc.operations, [], 'no services row written');
      assert.equal(handler.inProgressOperations.size, 0);
      assert.equal(handler.localReplicas.has(replicaId), false,
        'no local replica record');
      assert.deepEqual(emittedOutcomes, [], 'no executor outcome');
    });
  }

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

  it('resumes stalled removing message-group replicas',
    async () => {
      const {handler, cdc, calls} = createHandler();
      handler.localReplicas.set('mg-1-r1', {
        replicaId: 'mg-1-r1',
        entityId: 'mg-1',
        status: ReplicaStatus.REMOVING,
      });

      const response = await handler.handleRemoveReplica({
        [ReplicaOperationField.OPERATION_ID]: 'op-remove-resume',
        [ReplicaOperationField.ENTITY_ID]: 'mg-1',
        [ReplicaOperationField.REPLICA_ID]: 'mg-1-r1',
      });

      assert.equal(
        response.status,
        ReplicaOperationResponseStatus.IN_PROGRESS,
      );

      await flushImmediate();
      await flushImmediate();

      assert.equal(calls.length, 1);
      assert.equal(calls[0].method, 'stop');
      assert.equal(
        handler.localReplicas.get('mg-1-r1')?.status,
        ReplicaStatus.REMOVED,
      );
      assert.equal(cdc.deletes.length, 1);
      assert.equal(handler.inProgressOperations.size, 0);
    });
});
