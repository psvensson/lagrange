/**
 * Scenario: postgres-baseline-comparison
 *
 * Runs harness load against the system under test, then runs a standardized
 * pgbench workload against a baseline Postgres container on the same Docker
 * network and reports comparative metrics.
 */

import assert from 'node:assert/strict';
import {BENCHMARK_DEFAULTS} from '../harness/constants.js';
import {
  buildPgbenchScript,
  execShell,
  shellQuote,
  writePgbenchScript,
  waitForPostgresReady,
  ensureBenchmarkTable,
  runPgbench,
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    readyTimeoutMs: Number.isInteger(configured.readyTimeoutMs) ?
      configured.readyTimeoutMs :
      BENCHMARK_DEFAULTS.readyTimeoutMs,
    readyPollIntervalMs: Number.isInteger(configured.readyPollIntervalMs) ?
      configured.readyPollIntervalMs :
      BENCHMARK_DEFAULTS.readyPollIntervalMs,
    tableName: configured.tableName || BENCHMARK_DEFAULTS.tableName,
    replicationFactor,
    syncReplicaAcks,
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

function buildComparison(loadMetrics, baselineMetrics) {
  const sutOpsPerSec = Number(loadMetrics?.opsPerSec || ZERO);
  const sutP99LatencyMs = Number(loadMetrics?.latency?.p99 || ZERO);
  const baselineTps = Number(baselineMetrics?.tps || ZERO);
  const baselineLatencyAvgMs = Number(baselineMetrics?.latencyAverageMs || ZERO);

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
  const seedNode = nodes.find((node) => node.role === 'seed') || nodes[ZERO];
  const provider = resolvePrimaryProvider(cluster);
  const networkName = String(cluster?._networkName || '');
  assert.ok(networkName, 'Cluster network name is not available');

  const convergence = await cluster.waitForConvergence({
    settleTimeoutMs: cluster?._config?.convergence?.settleTimeoutMs,
    quietWindowMs: cluster?._config?.convergence?.quietWindowMs,
    targetVoterCount: cluster?._config?.convergence?.targetVoterCount,
  });

  const sutLoadRun = cluster.startLoad({
    opsPerSec: benchmarkConfig.loadOpsPerSec,
    duration: benchmarkConfig.loadDuration,
  });
  const loadMetrics = await sutLoadRun.waitComplete();

  const baselineContainers = [];
  let baselinePrimaryContainerId = null;
  let baselinePrimaryContainerIp = null;
  const baselineReplicaContainerIps = [];
  let baselineMetrics = null;

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

    const script = buildPgbenchScript();
    await writePgbenchScript(provider, baselinePrimaryContainerId, script);

    await ensureBenchmarkTable(provider, baselinePrimaryContainerId, {
      host: LOCALHOST,
      port: benchmarkConfig.port,
      user: benchmarkConfig.user,
      password: benchmarkConfig.password,
      database: benchmarkConfig.database,
      tableName: benchmarkConfig.tableName,
    });

    baselineMetrics = await runPgbench(provider, baselinePrimaryContainerId, {
      host: LOCALHOST,
      port: benchmarkConfig.port,
      user: benchmarkConfig.user,
      password: benchmarkConfig.password,
      database: benchmarkConfig.database,
      durationSeconds: benchmarkConfig.durationSeconds,
      clients: benchmarkConfig.clients,
      jobs: benchmarkConfig.jobs,
    });
  } finally {
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

  assert.ok(loadMetrics.total > ZERO,
    'System-under-test load run produced no operations');
  assert.ok(baselineMetrics.tps > ZERO,
    'Postgres baseline pgbench run produced zero TPS');

  const comparison = buildComparison(loadMetrics, baselineMetrics);

  await cluster.assertConsistency();

  return {
    loadMetrics,
    details: {
      benchmark: {
        tool: 'pgbench',
        workload: 'custom-mixed-insert-select',
        durationSeconds: benchmarkConfig.durationSeconds,
        clients: benchmarkConfig.clients,
        jobs: benchmarkConfig.jobs,
      },
      baseline: {
        engine: 'postgres',
        image: benchmarkConfig.baselineImage,
        containerIp: baselinePrimaryContainerIp,
        replicaContainerIps: baselineReplicaContainerIps,
        replicationFactor: benchmarkConfig.replicationFactor,
        syncReplicaAcks: benchmarkConfig.syncReplicaAcks,
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
        },
      },
      comparison,
      convergence,
    },
  };
}

export {run, resolveBenchmarkConfig, buildComparison};
