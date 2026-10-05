import {CDC_INTEGRATION_SERVICE_SHARED} from './cdc-integration-service-shared.js';
import {
  SYSTEM_TABLE_CACHE_MUTATION_MODE,
} from '../cache/cache-constants.js';
import {
  areAuthoritativeSystemTableCacheRowsAligned,
  hasCompleteAuthoritativeSystemTableCacheAlignmentRow,
} from '../cache/system-table-cache-authoritative-reconciliation.js';
import {
  doesCacheRecordMatchExpectedFields,
} from './cdc-integration-service-cache-divergence.js';
import {
  CACHE_REPAIR_READ_AUTHORITY,
  applyAuthoritativeCacheRepair,
  applyAuthoritativeCacheSweep,
  authoritativeReadRowsAreValid,
  cacheRecordChangedDuringAuthoritativeAbsenceRead,
  captureAuthoritativeCacheSweepSnapshot,
  captureCacheRecordBeforeAbsenceRepair,
  resolveCacheVisibilityRepairReadAuthority,
} from './cdc-integration-service-cache-visibility-authority.js';
import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';

const {
  AUTHORITATIVE_FALLBACK_OUTCOME,
  AUTHORITATIVE_FALLBACK_PHASE,
  CDC_ERROR_MSG,
  CDC_OPERATION,
  PRESSURE_GOVERNOR_ACTION,
  READ_MODEL_DIVERGENCE_TYPE,
  SYSTEM_TABLE_NAME,
  SYSTEM_TABLE_VISIBILITY_STATE,
  TIMEOUT_BUDGET_CLASSIFICATION,
  buildPendingVisibilityTimeoutResult,
  buildSystemTableVisibilityResult,
  canonicalizeSystemTableRow,
  createTimeoutBudget,
  createTimeoutBudgetError,
  getControlPlaneRetryAfterMs,
  getRemainingBudgetMs,
  isRetryableControlPlaneError,
  isTableInternalCachePropagationEnabled,
  normalizeAuthoritativeFallbackPhase,
  normalizeSystemTableVisibilityResult,
  resolveAuthoritativeFallbackOutcome,
} = CDC_INTEGRATION_SERVICE_SHARED;

const CDC_INTEGRATION_SERVICE_CACHE_VISIBILITY_CONSTRUCTOR = 'constructor';
const buildCacheWaitTimeoutMessage = CDC_ERROR_MSG.CACHE_WAIT_TIMEOUT;
const CACHE_VISIBILITY_WAIT = Object.freeze({
  wait: 'CACHE_WAIT_TIMEOUT_MS',
  awaited: 'routed system-table write visible in the local cache',
});

// The cache-wait bound is spent: the write did not arrive through CDC in
// time, and the authoritative repair fallback starts next.
function reportCacheVisibilityWaitSpent(service, spent) {
  reportWaitBoundSpent(service.logger, {...CACHE_VISIBILITY_WAIT, ...spent});
}

const AUTHORITATIVE_VISIBILITY_REPAIR_WAIT = Object.freeze({
  wait: 'authoritative_visibility_repair_attempts',
  awaited: 'authoritative confirmation of the cache visibility hole',
});

// The bounded authoritative repair is spent (its attempts or the remaining
// visibility budget) without a confirmation; the caller's timeout answer
// follows.
function reportVisibilityRepairSpent(service, spent) {
  const budget = spent.timeoutBudget;
  reportWaitBoundSpent(service.logger, {
    ...AUTHORITATIVE_VISIBILITY_REPAIR_WAIT,
    boundMs: budget?.configuredBudgetMs ?? null,
    elapsedMs: Number.isFinite(budget?.startedAtMs) ?
      service.timeSource.now() - budget.startedAtMs :
      undefined,
    lastObserved: {
      attempts: spent.attempt,
      maxAttempts: spent.maxAttempts,
      remainingBudgetMs: spent.remainingBudgetMs,
      visibilityState: spent.lastResult?.visibilityState ?? null,
    },
    scope: {nodeId: service.nodeId, tableName: spent.tableName, key: spent.key},
  });
}

/**
 * Post-write cache visibility methods for the CDC integration service. Owns
 * the deterministic cache-wait protocol, authoritative cache-visibility-hole
 * confirmation/repair, and the read-model divergence repair write into the
 * writable cache target.
 */
class CDCIntegrationServiceCacheVisibilityWait {
  /** @return {Object|null} Atomic pre-read table snapshot. */
  captureAuthoritativeCacheSweepSnapshot(tableName) {
    return captureAuthoritativeCacheSweepSnapshot(this, tableName);
  }

  /**
   * Determine whether a table write should wait for cache visibility.
   * Only CDC-propagated tables are guaranteed to appear in SystemTableCache.
   * @param {string} tableName - System table name.
   * @return {boolean} True when cache wait semantics apply.
   * @private
   */
  shouldWaitForCacheUpdate(tableName) {
    return isTableInternalCachePropagationEnabled(tableName);
  }

  /**
   * Wait for a system table cache update matching a primary key.
   * Used to make post-write cache visibility deterministic for callers.
   * @param {string} tableName - System table name.
   * @param {string} key - Primary key value.
   * @param {boolean} expectPresent - True if record should exist after write.
   * @param {Object} [options] - Cache wait options.
   * @param {Object} [options.expectedFields] - Exact field-value matches.
   * @param {Object} [options.minimumFields] - Minimum field thresholds.
   * @return {Promise<void>}
   * @private
   */
  async waitForCacheUpdate(tableName, key, expectPresent, options = {}) {
    // Seed bootstrap registration writes before cache hydration: waiting for
    // visibility here adds per-write timeouts and can stall readiness.
    if (this.bootstrapMode) {
      return buildSystemTableVisibilityResult();
    }
    if (!this.shouldWaitForCacheUpdate(tableName)) {
      return buildSystemTableVisibilityResult();
    }
    const cache = this.systemTableCache;
    if (!cache || typeof cache.onCacheChange !== 'function') {
      return buildSystemTableVisibilityResult();
    }
    const expectedFields =
      options?.expectedFields && typeof options.expectedFields === 'object' ?
        options.expectedFields :
        null;
    const minimumFields =
      options?.minimumFields && typeof options.minimumFields === 'object' ?
        options.minimumFields :
        null;
    const normalizedExpectedFields = this.normalizeExpectedFieldsForMinimums(
      expectedFields,
      minimumFields,
    );
    const timeoutMs =
      Number.isFinite(options?.timeoutMs) && options.timeoutMs > 0 ?
        Math.floor(options.timeoutMs) :
        this.cacheWaitTimeoutMs;
    const fallbackPhase = this.resolveAuthoritativeFallbackPhase(
      options?.fallbackPhase,
    );
    const authoritativeRepairBudgetMs = Math.max(
      1,
      Math.min(
        this.authoritativeFallbackRepairBudgetMs,
        Math.max(1, Math.floor(timeoutMs / 2)),
      ),
    );
    const cacheWaitBudgetMs = Math.max(
      1,
      timeoutMs - authoritativeRepairBudgetMs,
    );
    const isSatisfied = () =>
      this.isCacheExpectationSatisfied(
        tableName,
        key,
        expectPresent,
        normalizedExpectedFields,
        minimumFields,
      );
    if (isSatisfied()) {
      return buildSystemTableVisibilityResult();
    }
    const timeSource = this.timeSource;
    return new Promise((resolve, reject) => {
      let settled = false;
      let stopHoldingUntilShutdown = null; // shutdown ends the wait at once
      const timeoutBudget = createTimeoutBudget({
        configuredBudgetMs: timeoutMs,
        now: () => timeSource.now(),
      });
      const listener = (changedTable) => {
        if (changedTable !== tableName) {
          return;
        }
        if (isSatisfied()) {
          cleanup(null, buildSystemTableVisibilityResult());
        }
      };
      const timer = timeSource.setTimeout(() => {
        void (async () => {
          if (isSatisfied()) {
            cleanup();
            return;
          }
          reportCacheVisibilityWaitSpent(this, {
            boundMs: cacheWaitBudgetMs,
            elapsedMs: timeSource.now() - timeoutBudget.startedAtMs,
            lastObserved: () => ({
              recordPresent: this.hasCacheRecord(tableName, key),
              expectPresent,
              fallbackPhase,
            }),
            scope: {nodeId: this.nodeId, tableName, key},
          });
          let visibilityResult = buildSystemTableVisibilityResult({
            visibilityState: null,
          });
          try {
            visibilityResult =
              await this.confirmCacheVisibilityHoleWithinBudget(
                tableName,
                key,
                expectPresent,
                normalizedExpectedFields,
                minimumFields,
                {
                  fallbackPhase,
                  timeoutBudget,
                },
              );
            const normalizedVisibilityResult =
              normalizeSystemTableVisibilityResult(visibilityResult, null);
            if (isSatisfied() || normalizedVisibilityResult.visible === true) {
              cleanup(
                null,
                buildSystemTableVisibilityResult({
                  ...normalizedVisibilityResult,
                  visibilityState: SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE,
                }),
              );
              return;
            }
            if (
              options?.allowPendingVisibility === true &&
              normalizedVisibilityResult.visibilityState ===
                SYSTEM_TABLE_VISIBILITY_STATE.PENDING_VISIBILITY
            ) {
              cleanup(null, normalizedVisibilityResult);
              return;
            }
            if (
              options?.allowPendingVisibility === true &&
              normalizedVisibilityResult.visibilityState ===
                SYSTEM_TABLE_VISIBILITY_STATE.DEFERRED_BY_PRESSURE
            ) {
              cleanup(null, normalizedVisibilityResult);
              return;
            }
            this.recordAuthoritativeFallbackSignal({
              tableName,
              key,
              expectPresent,
              phase: fallbackPhase,
              outcome: AUTHORITATIVE_FALLBACK_OUTCOME.FAILED,
            });
          } catch (repairError) {
            this.recordAuthoritativeFallbackSignal({
              tableName,
              key,
              expectPresent,
              phase: fallbackPhase,
              outcome: AUTHORITATIVE_FALLBACK_OUTCOME.FAILED,
            });
            this.logger.warn(
              'Authoritative cache repair failed after cache wait timeout',
              {
                tableName,
                key,
                expectPresent,
                error: repairError?.message || String(repairError),
                nodeId: this.nodeId,
              },
            );
          }
          if (options?.allowPendingVisibility === true) {
            cleanup(
              null,
              buildPendingVisibilityTimeoutResult(visibilityResult),
            );
            return;
          }
          const timeoutMessage =
            buildCacheWaitTimeoutMessage(tableName, key, timeoutMs);
          const timeoutError = createTimeoutBudgetError({
            message: timeoutMessage,
            budget: timeoutBudget,
            classification:
              TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
            nestedOperation: `cache_wait:${tableName}`,
            now: () => timeSource.now(),
          });
          if (typeof visibilityResult?.visibilityState === 'string') {
            timeoutError.visibilityState = visibilityResult.visibilityState;
          }
          if (typeof visibilityResult?.contractState === 'string') {
            timeoutError.contractState = visibilityResult.contractState;
          }
          if (typeof visibilityResult?.nextAction === 'string') {
            timeoutError.nextAction = visibilityResult.nextAction;
          }
          if (visibilityResult?.authoritativeVisibilityConfirmed === true) {
            timeoutError.authoritativeVisibilityConfirmed = true;
          }
          if (typeof visibilityResult?.pressureAction === 'string') {
            timeoutError.pressureAction = visibilityResult.pressureAction;
          }
          if (typeof visibilityResult?.pressureReason === 'string') {
            timeoutError.pressureReason = visibilityResult.pressureReason;
          }
          if (Number.isFinite(visibilityResult?.retryAfterMs)) {
            timeoutError.retryAfterMs = visibilityResult.retryAfterMs;
            if (timeoutError.retryAfterMs > 0) {
              timeoutError.deferRetry = true;
            }
          }
          cleanup(timeoutError);
        })();
      }, cacheWaitBudgetMs);
      function cleanup(
        error = null,
        result = buildSystemTableVisibilityResult(),
      ) {
        if (settled) {
          return;
        }
        settled = true;
        stopHoldingUntilShutdown?.();
        if (typeof cache.offCacheChange === 'function') {
          cache.offCacheChange(listener);
        }
        if (timer) {
          timeSource.clearTimeout(timer);
        }
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      }
      cache.onCacheChange(listener);
      stopHoldingUntilShutdown = this.holdUntilShutdown(() =>
        cleanup(this.buildUnconfirmedWriteShutDownAnswer()));
    });
  }
  async confirmCacheVisibilityHoleWithinBudget(
    tableName,
    key,
    expectPresent,
    expectedFields = null,
    minimumFields = null,
    options = {},
  ) {
    let lastResult = buildSystemTableVisibilityResult({
      visibilityState: null,
    });
    const maxAttempts = 2;
    // Held until shutdown: shutdown ends the retry delay and the repair.
    for (let attempt = 1; attempt <= maxAttempts &&
      this.isShuttingDown !== true; attempt += 1) {
      lastResult = normalizeSystemTableVisibilityResult(
        await this.repairCacheVisibilityHole(
          tableName,
          key,
          expectPresent,
          expectedFields,
          minimumFields,
          options,
        ),
        null,
      );
      if (
        lastResult.authoritativeVisibilityConfirmed === true ||
        lastResult.visibilityState ===
          SYSTEM_TABLE_VISIBILITY_STATE.DEFERRED_BY_PRESSURE
      ) {
        return lastResult;
      }
      const remainingBudgetMs = getRemainingBudgetMs(options?.timeoutBudget, {
        now: () => this.timeSource.now(),
      });
      if (attempt >= maxAttempts || remainingBudgetMs <= 0) {
        reportVisibilityRepairSpent(this, {
          tableName,
          key,
          attempt,
          maxAttempts,
          remainingBudgetMs,
          lastResult,
          timeoutBudget: options?.timeoutBudget,
        });
        break;
      }
      await this.delayUntilShutdown(
        Math.min(this.authoritativeFallbackRetryDelayMs, remainingBudgetMs));
    }
    return lastResult;
  }

  /**
   * Check whether the local cache currently satisfies a write expectation.
   * @param {string} tableName
   * @param {string} key
   * @param {boolean} expectPresent
   * @param {Object|null} expectedFields
   * @param {Object|null} minimumFields
   * @return {boolean}
   * @private
   */
  isCacheExpectationSatisfied(
    tableName,
    key,
    expectPresent,
    expectedFields = null,
    minimumFields = null,
  ) {
    const present = this.hasCacheRecord(tableName, key);
    if (expectPresent && !present) {
      return false;
    }
    if (!expectPresent && !present) {
      return true;
    }
    if (!expectPresent) {
      return false;
    }
    const record = this.getCacheRecord(tableName, key);
    return (
      this.doesCacheRecordMatchExpectedFields(record, expectedFields) &&
      this.doesCacheRecordMeetMinimumFields(record, minimumFields)
    );
  }

  /**
   * Determine whether the local cache has one record.
   * @param {string} tableName
   * @param {string} key
   * @return {boolean}
   * @private
   */
  hasCacheRecord(tableName, key) {
    const cache = this.systemTableCache;
    if (!cache) {
      return false;
    }
    if (typeof cache.has === 'function') {
      return cache.has(tableName, key);
    }
    if (typeof cache.get === 'function') {
      return Boolean(cache.get(tableName, key));
    }
    return false;
  }

  /**
   * Get one record from the local cache when available.
   * @param {string} tableName
   * @param {string} key
   * @return {Object|undefined}
   * @private
   */
  getCacheRecord(tableName, key) {
    const cache = this.systemTableCache;
    if (!cache || typeof cache.get !== 'function') {
      return undefined;
    }
    return cache.get(tableName, key);
  }

  /**
   * Re-read one row from the authoritative partition and force the local
   * cache copy to match it. Unlike repairCacheVisibilityHole, a present but
   * STALE cache row is repaired too — callers use this when a CAS guard
   * built from the cached row keeps missing observed authoritative state
   * and the cache's CDC feed cannot be assumed live (the guard may only be
   * able to converge through this direct read).
   * @param {string} tableName - System table name.
   * @param {string} key - Primary key value.
   * @param {Object} [options] - Required post-repair cache fields.
   * @param {Object} [options.expectedFields] - Exact expected field values.
   * @return {Promise<boolean>} True when the cache row was aligned to the
   *   authoritative row and still satisfies the caller's postcondition.
   */
  async refreshAuthoritativeCacheRow(tableName, key, options = {}) {
    if (!this.shouldWaitForCacheUpdate(tableName)) {
      return false;
    }
    const primaryKeyField = this.getPrimaryKeyField(tableName);
    const queryResult = await this.executeAuthoritativeSystemTableRead(
      tableName,
      `SELECT * FROM ${tableName} WHERE ${primaryKeyField} = ?`,
      [key],
      {readAuthority: CACHE_REPAIR_READ_AUTHORITY},
    );
    if (!queryResult?.success) {
      return false;
    }
    const rows = Array.isArray(queryResult.rows) ? queryResult.rows : [];
    if (rows.length === 0) {
      return false;
    }
    const authoritativeRow = canonicalizeSystemTableRow(
      tableName,
      rows[0],
    );
    if (!hasCompleteAuthoritativeSystemTableCacheAlignmentRow(
      tableName,
      authoritativeRow,
    )) {
      return false;
    }
    const mutationMode = tableName === SYSTEM_TABLE_NAME.SERVICES ?
      SYSTEM_TABLE_CACHE_MUTATION_MODE
        .AUTHORITATIVE_SERVICE_LIFECYCLE_RECONCILIATION :
      SYSTEM_TABLE_CACHE_MUTATION_MODE.AUTHORITATIVE_RECONCILIATION;
    const repairApplied = this.applyAuthoritativeCacheRepair(
      tableName,
      CDC_OPERATION.UPSERT,
      authoritativeRow,
      key,
      {mutationMode},
    );
    if (repairApplied !== true) {
      return false;
    }
    const cachedRow = this.getCacheRecord(tableName, key);
    return areAuthoritativeSystemTableCacheRowsAligned(
      tableName,
      cachedRow,
      authoritativeRow,
    ) && doesCacheRecordMatchExpectedFields(
      cachedRow,
      options?.expectedFields || null,
    );
  }

  /**
   * Confirm one cache visibility gap authoritatively, emit divergence
   * diagnostics, and repair the local projection when a writable cache
   * target is available.
   * @param {string} tableName
   * @param {string} key
   * @param {boolean} expectPresent
   * @param {Object|null} expectedFields
   * @param {Object|null} minimumFields
   * @return {Promise<boolean>} True when authoritative state confirms the write.
   * @private
   */
  async repairCacheVisibilityHole(
    tableName,
    key,
    expectPresent,
    expectedFields = null,
    minimumFields = null,
    options = {},
  ) {
    if (!this.shouldWaitForCacheUpdate(tableName)) {
      return buildSystemTableVisibilityResult();
    }
    const primaryKeyField = this.getPrimaryKeyField(tableName);
    const readAuthority = resolveCacheVisibilityRepairReadAuthority(
      expectPresent,
    );
    const cachedRecordBeforeAuthoritativeRead =
      captureCacheRecordBeforeAbsenceRepair(
        this,
        tableName,
        key,
        expectPresent,
      );
    const queryResult = await this.executeAuthoritativeSystemTableRead(
      tableName,
      `SELECT * FROM ${tableName} WHERE ${primaryKeyField} = ?`,
      [key],
      {readAuthority},
    );
    if (!authoritativeReadRowsAreValid(queryResult)) {
      const retryAfterMs = getControlPlaneRetryAfterMs(queryResult);
      if (
        retryAfterMs > 0 ||
        queryResult?.pressureAction === PRESSURE_GOVERNOR_ACTION.DEFER ||
        queryResult?.pressureAction === PRESSURE_GOVERNOR_ACTION.REJECT ||
        isRetryableControlPlaneError(queryResult)
      ) {
        return buildSystemTableVisibilityResult({
          visibilityState: SYSTEM_TABLE_VISIBILITY_STATE.DEFERRED_BY_PRESSURE,
          retryAfterMs,
          pressureAction: queryResult?.pressureAction,
          pressureReason: queryResult?.pressureReason,
        });
      }
      return buildSystemTableVisibilityResult({
        visibilityState: null,
      });
    }
    const rows = queryResult.rows;
    const cachedRecordAfterAuthoritativeRead =
      captureCacheRecordBeforeAbsenceRepair(
        this,
        tableName,
        key,
        expectPresent,
      );
    const cachedRecord = expectPresent ?
      this.getCacheRecord(tableName, key) :
      cachedRecordAfterAuthoritativeRead?.record;
    const phase = this.resolveAuthoritativeFallbackPhase(
      options?.fallbackPhase,
    );
    if (expectPresent) {
      const matchingRow =
        rows.find((row) => {
          return (
            this.doesCacheRecordMatchExpectedFields(row, expectedFields) &&
            this.doesCacheRecordMeetMinimumFields(row, minimumFields)
          );
        }) || null;
      if (!matchingRow) {
        return buildSystemTableVisibilityResult({
          visibilityState: null,
        });
      }
      let cacheRepaired = false;
      if (
        !this.isCacheExpectationSatisfied(
          tableName,
          key,
          expectPresent,
          expectedFields,
          minimumFields,
        )
      ) {
        this.emitCacheVisibilityDivergence(
          tableName,
          key,
          READ_MODEL_DIVERGENCE_TYPE.CACHE_MISSING,
          cachedRecord || null,
          matchingRow,
          this.buildCacheVisibilityDivergentFields(
            primaryKeyField,
            expectedFields,
            minimumFields,
          ),
          phase,
        );
        cacheRepaired = this.applyAuthoritativeCacheRepair(
          tableName,
          CDC_OPERATION.UPSERT,
          matchingRow,
          key,
        );
      }
      const cacheExpectationSatisfied = this.isCacheExpectationSatisfied(
        tableName,
        key,
        expectPresent,
        expectedFields,
        minimumFields,
      );
      const visibilityState = cacheExpectationSatisfied ?
        SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE :
        SYSTEM_TABLE_VISIBILITY_STATE.PENDING_VISIBILITY;
      this.recordAuthoritativeFallbackSignal({
        tableName,
        key,
        expectPresent,
        phase,
        outcome: resolveAuthoritativeFallbackOutcome(
          cacheRepaired && cacheExpectationSatisfied,
        ),
      });
      return buildSystemTableVisibilityResult({
        visibilityState,
        authoritativeVisibilityConfirmed: true,
        cacheRepaired,
      });
    }
    if (rows.length > 0) {
      return buildSystemTableVisibilityResult({
        visibilityState: null,
      });
    }
    if (cacheRecordChangedDuringAuthoritativeAbsenceRead(
      tableName,
      cachedRecordBeforeAuthoritativeRead,
      cachedRecordAfterAuthoritativeRead,
    )) {
      return buildSystemTableVisibilityResult({
        visibilityState: null,
      });
    }
    let cacheRepaired = false;
    if (cachedRecord) {
      this.emitCacheVisibilityDivergence(
        tableName,
        key,
        READ_MODEL_DIVERGENCE_TYPE.AUTHORITATIVE_MISSING,
        cachedRecord,
        null,
        [primaryKeyField],
        phase,
      );
    }
    const absenceRepairRow = cachedRecord ||
      cachedRecordBeforeAuthoritativeRead?.record ||
      {[primaryKeyField]: key};
    cacheRepaired = this.applyAuthoritativeCacheRepair(
      tableName,
      CDC_OPERATION.DELETE,
      absenceRepairRow,
      key,
      {
        authoritativeObservedAtMs:
          queryResult.readAuthorityWitness?.observedAtMs,
      },
    );
    const authoritativeAbsentRecovered =
      cacheRepaired && !this.hasCacheRecord(tableName, key);
    this.recordAuthoritativeFallbackSignal({
      tableName,
      key,
      expectPresent,
      phase,
      outcome: resolveAuthoritativeFallbackOutcome(
        authoritativeAbsentRecovered,
      ),
    });
    return buildSystemTableVisibilityResult({
      visibilityState: this.hasCacheRecord(tableName, key) ?
        SYSTEM_TABLE_VISIBILITY_STATE.PENDING_VISIBILITY :
        SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE,
      authoritativeVisibilityConfirmed: true,
      cacheRepaired,
    });
  }

  /**
   * Apply one authoritative repair row into the writable cache target.
   * @param {string} tableName
   * @param {string} operation
   * @param {Object} row
   * @param {string} key
   * @return {boolean}
   * @private
   */
  applyAuthoritativeCacheRepair(tableName, operation, row, key, options = {}) {
    return applyAuthoritativeCacheRepair(
      this, tableName, operation, row, key, options);
  }

  /** Apply a leader-observed absence sweep through the cache owner. */
  applyAuthoritativeCacheSweep(tableName, authoritativeRows, options = {}) {
    return applyAuthoritativeCacheSweep(
      this,
      tableName,
      authoritativeRows,
      options,
    );
  }

  /** Resolve authoritative fallback phase from optional runtime context. */
  resolveAuthoritativeFallbackPhase(phase) {
    if (typeof phase === 'string' && phase.length > 0) {
      return normalizeAuthoritativeFallbackPhase(phase);
    }
    if (this.bootstrapMode) {
      return AUTHORITATIVE_FALLBACK_PHASE.BOOTSTRAP;
    }
    return AUTHORITATIVE_FALLBACK_PHASE.STEADY_STATE;
  }
}

/**
 * Mix the post-write cache-visibility-wait methods onto the target class
 * prototype.
 * @param {Function} targetClass
 */
function applyCDCIntegrationServiceCacheVisibilityWait(targetClass) {
  const sourcePrototype = CDCIntegrationServiceCacheVisibilityWait.prototype;
  for (const methodName of Object.getOwnPropertyNames(sourcePrototype)) {
    if (methodName === CDC_INTEGRATION_SERVICE_CACHE_VISIBILITY_CONSTRUCTOR) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      sourcePrototype,
      methodName,
    );
    Object.defineProperty(targetClass.prototype, methodName, descriptor);
  }
}

export {applyCDCIntegrationServiceCacheVisibilityWait};
