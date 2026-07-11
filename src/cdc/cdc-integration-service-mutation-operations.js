import {CDC_INTEGRATION_SERVICE_SHARED} from './cdc-integration-service-shared.js';
import {buildSystemTableMutationSqlParts} from './cdc-system-table-mutation-sql-helpers.js';
import {hydrateCdcPropagatedTablesFromAuthority} from
  './cdc-integration-service-authoritative-catchup.js';

// Import delete and upsert mutation helpers
import {
  deleteSystemTableRow,
  upsertSystemTableRow,
} from './cdc-integration-service-mutations.js';

// Import fallback diagnostics helper
import {
  pruneAuthoritativeFallbackHistory,
  recordAuthoritativeFallbackSignal,
  getAuthoritativeFallbackDiagnostics,
} from './cdc-integration-service-fallback-diagnostics.js';

// Import cache visibility and divergence helper
import {
  doesCacheRecordMatchExpectedFields,
  normalizeExpectedFieldsForMinimums,
  doesCacheRecordMeetMinimumFields,
  isCacheFieldValueAtLeast,
  normalizeComparableCacheFieldValue,
  areCacheFieldValuesEqual,
  buildCacheVisibilityDivergentFields,
  emitCacheVisibilityDivergence,
  filterDataForTable,
} from './cdc-integration-service-cache-divergence.js';

// Import insert data normalization helper
import {
  prepareInsertData,
  applySchemaDefaults,
  applyTimestampDefaults,
  applyTableInsertDefaults,
  normalizeDefaultValue,
} from './cdc-integration-service-insert-normalization.js';

// Import coalesced mutation helper
import {
  emitErrorEvent,
  buildMutationSingleFlightKey,
  runCoalescedMutation,
} from './cdc-integration-service-coalesced-mutation.js';

const {
  CDCOperationType,
  CDC_ERROR_MSG,
  CDC_EVENT,
  CDC_LOG_MSG,
  CDC_OPERATION,
  CDC_OPERATION_LABEL,
  CDC_PRIMARY_KEY,
  CDC_STATS_DEFAULT,
  METRICS_LOG_TAG,
  SQL,
  buildSystemTableMutationError,
  buildSystemTableVisibilityResult,
  getSystemCachePrimaryKeyFieldOrFallback,
  logSystemTableWriteFailure,
  normalizeSystemTableVisibilityResult,
  shouldEmitTableWriteMetric,
  shouldLogTableWriteFailure,
} = CDC_INTEGRATION_SERVICE_SHARED;

const CDC_INTEGRATION_SERVICE_MUTATION_OPERATIONS_CONSTRUCTOR = 'constructor';

/**
 * System-table mutation write methods (insert/update/delete/upsert) plus the
 * thin delegators over the normalization, cache-divergence, coalesced-mutation,
 * fallback-diagnostics, and authoritative-catchup helpers, and basic
 * statistics/primary-key accessors.
 */
class CDCIntegrationServiceMutationOperations {
  /**
   * Catch-up hydration of all CDC-propagated tables from the authoritative
   * owner path (CL-014: closes the bootstrap-snapshot ->
   * fan-out-targetability window in which remote CDC events are silently
   * lost to this node). See cdc-integration-service-authoritative-catchup.js.
   * @param {Object} [options]
   * @return {Promise<Object>} Hydration summary.
   */
  hydrateCdcPropagatedTablesFromAuthority(options = {}) {
    return hydrateCdcPropagatedTablesFromAuthority(this, options);
  }

  pruneAuthoritativeFallbackHistory(nowMs) {
    this.authoritativeFallbackHistory = pruneAuthoritativeFallbackHistory(
      this.authoritativeFallbackHistory,
      this.authoritativeFallbackWindowMs,
      nowMs,
    );
  }

  recordAuthoritativeFallbackSignal(options = {}) {
    return recordAuthoritativeFallbackSignal(this, options);
  }

  getAuthoritativeFallbackDiagnostics() {
    return getAuthoritativeFallbackDiagnostics(this);
  }

  doesCacheRecordMatchExpectedFields(record, expectedFields) {
    return doesCacheRecordMatchExpectedFields(record, expectedFields);
  }

  normalizeExpectedFieldsForMinimums(expectedFields, minimumFields) {
    return normalizeExpectedFieldsForMinimums(expectedFields, minimumFields);
  }

  doesCacheRecordMeetMinimumFields(record, minimumFields) {
    return doesCacheRecordMeetMinimumFields(record, minimumFields);
  }

  isCacheFieldValueAtLeast(actualValue, minimumValue) {
    return isCacheFieldValueAtLeast(actualValue, minimumValue);
  }

  normalizeComparableCacheFieldValue(value) {
    return normalizeComparableCacheFieldValue(value);
  }

  areCacheFieldValuesEqual(actualValue, expectedValue) {
    return areCacheFieldValuesEqual(actualValue, expectedValue);
  }

  buildCacheVisibilityDivergentFields(
    primaryKeyField,
    expectedFields,
    minimumFields,
  ) {
    return buildCacheVisibilityDivergentFields(
      primaryKeyField,
      expectedFields,
      minimumFields,
    );
  }

  emitCacheVisibilityDivergence(
    tableName,
    key,
    divergenceType,
    cacheValue,
    authoritativeValue,
    divergentFields,
    phase,
  ) {
    emitCacheVisibilityDivergence(
      this,
      tableName,
      key,
      divergenceType,
      cacheValue,
      authoritativeValue,
      divergentFields,
      phase,
    );
  }

  filterDataForTable(tableName, data) {
    return filterDataForTable(tableName, data);
  }

  prepareInsertData(tableName, data, options = {}) {
    return prepareInsertData(this, tableName, data, options);
  }

  applySchemaDefaults(schema, rowData) {
    applySchemaDefaults(schema, rowData);
  }

  applyTimestampDefaults(schema, rowData) {
    applyTimestampDefaults(schema, rowData);
  }

  applyTableInsertDefaults(tableName, schema, rowData) {
    applyTableInsertDefaults(tableName, schema, rowData);
  }

  normalizeDefaultValue(value) {
    return normalizeDefaultValue(value);
  }

  emitErrorEvent(payload) {
    emitErrorEvent(this, payload);
  }

  buildMutationSingleFlightKey(
    operation,
    tableName,
    identity,
    payload,
    options = {},
  ) {
    return buildMutationSingleFlightKey(
      operation,
      tableName,
      identity,
      payload,
      options,
    );
  }

  runCoalescedMutation(singleFlightKey, executionFactory) {
    return runCoalescedMutation(this, singleFlightKey, executionFactory);
  }


  /**
   * Insert a row into a system table.
   * The write goes through SQL, which routes to the partition leader.
   * The partition generates a CDC event that updates all caches.
   *
   * @param {string} tableName - System table name.
   * @param {Object} data - Row data to insert.
   * @param {Object} [options] - Insert options.
   * @return {Promise<Object>} Insert result.
   */
  async insertSystemTableRow(tableName, data, options = {}) {
    this.validateTableName(tableName);
    this.validateData(data, CDC_OPERATION.INSERT);
    const rowData = this.prepareInsertData(tableName, data);
    const idField = this.getPrimaryKeyField(tableName);
    const trackingId = rowData[idField];
    const singleFlightKey = this.buildMutationSingleFlightKey(
      CDC_OPERATION.INSERT,
      tableName,
      trackingId,
      rowData,
      options,
    );
    this.logger.debug(CDC_LOG_MSG.INSERTING_ROW, {
      tableName,
      id: trackingId,
      nodeId: this.nodeId,
    });
    return this.runCoalescedMutation(singleFlightKey, async () => {
      try {
        const {columns, placeholders, values} =
          buildSystemTableMutationSqlParts(CDC_OPERATION.INSERT, rowData);
        const sql =
          `${options?.ignoreExisting === true ? SQL.INSERT_OR_IGNORE_INTO : SQL.INSERT_INTO} ${tableName} (${columns}) ` +
          `${SQL.VALUES} (${placeholders})`;
        const sqlStartMs = Date.now();
        const result = await this.executeSQL(sql, values, {
          queryTimeoutMs: options?.queryTimeoutMs,
          cancellationToken: options?.cancellationToken || null,
          routingReadinessDimension: options?.routingReadinessDimension,
          workloadClass: options?.workloadClass,
          workClass: options?.workClass,
          allowPressureDefer: options?.allowPressureDefer,
          pressureRetryAfterMs: options?.pressureRetryAfterMs,
          deliveryPriority: options?.deliveryPriority,
          deliverySource: options?.deliverySource,
          replacePendingKey: options?.replacePendingKey,
          sessionId: options?.sessionId,
          disableSystemWriteSession: options?.disableSystemWriteSession,
          coalescingKey: options?.coalescingKey,
          recoveryCandidateSelectionKey:
            options?.recoveryCandidateSelectionKey,
        });
        const sqlDurationMs = Date.now() - sqlStartMs;
        if (!result.success) {
          throw buildSystemTableMutationError(
            result,
            CDC_ERROR_MSG.INSERT_FAILED,
          );
        }
        const pkField = this.getPrimaryKeyField(tableName);
        const pkValue = rowData[pkField];
        const cacheWaitStartMs = Date.now();
        let visibilityResult = buildSystemTableVisibilityResult();
        if (pkValue && options?.skipCacheWait !== true) {
          visibilityResult = normalizeSystemTableVisibilityResult(
            await this.waitForCacheUpdate(tableName, pkValue, true, {
              allowPendingVisibility: options?.allowPendingVisibility === true,
            }),
          );
        }
        const cacheWaitDurationMs = Date.now() - cacheWaitStartMs;
        if (shouldEmitTableWriteMetric(tableName)) {
          try {
            this.logger.info(METRICS_LOG_TAG.CDC_WRITE, {
              tableName,
              operation: CDC_OPERATION.INSERT,
              sqlDurationMs,
              cacheWaitDurationMs,
              totalDurationMs: sqlDurationMs + cacheWaitDurationMs,
            });
          } catch (_metricsErr) {
            // Metrics logging must not propagate to callers
          }
        }
        this.stats.inserts++;
        this.logger.debug(CDC_LOG_MSG.INSERTED_ROW, {
          tableName,
          id: trackingId,
          success: true,
        });
        this.emit(CDC_EVENT.INSERT, {
          tableName,
          data: rowData,
          result,
        });
        return {
          success: true,
          operation: CDCOperationType.INSERT,
          tableName,
          data: rowData,
          affectedRows: result?.affectedRows,
          partitionResult: result,
          visibilityState: visibilityResult.visibilityState,
          contractState: visibilityResult.contractState,
          nextAction: visibilityResult.nextAction,
          authoritativeVisibilityConfirmed:
            visibilityResult.authoritativeVisibilityConfirmed,
          retryAfterMs: visibilityResult.retryAfterMs,
        };
      } catch (error) {
        this.stats.failures++;
        if (shouldLogTableWriteFailure(tableName)) {
          logSystemTableWriteFailure(
            this,
            CDC_LOG_MSG.INSERT_FAILED,
            {
              tableName,
              id: trackingId,
              error: error.message,
              nodeId: this.nodeId,
              causeId:
                typeof options?.causeId === 'string' ?
                  options.causeId :
                  null,
              operation: CDC_OPERATION.INSERT,
              primaryKey: trackingId ?
                {
                  [idField]: trackingId,
                } :
                null,
            },
            error,
          );
        }
        this.emitErrorEvent({
          operation: CDCOperationType.INSERT,
          tableName,
          data: rowData,
          error: error.message,
        });
        throw error;
      }
    });
  }

  /**
   * Update a row in a system table.
   * The write goes through SQL, which routes to the partition leader.
   * The partition generates a CDC event that updates all caches.
   *
   * @param {string} tableName - System table name.
   * @param {Object} whereClause - WHERE clause conditions (must include primary key).
   * @param {Object} data - Data to update.
   * @return {Promise<Object>} Update result.
   */
  async updateSystemTableRow(tableName, whereClause, data, options = {}) {
    this.validateTableName(tableName);
    this.validateData(whereClause, CDC_OPERATION_LABEL.UPDATE_WHERE);
    this.validateData(data, CDC_OPERATION_LABEL.UPDATE_DATA);
    const idField = this.getPrimaryKeyField(tableName);
    const id = whereClause[idField] || whereClause[CDC_PRIMARY_KEY.FALLBACK];
    if (!id) {
      throw new Error(
        `${CDC_ERROR_MSG.UPDATE_PRIMARY_KEY_PREFIX}${idField}` +
          `${CDC_ERROR_MSG.UPDATE_PRIMARY_KEY_SUFFIX}`,
      );
    }
    const updateData = this.filterDataForTable(tableName, {
      ...data,
    });
    if (Object.keys(updateData).length === 0) {
      throw new Error(
        `${CDC_ERROR_MSG.UPDATE_VALID_COLUMNS_PREFIX}${tableName}`,
      );
    }
    const singleFlightKey = this.buildMutationSingleFlightKey(
      CDC_OPERATION.UPDATE,
      tableName,
      id,
      {
        whereClause,
        data: updateData,
      },
      options,
    );
    this.logger.debug(CDC_LOG_MSG.UPDATING_ROW, {
      tableName,
      id,
      nodeId: this.nodeId,
    });
    return this.runCoalescedMutation(singleFlightKey, async () => {
      try {
        const {setClause, values: setValues} =
          buildSystemTableMutationSqlParts(CDC_OPERATION.UPDATE, updateData);
        const {whereStr, values: whereValues} =
          buildSystemTableMutationSqlParts(CDC_OPERATION.DELETE, whereClause);
        const sql =
          `${SQL.UPDATE} ${tableName} ${SQL.SET} ${setClause} ` +
          `${SQL.WHERE} ${whereStr}`;
        const sqlStartMs = Date.now();
        const result = await this.executeSQL(
          sql,
          [...setValues, ...whereValues],
          {
            queryTimeoutMs: options?.queryTimeoutMs,
            cancellationToken: options?.cancellationToken || null,
            sessionId: options?.sessionId,
            disableSystemWriteSession: options?.disableSystemWriteSession,
            coalescingKey: options?.coalescingKey,
            recoveryCandidateSelectionKey:
              options?.recoveryCandidateSelectionKey,
            routingReadinessDimension: options?.routingReadinessDimension,
            workloadClass: options?.workloadClass,
            workClass: options?.workClass,
            allowPressureDefer: options?.allowPressureDefer,
            pressureRetryAfterMs: options?.pressureRetryAfterMs,
            deliveryPriority: options?.deliveryPriority,
            deliverySource: options?.deliverySource,
            replacePendingKey: options?.replacePendingKey,
          },
        );
        const sqlDurationMs = Date.now() - sqlStartMs;
        if (!result.success) {
          throw buildSystemTableMutationError(
            result,
            CDC_ERROR_MSG.UPDATE_FAILED,
          );
        }
        const cacheWaitStartMs = Date.now();
        let visibilityResult = buildSystemTableVisibilityResult();
        if (
          options?.skipCacheWait !== true &&
          (typeof result.affectedRows !== 'number' ||
            result.affectedRows > 0)
        ) {
          const expectedCacheFields =
            options?.expectedCacheFields &&
            typeof options.expectedCacheFields === 'object' ?
              options.expectedCacheFields :
              null;
          const minimumCacheFields =
            options?.minimumCacheFields &&
            typeof options.minimumCacheFields === 'object' ?
              options.minimumCacheFields :
              null;
          visibilityResult = normalizeSystemTableVisibilityResult(
            await this.waitForCacheUpdate(tableName, id, true, {
              expectedFields: expectedCacheFields,
              minimumFields: minimumCacheFields,
              allowPendingVisibility: options?.allowPendingVisibility === true,
            }),
          );
        }
        const cacheWaitDurationMs = Date.now() - cacheWaitStartMs;
        if (shouldEmitTableWriteMetric(tableName)) {
          try {
            this.logger.info(METRICS_LOG_TAG.CDC_WRITE, {
              tableName,
              operation: CDC_OPERATION.UPDATE,
              sqlDurationMs,
              cacheWaitDurationMs,
              totalDurationMs: sqlDurationMs + cacheWaitDurationMs,
            });
          } catch (_metricsErr) {
            // Metrics logging must not propagate to callers
          }
        }
        this.stats.updates++;
        this.logger.debug(CDC_LOG_MSG.UPDATED_ROW, {
          tableName,
          id,
          success: true,
          changes: result.affectedRows,
        });
        this.emit(CDC_EVENT.UPDATE, {
          tableName,
          whereClause,
          data: updateData,
          result,
        });
        return {
          success: true,
          operation: CDCOperationType.UPDATE,
          tableName,
          whereClause,
          data: updateData,
          partitionResult: result,
          visibilityState: visibilityResult.visibilityState,
          contractState: visibilityResult.contractState,
          nextAction: visibilityResult.nextAction,
          authoritativeVisibilityConfirmed:
            visibilityResult.authoritativeVisibilityConfirmed,
          retryAfterMs: visibilityResult.retryAfterMs,
        };
      } catch (error) {
        this.stats.failures++;
        if (shouldLogTableWriteFailure(tableName)) {
          logSystemTableWriteFailure(
            this,
            CDC_LOG_MSG.UPDATE_FAILED,
            {
              tableName,
              id,
              error: error.message,
              nodeId: this.nodeId,
              causeId:
                typeof options?.causeId === 'string' ?
                  options.causeId :
                  null,
              operation: CDC_OPERATION.UPDATE,
              primaryKey: {
                [idField]: id,
              },
            },
            error,
          );
        }
        this.emitErrorEvent({
          operation: CDCOperationType.UPDATE,
          tableName,
          whereClause,
          data: updateData,
          error: error.message,
        });
        throw error;
      }
    });
  }

  /**
   * Delete a row from a system table.
   * The write goes through SQL, which routes to the partition leader.
   * The partition generates a CDC event that updates all caches.
   *
   * @param {string} tableName - System table name.
   * @param {Object} whereClause - WHERE clause conditions (must include primary key).
   * @param {Object} [options] - Delete options.
   * @return {Promise<Object>} Delete result.
   */
  async deleteSystemTableRow(tableName, whereClause, options = {}) {
    return deleteSystemTableRow(this, tableName, whereClause, options);
  }

  /**
   * Upsert a row in a system table (insert or replace on conflict).
   * The write goes through SQL, which routes to the partition leader.
   * The partition generates a CDC event that updates all caches.
   *
   * @param {string} tableName - System table name.
   * @param {Object} data - Row data to upsert (must include primary key).
   * @return {Promise<Object>} Upsert result.
   */
  async upsertSystemTableRow(tableName, data, options = {}) {
    return upsertSystemTableRow(this, tableName, data, options);
  }


  /**
   * Get the primary key field name for a system table.
   * @param {string} tableName - System table name.
   * @return {string} Primary key field name.
   * @private
   */
  getPrimaryKeyField(tableName) {
    return getSystemCachePrimaryKeyFieldOrFallback(
      tableName,
      CDC_PRIMARY_KEY.FALLBACK,
    );
  }

  /**
   * Get service statistics.
   * @return {Object} Service statistics.
   */
  getStats() {
    return {
      ...this.stats,
      total: this.stats.inserts + this.stats.updates + this.stats.deletes,
    };
  }

  /**
   * Reset statistics.
   */
  resetStats() {
    this.stats = {
      ...CDC_STATS_DEFAULT,
    };
  }

  /**
   * Check if service is initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }
}

/**
 * Mix the mutation-operation and helper-delegator methods onto the target
 * class prototype.
 * @param {Function} targetClass
 */
function applyCDCIntegrationServiceMutationOperations(targetClass) {
  const sourcePrototype = CDCIntegrationServiceMutationOperations.prototype;
  for (const methodName of Object.getOwnPropertyNames(sourcePrototype)) {
    if (methodName === CDC_INTEGRATION_SERVICE_MUTATION_OPERATIONS_CONSTRUCTOR) {
      continue;
    }
    const descriptor = Object.getOwnPropertyDescriptor(
      sourcePrototype,
      methodName,
    );
    Object.defineProperty(targetClass.prototype, methodName, descriptor);
  }
}

export {applyCDCIntegrationServiceMutationOperations};
