// Derives the tick-based tuning a raft-rs core is given from a group's
// millisecond timing: the tick length, the election timeout in ticks, and the
// fixed heartbeat, pre-vote and check-quorum settings the group constants own;
// and, from the same derivation, how often a group whose host failed may be
// reconstructed.
//
// Pure: it reads only its argument and those constants, and holds no runtime
// state.

import {RAFT_RS_GROUP_TUNING} from './raft-rs-group-constants.js';

const MIN_TICK_MS = 1;
const NATIVE_ELECTION_MAX_MULTIPLIER = 2;
const EMPTY_STRING = '';
const TYPE_BOOLEAN = 'boolean';

const RAFT_RS_TIMING_DISCREPANCY_FIELD = Object.freeze({
  TICK_INTERVAL_MS: 'tickIntervalMs',
  HEARTBEAT_MS: 'heartbeatMs',
  ELECTION_MIN_MS: 'electionMinMs',
  ELECTION_MAX_MS: 'electionMaxMs',
});

const RAFT_RS_TIMING_DISCREPANCY_REASON = Object.freeze({
  TICK_DERIVED_FROM_HEARTBEAT: 'tick_interval_derived_from_heartbeat',
  ROUNDED_TO_TICK_MULTIPLE: 'rounded_to_tick_multiple',
  ROUNDED_OR_CLAMPED_TO_ELECTION_TICK: 'rounded_or_clamped_to_election_tick',
  NATIVE_CORE_RANDOMIZES_DOUBLE_ELECTION_TICK:
    'native_core_randomizes_to_double_election_tick',
});

function numericScalarOrNaN(value) {
  return value === null || value === undefined ? Number.NaN : Number(value);
}

function finiteNumberOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === EMPTY_STRING ||
    typeof value === TYPE_BOOLEAN
  ) {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function extractRequestedTiming(timing = {}) {
  const safeTiming = timing || {};
  return Object.freeze({
    tickIntervalMs: finiteNumberOrNull(safeTiming.tickIntervalMs),
    heartbeatMs: finiteNumberOrNull(safeTiming.heartbeatMs),
    electionMinMs: finiteNumberOrNull(safeTiming.electionMinMs),
    electionMaxMs: finiteNumberOrNull(safeTiming.electionMaxMs),
  });
}

function deriveTickMsFromRequested(requested) {
  if (requested.tickIntervalMs !== null && requested.tickIntervalMs > 0) {
    return requested.tickIntervalMs;
  }
  if (requested.heartbeatMs === null) {
    return MIN_TICK_MS;
  }
  const fromHeartbeat = Math.floor(
    requested.heartbeatMs / RAFT_RS_GROUP_TUNING.HEARTBEAT_TICK);
  return Number.isFinite(fromHeartbeat) ?
    Math.max(MIN_TICK_MS, fromHeartbeat) : MIN_TICK_MS;
}

function deriveHeartbeatTickFromRequested(requested, derivedTickMs) {
  if (
    requested.heartbeatMs !== null &&
    requested.heartbeatMs > 0 &&
    requested.tickIntervalMs !== null &&
    requested.tickIntervalMs > 0
  ) {
    return Math.max(MIN_TICK_MS, Math.round(requested.heartbeatMs / derivedTickMs));
  }
  return RAFT_RS_GROUP_TUNING.HEARTBEAT_TICK;
}

function deriveElectionTickFromRequested(requested, derivedTickMs, heartbeatTick) {
  if (requested.electionMinMs !== null) {
    return Math.max(
      heartbeatTick + 1,
      Math.ceil(requested.electionMinMs / derivedTickMs),
    );
  }
  return Math.max(heartbeatTick + 1, RAFT_RS_GROUP_TUNING.ELECTION_TICK);
}

function deriveEffectiveTickParameters(timing = {}) {
  const requested = extractRequestedTiming(timing);
  const derivedTickMs = deriveTickMsFromRequested(requested);
  const heartbeatTick = deriveHeartbeatTickFromRequested(requested, derivedTickMs);
  const electionTick = deriveElectionTickFromRequested(
    requested, derivedTickMs, heartbeatTick,
  );
  return {requested, derivedTickMs, heartbeatTick, electionTick};
}

function tuningOf(timing = {}) {
  const {heartbeatTick, electionTick} = deriveEffectiveTickParameters(timing);
  return {
    electionTick,
    heartbeatTick,
    preVote: RAFT_RS_GROUP_TUNING.PRE_VOTE,
    checkQuorum: RAFT_RS_GROUP_TUNING.CHECK_QUORUM,
  };
}

// The retry window of a group whose host failed: one election timeout as the
// core counts it (its election tick times its tick length) - the same span a
// follower waits before it stands for election. A failure persists while each
// failure arrives within one window of the last instant the previous one held
// the group, whatever its class and whether or not a reconstruction
// succeeded in between; while it persists the group is reconstructed at most
// once per window, so over any span a persistent failure costs at most
// ceil(span / window) + 1 reconstructions - never one per operation or per
// failing Ready. A failure more than one window after the last one starts
// afresh and is attempted at once. The cost is the healed group's: a host
// that heals inside a window is found only by the first operation after it,
// so the group's first write after a heal waits up to one window.
function recoveryRetryWindowMsOf(timing = {}) {
  const {derivedTickMs, electionTick} = deriveEffectiveTickParameters(timing);
  return electionTick * derivedTickMs;
}

/**
 * Capture the native timing inputs of an original opening before its final
 * admission check. Coercion belongs here, not at a later native effect. No
 * input callback or mutable reference survives into tuning/reconstruction.
 * Ordinary port construction keeps its existing timing representation.
 * @param {Object} timing Original opening's millisecond timing inputs.
 * @return {Object} Frozen numeric inputs consumed by this same tuning owner.
 */
function buildDiscrepancies(requested, effective) {
  const discrepancies = [];
  if (requested.tickIntervalMs === null) {
    discrepancies.push(Object.freeze({
      field: RAFT_RS_TIMING_DISCREPANCY_FIELD.TICK_INTERVAL_MS,
      requested: requested.tickIntervalMs,
      effective: effective.tickIntervalMs,
      reason: RAFT_RS_TIMING_DISCREPANCY_REASON.TICK_DERIVED_FROM_HEARTBEAT,
    }));
  }
  if (
    requested.heartbeatMs !== null &&
    requested.heartbeatMs !== effective.effectiveHeartbeatMs
  ) {
    discrepancies.push(Object.freeze({
      field: RAFT_RS_TIMING_DISCREPANCY_FIELD.HEARTBEAT_MS,
      requested: requested.heartbeatMs,
      effective: effective.effectiveHeartbeatMs,
      reason: RAFT_RS_TIMING_DISCREPANCY_REASON.ROUNDED_TO_TICK_MULTIPLE,
    }));
  }
  if (
    requested.electionMinMs !== null &&
    requested.electionMinMs !== effective.effectiveElectionMinMs
  ) {
    discrepancies.push(Object.freeze({
      field: RAFT_RS_TIMING_DISCREPANCY_FIELD.ELECTION_MIN_MS,
      requested: requested.electionMinMs,
      effective: effective.effectiveElectionMinMs,
      reason: RAFT_RS_TIMING_DISCREPANCY_REASON.ROUNDED_OR_CLAMPED_TO_ELECTION_TICK,
    }));
  }
  if (
    requested.electionMaxMs !== null &&
    requested.electionMaxMs !== effective.effectiveElectionMaxMs
  ) {
    discrepancies.push(Object.freeze({
      field: RAFT_RS_TIMING_DISCREPANCY_FIELD.ELECTION_MAX_MS,
      requested: requested.electionMaxMs,
      effective: effective.effectiveElectionMaxMs,
      reason: RAFT_RS_TIMING_DISCREPANCY_REASON.NATIVE_CORE_RANDOMIZES_DOUBLE_ELECTION_TICK,
    }));
  }
  return Object.freeze(discrepancies);
}

function describeEffectiveRaftRsTiming(timing = {}) {
  const {requested, derivedTickMs, heartbeatTick, electionTick} =
    deriveEffectiveTickParameters(timing);
  const effectiveHeartbeatMs = heartbeatTick * derivedTickMs;
  const effectiveElectionMinMs = electionTick * derivedTickMs;
  const effectiveElectionMaxMs =
    NATIVE_ELECTION_MAX_MULTIPLIER * electionTick * derivedTickMs;
  const effective = Object.freeze({
    tickIntervalMs: derivedTickMs,
    heartbeatTick,
    electionTick,
    effectiveHeartbeatMs,
    effectiveElectionMinMs,
    effectiveElectionMaxMs,
    electionMaxControlledByCore: false,
  });
  return Object.freeze({
    requested,
    effective,
    discrepancies: buildDiscrepancies(requested, effective),
  });
}

function captureOriginalRaftRsTiming(timing = {}) {
  return Object.freeze({
    heartbeatMs: numericScalarOrNaN(timing.heartbeatMs),
    tickIntervalMs: numericScalarOrNaN(timing.tickIntervalMs),
    electionMinMs: numericScalarOrNaN(timing.electionMinMs),
    electionMaxMs: numericScalarOrNaN(timing.electionMaxMs),
  });
}

function mergeDefinedTimingFields(baseTiming = {}, patchTiming = {}) {
  const safeBase = baseTiming && typeof baseTiming === 'object' ? baseTiming : {};
  const safePatch = patchTiming && typeof patchTiming === 'object' ? patchTiming : {};
  const merged = {...safeBase};
  for (const field of [
    RAFT_RS_TIMING_DISCREPANCY_FIELD.TICK_INTERVAL_MS,
    RAFT_RS_TIMING_DISCREPANCY_FIELD.HEARTBEAT_MS,
    RAFT_RS_TIMING_DISCREPANCY_FIELD.ELECTION_MIN_MS,
    RAFT_RS_TIMING_DISCREPANCY_FIELD.ELECTION_MAX_MS,
  ]) {
    const candidate = finiteNumberOrNull(safePatch[field]);
    if (candidate !== null) {
      merged[field] = candidate;
    }
  }
  return merged;
}

function describeCreatedCoreTiming({
  createdCoreTiming,
  createdCoreTuning,
  currentTickIntervalMs = null,
  pendingConfiguredTiming = null,
}) {
  const requested = extractRequestedTiming(createdCoreTiming);
  const derivedTickMs =
    Number.isFinite(currentTickIntervalMs) && currentTickIntervalMs > 0 ?
      currentTickIntervalMs :
      deriveTickMsFromRequested(requested);
  const {heartbeatTick, electionTick} = createdCoreTuning;
  const effectiveHeartbeatMs = heartbeatTick * derivedTickMs;
  const effectiveElectionMinMs = electionTick * derivedTickMs;
  const effectiveElectionMaxMs =
    NATIVE_ELECTION_MAX_MULTIPLIER * electionTick * derivedTickMs;
  const effective = Object.freeze({
    tickIntervalMs: derivedTickMs,
    heartbeatTick,
    electionTick,
    effectiveHeartbeatMs,
    effectiveElectionMinMs,
    effectiveElectionMaxMs,
    electionMaxControlledByCore: false,
  });
  return Object.freeze({
    requested,
    effective,
    discrepancies: buildDiscrepancies(requested, effective),
    createdCoreTiming,
    createdCoreTuning,
    configuredForFutureReplicas: pendingConfiguredTiming ?
      describeEffectiveRaftRsTiming(pendingConfiguredTiming) :
      null,
    pendingRecreation: pendingConfiguredTiming !== null &&
      pendingConfiguredTiming !== undefined,
  });
}

function evaluateCoreTimingUpdate({
  currentTiming,
  createdCoreTiming,
  createdCoreTuning,
  incomingTiming,
}) {
  const nextTiming = Object.freeze(
    mergeDefinedTimingFields(currentTiming, incomingTiming),
  );
  const nextTuning = Object.freeze(tuningOf(nextTiming));
  const ticksChanged =
    createdCoreTuning !== null &&
    createdCoreTuning !== undefined &&
    (nextTuning.electionTick !== createdCoreTuning.electionTick ||
      nextTuning.heartbeatTick !== createdCoreTuning.heartbeatTick);
  if (ticksChanged) {
    const coreSnapshot = describeCreatedCoreTiming({
      createdCoreTiming,
      createdCoreTuning,
      pendingConfiguredTiming: nextTiming,
    });
    return Object.freeze({
      applied: false,
      appliedToExistingCore: false,
      pendingRecreation: true,
      nextTiming,
      nextTuning,
      ...coreSnapshot,
    });
  }
  const coreSnapshot =
    createdCoreTuning && createdCoreTiming ?
      describeCreatedCoreTiming({
        createdCoreTiming,
        createdCoreTuning,
        currentTickIntervalMs: nextTiming.tickIntervalMs ?? null,
        pendingConfiguredTiming: null,
      }) :
      describeEffectiveRaftRsTiming(nextTiming);
  return Object.freeze({
    applied: true,
    appliedToExistingCore: true,
    pendingRecreation: false,
    nextTiming,
    nextTuning,
    createdCoreTiming: createdCoreTiming || null,
    createdCoreTuning: createdCoreTuning || null,
    configuredForFutureReplicas: null,
    ...coreSnapshot,
  });
}

function summarizeLiveCoreEffectiveRaftTiming(
  configuredForFutureReplicas,
  liveCoreTimings = [],
) {
  if (!Array.isArray(liveCoreTimings) || liveCoreTimings.length === 0) {
    return Object.freeze({
      ...configuredForFutureReplicas,
      discrepancies: Array.isArray(configuredForFutureReplicas?.discrepancies) ?
        configuredForFutureReplicas.discrepancies :
        Object.freeze([]),
      appliedToExistingCore: true,
      pendingRecreation: false,
      configuredForFutureReplicas,
    });
  }
  const primaryLive = liveCoreTimings[0];
  const pendingRecreation = liveCoreTimings.some(
    (entry) => entry.pendingRecreation === true ||
      entry.effective?.heartbeatTick !==
        configuredForFutureReplicas.effective.heartbeatTick ||
      entry.effective?.electionTick !==
        configuredForFutureReplicas.effective.electionTick,
  );
  return Object.freeze({
    requested: primaryLive.requested,
    effective: primaryLive.effective,
    discrepancies: Array.isArray(primaryLive.discrepancies) ?
      primaryLive.discrepancies :
      Object.freeze([]),
    createdCoreTiming: primaryLive.createdCoreTiming,
    createdCoreTuning: primaryLive.createdCoreTuning,
    appliedToExistingCore: !pendingRecreation,
    pendingRecreation,
    configuredForFutureReplicas,
    liveCores: Object.freeze([...liveCoreTimings]),
  });
}

function recordGroupCreatedCoreTiming(group) {
  group.createdCoreTiming = captureOriginalRaftRsTiming(group.timing);
  group.createdCoreTuning = Object.freeze(tuningOf(group.timing));
  group.pendingConfiguredTiming = null;
}

function describeGroupTimingSnapshot(group) {
  if (group.createdCoreTuning && group.createdCoreTiming) {
    const snapshot = describeCreatedCoreTiming({
      createdCoreTiming: group.createdCoreTiming,
      createdCoreTuning: group.createdCoreTuning,
      currentTickIntervalMs: group.timing?.tickIntervalMs ?? null,
      pendingConfiguredTiming: group.pendingConfiguredTiming ?? null,
    });
    return Object.freeze({
      appliedToExistingCore: !snapshot.pendingRecreation,
      ...snapshot,
    });
  }
  return Object.freeze({
    appliedToExistingCore: true,
    pendingRecreation: false,
    createdCoreTiming: null,
    createdCoreTuning: null,
    configuredForFutureReplicas: null,
    ...describeEffectiveRaftRsTiming(group.timing),
  });
}

function applyGroupTimingUpdate(group, timing, deepFreeze) {
  if (
    !timing ||
    typeof timing !== 'object' ||
    Object.keys(timing).length === 0
  ) {
    return describeGroupTimingSnapshot(group);
  }
  const evaluation = evaluateCoreTimingUpdate({
    currentTiming: group.timing,
    createdCoreTiming: group.createdCoreTiming ?? null,
    createdCoreTuning: group.createdCoreTuning ?? null,
    incomingTiming: timing,
  });
  if (evaluation.appliedToExistingCore) {
    group.timing = deepFreeze(evaluation.nextTiming);
    group.pendingConfiguredTiming = null;
  } else {
    group.pendingConfiguredTiming = deepFreeze(evaluation.nextTiming);
  }
  return evaluation;
}

const groupCoreTiming = Object.freeze({
  apply: applyGroupTimingUpdate,
  recordCreated: recordGroupCreatedCoreTiming,
  snapshot: describeGroupTimingSnapshot,
});

export {
  captureOriginalRaftRsTiming,
  describeEffectiveRaftRsTiming,
  groupCoreTiming,
  recoveryRetryWindowMsOf,
  summarizeLiveCoreEffectiveRaftTiming,
  tuningOf,
};
