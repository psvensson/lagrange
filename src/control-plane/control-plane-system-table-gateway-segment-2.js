import {
  CONTROL_PLANE_DEFERRED_MUTATION_FAILURE_SENTINEL,
  CONTROL_PLANE_GATEWAY_ERROR_CODE,
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_MUTATION_OUTCOME,
  CONTROL_PLANE_MUTATION_QUEUE_STATE,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READ_OUTCOME,
  CONTROL_PLANE_SQL_OPERATION,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE,
  GATEWAY_ERROR_MSG,
  GATEWAY_LOG_MSG,
  METRICS_LOG_TAG,
  NUM,
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  SQL,
  TYPEOF,
  buildAuthoritativeControlPlaneReadIntent,
  buildProjectionControlPlaneReadIntent,
  buildOwnerContractOutcome,
  buildPressureAdmissionFailure,
  canonicalizeSystemTableRow,
  createDeferredPromise,
  extractSqlOperationKind,
  extractSystemTableNameFromSql,
  getControlPlaneErrorCode,
  getControlPlaneFailureSummary,
  getControlPlaneRetryAfterMs,
  normalizeCoalescingToken,
  normalizeDistinctStringArray,
  normalizeMutationMergePolicy,
  normalizeMutationOperation,
  normalizePhaseScope,
  normalizePositiveInteger,
  normalizeSqlOperationKind,
  normalizeSystemTableName,
  resolveAuthoritativeReadMode,
  stableSerialize,
} from './control-plane-system-table-gateway-shared.js';
import {
  ControlPlaneSystemTableGatewaySegment1,
} from './control-plane-system-table-gateway-segment-1.js';
import {
  controlPlaneSystemTableGatewaySegment2QueryMethods,
} from './control-plane-system-table-gateway-segment-2-query-methods.js';

const LOCAL_STR_1NXSQ = 'maxObservedMutationQueueWaitMs';
const LOCAL_STR_SLN22 = 'maxObservedTransportPendingNodeConnectionCount';
const LOCAL_STR_1UYEC = 'mutationFailureReasonCounts';
const LOCAL_STR_1OW12 = 'authoritativeRowSourceUnavailableCount';
const LOCAL_STR_1O67A = 'distributedParticipantFailureCount';
const LOCAL_STR_1K86M = 'reconnectDeliveryFailureCount';

class ControlPlaneSystemTableGatewaySegment2 extends ControlPlaneSystemTableGatewaySegment1 {
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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

  /**
   * @param {Object} result
   * @return {Object}
   * @private
   */
  buildTrackingSaturatedMutationResult(result = {}) {
    const contractOutcome = buildOwnerContractOutcome({
      contractState: OWNER_CONTRACT_STATE.BLOCKED,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.STOP,
    });
    return {
      success: false,
      error:
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CONTROL_PLANE_MUTATION_TRACKING_SATURATED,
      errorCode: CONTROL_PLANE_GATEWAY_ERROR_CODE.MUTATION_TRACKING_SATURATED,
      outcome: CONTROL_PLANE_MUTATION_OUTCOME.REJECTED,
      contractState: contractOutcome.contractState,
      nextAction: contractOutcome.nextAction,
      ...result,
    };
  }

  /**
   * @param {Map<string, Promise<Object>>} requestMap
   * @param {string|null} key
   * @param {Function} executionFactory
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   * @private
   */
  runSingleFlight(requestMap, key, executionFactory, options = {}) {
    if (!key) {
      return executionFactory();
    }
    const existingRequest = requestMap.get(key);
    if (existingRequest) {
      if (typeof options?.joinMetricName === TYPEOF.STRING) {
        this.incrementGatewayMetric(options.joinMetricName);
      }
      return existingRequest;
    }
    const maxTrackedRequests = normalizePositiveInteger(
      options?.maxTrackedRequests,
      Number.MAX_SAFE_INTEGER,
    );
    if (requestMap.size >= maxTrackedRequests) {
      if (typeof options?.bypassMetricName === TYPEOF.STRING) {
        this.incrementGatewayMetric(options.bypassMetricName);
      }
      return executionFactory();
    }
    let inFlightRequest = null;
    inFlightRequest = Promise.resolve()
      .then(() => executionFactory())
      .finally(() => {
        if (requestMap.get(key) === inFlightRequest) {
          requestMap.delete(key);
          this.recordGatewayRetentionSnapshot();
        }
      });
    requestMap.set(key, inFlightRequest);
    this.recordGatewayRetentionSnapshot();
    return inFlightRequest;
  }

  /**
   * @param {Object} mutation
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  buildMutationCoalescingDescriptor(mutation = {}, options = {}) {
    const allowCoalescing = options?.allowCoalescing !== false;
    const mergePolicy =
      normalizeMutationMergePolicy(
        options?.mergePolicy || mutation?.mergePolicy,
      ) ||
      (allowCoalescing ?
        CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT :
        CONTROL_PLANE_MUTATION_MERGE_POLICY.NONE);
    const explicitKey = normalizeCoalescingToken(
      options?.coalescingKey || mutation?.coalescingKey,
    );
    if (mergePolicy === CONTROL_PLANE_MUTATION_MERGE_POLICY.NONE) {
      return {
        requestKey: null,
        mergePolicy,
      };
    }
    if (!explicitKey) {
      if (mergePolicy === CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING) {
        return {
          requestKey: null,
          mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.NONE,
        };
      }
      return {
        requestKey: stableSerialize({
          kind: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CONTROL_DASH_PLANE_DASH_MUTATION,
          tableName: mutation?.tableName || null,
          operation: mutation?.operation || null,
          row: mutation?.row || null,
          whereClause: mutation?.whereClause || null,
          data: mutation?.data || null,
          workClass: options?.workClass || null,
          deliveryPriority: options?.deliveryPriority || null,
          ignoreExisting: options?.ignoreExisting === true,
          allowPressureDefer: options?.allowPressureDefer === true,
          routingReadinessDimension:
            options?.routingReadinessDimension ||
            CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
        }),
        mergePolicy,
      };
    }
    if (mergePolicy === CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT) {
      return {
        requestKey: stableSerialize({
          kind: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CONTROL_DASH_PLANE_DASH_MUTATION,
          explicitKey,
          tableName: mutation?.tableName || null,
          operation: mutation?.operation || null,
          row: mutation?.row || null,
          whereClause: mutation?.whereClause || null,
          data: mutation?.data || null,
          workClass: options?.workClass || null,
          deliveryPriority: options?.deliveryPriority || null,
          ignoreExisting: options?.ignoreExisting === true,
          allowPressureDefer: options?.allowPressureDefer === true,
          routingReadinessDimension:
            options?.routingReadinessDimension ||
            CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
        }),
        mergePolicy,
      };
    }
    return {
      requestKey:
        `control-plane:mutation:${
          mutation?.tableName ||
          CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UNKNOWN
        }:` +
        `${explicitKey}`,
      mergePolicy,
    };
  }

  resolveMutationRecoveryCandidateSelectionKey(requestKey, options = {}) {
    const explicitSelectionKey = normalizeCoalescingToken(
      options?.recoveryCandidateSelectionKey,
    );
    if (explicitSelectionKey) {
      return explicitSelectionKey;
    }
    return typeof requestKey === TYPEOF.STRING &&
      requestKey.length > NUM.ZERO ?
      requestKey :
      null;
  }

  /**
   * @param {string} requestKey
   * @return {Object}
   * @private
   */
  buildSupersededMutationResult(requestKey) {
    const contractOutcome = buildOwnerContractOutcome({
      contractState: OWNER_CONTRACT_STATE.READY,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.PROCEED,
    });
    return {
      success: true,
      outcome: CONTROL_PLANE_MUTATION_OUTCOME.NO_OP,
      contractState: contractOutcome.contractState,
      nextAction: contractOutcome.nextAction,
      requestKey,
      superseded: true,
    };
  }

  /**
   * @param {string} requestKey
   * @param {Function} executionFactory
   * @param {Object|null} [deferred=null]
   * @return {Promise<Object>}
   * @private
   */
  scheduleMutationExecution(requestKey, executionFactory, deferred = null) {
    if (
      !this.inFlightMutationRequestsByKey.has(requestKey) &&
      this.inFlightMutationRequestsByKey.size >=
        this.gatewayLimits.maxTrackedMutationRequests
    ) {
      this.incrementGatewayMetric(
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATIONTRACKINGREJECTEDCOUNT,
      );
      const saturatedResult = this.buildTrackingSaturatedMutationResult({
        requestKey,
      });
      if (deferred) {
        deferred.resolve(saturatedResult);
        return deferred.promise;
      }
      return Promise.resolve(saturatedResult);
    }
    let executionPromise = null;
    const queueMetadata = {
      queueState:
        deferred?.queueState || CONTROL_PLANE_MUTATION_QUEUE_STATE.DIRECT,
      queueWaitMs: Number.isFinite(deferred?.enqueuedAtMs) ?
        Math.max(NUM.ZERO, Math.floor(this.now() - deferred.enqueuedAtMs)) :
        NUM.ZERO,
      pendingReplaceQueueDepth: Number.isFinite(
        deferred?.pendingReplaceQueueDepth,
      ) ?
        Math.max(NUM.ZERO, Math.floor(deferred.pendingReplaceQueueDepth)) :
        NUM.ZERO,
    };
    executionPromise = Promise.resolve()
      .then(() => executionFactory())
      .then(
        (result) => {
          const enrichedResult =
            result && typeof result === TYPEOF.OBJECT ?
              {
                ...result,
                queueState: queueMetadata.queueState,
                queueWaitMs: queueMetadata.queueWaitMs,
                pendingReplaceQueueDepth:
                    queueMetadata.pendingReplaceQueueDepth,
              } :
              result;
          if (deferred) {
            deferred.resolve(enrichedResult);
          }
          return enrichedResult;
        },
        (error) => {
          if (error && typeof error === TYPEOF.OBJECT) {
            error.queueState = queueMetadata.queueState;
            error.queueWaitMs = queueMetadata.queueWaitMs;
            error.pendingReplaceQueueDepth =
              queueMetadata.pendingReplaceQueueDepth;
          }
          if (deferred) {
            deferred.reject(error);
            return CONTROL_PLANE_DEFERRED_MUTATION_FAILURE_SENTINEL;
          }
          throw error;
        },
      )
      .finally(() => {
        if (
          this.inFlightMutationRequestsByKey.get(requestKey) ===
          executionPromise
        ) {
          this.inFlightMutationRequestsByKey.delete(requestKey);
          this.recordGatewayRetentionSnapshot();
        }
        const pendingRequest =
          this.pendingReplaceMutationRequestsByKey.get(requestKey);
        if (!pendingRequest) {
          return;
        }
        this.pendingReplaceMutationRequestsByKey.delete(requestKey);
        this.recordGatewayRetentionSnapshot();
        this.scheduleMutationExecution(
          requestKey,
          pendingRequest.executionFactory,
          pendingRequest.deferred,
        );
      });
    this.inFlightMutationRequestsByKey.set(requestKey, executionPromise);
    this.recordGatewayRetentionSnapshot();
    return deferred ? deferred.promise : executionPromise;
  }

  /**
   * @param {string} requestKey
   * @param {Function} executionFactory
   * @return {Promise<Object>}
   * @private
   */
  runReplacePendingMutation(requestKey, executionFactory) {
    const inFlightRequest = this.inFlightMutationRequestsByKey.get(requestKey);
    if (!inFlightRequest) {
      return this.scheduleMutationExecution(requestKey, executionFactory);
    }

    const existingPending =
      this.pendingReplaceMutationRequestsByKey.get(requestKey);
    if (existingPending) {
      this.incrementGatewayMetric(
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATIONREPLACEPENDINGSUPERSEDEDCOUNT,
      );
      existingPending.deferred.resolve(
        this.buildSupersededMutationResult(requestKey),
      );
    }

    if (
      !existingPending &&
      this.pendingReplaceMutationRequestsByKey.size >=
        this.gatewayLimits.maxPendingReplaceMutationRequests
    ) {
      this.incrementGatewayMetric(
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATIONTRACKINGREJECTEDCOUNT,
      );
      return Promise.resolve(
        this.buildTrackingSaturatedMutationResult({
          requestKey,
        }),
      );
    }

    const deferred = createDeferredPromise();
    deferred.enqueuedAtMs = this.now();
    deferred.queueState = CONTROL_PLANE_MUTATION_QUEUE_STATE.PENDING_REPLACE;
    deferred.pendingReplaceQueueDepth =
      this.pendingReplaceMutationRequestsByKey.size +
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.ONE;
    this.pendingReplaceMutationRequestsByKey.set(requestKey, {
      deferred,
      executionFactory,
    });
    this.incrementGatewayMetric(
      CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATIONREPLACEPENDINGQUEUEDCOUNT,
    );
    this.recordGatewayRetentionSnapshot();
    return deferred.promise;
  }

}

Object.assign(
  ControlPlaneSystemTableGatewaySegment2.prototype,
  controlPlaneSystemTableGatewaySegment2QueryMethods,
);

export {ControlPlaneSystemTableGatewaySegment2};
