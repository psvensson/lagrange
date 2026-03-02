import {ASSERTION_POLICY, BENCHMARK_DEFAULTS} from './constants.js';
import {PARTITION_SERVICE_DEFAULT} from '../../../src/partition/partition-service-constants.js';

const ZERO = 0;
const ONE = 1;
const MIN_REPLICATION_FACTOR = 1;
const BENCHMARK_EVENT_TABLE_FALLBACK = 'benchmark_events';
const BENCHMARK_STRICT_DISCOVERY_DEFAULT = false;
const BENCHMARK_STRICT_PARITY_DEFAULT = false;
const BENCHMARK_STRICT_PRELOAD_READINESS_DEFAULT = false;
const BENCHMARK_STRICT_CDC_TELEMETRY_SCHEMA_DEFAULT = false;
const BENCHMARK_STRICT_AUTHORITATIVE_FALLBACK_DEFAULT = false;
const BENCHMARK_STRICT_OVERLOAD_POLICY_DEFAULT = false;
const BENCHMARK_STRICT_WRITE_PRESSURE_DEFAULT = false;
const BENCHMARK_QUIET_MODE_ENABLED_DEFAULT = null;
const BENCHMARK_REQUIRED_SUT_LOAD_NODE_COUNT_DEFAULT = null;
const BENCHMARK_PRELOAD_MAX_REPLICA_OPS_IN_FLIGHT_DEFAULT = 0;
const BENCHMARK_PIN_REBALANCING_DURING_LOAD_DEFAULT = false;
const BENCHMARK_ALLOW_LOAD_REBALANCE_PINNING_BYPASS_DEFAULT = false;
const BENCHMARK_REBALANCE_HYSTERESIS_COOLDOWN_MS_DEFAULT = 2000;
const BENCHMARK_REBALANCE_HYSTERESIS_MIN_DELTA_DEFAULT = 2;
const BENCHMARK_LOAD_REBALANCE_MONITOR_POLL_INTERVAL_MS_DEFAULT = 250;
const BENCHMARK_LOAD_REBALANCE_MAX_REPLICA_OPS_IN_FLIGHT_DEFAULT = 0;
const BENCHMARK_CRITICAL_REBALANCING_SUSTAINED_SAMPLES_DEFAULT = 3;
const BENCHMARK_FORCE_LOCAL_SYSTEM_TABLE_READ_SHORTCUT_DEFAULT = false;
const QUIESCENCE_DEFAULT_STABLE_WINDOW_MS =
  BENCHMARK_DEFAULTS.quiescentStableWindowMs;
const CONSISTENCY_ASSERT_MAX_ATTEMPTS_DEFAULT =
  BENCHMARK_DEFAULTS.consistencyAssertMaxAttempts;
const CONSISTENCY_ASSERT_RETRY_DELAY_MS_DEFAULT =
  BENCHMARK_DEFAULTS.consistencyAssertRetryDelayMs;
const INTERNAL_SIGNAL_CLASS_OPERATION_FAILED = 'operation_failed';
const INTERNAL_SIGNAL_CLASS_CDC_SAFE_FALLBACK = 'cdc_safe_fallback';
const INTERNAL_SIGNAL_CLASS_CDC_BUFFERED_WITHOUT_SUBSCRIBER =
  'cdc_buffered_without_subscriber';
const INTERNAL_SIGNAL_CLASS_CRITICAL_REBALANCING_STATE =
  'critical_rebalancing_state';
const INTERNAL_SIGNAL_CLASSES = Object.freeze([
  INTERNAL_SIGNAL_CLASS_OPERATION_FAILED,
  INTERNAL_SIGNAL_CLASS_CDC_SAFE_FALLBACK,
  INTERNAL_SIGNAL_CLASS_CDC_BUFFERED_WITHOUT_SUBSCRIBER,
  INTERNAL_SIGNAL_CLASS_CRITICAL_REBALANCING_STATE,
]);
const BENCHMARK_TABLE_POLICY_DEFAULT = Object.freeze({
  externalCdcAllowed: false,
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nestedValue of Object.values(value)) {
    deepFreeze(nestedValue);
  }
  return value;
}

function normalizeTableName(
  tableName,
  fallback = BENCHMARK_EVENT_TABLE_FALLBACK,
) {
  const candidate = String(tableName || fallback).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(candidate)) {
    return fallback;
  }
  return candidate;
}

function normalizeInternalSignalThresholdMap(value) {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const normalized = {};
  for (const [signalClass, threshold] of Object.entries(value)) {
    if (!INTERNAL_SIGNAL_CLASSES.includes(signalClass)) {
      continue;
    }
    if (Number.isInteger(threshold) && threshold >= ZERO) {
      normalized[signalClass] = threshold;
    }
  }
  return normalized;
}

function resolveInternalSignalThresholds(configuredThresholds, options = {}) {
  const configured = configuredThresholds &&
    typeof configuredThresholds === 'object' ?
    configuredThresholds :
    {};
  const strictBenchmarkMode = options.strictBenchmarkMode === true;
  const warningsByClass = normalizeInternalSignalThresholdMap(
    configured.warningsByClass,
  );
  if (
    strictBenchmarkMode &&
    !Object.prototype.hasOwnProperty.call(
      warningsByClass,
      INTERNAL_SIGNAL_CLASS_CRITICAL_REBALANCING_STATE,
    )
  ) {
    warningsByClass[INTERNAL_SIGNAL_CLASS_CRITICAL_REBALANCING_STATE] = ONE;
  }
  return {
    failOnThresholdBreach:
      configured.failOnThresholdBreach === true || strictBenchmarkMode,
    errorsByClass: normalizeInternalSignalThresholdMap(configured.errorsByClass),
    warningsByClass,
  };
}

function resolveOverloadPolicy(configuredPolicy) {
  const configured = configuredPolicy && typeof configuredPolicy === 'object' ?
    configuredPolicy :
    {};
  const maxRejectedOperations =
    Number.isInteger(configured.maxRejectedOperations) &&
      configured.maxRejectedOperations >= ZERO ?
      configured.maxRejectedOperations :
      null;
  const maxQueueDelayP99Ms = Number.isFinite(configured.maxQueueDelayP99Ms) &&
    configured.maxQueueDelayP99Ms >= ZERO ?
    Number(configured.maxQueueDelayP99Ms) :
    null;
  return {
    maxRejectedOperations,
    maxQueueDelayP99Ms,
  };
}

function resolveWritePressureThresholds(configuredThresholds) {
  const configured =
    configuredThresholds && typeof configuredThresholds === 'object' ?
      configuredThresholds :
      {};
  return {
    maxAttemptedWrites:
      Number.isInteger(configured.maxAttemptedWrites) &&
        configured.maxAttemptedWrites >= ZERO ?
        configured.maxAttemptedWrites :
        null,
    maxFailedWrites:
      Number.isInteger(configured.maxFailedWrites) &&
        configured.maxFailedWrites >= ZERO ?
        configured.maxFailedWrites :
        null,
    maxTimedOutWrites:
      Number.isInteger(configured.maxTimedOutWrites) &&
        configured.maxTimedOutWrites >= ZERO ?
        configured.maxTimedOutWrites :
        null,
  };
}

function normalizeBenchmarkTablePolicies(configuredPolicies) {
  const configured =
    configuredPolicies && typeof configuredPolicies === 'object' ?
      configuredPolicies :
      null;
  if (!configured) {
    return {...BENCHMARK_TABLE_POLICY_DEFAULT};
  }

  return {
    ...BENCHMARK_TABLE_POLICY_DEFAULT,
    ...configured,
  };
}

function resolveAuthoritativeFallbackThresholds(
  configuredThresholds,
  options = {},
) {
  const configured =
    configuredThresholds && typeof configuredThresholds === 'object' ?
      configuredThresholds :
      {};
  const strictAuthoritativeFallback =
    options.strictAuthoritativeFallback === true;
  return {
    maxSteadyStateWindowCount:
      Number.isInteger(configured.maxSteadyStateWindowCount) &&
        configured.maxSteadyStateWindowCount >= ZERO ?
        configured.maxSteadyStateWindowCount :
        (strictAuthoritativeFallback ? ONE : null),
  };
}

function calculateMinimumPreloadBudgetMs(benchmarkConfig) {
  return PARTITION_SERVICE_DEFAULT.LEARNER_PROMOTION_DELAY_MS +
    benchmarkConfig.preloadRequiredStableMs +
    benchmarkConfig.quiescentPollIntervalMs;
}

function isNormalizedPostgresBaselineBenchmarkConfig(configured) {
  if (!configured || typeof configured !== 'object') {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(configured, 'baselineLoadNodeCount') ||
    Object.prototype.hasOwnProperty.call(
      configured,
      'hasExplicitRequiredSutLoadNodeCount',
    ) ||
    Object.prototype.hasOwnProperty.call(configured, 'overloadPolicy') ||
    Object.prototype.hasOwnProperty.call(configured, 'writePressureThresholds') ||
    Object.prototype.hasOwnProperty.call(configured, 'internalSignalThresholds');
}

function shouldValidatePostgresBaselineBenchmarkBudgets(configured) {
  if (!configured || typeof configured !== 'object') {
    return false;
  }
  if (isNormalizedPostgresBaselineBenchmarkConfig(configured)) {
    return false;
  }
  if (configured.strictPreloadReadiness === true) {
    return true;
  }
  const budgetKeys = [
    'readyTimeoutMs',
    'readyPollIntervalMs',
    'quiescentTimeoutMs',
    'quiescentPollIntervalMs',
    'quiescentStableWindowMs',
    'quiescentNoProgressTimeoutMs',
    'preloadRequiredStableMs',
    'postLoadDrainTimeoutMs',
    'postLoadDrainPollIntervalMs',
    'postLoadDrainStableWindowMs',
    'postLoadDrainNoProgressTimeoutMs',
  ];
  return budgetKeys.some((key) =>
    Object.prototype.hasOwnProperty.call(configured, key),
  );
}

function assertValidPreloadBudget(benchmarkConfig) {
  const minimumBudgetMs = calculateMinimumPreloadBudgetMs(benchmarkConfig);
  if (benchmarkConfig.readyTimeoutMs < minimumBudgetMs) {
    throw new Error(
      'postgres-baseline benchmark config invalid: readyTimeoutMs=' +
        benchmarkConfig.readyTimeoutMs +
        'ms is below the minimum preload budget of ' +
        minimumBudgetMs +
        'ms',
    );
  }
  if (benchmarkConfig.quiescentTimeoutMs < minimumBudgetMs) {
    throw new Error(
      'postgres-baseline benchmark config invalid: quiescentTimeoutMs=' +
        benchmarkConfig.quiescentTimeoutMs +
        'ms is below the minimum preload budget of ' +
        minimumBudgetMs +
        'ms',
    );
  }
  if (
    Number.isInteger(benchmarkConfig.quiescentNoProgressTimeoutMs) &&
    benchmarkConfig.quiescentNoProgressTimeoutMs >=
      benchmarkConfig.quiescentTimeoutMs
  ) {
    throw new Error(
      'postgres-baseline benchmark config invalid: ' +
        'quiescentNoProgressTimeoutMs must be shorter than ' +
        'quiescentTimeoutMs',
    );
  }
  if (
    Number.isInteger(benchmarkConfig.postLoadDrainNoProgressTimeoutMs) &&
    benchmarkConfig.postLoadDrainNoProgressTimeoutMs >=
      benchmarkConfig.postLoadDrainTimeoutMs
  ) {
    throw new Error(
      'postgres-baseline benchmark config invalid: ' +
        'postLoadDrainNoProgressTimeoutMs must be shorter than ' +
        'postLoadDrainTimeoutMs',
    );
  }
}

function resolvePostgresBaselineBenchmarkConfig(configured = {}, options = {}) {
  const validateBudgets = options.validateBudgets === true;
  const tableName = normalizeTableName(
    configured.tableName || BENCHMARK_DEFAULTS.tableName,
    BENCHMARK_EVENT_TABLE_FALLBACK,
  );
  const baselineLoadNodeCount =
    Number.isInteger(configured.clients) && configured.clients > ZERO ?
      configured.clients :
      BENCHMARK_DEFAULTS.clients;
  const replicationFactor = Number.isInteger(configured.replicationFactor) &&
    configured.replicationFactor >= MIN_REPLICATION_FACTOR ?
    configured.replicationFactor :
    BENCHMARK_DEFAULTS.replicationFactor;
  const maxSyncReplicaAcks = Math.max(ZERO, replicationFactor - ONE);
  const minSyncReplicaAcks = replicationFactor > ONE ? ONE : ZERO;
  const syncReplicaAcks = Number.isInteger(configured.syncReplicaAcks) ?
    Math.max(
      minSyncReplicaAcks,
      Math.min(configured.syncReplicaAcks, maxSyncReplicaAcks),
    ) :
    Math.max(
      minSyncReplicaAcks,
      Math.min(BENCHMARK_DEFAULTS.syncReplicaAcks, maxSyncReplicaAcks),
    );
  const baselineCacheTtlMs = Number.isFinite(configured.baselineCacheTtlMs) &&
    configured.baselineCacheTtlMs >= ZERO ?
    Math.floor(configured.baselineCacheTtlMs) :
    BENCHMARK_DEFAULTS.baselineCacheTtlMs;
  const strictDiscovery =
    configured.strictDiscovery === true ?
      true :
      BENCHMARK_STRICT_DISCOVERY_DEFAULT;
  const strictParity =
    configured.strictParity === true ?
      true :
      BENCHMARK_STRICT_PARITY_DEFAULT;
  const strictPreloadReadiness =
    configured.strictPreloadReadiness === true ?
      true :
      BENCHMARK_STRICT_PRELOAD_READINESS_DEFAULT;
  const strictCdcTelemetrySchema =
    configured.strictCdcTelemetrySchema === true ?
      true :
      BENCHMARK_STRICT_CDC_TELEMETRY_SCHEMA_DEFAULT;
  const strictAuthoritativeFallback =
    configured.strictAuthoritativeFallback === true ?
      true :
      BENCHMARK_STRICT_AUTHORITATIVE_FALLBACK_DEFAULT;
  const strictOverloadPolicy =
    configured.strictOverloadPolicy === true ?
      true :
      BENCHMARK_STRICT_OVERLOAD_POLICY_DEFAULT;
  const strictWritePressure =
    configured.strictWritePressure === true ?
      true :
      BENCHMARK_STRICT_WRITE_PRESSURE_DEFAULT;
  const strictBenchmarkMode = strictDiscovery ||
    strictParity ||
    strictPreloadReadiness ||
    strictCdcTelemetrySchema ||
    strictAuthoritativeFallback ||
    strictOverloadPolicy ||
    strictWritePressure;
  const configuredQuietModeEnabled =
    configured.quietModeEnabled === true ?
      true :
      configured.quietModeEnabled === false ?
        false :
        BENCHMARK_QUIET_MODE_ENABLED_DEFAULT;
  const quietModeEnabled =
    configuredQuietModeEnabled === null ?
      strictBenchmarkMode :
      configuredQuietModeEnabled;
  const internalSignalThresholds = resolveInternalSignalThresholds(
    configured.internalSignalThresholds,
    {strictBenchmarkMode},
  );
  const criticalRebalancingSustainedSamples =
    Number.isInteger(configured.criticalRebalancingSustainedSamples) &&
      configured.criticalRebalancingSustainedSamples > ZERO ?
      configured.criticalRebalancingSustainedSamples :
      BENCHMARK_CRITICAL_REBALANCING_SUSTAINED_SAMPLES_DEFAULT;
  const explicitRequiredSutLoadNodeCount =
    Number.isInteger(configured.requiredSutLoadNodeCount) &&
      configured.requiredSutLoadNodeCount > ZERO ?
      configured.requiredSutLoadNodeCount :
      null;
  const readyTimeoutMs = Number.isInteger(configured.readyTimeoutMs) ?
    configured.readyTimeoutMs :
    BENCHMARK_DEFAULTS.readyTimeoutMs;
  const readyPollIntervalMs = Number.isInteger(configured.readyPollIntervalMs) ?
    configured.readyPollIntervalMs :
    BENCHMARK_DEFAULTS.readyPollIntervalMs;
  const quiescentStableWindowMs =
    Number.isInteger(configured.quiescentStableWindowMs) &&
      configured.quiescentStableWindowMs >= ZERO ?
      configured.quiescentStableWindowMs :
      QUIESCENCE_DEFAULT_STABLE_WINDOW_MS;
  const preloadRequiredStableMs =
    Number.isInteger(configured.preloadRequiredStableMs) &&
      configured.preloadRequiredStableMs >= ZERO ?
      configured.preloadRequiredStableMs :
      quiescentStableWindowMs;
  const quiescentTimeoutMs =
    Number.isInteger(configured.quiescentTimeoutMs) &&
      configured.quiescentTimeoutMs > ZERO ?
      configured.quiescentTimeoutMs :
      readyTimeoutMs;
  const quiescentPollIntervalMs =
    Number.isInteger(configured.quiescentPollIntervalMs) &&
      configured.quiescentPollIntervalMs > ZERO ?
      configured.quiescentPollIntervalMs :
      readyPollIntervalMs;
  const quiescentNoProgressTimeoutMs =
    Number.isInteger(configured.quiescentNoProgressTimeoutMs) &&
      configured.quiescentNoProgressTimeoutMs > ZERO ?
      configured.quiescentNoProgressTimeoutMs :
      null;
  const postLoadDrainTimeoutMs =
    Number.isInteger(configured.postLoadDrainTimeoutMs) &&
      configured.postLoadDrainTimeoutMs > ZERO ?
      configured.postLoadDrainTimeoutMs :
      quiescentTimeoutMs;
  const postLoadDrainPollIntervalMs =
    Number.isInteger(configured.postLoadDrainPollIntervalMs) &&
      configured.postLoadDrainPollIntervalMs > ZERO ?
      configured.postLoadDrainPollIntervalMs :
      quiescentPollIntervalMs;
  const postLoadDrainStableWindowMs =
    Number.isInteger(configured.postLoadDrainStableWindowMs) &&
      configured.postLoadDrainStableWindowMs >= ZERO ?
      configured.postLoadDrainStableWindowMs :
      quiescentStableWindowMs;
  const postLoadDrainNoProgressTimeoutMs =
    Number.isInteger(configured.postLoadDrainNoProgressTimeoutMs) &&
      configured.postLoadDrainNoProgressTimeoutMs > ZERO ?
      configured.postLoadDrainNoProgressTimeoutMs :
      quiescentNoProgressTimeoutMs;

  const normalized = {
    baselineImage: configured.baselineImage ||
      BENCHMARK_DEFAULTS.baselineImage,
    user: configured.user || BENCHMARK_DEFAULTS.user,
    password: configured.password || BENCHMARK_DEFAULTS.password,
    database: configured.database || BENCHMARK_DEFAULTS.database,
    port: Number.isInteger(configured.port) ?
      configured.port :
      BENCHMARK_DEFAULTS.port,
    durationSeconds: Number.isInteger(configured.durationSeconds) ?
      configured.durationSeconds :
      BENCHMARK_DEFAULTS.durationSeconds,
    clients: Number.isInteger(configured.clients) ?
      configured.clients :
      BENCHMARK_DEFAULTS.clients,
    jobs: Number.isInteger(configured.jobs) ?
      configured.jobs :
      BENCHMARK_DEFAULTS.jobs,
    loadOpsPerSec: Number.isInteger(configured.loadOpsPerSec) ?
      configured.loadOpsPerSec :
      BENCHMARK_DEFAULTS.loadOpsPerSec,
    loadDuration: configured.loadDuration || BENCHMARK_DEFAULTS.loadDuration,
    loadMaxInFlight:
      Number.isInteger(configured.loadMaxInFlight) &&
        configured.loadMaxInFlight > ZERO ?
        configured.loadMaxInFlight :
        BENCHMARK_DEFAULTS.loadMaxInFlight,
    loadQueryTimeoutMs:
      Number.isInteger(configured.loadQueryTimeoutMs) &&
        configured.loadQueryTimeoutMs > ZERO ?
        configured.loadQueryTimeoutMs :
        BENCHMARK_DEFAULTS.loadQueryTimeoutMs,
    controlQueryTimeoutMs:
      Number.isInteger(configured.controlQueryTimeoutMs) &&
        configured.controlQueryTimeoutMs > ZERO ?
        configured.controlQueryTimeoutMs :
        null,
    loadNodeMaxInFlight:
      Number.isInteger(configured.loadNodeMaxInFlight) &&
        configured.loadNodeMaxInFlight > ZERO ?
        configured.loadNodeMaxInFlight :
        null,
    maxPendingQueueDepth:
      Number.isInteger(configured.maxPendingQueueDepth) &&
        configured.maxPendingQueueDepth >= ZERO ?
        configured.maxPendingQueueDepth :
        null,
    earlyRejectOnQueueFull: configured.earlyRejectOnQueueFull === true,
    nodeFailureThreshold:
      Number.isInteger(configured.nodeFailureThreshold) &&
        configured.nodeFailureThreshold > ZERO ?
        configured.nodeFailureThreshold :
        null,
    nodeFailureCooldownMs:
      Number.isInteger(configured.nodeFailureCooldownMs) &&
        configured.nodeFailureCooldownMs > ZERO ?
        configured.nodeFailureCooldownMs :
        null,
    readyTimeoutMs,
    readyPollIntervalMs,
    tableName,
    replicationFactor,
    syncReplicaAcks,
    baselineLoadNodeCount,
    strictDiscovery,
    requiredSutLoadNodeCount:
      explicitRequiredSutLoadNodeCount ??
      BENCHMARK_REQUIRED_SUT_LOAD_NODE_COUNT_DEFAULT,
    hasExplicitRequiredSutLoadNodeCount:
      explicitRequiredSutLoadNodeCount !== null,
    strictParity,
    strictPreloadReadiness,
    strictCdcTelemetrySchema,
    strictAuthoritativeFallback,
    strictOverloadPolicy,
    strictWritePressure,
    quietModeEnabled,
    authoritativeFallbackThresholds:
      resolveAuthoritativeFallbackThresholds(
        configured.authoritativeFallbackThresholds,
        {strictAuthoritativeFallback},
      ),
    overloadPolicy: resolveOverloadPolicy(configured.overloadPolicy),
    writePressureThresholds:
      resolveWritePressureThresholds(configured.writePressureThresholds),
    benchmarkTablePolicies:
      normalizeBenchmarkTablePolicies(configured.benchmarkTablePolicies),
    preloadRequiredStableMs,
    preloadMaxReplicaOpsInFlight:
      Number.isInteger(configured.preloadMaxReplicaOpsInFlight) &&
        configured.preloadMaxReplicaOpsInFlight >= ZERO ?
        configured.preloadMaxReplicaOpsInFlight :
        BENCHMARK_PRELOAD_MAX_REPLICA_OPS_IN_FLIGHT_DEFAULT,
    pinRebalancingDuringLoad:
      configured.pinRebalancingDuringLoad === true ?
        true :
        BENCHMARK_PIN_REBALANCING_DURING_LOAD_DEFAULT,
    allowLoadRebalancePinningBypass:
      configured.allowLoadRebalancePinningBypass === true ?
        true :
        BENCHMARK_ALLOW_LOAD_REBALANCE_PINNING_BYPASS_DEFAULT,
    rebalanceHysteresisCooldownMs:
      Number.isInteger(configured.rebalanceHysteresisCooldownMs) &&
        configured.rebalanceHysteresisCooldownMs >= ZERO ?
        configured.rebalanceHysteresisCooldownMs :
        BENCHMARK_REBALANCE_HYSTERESIS_COOLDOWN_MS_DEFAULT,
    rebalanceHysteresisMinDelta:
      Number.isInteger(configured.rebalanceHysteresisMinDelta) &&
        configured.rebalanceHysteresisMinDelta > ZERO ?
        configured.rebalanceHysteresisMinDelta :
        BENCHMARK_REBALANCE_HYSTERESIS_MIN_DELTA_DEFAULT,
    loadRebalanceMonitorPollIntervalMs:
      Number.isInteger(configured.loadRebalanceMonitorPollIntervalMs) &&
        configured.loadRebalanceMonitorPollIntervalMs > ZERO ?
        configured.loadRebalanceMonitorPollIntervalMs :
        BENCHMARK_LOAD_REBALANCE_MONITOR_POLL_INTERVAL_MS_DEFAULT,
    loadRebalanceMaxReplicaOpsInFlight:
      Number.isInteger(configured.loadRebalanceMaxReplicaOpsInFlight) &&
        configured.loadRebalanceMaxReplicaOpsInFlight >= ZERO ?
        configured.loadRebalanceMaxReplicaOpsInFlight :
        BENCHMARK_LOAD_REBALANCE_MAX_REPLICA_OPS_IN_FLIGHT_DEFAULT,
    criticalRebalancingSustainedSamples,
    forceLocalSystemTableReadShortcut:
      configured.forceLocalSystemTableReadShortcut === true ?
        true :
        BENCHMARK_FORCE_LOCAL_SYSTEM_TABLE_READ_SHORTCUT_DEFAULT,
    internalSignalThresholds,
    failOnLoadParityMismatch:
      configured.failOnLoadParityMismatch === true ||
      configured.failOnParityMismatch === true,
    cacheBaselineMetrics: configured.cacheBaselineMetrics !== false,
    refreshBaselineMetrics: configured.refreshBaselineMetrics === true,
    baselineCacheTtlMs,
    quiescentTimeoutMs,
    quiescentPollIntervalMs,
    quiescentStableWindowMs,
    quiescentNoProgressTimeoutMs,
    postLoadDrainTimeoutMs,
    postLoadDrainPollIntervalMs,
    postLoadDrainStableWindowMs,
    postLoadDrainNoProgressTimeoutMs,
    consistencyAssertMaxAttempts:
      Number.isInteger(configured.consistencyAssertMaxAttempts) &&
        configured.consistencyAssertMaxAttempts > ZERO ?
        configured.consistencyAssertMaxAttempts :
        CONSISTENCY_ASSERT_MAX_ATTEMPTS_DEFAULT,
    consistencyAssertRetryDelayMs:
      Number.isInteger(configured.consistencyAssertRetryDelayMs) &&
        configured.consistencyAssertRetryDelayMs >= ZERO ?
        configured.consistencyAssertRetryDelayMs :
        CONSISTENCY_ASSERT_RETRY_DELAY_MS_DEFAULT,
    insufficientEvidencePolicy:
      configured.insufficientEvidencePolicy === ASSERTION_POLICY.HARD ?
        ASSERTION_POLICY.HARD :
        ASSERTION_POLICY.SOFT,
  };

  if (validateBudgets) {
    assertValidPreloadBudget(normalized);
  }
  return deepFreeze(normalized);
}

export {
  calculateMinimumPreloadBudgetMs,
  normalizeTableName,
  resolveAuthoritativeFallbackThresholds,
  resolveInternalSignalThresholds,
  resolveOverloadPolicy,
  resolvePostgresBaselineBenchmarkConfig,
  resolveWritePressureThresholds,
  shouldValidatePostgresBaselineBenchmarkBudgets,
};
