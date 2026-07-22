import {TIME_MS} from '../constants/index.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_MUTATION_OUTCOME,
} from '../control-plane/control-plane-system-table-gateway.js';
import {createControlPlaneRuntimeBundle} from
  '../control-plane/control-plane-runtime-bundle.js';


const CACHE_VISIBILITY_ERROR_FRAGMENT = 'Cache update not observed';
const AUTHORITATIVE_ROW_MUTATION_REASON = Object.freeze({
  APPLIED: 'applied',
  AUTHORITATIVE_CONFIRM_UNAVAILABLE: 'authoritative-confirm-unavailable',
  AUTHORITATIVE_WRITE_FAILED: 'authoritative-write-failed',
  CACHE_VISIBILITY_GAP_RECOVERED: 'cache-visibility-gap-recovered',
  CACHE_VISIBILITY_GAP_UNRECOVERED: 'cache-visibility-gap-unrecovered',
  DEFERRED: 'deferred',
  IN_FLIGHT: 'in-flight',
  NOOP: 'noop',
  OBSERVED_STATE_CHANGED: 'observed-state-changed',
  OWNER_NOT_READY: 'owner-not-ready',
  REJECTED: 'rejected',
  SKIPPED: 'skipped',
});
const AUTHORITATIVE_ROW_MUTATION_ERROR_MSG = Object.freeze({
  MISSING_BUILD_UPDATE_DATA:
    'AuthoritativeRowMutationHelper requires buildUpdateData',
  MISSING_BUILD_WHERE_CLAUSE:
    'AuthoritativeRowMutationHelper requires buildWhereClause',
  MISSING_READ_VALUE_FROM_CACHE:
    'AuthoritativeRowMutationHelper requires readValueFromCache',
  MISSING_TABLE_NAME: 'AuthoritativeRowMutationHelper requires tableName',
});
const AUTHORITATIVE_ROW_MUTATION_RETRY = Object.freeze({
  BACKOFF_MULTIPLIER: 2,
  MAX_DELAY_MS: TIME_MS.SECOND * 30,
});

function extractAffectedRows(result) {
  const candidate = Number(
    result?.partitionResult?.affectedRows ?? result?.affectedRows,
  );
  return Number.isFinite(candidate) ? candidate : null;
}

function classifyMutationFailure(error) {
  const message = error?.message || '';
  if (message.includes(CACHE_VISIBILITY_ERROR_FRAGMENT)) {
    return AUTHORITATIVE_ROW_MUTATION_REASON.CACHE_VISIBILITY_GAP_UNRECOVERED;
  }
  return AUTHORITATIVE_ROW_MUTATION_REASON.AUTHORITATIVE_WRITE_FAILED;
}

function classifyGatewayMutationOutcome(result) {
  if (result?.outcome === CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED) {
    return AUTHORITATIVE_ROW_MUTATION_REASON.DEFERRED;
  }
  if (result?.outcome === CONTROL_PLANE_MUTATION_OUTCOME.REJECTED) {
    return AUTHORITATIVE_ROW_MUTATION_REASON.REJECTED;
  }
  if (result?.outcome === CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY) {
    return AUTHORITATIVE_ROW_MUTATION_REASON.OWNER_NOT_READY;
  }
  if (result?.outcome === CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED) {
    return AUTHORITATIVE_ROW_MUTATION_REASON.OBSERVED_STATE_CHANGED;
  }
  return null;
}

function validateMutationHelperOptions(options) {
  if (!options.tableName) {
    throw new Error(AUTHORITATIVE_ROW_MUTATION_ERROR_MSG.MISSING_TABLE_NAME);
  }
  if (typeof options.buildWhereClause !== 'function') {
    throw new Error(
      AUTHORITATIVE_ROW_MUTATION_ERROR_MSG.MISSING_BUILD_WHERE_CLAUSE,
    );
  }
  if (typeof options.buildUpdateData !== 'function') {
    throw new Error(
      AUTHORITATIVE_ROW_MUTATION_ERROR_MSG.MISSING_BUILD_UPDATE_DATA,
    );
  }
  if (typeof options.readValueFromCache !== 'function') {
    throw new Error(
      AUTHORITATIVE_ROW_MUTATION_ERROR_MSG.MISSING_READ_VALUE_FROM_CACHE,
    );
  }
}

function normalizeRetryBackoffMultiplier(value) {
  if (Number.isFinite(value) && value >= 1) {
    return value;
  }
  return AUTHORITATIVE_ROW_MUTATION_RETRY.BACKOFF_MULTIPLIER;
}

function normalizeMaxRetryDelayMs(value) {
  if (Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return AUTHORITATIVE_ROW_MUTATION_RETRY.MAX_DELAY_MS;
}

function optionalFunction(value) {
  return typeof value === 'function' ? value : null;
}

function withDefault(value, fallback) {
  return value === undefined ? fallback : value;
}

class AuthoritativeRowMutationHelper {
  constructor(options = {}) {
    const {
      tableName,
      buildWhereClause,
      buildUpdateData,
      buildUpdateOptions,
      readValueFromCache,
      readRowFromCache,
      buildExpectedCacheFields,
      isWriteReady,
      prepareFlush,
      retryDelayMs,
      retryBackoffMultiplier,
      maxRetryDelayMs,
      cdcIntegrationService,
      controlPlaneSystemTableGateway,
      nodeId,
      messageRouter,
      systemTableCache,
      refreshObservedRow,
      readAuthoritativeRow,
      onObservedStateChanged,
      onAsyncError,
      now,
      setTimeoutFn,
      clearTimeoutFn,
    } = options;

    validateMutationHelperOptions({
      tableName,
      buildWhereClause,
      buildUpdateData,
      readValueFromCache,
    });

    this.tableName = tableName;
    this.buildWhereClause = buildWhereClause;
    this.buildUpdateData = buildUpdateData;
    this.buildUpdateOptions = withDefault(buildUpdateOptions, () => ({}));
    this.readValueFromCache = readValueFromCache;
    this.readRowFromCache = withDefault(readRowFromCache, null);
    this.buildExpectedCacheFields = withDefault(
      buildExpectedCacheFields,
      null,
    );
    this.isWriteReady = withDefault(isWriteReady, () => true);
    this.prepareFlush = withDefault(prepareFlush, () => ({skip: false}));
    this.retryDelayMs = withDefault(retryDelayMs, TIME_MS.SECOND);
    this.retryBackoffMultiplier =
      normalizeRetryBackoffMultiplier(withDefault(
        retryBackoffMultiplier,
        AUTHORITATIVE_ROW_MUTATION_RETRY.BACKOFF_MULTIPLIER,
      ));
    this.maxRetryDelayMs = normalizeMaxRetryDelayMs(withDefault(
      maxRetryDelayMs,
      AUTHORITATIVE_ROW_MUTATION_RETRY.MAX_DELAY_MS,
    ));
    this.cdcIntegrationService = withDefault(cdcIntegrationService, null);
    this.controlPlaneSystemTableGateway = withDefault(
      controlPlaneSystemTableGateway,
      null,
    );
    this.nodeId = withDefault(nodeId, null);
    this.messageRouter = withDefault(messageRouter, null);
    this.systemTableCache = withDefault(systemTableCache, null);
    this.refreshObservedRow = optionalFunction(refreshObservedRow);
    this.readAuthoritativeRow = optionalFunction(readAuthoritativeRow);
    this.onObservedStateChanged = withDefault(
      onObservedStateChanged,
      () => {},
    );
    this.onAsyncError = withDefault(onAsyncError, () => {});
    this.now = withDefault(now, () => Date.now());
    this.setTimeoutFn = withDefault(setTimeoutFn, setTimeout);
    this.clearTimeoutFn = withDefault(clearTimeoutFn, clearTimeout);

    this.pendingValue = null;
    this.persistedValue = null;
    this.inFlight = false;
    this.retryTimer = null;
    this.retryAttemptCount = 0;
    this.followUpFlushScheduled = false;
    this.shuttingDown = false;
  }

  setSystemTableCache(systemTableCache) {
    this.systemTableCache = systemTableCache;
  }

  setCdcIntegrationService(cdcIntegrationService) {
    const dependencyBecameAvailable =
      !this.cdcIntegrationService && Boolean(cdcIntegrationService);
    this.cdcIntegrationService = cdcIntegrationService;
    if (
      dependencyBecameAvailable &&
      !this.retryTimer
    ) {
      this.scheduleFollowUpFlush();
    }
  }

  setControlPlaneSystemTableGateway(controlPlaneSystemTableGateway) {
    this.controlPlaneSystemTableGateway = controlPlaneSystemTableGateway || null;
  }

  queue(value) {
    if (this.shuttingDown) {
      return;
    }
    if (!value || value === this.persistedValue) {
      return;
    }

    this.pendingValue = value;
    if (!this.cdcIntegrationService) {
      return;
    }
    if (this.inFlight) {
      this.scheduleFollowUpFlush();
      return;
    }

    this.flush().catch((error) => {
      this.onAsyncError(error, {value, retry: false});
    });
  }

  syncFromCache() {
    const cachedValue = this.readValueFromCache(this.systemTableCache);
    if (!cachedValue) {
      return false;
    }

    this.persistedValue = cachedValue;
    if (this.pendingValue === cachedValue) {
      this.pendingValue = null;
      return true;
    }
    return false;
  }

  async flush() {
    const admissionResult = this.resolveFlushAdmission();
    if (admissionResult) {
      return admissionResult;
    }
    return this.executeFlush();
  }

  resolveFlushAdmission() {
    if (this.shuttingDown) {
      return this.buildResult({
        cacheVisible: this.pendingValue === null,
        reason: AUTHORITATIVE_ROW_MUTATION_REASON.SKIPPED,
      });
    }
    if (this.inFlight) {
      return this.buildResult({
        reason: AUTHORITATIVE_ROW_MUTATION_REASON.IN_FLIGHT,
      });
    }

    // Cache-equality dedup (syncFromCache) treats a merged-cache row equal to
    // the pending value as proof of durable persistence. That proof is FALSE
    // when the row was locally seeded (CL-035 voter-ready seed): the durable
    // write silently drops and the actual never lands (affinity-demo run-27,
    // quest formation-ledger-post-spread-voter-visibility-latency). Helpers
    // that supply readAuthoritativeRow therefore skip the cache dedup here
    // and confirm against the authoritative row inside the flush instead;
    // helpers without the capability (e.g. wasm transport shims) keep the
    // legacy dedup unchanged.
    const recoveredFromCacheGap =
      this.readAuthoritativeRow ? false : this.syncFromCache();
    const preparedResult = this.resolvePreparedFlush(recoveredFromCacheGap);
    if (preparedResult) {
      return preparedResult;
    }
    return this.resolveFlushReadiness(recoveredFromCacheGap);
  }

  resolvePreparedFlush(recoveredFromCacheGap) {
    const prepareResult = this.prepareFlush({
      pendingValue: this.pendingValue,
      persistedValue: this.persistedValue,
    }) || {skip: false};

    if (prepareResult.clearPending) {
      this.pendingValue = null;
    }

    if (!prepareResult.skip) {
      return null;
    }
    if (!prepareResult.clearPending && prepareResult.retry === true) {
      this.scheduleRetry(prepareResult.retryDelayMs);
    }
    return this.buildResult({
      cacheVisible: this.pendingValue === null,
      recoveredFromCacheGap,
      reason:
        prepareResult.reason || AUTHORITATIVE_ROW_MUTATION_REASON.SKIPPED,
    });
  }

  resolveFlushReadiness(recoveredFromCacheGap) {
    const noMutationAvailable =
      !this.cdcIntegrationService ||
      !this.pendingValue ||
      this.pendingValue === this.persistedValue;
    if (noMutationAvailable) {
      if (this.pendingValue === null ||
          this.pendingValue === this.persistedValue) {
        this.retryAttemptCount = 0;
      }
      return this.buildResult({
        cacheVisible: this.pendingValue === null,
        recoveredFromCacheGap,
        reason: recoveredFromCacheGap ?
          AUTHORITATIVE_ROW_MUTATION_REASON.CACHE_VISIBILITY_GAP_RECOVERED :
          AUTHORITATIVE_ROW_MUTATION_REASON.NOOP,
      });
    }

    if (this.isWriteReady()) {
      return null;
    }
    this.scheduleRetry();
    return this.buildResult({
      recoveredFromCacheGap,
      reason: AUTHORITATIVE_ROW_MUTATION_REASON.OWNER_NOT_READY,
    });
  }

  async executeFlush() {
    this.inFlight = true;
    let writeSucceeded = false;
    const value = this.pendingValue;
    try {
      const authoritativeProbe =
        await this.resolveAuthoritativeProbe(value);
      if (authoritativeProbe.settled) {
        return authoritativeProbe.result;
      }
      const ownershipResult = this.resolvePreMutationOwnership(value);
      if (ownershipResult) {
        return ownershipResult;
      }
      const submission = this.buildMutationSubmission(
        value,
        authoritativeProbe.row,
      );
      const partitionResult = await this.getControlPlaneSystemTableGateway()
        .submitMutation(submission.mutation, submission.options);
      const failureResult =
        await this.resolveMutationFailure(value, partitionResult);
      if (failureResult) {
        return failureResult;
      }

      writeSucceeded = true;
      return this.recordAppliedMutation(value, partitionResult);
    } catch (error) {
      this.decorateFlushError(error);
      throw error;
    } finally {
      this.completeFlush(writeSucceeded);
    }
  }

  async resolveAuthoritativeProbe(value) {
    if (!this.readAuthoritativeRow) {
      return {settled: false, row: null};
    }
    return this.probeAuthoritativeRow(value);
  }

  resolvePreMutationOwnership(value) {
    // Ownership/readiness can change while the authoritative point read is
    // in flight. Re-run the same owner predicate immediately before submit
    // so a demoted leader cannot publish a stale owner row after losing Raft
    // authority. Helpers with an unconditional prepareFlush remain unchanged.
    const preMutationResult = this.prepareFlush({
      pendingValue: this.pendingValue,
      persistedValue: this.persistedValue,
      phase: 'pre-mutation',
    }) || {skip: false};
    if (preMutationResult.clearPending && this.pendingValue === value) {
      this.pendingValue = null;
    }
    if (!preMutationResult.skip) {
      return null;
    }
    if (!preMutationResult.clearPending &&
      preMutationResult.retry === true) {
      this.scheduleRetry(preMutationResult.retryDelayMs);
    }
    return this.buildResult({
      reason:
        preMutationResult.reason ||
        AUTHORITATIVE_ROW_MUTATION_REASON.SKIPPED,
    });
  }

  buildMutationSubmission(value, authoritativeRow) {
    const updateData = this.buildUpdateData(value, this.now());
    const cachedRow = optionalFunction(this.readRowFromCache) ?
      this.readRowFromCache(this.systemTableCache) :
      null;
    const mutationContext = {
      cachedRow,
      // The CAS guard must come from the authoritative row when one was
      // observed: the merged cache row can be locally seeded NEWER than the
      // durable row (stale-guard protected), so guarding on it zero-rows
      // forever — permanent retry spin with the write never landing.
      authoritativeRow,
      persistedValue: this.persistedValue,
    };
    const updateOptionsCandidate = optionalFunction(
      this.buildUpdateOptions,
    )?.(value, updateData, mutationContext) || null;
    const updateOptions = updateOptionsCandidate &&
      typeof updateOptionsCandidate === 'object' ?
      updateOptionsCandidate :
      {};
    const expectedCacheFields = optionalFunction(
      this.buildExpectedCacheFields,
    )?.(value, updateData) || null;
    return {
      mutation: {
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName: this.tableName,
        whereClause: this.buildWhereClause(value, mutationContext),
        data: updateData,
      },
      options: {
        ...updateOptions,
        ...(expectedCacheFields ? {expectedCacheFields} : {}),
      },
    };
  }

  async resolveMutationFailure(value, partitionResult) {
    const gatewayFailureReason = classifyGatewayMutationOutcome(
      partitionResult,
    );
    if (partitionResult?.success === false && gatewayFailureReason) {
      return this.resolveGatewayFailure(
        value,
        partitionResult,
        gatewayFailureReason,
      );
    }
    const affectedRows = extractAffectedRows(partitionResult);
    const observedStateChanged =
      gatewayFailureReason ===
        AUTHORITATIVE_ROW_MUTATION_REASON.OBSERVED_STATE_CHANGED ||
      (affectedRows !== null && affectedRows <= 0);
    if (!observedStateChanged) {
      return null;
    }
    await this.recoverFromObservedStateChanged(value, partitionResult);
    this.scheduleRetry();
    return this.buildResult({
      attempts: 1,
      partitionResult,
      reason: AUTHORITATIVE_ROW_MUTATION_REASON.OBSERVED_STATE_CHANGED,
    });
  }

  async resolveGatewayFailure(value, partitionResult, reason) {
    if (reason === AUTHORITATIVE_ROW_MUTATION_REASON.OBSERVED_STATE_CHANGED) {
      await this.recoverFromObservedStateChanged(value, partitionResult);
    }
    this.scheduleRetry(partitionResult?.retryAfterMs);
    return this.buildResult({attempts: 1, partitionResult, reason});
  }

  recordAppliedMutation(value, partitionResult) {
    this.persistedValue = value;
    if (this.pendingValue === value) {
      this.pendingValue = null;
    }
    this.retryAttemptCount = 0;
    return this.buildResult({
      applied: true,
      authoritativeWriteApplied: true,
      cacheVisible: true,
      attempts: 1,
      partitionResult,
      reason: AUTHORITATIVE_ROW_MUTATION_REASON.APPLIED,
    });
  }

  decorateFlushError(error) {
    error.mutationResult = this.buildResult({
      attempts: 1,
      reason: classifyMutationFailure(error),
    });
    if (!this.shuttingDown) {
      this.scheduleRetry(error?.retryAfterMs);
    }
  }

  completeFlush(writeSucceeded) {
    this.inFlight = false;
    if (this.shuttingDown || !writeSucceeded) {
      return;
    }
    if (!this.pendingValue || this.pendingValue === this.persistedValue) {
      return;
    }
    this.scheduleFollowUpFlush();
  }

  /**
   * Capability-gated authoritative dedup + CAS-guard acquisition. The
   * readAuthoritativeRow callback contract:
   * `async (pendingValue) => {supported?: boolean, available: boolean,
   * row: Object|null}` — a READ-ONLY point read of the authoritative row
   * (never a cache refresh: the merged cache can hold a locally seeded row
   * that out-versions the durable one).
   *
   * Outcomes:
   * - capability explicitly absent at runtime (supported === false): fall
   *   back to the legacy cache dedup for this flush;
   * - the authoritative read throws or returns no usable observation: defer
   *   with a scheduled retry. A read failure is not evidence that the
   *   capability is absent, and falling back to a locally seeded merged-cache
   *   row can otherwise mistake visibility for durable persistence;
   * - authority unreadable or the durable row does not exist yet: defer with
   *   a scheduled retry (a cache row equal to pending is NOT durability
   *   evidence, and an UPDATE cannot apply to a missing row);
   * - durable row already carries the pending value: dedup honestly;
   * - otherwise: proceed to the CAS write guarded by the authoritative row.
   * @param {*} value - The pending value being flushed.
   * @return {Promise<{settled: boolean, result?: Object, row?: Object|null}>}
   * @private
   */
  async probeAuthoritativeRow(value) {
    let probe = null;
    try {
      probe = await this.readAuthoritativeRow(value);
    } catch (_readError) {
      this.scheduleRetry();
      return {
        settled: true,
        result: this.buildResult({
          reason:
            AUTHORITATIVE_ROW_MUTATION_REASON.AUTHORITATIVE_CONFIRM_UNAVAILABLE,
        }),
      };
    }
    if (probe?.supported === false) {
      const legacyResult = this.resolveLegacyCacheDedupResult();
      return legacyResult ?
        {settled: true, result: legacyResult} :
        {settled: false, row: null};
    }
    if (!probe || probe.available === false || !probe.row) {
      this.scheduleRetry();
      return {
        settled: true,
        result: this.buildResult({
          reason:
            AUTHORITATIVE_ROW_MUTATION_REASON.AUTHORITATIVE_CONFIRM_UNAVAILABLE,
        }),
      };
    }
    const expectedFields =
      typeof this.buildExpectedCacheFields === 'function' ?
        this.buildExpectedCacheFields(value, null) :
        null;
    if (
      expectedFields &&
      Object.entries(expectedFields).every(
        ([field, fieldValue]) => probe.row[field] === fieldValue,
      )
    ) {
      this.persistedValue = value;
      if (this.pendingValue === value) {
        this.pendingValue = null;
      }
      this.retryAttemptCount = 0;
      return {
        settled: true,
        result: this.buildResult({
          cacheVisible: true,
          recoveredFromCacheGap: true,
          reason:
            AUTHORITATIVE_ROW_MUTATION_REASON.CACHE_VISIBILITY_GAP_RECOVERED,
        }),
      };
    }
    return {settled: false, row: probe.row};
  }

  /**
   * Legacy cache dedup for flushes whose authoritative-read capability is
   * absent at runtime: sync from the merged cache and settle when the pending
   * value drained or already matches the persisted one.
   * @return {Object|null} A settled flush result, or null to proceed.
   * @private
   */
  resolveLegacyCacheDedupResult() {
    const recoveredFromCacheGap = this.syncFromCache();
    if (
      this.pendingValue !== null &&
      this.pendingValue !== this.persistedValue
    ) {
      return null;
    }
    this.retryAttemptCount = 0;
    return this.buildResult({
      cacheVisible: this.pendingValue === null,
      recoveredFromCacheGap,
      reason: recoveredFromCacheGap ?
        AUTHORITATIVE_ROW_MUTATION_REASON.CACHE_VISIBILITY_GAP_RECOVERED :
        AUTHORITATIVE_ROW_MUTATION_REASON.NOOP,
    });
  }

  /**
   * A zero-row CAS update means the authoritative row no longer matches the
   * locally cached guard. Retrying against the same cached row can starve
   * forever when the cache's CDC feed is itself stalled (the guard can only
   * converge through the very publication this write is trying to make).
   * Surface the miss and re-read the authoritative row into the cache so the
   * next flush guards against current observed state instead of the stale
   * snapshot.
   * @param {*} value - The pending value whose flush missed.
   * @param {Object|null} partitionResult - Gateway mutation result.
   * @return {Promise<void>}
   * @private
   */
  async recoverFromObservedStateChanged(value, partitionResult) {
    try {
      this.onObservedStateChanged({
        tableName: this.tableName,
        value,
        retryAttemptCount: this.retryAttemptCount,
        partitionResult,
      });
    } catch (_callbackError) {
      // Observability callback failures must not break the retry loop.
    }
    if (!this.refreshObservedRow) {
      return;
    }
    try {
      await this.refreshObservedRow();
    } catch (error) {
      this.onAsyncError(error, {value, retry: true});
    }
  }

  scheduleRetry(delayMs = null) {
    if (this.shuttingDown || this.retryTimer) {
      return;
    }

    const boundedDelayMs = this.resolveRetryDelayMs(delayMs);
    this.retryAttemptCount += 1;
    this.retryTimer = this.setTimeoutFn(async () => {
      this.retryTimer = null;
      await this.flush().catch((error) => {
        this.onAsyncError(error, {value: this.pendingValue, retry: true});
      });
    }, boundedDelayMs);
    this.retryTimer?.unref?.();
  }

  resolveRetryDelayMs(delayMs = null) {
    const explicitDelayMs = Number.isFinite(delayMs) && delayMs > 0 ?
      Math.floor(delayMs) :
      0;
    const baseDelayMs = Number.isFinite(this.retryDelayMs) &&
      this.retryDelayMs > 0 ?
      Math.floor(this.retryDelayMs) :
      TIME_MS.SECOND;
    const backoffDelayMs = Math.min(
      this.maxRetryDelayMs,
      Math.floor(
        baseDelayMs * (this.retryBackoffMultiplier ** this.retryAttemptCount),
      ),
    );
    return Math.min(
      this.maxRetryDelayMs,
      Math.max(backoffDelayMs, explicitDelayMs),
    );
  }

  scheduleFollowUpFlush() {
    if (this.shuttingDown ||
      this.followUpFlushScheduled || !this.cdcIntegrationService) {
      return;
    }

    this.followUpFlushScheduled = true;
    queueMicrotask(() => {
      this.followUpFlushScheduled = false;
      if (this.shuttingDown) {
        return;
      }
      if (this.inFlight || !this.pendingValue ||
        this.pendingValue === this.persistedValue) {
        return;
      }
      this.flush().catch((error) => {
        this.onAsyncError(error, {value: this.pendingValue, retry: false});
      });
    });
  }

  shutdown() {
    this.shuttingDown = true;
    if (!this.retryTimer) {
      this.followUpFlushScheduled = false;
      this.pendingValue = null;
      this.retryAttemptCount = 0;
      return;
    }
    this.clearTimeoutFn(this.retryTimer);
    this.retryTimer = null;
    this.followUpFlushScheduled = false;
    this.pendingValue = null;
    this.retryAttemptCount = 0;
  }

  buildResult(overrides = {}) {
    return {
      applied: false,
      authoritativeWriteApplied: false,
      cacheVisible: false,
      recoveredFromCacheGap: false,
      attempts: 0,
      reason: AUTHORITATIVE_ROW_MUTATION_REASON.NOOP,
      ...overrides,
    };
  }

  getControlPlaneSystemTableGateway() {
    if (this.controlPlaneSystemTableGateway) {
      return this.controlPlaneSystemTableGateway;
    }
    this.controlPlaneSystemTableGateway = createControlPlaneRuntimeBundle({
      nodeId: this.nodeId,
      getCdcIntegrationService: () => this.cdcIntegrationService,
      getMessageRouter: () => this.messageRouter,
    }).controlPlaneSystemTableGateway;
    return this.controlPlaneSystemTableGateway;
  }
}

export {
  AuthoritativeRowMutationHelper,
  classifyMutationFailure,
};
