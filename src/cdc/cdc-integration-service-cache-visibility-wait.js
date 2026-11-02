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
  captureAuthoritativeCacheSweepSnapshot,
  captureCacheRecordBeforeAbsenceRepair,
  resolveCacheVisibilityRepairReadAuthority,
} from './cdc-integration-service-cache-visibility-authority.js';
import {isDeletedRowObservationSatisfied, repairDeletedRowVisibility} from
  './cdc-cache-deletion-visibility.js';

const {
  AUTHORITATIVE_FALLBACK_PHASE,
  CDC_OPERATION,
  PRESSURE_GOVERNOR_ACTION,
  READ_MODEL_DIVERGENCE_TYPE,
  SYSTEM_TABLE_NAME,
  SYSTEM_TABLE_VISIBILITY_STATE,
  buildSystemTableVisibilityResult,
  canonicalizeSystemTableRow,
  getControlPlaneRetryAfterMs,
  isTableInternalCachePropagationEnabled,
  isRetryableControlPlaneError,
  normalizeAuthoritativeFallbackPhase,
  resolveAuthoritativeFallbackOutcome,
} = CDC_INTEGRATION_SERVICE_SHARED;

const CDC_INTEGRATION_SERVICE_CACHE_VISIBILITY_CONSTRUCTOR = 'constructor';
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
      return isDeletedRowObservationSatisfied(this,
        this.getCacheRecord(tableName, key), expectedFields);
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
    if (!isTableInternalCachePropagationEnabled(tableName)) {
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
    if (!isTableInternalCachePropagationEnabled(tableName)) {
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
          {originHlc: options.originHlc},
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
    return repairDeletedRowVisibility(this, {
      tableName, key, primaryKeyField, expectedFields, rows, phase,
      authoritativeObservedAtMs: queryResult.readAuthorityWitness?.observedAtMs,
      projectionBeforeRead: cachedRecordBeforeAuthoritativeRead,
      projectionAfterRead: cachedRecordAfterAuthoritativeRead,
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
