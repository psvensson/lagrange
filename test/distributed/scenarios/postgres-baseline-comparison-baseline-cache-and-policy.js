import {POSTGRES_BASELINE_COMPARISON_QUIESCENCE_AND_REPLICATION_BUNDLE} from './postgres-baseline-comparison-quiescence-and-replication.js';
import {
  getBenchmarkSemanticContract,
  inspectBenchmarkSemanticReceipt,
} from '../harness/benchmark-workload-semantics.js';
import {
  appendOwnArrayValue,
  digestBenchmarkSemanticData,
  isMissingDataValue,
  isNonNegativeSafeNumber,
  isPlainDataRecord,
  ownDataValue,
  parseBenchmarkSemanticJson,
  serializeBenchmarkSemanticData,
  uniqueSortedStrings,
} from '../harness/benchmark-semantic-integrity.js';
import {
  BENCHMARK_CORRECT_THROUGHPUT_BASIS,
  BENCHMARK_LEGACY_THROUGHPUT_BASIS,
  BENCHMARK_PUBLICATION_REASON,
  BENCHMARK_SQL_DIALECT,
} from '../harness/benchmark-workload-semantics-constants.js';
const {
  dirname,
  join,
  mkdir,
  readFile,
  writeFile,
  ADMISSION_CONFLICT_LOAD_NODE_MAX_IN_FLIGHT,
  AUTHORITATIVE_FALLBACK_POLICY_SCHEMA_VERSION,
  BASELINE_CACHE_DIRNAME,
  BASELINE_CACHE_DISABLED_REASON,
  BASELINE_CACHE_FILE_EXTENSION,
  BASELINE_CACHE_HIT_REASON,
  BASELINE_CACHE_INVALID_REASON,
  BASELINE_CACHE_MISS_REASON,
  BASELINE_CACHE_REFRESH_REASON,
  BASELINE_CACHE_SCHEMA_VERSION,
  BASELINE_CACHE_STALE_REASON,
  BASELINE_CACHE_STORE_REASON,
  BENCHMARK_LOAD_REBALANCE_MONITOR_POLL_INTERVAL_MS_DEFAULT,
  BENCHMARK_WORKLOAD_OPERATIONS,
  BENCHMARK_WORKLOAD_PROFILE,
  DIAGNOSTICS_COVERAGE_REASON_NOT_REPORTED,
  DIAGNOSTICS_COVERAGE_STATUS_AVAILABLE,
  DIAGNOSTICS_COVERAGE_STATUS_UNAVAILABLE,
  DIAGNOSTICS_SAMPLE_KEY_RAFT_PROPOSE,
  DIAGNOSTICS_SAMPLE_KEY_SQLITE,
  DIAGNOSTICS_SAMPLE_KEY_TRANSPORT_DELIVER,
  DISCOVERY_GATE_STATUS_FAILED,
  DISCOVERY_GATE_STATUS_PASSED,
  GATE_RESULT_MODE,
  LOAD_METRIC_REJECTED_REASON_QUEUE_FULL,
  LOAD_METRIC_REJECTED_REASON_FLOW_CONTROL,
  LOAD_METRIC_REJECTED_REASON_ADMISSION,
  LOAD_METRIC_UNDISPATCHED_REASON_CANCELLED,
  LOAD_METRIC_UNDISPATCHED_REASON_CAPACITY,
  LOAD_METRIC_UNDISPATCHED_REASON_DURATION_TIMEOUT,
  LOAD_PARITY_REASON_LOAD_FANOUT_MISMATCH,
  LOAD_PARITY_REASON_PER_NODE_BUDGET_MISMATCH,
  LOAD_PARITY_REASON_TABLE_NAME_MISMATCH,
  LOAD_PARITY_STATUS_MATCHED,
  LOAD_PARITY_STATUS_MISMATCHED,
  LOAD_ROUTING_ADMISSION_SCHEMA_VERSION,
  NODE_CLIENT_CHANNEL,
  NODE_CLIENT_DEFAULT_CHANNEL_POLICIES,
  ONE,
  POST_LOAD_DRAIN_MODE_FAILED,
  POST_LOAD_DRAIN_STATUS_FAILED,
  POST_LOAD_DRAIN_STATUS_OK,
  WRITE_PRESSURE_SCHEMA_VERSION,
  ZERO,
  normalizeNonNegativeInteger,
  normalizeOptionalNonNegativeInteger,
  parseDurationToMs,
  resolveMachineProfile,
  resolveOverloadPolicy,
  resolveWritePressureThresholds,
  uniqueSorted,
} = POSTGRES_BASELINE_COMPARISON_QUIESCENCE_AND_REPLICATION_BUNDLE;
const DateConstructor = Date;
const dateNow = Date.now;
const dateParse = Date.parse;
const dateToISOString = Date.prototype.toISOString;
const numberIsFinite = Number.isFinite;
const reflectApply = Reflect.apply;

function buildBaselineCacheIdentity(benchmarkConfig, cacheBaseDir) {
  const semanticContract = getBenchmarkSemanticContract(
    BENCHMARK_SQL_DIALECT.POSTGRESQL,
  );
  const signature = {
    schemaVersion: BASELINE_CACHE_SCHEMA_VERSION,
    engine: 'postgres',
    semanticContract: {
      version: semanticContract.version,
      dialect: semanticContract.dialect,
      throughputBasis: semanticContract.throughputBasis,
      contractDigest: semanticContract.contractDigest,
    },
    machine: resolveMachineProfile(),
    benchmark: {
      baselineImage: benchmarkConfig.baselineImage,
      user: benchmarkConfig.user,
      database: benchmarkConfig.database,
      port: benchmarkConfig.port,
      loadOpsPerSec: benchmarkConfig.loadOpsPerSec,
      loadDurationMs: parseDurationToMs(benchmarkConfig.loadDuration),
      loadMaxInFlight: benchmarkConfig.loadMaxInFlight,
      loadNodeCount: benchmarkConfig.baselineLoadNodeCount,
      tableName: benchmarkConfig.tableName,
      workloadProfile: BENCHMARK_WORKLOAD_PROFILE,
      operations: BENCHMARK_WORKLOAD_OPERATIONS,
      replicationFactor: benchmarkConfig.replicationFactor,
      syncReplicaAcks: benchmarkConfig.syncReplicaAcks,
    },
  };
  const digest = digestBenchmarkSemanticData(signature);
  let digestHex = '';
  for (let index = 'sha256:'.length; index < digest.length; index += ONE) {
    digestHex += digest[index];
  }
  const key = `v${BASELINE_CACHE_SCHEMA_VERSION}-${digestHex}`;
  const path = cacheBaseDir ?
    join(
      cacheBaseDir,
      BASELINE_CACHE_DIRNAME,
      key + BASELINE_CACHE_FILE_EXTENSION,
    ) :
    null;
  return {key, path, signature};
}

function buildBaselineCacheMetadata(cacheIdentity, fields = {}) {
  return {
    enabled: true,
    hit: false,
    key: cacheIdentity?.key || null,
    path: cacheIdentity?.path || null,
    cachedAt: null,
    reason: null,
    publicationEligibility: {
      eligible: false,
      reasonCodes: [
        BENCHMARK_PUBLICATION_REASON.SEMANTIC_CONTRACT_MISSING,
      ],
    },
    ...fields,
  };
}

function isValidBaselineMetrics(metrics) {
  if (!isPlainDataRecord(metrics)) {
    return false;
  }
  const throughputFields = ['correctOpsPerSec', 'opsPerSec', 'tps'];
  for (let index = ZERO; index < throughputFields.length; index += ONE) {
    const throughput = ownDataValue(metrics, throughputFields[index]);
    if (isNonNegativeSafeNumber(throughput) && throughput > ZERO) {
      return true;
    }
  }
  return false;
}

function buildBaselinePublicationEligibility(metrics) {
  const receipt = ownDataValue(metrics, 'semanticParity');
  const reasonCodes = collectSemanticReceiptReasons(
    isMissingDataValue(receipt) ? null : receipt,
    BENCHMARK_SQL_DIALECT.POSTGRESQL,
  );
  appendCorrectThroughputReason(reasonCodes, metrics);
  return {
    eligible: reasonCodes.length === ZERO,
    reasonCodes,
  };
}

function collectSemanticReceiptReasons(receipt, expectedDialect) {
  const inspection = inspectBenchmarkSemanticReceipt(receipt, expectedDialect);
  if (!inspection.present) {
    return [BENCHMARK_PUBLICATION_REASON.SEMANTIC_CONTRACT_MISSING];
  }
  const reasonCodes = [];
  if (!inspection.contractMatches) {
    appendOwnArrayValue(
      reasonCodes,
      BENCHMARK_PUBLICATION_REASON.SEMANTIC_CONTRACT_MISMATCH,
    );
  }
  if (!inspection.dialectMatches) {
    appendOwnArrayValue(
      reasonCodes,
      BENCHMARK_PUBLICATION_REASON.SEMANTIC_DIALECT_MISMATCH,
    );
  }
  if (!inspection.statusPassed) {
    appendOwnArrayValue(
      reasonCodes,
      BENCHMARK_PUBLICATION_REASON.SEMANTIC_ORACLE_FAILED,
    );
  }
  if (!inspection.dimensionsComplete) {
    appendOwnArrayValue(
      reasonCodes,
      BENCHMARK_PUBLICATION_REASON.SEMANTIC_DIMENSION_INCOMPLETE,
    );
  }
  if (!inspection.evidenceComplete) {
    appendOwnArrayValue(
      reasonCodes,
      BENCHMARK_PUBLICATION_REASON.SEMANTIC_EVIDENCE_INCOMPLETE,
    );
  }
  if (!inspection.digestMatches) {
    appendOwnArrayValue(
      reasonCodes,
      BENCHMARK_PUBLICATION_REASON.SEMANTIC_RECEIPT_DIGEST_MISMATCH,
    );
  }
  return reasonCodes;
}

function appendCorrectThroughputReason(reasonCodes, metrics) {
  const correctOpsPerSec = ownDataValue(metrics, 'correctOpsPerSec');
  if (
    isNonNegativeSafeNumber(correctOpsPerSec) &&
    correctOpsPerSec > ZERO
  ) {
    return;
  }
  appendOwnArrayValue(
    reasonCodes,
    isMissingDataValue(correctOpsPerSec) ?
      BENCHMARK_PUBLICATION_REASON.CORRECT_THROUGHPUT_MISSING :
      BENCHMARK_PUBLICATION_REASON.CORRECT_THROUGHPUT_INVALID,
  );
}

function isCacheEntryFresh(cachedAt, ttlMs) {
  if (
    typeof ttlMs !== 'number' ||
    !numberIsFinite(ttlMs) ||
    ttlMs <= ZERO
  ) {
    return true;
  }
  if (typeof cachedAt !== 'string') {
    return false;
  }
  const cachedAtMs = dateParse(cachedAt);
  if (!numberIsFinite(cachedAtMs)) {
    return false;
  }
  return dateNow() - cachedAtMs <= ttlMs;
}

async function loadBaselineMetricsFromCache(cacheIdentity, benchmarkConfig) {
  const metadata = buildBaselineCacheMetadata(cacheIdentity, {
    enabled: benchmarkConfig.cacheBaselineMetrics === true,
  });
  if (metadata.enabled !== true) {
    metadata.reason = BASELINE_CACHE_DISABLED_REASON;
    return {metrics: null, metadata};
  }
  if (benchmarkConfig.refreshBaselineMetrics === true) {
    metadata.reason = BASELINE_CACHE_REFRESH_REASON;
    return {metrics: null, metadata};
  }
  if (!cacheIdentity?.path) {
    metadata.reason = BASELINE_CACHE_MISS_REASON;
    return {metrics: null, metadata};
  }

  try {
    const raw = await readFile(cacheIdentity.path, 'utf8');
    const parsed = parseBenchmarkSemanticJson(raw);
    if (!isCurrentCachePayload(parsed, cacheIdentity)) {
      metadata.reason = BASELINE_CACHE_INVALID_REASON;
      return {metrics: null, metadata};
    }
    const cachedAtValue = ownDataValue(parsed, 'cachedAt');
    const cachedAt = isMissingDataValue(cachedAtValue) ? null : cachedAtValue;
    if (!isCacheEntryFresh(cachedAt, benchmarkConfig.baselineCacheTtlMs)) {
      metadata.cachedAt = cachedAt;
      metadata.reason = BASELINE_CACHE_STALE_REASON;
      return {metrics: null, metadata};
    }
    const metricsValue = ownDataValue(parsed, 'metrics');
    const metrics = isMissingDataValue(metricsValue) ? null : metricsValue;
    if (!isValidBaselineMetrics(metrics)) {
      metadata.cachedAt = cachedAt;
      metadata.reason = BASELINE_CACHE_INVALID_REASON;
      return {metrics: null, metadata};
    }

    metadata.hit = true;
    metadata.cachedAt = cachedAt;
    metadata.reason = BASELINE_CACHE_HIT_REASON;
    metadata.publicationEligibility =
      buildBaselinePublicationEligibility(metrics);
    return {metrics, metadata};
  } catch (error) {
    if (error?.code === 'ENOENT') {
      metadata.reason = BASELINE_CACHE_MISS_REASON;
      return {metrics: null, metadata};
    }
    metadata.reason = BASELINE_CACHE_INVALID_REASON;
    return {metrics: null, metadata};
  }
}

function isCurrentCachePayload(payload, cacheIdentity) {
  if (!isPlainDataRecord(payload)) {
    return false;
  }
  const schemaVersion = ownDataValue(payload, 'schemaVersion');
  const key = ownDataValue(payload, 'key');
  const signature = ownDataValue(payload, 'signature');
  if (
    schemaVersion !== BASELINE_CACHE_SCHEMA_VERSION ||
    key !== cacheIdentity.key ||
    !isPlainDataRecord(signature)
  ) {
    return false;
  }
  try {
    return digestBenchmarkSemanticData(signature) ===
      digestBenchmarkSemanticData(cacheIdentity.signature);
  } catch {
    return false;
  }
}

async function storeBaselineMetricsInCache(
  cacheIdentity,
  benchmarkConfig,
  baselineMetrics,
) {
  const metadata = buildBaselineCacheMetadata(cacheIdentity, {
    enabled: benchmarkConfig.cacheBaselineMetrics === true,
    hit: false,
  });
  if (
    metadata.enabled !== true ||
    !cacheIdentity?.path ||
    !isValidBaselineMetrics(baselineMetrics)
  ) {
    metadata.reason =
      metadata.enabled === true ?
        BASELINE_CACHE_MISS_REASON :
        BASELINE_CACHE_DISABLED_REASON;
    return metadata;
  }

  const payload = {
    schemaVersion: BASELINE_CACHE_SCHEMA_VERSION,
    key: cacheIdentity.key,
    signature: cacheIdentity.signature,
    cachedAt: reflectApply(
      dateToISOString,
      new DateConstructor(dateNow()),
      [],
    ),
    metrics: baselineMetrics,
    publicationEligibility:
      buildBaselinePublicationEligibility(baselineMetrics),
  };
  await mkdir(dirname(cacheIdentity.path), {recursive: true});
  await writeFile(
    cacheIdentity.path,
    serializeBenchmarkSemanticData(payload),
    'utf8',
  );
  metadata.cachedAt = payload.cachedAt;
  metadata.reason = BASELINE_CACHE_STORE_REASON;
  metadata.publicationEligibility = payload.publicationEligibility;
  return metadata;
}

function buildComparison(loadMetrics, baselineMetrics) {
  const sutOpsPerSec = resolveComparisonThroughput(loadMetrics);
  const sutP99LatencyMs = resolveLatencyMetric(loadMetrics, 'p99');
  const baselineTps = resolveComparisonThroughput(baselineMetrics, true);
  const baselineLatencyAvgMs = resolveLatencyMetric(
    baselineMetrics,
    'avg',
    'latencyAverageMs',
  );

  let publicationEligibility = buildComparisonPublicationEligibility(
    loadMetrics,
    baselineMetrics,
  );
  const throughputRatioSutToBaseline = safeComparisonRatio(
    sutOpsPerSec,
    baselineTps,
  );
  const p99LatencyRatioSutToBaselineAvg = safeComparisonRatio(
    sutP99LatencyMs,
    baselineLatencyAvgMs,
  );
  if (
    publicationEligibility.eligible &&
    (
      throughputRatioSutToBaseline === null ||
      (
        baselineLatencyAvgMs > ZERO &&
        p99LatencyRatioSutToBaselineAvg === null
      )
    )
  ) {
    const reasonCodes = publicationEligibility.reasonCodes;
    appendOwnArrayValue(
      reasonCodes,
      BENCHMARK_PUBLICATION_REASON.DERIVED_METRIC_INVALID,
    );
    publicationEligibility = {
      eligible: false,
      reasonCodes: uniqueSortedStrings(reasonCodes),
    };
  }
  return {
    sutOpsPerSec,
    sutP99LatencyMs,
    baselineTps,
    baselineLatencyAvgMs,
    throughputRatioSutToBaseline,
    p99LatencyRatioSutToBaselineAvg,
    throughputBasis:
      publicationEligibility.eligible ?
        BENCHMARK_CORRECT_THROUGHPUT_BASIS :
        BENCHMARK_LEGACY_THROUGHPUT_BASIS,
    publicationEligibility,
  };
}

function buildComparisonPublicationEligibility(loadMetrics, baselineMetrics) {
  const sutReceipt = ownDataValue(loadMetrics, 'semanticParity');
  const baselineReceipt = ownDataValue(baselineMetrics, 'semanticParity');
  const normalizedSutReceipt = isMissingDataValue(sutReceipt) ?
    null :
    sutReceipt;
  const normalizedBaselineReceipt = isMissingDataValue(baselineReceipt) ?
    null :
    baselineReceipt;
  const sutInspection = inspectBenchmarkSemanticReceipt(
    normalizedSutReceipt,
    BENCHMARK_SQL_DIALECT.SQLITE,
  );
  const baselineInspection = inspectBenchmarkSemanticReceipt(
    normalizedBaselineReceipt,
    BENCHMARK_SQL_DIALECT.POSTGRESQL,
  );
  const reasonCodes = [];
  const sutReasons = collectSemanticReceiptReasons(
    normalizedSutReceipt,
    BENCHMARK_SQL_DIALECT.SQLITE,
  );
  for (let index = ZERO; index < sutReasons.length; index += ONE) {
    appendOwnArrayValue(reasonCodes, sutReasons[index]);
  }
  const baselineReasons = collectSemanticReceiptReasons(
    normalizedBaselineReceipt,
    BENCHMARK_SQL_DIALECT.POSTGRESQL,
  );
  for (let index = ZERO; index < baselineReasons.length; index += ONE) {
    appendOwnArrayValue(reasonCodes, baselineReasons[index]);
  }
  if (
    sutInspection.resultSetDigest !== null &&
    baselineInspection.resultSetDigest !== null &&
    sutInspection.resultSetDigest !== baselineInspection.resultSetDigest
  ) {
    appendOwnArrayValue(
      reasonCodes,
      BENCHMARK_PUBLICATION_REASON.PAIRED_RESULT_SET_MISMATCH,
    );
  }
  appendCorrectThroughputReason(reasonCodes, loadMetrics);
  appendCorrectThroughputReason(reasonCodes, baselineMetrics);
  const uniqueReasonCodes = uniqueSortedStrings(reasonCodes);
  return {
    eligible: uniqueReasonCodes.length === ZERO,
    reasonCodes: uniqueReasonCodes,
  };
}

function resolveComparisonThroughput(metrics, allowTps = false) {
  const correctThroughput = ownDataValue(metrics, 'correctOpsPerSec');
  if (isNonNegativeSafeNumber(correctThroughput)) {
    return correctThroughput;
  }
  const diagnosticThroughput = ownDataValue(metrics, 'opsPerSec');
  if (isNonNegativeSafeNumber(diagnosticThroughput)) {
    return diagnosticThroughput;
  }
  const transactionsPerSecond = ownDataValue(metrics, 'tps');
  return allowTps && isNonNegativeSafeNumber(transactionsPerSecond) ?
    transactionsPerSecond :
    ZERO;
}

function resolveLatencyMetric(metrics, key, fallbackKey = null) {
  const latency = ownDataValue(metrics, 'latency');
  const value = ownDataValue(latency, key);
  if (isNonNegativeSafeNumber(value)) {
    return value;
  }
  const fallbackValue = fallbackKey === null ?
    ZERO :
    ownDataValue(metrics, fallbackKey);
  return isNonNegativeSafeNumber(fallbackValue) ? fallbackValue : ZERO;
}

function safeComparisonRatio(numerator, denominator) {
  if (
    !isNonNegativeSafeNumber(numerator) ||
    !isNonNegativeSafeNumber(denominator) ||
    denominator <= ZERO
  ) {
    return null;
  }
  const ratio = numerator / denominator;
  return isNonNegativeSafeNumber(ratio) ? ratio : null;
}

function normalizeLoadMetricNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return ZERO;
  }
  return parsed;
}

function firstDefinedMetric(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function buildWritePressureCounters(loadMetrics) {
  const source =
    loadMetrics?.controlPlaneWrites &&
    typeof loadMetrics.controlPlaneWrites === 'object' ?
      loadMetrics.controlPlaneWrites :
      {};
  return {
    attempted: normalizeNonNegativeInteger(source.attempted),
    coalesced: normalizeNonNegativeInteger(source.coalesced),
    unchangedSkipped: normalizeNonNegativeInteger(source.unchangedSkipped),
    failed: normalizeNonNegativeInteger(source.failed),
    timeouts: normalizeNonNegativeInteger(source.timeouts),
  };
}

function evaluateWritePressure(loadMetrics, options = {}) {
  const strictWritePressure = options.strictWritePressure === true;
  const writePressureThresholds =
    options.writePressureThresholds &&
    typeof options.writePressureThresholds === 'object' ?
      options.writePressureThresholds :
      resolveWritePressureThresholds({});
  const counters = buildWritePressureCounters(loadMetrics);
  const violations = [];

  if (
    Number.isInteger(writePressureThresholds.maxAttemptedWrites) &&
    counters.attempted > writePressureThresholds.maxAttemptedWrites
  ) {
    violations.push({
      metric: 'attempted',
      observed: counters.attempted,
      threshold: writePressureThresholds.maxAttemptedWrites,
      reason: 'attempted_writes',
    });
  }
  if (
    Number.isInteger(writePressureThresholds.maxFailedWrites) &&
    counters.failed > writePressureThresholds.maxFailedWrites
  ) {
    violations.push({
      metric: 'failed',
      observed: counters.failed,
      threshold: writePressureThresholds.maxFailedWrites,
      reason: 'failed_writes',
    });
  }
  if (
    Number.isInteger(writePressureThresholds.maxTimedOutWrites) &&
    counters.timeouts > writePressureThresholds.maxTimedOutWrites
  ) {
    violations.push({
      metric: 'timeouts',
      observed: counters.timeouts,
      threshold: writePressureThresholds.maxTimedOutWrites,
      reason: 'timed_out_writes',
    });
  }

  return {
    schemaVersion: WRITE_PRESSURE_SCHEMA_VERSION,
    strictWritePressure,
    thresholds: writePressureThresholds,
    counters,
    breached: violations.length > ZERO,
    status:
      violations.length > ZERO ?
        DISCOVERY_GATE_STATUS_FAILED :
        DISCOVERY_GATE_STATUS_PASSED,
    violations,
  };
}

function formatWritePressureViolations(writePressureResult) {
  const violations = Array.isArray(writePressureResult?.violations) ?
    writePressureResult.violations :
    [];
  return violations
    .map(
      (violation) =>
        String(violation.metric) +
        '=' +
        String(violation.observed) +
        '>' +
        String(violation.threshold),
    )
    .join('|');
}

function evaluateAuthoritativeFallbackPolicy(cdcTelemetry, options = {}) {
  const strictAuthoritativeFallback =
    options.strictAuthoritativeFallback === true;
  const thresholds =
    options.authoritativeFallbackThresholds &&
    typeof options.authoritativeFallbackThresholds === 'object' ?
      options.authoritativeFallbackThresholds :
      {maxSteadyStateWindowCount: null};
  const summary =
    cdcTelemetry?.summary?.authoritativeFallback &&
    typeof cdcTelemetry.summary.authoritativeFallback === 'object' ?
      cdcTelemetry.summary.authoritativeFallback :
      {};
  const steadyStateWindowCount = normalizeNonNegativeInteger(
    summary.steadyStateWindowCount,
  );
  const windowCount = normalizeNonNegativeInteger(summary.windowCount);
  const totalCount = normalizeNonNegativeInteger(summary.totalCount);
  const violations = [];

  if (
    Number.isInteger(thresholds.maxSteadyStateWindowCount) &&
    thresholds.maxSteadyStateWindowCount >= ZERO &&
    steadyStateWindowCount > thresholds.maxSteadyStateWindowCount
  ) {
    violations.push({
      metric: 'steadyStateWindowCount',
      observed: steadyStateWindowCount,
      threshold: thresholds.maxSteadyStateWindowCount,
      reason: 'steady_state_window_count',
    });
  }

  return {
    schemaVersion: AUTHORITATIVE_FALLBACK_POLICY_SCHEMA_VERSION,
    strictAuthoritativeFallback,
    thresholds,
    observed: {
      totalCount,
      windowCount,
      steadyStateWindowCount,
    },
    breached: violations.length > ZERO,
    status:
      violations.length > ZERO ?
        DISCOVERY_GATE_STATUS_FAILED :
        DISCOVERY_GATE_STATUS_PASSED,
    violations,
  };
}

function formatAuthoritativeFallbackViolations(authoritativeFallbackResult) {
  const violations = Array.isArray(authoritativeFallbackResult?.violations) ?
    authoritativeFallbackResult.violations :
    [];
  return violations
    .map(
      (violation) =>
        String(violation.metric) +
        '=' +
        String(violation.observed) +
        '>' +
        String(violation.threshold),
    )
    .join('|');
}

function evaluateOverloadPolicy(loadMetrics, options = {}) {
  const strictOverloadPolicy = options.strictOverloadPolicy === true;
  const overloadPolicy =
    options.overloadPolicy && typeof options.overloadPolicy === 'object' ?
      options.overloadPolicy :
      resolveOverloadPolicy({});
  const rejectedOperations = Number(loadMetrics?.rejectedOperations || ZERO);
  const queueDelayP99Ms = Number(loadMetrics?.queueDelay?.p99 || ZERO);
  const violations = [];

  if (
    Number.isInteger(overloadPolicy.maxRejectedOperations) &&
    overloadPolicy.maxRejectedOperations >= ZERO &&
    rejectedOperations > overloadPolicy.maxRejectedOperations
  ) {
    violations.push({
      metric: 'rejectedOperations',
      observed: rejectedOperations,
      threshold: overloadPolicy.maxRejectedOperations,
      reason: LOAD_METRIC_REJECTED_REASON_QUEUE_FULL,
    });
  }

  if (
    Number.isFinite(overloadPolicy.maxQueueDelayP99Ms) &&
    overloadPolicy.maxQueueDelayP99Ms >= ZERO &&
    queueDelayP99Ms > overloadPolicy.maxQueueDelayP99Ms
  ) {
    violations.push({
      metric: 'queueDelayP99Ms',
      observed: queueDelayP99Ms,
      threshold: overloadPolicy.maxQueueDelayP99Ms,
      reason: 'queue_delay_tail',
    });
  }

  return {
    strictOverloadPolicy,
    policy: overloadPolicy,
    rejectedOperations,
    queueDelayP99Ms,
    status:
      violations.length > ZERO ?
        DISCOVERY_GATE_STATUS_FAILED :
        DISCOVERY_GATE_STATUS_PASSED,
    violations,
  };
}

function formatOverloadPolicyViolations(overloadPolicyResult) {
  const violations = Array.isArray(overloadPolicyResult?.violations) ?
    overloadPolicyResult.violations :
    [];
  return violations
    .map(
      (violation) =>
        String(violation.metric) +
        '=' +
        String(violation.observed) +
        '>' +
        String(violation.threshold),
    )
    .join('|');
}

function normalizeLoadMetrics(loadMetrics) {
  const normalizedLoadMetrics =
    loadMetrics &&
    typeof loadMetrics === 'object' &&
    !Array.isArray(loadMetrics) ?
      {...loadMetrics} :
      {};
  const latency =
    normalizedLoadMetrics.latency &&
    typeof normalizedLoadMetrics.latency === 'object' ?
      normalizedLoadMetrics.latency :
      {};
  const queueDelay =
    normalizedLoadMetrics.queueDelay &&
    typeof normalizedLoadMetrics.queueDelay === 'object' ?
      normalizedLoadMetrics.queueDelay :
      {};
  const rejectedByReason =
    normalizedLoadMetrics.rejectedByReason &&
    typeof normalizedLoadMetrics.rejectedByReason === 'object' ?
      normalizedLoadMetrics.rejectedByReason :
      {};
  const undispatchedByReason =
    normalizedLoadMetrics.undispatchedByReason &&
    typeof normalizedLoadMetrics.undispatchedByReason === 'object' ?
      normalizedLoadMetrics.undispatchedByReason :
      {};

  normalizedLoadMetrics.total = normalizeLoadMetricNumber(
    normalizedLoadMetrics.total,
  );
  normalizedLoadMetrics.success = normalizeLoadMetricNumber(
    normalizedLoadMetrics.success,
  );
  normalizedLoadMetrics.failed = normalizeLoadMetricNumber(
    normalizedLoadMetrics.failed,
  );
  normalizedLoadMetrics.errors = normalizeLoadMetricNumber(
    normalizedLoadMetrics.errors,
  );
  normalizedLoadMetrics.attemptErrors = normalizeLoadMetricNumber(
    normalizedLoadMetrics.attemptErrors,
  );
  normalizedLoadMetrics.opsPerSec = normalizeLoadMetricNumber(
    normalizedLoadMetrics.opsPerSec,
  );
  normalizedLoadMetrics.correct = normalizeLoadMetricNumber(
    firstDefinedMetric(
      normalizedLoadMetrics.correct,
      normalizedLoadMetrics.success,
    ),
  );
  normalizedLoadMetrics.correctOpsPerSec = normalizeLoadMetricNumber(
    firstDefinedMetric(
      normalizedLoadMetrics.correctOpsPerSec,
      normalizedLoadMetrics.opsPerSec,
    ),
  );
  normalizedLoadMetrics.attemptedOpsPerSec = normalizeLoadMetricNumber(
    firstDefinedMetric(
      normalizedLoadMetrics.attemptedOpsPerSec,
      normalizedLoadMetrics.opsPerSec,
    ),
  );
  normalizedLoadMetrics.timedOut = normalizeLoadMetricNumber(
    normalizedLoadMetrics.timedOut,
  );
  normalizedLoadMetrics.errored = normalizeLoadMetricNumber(
    firstDefinedMetric(
      normalizedLoadMetrics.errored,
      normalizedLoadMetrics.errors,
    ),
  );
  normalizedLoadMetrics.queueOverflow = normalizeLoadMetricNumber(
    normalizedLoadMetrics.queueOverflow,
  );
  normalizedLoadMetrics.cancelled = normalizeLoadMetricNumber(
    normalizedLoadMetrics.cancelled,
  );
  normalizedLoadMetrics.latency = {
    avg: normalizeLoadMetricNumber(latency.avg),
    p50: normalizeLoadMetricNumber(latency.p50),
    p95: normalizeLoadMetricNumber(latency.p95),
    p99: normalizeLoadMetricNumber(latency.p99),
  };
  normalizedLoadMetrics.queueDelay = {
    avg: normalizeLoadMetricNumber(queueDelay.avg),
    p50: normalizeLoadMetricNumber(queueDelay.p50),
    p95: normalizeLoadMetricNumber(queueDelay.p95),
    p99: normalizeLoadMetricNumber(queueDelay.p99),
    max: normalizeLoadMetricNumber(queueDelay.max),
  };
  normalizedLoadMetrics.rejectedOperations = normalizeLoadMetricNumber(
    normalizedLoadMetrics.rejectedOperations,
  );
  normalizedLoadMetrics.rejectedByReason = {
    [LOAD_METRIC_REJECTED_REASON_QUEUE_FULL]: normalizeLoadMetricNumber(
      rejectedByReason[LOAD_METRIC_REJECTED_REASON_QUEUE_FULL],
    ),
    [LOAD_METRIC_REJECTED_REASON_FLOW_CONTROL]: normalizeLoadMetricNumber(
      rejectedByReason[LOAD_METRIC_REJECTED_REASON_FLOW_CONTROL],
    ),
    [LOAD_METRIC_REJECTED_REASON_ADMISSION]: normalizeLoadMetricNumber(
      rejectedByReason[LOAD_METRIC_REJECTED_REASON_ADMISSION],
    ),
  };
  normalizedLoadMetrics.targetOperations = normalizeLoadMetricNumber(
    normalizedLoadMetrics.targetOperations,
  );
  normalizedLoadMetrics.offered = normalizeLoadMetricNumber(
    firstDefinedMetric(
      normalizedLoadMetrics.offered,
      normalizedLoadMetrics.targetOperations,
    ),
  );
  normalizedLoadMetrics.dispatchedOperations = normalizeLoadMetricNumber(
    normalizedLoadMetrics.dispatchedOperations,
  );
  normalizedLoadMetrics.undispatchedOperations = normalizeLoadMetricNumber(
    normalizedLoadMetrics.undispatchedOperations,
  );
  normalizedLoadMetrics.undispatchedByReason = {
    [LOAD_METRIC_UNDISPATCHED_REASON_CAPACITY]: normalizeLoadMetricNumber(
      undispatchedByReason[LOAD_METRIC_UNDISPATCHED_REASON_CAPACITY],
    ),
    [LOAD_METRIC_UNDISPATCHED_REASON_DURATION_TIMEOUT]:
      normalizeLoadMetricNumber(
        undispatchedByReason[LOAD_METRIC_UNDISPATCHED_REASON_DURATION_TIMEOUT],
      ),
    [LOAD_METRIC_UNDISPATCHED_REASON_CANCELLED]: normalizeLoadMetricNumber(
      undispatchedByReason[LOAD_METRIC_UNDISPATCHED_REASON_CANCELLED],
    ),
  };
  normalizedLoadMetrics.perNode =
    normalizedLoadMetrics.perNode &&
    typeof normalizedLoadMetrics.perNode === 'object' &&
    !Array.isArray(normalizedLoadMetrics.perNode) ?
      normalizedLoadMetrics.perNode :
      {};
  for (const [nodeId, nodeMetrics] of Object.entries(
    normalizedLoadMetrics.perNode,
  )) {
    const nodeSample =
      nodeMetrics && typeof nodeMetrics === 'object' ? nodeMetrics : {};
    const nodeRejectedByReason =
      nodeSample.rejectedByReason &&
      typeof nodeSample.rejectedByReason === 'object' ?
        nodeSample.rejectedByReason :
        {};
    normalizedLoadMetrics.perNode[nodeId] = {
      ...nodeSample,
      queuePressureSignals: normalizeLoadMetricNumber(
        nodeSample.queuePressureSignals,
      ),
      rejected: normalizeLoadMetricNumber(nodeSample.rejected),
      rejectedByReason: {
        [LOAD_METRIC_REJECTED_REASON_QUEUE_FULL]: normalizeLoadMetricNumber(
          nodeRejectedByReason[LOAD_METRIC_REJECTED_REASON_QUEUE_FULL],
        ),
      },
    };
  }

  return normalizedLoadMetrics;
}

function normalizeDiagnosticsSampleCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return ZERO;
  }
  return Math.max(ZERO, Math.floor(parsed));
}

function resolveDiagnosticsCoverage(convergence) {
  const sampleCounts =
    convergence?.diagnostics?.writePath?.sampleCounts &&
    typeof convergence.diagnostics.writePath.sampleCounts === 'object' ?
      convergence.diagnostics.writePath.sampleCounts :
      {};
  const writePathSamples = {
    [DIAGNOSTICS_SAMPLE_KEY_RAFT_PROPOSE]: normalizeDiagnosticsSampleCount(
      sampleCounts[DIAGNOSTICS_SAMPLE_KEY_RAFT_PROPOSE],
    ),
    [DIAGNOSTICS_SAMPLE_KEY_TRANSPORT_DELIVER]: normalizeDiagnosticsSampleCount(
      sampleCounts[DIAGNOSTICS_SAMPLE_KEY_TRANSPORT_DELIVER],
    ),
    [DIAGNOSTICS_SAMPLE_KEY_SQLITE]: normalizeDiagnosticsSampleCount(
      sampleCounts[DIAGNOSTICS_SAMPLE_KEY_SQLITE],
    ),
  };
  const sampleCount =
    writePathSamples[DIAGNOSTICS_SAMPLE_KEY_RAFT_PROPOSE] +
    writePathSamples[DIAGNOSTICS_SAMPLE_KEY_TRANSPORT_DELIVER] +
    writePathSamples[DIAGNOSTICS_SAMPLE_KEY_SQLITE];
  if (sampleCount > ZERO) {
    return {
      status: DIAGNOSTICS_COVERAGE_STATUS_AVAILABLE,
      reason: null,
      sampleCount,
      writePathSamples,
    };
  }
  return {
    status: DIAGNOSTICS_COVERAGE_STATUS_UNAVAILABLE,
    reason: DIAGNOSTICS_COVERAGE_REASON_NOT_REPORTED,
    sampleCount: ZERO,
    writePathSamples,
  };
}

function resolveSutPerNodeBudget(benchmarkConfig, nodeClientPolicySnapshot) {
  if (
    Number.isInteger(benchmarkConfig.loadNodeMaxInFlight) &&
    benchmarkConfig.loadNodeMaxInFlight > ZERO
  ) {
    return benchmarkConfig.loadNodeMaxInFlight;
  }
  const policyBudget = Number(
    nodeClientPolicySnapshot?.[NODE_CLIENT_CHANNEL.LOAD]?.maxInFlightPerNode,
  );
  if (Number.isInteger(policyBudget) && policyBudget > ZERO) {
    return policyBudget;
  }
  return null;
}

function resolveBaselinePerNodeBudget(
  benchmarkConfig,
  baselineLoadNodeCount,
  baselinePoolMaxConnections,
) {
  if (
    Number.isInteger(benchmarkConfig?.loadNodeMaxInFlight) &&
    benchmarkConfig.loadNodeMaxInFlight > ZERO
  ) {
    return benchmarkConfig.loadNodeMaxInFlight;
  }
  const loadNodeCount =
    Number.isInteger(baselineLoadNodeCount) && baselineLoadNodeCount > ZERO ?
      baselineLoadNodeCount :
      ONE;
  const poolMaxConnections =
    Number.isInteger(baselinePoolMaxConnections) &&
    baselinePoolMaxConnections > ZERO ?
      baselinePoolMaxConnections :
      ONE;
  return Math.max(ONE, Math.ceil(poolMaxConnections / loadNodeCount));
}

function resolveBaselineLoadNodeCountForRun({
  benchmarkConfig,
  targetSutLoadNodeCount,
  effectiveSutLoadNodeCount = null,
}) {
  if (benchmarkConfig.strictParity !== true) {
    return benchmarkConfig.baselineLoadNodeCount;
  }
  if (benchmarkConfig.strictDiscovery === true) {
    return targetSutLoadNodeCount;
  }
  if (
    Number.isInteger(effectiveSutLoadNodeCount) &&
    effectiveSutLoadNodeCount > ZERO
  ) {
    return effectiveSutLoadNodeCount;
  }
  return targetSutLoadNodeCount;
}

function buildLoadParity({
  benchmarkConfig,
  benchmarkTableName,
  sutLoadNodes,
  baselineLoadNodeCount,
  baselinePoolMaxConnections,
  nodeClientPolicySnapshot,
}) {
  const effectiveSutLoadNodeCount = Array.isArray(sutLoadNodes) ?
    sutLoadNodes.length :
    ZERO;
  const effectiveBaselineLoadNodeCount =
    Number.isInteger(baselineLoadNodeCount) && baselineLoadNodeCount > ZERO ?
      baselineLoadNodeCount :
      ONE;
  const sutPerNodeBudget = resolveSutPerNodeBudget(
    benchmarkConfig,
    nodeClientPolicySnapshot,
  );
  const baselinePerNodeBudget = resolveBaselinePerNodeBudget(
    benchmarkConfig,
    effectiveBaselineLoadNodeCount,
    baselinePoolMaxConnections,
  );

  const configured = {
    workloadProfile: BENCHMARK_WORKLOAD_PROFILE,
    operations: BENCHMARK_WORKLOAD_OPERATIONS,
    durationSeconds: parseDurationToMs(benchmarkConfig.loadDuration) / 1000,
    targetOpsPerSec: benchmarkConfig.loadOpsPerSec,
    loadNodeCount: benchmarkConfig.baselineLoadNodeCount,
    loadMaxInFlight: benchmarkConfig.loadMaxInFlight,
    loadNodeMaxInFlight: benchmarkConfig.loadNodeMaxInFlight,
    tableName: benchmarkConfig.tableName,
  };
  const effective = {
    sutLoadNodeCount: effectiveSutLoadNodeCount,
    baselineLoadNodeCount: effectiveBaselineLoadNodeCount,
    sutPerNodeBudget,
    baselinePerNodeBudget,
    tableName: benchmarkTableName,
  };
  const reasons = [];
  if (effectiveSutLoadNodeCount !== effectiveBaselineLoadNodeCount) {
    reasons.push({
      code: LOAD_PARITY_REASON_LOAD_FANOUT_MISMATCH,
      expected: effectiveBaselineLoadNodeCount,
      actual: effectiveSutLoadNodeCount,
    });
  }
  if (
    Number.isInteger(sutPerNodeBudget) &&
    Number.isInteger(baselinePerNodeBudget) &&
    sutPerNodeBudget !== baselinePerNodeBudget
  ) {
    reasons.push({
      code: LOAD_PARITY_REASON_PER_NODE_BUDGET_MISMATCH,
      expected: baselinePerNodeBudget,
      actual: sutPerNodeBudget,
    });
  }
  if (benchmarkConfig.tableName !== benchmarkTableName) {
    reasons.push({
      code: LOAD_PARITY_REASON_TABLE_NAME_MISMATCH,
      expected: benchmarkTableName,
      actual: benchmarkConfig.tableName,
    });
  }

  return {
    status:
      reasons.length === ZERO ?
        LOAD_PARITY_STATUS_MATCHED :
        LOAD_PARITY_STATUS_MISMATCHED,
    reasons,
    configured,
    effective,
  };
}

function formatLoadParityReasons(loadParity) {
  const reasons = Array.isArray(loadParity?.reasons) ? loadParity.reasons : [];
  if (reasons.length === ZERO) {
    return 'unknown';
  }
  return reasons
    .map(
      (reason) =>
        String(reason?.code || 'unknown') +
        '(expected=' +
        String(reason?.expected) +
        ',actual=' +
        String(reason?.actual) +
        ')',
    )
    .join(', ');
}

function buildEffectiveAdmissionPolicy({
  benchmarkConfig,
  nodeClientPolicySnapshot,
  nodeClientChannelPolicyOverrides,
}) {
  const loadPolicy =
    nodeClientPolicySnapshot?.[NODE_CLIENT_CHANNEL.LOAD] &&
    typeof nodeClientPolicySnapshot[NODE_CLIENT_CHANNEL.LOAD] === 'object' ?
      nodeClientPolicySnapshot[NODE_CLIENT_CHANNEL.LOAD] :
      {};
  const loadPolicyOverrides =
    nodeClientChannelPolicyOverrides?.[NODE_CLIENT_CHANNEL.LOAD] &&
    typeof nodeClientChannelPolicyOverrides[NODE_CLIENT_CHANNEL.LOAD] ===
      'object' ?
      nodeClientChannelPolicyOverrides[NODE_CLIENT_CHANNEL.LOAD] :
      {};
  const benchmarkLoadNodeMaxInFlight =
    Number.isInteger(benchmarkConfig.loadNodeMaxInFlight) &&
    benchmarkConfig.loadNodeMaxInFlight > ZERO ?
      benchmarkConfig.loadNodeMaxInFlight :
      null;
  const overrideLoadNodeMaxInFlight =
    Number.isInteger(loadPolicyOverrides.maxInFlightPerNode) &&
    loadPolicyOverrides.maxInFlightPerNode > ZERO ?
      loadPolicyOverrides.maxInFlightPerNode :
      null;
  const conflicts = [];
  if (
    Number.isInteger(benchmarkLoadNodeMaxInFlight) &&
    Number.isInteger(overrideLoadNodeMaxInFlight) &&
    benchmarkLoadNodeMaxInFlight !== overrideLoadNodeMaxInFlight
  ) {
    conflicts.push({
      code: ADMISSION_CONFLICT_LOAD_NODE_MAX_IN_FLIGHT,
      benchmarkValue: benchmarkLoadNodeMaxInFlight,
      overrideValue: overrideLoadNodeMaxInFlight,
    });
  }
  return {
    sources: {
      benchmark: {
        loadNodeMaxInFlight: benchmarkLoadNodeMaxInFlight,
        loadQueryTimeoutMs: benchmarkConfig.loadQueryTimeoutMs,
        nodeFailureThreshold: benchmarkConfig.nodeFailureThreshold,
        nodeFailureCooldownMs: benchmarkConfig.nodeFailureCooldownMs,
      },
      channelOverrides: {
        loadMaxInFlightPerNode: overrideLoadNodeMaxInFlight,
        loadTimeoutMs:
          Number.isInteger(loadPolicyOverrides.timeoutMs) &&
          loadPolicyOverrides.timeoutMs > ZERO ?
            loadPolicyOverrides.timeoutMs :
            null,
        loadCircuitBreakerThreshold:
          Number.isInteger(loadPolicyOverrides.circuitBreakerThreshold) &&
          loadPolicyOverrides.circuitBreakerThreshold > ZERO ?
            loadPolicyOverrides.circuitBreakerThreshold :
            null,
        loadCooldownMs:
          Number.isInteger(loadPolicyOverrides.cooldownMs) &&
          loadPolicyOverrides.cooldownMs > ZERO ?
            loadPolicyOverrides.cooldownMs :
            null,
      },
    },
    resolved: {
      loadMaxInFlightPerNode:
        Number.isInteger(loadPolicy.maxInFlightPerNode) &&
        loadPolicy.maxInFlightPerNode > ZERO ?
          loadPolicy.maxInFlightPerNode :
          null,
      loadTimeoutMs:
        Number.isInteger(loadPolicy.timeoutMs) && loadPolicy.timeoutMs > ZERO ?
          loadPolicy.timeoutMs :
          null,
      loadCircuitBreakerThreshold:
        Number.isInteger(loadPolicy.circuitBreakerThreshold) &&
        loadPolicy.circuitBreakerThreshold > ZERO ?
          loadPolicy.circuitBreakerThreshold :
          null,
      loadCooldownMs:
        Number.isInteger(loadPolicy.cooldownMs) && loadPolicy.cooldownMs > ZERO ?
          loadPolicy.cooldownMs :
          null,
      loadRetryBudget:
        Number.isInteger(loadPolicy.retryBudget) &&
        loadPolicy.retryBudget >= ZERO ?
          loadPolicy.retryBudget :
          null,
    },
    conflicts,
  };
}

function createInitialPostLoadDrain(effectiveSutLoadNodes, excludedNodeIds) {
  return {
    status: POST_LOAD_DRAIN_STATUS_OK,
    mode: GATE_RESULT_MODE.ALL_READY,
    attempts: ZERO,
    stableElapsedMs: ZERO,
    error: null,
    reasonHistogram: {},
    partitionGroupInFlight: {},
    includedNodeIds: effectiveSutLoadNodes.map((node) => node.id),
    excludedNodeIds: [...excludedNodeIds],
  };
}

function sumPartitionGroupInFlight(partitionGroupInFlight = {}) {
  let total = ZERO;
  if (!partitionGroupInFlight || typeof partitionGroupInFlight !== 'object') {
    return total;
  }
  for (const count of Object.values(partitionGroupInFlight)) {
    total += normalizeNonNegativeInteger(count);
  }
  return total;
}

function buildPreLoadRebalancingPressure(quiescenceResult, benchmarkConfig) {
  return {
    mode: quiescenceResult?.mode || 'unknown',
    attempts: normalizeNonNegativeInteger(quiescenceResult?.attempts),
    stableElapsedMs: normalizeNonNegativeInteger(
      quiescenceResult?.stableElapsedMs,
    ),
    maxReplicaOpsInFlightThreshold: normalizeNonNegativeInteger(
      benchmarkConfig?.preloadMaxReplicaOpsInFlight,
    ),
    inFlightReplicaOps: normalizeNonNegativeInteger(
      quiescenceResult?.inFlightCount,
    ),
    partitionGroupInFlight: quiescenceResult?.partitionGroupInFlight || {},
    reasonHistogram: quiescenceResult?.reasonHistogram || {},
  };
}

function buildPostLoadDrainRebalancingPressure(postLoadDrain, benchmarkConfig) {
  const partitionGroupInFlight = postLoadDrain?.partitionGroupInFlight || {};
  return {
    status: String(postLoadDrain?.status || POST_LOAD_DRAIN_STATUS_FAILED),
    mode: String(postLoadDrain?.mode || POST_LOAD_DRAIN_MODE_FAILED),
    attempts: normalizeNonNegativeInteger(postLoadDrain?.attempts),
    stableElapsedMs: normalizeNonNegativeInteger(
      postLoadDrain?.stableElapsedMs,
    ),
    maxReplicaOpsInFlightThreshold: normalizeNonNegativeInteger(
      benchmarkConfig?.loadRebalanceMaxReplicaOpsInFlight,
    ),
    inFlightReplicaOps: sumPartitionGroupInFlight(partitionGroupInFlight),
    partitionGroupInFlight,
    reasonHistogram: postLoadDrain?.reasonHistogram || {},
    error: postLoadDrain?.error || null,
  };
}

function buildLeaderSignatureFromSnapshot(snapshot) {
  const leaders =
    snapshot?.leaders && typeof snapshot.leaders === 'object' ?
      snapshot.leaders :
      {};
  return JSON.stringify(
    Object.entries(leaders)
      .map(([partitionId, nodeId]) => [String(partitionId), String(nodeId)])
      .sort((left, right) => left[0].localeCompare(right[0])),
  );
}

function normalizeRoutingAdmissionReasons(reasons) {
  const normalizedReasons = Array.isArray(reasons) ?
    reasons
      .map((reason) => String(reason || '').trim())
      .filter((reason) => reason.length > ZERO) :
    [];
  return uniqueSorted(normalizedReasons);
}

function normalizeRoutingAdmissionGrace(grace) {
  if (!grace || typeof grace !== 'object' || grace.active !== true) {
    return null;
  }
  const deadlineAtMs = normalizeOptionalNonNegativeInteger(grace.deadlineAtMs);
  if (!Number.isInteger(deadlineAtMs)) {
    return null;
  }
  const startedAtMs = normalizeOptionalNonNegativeInteger(grace.startedAtMs);
  return {
    active: true,
    startedAtMs: Number.isInteger(startedAtMs) ? startedAtMs : deadlineAtMs,
    deadlineAtMs,
    lastError:
      typeof grace.lastError === 'string' && grace.lastError.length > ZERO ?
        grace.lastError :
        null,
  };
}

function resolveLoadRoutingAdmissionProbeErrorGraceMs(benchmarkConfig = {}) {
  if (
    Number.isInteger(benchmarkConfig.loadRoutingProbeErrorGraceMs) &&
    benchmarkConfig.loadRoutingProbeErrorGraceMs >= ZERO
  ) {
    return benchmarkConfig.loadRoutingProbeErrorGraceMs;
  }
  const snapshotPolicy =
    NODE_CLIENT_DEFAULT_CHANNEL_POLICIES?.[NODE_CLIENT_CHANNEL.SNAPSHOT] || {};
  const controlQueryTimeoutMs =
    Number.isInteger(benchmarkConfig.controlQueryTimeoutMs) &&
    benchmarkConfig.controlQueryTimeoutMs > ZERO ?
      benchmarkConfig.controlQueryTimeoutMs :
      normalizeNonNegativeInteger(snapshotPolicy.timeoutMs);
  const snapshotCooldownMs = normalizeNonNegativeInteger(
    snapshotPolicy.cooldownMs,
  );
  const pollIntervalMs =
    Number.isInteger(benchmarkConfig.loadRebalanceMonitorPollIntervalMs) &&
    benchmarkConfig.loadRebalanceMonitorPollIntervalMs > ZERO ?
      benchmarkConfig.loadRebalanceMonitorPollIntervalMs :
      BENCHMARK_LOAD_REBALANCE_MONITOR_POLL_INTERVAL_MS_DEFAULT;
  return Math.max(
    ZERO,
    Number.isInteger(controlQueryTimeoutMs) ? controlQueryTimeoutMs : ZERO,
    Number.isInteger(snapshotCooldownMs) ?
      snapshotCooldownMs + pollIntervalMs :
      ZERO,
    pollIntervalMs * 3,
  );
}

function resolveRoutingAdmissionProbeErrorGraceState(
  previousState,
  observedAtMs,
  probeErrorGraceMs,
  reason,
) {
  const lastReadyObservedAtMs = normalizeOptionalNonNegativeInteger(
    previousState?.lastReadyObservedAtMs,
  );
  if (
    !Number.isInteger(lastReadyObservedAtMs) ||
    !Number.isInteger(probeErrorGraceMs) ||
    probeErrorGraceMs <= ZERO ||
    !Number.isInteger(observedAtMs)
  ) {
    return null;
  }
  const deadlineAtMs = lastReadyObservedAtMs + probeErrorGraceMs;
  if (observedAtMs > deadlineAtMs) {
    return null;
  }
  const previousGrace = normalizeRoutingAdmissionGrace(previousState?.grace);
  return {
    lastReadyObservedAtMs,
    grace: {
      active: true,
      startedAtMs: Number.isInteger(previousGrace?.startedAtMs) ?
        previousGrace.startedAtMs :
        observedAtMs,
      deadlineAtMs,
      lastError: reason,
    },
  };
}

function buildLoadRoutingAdmissionState(options = {}) {
  const admittedNodeIds = uniqueSorted(
    (Array.isArray(options.admittedNodeIds) ? options.admittedNodeIds : [])
      .map((nodeId) => String(nodeId || '').trim())
      .filter((nodeId) => nodeId.length > ZERO),
  );
  const initialObservedAtMs = normalizeOptionalNonNegativeInteger(
    options.initialObservedAtMs,
  );
  const stateByNodeId = {};
  for (const nodeId of admittedNodeIds) {
    stateByNodeId[nodeId] = {
      nodeId,
      ready: true,
      reasons: [],
      source: null,
      observedAtMs: null,
      lastReadyObservedAtMs: initialObservedAtMs,
      grace: null,
    };
  }
  return {
    schemaVersion: LOAD_ROUTING_ADMISSION_SCHEMA_VERSION,
    admittedNodeIds,
    probeErrorGraceMs: normalizeNonNegativeInteger(options.probeErrorGraceMs),
    sampleCount: ZERO,
    blockedSampleCount: ZERO,
    allowedSampleCount: ZERO,
    graceSampleCount: ZERO,
    stateByNodeId,
    transitions: [],
    probeErrors: [],
  };
}

export const POSTGRES_BASELINE_COMPARISON_BASELINE_CACHE_AND_POLICY_BUNDLE = {
  ...POSTGRES_BASELINE_COMPARISON_QUIESCENCE_AND_REPLICATION_BUNDLE,
  buildBaselineCacheIdentity,
  buildBaselineCacheMetadata,
  isValidBaselineMetrics,
  buildBaselinePublicationEligibility,
  isCacheEntryFresh,
  loadBaselineMetricsFromCache,
  storeBaselineMetricsInCache,
  buildComparison,
  buildComparisonPublicationEligibility,
  normalizeLoadMetricNumber,
  buildWritePressureCounters,
  evaluateWritePressure,
  formatWritePressureViolations,
  evaluateAuthoritativeFallbackPolicy,
  formatAuthoritativeFallbackViolations,
  evaluateOverloadPolicy,
  formatOverloadPolicyViolations,
  normalizeLoadMetrics,
  normalizeDiagnosticsSampleCount,
  resolveDiagnosticsCoverage,
  resolveSutPerNodeBudget,
  resolveBaselinePerNodeBudget,
  resolveBaselineLoadNodeCountForRun,
  buildLoadParity,
  formatLoadParityReasons,
  buildEffectiveAdmissionPolicy,
  createInitialPostLoadDrain,
  sumPartitionGroupInFlight,
  buildPreLoadRebalancingPressure,
  buildPostLoadDrainRebalancingPressure,
  buildLeaderSignatureFromSnapshot,
  normalizeRoutingAdmissionReasons,
  normalizeRoutingAdmissionGrace,
  resolveLoadRoutingAdmissionProbeErrorGraceMs,
  resolveRoutingAdmissionProbeErrorGraceState,
  buildLoadRoutingAdmissionState,
};
