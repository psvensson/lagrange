import {TIME_MS, TYPEOF} from '../constants/index.js';
import {
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_MUTATION_OUTCOME,
} from '../control-plane/control-plane-system-table-gateway.js';
import {createControlPlaneRuntimeBundle} from
  '../control-plane/control-plane-runtime-bundle.js';

const CACHE_VISIBILITY_ERROR_FRAGMENT = 'Cache update not observed';
const AUTHORITATIVE_ROW_MUTATION_REASON = Object.freeze({
  APPLIED: 'applied',
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

class AuthoritativeRowMutationHelper {
  constructor(options = {}) {
    const {
      tableName,
      buildWhereClause,
      buildUpdateData,
      buildUpdateOptions = () => ({}),
      readValueFromCache,
      readRowFromCache = null,
      buildExpectedCacheFields = null,
      isWriteReady = () => true,
      prepareFlush = () => ({skip: false}),
      retryDelayMs = TIME_MS.SECOND,
      retryBackoffMultiplier =
        AUTHORITATIVE_ROW_MUTATION_RETRY.BACKOFF_MULTIPLIER,
      maxRetryDelayMs = AUTHORITATIVE_ROW_MUTATION_RETRY.MAX_DELAY_MS,
      cdcIntegrationService = null,
      controlPlaneSystemTableGateway = null,
      nodeId = null,
      messageRouter = null,
      systemTableCache = null,
      onAsyncError = () => {},
      now = () => Date.now(),
      setTimeoutFn = setTimeout,
      clearTimeoutFn = clearTimeout,
    } = options;

    if (!tableName) {
      throw new Error(AUTHORITATIVE_ROW_MUTATION_ERROR_MSG.MISSING_TABLE_NAME);
    }
    if (typeof buildWhereClause !== TYPEOF.FUNCTION) {
      throw new Error(
        AUTHORITATIVE_ROW_MUTATION_ERROR_MSG.MISSING_BUILD_WHERE_CLAUSE,
      );
    }
    if (typeof buildUpdateData !== TYPEOF.FUNCTION) {
      throw new Error(
        AUTHORITATIVE_ROW_MUTATION_ERROR_MSG.MISSING_BUILD_UPDATE_DATA,
      );
    }
    if (typeof readValueFromCache !== TYPEOF.FUNCTION) {
      throw new Error(
        AUTHORITATIVE_ROW_MUTATION_ERROR_MSG.MISSING_READ_VALUE_FROM_CACHE,
      );
    }

    this.tableName = tableName;
    this.buildWhereClause = buildWhereClause;
    this.buildUpdateData = buildUpdateData;
    this.buildUpdateOptions = buildUpdateOptions;
    this.readValueFromCache = readValueFromCache;
    this.readRowFromCache = readRowFromCache;
    this.buildExpectedCacheFields = buildExpectedCacheFields;
    this.isWriteReady = isWriteReady;
    this.prepareFlush = prepareFlush;
    this.retryDelayMs = retryDelayMs;
    this.retryBackoffMultiplier = Number.isFinite(retryBackoffMultiplier) &&
      retryBackoffMultiplier >= 1 ?
      retryBackoffMultiplier :
      AUTHORITATIVE_ROW_MUTATION_RETRY.BACKOFF_MULTIPLIER;
    this.maxRetryDelayMs = Number.isFinite(maxRetryDelayMs) &&
      maxRetryDelayMs > 0 ?
      Math.floor(maxRetryDelayMs) :
      AUTHORITATIVE_ROW_MUTATION_RETRY.MAX_DELAY_MS;
    this.cdcIntegrationService = cdcIntegrationService;
    this.controlPlaneSystemTableGateway = controlPlaneSystemTableGateway;
    this.nodeId = nodeId;
    this.messageRouter = messageRouter;
    this.systemTableCache = systemTableCache;
    this.onAsyncError = onAsyncError;
    this.now = now;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;

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
    this.cdcIntegrationService = cdcIntegrationService;
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

    const recoveredFromCacheGap = this.syncFromCache();
    const prepareResult = this.prepareFlush({
      pendingValue: this.pendingValue,
      persistedValue: this.persistedValue,
    }) || {skip: false};

    if (prepareResult.clearPending) {
      this.pendingValue = null;
    }

    if (prepareResult.skip) {
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

    if (!this.cdcIntegrationService || !this.pendingValue ||
      this.pendingValue === this.persistedValue) {
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

    if (!this.isWriteReady()) {
      this.scheduleRetry();
      return this.buildResult({
        recoveredFromCacheGap,
        reason: AUTHORITATIVE_ROW_MUTATION_REASON.OWNER_NOT_READY,
      });
    }

    this.inFlight = true;
    let writeSucceeded = false;
    const value = this.pendingValue;
    const updateData = this.buildUpdateData(value, this.now());
    const cachedRow = typeof this.readRowFromCache === TYPEOF.FUNCTION ?
      this.readRowFromCache(this.systemTableCache) :
      null;
    const mutationContext = {
      cachedRow,
      persistedValue: this.persistedValue,
    };
    const whereClause = this.buildWhereClause(value, mutationContext);
    const updateOptionsCandidate = typeof this.buildUpdateOptions === TYPEOF.FUNCTION ?
      this.buildUpdateOptions(value, updateData, mutationContext) :
      null;
    const updateOptions = updateOptionsCandidate &&
      typeof updateOptionsCandidate === TYPEOF.OBJECT ?
      updateOptionsCandidate :
      {};
    const expectedCacheFields =
      typeof this.buildExpectedCacheFields === TYPEOF.FUNCTION ?
        this.buildExpectedCacheFields(value, updateData) :
        null;
    const writeOptions = {
      ...updateOptions,
      ...(expectedCacheFields ? {expectedCacheFields} : {}),
    };

    try {
      const partitionResult = await this.getControlPlaneSystemTableGateway()
        .submitMutation({
          operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
          tableName: this.tableName,
          whereClause,
          data: updateData,
        }, writeOptions);
      const gatewayFailureReason = classifyGatewayMutationOutcome(
        partitionResult,
      );
      if (partitionResult?.success === false && gatewayFailureReason) {
        this.scheduleRetry(partitionResult?.retryAfterMs);
        return this.buildResult({
          attempts: 1,
          partitionResult,
          reason: gatewayFailureReason,
        });
      }
      const affectedRows = extractAffectedRows(partitionResult);
      if (gatewayFailureReason === AUTHORITATIVE_ROW_MUTATION_REASON
        .OBSERVED_STATE_CHANGED ||
        (affectedRows !== null && affectedRows <= 0)) {
        this.scheduleRetry();
        return this.buildResult({
          attempts: 1,
          partitionResult,
          reason: AUTHORITATIVE_ROW_MUTATION_REASON.OBSERVED_STATE_CHANGED,
        });
      }

      this.persistedValue = value;
      if (this.pendingValue === value) {
        this.pendingValue = null;
      }
      writeSucceeded = true;
      this.retryAttemptCount = 0;

      return this.buildResult({
        applied: true,
        authoritativeWriteApplied: true,
        cacheVisible: true,
        attempts: 1,
        partitionResult,
        reason: AUTHORITATIVE_ROW_MUTATION_REASON.APPLIED,
      });
    } catch (error) {
      const reason = classifyMutationFailure(error);
      const mutationResult = this.buildResult({
        attempts: 1,
        reason,
      });
      error.mutationResult = mutationResult;
      if (!this.shuttingDown) {
        this.scheduleRetry(error?.retryAfterMs);
      }
      throw error;
    } finally {
      this.inFlight = false;
      if (!this.shuttingDown &&
        writeSucceeded &&
        this.pendingValue &&
        this.pendingValue !== this.persistedValue) {
        this.scheduleFollowUpFlush();
      }
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
