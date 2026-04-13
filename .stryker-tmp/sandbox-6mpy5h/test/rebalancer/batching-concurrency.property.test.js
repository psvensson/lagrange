/**
 * Property Test: Batch Concurrency Bound (Property 5)
 *
 * For any set of moves, the number of concurrent executions per node SHALL
 * NOT exceed the configured batch size.
 *
 * Validates: Requirements 7.2, 7.3
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {MoveType} from '../../src/rebalancer/unified-rebalancer.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {createTestRebalancer} from './test-helpers.js';

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

test('Property 5: Batch Concurrency Bound', async (t) => {
  await t.test('per-node concurrency never exceeds batch size', async (t) => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({min: 1, max: 4}),
        fc.array(fc.integer({min: 1, max: 6}), {minLength: 1, maxLength: 4}),
        async (batchSize, movesPerNode) => {
          initializeTestEnvironment();

          const moves = [];
          movesPerNode.forEach((count, index) => {
            const nodeId = `node-${index}`;
            for (let i = 0; i < count; i++) {
              moves.push({
                type: MoveType.ADD,
                nodeId,
                reason: 'test',
              });
            }
          });

          const rebalancer = createTestRebalancer({
            entityId: 'partition-1',
            nodeId: 'node-0',
          });
          rebalancer.moveBatchSize = batchSize;
          rebalancer.interBatchDelayMs = 0;
          rebalancer.isNodeReady = async () => true;

          const inFlightByNode = new Map();
          const maxInFlightByNode = new Map();
          rebalancer.executeMove = async (move) => {
            const nodeId = move.nodeId;
            const current = (inFlightByNode.get(nodeId) || 0) + 1;
            inFlightByNode.set(nodeId, current);
            const max = Math.max(maxInFlightByNode.get(nodeId) || 0, current);
            maxInFlightByNode.set(nodeId, max);

            await Promise.resolve();

            const remaining = Math.max(0, (inFlightByNode.get(nodeId) || 0) - 1);
            inFlightByNode.set(nodeId, remaining);
            return {success: true, move};
          };

          await rebalancer.executeRebalancingMoves(moves);
          rebalancer.shutdown();

          return Array.from(maxInFlightByNode.values())
            .every((max) => max <= batchSize);
        },
      ),
      {numRuns: 10},
    );

    t.pass('Per-node concurrency stays within batch size');
  });
});
