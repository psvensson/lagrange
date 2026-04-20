/**
 * Scenario: Seven-Node Read/Write Load + Transaction Recovery Replay
 *
 * Runs mixed load, seeds in-flight distributed transaction rows,
 * restarts the seed node, and verifies startup recovery replays
 * those rows into terminal states.
 */

import assert from 'node:assert/strict';
import {INITIAL_PARTITION_IDS} from
  '../../../src/bootstrap/system-table-schemas-constants.js';
import {TABLES} from '../../../src/constants/index.js';
import {
  CONVERGENCE_DEFAULTS,
  NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
} from '../harness/constants.js';
import {
  resolveSevenNodeReadWriteLoadTransactionRecoveryScenarioConfig,
} from '../harness/scenario-config.js';
import {
  waitForProgressOrStall,
} from '../harness/progress-wait.js';
import {
  createPartitioningAdaptiveDispatchGuardrail,
  createPartitioningBenchmarkLoadNodePlan,
  prepareBenchmarkPartitioningTable,
  assertSplitPolicyPrecondition,
  resolvePartitioningBenchmarkLoadOpsPerSec,
  resolvePartitioningLoadTableName,
  rowsFromResult,
  sleep,
  waitForPartitionGrowthAndSpread,
  waitForPostSplitConsistencyConvergence,
} from './table-distribution-helpers.js';

const ZERO = 0;
const IN_FLIGHT_TX_STATUS_ACTIVE = 'ACTIVE';
const IN_FLIGHT_TX_STATUS_PREPARED = 'PREPARED';
const TERMINAL_TX_STATUS_ROLLED_BACK = 'ROLLED_BACK';
const TERMINAL_TX_STATUS_COMMITTED = 'COMMITTED';
const STATUS_WRITE_QUERY_TIMEOUT_MS = 30000;
const STATUS_PROBE_QUERY_TIMEOUT_MS = 5000;
const STATUS_QUERY_LANE = 'default';
const STATUS_SNAPSHOT_QUERY_LANE = 'snapshot';
const SEEDED_VISIBILITY_TIMEOUT_MS = 15000;
const SEEDED_VISIBILITY_POLL_INTERVAL_MS = 250;
const SEEDED_VISIBILITY_NO_PROGRESS_TIMEOUT_MS = 15000;
const POST_RESTART_SEEDED_VISIBILITY_NO_PROGRESS_TIMEOUT_MS = 15000;
const RECOVERY_READINESS_NO_PROGRESS_TIMEOUT_MS = 45000;
const REPLAY_TERMINAL_NO_PROGRESS_TIMEOUT_MS = 45000;
const REPLAY_RECOVERY_GAP_NO_PROGRESS_TIMEOUT_MS = 30000;
const REPLAY_READY_PLATEAU_NO_PROGRESS_TIMEOUT_MS = 15000;
const STATUS_WITNESS_NODE_COUNT = 3;
const MIN_REPLAY_PHASE_TIMEOUT_MS = 1000;
const LOAD_PHASE_POLL_INTERVAL_MS = 1000;
const LOAD_PHASE_NO_PROGRESS_TIMEOUT_MS = 60000;
const RECOVERY_READINESS_TIMEOUT_ERROR_PREFIX =
  'Timed out waiting for post-restart recovery readiness';
const RECOVERY_READINESS_QUERY_UNAVAILABLE_ERROR_PREFIX =
  'Unable to query post-restart recovery readiness from any node';
const TRANSIENT_RECOVERY_READINESS_ERROR_PATTERNS = Object.freeze([
  /admin api query failed/i,
  /admin api query timed out/i,
  /timeout|timed out|deadline exceeded|etimedout/i,
  /authoritative control snapshot repair/i,
  /econnrefused|connection refused/i,
  /control snapshot returned no rows/i,
  /partition service not found/i,
  /no handler registered for partition service/i,
]);

const SQL_INSERT_TRANSACTION =
  'INSERT INTO ' + TABLES.SQL_TRANSACTIONS +
  ' (transaction_id, session_id, status, created_at, updated_at) ' +
  'VALUES (?, ?, ?, ?, ?)';
const SQL_SELECT_TRANSACTION_STATUSES =
  'SELECT transaction_id, status FROM ' + TABLES.SQL_TRANSACTIONS +
  ' WHERE transaction_id IN (?, ?)';
const RECOVERY_READY_REQUIRED_TABLES = Object.freeze([
  TABLES.NODES,
  TABLES.SERVICES,
  TABLES.REPLICA_OPERATIONS,
  TABLES.SQL_TRANSACTIONS,
  TABLES.SQL_TRANSACTION_PARTICIPANTS,
  TABLES.SQL_WRITE_OPERATIONS,
]);
const RECOVERY_READY_REQUIRED_PARTITIONS = Object.freeze(
  RECOVERY_READY_REQUIRED_TABLES.map((tableName) => {
    const partitionId = INITIAL_PARTITION_IDS[tableName];
    assert.ok(
      typeof partitionId === 'string' && partitionId.length > ZERO,
      'Missing initial partition id for recovery readiness table ' +
      String(tableName),
    );
    return {
      tableName,
      partitionId,
    };
  }),
);

async function waitForControlPlaneQuiescenceBestEffort(cluster, options) {
  if (typeof cluster.waitForControlPlaneQuiescence !== 'function') {
    return null;
  }
  try {
    return await cluster.waitForControlPlaneQuiescence(options);
  } catch (error) {
    return {
      warning: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizePositiveInteger(value, fallback = ZERO) {
  return Number.isFinite(value) && value > ZERO ?
    Math.floor(value) :
    fallback;
}

function resolveStatusProbeTimeoutMs(value) {
  return Math.max(
    1000,
    normalizePositiveInteger(value, STATUS_PROBE_QUERY_TIMEOUT_MS),
  );
}

function resolveNoProgressTimeoutMs(value, totalTimeoutMs, fallbackMs) {
  return Math.max(
    1000,
    Math.min(
      normalizePositiveInteger(totalTimeoutMs, fallbackMs),
      normalizePositiveInteger(value, fallbackMs),
    ),
  );
}

function resolveReplayPhaseTimeoutMs(value) {
  return Math.max(
    MIN_REPLAY_PHASE_TIMEOUT_MS,
    normalizePositiveInteger(
      value,
      RECOVERY_READINESS_NO_PROGRESS_TIMEOUT_MS,
    ),
  );
}

function isScenarioQueryableNode(node) {
  return node && (typeof node.query === 'function' ||
    typeof node.queryWithTimeout === 'function');
}

function selectScenarioWitnessNodes(nodes, options = {}) {
  const requiredNodeCount = Math.max(
    1,
    normalizePositiveInteger(
      options.requiredNodeCount,
      STATUS_WITNESS_NODE_COUNT,
    ),
  );
  const preferredNodeIds = Array.isArray(options.preferredNodeIds) ?
    options.preferredNodeIds :
    [];
  const queryableNodes = (Array.isArray(nodes) ? nodes : [])
    .filter((node) => isScenarioQueryableNode(node));
  const selected = [];
  const seen = new Set();

  for (const preferredNodeId of preferredNodeIds) {
    const normalizedNodeId = String(preferredNodeId || '');
    if (normalizedNodeId.length <= ZERO || seen.has(normalizedNodeId)) {
      continue;
    }
    const preferredNode = queryableNodes.find((node) =>
      String(node?.id || '') === normalizedNodeId,
    );
    if (!preferredNode) {
      continue;
    }
    selected.push(preferredNode);
    seen.add(normalizedNodeId);
  }

  for (const node of queryableNodes) {
    const nodeId = String(node?.id || '');
    if (nodeId.length > ZERO && seen.has(nodeId)) {
      continue;
    }
    selected.push(node);
    if (nodeId.length > ZERO) {
      seen.add(nodeId);
    }
    if (selected.length >= requiredNodeCount) {
      break;
    }
  }

  return selected.length > ZERO ? selected : queryableNodes;
}

function buildTransactionStatusProgressToken(statuses, seeded) {
  return {
    active: statuses.get(seeded.activeTransactionId) || null,
    prepared: statuses.get(seeded.preparedTransactionId) || null,
  };
}

function hasVisibleSeededTransactionStatuses(statuses, seeded) {
  return statuses instanceof Map &&
    statuses.has(seeded.activeTransactionId) &&
    statuses.has(seeded.preparedTransactionId);
}

function hasReachedTerminalReplayStatuses(statuses, seeded) {
  if (!hasVisibleSeededTransactionStatuses(statuses, seeded)) {
    return false;
  }
  return statuses.get(seeded.activeTransactionId) ===
      TERMINAL_TX_STATUS_ROLLED_BACK &&
    statuses.get(seeded.preparedTransactionId) ===
      TERMINAL_TX_STATUS_COMMITTED;
}

function buildReplayValidationProgressToken(snapshot, seeded) {
  const latestStatuses = snapshot?.statuses instanceof Map ?
    snapshot.statuses :
    new Map();
  const recoverySummary = snapshot?.recovery?.summary || null;
  const recoveryErrors = Array.isArray(snapshot?.recovery?.errors) ?
    snapshot.recovery.errors :
    [];
  return {
    active: latestStatuses.get(seeded.activeTransactionId) || null,
    prepared: latestStatuses.get(seeded.preparedTransactionId) || null,
    recoveryReady: recoverySummary?.ready === true,
    recoveryStage: String(recoverySummary?.recoveryStage || 'unknown'),
    recoveredCount: Number(recoverySummary?.recoveredCount || ZERO),
    resumedCount: Number(recoverySummary?.resumedCount || ZERO),
    failedCount: Number(recoverySummary?.failedCount || ZERO),
    missingTables: Array.isArray(recoverySummary?.missingTables) ?
      recoverySummary.missingTables :
      [],
    recoveryErrors,
  };
}

function shouldUseReplayReadyPlateauTimeout(snapshot, seeded) {
  const latestStatuses = snapshot?.statuses instanceof Map ?
    snapshot.statuses :
    new Map();
  const recoverySummary = snapshot?.recovery?.summary || null;
  return recoverySummary?.ready === true &&
    hasVisibleSeededTransactionStatuses(latestStatuses, seeded) &&
    !hasReachedTerminalReplayStatuses(latestStatuses, seeded);
}

function shouldUseReplayRecoveryGapTimeout(snapshot, seeded) {
  const latestStatuses = snapshot?.statuses instanceof Map ?
    snapshot.statuses :
    new Map();
  const recoverySummary = snapshot?.recovery?.summary || null;
  return recoverySummary !== null &&
    recoverySummary.ready !== true &&
    hasVisibleSeededTransactionStatuses(latestStatuses, seeded) &&
    !hasReachedTerminalReplayStatuses(latestStatuses, seeded);
}

/**
 * Execute one timeout-aware scenario control query.
 * @param {Object} node
 * @param {string} sql
 * @param {Array<*>} [params]
 * @return {Promise<Object>}
 */
async function executeScenarioQuery(node, sql, params = [], options = {}) {
  const timeoutMs = normalizePositiveInteger(
    options.timeoutMs,
    STATUS_WRITE_QUERY_TIMEOUT_MS,
  );
  const lane = typeof options.lane === 'string' &&
    options.lane.length > ZERO ?
    options.lane :
    STATUS_QUERY_LANE;
  if (typeof node?.queryWithTimeout === 'function') {
    return node.queryWithTimeout(
      sql,
      params,
      {
        timeoutMs,
        lane,
      },
    );
  }
  return node.query(sql, params);
}

/**
 * Query one local control snapshot for recovery gating.
 * Transaction replay state is node-local and should not depend on
 * cluster-wide authoritative repair fanout during restart recovery.
 * @param {Object} node
 * @return {Promise<Object>}
 */
async function executeRecoveryControlSnapshotQuery(node, options = {}) {
  const timeoutMs = normalizePositiveInteger(
    options.timeoutMs,
    STATUS_PROBE_QUERY_TIMEOUT_MS,
  );
  if (typeof node?.getControlSnapshot === 'function') {
    return node.getControlSnapshot({
      timeoutMs,
    });
  }
  if (typeof node?.queryWithTimeout === 'function') {
    return node.queryWithTimeout(
      NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
      [],
      {
        timeoutMs,
        lane: STATUS_SNAPSHOT_QUERY_LANE,
      },
    );
  }
  return executeScenarioQuery(
    node,
    NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
    [],
    {
      timeoutMs,
      lane: STATUS_SNAPSHOT_QUERY_LANE,
    },
  );
}

function isTransientRecoveryReadinessQueryError(error) {
  const message = String(error || '');
  return TRANSIENT_RECOVERY_READINESS_ERROR_PATTERNS.some((pattern) =>
    pattern.test(message),
  );
}

function shouldFallbackToReplayValidationAfterRecoveryReadinessFailure(error) {
  const message = String(error?.message || error || '');
  return message.includes(RECOVERY_READINESS_TIMEOUT_ERROR_PREFIX) ||
    message.includes('Post-restart recovery readiness stalled with no progress') ||
    (message.includes(RECOVERY_READINESS_QUERY_UNAVAILABLE_ERROR_PREFIX) &&
      isTransientRecoveryReadinessQueryError(message)) ||
    isTransientRecoveryReadinessQueryError(message);
}

/**
 * Pick seed node with deterministic fallback.
 * @param {Array<Object>} nodes
 * @return {Object}
 */
function getSeedNode(nodes) {
  return nodes.find((node) => node.role === 'seed') || nodes[0];
}

function getNodeById(nodes, nodeId) {
  const normalizedNodeId = String(nodeId || '');
  if (normalizedNodeId.length <= ZERO || !Array.isArray(nodes)) {
    return null;
  }
  return nodes.find((node) => String(node?.id || '') === normalizedNodeId) ||
    null;
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
async function queryTransactionStatuses(node, seeded, options = {}) {
  const queryResult = await executeScenarioQuery(
    node,
    SQL_SELECT_TRANSACTION_STATUSES,
    [seeded.activeTransactionId, seeded.preparedTransactionId],
    {
      timeoutMs: options.timeoutMs,
      lane: STATUS_QUERY_LANE,
    },
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

function countActiveNodeRows(nodeRows) {
  let activeNodeCount = ZERO;
  for (const row of nodeRows) {
    const status = String(row?.status || row?.state || '').toLowerCase();
    if (status === 'active') {
      activeNodeCount += 1;
    }
  }
  return activeNodeCount;
}

function collectVisiblePartitionIds(snapshot) {
  const partitionRows = Array.isArray(snapshot?.partitions) ?
    snapshot.partitions :
    [];
  const partitionIds = new Set();
  for (const row of partitionRows) {
    if (typeof row === 'string' && row.length > ZERO) {
      partitionIds.add(row);
      continue;
    }
    const partitionId = String(row?.partition_id || row?.partitionId || '');
    if (partitionId.length > ZERO) {
      partitionIds.add(partitionId);
      continue;
    }
    const tableName = String(row?.table_name || row?.tableName || '');
    if (tableName.length <= ZERO) {
      continue;
    }
    const initialPartitionId = INITIAL_PARTITION_IDS[tableName];
    if (typeof initialPartitionId === 'string' &&
      initialPartitionId.length > ZERO) {
      partitionIds.add(initialPartitionId);
    }
  }
  return partitionIds;
}

function buildRecoveryReadinessSummary(
  snapshot,
  seeded,
  expectedNodeCount,
  nodeId,
) {
  const nodeRows = Array.isArray(snapshot?.nodes) ? snapshot.nodes : [];
  const visiblePartitionIds = collectVisiblePartitionIds(snapshot);
  const missingTables = RECOVERY_READY_REQUIRED_PARTITIONS
    .filter(({partitionId}) => !visiblePartitionIds.has(partitionId))
    .map(({tableName}) => tableName);
  const clusterNodeCount = Number.isFinite(
    Number(snapshot?.cluster?.nodeCount),
  ) ?
    Number(snapshot.cluster.nodeCount) :
    nodeRows.length;
  const activeNodeCount = Number.isFinite(
    Number(snapshot?.cluster?.activeNodeCount),
  ) ?
    Number(snapshot.cluster.activeNodeCount) :
    countActiveNodeRows(nodeRows);
  const transactionRecovery = snapshot?.queryEngine?.transactionRecovery &&
    typeof snapshot.queryEngine.transactionRecovery === 'object' ?
    snapshot.queryEngine.transactionRecovery :
    null;
  const startupRecovery =
    snapshot?.controlPlaneDiagnostics?.startupRecovery &&
      typeof snapshot.controlPlaneDiagnostics.startupRecovery === 'object' ?
      snapshot.controlPlaneDiagnostics.startupRecovery :
      null;
  const recoveredCount = Number.isFinite(
    Number(transactionRecovery?.totalRecovered),
  ) ?
    Number(transactionRecovery.totalRecovered) :
    ZERO;
  const resumedCount = Number.isFinite(
    Number(transactionRecovery?.resumed),
  ) ?
    Number(transactionRecovery.resumed) :
    ZERO;
  const failedCount = Number.isFinite(
    Number(transactionRecovery?.failed),
  ) ?
    Number(transactionRecovery.failed) :
    ZERO;
  const requiredRecoveredCount = Array.isArray(seeded?.rows) ?
    seeded.rows.length :
    2;
  const controlPlaneRecoveryReady =
    startupRecovery === null ||
    startupRecovery.controlPlaneRecoveryReady === true;
  const ready =
    missingTables.length === ZERO &&
    transactionRecovery !== null &&
    failedCount === ZERO &&
    controlPlaneRecoveryReady &&
    recoveredCount >= requiredRecoveredCount &&
    resumedCount >= requiredRecoveredCount;

  return {
    nodeId: String(nodeId || snapshot?.nodeId || 'unknown-node'),
    clusterNodeCount,
    activeNodeCount,
    missingTables,
    recoveredCount,
    resumedCount,
    failedCount,
    transactionRecovery,
    startupRecovery,
    controlPlaneRecoveryReady,
    recoveryStage:
      typeof startupRecovery?.recoveryStage === 'string' ?
        startupRecovery.recoveryStage :
        'unknown',
    ready,
  };
}

async function queryRecoveryReadiness(
  node,
  seeded,
  expectedNodeCount,
  options = {},
) {
  if (!node || (typeof node.query !== 'function' &&
    typeof node.queryWithTimeout !== 'function' &&
    typeof node.getControlSnapshot !== 'function')) {
    return {
      summary: null,
      errors: ['recovery-node unavailable'],
    };
  }
  try {
    const result = await executeRecoveryControlSnapshotQuery(node, {
      timeoutMs: options.timeoutMs,
    });
    const rows = rowsFromResult(result);
    if (rows.length <= ZERO) {
      return {
        summary: null,
        errors: [
          String(node.id || 'unknown-node') +
          ': control snapshot returned no rows',
        ],
      };
    }
    return {
      summary: buildRecoveryReadinessSummary(
        rows[0],
        seeded,
        expectedNodeCount,
        node.id,
      ),
      errors: [],
    };
  } catch (error) {
    return {
      summary: null,
      errors: [
        String(node.id || 'unknown-node') + ': ' +
        String(error?.message || error),
      ],
    };
  }
}

async function waitForPostRestartRecoveryReadiness(node, seeded, options) {
  const timeoutMs = options.timeoutMs;
  const pollIntervalMs = options.pollIntervalMs;
  const expectedNodeCount = options.expectedNodeCount;
  const queryTimeoutMs = resolveStatusProbeTimeoutMs(options.queryTimeoutMs);
  const noProgressTimeoutMs = resolveNoProgressTimeoutMs(
    options.noProgressTimeoutMs,
    timeoutMs,
    RECOVERY_READINESS_NO_PROGRESS_TIMEOUT_MS,
  );
  const result = await waitForProgressOrStall({
    timeoutMs,
    noProgressTimeoutMs,
    pollIntervalMs,
    probe: async () => {
      return queryRecoveryReadiness(
        node,
        seeded,
        expectedNodeCount,
        {
          timeoutMs: queryTimeoutMs,
        },
      );
    },
    isSuccess: (readiness) => readiness.summary?.ready === true,
    getProgressToken: (readiness) => {
      if (!readiness.summary) {
        return {
          errors: readiness.errors,
        };
      }
      return {
        nodeId: readiness.summary.nodeId,
        clusterNodeCount: readiness.summary.clusterNodeCount,
        activeNodeCount: readiness.summary.activeNodeCount,
        missingTables: readiness.summary.missingTables,
        recoveryStage: readiness.summary.recoveryStage,
        controlPlaneRecoveryReady:
          readiness.summary.controlPlaneRecoveryReady,
        recoveredCount: readiness.summary.recoveredCount,
        resumedCount: readiness.summary.resumedCount,
        failedCount: readiness.summary.failedCount,
      };
    },
    buildError: (context) => {
      const lastSummary = context.lastSnapshot?.summary || null;
      const lastErrors = Array.isArray(context.lastSnapshot?.errors) ?
        context.lastSnapshot.errors :
        [];
      if (!lastSummary && lastErrors.length > ZERO) {
        return new Error(
          RECOVERY_READINESS_QUERY_UNAVAILABLE_ERROR_PREFIX +
          ': ' + lastErrors.join('; '),
        );
      }
      const prefix = context.reason === 'no_progress' ?
        'Post-restart recovery readiness stalled with no progress. ' :
        'Timed out waiting for post-restart recovery readiness. ';
      return new Error(
        prefix +
        'node=' + String(lastSummary?.nodeId || 'none') +
        ', clusterNodeCount=' + String(lastSummary?.clusterNodeCount || ZERO) +
        ', activeNodeCount=' + String(lastSummary?.activeNodeCount || ZERO) +
        ', missingTables=' + String(
          Array.isArray(lastSummary?.missingTables) &&
          lastSummary.missingTables.length > ZERO ?
            lastSummary.missingTables.join(',') :
            'none',
        ) +
        ', recoveryStage=' + String(lastSummary?.recoveryStage || 'unknown') +
        ', controlPlaneRecoveryReady=' +
        String(lastSummary?.controlPlaneRecoveryReady === true) +
        ', recovered=' + String(lastSummary?.recoveredCount || ZERO) +
        ', resumed=' + String(lastSummary?.resumedCount || ZERO) +
        ', failed=' + String(lastSummary?.failedCount || ZERO) +
        ', samples=' + context.sampleCount +
        ', attempts=' + context.attemptCount +
        ', noProgressMs=' + context.noProgressDurationMs +
        ', queryErrors=' + String(
          lastErrors.length > ZERO ? lastErrors.join('; ') : 'none',
        ),
      );
    },
  });

  return {
    sampleCount: result.sampleCount,
    nodeId: result.lastSnapshot?.summary?.nodeId || String(node?.id || ''),
    summary: result.lastSnapshot?.summary || null,
  };
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
async function queryTransactionStatusesAcrossNodes(nodes, seeded, options = {}) {
  const mergedStatuses = new Map();
  const errors = [];
  const queryableNodes = selectScenarioWitnessNodes(nodes, {
    preferredNodeIds: options.preferredNodeIds,
    requiredNodeCount: options.requiredNodeCount,
  });
  const results = await Promise.all(
    queryableNodes.map(async (node) => {
      const nodeId = String(node.id || 'unknown-node');
      try {
        return {
          nodeId,
          statuses: await queryTransactionStatuses(node, seeded, {
            timeoutMs: options.timeoutMs,
          }),
          error: null,
        };
      } catch (error) {
        return {
          nodeId,
          statuses: null,
          error,
        };
      }
    }),
  );
  let queriedNodeCount = 0;

  for (const result of results) {
    if (result.error === null) {
      mergeTransactionStatuses(mergedStatuses, result.statuses);
      queriedNodeCount += 1;
      continue;
    }
    errors.push(
      result.nodeId + ': ' + String(result.error?.message || result.error),
    );
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
async function waitForSeededTransactionVisibility(nodes, seeded, options = {}) {
  const timeoutMs = normalizePositiveInteger(
    options.timeoutMs,
    SEEDED_VISIBILITY_TIMEOUT_MS,
  );
  const pollIntervalMs = normalizePositiveInteger(
    options.pollIntervalMs,
    SEEDED_VISIBILITY_POLL_INTERVAL_MS,
  );
  const queryTimeoutMs = resolveStatusProbeTimeoutMs(options.queryTimeoutMs);
  const noProgressTimeoutMs = resolveNoProgressTimeoutMs(
    options.noProgressTimeoutMs,
    timeoutMs,
    SEEDED_VISIBILITY_NO_PROGRESS_TIMEOUT_MS,
  );
  const witnessNodes = selectScenarioWitnessNodes(nodes, {
    preferredNodeIds: [options.preferredNodeId],
    requiredNodeCount: options.requiredNodeCount,
  });
  const result = await waitForProgressOrStall({
    timeoutMs,
    noProgressTimeoutMs,
    pollIntervalMs,
    probe: async () => {
      return queryTransactionStatusesAcrossNodes(witnessNodes, seeded, {
        timeoutMs: queryTimeoutMs,
        preferredNodeIds: [options.preferredNodeId],
        requiredNodeCount: witnessNodes.length,
      });
    },
    isSuccess: (latestStatuses) =>
      latestStatuses.has(seeded.activeTransactionId) &&
      latestStatuses.has(seeded.preparedTransactionId),
    getProgressToken: (latestStatuses) =>
      buildTransactionStatusProgressToken(latestStatuses, seeded),
    buildError: (context) => {
      const latestStatuses = context.lastSnapshot || new Map();
      const noProgressPrefix =
        typeof options.noProgressErrorPrefix === 'string' &&
          options.noProgressErrorPrefix.length > ZERO ?
          options.noProgressErrorPrefix :
          'Seeded transaction visibility stalled with no progress before restart. ';
      const timeoutPrefix =
        typeof options.timeoutErrorPrefix === 'string' &&
          options.timeoutErrorPrefix.length > ZERO ?
          options.timeoutErrorPrefix :
          'Timed out waiting for seeded transaction rows to become visible before restart. ';
      const prefix = context.reason === 'no_progress' ?
        noProgressPrefix :
        timeoutPrefix;
      return new Error(
        prefix +
        seeded.activeTransactionId + '=' +
        String(latestStatuses.get(seeded.activeTransactionId) || null) + ', ' +
        seeded.preparedTransactionId + '=' +
        String(latestStatuses.get(seeded.preparedTransactionId) || null) +
        ', samples=' + context.sampleCount +
        ', attempts=' + context.attemptCount +
        ', witnessNodeIds=' + witnessNodes.map((node) => String(node?.id || ''))
          .join(',') +
        ', noProgressMs=' + context.noProgressDurationMs,
      );
    },
  });

  return {
    attemptCount: result.attemptCount,
    sampleCount: result.sampleCount,
    transientQueryErrors: result.transientProbeErrors,
    witnessNodeIds: witnessNodes.map((node) => String(node?.id || '')),
    statuses: {
      [seeded.activeTransactionId]:
        result.lastSnapshot.get(seeded.activeTransactionId) || null,
      [seeded.preparedTransactionId]:
        result.lastSnapshot.get(seeded.preparedTransactionId) || null,
    },
  };
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
  const expectedNodeCount = normalizePositiveInteger(
    options.expectedNodeCount,
    Array.isArray(nodes) ? nodes.length : ZERO,
  );
  const queryTimeoutMs = resolveStatusProbeTimeoutMs(options.queryTimeoutMs);
  const noProgressTimeoutMs = resolveNoProgressTimeoutMs(
    options.noProgressTimeoutMs,
    timeoutMs,
    REPLAY_TERMINAL_NO_PROGRESS_TIMEOUT_MS,
  );
  const replayReadyNoProgressTimeoutMs = resolveNoProgressTimeoutMs(
    options.replayReadyNoProgressTimeoutMs,
    noProgressTimeoutMs,
    Math.min(
      noProgressTimeoutMs,
      REPLAY_READY_PLATEAU_NO_PROGRESS_TIMEOUT_MS,
    ),
  );
  const replayRecoveryGapNoProgressTimeoutMs = resolveNoProgressTimeoutMs(
    options.replayRecoveryGapNoProgressTimeoutMs,
    noProgressTimeoutMs,
    Math.min(
      noProgressTimeoutMs,
      REPLAY_RECOVERY_GAP_NO_PROGRESS_TIMEOUT_MS,
    ),
  );
  const witnessNodes = selectScenarioWitnessNodes(nodes, {
    preferredNodeIds: [options.preferredNodeId],
    requiredNodeCount: options.requiredNodeCount,
  });
  const recoveryNode =
    getNodeById(nodes, options.preferredNodeId) ||
    witnessNodes[ZERO] ||
    nodes[ZERO] ||
    null;
  const result = await waitForProgressOrStall({
    timeoutMs,
    noProgressTimeoutMs,
    pollIntervalMs,
    probe: async () => {
      const [statuses, recovery] = await Promise.all([
        queryTransactionStatusesAcrossNodes(witnessNodes, seeded, {
          timeoutMs: queryTimeoutMs,
          preferredNodeIds: [options.preferredNodeId],
          requiredNodeCount: witnessNodes.length,
        }),
        queryRecoveryReadiness(
          recoveryNode,
          seeded,
          expectedNodeCount,
          {
            timeoutMs: queryTimeoutMs,
          },
        ),
      ]);
      return {
        statuses,
        recovery,
      };
    },
    isRetryableError: () => true,
    isSuccess: (snapshot) => {
      const latestStatuses = snapshot?.statuses instanceof Map ?
        snapshot.statuses :
        new Map();
      return hasReachedTerminalReplayStatuses(latestStatuses, seeded);
    },
    getProgressToken: (snapshot) =>
      buildReplayValidationProgressToken(snapshot, seeded),
    getNoProgressTimeoutMs: (context) => {
      if (shouldUseReplayReadyPlateauTimeout(context.lastSnapshot, seeded)) {
        return replayReadyNoProgressTimeoutMs;
      }
      if (shouldUseReplayRecoveryGapTimeout(context.lastSnapshot, seeded)) {
        return replayRecoveryGapNoProgressTimeoutMs;
      }
      return noProgressTimeoutMs;
    },
    buildError: (context) => {
      const latestStatuses = context.lastSnapshot?.statuses instanceof Map ?
        context.lastSnapshot.statuses :
        new Map();
      const recoverySummary = context.lastSnapshot?.recovery?.summary || null;
      const recoveryErrors = Array.isArray(context.lastSnapshot?.recovery?.errors) ?
        context.lastSnapshot.recovery.errors :
        [];
      const activeStatus =
        latestStatuses.get(seeded.activeTransactionId) || null;
      const preparedStatus =
        latestStatuses.get(seeded.preparedTransactionId) || null;
      let prefix =
        'Timed out waiting for replayed terminal transaction states after restart. ';
      if (context.reason === 'no_progress') {
        prefix = shouldUseReplayReadyPlateauTimeout(
          context.lastSnapshot,
          seeded,
        ) ?
          'Replayed terminal transaction states stalled after recovery became ready. ' :
          (shouldUseReplayRecoveryGapTimeout(context.lastSnapshot, seeded) ?
            'Replayed terminal transaction states stalled before recovery became ready. ' :
            'Replayed terminal transaction states stalled with no progress after restart. ');
      }
      return new Error(
        prefix +
        seeded.activeTransactionId + '=' + String(activeStatus) + ', ' +
        seeded.preparedTransactionId + '=' + String(preparedStatus) +
        ', expected ' + TERMINAL_TX_STATUS_ROLLED_BACK + ' and ' +
        TERMINAL_TX_STATUS_COMMITTED + ', samples=' + context.sampleCount +
        ', attempts=' + context.attemptCount +
        ', transientQueryErrors=' + context.transientProbeErrors +
        ', witnessNodeIds=' +
        witnessNodes.map((node) => String(node?.id || '')).join(',') +
        ', lastQueryError=' + String(
          context.lastError?.message || context.lastError || 'none',
        ) +
        ', recoveryReady=' + String(recoverySummary?.ready === true) +
        ', recoveryStage=' + String(recoverySummary?.recoveryStage || 'unknown') +
        ', recovered=' + String(recoverySummary?.recoveredCount || ZERO) +
        ', resumed=' + String(recoverySummary?.resumedCount || ZERO) +
        ', failed=' + String(recoverySummary?.failedCount || ZERO) +
        ', missingTables=' + String(
          Array.isArray(recoverySummary?.missingTables) &&
          recoverySummary.missingTables.length > ZERO ?
            recoverySummary.missingTables.join(',') :
            'none',
        ) +
        ', recoveryErrors=' + String(
          recoveryErrors.length > ZERO ? recoveryErrors.join('; ') : 'none',
        ) +
        ', noProgressBudgetMs=' + context.noProgressTimeoutMs +
        ', noProgressMs=' + context.noProgressDurationMs,
      );
    },
  });

  const activeStatus =
    result.lastSnapshot?.statuses?.get(seeded.activeTransactionId) || null;
  const preparedStatus =
    result.lastSnapshot?.statuses?.get(seeded.preparedTransactionId) || null;
  return {
    sampleCount: result.sampleCount,
    attemptCount: result.attemptCount,
    transientQueryErrors: result.transientProbeErrors,
    witnessNodeIds: witnessNodes.map((node) => String(node?.id || '')),
    statuses: {
      [seeded.activeTransactionId]: activeStatus,
      [seeded.preparedTransactionId]: preparedStatus,
    },
    recoverySummary: result.lastSnapshot?.recovery?.summary || null,
    recoveryErrors: Array.isArray(result.lastSnapshot?.recovery?.errors) ?
      result.lastSnapshot.recovery.errors :
      [],
  };
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
    workloadProfile,
    loadOperations,
    tableName,
    minAdditionalPartitions,
    minDistinctReplicaNodes,
    distributionTimeoutMs,
    distributionPollIntervalMs,
    preRestartDelayMs,
    convergenceTimeoutMs,
    controlPlaneQuiescenceNoProgressTimeoutMs,
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
    settleTimeoutMs: convergenceTimeoutMs,
    quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
    targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
  });
  const initialQuiescence = await waitForControlPlaneQuiescenceBestEffort(
    cluster,
    {
      timeoutMs: convergenceTimeoutMs,
      noProgressTimeoutMs: controlPlaneQuiescenceNoProgressTimeoutMs,
    },
  );

  const tablePreparation = await prepareBenchmarkPartitioningTable(
    seedNode,
    {
      tableName: effectiveTableName,
      queryNodes: nodes,
    },
  );
  assertSplitPolicyPrecondition(tablePreparation, {
    scenarioName: 'seven-node-read-write-load-transaction-recovery',
  });
  const loadNodePlan = await createPartitioningBenchmarkLoadNodePlan(
    seedNode,
    cluster,
    {
      tableName: effectiveTableName,
      tableId: tablePreparation.tableId,
      requiredNodeCount: minDistinctReplicaNodes,
      timeoutMs: Math.max(
        distributionTimeoutMs,
        convergenceTimeoutMs,
        transactionReplayTimeoutMs,
      ),
      queryNodes: nodes,
    },
  );
  const effectiveLoadOpsPerSec = resolvePartitioningBenchmarkLoadOpsPerSec(
    loadOpsPerSec,
    loadNodePlan.initialNodes.length,
    nodes.length,
  );
  const replayProbeTimeoutMs = resolveStatusProbeTimeoutMs(
    options.replayProbeTimeoutMs,
  );
  const seededVisibilityNoProgressTimeoutMs = resolveNoProgressTimeoutMs(
    options.seededVisibilityNoProgressTimeoutMs,
    SEEDED_VISIBILITY_TIMEOUT_MS,
    SEEDED_VISIBILITY_NO_PROGRESS_TIMEOUT_MS,
  );
  const replayPhaseTimeoutMs = resolveReplayPhaseTimeoutMs(
    transactionReplayTimeoutMs,
  );
  const recoveryReadinessNoProgressTimeoutMs = resolveNoProgressTimeoutMs(
    options.recoveryReadinessNoProgressTimeoutMs,
    replayPhaseTimeoutMs,
    Math.max(
      controlPlaneQuiescenceNoProgressTimeoutMs || ZERO,
      RECOVERY_READINESS_NO_PROGRESS_TIMEOUT_MS,
    ),
  );
  const transactionReplayNoProgressTimeoutMs = resolveNoProgressTimeoutMs(
    options.transactionReplayNoProgressTimeoutMs,
    replayPhaseTimeoutMs,
    Math.max(
      controlPlaneQuiescenceNoProgressTimeoutMs || ZERO,
      REPLAY_TERMINAL_NO_PROGRESS_TIMEOUT_MS,
    ),
  );
  const replayRecoveryGapNoProgressTimeoutMs = resolveNoProgressTimeoutMs(
    options.replayRecoveryGapNoProgressTimeoutMs,
    transactionReplayNoProgressTimeoutMs,
    Math.min(
      transactionReplayNoProgressTimeoutMs,
      REPLAY_RECOVERY_GAP_NO_PROGRESS_TIMEOUT_MS,
    ),
  );
  const replayReadyNoProgressTimeoutMs = resolveNoProgressTimeoutMs(
    options.replayReadyNoProgressTimeoutMs,
    transactionReplayNoProgressTimeoutMs,
    Math.min(
      transactionReplayNoProgressTimeoutMs,
      REPLAY_READY_PLATEAU_NO_PROGRESS_TIMEOUT_MS,
    ),
  );
  const postRestartSeededVisibilityNoProgressTimeoutMs = resolveNoProgressTimeoutMs(
    options.postRestartSeededVisibilityNoProgressTimeoutMs,
    replayPhaseTimeoutMs,
    Math.max(
      SEEDED_VISIBILITY_NO_PROGRESS_TIMEOUT_MS,
      Math.min(
        transactionReplayNoProgressTimeoutMs,
        POST_RESTART_SEEDED_VISIBILITY_NO_PROGRESS_TIMEOUT_MS,
      ),
    ),
  );
  const loadPhaseNoProgressTimeoutMs = resolveNoProgressTimeoutMs(
    options.loadPhaseNoProgressTimeoutMs,
    distributionTimeoutMs,
    Math.max(
      controlPlaneQuiescenceNoProgressTimeoutMs || ZERO,
      LOAD_PHASE_NO_PROGRESS_TIMEOUT_MS,
    ),
  );
  const loadPhasePollIntervalMs = Math.max(
    1,
    normalizePositiveInteger(
      options.loadPhasePollIntervalMs,
      LOAD_PHASE_POLL_INTERVAL_MS,
    ),
  );
  const replayWitnessNodeCount = Math.max(
    1,
    normalizePositiveInteger(
      options.replayWitnessNodeCount,
      STATUS_WITNESS_NODE_COUNT,
    ),
  );

  const loadRun = cluster.startLoad({
    nodes: loadNodePlan.initialNodes,
    nodeResolver: loadNodePlan.nodeResolver,
    opsPerSec: effectiveLoadOpsPerSec,
    duration: loadDuration,
    adaptiveDispatchGuardrail: createPartitioningAdaptiveDispatchGuardrail(),
    operations: loadOperations,
    tableName: effectiveTableName,
    workloadProfile,
  });
  let distribution = null;
  let seededTransactions = null;
  let seededVisibility = null;
  let convergenceAfterRestart = null;
  let recoveryReadiness = null;
  let postRestartSeededVisibility = null;
  let replayValidation = null;
  let replayValidationNodes = nodes;
  let replayValidationSeedNode = seedNode;
  const convergenceWarnings = [];
  const quiescenceWarnings = [];
  let partitioningWarning = null;
  let metrics = null;
  if (initialQuiescence?.warning) {
    quiescenceWarnings.push(initialQuiescence.warning);
  }
  try {
    try {
      distribution = await waitForPartitionGrowthAndSpread(seedNode, {
        tableName: effectiveTableName,
        timeoutMs: distributionTimeoutMs,
        pollIntervalMs: distributionPollIntervalMs,
        minAdditionalPartitions,
        minDistinctReplicaNodes,
        queryNodes: nodes,
        plannerDiagnosticsResolver: loadNodePlan.getDiagnostics,
        loadProgress: {
          getMetrics: () =>
            typeof loadRun.getMetrics === 'function' ?
              loadRun.getMetrics() :
              null,
          noProgressTimeoutMs: loadPhaseNoProgressTimeoutMs,
          pollIntervalMs: loadPhasePollIntervalMs,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('No partitions found for table')) {
        partitioningWarning = message;
      } else {
        throw error;
      }
    }

    await sleep(preRestartDelayMs);
    if (typeof loadRun.cancel === 'function') {
      loadRun.cancel();
    }
    metrics = await loadRun.waitComplete();
    const postLoadQuiescence = await waitForControlPlaneQuiescenceBestEffort(
      cluster,
      {
        timeoutMs: convergenceTimeoutMs,
        noProgressTimeoutMs: controlPlaneQuiescenceNoProgressTimeoutMs,
      },
    );
    if (postLoadQuiescence?.warning) {
      quiescenceWarnings.push(postLoadQuiescence.warning);
    }
    seededTransactions = buildSyntheticTransactions(Date.now());
    await seedSyntheticTransactions(seedNode, seededTransactions);
    seededVisibility = await waitForSeededTransactionVisibility(
      nodes,
      seededTransactions,
      {
        preferredNodeId: seedNode.id,
        queryTimeoutMs: replayProbeTimeoutMs,
        noProgressTimeoutMs: seededVisibilityNoProgressTimeoutMs,
        requiredNodeCount: replayWitnessNodeCount,
      },
    );

    await cluster.restartNode(seedNode.id);

    try {
      convergenceAfterRestart = await cluster.waitForConvergence({
        settleTimeoutMs: convergenceTimeoutMs,
        quietWindowMs: CONVERGENCE_DEFAULTS.quietWindowMs,
        targetVoterCount: CONVERGENCE_DEFAULTS.targetVoterCount,
      });
      if (Number.isFinite(convergenceAfterRestart?.settledAfterMs) &&
        convergenceAfterRestart.settledAfterMs > convergenceTimeoutMs) {
        convergenceWarnings.push(
          'Cluster did not converge after recovery-replay restart: ' +
          convergenceAfterRestart.settledAfterMs + 'ms',
        );
      }
    } catch (error) {
      convergenceAfterRestart = null;
      convergenceWarnings.push(
        error instanceof Error ? error.message : String(error),
      );
    }
    const postRestartQuiescence =
      await waitForControlPlaneQuiescenceBestEffort(cluster, {
        timeoutMs: convergenceTimeoutMs,
        noProgressTimeoutMs: controlPlaneQuiescenceNoProgressTimeoutMs,
      });
    if (postRestartQuiescence?.warning) {
      quiescenceWarnings.push(postRestartQuiescence.warning);
    }

    replayValidationNodes = cluster.getNodes();
    replayValidationSeedNode =
      getNodeById(replayValidationNodes, seedNode.id) || seedNode;
    try {
      recoveryReadiness = await waitForPostRestartRecoveryReadiness(
        replayValidationSeedNode,
        seededTransactions,
        {
          expectedNodeCount,
          timeoutMs: replayPhaseTimeoutMs,
          pollIntervalMs: transactionReplayPollIntervalMs,
          queryTimeoutMs: replayProbeTimeoutMs,
          noProgressTimeoutMs: recoveryReadinessNoProgressTimeoutMs,
        },
      );
    } catch (error) {
      if (!shouldFallbackToReplayValidationAfterRecoveryReadinessFailure(error)) {
        throw error;
      }
      recoveryReadiness = {
        nodeId: String(replayValidationSeedNode?.id || seedNode.id),
        sampleCount: ZERO,
        summary: null,
        deferredToReplayValidation: true,
        warning: String(error?.message || error),
      };
    }

    postRestartSeededVisibility = await waitForSeededTransactionVisibility(
      replayValidationNodes,
      seededTransactions,
      {
        timeoutMs: replayPhaseTimeoutMs,
        pollIntervalMs: transactionReplayPollIntervalMs,
        queryTimeoutMs: replayProbeTimeoutMs,
        noProgressTimeoutMs: postRestartSeededVisibilityNoProgressTimeoutMs,
        preferredNodeId: replayValidationSeedNode?.id || seedNode.id,
        requiredNodeCount: replayWitnessNodeCount,
        noProgressErrorPrefix:
          'Seeded transaction visibility stalled with no progress after restart. ',
        timeoutErrorPrefix:
          'Timed out waiting for seeded transaction rows to become visible after restart. ',
      },
    );

    replayValidation = await waitForReplayTerminalStatuses(
      replayValidationNodes,
      seededTransactions,
      {
        timeoutMs: replayPhaseTimeoutMs,
        pollIntervalMs: transactionReplayPollIntervalMs,
        queryTimeoutMs: replayProbeTimeoutMs,
        noProgressTimeoutMs: transactionReplayNoProgressTimeoutMs,
        replayRecoveryGapNoProgressTimeoutMs,
        replayReadyNoProgressTimeoutMs,
        preferredNodeId: replayValidationSeedNode?.id || seedNode.id,
        requiredNodeCount: replayWitnessNodeCount,
        expectedNodeCount,
      },
    );
    const postRestartTransientQueryErrors = Number.isFinite(
      postRestartSeededVisibility?.transientQueryErrors,
    ) ?
      postRestartSeededVisibility.transientQueryErrors :
      ZERO;
    if (postRestartTransientQueryErrors > ZERO) {
      replayValidation = {
        ...replayValidation,
        transientQueryErrors:
          Math.max(
            ZERO,
            Number(replayValidation?.transientQueryErrors || ZERO),
          ) + postRestartTransientQueryErrors,
      };
    }
  } finally {
    if (typeof loadRun.cancel === 'function') {
      loadRun.cancel();
    }
    if (typeof loadNodePlan.stop === 'function') {
      loadNodePlan.stop();
    }
  }

  if (metrics === null) {
    metrics = await loadRun.waitComplete();
  }
  assert.ok(metrics.total > ZERO, 'Expected at least one mixed load operation');

  const successRate = metrics.total > ZERO ?
    metrics.success / metrics.total :
    ZERO;
  assert.ok(
    successRate >= minSuccessRate,
    'Mixed load success rate below threshold during recovery replay: ' +
    successRate.toFixed(3) + ' (expected >= ' + minSuccessRate + ')',
  );

  await waitForPostSplitConsistencyConvergence(cluster);

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
    recoveryReadiness,
    postRestartSeededVisibility,
    replayValidation,
    convergenceWarnings,
    quiescenceWarnings,
    partitioningWarning,
    loadMetrics: metrics,
    successRate,
  };
}

export {run};
