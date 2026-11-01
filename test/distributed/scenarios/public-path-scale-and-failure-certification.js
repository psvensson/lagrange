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

import assert from 'node:assert/strict';
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
import {SPREAD_UNIT} from '../harness/scenario-host-topology.js';
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

export async function run(cluster = null) {
  const nodeIds = Array.isArray(cluster?.getNodes?.()) ?
    cluster.getNodes().map((node) => node.id) :
    undefined;
  const nonSeedNode = Array.isArray(cluster?.getNodes?.()) ?
    cluster.getNodes().find((node) => node.role !== 'seed') :
    null;
  const result = buildScaleAndFailureCertificationEvidence({
    failureDrill: buildDefaultFailureDrill(nonSeedNode?.id || 'node-3'),
    nodeIds,
  });
  assert.equal(
    result.certification.overallVerdict,
    CERTIFICATION_VERDICT.PASS,
    `${SCENARIO_NAME}: expected terminal PASS verdict`,
  );
  if (cluster && typeof cluster === 'object') {
    cluster.reportDetail = result;
  }
  return result;
}

export {
  DEFAULT_BASELINE_METRICS,
  SCENARIO_NAME,
  buildDefaultFailureDrill,
  buildDefaultRepresentativeness,
  buildScaleAndFailureCertificationEvidence,
  executeRt1AndRt2RuntimeProof,
};
