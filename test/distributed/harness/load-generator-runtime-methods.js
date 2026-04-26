function createLoadGeneratorRuntimeBundle(deps = {}) {
  const {
    ADMIN_LANE_LOAD,
    DISPATCH_STOP_REASON_CANCELLED,
    DISPATCH_STOP_REASON_DURATION,
    DRAIN_WAIT_MS,
    DURATION_MINUTES_SUFFIX,
    DURATION_SECONDS_SUFFIX,
    IDENTIFIER_PATTERN,
    LOAD_LANE_TRANSIENT_CONNECTION_FRAGMENT,
    LOAD_LANE_TRANSIENT_TIMEOUT_FRAGMENT,
    LOAD_NODE_AVAILABILITY_STATE,
    LOAD_TABLE_NAME,
    MAX_DISTINCT_ERROR_MESSAGES,
    MS_PER_SECOND,
    NODE_BREAKER_OWNER_NODE_CLIENT,
    NODE_CLIENT_ADMISSION_ERROR_BUDGET_EXHAUSTED,
    NODE_CLIENT_ADMISSION_ERROR_CIRCUIT_OPEN,
    NODE_CLIENT_ADMISSION_ERROR_ROUTING_NOT_READY,
    PERCENTILE_P50,
    PERCENTILE_P95,
    PERCENTILE_P99,
    REJECTED_REASON_FLOW_CONTROL,
    REJECTED_REASON_QUEUE_FULL,
    SECONDS_PER_MINUTE,
    UNDISPATCHED_REASON_CANCELLED,
    UNDISPATCHED_REASON_CAPACITY,
    UNDISPATCHED_REASON_DURATION_TIMEOUT,
    WAIT_REASON_NODE_ADMISSION_BLOCKED,
    WAIT_REASON_NODE_SLOT_UNAVAILABLE,
    WAIT_REASON_QUEUE_CAPACITY_REJECTED,
    WAIT_REASON_RETRYABLE_CONTROL_PLANE_PRESSURE,
    WAIT_REASON_TIMEOUT_WAITS,
    ZERO,
    ONE,
    buildLoadNodeAvailabilitySnapshot,
    getControlPlaneRetryAfterMs,
    isRetryableControlPlaneError,
    isTimeoutShapedError,
    resolveLoadNodeAvailabilityState,
  } = deps;

  function parseDuration(duration) {
    if (typeof duration === 'number') {
      return duration;
    }
    const value = parseInt(duration, 10);
    if (duration.endsWith(DURATION_MINUTES_SUFFIX)) {
      return value * SECONDS_PER_MINUTE * MS_PER_SECOND;
    }
    if (duration.endsWith(DURATION_SECONDS_SUFFIX)) {
      return value * MS_PER_SECOND;
    }
    return value;
  }

  function normalizeTableName(tableName, fallback = LOAD_TABLE_NAME) {
    const candidate = String(tableName || fallback).trim();
    if (!IDENTIFIER_PATTERN.test(candidate)) {
      return fallback;
    }
    return candidate;
  }

  function createWaitReasonCounters() {
    return {
      [WAIT_REASON_NODE_SLOT_UNAVAILABLE]: ZERO,
      [WAIT_REASON_NODE_ADMISSION_BLOCKED]: ZERO,
      [WAIT_REASON_RETRYABLE_CONTROL_PLANE_PRESSURE]: ZERO,
      [WAIT_REASON_TIMEOUT_WAITS]: ZERO,
      [WAIT_REASON_QUEUE_CAPACITY_REJECTED]: ZERO,
    };
  }

  function normalizePositiveInteger(value, fallback) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return fallback;
    }
    const boundedValue = Math.floor(numericValue);
    return boundedValue > ZERO ? boundedValue : fallback;
  }

  function normalizeRatio(value, fallback) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return fallback;
    }
    return Math.max(ZERO, Math.min(ONE, numericValue));
  }

  function percentile(sorted, percentile) {
    if (sorted.length === ZERO) {
      return ZERO;
    }
    const index = Math.floor(percentile * sorted.length);
    return sorted[Math.min(index, sorted.length - ONE)];
  }

  /**
     * Compute metrics from raw data. Exported for independent testing.
     * @param {Array<number>} latencies - Raw latency values in ms
     * @param {number} successCount
     * @param {number} failedCount
     * @param {number} operationErrorCount
     * @param {number} durationMs - Total run duration in ms
     * @param {Array<string>} [distinctErrors] - Distinct error messages
     * @param {number} [attemptErrorCount] - Transient per-attempt failures
     * @returns {Object} Metrics snapshot
     */
  function computeMetrics(
    latencies, successCount, failedCount, operationErrorCount, durationMs,
    distinctErrors, attemptErrorCount = ZERO, queueDelays = [],
    dispatchAccounting = null, perNodeMetrics = null, rejectedAccounting = null,
    queuePressure = null, waitReasons = null, dispatchGuardrail = null,
  ) {
    const sorted = [...latencies].sort((a, b) => a - b);
    const total = successCount + failedCount;
    const elapsed = durationMs > ZERO ? durationMs : ONE;
    const metrics = {
      total,
      success: successCount,
      failed: failedCount,
      errors: operationErrorCount,
      latency: {
        avg: sorted.length > ZERO ?
          sorted.reduce((sum, value) => sum + value, ZERO) / sorted.length :
          ZERO,
        p50: percentile(sorted, PERCENTILE_P50),
        p95: percentile(sorted, PERCENTILE_P95),
        p99: percentile(sorted, PERCENTILE_P99),
      },
      opsPerSec: (total / elapsed) * MS_PER_SECOND,
    };
    if (attemptErrorCount > ZERO) {
      metrics.attemptErrors = attemptErrorCount;
    }
    if (Array.isArray(queueDelays) && queueDelays.length > ZERO) {
      const sortedQueueDelays = [...queueDelays].sort((a, b) => a - b);
      metrics.queueDelay = {
        avg: sortedQueueDelays.reduce((sum, value) => sum + value, ZERO) /
            sortedQueueDelays.length,
        p50: percentile(sortedQueueDelays, PERCENTILE_P50),
        p95: percentile(sortedQueueDelays, PERCENTILE_P95),
        p99: percentile(sortedQueueDelays, PERCENTILE_P99),
        max: sortedQueueDelays[sortedQueueDelays.length - ONE],
      };
    }
    if (Array.isArray(distinctErrors) && distinctErrors.length > ZERO) {
      metrics.distinctErrors = distinctErrors;
    }
    if (dispatchAccounting && typeof dispatchAccounting === 'object') {
      const targetOperations = Number(dispatchAccounting.targetOperations);
      const dispatchedOperations = Number(dispatchAccounting.dispatchedOperations);
      const undispatchedOperations = Number(
        dispatchAccounting.undispatchedOperations,
      );
      const normalizedUndispatchedByReason =
          dispatchAccounting.undispatchedByReason &&
          typeof dispatchAccounting.undispatchedByReason === 'object' ?
            dispatchAccounting.undispatchedByReason :
            null;
      metrics.targetOperations = Number.isFinite(targetOperations) ?
        Math.max(ZERO, Math.floor(targetOperations)) :
        ZERO;
      metrics.dispatchedOperations = Number.isFinite(dispatchedOperations) ?
        Math.max(ZERO, Math.floor(dispatchedOperations)) :
        ZERO;
      metrics.undispatchedOperations = Number.isFinite(undispatchedOperations) ?
        Math.max(ZERO, Math.floor(undispatchedOperations)) :
        ZERO;
      metrics.undispatchedByReason = normalizedUndispatchedByReason || {
        [UNDISPATCHED_REASON_CAPACITY]: ZERO,
        [UNDISPATCHED_REASON_DURATION_TIMEOUT]: ZERO,
        [UNDISPATCHED_REASON_CANCELLED]: ZERO,
      };
    }
    if (perNodeMetrics && typeof perNodeMetrics === 'object') {
      metrics.perNode = perNodeMetrics;
      let admissionSignalCount = ZERO;
      let nonAdmissionAttemptErrorCount = ZERO;
      for (const nodeMetrics of Object.values(perNodeMetrics)) {
        const nodeAttemptErrors = Number(nodeMetrics?.attemptErrors || ZERO);
        const nodeAdmissionSignals = Math.min(
          nodeAttemptErrors,
          Number(nodeMetrics?.admissionSignals || ZERO),
        );
        admissionSignalCount += nodeAdmissionSignals;
        nonAdmissionAttemptErrorCount += Math.max(
          ZERO,
          nodeAttemptErrors - nodeAdmissionSignals,
        );
      }
      metrics.admissionSignals = admissionSignalCount;
      metrics.nonAdmissionAttemptErrors = nonAdmissionAttemptErrorCount;
    }
    if (rejectedAccounting && typeof rejectedAccounting === 'object') {
      const rejectedOperations = Number(rejectedAccounting.rejectedOperations);
      metrics.rejectedOperations = Number.isFinite(rejectedOperations) ?
        Math.max(ZERO, Math.floor(rejectedOperations)) :
        ZERO;
      metrics.rejectedByReason = rejectedAccounting.rejectedByReason &&
          typeof rejectedAccounting.rejectedByReason === 'object' ?
        {...rejectedAccounting.rejectedByReason} :
        {
          [REJECTED_REASON_QUEUE_FULL]: ZERO,
          [REJECTED_REASON_FLOW_CONTROL]: ZERO,
        };
    }
    if (queuePressure && typeof queuePressure === 'object') {
      const pendingQueueDepth = queuePressure.pendingQueueDepth &&
          typeof queuePressure.pendingQueueDepth === 'object' ?
        queuePressure.pendingQueueDepth :
        {};
      metrics.queuePressure = {
        samples: Number.isFinite(queuePressure.samples) ?
          Math.max(ZERO, Math.floor(queuePressure.samples)) :
          ZERO,
        pendingQueueDepth: {
          avg: Number.isFinite(pendingQueueDepth.avg) ?
            Math.max(ZERO, pendingQueueDepth.avg) :
            ZERO,
          p95: Number.isFinite(pendingQueueDepth.p95) ?
            Math.max(ZERO, pendingQueueDepth.p95) :
            ZERO,
          p99: Number.isFinite(pendingQueueDepth.p99) ?
            Math.max(ZERO, pendingQueueDepth.p99) :
            ZERO,
          max: Number.isFinite(pendingQueueDepth.max) ?
            Math.max(ZERO, pendingQueueDepth.max) :
            ZERO,
        },
      };
    }
    metrics.waitReasons = {
      ...createWaitReasonCounters(),
      ...(waitReasons && typeof waitReasons === 'object' ? waitReasons : {}),
    };
    if (dispatchGuardrail && typeof dispatchGuardrail === 'object') {
      metrics.dispatchGuardrail = {
        ...dispatchGuardrail,
      };
    }
    return metrics;
  }

  class LoadRunRuntimeMethods {
    _getNodeInFlight(healthKey) {
      return Number(this._nodeInFlightByKey.get(healthKey) || ZERO);
    }

    _getNodeInFlightTokens(healthKey) {
      const tokens = this._nodeInFlightTokensByKey.get(healthKey);
      return Array.isArray(tokens) ? tokens : [];
    }

    _getOldestNodeInFlightStartedAtMs(healthKey) {
      let oldestStartedAtMs = null;
      const tokens = this._getNodeInFlightTokens(healthKey);
      for (const token of tokens) {
        const startedAtMs = Number(token?.startedAtMs);
        if (!Number.isFinite(startedAtMs)) {
          continue;
        }
        if (oldestStartedAtMs === null || startedAtMs < oldestStartedAtMs) {
          oldestStartedAtMs = Math.floor(startedAtMs);
        }
      }
      return oldestStartedAtMs;
    }

    _resolveNodeAvailability(node, healthKey, nowMs, dispatchMaxInFlight) {
      const state = this._nodeHealthByKey.get(healthKey);
      return resolveLoadNodeAvailabilityState(
        buildLoadNodeAvailabilitySnapshot({
          nowMs,
          localDispatchReady: this._isNodeDispatchReady(state, nowMs),
          externalAdmissionReady: this._isNodeExternallyAdmissionReady(node),
          currentInFlight: this._getNodeInFlight(healthKey),
          dispatchMaxInFlight,
          capacityContributionMaxInFlight: this._nodeMaxInFlight,
          oldestInFlightStartedAtMs:
            this._getOldestNodeInFlightStartedAtMs(healthKey),
          queryTimeoutMs: this._queryTimeoutMs,
          admissionBackoffMs: this._admissionBackoffMs,
        }),
      );
    }

    _resolveAvailabilityWaitReason(availability) {
      switch (availability?.state) {
      case LOAD_NODE_AVAILABILITY_STATE.LOCAL_BLOCKED:
      case LOAD_NODE_AVAILABILITY_STATE.EXTERNAL_BLOCKED:
        return WAIT_REASON_NODE_ADMISSION_BLOCKED;
      case LOAD_NODE_AVAILABILITY_STATE.SLOT_SATURATED:
      case LOAD_NODE_AVAILABILITY_STATE.SLOT_STALLED:
        return WAIT_REASON_NODE_SLOT_UNAVAILABLE;
      default:
        return null;
      }
    }

    _resolveEffectiveNodeMaxInFlight(nowMs) {
      const availableNodeCount = this._availableNodes.length;
      if (availableNodeCount <= ZERO) {
        return this._nodeMaxInFlight;
      }
      const effectiveMaxInFlight = this._resolveEffectiveMaxInFlight();
      const dispatchReadyNodeCount = this._countCapacityContributingNodes(nowMs);
      if (dispatchReadyNodeCount <= ZERO ||
          dispatchReadyNodeCount >= availableNodeCount) {
        return this._nodeMaxInFlight;
      }
      const dynamicCap = Math.max(
        ONE,
        Math.ceil(effectiveMaxInFlight / dispatchReadyNodeCount),
      );
      return Math.max(this._nodeMaxInFlight, dynamicCap);
    }

    _tryAcquireNodeSlot(healthKey, nowMs = Date.now()) {
      const current = this._getNodeInFlight(healthKey);
      const effectiveNodeMaxInFlight =
        this._resolveEffectiveNodeMaxInFlight(nowMs);
      if (current >= effectiveNodeMaxInFlight) {
        return null;
      }
      const nextTokenId = this._nextNodeInFlightTokenId;
      this._nextNodeInFlightTokenId += ONE;
      const nextToken = {
        tokenId: nextTokenId,
        startedAtMs: nowMs,
      };
      const tokens = this._getNodeInFlightTokens(healthKey);
      this._nodeInFlightTokensByKey.set(
        healthKey,
        tokens.concat(nextToken),
      );
      this._nodeInFlightByKey.set(healthKey, current + ONE);
      return {
        healthKey,
        tokenId: nextTokenId,
      };
    }

    _releaseNodeSlot(slotReservation) {
      const healthKey = String(slotReservation?.healthKey || '');
      if (healthKey.length <= ZERO) {
        return;
      }
      const current = this._getNodeInFlight(healthKey);
      if (current <= ZERO) {
        this._nodeInFlightByKey.set(healthKey, ZERO);
        this._nodeInFlightTokensByKey.set(healthKey, []);
        return;
      }
      const tokenId = Number(slotReservation?.tokenId);
      const nextTokens = Number.isFinite(tokenId) ?
        this._getNodeInFlightTokens(healthKey)
          .filter((token) => Number(token?.tokenId) !== tokenId) :
        this._getNodeInFlightTokens(healthKey).slice(ONE);
      this._nodeInFlightTokensByKey.set(healthKey, nextTokens);
      this._nodeInFlightByKey.set(healthKey, current - ONE);
    }

    _recordNodeDispatchAttempt(healthKey) {
      const nodeMetrics = this._nodeMetricsByKey.get(healthKey);
      if (!nodeMetrics) {
        return;
      }
      nodeMetrics.dispatched += ONE;
    }

    _recordNodeQueuePressure(healthKey) {
      const nodeMetrics = this._nodeMetricsByKey.get(healthKey);
      if (!nodeMetrics) {
        return;
      }
      nodeMetrics.queuePressureSignals += ONE;
    }

    _recordNodeAttemptFailure(healthKey, error) {
      const nodeMetrics = this._nodeMetricsByKey.get(healthKey);
      if (!nodeMetrics) {
        return;
      }
      nodeMetrics.attemptErrors += ONE;
      if (this._isAdmissionSignalError(error)) {
        nodeMetrics.admissionSignals += ONE;
      }
    }

    _recordNodeSuccess(healthKey) {
      const state = this._nodeHealthByKey.get(healthKey);
      if (!state) {
        return;
      }
      const nodeMetrics = this._nodeMetricsByKey.get(healthKey);
      if (nodeMetrics) {
        nodeMetrics.success += ONE;
      }
      state.admissionBlockedUntilMs = ZERO;
      if (state.localBreakerOwner === NODE_BREAKER_OWNER_NODE_CLIENT) {
        return;
      }
      state.consecutiveFailures = ZERO;
      state.openUntilMs = ZERO;
    }

    _recordAcknowledgedWrite(idValue) {
      if (this._trackAcknowledgedWrites !== true) {
        return;
      }
      const normalizedId = typeof idValue === 'string' &&
        idValue.length > ZERO ?
        idValue :
        null;
      if (!normalizedId || this._acknowledgedWriteIdSet.has(normalizedId)) {
        return;
      }
      this._acknowledgedWriteIdSet.add(normalizedId);
      this._acknowledgedWriteIds.push(normalizedId);
    }

    _recordNodeFailure(healthKey, error) {
      const state = this._nodeHealthByKey.get(healthKey);
      if (!state) {
        return;
      }
      if (this._shouldBackoffNodeAfterTransientFailure(error)) {
        state.admissionBlockedUntilMs =
          Date.now() + this._resolveAdmissionBackoffMs(state, error);
      }
      if (state.localBreakerOwner === NODE_BREAKER_OWNER_NODE_CLIENT) {
        return;
      }
      state.consecutiveFailures += ONE;
      if (state.consecutiveFailures < this._nodeFailureThreshold) {
        return;
      }
      state.consecutiveFailures = ZERO;
      state.openUntilMs = Date.now() + this._nodeFailureCooldownMs;
    }

    _recordWaitReason(reason, healthKey = null, count = ONE) {
      const increment = Number.isFinite(count) ?
        Math.max(ZERO, Math.floor(count)) :
        ZERO;
      if (increment <= ZERO) {
        return;
      }
      if (!Object.hasOwn(this._waitReasons, reason)) {
        this._waitReasons[reason] = ZERO;
      }
      this._waitReasons[reason] += increment;
      if (healthKey === null) {
        return;
      }
      const nodeMetrics = this._nodeMetricsByKey.get(healthKey);
      if (!nodeMetrics) {
        return;
      }
      if (!nodeMetrics.waitReasons ||
          typeof nodeMetrics.waitReasons !== 'object') {
        nodeMetrics.waitReasons = createWaitReasonCounters();
      }
      if (!Object.hasOwn(nodeMetrics.waitReasons, reason)) {
        nodeMetrics.waitReasons[reason] = ZERO;
      }
      nodeMetrics.waitReasons[reason] += increment;
    }

    _resolveAdmissionBackoffMs(state, error) {
      let backoffMs = this._admissionBackoffMs;
      if (this._isRetryableControlPlanePressureError(error)) {
        backoffMs = Math.max(
          backoffMs,
          getControlPlaneRetryAfterMs(error),
        );
      }
      if (isTimeoutShapedError(error)) {
        backoffMs = Math.max(backoffMs, this._queryTimeoutMs);
      }
      if (state?.localBreakerOwner === NODE_BREAKER_OWNER_NODE_CLIENT &&
          this._isCircuitOpenAdmissionError(error)) {
        backoffMs = Math.max(backoffMs, this._nodeFailureCooldownMs);
      }
      return backoffMs;
    }

    _shouldBackoffNodeAfterTransientFailure(error) {
      return this._isAdmissionSignalError(error) || isTimeoutShapedError(error);
    }

    _isNodeExternallyAdmissionReady(node) {
      if (!node || typeof node !== 'object') {
        return true;
      }
      try {
        if (typeof node.isLoadAdmissionReady === 'function') {
          return node.isLoadAdmissionReady() !== false;
        }
        if (typeof node.getLastReachabilityDiagnostics === 'function') {
          const diagnostics = node.getLastReachabilityDiagnostics();
          if (diagnostics && typeof diagnostics === 'object') {
            const capturedAtMs = Number(
              diagnostics.timestamp ?? diagnostics.capturedAtMs,
            );
            const diagnosticsAgeMs =
              Number.isFinite(capturedAtMs) ?
                Math.max(ZERO, Date.now() - capturedAtMs) :
                ZERO;
            const diagnosticsFresh =
              diagnosticsAgeMs <= this._externalAdmissionDiagnosticsMaxAgeMs;
            if (diagnosticsFresh &&
                (diagnostics.adminReady === false ||
                  diagnostics.reachable === false)) {
              return false;
            }
          }
        }
      } catch (_error) {
        return false;
      }
      return node.loadAdmissionReady !== false;
    }

    _isAdmissionSignalError(error) {
      const code = String(error?.code || '').toLowerCase();
      if (code === NODE_CLIENT_ADMISSION_ERROR_CIRCUIT_OPEN ||
          code === NODE_CLIENT_ADMISSION_ERROR_BUDGET_EXHAUSTED ||
          code === NODE_CLIENT_ADMISSION_ERROR_ROUTING_NOT_READY) {
        return true;
      }
      if (this._isRetryableControlPlanePressureError(error)) {
        return true;
      }
      const message = String(error?.message || '').toLowerCase();
      return message.includes('circuit breaker is open') ||
        message.includes('query_admission_deferred') ||
        message.includes('query_admission_rejected') ||
        message.includes('routing not ready') ||
        message.includes('serve not ready') ||
        message.includes('load lane admission denied') ||
        (
          message.includes('on lane ' + ADMIN_LANE_LOAD) &&
          (
            message.includes(LOAD_LANE_TRANSIENT_TIMEOUT_FRAGMENT) ||
            message.includes(LOAD_LANE_TRANSIENT_CONNECTION_FRAGMENT)
          )
        );
    }

    _isRetryableControlPlanePressureError(error) {
      if (error?.deferRetry === true) {
        return true;
      }
      if (getControlPlaneRetryAfterMs(error) > ZERO) {
        return true;
      }
      return isRetryableControlPlaneError(error);
    }

    _isCircuitOpenAdmissionError(error) {
      const code = String(error?.code || '').toLowerCase();
      if (code === NODE_CLIENT_ADMISSION_ERROR_CIRCUIT_OPEN) {
        return true;
      }
      const message = String(error?.message || '').toLowerCase();
      return message.includes('circuit breaker is open');
    }

    _resolveNodeBlockedUntilMs(state) {
      if (!state) {
        return ZERO;
      }
      if (state.localBreakerOwner === NODE_BREAKER_OWNER_NODE_CLIENT) {
        return Number(state.admissionBlockedUntilMs || ZERO);
      }
      return Math.max(
        Number(state.openUntilMs || ZERO),
        Number(state.admissionBlockedUntilMs || ZERO),
      );
    }

    _isNodeDispatchReady(state, nowMs) {
      return this._resolveNodeBlockedUntilMs(state) <= nowMs;
    }

    /**
     * Capture a distinct error message for diagnostics.
     * @param {Error} err
     * @private
     */
    _captureErrorMessage(err) {
      if (this._distinctErrorSet.size >= MAX_DISTINCT_ERROR_MESSAGES) {
        return;
      }
      const message = String(err?.message || err || 'unknown');
      if (this._distinctErrorSet.has(message)) {
        return;
      }
      this._distinctErrorSet.add(message);
      this._distinctErrors.push(message);
    }

    /**
     * Finish the load run.
     */
    _finish(force = false) {
      if (this._completedMetrics) {
        return;
      }
      this._clearDispatchTimer();
      if (this._durationTimeoutId !== null) {
        clearTimeout(this._durationTimeoutId);
        this._durationTimeoutId = null;
      }
      if (!force && this._inFlight > ZERO) {
        this._scheduleDrainCheck();
        return;
      }

      this._clearDrainTimer();
      this._completedMetrics = this._computeCurrentMetrics();

      if (this._resolveComplete) {
        this._resolveComplete(this._completedMetrics);
        this._resolveComplete = null;
      }
    }

    /**
     * Schedule the next in-flight drain check.
     * @private
     */
    _scheduleDrainCheck() {
      if (this._drainTimerId !== null) {
        return;
      }
      this._drainTimerId = setTimeout(() => {
        this._drainTimerId = null;
        this._finish();
      }, DRAIN_WAIT_MS);
      if (typeof this._drainTimerId.unref === 'function') {
        this._drainTimerId.unref();
      }
    }

    /**
     * Clear pending in-flight drain checks.
     * @private
     */
    _clearDrainTimer() {
      if (this._drainTimerId !== null) {
        clearTimeout(this._drainTimerId);
        this._drainTimerId = null;
      }
    }

    /**
     * Build current metrics snapshot.
     * @returns {Object}
     * @private
     */
    _buildDispatchAccounting() {
      const targetOperations = Math.max(ZERO, this._targetOperationCount);
      const dispatchedOperations = Math.max(ZERO, this._dispatchedOperationCount);
      const rejectedOperations = Math.max(ZERO, this._rejectedOperations);
      const undispatchedOperations = Math.max(
        ZERO,
        targetOperations - dispatchedOperations - rejectedOperations,
      );
      const undispatchedByReason = {
        [UNDISPATCHED_REASON_CAPACITY]: ZERO,
        [UNDISPATCHED_REASON_DURATION_TIMEOUT]: ZERO,
        [UNDISPATCHED_REASON_CANCELLED]: ZERO,
      };
      if (undispatchedOperations > ZERO) {
        if (this._dispatchStoppedBy === DISPATCH_STOP_REASON_CANCELLED) {
          undispatchedByReason[UNDISPATCHED_REASON_CANCELLED] =
            undispatchedOperations;
        } else {
          undispatchedByReason[UNDISPATCHED_REASON_CAPACITY] =
            undispatchedOperations;
          if (this._dispatchStoppedBy === DISPATCH_STOP_REASON_DURATION) {
            undispatchedByReason[UNDISPATCHED_REASON_DURATION_TIMEOUT] =
              undispatchedOperations;
          }
        }
      }
      return {
        targetOperations,
        dispatchedOperations,
        undispatchedOperations,
        undispatchedByReason,
      };
    }

    _buildPerNodeMetricsSummary() {
      const summary = {};
      for (const nodeMetrics of this._nodeMetricsByKey.values()) {
        const nodeId = String(nodeMetrics?.nodeId || 'unknown');
        if (!summary[nodeId]) {
          summary[nodeId] = {
            dispatched: ZERO,
            success: ZERO,
            attemptErrors: ZERO,
            admissionSignals: ZERO,
            queuePressureSignals: ZERO,
            waitReasons: createWaitReasonCounters(),
            rejected: ZERO,
            rejectedByReason: {
              [REJECTED_REASON_QUEUE_FULL]: ZERO,
              [REJECTED_REASON_FLOW_CONTROL]: ZERO,
            },
          };
        }
        summary[nodeId].dispatched += Number(nodeMetrics?.dispatched || ZERO);
        summary[nodeId].success += Number(nodeMetrics?.success || ZERO);
        summary[nodeId].attemptErrors += Number(nodeMetrics?.attemptErrors || ZERO);
        summary[nodeId].admissionSignals += Number(
          nodeMetrics?.admissionSignals || ZERO,
        );
        summary[nodeId].queuePressureSignals += Number(
          nodeMetrics?.queuePressureSignals || ZERO,
        );
        const waitReasons = nodeMetrics?.waitReasons &&
          typeof nodeMetrics.waitReasons === 'object' ?
          nodeMetrics.waitReasons :
          createWaitReasonCounters();
        for (const [reason, count] of Object.entries(waitReasons)) {
          if (!Object.hasOwn(summary[nodeId].waitReasons, reason)) {
            summary[nodeId].waitReasons[reason] = ZERO;
          }
          summary[nodeId].waitReasons[reason] += Number(count || ZERO);
        }
        summary[nodeId].rejected += Number(nodeMetrics?.rejected || ZERO);
        const rejectedByReason = nodeMetrics?.rejectedByReason &&
          typeof nodeMetrics.rejectedByReason === 'object' ?
          nodeMetrics.rejectedByReason :
          {
            [REJECTED_REASON_QUEUE_FULL]: ZERO,
            [REJECTED_REASON_FLOW_CONTROL]: ZERO,
          };
        for (const [reason, count] of Object.entries(rejectedByReason)) {
          if (!Object.hasOwn(summary[nodeId].rejectedByReason, reason)) {
            summary[nodeId].rejectedByReason[reason] = ZERO;
          }
          summary[nodeId].rejectedByReason[reason] += Number(count || ZERO);
        }
      }
      return summary;
    }

    _buildQueuePressureSummary() {
      const sampleCount = this._pendingQueueDepthSamples.length;
      if (sampleCount === ZERO) {
        return {
          samples: ZERO,
          pendingQueueDepth: {
            avg: ZERO,
            p95: ZERO,
            p99: ZERO,
            max: ZERO,
          },
        };
      }
      const sortedDepth = [...this._pendingQueueDepthSamples].sort((a, b) => a - b);
      return {
        samples: sampleCount,
        pendingQueueDepth: {
          avg: sortedDepth.reduce((sum, value) => sum + value, ZERO) / sampleCount,
          p95: percentile(sortedDepth, PERCENTILE_P95),
          p99: percentile(sortedDepth, PERCENTILE_P99),
          max: sortedDepth[sortedDepth.length - ONE],
        },
      };
    }

    _buildWaitReasonSummary() {
      return {
        ...createWaitReasonCounters(),
        ...this._waitReasons,
      };
    }

    _buildDispatchGuardrailSummary() {
      const state = this._adaptiveDispatchGuardrail;
      if (!state || state.enabled !== true) {
        return null;
      }
      return {
        enabled: true,
        configuredMaxInFlight: this._maxInFlight,
        currentEffectiveMaxInFlight: this._resolveEffectiveMaxInFlight(),
        minEffectiveMaxInFlight: Number(
          state.minEffectiveMaxInFlight || this._maxInFlight,
        ),
        configuredDispatchIntervalMs: this._dispatchIntervalMs,
        currentEffectiveDispatchIntervalMs:
          this._resolveEffectiveDispatchIntervalMs(),
        maxEffectiveDispatchIntervalMs: Number(
          state.maxEffectiveDispatchIntervalMs || this._dispatchIntervalMs,
        ),
        pressureScore: Number(state.pressureScore || ZERO),
        pressureSignalThreshold: state.pressureSignalThreshold,
        queueDepthThreshold: state.queueDepthThreshold,
        reductionStepRatio: state.reductionStepRatio,
        minMaxInFlight: state.minMaxInFlight,
        recoveryQuietTicks: state.recoveryQuietTicks,
        engagedTransitions: Number(state.engagedTransitions || ZERO),
        recoveryTransitions: Number(state.recoveryTransitions || ZERO),
        maxPressureSignalsDelta: Number(state.maxPressureSignalsDelta || ZERO),
        maxPendingQueueDepth: Number(state.maxPendingQueueDepth || ZERO),
      };
    }

    _computeCurrentMetrics() {
      const elapsed = this._startTime ?
        Date.now() - this._startTime :
        ZERO;
      const dispatchAccounting = this._buildDispatchAccounting();
      const perNodeMetrics = this._buildPerNodeMetricsSummary();
      const rejectedAccounting = {
        rejectedOperations: this._rejectedOperations,
        rejectedByReason: {
          ...this._rejectedByReason,
        },
      };
      const queuePressureSummary = this._buildQueuePressureSummary();
      const waitReasonSummary = this._buildWaitReasonSummary();
      const dispatchGuardrailSummary = this._buildDispatchGuardrailSummary();
      const metrics = computeMetrics(
        this._latencies,
        this._successCount,
        this._failedCount,
        this._operationErrorCount,
        elapsed,
        this._distinctErrors,
        this._attemptErrorCount,
        this._queueDelaySamples,
        dispatchAccounting,
        perNodeMetrics,
        rejectedAccounting,
        queuePressureSummary,
        waitReasonSummary,
        dispatchGuardrailSummary,
      );
      metrics.suppressedRetrySafeAttemptErrors = Math.max(
        ZERO,
        this._suppressedRetrySafeAttemptErrorCount,
      );
      metrics.suppressedRetrySafeTimeoutWaits = Math.max(
        ZERO,
        this._suppressedRetrySafeTimeoutWaitCount,
      );
      metrics.nonAdmissionAttemptErrors = Math.max(
        ZERO,
        Number(metrics.nonAdmissionAttemptErrors || ZERO) -
          metrics.suppressedRetrySafeAttemptErrors,
      );
      metrics.nonAdmissionTimeoutWaits = Math.max(
        ZERO,
        Number(metrics?.waitReasons?.[WAIT_REASON_TIMEOUT_WAITS] || ZERO) -
          metrics.suppressedRetrySafeTimeoutWaits,
      );
      return metrics;
    }

    /**
     * Wait for the load run to complete. Req 6.4
     * @returns {Promise<Object>} Final metrics
     */
    async waitComplete() {
      if (!this._completePromise) {
        return this.getMetrics();
      }
      return this._completePromise;
    }

    /**
     * Get current metrics snapshot. Req 6.3
     * @returns {Object} Metrics
     */
    getMetrics() {
      if (this._completedMetrics) {
        return this._completedMetrics;
      }
      return this._computeCurrentMetrics();
    }

    /**
     * Return acknowledged INSERT identifiers captured during this run.
     * @returns {{tableName: string, idColumn: string, ids: string[]}|null}
     */
    getAcknowledgedWrites() {
      if (this._trackAcknowledgedWrites !== true) {
        return null;
      }
      return {
        tableName: this._tableName,
        idColumn: this._acknowledgedWriteIdColumn,
        ids: [...this._acknowledgedWriteIds],
      };
    }

    /**
     * Cancel the load run early.
     */
    cancel() {
      this._cancelled = true;
      this._schedulingStopped = true;
      this._dispatchStoppedBy = DISPATCH_STOP_REASON_CANCELLED;
      this._finish(true);
    }
  }

  const loadRunRuntimeMethods = Object.getOwnPropertyNames(
    LoadRunRuntimeMethods.prototype,
  )
    .filter((name) => name !== 'constructor')
    .reduce((accumulator, name) => {
      accumulator[name] = LoadRunRuntimeMethods.prototype[name];
      return accumulator;
    }, {});

  return {
    parseDuration,
    normalizeTableName,
    createWaitReasonCounters,
    normalizePositiveInteger,
    normalizeRatio,
    computeMetrics,
    loadRunRuntimeMethods,
  };
}

export {createLoadGeneratorRuntimeBundle};
