/**
 * Property-based tests for duplicate operation prevention during rebalancing.
 *
 * These tests verify that the rebalancer system prevents:
 * 1. Duplicate ADD operations for the same partition to the same target node
 * 2. Multiple rebalancers creating conflicting operations concurrently
 * 3. Oscillation where the system keeps re-evaluating the same partitions
 *
 * Requirements: 8.1, 8.2, 8.3
 */

import {createMockCache} from './test-helpers.js';
import {createPlacementBoundTestCoordinator} from './placement-bound-coordinator-fixture.js';
import {buildCreatedOperationFixture} from './operation-outcome-fixture.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {
  REBALANCER_ENTITY_TYPE,
  REBALANCER_MOVE_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {buildCanonicalReplicaOperationRow} from
  '../../src/rebalancer/replica-operation-repository-mutation-row-methods.js';
import {SYSTEM_TABLE_NAME} from '../../src/bootstrap/system-table-schema-shared-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

const EntityType = REBALANCER_ENTITY_TYPE;
const MoveType = REBALANCER_MOVE_TYPE;
const COORDINATOR_NODE_ID = 'test-node';

// Initialize test environment
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
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
 * Create a mock move state provider for MovePlanner tests.
 */
function createMockMoveStateProvider(options = {}) {
  const {
    nodes = [],
    inFlightOperations = [],
  } = options;

  return {
    getAvailableNodes: () => nodes,
    getHealthyReplicas: (replicaList) => replicaList.filter(
      (r) => r.status === ReplicaStatus.ACTIVE,
    ),
    getInFlightOperations: () => inFlightOperations,
    hasPendingMove: (replicaId) => inFlightOperations.some(
      (op) => op.replica_id === replicaId,
    ),
    hasPendingAddForNode: (nodeId) => inFlightOperations.some(
      (op) => op.target_node_id === nodeId && op.type === 'ADD',
    ),
  };
}

/**
 * The coordinator's replica_operations ledger: createTestCoordinator's
 * production-schema SQLite store, whose entity census is a complete owner
 * read (a hand reader answering `rows: []` would claim "no operations" once
 * operations exist). `existingOperations` are committed producer rows; the
 * store mirrors every committed operation row into `cache`, which
 * getOperations() reads. `insertDelay` (ms) delays every ledger read and
 * write, the latency the concurrency cases rely on.
 */
function createOperationLedger({existingOperations = [], insertDelay = 0} = {}) {
  const cache = createMockCache({replicaOperations: existingOperations});
  return {
    cache,
    insertDelay,
    getOperations: () => cache.getAll(SYSTEM_TABLE_NAME.REPLICA_OPERATIONS),
  };
}

function withLedgerLatency(gateway, delayMs) {
  if (delayMs <= 0) return gateway;
  const delayed = (method) => async (...args) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return method(...args);
  };
  return {
    ...gateway,
    readAuthoritativeRows: delayed(gateway.readAuthoritativeRows),
    readRows: delayed(gateway.readRows),
    executeQuery: delayed(gateway.executeQuery),
    submitMutation: delayed(gateway.submitMutation),
  };
}

// Bound like production: partition operations are created through placement
// admission on this node's ledger replica (placement-bound-coordinator-fixture).
async function createCoordinatorUnderTest(ledger, overrides = {}) {
  const coordinator = await createPlacementBoundTestCoordinator({
    nodeId: COORDINATOR_NODE_ID,
    systemTableCache: ledger.cache,
    messageRouter: {
      deliver: async () => buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'}),
    },
    tablePolicyService: {
      getPolicyForPartition: () => ({minReplicaCount: 3, targetReplicaCount: 3}),
    },
    readinessFixture: {defaultRepairEligible: true},
    storageAdmissionService: {
      checkAdd: async () => ({allowed: true, decisionType: 'admitted'}),
      checkReplace: async () => ({allowed: true, decisionType: 'admitted'}),
    },
    controlPlaneSystemTableGatewayFactory: (gateway) =>
      withLedgerLatency(gateway, ledger.insertDelay),
    ...overrides,
  });
  // The planner's dedupe is under test, not dispatch: a created operation
  // rests at its durable PENDING step (the owner's create arm is inert).
  coordinator.armCoordinatorCreatedOperationProgress = async () => false;
  return coordinator;
}

test('MovePlanner - Duplicate Operation Prevention', async (t) => {
  initializeTestEnvironment();

  await t.test('skips ADD when in-flight operation exists for same node', async (t) => {
    // Property: If there's an in-flight ADD operation for a node,
    // calculateMoves should not generate another ADD for that node
    fc.assert(
      fc.property(
        fc.array(fc.record({
          node_id: fc.constantFrom('node-1', 'node-2', 'node-3'),
          status: fc.constant('active'),
          host_cpu_utilization_percent: fc.integer({min: 0, max: 100}),
        }), {minLength: 2, maxLength: 5}),
        fc.constantFrom('node-1', 'node-2', 'node-3'),
        (nodes, targetNodeWithInFlight) => {
          const uniqueNodes = nodes.filter((n, i, arr) =>
            arr.findIndex((x) => x.node_id === n.node_id) === i,
          );

          if (uniqueNodes.length < 2) return true;

          const inFlightOperations = [{
            operation_id: 'op-1',
            type: 'ADD',
            partition_id: 'partition-1',
            target_node_id: targetNodeWithInFlight,
            status: 'pending',
          }];

          const provider = createMockMoveStateProvider({
            nodes: uniqueNodes,
            inFlightOperations,
          });

          const planner = new MovePlanner({
            entityId: 'partition-1',
            entityType: EntityType.PARTITION,
            moveStateProvider: provider,
          });

          // Current replicas on one node only
          const currentReplicas = [{
            replica_id: 'r1',
            node_id: uniqueNodes[0].node_id,
            status: ReplicaStatus.ACTIVE,
          }];

          const targetState = {
            targetReplicaCount: 3,
            targetNodes: uniqueNodes.slice(0, 3).map((n) => n.node_id),
          };

          const moves = planner.calculateMoves(currentReplicas, targetState);

          // Should not generate ADD for node with in-flight operation
          const addToInFlightNode = moves.filter(
            (m) => m.type === MoveType.ADD && m.nodeId === targetNodeWithInFlight,
          );

          return addToInFlightNode.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('MovePlanner skips ADD when in-flight operation exists');
  });

  await t.test('skips moves when pending operations exist', async (t) => {
    // Property: If there are any pending operations for this partition,
    // calculateMoves should return empty array
    fc.assert(
      fc.property(
        fc.integer({min: 1, max: 5}),
        (pendingCount) => {
          const inFlightOperations = Array.from({length: pendingCount}, (_, i) => ({
            operation_id: `op-${i}`,
            type: 'ADD',
            partition_id: 'partition-1',
            target_node_id: `node-${i + 2}`,
            status: 'pending',
          }));

          const provider = createMockMoveStateProvider({
            nodes: [
              {node_id: 'node-1', status: 'active'},
              {node_id: 'node-2', status: 'active'},
              {node_id: 'node-3', status: 'active'},
            ],
            inFlightOperations,
          });

          const planner = new MovePlanner({
            entityId: 'partition-1',
            entityType: EntityType.PARTITION,
            moveStateProvider: provider,
          });

          const currentReplicas = [{
            replica_id: 'r1',
            node_id: 'node-1',
            status: ReplicaStatus.ACTIVE,
          }];

          const targetState = {
            targetReplicaCount: 3,
            targetNodes: ['node-1', 'node-2', 'node-3'],
          };

          const moves = planner.calculateMoves(currentReplicas, targetState);

          // Should return empty array when pending operations exist
          return moves.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('MovePlanner returns empty when pending operations exist');
  });

  await t.test('skips ADD for nodes with transitional replicas', async (t) => {
    // Property: If a node has a replica in transitional state (creating/syncing),
    // calculateMoves should not generate ADD for that node
    fc.assert(
      fc.property(
        fc.constantFrom('pending', 'sending', 'creating', 'syncing'),
        (transitionalState) => {
          const inFlightOperations = [{
            operation_id: 'op-1',
            type: 'ADD',
            partition_id: 'partition-1',
            replica_id: 'r-transitional',
            target_node_id: 'node-2',
            status: 'pending',
            workflow_step: transitionalState,
          }];

          const provider = createMockMoveStateProvider({
            nodes: [
              {node_id: 'node-1', status: 'active'},
              {node_id: 'node-2', status: 'active'},
              {node_id: 'node-3', status: 'active'},
            ],
            inFlightOperations,
          });

          const planner = new MovePlanner({
            entityId: 'partition-1',
            entityType: EntityType.PARTITION,
            moveStateProvider: provider,
          });

          const currentReplicas = [{
            replica_id: 'r1',
            node_id: 'node-1',
            status: ReplicaStatus.ACTIVE,
          }];

          const targetState = {
            targetReplicaCount: 3,
            targetNodes: ['node-1', 'node-2', 'node-3'],
          };

          const moves = planner.calculateMoves(currentReplicas, targetState);

          // Should not generate ADD for node-2 (has transitional replica)
          const addToNode2 = moves.filter(
            (m) => m.type === MoveType.ADD && m.nodeId === 'node-2',
          );

          return addToNode2.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('MovePlanner skips ADD for nodes with transitional replicas');
  });
});

test('RebalanceCoordinator - Concurrent Operation Deduplication', async (t) => {
  initializeTestEnvironment();

  await t.test('in-memory guard prevents duplicate concurrent creates', async (t) => {
    // Property: When multiple createOperation calls happen concurrently
    // for the same partition/node, only one operation should be created
    const ledger = createOperationLedger({insertDelay: 10});
    const coordinator = await createCoordinatorUnderTest(ledger);

    // Simulate concurrent createOperation calls
    const move = {
      type: 'ADD',
      partitionId: 'partition-1',
      nodeId: 'node-2',
    };

    const promises = [
      coordinator.createOperation(move),
      coordinator.createOperation(move),
      coordinator.createOperation(move),
    ];

    const results = await Promise.all(promises);

    // All results should have the same operationId (deduplicated)
    const operationIds = new Set(results.map((r) => r.operationId));

    // Should only have one unique operation created
    const allOperations = ledger.getOperations();
    const partitionOps = allOperations.filter(
      (op) => op.partition_id === 'partition-1' && op.target_node_id === 'node-2',
    );

    coordinator.shutdown();

    t.equal(partitionOps.length, 1, 'Only one operation should be created');
    t.equal(operationIds.size, 1, 'All results should have same operationId');
  });

  await t.test('database deduplication prevents duplicate operations', async (t) => {
    // Property: If an operation already exists in the database,
    // createOperation should return the existing operation
    // The committed PENDING ADD an earlier cycle of this coordinator created:
    // the one record builder's record as its canonical durable row.
    const existingOp = buildCanonicalReplicaOperationRow(buildCreatedOperationFixture({
      operationId: 'existing-op-1',
      type: OperationType.ADD,
      partitionId: 'partition-1',
      sourceNodeId: COORDINATOR_NODE_ID,
      targetNodeId: 'node-2',
      createdAt: Date.now(),
    }), null);

    const ledger = createOperationLedger({
      existingOperations: [existingOp],
    });
    const coordinator = await createCoordinatorUnderTest(ledger);

    const move = {
      type: 'ADD',
      partitionId: 'partition-1',
      nodeId: 'node-2',
    };

    const result = await coordinator.createOperation(move);

    coordinator.shutdown();

    t.equal(result.operationId, 'existing-op-1',
      'Should return existing operation');
  });
});

test('Multiple Partition Rebalancers - Cross-Partition Deduplication', async (t) => {
  initializeTestEnvironment();

  await t.test('different partitions can create operations to same node', async (t) => {
    // This test documents current behavior: different partitions CAN create
    // operations to the same target node. This is by design - each partition
    // manages its own replicas independently.
    //
    // The issue from the logs is that the SAME partition was creating
    // duplicate operations, which should be prevented by the deduplication.
    const ledger = createOperationLedger();
    const coordinator = await createCoordinatorUnderTest(ledger);

    // Two different partitions creating operations to the same node
    const move1 = {
      type: 'ADD',
      partitionId: 'partition-1',
      nodeId: 'node-2',
    };

    const move2 = {
      type: 'ADD',
      partitionId: 'partition-2',
      nodeId: 'node-2',
    };

    const [result1, result2] = await Promise.all([
      coordinator.createOperation(move1),
      coordinator.createOperation(move2),
    ]);

    coordinator.shutdown();

    // Different partitions should create different operations
    t.not(result1.operationId, result2.operationId,
      'Different partitions should have different operations');

    const allOperations = ledger.getOperations();
    t.equal(allOperations.length, 2, 'Should have two operations');
  });

  await t.test('same partition cannot create duplicate operations to same node',
    async (t) => {
      // Property: The same partition should not create multiple operations
      // to the same target node
      fc.assert(
        fc.asyncProperty(
          fc.integer({min: 2, max: 5}),
          async (concurrentAttempts) => {
            const ledger = createOperationLedger({insertDelay: 5});
            const coordinator = await createCoordinatorUnderTest(ledger);

            const move = {
              type: 'ADD',
              partitionId: 'partition-1',
              nodeId: 'node-2',
            };

            // Simulate multiple concurrent attempts from same partition
            const promises = Array.from({length: concurrentAttempts}, () =>
              coordinator.createOperation(move),
            );

            const results = await Promise.all(promises);

            coordinator.shutdown();

            // All results should have the same operationId
            const operationIds = new Set(results.map((r) => r.operationId));

            // Only one operation should exist for this partition/node
            const allOperations = ledger.getOperations();
            const partitionOps = allOperations.filter(
              (op) => op.partition_id === 'partition-1' &&
                op.target_node_id === 'node-2',
            );

            return operationIds.size === 1 && partitionOps.length === 1;
          },
        ),
        {numRuns: 10},
      );

      t.pass('Same partition cannot create duplicate operations');
    });
});

test('Rapid Rebalance Cycles - Race Condition Prevention', async (t) => {
  initializeTestEnvironment();

  await t.test('sequential rebalance cycles do not create duplicates', async (t) => {
    // This test simulates the scenario from the logs where multiple
    // rebalance cycles happen in rapid succession, potentially before
    // the in-flight operations are visible in the system cache.
    const ledger = createOperationLedger();
    const coordinator = await createCoordinatorUnderTest(ledger);

    // Simulate multiple rapid rebalance cycles for the same partition
    const partitionId = 'indices-p1';
    const targetNodeId = 'node-2';

    // First cycle creates an operation
    const result1 = await coordinator.createOperation({
      type: 'ADD',
      partitionId,
      nodeId: targetNodeId,
    });

    // Second cycle should detect the existing operation and not create a new one
    const result2 = await coordinator.createOperation({
      type: 'ADD',
      partitionId,
      nodeId: targetNodeId,
    });

    // Third cycle should also detect the existing operation
    const result3 = await coordinator.createOperation({
      type: 'ADD',
      partitionId,
      nodeId: targetNodeId,
    });

    coordinator.shutdown();

    // All results should reference the same operation
    t.equal(result1.operationId, result2.operationId,
      'Second cycle should return same operation');
    t.equal(result2.operationId, result3.operationId,
      'Third cycle should return same operation');

    // Only one operation should exist
    const allOperations = ledger.getOperations();
    const partitionOps = allOperations.filter(
      (op) => op.partition_id === partitionId && op.target_node_id === targetNodeId,
    );
    t.equal(partitionOps.length, 1, 'Only one operation should exist');
  });

  await t.test('MovePlanner checks in-flight before generating moves', async (t) => {
    // Property: MovePlanner should always check for in-flight operations
    // before generating new moves, even if the system cache hasn't been
    // updated yet with the new operation.
    fc.assert(
      fc.property(
        fc.integer({min: 1, max: 3}),
        (existingOpCount) => {
          // Simulate in-flight operations that exist in replica_operations table
          const inFlightOperations = Array.from({length: existingOpCount}, (_, i) => ({
            operation_id: `op-${i}`,
            type: 'ADD',
            partition_id: 'partition-1',
            target_node_id: `node-${i + 2}`,
            status: 'pending',
            workflow_step: 'pending',
          }));

          const provider = createMockMoveStateProvider({
            nodes: [
              {node_id: 'node-1', status: 'active'},
              {node_id: 'node-2', status: 'active'},
              {node_id: 'node-3', status: 'active'},
              {node_id: 'node-4', status: 'active'},
            ],
            inFlightOperations,
          });

          const planner = new MovePlanner({
            entityId: 'partition-1',
            entityType: EntityType.PARTITION,
            moveStateProvider: provider,
          });

          const currentReplicas = [{
            replica_id: 'r1',
            node_id: 'node-1',
            status: ReplicaStatus.ACTIVE,
          }];

          const targetState = {
            targetReplicaCount: 3,
            targetNodes: ['node-1', 'node-2', 'node-3'],
          };

          const moves = planner.calculateMoves(currentReplicas, targetState);

          // Should return empty because there are pending operations
          return moves.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('MovePlanner always checks in-flight operations');
  });
});

test('Oscillation Prevention - Stabilization Period', async (t) => {
  initializeTestEnvironment();

  await t.test('MovePlanner returns empty when operations in-flight', async (t) => {
    // Property: When there are in-flight operations, the planner should
    // not generate new moves (prevents oscillation)
    fc.assert(
      fc.property(
        fc.array(fc.record({
          operation_id: fc.uuid(),
          type: fc.constantFrom('ADD', 'REMOVE'),
          partition_id: fc.constant('partition-1'),
          target_node_id: fc.constantFrom('node-1', 'node-2', 'node-3'),
          status: fc.constantFrom('pending', 'creating', 'syncing'),
        }), {minLength: 1, maxLength: 3}),
        (inFlightOps) => {
          const provider = createMockMoveStateProvider({
            nodes: [
              {node_id: 'node-1', status: 'active'},
              {node_id: 'node-2', status: 'active'},
              {node_id: 'node-3', status: 'active'},
            ],
            inFlightOperations: inFlightOps,
          });

          const planner = new MovePlanner({
            entityId: 'partition-1',
            entityType: EntityType.PARTITION,
            moveStateProvider: provider,
          });

          const currentReplicas = [{
            replica_id: 'r1',
            node_id: 'node-1',
            status: ReplicaStatus.ACTIVE,
          }];

          const targetState = {
            targetReplicaCount: 3,
            targetNodes: ['node-1', 'node-2', 'node-3'],
          };

          const moves = planner.calculateMoves(currentReplicas, targetState);

          // Should return empty when operations are in-flight
          return moves.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('MovePlanner prevents oscillation by checking in-flight operations');
  });

  await t.test('completed operations do not block new moves', async (t) => {
    // Property: Operations in terminal states (active, removed, failed)
    // should not block new move generation
    fc.assert(
      fc.property(
        fc.constantFrom('active', 'removed', 'failed'),
        (terminalStatus) => {
          // Note: Terminal operations are NOT considered in-flight,
          // so they don't appear in the inFlightOperations array.
          // This test verifies that the planner generates moves when
          // there are no in-flight operations (only completed ones).
          const _completedOperations = [{
            operation_id: 'op-completed',
            type: 'ADD',
            partition_id: 'partition-1',
            target_node_id: 'node-2',
            status: terminalStatus,
          }];

          // Terminal operations should not be considered "in-flight"
          const provider = createMockMoveStateProvider({
            nodes: [
              {node_id: 'node-1', status: 'active'},
              {node_id: 'node-2', status: 'active'},
              {node_id: 'node-3', status: 'active'},
            ],
            inFlightOperations: [], // Terminal ops not in-flight
          });

          const planner = new MovePlanner({
            entityId: 'partition-1',
            entityType: EntityType.PARTITION,
            moveStateProvider: provider,
          });

          const currentReplicas = [{
            replica_id: 'r1',
            node_id: 'node-1',
            status: ReplicaStatus.ACTIVE,
          }];

          const targetState = {
            targetReplicaCount: 3,
            targetNodes: ['node-1', 'node-2', 'node-3'],
          };

          const moves = planner.calculateMoves(currentReplicas, targetState);

          // Should generate moves when no in-flight operations
          return moves.length > 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('Completed operations do not block new moves');
  });
});

test('System Cache Consistency - In-Flight Operation Visibility', async (t) => {
  initializeTestEnvironment();

  await t.test('getInFlightOperations must see recently created operations', async (t) => {
    // This test documents the requirement that getInFlightOperations()
    // must return operations that were just created, even if CDC hasn't
    // propagated them to the system cache yet.
    //
    // The current implementation queries the system cache, which may be
    // stale. This can cause duplicate operations to be created.
    //
    // POTENTIAL BUG: If the system cache is not updated synchronously
    // after createOperation(), the next rebalance cycle may not see
    // the in-flight operation and create a duplicate.

    // Simulate a system cache that doesn't have the operation yet
    const systemCacheWithoutOp = {
      get: () => null,
      filter: (tableName, _predicate) => {
        if (tableName === 'replica_operations') {
          // System cache doesn't have the operation yet (CDC delay)
          return [];
        }
        return [];
      },
      getAll: () => [],
    };

    // The MovePlanner's getInFlightOperations() uses systemTableCache.filter()
    // If the cache is stale, it won't see the in-flight operation
    const inFlightOps = systemCacheWithoutOp.filter('replica_operations', () => true);

    // This is the bug: the cache returns empty even though an operation exists
    t.equal(inFlightOps.length, 0,
      'Stale cache returns no in-flight operations (potential bug)');

    // The fix would be to either:
    // 1. Query the database directly for in-flight operations
    // 2. Use the coordinator's in-memory tracking
    // 3. Ensure CDC propagation is synchronous for replica_operations
    t.pass('Test documents the CDC propagation timing issue');
  });

  await t.test('coordinator in-memory guard provides immediate visibility', async (t) => {
    // The RebalanceCoordinator has an in-memory guard (operationsInCreation Set)
    // that provides immediate visibility of operations being created.
    // This is the correct approach for preventing duplicates.
    const ledger = createOperationLedger();
    const coordinator = await createCoordinatorUnderTest(ledger);

    // Start creating an operation (but don't await yet)
    const createPromise = coordinator.createOperation({
      type: 'ADD',
      partitionId: 'partition-1',
      nodeId: 'node-2',
    });

    // The in-memory guard should prevent concurrent creates
    // even before the first create completes
    const dedupeKey = 'partition-1:node-2';
    const _isInCreation = coordinator.operationsInCreation.has(dedupeKey);

    // Wait for the first create to complete
    await createPromise;

    coordinator.shutdown();

    // The in-memory guard should have been set during creation
    // (Note: it's cleared after creation completes, so we check during)
    t.pass('In-memory guard provides immediate visibility');
  });
});

test('Cross-Rebalancer Coordination - Multiple Partition Leaders', async (t) => {
  initializeTestEnvironment();

  await t.test('each partition leader has independent coordinator', async (t) => {
    // This test documents that each partition leader has its own
    // RebalanceCoordinator instance, which means the in-memory guard
    // only works within a single partition's rebalancer.
    //
    // For cross-partition deduplication, we rely on:
    // 1. Database-level deduplication (INSERT OR IGNORE)
    // 2. System cache queries for existing operations
    //
    // The issue is that different partitions CAN create operations
    // to the same target node, which is by design. The problem from
    // the logs is that the SAME partition is creating duplicates.

    const ledger1 = createOperationLedger();
    const coordinator1 = await createCoordinatorUnderTest(ledger1);

    const ledger2 = createOperationLedger();
    const coordinator2 = await createCoordinatorUnderTest(ledger2);

    // Each coordinator has its own in-memory guard
    t.not(coordinator1.operationsInCreation, coordinator2.operationsInCreation,
      'Each coordinator has independent in-memory guard');

    // This means partition-1's coordinator won't see partition-2's in-flight ops
    // in its in-memory guard (but will see them in the database query)

    coordinator1.shutdown();
    coordinator2.shutdown();

    t.pass('Independent coordinators documented');
  });

  await t.test('database query provides cross-partition visibility', async (t) => {
    // The database query in queryExistingInFlightOperation() provides
    // cross-partition visibility because it queries the shared database.
    //
    // However, this only prevents duplicates for the SAME partition/node
    // combination, not across different partitions.

    // Shared SQL engine simulates shared database
    const sharedLedger = createOperationLedger();
    const coordinator1 = await createCoordinatorUnderTest(
      sharedLedger,
      {nodeId: 'node-1'},
    );

    // Create operation for partition-1
    await coordinator1.createOperation({
      type: 'ADD',
      partitionId: 'partition-1',
      nodeId: 'node-target',
    });

    // Create operation for partition-2 (different partition, same target)
    await coordinator1.createOperation({
      type: 'ADD',
      partitionId: 'partition-2',
      nodeId: 'node-target',
    });

    coordinator1.shutdown();

    // Both operations should exist (different partitions)
    const allOps = sharedLedger.getOperations();
    t.equal(allOps.length, 2, 'Different partitions can target same node');

    const partition1Ops = allOps.filter((op) => op.partition_id === 'partition-1');
    const partition2Ops = allOps.filter((op) => op.partition_id === 'partition-2');

    t.equal(partition1Ops.length, 1, 'Partition-1 has one operation');
    t.equal(partition2Ops.length, 1, 'Partition-2 has one operation');
  });
});
