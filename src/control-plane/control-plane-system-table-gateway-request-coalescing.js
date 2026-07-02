import {
  CONTROL_PLANE_DEFERRED_MUTATION_FAILURE_SENTINEL,
  CONTROL_PLANE_GATEWAY_ERROR_CODE,
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
  CONTROL_PLANE_MUTATION_OUTCOME,
  CONTROL_PLANE_MUTATION_QUEUE_STATE,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL,
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  buildOwnerContractOutcome,
  createDeferredPromise,
  normalizeCoalescingToken,
  normalizeMutationMergePolicy,
  normalizePositiveInteger,
  stableSerialize,
} from './control-plane-system-table-gateway-shared.js';

const controlPlaneSystemTableGatewayRequestCoalescingMethods = {
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
  },

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
      if (typeof options?.joinMetricName === 'string') {
        this.incrementGatewayMetric(options.joinMetricName);
      }
      return existingRequest;
    }
    const maxTrackedRequests = normalizePositiveInteger(
      options?.maxTrackedRequests,
      Number.MAX_SAFE_INTEGER,
    );
    if (requestMap.size >= maxTrackedRequests) {
      if (typeof options?.bypassMetricName === 'string') {
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
  },

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
  },

  resolveMutationRecoveryCandidateSelectionKey(requestKey, options = {}) {
    const explicitSelectionKey = normalizeCoalescingToken(
      options?.recoveryCandidateSelectionKey,
    );
    if (explicitSelectionKey) {
      return explicitSelectionKey;
    }
    return typeof requestKey === 'string' &&
      requestKey.length > 0 ?
      requestKey :
      null;
  },

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
  },

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
        Math.max(0, Math.floor(this.now() - deferred.enqueuedAtMs)) :
        0,
      pendingReplaceQueueDepth: Number.isFinite(
        deferred?.pendingReplaceQueueDepth,
      ) ?
        Math.max(0, Math.floor(deferred.pendingReplaceQueueDepth)) :
        0,
    };
    executionPromise = Promise.resolve()
      .then(() => executionFactory())
      .then(
        (result) => {
          const enrichedResult =
            result && typeof result === 'object' ?
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
          if (error && typeof error === 'object') {
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
  },

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
  },
};

function assignControlPlaneSystemTableGatewayRequestCoalescing(targetClass) {
  Object.assign(
    targetClass.prototype,
    controlPlaneSystemTableGatewayRequestCoalescingMethods,
  );
}

export {assignControlPlaneSystemTableGatewayRequestCoalescing};
