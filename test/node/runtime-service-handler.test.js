/**
 * Unit tests for RuntimeServiceHandler.
 *
 * Covers ADD, REMOVE, and REPLACE operation execution for
 * runtime-service entities via the handler's message interface.
 *
 * Requirements: 2.1, 3.2, 4.4, 11.2
 */

import {describe, it, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {RuntimeServiceHandler} from
  '../../src/node/runtime-service-handler.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  EXECUTOR_OUTCOME_TYPE,
} from '../../src/rebalancer/executor-outcome-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  validateRuntimeDescriptor,
} from '../../src/wasm-service/runtime-descriptor-validator.js';
import {LoggingService} from '../../src/logging/logging-service.js';

const TEST_ALREADY_ACTIVE_OPERATION_ID = 'op-1';
const TEST_ALREADY_ACTIVE_ENTITY_ID = 'sys-postgres-wire';
const TEST_ALREADY_ACTIVE_REPLICA_ID = 'sys-postgres-wire-r1';

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
      if (!map) return [];
      return [...map.values()].filter(predicate);
    },
  };
}

function createMockCdc() {
  const updates = [];
  return {
    updates,
    async updateSystemTableRow(tableName, keyObj, updateData) {
      updates.push({tableName, keyObj, updateData});
    },
  };
}

function createMockLifecycleManager(options = {}) {
  const calls = [];
  return {
    calls,
    async createReplica(definition, context) {
      calls.push({method: 'createReplica', definition, context});
      if (options.createError) {
        throw new Error(options.createError);
      }
      return {created: true};
    },
    async startReplica(handle, context) {
      calls.push({method: 'startReplica', handle, context});
      if (options.startError) {
        throw new Error(options.startError);
      }
      return {started: true};
    },
    async stopReplica(handle, context) {
      calls.push({method: 'stopReplica', handle, context});
      if (options.stopError) {
        throw new Error(options.stopError);
      }
      return {stopped: true};
    },
  };
}

function createHandler(overrides = {}) {
  const cache = overrides.cache || createMockCache({
    service_definitions: [
      {
        service_id: 'sys-postgres-wire',
        service_type: 'runtime_service',
        runtime_kind: 'native_js',
        runtime_ref: 'postgres-wire-runtime',
        runtime_config: JSON.stringify({
          host: '127.0.0.1',
          authMode: 'trust',
          tlsMode: 'disable',
        }),
      },
    ],
    replica_operations: overrides.operations || [],
  });
  const cdc = overrides.cdc || createMockCdc();
  const lifecycle = overrides.lifecycle ||
    createMockLifecycleManager(overrides.lifecycleOptions || {});

  const handler = new RuntimeServiceHandler({
    nodeId: overrides.nodeId || 'test-node',
    systemTableCache: cache,
    cdcIntegrationService: cdc,
    serviceLifecycleManager: lifecycle,
    executorOutcomeEmitter: overrides.executorOutcomeEmitter || null,
  });
  handler.initialize();
  return {handler, cache, cdc, lifecycle};
}

/**
 * Wait for setImmediate-based async work to complete.
 */
function flushImmediate() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('RuntimeServiceHandler initialization', () => {
  beforeEach(initEnv);

  it('throws when serviceLifecycleManager is missing', () => {
    const handler = new RuntimeServiceHandler({
      nodeId: 'n1',
      systemTableCache: createMockCache(),
      cdcIntegrationService: createMockCdc(),
    });
    assert.throws(
      () => handler.initialize(),
      /serviceLifecycleManager/,
    );
  });

  it('throws when cdcIntegrationService is missing', () => {
    const handler = new RuntimeServiceHandler({
      nodeId: 'n1',
      systemTableCache: createMockCache(),
      serviceLifecycleManager: createMockLifecycleManager(),
    });
    assert.throws(
      () => handler.initialize(),
      /cdcIntegrationService/,
    );
  });

  it('throws when systemTableCache is missing', () => {
    const handler = new RuntimeServiceHandler({
      nodeId: 'n1',
      cdcIntegrationService: createMockCdc(),
      serviceLifecycleManager: createMockLifecycleManager(),
    });
    assert.throws(
      () => handler.initialize(),
      /systemTableCache/,
    );
  });

  it('initializes successfully with all dependencies', () => {
    const {handler} = createHandler();
    assert.ok(handler);
  });
});

describe('RuntimeServiceHandler handleCreateReplica', () => {
  beforeEach(initEnv);

  it('returns error when required fields are missing', async () => {
    const {handler} = createHandler();
    const response = await handler.handleCreateReplica({});
    assert.equal(
      response.status, ReplicaOperationResponseStatus.ERROR,
    );
  });

  it('returns INITIATED for valid create request', async () => {
    const {handler} = createHandler();
    const response = await handler.handleCreateReplica({
      [ReplicaOperationField.OPERATION_ID]: 'op-1',
      [ReplicaOperationField.ENTITY_ID]: 'sys-postgres-wire',
      [ReplicaOperationField.REPLICA_ID]: 'sys-postgres-wire-r1',
    });
    assert.equal(
      response.status, ReplicaOperationResponseStatus.INITIATED,
    );
    assert.equal(response.replicaId, 'sys-postgres-wire-r1');
    assert.equal(response.nodeId, 'test-node');
  });

  it('returns ALREADY_EXISTS for active replica', async () => {
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
      entityId: TEST_ALREADY_ACTIVE_ENTITY_ID,
      status: ReplicaStatus.ACTIVE,
    });
    const response = await handler.handleCreateReplica({
      [ReplicaOperationField.OPERATION_ID]: TEST_ALREADY_ACTIVE_OPERATION_ID,
      [ReplicaOperationField.ENTITY_ID]: TEST_ALREADY_ACTIVE_ENTITY_ID,
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
          outcomeType: EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_ACTIVE,
          operationId: TEST_ALREADY_ACTIVE_OPERATION_ID,
          workflowStep: WORKFLOW_STEP.ACTIVE,
          options: {
            replicaId: TEST_ALREADY_ACTIVE_REPLICA_ID,
          },
        },
      ],
    );
  });

  it('returns IN_PROGRESS for creating replica', async () => {
    const {handler} = createHandler();
    handler.localReplicas.set('sys-postgres-wire-r1', {
      replicaId: 'sys-postgres-wire-r1',
      entityId: 'sys-postgres-wire',
      status: ReplicaStatus.CREATING,
    });
    const response = await handler.handleCreateReplica({
      [ReplicaOperationField.OPERATION_ID]: 'op-1',
      [ReplicaOperationField.ENTITY_ID]: 'sys-postgres-wire',
      [ReplicaOperationField.REPLICA_ID]: 'sys-postgres-wire-r1',
    });
    assert.equal(
      response.status,
      ReplicaOperationResponseStatus.IN_PROGRESS,
    );
  });

  it('returns IN_PROGRESS for duplicate operation ID', async () => {
    const {handler} = createHandler();
    handler.inProgressOperations.set('op-1', {
      type: ReplicaOperationMessageType.CREATE_REPLICA,
    });
    const response = await handler.handleCreateReplica({
      [ReplicaOperationField.OPERATION_ID]: 'op-1',
      [ReplicaOperationField.ENTITY_ID]: 'sys-postgres-wire',
      [ReplicaOperationField.REPLICA_ID]: 'sys-postgres-wire-r1',
    });
    assert.equal(
      response.status,
      ReplicaOperationResponseStatus.IN_PROGRESS,
    );
  });

  it('calls lifecycle create + start without direct workflow-step persistence',
    async () => {
      const {handler, lifecycle, cdc} = createHandler();
      await handler.handleCreateReplica({
        [ReplicaOperationField.OPERATION_ID]: 'op-1',
        [ReplicaOperationField.ENTITY_ID]: 'sys-postgres-wire',
        [ReplicaOperationField.REPLICA_ID]: 'sys-postgres-wire-r1',
      });

      // Wait for async work
      await flushImmediate();
      await flushImmediate();

      assert.equal(lifecycle.calls.length, 2);
      assert.equal(lifecycle.calls[0].method, 'createReplica');
      assert.equal(lifecycle.calls[1].method, 'startReplica');

      // Red-on-revert: the descriptor built from a snake_case service_definitions
      // row must carry camelCase runtime fields so it passes the runtime
      // descriptor validator. Without the handler's camelCase mapping this
      // fails "runtime_kind is required" and no runtime-service replica places.
      const descriptor = lifecycle.calls[0].definition;
      assert.equal(descriptor.entityId, 'sys-postgres-wire',
        'placed-replica descriptor preserves the canonical service ' +
          'identity for routing policy and access attribution');
      assert.equal(descriptor.runtimeKind, 'native_js');
      assert.equal(
        validateRuntimeDescriptor(descriptor).valid, true,
        'placed-replica descriptor validates',
      );

      const replica = handler.getLocalReplica('sys-postgres-wire-r1');
      assert.equal(replica.status, ReplicaStatus.ACTIVE);

      const stepUpdate = cdc.updates.find(
        (u) => u.updateData.workflow_step === WORKFLOW_STEP.ACTIVE,
      );
      assert.equal(stepUpdate, undefined, 'should not persist ACTIVE step directly');
    });

  it('transitions to FAILED when lifecycle throws', async () => {
    const {handler, cdc} = createHandler({
      lifecycleOptions: {createError: 'bind failed'},
    });
    await handler.handleCreateReplica({
      [ReplicaOperationField.OPERATION_ID]: 'op-1',
      [ReplicaOperationField.ENTITY_ID]: 'sys-postgres-wire',
      [ReplicaOperationField.REPLICA_ID]: 'sys-postgres-wire-r1',
    });

    await flushImmediate();
    await flushImmediate();

    const replica = handler.getLocalReplica('sys-postgres-wire-r1');
    assert.equal(replica.status, ReplicaStatus.FAILED);

    const stepUpdate = cdc.updates.find(
      (u) => u.updateData.workflow_step === WORKFLOW_STEP.FAILED,
    );
    assert.equal(stepUpdate, undefined, 'should not persist FAILED step directly');
  });

  it('fails when service definition not found', async () => {
    const {handler, cdc} = createHandler({
      cache: createMockCache({
        service_definitions: [],
        replica_operations: [],
      }),
    });
    await handler.handleCreateReplica({
      [ReplicaOperationField.OPERATION_ID]: 'op-1',
      [ReplicaOperationField.ENTITY_ID]: 'sys-postgres-wire',
      [ReplicaOperationField.REPLICA_ID]: 'sys-postgres-wire-r1',
    });

    await flushImmediate();
    await flushImmediate();

    const replica = handler.getLocalReplica('sys-postgres-wire-r1');
    assert.equal(replica.status, ReplicaStatus.FAILED);

    const stepUpdate = cdc.updates.find(
      (u) => u.updateData.workflow_step === WORKFLOW_STEP.FAILED,
    );
    assert.equal(stepUpdate, undefined, 'should not persist FAILED step directly');
  });
});

describe('RuntimeServiceHandler handleRemoveReplica', () => {
  beforeEach(initEnv);

  it('returns error when required fields are missing', async () => {
    const {handler} = createHandler();
    const response = await handler.handleRemoveReplica({});
    assert.equal(
      response.status, ReplicaOperationResponseStatus.ERROR,
    );
  });

  it('returns NOT_FOUND when replica does not exist', async () => {
    const {handler} = createHandler();
    const response = await handler.handleRemoveReplica({
      [ReplicaOperationField.OPERATION_ID]: 'op-1',
      [ReplicaOperationField.ENTITY_ID]: 'sys-postgres-wire',
      [ReplicaOperationField.REPLICA_ID]: 'sys-postgres-wire-r1',
    });
    assert.equal(
      response.status,
      ReplicaOperationResponseStatus.NOT_FOUND,
    );
  });

  it('returns INITIATED for valid remove request', async () => {
    const {handler} = createHandler();
    handler.localReplicas.set('sys-postgres-wire-r1', {
      replicaId: 'sys-postgres-wire-r1',
      entityId: 'sys-postgres-wire',
      status: ReplicaStatus.ACTIVE,
    });
    const response = await handler.handleRemoveReplica({
      [ReplicaOperationField.OPERATION_ID]: 'op-1',
      [ReplicaOperationField.ENTITY_ID]: 'sys-postgres-wire',
      [ReplicaOperationField.REPLICA_ID]: 'sys-postgres-wire-r1',
    });
    assert.equal(
      response.status, ReplicaOperationResponseStatus.INITIATED,
    );
  });

  it('returns IN_PROGRESS for removing replica', async () => {
    const {handler} = createHandler();
    handler.localReplicas.set('sys-postgres-wire-r1', {
      replicaId: 'sys-postgres-wire-r1',
      entityId: 'sys-postgres-wire',
      status: ReplicaStatus.REMOVING,
    });
    handler.inProgressOperations.set('op-1', {
      type: ReplicaOperationMessageType.REMOVE_REPLICA,
      replicaId: 'sys-postgres-wire-r1',
      entityId: 'sys-postgres-wire',
      startedAt: Date.now(),
    });
    const response = await handler.handleRemoveReplica({
      [ReplicaOperationField.OPERATION_ID]: 'op-1',
      [ReplicaOperationField.ENTITY_ID]: 'sys-postgres-wire',
      [ReplicaOperationField.REPLICA_ID]: 'sys-postgres-wire-r1',
    });
    assert.equal(
      response.status,
      ReplicaOperationResponseStatus.IN_PROGRESS,
    );
  });

  it('resumes stalled removing replica when no removal task is active',
    async () => {
      const {handler, lifecycle} = createHandler();
      handler.localReplicas.set('sys-postgres-wire-r1', {
        replicaId: 'sys-postgres-wire-r1',
        entityId: 'sys-postgres-wire',
        status: ReplicaStatus.REMOVING,
      });

      const response = await handler.handleRemoveReplica({
        [ReplicaOperationField.OPERATION_ID]: 'op-resume-remove',
        [ReplicaOperationField.ENTITY_ID]: 'sys-postgres-wire',
        [ReplicaOperationField.REPLICA_ID]: 'sys-postgres-wire-r1',
      });

      assert.equal(
        response.status,
        ReplicaOperationResponseStatus.IN_PROGRESS,
      );

      await flushImmediate();
      await flushImmediate();

      assert.equal(lifecycle.calls.length, 1);
      assert.equal(lifecycle.calls[0].method, 'stopReplica');
      assert.equal(
        handler.localReplicas.get('sys-postgres-wire-r1')?.status,
        ReplicaStatus.REMOVED,
      );
      assert.equal(handler.inProgressOperations.size, 0);
    });

  it('returns COMPLETED for already removed replica', async () => {
    const {handler} = createHandler();
    handler.localReplicas.set('sys-postgres-wire-r1', {
      replicaId: 'sys-postgres-wire-r1',
      entityId: 'sys-postgres-wire',
      status: ReplicaStatus.REMOVED,
    });
    const response = await handler.handleRemoveReplica({
      [ReplicaOperationField.OPERATION_ID]: 'op-1',
      [ReplicaOperationField.ENTITY_ID]: 'sys-postgres-wire',
      [ReplicaOperationField.REPLICA_ID]: 'sys-postgres-wire-r1',
    });
    assert.equal(
      response.status,
      ReplicaOperationResponseStatus.COMPLETED,
    );
  });

  it('calls lifecycle stop without direct workflow-step persistence', async () => {
    const {handler, lifecycle, cdc} = createHandler();
    handler.localReplicas.set('sys-postgres-wire-r1', {
      replicaId: 'sys-postgres-wire-r1',
      entityId: 'sys-postgres-wire',
      status: ReplicaStatus.ACTIVE,
    });
    await handler.handleRemoveReplica({
      [ReplicaOperationField.OPERATION_ID]: 'op-1',
      [ReplicaOperationField.ENTITY_ID]: 'sys-postgres-wire',
      [ReplicaOperationField.REPLICA_ID]: 'sys-postgres-wire-r1',
    });

    await flushImmediate();
    await flushImmediate();

    assert.equal(lifecycle.calls.length, 1);
    assert.equal(lifecycle.calls[0].method, 'stopReplica');

    const replica = handler.getLocalReplica('sys-postgres-wire-r1');
    assert.equal(replica.status, ReplicaStatus.REMOVED);

    const stepUpdate = cdc.updates.find(
      (u) => u.updateData.workflow_step === WORKFLOW_STEP.REMOVED,
    );
    assert.equal(stepUpdate, undefined, 'should not persist REMOVED step directly');
  });

  it('transitions to FAILED when stop throws', async () => {
    const {handler, cdc} = createHandler({
      lifecycleOptions: {stopError: 'stop failed'},
    });
    handler.localReplicas.set('sys-postgres-wire-r1', {
      replicaId: 'sys-postgres-wire-r1',
      entityId: 'sys-postgres-wire',
      status: ReplicaStatus.ACTIVE,
    });
    await handler.handleRemoveReplica({
      [ReplicaOperationField.OPERATION_ID]: 'op-1',
      [ReplicaOperationField.ENTITY_ID]: 'sys-postgres-wire',
      [ReplicaOperationField.REPLICA_ID]: 'sys-postgres-wire-r1',
    });

    await flushImmediate();
    await flushImmediate();

    const replica = handler.getLocalReplica('sys-postgres-wire-r1');
    assert.equal(replica.status, ReplicaStatus.FAILED);

    const stepUpdate = cdc.updates.find(
      (u) => u.updateData.workflow_step === WORKFLOW_STEP.FAILED,
    );
    assert.equal(stepUpdate, undefined, 'should not persist FAILED step directly');
  });
});

describe('RuntimeServiceHandler handleMessage dispatch', () => {
  beforeEach(initEnv);

  it('dispatches CREATE_REPLICA messages', async () => {
    const {handler} = createHandler();
    const response = await handler.handleMessage({
      correlationId: 'corr-1',
      payload: {
        [ReplicaOperationField.TYPE]:
          ReplicaOperationMessageType.CREATE_REPLICA,
        [ReplicaOperationField.OPERATION_ID]: 'op-1',
        [ReplicaOperationField.ENTITY_ID]: 'sys-postgres-wire',
        [ReplicaOperationField.REPLICA_ID]: 'sys-postgres-wire-r1',
      },
    });
    assert.equal(
      response.status, ReplicaOperationResponseStatus.INITIATED,
    );
    assert.equal(response.correlationId, 'corr-1');
  });

  it('dispatches REMOVE_REPLICA messages', async () => {
    const {handler} = createHandler();
    handler.localReplicas.set('sys-postgres-wire-r1', {
      replicaId: 'sys-postgres-wire-r1',
      entityId: 'sys-postgres-wire',
      status: ReplicaStatus.ACTIVE,
    });
    const response = await handler.handleMessage({
      correlationId: 'corr-2',
      payload: {
        [ReplicaOperationField.TYPE]:
          ReplicaOperationMessageType.REMOVE_REPLICA,
        [ReplicaOperationField.OPERATION_ID]: 'op-2',
        [ReplicaOperationField.ENTITY_ID]: 'sys-postgres-wire',
        [ReplicaOperationField.REPLICA_ID]: 'sys-postgres-wire-r1',
      },
    });
    assert.equal(
      response.status, ReplicaOperationResponseStatus.INITIATED,
    );
    assert.equal(response.correlationId, 'corr-2');
  });

  it('returns error for unknown message type', async () => {
    const {handler} = createHandler();
    const response = await handler.handleMessage({
      correlationId: 'corr-3',
      payload: {[ReplicaOperationField.TYPE]: 'UNKNOWN'},
    });
    assert.equal(
      response.status, ReplicaOperationResponseStatus.ERROR,
    );
    assert.equal(response.correlationId, 'corr-3');
  });
});

describe('RuntimeServiceHandler router registration', () => {
  beforeEach(initEnv);

  it('registers handler at correct address', () => {
    const {handler} = createHandler();
    const registered = new Map();
    const mockRouter = {
      register(address, fn) {
        registered.set(address, fn);
      },
    };
    handler.registerWithRouter(mockRouter);
    assert.ok(
      registered.has('test-node/service/runtime-service-handler'),
    );
  });

  it('unregisters handler from router', () => {
    const {handler} = createHandler();
    const unregistered = [];
    const mockRouter = {
      register() {},
      unregister(address) {
        unregistered.push(address);
      },
    };
    handler.registerWithRouter(mockRouter);
    handler.unregisterFromRouter(mockRouter);
    assert.equal(unregistered.length, 1);
    assert.equal(
      unregistered[0],
      'test-node/service/runtime-service-handler',
    );
  });

  it('registered handler returns acknowledged response',
    async () => {
      const {handler} = createHandler();
      const registered = new Map();
      const mockRouter = {
        register(address, fn) {
          registered.set(address, fn);
        },
      };
      handler.registerWithRouter(mockRouter);

      const routerHandler = registered.get(
        'test-node/service/runtime-service-handler',
      );
      const response = await routerHandler({
        correlationId: 'corr-1',
        payload: {
          [ReplicaOperationField.TYPE]:
            ReplicaOperationMessageType.CREATE_REPLICA,
          [ReplicaOperationField.OPERATION_ID]: 'op-1',
          [ReplicaOperationField.ENTITY_ID]: 'sys-postgres-wire',
          [ReplicaOperationField.REPLICA_ID]:
            'sys-postgres-wire-r1',
        },
      });
      assert.equal(response.acknowledged, true);
      assert.equal(
        response.status,
        ReplicaOperationResponseStatus.INITIATED,
      );
    });
});

describe('RuntimeServiceHandler REPLACE operation flow', () => {
  beforeEach(initEnv);

  it('handles REPLACE add phase as CREATE_REPLICA', async () => {
    const {handler} = createHandler();
    const response = await handler.handleMessage({
      correlationId: 'corr-replace-add',
      payload: {
        [ReplicaOperationField.TYPE]:
          ReplicaOperationMessageType.CREATE_REPLICA,
        [ReplicaOperationField.OPERATION_ID]: 'op-replace-1',
        [ReplicaOperationField.ENTITY_ID]: 'sys-postgres-wire',
        [ReplicaOperationField.REPLICA_ID]: 'sys-postgres-wire-r2',
      },
    });
    assert.equal(
      response.status, ReplicaOperationResponseStatus.INITIATED,
    );

    await flushImmediate();
    await flushImmediate();

    const replica = handler.getLocalReplica('sys-postgres-wire-r2');
    assert.equal(replica.status, ReplicaStatus.ACTIVE);
  });

  it('handles REPLACE remove phase as REMOVE_REPLICA', async () => {
    const {handler} = createHandler();
    handler.localReplicas.set('sys-postgres-wire-r1', {
      replicaId: 'sys-postgres-wire-r1',
      entityId: 'sys-postgres-wire',
      status: ReplicaStatus.ACTIVE,
    });
    const response = await handler.handleMessage({
      correlationId: 'corr-replace-remove',
      payload: {
        [ReplicaOperationField.TYPE]:
          ReplicaOperationMessageType.REMOVE_REPLICA,
        [ReplicaOperationField.OPERATION_ID]: 'op-replace-2',
        [ReplicaOperationField.ENTITY_ID]: 'sys-postgres-wire',
        [ReplicaOperationField.REPLICA_ID]: 'sys-postgres-wire-r1',
        [ReplicaOperationField.REASON]: 'replace_source_removal',
      },
    });
    assert.equal(
      response.status, ReplicaOperationResponseStatus.INITIATED,
    );

    await flushImmediate();
    await flushImmediate();

    const replica = handler.getLocalReplica('sys-postgres-wire-r1');
    assert.equal(replica.status, ReplicaStatus.REMOVED);
  });
});

describe('RuntimeServiceHandler shutdown', () => {
  beforeEach(initEnv);

  it('clears all state on shutdown', () => {
    const {handler} = createHandler();
    handler.localReplicas.set('r1', {replicaId: 'r1'});
    handler.inProgressOperations.set('op-1', {});
    handler.shutdown();
    assert.equal(handler.localReplicas.size, 0);
    assert.equal(handler.inProgressOperations.size, 0);
  });
});
