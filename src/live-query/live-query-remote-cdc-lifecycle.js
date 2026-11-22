/**
 * Synchronous lifecycle transition owner for live-query remote CDC bindings.
 *
 * Governs phase progression (connecting -> catching_up -> live -> retiring ->
 * closed), exact binding/attempt custody across awaits, epoch-fenced catch-up
 * and reset debt, absolute not-before retry deadlines, and retirement cleanup
 * bound strictly to the superseded registration identity.
 */

import {
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE,
  deliveryAnswerOf,
  deliveryTransportOf,
  forwardedDeliveryAnswer,
  isDeliveredTransportDeliveryOutcome,
  normalizePositiveRetryAfterMs,
} from '../transport/transport-semantic-outcome.js';
import {LIVE_QUERY_GROUP_STATE} from './live-query-constants.js';
import {extractEventVersion} from './live-query-group-helpers.js';

const REMOTE_CDC_TRANSPORT_KIND = Object.freeze({
  REMOTE: 'remote',
  LOCAL: 'local',
});

const REMOTE_CDC_PHASE = Object.freeze({
  CONNECTING: 'connecting',
  CATCHING_UP: 'catching_up',
  LIVE: 'live',
  RETIRING: 'retiring',
  CLOSED: 'closed',
});

const REMOTE_CDC_EVENT = Object.freeze({
  START_SUBSCRIBE: 'start_subscribe',
  SUBSCRIBE_SETTLED: 'subscribe_settled',
  ORDINARY_CDC_DELIVERED: 'ordinary_cdc_delivered',
  RAISE_RESET_DEBT: 'raise_reset_debt',
  START_REFRESH: 'start_refresh',
  REFRESH_SETTLED: 'refresh_settled',
  CANCEL: 'cancel',
  START_CLEANUP: 'start_cleanup',
  CLEANUP_SETTLED: 'cleanup_settled',
});

const REMOTE_CDC_EFFECT = Object.freeze({
  SEND_REMOTE_UNSUBSCRIBE: 'send_remote_unsubscribe',
  SCHEDULE_CONTINUATION: 'schedule_continuation',
  RETIRE_RECORD: 'retire_record',
});

// ends-on: pending remote live-query subscription succeeds or group is retired
const DEFAULT_RETRY_DELAY_MS = 50;
// ends-on: pending remote live-query subscription retry backoff cap is reached
const MAX_RETRY_DELAY_MS = 500;
const UNSUBSCRIBE_NOT_CONFIRMED_ERROR = 'Remote live query CDC unsubscribe not confirmed';
const PRE_SEND_SUBSCRIBE_REASON_CODES = new Set([
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.NO_HANDLER,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.NO_CONNECTION,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.OUTBOUND_QUEUE_BACKPRESSURED,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.QUERY_TRANSPORT_NOT_READY,
  TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.WEBSOCKET_CONNECT_TIMEOUT,
]);

function snapshotBinding(sub, attemptId = null) {
  return Object.freeze({
    attemptId,
    bindingGeneration: sub.bindingGeneration,
    targetNodeId: sub.targetNodeId,
    targetAddress: sub.targetAddress,
    subscriberId: sub.subscriberId,
    partitionId: sub.partitionId,
    queryId: sub.queryId,
  });
}

function bindingIdentityKey(binding) {
  return `${binding?.subscriberId || ''}@${binding?.targetAddress || ''}`;
}

function enqueuePendingCleanupBinding(sub, binding) {
  if (!binding) return;
  const key = bindingIdentityKey(binding);
  if (!sub.pendingCleanupBindings.some((item) => bindingIdentityKey(item) === key)) {
    sub.pendingCleanupBindings.push(binding);
  }
}

function removePendingCleanupBinding(sub, binding) {
  if (!binding || sub.pendingCleanupBindings.length === 0) return;
  const key = bindingIdentityKey(binding);
  sub.pendingCleanupBindings = sub.pendingCleanupBindings.filter(
    (item) => bindingIdentityKey(item) !== key,
  );
}

function advanceRetryDeadline(sub, nowMs, retryAfterMs) {
  const advisedMs = normalizePositiveRetryAfterMs(retryAfterMs, null);
  let delayMs;
  if (advisedMs !== null) {
    delayMs = advisedMs;
    sub.retryDelayMs = Math.min(
      MAX_RETRY_DELAY_MS,
      Math.max(DEFAULT_RETRY_DELAY_MS, advisedMs),
    );
  } else {
    delayMs = sub.retryDelayMs;
    sub.retryDelayMs = Math.min(MAX_RETRY_DELAY_MS, sub.retryDelayMs * 2);
  }
  const candidateDeadline = nowMs + delayMs;
  sub.retryNotBeforeMs = Math.max(sub.retryNotBeforeMs, candidateDeadline);
}

function maybeCloseRetiring(sub, effects) {
  if (sub.phase === REMOTE_CDC_PHASE.RETIRING &&
      sub.inFlightSubscribe === null &&
      sub.inFlightCleanups === 0 &&
      sub.pendingCleanupBindings.length === 0) {
    sub.subscribed = false;
    sub.uncertainRemoteRegistration = false;
    sub.retryNotBeforeMs = 0;
    sub.phase = REMOTE_CDC_PHASE.CLOSED;
    effects.push({type: REMOTE_CDC_EFFECT.RETIRE_RECORD});
  }
}

function isInactivePhase(phase) {
  return phase === REMOTE_CDC_PHASE.RETIRING || phase === REMOTE_CDC_PHASE.CLOSED;
}

/**
 * Create a tracked live-query partition subscription lifecycle record.
 * @param {Object} params
 * @return {Object} Mutable owner-managed lifecycle state.
 */
function createRemoteCdcSubscriptionState({
  subKey,
  partitionId,
  queryId,
  subscriberId,
  bindingGeneration,
  transportKind,
  targetNodeId = null,
  targetAddress = null,
  localPartition = null,
  handler,
  wrappedHandler,
  subOptions = {},
  initialPhase = REMOTE_CDC_PHASE.CONNECTING,
  needsCatchupOnSubscribe = false,
}) {
  const isLocal = transportKind === REMOTE_CDC_TRANSPORT_KIND.LOCAL;
  return {
    subKey,
    partitionId,
    queryId,
    subscriberId,
    bindingGeneration,
    transportKind,
    targetNodeId,
    targetAddress,
    localPartition,
    handler,
    wrappedHandler,
    subOptions,
    phase: isLocal ? REMOTE_CDC_PHASE.LIVE : initialPhase,
    subscribed: isLocal,
    uncertainRemoteRegistration: false,
    needsCatchupOnSubscribe: Boolean(needsCatchupOnSubscribe),
    nextAttemptId: 0,
    inFlightSubscribe: null,
    inFlightRefresh: null,
    inFlightCleanups: 0,
    pendingCleanupBindings: [],
    remoteUnsubscribeDispatched: false,
    resetDebtEpoch: 0,
    settledResetEpoch: 0,
    ordinaryCdcEpoch: 0,
    requiredCdcEpoch: 0,
    settledCdcEpoch: 0,
    retryNotBeforeMs: 0,
    retryDelayMs: DEFAULT_RETRY_DELAY_MS,
    lastError: null,
    lastReceivedSeq: null,
  };
}

function handleStartSubscribe(sub) {
  if (sub.phase !== REMOTE_CDC_PHASE.CONNECTING || sub.inFlightSubscribe !== null) {
    return {binding: null, effects: []};
  }
  const attemptId = ++sub.nextAttemptId;
  const binding = snapshotBinding(sub, attemptId);
  sub.inFlightSubscribe = binding;
  return {binding, effects: []};
}

function settleStaleSubscribe(sub, event) {
  const effects = [];
  if (event.accepted || event.uncertainRemoteRegistration) {
    sub.uncertainRemoteRegistration = false;
    removePendingCleanupBinding(sub, event.binding);
    sub.inFlightCleanups += 1;
    effects.push({
      type: REMOTE_CDC_EFFECT.SEND_REMOTE_UNSUBSCRIBE,
      binding: event.binding,
    });
  } else {
    maybeCloseRetiring(sub, effects);
  }
  return {stale: true, accepted: false, effects};
}

function settleAcceptedSubscribe(sub, event) {
  const effects = [];
  sub.subscribed = true;
  sub.uncertainRemoteRegistration = false;
  sub.lastError = null;
  sub.retryNotBeforeMs = 0;
  sub.retryDelayMs = DEFAULT_RETRY_DELAY_MS;
  const requiresCatchup = event.requiresCatchup === true ?
    true :
    sub.needsCatchupOnSubscribe === true;
  sub.needsCatchupOnSubscribe = false;
  if (requiresCatchup) {
    sub.resetDebtEpoch += 1;
    effects.push({type: REMOTE_CDC_EFFECT.SCHEDULE_CONTINUATION});
  }
  const hasDebt = requiresCatchup ||
    sub.settledResetEpoch < sub.resetDebtEpoch ||
    sub.settledCdcEpoch < sub.requiredCdcEpoch;
  sub.phase = hasDebt ? REMOTE_CDC_PHASE.CATCHING_UP : REMOTE_CDC_PHASE.LIVE;
  return {stale: false, accepted: true, requiresCatchup, effects};
}

function handleSubscribeSettled(sub, event) {
  if (sub.inFlightSubscribe?.attemptId === event.attemptId) {
    sub.inFlightSubscribe = null;
  }
  const bindingMatches = event.binding?.bindingGeneration === sub.bindingGeneration;
  if (isInactivePhase(sub.phase) || !bindingMatches) {
    return settleStaleSubscribe(sub, event);
  }
  if (!event.accepted) {
    sub.subscribed = false;
    if (event.uncertainRemoteRegistration) {
      sub.uncertainRemoteRegistration = true;
    }
    sub.needsCatchupOnSubscribe = true;
    sub.lastError = event.error || null;
    advanceRetryDeadline(sub, event.nowMs, event.retryAfterMs);
    return {
      stale: false,
      accepted: false,
      effects: [{type: REMOTE_CDC_EFFECT.SCHEDULE_CONTINUATION}],
    };
  }
  return settleAcceptedSubscribe(sub, event);
}

function handleOrdinaryCdcDelivered(sub) {
  if (isInactivePhase(sub.phase)) {
    return {
      ordinaryCdcEpoch: sub.ordinaryCdcEpoch,
      requiredCdcEpoch: sub.requiredCdcEpoch,
      effects: [],
    };
  }
  sub.ordinaryCdcEpoch += 1;
  if (sub.inFlightRefresh !== null || sub.phase === REMOTE_CDC_PHASE.CATCHING_UP) {
    sub.requiredCdcEpoch = Math.max(sub.requiredCdcEpoch, sub.ordinaryCdcEpoch);
    if (sub.phase === REMOTE_CDC_PHASE.LIVE) {
      sub.phase = REMOTE_CDC_PHASE.CATCHING_UP;
    }
  }
  return {
    ordinaryCdcEpoch: sub.ordinaryCdcEpoch,
    requiredCdcEpoch: sub.requiredCdcEpoch,
    effects: [],
  };
}

function handleRaiseResetDebt(sub, event) {
  if (isInactivePhase(sub.phase)) {
    return {resetDebtEpoch: sub.resetDebtEpoch, effects: []};
  }
  sub.resetDebtEpoch += 1;
  if (sub.phase === REMOTE_CDC_PHASE.LIVE) {
    sub.phase = REMOTE_CDC_PHASE.CATCHING_UP;
  }
  const effects = event.scheduleContinuation ?
    [{type: REMOTE_CDC_EFFECT.SCHEDULE_CONTINUATION}] :
    [];
  return {resetDebtEpoch: sub.resetDebtEpoch, effects};
}

function handleStartRefresh(sub) {
  if (isInactivePhase(sub.phase)) {
    return {attempt: null, effects: []};
  }
  const attempt = Object.freeze({
    attemptId: ++sub.nextAttemptId,
    bindingGeneration: sub.bindingGeneration,
    coversResetDebtEpoch: sub.resetDebtEpoch,
    coversCdcEpoch: sub.ordinaryCdcEpoch,
  });
  sub.inFlightRefresh = attempt;
  return {attempt, effects: []};
}

function settleIncompleteRefresh(sub, event) {
  sub.lastError = event.error || null;
  if (sub.phase === REMOTE_CDC_PHASE.LIVE) {
    sub.phase = REMOTE_CDC_PHASE.CATCHING_UP;
  }
  const effects = [];
  if (event.scheduleOnIncomplete) {
    if (event.supersededByCdc) {
      sub.retryNotBeforeMs = 0;
    } else {
      advanceRetryDeadline(sub, event.nowMs, event.retryAfterMs);
    }
    effects.push({type: REMOTE_CDC_EFFECT.SCHEDULE_CONTINUATION});
  }
  return {settled: false, stale: false, effects};
}

function settleAuthoritativeRefresh(sub, attempt) {
  sub.settledResetEpoch = Math.max(sub.settledResetEpoch, attempt.coversResetDebtEpoch);
  sub.settledCdcEpoch = Math.max(sub.settledCdcEpoch, attempt.coversCdcEpoch ?? 0);
  const fullyCovered = sub.settledResetEpoch >= sub.resetDebtEpoch &&
    sub.settledCdcEpoch >= sub.requiredCdcEpoch;
  if (fullyCovered) {
    sub.retryNotBeforeMs = 0;
    sub.retryDelayMs = DEFAULT_RETRY_DELAY_MS;
    sub.lastError = null;
    sub.phase = sub.subscribed ? REMOTE_CDC_PHASE.LIVE : sub.phase;
    return {settled: true, stale: false, effects: []};
  }
  // Older refresh completed while newer reset/overflow debt or concurrent CDC already arose.
  sub.phase = REMOTE_CDC_PHASE.CATCHING_UP;
  sub.retryNotBeforeMs = 0;
  return {
    settled: false,
    stale: false,
    newerDebtPending: true,
    effects: [{type: REMOTE_CDC_EFFECT.SCHEDULE_CONTINUATION}],
  };
}

function handleRefreshSettled(sub, event) {
  if (sub.inFlightRefresh?.attemptId === event.attempt.attemptId) {
    sub.inFlightRefresh = null;
  }
  if (isInactivePhase(sub.phase) ||
      event.attempt.bindingGeneration !== sub.bindingGeneration) {
    return {settled: false, stale: true, effects: []};
  }
  if (!event.authoritative) {
    return settleIncompleteRefresh(sub, event);
  }
  return settleAuthoritativeRefresh(sub, event.attempt);
}

function handleCancel(sub) {
  const effects = [];
  if (sub.phase === REMOTE_CDC_PHASE.CLOSED) {
    return {effects};
  }
  sub.phase = REMOTE_CDC_PHASE.RETIRING;
  sub.retryNotBeforeMs = 0;
  const needsRemoteCleanup =
    sub.transportKind === REMOTE_CDC_TRANSPORT_KIND.REMOTE &&
    (sub.subscribed || sub.uncertainRemoteRegistration);
  if (needsRemoteCleanup && !sub.remoteUnsubscribeDispatched) {
    sub.remoteUnsubscribeDispatched = true;
    const binding = snapshotBinding(sub, null);
    removePendingCleanupBinding(sub, binding);
    sub.inFlightCleanups += 1;
    effects.push({
      type: REMOTE_CDC_EFFECT.SEND_REMOTE_UNSUBSCRIBE,
      binding,
    });
  }
  maybeCloseRetiring(sub, effects);
  return {effects};
}

function handleStartCleanup(sub) {
  if (sub.phase !== REMOTE_CDC_PHASE.RETIRING ||
      sub.inFlightCleanups > 0 ||
      sub.pendingCleanupBindings.length === 0) {
    return {bindings: [], effects: []};
  }
  const bindings = sub.pendingCleanupBindings.slice();
  sub.pendingCleanupBindings = [];
  sub.inFlightCleanups += bindings.length;
  const effects = bindings.map((binding) => ({
    type: REMOTE_CDC_EFFECT.SEND_REMOTE_UNSUBSCRIBE,
    binding,
  }));
  return {bindings, effects};
}

function handleCleanupSettled(sub, event) {
  const effects = [];
  sub.inFlightCleanups = Math.max(0, sub.inFlightCleanups - 1);
  if (sub.phase === REMOTE_CDC_PHASE.CLOSED) {
    return {settled: true, effects};
  }
  const binding = event.binding || snapshotBinding(sub, null);
  if (event.success !== true) {
    sub.phase = REMOTE_CDC_PHASE.RETIRING;
    enqueuePendingCleanupBinding(sub, binding);
    sub.lastError = event.error || null;
    advanceRetryDeadline(sub, event.nowMs ?? 0, event.retryAfterMs ?? null);
    effects.push({type: REMOTE_CDC_EFFECT.SCHEDULE_CONTINUATION});
    return {settled: false, effects};
  }
  removePendingCleanupBinding(sub, binding);
  if (sub.inFlightCleanups === 0 && sub.pendingCleanupBindings.length === 0) {
    sub.subscribed = false;
    sub.uncertainRemoteRegistration = false;
    sub.retryNotBeforeMs = 0;
    sub.retryDelayMs = DEFAULT_RETRY_DELAY_MS;
    sub.lastError = null;
  }
  maybeCloseRetiring(sub, effects);
  return {settled: sub.phase === REMOTE_CDC_PHASE.CLOSED, effects};
}

/**
 * Pure synchronous transition function for one live-query subscription record.
 * @param {Object} sub - Subscription lifecycle state.
 * @param {Object} event - Lifecycle event with `type` and payload.
 * @return {Object} Transition summary and owned effects to execute.
 */
function transitionRemoteCdcSubscription(sub, event) {
  switch (event.type) {
  case REMOTE_CDC_EVENT.START_SUBSCRIBE:
    return handleStartSubscribe(sub);
  case REMOTE_CDC_EVENT.SUBSCRIBE_SETTLED:
    return handleSubscribeSettled(sub, event);
  case REMOTE_CDC_EVENT.ORDINARY_CDC_DELIVERED:
    return handleOrdinaryCdcDelivered(sub);
  case REMOTE_CDC_EVENT.RAISE_RESET_DEBT:
    return handleRaiseResetDebt(sub, event);
  case REMOTE_CDC_EVENT.START_REFRESH:
    return handleStartRefresh(sub);
  case REMOTE_CDC_EVENT.REFRESH_SETTLED:
    return handleRefreshSettled(sub, event);
  case REMOTE_CDC_EVENT.CANCEL:
    return handleCancel(sub);
  case REMOTE_CDC_EVENT.START_CLEANUP:
    return handleStartCleanup(sub);
  case REMOTE_CDC_EVENT.CLEANUP_SETTLED:
    return handleCleanupSettled(sub, event);
  default:
    return {effects: []};
  }
}

function hasOutstandingRemoteCdcObligation(sub) {
  if (!sub || sub.phase === REMOTE_CDC_PHASE.CLOSED) return false;
  if (sub.phase === REMOTE_CDC_PHASE.RETIRING) {
    return sub.pendingCleanupBindings.length > 0;
  }
  if (sub.phase === REMOTE_CDC_PHASE.CONNECTING) {
    return sub.transportKind === REMOTE_CDC_TRANSPORT_KIND.REMOTE;
  }
  return sub.phase === REMOTE_CDC_PHASE.CATCHING_UP &&
    (sub.settledResetEpoch < sub.resetDebtEpoch ||
      sub.settledCdcEpoch < sub.requiredCdcEpoch);
}

function computeEarliestRemoteCdcDeadline(activeSubscriptions, retiringSubscriptions) {
  let earliest = null;
  for (const sub of activeSubscriptions.values()) {
    if (!hasOutstandingRemoteCdcObligation(sub)) continue;
    if (sub.inFlightSubscribe !== null || sub.inFlightRefresh !== null) continue;
    if (earliest === null || sub.retryNotBeforeMs < earliest) {
      earliest = sub.retryNotBeforeMs;
    }
  }
  for (const sub of retiringSubscriptions) {
    if (!hasOutstandingRemoteCdcObligation(sub) || sub.inFlightCleanups > 0) continue;
    if (earliest === null || sub.retryNotBeforeMs < earliest) {
      earliest = sub.retryNotBeforeMs;
    }
  }
  return earliest;
}

function collectDueRemoteCdcSubscriptions(activeSubscriptions, retiringSubscriptions, nowMs) {
  const dueActive = [];
  for (const sub of activeSubscriptions.values()) {
    if (hasOutstandingRemoteCdcObligation(sub) &&
        sub.inFlightSubscribe === null &&
        sub.inFlightRefresh === null &&
        sub.retryNotBeforeMs <= nowMs) {
      dueActive.push(sub);
    }
  }
  const dueRetiring = [];
  for (const sub of retiringSubscriptions) {
    if (hasOutstandingRemoteCdcObligation(sub) &&
        sub.inFlightCleanups === 0 &&
        sub.retryNotBeforeMs <= nowMs) {
      dueRetiring.push(sub);
    }
  }
  return {dueActive, dueRetiring};
}

function isUncertainSubscribeDelivery(delivery) {
  if (!delivery) return true;
  if (!delivery.transport) return false;
  const transport = deliveryTransportOf(delivery);
  if (isDeliveredTransportDeliveryOutcome(transport)) {
    return deliveryAnswerOf(delivery) === null;
  }
  if (transport.recoverableBeforeSend === true || transport.noHandler === true) {
    return false;
  }
  return !PRE_SEND_SUBSCRIBE_REASON_CODES.has(transport.reasonCode);
}

function isUncertainSubscribeError(error) {
  return error?.recoverableBeforeSend !== true && error?.noHandler !== true;
}

const UNSUBSCRIBE_CONFIRMED_OUTCOME = Object.freeze({confirmed: true});

function buildUnconfirmedUnsubscribeOutcome(errorMessage, rawRetryAfterMs = null) {
  const retryAfterMs = normalizePositiveRetryAfterMs(rawRetryAfterMs, null);
  return {
    confirmed: false,
    error: errorMessage || UNSUBSCRIBE_NOT_CONFIRMED_ERROR,
    ...(retryAfterMs !== null ? {retryAfterMs} : {}),
  };
}

function isConfirmedUnsubscribeAnswer(answer) {
  return Boolean(
    answer &&
    answer.success === true &&
    answer.acknowledged !== false &&
    answer.unsubscribed !== false &&
    (answer.unsubscribed === true || answer.alreadyAbsent === true),
  );
}

function isAbsentUnsubscribeTransport(transport) {
  return transport.noHandler === true ||
    transport.reasonCode === TRANSPORT_DELIVERY_OUTCOME_REASON_CODE.NO_HANDLER;
}

function classifyEnvelopeUnsubscribeOutcome(delivery) {
  const transport = deliveryTransportOf(delivery);
  if (!isDeliveredTransportDeliveryOutcome(transport)) {
    return isAbsentUnsubscribeTransport(transport) ?
      UNSUBSCRIBE_CONFIRMED_OUTCOME :
      buildUnconfirmedUnsubscribeOutcome(
        transport.error || transport.reasonCode, transport.retryAfterMs,
      );
  }
  const answer = deliveryAnswerOf(delivery);
  return isConfirmedUnsubscribeAnswer(answer) ?
    UNSUBSCRIBE_CONFIRMED_OUTCOME :
    buildUnconfirmedUnsubscribeOutcome(answer?.error, answer?.retryAfterMs);
}

function classifyUnsubscribeDeliveryOutcome(delivery) {
  if (!delivery) {
    return buildUnconfirmedUnsubscribeOutcome(UNSUBSCRIBE_NOT_CONFIRMED_ERROR);
  }
  if (delivery.transport) {
    return classifyEnvelopeUnsubscribeOutcome(delivery);
  }
  return delivery.noHandler === true || isConfirmedUnsubscribeAnswer(delivery) ?
    UNSUBSCRIBE_CONFIRMED_OUTCOME :
    buildUnconfirmedUnsubscribeOutcome(delivery.error, delivery.retryAfterMs);
}

function classifyUnsubscribeDeliveryError(error) {
  return error?.noHandler === true ?
    UNSUBSCRIBE_CONFIRMED_OUTCOME :
    buildUnconfirmedUnsubscribeOutcome(error?.message || String(error), error?.retryAfterMs);
}

function isRemoteCdcBindingReceivable(sub) {
  return Boolean(sub && !isInactivePhase(sub.phase));
}

function isFailedSubscribeAnswer(answer) {
  return !answer ||
    answer.success === false ||
    answer.acknowledged === false ||
    answer.subscribed === false;
}

function unwrapRemoteDeliveryRaw(delivery) {
  if (!delivery) return null;
  return delivery.transport ?
    (forwardedDeliveryAnswer(delivery) ?? {acknowledged: true, success: true}) :
    delivery;
}

function extractRemoteDeliveryAnswer(delivery) {
  const raw = unwrapRemoteDeliveryRaw(delivery);
  if (!raw || raw.success === false || raw.acknowledged === false) {
    const retryAfterMs = normalizePositiveRetryAfterMs(raw?.retryAfterMs, null);
    return {
      ...(raw || {}),
      acknowledged: false,
      success: false,
      retryable: !delivery || Boolean(raw?.deferRetry || raw?.retryable),
      ...(retryAfterMs !== null ? {retryAfterMs} : {}),
    };
  }
  return {acknowledged: true, success: true, ...raw};
}

function updateGroupFrontierAfterRebind(group, partitionId, subAnswer) {
  if (Number.isFinite(subAnswer?.appliedIndex)) {
    group.partitionFrontiers.set(partitionId, subAnswer.appliedIndex);
    return;
  }
  const streamVersion = subAnswer?.versionContext?.streamVersion;
  if (streamVersion !== undefined && streamVersion !== null) {
    group.partitionFrontiers.set(partitionId, streamVersion);
    return;
  }
  group.partitionFrontiers.delete(partitionId);
}

function advanceGroupFrontierFromEvents(group, partitionId, events) {
  if (!group || !partitionId || !Array.isArray(events) || events.length === 0) return;
  const lastVersion = extractEventVersion(events.at(-1));
  if (lastVersion === null) return;
  const current = group.partitionFrontiers.get(partitionId);
  if (current === undefined || current === null ||
      group.compareVersions(lastVersion, current) > 0) {
    group.partitionFrontiers.set(partitionId, lastVersion);
  }
}

function hasInboundSequenceGap(payload, sub) {
  if (payload.resyncRequired === true) return true;
  if (!Number.isFinite(payload.previousDeliveredSeq)) return false;
  if (!Number.isFinite(sub?.lastReceivedSeq)) return false;
  return payload.previousDeliveredSeq > sub.lastReceivedSeq;
}

function updateLastReceivedSeq(sub, events) {
  if (!sub || !Array.isArray(events) || events.length === 0) return;
  const lastSeq = events.at(-1)?.sequenceNumber;
  if (Number.isFinite(lastSeq)) {
    sub.lastReceivedSeq = lastSeq;
  }
}

function markGroupSubscribed(group, partitionId, subAnswer) {
  group.pendingSubscriptions?.delete(partitionId);
  group.subscribedPartitions.add(partitionId);
  updateGroupFrontierAfterRebind(group, partitionId, subAnswer);
}

function markGroupPending(group, partitionId) {
  group.subscribedPartitions.delete(partitionId);
  group.pendingSubscriptions?.add(partitionId);
}

function isGroupClosed(group) {
  return !group || group.lifecycleState === LIVE_QUERY_GROUP_STATE.CLOSED;
}

function buildDeferredSubscribeResult(sub, remainingMs) {
  return {
    acknowledged: false,
    success: false,
    subscribed: false,
    retryable: true,
    deferRetry: true,
    retryAfterMs: remainingMs,
    error: sub.lastError,
  };
}

function buildCancelledSubscribeResult() {
  return {
    acknowledged: false,
    success: false,
    subscribed: false,
    cancelled: true,
    retryable: false,
  };
}

function buildResyncFailureAnswer(errorMessage, retryAfterMs = null) {
  return {
    acknowledged: false,
    success: false,
    retryable: true,
    deferRetry: true,
    error: errorMessage,
    ...(retryAfterMs !== null ? {retryAfterMs} : {}),
  };
}

export {
  DEFAULT_RETRY_DELAY_MS,
  MAX_RETRY_DELAY_MS,
  REMOTE_CDC_EFFECT,
  REMOTE_CDC_EVENT,
  REMOTE_CDC_PHASE,
  REMOTE_CDC_TRANSPORT_KIND,
  advanceGroupFrontierFromEvents,
  buildCancelledSubscribeResult,
  buildDeferredSubscribeResult,
  buildResyncFailureAnswer,
  classifyUnsubscribeDeliveryError,
  classifyUnsubscribeDeliveryOutcome,
  collectDueRemoteCdcSubscriptions,
  computeEarliestRemoteCdcDeadline,
  createRemoteCdcSubscriptionState,
  extractRemoteDeliveryAnswer,
  hasInboundSequenceGap,
  hasOutstandingRemoteCdcObligation,
  isFailedSubscribeAnswer,
  isGroupClosed,
  isRemoteCdcBindingReceivable,
  isUncertainSubscribeDelivery,
  isUncertainSubscribeError,
  markGroupPending,
  markGroupSubscribed,
  transitionRemoteCdcSubscription,
  updateLastReceivedSeq,
};
