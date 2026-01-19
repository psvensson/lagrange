/**
 * Configuration Manager - Centralized configuration system.
 * Provides symbolic names for all constants and validates configuration at startup.
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import Ajv from 'ajv';
import {v4 as uuidv4} from 'uuid';
import os from 'os';

/**
 * JSON Schema for configuration validation.
 */
const CONFIG_SCHEMA = {
  type: 'object',
  properties: {
    node: {
      type: 'object',
      properties: {
        id: {type: 'string', minLength: 1},
        address: {type: 'string'},
        heartbeatIntervalMs: {type: 'number', minimum: 100},
        heartbeatTimeoutMs: {type: 'number', minimum: 500},
        statsCollectionIntervalMs: {type: 'number', minimum: 1000},
        maxServicesPerNode: {type: 'number', minimum: 1},
        restApiPort: {type: 'number', minimum: 1, maximum: 65535},
        seedNodeAddress: {type: 'string'},
      },
      required: ['id'],
      additionalProperties: false,
    },
    raft: {
      type: 'object',
      properties: {
        electionTimeoutMinMs: {type: 'number', minimum: 100},
        electionTimeoutMaxMs: {type: 'number', minimum: 200},
        heartbeatIntervalMs: {type: 'number', minimum: 10},
        snapshotThreshold: {type: 'number', minimum: 100},
        maxLogEntriesPerAppend: {type: 'number', minimum: 1},
        leadershipWaitTimeoutMs: {type: 'number', minimum: 1000},
        leadershipWaitBackoffMs: {type: 'number', minimum: 100},
      },
      additionalProperties: false,
    },
    messageGroup: {
      type: 'object',
      properties: {
        replicaCount: {type: 'number', minimum: 3},
        deliveryTimeoutMs: {type: 'number', minimum: 100},
        retryMaxAttempts: {type: 'number', minimum: 1},
        retryInitialDelayMs: {type: 'number', minimum: 10},
        retryBackoffMultiplier: {type: 'number', minimum: 1},
        retryMaxDelayMs: {type: 'number', minimum: 100},
        retryJitterFactor: {type: 'number', minimum: 0, maximum: 1},
        cdcBufferSize: {type: 'number', minimum: 1},
        cdcFlushIntervalMs: {type: 'number', minimum: 100},
        cacheTtlMs: {type: 'number', minimum: 1000},
      },
      additionalProperties: false,
    },
    partition: {
      type: 'object',
      properties: {
        defaultReplicaCount: {type: 'number', minimum: 3},
        splitThresholdBytes: {type: 'number', minimum: 1048576},
        splitThresholdQpm: {type: 'number', minimum: 1},
        mergeThresholdBytes: {type: 'number', minimum: 1048576},
        mergeThresholdQpm: {type: 'number', minimum: 1},
        evaluationIntervalMs: {type: 'number', minimum: 60000},
        sizeUpdateDebounceMs: {type: 'number', minimum: 1000},
        sizeUpdateIntervalMs: {type: 'number', minimum: 10000},
      },
      additionalProperties: false,
    },
    logging: {
      type: 'object',
      properties: {
        level: {type: 'string', enum: ['trace', 'debug', 'info', 'warn', 'error', 'fatal']},
        prettyPrint: {type: 'boolean'},
        bufferSize: {type: 'number', minimum: 1},
        flushIntervalMs: {type: 'number', minimum: 100},
        retentionDays: {type: 'number', minimum: 1},
        maxFileSizeBytes: {type: 'number', minimum: 1048576},
      },
      additionalProperties: false,
    },
    timeout: {
      type: 'object',
      properties: {
        bootstrapTotalMs: {type: 'number', minimum: 5000},
        serviceStartMs: {type: 'number', minimum: 1000},
        serviceStopMs: {type: 'number', minimum: 1000},
        raftJoinMs: {type: 'number', minimum: 1000},
        queryExecutionMs: {type: 'number', minimum: 1000},
        transactionMs: {type: 'number', minimum: 1000},
        websocketConnectMs: {type: 'number', minimum: 1000},
        httpRequestMs: {type: 'number', minimum: 1000},
      },
      additionalProperties: false,
    },
    worker: {
      type: 'object',
      properties: {
        minThreads: {type: 'number', minimum: 1},
        maxThreads: {type: 'number', minimum: 1},
        idleTimeoutMs: {type: 'number', minimum: 1000},
        taskQueueSize: {type: 'number', minimum: 1},
      },
      additionalProperties: false,
    },
    hlc: {
      type: 'object',
      properties: {
        maxDriftMs: {type: 'number', minimum: 1},
        maxLogicalCounter: {type: 'number', minimum: 1},
        driftCheckIntervalMs: {type: 'number', minimum: 1000},
        syncOnStartup: {type: 'boolean'},
      },
      additionalProperties: false,
    },
    rebalancer: {
      type: 'object',
      properties: {
        periodicCheckIntervalMs: {type: 'number', minimum: 1000},
        periodicCheckJitterMs: {type: 'number', minimum: 100},
        criticalCheckDelayMs: {type: 'number', minimum: 100},
        maxConcurrentMoves: {type: 'number', minimum: 1},
        moveTimeoutMs: {type: 'number', minimum: 10000},
        nodeCpuThreshold: {type: 'number', minimum: 0, maximum: 1},
        nodeMemoryThreshold: {type: 'number', minimum: 0, maximum: 1},
        nodeDiskThreshold: {type: 'number', minimum: 0, maximum: 1},
      },
      additionalProperties: false,
    },
    queryCoordinator: {
      type: 'object',
      properties: {
        maxParallelPartitions: {type: 'number', minimum: 1, maximum: 10000},
        maxConcurrentConnections: {type: 'number', minimum: 1, maximum: 10000},
        maxResultBufferBytes: {type: 'number', minimum: 1048576},
        queryTimeoutMs: {type: 'number', minimum: 1000},
        stragglerThresholdMultiplier: {type: 'number', minimum: 1.5},
        speculativeExecutionEnabled: {type: 'boolean'},
        speculativeExecutionDelayMs: {type: 'number', minimum: 10},
        streamingEnabled: {type: 'boolean'},
        streamingChunkSize: {type: 'number', minimum: 100},
      },
      additionalProperties: false,
    },
    storage: {
      type: 'object',
      properties: {
        dataDir: {type: 'string', minLength: 1},
      },
      additionalProperties: false,
    },
    admin: {
      type: 'object',
      properties: {
        websocketPort: {type: 'number', minimum: 1, maximum: 65535},
        queryTimeoutMs: {type: 'number', minimum: 1000},
        cacheDumpTimeoutMs: {type: 'number', minimum: 1000},
      },
      additionalProperties: false,
    },
  },
  required: ['node'],
  additionalProperties: false,
};

/**
 * Default configuration values.
 */
const DEFAULT_CONFIG = {
  node: {
    id: '',
    address: '',
    heartbeatIntervalMs: 1000,
    heartbeatTimeoutMs: 5000,
    statsCollectionIntervalMs: 10000,
    maxServicesPerNode: 100,
    restApiPort: 8080,
    seedNodeAddress: '',
  },
  raft: {
    electionTimeoutMinMs: 150,
    electionTimeoutMaxMs: 300,
    heartbeatIntervalMs: 50,
    snapshotThreshold: 10000,
    maxLogEntriesPerAppend: 100,
    leadershipWaitTimeoutMs: 30000,
    leadershipWaitBackoffMs: 100,
  },
  messageGroup: {
    replicaCount: 3,
    deliveryTimeoutMs: 5000,
    retryMaxAttempts: 3,
    retryInitialDelayMs: 100,
    retryBackoffMultiplier: 2,
    retryMaxDelayMs: 10000,
    retryJitterFactor: 0.1,
    cdcBufferSize: 100,
    cdcFlushIntervalMs: 1000,
    cacheTtlMs: 30000,
  },
  partition: {
    defaultReplicaCount: 3,
    splitThresholdBytes: 10737418240, // 10GB
    splitThresholdQpm: 1000,
    mergeThresholdBytes: 2147483648, // 2GB
    mergeThresholdQpm: 200,
    evaluationIntervalMs: 300000, // 5 minutes
    sizeUpdateDebounceMs: 5000,
    sizeUpdateIntervalMs: 60000,
  },
  logging: {
    level: 'info',
    prettyPrint: false,
    bufferSize: 1000,
    flushIntervalMs: 5000,
    retentionDays: 7,
    maxFileSizeBytes: 104857600, // 100MB
  },
  timeout: {
    bootstrapTotalMs: 30000,
    serviceStartMs: 10000,
    serviceStopMs: 5000,
    raftJoinMs: 10000,
    queryExecutionMs: 30000,
    transactionMs: 60000,
    websocketConnectMs: 5000,
    httpRequestMs: 10000,
  },
  worker: {
    minThreads: 2,
    maxThreads: os.cpus().length,
    idleTimeoutMs: 30000,
    taskQueueSize: 1000,
  },
  hlc: {
    maxDriftMs: 500,
    maxLogicalCounter: 65535,
    driftCheckIntervalMs: 60000,
    syncOnStartup: true,
  },
  rebalancer: {
    periodicCheckIntervalMs: 60000, // 1 minute
    periodicCheckJitterMs: 10000, // ±10 seconds
    criticalCheckDelayMs: 5000, // 5 seconds delay for critical events
    maxConcurrentMoves: 5, // Max concurrent replica moves
    moveTimeoutMs: 300000, // 5 minutes timeout per move
    nodeCpuThreshold: 0.8, // 80% CPU threshold
    nodeMemoryThreshold: 0.8, // 80% memory threshold
    nodeDiskThreshold: 0.9, // 90% disk threshold
  },
  queryCoordinator: {
    maxParallelPartitions: 1000, // Max partitions per query (Req 26.2)
    maxConcurrentConnections: 10000, // Max concurrent connections (Req 26.8)
    maxResultBufferBytes: 1073741824, // 1GB result buffer limit (Req 26.3)
    queryTimeoutMs: 30000, // 30 second query timeout (Req 26.12)
    stragglerThresholdMultiplier: 2.0, // 2x median latency (Req 26.10)
    speculativeExecutionEnabled: true, // Enable speculative execution (Req 26.11)
    speculativeExecutionDelayMs: 100, // Delay before speculative execution
    streamingEnabled: true, // Enable streaming aggregation (Req 26.9)
    streamingChunkSize: 1000, // Rows per streaming chunk
  },
  storage: {
    dataDir: './data', // Default data directory (Req 35.3)
  },
  admin: {
    websocketPort: 8081, // Admin WebSocket API port
    queryTimeoutMs: 30000, // Query timeout (30 seconds)
    cacheDumpTimeoutMs: 5000, // Cache dump timeout (5 seconds)
  },
};

/**
 * Environment variable mappings.
 * Maps environment variable names to configuration paths.
 */
const ENV_MAPPINGS = {
  NODE_ID: 'node.id',
  NODE_ADDRESS: 'node.address',
  REST_API_PORT: 'node.restApiPort',
  LOG_LEVEL: 'logging.level',
  LOG_PRETTY_PRINT: 'logging.prettyPrint',
  SEED_NODE_ADDRESS: 'node.seedNodeAddress',
  RAFT_ELECTION_TIMEOUT_MIN_MS: 'raft.electionTimeoutMinMs',
  RAFT_ELECTION_TIMEOUT_MAX_MS: 'raft.electionTimeoutMaxMs',
  RAFT_HEARTBEAT_INTERVAL_MS: 'raft.heartbeatIntervalMs',
  MESSAGE_GROUP_REPLICA_COUNT: 'messageGroup.replicaCount',
  PARTITION_DEFAULT_REPLICA_COUNT: 'partition.defaultReplicaCount',
  WORKER_MIN_THREADS: 'worker.minThreads',
  WORKER_MAX_THREADS: 'worker.maxThreads',
  DATA_DIR: 'storage.dataDir',
  ADMIN_WEBSOCKET_PORT: 'admin.websocketPort',
};

/**
 * ConfigurationManager singleton class.
 * Provides centralized configuration management with validation.
 */
class ConfigurationManager {
  static instance = null;

  /**
   * Create a new ConfigurationManager instance.
   * @private
   */
  constructor() {
    this.config = this.deepClone(DEFAULT_CONFIG);
    this.ajv = new Ajv({allErrors: true, strict: false});
    this.validate = this.ajv.compile(CONFIG_SCHEMA);
    this.initialized = false;
  }

  /**
   * Get the singleton instance.
   * @return {ConfigurationManager} The configuration manager instance.
   */
  static getInstance() {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance() {
    ConfigurationManager.instance = null;
  }

  /**
   * Initialize the configuration manager.
   * Loads environment variables and validates configuration.
   * @param {Object} overrides - Optional configuration overrides.
   * @throws {Error} If configuration validation fails.
   */
  initialize(overrides = {}) {
    // Load environment variables
    this.loadEnvironmentVariables();

    // Apply overrides
    this.applyOverrides(overrides);

    // Generate node ID if not provided
    if (!this.config.node.id) {
      this.config.node.id = uuidv4();
    }

    // Validate configuration
    const valid = this.validate(this.config);
    if (!valid) {
      const errors = this.validate.errors
        .map((e) => `${e.instancePath} ${e.message}`)
        .join(', ');
      throw new Error(`Configuration validation failed: ${errors}`);
    }

    this.initialized = true;
  }

  /**
   * Load configuration from environment variables.
   * @private
   */
  loadEnvironmentVariables() {
    for (const [envVar, configPath] of Object.entries(ENV_MAPPINGS)) {
      const value = process.env[envVar];
      if (value !== undefined) {
        this.setByPath(configPath, this.parseEnvValue(value, configPath));
      }
    }
  }

  /**
   * Parse an environment variable value to the appropriate type.
   * @param {string} value - The environment variable value.
   * @param {string} path - The configuration path.
   * @return {*} The parsed value.
   * @private
   */
  parseEnvValue(value, path) {
    // Determine expected type from default config
    const defaultValue = this.getByPath(path, DEFAULT_CONFIG);

    if (typeof defaultValue === 'number') {
      const parsed = Number(value);
      if (isNaN(parsed)) {
        throw new Error(`Invalid number value for ${path}: ${value}`);
      }
      return parsed;
    }

    if (typeof defaultValue === 'boolean') {
      return value.toLowerCase() === 'true' || value === '1';
    }

    return value;
  }

  /**
   * Apply configuration overrides.
   * @param {Object} overrides - Configuration overrides.
   * @private
   */
  applyOverrides(overrides) {
    this.deepMerge(this.config, overrides);
  }

  /**
   * Get a configuration value by path.
   * @param {string} path - Dot-separated path (e.g., 'node.id').
   * @param {Object} obj - Object to get value from (defaults to config).
   * @return {*} The configuration value.
   */
  get(path, obj = this.config) {
    return this.getByPath(path, obj);
  }

  /**
   * Get a configuration value by path.
   * @param {string} path - Dot-separated path.
   * @param {Object} obj - Object to get value from.
   * @return {*} The value at the path.
   * @private
   */
  getByPath(path, obj) {
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === undefined || current === null) {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  /**
   * Set a configuration value by path.
   * @param {string} path - Dot-separated path.
   * @param {*} value - The value to set.
   * @private
   */
  setByPath(path, value) {
    const parts = path.split('.');
    let current = this.config;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part];
    }

    current[parts[parts.length - 1]] = value;
  }

  /**
   * Get all configuration values for a category.
   * @param {string} category - The configuration category.
   * @return {Object} The category configuration.
   */
  getCategory(category) {
    return this.deepClone(this.config[category] || {});
  }

  /**
   * Get all configuration values.
   * @return {Object} The complete configuration.
   */
  getAll() {
    return this.deepClone(this.config);
  }

  /**
   * Check if the configuration manager has been initialized.
   * @return {boolean} True if initialized.
   */
  isInitialized() {
    return this.initialized;
  }

  /**
   * Get the list of configuration categories.
   * @return {string[]} Array of category names.
   */
  getCategories() {
    return Object.keys(this.config);
  }

  /**
   * Get the default value for a configuration path.
   * @param {string} path - Dot-separated path.
   * @return {*} The default value.
   */
  getDefault(path) {
    return this.getByPath(path, DEFAULT_CONFIG);
  }

  /**
   * Deep clone an object.
   * @param {Object} obj - Object to clone.
   * @return {Object} Cloned object.
   * @private
   */
  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Deep merge source into target.
   * @param {Object} target - Target object.
   * @param {Object} source - Source object.
   * @private
   */
  deepMerge(target, source) {
    for (const key of Object.keys(source)) {
      if (
        source[key] !== null &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key])
      ) {
        if (!(key in target)) {
          target[key] = {};
        }
        this.deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }
}

export {ConfigurationManager, CONFIG_SCHEMA, DEFAULT_CONFIG, ENV_MAPPINGS};
