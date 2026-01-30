/**
 * Property Test: Replica Status State Machine Validity
 * **Property 79: Replica Status State Machine Validity**
 * **Validates: Requirements 10.17, 10.18, 10.19**
 *
 * *For any* status transition attempt, the system should:
 * 1. Only allow valid transitions as defined in VALID_STATUS_TRANSITIONS
 * 2. Reject invalid transitions with an error
 * 3. Allow transition to FAILED from any state
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  ReplicaLifecycleManager,
  ReplicaStatus,
  VALID_STATUS_TRANSITIONS,
} from '../../src/node/replica-lifecycle-manager.js';
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
    async insertSystemTableRow(tableName, data) {
      operations.push({type: 'insert', tableName, data});
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
    async upsertSystemTableRow(tableName, data) {
      operations.push({type: 'upsert', tableName, data});
      return {success: true};
    },
    reset() {
      operations.length = 0;
    },
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
    set: (_tableName, _key, _value) => {},
  };
}

/**
 * Create a mock partition service factory.
 * @return {Function} Factory function.
 */
function createMockPartitionServiceFactory() {
  return async (options) => ({
    partitionId: options.partitionId,
    replicaId: options.replicaId,
    initialized: true,
    async shutdown() {},
    async syncFromLeader() {},
  });
}

// All possible statuses
const ALL_STATUSES = [
  ReplicaStatus.STARTING,
  ReplicaStatus.SYNCING,
  ReplicaStatus.ACTIVE,
  ReplicaStatus.STOPPING,
  ReplicaStatus.STOPPED,
  ReplicaStatus.FAILED,
];

test('Property 79: Replica Status State Machine Validity', async (t) => {
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
   * Property: For any valid transition defined in VALID_STATUS_TRANSITIONS,
   * the transition should succeed.
   */
  t.test('valid transitions succeed', async (t) => {
    // Generate valid transition pairs
    const validTransitions = [];
    for (const [fromStatus, toStatuses] of Object.entries(VALID_STATUS_TRANSITIONS)) {
      for (const toStatus of toStatuses) {
        validTransitions.push({from: fromStatus, to: toStatus});
      }
    }

    // Add FAILED transitions from all states
    for (const status of ALL_STATUSES) {
      if (status !== ReplicaStatus.FAILED) {
        validTransitions.push({from: status, to: ReplicaStatus.FAILED});
      }
    }

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...validTransitions),
        fc.uuid(), // replica_id
        fc.uuid(), // partition_id
        async (transition, replicaId, partitionId) => {
          const mockCDC = createMockCDCService();

          const manager = new ReplicaLifecycleManager({
            nodeId: 'test-node',
            systemTableCache: createMockSystemTableCache(),
            cdcIntegrationService: mockCDC,
            createPartitionService: createMockPartitionServiceFactory(),
            dataDir: '/tmp/test-lifecycle',
          });

          manager.initialize();

          // Set up replica with initial status
          manager.localReplicas.set(replicaId, {
            replicaId,
            partitionId,
            status: transition.from,
            service: null,
          });

          // Attempt transition
          let success = false;
          try {
            await manager.updateReplicaStatus(replicaId, transition.to);
            success = true;
          } catch (_error) {
            success = false;
          }

          manager.shutdown();

          return success === true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('valid transitions succeed');
  });

  /**
   * Property: For any invalid transition (not in VALID_STATUS_TRANSITIONS
   * and not to FAILED), the transition should fail.
   */
  t.test('invalid transitions fail', async (t) => {
    // Generate invalid transition pairs
    const invalidTransitions = [];
    for (const fromStatus of ALL_STATUSES) {
      const validNextStates = VALID_STATUS_TRANSITIONS[fromStatus] || [];
      for (const toStatus of ALL_STATUSES) {
        // Skip if it's a valid transition or transition to FAILED
        if (!validNextStates.includes(toStatus) && toStatus !== ReplicaStatus.FAILED) {
          // Skip self-transitions
          if (fromStatus !== toStatus) {
            invalidTransitions.push({from: fromStatus, to: toStatus});
          }
        }
      }
    }

    if (invalidTransitions.length === 0) {
      t.pass('no invalid transitions to test');
      return;
    }

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...invalidTransitions),
        fc.uuid(), // replica_id
        fc.uuid(), // partition_id
        async (transition, replicaId, partitionId) => {
          const mockCDC = createMockCDCService();

          const manager = new ReplicaLifecycleManager({
            nodeId: 'test-node',
            systemTableCache: createMockSystemTableCache(),
            cdcIntegrationService: mockCDC,
            createPartitionService: createMockPartitionServiceFactory(),
            dataDir: '/tmp/test-lifecycle',
          });

          manager.initialize();

          // Set up replica with initial status
          manager.localReplicas.set(replicaId, {
            replicaId,
            partitionId,
            status: transition.from,
            service: null,
          });

          // Attempt invalid transition
          let threwError = false;
          try {
            await manager.updateReplicaStatus(replicaId, transition.to);
          } catch (error) {
            threwError = true;
          }

          manager.shutdown();

          return threwError === true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('invalid transitions fail');
  });

  /**
   * Property: For any state, transition to FAILED should always succeed.
   */
  t.test('transition to FAILED always succeeds', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...ALL_STATUSES.filter((s) => s !== ReplicaStatus.FAILED)),
        fc.uuid(), // replica_id
        fc.uuid(), // partition_id
        async (fromStatus, replicaId, partitionId) => {
          const mockCDC = createMockCDCService();

          const manager = new ReplicaLifecycleManager({
            nodeId: 'test-node',
            systemTableCache: createMockSystemTableCache(),
            cdcIntegrationService: mockCDC,
            createPartitionService: createMockPartitionServiceFactory(),
            dataDir: '/tmp/test-lifecycle',
          });

          manager.initialize();

          // Set up replica with initial status
          manager.localReplicas.set(replicaId, {
            replicaId,
            partitionId,
            status: fromStatus,
            service: null,
          });

          // Attempt transition to FAILED
          let success = false;
          try {
            await manager.updateReplicaStatus(replicaId, ReplicaStatus.FAILED);
            success = true;
          } catch (_error) {
            success = false;
          }

          manager.shutdown();

          return success === true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('transition to FAILED always succeeds');
  });

  /**
   * Property: isValidTransition correctly validates all transitions.
   */
  t.test('isValidTransition validates correctly', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...ALL_STATUSES),
        fc.constantFrom(...ALL_STATUSES),
        async (fromStatus, toStatus) => {
          const mockCDC = createMockCDCService();

          const manager = new ReplicaLifecycleManager({
            nodeId: 'test-node',
            systemTableCache: createMockSystemTableCache(),
            cdcIntegrationService: mockCDC,
            createPartitionService: createMockPartitionServiceFactory(),
            dataDir: '/tmp/test-lifecycle',
          });

          const isValid = manager.isValidTransition(fromStatus, toStatus);

          manager.shutdown();

          // Check against expected validity
          const validNextStates = VALID_STATUS_TRANSITIONS[fromStatus] || [];
          const expectedValid = validNextStates.includes(toStatus) ||
            toStatus === ReplicaStatus.FAILED;

          return isValid === expectedValid;
        },
      ),
      {numRuns: 10},
    );

    t.pass('isValidTransition validates correctly');
  });

  /**
   * Property: Terminal states (STOPPED, FAILED) have no valid outgoing transitions.
   */
  t.test('terminal states have no outgoing transitions', async (t) => {
    const terminalStates = [ReplicaStatus.STOPPED, ReplicaStatus.FAILED];

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...terminalStates),
        fc.constantFrom(...ALL_STATUSES.filter((s) =>
          s !== ReplicaStatus.FAILED)), // Exclude FAILED as target
        fc.uuid(), // replica_id
        async (terminalStatus, targetStatus, replicaId) => {
          const mockCDC = createMockCDCService();

          const manager = new ReplicaLifecycleManager({
            nodeId: 'test-node',
            systemTableCache: createMockSystemTableCache(),
            cdcIntegrationService: mockCDC,
            createPartitionService: createMockPartitionServiceFactory(),
            dataDir: '/tmp/test-lifecycle',
          });

          manager.initialize();

          // Set up replica in terminal state
          manager.localReplicas.set(replicaId, {
            replicaId,
            partitionId: 'test-partition',
            status: terminalStatus,
            service: null,
          });

          // Attempt transition (should fail unless going to FAILED)
          let threwError = false;
          try {
            await manager.updateReplicaStatus(replicaId, targetStatus);
          } catch (_error) {
            threwError = true;
          }

          manager.shutdown();

          // Should throw error for non-FAILED targets from terminal states
          return threwError === true;
        },
      ),
      {numRuns: 10},
    );

    t.pass('terminal states have no outgoing transitions');
  });

  /**
   * Property: Status updates emit statusChanged event with correct data.
   */
  t.test('status updates emit statusChanged event', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // replica_id
        async (replicaId) => {
          const mockCDC = createMockCDCService();

          const manager = new ReplicaLifecycleManager({
            nodeId: 'test-node',
            systemTableCache: createMockSystemTableCache(),
            cdcIntegrationService: mockCDC,
            createPartitionService: createMockPartitionServiceFactory(),
            dataDir: '/tmp/test-lifecycle',
          });

          manager.initialize();

          // Set up replica
          manager.localReplicas.set(replicaId, {
            replicaId,
            partitionId: 'test-partition',
            status: ReplicaStatus.STARTING,
            service: null,
          });

          // Track emitted events
          let emittedEvent = null;
          manager.on('statusChanged', (event) => {
            emittedEvent = event;
          });

          // Perform valid transition
          await manager.updateReplicaStatus(replicaId, ReplicaStatus.SYNCING);

          manager.shutdown();

          // Verify event was emitted with correct data
          return emittedEvent !== null &&
            emittedEvent.replicaId === replicaId &&
            emittedEvent.previousStatus === ReplicaStatus.STARTING &&
            emittedEvent.newStatus === ReplicaStatus.SYNCING;
        },
      ),
      {numRuns: 10},
    );

    t.pass('status updates emit statusChanged event');
  });
});
