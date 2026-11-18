/**
 * Diagnostics for the durable CDC propagation delivery (log lines only).
 *
 * A delivery carries one vector to one recipient group. Its trace is a plain
 * record it carries while it runs: when it was admitted, which recipient it
 * addressed, how long the source apply or the target delivery took and how
 * each attempt ended. Nothing reads the trace but the line written when the
 * delivery finishes ("CDC durable wave finished": one line per recipient
 * delivery). All three lines are throttled and go to the console sink only:
 * CDC propagation may itself be carrying a logs-table write.
 */

import {ThrottledDiagnosticsLine} from '../diagnostics/throttled-diagnostics-line.js';
import {
  NODE_HEALTH_SERIES,
  recordNodeHealthSample,
} from '../diagnostics/node-health-buffer.js';
import {CDC_GROUP_PROPAGATION_LOG_MSG, CDC_GROUP_PROPAGATION_SUBSYSTEM} from
  './cdc-group-propagation-constants.js';

// At most four finished-wave lines a second per node; the rest are counted.
const WAVE_FINISHED_WINDOW_MS = 250;
const WAVE_REFUSED_WINDOW_MS = 1000;
const TARGET_SKIPPED_WINDOW_MS = 1000;
const MAX_TRACED_TARGETS = 16;
const WAVE_FINISHED_KEY = 'wave_finished';

// The one refusal left: the grouped plan names another source group. There
// is no shared slot, so no delivery is refused for another table's sake.
const DURABLE_WAVE_REFUSAL = Object.freeze({
  SOURCE_MISMATCH: 'source_mismatch',
});

const TARGET_SKIP_REASON = Object.freeze({
  PRESSURE_DEFERRED: 'pressure_deferred',
  NOT_ROUTABLE: 'not_routable',
});

const TARGET_OUTCOME = Object.freeze({
  SUCCESS: 'success',
  NOT_SUCCESSFUL: 'not_successful',
  THREW: 'threw',
});

// A trace records the captured plan's fallback reason once the plan is
// captured; until then (and for a plan with none) the line carries null.
const PLAN_ROUTING_REASON_NOT_RECORDED = null;

const waveFinishedLine = new ThrottledDiagnosticsLine({
  message: CDC_GROUP_PROPAGATION_LOG_MSG.DURABLE_WAVE_FINISHED,
  windowMs: WAVE_FINISHED_WINDOW_MS,
  maxField: 'maxWaveMs',
});
const waveRefusedLine = new ThrottledDiagnosticsLine({
  message: CDC_GROUP_PROPAGATION_LOG_MSG.DURABLE_WAVE_REFUSED,
  windowMs: WAVE_REFUSED_WINDOW_MS,
  maxField: 'maxRetryAfterMs',
});
const targetSkippedLine = new ThrottledDiagnosticsLine({
  message: CDC_GROUP_PROPAGATION_LOG_MSG.TARGET_SKIPPED,
  windowMs: TARGET_SKIPPED_WINDOW_MS,
  maxField: 'maxSkippedMs',
});

function sourceFields(owner, event) {
  return {
    subsystem: CDC_GROUP_PROPAGATION_SUBSYSTEM,
    localNodeId: owner.nodeId,
    tableName: event.tableName ?? null,
    sourcePartition: event.sourcePartition ?? null,
    sourceLogIndex: event.sourceLogIndex ?? null,
    sourceOrdinal: event.sourceOrdinal ?? null,
  };
}

/**
 * @param {Object} owner - The CDC group propagation service.
 * @return {Object} The trace an admitted wave carries.
 */
function openDurableWaveTrace(owner) {
  return {
    admittedAtMs: owner.now(),
    recipientGroupId: null,
    eventCount: null,
    planRoutingReason: PLAN_ROUTING_REASON_NOT_RECORDED,
    sourceApplyMs: null,
    targets: [],
    untracedTargetAttempts: 0,
  };
}

function classifyTargetOutcome(attempt) {
  if (attempt.error) {
    return TARGET_OUTCOME.THREW;
  }
  return attempt.answer?.success === true ?
    TARGET_OUTCOME.SUCCESS :
    TARGET_OUTCOME.NOT_SUCCESSFUL;
}

function describeLeafError(attempt) {
  if (attempt.error) {
    return String(attempt.error);
  }
  return attempt.answer?.success === true ? null : attempt.answer?.error ?? null;
}

/**
 * Record how one leaf attempt of the wave ended.
 * @param {Object} trace - The wave's trace.
 * @param {Object} attempt - {isSource, leaf, elapsedMs, answer, error}.
 * @return {void}
 */
function traceWaveLeaf(trace, attempt) {
  if (attempt.isSource) {
    trace.sourceApplyMs = (trace.sourceApplyMs ?? 0) + attempt.elapsedMs;
    return;
  }
  if (trace.targets.length >= MAX_TRACED_TARGETS) {
    trace.untracedTargetAttempts += 1;
    return;
  }
  trace.targets.push({
    groupId: attempt.leaf.groupId,
    coordinatorNodeId: attempt.leaf.route?.coordinatorNodeId ?? null,
    deliverMs: attempt.elapsedMs,
    outcome: classifyTargetOutcome(attempt),
    error: describeLeafError(attempt),
  });
}

/**
 * The delivery finished: one throttled line with its whole trace. The source
 * position fields name the first event of its vector, eventCount its length
 * and recipientGroupId the one recipient group it addressed;
 * activeDeliveries is how many deliveries the node has in flight.
 * @param {Object} owner - The CDC group propagation service.
 * @param {Object} event - The first durable source event of the wave's vector.
 * @param {Object} trace - The wave's trace.
 * @return {void}
 */
function reportDurableWaveFinished(owner, event, trace) {
  const waveMs = owner.now() - trace.admittedAtMs;
  // Every finished delivery, not only the throttled line; it cannot throw.
  recordNodeHealthSample(NODE_HEALTH_SERIES.CDC_WAVES, () => ({
    waveMs,
    sourceApplyMs: trace.sourceApplyMs,
    eventCount: trace.eventCount,
    targets: trace.targets.length,
    failedTargets: trace.targets
      .filter((target) => target.outcome !== TARGET_OUTCOME.SUCCESS).length,
  }));
  waveFinishedLine.report(WAVE_FINISHED_KEY, waveMs, () => {
    return {
      ...sourceFields(owner, event),
      originHlc: event.timestamp ?? null,
      eventCount: trace.eventCount,
      recipientGroupId: trace.recipientGroupId,
      admittedAtMs: trace.admittedAtMs,
      waveMs,
      sourceApplyMs: trace.sourceApplyMs,
      targets: trace.targets,
      untracedTargetAttempts: trace.untracedTargetAttempts,
      planRoutingReason: trace.planRoutingReason,
      activeDeliveries: owner.activeDurableDeliveries?.size ?? null,
    };
  });
}

/**
 * A delivery was refused because the grouped plan names another source
 * group: one throttled line.
 * @param {Object} owner - The CDC group propagation service.
 * @param {Object} event - The first event of the refused vector.
 * @param {Object} answer - The refusal answer returned to the source.
 * @return {void}
 */
function reportDurableWaveRefused(owner, event, answer) {
  const retryAfterMs = answer?.retryAfterMs ?? null;
  waveRefusedLine.report(DURABLE_WAVE_REFUSAL.SOURCE_MISMATCH, retryAfterMs, () => ({
    ...sourceFields(owner, event),
    refusal: DURABLE_WAVE_REFUSAL.SOURCE_MISMATCH,
    retryAfterMs,
  }));
}

/**
 * A target leaf was not sent at all: one throttled line per reason.
 * @param {Object} owner - The CDC group propagation service.
 * @param {Object} event - The first event of the wave.
 * @param {Object} route - The target's route (group, coordinator, address).
 * @param {string} reason - One of TARGET_SKIP_REASON.
 * @param {string|null} planRoutingReason - The reason the captured plan
 *   routes conservatively, if it does.
 * @return {void}
 */
function reportCdcTargetSkipped(owner, event, route, reason, planRoutingReason) {
  targetSkippedLine.report(reason, null, () => ({
    ...sourceFields(owner, event),
    groupId: route?.groupId ?? null,
    coordinatorNodeId: route?.coordinatorNodeId ?? null,
    routeAddressKnown: typeof route?.address === 'string' && route.address.length > 0,
    reason,
    planRoutingReason,
  }));
}

export {
  DURABLE_WAVE_REFUSAL,
  TARGET_SKIP_REASON,
  openDurableWaveTrace,
  reportCdcTargetSkipped,
  reportDurableWaveFinished,
  reportDurableWaveRefused,
  traceWaveLeaf,
};
