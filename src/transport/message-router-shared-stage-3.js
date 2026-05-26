import {
  ROUTER_ERROR_MSG,
  TRANSPORT_NUM,
} from '../constants/transport.js';
import {EMPTY_DELIVERY_SOURCE, MESSAGE_ROUTER_LITERAL, OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE, OUTBOUND_QUEUE_BACKPRESSURE_SCOPE, OutboundDeliveryPriority, TRANSPORT_PRESSURE_SUMMARY_FIELD, createQueueWaitHistogram, normalizeIdentifier, recordQueueWaitDuration, resolvePendingReplacementKey} from './message-router-shared-stage-1.js';
import {adjustInFlightPriorityCount, adjustInFlightSourceCount, buildPendingSourceAdmission, buildPendingSourceSummary, buildSupersededPendingResult, canDispatchPendingItem, countInFlightByPriority, countPendingByPriority, dequeueNextPendingItem, normalizeOutboundDeliveryPriority, normalizeQueuedDeliverySource, peekNextPendingItem, resolveBackgroundPendingLimit, resolveDeliverySource} from './message-router-shared-stage-2.js';

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
        inFlightBySource: new Map(),
        pending: [],
        maxConcurrent: this.router.outboundQueueMaxConcurrent,
        maxPending: this.router.outboundQueueMaxPending,
        criticalReserve: this.router.outboundQueueCriticalReserve,
        lastCriticalDeliverySource: EMPTY_DELIVERY_SOURCE,
        queueWaitSampleCount: TRANSPORT_NUM.ZERO,
        queueWaitTotalMs: TRANSPORT_NUM.ZERO,
        queueWaitMaxMs: TRANSPORT_NUM.ZERO,
        queueWaitHistogram: createQueueWaitHistogram(),
      });
    }
    return this.router.outboundQueues.get(nodeId);
  }
  isOutboundQueueAvailable(nodeId) {
    const queue = this.router.outboundQueues.get(nodeId);
    if (!queue) {
      return true;
    }
    return queue.inFlight < queue.maxConcurrent;
  }
  enqueue(nodeId, deliverFn, options = {}) {
    const queue = this.getOutboundQueue(nodeId);
    const deliveryPriority = normalizeOutboundDeliveryPriority(
      options.deliveryPriority,
      options.targetAddress,
    );
    const deliverySource = resolveDeliverySource(
      options.targetAddress,
      options.message,
      options,
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
          existingPendingItem.resolve(
            buildSupersededPendingResult(existingPendingItem),
          );
          queue.pending[existingPendingIndex] = {
            deliverFn,
            resolve,
            reject,
            queuedAt: Date.now(),
            priority: deliveryPriority,
            deliverySource,
            replacePendingKey,
          };
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
      const isNodeBackpressured =
        deliveryPriority === OutboundDeliveryPriority.CRITICAL ?
          queue.pending.length >= queue.maxPending :
          pendingBackground >= backgroundPendingLimit;
      const isSourceBackpressured =
        pendingSourceAdmission.sourceBackpressured === true;
      if (isNodeBackpressured || isSourceBackpressured) {
        const error = new Error(
          ROUTER_ERROR_MSG.outboundQueueBackpressured(nodeId, queue.maxPending),
        );
        error.code = OUTBOUND_QUEUE_BACKPRESSURE_ERROR_CODE;
        error.backpressureScope = isSourceBackpressured ?
          OUTBOUND_QUEUE_BACKPRESSURE_SCOPE.DELIVERY_SOURCE :
          OUTBOUND_QUEUE_BACKPRESSURE_SCOPE.NODE;
        this.router.logger.warn(
          MESSAGE_ROUTER_LITERAL.STRING_OUTBOUND_QUEUE_SATURATED_FOR_NODE_DELIVERY,
          {
            localNodeId: this.router.nodeId,
            targetNodeId: nodeId,
            deliveryPriority,
            attemptedDeliverySource: deliverySource,
            attemptedTargetAddress: normalizeIdentifier(options.targetAddress),
            backpressureScope: error.backpressureScope,
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
            pendingSourceSummary: buildPendingSourceSummary(queue),
          },
        );
        reject(error);
        return;
      }
      queue.pending.push({
        deliverFn,
        resolve,
        reject,
        queuedAt: Date.now(),
        priority: deliveryPriority,
        deliverySource,
        replacePendingKey,
      });
      this.process(nodeId);
    });
  }
  process(nodeId) {
    const queue = this.router.outboundQueues.get(nodeId);
    if (!queue) {
      return;
    }
    while (queue.pending.length > TRANSPORT_NUM.ZERO) {
      const nextItem = peekNextPendingItem(queue);
      if (!canDispatchPendingItem(queue, nextItem)) {
        return;
      }
      const item = dequeueNextPendingItem(queue);
      if (item?.priority === OutboundDeliveryPriority.CRITICAL) {
        queue.lastCriticalDeliverySource = normalizeQueuedDeliverySource(
          item?.deliverySource,
        );
      }
      queue.inFlight += TRANSPORT_NUM.ONE;
      adjustInFlightPriorityCount(queue, item?.priority, TRANSPORT_NUM.ONE);
      if (item?.priority === OutboundDeliveryPriority.CRITICAL) {
        adjustInFlightSourceCount(
          queue,
          item?.deliverySource,
          TRANSPORT_NUM.ONE,
        );
      }
      const queueWaitMs = Math.max(
        TRANSPORT_NUM.ZERO,
        Date.now() - (item?.queuedAt || Date.now()),
      );
      recordQueueWaitDuration(queue, queueWaitMs);
      Promise.resolve()
        .then(() => item.deliverFn())
        .then((result) => {
          queue.inFlight -= TRANSPORT_NUM.ONE;
          adjustInFlightPriorityCount(
            queue,
            item?.priority,
            -TRANSPORT_NUM.ONE,
          );
          if (item?.priority === OutboundDeliveryPriority.CRITICAL) {
            adjustInFlightSourceCount(
              queue,
              item?.deliverySource,
              -TRANSPORT_NUM.ONE,
            );
          }
          item.resolve({
            result,
            queueWaitMs,
          });
          this.process(nodeId);
        })
        .catch((error) => {
          queue.inFlight -= TRANSPORT_NUM.ONE;
          adjustInFlightPriorityCount(
            queue,
            item?.priority,
            -TRANSPORT_NUM.ONE,
          );
          if (item?.priority === OutboundDeliveryPriority.CRITICAL) {
            adjustInFlightSourceCount(
              queue,
              item?.deliverySource,
              -TRANSPORT_NUM.ONE,
            );
          }
          item.reject(error);
          this.process(nodeId);
        });
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
        item.resolve({
          acknowledged: false,
          error: errorMessage,
          shutdown: true,
        });
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
  OutboundDeliveryRegistryOwner,
};
