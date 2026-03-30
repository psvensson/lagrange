import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  run,
} from '../../scenarios/seven-node-read-write-load-transaction-recovery.js';

const SQL_INSERT_TRANSACTION = 'INSERT INTO sql_transactions';
const SQL_CONTROL_SNAPSHOT = 'SELECT * FROM control_snapshot_local()';
const SQL_SELECT_TRANSACTION_STATUSES =
  'SELECT transaction_id, status FROM sql_transactions';
const SQL_FROM_TABLES = 'FROM tables';
const SQL_CREATE_TABLE_IF_NOT_EXISTS = 'CREATE TABLE IF NOT EXISTS';
const SQL_UPDATE_TABLE_POLICIES = 'UPDATE tables SET table_policies';
const SQL_FROM_PARTITIONS = 'FROM partitions';
const SQL_FROM_SERVICES = 'FROM services';
const LOAD_OPERATIONS = Object.freeze(['INSERT', 'SELECT', 'UPDATE', 'DELETE']);
const TABLE_POLICIES_JSON = JSON.stringify({
  splitStorageThreshold: 16384,
  splitTrafficThreshold: 120,
  mergeStorageThreshold: 1,
  mergeTrafficThreshold: 1,
});
const RECOVERY_READY_PARTITIONS = Object.freeze([
  'nodes-p1',
  'services-p1',
  'replica_operations-p1',
  'sql_transactions-p1',
  'sql_transaction_participants-p1',
  'sql_write_operations-p1',
]);

describe('seven-node-read-write-load-transaction-recovery scenario', () => {
  it('replays seeded in-flight transaction rows to terminal states after restart',
    async () => {
      const calls = [];
      const controlSnapshotCalls = [];
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
        getControlSnapshot: async (options = {}) => {
          controlSnapshotCalls.push(options);
          return {
            rows: [{
              cluster: {
                nodeCount: 7,
                activeNodeCount: 7,
              },
              controlPlaneDiagnostics: {
                startupRecovery: {
                  controlPlaneRecoveryReady: true,
                  recoveryStage: 'traffic_ready',
                },
              },
              partitions: RECOVERY_READY_PARTITIONS,
              queryEngine: restarted ?
                {
                  transactionRecovery: {
                    totalRecovered: 2,
                    resumed: 2,
                    failed: 0,
                  },
                } :
                {
                  transactionRecovery: null,
                },
            }],
          };
        },
        query: async (sql, params = []) => {
          if (sql.includes(SQL_CREATE_TABLE_IF_NOT_EXISTS)) {
            return {rows: []};
          }
          if (sql.includes(SQL_UPDATE_TABLE_POLICIES)) {
            return {rows: []};
          }
          if (sql.includes(SQL_FROM_TABLES)) {
            return {
              rows: [{
                table_id: 'tbl-benchmark-events-1',
                table_policies: TABLE_POLICIES_JSON,
              }],
            };
          }
          if (sql.includes(SQL_FROM_PARTITIONS)) {
            return {rows: [{partition_id: 'bench-p1'}, {partition_id: 'bench-p2'}]};
          }
          if (sql.includes(SQL_FROM_SERVICES)) {
            return {
              rows: [
                {partition_id: 'bench-p1', node_id: 'seed-1', status: 'active'},
                {partition_id: 'bench-p1', node_id: 'node-2', status: 'active'},
                {partition_id: 'bench-p1', node_id: 'node-3', status: 'active'},
                {partition_id: 'bench-p2', node_id: 'node-4', status: 'active'},
                {partition_id: 'bench-p2', node_id: 'node-5', status: 'active'},
                {partition_id: 'bench-p2', node_id: 'node-6', status: 'active'},
              ],
            };
          }
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
          if (sql.includes(SQL_CONTROL_SNAPSHOT)) {
            return {
              rows: [{
                cluster: {
                  nodeCount: 7,
                  activeNodeCount: 7,
                },
                controlPlaneDiagnostics: {
                  startupRecovery: {
                    controlPlaneRecoveryReady: true,
                    recoveryStage: 'traffic_ready',
                  },
                },
                partitions: RECOVERY_READY_PARTITIONS,
                queryEngine: restarted ?
                  {
                    transactionRecovery: {
                      totalRecovered: 2,
                      resumed: 2,
                      failed: 0,
                    },
                  } :
                  {
                    transactionRecovery: null,
                  },
              }],
            };
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
        waitForControlPlaneQuiescence: async () => {
          calls.push('waitForControlPlaneQuiescence');
        },
        resolveBenchmarkReadyLoadNodes: async () => {
          return [
            seedNode,
            {id: 'node-2', role: 'joiner'},
            {id: 'node-3', role: 'joiner'},
            {id: 'node-4', role: 'joiner'},
            {id: 'node-5', role: 'joiner'},
            {id: 'node-6', role: 'joiner'},
          ];
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
        waitForConsistencyConvergence: async () => {
          calls.push('waitForConsistencyConvergence');
        },
      };

      const result = await run(cluster, {
        preRestartDelayMs: 0,
        transactionReplayPollIntervalMs: 1,
        transactionReplayTimeoutMs: 2000,
        distributionPollIntervalMs: 1,
        distributionTimeoutMs: 2000,
        minAdditionalPartitions: 0,
        minDistinctReplicaNodes: 6,
        minSuccessRate: 0.7,
      });

      assert.equal(result.seedNodeId, 'seed-1');
      assert.equal(loadCancelled, true);
      assert.equal(
        result.recoveryReadiness.summary.recoveryStage,
        'traffic_ready',
      );
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
      assert.ok(
        controlSnapshotCalls.length >= 1,
        'scenario should request at least one recovery control snapshot',
      );
      assert.notEqual(
        controlSnapshotCalls[0].forceRepair,
        true,
        'scenario should observe local recovery state without forcing authoritative control snapshot repair',
      );
      assert.equal(
        controlSnapshotCalls[0].timeoutMs,
        30000,
        'scenario should use the scenario control timeout for local recovery snapshots',
      );
      assert.ok(result.successRate >= 0.7);
      assert.deepEqual(calls[0], 'waitForConvergence');
      assert.deepEqual(calls[1], 'waitForControlPlaneQuiescence');
      assert.equal(calls[2][0], 'startLoad');
      assert.deepEqual(
        calls[2][1].nodes.map((node) => node.id),
        ['seed-1', 'node-2', 'node-3', 'node-4', 'node-5', 'node-6'],
        'scenario should start load on the current table-local replica set',
      );
      assert.equal(typeof calls[2][1].nodeResolver, 'function');
      assert.equal(
        calls[2][1].adaptiveDispatchGuardrail?.enabled,
        true,
        'scenario should enable adaptive dispatch pacing for partitioning load',
      );
      assert.deepEqual(
        calls[2][1].operations,
        LOAD_OPERATIONS,
        'scenario should run mixed load operations',
      );
      assert.equal(
        calls[2][1].opsPerSec,
        60,
        'scenario should scale recovery load to the current table-local replica set',
      );
      assert.equal(
        calls[2][1].tableName,
        'benchmark_events',
        'scenario should default to benchmark load table',
      );
      assert.equal(
        calls[2][1].workloadProfile,
        'benchmark_events_mixed',
        'scenario should use benchmark workload profile',
      );
      assert.deepEqual(calls[3], 'waitForControlPlaneQuiescence');
      assert.deepEqual(calls[4], ['restartNode', 'seed-1']);
      assert.deepEqual(calls[5], 'waitForConvergence');
      assert.deepEqual(calls[6], 'waitForControlPlaneQuiescence');
      assert.deepEqual(calls[7], 'waitForConsistencyConvergence');
    });

  it('retries transient replay-status query failures after restart',
    async () => {
      const controlSnapshotCalls = [];
      let replayPollCount = 0;
      let replayQueryFailureCount = 0;
      let restarted = false;
      const transactionStatusById = new Map();
      let activeTransactionId = null;
      let preparedTransactionId = null;

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        getControlSnapshot: async (options = {}) => {
          controlSnapshotCalls.push(options);
          return {
            rows: [{
              cluster: {
                nodeCount: 7,
                activeNodeCount: 7,
              },
              partitions: RECOVERY_READY_PARTITIONS,
              queryEngine: restarted ?
                {
                  transactionRecovery: {
                    totalRecovered: 2,
                    resumed: 2,
                    failed: 0,
                  },
                } :
                {
                  transactionRecovery: null,
                },
            }],
          };
        },
        query: async (sql, params = []) => {
          if (sql.includes(SQL_CREATE_TABLE_IF_NOT_EXISTS)) {
            return {rows: []};
          }
          if (sql.includes(SQL_UPDATE_TABLE_POLICIES)) {
            return {rows: []};
          }
          if (sql.includes(SQL_FROM_TABLES)) {
            return {
              rows: [{
                table_id: 'tbl-benchmark-events-1',
                table_policies: TABLE_POLICIES_JSON,
              }],
            };
          }
          if (sql.includes(SQL_FROM_PARTITIONS)) {
            return {rows: [{partition_id: 'bench-p1'}, {partition_id: 'bench-p2'}]};
          }
          if (sql.includes(SQL_FROM_SERVICES)) {
            return {
              rows: [
                {partition_id: 'bench-p1', node_id: 'seed-1', status: 'active'},
                {partition_id: 'bench-p1', node_id: 'node-2', status: 'active'},
                {partition_id: 'bench-p1', node_id: 'node-3', status: 'active'},
                {partition_id: 'bench-p2', node_id: 'node-4', status: 'active'},
                {partition_id: 'bench-p2', node_id: 'node-5', status: 'active'},
                {partition_id: 'bench-p2', node_id: 'node-6', status: 'active'},
              ],
            };
          }
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
              if (replayPollCount === 1) {
                replayQueryFailureCount += 1;
                throw new Error(
                  'Admin API query failed for node seed-1 on lane default: ' +
                  'connect ECONNREFUSED 172.19.0.2:8081',
                );
              }
              if (replayPollCount >= 3 &&
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
          if (sql.includes(SQL_CONTROL_SNAPSHOT)) {
            return {
              rows: [{
                cluster: {
                  nodeCount: 7,
                  activeNodeCount: 7,
                },
                partitions: RECOVERY_READY_PARTITIONS,
                queryEngine: restarted ?
                  {
                    transactionRecovery: {
                      totalRecovered: 2,
                      resumed: 2,
                      failed: 0,
                    },
                  } :
                  {
                    transactionRecovery: null,
                  },
              }],
            };
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
        waitForConvergence: async () => ({settledAfterMs: 1}),
        startLoad: () => ({
          cancel: () => {},
          waitComplete: async () => ({
            total: 120,
            success: 120,
            failed: 0,
          }),
        }),
        restartNode: async () => {
          restarted = true;
        },
        assertConsistency: async () => {},
        waitForConsistencyConvergence: async () => {},
      };

      const result = await run(cluster, {
        preRestartDelayMs: 0,
        transactionReplayPollIntervalMs: 1,
        transactionReplayTimeoutMs: 2000,
        distributionPollIntervalMs: 1,
        distributionTimeoutMs: 2000,
        minAdditionalPartitions: 0,
        minDistinctReplicaNodes: 6,
      });

      assert.equal(replayQueryFailureCount, 1);
      assert.ok(
        controlSnapshotCalls.length >= 1,
        'scenario should query local recovery snapshots before replay validation',
      );
      assert.notEqual(controlSnapshotCalls[0].forceRepair, true);
      assert.ok(result.replayValidation.sampleCount >= 2);
      assert.equal(result.replayValidation.transientQueryErrors, 1);
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
    });

  it('retries transient local recovery snapshot failures after restart',
    async () => {
      let replayPollCount = 0;
      let restarted = false;
      let recoverySnapshotAttemptCount = 0;
      const transactionStatusById = new Map();
      let activeTransactionId = null;
      let preparedTransactionId = null;

      const seedNode = {
        id: 'seed-1',
        role: 'seed',
        getControlSnapshot: async (options = {}) => {
          recoverySnapshotAttemptCount += 1;
          if (restarted && recoverySnapshotAttemptCount < 3) {
            throw new Error(
              'Admin API query failed for node seed-1 on lane snapshot: ' +
              'connect ECONNREFUSED 172.19.0.2:8081',
            );
          }
          return {
            rows: [{
              cluster: {
                nodeCount: 7,
                activeNodeCount: 7,
              },
              partitions: RECOVERY_READY_PARTITIONS,
              queryEngine: restarted ?
                {
                  transactionRecovery: {
                    totalRecovered: 2,
                    resumed: 2,
                    failed: 0,
                  },
                } :
                {
                  transactionRecovery: null,
                },
            }],
          };
        },
        query: async (sql, params = []) => {
          if (sql.includes(SQL_CREATE_TABLE_IF_NOT_EXISTS)) {
            return {rows: []};
          }
          if (sql.includes(SQL_UPDATE_TABLE_POLICIES)) {
            return {rows: []};
          }
          if (sql.includes(SQL_FROM_TABLES)) {
            return {
              rows: [{
                table_id: 'tbl-benchmark-events-1',
                table_policies: TABLE_POLICIES_JSON,
              }],
            };
          }
          if (sql.includes(SQL_FROM_PARTITIONS)) {
            return {rows: [{partition_id: 'bench-p1'}, {partition_id: 'bench-p2'}]};
          }
          if (sql.includes(SQL_FROM_SERVICES)) {
            return {
              rows: [
                {partition_id: 'bench-p1', node_id: 'seed-1', status: 'active'},
                {partition_id: 'bench-p1', node_id: 'node-2', status: 'active'},
                {partition_id: 'bench-p1', node_id: 'node-3', status: 'active'},
                {partition_id: 'bench-p2', node_id: 'node-4', status: 'active'},
                {partition_id: 'bench-p2', node_id: 'node-5', status: 'active'},
                {partition_id: 'bench-p2', node_id: 'node-6', status: 'active'},
              ],
            };
          }
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
          if (sql.includes(SQL_CONTROL_SNAPSHOT)) {
            return {
              rows: [{
                cluster: {
                  nodeCount: 7,
                  activeNodeCount: 7,
                },
                partitions: RECOVERY_READY_PARTITIONS,
                queryEngine: restarted ?
                  {
                    transactionRecovery: {
                      totalRecovered: 2,
                      resumed: 2,
                      failed: 0,
                    },
                  } :
                  {
                    transactionRecovery: null,
                  },
              }],
            };
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
        waitForConvergence: async () => ({settledAfterMs: 1}),
        startLoad: () => ({
          cancel: () => {},
          waitComplete: async () => ({
            total: 120,
            success: 120,
            failed: 0,
          }),
        }),
        restartNode: async () => {
          restarted = true;
        },
        assertConsistency: async () => {},
        waitForConsistencyConvergence: async () => {},
      };

      const result = await run(cluster, {
        preRestartDelayMs: 0,
        transactionReplayPollIntervalMs: 1,
        transactionReplayTimeoutMs: 2000,
        distributionPollIntervalMs: 1,
        distributionTimeoutMs: 2000,
        minAdditionalPartitions: 0,
        minDistinctReplicaNodes: 6,
      });

      assert.ok(
        recoverySnapshotAttemptCount >= 3,
        'scenario should retry local recovery snapshots while the restarted admin endpoint is still reconnecting',
      );
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
    });
});
