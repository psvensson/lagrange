import {setTimeout as sleep} from 'node:timers/promises';

const ZERO = 0;
const ONE = 1;
const DEFAULT_DDL_READY_TIMEOUT_MS = 120000;
const DEFAULT_QUERY_TIMEOUT_MS = 20000;
const DEFAULT_PARTITION_READY_TIMEOUT_MS = 240000;
const DEFAULT_POLL_MS = 500;
const DEFAULT_PARTITION_POLL_MS = 1000;
const PENDING_CONTRACT_STATE = 'pending';
const TRANSITIONAL_PARTITION_STATES = new Set(['splitting', 'merging']);
const TRANSIENT_ERROR_PATTERN =
  /participant failures|pressure|degraded|reconnecting|not ready|service shutdown|shutting down|no active leader|leader.*unavailable|timed out|timeout/i;

function rowsFromResult(result) {
  const rows = result?.rows || result?.results || [];
  return Array.isArray(rows) ? rows : [];
}

function isRetryableDdlOutcome(result) {
  return result?.provisioningDeadlineExpired === true ||
    result?.deferRetry === true ||
    result?.contractState === PENDING_CONTRACT_STATE;
}

function isRetryableSetupError(error) {
  return error?.deferRetry === true ||
    TRANSIENT_ERROR_PATTERN.test(String(error?.message || error || ''));
}

async function queryWithTimeout(node, sql, queryTimeoutMs) {
  if (typeof node?.queryWithTimeout === 'function') {
    return node.queryWithTimeout(
      sql,
      [],
      {timeoutMs: queryTimeoutMs},
    );
  }
  return node.query(sql);
}

async function runLagrangeDdl(node, sql, options = {}) {
  const queryTimeoutMs = Number.isInteger(options.queryTimeoutMs) ?
    options.queryTimeoutMs : DEFAULT_QUERY_TIMEOUT_MS;
  const ddlReadyTimeoutMs = Number.isInteger(options.ddlReadyTimeoutMs) ?
    options.ddlReadyTimeoutMs : DEFAULT_DDL_READY_TIMEOUT_MS;
  const pollMs = Number.isInteger(options.pollMs) ?
    options.pollMs : DEFAULT_POLL_MS;
  const deadline = Date.now() + ddlReadyTimeoutMs;
  let lastObservation = null;

  while (Date.now() < deadline) {
    try {
      const result = await queryWithTimeout(node, sql, queryTimeoutMs);
      if (!isRetryableDdlOutcome(result)) {
        return result;
      }
      lastObservation = result;
    } catch (error) {
      if (!isRetryableSetupError(error)) {
        throw error;
      }
      lastObservation = {error: String(error?.message || error)};
    }
    await sleep(pollMs);
  }

  throw new Error(
    'Lagrange benchmark DDL did not become admitted: ' +
    JSON.stringify(lastObservation),
  );
}

function settledLedPartitionRows(rows) {
  return rows.filter((row) => {
    const state = String(row?.state || '').toLowerCase();
    const leader = String(row?.leader_node_id || '');
    return !TRANSITIONAL_PARTITION_STATES.has(state) && leader.length > ZERO;
  });
}

async function queryPartitionRows(nodes, tableName, queryTimeoutMs) {
  const sql =
    'SELECT partition_id, leader_node_id, state FROM partitions ' +
    `WHERE table_name = '${tableName}'`;
  let bestRows = [];
  let lastError = null;
  for (const node of nodes) {
    try {
      const result = await queryWithTimeout(node, sql, queryTimeoutMs);
      const rows = settledLedPartitionRows(rowsFromResult(result));
      if (rows.length > bestRows.length) {
        bestRows = rows;
      }
    } catch (error) {
      if (!isRetryableSetupError(error)) {
        throw error;
      }
      lastError = error;
    }
  }
  if (bestRows.length === ZERO && lastError) {
    return {rows: bestRows, lastError: String(lastError?.message || lastError)};
  }
  return {rows: bestRows, lastError: null};
}

async function waitForLagrangeTablePartitions(
  cluster,
  tableNames,
  options = {},
) {
  const nodes = cluster.getNodes();
  const minPartitions = Number.isInteger(options.minPartitions) ?
    options.minPartitions : ONE;
  const queryTimeoutMs = Number.isInteger(options.queryTimeoutMs) ?
    options.queryTimeoutMs : DEFAULT_QUERY_TIMEOUT_MS;
  const readyTimeoutMs = Number.isInteger(options.readyTimeoutMs) ?
    options.readyTimeoutMs : DEFAULT_PARTITION_READY_TIMEOUT_MS;
  const pollMs = Number.isInteger(options.pollMs) ?
    options.pollMs : DEFAULT_PARTITION_POLL_MS;
  const deadline = Date.now() + readyTimeoutMs;
  let lastObservation = {};

  while (Date.now() < deadline) {
    const observation = {};
    let allReady = true;
    for (const tableName of tableNames) {
      const tableObservation = await queryPartitionRows(
        nodes,
        tableName,
        queryTimeoutMs,
      );
      observation[tableName] = {
        partitionCount: tableObservation.rows.length,
        partitionIds: tableObservation.rows
          .map((row) => String(row.partition_id))
          .sort(),
        lastError: tableObservation.lastError,
      };
      if (tableObservation.rows.length < minPartitions) {
        allReady = false;
      }
    }
    if (allReady) {
      return observation;
    }
    lastObservation = observation;
    await sleep(pollMs);
  }

  throw new Error(
    `Lagrange benchmark tables did not reach ${minPartitions} settled ` +
    `partition(s): ${JSON.stringify(lastObservation)}`,
  );
}

export {
  runLagrangeDdl,
  waitForLagrangeTablePartitions,
};
