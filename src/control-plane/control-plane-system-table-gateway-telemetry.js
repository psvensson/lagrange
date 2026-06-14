import {
  CONTROL_PLANE_MUTATION_OUTCOME,
  CONTROL_PLANE_MUTATION_QUEUE_STATE,
  CONTROL_PLANE_READ_OUTCOME,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL,
  GATEWAY_LOG_MSG,
  METRICS_LOG_TAG,
  NUM,
  TYPEOF,
  getControlPlaneErrorCode,
  getControlPlaneFailureSummary,
  getControlPlaneRetryAfterMs,
  stableSerialize,
} from './control-plane-system-table-gateway-shared.js';

const LOCAL_STR_1NXSQ = 'maxObservedMutationQueueWaitMs';
const LOCAL_STR_SLN22 = 'maxObservedTransportPendingNodeConnectionCount';
const LOCAL_STR_1UYEC = 'mutationFailureReasonCounts';
const LOCAL_STR_1OW12 = 'authoritativeRowSourceUnavailableCount';
const LOCAL_STR_1O67A = 'distributedParticipantFailureCount';
const LOCAL_STR_1K86M = 'reconnectDeliveryFailureCount';

const controlPlaneSystemTableGatewayTelemetryMethods = {
  incrementGatewayOutcomeMetric(bucketName, outcome) {
    const bucket = this.gatewayMetrics?.[bucketName];
    if (!bucket || typeof bucket !== TYPEOF.OBJECT) {
      return;
    }
    const normalizedOutcome =
      typeof outcome === TYPEOF.STRING && outcome.length > NUM.ZERO ?
        outcome :
        'unknown';
    bucket[normalizedOutcome] = Number.isFinite(bucket[normalizedOutcome]) ?
      bucket[normalizedOutcome] + NUM.ONE :
      NUM.ONE;
  },

  /**
   * @param {string} tag
   * @param {Object} data
   * @private
   */
  emitGatewayMetric(tag, data) {
    if (typeof this.logger?.info !== TYPEOF.FUNCTION) {
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
    if (typeof this.logger?.warn !== TYPEOF.FUNCTION) {
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
      return NUM.ZERO;
    }
    return Math.max(NUM.ZERO, Math.floor(this.now() - startedAtMs));
  },

  /**
   * @return {Object|null}
   * @private
   */
  resolveTransportPressureSummary() {
    const messageRouter =
      typeof this.resolveMessageRouter === TYPEOF.FUNCTION ?
        this.resolveMessageRouter() :
        this.messageRouter;
    if (
      !messageRouter ||
      typeof messageRouter.getOutboundPressureSummary !== TYPEOF.FUNCTION
    ) {
      return null;
    }
    try {
      const summary = messageRouter.getOutboundPressureSummary();
      return summary && typeof summary === TYPEOF.OBJECT ? summary : null;
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
      typeof result?.outcome === TYPEOF.STRING ?
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
          NUM.ZERO,
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
      typeof result?.outcome === TYPEOF.STRING ?
        result.outcome :
        CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY;
    const retainedRequests = this.buildRetainedRequestsSnapshot();
    const failureSummary = getControlPlaneFailureSummary(result);
    const retryAfterMs = getControlPlaneRetryAfterMs(result);
    const errorCode = getControlPlaneErrorCode(result) || null;
    const transportPressureSummary = this.resolveTransportPressureSummary();
    const queueWaitMs = Number.isFinite(result?.queueWaitMs) ?
      Math.max(NUM.ZERO, Math.floor(result.queueWaitMs)) :
      NUM.ZERO;
    const transportPendingNodeConnectionCount = Number.isFinite(
      transportPressureSummary?.pendingNodeConnectionCount,
    ) ?
      Math.max(
        NUM.ZERO,
        Math.floor(transportPressureSummary.pendingNodeConnectionCount),
      ) :
      NUM.ZERO;
    const transportReconnectBeforeDeliveryFailureCount = Number.isFinite(
      transportPressureSummary?.reconnectBeforeDeliveryFailureCount,
    ) ?
      Math.max(
        NUM.ZERO,
        Math.floor(
          transportPressureSummary.reconnectBeforeDeliveryFailureCount,
        ),
      ) :
      NUM.ZERO;
    this.incrementGatewayOutcomeMetric(
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATIONOUTCOMECOUNTS,
      outcome,
    );
    this.recordGatewayLatency(
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MAXOBSERVEDMUTATIONLATENCYMS,
      latencyMs,
    );
    this.recordGatewayLatency(LOCAL_STR_1NXSQ, queueWaitMs);
    this.recordGatewayLatency(
      LOCAL_STR_SLN22,
      transportPendingNodeConnectionCount,
    );
    if (result?.success === false) {
      this.incrementGatewayOutcomeMetric(
        LOCAL_STR_1UYEC,
        failureSummary.primaryReason,
      );
      this.addGatewayMetric(
        LOCAL_STR_1OW12,
        failureSummary.authoritativeRowSourceUnavailableCount,
      );
      this.addGatewayMetric(
        LOCAL_STR_1O67A,
        failureSummary.distributedParticipantFailureCount,
      );
      this.addGatewayMetric(
        LOCAL_STR_1K86M,
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
        typeof result?.queueState === TYPEOF.STRING ?
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
      retryAfterMs: retryAfterMs > NUM.ZERO ? retryAfterMs : null,
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
          retryAfterMs: retryAfterMs > NUM.ZERO ? retryAfterMs : null,
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
