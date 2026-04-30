const LOCAL_NUM_FIVE = 5;
const LOCAL_STR_ABFPD = 'Authoritative discovery cache repair failed';
const LOCAL_STR_LIZAB = 'Authoritative discovery cache repair completed';
const LOCAL_STR_CONSTRUCTOR = 'constructor';

function assignAdminServiceDiscoveryRepairMethods(
  AdminServiceDiscovery,
  options = {},
) {
  const {
    ADMIN_CACHE_DUMP,
    ADMIN_SERVICE_DISCOVERY,
    ADMIN_SERVICE_DISCOVERY_LITERAL,
    AUTHORITATIVE_DISCOVERY_REPAIR,
    AUTHORITATIVE_DISCOVERY_REPAIR_CAUSE_ID_PREFIX,
    AUTHORITATIVE_DISCOVERY_REPAIR_DEFAULT_REASON,
    AUTHORITATIVE_DISCOVERY_REPAIR_UNKNOWN_REASON,
    AUTHORITATIVE_REPAIR_FAILURE_ACTION,
    AUTHORITATIVE_REPAIR_FAILURE_CLASS,
    CONTROL_PLANE_CACHE_RECONCILE_INTENT,
    CONTROL_PLANE_SNAPSHOT_REFRESH_STATE,
    EMPTY_STRING,
    NUM,
    SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR,
    TYPEOF,
    computeAuthoritativeRepairFailureRetryAfterMs,
    deriveAuthoritativeRepairTables,
    getSystemCachePrimaryKeyField,
    normalizeAuthoritativeRepairTableNames,
    normalizeDiscoveryTableId,
    normalizeIdentifier,
    resolveAuthoritativeRepairFailureBaseRetryAfterMs,
    resolveAuthoritativeRepairFailureClass,
    resolveAuthoritativeRepairFailureMaxRetryAfterMs,
    shouldAbortAuthoritativeRepairTableReads,
    summarizeAuthoritativeRepairError,
  } = options;

  class AdminServiceDiscoveryRepairMethods {
    /**
     * Ensure bounded authoritative discovery cache repair.
     * @param {Object} [options={}]
     * @return {Promise<Object>}
     */
    async ensureAuthoritativeDiscoveryCacheRepair(options = {}) {
      if (
        !this.systemTableCache ||
        !this.cacheMutationTarget ||
        typeof this.cacheMutationTarget.applySystemTableChange !==
          TYPEOF.FUNCTION
      ) {
        return {
          applied: false,
          skipped: true,
          tableCount: NUM.ZERO,
        };
      }
      if (!this.canReadAuthoritativeDiscoveryRows()) {
        return {
          applied: false,
          skipped: true,
          tableCount: NUM.ZERO,
        };
      }
      const now = this.nowFn();
      const repairTableNames =
        this.resolveAuthoritativeDiscoveryRepairTables(options);
      if (repairTableNames.length === NUM.ZERO) {
        return {
          applied: false,
          skipped: true,
          tableCount: NUM.ZERO,
        };
      }
      if (this.authoritativeDiscoveryRepairPromise) {
        return this.authoritativeDiscoveryRepairPromise;
      }
      const recentRepairResult = this.resolveRecentAuthoritativeDiscoveryRepair(
        {
          ...options,
          repairTables: repairTableNames,
        },
        now,
      );
      if (recentRepairResult) {
        return recentRepairResult;
      }
      const recentRepairFailure =
        this.resolveRecentAuthoritativeDiscoveryRepairFailure(
          {
            ...options,
            repairTables: repairTableNames,
          },
          now,
        );
      if (recentRepairFailure) {
        return recentRepairFailure;
      }
      if (
        options?.bypassReuse !== true &&
        now - this.lastAuthoritativeDiscoveryRepairAtMs <
          AUTHORITATIVE_DISCOVERY_REPAIR.COOLDOWN_MS &&
        this.lastAuthoritativeDiscoveryRepairCoversTables(repairTableNames)
      ) {
        return {
          applied: false,
          skipped: true,
          tableCount: NUM.ZERO,
        };
      }
      this.authoritativeDiscoveryRepairPromise =
        this.executeAuthoritativeDiscoveryCacheRepairRun(
          repairTableNames,
          options,
          now,
        ).finally(() => {
          this.authoritativeDiscoveryRepairPromise = null;
        });
      return this.authoritativeDiscoveryRepairPromise;
    }

    async executeAuthoritativeDiscoveryCacheRepairRun(
      repairTableNames,
      options,
      now,
    ) {
      const repairState = this.createAuthoritativeDiscoveryRepairState();
      const causeId = this.buildAuthoritativeDiscoveryRepairCauseId(
        options,
        now,
      );
      await this.readAuthoritativeDiscoveryRepairRowsIntoState(
        repairState,
        repairTableNames,
        options,
        now,
      );
      if (repairState.failedTables.length === NUM.ZERO) {
        await this.applyAuthoritativeDiscoveryRepairRowsIntoState(
          repairState,
          repairTableNames,
          causeId,
        );
      }
      return this.finalizeAuthoritativeDiscoveryCacheRepairRun(
        repairState,
        repairTableNames,
        options,
      );
    }

    createAuthoritativeDiscoveryRepairState() {
      return {
        repairedTableCount: NUM.ZERO,
        repairedRowCount: NUM.ZERO,
        repairedTableNames: [],
        authoritativeRowsByTable: new Map(),
        failedTables: [],
        errors: [],
        errorSummaries: [],
      };
    }

    buildAuthoritativeDiscoveryRepairCauseId(options, now) {
      return [
        AUTHORITATIVE_DISCOVERY_REPAIR_CAUSE_ID_PREFIX,
        String(options.reason || AUTHORITATIVE_DISCOVERY_REPAIR_UNKNOWN_REASON),
        String(now),
      ].join(SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR);
    }

    async readAuthoritativeDiscoveryRepairRowsIntoState(
      repairState,
      repairTableNames,
      options,
      now,
    ) {
      for (const tableName of repairTableNames) {
        try {
          const result = await this.readAuthoritativeSystemTableRows(
            tableName,
            {
              nowMs: now,
              reason:
                options.reason || AUTHORITATIVE_DISCOVERY_REPAIR_DEFAULT_REASON,
              tableName: options.tableName || null,
              tableId: options.tableId || null,
            },
          );
          repairState.authoritativeRowsByTable.set(tableName, {
            tableName: result.tableName,
            rows: result.rows,
          });
        } catch (error) {
          const errorSummary = this.recordAuthoritativeDiscoveryRepairFailure(
            repairState,
            tableName,
            error,
          );
          if (shouldAbortAuthoritativeRepairTableReads(errorSummary)) {
            break;
          }
        }
      }
    }

    async applyAuthoritativeDiscoveryRepairRowsIntoState(
      repairState,
      repairTableNames,
      causeId,
    ) {
      for (const tableName of repairTableNames) {
        const result = repairState.authoritativeRowsByTable.get(tableName);
        try {
          repairState.repairedRowCount +=
            await this.applyAuthoritativeSystemTableRows(
              result?.tableName || tableName,
              result?.rows || ADMIN_CACHE_DUMP.EMPTY,
              causeId,
            );
          repairState.repairedTableCount += NUM.ONE;
          repairState.repairedTableNames.push(tableName);
        } catch (error) {
          this.recordAuthoritativeDiscoveryRepairFailure(
            repairState,
            tableName,
            error,
          );
          break;
        }
      }
    }

    recordAuthoritativeDiscoveryRepairFailure(repairState, tableName, error) {
      const errorSummary = summarizeAuthoritativeRepairError(tableName, error);
      repairState.failedTables.push(tableName);
      repairState.errorSummaries.push(errorSummary);
      repairState.errors.push(
        `${tableName}${SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR}` +
          String(
            error?.message ||
              error ||
              ADMIN_SERVICE_DISCOVERY_LITERAL.UNKNOWN_ERROR,
          ),
      );
      return errorSummary;
    }

    finalizeAuthoritativeDiscoveryCacheRepairRun(
      repairState,
      repairTableNames,
      options,
    ) {
      const completedAtMs = this.nowFn();
      this.lastAuthoritativeDiscoveryRepairAtMs = completedAtMs;
      const outcome = this.resolveAuthoritativeDiscoveryRepairOutcome(
        repairState,
        repairTableNames,
      );
      const result = outcome.repairApplied ?
        this.storeSuccessfulAuthoritativeDiscoveryRepair(
          repairState,
          completedAtMs,
        ) :
        this.storeFailedAuthoritativeDiscoveryRepair(
          repairState,
          repairTableNames,
          outcome,
          completedAtMs,
        );
      this.logAuthoritativeDiscoveryCacheRepairResult(
        result,
        repairState,
        repairTableNames,
        options,
        outcome,
      );
      return result;
    }

    resolveAuthoritativeDiscoveryRepairOutcome(repairState, repairTableNames) {
      const repairApplied =
        repairState.failedTables.length === NUM.ZERO &&
        repairState.repairedTableCount === repairTableNames.length;
      const causeChain = repairState.errorSummaries
        .flatMap((summary) =>
          Array.isArray(summary?.causeChain) ?
            summary.causeChain :
            ADMIN_CACHE_DUMP.EMPTY,
        )
        .filter((value, index, values) => values.indexOf(value) === index);
      const readSource =
        repairState.errorSummaries.find((summary) => summary?.readSource)
          ?.readSource || null;
      const localQueryTransport =
        repairState.errorSummaries.find(
          (summary) => summary?.localQueryTransport,
        )?.localQueryTransport || null;
      const firstFailedParticipant =
        repairState.errorSummaries.find(
          (summary) => summary?.firstFailedParticipant,
        )?.firstFailedParticipant || null;
      const errorCodes = this.buildAuthoritativeDiscoveryRepairErrorCodes(
        repairState.errorSummaries,
        repairState.errors,
      );
      const failureClass = repairApplied ?
        null :
        resolveAuthoritativeRepairFailureClass(causeChain);
      const failureCount = repairApplied ?
        NUM.ZERO :
        this.resolveAuthoritativeDiscoveryRepairFailureCount(
          repairTableNames,
          failureClass,
        );
      const baseRetryAfterMs = repairApplied ?
        null :
        resolveAuthoritativeRepairFailureBaseRetryAfterMs(
          repairState.errorSummaries,
        );
      const maxRetryAfterMs = repairApplied ?
        null :
        resolveAuthoritativeRepairFailureMaxRetryAfterMs(
          failureClass,
          baseRetryAfterMs,
        );
      const retryAfterMs = repairApplied ?
        null :
        computeAuthoritativeRepairFailureRetryAfterMs(
          failureClass,
          failureCount,
          baseRetryAfterMs,
          maxRetryAfterMs,
        );
      return {
        repairApplied,
        causeChain,
        readSource,
        localQueryTransport,
        firstFailedParticipant,
        errorCodes,
        failureClass,
        failureCount,
        retryAfterMs,
      };
    }

    buildAuthoritativeDiscoveryRepairErrorCodes(errorSummaries, errors) {
      const errorCodeSet = new Set();
      for (const summary of Array.isArray(errorSummaries) ?
        errorSummaries :
        ADMIN_CACHE_DUMP.EMPTY) {
        if (summary?.errorCode) {
          errorCodeSet.add(summary.errorCode);
        }
      }
      for (const error of Array.isArray(errors) ?
        errors :
        ADMIN_CACHE_DUMP.EMPTY) {
        const errorCode =
          this.extractAuthoritativeDiscoveryRepairErrorCode(error);
        if (errorCode) {
          errorCodeSet.add(errorCode);
        }
      }
      return [...errorCodeSet].slice(NUM.ZERO, LOCAL_NUM_FIVE);
    }

    extractAuthoritativeDiscoveryRepairErrorCode(errorValue) {
      const message = String(errorValue || EMPTY_STRING);
      const separatorIndex = message.indexOf(
        SERVICE_DISCOVERY_REASON_DETAIL_SEPARATOR,
      );
      const summary =
        separatorIndex >= NUM.ZERO ?
          message.slice(separatorIndex + NUM.ONE).trim() :
          message.trim();
      return summary.length > NUM.ZERO ? summary : null;
    }

    storeSuccessfulAuthoritativeDiscoveryRepair(repairState, completedAtMs) {
      const result = {
        applied: true,
        skipped: false,
        tableCount: repairState.repairedTableCount,
        tableNames: [...repairState.repairedTableNames],
        repairedRowCount: repairState.repairedRowCount,
        completedAtMs,
        reused: false,
      };
      this.lastAuthoritativeDiscoveryRepairCompletedAtMs = completedAtMs;
      this.lastAuthoritativeDiscoveryRepairResult = result;
      this.lastAuthoritativeDiscoveryRepairFailureState = null;
      return result;
    }

    storeFailedAuthoritativeDiscoveryRepair(
      repairState,
      repairTableNames,
      outcome,
      completedAtMs,
    ) {
      this.lastAuthoritativeDiscoveryRepairCompletedAtMs = NUM.ZERO;
      this.lastAuthoritativeDiscoveryRepairResult = null;
      this.lastAuthoritativeDiscoveryRepairFailureState = {
        action: AUTHORITATIVE_REPAIR_FAILURE_ACTION.DEFER_REPAIR,
        requestedTableNames:
          normalizeAuthoritativeRepairTableNames(repairTableNames),
        failedTables: normalizeAuthoritativeRepairTableNames(
          repairState.failedTables,
        ),
        errors: [...repairState.errors],
        errorCodes: [...outcome.errorCodes],
        causeChain: [...outcome.causeChain],
        readSource: outcome.readSource,
        localQueryTransport: outcome.localQueryTransport,
        firstFailedParticipant: outcome.firstFailedParticipant,
        failureClass: outcome.failureClass,
        failureCount: outcome.failureCount,
        retryAfterMs: outcome.retryAfterMs,
        retryAtMs: completedAtMs + outcome.retryAfterMs,
        completedAtMs,
      };
      return {
        applied: false,
        skipped: false,
        tableCount: repairState.repairedTableCount,
        tableNames: [...repairState.repairedTableNames],
        requestedTableCount: repairTableNames.length,
        requestedTableNames: [...repairTableNames],
        repairedRowCount: repairState.repairedRowCount,
        failedTables: [...repairState.failedTables],
        errorCount: repairState.errors.length,
        errors: repairState.errors,
        causeChain: outcome.causeChain,
        readSource: outcome.readSource,
        localQueryTransport: outcome.localQueryTransport,
        firstFailedParticipant: outcome.firstFailedParticipant,
        failureClass: outcome.failureClass,
        failureCount: outcome.failureCount,
        retryAfterMs: outcome.retryAfterMs,
        completedAtMs,
        reused: false,
      };
    }

    logAuthoritativeDiscoveryCacheRepairResult(
      result,
      repairState,
      repairTableNames,
      options,
      outcome,
    ) {
      if (outcome.repairApplied !== true) {
        this.logger?.warn?.(LOCAL_STR_ABFPD, {
          nodeId: this.nodeId,
          reason: options.reason || null,
          tableName: options.tableName || null,
          tableId: options.tableId || null,
          repairTableNames,
          requestedTableCount: repairTableNames.length,
          repairedTableCount: repairState.repairedTableCount,
          repairedRowCount: repairState.repairedRowCount,
          failedTables: repairState.failedTables,
          errorCount: repairState.errors.length,
          errorCodes: outcome.errorCodes,
          errors: repairState.errors,
          causeChain: result.causeChain || [],
          failureClass: result.failureClass || null,
          failureCount: result.failureCount || NUM.ZERO,
          retryAfterMs: result.retryAfterMs || null,
          readSource: result.readSource || null,
          localQueryTransport: result.localQueryTransport || null,
          firstFailedParticipant: result.firstFailedParticipant || null,
        });
        return;
      }
      this.logger?.info?.(LOCAL_STR_LIZAB, {
        nodeId: this.nodeId,
        reason: options.reason || null,
        tableName: options.tableName || null,
        tableId: options.tableId || null,
        repairTableNames,
        repairedTableCount: repairState.repairedTableCount,
        repairedRowCount: repairState.repairedRowCount,
      });
    }

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
            TYPEOF.FUNCTION &&
          this.canReadAuthoritativeDiscoveryRows(),
      );
      const repairTableNames = hasCacheMutationTarget ?
        this.resolveAuthoritativeDiscoveryRepairTables(options) :
        [];
      const hasRepairTables = repairTableNames.length > NUM.ZERO;
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
      if (!Number.isFinite(completedAtMs) || completedAtMs <= NUM.ZERO) {
        return null;
      }
      const reuseWindowMs =
        Number.isFinite(options?.reuseWindowMs) &&
        options.reuseWindowMs > NUM.ZERO ?
          Math.floor(options.reuseWindowMs) :
          AUTHORITATIVE_DISCOVERY_REPAIR.REUSE_WINDOW_MS;
      if (!Number.isFinite(reuseWindowMs) || reuseWindowMs <= NUM.ZERO) {
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
        tableCount: NUM.ZERO,
        requestedTableCount: requestedRepairTables.length,
        requestedTableNames: [...requestedRepairTables],
        failedTables: Array.isArray(failureState.failedTables) ?
          [...failureState.failedTables] :
          ADMIN_CACHE_DUMP.EMPTY,
        errorCount: Array.isArray(failureState.errors) ?
          failureState.errors.length :
          NUM.ZERO,
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
          NUM.ZERO,
        retryAfterMs: Math.max(
          NUM.ZERO,
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
        requestedRepairTables.length > NUM.ZERO ?
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
        requestedRepairTables.length > NUM.ZERO ?
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
        return NUM.ONE;
      }
      return Math.max(
        NUM.ONE,
        Math.floor(Number(lastFailureState.failureCount) || NUM.ZERO) + NUM.ONE,
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
      return result?.mutationCount || NUM.ZERO;
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
        count: NUM.ONE,
        partitions: ADMIN_CACHE_DUMP.EMPTY,
        tableName: ADMIN_SERVICE_DISCOVERY.TABLE_NAME,
      };
    }
  }

  for (const methodName of Object.getOwnPropertyNames(
    AdminServiceDiscoveryRepairMethods.prototype,
  )) {
    if (methodName === LOCAL_STR_CONSTRUCTOR) {
      continue;
    }
    Object.defineProperty(
      AdminServiceDiscovery.prototype,
      methodName,
      Object.getOwnPropertyDescriptor(
        AdminServiceDiscoveryRepairMethods.prototype,
        methodName,
      ),
    );
  }
}

export {assignAdminServiceDiscoveryRepairMethods};
