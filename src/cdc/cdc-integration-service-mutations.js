import {CDC_INTEGRATION_SERVICE_SHARED} from './cdc-integration-service-shared.js';
import {buildSystemTableMutationSqlParts} from './cdc-system-table-mutation-sql-helpers.js';

const {
  CDCOperationType,
  CDC_ERROR_MSG,
  CDC_EVENT,
  CDC_LOG_MSG,
  CDC_OPERATION,
  CDC_OPERATION_LABEL,
  CDC_PRIMARY_KEY,
  SQL,
  buildSystemTableMutationError,
  buildSystemTableVisibilityResult,
  normalizeSystemTableVisibilityResult,
  shouldLogTableWriteFailure,
  logSystemTableWriteFailure,
} = CDC_INTEGRATION_SERVICE_SHARED;


/**
 * Delete a row from a system table.
 * @param {Object} context - Service context.
 * @param {string} tableName - System table name.
 * @param {Object} whereClause - Delete conditions.
 * @param {Object} options - Options.
 * @return {Promise<Object>} Delete result.
 */
export async function deleteSystemTableRow(context, tableName, whereClause, options = {}) {
  context.validateTableName(tableName);
  context.validateData(whereClause, CDC_OPERATION_LABEL.DELETE_WHERE);
  const idField = context.getPrimaryKeyField(tableName);
  const id = whereClause[idField] || whereClause[CDC_PRIMARY_KEY.FALLBACK];
  if (!id) {
    throw new Error(
      `${CDC_ERROR_MSG.DELETE_PRIMARY_KEY_PREFIX}${idField}` +
        `${CDC_ERROR_MSG.DELETE_PRIMARY_KEY_SUFFIX}`,
    );
  }
  const singleFlightKey = context.buildMutationSingleFlightKey(
    CDC_OPERATION.DELETE,
    tableName,
    id,
    {
      whereClause,
    },
    options,
  );
  context.logger.debug(CDC_LOG_MSG.DELETING_ROW, {
    tableName,
    id,
    nodeId: context.nodeId,
  });
  return context.runCoalescedMutation(singleFlightKey, async () => {
    try {
      const {whereStr, values} =
        buildSystemTableMutationSqlParts(CDC_OPERATION.DELETE, whereClause);
      const sql = `${SQL.DELETE_FROM} ${tableName} ${SQL.WHERE} ${whereStr}`;
      const result = await context.executeSQL(sql, values, {
        queryTimeoutMs: options?.queryTimeoutMs,
        cancellationToken: options?.cancellationToken || null,
        sessionId: options?.sessionId,
        disableSystemWriteSession: options?.disableSystemWriteSession,
        coalescingKey: options?.coalescingKey,
        recoveryCandidateSelectionKey: options?.recoveryCandidateSelectionKey,
        routingReadinessDimension: options?.routingReadinessDimension,
        workloadClass: options?.workloadClass,
        workClass: options?.workClass,
        pressureRetryAfterMs: options?.pressureRetryAfterMs,
        deliveryPriority: options?.deliveryPriority,
        deliverySource: options?.deliverySource,
        replacePendingKey: options?.replacePendingKey,
      });
      if (!result.success) {
        throw buildSystemTableMutationError(
          result,
          CDC_ERROR_MSG.DELETE_FAILED,
        );
      }
      let visibilityResult = buildSystemTableVisibilityResult();
      if (
        typeof result.affectedRows !== 'number' ||
        result.affectedRows > 0
      ) {
        visibilityResult = normalizeSystemTableVisibilityResult(
          await context.waitForCacheUpdate(tableName, id, false, {
            allowPendingVisibility: options?.allowPendingVisibility === true,
          }),
        );
      }
      context.stats.deletes++;
      context.logger.debug(CDC_LOG_MSG.DELETED_ROW, {
        tableName,
        id,
        success: true,
        changes: result.affectedRows,
      });
      context.emit(CDC_EVENT.DELETE, {
        tableName,
        whereClause,
        id,
        result,
      });
      return {
        success: true,
        operation: CDCOperationType.DELETE,
        tableName,
        whereClause,
        id,
        partitionResult: result,
        visibilityState: visibilityResult.visibilityState,
        contractState: visibilityResult.contractState,
        nextAction: visibilityResult.nextAction,
        authoritativeVisibilityConfirmed:
          visibilityResult.authoritativeVisibilityConfirmed,
        retryAfterMs: visibilityResult.retryAfterMs,
      };
    } catch (error) {
      context.stats.failures++;
      if (shouldLogTableWriteFailure(tableName)) {
        logSystemTableWriteFailure(
          context,
          CDC_LOG_MSG.DELETE_FAILED,
          {
            tableName,
            id,
            error: error.message,
            nodeId: context.nodeId,
            causeId:
              typeof options?.causeId === 'string' ?
                options.causeId :
                null,
            operation: CDC_OPERATION.DELETE,
            primaryKey: {
              [idField]: id,
            },
          },
          error,
        );
      }
      context.emitErrorEvent({
        operation: CDCOperationType.DELETE,
        tableName,
        whereClause,
        error: error.message,
      });
      throw error;
    }
  });
}

/**
 * Upsert a row in a system table (insert or replace on conflict).
 * @param {Object} context - Service context.
 * @param {string} tableName - System table name.
 * @param {Object} data - Row data to upsert.
 * @param {Object} options - Options.
 * @return {Promise<Object>} Upsert result.
 */
export async function upsertSystemTableRow(context, tableName, data, options = {}) {
  context.validateTableName(tableName);
  context.validateData(data, CDC_OPERATION_LABEL.UPSERT);
  const upsertData = context.prepareInsertData(tableName, data, {
    generatePrimaryKey: false,
  });
  const idField = context.getPrimaryKeyField(tableName);
  const id = upsertData[idField];
  if (!id) {
    throw new Error(
      `${CDC_ERROR_MSG.UPSERT_PRIMARY_KEY_PREFIX}${idField}` +
        `${CDC_ERROR_MSG.UPSERT_PRIMARY_KEY_SUFFIX}`,
    );
  }
  const singleFlightKey = context.buildMutationSingleFlightKey(
    CDC_OPERATION.UPSERT,
    tableName,
    id,
    upsertData,
    options,
  );
  context.logger.debug(CDC_LOG_MSG.UPSERTING_ROW, {
    tableName,
    id,
    nodeId: context.nodeId,
  });
  return context.runCoalescedMutation(singleFlightKey, async () => {
    try {
      const {columns, placeholders, values} =
        buildSystemTableMutationSqlParts(CDC_OPERATION.INSERT, upsertData);
      // SQLite INSERT OR REPLACE
      const sql =
        `${SQL.INSERT_OR_REPLACE_INTO} ${tableName} (${columns}) ` +
        `${SQL.VALUES} (${placeholders})`;
      const result = await context.executeSQL(sql, values, {
        queryTimeoutMs: options?.queryTimeoutMs,
        cancellationToken: options?.cancellationToken || null,
        sessionId: options?.sessionId,
        disableSystemWriteSession: options?.disableSystemWriteSession,
        coalescingKey: options?.coalescingKey,
        recoveryCandidateSelectionKey: options?.recoveryCandidateSelectionKey,
        routingReadinessDimension: options?.routingReadinessDimension,
        workloadClass: options?.workloadClass,
        workClass: options?.workClass,
        pressureRetryAfterMs: options?.pressureRetryAfterMs,
        deliveryPriority: options?.deliveryPriority,
        deliverySource: options?.deliverySource,
        replacePendingKey: options?.replacePendingKey,
      });
      if (!result.success) {
        throw buildSystemTableMutationError(
          result,
          CDC_ERROR_MSG.UPSERT_FAILED,
        );
      }
      let visibilityResult = buildSystemTableVisibilityResult();
      if (options?.skipCacheWait !== true) {
        visibilityResult = normalizeSystemTableVisibilityResult(
          await context.waitForCacheUpdate(tableName, id, true, {
            allowPendingVisibility: options?.allowPendingVisibility === true,
          }),
        );
      }
      context.stats.updates++;
      context.logger.debug(CDC_LOG_MSG.UPSERTED_ROW, {
        tableName,
        id,
        success: true,
      });
      context.emit(CDC_EVENT.UPSERT, {
        tableName,
        data: upsertData,
        result,
      });
      return {
        success: true,
        operation: CDCOperationType.UPSERT,
        tableName,
        data: upsertData,
        partitionResult: result,
        visibilityState: visibilityResult.visibilityState,
        contractState: visibilityResult.contractState,
        nextAction: visibilityResult.nextAction,
        authoritativeVisibilityConfirmed:
          visibilityResult.authoritativeVisibilityConfirmed,
        retryAfterMs: visibilityResult.retryAfterMs,
      };
    } catch (error) {
      context.stats.failures++;
      if (shouldLogTableWriteFailure(tableName)) {
        logSystemTableWriteFailure(
          context,
          CDC_LOG_MSG.UPSERT_FAILED,
          {
            tableName,
            id,
            error: error.message,
            nodeId: context.nodeId,
            causeId:
              typeof options?.causeId === 'string' ?
                options.causeId :
                null,
            operation: CDC_OPERATION.UPSERT,
            primaryKey: {
              [idField]: id,
            },
          },
          error,
        );
      }
      context.emitErrorEvent({
        operation: CDCOperationType.UPSERT,
        tableName,
        data: upsertData,
        error: error.message,
      });
      throw error;
    }
  });
}
