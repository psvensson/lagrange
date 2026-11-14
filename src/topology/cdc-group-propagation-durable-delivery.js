import {TRANSPORT_DELIVERY_OUTCOME_REASON_CODE, classifyThrownDeliveryError,
  deliveryAnswerOf, deliveryTransportOf, isDeliveredTransportDeliveryOutcome} from
  '../transport/transport-semantic-outcome.js';
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

const DURABLE_PROPAGATION_CAUSE = Object.freeze({
  NONE: 'none',
  RESPONSE: 'response',
  ERROR: 'error',
});

function durablePropagationRefusal() {
  return {...unknownCdcAcceptance(),
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

// A target leaf is either delivered (the router's envelope) or not sent at
// all (no envelope, with the unknown-acceptance answer naming why); a
// not-sent leaf stays uncovered and the wave retries it.
function notSentTarget(error = undefined, retryAfterMs = 0) {
  return {delivery: null, answer: {...unknownCdcAcceptance(error),
    ...(Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? {retryAfterMs} : {})}};
}

// How one attempt at a leaf was refused. Typed backpressure is a refusal
// before any effect at that leaf, typed by its owner: the CDC outcome owner's
// BACKPRESSURE answer (the source group's or a recipient's commit queue
// refusing the vector before any proposal), the pressure governor's defer (the
// leaf was not sent), or the transport owner's outbound-queue rejection or
// preemption (outbound_queue_backpressured, never sent). Any other outcome (a
// timeout, a closed or missing connection, a handler failure, an unknown or
// invalid answer, any other throw) is not, and is never relabelled: the leaf
// was attempted and an effect at it is possible.
const NOT_BACKPRESSURE = Object.freeze({backpressure: false, retryAfterMs: null});

function typedBackpressure(retryAfterMs) {
  return Object.freeze({backpressure: true,
    retryAfterMs: Number.isFinite(retryAfterMs) && retryAfterMs > 0 ? retryAfterMs : null});
}

function refusalOfAnswer(answer) {
  return answer?.error === CDC_COMPLETION.BACKPRESSURE ?
    typedBackpressure(answer.retryAfterMs) : NOT_BACKPRESSURE;
}

function refusalOfTransport(transport) {
  return transport.reasonCode ===
    TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.OUTBOUND_QUEUE_BACKPRESSURED ?
    typedBackpressure(transport.retryAfterMs) : NOT_BACKPRESSURE;
}

function refusalOfLeaf(delivery, answer) {
  if (delivery === null) return refusalOfAnswer(answer);
  const transport = deliveryTransportOf(delivery);
  return isDeliveredTransportDeliveryOutcome(transport) ?
    refusalOfAnswer(answer) : refusalOfTransport(transport);
}

// The leaves the wave leaves uncovered now: one full rotation of the bound
// progress, which visits every leaf once and so returns the rotation to
// where it stood.
function uncoveredLeavesOf(progress) {
  const leaves = [];
  progress.leafCount();
  for (let dispatch = progress.next(); dispatch !== null; dispatch = progress.next()) {
    leaves.push(dispatch.target);
  }
  return leaves;
}

// A leaf's standing within one wave is monotone across the wave's foreground
// attempts. Once an attempt at it ended in anything but typed backpressure, an
// effect at it is possible for the rest of the wave and no later refusal
// undoes that; while it was only ever refused by typed backpressure, its
// standing is its latest refusal.
function recordLeafRefusal(refusals, leaf, refusal) {
  if (refusals.get(leaf) !== NOT_BACKPRESSURE) refusals.set(leaf, refusal);
}

// The answer of a wave that is not complete: typed backpressure, carrying the
// smallest hint of the leaves' latest refusals, when every leaf it leaves
// uncovered was only ever refused by typed backpressure in this wave;
// otherwise (a leaf with a possible effect, or one never attempted) unknown.
function uncoveredWaveAnswer(progress, refusals) {
  const refused = uncoveredLeavesOf(progress).map((leaf) =>
    refusals.get(leaf) ?? NOT_BACKPRESSURE);
  if (refused.length === 0 || !refused.every((refusal) => refusal.backpressure)) {
    return unknownCdcAcceptance();
  }
  const hints = refused.map((refusal) => refusal.retryAfterMs).filter((hint) => hint !== null);
  return {...unknownCdcAcceptance(CDC_COMPLETION.BACKPRESSURE),
    ...(hints.length > 0 ? {retryAfterMs: Math.min(...hints)} : {})};
}

async function deliverTarget(owner, source, events, leaf, context) {
  context.assertCurrent();
  const pressure = owner.resolvePropagationPressure(events);
  if (pressure.action === PRESSURE_GOVERNOR_ACTION.DEFER) {
    return notSentTarget(CDC_COMPLETION.BACKPRESSURE, pressure.retryAfterMs);
  }
  if (
    !owner.messageRouter ||
    typeof owner.messageRouter.deliver !== 'function' ||
    typeof leaf.route?.address !== 'string' ||
    leaf.route.address.length === 0
  ) {
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
  const {context, source, refusals} = wave;
  const count = progress.leafCount();
  let lastFailure = {state: DURABLE_PROPAGATION_CAUSE.NONE};
  // A serial dispatch window: one leaf of this wave at a time. Overlapping
  // waves of other lanes share the router's per-destination bounds, which
  // answer with typed backpressure.
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
      recordLeafRefusal(refusals, leaf.target, refusalOfLeaf(delivery, answer));
      if (answer?.success !== true) {
        lastFailure = {state: DURABLE_PROPAGATION_CAUSE.RESPONSE, cause: delivery ?? answer};
      }
    } catch (error) {
      context.assertCurrent();
      recordLeafRefusal(refusals, leaf.target,
        refusalOfTransport(classifyThrownDeliveryError(error)));
      lastFailure = {state: DURABLE_PROPAGATION_CAUSE.ERROR, cause: error};
    }
  }
  return lastFailure;
}

function prepareDurableForegroundWave(owner, wave, events, plan) {
  const {context, source, refusals} = wave;
  const progress = bindWaveProgress(owner, source, events, context, plan);
  let lastFailure = {state: DURABLE_PROPAGATION_CAUSE.NONE};
  const complete = (answer) => isCommittedCdcOutcome(answer, events, source.groupId) ||
    isProvisionalCdcOutcome(answer, events, source.groupId);
  const result = () => {
    const answer = progress.result();
    return complete(answer) ? propagationResult(owner, source, plan, progress, answer) :
      {...propagationResult(owner, source, plan, progress,
        uncoveredWaveAnswer(progress, refusals)),
      failedTargetGroupIds: progress.failedTargetGroupIds(),
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
    wait: (delayMs) => context.run(() => owner.sleep(delayMs)),
    // Unresolved debt returns to the source owner: the original source lane
    // retains the next invocation and this child scope retains actual cleanup.
  };
}

// The result fields are the last completed wave's: with overlapping waves
// `stats.last*` and the PROPAGATED event describe whichever finished last.
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

// One durable wave for one vector (`options.events`: one table, in source
// order), admitted whenever its source lane presents it: no wave waits for,
// or is refused because of, another lane's wave. The lane's own single flight
// bounds it to one wave per lane. The wave is a member of the service's
// in-flight set from admission until its actual local cleanup (not its
// response, not stop), so stop, initialize and a lifetime change retire every
// wave in flight.
async function propagateDurableCdcEvent(owner, options) {
  const parent = options.deliveryContext;
  assertCdcDeliveryInvocation(parent);
  // The child scope opens before immutable capture, target capture, source
  // effects and every await.
  const context = openCdcDeliveryChildScope(parent);
  const wave = {context, source: options.sourceMessageGroupService, refusals: new Map()};
  owner.inFlightDurableWaves.add(wave);
  context.cleanup.then(() => owner.inFlightDurableWaves.delete(wave));
  try {
    context.assertCurrent();
    const events = captureCdcEvents(options.events);
    const plan = captureDurablePropagationPlan(owner, wave.source);
    if (plan.sourceMismatch) return durablePropagationRefusal();
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
    context.finish();
  }
}

export {propagateDurableCdcEvent};
