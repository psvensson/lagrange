import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {componentize} from '@bytecodealliance/componentize-js';
import {
  CERTIFICATION_NON_TERMINAL_REASON,
  CERTIFICATION_VERDICT,
  COMPARISON_OUTCOME,
  DIMENSION_NAME,
  PUBLIC_PATH_CERTIFICATION_SCHEMA_VERSION,
  REPRESENTATIVENESS_AXIS,
  REQUIRED_CERTIFICATION_DIMENSIONS,
  REQUIRED_REPRESENTATIVENESS_AXES,
  SEALED_PUBLIC_PATH_CERTIFICATION_BAR,
  computeCertificationBarDigest,
  computeWilsonConfidenceInterval,
  evaluateScaleAndFailureCertification,
  evaluateWorkloadRepresentativeness,
  validateCertificationBar,
} from '../../../../src/service/index.js';
import {
  WasiComponentCellRuntime,
} from '../../../../src/runtime/wasi-component-cell-runtime.js';
import {
  WasiComponentCellPressureTracker,
} from '../../../../src/runtime/wasi-component-cell-pressure-tracker.js';
import {
  toCellBatch,
} from '../../../../src/runtime/call-cell-value-mapping.js';
import {
  PILOT_CERTIFICATION_SCENARIO_MATRIX,
  listPilotCertificationScenarioEntries,
} from '../scenario-registry.js';
import {
  SCENARIO_NAME,
  buildDefaultFailureDrill,
  buildDefaultRepresentativeness,
  buildScaleAndFailureCertificationEvidence,
  run as runScaleAndFailureCertificationScenario,
} from '../../scenarios/public-path-scale-and-failure-certification.js';
import {
  DATASET_GENERATOR,
  expectedAccountSummary,
  generateDatasetRows,
} from '../../scenarios/public-path-baseline-helpers.js';
import {SPREAD_UNIT} from '../scenario-host-topology.js';

const arrayFlatMap = Function.call.bind(Array.prototype.flatMap);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);

const CANONICAL_WIT_DIRECTORY = new URL('../../../../wit', import.meta.url);
const DISABLED_ENGINE_FEATURES = [
  'random',
  'stdio',
  'clocks',
  'http',
  'fetch-event',
];
const CALL_WORLD_NAME = 'call-cell';
const SERVICE_WORLD_NAME = 'service-cell';
const REQUEST_WORLD_NAME = 'request-cell';
const EXPORT_RUN = 'run';
const EXPORT_HANDLE_REQUEST = 'handle-request';

const DEFAULT_CELL_BUDGETS = Object.freeze({
  context_bytes: 1024,
  cpu_time_ms: 60000,
  input_bytes: 1048576,
  memory_bytes: 512 * 1024 * 1024,
  output_bytes: 1048576,
  wall_time_ms: 300000,
});

const BATCH_ROWS = Object.freeze([
  Object.freeze({id: 1, label: null, score: 4.5}),
  Object.freeze({id: 2, label: null, score: 3.5}),
  Object.freeze({id: 3, label: null, score: 4.9}),
]);

let cachedCallComponent = null;
let cachedServiceComponent = null;

async function getCallComponentBytes() {
  if (cachedCallComponent !== null) {
    return cachedCallComponent;
  }
  const guestSource = await readFile(
    new URL(
      '../../../wasm-service/fixtures/call-cell-world/guest.js',
      import.meta.url,
    ),
    'utf8',
  );
  const {component} = await componentize(guestSource, {
    disableFeatures: DISABLED_ENGINE_FEATURES,
    witPath: CANONICAL_WIT_DIRECTORY.pathname,
    worldName: CALL_WORLD_NAME,
  });
  cachedCallComponent = new Uint8Array(component);
  return cachedCallComponent;
}

async function getServiceComponentBytes() {
  if (cachedServiceComponent !== null) {
    return cachedServiceComponent;
  }
  const guestSource = await readFile(
    new URL(
      '../../../wasm-service/fixtures/service-cell-world/guest.js',
      import.meta.url,
    ),
    'utf8',
  );
  const {component} = await componentize(guestSource, {
    disableFeatures: DISABLED_ENGINE_FEATURES,
    witPath: CANONICAL_WIT_DIRECTORY.pathname,
    worldName: SERVICE_WORLD_NAME,
  });
  cachedServiceComponent = new Uint8Array(component);
  return cachedServiceComponent;
}

test('Q11: sealed certification bar digest validates and rejects mutations', () => {
  assert.equal(PUBLIC_PATH_CERTIFICATION_SCHEMA_VERSION, 1);
  assert.equal(REQUIRED_CERTIFICATION_DIMENSIONS.length, 10);
  assert.equal(REQUIRED_REPRESENTATIVENESS_AXES.length, 7);
  assert.equal(
    REPRESENTATIVENESS_AXIS.TYPED_SELECTOR_NARROWING,
    'typedSelectorNarrowing',
  );
  assert.equal(
    CERTIFICATION_NON_TERMINAL_REASON.BAR_DIGEST_MISMATCH,
    'CERTIFICATION_BAR_DIGEST_MISMATCH',
  );

  const sealedDigest = computeCertificationBarDigest(
    SEALED_PUBLIC_PATH_CERTIFICATION_BAR,
  );
  assert.equal(
    sealedDigest,
    SEALED_PUBLIC_PATH_CERTIFICATION_BAR.barDigest,
  );

  const validResult = validateCertificationBar(
    SEALED_PUBLIC_PATH_CERTIFICATION_BAR,
  );
  assert.equal(validResult.valid, true);
  assert.equal(validResult.reasonCode, null);

  const mutatedBar = {
    ...SEALED_PUBLIC_PATH_CERTIFICATION_BAR,
    dimensions: {
      ...SEALED_PUBLIC_PATH_CERTIFICATION_BAR.dimensions,
      [DIMENSION_NAME.P95_LATENCY_MS]: {
        direction: 'max',
        threshold: 999999,
        unit: 'ms',
      },
    },
  };
  const mutatedValidation = validateCertificationBar(
    mutatedBar,
    SEALED_PUBLIC_PATH_CERTIFICATION_BAR.barDigest,
  );
  assert.equal(mutatedValidation.valid, false);
  assert.equal(
    mutatedValidation.reasonCode,
    CERTIFICATION_NON_TERMINAL_REASON.BAR_DIGEST_MISMATCH,
  );

  const evalResult = buildScaleAndFailureCertificationEvidence({
    barDefinition: mutatedBar,
  });
  assert.equal(
    evalResult.certification.overallVerdict,
    CERTIFICATION_VERDICT.NON_TERMINAL,
  );
  assert.equal(
    arrayIncludes(
      evalResult.certification.nonTerminalReasons,
      CERTIFICATION_NON_TERMINAL_REASON.BAR_DIGEST_MISMATCH,
    ),
    true,
  );
});

test('Q11: D12 non-terminal invalidation conditions produce NON_TERMINAL verdicts', () => {
  const nativeJsEvidence = buildScaleAndFailureCertificationEvidence({
    fidelity: {
      cells: [
        {
          cellId: 'account-summary-request',
          digest: 'sha256:bad',
          mediaType: 'application/javascript',
          runtimeKind: 'native_js',
        },
      ],
    },
  });
  assert.equal(
    nativeJsEvidence.certification.overallVerdict,
    CERTIFICATION_VERDICT.NON_TERMINAL,
  );
  assert.equal(
    arrayIncludes(
      nativeJsEvidence.certification.nonTerminalReasons,
      CERTIFICATION_NON_TERMINAL_REASON.NATIVE_JS_SUBSTITUTION,
    ),
    true,
  );

  const syntheticEvidence = buildScaleAndFailureCertificationEvidence({
    fidelityMode: 'synthetic',
  });
  assert.equal(
    syntheticEvidence.certification.overallVerdict,
    CERTIFICATION_VERDICT.NON_TERMINAL,
  );
  assert.equal(
    arrayIncludes(
      syntheticEvidence.certification.nonTerminalReasons,
      CERTIFICATION_NON_TERMINAL_REASON.SYNTHETIC_OR_NON_LIVE_METRICS,
    ),
    true,
  );

  const singleHostEvidence = buildScaleAndFailureCertificationEvidence({
    localReadProof: {
      distinctNodesWithLocalReads: 1,
      perNode: [],
      spreadUnit: 'node',
    },
  });
  assert.equal(
    singleHostEvidence.certification.overallVerdict,
    CERTIFICATION_VERDICT.NON_TERMINAL,
  );
  assert.equal(
    arrayIncludes(
      singleHostEvidence.certification.nonTerminalReasons,
      CERTIFICATION_NON_TERMINAL_REASON.INSUFFICIENT_PARTITION_HOST_SPREAD,
    ),
    true,
  );

  const selfRefOracleEvidence = buildScaleAndFailureCertificationEvidence({
    parity: {
      checkedAccounts: 5,
      mismatches: [],
      oracle: 'independent-recompute',
      selfReferential: true,
    },
  });
  assert.equal(
    selfRefOracleEvidence.certification.overallVerdict,
    CERTIFICATION_VERDICT.NON_TERMINAL,
  );
  assert.equal(
    arrayIncludes(
      selfRefOracleEvidence.certification.nonTerminalReasons,
      CERTIFICATION_NON_TERMINAL_REASON.MISSING_INDEPENDENT_PARITY_ORACLE,
    ),
    true,
  );

  const missingDrillEvidence = buildScaleAndFailureCertificationEvidence({
    failureDrill: {
      executed: false,
      nonSeedNodeKilled: false,
    },
  });
  assert.equal(
    missingDrillEvidence.certification.overallVerdict,
    CERTIFICATION_VERDICT.NON_TERMINAL,
  );
  assert.equal(
    arrayIncludes(
      missingDrillEvidence.certification.nonTerminalReasons,
      CERTIFICATION_NON_TERMINAL_REASON.MISSING_FAILURE_DRILL,
    ),
    true,
  );

  for (const axis of REQUIRED_REPRESENTATIVENESS_AXES) {
    const partialAxes = {
      ...buildDefaultRepresentativeness(),
      [axis]: false,
    };
    const repCheck = evaluateWorkloadRepresentativeness(partialAxes);
    assert.equal(repCheck.valid, false);
    assert.equal(arrayIncludes(repCheck.missingAxes, axis), true);
    const axisEvidence = buildScaleAndFailureCertificationEvidence({
      representativeness: partialAxes,
    });
    assert.equal(
      axisEvidence.certification.overallVerdict,
      CERTIFICATION_VERDICT.NON_TERMINAL,
    );
    assert.equal(
      arrayIncludes(
        axisEvidence.certification.nonTerminalReasons,
        CERTIFICATION_NON_TERMINAL_REASON.MISSING_REPRESENTATIVENESS_AXIS,
      ),
      true,
    );
  }

  const missingDimResult = evaluateScaleAndFailureCertification({
    failureDrill: buildDefaultFailureDrill(),
    metrics: {
      [DIMENSION_NAME.P95_LATENCY_MS]: null,
    },
    reportDetail: buildScaleAndFailureCertificationEvidence(),
    representativeness: buildDefaultRepresentativeness(),
  });
  assert.equal(
    missingDimResult.overallVerdict,
    CERTIFICATION_VERDICT.NON_TERMINAL,
  );
  assert.equal(
    arrayIncludes(
      missingDimResult.nonTerminalReasons,
      CERTIFICATION_NON_TERMINAL_REASON.MISSING_REQUIRED_DIMENSION,
    ),
    true,
  );
});

test('Q11: terminal FAIL vs PASS and faithful neutralOrNegativeFindings reporting', () => {
  const ci = computeWilsonConfidenceInterval(19, 20);
  assert.ok(ci.lower > 0.7 && ci.upper <= 1);
  assert.equal(ci.sampleSize, 20);
  assert.equal(ci.successes, 19);

  const failEvidence = buildScaleAndFailureCertificationEvidence({
    metrics: {
      [DIMENSION_NAME.P99_LATENCY_MS]: 12_000,
      [DIMENSION_NAME.ERROR_RATE]: 0.2,
    },
  });
  assert.equal(
    failEvidence.certification.overallVerdict,
    CERTIFICATION_VERDICT.FAIL,
  );
  assert.equal(
    arrayIncludes(
      failEvidence.certification.failedDimensions,
      DIMENSION_NAME.P99_LATENCY_MS,
    ),
    true,
  );
  assert.equal(
    arrayIncludes(
      failEvidence.certification.failedDimensions,
      DIMENSION_NAME.ERROR_RATE,
    ),
    true,
  );

  const baselineWinsEvidence = buildScaleAndFailureCertificationEvidence({
    baselineMetrics: {
      [DIMENSION_NAME.CPU_PERCENT]: 10,
      [DIMENSION_NAME.ERROR_RATE]: 0,
      [DIMENSION_NAME.MEMORY_BYTES]: 33_554_432,
      [DIMENSION_NAME.NODE_LOSS_AVAILABILITY]: 1,
      [DIMENSION_NAME.P95_LATENCY_MS]: 5,
      [DIMENSION_NAME.P99_LATENCY_MS]: 8,
      [DIMENSION_NAME.RECOVERY_TIME_MS]: 500,
      [DIMENSION_NAME.RETRY_RATE]: 0,
      [DIMENSION_NAME.THROUGHPUT_OPS_PER_SEC]: 200,
      [DIMENSION_NAME.TRANSFERRED_BYTES]: 1024,
    },
  });
  assert.equal(
    baselineWinsEvidence.certification.overallVerdict,
    CERTIFICATION_VERDICT.PASS,
  );
  assert.ok(
    baselineWinsEvidence.certification.neutralOrNegativeFindings.length > 0,
    'candidate metrics worse than or equal to baseline must be recorded',
  );
  const p95Finding =
    baselineWinsEvidence.certification.baselineComparison[
      DIMENSION_NAME.P95_LATENCY_MS
    ];
  assert.equal(p95Finding.outcome, COMPARISON_OUTCOME.NEGATIVE);
  assert.ok(p95Finding.delta > 0);
});

test('Q11 RT1: busy-within-deadline health() survives and concurrent invoke refuses', async () => {
  const runtime = new WasiComponentCellRuntime();
  const fakeServiceId = 'rt1-busy-cell';
  let postMessageCount = 0;
  let terminateCount = 0;
  const fakeWorker = {
    off() {},
    on() {},
    postMessage() {
      postMessageCount += 1;
    },
    terminate() {
      terminateCount += 1;
      return Promise.resolve(0);
    },
  };
  const nowMs = Date.now();
  runtime.cells.set(fakeServiceId, {
    activeDeadlineMs: nowMs + 30_000,
    busy: true,
    busySinceMs: nowMs,
    cell: {
      budgets: DEFAULT_CELL_BUDGETS,
      resources: DEFAULT_CELL_BUDGETS,
      serviceId: fakeServiceId,
    },
    pending: new Map(),
    ready: true,
    worker: fakeWorker,
  });

  const healthyWhileBusy = await runtime.health(fakeServiceId);
  assert.equal(healthyWhileBusy, true);
  assert.equal(
    postMessageCount,
    0,
    'health() must not send PING while worker is busy within its deadline',
  );
  assert.equal(terminateCount, 0);

  await assert.rejects(
    () => runtime.invoke(
      fakeServiceId,
      ['{}'],
      () => [],
      () => {},
    ),
    (error) => error?.code === 'request_cell_concurrent_invocation',
  );

  const cellState = runtime.cells.get(fakeServiceId);
  cellState.activeDeadlineMs = Date.now() - 10;
  const healthyPastDeadline = await runtime.health(fakeServiceId);
  assert.equal(healthyPastDeadline, false);
  assert.equal(terminateCount, 1);
  assert.equal(runtime.cells.has(fakeServiceId), false);
});

test('Q11 RT2: pre-retention worker byte bounds and aggregate runtime pressure cap', async () => {
  const tracker = new WasiComponentCellPressureTracker({
    maxAggregateEmitBufferBytes: 2048,
  });
  const leaseA = tracker.acquireEmitBuffer(1024);
  const leaseB = tracker.acquireEmitBuffer(1024);
  assert.equal(tracker.getTelemetry().activeEmitBufferBytes, 2048);
  assert.equal(tracker.getTelemetry().activeEmitBuffers, 2);
  assert.throws(
    () => tracker.acquireEmitBuffer(512),
    (error) => error?.code === 'request_cell_runtime_memory_pressure_exceeded',
  );
  assert.equal(tracker.getTelemetry().rejectedAllocations, 1);
  tracker.releaseEmitBuffer(leaseA);
  tracker.releaseEmitBuffer(leaseB);
  assert.equal(tracker.getTelemetry().activeEmitBufferBytes, 0);
  assert.equal(tracker.getTelemetry().activeEmitBuffers, 0);

  const callComponentBytes = await getCallComponentBytes();
  const cappedRuntime = new WasiComponentCellRuntime({
    maxAggregateEmitBufferBytes: 128,
  });
  const callCell = {
    budgets: DEFAULT_CELL_BUDGETS,
    bytes: callComponentBytes,
    capabilities: [],
    exportName: EXPORT_RUN,
    serviceId: 'rt2-capped-call-cell',
    world: CALL_WORLD_NAME,
  };
  await cappedRuntime.start(callCell);
  try {
    const batch = toCellBatch(BATCH_ROWS, BATCH_ROWS.length);
    await assert.rejects(
      () => cappedRuntime.invokeCall(
        callCell.serviceId,
        [batch, JSON.stringify({topN: 3})],
        {
          callContext: {
            emitBudget: 3,
            emitBufferBytes: 512,
            nestedCallBudget: 1,
          },
          exportName: EXPORT_RUN,
        },
      ),
      (error) =>
        error?.code === 'request_cell_runtime_memory_pressure_exceeded',
    );
    const pressureAfterReject = cappedRuntime.getRuntimePressureTelemetry();
    assert.equal(pressureAfterReject.activeEmitBufferBytes, 0);
    assert.equal(pressureAfterReject.rejectedAllocations, 1);
  } finally {
    await cappedRuntime.shutdown();
  }

  const emitOverflowRuntime = new WasiComponentCellRuntime();
  const emitOverflowCell = {
    budgets: DEFAULT_CELL_BUDGETS,
    bytes: callComponentBytes,
    capabilities: [],
    exportName: EXPORT_RUN,
    serviceId: 'rt2-emit-overflow-cell',
    world: CALL_WORLD_NAME,
  };
  await emitOverflowRuntime.start(emitOverflowCell);
  try {
    const batch = toCellBatch(BATCH_ROWS, BATCH_ROWS.length);
    await assert.rejects(
      () => emitOverflowRuntime.invokeCall(
        emitOverflowCell.serviceId,
        [batch, JSON.stringify({topN: 3})],
        {
          callContext: {
            emitBudget: 3,
            maxEmitPayloadBytes: 8,
            nestedCallBudget: 1,
          },
          exportName: EXPORT_RUN,
        },
      ),
      (error) => error?.code === 'request_cell_emit_buffer_overflow',
    );
    assert.equal(
      emitOverflowRuntime.getRuntimePressureTelemetry().activeEmitBufferBytes,
      0,
    );
  } finally {
    await emitOverflowRuntime.shutdown();
  }

  const serviceComponentBytes = await getServiceComponentBytes();
  const contextBudgetRuntime = new WasiComponentCellRuntime();
  const tinyContextCell = {
    budgets: {
      ...DEFAULT_CELL_BUDGETS,
      context_bytes: 16,
    },
    bytes: serviceComponentBytes,
    capabilities: [0],
    exportName: EXPORT_HANDLE_REQUEST,
    serviceId: 'rt2-tiny-context-cell',
    tables: [{context: 'orders', read: true, slot: 0, write: true}],
    world: REQUEST_WORLD_NAME,
  };
  await contextBudgetRuntime.start(tinyContextCell);
  try {
    await assert.rejects(
      () => contextBudgetRuntime.invoke(
        tinyContextCell.serviceId,
        [JSON.stringify({amount: 42, key: 2, probe: 'context-io'})],
        () => [],
        () => {},
        () => {},
        {
          tables: [{context: 'orders', read: true, slot: 0, write: true}],
        },
      ),
      (error) => error?.code === 'request_cell_context_budget_exceeded',
    );
  } finally {
    await contextBudgetRuntime.shutdown();
  }
});

function createLiveCertificationClusterHarness(overrides = {}) {
  const nodes = [
    {id: 'node-1', role: 'seed'},
    {id: 'node-2', role: 'member'},
    {id: 'node-3', role: 'member'},
    {id: 'node-4', role: 'member'},
    {id: 'node-5', role: 'member'},
  ];
  const rows = generateDatasetRows();
  const trace = {
    drillExecuted: false,
    snapshotsAfterCollected: false,
    snapshotsBeforeCollected: false,
    workloadExecuted: false,
  };
  const partitions = [
    {leaderNodeId: 'node-1', partitionId: 'p1'},
    {leaderNodeId: 'node-2', partitionId: 'p2'},
  ];
  const cluster = {
    getNodes: () => nodes,
    collectNodeResourceSnapshots: async ({phase}) => {
      if (phase === 'before') {
        trace.snapshotsBeforeCollected = true;
        return new Map(arrayMap(nodes, (node) => [node.id, {
          cpuPercent: 18,
          memoryUsageBytes: 60_000_000,
          rxBytes: 2048,
          txBytes: 2048,
        }]));
      }
      trace.snapshotsAfterCollected = true;
      return new Map(arrayMap(nodes, (node) => [node.id, {
        cpuPercent: 24,
        memoryUsageBytes: 64_000_000,
        rxBytes: 12_288,
        txBytes: 10_240,
      }]));
    },
    executePublicPathWorkload: async () => {
      trace.workloadExecuted = true;
      const invocations = arrayMap(
        DATASET_GENERATOR.accountIds,
        (accountId, idx) => ({
          accountId,
          body: expectedAccountSummary(rows, accountId, partitions.length),
          bytes: 256,
          durationMs: 14 + idx,
          status: 200,
        }),
      );
      const logEntries = arrayFlatMap(invocations, () => [
        {
          message: 'metrics.partition.sqlite',
          metadata: JSON.stringify({
            operation: 'SELECT',
            partitionId: 'p1',
            rowCount: 40,
          }),
          nodeId: 'node-1',
        },
        {
          message: 'metrics.partition.sqlite',
          metadata: JSON.stringify({
            operation: 'SELECT',
            partitionId: 'p2',
            rowCount: 40,
          }),
          nodeId: 'node-2',
        },
      ]);
      return {
        fidelity: {
          buildDigest: 'sha256:live-certified-account-summary',
          manifestDigest: 'sha256:live-certified-account-summary',
          mediaType: 'application/wasm',
          runtimeKind: 'wasm_component',
        },
        invocations,
        logEntries,
        mode: 'live',
        partialBytes: 512 * invocations.length,
        representativeness: buildDefaultRepresentativeness(),
        rows,
        sentinelRowCount: 4,
        topology: {
          distinctPartitionHosts: 2,
          partitions,
          spreadUnit: SPREAD_UNIT.HOST,
        },
      };
    },
    executeNonSeedFailureDrill: async ({nonSeedNode}) => {
      trace.drillExecuted = true;
      return {
        availabilityRatio: 1,
        executed: true,
        killedNodeId: nonSeedNode.id,
        lostAcknowledgedWrites: 0,
        nonSeedNodeKilled: true,
        probesSucceeded: 20,
        probesTotal: 20,
        recoveryTimeMs: 950,
      };
    },
    ...overrides,
  };
  return {cluster, trace};
}

test('Q11: run(cluster) rejects null or stub without live execution hooks as NON_TERMINAL',
  async () => {
    await assert.rejects(
      () => runScaleAndFailureCertificationScenario(null),
      (error) => {
        assert.equal(
          error.certification.overallVerdict,
          CERTIFICATION_VERDICT.NON_TERMINAL,
        );
        assert.equal(
          arrayIncludes(
            error.certification.nonTerminalReasons,
            CERTIFICATION_NON_TERMINAL_REASON.SYNTHETIC_OR_NON_LIVE_METRICS,
          ),
          true,
        );
        assert.equal(
          arrayIncludes(
            error.certification.nonTerminalReasons,
            CERTIFICATION_NON_TERMINAL_REASON.MISSING_FAILURE_DRILL,
          ),
          true,
        );
        return true;
      },
    );

    const stubOnlyGetNodes = {
      getNodes() {
        return [
          {id: 'node-1', role: 'seed'},
          {id: 'node-2', role: 'member'},
          {id: 'node-3', role: 'member'},
          {id: 'node-4', role: 'member'},
          {id: 'node-5', role: 'member'},
        ];
      },
    };
    await assert.rejects(
      () => runScaleAndFailureCertificationScenario(stubOnlyGetNodes),
      (error) => {
        assert.equal(
          error.certification.overallVerdict,
          CERTIFICATION_VERDICT.NON_TERMINAL,
        );
        assert.equal(
          arrayIncludes(
            error.certification.nonTerminalReasons,
            CERTIFICATION_NON_TERMINAL_REASON.SYNTHETIC_OR_NON_LIVE_METRICS,
          ),
          true,
        );
        assert.equal(
          arrayIncludes(
            error.certification.nonTerminalReasons,
            CERTIFICATION_NON_TERMINAL_REASON.MISSING_FAILURE_DRILL,
          ),
          true,
        );
        return true;
      },
    );
  },
);

test('Q11: run(cluster) rejects when failure drill or telemetry is missing or synthetic',
  async () => {
    const missingDrill = createLiveCertificationClusterHarness();
    delete missingDrill.cluster.executeNonSeedFailureDrill;
    await assert.rejects(
      () => runScaleAndFailureCertificationScenario(missingDrill.cluster),
      (error) => {
        assert.equal(
          error.certification.overallVerdict,
          CERTIFICATION_VERDICT.NON_TERMINAL,
        );
        assert.equal(
          arrayIncludes(
            error.certification.nonTerminalReasons,
            CERTIFICATION_NON_TERMINAL_REASON.MISSING_FAILURE_DRILL,
          ),
          true,
        );
        return true;
      },
    );

    const missingTelemetry = createLiveCertificationClusterHarness();
    delete missingTelemetry.cluster.collectNodeResourceSnapshots;
    await assert.rejects(
      () => runScaleAndFailureCertificationScenario(missingTelemetry.cluster),
      (error) => {
        assert.equal(
          error.certification.overallVerdict,
          CERTIFICATION_VERDICT.NON_TERMINAL,
        );
        assert.equal(
          arrayIncludes(
            error.certification.nonTerminalReasons,
            CERTIFICATION_NON_TERMINAL_REASON.SYNTHETIC_OR_NON_LIVE_METRICS,
          ),
          true,
        );
        return true;
      },
    );

    const syntheticWorkload = createLiveCertificationClusterHarness({
      executePublicPathWorkload: async () => {
        const base = await createLiveCertificationClusterHarness()
          .cluster.executePublicPathWorkload();
        return {...base, mode: 'synthetic'};
      },
    });
    await assert.rejects(
      () => runScaleAndFailureCertificationScenario(syntheticWorkload.cluster),
      (error) => {
        assert.equal(
          error.certification.overallVerdict,
          CERTIFICATION_VERDICT.NON_TERMINAL,
        );
        assert.equal(
          arrayIncludes(
            error.certification.nonTerminalReasons,
            CERTIFICATION_NON_TERMINAL_REASON.SYNTHETIC_OR_NON_LIVE_METRICS,
          ),
          true,
        );
        return true;
      },
    );

    const unexecutedDrill = createLiveCertificationClusterHarness({
      executeNonSeedFailureDrill: async () => ({
        executed: false,
        nonSeedNodeKilled: false,
      }),
    });
    await assert.rejects(
      () => runScaleAndFailureCertificationScenario(unexecutedDrill.cluster),
      (error) => {
        assert.equal(
          error.certification.overallVerdict,
          CERTIFICATION_VERDICT.NON_TERMINAL,
        );
        assert.equal(
          arrayIncludes(
            error.certification.nonTerminalReasons,
            CERTIFICATION_NON_TERMINAL_REASON.MISSING_FAILURE_DRILL,
          ),
          true,
        );
        return true;
      },
    );
  },
);

test('Q11: full certification scenario executes all 7 representativeness axes and passes',
  async () => {
    const registered = listPilotCertificationScenarioEntries();
    assert.equal(
      arraySome(
        PILOT_CERTIFICATION_SCENARIO_MATRIX,
        (entry) => entry.name === SCENARIO_NAME,
      ),
      true,
    );
    assert.equal(
      arraySome(registered, (entry) => entry.name === SCENARIO_NAME),
      true,
    );

    const {cluster, trace} = createLiveCertificationClusterHarness();
    const report = await runScaleAndFailureCertificationScenario(cluster);
    assert.equal(trace.workloadExecuted, true);
    assert.equal(trace.drillExecuted, true);
    assert.equal(trace.snapshotsBeforeCollected, true);
    assert.equal(trace.snapshotsAfterCollected, true);
    assert.equal(report.schemaVersion, 2);
    assert.equal(
      report.certification.schemaVersion,
      PUBLIC_PATH_CERTIFICATION_SCHEMA_VERSION,
    );
    assert.equal(
      report.certification.overallVerdict,
      CERTIFICATION_VERDICT.PASS,
    );
    assert.equal(report.certification.nonTerminalReasons.length, 0);
    assert.equal(report.certification.failedDimensions.length, 0);
    assert.equal(report.certification.representativeness.valid, true);
    assert.equal(report.certification.failureDrill.executed, true);
    assert.equal(report.certification.failureDrill.nonSeedNodeKilled, true);
    assert.equal(report.certification.failureDrill.lostAcknowledgedWrites, 0);
    assert.equal(
      report.certification.rt2PressureProof.busyWithinDeadlineHealthSurvival,
      true,
    );
    assert.equal(
      report.certification.rt2PressureProof.aggregateEmitBufferCapEnforced,
      true,
    );
  },
);
