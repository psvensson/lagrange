import { CDC_INTEGRATION_SERVICE_SHARED } from "./cdc-integration-service-shared.js";
import { CDCIntegrationServiceSegment2 } from "./cdc-integration-service-segment-2.js";

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

class CDCIntegrationServiceSegment3 extends CDCIntegrationServiceSegment2 {
  pruneAuthoritativeFallbackHistory(nowMs) {
    const threshold = nowMs - this.authoritativeFallbackWindowMs;
    this.authoritativeFallbackHistory =
      this.authoritativeFallbackHistory.filter(
        (entry) => entry.recordedAt >= threshold,
      );
  }

  /**
   * Record one authoritative fallback signal for diagnostics and strict gating.
   * @param {Object} options
   * @return {Object}
   * @private
   */
  recordAuthoritativeFallbackSignal(options = {}) {
    const nowMs = Date.now();
    const tableName = String(options.tableName || "");
    const rowKey = String(options.key || "");
    const phase = this.resolveAuthoritativeFallbackPhase(options.phase);
    const outcome = normalizeAuthoritativeFallbackOutcome(options.outcome);
    const identity = `${tableName}:${rowKey}:${phase}:${outcome}`;
    const totalEntry = this.authoritativeFallbackTotals.get(identity) || {
      tableName,
      rowKey,
      phase,
      outcome,
      totalCount: NUM.ZERO,
      lastRecordedAt: NUM.ZERO,
    };
    totalEntry.totalCount += NUM.ONE;
    totalEntry.lastRecordedAt = nowMs;
    this.authoritativeFallbackTotals.set(identity, totalEntry);
    this.authoritativeFallbackHistory.push({
      tableName,
      rowKey,
      nodeId: this.nodeId,
      expectPresent: options.expectPresent === true,
      phase,
      outcome,
      recordedAt: nowMs,
    });
    this.pruneAuthoritativeFallbackHistory(nowMs);
    let windowCount = NUM.ZERO;
    for (const entry of this.authoritativeFallbackHistory) {
      if (
        entry.tableName === tableName &&
        entry.rowKey === rowKey &&
        entry.phase === phase &&
        entry.outcome === outcome
      ) {
        windowCount += NUM.ONE;
      }
    }
    return {
      tableName,
      rowKey,
      nodeId: this.nodeId,
      expectPresent: options.expectPresent === true,
      phase,
      outcome,
      windowCount,
      windowRatePerMinute:
        (windowCount / this.authoritativeFallbackWindowMs) *
        CDC_INTEGRATION_SERVICE_LITERAL.VALUE_60 *
        CDC_INTEGRATION_SERVICE_LITERAL.VALUE_1000,
      recordedAt: nowMs,
    };
  }

  /**
   * Summarize authoritative fallback diagnostics for local runtime export.
   * @return {Object}
   */
  getAuthoritativeFallbackDiagnostics() {
    const nowMs = Date.now();
    this.pruneAuthoritativeFallbackHistory(nowMs);
    const phases = {
      [AUTHORITATIVE_FALLBACK_PHASE.BOOTSTRAP]: {
        windowCount: NUM.ZERO,
        totalCount: NUM.ZERO,
      },
      [AUTHORITATIVE_FALLBACK_PHASE.RECOVERY]: {
        windowCount: NUM.ZERO,
        totalCount: NUM.ZERO,
      },
      [AUTHORITATIVE_FALLBACK_PHASE.STEADY_STATE]: {
        windowCount: NUM.ZERO,
        totalCount: NUM.ZERO,
      },
    };
    const outcomes = {
      [AUTHORITATIVE_FALLBACK_OUTCOME.RECOVERED]: {
        windowCount: NUM.ZERO,
        totalCount: NUM.ZERO,
      },
      [AUTHORITATIVE_FALLBACK_OUTCOME.DIAGNOSED]: {
        windowCount: NUM.ZERO,
        totalCount: NUM.ZERO,
      },
      [AUTHORITATIVE_FALLBACK_OUTCOME.FAILED]: {
        windowCount: NUM.ZERO,
        totalCount: NUM.ZERO,
      },
    };
    const byTable = {};
    let totalCount = NUM.ZERO;
    for (const totalEntry of this.authoritativeFallbackTotals.values()) {
      totalCount += totalEntry.totalCount;
      phases[totalEntry.phase].totalCount += totalEntry.totalCount;
      outcomes[totalEntry.outcome].totalCount += totalEntry.totalCount;
      const tableEntry = byTable[totalEntry.tableName] || {
        totalCount: NUM.ZERO,
        windowCount: NUM.ZERO,
        lastRecordedAt: NUM.ZERO,
      };
      tableEntry.totalCount += totalEntry.totalCount;
      tableEntry.lastRecordedAt = Math.max(
        tableEntry.lastRecordedAt,
        totalEntry.lastRecordedAt,
      );
      byTable[totalEntry.tableName] = tableEntry;
    }
    for (const entry of this.authoritativeFallbackHistory) {
      phases[entry.phase].windowCount += NUM.ONE;
      outcomes[entry.outcome].windowCount += NUM.ONE;
      const tableEntry = byTable[entry.tableName] || {
        totalCount: NUM.ZERO,
        windowCount: NUM.ZERO,
        lastRecordedAt: NUM.ZERO,
      };
      tableEntry.windowCount += NUM.ONE;
      tableEntry.lastRecordedAt = Math.max(
        tableEntry.lastRecordedAt,
        entry.recordedAt,
      );
      byTable[entry.tableName] = tableEntry;
    }
    const recentEvents = this.authoritativeFallbackHistory
      .slice(-AUTHORITATIVE_FALLBACK_RECENT_LIMIT)
      .map((entry) => ({
        ...entry,
      }));
    return {
      schemaVersion: NUM.ONE,
      nodeId: this.nodeId,
      windowMs: this.authoritativeFallbackWindowMs,
      totalCount,
      windowCount: this.authoritativeFallbackHistory.length,
      windowRatePerMinute:
        (this.authoritativeFallbackHistory.length /
          this.authoritativeFallbackWindowMs) *
        CDC_INTEGRATION_SERVICE_LITERAL.VALUE_60 *
        CDC_INTEGRATION_SERVICE_LITERAL.VALUE_1000,
      phases,
      outcomes,
      byTable,
      recentEvents,
    };
  }

  /**
   * Determine whether one cached row matches the expected post-write fields.
   * @param {Object|undefined} record
   * @param {Object|null} expectedFields
   * @return {boolean}
   * @private
   */
  doesCacheRecordMatchExpectedFields(record, expectedFields) {
    if (!expectedFields) {
      return Boolean(record);
    }
    if (!record || typeof record !== TYPEOF.OBJECT) {
      return false;
    }
    for (const [fieldName, expectedValue] of Object.entries(expectedFields)) {
      if (!this.areCacheFieldValuesEqual(record[fieldName], expectedValue)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Remove exact-match fields that are validated by minimum thresholds.
   * @param {Object|null} expectedFields
   * @param {Object|null} minimumFields
   * @return {Object|null}
   * @private
   */
  normalizeExpectedFieldsForMinimums(expectedFields, minimumFields) {
    if (!expectedFields) {
      return null;
    }
    if (!minimumFields) {
      return expectedFields;
    }
    const normalized = {};
    for (const [fieldName, expectedValue] of Object.entries(expectedFields)) {
      if (Object.prototype.hasOwnProperty.call(minimumFields, fieldName)) {
        continue;
      }
      normalized[fieldName] = expectedValue;
    }
    return Object.keys(normalized).length > NUM.ZERO ? normalized : null;
  }

  /**
   * Determine whether one cached row satisfies all minimum field thresholds.
   * @param {Object|undefined} record
   * @param {Object|null} minimumFields
   * @return {boolean}
   * @private
   */
  doesCacheRecordMeetMinimumFields(record, minimumFields) {
    if (!minimumFields) {
      return true;
    }
    if (!record || typeof record !== TYPEOF.OBJECT) {
      return false;
    }
    for (const [fieldName, minimumValue] of Object.entries(minimumFields)) {
      if (!this.isCacheFieldValueAtLeast(record[fieldName], minimumValue)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check whether one cached value is equal to or greater than a minimum.
   * @param {*} actualValue
   * @param {*} minimumValue
   * @return {boolean}
   * @private
   */
  isCacheFieldValueAtLeast(actualValue, minimumValue) {
    if (this.areCacheFieldValuesEqual(actualValue, minimumValue)) {
      return true;
    }
    const actualComparable =
      this.normalizeComparableCacheFieldValue(actualValue);
    const minimumComparable =
      this.normalizeComparableCacheFieldValue(minimumValue);
    if (actualComparable === null || minimumComparable === null) {
      return false;
    }
    return actualComparable >= minimumComparable;
  }

  /**
   * Normalize one cache field into a comparable numeric value when possible.
   * @param {*} value
   * @return {number|null}
   * @private
   */
  normalizeComparableCacheFieldValue(value) {
    if (typeof value === TYPEOF.NUMBER) {
      return Number.isFinite(value) ? value : null;
    }
    if (typeof value === TYPEOF.BIGINT) {
      const normalized = Number(value);
      return Number.isFinite(normalized) ? normalized : null;
    }
    if (value instanceof Date) {
      const timestamp = value.getTime();
      return Number.isFinite(timestamp) ? timestamp : null;
    }
    if (typeof value === TYPEOF.STRING) {
      if (value.length === NUM.ZERO) {
        return null;
      }
      const asNumber = Number(value);
      if (Number.isFinite(asNumber)) {
        return asNumber;
      }
      const asDate = Date.parse(value);
      return Number.isFinite(asDate) ? asDate : null;
    }
    return null;
  }

  /**
   * Compare one cached field against an expected post-write value.
   * @param {*} actualValue
   * @param {*} expectedValue
   * @return {boolean}
   * @private
   */
  areCacheFieldValuesEqual(actualValue, expectedValue) {
    if (actualValue === expectedValue) {
      return true;
    }
    if (
      (actualValue === null || typeof actualValue !== TYPEOF.OBJECT) &&
      (expectedValue === null || typeof expectedValue !== TYPEOF.OBJECT)
    ) {
      return false;
    }
    try {
      return JSON.stringify(actualValue) === JSON.stringify(expectedValue);
    } catch (_parseErr) {
      return false;
    }
  }

  /**
   * @param {string} primaryKeyField
   * @param {Object|null} expectedFields
   * @param {Object|null} minimumFields
   * @return {Array<string>}
   * @private
   */
  buildCacheVisibilityDivergentFields(
    primaryKeyField,
    expectedFields,
    minimumFields,
  ) {
    return Array.from(
      new Set([
        primaryKeyField,
        ...Object.keys(expectedFields || {}),
        ...Object.keys(minimumFields || {}),
      ]),
    );
  }

  /**
   * @param {string} tableName
   * @param {string} key
   * @param {string} divergenceType
   * @param {Object|null} cacheValue
   * @param {Object|null} authoritativeValue
   * @param {Array<string>} divergentFields
   * @param {string} phase
   * @private
   */
  emitCacheVisibilityDivergence(
    tableName,
    key,
    divergenceType,
    cacheValue,
    authoritativeValue,
    divergentFields,
    phase,
  ) {
    const event = buildDivergenceEvent({
      divergenceType,
      tableName,
      ownerComponent: "CDCIntegrationService",
      reconciliationReason:
        SQL_RECONCILIATION_REASON.DIAGNOSTICS_CACHE_RECONCILE,
      rowKey: key,
      cacheValue,
      authoritativeValue,
      divergentFields,
    });
    this.logger.warn(
      CDC_INTEGRATION_SERVICE_LITERAL.DIAGNOSED_CACHE_VISIBILITY_GAP_FROM_AUTHORITATIVE_SYSTEM_TABLE_READ,
      {
        ...event,
        nodeId: this.nodeId,
        phase,
      },
    );
    this.emit(CDC_EVENT.READ_MODEL_DIVERGENCE, event);
  }

  /**
   * Build column list and value placeholders for INSERT.
   * @param {Object} data - Row data.
   * @return {Object} {columns, placeholders, values}
   * @private
   */
  buildInsertParts(data) {
    const columns = Object.keys(data);
    const placeholders = columns
      .map(() => CDC_SQL.PARAM_PLACEHOLDER)
      .join(CDC_SQL.COMMA_SPACE);
    const values = columns.map((col) => {
      const val = data[col];
      // Serialize objects/arrays to JSON
      if (val !== null && typeof val === TYPEOF.OBJECT) {
        return JSON.stringify(val);
      }
      return val;
    });
    return {
      columns: columns.join(CDC_SQL.COMMA_SPACE),
      placeholders,
      values,
    };
  }

  /**
   * Filter row data to known columns for the target system table.
   * @param {string} tableName - System table name.
   * @param {Object} data - Row data.
   * @return {Object} Filtered row data.
   * @private
   */
  filterDataForTable(tableName, data) {
    const schema = getSchemaByTableName(tableName);
    if (!schema || !schema.columns) {
      throw new Error(`${CDC_ERROR_MSG.SCHEMA_MISSING_PREFIX}${tableName}`);
    }
    const allowed = new Set(schema.columns.map((column) => column.name));
    const filtered = {};
    for (const [key, value] of Object.entries(data)) {
      if (allowed.has(key)) {
        filtered[key] = value;
      }
    }
    return filtered;
  }

  /**
   * Normalize INSERT/UPSERT row data using schema defaults and table-specific defaults.
   * @param {string} tableName - System table name.
   * @param {Object} data - Input row data.
   * @return {Object} Normalized row data.
   * @private
   */
  prepareInsertData(tableName, data, options = {}) {
    const schema = getSchemaByTableName(tableName);
    if (!schema || !schema.columns) {
      throw new Error(`${CDC_ERROR_MSG.SCHEMA_MISSING_PREFIX}${tableName}`);
    }
    const canonicalData = canonicalizeSystemTableRow(tableName, data);
    const rowData = this.filterDataForTable(tableName, {
      ...canonicalData,
    });
    if (Object.keys(rowData).length === NUM.ZERO) {
      throw new Error(
        `${CDC_ERROR_MSG.INSERT_VALID_COLUMNS_PREFIX}${tableName}`,
      );
    }
    const { generatePrimaryKey = true } = options;
    const idField = this.getPrimaryKeyField(tableName);
    if (!rowData[idField] && generatePrimaryKey) {
      rowData[idField] = uuidv4();
    }
    this.applySchemaDefaults(schema, rowData);
    this.applyTableInsertDefaults(tableName, schema, rowData);
    this.applyTimestampDefaults(schema, rowData);
    return rowData;
  }

  /**
   * Apply schema-defined defaults to missing fields.
   * @param {Object} schema - Table schema.
   * @param {Object} rowData - Row data to mutate.
   * @private
   */
  applySchemaDefaults(schema, rowData) {
    for (const column of schema.columns) {
      if (rowData[column.name] !== undefined) {
        continue;
      }
      if (column.defaultValue === undefined) {
        continue;
      }
      const normalizedDefault = this.normalizeDefaultValue(column.defaultValue);
      if (
        normalizedDefault.state ===
        CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_UNDEFINED
      ) {
        continue;
      }
      rowData[column.name] =
        materializeNormalizedDefaultValue(normalizedDefault);
    }
  }

  /**
   * Apply generic timestamp defaults for inserts when columns exist.
   * @param {Object} schema - Table schema.
   * @param {Object} rowData - Row data to mutate.
   * @private
   */
  applyTimestampDefaults(schema, rowData) {
    const now = Date.now();
    const columnNames = new Set(schema.columns.map((col) => col.name));
    if (
      columnNames.has(COLUMN.CREATED_AT) &&
      rowData[COLUMN.CREATED_AT] == null
    ) {
      rowData[COLUMN.CREATED_AT] = now;
    }
    if (
      columnNames.has(COLUMN.UPDATED_AT) &&
      rowData[COLUMN.UPDATED_AT] == null
    ) {
      rowData[COLUMN.UPDATED_AT] = now;
    }
  }

  /**
   * Apply table-specific defaults for inserts.
   * @param {string} tableName - System table name.
   * @param {Object} schema - Table schema.
   * @param {Object} rowData - Row data to mutate.
   * @private
   */
  applyTableInsertDefaults(tableName, _schema, rowData) {
    const now = Date.now();
    if (tableName !== SYSTEM_TABLE_NAME.NODES) {
      return;
    }
    if (!rowData[COLUMN.NODE_ADDRESS]) {
      rowData[COLUMN.NODE_ADDRESS] = CDC_INTEGRATION_SERVICE_LITERAL.UNKNOWN;
    }
    if (rowData.cpu_cores == null) {
      rowData.cpu_cores = NUM.ZERO;
    }
    if (rowData.memory_mb == null) {
      rowData.memory_mb = NUM.ZERO;
    }
    if (rowData.disk_gb == null) {
      rowData.disk_gb = NUM.ZERO;
    }
    if (rowData.cpu_usage_percent == null) {
      rowData.cpu_usage_percent = NUM.ZERO;
    }
    if (rowData.memory_usage_percent == null) {
      rowData.memory_usage_percent = NUM.ZERO;
    }
    if (rowData.disk_usage_percent == null) {
      rowData.disk_usage_percent = NUM.ZERO;
    }
    if (!rowData.status) {
      rowData.status = SERVICE_STATUS.ACTIVE;
    }
    if (!rowData.connection_state) {
      rowData.connection_state = STATE.DISCONNECTED;
    }
    if (rowData.capabilities == null) {
      rowData.capabilities = CDC_INTEGRATION_SERVICE_LITERAL.EMPTY_3;
    }
    if (rowData.last_heartbeat == null) {
      rowData.last_heartbeat = now;
    }
  }

  /**
   * Normalize schema default values (strip quotes, parse numbers).
   * @param {string|number|null} value - Default value.
   * @return {Object} Explicit default-value normalization result.
   * @private
   */
  normalizeDefaultValue(value) {
    if (value === undefined || value === null) {
      return Object.freeze({
        state:
          value === undefined
            ? CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_UNDEFINED
            : CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_NULL,
      });
    }
    if (typeof value !== TYPEOF.STRING) {
      return Object.freeze({
        state: CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_VALUE,
        value,
      });
    }
    const trimmed = value.trim();
    if (
      (trimmed.startsWith(CDC_INTEGRATION_SERVICE_LITERAL.EMPTY_4) &&
        trimmed.endsWith(CDC_INTEGRATION_SERVICE_LITERAL.EMPTY_4)) ||
      (trimmed.startsWith(CDC_INTEGRATION_SERVICE_LITERAL.EMPTY_5) &&
        trimmed.endsWith(CDC_INTEGRATION_SERVICE_LITERAL.EMPTY_5))
    ) {
      return Object.freeze({
        state: CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_VALUE,
        value: trimmed.slice(NUM.ONE, -NUM.ONE),
      });
    }
    if (trimmed.toLowerCase() === CDC_INTEGRATION_SERVICE_LITERAL.NULL) {
      return Object.freeze({
        state: CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_NULL,
      });
    }
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return Object.freeze({
        state: CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_VALUE,
        value: Number(trimmed),
      });
    }
    return Object.freeze({
      state: CDC_INTEGRATION_SERVICE_LITERAL.DEFAULT_VALUE_STATE_VALUE,
      value: trimmed,
    });
  }

  /**
   * Emit CDC error event only when listeners are registered.
   * @param {Object} payload - CDC error payload.
   * @private
   */
  emitErrorEvent(payload) {
    if (this.listenerCount(CDC_EVENT.ERROR) > NUM.ZERO) {
      this.emit(CDC_EVENT.ERROR, payload);
    }
  }

  /**
   * Build SET clause for UPDATE.
   * @param {Object} data - Data to update.
   * @return {Object} {setClause, values}
   * @private
   */
  buildUpdateParts(data) {
    const columns = Object.keys(data);
    const setClause = columns
      .map((col) => `${col}${CDC_SQL.ASSIGNMENT_PLACEHOLDER}`)
      .join(CDC_SQL.COMMA_SPACE);
    const values = columns.map((col) => {
      const val = data[col];
      if (val !== null && typeof val === TYPEOF.OBJECT) {
        return JSON.stringify(val);
      }
      return val;
    });
    return {
      setClause,
      values,
    };
  }

  /**
   * Build WHERE clause from conditions.
   * @param {Object} whereClause - WHERE conditions.
   * @return {Object} {whereStr, values}
   * @private
   */
  buildWhereParts(whereClause) {
    const conditions = Object.keys(whereClause);
    const whereStr = conditions
      .map((col) => `${col}${CDC_SQL.ASSIGNMENT_PLACEHOLDER}`)
      .join(CDC_SQL.WHERE_AND);
    const values = conditions.map((col) => whereClause[col]);
    return {
      whereStr,
      values,
    };
  }

  /**
   * Build one canonical single-flight key for an in-flight system-table
   * mutation so identical callers collapse into one routed write.
   * @param {string} operation
   * @param {string} tableName
   * @param {string|null} identity
   * @param {Object} payload
   * @param {Object} [options={}]
   * @return {string|null}
   * @private
   */
  buildMutationSingleFlightKey(
    operation,
    tableName,
    identity,
    payload,
    options = {},
  ) {
    if (options?.allowCoalescing === false) {
      return null;
    }
    if (
      typeof options?.coalescingKey === TYPEOF.STRING &&
      options.coalescingKey.length > NUM.ZERO
    ) {
      return `${operation}:${tableName}:${options.coalescingKey}`;
    }
    return stableSerializeMutationKey({
      operation,
      tableName,
      identity: identity || null,
      payload,
      ignoreExisting: options?.ignoreExisting === true,
    });
  }

  /**
   * Reuse one in-flight mutation promise when callers submit the same
   * canonical write intent concurrently.
   * @param {string|null} singleFlightKey
   * @param {Function} executionFactory
   * @return {Promise<Object>}
   * @private
   */
  runCoalescedMutation(singleFlightKey, executionFactory) {
    if (!singleFlightKey) {
      return executionFactory();
    }
    const existingMutation = this.inFlightMutationsByKey.get(singleFlightKey);
    if (existingMutation) {
      return existingMutation;
    }
    let inFlightMutation = null;
    inFlightMutation = Promise.resolve()
      .then(() => executionFactory())
      .finally(() => {
        if (
          this.inFlightMutationsByKey.get(singleFlightKey) === inFlightMutation
        ) {
          this.inFlightMutationsByKey.delete(singleFlightKey);
        }
      });
    this.inFlightMutationsByKey.set(singleFlightKey, inFlightMutation);
    return inFlightMutation;
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
        const { columns, placeholders, values } =
          this.buildInsertParts(rowData);
        const sql =
          `${options?.ignoreExisting === true ? SQL.INSERT_OR_IGNORE_INTO : SQL.INSERT_INTO} ${tableName} (${columns}) ` +
          `${SQL.VALUES} (${placeholders})`;
        const sqlStartMs = Date.now();
        const result = await this.executeSQL(sql, values, {
          queryTimeoutMs: options?.queryTimeoutMs,
          cancellationToken: options?.cancellationToken || null,
          routingReadinessDimension: options?.routingReadinessDimension,
          workClass: options?.workClass,
          allowPressureDefer: options?.allowPressureDefer,
          pressureRetryAfterMs: options?.pressureRetryAfterMs,
          deliveryPriority: options?.deliveryPriority,
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
                typeof options?.causeId === TYPEOF.STRING
                  ? options.causeId
                  : null,
              operation: CDC_OPERATION.INSERT,
              primaryKey: trackingId
                ? {
                    [idField]: trackingId,
                  }
                : null,
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
        const { setClause, values: setValues } =
          this.buildUpdateParts(updateData);
        const { whereStr, values: whereValues } =
          this.buildWhereParts(whereClause);
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
            workClass: options?.workClass,
            allowPressureDefer: options?.allowPressureDefer,
            pressureRetryAfterMs: options?.pressureRetryAfterMs,
            deliveryPriority: options?.deliveryPriority,
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
            typeof options.expectedCacheFields === TYPEOF.OBJECT
              ? options.expectedCacheFields
              : null;
          const minimumCacheFields =
            options?.minimumCacheFields &&
            typeof options.minimumCacheFields === TYPEOF.OBJECT
              ? options.minimumCacheFields
              : null;
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
                typeof options?.causeId === TYPEOF.STRING
                  ? options.causeId
                  : null,
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
}

export { CDCIntegrationServiceSegment3 };
