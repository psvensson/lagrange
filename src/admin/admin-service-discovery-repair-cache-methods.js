const LOCAL_STR_CONSTRUCTOR = 'constructor';

function assignAdminServiceDiscoveryRepairCacheMethods(
  AdminServiceDiscovery,
  options = {},
) {
  const {
    ADMIN_CACHE_DUMP,
    ADMIN_SERVICE_DISCOVERY,
    AUTHORITATIVE_DISCOVERY_REPAIR,
    AUTHORITATIVE_REPAIR_FAILURE_ACTION,
    AUTHORITATIVE_REPAIR_FAILURE_CLASS,
    CONTROL_PLANE_CACHE_RECONCILE_INTENT,
    CONTROL_PLANE_SNAPSHOT_REFRESH_STATE,
    deriveAuthoritativeRepairTables,
    getSystemCachePrimaryKeyField,
    normalizeAuthoritativeRepairTableNames,
    normalizeDiscoveryTableId,
    normalizeIdentifier,
  } = options;

  class AdminServiceDiscoveryRepairCacheMethods {
    /**
     * Resolve one non-blocking repair scheduling decision for shared snapshot
     * readers.
     * @param {Object} [options={}]
     * @return {Object}
     */
    buildAuthoritativeDiscoveryRepairScheduleDecision(options = {}) {
      const now = this.nowFn();
      const hasCacheMutationTarget = Boolean(
        this.systemTableCache &&
          this.cacheMutationTarget &&
          typeof this.cacheMutationTarget.applySystemTableChange ===
            'function' &&
          this.canReadAuthoritativeDiscoveryRows(),
      );
      const repairTableNames = hasCacheMutationTarget ?
        this.resolveAuthoritativeDiscoveryRepairTables(options) :
        [];
      const hasRepairTables = repairTableNames.length > 0;
      const hasInFlightRepair = Boolean(
        hasRepairTables && this.authoritativeDiscoveryRepairPromise,
      );
      const recentRepairFailure =
        !hasInFlightRepair && hasRepairTables ?
          this.resolveRecentAuthoritativeDiscoveryRepairFailure(
            {
              ...options,
              repairTables: repairTableNames,
            },
            now,
          ) :
          null;
      const state =
        !hasCacheMutationTarget || !hasRepairTables ?
          CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.IDLE :
          hasInFlightRepair ?
            CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.IN_FLIGHT :
            recentRepairFailure ?
              CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.DEFERRED :
              CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.SCHEDULED;
      return {
        state,
        repair: recentRepairFailure,
      };
    }

    /**
     * Start one non-blocking authoritative repair when the shared snapshot owner
     * requests background refresh.
     * @param {Object} [options={}]
     * @return {Object}
     */
    scheduleAuthoritativeDiscoveryCacheRepair(options = {}) {
      const repairDecision =
        this.buildAuthoritativeDiscoveryRepairScheduleDecision(options);
      if (
        repairDecision.state !== CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.SCHEDULED
      ) {
        return repairDecision;
      }
      const repairPromise = this.ensureAuthoritativeDiscoveryCacheRepair(
        options,
      ).catch(() => null);
      return {
        state: CONTROL_PLANE_SNAPSHOT_REFRESH_STATE.SCHEDULED,
        repair: null,
        repairPromise,
      };
    }

    /**
     * Reuse one recent successful repair result for non-forced callers so
     * repeated local snapshots rebuild from the repaired cache instead of
     * issuing another full discovery repair immediately.
     * @param {Object} options
     * @param {number} nowMs
     * @return {Object|null}
     * @private
     */
    resolveRecentAuthoritativeDiscoveryRepair(options = {}, nowMs = null) {
      if (options?.bypassReuse === true) {
        return null;
      }
      const completedAtMs = Number(
        this.lastAuthoritativeDiscoveryRepairCompletedAtMs,
      );
      if (!Number.isFinite(completedAtMs) || completedAtMs <= 0) {
        return null;
      }
      const reuseWindowMs =
        Number.isFinite(options?.reuseWindowMs) &&
        options.reuseWindowMs > 0 ?
          Math.floor(options.reuseWindowMs) :
          AUTHORITATIVE_DISCOVERY_REPAIR.REUSE_WINDOW_MS;
      if (!Number.isFinite(reuseWindowMs) || reuseWindowMs <= 0) {
        return null;
      }
      const effectiveNowMs = Number.isFinite(nowMs) ? nowMs : this.nowFn();
      if (effectiveNowMs - completedAtMs > reuseWindowMs) {
        return null;
      }
      if (
        !this.lastAuthoritativeDiscoveryRepairResult ||
        this.lastAuthoritativeDiscoveryRepairResult.applied !== true
      ) {
        return null;
      }
      const requestedRepairTables = Array.isArray(options?.repairTables) ?
        options.repairTables :
        this.resolveAuthoritativeDiscoveryRepairTables(options);
      if (
        !this.lastAuthoritativeDiscoveryRepairCoversTables(
          requestedRepairTables,
        )
      ) {
        return null;
      }
      return {
        ...this.lastAuthoritativeDiscoveryRepairResult,
        reused: true,
        skipped: false,
        reusedAtMs: effectiveNowMs,
      };
    }

    /**
     * Reuse one recent failed repair decision while the repair owner is
     * deliberately backing off under pressure or repeated transient failures.
     * @param {Object} options
     * @param {number} nowMs
     * @return {Object|null}
     * @private
     */
    resolveRecentAuthoritativeDiscoveryRepairFailure(
      options = {},
      nowMs = null,
    ) {
      const failureState = this.lastAuthoritativeDiscoveryRepairFailureState;
      if (
        !failureState ||
        failureState.action !== AUTHORITATIVE_REPAIR_FAILURE_ACTION.DEFER_REPAIR
      ) {
        return null;
      }
      const effectiveNowMs = Number.isFinite(nowMs) ? nowMs : this.nowFn();
      const retryAtMs = Number(failureState.retryAtMs);
      if (!Number.isFinite(retryAtMs) || retryAtMs <= effectiveNowMs) {
        return null;
      }
      const requestedRepairTables = Array.isArray(options?.repairTables) ?
        options.repairTables :
        this.resolveAuthoritativeDiscoveryRepairTables(options);
      if (
        !this.lastAuthoritativeDiscoveryRepairFailureCoversTables(
          requestedRepairTables,
        )
      ) {
        return null;
      }
      return {
        applied: false,
        skipped: true,
        deferred: true,
        tableCount: 0,
        requestedTableCount: requestedRepairTables.length,
        requestedTableNames: [...requestedRepairTables],
        failedTables: Array.isArray(failureState.failedTables) ?
          [...failureState.failedTables] :
          ADMIN_CACHE_DUMP.EMPTY,
        errorCount: Array.isArray(failureState.errors) ?
          failureState.errors.length :
          0,
        errors: Array.isArray(failureState.errors) ?
          [...failureState.errors] :
          ADMIN_CACHE_DUMP.EMPTY,
        errorCodes: Array.isArray(failureState.errorCodes) ?
          [...failureState.errorCodes] :
          ADMIN_CACHE_DUMP.EMPTY,
        causeChain: Array.isArray(failureState.causeChain) ?
          [...failureState.causeChain] :
          ADMIN_CACHE_DUMP.EMPTY,
        readSource: failureState.readSource || null,
        localQueryTransport: failureState.localQueryTransport || null,
        firstFailedParticipant: failureState.firstFailedParticipant || null,
        failureClass: failureState.failureClass || null,
        failureCount: Number.isFinite(failureState.failureCount) ?
          Math.floor(failureState.failureCount) :
          0,
        retryAfterMs: Math.max(
          0,
          Math.floor(retryAtMs - effectiveNowMs),
        ),
        completedAtMs: failureState.completedAtMs || null,
        reused: true,
      };
    }

    /**
     * Resolve one canonical authoritative repair table set for the
     * current repair trigger scope.
     * @param {Object} [options={}]
     * @return {string[]}
     */
    resolveAuthoritativeDiscoveryRepairTables(options = {}) {
      const scopedQuery =
        normalizeIdentifier(options.tableName) !== null ||
        normalizeDiscoveryTableId(options.tableId) !== null ||
        options.scopedQuery === true;
      return deriveAuthoritativeRepairTables({
        scopedQuery,
        triggerCodes: options.triggerCodes,
      });
    }

    /**
     * Return true when the last successful repair covered every requested
     * table in the current repair set.
     * @param {string[]} requestedRepairTables
     * @return {boolean}
     */
    lastAuthoritativeDiscoveryRepairCoversTables(
      requestedRepairTables = ADMIN_CACHE_DUMP.EMPTY,
    ) {
      if (
        !this.lastAuthoritativeDiscoveryRepairResult ||
        this.lastAuthoritativeDiscoveryRepairResult.applied !== true
      ) {
        return false;
      }
      const repairedTables = new Set(
        Array.isArray(this.lastAuthoritativeDiscoveryRepairResult.tableNames) ?
          this.lastAuthoritativeDiscoveryRepairResult.tableNames :
          AUTHORITATIVE_DISCOVERY_REPAIR.TABLES,
      );
      const normalizedRequestedRepairTables =
        Array.isArray(requestedRepairTables) &&
        requestedRepairTables.length > 0 ?
          requestedRepairTables :
          AUTHORITATIVE_DISCOVERY_REPAIR.TABLES;
      return normalizedRequestedRepairTables.every((tableName) =>
        repairedTables.has(tableName),
      );
    }

    /**
     * Return true when the last deferred repair failure covered every
     * requested table in the current repair set.
     * @param {string[]} requestedRepairTables
     * @return {boolean}
     */
    lastAuthoritativeDiscoveryRepairFailureCoversTables(
      requestedRepairTables = ADMIN_CACHE_DUMP.EMPTY,
    ) {
      const failureState = this.lastAuthoritativeDiscoveryRepairFailureState;
      if (
        !failureState ||
        failureState.action !== AUTHORITATIVE_REPAIR_FAILURE_ACTION.DEFER_REPAIR
      ) {
        return false;
      }
      const deferredTables = new Set(
        normalizeAuthoritativeRepairTableNames(
          failureState.requestedTableNames,
        ),
      );
      const normalizedRequestedRepairTables =
        Array.isArray(requestedRepairTables) &&
        requestedRepairTables.length > 0 ?
          requestedRepairTables :
          AUTHORITATIVE_DISCOVERY_REPAIR.TABLES;
      return normalizedRequestedRepairTables.every((tableName) =>
        deferredTables.has(tableName),
      );
    }

    /**
     * Resolve the next failure count for one repair scope/class pair.
     * @param {string[]} requestedRepairTables
     * @param {string} failureClass
     * @return {number}
     */
    resolveAuthoritativeDiscoveryRepairFailureCount(
      requestedRepairTables = ADMIN_CACHE_DUMP.EMPTY,
      failureClass = AUTHORITATIVE_REPAIR_FAILURE_CLASS.TRANSIENT,
    ) {
      const lastFailureState =
        this.lastAuthoritativeDiscoveryRepairFailureState;
      if (
        !lastFailureState ||
        lastFailureState.failureClass !== failureClass ||
        !this.lastAuthoritativeDiscoveryRepairFailureCoversTables(
          requestedRepairTables,
        )
      ) {
        return 1;
      }
      return Math.max(
        1,
        Math.floor(Number(lastFailureState.failureCount) || 0) + 1,
      );
    }

    /**
     * Reconcile one cached system table with authoritative query
     * rows.
     * @param {string} tableName
     * @param {Array<Object>} rows
     * @param {string} causeId
     * @return {number}
     */
    async applyAuthoritativeSystemTableRows(tableName, rows, causeId) {
      const authoritativeRows = Array.isArray(rows) ?
        rows :
        ADMIN_CACHE_DUMP.EMPTY;
      const primaryKeyField = getSystemCachePrimaryKeyField(tableName);
      const cachedRows = this.systemTableCache.getAll(tableName);
      const result =
        await this.controlPlaneSystemTableGateway.reconcileAuthoritativeCacheRows(
          tableName,
          authoritativeRows,
          {
            causeId,
            primaryKeyField,
            reconcileIntent:
              CONTROL_PLANE_CACHE_RECONCILE_INTENT.REFRESH_EVIDENCE,
            cachedRows,
            cacheMutationTarget: this.cacheMutationTarget,
            systemTableCache: this.systemTableCache,
          },
        );
      return result?.mutationCount || 0;
    }

    /**
     * Build canonical query_result payload for service discovery
     * query.
     * @param {Object} [options={}]
     * @return {Promise<Object>}
     */
    async buildServiceDiscoveryQueryResult(options = {}) {
      const snapshot = await this.resolveServiceDiscoverySnapshot(options);
      return {
        success: true,
        rows: [snapshot],
        count: 1,
        partitions: ADMIN_CACHE_DUMP.EMPTY,
        tableName: ADMIN_SERVICE_DISCOVERY.TABLE_NAME,
      };
    }
  }

  for (const methodName of Object.getOwnPropertyNames(
    AdminServiceDiscoveryRepairCacheMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      AdminServiceDiscovery.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        AdminServiceDiscoveryRepairCacheMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignAdminServiceDiscoveryRepairCacheMethods};
