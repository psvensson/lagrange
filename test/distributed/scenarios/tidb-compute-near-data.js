import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {withTiDbReferenceRuntime} from './tidb-reference-runtime.js';

const SCENARIO = 'tidb-compute-near-data';
const ZERO = 0;
const ONE = 1;
const DEFAULT_ENTITY_COUNT = 128;
const DEFAULT_EVENTS_PER_ENTITY = 16;
const DEFAULT_REQUEST_COUNT = 32;
const DEFAULT_INSERT_BATCH_SIZE = 64;
const DEFAULT_QUERY_TIMEOUT_MS = 20000;
const P50 = 0.50;
const P95 = 0.95;
const P99 = 0.99;
const MS_PER_SECOND = 1000;
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

function percentile(sorted, fraction) {
  if (sorted.length === ZERO) return null;
  const index = Math.min(
    sorted.length - ONE,
    Math.max(ZERO, Math.ceil(sorted.length * fraction) - ONE),
  );
  return sorted[index];
}

function summarize(latencies, startedAt, operations) {
  const sorted = [...latencies].sort((left, right) => left - right);
  const elapsedMs = performance.now() - startedAt;
  return {
    operations,
    elapsedMs,
    throughputOpsPerSec:
      elapsedMs > ZERO ? operations / (elapsedMs / MS_PER_SECOND) : null,
    latencyMs: {
      p50: percentile(sorted, P50),
      p95: percentile(sorted, P95),
      p99: percentile(sorted, P99),
    },
  };
}

function valueFor(kind, entityId, ordinal) {
  const multiplier = VALUE_MULTIPLIERS[kind];
  return ((entityId * multiplier) + (ordinal * 11)) % 97 + ONE;
}

function eventRows(kind, entityCount, eventsPerEntity) {
  const rows = [];
  for (let entityId = ONE; entityId <= entityCount; entityId += ONE) {
    for (let ordinal = ONE; ordinal <= eventsPerEntity; ordinal += ONE) {
      rows.push({
        eventId: (entityId * 100000) + ordinal,
        entityId,
        value: valueFor(kind, entityId, ordinal),
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
    'value INTEGER NOT NULL)'
  );
}

function insertSql(table, rows) {
  const values = rows.map((row) =>
    `(${row.eventId}, ${row.entityId}, ${row.value})`,
  ).join(', ');
  return `INSERT INTO ${table} (event_id, entity_id, value) VALUES ${values}`;
}

function aggregateSql(table, entityId) {
  return (
    'SELECT COUNT(*) AS row_count, COALESCE(SUM(value), 0) AS value_sum ' +
    `FROM ${table} WHERE entity_id = ${entityId}`
  );
}

async function prepareLagrange(cluster, config) {
  const node = cluster.getNodes()[ZERO];
  const queryTimeoutMs = config.queryTimeoutMs;
  for (const kind of Object.keys(LAGRANGE_TABLES)) {
    const table = LAGRANGE_TABLES[kind];
    await node.queryWithTimeout(
      createTableSql(table),
      [],
      {timeoutMs: queryTimeoutMs},
    );
    await node.queryWithTimeout(
      `DELETE FROM ${table}`,
      [],
      {timeoutMs: queryTimeoutMs},
    );
    const rows = eventRows(kind, config.entityCount, config.eventsPerEntity);
    for (let offset = ZERO; offset < rows.length; offset += config.insertBatchSize) {
      await node.queryWithTimeout(
        insertSql(table, rows.slice(offset, offset + config.insertBatchSize)),
        [],
        {timeoutMs: queryTimeoutMs, lane: 'load'},
      );
    }
  }
}

async function prepareTiDb(runtime, config) {
  await runtime.executeSql(`CREATE DATABASE IF NOT EXISTS ${TIDB_DATABASE}`);
  for (const kind of Object.keys(LAGRANGE_TABLES)) {
    const table = `${TIDB_DATABASE}.${LAGRANGE_TABLES[kind]}`;
    await runtime.executeSql(createTableSql(table));
    await runtime.executeSql(`DELETE FROM ${table}`);
    const rows = eventRows(kind, config.entityCount, config.eventsPerEntity);
    for (let offset = ZERO; offset < rows.length; offset += config.insertBatchSize) {
      await runtime.executeSql(
        insertSql(table, rows.slice(offset, offset + config.insertBatchSize)),
      );
    }
  }
}

function parseLagrangeAggregate(result) {
  const rows = result?.rows || result?.results || [];
  assert.ok(Array.isArray(rows) && rows.length === ONE, 'aggregate returned no row');
  return {
    rowCount: Number(rows[ZERO].row_count),
    valueSum: Number(rows[ZERO].value_sum),
  };
}

function parseTiDbAggregate(output) {
  const fields = String(output).trim().split('\t');
  assert.equal(fields.length, 2, 'TiDB aggregate returned unexpected shape');
  return {rowCount: Number(fields[ZERO]), valueSum: Number(fields[ONE])};
}

function requestShape(requestIndex, entityCount) {
  const accountId = (requestIndex % entityCount) + ONE;
  return {
    accountId,
    merchantId: ((accountId * 17) % entityCount) + ONE,
    deviceId: ((accountId * 31) % entityCount) + ONE,
  };
}

function shouldCallMerchant(account, eventsPerEntity) {
  return account.valueSum >= eventsPerEntity * 40;
}

function shouldCallDevice(merchant, eventsPerEntity) {
  return merchant.valueSum >= eventsPerEntity * 45;
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
  for (let index = ZERO; index < config.requestCount; index += ONE) {
    const shape = requestShape(index, config.entityCount);
    const outcome = await executor('account', shape.accountId);
    latencies.push(outcome.elapsedMs);
    results.push(outcome.aggregate);
  }
  return {
    metrics: summarize(latencies, startedAt, config.requestCount),
    results,
  };
}

async function runRiskComposition(executor, config) {
  const latencies = [];
  const decisions = [];
  let aggregateCalls = ZERO;
  const startedAt = performance.now();
  for (let index = ZERO; index < config.requestCount; index += ONE) {
    const requestStartedAt = performance.now();
    const shape = requestShape(index, config.entityCount);
    const account = (await executor('account', shape.accountId)).aggregate;
    aggregateCalls += ONE;
    let merchant = {rowCount: ZERO, valueSum: ZERO};
    let device = {rowCount: ZERO, valueSum: ZERO};
    if (shouldCallMerchant(account, config.eventsPerEntity)) {
      merchant = (await executor('merchant', shape.merchantId)).aggregate;
      aggregateCalls += ONE;
      if (shouldCallDevice(merchant, config.eventsPerEntity)) {
        device = (await executor('device', shape.deviceId)).aggregate;
        aggregateCalls += ONE;
      }
    }
    decisions.push({
      accountId: shape.accountId,
      merchantId: shape.merchantId,
      deviceId: shape.deviceId,
      hops: ONE + (merchant.rowCount > ZERO ? ONE : ZERO) +
        (device.rowCount > ZERO ? ONE : ZERO),
      score: account.valueSum + merchant.valueSum + device.valueSum,
    });
    latencies.push(performance.now() - requestStartedAt);
  }
  return {
    metrics: summarize(latencies, startedAt, config.requestCount),
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
    queryTimeoutMs: Number.isInteger(raw.queryTimeoutMs) ?
      raw.queryTimeoutMs : DEFAULT_QUERY_TIMEOUT_MS,
    matureTarget: {
      minThroughputRatio: Number(raw.matureTarget?.minThroughputRatio ?? 2.0),
      maxP99Ratio: Number(raw.matureTarget?.maxP99Ratio ?? 0.70),
      maxCoordinatorRoundTripRatio:
        Number(raw.matureTarget?.maxCoordinatorRoundTripRatio ?? 0.50),
      maxExpensiveEdgeBytesRatio:
        Number(raw.matureTarget?.maxExpensiveEdgeBytesRatio ?? 0.50),
    },
  };
}

function metricRatio(left, right) {
  return Number.isFinite(left) && Number.isFinite(right) && right > ZERO ?
    left / right : null;
}

async function run(cluster) {
  const config = resolvedConfig(cluster);
  assert.ok(config.entityCount > ZERO && config.eventsPerEntity > ZERO);
  assert.ok(config.requestCount > ZERO && config.insertBatchSize > ZERO);
  const lagrangeNode = cluster.getNodes()[ZERO];
  await prepareLagrange(cluster, config);

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

    const coprocessorV2 = runtime.topologyIdentity().coprocessorV2;
    const serviceGraphEngaged = false;
    const coproV2Engaged = Boolean(coprocessorV2.artifactIdentity) &&
      coprocessorV2.comparatorMode === 'coprocessor_v2';

    return {
      comparison: 'lagrange-vs-tidb-tikv-compute-near-data',
      topology: runtime.topologyIdentity(),
      workload: {
        entityCount: config.entityCount,
        eventsPerEntity: config.eventsPerEntity,
        requestCount: config.requestCount,
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
          ...(serviceGraphEngaged ? [] : ['lagrange_service_graph_target_not_engaged']),
          ...(coproV2Engaged ? [] : ['tidb_coprocessor_v2_comparator_not_engaged']),
          'shared_open_loop_client_not_yet_engaged',
          'expensive_edge_byte_accounting_not_yet_engaged',
          'rebalance_subphase_not_yet_engaged',
        ],
      },
    };
  });
}

export {run};
