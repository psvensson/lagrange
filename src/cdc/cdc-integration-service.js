/**
 * CDC Integration Service - Routes all system table writes through partitions.
 * Ensures cache consistency by making CDC the single source of truth.
 * Requirements: 3.5, 5.6, 5.7, 5.8, 5.9, 5.10
 */

import {EventEmitter} from 'events';
import {v4 as uuidv4} from 'uuid';
import {LoggingService} from '../logging/logging-service.js';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {HLCClockService} from '../hlc/hlc-clock-service.js';
import {SystemTableName} from '../bootstrap/system-table-schemas.js';
import {AssignmentEpoch} from '../rebalancer/assignment-epoch.js';

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
 * Config key for the current epoch in the config table.
 */
const EPOCH_CONFIG_KEY = 'current_epoch';

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

    // Epoch manager reference for CDC epoch change handling
    this.epochManager = null;

    // Rebalancer reference for node state change handling
    this.rebalancer = null;

    // Track previous node states for detecting changes
    this._nodeStates = new Map();

    // Statistics
    this.stats = {
      inserts: 0,
      updates: 0,
      deletes: 0,
      failures: 0,
      epochChanges: 0,
      nodeStateChanges: 0,
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
    const idField = this.getPrimaryKeyField(tableName);
    if (!rowData[idField]) {
      rowData[idField] = uuidv4();
    }
    // Track the id for logging (don't add 'id' field to row data)
    const trackingId = rowData[idField];

    this.logger.debug('Inserting system table row via CDC', {
      tableName,
      id: trackingId,
      nodeId: this.nodeId,
    });

    try {
      const partition = this.getPartition(tableName);
      const result = await partition.insertData(tableName, rowData);

      this.stats.inserts++;

      this.logger.debug('System table row inserted', {
        tableName,
        id: trackingId,
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
        id: trackingId,
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

    // Keep data as-is, don't add 'id' field
    const updateData = {...data};

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
      epochChanges: 0,
      nodeStateChanges: 0,
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
      throw new Error('epochManager is required');
    }
    this.epochManager = epochManager;

    this.logger.debug('Epoch manager set for CDC integration', {
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
    // Validate cdcEvent
    if (!cdcEvent || typeof cdcEvent !== 'object') {
      return {
        applied: false,
        error: 'Invalid CDC event: event must be an object',
      };
    }

    // Check if this is an epoch change event
    const configKey = cdcEvent.data?.config_key;
    if (configKey !== EPOCH_CONFIG_KEY) {
      return {
        applied: false,
        error: `Not an epoch change event: config_key is '${configKey}'`,
      };
    }

    // Check if epoch manager is set
    if (!this.epochManager) {
      this.logger.warn('Epoch change CDC received but no epoch manager set', {
        nodeId: this.nodeId,
      });
      return {
        applied: false,
        error: 'Epoch manager not set',
      };
    }

    // Parse the epoch data from config_value
    let epochData;
    try {
      const configValue = cdcEvent.data?.config_value;
      if (typeof configValue === 'string') {
        epochData = JSON.parse(configValue);
      } else if (typeof configValue === 'object' && configValue !== null) {
        epochData = configValue;
      } else {
        throw new Error('config_value must be a string or object');
      }
    } catch (parseError) {
      this.logger.error('Failed to parse epoch data from CDC event', {
        nodeId: this.nodeId,
        error: parseError.message,
      });
      return {
        applied: false,
        error: `Failed to parse epoch data: ${parseError.message}`,
      };
    }

    // Create AssignmentEpoch from the parsed data
    let epoch;
    try {
      epoch = AssignmentEpoch.fromObject(epochData);
    } catch (epochError) {
      this.logger.error('Failed to create AssignmentEpoch from CDC data', {
        nodeId: this.nodeId,
        error: epochError.message,
      });
      return {
        applied: false,
        error: `Failed to create epoch: ${epochError.message}`,
      };
    }

    // Apply the epoch to the epoch manager
    const applied = this.epochManager.applyEpoch(epoch);

    if (applied) {
      this.stats.epochChanges++;

      this.logger.info('Epoch change applied from CDC', {
        nodeId: this.nodeId,
        epoch: epoch.epoch,
        proposedBy: epoch.proposedBy,
      });

      // Emit epochChange event
      this.emit('epochChange', {
        epoch: epoch.epoch,
        assignments: epoch.assignments,
        timestamp: epoch.timestamp,
        proposedBy: epoch.proposedBy,
        source: 'cdc',
      });

      return {
        applied: true,
        epoch: epoch.epoch,
      };
    } else {
      this.logger.debug('Epoch change not applied (stale or equal epoch)', {
        nodeId: this.nodeId,
        incomingEpoch: epoch.epoch,
      });

      return {
        applied: false,
        error: 'Epoch not applied (stale or equal to current)',
        epoch: epoch.epoch,
      };
    }
  }

  /**
   * Set the rebalancer reference for node state change handling.
   * @param {StateAwareRebalancer} rebalancer - The rebalancer instance.
   */
  setRebalancer(rebalancer) {
    if (!rebalancer) {
      throw new Error('rebalancer is required');
    }
    this.rebalancer = rebalancer;

    this.logger.debug('Rebalancer set for CDC integration', {
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
    // Validate cdcEvent
    if (!cdcEvent || typeof cdcEvent !== 'object') {
      return {
        processed: false,
        error: 'Invalid CDC event: event must be an object',
      };
    }

    // Check if this is a nodes table event
    const tableName = cdcEvent.tableName;
    if (tableName !== SystemTableName.NODES) {
      return {
        processed: false,
        error: `Not a nodes table event: tableName is '${tableName}'`,
      };
    }

    // Extract node data
    const nodeId = cdcEvent.data?.node_id;
    const newState = cdcEvent.data?.status;

    if (!nodeId) {
      return {
        processed: false,
        error: 'Missing node_id in CDC event data',
      };
    }

    if (!newState) {
      return {
        processed: false,
        error: 'Missing status in CDC event data',
      };
    }

    // Get the previous state for this node
    const oldState = this._nodeStates.get(nodeId) || null;

    // Update tracked state
    this._nodeStates.set(nodeId, newState);

    // Check if state actually changed
    if (oldState === newState) {
      this.logger.debug('Node state unchanged, skipping', {
        nodeId,
        state: newState,
      });
      return {
        processed: true,
        nodeId,
        oldState,
        newState,
        stateChanged: false,
      };
    }

    // Increment stats
    this.stats.nodeStateChanges++;

    this.logger.info('Node state change detected via CDC', {
      nodeId,
      oldState,
      newState,
    });

    // Emit nodeStateChange event
    this.emit('nodeStateChange', {
      nodeId,
      oldState,
      newState,
      timestamp: Date.now(),
      source: 'cdc',
    });

    // Trigger rebalancer if set
    if (this.rebalancer) {
      try {
        this.rebalancer.onNodeStateChange(nodeId, oldState, newState);
        this.logger.debug('Rebalancer notified of node state change', {
          nodeId,
          oldState,
          newState,
        });
      } catch (rebalancerError) {
        this.logger.error('Failed to notify rebalancer of node state change', {
          nodeId,
          oldState,
          newState,
          error: rebalancerError.message,
        });
      }
    } else {
      this.logger.debug('No rebalancer set, skipping rebalancer notification', {
        nodeId,
      });
    }

    return {
      processed: true,
      nodeId,
      oldState,
      newState,
      stateChanged: true,
    };
  }
}

export {CDCIntegrationService, CDCOperationType, VALID_SYSTEM_TABLES, EPOCH_CONFIG_KEY};
