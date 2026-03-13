/**
 * Shared helpers for distributed scenarios that validate table partition
 * growth and replica spread.
 */

import assert from 'node:assert/strict';
import {
  resolvePartitionGrowthAndSpreadScenarioConfig,
  resolveTableDistributionQueryConfig,
} from '../harness/scenario-config.js';

const TABLE_NAME_LOGS = 'logs';
const TABLE_NAME_BENCHMARK_EVENTS = 'benchmark_events';
const SERVICE_TYPE_PARTITION = 'partition';
const STATUS_ACTIVE = 'active';
const ZERO = 0;
const BENCHMARK_WORKLOAD_PROFILE = 'benchmark_events_mixed';
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TABLE_ID_VISIBILITY_TIMEOUT_MS = 10000;
const TABLE_ID_VISIBILITY_POLL_INTERVAL_MS = 100;
const CONTROL_QUERY_TIMEOUT_MS = 30000;
const POLICY_APPLY_TIMEOUT_MS = 60000;
const POLICY_APPLY_ATTEMPT_TIMEOUT_MS = 15000;
const POLICY_VISIBILITY_POLL_INTERVAL_MS = 250;
const POLICY_APPLY_RETRY_DELAY_MS = 250;
const CONTROL_QUERY_LANE_DEFAULT = 'default';
const TABLE_POLICY_PRECONDITION_SCENARIO_DEFAULT = 'unknown-scenario';

const DEFAULT_TABLE_SPLIT_POLICIES = Object.freeze({
  splitStorageThreshold: 16384,
  splitTrafficThreshold: 120,
  mergeStorageThreshold: 1,
  mergeTrafficThreshold: 1,
});

const SQL_SELECT_TABLE_PARTITIONS_PREFIX =
  'SELECT partition_id FROM partitions WHERE table_name = \'';
const SQL_SELECT_TABLE_PARTITIONS_SUFFIX = '\'';
const SQL_SELECT_TABLE_ID_PREFIX =
  'SELECT table_id FROM tables WHERE table_name = \'';
const SQL_SELECT_TABLE_ID_SUFFIX = '\'';
const SQL_SELECT_TABLE_POLICIES_BY_TABLE_ID_PREFIX =
  'SELECT table_policies FROM tables WHERE table_id = \'';
const SQL_SELECT_TABLE_POLICIES_BY_TABLE_ID_SUFFIX = '\'';
const SQL_SELECT_TABLE_POLICIES_BY_TABLE_NAME_PREFIX =
  'SELECT table_policies FROM tables WHERE table_name = \'';
const SQL_SELECT_TABLE_POLICIES_BY_TABLE_NAME_SUFFIX = '\'';
const SQL_SELECT_PARTITIONS_BY_TABLE_ID_PREFIX =
  'SELECT partition_id FROM partitions WHERE table_id = \'';
const SQL_SELECT_PARTITIONS_BY_TABLE_ID_SUFFIX = '\'';
const SQL_CREATE_TABLE_PREFIX = 'CREATE TABLE IF NOT EXISTS ';
const SQL_CREATE_TABLE_SUFFIX =
  ' (event_id TEXT PRIMARY KEY, payload INTEGER NOT NULL, created_at INTEGER NOT NULL)';
const SQL_UPDATE_TABLE_POLICIES_PREFIX =
  'UPDATE tables SET table_policies = \'';
const SQL_UPDATE_TABLE_POLICIES_MID = '\' WHERE table_id = \'';
const SQL_UPDATE_TABLE_POLICIES_SUFFIX = '\'';
const SQL_UPDATE_TABLE_POLICIES_BY_NAME_MID = '\' WHERE table_name = \'';
const SQL_SELECT_ACTIVE_PARTITION_SERVICES =
  'SELECT partition_id, node_id, status FROM services ' +
  'WHERE service_type = \'' + SERVICE_TYPE_PARTITION + '\' ' +
  'AND status = \'' + STATUS_ACTIVE + '\'';

const TIMEOUT_ERROR_PATTERN = /timeout|timed out|deadline exceeded|etimedout/i;

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
 * Check whether an error is timeout-shaped.
 * @param {Error|*} error
 * @return {boolean}
 */
function isTimeoutShapedError(error) {
  const message = String(error?.message || error || '');
  return TIMEOUT_ERROR_PATTERN.test(message);
}

/**
 * Run one control-plane query with timeout-aware lane routing.
 * @param {Object} node
 * @param {string} sql
 * @param {Array<*>} [params]
 * @return {Promise<Object>}
 */
async function queryControl(node, sql, params = [], options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) &&
    options.timeoutMs > ZERO ?
    Math.floor(options.timeoutMs) :
    CONTROL_QUERY_TIMEOUT_MS;
  const lane = typeof options.lane === 'string' &&
    options.lane.length > ZERO ?
    options.lane :
    CONTROL_QUERY_LANE_DEFAULT;
  if (node && typeof node.queryWithTimeout === 'function') {
    return node.queryWithTimeout(sql, params, {
      timeoutMs,
      lane,
    });
  }
  return node.query(sql, params);
}

/**
 * Normalize SQL query results into a rows array.
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
 * Resolve a benchmark-safe table name for partitioning scenarios.
 * @param {string} tableName
 * @return {string}
 */
function resolveBenchmarkTableName(tableName) {
  const candidate = String(tableName || '').trim();
  if (!IDENTIFIER_PATTERN.test(candidate)) {
    return TABLE_NAME_BENCHMARK_EVENTS;
  }
  return candidate;
}

/**
 * Resolve effective load table for partitioning scenarios.
 * Defaults to benchmark table when no explicit table override is provided.
 * @param {Object} cluster
 * @param {string} scenarioTableName
 * @param {Object} [options]
 * @param {boolean} [options.explicitTableName]
 * @return {string}
 */
function resolvePartitioningLoadTableName(
  cluster,
  scenarioTableName,
  options = {},
) {
  const explicitTableName = options.explicitTableName === true;
  const benchmarkTableName = String(
    cluster?._config?.benchmark?.tableName || '',
  ).trim();
  const candidate = explicitTableName ?
    scenarioTableName :
    (benchmarkTableName || scenarioTableName);
  const resolved = resolveBenchmarkTableName(candidate);
  if (!explicitTableName && resolved === TABLE_NAME_LOGS) {
    return TABLE_NAME_BENCHMARK_EVENTS;
  }
  return resolved;
}

/**
 * Return the first non-empty table_id from rows.
 * @param {Array<Object>} rows
 * @return {string|null}
 */
function firstTableId(rows) {
  for (const row of rows) {
    const value = row?.table_id || row?.tableId;
    if (typeof value === 'string' && value.length > ZERO) {
      return value;
    }
  }
  return null;
}

/**
 * Resolve the first parseable table policy payload from rows.
 * @param {Array<Object>} rows
 * @return {Object|null}
 */
function firstTablePolicies(rows) {
  for (const row of rows) {
    const rawValue = row?.table_policies ?? row?.tablePolicies ?? null;
    if (rawValue === null || rawValue === undefined) {
      continue;
    }
    if (typeof rawValue === 'object') {
      return rawValue;
    }
    if (typeof rawValue !== 'string' || rawValue.length === ZERO) {
      continue;
    }
    try {
      const parsed = JSON.parse(rawValue);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch (_error) {
      continue;
    }
  }
  return null;
}

/**
 * Resolve affected row count from one query result when present.
 * @param {*} result
 * @return {number|null}
 */
function affectedRowCountFromResult(result) {
  const candidates = [
    result?.affectedRows,
    result?.changes,
    result?.partitionResult?.affectedRows,
    result?.hostResult?.affectedRows,
  ];
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (!Number.isFinite(parsed)) {
      continue;
    }
    return Math.max(ZERO, Math.floor(parsed));
  }
  return null;
}

/**
 * Summarize mutation-result counters for diagnostics.
 * @param {*} result
 * @return {Object}
 */
function summarizeMutationResult(result) {
  return {
    affectedRows: result?.affectedRows ?? null,
    changes: result?.changes ?? null,
    count: result?.count ?? null,
    hostAffectedRows: result?.hostResult?.affectedRows ?? null,
    operation: result?.operation ?? null,
    warning: result?.warning ?? null,
  };
}

/**
 * Check whether one object has no own enumerable fields.
 * @param {*} value
 * @return {boolean}
 */
function isEmptyObject(value) {
  return value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === ZERO;
}

/**
 * Resolve whether an observed policy contains every expected key/value pair.
 * @param {Object} expected
 * @param {Object} observed
 * @return {boolean}
 */
function policyContainsExpected(expected, observed) {
  if (!expected || typeof expected !== 'object' ||
      !observed || typeof observed !== 'object') {
    return false;
  }

  for (const [key, expectedValue] of Object.entries(expected)) {
    const observedValue = observed[key];
    if (expectedValue &&
        typeof expectedValue === 'object' &&
        !Array.isArray(expectedValue)) {
      if (!policyContainsExpected(expectedValue, observedValue)) {
        return false;
      }
      continue;
    }
    if (observedValue !== expectedValue) {
      return false;
    }
  }

  return true;
}

/**
 * Query table_id for a table name.
 * @param {Object} seedNode
 * @param {string} tableName
 * @return {Promise<string|null>}
 */
async function queryTableId(seedNode, tableName) {
  const sql = SQL_SELECT_TABLE_ID_PREFIX +
    escapeSql(tableName) +
    SQL_SELECT_TABLE_ID_SUFFIX;
  const result = await queryControl(seedNode, sql, [], {
    lane: CONTROL_QUERY_LANE_DEFAULT,
  });
  return firstTableId(rowsFromResult(result));
}

/**
 * Query table_policies for one table ID.
 * @param {Object} seedNode
 * @param {string} tableId
 * @return {Promise<Object|null>}
 */
async function queryTablePolicies(seedNode, tableId, options = {}) {
  const tableName = typeof options.tableName === 'string' &&
    options.tableName.length > ZERO ?
    options.tableName :
    null;
  const lookupSql = [];
  if (tableName) {
    lookupSql.push(
      SQL_SELECT_TABLE_POLICIES_BY_TABLE_NAME_PREFIX +
      escapeSql(tableName) +
      SQL_SELECT_TABLE_POLICIES_BY_TABLE_NAME_SUFFIX,
    );
  }
  lookupSql.push(
    SQL_SELECT_TABLE_POLICIES_BY_TABLE_ID_PREFIX +
    escapeSql(tableId) +
    SQL_SELECT_TABLE_POLICIES_BY_TABLE_ID_SUFFIX,
  );
  for (const sql of lookupSql) {
    const result = await queryControl(seedNode, sql, [], {
      lane: CONTROL_QUERY_LANE_DEFAULT,
    });
    const policies = firstTablePolicies(rowsFromResult(result));
    if (policies !== null) {
      return policies;
    }
  }
  return null;
}

/**
 * Wait until table metadata becomes visible.
 * @param {Object} seedNode
 * @param {string} tableName
 * @return {Promise<string>}
 */
async function waitForTableId(seedNode, tableName) {
  const deadline = Date.now() + TABLE_ID_VISIBILITY_TIMEOUT_MS;
  let tableId = null;
  let lastQueryError = null;
  while (!tableId && Date.now() < deadline) {
    try {
      tableId = await queryTableId(seedNode, tableName);
      lastQueryError = null;
    } catch (error) {
      lastQueryError = String(error?.message || error);
    }
    if (tableId || Date.now() >= deadline) {
      break;
    }
    await sleep(TABLE_ID_VISIBILITY_POLL_INTERVAL_MS);
  }
  assert.ok(
    tableId,
    'Timed out waiting for table_id visibility for "' + tableName + '"' +
    (lastQueryError ? ' (lastQueryError=' + lastQueryError + ')' : ''),
  );
  return tableId;
}

/**
 * Ensure benchmark workload table exists and metadata is visible.
 * @param {Object} seedNode
 * @param {Object} [options]
 * @param {string} [options.tableName]
 * @return {Promise<Object>}
 */
async function ensureBenchmarkPartitioningTable(seedNode, options = {}) {
  assert.ok(
    seedNode && typeof seedNode.query === 'function',
    'ensureBenchmarkPartitioningTable requires seed node query(sql)',
  );
  const resolvedTableName = resolveBenchmarkTableName(options.tableName);
  assert.ok(
    IDENTIFIER_PATTERN.test(resolvedTableName),
    'Invalid benchmark table identifier: ' + resolvedTableName,
  );
  const createSql = SQL_CREATE_TABLE_PREFIX +
    resolvedTableName +
    SQL_CREATE_TABLE_SUFFIX;
  let createTimeoutError = null;
  try {
    await queryControl(seedNode, createSql, [], {
      timeoutMs: POLICY_APPLY_ATTEMPT_TIMEOUT_MS,
      lane: CONTROL_QUERY_LANE_DEFAULT,
    });
  } catch (error) {
    if (!isTimeoutShapedError(error)) {
      throw error;
    }
    createTimeoutError = String(error?.message || error);
  }
  const tableId = await waitForTableId(seedNode, resolvedTableName);
  return {
    tableName: resolvedTableName,
    tableId,
    createTimeoutError,
  };
}

/**
 * Apply split-friendly table policies to a benchmark workload table.
 * @param {Object} seedNode
 * @param {Object} [options]
 * @param {string} [options.tableName]
 * @param {Object} [options.tablePolicies]
 * @return {Promise<Object>}
 */
async function prepareBenchmarkPartitioningTable(seedNode, options = {}) {
  const ensured = await ensureBenchmarkPartitioningTable(seedNode, {
    tableName: options.tableName,
  });
  const tablePolicies = options.tablePolicies &&
    typeof options.tablePolicies === 'object' ?
    options.tablePolicies :
    DEFAULT_TABLE_SPLIT_POLICIES;
  const policySql = SQL_UPDATE_TABLE_POLICIES_PREFIX +
    escapeSql(JSON.stringify(tablePolicies)) +
    SQL_UPDATE_TABLE_POLICIES_MID +
    escapeSql(ensured.tableId) +
    SQL_UPDATE_TABLE_POLICIES_SUFFIX;
  const policySqlByName = SQL_UPDATE_TABLE_POLICIES_PREFIX +
    escapeSql(JSON.stringify(tablePolicies)) +
    SQL_UPDATE_TABLE_POLICIES_BY_NAME_MID +
    escapeSql(ensured.tableName) +
    SQL_UPDATE_TABLE_POLICIES_SUFFIX;

  // Table metadata can still receive asynchronous updates shortly after
  // CREATE TABLE. Re-apply policy until read-back is stable so we do not
  // proceed with split checks against a reverted default "{}" payload.
  const visibilityDeadline = Date.now() + POLICY_APPLY_TIMEOUT_MS;
  let applyAttemptCount = ZERO;
  let policyVisible = false;
  let observedPolicy = null;
  let stableMatchCount = ZERO;
  let noOpApplyCount = ZERO;
  let policyUpdateNoOpDetected = false;
  let positivePolicyMutationObserved = false;
  let lastPolicyApplyError = null;
  let lastPolicyVisibilityError = null;
  let lastPolicyApplySummary = null;
  while (Date.now() <= visibilityDeadline) {
    try {
      applyAttemptCount += 1;
      const applyResult = await queryControl(seedNode, policySql, [], {
        timeoutMs: POLICY_APPLY_ATTEMPT_TIMEOUT_MS,
        lane: CONTROL_QUERY_LANE_DEFAULT,
      });
      lastPolicyApplySummary = summarizeMutationResult(applyResult);
      let affectedRows = affectedRowCountFromResult(applyResult);
      if (affectedRows === ZERO) {
        const fallbackApplyResult = await queryControl(
          seedNode,
          policySqlByName,
          [],
          {
            timeoutMs: POLICY_APPLY_ATTEMPT_TIMEOUT_MS,
            lane: CONTROL_QUERY_LANE_DEFAULT,
          },
        );
        lastPolicyApplySummary = summarizeMutationResult(fallbackApplyResult);
        const fallbackAffectedRows = affectedRowCountFromResult(
          fallbackApplyResult,
        );
        if (Number.isFinite(fallbackAffectedRows)) {
          affectedRows = fallbackAffectedRows;
        }
      }
      if (affectedRows === ZERO) {
        noOpApplyCount += 1;
      } else {
        noOpApplyCount = ZERO;
        if (Number.isFinite(affectedRows) && affectedRows > ZERO) {
          positivePolicyMutationObserved = true;
        }
      }
      lastPolicyApplyError = null;
    } catch (error) {
      stableMatchCount = ZERO;
      lastPolicyApplyError = String(error?.message || error);
      if (Date.now() >= visibilityDeadline) {
        break;
      }
      await sleep(POLICY_APPLY_RETRY_DELAY_MS);
      continue;
    }

    try {
      observedPolicy = await queryTablePolicies(
        seedNode,
        ensured.tableId,
        {
          tableName: ensured.tableName,
        },
      );
      lastPolicyVisibilityError = null;
      if (policyContainsExpected(tablePolicies, observedPolicy)) {
        stableMatchCount += 1;
        if (stableMatchCount >= 2) {
          policyVisible = true;
          break;
        }
      } else {
        stableMatchCount = ZERO;
        if (noOpApplyCount >= 3 && isEmptyObject(observedPolicy)) {
          policyUpdateNoOpDetected = true;
          break;
        }
      }
    } catch (error) {
      stableMatchCount = ZERO;
      lastPolicyVisibilityError = String(error?.message || error);
    }
    if (Date.now() >= visibilityDeadline) {
      break;
    }
    await sleep(POLICY_VISIBILITY_POLL_INTERVAL_MS);
  }
  if (!policyVisible && policyUpdateNoOpDetected) {
    return {
      ...ensured,
      tablePolicies,
      tablePoliciesApplied: false,
      tablePoliciesApplyWarning:
        'sql_system_table_update_noop_detected',
      tablePoliciesApplyDiagnostics: {
        applyAttempts: applyAttemptCount,
        lastApplySummary: lastPolicyApplySummary,
      },
    };
  }
  if (!policyVisible && positivePolicyMutationObserved) {
    return {
      ...ensured,
      tablePolicies,
      tablePoliciesApplied: true,
      tablePoliciesApplyWarning:
        'table_policy_visibility_timeout_assumed_applied',
      tablePoliciesApplyDiagnostics: {
        applyAttempts: applyAttemptCount,
        lastApplySummary: lastPolicyApplySummary,
      },
    };
  }
  assert.ok(
    policyVisible,
    'Timed out waiting for table split policies to become visible for "' +
    ensured.tableName + '" (observed=' +
    JSON.stringify(observedPolicy) + ', expected=' +
    JSON.stringify(tablePolicies) + ', lastError=' +
    String(lastPolicyVisibilityError || 'none') +
    ', lastApplyError=' + String(lastPolicyApplyError || 'none') +
    ', applyAttempts=' + applyAttemptCount +
    ', lastApplySummary=' + JSON.stringify(lastPolicyApplySummary) + ')',
  );
  return {
    ...ensured,
    tablePolicies,
  };
}

/**
 * Assert split-policy preconditions before running split-sensitive load checks.
 * Treats known policy no-op outcomes as hard setup failures so scenarios fail
 * fast with actionable diagnostics instead of timing out later.
 * @param {Object} tablePreparation
 * @param {Object} [options]
 * @param {string} [options.scenarioName]
 * @return {void}
 */
function assertSplitPolicyPrecondition(tablePreparation, options = {}) {
  const preparation = tablePreparation &&
    typeof tablePreparation === 'object' ?
    tablePreparation :
    {};
  if (preparation.tablePoliciesApplied !== false) {
    return;
  }
  const scenarioName = typeof options.scenarioName === 'string' &&
    options.scenarioName.length > ZERO ?
    options.scenarioName :
    TABLE_POLICY_PRECONDITION_SCENARIO_DEFAULT;
  const tableName = String(preparation.tableName || 'unknown-table');
  const warningCode = String(
    preparation.tablePoliciesApplyWarning || 'table_policy_apply_failed',
  );
  throw new Error(
    'Split-policy precondition failed for "' + tableName +
    '" in scenario "' + scenarioName + '": ' + warningCode,
  );
}

/**
 * Query the current partition + replica distribution for a single table.
 * @param {Object} seedNode
 * @param {Object} [options]
 * @param {string} [options.tableName]
 * @return {Promise<Object>}
 */
async function queryTableDistribution(seedNode, options = {}) {
  assert.ok(
    seedNode && typeof seedNode.query === 'function',
    'queryTableDistribution requires a seed node with query(sql)',
  );

  const {tableName} = resolveTableDistributionQueryConfig(options);
  const partitionSql = SQL_SELECT_TABLE_PARTITIONS_PREFIX +
    escapeSql(tableName) +
    SQL_SELECT_TABLE_PARTITIONS_SUFFIX;
  const tableIdSql = SQL_SELECT_TABLE_ID_PREFIX +
    escapeSql(tableName) +
    SQL_SELECT_TABLE_ID_SUFFIX;

  const [partitionResult, tableResult, servicesResult] = await Promise.all([
    queryControl(seedNode, partitionSql, [], {
      lane: CONTROL_QUERY_LANE_DEFAULT,
    }),
    queryControl(seedNode, tableIdSql, [], {
      lane: CONTROL_QUERY_LANE_DEFAULT,
    }),
    queryControl(seedNode, SQL_SELECT_ACTIVE_PARTITION_SERVICES, [], {
      lane: CONTROL_QUERY_LANE_DEFAULT,
    }),
  ]);

  let partitionRows = rowsFromResult(partitionResult);
  if (partitionRows.length === ZERO) {
    const tableRows = rowsFromResult(tableResult);
    const tableId = firstTableId(tableRows);
    if (tableId) {
      const partitionByIdSql = SQL_SELECT_PARTITIONS_BY_TABLE_ID_PREFIX +
        escapeSql(tableId) +
        SQL_SELECT_PARTITIONS_BY_TABLE_ID_SUFFIX;
      const partitionByIdResult = await queryControl(
        seedNode,
        partitionByIdSql,
        [],
        {
          lane: CONTROL_QUERY_LANE_DEFAULT,
        },
      );
      partitionRows = rowsFromResult(partitionByIdResult);
    }
  }
  const serviceRows = rowsFromResult(servicesResult);

  const partitionIds = new Set();
  for (const row of partitionRows) {
    const partitionId = row?.partition_id;
    if (typeof partitionId !== 'string' || partitionId.length === ZERO) {
      continue;
    }
    partitionIds.add(partitionId);
  }

  const replicaNodeIds = new Set();
  const replicasByPartition = new Map();
  for (const row of serviceRows) {
    const partitionId = row?.partition_id;
    const nodeId = row?.node_id;
    if (!partitionIds.has(partitionId)) {
      continue;
    }
    if (typeof nodeId !== 'string' || nodeId.length === ZERO) {
      continue;
    }
    replicaNodeIds.add(nodeId);
    if (!replicasByPartition.has(partitionId)) {
      replicasByPartition.set(partitionId, new Set());
    }
    replicasByPartition.get(partitionId).add(nodeId);
  }

  return {
    tableName,
    partitionIds,
    partitionCount: partitionIds.size,
    replicaNodeIds,
    replicaNodeCount: replicaNodeIds.size,
    replicasByPartition,
  };
}

/**
 * Wait until a table has grown by additional partitions and its replicas are
 * spread across enough distinct nodes.
 * @param {Object} seedNode
 * @param {Object} [options]
 * @param {string} [options.tableName]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.pollIntervalMs]
 * @param {number} [options.minAdditionalPartitions]
 * @param {number} [options.minDistinctReplicaNodes]
 * @return {Promise<Object>}
 */
async function waitForPartitionGrowthAndSpread(seedNode, options = {}) {
  const {
    tableName,
    timeoutMs,
    pollIntervalMs,
    minAdditionalPartitions,
    minDistinctReplicaNodes,
  } = resolvePartitionGrowthAndSpreadScenarioConfig(options);

  const deadline = Date.now() + timeoutMs;
  let baseline = null;
  let transientQueryErrors = 0;
  let lastQueryError = null;
  while (!baseline && Date.now() <= deadline) {
    try {
      baseline = await queryTableDistribution(seedNode, {tableName});
      lastQueryError = null;
    } catch (error) {
      transientQueryErrors += 1;
      lastQueryError = String(error?.message || error);
      if (Date.now() >= deadline) {
        break;
      }
      await sleep(pollIntervalMs);
    }
  }

  assert.ok(
    baseline,
    'Timed out waiting for baseline table distribution for "' + tableName + '"' +
    ', transientQueryErrors=' + transientQueryErrors +
    ', lastQueryError=' + String(lastQueryError || 'none'),
  );
  assert.ok(
    baseline.partitionCount > ZERO,
    'No partitions found for table "' + tableName + '"',
  );

  const baselinePartitionIds = new Set(baseline.partitionIds);
  const additionalPartitionIds = new Set();
  let latest = baseline;
  let sampleCount = 1;

  while (Date.now() <= deadline) {
    try {
      latest = await queryTableDistribution(seedNode, {tableName});
      sampleCount += 1;
      lastQueryError = null;
    } catch (error) {
      transientQueryErrors += 1;
      lastQueryError = String(error?.message || error);
      if (Date.now() >= deadline) {
        break;
      }
      await sleep(pollIntervalMs);
      continue;
    }

    for (const partitionId of latest.partitionIds) {
      if (baselinePartitionIds.has(partitionId)) {
        continue;
      }
      additionalPartitionIds.add(partitionId);
    }

    const growthSatisfied =
      additionalPartitionIds.size >= minAdditionalPartitions;
    const spreadSatisfied =
      latest.replicaNodeCount >= minDistinctReplicaNodes;
    if (growthSatisfied && spreadSatisfied) {
      return {
        tableName,
        sampleCount,
        baselinePartitionCount: baseline.partitionCount,
        currentPartitionCount: latest.partitionCount,
        additionalPartitionCount: additionalPartitionIds.size,
        additionalPartitionIds: Array.from(additionalPartitionIds).sort(),
        replicaNodeCount: latest.replicaNodeCount,
        replicaNodeIds: Array.from(latest.replicaNodeIds).sort(),
      };
    }

    if (Date.now() >= deadline) {
      break;
    }
    await sleep(pollIntervalMs);
  }

  throw new Error(
    'Timed out waiting for table "' + tableName + '" to add at least ' +
    minAdditionalPartitions + ' partitions and spread replicas to at least ' +
    minDistinctReplicaNodes + ' nodes. Baseline=' +
    baseline.partitionCount + ', latest=' + latest.partitionCount +
    ', additionalSeen=' + additionalPartitionIds.size +
    ', spread=' + latest.replicaNodeCount + ', samples=' + sampleCount +
    ', transientQueryErrors=' + transientQueryErrors +
    ', lastQueryError=' + String(lastQueryError || 'none'),
  );
}

export {
  BENCHMARK_WORKLOAD_PROFILE,
  TABLE_NAME_LOGS,
  TABLE_NAME_BENCHMARK_EVENTS,
  escapeSql,
  sleep,
  rowsFromResult,
  resolveBenchmarkTableName,
  resolvePartitioningLoadTableName,
  ensureBenchmarkPartitioningTable,
  prepareBenchmarkPartitioningTable,
  assertSplitPolicyPrecondition,
  queryTableDistribution,
  waitForPartitionGrowthAndSpread,
};
