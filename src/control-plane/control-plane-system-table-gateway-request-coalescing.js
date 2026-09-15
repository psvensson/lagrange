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

const GATEWAY_IDLE_NOT_REACHED = 'control_plane_gateway_current_work_not_idle';
const GATEWAY_IDLE_STRANDED =
  'control_plane_gateway_coalescing_state_stranded: entries remaining=';
// Diagnostic ceiling only. Reaching it is an invariant failure, never idle.
const GATEWAY_IDLE_MAX_ROUNDS = 10000;

const controlPlaneSystemTableGatewayRequestCoalescingMethods = {
  /**
   * Every accepted execution gets one owner-private lifecycle record. Caller
   * completion and owner completion are different events: a caller is
   * entitled to its result as soon as the execution produces one, while the
   * gateway is still finishing the bookkeeping and successor scheduling that
   * acceptance caused. Conflating them is what let an idle observer conclude
   * the gateway was done with work it had already accepted.
   *
   * The registry is deliberately NOT a fifth coalescing ledger: it has no key
   * lookup, no dedupe, no replacement choice, no effect on pressure limits or
   * retention. It answers one question, does this gateway still own accepted
   * work, and it is the only structure that can answer it, because
   * runSingleFlight's saturation path intentionally executes accepted work
   * without inserting it into any keyed map.
   * @return {Object} the work record
   * @private
   */
  beginGatewayOwnerWork() {
    if (!this.activeGatewayWorkRecords) {
      this.activeGatewayWorkRecords = new Set();
    }
    const record = {resolveOwnerCompletion: null, ownerCompletionPromise: null};
    record.ownerCompletionPromise = new Promise((resolve) => {
      record.resolveOwnerCompletion = resolve;
    });
    this.activeGatewayWorkRecords.add(record);
    return record;
  },

  /**
   * Retire one lifecycle record. Removal precedes resolution, never the
   * reverse: a waiter woken by the promise must never re-read a registry that
   * still contains the record it was waiting for.
   * @param {Object} record
   * @private
   */
  completeGatewayOwnerWork(record) {
    if (!record) {
      return;
    }
    this.activeGatewayWorkRecords?.delete(record);
    record.resolveOwnerCompletion();
  },

  /**
   * How much accepted work this gateway still owns. Named separately from the
   * retained-request metrics, which describe the keyed maps and keep their
   * existing meaning.
   * @return {number}
   */
  activeOwnerWorkCount() {
    return this.activeGatewayWorkRecords ? this.activeGatewayWorkRecords.size : 0;
  },

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
      // Accepted work that deliberately enters no keyed map. Tracking is
      // saturated, not absent: the gateway still owns this execution, and an
      // idle contract reading only the maps would miss it entirely.
      const bypassRecord = this.beginGatewayOwnerWork();
      // The factory is still invoked synchronously and its own value is still
      // returned: this path's public behaviour is unchanged, and only the
      // lifecycle record is added.
      const bypassed = executionFactory();
      Promise.resolve(bypassed).then(
        () => this.completeGatewayOwnerWork(bypassRecord),
        () => this.completeGatewayOwnerWork(bypassRecord),
      );
      return bypassed;
    }
    const record = this.beginGatewayOwnerWork();
    let inFlightRequest = null;
    inFlightRequest = Promise.resolve()
      .then(() => executionFactory())
      .finally(() => {
        if (requestMap.get(key) === inFlightRequest) {
          requestMap.delete(key);
          this.recordGatewayRetentionSnapshot();
        }
        // Terminal bookkeeping for this request is done; the owner is done
        // with it only now, after the caller's result has been produced.
        this.completeGatewayOwnerWork(record);
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
  /**
   * Settle every request this gateway has ALREADY accepted, without closing it
   * to new work. The lifecycle registry is the completion authority, because
   * the saturation path executes accepted work without inserting it into any
   * keyed map; the coalescing ledgers are then an invariant check that no
   * decision state was stranded behind completed work. No immediate, timeout,
   * polling delay or host-turn settling appears here.
   * @return {Promise<void>}
   */
  async awaitCurrentWorkIdle() {
    for (let round = 0; round < GATEWAY_IDLE_MAX_ROUNDS; round += 1) {
      const active = this.activeGatewayWorkRecords ?
        [...this.activeGatewayWorkRecords] : [];
      if (active.length === 0) {
        const stranded = [
          this.inFlightReadRequestsByKey,
          this.inFlightQueryRequestsByKey,
          this.inFlightMutationRequestsByKey,
          this.pendingReplaceMutationRequestsByKey,
        ].reduce((total, ledger) => total + (ledger ? ledger.size : 0), 0);
        if (stranded > 0) {
          throw new Error(`${GATEWAY_IDLE_STRANDED}${stranded}`);
        }
        return;
      }
      await Promise.all(active.map((record) => record.ownerCompletionPromise));
    }
    throw new Error(GATEWAY_IDLE_NOT_REACHED);
  },

  // The queue provenance every mutation result and error carries. Extracted
  // so the scheduling method itself stays readable.
  buildMutationQueueMetadata(deferred) {
    return {
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
  },

  scheduleMutationExecution(requestKey, executionFactory, deferred = null,
    adoptedRecord = null) {
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
    // A replacement already owns a lifecycle identity from the instant it was
    // accepted; promotion reuses it rather than minting a second one.
    const record = adoptedRecord || this.beginGatewayOwnerWork();
    let executionPromise = null;
    const queueMetadata = this.buildMutationQueueMetadata(deferred);
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
        // Terminal section. The already-accepted successor is installed
        // before this request is retired, and this request's OWNER
        // completion resolves last, after every continuation its acceptance
        // caused. The ordering is hardening rather than the demonstrated
        // fix - the whole section is synchronous, so nothing can interleave
        // here - but the lifecycle retirement below is the fix: the caller's
        // result has already been produced by this point, and the gateway is
        // only now done with the request.
        const pendingRequest =
          this.pendingReplaceMutationRequestsByKey.get(requestKey);
        const isCurrentInFlight =
          this.inFlightMutationRequestsByKey.get(requestKey) ===
          executionPromise;
        if (pendingRequest) {
          this.pendingReplaceMutationRequestsByKey.delete(requestKey);
          this.scheduleMutationExecution(
            requestKey,
            pendingRequest.executionFactory,
            pendingRequest.deferred,
            pendingRequest.record,
          );
          this.recordGatewayRetentionSnapshot();
          this.completeGatewayOwnerWork(record);
          return;
        }
        if (isCurrentInFlight) {
          this.inFlightMutationRequestsByKey.delete(requestKey);
          this.recordGatewayRetentionSnapshot();
        }
        this.completeGatewayOwnerWork(record);
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
