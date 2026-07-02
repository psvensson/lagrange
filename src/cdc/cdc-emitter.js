/**
 * CDCEmitter - Composable CDC event generation and subscriber management.
 *
 * Encapsulates CDC event creation, subscriber lifecycle, and event delivery.
 * Extracted from PartitionCDCGenerator to provide a focused, composable
 * building block for partition replicas.
 *
 * Requirements: 5.4, 5.5
 *
 * @module cdc/cdc-emitter
 */

import {SQL} from '../constants/index.js';
import {
  CDC_EMITTER_ERROR_MSG,
  CDC_EMITTER_FIELD,
  CDC_EMITTER_LOG_MSG,
  CDC_EMITTER_OPERATION,
} from './cdc-emitter-constants.js';

/**
 * SQL keyword prefixes used for operation type detection.
 * @private
 */
const SQL_PREFIX = Object.freeze({
  INSERT: SQL.INSERT_INTO,
  INSERT_OR_REPLACE: SQL.INSERT_OR_REPLACE,
  UPDATE: SQL.UPDATE,
  DELETE: SQL.DELETE_FROM,
});

/**
 * CDCEmitter generates and delivers CDC events to subscribers.
 *
 * @class
 */
class CDCEmitter {
  /**
   * @param {Object} options - Configuration options.
   * @param {string} options.partitionId - Source partition ID.
   * @param {string} options.replicaId - Source replica ID.
   * @param {string} options.tableName - Default table name.
   * @param {Object} options.hlcClock - HLC clock for timestamps.
   * @param {Object} [options.logger] - Logger instance.
   */
  constructor(options = {}) {
    if (!options.partitionId) {
      throw new Error(CDC_EMITTER_ERROR_MSG.MISSING_PARTITION_ID);
    }
    if (!options.replicaId) {
      throw new Error(CDC_EMITTER_ERROR_MSG.MISSING_REPLICA_ID);
    }
    if (!options.tableName) {
      throw new Error(CDC_EMITTER_ERROR_MSG.MISSING_TABLE_NAME);
    }
    if (!options.hlcClock) {
      throw new Error(CDC_EMITTER_ERROR_MSG.MISSING_HLC_CLOCK);
    }

    this.partitionId = options.partitionId;
    this.replicaId = options.replicaId;
    this.tableName = options.tableName;
    this.hlcClock = options.hlcClock;
    this.logger = options.logger || console;

    /** @private */
    this.subscribers = new Set();
  }

  /**
   * Generate and emit a CDC event to all subscribers.
   *
   * @param {string} operation - CDC operation (INSERT, UPDATE, DELETE).
   * @param {Object} data - Changed data.
   * @return {Promise<void>}
   */
  async emit(operation, data) {
    if (!operation) {
      throw new Error(CDC_EMITTER_ERROR_MSG.MISSING_OPERATION);
    }
    if (!data) {
      throw new Error(CDC_EMITTER_ERROR_MSG.MISSING_DATA);
    }

    const event = {
      [CDC_EMITTER_FIELD.TABLE_NAME]: this.tableName,
      [CDC_EMITTER_FIELD.OPERATION]: operation,
      [CDC_EMITTER_FIELD.DATA]: data,
      [CDC_EMITTER_FIELD.TIMESTAMP]: this.hlcClock.now(),
      [CDC_EMITTER_FIELD.SOURCE_PARTITION]: this.partitionId,
      [CDC_EMITTER_FIELD.SOURCE_REPLICA]: this.replicaId,
    };

    this.logger.debug(CDC_EMITTER_LOG_MSG.EMITTING_EVENT, {
      partitionId: this.partitionId,
      operation,
      tableName: this.tableName,
      subscriberCount: this.subscribers.size,
    });

    await this.deliverToSubscribers(event);
  }

  /**
   * Generate a CDC event from a SQL statement.
   * Extracts the operation type from the SQL string and calls emit().
   *
   * @param {string} sql - SQL statement.
   * @param {Array} params - Query parameters.
   * @param {Object} info - Additional info (e.g., SQLite run result).
   * @return {Promise<void>}
   */
  async emitFromSQL(sql, params, info) {
    const operation = this.extractOperationFromSQL(sql);
    if (!operation) {
      return;
    }

    const data = this.buildDataFromInfo(sql, params, info);
    await this.emit(operation, data);
  }

  /**
   * Subscribe to CDC events.
   *
   * @param {Function} subscriber - Subscriber callback function.
   */
  subscribe(subscriber) {
    this.subscribers.add(subscriber);
    this.logger.debug(CDC_EMITTER_LOG_MSG.SUBSCRIBER_ADDED, {
      partitionId: this.partitionId,
      subscriberCount: this.subscribers.size,
    });
  }

  /**
   * Unsubscribe from CDC events.
   *
   * @param {Function} subscriber - Subscriber to remove.
   */
  unsubscribe(subscriber) {
    this.subscribers.delete(subscriber);
    this.logger.debug(CDC_EMITTER_LOG_MSG.SUBSCRIBER_REMOVED, {
      partitionId: this.partitionId,
      subscriberCount: this.subscribers.size,
    });
  }

  /**
   * Shutdown and clear all subscribers.
   */
  shutdown() {
    this.logger.debug(CDC_EMITTER_LOG_MSG.SHUTDOWN, {
      partitionId: this.partitionId,
      subscriberCount: this.subscribers.size,
    });
    this.subscribers.clear();
    this.logger.debug(CDC_EMITTER_LOG_MSG.SHUTDOWN_COMPLETE, {
      partitionId: this.partitionId,
    });
  }

  /**
   * Deliver a CDC event to all subscribers.
   * If a subscriber throws, the error is logged and delivery
   * continues to remaining subscribers.
   *
   * @param {Object} event - CDC event to deliver.
   * @return {Promise<void>}
   * @private
   */
  async deliverToSubscribers(event) {
    let index = 0;
    for (const subscriber of this.subscribers) {
      try {
        await subscriber(event);
      } catch (error) {
        this.logger.error(
          CDC_EMITTER_LOG_MSG.SUBSCRIBER_DELIVERY_FAILED,
          {
            partitionId: this.partitionId,
            subscriberIndex: index,
            error: error.message,
          },
        );
      }
      index++;
    }
  }

  /**
   * Extract the CDC operation type from a SQL string.
   *
   * @param {string} sql - SQL statement.
   * @return {string|null} CDC operation or null for non-write SQL.
   * @private
   */
  extractOperationFromSQL(sql) {
    if (!sql || typeof sql !== 'string') {
      return null;
    }

    const trimmed = sql.trim().toUpperCase();

    if (trimmed.startsWith(SQL_PREFIX.INSERT_OR_REPLACE)) {
      return CDC_EMITTER_OPERATION.INSERT;
    }
    if (trimmed.startsWith(SQL_PREFIX.INSERT)) {
      return CDC_EMITTER_OPERATION.INSERT;
    }
    if (trimmed.startsWith(SQL_PREFIX.UPDATE)) {
      return CDC_EMITTER_OPERATION.UPDATE;
    }
    if (trimmed.startsWith(SQL_PREFIX.DELETE)) {
      return CDC_EMITTER_OPERATION.DELETE;
    }

    return null;
  }

  /**
   * Build a data object from SQL info for the CDC event.
   *
   * @param {string} sql - SQL statement.
   * @param {Array} params - Query parameters.
   * @param {Object} info - Additional info from the SQL execution.
   * @return {Object} Data object for the CDC event.
   * @private
   */
  buildDataFromInfo(sql, params, info) {
    const data = {};

    if (info && typeof info === 'object') {
      Object.assign(data, info);
    }

    if (params && Array.isArray(params) && params.length > 0) {
      data.params = params;
    }

    data.sql = sql;

    return data;
  }
}

export {CDCEmitter};
