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

export const SIDE_LAGRANGE = 'lagrange';
export const SIDE_POSTGRESQL = 'postgresql';
export const FIXTURE_LOADS = [100, 200, 300];
const FIXTURE_MEASURED_MS = 1000;
const FIXTURE_WARMUP_MS = 100;
export const FIXTURE_TIMEOUT_MS = 100;
const FIXTURE_TAIL_MINIMUM = 100;
export const FIXTURE_BLOCK_MINIMUM = 3;
export const FIXTURE_BLOCK_MAXIMUM = 5;
const FIXTURE_BOOTSTRAP_RESAMPLES = 200;
const FIXTURE_CONFIDENCE = 0.95;
const FIXTURE_PRACTICAL_RATIO = 0.05;
const FIXTURE_CI_WIDTH = 0.1;
export const FIXTURE_SEED = 20260727;
const FIXTURE_P99_SLO_MS = 50;
const FIXTURE_ERROR_SLO = 0.05;
export const FIXTURE_MAX_IN_FLIGHT = 8;
export const FIXTURE_MAX_QUEUE_DEPTH = 16;
export const FIXTURE_RELEASE_LAG_MS = 100;
export const FIXTURE_FINALIZER_TIMEOUT_MS = 100;
const FIXTURE_RESET_TIMEOUT_MS = 100;
export const FIXTURE_LIVE_ENVIRONMENT = {
  image: 'fixture-postgresql:1',
  imageId: 'fixture-image-id',
  transport: 'fixture-persistent-pool',
  database: 'fixture',
};

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
      operation: 'INSERT',
      outcome: 'command_acknowledged',
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
      status: 'pass',
      expected: counts.correct,
      observed: counts.correct,
      missingIds: [],
      reason: null,
    },
  });
}

export function preregistrationInput(overrides = {}) {
  const sideSemanticContracts = [
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
  return {
    studyId: 'capacity-fixture-v1',
    sideIds: [SIDE_LAGRANGE, SIDE_POSTGRESQL],
    sideSemanticContracts,
    offeredLoadPerSecond: FIXTURE_LOADS,
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
      tailQuantile: 0.99,
      tailSampleMinimum: FIXTURE_TAIL_MINIMUM,
      warmupMs: FIXTURE_WARMUP_MS,
      measuredMs: FIXTURE_MEASURED_MS,
      operationTimeoutMs: FIXTURE_TIMEOUT_MS,
      semanticFinalizerTimeoutMs: FIXTURE_FINALIZER_TIMEOUT_MS,
      resetTimeoutMs: FIXTURE_RESET_TIMEOUT_MS,
      maxReleaseLagMs: FIXTURE_RELEASE_LAG_MS,
      clientMaxInFlight: FIXTURE_MAX_IN_FLIGHT,
      clientMaxQueueDepth: FIXTURE_MAX_QUEUE_DEPTH,
    },
    cachePolicy: BENCHMARK_CAPACITY_CACHE_POLICY,
    runOrderPolicy: BENCHMARK_CAPACITY_RUN_ORDER_POLICY,
    timeoutPolicy: BENCHMARK_CAPACITY_TIMEOUT_POLICY,
    rejectPolicy: BENCHMARK_CAPACITY_REJECT_POLICY,
    artifactPolicy: BENCHMARK_CAPACITY_ARTIFACT_POLICY,
    randomization: {
      algorithm: BENCHMARK_CAPACITY_RANDOMIZATION_ALGORITHM,
      seed: FIXTURE_SEED,
    },
    executionIdentity: {
      matrixId: 'capacity-fixture-matrix',
      cellId: 'capacity-fixture-stable-workload-cell',
      cellManifestDigest: digestBenchmarkSemanticData({
        cell: 'capacity-fixture-stable-workload-cell',
      }),
      profileIdentity: digestBenchmarkSemanticData({profile: 'fixture'}),
      pairIdentity: digestBenchmarkSemanticData({pair: 'fixture'}),
      runId: 'capacity-fixture-run',
      liveEnvironmentContractDigest:
        digestBenchmarkSemanticData(FIXTURE_LIVE_ENVIRONMENT),
    },
    ...overrides,
  };
}

export function releaseOffsets(offeredLoadPerSecond, windowDurationMs) {
  const count = Math.floor(
    offeredLoadPerSecond * windowDurationMs / 1000,
  );
  const offsets = [];
  for (let index = 0; index < count; index += 1) {
    offsets.push(Math.floor(index * 1000 / offeredLoadPerSecond));
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
    offeredLoadPerSecond * windowDurationMs / 1000,
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
    clientQueueDelayMs: repeated(Math.max(0, p99LatencyMs - 4), correctCount),
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
    return offeredLoadPerSecond <= 200 ? 20 : 80;
  }
  return offeredLoadPerSecond <= 100 ? 18 : 70;
}

export function fixtureWindowReceipt(sample, context) {
  return createBenchmarkCapacityWindowReceipt({
    blockIndex: context.blockIndex,
    blockedOrderIndex: context.blockedOrderIndex,
    sideId: context.sideId,
    phase: sample.phase,
    offeredLoad: context.offeredLoadPerSecond,
    startedAt: context.blockIndex * 1000,
    endedAt: context.blockIndex * 1000 + sample.windowDurationMs,
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
    startedAt: context.blockIndex * 10000 + 1,
    endedAt: context.blockIndex * 10000 + 2,
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
      windowDurationMs: preregistration.sampling.warmupMs,
      p99LatencyMs,
      preregistration,
    });
    const measured = successfulRunSample({
      sideId,
      phase: BENCHMARK_CAPACITY_PHASE.MEASURED,
      blockIndex,
      offeredLoadPerSecond,
      windowDurationMs: preregistration.sampling.measuredMs,
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
  return 1_000_000 +
    context.blockIndex * 100_000 +
    context.offeredLoadPerSecond * 100 +
    context.blockedOrderIndex * 10 +
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
        `fixture INSERT ${operationIndex}`,
      command: 'INSERT',
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

export async function artifactFixtureReport(preregistration) {
  const windowEngagements = [];
  const resetEngagements = [];
  const report = await runBenchmarkCapacityProtocol({
    preregistration,
    resetRunState(context) {
      const startedAt = fixtureWallStart(context, 1);
      const engagement = createBenchmarkCapacityLiveResetEngagement(
        {
          blockIndex: context.blockIndex,
          blockedOrderIndex: context.blockedOrderIndex,
          sideId: context.sideId,
          offeredLoad: context.offeredLoadPerSecond,
          startedAt,
          endedAt: startedAt + 1,
          operationLogText: JSON.stringify({
            version: BENCHMARK_CAPACITY_OPERATION_LOG_VERSION,
            issuer:
              BENCHMARK_CAPACITY_OPERATION_LOG_ISSUER.SYNTHETIC_FIXTURE,
            blockIndex: context.blockIndex,
            blockedOrderIndex: context.blockedOrderIndex,
            sideId: context.sideId,
            phase: 'reset',
            offeredLoad: context.offeredLoadPerSecond,
            sql: 'fixture TRUNCATE',
            command: 'TRUNCATE',
            rowCount: null,
          }),
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
    },
    async executeRun(context) {
      const samples = [];
      const receipts = [];
      const phases = [
        BENCHMARK_CAPACITY_PHASE.WARMUP,
        BENCHMARK_CAPACITY_PHASE.MEASURED,
      ];
      for (let phaseIndex = 0; phaseIndex < phases.length; phaseIndex += 1) {
        const phase = phases[phaseIndex];
        const duration = phase === BENCHMARK_CAPACITY_PHASE.WARMUP ?
          preregistration.sampling.warmupMs :
          preregistration.sampling.measuredMs;
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
    },
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
    version: 'benchmark-capacity-live-evidence-v1',
    preregistrationDigest: preregistration.manifestDigest,
    reportDigest: report.reportDigest,
    ...preregistration.executionIdentity,
    liveEnvironmentContract: FIXTURE_LIVE_ENVIRONMENT,
    evidenceClass: BENCHMARK_CAPACITY_LIVE_EVIDENCE_CLASS.SYNTHETIC_FIXTURE,
    provenanceReceipt: null,
    engagementOnly: true,
    comparativeClaimEligible: false,
    reason: 'synthetic_fixture_not_claim_eligible',
    image: FIXTURE_LIVE_ENVIRONMENT.image,
    imageId: FIXTURE_LIVE_ENVIRONMENT.imageId,
    postgresVersion: 'fixture-postgresql-1',
    observedRowsAfterFinalResetCell: 100,
    finalRowCountQueryText: '100',
    queueObserved: true,
    windowEngagements,
    resetEngagements,
    containerLogText: 'fixture managed PostgreSQL log bytes',
    cleanupReceipt: null,
    observationReceipt: null,
  };
}
