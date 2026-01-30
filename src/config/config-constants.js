import os from 'os';
import {COLUMN, NUM, STRING, TYPEOF} from '../constants/index.js';

const CONFIG_CATEGORY = Object.freeze({
  RAFT: 'raft',
  MESSAGE_GROUP: 'messageGroup',
  PARTITION: 'partition',
  LOGGING: 'logging',
  NODE: 'node',
  CONTROL_PLANE: 'controlPlane',
});

const CONFIG_SUBSYSTEM = Object.freeze({
  DYNAMIC_CONFIG: 'dynamic-config',
});

const CONFIG_EVENT = Object.freeze({
  CHANGE: 'change',
  DELETE: 'delete',
});

const CONFIG_VALUE_TYPE = Object.freeze({
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  JSON: 'json',
});

const CONFIG_SEED_SOURCE = Object.freeze({
  SYSTEM: 'system',
});

const CONFIG_SEPARATOR = Object.freeze({
  COMMA_SPACE: ', ',
  DOT: '.',
  UNDERSCORE: '_',
  COLON_SPACE: ': ',
});

const CONFIG_ENV = Object.freeze({
  UPDATED_BY_SYSTEM: 'system',
  UPDATED_BY_UNKNOWN: 'unknown',
  TRUE: 'true',
  FALSE: 'false',
  ONE: '1',
});

const CONFIG_ENV_REGEX = Object.freeze({
  DOT: /\./g,
  CAMEL_CASE: /([a-z])([A-Z])/g,
});

const CONFIG_ENV_REPLACE = Object.freeze({
  CAMEL_CASE: '$1_$2',
});

const CONFIG_KEY_FRAGMENT = Object.freeze({
  THRESHOLD: 'Threshold',
});

const CONFIG_LOG_LEVELS = Object.freeze({
  VALUES: Object.freeze(['trace', 'debug', 'info', 'warn', 'error', 'fatal']),
});

const CONFIG_LOG_MSG = Object.freeze({
  INITIALIZED: 'Dynamic configuration service initialized',
  SEEDING_COMPLETE: 'Configuration seeding complete',
  UPDATED: 'Configuration updated',
  WATCHER_REGISTERED: 'Configuration watcher registered',
  WATCHER_CALLBACK_FAILED: 'Configuration watcher callback failed',
});

const CONFIG_ERROR_MSG = Object.freeze({
  SYSTEM_TABLE_CACHE_REQUIRED: 'DynamicConfigService requires systemTableCache',
  CDC_UNAVAILABLE: 'CDC integration service not available',
  INVALID_VALUE_PREFIX: 'Invalid configuration value: ',
  EXPECTED_STRING_PREFIX: 'Expected string, got ',
  EXPECTED_NUMBER_PREFIX: 'Expected number, got ',
  EXPECTED_BOOLEAN_PREFIX: 'Expected boolean, got ',
  EXPECTED_OBJECT_PREFIX: 'Expected object, got ',
  NON_NEGATIVE_REQUIRED: 'Value must be non-negative',
  LOG_LEVEL_INVALID_PREFIX: 'Invalid log level. Must be one of: ',
  VALIDATION_FAILED_PREFIX: 'Configuration validation failed: ',
  INVALID_NUMBER_PREFIX: 'Invalid number value for ',
});

const CONFIG_STATS_DEFAULT = Object.freeze({
  reads: NUM.ZERO,
  writes: NUM.ZERO,
  watcherNotifications: NUM.ZERO,
});

const CONFIG_TABLE_COLUMN = Object.freeze({
  KEY: COLUMN.CONFIG_KEY,
  VALUE: COLUMN.CONFIG_VALUE,
  VALUE_TYPE: COLUMN.VALUE_TYPE,
  REQUIRES_RESTART: COLUMN.REQUIRES_RESTART,
  DESCRIPTION: COLUMN.DESCRIPTION,
  DEFAULT_VALUE: COLUMN.DEFAULT_VALUE,
  UPDATED_BY: COLUMN.UPDATED_BY,
  UPDATED_AT: COLUMN.UPDATED_AT,
  CREATED_AT: COLUMN.CREATED_AT,
});

const CONFIG_VALUE_DEFAULT = Object.freeze({
  EMPTY_OBJECT: Object.freeze({}),
});

// Canonical string keys for configuration settings. Prefer these over ad-hoc
// string literals so config access is consistent across the codebase.
const CONFIG_KEY = Object.freeze({
  NODE_ID: 'node.id',
  NODE_HEARTBEAT_INTERVAL_MS: 'node.heartbeatIntervalMs',
  NODE_HEARTBEAT_TIMEOUT_MS: 'node.heartbeatTimeoutMs',
  NODE_STATS_COLLECTION_INTERVAL_MS: 'node.statsCollectionIntervalMs',
  NODE_MAX_SERVICES_PER_NODE: 'node.maxServicesPerNode',
  NODE_REST_API_PORT: 'node.restApiPort',
  NODE_WS_PORT: 'node.wsPort',
  NODE_FAILURE_DETECTION_INTERVAL_MS: 'node.failureDetectionIntervalMs',
  NODE_ADDRESS: 'node.address',
  NODE_SEED_NODE_ADDRESS: 'node.seedNodeAddress',
  NODE_SEED_NODE_WS_ADDRESS: 'node.seedNodeWsAddress',

  RAFT_ELECTION_TIMEOUT_MIN_MS: 'raft.electionTimeoutMinMs',
  RAFT_ELECTION_TIMEOUT_MAX_MS: 'raft.electionTimeoutMaxMs',
  RAFT_HEARTBEAT_INTERVAL_MS: 'raft.heartbeatIntervalMs',

  MESSAGE_GROUP_REPLICA_COUNT: 'messageGroup.replicaCount',
  MESSAGE_GROUP_DELIVERY_TIMEOUT_MS: 'messageGroup.deliveryTimeoutMs',
  MESSAGE_GROUP_RETRY_MAX_ATTEMPTS: 'messageGroup.retryMaxAttempts',
  MESSAGE_GROUP_RETRY_INITIAL_DELAY_MS: 'messageGroup.retryInitialDelayMs',
  MESSAGE_GROUP_RETRY_MAX_DELAY_MS: 'messageGroup.retryMaxDelayMs',
  MESSAGE_GROUP_RETRY_BACKOFF_MULTIPLIER: 'messageGroup.retryBackoffMultiplier',
  MESSAGE_GROUP_RETRY_JITTER_FACTOR: 'messageGroup.retryJitterFactor',
  MESSAGE_GROUP_CACHE_TTL_MS: 'messageGroup.cacheTtlMs',
  MESSAGE_GROUP_CDC_BUFFER_SIZE: 'messageGroup.cdcBufferSize',
  MESSAGE_GROUP_CDC_FLUSH_INTERVAL_MS: 'messageGroup.cdcFlushIntervalMs',

  PARTITION_DEFAULT_REPLICA_COUNT: 'partition.defaultReplicaCount',
  PARTITION_SIZE_UPDATE_DEBOUNCE_MS: 'partition.sizeUpdateDebounceMs',
  PARTITION_SIZE_UPDATE_INTERVAL_MS: 'partition.sizeUpdateIntervalMs',
  PARTITION_SPLIT_THRESHOLD_BYTES: 'partition.splitThresholdBytes',
  PARTITION_SPLIT_THRESHOLD_QPM: 'partition.splitThresholdQpm',
  PARTITION_MERGE_THRESHOLD_BYTES: 'partition.mergeThresholdBytes',
  PARTITION_MERGE_THRESHOLD_QPM: 'partition.mergeThresholdQpm',
  PARTITION_EVALUATION_INTERVAL_MS: 'partition.evaluationIntervalMs',

  LOGGING_LEVEL: 'logging.level',
  LOGGING_RETENTION_DAYS: 'logging.retentionDays',
  LOGGING_PRETTY_PRINT: 'logging.prettyPrint',
  LOGGING_BUFFER_SIZE: 'logging.bufferSize',
  LOGGING_BATCH_SIZE: 'logging.batchSize',
  LOGGING_FLUSH_INTERVAL_MS: 'logging.flushIntervalMs',
  LOGGING_MAX_RETRIES: 'logging.maxRetries',
  LOGGING_RETRY_DELAY_MS: 'logging.retryDelayMs',
  LOGGING_QUERY_DEFAULT_LIMIT: 'logging.queryDefaultLimit',
  LOGGING_QUERY_MAX_LIMIT: 'logging.queryMaxLimit',
  LOGGING_DEFAULT_TIME_RANGE_MS: 'logging.defaultTimeRangeMs',
  LOGGING_RETENTION_PERIOD_MS: 'logging.retentionPeriodMs',
  LOGGING_CLEANUP_INTERVAL_MS: 'logging.cleanupIntervalMs',
  LOGGING_CLEANUP_BATCH_SIZE: 'logging.cleanupBatchSize',
  LOGGING_MAX_DELETES_PER_RUN: 'logging.maxDeletesPerRun',

  REBALANCER_PERIODIC_CHECK_INTERVAL_MS: 'rebalancer.periodicCheckIntervalMs',
  REBALANCER_MAX_CONCURRENT_MOVES: 'rebalancer.maxConcurrentMoves',

  QUERY_TIMEOUT_MS: 'query.timeoutMs',
  QUERY_MAX_PARALLEL_PARTITIONS: 'query.maxParallelPartitions',
  QUERY_LEADER_RETRY_ATTEMPTS: 'query.leaderRetryAttempts',
  QUERY_LEADER_RETRY_DELAY_MS: 'query.leaderRetryDelayMs',
  QUERY_COORDINATOR_MAX_PARALLEL_PARTITIONS: 'queryCoordinator.maxParallelPartitions',
  QUERY_COORDINATOR_MAX_CONCURRENT_CONNECTIONS: 'queryCoordinator.maxConcurrentConnections',
  QUERY_COORDINATOR_MAX_RESULT_BUFFER_BYTES: 'queryCoordinator.maxResultBufferBytes',
  QUERY_COORDINATOR_QUERY_TIMEOUT_MS: 'queryCoordinator.queryTimeoutMs',
  QUERY_COORDINATOR_STRAGGLER_THRESHOLD_MULTIPLIER: 'queryCoordinator.stragglerThresholdMultiplier',
  QUERY_COORDINATOR_SPECULATIVE_EXECUTION_ENABLED: 'queryCoordinator.speculativeExecutionEnabled',
  QUERY_COORDINATOR_SPECULATIVE_EXECUTION_DELAY_MS: 'queryCoordinator.speculativeExecutionDelayMs',
  QUERY_COORDINATOR_STREAMING_ENABLED: 'queryCoordinator.streamingEnabled',
  QUERY_COORDINATOR_STREAMING_CHUNK_SIZE: 'queryCoordinator.streamingChunkSize',

  INDEX_DEFAULT_TYPE: 'index.defaultType',

  LIVE_QUERY_DEFAULT_TTL_MS: 'liveQuery.defaultTtlMs',
  LIVE_QUERY_MAX_PER_CLIENT: 'liveQuery.maxPerClient',
  LIVE_QUERY_CLEANUP_INTERVAL_MS: 'liveQuery.cleanupIntervalMs',
  LIVE_QUERY_CURSOR_RETENTION_MS: 'liveQuery.cursorRetentionMs',

  CONTROL_PLANE_READY_LEASE_MS: 'controlPlane.readyLeaseMs',
  CONTROL_PLANE_HEARTBEAT_INTERVAL_MS: 'controlPlane.heartbeatIntervalMs',
  CONTROL_PLANE_LEASE_SWEEP_INTERVAL_MS: 'controlPlane.leaseSweepIntervalMs',

  HLC_MAX_DRIFT_MS: 'hlc.maxDriftMs',
  HLC_MAX_LOGICAL_COUNTER: 'hlc.maxLogicalCounter',

  WORKER_MIN_THREADS: 'worker.minThreads',
  WORKER_MAX_THREADS: 'worker.maxThreads',
  WORKER_IDLE_TIMEOUT_MS: 'worker.idleTimeoutMs',

  STORAGE_DATA_DIR: 'storage.dataDir',

  ADMIN_WEBSOCKET_PORT: 'admin.websocketPort',
  ADMIN_QUERY_TIMEOUT_MS: 'admin.queryTimeoutMs',
  ADMIN_CACHE_DUMP_TIMEOUT_MS: 'admin.cacheDumpTimeoutMs',

  FUNCTION_QUERY_TIMEOUT_MS: 'function.queryTimeoutMs',
  FUNCTION_QUERY_BATCH_SIZE: 'function.queryBatchSize',

  POLICY_CACHE_TTL_MS: 'policy.cacheTTLMs',

  LIFECYCLE_OPERATION_TIMEOUT_MS: 'lifecycle.operationTimeoutMs',
  LIFECYCLE_SYNC_TIMEOUT_MS: 'lifecycle.syncTimeoutMs',

  REPLICA_HANDLER_SYNC_TIMEOUT_MS: 'replicaHandler.syncTimeoutMs',

  FAILURE_DETECTOR_CHECK_INTERVAL_MS: 'failureDetector.checkIntervalMs',
  FAILURE_DETECTOR_SUSPICION_THRESHOLD_MS: 'failureDetector.suspicionThresholdMs',
  FAILURE_DETECTOR_FAILURE_THRESHOLD_MS: 'failureDetector.failureThresholdMs',
  FAILURE_DETECTOR_FLAPPING_WINDOW_MS: 'failureDetector.flappingWindowMs',
  FAILURE_DETECTOR_FLAPPING_THRESHOLD: 'failureDetector.flappingThreshold',
  FAILURE_DETECTOR_ADAPTIVE_MAX_THRESHOLD_MS: 'failureDetector.adaptiveMaxThresholdMs',
  FAILURE_DETECTOR_STABILITY_PERIOD_MS: 'failureDetector.stabilityPeriodMs',

  NODE_REINTEGRATION_CHECK_INTERVAL_MS: 'nodeReintegration.checkIntervalMs',
  NODE_REINTEGRATION_DELAY_MS: 'nodeReintegration.reintegrationDelayMs',
  NODE_REINTEGRATION_HEALTH_CHECK_COUNT: 'nodeReintegration.healthCheckCount',
  NODE_REINTEGRATION_HEALTH_CHECK_INTERVAL_MS: 'nodeReintegration.healthCheckIntervalMs',

  REPLICA_RECOVERY_CHECK_INTERVAL_MS: 'replicaRecovery.checkIntervalMs',
  REPLICA_RECOVERY_MIN_PARTITION_REPLICAS: 'replicaRecovery.minPartitionReplicas',
  REPLICA_RECOVERY_MIN_MESSAGE_GROUP_REPLICAS: 'replicaRecovery.minMessageGroupReplicas',
  REPLICA_RECOVERY_DELAY_MS: 'replicaRecovery.recoveryDelayMs',
});

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
    transport: {
      type: 'object',
      properties: {
        wsHost: {type: ['string', 'null']},
        messageTimeoutMs: {type: 'number', minimum: 100},
        pingTimeoutMs: {type: 'number', minimum: 100},
        reconnectIntervalMs: {type: 'number', minimum: 100},
        reconnectMaxAttempts: {type: 'number', minimum: 1},
        pingIntervalMs: {type: 'number', minimum: 100},
        reconnectBackoffMultiplier: {type: 'number', minimum: 1},
        outboundQueueMaxConcurrent: {type: 'number', minimum: 1},
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
        stabilizationPeriodMs: {type: 'number', minimum: 1000, maximum: 10000},
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
    id: STRING.EMPTY,
    address: STRING.EMPTY,
    heartbeatIntervalMs: 1000,
    heartbeatTimeoutMs: 5000,
    statsCollectionIntervalMs: 10000,
    maxServicesPerNode: 100,
    restApiPort: 8080,
    seedNodeAddress: STRING.EMPTY,
  },
  raft: {
    electionTimeoutMinMs: 150,
    electionTimeoutMaxMs: 1000,
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
  transport: {
    wsHost: null,
    messageTimeoutMs: 5000,
    pingTimeoutMs: 1000,
    reconnectIntervalMs: 1000,
    reconnectMaxAttempts: 10,
    pingIntervalMs: 30000,
    reconnectBackoffMultiplier: 1.5,
    outboundQueueMaxConcurrent: 2,
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
    periodicCheckIntervalMs: 10000, // 10 seconds - fast checks for small clusters
    periodicCheckJitterMs: 2000, // ±2 seconds
    criticalCheckDelayMs: 1000, // 1 second delay for critical events
    maxConcurrentMoves: 5, // Max concurrent replica moves
    moveTimeoutMs: 300000, // 5 minutes timeout per move
    nodeCpuThreshold: 0.8, // 80% CPU threshold
    nodeMemoryThreshold: 0.8, // 80% memory threshold
    nodeDiskThreshold: 0.9, // 90% disk threshold
    stabilizationPeriodMs: 1000, // 1 second stabilization period (Req 2.1)
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
  NODE_ID: CONFIG_KEY.NODE_ID,
  NODE_ADDRESS: CONFIG_KEY.NODE_ADDRESS,
  REST_API_PORT: CONFIG_KEY.NODE_REST_API_PORT,
  LOG_LEVEL: CONFIG_KEY.LOGGING_LEVEL,
  LOG_PRETTY_PRINT: CONFIG_KEY.LOGGING_PRETTY_PRINT,
  SEED_NODE_ADDRESS: CONFIG_KEY.NODE_SEED_NODE_ADDRESS,
  RAFT_ELECTION_TIMEOUT_MIN_MS: CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS,
  RAFT_ELECTION_TIMEOUT_MAX_MS: CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS,
  RAFT_HEARTBEAT_INTERVAL_MS: CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS,
  MESSAGE_GROUP_REPLICA_COUNT: CONFIG_KEY.MESSAGE_GROUP_REPLICA_COUNT,
  PARTITION_DEFAULT_REPLICA_COUNT: CONFIG_KEY.PARTITION_DEFAULT_REPLICA_COUNT,
  WORKER_MIN_THREADS: CONFIG_KEY.WORKER_MIN_THREADS,
  WORKER_MAX_THREADS: CONFIG_KEY.WORKER_MAX_THREADS,
  DATA_DIR: CONFIG_KEY.STORAGE_DATA_DIR,
  ADMIN_WEBSOCKET_PORT: CONFIG_KEY.ADMIN_WEBSOCKET_PORT,
};

/**
 * Default configuration definitions with metadata.
 * Each entry defines the key, default value, type, and whether restart is required.
 */
const CONFIG_DEFINITIONS = {
  // Node configuration
  [CONFIG_KEY.NODE_HEARTBEAT_INTERVAL_MS]: {
    defaultValue: DEFAULT_CONFIG.node.heartbeatIntervalMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Interval between node heartbeats in milliseconds',
  },
  [CONFIG_KEY.NODE_HEARTBEAT_TIMEOUT_MS]: {
    defaultValue: DEFAULT_CONFIG.node.heartbeatTimeoutMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Timeout for node heartbeat detection in milliseconds',
  },
  [CONFIG_KEY.NODE_STATS_COLLECTION_INTERVAL_MS]: {
    defaultValue: DEFAULT_CONFIG.node.statsCollectionIntervalMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Interval for collecting node statistics in milliseconds',
  },
  [CONFIG_KEY.NODE_MAX_SERVICES_PER_NODE]: {
    defaultValue: DEFAULT_CONFIG.node.maxServicesPerNode,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: true,
    description: 'Maximum number of services per node',
  },
  [CONFIG_KEY.NODE_REST_API_PORT]: {
    defaultValue: DEFAULT_CONFIG.node.restApiPort,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: true,
    description: 'REST API port for node service',
  },

  // Raft configuration
  [CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS]: {
    defaultValue: DEFAULT_CONFIG.raft.electionTimeoutMinMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: true,
    description: 'Minimum election timeout in milliseconds',
  },
  [CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS]: {
    defaultValue: DEFAULT_CONFIG.raft.electionTimeoutMaxMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: true,
    description: 'Maximum election timeout in milliseconds',
  },
  [CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS]: {
    defaultValue: DEFAULT_CONFIG.raft.heartbeatIntervalMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: true,
    description: 'Raft heartbeat interval in milliseconds',
  },

  // Message group configuration
  [CONFIG_KEY.MESSAGE_GROUP_REPLICA_COUNT]: {
    defaultValue: DEFAULT_CONFIG.messageGroup.replicaCount,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: true,
    description: 'Default replica count for message groups',
  },
  [CONFIG_KEY.MESSAGE_GROUP_DELIVERY_TIMEOUT_MS]: {
    defaultValue: DEFAULT_CONFIG.messageGroup.deliveryTimeoutMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Message delivery timeout in milliseconds',
  },
  [CONFIG_KEY.MESSAGE_GROUP_RETRY_MAX_ATTEMPTS]: {
    defaultValue: DEFAULT_CONFIG.messageGroup.retryMaxAttempts,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Maximum retry attempts for message delivery',
  },
  [CONFIG_KEY.MESSAGE_GROUP_CACHE_TTL_MS]: {
    defaultValue: DEFAULT_CONFIG.messageGroup.cacheTtlMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Cache TTL in milliseconds',
  },

  // Partition configuration
  [CONFIG_KEY.PARTITION_DEFAULT_REPLICA_COUNT]: {
    defaultValue: DEFAULT_CONFIG.partition.defaultReplicaCount,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: true,
    description: 'Default replica count for partitions',
  },
  [CONFIG_KEY.PARTITION_SPLIT_THRESHOLD_BYTES]: {
    defaultValue: DEFAULT_CONFIG.partition.splitThresholdBytes,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Partition split threshold in bytes',
  },
  [CONFIG_KEY.PARTITION_SPLIT_THRESHOLD_QPM]: {
    defaultValue: DEFAULT_CONFIG.partition.splitThresholdQpm,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Partition split threshold in queries per minute',
  },
  [CONFIG_KEY.PARTITION_MERGE_THRESHOLD_BYTES]: {
    defaultValue: DEFAULT_CONFIG.partition.mergeThresholdBytes,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Partition merge threshold in bytes',
  },
  [CONFIG_KEY.PARTITION_MERGE_THRESHOLD_QPM]: {
    defaultValue: DEFAULT_CONFIG.partition.mergeThresholdQpm,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Partition merge threshold in queries per minute',
  },
  [CONFIG_KEY.PARTITION_EVALUATION_INTERVAL_MS]: {
    defaultValue: DEFAULT_CONFIG.partition.evaluationIntervalMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Partition evaluation interval in milliseconds',
  },

  // Logging configuration
  [CONFIG_KEY.LOGGING_LEVEL]: {
    defaultValue: DEFAULT_CONFIG.logging.level,
    type: CONFIG_VALUE_TYPE.STRING,
    requiresRestart: false,
    description: 'Log level (trace, debug, info, warn, error, fatal)',
  },
  [CONFIG_KEY.LOGGING_RETENTION_DAYS]: {
    defaultValue: DEFAULT_CONFIG.logging.retentionDays,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Log retention period in days',
  },

  // Rebalancer configuration
  [CONFIG_KEY.REBALANCER_PERIODIC_CHECK_INTERVAL_MS]: {
    defaultValue: DEFAULT_CONFIG.rebalancer.periodicCheckIntervalMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Rebalancer periodic check interval in milliseconds',
  },
  [CONFIG_KEY.REBALANCER_MAX_CONCURRENT_MOVES]: {
    defaultValue: DEFAULT_CONFIG.rebalancer.maxConcurrentMoves,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Maximum concurrent replica moves',
  },

  // Query coordinator configuration
  [CONFIG_KEY.QUERY_COORDINATOR_MAX_PARALLEL_PARTITIONS]: {
    defaultValue: DEFAULT_CONFIG.queryCoordinator.maxParallelPartitions,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Maximum partitions per parallel query',
  },
  [CONFIG_KEY.QUERY_COORDINATOR_QUERY_TIMEOUT_MS]: {
    defaultValue: DEFAULT_CONFIG.queryCoordinator.queryTimeoutMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Query timeout in milliseconds',
  },
  [CONFIG_KEY.QUERY_COORDINATOR_SPECULATIVE_EXECUTION_ENABLED]: {
    defaultValue: DEFAULT_CONFIG.queryCoordinator.speculativeExecutionEnabled,
    type: CONFIG_VALUE_TYPE.BOOLEAN,
    requiresRestart: false,
    description: 'Enable speculative execution for slow partitions',
  },
};

export {
  CONFIG_CATEGORY,
  CONFIG_DEFINITIONS,
  CONFIG_ENV,
  CONFIG_ENV_REGEX,
  CONFIG_ENV_REPLACE,
  CONFIG_ERROR_MSG,
  CONFIG_EVENT,
  CONFIG_KEY,
  CONFIG_KEY_FRAGMENT,
  CONFIG_LOG_LEVELS,
  CONFIG_LOG_MSG,
  CONFIG_SCHEMA,
  CONFIG_SEED_SOURCE,
  CONFIG_SEPARATOR,
  CONFIG_STATS_DEFAULT,
  CONFIG_SUBSYSTEM,
  CONFIG_TABLE_COLUMN,
  CONFIG_VALUE_DEFAULT,
  CONFIG_VALUE_TYPE,
  DEFAULT_CONFIG,
  ENV_MAPPINGS,
  STRING,
  TYPEOF,
};
