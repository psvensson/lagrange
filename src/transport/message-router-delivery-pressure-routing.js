import {MESSAGE_ROUTER_SHARED} from './message-router-shared.js';

const {
  MESSAGE_ROUTER_LITERAL,
  QUERY_DATA_PLANE_MESSAGE_TYPE,
  QUERY_TRANSPORT_DELIVERY_STATE,
  QUERY_TRANSPORT_SELECTION,
  ROUTER_ERROR_MSG,
  ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
  TRANSPORT_METRIC,
  TRANSPORT_METRIC_TRIGGER,
  TRANSPORT_NUM,
  TRANSPORT_TYPEOF,
  buildQueryTransportSemanticOutcome,
} = MESSAGE_ROUTER_SHARED;

const MESSAGE_ROUTER_DELIVERY_PRESSURE_ROUTING_METHODS = Object.freeze({
  setServiceNodeResolver(resolver) {
    this.resolveServiceNode = resolver;
  },

  setNodeAddressResolver(resolver) {
    this.resolveNodeAddress = resolver || null;
  },

  setQueryMessageGroupServiceResolver(resolver) {
    this.resolveQueryMessageGroupService = resolver || null;
  },

  getQueryDataPlaneTransportReadiness() {
    return this.resolveQueryDataPlaneTransportSelection();
  },

  isQueryDataPlaneMessage(message) {
    return Boolean(
      message &&
      typeof message === TRANSPORT_TYPEOF.OBJECT &&
      message.type === QUERY_DATA_PLANE_MESSAGE_TYPE,
    );
  },

  resolveQueryDataPlaneTransportSelection() {
    let selectionResult;
    if (
      typeof this.resolveQueryMessageGroupService !== TRANSPORT_TYPEOF.FUNCTION
    ) {
      selectionResult = this.buildQueryTransportSelectionResult(
        QUERY_TRANSPORT_SELECTION.UNAVAILABLE,
      );
    } else {
      const selection = this.resolveQueryMessageGroupService();
      if (
        selection &&
        typeof selection.sendMessage === TRANSPORT_TYPEOF.FUNCTION
      ) {
        selectionResult = this.buildQueryTransportSelectionResult(
          QUERY_TRANSPORT_SELECTION.DIRECT_SERVICE,
          {
            service: selection,
          },
        );
      } else if (
        selection?.service &&
        typeof selection.service.sendMessage === TRANSPORT_TYPEOF.FUNCTION
      ) {
        selectionResult = this.buildQueryTransportSelectionResult(
          QUERY_TRANSPORT_SELECTION.SELECTION_SERVICE,
          selection,
        );
      } else {
        selectionResult = this.buildQueryTransportSelectionResult(
          QUERY_TRANSPORT_SELECTION.UNAVAILABLE,
          selection,
        );
      }
    }
    return selectionResult;
  },

  buildQueryTransportSelectionResult(kind, selection = {}) {
    if (kind === QUERY_TRANSPORT_SELECTION.DIRECT_SERVICE) {
      return buildQueryTransportSemanticOutcome({
        service: selection.service,
        retryAfterMs: TRANSPORT_NUM.ZERO,
      });
    } else if (kind === QUERY_TRANSPORT_SELECTION.SELECTION_SERVICE) {
      return buildQueryTransportSemanticOutcome({
        service: selection.service,
        retryAfterMs:
          Number.isFinite(selection.retryAfterMs) &&
          selection.retryAfterMs > TRANSPORT_NUM.ZERO ?
            Math.floor(selection.retryAfterMs) :
            TRANSPORT_NUM.ZERO,
      });
    }
    return buildQueryTransportSemanticOutcome(
      {
        reason:
          typeof selection?.reason === TRANSPORT_TYPEOF.STRING &&
          selection.reason.length > TRANSPORT_NUM.ZERO ?
            selection.reason :
            ROUTER_ERROR_MSG.QUERY_MESSAGE_GROUP_TRANSPORT_REQUIRED,
        errorCode: ROUTER_QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
        retryAfterMs:
          Number.isFinite(selection?.retryAfterMs) &&
          selection.retryAfterMs > TRANSPORT_NUM.ZERO ?
            Math.floor(selection.retryAfterMs) :
            this.reconnectIntervalMs,
        deferRetry: true,
      },
      {
        defaultRetryAfterMs: this.reconnectIntervalMs,
      },
    );
  },

  buildDeferredQueryTransportOutcome(selection = {}) {
    const retryAfterMs =
      Number.isFinite(selection.retryAfterMs) &&
      selection.retryAfterMs > TRANSPORT_NUM.ZERO ?
        Math.floor(selection.retryAfterMs) :
        this.reconnectIntervalMs;
    return {
      acknowledged: false,
      error:
        selection.reason ||
        ROUTER_ERROR_MSG.QUERY_MESSAGE_GROUP_TRANSPORT_REQUIRED,
      errorCode: MESSAGE_ROUTER_LITERAL.STRING_ROUTER_QUERY_TRANSPORT_NOT_READY,
      deferRetry: true,
      retryAfterMs,
    };
  },

  buildCanonicalDeferredQueryTransportOutcome(
    messageId,
    correlationId,
    failure,
  ) {
    return this.buildDeferredDeliveryFailure(
      messageId,
      correlationId,
      failure?.error ||
        failure?.message ||
        ROUTER_ERROR_MSG.QUERY_MESSAGE_GROUP_TRANSPORT_REQUIRED,
      {
        errorCode:
          typeof failure?.errorCode === TRANSPORT_TYPEOF.STRING &&
          failure.errorCode.length > TRANSPORT_NUM.ZERO ?
            failure.errorCode :
            typeof failure?.code === TRANSPORT_TYPEOF.STRING &&
                failure.code.length > TRANSPORT_NUM.ZERO ?
              failure.code :
              null,
        retryAfterMs: Number.isFinite(failure?.retryAfterMs) ?
          failure.retryAfterMs :
          this.reconnectIntervalMs,
      },
    );
  },

  buildQueryTransportFailureError(failure, _targetNodeId) {
    const normalizedMessage =
      typeof failure?.error === TRANSPORT_TYPEOF.STRING &&
      failure.error.length > TRANSPORT_NUM.ZERO ?
        failure.error :
        typeof failure?.message === TRANSPORT_TYPEOF.STRING &&
            failure.message.length > TRANSPORT_NUM.ZERO ?
          failure.message :
          ROUTER_ERROR_MSG.QUERY_MESSAGE_GROUP_TRANSPORT_REQUIRED;
    const error =
      failure instanceof Error ? failure : new Error(normalizedMessage);
    error.message = normalizedMessage;
    if (
      typeof failure?.errorCode === TRANSPORT_TYPEOF.STRING &&
      failure.errorCode.length > TRANSPORT_NUM.ZERO
    ) {
      error.code = failure.errorCode;
    } else if (
      typeof failure?.code === TRANSPORT_TYPEOF.STRING &&
      failure.code.length > TRANSPORT_NUM.ZERO
    ) {
      error.code = failure.code;
    }
    if (failure?.deferRetry === true) {
      error.deferRetry = true;
    }
    if (Number.isFinite(failure?.retryAfterMs)) {
      error.retryAfterMs = Math.max(
        TRANSPORT_NUM.ZERO,
        Math.floor(failure.retryAfterMs),
      );
    }
    if (failure?.recoverableBeforeSend === true) {
      error.recoverableBeforeSend = true;
    }
    return error;
  },

  resolveQueryTransportDeliveryState(failure) {
    if (failure?.acknowledged === true) {
      return QUERY_TRANSPORT_DELIVERY_STATE.SUCCESS;
    }
    if (failure?.deferRetry === true) {
      return QUERY_TRANSPORT_DELIVERY_STATE.DEFER_RETRY;
    }
    return QUERY_TRANSPORT_DELIVERY_STATE.HARD_FAILURE;
  },

  async normalizeQueryTransportFailure({
    failure,
    targetNodeId,
    targetAddress,
    messageId,
    message,
    correlationId,
  }) {
    const deliveryState = this.resolveQueryTransportDeliveryState(failure);
    if (deliveryState === QUERY_TRANSPORT_DELIVERY_STATE.DEFER_RETRY) {
      return this.buildCanonicalDeferredQueryTransportOutcome(
        messageId,
        correlationId,
        failure,
      );
    }
    const transportError = this.buildQueryTransportFailureError(
      failure,
      targetNodeId,
    );
    const recoverableFailure = await this.resolveRecoverableDeliveryError({
      error: transportError,
      targetNodeId,
      targetAddress,
      messageId,
      payload: message,
      correlationId,
    });
    if (recoverableFailure) {
      return recoverableFailure;
    }
    if (
      deliveryState === QUERY_TRANSPORT_DELIVERY_STATE.HARD_FAILURE &&
      failure instanceof Error
    ) {
      throw failure;
    }
    return failure;
  },

  buildQueryTransportSendOptions(options = {}) {
    const transportDeliveryOptions = {};
    if (
      Number.isFinite(options?.timeoutMs) &&
      options.timeoutMs > TRANSPORT_NUM.ZERO
    ) {
      transportDeliveryOptions.timeoutMs = Math.floor(options.timeoutMs);
    }
    if (
      typeof options?.deliveryPriority === TRANSPORT_TYPEOF.STRING &&
      options.deliveryPriority.length > TRANSPORT_NUM.ZERO
    ) {
      transportDeliveryOptions.deliveryPriority = options.deliveryPriority;
    }
    if (
      typeof options?.deliverySource === TRANSPORT_TYPEOF.STRING &&
      options.deliverySource.length > TRANSPORT_NUM.ZERO
    ) {
      transportDeliveryOptions.deliverySource = options.deliverySource;
    }
    if (Object.keys(transportDeliveryOptions).length === TRANSPORT_NUM.ZERO) {
      return {};
    }
    return {
      transportDeliveryOptions,
    };
  },

  async resolveQueryTransportDeliveryOutcome(
    targetAddress,
    message,
    targetNodeId,
    messageId,
    correlationId,
    queryTransportSelection,
    options = {},
  ) {
    const queryTransport = queryTransportSelection.service;
    if (!queryTransport) {
      return this.buildDeferredQueryTransportOutcome(queryTransportSelection);
    }
    try {
      const queryResult = await queryTransport.sendMessage(
        targetAddress,
        message,
        this.buildQueryTransportSendOptions(options),
      );
      return await this.normalizeQueryTransportFailure({
        failure: queryResult,
        targetNodeId,
        targetAddress,
        messageId,
        message,
        correlationId,
      });
    } catch (error) {
      return this.normalizeQueryTransportFailure({
        failure: error,
        targetNodeId,
        targetAddress,
        messageId,
        message,
        correlationId,
      });
    }
  },

  buildDeliveryOutcomeResult(result) {
    return {
      result,
      queueWaitMs: TRANSPORT_NUM.ZERO,
    };
  },

  async resolveDeliveryOutcome(
    targetAddress,
    message,
    messageId,
    targetNodeId,
    correlationId,
    options,
  ) {
    if (this.isQueryDataPlaneMessage(message)) {
      const queryTransportSelection =
        this.resolveQueryDataPlaneTransportSelection();
      if (
        targetNodeId === this.nodeId &&
        !queryTransportSelection?.service &&
        this.isRegistered(targetAddress)
      ) {
        return this.deliverLocal(
          targetAddress,
          messageId,
          message,
          correlationId,
        );
      }
      const queryResult = await this.resolveQueryTransportDeliveryOutcome(
        targetAddress,
        message,
        targetNodeId,
        messageId,
        correlationId,
        queryTransportSelection,
        options,
      );
      return this.buildDeliveryOutcomeResult(queryResult);
    }
    if (targetNodeId === this.nodeId) {
      return this.deliverLocal(
        targetAddress,
        messageId,
        message,
        correlationId,
      );
    }
    return this.deliverRemote(
      targetAddress,
      messageId,
      message,
      targetNodeId,
      correlationId,
      options,
    );
  },

  getOutboundQueue(nodeId) {
    return this.outboundDeliveryRegistryOwner.getOutboundQueue(nodeId);
  },

  isOutboundQueueAvailable(nodeId, deliveryPriority = null) {
    return this.outboundDeliveryRegistryOwner.isOutboundQueueAvailable(
      nodeId,
      deliveryPriority,
    );
  },

  enqueueOutbound(nodeId, deliverFn, options = {}) {
    return this.outboundDeliveryRegistryOwner.enqueue(
      nodeId,
      deliverFn,
      options,
    );
  },

  processOutboundQueue(nodeId) {
    this.outboundDeliveryRegistryOwner.process(nodeId);
  },

  failOutboundQueue(nodeId, error) {
    this.outboundDeliveryRegistryOwner.fail(nodeId, error);
  },

  failOutboundQueueGracefully(nodeId, error) {
    this.outboundDeliveryRegistryOwner.failGracefully(nodeId, error);
  },

  failPendingMessagesForNode(nodeId, error) {
    for (const [messageId, pending] of this.pendingMessages) {
      if (pending.targetNodeId === nodeId) {
        clearTimeout(pending.timeout);
        this.pendingMessages.delete(messageId);
        pending.reject(error);
      }
    }
  },

  getDeliverMetricTrigger(targetNodeId, durationMs, queueDepth, acknowledged) {
    if (!acknowledged) {
      const faultSampleCount =
        (this.deliverMetricFaultSampleByTarget.get(targetNodeId) ||
          TRANSPORT_NUM.ZERO) + TRANSPORT_NUM.ONE;
      this.deliverMetricFaultSampleByTarget.set(targetNodeId, faultSampleCount);
      if (
        faultSampleCount === TRANSPORT_NUM.ONE ||
        faultSampleCount % TRANSPORT_METRIC.DELIVER_FAULT_SAMPLE_EVERY ===
          TRANSPORT_NUM.ZERO
      ) {
        return TRANSPORT_METRIC_TRIGGER.FAULT;
      }
      return null;
    }
    this.deliverMetricFaultSampleByTarget.set(targetNodeId, TRANSPORT_NUM.ZERO);
    if (durationMs >= TRANSPORT_METRIC.DELIVER_SLOW_THRESHOLD_MS) {
      return TRANSPORT_METRIC_TRIGGER.SLOW;
    }
    const previousQueueDepth =
      this.deliverMetricQueueDepthByTarget.get(targetNodeId) ||
      TRANSPORT_NUM.ZERO;
    if (queueDepth >= TRANSPORT_METRIC.DELIVER_QUEUE_BACKPRESSURE_THRESHOLD) {
      const queueDepthDelta = Math.abs(queueDepth - previousQueueDepth);
      if (
        previousQueueDepth <
          TRANSPORT_METRIC.DELIVER_QUEUE_BACKPRESSURE_THRESHOLD ||
        queueDepthDelta >= TRANSPORT_METRIC.DELIVER_QUEUE_CHANGE_THRESHOLD
      ) {
        return TRANSPORT_METRIC_TRIGGER.BACKPRESSURE;
      }
    } else if (
      previousQueueDepth >=
      TRANSPORT_METRIC.DELIVER_QUEUE_BACKPRESSURE_THRESHOLD
    ) {
      return TRANSPORT_METRIC_TRIGGER.QUEUE_DRAINED;
    }
    const sampleCount =
      (this.deliverMetricSampleByTarget.get(targetNodeId) ||
        TRANSPORT_NUM.ZERO) + TRANSPORT_NUM.ONE;
    this.deliverMetricSampleByTarget.set(targetNodeId, sampleCount);
    if (sampleCount >= TRANSPORT_METRIC.DELIVER_SUCCESS_SAMPLE_EVERY) {
      this.deliverMetricSampleByTarget.set(targetNodeId, TRANSPORT_NUM.ZERO);
      return TRANSPORT_METRIC_TRIGGER.SAMPLE;
    }
    return null;
  },
});

export {MESSAGE_ROUTER_DELIVERY_PRESSURE_ROUTING_METHODS};
