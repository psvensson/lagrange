import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {
  metricRatio,
  summarizeLatencies,
  timedOperation,
} from './tidb-reference-metrics.js';
import {withTiDbReferenceRuntime} from './tidb-reference-runtime.js';

const SCENARIO = 'tidb-oltp-baseline';
const DEFAULT_OPERATION_PAIRS = 64;
const DEFAULT_QUERY_TIMEOUT_MS = 15000;
const DEFAULT_MIN_THROUGHPUT_RATIO = 0.70;
const DEFAULT_MAX_P99_RATIO = 1.50;
const OPERATIONS_PER_PAIR = 2;
const ZERO = 0;
const ONE = 1;

function scenarioConfig(cluster) {
  return cluster?._config?.scenarios?.[SCENARIO] || {};
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
  for (let index = ZERO; index < operationPairs; index += ONE) {
    const node = nodes[index % nodes.length];
    const id = `${prefix}-lagrange-${index}`;
    const timestamp = Date.now() + index;
    const inserted = await timedOperation(() => node.queryWithTimeout(
      lagrangeInsertSql(id, timestamp),
      [],
      {timeoutMs: queryTimeoutMs, lane: 'load'},
    ));
    latencies.push(inserted.elapsedMs);
    correctOperations += ONE;
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
    correctOperations += ONE;
  }
  return summarizeLatencies(
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
  for (let index = ZERO; index < operationPairs; index += ONE) {
    const id = `${prefix}-tidb-${index}`;
    const timestamp = Date.now() + index;
    const inserted = await timedOperation(() => runtime.executeSql(
      tidbInsertSql(id, timestamp),
    ));
    latencies.push(inserted.elapsedMs);
    correctOperations += ONE;
    const selected = await timedOperation(() => runtime.executeSql(
      tidbSelectSql(id),
    ));
    latencies.push(selected.elapsedMs);
    assert.equal(
      selected.value.trim(),
      id,
      `TiDB OLTP oracle did not observe ${id}`,
    );
    correctOperations += ONE;
  }
  return summarizeLatencies(
    latencies,
    performance.now() - startedAt,
    correctOperations,
  );
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

  const throughputRatio = metricRatio(
    lagrange.throughputOpsPerSec,
    tidbResult.metrics.throughputOpsPerSec,
  );
  const p99Ratio = metricRatio(
    lagrange.latencyMs.p99,
    tidbResult.metrics.latencyMs.p99,
  );
  const matureTarget = {
    minThroughputRatio: Number(
      config.matureTarget?.minThroughputRatio ?? DEFAULT_MIN_THROUGHPUT_RATIO,
    ),
    maxP99Ratio: Number(
      config.matureTarget?.maxP99Ratio ?? DEFAULT_MAX_P99_RATIO,
    ),
    enforced: false,
    blockedBy: 'common_protocol_open_loop_adapter_not_yet_shared',
  };

  return {
    comparison: 'lagrange-vs-tidb-tikv-oltp-baseline',
    workload: {
      kind: 'paired-insert-primary-key-read',
      operationPairs,
      correctOperationsPerSide: operationPairs * OPERATIONS_PER_PAIR,
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
