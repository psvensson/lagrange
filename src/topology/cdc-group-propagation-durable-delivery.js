import {deliveryAnswerOf} from '../transport/transport-semantic-outcome.js';
// CDCGroupPropagationService's durable delivery, its one propagation path:
// one vector to ONE recipient group (the source group, or one target group
// the source lane addresses). There is no node-wide wave slot and no
// cross-table turn-taking: each delivery has its own child scope, the source
// lane keeps at most one in flight per (source partition, recipient), and a
// recipient that cannot keep up answers backpressure from its own proposal
// queue. Source debt and every recipient's progress remain with the source
// lane; the service keeps no payload between attempts or after a delivery.
import {captureCdcEvents} from '../cdc/cdc-event-envelope.js';
import {CDC_COMPLETION, CDC_COVERAGE_STATE, isAlreadyAppliedCdcOutcome, isCommittedCdcOutcome,
  isProvisionalCdcOutcome, observeCdcDeliveryCoverage, unconfirmedCdcAcceptance,
  unknownCdcAcceptance} from
  '../cdc/cdc-delivery-outcome.js';
import {assertCdcDeliveryInvocation, openCdcDeliveryChildScope} from
  '../cdc/cdc-delivery-invocation.js';
import {CDC_DELIVERY_REMAINING_MS, prepareCdcDeliveryMessage} from '../cdc/cdc-delivery-budget.js';
import {resolveCdcPropagationDeliveryProfile} from '../cache/cdc-propagation-delivery-profile.js';
import {PRESSURE_GOVERNOR_ACTION} from '../control-plane/pressure-governor.js';
import {captureDurablePropagationPlan} from './cdc-group-propagation-durable-plan.js';
import {TARGET_SKIP_REASON, openDurableWaveTrace, reportCdcTargetSkipped,
  reportDurableWaveFinished, reportDurableWaveRefused, traceWaveLeaf} from
  './cdc-group-propagation-wave-diagnostics.js';
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

// The durable vector has one wire form, whatever its length: the batch
// message naming its events and the source range the lane shipped them as
// (CDC Stage 3: source partition and incarnation, predecessor, last row).
function targetDeliveryPayload(owner, source, events, target, sourceRange) {
  return {
    type: LATENCY_TOPOLOGY_MESSAGE_TYPE.CDC_PROPAGATION_BATCH,
    events,
    sourceRange,
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

async function deliverTarget(owner, wave, events, leaf) {
  const {context, source} = wave;
  context.assertCurrent();
  if (owner.resolvePropagationPressure(events).action === PRESSURE_GOVERNOR_ACTION.DEFER) {
    reportCdcTargetSkipped(owner, events[0], leaf.route,
      TARGET_SKIP_REASON.PRESSURE_DEFERRED, wave.trace.planRoutingReason);
    return notSentTarget(CDC_COMPLETION.BACKPRESSURE);
  }
  if (
    !owner.messageRouter ||
    typeof owner.messageRouter.deliver !== 'function' ||
    leaf.route === null || typeof leaf.route.address !== 'string' ||
    leaf.route.address.length === 0
  ) {
    reportCdcTargetSkipped(owner, events[0], leaf.route,
      TARGET_SKIP_REASON.NOT_ROUTABLE, wave.trace.planRoutingReason);
    return notSentTarget();
  }
  const profile = resolveCdcPropagationDeliveryProfile(events);
  const payload = targetDeliveryPayload(owner, source, events, leaf.route, wave.sourceRange);
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

// The recipient a delivery addresses: the source group (it applies locally)
// or one target group, through the one route the invocation answered when the
// plan was bound: the source lane's observation of that group (the plan's
// route for a group it names, the last observed one for a required group it
// no longer names; cdc-propagation-progress.js). No observed route, or one
// without an address, is not routable: the typed unknown, and the lane holds
// the recipient until its recipient domain changes or its backoff ends.
function resolveRecipient(source, recipientGroupId, observedRoute) {
  if (recipientGroupId === null || recipientGroupId === source.groupId) {
    return {isSource: true, groupId: source.groupId, route: null};
  }
  return {isSource: false, groupId: recipientGroupId, route: observedRoute};
}

// A recipient's delivery that threw inside its current invocation: the typed
// unknown, with the error as its cause.
function erroredRecipientAnswer(error) {
  return {answer: unknownCdcAcceptance(),
    cause: {state: DURABLE_PROPAGATION_CAUSE.ERROR, cause: error}};
}

// The one refusal of a durable delivery: the grouped plan names another
// source group than the one that delivers.
function durablePropagationRefusal() {
  return {...unknownCdcAcceptance(),
    fallbackReason: CDC_GROUP_PROPAGATION_REASON.SOURCE_GROUP_MISMATCH};
}

async function deliverToRecipient(owner, wave, events, recipient) {
  const {context, source} = wave;
  context.assertCurrent();
  const startedAtMs = owner.now();
  const leaf = {groupId: recipient.groupId, route: recipient.route};
  try {
    if (recipient.isSource) {
      const answer = await context.run(() => source.applyCDCBatch(events, {
        deliveryContext: context, remainingMs: context.remainingMs,
        sourceRange: wave.sourceRange,
      }));
      traceWaveLeaf(wave.trace,
        {isSource: true, leaf, elapsedMs: owner.now() - startedAtMs, answer, error: null});
      context.assertCurrent();
      return {answer, cause: {state: DURABLE_PROPAGATION_CAUSE.RESPONSE, cause: answer}};
    }
    const {delivery, answer} = await deliverTarget(owner, wave, events, leaf);
    traceWaveLeaf(wave.trace,
      {isSource: false, leaf, elapsedMs: owner.now() - startedAtMs, answer, error: null});
    context.assertCurrent();
    // A target's answer counts only inside a delivered transport envelope.
    const covered = delivery !== null && observeCdcDeliveryCoverage(
      delivery, events, recipient.groupId).state !== CDC_COVERAGE_STATE.UNCOVERED;
    return {answer: covered ? answer : unconfirmedCdcAcceptance(answer),
      cause: {state: DURABLE_PROPAGATION_CAUSE.RESPONSE, cause: delivery ?? answer}};
  } catch (error) {
    traceWaveLeaf(wave.trace, {isSource: recipient.isSource, leaf,
      elapsedMs: owner.now() - startedAtMs, answer: null, error});
    context.assertCurrent();
    return erroredRecipientAnswer(error);
  }
}

// The prepared unit of the foreground retry loop: one recipient's delivery.
function prepareRecipientDelivery(owner, wave, events, plan, recipient) {
  const {context, source} = wave;
  let last = {answer: unknownCdcAcceptance(), cause: {state: DURABLE_PROPAGATION_CAUSE.NONE}};
  const complete = () => isCommittedCdcOutcome(last.answer, events, recipient.groupId) ||
    isAlreadyAppliedCdcOutcome(last.answer, events, recipient.groupId) ||
    isProvisionalCdcOutcome(last.answer, events, recipient.groupId);
  const result = () => complete() ?
    propagationResult(owner, source, plan, last.answer) :
    {...propagationResult(owner, source, plan, unconfirmedCdcAcceptance(last.answer)),
      failedTargetGroupIds: recipient.isSource ? [] : [recipient.groupId], cause: last.cause};
  return {
    deliveryLabel: owner.describeDeliveryEvents(events),
    complete,
    positionGap: () => last.answer?.error === CDC_COMPLETION.POSITION_GAP,
    result,
    // One recipient: its answer, never this diagnostic count, decides.
    failureCount: () => 1,
    deliver: async () => {
      last = await deliverToRecipient(owner, wave, events, recipient);
      context.assertCurrent();
    },
    stopped: result,
    prepareWait: (retryDelayMs) => {
      const remainingMs = context.remainingMs();
      return {state: retryDelayMs < remainingMs ? CDC_GROUP_FOREGROUND_RETRY_STATE.ADVANCE :
        CDC_GROUP_FOREGROUND_RETRY_STATE.INSUFFICIENT_DURATION, retryDelayMs, remainingMs};
    },
    wait: (delayMs) => context.run(() => owner.sleep(delayMs)),
    // An unconfirmed recipient returns to the source lane: the lane retains
    // that recipient's next invocation and this child scope its cleanup.
  };
}

function propagationResult(owner, source, plan, answer) {
  const strategy = plan.useGrouped ? CDC_GROUP_PROPAGATION_STRATEGY.GROUP_COORDINATOR :
    CDC_GROUP_PROPAGATION_STRATEGY.DIRECT_FANOUT;
  const mode = plan.useGrouped ? CDC_GROUP_PROPAGATION_STATUS.GROUPED :
    CDC_GROUP_PROPAGATION_STATUS.SAFE;
  const result = {sourceGroupId: source.groupId, targetGroupCount: plan.targets.length,
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

// A delivery is in flight from its admission until its child scope's actual
// local cleanup; the service counts them (and their peak) for diagnostics.
// Their number is bounded by the source lanes: one per (source partition,
// recipient) on this node.
function openRecipientDelivery(owner, parent, source) {
  const context = openCdcDeliveryChildScope(parent);
  const wave = {context, source, sourceRange: parent.sourceRange,
    trace: openDurableWaveTrace(owner)};
  owner.activeDurableDeliveries.add(wave);
  owner.stats.peakActiveDurableDeliveries = Math.max(
    owner.stats.peakActiveDurableDeliveries, owner.activeDurableDeliveries.size);
  context.cleanup.then(() => owner.activeDurableDeliveries.delete(wave));
  return wave;
}

// One delivery carries one vector (the events of one table, in log order, as
// the source lane shipped them) to the one recipient group its invocation
// addresses. The topology owner reports the recipient set it observed to the
// invocation (bindTopology): that is how the source lane learns its leaves.
async function deliverCdcVectorToRecipient(owner, options) {
  const parent = options.deliveryContext;
  assertCdcDeliveryInvocation(parent);
  const head = options.events[0];
  const wave = openRecipientDelivery(owner, parent, options.sourceMessageGroupService);
  const {context, source, trace} = wave;
  trace.eventCount = options.events.length;
  try {
    context.assertCurrent();
    const events = captureCdcEvents(options.events);
    const plan = captureDurablePropagationPlan(owner, source);
    trace.planRoutingReason = plan.fallbackReason ?? null;
    if (plan.sourceMismatch) {
      const refusal = durablePropagationRefusal();
      reportDurableWaveRefused(owner, head, refusal);
      return refusal;
    }
    const observedRoute = parent.bindTopology(owner, source, plan.targets);
    const recipient = resolveRecipient(source, parent.recipientGroupId, observedRoute);
    trace.recipientGroupId = recipient.groupId;
    owner.setPublicationMode(publicationModeOf(plan), plan.fallbackReason);
    const prepared = prepareRecipientDelivery(owner, wave, events, plan, recipient);
    const result = await owner.deliverToTargetsWithRetry(prepared);
    context.assertCurrent();
    if (!plan.useGrouped && result?.success === true) {
      const postPlan = captureDurablePropagationPlan(owner, source);
      if (postPlan.useGrouped) {
        owner.setPublicationMode(publicationModeOf(postPlan), postPlan.fallbackReason);
      }
    }
    return result;
  } finally {
    context.finish();
    reportDurableWaveFinished(owner, head, trace);
  }
}

export {deliverCdcVectorToRecipient};
