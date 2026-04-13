/**
 * Property Test: No Duplicate REMOVE Moves for Removing Replicas
 * **Property 4: No Duplicate REMOVE Moves for Removing Replicas**
 * **Validates: Requirements 3.3**
 *
 * *For any* replica that is already in `removing` state, the Rebalancer
 * SHALL NOT generate a REMOVE move for that replica.
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {
  EntityType,
  MoveType,
  ReplicaStatus,
} from '../../src/rebalancer/unified-rebalancer.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {createTestRebalancer} from './test-helpers.js';

// Transitional workflow steps for REMOVE operations (used in replica_operations table)
const REMOVE_TRANSITIONAL_STEPS = ['pending', 'sending', 'stopping'];

test('Property 4: No Duplicate REMOVE Moves for Removing Replicas', async (t) => {
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
   * Property: For any replica in removing state, no REMOVE move should
   * be generated for that replica.
   */
  t.test('no REMOVE moves for replicas in removing state', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // partition_id
        fc.uuid(), // node_id
        fc.uuid(), // replica_id
        fc.uuid(), // operation_id
        fc.constantFrom(...REMOVE_TRANSITIONAL_STEPS),
        async (partitionId, nodeId, replicaId, operationId, workflowStep) => {
          // Create an in-flight REMOVE operation in the cache
          const replicaOperations = [{
            operation_id: operationId,
            type: 'REMOVE',
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
              nodes: [{node_id: nodeId, status: 'active'}],
              services: [
                {
                  service_id: replicaId,
                  partition_id: partitionId,
                  node_id: nodeId,
                  service_type: 'partition',
                  status: ReplicaStatus.ACTIVE,
                },
              ],
              partitions: [{partition_id: partitionId, table_id: 'table-1'}],
              replicaOperations,
            },
          });

          rebalancer.initialize();
          rebalancer.setLeader(true);

          // Calculate moves - target state wants no replicas
          const currentReplicas = [
            {
              service_id: replicaId,
              replica_id: replicaId,
              node_id: nodeId,
              status: ReplicaStatus.ACTIVE,
            },
          ];
          const targetState = {
            targetReplicaCount: 0,
            targetNodes: [],
          };

          const moves = rebalancer.calculateMoves(currentReplicas, targetState);

          // Clean up
          rebalancer.shutdown();

          // With in-flight operations, calculateMoves should return empty
          // (it waits for pending operations to complete)
          return moves.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('no REMOVE moves for replicas in removing state');
  });

  /**
   * Property: The system correctly tracks in-flight REMOVE operations via cache.
   */
  t.test('cache correctly tracks in-flight REMOVE operations', async (t) => {
    await fc.assert(
      fc.property(
        fc.uuid(), // partition_id
        fc.uuid(), // node_id
        fc.array(fc.uuid(), {minLength: 1, maxLength: 3}), // operation_ids
        fc.constantFrom(...REMOVE_TRANSITIONAL_STEPS),
        (partitionId, nodeId, operationIds, workflowStep) => {
          // Create in-flight REMOVE operations in the cache
          const replicaOperations = operationIds.map((opId) => ({
            operation_id: opId,
            type: 'REMOVE',
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

    t.pass('cache correctly tracks in-flight REMOVE operations');
  });

  /**
   * Property: REMOVE moves are allowed for active replicas without
   * in-flight operations.
   */
  t.test('REMOVE moves allowed for active replicas without in-flight ops', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // partition_id
        fc.uuid(), // node_id
        fc.uuid(), // active_replica_id
        async (partitionId, nodeId, activeReplicaId) => {
          // No in-flight operations - rebalancer should generate REMOVE moves
          const rebalancer = createTestRebalancer({
            entityId: partitionId,
            entityType: EntityType.PARTITION,
            nodeId: 'coordinator-node',
            cacheData: {
              nodes: [{node_id: nodeId, status: 'active'}],
              services: [
                {
                  service_id: activeReplicaId,
                  partition_id: partitionId,
                  node_id: nodeId,
                  service_type: 'partition',
                  status: ReplicaStatus.ACTIVE,
                },
              ],
              partitions: [{partition_id: partitionId, table_id: 'table-1'}],
              replicaOperations: [], // No in-flight operations
            },
          });

          rebalancer.initialize();
          rebalancer.setLeader(true);

          // Calculate moves - target state wants no replicas
          const currentReplicas = [
            {
              service_id: activeReplicaId,
              replica_id: activeReplicaId,
              node_id: nodeId,
              status: ReplicaStatus.ACTIVE,
            },
          ];
          const targetState = {
            targetReplicaCount: 0,
            targetNodes: [],
          };

          const moves = rebalancer.calculateMoves(currentReplicas, targetState);

          // Clean up
          rebalancer.shutdown();

          // REMOVE moves should be generated for active replica
          const removeMovesForActive = moves.filter((m) =>
            m.type === MoveType.REMOVE && m.replicaId === activeReplicaId);

          return removeMovesForActive.length > 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('REMOVE moves allowed for active replicas without in-flight ops');
  });

  /**
   * Property: Completed REMOVE operations (terminal status) don't block new moves.
   */
  t.test('completed REMOVE operations do not block new moves', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // partition_id
        fc.uuid(), // node_id
        fc.uuid(), // replica_id
        fc.uuid(), // operation_id
        fc.constantFrom('removed', 'failed'), // terminal statuses
        async (partitionId, nodeId, replicaId, operationId, terminalStatus) => {
          // Create a completed REMOVE operation in the cache
          const replicaOperations = [{
            operation_id: operationId,
            type: 'REMOVE',
            partition_id: partitionId,
            replica_id: replicaId,
            target_node_id: nodeId,
            status: terminalStatus,
            workflow_step: terminalStatus,
          }];

          const rebalancer = createTestRebalancer({
            entityId: partitionId,
            entityType: EntityType.PARTITION,
            nodeId: 'coordinator-node',
            cacheData: {
              nodes: [{node_id: nodeId, status: 'active'}],
              services: [
                {
                  service_id: replicaId,
                  partition_id: partitionId,
                  node_id: nodeId,
                  service_type: 'partition',
                  status: ReplicaStatus.ACTIVE,
                },
              ],
              partitions: [{partition_id: partitionId, table_id: 'table-1'}],
              replicaOperations,
            },
          });

          rebalancer.initialize();
          rebalancer.setLeader(true);

          // Query in-flight operations - terminal ones should not be included
          const inFlight = rebalancer.getInFlightOperations();

          // Clean up
          rebalancer.shutdown();

          // Terminal operations should not be in-flight
          return inFlight.length === 0;
        },
      ),
      {numRuns: 10},
    );

    t.pass('completed REMOVE operations do not block new moves');
  });
});
