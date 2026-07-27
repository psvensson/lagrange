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
  NODE_CLIENT_MUTATING_CONTEXT,
  NODE_CLIENT_TRANSIENT_CONTEXT,
  ONE,
  Pool,
  PREFLIGHT_CONVERGENCE_LARGE_CLUSTER_NODE_THRESHOLD,
  SYSTEM_TABLE_READ_PATH_MODE_CANONICAL,
  LoadGenerator,
  ZERO,
  buildBenchmarkPartitionLookupByTableIdSql,
  buildBenchmarkPartitionLookupSql,
  buildBenchmarkPartitionRepairSql,
  buildBenchmarkTableCreateNodeClientContext,
  buildBenchmarkTableDdl,
  buildBenchmarkTableLookupSql,
  buildBenchmarkTablePolicySql,
  collectBenchmarkMetadataSnapshot,
  extractRequiredSchemaVersionFromRows,
  firstStringField,
  resolveScenarioTiming,
} = POSTGRES_BASELINE_COMPARISON_CONSTANTS_AND_IMPORTS_BUNDLE;

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

function isRetriableBenchmarkTableProgressError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  if (isBenchmarkTableCreateTimeoutError(error)) {
    return (
      message.includes('timed out waiting for partition leader service') ||
      message.includes('timed out waiting for routable partition service') ||
      message.includes('admin api query timed out for node') ||
      message.includes('timed out waiting for partition service metadata')
    );
  }
  if (!message) {
    return false;
  }
  return (
    message.includes(
      'unable to satisfy minimum routable provisioning cohort',
    ) ||
    message.includes('control_plane_write_unhealthy') ||
    message.includes('cluster_member_unhealthy') ||
    message.includes(
      'distributed operation failed due to participant failures',
    ) ||
    message.includes('cannot start a transaction within a transaction') ||
    message.includes('cannot commit - no transaction is active') ||
    message.includes('transaction already active on this partition') ||
    message.includes('no active service found for partition') ||
    message.includes('no partitions available for table') ||
    (message.includes('table') && message.includes('not found')) ||
    message.includes('connect econnrefused') ||
    message.includes('connection refused')
  );
}

function hasBenchmarkTableBootstrapProgress(metadataSnapshot) {
  if (!metadataSnapshot || typeof metadataSnapshot !== 'object') {
    return false;
  }
  const tableRowCount = Number(metadataSnapshot?.tables?.rowCount || ZERO);
  const partitionRowCount = Number(
    metadataSnapshot?.partitions?.rowCount || ZERO,
  );
  const tableId = String(metadataSnapshot?.tableId || '').trim();
  const partitionIds = Array.isArray(metadataSnapshot?.partitions?.partitionIds) ?
    metadataSnapshot.partitions.partitionIds.filter(
      (partitionId) =>
        typeof partitionId === 'string' && partitionId.length > ZERO,
    ) :
    [];
  return (
    (tableRowCount > ZERO || tableId.length > ZERO) &&
    (partitionRowCount > ZERO || partitionIds.length > ZERO)
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

function finalizeBenchmarkTableCreateAttempt(
  createAttempt,
  outcome,
  error = null,
) {
  const completedAt = Date.now();
  return {
    ...createAttempt,
    outcome,
    isTimeout: error ? isBenchmarkTableCreateTimeoutError(error) : false,
    error: error ? String(error?.message || error) : null,
    errorCode: typeof error?.code === 'string' ? error.code : null,
    timeoutClass:
      typeof error?.timeoutClass === 'string' ? error.timeoutClass : null,
    timeoutClassification:
      error?.timeoutClassification &&
      typeof error.timeoutClassification === 'object' ?
        error.timeoutClassification :
        null,
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

async function queryControlOnCanonicalSystemTableWriteNode(
  nodeClient,
  nodes,
  sql,
  params = [],
  context = NODE_CLIENT_TRANSIENT_CONTEXT,
) {
  const canonicalNode = resolveCanonicalSystemTableWriteNode(nodes);
  const result = await nodeClient.queryControl(
    canonicalNode,
    sql,
    params,
    context,
  );
  return {
    result,
    nodeId: canonicalNode.id,
  };
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

function resolveScenarioOverrides(cluster) {
  const overrides = cluster?._scenarioOverrides?.postgresBaselineComparison;
  const hasInjectedLoadGenerator =
    typeof overrides?.createLoadGenerator === 'function';
  const createPostgresPool =
    typeof overrides?.createPostgresPool === 'function' ?
      overrides.createPostgresPool :
      (options) => new Pool(options);
  const createLoadGenerator =
    typeof overrides?.createLoadGenerator === 'function' ?
      overrides.createLoadGenerator :
      (nodes, options) => new LoadGenerator(nodes, options);
  const getCdcTelemetryByNode =
    typeof overrides?.getCdcTelemetryByNode === 'function' ?
      overrides.getCdcTelemetryByNode :
      null;
  const phaseEventSink =
    typeof overrides?.phaseEventSink === 'function' ?
      overrides.phaseEventSink :
      null;
  return {
    createPostgresPool,
    createLoadGenerator,
    semanticParityEnabled:
      hasInjectedLoadGenerator ?
        overrides?.semanticParityEnabled === true :
        true,
    getCdcTelemetryByNode,
    phaseEventSink,
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
  const createRetryDeadlineMs = timing.now() + effectiveCreateRetryTimeoutMs;
  let createAttempt = null;
  let createResult;
  while (true) {
    createAttempt = createBenchmarkTableCreateAttempt(
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
      createResult = {
        nodeId: canonicalWriteNode.id,
      };
      break;
    } catch (error) {
      createAttempt = await buildBenchmarkTableFailureAttempt({
        createAttempt,
        nodeClient,
        canonicalWriteNode,
        tableName,
        error,
      });
      const bootstrapProgressObserved = hasBenchmarkTableBootstrapProgress(
        createAttempt?.metadataSnapshot,
      );
      if (bootstrapProgressObserved) {
        createResult = {
          nodeId: canonicalWriteNode.id,
        };
        break;
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
      const policyResult = await queryControlOnCanonicalSystemTableWriteNode(
        nodeClient,
        systemTableReadNodes,
        buildBenchmarkTablePolicySql(tableId, benchmarkTablePolicies),
        [],
        NODE_CLIENT_MUTATING_CONTEXT,
      );
      const repairResult = await queryControlOnCanonicalSystemTableWriteNode(
        nodeClient,
        systemTableReadNodes,
        buildBenchmarkPartitionRepairSql(tableName, tableId),
        [],
        NODE_CLIENT_MUTATING_CONTEXT,
      );
      return {
        ...tableMetadata,
        writeNodeId: createResult.nodeId,
        policyNodeId: policyResult.nodeId,
        repairNodeId: repairResult.nodeId,
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
      const tableNameLookup = await queryControlWithNodeFallback(
        nodeClient,
        systemTableReadNodes,
        buildBenchmarkPartitionLookupSql(tableName),
      );
      const tableNameResult = tableNameLookup.result;
      const tableNameRows = rowsFromQueryResult(tableNameResult);
      if (tableNameRows.length > ZERO) {
        return;
      }

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
  const routedLoadNodes = loadNodes.map((node) => ({
    id: node.id,
    breakerOwner: LOAD_BREAKER_OWNER_NODE_CLIENT,
    query: (sql) => {
      if (
        rebalancingPressureMonitor &&
        typeof rebalancingPressureMonitor.assertLoadNodeAdmitted === 'function'
      ) {
        rebalancingPressureMonitor.assertLoadNodeAdmitted(node.id);
      }
      return nodeClient.queryLoad(
        node,
        sql,
        [],
        Number.isInteger(loadQueryTimeoutMs) && loadQueryTimeoutMs > ZERO ?
          {timeoutMs: loadQueryTimeoutMs} :
          {},
      );
    },
  }));
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
    rebalancingPressure = rebalancingPressureMonitor ?
      await rebalancingPressureMonitor.stop() :
      buildLoadRebalancingPressureState({
        monitoredNodeIds: loadNodes.map((node) => String(node?.id || '')),
        admittedNodeIds: loadNodes.map((node) => String(node?.id || '')),
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
  const durability = await verifyBenchmarkAcknowledgedWrites({
    query,
    tableName,
    ids: acknowledgedWrites.ids,
  });
  const rejectedByReason =
    metrics?.rejectedByReason &&
    typeof metrics.rejectedByReason === 'object' ?
      metrics.rejectedByReason :
      {};
  const accounting = {
    offered: normalizeNonNegativeInteger(
      metrics?.offered ?? metrics?.targetOperations,
    ),
    dispatched: normalizeNonNegativeInteger(metrics?.dispatchedOperations),
    correct: normalizeNonNegativeInteger(metrics?.correct ?? metrics?.success),
    rejected: normalizeNonNegativeInteger(metrics?.rejectedOperations),
    timedOut: normalizeNonNegativeInteger(metrics?.timedOut),
    errored: normalizeNonNegativeInteger(metrics?.errored),
    queueOverflow: normalizeNonNegativeInteger(metrics?.queueOverflow),
    undispatched: normalizeNonNegativeInteger(metrics?.undispatchedOperations),
    cancelled: normalizeNonNegativeInteger(metrics?.cancelled),
    rejectedByReason: {
      queueFull: normalizeNonNegativeInteger(rejectedByReason.queueFull),
      flowControl: normalizeNonNegativeInteger(rejectedByReason.flowControl),
      admission: normalizeNonNegativeInteger(rejectedByReason.admission),
    },
  };
  const semanticParity = buildBenchmarkSemanticReceipt({
    dialect,
    compiledOperations: execution.compiledOperations,
    validatedOperations: execution.validatedOperations,
    successfulOperations: execution.successfulOperations,
    oracleFailures: execution.oracleFailures,
    resultSet: execution.resultSet,
    accounting,
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

function sanitizeAdminQueryTraceEntry(entry, fallbackNodeId) {
  const nodeId =
    typeof entry?.nodeId === 'string' && entry.nodeId.length > ZERO ?
      entry.nodeId :
      fallbackNodeId;
  return {
    nodeId,
    queryId: typeof entry?.queryId === 'string' ? entry.queryId : null,
    lane: typeof entry?.lane === 'string' ? entry.lane : null,
    requestType:
      typeof entry?.requestType === 'string' ? entry.requestType : null,
    operation: typeof entry?.operation === 'string' ? entry.operation : null,
    statementPreview:
      typeof entry?.statementPreview === 'string' ?
        entry.statementPreview :
        null,
    statementFingerprint:
      typeof entry?.statementFingerprint === 'string' ?
        entry.statementFingerprint :
        null,
    timeoutMs: Number.isFinite(entry?.timeoutMs) ?
      Math.floor(entry.timeoutMs) :
      null,
    startedAtMs: normalizeAdminQueryTraceTimestamp(entry?.startedAtMs),
    socketReadyAtMs: normalizeAdminQueryTraceTimestamp(entry?.socketReadyAtMs),
    sentAtMs: normalizeAdminQueryTraceTimestamp(entry?.sentAtMs),
    resolvedAtMs: normalizeAdminQueryTraceTimestamp(entry?.resolvedAtMs),
    timeoutAtMs: normalizeAdminQueryTraceTimestamp(entry?.timeoutAtMs),
    erroredAtMs: normalizeAdminQueryTraceTimestamp(entry?.erroredAtMs),
    durationMs: Number.isFinite(entry?.durationMs) ?
      Math.floor(entry.durationMs) :
      null,
    rowCount: Number.isInteger(entry?.rowCount) ? entry.rowCount : null,
    outcome: typeof entry?.outcome === 'string' ? entry.outcome : null,
    error: typeof entry?.error === 'string' ? entry.error : null,
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
  queryControlOnCanonicalSystemTableWriteNode,
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
