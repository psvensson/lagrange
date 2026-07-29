#!/usr/bin/env node

import {execFile} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {promisify} from 'node:util';
import pg from 'pg';
import {DockerProvider} from
  '../../test/distributed/harness/docker-provider.js';
import {
  waitForPostgresReady,
} from '../../test/distributed/harness/pgbench-runner.js';
import {
  digestBenchmarkSemanticData,
} from '../../test/distributed/harness/benchmark-semantic-integrity.js';
import {
  BENCHMARK_CAPACITY_ARTIFACT_POLICY,
  BENCHMARK_CAPACITY_CACHE_POLICY,
  BENCHMARK_CAPACITY_ESTIMATOR,
  BENCHMARK_CAPACITY_INTERVAL,
  BENCHMARK_CAPACITY_LIVE_EVIDENCE_CLASS,
  BENCHMARK_CAPACITY_MULTIPLE_COMPARISON,
  BENCHMARK_CAPACITY_OPERATION_LOG_ISSUER,
  BENCHMARK_CAPACITY_OPERATION_LOG_VERSION,
  BENCHMARK_CAPACITY_OUTCOME,
  BENCHMARK_CAPACITY_PHASE,
  BENCHMARK_CAPACITY_RANDOMIZATION_ALGORITHM,
  BENCHMARK_CAPACITY_REJECT_POLICY,
  BENCHMARK_CAPACITY_RUN_ORDER_POLICY,
  BENCHMARK_CAPACITY_STOPPING_RULE,
  BENCHMARK_CAPACITY_TIMEOUT_POLICY,
} from '../../test/distributed/harness/benchmark-capacity-protocol-constants.js';
import {
  sealBenchmarkCapacityPreregistration,
} from '../../test/distributed/harness/benchmark-capacity-preregistration.js';
import {liveDuration, liveWindows} from './benchmark-live-sampling.js';
import {
  runBenchmarkCapacityOpenLoopWindow,
} from '../../test/distributed/harness/benchmark-capacity-open-loop.js';
import {
  inspectBenchmarkCapacityProtocolReport,
  inspectBenchmarkCapacityTerminalMeasurement,
  runBenchmarkCapacityProtocol,
} from '../../test/distributed/harness/benchmark-capacity-protocol.js';
import {
  createBenchmarkCapacityWindowReceipt,
} from '../../test/distributed/harness/benchmark-capacity-window-receipt.js';
import {
  createBenchmarkCapacityCacheResetReceipt,
} from '../../test/distributed/harness/benchmark-capacity-cache-reset-receipt.js';
import {
  createBenchmarkCapacityCleanupReceipt,
  createBenchmarkCapacityLiveProvenanceReceipt,
  createBenchmarkCapacityLiveResetEngagement,
  createBenchmarkCapacityLiveWindowEngagement,
  replayBenchmarkCapacityRawArtifact,
  writeExternallyObservedBenchmarkCapacityRawArtifact,
} from '../../test/distributed/harness/benchmark-capacity-raw-artifact.js';
import {
  beginBenchmarkCapacityLiveObservation,
  captureBenchmarkCapacityLiveOperations,
  createBenchmarkCapacityPostgresqlObservedSql,
  createBenchmarkCapacityPostgresqlOutcomeMarker,
  finalizeBenchmarkCapacityLiveObservation,
  resolveBenchmarkCapacityCleanupObservation,
  resolveBenchmarkCapacityContainerLogText,
  resolveBenchmarkCapacityLiveObservation,
} from '../../test/distributed/harness/benchmark-capacity-live-observation-authority.js';
import {
  BENCHMARK_SQL_DIALECT,
  assertBenchmarkOperationResult,
  buildBenchmarkOperationDescriptor,
  buildBenchmarkResultSetEvidence,
  buildBenchmarkSemanticReceipt,
  getBenchmarkSemanticContract,
  verifyBenchmarkAcknowledgedWrites,
} from '../../test/distributed/harness/benchmark-workload-semantics.js';

const {Pool} = pg;
const IMAGE = 'postgres:16';
const PASSWORD = 'capacity-engagement';
const TABLE = 'benchmark_events';
const SIDE_IDS = ['engagement_candidate_a', 'engagement_candidate_b'];
const SCENARIO_REPORT_DIRECTORY = 'test-output/reports';
const SCENARIO = 'benchmark-statistical-capacity-protocol';
const WORKLOAD_SLEEP_SECONDS = 0.04;
const WORKLOAD_PROFILE = 'postgresql_insert_pg_sleep_40ms';
const RUN_ID = `capacity-live-${process.pid}-${Date.now()}`;
const NETWORK_NAME = `${RUN_ID}-network`;
const CONTAINER_NAME = `${RUN_ID}-postgres`;
const LABELS = {
  'lagrange.proof.run': RUN_ID,
  'lagrange.proof.scenario': SCENARIO,
};
const delay = (durationMs) =>
  new Promise((resolveDelay) => setTimeout(resolveDelay, durationMs));
const execFileAsync = promisify(execFile);

function sideSemanticContracts() {
  const contract =
    getBenchmarkSemanticContract(BENCHMARK_SQL_DIALECT.POSTGRESQL);
  return SIDE_IDS.map((sideId) => ({
    sideId,
    dialect: BENCHMARK_SQL_DIALECT.POSTGRESQL,
    contractDigest: contract.contractDigest,
  }));
}

function liveEnvironmentContract(imageId) {
  return {
    image: IMAGE,
    imageId,
    transport: 'persistent_pg_pool_over_managed_bridge',
    database: 'postgres',
  };
}

function executionIdentity(imageId) {
  const profileContract = {
    workloadProfile: WORKLOAD_PROFILE,
    operation: 'INSERT',
    operationDelayMs: 40,
    database: 'managed_postgresql',
  };
  const matrixId = 'managed-postgresql-capacity-matrix-v1';
  const cellId = 'postgresql-insert-pg-sleep-40ms';
  return {
    matrixId,
    cellId,
    cellManifestDigest: digestBenchmarkSemanticData({
      matrixId,
      cellId,
      profileContract,
    }),
    profileIdentity: digestBenchmarkSemanticData(profileContract),
    pairIdentity: digestBenchmarkSemanticData({
      sideIds: SIDE_IDS,
      sideSemanticContracts: sideSemanticContracts(),
    }),
    runId: RUN_ID,
    liveEnvironmentContractDigest:
      digestBenchmarkSemanticData(liveEnvironmentContract(imageId)),
  };
}

function preregistration(imageId) {
  return sealBenchmarkCapacityPreregistration({
    studyId: 'benchmark-capacity-live-engagement-v1',
    sideIds: SIDE_IDS,
    sideSemanticContracts: sideSemanticContracts(),
    offeredLoadPerSecond: [100, 160],
    slo: {maxP99LatencyMs: 2000, maxErrorRate: 0.25},
    repetitions: {minimum: 3, maximum: 3},
    statistics: {
      estimator: BENCHMARK_CAPACITY_ESTIMATOR,
      interval: BENCHMARK_CAPACITY_INTERVAL,
      confidenceLevel: 0.95,
      bootstrapResamples: 100,
      practicalSignificanceRatio: 0.05,
      targetRelativeCiWidth: 0.5,
      stoppingRule: BENCHMARK_CAPACITY_STOPPING_RULE,
      multipleComparisonTreatment: BENCHMARK_CAPACITY_MULTIPLE_COMPARISON,
    },
    sampling: {
      tailQuantile: 0.99,
      tailSampleMinimum: 100,
      windows: liveWindows(),
      operationTimeoutMs: 3000,
      semanticFinalizerTimeoutMs: 3000,
      resetTimeoutMs: 3000,
      maxReleaseLagMs: 100,
      clientMaxInFlight: 8,
      clientMaxQueueDepth: 256,
    },
    cachePolicy: BENCHMARK_CAPACITY_CACHE_POLICY,
    runOrderPolicy: BENCHMARK_CAPACITY_RUN_ORDER_POLICY,
    timeoutPolicy: BENCHMARK_CAPACITY_TIMEOUT_POLICY,
    rejectPolicy: BENCHMARK_CAPACITY_REJECT_POLICY,
    artifactPolicy: BENCHMARK_CAPACITY_ARTIFACT_POLICY,
    randomization: {
      algorithm: BENCHMARK_CAPACITY_RANDOMIZATION_ALGORITHM,
      seed: 20260727,
    },
    executionIdentity: executionIdentity(imageId),
  });
}

async function coverMonotonicObservationWithWallClock(startedAt, sample) {
  const remaining =
    sample.observationDurationMs - (Date.now() - startedAt);
  if (remaining > 0) await delay(remaining);
  let endedAt = Date.now();
  if (endedAt <= startedAt) {
    await delay(1);
    endedAt = Date.now();
  }
  return endedAt;
}

function operationLogText(operationLog, context, phase) {
  return JSON.stringify({
    version: BENCHMARK_CAPACITY_OPERATION_LOG_VERSION,
    issuer: BENCHMARK_CAPACITY_OPERATION_LOG_ISSUER.MANAGED_POSTGRESQL,
    blockIndex: context.blockIndex,
    blockedOrderIndex: context.blockedOrderIndex,
    sideId: context.sideId,
    phase,
    offeredLoad: context.offeredLoadPerSecond,
    entries: operationLog,
  });
}

function outcomeMarker(
  kind,
  context,
  phase,
  operationIndex,
  command,
  rowCount,
) {
  return createBenchmarkCapacityPostgresqlOutcomeMarker({
    kind,
    runId: RUN_ID,
    blockIndex: context.blockIndex,
    blockedOrderIndex: context.blockedOrderIndex,
    sideId: context.sideId,
    phase,
    offeredLoad: context.offeredLoadPerSecond,
    operationIndex,
    command,
    rowCount,
  });
}

function outcomeObservedSql(sql, marker, expectedRowCount, sleep) {
  return createBenchmarkCapacityPostgresqlObservedSql({
    sql,
    outcomeMarker: marker,
    expectedRowCount,
    sleepSeconds: sleep ? WORKLOAD_SLEEP_SECONDS : null,
  });
}

async function runLiveWindow(pool, sealed, context, phase) {
  const operationLog = [];
  const observationsByIndex = [];
  const acknowledgedIdsByIndex = [];
  const startedAt = Date.now();
  const duration =
    liveDuration(sealed, context.offeredLoadPerSecond, phase);
  const prefix = `${RUN_ID}-${context.sideId}-${context.blockIndex}-` +
    `${context.blockedOrderIndex}-${context.offeredLoadPerSecond}-${phase}-`;
  const sample = await runBenchmarkCapacityOpenLoopWindow({
    sideId: context.sideId,
    phase,
    blockIndex: context.blockIndex,
    offeredLoadPerSecond: context.offeredLoadPerSecond,
    windowDurationMs: duration,
    operationTimeoutMs: sealed.sampling.operationTimeoutMs,
    semanticFinalizerTimeoutMs:
      sealed.sampling.semanticFinalizerTimeoutMs,
    maxReleaseLagMs: sealed.sampling.maxReleaseLagMs,
    clientMaxInFlight: sealed.sampling.clientMaxInFlight,
    clientMaxQueueDepth: sealed.sampling.clientMaxQueueDepth,
    semanticDialect: BENCHMARK_SQL_DIALECT.POSTGRESQL,
    signal: null,
    async executeOperation({operationIndex}) {
      const descriptor = buildBenchmarkOperationDescriptor(
        'INSERT',
        operationIndex,
        {
          tableName: TABLE,
          eventIdPrefix: prefix,
          timestamp: Date.now(),
          sqlDialect: BENCHMARK_SQL_DIALECT.POSTGRESQL,
        },
      );
      const marker = outcomeMarker(
        'window',
        context,
        phase,
        operationIndex,
        'INSERT',
        1,
      );
      const sql = outcomeObservedSql(descriptor.sql, marker, 1, true);
      await pool.query(sql);
      const semanticResult = assertBenchmarkOperationResult(
        descriptor,
        {rows: [], rowCount: 1},
      );
      observationsByIndex[operationIndex] =
        semanticResult.resultObservation;
      acknowledgedIdsByIndex[operationIndex] =
        descriptor.acknowledgedWriteId;
      operationLog.push({
        operationIndex,
        sql,
        command: 'INSERT',
        rowCount: 1,
      });
      return {status: BENCHMARK_CAPACITY_OUTCOME.CORRECT};
    },
    async finalizeSemanticReceipt({
      counts,
      rejectedByReason,
      correctOperationIndexes,
    }) {
      const observations = [];
      const acknowledgedIds = [];
      for (let index = 0; index < correctOperationIndexes.length; index += 1) {
        const operationIndex = correctOperationIndexes[index];
        observations.push(observationsByIndex[operationIndex]);
        acknowledgedIds.push(acknowledgedIdsByIndex[operationIndex]);
      }
      const durability = await verifyBenchmarkAcknowledgedWrites({
        tableName: TABLE,
        ids: acknowledgedIds,
        async query(sql) {
          return pool.query(sql);
        },
      });
      return buildBenchmarkSemanticReceipt({
        dialect: BENCHMARK_SQL_DIALECT.POSTGRESQL,
        compiledOperations: counts.dispatched,
        validatedOperations: counts.correct,
        successfulOperations: counts.correct,
        oracleFailures: 0,
        resultSet: buildBenchmarkResultSetEvidence(observations),
        accounting: {
          ...counts,
          rejectedByReason: {...rejectedByReason},
        },
        durability,
      });
    },
  });
  const endedAt = await coverMonotonicObservationWithWallClock(
    startedAt,
    sample,
  );
  const engagement = createBenchmarkCapacityLiveWindowEngagement(
    {
      blockIndex: context.blockIndex,
      blockedOrderIndex: context.blockedOrderIndex,
      sideId: context.sideId,
      phase,
      offeredLoad: context.offeredLoadPerSecond,
      startedAt,
      endedAt,
      operationLogText: operationLogText(operationLog, context, phase),
    },
    sample,
    sealed,
  );
  return {
    sample,
    engagement,
    receipt: createBenchmarkCapacityWindowReceipt(
      {
        blockIndex: context.blockIndex,
        blockedOrderIndex: context.blockedOrderIndex,
        sideId: context.sideId,
        phase,
        offeredLoad: context.offeredLoadPerSecond,
        startedAt,
        endedAt,
        capacitySampleDigest: sample.sampleDigest,
        semanticReceiptDigest: sample.semanticReceiptDigest,
        liveEngagementDigest: engagement.liveEngagementDigest,
        resourceWindowDigest: null,
      },
      sample,
      sealed,
    ),
  };
}

async function positiveResetWindow(pool, context, sealed) {
  const startedAt = Date.now();
  const marker = outcomeMarker(
    'reset',
    context,
    'reset',
    null,
    'TRUNCATE',
    0,
  );
  const sql = outcomeObservedSql(
    `TRUNCATE ${TABLE}`,
    marker,
    0,
    false,
  );
  await pool.query(sql);
  let endedAt = Date.now();
  if (endedAt <= startedAt) {
    await delay(1);
    endedAt = Date.now();
  }
  const engagement = createBenchmarkCapacityLiveResetEngagement(
    {
      blockIndex: context.blockIndex,
      blockedOrderIndex: context.blockedOrderIndex,
      sideId: context.sideId,
      offeredLoad: context.offeredLoadPerSecond,
      startedAt,
      endedAt,
      operationLogText: JSON.stringify({
        version: BENCHMARK_CAPACITY_OPERATION_LOG_VERSION,
        issuer: BENCHMARK_CAPACITY_OPERATION_LOG_ISSUER.MANAGED_POSTGRESQL,
        blockIndex: context.blockIndex,
        blockedOrderIndex: context.blockedOrderIndex,
        sideId: context.sideId,
        phase: 'reset',
        offeredLoad: context.offeredLoadPerSecond,
        sql,
        command: 'TRUNCATE',
        rowCount: 0,
      }),
    },
    sealed,
  );
  return {
    engagement,
    receipt: createBenchmarkCapacityCacheResetReceipt(
      {
        blockIndex: context.blockIndex,
        blockedOrderIndex: context.blockedOrderIndex,
        sideId: context.sideId,
        offeredLoad: context.offeredLoadPerSecond,
        startedAt,
        endedAt,
        policy: sealed.cachePolicy,
        liveEngagementDigest: engagement.liveEngagementDigest,
      },
      sealed,
    ),
  };
}

async function executeScenario(pool, sealed) {
  const windowEngagements = [];
  const resetEngagements = [];
  const report = await runBenchmarkCapacityProtocol({
    preregistration: sealed,
    async resetRunState(context) {
      const reset = await positiveResetWindow(pool, context, sealed);
      resetEngagements.push(reset.engagement);
      return reset.receipt;
    },
    async executeRun(context) {
      const warmup = await runLiveWindow(
        pool,
        sealed,
        context,
        BENCHMARK_CAPACITY_PHASE.WARMUP,
      );
      const measured = await runLiveWindow(
        pool,
        sealed,
        context,
        BENCHMARK_CAPACITY_PHASE.MEASURED,
      );
      windowEngagements.push(warmup.engagement, measured.engagement);
      return {
        warmup: warmup.sample,
        measured: measured.sample,
        warmupWindowReceipt: warmup.receipt,
        measuredWindowReceipt: measured.receipt,
      };
    },
  });
  return {report, windowEngagements, resetEngagements};
}

async function writeScenarioReport(detail) {
  const timestamp = new Date().toISOString();
  const report = {
    timestamp,
    scenario: SCENARIO,
    producer: 'benchmark-statistical-capacity-live-engagement',
    fidelity: 'directed-live-managed-postgresql',
    summary: {total: 1, passed: 1, failed: 0},
    optimizationSummary: {totalPriorityItems: 0},
    standardSummary: {
      scenarios: [{
        scenario: SCENARIO,
        passed: true,
        current: {passed: true, verdict: 'PASS'},
        detail,
      }],
    },
  };
  await mkdir(SCENARIO_REPORT_DIRECTORY, {recursive: true});
  const stamp = timestamp.replace(/[:.]/gu, '-');
  const reportPath = resolve(
    SCENARIO_REPORT_DIRECTORY,
    `${SCENARIO}-${stamp}.report.json`,
  );
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}

async function strictCleanup(provider, state) {
  if (state.pool) {
    await state.pool.end();
    state.pool = null;
  }
  await provider.removeContainer(state.containerId);
  const containerAbsent =
    await provider.inspectContainerIfExists(state.containerId) === null;
  if (!containerAbsent) {
    throw new Error('managed PostgreSQL container remained after cleanup');
  }
  await provider.removeNetwork(state.networkId);
  const networkAbsent =
    await provider.getNetworkByName(NETWORK_NAME) === null;
  if (!networkAbsent) {
    throw new Error('managed PostgreSQL network remained after cleanup');
  }
}

async function bestEffortCleanup(provider, state) {
  if (state.pool) await state.pool.end().catch(() => {});
  if (state.containerId) {
    await provider.removeContainer(state.containerId).catch(() => {});
  }
  if (state.networkId) {
    await provider.removeNetwork(state.networkId).catch(() => {});
  }
}

async function replayInFreshProcess(artifactReceipt) {
  const moduleUrl = new URL(
    '../../test/distributed/harness/benchmark-capacity-raw-artifact.js',
    import.meta.url,
  ).href;
  const source =
    'import {replayBenchmarkCapacityRawArtifact as replay} from ' +
    `${JSON.stringify(moduleUrl)};` +
    'const receipt=JSON.parse(Buffer.from(' +
    'process.env.LAGRANGE_CAPACITY_ARTIFACT_RECEIPT,\'base64\')' +
    '.toString(\'utf8\'));' +
    'const result=await replay(receipt);' +
    'process.stdout.write(JSON.stringify(' +
      '{valid:result.valid,reason:result.reason}));';
  const encoded = Buffer.from(
    JSON.stringify(artifactReceipt),
    'utf8',
  ).toString('base64');
  const {stdout} = await execFileAsync(
    process.execPath,
    ['--input-type=module', '--eval', source],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        LAGRANGE_CAPACITY_ARTIFACT_RECEIPT: encoded,
      },
    },
  );
  return JSON.parse(stdout);
}

async function finalizeObservationExactlyOnce(session) {
  const attempts = await Promise.allSettled([
    finalizeBenchmarkCapacityLiveObservation(session),
    finalizeBenchmarkCapacityLiveObservation(session),
  ]);
  let finalization = null;
  let rejected = 0;
  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    if (attempt.status === 'fulfilled') {
      if (finalization !== null) {
        throw new Error('multiple observation finalizers succeeded');
      }
      finalization = attempt.value;
    } else {
      rejected += 1;
    }
  }
  if (finalization === null || rejected !== 1) {
    throw new Error('observation finalization must have one winner');
  }
  return finalization;
}

async function main() {
  const provider = new DockerProvider();
  const state = {
    pool: null,
    networkId: null,
    containerId: null,
    sealed: null,
    imageId: null,
    observationSession: null,
    observationAuthorization: null,
    observationReceipt: null,
  };
  let result;
  let containerLogText;
  let postgresVersion;
  let finalRowCountQueryText;
  try {
    const image = await provider.inspectImage(IMAGE);
    if (!image) throw new Error(`required live image unavailable: ${IMAGE}`);
    state.imageId = image.Id;
    const network = await provider.createNetwork(NETWORK_NAME, LABELS);
    state.networkId = network.id;
    const container = await provider.createContainer({
      name: CONTAINER_NAME,
      image: IMAGE,
      network: network.name,
      env: {POSTGRES_PASSWORD: PASSWORD, POSTGRES_DB: 'postgres'},
      labels: LABELS,
      resourceLimits: {memory: '512m', cpus: '1.0'},
      startTimeout: 30000,
      command: [
        'postgres',
        '-c',
        'log_statement=all',
        '-c',
        'log_min_messages=log',
      ],
    });
    state.containerId = container.containerId;
    await waitForPostgresReady(provider, state.containerId, {
      user: 'postgres',
      database: 'postgres',
      timeoutMs: 30000,
    });
    state.pool = new Pool({
      host: container.ip,
      port: 5432,
      user: 'postgres',
      password: PASSWORD,
      database: 'postgres',
      max: 8,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 3000,
      query_timeout: 3000,
      statement_timeout: 3000,
    });
    await state.pool.query(
      `CREATE TABLE ${TABLE} (` +
        'event_id TEXT PRIMARY KEY, payload BIGINT NOT NULL, ' +
        'created_at BIGINT NOT NULL);',
    );
    state.sealed = preregistration(image.Id);
    state.observationSession =
      await beginBenchmarkCapacityLiveObservation({
        runId: RUN_ID,
        containerId: state.containerId,
        networkId: state.networkId,
        networkName: NETWORK_NAME,
        liveEnvironmentContractDigest:
          state.sealed.executionIdentity.liveEnvironmentContractDigest,
      });
    result = await executeScenario(state.pool, state.sealed);
    const reportInspection = inspectBenchmarkCapacityProtocolReport(
      result.report,
      state.sealed,
    );
    if (!reportInspection.valid) {
      throw new Error(
        'live protocol report failed reconstruction: ' +
        `${reportInspection.reason}`,
      );
    }
    const terminal = inspectBenchmarkCapacityTerminalMeasurement(
      result.report,
      state.sealed,
    );
    if (!terminal.valid) {
      throw new Error(`live terminal measurement rejected: ${terminal.reason}`);
    }
    finalRowCountQueryText = String(
      (await state.pool.query(`SELECT count(*) AS count FROM ${TABLE};`))
        .rows[0].count,
    );
    postgresVersion =
      (await state.pool.query('SELECT version() AS version;')).rows[0].version;
    containerLogText = await captureBenchmarkCapacityLiveOperations(
      state.observationSession,
      {
        windowEngagements: result.windowEngagements,
        resetEngagements: result.resetEngagements,
      },
    );
    await strictCleanup(provider, state);
    const observationFinalization =
      await finalizeObservationExactlyOnce(state.observationSession);
    state.observationAuthorization =
      observationFinalization.authorization;
    state.observationReceipt = observationFinalization.receipt;
  } catch (error) {
    await bestEffortCleanup(provider, state);
    throw error;
  }
  const report = result.report;
  const liveObservation = resolveBenchmarkCapacityLiveObservation(
    state.observationReceipt,
    {
      runId: RUN_ID,
      containerId: state.containerId,
      networkId: state.networkId,
      networkName: NETWORK_NAME,
    },
  );
  const provenanceReceipt =
    createBenchmarkCapacityLiveProvenanceReceipt(liveObservation);
  const cleanupObservation = resolveBenchmarkCapacityCleanupObservation(
    state.observationReceipt,
    {
      runId: RUN_ID,
      containerId: state.containerId,
      networkId: state.networkId,
      networkName: NETWORK_NAME,
    },
  );
  const cleanupReceipt =
    createBenchmarkCapacityCleanupReceipt(cleanupObservation);
  if (
    resolveBenchmarkCapacityContainerLogText(state.observationReceipt) !==
      containerLogText
  ) {
    throw new Error('independent container log authority mismatch');
  }
  const queueObserved = report.rawSamples.some((sample) =>
    sample.clientQueueDelayMs.some((delayMs) => delayMs > 0));
  const identity = state.sealed.executionIdentity;
  const liveEvidence = {
    version: 'benchmark-capacity-live-evidence-v1',
    preregistrationDigest: state.sealed.manifestDigest,
    reportDigest: report.reportDigest,
    ...identity,
    liveEnvironmentContract: liveEnvironmentContract(state.imageId),
    evidenceClass:
      BENCHMARK_CAPACITY_LIVE_EVIDENCE_CLASS.EXTERNALLY_OBSERVED,
    provenanceReceipt,
    engagementOnly: false,
    comparativeClaimEligible: true,
    reason: 'terminal_measured_capacity_protocol',
    image: IMAGE,
    imageId: state.imageId,
    postgresVersion,
    observedRowsAfterFinalResetCell: Number(finalRowCountQueryText),
    finalRowCountQueryText,
    queueObserved,
    windowEngagements: result.windowEngagements,
    resetEngagements: result.resetEngagements,
    containerLogText,
    cleanupReceipt,
    observationReceipt: state.observationReceipt,
  };
  const artifactReceipt =
    await writeExternallyObservedBenchmarkCapacityRawArtifact(
      {
        preregistration: state.sealed,
        report,
        liveEvidence,
      },
      state.observationAuthorization,
    );
  const replay = await replayBenchmarkCapacityRawArtifact(artifactReceipt);
  if (!replay.valid) {
    throw new Error(`artifact replay failed: ${replay.reason}`);
  }
  const freshReplay = await replayInFreshProcess(artifactReceipt);
  if (!freshReplay.valid) {
    throw new Error(`fresh-process artifact replay failed: ${freshReplay.reason}`);
  }
  const scenarioReportPath = await writeScenarioReport({
    engagementOnly: false,
    comparativeClaimEligible: true,
    rawArtifactReplayValid: true,
    freshProcessRawArtifactReplayValid: true,
    protocolReportDigest: report.reportDigest,
    artifactReceipt,
    cleanupReceipt,
  });
  process.stdout.write(
    'benchmark-statistical-capacity-protocol-live: PASS\n' +
    'claim: terminal measured comparative capacity protocol\n' +
    `reportDigest: ${report.reportDigest}\n` +
    `artifact: ${artifactReceipt.artifactPath}\n` +
    `scenarioReport: ${scenarioReportPath}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `benchmark-statistical-capacity-protocol-live: FAIL\n${error.stack}\n`,
  );
  process.exitCode = 1;
});
