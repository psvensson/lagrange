import {
  digestBenchmarkSemanticData,
} from '../benchmark-semantic-integrity.js';
import {
  BENCHMARK_CAPACITY_ARTIFACT_POLICY,
  BENCHMARK_CAPACITY_CACHE_POLICY,
  BENCHMARK_CAPACITY_ESTIMATOR,
  BENCHMARK_CAPACITY_INTERVAL,
  BENCHMARK_CAPACITY_LIVE_EVIDENCE_CLASS,
  BENCHMARK_CAPACITY_MULTIPLE_COMPARISON,
  BENCHMARK_CAPACITY_OPERATION_LOG_ISSUER,
  BENCHMARK_CAPACITY_OPERATION_LOG_VERSION,
  BENCHMARK_CAPACITY_PHASE,
  BENCHMARK_CAPACITY_RANDOMIZATION_ALGORITHM,
  BENCHMARK_CAPACITY_REJECT_POLICY,
  BENCHMARK_CAPACITY_RUN_ORDER_POLICY,
  BENCHMARK_CAPACITY_STOPPING_RULE,
  BENCHMARK_CAPACITY_TIMEOUT_POLICY,
} from '../benchmark-capacity-protocol-constants.js';
import {
  createBenchmarkCapacityRunSample,
} from '../benchmark-capacity-run-sample.js';
import {
  runBenchmarkCapacityProtocol,
} from '../benchmark-capacity-protocol.js';
import {
  getBenchmarkCapacitySamplingWindow,
} from '../benchmark-capacity-preregistration.js';
import {
  createBenchmarkCapacityWindowReceipt,
} from '../benchmark-capacity-window-receipt.js';
import {
  createBenchmarkCapacityCacheResetReceipt,
} from '../benchmark-capacity-cache-reset-receipt.js';
import {
  createBenchmarkCapacityLiveResetEngagement,
  createBenchmarkCapacityLiveWindowEngagement,
} from '../benchmark-capacity-raw-artifact.js';
import {
  BENCHMARK_SQL_DIALECT,
  buildBenchmarkResultSetEvidence,
  buildBenchmarkSemanticReceipt,
  getBenchmarkSemanticContract,
} from '../benchmark-workload-semantics.js';
import {
  FIXTURE_BLOCK_MAXIMUM,
  FIXTURE_BLOCK_MINIMUM,
  FIXTURE_BOOTSTRAP_RESAMPLES,
  FIXTURE_CELL_ID,
  FIXTURE_CI_WIDTH,
  FIXTURE_CONFIDENCE,
  FIXTURE_CONTAINER_LOG,
  FIXTURE_DURABILITY_STATUS,
  FIXTURE_ERROR_SLO,
  FIXTURE_FINAL_ROW_COUNT,
  FIXTURE_FINAL_ROW_COUNT_TEXT,
  FIXTURE_FINALIZER_TIMEOUT_MS,
  FIXTURE_LAGRANGE_CAPACITY,
  FIXTURE_LAGRANGE_FAST_LATENCY_MS,
  FIXTURE_LAGRANGE_SLOW_LATENCY_MS,
  FIXTURE_LIVE_ENVIRONMENT,
  FIXTURE_LIVE_EVIDENCE_VERSION,
  FIXTURE_LOADS,
  FIXTURE_MATRIX_ID,
  FIXTURE_MAX_IN_FLIGHT,
  FIXTURE_MAX_QUEUE_DEPTH,
  FIXTURE_MEASURED_MS,
  FIXTURE_NOT_CLAIM_ELIGIBLE_REASON,
  FIXTURE_OPERATION,
  FIXTURE_OPERATION_OUTCOME,
  FIXTURE_P99_SLO_MS,
  FIXTURE_PAIR_ID,
  FIXTURE_POSTGRESQL_CAPACITY,
  FIXTURE_POSTGRESQL_FAST_LATENCY_MS,
  FIXTURE_POSTGRESQL_SLOW_LATENCY_MS,
  FIXTURE_POSTGRES_VERSION,
  FIXTURE_PRACTICAL_RATIO,
  FIXTURE_PROFILE_ID,
  FIXTURE_QUEUE_DELAY_DELTA_MS,
  FIXTURE_RELEASE_LAG_MS,
  FIXTURE_RESET_COMMAND,
  FIXTURE_RESET_PHASE,
  FIXTURE_RESET_SQL,
  FIXTURE_RESET_TIME_MULTIPLIER,
  FIXTURE_RESET_TIMEOUT_MS,
  FIXTURE_RUN_ID,
  FIXTURE_SEED,
  FIXTURE_STUDY_ID,
  FIXTURE_TAIL_MINIMUM,
  FIXTURE_TAIL_QUANTILE,
  FIXTURE_TIMEOUT_MS,
  FIXTURE_WALL_BLOCK_MULTIPLIER,
  FIXTURE_WALL_LOAD_MULTIPLIER,
  FIXTURE_WALL_ORDER_MULTIPLIER,
  FIXTURE_WALL_TIME_BASE,
  FIXTURE_WARMUP_MS,
  FIXTURE_WINDOW_SQL_PREFIX,
  FIXTURE_WINDOW_TIME_MULTIPLIER,
  MILLISECONDS_PER_SECOND,
  SIDE_LAGRANGE,
  SIDE_POSTGRESQL,
} from './benchmark-capacity-protocol-test-fixture-constants.js';

export {
  FIXTURE_BLOCK_MAXIMUM,
  FIXTURE_BLOCK_MINIMUM,
  FIXTURE_FINALIZER_TIMEOUT_MS,
  FIXTURE_LIVE_ENVIRONMENT,
  FIXTURE_LOADS,
  FIXTURE_MAX_IN_FLIGHT,
  FIXTURE_MAX_QUEUE_DEPTH,
  FIXTURE_RELEASE_LAG_MS,
  FIXTURE_SEED,
  FIXTURE_TIMEOUT_MS,
  SIDE_LAGRANGE,
  SIDE_POSTGRESQL,
} from './benchmark-capacity-protocol-test-fixture-constants.js';

function semanticDialectForSide(sideId) {
  return sideId === SIDE_POSTGRESQL ?
    BENCHMARK_SQL_DIALECT.POSTGRESQL :
    BENCHMARK_SQL_DIALECT.SQLITE;
}

export function semanticReceiptForCounts(
  dialect,
  counts,
  rejectedByReason,
) {
  if (counts.correct === 0) return null;
  const observations = [];
  for (let index = 0; index < counts.correct; index += 1) {
    observations.push({
      operationId: index,
      operation: FIXTURE_OPERATION,
      outcome: FIXTURE_OPERATION_OUTCOME,
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
      status: FIXTURE_DURABILITY_STATUS,
      expected: counts.correct,
      observed: counts.correct,
      missingIds: [],
      reason: null,
    },
  });
}

function copyOfferedLoads(overrides) {
  const offeredLoadSource = overrides.offeredLoadPerSecond ?? FIXTURE_LOADS;
  const offeredLoadPerSecond = [];
  for (let index = 0; index < offeredLoadSource.length; index += 1) {
    offeredLoadPerSecond[index] = offeredLoadSource[index];
  }
  return offeredLoadPerSecond;
}

function buildSideSemanticContracts() {
  return [
    {
      sideId: SIDE_LAGRANGE,
      dialect: BENCHMARK_SQL_DIALECT.SQLITE,
      contractDigest: getBenchmarkSemanticContract(
        BENCHMARK_SQL_DIALECT.SQLITE,
      ).contractDigest,
    },
    {
      sideId: SIDE_POSTGRESQL,
      dialect: BENCHMARK_SQL_DIALECT.POSTGRESQL,
      contractDigest: getBenchmarkSemanticContract(
        BENCHMARK_SQL_DIALECT.POSTGRESQL,
      ).contractDigest,
    },
  ];
}

function buildSamplingWindows(offeredLoadPerSecond) {
  const windows = [];
  for (let index = 0; index < offeredLoadPerSecond.length; index += 1) {
    windows[index] = {
      offeredLoadPerSecond: offeredLoadPerSecond[index],
      warmupMs: FIXTURE_WARMUP_MS,
      measuredMs: FIXTURE_MEASURED_MS,
    };
  }
  return windows;
}

function fixtureIdentityFields() {
  return {
    sideIds: [SIDE_LAGRANGE, SIDE_POSTGRESQL],
    sideSemanticContracts: buildSideSemanticContracts(),
  };
}

function fixturePolicyFields() {
  return {
    cachePolicy: BENCHMARK_CAPACITY_CACHE_POLICY,
    runOrderPolicy: BENCHMARK_CAPACITY_RUN_ORDER_POLICY,
    timeoutPolicy: BENCHMARK_CAPACITY_TIMEOUT_POLICY,
    rejectPolicy: BENCHMARK_CAPACITY_REJECT_POLICY,
    artifactPolicy: BENCHMARK_CAPACITY_ARTIFACT_POLICY,
  };
}

export function preregistrationInput(overrides = {}) {
  const offeredLoadPerSecond = copyOfferedLoads(overrides);
  return {
    studyId: FIXTURE_STUDY_ID,
    ...fixtureIdentityFields(),
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
      windows: buildSamplingWindows(offeredLoadPerSecond),
      operationTimeoutMs: FIXTURE_TIMEOUT_MS,
      semanticFinalizerTimeoutMs: FIXTURE_FINALIZER_TIMEOUT_MS,
      resetTimeoutMs: FIXTURE_RESET_TIMEOUT_MS,
      maxReleaseLagMs: FIXTURE_RELEASE_LAG_MS,
      clientMaxInFlight: FIXTURE_MAX_IN_FLIGHT,
      clientMaxQueueDepth: FIXTURE_MAX_QUEUE_DEPTH,
    },
    ...fixturePolicyFields(),
    randomization: {
      algorithm: BENCHMARK_CAPACITY_RANDOMIZATION_ALGORITHM,
      seed: FIXTURE_SEED,
    },
    executionIdentity: {
      matrixId: FIXTURE_MATRIX_ID,
      cellId: FIXTURE_CELL_ID,
      cellManifestDigest: digestBenchmarkSemanticData({
        cell: FIXTURE_CELL_ID,
      }),
      profileIdentity: digestBenchmarkSemanticData({
        profile: FIXTURE_PROFILE_ID,
      }),
      pairIdentity: digestBenchmarkSemanticData({pair: FIXTURE_PAIR_ID}),
      runId: FIXTURE_RUN_ID,
      liveEnvironmentContractDigest:
        digestBenchmarkSemanticData(FIXTURE_LIVE_ENVIRONMENT),
    },
    ...overrides,
    offeredLoadPerSecond,
  };
}

export function releaseOffsets(offeredLoadPerSecond, windowDurationMs) {
  const count = Math.floor(
    offeredLoadPerSecond * windowDurationMs / MILLISECONDS_PER_SECOND,
  );
  const offsets = [];
  for (let index = 0; index < count; index += 1) {
    offsets.push(Math.floor(
      index * MILLISECONDS_PER_SECOND / offeredLoadPerSecond,
    ));
  }
  return offsets;
}

export function repeated(value, count) {
  const values = [];
  for (let index = 0; index < count; index += 1) {
    values.push(value);
  }
  return values;
}

export function successfulRunSample({
  sideId,
  phase,
  blockIndex,
  offeredLoadPerSecond,
  windowDurationMs,
  p99LatencyMs,
  correct = null,
  preregistration,
}) {
  const offered = Math.floor(
    offeredLoadPerSecond * windowDurationMs / MILLISECONDS_PER_SECOND,
  );
  const correctCount = correct === null ? offered : correct;
  const errored = offered - correctCount;
  const counts = {
    offered,
    dispatched: offered,
    correct: correctCount,
    rejected: 0,
    timedOut: 0,
    errored,
    queueOverflow: 0,
    undispatched: 0,
    cancelled: 0,
  };
  const rejectedByReason = {queueFull: 0, flowControl: 0, admission: 0};
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
    endToEndLatencyMs: repeated(p99LatencyMs, correctCount),
    clientQueueDelayMs: repeated(
      Math.max(0, p99LatencyMs - FIXTURE_QUEUE_DELAY_DELTA_MS),
      offered,
    ),
    releaseOffsetsMs: releaseOffsets(
      offeredLoadPerSecond,
      windowDurationMs,
    ),
    releaseLagMs: repeated(0, offered),
    unreleasedOperations: 0,
    semanticDialect,
    semanticReceipt: semanticReceiptForCounts(
      semanticDialect,
      counts,
      rejectedByReason,
    ),
  });
}

export function inputFromSample(sample, overrides = {}) {
  const input = structuredClone(sample);
  const derivedKeys = [
    'version',
    'scheduleMode',
    'queueingIncluded',
    'observationDurationMs',
    'semanticReceiptDigest',
    'correctThroughputPerSecond',
    'errorRate',
    'sampleDigest',
  ];
  for (let index = 0; index < derivedKeys.length; index += 1) {
    delete input[derivedKeys[index]];
  }
  return {...input, ...overrides};
}

function fixtureLatency(sideId, offeredLoadPerSecond) {
  if (sideId === SIDE_LAGRANGE) {
    return offeredLoadPerSecond <= FIXTURE_LAGRANGE_CAPACITY ?
      FIXTURE_LAGRANGE_FAST_LATENCY_MS :
      FIXTURE_LAGRANGE_SLOW_LATENCY_MS;
  }
  return offeredLoadPerSecond <= FIXTURE_POSTGRESQL_CAPACITY ?
    FIXTURE_POSTGRESQL_FAST_LATENCY_MS :
    FIXTURE_POSTGRESQL_SLOW_LATENCY_MS;
}

export function fixtureWindowReceipt(sample, context) {
  return createBenchmarkCapacityWindowReceipt({
    blockIndex: context.blockIndex,
    blockedOrderIndex: context.blockedOrderIndex,
    sideId: context.sideId,
    phase: sample.phase,
    offeredLoad: context.offeredLoadPerSecond,
    startedAt: context.blockIndex * FIXTURE_WINDOW_TIME_MULTIPLIER,
    endedAt:
      context.blockIndex * FIXTURE_WINDOW_TIME_MULTIPLIER +
      sample.windowDurationMs,
    capacitySampleDigest: sample.sampleDigest,
    semanticReceiptDigest: sample.semanticReceiptDigest,
    liveEngagementDigest: digestBenchmarkSemanticData({
      sampleDigest: sample.sampleDigest,
    }),
    resourceWindowDigest: null,
  }, sample, context.preregistration);
}

export function fixtureResetReceipt(context) {
  return createBenchmarkCapacityCacheResetReceipt({
    blockIndex: context.blockIndex,
    blockedOrderIndex: context.blockedOrderIndex,
    sideId: context.sideId,
    offeredLoad: context.offeredLoadPerSecond,
    startedAt: context.blockIndex * FIXTURE_RESET_TIME_MULTIPLIER + 1,
    endedAt: context.blockIndex * FIXTURE_RESET_TIME_MULTIPLIER + 2,
    policy: BENCHMARK_CAPACITY_CACHE_POLICY,
    liveEngagementDigest: digestBenchmarkSemanticData({
      reset: context.offeredLoadPerSecond,
      sideId: context.sideId,
      blockIndex: context.blockIndex,
    }),
  }, context.preregistration);
}

export function fixtureExecutor(preregistration, options = {}) {
  return async (context) => {
    const {
      sideId,
      blockIndex,
      offeredLoadPerSecond,
    } = context;
    const p99LatencyMs = fixtureLatency(sideId, offeredLoadPerSecond);
    const samplingWindow = getBenchmarkCapacitySamplingWindow(
      preregistration,
      offeredLoadPerSecond,
    );
    const measuredCorrect = options.tailInsufficient === true ?
      Math.min(
        preregistration.sampling.tailSampleMinimum - 1,
        offeredLoadPerSecond,
      ) :
      null;
    const warmup = successfulRunSample({
      sideId,
      phase: BENCHMARK_CAPACITY_PHASE.WARMUP,
      blockIndex,
      offeredLoadPerSecond,
      windowDurationMs: samplingWindow.warmupMs,
      p99LatencyMs,
      preregistration,
    });
    const measured = successfulRunSample({
      sideId,
      phase: BENCHMARK_CAPACITY_PHASE.MEASURED,
      blockIndex,
      offeredLoadPerSecond,
      windowDurationMs: samplingWindow.measuredMs,
      p99LatencyMs,
      correct: measuredCorrect,
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

function fixtureWallStart(context, phaseOffset) {
  return FIXTURE_WALL_TIME_BASE +
    context.blockIndex * FIXTURE_WALL_BLOCK_MULTIPLIER +
    context.offeredLoadPerSecond * FIXTURE_WALL_LOAD_MULTIPLIER +
    context.blockedOrderIndex * FIXTURE_WALL_ORDER_MULTIPLIER +
    phaseOffset;
}

function fixtureWindowLog(
  context,
  phase,
  correctCount,
  evidenceClass =
  BENCHMARK_CAPACITY_LIVE_EVIDENCE_CLASS.SYNTHETIC_FIXTURE,
) {
  const entries = [];
  const externallyObserved = evidenceClass ===
    BENCHMARK_CAPACITY_LIVE_EVIDENCE_CLASS.EXTERNALLY_OBSERVED;
  const prefix = `${context.preregistration.executionIdentity.runId}-` +
    `${context.sideId}-${context.blockIndex}-` +
    `${context.blockedOrderIndex}-${context.offeredLoadPerSecond}-` +
    `${phase}-`;
  for (let operationIndex = 0;
    operationIndex < correctCount;
    operationIndex += 1) {
    entries.push({
      operationIndex,
      sql: externallyObserved ?
        `INSERT ${prefix}${operationIndex}` :
        `${FIXTURE_WINDOW_SQL_PREFIX} ${operationIndex}`,
      command: FIXTURE_OPERATION,
      rowCount: 1,
    });
  }
  return JSON.stringify({
    version: BENCHMARK_CAPACITY_OPERATION_LOG_VERSION,
    issuer: externallyObserved ?
      BENCHMARK_CAPACITY_OPERATION_LOG_ISSUER.MANAGED_POSTGRESQL :
      BENCHMARK_CAPACITY_OPERATION_LOG_ISSUER.SYNTHETIC_FIXTURE,
    blockIndex: context.blockIndex,
    blockedOrderIndex: context.blockedOrderIndex,
    sideId: context.sideId,
    phase,
    offeredLoad: context.offeredLoadPerSecond,
    entries,
  });
}

function fixtureResetOperationLog(context) {
  return JSON.stringify({
    version: BENCHMARK_CAPACITY_OPERATION_LOG_VERSION,
    issuer: BENCHMARK_CAPACITY_OPERATION_LOG_ISSUER.SYNTHETIC_FIXTURE,
    blockIndex: context.blockIndex,
    blockedOrderIndex: context.blockedOrderIndex,
    sideId: context.sideId,
    phase: FIXTURE_RESET_PHASE,
    offeredLoad: context.offeredLoadPerSecond,
    sql: FIXTURE_RESET_SQL,
    command: FIXTURE_RESET_COMMAND,
    rowCount: null,
  });
}

function fixtureResetOwner(preregistration, resetEngagements) {
  return (context) => {
    const startedAt = fixtureWallStart(context, 1);
    const engagement = createBenchmarkCapacityLiveResetEngagement(
      {
        blockIndex: context.blockIndex,
        blockedOrderIndex: context.blockedOrderIndex,
        sideId: context.sideId,
        offeredLoad: context.offeredLoadPerSecond,
        startedAt,
        endedAt: startedAt + 1,
        operationLogText: fixtureResetOperationLog(context),
      },
      preregistration,
    );
    resetEngagements.push(engagement);
    return createBenchmarkCapacityCacheResetReceipt(
      {
        blockIndex: context.blockIndex,
        blockedOrderIndex: context.blockedOrderIndex,
        sideId: context.sideId,
        offeredLoad: context.offeredLoadPerSecond,
        startedAt,
        endedAt: startedAt + 1,
        policy: preregistration.cachePolicy,
        liveEngagementDigest: engagement.liveEngagementDigest,
      },
      preregistration,
    );
  };
}

function fixtureRunOwner(preregistration, windowEngagements) {
  return async (context) => {
    const samples = [];
    const receipts = [];
    const phases = [
      BENCHMARK_CAPACITY_PHASE.WARMUP,
      BENCHMARK_CAPACITY_PHASE.MEASURED,
    ];
    const samplingWindow = getBenchmarkCapacitySamplingWindow(
      preregistration,
      context.offeredLoadPerSecond,
    );
    for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex += 1) {
      const phase = phases[phaseIndex];
      const duration = phase === BENCHMARK_CAPACITY_PHASE.WARMUP ?
        samplingWindow.warmupMs :
        samplingWindow.measuredMs;
      const sample = successfulRunSample({
        sideId: context.sideId,
        phase,
        blockIndex: context.blockIndex,
        offeredLoadPerSecond: context.offeredLoadPerSecond,
        windowDurationMs: duration,
        p99LatencyMs: fixtureLatency(
          context.sideId,
          context.offeredLoadPerSecond,
        ),
        preregistration,
      });
      const startedAt = fixtureWallStart(context, 2 + phaseIndex);
      const engagement = createBenchmarkCapacityLiveWindowEngagement(
        {
          blockIndex: context.blockIndex,
          blockedOrderIndex: context.blockedOrderIndex,
          sideId: context.sideId,
          phase,
          offeredLoad: context.offeredLoadPerSecond,
          startedAt,
          endedAt: startedAt + sample.observationDurationMs,
          operationLogText: fixtureWindowLog(
            context,
            phase,
            sample.counts.correct,
          ),
        },
        sample,
        preregistration,
      );
      windowEngagements.push(engagement);
      samples.push(sample);
      receipts.push(createBenchmarkCapacityWindowReceipt(
        {
          blockIndex: context.blockIndex,
          blockedOrderIndex: context.blockedOrderIndex,
          sideId: context.sideId,
          phase,
          offeredLoad: context.offeredLoadPerSecond,
          startedAt,
          endedAt: startedAt + sample.observationDurationMs,
          capacitySampleDigest: sample.sampleDigest,
          semanticReceiptDigest: sample.semanticReceiptDigest,
          liveEngagementDigest: engagement.liveEngagementDigest,
          resourceWindowDigest: null,
        },
        sample,
        preregistration,
      ));
    }
    return {
      warmup: samples[0],
      measured: samples[1],
      warmupWindowReceipt: receipts[0],
      measuredWindowReceipt: receipts[1],
    };
  };
}

export async function artifactFixtureReport(preregistration) {
  const windowEngagements = [];
  const resetEngagements = [];
  const report = await runBenchmarkCapacityProtocol({
    preregistration,
    resetRunState: fixtureResetOwner(preregistration, resetEngagements),
    executeRun: fixtureRunOwner(preregistration, windowEngagements),
  });
  return {report, windowEngagements, resetEngagements};
}

export function artifactFixtureLiveEvidence(
  preregistration,
  reportAndEngagements,
) {
  const {report, windowEngagements, resetEngagements} =
    reportAndEngagements;
  return {
    version: FIXTURE_LIVE_EVIDENCE_VERSION,
    preregistrationDigest: preregistration.manifestDigest,
    reportDigest: report.reportDigest,
    ...preregistration.executionIdentity,
    liveEnvironmentContract: FIXTURE_LIVE_ENVIRONMENT,
    evidenceClass: BENCHMARK_CAPACITY_LIVE_EVIDENCE_CLASS.SYNTHETIC_FIXTURE,
    provenanceReceipt: null,
    engagementOnly: true,
    comparativeClaimEligible: false,
    reason: FIXTURE_NOT_CLAIM_ELIGIBLE_REASON,
    image: FIXTURE_LIVE_ENVIRONMENT.image,
    imageId: FIXTURE_LIVE_ENVIRONMENT.imageId,
    postgresVersion: FIXTURE_POSTGRES_VERSION,
    observedRowsAfterFinalResetCell: FIXTURE_FINAL_ROW_COUNT,
    finalRowCountQueryText: FIXTURE_FINAL_ROW_COUNT_TEXT,
    queueObserved: true,
    windowEngagements,
    resetEngagements,
    containerLogText: FIXTURE_CONTAINER_LOG,
    cleanupReceipt: null,
    observationReceipt: null,
  };
}
