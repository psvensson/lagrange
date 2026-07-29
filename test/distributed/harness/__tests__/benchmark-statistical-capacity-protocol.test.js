import {test} from '../../../../src/test-helpers/tap.js';
import {
  digestBenchmarkSemanticData,
} from '../benchmark-semantic-integrity.js';
import {
  BENCHMARK_CAPACITY_ARTIFACT_POLICY,
  BENCHMARK_CAPACITY_CACHE_POLICY,
  BENCHMARK_CAPACITY_ESTIMATOR,
  BENCHMARK_CAPACITY_INTERVAL,
  BENCHMARK_CAPACITY_MEASUREMENT_STATE,
  BENCHMARK_CAPACITY_MULTIPLE_COMPARISON,
  BENCHMARK_CAPACITY_OUTCOME,
  BENCHMARK_CAPACITY_PHASE,
  BENCHMARK_CAPACITY_PRACTICAL_CLASSIFICATION,
  BENCHMARK_CAPACITY_RANDOMIZATION_ALGORITHM,
  BENCHMARK_CAPACITY_REJECT_POLICY,
  BENCHMARK_CAPACITY_RUN_ORDER_POLICY,
  BENCHMARK_CAPACITY_STOP_DECISION,
  BENCHMARK_CAPACITY_STOPPING_RULE,
  BENCHMARK_CAPACITY_TIMEOUT_POLICY,
} from '../benchmark-capacity-protocol-constants.js';
import {
  getBenchmarkCapacitySamplingWindow,
  inspectBenchmarkCapacityPreregistration,
  sealBenchmarkCapacityPreregistration,
} from '../benchmark-capacity-preregistration.js';
import {
  createBenchmarkCapacityRunSample,
  inspectBenchmarkCapacityRunSample,
} from '../benchmark-capacity-run-sample.js';
import {
  runBenchmarkCapacityOpenLoopWindow,
} from '../benchmark-capacity-open-loop.js';
import {
  completeBenchmarkCapacityProtocolResourceWindows,
  inspectBenchmarkCapacityProtocolReport,
  inspectBenchmarkCapacityTerminalMeasurement,
  runBenchmarkCapacityProtocol,
} from '../benchmark-capacity-protocol.js';
import {
  completeBenchmarkCapacityResourceWindow,
  inspectBenchmarkCapacityWindowReceipt,
} from '../benchmark-capacity-window-receipt.js';
import {
  createBenchmarkCapacityPostgresqlObservedSql,
  createBenchmarkCapacityPostgresqlOutcomeMarker,
} from '../benchmark-capacity-live-observation-authority.js';
import {
  BENCHMARK_SQL_DIALECT,
} from '../benchmark-workload-semantics.js';
import {
  completeResourceWindowsUnderHostileMap,
} from './benchmark-capacity-live-evidence-test-fixture.js';
import {
  FIXTURE_BLOCK_MAXIMUM,
  FIXTURE_BLOCK_MINIMUM,
  FIXTURE_FINALIZER_TIMEOUT_MS,
  FIXTURE_LOADS,
  FIXTURE_MAX_IN_FLIGHT,
  FIXTURE_MAX_QUEUE_DEPTH,
  FIXTURE_RELEASE_LAG_MS,
  FIXTURE_SEED,
  FIXTURE_TIMEOUT_MS,
  SIDE_LAGRANGE,
  SIDE_POSTGRESQL,
  fixtureExecutor,
  fixtureResetReceipt,
  fixtureWindowReceipt,
  inputFromSample,
  preregistrationInput,
  releaseOffsets,
  repeated,
  semanticReceiptForCounts,
  successfulRunSample,
} from './benchmark-capacity-protocol-test-fixture.js';

test('preregistration seals every statistical and execution policy', (t) => {
  const sealed = sealBenchmarkCapacityPreregistration(preregistrationInput());

  t.equal(inspectBenchmarkCapacityPreregistration(sealed).valid, true);
  t.equal(sealed.statistics.estimator, BENCHMARK_CAPACITY_ESTIMATOR);
  t.equal(sealed.statistics.interval, BENCHMARK_CAPACITY_INTERVAL);
  t.equal(sealed.statistics.stoppingRule, BENCHMARK_CAPACITY_STOPPING_RULE);
  t.equal(
    sealed.statistics.multipleComparisonTreatment,
    BENCHMARK_CAPACITY_MULTIPLE_COMPARISON,
  );
  t.equal(sealed.sampling.operationTimeoutMs, FIXTURE_TIMEOUT_MS);
  t.equal(sealed.cachePolicy, BENCHMARK_CAPACITY_CACHE_POLICY);
  t.equal(sealed.runOrderPolicy, BENCHMARK_CAPACITY_RUN_ORDER_POLICY);
  t.equal(sealed.timeoutPolicy, BENCHMARK_CAPACITY_TIMEOUT_POLICY);
  t.equal(sealed.rejectPolicy, BENCHMARK_CAPACITY_REJECT_POLICY);
  t.equal(sealed.artifactPolicy, BENCHMARK_CAPACITY_ARTIFACT_POLICY);
  t.equal(sealed.blockedPairOrders.length, FIXTURE_BLOCK_MAXIMUM);
  t.end();
});

test('sampling windows preserve fractional identity and per-load duration',
  (t) => {
    const firstLoad = 100.5;
    const secondLoad = 200.5;
    const firstMeasuredMs = 1_000;
    const secondMeasuredMs = 2_000;
    const input = preregistrationInput({
      offeredLoadPerSecond: [firstLoad, secondLoad],
    });
    input.sampling.windows = [
      {
        ...input.sampling.windows[0],
        offeredLoadPerSecond: firstLoad,
        measuredMs: firstMeasuredMs,
      },
      {
        ...input.sampling.windows[1],
        offeredLoadPerSecond: secondLoad,
        measuredMs: secondMeasuredMs,
      },
    ];

    const sealed = sealBenchmarkCapacityPreregistration(input);

    t.equal(
      getBenchmarkCapacitySamplingWindow(sealed, firstLoad).measuredMs,
      firstMeasuredMs,
    );
    t.equal(
      getBenchmarkCapacitySamplingWindow(sealed, secondLoad).measuredMs,
      secondMeasuredMs,
    );
    t.end();
  });

test('blocked pair order is seeded, balanced, and identity-bound', (t) => {
  const first = sealBenchmarkCapacityPreregistration(preregistrationInput());
  const same = sealBenchmarkCapacityPreregistration(preregistrationInput());
  const changed = sealBenchmarkCapacityPreregistration(
    preregistrationInput({
      randomization: {
        algorithm: BENCHMARK_CAPACITY_RANDOMIZATION_ALGORITHM,
        seed: FIXTURE_SEED + 1,
      },
    }),
  );
  let forward = 0;
  let reverse = 0;
  for (let index = 0; index < first.blockedPairOrders.length; index += 1) {
    if (first.blockedPairOrders[index][0] === SIDE_LAGRANGE) forward += 1;
    else reverse += 1;
    t.ok(Math.abs(forward - reverse) <= 1);
  }

  t.same(first.blockedPairOrders, same.blockedPairOrders);
  t.notSame(first.blockedPairOrders, changed.blockedPairOrders);
  t.not(first.manifestDigest, changed.manifestDigest);
  t.equal(Math.abs(forward - reverse), 1);
  t.end();
});

test('sealed preregistration rejects tampering and unsafe numeric edges', (t) => {
  const sealed = sealBenchmarkCapacityPreregistration(preregistrationInput());
  sealed.sampling.tailSampleMinimum += 1;
  t.equal(inspectBenchmarkCapacityPreregistration(sealed).valid, false);

  for (const value of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -0,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    const input = preregistrationInput();
    input.sampling.windows[0].measuredMs = value;
    t.throws(
      () => sealBenchmarkCapacityPreregistration(input),
      /invalid capacity preregistration/u,
      String(value),
    );
  }
  for (const value of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -1,
    -0,
    0,
  ]) {
    const input = preregistrationInput();
    input.offeredLoadPerSecond[0] = value;
    input.sampling.windows[0].offeredLoadPerSecond = value;
    t.throws(
      () => sealBenchmarkCapacityPreregistration(input),
      /offeredLoadPerSecond/u,
      `offered load ${String(value)}`,
    );
  }
  const misalignedWindow = preregistrationInput();
  misalignedWindow.sampling.windows[0].offeredLoadPerSecond = 101;
  t.throws(
    () => sealBenchmarkCapacityPreregistration(misalignedWindow),
    /offered_load_mismatch/u,
  );
  const mixedWarmup = preregistrationInput();
  mixedWarmup.sampling.windows[0].warmupMs = 0;
  t.throws(
    () => sealBenchmarkCapacityPreregistration(mixedWarmup),
    /uniform_warmup_presence_required/u,
  );
  for (const [field, value] of [
    ['tailSampleMinimum', 1],
    ['bootstrapResamples', 1],
  ]) {
    const input = preregistrationInput();
    if (field === 'tailSampleMinimum') input.sampling[field] = value;
    else input.statistics[field] = value;
    t.throws(
      () => sealBenchmarkCapacityPreregistration(input),
      /defensible_floor/u,
    );
  }
  const orderTamper =
    sealBenchmarkCapacityPreregistration(preregistrationInput());
  orderTamper.blockedPairOrders[0].reverse();
  const orderTamperBody = {...orderTamper};
  delete orderTamperBody.manifestDigest;
  orderTamper.manifestDigest =
    digestBenchmarkSemanticData(orderTamperBody);
  t.equal(
    inspectBenchmarkCapacityPreregistration(orderTamper).valid,
    false,
  );
  t.end();
});

test('run sample reconciles every non-success denominator', (t) => {
  const counts = {
    offered: 100,
    dispatched: 90,
    correct: 80,
    rejected: 10,
    timedOut: 3,
    errored: 4,
    queueOverflow: 5,
    undispatched: 2,
    cancelled: 1,
  };
  const rejectedByReason = {queueFull: 5, flowControl: 3, admission: 2};
  const sample = createBenchmarkCapacityRunSample({
    sideId: SIDE_LAGRANGE,
    phase: BENCHMARK_CAPACITY_PHASE.MEASURED,
    blockIndex: 0,
    offeredLoadPerSecond: 100,
    windowDurationMs: 1000,
    observationStartedAtMs: 0,
    observationEndedAtMs: 1000,
    operationTimeoutMs: FIXTURE_TIMEOUT_MS,
    maxReleaseLagMs: FIXTURE_RELEASE_LAG_MS,
    clientMaxInFlight: FIXTURE_MAX_IN_FLIGHT,
    clientMaxQueueDepth: FIXTURE_MAX_QUEUE_DEPTH,
    counts,
    rejectedByReason,
    endToEndLatencyMs: repeated(10, 80),
    clientQueueDelayMs: repeated(4, 90),
    releaseOffsetsMs: releaseOffsets(100, 1000),
    releaseLagMs: repeated(0, 100),
    unreleasedOperations: 0,
    semanticDialect: BENCHMARK_SQL_DIALECT.SQLITE,
    semanticReceipt: semanticReceiptForCounts(
      BENCHMARK_SQL_DIALECT.SQLITE,
      counts,
      rejectedByReason,
    ),
  });

  t.equal(inspectBenchmarkCapacityRunSample(sample).valid, true);
  t.equal(sample.correctThroughputPerSecond, 80);
  t.equal(sample.errorRate, 0.2);
  t.same(sample.rejectedByReason, {
    queueFull: 5,
    flowControl: 3,
    admission: 2,
  });
  t.end();
});

test('run samples reject overlapping or missing terminal accounting', (t) => {
  const input = {
    sideId: SIDE_LAGRANGE,
    phase: BENCHMARK_CAPACITY_PHASE.MEASURED,
    blockIndex: 0,
    offeredLoadPerSecond: 100,
    windowDurationMs: 1000,
    observationStartedAtMs: 0,
    observationEndedAtMs: 1000,
    operationTimeoutMs: FIXTURE_TIMEOUT_MS,
    maxReleaseLagMs: FIXTURE_RELEASE_LAG_MS,
    clientMaxInFlight: FIXTURE_MAX_IN_FLIGHT,
    clientMaxQueueDepth: FIXTURE_MAX_QUEUE_DEPTH,
    counts: {
      offered: 100,
      dispatched: 100,
      correct: 99,
      rejected: 0,
      timedOut: 0,
      errored: 0,
      queueOverflow: 0,
      undispatched: 0,
      cancelled: 0,
    },
    rejectedByReason: {queueFull: 0, flowControl: 0, admission: 0},
    endToEndLatencyMs: repeated(10, 99),
    clientQueueDelayMs: repeated(0, 99),
    releaseOffsetsMs: releaseOffsets(100, 1000),
    releaseLagMs: repeated(0, 100),
    unreleasedOperations: 0,
    semanticDialect: BENCHMARK_SQL_DIALECT.SQLITE,
    semanticReceipt: null,
  };
  t.throws(
    () => createBenchmarkCapacityRunSample(input),
    /accounting_does_not_reconcile/u,
  );
  t.end();
});

test('sample validation binds dialect receipts and actual release lag', (t) => {
  const sealed =
    sealBenchmarkCapacityPreregistration(preregistrationInput());
  const sample = successfulRunSample({
    sideId: SIDE_LAGRANGE,
    phase: BENCHMARK_CAPACITY_PHASE.MEASURED,
    blockIndex: 0,
    offeredLoadPerSecond: 100,
    windowDurationMs: 1000,
    p99LatencyMs: 10,
    preregistration: sealed,
  });
  t.throws(
    () => createBenchmarkCapacityRunSample(inputFromSample(sample, {
      semanticDialect: BENCHMARK_SQL_DIALECT.POSTGRESQL,
    })),
    /valid_matching_c2_receipt_required/u,
  );
  const missingReleaseLag = [...sample.releaseLagMs];
  missingReleaseLag[0] = null;
  t.throws(
    () => createBenchmarkCapacityRunSample(inputFromSample(sample, {
      releaseLagMs: missingReleaseLag,
    })),
    /unreleased_suffix_mismatch/u,
  );
  t.end();
});

test('full fixture matrix reports SLO capacity and paired uncertainty',
  async (t) => {
    const sealed =
      sealBenchmarkCapacityPreregistration(preregistrationInput());
    const report = await runBenchmarkCapacityProtocol({
      preregistration: sealed,
      resetRunState: fixtureResetReceipt,
      executeRun: fixtureExecutor(sealed),
    });
    const summary = report.summary;

    t.equal(inspectBenchmarkCapacityProtocolReport(report, sealed).valid, true);
    t.equal(
      summary.measurementState,
      BENCHMARK_CAPACITY_MEASUREMENT_STATE.MEASURED,
    );
    t.equal(report.completedBlocks, FIXTURE_BLOCK_MINIMUM);
    t.equal(summary.observedRunSampleCount, 18);
    t.equal(
      summary.capacityBySide[SIDE_LAGRANGE]
        .maxSloOfferedLoadPerSecond,
      200,
    );
    t.equal(
      summary.capacityBySide[SIDE_POSTGRESQL]
        .maxSloOfferedLoadPerSecond,
      100,
    );
    t.equal(summary.pairedEffect.estimate, 2);
    t.same(summary.pairedEffect.confidenceInterval, {lower: 2, upper: 2});
    t.equal(
      summary.pairedEffect.practicalClassification,
      BENCHMARK_CAPACITY_PRACTICAL_CLASSIFICATION.FIRST_SIDE_FASTER,
    );
    t.equal(
      summary.stoppingDecision.decision,
      BENCHMARK_CAPACITY_STOP_DECISION.PRECISION_REACHED,
    );
    t.equal(summary.capacityCurve.length, FIXTURE_LOADS.length);
    t.equal(report.rawSampleDigests.length, 18);
    t.equal(report.warmupSampleDigests.length, 18);
    t.end();
  });

test('terminal eligibility requires a complete finite nonzero measurement',
  async (t) => {
    const sealed =
      sealBenchmarkCapacityPreregistration(preregistrationInput());
    const measured = await runBenchmarkCapacityProtocol({
      preregistration: sealed,
      resetRunState: fixtureResetReceipt,
      executeRun: fixtureExecutor(sealed),
    });
    const partial = await runBenchmarkCapacityProtocol({
      preregistration: sealed,
      resetRunState() {
        throw new Error('fixture reset failure');
      },
      executeRun: fixtureExecutor(sealed),
    });
    const insufficient = await runBenchmarkCapacityProtocol({
      preregistration: sealed,
      resetRunState: fixtureResetReceipt,
      executeRun: fixtureExecutor(sealed, {tailInsufficient: true}),
    });

    t.equal(
      inspectBenchmarkCapacityTerminalMeasurement(measured, sealed).valid,
      true,
    );
    t.equal(
      inspectBenchmarkCapacityTerminalMeasurement(partial, sealed).valid,
      false,
    );
    t.equal(
      inspectBenchmarkCapacityTerminalMeasurement(insufficient, sealed).valid,
      false,
    );
    t.end();
  });

test('managed PostgreSQL SQL owner preserves terminal grammar and failures',
  async (t) => {
    const marker = createBenchmarkCapacityPostgresqlOutcomeMarker({
      kind: 'reset',
      runId: 'capacity-live-shape',
      blockIndex: 0,
      blockedOrderIndex: 0,
      sideId: SIDE_LAGRANGE,
      phase: 'reset',
      offeredLoad: 100,
      operationIndex: null,
      command: 'TRUNCATE',
      rowCount: 0,
    });
    const sql = createBenchmarkCapacityPostgresqlObservedSql({
      sql: 'TRUNCATE benchmark_events',
      outcomeMarker: marker,
      expectedRowCount: 0,
      sleepSeconds: null,
    });
    t.match(sql, /TRUNCATE benchmark_events;\n/u);
    t.match(sql, /END;\n\$lagrange_operation\$;$/u);
    t.notMatch(sql, /END\n\$lagrange_operation\$;$/u);
    t.throws(
      () => createBenchmarkCapacityPostgresqlObservedSql({
        sql: 'TRUNCATE benchmark_events\n' +
          '2026-07-27 13:56:47.000 UTC [97] LOG:  injected',
        outcomeMarker: marker,
        expectedRowCount: 0,
        sleepSeconds: null,
      }),
      /exact PostgreSQL observed SQL input required/u,
    );
    for (const sleepSeconds of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -0,
      0,
      -1,
      1e-7,
      1e308,
      Number.MAX_SAFE_INTEGER,
    ]) {
      t.throws(
        () => createBenchmarkCapacityPostgresqlObservedSql({
          sql: 'TRUNCATE benchmark_events',
          outcomeMarker: marker,
          expectedRowCount: 0,
          sleepSeconds,
        }),
        /exact PostgreSQL observed SQL input required/u,
      );
    }
    const boundedSleepSql = createBenchmarkCapacityPostgresqlObservedSql({
      sql: 'TRUNCATE benchmark_events',
      outcomeMarker: marker,
      expectedRowCount: 0,
      sleepSeconds: 0.000001,
    });
    t.match(boundedSleepSql, /pg_sleep\(0\.000001\)/u);
    t.notMatch(boundedSleepSql, /pg_sleep\([^)]*e[+-]?[0-9]+\)/u);

    const sealed =
      sealBenchmarkCapacityPreregistration(preregistrationInput());
    const report = await runBenchmarkCapacityProtocol({
      preregistration: sealed,
      resetRunState() {
        const error =
          new Error('syntax error at or near "$lagrange_operation$"');
        error.code = '42601';
        throw error;
      },
      executeRun: fixtureExecutor(sealed),
    });
    t.equal(report.completedBlocks, 0);
    t.equal(report.executionFailure.stage, 'cache_reset');
    t.equal(report.executionFailure.errorCode, '42601');
    t.equal(
      report.measurementState,
      BENCHMARK_CAPACITY_MEASUREMENT_STATE.NON_MEASURING,
    );
    t.same(
      inspectBenchmarkCapacityTerminalMeasurement(report, sealed),
      {valid: false, reason: 'measurement_incomplete'},
    );
    t.end();
  });

test('protocol owner completes every C4 resource window exactly once',
  async (t) => {
    const sealed =
      sealBenchmarkCapacityPreregistration(preregistrationInput());
    const report = await runBenchmarkCapacityProtocol({
      preregistration: sealed,
      resetRunState: fixtureResetReceipt,
      executeRun: fixtureExecutor(sealed),
    });
    const completions = report.windowReceipts.map((receipt, index) => ({
      windowReceiptDigest: receipt.windowReceiptDigest,
      resourceWindowDigest: digestBenchmarkSemanticData({
        resourceWindow: index,
      }),
    }));
    const completed = completeBenchmarkCapacityProtocolResourceWindows(
      report,
      sealed,
      completions,
    );
    t.equal(
      inspectBenchmarkCapacityProtocolReport(completed, sealed).valid,
      true,
    );
    t.equal(
      completed.windowReceipts.every(
        (receipt) => receipt.resourceWindowDigest !== null,
      ),
      true,
    );
    t.equal(
      completeResourceWindowsUnderHostileMap(
        report,
        sealed,
        completions,
      ),
      true,
    );
    t.throws(
      () => completeBenchmarkCapacityProtocolResourceWindows(
        report,
        sealed,
        completions.slice(1),
      ),
      /cover every window exactly/u,
    );
    const duplicated = [...completions];
    duplicated[1] = duplicated[0];
    t.throws(
      () => completeBenchmarkCapacityProtocolResourceWindows(
        report,
        sealed,
        duplicated,
      ),
      /invalid or duplicated/u,
    );
    const secondPass = completed.windowReceipts.map((receipt, index) => ({
      windowReceiptDigest: receipt.windowReceiptDigest,
      resourceWindowDigest: digestBenchmarkSemanticData({
        secondResourceWindow: index,
      }),
    }));
    t.throws(
      () => completeBenchmarkCapacityProtocolResourceWindows(
        completed,
        sealed,
        secondPass,
      ),
      /already complete/u,
    );
    t.end();
  });

test('p99 tail insufficiency stays explicit through maximum N', async (t) => {
  const sealed =
    sealBenchmarkCapacityPreregistration(preregistrationInput());
  const report = await runBenchmarkCapacityProtocol({
    preregistration: sealed,
    resetRunState: fixtureResetReceipt,
    executeRun: fixtureExecutor(sealed, {tailInsufficient: true}),
  });

  t.equal(report.completedBlocks, FIXTURE_BLOCK_MAXIMUM);
  t.equal(
    report.summary.measurementState,
    BENCHMARK_CAPACITY_MEASUREMENT_STATE.NON_MEASURING,
  );
  t.equal(report.summary.sampleSufficiency.sufficient, false);
  t.equal(
    report.summary.stoppingDecision.decision,
    BENCHMARK_CAPACITY_STOP_DECISION.NON_MEASURING,
  );
  t.ok(report.summary.reasonCodes.includes('insufficient_p99_samples'));
  t.end();
});

test('tampered report and raw sample digests fail closed', async (t) => {
  const sealed =
    sealBenchmarkCapacityPreregistration(preregistrationInput());
  const report = await runBenchmarkCapacityProtocol({
    preregistration: sealed,
    resetRunState: fixtureResetReceipt,
    executeRun: fixtureExecutor(sealed),
  });
  const reordered = structuredClone(report);
  [reordered.rawSamples[0], reordered.rawSamples[1]] =
    [reordered.rawSamples[1], reordered.rawSamples[0]];
  [reordered.rawSampleDigests[0], reordered.rawSampleDigests[1]] =
    [reordered.rawSampleDigests[1], reordered.rawSampleDigests[0]];
  [reordered.warmupSamples[0], reordered.warmupSamples[1]] =
    [reordered.warmupSamples[1], reordered.warmupSamples[0]];
  [reordered.warmupSampleDigests[0], reordered.warmupSampleDigests[1]] =
    [reordered.warmupSampleDigests[1], reordered.warmupSampleDigests[0]];
  [reordered.cacheResetReceipts[0], reordered.cacheResetReceipts[1]] =
    [reordered.cacheResetReceipts[1], reordered.cacheResetReceipts[0]];
  const firstWindowPair = reordered.windowReceipts.slice(0, 2);
  const secondWindowPair = reordered.windowReceipts.slice(2, 4);
  reordered.windowReceipts.splice(
    0,
    4,
    ...secondWindowPair,
    ...firstWindowPair,
  );
  const reorderedBody = {...reordered};
  delete reorderedBody.reportDigest;
  reordered.reportDigest = digestBenchmarkSemanticData(reorderedBody);
  t.equal(
    inspectBenchmarkCapacityProtocolReport(reordered, sealed).valid,
    false,
  );
  report.summary.pairedEffect.estimate = 99;
  t.equal(inspectBenchmarkCapacityProtocolReport(report, sealed).valid, false);

  const sample = successfulRunSample({
    sideId: SIDE_LAGRANGE,
    phase: BENCHMARK_CAPACITY_PHASE.MEASURED,
    blockIndex: 0,
    offeredLoadPerSecond: 100,
    windowDurationMs: 1000,
    p99LatencyMs: 10,
    preregistration: sealed,
  });
  sample.counts.correct -= 1;
  t.equal(inspectBenchmarkCapacityRunSample(sample).valid, false);
  t.end();
});

test('every receipt repeats the sealed stable workload identity', async (t) => {
  const sealed =
    sealBenchmarkCapacityPreregistration(preregistrationInput());
  const report = await runBenchmarkCapacityProtocol({
    preregistration: sealed,
    resetRunState: fixtureResetReceipt,
    executeRun: fixtureExecutor(sealed),
  });
  const receipts = [
    ...report.windowReceipts,
    ...report.cacheResetReceipts,
  ];
  t.equal(
    receipts.every((receipt) =>
      receipt.matrixId === sealed.executionIdentity.matrixId &&
      receipt.cellId === sealed.executionIdentity.cellId &&
      receipt.cellManifestDigest ===
        sealed.executionIdentity.cellManifestDigest &&
      receipt.profileIdentity === sealed.executionIdentity.profileIdentity &&
      receipt.pairIdentity === sealed.executionIdentity.pairIdentity &&
      receipt.runId === sealed.executionIdentity.runId &&
      receipt.liveEnvironmentContractDigest ===
        sealed.executionIdentity.liveEnvironmentContractDigest),
    true,
  );

  const tampered = structuredClone(report);
  tampered.windowReceipts[0].cellId = 'phase-specific-forgery';
  const receiptBody = {...tampered.windowReceipts[0]};
  delete receiptBody.windowReceiptDigest;
  tampered.windowReceipts[0].windowReceiptDigest =
    digestBenchmarkSemanticData(receiptBody);
  const reportBody = {...tampered};
  delete reportBody.reportDigest;
  tampered.reportDigest = digestBenchmarkSemanticData(reportBody);
  t.equal(
    inspectBenchmarkCapacityProtocolReport(tampered, sealed).valid,
    false,
  );
  t.end();
});

test('window receipts are sample-resolved, immutable, and C4-completable',
  (t) => {
    const sealed =
      sealBenchmarkCapacityPreregistration(preregistrationInput());
    const sample = successfulRunSample({
      sideId: SIDE_LAGRANGE,
      phase: BENCHMARK_CAPACITY_PHASE.MEASURED,
      blockIndex: 0,
      offeredLoadPerSecond: 100,
      windowDurationMs: 1000,
      p99LatencyMs: 10,
      preregistration: sealed,
    });
    const context = {
      preregistration: sealed,
      sideId: SIDE_LAGRANGE,
      blockIndex: 0,
      blockedOrderIndex:
        sealed.blockedPairOrders[0].indexOf(SIDE_LAGRANGE),
      offeredLoadPerSecond: 100,
    };
    const receipt = fixtureWindowReceipt(sample, context);
    const resourceDigest = digestBenchmarkSemanticData({resource: 'c4'});
    const completed = completeBenchmarkCapacityResourceWindow(
      receipt,
      resourceDigest,
      sample,
      sealed,
    );

    t.equal(
      inspectBenchmarkCapacityWindowReceipt(receipt, sample, sealed).valid,
      true,
    );
    t.equal(Object.isFrozen(receipt), true);
    t.equal(receipt.resourceWindowDigest, null);
    t.equal(completed.resourceWindowDigest, resourceDigest);
    t.not(completed.windowReceiptDigest, receipt.windowReceiptDigest);
    t.end();
  });

test('never-settling cache reset is bounded and fails loudly', async (t) => {
  const sealed =
    sealBenchmarkCapacityPreregistration(preregistrationInput());
  const startedAt = Date.now();
  const report = await runBenchmarkCapacityProtocol({
    preregistration: sealed,
    resetRunState() {
      return new Promise(() => {});
    },
    executeRun: fixtureExecutor(sealed),
  });
  t.equal(report.measurementState,
    BENCHMARK_CAPACITY_MEASUREMENT_STATE.NON_MEASURING);
  t.equal(report.executionFailure.stage, 'cache_reset');
  t.match(report.executionFailure.message, /ignored bounded abort/u);
  t.equal(
    inspectBenchmarkCapacityProtocolReport(report, sealed).valid,
    true,
  );
  t.ok(Date.now() - startedAt < 500);
  t.end();
});

test('partial reports accept only the exact completed-cell prefix',
  async (t) => {
    const sealed =
      sealBenchmarkCapacityPreregistration(preregistrationInput());
    const executeFixture = fixtureExecutor(sealed);
    let executeCalls = 0;
    const executeFailure = await runBenchmarkCapacityProtocol({
      preregistration: sealed,
      resetRunState: fixtureResetReceipt,
      async executeRun(context) {
        executeCalls += 1;
        if (executeCalls === 3) throw new Error('fixture execute failure');
        return executeFixture(context);
      },
    });
    t.equal(
      inspectBenchmarkCapacityProtocolReport(executeFailure, sealed).valid,
      true,
    );
    t.equal(executeFailure.rawSamples.length, 2);
    t.equal(executeFailure.cacheResetReceipts.length, 3);

    const reordered = structuredClone(executeFailure);
    [reordered.rawSamples[0], reordered.rawSamples[1]] =
      [reordered.rawSamples[1], reordered.rawSamples[0]];
    [reordered.rawSampleDigests[0], reordered.rawSampleDigests[1]] =
      [reordered.rawSampleDigests[1], reordered.rawSampleDigests[0]];
    [reordered.warmupSamples[0], reordered.warmupSamples[1]] =
      [reordered.warmupSamples[1], reordered.warmupSamples[0]];
    [reordered.warmupSampleDigests[0], reordered.warmupSampleDigests[1]] =
      [reordered.warmupSampleDigests[1], reordered.warmupSampleDigests[0]];
    [reordered.cacheResetReceipts[0], reordered.cacheResetReceipts[1]] =
      [reordered.cacheResetReceipts[1], reordered.cacheResetReceipts[0]];
    reordered.windowReceipts = [
      ...reordered.windowReceipts.slice(2, 4),
      ...reordered.windowReceipts.slice(0, 2),
    ];
    const reorderedBody = {...reordered};
    delete reorderedBody.reportDigest;
    reordered.reportDigest = digestBenchmarkSemanticData(reorderedBody);
    t.equal(
      inspectBenchmarkCapacityProtocolReport(reordered, sealed).valid,
      false,
    );

    const futureFailure = structuredClone(executeFailure);
    const failure = futureFailure.executionFailure;
    failure.blockedOrderIndex = 1;
    failure.sideId = sealed.blockedPairOrders[0][1];
    const failureBody = {...failure};
    delete failureBody.failureDigest;
    failure.failureDigest = digestBenchmarkSemanticData(failureBody);
    futureFailure.summary.missingCell = {
      stage: failure.stage,
      blockIndex: failure.blockIndex,
      blockedOrderIndex: failure.blockedOrderIndex,
      sideId: failure.sideId,
      offeredLoadPerSecond: failure.offeredLoadPerSecond,
      failureDigest: failure.failureDigest,
    };
    const summaryBody = {...futureFailure.summary};
    delete summaryBody.summaryDigest;
    futureFailure.summary.summaryDigest =
      digestBenchmarkSemanticData(summaryBody);
    const futureBody = {...futureFailure};
    delete futureBody.reportDigest;
    futureFailure.reportDigest = digestBenchmarkSemanticData(futureBody);
    t.equal(
      inspectBenchmarkCapacityProtocolReport(futureFailure, sealed).valid,
      false,
    );

    let resetCalls = 0;
    const resetFailure = await runBenchmarkCapacityProtocol({
      preregistration: sealed,
      resetRunState(context) {
        resetCalls += 1;
        if (resetCalls === 3) throw new Error('fixture reset failure');
        return fixtureResetReceipt(context);
      },
      executeRun: fixtureExecutor(sealed),
    });
    t.equal(
      inspectBenchmarkCapacityProtocolReport(resetFailure, sealed).valid,
      true,
    );
    t.equal(resetFailure.cacheResetReceipts.length, 2);
    const extraReset = structuredClone(resetFailure);
    extraReset.cacheResetReceipts.push(extraReset.cacheResetReceipts[0]);
    const extraResetBody = {...extraReset};
    delete extraResetBody.reportDigest;
    extraReset.reportDigest = digestBenchmarkSemanticData(extraResetBody);
    t.equal(
      inspectBenchmarkCapacityProtocolReport(extraReset, sealed).valid,
      false,
    );
    t.end();
  });

test('open-loop saturation keeps queueing and overflow observable', async (t) => {
  const sample = await runBenchmarkCapacityOpenLoopWindow({
    sideId: SIDE_LAGRANGE,
    phase: BENCHMARK_CAPACITY_PHASE.MEASURED,
    blockIndex: 0,
    offeredLoadPerSecond: 1000,
    windowDurationMs: 10,
    operationTimeoutMs: 100,
    semanticFinalizerTimeoutMs: FIXTURE_FINALIZER_TIMEOUT_MS,
    maxReleaseLagMs: FIXTURE_RELEASE_LAG_MS,
    clientMaxInFlight: 1,
    clientMaxQueueDepth: 1,
    semanticDialect: BENCHMARK_SQL_DIALECT.SQLITE,
    signal: null,
    finalizeSemanticReceipt({counts, rejectedByReason}) {
      return semanticReceiptForCounts(
        BENCHMARK_SQL_DIALECT.SQLITE,
        counts,
        rejectedByReason,
      );
    },
    async executeOperation() {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return {status: BENCHMARK_CAPACITY_OUTCOME.CORRECT};
    },
  });

  t.equal(sample.counts.offered, 10);
  t.equal(sample.counts.correct, 2);
  t.equal(sample.counts.queueOverflow, 8);
  t.equal(sample.counts.rejected, 8);
  t.equal(sample.clientQueueDelayMs.length, 2);
  t.ok(sample.clientQueueDelayMs[1] > 0);
  t.ok(sample.endToEndLatencyMs[1] > sample.endToEndLatencyMs[0]);
  t.ok(sample.observationDurationMs > sample.windowDurationMs);
  t.equal(
    sample.correctThroughputPerSecond,
    sample.counts.correct * 1000 / sample.observationDurationMs,
  );
  t.ok(
    sample.correctThroughputPerSecond <
      sample.counts.correct * 1000 / sample.windowDurationMs,
  );
  t.end();
});

test('all-error windows still finalize owner evidence', async (t) => {
  let finalizerCalls = 0;
  const sample = await runBenchmarkCapacityOpenLoopWindow({
    sideId: SIDE_LAGRANGE,
    phase: BENCHMARK_CAPACITY_PHASE.WARMUP,
    blockIndex: 0,
    offeredLoadPerSecond: 1000,
    windowDurationMs: 10,
    operationTimeoutMs: 100,
    semanticFinalizerTimeoutMs: FIXTURE_FINALIZER_TIMEOUT_MS,
    maxReleaseLagMs: FIXTURE_RELEASE_LAG_MS,
    clientMaxInFlight: FIXTURE_MAX_IN_FLIGHT,
    clientMaxQueueDepth: FIXTURE_MAX_QUEUE_DEPTH,
    semanticDialect: BENCHMARK_SQL_DIALECT.SQLITE,
    signal: null,
    finalizeSemanticReceipt() {
      finalizerCalls += 1;
      return null;
    },
    executeOperation() {
      return {status: BENCHMARK_CAPACITY_OUTCOME.ERRORED};
    },
  });

  t.equal(finalizerCalls, 1);
  t.equal(sample.counts.correct, 0);
  t.equal(sample.counts.errored, sample.counts.dispatched);
  t.equal(sample.clientQueueDelayMs.length, sample.counts.dispatched);
  t.equal(sample.semanticReceipt, null);
  t.end();
});

test('never-settling operations time out and the drain terminates', async (t) => {
  const startedAtMs = Date.now();
  let failure;
  try {
    await runBenchmarkCapacityOpenLoopWindow({
      sideId: SIDE_POSTGRESQL,
      phase: BENCHMARK_CAPACITY_PHASE.MEASURED,
      blockIndex: 0,
      offeredLoadPerSecond: 100,
      windowDurationMs: 20,
      operationTimeoutMs: 10,
      semanticFinalizerTimeoutMs: FIXTURE_FINALIZER_TIMEOUT_MS,
      maxReleaseLagMs: FIXTURE_RELEASE_LAG_MS,
      clientMaxInFlight: 1,
      clientMaxQueueDepth: 1,
      semanticDialect: BENCHMARK_SQL_DIALECT.POSTGRESQL,
      signal: null,
      finalizeSemanticReceipt: null,
      executeOperation() {
        return new Promise(() => {});
      },
    });
  } catch (error) {
    failure = error;
  }
  t.equal(failure?.code, 'BENCHMARK_CAPACITY_EXECUTION_LEAK');
  t.ok(Date.now() - startedAtMs < 200);
  t.end();
});

test('cancellation accounts queued, in-flight, and unreleased work',
  async (t) => {
    const startedAtMs = Date.now();
    const controller = new AbortController();
    const runPromise = runBenchmarkCapacityOpenLoopWindow({
      sideId: SIDE_LAGRANGE,
      phase: BENCHMARK_CAPACITY_PHASE.MEASURED,
      blockIndex: 0,
      offeredLoadPerSecond: 1000,
      windowDurationMs: 100,
      operationTimeoutMs: 100,
      semanticFinalizerTimeoutMs: FIXTURE_FINALIZER_TIMEOUT_MS,
      maxReleaseLagMs: FIXTURE_RELEASE_LAG_MS,
      clientMaxInFlight: 1,
      clientMaxQueueDepth: 10,
      semanticDialect: BENCHMARK_SQL_DIALECT.SQLITE,
      finalizeSemanticReceipt: null,
      signal: controller.signal,
      executeOperation({signal}) {
        return new Promise((resolve) => {
          signal.addEventListener('abort', () => {
            resolve({status: BENCHMARK_CAPACITY_OUTCOME.CANCELLED});
          }, {once: true});
        });
      },
    });
    setTimeout(() => controller.abort(), 5);
    const sample = await runPromise;

    t.equal(sample.counts.offered, 100);
    t.ok(sample.counts.cancelled >= 1);
    t.ok(sample.counts.undispatched >= 1);
    t.equal(
      sample.counts.offered,
      sample.counts.dispatched +
        sample.rejectedByReason.queueFull +
        sample.rejectedByReason.flowControl +
        sample.counts.undispatched,
    );
    t.ok(Date.now() - startedAtMs < 80);
    t.end();
  });
