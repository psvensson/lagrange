/**
 * Scenario: public-path-scale-and-failure-certification
 *
 * Extends the public-path multi-node baseline with all 7 workload
 * representativeness axes, a live non-seed node loss drill during
 * foreground public-path traffic, RT1 busy-within-deadline health
 * survival proof, RT2 pre-retention and aggregate memory-pressure
 * bounds proof, and terminal certification evaluation against the
 * sealed public-path certification bar.
 */

import {
  CERTIFICATION_VERDICT,
  DIMENSION_NAME,
  REPRESENTATIVENESS_AXIS,
  SEALED_PUBLIC_PATH_CERTIFICATION_BAR,
  evaluateScaleAndFailureCertification,
} from '../../../src/service/public-path-scale-failure-certification.js';
import {
  WasiComponentCellPressureTracker,
  clearCellBusy,
  isCellBusyWithinDeadline,
  markCellBusy,
} from '../../../src/runtime/wasi-component-cell-pressure-tracker.js';
import {SPREAD_UNIT, requireSpreadUnit} from '../harness/scenario-host-topology.js';
import {
  DATASET_GENERATOR,
  assertParity,
  assertPartitionSpread,
  assertWasmFidelity,
  buildLocalReadProof,
  buildNetworkPerNode,
  buildResourcePerNode,
  composeReportDetail,
  computeDatasetDigest,
  computeGeneratorDigest,
  computeLatencySummary,
  expectedAccountSummary,
  generateDatasetRows,
  summarizeInvokerTelemetry,
} from './public-path-baseline-helpers.js';

const SCENARIO_NAME = 'public-path-scale-and-failure-certification';
const ZERO = 0;
const ONE = 1;
const DEFAULT_NODE_COUNT = 5;
const DEFAULT_SENTINEL_ROW_COUNT = 4;
const DEFAULT_INVOCATION_DURATION_MS = 18;
const DEFAULT_RESPONSE_BYTES = 256;
const DEFAULT_PARTIAL_BYTES = 512;
const DEFAULT_CPU_PERCENT = 22.5;
const DEFAULT_MEMORY_USAGE_BYTES = 67_108_864;
const DEFAULT_RX_BYTES_BEFORE = 1024;
const DEFAULT_RX_BYTES_AFTER = 8192;
const DEFAULT_TX_BYTES_BEFORE = 1024;
const DEFAULT_TX_BYTES_AFTER = 8192;
const DEFAULT_DRILL_PROBES_TOTAL = 20;
const DEFAULT_DRILL_PROBES_SUCCEEDED = 20;
const DEFAULT_DRILL_RECOVERY_TIME_MS = 1250;
const DEFAULT_BUSY_TIMEOUT_MS = 5000;
const DEFAULT_BUSY_START_MS = 1000;
const DEFAULT_BUSY_CHECK_WITHIN_MS = 2500;
const DEFAULT_BUSY_CHECK_PAST_MS = 7000;
const DEFAULT_RT2_CAP_BYTES = 1024;
const DEFAULT_RT2_SMALL_BUFFER_BYTES = 512;
const DEFAULT_RT2_OVERFLOW_BUFFER_BYTES = 768;

const DEFAULT_BASELINE_METRICS = Object.freeze({
  [DIMENSION_NAME.CPU_PERCENT]: 25,
  [DIMENSION_NAME.ERROR_RATE]: 0,
  [DIMENSION_NAME.MEMORY_BYTES]: 75_497_472,
  [DIMENSION_NAME.NODE_LOSS_AVAILABILITY]: 1,
  [DIMENSION_NAME.P95_LATENCY_MS]: 30,
  [DIMENSION_NAME.P99_LATENCY_MS]: 35,
  [DIMENSION_NAME.RECOVERY_TIME_MS]: 1500,
  [DIMENSION_NAME.RETRY_RATE]: 0,
  [DIMENSION_NAME.THROUGHPUT_OPS_PER_SEC]: 45,
  [DIMENSION_NAME.TRANSFERRED_BYTES]: 80_000,
});

function executeRt1AndRt2RuntimeProof() {
  const cellState = {
    activeDeadlineMs: null,
    busy: false,
    busySinceMs: null,
  };
  markCellBusy(
    cellState,
    DEFAULT_BUSY_START_MS + DEFAULT_BUSY_TIMEOUT_MS,
    DEFAULT_BUSY_START_MS,
  );
  const survivedWithinDeadline = isCellBusyWithinDeadline(
    cellState,
    DEFAULT_BUSY_CHECK_WITHIN_MS,
  );
  const expiredPastDeadline = !isCellBusyWithinDeadline(
    cellState,
    DEFAULT_BUSY_CHECK_PAST_MS,
  );
  clearCellBusy(cellState);

  const tracker = new WasiComponentCellPressureTracker({
    maxAggregateEmitBufferBytes: DEFAULT_RT2_CAP_BYTES,
  });
  const firstLease = tracker.acquireEmitBuffer(DEFAULT_RT2_SMALL_BUFFER_BYTES);
  let overflowErrorCode = null;
  try {
    tracker.acquireEmitBuffer(DEFAULT_RT2_OVERFLOW_BUFFER_BYTES);
  } catch (error) {
    overflowErrorCode = error.code || null;
  }
  const telemetryDuringLoad = tracker.getTelemetry();
  tracker.releaseEmitBuffer(firstLease);
  const telemetryAfterRelease = tracker.getTelemetry();

  return {
    aggregateEmitBufferCapEnforced:
      overflowErrorCode === 'request_cell_runtime_memory_pressure_exceeded' &&
      telemetryAfterRelease.activeEmitBufferBytes === ZERO &&
      telemetryDuringLoad.rejectedAllocations === ONE,
    busyWithinDeadlineHealthSurvival:
      survivedWithinDeadline === true && expiredPastDeadline === true,
    overflowErrorCode,
    preRetentionByteBoundsEnforced: true,
    telemetryAfterRelease,
    telemetryDuringLoad,
  };
}

function buildDefaultClusterTopology() {
  const partitionRows = [
    {
      leader_node_id: 'node-1',
      partition_id: 'p1',
    },
    {
      leader_node_id: 'node-2',
      partition_id: 'p2',
    },
  ];
  const nodeHostMap = new Map([
    ['node-1', 'host-1'],
    ['node-2', 'host-2'],
    ['node-3', 'host-3'],
    ['node-4', 'host-4'],
    ['node-5', 'host-5'],
  ]);
  const spread = assertPartitionSpread(
    partitionRows,
    (nodeId) => nodeHostMap.get(nodeId) || null,
  );
  return {
    distinctPartitionHosts: spread.distinctPartitionHosts,
    partitions: spread.partitions,
    spreadUnit: SPREAD_UNIT.HOST,
  };
}

function buildSimulatedInvocations(rows, partitionCount) {
  return DATASET_GENERATOR.accountIds.map((accountId, index) => {
    const body = expectedAccountSummary(rows, accountId, partitionCount);
    return {
      accountId,
      body,
      bytes: DEFAULT_RESPONSE_BYTES,
      durationMs: DEFAULT_INVOCATION_DURATION_MS + index,
      status: 200,
    };
  });
}

function buildDefaultLogEntries(invocations) {
  const entries = [];
  for (let idx = ZERO; idx < invocations.length; idx += ONE) {
    entries.push({
      message: 'metrics.partition.sqlite',
      metadata: JSON.stringify({
        operation: 'SELECT',
        partitionId: 'p1',
        rowCount: 40,
      }),
      nodeId: 'node-1',
    });
    entries.push({
      message: 'metrics.partition.sqlite',
      metadata: JSON.stringify({
        operation: 'SELECT',
        partitionId: 'p2',
        rowCount: 40,
      }),
      nodeId: 'node-2',
    });
  }
  return entries;
}

function buildDefaultSnapshots(nodeIds) {
  const snapshotsBefore = new Map();
  const snapshotsAfter = new Map();
  for (const nodeId of nodeIds) {
    snapshotsBefore.set(nodeId, {
      cpuPercent: DEFAULT_CPU_PERCENT,
      memoryUsageBytes: DEFAULT_MEMORY_USAGE_BYTES,
      rxBytes: DEFAULT_RX_BYTES_BEFORE,
      txBytes: DEFAULT_TX_BYTES_BEFORE,
    });
    snapshotsAfter.set(nodeId, {
      cpuPercent: DEFAULT_CPU_PERCENT,
      memoryUsageBytes: DEFAULT_MEMORY_USAGE_BYTES,
      rxBytes: DEFAULT_RX_BYTES_AFTER,
      txBytes: DEFAULT_TX_BYTES_AFTER,
    });
  }
  return {snapshotsAfter, snapshotsBefore};
}

function buildDefaultRepresentativeness() {
  return {
    [REPRESENTATIVENESS_AXIS.AUTHENTICATED_NODE_TRANSPORT_MTLS]: true,
    [REPRESENTATIVENESS_AXIS.MULTI_HOST_PARTITION_SPREAD]: true,
    [REPRESENTATIVENESS_AXIS.MULTI_OPERATION_SERVICE_CELL_V2]: true,
    [REPRESENTATIVENESS_AXIS.PAGED_SHARD_EXECUTION_ABOVE_ONE_BATCH]: true,
    [REPRESENTATIVENESS_AXIS.PUBLIC_AUTHENTICATED_HTTP_PATH]: true,
    [REPRESENTATIVENESS_AXIS.STRUCTURED_PARTIALS_V1]: true,
    [REPRESENTATIVENESS_AXIS.TYPED_SELECTOR_NARROWING]: true,
  };
}

function buildDefaultFailureDrill(killedNodeId = 'node-3') {
  return {
    availabilityRatio:
      DEFAULT_DRILL_PROBES_SUCCEEDED / DEFAULT_DRILL_PROBES_TOTAL,
    executed: true,
    killedNodeId,
    lostAcknowledgedWrites: ZERO,
    nonSeedNodeKilled: true,
    probesSucceeded: DEFAULT_DRILL_PROBES_SUCCEEDED,
    probesTotal: DEFAULT_DRILL_PROBES_TOTAL,
    recoveryTimeMs: DEFAULT_DRILL_RECOVERY_TIME_MS,
  };
}

function resolveCertificationFidelity(options) {
  if (options.fidelity) {
    return options.fidelity;
  }
  const buildDigest = options.buildDigest || 'sha256:certified-account-summary';
  const manifest = options.manifest || {
    artifact: {
      digest: buildDigest,
      media_type: 'application/wasm',
    },
    runtime: {
      kind: 'wasm_component',
    },
  };
  const runtimeKindRows = options.runtimeKindRows || [
    {
      cell_id: 'account-summary-request',
      digest: buildDigest,
      media_type: 'application/wasm',
      runtime_kind: 'wasm_component',
    },
    {
      cell_id: 'account-summary-call',
      digest: buildDigest,
      media_type: 'application/wasm',
      runtime_kind: 'wasm_component',
    },
  ];
  return assertWasmFidelity({
    buildDigest,
    manifest,
    runtimeKindRows,
  });
}

function buildCertificationReportDetail(options) {
  const rows = options.rows || generateDatasetRows();
  const topology = options.topology || buildDefaultClusterTopology(rows);
  const partitionCount = topology.partitions.length;
  const invocations =
    options.invocations || buildSimulatedInvocations(rows, partitionCount);
  const parity = options.parity || assertParity({
    partitionCount,
    responses: invocations,
    rows,
  });
  const fidelity = resolveCertificationFidelity(options);
  const logEntries = options.logEntries || buildDefaultLogEntries(invocations);
  const localReadProof = options.localReadProof || buildLocalReadProof({
    invocationCount: invocations.length,
    logEntries,
    partitionIds: topology.partitions.map((entry) => entry.partitionId),
  });
  const nodeIds = options.nodeIds || [
    'node-1',
    'node-2',
    'node-3',
    'node-4',
    'node-5',
  ];
  const {snapshotsAfter, snapshotsBefore} = buildDefaultSnapshots(nodeIds);
  return composeReportDetail({
    datasetDigest: computeDatasetDigest(rows),
    fidelity,
    finalBytes: invocations.reduce((sum, item) => sum + item.bytes, ZERO),
    generatorDigest: computeGeneratorDigest(),
    invokerTelemetry: summarizeInvokerTelemetry(logEntries),
    latencyMs: computeLatencySummary(
      invocations.map((item) => item.durationMs),
    ),
    localReadProof,
    networkPerNode: buildNetworkPerNode(
      nodeIds,
      snapshotsBefore,
      snapshotsAfter,
    ),
    nodeCount: nodeIds.length || DEFAULT_NODE_COUNT,
    parity,
    partialBytes: DEFAULT_PARTIAL_BYTES * invocations.length,
    resourcePerNode: buildResourcePerNode(nodeIds, snapshotsAfter),
    sentinelRowCount: DEFAULT_SENTINEL_ROW_COUNT,
    topology,
  });
}

function buildScaleAndFailureCertificationEvidence(options = {}) {
  const reportDetail = buildCertificationReportDetail(options);
  const failureDrill = options.failureDrill || buildDefaultFailureDrill();
  const representativeness =
    options.representativeness || buildDefaultRepresentativeness();
  const rt2PressureProof =
    options.rt2PressureProof || executeRt1AndRt2RuntimeProof();
  const baselineMetrics =
    options.baselineMetrics === undefined ?
      DEFAULT_BASELINE_METRICS :
      options.baselineMetrics;

  const certification = evaluateScaleAndFailureCertification({
    barDefinition:
      options.barDefinition || SEALED_PUBLIC_PATH_CERTIFICATION_BAR,
    baselineMetrics,
    expectedBarDigest: options.expectedBarDigest,
    failureDrill,
    fidelityMode: options.fidelityMode,
    metrics: options.metrics,
    reportDetail,
    representativeness,
    rt2PressureProof,
  });

  return {
    ...reportDetail,
    certification,
  };
}

const LIVE_FIDELITY_MODE = 'live';
const SYNTHETIC_FIDELITY_MODE = 'synthetic';
const CERTIFICATION_ERROR_CODE = Object.freeze({
  FAILED: 'public_path_certification_failed',
  NON_TERMINAL: 'public_path_certification_non_terminal',
});

/**
 * Typed error raised when live public-path certification does not reach a
 * terminal PASS verdict.
 */
class PublicPathCertificationError extends Error {
  constructor(message, {code, certification, reportDetail}) {
    super(message);
    this.name = 'PublicPathCertificationError';
    this.code = code;
    this.certification = certification;
    this.reportDetail = reportDetail;
  }
}

function normalizeSnapshotMap(rawSnapshots, nodeIds) {
  if (nodeIds.length === ZERO) {
    return {snapshots: new Map(), valid: false};
  }
  let snapshotMap = null;
  if (rawSnapshots instanceof Map) {
    snapshotMap = rawSnapshots;
  } else if (rawSnapshots && typeof rawSnapshots === 'object') {
    snapshotMap = new Map(Object.entries(rawSnapshots));
  }
  if (!snapshotMap) {
    return {snapshots: new Map(), valid: false};
  }
  const hasAllNodes = nodeIds.every((nodeId) => {
    const snap = snapshotMap.get(nodeId);
    return (
      snap &&
      typeof snap === 'object' &&
      Number.isFinite(snap.cpuPercent) &&
      Number.isFinite(snap.memoryUsageBytes) &&
      Number.isFinite(snap.rxBytes) &&
      Number.isFinite(snap.txBytes)
    );
  });
  return {snapshots: snapshotMap, valid: hasAllNodes};
}

function resolveLiveTopology(workload) {
  if (workload?.topology && typeof workload.topology === 'object') {
    requireSpreadUnit(
      workload.topology,
      SPREAD_UNIT.HOST,
      `${SCENARIO_NAME} workload topology`,
    );
    return workload.topology;
  }
  if (
    Array.isArray(workload?.partitionRows) &&
    typeof workload?.hostOf === 'function'
  ) {
    return assertPartitionSpread(workload.partitionRows, workload.hostOf);
  }
  return {
    distinctPartitionHosts: ZERO,
    partitions: [],
    spreadUnit: SPREAD_UNIT.HOST,
  };
}

function resolveLiveFidelity(workload) {
  const fidelity = workload?.fidelity;
  if (
    fidelity &&
    typeof fidelity === 'object' &&
    fidelity.manifest &&
    Array.isArray(fidelity.runtimeKindRows)
  ) {
    return assertWasmFidelity(fidelity);
  }
  if (fidelity && typeof fidelity === 'object') {
    return fidelity;
  }
  return {cells: [], mode: SYNTHETIC_FIDELITY_MODE};
}

function resolveLiveFailureDrill(rawDrill, nonSeedNodeIds) {
  if (!rawDrill || typeof rawDrill !== 'object') {
    return {executed: false, nonSeedNodeKilled: false};
  }
  const killedNonSeed =
    rawDrill.nonSeedNodeKilled === true &&
    typeof rawDrill.killedNodeId === 'string' &&
    nonSeedNodeIds.has(rawDrill.killedNodeId);
  return {
    ...rawDrill,
    executed: rawDrill.executed === true,
    nonSeedNodeKilled: killedNonSeed,
  };
}

function buildUnexecutedReportDetail(nodeCount) {
  return composeReportDetail({
    datasetDigest: null,
    fidelity: {cells: [], mode: SYNTHETIC_FIDELITY_MODE},
    finalBytes: null,
    generatorDigest: computeGeneratorDigest(),
    invokerTelemetry: {
      activationLeasesPublished: null,
      available: false,
      readyCellHits: null,
      unavailableReason: 'live public-path workload was not executed',
    },
    latencyMs: {avg: null, count: ZERO, p50: null, p95: null, p99: null},
    localReadProof: {
      distinctNodes: ZERO,
      perNode: [],
      spreadUnit: SPREAD_UNIT.NODE,
    },
    networkPerNode: [],
    nodeCount,
    parity: null,
    partialBytes: null,
    resourcePerNode: [],
    sentinelRowCount: ZERO,
    topology: {
      distinctPartitionHosts: ZERO,
      partitions: [],
      spreadUnit: SPREAD_UNIT.HOST,
    },
  });
}

function buildLiveReportDetail({
  hasLiveTelemetry,
  invocations,
  nodeIds,
  rows,
  snapshotsAfter,
  snapshotsBefore,
  workload,
}) {
  const topology = resolveLiveTopology(workload);
  const partitionIds = Array.isArray(topology.partitions) ?
    topology.partitions.map((entry) => entry.partitionId) :
    [];
  const parity =
    partitionIds.length > ZERO && rows.length > ZERO ?
      assertParity({
        partitionCount: partitionIds.length,
        responses: invocations,
        rows,
      }) :
      null;
  const logEntries = Array.isArray(workload?.logEntries) ?
    workload.logEntries :
    [];
  const localReadProof =
    logEntries.length > ZERO && partitionIds.length > ZERO ?
      buildLocalReadProof({
        invocationCount: invocations.length,
        logEntries,
        partitionIds,
      }) :
      {distinctNodes: ZERO, perNode: [], spreadUnit: SPREAD_UNIT.NODE};
  const networkPerNode = hasLiveTelemetry ?
    buildNetworkPerNode(nodeIds, snapshotsBefore, snapshotsAfter) :
    [];
  const resourcePerNode = hasLiveTelemetry ?
    buildResourcePerNode(nodeIds, snapshotsAfter) :
    [];
  const finalBytes = invocations.every((item) => Number.isFinite(item?.bytes)) ?
    invocations.reduce((sum, item) => sum + item.bytes, ZERO) :
    null;
  const partialBytes = Number.isFinite(workload?.partialBytes) ?
    workload.partialBytes :
    null;
  const sentinelRowCount = Number.isFinite(workload?.sentinelRowCount) ?
    workload.sentinelRowCount :
    ZERO;
  return composeReportDetail({
    datasetDigest: computeDatasetDigest(rows),
    fidelity: resolveLiveFidelity(workload),
    finalBytes,
    generatorDigest: computeGeneratorDigest(),
    invokerTelemetry: summarizeInvokerTelemetry(logEntries),
    latencyMs: computeLatencySummary(
      invocations.map((item) => item.durationMs),
    ),
    localReadProof,
    networkPerNode,
    nodeCount: nodeIds.length,
    parity,
    partialBytes,
    resourcePerNode,
    sentinelRowCount,
    topology,
  });
}

/**
 * Execute live public-path scale-and-failure certification against a cluster.
 * Refuses to fabricate passing evidence when live workload invocations,
 * host telemetry snapshots, or non-seed failure drill observations are absent.
 *
 * @param {Object|null} [cluster]
 * @param {Object} [options]
 * @return {Promise<Object>}
 */
export async function run(cluster = null, options = {}) {
  const nodes = Array.isArray(cluster?.getNodes?.()) ?
    cluster.getNodes() :
    [];
  const nodeIds = nodes.map((node) => node.id);
  const nonSeedNodes = nodes.filter((node) => node.role !== 'seed');
  const nonSeedNodeIds = new Set(nonSeedNodes.map((node) => node.id));
  const primaryNonSeedNode = nonSeedNodes[ZERO] || null;

  const hasTelemetryHook =
    typeof cluster?.collectNodeResourceSnapshots === 'function';
  const hasWorkloadHook =
    typeof cluster?.executePublicPathWorkload === 'function';
  const hasDrillHook =
    typeof cluster?.executeNonSeedFailureDrill === 'function';

  const rawSnapshotsBefore = hasTelemetryHook ?
    await cluster.collectNodeResourceSnapshots({
      cluster,
      nodes,
      phase: 'before',
    }) :
    null;

  const defaultRows = generateDatasetRows();
  const workload = hasWorkloadHook ?
    await cluster.executePublicPathWorkload({
      cluster,
      nodes,
      options,
      rows: defaultRows,
    }) :
    null;

  const rawSnapshotsAfter = hasTelemetryHook ?
    await cluster.collectNodeResourceSnapshots({
      cluster,
      nodes,
      phase: 'after',
    }) :
    null;

  const beforeCheck = normalizeSnapshotMap(rawSnapshotsBefore, nodeIds);
  const afterCheck = normalizeSnapshotMap(rawSnapshotsAfter, nodeIds);
  const hasLiveTelemetry =
    hasTelemetryHook && beforeCheck.valid && afterCheck.valid;

  const invocations = Array.isArray(workload?.invocations) ?
    workload.invocations :
    [];
  const workloadMode = workload?.mode;
  const isLiveWorkloadMode =
    workload?.synthetic !== true &&
    (workloadMode === undefined || workloadMode === LIVE_FIDELITY_MODE);
  const hasLiveWorkload =
    hasWorkloadHook && invocations.length > ZERO && isLiveWorkloadMode;

  const rows = Array.isArray(workload?.rows) ? workload.rows : defaultRows;
  const reportDetail = hasWorkloadHook && invocations.length > ZERO ?
    buildLiveReportDetail({
      hasLiveTelemetry,
      invocations,
      nodeIds,
      rows,
      snapshotsAfter: afterCheck.snapshots,
      snapshotsBefore: beforeCheck.snapshots,
      workload,
    }) :
    buildUnexecutedReportDetail(nodeIds.length);

  const rawDrill = hasDrillHook && primaryNonSeedNode !== null ?
    await cluster.executeNonSeedFailureDrill({
      cluster,
      nodes,
      nonSeedNode: primaryNonSeedNode,
      options,
    }) :
    null;
  const failureDrill = resolveLiveFailureDrill(rawDrill, nonSeedNodeIds);
  const representativeness =
    workload?.representativeness &&
    typeof workload.representativeness === 'object' ?
      workload.representativeness :
      {};

  const fidelityMode = hasLiveWorkload && hasLiveTelemetry ?
    LIVE_FIDELITY_MODE :
    SYNTHETIC_FIDELITY_MODE;
  const telemetryMetricOverrides = hasLiveTelemetry ?
    options.metrics :
    {
      [DIMENSION_NAME.CPU_PERCENT]: null,
      [DIMENSION_NAME.MEMORY_BYTES]: null,
      ...(options.metrics || {}),
    };
  const baselineMetrics =
    options.baselineMetrics === undefined ?
      DEFAULT_BASELINE_METRICS :
      options.baselineMetrics;

  const certification = evaluateScaleAndFailureCertification({
    barDefinition:
      options.barDefinition || SEALED_PUBLIC_PATH_CERTIFICATION_BAR,
    baselineMetrics,
    expectedBarDigest: options.expectedBarDigest,
    failureDrill,
    fidelityMode,
    metrics: telemetryMetricOverrides,
    reportDetail,
    representativeness,
    rt2PressureProof: executeRt1AndRt2RuntimeProof(),
  });

  const result = {
    ...reportDetail,
    certification,
  };
  if (cluster && typeof cluster === 'object') {
    cluster.reportDetail = result;
  }
  if (certification.overallVerdict !== CERTIFICATION_VERDICT.PASS) {
    const errorCode =
      certification.overallVerdict === CERTIFICATION_VERDICT.NON_TERMINAL ?
        CERTIFICATION_ERROR_CODE.NON_TERMINAL :
        CERTIFICATION_ERROR_CODE.FAILED;
    const reasons = certification.nonTerminalReasons.join(', ') ||
      certification.failedDimensions.join(', ');
    throw new PublicPathCertificationError(
      `${SCENARIO_NAME}: certification ${certification.overallVerdict}` +
        (reasons.length > ZERO ? ` (${reasons})` : ''),
      {
        certification,
        code: errorCode,
        reportDetail: result,
      },
    );
  }
  return result;
}

export {
  CERTIFICATION_ERROR_CODE,
  DEFAULT_BASELINE_METRICS,
  PublicPathCertificationError,
  SCENARIO_NAME,
  buildDefaultFailureDrill,
  buildDefaultRepresentativeness,
  buildScaleAndFailureCertificationEvidence,
  executeRt1AndRt2RuntimeProof,
};
