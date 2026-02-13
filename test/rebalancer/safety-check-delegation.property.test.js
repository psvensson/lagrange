/**
 * Property-based test for safety check delegation.
 *
 * **Feature: architecture-violations-cleanup, Property 1: Safety check delegation**
 *
 * For any move operation passed to UnifiedRebalancer, the safety validation
 * result SHALL be identical to calling RebalanceCoordinator.getMoveSafetyError()
 * directly with the same move — i.e., UnifiedRebalancer does not add, remove,
 * or modify safety checks independently.
 *
 * **Validates: Requirements 2.2**
 */

import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  UnifiedRebalancer,
  EntityType,
  MoveType,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
  REBALANCER_SKIP_REASON,
} from '../../src/rebalancer/rebalancer-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

/**
 * Initialize test singletons.
 */
function initEnv() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-node'},
      logging: {level: 'error'},
    });
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

/**
 * Arbitrary for generating random move objects with realistic fields.
 */
const moveArb = fc.record({
  type: fc.constantFrom(MoveType.ADD, MoveType.REMOVE),
  nodeId: fc.stringMatching(/^node-[a-z0-9]{1,8}$/),
  replicaId: fc.stringMatching(/^replica-[a-z0-9]{1,8}$/),
});

/**
 * Arbitrary for generating a safety error response (null or string).
 */
const safetyErrorArb = fc.oneof(
  fc.constant(null),
  fc.stringMatching(/^[A-Za-z ]{3,30}$/),
);

/**
 * Create a mock coordinator that records calls and returns a
 * configurable safety error.
 * @param {string|null} safetyError - Error to return from getMoveSafetyError.
 * @return {Object} Mock coordinator with call recording.
 */
function createRecordingCoordinator(safetyError) {
  const calls = [];
  return {
    calls,
    getMoveSafetyError: (move) => {
      calls.push(move);
      return safetyError;
    },
    createOperation: async (move) => ({
      operationId: 'op-test',
      type: move.type,
      partitionId: move.partitionId,
      targetNodeId: move.nodeId,
      replicaId: move.replicaId,
      status: 'pending',
      workflowStep: 'pending',
    }),
  };
}

/**
 * Create a minimal mock system table cache.
 * @return {Object} Mock cache.
 */
function createMockCache() {
  return {
    get: () => null,
    filter: () => [],
    getAll: () => [],
  };
}

/**
 * Create a minimal mock message router.
 * @return {Object} Mock router.
 */
function createMockRouter() {
  return {
    getConnectionState: () => 'connected',
    deliver: async () => ({acknowledged: true, status: 'completed'}),
    pingNode: async () => true,
    isOutboundQueueAvailable: () => true,
  };
}

/**
 * Create a minimal mock CDC integration service.
 * @return {Object} Mock CDC service.
 */
function createMockCdc() {
  return {
    insertSystemTableRow: async () => ({success: true}),
    updateSystemTableRow: async () => ({success: true}),
  };
}

/**
 * Create a minimal mock table policy service.
 * @return {Object} Mock policy service.
 */
function createMockPolicyService() {
  return {
    getPolicyForPartition: () => ({
      replicaCount: 3,
      minReplicaCount: 3,
      maxReplicaCount: 7,
    }),
    getMessageGroupPolicy: async () => ({
      targetReplicaCount: 3,
      maxReplicaCount: 5,
      ensureLocalAccess: true,
      placementConstraints: {spreadAcrossNodes: true},
    }),
  };
}

test('Property 1: Safety check delegation', async (t) => {
  initEnv();

  await t.test(
    'UnifiedRebalancer does NOT have its own getMoveSafetyError method',
    async (t) => {
      const coordinator = createRecordingCoordinator(null);
      const rebalancer = new UnifiedRebalancer({
        entityId: 'partition-test',
        entityType: EntityType.PARTITION,
        nodeId: 'node-1',
        systemTableCache: createMockCache(),
        cdcIntegrationService: createMockCdc(),
        tablePolicyService: createMockPolicyService(),
        messageRouter: createMockRouter(),
        rebalanceCoordinator: coordinator,
      });

      t.equal(
        Object.prototype.hasOwnProperty.call(rebalancer, 'getMoveSafetyError'),
        false,
        'instance does not own getMoveSafetyError',
      );
      t.equal(
        typeof UnifiedRebalancer.prototype.getMoveSafetyError,
        'undefined',
        'prototype does not define getMoveSafetyError',
      );
    },
  );

  await t.test(
    'executeMoveViaCoordinator delegates safety check to coordinator ' +
    'with enriched move',
    async (_t) => {
      await fc.assert(
        fc.asyncProperty(
          moveArb,
          safetyErrorArb,
          async (move, safetyError) => {
            const entityId = 'partition-prop';
            const entityType = EntityType.PARTITION;
            const coordinator = createRecordingCoordinator(safetyError);

            const rebalancer = new UnifiedRebalancer({
              entityId,
              entityType,
              nodeId: 'node-1',
              systemTableCache: createMockCache(),
              cdcIntegrationService: createMockCdc(),
              tablePolicyService: createMockPolicyService(),
              messageRouter: createMockRouter(),
              rebalanceCoordinator: coordinator,
            });

            const result = await rebalancer.executeMoveViaCoordinator(move);

            // Coordinator must have been called exactly once
            if (coordinator.calls.length !== 1) {
              return false;
            }

            const calledWith = coordinator.calls[0];

            // Verify the enriched move passed to coordinator
            if (calledWith.type !== move.type) return false;
            if (calledWith.nodeId !== move.nodeId) return false;
            if (calledWith.replicaId !== move.replicaId) return false;
            if (calledWith.partitionId !== entityId) return false;
            if (calledWith.entityType !== entityType) return false;
            if (calledWith.entityId !== entityId) return false;

            // When coordinator returns an error, the result must reflect it
            if (safetyError !== null) {
              if (result.success !== false) return false;
              if (result.skipped !== true) return false;
              if (result.reason !== REBALANCER_SKIP_REASON.SAFETY_BLOCKED) {
                return false;
              }
              if (result.error !== safetyError) return false;
            } else {
              // When coordinator returns null, the move proceeds
              if (result.success !== true) return false;
            }

            return true;
          },
        ),
        {numRuns: 10},
      );
    },
  );
});
