const LOCAL_STR_CONSTRUCTOR = 'constructor';

function buildAuthoritativeCacheReconcileError(result, constants) {
  const errorCode =
    result?.error || constants.error.CACHE_NOT_RECONCILED;
  const reconciliationReason =
    typeof result?.reconciliationReason === 'string' &&
    result.reconciliationReason.length > 0 ?
      result.reconciliationReason :
      null;
  const error = new Error(
    reconciliationReason ?
      `${errorCode}:${reconciliationReason}` :
      errorCode,
  );
  error.code = errorCode;
  error.reconciliationReason = reconciliationReason;
  return error;
}

function assertAuthoritativeCacheReconcileResult(result, receipt, constants) {
  if (result?.success !== true) {
    throw buildAuthoritativeCacheReconcileError(result, constants);
  }
  const completeObservationRequested = receipt?.scope ===
    constants.scope.COMPLETE_TABLE;
  if (
    completeObservationRequested &&
    !Number.isFinite(result?.authoritativeObservedAtMs)
  ) {
    throw new Error(constants.error.STORAGE_UNAVAILABLE);
  }
}

function assignAdminServiceDiscoveryRepairCacheMethods(
  AdminServiceDiscovery,
  options = {},
) {
  const {
    ADMIN_CACHE_DUMP,
    ADMIN_SERVICE_DISCOVERY,
    AUTHORITATIVE_DISCOVERY_REPAIR,
    AUTHORITATIVE_DISCOVERY_REPAIR_DEFAULT_REASON,
    AUTHORITATIVE_REPAIR_FAILURE_ACTION,
    AUTHORITATIVE_REPAIR_FAILURE_CLASS,
    CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR,
    CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE,
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
        // Typed owner-to-owner evidence provenance: the active-gate owner
        // compares this revision against a fresher authoritative observation
        // to decide whether the deferred observation it holds is still the
        // governing evidence. It never re-admits repair: repair admission,
        // the e2797b6c8 backoff, and the retryAtMs gate stay keyed ONLY by
        // repair tables + failure class + time (no bypassReuse guard by
        // design), and the probe below leaves the deferral fully binding.
        evidenceRevision: Number.isFinite(failureState.completedAtMs) ?
          Math.floor(failureState.completedAtMs) :
          null,
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
     * Probe the current authoritative evidence revision for the repair tables
     * covered by a still-binding failure deferral WITHOUT admitting any repair
     * and WITHOUT weakening the e2797b6c8 backoff. The repair owner remains
     * the sole authority over whether the failed repair observation it issued
     * is still the governing evidence: the probe reads the authoritative rows
     * through the owner path (observation only, no cache mutation) and answers
     * a typed observation the active-gate owner consumes. The deferral itself
     * stays keyed by repair tables + failure class + time; the probe runs only
     * while that deferral is still binding (never as a repair bypass), records
     * no repair attempt, and is bounded by one in-flight promise.
     * @param {Object} [options={}]
     * @return {Promise<Object|null>}
     */
    async probeAuthoritativeDiscoveryEvidenceRevision(options = {}) {
      if (this.authoritativeDiscoveryEvidenceProbePromise) {
        return this.authoritativeDiscoveryEvidenceProbePromise;
      }
      this.authoritativeDiscoveryEvidenceProbePromise =
        this.executeAuthoritativeDiscoveryEvidenceRevisionProbe(options)
          .finally(() => {
            this.authoritativeDiscoveryEvidenceProbePromise = null;
          });
      return this.authoritativeDiscoveryEvidenceProbePromise;
    }

    async executeAuthoritativeDiscoveryEvidenceRevisionProbe(options = {}) {
      if (
        !this.systemTableCache ||
        !this.cacheMutationTarget ||
        typeof this.cacheMutationTarget.applySystemTableChange !==
          'function' ||
        !this.canReadAuthoritativeDiscoveryRows()
      ) {
        return null;
      }
      const failureState = this.lastAuthoritativeDiscoveryRepairFailureState;
      // Probe a table the deferred repair actually FAILED to read — the
      // evidence domain of the failure. Reading a table the repair never
      // attempted (or a freshly resolved caller set) could report a spurious
      // advance; reading a failed table honestly observes whether the
      // authoritative evidence for the deferred failure has advanced.
      const probeTableNames = normalizeAuthoritativeRepairTableNames(
        Array.isArray(failureState?.failedTables) &&
          failureState.failedTables.length > 0 ?
          failureState.failedTables :
          failureState?.requestedTableNames,
      );
      const probe = await this.readAuthoritativeDiscoveryEvidenceObservation(
        options,
        probeTableNames,
      );
      if (!probe) {
        return null;
      }
      return {
        deferredRepairEvidenceRevision:
          Number.isFinite(failureState?.completedAtMs) ?
            Math.floor(failureState.completedAtMs) :
            null,
        ...probe,
      };
    }

    async readAuthoritativeDiscoveryEvidenceObservation(
      options = {},
      probeTableNames = [],
    ) {
      const probeTableName = probeTableNames[0];
      if (!probeTableName) {
        return null;
      }
      try {
        const result = await this.readAuthoritativeSystemTableRows(
          probeTableName,
          {
            nowMs: this.nowFn(),
            reason:
              options.reason || AUTHORITATIVE_DISCOVERY_REPAIR_DEFAULT_REASON,
            queryTimeoutMs: options.queryTimeoutMs,
          },
        );
        return {
          tableName: result?.tableName || probeTableName,
          rows: Array.isArray(result?.rows) ? [...result.rows] : [],
          authoritativeObservation: result?.authoritativeObservation || null,
        };
      } catch (_error) {
        return null;
      }
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
        cacheStaleWatermarkTableName:
          options.cacheStaleWatermarkTableName,
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
     * @param {Object} options
     * @param {Object|null} options.authoritativeObservation
     * @return {number}
     */
    async applyAuthoritativeSystemTableRows(
      tableName,
      rows,
      causeId,
      options = {},
    ) {
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
            authoritativeObservation:
              options.authoritativeObservation || null,
          },
        );
      assertAuthoritativeCacheReconcileResult(
        result,
        options.authoritativeObservation,
        {
          error: CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_ERROR,
          scope: CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE,
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
