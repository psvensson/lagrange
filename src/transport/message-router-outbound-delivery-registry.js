import {assertDeliveryOpen, deliveryAbortReason} from './message-router-delivery-lifetime.js';
import {
  ROUTER_ERROR_MSG,
  TRANSPORT_DEFAULT,
  TRANSPORT_EVENT,
  TRANSPORT_NUM,
} from '../constants/transport.js';
import {EMPTY_DELIVERY_SOURCE, MESSAGE_ROUTER_LITERAL, OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE, OUTBOUND_QUEUE_BACKPRESSURE_SCOPE, OutboundDeliveryPriority, TRANSPORT_PRESSURE_SUMMARY_FIELD, createQueueWaitHistogram, normalizeIdentifier, recordQueueWaitDuration, resolvePendingReplacementKey} from './message-router-shared-vocabulary.js';
import {adjustInFlightCriticalSourceReserveCount, adjustInFlightPriorityCount, adjustInFlightReadinessReserveCount, adjustInFlightSourceCount, buildPendingSourceAdmission, buildPendingSourceSummary, buildSupersededPendingResult, canDispatchPendingItem, countInFlightByPriority, countInFlightBySource, countInFlightReadinessReserve, countPendingByPriority, dequeueNextPendingItem, isOutboundNodeBackpressured, normalizeOutboundDeliveryPriority, peekNextPendingItem, resolveBackgroundPendingLimit, resolveCriticalInFlightSourceLimit, resolveCriticalPendingCeiling, resolveDeliverySource, resolveDeliverySourceAdmissionKey, resolveQueuedDeliverySourceAdmissionKey, resolveReadinessReserveInFlightLimit, takeCriticalPendingItemForSourceReserve} from './message-router-outbound-queue-admission.js';

// A queued item's listener ends at dequeue; its in-flight slot ends only when
// the actual deliverFn settles. Public cancellation never releases raw work.
function createPendingItem(owner, nodeId, queue, properties, options) {
  const signal = options.signal;
  let settled = false;
  const item = {
    ...properties,
    assertOpen: () => assertDeliveryOpen(options),
    detachAbort: () => signal?.removeEventListener(TRANSPORT_EVENT.ABORT, cancel),
  };
  const finish = (settle, value) => {
    if (settled) return;
    settled = true;
    item.detachAbort();
    settle(value);
  };
  item.resolve = (value) => finish(properties.resolve, value);
  item.reject = (error) => finish(properties.reject, error);
  function cancel() {
    const index = queue.pending.indexOf(item);
    if (index < 0) return;
    queue.pending.splice(index, 1);
    item.reject(deliveryAbortReason(signal));
    owner.process(nodeId);
  }
  item.watchCancellation = () => {
    if (signal?.aborted) cancel();
    else signal?.addEventListener(TRANSPORT_EVENT.ABORT, cancel, {once: true});
  };
  return item;
}

function removeExpiredPending(queue) {
  // The existing bounded queue is the only retained collection. Inspect even
  // entries behind a blocked head when delayed timer callbacks have not run.
  for (const item of [...queue.pending]) {
    try {
      item.assertOpen?.();
    } catch (error) {
      const index = queue.pending.indexOf(item);
      if (index >= 0) queue.pending.splice(index, 1);
      item.reject(error);
    }
  }
}

function acquireInFlight(queue, item) {
  if (item.priority === OutboundDeliveryPriority.CRITICAL) {
    queue.lastCriticalDeliverySource =
      resolveQueuedDeliverySourceAdmissionKey(item);
  }
  if (
    item.priority === OutboundDeliveryPriority.READINESS &&
    queue.inFlight >= queue.maxConcurrent
  ) {
    item.readinessReserveInFlight = true;
  }
  queue.inFlight += TRANSPORT_NUM.ONE;
  adjustInFlightPriorityCount(queue, item.priority, TRANSPORT_NUM.ONE);
  if (item.priority === OutboundDeliveryPriority.CRITICAL) {
    adjustInFlightSourceCount(
      queue,
      resolveQueuedDeliverySourceAdmissionKey(item),
      TRANSPORT_NUM.ONE,
    );
  }
  if (item.criticalSourceReserve === true) {
    adjustInFlightCriticalSourceReserveCount(
      queue,
      TRANSPORT_NUM.ONE,
    );
  }
  if (item.readinessReserveInFlight === true) {
    adjustInFlightReadinessReserveCount(queue, TRANSPORT_NUM.ONE);
  }
}

function releaseInFlight(queue, item) {
  queue.inFlight -= TRANSPORT_NUM.ONE;
  adjustInFlightPriorityCount(queue, item.priority, -TRANSPORT_NUM.ONE);
  if (item.priority === OutboundDeliveryPriority.CRITICAL) {
    adjustInFlightSourceCount(
      queue, resolveQueuedDeliverySourceAdmissionKey(item), -TRANSPORT_NUM.ONE,
    );
  }
  if (item.criticalSourceReserve === true) {
    adjustInFlightCriticalSourceReserveCount(queue, -TRANSPORT_NUM.ONE);
  }
  if (item.readinessReserveInFlight === true) {
    adjustInFlightReadinessReserveCount(queue, -TRANSPORT_NUM.ONE);
  }
}

const NODE_STATE_UPDATE_DELIVERY_SOURCE =
  `${MESSAGE_ROUTER_LITERAL.STRING_MESSAGE}:` +
  MESSAGE_ROUTER_LITERAL.STRING_NODE_STATE_UPDATE;

const NODE_STATE_UPDATE_REPLACE_PENDING_KEY_PREFIX =
  `${MESSAGE_ROUTER_LITERAL.STRING_NODE_STATE_UPDATE}:`;

function buildOutboundQueueBackpressureError(
  nodeId,
  queue,
  backpressureScope,
) {
  const error = new Error(
    ROUTER_ERROR_MSG.outboundQueueBackpressured(nodeId, queue.maxPending),
  );
  error.code = OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE;
  error.backpressureScope = backpressureScope;
  // Surface a retry hint so callers (e.g. the coordinator handoff retry
  // scheduler) back off and yield instead of re-arming at the base cadence.
  error.retryAfterMs = TRANSPORT_DEFAULT.OUTBOUND_QUEUE_BACKPRESSURE_RETRY_AFTER_MS;
  error.deferRetry = true;
  return error;
}

const OUTBOUND_SATURATION_WARN_INTERVAL_MS = 1000;

/**
 * CL-009: warning once per rejected enqueue converts per-source containment
 * into a log storm on the already-pressured node (5.9k warns in <80s
 * witnessed against one stillborn replica). Bound emission to one warn per
 * interval per target-node queue and surface how many were suppressed.
 * Rejections themselves are unaffected.
 *
 * @param {Object} queue - Per-target outbound queue.
 * @param {number} nowMs - The router clock's reading.
 * @return {{suppressedSinceLastWarn: number}|null} Sample to log, or null
 *   when this occurrence must stay silent.
 */
function takeOutboundSaturationWarnSample(queue, nowMs) {
  if (!queue.saturationWarnState) {
    queue.saturationWarnState = {
      lastWarnAtMs: TRANSPORT_NUM.ZERO,
      suppressedCount: TRANSPORT_NUM.ZERO,
    };
  }
  const state = queue.saturationWarnState;
  if (nowMs - state.lastWarnAtMs < OUTBOUND_SATURATION_WARN_INTERVAL_MS) {
    state.suppressedCount += TRANSPORT_NUM.ONE;
    return null;
  }
  const suppressedSinceLastWarn = state.suppressedCount;
  state.lastWarnAtMs = nowMs;
  state.suppressedCount = TRANSPORT_NUM.ZERO;
  return {suppressedSinceLastWarn};
}

function countCriticalSourceReserveInFlight(queue) {
  const rawCount = queue?.inFlightCriticalSourceReserve;
  return Number.isFinite(rawCount) && rawCount > TRANSPORT_NUM.ZERO ?
    Math.floor(rawCount) :
    TRANSPORT_NUM.ZERO;
}

function resolveAggregateCriticalReserveInFlightLimit(queue) {
  const maxConcurrent =
    Number.isFinite(queue?.maxConcurrent) &&
    queue.maxConcurrent > TRANSPORT_NUM.ZERO ?
      Math.floor(queue.maxConcurrent) :
      TRANSPORT_NUM.ZERO;
  if (maxConcurrent <= TRANSPORT_NUM.ZERO) {
    return TRANSPORT_NUM.ZERO;
  }
  const reserve =
    Number.isFinite(queue?.criticalReserve) &&
    queue.criticalReserve > TRANSPORT_NUM.ZERO ?
      Math.floor(queue.criticalReserve) :
      TRANSPORT_NUM.ZERO;
  if (reserve <= TRANSPORT_NUM.ZERO) {
    return TRANSPORT_NUM.ZERO;
  }
  return Math.max(
    TRANSPORT_NUM.ONE,
    Math.min(reserve, maxConcurrent),
  );
}

function canUseAggregateCriticalReserve(queue) {
  if (queue.inFlight < queue.maxConcurrent) {
    return false;
  }
  return countCriticalSourceReserveInFlight(queue) <
    resolveAggregateCriticalReserveInFlightLimit(queue);
}

function isAggregateCriticalReserveCandidateSource(source) {
  return source !== EMPTY_DELIVERY_SOURCE &&
    source !== MESSAGE_ROUTER_LITERAL.STRING_UNKNOWN &&
    !source.startsWith(MESSAGE_ROUTER_LITERAL.STRING_TARGET_PREFIX);
}

function isAggregateCriticalReserveBlockingBacklogSource(source) {
  return source !== EMPTY_DELIVERY_SOURCE &&
    source !== MESSAGE_ROUTER_LITERAL.STRING_UNKNOWN;
}

function hasPriorInFlightSourceBacklog(queue, candidateIndex) {
  for (
    let index = TRANSPORT_NUM.ZERO;
    index < candidateIndex;
    index++
  ) {
    const item = queue.pending[index];
    if (item?.priority !== OutboundDeliveryPriority.CRITICAL) {
      continue;
    }
    const source = resolveQueuedDeliverySourceAdmissionKey(item);
    if (!isAggregateCriticalReserveBlockingBacklogSource(source)) {
      continue;
    }
    if (countInFlightBySource(queue, source) > TRANSPORT_NUM.ZERO) {
      return true;
    }
  }
  return false;
}

function isAggregateCriticalReserveReplaceableCandidate(
  queue,
  index,
  item,
  source,
) {
  const replacePendingKey = normalizeIdentifier(item?.replacePendingKey);
  return source === NODE_STATE_UPDATE_DELIVERY_SOURCE &&
    replacePendingKey.startsWith(
      NODE_STATE_UPDATE_REPLACE_PENDING_KEY_PREFIX,
    ) &&
    hasPriorInFlightSourceBacklog(queue, index);
}

function isAggregateCriticalReserveCandidateItem(
  queue,
  index,
  item,
  source,
) {
  if (!item?.replacePendingKey) {
    return true;
  }
  return isAggregateCriticalReserveReplaceableCandidate(
    queue,
    index,
    item,
    source,
  );
}

function findAggregateCriticalReserveCandidateIndex(queue) {
  if (!canUseAggregateCriticalReserve(queue)) {
    return -TRANSPORT_NUM.ONE;
  }
  const sourceCounts = new Map();
  for (const item of queue.pending) {
    if (item?.priority !== OutboundDeliveryPriority.CRITICAL) {
      continue;
    }
    const source = resolveQueuedDeliverySourceAdmissionKey(item);
    sourceCounts.set(
      source,
      (sourceCounts.get(source) || TRANSPORT_NUM.ZERO) + TRANSPORT_NUM.ONE,
    );
  }
  for (
    let index = TRANSPORT_NUM.ZERO;
    index < queue.pending.length;
    index++
  ) {
    const item = queue.pending[index];
    if (
      item?.priority !== OutboundDeliveryPriority.CRITICAL ||
      item?.criticalSourceReserve === true
    ) {
      continue;
    }
    const source = resolveQueuedDeliverySourceAdmissionKey(item);
    if (!isAggregateCriticalReserveCandidateSource(source)) {
      continue;
    }
    if (!isAggregateCriticalReserveCandidateItem(queue, index, item, source)) {
      continue;
    }
    if (sourceCounts.get(source) !== TRANSPORT_NUM.ONE) {
      continue;
    }
    if (countInFlightBySource(queue, source) > TRANSPORT_NUM.ZERO) {
      continue;
    }
    return index;
  }
  return -TRANSPORT_NUM.ONE;
}

function promoteAggregateCriticalReserveCandidate(queue) {
  const candidateIndex = findAggregateCriticalReserveCandidateIndex(queue);
  if (candidateIndex < TRANSPORT_NUM.ZERO) {
    return false;
  }
  queue.pending[candidateIndex].criticalSourceReserve = true;
  return true;
}

class OutboundDeliveryRegistryOwner {
  constructor(router) {
    this.router = router;
  }
  getOutboundQueue(nodeId) {
    if (!this.router.outboundQueues.has(nodeId)) {
      this.router.outboundQueues.set(nodeId, {
        nodeId,
        inFlight: TRANSPORT_NUM.ZERO,
        inFlightCritical: TRANSPORT_NUM.ZERO,
        inFlightBackground: TRANSPORT_NUM.ZERO,
        inFlightCriticalSourceReserve: TRANSPORT_NUM.ZERO,
        inFlightReadinessReserve: TRANSPORT_NUM.ZERO,
        inFlightBySource: new Map(),
        pending: [],
        maxConcurrent: this.router.outboundQueueMaxConcurrent,
        maxPending: this.router.outboundQueueMaxPending,
        criticalReserve: this.router.outboundQueueCriticalReserve,
        readinessReserve: this.router.outboundQueueReadinessReserve,
        readinessInflightReserve:
          this.router.outboundQueueReadinessInflightReserve,
        lastCriticalDeliverySource: EMPTY_DELIVERY_SOURCE,
        queueWaitSampleCount: TRANSPORT_NUM.ZERO,
        queueWaitTotalMs: TRANSPORT_NUM.ZERO,
        queueWaitMaxMs: TRANSPORT_NUM.ZERO,
        queueWaitHistogram: createQueueWaitHistogram(),
      });
    }
    return this.router.outboundQueues.get(nodeId);
  }
  isOutboundQueueAvailable(nodeId, deliveryPriority = null) {
    const queue = this.router.outboundQueues.get(nodeId);
    if (!queue) {
      return true;
    }
    if (queue.inFlight < queue.maxConcurrent) {
      return true;
    }
    if (deliveryPriority === OutboundDeliveryPriority.READINESS) {
      return (
        countInFlightReadinessReserve(queue) <
        resolveReadinessReserveInFlightLimit(queue)
      );
    }
    return false;
  }
  enqueue(nodeId, deliverFn, options = {}) {
    assertDeliveryOpen(options);
    const queue = this.getOutboundQueue(nodeId);
    const clock = options.deliveryLifetime?.clock || this.router.timeSource;
    const deliveryPriority = normalizeOutboundDeliveryPriority(
      options.deliveryPriority,
      options.targetAddress,
    );
    const deliverySource = resolveDeliverySource(
      options.targetAddress,
      options.message,
      options,
    );
    const deliverySourceAdmissionKey = resolveDeliverySourceAdmissionKey(
      deliverySource,
      deliveryPriority,
    );
    const replacePendingKey = resolvePendingReplacementKey(
      options.targetAddress,
      options.message,
      options,
    );
    return new Promise((resolve, reject) => {
      if (replacePendingKey) {
        const existingPendingIndex = queue.pending.findIndex(
          (item) => item?.replacePendingKey === replacePendingKey,
        );
        if (existingPendingIndex >= TRANSPORT_NUM.ZERO) {
          const existingPendingItem = queue.pending[existingPendingIndex];
          existingPendingItem.resolve(buildSupersededPendingResult());
          const replacement = createPendingItem(this, nodeId, queue, {
            deliverFn,
            resolve,
            reject,
            queuedAt: clock.now(),
            clock,
            priority: deliveryPriority,
            deliverySource,
            deliverySourceAdmissionKey,
            replacePendingKey,
          }, options);
          queue.pending[existingPendingIndex] = replacement;
          replacement.watchCancellation();
          this.process(nodeId);
          return;
        }
      }
      const pendingBackground = countPendingByPriority(
        queue,
        OutboundDeliveryPriority.BACKGROUND,
      );
      const backgroundPendingLimit = resolveBackgroundPendingLimit(queue);
      const pendingSourceAdmission = buildPendingSourceAdmission(
        queue,
        deliverySource,
        deliveryPriority,
      );
      const inFlightForSource =
        deliveryPriority === OutboundDeliveryPriority.CRITICAL ?
          countInFlightBySource(
            queue,
            pendingSourceAdmission.deliverySourceAdmissionKey,
          ) :
          TRANSPORT_NUM.ZERO;
      const inFlightSourceLimit =
        deliveryPriority === OutboundDeliveryPriority.CRITICAL ?
          resolveCriticalInFlightSourceLimit(
            queue,
            pendingSourceAdmission.deliverySourceAdmissionKey,
          ) :
          TRANSPORT_NUM.ZERO;
      let isNodeBackpressured = isOutboundNodeBackpressured(
        queue,
        deliveryPriority,
        pendingBackground,
        backgroundPendingLimit,
      );
      const isSourceBackpressured =
        pendingSourceAdmission.sourceBackpressured === true;
      let criticalSourceReserveAdmission = false;
      if (
        isNodeBackpressured &&
        !isSourceBackpressured &&
        deliveryPriority === OutboundDeliveryPriority.CRITICAL
      ) {
        const criticalPendingCeiling = resolveCriticalPendingCeiling(queue);
        while (queue.pending.length >= criticalPendingCeiling) {
          const preemptedItem = takeCriticalPendingItemForSourceReserve(
            queue,
            deliverySource,
          );
          if (!preemptedItem) {
            break;
          }
          const preemptionError = buildOutboundQueueBackpressureError(
            nodeId,
            queue,
            OUTBOUND_QUEUE_BACKPRESSURE_SCOPE.DELIVERY_SOURCE,
          );
          preemptionError.preemptedByCriticalSource = deliverySource;
          preemptedItem.reject(preemptionError);
          const preemptionWarnSample =
            takeOutboundSaturationWarnSample(
              queue, this.router.timeSource.now());
          if (preemptionWarnSample) {
            this.router.logger.warn(
              MESSAGE_ROUTER_LITERAL
                .STRING_OUTBOUND_QUEUE_SATURATED_FOR_NODE_DELIVERY,
              {
                localNodeId: this.router.nodeId,
                targetNodeId: nodeId,
                deliveryPriority: preemptedItem?.priority,
                attemptedDeliverySource: preemptedItem?.deliverySource,
                admittedDeliverySource: deliverySource,
                backpressureScope:
                  OUTBOUND_QUEUE_BACKPRESSURE_SCOPE.DELIVERY_SOURCE,
                preemptedForCriticalSourceReserve: true,
                suppressedSinceLastWarn:
                  preemptionWarnSample.suppressedSinceLastWarn,
                pending: queue.pending.length,
                pendingCritical: countPendingByPriority(
                  queue,
                  OutboundDeliveryPriority.CRITICAL,
                ),
                pendingBackground,
                backgroundPendingLimit,
                criticalReserve: queue.criticalReserve,
                maxPending: queue.maxPending,
                inFlight: queue.inFlight,
                inFlightCritical: countInFlightByPriority(
                  queue,
                  OutboundDeliveryPriority.CRITICAL,
                ),
                inFlightBackground: countInFlightByPriority(
                  queue,
                  OutboundDeliveryPriority.BACKGROUND,
                ),
                inFlightForSource,
                inFlightSourceLimit,
                pendingSourceSummary: buildPendingSourceSummary(queue),
              },
            );
          }
        }
        criticalSourceReserveAdmission =
          queue.pending.length < criticalPendingCeiling;
        isNodeBackpressured =
          queue.pending.length >= criticalPendingCeiling;
      }
      if (isNodeBackpressured || isSourceBackpressured) {
        const error = buildOutboundQueueBackpressureError(
          nodeId,
          queue,
          isSourceBackpressured ?
            OUTBOUND_QUEUE_BACKPRESSURE_SCOPE.DELIVERY_SOURCE :
            OUTBOUND_QUEUE_BACKPRESSURE_SCOPE.NODE,
        );
        const rejectionWarnSample = takeOutboundSaturationWarnSample(
          queue, this.router.timeSource.now());
        if (rejectionWarnSample) {
          this.router.logger.warn(
            MESSAGE_ROUTER_LITERAL.STRING_OUTBOUND_QUEUE_SATURATED_FOR_NODE_DELIVERY,
            {
              localNodeId: this.router.nodeId,
              targetNodeId: nodeId,
              deliveryPriority,
              attemptedDeliverySource: deliverySource,
              attemptedTargetAddress: normalizeIdentifier(options.targetAddress),
              backpressureScope: error.backpressureScope,
              suppressedSinceLastWarn:
                rejectionWarnSample.suppressedSinceLastWarn,
              pending: queue.pending.length,
              pendingCritical: countPendingByPriority(
                queue,
                OutboundDeliveryPriority.CRITICAL,
              ),
              pendingBackground,
              pendingForSource: pendingSourceAdmission.pendingForSource,
              pendingSourceLimit: pendingSourceAdmission.pendingSourceLimit,
              sourceLimitApplied: pendingSourceAdmission.applySourceLimit,
              backgroundPendingLimit,
              criticalReserve: queue.criticalReserve,
              maxPending: queue.maxPending,
              inFlight: queue.inFlight,
              inFlightCritical: countInFlightByPriority(
                queue,
                OutboundDeliveryPriority.CRITICAL,
              ),
              inFlightBackground: countInFlightByPriority(
                queue,
                OutboundDeliveryPriority.BACKGROUND,
              ),
              inFlightForSource,
              inFlightSourceLimit,
              pendingSourceSummary: buildPendingSourceSummary(queue),
            },
          );
        }
        reject(error);
        return;
      }
      const item = createPendingItem(this, nodeId, queue, {
        deliverFn,
        resolve,
        reject,
        queuedAt: clock.now(),
        clock,
        priority: deliveryPriority,
        deliverySource,
        deliverySourceAdmissionKey:
          pendingSourceAdmission.deliverySourceAdmissionKey,
        replacePendingKey,
        criticalSourceReserve: criticalSourceReserveAdmission,
      }, options);
      queue.pending.push(item);
      item.watchCancellation();
      this.process(nodeId);
    });
  }
  process(nodeId) {
    const queue = this.router.outboundQueues.get(nodeId);
    if (!queue || queue.processing) {
      return;
    }
    queue.processing = true;
    try {
      removeExpiredPending(queue);
      while (queue.pending.length > TRANSPORT_NUM.ZERO) {
        promoteAggregateCriticalReserveCandidate(queue);
        const nextItem = peekNextPendingItem(queue);
        if (!canDispatchPendingItem(queue, nextItem)) {
          return;
        }
        const item = dequeueNextPendingItem(queue);
        item.detachAbort?.();
        acquireInFlight(queue, item);
        const queueWaitMs = Math.max(
          TRANSPORT_NUM.ZERO,
          (item.clock || this.router.timeSource).now() - item.queuedAt,
        );
        recordQueueWaitDuration(queue, queueWaitMs);
        const complete = (settle, value) => {
          releaseInFlight(queue, item);
          settle(value);
          if (this.router.outboundQueues.get(nodeId) === queue) this.process(nodeId);
        };
        Promise.resolve().then(() => {
          item.assertOpen?.();
          return item.deliverFn();
        }).then(
          (result) => complete(item.resolve, {result, queueWaitMs}),
          (error) => complete(item.reject, error),
        );
      }
    } finally {
      queue.processing = false;
    }
  }
  fail(nodeId, error) {
    const queue = this.router.outboundQueues.get(nodeId);
    if (!queue) {
      return;
    }
    while (queue.pending.length > TRANSPORT_NUM.ZERO) {
      const item = queue.pending.shift();
      if (item) {
        item.reject(error);
      }
    }
  }
  failGracefully(nodeId, error) {
    const queue = this.router.outboundQueues.get(nodeId);
    if (!queue) {
      return;
    }
    const errorMessage = error?.message || ROUTER_ERROR_MSG.SHUTDOWN;
    while (queue.pending.length > TRANSPORT_NUM.ZERO) {
      const item = queue.pending.shift();
      if (item) {
        item.resolve({acknowledged: false, error: errorMessage});
      }
    }
  }
  buildPressureSummary() {
    let saturatedNodeCount = TRANSPORT_NUM.ZERO;
    let totalPending = TRANSPORT_NUM.ZERO;
    let maxPendingUtilization = TRANSPORT_NUM.ZERO;
    for (const queue of this.router.outboundQueues.values()) {
      const pending = queue.pending.length;
      const pendingBackground = countPendingByPriority(
        queue,
        OutboundDeliveryPriority.BACKGROUND,
      );
      const backgroundPendingLimit = resolveBackgroundPendingLimit(queue);
      const backpressured =
        pending >= queue.maxPending ||
        (pending > TRANSPORT_NUM.ZERO &&
          pendingBackground >= backgroundPendingLimit);
      if (backpressured) {
        saturatedNodeCount += TRANSPORT_NUM.ONE;
      }
      totalPending += pending;
      if (queue.maxPending > TRANSPORT_NUM.ZERO) {
        maxPendingUtilization = Math.max(
          maxPendingUtilization,
          pending / queue.maxPending,
        );
      }
    }
    return Object.freeze({
      backpressured: saturatedNodeCount > TRANSPORT_NUM.ZERO,
      saturatedNodeCount,
      totalPending,
      maxPendingUtilization,
      pendingNodeConnectionCount: this.router.pendingNodeConnections.size,
      reconnectBeforeDeliveryFailureCount:
        this.router.transportPressureMetrics[
          TRANSPORT_PRESSURE_SUMMARY_FIELD
            .RECONNECT_BEFORE_DELIVERY_FAILURE_COUNT
        ],
      maxObservedPendingNodeConnectionCount:
        this.router.transportPressureMetrics[
          TRANSPORT_PRESSURE_SUMMARY_FIELD
            .MAX_OBSERVED_PENDING_NODE_CONNECTION_COUNT
        ],
    });
  }
}

const INCOMING_CONNECTION_ADOPTION = Object.freeze({
  ADOPT_INCOMING: 'adopt_incoming',
  KEEP_EXISTING: 'keep_existing',
  KEEP_SELF_CONNECTION: 'keep_self_connection',
});

export {
  INCOMING_CONNECTION_ADOPTION,
  OUTBOUND_SATURATION_WARN_INTERVAL_MS,
  OutboundDeliveryRegistryOwner,
  takeOutboundSaturationWarnSample,
};
