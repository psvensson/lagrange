# Configuration Catalog

This section provides a comprehensive catalog of all configuration keys used throughout the system. All configuration is stored in the `config` system table and can be queried or updated via SQL. Configuration keys marked with "Hot Reload: Yes" can be updated without restarting the system; keys marked "Hot Reload: No" require a system restart to take effect.

**Configuration Management:**
- All configuration keys are seeded from environment variables on first startup
- Updates are made via SQL: `UPDATE config SET config_value = 'new_value' WHERE config_key = 'key_name'`
- Configuration watchers notify components when hot-reloadable values change
- See Requirement 30 for detailed configuration management behavior

## Node Configuration

| Key Name | Type | Default Value | Hot Reload | Description |
|----------|------|---------------|------------|-------------|
| `node.heartbeat_interval_ms` | number | 3000 | Yes | Interval between node heartbeat updates to system tables |
| `node.heartbeat_timeout_ms` | number | 5000 | Yes | Time before a node is considered failed if no heartbeat received |
| `node.stats_collection_interval_ms` | number | 10000 | Yes | Interval for collecting CPU, memory, and disk statistics |
| `node.bootstrap_timeout_ms` | number | 30000 | No | Maximum time to wait for bootstrap process to complete |
| `node.max_services_per_node` | number | 100 | Yes | Maximum number of services (partitions + message groups) per node |

## Raft Configuration

| Key Name | Type | Default Value | Hot Reload | Description |
|----------|------|---------------|------------|-------------|
| `raft.election_timeout_min_ms` | number | 1000 | No | Minimum Raft leader election timeout |
| `raft.election_timeout_max_ms` | number | 2000 | No | Maximum Raft leader election timeout (randomized between min and max) |
| `raft.heartbeat_interval_ms` | number | 500 | No | Interval between Raft leader heartbeats to followers |
| `raft.snapshot_interval_entries` | number | 10000 | Yes | Number of log entries before triggering snapshot |
| `raft.snapshot_threshold_bytes` | number | 104857600 | Yes | Log size in bytes (100MB) before triggering snapshot |
| `raft.max_append_entries_batch` | number | 100 | Yes | Maximum number of entries in a single AppendEntries RPC |
| `raft.log_compaction_enabled` | boolean | true | Yes | Enable automatic log compaction after snapshots |

## Message Group Configuration

| Key Name | Type | Default Value | Hot Reload | Description |
|----------|------|---------------|------------|-------------|
| `message_group.default_replica_count` | number | 3 | No | Default number of replicas for new message groups |
| `message_group.max_replica_count` | number | 7 | No | Maximum allowed replicas per message group |
| `message_group.ensure_local_access` | boolean | true | No | Ensure every node has at least one local message group replica |
| `message_group.leadership_wait_timeout_ms` | number | 5000 | Yes | Time to wait for message group leadership during bootstrap |
| `message_group.leadership_wait_max_ms` | number | 30000 | Yes | Maximum time to wait for leadership with exponential backoff |
| `message_group.cache_ttl_ms` | number | 30000 | Yes | Time-to-live for cached system table data in message groups |
| `message_group.message_retry_max_attempts` | number | 3 | Yes | Maximum retry attempts for failed message delivery |
| `message_group.message_retry_initial_delay_ms` | number | 100 | Yes | Initial delay before first retry |
| `message_group.message_retry_backoff_multiplier` | number | 2.0 | Yes | Exponential backoff multiplier for retries |
| `message_group.message_retry_max_delay_ms` | number | 5000 | Yes | Maximum delay between retry attempts |
| `message_group.message_retry_jitter_factor` | number | 0.1 | Yes | Jitter factor (0.0-1.0) to prevent thundering herd |
| `message_group.cdc_buffer_size` | number | 1000 | Yes | CDC event buffer size for reordering out-of-order events |
| `message_group.cdc_buffer_flush_interval_ms` | number | 5000 | Yes | Interval for flushing buffered CDC events |

## Partition Configuration

| Key Name | Type | Default Value | Hot Reload | Description |
|----------|------|---------------|------------|-------------|
| `partition.default_replica_count` | number | 3 | No | Default number of replicas for new partitions |
| `partition.max_replica_count` | number | 7 | No | Maximum allowed replicas per partition |
| `partition.split_storage_threshold_bytes` | number | 10737418240 | Yes | Storage threshold (10GB) for partition split |
| `partition.split_traffic_threshold_qpm` | number | 1000 | Yes | Query traffic threshold (queries per minute) for split |
| `partition.merge_storage_threshold_bytes` | number | 2147483648 | Yes | Storage threshold (2GB, 20% of split) for partition merge |
| `partition.merge_traffic_threshold_qpm` | number | 200 | Yes | Traffic threshold (queries per minute, 20% of split) for merge |
| `partition.split_merge_evaluation_interval_ms` | number | 300000 | Yes | Interval (5 minutes) for evaluating split/merge criteria |
| `partition.metrics_update_interval_ms` | number | 60000 | Yes | Interval for updating partition metrics (size, traffic) |
| `partition.query_timeout_ms` | number | 30000 | Yes | Timeout for partition queries |
| `partition.max_result_buffer_bytes` | number | 1073741824 | Yes | Maximum result buffering (1GB) per query at coordinator |

## Storage Configuration

| Key Name | Type | Default Value | Hot Reload | Description |
|----------|------|---------------|------------|-------------|
| `storage.data_dir` | string | './data' | No | Base directory for all partition data files |

**Command-Line Parameter:**
The data directory can be specified via the `--data-dir` command-line parameter, which takes precedence over the `DATA_DIR` environment variable.

**Environment Variable:**
The `DATA_DIR` environment variable can be used as an alternative to the command-line parameter.

**Precedence Order:**
1. `--data-dir` command-line parameter (highest priority)
2. `DATA_DIR` environment variable
3. Default value `./data` (lowest priority)

**Directory Structure:**
```
{data-dir}/
└── partitions/
    ├── {partition-id-1}/
    │   ├── {replica-id-1}.db
    │   ├── {replica-id-1}.db-wal
    │   └── {replica-id-1}.db-shm
    ├── {partition-id-2}/
    │   ├── {replica-id-2}.db
    │   ├── {replica-id-2}.db-wal
    │   └── {replica-id-2}.db-shm
    └── ...
```

**Validates: Requirements 35.1-10**

## Rebalancing Configuration

| Key Name | Type | Default Value | Hot Reload | Description |
|----------|------|---------------|------------|-------------|
| `rebalancer.periodic_check_interval_ms` | number | 60000 | Yes | Interval (1 minute) for periodic rebalancing checks |
| `rebalancer.periodic_check_jitter_ms` | number | 10000 | Yes | Jitter (±10 seconds) to prevent thundering herd |
| `rebalancer.critical_check_delay_ms` | number | 5000 | Yes | Delay before critical rebalancing (replica below minimum) |
| `rebalancer.max_concurrent_moves` | number | 5 | Yes | Maximum concurrent replica moves across cluster |
| `rebalancer.move_timeout_ms` | number | 300000 | Yes | Timeout (5 minutes) for a single replica move operation |
| `rebalancer.min_replica_count` | number | 3 | No | Minimum replica count before triggering critical rebalancing |
| `rebalancer.node_capacity_cpu_threshold` | number | 0.8 | Yes | CPU usage threshold (80%) for node capacity |
| `rebalancer.node_capacity_memory_threshold` | number | 0.8 | Yes | Memory usage threshold (80%) for node capacity |
| `rebalancer.node_capacity_disk_threshold` | number | 0.9 | Yes | Disk usage threshold (90%) for node capacity |

## Performance and Scalability Configuration

| Key Name | Type | Default Value | Hot Reload | Description |
|----------|------|---------------|------------|-------------|
| `performance.max_parallel_partitions` | number | 1000 | Yes | Maximum partitions to query in parallel |
| `performance.max_partition_connections` | number | 10000 | Yes | Maximum concurrent partition connections per query |
| `performance.query_p50_target_ms` | number | 100 | Yes | Target p50 query latency (milliseconds) |
| `performance.query_p99_target_ms` | number | 500 | Yes | Target p99 query latency for up to 100 partitions |
| `performance.slow_partition_multiplier` | number | 2.0 | Yes | Multiplier (2×median) to identify slow partitions |
| `performance.speculative_execution_enabled` | boolean | true | Yes | Enable speculative execution for slow partitions |
| `performance.speculative_execution_delay_ms` | number | 200 | Yes | Delay before starting speculative execution |
| `performance.streaming_aggregation_enabled` | boolean | true | Yes | Enable streaming aggregation for large result sets |

## Logging Configuration

| Key Name | Type | Default Value | Hot Reload | Description |
|----------|------|---------------|------------|-------------|
| `logging.level` | string | 'info' | Yes | Global log level: error, warn, info, debug, trace |
| `logging.buffer_size_entries` | number | 1000 | Yes | Number of log entries to buffer during bootstrap |
| `logging.flush_interval_ms` | number | 5000 | Yes | Interval for flushing buffered logs to logs table |
| `logging.retention_days` | number | 30 | Yes | Number of days to retain log entries |
| `logging.retention_check_interval_ms` | number | 86400000 | Yes | Interval (24 hours) for log retention cleanup |
| `logging.include_trace_id` | boolean | true | Yes | Include trace_id in all log entries for request tracing |
| `logging.stdout_enabled` | boolean | true | Yes | Enable logging to stdout in addition to logs table |
| `logging.pretty_print` | boolean | false | Yes | Enable pretty-printed logs (development only) |

## Authentication Configuration

| Key Name | Type | Default Value | Hot Reload | Description |
|----------|------|---------------|------------|-------------|
| `auth.keycloak_enabled` | boolean | false | No | Enable Keycloak authentication |
| `auth.keycloak_url` | string | '' | No | Keycloak server URL |
| `auth.keycloak_realm` | string | '' | No | Keycloak realm name |
| `auth.keycloak_client_id` | string | '' | No | Keycloak client ID for this system |
| `auth.keycloak_client_secret` | string | '' | No | Keycloak client secret (stored encrypted) |
| `auth.jwt_validation_enabled` | boolean | true | Yes | Enable JWT token validation |
| `auth.jwt_expiry_tolerance_seconds` | number | 60 | Yes | Tolerance (seconds) for JWT expiry validation |
| `auth.tls_enabled` | boolean | false | No | Enable TLS/SSL for inter-node communication |
| `auth.tls_cert_path` | string | '' | No | Path to TLS certificate file |
| `auth.tls_key_path` | string | '' | No | Path to TLS private key file |

## Timeout Configuration

| Key Name | Type | Default Value | Hot Reload | Description |
|----------|------|---------------|------------|-------------|
| `timeout.bootstrap_total_ms` | number | 30000 | No | Total timeout for node bootstrap process |
| `timeout.service_start_ms` | number | 10000 | Yes | Timeout for starting a single service |
| `timeout.service_stop_ms` | number | 5000 | Yes | Timeout for stopping a single service |
| `timeout.raft_join_ms` | number | 10000 | Yes | Timeout for joining a Raft group |
| `timeout.query_execution_ms` | number | 30000 | Yes | Default timeout for SQL query execution |
| `timeout.transaction_ms` | number | 60000 | Yes | Default timeout for transactions |
| `timeout.websocket_connect_ms` | number | 5000 | Yes | Timeout for WebSocket connection establishment |
| `timeout.http_request_ms` | number | 10000 | Yes | Timeout for HTTP requests |

## Threshold Configuration

| Key Name | Type | Default Value | Hot Reload | Description |
|----------|------|---------------|------------|-------------|
| `threshold.partition_count_warning_min` | number | 10 | Yes | Warn if table has fewer partitions (reduces parallelism) |
| `threshold.partition_count_warning_max` | number | 10000 | Yes | Warn if table has more partitions (increases overhead) |
| `threshold.replica_health_check_failures` | number | 3 | Yes | Consecutive health check failures before marking replica failed |
| `threshold.node_failure_detection_count` | number | 3 | Yes | Consecutive heartbeat misses before marking node failed |
| `threshold.message_queue_size_warning` | number | 10000 | Yes | Warn if message queue exceeds this size |
| `threshold.raft_log_size_warning_bytes` | number | 1073741824 | Yes | Warn if Raft log exceeds 1GB before compaction |

## Worker Thread Configuration

| Key Name | Type | Default Value | Hot Reload | Description |
|----------|------|---------------|------------|-------------|
| `worker.min_threads` | number | 2 | No | Minimum worker threads in pool |
| `worker.max_threads` | number | (CPU cores) | No | Maximum worker threads (defaults to CPU core count) |
| `worker.idle_timeout_ms` | number | 30000 | Yes | Idle timeout before worker thread termination |
| `worker.task_queue_size` | number | 1000 | Yes | Maximum queued tasks before backpressure |

## CDC Configuration

| Key Name | Type | Default Value | Hot Reload | Description |
|----------|------|---------------|------------|-------------|
| `cdc.enabled` | boolean | true | No | Enable Change Data Capture |
| `cdc.batch_size` | number | 100 | Yes | Number of CDC events to batch before processing |
| `cdc.flush_interval_ms` | number | 1000 | Yes | Interval for flushing CDC events |
| `cdc.retry_max_attempts` | number | 5 | Yes | Maximum retry attempts for failed CDC delivery |
| `cdc.retry_backoff_ms` | number | 1000 | Yes | Initial backoff delay for CDC retry |

## Live Query Configuration

| Key Name | Type | Default Value | Hot Reload | Description |
|----------|------|---------------|------------|-------------|
| `live_query.default_ttl_ms` | number | 30000 | Yes | Default TTL for live query subscriptions |
| `live_query.max_per_client` | number | 100 | Yes | Maximum concurrent live queries per client |
| `live_query.cleanup_interval_ms` | number | 5000 | Yes | Interval for checking expired subscriptions |
| `live_query.cursor_retention_ms` | number | 300000 | Yes | How long to retain events for cursor resumption |
| `live_query.warn_no_partition_key` | boolean | true | Yes | Log warning when query lacks partition key filter |

## HLC Configuration

| Key Name | Type | Default Value | Hot Reload | Description |
|----------|------|---------------|------------|-------------|
| `hlc.max_drift_ms` | number | 500 | Yes | Maximum allowed clock drift in milliseconds before warning |
| `hlc.max_logical_counter` | number | 65535 | No | Maximum value for logical counter before overflow |
| `hlc.drift_check_interval_ms` | number | 60000 | Yes | Interval for checking clock drift across nodes |
| `hlc.sync_on_startup` | boolean | true | No | Synchronize HLC with other nodes on startup |

## Configuration Categories Summary

- **Node**: Node-level settings for heartbeats, statistics, and service limits
- **Raft**: Consensus algorithm parameters for elections, heartbeats, and snapshots
- **Message Groups**: Message routing, retry logic, CDC buffering, and cache management
- **Partitions**: Data storage, split/merge thresholds, and query settings
- **Rebalancing**: Replica placement and movement policies
- **Performance**: Query execution, parallelism, and latency targets
- **Logging**: Log levels, retention, and output configuration
- **Authentication**: Keycloak integration and TLS settings
- **Timeouts**: Operation timeouts across all components
- **Thresholds**: Warning and failure detection thresholds
- **Worker Threads**: Thread pool management for service execution
- **CDC**: Change Data Capture event processing
- **Live Query**: Real-time streaming query subscriptions and lifecycle management
- **HLC**: Hybrid Logical Clock configuration for global ordering

## Hot Reload Capability

- Configuration keys with "Hot Reload: Yes" can be updated via SQL and take effect immediately
- Configuration keys with "Hot Reload: No" require a system restart to take effect
- Hot reload is implemented via configuration watchers that subscribe to config table CDC events
- See Requirement 30 for detailed hot reload behavior
