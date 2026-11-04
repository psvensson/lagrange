import {deliveryAnswerOf} from '../transport/transport-semantic-outcome.js';
// CDCGroupPropagationService's durable wave, its one propagation path. Source
// debt and between-attempt progress remain with the source lane; the service
// keeps no payload of its own between attempts or after the wave.
import {captureCdcEvents} from '../cdc/cdc-event-envelope.js';
import {CDC_COMPLETION, isCommittedCdcOutcome, isProvisionalCdcOutcome,
  unknownCdcAcceptance} from '../cdc/cdc-delivery-outcome.js';
import {assertCdcDeliveryInvocation, openCdcDeliveryChildScope} from
  '../cdc/cdc-delivery-invocation.js';
import {bindCdcPropagationProgress, createCdcPropagationProgress} from
  '../cdc/cdc-propagation-progress.js';
import {CDC_DELIVERY_REMAINING_MS, prepareCdcDeliveryMessage} from '../cdc/cdc-delivery-budget.js';
import {resolveCdcPropagationDeliveryProfile} from '../cache/cdc-propagation-delivery-profile.js';
import {PRESSURE_GOVERNOR_ACTION} from '../control-plane/pressure-governor.js';
import {captureDurablePropagationPlan} from './cdc-group-propagation-durable-plan.js';
import {LATENCY_TOPOLOGY_MESSAGE_TYPE} from
  './latency-topology-constants.js';
import {CDC_GROUP_FOREGROUND_RETRY_STATE, CDC_GROUP_PROPAGATION_EVENT,
  CDC_GROUP_PROPAGATION_REASON,
  CDC_GROUP_PROPAGATION_STATUS, CDC_GROUP_PROPAGATION_STRATEGY,
  CDC_GROUP_PUBLICATION_MODE} from
  './cdc-group-propagation-constants.js';

const DURABLE_PROPAGATION_ADMISSION = Object.freeze({
  ADMIT: 'admit',
  BUSY: 'busy',
  SOURCE_MISMATCH: 'source_mismatch',
});
const DURABLE_PROPAGATION_CAUSE = Object.freeze({
  NONE: 'none',
  RESPONSE: 'response',
  ERROR: 'error',
});
const CONTENDED_TABLE_SLICE_WAVES = 4;
const CONTENDED_SLICE_YIELD_HOLD_MS = 260;
const BUSY_CONTENDED_RETRY_AFTER_MS = 20;
const MIN_YIELD_HOLD_RETRY_AFTER_MS = 10;
const DEFAULT_RETRY_DELAY_MS = 50;

function enqueueWaitingDurableSliceTable(owner, tableName) {
  if (
    typeof tableName !== 'string' ||
    tableName.length === 0 ||
    tableName === owner.durableSliceTable
  ) {
    return;
  }
  if (!Array.isArray(owner.waitingDurableSliceTables)) {
    owner.waitingDurableSliceTables = [];
  }
  if (!owner.waitingDurableSliceTables.includes(tableName)) {
    owner.waitingDurableSliceTables.push(tableName);
  }
}

function dequeueWaitingDurableSliceTable(owner, tableName) {
  if (!Array.isArray(owner.waitingDurableSliceTables) || !tableName) {
    return;
  }
  const index = owner.waitingDurableSliceTables.indexOf(tableName);
  if (index !== -1) {
    owner.waitingDurableSliceTables.splice(index, 1);
  }
}

function isYieldedSliceTableDeferred(owner, tableName) {
  const holdActive =
    Number.isFinite(owner.yieldedDurableSliceUntilMs) &&
    owner.now() < owner.yieldedDurableSliceUntilMs;
  if (!holdActive) {
    return false;
  }
  const nextWaitingTable =
    Array.isArray(owner.waitingDurableSliceTables) &&
    owner.waitingDurableSliceTables.length > 0 ?
      owner.waitingDurableSliceTables[0] :
      null;
  if (nextWaitingTable !== null) {
    return (tableName ?? null) !== nextWaitingTable;
  }
  return (
    owner.yieldedDurableSliceTable !== null &&
    (tableName ?? null) === owner.yieldedDurableSliceTable
  );
}

function decideDurablePropagationAdmission(occupied, sourceMismatch = false) {
  if (occupied) return DURABLE_PROPAGATION_ADMISSION.BUSY;
  return sourceMismatch ? DURABLE_PROPAGATION_ADMISSION.SOURCE_MISMATCH :
    DURABLE_PROPAGATION_ADMISSION.ADMIT;
}

function computeBusyRetryAfterMs(owner, incomingTable) {
  if (owner.activeDurablePropagation !== null) {
    if (incomingTable !== owner.durableSliceTable) {
      enqueueWaitingDurableSliceTable(owner, incomingTable);
      owner.durableSliceContended = true;
      if ((owner.durableSliceWaves ?? 0) >= CONTENDED_TABLE_SLICE_WAVES) {
        owner.activeDurablePropagation?.context?.markContended?.();
      }
    }
    return Math.min(owner.deliveryRetryDelayMs, BUSY_CONTENDED_RETRY_AFTER_MS);
  }
  if (incomingTable !== owner.yieldedDurableSliceTable) {
    enqueueWaitingDurableSliceTable(owner, incomingTable);
  }
  return Math.max(
    MIN_YIELD_HOLD_RETRY_AFTER_MS,
    Math.min(
      owner.deliveryRetryDelayMs,
      (owner.yieldedDurableSliceUntilMs ?? 0) - owner.now(),
    ),
  );
}

function durablePropagationRefusal(owner, admission, options = null) {
  if (admission === DURABLE_PROPAGATION_ADMISSION.BUSY) {
    const incomingTable = options?.tableName ?? null;
    return {
      ...unknownCdcAcceptance(CDC_COMPLETION.BACKPRESSURE),
      retryAfterMs: computeBusyRetryAfterMs(owner, incomingTable),
    };
  }
  return {...unknownCdcAcceptance(),
    fallbackReason: CDC_GROUP_PROPAGATION_REASON.SOURCE_GROUP_MISMATCH};
}

function advanceDurablePropagationSlice(owner, tableName, context) {
  dequeueWaitingDurableSliceTable(owner, tableName);
  owner.yieldedDurableSliceTable = null;
  owner.yieldedDurableSliceUntilMs = 0;
  if (owner.durableSliceTable === tableName) {
    owner.durableSliceWaves = (owner.durableSliceWaves ?? 0) + 1;
  } else {
    owner.durableSliceTable = tableName ?? null;
    owner.durableSliceWaves = 1;
    owner.durableSliceContended =
      Array.isArray(owner.waitingDurableSliceTables) &&
      owner.waitingDurableSliceTables.length > 0;
  }
  if (owner.durableSliceContended &&
      owner.durableSliceWaves >= CONTENDED_TABLE_SLICE_WAVES) {
    context.markContended?.();
  }
}

function finishDurablePropagationSliceWave(owner, context) {
  if (context.isContended?.() === true) {
    owner.yieldedDurableSliceTable = owner.durableSliceTable;
    owner.durableSliceTable = null;
    owner.yieldedDurableSliceUntilMs =
      owner.now() +
      Math.max(
        (owner.deliveryRetryDelayMs ?? DEFAULT_RETRY_DELAY_MS) * 2,
        CONTENDED_SLICE_YIELD_HOLD_MS,
      );
    owner.durableSliceWaves = 0;
    owner.durableSliceContended = false;
  }
}

function bindWaveProgress(owner, source, events, context, plan) {
  return typeof context.bindTopology === 'function' ?
    context.bindTopology(owner, source, plan.targets) :
    bindCdcPropagationProgress(context,
      createCdcPropagationProgress(owner, source, plan.targets), events);
}

function targetDeliveryPayload(owner, source, events, target) {
  return {
    ...(events.length === 1 ? {type: LATENCY_TOPOLOGY_MESSAGE_TYPE.CDC_PROPAGATION,
      ...events[0]} : {type: LATENCY_TOPOLOGY_MESSAGE_TYPE.CDC_PROPAGATION_BATCH, events}),
    sourceNodeId: owner.nodeId,
    sourceGroupId: source.groupId,
    targetGroupId: target.groupId,
  };
}

// A target leaf is either delivered (the router's envelope) or not sent at
// all (no envelope, with the unknown-acceptance answer naming why); a
// not-sent leaf stays uncovered and the wave retries it.
function notSentTarget(error = undefined) {
  return {delivery: null, answer: unknownCdcAcceptance(error)};
}

async function deliverTarget(owner, source, events, leaf, context) {
  context.assertCurrent();
  if (owner.resolvePropagationPressure(events).action === PRESSURE_GOVERNOR_ACTION.DEFER) {
    return notSentTarget(CDC_COMPLETION.BACKPRESSURE);
  }
  if (!owner.messageRouter || typeof owner.messageRouter.deliver !== 'function') {
    return notSentTarget();
  }
  const profile = resolveCdcPropagationDeliveryProfile(events);
  const payload = targetDeliveryPayload(owner, source, events, leaf.route);
  const delivery = await context.run(() => owner.messageRouter.deliver(
    leaf.route.address, payload, {
      targetNodeId: leaf.route.coordinatorNodeId,
      deliveryPriority: profile.deliveryPriority,
      deliverySource: profile.deliverySource,
      timeoutMs: context.remainingMs(),
      remainingMs: context.remainingMs,
      deliveryContext: context,
      signal: context.signal,
      prepareDeliveryMessage: prepareCdcDeliveryMessage,
      deliveryDurationField: CDC_DELIVERY_REMAINING_MS,
    }));
  return {delivery, answer: deliveryAnswerOf(delivery)};
}

async function deliverUncoveredLeaves(owner, wave, progress, events) {
  const {context, source} = wave;
  const count = progress.leafCount();
  let lastFailure = {state: DURABLE_PROPAGATION_CAUSE.NONE};
  // A serial dispatch window is bounded by every positive router concurrency.
  // The total captured population is not capped by that window.
  for (let visited = 0; visited < count; visited += 1) {
    context.assertCurrent();
    const leaf = progress.next();
    if (leaf === null) break;
    try {
      // The source applies locally (its answer); a target is a delivery.
      const {delivery, answer} = progress.isSource(leaf) ?
        {delivery: null, answer: await context.run(() => source.applyCDCBatch(events, {
          deliveryContext: context, remainingMs: context.remainingMs,
        }))} : await deliverTarget(owner, source, events, leaf, context);
      context.assertCurrent();
      progress.observe(leaf, progress.isSource(leaf) ? answer : delivery);
      if (answer?.success !== true) {
        lastFailure = {state: DURABLE_PROPAGATION_CAUSE.RESPONSE, cause: delivery ?? answer};
      }
    } catch (error) {
      context.assertCurrent();
      lastFailure = {state: DURABLE_PROPAGATION_CAUSE.ERROR, cause: error};
    }
  }
  return lastFailure;
}

function prepareDurableForegroundWave(owner, wave, events, plan) {
  const {context, source} = wave;
  const progress = bindWaveProgress(owner, source, events, context, plan);
  let lastFailure = {state: DURABLE_PROPAGATION_CAUSE.NONE};
  const complete = (answer) => isCommittedCdcOutcome(answer, events, source.groupId) ||
    isProvisionalCdcOutcome(answer, events, source.groupId);
  const result = () => {
    const answer = progress.result();
    return complete(answer) ? propagationResult(owner, source, plan, progress, answer) :
      {...propagationResult(owner, source, plan, progress, unknownCdcAcceptance()),
        cause: lastFailure};
  };
  return {
    deliveryLabel: owner.describeDeliveryEvents(events),
    complete: () => complete(progress.result()),
    result,
    // The prepared unit is one aggregate durable wave. Leaf coverage, never
    // this diagnostic count, decides completion and source progress.
    failureCount: () => 1,
    deliver: async () => {
      lastFailure = await deliverUncoveredLeaves(owner, wave, progress, events);
      context.assertCurrent();
    },
    stopped: result,
    prepareWait: (retryDelayMs) => {
      const remainingMs = context.remainingMs();
      return {state: retryDelayMs < remainingMs ? CDC_GROUP_FOREGROUND_RETRY_STATE.ADVANCE :
        CDC_GROUP_FOREGROUND_RETRY_STATE.INSUFFICIENT_DURATION, retryDelayMs, remainingMs};
    },
    wait: (delayMs) => {
      if (plan.useGrouped) progress.refreshRoutes(plan.safeTargets, {fallback: true});
      return context.run(() => owner.sleep(delayMs));
    },
    // Unresolved debt returns to the source owner: the original source lane
    // retains the next invocation and this child scope retains actual cleanup.
  };
}

function propagationResult(owner, source, plan, progress, answer) {
  const strategy = plan.useGrouped ? CDC_GROUP_PROPAGATION_STRATEGY.GROUP_COORDINATOR :
    CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT;
  const mode = plan.useGrouped ? CDC_GROUP_PROPAGATION_STATUS.GROUPED :
    CDC_GROUP_PROPAGATION_STATUS.SAFE;
  const result = {sourceGroupId: source.groupId, targetGroupCount: progress.leafCount() - 1,
    strategy, mode, fallbackReason: plan.fallbackReason, timestamp: owner.now(), ...answer};
  owner.stats.lastStrategy = strategy;
  owner.stats.lastMode = mode;
  owner.stats.lastFallbackReason = plan.fallbackReason;
  owner.stats.lastPropagationAt = result.timestamp;
  owner.stats.lastTargetGroupCount = result.targetGroupCount;
  if (plan.useGrouped) owner.stats.groupedCount += 1;
  else owner.stats.safeCount += 1;
  owner.emit(CDC_GROUP_PROPAGATION_EVENT.PROPAGATED, result);
  return result;
}

// The publication mode a captured plan is: grouped, configured safe mode
// (repair_only, the healthy safe mode the config owner already published), or
// a conservative fan-out forced by a grouped prerequisite.
function publicationModeOf(plan) {
  if (plan.useGrouped) return CDC_GROUP_PUBLICATION_MODE.GROUPED;
  return plan.fallbackReason === CDC_GROUP_PROPAGATION_REASON.CONFIG_SAFE_MODE ?
    CDC_GROUP_PUBLICATION_MODE.REPAIR_ONLY : CDC_GROUP_PUBLICATION_MODE.CONSERVATIVE_FANOUT;
}

async function propagateDurableCdcEvent(owner, options) {
  const parent = options.deliveryContext;
  assertCdcDeliveryInvocation(parent);
  const admission = decideDurablePropagationAdmission(
    owner.activeDurablePropagation !== null ||
      isYieldedSliceTableDeferred(owner, options.tableName),
  );
  if (admission !== DURABLE_PROPAGATION_ADMISSION.ADMIT) {
    return durablePropagationRefusal(owner, admission, options);
  }
  // Admission precedes immutable capture, target capture, source effects and
  // every await. The slot is released by actual local cleanup, not response.
  const context = openCdcDeliveryChildScope(parent);
  const wave = {context, source: options.sourceMessageGroupService};
  owner.activeDurablePropagation = wave;
  advanceDurablePropagationSlice(owner, options.tableName, context);
  context.cleanup.then(() => {
    if (owner.activeDurablePropagation === wave) owner.activeDurablePropagation = null;
  });
  try {
    context.assertCurrent();
    const events = captureCdcEvents([options]);
    const plan = captureDurablePropagationPlan(owner, wave.source);
    const sourceAdmission = decideDurablePropagationAdmission(false, plan.sourceMismatch);
    if (sourceAdmission !== DURABLE_PROPAGATION_ADMISSION.ADMIT) {
      return durablePropagationRefusal(owner, sourceAdmission);
    }
    owner.setPublicationMode(publicationModeOf(plan), plan.fallbackReason);
    const prepared = prepareDurableForegroundWave(owner, wave, events, plan);
    const result = await owner.deliverToTargetsWithRetry(prepared);
    context.assertCurrent();
    if (!plan.useGrouped && result?.success === true) {
      const postPlan = captureDurablePropagationPlan(owner, wave.source);
      if (postPlan.useGrouped) {
        owner.setPublicationMode(publicationModeOf(postPlan), postPlan.fallbackReason);
      }
    }
    return result;
  } finally {
    finishDurablePropagationSliceWave(owner, context);
    context.finish();
  }
}

export {propagateDurableCdcEvent};
