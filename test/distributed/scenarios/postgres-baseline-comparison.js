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
import {BENCHMARK_DEFAULTS} from '../harness/constants.js';
import {LoadGenerator} from '../harness/load-generator.js';
import {
  execShell,
  shellQuote,
  waitForPostgresReady,
} from '../harness/pgbench-runner.js';

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
const BASELINE_LOAD_NODE_PREFIX = 'postgres-baseline-load-node-';
const BENCHMARK_EVENT_TABLE_FALLBACK = 'benchmark_events';
const BENCHMARK_DDL_BIGINT_TYPE = 'BIGINT';
const BENCHMARK_DDL_TEXT_TYPE = 'TEXT';
const BENCHMARK_DDL_NOT_NULL = 'NOT NULL';
const BENCHMARK_DDL_PRIMARY_KEY = 'PRIMARY KEY';
const BENCHMARK_POOL_IDLE_TIMEOUT_MS = 30000;
const BENCHMARK_POOL_CONNECTION_TIMEOUT_MS = 10000;

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

async function querySutTableId(seedNode, tableName) {
  const result = await seedNode.query(buildBenchmarkTableLookupSql(tableName));
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

async function ensureSutBenchmarkTable(seedNode, tableName) {
  await seedNode.query(buildBenchmarkTableDdl(tableName));
  const tableId = await querySutTableId(seedNode, tableName);
  if (!tableId) {
    return;
  }
  await seedNode.query(buildBenchmarkPartitionRepairSql(tableName, tableId));
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

async function waitForSutBenchmarkTableReady(seedNode, tableName, options = {}) {
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
      const tableNameResult = await seedNode.query(
        buildBenchmarkPartitionLookupSql(tableName),
      );
      const tableNameRows = rowsFromQueryResult(tableNameResult);
      if (tableNameRows.length > ZERO) {
        return;
      }

      const tableId = await querySutTableId(seedNode, tableName);
      if (tableId) {
        const tableIdResult = await seedNode.query(
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
  seedNode,
  createLoadGenerator,
  loadOpsPerSec,
  loadDuration,
  loadMaxInFlight,
  tableName,
}) {
  const loadGenerator = createLoadGenerator([seedNode], {
    opsPerSec: loadOpsPerSec,
    duration: loadDuration,
    maxInFlight: loadMaxInFlight,
    tableName,
    workloadProfile: BENCHMARK_WORKLOAD_PROFILE,
    operations: BENCHMARK_WORKLOAD_OPERATIONS,
  });
  const loadRun = loadGenerator.start();
  return loadRun.waitComplete();
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

async function run(cluster) {
  const nodes = cluster.getNodes();
  assert.ok(nodes.length >= ONE, 'Scenario requires at least one node');

  const benchmarkConfig = resolveBenchmarkConfig(cluster);
  const scenarioOverrides = resolveScenarioOverrides(cluster);
  const seedNode = nodes.find((node) => node.role === 'seed') || nodes[ZERO];
  const benchmarkTableName = normalizeTableName(
    benchmarkConfig.tableName,
    BENCHMARK_EVENT_TABLE_FALLBACK,
  );
  const provider = resolvePrimaryProvider(cluster);
  const networkName = String(cluster?._networkName || '');
  assert.ok(networkName, 'Cluster network name is not available');

  const convergence = await cluster.waitForConvergence({
    settleTimeoutMs: cluster?._config?.convergence?.settleTimeoutMs,
    quietWindowMs: cluster?._config?.convergence?.quietWindowMs,
    targetVoterCount: cluster?._config?.convergence?.targetVoterCount,
  });

  await ensureSutBenchmarkTable(seedNode, benchmarkTableName);
  await waitForSutBenchmarkTableReady(seedNode, benchmarkTableName, {
    timeoutMs: benchmarkConfig.readyTimeoutMs,
    pollIntervalMs: benchmarkConfig.readyPollIntervalMs,
  });
  const loadMetrics = await runSutSharedLoad({
    seedNode,
    createLoadGenerator: scenarioOverrides.createLoadGenerator,
    loadOpsPerSec: benchmarkConfig.loadOpsPerSec,
    loadDuration: benchmarkConfig.loadDuration,
    loadMaxInFlight: benchmarkConfig.loadMaxInFlight,
    tableName: benchmarkTableName,
  });

  const cacheBaseDir = resolveCacheBaseDir(cluster);
  const baselineCacheIdentity = buildBaselineCacheIdentity(
    benchmarkConfig,
    cacheBaseDir,
  );
  let baselineCacheMetadata = buildBaselineCacheMetadata(
    baselineCacheIdentity,
    {enabled: benchmarkConfig.cacheBaselineMetrics === true},
  );
  const cachedBaseline = await loadBaselineMetricsFromCache(
    baselineCacheIdentity,
    benchmarkConfig,
  );
  baselineCacheMetadata = cachedBaseline.metadata;

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
      const poolMaxConnections = Math.max(
        ONE,
        benchmarkConfig.loadMaxInFlight,
      );
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
        baselineCacheMetadata = await storeBaselineMetricsInCache(
          baselineCacheIdentity,
          benchmarkConfig,
          baselineMetrics,
        );
      } catch (_cacheStoreErr) {
        baselineCacheMetadata.reason = BASELINE_CACHE_INVALID_REASON;
      }
    } finally {
      if (baselinePool && typeof baselinePool.end === 'function') {
        try {
          await baselinePool.end();
        } catch (_poolEndErr) {
          // Best-effort cleanup.
        }
      }
      for (let i = baselineContainers.length - ONE; i >= ZERO; i -= ONE) {
        const containerId = baselineContainers[i]?.containerId;
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

  assert.ok(loadMetrics.total > ZERO,
    'System-under-test load run produced no operations');
  assert.ok(Number(baselineMetrics?.opsPerSec || ZERO) > ZERO,
    'Postgres baseline load run produced zero throughput');

  const comparison = buildComparison(loadMetrics, baselineMetrics);

  await cluster.assertConsistency();

  return {
    loadMetrics,
    details: {
      benchmark: {
        tool: 'shared-load-generator',
        workload: BENCHMARK_WORKLOAD_PROFILE,
        durationSeconds: parseDurationToMs(benchmarkConfig.loadDuration) / 1000,
        clients: benchmarkConfig.baselineLoadNodeCount,
        jobs: benchmarkConfig.jobs,
        loadTargetOpsPerSec: benchmarkConfig.loadOpsPerSec,
        loadDuration: benchmarkConfig.loadDuration,
        loadMaxInFlight: benchmarkConfig.loadMaxInFlight,
        operations: BENCHMARK_WORKLOAD_OPERATIONS,
        tableName: benchmarkTableName,
      },
      baseline: {
        engine: 'postgres',
        image: benchmarkConfig.baselineImage,
        containerIp: baselinePrimaryContainerIp,
        replicaContainerIps: baselineReplicaContainerIps,
        replicationFactor: benchmarkConfig.replicationFactor,
        syncReplicaAcks: benchmarkConfig.syncReplicaAcks,
        loadNodeCount: baselineLoadNodeCount,
        poolMaxConnections: baselinePoolMaxConnections,
        cache: baselineCacheMetadata,
        metrics: baselineMetrics,
      },
      systemUnderTest: {
        seedNodeId: seedNode.id,
        metrics: {
          opsPerSec: loadMetrics.opsPerSec,
          latency: loadMetrics.latency,
          total: loadMetrics.total,
          success: loadMetrics.success,
          failed: loadMetrics.failed,
          errors: loadMetrics.errors,
          loadTargetOpsPerSec: benchmarkConfig.loadOpsPerSec,
          loadMaxInFlight: benchmarkConfig.loadMaxInFlight,
        },
      },
      comparison,
      convergence,
    },
  };
}

export {run, resolveBenchmarkConfig, buildComparison};
