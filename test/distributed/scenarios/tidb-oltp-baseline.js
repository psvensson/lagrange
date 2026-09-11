import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {
  runLagrangeDdl,
  waitForLagrangeTablePartitions,
} from './tidb-reference-lagrange-setup.js';
import {
  metricRatio,
  summarizeLatencies,
  timedOperation,
} from './tidb-reference-metrics.js';
import {withTiDbReferenceRuntime} from './tidb-reference-runtime.js';

const SCENARIO = 'tidb-oltp-baseline';
const TABLE_NAME = 'tidb_oltp_events';
const TIDB_DATABASE = 'lagrange_benchmark';
const DEFAULT_OPERATION_PAIRS = 64;
const DEFAULT_QUERY_TIMEOUT_MS = 15000;
const DEFAULT_DDL_READY_TIMEOUT_MS = 120000;
const DEFAULT_MIN_THROUGHPUT_RATIO = 0.70;
const DEFAULT_MAX_P99_RATIO = 1.50;
const EVENT_ID_SCALE = 1000;
const OPERATIONS_PER_PAIR = 2;
const ZERO = 0;
const ONE = 1;

function scenarioConfig(cluster) {
  return cluster?._config?.scenarios?.[SCENARIO] || {};
}

function createTableSql(table) {
  return (
    `CREATE TABLE IF NOT EXISTS ${table} (` +
    'event_id INTEGER PRIMARY KEY, ' +
    'timestamp_ms INTEGER NOT NULL, ' +
    'level_name TEXT NOT NULL, ' +
    'node_id TEXT NOT NULL, ' +
    'message_text TEXT NOT NULL, ' +
    'created_at_ms INTEGER NOT NULL)'
  );
}

function insertSql(table, eventId, timestamp) {
  return (
    `INSERT INTO ${table} ` +
    '(event_id, timestamp_ms, level_name, node_id, message_text, created_at_ms) ' +
    `VALUES (${eventId}, ${timestamp}, 'info', 'tidb-reference', ` +
    `'payload-${eventId}', ${timestamp})`
  );
}

function selectSql(table, eventId) {
  return `SELECT event_id FROM ${table} WHERE event_id = ${eventId} LIMIT 1`;
}

async function prepareLagrange(cluster, config) {
  const node = cluster.getNodes()[ZERO];
  await runLagrangeDdl(
    node,
    createTableSql(TABLE_NAME),
    {
      queryTimeoutMs: config.queryTimeoutMs,
      ddlReadyTimeoutMs: config.ddlReadyTimeoutMs,
    },
  );
  const partitions = await waitForLagrangeTablePartitions(
    cluster,
    [TABLE_NAME],
    {
      minPartitions: ONE,
      queryTimeoutMs: config.queryTimeoutMs,
      readyTimeoutMs: config.ddlReadyTimeoutMs,
    },
  );
  await node.queryWithTimeout(
    `DELETE FROM ${TABLE_NAME}`,
    [],
    {timeoutMs: config.queryTimeoutMs},
  );
  return partitions;
}

async function runLagrangeSide(cluster, operationPairs, queryTimeoutMs, idBase) {
  const nodes = cluster.getNodes();
  assert.ok(nodes.length > ZERO, 'Lagrange baseline requires active nodes');
  const latencies = [];
  let correctOperations = ZERO;
  const startedAt = performance.now();
  for (let index = ZERO; index < operationPairs; index += ONE) {
    const node = nodes[index % nodes.length];
    const eventId = idBase + index;
    const timestamp = Date.now() + index;
    const inserted = await timedOperation(() => node.queryWithTimeout(
      insertSql(TABLE_NAME, eventId, timestamp),
      [],
      {timeoutMs: queryTimeoutMs, lane: 'load'},
    ));
    latencies.push(inserted.elapsedMs);
    correctOperations += ONE;
    const selected = await timedOperation(() => node.queryWithTimeout(
      selectSql(TABLE_NAME, eventId),
      [],
      {timeoutMs: queryTimeoutMs, lane: 'load'},
    ));
    latencies.push(selected.elapsedMs);
    const rows = selected.value?.rows || selected.value?.results || [];
    assert.ok(
      Array.isArray(rows) &&
        rows.some((row) => Number(row.event_id) === eventId),
      `Lagrange OLTP oracle did not observe ${eventId}`,
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
  await runtime.executeSql(`CREATE DATABASE IF NOT EXISTS ${TIDB_DATABASE}`);
  const table = `${TIDB_DATABASE}.${TABLE_NAME}`;
  await runtime.executeSql(createTableSql(table));
  await runtime.executeSql(`DELETE FROM ${table}`);
}

async function runTiDbSide(runtime, operationPairs, idBase) {
  await prepareTiDb(runtime);
  const table = `${TIDB_DATABASE}.${TABLE_NAME}`;
  const latencies = [];
  let correctOperations = ZERO;
  const startedAt = performance.now();
  for (let index = ZERO; index < operationPairs; index += ONE) {
    const eventId = idBase + index;
    const timestamp = Date.now() + index;
    const inserted = await timedOperation(() => runtime.executeSql(
      insertSql(table, eventId, timestamp),
    ));
    latencies.push(inserted.elapsedMs);
    correctOperations += ONE;
    const selected = await timedOperation(() => runtime.executeSql(
      selectSql(table, eventId),
    ));
    latencies.push(selected.elapsedMs);
    assert.equal(
      selected.value.trim(),
      String(eventId),
      `TiDB OLTP oracle did not observe ${eventId}`,
    );
    correctOperations += ONE;
  }
  return summarizeLatencies(
    latencies,
    performance.now() - startedAt,
    correctOperations,
  );
}

function resolvedConfig(cluster) {
  const raw = scenarioConfig(cluster);
  return {
    operationPairs: Number.isInteger(raw.operationPairs) ?
      raw.operationPairs : DEFAULT_OPERATION_PAIRS,
    queryTimeoutMs: Number.isInteger(raw.queryTimeoutMs) ?
      raw.queryTimeoutMs : DEFAULT_QUERY_TIMEOUT_MS,
    ddlReadyTimeoutMs: Number.isInteger(raw.ddlReadyTimeoutMs) ?
      raw.ddlReadyTimeoutMs : DEFAULT_DDL_READY_TIMEOUT_MS,
    matureTarget: {
      minThroughputRatio: Number(
        raw.matureTarget?.minThroughputRatio ?? DEFAULT_MIN_THROUGHPUT_RATIO,
      ),
      maxP99Ratio: Number(
        raw.matureTarget?.maxP99Ratio ?? DEFAULT_MAX_P99_RATIO,
      ),
    },
  };
}

async function run(cluster) {
  const config = resolvedConfig(cluster);
  assert.ok(config.operationPairs > ZERO, 'operationPairs must be positive');
  const idBase = Date.now() * EVENT_ID_SCALE;
  const lagrangePartitions = await prepareLagrange(cluster, config);
  const lagrange = await runLagrangeSide(
    cluster,
    config.operationPairs,
    config.queryTimeoutMs,
    idBase,
  );
  const tidbResult = await withTiDbReferenceRuntime(
    cluster,
    SCENARIO,
    async (runtime) => ({
      topology: runtime.topologyIdentity(),
      metrics: await runTiDbSide(runtime, config.operationPairs, idBase),
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

  return {
    comparison: 'lagrange-vs-tidb-tikv-oltp-baseline',
    workload: {
      kind: 'paired-user-table-insert-primary-key-read',
      tableSchema: createTableSql(TABLE_NAME),
      operationPairs: config.operationPairs,
      correctOperationsPerSide: config.operationPairs * OPERATIONS_PER_PAIR,
    },
    lagrange,
    lagrangePartitions,
    tidb: tidbResult.metrics,
    tidbTopology: tidbResult.topology,
    observed: {throughputRatio, p99Ratio},
    matureTarget: {
      ...config.matureTarget,
      enforced: false,
      blockedBy: 'common_protocol_open_loop_adapter_not_yet_shared',
    },
    evidenceDisposition: {
      claimEligible: false,
      reason:
        'schema and operations are paired, but Lagrange uses the harness admin ' +
        'client while TiDB uses mysql CLI through Docker exec; this run is ' +
        'an engineering baseline until a shared open-loop client owner exists',
    },
  };
}

export {run};
