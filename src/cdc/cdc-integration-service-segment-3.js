import {CDC_INTEGRATION_SERVICE_SHARED} from './cdc-integration-service-shared.js';
import {CDCIntegrationServiceSegment2} from './cdc-integration-service-segment-2.js';
import {buildSystemTableMutationSqlParts} from './cdc-system-table-mutation-sql-helpers.js';

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

// Import node join mesh helper
import {
  handleNodeJoinedCDC,
  deriveWsAddressFromNodeAddress,
} from './cdc-integration-service-node-join.js';


const {
  ADDRESS,
  AUTHORITATIVE_FALLBACK_OUTCOME,
  AUTHORITATIVE_FALLBACK_PHASE,
  AUTHORITATIVE_FALLBACK_RECENT_LIMIT,
  CDCOperationType,
  CDC_ERROR_MSG,
  CDC_EVENT,
  CDC_INTEGRATION_SERVICE_ERROR,
  CDC_INTEGRATION_SERVICE_LITERAL,
  CDC_LOG_MSG,
  CDC_OPERATION,
  CDC_OPERATION_LABEL,
  CDC_PRIMARY_KEY,
  CDC_SKIP_REASON,
  CDC_SOURCE,
  CDC_STATS_DEFAULT,
  COLUMN,
  ENTRYPOINT_DEFAULT,
  EPOCH_CONFIG_KEY,
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
  METRICS_LOG_TAG,
  NODE_WEBSOCKET_ADDRESS_RESOLUTION_STATE,
  NUM,
  PROTOCOL,
  SERVICE_STATUS,
  SQL,
  SQL_RECONCILIATION_REASON,
  STATE,
  SYSTEM_TABLE_NAME,
  TYPEOF,
  VALID_SYSTEM_TABLES,
  buildCDCNodeJoinedResult,
  buildDivergenceEvent,
  buildSystemTableMutationError,
  buildSystemTableVisibilityResult,
  canonicalizeSystemTableRow,
  getSchemaByTableName,
  getSystemCachePrimaryKeyFieldOrFallback,
  logSystemTableWriteFailure,
  materializeNormalizedDefaultValue,
  normalizeAuthoritativeFallbackOutcome,
  normalizeSystemTableVisibilityResult,
  resolveNodeWebSocketAddress,
  shouldEmitTableWriteMetric,
  shouldLogTableWriteFailure,
  stableSerializeMutationKey,
  uuidv4,
} = CDC_INTEGRATION_SERVICE_SHARED;

class CDCIntegrationServiceSegment3 extends CDCIntegrationServiceSegment2 {
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
                typeof options?.causeId === TYPEOF.STRING ?
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
    if (Object.keys(updateData).length === NUM.ZERO) {
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
          (typeof result.affectedRows !== TYPEOF.NUMBER ||
            result.affectedRows > NUM.ZERO)
        ) {
          const expectedCacheFields =
            options?.expectedCacheFields &&
            typeof options.expectedCacheFields === TYPEOF.OBJECT ?
              options.expectedCacheFields :
              null;
          const minimumCacheFields =
            options?.minimumCacheFields &&
            typeof options.minimumCacheFields === TYPEOF.OBJECT ?
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
                typeof options?.causeId === TYPEOF.STRING ?
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

  /**
   * Set the epoch manager reference for CDC epoch change handling.
   * @param {AssignmentEpochManager} epochManager - The epoch manager instance.
   */
  setEpochManager(epochManager) {
    if (!epochManager) {
      throw new Error(CDC_ERROR_MSG.EPOCH_MANAGER_REQUIRED);
    }
    this.epochManager = epochManager;
    this.logger.debug(CDC_LOG_MSG.EPOCH_MANAGER_SET, {
      nodeId: this.nodeId,
    });
  }

  /**
   * Handle epoch change CDC event.
   * Listens for epoch changes in the config table and updates the local
   * AssignmentEpochManager.
   *
   * @param {Object} cdcEvent - The CDC event object.
   * @param {string} cdcEvent.tableName - The table name (should be config).
   * @param {string} cdcEvent.operation - The operation type (INSERT, UPDATE).
   * @param {Object} cdcEvent.data - The event data.
   * @param {string} cdcEvent.data.config_key - The config key.
   * @param {string} cdcEvent.data.config_value - The config value (epoch JSON).
   * @return {{applied: boolean, epoch?: number, error?: string}}
   *   Result object indicating if epoch was applied.
   */
  handleEpochChangeCDC(cdcEvent) {
    return this.ensureEventHandler().handleEpochChangeCDC(cdcEvent);
  }

  /**
   * Set the rebalancer reference for node state change handling.
   * @param {Object} rebalancer - The rebalancer instance (must have onNodeStateChange method).
   */
  setRebalancer(rebalancer) {
    if (!rebalancer) {
      throw new Error(CDC_ERROR_MSG.REBALANCER_REQUIRED);
    }
    this.rebalancer = rebalancer;
    this.logger.debug(CDC_LOG_MSG.REBALANCER_SET, {
      nodeId: this.nodeId,
    });
  }

  /**
   * Handle node state change CDC event.
   * Listens for node state changes in the nodes table and triggers
   * the rebalancer when appropriate.
   *
   * @param {Object} cdcEvent - The CDC event object.
   * @param {string} cdcEvent.tableName - The table name (should be nodes).
   * @param {string} cdcEvent.operation - The operation type (INSERT, UPDATE).
   * @param {Object} cdcEvent.data - The event data.
   * @param {string} cdcEvent.data.node_id - The node ID.
   * @param {string} cdcEvent.data.status - The node status/state.
   * @return {{processed: boolean, nodeId?: string, oldState?: string,
   *   newState?: string, error?: string}}
   *   Result object indicating if the event was processed.
   */
  handleNodeStateCDC(cdcEvent) {
    return this.ensureEventHandler().handleNodeStateCDC(cdcEvent);
  }

  /**
   * Set the message router reference for mesh connectivity.
   * When set, the CDC service will establish connections to new nodes
   * when they are added to the nodes table via CDC events.
   * @param {Object} messageRouter - The message router instance.
   */
  setMessageRouter(messageRouter) {
    if (!messageRouter) {
      throw new Error(CDC_ERROR_MSG.MESSAGE_ROUTER_REQUIRED);
    }
    this.messageRouter = messageRouter;
    this.logger.debug(CDC_LOG_MSG.MESSAGE_ROUTER_SET, {
      nodeId: this.nodeId,
    });
  }

  /**
   * Handle node joined CDC event for mesh connectivity.
   * When a new node is added to the nodes table, this method establishes
   * an outbound WebSocket connection to that node, ensuring full mesh
   * connectivity across the cluster.
   *
   * All nodes are equal peers - no special treatment for any node.
   *
   * @param {Object} cdcEvent - The CDC event object.
   * @param {string} cdcEvent.tableName - The table name (should be nodes).
   * @param {string} cdcEvent.operation - The operation type (INSERT).
   * @param {Object} cdcEvent.data - The event data.
   * @param {string} cdcEvent.data.node_id - The node ID.
   * @param {string} cdcEvent.data.node_address - The node address.
   * @return {Promise<{processed: boolean, nodeId?: string, connected?: boolean,
   *   error?: string}>} Result object indicating if connection was established.
   */
  async handleNodeJoinedCDC(cdcEvent) {
    return handleNodeJoinedCDC(this, cdcEvent);
  }

  /**
   * Derive WebSocket address from node REST address.
   * @param {string} nodeAddress - Node address in format "hostname:port".
   * @return {string|null} WebSocket address or null if cannot derive.
   * @private
   */
  deriveWsAddressFromNodeAddress(nodeAddress) {
    return deriveWsAddressFromNodeAddress(nodeAddress);
  }

}

export {
  CDCIntegrationServiceSegment3,
  CDCIntegrationServiceSegment3 as CDCIntegrationService,
  CDCOperationType,
  EPOCH_CONFIG_KEY,
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
  VALID_SYSTEM_TABLES,
};
