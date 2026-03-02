import {TIME_MS, TYPEOF} from '../constants/index.js';

const CACHE_VISIBILITY_ERROR_FRAGMENT = 'Cache update not observed';
const AUTHORITATIVE_ROW_MUTATION_REASON = Object.freeze({
  APPLIED: 'applied',
  AUTHORITATIVE_WRITE_FAILED: 'authoritative-write-failed',
  CACHE_VISIBILITY_GAP_RECOVERED: 'cache-visibility-gap-recovered',
  CACHE_VISIBILITY_GAP_UNRECOVERED: 'cache-visibility-gap-unrecovered',
  IN_FLIGHT: 'in-flight',
  NOOP: 'noop',
  OBSERVED_STATE_CHANGED: 'observed-state-changed',
  OWNER_NOT_READY: 'owner-not-ready',
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

class AuthoritativeRowMutationHelper {
  constructor(options = {}) {
    const {
      tableName,
      buildWhereClause,
      buildUpdateData,
      readValueFromCache,
      readRowFromCache = null,
      buildExpectedCacheFields = null,
      isWriteReady = () => true,
      prepareFlush = () => ({skip: false}),
      retryDelayMs = TIME_MS.SECOND,
      cdcIntegrationService = null,
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
    this.readValueFromCache = readValueFromCache;
    this.readRowFromCache = readRowFromCache;
    this.buildExpectedCacheFields = buildExpectedCacheFields;
    this.isWriteReady = isWriteReady;
    this.prepareFlush = prepareFlush;
    this.retryDelayMs = retryDelayMs;
    this.cdcIntegrationService = cdcIntegrationService;
    this.systemTableCache = systemTableCache;
    this.onAsyncError = onAsyncError;
    this.now = now;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;

    this.pendingValue = null;
    this.persistedValue = null;
    this.inFlight = false;
    this.retryTimer = null;
    this.followUpFlushScheduled = false;
    this.shuttingDown = false;
  }

  setSystemTableCache(systemTableCache) {
    this.systemTableCache = systemTableCache;
  }

  setCdcIntegrationService(cdcIntegrationService) {
    this.cdcIntegrationService = cdcIntegrationService;
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
      return this.buildResult({
        cacheVisible: this.pendingValue === null,
        recoveredFromCacheGap,
        reason:
          prepareResult.reason || AUTHORITATIVE_ROW_MUTATION_REASON.SKIPPED,
      });
    }

    if (!this.cdcIntegrationService || !this.pendingValue ||
      this.pendingValue === this.persistedValue) {
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
    const whereClause = this.buildWhereClause(value, {
      cachedRow,
      persistedValue: this.persistedValue,
    });
    const expectedCacheFields =
      typeof this.buildExpectedCacheFields === TYPEOF.FUNCTION ?
        this.buildExpectedCacheFields(value, updateData) :
        null;

    try {
      const partitionResult = await this.cdcIntegrationService.updateSystemTableRow(
        this.tableName,
        whereClause,
        updateData,
        expectedCacheFields ? {expectedCacheFields} : {},
      );
      const affectedRows = extractAffectedRows(partitionResult);
      if (affectedRows !== null && affectedRows <= 0) {
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
        this.scheduleRetry();
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

  scheduleRetry() {
    if (this.shuttingDown || this.retryTimer) {
      return;
    }

    this.retryTimer = this.setTimeoutFn(() => {
      this.retryTimer = null;
      this.flush().catch((error) => {
        this.onAsyncError(error, {value: this.pendingValue, retry: true});
      });
    }, this.retryDelayMs);
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
      return;
    }
    this.clearTimeoutFn(this.retryTimer);
    this.retryTimer = null;
    this.followUpFlushScheduled = false;
    this.pendingValue = null;
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
}

export {
  AuthoritativeRowMutationHelper,
  classifyMutationFailure,
};
