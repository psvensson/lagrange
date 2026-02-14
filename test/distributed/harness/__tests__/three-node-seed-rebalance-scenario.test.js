import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../../scenarios/three-node-seed-rebalance.js';

const ACTIVE_STATUS = 'active';

describe('three-node-seed-rebalance scenario', () => {
  it('waits for partition rebalance after convergence before failing', async () => {
    const seedNodeId = 'seed-node';
    const joinerOneId = 'joiner-one';
    const joinerTwoId = 'joiner-two';
    let queryCount = 0;

    const seedNode = {
      id: seedNodeId,
      role: 'seed',
      query: async () => {
        queryCount += 1;
        if (queryCount === 1) {
          return {
            rows: [
              {
                partition_id: 'tables-p1',
                node_id: seedNodeId,
                status: ACTIVE_STATUS,
              },
            ],
          };
        }
        return {
          rows: [
            {
              partition_id: 'tables-p1',
              node_id: seedNodeId,
              status: ACTIVE_STATUS,
            },
            {
              partition_id: 'tables-p1',
              node_id: joinerOneId,
              status: ACTIVE_STATUS,
            },
          ],
        };
      },
    };

    const cluster = {
      getNodes: () => [
        seedNode,
        {id: joinerOneId, role: 'joiner'},
        {id: joinerTwoId, role: 'joiner'},
      ],
      waitForConvergence: async () => ({settledAfterMs: 1}),
    };

    const result = await run(cluster, {
      rebalanceWaitTimeoutMs: 250,
      rebalancePollIntervalMs: 10,
    });

    assert.equal(result.rebalancedPartitionCount, 1);
    assert.ok(queryCount >= 2);
  });
});
