import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  run,
} from '../../scenarios/seven-node-read-write-load-transaction-recovery.js';

const SQL_INSERT_TRANSACTION = 'INSERT INTO sql_transactions';
const SQL_SELECT_TRANSACTION_STATUSES =
  'SELECT transaction_id, status FROM sql_transactions';
const LOAD_OPERATIONS = Object.freeze(['INSERT', 'SELECT', 'UPDATE', 'DELETE']);

describe('seven-node-read-write-load-transaction-recovery scenario', () => {
  it('replays seeded in-flight transaction rows to terminal states after restart',
    async () => {
      const calls = [];
      let convergenceCallCount = 0;
      let replayPollCount = 0;
      let restarted = false;
      let loadCancelled = false;
      const transactionStatusById = new Map();
      let activeTransactionId = null;
      let preparedTransactionId = null;

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        query: async (sql, params = []) => {
          if (sql.includes(SQL_INSERT_TRANSACTION)) {
            const [transactionId, _sessionId, status] = params;
            transactionStatusById.set(transactionId, status);
            if (status === 'ACTIVE') {
              activeTransactionId = transactionId;
            }
            if (status === 'PREPARED') {
              preparedTransactionId = transactionId;
            }
            return {rows: []};
          }

          if (sql.includes(SQL_SELECT_TRANSACTION_STATUSES)) {
            if (restarted) {
              replayPollCount += 1;
              if (replayPollCount >= 2 &&
                activeTransactionId &&
                preparedTransactionId) {
                transactionStatusById.set(activeTransactionId, 'ROLLED_BACK');
                transactionStatusById.set(preparedTransactionId, 'COMMITTED');
              }
            }
            const rows = params
              .map((transactionId) => {
                const status = transactionStatusById.get(transactionId);
                if (!status) {
                  return null;
                }
                return {
                  transaction_id: transactionId,
                  status,
                };
              })
              .filter(Boolean);
            return {rows};
          }

          return {rows: []};
        },
      };

      const cluster = {
        getNodes: () => [
          seedNode,
          {id: 'node-2', role: 'joiner'},
          {id: 'node-3', role: 'joiner'},
          {id: 'node-4', role: 'joiner'},
          {id: 'node-5', role: 'joiner'},
          {id: 'node-6', role: 'joiner'},
          {id: 'node-7', role: 'joiner'},
        ],
        waitForConvergence: async () => {
          calls.push('waitForConvergence');
          convergenceCallCount += 1;
          return {settledAfterMs: 1 + convergenceCallCount};
        },
        startLoad: (options) => {
          calls.push(['startLoad', options]);
          return {
            cancel: () => {
              loadCancelled = true;
            },
            waitComplete: async () => ({
              total: 120,
              success: 96,
              failed: 24,
            }),
          };
        },
        restartNode: async (nodeId) => {
          calls.push(['restartNode', nodeId]);
          restarted = true;
        },
        assertConsistency: async () => {
          calls.push('assertConsistency');
        },
      };

      const result = await run(cluster, {
        preRestartDelayMs: 0,
        transactionReplayPollIntervalMs: 1,
        transactionReplayTimeoutMs: 2000,
        minSuccessRate: 0.7,
      });

      assert.equal(result.seedNodeId, 'seed-1');
      assert.equal(loadCancelled, true);
      assert.ok(result.replayValidation.sampleCount >= 2);
      assert.equal(
        result.replayValidation.statuses[
          result.seededTransactions.activeTransactionId
        ],
        'ROLLED_BACK',
      );
      assert.equal(
        result.replayValidation.statuses[
          result.seededTransactions.preparedTransactionId
        ],
        'COMMITTED',
      );
      assert.ok(result.successRate >= 0.7);
      assert.deepEqual(calls[0], 'waitForConvergence');
      assert.equal(calls[1][0], 'startLoad');
      assert.deepEqual(
        calls[1][1].operations,
        LOAD_OPERATIONS,
        'scenario should run mixed load operations',
      );
      assert.deepEqual(calls[2], ['restartNode', 'seed-1']);
      assert.deepEqual(calls[3], 'waitForConvergence');
      assert.deepEqual(calls[4], 'assertConsistency');
    });
});
