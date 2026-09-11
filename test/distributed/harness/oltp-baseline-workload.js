import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';

const ZERO = 0;
const ONE = 1;
const HUNDRED = 100;
const MIN_NEW_ORDER_LINES = 5;
const MAX_NEW_ORDER_LINES = 15;
const MAX_ERROR_SAMPLES_PER_KIND = 3;
const WORKLOAD_NAME = 'oltp-baseline-v1';
const DEFAULT_SEED = 0x5eed5eed;
const PHASE_SALT = Object.freeze({
  warmup: 0x13579bdf,
  measurement: 0x2468ace0,
});
const OPERATION_KIND = Object.freeze({
  NEW_ORDER: 'new_order',
  PAYMENT: 'payment',
  ORDER_STATUS: 'order_status',
  DELIVERY: 'delivery',
  STOCK_LEVEL: 'stock_level',
});
const OPERATION_MIX = Object.freeze({
  [OPERATION_KIND.NEW_ORDER]: 45,
  [OPERATION_KIND.PAYMENT]: 43,
  [OPERATION_KIND.ORDER_STATUS]: 4,
  [OPERATION_KIND.DELIVERY]: 4,
  [OPERATION_KIND.STOCK_LEVEL]: 4,
});
const OPERATION_KINDS = Object.freeze(Object.keys(OPERATION_MIX));
const DEFAULTS = Object.freeze({
  seed: DEFAULT_SEED,
  workers: 8,
  warmupOperationsPerWorker: 100,
  measurementOperationsPerWorker: 1000,
  warehouseCount: 4,
  districtsPerWarehouse: 10,
  customersPerDistrict: 300,
  itemCount: 10000,
});

function integerAtLeast(value, fallback, name, minimum) {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < minimum) {
    throw new Error(`${name} must be an integer >= ${minimum}`);
  }
  return resolved;
}

function positiveInteger(value, fallback, name, allowZero = false) {
  return integerAtLeast(
    value,
    fallback,
    name,
    allowZero ? ZERO : ONE,
  );
}

function resolveOltpBaselineConfig(options = {}) {
  return Object.freeze({
    seed: Number.isFinite(options.seed) ?
      (Math.floor(options.seed) >>> ZERO) :
      DEFAULTS.seed,
    workers: positiveInteger(options.workers, DEFAULTS.workers, 'workers'),
    warmupOperationsPerWorker: positiveInteger(
      options.warmupOperationsPerWorker,
      DEFAULTS.warmupOperationsPerWorker,
      'warmupOperationsPerWorker',
      true,
    ),
    measurementOperationsPerWorker: positiveInteger(
      options.measurementOperationsPerWorker,
      DEFAULTS.measurementOperationsPerWorker,
      'measurementOperationsPerWorker',
    ),
    scale: Object.freeze({
      warehouseCount: positiveInteger(
        options.warehouseCount,
        DEFAULTS.warehouseCount,
        'warehouseCount',
      ),
      districtsPerWarehouse: positiveInteger(
        options.districtsPerWarehouse,
        DEFAULTS.districtsPerWarehouse,
        'districtsPerWarehouse',
      ),
      customersPerDistrict: positiveInteger(
        options.customersPerDistrict,
        DEFAULTS.customersPerDistrict,
        'customersPerDistrict',
      ),
      itemCount: integerAtLeast(
        options.itemCount,
        DEFAULTS.itemCount,
        'itemCount',
        MAX_NEW_ORDER_LINES,
      ),
    }),
  });
}

function createSeededRng(seed) {
  let state = Math.floor(seed) >>> ZERO;
  if (state === ZERO) state = ONE;
  return () => {
    state = (1664525 * state + 1013904223) >>> ZERO;
    return state / 4294967296;
  };
}

function deriveSeed(seed, workerIndex, phase) {
  const phaseSalt = PHASE_SALT[phase];
  const workerSalt = Math.imul(workerIndex + ONE, 0x9e3779b9);
  const derived = (seed ^ phaseSalt ^ workerSalt) >>> ZERO;
  return derived === ZERO ? ONE : derived;
}

function randomInteger(rng, minimum, maximum) {
  return minimum + Math.floor(rng() * (maximum - minimum + ONE));
}

function buildMixDeck() {
  const deck = [];
  for (const kind of OPERATION_KINDS) {
    for (let index = ZERO; index < OPERATION_MIX[kind]; index += ONE) {
      deck.push(kind);
    }
  }
  return deck;
}

function shuffle(values, rng) {
  const result = [...values];
  for (let index = result.length - ONE; index > ZERO; index -= ONE) {
    const other = randomInteger(rng, ZERO, index);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function buildOperationKinds(count, rng) {
  const baseDeck = buildMixDeck();
  const kinds = [];
  while (kinds.length < count) {
    const deck = shuffle(baseDeck, rng);
    const remaining = count - kinds.length;
    kinds.push(...deck.slice(ZERO, remaining));
  }
  return kinds;
}

function chooseRemoteWarehouse(rng, homeWarehouseId, warehouseCount, chance) {
  if (warehouseCount <= ONE || rng() >= chance) return homeWarehouseId;
  let warehouseId = homeWarehouseId;
  while (warehouseId === homeWarehouseId) {
    warehouseId = randomInteger(rng, ONE, warehouseCount);
  }
  return warehouseId;
}

function uniqueItemIds(rng, count, itemCount) {
  const ids = new Set();
  while (ids.size < count) {
    ids.add(randomInteger(rng, ONE, itemCount));
  }
  return [...ids];
}

function commonOperationFields(kind, context) {
  return {
    kind,
    phase: context.phase,
    workerId: context.workerIndex + ONE,
    sequence: context.sequence + ONE,
    warehouseId: randomInteger(
      context.rng,
      ONE,
      context.scale.warehouseCount,
    ),
  };
}

function generateOperation(kind, context) {
  const operation = commonOperationFields(kind, context);
  const {rng, scale} = context;
  const districtId = randomInteger(rng, ONE, scale.districtsPerWarehouse);

  if (kind === OPERATION_KIND.NEW_ORDER) {
    const lineCount = randomInteger(
      rng,
      MIN_NEW_ORDER_LINES,
      MAX_NEW_ORDER_LINES,
    );
    const itemIds = uniqueItemIds(rng, lineCount, scale.itemCount);
    return {
      ...operation,
      districtId,
      customerId: randomInteger(rng, ONE, scale.customersPerDistrict),
      lines: itemIds.map((itemId) => ({
        itemId,
        quantity: randomInteger(rng, ONE, 10),
        supplyWarehouseId: chooseRemoteWarehouse(
          rng,
          operation.warehouseId,
          scale.warehouseCount,
          0.01,
        ),
      })),
    };
  }

  if (kind === OPERATION_KIND.PAYMENT) {
    const customerWarehouseId = chooseRemoteWarehouse(
      rng,
      operation.warehouseId,
      scale.warehouseCount,
      0.15,
    );
    return {
      ...operation,
      districtId,
      customerWarehouseId,
      customerDistrictId: customerWarehouseId === operation.warehouseId ?
        districtId :
        randomInteger(rng, ONE, scale.districtsPerWarehouse),
      customerId: randomInteger(rng, ONE, scale.customersPerDistrict),
      amountCents: randomInteger(rng, 100, 500000),
    };
  }

  if (kind === OPERATION_KIND.ORDER_STATUS) {
    return {
      ...operation,
      districtId,
      customerId: randomInteger(rng, ONE, scale.customersPerDistrict),
    };
  }

  if (kind === OPERATION_KIND.DELIVERY) {
    return {
      ...operation,
      carrierId: randomInteger(rng, ONE, 10),
    };
  }

  return {
    ...operation,
    districtId,
    threshold: randomInteger(rng, 10, 20),
  };
}

function buildWorkerPlan(config, workerIndex, phase, count) {
  const rng = createSeededRng(deriveSeed(config.seed, workerIndex, phase));
  const kinds = buildOperationKinds(count, rng);
  return kinds.map((kind, sequence) => generateOperation(kind, {
    rng,
    scale: config.scale,
    phase,
    workerIndex,
    sequence,
  }));
}

function buildOltpBaselinePlan(rawOptions = {}) {
  const config = resolveOltpBaselineConfig(rawOptions);
  const workers = Array.from({length: config.workers}, (_unused, workerIndex) => ({
    workerId: workerIndex + ONE,
    warmup: buildWorkerPlan(
      config,
      workerIndex,
      'warmup',
      config.warmupOperationsPerWorker,
    ),
    measurement: buildWorkerPlan(
      config,
      workerIndex,
      'measurement',
      config.measurementOperationsPerWorker,
    ),
  }));
  return {config, workers};
}

function hashMeasurementPlan(plan) {
  const measurement = plan.workers.map((worker) => worker.measurement);
  return createHash('sha256')
    .update(JSON.stringify(measurement))
    .digest('hex');
}

function nearestRank(sortedValues, percentile) {
  if (sortedValues.length === ZERO) return ZERO;
  const rank = Math.ceil((percentile / HUNDRED) * sortedValues.length);
  return sortedValues[Math.max(ZERO, rank - ONE)];
}

function summarizeLatencies(values) {
  if (values.length === ZERO) {
    return {
      count: ZERO,
      avg: ZERO,
      p50: ZERO,
      p95: ZERO,
      p99: ZERO,
      min: ZERO,
      max: ZERO,
    };
  }
  const sorted = [...values].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, ZERO);
  return {
    count: sorted.length,
    avg: total / sorted.length,
    p50: nearestRank(sorted, 50),
    p95: nearestRank(sorted, 95),
    p99: nearestRank(sorted, 99),
    min: sorted[ZERO],
    max: sorted[sorted.length - ONE],
  };
}

function emptyKindMetrics() {
  return {
    attempted: ZERO,
    succeeded: ZERO,
    failed: ZERO,
    latencies: [],
    errorSamples: [],
  };
}

function createMetricsAccumulator() {
  return Object.fromEntries(
    OPERATION_KINDS.map((kind) => [kind, emptyKindMetrics()]),
  );
}

function errorSample(error, operation) {
  return {
    kind: operation.kind,
    phase: operation.phase,
    workerId: operation.workerId,
    sequence: operation.sequence,
    warehouseId: operation.warehouseId,
    code: typeof error?.code === 'string' ? error.code : null,
    errno: Number.isFinite(error?.errno) ? Number(error.errno) : null,
    sqlState: typeof error?.sqlState === 'string' ? error.sqlState : null,
    message: String(error?.message || error),
  };
}

function appendErrorSample(kindMetrics, error, operation) {
  if (kindMetrics.errorSamples.length >= MAX_ERROR_SAMPLES_PER_KIND) return;
  kindMetrics.errorSamples.push(errorSample(error, operation));
}

async function executeWorker(adapter, operations, metrics, now) {
  for (const operation of operations) {
    const kindMetrics = metrics[operation.kind];
    kindMetrics.attempted += ONE;
    const started = now();
    try {
      await adapter.executeTransaction(operation);
      kindMetrics.succeeded += ONE;
      kindMetrics.latencies.push(Math.max(ZERO, now() - started));
    } catch (error) {
      kindMetrics.failed += ONE;
      appendErrorSample(kindMetrics, error, operation);
    }
  }
}

function totalField(metrics, field) {
  return OPERATION_KINDS.reduce(
    (sum, kind) => sum + metrics[kind][field],
    ZERO,
  );
}

function flattenSuccessfulLatencies(metrics) {
  return OPERATION_KINDS.flatMap((kind) => metrics[kind].latencies);
}

function collectErrorSamples(metrics) {
  return OPERATION_KINDS.flatMap((kind) => metrics[kind].errorSamples);
}

function publicOperationMetrics(metrics) {
  return Object.fromEntries(OPERATION_KINDS.map((kind) => [kind, {
    attempted: metrics[kind].attempted,
    succeeded: metrics[kind].succeeded,
    failed: metrics[kind].failed,
    latency: summarizeLatencies(metrics[kind].latencies),
    errorSamples: [...metrics[kind].errorSamples],
  }]));
}

async function runPhase(adapter, workerPlans, now) {
  const metrics = createMetricsAccumulator();
  const started = now();
  await Promise.all(workerPlans.map((operations) =>
    executeWorker(adapter, operations, metrics, now)));
  const elapsedMs = Math.max(ZERO, now() - started);
  return {metrics, elapsedMs};
}

async function runOltpBaselineWorkload(adapter, rawOptions = {}) {
  if (!adapter || typeof adapter.executeTransaction !== 'function') {
    throw new Error(
      'OLTP baseline workload requires adapter.executeTransaction(operation)',
    );
  }
  const plan = buildOltpBaselinePlan(rawOptions);
  const now = typeof rawOptions.now === 'function' ?
    rawOptions.now :
    () => performance.now();

  const warmup = await runPhase(
    adapter,
    plan.workers.map((worker) => worker.warmup),
    now,
  );
  const warmupFailed = totalField(warmup.metrics, 'failed');
  const warmupErrorSamples = collectErrorSamples(warmup.metrics);
  if (warmupFailed > ZERO) {
    throw new Error(
      `OLTP baseline warmup failed ${warmupFailed} transaction(s); ` +
      `samples=${JSON.stringify(warmupErrorSamples)}`,
    );
  }

  const measured = await runPhase(
    adapter,
    plan.workers.map((worker) => worker.measurement),
    now,
  );
  const attempted = totalField(measured.metrics, 'attempted');
  const succeeded = totalField(measured.metrics, 'succeeded');
  const failed = totalField(measured.metrics, 'failed');
  const seconds = measured.elapsedMs / 1000;
  const latencies = flattenSuccessfulLatencies(measured.metrics);

  return {
    workload: WORKLOAD_NAME,
    seed: plan.config.seed,
    workers: plan.config.workers,
    scale: plan.config.scale,
    operationMix: OPERATION_MIX,
    measurementPlanSha256: hashMeasurementPlan(plan),
    warmup: {
      attempted: totalField(warmup.metrics, 'attempted'),
      succeeded: totalField(warmup.metrics, 'succeeded'),
      failed: warmupFailed,
      errorSamples: warmupErrorSamples,
    },
    measurement: {
      attempted,
      succeeded,
      failed,
      elapsedMs: measured.elapsedMs,
      errorSamples: collectErrorSamples(measured.metrics),
    },
    opsPerSec: seconds > ZERO ? succeeded / seconds : ZERO,
    latency: summarizeLatencies(latencies),
    operations: publicOperationMetrics(measured.metrics),
  };
}

export {
  DEFAULTS as OLTP_BASELINE_DEFAULTS,
  OPERATION_KIND as OLTP_OPERATION_KIND,
  OPERATION_MIX as OLTP_OPERATION_MIX,
  WORKLOAD_NAME as OLTP_BASELINE_WORKLOAD_NAME,
  buildOltpBaselinePlan,
  hashMeasurementPlan as hashOltpBaselineMeasurementPlan,
  resolveOltpBaselineConfig,
  runOltpBaselineWorkload,
  summarizeLatencies as summarizeOltpBaselineLatencies,
};
