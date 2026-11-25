import {POSTGRES_BASELINE_COMPARISON_CONSTANTS_AND_IMPORTS_BUNDLE} from './postgres-baseline-comparison-constants-and-imports.js';
import {
  normalizeNonNegativeInteger,
  resolveControlSnapshotCandidates,
} from './postgres-baseline-comparison-admission-runtime-helpers.js';
import {rowsFromQueryResult} from './postgres-baseline-comparison-query-helpers.js';
import {
  BENCHMARK_SQL_DIALECT,
  buildBenchmarkSemanticReceipt,
  verifyBenchmarkAcknowledgedWrites,
} from '../harness/benchmark-workload-semantics.js';
import {
  BENCHMARK_SEMANTIC_PARITY_FAILED_PREFIX,
  BENCHMARK_PUBLICATION_REASON,
  BENCHMARK_SEMANTIC_RUNTIME_RECEIPT_MISSING,
  BENCHMARK_SEMANTIC_STATUS,
} from '../harness/benchmark-workload-semantics-constants.js';

const {
  BENCHMARK_DEFAULTS,
  BASELINE_LOAD_NODE_PREFIX,
  BENCHMARK_METADATA_FLOW_SCHEMA_VERSION,
  BENCHMARK_METADATA_STAGE_CREATE_ERROR,
  BENCHMARK_TABLE_CREATE_LARGE_CLUSTER_RETRY_TIMEOUT_MS,
  BENCHMARK_TABLE_CREATE_OUTCOME_FAILED,
  BENCHMARK_TABLE_CREATE_OUTCOME_SUCCEEDED,
  BENCHMARK_WORKLOAD_OPERATIONS,
  BENCHMARK_WORKLOAD_PROFILE,
  LOAD_BREAKER_OWNER_NODE_CLIENT,
  LOAD_PROGRESS_HEARTBEAT_INTERVAL_MS,
  NODE_CLIENT_TRANSIENT_CONTEXT,
  ONE,
  Pool,
  PREFLIGHT_CONVERGENCE_LARGE_CLUSTER_NODE_THRESHOLD,
  SYSTEM_TABLE_READ_PATH_MODE_CANONICAL,
  LoadGenerator,
  ZERO,
  buildBenchmarkPartitionLookupByTableIdSql,
  buildBenchmarkTableCreateNodeClientContext,
  buildBenchmarkTableDdl,
  buildBenchmarkTableLookupSql,
  collectBenchmarkMetadataSnapshot,
  extractRequiredSchemaVersionFromRows,
  firstStringField,
  resolveScenarioTiming,
} = POSTGRES_BASELINE_COMPARISON_CONSTANTS_AND_IMPORTS_BUNDLE;
const BENCHMARK_TABLE_POLICY_OWNER_NOT_READY = 'admin_owner_not_ready';
const BENCHMARK_PARTITION_TABLE_NAME_MISSING = 'partition_table_name_missing';

function buildBenchmarkMetadataFlow(state, tableName) {
  return {
    schemaVersion: BENCHMARK_METADATA_FLOW_SCHEMA_VERSION,
    tableName,
    tableId: state.requiredSchemaTableId,
    requiredSchemaVersion: state.requiredSchemaVersion,
    createCommitted: state.benchmarkMetadataFlow.createCommitted,
    createAttempt: state.benchmarkMetadataFlow.createAttempt,
    nodeSnapshots: {
      ...state.benchmarkMetadataFlow.nodeSnapshots,
    },
  };
}

function normalizePositiveIntegerOrNull(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  const normalizedValue = Math.floor(value);
  if (normalizedValue <= ZERO) {
    return null;
  }
  return normalizedValue;
}

function isBenchmarkTableCreateTimeoutError(error) {
  if (
    typeof error?.timeoutClass === 'string' &&
    error.timeoutClass.toLowerCase() === 'timeout'
  ) {
    return true;
  }
  if (
    typeof error?.code === 'string' &&
    error.code.toLowerCase() === 'etimedout'
  ) {
    return true;
  }
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('timed out') || message.includes('deadline exceeded');
}

const RETRIABLE_BENCHMARK_TABLE_TIMEOUT_FRAGMENTS = Object.freeze([
  'timed out waiting for partition leader service',
  'timed out waiting for routable partition service',
  'admin api query timed out for node',
  'timed out waiting for partition service metadata',
]);

const RETRIABLE_BENCHMARK_TABLE_PROGRESS_FRAGMENTS = Object.freeze([
  'unable to satisfy minimum routable provisioning cohort',
  'control_plane_write_unhealthy',
  'cluster_member_unhealthy',
  'distributed operation failed due to participant failures',
  'cannot start a transaction within a transaction',
  'cannot commit - no transaction is active',
  'transaction already active on this partition',
  'no active service found for partition',
  'no partitions available for table',
  'connect econnrefused',
  'connection refused',
  BENCHMARK_TABLE_POLICY_OWNER_NOT_READY,
]);

function isRetriableBenchmarkTableProgressError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  if (isBenchmarkTableCreateTimeoutError(error)) {
    return RETRIABLE_BENCHMARK_TABLE_TIMEOUT_FRAGMENTS.some((fragment) =>
      message.includes(fragment),
    );
  }
  if (!message) {
    return false;
  }
  if (message.includes('table') && message.includes('not found')) {
    return true;
  }
  return RETRIABLE_BENCHMARK_TABLE_PROGRESS_FRAGMENTS.some((fragment) =>
    message.includes(fragment),
  );
}

function hasNonEmptyPartitionIds(partitionIds) {
  return (
    Array.isArray(partitionIds) &&
    partitionIds.some(
      (partitionId) =>
        typeof partitionId === 'string' && partitionId.length > ZERO,
    )
  );
}

function hasPositiveRowCount(section) {
  return Number(section?.rowCount || ZERO) > ZERO;
}

function hasPartitionMetadataProgress(partitionsSection) {
  if (!partitionsSection || typeof partitionsSection !== 'object') {
    return false;
  }
  return (
    hasPositiveRowCount(partitionsSection) ||
    hasNonEmptyPartitionIds(partitionsSection.partitionIds)
  );
}

function hasBenchmarkTableBootstrapProgress(metadataSnapshot) {
  if (!metadataSnapshot || typeof metadataSnapshot !== 'object') {
    return false;
  }
  const hasTableProgress =
    hasPositiveRowCount(metadataSnapshot.tables) ||
    String(metadataSnapshot.tableId || '').trim().length > ZERO;
  return (
    hasTableProgress &&
    hasPartitionMetadataProgress(metadataSnapshot.partitions)
  );
}

async function buildBenchmarkTableFailureAttempt({
  createAttempt,
  nodeClient,
  canonicalWriteNode,
  tableName,
  error,
}) {
  const metadataSnapshot = await collectBenchmarkMetadataSnapshot({
    nodeClient,
    node: canonicalWriteNode,
    tableName,
    tableId: null,
    requiredSchemaVersion: null,
    stage: BENCHMARK_METADATA_STAGE_CREATE_ERROR,
    readinessState: null,
    probeError: String(error?.message || error),
  });
  return {
    ...finalizeBenchmarkTableCreateAttempt(
      createAttempt,
      BENCHMARK_TABLE_CREATE_OUTCOME_FAILED,
      error,
    ),
    metadataSnapshot,
  };
}

async function refreshBenchmarkTableCreateReadModel(
  nodeClient,
  canonicalWriteNode,
) {
  if (
    !nodeClient ||
    typeof nodeClient.fetchPreflightCriticalPathSnapshot !== 'function'
  ) {
    return null;
  }
  try {
    return await nodeClient.fetchPreflightCriticalPathSnapshot(
      canonicalWriteNode,
      NODE_CLIENT_TRANSIENT_CONTEXT,
    );
  } catch (_error) {
    return null;
  }
}

function createBenchmarkTableCreateAttempt(
  tableName,
  writeNodeId,
  context = {},
) {
  const outerTimeoutMs = normalizePositiveIntegerOrNull(context.timeoutMs);
  const innerTimeoutMs = normalizePositiveIntegerOrNull(context.innerTimeoutMs);
  return {
    tableName,
    writeNodeId: String(writeNodeId || ''),
    outerTimeoutMs,
    innerTimeoutMs,
    timeoutBudgetMismatch:
      Number.isInteger(outerTimeoutMs) &&
      Number.isInteger(innerTimeoutMs) &&
      outerTimeoutMs !== innerTimeoutMs,
    outcome: null,
    isTimeout: false,
    error: null,
    errorCode: null,
    timeoutClass: null,
    timeoutClassification: null,
    startedAt: Date.now(),
    completedAt: null,
    durationMs: null,
    metadataSnapshot: null,
  };
}

function normalizeStringOrNull(value) {
  return typeof value === 'string' ? value : null;
}

function normalizeObjectOrNull(value) {
  return value && typeof value === 'object' ? value : null;
}

function finalizeBenchmarkTableCreateAttempt(
  createAttempt,
  outcome,
  error = null,
) {
  const completedAt = Date.now();
  return {
    ...createAttempt,
    outcome,
    isTimeout: Boolean(error && isBenchmarkTableCreateTimeoutError(error)),
    error: error ? String(error?.message || error) : null,
    errorCode: normalizeStringOrNull(error?.code),
    timeoutClass: normalizeStringOrNull(error?.timeoutClass),
    timeoutClassification: normalizeObjectOrNull(error?.timeoutClassification),
    completedAt,
    durationMs: Math.max(
      ZERO,
      completedAt - Number(createAttempt?.startedAt || completedAt),
    ),
  };
}

function attachBenchmarkTableCreateAttempt(error, createAttempt) {
  const normalizedError =
    error instanceof Error ?
      error :
      new Error(String(error || 'benchmark_table_create_failed'));
  normalizedError.benchmarkTableCreateAttempt = createAttempt;
  return normalizedError;
}

function resolveBenchmarkTableCreateAttempt(error) {
  if (!error || typeof error !== 'object') {
    return null;
  }
  const createAttempt = error.benchmarkTableCreateAttempt;
  if (!createAttempt || typeof createAttempt !== 'object') {
    return null;
  }
  return createAttempt;
}

function resolveSystemTableReadPath(seedNode, candidateNodes) {
  const fallbackNodes = resolveControlSnapshotCandidates(
    seedNode,
    candidateNodes,
  );
  return {
    mode: SYSTEM_TABLE_READ_PATH_MODE_CANONICAL,
    nodes: fallbackNodes,
  };
}

async function queryControlWithNodeFallback(
  nodeClient,
  nodes,
  sql,
  params = [],
  context = NODE_CLIENT_TRANSIENT_CONTEXT,
) {
  const candidates = Array.isArray(nodes) ?
    nodes.filter((node) => node && typeof node.id === 'string') :
    [];
  if (candidates.length === ZERO) {
    throw new Error('no_system_table_read_nodes_available');
  }

  const errors = [];
  for (const node of candidates) {
    try {
      const result = await nodeClient.queryControl(node, sql, params, context);
      return {
        result,
        nodeId: node.id,
      };
    } catch (error) {
      errors.push({
        nodeId: String(node?.id || 'unknown'),
        error: String(error?.message || error),
      });
    }
  }

  const errorSummary = errors
    .map((entry) => entry.nodeId + '=' + entry.error)
    .join('|');
  const aggregateError = new Error(
    'all_system_table_read_nodes_failed:' + errorSummary,
  );
  aggregateError.readPathErrors = errors;
  throw aggregateError;
}

function resolveCanonicalSystemTableWriteNode(nodes) {
  const candidates = Array.isArray(nodes) ?
    nodes.filter((node) => node && typeof node.id === 'string') :
    [];
  if (candidates.length === ZERO) {
    throw new Error('no_system_table_read_nodes_available');
  }
  return candidates[ZERO];
}

/**
 * Write the benchmark table's policy through its owner
 * (TablePolicyService behind the admin table-policy operation) on the
 * canonical system-table write node. A typed refusal or a not-ready owner
 * is thrown with its code; the caller's retry classification decides.
 * @param {Array<Object>} nodes
 * @param {string} tableId
 * @param {Object} tablePolicies
 * @return {Promise<{nodeId: string}>}
 */
async function applyBenchmarkTablePolicyOnCanonicalNode(nodes, tableId,
  tablePolicies) {
  const canonicalNode = resolveCanonicalSystemTableWriteNode(nodes);
  const answer = await canonicalNode.updateTablePolicy(tableId,
    tablePolicies);
  if (answer?.success !== true) {
    throw new Error('benchmark table policy owner answered ' +
      String(answer?.outcome) + ': ' +
      String(answer?.errorCode || answer?.error).toLowerCase());
  }
  return {nodeId: canonicalNode.id};
}

async function querySutTableMetadata(
  nodeClient,
  systemTableReadNodes,
  tableName,
) {
  const lookup = await queryControlWithNodeFallback(
    nodeClient,
    systemTableReadNodes,
    buildBenchmarkTableLookupSql(tableName),
  );
  const result = lookup.result;
  const rows = rowsFromQueryResult(result);
  const tableId = firstStringField(rows, 'table_id', 'tableId');
  const requiredSchemaVersion = extractRequiredSchemaVersionFromRows(rows);
  return {
    tableId,
    requiredSchemaVersion: requiredSchemaVersion.value,
    requiredSchemaVersionSourceField: requiredSchemaVersion.sourceField,
    metadataNodeId: lookup.nodeId,
  };
}

async function querySutTableId(nodeClient, systemTableReadNodes, tableName) {
  const tableMetadata = await querySutTableMetadata(
    nodeClient,
    systemTableReadNodes,
    tableName,
  );
  return tableMetadata.tableId;
}

function resolveFunctionOrDefault(fn, defaultFn = null) {
  return typeof fn === 'function' ? fn : defaultFn;
}

function resolveScenarioOverrides(cluster) {
  const overrides = cluster?._scenarioOverrides?.postgresBaselineComparison;
  const hasInjectedLoadGenerator =
    typeof overrides?.createLoadGenerator === 'function';
  return {
    createPostgresPool: resolveFunctionOrDefault(
      overrides?.createPostgresPool,
      (options) => new Pool(options),
    ),
    createLoadGenerator: resolveFunctionOrDefault(
      overrides?.createLoadGenerator,
      (nodes, options) => new LoadGenerator(nodes, options),
    ),
    semanticParityEnabled:
      hasInjectedLoadGenerator ?
        overrides?.semanticParityEnabled === true :
        true,
    getCdcTelemetryByNode: resolveFunctionOrDefault(
      overrides?.getCdcTelemetryByNode,
    ),
    phaseEventSink: resolveFunctionOrDefault(overrides?.phaseEventSink),
    progressHeartbeatIntervalMs: resolveProgressHeartbeatIntervalMs(
      overrides?.progressHeartbeatIntervalMs,
    ),
    timing: resolveScenarioTiming(overrides?.timing),
  };
}

function resolveProgressHeartbeatIntervalMs(value) {
  return Number.isInteger(value) && value > ZERO ?
    value :
    LOAD_PROGRESS_HEARTBEAT_INTERVAL_MS;
}

function emitScenarioPhaseEvent(phaseEventSink, event) {
  if (
    typeof phaseEventSink !== 'function' ||
    !event ||
    typeof event !== 'object'
  ) {
    return;
  }
  try {
    phaseEventSink({...event});
  } catch (_error) {
    // Progress sinks are observational only.
  }
}

function buildLoadProgressDetails(label, heartbeatCount, metrics = {}) {
  return {
    label,
    heartbeatCount,
    total: normalizeNonNegativeInteger(metrics.total),
    success: normalizeNonNegativeInteger(metrics.success),
    failed: normalizeNonNegativeInteger(metrics.failed),
    errors: normalizeNonNegativeInteger(metrics.errors),
    attemptErrors: normalizeNonNegativeInteger(metrics.attemptErrors),
    opsPerSec: Number.isFinite(metrics.opsPerSec) ? metrics.opsPerSec : ZERO,
    dispatchedOperations: normalizeNonNegativeInteger(
      metrics.dispatchedOperations,
    ),
    targetOperations: normalizeNonNegativeInteger(metrics.targetOperations),
    undispatchedOperations: normalizeNonNegativeInteger(
      metrics.undispatchedOperations,
    ),
    rejectedOperations: normalizeNonNegativeInteger(metrics.rejectedOperations),
    cancelled: normalizeNonNegativeInteger(metrics.cancelled),
  };
}

function startLoadProgressReporter({loadRun, intervalMs, label, onProgress}) {
  if (
    typeof onProgress !== 'function' ||
    typeof loadRun?.getMetrics !== 'function'
  ) {
    return {
      stop() {},
    };
  }

  const heartbeatIntervalMs = resolveProgressHeartbeatIntervalMs(intervalMs);
  let stopped = false;
  let heartbeatCount = ZERO;
  let timerId = null;

  const scheduleNextHeartbeat = () => {
    if (stopped) {
      return;
    }
    timerId = setTimeout(() => {
      timerId = null;
      if (stopped) {
        return;
      }
      let metrics = null;
      try {
        metrics = loadRun.getMetrics();
      } catch (_error) {
        scheduleNextHeartbeat();
        return;
      }
      heartbeatCount += ONE;
      onProgress(
        label + ' heartbeat',
        buildLoadProgressDetails(label, heartbeatCount, metrics),
      );
      scheduleNextHeartbeat();
    }, heartbeatIntervalMs);
    if (typeof timerId.unref === 'function') {
      timerId.unref();
    }
  };

  scheduleNextHeartbeat();

  return {
    stop() {
      stopped = true;
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    },
  };
}

function resolveNodeClientChannelPolicyOverrides(cluster) {
  const channelPolicies = cluster?._config?.nodeClient?.channelPolicies;
  if (!channelPolicies || typeof channelPolicies !== 'object') {
    return null;
  }
  return channelPolicies;
}

function resolveBenchmarkTableCreateRetryBounds(
  systemTableReadNodes,
  benchmarkConfig,
  timing,
) {
  const createRetryTimeoutMs =
    Number.isInteger(benchmarkConfig?.readyTimeoutMs) &&
    benchmarkConfig.readyTimeoutMs > ZERO ?
      benchmarkConfig.readyTimeoutMs :
      BENCHMARK_DEFAULTS.readyTimeoutMs;
  const effectiveCreateRetryTimeoutMs =
    Array.isArray(systemTableReadNodes) &&
    systemTableReadNodes.length >=
      PREFLIGHT_CONVERGENCE_LARGE_CLUSTER_NODE_THRESHOLD ?
      Math.max(
        createRetryTimeoutMs,
        BENCHMARK_TABLE_CREATE_LARGE_CLUSTER_RETRY_TIMEOUT_MS,
      ) :
      createRetryTimeoutMs;
  const createRetryPollIntervalMs =
    Number.isInteger(benchmarkConfig?.readyPollIntervalMs) &&
    benchmarkConfig.readyPollIntervalMs > ZERO ?
      benchmarkConfig.readyPollIntervalMs :
      BENCHMARK_DEFAULTS.readyPollIntervalMs;
  return {
    createRetryPollIntervalMs,
    createRetryDeadlineMs: timing.now() + effectiveCreateRetryTimeoutMs,
  };
}

async function createSutBenchmarkTableWithRetry({
  nodeClient,
  canonicalWriteNode,
  tableName,
  createTableContext,
  createRetryDeadlineMs,
  createRetryPollIntervalMs,
  timing,
}) {
  while (true) {
    let createAttempt = createBenchmarkTableCreateAttempt(
      tableName,
      canonicalWriteNode.id,
      createTableContext,
    );
    try {
      await nodeClient.queryControl(
        canonicalWriteNode,
        buildBenchmarkTableDdl(tableName),
        [],
        createTableContext,
      );
      createAttempt = finalizeBenchmarkTableCreateAttempt(
        createAttempt,
        BENCHMARK_TABLE_CREATE_OUTCOME_SUCCEEDED,
        null,
      );
      return {
        createAttempt,
        createResult: {
          nodeId: canonicalWriteNode.id,
        },
      };
    } catch (error) {
      createAttempt = await buildBenchmarkTableFailureAttempt({
        createAttempt,
        nodeClient,
        canonicalWriteNode,
        tableName,
        error,
      });
      if (
        hasBenchmarkTableBootstrapProgress(createAttempt?.metadataSnapshot)
      ) {
        return {
          createAttempt,
          createResult: {
            nodeId: canonicalWriteNode.id,
          },
        };
      }
      if (
        !isRetriableBenchmarkTableProgressError(error) ||
        timing.now() >= createRetryDeadlineMs
      ) {
        throw attachBenchmarkTableCreateAttempt(error, createAttempt);
      }
      await refreshBenchmarkTableCreateReadModel(
        nodeClient,
        canonicalWriteNode,
      );
      if (timing.now() >= createRetryDeadlineMs) {
        throw attachBenchmarkTableCreateAttempt(error, createAttempt);
      }
      await timing.sleep(createRetryPollIntervalMs);
    }
  }
}

async function ensureSutBenchmarkTable(
  nodeClient,
  systemTableReadNodes,
  tableName,
  benchmarkConfig,
  benchmarkTablePolicies,
  options = {},
) {
  const timing = resolveScenarioTiming(options.timing);
  const createTableContext =
    buildBenchmarkTableCreateNodeClientContext(benchmarkConfig);
  const canonicalWriteNode =
    resolveCanonicalSystemTableWriteNode(systemTableReadNodes);
  const {createRetryPollIntervalMs, createRetryDeadlineMs} =
    resolveBenchmarkTableCreateRetryBounds(
      systemTableReadNodes,
      benchmarkConfig,
      timing,
    );
  const created = await createSutBenchmarkTableWithRetry({
    nodeClient,
    canonicalWriteNode,
    tableName,
    createTableContext,
    createRetryDeadlineMs,
    createRetryPollIntervalMs,
    timing,
  });
  let createAttempt = created.createAttempt;
  const createResult = created.createResult;

  while (true) {
    try {
      const tableMetadata = await querySutTableMetadata(
        nodeClient,
        systemTableReadNodes,
        tableName,
      );
      const tableId = tableMetadata.tableId;
      if (!tableId) {
        if (timing.now() >= createRetryDeadlineMs) {
          return {
            ...tableMetadata,
            writeNodeId: createResult.nodeId,
            createAttempt,
          };
        }
        await refreshBenchmarkTableCreateReadModel(
          nodeClient,
          canonicalWriteNode,
        );
        await timing.sleep(createRetryPollIntervalMs);
        continue;
      }
      const policyResult = await applyBenchmarkTablePolicyOnCanonicalNode(
        systemTableReadNodes,
        tableId,
        benchmarkTablePolicies,
      );
      return {
        ...tableMetadata,
        writeNodeId: createResult.nodeId,
        policyNodeId: policyResult.nodeId,
        createAttempt,
      };
    } catch (error) {
      if (
        !isRetriableBenchmarkTableProgressError(error) ||
        timing.now() >= createRetryDeadlineMs
      ) {
        createAttempt = await buildBenchmarkTableFailureAttempt({
          createAttempt,
          nodeClient,
          canonicalWriteNode,
          tableName,
          error,
        });
        throw attachBenchmarkTableCreateAttempt(error, createAttempt);
      }
      await refreshBenchmarkTableCreateReadModel(
        nodeClient,
        canonicalWriteNode,
      );
      await timing.sleep(createRetryPollIntervalMs);
    }
  }
}

async function ensurePostgresBenchmarkTable(pool, tableName) {
  await pool.query(buildBenchmarkTableDdl(tableName));
}

function isRetriableTableReadyError(error) {
  const message = String(error?.message || '').toLowerCase();
  if (!message) {
    return false;
  }
  return (
    message.includes('no partitions available for table') ||
    (message.includes('table') && message.includes('not found')) ||
    message.includes('timed out waiting for routable partition service') ||
    message.includes('timed out waiting for partition leader service') ||
    message.includes('timed out waiting for partition service metadata') ||
    message.includes('connect econnrefused')
  );
}

/**
 * The read-back that replaced the harness partition repair: the partition
 * complete cohort found by table_id must carry its exact catalog identity.
 * Any incomplete or conflicting row is a product finding, even when another
 * row in the cohort is correct.
 * @param {Array<Object>} rows
 * @param {string} tableName
 * @param {string} tableId
 * @return {void}
 */
function assertBenchmarkPartitionRowsCarryTableName(rows, tableName, tableId) {
  if (rows.every((row) => row?.table_id === tableId && row.table_name === tableName)) {
    return;
  }
  throw new Error(BENCHMARK_PARTITION_TABLE_NAME_MISSING + ': partition ' +
    'rows of table_id "' + tableId + '" do not carry table_name "' +
    tableName + '"');
}

async function waitForSutBenchmarkTableReady(
  nodeClient,
  systemTableReadNodes,
  tableName,
  options = {},
) {
  const timing = resolveScenarioTiming(options.timing);
  const timeoutMs = Number.isInteger(options.timeoutMs) ?
    options.timeoutMs :
    BENCHMARK_DEFAULTS.readyTimeoutMs;
  const pollIntervalMs = Number.isInteger(options.pollIntervalMs) ?
    options.pollIntervalMs :
    BENCHMARK_DEFAULTS.readyPollIntervalMs;
  const deadline = timing.now() + timeoutMs;
  let lastError = null;

  while (timing.now() < deadline) {
    try {
      const tableId = await querySutTableId(
        nodeClient,
        systemTableReadNodes,
        tableName,
      );
      if (tableId) {
        const tableIdLookup = await queryControlWithNodeFallback(
          nodeClient,
          systemTableReadNodes,
          buildBenchmarkPartitionLookupByTableIdSql(tableId),
        );
        const tableIdResult = tableIdLookup.result;
        const tableIdRows = rowsFromQueryResult(tableIdResult);
        if (tableIdRows.length > ZERO) {
          // Partition rows of this table exist: each must carry its table
          // name (table creation writes it; nothing here repairs it).
          assertBenchmarkPartitionRowsCarryTableName(tableIdRows, tableName, tableId);
          return;
        }
      }

      lastError = new Error(
        'partition metadata for table "' + tableName + '" not visible yet',
      );
    } catch (error) {
      if (!isRetriableTableReadyError(error)) {
        throw error;
      }
      lastError = error;
    }
    await timing.sleep(pollIntervalMs);
  }

  if (lastError) {
    throw new Error(
      'Benchmark table "' +
        tableName +
        '" was not ready within ' +
        timeoutMs +
        'ms: ' +
        String(lastError.message || lastError),
    );
  }
  throw new Error(
    'Benchmark table "' +
      tableName +
      '" was not ready within ' +
      timeoutMs +
      'ms',
  );
}

function buildBaselineLoadNodes(pool, nodeCount) {
  const count =
    Number.isInteger(nodeCount) && nodeCount > ZERO ? nodeCount : ONE;
  const nodes = [];
  for (let index = ZERO; index < count; index += ONE) {
    nodes.push({
      id: BASELINE_LOAD_NODE_PREFIX + String(index + ONE),
      query: (sql) => pool.query(sql),
    });
  }
  return nodes;
}

async function runBaselineSharedLoad({
  pool,
  createLoadGenerator,
  loadNodeCount,
  loadOpsPerSec,
  loadDuration,
  loadMaxInFlight,
  loadNodeMaxInFlight,
  maxPendingQueueDepth,
  earlyRejectOnQueueFull,
  nodeFailureThreshold,
  nodeFailureCooldownMs,
  tableName,
  onProgress,
  progressHeartbeatIntervalMs,
  semanticParityEnabled,
}) {
  const loadNodes = buildBaselineLoadNodes(pool, loadNodeCount);
  const loadGenerator = createLoadGenerator(loadNodes, {
    opsPerSec: loadOpsPerSec,
    duration: loadDuration,
    maxInFlight: loadMaxInFlight,
    tableName,
    workloadProfile: BENCHMARK_WORKLOAD_PROFILE,
    operations: BENCHMARK_WORKLOAD_OPERATIONS,
    sqlDialect: BENCHMARK_SQL_DIALECT.POSTGRESQL,
    enforceSemanticOracle: semanticParityEnabled === true,
    trackAcknowledgedWrites: semanticParityEnabled === true,
    ...(Number.isInteger(nodeFailureThreshold) && nodeFailureThreshold > ZERO ?
      {nodeFailureThreshold} :
      {}),
    ...(Number.isInteger(nodeFailureCooldownMs) && nodeFailureCooldownMs > ZERO ?
      {nodeFailureCooldownMs} :
      {}),
    ...(Number.isInteger(loadNodeMaxInFlight) && loadNodeMaxInFlight > ZERO ?
      {nodeMaxInFlight: loadNodeMaxInFlight} :
      {}),
    ...(Number.isInteger(maxPendingQueueDepth) && maxPendingQueueDepth >= ZERO ?
      {maxPendingQueueDepth} :
      {}),
    ...(earlyRejectOnQueueFull === true ?
      {earlyRejectOnQueueFull: true} :
      {}),
  });
  const baselineRun = loadGenerator.start();
  const progressReporter = startLoadProgressReporter({
    loadRun: baselineRun,
    intervalMs: progressHeartbeatIntervalMs,
    label: 'baseline load',
    onProgress,
  });
  try {
    const metrics = await baselineRun.waitComplete();
    return await attachSemanticParityReceipt({
      loadRun: baselineRun,
      metrics,
      query: (sql) => pool.query(sql),
      tableName,
      dialect: BENCHMARK_SQL_DIALECT.POSTGRESQL,
      enabled: semanticParityEnabled,
    });
  } finally {
    progressReporter.stop();
  }
}

function buildLoadGeneratorTuningOptions({
  nodeFailureThreshold,
  nodeFailureCooldownMs,
  loadQueryTimeoutMs,
  loadNodeMaxInFlight,
  maxPendingQueueDepth,
  earlyRejectOnQueueFull,
}) {
  return {
    ...(Number.isInteger(nodeFailureThreshold) && nodeFailureThreshold > ZERO ?
      {nodeFailureThreshold} :
      {}),
    ...(Number.isInteger(nodeFailureCooldownMs) && nodeFailureCooldownMs > ZERO ?
      {nodeFailureCooldownMs} :
      {}),
    ...(Number.isInteger(loadQueryTimeoutMs) && loadQueryTimeoutMs > ZERO ?
      {queryTimeoutMs: loadQueryTimeoutMs} :
      {}),
    ...(Number.isInteger(loadNodeMaxInFlight) && loadNodeMaxInFlight > ZERO ?
      {nodeMaxInFlight: loadNodeMaxInFlight} :
      {}),
    ...(Number.isInteger(maxPendingQueueDepth) && maxPendingQueueDepth >= ZERO ?
      {maxPendingQueueDepth} :
      {}),
    ...(earlyRejectOnQueueFull === true ?
      {earlyRejectOnQueueFull: true} :
      {}),
  };
}

function buildRoutedSutLoadNodes(
  loadNodes,
  nodeClient,
  loadQueryTimeoutMs,
  getRebalancingPressureMonitor,
) {
  const queryContext =
    Number.isInteger(loadQueryTimeoutMs) && loadQueryTimeoutMs > ZERO ?
      {timeoutMs: loadQueryTimeoutMs} :
      {};
  return loadNodes.map((node) => ({
    id: node.id,
    breakerOwner: LOAD_BREAKER_OWNER_NODE_CLIENT,
    query: (sql) => {
      const monitor = getRebalancingPressureMonitor();
      if (monitor && typeof monitor.assertLoadNodeAdmitted === 'function') {
        monitor.assertLoadNodeAdmitted(node.id);
      }
      return nodeClient.queryLoad(node, sql, [], queryContext);
    },
  }));
}

async function runSutSharedLoad({
  nodeClient,
  seedNode,
  loadNodes,
  createLoadGenerator,
  loadOpsPerSec,
  loadDuration,
  loadMaxInFlight,
  loadQueryTimeoutMs,
  loadNodeMaxInFlight,
  maxPendingQueueDepth,
  earlyRejectOnQueueFull,
  tableName,
  nodeFailureThreshold,
  nodeFailureCooldownMs,
  requiredSchemaVersion,
  benchmarkConfig,
  runtimeAdmissionOwnership = null,
  buildLoadRebalancingPressureState,
  buildRebalancingCriticalState,
  finalizeHeartbeatFreshnessState,
  startLoadRebalancingPressureMonitor,
  onProgress,
  progressHeartbeatIntervalMs,
  semanticParityEnabled,
}) {
  let rebalancingPressureMonitor = null;
  const routedLoadNodes = buildRoutedSutLoadNodes(
    loadNodes,
    nodeClient,
    loadQueryTimeoutMs,
    () => rebalancingPressureMonitor,
  );
  const loadGenerator = createLoadGenerator(routedLoadNodes, {
    opsPerSec: loadOpsPerSec,
    duration: loadDuration,
    maxInFlight: loadMaxInFlight,
    tableName,
    workloadProfile: BENCHMARK_WORKLOAD_PROFILE,
    operations: BENCHMARK_WORKLOAD_OPERATIONS,
    sqlDialect: BENCHMARK_SQL_DIALECT.SQLITE,
    enforceSemanticOracle: semanticParityEnabled === true,
    trackAcknowledgedWrites: semanticParityEnabled === true,
    ...buildLoadGeneratorTuningOptions({
      nodeFailureThreshold,
      nodeFailureCooldownMs,
      loadQueryTimeoutMs,
      loadNodeMaxInFlight,
      maxPendingQueueDepth,
      earlyRejectOnQueueFull,
    }),
  });
  const loadRun = loadGenerator.start();
  const progressReporter = startLoadProgressReporter({
    loadRun,
    intervalMs: progressHeartbeatIntervalMs,
    label: 'system-under-test load',
    onProgress,
  });
  rebalancingPressureMonitor = startLoadRebalancingPressureMonitor({
    nodeClient,
    seedNode,
    loadNodes,
    benchmarkConfig,
    loadRun,
    tableName,
    requiredSchemaVersion,
    admissionRuntimeOwnership: runtimeAdmissionOwnership,
  });

  let loadMetrics = null;
  let loadError = null;
  let rebalancingPressure = null;
  try {
    loadMetrics = await loadRun.waitComplete();
    loadMetrics = await attachSemanticParityReceipt({
      loadRun,
      metrics: loadMetrics,
      query: routedLoadNodes.length > ZERO ?
        (sql) => routedLoadNodes[ZERO].query(sql) :
        null,
      tableName,
      dialect: BENCHMARK_SQL_DIALECT.SQLITE,
      enabled: semanticParityEnabled,
    });
  } catch (error) {
    loadError = error;
  } finally {
    progressReporter.stop();
    const nodeIdStrings = loadNodes.map((node) => String(node?.id || ''));
    rebalancingPressure = rebalancingPressureMonitor ?
      await rebalancingPressureMonitor.stop() :
      buildLoadRebalancingPressureState({
        monitoredNodeIds: nodeIdStrings,
        admittedNodeIds: nodeIdStrings,
      });
  }
  const criticalRebalancingState = buildRebalancingCriticalState(
    rebalancingPressure,
    benchmarkConfig,
  );
  rebalancingPressure.criticalState = criticalRebalancingState;
  const heartbeatFreshness =
    finalizeHeartbeatFreshnessState(rebalancingPressure);
  rebalancingPressure.heartbeatFreshness = heartbeatFreshness;
  if (loadError) {
    throw loadError;
  }
  return {
    metrics: loadMetrics,
    rebalancingPressure,
    internalSignalMessages: [
      ...criticalRebalancingState.messages,
      ...(Array.isArray(heartbeatFreshness?.messages) ?
        heartbeatFreshness.messages :
        []),
    ],
  };
}

function buildSemanticParityAccounting(metrics) {
  const source = metrics && typeof metrics === 'object' ? metrics : {};
  const rejectedByReason =
    source.rejectedByReason && typeof source.rejectedByReason === 'object' ?
      source.rejectedByReason :
      {};
  return {
    offered: normalizeNonNegativeInteger(
      source.offered ?? source.targetOperations,
    ),
    dispatched: normalizeNonNegativeInteger(source.dispatchedOperations),
    correct: normalizeNonNegativeInteger(source.correct ?? source.success),
    rejected: normalizeNonNegativeInteger(source.rejectedOperations),
    timedOut: normalizeNonNegativeInteger(source.timedOut),
    errored: normalizeNonNegativeInteger(source.errored),
    queueOverflow: normalizeNonNegativeInteger(source.queueOverflow),
    undispatched: normalizeNonNegativeInteger(source.undispatchedOperations),
    cancelled: normalizeNonNegativeInteger(source.cancelled),
    rejectedByReason: {
      queueFull: normalizeNonNegativeInteger(rejectedByReason.queueFull),
      flowControl: normalizeNonNegativeInteger(rejectedByReason.flowControl),
      admission: normalizeNonNegativeInteger(rejectedByReason.admission),
    },
  };
}

function extractSemanticParityLoadRunEvidence(loadRun) {
  const execution =
    typeof loadRun?.getSemanticExecutionSnapshot === 'function' ?
      loadRun.getSemanticExecutionSnapshot() :
      null;
  const acknowledgedWrites =
    typeof loadRun?.getAcknowledgedWrites === 'function' ?
      loadRun.getAcknowledgedWrites() :
      null;
  if (!execution || execution.enforced !== true || !acknowledgedWrites) {
    throw new Error(BENCHMARK_SEMANTIC_RUNTIME_RECEIPT_MISSING);
  }
  return {execution, acknowledgedWrites};
}

async function attachSemanticParityReceipt({
  loadRun,
  metrics,
  query,
  tableName,
  dialect,
  enabled,
}) {
  if (enabled !== true) {
    return metrics;
  }
  const {execution, acknowledgedWrites} =
    extractSemanticParityLoadRunEvidence(loadRun);
  const durability = await verifyBenchmarkAcknowledgedWrites({
    query,
    tableName,
    ids: acknowledgedWrites.ids,
  });
  const semanticParity = buildBenchmarkSemanticReceipt({
    dialect,
    compiledOperations: execution.compiledOperations,
    validatedOperations: execution.validatedOperations,
    successfulOperations: execution.successfulOperations,
    oracleFailures: execution.oracleFailures,
    resultSet: execution.resultSet,
    accounting: buildSemanticParityAccounting(metrics),
    durability,
  });
  if (semanticParity.status !== BENCHMARK_SEMANTIC_STATUS.PASS) {
    const error = new Error(
      BENCHMARK_SEMANTIC_PARITY_FAILED_PREFIX +
        String(
          durability.reason ||
            BENCHMARK_PUBLICATION_REASON.SEMANTIC_ORACLE_FAILED,
        ),
    );
    error.semanticParity = semanticParity;
    throw error;
  }
  return {
    ...metrics,
    semanticParity,
  };
}

function isNodeAdminReady(diagnostics) {
  if (!diagnostics || typeof diagnostics !== 'object') {
    return false;
  }
  return (
    diagnostics.adminReady === true ||
    diagnostics.controlPlaneRecoveryReady === true
  );
}

function isLoadNodeCandidate(node) {
  return (
    typeof node?.queryWithTimeout === 'function' &&
    typeof node?.getReachabilityDiagnostics === 'function'
  );
}

function normalizeAdminQueryTraceTimestamp(value) {
  return Number.isFinite(value) ? Math.floor(value) : null;
}

function normalizeIntegerOrNull(value) {
  return Number.isInteger(value) ? value : null;
}

function sanitizeAdminQueryTraceEntry(entry, fallbackNodeId) {
  const source = entry && typeof entry === 'object' ? entry : {};
  const nodeId =
    typeof source.nodeId === 'string' && source.nodeId.length > ZERO ?
      source.nodeId :
      fallbackNodeId;
  return {
    nodeId,
    queryId: normalizeStringOrNull(source.queryId),
    lane: normalizeStringOrNull(source.lane),
    requestType: normalizeStringOrNull(source.requestType),
    operation: normalizeStringOrNull(source.operation),
    statementPreview: normalizeStringOrNull(source.statementPreview),
    statementFingerprint: normalizeStringOrNull(source.statementFingerprint),
    timeoutMs: normalizeAdminQueryTraceTimestamp(source.timeoutMs),
    startedAtMs: normalizeAdminQueryTraceTimestamp(source.startedAtMs),
    socketReadyAtMs: normalizeAdminQueryTraceTimestamp(source.socketReadyAtMs),
    sentAtMs: normalizeAdminQueryTraceTimestamp(source.sentAtMs),
    resolvedAtMs: normalizeAdminQueryTraceTimestamp(source.resolvedAtMs),
    timeoutAtMs: normalizeAdminQueryTraceTimestamp(source.timeoutAtMs),
    erroredAtMs: normalizeAdminQueryTraceTimestamp(source.erroredAtMs),
    durationMs: normalizeAdminQueryTraceTimestamp(source.durationMs),
    rowCount: normalizeIntegerOrNull(source.rowCount),
    outcome: normalizeStringOrNull(source.outcome),
    error: normalizeStringOrNull(source.error),
  };
}

export const POSTGRES_BASELINE_COMPARISON_BENCHMARK_TABLE_LOAD_BUNDLE = {
  ...POSTGRES_BASELINE_COMPARISON_CONSTANTS_AND_IMPORTS_BUNDLE,
  buildBenchmarkMetadataFlow,
  normalizePositiveIntegerOrNull,
  isBenchmarkTableCreateTimeoutError,
  isRetriableBenchmarkTableProgressError,
  hasBenchmarkTableBootstrapProgress,
  buildBenchmarkTableFailureAttempt,
  refreshBenchmarkTableCreateReadModel,
  createBenchmarkTableCreateAttempt,
  finalizeBenchmarkTableCreateAttempt,
  attachBenchmarkTableCreateAttempt,
  resolveBenchmarkTableCreateAttempt,
  resolveSystemTableReadPath,
  queryControlWithNodeFallback,
  resolveCanonicalSystemTableWriteNode,
  querySutTableMetadata,
  querySutTableId,
  resolveScenarioOverrides,
  resolveProgressHeartbeatIntervalMs,
  emitScenarioPhaseEvent,
  buildLoadProgressDetails,
  startLoadProgressReporter,
  resolveNodeClientChannelPolicyOverrides,
  ensureSutBenchmarkTable,
  ensurePostgresBenchmarkTable,
  isRetriableTableReadyError,
  rowsFromQueryResult,
  waitForSutBenchmarkTableReady,
  buildBaselineLoadNodes,
  runBaselineSharedLoad,
  runSutSharedLoad,
  attachSemanticParityReceipt,
  isNodeAdminReady,
  isLoadNodeCandidate,
  normalizeAdminQueryTraceTimestamp,
  sanitizeAdminQueryTraceEntry,
};
