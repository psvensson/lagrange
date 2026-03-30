/**
 * Scenario: Acknowledged Write Visibility
 *
 * Writes rows through one node, then verifies each acknowledged write
 * becomes visible on all reachable nodes within a bounded window.
 */

import assert from 'node:assert/strict';
import {CONVERGENCE_DEFAULTS} from '../harness/constants.js';
import {
  resolveWriteAckVisibilityScenarioConfig,
} from '../harness/scenario-config.js';

const LOG_LEVEL = 'info';
const LOG_TABLE = 'logs';
const CONVERGENCE_SETTLE_TIMEOUT_MS = 120000;
const ZERO = 0;
const SAMPLE_LIMIT = 10;

const SQL_SELECT_LOG_BY_ID_PREFIX =
  'SELECT log_id FROM ' + LOG_TABLE + ' WHERE log_id = \'';
const SQL_SELECT_LOG_BY_ID_SUFFIX = '\' LIMIT 1';

/**
 * Sleep helper for polling loops.
 * @param {number} delayMs
 * @return {Promise<void>}
 */
function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

/**
 * Normalize admin-query result rows.
 * @param {*} result
 * @return {Array<Object>}
 */
function rowsFromResult(result) {
  if (Array.isArray(result)) {
    return result;
  }
  if (Array.isArray(result?.rows)) {
    return result.rows;
  }
  return [];
}

/**
 * Escape single quotes for SQL string literals.
 * @param {string} value
 * @return {string}
 */
function escapeSql(value) {
  return String(value).replace(/'/g, '\'\'');
}

/**
 * Return nodes currently reachable from the harness.
 * @param {Array<Object>} nodes
 * @return {Promise<Array<Object>>}
 */
async function getReachableNodes(nodes) {
  const reachable = [];
  for (const node of nodes) {
    if (typeof node?.isReachable === 'function') {
      const isReachable = await node.isReachable();
      if (!isReachable) {
        continue;
      }
    }
    reachable.push(node);
  }
  return reachable;
}

/**
 * Wait until a log ID is visible on all reachable nodes.
 * @param {string} logId
 * @param {Array<Object>} nodes
 * @param {number} timeoutMs
 * @param {number} pollIntervalMs
 * @return {Promise<{elapsedMs: number, reachableNodeCount: number}>}
 */
async function waitForVisibilityOnReachableNodes(
  logId,
  nodes,
  timeoutMs,
  pollIntervalMs,
) {
  const deadline = Date.now() + timeoutMs;
  let lastMissingNodeIds = [];

  while (Date.now() <= deadline) {
    const reachableNodes = await getReachableNodes(nodes);
    assert.ok(
      reachableNodes.length > ZERO,
      'No reachable nodes available for visibility check',
    );

    const missingNodeIds = [];
    const sql = SQL_SELECT_LOG_BY_ID_PREFIX +
      escapeSql(logId) +
      SQL_SELECT_LOG_BY_ID_SUFFIX;

    for (const node of reachableNodes) {
      const result = await node.query(sql);
      const rows = rowsFromResult(result);
      if (rows.length === ZERO) {
        missingNodeIds.push(node.id);
      }
    }

    if (missingNodeIds.length === ZERO) {
      return {
        elapsedMs: timeoutMs - Math.max(ZERO, deadline - Date.now()),
        reachableNodeCount: reachableNodes.length,
      };
    }

    lastMissingNodeIds = missingNodeIds;
    await sleep(pollIntervalMs);
  }

  throw new Error(
    'Acknowledged write did not propagate to all reachable nodes in ' +
    timeoutMs + 'ms. Missing nodes: ' +
    JSON.stringify(lastMissingNodeIds),
  );
}

/**
 * Build INSERT SQL for the logs table.
 * @param {string} logId
 * @param {number} now
 * @param {string} writerId
 * @return {string}
 */
function buildInsertSql(logId, now, writerId) {
  return 'INSERT INTO ' + LOG_TABLE + ' ' +
    '(log_id, timestamp, level, node_id, message, created_at) VALUES (' +
    '\'' + escapeSql(logId) + '\', ' +
    now + ', ' +
    '\'' + LOG_LEVEL + '\', ' +
    '\'' + escapeSql(writerId) + '\', ' +
    '\'' + escapeSql('visibility-' + logId) + '\', ' +
    now + ')';
}

/**
 * Run the write-ack-visibility scenario.
 *
 * @param {Object} cluster
 * @param {Object} [options]
 * @return {Promise<Object>}
 */
async function run(cluster, options = {}) {
  const {
    writeCount,
    propagationTimeoutMs,
    pollIntervalMs,
  } = resolveWriteAckVisibilityScenarioConfig(options);

  let convergence = null;
  if (typeof cluster.waitForAllActive === 'function') {
    await cluster.waitForAllActive({
      mode: 'load',
      timeoutMs: CONVERGENCE_SETTLE_TIMEOUT_MS,
    });
  } else {
    convergence = await cluster.waitForConvergence({
      settleTimeoutMs: CONVERGENCE_SETTLE_TIMEOUT_MS,
      quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
      targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
    });
  }

  const nodes = cluster.getNodes();
  assert.ok(nodes.length > ZERO, 'Scenario requires at least one node');
  const writerNode = nodes.find((node) => node.role === 'seed') || nodes[0];
  assert.ok(writerNode, 'Writer node should be available');

  const propagationSamples = [];
  let maxPropagationMs = ZERO;
  const runId = Date.now();

  for (let i = 0; i < writeCount; i++) {
    const now = Date.now();
    const logId = 'ack-vis-' + runId + '-' + i;
    const insertSql = buildInsertSql(logId, now, writerNode.id);
    await writerNode.query(insertSql);

    const visibility = await waitForVisibilityOnReachableNodes(
      logId,
      nodes,
      propagationTimeoutMs,
      pollIntervalMs,
    );
    maxPropagationMs = Math.max(maxPropagationMs, visibility.elapsedMs);
    propagationSamples.push({
      logId,
      elapsedMs: visibility.elapsedMs,
      reachableNodeCount: visibility.reachableNodeCount,
    });
  }

  await cluster.waitForConsistencyConvergence();

  return {
    writesAttempted: writeCount,
    maxPropagationMs,
    propagationSamples: propagationSamples.slice(0, SAMPLE_LIMIT),
    convergenceTiming: convergence,
  };
}

export {run};
