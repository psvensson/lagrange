/**
 * Scenario: postgres-baseline-comparison
 *
 * Runs shared harness load against both the system under test and a baseline
 * Postgres cluster on the same Docker network, then reports comparative
 * throughput and latency metrics.
 */

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {
  arch as osArch,
  cpus as osCpus,
  hostname as osHostname,
  platform as osPlatform,
} from 'node:os';
import {dirname, join} from 'node:path';
import {
  ASSERTION_POLICY,
  BENCHMARK_DEFAULTS,
  CONSISTENCY_VERDICT,
  GATE_RESULT_MODE,
  NODE_CLIENT_CHANNEL,
  NODE_CLIENT_CONTEXT_KEYS,
  NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
  NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
  PHASE_STATUS,
  SCENARIO_PHASE,
} from '../harness/constants.js';
import {LoadGenerator} from '../harness/load-generator.js';
import {evaluateAssertionPolicy} from '../harness/assertion-policy.js';
import {ConsistencyEvaluatorV2} from '../harness/consistency-evaluator.js';
import {NodeClient} from '../harness/node-client.js';
import {PhaseOrchestrator} from '../harness/phase-orchestrator.js';
import {
  execShell,
  shellQuote,
  waitForPostgresReady,
} from '../harness/pgbench-runner.js';
import {GateEngine} from '../harness/gate-engine.js';

const ZERO = 0;
const ONE = 1;
const POSTGRES_ENV_USER_KEY = 'POSTGRES_USER';
const POSTGRES_ENV_PASSWORD_KEY = 'POSTGRES_PASSWORD';
const POSTGRES_ENV_DB_KEY = 'POSTGRES_DB';
const POSTGRES_ENV_AUTH_METHOD_KEY = 'POSTGRES_HOST_AUTH_METHOD';
const POSTGRES_ENV_AUTH_METHOD_VALUE = 'scram-sha-256';
const BENCHMARK_CONTAINER_NAME_PREFIX = 'ddb-benchmark-postgres-';
const BENCHMARK_PRIMARY_SUFFIX = '-primary';
const BENCHMARK_REPLICA_SUFFIX_PREFIX = '-replica-';
const LOCALHOST = '127.0.0.1';
const SHELL_COMMAND = 'sh';
const SHELL_LOGIN_ARG = '-lc';
const SYNC_STANDBY_TEMPLATE_PREFIX = 'ANY ';
const SYNC_STANDBY_TEMPLATE_SUFFIX = ' (*)';
const PSQL_ON_ERROR_STOP = '-v ON_ERROR_STOP=1';
const PSQL_TUPLES_ONLY = '-tA';
const REPLICATION_STATE_STREAMING = 'streaming';
const REPLICATION_HBA_IPV4 = 'host replication all 0.0.0.0/0 scram-sha-256';
const REPLICATION_HBA_IPV6 = 'host replication all ::/0 scram-sha-256';
const DEFAULT_REPLICATION_PORT = 5432;
const MIN_REPLICATION_FACTOR = 1;
const BOOTSTRAP_DB_NAME = 'replication';
const POSTGRES_ENTRYPOINT_COMMAND = 'docker-entrypoint.sh postgres';
const POSTGRES_BINARY_PATH_EXPORT =
  'export PATH="$PATH:/usr/lib/postgresql/$PG_MAJOR/bin"';
const SYNCHRONOUS_COMMIT_ON = 'on';
const BASELINE_CACHE_SCHEMA_VERSION = 3;
const BASELINE_CACHE_DIRNAME = 'postgres-baseline-cache';
const BASELINE_CACHE_FILE_EXTENSION = '.json';
const BASELINE_CACHE_HASH_ALGORITHM = 'sha256';
const BASELINE_CACHE_HIT_REASON = 'cache-hit';
const BASELINE_CACHE_DISABLED_REASON = 'cache-disabled';
const BASELINE_CACHE_REFRESH_REASON = 'cache-refresh-requested';
const BASELINE_CACHE_MISS_REASON = 'cache-miss';
const BASELINE_CACHE_STALE_REASON = 'cache-stale';
const BASELINE_CACHE_INVALID_REASON = 'cache-invalid';
const BASELINE_CACHE_STORE_REASON = 'cache-stored';
const BENCHMARK_WORKLOAD_PROFILE = 'benchmark_events_mixed';
const BENCHMARK_WORKLOAD_OPERATIONS = Object.freeze([
  'INSERT',
  'SELECT',
]);
const SUT_TABLE_PROBE_SQL_PREFIX = 'SELECT count(*) FROM ';
const SUT_TABLE_PROBE_SQL_SUFFIX = ' WHERE 1 = 0';
const QUIESCENCE_NODE_ERROR_SEPARATOR = '; ';
const QUIESCENCE_NODE_ERROR_PREFIX = 'nodeProbeFailures=';
const QUIESCENCE_IN_FLIGHT_ERROR_PREFIX = 'inFlightQueryError=';
const QUIESCENCE_IN_FLIGHT_COUNT_PREFIX = 'inFlightReplicaOperations=';
const QUIESCENCE_READY_NODE_COUNT_PREFIX = 'readyLoadNodes=';
const QUIESCENCE_STALL_PREFIX = 'progressStall=';
const QUIESCENCE_REASON_IN_FLIGHT_NOT_DRAINED_PREFIX =
  'in_flight_replica_operations:';
const QUIESCENCE_REASON_IN_FLIGHT_QUERY_ERROR_PREFIX =
  'in_flight_query_error:';
const QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX = 'node_probe_error:';
const QUIESCENCE_REASON_LEADERSHIP_UNSTABLE_PREFIX =
  'leadership_unstable:';
const QUIESCENCE_REASON_STALLED_NO_PROGRESS_PREFIX =
  'stalled_no_progress:';
const QUIESCENCE_REASON_SNAPSHOT_QUERY_ERROR_PREFIX =
  'control_snapshot_query_error:';
const QUIESCENCE_REASON_NO_SNAPSHOT_CANDIDATE =
  QUIESCENCE_REASON_SNAPSHOT_QUERY_ERROR_PREFIX + 'no_snapshot_candidates';
const QUIESCENCE_SNAPSHOT_ERROR_SEPARATOR = '|';
const QUIESCENCE_SNAPSHOT_ERROR_ASSIGN = '=';
const QUIESCENCE_SNAPSHOT_ERROR_MORE_SUFFIX = '_more';
const QUIESCENCE_SNAPSHOT_ERROR_MAX_ENTRIES = 3;
const POST_LOAD_DRAIN_STATUS_OK = 'ok';
const POST_LOAD_DRAIN_STATUS_FAILED = 'failed';
const POST_LOAD_DRAIN_MODE_FAILED = 'failed';
const QUIESCENCE_DEFAULT_STABLE_WINDOW_MS =
  BENCHMARK_DEFAULTS.quiescentStableWindowMs;
const CONSISTENCY_ASSERT_MAX_ATTEMPTS_DEFAULT =
  BENCHMARK_DEFAULTS.consistencyAssertMaxAttempts;
const CONSISTENCY_ASSERT_RETRY_DELAY_MS_DEFAULT =
  BENCHMARK_DEFAULTS.consistencyAssertRetryDelayMs;
const BASELINE_LOAD_NODE_PREFIX = 'postgres-baseline-load-node-';
const BENCHMARK_EVENT_TABLE_FALLBACK = 'benchmark_events';
const LOAD_PARITY_STATUS_MATCHED = 'matched';
const LOAD_PARITY_STATUS_MISMATCHED = 'mismatched';
const LOAD_PARITY_REASON_LOAD_FANOUT_MISMATCH = 'load_fanout_mismatch';
const LOAD_PARITY_REASON_PER_NODE_BUDGET_MISMATCH = 'per_node_budget_mismatch';
const LOAD_PARITY_REASON_TABLE_NAME_MISMATCH = 'table_name_mismatch';
const ADMISSION_CONFLICT_LOAD_NODE_MAX_IN_FLIGHT =
  'load_node_max_in_flight_conflict';
const DIAGNOSTICS_COVERAGE_STATUS_AVAILABLE = 'available';
const DIAGNOSTICS_COVERAGE_STATUS_UNAVAILABLE = 'unavailable';
const DIAGNOSTICS_COVERAGE_REASON_NOT_REPORTED = 'not_reported';
const DIAGNOSTICS_SAMPLE_KEY_RAFT_PROPOSE = 'raftPropose';
const DIAGNOSTICS_SAMPLE_KEY_TRANSPORT_DELIVER = 'transportDeliver';
const DIAGNOSTICS_SAMPLE_KEY_SQLITE = 'sqlite';
const LOAD_METRIC_UNDISPATCHED_REASON_CAPACITY = 'capacity';
const LOAD_METRIC_UNDISPATCHED_REASON_DURATION_TIMEOUT = 'durationTimeout';
const LOAD_METRIC_UNDISPATCHED_REASON_CANCELLED = 'cancelled';
const BENCHMARK_DDL_BIGINT_TYPE = 'BIGINT';
const BENCHMARK_DDL_TEXT_TYPE = 'TEXT';
const BENCHMARK_DDL_NOT_NULL = 'NOT NULL';
const BENCHMARK_DDL_PRIMARY_KEY = 'PRIMARY KEY';
const BENCHMARK_POOL_IDLE_TIMEOUT_MS = 30000;
const BENCHMARK_POOL_CONNECTION_TIMEOUT_MS = 10000;
const PHASE_REASON_SUMMARY_MAX_ENTRIES = 5;
const STARTUP_DECISION_SCHEMA_VERSION = 1;
const PHASE_CLASS_STARTUP = 'startup';
const PHASE_CLASS_DISCOVERY = 'discovery';
const PHASE_CLASS_TOPOLOGY = 'topology';
const PHASE_CLASS_LOAD = 'load';
const PHASE_CLASS_VERIFY = 'verify';
const PHASE_CLASS_TEARDOWN = 'teardown';
const PHASE_CLASS_UNKNOWN = 'unknown';
const REASON_CLASS_STARTUP = 'startup';
const REASON_CLASS_DISCOVERY = 'discovery';
const REASON_CLASS_TOPOLOGY = 'topology';
const REASON_CLASS_LOAD = 'load';
const REASON_CLASS_VERIFY = 'verify';
const REASON_CLASS_UNKNOWN = 'unknown';
const DISCOVERY_FIELD_SERVICES = 'services';
const DISCOVERY_SERVICE_FIELD_PROTOCOL = 'protocol';
const DISCOVERY_SERVICE_FIELD_SERVICE_IDS = 'serviceIds';
const DISCOVERY_SERVICE_FIELD_REPLICAS = 'replicas';
const DISCOVERY_REPLICA_FIELD_NODE_ID = 'nodeId';
const DISCOVERY_REPLICA_FIELD_READINESS = 'readiness';
const DISCOVERY_READINESS_FIELD_WORKLOAD_READY = 'workloadReady';
const DISCOVERY_READINESS_FIELD_ROUTING_READY = 'routingReady';
const DISCOVERY_READINESS_FIELD_SCHEMA_READY = 'schemaReady';
const DISCOVERY_READINESS_FIELD_REASONS = 'reasons';
const DISCOVERY_READINESS_REASON_FIELD_CODE = 'code';
const DISCOVERY_READINESS_REASON_FIELD_DETAIL = 'detail';
const DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID =
  'probeReadinessByNodeId';
const DISCOVERY_DIAGNOSTIC_PREFIX_PROBES = 'probes=';
const DISCOVERY_PROBE_REASON_ADMIN_NOT_READY = 'admin_not_ready';
const DISCOVERY_PROBE_REASON_REACHABLE_BY_PREFIX = 'reachable_by=';
const DISCOVERY_PROBE_REASON_LAST_ERROR_PREFIX = 'last_error=';
const DISCOVERY_PROBE_REASON_PROBE_ERROR_PREFIX = 'probe_error=';
const DISCOVERY_SOURCE_STATUS_DISCOVERED = 'discovered';
const DISCOVERY_SOURCE_STATUS_EMPTY = 'empty';
const DISCOVERY_SOURCE_STATUS_ERROR = 'error';
const DISCOVERY_UNKNOWN_NODE_ID = 'unknown';
const DISCOVERY_ERROR_MESSAGE_MAX_CHARS = 160;
const DISCOVERY_SELECTION_POSTGRES_WIRE = 'postgres-wire';
const DISCOVERY_STALLED_ATTEMPT_THRESHOLD = 5;
const LOAD_BREAKER_OWNER_NODE_CLIENT = 'node-client';
const NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_NAME = 'tableName';
const NODE_CLIENT_TRANSIENT_CONTEXT = Object.freeze({
  [NODE_CLIENT_CONTEXT_KEYS.TOLERATE_TRANSIENT_ERRORS]: true,
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDurationToMs(duration) {
  if (typeof duration === 'number' && Number.isFinite(duration)) {
    return Math.max(ZERO, Math.floor(duration));
  }
  const value = String(duration || '').trim().toLowerCase();
  if (value.endsWith('ms')) {
    return Math.max(ZERO, Math.floor(Number.parseInt(value.slice(0, -2), 10)));
  }
  if (value.endsWith('s')) {
    return Math.max(
      ZERO,
      Math.floor(Number.parseInt(value.slice(0, -1), 10) * 1000),
    );
  }
  if (value.endsWith('m')) {
    return Math.max(
      ZERO,
      Math.floor(Number.parseInt(value.slice(0, -1), 10) * 60 * 1000),
    );
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(ZERO, parsed) : ZERO;
}

function normalizeTableName(tableName, fallback = BENCHMARK_EVENT_TABLE_FALLBACK) {
  const candidate = String(tableName || fallback).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(candidate)) {
    return fallback;
  }
  return candidate;
}

function buildBenchmarkTableDdl(tableName) {
  return `CREATE TABLE IF NOT EXISTS ${tableName} (` +
    `event_id ${BENCHMARK_DDL_TEXT_TYPE} ` +
    `${BENCHMARK_DDL_NOT_NULL} ${BENCHMARK_DDL_PRIMARY_KEY}, ` +
    `payload ${BENCHMARK_DDL_BIGINT_TYPE} ` +
    `${BENCHMARK_DDL_NOT_NULL}, ` +
    `created_at ${BENCHMARK_DDL_BIGINT_TYPE} ${BENCHMARK_DDL_NOT_NULL}` +
    ')';
}

function escapeSqlLiteral(value) {
  return String(value).replace(/'/g, '\'\'');
}

function buildBenchmarkPartitionLookupSql(tableName) {
  return 'SELECT partition_id FROM partitions WHERE table_name = \'' +
    escapeSqlLiteral(tableName) +
    '\'';
}

function buildBenchmarkTableLookupSql(tableName) {
  return 'SELECT table_id FROM tables WHERE table_name = \'' +
    escapeSqlLiteral(tableName) +
    '\'';
}

function buildBenchmarkPartitionLookupByTableIdSql(tableId) {
  return 'SELECT partition_id FROM partitions WHERE table_id = \'' +
    escapeSqlLiteral(tableId) +
    '\'';
}

function buildBenchmarkPartitionRepairSql(tableName, tableId) {
  return 'UPDATE partitions SET table_name = \'' +
    escapeSqlLiteral(tableName) +
    '\' WHERE table_id = \'' +
    escapeSqlLiteral(tableId) +
    '\'';
}

function buildSutTableProbeSql(tableName) {
  return SUT_TABLE_PROBE_SQL_PREFIX + tableName + SUT_TABLE_PROBE_SQL_SUFFIX;
}

function firstStringField(rows, ...keys) {
  for (const row of rows) {
    for (const key of keys) {
      const value = row?.[key];
      if (typeof value === 'string' && value.length > ZERO) {
        return value;
      }
    }
  }
  return null;
}

async function querySutTableId(nodeClient, seedNode, tableName) {
  const result = await nodeClient.queryControl(
    seedNode,
    buildBenchmarkTableLookupSql(tableName),
  );
  const rows = rowsFromQueryResult(result);
  return firstStringField(rows, 'table_id', 'tableId');
}

function resolveScenarioOverrides(cluster) {
  const overrides = cluster?._scenarioOverrides?.postgresBaselineComparison;
  const createPostgresPool =
    typeof overrides?.createPostgresPool === 'function' ?
      overrides.createPostgresPool :
      (options) => new Pool(options);
  const createLoadGenerator =
    typeof overrides?.createLoadGenerator === 'function' ?
      overrides.createLoadGenerator :
      (nodes, options) => new LoadGenerator(nodes, options);
  return {
    createPostgresPool,
    createLoadGenerator,
  };
}

function resolveNodeClientChannelPolicyOverrides(cluster) {
  const channelPolicies = cluster?._config?.nodeClient?.channelPolicies;
  if (!channelPolicies || typeof channelPolicies !== 'object') {
    return null;
  }
  return channelPolicies;
}

async function ensureSutBenchmarkTable(nodeClient, seedNode, tableName) {
  await nodeClient.queryControl(seedNode, buildBenchmarkTableDdl(tableName));
  const tableId = await querySutTableId(nodeClient, seedNode, tableName);
  if (!tableId) {
    return;
  }
  await nodeClient.queryControl(
    seedNode,
    buildBenchmarkPartitionRepairSql(tableName, tableId),
  );
}

async function ensurePostgresBenchmarkTable(pool, tableName) {
  await pool.query(buildBenchmarkTableDdl(tableName));
}

function isRetriableTableReadyError(error) {
  const message = String(error?.message || '').toLowerCase();
  if (!message) {
    return false;
  }
  return message.includes('no partitions available for table') ||
    message.includes('table') && message.includes('not found') ||
    message.includes('connect econnrefused') ||
    message.includes('timed out');
}

function rowsFromQueryResult(result) {
  if (Array.isArray(result?.rows)) {
    return result.rows;
  }
  if (Array.isArray(result)) {
    return result;
  }
  return [];
}

async function waitForSutBenchmarkTableReady(
  nodeClient,
  seedNode,
  tableName,
  options = {},
) {
  const timeoutMs = Number.isInteger(options.timeoutMs) ?
    options.timeoutMs :
    BENCHMARK_DEFAULTS.readyTimeoutMs;
  const pollIntervalMs = Number.isInteger(options.pollIntervalMs) ?
    options.pollIntervalMs :
    BENCHMARK_DEFAULTS.readyPollIntervalMs;
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const tableNameResult = await nodeClient.queryControl(
        seedNode,
        buildBenchmarkPartitionLookupSql(tableName),
      );
      const tableNameRows = rowsFromQueryResult(tableNameResult);
      if (tableNameRows.length > ZERO) {
        return;
      }

      const tableId = await querySutTableId(nodeClient, seedNode, tableName);
      if (tableId) {
        const tableIdResult = await nodeClient.queryControl(
          seedNode,
          buildBenchmarkPartitionLookupByTableIdSql(tableId),
        );
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
    await sleep(pollIntervalMs);
  }

  if (lastError) {
    throw new Error(
      'Benchmark table "' + tableName + '" was not ready within ' +
      timeoutMs + 'ms: ' + String(lastError.message || lastError),
    );
  }
  throw new Error(
    'Benchmark table "' + tableName + '" was not ready within ' +
    timeoutMs + 'ms',
  );
}

function buildBaselineLoadNodes(pool, nodeCount) {
  const count = Number.isInteger(nodeCount) && nodeCount > ZERO ?
    nodeCount :
    ONE;
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
  tableName,
}) {
  const loadNodes = buildBaselineLoadNodes(pool, loadNodeCount);
  const loadGenerator = createLoadGenerator(loadNodes, {
    opsPerSec: loadOpsPerSec,
    duration: loadDuration,
    maxInFlight: loadMaxInFlight,
    tableName,
    workloadProfile: BENCHMARK_WORKLOAD_PROFILE,
    operations: BENCHMARK_WORKLOAD_OPERATIONS,
  });
  const baselineRun = loadGenerator.start();
  return baselineRun.waitComplete();
}

async function runSutSharedLoad({
  nodeClient,
  loadNodes,
  createLoadGenerator,
  loadOpsPerSec,
  loadDuration,
  loadMaxInFlight,
  loadQueryTimeoutMs,
  loadNodeMaxInFlight,
  tableName,
  nodeFailureThreshold,
  nodeFailureCooldownMs,
}) {
  const routedLoadNodes = loadNodes.map((node) => ({
    id: node.id,
    breakerOwner: LOAD_BREAKER_OWNER_NODE_CLIENT,
    query: (sql) => nodeClient.queryLoad(
      node,
      sql,
      [],
      Number.isInteger(loadQueryTimeoutMs) && loadQueryTimeoutMs > ZERO ?
        {timeoutMs: loadQueryTimeoutMs} :
        {},
    ),
  }));
  const loadGenerator = createLoadGenerator(routedLoadNodes, {
    opsPerSec: loadOpsPerSec,
    duration: loadDuration,
    maxInFlight: loadMaxInFlight,
    tableName,
    workloadProfile: BENCHMARK_WORKLOAD_PROFILE,
    operations: BENCHMARK_WORKLOAD_OPERATIONS,
    ...(Number.isInteger(nodeFailureThreshold) &&
      nodeFailureThreshold > ZERO ?
      {nodeFailureThreshold} :
      {}),
    ...(Number.isInteger(nodeFailureCooldownMs) &&
      nodeFailureCooldownMs > ZERO ?
      {nodeFailureCooldownMs} :
      {}),
    ...(Number.isInteger(loadQueryTimeoutMs) &&
      loadQueryTimeoutMs > ZERO ?
      {queryTimeoutMs: loadQueryTimeoutMs} :
      {}),
    ...(Number.isInteger(loadNodeMaxInFlight) &&
      loadNodeMaxInFlight > ZERO ?
      {nodeMaxInFlight: loadNodeMaxInFlight} :
      {}),
  });
  const loadRun = loadGenerator.start();
  return loadRun.waitComplete();
}

function isNodeAdminReady(diagnostics) {
  if (!diagnostics || typeof diagnostics !== 'object') {
    return false;
  }
  return diagnostics.adminReady === true;
}

function isLoadNodeCandidate(node) {
  return typeof node?.queryWithTimeout === 'function' &&
    typeof node?.getReachabilityDiagnostics === 'function';
}

function summarizeDiscoveryReadinessReasons(readiness) {
  const reasons = Array.isArray(readiness?.[DISCOVERY_READINESS_FIELD_REASONS]) ?
    readiness[DISCOVERY_READINESS_FIELD_REASONS] :
    [];
  if (reasons.length === ZERO) {
    return ['workload_not_ready'];
  }
  const summarized = [];
  for (const reason of reasons) {
    const code = typeof reason?.[DISCOVERY_READINESS_REASON_FIELD_CODE] === 'string' &&
      reason[DISCOVERY_READINESS_REASON_FIELD_CODE].length > ZERO ?
      reason[DISCOVERY_READINESS_REASON_FIELD_CODE] :
      'unknown_reason';
    const detail = typeof reason?.[DISCOVERY_READINESS_REASON_FIELD_DETAIL] === 'string' &&
      reason[DISCOVERY_READINESS_REASON_FIELD_DETAIL].length > ZERO ?
      reason[DISCOVERY_READINESS_REASON_FIELD_DETAIL] :
      null;
    summarized.push(detail ? code + '=' + detail : code);
  }
  return summarized;
}

function summarizeReadinessProbeReasons(options = {}) {
  const reasons = [];
  const errorMessage = typeof options.error === 'string' &&
    options.error.length > ZERO ?
    options.error :
    null;
  if (errorMessage) {
    return [
      DISCOVERY_PROBE_REASON_PROBE_ERROR_PREFIX +
        truncateDiscoveryErrorMessage(errorMessage),
    ];
  }
  const diagnostics = options.diagnostics;
  if (!diagnostics || typeof diagnostics !== 'object') {
    return [DISCOVERY_PROBE_REASON_ADMIN_NOT_READY];
  }
  if (typeof diagnostics.reachableBy === 'string' &&
      diagnostics.reachableBy.length > ZERO) {
    reasons.push(
      DISCOVERY_PROBE_REASON_REACHABLE_BY_PREFIX + diagnostics.reachableBy,
    );
  }
  if (typeof diagnostics.lastError === 'string' &&
      diagnostics.lastError.length > ZERO) {
    reasons.push(
      DISCOVERY_PROBE_REASON_LAST_ERROR_PREFIX +
        truncateDiscoveryErrorMessage(diagnostics.lastError),
    );
  }
  if (reasons.length === ZERO) {
    reasons.push(DISCOVERY_PROBE_REASON_ADMIN_NOT_READY);
  }
  return reasons;
}

function resolveServiceNodeIdsFromDiscovery(snapshot, serviceId, protocol) {
  const services = Array.isArray(snapshot?.[DISCOVERY_FIELD_SERVICES]) ?
    snapshot[DISCOVERY_FIELD_SERVICES] :
    [];
  const discoveredNodeIds = [];
  const excludedReadinessByNodeId = {};
  const seenNodeIds = new Set();
  for (const service of services) {
    if (!service || typeof service !== 'object') {
      continue;
    }
    if (service[DISCOVERY_SERVICE_FIELD_PROTOCOL] !== protocol) {
      continue;
    }
    const serviceIds = Array.isArray(service[DISCOVERY_SERVICE_FIELD_SERVICE_IDS]) ?
      service[DISCOVERY_SERVICE_FIELD_SERVICE_IDS] :
      [];
    if (!serviceIds.includes(serviceId)) {
      continue;
    }
    const serviceReplicas = Array.isArray(service[DISCOVERY_SERVICE_FIELD_REPLICAS]) ?
      service[DISCOVERY_SERVICE_FIELD_REPLICAS] :
      [];
    for (const replica of serviceReplicas) {
      const nodeId = replica?.[DISCOVERY_REPLICA_FIELD_NODE_ID];
      if (typeof nodeId !== 'string' || nodeId.length === ZERO) {
        continue;
      }
      if (seenNodeIds.has(nodeId)) {
        continue;
      }
      seenNodeIds.add(nodeId);
      const readiness = replica?.[DISCOVERY_REPLICA_FIELD_READINESS];
      let includeNodeId = true;
      if (!readiness || typeof readiness !== 'object') {
        excludedReadinessByNodeId[nodeId] = ['readiness_missing'];
      } else if (readiness[DISCOVERY_READINESS_FIELD_WORKLOAD_READY] !== true ||
          readiness[DISCOVERY_READINESS_FIELD_ROUTING_READY] !== true ||
          readiness[DISCOVERY_READINESS_FIELD_SCHEMA_READY] !== true) {
        excludedReadinessByNodeId[nodeId] =
          summarizeDiscoveryReadinessReasons(readiness);
        includeNodeId = false;
      }
      if (includeNodeId) {
        discoveredNodeIds.push(nodeId);
      }
    }
  }
  return {
    nodeIds: discoveredNodeIds,
    excludedReadinessByNodeId,
  };
}

function resolveSutLoadNodeSelectionFromDiscovery(snapshot) {
  const postgresWireSelection = resolveServiceNodeIdsFromDiscovery(
    snapshot,
    NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
    NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
  );
  if (postgresWireSelection.nodeIds.length > ZERO) {
    return {
      nodeIds: postgresWireSelection.nodeIds,
      excludedReadinessByNodeId: postgresWireSelection.excludedReadinessByNodeId,
      selection: DISCOVERY_SELECTION_POSTGRES_WIRE,
      serviceId: NODE_CLIENT_SERVICE_ID_POSTGRES_WIRE,
      protocol: NODE_CLIENT_SERVICE_PROTOCOL_POSTGRESQL,
    };
  }

  return {
    nodeIds: [],
    excludedReadinessByNodeId: {},
    selection: null,
    serviceId: null,
    protocol: null,
  };
}

function truncateDiscoveryErrorMessage(errorMessage) {
  const text = String(errorMessage || '');
  if (text.length <= DISCOVERY_ERROR_MESSAGE_MAX_CHARS) {
    return text;
  }
  return text.slice(
    ZERO,
    DISCOVERY_ERROR_MESSAGE_MAX_CHARS,
  );
}

function buildSutLoadDiscoveryDiagnostics(options = {}) {
  return {
    attempts: Number.isInteger(options.attempts) ? options.attempts : ZERO,
    timedOut: options.timedOut === true,
    discoveredNodeIds: Array.isArray(options.discoveredNodeIds) ?
      [...options.discoveredNodeIds] :
      [],
    candidateNodeIds: Array.isArray(options.candidateNodeIds) ?
      [...options.candidateNodeIds] :
      [],
    reachableNodeIds: Array.isArray(options.reachableNodeIds) ?
      [...options.reachableNodeIds] :
      [],
    sourceResults: Array.isArray(options.sourceResults) ?
      options.sourceResults.map((sourceResult) => ({
        ...sourceResult,
        discoveredNodeIds: Array.isArray(sourceResult?.discoveredNodeIds) ?
          [...sourceResult.discoveredNodeIds] :
          [],
        excludedReadinessByNodeId:
          sourceResult?.excludedReadinessByNodeId &&
          typeof sourceResult.excludedReadinessByNodeId === 'object' ?
            Object.fromEntries(
              Object.entries(sourceResult.excludedReadinessByNodeId)
                .map(([nodeId, reasons]) => [
                  String(nodeId),
                  Array.isArray(reasons) ? reasons.map((reason) => String(reason)) : [],
                ]),
            ) :
            {},
      })) :
      [],
    [DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID]:
      options[DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID] &&
      typeof options[DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID] ===
        'object' ?
        Object.fromEntries(
          Object.entries(
            options[DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID],
          )
            .map(([nodeId, reasons]) => [
              String(nodeId),
              Array.isArray(reasons) ? reasons.map((reason) => String(reason)) : [],
            ]),
        ) :
        {},
    elapsedMs: Number.isFinite(options.elapsedMs) ?
      Math.max(ZERO, Math.floor(options.elapsedMs)) :
      ZERO,
  };
}

function aggregateDiscoveryReadinessExclusionsByNodeId(diagnostics) {
  const aggregated = {};
  const sourceResults = Array.isArray(diagnostics?.sourceResults) ?
    diagnostics.sourceResults :
    [];
  for (const sourceResult of sourceResults) {
    const exclusions = sourceResult?.excludedReadinessByNodeId &&
      typeof sourceResult.excludedReadinessByNodeId === 'object' ?
      sourceResult.excludedReadinessByNodeId :
      {};
    for (const [nodeId, reasons] of Object.entries(exclusions)) {
      if (!Object.prototype.hasOwnProperty.call(aggregated, nodeId)) {
        aggregated[nodeId] = [];
      }
      const reasonList = Array.isArray(reasons) ?
        reasons.map((reason) => String(reason)) :
        [];
      for (const reason of reasonList) {
        if (!aggregated[nodeId].includes(reason)) {
          aggregated[nodeId].push(reason);
        }
      }
    }
  }
  return aggregated;
}

function formatSutLoadDiscoveryDiagnostics(diagnostics) {
  if (!diagnostics || typeof diagnostics !== 'object') {
    return '';
  }
  const attempts = Number.isInteger(diagnostics.attempts) ?
    diagnostics.attempts :
    ZERO;
  const discoveredNodeIds = Array.isArray(diagnostics.discoveredNodeIds) ?
    diagnostics.discoveredNodeIds :
    [];
  const sourceResults = Array.isArray(diagnostics.sourceResults) ?
    diagnostics.sourceResults :
    [];
  const probeReadinessByNodeId =
    diagnostics[DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID] &&
    typeof diagnostics[DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID] ===
      'object' ?
      diagnostics[DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID] :
      {};
  const sourceSummary = sourceResults
    .map((sourceResult) => {
      const nodeId =
        typeof sourceResult?.nodeId === 'string' &&
        sourceResult.nodeId.length > ZERO ?
          sourceResult.nodeId :
          DISCOVERY_UNKNOWN_NODE_ID;
      const status =
        typeof sourceResult?.status === 'string' &&
        sourceResult.status.length > ZERO ?
          sourceResult.status :
          DISCOVERY_SOURCE_STATUS_EMPTY;
      const excludedReadiness = sourceResult?.excludedReadinessByNodeId &&
        typeof sourceResult.excludedReadinessByNodeId === 'object' ?
        Object.entries(sourceResult.excludedReadinessByNodeId)
          .map(([nodeId, reasons]) => {
            const reasonList = Array.isArray(reasons) && reasons.length > ZERO ?
              reasons.join('|') :
              'unknown';
            return String(nodeId) + ':' + reasonList;
          })
          .join(',') :
        '';
      if (status === DISCOVERY_SOURCE_STATUS_ERROR) {
        return nodeId + ':' + status +
          '=' +
          String(sourceResult?.error || 'unknown');
      }
      const sourceNodeIds = Array.isArray(sourceResult?.discoveredNodeIds) ?
        sourceResult.discoveredNodeIds :
        [];
      if (sourceNodeIds.length > ZERO) {
        const serviceId = typeof sourceResult?.serviceId === 'string' &&
          sourceResult.serviceId.length > ZERO ?
          sourceResult.serviceId :
          'unknown-service';
        const protocol = typeof sourceResult?.protocol === 'string' &&
          sourceResult.protocol.length > ZERO ?
          sourceResult.protocol :
          'unknown-protocol';
        const baseSummary = nodeId + ':' + status + '=' +
          serviceId + '@' + protocol + ':' + sourceNodeIds.join('|');
        if (excludedReadiness.length > ZERO) {
          return baseSummary + '[excluded=' + excludedReadiness + ']';
        }
        return baseSummary;
      }
      if (excludedReadiness.length > ZERO) {
        return nodeId + ':' + status + '[excluded=' + excludedReadiness + ']';
      }
      return nodeId + ':' + status;
    })
    .join(';');
  const probeSummary = Object.entries(probeReadinessByNodeId)
    .map(([nodeId, reasons]) => {
      const reasonList = Array.isArray(reasons) && reasons.length > ZERO ?
        reasons.join('|') :
        DISCOVERY_PROBE_REASON_ADMIN_NOT_READY;
      return String(nodeId) + ':' + reasonList;
    })
    .join(';');
  const diagnosticsSummary = [
    'attempts=' + String(attempts),
    'timedOut=' + String(diagnostics.timedOut === true),
    'discovered=' +
      (discoveredNodeIds.length > ZERO ? discoveredNodeIds.join('|') : 'none'),
  ];
  if (sourceSummary.length > ZERO) {
    diagnosticsSummary.push('sources=' + sourceSummary);
  }
  if (probeSummary.length > ZERO) {
    diagnosticsSummary.push(
      DISCOVERY_DIAGNOSTIC_PREFIX_PROBES + probeSummary,
    );
  }
  return diagnosticsSummary.join(', ');
}

function summarizeControlSnapshotErrors(errors) {
  const normalizedErrors = Array.isArray(errors) ? errors : [];
  if (normalizedErrors.length === ZERO) {
    return QUIESCENCE_REASON_NO_SNAPSHOT_CANDIDATE;
  }
  const limitedErrors = normalizedErrors.slice(
    ZERO,
    QUIESCENCE_SNAPSHOT_ERROR_MAX_ENTRIES,
  );
  const errorSegments = limitedErrors.map((entry) =>
    String(entry.nodeId || 'unknown') +
      QUIESCENCE_SNAPSHOT_ERROR_ASSIGN +
      String(entry.error || 'unknown'));
  const remainingCount = normalizedErrors.length - limitedErrors.length;
  if (remainingCount > ZERO) {
    errorSegments.push(
      String(remainingCount) + QUIESCENCE_SNAPSHOT_ERROR_MORE_SUFFIX,
    );
  }
  return QUIESCENCE_REASON_SNAPSHOT_QUERY_ERROR_PREFIX +
    errorSegments.join(QUIESCENCE_SNAPSHOT_ERROR_SEPARATOR);
}

function resolveControlSnapshotCandidates(seedNode, loadNodes) {
  const nodes = [];
  if (seedNode) {
    nodes.push(seedNode);
  }
  if (Array.isArray(loadNodes)) {
    nodes.push(...loadNodes);
  }
  const seenNodeIds = new Set();
  const candidates = [];
  for (const node of nodes) {
    const nodeId = typeof node?.id === 'string' && node.id.length > ZERO ?
      node.id :
      null;
    if (!nodeId) {
      continue;
    }
    if (seenNodeIds.has(nodeId)) {
      continue;
    }
    seenNodeIds.add(nodeId);
    candidates.push(node);
  }
  return candidates;
}

function resolveRequiredReachableLoadNodeCount(options = {}, candidateCount) {
  const boundedCandidateCount = Number.isInteger(candidateCount) &&
    candidateCount > ZERO ?
    candidateCount :
    ONE;
  const requestedMinimum = Number.isInteger(options.minReachableNodeCount) &&
    options.minReachableNodeCount > ZERO ?
    options.minReachableNodeCount :
    ONE;
  return Math.max(
    ONE,
    Math.min(boundedCandidateCount, requestedMinimum),
  );
}

async function fetchControlSnapshotFromCandidates(
  nodeClient,
  candidates,
  context = {},
) {
  if (!Array.isArray(candidates) || candidates.length === ZERO) {
    throw new Error(QUIESCENCE_REASON_NO_SNAPSHOT_CANDIDATE);
  }
  const errors = [];
  for (const node of candidates) {
    const nodeId = typeof node?.id === 'string' && node.id.length > ZERO ?
      node.id :
      'unknown';
    try {
      return await nodeClient.fetchControlSnapshot(node, context);
    } catch (error) {
      errors.push({
        nodeId,
        error: String(error?.message || error),
      });
    }
  }
  throw new Error(summarizeControlSnapshotErrors(errors));
}

async function resolveSutLoadNodes(nodeClient, nodes, seedNode, options = {}) {
  const candidates = Array.isArray(nodes) ?
    nodes.filter((node) => isLoadNodeCandidate(node)) :
    [];
  if (candidates.length === ZERO || !isLoadNodeCandidate(seedNode)) {
    return {
      nodes: [],
      diagnostics: buildSutLoadDiscoveryDiagnostics({
        attempts: ZERO,
      }),
    };
  }
  const requiredReachableNodeCount = resolveRequiredReachableLoadNodeCount(
    options,
    candidates.length,
  );

  const candidateById = new Map();
  for (const node of candidates) {
    if (typeof node?.id === 'string' && node.id.length > ZERO) {
      candidateById.set(node.id, node);
    }
  }

  const discoverySources = [seedNode];
  for (const node of candidates) {
    if (node.id !== seedNode.id) {
      discoverySources.push(node);
    }
  }

  const timeoutMs = Number.isInteger(options.timeoutMs) &&
    options.timeoutMs > ZERO ?
    options.timeoutMs :
    BENCHMARK_DEFAULTS.readyTimeoutMs;
  const pollIntervalMs = Number.isInteger(options.pollIntervalMs) &&
    options.pollIntervalMs > ZERO ?
    options.pollIntervalMs :
    BENCHMARK_DEFAULTS.readyPollIntervalMs;
  const discoveryTableName = normalizeTableName(options.tableName, '');
  const discoveryContext = discoveryTableName.length > ZERO ?
    {
      ...NODE_CLIENT_TRANSIENT_CONTEXT,
      [NODE_CLIENT_DISCOVERY_CONTEXT_TABLE_NAME]: discoveryTableName,
    } :
    NODE_CLIENT_TRANSIENT_CONTEXT;
  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let attempts = ZERO;
  let lastSourceResults = [];
  let lastDiscoveredNodeIds = [];
  let lastCandidateNodeIds = [];
  let lastReachableNodeIds = [];
  let lastProbeReadinessByNodeId = {};
  let bestReachableCandidates = [];
  let bestSourceResults = [];
  let bestDiscoveredNodeIds = [];
  let bestCandidateNodeIds = [];
  let bestReachableNodeIds = [];
  let bestProbeReadinessByNodeId = {};
  let attemptsSinceBestReachableImprovement = ZERO;

  while (true) {
    attempts += ONE;
    const discoveredNodeIds = [];
    const discoveredNodeIdSet = new Set();
    const sourceResults = [];
    for (const sourceNode of discoverySources) {
      const sourceNodeId = typeof sourceNode?.id === 'string' &&
        sourceNode.id.length > ZERO ?
        sourceNode.id :
        DISCOVERY_UNKNOWN_NODE_ID;
      try {
        const snapshot = await nodeClient.fetchServiceDiscovery(
          sourceNode,
          discoveryContext,
        );
        const discoverySelection =
          resolveSutLoadNodeSelectionFromDiscovery(snapshot);
        const snapshotNodeIds = discoverySelection.nodeIds;
        if (snapshotNodeIds.length > ZERO) {
          sourceResults.push({
            nodeId: sourceNodeId,
            status: DISCOVERY_SOURCE_STATUS_DISCOVERED,
            discoveredNodeIds: snapshotNodeIds,
            selection: discoverySelection.selection,
            serviceId: discoverySelection.serviceId,
            protocol: discoverySelection.protocol,
            excludedReadinessByNodeId:
              discoverySelection.excludedReadinessByNodeId,
          });
          for (const discoveredNodeId of snapshotNodeIds) {
            if (discoveredNodeIdSet.has(discoveredNodeId)) {
              continue;
            }
            discoveredNodeIdSet.add(discoveredNodeId);
            discoveredNodeIds.push(discoveredNodeId);
          }
          continue;
        }
        sourceResults.push({
          nodeId: sourceNodeId,
          status: DISCOVERY_SOURCE_STATUS_EMPTY,
          discoveredNodeIds: [],
          excludedReadinessByNodeId:
            discoverySelection.excludedReadinessByNodeId,
        });
      } catch (error) {
        sourceResults.push({
          nodeId: sourceNodeId,
          status: DISCOVERY_SOURCE_STATUS_ERROR,
          discoveredNodeIds: [],
          error: truncateDiscoveryErrorMessage(error?.message || error),
        });
      }
    }
    lastSourceResults = sourceResults;
    lastDiscoveredNodeIds = discoveredNodeIds;
    if (discoveredNodeIds.length > ZERO) {
      const discoveredNodeIdSet = new Set(discoveredNodeIds);
      const discoveredCandidates = [...candidateById.values()].filter((node) =>
        discoveredNodeIdSet.has(node.id),
      );
      lastCandidateNodeIds = discoveredCandidates.map((node) => node.id);
      if (discoveredCandidates.length > ZERO) {
        const readinessProbeResults = await Promise.all(
          discoveredCandidates.map(async (node) => {
            try {
              const diagnostics = await nodeClient.probeReadiness(node);
              return {
                node,
                diagnostics,
                error: null,
                adminReady: isNodeAdminReady(diagnostics),
              };
            } catch (_error) {
              return {
                node,
                diagnostics: null,
                error: String(_error?.message || _error),
                adminReady: false,
              };
            }
          }),
        );
        const reachableCandidates = [];
        const probeReadinessByNodeId = {};
        for (const probeResult of readinessProbeResults) {
          const nodeId = String(probeResult?.node?.id || DISCOVERY_UNKNOWN_NODE_ID);
          if (probeResult?.adminReady === true) {
            reachableCandidates.push(probeResult.node);
            continue;
          }
          probeReadinessByNodeId[nodeId] = summarizeReadinessProbeReasons({
            diagnostics: probeResult?.diagnostics,
            error: probeResult?.error,
          });
        }
        lastProbeReadinessByNodeId = probeReadinessByNodeId;
        lastReachableNodeIds = reachableCandidates.map((node) => node.id);
        if (reachableCandidates.length > bestReachableCandidates.length) {
          bestReachableCandidates = [...reachableCandidates];
          bestSourceResults = sourceResults;
          bestDiscoveredNodeIds = [...discoveredNodeIds];
          bestCandidateNodeIds = [...lastCandidateNodeIds];
          bestReachableNodeIds = [...lastReachableNodeIds];
          bestProbeReadinessByNodeId = {
            ...probeReadinessByNodeId,
          };
          attemptsSinceBestReachableImprovement = ZERO;
        } else if (bestReachableCandidates.length > ZERO &&
            bestReachableCandidates.length < requiredReachableNodeCount) {
          attemptsSinceBestReachableImprovement += ONE;
        }
        if (reachableCandidates.length >= requiredReachableNodeCount) {
          return {
            nodes: reachableCandidates,
            diagnostics: buildSutLoadDiscoveryDiagnostics({
              attempts,
              timedOut: false,
              discoveredNodeIds,
              candidateNodeIds: lastCandidateNodeIds,
              reachableNodeIds: lastReachableNodeIds,
              sourceResults,
              [DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID]:
                lastProbeReadinessByNodeId,
              elapsedMs: Date.now() - startedAt,
            }),
          };
        }
        if (bestReachableCandidates.length > ZERO &&
            bestReachableCandidates.length < requiredReachableNodeCount &&
            attemptsSinceBestReachableImprovement >=
              DISCOVERY_STALLED_ATTEMPT_THRESHOLD) {
          return {
            nodes: bestReachableCandidates,
            diagnostics: buildSutLoadDiscoveryDiagnostics({
              attempts,
              timedOut: true,
              discoveredNodeIds: bestDiscoveredNodeIds,
              candidateNodeIds: bestCandidateNodeIds,
              reachableNodeIds: bestReachableNodeIds,
              sourceResults: bestSourceResults,
              [DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID]:
                bestProbeReadinessByNodeId,
              elapsedMs: Date.now() - startedAt,
            }),
          };
        }
      }
    }
    if (Date.now() >= deadline) {
      const timedOutNodes = bestReachableCandidates.length > ZERO ?
        bestReachableCandidates :
        [];
      const timedOutSourceResults = bestReachableCandidates.length > ZERO ?
        bestSourceResults :
        lastSourceResults;
      const timedOutDiscoveredNodeIds = bestReachableCandidates.length > ZERO ?
        bestDiscoveredNodeIds :
        lastDiscoveredNodeIds;
      const timedOutCandidateNodeIds = bestReachableCandidates.length > ZERO ?
        bestCandidateNodeIds :
        lastCandidateNodeIds;
      const timedOutReachableNodeIds = bestReachableCandidates.length > ZERO ?
        bestReachableNodeIds :
        lastReachableNodeIds;
      const timedOutProbeReadinessByNodeId = bestReachableCandidates.length > ZERO ?
        bestProbeReadinessByNodeId :
        lastProbeReadinessByNodeId;
      return {
        nodes: timedOutNodes,
        diagnostics: buildSutLoadDiscoveryDiagnostics({
          attempts,
          timedOut: true,
          discoveredNodeIds: timedOutDiscoveredNodeIds,
          candidateNodeIds: timedOutCandidateNodeIds,
          reachableNodeIds: timedOutReachableNodeIds,
          sourceResults: timedOutSourceResults,
          [DISCOVERY_DIAGNOSTICS_FIELD_PROBE_READINESS_BY_NODE_ID]:
            timedOutProbeReadinessByNodeId,
          elapsedMs: Date.now() - startedAt,
        }),
      };
    }
    await sleep(pollIntervalMs);
  }
}

async function waitForSutLoadQuiescence({
  nodeClient,
  loadNodes,
  seedNode,
  snapshotNodes,
  tableName,
  timeoutMs,
  pollIntervalMs,
  stableWindowMs,
  noProgressTimeoutMs,
}) {
  const tableProbeSql = buildSutTableProbeSql(tableName);
  const effectiveStableWindowMs = Math.max(
    ZERO,
    Number.isFinite(stableWindowMs) ?
      Math.floor(stableWindowMs) :
      QUIESCENCE_DEFAULT_STABLE_WINDOW_MS,
  );
  const effectiveNoProgressTimeoutMs =
    Number.isInteger(noProgressTimeoutMs) && noProgressTimeoutMs > ZERO ?
      noProgressTimeoutMs :
      null;
  let lastLeaderSignature = null;
  let lastLeaderChangeAtMs = Date.now();
  let lastProgressAtMs = Date.now();
  let lowestInFlightCount = Number.POSITIVE_INFINITY;
  let maxLeaderQuietElapsedMs = ZERO;
  let maxIncludedNodeCount = ZERO;
  const gateProgressState = {
    inFlightCount: null,
    leaderQuietElapsedMs: ZERO,
    partitionGroupInFlight: {},
  };
  const gateEngine = new GateEngine();
  const controlSnapshotCandidates = resolveControlSnapshotCandidates(
    seedNode,
    snapshotNodes,
  );
  const gateResult = await gateEngine.waitForGate({
    nodes: loadNodes,
    timeoutMs,
    pollIntervalMs,
    stableWindowMs: effectiveStableWindowMs,
    probeNode: async (node) => {
      try {
        await nodeClient.queryControl(
          node,
          tableProbeSql,
          [],
          NODE_CLIENT_TRANSIENT_CONTEXT,
        );
        return {
          ready: true,
          reasons: [],
        };
      } catch (error) {
        return {
          ready: false,
          reasons: [
            QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX +
              String(node?.id || 'unknown') +
              '=' +
              String(error?.message || error),
          ],
        };
      }
    },
    evaluateGlobalCondition: async () => {
      try {
        const controlSnapshot = await fetchControlSnapshotFromCandidates(
          nodeClient,
          controlSnapshotCandidates,
          NODE_CLIENT_TRANSIENT_CONTEXT,
        );
        const replicaOperations = controlSnapshot?.replicaOperations || {};
        const inFlightCount = Number.isInteger(replicaOperations.inFlightCount) ?
          replicaOperations.inFlightCount :
          ZERO;
        const partitionGroupInFlight =
          replicaOperations.partitionGroupInFlight &&
          typeof replicaOperations.partitionGroupInFlight === 'object' ?
            Object.fromEntries(
              Object.entries(replicaOperations.partitionGroupInFlight)
                .filter((entry) => Number.isInteger(entry[1]) && entry[1] >= ZERO)
                .map(([partitionGroupId, count]) => [
                  String(partitionGroupId),
                  Number(count),
                ]),
            ) :
            {};
        const leaders = controlSnapshot?.leaders &&
          typeof controlSnapshot.leaders === 'object' ?
          controlSnapshot.leaders :
          {};
        const leaderEntries = Object.entries(leaders)
          .sort((left, right) => left[0].localeCompare(right[0]));
        const leaderSignature = JSON.stringify(leaderEntries);
        if (lastLeaderSignature !== null &&
            lastLeaderSignature !== leaderSignature) {
          lastLeaderChangeAtMs = Date.now();
        }
        if (lastLeaderSignature === null) {
          lastLeaderChangeAtMs = Date.now();
        }
        lastLeaderSignature = leaderSignature;

        const leaderCoverageReady = leaderEntries.length > ZERO;
        const leaderQuietElapsedMs = Date.now() - lastLeaderChangeAtMs;
        const leadershipStable = leaderCoverageReady &&
          leaderQuietElapsedMs >= effectiveStableWindowMs;

        const reasons = [];
        if (inFlightCount > ZERO) {
          reasons.push(
            QUIESCENCE_REASON_IN_FLIGHT_NOT_DRAINED_PREFIX +
              String(inFlightCount),
          );
        }
        if (!leadershipStable) {
          reasons.push(
            QUIESCENCE_REASON_LEADERSHIP_UNSTABLE_PREFIX +
              String(leaderQuietElapsedMs),
          );
        }

        gateProgressState.inFlightCount = inFlightCount;
        gateProgressState.leaderQuietElapsedMs = leaderQuietElapsedMs;
        gateProgressState.partitionGroupInFlight = partitionGroupInFlight;

        return {
          ready: reasons.length === ZERO,
          reasons,
        };
      } catch (error) {
        return {
          ready: false,
          reasons: [
            QUIESCENCE_REASON_IN_FLIGHT_QUERY_ERROR_PREFIX +
              String(error?.message || error),
          ],
        };
      }
    },
    abortIf: ({nowMs, includedNodeIds}) => {
      if (effectiveNoProgressTimeoutMs === null) {
        return null;
      }

      let progressObserved = false;
      const inFlightCount = gateProgressState.inFlightCount;
      if (Number.isInteger(inFlightCount) &&
          inFlightCount < lowestInFlightCount) {
        lowestInFlightCount = inFlightCount;
        progressObserved = true;
      }

      const leaderQuietElapsedMs = Number.isFinite(
        gateProgressState.leaderQuietElapsedMs,
      ) ?
        gateProgressState.leaderQuietElapsedMs :
        ZERO;
      if (inFlightCount === ZERO &&
          leaderQuietElapsedMs > maxLeaderQuietElapsedMs) {
        maxLeaderQuietElapsedMs = leaderQuietElapsedMs;
        progressObserved = true;
      }

      const includedCount = Array.isArray(includedNodeIds) ?
        includedNodeIds.length :
        ZERO;
      if (includedCount > maxIncludedNodeCount) {
        maxIncludedNodeCount = includedCount;
        progressObserved = true;
      }

      if (progressObserved) {
        lastProgressAtMs = nowMs;
        return null;
      }

      const stalledMs = nowMs - lastProgressAtMs;
      if (stalledMs >= effectiveNoProgressTimeoutMs) {
        return {
          abort: true,
          reason:
            QUIESCENCE_REASON_STALLED_NO_PROGRESS_PREFIX +
            String(stalledMs),
        };
      }
      return null;
    },
  });

  const includedNodeIds = new Set(gateResult.includedNodeIds || []);
  const readyLoadNodes = loadNodes.filter((node) => includedNodeIds.has(node.id));
  const excludedLoadNodeIds = loadNodes
    .map((node) => node.id)
    .filter((nodeId) => !includedNodeIds.has(nodeId));

  if (gateResult.mode === GATE_RESULT_MODE.ALL_READY) {
    return {
      mode: gateResult.mode,
      attempts: gateResult.attempts,
      stableElapsedMs: gateResult.stableElapsedMs,
      inFlightCount: ZERO,
      readyLoadNodes,
      excludedLoadNodeIds,
      partitionGroupInFlight: {
        ...gateProgressState.partitionGroupInFlight,
      },
      reasonHistogram: gateResult.reasonHistogram || {},
      includedNodeIds: gateResult.includedNodeIds || [],
    };
  }

  const reasonKeys = Object.keys(gateResult.reasonHistogram || {});
  const nodeProbeReasons = reasonKeys.filter((reason) =>
    reason.startsWith(QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX),
  );
  const inFlightQueryReasons = reasonKeys.filter((reason) =>
    reason.startsWith(QUIESCENCE_REASON_IN_FLIGHT_QUERY_ERROR_PREFIX),
  );
  const inFlightCountReasons = reasonKeys.filter((reason) =>
    reason.startsWith(QUIESCENCE_REASON_IN_FLIGHT_NOT_DRAINED_PREFIX),
  );
  const leadershipReasons = reasonKeys.filter((reason) =>
    reason.startsWith(QUIESCENCE_REASON_LEADERSHIP_UNSTABLE_PREFIX),
  );
  const stallReasons = reasonKeys.filter((reason) =>
    reason.startsWith(QUIESCENCE_REASON_STALLED_NO_PROGRESS_PREFIX),
  );

  const details = [];
  if (nodeProbeReasons.length > ZERO) {
    details.push(
      QUIESCENCE_NODE_ERROR_PREFIX +
      nodeProbeReasons.join(QUIESCENCE_NODE_ERROR_SEPARATOR),
    );
  }
  if (inFlightQueryReasons.length > ZERO) {
    details.push(
      QUIESCENCE_IN_FLIGHT_ERROR_PREFIX + inFlightQueryReasons.join(','),
    );
  }
  if (inFlightCountReasons.length > ZERO) {
    details.push(
      QUIESCENCE_IN_FLIGHT_COUNT_PREFIX + inFlightCountReasons.join(','),
    );
  }
  if (leadershipReasons.length > ZERO) {
    details.push('leadershipStability=' + leadershipReasons.join(','));
  }
  if (stallReasons.length > ZERO) {
    details.push(QUIESCENCE_STALL_PREFIX + stallReasons.join(','));
  }
  if (readyLoadNodes.length > ZERO) {
    details.push(
      QUIESCENCE_READY_NODE_COUNT_PREFIX + String(readyLoadNodes.length),
    );
  }

  const errorPrefix = gateResult.aborted === true ?
    'SUT load nodes did not reach quiescent state; gate aborted due to ' +
      'stalled progress' :
    'SUT load nodes did not reach quiescent state within ' +
      timeoutMs +
      'ms';
  const error = new Error(
    errorPrefix +
      (details.length > ZERO ?
        ' (' + details.join(', ') + ')' :
        ''),
  );
  error.gateResult = {
    ...gateResult,
    partitionGroupInFlight: {
      ...gateProgressState.partitionGroupInFlight,
    },
    includedNodeIds: gateResult.includedNodeIds || [],
    excludedNodeIds: gateResult.excludedNodeIds || [],
    reasonHistogram: gateResult.reasonHistogram || {},
  };
  throw error;
}

async function assertClusterConsistencyWithRetry(cluster, options = {}) {
  const maxAttempts = Number.isInteger(options.maxAttempts) &&
    options.maxAttempts > ZERO ?
    options.maxAttempts :
    CONSISTENCY_ASSERT_MAX_ATTEMPTS_DEFAULT;
  const retryDelayMs = Number.isInteger(options.retryDelayMs) &&
    options.retryDelayMs >= ZERO ?
    options.retryDelayMs :
    CONSISTENCY_ASSERT_RETRY_DELAY_MS_DEFAULT;
  let lastError = null;

  for (let attempt = ONE; attempt <= maxAttempts; attempt++) {
    try {
      await cluster.assertConsistency();
      return {attempts: attempt};
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) {
        break;
      }
      if (retryDelayMs > ZERO) {
        await sleep(retryDelayMs);
      }
    }
  }

  throw new Error(
    'Cluster consistency assertion failed after ' +
    maxAttempts +
    ' attempts: ' +
    String(lastError?.message || lastError),
  );
}

function buildPsqlCommand(options = {}) {
  const host = String(options.host || LOCALHOST);
  const port = Number.isInteger(options.port) ?
    options.port :
    DEFAULT_REPLICATION_PORT;
  const user = String(options.user || 'postgres');
  const password = String(options.password || '');
  const database = String(options.database || 'postgres');
  const sql = String(options.sql || '');
  const tuplesOnly = options.tuplesOnly === true ? PSQL_TUPLES_ONLY : '';

  return [
    `PGPASSWORD='${shellQuote(password)}'`,
    'psql',
    PSQL_ON_ERROR_STOP,
    tuplesOnly,
    `-h '${shellQuote(host)}'`,
    `-p ${port}`,
    `-U '${shellQuote(user)}'`,
    `-d '${shellQuote(database)}'`,
    `-c '${shellQuote(sql)}'`,
  ].filter((part) => part.length > ZERO).join(' ');
}

function buildSynchronousStandbySetting(syncReplicaAcks) {
  return SYNC_STANDBY_TEMPLATE_PREFIX +
    String(syncReplicaAcks) +
    SYNC_STANDBY_TEMPLATE_SUFFIX;
}

function buildReplicaBootstrapCommand(primaryContainerName, replicaName, benchmarkConfig) {
  const basebackupConnectionString = [
    `host=${primaryContainerName}`,
    `port=${benchmarkConfig.port}`,
    `user=${benchmarkConfig.user}`,
    `password=${benchmarkConfig.password}`,
    `dbname=${BOOTSTRAP_DB_NAME}`,
    `application_name=${replicaName}`,
  ].join(' ');

  return [
    'set -e',
    'if [ ! -s "$PGDATA/PG_VERSION" ]; then',
    '  rm -rf "$PGDATA"/*',
    `  until pg_isready -h '${shellQuote(primaryContainerName)}' ` +
      `-p ${benchmarkConfig.port} -U '${shellQuote(benchmarkConfig.user)}'; do`,
    '    sleep 1',
    '  done',
    `  pg_basebackup --dbname='${shellQuote(basebackupConnectionString)}' ` +
      '-D "$PGDATA" -Fp -Xs -P -R',
    'fi',
    POSTGRES_BINARY_PATH_EXPORT,
    `exec ${POSTGRES_ENTRYPOINT_COMMAND}`,
  ].join('\n');
}

async function configurePrimaryReplication(provider, containerId, benchmarkConfig) {
  if (benchmarkConfig.replicationFactor <= ONE) {
    return;
  }

  const syncSetting = buildSynchronousStandbySetting(
    benchmarkConfig.syncReplicaAcks,
  );
  const commands = [
    `echo "${REPLICATION_HBA_IPV4}" >> "$PGDATA/pg_hba.conf"`,
    `echo "${REPLICATION_HBA_IPV6}" >> "$PGDATA/pg_hba.conf"`,
    buildPsqlCommand({
      host: LOCALHOST,
      port: benchmarkConfig.port,
      user: benchmarkConfig.user,
      password: benchmarkConfig.password,
      database: benchmarkConfig.database,
      sql: `ALTER SYSTEM SET synchronous_commit = '${SYNCHRONOUS_COMMIT_ON}'`,
    }),
    buildPsqlCommand({
      host: LOCALHOST,
      port: benchmarkConfig.port,
      user: benchmarkConfig.user,
      password: benchmarkConfig.password,
      database: benchmarkConfig.database,
      sql: `ALTER SYSTEM SET synchronous_standby_names = '${syncSetting}'`,
    }),
    buildPsqlCommand({
      host: LOCALHOST,
      port: benchmarkConfig.port,
      user: benchmarkConfig.user,
      password: benchmarkConfig.password,
      database: benchmarkConfig.database,
      sql: 'SELECT pg_reload_conf()',
    }),
  ];

  const shellCommand = commands.join(' && ');
  await execShell(
    provider,
    containerId,
    shellCommand,
    'configure postgres primary replication',
  );
}

async function waitForStreamingReplicas(provider, primaryContainerId, benchmarkConfig) {
  const requiredReplicaCount = benchmarkConfig.replicationFactor - ONE;
  if (requiredReplicaCount <= ZERO) {
    return;
  }

  const deadline = Date.now() + benchmarkConfig.readyTimeoutMs;
  while (Date.now() < deadline) {
    const queryCommand = buildPsqlCommand({
      host: LOCALHOST,
      port: benchmarkConfig.port,
      user: benchmarkConfig.user,
      password: benchmarkConfig.password,
      database: benchmarkConfig.database,
      sql:
        'SELECT count(*) FROM pg_stat_replication ' +
        `WHERE state = '${REPLICATION_STATE_STREAMING}'`,
      tuplesOnly: true,
    });

    const output = await execShell(
      provider,
      primaryContainerId,
      queryCommand,
      'check postgres replication status',
    );
    const replicaCount = Number.parseInt(String(output).trim(), 10);
    if (Number.isInteger(replicaCount) && replicaCount >= requiredReplicaCount) {
      return;
    }
    await sleep(benchmarkConfig.readyPollIntervalMs);
  }

  throw new Error(
    'Postgres replicas did not reach streaming state within ' +
    benchmarkConfig.readyTimeoutMs + 'ms',
  );
}

function resolveBenchmarkConfig(cluster) {
  const configured = cluster?._config?.benchmark || {};
  const tableName = normalizeTableName(
    configured.tableName || BENCHMARK_DEFAULTS.tableName,
    BENCHMARK_EVENT_TABLE_FALLBACK,
  );
  const baselineLoadNodeCount =
    Number.isInteger(configured.clients) && configured.clients > ZERO ?
      configured.clients :
      BENCHMARK_DEFAULTS.clients;
  const replicationFactor = Number.isInteger(configured.replicationFactor) &&
    configured.replicationFactor >= MIN_REPLICATION_FACTOR ?
    configured.replicationFactor :
    BENCHMARK_DEFAULTS.replicationFactor;
  const maxSyncReplicaAcks = Math.max(ZERO, replicationFactor - ONE);
  const minSyncReplicaAcks = replicationFactor > ONE ? ONE : ZERO;
  const syncReplicaAcks = Number.isInteger(configured.syncReplicaAcks) ?
    Math.max(
      minSyncReplicaAcks,
      Math.min(configured.syncReplicaAcks, maxSyncReplicaAcks),
    ) :
    Math.max(
      minSyncReplicaAcks,
      Math.min(BENCHMARK_DEFAULTS.syncReplicaAcks, maxSyncReplicaAcks),
    );
  const baselineCacheTtlMs = Number.isFinite(configured.baselineCacheTtlMs) &&
    configured.baselineCacheTtlMs >= ZERO ?
    Math.floor(configured.baselineCacheTtlMs) :
    BENCHMARK_DEFAULTS.baselineCacheTtlMs;

  return {
    baselineImage: configured.baselineImage ||
      BENCHMARK_DEFAULTS.baselineImage,
    user: configured.user || BENCHMARK_DEFAULTS.user,
    password: configured.password || BENCHMARK_DEFAULTS.password,
    database: configured.database || BENCHMARK_DEFAULTS.database,
    port: Number.isInteger(configured.port) ?
      configured.port :
      BENCHMARK_DEFAULTS.port,
    durationSeconds: Number.isInteger(configured.durationSeconds) ?
      configured.durationSeconds :
      BENCHMARK_DEFAULTS.durationSeconds,
    clients: Number.isInteger(configured.clients) ?
      configured.clients :
      BENCHMARK_DEFAULTS.clients,
    jobs: Number.isInteger(configured.jobs) ?
      configured.jobs :
      BENCHMARK_DEFAULTS.jobs,
    loadOpsPerSec: Number.isInteger(configured.loadOpsPerSec) ?
      configured.loadOpsPerSec :
      BENCHMARK_DEFAULTS.loadOpsPerSec,
    loadDuration: configured.loadDuration || BENCHMARK_DEFAULTS.loadDuration,
    loadMaxInFlight:
      Number.isInteger(configured.loadMaxInFlight) &&
        configured.loadMaxInFlight > ZERO ?
        configured.loadMaxInFlight :
        BENCHMARK_DEFAULTS.loadMaxInFlight,
    loadQueryTimeoutMs:
      Number.isInteger(configured.loadQueryTimeoutMs) &&
        configured.loadQueryTimeoutMs > ZERO ?
        configured.loadQueryTimeoutMs :
        BENCHMARK_DEFAULTS.loadQueryTimeoutMs,
    loadNodeMaxInFlight:
      Number.isInteger(configured.loadNodeMaxInFlight) &&
        configured.loadNodeMaxInFlight > ZERO ?
        configured.loadNodeMaxInFlight :
        null,
    nodeFailureThreshold:
      Number.isInteger(configured.nodeFailureThreshold) &&
        configured.nodeFailureThreshold > ZERO ?
        configured.nodeFailureThreshold :
        null,
    nodeFailureCooldownMs:
      Number.isInteger(configured.nodeFailureCooldownMs) &&
        configured.nodeFailureCooldownMs > ZERO ?
        configured.nodeFailureCooldownMs :
        null,
    readyTimeoutMs: Number.isInteger(configured.readyTimeoutMs) ?
      configured.readyTimeoutMs :
      BENCHMARK_DEFAULTS.readyTimeoutMs,
    readyPollIntervalMs: Number.isInteger(configured.readyPollIntervalMs) ?
      configured.readyPollIntervalMs :
      BENCHMARK_DEFAULTS.readyPollIntervalMs,
    tableName,
    replicationFactor,
    syncReplicaAcks,
    baselineLoadNodeCount,
    failOnLoadParityMismatch:
      configured.failOnLoadParityMismatch === true ||
      configured.failOnParityMismatch === true,
    cacheBaselineMetrics: configured.cacheBaselineMetrics !== false,
    refreshBaselineMetrics: configured.refreshBaselineMetrics === true,
    baselineCacheTtlMs,
    quiescentTimeoutMs:
      Number.isInteger(configured.quiescentTimeoutMs) &&
        configured.quiescentTimeoutMs > ZERO ?
        configured.quiescentTimeoutMs :
        (Number.isInteger(configured.readyTimeoutMs) ?
          configured.readyTimeoutMs :
          BENCHMARK_DEFAULTS.readyTimeoutMs),
    quiescentPollIntervalMs:
      Number.isInteger(configured.quiescentPollIntervalMs) &&
        configured.quiescentPollIntervalMs > ZERO ?
        configured.quiescentPollIntervalMs :
        (Number.isInteger(configured.readyPollIntervalMs) ?
          configured.readyPollIntervalMs :
          BENCHMARK_DEFAULTS.readyPollIntervalMs),
    quiescentStableWindowMs:
      Number.isInteger(configured.quiescentStableWindowMs) &&
        configured.quiescentStableWindowMs >= ZERO ?
        configured.quiescentStableWindowMs :
        QUIESCENCE_DEFAULT_STABLE_WINDOW_MS,
    quiescentNoProgressTimeoutMs:
      Number.isInteger(configured.quiescentNoProgressTimeoutMs) &&
        configured.quiescentNoProgressTimeoutMs > ZERO ?
        configured.quiescentNoProgressTimeoutMs :
        null,
    postLoadDrainTimeoutMs:
      Number.isInteger(configured.postLoadDrainTimeoutMs) &&
        configured.postLoadDrainTimeoutMs > ZERO ?
        configured.postLoadDrainTimeoutMs :
        (Number.isInteger(configured.quiescentTimeoutMs) &&
          configured.quiescentTimeoutMs > ZERO ?
          configured.quiescentTimeoutMs :
          (Number.isInteger(configured.readyTimeoutMs) ?
            configured.readyTimeoutMs :
            BENCHMARK_DEFAULTS.readyTimeoutMs)),
    postLoadDrainPollIntervalMs:
      Number.isInteger(configured.postLoadDrainPollIntervalMs) &&
        configured.postLoadDrainPollIntervalMs > ZERO ?
        configured.postLoadDrainPollIntervalMs :
        (Number.isInteger(configured.quiescentPollIntervalMs) &&
          configured.quiescentPollIntervalMs > ZERO ?
          configured.quiescentPollIntervalMs :
          (Number.isInteger(configured.readyPollIntervalMs) ?
            configured.readyPollIntervalMs :
            BENCHMARK_DEFAULTS.readyPollIntervalMs)),
    postLoadDrainStableWindowMs:
      Number.isInteger(configured.postLoadDrainStableWindowMs) &&
        configured.postLoadDrainStableWindowMs >= ZERO ?
        configured.postLoadDrainStableWindowMs :
        (Number.isInteger(configured.quiescentStableWindowMs) &&
          configured.quiescentStableWindowMs >= ZERO ?
          configured.quiescentStableWindowMs :
          QUIESCENCE_DEFAULT_STABLE_WINDOW_MS),
    postLoadDrainNoProgressTimeoutMs:
      Number.isInteger(configured.postLoadDrainNoProgressTimeoutMs) &&
        configured.postLoadDrainNoProgressTimeoutMs > ZERO ?
        configured.postLoadDrainNoProgressTimeoutMs :
        (Number.isInteger(configured.quiescentNoProgressTimeoutMs) &&
          configured.quiescentNoProgressTimeoutMs > ZERO ?
          configured.quiescentNoProgressTimeoutMs :
          null),
    consistencyAssertMaxAttempts:
      Number.isInteger(configured.consistencyAssertMaxAttempts) &&
        configured.consistencyAssertMaxAttempts > ZERO ?
        configured.consistencyAssertMaxAttempts :
        CONSISTENCY_ASSERT_MAX_ATTEMPTS_DEFAULT,
    consistencyAssertRetryDelayMs:
      Number.isInteger(configured.consistencyAssertRetryDelayMs) &&
        configured.consistencyAssertRetryDelayMs >= ZERO ?
        configured.consistencyAssertRetryDelayMs :
        CONSISTENCY_ASSERT_RETRY_DELAY_MS_DEFAULT,
    insufficientEvidencePolicy:
      configured.insufficientEvidencePolicy === ASSERTION_POLICY.HARD ?
        ASSERTION_POLICY.HARD :
        ASSERTION_POLICY.SOFT,
  };
}

function resolvePrimaryProvider(cluster) {
  const hostAssignment = cluster?._hostAssignment;
  const providers = cluster?._providers;
  const primaryIndex = Array.isArray(hostAssignment) &&
    hostAssignment.length > ZERO ?
    hostAssignment[ZERO] :
    ZERO;

  const provider = Array.isArray(providers) ?
    providers[primaryIndex] :
    null;
  assert.ok(provider, 'Primary Docker provider is not available on cluster');
  return provider;
}

function resolveCacheBaseDir(cluster) {
  const configuredOutputDir = cluster?._config?.outputDir;
  if (typeof configuredOutputDir !== 'string' ||
      configuredOutputDir.length === ZERO) {
    return null;
  }
  const normalizedPath = configuredOutputDir.trim();
  if (normalizedPath.length === ZERO) {
    return null;
  }
  const lowerPath = normalizedPath.toLowerCase();
  if (lowerPath.endsWith('.json')) {
    return dirname(normalizedPath);
  }
  return normalizedPath;
}

function resolveMachineProfile() {
  const cpuList = osCpus() || [];
  const firstCpu = cpuList[ZERO] || {};
  return {
    platform: osPlatform(),
    arch: osArch(),
    hostname: osHostname(),
    cpuCount: cpuList.length,
    cpuModel: String(firstCpu.model || 'unknown'),
  };
}

function buildBaselineCacheIdentity(benchmarkConfig, cacheBaseDir) {
  const signature = {
    schemaVersion: BASELINE_CACHE_SCHEMA_VERSION,
    engine: 'postgres',
    machine: resolveMachineProfile(),
    benchmark: {
      baselineImage: benchmarkConfig.baselineImage,
      user: benchmarkConfig.user,
      database: benchmarkConfig.database,
      port: benchmarkConfig.port,
      loadOpsPerSec: benchmarkConfig.loadOpsPerSec,
      loadDurationMs: parseDurationToMs(benchmarkConfig.loadDuration),
      loadMaxInFlight: benchmarkConfig.loadMaxInFlight,
      loadNodeCount: benchmarkConfig.baselineLoadNodeCount,
      tableName: benchmarkConfig.tableName,
      workloadProfile: BENCHMARK_WORKLOAD_PROFILE,
      operations: BENCHMARK_WORKLOAD_OPERATIONS,
      replicationFactor: benchmarkConfig.replicationFactor,
      syncReplicaAcks: benchmarkConfig.syncReplicaAcks,
    },
  };
  const digest = createHash(BASELINE_CACHE_HASH_ALGORITHM)
    .update(JSON.stringify(signature))
    .digest('hex');
  const key = `v${BASELINE_CACHE_SCHEMA_VERSION}-${digest}`;
  const path = cacheBaseDir ?
    join(cacheBaseDir, BASELINE_CACHE_DIRNAME, key + BASELINE_CACHE_FILE_EXTENSION) :
    null;
  return {key, path, signature};
}

function buildBaselineCacheMetadata(cacheIdentity, fields = {}) {
  return {
    enabled: true,
    hit: false,
    key: cacheIdentity?.key || null,
    path: cacheIdentity?.path || null,
    cachedAt: null,
    reason: null,
    ...fields,
  };
}

function isValidBaselineMetrics(metrics) {
  if (!metrics || typeof metrics !== 'object') {
    return false;
  }
  const baselineOpsPerSec = Number(
    metrics.opsPerSec ?? metrics.tps,
  );
  return Number.isFinite(baselineOpsPerSec) && baselineOpsPerSec > ZERO;
}

function isCacheEntryFresh(cachedAt, ttlMs) {
  if (!Number.isFinite(ttlMs) || ttlMs <= ZERO) {
    return true;
  }
  const cachedAtMs = Date.parse(String(cachedAt || ''));
  if (!Number.isFinite(cachedAtMs)) {
    return false;
  }
  return (Date.now() - cachedAtMs) <= ttlMs;
}

async function loadBaselineMetricsFromCache(cacheIdentity, benchmarkConfig) {
  const metadata = buildBaselineCacheMetadata(cacheIdentity, {
    enabled: benchmarkConfig.cacheBaselineMetrics === true,
  });
  if (metadata.enabled !== true) {
    metadata.reason = BASELINE_CACHE_DISABLED_REASON;
    return {metrics: null, metadata};
  }
  if (benchmarkConfig.refreshBaselineMetrics === true) {
    metadata.reason = BASELINE_CACHE_REFRESH_REASON;
    return {metrics: null, metadata};
  }
  if (!cacheIdentity?.path) {
    metadata.reason = BASELINE_CACHE_MISS_REASON;
    return {metrics: null, metadata};
  }

  try {
    const raw = await readFile(cacheIdentity.path, 'utf8');
    const parsed = JSON.parse(raw);
    const cachedAt = parsed?.cachedAt || null;
    if (!isCacheEntryFresh(cachedAt, benchmarkConfig.baselineCacheTtlMs)) {
      metadata.cachedAt = cachedAt;
      metadata.reason = BASELINE_CACHE_STALE_REASON;
      return {metrics: null, metadata};
    }
    const metrics = parsed?.metrics;
    if (!isValidBaselineMetrics(metrics)) {
      metadata.cachedAt = cachedAt;
      metadata.reason = BASELINE_CACHE_INVALID_REASON;
      return {metrics: null, metadata};
    }

    metadata.hit = true;
    metadata.cachedAt = cachedAt;
    metadata.reason = BASELINE_CACHE_HIT_REASON;
    return {metrics, metadata};
  } catch (error) {
    if (error?.code === 'ENOENT') {
      metadata.reason = BASELINE_CACHE_MISS_REASON;
      return {metrics: null, metadata};
    }
    metadata.reason = BASELINE_CACHE_INVALID_REASON;
    return {metrics: null, metadata};
  }
}

async function storeBaselineMetricsInCache(
  cacheIdentity,
  benchmarkConfig,
  baselineMetrics,
) {
  const metadata = buildBaselineCacheMetadata(cacheIdentity, {
    enabled: benchmarkConfig.cacheBaselineMetrics === true,
    hit: false,
  });
  if (metadata.enabled !== true || !cacheIdentity?.path ||
      !isValidBaselineMetrics(baselineMetrics)) {
    metadata.reason = metadata.enabled === true ?
      BASELINE_CACHE_MISS_REASON :
      BASELINE_CACHE_DISABLED_REASON;
    return metadata;
  }

  const payload = {
    schemaVersion: BASELINE_CACHE_SCHEMA_VERSION,
    key: cacheIdentity.key,
    signature: cacheIdentity.signature,
    cachedAt: new Date().toISOString(),
    metrics: baselineMetrics,
  };
  await mkdir(dirname(cacheIdentity.path), {recursive: true});
  await writeFile(cacheIdentity.path, JSON.stringify(payload, null, 2), 'utf8');
  metadata.cachedAt = payload.cachedAt;
  metadata.reason = BASELINE_CACHE_STORE_REASON;
  return metadata;
}

function buildComparison(loadMetrics, baselineMetrics) {
  const sutOpsPerSec = Number(loadMetrics?.opsPerSec || ZERO);
  const sutP99LatencyMs = Number(loadMetrics?.latency?.p99 || ZERO);
  const baselineTps = Number(
    baselineMetrics?.opsPerSec ?? baselineMetrics?.tps ?? ZERO,
  );
  const baselineLatencyAvgMs = Number(
    baselineMetrics?.latency?.avg ??
      baselineMetrics?.latencyAverageMs ??
      ZERO,
  );

  return {
    sutOpsPerSec,
    sutP99LatencyMs,
    baselineTps,
    baselineLatencyAvgMs,
    throughputRatioSutToBaseline: baselineTps > ZERO ?
      sutOpsPerSec / baselineTps :
      null,
    p99LatencyRatioSutToBaselineAvg: baselineLatencyAvgMs > ZERO ?
      sutP99LatencyMs / baselineLatencyAvgMs :
      null,
  };
}

function normalizeLoadMetricNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return ZERO;
  }
  return parsed;
}

function normalizeLoadMetrics(loadMetrics) {
  const normalizedLoadMetrics =
    loadMetrics && typeof loadMetrics === 'object' && !Array.isArray(loadMetrics) ?
      {...loadMetrics} :
      {};
  const latency = normalizedLoadMetrics.latency &&
    typeof normalizedLoadMetrics.latency === 'object' ?
    normalizedLoadMetrics.latency :
    {};
  const queueDelay = normalizedLoadMetrics.queueDelay &&
    typeof normalizedLoadMetrics.queueDelay === 'object' ?
    normalizedLoadMetrics.queueDelay :
    {};
  const undispatchedByReason = normalizedLoadMetrics.undispatchedByReason &&
    typeof normalizedLoadMetrics.undispatchedByReason === 'object' ?
    normalizedLoadMetrics.undispatchedByReason :
    {};

  normalizedLoadMetrics.total = normalizeLoadMetricNumber(normalizedLoadMetrics.total);
  normalizedLoadMetrics.success = normalizeLoadMetricNumber(
    normalizedLoadMetrics.success,
  );
  normalizedLoadMetrics.failed = normalizeLoadMetricNumber(normalizedLoadMetrics.failed);
  normalizedLoadMetrics.errors = normalizeLoadMetricNumber(normalizedLoadMetrics.errors);
  normalizedLoadMetrics.attemptErrors = normalizeLoadMetricNumber(
    normalizedLoadMetrics.attemptErrors,
  );
  normalizedLoadMetrics.opsPerSec = normalizeLoadMetricNumber(
    normalizedLoadMetrics.opsPerSec,
  );
  normalizedLoadMetrics.latency = {
    avg: normalizeLoadMetricNumber(latency.avg),
    p50: normalizeLoadMetricNumber(latency.p50),
    p95: normalizeLoadMetricNumber(latency.p95),
    p99: normalizeLoadMetricNumber(latency.p99),
  };
  normalizedLoadMetrics.queueDelay = {
    avg: normalizeLoadMetricNumber(queueDelay.avg),
    p50: normalizeLoadMetricNumber(queueDelay.p50),
    p95: normalizeLoadMetricNumber(queueDelay.p95),
    p99: normalizeLoadMetricNumber(queueDelay.p99),
    max: normalizeLoadMetricNumber(queueDelay.max),
  };
  normalizedLoadMetrics.targetOperations = normalizeLoadMetricNumber(
    normalizedLoadMetrics.targetOperations,
  );
  normalizedLoadMetrics.dispatchedOperations = normalizeLoadMetricNumber(
    normalizedLoadMetrics.dispatchedOperations,
  );
  normalizedLoadMetrics.undispatchedOperations = normalizeLoadMetricNumber(
    normalizedLoadMetrics.undispatchedOperations,
  );
  normalizedLoadMetrics.undispatchedByReason = {
    [LOAD_METRIC_UNDISPATCHED_REASON_CAPACITY]:
      normalizeLoadMetricNumber(
        undispatchedByReason[LOAD_METRIC_UNDISPATCHED_REASON_CAPACITY],
      ),
    [LOAD_METRIC_UNDISPATCHED_REASON_DURATION_TIMEOUT]:
      normalizeLoadMetricNumber(
        undispatchedByReason[LOAD_METRIC_UNDISPATCHED_REASON_DURATION_TIMEOUT],
      ),
    [LOAD_METRIC_UNDISPATCHED_REASON_CANCELLED]:
      normalizeLoadMetricNumber(
        undispatchedByReason[LOAD_METRIC_UNDISPATCHED_REASON_CANCELLED],
      ),
  };
  normalizedLoadMetrics.perNode = normalizedLoadMetrics.perNode &&
    typeof normalizedLoadMetrics.perNode === 'object' &&
    !Array.isArray(normalizedLoadMetrics.perNode) ?
    normalizedLoadMetrics.perNode :
    {};

  return normalizedLoadMetrics;
}

function normalizeDiagnosticsSampleCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return ZERO;
  }
  return Math.max(ZERO, Math.floor(parsed));
}

function resolveDiagnosticsCoverage(convergence) {
  const sampleCounts =
    convergence?.diagnostics?.writePath?.sampleCounts &&
    typeof convergence.diagnostics.writePath.sampleCounts === 'object' ?
      convergence.diagnostics.writePath.sampleCounts :
      {};
  const writePathSamples = {
    [DIAGNOSTICS_SAMPLE_KEY_RAFT_PROPOSE]: normalizeDiagnosticsSampleCount(
      sampleCounts[DIAGNOSTICS_SAMPLE_KEY_RAFT_PROPOSE],
    ),
    [DIAGNOSTICS_SAMPLE_KEY_TRANSPORT_DELIVER]: normalizeDiagnosticsSampleCount(
      sampleCounts[DIAGNOSTICS_SAMPLE_KEY_TRANSPORT_DELIVER],
    ),
    [DIAGNOSTICS_SAMPLE_KEY_SQLITE]: normalizeDiagnosticsSampleCount(
      sampleCounts[DIAGNOSTICS_SAMPLE_KEY_SQLITE],
    ),
  };
  const sampleCount = (
    writePathSamples[DIAGNOSTICS_SAMPLE_KEY_RAFT_PROPOSE] +
    writePathSamples[DIAGNOSTICS_SAMPLE_KEY_TRANSPORT_DELIVER] +
    writePathSamples[DIAGNOSTICS_SAMPLE_KEY_SQLITE]
  );
  if (sampleCount > ZERO) {
    return {
      status: DIAGNOSTICS_COVERAGE_STATUS_AVAILABLE,
      reason: null,
      sampleCount,
      writePathSamples,
    };
  }
  return {
    status: DIAGNOSTICS_COVERAGE_STATUS_UNAVAILABLE,
    reason: DIAGNOSTICS_COVERAGE_REASON_NOT_REPORTED,
    sampleCount: ZERO,
    writePathSamples,
  };
}

function resolveSutPerNodeBudget(benchmarkConfig, nodeClientPolicySnapshot) {
  if (Number.isInteger(benchmarkConfig.loadNodeMaxInFlight) &&
      benchmarkConfig.loadNodeMaxInFlight > ZERO) {
    return benchmarkConfig.loadNodeMaxInFlight;
  }
  const policyBudget = Number(
    nodeClientPolicySnapshot?.[NODE_CLIENT_CHANNEL.LOAD]?.maxInFlightPerNode,
  );
  if (Number.isInteger(policyBudget) && policyBudget > ZERO) {
    return policyBudget;
  }
  return null;
}

function resolveBaselinePerNodeBudget(baselineLoadNodeCount, baselinePoolMaxConnections) {
  const loadNodeCount = Number.isInteger(baselineLoadNodeCount) &&
    baselineLoadNodeCount > ZERO ?
    baselineLoadNodeCount :
    ONE;
  const poolMaxConnections = Number.isInteger(baselinePoolMaxConnections) &&
    baselinePoolMaxConnections > ZERO ?
    baselinePoolMaxConnections :
    ONE;
  return Math.max(
    ONE,
    Math.ceil(poolMaxConnections / loadNodeCount),
  );
}

function buildLoadParity({
  benchmarkConfig,
  benchmarkTableName,
  sutLoadNodes,
  baselineLoadNodeCount,
  baselinePoolMaxConnections,
  nodeClientPolicySnapshot,
}) {
  const effectiveSutLoadNodeCount = Array.isArray(sutLoadNodes) ?
    sutLoadNodes.length :
    ZERO;
  const effectiveBaselineLoadNodeCount =
    Number.isInteger(baselineLoadNodeCount) && baselineLoadNodeCount > ZERO ?
      baselineLoadNodeCount :
      ONE;
  const sutPerNodeBudget = resolveSutPerNodeBudget(
    benchmarkConfig,
    nodeClientPolicySnapshot,
  );
  const baselinePerNodeBudget = resolveBaselinePerNodeBudget(
    effectiveBaselineLoadNodeCount,
    baselinePoolMaxConnections,
  );

  const configured = {
    workloadProfile: BENCHMARK_WORKLOAD_PROFILE,
    operations: BENCHMARK_WORKLOAD_OPERATIONS,
    durationSeconds: parseDurationToMs(benchmarkConfig.loadDuration) / 1000,
    targetOpsPerSec: benchmarkConfig.loadOpsPerSec,
    loadNodeCount: benchmarkConfig.baselineLoadNodeCount,
    loadMaxInFlight: benchmarkConfig.loadMaxInFlight,
    loadNodeMaxInFlight: benchmarkConfig.loadNodeMaxInFlight,
    tableName: benchmarkConfig.tableName,
  };
  const effective = {
    sutLoadNodeCount: effectiveSutLoadNodeCount,
    baselineLoadNodeCount: effectiveBaselineLoadNodeCount,
    sutPerNodeBudget,
    baselinePerNodeBudget,
    tableName: benchmarkTableName,
  };
  const reasons = [];
  if (effectiveSutLoadNodeCount !== effectiveBaselineLoadNodeCount) {
    reasons.push({
      code: LOAD_PARITY_REASON_LOAD_FANOUT_MISMATCH,
      expected: effectiveBaselineLoadNodeCount,
      actual: effectiveSutLoadNodeCount,
    });
  }
  if (Number.isInteger(sutPerNodeBudget) &&
      Number.isInteger(baselinePerNodeBudget) &&
      sutPerNodeBudget !== baselinePerNodeBudget) {
    reasons.push({
      code: LOAD_PARITY_REASON_PER_NODE_BUDGET_MISMATCH,
      expected: baselinePerNodeBudget,
      actual: sutPerNodeBudget,
    });
  }
  if (benchmarkConfig.tableName !== benchmarkTableName) {
    reasons.push({
      code: LOAD_PARITY_REASON_TABLE_NAME_MISMATCH,
      expected: benchmarkTableName,
      actual: benchmarkConfig.tableName,
    });
  }

  return {
    status: reasons.length === ZERO ?
      LOAD_PARITY_STATUS_MATCHED :
      LOAD_PARITY_STATUS_MISMATCHED,
    reasons,
    configured,
    effective,
  };
}

function formatLoadParityReasons(loadParity) {
  const reasons = Array.isArray(loadParity?.reasons) ?
    loadParity.reasons :
    [];
  if (reasons.length === ZERO) {
    return 'unknown';
  }
  return reasons.map((reason) =>
    String(reason?.code || 'unknown') +
    '(expected=' + String(reason?.expected) +
    ',actual=' + String(reason?.actual) + ')')
    .join(', ');
}

function buildEffectiveAdmissionPolicy({
  benchmarkConfig,
  nodeClientPolicySnapshot,
  nodeClientChannelPolicyOverrides,
}) {
  const loadPolicy = nodeClientPolicySnapshot?.[NODE_CLIENT_CHANNEL.LOAD] &&
    typeof nodeClientPolicySnapshot[NODE_CLIENT_CHANNEL.LOAD] === 'object' ?
    nodeClientPolicySnapshot[NODE_CLIENT_CHANNEL.LOAD] :
    {};
  const loadPolicyOverrides =
    nodeClientChannelPolicyOverrides?.[NODE_CLIENT_CHANNEL.LOAD] &&
    typeof nodeClientChannelPolicyOverrides[NODE_CLIENT_CHANNEL.LOAD] === 'object' ?
      nodeClientChannelPolicyOverrides[NODE_CLIENT_CHANNEL.LOAD] :
      {};
  const benchmarkLoadNodeMaxInFlight =
    Number.isInteger(benchmarkConfig.loadNodeMaxInFlight) &&
      benchmarkConfig.loadNodeMaxInFlight > ZERO ?
      benchmarkConfig.loadNodeMaxInFlight :
      null;
  const overrideLoadNodeMaxInFlight =
    Number.isInteger(loadPolicyOverrides.maxInFlightPerNode) &&
      loadPolicyOverrides.maxInFlightPerNode > ZERO ?
      loadPolicyOverrides.maxInFlightPerNode :
      null;
  const conflicts = [];
  if (Number.isInteger(benchmarkLoadNodeMaxInFlight) &&
      Number.isInteger(overrideLoadNodeMaxInFlight) &&
      benchmarkLoadNodeMaxInFlight !== overrideLoadNodeMaxInFlight) {
    conflicts.push({
      code: ADMISSION_CONFLICT_LOAD_NODE_MAX_IN_FLIGHT,
      benchmarkValue: benchmarkLoadNodeMaxInFlight,
      overrideValue: overrideLoadNodeMaxInFlight,
    });
  }
  return {
    sources: {
      benchmark: {
        loadNodeMaxInFlight: benchmarkLoadNodeMaxInFlight,
        loadQueryTimeoutMs: benchmarkConfig.loadQueryTimeoutMs,
        nodeFailureThreshold: benchmarkConfig.nodeFailureThreshold,
        nodeFailureCooldownMs: benchmarkConfig.nodeFailureCooldownMs,
      },
      channelOverrides: {
        loadMaxInFlightPerNode: overrideLoadNodeMaxInFlight,
        loadTimeoutMs:
          Number.isInteger(loadPolicyOverrides.timeoutMs) &&
            loadPolicyOverrides.timeoutMs > ZERO ?
            loadPolicyOverrides.timeoutMs :
            null,
        loadCircuitBreakerThreshold:
          Number.isInteger(loadPolicyOverrides.circuitBreakerThreshold) &&
            loadPolicyOverrides.circuitBreakerThreshold > ZERO ?
            loadPolicyOverrides.circuitBreakerThreshold :
            null,
        loadCooldownMs:
          Number.isInteger(loadPolicyOverrides.cooldownMs) &&
            loadPolicyOverrides.cooldownMs > ZERO ?
            loadPolicyOverrides.cooldownMs :
            null,
      },
    },
    resolved: {
      loadMaxInFlightPerNode:
        Number.isInteger(loadPolicy.maxInFlightPerNode) &&
          loadPolicy.maxInFlightPerNode > ZERO ?
          loadPolicy.maxInFlightPerNode :
          null,
      loadTimeoutMs:
        Number.isInteger(loadPolicy.timeoutMs) &&
          loadPolicy.timeoutMs > ZERO ?
          loadPolicy.timeoutMs :
          null,
      loadCircuitBreakerThreshold:
        Number.isInteger(loadPolicy.circuitBreakerThreshold) &&
          loadPolicy.circuitBreakerThreshold > ZERO ?
          loadPolicy.circuitBreakerThreshold :
          null,
      loadCooldownMs:
        Number.isInteger(loadPolicy.cooldownMs) &&
          loadPolicy.cooldownMs > ZERO ?
          loadPolicy.cooldownMs :
          null,
      loadRetryBudget:
        Number.isInteger(loadPolicy.retryBudget) &&
          loadPolicy.retryBudget >= ZERO ?
          loadPolicy.retryBudget :
          null,
    },
    conflicts,
  };
}

function createInitialPostLoadDrain(effectiveSutLoadNodes, excludedNodeIds) {
  return {
    status: POST_LOAD_DRAIN_STATUS_OK,
    mode: GATE_RESULT_MODE.ALL_READY,
    attempts: ZERO,
    stableElapsedMs: ZERO,
    error: null,
    reasonHistogram: {},
    partitionGroupInFlight: {},
    includedNodeIds: effectiveSutLoadNodes.map((node) => node.id),
    excludedNodeIds: [...excludedNodeIds],
  };
}

async function resolveBaselineMetrics({
  cluster,
  benchmarkConfig,
  scenarioOverrides,
  provider,
  networkName,
  benchmarkTableName,
}) {
  const cacheBaseDir = resolveCacheBaseDir(cluster);
  const baselineCacheIdentity = buildBaselineCacheIdentity(
    benchmarkConfig,
    cacheBaseDir,
  );
  let cacheMetadata = buildBaselineCacheMetadata(
    baselineCacheIdentity,
    {enabled: benchmarkConfig.cacheBaselineMetrics === true},
  );
  const cachedBaseline = await loadBaselineMetricsFromCache(
    baselineCacheIdentity,
    benchmarkConfig,
  );
  cacheMetadata = cachedBaseline.metadata;

  const baselineContainers = [];
  let baselinePrimaryContainerId = null;
  let baselinePrimaryContainerIp = null;
  const baselineReplicaContainerIps = [];
  let baselineMetrics = cachedBaseline.metrics || null;
  let baselineLoadNodeCount = benchmarkConfig.baselineLoadNodeCount;
  let baselinePoolMaxConnections = benchmarkConfig.loadMaxInFlight;

  if (!baselineMetrics) {
    let baselinePool = null;
    try {
      const benchmarkRunId = Date.now();
      const primaryContainerName =
        BENCHMARK_CONTAINER_NAME_PREFIX + benchmarkRunId + BENCHMARK_PRIMARY_SUFFIX;
      const primaryContainer = await provider.createContainer({
        name: primaryContainerName,
        image: benchmarkConfig.baselineImage,
        network: networkName,
        env: {
          [POSTGRES_ENV_USER_KEY]: benchmarkConfig.user,
          [POSTGRES_ENV_PASSWORD_KEY]: benchmarkConfig.password,
          [POSTGRES_ENV_DB_KEY]: benchmarkConfig.database,
          [POSTGRES_ENV_AUTH_METHOD_KEY]: POSTGRES_ENV_AUTH_METHOD_VALUE,
        },
        resourceLimits: cluster?._config?.resourceLimits || {},
        startTimeout: cluster?._config?.timeouts?.nodeStartup,
      });
      baselineContainers.push(primaryContainer);
      baselinePrimaryContainerId = primaryContainer.containerId;
      baselinePrimaryContainerIp = primaryContainer.ip;

      await waitForPostgresReady(provider, baselinePrimaryContainerId, {
        host: LOCALHOST,
        port: benchmarkConfig.port,
        user: benchmarkConfig.user,
        database: benchmarkConfig.database,
        timeoutMs: benchmarkConfig.readyTimeoutMs,
        pollIntervalMs: benchmarkConfig.readyPollIntervalMs,
      });
      await configurePrimaryReplication(
        provider,
        baselinePrimaryContainerId,
        benchmarkConfig,
      );

      for (
        let replicaIndex = ONE;
        replicaIndex < benchmarkConfig.replicationFactor;
        replicaIndex += ONE
      ) {
        const replicaName =
          BENCHMARK_CONTAINER_NAME_PREFIX +
          benchmarkRunId +
          BENCHMARK_REPLICA_SUFFIX_PREFIX +
          replicaIndex;
        const replicaBootstrapCommand = buildReplicaBootstrapCommand(
          primaryContainerName,
          replicaName,
          benchmarkConfig,
        );
        const replicaContainer = await provider.createContainer({
          name: replicaName,
          image: benchmarkConfig.baselineImage,
          network: networkName,
          env: {
            [POSTGRES_ENV_USER_KEY]: benchmarkConfig.user,
            [POSTGRES_ENV_PASSWORD_KEY]: benchmarkConfig.password,
            [POSTGRES_ENV_DB_KEY]: benchmarkConfig.database,
            [POSTGRES_ENV_AUTH_METHOD_KEY]: POSTGRES_ENV_AUTH_METHOD_VALUE,
          },
          command: [SHELL_COMMAND, SHELL_LOGIN_ARG, replicaBootstrapCommand],
          resourceLimits: cluster?._config?.resourceLimits || {},
          startTimeout: cluster?._config?.timeouts?.nodeStartup,
        });
        baselineContainers.push(replicaContainer);
        baselineReplicaContainerIps.push(replicaContainer.ip);

        await waitForPostgresReady(provider, replicaContainer.containerId, {
          host: LOCALHOST,
          port: benchmarkConfig.port,
          user: benchmarkConfig.user,
          database: benchmarkConfig.database,
          timeoutMs: benchmarkConfig.readyTimeoutMs,
          pollIntervalMs: benchmarkConfig.readyPollIntervalMs,
        });
      }

      await waitForStreamingReplicas(
        provider,
        baselinePrimaryContainerId,
        benchmarkConfig,
      );
      const loadNodeCount = Math.max(ONE, benchmarkConfig.baselineLoadNodeCount);
      const poolMaxConnections = Math.max(ONE, benchmarkConfig.loadMaxInFlight);
      baselineLoadNodeCount = loadNodeCount;
      baselinePoolMaxConnections = poolMaxConnections;
      baselinePool = scenarioOverrides.createPostgresPool({
        host: baselinePrimaryContainerIp,
        port: benchmarkConfig.port,
        user: benchmarkConfig.user,
        password: benchmarkConfig.password,
        database: benchmarkConfig.database,
        max: poolMaxConnections,
        idleTimeoutMillis: BENCHMARK_POOL_IDLE_TIMEOUT_MS,
        connectionTimeoutMillis: BENCHMARK_POOL_CONNECTION_TIMEOUT_MS,
      });

      await ensurePostgresBenchmarkTable(baselinePool, benchmarkTableName);
      baselineMetrics = await runBaselineSharedLoad({
        pool: baselinePool,
        createLoadGenerator: scenarioOverrides.createLoadGenerator,
        loadNodeCount,
        loadOpsPerSec: benchmarkConfig.loadOpsPerSec,
        loadDuration: benchmarkConfig.loadDuration,
        loadMaxInFlight: benchmarkConfig.loadMaxInFlight,
        tableName: benchmarkTableName,
      });
      try {
        cacheMetadata = await storeBaselineMetricsInCache(
          baselineCacheIdentity,
          benchmarkConfig,
          baselineMetrics,
        );
      } catch (_cacheStoreErr) {
        cacheMetadata.reason = BASELINE_CACHE_INVALID_REASON;
      }
    } finally {
      if (baselinePool && typeof baselinePool.end === 'function') {
        try {
          await baselinePool.end();
        } catch (_poolEndErr) {
          // Best-effort cleanup.
        }
      }
      for (let index = baselineContainers.length - ONE; index >= ZERO; index--) {
        const containerId = baselineContainers[index]?.containerId;
        if (!containerId) {
          continue;
        }
        try {
          await provider.stopContainer(containerId);
        } catch (_stopErr) {
          // Best-effort cleanup.
        }
        try {
          await provider.removeContainer(containerId);
        } catch (_removeErr) {
          // Best-effort cleanup.
        }
      }
    }
  }

  return {
    baselineMetrics,
    baselineCacheMetadata: cacheMetadata,
    baselinePrimaryContainerIp,
    baselineReplicaContainerIps,
    baselineLoadNodeCount,
    baselinePoolMaxConnections,
  };
}

function mapPhaseArtifacts(phaseResults) {
  const artifacts = {};
  for (const phaseResult of phaseResults) {
    artifacts[phaseResult.phase] = phaseResult.artifacts || {};
  }
  return artifacts;
}

function mapPhaseTimeline(phaseResults) {
  return phaseResults.map((phaseResult) => ({
    phase: phaseResult.phase,
    status: phaseResult.status,
    durationMs: phaseResult.durationMs,
    startedAtMs: phaseResult.startedAtMs,
    endedAtMs: phaseResult.endedAtMs,
    warnings: phaseResult.warnings || [],
    errors: phaseResult.errors || [],
  }));
}

function incrementReasonHistogram(reasonHistogram, reason, phase) {
  if (!Object.prototype.hasOwnProperty.call(reasonHistogram, reason)) {
    reasonHistogram[reason] = {
      reason,
      count: ZERO,
      phases: new Set(),
    };
  }
  reasonHistogram[reason].count += ONE;
  reasonHistogram[reason].phases.add(phase);
}

function summarizeReasons(reasonHistogram) {
  return Object.values(reasonHistogram)
    .sort((left, right) => right.count - left.count)
    .slice(ZERO, PHASE_REASON_SUMMARY_MAX_ENTRIES)
    .map((entry) => ({
      reason: entry.reason,
      count: entry.count,
      phases: [...entry.phases].sort(),
    }));
}

function resolvePhaseClass(phase) {
  switch (phase) {
  case SCENARIO_PHASE.PRE_FLIGHT:
    return PHASE_CLASS_STARTUP;
  case SCENARIO_PHASE.CONVERGE:
    return PHASE_CLASS_DISCOVERY;
  case SCENARIO_PHASE.PRE_LOAD_GATE:
  case SCENARIO_PHASE.POST_LOAD_DRAIN:
    return PHASE_CLASS_TOPOLOGY;
  case SCENARIO_PHASE.LOAD:
    return PHASE_CLASS_LOAD;
  case SCENARIO_PHASE.VERIFY:
    return PHASE_CLASS_VERIFY;
  case SCENARIO_PHASE.TEARDOWN:
    return PHASE_CLASS_TEARDOWN;
  default:
    return PHASE_CLASS_UNKNOWN;
  }
}

function classifyReason(reason) {
  const normalizedReason = String(reason || '').toLowerCase();
  if (normalizedReason.includes('bootstrap') ||
      normalizedReason.includes('startup') ||
      normalizedReason.includes('active state')) {
    return REASON_CLASS_STARTUP;
  }
  if (normalizedReason.includes('discovery') ||
      normalizedReason.includes('schema') ||
      normalizedReason.includes('readiness')) {
    return REASON_CLASS_DISCOVERY;
  }
  if (normalizedReason.includes('in_flight') ||
      normalizedReason.includes('leadership') ||
      normalizedReason.includes('topology') ||
      normalizedReason.includes('stalled_no_progress')) {
    return REASON_CLASS_TOPOLOGY;
  }
  if (normalizedReason.includes('load') ||
      normalizedReason.includes('circuit') ||
      normalizedReason.includes('budget_exhausted') ||
      normalizedReason.includes('operation')) {
    return REASON_CLASS_LOAD;
  }
  if (normalizedReason.includes('consistency') ||
      normalizedReason.includes('verification')) {
    return REASON_CLASS_VERIFY;
  }
  return REASON_CLASS_UNKNOWN;
}

function buildReasonClassHistogram(reasons = []) {
  const histogram = {};
  for (const reason of reasons) {
    const reasonClass = classifyReason(reason);
    histogram[reasonClass] = (histogram[reasonClass] || ZERO) + ONE;
  }
  return histogram;
}

function mergeReasonClassHistograms(target = {}, source = {}) {
  const merged = {...target};
  for (const [reasonClass, count] of Object.entries(source)) {
    merged[reasonClass] = (merged[reasonClass] || ZERO) + Number(count || ZERO);
  }
  return merged;
}

function buildStartupDecisionRecord(phaseDecisions = []) {
  let reasonClassHistogram = {};
  for (const phaseDecision of phaseDecisions) {
    reasonClassHistogram = mergeReasonClassHistograms(
      reasonClassHistogram,
      phaseDecision.reasonClassHistogram || {},
    );
  }
  return {
    schemaVersion: STARTUP_DECISION_SCHEMA_VERSION,
    phaseCount: phaseDecisions.length,
    phaseDecisions,
    reasonClassHistogram,
  };
}

function buildPhaseReasonSummary(phaseResults) {
  const warningHistogram = {};
  const errorHistogram = {};
  for (const phaseResult of phaseResults) {
    const phase = String(phaseResult.phase || 'unknown');
    for (const warning of phaseResult.warnings || []) {
      incrementReasonHistogram(warningHistogram, String(warning), phase);
    }
    for (const error of phaseResult.errors || []) {
      incrementReasonHistogram(errorHistogram, String(error), phase);
    }
  }
  return {
    dominantWarnings: summarizeReasons(warningHistogram),
    dominantErrors: summarizeReasons(errorHistogram),
  };
}

function resolvePhasePolicy(phase, benchmarkConfig) {
  switch (phase) {
  case SCENARIO_PHASE.PRE_LOAD_GATE:
    return {
      timeoutMs: benchmarkConfig.quiescentTimeoutMs,
      pollIntervalMs: benchmarkConfig.quiescentPollIntervalMs,
      stableWindowMs: benchmarkConfig.quiescentStableWindowMs,
    };
  case SCENARIO_PHASE.POST_LOAD_DRAIN:
    return {
      timeoutMs: benchmarkConfig.postLoadDrainTimeoutMs,
      pollIntervalMs: benchmarkConfig.postLoadDrainPollIntervalMs,
      stableWindowMs: benchmarkConfig.postLoadDrainStableWindowMs,
      insufficientEvidencePolicy: benchmarkConfig.insufficientEvidencePolicy,
    };
  case SCENARIO_PHASE.LOAD:
    return {
      loadOpsPerSec: benchmarkConfig.loadOpsPerSec,
      loadDuration: benchmarkConfig.loadDuration,
      loadMaxInFlight: benchmarkConfig.loadMaxInFlight,
      loadQueryTimeoutMs: benchmarkConfig.loadQueryTimeoutMs,
      loadNodeMaxInFlight: benchmarkConfig.loadNodeMaxInFlight,
    };
  case SCENARIO_PHASE.VERIFY:
    return {
      consistencyAssertMaxAttempts: benchmarkConfig.consistencyAssertMaxAttempts,
      consistencyAssertRetryDelayMs:
        benchmarkConfig.consistencyAssertRetryDelayMs,
      insufficientEvidencePolicy: benchmarkConfig.insufficientEvidencePolicy,
    };
  default:
    return {};
  }
}

function collectPhaseReasons(phaseResult) {
  const reasons = [];
  for (const warning of phaseResult.warnings || []) {
    reasons.push(String(warning));
  }
  for (const error of phaseResult.errors || []) {
    reasons.push(String(error));
  }
  const reasonHistogram = phaseResult.artifacts?.reasonHistogram || {};
  for (const reason of Object.keys(reasonHistogram)) {
    if (!reasons.includes(reason)) {
      reasons.push(reason);
    }
  }
  return reasons;
}

function buildPhaseDecisions(phaseResults, benchmarkConfig) {
  return phaseResults.map((phaseResult) => {
    const reasons = collectPhaseReasons(phaseResult);
    return {
      phase: phaseResult.phase,
      phaseClass: resolvePhaseClass(phaseResult.phase),
      status: phaseResult.status,
      policy: resolvePhasePolicy(phaseResult.phase, benchmarkConfig),
      reasons,
      reasonClassHistogram: buildReasonClassHistogram(reasons),
      includedNodeIds: phaseResult.artifacts?.includedNodeIds || [],
      excludedNodeIds: phaseResult.artifacts?.excludedNodeIds || [],
    };
  });
}

function selectVerificationNodes(effectiveNodes, postLoadDrain) {
  const includedNodeIds = new Set(
    Array.isArray(postLoadDrain?.includedNodeIds) ?
      postLoadDrain.includedNodeIds :
      [],
  );
  if (includedNodeIds.size === ZERO) {
    return [...effectiveNodes];
  }
  return effectiveNodes.filter((node) => includedNodeIds.has(node.id));
}

async function run(cluster) {
  const nodes = cluster.getNodes();
  assert.ok(nodes.length >= ONE, 'Scenario requires at least one node');

  const benchmarkConfig = resolveBenchmarkConfig(cluster);
  const scenarioOverrides = resolveScenarioOverrides(cluster);
  const seedNode = nodes.find((node) => node.role === 'seed') || nodes[ZERO];
  assert.equal(
    typeof seedNode?.queryWithTimeout,
    'function',
    'Seed node must provide queryWithTimeout for NodeClient control channel',
  );
  assert.equal(
    typeof seedNode?.getReachabilityDiagnostics,
    'function',
    'Seed node must provide getReachabilityDiagnostics for probe channel',
  );
  const benchmarkTableName = normalizeTableName(
    benchmarkConfig.tableName,
    BENCHMARK_EVENT_TABLE_FALLBACK,
  );
  const provider = resolvePrimaryProvider(cluster);
  const networkName = String(cluster?._networkName || '');
  assert.ok(networkName, 'Cluster network name is not available');
  const nodeClientChannelPolicyOverrides =
    resolveNodeClientChannelPolicyOverrides(cluster);

  const nodeClient = new NodeClient({
    benchmarkConfig,
    ...(nodeClientChannelPolicyOverrides ?
      {channelPolicies: nodeClientChannelPolicyOverrides} :
      {}),
  });
  const nodeClientPolicySnapshot = nodeClient.getPolicySnapshot();
  const availableSutLoadCandidates = nodes.filter((node) =>
    isLoadNodeCandidate(node),
  ).length;
  const requestedSutLoadNodeCount = Number.isInteger(
    benchmarkConfig.baselineLoadNodeCount,
  ) &&
    benchmarkConfig.baselineLoadNodeCount > ZERO ?
    benchmarkConfig.baselineLoadNodeCount :
    ONE;
  const targetSutLoadNodeCount = Math.max(
    ONE,
    Math.min(availableSutLoadCandidates, requestedSutLoadNodeCount),
  );
  const consistencyEvaluator = new ConsistencyEvaluatorV2();
  const phaseEvents = [];
  const state = {
    convergence: null,
    sutLoadNodes: [],
    sutLoadDiscovery: null,
    effectiveSutLoadNodes: [],
    excludedSutLoadNodeIds: [],
    quiescenceResult: null,
    loadMetrics: null,
    baselineMetrics: null,
    baselineCacheMetadata: null,
    baselinePrimaryContainerIp: null,
    baselineReplicaContainerIps: [],
    baselineLoadNodeCount: benchmarkConfig.baselineLoadNodeCount,
    baselinePoolMaxConnections: benchmarkConfig.loadMaxInFlight,
    loadParity: null,
    diagnosticsCoverage: resolveDiagnosticsCoverage(null),
    effectiveAdmissionPolicy: buildEffectiveAdmissionPolicy({
      benchmarkConfig,
      nodeClientPolicySnapshot,
      nodeClientChannelPolicyOverrides,
    }),
    postLoadDrain: createInitialPostLoadDrain([], []),
    consistencyVerdict: CONSISTENCY_VERDICT.CONSISTENT,
    consistencyResult: {attempts: ZERO},
    consistencyEvaluation: {
      coverage: {
        reachableNodes: ZERO,
        snapshotNodes: ZERO,
      },
      mismatches: [],
      evidenceWarnings: [],
    },
    verificationNodeIds: [],
    verificationExcludedNodeIds: [],
    assertionPolicyResult: evaluateAssertionPolicy({
      consistencyVerdict: CONSISTENCY_VERDICT.CONSISTENT,
      loadMetrics: {
        total: ONE,
        success: ONE,
        failed: ZERO,
        errors: ZERO,
        opsPerSec: ONE,
      },
      policy: {
        insufficientEvidence: benchmarkConfig.insufficientEvidencePolicy,
      },
    }),
  };

  async function ensureConvergenceResolved() {
    if (state.convergence) {
      return state.convergence;
    }
    state.convergence = await cluster.waitForConvergence({
      settleTimeoutMs: cluster?._config?.convergence?.settleTimeoutMs,
      quietWindowMs: cluster?._config?.convergence?.quietWindowMs,
      targetVoterCount: cluster?._config?.convergence?.targetVoterCount,
    });
    state.diagnosticsCoverage = resolveDiagnosticsCoverage(state.convergence);
    return state.convergence;
  }

  const orchestrator = new PhaseOrchestrator({
    onEvent: (event) => {
      phaseEvents.push(event);
    },
  });

  const phaseHandlers = {
    [SCENARIO_PHASE.PRE_FLIGHT]: async () => {
      await ensureConvergenceResolved();
      await ensureSutBenchmarkTable(nodeClient, seedNode, benchmarkTableName);
      await waitForSutBenchmarkTableReady(
        nodeClient,
        seedNode,
        benchmarkTableName,
        {
          timeoutMs: benchmarkConfig.readyTimeoutMs,
          pollIntervalMs: benchmarkConfig.readyPollIntervalMs,
        },
      );
      const sutLoadResolution = await resolveSutLoadNodes(
        nodeClient,
        nodes,
        seedNode,
        {
          timeoutMs: benchmarkConfig.readyTimeoutMs,
          pollIntervalMs: benchmarkConfig.readyPollIntervalMs,
          tableName: benchmarkTableName,
          minReachableNodeCount: targetSutLoadNodeCount,
        },
      );
      const sutLoadNodes = sutLoadResolution.nodes;
      state.sutLoadDiscovery = sutLoadResolution.diagnostics;
      const discoveryDiagnostics = formatSutLoadDiscoveryDiagnostics(
        state.sutLoadDiscovery,
      );
      assert.ok(
        sutLoadNodes.length > ZERO,
        'No discovered admin-ready load service nodes available for benchmark load' +
          (discoveryDiagnostics.length > ZERO ?
            ' (' + discoveryDiagnostics + ')' :
            ''),
      );
      state.sutLoadNodes = sutLoadNodes;
      return {
        status: PHASE_STATUS.OK,
        artifacts: {
          benchmarkTableName,
          sutLoadNodeIds: sutLoadNodes.map((node) => node.id),
          sutLoadDiscovery: state.sutLoadDiscovery,
        },
      };
    },
    [SCENARIO_PHASE.CONVERGE]: async () => {
      await ensureConvergenceResolved();
      return {
        status: PHASE_STATUS.OK,
        artifacts: {
          convergence: state.convergence,
          diagnosticsCoverage: state.diagnosticsCoverage,
        },
      };
    },
    [SCENARIO_PHASE.PRE_LOAD_GATE]: async () => {
      const quiescenceResult = await waitForSutLoadQuiescence({
        nodeClient,
        loadNodes: state.sutLoadNodes,
        seedNode,
        snapshotNodes: state.sutLoadNodes,
        tableName: benchmarkTableName,
        timeoutMs: benchmarkConfig.quiescentTimeoutMs,
        pollIntervalMs: benchmarkConfig.quiescentPollIntervalMs,
        stableWindowMs: benchmarkConfig.quiescentStableWindowMs,
        noProgressTimeoutMs: benchmarkConfig.quiescentNoProgressTimeoutMs,
      });
      state.quiescenceResult = quiescenceResult;
      state.effectiveSutLoadNodes = quiescenceResult.readyLoadNodes;
      state.excludedSutLoadNodeIds = quiescenceResult.excludedLoadNodeIds;
      state.postLoadDrain = createInitialPostLoadDrain(
        state.effectiveSutLoadNodes,
        state.excludedSutLoadNodeIds,
      );
      assert.ok(
        state.effectiveSutLoadNodes.length > ZERO,
        'No quiescent system-under-test load nodes available for benchmark load',
      );
      return {
        status: PHASE_STATUS.OK,
        artifacts: {
          mode: quiescenceResult.mode,
          attempts: quiescenceResult.attempts,
          stableElapsedMs: quiescenceResult.stableElapsedMs,
          includedNodeIds: quiescenceResult.readyLoadNodes.map((node) => node.id),
          excludedNodeIds: quiescenceResult.excludedLoadNodeIds,
          partitionGroupInFlight: quiescenceResult.partitionGroupInFlight || {},
          reasonHistogram: quiescenceResult.reasonHistogram || {},
        },
      };
    },
    [SCENARIO_PHASE.LOAD]: async () => {
      state.loadMetrics = normalizeLoadMetrics(await runSutSharedLoad({
        nodeClient,
        loadNodes: state.effectiveSutLoadNodes,
        createLoadGenerator: scenarioOverrides.createLoadGenerator,
        loadOpsPerSec: benchmarkConfig.loadOpsPerSec,
        loadDuration: benchmarkConfig.loadDuration,
        loadMaxInFlight: benchmarkConfig.loadMaxInFlight,
        loadQueryTimeoutMs: benchmarkConfig.loadQueryTimeoutMs,
        loadNodeMaxInFlight: benchmarkConfig.loadNodeMaxInFlight,
        tableName: benchmarkTableName,
        nodeFailureThreshold: benchmarkConfig.nodeFailureThreshold,
        nodeFailureCooldownMs: benchmarkConfig.nodeFailureCooldownMs,
      }));

      const baseline = await resolveBaselineMetrics({
        cluster,
        benchmarkConfig,
        scenarioOverrides,
        provider,
        networkName,
        benchmarkTableName,
      });
      state.baselineMetrics = baseline.baselineMetrics;
      state.baselineCacheMetadata = baseline.baselineCacheMetadata;
      state.baselinePrimaryContainerIp = baseline.baselinePrimaryContainerIp;
      state.baselineReplicaContainerIps = baseline.baselineReplicaContainerIps;
      state.baselineLoadNodeCount = baseline.baselineLoadNodeCount;
      state.baselinePoolMaxConnections = baseline.baselinePoolMaxConnections;
      state.loadParity = buildLoadParity({
        benchmarkConfig,
        benchmarkTableName,
        sutLoadNodes: state.effectiveSutLoadNodes,
        baselineLoadNodeCount: state.baselineLoadNodeCount,
        baselinePoolMaxConnections: state.baselinePoolMaxConnections,
        nodeClientPolicySnapshot,
      });
      if (benchmarkConfig.failOnLoadParityMismatch &&
          state.loadParity.status === LOAD_PARITY_STATUS_MISMATCHED) {
        throw new Error(
          'Load parity mismatch: ' + formatLoadParityReasons(state.loadParity),
        );
      }

      assert.ok(
        state.loadMetrics.total > ZERO,
        'System-under-test load run produced no operations',
      );
      assert.ok(
        Number(state.baselineMetrics?.opsPerSec || ZERO) > ZERO,
        'Postgres baseline load run produced zero throughput',
      );

      return {
        status: PHASE_STATUS.OK,
        artifacts: {
          sutLoadNodeIds: state.effectiveSutLoadNodes.map((node) => node.id),
          loadMetrics: state.loadMetrics,
          loadParity: state.loadParity,
          baselineCache: state.baselineCacheMetadata,
          baselineOpsPerSec: Number(state.baselineMetrics?.opsPerSec || ZERO),
        },
      };
    },
    [SCENARIO_PHASE.POST_LOAD_DRAIN]: async () => {
      try {
        const postLoadDrainResult = await waitForSutLoadQuiescence({
          nodeClient,
          loadNodes: state.effectiveSutLoadNodes,
          seedNode,
          snapshotNodes: state.effectiveSutLoadNodes,
          tableName: benchmarkTableName,
          timeoutMs: benchmarkConfig.postLoadDrainTimeoutMs,
          pollIntervalMs: benchmarkConfig.postLoadDrainPollIntervalMs,
          stableWindowMs: benchmarkConfig.postLoadDrainStableWindowMs,
          noProgressTimeoutMs:
            benchmarkConfig.postLoadDrainNoProgressTimeoutMs,
        });
        state.postLoadDrain = {
          status: POST_LOAD_DRAIN_STATUS_OK,
          mode: postLoadDrainResult.mode,
          attempts: postLoadDrainResult.attempts,
          stableElapsedMs: postLoadDrainResult.stableElapsedMs,
          error: null,
          reasonHistogram: postLoadDrainResult.reasonHistogram || {},
          partitionGroupInFlight:
            postLoadDrainResult.partitionGroupInFlight || {},
          includedNodeIds:
            postLoadDrainResult.includedNodeIds ||
            postLoadDrainResult.readyLoadNodes.map((node) => node.id),
          excludedNodeIds: postLoadDrainResult.excludedLoadNodeIds,
        };
        return {
          status: PHASE_STATUS.OK,
          artifacts: {
            ...state.postLoadDrain,
          },
        };
      } catch (error) {
        const gateResult = error?.gateResult || {};
        state.postLoadDrain = {
          status: POST_LOAD_DRAIN_STATUS_FAILED,
          mode: gateResult.mode || POST_LOAD_DRAIN_MODE_FAILED,
          attempts: Number(gateResult.attempts || ZERO),
          stableElapsedMs: Number(gateResult.stableElapsedMs || ZERO),
          error: String(error?.message || error),
          reasonHistogram: gateResult.reasonHistogram || {},
          partitionGroupInFlight: gateResult.partitionGroupInFlight || {},
          includedNodeIds: gateResult.includedNodeIds || [],
          excludedNodeIds: gateResult.excludedNodeIds || [],
        };
        state.consistencyVerdict = CONSISTENCY_VERDICT.INSUFFICIENT_EVIDENCE;
        if (benchmarkConfig.insufficientEvidencePolicy === ASSERTION_POLICY.HARD) {
          return {
            status: PHASE_STATUS.FAIL,
            artifacts: {
              ...state.postLoadDrain,
            },
            errors: [
              'Post-load drain gate failed and policy requires hard failure: ' +
                state.postLoadDrain.error,
            ],
          };
        }
        return {
          status: PHASE_STATUS.WARN,
          artifacts: {
            ...state.postLoadDrain,
          },
          warnings: [
            'Post-load drain gate failed: ' + state.postLoadDrain.error,
          ],
        };
      }
    },
    [SCENARIO_PHASE.VERIFY]: async () => {
      const verificationNodes = selectVerificationNodes(
        state.effectiveSutLoadNodes,
        state.postLoadDrain,
      );
      state.verificationNodeIds = verificationNodes.map((node) => node.id);
      const verificationNodeSet = new Set(state.verificationNodeIds);
      state.verificationExcludedNodeIds = state.effectiveSutLoadNodes
        .map((node) => node.id)
        .filter((nodeId) => !verificationNodeSet.has(nodeId));

      const snapshots = [];
      const snapshotWarnings = [];
      for (const node of verificationNodes) {
        try {
          snapshots.push(await nodeClient.fetchControlSnapshot(node));
        } catch (error) {
          snapshotWarnings.push(
            'snapshot_error:' +
              String(node.id || 'unknown') +
              '=' +
              String(error?.message || error),
          );
        }
      }

      const evaluation = state.verificationNodeIds.length <= ONE ?
        {
          verdict: CONSISTENCY_VERDICT.CONSISTENT,
          hardFailure: false,
          coverage: {
            reachableNodes: state.verificationNodeIds.length,
            snapshotNodes: snapshots.length,
          },
          mismatches: [],
          evidenceWarnings: [],
        } :
        consistencyEvaluator.evaluate({
          reachableNodeIds: state.verificationNodeIds,
          snapshots,
        });
      const evidenceWarnings = [
        ...evaluation.evidenceWarnings,
        ...snapshotWarnings,
      ];
      let consistencyVerdict = evaluation.verdict;
      if (consistencyVerdict === CONSISTENCY_VERDICT.CONSISTENT &&
          evidenceWarnings.length > ZERO) {
        consistencyVerdict = CONSISTENCY_VERDICT.INSUFFICIENT_EVIDENCE;
      }
      if (consistencyVerdict === CONSISTENCY_VERDICT.CONSISTENT &&
          state.postLoadDrain.status === POST_LOAD_DRAIN_STATUS_FAILED) {
        consistencyVerdict = CONSISTENCY_VERDICT.INSUFFICIENT_EVIDENCE;
      }
      state.consistencyVerdict = consistencyVerdict;
      state.consistencyEvaluation = {
        coverage: evaluation.coverage,
        mismatches: evaluation.mismatches,
        evidenceWarnings,
      };

      state.consistencyResult = await assertClusterConsistencyWithRetry(cluster, {
        maxAttempts: benchmarkConfig.consistencyAssertMaxAttempts,
        retryDelayMs: benchmarkConfig.consistencyAssertRetryDelayMs,
      });

      state.assertionPolicyResult = evaluateAssertionPolicy({
        consistencyVerdict: state.consistencyVerdict,
        loadMetrics: state.loadMetrics,
        policy: {
          insufficientEvidence: benchmarkConfig.insufficientEvidencePolicy,
        },
      });

      if (state.assertionPolicyResult.passed !== true) {
        return {
          status: PHASE_STATUS.FAIL,
          artifacts: {
            consistencyVerdict: state.consistencyVerdict,
            coverage: state.consistencyEvaluation.coverage,
            mismatches: state.consistencyEvaluation.mismatches,
            evidenceWarnings: state.consistencyEvaluation.evidenceWarnings,
          },
          errors: state.assertionPolicyResult.hardFailures
            .map((failure) => String(failure?.message || failure)),
        };
      }

      const warnings = state.assertionPolicyResult.softWarnings
        .map((warning) => String(warning?.message || warning));
      return {
        status: warnings.length > ZERO ? PHASE_STATUS.WARN : PHASE_STATUS.OK,
        artifacts: {
          consistencyVerdict: state.consistencyVerdict,
          coverage: state.consistencyEvaluation.coverage,
          mismatches: state.consistencyEvaluation.mismatches,
          evidenceWarnings: state.consistencyEvaluation.evidenceWarnings,
          verificationNodeIds: state.verificationNodeIds,
          verificationExcludedNodeIds: state.verificationExcludedNodeIds,
          consistencyAssertionAttempts: state.consistencyResult.attempts,
          assertionStatus: state.assertionPolicyResult.status,
        },
        warnings,
      };
    },
    [SCENARIO_PHASE.TEARDOWN]: async () => ({
      status: PHASE_STATUS.OK,
      artifacts: {
        complete: true,
      },
    }),
  };

  const orchestrationResult = await orchestrator.run(phaseHandlers);
  const failedPhase = orchestrationResult.phases.find((phaseResult) =>
    phaseResult.status === PHASE_STATUS.FAIL,
  );
  if (failedPhase) {
    throw new Error(
      'postgres-baseline-comparison failed in phase ' +
        failedPhase.phase +
        ': ' +
        failedPhase.errors.join('; '),
    );
  }

  const comparison = buildComparison(state.loadMetrics, state.baselineMetrics);
  const phaseDecisions = buildPhaseDecisions(
    orchestrationResult.phases,
    benchmarkConfig,
  );
  const startupDecisionRecord = buildStartupDecisionRecord(phaseDecisions);
  const sutLoadDiscoveryExcludedReadinessByNodeId =
    aggregateDiscoveryReadinessExclusionsByNodeId(state.sutLoadDiscovery);

  return {
    loadMetrics: state.loadMetrics,
    details: {
      benchmark: {
        tool: 'shared-load-generator',
        workload: BENCHMARK_WORKLOAD_PROFILE,
        durationSeconds: parseDurationToMs(benchmarkConfig.loadDuration) / 1000,
        clients: benchmarkConfig.baselineLoadNodeCount,
        sutEligibleLoadNodeCount: state.sutLoadNodes.length,
        sutLoadNodeCount: state.effectiveSutLoadNodes.length,
        sutExcludedLoadNodeIds: state.excludedSutLoadNodeIds,
        jobs: benchmarkConfig.jobs,
        loadTargetOpsPerSec: benchmarkConfig.loadOpsPerSec,
        loadDuration: benchmarkConfig.loadDuration,
        loadMaxInFlight: benchmarkConfig.loadMaxInFlight,
        loadQueryTimeoutMs: benchmarkConfig.loadQueryTimeoutMs,
        loadNodeMaxInFlight: benchmarkConfig.loadNodeMaxInFlight,
        failOnLoadParityMismatch: benchmarkConfig.failOnLoadParityMismatch,
        nodeFailureThreshold: benchmarkConfig.nodeFailureThreshold || null,
        nodeFailureCooldownMs: benchmarkConfig.nodeFailureCooldownMs || null,
        quiescentTimeoutMs: benchmarkConfig.quiescentTimeoutMs,
        quiescentPollIntervalMs: benchmarkConfig.quiescentPollIntervalMs,
        quiescentStableWindowMs: benchmarkConfig.quiescentStableWindowMs,
        quiescentNoProgressTimeoutMs:
          benchmarkConfig.quiescentNoProgressTimeoutMs,
        consistencyAssertMaxAttempts:
          benchmarkConfig.consistencyAssertMaxAttempts,
        consistencyAssertRetryDelayMs:
          benchmarkConfig.consistencyAssertRetryDelayMs,
        consistencyAssertionAttempts: state.consistencyResult.attempts,
        sutLoadDiscovery: state.sutLoadDiscovery,
        sutLoadDiscoveryExcludedReadinessByNodeId,
        insufficientEvidencePolicy: benchmarkConfig.insufficientEvidencePolicy,
        postLoadDrainStatus: state.postLoadDrain.status,
        postLoadDrainMode: state.postLoadDrain.mode,
        postLoadDrainAttempts: state.postLoadDrain.attempts,
        postLoadDrainStableElapsedMs: state.postLoadDrain.stableElapsedMs,
        postLoadDrainNoProgressTimeoutMs:
          benchmarkConfig.postLoadDrainNoProgressTimeoutMs,
        postLoadDrainError: state.postLoadDrain.error,
        postLoadDrainReasonHistogram: state.postLoadDrain.reasonHistogram,
        postLoadDrainPartitionGroupInFlight:
          state.postLoadDrain.partitionGroupInFlight,
        postLoadDrainIncludedNodeIds: state.postLoadDrain.includedNodeIds,
        postLoadDrainExcludedNodeIds: state.postLoadDrain.excludedNodeIds,
        operations: BENCHMARK_WORKLOAD_OPERATIONS,
        tableName: benchmarkTableName,
      },
      parity: state.loadParity,
      effectiveAdmissionPolicy: state.effectiveAdmissionPolicy,
      baseline: {
        engine: 'postgres',
        image: benchmarkConfig.baselineImage,
        containerIp: state.baselinePrimaryContainerIp,
        replicaContainerIps: state.baselineReplicaContainerIps,
        replicationFactor: benchmarkConfig.replicationFactor,
        syncReplicaAcks: benchmarkConfig.syncReplicaAcks,
        loadNodeCount: state.baselineLoadNodeCount,
        poolMaxConnections: state.baselinePoolMaxConnections,
        cache: state.baselineCacheMetadata,
        metrics: state.baselineMetrics,
      },
      systemUnderTest: {
        seedNodeId: seedNode.id,
        metrics: {
          opsPerSec: state.loadMetrics.opsPerSec,
          latency: state.loadMetrics.latency,
          total: state.loadMetrics.total,
          success: state.loadMetrics.success,
          failed: state.loadMetrics.failed,
          errors: state.loadMetrics.errors,
          attemptErrors: Number(state.loadMetrics.attemptErrors || ZERO),
          loadTargetOpsPerSec: benchmarkConfig.loadOpsPerSec,
          loadMaxInFlight: benchmarkConfig.loadMaxInFlight,
        },
      },
      comparison,
      convergence: state.convergence,
      verification: {
        verdict: state.consistencyVerdict,
        confidence: state.assertionPolicyResult.verificationConfidence,
        hardFailures: state.assertionPolicyResult.hardFailures,
        softWarnings: state.assertionPolicyResult.softWarnings,
        coverage: state.consistencyEvaluation.coverage,
        mismatches: state.consistencyEvaluation.mismatches,
        evidenceWarnings: state.consistencyEvaluation.evidenceWarnings,
        verificationNodeIds: state.verificationNodeIds,
        verificationExcludedNodeIds: state.verificationExcludedNodeIds,
      },
      policy: {
        insufficientEvidence: state.assertionPolicyResult.policy.insufficientEvidence,
        assertionStatus: state.assertionPolicyResult.status,
      },
      diagnosticsCoverage: state.diagnosticsCoverage,
      phaseTimeline: mapPhaseTimeline(orchestrationResult.phases),
      phaseArtifacts: mapPhaseArtifacts(orchestrationResult.phases),
      phaseReasonSummary: buildPhaseReasonSummary(orchestrationResult.phases),
      phaseDecisions,
      startupDecisionRecord,
      phaseEvents,
      channelMetrics: nodeClient.getMetricsSnapshot(),
    },
  };
}

export {run, resolveBenchmarkConfig, buildComparison};
