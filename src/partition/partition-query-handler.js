/**
 * Partition Query Handler - Manages SQL query execution for partitions.
 * Extracted from partition-service.js for single responsibility.
 * Requirements: 1.1, 1.8
 *
 * @module partition/partition-query-handler
 */

import {NUM} from '../constants/numbers.js';
import {SQL} from '../constants/sql.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_VALUE,
} from './partition-service-constants.js';

/**
 * Manages SQL query execution for partitions.
 * Handles SELECT queries directly and provides helpers for write operations.
 * Write operations that require Raft consensus are delegated back to PartitionService.
 *
 * Responsibilities:
 * - Execute SELECT queries directly on SQLite
 * - Execute local queries (bootstrap-only, no Raft)
 * - Determine if a query is a read or write operation
 * - Provide query result formatting
 *
 * @class
 */
class PartitionQueryHandler {
  /**
   * Create a new query handler instance.
   * @param {Object} options - Configuration options.
   * @param {string} options.partitionId - Partition ID.
   * @param {Database} options.db - SQLite database instance.
   * @param {Object} options.logger - Logger instance.
   */
  constructor(options = {}) {
    this.partitionId = options.partitionId;
    this.db = options.db || null;
    this.logger = options.logger || console;
  }

  /**
   * Set the database instance.
   * Used when the database is initialized after handler creation.
   * @param {Database} db - SQLite database instance.
   */
  setDatabase(db) {
    this.db = db;
  }

  /**
   * Check if the handler is initialized with a database.
   * @return {boolean} True if database is set.
   */
  isInitialized() {
    return this.db !== null;
  }

  /**
   * Determine if a SQL query is a SELECT (read) operation.
   * @param {string} sql - SQL query string.
   * @return {boolean} True if the query is a SELECT.
   */
  isSelectQuery(sql) {
    return sql.trim().toUpperCase().startsWith(SQL.SELECT);
  }

  /**
   * Execute a SELECT query directly on the local SQLite database.
   * @param {string} sql - SQL query string.
   * @param {Array} params - Query parameters.
   * @return {Object} Query result with rows and count.
   * @throws {Error} If not initialized or query fails.
   */
  executeSelect(sql, params = []) {
    if (!this.db) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.EXECUTING_QUERY, {
      partitionId: this.partitionId,
      sql: sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS),
    });

    try {
      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params);
      return {
        success: true,
        rows,
        count: rows.length,
        partitionId: this.partitionId,
      };
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.QUERY_FAILED, {
        partitionId: this.partitionId,
        sql: sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS),
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Execute a SQL query directly on the local SQLite database.
   * Bootstrap-only helper: bypasses Raft and does not replicate.
   * Handles both SELECT and write operations locally.
   * @param {string} sql - SQL query string.
   * @param {Array} params - Query parameters.
   * @return {Object} Query result.
   * @throws {Error} If not initialized or query fails.
   */
  executeLocalQuery(sql, params = []) {
    if (!this.db) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }

    this.logger.debug(PARTITION_SERVICE_LOG_MSG.EXECUTING_QUERY, {
      partitionId: this.partitionId,
      sql: sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS),
      bootstrap: true,
    });

    try {
      const stmt = this.db.prepare(sql);
      const isSelect = this.isSelectQuery(sql);

      if (isSelect) {
        const rows = stmt.all(...params);
        return {
          success: true,
          rows,
          count: rows.length,
          partitionId: this.partitionId,
        };
      }

      const info = stmt.run(...params);
      return {
        success: true,
        changes: info.changes,
        lastInsertRowid: info.lastInsertRowid,
        partitionId: this.partitionId,
        requiresSizeUpdate: true,
      };
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.QUERY_FAILED, {
        partitionId: this.partitionId,
        sql: sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS),
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Execute a write operation directly on the local SQLite database.
   * Used for applying Raft-committed entries.
   * @param {string} sql - SQL query string.
   * @param {Array} params - Query parameters.
   * @return {Object} Write result with changes count.
   * @throws {Error} If not initialized or query fails.
   */
  executeWrite(sql, params = []) {
    if (!this.db) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }

    try {
      const stmt = this.db.prepare(sql);
      const info = stmt.run(...params);
      return {
        success: true,
        changes: info.changes,
        lastInsertRowid: info.lastInsertRowid,
        partitionId: this.partitionId,
      };
    } catch (error) {
      this.logger.error(PARTITION_SERVICE_ERROR_MSG.QUERY_FAILED, {
        partitionId: this.partitionId,
        sql: sql.substring(NUM.ZERO, PARTITION_SERVICE_VALUE.DEFAULT_QUERY_TIMEOUT_MS),
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Prepare a SQL statement for execution.
   * @param {string} sql - SQL query string.
   * @return {Statement} Prepared SQLite statement.
   * @throws {Error} If not initialized.
   */
  prepare(sql) {
    if (!this.db) {
      throw new Error(PARTITION_SERVICE_ERROR_MSG.NOT_INITIALIZED);
    }
    return this.db.prepare(sql);
  }
}

export {
  PartitionQueryHandler,
};
