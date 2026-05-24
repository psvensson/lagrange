/**
 * Partition CDC Generator - Generates CDC events for partition write operations.
 * Extracted from partition-service.js for single responsibility.
 * Requirements: 6.2, 6.4, 6.6
 */

import {CDC_OPERATION, NUM, SQL, TYPEOF} from '../constants/index.js';
import {
  extractDeleteDataFromSQL as extractDeleteDataFromSQLImpl,
  extractInsertDataFromSQL as extractInsertDataFromSQLImpl,
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
  PARTITION_SERVICE_SQL_FRAGMENT,
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
});

const PARTITION_CDC_GENERATOR_LITERAL = Object.freeze({
  SUPPRESSING_CDC_EVENT_FOR_NO_OP_WRITE: 'Suppressing CDC event for no-op write',
});

/**
 * Generates CDC events for partition write operations.
 * Handles event creation, formatting, and delivery to subscribers.
 *
 * Responsibilities:
 * - CDC event generation for INSERT, UPDATE, DELETE, UPSERT operations
 * - SQL parsing to extract table names and data
 * - CDC event formatting with proper structure
 * - CDC event delivery to subscribers
 *
 * @class
 */
class PartitionCDCGenerator {
  /**
   * Create a new CDC generator instance.
   * @param {Object} options - Configuration options.
   * @param {string} options.partitionId - Partition ID.
   * @param {string} options.replicaId - Replica ID.
   * @param {string} options.tableName - Default table name.
   * @param {Database} options.db - SQLite database instance for row lookups.
   * @param {Object} options.logger - Logger instance.
   * @param {EventEmitter} options.eventEmitter - Event emitter for CDC events.
   */
  constructor(options = {}) {
    this.partitionId = options.partitionId;
    this.replicaId = options.replicaId;
    this.tableName = options.tableName;
    this.db = options.db;
    this.logger = options.logger || console;
    this.eventEmitter = options.eventEmitter;

    // CDC subscribers
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
        entry.sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT) :
        null,
      subscriberCount: this.cdcSubscribers.size,
    });

    if (this.cdcSubscribers.size === NUM.ZERO) {
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.NO_CDC_SUBSCRIBERS, {
        partitionId: this.partitionId,
      });
      return;
    }

    const buildResult = this.buildEvent(entry);
    if (buildResult.state !== PARTITION_CDC_EVENT_BUILD_STATE.BUILT) {
      return;
    }

    const cdcEvent = buildResult.cdcEvent;

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.GENERATED_CDC_EVENT, {
      partitionId: this.partitionId,
      operation: cdcEvent.operation,
      tableName: cdcEvent.tableName,
      dataKeys: Object.keys(cdcEvent.data),
      subscriberCount: this.cdcSubscribers.size,
    });

    await this.deliverEvent(cdcEvent);
  }

  /**
   * Resolve one explicit event-envelope snapshot before hydrating row data.
   * This lets callers decide buffering policy without carrying a second local
   * CDC state machine.
   * @param {Object} entry - Write entry.
   * @param {Object} options - Envelope build options.
   * @param {boolean} options.suppressNoOpWrite - Skip zero-change mutations.
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
        sourceReplica: this.replicaId,
      }),
    });
  }

  /**
   * Build a full CDC event from a previously-resolved envelope snapshot.
   * @param {Object} entry - Write entry.
   * @param {Object} envelopeResult - Result from resolveEventEnvelope().
   * @param {Object} options - Event build options.
   * @param {number} options.sequenceNumber - Optional monotonic sequence number.
   * @return {Object} Built CDC event.
   */
  hydrateEventEnvelope(entry, envelopeResult, options = {}) {
    const cdcEvent = {
      ...envelopeResult.cdcEventEnvelope,
      data: this.extractCDCData(
        entry,
        envelopeResult.entryType,
        envelopeResult.cdcEventEnvelope.tableName,
      ),
    };
    if (Number.isFinite(options.sequenceNumber)) {
      cdcEvent.sequenceNumber = options.sequenceNumber;
    }
    return cdcEvent;
  }

  /**
   * Build a CDC event with an explicit state/result contract.
   * @param {Object} entry - Write entry.
   * @param {Object} options - Event build options.
   * @return {Object} Explicit build outcome.
   */
  buildEvent(entry, options = {}) {
    const envelopeResult = this.resolveEventEnvelope(entry, options);
    if (envelopeResult.state !== PARTITION_CDC_EVENT_BUILD_STATE.BUILT) {
      return envelopeResult;
    }

    return Object.freeze({
      ...envelopeResult,
      cdcEvent: this.hydrateEventEnvelope(entry, envelopeResult, options),
    });
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
      const hasParams = entry.params && entry.params.length > NUM.ZERO;
      const hasPlaceholders = entry.sql.includes(
        PARTITION_SERVICE_SQL_FRAGMENT.QUESTION_MARK,
      );

      if (hasParams && hasPlaceholders && Object.keys(cdcData).length === NUM.ZERO) {
        cdcData = this.extractDataFromParameterizedSQL(
          entry.sql, entry.params, tableName, entryType,
        );
      }

      // For INSERT queries without params, parse literal values from SQL
      if ((entryType === PARTITION_SERVICE_OPERATION.INSERT ||
        entryType === PARTITION_SERVICE_OPERATION.UPSERT) &&
          Object.keys(cdcData).length === NUM.ZERO) {
        cdcData = this.extractInsertDataFromSQL(entry.sql, tableName);
      }

      // For UPDATE queries, try to extract the WHERE clause to query updated row
      if (entryType === PARTITION_SERVICE_OPERATION.UPDATE &&
        Object.keys(cdcData).length === NUM.ZERO) {
        cdcData = this.extractUpdateDataFromSQL(entry.sql, tableName);
      }

      // For DELETE queries, extract the WHERE clause
      if (entryType === PARTITION_SERVICE_OPERATION.DELETE &&
        Object.keys(cdcData).length === NUM.ZERO) {
        cdcData = this.extractDeleteDataFromSQL(entry.sql);
      }
    }

    if (isUpdateOperation && entry.whereClause) {
      const authoritativeRow = this.fetchUpdatedRow(tableName, entry.whereClause);
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
    const hasChangeCount = typeof entry?.changes === TYPEOF.NUMBER;
    if (!hasChangeCount) {
      return false;
    }
    if (entry.changes > NUM.ZERO) {
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
      const tableName = tableMatch[NUM.ONE];
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
    let deliveredCount = NUM.ZERO;
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
    return extractDeleteDataFromSQLImpl(sql, this.logger);
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
    if (!params || params.length === NUM.ZERO) {
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
    });
  }
}

export {
  PARTITION_CDC_EVENT_BUILD_STATE,
  PartitionCDCGenerator,
};
