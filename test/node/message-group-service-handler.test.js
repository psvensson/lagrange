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
import {ReplicaStateMachine} from '../../src/node/replica-state-machine.js';
import {registerMessageGroupTransportHandler} from
  '../../src/bootstrap/shared/message-group-transport-handler.js';
import {createIdentityTransport} from
  '../test-helpers/replica-handler-identity-fixture.js';
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
  // The created replica's runtime: the production registration records its
  // exact transport handler and its lifecycle owner (the node's
  // ReplicaStateMachine) on the service.
  const transport = createIdentityTransport();
  const stateMachine = new ReplicaStateMachine({nodeId,
    controlPlaneSystemTableGateway: {}});
  const createdReplicas = new Map();

  const handler = new MessageGroupServiceHandler({
    nodeId,
    systemTableCache: cache,
    cdcIntegrationService: cdc,
    createMessageGroupReplica: async (options) => {
      calls.push({method: 'create', options});
      if (overrides.createErrorObj) {
        throw overrides.createErrorObj;
      }
      if (overrides.createError) {
        throw new Error(overrides.createError);
      }
      const address = `${nodeId}/message-group/${options.replicaId}`;
      const service = {groupId: options.groupId, replicaId: options.replicaId,
        unifiedAddress: address, transport, isLeaderReplica: () => false,
        receiveMessage: () => ({acknowledged: true})};
      if (overrides.registerHandler === false) {
        service.transportHandler = () => ({acknowledged: true});
        service.resolveHandlerRetirementLane = () => stateMachine;
      } else {
        registerMessageGroupTransportHandler(service, {messageRouter: transport,
          address, resolveLane: () => stateMachine});
      }
      createdReplicas.set(options.replicaId, service);
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
      overrides.resolveLocalMessageGroupReplica ||
      ((replicaId) => createdReplicas.get(replicaId) || null),
    executorOutcomeEmitter: overrides.executorOutcomeEmitter || null,
  });
  handler.initialize();

  return {handler, cache, cdc, calls, transport, createdReplicas};
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
      const {handler, cdc, calls} = createHandler();

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
          'test-node/message-group/mg-1-r1',
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
      // Owner decision N2 (D1): the row is born STOPPED and becomes ACTIVE
      // only through the handler-bound activation CAS on that generation.
      assert.equal(cdc.inserts.length, 1);
      assert.equal(cdc.inserts[0].tableName, 'services');
      assert.equal(cdc.inserts[0].data.service_id, 'mg-1-r4');
      assert.equal(cdc.inserts[0].data.group_id, 'mg-1');
      assert.equal(cdc.inserts[0].data.node_id, 'test-node');
      assert.equal(cdc.inserts[0].data.status, SERVICE_STATUS.STOPPED);
      assert.equal(cdc.updates.length, 1);
      assert.equal(cdc.updates[0].keyObj.status, SERVICE_STATUS.STOPPED);
      assert.equal(cdc.updates[0].keyObj.created_at,
        cdc.inserts[0].data.created_at,
        'the ACTIVE CAS is fenced by the registered generation');
      assert.equal(cdc.updates[0].updateData.status, SERVICE_STATUS.ACTIVE);
      assert.deepEqual(cdc.operations.map((operation) => operation.type),
        ['insert', 'update']);
    });

  it('creates a message-group replica from explicit topology when cache is sparse',
    async () => {
      const {handler, cdc, calls} = createHandler({
        cache: createMockCache({
          services: [],
          replica_operations: [],
        }),
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
      assert.equal(cdc.inserts.length, 1);
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
      const {handler, cdc, calls} = createHandler({registerHandler: false});

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
      assert.equal(cdc.inserts.length, 1);
      assert.equal(cdc.inserts[0].data.status, SERVICE_STATUS.STOPPED,
        'the registration is a STOPPED birth');
      assert.equal(cdc.updates.length, 0, 'no ACTIVE CAS without the handler');
    });

  it('forwards retryable create-failure metadata on MESSAGE_GROUP_CREATE_FAILED',
    async () => {
      const emittedOutcomes = [];
      const retryableError = new Error('Operational message-group ingress not ready');
      retryableError.errorCode = 'INGRESS_NOT_READY';
      retryableError.retryAfterMs = 5000;
      retryableError.deferRetry = true;

      const {handler} = createHandler({
        createErrorObj: retryableError,
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

      await handler.handleCreateReplica({
        [ReplicaOperationField.OPERATION_ID]: 'op-retryable-fail',
        [ReplicaOperationField.ENTITY_ID]: 'mg-1',
        [ReplicaOperationField.REPLICA_ID]: 'mg-1-r4',
      });

      await flushImmediate();
      await flushImmediate();

      assert.equal(emittedOutcomes.length, 1);
      const outcome = emittedOutcomes[0];
      assert.equal(
        outcome.outcomeType,
        EXECUTOR_OUTCOME_TYPE.MESSAGE_GROUP_CREATE_FAILED,
      );
      assert.equal(
        outcome.options.errorCode,
        'INGRESS_NOT_READY',
        'errorCode must be forwarded for retryable ingress failures',
      );
      assert.equal(
        outcome.options.retryAfterMs,
        5000,
        'retryAfterMs must be forwarded so the owner retry lane can rearm',
      );
      assert.equal(
        outcome.options.deferRetry,
        true,
        'deferRetry must be forwarded to arm transition retry grace',
      );
    });

  it('omits retryable fields when create error has none',
    async () => {
      const emittedOutcomes = [];
      const plainError = new Error('unexpected create failure');

      const {handler} = createHandler({
        createErrorObj: plainError,
        executorOutcomeEmitter: {
          emitOutcome(outcomeType, operationId, workflowStep, options) {
            emittedOutcomes.push({outcomeType, options});
          },
        },
      });

      await handler.handleCreateReplica({
        [ReplicaOperationField.OPERATION_ID]: 'op-plain-fail',
        [ReplicaOperationField.ENTITY_ID]: 'mg-1',
        [ReplicaOperationField.REPLICA_ID]: 'mg-1-r4',
      });

      await flushImmediate();
      await flushImmediate();

      assert.equal(emittedOutcomes.length, 1);
      const outcome = emittedOutcomes[0];
      assert.equal(
        outcome.outcomeType,
        EXECUTOR_OUTCOME_TYPE.MESSAGE_GROUP_CREATE_FAILED,
      );
      assert.equal(
        outcome.options.retryAfterMs,
        undefined,
        'retryAfterMs must not be set for non-retryable failures',
      );
      assert.equal(
        outcome.options.deferRetry,
        undefined,
        'deferRetry must not be set for non-retryable failures',
      );
      assert.equal(
        outcome.options.errorCode,
        undefined,
        'errorCode must not be set when error carries no code',
      );
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
