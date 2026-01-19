/**
 * Data Directory Manager - Manages persistent storage directories.
 * Handles data directory validation, creation, and path generation.
 * Requirements: 35.2, 35.3, 35.4, 35.5, 35.6, 35.7, 35.8, 35.9, 35.10
 */

import fs from 'fs';
import path from 'path';
import {ConfigurationManager} from '../config/configuration-manager.js';
import {LoggingService} from '../logging/logging-service.js';

/**
 * DataDirectoryManager handles persistent storage directory operations.
 */
class DataDirectoryManager {
  static instance = null;

  /**
   * Create a new DataDirectoryManager instance.
   * @private
   */
  constructor() {
    this.dataDir = null;
    this.initialized = false;
    this.logger = null;
  }

  /**
   * Get the singleton instance.
   * @return {DataDirectoryManager} The data directory manager instance.
   */
  static getInstance() {
    if (!DataDirectoryManager.instance) {
      DataDirectoryManager.instance = new DataDirectoryManager();
    }
    return DataDirectoryManager.instance;
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance() {
    DataDirectoryManager.instance = null;
  }

  /**
   * Initialize the data directory manager.
   * Creates the data directory if it doesn't exist and validates writability.
   * @throws {Error} If the data directory is not writable.
   */
  initialize() {
    if (this.initialized) {
      return;
    }

    // Get logger
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('storage') : console;

    // Get data directory from configuration
    const config = ConfigurationManager.getInstance();
    this.dataDir = config.get('storage.dataDir') || './data';

    // Resolve to absolute path
    this.dataDir = path.resolve(this.dataDir);

    // Create data directory if it doesn't exist
    this.ensureDirectoryExists(this.dataDir);

    // Validate directory is writable
    this.validateWritable(this.dataDir);

    // Log configured data directory
    this.logger.info('Data directory configured', {
      dataDir: this.dataDir,
    });

    this.initialized = true;
  }


  /**
   * Ensure a directory exists, creating it if necessary.
   * @param {string} dirPath - Directory path to ensure exists.
   * @throws {Error} If directory cannot be created.
   * @private
   */
  ensureDirectoryExists(dirPath) {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, {recursive: true});
        this.logger.debug('Created directory', {path: dirPath});
      }
    } catch (error) {
      throw new Error(
        `Failed to create data directory '${dirPath}': ${error.message}`,
      );
    }
  }

  /**
   * Validate that a directory is writable.
   * @param {string} dirPath - Directory path to validate.
   * @throws {Error} If directory is not writable.
   * @private
   */
  validateWritable(dirPath) {
    const testFile = path.join(dirPath, '.write-test');
    try {
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    } catch (error) {
      throw new Error(
        `Data directory '${dirPath}' is not writable: ${error.message}`,
      );
    }
  }

  /**
   * Get the configured data directory.
   * @return {string} The data directory path.
   */
  getDataDir() {
    if (!this.initialized) {
      throw new Error('DataDirectoryManager not initialized');
    }
    return this.dataDir;
  }

  /**
   * Get the partitions directory path.
   * @return {string} The partitions directory path.
   */
  getPartitionsDir() {
    return path.join(this.getDataDir(), 'partitions');
  }

  /**
   * Get the database path for a partition replica.
   * Pattern: {data-dir}/partitions/{partition-id}/{replica-id}.db
   * @param {string} partitionId - Partition ID.
   * @param {string} replicaId - Replica ID.
   * @return {string} The database file path.
   */
  getPartitionDbPath(partitionId, replicaId) {
    if (!partitionId || !replicaId) {
      throw new Error('partitionId and replicaId are required');
    }
    return path.join(
      this.getPartitionsDir(),
      partitionId,
      `${replicaId}.db`,
    );
  }

  /**
   * Ensure the partition directory exists for a given partition.
   * @param {string} partitionId - Partition ID.
   */
  ensurePartitionDirExists(partitionId) {
    const partitionDir = path.join(this.getPartitionsDir(), partitionId);
    this.ensureDirectoryExists(partitionDir);
  }

  /**
   * Check if the manager has been initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }
}

/**
 * Get the database path for a partition replica.
 * Standalone function for convenience.
 * Pattern: {data-dir}/partitions/{partition-id}/{replica-id}.db
 * @param {string} dataDir - Base data directory.
 * @param {string} partitionId - Partition ID.
 * @param {string} replicaId - Replica ID.
 * @return {string} The database file path.
 */
function getPartitionDbPath(dataDir, partitionId, replicaId) {
  if (!dataDir || !partitionId || !replicaId) {
    throw new Error('dataDir, partitionId, and replicaId are required');
  }
  return path.join(dataDir, 'partitions', partitionId, `${replicaId}.db`);
}

export {DataDirectoryManager, getPartitionDbPath};
