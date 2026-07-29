import {
  digestBenchmarkSemanticData,
} from '../benchmark-semantic-integrity.js';
import {
  BENCHMARK_CAPACITY_ARTIFACT_POLICY,
  BENCHMARK_CAPACITY_CACHE_POLICY,
  BENCHMARK_CAPACITY_ESTIMATOR,
  BENCHMARK_CAPACITY_INTERVAL,
  BENCHMARK_CAPACITY_MULTIPLE_COMPARISON,
  BENCHMARK_CAPACITY_PHASE,
  BENCHMARK_CAPACITY_RANDOMIZATION_ALGORITHM,
  BENCHMARK_CAPACITY_REJECT_POLICY,
  BENCHMARK_CAPACITY_RUN_ORDER_POLICY,
  BENCHMARK_CAPACITY_STOPPING_RULE,
  BENCHMARK_CAPACITY_TIMEOUT_POLICY,
} from '../benchmark-capacity-protocol-constants.js';
import {
  getBenchmarkCapacitySamplingWindow,
} from '../benchmark-capacity-preregistration.js';
import {
  createBenchmarkCapacityRunSample,
} from '../benchmark-capacity-run-sample.js';
import {
  createBenchmarkCapacityWindowReceipt,
} from '../benchmark-capacity-window-receipt.js';
import {
  createBenchmarkCapacityCacheResetReceipt,
} from '../benchmark-capacity-cache-reset-receipt.js';
import {
  BENCHMARK_SQL_DIALECT,
  buildBenchmarkResultSetEvidence,
  buildBenchmarkSemanticReceipt,
  getBenchmarkSemanticContract,
} from '../benchmark-workload-semantics.js';

const SIDE_POSTGRESQL = 'postgresql';
const SIDE_LAGRANGE = 'lagrange';
const FIXTURE_LOADS = Object.freeze([100, 200, 300]);
const MILLISECONDS_PER_SECOND = 1_000;
const FIXTURE_WINDOW_BASE_MS = 1_000;
const FIXTURE_RESET_BASE_MS = 10_000;
const FIXTURE_MEASURED_MS = 1_000;
const FIXTURE_WARMUP_MS = 100;
const FIXTURE_TIMEOUT_MS = 100;
const FIXTURE_TAIL_MINIMUM = 100;
const FIXTURE_BLOCK_MINIMUM = 3;
const FIXTURE_BLOCK_MAXIMUM = 5;
const FIXTURE_BOOTSTRAP_RESAMPLES = 200;
const FIXTURE_CONFIDENCE = 0.95;
const FIXTURE_PRACTICAL_RATIO = 0.05;
const FIXTURE_CI_WIDTH = 0.1;
const FIXTURE_SEED = 20_260_727;
const FIXTURE_P99_SLO_MS = 50;
const FIXTURE_ERROR_SLO = 0.05;
const FIXTURE_MAX_IN_FLIGHT = 8;
const FIXTURE_MAX_QUEUE_DEPTH = 16;
const FIXTURE_RELEASE_LAG_MS = 100;
const FIXTURE_FINALIZER_TIMEOUT_MS = 100;
const FIXTURE_RESET_TIMEOUT_MS = 100;
const FIXTURE_TAIL_QUANTILE = 0.99;
const FIXTURE_QUEUE_DELAY_DELTA_MS = 4;
const FIXTURE_PASS_LATENCY_MS = 18;
const FIXTURE_FAIL_LATENCY_MS = 70;
const localText = Object.freeze({
  CELL: 'capacity-independent-fixture-cell',
  MATRIX: 'capacity-independent-fixture-matrix',
  PAIR: 'capacity-independent-fixture-pair',
  PROFILE: 'capacity-independent-fixture-profile',
  RUN: 'capacity-independent-fixture-run',
  STUDY: 'capacity-independent-fixture-v1',
  DURABILITY_PASS: 'pass',
  OPERATION: 'INSERT',
  OPERATION_OUTCOME: 'command_acknowledged',
});

export function independentFixtureSidePostgresql() {
  return SIDE_POSTGRESQL;
}

export function independentFixtureLoads() {
  return [...FIXTURE_LOADS];
}

function repeatValue(value, count) {
  const values = [];
  for (let index = 0; index < count; index += 1) {
    values.push(value);
  }
  return values;
}

function releaseOffsets(offeredLoadPerSecond, windowDurationMs) {
  const count = Math.floor(
    offeredLoadPerSecond * windowDurationMs / MILLISECONDS_PER_SECOND,
  );
  const offsets = [];
  for (let index = 0; index < count; index += 1) {
    offsets.push(
      Math.floor(index * MILLISECONDS_PER_SECOND / offeredLoadPerSecond),
    );
  }
  return offsets;
}

function semanticDialectForSide(sideId) {
  return sideId === SIDE_POSTGRESQL ?
    BENCHMARK_SQL_DIALECT.POSTGRESQL :
    BENCHMARK_SQL_DIALECT.SQLITE;
}

function semanticReceiptForCounts(dialect, counts, rejectedByReason) {
  if (counts.correct === 0) return null;
  const observations = [];
  for (let index = 0; index < counts.correct; index += 1) {
    observations.push({
      operationId: index,
      operation: localText.OPERATION,
      outcome: localText.OPERATION_OUTCOME,
    });
  }
  return buildBenchmarkSemanticReceipt({
    dialect,
    compiledOperations: counts.dispatched,
    validatedOperations: counts.correct,
    successfulOperations: counts.correct,
    oracleFailures: 0,
    resultSet: buildBenchmarkResultSetEvidence(observations),
    accounting: {
      ...counts,
      rejectedByReason: {...rejectedByReason},
    },
    durability: {
      status: localText.DURABILITY_PASS,
      expected: counts.correct,
      observed: counts.correct,
      missingIds: [],
      reason: null,
    },
  });
}

function semanticContract(sideId, dialect) {
  return {
    sideId,
    dialect,
    contractDigest:
      getBenchmarkSemanticContract(dialect).contractDigest,
  };
}

function samplingWindows() {
  const windows = [];
  for (let index = 0; index < FIXTURE_LOADS.length; index += 1) {
    windows.push({
      offeredLoadPerSecond: FIXTURE_LOADS[index],
      warmupMs: FIXTURE_WARMUP_MS,
      measuredMs: FIXTURE_MEASURED_MS,
    });
  }
  return windows;
}

function fixtureSemanticRegistration() {
  return {
    sideIds: [SIDE_LAGRANGE, SIDE_POSTGRESQL],
    sideSemanticContracts: [
      semanticContract(SIDE_LAGRANGE, BENCHMARK_SQL_DIALECT.SQLITE),
      semanticContract(
        SIDE_POSTGRESQL,
        BENCHMARK_SQL_DIALECT.POSTGRESQL,
      ),
    ],
  };
}

function fixturePolicyRegistration() {
  return {
    cachePolicy: BENCHMARK_CAPACITY_CACHE_POLICY,
    runOrderPolicy: BENCHMARK_CAPACITY_RUN_ORDER_POLICY,
    timeoutPolicy: BENCHMARK_CAPACITY_TIMEOUT_POLICY,
    rejectPolicy: BENCHMARK_CAPACITY_REJECT_POLICY,
    artifactPolicy: BENCHMARK_CAPACITY_ARTIFACT_POLICY,
  };
}

export function independentPreregistrationInput() {
  return {
    studyId: localText.STUDY,
    ...fixtureSemanticRegistration(),
    offeredLoadPerSecond: [...FIXTURE_LOADS],
    slo: {
      maxP99LatencyMs: FIXTURE_P99_SLO_MS,
      maxErrorRate: FIXTURE_ERROR_SLO,
    },
    repetitions: {
      minimum: FIXTURE_BLOCK_MINIMUM,
      maximum: FIXTURE_BLOCK_MAXIMUM,
    },
    statistics: {
      estimator: BENCHMARK_CAPACITY_ESTIMATOR,
      interval: BENCHMARK_CAPACITY_INTERVAL,
      confidenceLevel: FIXTURE_CONFIDENCE,
      bootstrapResamples: FIXTURE_BOOTSTRAP_RESAMPLES,
      practicalSignificanceRatio: FIXTURE_PRACTICAL_RATIO,
      targetRelativeCiWidth: FIXTURE_CI_WIDTH,
      stoppingRule: BENCHMARK_CAPACITY_STOPPING_RULE,
      multipleComparisonTreatment:
        BENCHMARK_CAPACITY_MULTIPLE_COMPARISON,
    },
    sampling: {
      tailQuantile: FIXTURE_TAIL_QUANTILE,
      tailSampleMinimum: FIXTURE_TAIL_MINIMUM,
      windows: samplingWindows(),
      operationTimeoutMs: FIXTURE_TIMEOUT_MS,
      semanticFinalizerTimeoutMs: FIXTURE_FINALIZER_TIMEOUT_MS,
      resetTimeoutMs: FIXTURE_RESET_TIMEOUT_MS,
      maxReleaseLagMs: FIXTURE_RELEASE_LAG_MS,
      clientMaxInFlight: FIXTURE_MAX_IN_FLIGHT,
      clientMaxQueueDepth: FIXTURE_MAX_QUEUE_DEPTH,
    },
    ...fixturePolicyRegistration(),
    randomization: {
      algorithm: BENCHMARK_CAPACITY_RANDOMIZATION_ALGORITHM,
      seed: FIXTURE_SEED,
    },
    executionIdentity: {
      matrixId: localText.MATRIX,
      cellId: localText.CELL,
      cellManifestDigest: digestBenchmarkSemanticData({
        cell: localText.CELL,
      }),
      profileIdentity: digestBenchmarkSemanticData({
        profile: localText.PROFILE,
      }),
      pairIdentity: digestBenchmarkSemanticData({
        pair: localText.PAIR,
      }),
      runId: localText.RUN,
      liveEnvironmentContractDigest: digestBenchmarkSemanticData({
        environment: localText.RUN,
      }),
    },
  };
}

export function independentSuccessfulRunSample({
  sideId,
  phase,
  blockIndex,
  offeredLoadPerSecond,
  windowDurationMs,
  p99LatencyMs,
  preregistration,
}) {
  const offered = Math.floor(
    offeredLoadPerSecond * windowDurationMs / MILLISECONDS_PER_SECOND,
  );
  const counts = {
    offered,
    dispatched: offered,
    correct: offered,
    rejected: 0,
    timedOut: 0,
    errored: 0,
    queueOverflow: 0,
    undispatched: 0,
    cancelled: 0,
  };
  const rejectedByReason = {
    queueFull: 0,
    flowControl: 0,
    admission: 0,
  };
  const semanticDialect = semanticDialectForSide(sideId);
  return createBenchmarkCapacityRunSample({
    sideId,
    phase,
    blockIndex,
    offeredLoadPerSecond,
    windowDurationMs,
    observationStartedAtMs: 0,
    observationEndedAtMs: windowDurationMs,
    operationTimeoutMs: preregistration.sampling.operationTimeoutMs,
    maxReleaseLagMs: preregistration.sampling.maxReleaseLagMs,
    clientMaxInFlight: preregistration.sampling.clientMaxInFlight,
    clientMaxQueueDepth: preregistration.sampling.clientMaxQueueDepth,
    counts,
    rejectedByReason,
    endToEndLatencyMs: repeatValue(p99LatencyMs, offered),
    clientQueueDelayMs: repeatValue(
      Math.max(0, p99LatencyMs - FIXTURE_QUEUE_DELAY_DELTA_MS),
      offered,
    ),
    releaseOffsetsMs: releaseOffsets(
      offeredLoadPerSecond,
      windowDurationMs,
    ),
    releaseLagMs: repeatValue(0, offered),
    unreleasedOperations: 0,
    semanticDialect,
    semanticReceipt: semanticReceiptForCounts(
      semanticDialect,
      counts,
      rejectedByReason,
    ),
  });
}

function fixtureLatency(offeredLoadPerSecond) {
  return offeredLoadPerSecond <= FIXTURE_LOADS[0] ?
    FIXTURE_PASS_LATENCY_MS :
    FIXTURE_FAIL_LATENCY_MS;
}

function fixtureWindowReceipt(sample, context) {
  return createBenchmarkCapacityWindowReceipt({
    blockIndex: context.blockIndex,
    blockedOrderIndex: context.blockedOrderIndex,
    sideId: context.sideId,
    phase: sample.phase,
    offeredLoad: context.offeredLoadPerSecond,
    startedAt: context.blockIndex * FIXTURE_WINDOW_BASE_MS,
    endedAt:
      context.blockIndex * FIXTURE_WINDOW_BASE_MS +
      sample.windowDurationMs,
    capacitySampleDigest: sample.sampleDigest,
    semanticReceiptDigest: sample.semanticReceiptDigest,
    liveEngagementDigest: digestBenchmarkSemanticData({
      sampleDigest: sample.sampleDigest,
    }),
    resourceWindowDigest: null,
  }, sample, context.preregistration);
}

export function independentFixtureResetReceipt(context) {
  return createBenchmarkCapacityCacheResetReceipt({
    blockIndex: context.blockIndex,
    blockedOrderIndex: context.blockedOrderIndex,
    sideId: context.sideId,
    offeredLoad: context.offeredLoadPerSecond,
    startedAt: context.blockIndex * FIXTURE_RESET_BASE_MS + 1,
    endedAt: context.blockIndex * FIXTURE_RESET_BASE_MS + 2,
    policy: BENCHMARK_CAPACITY_CACHE_POLICY,
    liveEngagementDigest: digestBenchmarkSemanticData({
      reset: context.offeredLoadPerSecond,
      sideId: context.sideId,
      blockIndex: context.blockIndex,
    }),
  }, context.preregistration);
}

export function independentFixtureExecutor(preregistration) {
  return async (context) => {
    const samplingWindow = getBenchmarkCapacitySamplingWindow(
      preregistration,
      context.offeredLoadPerSecond,
    );
    const p99LatencyMs =
      fixtureLatency(context.offeredLoadPerSecond);
    const warmup = independentSuccessfulRunSample({
      sideId: context.sideId,
      phase: BENCHMARK_CAPACITY_PHASE.WARMUP,
      blockIndex: context.blockIndex,
      offeredLoadPerSecond: context.offeredLoadPerSecond,
      windowDurationMs: samplingWindow.warmupMs,
      p99LatencyMs,
      preregistration,
    });
    const measured = independentSuccessfulRunSample({
      sideId: context.sideId,
      phase: BENCHMARK_CAPACITY_PHASE.MEASURED,
      blockIndex: context.blockIndex,
      offeredLoadPerSecond: context.offeredLoadPerSecond,
      windowDurationMs: samplingWindow.measuredMs,
      p99LatencyMs,
      preregistration,
    });
    return {
      warmup,
      measured,
      warmupWindowReceipt: fixtureWindowReceipt(warmup, context),
      measuredWindowReceipt: fixtureWindowReceipt(measured, context),
    };
  };
}
