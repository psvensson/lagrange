import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {withTiDbReferenceRuntime} from './tidb-reference-runtime.js';

const SCENARIO = 'tidb-oltp-baseline';
const DEFAULT_OPERATION_PAIRS = 64;
const DEFAULT_QUERY_TIMEOUT_MS = 15000;
const MILLISECONDS_PER_SECOND = 1000;
const P50 = 0.50;
const P95 = 0.95;
const P99 = 0.99;
const ZERO = 0;

function scenarioConfig(cluster) {
  return cluster?._config?.scenarios?.[SCENARIO] || {};
}

function percentile(sorted, fraction) {
  if (!Array.isArray(sorted) || sorted.length === ZERO) return null;
  const index = Math.min(
    sorted.length - 1,
    Math.max(ZERO, Math.ceil(sorted.length * fraction) - 1),
  );
  return sorted[index];
}

function summarize(latencies, elapsedMs, correctOperations) {
  const sorted = [...latencies].sort((left, right) => left - right);
  return {
    correctOperations,
    elapsedMs,
    throughputOpsPerSec:
      elapsedMs > ZERO ?
        correctOperations / (elapsedMs / MILLISECONDS_PER_SECOND) :
        null,
    latencyMs: {
      p50: percentile(sorted, P50),
      p95: percentile(sorted, P95),
      p99: percentile(sorted, P99),
      max: sorted.length > ZERO ? sorted[sorted.length - 1] : null,
    },
  };
}

async function timedOperation(callback) {
  const startedAt = performance.now();
  const value = await callback();
  return {value, elapsedMs: performance.now() - startedAt};
}

function lagrangeInsertSql(id, timestamp) {
  return (
    'INSERT INTO logs ' +
    '(log_id, timestamp, level, node_id, message, created_at) VALUES (' +
    `'${id}', ${timestamp}, 'info', 'tidb-reference', ` +
    `'payload-${id}', ${timestamp})`
  );
}

function lagrangeSelectSql(id) {
  return `SELECT log_id FROM logs WHERE log_id = '${id}' LIMIT 1`;
}

function tidbInsertSql(id, timestamp) {
  return (
    'INSERT INTO lagrange_benchmark.logs ' +
    '(log_id, timestamp_ms, level_name, node_id, message_text, created_at_ms) ' +
    `VALUES ('${id}', ${timestamp}, 'info', 'tidb-reference', ` +
    `'payload-${id}', ${timestamp})`
  );
}

function tidbSelectSql(id) {
  return (
    'SELECT log_id FROM lagrange_benchmark.logs ' +
    `WHERE log_id = '${id}' LIMIT 1`
  );
}

async function runLagrangeSide(cluster, operationPairs, queryTimeoutMs, prefix) {
  const nodes = cluster.getNodes();
  assert.ok(nodes.length > ZERO, 'Lagrange baseline requires active nodes');
  const latencies = [];
  let correctOperations = ZERO;
  const startedAt = performance.now();
  for (let index = ZERO; index < operationPairs; index += 1) {
    const node = nodes[index % nodes.length];
    const id = `${prefix}-lagrange-${index}`;
    const timestamp = Date.now() + index;
    const inserted = await timedOperation(() => node.queryWithTimeout(
      lagrangeInsertSql(id, timestamp),
      [],
      {timeoutMs: queryTimeoutMs, lane: 'load'},
    ));
    latencies.push(inserted.elapsedMs);
    correctOperations += 1;
    const selected = await timedOperation(() => node.queryWithTimeout(
      lagrangeSelectSql(id),
      [],
      {timeoutMs: queryTimeoutMs, lane: 'load'},
    ));
    latencies.push(selected.elapsedMs);
    const rows = selected.value?.rows || selected.value?.results || [];
    assert.ok(
      Array.isArray(rows) && rows.some((row) => String(row.log_id) === id),
      `Lagrange OLTP oracle did not observe ${id}`,
    );
    correctOperations += 1;
  }
  return summarize(
    latencies,
    performance.now() - startedAt,
    correctOperations,
  );
}

async function prepareTiDb(runtime) {
  await runtime.executeSql('CREATE DATABASE IF NOT EXISTS lagrange_benchmark');
  await runtime.executeSql(
    'CREATE TABLE IF NOT EXISTS lagrange_benchmark.logs (' +
      'log_id VARCHAR(191) PRIMARY KEY, ' +
      'timestamp_ms BIGINT NOT NULL, ' +
      'level_name VARCHAR(32) NOT NULL, ' +
      'node_id VARCHAR(191) NOT NULL, ' +
      'message_text VARCHAR(512) NOT NULL, ' +
      'created_at_ms BIGINT NOT NULL' +
    ')',
  );
}

async function runTiDbSide(runtime, operationPairs, prefix) {
  await prepareTiDb(runtime);
  const latencies = [];
  let correctOperations = ZERO;
  const startedAt = performance.now();
  for (let index = ZERO; index < operationPairs; index += 1) {
    const id = `${prefix}-tidb-${index}`;
    const timestamp = Date.now() + index;
    const inserted = await timedOperation(() => runtime.executeSql(
      tidbInsertSql(id, timestamp),
    ));
    latencies.push(inserted.elapsedMs);
    correctOperations += 1;
    const selected = await timedOperation(() => runtime.executeSql(
      tidbSelectSql(id),
    ));
    latencies.push(selected.elapsedMs);
    assert.equal(
      selected.value.trim(),
      id,
      `TiDB OLTP oracle did not observe ${id}`,
    );
    correctOperations += 1;
  }
  return summarize(
    latencies,
    performance.now() - startedAt,
    correctOperations,
  );
}

function ratio(numerator, denominator) {
  return Number.isFinite(numerator) && Number.isFinite(denominator) &&
    denominator > ZERO ? numerator / denominator : null;
}

async function run(cluster) {
  const config = scenarioConfig(cluster);
  const operationPairs = Number.isInteger(config.operationPairs) ?
    config.operationPairs : DEFAULT_OPERATION_PAIRS;
  const queryTimeoutMs = Number.isInteger(config.queryTimeoutMs) ?
    config.queryTimeoutMs : DEFAULT_QUERY_TIMEOUT_MS;
  assert.ok(operationPairs > ZERO, 'operationPairs must be positive');
  const prefix = `tidb-oltp-${process.pid}-${Date.now()}`;

  const lagrange = await runLagrangeSide(
    cluster,
    operationPairs,
    queryTimeoutMs,
    prefix,
  );
  const tidbResult = await withTiDbReferenceRuntime(
    cluster,
    SCENARIO,
    async (runtime) => ({
      topology: runtime.topologyIdentity(),
      metrics: await runTiDbSide(runtime, operationPairs, prefix),
    }),
  );

  const throughputRatio = ratio(
    lagrange.throughputOpsPerSec,
    tidbResult.metrics.throughputOpsPerSec,
  );
  const p99Ratio = ratio(
    lagrange.latencyMs.p99,
    tidbResult.metrics.latencyMs.p99,
  );
  const matureTarget = {
    minThroughputRatio: Number(config.matureTarget?.minThroughputRatio ?? 0.70),
    maxP99Ratio: Number(config.matureTarget?.maxP99Ratio ?? 1.50),
    enforced: false,
    blockedBy: 'common_protocol_open_loop_adapter_not_yet_shared',
  };

  return {
    comparison: 'lagrange-vs-tidb-tikv-oltp-baseline',
    workload: {
      kind: 'paired-insert-primary-key-read',
      operationPairs,
      correctOperationsPerSide: operationPairs * 2,
    },
    lagrange,
    tidb: tidbResult.metrics,
    tidbTopology: tidbResult.topology,
    observed: {throughputRatio, p99Ratio},
    matureTarget,
    evidenceDisposition: {
      claimEligible: false,
      reason:
        'semantic workload is paired, but Lagrange uses the harness admin ' +
        'client while TiDB uses mysql CLI through Docker exec; this run is ' +
        'an engineering baseline until a shared open-loop client owner exists',
    },
  };
}

export {run};
