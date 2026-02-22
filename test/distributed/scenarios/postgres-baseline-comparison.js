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
const IN_FLIGHT_REPLICA_OPERATIONS_SQL =
  'SELECT * FROM replica_operations ' +
  'WHERE status NOT IN (\'active\', \'removed\', \'failed\')';
const QUIESCENCE_NODE_ERROR_SEPARATOR = '; ';
const QUIESCENCE_NODE_ERROR_PREFIX = 'nodeProbeFailures=';
const QUIESCENCE_IN_FLIGHT_ERROR_PREFIX = 'inFlightQueryError=';
const QUIESCENCE_IN_FLIGHT_COUNT_PREFIX = 'inFlightReplicaOperations=';
const QUIESCENCE_READY_NODE_COUNT_PREFIX = 'readyLoadNodes=';
const QUIESCENCE_REASON_IN_FLIGHT_NOT_DRAINED_PREFIX =
  'in_flight_replica_operations:';
const QUIESCENCE_REASON_IN_FLIGHT_QUERY_ERROR_PREFIX =
  'in_flight_query_error:';
const QUIESCENCE_REASON_NODE_PROBE_ERROR_PREFIX = 'node_probe_error:';
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
const BENCHMARK_DDL_BIGINT_TYPE = 'BIGINT';
const BENCHMARK_DDL_TEXT_TYPE = 'TEXT';
const BENCHMARK_DDL_NOT_NULL = 'NOT NULL';
const BENCHMARK_DDL_PRIMARY_KEY = 'PRIMARY KEY';
const BENCHMARK_POOL_IDLE_TIMEOUT_MS = 30000;
const BENCHMARK_POOL_CONNECTION_TIMEOUT_MS = 10000;
const PHASE_REASON_SUMMARY_MAX_ENTRIES = 5;

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

function isNodeReachable(diagnostics) {
  if (!diagnostics || typeof diagnostics !== 'object') {
    return false;
  }
  if (diagnostics.reachable === true || diagnostics.adminReady === true) {
    return true;
  }
  return false;
}

async function resolveSutLoadNodes(nodeClient, nodes, seedNode) {
  const candidates = Array.isArray(nodes) ?
    nodes.filter((node) =>
      typeof node?.queryWithTimeout === 'function' &&
      typeof node?.getReachabilityDiagnostics === 'function',
    ) :
    [];
  if (candidates.length === ZERO) {
    return seedNode &&
      typeof seedNode.queryWithTimeout === 'function' &&
      typeof seedNode.getReachabilityDiagnostics === 'function' ?
      [seedNode] :
      [];
  }

  const probeResults = await Promise.all(candidates.map(async (node) => {
    try {
      const diagnostics = await nodeClient.probeReadiness(node);
      return isNodeReachable(diagnostics) ? node : null;
    } catch (_error) {
      return null;
    }
  }));
  const queryable = probeResults.filter(Boolean);
  if (queryable.length > ZERO) {
    return queryable;
  }
  return seedNode &&
    typeof seedNode.queryWithTimeout === 'function' &&
    typeof seedNode.getReachabilityDiagnostics === 'function' ?
    [seedNode] :
    [];
}

async function waitForSutLoadQuiescence({
  nodeClient,
  loadNodes,
  seedNode,
  tableName,
  timeoutMs,
  pollIntervalMs,
  stableWindowMs,
}) {
  const tableProbeSql = buildSutTableProbeSql(tableName);
  const effectiveStableWindowMs = Math.max(
    ZERO,
    Number.isFinite(stableWindowMs) ?
      Math.floor(stableWindowMs) :
      QUIESCENCE_DEFAULT_STABLE_WINDOW_MS,
  );
  const gateEngine = new GateEngine();
  const gateResult = await gateEngine.waitForGate({
    nodes: loadNodes,
    timeoutMs,
    pollIntervalMs,
    stableWindowMs: effectiveStableWindowMs,
    allowSubsetFallback: true,
    probeNode: async (node) => {
      try {
        await nodeClient.queryControl(node, tableProbeSql);
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
        const inFlightResult = await nodeClient.queryControl(
          seedNode,
          IN_FLIGHT_REPLICA_OPERATIONS_SQL,
        );
        const inFlightCount = rowsFromQueryResult(inFlightResult).length;
        if (inFlightCount === ZERO) {
          return {
            ready: true,
            reasons: [],
          };
        }
        return {
          ready: false,
          reasons: [
            QUIESCENCE_REASON_IN_FLIGHT_NOT_DRAINED_PREFIX +
              String(inFlightCount),
          ],
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
  });

  const includedNodeIds = new Set(gateResult.includedNodeIds || []);
  const readyLoadNodes = loadNodes.filter((node) => includedNodeIds.has(node.id));
  const excludedLoadNodeIds = loadNodes
    .map((node) => node.id)
    .filter((nodeId) => !includedNodeIds.has(nodeId));

  if (gateResult.mode === GATE_RESULT_MODE.ALL_READY ||
      gateResult.mode === GATE_RESULT_MODE.SUBSET_READY) {
    return {
      mode: gateResult.mode,
      attempts: gateResult.attempts,
      stableElapsedMs: gateResult.stableElapsedMs,
      inFlightCount: ZERO,
      readyLoadNodes,
      excludedLoadNodeIds,
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
  if (readyLoadNodes.length > ZERO) {
    details.push(
      QUIESCENCE_READY_NODE_COUNT_PREFIX + String(readyLoadNodes.length),
    );
  }

  const error = new Error(
    'SUT load nodes did not reach quiescent state within ' +
      timeoutMs +
      'ms' +
      (details.length > ZERO ?
        ' (' + details.join(', ') + ')' :
        ''),
  );
  error.gateResult = {
    ...gateResult,
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
  const outputDir = cluster?._config?.outputDir;
  if (typeof outputDir !== 'string' || outputDir.length === ZERO) {
    return null;
  }
  return outputDir;
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

function createInitialPostLoadDrain(effectiveSutLoadNodes, excludedNodeIds) {
  return {
    status: POST_LOAD_DRAIN_STATUS_OK,
    mode: GATE_RESULT_MODE.ALL_READY,
    attempts: ZERO,
    stableElapsedMs: ZERO,
    error: null,
    reasonHistogram: {},
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
      allowSubsetFallback: true,
    };
  case SCENARIO_PHASE.POST_LOAD_DRAIN:
    return {
      timeoutMs: benchmarkConfig.postLoadDrainTimeoutMs,
      pollIntervalMs: benchmarkConfig.postLoadDrainPollIntervalMs,
      stableWindowMs: benchmarkConfig.postLoadDrainStableWindowMs,
      allowSubsetFallback: true,
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
  return phaseResults.map((phaseResult) => ({
    phase: phaseResult.phase,
    status: phaseResult.status,
    policy: resolvePhasePolicy(phaseResult.phase, benchmarkConfig),
    reasons: collectPhaseReasons(phaseResult),
    includedNodeIds: phaseResult.artifacts?.includedNodeIds || [],
    excludedNodeIds: phaseResult.artifacts?.excludedNodeIds || [],
  }));
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

  const nodeClient = new NodeClient({
    benchmarkConfig,
  });
  const consistencyEvaluator = new ConsistencyEvaluatorV2();
  const phaseEvents = [];
  const state = {
    convergence: null,
    sutLoadNodes: [],
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
        opsPerSec: ONE,
      },
      policy: {
        insufficientEvidence: benchmarkConfig.insufficientEvidencePolicy,
      },
    }),
  };

  const orchestrator = new PhaseOrchestrator({
    onEvent: (event) => {
      phaseEvents.push(event);
    },
  });

  const phaseHandlers = {
    [SCENARIO_PHASE.PRE_FLIGHT]: async () => {
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
      const sutLoadNodes = await resolveSutLoadNodes(nodeClient, nodes, seedNode);
      assert.ok(
        sutLoadNodes.length > ZERO,
        'No queryable system-under-test nodes available for benchmark load',
      );
      state.sutLoadNodes = sutLoadNodes;
      return {
        status: PHASE_STATUS.OK,
        artifacts: {
          benchmarkTableName,
          sutLoadNodeIds: sutLoadNodes.map((node) => node.id),
        },
      };
    },
    [SCENARIO_PHASE.CONVERGE]: async () => {
      state.convergence = await cluster.waitForConvergence({
        settleTimeoutMs: cluster?._config?.convergence?.settleTimeoutMs,
        quietWindowMs: cluster?._config?.convergence?.quietWindowMs,
        targetVoterCount: cluster?._config?.convergence?.targetVoterCount,
      });
      return {
        status: PHASE_STATUS.OK,
        artifacts: {
          convergence: state.convergence,
        },
      };
    },
    [SCENARIO_PHASE.PRE_LOAD_GATE]: async () => {
      const quiescenceResult = await waitForSutLoadQuiescence({
        nodeClient,
        loadNodes: state.sutLoadNodes,
        seedNode,
        tableName: benchmarkTableName,
        timeoutMs: benchmarkConfig.quiescentTimeoutMs,
        pollIntervalMs: benchmarkConfig.quiescentPollIntervalMs,
        stableWindowMs: benchmarkConfig.quiescentStableWindowMs,
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
          reasonHistogram: quiescenceResult.reasonHistogram || {},
        },
      };
    },
    [SCENARIO_PHASE.LOAD]: async () => {
      state.loadMetrics = await runSutSharedLoad({
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
      });

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
          tableName: benchmarkTableName,
          timeoutMs: benchmarkConfig.postLoadDrainTimeoutMs,
          pollIntervalMs: benchmarkConfig.postLoadDrainPollIntervalMs,
          stableWindowMs: benchmarkConfig.postLoadDrainStableWindowMs,
        });
        state.postLoadDrain = {
          status: POST_LOAD_DRAIN_STATUS_OK,
          mode: postLoadDrainResult.mode,
          attempts: postLoadDrainResult.attempts,
          stableElapsedMs: postLoadDrainResult.stableElapsedMs,
          error: null,
          reasonHistogram: postLoadDrainResult.reasonHistogram || {},
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
        nodeFailureThreshold: benchmarkConfig.nodeFailureThreshold || null,
        nodeFailureCooldownMs: benchmarkConfig.nodeFailureCooldownMs || null,
        quiescentTimeoutMs: benchmarkConfig.quiescentTimeoutMs,
        quiescentPollIntervalMs: benchmarkConfig.quiescentPollIntervalMs,
        quiescentStableWindowMs: benchmarkConfig.quiescentStableWindowMs,
        consistencyAssertMaxAttempts:
          benchmarkConfig.consistencyAssertMaxAttempts,
        consistencyAssertRetryDelayMs:
          benchmarkConfig.consistencyAssertRetryDelayMs,
        consistencyAssertionAttempts: state.consistencyResult.attempts,
        insufficientEvidencePolicy: benchmarkConfig.insufficientEvidencePolicy,
        postLoadDrainStatus: state.postLoadDrain.status,
        postLoadDrainMode: state.postLoadDrain.mode,
        postLoadDrainAttempts: state.postLoadDrain.attempts,
        postLoadDrainStableElapsedMs: state.postLoadDrain.stableElapsedMs,
        postLoadDrainError: state.postLoadDrain.error,
        postLoadDrainReasonHistogram: state.postLoadDrain.reasonHistogram,
        postLoadDrainIncludedNodeIds: state.postLoadDrain.includedNodeIds,
        postLoadDrainExcludedNodeIds: state.postLoadDrain.excludedNodeIds,
        operations: BENCHMARK_WORKLOAD_OPERATIONS,
        tableName: benchmarkTableName,
      },
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
      phaseTimeline: mapPhaseTimeline(orchestrationResult.phases),
      phaseArtifacts: mapPhaseArtifacts(orchestrationResult.phases),
      phaseReasonSummary: buildPhaseReasonSummary(orchestrationResult.phases),
      phaseDecisions: buildPhaseDecisions(
        orchestrationResult.phases,
        benchmarkConfig,
      ),
      phaseEvents,
      channelMetrics: nodeClient.getMetricsSnapshot(),
    },
  };
}

export {run, resolveBenchmarkConfig, buildComparison};
