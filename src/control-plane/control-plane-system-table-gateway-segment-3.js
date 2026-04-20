import { CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SHARED } from "./control-plane-system-table-gateway-shared.js";
import { ControlPlaneSystemTableGatewaySegment2 } from "./control-plane-system-table-gateway-segment-2.js";

const {
  CANONICAL_LEADER_ROUTING_GAP_STATE,
  CDC_OPERATION,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_CACHE_RECONCILE_DELETE_POLICY,
  CONTROL_PLANE_CACHE_RECONCILE_INTENT,
  CONTROL_PLANE_DEFERRED_MUTATION_FAILURE_SENTINEL,
  CONTROL_PLANE_GATEWAY_ERROR_CODE,
  CONTROL_PLANE_GATEWAY_LIMIT,
  CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_MUTATION_OUTCOME,
  CONTROL_PLANE_MUTATION_QUEUE_STATE,
  CONTROL_PLANE_OPERATION_LEDGER_LIMIT,
  CONTROL_PLANE_PHASE_SCOPE,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READ_OUTCOME,
  CONTROL_PLANE_READ_PROFILE,
  CONTROL_PLANE_READ_STRATEGY,
  CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY,
  CONTROL_PLANE_ROUTING_SNAPSHOT_FIELD,
  CONTROL_PLANE_SQL_OPERATION,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE,
  CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE,
  ControlPlaneDiagnosticsLedger,
  GATEWAY_ERROR_MSG,
  GATEWAY_LOG_MSG,
  INITIAL_PARTITION_IDS,
  METRICS_LOG_TAG,
  NUM,
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
  SQL,
  SYSTEM_TABLE_NAME,
  SYSTEM_TABLE_NAMES,
  TYPEOF,
  applyProfileDefault,
  applyReadWorkloadProfileDefaults,
  areCanonicalSystemTableRowsEqual,
  buildControlPlaneQueryOptions,
  buildControlPlaneWorkloadProfile,
  buildLocalControlPlaneMutationReadinessFailure,
  buildOwnerContractOutcome,
  buildPressureAdmissionFailure,
  canonicalizeSystemTableRow,
  copyOption,
  createDeferredPromise,
  extractSqlOperationKind,
  extractSystemTableNameFromSql,
  getControlPlaneErrorCode,
  getControlPlaneFailureSummary,
  getControlPlaneRetryAfterMs,
  getLocalControlPlaneMutationReadinessBlocker,
  getRemainingBudgetMs,
  getSystemCachePrimaryKeyFieldOrFallback,
  hasUsablePrimaryKeyValue,
  normalizeAuthoritativeReadMode,
  normalizeCoalescingToken,
  normalizeControlPlaneSystemTableVisibilityState,
  normalizeDistinctStringArray,
  normalizeMutationMergePolicy,
  normalizeMutationOperation,
  normalizePhaseScope,
  normalizePositiveInteger,
  normalizeReadProfile,
  normalizeReadStrategy,
  normalizeSqlOperationKind,
  normalizeSystemTableName,
  requiresStableLocalControlPlaneMutationReadiness,
  resolveAuthoritativeReadModeContract,
  resolveCanonicalLeaderIdentitySnapshot,
  resolveCanonicalLeaderRoutingGapState,
  resolveControlPlaneCacheReconcileDeletePolicy,
  resolveControlPlaneCacheReconcileIntent,
  resolveLegacyAuthoritativeReadMode,
  resolveMutationCompletionState,
  resolveReadProfileOptions,
  resolveReadStrategyForProfile,
  sortObjectKeys,
  stableSerialize,
} = CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SHARED;

class ControlPlaneSystemTableGatewaySegment3 extends ControlPlaneSystemTableGatewaySegment2 {
  async readRows(tableName, sql, params = [], options = {}) {
    const readProfile = normalizeReadProfile(
      options?.readProfile || options?.profile,
    );
    const profileStrategy = resolveReadStrategyForProfile(readProfile);
    const cdcIntegrationService = this.resolveCdcIntegrationService();
    const strategy = normalizeReadStrategy(
      options?.strategy ||
        options?.readStrategy ||
        profileStrategy ||
        (options?.bootstrapSnapshotRows ||
        typeof options?.readBootstrapSnapshot === TYPEOF.FUNCTION
          ? CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT
          : options?.cachePredicate ||
              typeof options?.readFromCache === TYPEOF.FUNCTION
            ? CONTROL_PLANE_READ_STRATEGY.CACHE
            : options?.requireAuthoritative === true
              ? CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED
              : typeof cdcIntegrationService?.executeAuthoritativeSystemTableRead ===
                  TYPEOF.FUNCTION
                ? CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE
                : CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED),
    );
    return this.executeRead(
      {
        tableName,
        sql,
        params,
        strategy,
        cachePredicate: options?.cachePredicate,
        readFromCache: options?.readFromCache,
        readBootstrapSnapshot: options?.readBootstrapSnapshot,
        bootstrapSnapshotRows: options?.bootstrapSnapshotRows,
        phaseScope: normalizePhaseScope(options?.phaseScope),
      },
      {
        ...options,
        readProfile,
      },
    );
  }

  /**
   * Canonical control-plane metadata read ingress.
   * One intent declares one strategy. The gateway executes that strategy only.
   *
   * @param {Object} readIntent
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async executeRead(readIntent = {}, options = {}) {
    const tableName = normalizeSystemTableName(readIntent?.tableName);
    const strategy = normalizeReadStrategy(readIntent?.strategy);
    const sql = readIntent?.sql || null;
    const params = Array.isArray(readIntent?.params) ? readIntent.params : [];
    const profiledOptions = resolveReadProfileOptions(options);
    const mergedOptions = {
      ...profiledOptions,
      strategy,
    };
    const authoritativeReadModeContract =
      resolveAuthoritativeReadModeContract(mergedOptions);
    const requestKey = this.buildReadRequestKey(
      tableName,
      sql,
      params,
      mergedOptions,
    );
    const telemetryContext = {
      startedAtMs: this.now(),
      owner: readIntent?.owner || options?.owner || null,
      tableName,
      strategy,
      readProfile: mergedOptions?.readProfile || null,
      authoritativeReadMode:
        authoritativeReadModeContract.authoritativeReadMode,
      workloadClass: mergedOptions?.workloadClass || null,
      workClass: mergedOptions?.workClass || PRESSURE_WORK_CLASS.INTERACTIVE,
      coalescingKey: normalizeCoalescingToken(mergedOptions?.coalescingKey),
    };
    try {
      const result = await this.runSingleFlight(
        this.inFlightReadRequestsByKey,
        requestKey,
        async () => {
          const pressureDecision = this.evaluateReadPressure(
            tableName,
            mergedOptions,
          );
          if (
            pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER ||
            pressureDecision.action === PRESSURE_GOVERNOR_ACTION.REJECT ||
            pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEGRADE
          ) {
            const failure = buildPressureAdmissionFailure(pressureDecision, {
              tableName,
            });
            return {
              ...failure,
              outcome:
                pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER
                  ? CONTROL_PLANE_READ_OUTCOME.DEFERRED
                  : CONTROL_PLANE_READ_OUTCOME.REJECTED,
              strategyUsed: strategy,
            };
          }

          switch (strategy) {
            case CONTROL_PLANE_READ_STRATEGY.CACHE:
              return this.executeCacheRead(
                tableName,
                readIntent,
                mergedOptions,
              );
            case CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE:
            case CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED:
              return this.executeAuthoritativeRead(
                tableName,
                sql,
                params,
                strategy,
                mergedOptions,
              );
            case CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED:
              return this.executeOwnerLocalRead(
                tableName,
                sql,
                params,
                mergedOptions,
              );
            case CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT:
              return this.executeBootstrapSnapshotRead(
                tableName,
                readIntent,
                mergedOptions,
              );
            default:
              return {
                success: false,
                error: "unsupported_control_plane_read_strategy",
                tableName,
                rows: [],
                outcome: CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
                strategyUsed: null,
              };
          }
        },
        {
          joinMetricName: "readSingleFlightJoinCount",
          bypassMetricName: "readTrackingBypassCount",
          maxTrackedRequests: this.gatewayLimits.maxTrackedReadRequests,
        },
      );
      this.recordControlPlaneOperation({
        operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.READ,
        tableName,
        strategy,
        authoritativeReadMode:
          authoritativeReadModeContract.authoritativeReadMode,
        workloadClass: mergedOptions?.workloadClass || null,
        routingReadinessDimension:
          mergedOptions?.routingReadinessDimension ||
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
        outcome: result?.outcome || null,
        success: result?.success === true,
        rowCount: Number.isFinite(result?.rowCount)
          ? result.rowCount
          : Array.isArray(result?.rows)
            ? result.rows.length
            : NUM.ZERO,
        source: result?.source || null,
        usedSqlFallback: result?.usedSqlFallback === true,
        error: result?.success === true ? null : result?.error || null,
        ...this.buildOperationLedgerDiagnostics(
          tableName,
          result,
          mergedOptions,
        ),
      });
      this.recordReadTelemetry(telemetryContext, result);
      return result;
    } catch (error) {
      this.recordControlPlaneOperation({
        operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.READ,
        tableName,
        strategy,
        authoritativeReadMode:
          authoritativeReadModeContract.authoritativeReadMode,
        workloadClass: mergedOptions?.workloadClass || null,
        routingReadinessDimension:
          mergedOptions?.routingReadinessDimension ||
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
        outcome: error?.outcome || CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
        success: false,
        rowCount: NUM.ZERO,
        error: error?.message || String(error),
        ...this.buildOperationLedgerDiagnostics(
          tableName,
          error,
          mergedOptions,
        ),
      });
      this.recordReadTelemetry(telemetryContext, {
        success: false,
        outcome: error?.outcome || CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
        rowCount: NUM.ZERO,
      });
      throw error;
    }
  }

  /**
   * @param {string} tableName
   * @param {Object} row
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async insertSystemTableRow(tableName, row, options = {}) {
    return this.submitMutation(
      {
        operation: CONTROL_PLANE_MUTATION_OPERATION.INSERT,
        tableName,
        row,
      },
      options,
    );
  }

  /**
   * @param {string} tableName
   * @param {Object} whereClause
   * @param {Object} data
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async updateSystemTableRow(tableName, whereClause, data, options = {}) {
    return this.submitMutation(
      {
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName,
        whereClause,
        data,
      },
      options,
    );
  }

  /**
   * @param {string} tableName
   * @param {Object} row
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async upsertSystemTableRow(tableName, row, options = {}) {
    return this.submitMutation(
      {
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
        tableName,
        row,
      },
      options,
    );
  }

  /**
   * @param {string} tableName
   * @param {Object} whereClause
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async deleteSystemTableRow(tableName, whereClause, options = {}) {
    return this.submitMutation(
      {
        operation: CONTROL_PLANE_MUTATION_OPERATION.DELETE,
        tableName,
        whereClause,
      },
      options,
    );
  }

  /**
   * Canonical control-plane mutation ingress for system-table writes.
   * Legacy insert/update/upsert/delete helpers delegate here so write
   * admission, routing, and backpressure policy stay on one path.
   *
   * @param {Object} mutation
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   */
  async submitMutation(mutation = {}, options = {}) {
    const operation = normalizeMutationOperation(mutation?.operation);
    const tableName = normalizeSystemTableName(mutation?.tableName);
    if (!operation) {
      throw new Error(GATEWAY_ERROR_MSG.MUTATION_OPERATION_REQUIRED);
    }
    if (!tableName) {
      throw new Error(GATEWAY_ERROR_MSG.MUTATION_TABLE_REQUIRED);
    }
    const normalizedMutation = {
      ...mutation,
      operation,
      tableName,
      row:
        operation === CONTROL_PLANE_MUTATION_OPERATION.INSERT ||
        operation === CONTROL_PLANE_MUTATION_OPERATION.UPSERT
          ? canonicalizeSystemTableRow(tableName, mutation?.row)
          : mutation?.row,
    };
    let writeOptions = this.buildWriteOptions(options);
    const cdcIntegrationService = this.resolveCdcIntegrationService();
    const { requestKey, mergePolicy } = this.buildMutationCoalescingDescriptor(
      normalizedMutation,
      writeOptions,
    );
    const recoveryCandidateSelectionKey =
      this.resolveMutationRecoveryCandidateSelectionKey(
        requestKey,
        writeOptions,
      );
    if (
      typeof recoveryCandidateSelectionKey === TYPEOF.STRING &&
      recoveryCandidateSelectionKey.length > NUM.ZERO
    ) {
      writeOptions = {
        ...writeOptions,
        recoveryCandidateSelectionKey,
      };
    }
    const telemetryContext = {
      startedAtMs: this.now(),
      owner: mutation?.owner || options?.owner || null,
      tableName,
      operation,
      workClass: writeOptions?.workClass || null,
      coalescingKey: normalizeCoalescingToken(writeOptions?.coalescingKey),
      mergePolicy,
    };
    const mutationReadinessFailure =
      this.resolveLocalDeferredMutationReadinessFailure(
        tableName,
        writeOptions,
      );
    if (mutationReadinessFailure) {
      this.recordControlPlaneOperation({
        operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION,
        tableName,
        mutationOperation: operation,
        routingReadinessDimension:
          writeOptions?.routingReadinessDimension ||
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
        outcome: mutationReadinessFailure.outcome,
        success: false,
        affectedRows: NUM.ZERO,
        error: mutationReadinessFailure.error,
        ...this.buildOperationLedgerDiagnostics(
          tableName,
          mutationReadinessFailure,
          {
            ...writeOptions,
            operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION,
          },
        ),
      });
      this.recordMutationTelemetry(telemetryContext, mutationReadinessFailure);
      return mutationReadinessFailure;
    }
    const executionFactory = async () => {
      if (!cdcIntegrationService) {
        if (this.shouldUseSqlMutationFallback(writeOptions)) {
          return this.executeSqlMutationFallback(
            normalizedMutation,
            writeOptions,
          );
        }
        throw new Error(GATEWAY_ERROR_MSG.CDC_REQUIRED);
      }
      if (operation === CONTROL_PLANE_MUTATION_OPERATION.INSERT) {
        if (
          !normalizedMutation?.row ||
          typeof normalizedMutation.row !== TYPEOF.OBJECT
        ) {
          throw new Error(GATEWAY_ERROR_MSG.MUTATION_ROW_REQUIRED);
        }
        return this.normalizeMutationResult(
          await cdcIntegrationService.insertSystemTableRow(
            tableName,
            normalizedMutation.row,
            writeOptions,
          ),
        );
      }
      if (operation === CONTROL_PLANE_MUTATION_OPERATION.UPDATE) {
        if (
          !normalizedMutation?.whereClause ||
          typeof normalizedMutation.whereClause !== TYPEOF.OBJECT
        ) {
          throw new Error(GATEWAY_ERROR_MSG.MUTATION_WHERE_REQUIRED);
        }
        if (
          !normalizedMutation?.data ||
          typeof normalizedMutation.data !== TYPEOF.OBJECT
        ) {
          throw new Error(GATEWAY_ERROR_MSG.MUTATION_DATA_REQUIRED);
        }
        return this.normalizeMutationResult(
          await cdcIntegrationService.updateSystemTableRow(
            tableName,
            normalizedMutation.whereClause,
            normalizedMutation.data,
            writeOptions,
          ),
        );
      }
      if (operation === CONTROL_PLANE_MUTATION_OPERATION.UPSERT) {
        if (
          !normalizedMutation?.row ||
          typeof normalizedMutation.row !== TYPEOF.OBJECT
        ) {
          throw new Error(GATEWAY_ERROR_MSG.MUTATION_ROW_REQUIRED);
        }
        return this.normalizeMutationResult(
          await cdcIntegrationService.upsertSystemTableRow(
            tableName,
            normalizedMutation.row,
            writeOptions,
          ),
        );
      }
      if (
        !normalizedMutation?.whereClause ||
        typeof normalizedMutation.whereClause !== TYPEOF.OBJECT
      ) {
        throw new Error(GATEWAY_ERROR_MSG.MUTATION_WHERE_REQUIRED);
      }
      return this.normalizeMutationResult(
        await cdcIntegrationService.deleteSystemTableRow(
          tableName,
          normalizedMutation.whereClause,
          writeOptions,
        ),
      );
    };

    if (
      mergePolicy === CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING &&
      requestKey
    ) {
      const result = await this.runReplacePendingMutation(
        requestKey,
        executionFactory,
      );
      this.recordMutationTelemetry(telemetryContext, result);
      return result;
    }

    if (
      mergePolicy === CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT &&
      requestKey
    ) {
      try {
        const result = await this.runSingleFlight(
          this.inFlightMutationRequestsByKey,
          requestKey,
          executionFactory,
          {
            joinMetricName: "mutationSingleFlightJoinCount",
            maxTrackedRequests: this.gatewayLimits.maxTrackedMutationRequests,
          },
        );
        this.recordControlPlaneOperation({
          operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION,
          tableName,
          mutationOperation: operation,
          routingReadinessDimension:
            writeOptions?.routingReadinessDimension ||
            CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
          outcome: result?.outcome || null,
          success: result?.success !== false,
          affectedRows: Number(
            result?.partitionResult?.affectedRows ??
              result?.affectedRows ??
              NUM.ZERO,
          ),
          error: result?.success === false ? result?.error || null : null,
          ...this.buildOperationLedgerDiagnostics(tableName, result, {
            ...writeOptions,
            operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION,
          }),
        });
        this.recordMutationTelemetry(telemetryContext, result);
        return result;
      } catch (error) {
        this.recordControlPlaneOperation({
          operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION,
          tableName,
          mutationOperation: operation,
          routingReadinessDimension:
            writeOptions?.routingReadinessDimension ||
            CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
          outcome:
            error?.outcome || CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
          success: false,
          affectedRows: NUM.ZERO,
          error: error?.message || String(error),
          ...this.buildOperationLedgerDiagnostics(tableName, error, {
            ...writeOptions,
            operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION,
          }),
        });
        this.recordMutationTelemetry(telemetryContext, {
          success: false,
          outcome:
            error?.outcome || CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
        });
        throw error;
      }
    }

    try {
      const result = await executionFactory();
      this.recordControlPlaneOperation({
        operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION,
        tableName,
        mutationOperation: operation,
        routingReadinessDimension:
          writeOptions?.routingReadinessDimension ||
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
        outcome: result?.outcome || null,
        success: result?.success !== false,
        affectedRows: Number(
          result?.partitionResult?.affectedRows ??
            result?.affectedRows ??
            NUM.ZERO,
        ),
        error: result?.success === false ? result?.error || null : null,
        ...this.buildOperationLedgerDiagnostics(tableName, result, {
          ...writeOptions,
          operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION,
        }),
      });
      this.recordMutationTelemetry(telemetryContext, result);
      return result;
    } catch (error) {
      this.recordControlPlaneOperation({
        operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION,
        tableName,
        mutationOperation: operation,
        routingReadinessDimension:
          writeOptions?.routingReadinessDimension ||
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
        outcome:
          error?.outcome || CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
        success: false,
        affectedRows: NUM.ZERO,
        error: error?.message || String(error),
        ...this.buildOperationLedgerDiagnostics(tableName, error, {
          ...writeOptions,
          operationClass: CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.MUTATION,
        }),
      });
      this.recordMutationTelemetry(telemetryContext, {
        success: false,
        outcome:
          error?.outcome || CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
      });
      throw error;
    }
  }

  /**
   * @param {string} tableName
   * @param {Object} readIntent
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  async executeCacheRead(tableName, readIntent, options) {
    const systemTableCache = this.resolveSystemTableCache();
    const readFromCache =
      typeof readIntent?.readFromCache === TYPEOF.FUNCTION
        ? readIntent.readFromCache
        : null;
    const cachePredicate =
      typeof readIntent?.cachePredicate === TYPEOF.FUNCTION
        ? readIntent.cachePredicate
        : null;
    if (!systemTableCache && !readFromCache) {
      return {
        success: false,
        tableName,
        rows: [],
        outcome: CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
        strategyUsed: CONTROL_PLANE_READ_STRATEGY.CACHE,
        error:
          CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.SYSTEM_TABLE_CACHE_UNAVAILABLE,
      };
    }

    let rows = [];
    if (readFromCache) {
      const cacheRows = await readFromCache(
        systemTableCache,
        readIntent,
        options,
      );
      rows = Array.isArray(cacheRows) ? cacheRows : [];
    } else if (
      cachePredicate &&
      typeof systemTableCache?.filter === TYPEOF.FUNCTION
    ) {
      rows = systemTableCache.filter(tableName, cachePredicate) || [];
    } else if (typeof systemTableCache?.getAll === TYPEOF.FUNCTION) {
      rows = systemTableCache.getAll(tableName) || [];
    }

    return {
      success: true,
      tableName,
      rows,
      rowCount: rows.length,
      outcome: CONTROL_PLANE_READ_OUTCOME.CACHE_HIT,
      strategyUsed: CONTROL_PLANE_READ_STRATEGY.CACHE,
    };
  }

  /**
   * @param {string} tableName
   * @param {string|null} sql
   * @param {Array<*>} params
   * @param {string} strategy
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  buildGatewayReadResult(
    baseResult,
    tableName,
    strategyUsed,
    outcome,
    extra = {},
  ) {
    return {
      ...baseResult,
      tableName,
      rows: Array.isArray(baseResult?.rows) ? baseResult.rows : [],
      outcome,
      strategyUsed,
      ...extra,
    };
  }

  /**
   * @param {string} tableName
   * @param {string} strategyUsed
   * @param {string} outcome
   * @param {string} error
   * @return {Object}
   * @private
   */
  buildUnavailableGatewayReadResult(tableName, strategyUsed, outcome, error) {
    return {
      success: false,
      tableName,
      rows: [],
      outcome,
      strategyUsed,
      error,
    };
  }

  /**
   * @param {string} strategy
   * @return {string}
   * @private
   */
  resolveAuthoritativeReadFailureOutcome(strategy) {
    return strategy === CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED
      ? CONTROL_PLANE_READ_OUTCOME.STALE_NOT_ALLOWED
      : CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY;
  }

  /**
   * @param {Object} result
   * @return {{outcome: string, completionState: string}}
   * @private
   */
  resolveNormalizedMutationState(result) {
    const affectedRows = Number(
      result?.partitionResult?.affectedRows ?? result?.affectedRows,
    );
    if (result?.outcome) {
      return {
        outcome: result.outcome,
        completionState: resolveMutationCompletionState(result),
      };
    } else if (result?.success === false) {
      return {
        outcome:
          result?.pressureAction === PRESSURE_GOVERNOR_ACTION.DEFER
            ? CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED
            : result?.pressureAction === PRESSURE_GOVERNOR_ACTION.REJECT
              ? CONTROL_PLANE_MUTATION_OUTCOME.REJECTED
              : CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY,
        completionState: resolveMutationCompletionState(result),
      };
    } else if (
      typeof result?.visibilityState === TYPEOF.STRING &&
      result.visibilityState !==
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL.VISIBLE
    ) {
      return {
        outcome: CONTROL_PLANE_MUTATION_OUTCOME.PENDING_VISIBILITY,
        completionState: CONTROL_PLANE_MUTATION_OUTCOME.PENDING_VISIBILITY,
      };
    } else if (Number.isFinite(affectedRows) && affectedRows <= NUM.ZERO) {
      return {
        outcome: CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED,
        completionState: CONTROL_PLANE_MUTATION_OUTCOME.OBSERVED_STATE_CHANGED,
      };
    }
    return {
      outcome: CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
      completionState: CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
    };
  }

  /**
   * @param {string} tableName
   * @param {Array<Object>} rows
   * @return {Object}
   * @private
   */
  buildBootstrapSnapshotSuccessResult(tableName, rows) {
    return {
      success: true,
      tableName,
      rows,
      rowCount: rows.length,
      outcome: CONTROL_PLANE_READ_OUTCOME.BOOTSTRAP_SNAPSHOT,
      strategyUsed: CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT,
    };
  }

  /**
   * @param {string} tableName
   * @param {string} error
   * @return {Object}
   * @private
   */
  buildBootstrapSnapshotFailureResult(tableName, error) {
    return this.buildUnavailableGatewayReadResult(
      tableName,
      CONTROL_PLANE_READ_STRATEGY.BOOTSTRAP_SNAPSHOT,
      CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
      error,
    );
  }

  /**
   * @param {string} tableName
   * @param {string|null} sql
   * @param {Array<*>} params
   * @param {string} strategy
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  async executeAuthoritativeRead(tableName, sql, params, strategy, options) {
    const cdcIntegrationService = this.resolveCdcIntegrationService();
    const authoritativeReadModeContract =
      resolveAuthoritativeReadModeContract(options);
    const allowSqlFallback = authoritativeReadModeContract.allowSqlFallback;
    if (
      typeof cdcIntegrationService?.executeAuthoritativeSystemTableRead !==
      TYPEOF.FUNCTION
    ) {
      if (
        allowSqlFallback &&
        strategy !== CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED
      ) {
        const sqlQueryEngine = this.resolveSqlQueryEngine();
        if (typeof sqlQueryEngine?.executeQuery === TYPEOF.FUNCTION) {
          const result = await sqlQueryEngine.executeQuery(
            sql,
            params,
            this.buildQueryOptions(options),
          );
          return this.buildGatewayReadResult(
            result,
            tableName,
            strategy,
            result?.success === true
              ? CONTROL_PLANE_READ_OUTCOME.AUTHORITATIVE
              : CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
            {
              source:
                CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE.SQL_QUERY_ENGINE,
              usedSqlFallback: true,
            },
          );
        }
      }
      return this.buildUnavailableGatewayReadResult(
        tableName,
        strategy,
        this.resolveAuthoritativeReadFailureOutcome(strategy),
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR.AUTHORITATIVE_READ_OWNER_UNAVAILABLE,
      );
    }

    const authoritativeResult =
      await cdcIntegrationService.executeAuthoritativeSystemTableRead(
        tableName,
        sql,
        params,
        {
          localReadConsistency:
            options?.localReadConsistency ||
            CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
          replicaFallbackConsistency:
            options?.replicaFallbackConsistency ||
            CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY,
          authoritativeReadMode:
            authoritativeReadModeContract.authoritativeReadMode,
          preferOwnerRpcRead: authoritativeReadModeContract.preferOwnerRpcRead,
          requireOwnerRpcRead:
            authoritativeReadModeContract.requireOwnerRpcRead,
          allowOwnerRpcFallback:
            authoritativeReadModeContract.allowOwnerRpcFallback,
          allowSqlFallback: authoritativeReadModeContract.allowSqlFallback,
          queryOptions: this.buildQueryOptions(options),
        },
      );

    return this.buildGatewayReadResult(
      authoritativeResult,
      tableName,
      strategy,
      authoritativeResult?.success === true
        ? CONTROL_PLANE_READ_OUTCOME.AUTHORITATIVE
        : this.resolveAuthoritativeReadFailureOutcome(strategy),
    );
  }

  /**
   * @param {string} tableName
   * @param {string|null} sql
   * @param {Array<*>} params
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  async executeOwnerLocalRead(tableName, sql, params, options) {
    const cdcIntegrationService = this.resolveCdcIntegrationService();
    const authoritativeReadModeContract =
      resolveAuthoritativeReadModeContract(options);
    if (
      typeof cdcIntegrationService?.executeAuthoritativeSystemTableRead ===
      TYPEOF.FUNCTION
    ) {
      const authoritativeResult =
        await cdcIntegrationService.executeAuthoritativeSystemTableRead(
          tableName,
          sql,
          params,
          {
            localReadConsistency:
              options?.localReadConsistency ||
              CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
            replicaFallbackConsistency:
              options?.replicaFallbackConsistency ||
              CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY,
            authoritativeReadMode:
              authoritativeReadModeContract.authoritativeReadMode,
            preferOwnerRpcRead:
              authoritativeReadModeContract.preferOwnerRpcRead,
            requireOwnerRpcRead:
              authoritativeReadModeContract.requireOwnerRpcRead,
            allowOwnerRpcFallback:
              authoritativeReadModeContract.allowOwnerRpcFallback,
            allowSqlFallback: authoritativeReadModeContract.allowSqlFallback,
            queryOptions: this.buildQueryOptions(options),
          },
        );
      return this.buildGatewayReadResult(
        authoritativeResult,
        tableName,
        CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED,
        authoritativeResult?.success === true
          ? CONTROL_PLANE_READ_OUTCOME.OWNER_LOCAL_NON_PROPAGATED
          : CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
        {
          rowCount: Number.isFinite(authoritativeResult?.rowCount)
            ? authoritativeResult.rowCount
            : Array.isArray(authoritativeResult?.rows)
              ? authoritativeResult.rows.length
              : NUM.ZERO,
        },
      );
    }
    const sqlQueryEngine = this.resolveSqlQueryEngine();
    if (typeof sqlQueryEngine?.executeQuery !== TYPEOF.FUNCTION) {
      return this.buildUnavailableGatewayReadResult(
        tableName,
        CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED,
        CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR.SQL_QUERY_ENGINE_UNAVAILABLE,
      );
    }
    const result = await sqlQueryEngine.executeQuery(
      sql,
      params,
      this.buildQueryOptions(options),
    );
    return this.buildGatewayReadResult(
      result,
      tableName,
      CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED,
      result?.success === false
        ? CONTROL_PLANE_READ_OUTCOME.OWNER_NOT_READY
        : CONTROL_PLANE_READ_OUTCOME.OWNER_LOCAL_NON_PROPAGATED,
    );
  }

  /**
   * @param {string} tableName
   * @param {Object} readIntent
   * @param {Object} options
   * @return {Promise<Object>}
   * @private
   */
  async executeBootstrapSnapshotRead(tableName, readIntent, options) {
    const phaseScope = normalizePhaseScope(
      readIntent?.phaseScope || options?.phaseScope,
    );
    if (!phaseScope) {
      return this.buildBootstrapSnapshotFailureResult(
        tableName,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR.BOOTSTRAP_SNAPSHOT_PHASE_SCOPE_REQUIRED,
      );
    } else if (typeof readIntent?.readBootstrapSnapshot === TYPEOF.FUNCTION) {
      const rows = await readIntent.readBootstrapSnapshot(readIntent, options);
      return this.buildBootstrapSnapshotSuccessResult(
        tableName,
        Array.isArray(rows) ? rows : [],
      );
    } else if (!Array.isArray(readIntent?.bootstrapSnapshotRows)) {
      return this.buildBootstrapSnapshotFailureResult(
        tableName,
        CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR.BOOTSTRAP_SNAPSHOT_UNAVAILABLE,
      );
    }
    return this.buildBootstrapSnapshotSuccessResult(
      tableName,
      readIntent.bootstrapSnapshotRows,
    );
  }

  /**
   * @param {Object} result
   * @param {Object} normalizedState
   * @return {Object}
   * @private
   */
  resolveNormalizedMutationContractOutcome(result, normalizedState) {
    const visibilityState = normalizeControlPlaneSystemTableVisibilityState(
      result?.visibilityState,
      null,
    );
    if (
      visibilityState ===
      CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.DEFERRED_BY_PRESSURE
    ) {
      return buildOwnerContractOutcome({
        contractState: OWNER_CONTRACT_STATE.DEFERRED,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
      });
    }
    if (
      visibilityState ===
        CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.PENDING_VISIBILITY ||
      visibilityState ===
        CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE.AUTHORITATIVE_CONFIRMATION_PENDING
    ) {
      return buildOwnerContractOutcome({
        contractState: OWNER_CONTRACT_STATE.PENDING,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.WAIT,
      });
    }
    if (
      normalizedState.outcome === CONTROL_PLANE_MUTATION_OUTCOME.DEFERRED ||
      normalizedState.outcome === CONTROL_PLANE_MUTATION_OUTCOME.OWNER_NOT_READY
    ) {
      return buildOwnerContractOutcome({
        contractState: OWNER_CONTRACT_STATE.DEFERRED,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.RETRY,
      });
    }
    if (normalizedState.outcome === CONTROL_PLANE_MUTATION_OUTCOME.REJECTED) {
      return buildOwnerContractOutcome({
        contractState: OWNER_CONTRACT_STATE.BLOCKED,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.STOP,
      });
    }
    if (result?.success === false) {
      return buildOwnerContractOutcome({
        contractState: OWNER_CONTRACT_STATE.FAILED,
        nextAction: OWNER_CONTRACT_NEXT_ACTION.STOP,
      });
    }
    return buildOwnerContractOutcome({
      contractState: OWNER_CONTRACT_STATE.READY,
      nextAction: OWNER_CONTRACT_NEXT_ACTION.PROCEED,
    });
  }

  /**
   * @param {Object} result
   * @return {Object}
   * @private
   */
}

export { ControlPlaneSystemTableGatewaySegment3 };
