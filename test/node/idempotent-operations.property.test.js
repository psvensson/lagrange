/**
 * Property Test: Idempotent Operations
 * **Property 13: Idempotent Operations**
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
 *
 * *For any* duplicate CREATE_REPLICA or REMOVE_REPLICA message, the
 * Lifecycle_Manager SHALL return an appropriate status (`already_exists`,
 * `in_progress`, `not_found`) without changing the replica's state.
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  ReplicaLifecycleManager,
  ReplicaStatus,
  AckStatus,
} from '../../src/node/replica-lifecycle-manager.js';
import {
  ReplicaStateMachine,
  ReplicaState,
} from '../../src/node/replica-state-machine.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

/**
 * Create a mock CDC integration service.
 * @return {Object} Mock CDC service.
 */
function createMockCDCService() {
  const operations = [];

  return {
    operations,
    async upsertSystemTableRow(tableName, data) {
      operations.push({type: 'upsert', tableName, data});
      return {success: true};
    },
    async updateSystemTableRow(tableName, whereClause, data) {
      operations.push({type: 'update', tableName, whereClause, data});
      return {success: true};
    },
    async deleteSystemTableRow(tableName, whereClause) {
      operations.push({type: 'delete', tableName, whereClause});
      return {success: true};
    },
    reset() {
      operations.length = 0;
    },
  };
}

/**
 * Create a mock partition service factory.
 * @return {Object} Factory and tracking.
 */
function createMockPartitionServiceFactory() {
  const createdServices = [];
  return {
    factory: async (options) => {
      createdServices.push(options);
      return {
        partitionId: options.partitionId,
        replicaId: options.replicaId,
        initialized: true,
        async shutdown() {},
        async syncFromLeader() {},
      };
    },
    createdServices,
  };
}

/**
 * Create a mock system table cache.
 * @return {Object} Mock system table cache.
 */
function createMockSystemTableCache() {
  return {
    filter: (_tableName, _predicate) => [],
    get: (_tableName, _key) => null,
  };
}

test('Property 13: Idempotent Operations', async (t) => {
  t.beforeEach(async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();

    const config = ConfigurationManager.getInstance();
    config.initialize({});

    const logging = LoggingService.getInstance();
    logging.initialize({level: 'error'});
  });

  t.afterEach(async () => {
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  });

  /**
   * Feature: replica-lifecycle-state-machine, Property 13: Idempotent Operations
   * Validates: Requirements 9.1
   *
   * WHEN a CREATE_REPLICA message is received for a replica that already
   * exists in `active` state, THE Lifecycle_Manager SHALL return
   * `already_exists` without changing state.
   */
  t.test('CREATE_REPLICA for active replica returns already_exists', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // request_id
        fc.uuid(), // partition_id
        fc.uuid(), // replica_id
        fc.string({minLength: 1, maxLength: 20}), // table_name
        async (requestId, partitionId, replicaId, tableName) => {
          const mockCDC = createMockCDCService();
          const mockCache = createMockSystemTableCache();
          const {factory} = createMockPartitionServiceFactory();
          const stateMachineCDC = createMockCDCService();
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: stateMachineCDC,
          });

          const manager = new ReplicaLifecycleManager({
            nodeId: 'test-node',
            cdcIntegrationService: mockCDC,
            systemTableCache: mockCache,
            dataDir: '/tmp/test-lifecycle',
            replicaStateMachine: stateMachine,
            createPartitionService: factory,
          });

          manager.initialize();

          // Pre-populate local replica in ACTIVE state
          manager.localReplicas.set(replicaId, {
            replicaId,
            partitionId,
            status: ReplicaStatus.ACTIVE,
            service: {async shutdown() {}, async syncFromLeader() {}},
          });

          // Also register in state machine
          await stateMachine.transition(replicaId, ReplicaState.PENDING, {
            partitionId,
            nodeId: 'test-node',
            reason: 'test setup',
          });
          await stateMachine.transition(replicaId, ReplicaState.CREATING, {
            reason: 'test setup',
          });
          await stateMachine.transition(replicaId, ReplicaState.SYNCING, {
            reason: 'test setup',
          });
          await stateMachine.transition(replicaId, ReplicaState.ACTIVE, {
            reason: 'test setup',
          });

          mockCDC.reset();

          const message = {
            request_id: requestId,
            partition_id: partitionId,
            replica_id: replicaId,
            table_name: tableName,
            table_id: partitionId,
          };

          const ack = await manager.handleCreateReplica(message);

          // Verify state didn't change
          const state = stateMachine.getState(replicaId);

          manager.shutdown();
          stateMachine.clear();

          return ack.status === AckStatus.ALREADY_EXISTS &&
            state.state === ReplicaState.ACTIVE &&
            mockCDC.operations.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('CREATE_REPLICA for active replica returns already_exists');
  });

  /**
   * Feature: replica-lifecycle-state-machine, Property 13: Idempotent Operations
   * Validates: Requirements 9.2
   *
   * WHEN a CREATE_REPLICA message is received for a replica in `creating`
   * or `syncing` state, THE Lifecycle_Manager SHALL return `in_progress`
   * without changing state.
   */
  t.test('CREATE_REPLICA for creating/syncing replica returns in_progress', async (t) => {
    // Use the status values that ReplicaHandler checks for
    const transitionalStates = [
      {localStatus: 'creating', smState: ReplicaState.CREATING},
      {localStatus: 'syncing', smState: ReplicaState.SYNCING},
    ];

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // request_id
        fc.uuid(), // partition_id
        fc.uuid(), // replica_id
        fc.constantFrom(...transitionalStates), // state config
        async (requestId, partitionId, replicaId, stateConfig) => {
          const mockCDC = createMockCDCService();
          const mockCache = createMockSystemTableCache();
          const {factory} = createMockPartitionServiceFactory();
          const stateMachineCDC = createMockCDCService();
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: stateMachineCDC,
          });

          const manager = new ReplicaLifecycleManager({
            nodeId: 'test-node',
            cdcIntegrationService: mockCDC,
            systemTableCache: mockCache,
            dataDir: '/tmp/test-lifecycle',
            replicaStateMachine: stateMachine,
            createPartitionService: factory,
          });

          manager.initialize();

          // Pre-populate local replica in transitional state
          manager.localReplicas.set(replicaId, {
            replicaId,
            partitionId,
            status: stateConfig.localStatus,
            service: {async shutdown() {}, async syncFromLeader() {}},
          });

          // Set up state machine to match
          await stateMachine.transition(replicaId, ReplicaState.PENDING, {
            partitionId,
            nodeId: 'test-node',
            reason: 'test setup',
          });
          await stateMachine.transition(replicaId, ReplicaState.CREATING, {
            reason: 'test setup',
          });
          if (stateConfig.smState === ReplicaState.SYNCING) {
            await stateMachine.transition(replicaId, ReplicaState.SYNCING, {
              reason: 'test setup',
            });
          }

          mockCDC.reset();
          const stateBefore = stateMachine.getState(replicaId).state;

          const message = {
            request_id: requestId,
            partition_id: partitionId,
            replica_id: replicaId,
            table_name: 'test_table',
            table_id: partitionId,
          };

          const ack = await manager.handleCreateReplica(message);

          // Verify state didn't change
          const stateAfter = stateMachine.getState(replicaId).state;

          manager.shutdown();
          stateMachine.clear();

          return ack.status === AckStatus.IN_PROGRESS &&
            stateBefore === stateAfter &&
            mockCDC.operations.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('CREATE_REPLICA for creating/syncing replica returns in_progress');
  });

  /**
   * Feature: replica-lifecycle-state-machine, Property 13: Idempotent Operations
   * Validates: Requirements 9.3
   *
   * WHEN a REMOVE_REPLICA message is received for a replica that doesn't
   * exist, THE Lifecycle_Manager SHALL return `not_found` without error.
   */
  t.test('REMOVE_REPLICA for non-existent replica returns not_found', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // request_id
        fc.uuid(), // partition_id
        fc.uuid(), // replica_id
        async (requestId, partitionId, replicaId) => {
          const mockCDC = createMockCDCService();
          const mockCache = createMockSystemTableCache();
          const {factory} = createMockPartitionServiceFactory();
          const stateMachineCDC = createMockCDCService();
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: stateMachineCDC,
          });

          const manager = new ReplicaLifecycleManager({
            nodeId: 'test-node',
            cdcIntegrationService: mockCDC,
            systemTableCache: mockCache,
            dataDir: '/tmp/test-lifecycle',
            replicaStateMachine: stateMachine,
            createPartitionService: factory,
          });

          manager.initialize();

          // Don't add any replica - it should not exist
          mockCDC.reset();

          const message = {
            request_id: requestId,
            partition_id: partitionId,
            replica_id: replicaId,
            reason: 'rebalancing',
          };

          const ack = await manager.handleRemoveReplica(message);
          const cleanupDeletes = mockCDC.operations.filter((operation) =>
            operation.type === 'delete' &&
            operation.tableName === 'services' &&
            operation.whereClause?.service_id === replicaId &&
            operation.whereClause?.partition_id === partitionId,
          );

          manager.shutdown();
          stateMachine.clear();

          return ack.status === AckStatus.NOT_FOUND &&
            cleanupDeletes.length === mockCDC.operations.length;
        },
      ),
      {numRuns: 10},
    );

    t.pass('REMOVE_REPLICA for non-existent replica returns not_found');
  });

  /**
   * Feature: replica-lifecycle-state-machine, Property 13: Idempotent Operations
   * Validates: Requirements 9.4
   *
   * WHEN a REMOVE_REPLICA message is received for a replica already in
   * `removing` state, THE Lifecycle_Manager SHALL return `in_progress`
   * without changing state.
   */
  t.test('REMOVE_REPLICA for removing replica returns in_progress', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // request_id
        fc.uuid(), // partition_id
        fc.uuid(), // replica_id
        async (requestId, partitionId, replicaId) => {
          const mockCDC = createMockCDCService();
          const mockCache = createMockSystemTableCache();
          const {factory} = createMockPartitionServiceFactory();
          const stateMachineCDC = createMockCDCService();
          const stateMachine = new ReplicaStateMachine({
            nodeId: 'test-node',
            cdcIntegrationService: stateMachineCDC,
          });

          const manager = new ReplicaLifecycleManager({
            nodeId: 'test-node',
            cdcIntegrationService: mockCDC,
            systemTableCache: mockCache,
            dataDir: '/tmp/test-lifecycle',
            replicaStateMachine: stateMachine,
            createPartitionService: factory,
          });

          manager.initialize();

          // Pre-populate local replica in REMOVING state
          manager.localReplicas.set(replicaId, {
            replicaId,
            partitionId,
            status: 'removing',
            service: {async shutdown() {}, async syncFromLeader() {}},
          });

          // Set up state machine to REMOVING state
          await stateMachine.transition(replicaId, ReplicaState.PENDING, {
            partitionId,
            nodeId: 'test-node',
            reason: 'test setup',
          });
          await stateMachine.transition(replicaId, ReplicaState.CREATING, {
            reason: 'test setup',
          });
          await stateMachine.transition(replicaId, ReplicaState.SYNCING, {
            reason: 'test setup',
          });
          await stateMachine.transition(replicaId, ReplicaState.ACTIVE, {
            reason: 'test setup',
          });
          await stateMachine.transition(replicaId, ReplicaState.REMOVING, {
            reason: 'test setup',
          });

          mockCDC.reset();
          const stateBefore = stateMachine.getState(replicaId).state;

          const message = {
            request_id: requestId,
            partition_id: partitionId,
            replica_id: replicaId,
            reason: 'rebalancing',
          };

          const ack = await manager.handleRemoveReplica(message);

          // Verify state didn't change
          const stateAfter = stateMachine.getState(replicaId).state;

          manager.shutdown();
          stateMachine.clear();

          return ack.status === AckStatus.IN_PROGRESS &&
            stateBefore === stateAfter &&
            stateAfter === ReplicaState.REMOVING &&
            mockCDC.operations.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('REMOVE_REPLICA for removing replica returns in_progress');
  });
});
