import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {
  runLagrangeDdl,
  waitForLagrangeTablePartitions,
} from './tidb-reference-lagrange-setup.js';
import {
  metricRatio,
  summarizeLatencies,
} from './tidb-reference-metrics.js';
import {withTiDbReferenceRuntime} from './tidb-reference-runtime.js';

const SCENARIO = 'tidb-compute-near-data';
const DEFAULT_ENTITY_COUNT = 128;
const DEFAULT_EVENTS_PER_ENTITY = 16;
const DEFAULT_REQUEST_COUNT = 32;
const DEFAULT_INSERT_BATCH_SIZE = 64;
const DEFAULT_PAYLOAD_BYTES = 256;
const DEFAULT_QUERY_TIMEOUT_MS = 20000;
const DEFAULT_DDL_READY_TIMEOUT_MS = 120000;
const DEFAULT_SPLIT_READY_TIMEOUT_MS = 240000;
const DEFAULT_MIN_LAGRANGE_PARTITIONS = 2;
const EVENT_ID_ENTITY_SCALE = 100000;
const VALUE_ORDINAL_MULTIPLIER = 11;
const VALUE_MODULUS = 97;
const MERCHANT_ID_MULTIPLIER = 17;
const DEVICE_ID_MULTIPLIER = 31;
const MERCHANT_SIGNAL_THRESHOLD = 40;
const DEVICE_SIGNAL_THRESHOLD = 45;
const DEFAULT_MIN_THROUGHPUT_RATIO = 2.0;
const DEFAULT_MAX_P99_RATIO = 0.70;
const DEFAULT_MAX_COORDINATOR_ROUND_TRIP_RATIO = 0.50;
const DEFAULT_MAX_EXPENSIVE_EDGE_BYTES_RATIO = 0.50;
const LAGRANGE_TABLES = Object.freeze({
  account: 'tidb_risk_account_events',
  merchant: 'tidb_risk_merchant_events',
  device: 'tidb_risk_device_events',
});
const TIDB_DATABASE = 'lagrange_benchmark';
const VALUE_MULTIPLIERS = Object.freeze({
  account: 17,
  merchant: 29,
  device: 43,
});

function scenarioConfig(cluster) {
  return cluster?._config?.scenarios?.[SCENARIO] || {};
}

function valueFor(kind, entityId, ordinal) {
  const multiplier = VALUE_MULTIPLIERS[kind];
  return ((entityId * multiplier) +
    (ordinal * VALUE_ORDINAL_MULTIPLIER)) % VALUE_MODULUS + 1;
}

function eventRows(kind, entityCount, eventsPerEntity, payloadBytes) {
  const rows = [];
  const payload = 'x'.repeat(payloadBytes);
  for (let entityId = 1; entityId <= entityCount; entityId += 1) {
    for (let ordinal = 1; ordinal <= eventsPerEntity; ordinal += 1) {
      rows.push({
        eventId: (entityId * EVENT_ID_ENTITY_SCALE) + ordinal,
        entityId,
        value: valueFor(kind, entityId, ordinal),
        payload,
      });
    }
  }
  return rows;
}

function createTableSql(table) {
  return (
    `CREATE TABLE IF NOT EXISTS ${table} (` +
    'event_id INTEGER PRIMARY KEY, ' +
    'entity_id INTEGER NOT NULL, ' +
    'value INTEGER NOT NULL, ' +
    'payload TEXT NOT NULL)'
  );
}

function insertSql(table, rows) {
  const values = rows.map((row) =>
    `(${row.eventId}, ${row.entityId}, ${row.value}, '${row.payload}')`,
  ).join(', ');
  return (
    `INSERT INTO ${table} (event_id, entity_id, value, payload) VALUES ${values}`
  );
}

function aggregateSql(table, entityId) {
  const lowerExclusive = entityId * EVENT_ID_ENTITY_SCALE;
  const upperExclusive = (entityId + 1) * EVENT_ID_ENTITY_SCALE;
  return (
    'SELECT COUNT(*) AS row_count, COALESCE(SUM(value), 0) AS value_sum ' +
    `FROM ${table} WHERE event_id > ${lowerExclusive} ` +
    `AND event_id < ${upperExclusive}`
  );
}

async function prepareLagrange(cluster, config) {
  const node = cluster.getNodes()[0];
  const queryTimeoutMs = config.queryTimeoutMs;
  for (const kind of Object.keys(LAGRANGE_TABLES)) {
    const table = LAGRANGE_TABLES[kind];
    await runLagrangeDdl(
      node,
      createTableSql(table),
      {
        queryTimeoutMs,
        ddlReadyTimeoutMs: config.ddlReadyTimeoutMs,
      },
    );
    await waitForLagrangeTablePartitions(
      cluster,
      [table],
      {
        minPartitions: 1,
        queryTimeoutMs,
        readyTimeoutMs: config.ddlReadyTimeoutMs,
      },
    );
    await node.queryWithTimeout(
      `DELETE FROM ${table}`,
      [],
      {timeoutMs: queryTimeoutMs},
    );
    const rows = eventRows(
      kind,
      config.entityCount,
      config.eventsPerEntity,
      config.payloadBytes,
    );
    for (
      let offset = 0;
      offset < rows.length;
      offset += config.insertBatchSize
    ) {
      await node.queryWithTimeout(
        insertSql(table, rows.slice(offset, offset + config.insertBatchSize)),
        [],
        {timeoutMs: queryTimeoutMs, lane: 'load'},
      );
    }
  }
  return waitForLagrangeTablePartitions(
    cluster,
    Object.values(LAGRANGE_TABLES),
    {
      minPartitions: config.minLagrangePartitions,
      queryTimeoutMs,
      readyTimeoutMs: config.splitReadyTimeoutMs,
    },
  );
}

async function prepareTiDb(runtime, config) {
  await runtime.executeSql(`CREATE DATABASE IF NOT EXISTS ${TIDB_DATABASE}`);
  for (const kind of Object.keys(LAGRANGE_TABLES)) {
    const table = `${TIDB_DATABASE}.${LAGRANGE_TABLES[kind]}`;
    await runtime.executeSql(createTableSql(table));
    await runtime.executeSql(`DELETE FROM ${table}`);
    const rows = eventRows(
      kind,
      config.entityCount,
      config.eventsPerEntity,
      config.payloadBytes,
    );
    for (
      let offset = 0;
      offset < rows.length;
      offset += config.insertBatchSize
    ) {
      await runtime.executeSql(
        insertSql(table, rows.slice(offset, offset + config.insertBatchSize)),
      );
    }
  }
}

function parseLagrangeAggregate(result) {
  const rows = result?.rows || result?.results || [];
  assert.ok(
    Array.isArray(rows) && rows.length === 1,
    'aggregate returned no row',
  );
  return {
    rowCount: Number(rows[0].row_count),
    valueSum: Number(rows[0].value_sum),
  };
}

function parseTiDbAggregate(output) {
  const fields = String(output).trim().split('\t');
  assert.equal(fields.length, 2, 'TiDB aggregate returned unexpected shape');
  return {rowCount: Number(fields[0]), valueSum: Number(fields[1])};
}

function requestShape(requestIndex, entityCount) {
  const accountId = (requestIndex % entityCount) + 1;
  return {
    accountId,
    merchantId: ((accountId * MERCHANT_ID_MULTIPLIER) % entityCount) + 1,
    deviceId: ((accountId * DEVICE_ID_MULTIPLIER) % entityCount) + 1,
  };
}

function shouldCallMerchant(account, eventsPerEntity) {
  return account.valueSum >= eventsPerEntity * MERCHANT_SIGNAL_THRESHOLD;
}

function shouldCallDevice(merchant, eventsPerEntity) {
  return merchant.valueSum >= eventsPerEntity * DEVICE_SIGNAL_THRESHOLD;
}

async function lagrangeAggregate(node, kind, entityId, queryTimeoutMs) {
  const startedAt = performance.now();
  const result = await node.queryWithTimeout(
    aggregateSql(LAGRANGE_TABLES[kind], entityId),
    [],
    {timeoutMs: queryTimeoutMs, lane: 'load'},
  );
  return {
    aggregate: parseLagrangeAggregate(result),
    elapsedMs: performance.now() - startedAt,
  };
}

async function tidbAggregate(runtime, kind, entityId) {
  const startedAt = performance.now();
  const output = await runtime.executeSql(
    aggregateSql(`${TIDB_DATABASE}.${LAGRANGE_TABLES[kind]}`, entityId),
  );
  return {
    aggregate: parseTiDbAggregate(output),
    elapsedMs: performance.now() - startedAt,
  };
}

async function runLeafControl(executor, config) {
  const latencies = [];
  const results = [];
  const startedAt = performance.now();
  for (let index = 0; index < config.requestCount; index += 1) {
    const shape = requestShape(index, config.entityCount);
    const outcome = await executor('account', shape.accountId);
    latencies.push(outcome.elapsedMs);
    results.push(outcome.aggregate);
  }
  return {
    metrics: summarizeLatencies(
      latencies,
      performance.now() - startedAt,
      config.requestCount,
    ),
    results,
  };
}

async function runRiskComposition(executor, config) {
  const latencies = [];
  const decisions = [];
  let aggregateCalls = 0;
  const startedAt = performance.now();
  for (let index = 0; index < config.requestCount; index += 1) {
    const requestStartedAt = performance.now();
    const shape = requestShape(index, config.entityCount);
    const account = (await executor('account', shape.accountId)).aggregate;
    aggregateCalls += 1;
    let merchant = {rowCount: 0, valueSum: 0};
    let device = {rowCount: 0, valueSum: 0};
    if (shouldCallMerchant(account, config.eventsPerEntity)) {
      merchant = (await executor('merchant', shape.merchantId)).aggregate;
      aggregateCalls += 1;
      if (shouldCallDevice(merchant, config.eventsPerEntity)) {
        device = (await executor('device', shape.deviceId)).aggregate;
        aggregateCalls += 1;
      }
    }
    decisions.push({
      accountId: shape.accountId,
      merchantId: shape.merchantId,
      deviceId: shape.deviceId,
      hops: 1 + (merchant.rowCount > 0 ? 1 : 0) +
        (device.rowCount > 0 ? 1 : 0),
      score: account.valueSum + merchant.valueSum + device.valueSum,
    });
    latencies.push(performance.now() - requestStartedAt);
  }
  return {
    metrics: summarizeLatencies(
      latencies,
      performance.now() - startedAt,
      config.requestCount,
    ),
    aggregateCalls,
    decisions,
  };
}

function resolvedConfig(cluster) {
  const raw = scenarioConfig(cluster);
  return {
    entityCount: Number.isInteger(raw.entityCount) ?
      raw.entityCount : DEFAULT_ENTITY_COUNT,
    eventsPerEntity: Number.isInteger(raw.eventsPerEntity) ?
      raw.eventsPerEntity : DEFAULT_EVENTS_PER_ENTITY,
    requestCount: Number.isInteger(raw.requestCount) ?
      raw.requestCount : DEFAULT_REQUEST_COUNT,
    insertBatchSize: Number.isInteger(raw.insertBatchSize) ?
      raw.insertBatchSize : DEFAULT_INSERT_BATCH_SIZE,
    payloadBytes: Number.isInteger(raw.payloadBytes) ?
      raw.payloadBytes : DEFAULT_PAYLOAD_BYTES,
    queryTimeoutMs: Number.isInteger(raw.queryTimeoutMs) ?
      raw.queryTimeoutMs : DEFAULT_QUERY_TIMEOUT_MS,
    ddlReadyTimeoutMs: Number.isInteger(raw.ddlReadyTimeoutMs) ?
      raw.ddlReadyTimeoutMs : DEFAULT_DDL_READY_TIMEOUT_MS,
    splitReadyTimeoutMs: Number.isInteger(raw.splitReadyTimeoutMs) ?
      raw.splitReadyTimeoutMs : DEFAULT_SPLIT_READY_TIMEOUT_MS,
    minLagrangePartitions: Number.isInteger(raw.minLagrangePartitions) ?
      raw.minLagrangePartitions : DEFAULT_MIN_LAGRANGE_PARTITIONS,
    matureTarget: {
      minThroughputRatio: Number(
        raw.matureTarget?.minThroughputRatio ?? DEFAULT_MIN_THROUGHPUT_RATIO,
      ),
      maxP99Ratio: Number(
        raw.matureTarget?.maxP99Ratio ?? DEFAULT_MAX_P99_RATIO,
      ),
      maxCoordinatorRoundTripRatio: Number(
        raw.matureTarget?.maxCoordinatorRoundTripRatio ??
          DEFAULT_MAX_COORDINATOR_ROUND_TRIP_RATIO,
      ),
      maxExpensiveEdgeBytesRatio: Number(
        raw.matureTarget?.maxExpensiveEdgeBytesRatio ??
          DEFAULT_MAX_EXPENSIVE_EDGE_BYTES_RATIO,
      ),
    },
  };
}

async function run(cluster) {
  const config = resolvedConfig(cluster);
  assert.ok(config.entityCount > 0 && config.eventsPerEntity > 0);
  assert.ok(config.requestCount > 0 && config.insertBatchSize > 0);
  assert.ok(config.payloadBytes > 0, 'payloadBytes must be positive');
  assert.ok(
    config.minLagrangePartitions >= 2,
    'compute-near-data control must exercise multiple Lagrange partitions',
  );
  const lagrangeNode = cluster.getNodes()[0];
  const lagrangePartitions = await prepareLagrange(cluster, config);

  return withTiDbReferenceRuntime(cluster, SCENARIO, async (runtime) => {
    await prepareTiDb(runtime, config);
    const lagrangeLeaf = await runLeafControl(
      (kind, entityId) => lagrangeAggregate(
        lagrangeNode,
        kind,
        entityId,
        config.queryTimeoutMs,
      ),
      config,
    );
    const tidbLeaf = await runLeafControl(
      (kind, entityId) => tidbAggregate(runtime, kind, entityId),
      config,
    );
    assert.deepEqual(
      lagrangeLeaf.results,
      tidbLeaf.results,
      'leaf-pushdown control produced different aggregate results',
    );

    const lagrangeRisk = await runRiskComposition(
      (kind, entityId) => lagrangeAggregate(
        lagrangeNode,
        kind,
        entityId,
        config.queryTimeoutMs,
      ),
      config,
    );
    const tidbRisk = await runRiskComposition(
      (kind, entityId) => tidbAggregate(runtime, kind, entityId),
      config,
    );
    assert.deepEqual(
      lagrangeRisk.decisions,
      tidbRisk.decisions,
      'risk-composition oracle diverged between Lagrange and TiDB',
    );

    const topology = runtime.topologyIdentity();
    const coprocessorV2 = topology.coprocessorV2;
    const serviceGraphEngaged = false;
    const coproV2Engaged = Boolean(coprocessorV2.artifactIdentity) &&
      coprocessorV2.comparatorMode === 'coprocessor_v2';

    return {
      comparison: 'lagrange-vs-tidb-tikv-compute-near-data',
      topology,
      lagrangePartitions,
      workload: {
        entityCount: config.entityCount,
        eventsPerEntity: config.eventsPerEntity,
        payloadBytes: config.payloadBytes,
        requestCount: config.requestCount,
        minLagrangePartitions: config.minLagrangePartitions,
        primaryKeyLocality:
          'each entity owns one contiguous event_id range used by every leaf',
        dynamicGraph: 'account -> optional merchant -> optional device',
      },
      phases: {
        leafPushdownControl: {
          purpose:
            'negative/control phase: both sides reduce beside storage; ' +
            'Lagrange is not expected to win merely because compute is local',
          lagrange: lagrangeLeaf.metrics,
          tidb: tidbLeaf.metrics,
          throughputRatio: metricRatio(
            lagrangeLeaf.metrics.throughputOpsPerSec,
            tidbLeaf.metrics.throughputOpsPerSec,
          ),
        },
        distributedRiskComposition: {
          purpose:
            'target phase: dynamic distributed application composition; ' +
            'mature Lagrange should internalize the call graph while the ' +
            'TiDB comparator retains an external coordinator',
          currentLagrangeSqlControl: lagrangeRisk.metrics,
          tidbSqlCoprocessorControl: tidbRisk.metrics,
          aggregateCalls: {
            lagrange: lagrangeRisk.aggregateCalls,
            tidb: tidbRisk.aggregateCalls,
          },
          observedThroughputRatio: metricRatio(
            lagrangeRisk.metrics.throughputOpsPerSec,
            tidbRisk.metrics.throughputOpsPerSec,
          ),
          observedP99Ratio: metricRatio(
            lagrangeRisk.metrics.latencyMs.p99,
            tidbRisk.metrics.latencyMs.p99,
          ),
        },
      },
      matureTarget: {
        ...config.matureTarget,
        serviceGraphModel:
          'one external request -> partition-local service -> routed ctx.call ' +
          'composition, including parallel branches where independent',
        comparatorModel:
          'TiDB/TiKV with equivalent storage-local computation; claim run ' +
          'requires the coprocessor-v2 comparator artifact',
        rebalanceRequirement:
          'repeat target load while relevant partitions move; service identity ' +
          'must follow ownership without failed requests',
        enforced: false,
      },
      evidenceDisposition: {
        claimEligible: serviceGraphEngaged && coproV2Engaged,
        reasonCodes: [
          ...(serviceGraphEngaged ? [] : [
            'lagrange_service_graph_target_not_engaged',
          ]),
          ...(coproV2Engaged ? [] : [
            'tidb_coprocessor_v2_comparator_not_engaged',
          ]),
          'shared_open_loop_client_not_yet_engaged',
          'expensive_edge_byte_accounting_not_yet_engaged',
          'rebalance_subphase_not_yet_engaged',
        ],
      },
    };
  });
}

export {run};
