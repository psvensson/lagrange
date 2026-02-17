/**
 * Partition CDC Generator - Generates CDC events for partition write operations.
 * Extracted from partition-service.js for single responsibility.
 * Requirements: 6.2, 6.4, 6.6
 */

import {CDC_OPERATION, NUM, SQL} from '../constants/index.js';
import {STRING} from '../constants/strings.js';
import {SystemTableName} from '../bootstrap/system-table-schemas-constants.js';
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

    const operationInfo = this.determineOperation(entry);
    if (!operationInfo) {
      return; // No CDC for this operation type
    }

    const {operation, entryType} = operationInfo;
    const cdcData = this.extractCDCData(entry, entryType);
    const tableName = this.extractTableName(entry);

    const cdcEvent = {
      tableName,
      operation,
      data: cdcData,
      timestamp: entry.timestamp,
      sourcePartition: this.partitionId,
      sourceReplica: this.replicaId,
    };

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.GENERATED_CDC_EVENT, {
      partitionId: this.partitionId,
      operation,
      tableName: cdcEvent.tableName,
      dataKeys: Object.keys(cdcData),
      subscriberCount: this.cdcSubscribers.size,
    });

    await this.deliverEvent(cdcEvent);
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
      if (sqlUpper.startsWith(SQL.INSERT_OR_REPLACE)) {
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
  extractCDCData(entry, entryType) {
    // For UPDATE operations, merge whereClause (contains primary key) with data
    // This ensures CDC events always include the primary key field
    // For DELETE operations, use whereClause as the data (contains primary key)
    let cdcData = entry.data || {};
    if ((entry.type === PARTITION_SERVICE_OPERATION.UPDATE ||
      entryType === PARTITION_SERVICE_OPERATION.UPDATE) && entry.whereClause) {
      cdcData = {...entry.whereClause, ...cdcData};
    } else if ((entry.type === PARTITION_SERVICE_OPERATION.DELETE ||
      entryType === PARTITION_SERVICE_OPERATION.DELETE) && entry.whereClause) {
      cdcData = {...entry.whereClause};
    }

    // For raw SQL queries, extract data from SQL
    if (entry.type === PARTITION_SERVICE_OPERATION.QUERY && entry.sql) {
      const tableName = this.extractTableNameFromSQL(entry.sql);

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

    return cdcData;
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
      if (extractedName) {
        tableName = extractedName;
      }
    }
    return tableName;
  }

  /**
   * Extract table name from SQL statement.
   * @param {string} sql - SQL statement.
   * @return {string|null} Table name or null.
   * @private
   */
  extractTableNameFromSQL(sql) {
    const tableMatch = sql.match(
      /(?:UPDATE|INSERT\s+(?:OR\s+REPLACE\s+)?INTO|DELETE\s+FROM)\s+(\w+)/i,
    );
    if (tableMatch) {
      const tableName = tableMatch[NUM.ONE];
      this.logger.debug(PARTITION_SERVICE_LOG_MSG.EXTRACTED_TABLE_NAME, {tableName});
      return tableName;
    }
    return null;
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
    // Parse INSERT INTO table (col1, col2) VALUES ('val1', 'val2')
    // or INSERT OR REPLACE INTO table (col1, col2) VALUES ('val1', 'val2')
    const columnsMatch = sql.match(
      /INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+\w+\s*\(([^)]+)\)/i,
    );
    const valuesMatch = sql.match(/VALUES\s*\(([^)]+)\)/i);

    if (!columnsMatch || !valuesMatch) {
      this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_INSERT_FAILED, {
        sql: sql.substring(
          NUM.ZERO,
          PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT,
        ),
      });
      return {};
    }

    const columns = columnsMatch[NUM.ONE].split(
      PARTITION_SERVICE_SQL_FRAGMENT.COMMA,
    ).map((c) => c.trim());
    const valuesStr = valuesMatch[NUM.ONE];

    // Parse values - handle quoted strings and numbers
    const values = this.parseValuesFromSQL(valuesStr);

    if (columns.length !== values.length) {
      this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_INSERT_MISMATCH, {
        columns: columns.length,
        values: values.length,
      });
      return {};
    }

    // Build data object
    const data = {};
    for (let i = NUM.ZERO; i < columns.length; i++) {
      data[columns[i]] = values[i];
    }

    // Try to fetch the full row from DB to get any default values
    // Find the primary key column (usually first column or 'id')
    const pkColumn = columns[NUM.ZERO];
    const pkValue = values[NUM.ZERO];

    if (pkValue !== null && pkValue !== undefined && this.db) {
      try {
        const stmt = this.db.prepare(`SELECT * FROM ${tableName} WHERE ${pkColumn} = ?`);
        const row = stmt.get(pkValue);
        if (row) {
          if (tableName !== SystemTableName.LOGS) {
            this.logger.info(PARTITION_SERVICE_LOG_MSG.FETCHED_INSERT_ROW, {
              tableName,
              rowKeys: Object.keys(row),
            });
          }
          return row;
        }
      } catch (err) {
        this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_FETCH_INSERT_FAILED, {
          tableName,
          error: err.message,
        });
        throw err;
      }
    }

    return data;
  }

  /**
   * Extract data from UPDATE SQL by querying the updated row.
   * @param {string} sql - UPDATE SQL statement.
   * @param {string} tableName - Table name.
   * @return {Object} Extracted data or empty object.
   * @private
   */
  extractUpdateDataFromSQL(sql, tableName) {
    // Match WHERE clause with optional parentheses: WHERE (col = 'val') or WHERE col = 'val'
    const whereMatch = sql.match(/WHERE\s*\(?(\w+)\s*=\s*'([^']+)'/i);
    if (whereMatch && this.db) {
      const keyColumn = whereMatch[NUM.ONE];
      const keyValue = whereMatch[NUM.TWO];
      if (tableName !== SystemTableName.LOGS) {
        this.logger.info(PARTITION_SERVICE_LOG_MSG.FETCHING_UPDATE_ROW, {
          tableName,
          keyColumn,
          keyValue,
        });
      }
      // Query the updated row to get full data for CDC
      try {
        const stmt = this.db.prepare(`SELECT * FROM ${tableName} WHERE ${keyColumn} = ?`);
        const row = stmt.get(keyValue);
        if (row) {
          if (tableName !== SystemTableName.LOGS) {
            this.logger.info(PARTITION_SERVICE_LOG_MSG.FETCHED_UPDATE_ROW, {
              tableName,
              rowKeys: Object.keys(row),
            });
          }
          return row;
        } else {
          this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_NO_ROW_UPDATE, {
            tableName,
            keyColumn,
            keyValue,
          });
        }
      } catch (err) {
        this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_FETCH_UPDATE_FAILED, {
          tableName,
          error: err.message,
        });
        throw err;
      }
    } else {
      this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_EXTRACT_UPDATE_WHERE_FAILED, {
        sql: sql.substring(
          NUM.ZERO,
          PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT,
        ),
      });
    }
    return {};
  }

  /**
   * Extract data from DELETE SQL.
   * @param {string} sql - DELETE SQL statement.
   * @return {Object} Extracted data or empty object.
   * @private
   */
  extractDeleteDataFromSQL(sql) {
    // Match WHERE clause: WHERE col = 'val'
    const whereMatch = sql.match(/WHERE\s*\(?(\w+)\s*=\s*'([^']+)'/i);
    if (whereMatch) {
      const keyColumn = whereMatch[NUM.ONE];
      const keyValue = whereMatch[NUM.TWO];
      return {[keyColumn]: keyValue};
    }
    this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_EXTRACT_DELETE_WHERE_FAILED, {
      sql: sql.substring(
        NUM.ZERO,
        PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT,
      ),
    });
    return {};
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
    // Parse INSERT INTO table (col1, col2, ...) VALUES (?, ?, ...)
    const columnsMatch = sql.match(
      /INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+\w+\s*\(([^)]+)\)/i,
    );
    if (!columnsMatch) {
      this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_PARAM_INSERT_COLUMNS_FAILED, {
        sql: sql.substring(
          NUM.ZERO,
          PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT,
        ),
      });
      return {};
    }

    const columns = columnsMatch[NUM.ONE].split(
      PARTITION_SERVICE_SQL_FRAGMENT.COMMA,
    ).map((c) => c.trim());
    if (columns.length !== params.length) {
      this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARAM_INSERT_MISMATCH, {
        columns: columns.length,
        params: params.length,
      });
      return {};
    }

    // Build data object from columns and params
    const data = {};
    for (let i = NUM.ZERO; i < columns.length; i++) {
      data[columns[i]] = params[i];
    }

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.EXTRACTED_PARAM_INSERT, {
      tableName,
      dataKeys: Object.keys(data),
    });

    return data;
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
    // Parse UPDATE table SET col1 = ?, col2 = ? WHERE pk = ?
    const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i);
    const whereMatch = sql.match(/WHERE\s+(.+)$/i);

    if (!setMatch) {
      this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_PARAM_UPDATE_SET_FAILED, {
        sql: sql.substring(
          NUM.ZERO,
          PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT,
        ),
      });
      return {};
    }

    // Extract column names from SET clause
    const setColumns = setMatch[NUM.ONE].split(
      PARTITION_SERVICE_SQL_FRAGMENT.COMMA,
    ).map((part) => {
      const match = part.trim().match(/^(\w+)\s*=/);
      return match ? match[NUM.ONE] : null;
    }).filter(Boolean);

    // Extract column names from WHERE clause
    // Handle parentheses around the WHERE clause: WHERE (col = ?)
    const whereColumns = [];
    if (whereMatch) {
      // Strip outer parentheses if present
      let whereContent = whereMatch[NUM.ONE].trim();
      if (whereContent.startsWith(PARTITION_SERVICE_SQL_FRAGMENT.OPEN_PAREN) &&
        whereContent.endsWith(PARTITION_SERVICE_SQL_FRAGMENT.CLOSE_PAREN)) {
        whereContent = whereContent.slice(NUM.ONE, -NUM.ONE).trim();
      }
      const whereParts = whereContent.split(/\s+AND\s+/i);
      for (const part of whereParts) {
        // Strip any remaining parentheses from individual parts
        const cleanPart = part.trim().replace(/^\(+|\)+$/g, STRING.EMPTY);
        const match = cleanPart.match(/^(\w+)\s*=/);
        if (match) whereColumns.push(match[NUM.ONE]);
      }
    }

    const allColumns = [...setColumns, ...whereColumns];
    if (allColumns.length !== params.length) {
      this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARAM_UPDATE_MISMATCH, {
        columns: allColumns.length,
        params: params.length,
      });
      return {};
    }

    // Build data object
    const data = {};
    for (let i = NUM.ZERO; i < allColumns.length; i++) {
      data[allColumns[i]] = params[i];
    }

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.EXTRACTED_PARAM_UPDATE, {
      tableName,
      dataKeys: Object.keys(data),
    });

    return data;
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
    // Parse DELETE FROM table WHERE pk = ? or WHERE (pk = ?)
    const whereMatch = sql.match(/WHERE\s+\(?(.+?)\)?$/i);
    if (!whereMatch) {
      this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARSE_PARAM_DELETE_WHERE_FAILED, {
        sql: sql.substring(
          NUM.ZERO,
          PARTITION_SERVICE_VALUE.CDC_PARSE_LIMIT,
        ),
      });
      return {};
    }

    const whereColumns = [];
    // Handle both "col = ?" and "(col = ?)" formats
    const whereContent = whereMatch[NUM.ONE].replace(/^\(|\)$/g, STRING.EMPTY).trim();
    const whereParts = whereContent.split(/\s+AND\s+/i);
    for (const part of whereParts) {
      const match = part.trim().match(/^(\w+)\s*=/);
      if (match) whereColumns.push(match[NUM.ONE]);
    }

    if (whereColumns.length !== params.length) {
      this.logger.warn(PARTITION_SERVICE_ERROR_MSG.CDC_PARAM_DELETE_MISMATCH, {
        columns: whereColumns.length,
        params: params.length,
        whereContent,
      });
      return {};
    }

    const data = {};
    for (let i = NUM.ZERO; i < whereColumns.length; i++) {
      data[whereColumns[i]] = params[i];
    }

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.EXTRACTED_PARAM_DELETE, {
      tableName,
      dataKeys: Object.keys(data),
    });

    return data;
  }

  /**
   * Parse values from SQL VALUES clause.
   * @param {string} valuesStr - Values string like "'val1', 123, NULL".
   * @return {Array} Parsed values.
   * @private
   */
  parseValuesFromSQL(valuesStr) {
    const values = [];
    let current = STRING.EMPTY;
    let inQuote = false;
    let quoteChar = null;

    for (let i = NUM.ZERO; i < valuesStr.length; i++) {
      const char = valuesStr[i];

      if (!inQuote && (char === PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE ||
        char === PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE)) {
        inQuote = true;
        quoteChar = char;
      } else if (inQuote && char === quoteChar) {
        // Check for escaped quote
        if (i + NUM.ONE < valuesStr.length &&
          valuesStr[i + NUM.ONE] === quoteChar) {
          current += char;
          i += NUM.ONE; // Skip next quote
        } else {
          inQuote = false;
          quoteChar = null;
        }
      } else if (!inQuote && char === PARTITION_SERVICE_SQL_FRAGMENT.COMMA) {
        values.push(this.parseValue(current.trim()));
        current = STRING.EMPTY;
      } else {
        current += char;
      }
    }

    // Don't forget the last value
    if (current.trim()) {
      values.push(this.parseValue(current.trim()));
    }

    return values;
  }

  /**
   * Parse a single value from SQL.
   * @param {string} val - Value string.
   * @return {*} Parsed value.
   * @private
   */
  parseValue(val) {
    if (val.toUpperCase() === PARTITION_SERVICE_SQL_FRAGMENT.NULL_VALUE) {
      return null;
    }
    // Remove quotes
    if ((val.startsWith(PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE) &&
      val.endsWith(PARTITION_SERVICE_SQL_FRAGMENT.SINGLE_QUOTE)) ||
        (val.startsWith(PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE) &&
        val.endsWith(PARTITION_SERVICE_SQL_FRAGMENT.DOUBLE_QUOTE))) {
      return val.slice(NUM.ONE, -NUM.ONE);
    }
    // Try to parse as number
    const num = Number(val);
    if (!isNaN(num)) {
      return num;
    }
    return val;
  }
}

export {
  PartitionCDCGenerator,
};
