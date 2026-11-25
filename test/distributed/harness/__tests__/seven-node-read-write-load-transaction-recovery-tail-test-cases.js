import assert from 'node:assert/strict';
import {
  run,
} from '../../scenarios/seven-node-read-write-load-transaction-recovery.js';

const stringIncludes = Function.call.bind(String.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayFilter = Function.call.bind(Array.prototype.filter);

const SQL_INSERT_TRANSACTION = 'INSERT INTO sql_transactions';
const SQL_CONTROL_SNAPSHOT = 'SELECT * FROM control_snapshot_local()';
const SQL_SELECT_TRANSACTION_STATUSES =
  'SELECT transaction_id, status FROM sql_transactions';
const SQL_FROM_TABLES = 'FROM tables';
const SQL_CREATE_TABLE_IF_NOT_EXISTS = 'CREATE TABLE IF NOT EXISTS';
const SQL_FROM_PARTITIONS = 'FROM partitions';
const SQL_FROM_SERVICES = 'FROM services';
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

const BENCHMARK_TABLE_ID = 'tbl-benchmark-events-1';
const BENCHMARK_PARTITION_SERVICE_ASSIGNMENTS = Object.freeze([
  ['bench-p1', 'seed-1'],
  ['bench-p1', 'node-2'],
  ['bench-p1', 'node-3'],
  ['bench-p2', 'node-4'],
  ['bench-p2', 'node-5'],
  ['bench-p2', 'node-6'],
]);
const JOINER_NODE_IDS = Object.freeze([
  'node-2',
  'node-3',
  'node-4',
  'node-5',
  'node-6',
  'node-7',
]);

function buildRecoveryControlSnapshot({
  restarted,
  recoveryStage = 'traffic_ready',
  partitions = RECOVERY_READY_PARTITIONS,
  recoveredCount = 2,
}) {
  const transactionRecovery = restarted ?
    {
      totalRecovered: recoveredCount,
      resumed: recoveredCount,
      failed: 0,
    } :
    null;
  return {
    rows: [{
      cluster: {
        nodeCount: 7,
        activeNodeCount: 7,
      },
      controlPlaneDiagnostics: {
        startupRecovery: {
          controlPlaneRecoveryReady: true,
          recoveryStage,
        },
      },
      partitions,
      queryEngine: {
        transactionRecovery,
      },
    }],
  };
}

function selectSeededTransactionStatusRows(transactionStatusById, params) {
  const rows = arrayFilter(
    arrayMap(params, (transactionId) => {
      const status = transactionStatusById.get(transactionId);
      return status ? {transaction_id: transactionId, status} : null;
    }),
    Boolean,
  );
  return {rows};
}

function recordSeededTransactionInsert(state, params) {
  const [transactionId, _sessionId, status] = params;
  state.transactionStatusById.set(transactionId, status);
  if (status === 'ACTIVE') {
    state.activeTransactionId = transactionId;
  } else if (status === 'PREPARED') {
    state.preparedTransactionId = transactionId;
  }
  return {rows: []};
}

function matchBenchmarkCatalogQuery(sql) {
  if (stringIncludes(sql, SQL_CREATE_TABLE_IF_NOT_EXISTS)) {
    return {rows: []};
  }
  if (stringIncludes(sql, SQL_FROM_TABLES)) {
    return {
      rows: [{
        table_id: BENCHMARK_TABLE_ID,
        table_policies: TABLE_POLICIES_JSON,
      }],
    };
  }
  if (stringIncludes(sql, SQL_FROM_PARTITIONS)) {
    return {rows: [{partition_id: 'bench-p1'}, {partition_id: 'bench-p2'}]};
  }
  if (stringIncludes(sql, SQL_FROM_SERVICES)) {
    return {
      rows: arrayMap(
        BENCHMARK_PARTITION_SERVICE_ASSIGNMENTS,
        ([partitionId, nodeId]) => ({
          partition_id: partitionId,
          node_id: nodeId,
          status: 'active',
        }),
      ),
    };
  }
  return null;
}

function createRecoveryTailFixture({
  buildSnapshot,
  onSelectStatuses,
  joinerOverrides = {},
  waitCompleteResult = {total: 120, success: 96, failed: 24},
  createLoadHandle,
} = {}) {
  const state = {
    restarted: false,
    loadCancelled: false,
    transactionStatusById: new Map(),
    activeTransactionId: null,
    preparedTransactionId: null,
  };
  const resolveControlSnapshot = () =>
    buildSnapshot ?
      buildSnapshot(state) :
      buildRecoveryControlSnapshot({restarted: state.restarted});
  const seedNode = {
    id: 'seed-1',
    role: 'seed',
    getControlSnapshot: async () => resolveControlSnapshot(),
    updateTablePolicy: async () => ({success: true, outcome: 'applied'}),
    query: async (sql, params = []) => {
      const catalogResult = matchBenchmarkCatalogQuery(sql);
      if (catalogResult) {
        return catalogResult;
      }
      if (sql.includes(SQL_INSERT_TRANSACTION)) {
        return recordSeededTransactionInsert(state, params);
      }
      if (sql.includes(SQL_SELECT_TRANSACTION_STATUSES)) {
        if (onSelectStatuses) {
          return onSelectStatuses(state, params);
        }
        return selectSeededTransactionStatusRows(
          state.transactionStatusById,
          params,
        );
      }
      if (sql.includes(SQL_CONTROL_SNAPSHOT)) {
        return seedNode.getControlSnapshot();
      }
      return {rows: []};
    },
  };
  const joiners = arrayMap(JOINER_NODE_IDS, (id) =>
    joinerOverrides[id] || {id, role: 'joiner'},
  );
  const allNodes = [seedNode, ...joiners];
  const readyLoadNodes = allNodes.slice(0, 6);
  const cluster = {
    getNodes: () => allNodes,
    waitForConvergence: async () => ({settledAfterMs: 1}),
    waitForControlPlaneQuiescence: async () => null,
    resolveBenchmarkReadyLoadNodes: async () => readyLoadNodes,
    startLoad: () =>
      createLoadHandle ?
        createLoadHandle(state) :
        {
          cancel: () => {
            state.loadCancelled = true;
          },
          waitComplete: async () => waitCompleteResult,
        },
    restartNode: async () => {
      state.restarted = true;
    },
    assertConsistency: async () => {},
    waitForConsistencyConvergence: async () => {},
  };
  return {state, seedNode, cluster};
}

export function registerSevenNodeTransactionRecoveryTailTests({
  it,
}) {
  it('queries replay transaction statuses across nodes in parallel',
    async () => {
      const slowDelayMs = 60;
      const delay = (ms) => new Promise((resolve) => {
        setTimeout(resolve, ms);
      });
      let fixtureState = null;

      const slowJoiner = {
        id: 'node-2',
        role: 'joiner',
        query: async (sql, params = []) => {
          if (!sql.includes(SQL_SELECT_TRANSACTION_STATUSES)) {
            return {rows: []};
          }
          await delay(slowDelayMs);
          return selectSeededTransactionStatusRows(
            fixtureState.transactionStatusById,
            params,
          );
        },
      };

      const fastJoiner = {
        id: 'node-3',
        role: 'joiner',
        query: async (sql, params = []) => {
          if (!sql.includes(SQL_SELECT_TRANSACTION_STATUSES)) {
            return {rows: []};
          }
          if (
            fixtureState.restarted &&
            fixtureState.activeTransactionId &&
            fixtureState.preparedTransactionId
          ) {
            fixtureState.transactionStatusById.set(
              fixtureState.activeTransactionId,
              'ROLLED_BACK',
            );
            fixtureState.transactionStatusById.set(
              fixtureState.preparedTransactionId,
              'COMMITTED',
            );
          }
          return selectSeededTransactionStatusRows(
            fixtureState.transactionStatusById,
            params,
          );
        },
      };

      const {state, cluster} = createRecoveryTailFixture({
        onSelectStatuses: async (currentState, params) => {
          await delay(slowDelayMs);
          return selectSeededTransactionStatusRows(
            currentState.transactionStatusById,
            params,
          );
        },
        joinerOverrides: {
          'node-2': slowJoiner,
          'node-3': fastJoiner,
        },
        waitCompleteResult: {
          total: 120,
          success: 120,
          failed: 0,
        },
      });
      fixtureState = state;

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
      const {state, cluster} = createRecoveryTailFixture();

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
      assert.equal(state.loadCancelled, true);
      assert.ok(state.activeTransactionId);
      assert.ok(state.preparedTransactionId);
    });

  it('fails the partition-growth load phase early when load pressure stalls',
    async () => {
      let loadMetricSampleCount = 0;
      const {state, cluster} = createRecoveryTailFixture({
        createLoadHandle: (currentState) => ({
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
            currentState.loadCancelled = true;
          },
          waitComplete: async () => ({
            total: 0,
            success: 0,
            failed: 0,
          }),
        }),
      });

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
      assert.equal(state.loadCancelled, true);
      assert.ok(loadMetricSampleCount >= 2);
    });

  it('fails early when seeded transaction rows stay invisible after restart',
    async () => {
      const {state, cluster} = createRecoveryTailFixture({
        onSelectStatuses: (currentState, params) => {
          if (currentState.restarted) {
            return {rows: []};
          }
          return selectSeededTransactionStatusRows(
            currentState.transactionStatusById,
            params,
          );
        },
      });

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
      assert.equal(state.loadCancelled, true);
      assert.ok(state.activeTransactionId);
      assert.ok(state.preparedTransactionId);
    });

  it('fails replay validation early when recovery remains not ready after fallback',
    async () => {
      let postRestartVisibilityObserved = false;
      const {state, cluster} = createRecoveryTailFixture({
        buildSnapshot: (currentState) => {
          if (currentState.restarted && !postRestartVisibilityObserved) {
            throw new Error(
              'Admin API query timed out for node seed-1 on lane snapshot after 30000ms',
            );
          }
          const partitions = currentState.restarted ?
            arrayFilter(RECOVERY_READY_PARTITIONS, (partitionId) =>
              partitionId !== 'sql_transactions-p1',
            ) :
            RECOVERY_READY_PARTITIONS;
          return buildRecoveryControlSnapshot({
            restarted: currentState.restarted,
            recoveryStage: 'control_plane_recovery_ready',
            partitions,
            recoveredCount: 0,
          });
        },
        onSelectStatuses: (currentState, params) => {
          if (currentState.restarted) {
            postRestartVisibilityObserved = true;
          }
          return selectSeededTransactionStatusRows(
            currentState.transactionStatusById,
            params,
          );
        },
      });

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
      assert.equal(state.loadCancelled, true);
      assert.ok(postRestartVisibilityObserved);
      assert.ok(state.activeTransactionId);
      assert.ok(state.preparedTransactionId);
    });
}
