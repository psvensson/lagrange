import assert from 'node:assert/strict';
import {LOG_MARKER_STATE} from
  '../../../src/control-plane/owners/log-diagnostic-marker-contract.js';
import {DEFAULT_USER_LOAD_TABLE_NAME} from '../harness/scenario-config.js';

const SYSTEM_LOGS_TABLE_NAME = 'logs';
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SELECT_LOG_ID_REGEX = /WHERE log_id = '([^']+)'/;
const DEFAULT_PROVISION_TIMEOUT_MS = 30000;
const DEFAULT_PROVISION_POLL_INTERVAL_MS = 100;
const DEFAULT_MARKER_VISIBILITY_TIMEOUT_MS = 10000;
const DEFAULT_MARKER_VISIBILITY_POLL_INTERVAL_MS = 100;
const ZERO = 0;
const regexExec = Function.call.bind(RegExp.prototype.exec);
const stringIncludes = Function.call.bind(String.prototype.includes);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const USER_LOAD_TABLE_COLUMNS_SQL =
  ' (log_id TEXT PRIMARY KEY, timestamp INTEGER NOT NULL, ' +
  'level TEXT NOT NULL, node_id TEXT NOT NULL, ' +
  'message TEXT NOT NULL, created_at INTEGER NOT NULL)';

function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function escapeSql(value) {
  return String(value).replace(/'/g, '\'\'');
}

function rowsFromResult(result) {
  if (Array.isArray(result)) {
    return result;
  }
  if (Array.isArray(result?.rows)) {
    return result.rows;
  }
  return [];
}

function resolveClusterNodes(cluster) {
  if (typeof cluster?.getNodes === 'function') {
    return cluster.getNodes();
  }
  if (typeof cluster?.nodes === 'function') {
    return cluster.nodes();
  }
  return [];
}

async function getReachableNodes(nodes) {
  const reachable = [];
  for (const node of nodes) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    if (typeof node.isReachable === 'function') {
      const isReachable = await node.isReachable();
      if (!isReachable) {
        continue;
      }
    }
    reachable.push(node);
  }
  return reachable;
}

function resolveUserLoadTableName(requestedTableName) {
  const tableName =
    typeof requestedTableName === 'string' &&
    requestedTableName.trim().length > ZERO ?
      requestedTableName.trim() :
      DEFAULT_USER_LOAD_TABLE_NAME;
  assert.ok(
    IDENTIFIER_PATTERN.test(tableName),
    'Invalid user load table identifier: ' + tableName,
  );
  assert.notEqual(
    tableName,
    SYSTEM_LOGS_TABLE_NAME,
    'User load table must not target system table logs',
  );
  return tableName;
}

/**
 * Provision the log-shaped user load table before starting mixed user load
 * and wait until its initial partition is visible in metadata.
 *
 * @param {Object} cluster
 * @param {Object} [options]
 * @param {string} [options.tableName]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.pollIntervalMs]
 * @return {Promise<{tableName: string, coordinatorNodeId: string}>}
 */
async function provisionUserLoadTable(cluster, options = {}) {
  const tableName = resolveUserLoadTableName(options.tableName);
  const timeoutMs = Number.isFinite(options.timeoutMs) &&
    options.timeoutMs > ZERO ?
    options.timeoutMs :
    DEFAULT_PROVISION_TIMEOUT_MS;
  const pollIntervalMs = Number.isFinite(options.pollIntervalMs) &&
    options.pollIntervalMs >= ZERO ?
    options.pollIntervalMs :
    DEFAULT_PROVISION_POLL_INTERVAL_MS;

  const nodes = await getReachableNodes(resolveClusterNodes(cluster));
  assert.ok(
    nodes.length > ZERO,
    'provisionUserLoadTable requires at least one reachable cluster node',
  );
  const coordinatorNode =
    nodes.find((node) => node.role === 'seed') || nodes[ZERO];
  assert.equal(
    typeof coordinatorNode?.query,
    'function',
    'provisionUserLoadTable requires coordinator node query capability',
  );

  const createSql =
    'CREATE TABLE IF NOT EXISTS ' + tableName + USER_LOAD_TABLE_COLUMNS_SQL;
  const partitionCheckSql =
    'SELECT partition_id FROM partitions WHERE table_name = \'' +
    escapeSql(tableName) +
    '\' LIMIT 1';

  await coordinatorNode.query(createSql);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const partitionResult = await coordinatorNode.query(partitionCheckSql);
    const rows = rowsFromResult(partitionResult);
    if (rows.length > ZERO) {
      return {
        tableName,
        coordinatorNodeId: String(coordinatorNode.id || 'seed'),
      };
    }
    if (pollIntervalMs > ZERO) {
      await sleep(pollIntervalMs);
    }
  }

  throw new Error(
    'Provisioned user load table "' + tableName +
    '" did not become partition-visible within ' + timeoutMs + 'ms',
  );
}

function resolveMarkerTiming(options) {
  const timeoutMs = Number.isFinite(options.timeoutMs) &&
    options.timeoutMs > ZERO ?
    options.timeoutMs :
    DEFAULT_MARKER_VISIBILITY_TIMEOUT_MS;
  const pollIntervalMs = Number.isFinite(options.pollIntervalMs) &&
    options.pollIntervalMs >= ZERO ?
    options.pollIntervalMs :
    DEFAULT_MARKER_VISIBILITY_POLL_INTERVAL_MS;
  return {timeoutMs, pollIntervalMs};
}

function resolveMarkerMessage(markerId, requestedMessage) {
  return typeof requestedMessage === 'string' &&
    requestedMessage.trim().length > ZERO ?
    requestedMessage.trim() :
    'diagnostic-marker:' + markerId;
}

async function appendVerifiedDiagnosticMarker(writerNode, markerId, message) {
  assert.equal(
    typeof writerNode?.appendDiagnosticMarker,
    'function',
    'Writer node must expose appendDiagnosticMarker',
  );
  const answer = await writerNode.appendDiagnosticMarker({markerId, message});
  assert.equal(
    answer?.success,
    true,
    'Diagnostic marker write must succeed for ' + markerId,
  );
  assert.equal(
    answer?.markerState,
    LOG_MARKER_STATE.RECORDED,
    'Diagnostic marker must report recorded state for ' + markerId,
  );
  assert.equal(
    typeof answer?.logId,
    'string',
    'Recorded diagnostic marker must return logId for ' + markerId,
  );
  assert.ok(
    answer.logId.length > ZERO,
    'Recorded diagnostic marker logId must be non-empty for ' + markerId,
  );
  return answer.logId;
}

async function findMissingMarkerNodes(nodes, selectSql) {
  const missingNodeIds = [];
  for (const node of nodes) {
    assert.equal(
      typeof node?.query,
      'function',
      'Reachable node must expose query for diagnostic marker readback',
    );
    const rows = rowsFromResult(await node.query(selectSql));
    if (rows.length === ZERO) {
      missingNodeIds.push(node.id);
    }
  }
  return missingNodeIds;
}

async function waitForDiagnosticMarkerVisibility(
  candidateNodes,
  markerId,
  logId,
  writerNodeId,
  timing,
) {
  const selectSql =
    'SELECT log_id FROM ' + SYSTEM_LOGS_TABLE_NAME +
    ' WHERE log_id = \'' + escapeSql(logId) + '\' LIMIT 1';
  const deadline = Date.now() + timing.timeoutMs;
  let lastMissingNodeIds = [];

  while (Date.now() <= deadline) {
    const currentReachableNodes = await getReachableNodes(candidateNodes);
    assert.ok(
      currentReachableNodes.length > ZERO,
      'No reachable nodes available for diagnostic marker visibility check',
    );
    const missingNodeIds = await findMissingMarkerNodes(
      currentReachableNodes,
      selectSql,
    );
    if (missingNodeIds.length === ZERO) {
      return {
        markerId,
        logId,
        writerNodeId,
        reachableNodeCount: currentReachableNodes.length,
      };
    }
    lastMissingNodeIds = missingNodeIds;
    if (timing.pollIntervalMs > ZERO) {
      await sleep(timing.pollIntervalMs);
    }
  }

  throw new Error(
    'Diagnostic marker "' + markerId + '" (logId=' + logId +
    ') was not visible on all reachable nodes within ' + timing.timeoutMs +
    'ms. Missing nodes: ' + JSON.stringify(lastMissingNodeIds),
  );
}

/**
 * Append a fixed diagnostic marker through the log owner and verify SELECT
 * readback across all reachable cluster nodes.
 *
 * @param {Object} cluster
 * @param {Object} options
 * @param {string} options.markerId
 * @param {string} [options.message]
 * @param {Object} [options.writerNode]
 * @param {Array<Object>} [options.nodes]
 * @param {number} [options.timeoutMs]
 * @param {number} [options.pollIntervalMs]
 * @return {Promise<{markerId: string, logId: string, writerNodeId: string, reachableNodeCount: number}>}
 */
async function recordAndVerifyDiagnosticMarker(cluster, options = {}) {
  const markerId = typeof options.markerId === 'string' ?
    options.markerId.trim() :
    '';
  assert.ok(
    markerId.length > ZERO,
    'recordAndVerifyDiagnosticMarker requires a non-empty markerId',
  );
  const timing = resolveMarkerTiming(options);
  const candidateNodes = Array.isArray(options.nodes) ?
    options.nodes :
    resolveClusterNodes(cluster);
  const reachableNodes = await getReachableNodes(candidateNodes);
  assert.ok(
    reachableNodes.length > ZERO,
    'recordAndVerifyDiagnosticMarker requires at least one reachable node',
  );
  const writerNode = options.writerNode ||
    reachableNodes.find((node) => node.role === 'seed') ||
    reachableNodes[ZERO];
  const logId = await appendVerifiedDiagnosticMarker(
    writerNode,
    markerId,
    resolveMarkerMessage(markerId, options.message),
  );
  return waitForDiagnosticMarkerVisibility(
    candidateNodes,
    markerId,
    logId,
    String(writerNode?.id || 'seed'),
    timing,
  );
}

function handleScenarioNodeQuery(sql, state) {
  if (stringStartsWith(sql, 'CREATE TABLE IF NOT EXISTS user_load_logs')) {
    state.provisionedTable = 'user_load_logs';
    return {rows: []};
  }
  if (stringIncludes(
    sql,
    'FROM partitions WHERE table_name = \'user_load_logs\'',
  )) {
    return state.provisionedTable === 'user_load_logs' ?
      {rows: [{partition_id: 'user_load_logs-p1'}]} :
      {rows: []};
  }
  const match = regexExec(SELECT_LOG_ID_REGEX, sql);
  const logId = match ? match[1] : null;
  if (logId && state.recordedMarkers.has(logId)) {
    return {rows: [{log_id: logId}]};
  }
  return {rows: []};
}

function createScenarioNode(id, role, state) {
  return {
    id,
    role,
    appendDiagnosticMarker: async ({markerId}) => {
      const logId = `log-${markerId}`;
      state.recordedMarkers.add(logId);
      return {
        success: true,
        markerState: LOG_MARKER_STATE.RECORDED,
        markerId,
        logId,
        nodeId: id,
      };
    },
    query: async (sql) => handleScenarioNodeQuery(sql, state),
  };
}

function createThreeNodeScenarioFixture() {
  const state = {
    provisionedTable: null,
    recordedMarkers: new Set(),
  };
  return {
    state,
    nodes: [
      createScenarioNode('seed-1', 'seed', state),
      createScenarioNode('joiner-1', 'joiner', state),
      createScenarioNode('joiner-2', 'joiner', state),
    ],
  };
}

export {
  DEFAULT_USER_LOAD_TABLE_NAME,
  createScenarioNode,
  createThreeNodeScenarioFixture,
  provisionUserLoadTable,
  recordAndVerifyDiagnosticMarker,
  resolveUserLoadTableName,
};
