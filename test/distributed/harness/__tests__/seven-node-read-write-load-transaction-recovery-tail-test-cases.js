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
const FAST_RECOVERY_PROBE_TIMEOUT_MS = 5000;
const LOAD_OPERATIONS = Object.freeze(['INSERT', 'SELECT']);
const TABLE_POLICIES_JSON = JSON.stringify({
  externalCdcAllowed: false,
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

export function registerSevenNodeTransactionRecoveryTailTests({
  it,
}) {
    it('queries replay transaction statuses across nodes in parallel',
      async () => {
        let restarted = false;
        const transactionStatusById = new Map();
        let activeTransactionId = null;
        let preparedTransactionId = null;
        const slowDelayMs = 60;

        const delay = (ms) => new Promise((resolve) => {
          setTimeout(resolve, ms);
        });

        const seedNode = {
          id: 'seed-1',
          role: 'seed',
          getControlSnapshot: async () => {
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
              await delay(slowDelayMs);
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

        const slowJoiner = {
          id: 'node-2',
          role: 'joiner',
          query: async (sql, params = []) => {
            if (!sql.includes(SQL_SELECT_TRANSACTION_STATUSES)) {
              return {rows: []};
            }
            await delay(slowDelayMs);
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
          },
        };

        const fastJoiner = {
          id: 'node-3',
          role: 'joiner',
          query: async (sql, params = []) => {
            if (!sql.includes(SQL_SELECT_TRANSACTION_STATUSES)) {
              return {rows: []};
            }
            if (restarted && activeTransactionId && preparedTransactionId) {
              transactionStatusById.set(activeTransactionId, 'ROLLED_BACK');
              transactionStatusById.set(preparedTransactionId, 'COMMITTED');
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
          },
        };

        const cluster = {
          getNodes: () => [
            seedNode,
            slowJoiner,
            fastJoiner,
            {id: 'node-4', role: 'joiner'},
            {id: 'node-5', role: 'joiner'},
            {id: 'node-6', role: 'joiner'},
            {id: 'node-7', role: 'joiner'},
          ],
          waitForConvergence: async () => ({settledAfterMs: 1}),
          waitForControlPlaneQuiescence: async () => {},
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
          waitForConsistencyConvergence: async () => {},
        };

        const result = await run(cluster, {
          preRestartDelayMs: 0,
          transactionReplayPollIntervalMs: 1,
          transactionReplayTimeoutMs: 100,
          distributionPollIntervalMs: 1,
          distributionTimeoutMs: 2000,
          minAdditionalPartitions: 0,
          minDistinctReplicaNodes: 6,
        });

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

    it('fails replay validation early when terminal transaction states make no progress',
      async () => {
        let restarted = false;
        let loadCancelled = false;
        const transactionStatusById = new Map();
        let activeTransactionId = null;
        let preparedTransactionId = null;

        const seedNode = {
          id: 'seed-1',
          role: 'seed',
          getControlSnapshot: async () => {
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
            if (sql.includes(SQL_CREATE_TABLE_IF_NOT_EXISTS) ||
                sql.includes(SQL_UPDATE_TABLE_POLICIES)) {
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
          waitForConvergence: async () => ({settledAfterMs: 1}),
          waitForControlPlaneQuiescence: async () => null,
          resolveBenchmarkReadyLoadNodes: async () => [
            seedNode,
            {id: 'node-2', role: 'joiner'},
            {id: 'node-3', role: 'joiner'},
            {id: 'node-4', role: 'joiner'},
            {id: 'node-5', role: 'joiner'},
            {id: 'node-6', role: 'joiner'},
          ],
          startLoad: () => {
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
          restartNode: async () => {
            restarted = true;
          },
          assertConsistency: async () => {},
          waitForConsistencyConvergence: async () => {},
        };

        await assert.rejects(
          run(cluster, {
            preRestartDelayMs: 0,
            transactionReplayPollIntervalMs: 1,
            transactionReplayTimeoutMs: 60000,
            transactionReplayNoProgressTimeoutMs: 60000,
            replayReadyNoProgressTimeoutMs: 25,
            recoveryReadinessNoProgressTimeoutMs: 25,
            replayProbeTimeoutMs: 5,
            distributionPollIntervalMs: 1,
            distributionTimeoutMs: 2000,
            minAdditionalPartitions: 0,
            minDistinctReplicaNodes: 6,
            minSuccessRate: 0.7,
          }),
          /stalled after recovery became ready/i,
        );
        assert.equal(loadCancelled, true);
        assert.ok(activeTransactionId);
        assert.ok(preparedTransactionId);
      });

    it('fails the partition-growth load phase early when load pressure stalls',
      async () => {
        let loadCancelled = false;
        let loadMetricSampleCount = 0;

        const seedNode = {
          id: 'seed-1',
          role: 'seed',
          query: async (sql) => {
            if (sql.includes(SQL_CREATE_TABLE_IF_NOT_EXISTS) ||
                sql.includes(SQL_UPDATE_TABLE_POLICIES)) {
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
          waitForControlPlaneQuiescence: async () => null,
          resolveBenchmarkReadyLoadNodes: async () => [
            seedNode,
            {id: 'node-2', role: 'joiner'},
            {id: 'node-3', role: 'joiner'},
            {id: 'node-4', role: 'joiner'},
            {id: 'node-5', role: 'joiner'},
            {id: 'node-6', role: 'joiner'},
          ],
          startLoad: () => ({
            getMetrics: () => {
              loadMetricSampleCount += 1;
              return {
                total: 0,
                success: 0,
                failed: 0,
                dispatchedOperations: 50 + loadMetricSampleCount,
                targetOperations: 600,
                rejectedOperations: 0,
                nonAdmissionTimeoutWaits: 5 * loadMetricSampleCount,
                opsPerSec: 0,
                waitReasons: {
                  nodeSlotUnavailable: 20 * loadMetricSampleCount,
                  timeoutWaits: 5 * loadMetricSampleCount,
                  retryableControlPlanePressure: 4 * loadMetricSampleCount,
                },
                perNode: {
                  'node-2': {
                    waitReasons: {
                      nodeSlotUnavailable: 12 * loadMetricSampleCount,
                      timeoutWaits: 3 * loadMetricSampleCount,
                      retryableControlPlanePressure: 2 * loadMetricSampleCount,
                    },
                  },
                  'node-3': {
                    waitReasons: {
                      nodeSlotUnavailable: 8 * loadMetricSampleCount,
                      timeoutWaits: 2 * loadMetricSampleCount,
                      retryableControlPlanePressure: loadMetricSampleCount,
                    },
                  },
                },
              };
            },
            cancel: () => {
              loadCancelled = true;
            },
            waitComplete: async () => ({
              total: 0,
              success: 0,
              failed: 0,
            }),
          }),
        };

        await assert.rejects(
          run(cluster, {
            preRestartDelayMs: 0,
            distributionPollIntervalMs: 1,
            distributionTimeoutMs: 5000,
            loadPhasePollIntervalMs: 1,
            loadPhaseNoProgressTimeoutMs: 15,
            minAdditionalPartitions: 1,
            minDistinctReplicaNodes: 6,
          }),
          (error) => {
            assert.match(
              String(error?.message || error),
              /Load phase stalled with no successful progress while waiting for partition growth/i,
            );
            assert.match(
              String(error?.message || error),
              /nodeSlotUnavailable=/i,
            );
            assert.match(
              String(error?.message || error),
              /topPressureNodes=/i,
            );
            return true;
          },
        );
        assert.equal(loadCancelled, true);
        assert.ok(loadMetricSampleCount >= 2);
      });

    it('fails early when seeded transaction rows stay invisible after restart',
      async () => {
        let restarted = false;
        let loadCancelled = false;
        const transactionStatusById = new Map();
        let activeTransactionId = null;
        let preparedTransactionId = null;

        const seedNode = {
          id: 'seed-1',
          role: 'seed',
          getControlSnapshot: async () => {
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
            if (sql.includes(SQL_CREATE_TABLE_IF_NOT_EXISTS) ||
                sql.includes(SQL_UPDATE_TABLE_POLICIES)) {
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
                return {rows: []};
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
          waitForConvergence: async () => ({settledAfterMs: 1}),
          waitForControlPlaneQuiescence: async () => null,
          resolveBenchmarkReadyLoadNodes: async () => [
            seedNode,
            {id: 'node-2', role: 'joiner'},
            {id: 'node-3', role: 'joiner'},
            {id: 'node-4', role: 'joiner'},
            {id: 'node-5', role: 'joiner'},
            {id: 'node-6', role: 'joiner'},
          ],
          startLoad: () => ({
            cancel: () => {
              loadCancelled = true;
            },
            waitComplete: async () => ({
              total: 120,
              success: 96,
              failed: 24,
            }),
          }),
          restartNode: async () => {
            restarted = true;
          },
          waitForConsistencyConvergence: async () => {},
        };

        await assert.rejects(
          run(cluster, {
            preRestartDelayMs: 0,
            transactionReplayPollIntervalMs: 1,
            transactionReplayTimeoutMs: 60000,
            postRestartSeededVisibilityNoProgressTimeoutMs: 1000,
            replayProbeTimeoutMs: 5,
            distributionPollIntervalMs: 1,
            distributionTimeoutMs: 2000,
            minAdditionalPartitions: 0,
            minDistinctReplicaNodes: 6,
            minSuccessRate: 0.7,
          }),
          /Seeded transaction visibility stalled with no progress after restart/i,
        );
        assert.equal(loadCancelled, true);
        assert.ok(activeTransactionId);
        assert.ok(preparedTransactionId);
      });

    it('fails replay validation early when recovery remains not ready after fallback',
      async () => {
        let restarted = false;
        let loadCancelled = false;
        let postRestartVisibilityObserved = false;
        const transactionStatusById = new Map();
        let activeTransactionId = null;
        let preparedTransactionId = null;

        const seedNode = {
          id: 'seed-1',
          role: 'seed',
          getControlSnapshot: async () => {
            if (restarted && !postRestartVisibilityObserved) {
              throw new Error(
                'Admin API query timed out for node seed-1 on lane snapshot after 30000ms',
              );
            }
            return {
              rows: [{
                cluster: {
                  nodeCount: 7,
                  activeNodeCount: 7,
                },
                controlPlaneDiagnostics: {
                  startupRecovery: {
                    controlPlaneRecoveryReady: true,
                    recoveryStage: 'control_plane_recovery_ready',
                  },
                },
                partitions: restarted ?
                  RECOVERY_READY_PARTITIONS.filter((partitionId) =>
                    partitionId !== 'sql_transactions-p1',
                  ) :
                  RECOVERY_READY_PARTITIONS,
                queryEngine: restarted ?
                  {
                    transactionRecovery: {
                      totalRecovered: 0,
                      resumed: 0,
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
            if (sql.includes(SQL_CREATE_TABLE_IF_NOT_EXISTS) ||
                sql.includes(SQL_UPDATE_TABLE_POLICIES)) {
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
                postRestartVisibilityObserved = true;
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
              return seedNode.getControlSnapshot();
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
          waitForControlPlaneQuiescence: async () => null,
          resolveBenchmarkReadyLoadNodes: async () => [
            seedNode,
            {id: 'node-2', role: 'joiner'},
            {id: 'node-3', role: 'joiner'},
            {id: 'node-4', role: 'joiner'},
            {id: 'node-5', role: 'joiner'},
            {id: 'node-6', role: 'joiner'},
          ],
          startLoad: () => ({
            cancel: () => {
              loadCancelled = true;
            },
            waitComplete: async () => ({
              total: 120,
              success: 96,
              failed: 24,
            }),
          }),
          restartNode: async () => {
            restarted = true;
          },
          assertConsistency: async () => {},
          waitForConsistencyConvergence: async () => {},
        };

        await assert.rejects(
          run(cluster, {
            preRestartDelayMs: 0,
            transactionReplayPollIntervalMs: 1,
            transactionReplayTimeoutMs: 60000,
            transactionReplayNoProgressTimeoutMs: 60000,
            replayRecoveryGapNoProgressTimeoutMs: 25,
            recoveryReadinessNoProgressTimeoutMs: 25,
            replayProbeTimeoutMs: 5,
            distributionPollIntervalMs: 1,
            distributionTimeoutMs: 2000,
            minAdditionalPartitions: 0,
            minDistinctReplicaNodes: 6,
            minSuccessRate: 0.7,
          }),
          /stalled before recovery became ready/i,
        );
        assert.equal(loadCancelled, true);
        assert.ok(postRestartVisibilityObserved);
        assert.ok(activeTransactionId);
        assert.ok(preparedTransactionId);
      });
}
