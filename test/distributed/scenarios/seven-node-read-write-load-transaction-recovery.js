/**
 * Scenario: Seven-Node Read/Write Load + Transaction Recovery Replay
 *
 * Runs mixed load, seeds in-flight distributed transaction rows,
 * restarts the seed node, and verifies startup recovery replays
 * those rows into terminal states.
 */

import assert from 'node:assert/strict';
import {TABLES} from '../../../src/constants/index.js';
import {CONVERGENCE_DEFAULTS} from '../harness/constants.js';
import {
  resolveSevenNodeReadWriteLoadTransactionRecoveryScenarioConfig,
} from '../harness/scenario-config.js';
import {
  BENCHMARK_WORKLOAD_PROFILE,
  prepareBenchmarkPartitioningTable,
  assertSplitPolicyPrecondition,
  resolvePartitioningLoadTableName,
  rowsFromResult,
  sleep,
  waitForPartitionGrowthAndSpread,
} from './table-distribution-helpers.js';

const ZERO = 0;
const IN_FLIGHT_TX_STATUS_ACTIVE = 'ACTIVE';
const IN_FLIGHT_TX_STATUS_PREPARED = 'PREPARED';
const TERMINAL_TX_STATUS_ROLLED_BACK = 'ROLLED_BACK';
const TERMINAL_TX_STATUS_COMMITTED = 'COMMITTED';
const STATUS_QUERY_TIMEOUT_MS = 30000;
const STATUS_QUERY_LANE = 'default';
const SEEDED_VISIBILITY_TIMEOUT_MS = 15000;
const SEEDED_VISIBILITY_POLL_INTERVAL_MS = 250;

const SQL_INSERT_TRANSACTION =
  'INSERT INTO ' + TABLES.SQL_TRANSACTIONS +
  ' (transaction_id, session_id, status, created_at, updated_at) ' +
  'VALUES (?, ?, ?, ?, ?)';
const SQL_SELECT_TRANSACTION_STATUSES =
  'SELECT transaction_id, status FROM ' + TABLES.SQL_TRANSACTIONS +
  ' WHERE transaction_id IN (?, ?)';

/**
 * Execute one timeout-aware scenario control query.
 * @param {Object} node
 * @param {string} sql
 * @param {Array<*>} [params]
 * @return {Promise<Object>}
 */
async function executeScenarioQuery(node, sql, params = []) {
  if (typeof node?.queryWithTimeout === 'function') {
    return node.queryWithTimeout(
      sql,
      params,
      {
        timeoutMs: STATUS_QUERY_TIMEOUT_MS,
        lane: STATUS_QUERY_LANE,
      },
    );
  }
  return node.query(sql, params);
}

/**
 * Pick seed node with deterministic fallback.
 * @param {Array<Object>} nodes
 * @return {Object}
 */
function getSeedNode(nodes) {
  return nodes.find((node) => node.role === 'seed') || nodes[0];
}

/**
 * Build deterministic synthetic in-flight transactions.
 * @param {number} nowMs
 * @return {Object}
 */
function buildSyntheticTransactions(nowMs) {
  const suffix = String(nowMs);
  const activeTransactionId = 'tx-harness-replay-active-' + suffix;
  const preparedTransactionId = 'tx-harness-replay-prepared-' + suffix;
  return {
    activeTransactionId,
    preparedTransactionId,
    rows: [
      {
        transactionId: activeTransactionId,
        sessionId: 'harness-replay-active-' + suffix,
        status: IN_FLIGHT_TX_STATUS_ACTIVE,
        createdAt: nowMs,
        updatedAt: nowMs,
      },
      {
        transactionId: preparedTransactionId,
        sessionId: 'harness-replay-prepared-' + suffix,
        status: IN_FLIGHT_TX_STATUS_PREPARED,
        createdAt: nowMs,
        updatedAt: nowMs,
      },
    ],
  };
}

/**
 * Seed synthetic transactions into sql_transactions.
 * @param {Object} seedNode
 * @param {Object} seeded
 * @return {Promise<void>}
 */
async function seedSyntheticTransactions(seedNode, seeded) {
  for (const row of seeded.rows) {
    await executeScenarioQuery(
      seedNode,
      SQL_INSERT_TRANSACTION,
      [
        row.transactionId,
        row.sessionId,
        row.status,
        row.createdAt,
        row.updatedAt,
      ],
    );
  }
}

/**
 * Query transaction statuses by transaction IDs from one node.
 * @param {Object} node
 * @param {Object} seeded
 * @return {Promise<Map<string, string>>}
 */
async function queryTransactionStatuses(node, seeded) {
  const queryResult = await executeScenarioQuery(
    node,
    SQL_SELECT_TRANSACTION_STATUSES,
    [seeded.activeTransactionId, seeded.preparedTransactionId],
  );
  const statuses = new Map();
  for (const row of rowsFromResult(queryResult)) {
    const transactionId = String(row?.transaction_id || row?.transactionId || '');
    const status = String(row?.status || '');
    if (transactionId.length === ZERO || status.length === ZERO) {
      continue;
    }
    statuses.set(transactionId, status);
  }
  return statuses;
}

/**
 * Merge node-local transaction statuses. Terminal states outrank in-flight states.
 * @param {Map<string, string>} merged
 * @param {Map<string, string>} incoming
 * @return {void}
 */
function mergeTransactionStatuses(merged, incoming) {
  const statusRank = {
    [TERMINAL_TX_STATUS_ROLLED_BACK]: 4,
    [TERMINAL_TX_STATUS_COMMITTED]: 4,
    [IN_FLIGHT_TX_STATUS_PREPARED]: 3,
    [IN_FLIGHT_TX_STATUS_ACTIVE]: 2,
  };
  for (const [transactionId, status] of incoming.entries()) {
    const existing = merged.get(transactionId);
    const existingRank = statusRank[existing] || 0;
    const incomingRank = statusRank[status] || 1;
    if (!existing || incomingRank >= existingRank) {
      merged.set(transactionId, status);
    }
  }
}

/**
 * Query transaction statuses across all queryable nodes and merge snapshots.
 * @param {Array<Object>} nodes
 * @param {Object} seeded
 * @return {Promise<Map<string, string>>}
 */
async function queryTransactionStatusesAcrossNodes(nodes, seeded) {
  const mergedStatuses = new Map();
  const errors = [];
  let queriedNodeCount = 0;

  for (const node of nodes) {
    if (!node || (typeof node.query !== 'function' &&
      typeof node.queryWithTimeout !== 'function')) {
      continue;
    }
    try {
      const statuses = await queryTransactionStatuses(node, seeded);
      mergeTransactionStatuses(mergedStatuses, statuses);
      queriedNodeCount += 1;
    } catch (error) {
      errors.push(
        String(node.id || 'unknown-node') + ': ' +
        String(error?.message || error),
      );
    }
  }

  if (queriedNodeCount <= ZERO) {
    throw new Error(
      'Unable to query transaction statuses from any node' +
      (errors.length > ZERO ? ': ' + errors.join('; ') : ''),
    );
  }
  return mergedStatuses;
}

/**
 * Wait until seeded rows are visible before restarting seed.
 * @param {Array<Object>} nodes
 * @param {Object} seeded
 * @return {Promise<Object>}
 */
async function waitForSeededTransactionVisibility(nodes, seeded) {
  const deadline = Date.now() + SEEDED_VISIBILITY_TIMEOUT_MS;
  let attemptCount = 0;
  let latestStatuses = new Map();

  while (Date.now() <= deadline) {
    attemptCount += 1;
    latestStatuses = await queryTransactionStatusesAcrossNodes(nodes, seeded);
    if (latestStatuses.has(seeded.activeTransactionId) &&
      latestStatuses.has(seeded.preparedTransactionId)) {
      return {
        attemptCount,
        statuses: {
          [seeded.activeTransactionId]:
            latestStatuses.get(seeded.activeTransactionId) || null,
          [seeded.preparedTransactionId]:
            latestStatuses.get(seeded.preparedTransactionId) || null,
        },
      };
    }
    if (Date.now() >= deadline) {
      break;
    }
    await sleep(SEEDED_VISIBILITY_POLL_INTERVAL_MS);
  }

  throw new Error(
    'Timed out waiting for seeded transaction rows to become visible before restart. ' +
    seeded.activeTransactionId + '=' +
    String(latestStatuses.get(seeded.activeTransactionId) || null) + ', ' +
    seeded.preparedTransactionId + '=' +
    String(latestStatuses.get(seeded.preparedTransactionId) || null) +
    ', attempts=' + attemptCount,
  );
}

/**
 * Wait until seeded synthetic transactions reach replayed terminal states.
 * @param {Array<Object>} nodes
 * @param {Object} seeded
 * @param {Object} options
 * @param {number} options.timeoutMs
 * @param {number} options.pollIntervalMs
 * @return {Promise<Object>}
 */
async function waitForReplayTerminalStatuses(nodes, seeded, options) {
  const timeoutMs = options.timeoutMs;
  const pollIntervalMs = options.pollIntervalMs;
  const deadline = Date.now() + timeoutMs;
  let sampleCount = 0;
  let attemptCount = 0;
  let transientQueryErrors = 0;
  let lastQueryError = null;
  let latestStatuses = new Map();

  while (Date.now() <= deadline) {
    attemptCount += 1;
    try {
      latestStatuses = await queryTransactionStatusesAcrossNodes(nodes, seeded);
      sampleCount += 1;
      lastQueryError = null;

      const activeStatus = latestStatuses.get(seeded.activeTransactionId);
      const preparedStatus = latestStatuses.get(seeded.preparedTransactionId);
      if (activeStatus === TERMINAL_TX_STATUS_ROLLED_BACK &&
        preparedStatus === TERMINAL_TX_STATUS_COMMITTED) {
        return {
          sampleCount,
          attemptCount,
          transientQueryErrors,
          statuses: {
            [seeded.activeTransactionId]: activeStatus,
            [seeded.preparedTransactionId]: preparedStatus,
          },
        };
      }
    } catch (error) {
      transientQueryErrors += 1;
      lastQueryError = String(error?.message || error);
    }

    if (Date.now() >= deadline) {
      break;
    }
    await sleep(pollIntervalMs);
  }

  const activeStatus = latestStatuses.get(seeded.activeTransactionId) || null;
  const preparedStatus =
    latestStatuses.get(seeded.preparedTransactionId) || null;
  throw new Error(
    'Timed out waiting for replayed terminal transaction states after restart. ' +
    seeded.activeTransactionId + '=' + String(activeStatus) + ', ' +
    seeded.preparedTransactionId + '=' + String(preparedStatus) +
    ', expected ' + TERMINAL_TX_STATUS_ROLLED_BACK + ' and ' +
    TERMINAL_TX_STATUS_COMMITTED + ', samples=' + sampleCount +
    ', attempts=' + attemptCount +
    ', transientQueryErrors=' + transientQueryErrors +
    ', lastQueryError=' + String(lastQueryError || 'none'),
  );
}

/**
 * Run the seven-node read/write load + transaction recovery scenario.
 * @param {Object} cluster
 * @param {Object} [options]
 * @return {Promise<Object>}
 */
async function run(cluster, options = {}) {
  const {
    expectedNodeCount,
    loadOpsPerSec,
    loadDuration,
    loadOperations,
    tableName,
    minAdditionalPartitions,
    minDistinctReplicaNodes,
    distributionTimeoutMs,
    distributionPollIntervalMs,
    preRestartDelayMs,
    convergenceTimeoutMs,
    transactionReplayTimeoutMs,
    transactionReplayPollIntervalMs,
    minSuccessRate,
  } = resolveSevenNodeReadWriteLoadTransactionRecoveryScenarioConfig(options);

  const nodes = cluster.getNodes();
  assert.equal(
    nodes.length,
    expectedNodeCount,
    'Scenario requires exactly ' + expectedNodeCount +
    ' nodes, got ' + nodes.length,
  );

  const seedNode = getSeedNode(nodes);
  assert.ok(seedNode, 'Seed node should be available');
  const effectiveTableName = resolvePartitioningLoadTableName(
    cluster,
    tableName,
    {
      explicitTableName:
        typeof options.tableName === 'string' &&
        options.tableName.length > ZERO,
    },
  );

  const initialConvergence = await cluster.waitForConvergence({
    settleTimeoutMs: CONVERGENCE_DEFAULTS.settleTimeoutMs,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
    targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
  });

  const tablePreparation = await prepareBenchmarkPartitioningTable(
    seedNode,
    {tableName: effectiveTableName},
  );
  assertSplitPolicyPrecondition(tablePreparation, {
    scenarioName: 'seven-node-read-write-load-transaction-recovery',
  });

  const loadRun = cluster.startLoad({
    opsPerSec: loadOpsPerSec,
    duration: loadDuration,
    operations: loadOperations,
    tableName: effectiveTableName,
    workloadProfile: BENCHMARK_WORKLOAD_PROFILE,
  });

  let distribution = null;
  let seededTransactions = null;
  let seededVisibility = null;
  let convergenceAfterRestart = null;
  let replayValidation = null;
  try {
    distribution = await waitForPartitionGrowthAndSpread(seedNode, {
      tableName: effectiveTableName,
      timeoutMs: distributionTimeoutMs,
      pollIntervalMs: distributionPollIntervalMs,
      minAdditionalPartitions,
      minDistinctReplicaNodes,
    });

    await sleep(preRestartDelayMs);
    seededTransactions = buildSyntheticTransactions(Date.now());
    await seedSyntheticTransactions(seedNode, seededTransactions);
    seededVisibility = await waitForSeededTransactionVisibility(
      nodes,
      seededTransactions,
    );

    await cluster.restartNode(seedNode.id);

    convergenceAfterRestart = await cluster.waitForConvergence({
      settleTimeoutMs: convergenceTimeoutMs,
      quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
      targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
    });
    assert.ok(
      convergenceAfterRestart.settledAfterMs <= convergenceTimeoutMs,
      'Cluster did not converge after recovery-replay restart: ' +
      convergenceAfterRestart.settledAfterMs + 'ms',
    );

    replayValidation = await waitForReplayTerminalStatuses(
      nodes,
      seededTransactions,
      {
        timeoutMs: transactionReplayTimeoutMs,
        pollIntervalMs: transactionReplayPollIntervalMs,
      },
    );
  } finally {
    if (typeof loadRun.cancel === 'function') {
      loadRun.cancel();
    }
  }

  const metrics = await loadRun.waitComplete();
  assert.ok(metrics.total > ZERO, 'Expected at least one mixed load operation');

  const successRate = metrics.total > ZERO ?
    metrics.success / metrics.total :
    ZERO;
  assert.ok(
    successRate >= minSuccessRate,
    'Mixed load success rate below threshold during recovery replay: ' +
    successRate.toFixed(3) + ' (expected >= ' + minSuccessRate + ')',
  );

  await cluster.assertConsistency();

  return {
    seedNodeId: seedNode.id,
    tableName: effectiveTableName,
    tablePreparation,
    convergenceTiming: {
      initial: initialConvergence,
      postRestart: convergenceAfterRestart,
    },
    distribution,
    seededTransactions: {
      activeTransactionId: seededTransactions.activeTransactionId,
      preparedTransactionId: seededTransactions.preparedTransactionId,
    },
    seededVisibility,
    replayValidation,
    loadMetrics: metrics,
    successRate,
  };
}

export {run};
