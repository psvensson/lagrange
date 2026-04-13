/**
 * Property Test: No Duplicate ADD Moves for Transitional Replicas
 * **Property 3: No Duplicate ADD Moves for Transitional Replicas**
 * **Validates: Requirements 3.2**
 *
 * *For any* partition that has a replica in `pending`, `creating`, or `syncing`
 * state on a target node, the Rebalancer SHALL NOT generate an ADD move for
 * that partition on that node.
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  EntityType,
  MoveType,
} from '../../src/rebalancer/unified-rebalancer.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {createTestRebalancer} from './test-helpers.js';

// Transitional workflow steps for ADD operations (used in replica_operations table)
const ADD_TRANSITIONAL_STEPS = ['pending', 'sending', 'creating', 'syncing'];

test('Property 3: No Duplicate ADD Moves for Transitional Replicas', async (t) => {
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
   * Property: For any partition with a replica in pending state on a node,
   * no ADD move should be generated for that node.
   */
  t.test('no ADD moves for nodes with pending replicas', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // partition_id
        fc.uuid(), // node_id with transitional replica
        fc.uuid(), // replica_id
        fc.uuid(), // operation_id
        fc.constantFrom(...ADD_TRANSITIONAL_STEPS),
        async (partitionId, nodeId, replicaId, operationId, workflowStep) => {
          // Create an in-flight operation in the cache
          const replicaOperations = [{
            operation_id: operationId,
            type: 'ADD',
            partition_id: partitionId,
            replica_id: replicaId,
            target_node_id: nodeId,
            status: workflowStep,
            workflow_step: workflowStep,
          }];

          const rebalancer = createTestRebalancer({
            entityId: partitionId,
            entityType: EntityType.PARTITION,
            nodeId: 'coordinator-node',
            cacheData: {
              nodes: [
                {node_id: nodeId, status: 'active'},
                {node_id: 'other-node', status: 'active'},
              ],
              services: [],
              partitions: [{partition_id: partitionId, table_id: 'table-1'}],
              replicaOperations,
            },
          });

          rebalancer.initialize();
          rebalancer.setLeader(true);

          // Calculate moves
          const currentReplicas = [];
          const targetState = {
            targetReplicaCount: 3,
            targetNodes: [nodeId, nodeId, 'other-node'],
          };

          const moves = rebalancer.calculateMoves(currentReplicas, targetState);

          // Clean up
          rebalancer.shutdown();

          // With in-flight operations, calculateMoves should return empty
          // (it waits for pending operations to complete)
          // This is the correct behavior per the implementation
          return moves.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('no ADD moves for nodes with pending replicas');
  });

  /**
   * Property: The system correctly tracks in-flight operations via cache.
   */
  t.test('cache correctly tracks in-flight operations', async (t) => {
    await fc.assert(
      fc.property(
        fc.uuid(), // partition_id
        fc.uuid(), // node_id
        fc.array(fc.uuid(), {minLength: 1, maxLength: 3}), // operation_ids
        fc.constantFrom(...ADD_TRANSITIONAL_STEPS),
        (partitionId, nodeId, operationIds, workflowStep) => {
          // Create in-flight operations in the cache
          const replicaOperations = operationIds.map((opId) => ({
            operation_id: opId,
            type: 'ADD',
            partition_id: partitionId,
            replica_id: `replica-${opId}`,
            target_node_id: nodeId,
            status: workflowStep,
            workflow_step: workflowStep,
          }));

          const rebalancer = createTestRebalancer({
            entityId: partitionId,
            entityType: EntityType.PARTITION,
            nodeId: 'test-node',
            cacheData: {
              nodes: [{node_id: nodeId, status: 'active'}],
              replicaOperations,
            },
          });

          // Query in-flight operations
          const inFlight = rebalancer.getInFlightOperations();

          // All operations should be in-flight (non-terminal status)
          const allInFlight = operationIds.every((opId) =>
            inFlight.some((op) => op.operation_id === opId));

          return allInFlight && inFlight.length === operationIds.length;
        },
      ),
      {numRuns: 10},
    );

    t.pass('cache correctly tracks in-flight operations');
  });

  /**
   * Property: ADD moves are allowed for nodes without in-flight operations.
   */
  t.test('ADD moves allowed for nodes without in-flight operations', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // partition_id
        fc.uuid(), // node_id with in-flight operation
        fc.uuid(), // clean_node_id without in-flight operation
        async (partitionId, busyNodeId, cleanNodeId) => {
          // Ensure nodes are different
          if (busyNodeId === cleanNodeId) {
            return true; // Skip this case
          }

          // No in-flight operations - rebalancer should generate moves
          const rebalancer = createTestRebalancer({
            entityId: partitionId,
            entityType: EntityType.PARTITION,
            nodeId: 'coordinator-node',
            cacheData: {
              nodes: [
                {node_id: busyNodeId, status: 'active'},
                {node_id: cleanNodeId, status: 'active'},
              ],
              services: [],
              partitions: [{partition_id: partitionId, table_id: 'table-1'}],
              replicaOperations: [], // No in-flight operations
            },
          });

          rebalancer.initialize();
          rebalancer.setLeader(true);

          // Calculate moves targeting the clean node
          const currentReplicas = [];
          const targetState = {
            targetReplicaCount: 1,
            targetNodes: [cleanNodeId],
          };

          const moves = rebalancer.calculateMoves(currentReplicas, targetState);

          // Clean up
          rebalancer.shutdown();

          // ADD moves should be generated for the clean node
          const addMovesForCleanNode = moves.filter((m) =>
            m.type === MoveType.ADD && m.nodeId === cleanNodeId);

          return addMovesForCleanNode.length > 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('ADD moves allowed for nodes without in-flight operations');
  });
});
