import {CDC_INTEGRATION_SERVICE_SHARED} from './cdc-integration-service-shared.js';
import {
  CONTROL_PLANE_SQL_OPERATION,
  resolveControlPlaneSystemTableDeliverySource,
} from '../control-plane/control-plane-system-table-gateway-shared.js';
import {
  resolveRoutedSystemTableMutationCoalescingKey,
  resolveRoutedSystemWriteRecoveryCandidateSelectionKey,
} from './cdc-routed-system-write-selection.js';
import {
  buildControlPlaneWorkloadProfile,
} from '../control-plane/control-plane-workload-profile.js';
import {CDCIntegrationServiceSegment1} from './cdc-integration-service-segment-1.js';

const {
  CDC_DEFAULTS,
  CDC_ERROR_MSG,
  CDC_INTEGRATION_SERVICE_LITERAL,
  CDC_LOG_MSG,
  CDC_RETRY,
  CDC_SESSION,
  CDC_SQL,
  CONTROL_PLANE_MUTATION_READINESS_ERROR,
  CONTROL_PLANE_READINESS_DIMENSION,
  ERRORS,
  INITIAL_PARTITION_IDS,
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
  METRICS_LOG_TAG,
  NUM,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
  QUERY_ERROR_MSG,
  TYPEOF,
  VALID_SYSTEM_TABLES,
  WRITE_ROUTER_MODE,
  annotateSystemTableMutationError,
  buildPressureAdmissionFailure,
  buildSystemTableMutationError,
  delay,
  getControlPlaneRetryAfterMs,
  hasControlPlaneMutationRoutingGapFailureSignature,
  hasSystemTableOwnerHandoffFailureSignature,
  isRetryableControlPlaneError,
  normalizeDeliveryPriority,
  resolveSystemTableMutationDeliveryPriority,
  shouldEmitTableWriteMetric,
  uuidv4,
} = CDC_INTEGRATION_SERVICE_SHARED;

const CDC_CONTROL_PLANE_WRITE_RESOURCE_KEY = 'control-plane:write';
const CDC_CONTROL_PLANE_TABLE_RESOURCE_KEY_PREFIX = 'control-plane:table:';
const CDC_UNKNOWN_TABLE_RESOURCE_KEY = 'unknown';

class CDCRoutedMutationReadiness extends CDCIntegrationServiceSegment1 {
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
      CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_FOUND ?
        tableNameResult.tableName :
        null;
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
          const message = result?.error || '';
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

  validateTableName(tableName) {
    if (!VALID_SYSTEM_TABLES.includes(tableName)) {
      throw new Error(
        `${CDC_ERROR_MSG.INVALID_TABLE_PREFIX}${tableName}. ` +
          `${CDC_ERROR_MSG.VALID_TABLES_PREFIX}` +
          `${VALID_SYSTEM_TABLES.join(CDC_SQL.COMMA_SPACE)}`,
      );
    }
  }

  validateData(data, operation) {
    if (!data || typeof data !== TYPEOF.OBJECT) {
      throw new Error(`${operation}${CDC_ERROR_MSG.DATA_REQUIRED_SUFFIX}`);
    }
  }

  async executeSQLDirectToLocalPartition(sql, params = [], _options = {}) {
    if (!this.bootstrapMode || !this.localPartitionServices) {
      throw new Error(CDC_LOG_MSG.BOOTSTRAP_MODE_REQUIRED_FOR_DIRECT_SQL);
    }

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

    const initializedCandidates =
      candidates.length > NUM.ZERO ? candidates : [];
    if (initializedCandidates.length === NUM.ZERO) {
      const partitionIds = candidates
        .map((service) => service?.partitionId)
        .filter(Boolean)
        .join(', ');
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
    const isSelect = sql.trim().toUpperCase().startsWith('SELECT');

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

  extractTableNameFromSQL(sql) {
    if (!sql || typeof sql !== TYPEOF.STRING) {
      return Object.freeze({
        state:
          CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_INVALID_INPUT,
      });
    }

    let match = sql.match(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)/i);
    if (match) {
      return Object.freeze({
        state:
          CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_FOUND,
        tableName: match[NUM.ONE],
      });
    }

    match = sql.match(/UPDATE\s+(\w+)\s+SET/i);
    if (match) {
      return Object.freeze({
        state:
          CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_FOUND,
        tableName: match[NUM.ONE],
      });
    }

    match = sql.match(/DELETE\s+FROM\s+(\w+)/i);
    if (match) {
      return Object.freeze({
        state:
          CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_FOUND,
        tableName: match[NUM.ONE],
      });
    }

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
    return resolveRoutedSystemWriteRecoveryCandidateSelectionKey(
      tableName,
      sql,
      params,
      options,
    );
  }

  async executeSQLViaQueryEngine(sql, params = [], options = {}) {
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
      CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_FOUND ?
        tableNameResult.tableName :
        null;
    const tableResourceKey =
      CDC_CONTROL_PLANE_TABLE_RESOURCE_KEY_PREFIX +
      (tableName || CDC_UNKNOWN_TABLE_RESOURCE_KEY);
    const workloadProfile =
      this.resolveRoutedSystemTableMutationWorkloadProfile(tableName, options);
    const pressureDecision = PressureGovernor.getShared({
      nodeId: this.nodeId,
      messageRouter: this.messageRouter,
    }).evaluate({
      workClass:
        workloadProfile?.workClass ||
        options?.workClass ||
        PRESSURE_WORK_CLASS.CRITICAL,
      resourceKeys: workloadProfile?.resourceKeys || [
        CDC_CONTROL_PLANE_WRITE_RESOURCE_KEY,
        tableResourceKey,
      ],
      allowDegrade: false,
      allowDefer: workloadProfile ?
        workloadProfile.allowPressureDefer === true :
        options?.allowPressureDefer === true,
      retryAfterMs: options?.pressureRetryAfterMs,
    });
    const queryTimeoutMs = Number(options?.queryTimeoutMs);
    const queryExecutionBudgetMs =
      Number.isFinite(queryTimeoutMs) && queryTimeoutMs > NUM.ZERO ?
        Math.floor(queryTimeoutMs) :
        null;
    const queryExecutionDeadlineMs =
      queryExecutionBudgetMs === null ?
        null :
        Date.now() + queryExecutionBudgetMs;
    const getRemainingQueryExecutionBudgetMs = () => {
      if (queryExecutionDeadlineMs === null) {
        return null;
      }
      return Math.max(NUM.ZERO, queryExecutionDeadlineMs - Date.now());
    };
    const waitForRetryBudget = async (delayMs) => {
      const normalizedDelayMs =
        Number.isFinite(delayMs) && delayMs > NUM.ZERO ?
          Math.floor(delayMs) :
          NUM.ZERO;
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
    const coalescingKey = resolveRoutedSystemTableMutationCoalescingKey(
      tableName,
      sql,
      params,
      options,
    );
    const deliverySource = resolveControlPlaneSystemTableDeliverySource({
      deliverySource: options?.deliverySource || null,
      tableName,
      sql,
      operationKind: CONTROL_PLANE_SQL_OPERATION.WRITE,
      coalescingKey,
    });
    const baseQueryOptions = {
      recoveryCandidateSelectionKey:
        this.resolveSystemWriteRecoveryCandidateSelectionKey(
          tableName,
          sql,
          params,
          options,
        ),
      workloadClass:
        workloadProfile?.workloadClass || options?.workloadClass || null,
      workClass: workloadProfile?.workClass || options?.workClass,
      allowPressureDefer: workloadProfile ?
        workloadProfile.allowPressureDefer :
        options?.allowPressureDefer,
      pressureRetryAfterMs: options?.pressureRetryAfterMs,
      deliveryPriority: normalizeDeliveryPriority(
        options?.deliveryPriority,
        resolveSystemTableMutationDeliveryPriority({tableName}),
      ),
      deliverySource,
      coalescingKey,
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
              error: tableName ?
                `${tableName}_mutation_retry_timeout_exhausted` :
                ERRORS.QUERY_FAILED,
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
            // Metrics logging must not propagate to callers.
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
              this.writeRouter?.mode === WRITE_ROUTER_MODE.BOOTSTRAP_DIRECT ?
                WRITE_ROUTER_MODE.BOOTSTRAP_DIRECT :
                WRITE_ROUTER_MODE.SQL_ROUTED,
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
              this.writeRouter?.mode === WRITE_ROUTER_MODE.BOOTSTRAP_DIRECT ?
                WRITE_ROUTER_MODE.BOOTSTRAP_DIRECT :
                WRITE_ROUTER_MODE.SQL_ROUTED,
          });
          throw error;
        }
      }
    }

    throw new Error(ERRORS.QUERY_FAILED);
  }

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

  isTransientCdcError(errorLike) {
    const message =
      typeof errorLike === TYPEOF.STRING ?
        errorLike :
        errorLike?.message || errorLike?.error || '';
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

  shouldRetryRoutedSystemTableMutationFailure(result, tableName = null) {
    if (!this.isTransientCdcError(result)) {
      return false;
    }
    if (hasSystemTableOwnerHandoffFailureSignature(result, tableName)) {
      return false;
    }
    const errorText =
      typeof result?.error === TYPEOF.STRING ?
        result.error :
        typeof result?.message === TYPEOF.STRING ?
          result.message :
          '';
    return !(
      errorText === CONTROL_PLANE_MUTATION_READINESS_ERROR &&
      hasControlPlaneMutationRoutingGapFailureSignature(result)
    );
  }

  computeRetryDelayMs(baseDelayMs, attempt) {
    const exp = Math.min(
      CDC_RETRY.MAX_EXPONENT,
      Math.max(NUM.ZERO, attempt - NUM.ONE),
    );
    return Math.min(
      CDC_RETRY.MAX_DELAY_MS,
      baseDelayMs * CDC_RETRY.BACKOFF_BASE ** exp,
    );
  }

  resolveTransientCdcRetryDelayMs(baseDelayMs, attempt, errorLike) {
    const retryAfterMs = getControlPlaneRetryAfterMs(errorLike);
    if (retryAfterMs > NUM.ZERO) {
      return retryAfterMs;
    }
    return this.computeRetryDelayMs(baseDelayMs, attempt);
  }

  resolveRoutedSystemTableMutationWorkloadProfile(
    tableName,
    options = {},
  ) {
    if (
      typeof options?.workloadClass !== TYPEOF.STRING ||
      options.workloadClass.length === NUM.ZERO
    ) {
      return null;
    }
    const tableResourceKey =
      CDC_CONTROL_PLANE_TABLE_RESOURCE_KEY_PREFIX +
      (tableName || CDC_UNKNOWN_TABLE_RESOURCE_KEY);
    return buildControlPlaneWorkloadProfile(options.workloadClass, {
      workClass: options?.workClass,
      allowPressureDefer: options?.allowPressureDefer,
      additionalResourceKeys: [tableResourceKey],
    });
  }
}

export {CDCRoutedMutationReadiness};
