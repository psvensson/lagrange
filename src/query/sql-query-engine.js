import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {
  classifySystemPartition,
} from '../bootstrap/system-partition-classification.js';
import {SQLQueryEngineWriteExecution} from './sql-query-engine-write-execution.js';
import {COMMIT_POINT_REACHED_FIELD} from
  './distributed/distributed-transaction-commit-point.js';
import {createSQLQueryEngineTableRoutingMethods} from './sql-query-engine-table-routing-methods.js';
import {createSQLQueryEngineTransactionPersistenceMethods} from
  './sql-query-engine-transaction-persistence-methods.js';
import {
  isParticipantTransactionAnswer,
  participantAnswerSnapshotOf,
  participantDeliveryKeyOf,
  participantEntryIdOf,
  participantFailureOf,
  participantTransactionRequestOf,
} from './sql-query-engine-participant-wire.js';
import {
  distributedBeginAcceptanceOf,
  distributedBeginConsumerOf,
} from './distributed/distributed-begin-consumer.js';

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
  CONTROL_PLANE_READINESS_DIMENSION,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_LOG_MSG,
  QUERY_OPERATION,
  QUERY_SESSION,
  SQLParser,
  WRITE_OPERATION_STATUS,
  createHash,
  isRetryableControlPlaneError,
} = SQL_QUERY_ENGINE_SHARED;

const PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_PRIORITY = 'critical';
const PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_TIMEOUT_MS = 15000; // ends-on: the priority control-plane partition delivery succeeds
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
const TYPED_PARTICIPANT_FAILURE_FIELDS = Object.freeze([
  'failureCode',
  'refusalCause',
  'refusalLayer',
]);
const NON_TRANSACTIONAL_WRITE_TRACKING_DISPOSITION = Object.freeze({
  PERSIST: 'persist',
  SKIP_RETRYABLE_CONTROL_PLANE_FAILURE:
    'skip_retryable_control_plane_failure',
});

// The delivery identity of one transaction-control message: bound to the
// exact transaction and operation (TX1 seam A), never to the session.
function buildPriorityControlPlaneTransactionDeliveryIdentity({
  transactionId,
  partitionId,
  operation,
} = {}) {
  const parts = participantDeliveryKeyOf({transactionId, partitionId,
    operation});
  if (parts === null) {
    return PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_IDENTITY_OMITTED;
  }
  const deliveryKey = [
    PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_SOURCE_PREFIX,
    ...parts,
  ].join(PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_KEY_SEPARATOR);
  return Object.freeze({
    state: PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_IDENTITY_STATE.RESOLVED,
    deliverySource: deliveryKey,
    replacePendingKey: deliveryKey,
  });
}

class SQLQueryEngine extends SQLQueryEngineWriteExecution {
  canAcceptDistributedBeginForConsumer(options, result) {
    return this.transactionCoordinator.canAcceptDistributedBegin(
      distributedBeginConsumerOf(options),
      distributedBeginAcceptanceOf(result),
    );
  }

  acceptDistributedBeginForConsumer(options, result, enterLocalBlock) {
    return this.transactionCoordinator.acceptDistributedBegin(
      distributedBeginConsumerOf(options),
      distributedBeginAcceptanceOf(result),
      enterLocalBlock,
    );
  }

  retireDistributedBeginConsumer(sessionId, consumer) {
    this.transactionCoordinator.retireDistributedBeginConsumer(
      sessionId,
      consumer,
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
   * BEGIN for a session that may expect to be inside a transaction already:
   * when the engine no longer holds the expected one, BEGIN is refused
   * rather than opening a fresh transaction under the client's old block.
   * @param {string} sessionId - Session ID.
   * @param {Object} options - Query options (expectedTransactionId).
   * @return {Promise<Object>} Transaction result.
   * @private
   */
  async handleAdmittedBegin(sessionId, options = {}) {
    return this.handleBeginTransaction(sessionId, options);
  }

  /**
   * Handle BEGIN TRANSACTION.
   * @param {string} sessionId - Session ID for tracking.
   * @return {Object} Transaction result.
   * @private
   */
  handleBeginTransaction(sessionId = QUERY_SESSION.DEFAULT, options = {}) {
    this.logger.debug(QUERY_LOG_MSG.BEGIN_TRANSACTION, {sessionId});
    return this.transactionCoordinator.begin(sessionId, options);
  }

  /**
   * Handle COMMIT.
   * Routes through message router to the bound partition.
   * @param {string} sessionId - Session ID.
   * @param {Object} [options] - Query options (expectedTransactionId: the
   *   block's transaction, so a missing one is answered from its own record).
   * @return {Promise<Object>} Commit result.
   * @private
   */
  async handleCommit(sessionId = QUERY_SESSION.DEFAULT, options = {}) {
    const txState = this.transactionCoordinator.getTransaction(sessionId);
    this.logger.debug(QUERY_LOG_MSG.COMMIT, {
      sessionId,
      participants: txState?.participants || [],
    });

    let result;
    try {
      result = await this.transactionCoordinator.commit(sessionId, {
        expectedTransactionId: options.expectedTransactionId ?? null,
      });
    } catch (error) {
      // A COMMIT that threw is answered as a failed COMMIT carrying the
      // coordinator's commit-point fact (absent: unknown).
      return {
        ...this.buildCaughtQueryExecutionFailure(error),
        ...(typeof error?.[COMMIT_POINT_REACHED_FIELD] === LOCAL_STR_BOOLEAN ?
          {[COMMIT_POINT_REACHED_FIELD]: error[COMMIT_POINT_REACHED_FIELD]} :
          {}),
      };
    }
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
  async handleRollback(sessionId = QUERY_SESSION.DEFAULT, options = {}) {
    const txState = this.transactionCoordinator.getTransaction(sessionId);
    this.logger.debug(QUERY_LOG_MSG.ROLLBACK, {
      sessionId,
      participants: txState?.participants || [],
    });

    const result = await this.transactionCoordinator.rollback(sessionId, options);
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
    if (classifySystemPartition({partitionId}).priorityControlPlane) {
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
      classifySystemPartition({partitionId}).priorityControlPlane;
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
   * Deliver one transaction control operation to a participant: the request
   * carries the transaction identity (and a decision's binding), a PREPARE or
   * decision is delivered under the participant's deterministic entryId, and
   * an answer that did not succeed is thrown as the participant wire's typed
   * failure (sql-query-engine-participant-wire.js).
   * @param {string} sessionId - Session ID (routing context).
   * @param {string} partitionId - Partition ID.
   * @param {string} operation - Transaction operation.
   * @param {Object} [options] - The identity fields (transactionId,
   *   participantId, commitMode, transactionEpoch) and a decision's binding.
   * @return {Promise<Object>} The participant's successful answer.
   * @private
   */
  async deliverTransactionOperation(sessionId, partitionId, operation, options = {}) {
    const deliveryProfile =
      this.buildTransactionOperationDeliveryProfile(partitionId);
    const request = participantTransactionRequestOf(sessionId, operation,
      options);
    const deliveryIdentity =
      deliveryProfile.deliveryPriority ===
        PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_PRIORITY ?
        buildPriorityControlPlaneTransactionDeliveryIdentity({
          transactionId: request.transactionId,
          partitionId,
          operation,
        }) :
        PRIORITY_CONTROL_PLANE_TRANSACTION_DELIVERY_IDENTITY_OMITTED;
    const entryId = participantEntryIdOf(operation, request);
    const expectedAnswer = {
      operation,
      partitionId,
      transactionId: request.transactionId,
      participantId: request.participantId,
    };
    let acceptedAnswer = null;
    const executionOptions = {
      sessionId,
      buildRequest: () => ({...request}),
      buildSuccessResult: () => ({...acceptedAnswer}),
      isSuccessfulResponse: (response) => {
        acceptedAnswer = participantAnswerSnapshotOf(response, expectedAnswer);
        return acceptedAnswer !== null &&
          isParticipantTransactionAnswer(acceptedAnswer, expectedAnswer);
      },
      routingReadinessDimension:
        deliveryProfile.routingReadinessDimension,
      deliveryPriority: deliveryProfile.deliveryPriority,
      timeoutMs: deliveryProfile.timeoutMs,
      clearSessionPartitionAffinityOnSuccess:
        operation === QUERY_OPERATION.COMMIT ||
        operation === QUERY_OPERATION.ROLLBACK,
      ...(entryId === null ? {} : {entryId}),
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
    if (result?.success !== true) {
      throw participantFailureOf(operation, result);
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
    // A participant's typed refusal reaches the client by its own code (TX1
    // design 2.2): a refused BEGIN, a doomed session, a PREPARE refusal and
    // its cause.
    for (const field of TYPED_PARTICIPANT_FAILURE_FIELDS) {
      if (typeof error?.[field] === LOCAL_STR_STRING &&
          error[field].length > 0) {
        result[field] = error[field];
      }
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
Object.defineProperties(
  SQLQueryEngine.prototype,
  createSQLQueryEngineTransactionPersistenceMethods(),
);

export {SQLQueryEngine};
