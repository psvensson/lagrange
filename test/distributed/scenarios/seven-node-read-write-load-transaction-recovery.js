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
  TIMEOUTS,
} from '../harness/constants.js';
import {
  resolveSevenNodeReadWriteLoadTransactionRecoveryScenarioConfig,
} from '../harness/scenario-config.js';
import {
  BENCHMARK_WORKLOAD_PROFILE,
  createPartitioningAdaptiveDispatchGuardrail,
  createPartitioningBenchmarkLoadNodePlan,
  prepareBenchmarkPartitioningTable,
  assertSplitPolicyPrecondition,
  resolvePartitioningBenchmarkLoadOpsPerSec,
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
const STATUS_SNAPSHOT_QUERY_LANE = 'snapshot';
const SEEDED_VISIBILITY_TIMEOUT_MS = 15000;
const SEEDED_VISIBILITY_POLL_INTERVAL_MS = 250;
const RECOVERY_READINESS_TIMEOUT_ERROR_PREFIX =
  'Timed out waiting for post-restart recovery readiness';
const TRANSIENT_RECOVERY_READINESS_ERROR_PATTERNS = Object.freeze([
  /admin api query failed/i,
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
 * Query one local control snapshot for recovery gating.
 * Transaction replay state is node-local and should not depend on
 * cluster-wide authoritative repair fanout during restart recovery.
 * @param {Object} node
 * @return {Promise<Object>}
 */
async function executeRecoveryControlSnapshotQuery(node) {
  if (typeof node?.getControlSnapshot === 'function') {
    return node.getControlSnapshot({
      timeoutMs: STATUS_QUERY_TIMEOUT_MS,
    });
  }
  if (typeof node?.queryWithTimeout === 'function') {
    return node.queryWithTimeout(
      NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
      [],
      {
        timeoutMs: STATUS_QUERY_TIMEOUT_MS,
        lane: STATUS_SNAPSHOT_QUERY_LANE,
      },
    );
  }
  return executeScenarioQuery(
    node,
    NODE_CLIENT_CONTROL_SNAPSHOT_SQL,
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
    const result = await executeRecoveryControlSnapshotQuery(node);
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
  const deadline = Date.now() + timeoutMs;
  let sampleCount = ZERO;
  let lastSummary = null;
  let lastErrors = [];

  while (Date.now() <= deadline) {
    sampleCount += 1;
    const readiness = await queryRecoveryReadiness(
      node,
      seeded,
      expectedNodeCount,
    );
    if (readiness.summary) {
      lastSummary = readiness.summary;
    }
    lastErrors = readiness.errors;
    if (readiness.summary?.ready) {
      return {
        sampleCount,
        nodeId: readiness.summary.nodeId,
        summary: readiness.summary,
      };
    }
    if (!readiness.summary &&
      lastErrors.length > ZERO &&
      lastErrors.some((error) =>
        !isTransientRecoveryReadinessQueryError(error),
      )) {
      throw new Error(
        'Unable to query post-restart recovery readiness from any node' +
        ': ' + lastErrors.join('; '),
      );
    }
    if (Date.now() >= deadline) {
      break;
    }
    await sleep(pollIntervalMs);
  }

  throw new Error(
    'Timed out waiting for post-restart recovery readiness. ' +
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
    ', samples=' + sampleCount +
    ', queryErrors=' + String(
      lastErrors.length > ZERO ? lastErrors.join('; ') : 'none',
    ),
  );
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
  let loadNodePlan;
  let loadNodeAdmissionFallback = null;
  try {
    loadNodePlan = await createPartitioningBenchmarkLoadNodePlan(
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
    if (loadNodePlan?.admissionFallbackWarning) {
      loadNodeAdmissionFallback = {
        warning: loadNodePlan.admissionFallbackWarning,
      };
    }
  } catch (error) {
    loadNodeAdmissionFallback = {
      warning: error instanceof Error ? error.message : String(error),
    };
    loadNodePlan = {
      initialNodes: [seedNode],
      nodeResolver: () => [seedNode],
      stop: () => {},
      bootstrapRequiredNodeCount: 1,
      targetNodeCount: 1,
    };
  }
  const effectiveLoadOpsPerSec = resolvePartitioningBenchmarkLoadOpsPerSec(
    loadOpsPerSec,
    loadNodePlan.initialNodes.length,
    nodes.length,
  );

  const loadRun = cluster.startLoad({
    nodes: loadNodePlan.initialNodes,
    nodeResolver: loadNodePlan.nodeResolver,
    opsPerSec: effectiveLoadOpsPerSec,
    duration: loadDuration,
    adaptiveDispatchGuardrail: createPartitioningAdaptiveDispatchGuardrail(),
    operations: loadOperations,
    tableName: effectiveTableName,
    workloadProfile: BENCHMARK_WORKLOAD_PROFILE,
  });

  let distribution = null;
  let seededTransactions = null;
  let seededVisibility = null;
  let convergenceAfterRestart = null;
  let recoveryReadiness = null;
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
          timeoutMs: Math.max(
            convergenceTimeoutMs,
            transactionReplayTimeoutMs,
          ),
          pollIntervalMs: transactionReplayPollIntervalMs,
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

    replayValidation = await waitForReplayTerminalStatuses(
      replayValidationNodes,
      seededTransactions,
      {
        timeoutMs: Math.max(
          transactionReplayTimeoutMs,
          convergenceTimeoutMs,
        ),
        pollIntervalMs: transactionReplayPollIntervalMs,
      },
    );
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

  await cluster.waitForConsistencyConvergence({
    timeoutMs: TIMEOUTS.CONSISTENCY_CONVERGENCE_POST_SPLIT,
  });

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
    replayValidation,
    convergenceWarnings,
    quiescenceWarnings,
    partitioningWarning,
    loadNodeAdmissionFallback,
    loadMetrics: metrics,
    successRate,
  };
}

export {run};
