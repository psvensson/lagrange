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
  rowsFromResult,
  sleep,
} from './table-distribution-helpers.js';

const ZERO = 0;
const IN_FLIGHT_TX_STATUS_ACTIVE = 'ACTIVE';
const IN_FLIGHT_TX_STATUS_PREPARED = 'PREPARED';
const TERMINAL_TX_STATUS_ROLLED_BACK = 'ROLLED_BACK';
const TERMINAL_TX_STATUS_COMMITTED = 'COMMITTED';

const SQL_INSERT_TRANSACTION =
  'INSERT INTO ' + TABLES.SQL_TRANSACTIONS +
  ' (transaction_id, session_id, status, created_at, updated_at) ' +
  'VALUES (?, ?, ?, ?, ?)';
const SQL_SELECT_TRANSACTION_STATUSES =
  'SELECT transaction_id, status FROM ' + TABLES.SQL_TRANSACTIONS +
  ' WHERE transaction_id IN (?, ?)';

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
    await seedNode.query(
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
 * Query transaction statuses by transaction IDs.
 * @param {Object} seedNode
 * @param {Object} seeded
 * @return {Promise<Map<string, string>>}
 */
async function queryTransactionStatuses(seedNode, seeded) {
  const result = await seedNode.query(
    SQL_SELECT_TRANSACTION_STATUSES,
    [seeded.activeTransactionId, seeded.preparedTransactionId],
  );
  const statuses = new Map();
  for (const row of rowsFromResult(result)) {
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
 * Wait until seeded synthetic transactions reach replayed terminal states.
 * @param {Object} seedNode
 * @param {Object} seeded
 * @param {Object} options
 * @param {number} options.timeoutMs
 * @param {number} options.pollIntervalMs
 * @return {Promise<Object>}
 */
async function waitForReplayTerminalStatuses(seedNode, seeded, options) {
  const timeoutMs = options.timeoutMs;
  const pollIntervalMs = options.pollIntervalMs;
  const deadline = Date.now() + timeoutMs;
  let sampleCount = 0;
  let latestStatuses = new Map();

  while (Date.now() <= deadline) {
    latestStatuses = await queryTransactionStatuses(seedNode, seeded);
    sampleCount += 1;

    const activeStatus = latestStatuses.get(seeded.activeTransactionId);
    const preparedStatus = latestStatuses.get(seeded.preparedTransactionId);
    if (activeStatus === TERMINAL_TX_STATUS_ROLLED_BACK &&
      preparedStatus === TERMINAL_TX_STATUS_COMMITTED) {
      return {
        sampleCount,
        statuses: {
          [seeded.activeTransactionId]: activeStatus,
          [seeded.preparedTransactionId]: preparedStatus,
        },
      };
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
    TERMINAL_TX_STATUS_COMMITTED + ', samples=' + sampleCount,
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

  const initialConvergence = await cluster.waitForConvergence({
    settleTimeoutMs: CONVERGENCE_DEFAULTS.settleTimeoutMs,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
    targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
  });

  const loadRun = cluster.startLoad({
    opsPerSec: loadOpsPerSec,
    duration: loadDuration,
    operations: loadOperations,
  });

  let seededTransactions = null;
  let convergenceAfterRestart = null;
  let replayValidation = null;
  try {
    await sleep(preRestartDelayMs);
    seededTransactions = buildSyntheticTransactions(Date.now());
    await seedSyntheticTransactions(seedNode, seededTransactions);

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
      seedNode,
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
    convergenceTiming: {
      initial: initialConvergence,
      postRestart: convergenceAfterRestart,
    },
    seededTransactions: {
      activeTransactionId: seededTransactions.activeTransactionId,
      preparedTransactionId: seededTransactions.preparedTransactionId,
    },
    replayValidation,
    loadMetrics: metrics,
    successRate,
  };
}

export {run};
