import { CDC_INTEGRATION_SERVICE_SHARED } from "./cdc-integration-service-shared.js";
import { CDCIntegrationServiceSegment1 } from "./cdc-integration-service-segment-1.js";

const {
  ADDRESS,
  AUTHORITATIVE_FALLBACK_OUTCOME,
  AUTHORITATIVE_FALLBACK_PHASE,
  AUTHORITATIVE_FALLBACK_RECENT_LIMIT,
  AUTHORITATIVE_FALLBACK_REPAIR_BUDGET_MS,
  AUTHORITATIVE_FALLBACK_RETRY_DELAY_MS,
  AUTHORITATIVE_FALLBACK_WINDOW_MS,
  AUTHORITATIVE_READ_SOURCE,
  AUTHORITATIVE_ROW_VERSION_FIELD_CANDIDATES,
  CDCEventHandler,
  CDCOperationType,
  CDC_CONFIG_KEY,
  CDC_DEFAULTS,
  CDC_EPOCH_CONFIG_KEY,
  CDC_ERROR_MSG,
  CDC_EVENT,
  CDC_INTEGRATION_SERVICE_ERROR,
  CDC_INTEGRATION_SERVICE_LITERAL,
  CDC_LOG_MSG,
  CDC_OPERATION,
  CDC_OPERATION_LABEL,
  CDC_OWNER_HANDOFF_CLOSED_FRAGMENT,
  CDC_OWNER_HANDOFF_CONNECTION_TO_NODE_FRAGMENT,
  CDC_OWNER_HANDOFF_ROUTING_ERROR_FRAGMENTS,
  CDC_PRIMARY_KEY,
  CDC_RETRY,
  CDC_SESSION,
  CDC_SKIP_REASON,
  CDC_SOURCE,
  CDC_SQL,
  CDC_STATS_DEFAULT,
  CDC_SUBSYSTEM,
  CDC_SYSTEM_WRITE_RECOVERY_CANDIDATE_SELECTION_KIND,
  COLUMN,
  CONTROL_PLANE_MUTATION_READINESS_ERROR,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_SYSTEM_TABLE_VISIBILITY_STATE,
  ConfigurationManager,
  ENTITY_TYPE,
  ENTRYPOINT_DEFAULT,
  EPOCH_CONFIG_KEY,
  ERRORS,
  EventEmitter,
  HLCClockService,
  INITIAL_PARTITION_IDS,
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
  LoggingService,
  METRICS_LOG_TAG,
  NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE,
  NUM,
  OWNER_CONTRACT_NEXT_ACTION,
  OWNER_CONTRACT_STATE,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PROTOCOL,
  PressureGovernor,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_TRANSPORT_NOT_READY_ERROR_CODE,
  READ_MODEL_DIVERGENCE_TYPE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  SQL,
  SQL_RECONCILIATION_REASON,
  STATE,
  STRING,
  SYSTEM_TABLE_NAME,
  SYSTEM_TABLE_VISIBILITY_STATE,
  TABLE_WRITE_FAILURE_LOG_SUPPRESSED_TABLES,
  TABLE_WRITE_METRIC_SUPPRESSED_TABLES,
  TIMEOUT_BUDGET_CLASSIFICATION,
  TIME_MS,
  TYPEOF,
  VALID_SYSTEM_TABLES,
  WRITE_ROUTER_MODE,
  annotateSystemTableMutationError,
  buildCDCNodeJoinedResult,
  buildDivergenceEvent,
  buildOwnerContractOutcome,
  buildPendingVisibilityTimeoutResult,
  buildPressureAdmissionFailure,
  buildSystemTableMutationError,
  buildSystemTableVisibilityResult,
  canonicalizeSystemTableRow,
  createBootstrapDirectWriteRouter,
  createSqlWriteRouter,
  createTimeoutBudget,
  createTimeoutBudgetError,
  delay,
  getControlPlaneErrorCode,
  getControlPlaneErrorMessage,
  getControlPlaneRetryAfterMs,
  getRemainingBudgetMs,
  getSchemaByTableName,
  getSystemCachePrimaryKeyFieldOrFallback,
  hasControlPlaneMutationRoutingGapFailureSignature,
  hasSystemTableOwnerHandoffFailureSignature,
  isCacheVisibilityTimeoutError,
  isRetryableControlPlaneError,
  isSystemTableOwnerHandoffFailure,
  isTableInternalCachePropagationEnabled,
  logSystemTableWriteFailure,
  materializeNormalizedDefaultValue,
  normalizeAuthoritativeFallbackOutcome,
  normalizeAuthoritativeFallbackPhase,
  normalizeControlPlaneSystemTableVisibilityState,
  normalizeDeliveryPriority,
  normalizeLocalQueryTransportReadiness,
  normalizeSystemTableVisibilityResult,
  normalizeSystemTableVisibilityState,
  normalizeSystemTableWriteMode,
  normalizeSystemWriteRecoveryCandidateSelectionKeyValue,
  resolveAuthoritativeFallbackOutcome,
  resolveNodeWebSocketAddress,
  resolveSystemTableMutationDeliveryPriority,
  resolveSystemTableOwnerHandoffFailureTableName,
  resolveSystemTableVisibilityContractOutcome,
  shouldEmitTableWriteMetric,
  shouldLogTableWriteFailure,
  sortMutationKeyObject,
  stableSerializeMutationKey,
  uuidv4,
} = CDC_INTEGRATION_SERVICE_SHARED;

class CDCIntegrationServiceSegment2 extends CDCIntegrationServiceSegment1 {
  async tryExecuteLocalSystemTableWrite(sql, params = []) {
    if (!sql || typeof sql !== TYPEOF.STRING) {
      return {
        handled: false,
      };
    }
    if (
      sql
        .trim()
        .toUpperCase()
        .startsWith(CDC_INTEGRATION_SERVICE_LITERAL.SELECT)
    ) {
      return {
        handled: false,
      };
    }
    const tableNameResult = this.extractTableNameFromSQL(sql);
    const tableName =
      tableNameResult.state ===
      CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_FOUND
        ? tableNameResult.tableName
        : null;
    if (!tableName || !VALID_SYSTEM_TABLES.includes(tableName)) {
      return {
        handled: false,
      };
    }
    const localServices = this.resolveLocalSystemTableServices(tableName, {
      consistency: LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER,
    });
    if (localServices.length === NUM.ZERO) {
      return {
        handled: false,
      };
    }
    for (const partitionService of localServices) {
      if (typeof partitionService?.executeQuery !== TYPEOF.FUNCTION) {
        continue;
      }
      try {
        const localResult = await partitionService.executeQuery(sql, params);
        const result = this.normalizeLocalSystemTableWriteResult(localResult);
        if (!result || result.success === false) {
          const message = result?.error || "";
          if (this.isTransientCdcError(message)) {
            continue;
          }
        }
        return {
          handled: true,
          result,
        };
      } catch (error) {
        if (
          this.isTransientCdcError(
            error?.message || CDC_INTEGRATION_SERVICE_LITERAL.EMPTY,
          )
        ) {
          continue;
        }
        throw error;
      }
    }
    return {
      handled: false,
    };
  }

  /**
   * Validate table name is a valid system table.
   * @param {string} tableName - Table name to validate.
   * @throws {Error} If table name is invalid.
   * @private
   */
  validateTableName(tableName) {
    if (!VALID_SYSTEM_TABLES.includes(tableName)) {
      throw new Error(
        `${CDC_ERROR_MSG.INVALID_TABLE_PREFIX}${tableName}. ` +
          `${CDC_ERROR_MSG.VALID_TABLES_PREFIX}` +
          `${VALID_SYSTEM_TABLES.join(CDC_SQL.COMMA_SPACE)}`,
      );
    }
  }

  /**
   * Validate data has required id field.
   * @param {Object} data - Data to validate.
   * @param {string} operation - Operation type for error message.
   * @throws {Error} If data is invalid.
   * @private
   */
  validateData(data, operation) {
    if (!data || typeof data !== TYPEOF.OBJECT) {
      throw new Error(`${operation}${CDC_ERROR_MSG.DATA_REQUIRED_SUFFIX}`);
    }
  }

  /**
   * Execute SQL directly on a local partition service (bootstrap mode only).
   *
   * Bootstrap Mode Direct Write Path:
   * - Bypasses SQL routing and system cache lookup
   * - Writes directly to local partition service
   * - Only used during seed node bootstrap before cache is populated
   * - After bootstrap, this path is never used again
   *
   * Process:
   * 1. Extract table name from SQL
   * 2. Find local partition service for that table
   * 3. Execute SQL directly on partition
   * 4. Return result
   *
   * Requirements: 8.3
   * @param {string} sql - SQL query string.
   * @param {Array} params - Query parameters.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeSQLDirectToLocalPartition(sql, params = [], _options = {}) {
    if (!this.bootstrapMode || !this.localPartitionServices) {
      throw new Error(CDC_LOG_MSG.BOOTSTRAP_MODE_REQUIRED_FOR_DIRECT_SQL);
    }

    // Extract table name from SQL
    const tableNameResult = this.extractTableNameFromSQL(sql);
    if (
      tableNameResult.state !==
      CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_FOUND
    ) {
      throw new Error(`Could not extract table name from SQL: ${sql}`);
    }
    const tableName = tableNameResult.tableName;
    const targetPartitionId = INITIAL_PARTITION_IDS[tableName] || null;
    const candidates = [];
    for (const service of this.localPartitionServices.values()) {
      if (!service) {
        continue;
      }
      if (targetPartitionId) {
        if (service.partitionId === targetPartitionId) {
          candidates.push(service);
        }
        continue;
      }
      if (service.tableName === tableName || service.tableId === tableName) {
        candidates.push(service);
      }
    }

    // In bootstrap mode, services should already be initialized.
    // Skip the wait loop if we have candidates - they're ready to use.
    const initializedCandidates =
      candidates.length > NUM.ZERO ? candidates : [];
    if (initializedCandidates.length === NUM.ZERO) {
      const partitionIds = candidates
        .map((service) => service?.partitionId)
        .filter(Boolean)
        .join(", ");
      throw new Error(
        `Partition services not initialized for table: ${tableName}. ` +
          `Partitions: ${partitionIds}`,
      );
    }
    const leaderService = initializedCandidates.find(
      (service) => service.isLeader,
    );
    const partitionService =
      leaderService || initializedCandidates[NUM.ZERO] || null;
    if (!partitionService) {
      const availablePartitions = Array.from(
        this.localPartitionServices.values(),
      )
        .map((service) => service?.partitionId)
        .filter(Boolean);
      throw new Error(
        `No local partition service found for table: ${tableName}. ` +
          `Available partitions: ${availablePartitions.join(CDC_INTEGRATION_SERVICE_LITERAL.EMPTY_2)}`,
      );
    }
    this.logger.debug(
      CDC_INTEGRATION_SERVICE_LITERAL.EXECUTING_SQL_DIRECTLY_ON_LOCAL_PARTITION_BOOTSTRAP_MODE,
      {
        nodeId: this.nodeId,
        tableName,
        partitionId: partitionService.partitionId,
        sql: sql.substring(NUM.ZERO, Math.min(sql.length, NUM.HUNDRED)),
      },
    );
    const isSelect = sql.trim().toUpperCase().startsWith("SELECT");

    // Execute SQL directly on local partition(s) without raft during bootstrap.
    if (isSelect) {
      const result = await partitionService.executeLocalQuery(sql, params);
      if (!result || result.success === false) {
        throw new Error(
          result?.error ||
            `Direct partition query failed for table: ${tableName}`,
        );
      }
      return result;
    }
    const targets = initializedCandidates;
    const results = [];
    for (const service of targets) {
      const result = await service.executeLocalQuery(sql, params);
      results.push(result);
      if (!result || result.success === false) {
        throw new Error(
          result?.error ||
            `Direct partition write failed for table: ${tableName}`,
        );
      }
    }
    return results[NUM.ZERO];
  }

  /**
   * Extract table name from SQL statement.
   * Supports INSERT INTO, UPDATE, DELETE FROM, and SQLite
   * INSERT OR <modifier> INTO statements.
   *
   * @param {string} sql - SQL query string.
   * @return {Object} Explicit table-name extraction result.
   * @private
   */
  extractTableNameFromSQL(sql) {
    if (!sql || typeof sql !== TYPEOF.STRING) {
      return Object.freeze({
        state:
          CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_INVALID_INPUT,
      });
    }

    // INSERT INTO table_name or INSERT OR <modifier> INTO table_name
    let match = sql.match(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)/i);
    if (match) {
      return Object.freeze({
        state:
          CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_FOUND,
        tableName: match[NUM.ONE],
      });
    }

    // UPDATE table_name SET
    match = sql.match(/UPDATE\s+(\w+)\s+SET/i);
    if (match) {
      return Object.freeze({
        state:
          CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_FOUND,
        tableName: match[NUM.ONE],
      });
    }

    // DELETE FROM table_name
    match = sql.match(/DELETE\s+FROM\s+(\w+)/i);
    if (match) {
      return Object.freeze({
        state:
          CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_FOUND,
        tableName: match[NUM.ONE],
      });
    }

    // SELECT FROM table_name (for completeness, though not used in bootstrap)
    match = sql.match(/FROM\s+(\w+)/i);
    if (match) {
      return Object.freeze({
        state:
          CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_FOUND,
        tableName: match[NUM.ONE],
      });
    }
    return Object.freeze({
      state:
        CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_NOT_FOUND,
    });
  }

  /**
   * Resolve the canonical SQL session for one routed steady-state system-table
   * write so owner-managed CDC writes never share the default user session.
   * @param {Object} [options={}]
   * @return {string}
   * @private
   */
  resolveSystemWriteSessionId(options = {}) {
    if (options?.disableSystemWriteSession === true) {
      return null;
    }
    if (
      typeof options.sessionId === TYPEOF.STRING &&
      options.sessionId.length > NUM.ZERO
    ) {
      return options.sessionId;
    }
    return `${CDC_SESSION.SYSTEM_WRITE_PREFIX}:${uuidv4()}`;
  }

  resolveSystemWriteRecoveryCandidateSelectionKey(
    tableName,
    sql,
    params = [],
    options = {},
  ) {
    const explicitSelectionKey =
      normalizeSystemWriteRecoveryCandidateSelectionKeyValue(
        options?.recoveryCandidateSelectionKey,
      );
    if (explicitSelectionKey !== null) {
      return explicitSelectionKey;
    }
    const explicitCoalescingKey =
      normalizeSystemWriteRecoveryCandidateSelectionKeyValue(
        options?.coalescingKey,
      );
    if (explicitCoalescingKey !== null) {
      return stableSerializeMutationKey({
        kind: CDC_SYSTEM_WRITE_RECOVERY_CANDIDATE_SELECTION_KIND,
        tableName,
        coalescingKey: explicitCoalescingKey,
        routingReadinessDimension:
          options?.routingReadinessDimension ||
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      });
    }
    const explicitSessionId =
      normalizeSystemWriteRecoveryCandidateSelectionKeyValue(
        options?.sessionId,
      );
    if (explicitSessionId !== null) {
      return explicitSessionId;
    }
    return stableSerializeMutationKey({
      kind: CDC_SYSTEM_WRITE_RECOVERY_CANDIDATE_SELECTION_KIND,
      tableName,
      sql,
      params: Array.isArray(params) ? params : [],
      workClass: options?.workClass || null,
      deliveryPriority: normalizeDeliveryPriority(
        options?.deliveryPriority,
        resolveSystemTableMutationDeliveryPriority({ tableName }),
      ),
      routingReadinessDimension:
        options?.routingReadinessDimension ||
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    });
  }

  /**
   * Execute a SQL query through the query engine or directly to local partition.
   *
   * Routing Logic:
   * - Bootstrap mode enabled: Direct write to local partition (seed node only)
   * - Bootstrap mode disabled: Route through SQL engine to partition leader
   *
   * Normal Mode Flow:
   * 1. SQL engine uses system cache to find partition
   * 2. System cache provides partition leader address
   * 3. Message router delivers query to leader
   * 4. Partition executes query and generates CDC event
   * 5. CDC event updates all node caches
   *
   * Requirements: 8.4, 8.5
   * @param {string} sql - SQL query string.
   * @param {Array} params - Query parameters.
   * @param {Object} [options={}] - Query execution options.
   * @return {Promise<Object>} Query result.
   * @private
   */
  async executeSQLViaQueryEngine(sql, params = [], options = {}) {
    // SQL-routed mode: Route through SQL engine to partition leader
    if (!this.sqlQueryEngine) {
      throw new Error(
        `${CDC_ERROR_MSG.CDC_ENGINE_MISSING_PREFIX}` +
          `${CDC_ERROR_MSG.CDC_ENGINE_MISSING_DETAIL}`,
      );
    }
    const maxAttempts = Math.max(
      CDC_RETRY.MIN_ATTEMPTS,
      Number(this.retryMaxAttempts) || CDC_DEFAULTS.RETRY_MAX_ATTEMPTS,
    );
    const baseDelayMs = Math.max(
      CDC_RETRY.MIN_DELAY_MS,
      Number(this.retryDelayMs) || CDC_DEFAULTS.RETRY_DELAY_MS,
    );
    const tableNameResult = this.extractTableNameFromSQL(sql);
    const tableName =
      tableNameResult.state ===
      CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_FOUND
        ? tableNameResult.tableName
        : null;
    const pressureDecision = PressureGovernor.getShared({
      nodeId: this.nodeId,
      messageRouter: this.messageRouter,
    }).evaluate({
      workClass: options?.workClass || PRESSURE_WORK_CLASS.CRITICAL,
      resourceKeys: [
        "control-plane:write",
        `control-plane:table:${tableName || "unknown"}`,
      ],
      allowDegrade: false,
      allowDefer: options?.allowPressureDefer === true,
      retryAfterMs: options?.pressureRetryAfterMs,
    });
    const queryTimeoutMs = Number(options?.queryTimeoutMs);
    const queryExecutionBudgetMs =
      Number.isFinite(queryTimeoutMs) && queryTimeoutMs > NUM.ZERO
        ? Math.floor(queryTimeoutMs)
        : null;
    const queryExecutionDeadlineMs =
      queryExecutionBudgetMs === null
        ? null
        : Date.now() + queryExecutionBudgetMs;
    const getRemainingQueryExecutionBudgetMs = () => {
      if (queryExecutionDeadlineMs === null) {
        return null;
      }
      return Math.max(NUM.ZERO, queryExecutionDeadlineMs - Date.now());
    };
    const waitForRetryBudget = async (delayMs) => {
      const normalizedDelayMs =
        Number.isFinite(delayMs) && delayMs > NUM.ZERO
          ? Math.floor(delayMs)
          : NUM.ZERO;
      const remainingBudgetMs = getRemainingQueryExecutionBudgetMs();
      if (remainingBudgetMs === null) {
        if (normalizedDelayMs > NUM.ZERO) {
          await delay(normalizedDelayMs);
        }
        return true;
      }
      if (remainingBudgetMs <= NUM.ZERO) {
        return false;
      }
      if (normalizedDelayMs > remainingBudgetMs) {
        return false;
      }
      if (normalizedDelayMs > NUM.ZERO) {
        await delay(normalizedDelayMs);
      }
      const nextRemainingBudgetMs = getRemainingQueryExecutionBudgetMs();
      return nextRemainingBudgetMs === null || nextRemainingBudgetMs > NUM.ZERO;
    };
    if (
      pressureDecision.action === PRESSURE_GOVERNOR_ACTION.DEFER ||
      pressureDecision.action === PRESSURE_GOVERNOR_ACTION.REJECT
    ) {
      return buildPressureAdmissionFailure(pressureDecision, {
        tableName,
      });
    }
    const sessionId = this.resolveSystemWriteSessionId(options);
    const baseQueryOptions = {
      recoveryCandidateSelectionKey:
        this.resolveSystemWriteRecoveryCandidateSelectionKey(
          tableName,
          sql,
          params,
          options,
        ),
      workClass: options?.workClass,
      allowPressureDefer: options?.allowPressureDefer,
      pressureRetryAfterMs: options?.pressureRetryAfterMs,
      deliveryPriority: normalizeDeliveryPriority(
        options?.deliveryPriority,
        resolveSystemTableMutationDeliveryPriority({ tableName }),
      ),
      routingReadinessDimension:
        options?.routingReadinessDimension ||
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    };
    if (typeof sessionId === TYPEOF.STRING && sessionId.length > NUM.ZERO) {
      baseQueryOptions.sessionId = sessionId;
    }
    if (options?.cancellationToken) {
      baseQueryOptions.cancellationToken = options.cancellationToken;
    }
    for (let attempt = NUM.ONE; attempt <= maxAttempts; attempt += NUM.ONE) {
      try {
        const remainingBudgetMs = getRemainingQueryExecutionBudgetMs();
        if (remainingBudgetMs !== null && remainingBudgetMs <= NUM.ZERO) {
          throw buildSystemTableMutationError(
            {
              success: false,
              error: tableName
                ? `${tableName}_mutation_retry_timeout_exhausted`
                : ERRORS.QUERY_FAILED,
              errorCode: null,
            },
            ERRORS.QUERY_FAILED,
          );
        }
        const attemptStartMs = Date.now();
        const queryOptions = {
          ...baseQueryOptions,
        };
        if (remainingBudgetMs !== null) {
          queryOptions.timeoutMs = remainingBudgetMs;
        } else if (
          Number.isFinite(queryTimeoutMs) &&
          queryTimeoutMs > NUM.ZERO
        ) {
          queryOptions.timeoutMs = Math.floor(queryTimeoutMs);
        }
        if (!this.bootstrapMode) {
          const localWriteResult = await this.tryExecuteLocalSystemTableWrite(
            sql,
            params,
          );
          if (localWriteResult.handled) {
            return localWriteResult.result;
          }
        }
        const result = await this.sqlQueryEngine.executeQuery(
          sql,
          params,
          queryOptions,
        );
        if (result && result.success === false) {
          const message = result.error || ERRORS.QUERY_FAILED;
          if (
            this.shouldRetryRoutedSystemTableMutationFailure(
              result,
              tableName,
            ) &&
            attempt < maxAttempts
          ) {
            this.logger.warn(CDC_LOG_MSG.TRANSIENT_SQL_RETRY, {
              nodeId: this.nodeId,
              attempt,
              maxAttempts,
              error: message,
              retryAfterMs: getControlPlaneRetryAfterMs(result),
            });
            if (
              !(await waitForRetryBudget(
                this.resolveTransientCdcRetryDelayMs(
                  baseDelayMs,
                  attempt,
                  result,
                ),
              ))
            ) {
              throw buildSystemTableMutationError(result, message);
            }
            continue;
          }
          throw buildSystemTableMutationError(result, message);
        }
        if (shouldEmitTableWriteMetric(tableName)) {
          try {
            const durationMs = Date.now() - attemptStartMs;
            this.logger.info(METRICS_LOG_TAG.CDC_SQL_ROUTE, {
              durationMs,
              attempt,
              maxAttempts,
              bootstrapMode:
                this.writeRouter?.mode === WRITE_ROUTER_MODE.BOOTSTRAP_DIRECT,
              tableName,
            });
          } catch (_metricsErr) {
            // Metrics logging must not propagate to callers
          }
        }
        return result;
      } catch (error) {
        const message = error?.message || String(error);
        if (
          !this.shouldRetryRoutedSystemTableMutationFailure(error, tableName) ||
          attempt >= maxAttempts
        ) {
          annotateSystemTableMutationError(error, {
            attempt,
            writeMode:
              this.writeRouter?.mode === WRITE_ROUTER_MODE.BOOTSTRAP_DIRECT
                ? WRITE_ROUTER_MODE.BOOTSTRAP_DIRECT
                : WRITE_ROUTER_MODE.SQL_ROUTED,
          });
          throw error;
        }
        this.logger.warn(CDC_LOG_MSG.TRANSIENT_SQL_EXCEPTION_RETRY, {
          nodeId: this.nodeId,
          attempt,
          maxAttempts,
          error: message,
          retryAfterMs: getControlPlaneRetryAfterMs(error),
        });
        if (
          !(await waitForRetryBudget(
            this.resolveTransientCdcRetryDelayMs(baseDelayMs, attempt, error),
          ))
        ) {
          annotateSystemTableMutationError(error, {
            attempt,
            writeMode:
              this.writeRouter?.mode === WRITE_ROUTER_MODE.BOOTSTRAP_DIRECT
                ? WRITE_ROUTER_MODE.BOOTSTRAP_DIRECT
                : WRITE_ROUTER_MODE.SQL_ROUTED,
          });
          throw error;
        }
      }
    }

    // Should be unreachable due to throws/returns above.
    throw new Error(ERRORS.QUERY_FAILED);
  }

  /**
   * Execute SQL using the active write-router strategy.
   * @param {string} sql
   * @param {Array} params
   * @param {Object} [options={}]
   * @return {Promise<Object>}
   * @private
   */
  async executeSQL(sql, params = [], options = {}) {
    if (
      !this.writeRouter ||
      typeof this.writeRouter.execute !== TYPEOF.FUNCTION
    ) {
      throw new Error(
        CDC_INTEGRATION_SERVICE_LITERAL.CDC_WRITE_ROUTER_IS_NOT_CONFIGURED,
      );
    }
    return this.writeRouter.execute(sql, params, options);
  }

  /**
   * Determine if a CDC write failure is transient and should be retried.
   * @param {*} errorLike - Error object, result, or message.
   * @return {boolean} True if transient.
   * @private
   */
  isTransientCdcError(errorLike) {
    const message =
      typeof errorLike === TYPEOF.STRING
        ? errorLike
        : errorLike?.message || errorLike?.error || "";
    return (
      isRetryableControlPlaneError(errorLike) ||
      message.includes(ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE) ||
      message.includes(ERRORS.PARTITION_SERVICE_NOT_FOUND) ||
      message === ERRORS.QUERY_FAILED ||
      message.includes(QUERY_ERROR_MSG.DISTRIBUTED_PARTICIPANT_FAILURE) ||
      message.includes(ERRORS.SYSTEM_CACHE_NOT_AVAILABLE) ||
      message.includes(ERRORS.SYSTEM_CACHE_PARTITION_LOOKUP_UNAVAILABLE) ||
      message.includes(ERRORS.NO_HANDLER_FOR_ADDRESS) ||
      message.includes(CDC_INTEGRATION_SERVICE_LITERAL.NO_CONNECTION_TO_NODE) ||
      message.includes(
        CDC_INTEGRATION_SERVICE_LITERAL.FAILED_TO_FORWARD_WRITE_TO_LEADER,
      ) ||
      message.includes(CDC_INTEGRATION_SERVICE_LITERAL.MESSAGE_TIMEOUT)
    );
  }

  /**
   * Retry transient routed SQL failures, but preserve canonical dependency-gap
   * admission defers so callers can back off on the owned boundary instead of
   * converting it back into an internal retry loop.
   * @param {*} result
   * @return {boolean}
   * @private
   */
  shouldRetryRoutedSystemTableMutationFailure(result, tableName = null) {
    if (!this.isTransientCdcError(result)) {
      return false;
    }
    if (hasSystemTableOwnerHandoffFailureSignature(result, tableName)) {
      return false;
    }
    const errorText =
      typeof result?.error === TYPEOF.STRING
        ? result.error
        : typeof result?.message === TYPEOF.STRING
          ? result.message
          : "";
    return !(
      errorText === CONTROL_PLANE_MUTATION_READINESS_ERROR &&
      hasControlPlaneMutationRoutingGapFailureSignature(result)
    );
  }

  /**
   * Exponential backoff with a small cap so bootstrap/join doesn't hang forever.
   * @param {number} baseDelayMs - Base delay from config.
   * @param {number} attempt - Current attempt (1-based).
   * @return {number} Delay in ms.
   * @private
   */
  computeRetryDelayMs(baseDelayMs, attempt) {
    const exp = Math.min(
      CDC_RETRY.MAX_EXPONENT,
      Math.max(NUM.ZERO, attempt - NUM.ONE),
    ); // cap at 64x
    return Math.min(
      CDC_RETRY.MAX_DELAY_MS,
      baseDelayMs * CDC_RETRY.BACKOFF_BASE ** exp,
    );
  }

  /**
   * Prefer explicit control-plane retry hints when present and fall back to
   * the standard CDC backoff otherwise.
   * @param {number} baseDelayMs
   * @param {number} attempt
   * @param {*} errorLike
   * @return {number}
   * @private
   */
  resolveTransientCdcRetryDelayMs(baseDelayMs, attempt, errorLike) {
    const retryAfterMs = getControlPlaneRetryAfterMs(errorLike);
    if (retryAfterMs > NUM.ZERO) {
      return retryAfterMs;
    }
    return this.computeRetryDelayMs(baseDelayMs, attempt);
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
    // During seed bootstrap registration, writes intentionally happen before
    // cache hydration. Waiting for cache visibility in this mode causes
    // per-write timeout delays and can stall bootstrap readiness.
    if (this.bootstrapMode) {
      return buildSystemTableVisibilityResult();
    }
    if (!this.shouldWaitForCacheUpdate(tableName)) {
      return buildSystemTableVisibilityResult();
    }
    const cache = this.systemTableCache;
    if (!cache || typeof cache.onCacheChange !== TYPEOF.FUNCTION) {
      return buildSystemTableVisibilityResult();
    }
    const expectedFields =
      options?.expectedFields && typeof options.expectedFields === TYPEOF.OBJECT
        ? options.expectedFields
        : null;
    const minimumFields =
      options?.minimumFields && typeof options.minimumFields === TYPEOF.OBJECT
        ? options.minimumFields
        : null;
    const normalizedExpectedFields = this.normalizeExpectedFieldsForMinimums(
      expectedFields,
      minimumFields,
    );
    const timeoutMs =
      Number.isFinite(options?.timeoutMs) && options.timeoutMs > 0
        ? Math.floor(options.timeoutMs)
        : this.cacheWaitTimeoutMs;
    const fallbackPhase = this.resolveAuthoritativeFallbackPhase(
      options?.fallbackPhase,
    );
    const authoritativeRepairBudgetMs = Math.max(
      NUM.ONE,
      Math.min(
        this.authoritativeFallbackRepairBudgetMs,
        Math.max(NUM.ONE, Math.floor(timeoutMs / 2)),
      ),
    );
    const cacheWaitBudgetMs = Math.max(
      NUM.ONE,
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
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeoutBudget = createTimeoutBudget({
        configuredBudgetMs: timeoutMs,
      });
      const cleanup = (
        error = null,
        result = buildSystemTableVisibilityResult(),
      ) => {
        if (settled) {
          return;
        }
        settled = true;
        if (typeof cache.offCacheChange === TYPEOF.FUNCTION) {
          cache.offCacheChange(listener);
        }
        if (timer) {
          clearTimeout(timer);
        }
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      };
      const listener = (changedTable) => {
        if (changedTable !== tableName) {
          return;
        }
        if (isSatisfied()) {
          cleanup(null, buildSystemTableVisibilityResult());
        }
      };
      const timer = setTimeout(() => {
        void (async () => {
          if (isSatisfied()) {
            cleanup();
            return;
          }
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
              "Authoritative cache repair failed after cache wait timeout",
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
          const buildCacheWaitTimeoutMessage = CDC_ERROR_MSG.CACHE_WAIT_TIMEOUT;
          const timeoutMessage = buildCacheWaitTimeoutMessage(
            tableName,
            key,
            timeoutMs,
          );
          const timeoutError = createTimeoutBudgetError({
            message: timeoutMessage,
            budget: timeoutBudget,
            classification:
              TIMEOUT_BUDGET_CLASSIFICATION.CACHE_VISIBILITY_TIMEOUT,
            nestedOperation: `cache_wait:${tableName}`,
          });
          if (typeof visibilityResult?.visibilityState === TYPEOF.STRING) {
            timeoutError.visibilityState = visibilityResult.visibilityState;
          }
          if (typeof visibilityResult?.contractState === TYPEOF.STRING) {
            timeoutError.contractState = visibilityResult.contractState;
          }
          if (typeof visibilityResult?.nextAction === TYPEOF.STRING) {
            timeoutError.nextAction = visibilityResult.nextAction;
          }
          if (visibilityResult?.authoritativeVisibilityConfirmed === true) {
            timeoutError.authoritativeVisibilityConfirmed = true;
          }
          if (typeof visibilityResult?.pressureAction === TYPEOF.STRING) {
            timeoutError.pressureAction = visibilityResult.pressureAction;
          }
          if (typeof visibilityResult?.pressureReason === TYPEOF.STRING) {
            timeoutError.pressureReason = visibilityResult.pressureReason;
          }
          if (Number.isFinite(visibilityResult?.retryAfterMs)) {
            timeoutError.retryAfterMs = visibilityResult.retryAfterMs;
            if (timeoutError.retryAfterMs > NUM.ZERO) {
              timeoutError.deferRetry = true;
            }
          }
          cleanup(timeoutError);
        })();
      }, cacheWaitBudgetMs);
      cache.onCacheChange(listener);
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
    for (let attempt = NUM.ONE; attempt <= maxAttempts; attempt += NUM.ONE) {
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
        now: this.now,
      });
      if (attempt >= maxAttempts || remainingBudgetMs <= NUM.ZERO) {
        break;
      }
      await delay(
        Math.min(this.authoritativeFallbackRetryDelayMs, remainingBudgetMs),
      );
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
    if (typeof cache.has === TYPEOF.FUNCTION) {
      return cache.has(tableName, key);
    }
    if (typeof cache.get === TYPEOF.FUNCTION) {
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
    if (!cache || typeof cache.get !== TYPEOF.FUNCTION) {
      return undefined;
    }
    return cache.get(tableName, key);
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
    const queryResult = await this.executeAuthoritativeSystemTableRead(
      tableName,
      `SELECT * FROM ${tableName} WHERE ${primaryKeyField} = ?`,
      [key],
    );
    if (!queryResult?.success) {
      const retryAfterMs = getControlPlaneRetryAfterMs(queryResult);
      if (
        retryAfterMs > NUM.ZERO ||
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
    const rows = Array.isArray(queryResult.rows) ? queryResult.rows : [];
    const cachedRecord = this.getCacheRecord(tableName, key);
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
      const visibilityState = cacheExpectationSatisfied
        ? SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE
        : SYSTEM_TABLE_VISIBILITY_STATE.PENDING_VISIBILITY;
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
    if (rows.length > NUM.ZERO) {
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
      cacheRepaired = this.applyAuthoritativeCacheRepair(
        tableName,
        CDC_OPERATION.DELETE,
        {
          [primaryKeyField]: key,
        },
        key,
      );
    }
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
      visibilityState: this.hasCacheRecord(tableName, key)
        ? SYSTEM_TABLE_VISIBILITY_STATE.PENDING_VISIBILITY
        : SYSTEM_TABLE_VISIBILITY_STATE.VISIBLE,
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
  applyAuthoritativeCacheRepair(tableName, operation, row, key) {
    if (
      !this.cacheMutationTarget ||
      typeof this.cacheMutationTarget.applySystemTableChange !==
        TYPEOF.FUNCTION ||
      !row ||
      typeof row !== TYPEOF.OBJECT
    ) {
      return false;
    }
    const canonicalRow = canonicalizeSystemTableRow(tableName, row);
    const causeId = `authoritative-repair:${tableName}:${key}`;
    this.cacheMutationTarget.applySystemTableChange(
      tableName,
      operation,
      canonicalRow,
      {
        causeId,
      },
    );
    return true;
  }

  /**
   * Resolve authoritative fallback phase from optional runtime context.
   * @param {string|undefined|null} phase
   * @return {string}
   * @private
   */
  resolveAuthoritativeFallbackPhase(phase) {
    if (typeof phase === TYPEOF.STRING && phase.length > NUM.ZERO) {
      return normalizeAuthoritativeFallbackPhase(phase);
    }
    if (this.bootstrapMode) {
      return AUTHORITATIVE_FALLBACK_PHASE.BOOTSTRAP;
    }
    return AUTHORITATIVE_FALLBACK_PHASE.STEADY_STATE;
  }

  /**
   * Remove authoritative fallback samples that are older than the active window.
   * @param {number} nowMs
   * @private
   */
}

export { CDCIntegrationServiceSegment2 };
