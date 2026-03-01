import {TIME_MS, TYPEOF} from '../constants/index.js';

const CACHE_VISIBILITY_ERROR_FRAGMENT = 'Cache update not observed';

function classifyMutationFailure(error) {
  const message = error?.message || '';
  if (message.includes(CACHE_VISIBILITY_ERROR_FRAGMENT)) {
    return 'cache-visibility-gap-unrecovered';
  }
  return 'authoritative-write-failed';
}

class AuthoritativeRowMutationHelper {
  constructor(options = {}) {
    const {
      tableName,
      buildWhereClause,
      buildUpdateData,
      readValueFromCache,
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
      throw new Error('AuthoritativeRowMutationHelper requires tableName');
    }
    if (typeof buildWhereClause !== TYPEOF.FUNCTION) {
      throw new Error('AuthoritativeRowMutationHelper requires buildWhereClause');
    }
    if (typeof buildUpdateData !== TYPEOF.FUNCTION) {
      throw new Error('AuthoritativeRowMutationHelper requires buildUpdateData');
    }
    if (typeof readValueFromCache !== TYPEOF.FUNCTION) {
      throw new Error('AuthoritativeRowMutationHelper requires readValueFromCache');
    }

    this.tableName = tableName;
    this.buildWhereClause = buildWhereClause;
    this.buildUpdateData = buildUpdateData;
    this.readValueFromCache = readValueFromCache;
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
  }

  setSystemTableCache(systemTableCache) {
    this.systemTableCache = systemTableCache;
  }

  setCdcIntegrationService(cdcIntegrationService) {
    this.cdcIntegrationService = cdcIntegrationService;
  }

  queue(value) {
    if (!value || value === this.persistedValue) {
      return;
    }

    this.pendingValue = value;
    if (!this.cdcIntegrationService) {
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
    if (this.inFlight) {
      return this.buildResult({reason: 'in-flight'});
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
        reason: prepareResult.reason || 'skipped',
      });
    }

    if (!this.cdcIntegrationService || !this.pendingValue ||
      this.pendingValue === this.persistedValue) {
      return this.buildResult({
        cacheVisible: this.pendingValue === null,
        recoveredFromCacheGap,
        reason: recoveredFromCacheGap ? 'cache-visibility-gap-recovered' : 'noop',
      });
    }

    if (!this.isWriteReady()) {
      this.scheduleRetry();
      return this.buildResult({
        recoveredFromCacheGap,
        reason: 'owner-not-ready',
      });
    }

    this.inFlight = true;
    const value = this.pendingValue;
    const updateData = this.buildUpdateData(value, this.now());
    const whereClause = this.buildWhereClause(value);
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

      this.persistedValue = value;
      if (this.pendingValue === value) {
        this.pendingValue = null;
      }

      return this.buildResult({
        applied: true,
        authoritativeWriteApplied: true,
        cacheVisible: true,
        attempts: 1,
        partitionResult,
        reason: 'applied',
      });
    } catch (error) {
      const reason = classifyMutationFailure(error);
      const mutationResult = this.buildResult({
        attempts: 1,
        reason,
      });
      error.mutationResult = mutationResult;
      this.scheduleRetry();
      throw error;
    } finally {
      this.inFlight = false;
    }
  }

  scheduleRetry() {
    if (this.retryTimer) {
      return;
    }

    this.retryTimer = this.setTimeoutFn(() => {
      this.retryTimer = null;
      this.flush().catch((error) => {
        this.onAsyncError(error, {value: this.pendingValue, retry: true});
      });
    }, this.retryDelayMs);
  }

  shutdown() {
    if (!this.retryTimer) {
      return;
    }
    this.clearTimeoutFn(this.retryTimer);
    this.retryTimer = null;
  }

  buildResult(overrides = {}) {
    return {
      applied: false,
      authoritativeWriteApplied: false,
      cacheVisible: false,
      recoveredFromCacheGap: false,
      attempts: 0,
      reason: 'noop',
      ...overrides,
    };
  }
}

export {
  AuthoritativeRowMutationHelper,
  classifyMutationFailure,
};
