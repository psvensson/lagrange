/**
 * Data Directory Manager - Manages persistent storage directories.
 * Handles data directory validation, creation, and path generation.
 * Requirements: 35.2, 35.3, 35.4, 35.5, 35.6, 35.7, 35.8, 35.9, 35.10
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import fs from 'fs';
import path from 'path';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { LoggingService } from '../logging/logging-service.js';
import { STORAGE_CONFIG_KEY, STORAGE_DEFAULT, STORAGE_ERROR_MSG, STORAGE_LOG_MSG, STORAGE_SUBSYSTEM } from './storage-constants.js';

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
    if (stryMutAct_9fa48("151720")) {
      {}
    } else {
      stryCov_9fa48("151720");
      this.dataDir = null;
      this.initialized = stryMutAct_9fa48("151721") ? true : (stryCov_9fa48("151721"), false);
      this.logger = null;
    }
  }

  /**
   * Get the singleton instance.
   * @return {DataDirectoryManager} The data directory manager instance.
   */
  static getInstance() {
    if (stryMutAct_9fa48("151722")) {
      {}
    } else {
      stryCov_9fa48("151722");
      if (stryMutAct_9fa48("151725") ? false : stryMutAct_9fa48("151724") ? true : stryMutAct_9fa48("151723") ? DataDirectoryManager.instance : (stryCov_9fa48("151723", "151724", "151725"), !DataDirectoryManager.instance)) {
        if (stryMutAct_9fa48("151726")) {
          {}
        } else {
          stryCov_9fa48("151726");
          DataDirectoryManager.instance = new DataDirectoryManager();
        }
      }
      return DataDirectoryManager.instance;
    }
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance() {
    if (stryMutAct_9fa48("151727")) {
      {}
    } else {
      stryCov_9fa48("151727");
      DataDirectoryManager.instance = null;
    }
  }

  /**
   * Initialize the data directory manager.
   * Creates the data directory if it doesn't exist and validates writability.
   * @throws {Error} If the data directory is not writable.
   */
  initialize() {
    if (stryMutAct_9fa48("151728")) {
      {}
    } else {
      stryCov_9fa48("151728");
      if (stryMutAct_9fa48("151730") ? false : stryMutAct_9fa48("151729") ? true : (stryCov_9fa48("151729", "151730"), this.initialized)) {
        if (stryMutAct_9fa48("151731")) {
          {}
        } else {
          stryCov_9fa48("151731");
          return;
        }
      }

      // Get logger
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(STORAGE_SUBSYSTEM) : console;

      // Get data directory from configuration
      const config = ConfigurationManager.getInstance();
      this.dataDir = stryMutAct_9fa48("151734") ? config.get(STORAGE_CONFIG_KEY.DATA_DIR) && STORAGE_DEFAULT.DATA_DIR : stryMutAct_9fa48("151733") ? false : stryMutAct_9fa48("151732") ? true : (stryCov_9fa48("151732", "151733", "151734"), config.get(STORAGE_CONFIG_KEY.DATA_DIR) || STORAGE_DEFAULT.DATA_DIR);

      // Resolve to absolute path
      this.dataDir = path.resolve(this.dataDir);

      // Create data directory if it doesn't exist
      this.ensureDirectoryExists(this.dataDir);

      // Validate directory is writable
      this.validateWritable(this.dataDir);

      // Log configured data directory
      this.logger.info(STORAGE_LOG_MSG.DATA_DIR_CONFIGURED, stryMutAct_9fa48("151735") ? {} : (stryCov_9fa48("151735"), {
        dataDir: this.dataDir
      }));
      this.initialized = stryMutAct_9fa48("151736") ? false : (stryCov_9fa48("151736"), true);
    }
  }

  /**
   * Ensure a directory exists, creating it if necessary.
   * @param {string} dirPath - Directory path to ensure exists.
   * @throws {Error} If directory cannot be created.
   * @private
   */
  ensureDirectoryExists(dirPath) {
    if (stryMutAct_9fa48("151737")) {
      {}
    } else {
      stryCov_9fa48("151737");
      try {
        if (stryMutAct_9fa48("151738")) {
          {}
        } else {
          stryCov_9fa48("151738");
          if (stryMutAct_9fa48("151741") ? false : stryMutAct_9fa48("151740") ? true : stryMutAct_9fa48("151739") ? fs.existsSync(dirPath) : (stryCov_9fa48("151739", "151740", "151741"), !fs.existsSync(dirPath))) {
            if (stryMutAct_9fa48("151742")) {
              {}
            } else {
              stryCov_9fa48("151742");
              fs.mkdirSync(dirPath, stryMutAct_9fa48("151743") ? {} : (stryCov_9fa48("151743"), {
                recursive: stryMutAct_9fa48("151744") ? false : (stryCov_9fa48("151744"), true)
              }));
              this.logger.debug(STORAGE_LOG_MSG.CREATED_DIRECTORY, stryMutAct_9fa48("151745") ? {} : (stryCov_9fa48("151745"), {
                path: dirPath
              }));
            }
          }
        }
      } catch (error) {
        if (stryMutAct_9fa48("151746")) {
          {}
        } else {
          stryCov_9fa48("151746");
          throw new Error(stryMutAct_9fa48("151747") ? `` : (stryCov_9fa48("151747"), `Failed to create data directory '${dirPath}': ${error.message}`));
        }
      }
    }
  }

  /**
   * Validate that a directory is writable.
   * @param {string} dirPath - Directory path to validate.
   * @throws {Error} If directory is not writable.
   * @private
   */
  validateWritable(dirPath) {
    if (stryMutAct_9fa48("151748")) {
      {}
    } else {
      stryCov_9fa48("151748");
      const testFile = path.join(dirPath, STORAGE_DEFAULT.WRITE_TEST_FILENAME);
      try {
        if (stryMutAct_9fa48("151749")) {
          {}
        } else {
          stryCov_9fa48("151749");
          fs.writeFileSync(testFile, STORAGE_DEFAULT.WRITE_TEST_CONTENT);
          fs.unlinkSync(testFile);
        }
      } catch (error) {
        if (stryMutAct_9fa48("151750")) {
          {}
        } else {
          stryCov_9fa48("151750");
          throw new Error(stryMutAct_9fa48("151751") ? `` : (stryCov_9fa48("151751"), `Data directory '${dirPath}' is not writable: ${error.message}`));
        }
      }
    }
  }

  /**
   * Get the configured data directory.
   * @return {string} The data directory path.
   */
  getDataDir() {
    if (stryMutAct_9fa48("151752")) {
      {}
    } else {
      stryCov_9fa48("151752");
      if (stryMutAct_9fa48("151755") ? false : stryMutAct_9fa48("151754") ? true : stryMutAct_9fa48("151753") ? this.initialized : (stryCov_9fa48("151753", "151754", "151755"), !this.initialized)) {
        if (stryMutAct_9fa48("151756")) {
          {}
        } else {
          stryCov_9fa48("151756");
          throw new Error(STORAGE_ERROR_MSG.NOT_INITIALIZED);
        }
      }
      return this.dataDir;
    }
  }

  /**
   * Get the partitions directory path.
   * @return {string} The partitions directory path.
   */
  getPartitionsDir() {
    if (stryMutAct_9fa48("151757")) {
      {}
    } else {
      stryCov_9fa48("151757");
      return path.join(this.getDataDir(), STORAGE_DEFAULT.PARTITIONS_DIRNAME);
    }
  }

  /**
   * Get the database path for a partition replica.
   * Pattern: {data-dir}/partitions/{partition-id}/{replica-id}.db
   * @param {string} partitionId - Partition ID.
   * @param {string} replicaId - Replica ID.
   * @return {string} The database file path.
   */
  getPartitionDbPath(partitionId, replicaId) {
    if (stryMutAct_9fa48("151758")) {
      {}
    } else {
      stryCov_9fa48("151758");
      if (stryMutAct_9fa48("151761") ? !partitionId && !replicaId : stryMutAct_9fa48("151760") ? false : stryMutAct_9fa48("151759") ? true : (stryCov_9fa48("151759", "151760", "151761"), (stryMutAct_9fa48("151762") ? partitionId : (stryCov_9fa48("151762"), !partitionId)) || (stryMutAct_9fa48("151763") ? replicaId : (stryCov_9fa48("151763"), !replicaId)))) {
        if (stryMutAct_9fa48("151764")) {
          {}
        } else {
          stryCov_9fa48("151764");
          throw new Error(STORAGE_ERROR_MSG.MISSING_PARTITION_REPLICA_ID);
        }
      }
      return path.join(this.getPartitionsDir(), partitionId, stryMutAct_9fa48("151765") ? `` : (stryCov_9fa48("151765"), `${replicaId}${STORAGE_DEFAULT.DB_EXT}`));
    }
  }

  /**
   * Ensure the partition directory exists for a given partition.
   * @param {string} partitionId - Partition ID.
   */
  ensurePartitionDirExists(partitionId) {
    if (stryMutAct_9fa48("151766")) {
      {}
    } else {
      stryCov_9fa48("151766");
      const partitionDir = path.join(this.getPartitionsDir(), partitionId);
      this.ensureDirectoryExists(partitionDir);
    }
  }

  /**
   * Check if the manager has been initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    if (stryMutAct_9fa48("151767")) {
      {}
    } else {
      stryCov_9fa48("151767");
      return this.initialized;
    }
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
  if (stryMutAct_9fa48("151768")) {
    {}
  } else {
    stryCov_9fa48("151768");
    if (stryMutAct_9fa48("151771") ? (!dataDir || !partitionId) && !replicaId : stryMutAct_9fa48("151770") ? false : stryMutAct_9fa48("151769") ? true : (stryCov_9fa48("151769", "151770", "151771"), (stryMutAct_9fa48("151773") ? !dataDir && !partitionId : stryMutAct_9fa48("151772") ? false : (stryCov_9fa48("151772", "151773"), (stryMutAct_9fa48("151774") ? dataDir : (stryCov_9fa48("151774"), !dataDir)) || (stryMutAct_9fa48("151775") ? partitionId : (stryCov_9fa48("151775"), !partitionId)))) || (stryMutAct_9fa48("151776") ? replicaId : (stryCov_9fa48("151776"), !replicaId)))) {
      if (stryMutAct_9fa48("151777")) {
        {}
      } else {
        stryCov_9fa48("151777");
        throw new Error(STORAGE_ERROR_MSG.MISSING_DATA_DIR_PARTITION_REPLICA_ID);
      }
    }
    return path.join(dataDir, STORAGE_DEFAULT.PARTITIONS_DIRNAME, partitionId, stryMutAct_9fa48("151778") ? `` : (stryCov_9fa48("151778"), `${replicaId}${STORAGE_DEFAULT.DB_EXT}`));
  }
}
export { DataDirectoryManager, getPartitionDbPath };