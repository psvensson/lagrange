import {TRANSPORT_NUM} from '../constants/transport.js';
import {PRIORITY_CONTROL_PLANE_TABLE_IDS} from
  '../bootstrap/system-partition-classification.js';
import {
  MESSAGE_ROUTER_LITERAL,
  OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_DIVISOR,
  OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_MINIMUM,
  OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_STATE,
  OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_STATE_TABLE,
  OUTBOUND_QUEUE_TARGET_FALLBACK_PENDING_SOURCE_LIMIT_DIVISOR,
  OutboundDeliveryPriority,
  normalizeIdentifier,
} from './message-router-shared-vocabulary.js';

const TARGET_SOURCE_PARTITION_PATTERN =
  /^target:[^/]+\/partition\/(.+)-p\d+(?:-r\d+)?$/u;

function normalizeQueueMaxPending(queue) {
  const maxPending =
    Number.isFinite(queue?.maxPending) &&
    queue.maxPending > TRANSPORT_NUM.ZERO ?
      Math.floor(queue.maxPending) :
      TRANSPORT_NUM.ZERO;
  return maxPending;
}

function normalizeQueuedDeliverySource(deliverySource) {
  return (
    normalizeIdentifier(deliverySource) ||
    MESSAGE_ROUTER_LITERAL.STRING_UNKNOWN
  );
}

function isCriticalTargetFallbackDeliverySource(
  deliverySource,
  deliveryPriority,
) {
  return deliveryPriority === OutboundDeliveryPriority.CRITICAL &&
    normalizeQueuedDeliverySource(deliverySource)
      .startsWith(MESSAGE_ROUTER_LITERAL.STRING_TARGET_PREFIX);
}

function isPrioritySystemTargetDeliverySource(deliverySource) {
  const normalizedDeliverySource = normalizeQueuedDeliverySource(
    deliverySource,
  );
  const partitionMatch = normalizedDeliverySource.match(
    TARGET_SOURCE_PARTITION_PATTERN,
  );
  if (!partitionMatch) {
    return false;
  }
  return PRIORITY_CONTROL_PLANE_TABLE_IDS.has(partitionMatch[1]);
}

function resolveDeliverySourceAdmissionKey(
  deliverySource,
  deliveryPriority,
) {
  const normalizedDeliverySource = normalizeQueuedDeliverySource(
    deliverySource,
  );
  if (
    deliveryPriority === OutboundDeliveryPriority.CRITICAL &&
    (
      normalizedDeliverySource ===
        MESSAGE_ROUTER_LITERAL.STRING_TARGET_CRITICAL_FALLBACK ||
      normalizedDeliverySource ===
        MESSAGE_ROUTER_LITERAL.STRING_TARGET_PRIORITY_CONTROL_PLANE
    )
  ) {
    return normalizedDeliverySource;
  }
  if (
    deliveryPriority === OutboundDeliveryPriority.CRITICAL &&
    isPrioritySystemTargetDeliverySource(normalizedDeliverySource)
  ) {
    return MESSAGE_ROUTER_LITERAL.STRING_TARGET_PRIORITY_CONTROL_PLANE;
  }
  if (
    isCriticalTargetFallbackDeliverySource(
      normalizedDeliverySource,
      deliveryPriority,
    )
  ) {
    return MESSAGE_ROUTER_LITERAL.STRING_TARGET_CRITICAL_FALLBACK;
  }
  return normalizedDeliverySource;
}

function resolveQueuedDeliverySourceAdmissionKey(item) {
  const storedAdmissionKey = normalizeIdentifier(
    item?.deliverySourceAdmissionKey,
  );
  if (storedAdmissionKey) {
    return storedAdmissionKey;
  }
  return resolveDeliverySourceAdmissionKey(
    item?.deliverySource,
    item?.priority,
  );
}

function countPendingBySource(queue, deliverySource) {
  if (!queue || !Array.isArray(queue.pending)) {
    return TRANSPORT_NUM.ZERO;
  }
  const normalizedDeliverySource =
    normalizeIdentifier(deliverySource) ||
    MESSAGE_ROUTER_LITERAL.STRING_UNKNOWN;
  return queue.pending.reduce((count, item) => {
    const pendingSource =
      normalizeIdentifier(item?.deliverySource) ||
      MESSAGE_ROUTER_LITERAL.STRING_UNKNOWN;
    return pendingSource === normalizedDeliverySource ?
      count + TRANSPORT_NUM.ONE :
      count;
  }, TRANSPORT_NUM.ZERO);
}

function countPendingByAdmissionSource(
  queue,
  deliverySource,
  deliveryPriority,
) {
  if (!queue || !Array.isArray(queue.pending)) {
    return TRANSPORT_NUM.ZERO;
  }
  const admissionKey = resolveDeliverySourceAdmissionKey(
    deliverySource,
    deliveryPriority,
  );
  return queue.pending.reduce((count, item) => {
    return resolveQueuedDeliverySourceAdmissionKey(item) === admissionKey ?
      count + TRANSPORT_NUM.ONE :
      count;
  }, TRANSPORT_NUM.ZERO);
}

function countCriticalPendingBySource(queue, deliverySource) {
  if (!queue || !Array.isArray(queue.pending)) {
    return TRANSPORT_NUM.ZERO;
  }
  const normalizedDeliverySource = normalizeQueuedDeliverySource(
    deliverySource,
  );
  return queue.pending.reduce((count, item) => {
    if (item?.priority !== OutboundDeliveryPriority.CRITICAL) {
      return count;
    }
    return normalizeQueuedDeliverySource(item?.deliverySource) ===
      normalizedDeliverySource ?
      count + TRANSPORT_NUM.ONE :
      count;
  }, TRANSPORT_NUM.ZERO);
}

function countCriticalPendingByAdmissionSource(queue, deliverySource) {
  if (!queue || !Array.isArray(queue.pending)) {
    return TRANSPORT_NUM.ZERO;
  }
  const admissionKey = resolveDeliverySourceAdmissionKey(
    deliverySource,
    OutboundDeliveryPriority.CRITICAL,
  );
  return queue.pending.reduce((count, item) => {
    if (item?.priority !== OutboundDeliveryPriority.CRITICAL) {
      return count;
    }
    return resolveQueuedDeliverySourceAdmissionKey(item) === admissionKey ?
      count + TRANSPORT_NUM.ONE :
      count;
  }, TRANSPORT_NUM.ZERO);
}

function buildPendingSourceAdmission(queue, deliverySource, deliveryPriority) {
  const deliverySourceAdmissionKey = resolveDeliverySourceAdmissionKey(
    deliverySource,
    deliveryPriority,
  );
  const pendingForSource = countPendingByAdmissionSource(
    queue,
    deliverySource,
    deliveryPriority,
  );
  const pendingSourceLimit = resolvePendingSourceLimit(
    queue,
    deliveryPriority,
    deliverySource,
  );
  const applySourceLimit = pendingSourceLimit > TRANSPORT_NUM.ZERO;
  return Object.freeze({
    deliverySourceAdmissionKey,
    pendingForSource,
    pendingSourceLimit,
    applySourceLimit,
    sourceBackpressured:
      applySourceLimit &&
      pendingSourceLimit > TRANSPORT_NUM.ZERO &&
      pendingForSource >= pendingSourceLimit,
  });
}

function resolveProportionalPendingSourceLimit(maxPending) {
  const proportionalLimit = Math.floor(
    maxPending / OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_DIVISOR,
  );
  return Math.min(
    maxPending,
    Math.max(OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_MINIMUM, proportionalLimit),
  );
}

function resolveTargetFallbackPendingSourceLimit(maxPending) {
  const proportionalLimit = Math.floor(
    maxPending / OUTBOUND_QUEUE_TARGET_FALLBACK_PENDING_SOURCE_LIMIT_DIVISOR,
  );
  return Math.min(
    maxPending,
    Math.max(OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_MINIMUM, proportionalLimit),
  );
}

function buildPendingSourceLimitEvidence(
  queue,
  maxPending,
  deliveryPriority,
  deliverySource,
) {
  const deliverySourceAdmissionKey = resolveDeliverySourceAdmissionKey(
    deliverySource,
    deliveryPriority,
  );
  return Object.freeze({
    maxPending,
    deliveryPriority,
    deliverySourceAdmissionKey,
    targetFallbackSource:
      deliverySourceAdmissionKey ===
      MESSAGE_ROUTER_LITERAL.STRING_TARGET_CRITICAL_FALLBACK,
  });
}

function resolveBoundedCriticalReserve(rawReserve, maxReserve) {
  const normalizedMaxReserve =
    Number.isFinite(maxReserve) && maxReserve > TRANSPORT_NUM.ZERO ?
      Math.floor(maxReserve) :
      TRANSPORT_NUM.ZERO;
  if (normalizedMaxReserve <= TRANSPORT_NUM.ZERO) {
    return TRANSPORT_NUM.ZERO;
  }
  const normalizedReserve =
    Number.isFinite(rawReserve) && rawReserve > TRANSPORT_NUM.ZERO ?
      Math.floor(rawReserve) :
      TRANSPORT_NUM.ZERO;
  return Math.min(normalizedReserve, normalizedMaxReserve);
}

function resolveBoundedReadinessReserve(rawReserve, maxReserve) {
  const normalizedMaxReserve =
    Number.isFinite(maxReserve) && maxReserve > TRANSPORT_NUM.ZERO ?
      Math.floor(maxReserve) :
      TRANSPORT_NUM.ZERO;
  if (normalizedMaxReserve <= TRANSPORT_NUM.ZERO) {
    return TRANSPORT_NUM.ZERO;
  }
  const normalizedReserve =
    Number.isFinite(rawReserve) && rawReserve > TRANSPORT_NUM.ZERO ?
      Math.floor(rawReserve) :
      TRANSPORT_NUM.ZERO;
  return Math.min(normalizedReserve, normalizedMaxReserve);
}

function resolveCriticalPendingSourceLimit(queue, maxPending) {
  const criticalReserve = resolveBoundedCriticalReserve(
    queue?.criticalReserve,
    maxPending,
  );
  const reserveProtectedLimit = Math.max(
    TRANSPORT_NUM.ZERO,
    maxPending - criticalReserve,
  );
  return Math.min(
    maxPending,
    Math.max(
      OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_MINIMUM,
      reserveProtectedLimit,
    ),
  );
}

function resolvePendingSourceLimit(
  queue,
  deliveryPriority,
  deliverySource,
) {
  const maxPending = normalizeQueueMaxPending(queue);
  const evidence = buildPendingSourceLimitEvidence(
    queue,
    maxPending,
    deliveryPriority,
    deliverySource,
  );
  const limitState =
    OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_STATE_TABLE.find((entry) =>
      entry.matches(evidence),
    )?.state ||
    OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_STATE.PROPORTIONAL;
  if (limitState === OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_STATE.DISABLED) {
    return TRANSPORT_NUM.ZERO;
  }
  if (evidence.targetFallbackSource === true) {
    return resolveTargetFallbackPendingSourceLimit(maxPending);
  }
  if (
    limitState ===
    OUTBOUND_QUEUE_PENDING_SOURCE_LIMIT_STATE.CRITICAL_RESERVE_PROTECTED
  ) {
    return resolveCriticalPendingSourceLimit(queue, maxPending);
  }
  return resolveProportionalPendingSourceLimit(maxPending);
}

export {
  buildPendingSourceAdmission,
  buildPendingSourceLimitEvidence,
  countCriticalPendingByAdmissionSource,
  countCriticalPendingBySource,
  countPendingByAdmissionSource,
  countPendingBySource,
  isCriticalTargetFallbackDeliverySource,
  isPrioritySystemTargetDeliverySource,
  normalizeQueueMaxPending,
  normalizeQueuedDeliverySource,
  resolveBoundedCriticalReserve,
  resolveBoundedReadinessReserve,
  resolveCriticalPendingSourceLimit,
  resolveDeliverySourceAdmissionKey,
  resolvePendingSourceLimit,
  resolveProportionalPendingSourceLimit,
  resolveQueuedDeliverySourceAdmissionKey,
  resolveTargetFallbackPendingSourceLimit,
};
