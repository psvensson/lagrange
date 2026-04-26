import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../../scenarios/three-node-seed-rebalance.js';

const ACTIVE_STATUS = 'active';
const PARTITION_SQL_FRAGMENT = 'service_type = \'partition\'';
const MESSAGE_GROUP_SQL_FRAGMENT = 'service_type = \'message_group\'';

describe('three-node-seed-rebalance scenario', () => {
  it('waits for partition rebalance after convergence before failing', async () => {
    const seedNodeId = 'seed-node';
    const joinerOneId = 'joiner-one';
    const joinerTwoId = 'joiner-two';
    let queryCount = 0;

    const seedNode = {
      id: seedNodeId,
      role: 'seed',
      query: async (sql) => {
        queryCount += 1;
        if (sql.includes(PARTITION_SQL_FRAGMENT) === false) {
          return {rows: []};
        }
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

  it('merges service placement rows across nodes when seed view is local-only',
    async () => {
      const seedNodeId = 'seed-node';
      const joinerOneId = 'joiner-one';
      const joinerTwoId = 'joiner-two';

      const seedNode = {
        id: seedNodeId,
        role: 'seed',
        query: async (sql) => {
          if (sql.includes(PARTITION_SQL_FRAGMENT) === false) {
            return {rows: []};
          }
          return {
            rows: [
              {
                partition_id: 'tables-p1',
                node_id: seedNodeId,
                status: ACTIVE_STATUS,
              },
            ],
          };
        },
      };
      const joinerOneNode = {
        id: joinerOneId,
        role: 'joiner',
        query: async (sql) => {
          if (sql.includes(PARTITION_SQL_FRAGMENT) === false) {
            return {rows: []};
          }
          return {
            rows: [
              {
                partition_id: 'tables-p1',
                node_id: joinerOneId,
                status: ACTIVE_STATUS,
              },
            ],
          };
        },
      };
      const joinerTwoNode = {
        id: joinerTwoId,
        role: 'joiner',
        query: async () => ({
          rows: [],
        }),
      };

      const cluster = {
        getNodes: () => [
          seedNode,
          joinerOneNode,
          joinerTwoNode,
        ],
        waitForConvergence: async () => ({settledAfterMs: 1}),
      };

      const result = await run(cluster, {
        rebalanceWaitTimeoutMs: 250,
        rebalancePollIntervalMs: 10,
      });

      assert.equal(result.rebalancedPartitionCount, 1);
      assert.equal(result.rebalanceQueryCount, 1);
      assert.ok(result.activePartitionReplicaRows >= 2);
    });

  it('accepts message-group rebalance evidence when partition rows remain seed-local',
    async () => {
      const seedNodeId = 'seed-node';
      const joinerOneId = 'joiner-one';
      const joinerTwoId = 'joiner-two';

      const seedNode = {
        id: seedNodeId,
        role: 'seed',
        query: async (sql) => {
          if (sql.includes(PARTITION_SQL_FRAGMENT)) {
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
          if (sql.includes(MESSAGE_GROUP_SQL_FRAGMENT)) {
            return {
              rows: [
                {
                  group_id: 'mg-1',
                  node_id: seedNodeId,
                  status: ACTIVE_STATUS,
                },
              ],
            };
          }
          return {rows: []};
        },
      };
      const joinerOneNode = {
        id: joinerOneId,
        role: 'joiner',
        query: async (sql) => {
          if (sql.includes(PARTITION_SQL_FRAGMENT)) {
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
          if (sql.includes(MESSAGE_GROUP_SQL_FRAGMENT)) {
            return {
              rows: [
                {
                  group_id: 'mg-1',
                  node_id: joinerOneId,
                  status: ACTIVE_STATUS,
                },
              ],
            };
          }
          return {rows: []};
        },
      };
      const joinerTwoNode = {
        id: joinerTwoId,
        role: 'joiner',
        query: async () => ({
          rows: [
            {},
          ],
        }),
      };

      const cluster = {
        getNodes: () => [
          seedNode,
          joinerOneNode,
          joinerTwoNode,
        ],
        waitForConvergence: async () => ({settledAfterMs: 1}),
      };

      const result = await run(cluster, {
        rebalanceWaitTimeoutMs: 250,
        rebalancePollIntervalMs: 10,
      });

      assert.equal(result.rebalancedPartitionCount, 0);
      assert.equal(result.rebalancedMessageGroupCount, 1);
      assert.equal(result.rebalanceQueryCount, 1);
      assert.ok(result.activeMessageGroupReplicaRows >= 2);
    });
});
