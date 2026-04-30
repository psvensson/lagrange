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
  resolveLegacyAuthoritativeReadMode,
  stableSerialize,
} from './control-plane-system-table-gateway-shared.js';
import {
  ControlPlaneSystemTableGatewaySegment1,
} from './control-plane-system-table-gateway-segment-1.js';

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

  /**
   * @param {string|null} tableName
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  evaluateReadPressure(tableName, options = {}) {
    return this.getPressureGovernor().evaluate({
      workClass: options?.workClass || PRESSURE_WORK_CLASS.INTERACTIVE,
      resourceKeys: normalizeDistinctStringArray([
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CONTROL_DASH_PLANE_COLON_READ,
        `control-plane:table:${
          tableName || CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UNKNOWN
        }`,
        ...(Array.isArray(options?.resourceKeys) ? options.resourceKeys : []),
      ]),
      allowDegrade: options?.allowPressureDegrade !== false,
      allowDefer: options?.allowPressureDefer === true,
      retryAfterMs: options?.pressureRetryAfterMs,
    });
  }

  /**
   * @param {string} tableName
   * @param {string} sql
   * @param {Array<*>} params
   * @param {Object} [options={}]
   * @return {string|null}
   * @private
   */
  buildReadRequestKey(tableName, sql, params = [], options = {}) {
    const explicitKey = normalizeCoalescingToken(options?.coalescingKey);
    if (explicitKey) {
      return `control-plane:read:${
        tableName || CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UNKNOWN
      }:${explicitKey}`;
    }
    if (options?.allowCoalescing === false) {
      return null;
    }
    return stableSerialize({
      kind: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CONTROL_DASH_PLANE_DASH_READ,
      tableName: tableName || null,
      readProfile: options?.readProfile || null,
      strategy: options?.strategy || null,
      sql: sql || null,
      params: Array.isArray(params) ? params : [],
      workloadClass: options?.workloadClass || null,
      workClass: options?.workClass || PRESSURE_WORK_CLASS.INTERACTIVE,
      allowPressureDegrade: options?.allowPressureDegrade !== false,
      allowPressureDefer: options?.allowPressureDefer === true,
      resourceKeys: Array.isArray(options?.resourceKeys) ?
        normalizeDistinctStringArray(options.resourceKeys) :
        [],
      phaseScope: normalizePhaseScope(options?.phaseScope),
      authoritativeReadMode: resolveLegacyAuthoritativeReadMode(options),
      localReadConsistency: options?.localReadConsistency || null,
      replicaFallbackConsistency: options?.replicaFallbackConsistency || null,
      routingReadinessDimension:
        options?.routingReadinessDimension ||
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    });
  }

  /**
   * @param {string} sql
   * @param {Object} [options={}]
   * @return {Object}
   * @private
   */
  resolveSystemTableQueryDescriptor(sql, options = {}) {
    const tableName = normalizeSystemTableName(
      options?.controlPlaneTableName ||
        options?.tableName ||
        extractSystemTableNameFromSql(sql),
    );
    const operationKind = normalizeSqlOperationKind(
      options?.controlPlaneOperationKind ||
        options?.operationKind ||
        extractSqlOperationKind(sql),
    );
    return {
      tableName,
      operationKind,
      isSystemTable:
        Boolean(tableName) &&
        operationKind !== CONTROL_PLANE_SQL_OPERATION.UNKNOWN,
    };
  }

  /**
   * @param {Object} descriptor
   * @param {string} sql
   * @param {Array<*>} params
   * @param {Object} [options={}]
   * @return {string|null}
   * @private
   */
  buildExecuteQueryKey(descriptor, sql, params = [], options = {}) {
    const explicitKey = normalizeCoalescingToken(options?.coalescingKey);
    if (explicitKey) {
      return (
        `control-plane:query:${
          descriptor.tableName ||
          CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UNKNOWN
        }:` +
        `${descriptor.operationKind}:${explicitKey}`
      );
    }
    if (options?.allowCoalescing === false) {
      return null;
    }
    if (descriptor.operationKind !== CONTROL_PLANE_SQL_OPERATION.READ) {
      return null;
    }
    return stableSerialize({
      kind: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.CONTROL_DASH_PLANE_DASH_QUERY,
      tableName: descriptor.tableName || null,
      operationKind: descriptor.operationKind,
      sql: sql || null,
      params: Array.isArray(params) ? params : [],
      workClass: options?.workClass || PRESSURE_WORK_CLASS.INTERACTIVE,
      allowPressureDefer: options?.allowPressureDefer === true,
      allowPressureDegrade: options?.allowPressureDegrade === true,
      routingReadinessDimension:
        options?.routingReadinessDimension ||
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    });
  }

  /**
   * @param {Object} descriptor
   * @param {Object} [options={}]
   * @return {Object|null}
   * @private
   */
  evaluateExecuteQueryPressure(descriptor, options = {}) {
    if (descriptor?.isSystemTable !== true) {
      return null;
    }
    const shouldEvaluate =
      options?.enforcePressureAdmission === true ||
      options?.allowPressureDefer === true ||
      options?.allowPressureDegrade === true ||
      typeof options?.workClass === TYPEOF.STRING;
    if (!shouldEvaluate) {
      return null;
    }
    const isWrite =
      descriptor.operationKind === CONTROL_PLANE_SQL_OPERATION.WRITE;
    const defaultResourceKeys = [
      `control-plane:${
        isWrite ?
          CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.WRITE :
          CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.READ
      }`,
      `control-plane:table:${
        descriptor.tableName ||
          CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.UNKNOWN
      }`,
    ];
    const resourceKeys = normalizeDistinctStringArray([
      ...defaultResourceKeys,
      ...(Array.isArray(options?.resourceKeys) ? options.resourceKeys : []),
    ]);
    return this.getPressureGovernor().evaluate({
      workClass:
        options?.workClass ||
        (isWrite ?
          PRESSURE_WORK_CLASS.CRITICAL :
          PRESSURE_WORK_CLASS.INTERACTIVE),
      resourceKeys,
      allowDegrade: isWrite ? false : options?.allowPressureDegrade === true,
      allowDefer: options?.allowPressureDefer === true,
      retryAfterMs: options?.pressureRetryAfterMs,
    });
  }

  /**
   * @private
   */
  assertSqlQueryEngine() {
    const sqlQueryEngine = this.resolveSqlQueryEngine();
    if (
      !sqlQueryEngine ||
      typeof sqlQueryEngine.executeQuery !== TYPEOF.FUNCTION
    ) {
      throw new Error(GATEWAY_ERROR_MSG.SQL_ENGINE_REQUIRED);
    }
    return sqlQueryEngine;
  }

  /**
   * @private
   */
  assertCdcIntegrationService() {
    const cdcIntegrationService = this.resolveCdcIntegrationService();
    if (!cdcIntegrationService) {
      throw new Error(GATEWAY_ERROR_MSG.CDC_REQUIRED);
    }
    return cdcIntegrationService;
  }

  /**
   * @param {Object} options
   * @return {boolean}
   * @private
   */
  shouldUseSqlMutationFallback(options = {}) {
    if (options?.skipCacheWait !== true) {
      return false;
    }
    const phaseScope = normalizePhaseScope(options?.phaseScope);
    if (!phaseScope) {
      return false;
    }
    return (
      typeof this.resolveSqlQueryEngine()?.executeQuery === TYPEOF.FUNCTION
    );
  }

  /**
   * @param {Object} mutation
   * @return {{sql: string, params: Array<*>}}
   * @private
   */
  buildSqlMutationPlan(mutation = {}) {
    const operation = normalizeMutationOperation(mutation?.operation);
    const tableName = normalizeSystemTableName(mutation?.tableName);
    if (!operation) {
      throw new Error(GATEWAY_ERROR_MSG.MUTATION_OPERATION_REQUIRED);
    }
    if (!tableName) {
      throw new Error(GATEWAY_ERROR_MSG.MUTATION_TABLE_REQUIRED);
    }

    if (
      operation === CONTROL_PLANE_MUTATION_OPERATION.INSERT ||
      operation === CONTROL_PLANE_MUTATION_OPERATION.UPSERT
    ) {
      if (!mutation?.row || typeof mutation.row !== TYPEOF.OBJECT) {
        throw new Error(GATEWAY_ERROR_MSG.MUTATION_ROW_REQUIRED);
      }
      const rowEntries = Object.entries(mutation.row).filter(
        ([_key, value]) => {
          return typeof value !== TYPEOF.UNDEFINED;
        },
      );
      if (rowEntries.length === NUM.ZERO) {
        throw new Error(GATEWAY_ERROR_MSG.MUTATION_ROW_REQUIRED);
      }
      const columns = rowEntries.map(([key]) => key).join(', ');
      const placeholders = rowEntries.map(() => '?').join(', ');
      return {
        sql: `${
          operation === CONTROL_PLANE_MUTATION_OPERATION.UPSERT ?
            SQL.INSERT_OR_REPLACE_INTO :
            SQL.INSERT_INTO
        } ${tableName} (${columns}) ${SQL.VALUES} (${placeholders})`,
        params: rowEntries.map(([_key, value]) => value),
      };
    }

    if (
      !mutation?.whereClause ||
      typeof mutation.whereClause !== TYPEOF.OBJECT
    ) {
      throw new Error(GATEWAY_ERROR_MSG.MUTATION_WHERE_REQUIRED);
    }
    const whereEntries = Object.entries(mutation.whereClause).filter(
      ([_key, value]) => {
        return typeof value !== TYPEOF.UNDEFINED;
      },
    );
    if (whereEntries.length === NUM.ZERO) {
      throw new Error(GATEWAY_ERROR_MSG.MUTATION_WHERE_REQUIRED);
    }
    const whereClause = whereEntries.map(([key]) => `${key} = ?`).join(' AND ');

    if (operation === CONTROL_PLANE_MUTATION_OPERATION.DELETE) {
      return {
        sql: `${SQL.DELETE_FROM} ${tableName} ${SQL.WHERE} ${whereClause}`,
        params: whereEntries.map(([_key, value]) => value),
      };
    }

    if (!mutation?.data || typeof mutation.data !== TYPEOF.OBJECT) {
      throw new Error(GATEWAY_ERROR_MSG.MUTATION_DATA_REQUIRED);
    }
    const updateEntries = Object.entries(mutation.data).filter(
      ([_key, value]) => {
        return typeof value !== TYPEOF.UNDEFINED;
      },
    );
    if (updateEntries.length === NUM.ZERO) {
      throw new Error(GATEWAY_ERROR_MSG.MUTATION_DATA_REQUIRED);
    }
    const setClause = updateEntries.map(([key]) => `${key} = ?`).join(', ');
    return {
      sql: `${SQL.UPDATE} ${tableName} ${SQL.SET} ${setClause} ${SQL.WHERE} ${whereClause}`,
      params: [
        ...updateEntries.map(([_key, value]) => value),
        ...whereEntries.map(([_key, value]) => value),
      ],
    };
  }

  /**
   * Execute one control-plane mutation through the SQL query engine when the
   * caller explicitly owns visibility gating and startup has not brought the
   * CDC mutation helpers online yet.
   * @param {Object} mutation
   * @param {Object} writeOptions
   * @return {Promise<Object>}
   * @private
   */
  async executeSqlMutationFallback(mutation = {}, writeOptions = {}) {
    const sqlQueryEngine = this.assertSqlQueryEngine();
    const {sql, params} = this.buildSqlMutationPlan(mutation);
    return this.normalizeMutationResult(
      await sqlQueryEngine.executeQuery(sql, params, writeOptions),
    );
  }

  /**
   * @param {string} sql
   * @param {Array<*>} [params=[]]
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async executeQuery(sql, params = [], options = {}) {
    const sqlQueryEngine = this.assertSqlQueryEngine();
    const descriptor = this.resolveSystemTableQueryDescriptor(sql, options);
    const pressureDecision = this.evaluateExecuteQueryPressure(
      descriptor,
      options,
    );
    if (
      pressureDecision &&
      (pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER ||
        pressureDecision.action === PRESSURE_GOVERNOR_ACTION.REJECT ||
        pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEGRADE)
    ) {
      return buildPressureAdmissionFailure(pressureDecision, {
        tableName: descriptor.tableName,
      });
    }
    const queryKey = this.buildExecuteQueryKey(
      descriptor,
      sql,
      params,
      options,
    );
    const result = await this.runSingleFlight(
      this.inFlightQueryRequestsByKey,
      queryKey,
      () => {
        return sqlQueryEngine.executeQuery(
          sql,
          params,
          this.buildQueryOptions(options, {
            tableName: descriptor.tableName || null,
            sql,
            operationKind: descriptor.sqlOperation || null,
          }),
        );
      },
      {
        joinMetricName: 'querySingleFlightJoinCount',
        bypassMetricName: 'queryTrackingBypassCount',
        maxTrackedRequests: this.gatewayLimits.maxTrackedQueryRequests,
      },
    );
    this.recordControlPlaneOperation({
      operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.QUERY,
      tableName: descriptor.tableName || null,
      sqlOperation: descriptor.sqlOperation || null,
      strategy: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE.SQL_QUERY_ENGINE,
      routingReadinessDimension:
        options?.routingReadinessDimension ||
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      success: result?.success !== false,
      rowCount: Number.isFinite(result?.rowCount) ?
        result.rowCount :
        Array.isArray(result?.rows) ?
          result.rows.length :
          NUM.ZERO,
      error: result?.success === false ? result?.error || null : null,
      ...this.buildOperationLedgerDiagnostics(
        descriptor.tableName || null,
        result,
        {
          ...options,
          operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.QUERY,
        },
      ),
      sessionId:
        typeof options?.sessionId === TYPEOF.STRING ? options.sessionId : null,
    });
    return result;
  }

  /**
   * Canonical authoritative control-plane read ingress.
   * Semantic lifecycle, placement, and owner decisions should use this path
   * instead of relying on read-strategy inference.
   *
   * @param {string} tableName
   * @param {string} sql
   * @param {Array<*>} [params=[]]
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async readAuthoritativeRows(tableName, sql, params = [], options = {}) {
    return this.executeRead(
      buildAuthoritativeControlPlaneReadIntent(tableName, sql, params, options),
      options,
    );
  }

  /**
   * Canonical projection control-plane read ingress.
   * Observation, diagnostics, and cache-backed convenience reads should use
   * this path instead of relying on read-strategy inference.
   *
   * @param {string} tableName
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async readProjectionRows(tableName, options = {}) {
    return this.executeRead(
      buildProjectionControlPlaneReadIntent(tableName, options),
      options,
    );
  }

  /**
   * @param {string} tableName
   * @param {string} sql
   * @param {Array<*>} [params=[]]
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
}

export {ControlPlaneSystemTableGatewaySegment2};
