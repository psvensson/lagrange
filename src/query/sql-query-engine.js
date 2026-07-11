import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {SQLQueryEngineWriteExecution} from './sql-query-engine-write-execution.js';
import {createSQLQueryEngineTableRoutingMethods} from './sql-query-engine-table-routing-methods.js';

const LOCAL_STR_SHA1 = 'sha1';
const LOCAL_STR_HEX = 'hex';
const LOCAL_STR_STRING = 'string';
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_PARSE = 'parse';
const LOCAL_STR_SYNTAX = 'syntax';
const LOCAL_STR_TABLE_NOT_FOUND = 'table not found';
const LOCAL_STR_TIMEOUT = 'timeout';
const LOCAL_STR_BOOLEAN = 'boolean';

const {
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_READINESS_DIMENSION,
  PRESSURE_WORK_CLASS,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  QUERY_OPERATION,
  QUERY_SESSION,
  SQLParser,
  TABLES,
  WRITE_OPERATION_STATUS,
  createHash,
  isPriorityControlPlanePartition,
  isRetryableControlPlaneError,
} = SQL_QUERY_ENGINE_SHARED;

const PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_PRIORITY = 'critical';
const PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_TIMEOUT_MS = 15000;
const PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_SOURCE_PREFIX =
  'query:transaction';
const PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_KEY_SEPARATOR = ':';
const PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_IDENTITY_STATE =
  Object.freeze({
    OMITTED: 'omitted',
    RESOLVED: 'resolved',
  });
const PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_IDENTITY_OMITTED =
  Object.freeze({
    state: PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_IDENTITY_STATE.OMITTED,
  });
const NON_TRANSACTIONAL_WRITE_TRACKING_DISPOSITION = Object.freeze({
  PERSIST: 'persist',
  SKIP_RETRYABLE_CONTROL_PLANE_FAILURE:
    'skip_retryable_control_plane_failure',
});

function normalizePriorityControlPlaneTransactionDeliveryPart(value) {
  return typeof value === LOCAL_STR_STRING ?
    value.trim() :
    '';
}

function buildPriorityControlPlaneTransactionDeliveryIdentity({
  sessionId,
  partitionId,
  operation,
} = {}) {
  const normalized = Object.freeze({
    sessionId:
      normalizePriorityControlPlaneTransactionDeliveryPart(sessionId),
    partitionId:
      normalizePriorityControlPlaneTransactionDeliveryPart(partitionId),
    operation:
      normalizePriorityControlPlaneTransactionDeliveryPart(operation),
  });
  const completeIdentity = [
    normalized.sessionId,
    normalized.partitionId,
    normalized.operation,
  ].every((part) => part.length > 0);
  if (!completeIdentity) {
    return PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_IDENTITY_OMITTED;
  }
  const deliveryKey = [
    PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_SOURCE_PREFIX,
    normalized.partitionId,
    normalized.sessionId,
    normalized.operation,
  ].join(PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_KEY_SEPARATOR);
  return Object.freeze({
    state: PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_IDENTITY_STATE.RESOLVED,
    deliverySource: deliveryKey,
    replacePendingKey: deliveryKey,
  });
}

class SQLQueryEngine extends SQLQueryEngineWriteExecution {
  assertDistributedTransactionMutationSucceeded(result, tableName) {
    if (result?.success === true) {
      return;
    }
    const error = new Error(
      result?.error || QUERY_ERROR_MSG.TRANSACTION_STATE_PERSIST_FAILED,
    );
    error.code =
      result?.errorCode || QUERY_ERROR_CODE.TRANSACTION_STATE_PERSIST_FAILED;
    error.tableName = tableName;
    throw error;
  }

  async persistDistributedTransactionRow(record) {
    if (!this.canPersistDistributedTransactionState()) {
      return;
    }
    const transactionId = String(record?.transactionId || '').trim();
    const result = await this.getControlPlaneSystemTableGateway().submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
      tableName: TABLES.SQL_TRANSACTIONS,
      row: {
        transaction_id: transactionId,
        session_id: record.sessionId,
        status: record.status,
        transaction_epoch: record.transactionEpoch,
        timeout_deadline: record.timeoutDeadline,
        transaction_mode: record.transactionMode,
        participant_set_state: record.participantSetState,
        commit_mode: record.commitMode,
        frozen_participant_count: record.frozenParticipantCount,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      },
    }, this.buildDistributedTransactionMutationOptions(
      TABLES.SQL_TRANSACTIONS,
      {
        // Durable transaction state must bypass interactive admission
        // pressure and retain critical delivery priority so recovery metadata
        // does not stall behind background control-plane backlog.
        workClass: PRESSURE_WORK_CLASS.CRITICAL,
        coalescingKey: transactionId.length > 0 ?
          `sql-transaction:${transactionId}` :
          null,
      },
    ));
    this.assertDistributedTransactionMutationSucceeded(
      result,
      TABLES.SQL_TRANSACTIONS,
    );
  }

  /**
   * Persist one distributed transaction participant row.
   * @param {Object} record - Participant persistence payload.
   * @return {Promise<void>}
   * @private
   */
  async persistDistributedTransactionParticipantRow(record) {
    if (!this.canPersistDistributedTransactionState()) {
      return;
    }
    const participantId = String(record?.participantId || '').trim();
    const transactionId = String(record?.transactionId || '').trim();
    const result = await this.getControlPlaneSystemTableGateway().submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
      tableName: TABLES.SQL_TRANSACTION_PARTICIPANTS,
      row: {
        participant_id: participantId,
        transaction_id: transactionId,
        partition_id: record.partitionId,
        status: record.status,
        last_error: record.lastError,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      },
    }, this.buildDistributedTransactionMutationOptions(
      TABLES.SQL_TRANSACTION_PARTICIPANTS,
      {
        workClass: PRESSURE_WORK_CLASS.CRITICAL,
        coalescingKey: participantId.length > 0 ?
          `sql-transaction-participant:${participantId}` :
          null,
      },
    ));
    this.assertDistributedTransactionMutationSucceeded(
      result,
      TABLES.SQL_TRANSACTION_PARTICIPANTS,
    );
  }

  /**
   * Persist one distributed write operation row.
   * @param {Object} record - Write operation persistence payload.
   * @return {Promise<void>}
   * @private
   */
  async persistDistributedWriteOperationRow(record) {
    if (!this.canPersistDistributedTransactionState()) {
      return;
    }
    const operationId = String(record?.operationId || '').trim();
    const transactionId = String(record?.transactionId || '').trim();
    const workClass =
      typeof record?.workClass === 'string' &&
        record.workClass.length > 0 ?
        record.workClass :
        PRESSURE_WORK_CLASS.INTERACTIVE;
    const result = await this.getControlPlaneSystemTableGateway().submitMutation({
      operation: CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
      tableName: TABLES.SQL_WRITE_OPERATIONS,
      row: {
        operation_id: operationId,
        transaction_id: transactionId || null,
        statement_type: record.statementType,
        status: record.status,
        idempotency_key: record.idempotencyKey,
        payload_hash: record.payloadHash,
        retry_count: record.retryCount || 0,
        last_error: record.lastError || null,
        partition_ids: JSON.stringify(record.partitionIds || []),
        created_at: record.createdAt,
        updated_at: record.updatedAt,
      },
    }, this.buildDistributedTransactionMutationOptions(
      TABLES.SQL_WRITE_OPERATIONS,
      {
        workClass,
        coalescingKey: operationId.length > 0 ?
          `sql-write-operation:${operationId}` :
          null,
      },
    ));
    this.assertDistributedTransactionMutationSucceeded(
      result,
      TABLES.SQL_WRITE_OPERATIONS,
    );
  }

  /**
   * Persist a distributed write operation not associated with a transaction.
   * @param {Object} writePlan - DistributedWritePlan.
   * @param {string} statementType - SQL AST statement type.
   * @return {Promise<void>}
   * @private
   */
  /**
   * Fire-and-forget: persist only failed non-transactional distributed writes.
   * Successful non-transactional writes are not used by recovery and would
   * otherwise convert high-throughput user traffic into extra control-plane
   * replication on sql_write_operations.
   * @param {Object} writePlan - DistributedWritePlan.
   * @param {string} statementType - SQL AST statement type.
   * @param {Object} result - Write result.
   * @private
   */
  fireNonTransactionalWriteResult(writePlan, statementType, result) {
    if (result?.success === true) {
      return;
    }
    const trackingDisposition =
      this.resolveNonTransactionalWriteTrackingDisposition(result);
    if (
      trackingDisposition !==
      NON_TRANSACTIONAL_WRITE_TRACKING_DISPOSITION.PERSIST
    ) {
      return;
    }
    const now = Date.now();
    this.persistDistributedWriteOperationRow({
      operationId: writePlan.operationId,
      transactionId: null,
      statementType,
      status: WRITE_OPERATION_STATUS.FAILED,
      idempotencyKey: writePlan.idempotencyKey,
      payloadHash: this.createWriteOperationPayloadHash(
        writePlan,
        statementType,
      ),
      partitionIds: Array.from(writePlan.partitionStatements.keys()),
      retryCount: this.resolveWriteResultRetryCount(result),
      lastError: result?.error || null,
      createdAt: now,
      updatedAt: now,
    }).catch((error) => {
      this.logger.warn(QUERY_LOG_MSG.WRITE_OP_PERSIST_FAILED, {
        operationId: writePlan.operationId,
        statementType,
        status: WRITE_OPERATION_STATUS.FAILED,
        error: error.message,
      });
    });
  }

  /**
   * Classify whether one non-transactional write failure should be persisted
   * into sql_write_operations.
   *
   * Retryable control-plane failures remain transient admission/routing
   * observations, not terminal write results. Recording those defers as
   * durable write-operation rows feeds more load into the same recovering
   * priority partition without improving transaction recovery.
   *
   * @param {Object} result - Write result.
   * @return {string}
   * @private
   */
  resolveNonTransactionalWriteTrackingDisposition(result) {
    return isRetryableControlPlaneError(result) ?
      NON_TRANSACTIONAL_WRITE_TRACKING_DISPOSITION
        .SKIP_RETRYABLE_CONTROL_PLANE_FAILURE :
      NON_TRANSACTIONAL_WRITE_TRACKING_DISPOSITION.PERSIST;
  }

  /**
   * Build deterministic payload hash for distributed write persistence.
   * @param {Object} writePlan - DistributedWritePlan.
   * @param {string} statementType - SQL AST statement type.
   * @return {string} Payload hash.
   * @private
   */
  createWriteOperationPayloadHash(writePlan, statementType) {
    const payload = JSON.stringify({
      operationId: writePlan.operationId,
      statementType,
      partitionIds: Array.from(writePlan.partitionStatements.keys()).sort(),
    });
    return createHash(LOCAL_STR_SHA1)
      .update(payload)
      .digest(LOCAL_STR_HEX);
  }

  /**
   * Resolve total retry count from a write result payload.
   * @param {Object} result - Distributed write result.
   * @return {number} Retry count.
   * @private
   */
  resolveWriteResultRetryCount(result) {
    if (Number.isInteger(result?.retryCount)) {
      return result.retryCount;
    }
    if (!Array.isArray(result?.participantResults)) {
      return 0;
    }
    return result.participantResults.reduce((sum, entry) => {
      const attempts = Number.isInteger(entry.attempts) ? entry.attempts : 1;
      return sum + Math.max(attempts - 1, 0);
    }, 0);
  }

  /**
   * Handle BEGIN TRANSACTION.
   * @param {string} sessionId - Session ID for tracking.
   * @return {Object} Transaction result.
   * @private
   */
  handleBeginTransaction(sessionId = QUERY_SESSION.DEFAULT) {
    this.logger.debug(QUERY_LOG_MSG.BEGIN_TRANSACTION, {sessionId});
    return this.transactionCoordinator.begin(sessionId);
  }

  /**
   * Handle COMMIT.
   * Routes through message router to the bound partition.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Commit result.
   * @private
   */
  async handleCommit(sessionId = QUERY_SESSION.DEFAULT) {
    const txState = this.transactionCoordinator.getTransaction(sessionId);
    this.logger.debug(QUERY_LOG_MSG.COMMIT, {
      sessionId,
      participants: txState?.participants || [],
    });

    const result = await this.transactionCoordinator.commit(sessionId);
    if (!result.success && !result.errorCode) {
      return {
        ...result,
        errorCode: QUERY_ERROR_CODE.COMMIT_FAILED,
        error: QUERY_ERROR_MSG.COMMIT_FAILED,
      };
    }
    return result;
  }

  /**
   * Handle ROLLBACK.
   * Routes through message router to the bound partition.
   * @param {string} sessionId - Session ID.
   * @return {Promise<Object>} Rollback result.
   * @private
   */
  async handleRollback(sessionId = QUERY_SESSION.DEFAULT) {
    const txState = this.transactionCoordinator.getTransaction(sessionId);
    this.logger.debug(QUERY_LOG_MSG.ROLLBACK, {
      sessionId,
      participants: txState?.participants || [],
    });

    const result = await this.transactionCoordinator.rollback(sessionId);
    if (!result.success && !result.errorCode) {
      return {
        ...result,
        errorCode: QUERY_ERROR_CODE.ROLLBACK_FAILED,
        error: QUERY_ERROR_MSG.ROLLBACK_FAILED,
      };
    }
    return result;
  }

  /**
   * Check if a session has an active transaction.
   * @param {string} sessionId - Session ID.
   * @return {boolean} True if transaction is active.
   */
  hasActiveTransaction(sessionId = QUERY_SESSION.DEFAULT) {
    return this.transactionCoordinator.hasActiveTransaction(sessionId);
  }

  /**
   * Get the partition bound to a transaction.
   * @param {string} sessionId - Session ID.
   * @return {string|null} Partition ID or null.
   */
  getTransactionPartition(sessionId = QUERY_SESSION.DEFAULT) {
    const txState = this.transactionCoordinator.getTransaction(sessionId);
    return txState?.participants?.[0] || null;
  }

  /**
   * Bind a transaction to a partition (on first write).
   * Transactions are routed through message router like all other operations.
   * @param {string} sessionId - Session ID.
   * @param {string} partitionId - Partition ID.
   * @return {Promise<void>}
   * @private
   */
  async bindTransactionToPartition(sessionId, partitionId) {
    const result = await this.transactionCoordinator.enlistParticipants(
      sessionId,
      [partitionId],
    );
    if (!result.success) {
      throw new Error(result.error || QUERY_ERROR_MSG.BEGIN_FAILED);
    }
  }

  /**
   * Resolve the routing readiness dimension for transaction control delivery.
   * Priority control-plane partitions must stay routable during recovery so
   * distributed transaction replay can complete even while normal serve traffic
   * is still blocked.
   * @param {string} partitionId - Partition ID.
   * @return {string}
   * @private
   */
  resolveTransactionOperationRoutingReadinessDimension(partitionId) {
    if (isPriorityControlPlanePartition({partitionId})) {
      return CONTROL_PLANE_READINESS_DIMENSION
        .CONTROL_PLANE_RECOVERY_ELIGIBLE;
    }
    return this.queryExecutor?.defaultRoutingReadinessDimension ||
      CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE;
  }

  /**
   * Resolve the routed delivery profile for one transaction-control message.
   * Priority control-plane recovery must not reuse the generic background
   * query lane while the transaction tables that own recovery still converge.
   *
   * @param {string} partitionId
   * @return {Object}
   * @private
   */
  buildTransactionOperationDeliveryProfile(partitionId) {
    const priorityControlPlanePartition =
      isPriorityControlPlanePartition({partitionId});
    return Object.freeze({
      routingReadinessDimension:
        this.resolveTransactionOperationRoutingReadinessDimension(partitionId),
      deliveryPriority:
        priorityControlPlanePartition ?
          PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_PRIORITY :
          undefined,
      timeoutMs:
        priorityControlPlanePartition ?
          PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_TIMEOUT_MS :
          undefined,
    });
  }

  /**
   * Resolve the canonical routing readiness dimension for one table-scoped
   * SQL operation.
   *
   * System-table traffic must stay on the control-plane recovery lane unless a
   * caller explicitly asks for a narrower dimension. Otherwise plain SQL can
   * diverge from the system-metadata owners and reintroduce `serveEligible`
   * filtering while priority recovery is still converging.
   *
   * @param {string|null} tableName
   * @param {string|undefined|null} routingReadinessDimension
   * @return {string}
   * @private
   */
  resolveTableRoutingReadinessDimension(
    tableName,
    routingReadinessDimension,
  ) {
    if (
      typeof routingReadinessDimension === LOCAL_STR_STRING &&
      routingReadinessDimension.length > 0
    ) {
      return routingReadinessDimension;
    }
    if (this.isSystemTable(tableName)) {
      return CONTROL_PLANE_READINESS_DIMENSION
        .CONTROL_PLANE_RECOVERY_ELIGIBLE;
    }
    return this.defaultRoutingReadinessDimension ||
      CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE;
  }

  /**
   * Deliver one transaction control operation to a partition service.
   * @param {string} sessionId - Session ID.
   * @param {string} partitionId - Partition ID.
   * @param {string} operation - Transaction operation.
   * @param {Object} [options] - Delivery options.
   * @param {number} [options.transactionEpoch] - Snapshot epoch.
   * @return {Promise<void>}
   * @private
   */
  async deliverTransactionOperation(sessionId, partitionId, operation, options = {}) {
    const deliveryProfile =
      this.buildTransactionOperationDeliveryProfile(partitionId);
    const deliveryIdentity =
      deliveryProfile.deliveryPriority ===
        PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_PRIORITY ?
        buildPriorityControlPlaneTransactionDeliveryIdentity({
          sessionId,
          partitionId,
          operation,
        }) :
        PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_IDENTITY_OMITTED;
    const payload = {
      type: QUERY_OPERATION.TRANSACTION,
      operation,
      sessionId,
    };
    if (Number.isFinite(options.transactionEpoch)) {
      payload.transactionEpoch = Math.floor(options.transactionEpoch);
    }
    const executionOptions = {
      buildRequest: () => ({...payload}),
      buildSuccessResult: (response) => ({...response, success: true}),
      isSuccessfulResponse: (response) =>
        response?.acknowledged === true &&
        response?.success === true,
      routingReadinessDimension:
        deliveryProfile.routingReadinessDimension,
      deliveryPriority: deliveryProfile.deliveryPriority,
      timeoutMs: deliveryProfile.timeoutMs,
      clearSessionPartitionAffinityOnSuccess:
        operation === QUERY_OPERATION.COMMIT ||
        operation === QUERY_OPERATION.ROLLBACK,
    };
    if (
      deliveryIdentity.state ===
        PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_IDENTITY_STATE.RESOLVED
    ) {
      executionOptions.deliverySource = deliveryIdentity.deliverySource;
      executionOptions.replacePendingKey = deliveryIdentity.replacePendingKey;
    }
    const result = await this.queryExecutor.executeOnPartition(
      partitionId,
      '',
      [],
      false,
      false,
      false,
      executionOptions,
    );
    if (!result.success) {
      if (operation === QUERY_OPERATION.BEGIN) {
        throw new Error(result.error || QUERY_ERROR_MSG.BEGIN_FAILED);
      }
      if (operation === QUERY_OPERATION.PREPARE) {
        throw new Error(result.error || QUERY_ERROR_MSG.PREPARE_FAILED);
      }
      if (operation === QUERY_OPERATION.COMMIT) {
        throw new Error(result.error || QUERY_ERROR_MSG.COMMIT_FAILED);
      }
      throw new Error(result.error || QUERY_ERROR_MSG.ROLLBACK_FAILED);
    }
    return result;
  }

  /**
   * Get error code from error.
   * @param {Error} error - Error object.
   * @return {string} Error code.
   * @private
   */
  getErrorCode(error) {
    if (typeof error?.errorCode === LOCAL_STR_STRING &&
        error.errorCode.length > 0) {
      return error.errorCode;
    }
    if (typeof error?.code === LOCAL_STR_STRING &&
        error.code.length > 0) {
      return error.code;
    }
    const message = error.message.toLowerCase();

    if (message.includes(LOCAL_STR_PARSE) || message.includes(LOCAL_STR_SYNTAX)) {
      return QUERY_ERROR_CODE.SYNTAX_ERROR;
    }
    if (message.includes(LOCAL_STR_TABLE_NOT_FOUND)) {
      return QUERY_ERROR_CODE.TABLE_NOT_FOUND;
    }
    if (message.includes(LOCAL_STR_TIMEOUT)) {
      return QUERY_ERROR_CODE.TIMEOUT;
    }

    return QUERY_ERROR_CODE.INTERNAL_ERROR;
  }

  /**
   * Preserve structured retry metadata when execution surfaces a typed error
   * from a lower layer instead of returning a normalized result object.
   * @param {Error|Object} error
   * @return {Object}
   * @private
   */
  buildCaughtQueryExecutionFailure(error) {
    const result = {
      success: false,
      error: error?.message || 'Query execution failed',
      errorCode: this.getErrorCode(error),
    };
    if (error?.deferRetry === true) {
      result.deferRetry = true;
    }
    if (Number.isFinite(error?.retryAfterMs) &&
        error.retryAfterMs > 0) {
      result.retryAfterMs = Math.floor(error.retryAfterMs);
    }
    if (typeof error?.pressureAction === LOCAL_STR_STRING &&
        error.pressureAction.length > 0) {
      result.pressureAction = error.pressureAction;
    }
    if (typeof error?.pressureReason === LOCAL_STR_STRING &&
        error.pressureReason.length > 0) {
      result.pressureReason = error.pressureReason;
    }
    if (error?.pressureSummary &&
        typeof error.pressureSummary === LOCAL_STR_OBJECT) {
      result.pressureSummary = {...error.pressureSummary};
    }
    if (Array.isArray(error?.participantFailures)) {
      result.participantFailures = error.participantFailures
        .filter((entry) => entry && typeof entry === LOCAL_STR_OBJECT)
        .map((entry) => ({...entry}));
    }
    if (error?.firstFailedParticipant &&
        typeof error.firstFailedParticipant === LOCAL_STR_OBJECT) {
      result.firstFailedParticipant = {
        ...error.firstFailedParticipant,
      };
    } else if (Array.isArray(result.participantFailures) &&
        result.participantFailures.length > 0) {
      result.firstFailedParticipant = result.participantFailures[0];
    }
    if (typeof error?.reasonCode === LOCAL_STR_STRING &&
        error.reasonCode.length > 0) {
      result.reasonCode = error.reasonCode;
    }
    if (typeof error?.participationKind === LOCAL_STR_STRING &&
        error.participationKind.length > 0) {
      result.participationKind = error.participationKind;
    }
    if (typeof error?.tableName === LOCAL_STR_STRING &&
        error.tableName.length > 0) {
      result.tableName = error.tableName;
    }
    if (typeof error?.failedTable === LOCAL_STR_STRING &&
        error.failedTable.length > 0) {
      result.failedTable = error.failedTable;
    }
    if (typeof error?.outcome === LOCAL_STR_STRING &&
        error.outcome.length > 0) {
      result.outcome = error.outcome;
    }
    if (typeof error?.contractState === LOCAL_STR_STRING &&
        error.contractState.length > 0) {
      result.contractState = error.contractState;
    }
    if (typeof error?.nextAction === LOCAL_STR_STRING &&
        error.nextAction.length > 0) {
      result.nextAction = error.nextAction;
    }
    if (typeof error?.visibilityState === LOCAL_STR_STRING &&
        error.visibilityState.length > 0) {
      result.visibilityState = error.visibilityState;
    }
    if (error?.authoritativeVisibilityConfirmed === true) {
      result.authoritativeVisibilityConfirmed = true;
    }
    if (typeof error?.backpressured === LOCAL_STR_BOOLEAN) {
      result.backpressured = error.backpressured;
    }
    if (Array.isArray(error?.reasonCodes)) {
      result.reasonCodes = [...error.reasonCodes];
    }
    if (Array.isArray(error?.failedDimensions)) {
      result.failedDimensions = [...error.failedDimensions];
    }
    if (error?.runtimeAuthority &&
        typeof error.runtimeAuthority === LOCAL_STR_OBJECT) {
      result.runtimeAuthority = error.runtimeAuthority;
    }
    if (error?.details && typeof error.details === LOCAL_STR_OBJECT) {
      result.details = {...error.details};
    }
    return result;
  }

  /**
   * Parse a SQL statement without executing.
   * @param {string} sql - SQL string.
   * @return {Object} Parsed AST.
   */
  parse(sql) {
    const parser = new SQLParser(sql);
    return parser.parse();
  }

  /**
   * Resolve partitions for a query without executing.
   * @param {string} tableName - Table name.
   * @param {Object} whereClause - WHERE clause AST.
   * @return {Array} Partition IDs.
   */
  resolvePartitions(tableName, whereClause) {
    const partitions = this.getTablePartitions(tableName);
    return this.partitionResolver.resolvePartitions(
      tableName,
      whereClause,
      partitions,
    );
  }
}

Object.defineProperties(
  SQLQueryEngine.prototype,
  createSQLQueryEngineTableRoutingMethods(),
);

export {SQLQueryEngine};
