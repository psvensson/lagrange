import {
  CONTROL_PLANE_MUTATION_OUTCOME,
  CONTROL_PLANE_MUTATION_QUEUE_STATE,
  CONTROL_PLANE_READ_OUTCOME,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL,
  GATEWAY_LOG_MSG,
  METRICS_LOG_TAG,
  getControlPlaneErrorCode,
  getControlPlaneFailureSummary,
  getControlPlaneRetryAfterMs,
  stableSerialize,
} from './control-plane-system-table-gateway-shared.js';

const LOCAL_STR_MAXOBSERVEDMUTATIONQUEUEWAITMS = 'maxObservedMutationQueueWaitMs';
const LOCAL_STR_MAXOBSERVEDTRANSPORTPENDINGNODECONNECTIO = 'maxObservedTransportPendingNodeConnectionCount';
const LOCAL_STR_MUTATIONFAILUREREASONCOUNTS = 'mutationFailureReasonCounts';
const LOCAL_STR_AUTHORITATIVEROWSOURCEUNAVAILABLECOUNT = 'authoritativeRowSourceUnavailableCount';
const LOCAL_STR_DISTRIBUTEDPARTICIPANTFAILURECOUNT = 'distributedParticipantFailureCount';
const LOCAL_STR_RECONNECTDELIVERYFAILURECOUNT = 'reconnectDeliveryFailureCount';

const controlPlaneSystemTableGatewayTelemetryMethods = {
  incrementGatewayOutcomeMetric(bucketName, outcome) {
    const bucket = this.gatewayMetrics?.[bucketName];
    if (!bucket || typeof bucket !== 'object') {
      return;
    }
    const normalizedOutcome =
      typeof outcome === 'string' && outcome.length > 0 ?
        outcome :
        'unknown';
    bucket[normalizedOutcome] = Number.isFinite(bucket[normalizedOutcome]) ?
      bucket[normalizedOutcome] + 1 :
      1;
  },

  /**
   * @param {string} tag
   * @param {Object} data
   * @private
   */
  emitGatewayMetric(tag, data) {
    if (typeof this.logger?.info !== 'function') {
      return;
    }
    try {
      this.logger.info(tag, data);
    } catch (_error) {
      // Metrics logging must not change gateway behavior.
    }
  },

  /**
   * @param {string} message
   * @param {Object} data
   * @private
   */
  emitGatewayWarning(message, data) {
    if (typeof this.logger?.warn !== 'function') {
      return;
    }
    try {
      this.logger.warn(message, data);
    } catch (_error) {
      // Diagnostic logging must not change gateway behavior.
    }
  },

  /**
   * @private
   */
  emitGatewayRetentionMetric() {
    const data = this.buildRetentionMetricData();
    const signature = stableSerialize(data);
    if (signature === this.lastRetentionMetricSignature) {
      return;
    }
    this.lastRetentionMetricSignature = signature;
    this.emitGatewayMetric(
      METRICS_LOG_TAG.CONTROL_PLANE_GATEWAY_RETENTION,
      data,
    );
  },

  /**
   * @param {number} startedAtMs
   * @return {number}
   * @private
   */
  resolveLatencyMs(startedAtMs) {
    if (!Number.isFinite(startedAtMs)) {
      return 0;
    }
    return Math.max(0, Math.floor(this.now() - startedAtMs));
  },

  /**
   * @return {Object|null}
   * @private
   */
  resolveTransportPressureSummary() {
    const messageRouter =
      typeof this.resolveMessageRouter === 'function' ?
        this.resolveMessageRouter() :
        this.messageRouter;
    if (
      !messageRouter ||
      typeof messageRouter.getOutboundPressureSummary !== 'function'
    ) {
      return null;
    }
    try {
      const summary = messageRouter.getOutboundPressureSummary();
      return summary && typeof summary === 'object' ? summary : null;
    } catch (_error) {
      return null;
    }
  },

  /**
   * @param {Object} context
   * @param {Object} result
   * @private
   */
  recordReadTelemetry(context = {}, result = {}) {
    const latencyMs = this.resolveLatencyMs(context.startedAtMs);
    const outcome =
      typeof result?.outcome === 'string' ?
        result.outcome :
        CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY;
    this.incrementGatewayOutcomeMetric(
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.READOUTCOMECOUNTS,
      outcome,
    );
    this.recordGatewayLatency(
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MAXOBSERVEDREADLATENCYMS,
      latencyMs,
    );
    this.emitGatewayMetric(METRICS_LOG_TAG.CONTROL_PLANE_GATEWAY_READ, {
      nodeId: this.nodeId,
      owner: context.owner || null,
      tableName: context.tableName || null,
      outcome,
      strategy: result?.strategyUsed || context.strategy || null,
      readProfile: context.readProfile || null,
      workloadClass: context.workloadClass || null,
      workClass: context.workClass || null,
      coalescingKey: context.coalescingKey || null,
      latencyMs,
      success: result?.success === true,
      rowCount: Number.isFinite(result?.rowCount) ?
        result.rowCount :
        Array.isArray(result?.rows) ?
          result.rows.length :
          0,
    });
    if (
      outcome === CONTROL_PLANE_READ_OUTCOME.DEFERRED ||
      outcome === CONTROL_PLANE_READ_OUTCOME.REJECTED
    ) {
      this.emitGatewayWarning(
        outcome === CONTROL_PLANE_READ_OUTCOME.DEFERRED ?
          GATEWAY_LOG_MSG.READ_DEFERRED :
          GATEWAY_LOG_MSG.READ_REJECTED,
        {
          nodeId: this.nodeId,
          owner: context.owner || null,
          tableName: context.tableName || null,
          strategy: result?.strategyUsed || context.strategy || null,
          workloadClass: context.workloadClass || null,
          workClass: context.workClass || null,
          coalescingKey: context.coalescingKey || null,
          pressureAction: result?.pressureAction || null,
          pressureReason: result?.pressureReason || null,
          retryAfterMs: Number.isFinite(result?.retryAfterMs) ?
            result.retryAfterMs :
            null,
          error: result?.error || null,
        },
      );
    }
  },

  /**
   * @param {Object} context
   * @param {Object} result
   * @private
   */
  recordMutationTelemetry(context = {}, result = {}) {
    const latencyMs = this.resolveLatencyMs(context.startedAtMs);
    const outcome =
      typeof result?.outcome === 'string' ?
        result.outcome :
        CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY;
    const retainedRequests = this.buildRetainedRequestsSnapshot();
    const failureSummary = getControlPlaneFailureSummary(result);
    const retryAfterMs = getControlPlaneRetryAfterMs(result);
    const errorCode = getControlPlaneErrorCode(result) || null;
    const transportPressureSummary = this.resolveTransportPressureSummary();
    const queueWaitMs = Number.isFinite(result?.queueWaitMs) ?
      Math.max(0, Math.floor(result.queueWaitMs)) :
      0;
    const transportPendingNodeConnectionCount = Number.isFinite(
      transportPressureSummary?.pendingNodeConnectionCount,
    ) ?
      Math.max(
        0,
        Math.floor(transportPressureSummary.pendingNodeConnectionCount),
      ) :
      0;
    const transportReconnectBeforeDeliveryFailureCount = Number.isFinite(
      transportPressureSummary?.reconnectBeforeDeliveryFailureCount,
    ) ?
      Math.max(
        0,
        Math.floor(
          transportPressureSummary.reconnectBeforeDeliveryFailureCount,
        ),
      ) :
      0;
    this.incrementGatewayOutcomeMetric(
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATIONOUTCOMECOUNTS,
      outcome,
    );
    this.recordGatewayLatency(
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MAXOBSERVEDMUTATIONLATENCYMS,
      latencyMs,
    );
    this.recordGatewayLatency(LOCAL_STR_MAXOBSERVEDMUTATIONQUEUEWAITMS, queueWaitMs);
    this.recordGatewayLatency(
      LOCAL_STR_MAXOBSERVEDTRANSPORTPENDINGNODECONNECTIO,
      transportPendingNodeConnectionCount,
    );
    if (result?.success === false) {
      this.incrementGatewayOutcomeMetric(
        LOCAL_STR_MUTATIONFAILUREREASONCOUNTS,
        failureSummary.primaryReason,
      );
      this.addGatewayMetric(
        LOCAL_STR_AUTHORITATIVEROWSOURCEUNAVAILABLECOUNT,
        failureSummary.authoritativeRowSourceUnavailableCount,
      );
      this.addGatewayMetric(
        LOCAL_STR_DISTRIBUTEDPARTICIPANTFAILURECOUNT,
        failureSummary.distributedParticipantFailureCount,
      );
      this.addGatewayMetric(
        LOCAL_STR_RECONNECTDELIVERYFAILURECOUNT,
        failureSummary.reconnectDeliveryFailureCount,
      );
    }
    this.emitGatewayMetric(METRICS_LOG_TAG.CONTROL_PLANE_GATEWAY_MUTATION, {
      nodeId: this.nodeId,
      owner: context.owner || null,
      tableName: context.tableName || null,
      operation: context.operation || null,
      outcome,
      workClass: context.workClass || null,
      coalescingKey: context.coalescingKey || null,
      mergePolicy: context.mergePolicy || null,
      latencyMs,
      queueState:
        typeof result?.queueState === 'string' ?
          result.queueState :
          CONTROL_PLANE_MUTATION_QUEUE_STATE.DIRECT,
      queueWaitMs,
      inFlightMutationCount: retainedRequests.inFlightMutations,
      pendingReplaceMutationCount: retainedRequests.pendingReplaceMutations,
      transportPendingNodeConnectionCount,
      transportReconnectBeforeDeliveryFailureCount,
      canonicalFailureReason:
        result?.success === false ? failureSummary.primaryReason : null,
      authoritativeRowSourceUnavailableCount:
        failureSummary.authoritativeRowSourceUnavailableCount,
      distributedParticipantFailureCount:
        failureSummary.distributedParticipantFailureCount,
      reconnectDeliveryFailureCount:
        failureSummary.reconnectDeliveryFailureCount,
      linkedFailureCount: failureSummary.linkedFailureCount,
      retryAfterMs: retryAfterMs > 0 ? retryAfterMs : null,
      errorCode,
      success: result?.success === true,
    });
    if (
      outcome === CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED ||
      outcome === CONTROL_PLANE_MUTATION_OUTCOME.REJECTED
    ) {
      this.emitGatewayWarning(
        outcome === CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED ?
          GATEWAY_LOG_MSG.MUTATION_DEFERRED :
          GATEWAY_LOG_MSG.MUTATION_REJECTED,
        {
          nodeId: this.nodeId,
          owner: context.owner || null,
          tableName: context.tableName || null,
          operation: context.operation || null,
          workClass: context.workClass || null,
          coalescingKey: context.coalescingKey || null,
          mergePolicy: context.mergePolicy || null,
          pressureAction: result?.pressureAction || null,
          pressureReason: result?.pressureReason || null,
          retryAfterMs: retryAfterMs > 0 ? retryAfterMs : null,
          errorCode,
          canonicalFailureReason: failureSummary.primaryReason,
          queueWaitMs,
          transportPendingNodeConnectionCount,
          transportReconnectBeforeDeliveryFailureCount,
          error: result?.error || null,
        },
      );
    }
  },
};

function assignControlPlaneSystemTableGatewayTelemetry(targetClass) {
  Object.assign(
    targetClass.prototype,
    controlPlaneSystemTableGatewayTelemetryMethods,
  );
}

export {assignControlPlaneSystemTableGatewayTelemetry};
