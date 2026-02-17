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

function resolveBenchmarkConfig(cluster) {
  const configured = cluster?._config?.benchmark || {};
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

  let baselineContainerId = null;
  let baselineContainerIp = null;
  let baselineMetrics = null;

  try {
    const baselineContainer = await provider.createContainer({
      name: BENCHMARK_CONTAINER_NAME_PREFIX + Date.now(),
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

    baselineContainerId = baselineContainer.containerId;
    baselineContainerIp = baselineContainer.ip;

    await waitForPostgresReady(provider, baselineContainerId, {
      host: '127.0.0.1',
      port: benchmarkConfig.port,
      user: benchmarkConfig.user,
      database: benchmarkConfig.database,
      timeoutMs: benchmarkConfig.readyTimeoutMs,
      pollIntervalMs: benchmarkConfig.readyPollIntervalMs,
    });

    const script = buildPgbenchScript();
    await writePgbenchScript(provider, baselineContainerId, script);

    await ensureBenchmarkTable(provider, baselineContainerId, {
      host: '127.0.0.1',
      port: benchmarkConfig.port,
      user: benchmarkConfig.user,
      password: benchmarkConfig.password,
      database: benchmarkConfig.database,
      tableName: benchmarkConfig.tableName,
    });

    baselineMetrics = await runPgbench(provider, baselineContainerId, {
      host: '127.0.0.1',
      port: benchmarkConfig.port,
      user: benchmarkConfig.user,
      password: benchmarkConfig.password,
      database: benchmarkConfig.database,
      durationSeconds: benchmarkConfig.durationSeconds,
      clients: benchmarkConfig.clients,
      jobs: benchmarkConfig.jobs,
    });
  } finally {
    if (baselineContainerId) {
      try {
        await provider.stopContainer(baselineContainerId);
      } catch (_stopErr) {
        // Best-effort cleanup.
      }
      try {
        await provider.removeContainer(baselineContainerId);
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
        containerIp: baselineContainerIp,
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
