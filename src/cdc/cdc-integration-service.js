/**
 * CDC Integration Service - Routes all system table writes through partitions.
 * Ensures cache consistency by making CDC the single source of truth.
 * Requirements: 5.6, 5.7, 5.8, 5.9, 5.10
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {HLCClockService} from '../hlc/hlc-clock-service.js';
import {SystemTableName} from '../bootstrap/system-table-schemas.js';

/**
 * Valid system table names for CDC operations.
 */
const VALID_SYSTEM_TABLES = Object.values(SystemTableName);

/**
 * CDC operation types.
 */
const CDCOperationType = {
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
};

/**
 * CDCIntegrationService routes all system table writes through actual partitions.
 * This ensures cache updates only happen via CDC events, maintaining consistency.
 *
 * Key architectural constraint:
 * - Components MUST NOT write directly to System_Table_Cache
 * - All writes go through this service → partition → CDC → cache
 */
class CDCIntegrationService extends EventEmitter {
  /**
   * Create a new CDCIntegrationService.
   * @param {Object} options - Configuration options.
   * @param {Function} options.getPartitionForTable - Function to get partition for a table.
   * @param {string} options.nodeId - Node ID for logging context.
   */
  constructor(options = {}) {
    super();

    this.getPartitionForTable = options.getPartitionForTable || null;
    this.nodeId = options.nodeId || 'unknown';

    // HLC clock for timestamps
    this.hlcClock = new HLCClockService(this.nodeId);

    // Logging
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('cdc-integration') : console;

    // Configuration
    const config = ConfigurationManager.getInstance();
    this.retryMaxAttempts = config.get('cdc.retryMaxAttempts') || 3;
    this.retryDelayMs = config.get('cdc.retryDelayMs') || 100;

    // Statistics
    this.stats = {
      inserts: 0,
      updates: 0,
      deletes: 0,
      failures: 0,
    };

    this.initialized = false;
  }

  /**
   * Initialize the CDC integration service.
   * @param {Object} options - Initialization options.
   * @param {Function} options.getPartitionForTable - Function to get partition for a table.
   */
  initialize(options = {}) {
    if (options.getPartitionForTable) {
      this.getPartitionForTable = options.getPartitionForTable;
    }

    if (options.nodeId) {
      this.nodeId = options.nodeId;
    }

    this.initialized = true;

    this.logger.info('CDC integration service initialized', {
      nodeId: this.nodeId,
    });
  }

  /**
   * Validate table name is a valid system table.
   * @param {string} tableName - Table name to validate.
   * @throws {Error} If table name is invalid.
   * @private
   */
  validateTableName(tableName) {
    if (!VALID_SYSTEM_TABLES.includes(tableName)) {
      throw new Error(
        `Invalid system table name: ${tableName}. ` +
        `Valid tables are: ${VALID_SYSTEM_TABLES.join(', ')}`,
      );
    }
  }

  /**
   * Validate data has required id field.
   * @param {Object} data - Data to validate.
   * @param {string} operation - Operation type for error message.
   * @throws {Error} If data is invalid.
   * @private
   */
  validateData(data, operation) {
    if (!data || typeof data !== 'object') {
      throw new Error(`${operation} requires data object`);
    }
  }

  /**
   * Get the partition service for a system table.
   * @param {string} tableName - System table name.
   * @return {Object} Partition service.
   * @throws {Error} If partition not available.
   * @private
   */
  getPartition(tableName) {
    if (!this.getPartitionForTable) {
      throw new Error(
        'CDCIntegrationService not properly initialized: ' +
        'getPartitionForTable function not provided',
      );
    }

    const partition = this.getPartitionForTable(tableName);
    if (!partition) {
      throw new Error(`No partition available for system table: ${tableName}`);
    }

    return partition;
  }

  /**
   * Insert a row into a system table.
   * The write goes through the partition, which generates a CDC event.
   * The CDC event then updates all caches.
   *
   * @param {string} tableName - System table name.
   * @param {Object} data - Row data to insert.
   * @return {Promise<Object>} Insert result.
   */
  async insertSystemTableRow(tableName, data) {
    this.validateTableName(tableName);
    this.validateData(data, 'INSERT');

    // Generate ID if not provided
    const rowData = {...data};
    if (!rowData.id) {
      // Use the primary key field based on table schema
      const idField = this.getPrimaryKeyField(tableName);
      if (!rowData[idField]) {
        rowData[idField] = uuidv4();
      }
      // Also set 'id' for cache compatibility
      rowData.id = rowData[idField];
    }

    this.logger.debug('Inserting system table row via CDC', {
      tableName,
      id: rowData.id,
      nodeId: this.nodeId,
    });

    try {
      const partition = this.getPartition(tableName);
      const result = await partition.insertData(tableName, rowData);

      this.stats.inserts++;

      this.logger.debug('System table row inserted', {
        tableName,
        id: rowData.id,
        success: result.success,
      });

      this.emit('insert', {
        tableName,
        data: rowData,
        result,
      });

      return {
        success: true,
        operation: CDCOperationType.INSERT,
        tableName,
        data: rowData,
        partitionResult: result,
      };
    } catch (error) {
      this.stats.failures++;

      this.logger.error('Failed to insert system table row', {
        tableName,
        id: rowData.id,
        error: error.message,
        nodeId: this.nodeId,
      });

      this.emit('error', {
        operation: CDCOperationType.INSERT,
        tableName,
        data: rowData,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Update a row in a system table.
   * The write goes through the partition, which generates a CDC event.
   * The CDC event then updates all caches.
   *
   * @param {string} tableName - System table name.
   * @param {Object} whereClause - WHERE clause conditions (must include primary key).
   * @param {Object} data - Data to update.
   * @return {Promise<Object>} Update result.
   */
  async updateSystemTableRow(tableName, whereClause, data) {
    this.validateTableName(tableName);
    this.validateData(whereClause, 'UPDATE whereClause');
    this.validateData(data, 'UPDATE data');

    // Ensure we have a primary key in whereClause
    const idField = this.getPrimaryKeyField(tableName);
    const id = whereClause[idField] || whereClause.id;
    if (!id) {
      throw new Error(
        `UPDATE requires primary key (${idField}) in whereClause`,
      );
    }

    // Add id to data for cache compatibility
    const updateData = {...data, id};

    this.logger.debug('Updating system table row via CDC', {
      tableName,
      id,
      nodeId: this.nodeId,
    });

    try {
      const partition = this.getPartition(tableName);
      const result = await partition.updateData(tableName, whereClause, data);

      this.stats.updates++;

      this.logger.debug('System table row updated', {
        tableName,
        id,
        success: result.success,
        changes: result.changes,
      });

      this.emit('update', {
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
      };
    } catch (error) {
      this.stats.failures++;

      this.logger.error('Failed to update system table row', {
        tableName,
        id,
        error: error.message,
        nodeId: this.nodeId,
      });

      this.emit('error', {
        operation: CDCOperationType.UPDATE,
        tableName,
        whereClause,
        data: updateData,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Delete a row from a system table.
   * The write goes through the partition, which generates a CDC event.
   * The CDC event then updates all caches.
   *
   * @param {string} tableName - System table name.
   * @param {Object} whereClause - WHERE clause conditions (must include primary key).
   * @return {Promise<Object>} Delete result.
   */
  async deleteSystemTableRow(tableName, whereClause) {
    this.validateTableName(tableName);
    this.validateData(whereClause, 'DELETE whereClause');

    // Ensure we have a primary key in whereClause
    const idField = this.getPrimaryKeyField(tableName);
    const id = whereClause[idField] || whereClause.id;
    if (!id) {
      throw new Error(
        `DELETE requires primary key (${idField}) in whereClause`,
      );
    }

    this.logger.debug('Deleting system table row via CDC', {
      tableName,
      id,
      nodeId: this.nodeId,
    });

    try {
      const partition = this.getPartition(tableName);
      const result = await partition.deleteData(tableName, whereClause);

      this.stats.deletes++;

      this.logger.debug('System table row deleted', {
        tableName,
        id,
        success: result.success,
        changes: result.changes,
      });

      this.emit('delete', {
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
      };
    } catch (error) {
      this.stats.failures++;

      this.logger.error('Failed to delete system table row', {
        tableName,
        id,
        error: error.message,
        nodeId: this.nodeId,
      });

      this.emit('error', {
        operation: CDCOperationType.DELETE,
        tableName,
        whereClause,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Get the primary key field name for a system table.
   * @param {string} tableName - System table name.
   * @return {string} Primary key field name.
   * @private
   */
  getPrimaryKeyField(tableName) {
    // Map table names to their primary key fields
    const primaryKeyMap = {
      [SystemTableName.TABLES]: 'table_id',
      [SystemTableName.PARTITIONS]: 'partition_id',
      [SystemTableName.INDICES]: 'index_id',
      [SystemTableName.MESSAGE_GROUPS]: 'group_id',
      [SystemTableName.NODES]: 'node_id',
      [SystemTableName.SERVICES]: 'service_id',
      [SystemTableName.LOGS]: 'log_id',
      [SystemTableName.CONFIG]: 'config_key',
      [SystemTableName.LIVE_QUERIES]: 'query_id',
      [SystemTableName.CONTEXTS]: 'context_id',
      [SystemTableName.CODE]: 'function_id',
    };

    return primaryKeyMap[tableName] || 'id';
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
      inserts: 0,
      updates: 0,
      deletes: 0,
      failures: 0,
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

export {CDCIntegrationService, CDCOperationType, VALID_SYSTEM_TABLES};
