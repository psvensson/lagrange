import os from 'os';
import {COLUMN, STRING} from '../constants/index.js';
import {CONFIG_KEY} from './config-key-constants.js';
import {LATENCY_PROPAGATION_MODE} from './config-latency-constants.js';
import {CONFIG_SCHEMA} from './config-schema-constants.js';

const CONFIG_CATEGORY = Object.freeze({
  RAFT: 'raft',
  MESSAGE_GROUP: 'messageGroup',
  PARTITION: 'partition',
  LOGGING: 'logging',
  NODE: 'node',
  CONTROL_PLANE: 'controlPlane',
  LATENCY: 'latency',
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
  reads: 0,
  writes: 0,
  watcherNotifications: 0,
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
    // Wider election window reduces split-vote churn in small/developing clusters.
    electionTimeoutMinMs: 1000,
    electionTimeoutMaxMs: 3000,
    heartbeatIntervalMs: 50,
    tickIntervalMs: 20,
    adaptiveTimingEnabled: false,
    adaptiveTimingSampleIntervalMs: 5000,
    adaptiveTimingPromoteSamples: 2,
    adaptiveTimingDemoteSamples: 6,
    adaptiveTimingHighCpuPercent: 2,
    adaptiveTimingLowCpuPercent: 0.8,
    adaptiveTimingHighWriteBytesPerSec: 262144,
    adaptiveTimingLowWriteBytesPerSec: 65536,
    adaptiveTimingHighRssGrowthBytesPerMin: 10485760,
    adaptiveTimingLowRssGrowthBytesPerMin: 2097152,
    adaptiveTimingActiveHeartbeatIntervalMs: 50,
    adaptiveTimingActiveElectionTimeoutMinMs: 1000,
    adaptiveTimingActiveElectionTimeoutMaxMs: 3000,
    adaptiveTimingIdleHeartbeatIntervalMs: 150,
    adaptiveTimingIdleElectionTimeoutMinMs: 3000,
    adaptiveTimingIdleElectionTimeoutMaxMs: 5000,
    leaderActivationStabilizationMs: 250,
    leaderActivationNodeSpacingMs: 25,
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
    persistMetricsLogs: false,
    metricsDefaultResolutionMs: 30000,
    metricsDetailedWindowEnabled: false,
    metricsDetailedWindowTtlMs: 300000,
    maxFileSizeBytes: 104857600, // 100MB
  },
  transport: {
    wsHost: null,
    messageTimeoutMs: 5000,
    ackTimeoutQuarantineThreshold: 2,
    ackTimeoutQuarantineLivenessWindowMs: 30000,
    pingTimeoutMs: 1000,
    reconnectIntervalMs: 1000,
    reconnectMaxAttempts: 10,
    pingIntervalMs: 30000,
    reconnectBackoffMultiplier: 1.5,
    outboundQueueMaxConcurrent: 32,
    connectionPoolTtlMs: 300000, // 5 minutes
    connectionPoolCleanupIntervalMs: 60000, // 1 minute
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
    periodicCheckIntervalMs: 60000, // 60 seconds for calmer steady-state polling
    periodicCheckJitterMs: 10000, // ±10 seconds
    criticalCheckDelayMs: 5000, // 5 second delay for critical events
    maxConcurrentMoves: 5, // Max concurrent replica moves
    moveTimeoutMs: 300000, // 5 minutes timeout per move
    nodeCpuThreshold: 0.8, // 80% CPU threshold
    nodeMemoryThreshold: 0.8, // 80% memory threshold
    nodeDiskThreshold: 0.9, // 90% disk threshold
    stabilizationPeriodMs: 1000, // 1 second stabilization period (Req 2.1)
    systemPartitionStartDelayMs: 0, // system partitions rebalance immediately
    userPartitionStartDelayMs: 0, // user partitions can rebalance immediately
    storageSoftPressurePercent: 70,
    storageHardPressurePercent: 85,
    storageReservationTtlMs: 300000, // 5 minutes
    storageEmergencyHeadroomPercent: 5,
    minimumReplicaBytes: 1048576, // 1 MiB
    splitAmplificationFactor: 2,
    partitionReplicaOverheadBytes: 10485760, // 10 MiB
    messageGroupReplicaOverheadBytes: 1048576, // 1 MiB
    serviceReplicaOverheadBytes: 5242880, // 5 MiB
    storageAdmissionMode: 'enforce',
  },
  replicaHandler: {
    syncTimeoutMs: 60000, // 60 seconds to wait for voter-ready activation
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
    queryTimeoutMs: 30000, // Query timeout (30 seconds)
    cacheDumpTimeoutMs: 5000, // Cache dump timeout (5 seconds)
    websocketPort: 8081, // Admin WebSocket port (matches ADMIN_DEFAULT.WEBSOCKET_PORT)
  },
  latency: {
    groupThresholdMs: 100,
    recalcIntervalMs: 60000,
    recalcJitterRatio: 0.1,
    pingTimeoutMs: 1000,
    pingRetryCount: 2,
    smoothingAlpha: 0.3,
    propagationMode: LATENCY_PROPAGATION_MODE.SAFE,
  },
};

/**
 * Environment variable mappings.
 * Maps environment variable names to configuration paths.
 */
const ENV_MAPPINGS = {
  NODE_ID: CONFIG_KEY.NODE_ID,
  NODE_ADDRESS: CONFIG_KEY.NODE_ADDRESS,
  NODE_ADVERTISED_WS_ADDRESS: CONFIG_KEY.NODE_ADVERTISED_WS_ADDRESS,
  REST_API_PORT: CONFIG_KEY.NODE_REST_API_PORT,
  LOG_LEVEL: CONFIG_KEY.LOGGING_LEVEL,
  LOG_PRETTY_PRINT: CONFIG_KEY.LOGGING_PRETTY_PRINT,
  LOG_PERSIST_METRICS: CONFIG_KEY.LOGGING_PERSIST_METRICS_LOGS,
  LOG_METRICS_DEFAULT_RESOLUTION_MS:
    CONFIG_KEY.LOGGING_METRICS_DEFAULT_RESOLUTION_MS,
  LOG_METRICS_DETAILED_WINDOW_ENABLED:
    CONFIG_KEY.LOGGING_METRICS_DETAILED_WINDOW_ENABLED,
  LOG_METRICS_DETAILED_WINDOW_TTL_MS:
    CONFIG_KEY.LOGGING_METRICS_DETAILED_WINDOW_TTL_MS,
  SEED_NODE_ADDRESS: CONFIG_KEY.NODE_SEED_NODE_ADDRESS,
  TRANSPORT_WS_HOST: 'transport.wsHost',
  RAFT_ELECTION_TIMEOUT_MIN_MS: CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS,
  RAFT_ELECTION_TIMEOUT_MAX_MS: CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS,
  RAFT_HEARTBEAT_INTERVAL_MS: CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS,
  RAFT_TICK_INTERVAL_MS: CONFIG_KEY.RAFT_TICK_INTERVAL_MS,
  REBALANCER_PERIODIC_CHECK_INTERVAL_MS: CONFIG_KEY.REBALANCER_PERIODIC_CHECK_INTERVAL_MS,
  REBALANCER_MAX_CONCURRENT_MOVES: CONFIG_KEY.REBALANCER_MAX_CONCURRENT_MOVES,
  REBALANCER_SYSTEM_PARTITION_START_DELAY_MS:
    CONFIG_KEY.REBALANCER_SYSTEM_PARTITION_START_DELAY_MS,
  REBALANCER_USER_PARTITION_START_DELAY_MS:
    CONFIG_KEY.REBALANCER_USER_PARTITION_START_DELAY_MS,
  MESSAGE_GROUP_REPLICA_COUNT: CONFIG_KEY.MESSAGE_GROUP_REPLICA_COUNT,
  PARTITION_DEFAULT_REPLICA_COUNT: CONFIG_KEY.PARTITION_DEFAULT_REPLICA_COUNT,
  PARTITION_SPLIT_THRESHOLD_BYTES: CONFIG_KEY.PARTITION_SPLIT_THRESHOLD_BYTES,
  PARTITION_SPLIT_THRESHOLD_QPM: CONFIG_KEY.PARTITION_SPLIT_THRESHOLD_QPM,
  PARTITION_MERGE_THRESHOLD_BYTES: CONFIG_KEY.PARTITION_MERGE_THRESHOLD_BYTES,
  PARTITION_MERGE_THRESHOLD_QPM: CONFIG_KEY.PARTITION_MERGE_THRESHOLD_QPM,
  PARTITION_EVALUATION_INTERVAL_MS:
    CONFIG_KEY.PARTITION_EVALUATION_INTERVAL_MS,
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
    requiresRestart: false,
    description: 'Minimum election timeout in milliseconds',
  },
  [CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS]: {
    defaultValue: DEFAULT_CONFIG.raft.electionTimeoutMaxMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Maximum election timeout in milliseconds',
  },
  [CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS]: {
    defaultValue: DEFAULT_CONFIG.raft.heartbeatIntervalMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Raft heartbeat interval in milliseconds',
  },
  [CONFIG_KEY.RAFT_TICK_INTERVAL_MS]: {
    defaultValue: DEFAULT_CONFIG.raft.tickIntervalMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Raft provider tick interval in milliseconds',
  },
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ENABLED]: {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingEnabled,
    type: CONFIG_VALUE_TYPE.BOOLEAN,
    requiresRestart: false,
    description: 'Enable adaptive raft timing based on observed node load',
  },
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_SAMPLE_INTERVAL_MS]: {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingSampleIntervalMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Adaptive raft timing sampling interval in milliseconds',
  },
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_PROMOTE_SAMPLES]: {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingPromoteSamples,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Consecutive high-load samples needed to switch to active timing',
  },
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_DEMOTE_SAMPLES]: {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingDemoteSamples,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Consecutive low-load samples needed to switch to idle timing',
  },
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_HIGH_CPU_PERCENT]: {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingHighCpuPercent,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'High-load CPU threshold for adaptive raft timing',
  },
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_LOW_CPU_PERCENT]: {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingLowCpuPercent,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Low-load CPU threshold for adaptive raft timing',
  },
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_HIGH_WRITE_BYTES_PER_SEC]: {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingHighWriteBytesPerSec,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'High-load write-rate threshold for adaptive raft timing',
  },
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_LOW_WRITE_BYTES_PER_SEC]: {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingLowWriteBytesPerSec,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Low-load write-rate threshold for adaptive raft timing',
  },
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_HIGH_RSS_GROWTH_BYTES_PER_MIN]: {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingHighRssGrowthBytesPerMin,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'High-load RSS growth threshold for adaptive raft timing',
  },
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_LOW_RSS_GROWTH_BYTES_PER_MIN]: {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingLowRssGrowthBytesPerMin,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Low-load RSS growth threshold for adaptive raft timing',
  },
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ACTIVE_HEARTBEAT_INTERVAL_MS]: {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingActiveHeartbeatIntervalMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Active-profile heartbeat interval for adaptive raft timing',
  },
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ACTIVE_ELECTION_TIMEOUT_MIN_MS]: {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingActiveElectionTimeoutMinMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Active-profile minimum election timeout for adaptive raft timing',
  },
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ACTIVE_ELECTION_TIMEOUT_MAX_MS]: {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingActiveElectionTimeoutMaxMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Active-profile maximum election timeout for adaptive raft timing',
  },
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_IDLE_HEARTBEAT_INTERVAL_MS]: {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingIdleHeartbeatIntervalMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Idle-profile heartbeat interval for adaptive raft timing',
  },
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_IDLE_ELECTION_TIMEOUT_MIN_MS]: {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingIdleElectionTimeoutMinMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Idle-profile minimum election timeout for adaptive raft timing',
  },
  [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_IDLE_ELECTION_TIMEOUT_MAX_MS]: {
    defaultValue: DEFAULT_CONFIG.raft.adaptiveTimingIdleElectionTimeoutMaxMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Idle-profile maximum election timeout for adaptive raft timing',
  },
  [CONFIG_KEY.RAFT_LEADER_ACTIVATION_STABILIZATION_MS]: {
    defaultValue: DEFAULT_CONFIG.raft.leaderActivationStabilizationMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description:
      'Holdoff before leader-owned background work activates after a leader event',
  },
  [CONFIG_KEY.RAFT_LEADER_ACTIVATION_NODE_SPACING_MS]: {
    defaultValue: DEFAULT_CONFIG.raft.leaderActivationNodeSpacingMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description:
      'Minimum spacing between leader-owned activation starts on the same node',
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
  [CONFIG_KEY.LOGGING_PERSIST_METRICS_LOGS]: {
    defaultValue: DEFAULT_CONFIG.logging.persistMetricsLogs,
    type: CONFIG_VALUE_TYPE.BOOLEAN,
    requiresRestart: false,
    description: 'Persist metrics.* logs into the logs table',
  },
  [CONFIG_KEY.LOGGING_METRICS_DEFAULT_RESOLUTION_MS]: {
    defaultValue: DEFAULT_CONFIG.logging.metricsDefaultResolutionMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Default per-tag metrics sampling resolution in milliseconds',
  },
  [CONFIG_KEY.LOGGING_METRICS_DETAILED_WINDOW_ENABLED]: {
    defaultValue: DEFAULT_CONFIG.logging.metricsDetailedWindowEnabled,
    type: CONFIG_VALUE_TYPE.BOOLEAN,
    requiresRestart: false,
    description: 'Enable high-detail metrics debug window',
  },
  [CONFIG_KEY.LOGGING_METRICS_DETAILED_WINDOW_TTL_MS]: {
    defaultValue: DEFAULT_CONFIG.logging.metricsDetailedWindowTtlMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'TTL for high-detail metrics debug window in milliseconds',
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
  [CONFIG_KEY.REBALANCER_SYSTEM_PARTITION_START_DELAY_MS]: {
    defaultValue: DEFAULT_CONFIG.rebalancer.systemPartitionStartDelayMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description:
      'Startup delay before rebalancing system table partitions (milliseconds)',
  },
  [CONFIG_KEY.REBALANCER_USER_PARTITION_START_DELAY_MS]: {
    defaultValue: DEFAULT_CONFIG.rebalancer.userPartitionStartDelayMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description:
      'Startup delay before rebalancing non-system partitions (milliseconds)',
  },

  // Storage capacity rebalancer configuration
  [CONFIG_KEY.REBALANCER_STORAGE_SOFT_PRESSURE_PERCENT]: {
    defaultValue: DEFAULT_CONFIG.rebalancer.storageSoftPressurePercent,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Budget utilization percent triggering soft pressure state',
  },
  [CONFIG_KEY.REBALANCER_STORAGE_HARD_PRESSURE_PERCENT]: {
    defaultValue: DEFAULT_CONFIG.rebalancer.storageHardPressurePercent,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Budget utilization percent triggering hard pressure state',
  },
  [CONFIG_KEY.REBALANCER_STORAGE_RESERVATION_TTL_MS]: {
    defaultValue: DEFAULT_CONFIG.rebalancer.storageReservationTtlMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'TTL for storage reservations in milliseconds',
  },
  [CONFIG_KEY.REBALANCER_STORAGE_EMERGENCY_HEADROOM_PERCENT]: {
    defaultValue:
      DEFAULT_CONFIG.rebalancer.storageEmergencyHeadroomPercent,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description:
      'Budget percent reserved for critical correctness operations',
  },
  [CONFIG_KEY.REBALANCER_MINIMUM_REPLICA_BYTES]: {
    defaultValue: DEFAULT_CONFIG.rebalancer.minimumReplicaBytes,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Minimum estimated bytes for any replica operation',
  },
  [CONFIG_KEY.REBALANCER_SPLIT_AMPLIFICATION_FACTOR]: {
    defaultValue: DEFAULT_CONFIG.rebalancer.splitAmplificationFactor,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description:
      'Multiplier for split write-amplification reservation estimates',
  },
  [CONFIG_KEY.REBALANCER_PARTITION_REPLICA_OVERHEAD_BYTES]: {
    defaultValue:
      DEFAULT_CONFIG.rebalancer.partitionReplicaOverheadBytes,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Fixed overhead bytes per partition replica',
  },
  [CONFIG_KEY.REBALANCER_MESSAGE_GROUP_REPLICA_OVERHEAD_BYTES]: {
    defaultValue:
      DEFAULT_CONFIG.rebalancer.messageGroupReplicaOverheadBytes,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Fixed overhead bytes per message group replica',
  },
  [CONFIG_KEY.REBALANCER_SERVICE_REPLICA_OVERHEAD_BYTES]: {
    defaultValue:
      DEFAULT_CONFIG.rebalancer.serviceReplicaOverheadBytes,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Fixed overhead bytes per service replica',
  },
  [CONFIG_KEY.REBALANCER_STORAGE_ADMISSION_MODE]: {
    defaultValue:
      DEFAULT_CONFIG.rebalancer.storageAdmissionMode,
    type: CONFIG_VALUE_TYPE.STRING,
    requiresRestart: false,
    description:
      'Storage admission mode: observe (log only) or enforce (block)',
  },

  // Latency topology configuration
  [CONFIG_KEY.LATENCY_GROUP_THRESHOLD_MS]: {
    defaultValue: DEFAULT_CONFIG.latency.groupThresholdMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Latency threshold in milliseconds for same-group membership',
  },
  [CONFIG_KEY.LATENCY_RECALC_INTERVAL_MS]: {
    defaultValue: DEFAULT_CONFIG.latency.recalcIntervalMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Interval between latency group recalculation cycles',
  },
  [CONFIG_KEY.LATENCY_RECALC_JITTER_RATIO]: {
    defaultValue: DEFAULT_CONFIG.latency.recalcJitterRatio,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Bounded jitter ratio applied to recalculation scheduling',
  },
  [CONFIG_KEY.LATENCY_PING_TIMEOUT_MS]: {
    defaultValue: DEFAULT_CONFIG.latency.pingTimeoutMs,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Timeout for latency ping measurements in milliseconds',
  },
  [CONFIG_KEY.LATENCY_PING_RETRY_COUNT]: {
    defaultValue: DEFAULT_CONFIG.latency.pingRetryCount,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Retry count for latency ping measurements',
  },
  [CONFIG_KEY.LATENCY_SMOOTHING_ALPHA]: {
    defaultValue: DEFAULT_CONFIG.latency.smoothingAlpha,
    type: CONFIG_VALUE_TYPE.NUMBER,
    requiresRestart: false,
    description: 'Exponential smoothing alpha for RTT samples',
  },
  [CONFIG_KEY.LATENCY_PROPAGATION_MODE]: {
    defaultValue: DEFAULT_CONFIG.latency.propagationMode,
    type: CONFIG_VALUE_TYPE.STRING,
    requiresRestart: false,
    description: 'Latency-aware CDC propagation mode (safe or grouped)',
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

const CONFIG_SQL = Object.freeze({
  SELECT_ALL: 'SELECT * FROM config',
  SELECT_BY_KEY: 'SELECT * FROM config WHERE config_key = ?',
});

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
  LATENCY_PROPAGATION_MODE,
  CONFIG_LOG_LEVELS,
  CONFIG_LOG_MSG,
  CONFIG_SCHEMA,
  CONFIG_SEED_SOURCE,
  CONFIG_SEPARATOR,
  CONFIG_SQL,
  CONFIG_STATS_DEFAULT,
  CONFIG_SUBSYSTEM,
  CONFIG_TABLE_COLUMN,
  CONFIG_VALUE_DEFAULT,
  CONFIG_VALUE_TYPE,
  DEFAULT_CONFIG,
  ENV_MAPPINGS,
  STRING,
};
