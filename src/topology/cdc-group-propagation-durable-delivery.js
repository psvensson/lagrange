// CDCGroupPropagationService's durable wave. Source debt and between-attempt
// progress remain with the source lane. No durable payload enters the existing
// immediate-batch or background-retry maps.
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
import {CDC_GROUP_FOREGROUND_CONTINUATION, CDC_GROUP_FOREGROUND_DELIVERY_STATE,
  CDC_GROUP_FOREGROUND_RETRY_STATE, CDC_GROUP_PROPAGATION_EVENT, CDC_GROUP_PROPAGATION_REASON,
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

function decideDurablePropagationAdmission(occupied, sourceMismatch = false) {
  if (occupied) return DURABLE_PROPAGATION_ADMISSION.BUSY;
  return sourceMismatch ? DURABLE_PROPAGATION_ADMISSION.SOURCE_MISMATCH :
    DURABLE_PROPAGATION_ADMISSION.ADMIT;
}

function durablePropagationRefusal(owner, admission) {
  return admission === DURABLE_PROPAGATION_ADMISSION.BUSY ?
    {...unknownCdcAcceptance(CDC_COMPLETION.BACKPRESSURE),
      retryAfterMs: owner.deliveryRetryDelayMs} :
    {...unknownCdcAcceptance(),
      fallbackReason: CDC_GROUP_PROPAGATION_REASON.SOURCE_GROUP_MISMATCH};
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

async function deliverTarget(owner, source, events, leaf, context) {
  context.assertCurrent();
  const gate = owner.resolvePropagationTrafficGate(events);
  if (gate.pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER) {
    return unknownCdcAcceptance(CDC_COMPLETION.BACKPRESSURE);
  }
  if (!owner.messageRouter || typeof owner.messageRouter.deliver !== 'function') {
    return unknownCdcAcceptance();
  }
  const profile = resolveCdcPropagationDeliveryProfile(events);
  const payload = targetDeliveryPayload(owner, source, events, leaf.route);
  return context.run(() => owner.messageRouter.deliver(leaf.route.address, payload, {
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
      const answer = progress.isSource(leaf) ?
        await context.run(() => source.applyCDCBatch(events, {
          deliveryContext: context, remainingMs: context.remainingMs,
        })) : await deliverTarget(owner, source, events, leaf, context);
      context.assertCurrent();
      progress.observe(leaf, answer);
      if (answer?.success !== true) {
        lastFailure = {state: DURABLE_PROPAGATION_CAUSE.RESPONSE, cause: answer};
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
    state: CDC_GROUP_FOREGROUND_DELIVERY_STATE.READY,
    continuation: CDC_GROUP_FOREGROUND_CONTINUATION.SOURCE_OWNER,
    deliveryLabel: owner.describeDeliveryEvents(events),
    hasPending: () => true,
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
    // Durable debt has no background retry callback: the original source lane
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

async function propagateDurableCdcEvent(owner, options) {
  const parent = options.deliveryContext;
  assertCdcDeliveryInvocation(parent);
  const admission = decideDurablePropagationAdmission(owner.activeDurablePropagation !== null);
  if (admission !== DURABLE_PROPAGATION_ADMISSION.ADMIT) {
    return durablePropagationRefusal(owner, admission);
  }
  // Admission precedes immutable capture, target capture, source effects and
  // every await. The slot is released by actual local cleanup, not response.
  const context = openCdcDeliveryChildScope(parent);
  const wave = {context, source: options.sourceMessageGroupService};
  owner.activeDurablePropagation = wave;
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
    owner.setPublicationMode(plan.useGrouped ? CDC_GROUP_PUBLICATION_MODE.GROUPED :
      CDC_GROUP_PUBLICATION_MODE.CONSERVATIVE_FANOUT, plan.fallbackReason);
    const prepared = prepareDurableForegroundWave(owner, wave, events, plan);
    const result = await owner.deliverToTargetsWithRetry({}, prepared);
    context.assertCurrent();
    return result;
  } finally {
    context.finish();
  }
}

export {propagateDurableCdcEvent};
