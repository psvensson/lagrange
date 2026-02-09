/**
 * Bug Test: RebalanceCoordinator deduplication gap.
 *
 * The operationsInCreation in-memory guard is released in `finally` after
 * each createOperation call completes. When MoveExecutor calls
 * createOperation sequentially (await first, then second), the guard is
 * cleared before the second call starts. The database deduplication also
 * fails because the first INSERT goes through Raft (async replication)
 * and may not be visible in the SQL query yet when the second call checks.
 *
 * This test verifies that two sequential createOperation calls for the
 * same partition+node combination are properly deduplicated.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {createTestCoordinator} from './test-helpers.js';

test('Bug: coordinator dedup gap on sequential calls', async (t) => {
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

  t.test('sequential createOperation for same partition+node deduplicates',
    async (t) => {
      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
      });
      coordinator.initialize();

      try {
        const move = {
          type: 'ADD',
          partitionId: 'nodes-p1',
          nodeId: 'node-2',
          replicaId: 'replica-1',
        };

        // First call — should create the operation
        const first = await coordinator.createOperation(move);
        t.ok(first.operationId, 'first call creates an operation');

        // Second call — same partition+node, should be deduplicated
        const second = await coordinator.createOperation({
          ...move,
          replicaId: 'replica-2', // different replicaId, same partition+node
        });

        // The second call should return the SAME operation, not create a new one
        t.equal(second.operationId, first.operationId,
          'second call should return the existing operation, not create new');
        t.equal(coordinator.stats.operationsCreated, 1,
          'only one operation should have been created');
      } finally {
        await coordinator.shutdown();
      }
    });

  t.test('different partition+node combinations are not deduplicated',
    async (t) => {
      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
      });
      coordinator.initialize();

      try {
        const first = await coordinator.createOperation({
          type: 'ADD',
          partitionId: 'nodes-p1',
          nodeId: 'node-2',
          replicaId: 'replica-1',
        });

        const second = await coordinator.createOperation({
          type: 'ADD',
          partitionId: 'nodes-p1',
          nodeId: 'node-3', // different node
          replicaId: 'replica-2',
        });

        t.not(first.operationId, second.operationId,
          'different nodes should create separate operations');
        t.equal(coordinator.stats.operationsCreated, 2,
          'two operations should have been created');
      } finally {
        await coordinator.shutdown();
      }
    });

  t.test('REMOVE operations are deduplicated by replica intent, not only node',
    async (t) => {
      const coordinator = createTestCoordinator({
        nodeId: 'seed-node',
        enableTimeouts: false,
      });
      coordinator.initialize();

      try {
        const removeReplicaOne = await coordinator.createOperation({
          type: 'REMOVE',
          partitionId: 'nodes-p1',
          nodeId: 'seed-node',
          replicaId: 'nodes-p1-r1',
        });

        const removeReplicaOneDuplicate = await coordinator.createOperation({
          type: 'REMOVE',
          partitionId: 'nodes-p1',
          nodeId: 'seed-node',
          replicaId: 'nodes-p1-r1',
        });

        t.equal(
          removeReplicaOneDuplicate.operationId,
          removeReplicaOne.operationId,
          'same REMOVE intent should dedupe to existing operation',
        );

        const removeReplicaTwo = await coordinator.createOperation({
          type: 'REMOVE',
          partitionId: 'nodes-p1',
          nodeId: 'seed-node',
          replicaId: 'nodes-p1-r2',
        });

        t.not(
          removeReplicaTwo.operationId,
          removeReplicaOne.operationId,
          'different REMOVE replica intent should create distinct operation',
        );
      } finally {
        await coordinator.shutdown();
      }
    });
});
