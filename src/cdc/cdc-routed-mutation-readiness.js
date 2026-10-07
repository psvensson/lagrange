import {mintControlPlaneWriteKey} from
  '../control-plane/control-plane-write-identity.js';
import {deriveParticipantEntryId} from
  '../query/distributed/distributed-write-coordinator.js';
import {CDC_INTEGRATION_SERVICE_SHARED} from './cdc-integration-service-shared.js';
import {CDC_TERMINAL_STAGE} from './cdc-constants.js';
import {submitRoutedMutationHop} from './cdc-terminal-gate.js';
import {executeBootstrapDirectSql} from './cdc-bootstrap-direct-sql.js';
import {
  isPartitionWriteFailureCode,
  isReroutableWriteFailureCode,
} from '../partition/partition-write-kernel.js';
import {
  PARTITION_TRANSITION_STATE,
} from '../partition/partition-constants.js';
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
import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';

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
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
  METRICS_LOG_TAG,
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
  QUERY_ERROR_MSG,
  VALID_SYSTEM_TABLES,
  WRITE_ROUTER_MODE,
  annotateSystemTableMutationError,
  buildPressureAdmissionFailure,
  buildSystemTableMutationError,
  getControlPlaneErrorCode,
  getControlPlaneRetryAfterMs,
  hasControlPlaneMutationRoutingGapFailureSignature,
  hasSystemTableOwnerHandoffFailureSignature,
  isRetryableControlPlaneError,
  isTerminalTypedDistributedFailure,
  normalizeDeliveryPriority,
  resolveSystemTableMutationDeliveryPriority,
  shouldEmitTableWriteMetric,
  uuidv4,
} = CDC_INTEGRATION_SERVICE_SHARED;

const CDC_CONTROL_PLANE_WRITE_RESOURCE_KEY = 'control-plane:write';
// CL-017(c): floor for the per-attempt share of the retry budget.
const CDC_ROUTED_MUTATION_MIN_ATTEMPT_TIMEOUT_MS = 1000; // ends-on: n/a clamp
const CDC_CONTROL_PLANE_TABLE_RESOURCE_KEY_PREFIX = 'control-plane:table:';
const CDC_UNKNOWN_TABLE_RESOURCE_KEY = 'unknown';
const CDC_ROUTED_MUTATION_READINESS_CONSTRUCTOR = 'constructor';
const ROUTED_MUTATION_BUDGET_SPENT_BEFORE_ATTEMPT = 'budget_spent_before_attempt';
const ROUTED_MUTATION_RETRY_BUDGET_WAIT = Object.freeze({
  wait: 'cdc_routed_mutation_retry_budget',
  awaited: 'routed system-table mutation accepted within the per-call ' +
    'query execution budget',
});
const ROUTED_MUTATION_ATTEMPTS_WAIT = Object.freeze({
  wait: 'CDC_DEFAULTS.RETRY_MAX_ATTEMPTS',
  awaited: 'routed system-table mutation accepted by the engine',
});

/**
 * The spent-wait latch of one routed write. The per-call budget can be
 * found spent by the delay gate and again by the catch its throw lands in,
 * and a spent budget can coincide with the last attempt: one write reports
 * one line.
 * @param {Object} service - The CDC integration service.
 * @param {Object} write - {tableName, maxAttempts, budgetMs, readElapsedMs}.
 * @return {{budgetSpent: Function, attemptsSpent: Function}} Reporters,
 *   called on the expiry branches only.
 */
function createRoutedMutationSpentLatch(service, write) {
  let reported = false;
  const scope = {nodeId: service.nodeId, tableName: write.tableName};
  return {
    budgetSpent(lastObserved) {
      if (reported) {
        return;
      }
      reported = true;
      reportWaitBoundSpent(service.logger, {
        ...ROUTED_MUTATION_RETRY_BUDGET_WAIT,
        boundMs: write.budgetMs,
        elapsedMs: write.readElapsedMs(),
        lastObserved,
        scope,
      });
    },
    attemptsSpent(attempt, error) {
      if (reported) {
        return;
      }
      reported = true;
      reportWaitBoundSpent(service.logger, {
        ...ROUTED_MUTATION_ATTEMPTS_WAIT,
        boundMs: null,
        elapsedMs: write.readElapsedMs(),
        lastObserved: () => ({
          attempts: attempt,
          maxAttempts: write.maxAttempts,
          errorCode: getControlPlaneErrorCode(error) || null,
          retryAfterMs: getControlPlaneRetryAfterMs(error),
        }),
        scope,
      });
    },
  };
}

// The local-leader leg of a routed write is the same entry as its engine
// attempts: its entryId is derived from the write's key and the partition
// exactly as the engine's write plan derives it.
function localLegWriteIdentity(idempotencyKey, partitionService) {
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length === 0 ||
    typeof partitionService?.partitionId !== 'string') {
    return {};
  }
  return {
    idempotencyKey,
    entryId: deriveParticipantEntryId(idempotencyKey,
      partitionService.partitionId),
  };
}

class CDCRoutedMutationReadiness {
  hasActiveSystemTableWriteMirror(tableName) {
    const sqlQueryEngine = this.sqlQueryEngine;
    if (
      typeof sqlQueryEngine?.getTableInfo !== 'function' ||
      typeof sqlQueryEngine.parsePartitionTransition !== 'function'
    ) {
      return false;
    }
    const transition = sqlQueryEngine.parsePartitionTransition(
      sqlQueryEngine.getTableInfo(tableName),
    );
    return transition?.state ===
      PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE;
  }

  async tryExecuteLocalSystemTableWrite(sql, params = [],
    idempotencyKey = null) {
    if (!sql || typeof sql !== 'string') {
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
    if (this.hasActiveSystemTableWriteMirror(tableName)) {
      return {handled: false};
    }
    const localServices = this.resolveLocalSystemTableServices(tableName, {
      consistency: LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER,
    });
    if (localServices.length === 0) {
      return {
        handled: false,
      };
    }
    // The answer of the last leg issued: a later hop of this write carries it
    // to the terminal gate, since that leg's outcome is not known here.
    const issued = {};
    for (const partitionService of localServices) {
      if (typeof partitionService?.executeQuery !== 'function') {
        continue;
      }
      try {
        const legIdentity =
          localLegWriteIdentity(idempotencyKey, partitionService);
        const localResult = await submitRoutedMutationHop(this,
          CDC_TERMINAL_STAGE.LOCAL_LEADER_WRITE,
          () => partitionService.executeQuery(sql, params, legIdentity),
          issued.answer);
        const result = this.normalizeLocalSystemTableWriteResult(localResult);
        if (this.isLocalSystemTableWriteRoutedOn(result, {
          carriesEntryId: typeof legIdentity.entryId === 'string' &&
            result?.entryId === legIdentity.entryId,
        })) {
          issued.answer = result;
          continue;
        }
        return {
          handled: true,
          result,
        };
      } catch (error) {
        if (
          this.isTransientCdcError(error)
        ) {
          issued.answer = error;
          continue;
        }
        throw error;
      }
    }
    return {
      handled: false,
      priorAnswer: issued.answer,
    };
  }

  /**
   * Whether the local partition's answer to a system-table write sends it on
   * to the next local service: a typed answer only when its code says it may
   * be sent again - an unknown outcome only when the leg carried the write's
   * derived entryId, so every later leg and engine attempt is the same entry
   * (it may have committed here) - an untyped one by its text.
   * @param {Object|null} result - The local partition's answer.
   * @param {Object} [options] - {carriesEntryId}: the leg carried the entryId
   *   the answer names.
   * @return {boolean} Whether the write is sent on.
   */
  isLocalSystemTableWriteRoutedOn(result, {carriesEntryId = false} = {}) {
    if (result && result.success !== false) {
      return false;
    }
    return isPartitionWriteFailureCode(result?.failureCode) ?
      isReroutableWriteFailureCode(result.failureCode, {carriesEntryId}) :
      this.isTransientCdcError(result);
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
    if (!data || typeof data !== 'object') {
      throw new Error(`${operation}${CDC_ERROR_MSG.DATA_REQUIRED_SUFFIX}`);
    }
  }

  async executeSQLDirectToLocalPartition(sql, params = [], _options = {}) {
    return executeBootstrapDirectSql(this, sql, params);
  }

  extractTableNameFromSQL(sql) {
    if (!sql || typeof sql !== 'string') {
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
        tableName: match[1],
      });
    }

    match = sql.match(/UPDATE\s+(\w+)\s+SET/i);
    if (match) {
      return Object.freeze({
        state:
          CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_FOUND,
        tableName: match[1],
      });
    }

    match = sql.match(/DELETE\s+FROM\s+(\w+)/i);
    if (match) {
      return Object.freeze({
        state:
          CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_FOUND,
        tableName: match[1],
      });
    }

    match = sql.match(/FROM\s+(\w+)/i);
    if (match) {
      return Object.freeze({
        state:
          CDC_INTEGRATION_SERVICE_LITERAL.TABLE_NAME_EXTRACTION_STATE_FOUND,
        tableName: match[1],
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
      typeof options.sessionId === 'string' &&
      options.sessionId.length > 0
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
    const buildMissingSqlQueryEngineError = () => {
      const error = new Error(
        `${CDC_ERROR_MSG.CDC_ENGINE_MISSING_PREFIX}` +
          `${CDC_ERROR_MSG.CDC_ENGINE_MISSING_DETAIL}`,
      );
      error.deferRetry = true;
      error.retryAfterMs = Math.max(1, this.retryDelayMs || 1);
      return error;
    };
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
    });
    const queryTimeoutMs = Number(options?.queryTimeoutMs);
    const queryExecutionBudgetMs =
      Number.isFinite(queryTimeoutMs) && queryTimeoutMs > 0 ?
        Math.floor(queryTimeoutMs) :
        null;
    // Armed lazily on first use: stamping the deadline here would let the
    // admission work between here and attempt 1 (session resolution,
    // coalescing-key/delivery-source derivation) shave milliseconds off the
    // first attempt's timeout budget, so attempt 1 would see e.g. 199 of a
    // 200ms budget instead of the full per-call budget.
    let queryExecutionDeadlineMs = null;
    const getRemainingQueryExecutionBudgetMs = () => {
      if (queryExecutionBudgetMs === null) {
        return null;
      }
      // The budget that bounds this loop reads the same clock the loop's
      // delays arm on; a budget on the wall clock under a virtual delay
      // would let the attempt count depend on which clock moved.
      if (queryExecutionDeadlineMs === null) {
        queryExecutionDeadlineMs = this.timeSource.now() + queryExecutionBudgetMs;
        return queryExecutionBudgetMs;
      }
      return Math.max(0, queryExecutionDeadlineMs - this.timeSource.now());
    };
    // Expiry branches only: the clock is read when a bound is found spent.
    const spentLatch = createRoutedMutationSpentLatch(this, {
      tableName,
      maxAttempts,
      budgetMs: queryExecutionBudgetMs,
      readElapsedMs: () => (queryExecutionDeadlineMs === null ?
        undefined :
        this.timeSource.now() -
          (queryExecutionDeadlineMs - queryExecutionBudgetMs)),
    });
    const waitForRetryBudget = async (delayMs, attempt) => {
      // Teardown stop: once the service is shutting down, abandon the retry
      // budget instead of re-arming. The unbudgeted path below otherwise sleeps
      // and returns true forever, holding the event loop open while the routed
      // write keeps failing on a torn-down sqlQueryEngine.
      if (this.isShuttingDown === true) {
        return false;
      }
      const normalizedDelayMs =
        Number.isFinite(delayMs) && delayMs > 0 ?
          Math.floor(delayMs) :
          0;
      const remainingBudgetMs = getRemainingQueryExecutionBudgetMs();
      if (remainingBudgetMs === null) {
        if (normalizedDelayMs > 0) {
          await this.delayUntilShutdown(normalizedDelayMs);
        }
        return this.isShuttingDown !== true;
      }
      if (remainingBudgetMs <= 0 || normalizedDelayMs > remainingBudgetMs) {
        spentLatch.budgetSpent({
          phase: 'retry_delay_exceeds_budget',
          attempt,
          remainingBudgetMs,
          requestedDelayMs: normalizedDelayMs,
        });
        return false;
      }
      if (normalizedDelayMs > 0) {
        // Held by the lifecycle owner: shutdown ends the delay at once.
        await this.delayUntilShutdown(normalizedDelayMs);
      }
      if (this.isShuttingDown === true) {
        return false;
      }
      const nextRemainingBudgetMs = getRemainingQueryExecutionBudgetMs();
      if (nextRemainingBudgetMs === null || nextRemainingBudgetMs > 0) {
        return true;
      }
      spentLatch.budgetSpent({
        phase: 'budget_spent_during_retry_delay',
        attempt,
        remainingBudgetMs: nextRemainingBudgetMs,
        requestedDelayMs: normalizedDelayMs,
      });
      return false;
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
    if (typeof sessionId === 'string' && sessionId.length > 0) {
      baseQueryOptions.sessionId = sessionId;
    }
    // Every engine attempt of this routed write - each retry below - is
    // delivered under one idempotency key (the caller's, or one minted for
    // this write), so the engine plans each as the same entry: an attempt
    // after an unknown outcome is answered from the first's outcome row.
    baseQueryOptions.idempotencyKey =
      typeof options?.idempotencyKey === 'string' &&
      options.idempotencyKey.length > 0 ?
        options.idempotencyKey : mintControlPlaneWriteKey();
    if (options?.cancellationToken) {
      baseQueryOptions.cancellationToken = options.cancellationToken;
    }
    // The answer of the last hop issued (a local leg or an engine attempt).
    const issuedHop = {};
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const remainingBudgetMs = getRemainingQueryExecutionBudgetMs();
        if (remainingBudgetMs !== null && remainingBudgetMs <= 0) {
          spentLatch.budgetSpent({
            phase: ROUTED_MUTATION_BUDGET_SPENT_BEFORE_ATTEMPT,
            attempt,
            remainingBudgetMs,
          });
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
        const attemptStartMs = this.timeSource.now();
        const queryOptions = {
          ...baseQueryOptions,
        };
        if (remainingBudgetMs !== null) {
          // CL-017(c): one frozen-target attempt must not consume the whole
          // retry budget (witnessed: a 23s seed freeze ate all 6 attempts in
          // a single 15s-timeout call). Divide the remaining budget across
          // the remaining attempts, floored at 1s and capped at the budget.
          const remainingAttempts = maxAttempts - attempt + 1;
          queryOptions.timeoutMs = Math.min(
            remainingBudgetMs,
            Math.max(
              CDC_ROUTED_MUTATION_MIN_ATTEMPT_TIMEOUT_MS,
              Math.floor(remainingBudgetMs / remainingAttempts),
            ),
          );
        } else if (
          Number.isFinite(queryTimeoutMs) &&
          queryTimeoutMs > 0
        ) {
          queryOptions.timeoutMs = Math.floor(queryTimeoutMs);
        }
        if (!this.bootstrapMode) {
          const localWriteResult = await this.tryExecuteLocalSystemTableWrite(
            sql,
            params,
            baseQueryOptions.idempotencyKey,
          );
          if (localWriteResult.handled) {
            return localWriteResult.result;
          }
          issuedHop.answer = localWriteResult.priorAnswer ?? issuedHop.answer;
        }
        const sqlQueryEngine = this.sqlQueryEngine;
        if (typeof sqlQueryEngine?.executeQuery !== 'function') {
          throw buildMissingSqlQueryEngineError();
        }
        const result = await submitRoutedMutationHop(this,
          CDC_TERMINAL_STAGE.ENGINE_WRITE,
          () => sqlQueryEngine.executeQuery(sql, params, queryOptions),
          issuedHop.answer);
        issuedHop.answer = result;
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
                attempt,
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
            const durationMs = this.timeSource.now() - attemptStartMs;
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
        const retryable =
          this.shouldRetryRoutedSystemTableMutationFailure(error, tableName);
        if (!retryable || attempt >= maxAttempts) {
          if (retryable) {
            spentLatch.attemptsSpent(attempt, error);
          }
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
            attempt,
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

  isTransientCdcError(errorLike) {
    const message =
      typeof errorLike === 'string' ?
        errorLike :
        errorLike?.message || errorLike?.error || '';
    // A partition write answer: by the control plane's one classifier (its
    // code when the caller holds it, else its text).
    return !isTerminalTypedDistributedFailure(errorLike) && (
      isRetryableControlPlaneError(errorLike) ||
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
      typeof result?.error === 'string' ?
        result.error :
        typeof result?.message === 'string' ?
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
      Math.max(0, attempt - 1),
    );
    return Math.min(
      CDC_RETRY.MAX_DELAY_MS,
      baseDelayMs * CDC_RETRY.BACKOFF_BASE ** exp,
    );
  }

  resolveTransientCdcRetryDelayMs(baseDelayMs, attempt, errorLike) {
    const retryAfterMs = getControlPlaneRetryAfterMs(errorLike);
    if (retryAfterMs > 0) {
      return retryAfterMs;
    }
    return this.computeRetryDelayMs(baseDelayMs, attempt);
  }

  resolveRoutedSystemTableMutationWorkloadProfile(
    tableName,
    options = {},
  ) {
    if (
      typeof options?.workloadClass !== 'string' ||
      options.workloadClass.length === 0
    ) {
      return null;
    }
    const tableResourceKey =
      CDC_CONTROL_PLANE_TABLE_RESOURCE_KEY_PREFIX +
      (tableName || CDC_UNKNOWN_TABLE_RESOURCE_KEY);
    return buildControlPlaneWorkloadProfile(options.workloadClass, {
      workClass: options?.workClass,
      additionalResourceKeys: [tableResourceKey],
    });
  }
}

/**
 * Mix the routed-mutation readiness methods (SQL execution, retry/pressure
 * budgeting, local-write bypass, and SQL parsing/validation) onto the target
 * class prototype.
 * @param {Function} targetClass
 */
function applyCDCRoutedMutationReadiness(targetClass) {
  const sourcePrototype = CDCRoutedMutationReadiness.prototype;
  for (const methodName of Object.getOwnPropertyNames(sourcePrototype)) {
    if (methodName === CDC_ROUTED_MUTATION_READINESS_CONSTRUCTOR) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      sourcePrototype,
      methodName,
    );
    Object.defineProperty(targetClass.prototype, methodName, descriptor);
  }
}

export {CDCRoutedMutationReadiness, applyCDCRoutedMutationReadiness};
