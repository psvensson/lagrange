/**
 * Partition CDC Generator - Generates CDC events for partition write operations.
 * Extracted from partition-service.js for single responsibility.
 * Requirements: 6.2, 6.4, 6.6
 */

import {CDC_OPERATION, COLUMN, SQL} from '../constants/index.js';
import {
  hasSystemCacheKeyDescriptor,
  resolveSystemCacheRowKey,
} from '../cache/system-cache-key-descriptor.js';
import {
  extractDeleteDataFromSQL as extractDeleteDataFromSQLImpl,
  extractInsertDataFromSQL as extractInsertDataFromSQLImpl,
  extractInsertRowsFromSQL as extractInsertRowsFromSQLImpl,
  hasSqlParameterPlaceholders,
  parseValue as parseValueImpl,
  parseValuesFromSQL as parseValuesFromSQLImpl,
  extractUpdateDataFromSQL as extractUpdateDataFromSQLImpl,
} from './partition-sql-parser.js';
import {
  extractParamDeleteData as extractParamDeleteDataImpl,
  extractParamInsertData as extractParamInsertDataImpl,
  extractParamUpdateData as extractParamUpdateDataImpl,
  fetchInsertRow as fetchInsertRowImpl,
  fetchUpdatedRow as fetchUpdatedRowImpl,
} from './partition-cdc-parameterized-sql.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_OPERATION,
  PARTITION_SERVICE_TYPE,
  PARTITION_SERVICE_VALUE,
} from './partition-service-constants.js';

/**
 * CDC operation types.
 */
const CDCOperation = CDC_OPERATION;

const PARTITION_CDC_EVENT_BUILD_STATE = Object.freeze({
  BUILT: 'built',
  SKIPPED: 'skipped',
});

const PARTITION_CDC_EVENT_SKIP_REASON = Object.freeze({
  NO_OP_WRITE: 'no_op_write',
  UNSUPPORTED_OPERATION: 'unsupported_operation',
  INCOMPLETE_ROW_PAYLOAD: 'incomplete_row_payload',
});

const PARTITION_CDC_GENERATOR_LITERAL = Object.freeze({
  SUPPRESSING_CDC_EVENT_FOR_NO_OP_WRITE: 'Suppressing CDC event for no-op write',
  REFUSING_INCOMPLETE_ROW_PAYLOAD:
    'Refusing to build CDC event with incomplete row payload',
  OBJECT_TYPE: 'object',
});

function isPlainRecordObject(value) {
  if (!value || Array.isArray(value) ||
      typeof value !== PARTITION_CDC_GENERATOR_LITERAL.OBJECT_TYPE) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Validate that extracted CDC row data carries the table's primary key (when
 * the table has a system-cache key descriptor) or a non-HLC row column.
 * @param {string} tableName - Target table name.
 * @param {Object} data - Candidate CDC row payload.
 * @return {boolean}
 */
function hasValidPartitionCdcRowPayload(tableName, data) {
  if (!isPlainRecordObject(data)) return false;
  if (typeof tableName === 'string' && hasSystemCacheKeyDescriptor(tableName)) {
    return resolveSystemCacheRowKey(tableName, data) !== undefined;
  }
  return Object.keys(data).some(
    (key) => key !== COLUMN.UPDATED_AT_HLC && data[key] !== undefined && data[key] !== null,
  );
}

function stampOriginHlc(data, originHlc) {
  if (!data || typeof data !== 'object' ||
      originHlc === null || typeof originHlc === 'undefined') return data;
  return {...data, [COLUMN.UPDATED_AT_HLC]: String(originHlc)};
}

function isInsertOrUpsertOperation(entryType) {
  return entryType === PARTITION_SERVICE_OPERATION.INSERT ||
    entryType === PARTITION_SERVICE_OPERATION.UPSERT;
}

function hasPopulatedEntryData(entry) {
  return Boolean(entry?.data && Object.keys(entry.data).length > 0);
}

function canExtractQueryInsertRows(entry, entryType) {
  return entry?.type === PARTITION_SERVICE_OPERATION.QUERY &&
    typeof entry?.sql === 'string' &&
    !hasPopulatedEntryData(entry) &&
    isInsertOrUpsertOperation(entryType);
}

// Shared by normal committed capture and read-only correspondence. The row
// must already be supplied by its owner; this function never reads or writes.
function hydratePartitionCdcEvent(envelope, data, options = {}) {
  const event = {...envelope, data: stampOriginHlc(data, envelope.timestamp)};
  if (Number.isFinite(options.sequenceNumber)) event.sequenceNumber = options.sequenceNumber;
  return event;
}

/**
 * Generates CDC events for partition write operations.
 * @class
 */
class PartitionCDCGenerator {
  /**
   * Create a new CDC generator instance.
   * @param {Object} options - Configuration options.
   */
  constructor(options = {}) {
    this.partitionId = options.partitionId;
    this.replicaId = options.replicaId;
    this.tableName = options.tableName;
    this.db = options.db;
    this.logger = options.logger || console;
    this.eventEmitter = options.eventEmitter;
    this.cdcSubscribers = new Set();
  }

  /**
   * Get the number of CDC subscribers.
   * @return {number} Subscriber count.
   */
  getSubscriberCount() {
    return this.cdcSubscribers.size;
  }

  /**
   * Subscribe to CDC events from this partition.
   * @param {Function|Object} subscriber - Subscriber function or object with handleCDCEvent.
   */
  subscribe(subscriber) {
    this.cdcSubscribers.add(subscriber);
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.CDC_SUBSCRIBER_ADDED, {
      partitionId: this.partitionId,
      subscriberCount: this.cdcSubscribers.size,
    });
  }

  /**
   * Unsubscribe from CDC events.
   * @param {Function|Object} subscriber - Subscriber to remove.
   */
  unsubscribe(subscriber) {
    this.cdcSubscribers.delete(subscriber);
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.CDC_SUBSCRIBER_REMOVED, {
      partitionId: this.partitionId,
      subscriberCount: this.cdcSubscribers.size,
    });
  }

  /**
   * Generate a CDC event for a write operation.
   * @param {Object} entry - Write entry.
   * @return {Promise<void>}
   */
  async generateEvent(entry) {
    this.logger.debug(PARTITION_SERVICE_LOG_MSG.GENERATE_CDC_EVENT_CALLED, {
      partitionId: this.partitionId,
      entryType: entry.type,
      sql: entry.sql ?
        entry.sql.substring(0, PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT) :
        null,
      subscriberCount: this.cdcSubscribers.size,
    });

    if (this.cdcSubscribers.size === 0) {
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.NO_CDC_SUBSCRIBERS, {
        partitionId: this.partitionId,
      });
      return;
    }

    const buildResult = this.buildEvents(entry);
    if (buildResult.state !== PARTITION_CDC_EVENT_BUILD_STATE.BUILT) {
      return;
    }

    for (const cdcEvent of buildResult.cdcEvents) {
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.GENERATED_CDC_EVENT, {
        partitionId: this.partitionId,
        operation: cdcEvent.operation,
        tableName: cdcEvent.tableName,
        dataKeys: Object.keys(cdcEvent.data),
        subscriberCount: this.cdcSubscribers.size,
      });

      await this.deliverEvent(cdcEvent);
    }
  }

  /**
   * Resolve one explicit event-envelope snapshot before hydrating row data.
   * This lets callers decide buffering policy without carrying a second local
   * CDC state machine.
   * @param {Object} entry - Write entry.
   * @param {Object} options - Envelope build options.
   * @param {boolean} options.suppressNoOpWrite - Skip zero-change mutations.
   * @param {string} [options.sourceReplica] - The replica the event names as
   *   its source instead of this one (the committed-entry CDC hook names the
   *   proposer, so every replica records the same obligation).
   * @return {Object} Explicit build outcome.
   */
  resolveEventEnvelope(entry, options = {}) {
    const operationInfo = this.determineOperation(entry);
    if (!operationInfo) {
      return Object.freeze({
        state: PARTITION_CDC_EVENT_BUILD_STATE.SKIPPED,
        reasonCode: PARTITION_CDC_EVENT_SKIP_REASON.UNSUPPORTED_OPERATION,
      });
    }

    const {operation, entryType} = operationInfo;
    if (options.suppressNoOpWrite === true &&
      this.shouldSuppressNoOpWrite(entry, entryType)) {
      this.logger.debug(
        PARTITION_CDC_GENERATOR_LITERAL.SUPPRESSING_CDC_EVENT_FOR_NO_OP_WRITE,
        {
          partitionId: this.partitionId,
          entryType,
          changes: entry.changes,
        },
      );
      return Object.freeze({
        state: PARTITION_CDC_EVENT_BUILD_STATE.SKIPPED,
        reasonCode: PARTITION_CDC_EVENT_SKIP_REASON.NO_OP_WRITE,
        entryType,
      });
    }

    return Object.freeze({
      state: PARTITION_CDC_EVENT_BUILD_STATE.BUILT,
      entryType,
      cdcEventEnvelope: Object.freeze({
        tableName: this.extractTableName(entry),
        operation,
        timestamp: entry.timestamp,
        sourcePartition: this.partitionId,
        sourceReplica: options.sourceReplica ?? this.replicaId,
        ...(Number.isFinite(entry.logIndex) ? {logIndex: entry.logIndex} : {}),
        ...(Number.isFinite(entry.term) ? {term: entry.term} : {}),
      }),
    });
  }

  /**
   * Stamp the origin write HLC onto the CDC row data as `updated_at_hlc`.
   * @param {Object} data - Extracted CDC row data.
   * @param {string} originHlc - Origin write HLC (the entry's timestamp).
   * @return {Object} Data carrying the origin HLC stamp.
   * @private
   */
  stampOriginHlc(data, originHlc) {
    return stampOriginHlc(data, originHlc);
  }

  /**
   * Build one or more CDC events for a write entry with an explicit state/result contract.
   * @param {Object} entry - Write entry.
   * @param {Object} options - Event build options.
   * @return {Object} Explicit build outcome with cdcEvent and cdcEvents.
   */
  buildEvents(entry, options = {}) {
    const envelopeResult = this.resolveEventEnvelope(entry, options);
    if (envelopeResult.state !== PARTITION_CDC_EVENT_BUILD_STATE.BUILT) {
      return Object.freeze({...envelopeResult, cdcEvents: Object.freeze([])});
    }
    const candidateRows = this.extractCDCRows(
      entry, envelopeResult.entryType, envelopeResult.cdcEventEnvelope.tableName,
    );
    const cdcEvents = [];
    for (const row of candidateRows) {
      const cdcEvent = hydratePartitionCdcEvent(envelopeResult.cdcEventEnvelope, row, options);
      if (!hasValidPartitionCdcRowPayload(cdcEvent.tableName, cdcEvent.data)) {
        this.logger.error(PARTITION_CDC_GENERATOR_LITERAL.REFUSING_INCOMPLETE_ROW_PAYLOAD, {
          tableName: cdcEvent.tableName,
          operationType: cdcEvent.operation,
          extractedKeys: Object.keys(cdcEvent.data || {}),
        });
        return Object.freeze({
          state: PARTITION_CDC_EVENT_BUILD_STATE.SKIPPED,
          reasonCode: PARTITION_CDC_EVENT_SKIP_REASON.INCOMPLETE_ROW_PAYLOAD,
          entryType: envelopeResult.entryType,
          cdcEvents: Object.freeze([]),
        });
      }
      cdcEvents.push(cdcEvent);
    }
    const frozenEvents = Object.freeze(cdcEvents);
    return Object.freeze({...envelopeResult, cdcEvent: frozenEvents[0], cdcEvents: frozenEvents});
  }

  /**
   * Build a CDC event with an explicit state/result contract.
   * @param {Object} entry - Write entry.
   * @param {Object} options - Event build options.
   * @return {Object} Explicit build outcome.
   */
  buildEvent(entry, options = {}) {
    return this.buildEvents(entry, options);
  }

  /**
   * Determine the CDC operation type from an entry.
   * @param {Object} entry - Write entry.
   * @return {Object|null} Operation info or null if no CDC needed.
   * @private
   */
  determineOperation(entry) {
    let operation;
    let entryType = entry.type;

    // For raw SQL queries, determine operation type from SQL
    if (entryType === PARTITION_SERVICE_OPERATION.QUERY && entry.sql) {
      const sqlUpper = entry.sql.trim().toUpperCase();
      // Check for INSERT OR REPLACE first (before plain INSERT)
      // This is used by upsertSystemTableRow and should generate UPSERT CDC events
      if (sqlUpper.startsWith(SQL.INSERT_OR_REPLACE_INTO.toUpperCase())) {
        entryType = PARTITION_SERVICE_OPERATION.UPSERT;
      } else if (sqlUpper.startsWith(PARTITION_SERVICE_OPERATION.INSERT)) {
        entryType = PARTITION_SERVICE_OPERATION.INSERT;
      } else if (sqlUpper.startsWith(PARTITION_SERVICE_OPERATION.UPDATE)) {
        entryType = PARTITION_SERVICE_OPERATION.UPDATE;
      } else if (sqlUpper.startsWith(PARTITION_SERVICE_OPERATION.DELETE)) {
        entryType = PARTITION_SERVICE_OPERATION.DELETE;
      }
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.DETECTED_OPERATION_TYPE, {
        originalType: entry.type,
        detectedType: entryType,
      });
    }

    switch (entryType) {
    case PARTITION_SERVICE_OPERATION.INSERT:
      operation = CDCOperation.INSERT;
      break;
    case PARTITION_SERVICE_OPERATION.UPDATE:
      operation = CDCOperation.UPDATE;
      break;
    case PARTITION_SERVICE_OPERATION.UPSERT:
      operation = CDCOperation.UPSERT;
      break;
    case PARTITION_SERVICE_OPERATION.DELETE:
      operation = CDCOperation.DELETE;
      break;
    default:
      this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_UNKNOWN_OPERATION, {
        entryType,
        partitionId: this.partitionId,
      });
      return null; // No CDC for other operations
    }

    return {operation, entryType};
  }

  extractCDCRows(entry, entryType, resolvedTableName = null) {
    if (Array.isArray(entry?.affectedRows) && entry.affectedRows.length > 0) {
      return entry.affectedRows;
    }
    const tableName = resolvedTableName || this.extractTableName(entry);
    if (canExtractQueryInsertRows(entry, entryType)) {
      const rows = extractInsertRowsFromSQLImpl(
        entry.sql, entry.params, tableName, this.db, this.logger,
      );
      if (rows.length > 0) return rows;
    }
    return [this.extractCDCData(entry, entryType, tableName)];
  }

  /**
   * Extract CDC data from an entry.
   * @param {Object} entry - Write entry.
   * @param {string} entryType - Resolved entry type.
   * @return {Object} CDC data object.
   * @private
   */
  extractCDCData(entry, entryType, resolvedTableName = null) {
    const tableName = resolvedTableName || this.extractTableName(entry);
    const isUpdateOperation =
      entry.type === PARTITION_SERVICE_OPERATION.UPDATE ||
      entryType === PARTITION_SERVICE_OPERATION.UPDATE;

    // For UPDATE operations, merge whereClause (contains primary key) with data
    // This ensures CDC events always include the primary key field
    // For DELETE operations, use whereClause as the data (contains primary key)
    let cdcData = entry.data || {};
    if (isUpdateOperation && entry.whereClause) {
      cdcData = {...entry.whereClause, ...cdcData};
    } else if ((entry.type === PARTITION_SERVICE_OPERATION.DELETE ||
      entryType === PARTITION_SERVICE_OPERATION.DELETE) && entry.whereClause) {
      cdcData = {...entry.whereClause};
    }

    // For raw SQL queries, extract data from SQL
    if (entry.type === PARTITION_SERVICE_OPERATION.QUERY && entry.sql) {
      // For parameterized queries (SQL with ? placeholders), build data from params
      const hasParams = entry.params && entry.params.length > 0;
      const hasPlaceholders = hasSqlParameterPlaceholders(entry.sql);

      if (hasParams && hasPlaceholders && Object.keys(cdcData).length === 0) {
        cdcData = this.extractDataFromParameterizedSQL(
          entry.sql, entry.params, tableName, entryType,
        );
      }

      // For INSERT queries without params, parse literal values from SQL
      if (!hasPlaceholders && (entryType === PARTITION_SERVICE_OPERATION.INSERT ||
        entryType === PARTITION_SERVICE_OPERATION.UPSERT) &&
          Object.keys(cdcData).length === 0) {
        cdcData = this.extractInsertDataFromSQL(entry.sql, tableName);
      }

      // For UPDATE queries, try to extract the WHERE clause to query updated row
      if (entryType === PARTITION_SERVICE_OPERATION.UPDATE &&
        Object.keys(cdcData).length === 0) {
        cdcData = this.extractUpdateDataFromSQL(entry.sql, tableName);
      }

      // For DELETE queries, extract the WHERE clause
      if (entryType === PARTITION_SERVICE_OPERATION.DELETE &&
        Object.keys(cdcData).length === 0) {
        cdcData = this.extractDeleteDataFromSQL(entry.sql);
      }
    }

    if (isUpdateOperation && entry.whereClause) {
      const postUpdateWhere = {...entry.whereClause};
      if (entry.data && typeof entry.data === 'object') {
        for (const key of Object.keys(postUpdateWhere)) {
          if (Object.prototype.hasOwnProperty.call(entry.data, key)) {
            postUpdateWhere[key] = entry.data[key];
          }
        }
      }
      const authoritativeRow = this.fetchUpdatedRow(tableName, postUpdateWhere);
      if (authoritativeRow) {
        return authoritativeRow;
      }
    }

    return cdcData;
  }

  /**
   * Decide whether a write entry should be treated as a CDC no-op.
   * @param {Object} entry - Write entry.
   * @param {string} entryType - Resolved entry type.
   * @return {boolean} True when CDC should be suppressed.
   */
  shouldSuppressNoOpWrite(entry, entryType) {
    const hasChangeCount = typeof entry?.changes === 'number';
    if (!hasChangeCount) {
      return false;
    }
    if (entry.changes > 0) {
      return false;
    }
    return entryType === PARTITION_SERVICE_OPERATION.UPDATE ||
      entryType === PARTITION_SERVICE_OPERATION.DELETE ||
      entryType === PARTITION_SERVICE_OPERATION.UPSERT ||
      entryType === PARTITION_SERVICE_OPERATION.QUERY;
  }

  /**
   * Extract table name from an entry.
   * @param {Object} entry - Write entry.
   * @return {string} Table name.
   * @private
   */
  extractTableName(entry) {
    let tableName = entry.tableName || this.tableName;
    if (entry.type === PARTITION_SERVICE_OPERATION.QUERY && entry.sql) {
      const extractedName = this.extractTableNameFromSQL(entry.sql);
      if (extractedName.state ===
          PARTITION_SERVICE_VALUE.CDC_TABLE_NAME_EXTRACTION_STATE_FOUND) {
        tableName = extractedName.tableName;
      }
    }
    return tableName;
  }

  /**
   * Extract table name from SQL statement.
   * @param {string} sql - SQL statement.
   * @return {Object} Explicit table-name extraction result.
   * @private
   */
  extractTableNameFromSQL(sql) {
    const tableMatch = sql.match(
      /(?:UPDATE|INSERT\s+(?:OR\s+\w+\s+)?INTO|DELETE\s+FROM)\s+(\w+)/i,
    );
    if (tableMatch) {
      const tableName = tableMatch[1];
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.EXTRACTED_TABLE_NAME, {tableName});
      return Object.freeze({
        state: PARTITION_SERVICE_VALUE.CDC_TABLE_NAME_EXTRACTION_STATE_FOUND,
        tableName,
      });
    }
    return Object.freeze({
      state: PARTITION_SERVICE_VALUE.CDC_TABLE_NAME_EXTRACTION_STATE_NOT_FOUND,
    });
  }

  /**
   * Deliver CDC event to all subscribers.
   * @param {Object} cdcEvent - CDC event to deliver.
   * @return {Promise<void>}
   * @private
   */
  async deliverEvent(cdcEvent) {
    let deliveredCount = 0;
    for (const subscriber of this.cdcSubscribers) {
      try {
        if (typeof subscriber === PARTITION_SERVICE_TYPE.FUNCTION) {
          await subscriber(cdcEvent);
          deliveredCount++;
        } else if (subscriber.handleCDCEvent) {
          await subscriber.handleCDCEvent(cdcEvent);
          deliveredCount++;
        }
      } catch (error) {
        this.logger.error(PARTITION_SERVICE_ERROR_MSG.CDC_DELIVERY_FAILED, {
          partitionId: this.partitionId,
          error: error.message,
        });
        throw error;
      }
    }

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.CDC_DELIVERY_COMPLETE, {
      partitionId: this.partitionId,
      deliveredCount,
      subscriberCount: this.cdcSubscribers.size,
    });

    if (this.eventEmitter) {
      this.eventEmitter.emit(PARTITION_SERVICE_EVENT.CDC_EVENT, cdcEvent);
    }
  }

  /**
   * Extract data from INSERT SQL by querying the inserted row.
   * @param {string} sql - INSERT SQL statement.
   * @param {string} tableName - Table name.
  * @return {Object} Extracted data or empty object.
  * @private
  */
  extractInsertDataFromSQL(sql, tableName) {
    return extractInsertDataFromSQLImpl(
      sql,
      tableName,
      this.db,
      this.logger,
    );
  }

  /**
   * Extract data from UPDATE SQL by querying the updated row.
   * @param {string} sql - UPDATE SQL statement.
   * @param {string} tableName - Table name.
  * @return {Object} Extracted data or empty object.
  * @private
  */
  extractUpdateDataFromSQL(sql, tableName) {
    return extractUpdateDataFromSQLImpl(
      sql,
      tableName,
      this.db,
      this.logger,
    );
  }

  /**
   * Extract data from DELETE SQL.
   * @param {string} sql - DELETE SQL statement.
  * @return {Object} Extracted data or empty object.
  * @private
  */
  extractDeleteDataFromSQL(sql) {
    return extractDeleteDataFromSQLImpl(sql, this.logger, this.db);
  }

  /**
   * Parse values from SQL VALUES clause.
   * Preserved as a compatibility wrapper around the parser owner.
   * @param {string} valuesStr - Values string like "'val1', 123, NULL".
   * @return {Array} Parsed values.
   * @private
   */
  parseValuesFromSQL(valuesStr) {
    return parseValuesFromSQLImpl(valuesStr);
  }

  /**
   * Parse a single value from SQL.
   * Preserved as a compatibility wrapper around the parser owner.
   * @param {string} val - Value string.
   * @return {*} Parsed value.
   * @private
   */
  parseValue(val) {
    return parseValueImpl(val);
  }

  /**
   * Extract data from parameterized SQL (SQL with ? placeholders and params array).
   * @param {string} sql - SQL statement with ? placeholders.
   * @param {Array} params - Parameter values.
   * @param {string} tableName - Table name.
   * @param {string} operationType - INSERT, UPDATE, or DELETE.
   * @return {Object} Extracted data or empty object.
   * @private
   */
  extractDataFromParameterizedSQL(sql, params, tableName, operationType) {
    if (!params || params.length === 0) {
      return {};
    }

    if (operationType === PARTITION_SERVICE_OPERATION.INSERT ||
      operationType === PARTITION_SERVICE_OPERATION.UPSERT) {
      return this.extractParamInsertData(sql, params, tableName);
    }

    if (operationType === PARTITION_SERVICE_OPERATION.UPDATE) {
      return this.extractParamUpdateData(sql, params, tableName);
    }

    if (operationType === PARTITION_SERVICE_OPERATION.DELETE) {
      return this.extractParamDeleteData(sql, params, tableName);
    }

    return {};
  }

  /**
   * Extract data from parameterized INSERT SQL.
   * @param {string} sql - SQL statement.
   * @param {Array} params - Parameter values.
   * @param {string} tableName - Table name.
   * @return {Object} Extracted data.
   * @private
   */
  extractParamInsertData(sql, params, tableName) {
    return extractParamInsertDataImpl({
      sql,
      params,
      tableName,
      db: this.db,
      logger: this.logger,
      fetchInsertRow: (...args) => this.fetchInsertRow(...args),
    });
  }

  /**
   * Extract data from parameterized UPDATE SQL.
   * @param {string} sql - SQL statement.
   * @param {Array} params - Parameter values.
   * @param {string} tableName - Table name.
   * @return {Object} Extracted data.
   * @private
   */
  extractParamUpdateData(sql, params, tableName) {
    return extractParamUpdateDataImpl({
      sql,
      params,
      tableName,
      db: this.db,
      logger: this.logger,
      fetchUpdatedRow: (...args) => this.fetchUpdatedRow(...args),
    });
  }

  /**
   * Extract data from parameterized DELETE SQL.
   * @param {string} sql - SQL statement.
   * @param {Array} params - Parameter values.
   * @param {string} tableName - Table name.
   * @return {Object} Extracted data.
   * @private
   */
  extractParamDeleteData(sql, params, tableName) {
    return extractParamDeleteDataImpl({
      sql,
      params,
      tableName,
      db: this.db,
      logger: this.logger,
    });
  }

  /**
   * Fetch the stored row after an INSERT/UPSERT so CDC emits canonical data.
   * @param {string} tableName
   * @param {string|undefined} keyColumn
   * @param {*} keyValue
   * @param {Object} fallbackData
   * @return {Object}
   * @private
   */
  fetchInsertRow(tableName, keyColumn, keyValue, fallbackData) {
    return fetchInsertRowImpl({
      tableName,
      keyColumn,
      keyValue,
      fallbackData,
      db: this.db,
      logger: this.logger,
      partitionId: this.partitionId,
      replicaId: this.replicaId,
    });
  }

  /**
   * Fetch the stored row after an UPDATE so CDC emits canonical data.
   * @param {string} tableName
   * @param {Object} whereClause
   * @return {Object|null}
   * @private
   */
  fetchUpdatedRow(tableName, whereClause) {
    return fetchUpdatedRowImpl({
      tableName,
      whereClause,
      db: this.db,
      logger: this.logger,
      partitionId: this.partitionId,
      replicaId: this.replicaId,
    });
  }
}

export {
  hasValidPartitionCdcRowPayload,
  hydratePartitionCdcEvent,
  PARTITION_CDC_EVENT_BUILD_STATE,
  PARTITION_CDC_EVENT_SKIP_REASON,
  PartitionCDCGenerator,
};
