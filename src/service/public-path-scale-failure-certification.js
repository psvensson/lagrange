import {createHash} from 'node:crypto';

const PUBLIC_PATH_CERTIFICATION_SCHEMA_VERSION = 1;
const EXPECTED_REPORT_DETAIL_SCHEMA_VERSION = 2;
const HASH_ALGORITHM_SHA256 = 'sha256';
const DIGEST_ENCODING_HEX = 'hex';
const JSON_ENCODING_UTF8 = 'utf8';
const ZERO = 0;
const ONE = 1;
const TWO = 2;
const FOUR = 4;
const DEFAULT_Z_SCORE_95 = 1.96;
const DEFAULT_CONFIDENCE_LEVEL = 0.95;
const DEFAULT_MIN_INVOCATION_COUNT = 5;
const DEFAULT_MIN_PARTITION_HOSTS = 2;
const DEFAULT_MIN_LOCAL_READ_NODES = 2;
const DEFAULT_MIN_PARITY_ACCOUNTS = 1;
const DEFAULT_THROUGHPUT_DURATION_MS = 1000;
const MS_PER_SECOND = 1000;
const NO_REASON_CODE = null;

const THRESHOLD_P95_LATENCY_MS = 2500;
const THRESHOLD_P99_LATENCY_MS = 5000;
const THRESHOLD_THROUGHPUT_OPS_PER_SEC = 1;
const THRESHOLD_TRANSFERRED_BYTES = 16_777_216;
const THRESHOLD_CPU_PERCENT = 95;
const THRESHOLD_MEMORY_BYTES = 1_073_741_824;
const THRESHOLD_RETRY_RATE = 0.25;
const THRESHOLD_ERROR_RATE = 0.05;
const THRESHOLD_NODE_LOSS_AVAILABILITY = 0.9;
const THRESHOLD_RECOVERY_TIME_MS = 30_000;

const CERTIFICATION_BAR_ID = 'public-path-scale-and-failure-v1';
const DIRECTION_MAX = 'max';
const DIRECTION_MIN = 'min';
const UNIT_MS = 'ms';
const UNIT_OPS_PER_SEC = 'ops_per_sec';
const UNIT_BYTES = 'bytes';
const UNIT_PERCENT = 'percent';
const UNIT_RATIO = 'ratio';

const EXPECTED_RUNTIME_KIND = 'wasm_component';
const FORBIDDEN_RUNTIME_KIND = 'native_js';
const EXPECTED_MEDIA_TYPE = 'application/wasm';
const EXPECTED_PARITY_ORACLE = 'independent-recompute';
const EXPECTED_HOST_SPREAD_UNIT = 'host';
const EXPECTED_NODE_SPREAD_UNIT = 'node';
const LIVE_FIDELITY_MODE = 'live';

const COMPARISON_OUTCOME = Object.freeze({
  NEGATIVE: 'NEGATIVE',
  NEUTRAL: 'NEUTRAL',
  POSITIVE: 'POSITIVE',
});

const CERTIFICATION_VERDICT = Object.freeze({
  FAIL: 'FAIL',
  NON_TERMINAL: 'NON_TERMINAL',
  PASS: 'PASS',
});

const CERTIFICATION_NON_TERMINAL_REASON = Object.freeze({
  BAR_DIGEST_MISMATCH: 'CERTIFICATION_BAR_DIGEST_MISMATCH',
  INSUFFICIENT_PARTITION_HOST_SPREAD: 'INSUFFICIENT_PARTITION_HOST_SPREAD',
  INVALID_REPORT_DETAIL_SCHEMA: 'INVALID_REPORT_DETAIL_SCHEMA',
  MISSING_FAILURE_DRILL: 'MISSING_FAILURE_DRILL',
  MISSING_INDEPENDENT_PARITY_ORACLE: 'MISSING_INDEPENDENT_PARITY_ORACLE',
  MISSING_PUBLIC_PATH_PROOF: 'MISSING_PUBLIC_PATH_PROOF',
  MISSING_REPRESENTATIVENESS_AXIS: 'MISSING_REPRESENTATIVENESS_AXIS',
  MISSING_REQUIRED_DIMENSION: 'MISSING_REQUIRED_DIMENSION',
  NATIVE_JS_SUBSTITUTION: 'NATIVE_JS_SUBSTITUTION',
  SYNTHETIC_OR_NON_LIVE_METRICS: 'SYNTHETIC_OR_NON_LIVE_METRICS',
});

const DIMENSION_NAME = Object.freeze({
  CPU_PERCENT: 'cpuPercent',
  ERROR_RATE: 'errorRate',
  MEMORY_BYTES: 'memoryBytes',
  NODE_LOSS_AVAILABILITY: 'nodeLossAvailability',
  P95_LATENCY_MS: 'p95LatencyMs',
  P99_LATENCY_MS: 'p99LatencyMs',
  RECOVERY_TIME_MS: 'recoveryTimeMs',
  RETRY_RATE: 'retryRate',
  THROUGHPUT_OPS_PER_SEC: 'throughputOpsPerSec',
  TRANSFERRED_BYTES: 'transferredBytes',
});

const REQUIRED_CERTIFICATION_DIMENSIONS = Object.freeze([
  DIMENSION_NAME.P95_LATENCY_MS,
  DIMENSION_NAME.P99_LATENCY_MS,
  DIMENSION_NAME.THROUGHPUT_OPS_PER_SEC,
  DIMENSION_NAME.TRANSFERRED_BYTES,
  DIMENSION_NAME.CPU_PERCENT,
  DIMENSION_NAME.MEMORY_BYTES,
  DIMENSION_NAME.RETRY_RATE,
  DIMENSION_NAME.ERROR_RATE,
  DIMENSION_NAME.NODE_LOSS_AVAILABILITY,
  DIMENSION_NAME.RECOVERY_TIME_MS,
]);

const REPRESENTATIVENESS_AXIS = Object.freeze({
  AUTHENTICATED_NODE_TRANSPORT_MTLS: 'authenticatedNodeTransportMtls',
  MULTI_HOST_PARTITION_SPREAD: 'multiHostPartitionSpread',
  MULTI_OPERATION_SERVICE_CELL_V2: 'multiOperationServiceCellV2',
  PAGED_SHARD_EXECUTION_ABOVE_ONE_BATCH: 'pagedShardExecutionAboveOneBatch',
  PUBLIC_AUTHENTICATED_HTTP_PATH: 'publicAuthenticatedHttpPath',
  STRUCTURED_PARTIALS_V1: 'structuredPartialsV1',
  TYPED_SELECTOR_NARROWING: 'typedSelectorNarrowing',
});

const REQUIRED_REPRESENTATIVENESS_AXES = Object.freeze([
  REPRESENTATIVENESS_AXIS.TYPED_SELECTOR_NARROWING,
  REPRESENTATIVENESS_AXIS.PAGED_SHARD_EXECUTION_ABOVE_ONE_BATCH,
  REPRESENTATIVENESS_AXIS.STRUCTURED_PARTIALS_V1,
  REPRESENTATIVENESS_AXIS.MULTI_OPERATION_SERVICE_CELL_V2,
  REPRESENTATIVENESS_AXIS.MULTI_HOST_PARTITION_SPREAD,
  REPRESENTATIVENESS_AXIS.PUBLIC_AUTHENTICATED_HTTP_PATH,
  REPRESENTATIVENESS_AXIS.AUTHENTICATED_NODE_TRANSPORT_MTLS,
]);

const BAR_DIGEST_EXCLUDED_KEY = 'barDigest';

function canonicalizeValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeValue(item));
  }
  if (value !== null && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      if (key === BAR_DIGEST_EXCLUDED_KEY) {
        continue;
      }
      sorted[key] = canonicalizeValue(value[key]);
    }
    return sorted;
  }
  return value;
}

function computeCertificationBarDigest(barDefinition) {
  if (!barDefinition || typeof barDefinition !== 'object') {
    return '';
  }
  const canonicalJson = JSON.stringify(canonicalizeValue(barDefinition));
  return createHash(HASH_ALGORITHM_SHA256)
    .update(canonicalJson, JSON_ENCODING_UTF8)
    .digest(DIGEST_ENCODING_HEX);
}

const BASE_CERTIFICATION_BAR = Object.freeze({
  barId: CERTIFICATION_BAR_ID,
  confidenceLevel: DEFAULT_CONFIDENCE_LEVEL,
  dimensions: Object.freeze({
    [DIMENSION_NAME.CPU_PERCENT]: Object.freeze({
      direction: DIRECTION_MAX,
      threshold: THRESHOLD_CPU_PERCENT,
      unit: UNIT_PERCENT,
    }),
    [DIMENSION_NAME.ERROR_RATE]: Object.freeze({
      direction: DIRECTION_MAX,
      threshold: THRESHOLD_ERROR_RATE,
      unit: UNIT_RATIO,
    }),
    [DIMENSION_NAME.MEMORY_BYTES]: Object.freeze({
      direction: DIRECTION_MAX,
      threshold: THRESHOLD_MEMORY_BYTES,
      unit: UNIT_BYTES,
    }),
    [DIMENSION_NAME.NODE_LOSS_AVAILABILITY]: Object.freeze({
      direction: DIRECTION_MIN,
      threshold: THRESHOLD_NODE_LOSS_AVAILABILITY,
      unit: UNIT_RATIO,
    }),
    [DIMENSION_NAME.P95_LATENCY_MS]: Object.freeze({
      direction: DIRECTION_MAX,
      threshold: THRESHOLD_P95_LATENCY_MS,
      unit: UNIT_MS,
    }),
    [DIMENSION_NAME.P99_LATENCY_MS]: Object.freeze({
      direction: DIRECTION_MAX,
      threshold: THRESHOLD_P99_LATENCY_MS,
      unit: UNIT_MS,
    }),
    [DIMENSION_NAME.RECOVERY_TIME_MS]: Object.freeze({
      direction: DIRECTION_MAX,
      threshold: THRESHOLD_RECOVERY_TIME_MS,
      unit: UNIT_MS,
    }),
    [DIMENSION_NAME.RETRY_RATE]: Object.freeze({
      direction: DIRECTION_MAX,
      threshold: THRESHOLD_RETRY_RATE,
      unit: UNIT_RATIO,
    }),
    [DIMENSION_NAME.THROUGHPUT_OPS_PER_SEC]: Object.freeze({
      direction: DIRECTION_MIN,
      threshold: THRESHOLD_THROUGHPUT_OPS_PER_SEC,
      unit: UNIT_OPS_PER_SEC,
    }),
    [DIMENSION_NAME.TRANSFERRED_BYTES]: Object.freeze({
      direction: DIRECTION_MAX,
      threshold: THRESHOLD_TRANSFERRED_BYTES,
      unit: UNIT_BYTES,
    }),
  }),
  minInvocationCount: DEFAULT_MIN_INVOCATION_COUNT,
  minPartitionHosts: DEFAULT_MIN_PARTITION_HOSTS,
  schemaVersion: PUBLIC_PATH_CERTIFICATION_SCHEMA_VERSION,
});

const SEALED_PUBLIC_PATH_CERTIFICATION_BAR = Object.freeze({
  ...BASE_CERTIFICATION_BAR,
  barDigest: computeCertificationBarDigest(BASE_CERTIFICATION_BAR),
});

function hasAllRequiredBarDimensions(barDefinition) {
  const dimensions = barDefinition?.dimensions;
  if (!dimensions || typeof dimensions !== 'object') {
    return false;
  }
  return REQUIRED_CERTIFICATION_DIMENSIONS.every((name) => {
    const entry = dimensions[name];
    return (
      entry &&
      typeof entry === 'object' &&
      (entry.direction === DIRECTION_MAX ||
        entry.direction === DIRECTION_MIN) &&
      Number.isFinite(entry.threshold)
    );
  });
}

function validateCertificationBar(
  barDefinition = SEALED_PUBLIC_PATH_CERTIFICATION_BAR,
  expectedDigest = SEALED_PUBLIC_PATH_CERTIFICATION_BAR.barDigest,
) {
  const actualDigest = computeCertificationBarDigest(barDefinition);
  const declaredDigestMatches =
    barDefinition?.barDigest === undefined ||
    barDefinition.barDigest === actualDigest;
  const matchesExpected =
    typeof expectedDigest === 'string' &&
    expectedDigest.length > ZERO &&
    actualDigest === expectedDigest &&
    declaredDigestMatches;
  const hasDimensions = hasAllRequiredBarDimensions(barDefinition);
  let reasonCode = NO_REASON_CODE;
  if (!matchesExpected) {
    reasonCode = CERTIFICATION_NON_TERMINAL_REASON.BAR_DIGEST_MISMATCH;
  } else if (!hasDimensions) {
    reasonCode = CERTIFICATION_NON_TERMINAL_REASON.MISSING_REQUIRED_DIMENSION;
  }
  return {
    actualDigest,
    expectedDigest,
    reasonCode,
    valid: reasonCode === NO_REASON_CODE,
  };
}

function computeWilsonConfidenceInterval(
  successes,
  total,
  zScore = DEFAULT_Z_SCORE_95,
) {
  if (!Number.isFinite(total) || total <= ZERO) {
    return {
      center: ZERO,
      lower: ZERO,
      sampleSize: ZERO,
      successes: ZERO,
      upper: ZERO,
    };
  }
  const boundedSuccesses = Math.min(Math.max(ZERO, successes), total);
  const phat = boundedSuccesses / total;
  const zSquared = zScore * zScore;
  const denominator = ONE + zSquared / total;
  const center = (phat + zSquared / (TWO * total)) / denominator;
  const radical = Math.sqrt(
    (phat * (ONE - phat) + zSquared / (FOUR * total)) / total,
  );
  const halfWidth = (zScore * radical) / denominator;
  return {
    center,
    lower: Math.max(ZERO, center - halfWidth),
    sampleSize: total,
    successes: boundedSuccesses,
    upper: Math.min(ONE, center + halfWidth),
  };
}

function evaluateWorkloadRepresentativeness(evidence = {}) {
  const axes = {};
  const missingAxes = [];
  for (const axis of REQUIRED_REPRESENTATIVENESS_AXES) {
    const satisfied = evidence?.[axis] === true;
    axes[axis] = satisfied;
    if (!satisfied) {
      missingAxes.push(axis);
    }
  }
  const valid = missingAxes.length === ZERO;
  return {
    axes,
    missingAxes,
    reasonCode: valid ?
      NO_REASON_CODE :
      CERTIFICATION_NON_TERMINAL_REASON.MISSING_REPRESENTATIVENESS_AXIS,
    valid,
  };
}

function sumPerNodeField(rows, field) {
  let sum = ZERO;
  let seen = false;
  for (const row of Array.isArray(rows) ? rows : []) {
    const value = row?.[field];
    if (Number.isFinite(value)) {
      sum += value;
      seen = true;
    }
  }
  return seen ? sum : ZERO;
}

function maxPerNodeField(rows, field) {
  let maxVal = ZERO;
  for (const row of Array.isArray(rows) ? rows : []) {
    const value = row?.[field];
    if (Number.isFinite(value) && value > maxVal) {
      maxVal = value;
    }
  }
  return maxVal;
}

function finiteNumberOrFallback(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function deriveThroughputFromLatency(latencyMs) {
  const count = finiteNumberOrFallback(latencyMs?.count, ZERO);
  if (count <= ZERO) {
    return null;
  }
  const avgMs = finiteNumberOrFallback(latencyMs?.avg, ZERO);
  const totalDurationMs = avgMs > ZERO ?
    count * avgMs :
    DEFAULT_THROUGHPUT_DURATION_MS;
  return (count * MS_PER_SECOND) / Math.max(ONE, totalDurationMs);
}

function deriveTransferredBytes(bytes) {
  if (
    !Number.isFinite(bytes?.partialBytes) &&
    !Number.isFinite(bytes?.finalBytes)
  ) {
    return null;
  }
  const partialBytes = finiteNumberOrFallback(bytes?.partialBytes, ZERO);
  const finalBytes = finiteNumberOrFallback(bytes?.finalBytes, ZERO);
  const netRx = sumPerNodeField(bytes?.perNode, 'rxBytes');
  const netTx = sumPerNodeField(bytes?.perNode, 'txBytes');
  return partialBytes + finalBytes + netRx + netTx;
}

function deriveMetricsFromReportDetail(reportDetail, failureDrill, overrides) {
  const latencyMs = reportDetail?.latencyMs || {};
  const resourcesRows = reportDetail?.resources?.perNode || [];
  const derivedCpu = maxPerNodeField(resourcesRows, DIMENSION_NAME.CPU_PERCENT);
  const derivedMemory = maxPerNodeField(resourcesRows, 'memoryUsageBytes');
  return {
    [DIMENSION_NAME.CPU_PERCENT]: derivedCpu,
    [DIMENSION_NAME.ERROR_RATE]: ZERO,
    [DIMENSION_NAME.MEMORY_BYTES]: derivedMemory,
    [DIMENSION_NAME.NODE_LOSS_AVAILABILITY]: finiteNumberOrFallback(
      failureDrill?.availabilityRatio,
      null,
    ),
    [DIMENSION_NAME.P95_LATENCY_MS]: finiteNumberOrFallback(
      latencyMs.p95,
      null,
    ),
    [DIMENSION_NAME.P99_LATENCY_MS]: finiteNumberOrFallback(
      latencyMs.p99,
      null,
    ),
    [DIMENSION_NAME.RECOVERY_TIME_MS]: finiteNumberOrFallback(
      failureDrill?.recoveryTimeMs,
      null,
    ),
    [DIMENSION_NAME.RETRY_RATE]: ZERO,
    [DIMENSION_NAME.THROUGHPUT_OPS_PER_SEC]: deriveThroughputFromLatency(
      latencyMs,
    ),
    [DIMENSION_NAME.TRANSFERRED_BYTES]: deriveTransferredBytes(
      reportDetail?.bytes,
    ),
    ...(overrides || {}),
  };
}

function resolveFidelityCells(fidelity) {
  if (Array.isArray(fidelity?.cells)) {
    return fidelity.cells;
  }
  if (typeof fidelity?.runtimeKind === 'string') {
    return [fidelity];
  }
  return [];
}

function isNonLiveFidelityMode(input, reportDetail) {
  const mode = input?.fidelityMode ?? reportDetail?.fidelity?.mode ??
    LIVE_FIDELITY_MODE;
  return mode !== LIVE_FIDELITY_MODE || input?.metrics?.synthetic === true;
}

function isWasmComponentCell(cell) {
  return (
    cell?.runtimeKind === EXPECTED_RUNTIME_KIND &&
    cell?.mediaType === EXPECTED_MEDIA_TYPE
  );
}

function checkFidelityAndCells(input, reportDetail, collectedCodes) {
  if (isNonLiveFidelityMode(input, reportDetail)) {
    collectedCodes.push(
      CERTIFICATION_NON_TERMINAL_REASON.SYNTHETIC_OR_NON_LIVE_METRICS,
    );
  }
  const cells = resolveFidelityCells(reportDetail?.fidelity);
  if (cells.length === ZERO) {
    collectedCodes.push(
      CERTIFICATION_NON_TERMINAL_REASON.MISSING_PUBLIC_PATH_PROOF,
    );
    return;
  }
  const hasNativeJs = cells.some(
    (cell) => cell?.runtimeKind === FORBIDDEN_RUNTIME_KIND,
  );
  if (hasNativeJs) {
    collectedCodes.push(
      CERTIFICATION_NON_TERMINAL_REASON.NATIVE_JS_SUBSTITUTION,
    );
    return;
  }
  if (!cells.every(isWasmComponentCell)) {
    collectedCodes.push(
      CERTIFICATION_NON_TERMINAL_REASON.MISSING_PUBLIC_PATH_PROOF,
    );
  }
}

function resolveParityCount(parity) {
  if (Number.isFinite(parity?.checkedAccounts)) {
    return parity.checkedAccounts;
  }
  if (Number.isFinite(parity?.invocations)) {
    return parity.invocations;
  }
  return ZERO;
}

function resolveParityMismatchCount(parity) {
  if (Array.isArray(parity?.mismatches)) {
    return parity.mismatches.length;
  }
  if (Number.isFinite(parity?.mismatches)) {
    return parity.mismatches;
  }
  return null;
}

function isPartitionHostSpreadValid(topology, localReadProof) {
  const localNodes = finiteNumberOrFallback(
    localReadProof?.distinctNodesWithLocalReads,
    localReadProof?.distinctNodes,
  );
  const hostSpreadOk =
    topology?.spreadUnit === EXPECTED_HOST_SPREAD_UNIT &&
    finiteNumberOrFallback(topology?.distinctPartitionHosts, ZERO) >=
      DEFAULT_MIN_PARTITION_HOSTS;
  const localReadsOk =
    localReadProof?.spreadUnit === EXPECTED_NODE_SPREAD_UNIT &&
    finiteNumberOrFallback(localNodes, ZERO) >= DEFAULT_MIN_LOCAL_READ_NODES;
  return hostSpreadOk && localReadsOk;
}

function isIndependentParityOracleValid(parity) {
  const parityCount = resolveParityCount(parity);
  const mismatchCount = resolveParityMismatchCount(parity);
  return (
    parity?.oracle === EXPECTED_PARITY_ORACLE &&
    parity?.selfReferential !== true &&
    parityCount >= DEFAULT_MIN_PARITY_ACCOUNTS &&
    mismatchCount !== null
  );
}

function isFailureDrillValid(failureDrill) {
  return (
    failureDrill?.executed === true &&
    failureDrill?.nonSeedNodeKilled === true &&
    Number.isFinite(failureDrill?.recoveryTimeMs)
  );
}

function checkTopologyAndOracle(reportDetail, failureDrill, collectedCodes) {
  if (
    !isPartitionHostSpreadValid(
      reportDetail?.topology,
      reportDetail?.localReadProof,
    )
  ) {
    collectedCodes.push(
      CERTIFICATION_NON_TERMINAL_REASON.INSUFFICIENT_PARTITION_HOST_SPREAD,
    );
  }
  if (!isIndependentParityOracleValid(reportDetail?.parity)) {
    collectedCodes.push(
      CERTIFICATION_NON_TERMINAL_REASON.MISSING_INDEPENDENT_PARITY_ORACLE,
    );
  }
  if (!isFailureDrillValid(failureDrill)) {
    collectedCodes.push(CERTIFICATION_NON_TERMINAL_REASON.MISSING_FAILURE_DRILL);
  }
}

function evaluateSingleDimension(value, spec) {
  if (!Number.isFinite(value) || !spec) {
    return {
      entry: {
        direction: spec?.direction ?? null,
        passed: false,
        threshold: spec?.threshold ?? null,
        unit: spec?.unit ?? null,
        value: null,
      },
      missing: true,
    };
  }
  const passed = spec.direction === DIRECTION_MAX ?
    value <= spec.threshold :
    value >= spec.threshold;
  return {
    entry: {
      direction: spec.direction,
      passed,
      threshold: spec.threshold,
      unit: spec.unit,
      value,
    },
    missing: false,
  };
}

function evaluateDimensionsAgainstBar(metrics, bar) {
  const perDimension = {};
  const failedDimensions = [];
  const missingDimensions = [];
  for (const dimension of REQUIRED_CERTIFICATION_DIMENSIONS) {
    const result = evaluateSingleDimension(
      metrics?.[dimension],
      bar.dimensions?.[dimension],
    );
    perDimension[dimension] = result.entry;
    if (result.missing) {
      missingDimensions.push(dimension);
    } else if (!result.entry.passed) {
      failedDimensions.push(dimension);
    }
  }
  return {failedDimensions, missingDimensions, perDimension};
}

function compareDimensionToBaseline(
  dimension,
  candidateValue,
  baselineValue,
  spec,
) {
  if (
    !Number.isFinite(candidateValue) ||
    !Number.isFinite(baselineValue) ||
    !spec
  ) {
    return null;
  }
  const delta = candidateValue - baselineValue;
  let comparisonOutcome = COMPARISON_OUTCOME.NEUTRAL;
  if (delta !== ZERO) {
    const candidateBetter = spec.direction === DIRECTION_MAX ?
      candidateValue < baselineValue :
      candidateValue > baselineValue;
    comparisonOutcome = candidateBetter ?
      COMPARISON_OUTCOME.POSITIVE :
      COMPARISON_OUTCOME.NEGATIVE;
  }
  return {
    baselineValue,
    candidateValue,
    delta,
    dimension,
    direction: spec.direction,
    outcome: comparisonOutcome,
  };
}

function evaluateBaselineComparison(metrics, baselineMetrics, bar) {
  const comparisons = {};
  const neutralOrNegativeFindings = [];
  if (!baselineMetrics || typeof baselineMetrics !== 'object') {
    return {comparisons, neutralOrNegativeFindings};
  }
  for (const dimension of REQUIRED_CERTIFICATION_DIMENSIONS) {
    const entry = compareDimensionToBaseline(
      dimension,
      metrics?.[dimension],
      baselineMetrics?.[dimension],
      bar.dimensions?.[dimension],
    );
    if (entry) {
      comparisons[dimension] = entry;
      if (entry.outcome !== COMPARISON_OUTCOME.POSITIVE) {
        neutralOrNegativeFindings.push(entry);
      }
    }
  }
  return {comparisons, neutralOrNegativeFindings};
}

function collectNonTerminalReasons({
  barValidation,
  failureDrill,
  input,
  missingDimensions,
  reportDetail,
  representativeness,
}) {
  const collectedCodes = [];
  if (!barValidation.valid && barValidation.reasonCode) {
    collectedCodes.push(barValidation.reasonCode);
  }
  if (reportDetail?.schemaVersion !== EXPECTED_REPORT_DETAIL_SCHEMA_VERSION) {
    collectedCodes.push(
      CERTIFICATION_NON_TERMINAL_REASON.INVALID_REPORT_DETAIL_SCHEMA,
    );
  }
  checkFidelityAndCells(input, reportDetail, collectedCodes);
  checkTopologyAndOracle(reportDetail, failureDrill, collectedCodes);
  if (!representativeness.valid) {
    collectedCodes.push(
      CERTIFICATION_NON_TERMINAL_REASON.MISSING_REPRESENTATIVENESS_AXIS,
    );
  }
  if (missingDimensions.length > ZERO) {
    collectedCodes.push(
      CERTIFICATION_NON_TERMINAL_REASON.MISSING_REQUIRED_DIMENSION,
    );
  }
  return Array.from(new Set(collectedCodes));
}

function buildConfidenceIntervals(reportDetail, failureDrill) {
  const totalInvocations = Number.isFinite(reportDetail?.latencyMs?.count) ?
    reportDetail.latencyMs.count :
    ZERO;
  const mismatchCount = resolveParityMismatchCount(reportDetail?.parity) ??
    ZERO;
  const successfulInvocations = Math.max(
    ZERO,
    totalInvocations - mismatchCount,
  );
  const drillTotal = Number.isFinite(failureDrill?.probesTotal) ?
    failureDrill.probesTotal :
    totalInvocations;
  const drillSuccesses = Number.isFinite(failureDrill?.probesSucceeded) ?
    failureDrill.probesSucceeded :
    successfulInvocations;
  return {
    invocationSuccess: computeWilsonConfidenceInterval(
      successfulInvocations,
      totalInvocations,
    ),
    nodeLossAvailability: computeWilsonConfidenceInterval(
      drillSuccesses,
      drillTotal,
    ),
  };
}

function resolveOverallVerdict(
  nonTerminalReasons,
  failedDimensions,
  reportDetail,
  failureDrill,
) {
  if (nonTerminalReasons.length > ZERO) {
    return CERTIFICATION_VERDICT.NON_TERMINAL;
  }
  const mismatchCount = resolveParityMismatchCount(reportDetail?.parity) ??
    ZERO;
  const hasParityMismatches = mismatchCount > ZERO;
  const hasLostWrites =
    Number.isFinite(failureDrill?.lostAcknowledgedWrites) &&
    failureDrill.lostAcknowledgedWrites > ZERO;
  if (failedDimensions.length > ZERO || hasParityMismatches || hasLostWrites) {
    return CERTIFICATION_VERDICT.FAIL;
  }
  return CERTIFICATION_VERDICT.PASS;
}

function evaluateScaleAndFailureCertification(input = {}) {
  const bar = input.barDefinition || SEALED_PUBLIC_PATH_CERTIFICATION_BAR;
  const expectedBarDigest =
    input.expectedBarDigest ?? SEALED_PUBLIC_PATH_CERTIFICATION_BAR.barDigest;
  const barValidation = validateCertificationBar(bar, expectedBarDigest);
  const reportDetail = input.reportDetail;
  const failureDrill = input.failureDrill || null;
  const representativeness = evaluateWorkloadRepresentativeness(
    input.representativeness,
  );
  const metrics = deriveMetricsFromReportDetail(
    reportDetail,
    failureDrill,
    input.metrics,
  );
  const {
    failedDimensions,
    missingDimensions,
    perDimension,
  } = evaluateDimensionsAgainstBar(metrics, bar);
  const nonTerminalReasons = collectNonTerminalReasons({
    barValidation,
    failureDrill,
    input,
    missingDimensions,
    reportDetail,
    representativeness,
  });
  const {
    comparisons: baselineComparison,
    neutralOrNegativeFindings,
  } = evaluateBaselineComparison(metrics, input.baselineMetrics, bar);
  const overallVerdict = resolveOverallVerdict(
    nonTerminalReasons,
    failedDimensions,
    reportDetail,
    failureDrill,
  );
  return {
    barDigest: barValidation.actualDigest,
    baselineComparison,
    confidenceIntervals: buildConfidenceIntervals(reportDetail, failureDrill),
    failedDimensions,
    failureDrill,
    neutralOrNegativeFindings,
    nonTerminalReasons,
    overallVerdict,
    perDimension,
    representativeness,
    rt2PressureProof: input.rt2PressureProof || null,
    schemaVersion: PUBLIC_PATH_CERTIFICATION_SCHEMA_VERSION,
  };
}

export {
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
};
