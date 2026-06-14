import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {SQLQueryEngineSelectExecution} from './sql-query-engine-select-execution.js';

const LOCAL_STR_STRING = 'string';
const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_ERRORCODE = 'errorCode';
const LOCAL_STR_OUTCOME = 'outcome';
const LOCAL_STR_CONTRACTSTATE = 'contractState';
const LOCAL_STR_NEXTACTION = 'nextAction';
const LOCAL_STR_REASONCODE = 'reasonCode';
const LOCAL_STR_DELIVERYSOURCE = 'deliverySource';

const {
  BACKGROUND_SYSTEM_TABLE_DELIVERY_PRIORITY_TABLES,
  PRESSURE_WORK_CLASS,
  QUERY_AST_TYPE,
  QUERY_ERROR_MSG,
  RETRYABLE_CONTROL_PLANE_MUTATION_DEFER_STATE,
  WRITE_TRACKING_EXCLUDED_TABLES,
  buildLocalControlPlaneMutationReadinessFailure,
  buildSystemTableMutationRoutingGapFailure,
  getLocalControlPlaneMutationReadinessBlocker,
  getSystemTableMutationRoutingGapBlocker,
  resolveRetryableControlPlaneMutationDeferState,
} = SQL_QUERY_ENGINE_SHARED;

class SQLQueryEngineWriteFailureMethods extends SQLQueryEngineSelectExecution {
  applyWriteExecutionDeliverySource(writeExecutionOptions, queryOptions = {}) {
    if (
      typeof queryOptions?.deliverySource !== LOCAL_STR_STRING ||
      queryOptions.deliverySource.length <= LOCAL_NUM_ZERO
    ) {
      return writeExecutionOptions;
    }
    return {
      ...writeExecutionOptions,
      [LOCAL_STR_DELIVERYSOURCE]: queryOptions.deliverySource,
    };
  }

  buildRetryableControlPlaneLifecycleMutationFailure(
    tableName,
    error,
    queryOptions = {},
  ) {
    if (!this.isRetryableControlPlaneMutationFailure(error)) {
      return null;
    }
    const workClass =
      queryOptions?.workClass || PRESSURE_WORK_CLASS.INTERACTIVE;
    if (
      resolveRetryableControlPlaneMutationDeferState(queryOptions) ===
      RETRYABLE_CONTROL_PLANE_MUTATION_DEFER_STATE.BYPASS_CRITICAL
    ) {
      return null;
    }
    const dependencyTables =
      this.resolveTransactionControlDependencyTables(error);
    const routingGapBlocker = getSystemTableMutationRoutingGapBlocker({
      dependencyTables,
      queryExecutor: this.queryExecutor,
      routingReadinessDimension: this.resolveTableRoutingReadinessDimension(
        tableName,
        queryOptions?.routingReadinessDimension,
      ),
    });
    if (routingGapBlocker) {
      return buildSystemTableMutationRoutingGapFailure({
        blocker: routingGapBlocker,
        error,
        tableName,
        workClass,
      });
    }
    if (!this.controlPlaneReadinessService || !this.nodeId) {
      return null;
    }
    const blocker = getLocalControlPlaneMutationReadinessBlocker({
      nodeId: this.nodeId,
      controlPlaneReadinessService: this.controlPlaneReadinessService,
      requirePublishedConvergence: true,
    });
    if (!blocker) {
      return null;
    }
    return buildLocalControlPlaneMutationReadinessFailure({
      blocker,
      error,
      tableName,
      workClass,
    });
  }

  /**
   * Return one canonical deferred result when a timed-out SQL request is still
   * better explained by a shared control-plane mutation boundary.
   * @param {Object} sqlRequest
   * @param {*} error
   * @return {Object|null}
   * @private
   */
  buildTimedOutSqlRequestFailure(sqlRequest, error) {
    if (
      !this.isRetryableControlPlaneMutationFailure(error) ||
      typeof sqlRequest?.statement !== LOCAL_STR_STRING ||
      sqlRequest.statement.length === LOCAL_NUM_ZERO
    ) {
      return null;
    }

    let ast = null;
    try {
      ast = this.parse(sqlRequest.statement);
    } catch (_error) {
      return null;
    }
    if (!ast || typeof ast !== LOCAL_STR_OBJECT) {
      return null;
    }

    const queryOptions = {
      workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
      routingReadinessDimension: this.resolveTableRoutingReadinessDimension(
        ast?.table || null,
        sqlRequest?.routingReadinessDimension,
      ),
    };
    if (
      (ast.type === QUERY_AST_TYPE.UPDATE ||
        ast.type === QUERY_AST_TYPE.INSERT ||
        ast.type === QUERY_AST_TYPE.DELETE) &&
      this.isSystemTable(ast.table)
    ) {
      return this.buildRetryableSystemTableMutationFailure(
        ast.table,
        error,
        queryOptions,
      );
    }
    if (
      ast.type === QUERY_AST_TYPE.CREATE_TABLE ||
      ast.type === QUERY_AST_TYPE.ALTER_TABLE
    ) {
      return this.buildRetryableControlPlaneLifecycleMutationFailure(
        typeof ast.tableName === LOCAL_STR_STRING ? ast.tableName : null,
        error,
        queryOptions,
      );
    }
    return null;
  }

  /**
   * Return one canonical deferred result when a retryable system-table write
   * fails while local control-plane authority establishment is still pending.
   * @param {string} tableName
   * @param {*} error
   * @param {Object} [queryOptions={}]
   * @return {Object|null}
   * @private
   */
  buildRetryableSystemTableMutationFailure(
    tableName,
    error,
    queryOptions = {},
  ) {
    if (
      !this.isSystemTable(tableName) ||
      !this.isRetryableControlPlaneMutationFailure(error)
    ) {
      return null;
    }
    const workClass =
      queryOptions?.workClass || PRESSURE_WORK_CLASS.INTERACTIVE;
    if (
      resolveRetryableControlPlaneMutationDeferState(queryOptions) ===
      RETRYABLE_CONTROL_PLANE_MUTATION_DEFER_STATE.BYPASS_CRITICAL
    ) {
      return null;
    }
    const dependencyTables =
      this.resolveTransactionControlDependencyTables(error);
    const routingGapBlocker = getSystemTableMutationRoutingGapBlocker({
      dependencyTables,
      queryExecutor: this.queryExecutor,
      routingReadinessDimension:
        queryOptions?.routingReadinessDimension ||
        this.defaultRoutingReadinessDimension,
    });
    if (routingGapBlocker) {
      return buildSystemTableMutationRoutingGapFailure({
        blocker: routingGapBlocker,
        error,
        tableName,
        workClass,
      });
    }
    if (!this.controlPlaneReadinessService || !this.nodeId) {
      return null;
    }
    const blocker = getLocalControlPlaneMutationReadinessBlocker({
      nodeId: this.nodeId,
      controlPlaneReadinessService: this.controlPlaneReadinessService,
      requirePublishedConvergence: true,
    });
    if (!blocker) {
      return null;
    }
    return buildLocalControlPlaneMutationReadinessFailure({
      blocker,
      error,
      tableName,
      workClass,
    });
  }

  resolveTransactionControlDependencyTables(errorLike = null) {
    const dependencyTables = new Set();
    const addDependencyTable = (tableName) => {
      if (
        typeof tableName !== 'string' ||
        tableName.length === 0 ||
        !BACKGROUND_SYSTEM_TABLE_DELIVERY_PRIORITY_TABLES.has(tableName)
      ) {
        return;
      }
      dependencyTables.add(tableName);
    };

    addDependencyTable(errorLike?.failedTable);
    addDependencyTable(errorLike?.firstFailedParticipant?.failedTable);
    for (const participantFailure of Array.isArray(errorLike?.participantFailures) ?
      errorLike.participantFailures :
      []) {
      addDependencyTable(participantFailure?.failedTable);
    }

    return dependencyTables.size > LOCAL_NUM_ZERO ? [...dependencyTables] : null;
  }

  /**
   * Persist and return one canonical deferred system-table mutation failure
   * when a retryable lower-path failure is better explained by an owned
   * control-plane admission boundary.
   * @param {Object} context
   * @return {Promise<Object|null>}
   * @private
   */
  async resolveRetryableSystemTableMutationFailure(context = {}) {
    const canonicalFailure = this.buildRetryableSystemTableMutationFailure(
      context?.tableName,
      context?.failureLike || context?.error || null,
      context?.queryOptions || {},
    );
    if (!canonicalFailure) {
      return null;
    }
    await this.recordWriteExecutionFailure({
      txState: context?.txState,
      sessionId: context?.sessionId,
      writePlan: context?.writePlan,
      statementType: context?.statementType,
      tableName: context?.tableName,
      error: context?.error || null,
      failureResult: canonicalFailure,
    });
    return canonicalFailure;
  }

  /**
   * Persist one write-execution failure into the existing transaction or
   * non-transactional tracking surface.
   * @param {Object} context
   * @return {Promise<void>}
   * @private
   */
  async recordWriteExecutionFailure(context = {}) {
    const failureResult = context?.failureResult || null;
    const trackedFailure = {
      success: false,
      error:
        failureResult?.error ||
        context?.error?.message ||
        QUERY_ERROR_MSG.QUERY_EXECUTION_FAILED,
      retryCount: 0,
    };
    this.applyTrackedWriteFailureMetadata(trackedFailure, failureResult);
    if (context?.txState) {
      await this.transactionCoordinator.markWriteOperationResult(
        context.sessionId,
        context.writePlan.operationId,
        trackedFailure,
      );
    } else if (!WRITE_TRACKING_EXCLUDED_TABLES.has(context?.tableName)) {
      this.fireNonTransactionalWriteResult(
        context.writePlan,
        context.statementType,
        trackedFailure,
      );
    }
  }

  applyTrackedWriteFailureMetadata(trackedFailure, failureResult = null) {
    if (!failureResult || typeof failureResult !== LOCAL_STR_OBJECT) {
      return;
    }
    this.copyTrackedWriteFailureStringField(
      trackedFailure,
      LOCAL_STR_ERRORCODE,
      failureResult.errorCode,
    );
    if (failureResult.deferRetry === true) {
      trackedFailure.deferRetry = true;
    }
    if (
      Number.isFinite(failureResult.retryAfterMs) &&
      failureResult.retryAfterMs > LOCAL_NUM_ZERO
    ) {
      trackedFailure.retryAfterMs = Math.floor(failureResult.retryAfterMs);
    }
    this.copyTrackedWriteFailureStringField(
      trackedFailure,
      LOCAL_STR_OUTCOME,
      failureResult.outcome,
    );
    this.copyTrackedWriteFailureStringField(
      trackedFailure,
      LOCAL_STR_CONTRACTSTATE,
      failureResult.contractState,
    );
    this.copyTrackedWriteFailureStringField(
      trackedFailure,
      LOCAL_STR_NEXTACTION,
      failureResult.nextAction,
    );
    this.copyTrackedWriteFailureStringField(
      trackedFailure,
      LOCAL_STR_REASONCODE,
      failureResult.reasonCode,
    );
    if (Array.isArray(failureResult.reasonCodes)) {
      trackedFailure.reasonCodes = [...failureResult.reasonCodes];
    }
    if (Array.isArray(failureResult.failedDimensions)) {
      trackedFailure.failedDimensions = [...failureResult.failedDimensions];
    }
    if (
      failureResult.runtimeAuthority &&
      typeof failureResult.runtimeAuthority === LOCAL_STR_OBJECT
    ) {
      trackedFailure.runtimeAuthority = failureResult.runtimeAuthority;
    }
    if (failureResult.details && typeof failureResult.details === LOCAL_STR_OBJECT) {
      trackedFailure.details = {...failureResult.details};
    }
  }

  copyTrackedWriteFailureStringField(
    trackedFailure,
    fieldName,
    fieldValue,
  ) {
    if (typeof fieldValue === LOCAL_STR_STRING && fieldValue.length > LOCAL_NUM_ZERO) {
      trackedFailure[fieldName] = fieldValue;
    }
  }
}

export {SQLQueryEngineWriteFailureMethods};
