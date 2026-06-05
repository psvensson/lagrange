import {
  TRANSPORT_NUM,
  TRANSPORT_TYPEOF,
} from '../constants/transport.js';
import {buildTransportDeliveryOutcome} from './transport-semantic-outcome.js';
import {DELIVERY_SOURCE_MESSAGE_UNWRAP_LIMIT, EMPTY_DELIVERY_SOURCE, LOCAL_NUM_ONE, MESSAGE_ROUTER_LITERAL, OUTBOUND_QUEUE_TARGET_FALLBACK_IN_FLIGHT_SOURCE_LIMIT_DIVISOR, OutboundDeliveryPriority, QUERY_DATA_PLANE_MESSAGE_TYPE, RETIRED_PENDING_RESPONSE_REASON, SERVICE_RESPONSE_DISPOSITION_KIND, buildTypelessCdcDeliverySource, buildTypelessQueryDeliverySource, extractSqlOperationKind, extractSqlTableName, isSupersedableRaftHeartbeatAppend, normalizeIdentifier, summarizeRaftAppendCommand} from './message-router-shared-stage-1.js';
import {isCriticalTransportTargetAddress} from '../bootstrap/system-partition-classification.js';
import {buildPendingSourceAdmission, buildPendingSourceLimitEvidence, countCriticalPendingByAdmissionSource, countCriticalPendingBySource, countPendingBySource, normalizeQueueMaxPending, normalizeQueuedDeliverySource, resolveBoundedCriticalReserve, resolveBoundedReadinessReserve, resolveCriticalPendingSourceLimit, resolveDeliverySourceAdmissionKey, resolvePendingSourceLimit, resolveProportionalPendingSourceLimit, resolveQueuedDeliverySourceAdmissionKey} from './message-router-delivery-source-admission.js';

function resolveSemanticDeliverySourceMessage(message) {
  let semanticMessage = message;
  let unwrapCount = TRANSPORT_NUM.ZERO;
  while (
    semanticMessage &&
    typeof semanticMessage === TRANSPORT_TYPEOF.OBJECT &&
    unwrapCount < DELIVERY_SOURCE_MESSAGE_UNWRAP_LIMIT
  ) {
    const messageType = normalizeIdentifier(semanticMessage?.type);
    if (messageType) {
      return semanticMessage;
    }
    const nestedPayload = semanticMessage?.payload;
    if (
      !nestedPayload ||
      typeof nestedPayload !== TRANSPORT_TYPEOF.OBJECT ||
      nestedPayload === semanticMessage
    ) {
      return semanticMessage;
    }
    semanticMessage = nestedPayload;
    unwrapCount += TRANSPORT_NUM.ONE;
  }
  return semanticMessage;
}

function buildDerivedDeliverySource(targetAddress, message) {
  const semanticMessage = resolveSemanticDeliverySourceMessage(message);
  const messageType = normalizeIdentifier(semanticMessage?.type)?.toLowerCase();
  if (messageType === MESSAGE_ROUTER_LITERAL.STRING_APPEND) {
    if (isSupersedableRaftHeartbeatAppend(semanticMessage)) {
      return MESSAGE_ROUTER_LITERAL.STRING_RAFT_APPEND_HEARTBEAT;
    }
    const entry = Array.isArray(semanticMessage?.data) ?
      semanticMessage.data[0] :
      null;
    return summarizeRaftAppendCommand(entry?.command);
  }
  if (messageType === QUERY_DATA_PLANE_MESSAGE_TYPE.toLowerCase()) {
    const tableName = extractSqlTableName(semanticMessage?.sql);
    const operationKind = extractSqlOperationKind(semanticMessage?.sql);
    return `query:${operationKind}:${tableName || MESSAGE_ROUTER_LITERAL.STRING_UNKNOWN}`;
  }
  if (messageType) {
    return `message:${messageType}`;
  }
  const typelessQueryDeliverySource =
    buildTypelessQueryDeliverySource(semanticMessage);
  if (typelessQueryDeliverySource) {
    return typelessQueryDeliverySource;
  }
  const typelessCdcDeliverySource =
    buildTypelessCdcDeliverySource(semanticMessage);
  if (typelessCdcDeliverySource) {
    return typelessCdcDeliverySource;
  }
  const normalizedTarget = normalizeIdentifier(targetAddress);
  if (normalizedTarget) {
    return `${MESSAGE_ROUTER_LITERAL.STRING_TARGET_PREFIX}${normalizedTarget}`;
  }
  return MESSAGE_ROUTER_LITERAL.STRING_UNKNOWN;
}

function buildRetiredPendingClassification(reason) {
  switch (reason) {
  case RETIRED_PENDING_RESPONSE_REASON.TIMEOUT:
    return MESSAGE_ROUTER_LITERAL.STRING_LATE_AFTER_TIMEOUT;
  case RETIRED_PENDING_RESPONSE_REASON.NODE_FAILURE:
    return MESSAGE_ROUTER_LITERAL.STRING_LATE_AFTER_NODE_FAILURE;
  case RETIRED_PENDING_RESPONSE_REASON.DEFERRED_DELIVERY:
    return MESSAGE_ROUTER_LITERAL.STRING_LATE_AFTER_DEFERRED_DELIVERY;
  case RETIRED_PENDING_RESPONSE_REASON.ACK_REJECTED:
    return MESSAGE_ROUTER_LITERAL.STRING_LATE_AFTER_ACK_REJECTED;
  case RETIRED_PENDING_RESPONSE_REASON.INLINE_ACK:
    return MESSAGE_ROUTER_LITERAL.STRING_LATE_AFTER_INLINE_ACK;
  case RETIRED_PENDING_RESPONSE_REASON.CANCELLED:
    return MESSAGE_ROUTER_LITERAL.STRING_LATE_AFTER_CANCELLED;
  default:
    return MESSAGE_ROUTER_LITERAL.STRING_LATE_AFTER_RETIRED_WAITER;
  }
}

function buildServiceResponseDisposition(options = {}) {
  return Object.freeze({
    messageId: normalizeIdentifier(options?.messageId) || null,
    kind:
      normalizeIdentifier(options?.kind) ||
      SERVICE_RESPONSE_DISPOSITION_KIND.ORPHANED,
    classification:
      normalizeIdentifier(options?.classification) ||
      SERVICE_RESPONSE_DISPOSITION_KIND.ORPHANED,
    absorbed: options?.absorbed === true,
    retiredReason: normalizeIdentifier(options?.retiredReason) || null,
    deliverySource: normalizeIdentifier(options?.deliverySource) || null,
    targetNodeId: normalizeIdentifier(options?.targetNodeId) || null,
  });
}

function resolveDeliverySource(targetAddress, message, options = {}) {
  const explicitSource = normalizeIdentifier(options?.deliverySource);
  if (explicitSource) {
    return explicitSource;
  }
  return buildDerivedDeliverySource(targetAddress, message);
}

function buildPendingSourceSummary(
  queue,
  limit = MESSAGE_ROUTER_LITERAL.NUMBER_5,
) {
  if (
    !queue ||
    !Array.isArray(queue.pending) ||
    queue.pending.length === TRANSPORT_NUM.ZERO
  ) {
    return [];
  }
  const countsBySource = /* @__PURE__ */ new Map();
  for (const item of queue.pending) {
    const source = normalizeIdentifier(item?.deliverySource) || 'unknown';
    countsBySource.set(
      source,
      (countsBySource.get(source) || TRANSPORT_NUM.ZERO) + TRANSPORT_NUM.ONE,
    );
  }
  return [...countsBySource.entries()]
    .sort(
      (left, right) =>
        right[TRANSPORT_NUM.ONE] - left[TRANSPORT_NUM.ONE] ||
        left[TRANSPORT_NUM.ZERO].localeCompare(right[TRANSPORT_NUM.ZERO]),
    )
    .slice(TRANSPORT_NUM.ZERO, limit)
    .map(([source, count]) => ({
      source,
      count,
    }));
}

function normalizeDeliveryOutcome(outcome) {
  if (
    outcome &&
    typeof outcome === TRANSPORT_TYPEOF.OBJECT &&
    Object.prototype.hasOwnProperty.call(
      outcome,
      MESSAGE_ROUTER_LITERAL.STRING_RESULT,
    ) &&
    Object.prototype.hasOwnProperty.call(
      outcome,
      MESSAGE_ROUTER_LITERAL.STRING_QUEUEWAITMS,
    )
  ) {
    return {
      result: buildTransportDeliveryOutcome(outcome.result),
      queueWaitMs: Number.isFinite(outcome.queueWaitMs) ?
        Math.max(TRANSPORT_NUM.ZERO, Math.floor(outcome.queueWaitMs)) :
        TRANSPORT_NUM.ZERO,
    };
  }
  return {
    result: buildTransportDeliveryOutcome(outcome),
    queueWaitMs: TRANSPORT_NUM.ZERO,
  };
}

function normalizeRetryAfterMs(value, fallback) {
  if (Number.isFinite(value) && value > TRANSPORT_NUM.ZERO) {
    return Math.floor(value);
  }
  if (Number.isFinite(fallback) && fallback > TRANSPORT_NUM.ZERO) {
    return Math.floor(fallback);
  }
  return TRANSPORT_NUM.ZERO;
}

function buildSupersededPendingResult(replacedItem) {
  return {
    result: {
      acknowledged: true,
      coalesced: true,
      replacedPending: true,
      deliverySource: replacedItem?.deliverySource || null,
    },
    queueWaitMs: TRANSPORT_NUM.ZERO,
  };
}

function normalizeOutboundDeliveryPriority(priority, targetAddress = null) {
  if (priority === OutboundDeliveryPriority.CRITICAL) {
    return OutboundDeliveryPriority.CRITICAL;
  }
  if (priority === OutboundDeliveryPriority.READINESS) {
    return OutboundDeliveryPriority.READINESS;
  }
  if (priority === OutboundDeliveryPriority.BACKGROUND) {
    return OutboundDeliveryPriority.BACKGROUND;
  }
  if (
    typeof targetAddress === TRANSPORT_TYPEOF.STRING &&
    targetAddress.length > TRANSPORT_NUM.ZERO &&
    isCriticalTransportTargetAddress({targetAddress})
  ) {
    return OutboundDeliveryPriority.CRITICAL;
  }
  return OutboundDeliveryPriority.BACKGROUND;
}

function countPendingByPriority(queue, priority) {
  if (!queue || !Array.isArray(queue.pending)) {
    return TRANSPORT_NUM.ZERO;
  }
  return queue.pending.reduce((count, item) => {
    return item?.priority === priority ? count + TRANSPORT_NUM.ONE : count;
  }, TRANSPORT_NUM.ZERO);
}

function selectCriticalPendingSourcePreemptionCandidateIndex(
  queue,
  incomingDeliverySource,
) {
  if (
    !queue ||
    !Array.isArray(queue.pending) ||
    queue.pending.length === TRANSPORT_NUM.ZERO
  ) {
    return -LOCAL_NUM_ONE;
  }
  const incomingSource = resolveDeliverySourceAdmissionKey(
    incomingDeliverySource,
    OutboundDeliveryPriority.CRITICAL,
  );
  if (
    countCriticalPendingByAdmissionSource(queue, incomingSource) >
    TRANSPORT_NUM.ZERO
  ) {
    return -LOCAL_NUM_ONE;
  }
  const sourceCounts = new Map();
  for (const item of queue.pending) {
    if (item?.priority !== OutboundDeliveryPriority.CRITICAL) {
      continue;
    }
    const source = resolveQueuedDeliverySourceAdmissionKey(item);
    if (source === incomingSource) {
      continue;
    }
    sourceCounts.set(
      source,
      (sourceCounts.get(source) || TRANSPORT_NUM.ZERO) + TRANSPORT_NUM.ONE,
    );
  }
  let selectedSource = null;
  let selectedCount = TRANSPORT_NUM.ZERO;
  for (const [source, count] of sourceCounts.entries()) {
    if (count > selectedCount) {
      selectedSource = source;
      selectedCount = count;
    }
  }
  if (selectedCount <= TRANSPORT_NUM.ONE) {
    return -LOCAL_NUM_ONE;
  }
  for (
    let index = queue.pending.length - TRANSPORT_NUM.ONE;
    index >= TRANSPORT_NUM.ZERO;
    index--
  ) {
    const item = queue.pending[index];
    if (
      item?.priority === OutboundDeliveryPriority.CRITICAL &&
      resolveQueuedDeliverySourceAdmissionKey(item) === selectedSource
    ) {
      return index;
    }
  }
  return -LOCAL_NUM_ONE;
}

function takeCriticalPendingItemForSourceReserve(
  queue,
  incomingDeliverySource,
) {
  const preemptionCandidateIndex =
    selectCriticalPendingSourcePreemptionCandidateIndex(
      queue,
      incomingDeliverySource,
    );
  if (preemptionCandidateIndex < TRANSPORT_NUM.ZERO) {
    return null;
  }
  return queue.pending.splice(
    preemptionCandidateIndex,
    TRANSPORT_NUM.ONE,
  )[TRANSPORT_NUM.ZERO] || null;
}

function resolveNextCriticalPendingItemIndex(queue) {
  const reservedCriticalIndex = queue.pending.findIndex((item) => {
    return item?.priority === OutboundDeliveryPriority.CRITICAL &&
      item?.criticalSourceReserve === true;
  });
  if (reservedCriticalIndex >= TRANSPORT_NUM.ZERO) {
    return reservedCriticalIndex;
  }
  const firstCriticalIndex = queue.pending.findIndex((item) => {
    return item?.priority === OutboundDeliveryPriority.CRITICAL;
  });
  if (firstCriticalIndex < TRANSPORT_NUM.ZERO) {
    return firstCriticalIndex;
  }
  const lastCriticalDeliverySource =
    typeof queue?.lastCriticalDeliverySource === TRANSPORT_TYPEOF.STRING &&
    queue.lastCriticalDeliverySource.length > TRANSPORT_NUM.ZERO ?
      queue.lastCriticalDeliverySource :
      EMPTY_DELIVERY_SOURCE;
  if (lastCriticalDeliverySource === EMPTY_DELIVERY_SOURCE) {
    return firstCriticalIndex;
  }
  const alternateCriticalIndex = queue.pending.findIndex((item) => {
    return (
      item?.priority === OutboundDeliveryPriority.CRITICAL &&
      resolveQueuedDeliverySourceAdmissionKey(item) !== lastCriticalDeliverySource
    );
  });
  return alternateCriticalIndex >= TRANSPORT_NUM.ZERO ?
    alternateCriticalIndex :
    firstCriticalIndex;
}

function countInFlightByPriority(queue, priority) {
  if (!queue) {
    return TRANSPORT_NUM.ZERO;
  }
  const rawCount =
    priority === OutboundDeliveryPriority.CRITICAL ?
      queue.inFlightCritical :
      queue.inFlightBackground;
  return Number.isFinite(rawCount) && rawCount > TRANSPORT_NUM.ZERO ?
    Math.floor(rawCount) :
    TRANSPORT_NUM.ZERO;
}

function countInFlightBySource(queue, deliverySource) {
  if (!(queue?.inFlightBySource instanceof Map)) {
    return TRANSPORT_NUM.ZERO;
  }
  const normalizedDeliverySource = normalizeQueuedDeliverySource(
    deliverySource,
  );
  const rawCount = queue.inFlightBySource.get(normalizedDeliverySource);
  return Number.isFinite(rawCount) && rawCount > TRANSPORT_NUM.ZERO ?
    Math.floor(rawCount) :
    TRANSPORT_NUM.ZERO;
}

function countInFlightCriticalSourceReserve(queue) {
  const rawCount = queue?.inFlightCriticalSourceReserve;
  return Number.isFinite(rawCount) && rawCount > TRANSPORT_NUM.ZERO ?
    Math.floor(rawCount) :
    TRANSPORT_NUM.ZERO;
}

function resolveNormalizedQueueMaxConcurrent(queue) {
  if (!queue) {
    return TRANSPORT_NUM.ZERO;
  }
  const maxConcurrent =
    Number.isFinite(queue.maxConcurrent) &&
    queue.maxConcurrent > TRANSPORT_NUM.ZERO ?
      Math.floor(queue.maxConcurrent) :
      TRANSPORT_NUM.ZERO;
  return maxConcurrent;
}

function resolveTargetFallbackInFlightSourceLimit(queue) {
  const maxConcurrent = resolveNormalizedQueueMaxConcurrent(queue);
  if (maxConcurrent <= TRANSPORT_NUM.ZERO) {
    return TRANSPORT_NUM.ZERO;
  }
  const proportionalLimit = Math.floor(
    maxConcurrent /
      OUTBOUND_QUEUE_TARGET_FALLBACK_IN_FLIGHT_SOURCE_LIMIT_DIVISOR,
  );
  return Math.min(
    maxConcurrent,
    Math.max(TRANSPORT_NUM.ONE, proportionalLimit),
  );
}

function isTargetFallbackCriticalAdmissionSource(deliverySource) {
  return normalizeQueuedDeliverySource(deliverySource) ===
    MESSAGE_ROUTER_LITERAL.STRING_TARGET_CRITICAL_FALLBACK;
}

function resolveCriticalInFlightSourceLimit(queue, deliverySource) {
  const maxConcurrent = resolveNormalizedQueueMaxConcurrent(queue);
  if (maxConcurrent <= TRANSPORT_NUM.ZERO) {
    return TRANSPORT_NUM.ZERO;
  }
  const maxReservedConcurrent = Math.max(
    TRANSPORT_NUM.ZERO,
    maxConcurrent - TRANSPORT_NUM.ONE,
  );
  const effectiveCriticalReserve = Math.max(
    TRANSPORT_NUM.ONE,
    resolveBoundedCriticalReserve(
      queue.criticalReserve,
      maxReservedConcurrent,
    ),
  );
  const reserveProtectedLimit = Math.max(
    TRANSPORT_NUM.ONE,
    maxConcurrent - effectiveCriticalReserve,
  );
  if (isTargetFallbackCriticalAdmissionSource(deliverySource)) {
    return Math.min(
      reserveProtectedLimit,
      resolveTargetFallbackInFlightSourceLimit(queue),
    );
  }
  return reserveProtectedLimit;
}

function resolveCriticalSourceReserveInFlightLimit(queue) {
  if (!queue) {
    return TRANSPORT_NUM.ZERO;
  }
  const maxConcurrent =
    Number.isFinite(queue.maxConcurrent) &&
    queue.maxConcurrent > TRANSPORT_NUM.ZERO ?
      Math.floor(queue.maxConcurrent) :
      TRANSPORT_NUM.ZERO;
  if (maxConcurrent <= TRANSPORT_NUM.ZERO) {
    return TRANSPORT_NUM.ZERO;
  }
  return Math.max(
    TRANSPORT_NUM.ONE,
    resolveBoundedCriticalReserve(queue.criticalReserve, maxConcurrent),
  );
}

function adjustInFlightSourceCount(queue, deliverySource, delta) {
  if (
    !(queue?.inFlightBySource instanceof Map) ||
    !Number.isFinite(delta) ||
    delta === TRANSPORT_NUM.ZERO
  ) {
    return;
  }
  const normalizedDeliverySource = normalizeQueuedDeliverySource(
    deliverySource,
  );
  const normalizedDelta =
    delta > TRANSPORT_NUM.ZERO ? TRANSPORT_NUM.ONE : -TRANSPORT_NUM.ONE;
  const nextCount = Math.max(
    TRANSPORT_NUM.ZERO,
    countInFlightBySource(queue, normalizedDeliverySource) + normalizedDelta,
  );
  if (nextCount > TRANSPORT_NUM.ZERO) {
    queue.inFlightBySource.set(normalizedDeliverySource, nextCount);
    return;
  }
  queue.inFlightBySource.delete(normalizedDeliverySource);
}

function adjustInFlightCriticalSourceReserveCount(queue, delta) {
  if (!queue || !Number.isFinite(delta) || delta === TRANSPORT_NUM.ZERO) {
    return;
  }
  const normalizedDelta =
    delta > TRANSPORT_NUM.ZERO ? TRANSPORT_NUM.ONE : -TRANSPORT_NUM.ONE;
  queue.inFlightCriticalSourceReserve = Math.max(
    TRANSPORT_NUM.ZERO,
    countInFlightCriticalSourceReserve(queue) + normalizedDelta,
  );
}

function resolveBackgroundPendingLimit(queue) {
  if (!queue) {
    return TRANSPORT_NUM.ZERO;
  }
  const criticalReserve = resolveBoundedCriticalReserve(
    queue.criticalReserve,
    queue.maxPending,
  );
  return Math.max(TRANSPORT_NUM.ZERO, queue.maxPending - criticalReserve);
}

function resolveCriticalPendingCeiling(queue) {
  const maxPending = normalizeQueueMaxPending(queue);
  const readinessReserve = resolveBoundedReadinessReserve(
    queue?.readinessReserve,
    maxPending,
  );
  return Math.max(TRANSPORT_NUM.ZERO, maxPending - readinessReserve);
}

function isOutboundNodeBackpressured(
  queue,
  deliveryPriority,
  pendingBackground,
  backgroundPendingLimit,
) {
  if (deliveryPriority === OutboundDeliveryPriority.CRITICAL) {
    return queue.pending.length >= resolveCriticalPendingCeiling(queue);
  }
  if (deliveryPriority === OutboundDeliveryPriority.READINESS) {
    return queue.pending.length >= normalizeQueueMaxPending(queue);
  }
  return pendingBackground >= backgroundPendingLimit;
}

function resolveBackgroundInFlightLimit(queue) {
  if (!queue) {
    return TRANSPORT_NUM.ZERO;
  }
  const maxConcurrent =
    Number.isFinite(queue.maxConcurrent) &&
    queue.maxConcurrent > TRANSPORT_NUM.ZERO ?
      Math.floor(queue.maxConcurrent) :
      TRANSPORT_NUM.ZERO;
  if (maxConcurrent <= TRANSPORT_NUM.ZERO) {
    return TRANSPORT_NUM.ZERO;
  }
  const maxReservedConcurrent = Math.max(
    TRANSPORT_NUM.ZERO,
    maxConcurrent - TRANSPORT_NUM.ONE,
  );
  const criticalReserve = resolveBoundedCriticalReserve(
    queue.criticalReserve,
    maxReservedConcurrent,
  );
  return Math.max(TRANSPORT_NUM.ONE, maxConcurrent - criticalReserve);
}

function resolveNextPendingItemIndex(queue) {
  if (
    !queue ||
    !Array.isArray(queue.pending) ||
    queue.pending.length === TRANSPORT_NUM.ZERO
  ) {
    return -LOCAL_NUM_ONE;
  }

  const preferredIndex = (() => {
    const criticalIndex = resolveNextCriticalPendingItemIndex(queue);
    if (criticalIndex >= TRANSPORT_NUM.ZERO) {
      return criticalIndex;
    }
    return TRANSPORT_NUM.ZERO;
  })();

  if (preferredIndex >= TRANSPORT_NUM.ZERO && preferredIndex < queue.pending.length) {
    const preferredItem = queue.pending[preferredIndex];
    if (canDispatchPendingItem(queue, preferredItem)) {
      return preferredIndex;
    }
  }

  // Scan remaining CRITICAL items first to preserve priority
  for (let i = 0; i < queue.pending.length; i++) {
    const item = queue.pending[i];
    if (item?.priority === OutboundDeliveryPriority.CRITICAL && i !== preferredIndex) {
      if (canDispatchPendingItem(queue, item)) {
        return i;
      }
    }
  }

  // Scan BACKGROUND items if no CRITICAL items can be dispatched
  for (let i = 0; i < queue.pending.length; i++) {
    const item = queue.pending[i];
    if (item?.priority !== OutboundDeliveryPriority.CRITICAL && i !== preferredIndex) {
      if (canDispatchPendingItem(queue, item)) {
        return i;
      }
    }
  }

  return -LOCAL_NUM_ONE;
}

function peekNextPendingItem(queue) {
  const nextItemIndex = resolveNextPendingItemIndex(queue);
  return nextItemIndex >= TRANSPORT_NUM.ZERO ?
    queue.pending[nextItemIndex] :
    null;
}

function dequeueNextPendingItem(queue) {
  const nextItemIndex = resolveNextPendingItemIndex(queue);
  return nextItemIndex >= TRANSPORT_NUM.ZERO ?
    queue.pending.splice(nextItemIndex, TRANSPORT_NUM.ONE)[TRANSPORT_NUM.ZERO] :
    null;
}

function canDispatchPendingItem(queue, item) {
  if (!queue || !item) {
    return false;
  }
  const queueAtConcurrentLimit = queue.inFlight >= queue.maxConcurrent;
  if (item.priority === OutboundDeliveryPriority.CRITICAL) {
    const deliverySourceAdmissionKey =
      resolveQueuedDeliverySourceAdmissionKey(item);
    if (
      queueAtConcurrentLimit &&
      item?.criticalSourceReserve !== true
    ) {
      return false;
    }
    if (
      queueAtConcurrentLimit &&
      countInFlightCriticalSourceReserve(queue) >=
        resolveCriticalSourceReserveInFlightLimit(queue)
    ) {
      return false;
    }
    return (
      countInFlightBySource(
        queue,
        deliverySourceAdmissionKey,
      ) <
      resolveCriticalInFlightSourceLimit(queue, deliverySourceAdmissionKey)
    );
  }
  if (queueAtConcurrentLimit) {
    return false;
  }
  return (
    countInFlightByPriority(queue, OutboundDeliveryPriority.BACKGROUND) <
    resolveBackgroundInFlightLimit(queue)
  );
}

function adjustInFlightPriorityCount(queue, priority, delta) {
  if (!queue || !Number.isFinite(delta) || delta === TRANSPORT_NUM.ZERO) {
    return;
  }
  const normalizedDelta =
    delta > TRANSPORT_NUM.ZERO ? TRANSPORT_NUM.ONE : -TRANSPORT_NUM.ONE;
  if (priority === OutboundDeliveryPriority.CRITICAL) {
    queue.inFlightCritical = Math.max(
      TRANSPORT_NUM.ZERO,
      countInFlightByPriority(queue, OutboundDeliveryPriority.CRITICAL) +
        normalizedDelta,
    );
    return;
  }
  queue.inFlightBackground = Math.max(
    TRANSPORT_NUM.ZERO,
    countInFlightByPriority(queue, OutboundDeliveryPriority.BACKGROUND) +
      normalizedDelta,
  );
}

export {
  adjustInFlightCriticalSourceReserveCount,
  adjustInFlightPriorityCount,
  adjustInFlightSourceCount,
  buildDerivedDeliverySource,
  buildPendingSourceAdmission,
  buildPendingSourceLimitEvidence,
  buildPendingSourceSummary,
  buildRetiredPendingClassification,
  buildServiceResponseDisposition,
  buildSupersededPendingResult,
  canDispatchPendingItem,
  countCriticalPendingBySource,
  countInFlightByPriority,
  countInFlightBySource,
  countPendingByPriority,
  countPendingBySource,
  dequeueNextPendingItem,
  isOutboundNodeBackpressured,
  normalizeDeliveryOutcome,
  normalizeOutboundDeliveryPriority,
  normalizeQueueMaxPending,
  normalizeQueuedDeliverySource,
  normalizeRetryAfterMs,
  peekNextPendingItem,
  resolveBackgroundInFlightLimit,
  resolveBackgroundPendingLimit,
  resolveBoundedCriticalReserve,
  resolveBoundedReadinessReserve,
  resolveCriticalInFlightSourceLimit,
  resolveCriticalPendingCeiling,
  resolveCriticalPendingSourceLimit,
  resolveDeliverySource,
  resolveDeliverySourceAdmissionKey,
  resolveNextCriticalPendingItemIndex,
  resolveNextPendingItemIndex,
  resolvePendingSourceLimit,
  resolveProportionalPendingSourceLimit,
  resolveQueuedDeliverySourceAdmissionKey,
  resolveTargetFallbackInFlightSourceLimit,
  resolveSemanticDeliverySourceMessage,
  selectCriticalPendingSourcePreemptionCandidateIndex,
  takeCriticalPendingItemForSourceReserve,
};
