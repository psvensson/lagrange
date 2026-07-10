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
  NODE_ADVERTISED_WS_ADDRESS: 'node.advertisedWsAddress',
  NODE_SEED_NODE_ADDRESS: 'node.seedNodeAddress',
  NODE_SEED_NODE_WS_ADDRESS: 'node.seedNodeWsAddress',

  RAFT_ELECTION_TIMEOUT_MIN_MS: 'raft.electionTimeoutMinMs',
  RAFT_ELECTION_TIMEOUT_MAX_MS: 'raft.electionTimeoutMaxMs',
  RAFT_HEARTBEAT_INTERVAL_MS: 'raft.heartbeatIntervalMs',
  RAFT_TICK_INTERVAL_MS: 'raft.tickIntervalMs',
  RAFT_ADAPTIVE_TIMING_ENABLED: 'raft.adaptiveTimingEnabled',
  RAFT_ADAPTIVE_TIMING_SAMPLE_INTERVAL_MS:
    'raft.adaptiveTimingSampleIntervalMs',
  RAFT_ADAPTIVE_TIMING_PROMOTE_SAMPLES:
    'raft.adaptiveTimingPromoteSamples',
  RAFT_ADAPTIVE_TIMING_DEMOTE_SAMPLES:
    'raft.adaptiveTimingDemoteSamples',
  RAFT_ADAPTIVE_TIMING_HIGH_CPU_PERCENT:
    'raft.adaptiveTimingHighCpuPercent',
  RAFT_ADAPTIVE_TIMING_LOW_CPU_PERCENT:
    'raft.adaptiveTimingLowCpuPercent',
  RAFT_ADAPTIVE_TIMING_HIGH_WRITE_BYTES_PER_SEC:
    'raft.adaptiveTimingHighWriteBytesPerSec',
  RAFT_ADAPTIVE_TIMING_LOW_WRITE_BYTES_PER_SEC:
    'raft.adaptiveTimingLowWriteBytesPerSec',
  RAFT_ADAPTIVE_TIMING_HIGH_RSS_GROWTH_BYTES_PER_MIN:
    'raft.adaptiveTimingHighRssGrowthBytesPerMin',
  RAFT_ADAPTIVE_TIMING_LOW_RSS_GROWTH_BYTES_PER_MIN:
    'raft.adaptiveTimingLowRssGrowthBytesPerMin',
  RAFT_ADAPTIVE_TIMING_ACTIVE_HEARTBEAT_INTERVAL_MS:
    'raft.adaptiveTimingActiveHeartbeatIntervalMs',
  RAFT_ADAPTIVE_TIMING_ACTIVE_ELECTION_TIMEOUT_MIN_MS:
    'raft.adaptiveTimingActiveElectionTimeoutMinMs',
  RAFT_ADAPTIVE_TIMING_ACTIVE_ELECTION_TIMEOUT_MAX_MS:
    'raft.adaptiveTimingActiveElectionTimeoutMaxMs',
  RAFT_ADAPTIVE_TIMING_IDLE_HEARTBEAT_INTERVAL_MS:
    'raft.adaptiveTimingIdleHeartbeatIntervalMs',
  RAFT_ADAPTIVE_TIMING_IDLE_ELECTION_TIMEOUT_MIN_MS:
    'raft.adaptiveTimingIdleElectionTimeoutMinMs',
  RAFT_ADAPTIVE_TIMING_IDLE_ELECTION_TIMEOUT_MAX_MS:
    'raft.adaptiveTimingIdleElectionTimeoutMaxMs',
  RAFT_LEADER_ACTIVATION_STABILIZATION_MS:
    'raft.leaderActivationStabilizationMs',
  RAFT_LEADER_ACTIVATION_NODE_SPACING_MS:
    'raft.leaderActivationNodeSpacingMs',

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
  LOGGING_PERSIST_METRICS_LOGS: 'logging.persistMetricsLogs',
  LOGGING_METRICS_DEFAULT_RESOLUTION_MS:
    'logging.metricsDefaultResolutionMs',
  LOGGING_METRICS_DETAILED_WINDOW_ENABLED:
    'logging.metricsDetailedWindowEnabled',
  LOGGING_METRICS_DETAILED_WINDOW_TTL_MS:
    'logging.metricsDetailedWindowTtlMs',
  LOGGING_QUERY_DEFAULT_LIMIT: 'logging.queryDefaultLimit',
  LOGGING_QUERY_MAX_LIMIT: 'logging.queryMaxLimit',
  LOGGING_DEFAULT_TIME_RANGE_MS: 'logging.defaultTimeRangeMs',
  LOGGING_RETENTION_PERIOD_MS: 'logging.retentionPeriodMs',
  LOGGING_CLEANUP_INTERVAL_MS: 'logging.cleanupIntervalMs',
  LOGGING_CLEANUP_BATCH_SIZE: 'logging.cleanupBatchSize',
  LOGGING_MAX_DELETES_PER_RUN: 'logging.maxDeletesPerRun',

  REBALANCER_PERIODIC_CHECK_INTERVAL_MS: 'rebalancer.periodicCheckIntervalMs',
  REBALANCER_MAX_CONCURRENT_MOVES: 'rebalancer.maxConcurrentMoves',
  REBALANCER_SYSTEM_PARTITION_START_DELAY_MS:
    'rebalancer.systemPartitionStartDelayMs',
  REBALANCER_USER_PARTITION_START_DELAY_MS:
    'rebalancer.userPartitionStartDelayMs',

  QUERY_TIMEOUT_MS: 'query.timeoutMs',
  QUERY_MAX_PARALLEL_PARTITIONS: 'query.maxParallelPartitions',
  QUERY_LEADER_RETRY_ATTEMPTS: 'query.leaderRetryAttempts',
  QUERY_LEADER_RETRY_DELAY_MS: 'query.leaderRetryDelayMs',
  QUERY_READ_RETRY_ATTEMPTS: 'query.readRetryAttempts',
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

  ADMIN_QUERY_TIMEOUT_MS: 'admin.queryTimeoutMs',
  ADMIN_CACHE_DUMP_TIMEOUT_MS: 'admin.cacheDumpTimeoutMs',
  ADMIN_WEBSOCKET_PORT: 'admin.websocketPort',
  ADMIN_WEBSOCKET_HOST: 'admin.websocketHost',
  ADMIN_ALLOW_INSECURE_EXTERNAL_BIND:
    'admin.allowInsecureExternalBind',

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

  TRANSPORT_CONNECTION_POOL_TTL_MS: 'transport.connectionPoolTtlMs',
  TRANSPORT_CONNECTION_POOL_CLEANUP_INTERVAL_MS: 'transport.connectionPoolCleanupIntervalMs',

  // Storage capacity budget (node-level startup)
  NODE_STORAGE_BUDGET_BYTES: 'node.storageBudgetBytes',
  NODE_STORAGE_BUDGET_RATIO: 'node.storageBudgetRatio',

  // Storage capacity rebalancer keys
  REBALANCER_STORAGE_SOFT_PRESSURE_PERCENT:
    'rebalancer.storageSoftPressurePercent',
  REBALANCER_STORAGE_HARD_PRESSURE_PERCENT:
    'rebalancer.storageHardPressurePercent',
  REBALANCER_STORAGE_RESERVATION_TTL_MS:
    'rebalancer.storageReservationTtlMs',
  REBALANCER_STORAGE_EMERGENCY_HEADROOM_PERCENT:
    'rebalancer.storageEmergencyHeadroomPercent',
  REBALANCER_MINIMUM_REPLICA_BYTES:
    'rebalancer.minimumReplicaBytes',
  REBALANCER_SPLIT_AMPLIFICATION_FACTOR:
    'rebalancer.splitAmplificationFactor',
  REBALANCER_PARTITION_REPLICA_OVERHEAD_BYTES:
    'rebalancer.partitionReplicaOverheadBytes',
  REBALANCER_MESSAGE_GROUP_REPLICA_OVERHEAD_BYTES:
    'rebalancer.messageGroupReplicaOverheadBytes',
  REBALANCER_SERVICE_REPLICA_OVERHEAD_BYTES:
    'rebalancer.serviceReplicaOverheadBytes',
  REBALANCER_STORAGE_ADMISSION_MODE:
    'rebalancer.storageAdmissionMode',

  // Latency topology keys
  LATENCY_PINNED_GROUP_ID: 'latency.pinnedGroupId',
  LATENCY_GROUP_THRESHOLD_MS: 'latency.groupThresholdMs',
  LATENCY_RECALC_INTERVAL_MS: 'latency.recalcIntervalMs',
  LATENCY_RECALC_JITTER_RATIO: 'latency.recalcJitterRatio',
  LATENCY_PING_TIMEOUT_MS: 'latency.pingTimeoutMs',
  LATENCY_PING_RETRY_COUNT: 'latency.pingRetryCount',
  LATENCY_SMOOTHING_ALPHA: 'latency.smoothingAlpha',
  LATENCY_PROPAGATION_MODE: 'latency.propagationMode',
});

export {CONFIG_KEY};
