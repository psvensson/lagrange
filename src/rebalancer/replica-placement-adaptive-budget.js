// Public entry: decideAdaptiveResourceWindow, createAdaptivePlacementBudgetController, PLACEMENT_ADAPTIVE_WINDOW_ACTION, PLACEMENT_ADAPTIVE_BUDGET_REASON, PLACEMENT_ADAPTIVE_OBSERVATION_STATE.
// Required collaborators: none for pure decision functions; optional readNodeObservation / pressureGovernor / resourceDiagnosticsSampler for controller.
// Durable authority / commit point: chosen source and target limits (kSrc, kTgt, kSrcForClass) are frozen into the PLACEMENT_ADMIT statement before Raft proposal and applied deterministically by all replicas against committed occupancy.
// Permitted post-commit work: soft window state tracking and event-driven budget recovery notifications.
// Recovery / wake entry: resetForNewLeadership resets soft estimates on leadership start while preserving durable occupancy from readPlacementCensus; recordObservation wakes ReplicaPlacementOwner when a constrained budget grows or a hard exclusion clears.
// Representative production tests: test/rebalancer/replica-placement-adaptive-budget.test.js, test/rebalancer/replica-placement-owner-core.test.js.
import {PLACEMENT_COPY_CAPACITY} from
  './replica-placement-owner-constants.js';
import {
  evaluatePassBudgetsForController,
  readRemoteHeartbeatObservation,
  resolveMoveCopyLimitsForController,
} from './replica-placement-owner-capacity.js';

const PLACEMENT_ADAPTIVE_WINDOW_ACTION = Object.freeze({
  INCREASE: 'INCREASE', DECREASE: 'DECREASE', HOLD: 'HOLD', RESET: 'RESET',
});

const PLACEMENT_ADAPTIVE_OBSERVATION_STATE = Object.freeze({
  FRESH: 'FRESH', INCOMPLETE: 'INCOMPLETE', STALE: 'STALE', UNAVAILABLE: 'UNAVAILABLE',
});

const PLACEMENT_ADAPTIVE_BUDGET_REASON = Object.freeze({
  INITIAL_DEFAULT: 'INITIAL_DEFAULT',
  BOOT_INCARNATION_RESET: 'BOOT_INCARNATION_RESET',
  HARD_MEMORY_LIMIT_REACHED: 'HARD_MEMORY_LIMIT_REACHED',
  HARD_STORAGE_LIMIT_REACHED: 'HARD_STORAGE_LIMIT_REACHED',
  OBSERVATION_UNAVAILABLE: 'OBSERVATION_UNAVAILABLE',
  OBSERVATION_INCOMPLETE: 'OBSERVATION_INCOMPLETE',
  OBSERVATION_STALE: 'OBSERVATION_STALE',
  OBSERVATION_BOOT_INCARNATION_MISMATCH: 'OBSERVATION_BOOT_INCARNATION_MISMATCH',
  EVENT_LOOP_CONGESTION: 'EVENT_LOOP_CONGESTION',
  SINGLE_THREAD_CPU_QUEUE_CONGESTION: 'SINGLE_THREAD_CPU_QUEUE_CONGESTION',
  INIT_QUEUE_CONGESTION: 'INIT_QUEUE_CONGESTION',
  STORAGE_WRITE_LATENCY_CONGESTION: 'STORAGE_WRITE_LATENCY_CONGESTION',
  TRANSFER_BACKPRESSURE_CONGESTION: 'TRANSFER_BACKPRESSURE_CONGESTION',
  STAGE_THROUGHPUT_DEGRADATION_CONGESTION: 'STAGE_THROUGHPUT_DEGRADATION_CONGESTION',
  ATTRIBUTED_RESOURCE_CONGESTION: 'ATTRIBUTED_RESOURCE_CONGESTION',
  CONGESTION_EPISODE_ALREADY_APPLIED: 'CONGESTION_EPISODE_ALREADY_APPLIED',
  AT_MINIMUM_WINDOW_CONGESTED: 'AT_MINIMUM_WINDOW_CONGESTED',
  HYSTERESIS_BAND_HOLD: 'HYSTERESIS_BAND_HOLD',
  WORKLOAD_IDLE_OR_UNCONSTRAINED: 'WORKLOAD_IDLE_OR_UNCONSTRAINED',
  AT_MAXIMUM_WINDOW: 'AT_MAXIMUM_WINDOW',
  OBSERVATION_COOLDOWN_HOLD: 'OBSERVATION_COOLDOWN_HOLD',
  RECOVERY_HYSTERESIS_HOLD: 'RECOVERY_HYSTERESIS_HOLD',
  HEALTHY_BUDGET_CONSTRAINED_DEMAND: 'HEALTHY_BUDGET_CONSTRAINED_DEMAND',
});

const PLACEMENT_ADAPTIVE_WINDOW_DEFAULTS = Object.freeze({
  SOURCE: Object.freeze({
    initialLimit: PLACEMENT_COPY_CAPACITY.K_SRC, minLimit: 1, maxLimit: 8,
    additiveIncrease: 1, multiplicativeDecrease: 0.75,
  }),
  TARGET: Object.freeze({
    initialLimit: PLACEMENT_COPY_CAPACITY.K_TGT, minLimit: 1, maxLimit: 6,
    additiveIncrease: 1, multiplicativeDecrease: 0.75,
  }),
  TIMING: Object.freeze({
    minAdjustIntervalMs: 1_000, maxSampleAgeMs: 15_000, requiredHealthySamplesAfterDecrease: 1,
  }),
  THRESHOLDS: Object.freeze({
    healthyEventLoopDelayMs: 25, congestionEventLoopDelayMs: 80,
    healthyEluPercent: 75, congestionEluPercent: 92,
    healthyMainThreadCpuPercent: 80, congestionMainThreadCpuPercent: 95,
    healthyInitQueueDelayMs: 50, congestionInitQueueDelayMs: 200,
    healthyWriteLatencyMs: 25, congestionWriteLatencyMs: 100,
    healthyTransferQueueDelayMs: 50, congestionTransferQueueDelayMs: 200,
    baseStageAllowanceMs: 500, minHealthyStageBytesPerMs: 2_048,
    defaultRequiredMemoryReserveBytes: 64 * 1024 * 1024,
  }),
});

const ACTION = PLACEMENT_ADAPTIVE_WINDOW_ACTION;
const REASON = PLACEMENT_ADAPTIVE_BUDGET_REASON;
const OBS_STATE = PLACEMENT_ADAPTIVE_OBSERVATION_STATE;
const DEFAULTS = PLACEMENT_ADAPTIVE_WINDOW_DEFAULTS;
const MIN_DECREASE_RATIO = 0.1;
const MAX_DECREASE_RATIO = 0.95;
const MAX_CONFIGURABLE_WINDOW_LIMIT = 64;
const MAX_CONFIGURABLE_INTERVAL_MS = 600_000;
const MAX_CONFIGURABLE_HEALTHY_SAMPLES = 20;
const ROLE_SOURCE = 'source';
const ROLE_TARGET = 'target';
const SAMPLE_ID_PREFIX = 'sample:';
const TIMESTAMP_ID_PREFIX = 'ts:';

function resolveObservationSampleIdentity(observation) {
  if (!observation || typeof observation !== 'object') return null;
  if (observation.sampleId !== undefined && observation.sampleId !== null) {
    return `${SAMPLE_ID_PREFIX}${observation.sampleId}`;
  }
  const sampledAtMs = Number(observation.sampledAtMs);
  return Number.isFinite(sampledAtMs) ? `${TIMESTAMP_ID_PREFIX}${sampledAtMs}` : null;
}

function isFiniteMetric(val) {
  return val !== null && val !== undefined &&
    typeof val !== 'boolean' && Number.isFinite(Number(val));
}

function hasPrimaryLoadSensor(observation) {
  if (!observation || typeof observation !== 'object') return false;
  const directSensors = [
    observation.mainThreadCpuPercent, observation.eventLoopDelayMs,
    observation.eventLoopUtilizationPercent, observation.writeLatencyMs,
    observation.initQueueDelayMs, observation.transferQueueDelayMs,
  ];
  if (directSensors.some(isFiniteMetric)) return true;
  return isFiniteMetric(observation.stageDurationMs) &&
    Number(observation.stageDurationMs) > 0 && isFiniteMetric(observation.operationBytes);
}

function isObservationCompleteForGrowth(observation) {
  if (!observation || typeof observation !== 'object') return false;
  if (observation.pressureSensorsComplete === false) return false;
  return hasPrimaryLoadSensor(observation);
}

function clampInteger(value, minValue, maxValue, defaultValue) {
  const num = Number(value);
  if (!Number.isFinite(num)) return defaultValue;
  return Math.max(minValue, Math.min(maxValue, Math.floor(num)));
}

function normalizeWindowConfig(rawConfig = {}, roleDefaults = DEFAULTS.SOURCE) {
  const minLimit = clampInteger(
    rawConfig.minLimit, 1, MAX_CONFIGURABLE_WINDOW_LIMIT, roleDefaults.minLimit);
  const maxLimit = clampInteger(rawConfig.maxLimit, minLimit, MAX_CONFIGURABLE_WINDOW_LIMIT,
    Math.max(minLimit, roleDefaults.maxLimit));
  const initialLimit = clampInteger(rawConfig.initialLimit, minLimit, maxLimit,
    Math.max(minLimit, Math.min(maxLimit, roleDefaults.initialLimit)));
  const additiveIncrease = clampInteger(
    rawConfig.additiveIncrease, 1, maxLimit, roleDefaults.additiveIncrease);
  const rawBeta = Number(rawConfig.multiplicativeDecrease);
  const multiplicativeDecrease =
    Number.isFinite(rawBeta) && rawBeta >= MIN_DECREASE_RATIO && rawBeta <= MAX_DECREASE_RATIO ?
      rawBeta : roleDefaults.multiplicativeDecrease;
  const minAdjustIntervalMs = clampInteger(rawConfig.minAdjustIntervalMs, 0,
    MAX_CONFIGURABLE_INTERVAL_MS, DEFAULTS.TIMING.minAdjustIntervalMs);
  const maxSampleAgeMs = clampInteger(rawConfig.maxSampleAgeMs, 1,
    MAX_CONFIGURABLE_INTERVAL_MS, DEFAULTS.TIMING.maxSampleAgeMs);
  const requiredHealthySamplesAfterDecrease = clampInteger(
    rawConfig.requiredHealthySamplesAfterDecrease, 1,
    MAX_CONFIGURABLE_HEALTHY_SAMPLES, DEFAULTS.TIMING.requiredHealthySamplesAfterDecrease);
  const thresholds = Object.freeze({
    ...DEFAULTS.THRESHOLDS,
    ...(rawConfig.thresholds && typeof rawConfig.thresholds === 'object' ?
      rawConfig.thresholds : {}),
  });
  return Object.freeze({
    initialLimit, minLimit, maxLimit, additiveIncrease, multiplicativeDecrease,
    minAdjustIntervalMs, maxSampleAgeMs, requiredHealthySamplesAfterDecrease, thresholds,
  });
}

function createInitialResourceWindowState(config, bootIncarnation = null) {
  return Object.freeze({
    limit: config.initialLimit,
    bootIncarnation,
    hardAdmissionAllowed: true,
    lastAdjustedAtMs: null,
    lastDecreasedAtMs: null,
    lastCongestionEpochId: null,
    lastSampleIdentity: null,
    lastSampledAtMs: null,
    healthySamplesSinceDecrease: config.requiredHealthySamplesAfterDecrease,
  });
}

function isHardMemoryConstrained(observation, thresholds, hostLogicalNodeCount = 1) {
  if (!observation || typeof observation !== 'object') return false;
  if (observation.memoryHardConstrained === true) return true;
  const availableBytes = Number(observation.availableMemoryBytes);
  if (!Number.isFinite(availableBytes)) return false;
  const perNodeReserve = Number.isFinite(Number(observation.requiredMemoryReserveBytes)) ?
    Number(observation.requiredMemoryReserveBytes) :
    thresholds.defaultRequiredMemoryReserveBytes;
  const hostShareFactor = Math.max(1, Math.floor(Number(hostLogicalNodeCount) || 1));
  const pendingOperationBytes = Math.max(0, Number(observation.operationBytes) || 0);
  return availableBytes < (perNodeReserve * hostShareFactor) + pendingOperationBytes;
}

function isSizeNormalizedStageCongested(observation, thresholds) {
  const stageDurationMs = Number(observation?.stageDurationMs);
  if (!Number.isFinite(stageDurationMs) || stageDurationMs <= 0) return false;
  const operationBytes = Math.max(0, Number(observation?.operationBytes) || 0);
  const expectedMaxHealthyMs =
    thresholds.baseStageAllowanceMs +
    (operationBytes / Math.max(1, thresholds.minHealthyStageBytesPerMs));
  return stageDurationMs > expectedMaxHealthyMs;
}

function isMetricAtOrAbove(rawValue, threshold) {
  const num = Number(rawValue);
  return Number.isFinite(num) && num >= threshold;
}

function isMetricStrictlyAbove(rawValue, threshold) {
  const num = Number(rawValue);
  return Number.isFinite(num) && num > threshold;
}

function isMainThreadCpuQueueCongested(observation, thresholds) {
  const cpuPercent = observation.mainThreadCpuPercent;
  if (!isMetricAtOrAbove(cpuPercent, thresholds.congestionMainThreadCpuPercent)) {
    return false;
  }
  const hasQueueSensor =
    isFiniteMetric(observation.eventLoopDelayMs) ||
    isFiniteMetric(observation.initQueueDelayMs) ||
    isFiniteMetric(observation.transferQueueDelayMs);
  if (!hasQueueSensor) return true;
  return isMetricStrictlyAbove(
    observation.eventLoopDelayMs,
    thresholds.healthyEventLoopDelayMs,
  ) ||
    isMetricStrictlyAbove(observation.initQueueDelayMs, 0) ||
    isMetricStrictlyAbove(observation.transferQueueDelayMs, 0);
}

function hasDirectQueueOrStageSensor(observation) {
  if (!observation || typeof observation !== 'object') return false;
  const directQueueSensors = [
    observation.eventLoopDelayMs, observation.writeLatencyMs,
    observation.initQueueDelayMs, observation.transferQueueDelayMs,
  ];
  if (directQueueSensors.some(isFiniteMetric)) return true;
  return isFiniteMetric(observation.stageDurationMs) &&
    Number(observation.stageDurationMs) > 0 && isFiniteMetric(observation.operationBytes);
}

function isEventLoopCongested(observation, thresholds) {
  if (isMetricAtOrAbove(observation.eventLoopDelayMs, thresholds.congestionEventLoopDelayMs)) {
    return true;
  }
  const elu = observation.eventLoopUtilizationPercent;
  if (!isMetricAtOrAbove(elu, thresholds.congestionEluPercent)) return false;
  return !isFiniteMetric(observation.eventLoopDelayMs) ||
    isMetricStrictlyAbove(observation.eventLoopDelayMs, thresholds.healthyEventLoopDelayMs);
}

function classifyDirectSensorCongestion(obs, thresholds) {
  if (isEventLoopCongested(obs, thresholds)) {
    return REASON.EVENT_LOOP_CONGESTION;
  }
  if (isMetricAtOrAbove(obs.writeLatencyMs, thresholds.congestionWriteLatencyMs)) {
    return REASON.STORAGE_WRITE_LATENCY_CONGESTION;
  }
  if (isMetricAtOrAbove(obs.initQueueDelayMs, thresholds.congestionInitQueueDelayMs)) {
    return REASON.INIT_QUEUE_CONGESTION;
  }
  if (obs.backpressured === true ||
      isMetricAtOrAbove(obs.transferQueueDelayMs, thresholds.congestionTransferQueueDelayMs)) {
    return REASON.TRANSFER_BACKPRESSURE_CONGESTION;
  }
  return null;
}

function classifyAttributedCongestion(obs, thresholds) {
  if (!obs || typeof obs !== 'object') return null;
  if (obs.congestionAttributed === true) {
    const explicit = obs.congestionReason;
    return typeof explicit === 'string' && explicit.length > 0 ?
      explicit : REASON.ATTRIBUTED_RESOURCE_CONGESTION;
  }
  const direct = classifyDirectSensorCongestion(obs, thresholds);
  if (direct !== null) return direct;
  if (isMainThreadCpuQueueCongested(obs, thresholds)) {
    return REASON.SINGLE_THREAD_CPU_QUEUE_CONGESTION;
  }
  return isSizeNormalizedStageCongested(obs, thresholds) ?
    REASON.STAGE_THROUGHPUT_DEGRADATION_CONGESTION : null;
}

function isHighUtilizationQueueDelayed(rawUtilPercent, maxHealthyPercent, observation, thresholds) {
  if (Number(rawUtilPercent) <= maxHealthyPercent) return false;
  if (!isFiniteMetric(observation.eventLoopDelayMs)) return true;
  return Number(observation.eventLoopDelayMs) > thresholds.healthyEventLoopDelayMs / 2;
}

function isEventLoopWithinHealthyBand(observation, thresholds) {
  if (isFiniteMetric(observation.eventLoopDelayMs) &&
      Number(observation.eventLoopDelayMs) > thresholds.healthyEventLoopDelayMs) {
    return false;
  }
  if (!isFiniteMetric(observation.eventLoopUtilizationPercent)) return true;
  const elu = observation.eventLoopUtilizationPercent;
  return !isHighUtilizationQueueDelayed(elu, thresholds.healthyEluPercent, observation, thresholds);
}

function isObservationWithinHealthyGrowthBand(observation, thresholds) {
  const checks = [
    [observation.initQueueDelayMs, thresholds.healthyInitQueueDelayMs],
    [observation.writeLatencyMs, thresholds.healthyWriteLatencyMs],
    [observation.transferQueueDelayMs, thresholds.healthyTransferQueueDelayMs],
  ];
  let hasMeasuredLoadSignal =
    isFiniteMetric(observation.eventLoopDelayMs) ||
    isFiniteMetric(observation.eventLoopUtilizationPercent);
  if (!isEventLoopWithinHealthyBand(observation, thresholds)) return false;
  for (const [rawVal, maxHealthy] of checks) {
    if (isFiniteMetric(rawVal)) {
      hasMeasuredLoadSignal = true;
      if (Number(rawVal) > maxHealthy) return false;
    }
  }
  if (isFiniteMetric(observation.mainThreadCpuPercent)) {
    hasMeasuredLoadSignal = true;
    const cpu = observation.mainThreadCpuPercent;
    const maxCpu = thresholds.healthyMainThreadCpuPercent;
    if (isHighUtilizationQueueDelayed(cpu, maxCpu, observation, thresholds)) {
      return false;
    }
  }
  if (!hasMeasuredLoadSignal && !isFiniteMetric(observation.stageDurationMs)) {
    return false;
  }
  return observation.backpressured !== true;
}

// Pressure alone determines the band. Demand, cooldown and window bounds
// still belong to the controller, independent of heartbeat publication.
function classifyPlacementPressure(observation, thresholds = DEFAULTS.THRESHOLDS) {
  const congestionReason = classifyAttributedCongestion(observation, thresholds);
  if (congestionReason !== null) {
    return {action: ACTION.DECREASE, reason: congestionReason};
  } else if (!isObservationCompleteForGrowth(observation)) {
    return {action: ACTION.HOLD, reason: REASON.OBSERVATION_INCOMPLETE};
  }
  return isObservationWithinHealthyGrowthBand(observation, thresholds) ?
    {action: ACTION.INCREASE, reason: null} :
    {action: ACTION.HOLD, reason: REASON.HYSTERESIS_BAND_HOLD};
}

function evaluateObservationFreshness(observation, nowMs, expectedBootIncarnation, config) {
  const hasObservation = Boolean(observation && typeof observation === 'object');
  const sampledAtMs = observation?.sampledAtMs;
  const bootMismatch =
    hasObservation &&
    Number.isSafeInteger(expectedBootIncarnation) &&
    Number.isSafeInteger(observation.bootIncarnation) &&
    observation.bootIncarnation !== expectedBootIncarnation;
  const ageMs = nowMs - sampledAtMs;
  if (!hasObservation || !Number.isFinite(sampledAtMs)) {
    return {state: OBS_STATE.UNAVAILABLE, reason: REASON.OBSERVATION_UNAVAILABLE};
  } else if (bootMismatch) {
    return {
      state: OBS_STATE.STALE,
      reason: REASON.OBSERVATION_BOOT_INCARNATION_MISMATCH,
    };
  } else if (ageMs < 0 || ageMs > config.maxSampleAgeMs) {
    return {state: OBS_STATE.STALE, reason: REASON.OBSERVATION_STALE};
  }
  return {state: OBS_STATE.FRESH, reason: REASON.INITIAL_DEFAULT};
}

function buildWindowDecision({
  limit, previousLimit, action, reason,
  hardAdmissionAllowed = true, observationState = OBS_STATE.FRESH, nextState,
}) {
  return Object.freeze({
    limit, previousLimit, action, reason, hardAdmissionAllowed, observationState,
    nextState: Object.freeze({...nextState, limit, hardAdmissionAllowed}),
  });
}

function hasExplicitDistinctCongestionEpoch(observation) {
  const epochId = observation?.congestionEpochId;
  if (epochId === undefined || epochId === null) return false;
  return epochId !== observation.sampleId && epochId !== observation.sampledAtMs;
}

function resolveCongestionEpisodeId(observation) {
  return observation.congestionEpochId ?? observation.sampleId ?? observation.sampledAtMs ?? null;
}

function isDuplicateCongestionDecrease(state, obs, sampleIdentity, episodeId, nowMs, config) {
  if (episodeId !== null && state.lastCongestionEpochId === episodeId) return true;
  if (sampleIdentity !== null && state.lastSampleIdentity === sampleIdentity &&
      state.lastDecreasedAtMs !== null) {
    return true;
  }
  return !hasExplicitDistinctCongestionEpoch(obs) &&
    Number.isFinite(state.lastDecreasedAtMs) &&
    nowMs - state.lastDecreasedAtMs < config.minAdjustIntervalMs;
}

function applyCongestionDecrease(state, observation, nowMs, congestionReason, config) {
  const sampleIdentity = resolveObservationSampleIdentity(observation);
  const episodeId = resolveCongestionEpisodeId(observation);
  if (isDuplicateCongestionDecrease(state, observation, sampleIdentity, episodeId, nowMs, config)) {
    return buildWindowDecision({
      limit: state.limit, previousLimit: state.limit,
      action: ACTION.HOLD, reason: REASON.CONGESTION_EPISODE_ALREADY_APPLIED,
      nextState: state,
    });
  }
  const decreasedState = {
    ...state,
    lastDecreasedAtMs: nowMs, lastAdjustedAtMs: nowMs,
    lastCongestionEpochId: episodeId, lastSampleIdentity: sampleIdentity,
    lastSampledAtMs: observation.sampledAtMs, healthySamplesSinceDecrease: 0,
  };
  if (state.limit <= config.minLimit) {
    return buildWindowDecision({
      limit: config.minLimit, previousLimit: state.limit,
      action: ACTION.HOLD, reason: REASON.AT_MINIMUM_WINDOW_CONGESTED,
      nextState: decreasedState,
    });
  }
  const scaled = Math.floor(state.limit * config.multiplicativeDecrease);
  const nextLimit = Math.max(config.minLimit, Math.min(state.limit - 1, scaled));
  return buildWindowDecision({
    limit: nextLimit, previousLimit: state.limit,
    action: ACTION.DECREASE, reason: congestionReason,
    nextState: {...decreasedState, limit: nextLimit},
  });
}

function resolveWindowBaseState(previousState, expectedBoot, config) {
  const bootReset =
    previousState !== null &&
    previousState !== undefined &&
    expectedBoot !== null &&
    Number.isSafeInteger(previousState.bootIncarnation) &&
    previousState.bootIncarnation !== expectedBoot;
  const baseState = !previousState || bootReset ?
    createInitialResourceWindowState(config, expectedBoot) :
    {
      ...previousState,
      bootIncarnation: expectedBoot ?? previousState.bootIncarnation ?? null,
    };
  return {baseState, bootReset};
}

function evaluateHardResourceGate(baseState, bootReset, observation, demand, config) {
  const action = bootReset ? ACTION.RESET : ACTION.HOLD;
  if (observation?.storageHardConstrained === true) {
    return buildWindowDecision({
      limit: baseState.limit, previousLimit: baseState.limit, action,
      reason: REASON.HARD_STORAGE_LIMIT_REACHED, hardAdmissionAllowed: false,
      nextState: baseState,
    });
  }
  if (isHardMemoryConstrained(observation, config.thresholds, demand.hostLogicalNodeCount)) {
    return buildWindowDecision({
      limit: baseState.limit, previousLimit: baseState.limit, action,
      reason: REASON.HARD_MEMORY_LIMIT_REACHED, hardAdmissionAllowed: false,
      nextState: baseState,
    });
  }
  return null;
}

function advanceHealthySampleState(baseState, observation) {
  const sampleIdentity = resolveObservationSampleIdentity(observation);
  const isNewSample = sampleIdentity !== null ?
    sampleIdentity !== baseState.lastSampleIdentity :
    observation.sampledAtMs !== baseState.lastSampledAtMs;
  return {
    ...baseState,
    lastSampleIdentity: sampleIdentity,
    lastSampledAtMs: observation.sampledAtMs,
    healthySamplesSinceDecrease: isNewSample ?
      baseState.healthySamplesSinceDecrease + 1 :
      baseState.healthySamplesSinceDecrease,
  };
}

function isDemandSaturatingBudget(demand, baseState, config) {
  const occupancy = Math.max(0, Number(demand.occupancy) || 0);
  const waiting = Math.max(0, Number(demand.waitingDemandCount) || 0);
  if (waiting <= 0) return false;
  if (occupancy >= baseState.limit) return true;
  return baseState.lastDecreasedAtMs !== null &&
    baseState.limit < config.initialLimit &&
    occupancy + waiting > baseState.limit;
}

function evaluateHealthyWindowGrowth(baseState, bootReset, observation, demand, nowMs, config) {
  const stateWithSample = advanceHealthySampleState(baseState, observation);
  if (!isDemandSaturatingBudget(demand, baseState, config)) {
    return buildWindowDecision({
      limit: baseState.limit, previousLimit: baseState.limit,
      action: bootReset ? ACTION.RESET : ACTION.HOLD,
      reason: bootReset ? REASON.BOOT_INCARNATION_RESET : REASON.WORKLOAD_IDLE_OR_UNCONSTRAINED,
      nextState: stateWithSample,
    });
  }
  if (stateWithSample.healthySamplesSinceDecrease < config.requiredHealthySamplesAfterDecrease) {
    return buildWindowDecision({
      limit: baseState.limit, previousLimit: baseState.limit,
      action: ACTION.HOLD, reason: REASON.RECOVERY_HYSTERESIS_HOLD, nextState: stateWithSample,
    });
  }
  if (Number.isFinite(baseState.lastAdjustedAtMs) &&
      nowMs - baseState.lastAdjustedAtMs < config.minAdjustIntervalMs) {
    return buildWindowDecision({
      limit: baseState.limit, previousLimit: baseState.limit,
      action: ACTION.HOLD, reason: REASON.OBSERVATION_COOLDOWN_HOLD, nextState: stateWithSample,
    });
  }
  const effectiveMaxLimit = hasDirectQueueOrStageSensor(observation) ?
    config.maxLimit :
    Math.min(config.maxLimit, Math.max(config.initialLimit, PLACEMENT_COPY_CAPACITY.K_TGT));
  if (baseState.limit >= effectiveMaxLimit) {
    return buildWindowDecision({
      limit: baseState.limit, previousLimit: baseState.limit,
      action: ACTION.HOLD, reason: REASON.AT_MAXIMUM_WINDOW, nextState: stateWithSample,
    });
  }
  const increasedLimit = Math.min(effectiveMaxLimit, baseState.limit + config.additiveIncrease);
  return buildWindowDecision({
    limit: increasedLimit, previousLimit: baseState.limit,
    action: ACTION.INCREASE, reason: REASON.HEALTHY_BUDGET_CONSTRAINED_DEMAND,
    nextState: {...stateWithSample, limit: increasedLimit, lastAdjustedAtMs: nowMs},
  });
}

function normalizeWindowDecisionInputs(demand, rawConfig) {
  const config = rawConfig.thresholds ?
    rawConfig : normalizeWindowConfig(rawConfig, DEFAULTS.SOURCE);
  const nowMs = Number.isFinite(Number(demand.nowMs)) ? Number(demand.nowMs) : 0;
  const expectedBoot = Number.isSafeInteger(demand.expectedBootIncarnation) ?
    demand.expectedBootIncarnation : null;
  return {config, nowMs, expectedBoot};
}

function resolvePressureThresholdsForState(baseState, config) {
  if (baseState.lastDecreasedAtMs === null || baseState.limit > config.minLimit) {
    return config.thresholds;
  }
  return {
    ...config.thresholds,
    healthyEluPercent: config.thresholds.congestionEluPercent,
    healthyMainThreadCpuPercent: config.thresholds.congestionMainThreadCpuPercent,
  };
}

/**
 * Pure pressure-aware AIMD decision table for one resource window W_r.
 * @param {Object|null} previousState
 * @param {Object|null} observation
 * @param {Object} demand - {occupancy, waitingDemandCount, nowMs, expectedBootIncarnation, hostLogicalNodeCount}.
 * @param {Object} [rawConfig]
 * @return {Object} Frozen window decision.
 */
function decideAdaptiveResourceWindow(previousState, observation, demand = {}, rawConfig = {}) {
  const {config, nowMs, expectedBoot} = normalizeWindowDecisionInputs(demand, rawConfig);
  const {baseState, bootReset} = resolveWindowBaseState(previousState, expectedBoot, config);
  const hardGate = evaluateHardResourceGate(baseState, bootReset, observation, demand, config);
  if (hardGate !== null) return hardGate;

  const freshness = evaluateObservationFreshness(observation, nowMs, expectedBoot, config);
  if (freshness.state !== OBS_STATE.FRESH) {
    return buildWindowDecision({
      limit: baseState.limit, previousLimit: baseState.limit,
      action: bootReset ? ACTION.RESET : ACTION.HOLD,
      reason: bootReset ? REASON.BOOT_INCARNATION_RESET : freshness.reason,
      observationState: freshness.state, nextState: baseState,
    });
  }
  const pressure = classifyPlacementPressure(
    observation, resolvePressureThresholdsForState(baseState, config),
  );
  if (pressure.action === ACTION.DECREASE) {
    return applyCongestionDecrease(baseState, observation, nowMs, pressure.reason, config);
  }
  const sampleStampedState = {
    ...baseState,
    lastSampleIdentity: resolveObservationSampleIdentity(observation),
    lastSampledAtMs: observation.sampledAtMs,
  };
  if (pressure.reason === REASON.OBSERVATION_INCOMPLETE) {
    return buildWindowDecision({
      limit: baseState.limit, previousLimit: baseState.limit,
      action: bootReset ? ACTION.RESET : ACTION.HOLD,
      reason: bootReset ? REASON.BOOT_INCARNATION_RESET : REASON.OBSERVATION_INCOMPLETE,
      observationState: OBS_STATE.INCOMPLETE, nextState: sampleStampedState,
    });
  }
  if (pressure.reason === REASON.HYSTERESIS_BAND_HOLD) {
    return buildWindowDecision({
      limit: baseState.limit, previousLimit: baseState.limit,
      action: ACTION.HOLD, reason: REASON.HYSTERESIS_BAND_HOLD, nextState: sampleStampedState,
    });
  }
  return evaluateHealthyWindowGrowth(baseState, bootReset, observation, demand, nowMs, config);
}

function resolveRecordedObservationArgs(observation, optionsOrNowMs) {
  if (typeof optionsOrNowMs === 'number') {
    return {nowMs: optionsOrNowMs, resourceRole: undefined, notify: true, explicitNotify: false};
  }
  const optNow = Number(optionsOrNowMs?.nowMs);
  const obsNow = Number(observation?.sampledAtMs);
  const nowMs = Number.isFinite(optNow) ? optNow : (Number.isFinite(obsNow) ? obsNow : 0);
  return {
    nowMs,
    resourceRole: optionsOrNowMs?.resourceRole,
    notify: optionsOrNowMs?.notifyOnRecovery !== false,
    explicitNotify: optionsOrNowMs?.notifyOnRecovery === true,
  };
}

function isObservationConstrained(obs, config) {
  if (!obs || typeof obs !== 'object') return false;
  if (obs.storageHardConstrained === true) return true;
  if (isHardMemoryConstrained(obs, config.thresholds, 1)) return true;
  return classifyAttributedCongestion(obs, config.thresholds) !== null;
}

function canWindowAdvanceNow(stateEntry, config, nowMs) {
  if (!stateEntry) return true;
  if (stateEntry.limit >= config.maxLimit && stateEntry.lastDecreasedAtMs === null) {
    return false;
  }
  if (!Number.isFinite(stateEntry.lastAdjustedAtMs)) return true;
  return nowMs - stateEntry.lastAdjustedAtMs >= config.minAdjustIntervalMs;
}

function wasNodePreviouslyConstrained(
  nodeId, existing, sourceStates, targetStates, sourceConfig, targetConfig,
) {
  const prevObs = existing?.target || existing?.source || null;
  if (sourceStates.get(nodeId)?.hardAdmissionAllowed === false ||
      targetStates.get(nodeId)?.hardAdmissionAllowed === false) {
    return true;
  }
  return isObservationConstrained(prevObs, targetConfig) ||
    isObservationConstrained(existing?.source || null, sourceConfig);
}

function canNodeAdvanceAnyWindow(
  nodeId, stamped, sourceStates, targetStates, sourceConfig, targetConfig, nowMs,
) {
  if (!isObservationCompleteForGrowth(stamped)) return false;
  return canWindowAdvanceNow(sourceStates.get(nodeId), sourceConfig, nowMs) ||
    canWindowAdvanceNow(targetStates.get(nodeId), targetConfig, nowMs);
}

function shouldWakeOnObservation({
  nodeId, existing, stamped, nowMs, notify, explicitNotify,
  sourceStates, targetStates, sourceConfig, targetConfig,
}) {
  if (!notify) return false;
  if (explicitNotify) return true;
  const wasConstrained = wasNodePreviouslyConstrained(
    nodeId, existing, sourceStates, targetStates, sourceConfig, targetConfig,
  );
  const isNowConstrained = isObservationConstrained(stamped, targetConfig);
  if (wasConstrained !== isNowConstrained) return true;
  if (isNowConstrained) {
    const prevObs = existing?.target || existing?.source || null;
    return prevObs?.congestionEpochId !== stamped?.congestionEpochId;
  }
  return canNodeAdvanceAnyWindow(
    nodeId, stamped, sourceStates, targetStates, sourceConfig, targetConfig, nowMs,
  );
}

function readWindowLimit(stateMap, nodeId, config) {
  const entry = stateMap.get(nodeId);
  return entry ? entry.limit : config.initialLimit;
}

function selectPreferredObservation(storedObs, liveObs) {
  if (!storedObs) return liveObs ?? null;
  if (!liveObs) return storedObs;
  const storedTs = Number(storedObs.sampledAtMs);
  const liveTs = Number(liveObs.sampledAtMs);
  if (Number.isFinite(liveTs) && (!Number.isFinite(storedTs) || liveTs > storedTs)) {
    return liveObs;
  }
  return storedObs;
}

function createAdaptivePlacementBudgetController(options = {}) {
  const sourceConfig = normalizeWindowConfig(options.sourceWindow, DEFAULTS.SOURCE);
  const targetConfig = normalizeWindowConfig(options.targetWindow, DEFAULTS.TARGET);
  const readNodeObservation = options.readNodeObservation ?? null;
  const sourceStates = new Map();
  const targetStates = new Map();
  const observationsByNode = new Map();
  const listeners = new Set();

  const getObservationFor = (nodeId, role, nowMs) => {
    const stored = observationsByNode.get(nodeId);
    const storedRoleObs = stored ? stored[role] : null;
    const liveObs = readNodeObservation ? readNodeObservation(nodeId, role, nowMs) : null;
    const chosen = selectPreferredObservation(storedRoleObs, liveObs);
    if (chosen && chosen !== storedRoleObs) {
      const next = observationsByNode.get(nodeId) || {};
      observationsByNode.set(nodeId, {
        source: role === ROLE_SOURCE ? chosen : (next.source ?? null),
        target: role === ROLE_TARGET ? chosen : (next.target ?? null),
      });
    }
    return chosen;
  };
  const currentSourceBudgetOf = (nodeId) => readWindowLimit(sourceStates, nodeId, sourceConfig);
  const currentTargetBudgetOf = (nodeId) => readWindowLimit(targetStates, nodeId, targetConfig);
  const notifyListeners = (change) => {
    for (const listener of [...listeners]) listener(change);
  };
  const stateContext = {
    sourceStates, targetStates, getObservationFor, sourceConfig, targetConfig,
    currentSourceBudgetOf, currentTargetBudgetOf,
    decideWindow: decideAdaptiveResourceWindow,
  };

  return Object.freeze({
    sourceConfig,
    targetConfig,
    subscribe(listener) {
      if (!listener) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    resetForNewLeadership() {
      sourceStates.clear();
      targetStates.clear();
    },
    getSourceBudget: currentSourceBudgetOf,
    getTargetBudget: currentTargetBudgetOf,
    getSnapshot() {
      return Object.freeze({
        sourceBudgets: Object.freeze(
          Object.fromEntries([...sourceStates.entries()].map(([k, v]) => [k, v.limit])),
        ),
        targetBudgets: Object.freeze(
          Object.fromEntries([...targetStates.entries()].map(([k, v]) => [k, v.limit])),
        ),
      });
    },
    recordObservation(nodeId, observation, optionsOrNowMs = {}) {
      const {nowMs, resourceRole, notify, explicitNotify} =
        resolveRecordedObservationArgs(observation, optionsOrNowMs);
      const existing = observationsByNode.get(nodeId) || {};
      const stamped = observation && typeof observation === 'object' ?
        {...observation} : null;
      if (resourceRole === ROLE_SOURCE) {
        observationsByNode.set(nodeId, {source: stamped, target: existing.target ?? null});
      } else if (resourceRole === ROLE_TARGET) {
        observationsByNode.set(nodeId, {source: existing.source ?? null, target: stamped});
      } else {
        observationsByNode.set(nodeId, {source: stamped, target: stamped});
      }
      if (shouldWakeOnObservation({
        nodeId, existing, stamped, nowMs, notify, explicitNotify,
        sourceStates, targetStates, sourceConfig, targetConfig,
      })) {
        notifyListeners({nodeId, resourceRole: resourceRole ?? null, nowMs});
      }
    },
    observeNodeRow(nodeId, nodeRow, nowMs = 0) {
      if (typeof nodeId !== 'string' || nodeId.length === 0 || !nodeRow) return;
      const obs = readNodeObservation ?
        readNodeObservation(nodeId, null, nowMs, nodeRow) :
        readRemoteHeartbeatObservation(nodeRow);
      if (obs) this.recordObservation(nodeId, obs, {nowMs});
    },
    resolveMoveCopyLimits(params = {}) {
      return resolveMoveCopyLimitsForController(stateContext, params);
    },
    evaluatePassBudgets(params = {}) {
      return evaluatePassBudgetsForController(stateContext, params);
    },
  });
}

export {
  PLACEMENT_ADAPTIVE_BUDGET_REASON,
  PLACEMENT_ADAPTIVE_OBSERVATION_STATE,
  PLACEMENT_ADAPTIVE_WINDOW_ACTION,
  createAdaptivePlacementBudgetController,
  decideAdaptiveResourceWindow,
  normalizeWindowConfig,
  classifyPlacementPressure,
};
