import {
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL,
} from './control-plane-system-table-gateway-shared.js';

const controlPlaneSystemTableGatewayRetentionMetricsMethods = {
  /**
   * @return {Object}
   */
  getStats() {
    return {
      limits: {...this.gatewayLimits},
      retainedRequests: {
        inFlightReads: this.inFlightReadRequestsByKey.size,
        inFlightQueries: this.inFlightQueryRequestsByKey.size,
        inFlightMutations: this.inFlightMutationRequestsByKey.size,
        pendingReplaceMutations: this.pendingReplaceMutationRequestsByKey.size,
        total:
          this.inFlightReadRequestsByKey.size +
          this.inFlightQueryRequestsByKey.size +
          this.inFlightMutationRequestsByKey.size +
          this.pendingReplaceMutationRequestsByKey.size,
      },
      metrics: this.buildGatewayMetricsSnapshot(),
    };
  },

  /**
   * @return {Object}
   * @private
   */
  buildGatewayMetricsSnapshot() {
    return {
      ...this.gatewayMetrics,
      readOutcomeCounts: {...this.gatewayMetrics.readOutcomeCounts},
      mutationOutcomeCounts: {...this.gatewayMetrics.mutationOutcomeCounts},
      mutationFailureReasonCounts: {
        ...this.gatewayMetrics.mutationFailureReasonCounts,
      },
    };
  },

  /**
   * @return {Object}
   * @private
   */
  buildRetainedRequestsSnapshot() {
    return {
      inFlightReads: this.inFlightReadRequestsByKey.size,
      inFlightQueries: this.inFlightQueryRequestsByKey.size,
      inFlightMutations: this.inFlightMutationRequestsByKey.size,
      pendingReplaceMutations: this.pendingReplaceMutationRequestsByKey.size,
      total:
        this.inFlightReadRequestsByKey.size +
        this.inFlightQueryRequestsByKey.size +
        this.inFlightMutationRequestsByKey.size +
        this.pendingReplaceMutationRequestsByKey.size,
    };
  },

  /**
   * @return {Object}
   * @private
   */
  buildRetentionMetricData() {
    const retainedRequests = this.buildRetainedRequestsSnapshot();
    const retainedRequestCapacity =
      this.gatewayLimits.maxTrackedReadRequests +
      this.gatewayLimits.maxTrackedQueryRequests +
      this.gatewayLimits.maxTrackedMutationRequests +
      this.gatewayLimits.maxPendingReplaceMutationRequests;
    return {
      nodeId: this.nodeId,
      retainedRequests,
      limits: {...this.gatewayLimits},
      retainedRequestCapacity,
      retainedRequestUtilization:
        retainedRequestCapacity > 0 ?
          retainedRequests.total / retainedRequestCapacity :
          0,
      boundedByTrackedCapacity:
        retainedRequests.total <= retainedRequestCapacity,
      maxObservedRetainedRequestCount:
        this.gatewayMetrics.maxObservedRetainedRequestCount,
    };
  },

  /**
   * @private
   */
  recordGatewayRetentionSnapshot() {
    const retainedRequests = this.buildRetainedRequestsSnapshot();
    const retainedRequestCount = retainedRequests.total;
    this.gatewayMetrics.maxObservedInFlightReadRequests = Math.max(
      this.gatewayMetrics.maxObservedInFlightReadRequests,
      retainedRequests.inFlightReads,
    );
    this.gatewayMetrics.maxObservedInFlightQueryRequests = Math.max(
      this.gatewayMetrics.maxObservedInFlightQueryRequests,
      retainedRequests.inFlightQueries,
    );
    this.gatewayMetrics.maxObservedInFlightMutationRequests = Math.max(
      this.gatewayMetrics.maxObservedInFlightMutationRequests,
      retainedRequests.inFlightMutations,
    );
    this.gatewayMetrics.maxObservedPendingReplaceMutationRequests = Math.max(
      this.gatewayMetrics.maxObservedPendingReplaceMutationRequests,
      retainedRequests.pendingReplaceMutations,
    );
    this.gatewayMetrics.maxObservedRetainedRequestCount = Math.max(
      this.gatewayMetrics.maxObservedRetainedRequestCount,
      retainedRequestCount,
    );
    this.emitGatewayRetentionMetric();
  },

  /**
   * @param {string} metricName
   * @private
   */
  incrementGatewayMetric(metricName) {
    if (typeof this.gatewayMetrics?.[metricName] !== 'number') {
      return;
    }
    this.gatewayMetrics[metricName] +=
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ONE;
  },

  /**
   * @param {string} metricName
   * @param {number} amount
   * @private
   */
  addGatewayMetric(metricName, amount) {
    if (typeof this.gatewayMetrics?.[metricName] !== 'number') {
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }
    this.gatewayMetrics[metricName] += Math.floor(amount);
  },

  /**
   * @param {string} metricName
   * @param {number} latencyMs
   * @private
   */
  recordGatewayLatency(metricName, latencyMs) {
    if (typeof this.gatewayMetrics?.[metricName] !== 'number') {
      return;
    }
    if (!Number.isFinite(latencyMs) || latencyMs < 0) {
      return;
    }
    this.gatewayMetrics[metricName] = Math.max(
      this.gatewayMetrics[metricName],
      Math.floor(latencyMs),
    );
  },
};

function assignControlPlaneSystemTableGatewayRetentionMetrics(targetClass) {
  Object.assign(
    targetClass.prototype,
    controlPlaneSystemTableGatewayRetentionMetricsMethods,
  );
}

export {assignControlPlaneSystemTableGatewayRetentionMetrics};
