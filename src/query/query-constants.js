import {CONFIG_KEY} from '../config/config-constants.js';
import {NUM, TIME_MS, TABLES} from '../constants/index.js';

const QUERY_SUBSYSTEM = Object.freeze({
  QUERY_ROUTER: 'query-router',
  SQL_QUERY_ENGINE: 'sql-query-engine',
  QUERY_EXECUTOR: 'query-executor',
  PARALLEL_QUERY_COORDINATOR: 'parallel-query-coordinator',
  STREAMING_AGGREGATOR: 'streaming-aggregator',
  STRAGGLER_DETECTOR: 'straggler-detector',
  SPECULATIVE_EXECUTOR: 'speculative-executor',
  PARTITION_RESOLVER: 'partition-resolver',
  TABLE_CREATION_SERVICE: 'table-creation-service',
});

const QUERY_STATUS = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  TIMEOUT: 'timeout',
});

const QUERY_AST_TYPE = Object.freeze({
  SELECT: 'SELECT',
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  CREATE_TABLE: 'CREATE_TABLE',
  ALTER_TABLE: 'ALTER_TABLE',
  BEGIN_TRANSACTION: 'BEGIN_TRANSACTION',
  COMMIT: 'COMMIT',
  ROLLBACK: 'ROLLBACK',
});

const QUERY_OPERATION = Object.freeze({
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  CREATE_TABLE: 'CREATE_TABLE',
  ALTER_TABLE: 'ALTER_TABLE',
  BEGIN_TRANSACTION: 'BEGIN_TRANSACTION',
  COMMIT: 'COMMIT',
  ROLLBACK: 'ROLLBACK',
  PREPARE: 'PREPARE',
  TRANSACTION: 'TRANSACTION',
  BEGIN: 'BEGIN',
  EXPLAIN_DISTRIBUTED: 'EXPLAIN_DISTRIBUTED',
});

const QUERY_ERROR_CODE = Object.freeze({
  TABLE_NOT_FOUND: 'TABLE_NOT_FOUND',
  PARTITION_NOT_FOUND: 'PARTITION_NOT_FOUND',
  CROSS_PARTITION_TRANSACTION: 'CROSS_PARTITION_TRANSACTION',
  TRANSACTION_ACTIVE: 'TRANSACTION_ACTIVE',
  NO_TRANSACTION: 'NO_TRANSACTION',
  COMMIT_FAILED: 'COMMIT_FAILED',
  ROLLBACK_FAILED: 'ROLLBACK_FAILED',
  PREPARE_FAILED: 'PREPARE_FAILED',
  WRITE_CONFLICT: 'WRITE_CONFLICT',
  SNAPSHOT_EXPIRED: 'SNAPSHOT_EXPIRED',
  PREPARE_LOST: 'PREPARE_LOST',
  PRIMARY_KEY_REQUIRED: 'PRIMARY_KEY_REQUIRED',
  TABLE_EXISTS: 'TABLE_EXISTS',
  DISTRIBUTED_PARTICIPANT_FAILURE: 'DISTRIBUTED_PARTICIPANT_FAILURE',
  SYNTAX_ERROR: 'SYNTAX_ERROR',
  TIMEOUT: 'TIMEOUT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

const QUERY_ERROR_MSG = Object.freeze({
  UNSUPPORTED_STATEMENT_PREFIX: 'Unsupported statement type: ',
  TABLE_NOT_FOUND_PREFIX: 'Table not found: ',
  PARTITION_FOR_KEY_PREFIX: 'No partition found for key: ',
  QUERY_TIMEOUT: 'Query timeout',
  QUERY_TIMED_OUT: 'Query timed out',
  MESSAGE_ROUTER_UNAVAILABLE: 'Message router not available',
  NO_SERVICE_FOR_PARTITION: 'No service found for partition',
  PARTITION_SERVICE_NOT_FOUND: 'Partition service not found',
  PARTITION_SERVICE_NOT_FOUND_PREFIX: 'Partition service not found: ',
  QUERY_ROUTING_FAILED: 'Query routing failed',
  READ_CANDIDATES_EXHAUSTED:
    'All read candidates exhausted with transient errors',
  SYSTEM_CACHE_NOT_AVAILABLE: 'System cache not available for table',
  SYSTEM_CACHE_FILTER_UNSUPPORTED: 'System cache does not support filter',
  SYSTEM_CACHE_UNSUPPORTED: 'System cache does not support filter or getAll',
  NO_ACTIVE_SERVICE_FOR_PARTITION: 'No active service found for partition',
  NO_LEADER_SERVICE_FOR_PARTITION: 'No leader service found for partition',
  NO_SUCCESSFUL_PARTITION_RESPONSE: 'No successful responses from partitions',
  TRANSACTION_ACTIVE: 'Transaction already active for this session',
  NO_TRANSACTION_COMMIT: 'No active transaction to commit',
  NO_TRANSACTION_ROLLBACK: 'No active transaction to rollback',
  NO_ACTIVE_TRANSACTION: 'No active transaction',
  COMMIT_FAILED: 'Commit failed',
  ROLLBACK_FAILED: 'Rollback failed',
  PREPARE_FAILED: 'Prepare failed',
  WRITE_CONFLICT: 'Write conflict detected',
  SNAPSHOT_EXPIRED: 'Snapshot expired',
  PREPARE_LOST: 'Prepared state lost',
  BEGIN_FAILED: 'Failed to begin transaction',
  CROSS_PARTITION_INSERT:
    'Cross-partition transactions are not supported. INSERT affects multiple partitions.',
  CROSS_PARTITION_UPDATE:
    'Cross-partition transactions are not supported. UPDATE affects multiple partitions.',
  CROSS_PARTITION_DELETE:
    'Cross-partition transactions are not supported. DELETE affects multiple partitions.',
  TX_BOUND_PREFIX:
    'Cross-partition transactions are not supported. Transaction bound to partition ',
  TX_BOUND_INSERT_SUFFIX: ', but INSERT targets partition ',
  TX_BOUND_UPDATE_SUFFIX: ', but UPDATE targets different partition(s)',
  TX_BOUND_DELETE_SUFFIX: ', but DELETE targets different partition(s)',
  TX_BOUND_OPERATION_SUFFIX: ', but operation targets partition ',
  QUERY_TIMEOUT_AFTER_PREFIX: 'Query timeout after ',
  QUERY_TIMEOUT_AFTER_SUFFIX: 'ms',
  PARTITION_NOT_FOUND: 'Partition not found',
  SERVICE_EXECUTE_UNSUPPORTED: 'Service does not support executeQuery',
  MAX_CONNECTIONS_PREFIX: 'Query would exceed max concurrent connections: ',
  RESULT_BUFFER_LIMIT_PREFIX: 'Result buffer exceeds limit: ',
  PRIMARY_KEY_REQUIRED_PREFIX: 'Table \'',
  PRIMARY_KEY_REQUIRED_SUFFIX: '\' must have a PRIMARY KEY defined',
  PRIMARY_KEY_REQUIRED_DETAIL:
    'User tables require a PRIMARY KEY for partition key derivation.',
  TABLE_EXISTS_PREFIX: 'Table \'',
  TABLE_EXISTS_SUFFIX: '\' already exists',
  DISTRIBUTED_PARTICIPANT_FAILURE:
    'Distributed operation failed due to participant failures',
  EXPLAIN_DISTRIBUTED_REQUIRES_STATEMENT:
    'EXPLAIN DISTRIBUTED requires a SQL statement',
  MIGRATION_PIPELINE_UNAVAILABLE:
    'ALTER TABLE requires a configured migration pipeline',
  TABLE_PARTITION_PROVISION_COORDINATOR_REQUIRED:
    'Table partition provisioning requires a rebalance coordinator',
  TABLE_PARTITION_PROVISION_PARTITION_ID_REQUIRED:
    'Table partition provisioning requires partitionId',
  TABLE_PARTITION_METADATA_TIMEOUT_PREFIX:
    'Timed out waiting for table partition metadata for partition ',
  TABLE_PARTITION_SERVICE_METADATA_TIMEOUT_PREFIX:
    'Timed out waiting for partition service metadata for replica ',
  TABLE_PARTITION_TARGET_NODE_TIMEOUT_PREFIX:
    'Timed out waiting for active provisioning target nodes for partition ',
  TABLE_PARTITION_ROUTING_TIMEOUT_PREFIX:
    'Timed out waiting for routable partition service for partition ',
  TABLE_PARTITION_LEADER_TIMEOUT_PREFIX:
    'Timed out waiting for partition leader service for partition ',
  TABLE_PARTITION_PROVISION_INSUFFICIENT_TARGETS_PREFIX:
    'Unable to satisfy minimum routable provisioning cohort for partition ',
  TABLE_PARTITION_PROVISION_DISPATCH_FAILED:
    'Failed to dispatch initial table partition replica creation',
  TABLE_PARTITION_PROVISION_ABORTED_PRE_DISPATCH:
    'Aborted provisional replica operations before initial partition dispatch',
  MISSING_JOIN_PLAN:
    'Missing canonical join partition plan',
  TABLE_SPLIT_ALREADY_IN_PROGRESS:
    'Table already has a partition split transition in progress',
  TABLE_SPLIT_PRIMARY_KEY_REQUIRED:
    'Partition split orchestration requires a single-column partition key',
  TABLE_SPLIT_PARTITION_NOT_FOUND:
    'Partition split source partition metadata not found',
  TABLE_SPLIT_TABLE_NOT_FOUND:
    'Partition split table metadata not found',
  TABLE_SPLIT_LEADER_REQUIRED:
    'Managed partition split must be initiated by the source partition leader',
  TABLE_SPLIT_TRANSACTION_COORDINATOR_REQUIRED:
    'Managed partition split requires DistributedTransactionCoordinator for atomic partition metadata insertion',
  TABLE_SPLIT_BOOTSTRAP_TARGETS_REQUIRED_PREFIX:
    'Managed partition split requires at least ',
  TABLE_SPLIT_SOURCE_QUORUM_REQUIRED_PREFIX:
    'Managed partition split requires at least ',
  TABLE_SPLIT_START_FAILED:
    'Failed to start partition split replication on source partition',
  TABLE_SPLIT_INVALID_PHASE_TRANSITION:
    'Invalid split phase transition: phase not in owner-managed set',
  TABLE_SPLIT_WORKFLOW_NOT_FOUND:
    'Split workflow not found for phase advancement',
});

const QUERY_ROUTER_ERROR_MSG = Object.freeze({
  SYSTEM_CACHE_REQUIRED: 'QueryRouter requires systemCache',
  MESSAGE_ROUTER_REQUIRED: 'QueryRouter requires messageRouter',
  noServiceCandidates: (partitionId) =>
    `No service candidates found for partition: ${partitionId}`,
  routingTimeout: (partitionId, timeoutMs) =>
    `Routing timed out for partition ${partitionId} after ${timeoutMs}ms`,
  routingFailed: (partitionId, retryAttempts) =>
    `Failed to route query to partition ${partitionId} after ${retryAttempts} attempts`,
});

const QUERY_LOG_MSG = Object.freeze({
  EXECUTING_DISTRIBUTED_SELECT: 'Executing distributed SELECT',
  EXECUTING_CROSS_PARTITION_JOIN: 'Executing cross-partition JOIN',
  EXECUTING_SQL_QUERY: 'Executing SQL query',
  QUERY_ADMISSION_DEFERRED: 'Query admission deferred',
  QUERY_ADMISSION_REJECTED: 'Query admission rejected',
  QUERY_EXECUTION_FAILED: 'Query execution failed',
  RESOLVED_PARTITIONS_SELECT: 'Resolved partitions for SELECT',
  ROUTING_INSERT: 'Routing INSERT to partitions',
  ROUTING_UPDATE: 'Routing UPDATE to partitions',
  ROUTING_DELETE: 'Routing DELETE to partitions',
  BEGIN_TRANSACTION: 'BEGIN TRANSACTION',
  COMMIT: 'COMMIT',
  ROLLBACK: 'ROLLBACK',
  SYSTEM_CACHE_UNSUPPORTED: 'System cache does not support filter or getAll',
  ROUTING_QUERY_TO_PARTITION: 'Routing query to partition service',
  QUERY_TIMED_OUT: 'Query timed out',
  MESSAGE_ROUTER_UNAVAILABLE: 'Message router not available',
  NO_SERVICE_FOR_PARTITION: 'No service found for partition',
  PARTITION_SERVICE_NOT_FOUND: 'Partition service not found',
  QUERY_ROUTING_FAILED: 'Query routing failed',
  NO_HANDLER_FOR_PARTITION: 'No handler registered for partition service',
  READ_CANDIDATE_TRANSIENT_FAILURE:
    'Read candidate failed with transient error, trying next',
  SYSTEM_CACHE_FILTER_UNSUPPORTED: 'System cache does not support filter',
  NO_ACTIVE_SERVICE_FOR_PARTITION: 'No active service found for partition',
  PARTITION_ROUTING_CANDIDATES_FILTERED:
    'Partition routing candidates filtered by readiness',
  NO_LEADER_SERVICE_FOR_PARTITION: 'No leader service found for partition',
  CANONICAL_LEADER_METADATA_MISSING_FOR_PARTITION:
    'Canonical partition leader metadata missing',
  CANONICAL_LEADER_SERVICE_MISSING_FOR_PARTITION:
    'Canonical partition leader service missing',
  NO_PARTITIONS_FOR_TABLE: 'No partitions available for table',
  NO_KEY_CONDITIONS: 'No key conditions, using scatter-gather',
  RESOLVED_PARTITIONS: 'Resolved partitions for query',
  NO_PARTITION_FOR_KEY: 'No partition found for key',
  PARALLEL_QUERY_START: 'Starting parallel query execution',
  PARALLEL_QUERY_FAILED: 'Parallel query execution failed',
  PARTITION_LIMIT_TRUNCATE: 'Partition count exceeds limit, truncating',
  STRAGGLER_DETECTED: 'Slow partition detected (straggler)',
  NO_ALTERNATIVE_REPLICAS: 'No alternative replicas for speculative execution',
  SPECULATIVE_EXEC_START: 'Starting speculative execution for straggler',
  SPECULATIVE_EXEC_FAILED: 'Speculative execution failed',
  STREAMING_MEMORY_LIMIT_REACHED: 'Streaming aggregator memory limit reached',
  TABLE_CREATE_START: 'Creating table',
  TABLE_EXISTS_SKIP: 'Table already exists, skipping creation',
  TABLE_CREATED_SUCCESS: 'Table created successfully',
  TABLE_PARTITION_PROVISION_START: 'Provisioning initial table partition replica',
  TABLE_PARTITION_PROVISION_SUCCESS: 'Initial table partition provisioning completed',
  TABLE_PARTITION_PROVISION_FAILED: 'Initial table partition provisioning failed',
  TABLE_PARTITION_TARGET_NODE_FALLBACK_USED:
    'Using degraded provisioning target-node fallback',
  TABLE_PARTITION_TRANSIENT_HOLD_WAIT:
    'Whole-cluster transient provisioning hold; waiting it out under the ' +
    'provisioning budget instead of failing the create',
  TABLE_PARTITION_TARGET_NODE_REJECTED:
    'Provisioning target node rejected during operation planning',
  TABLE_PARTITION_PROVISION_INSUFFICIENT_TARGETS:
    'Insufficient admissible provisioning targets for initial table partition',
  TABLE_PARTITION_PROVISION_ABORT_PENDING:
    'Aborting provisional table partition operations before dispatch',
  TABLE_PARTITION_PROVISION_ABORT_FAILED:
    'Failed to abort provisional table partition operation',
  TABLE_PARTITION_TARGET_NODE_WAIT_TIMEOUT:
    'Provisioning target-node convergence timed out',
  TABLE_SPLIT_MERGE_EVAL_FAILED:
    'Split/merge evaluation after table create failed',
  TABLE_POLICY_CHANGE_TRIGGER_SPLIT_EVAL:
    'Table policy update triggered split/merge evaluation',
  TABLE_PARTITION_SIZE_CHANGE_TRIGGER_SPLIT_EVAL:
    'Partition size update triggered split/merge evaluation',
  TABLE_SPLIT_START: 'Starting managed partition split',
  TABLE_SPLIT_PREPARED: 'Prepared managed partition split',
  TABLE_SPLIT_START_FAILED: 'Managed partition split start failed',
  FOLLOWING_LEADER_REDIRECT: 'Following leader redirect',
  WRITE_OP_PERSIST_FAILED:
    'Non-transactional write operation persistence failed',
  DISTRIBUTED_TX_RECOVERY_REPLAY_FAILED:
    'Distributed transaction recovery replay failed',
  INIT_LOGGER_FAILED: 'initLogger failed',
});

const QUERY_ROUTER_LOG_MSG = Object.freeze({
  ROUTING_TO_PARTITION: 'Routing query to partition',
  TIMEOUT_EXCEEDED: 'Routing timeout exceeded',
  NO_CANDIDATES: 'No service candidates available for partition',
  ROUTE_SUCCESS: 'Route to partition succeeded',
  FOLLOWING_REDIRECT: 'Following leader redirect',
  RETRY_ATTEMPT: 'Retrying partition route',
  ROUTE_FAILED: 'Route to partition failed',
});

const QUERY_ROUTING_DIAGNOSTIC_REASON = Object.freeze({
  OK: 'ok',
  NO_SERVICE_ROWS: 'no_service_rows',
  NO_ACTIVE_ADDRESSED_SERVICES: 'no_active_addressed_services',
  ALL_SERVICES_FILTERED_BY_READINESS:
    'all_services_filtered_by_readiness',
  SERVICE_INACTIVE: 'service_inactive',
  SERVICE_ADDRESS_MISSING: 'service_address_missing',
  READINESS_UNAVAILABLE: 'readiness_unavailable',
  NODE_NOT_ELIGIBLE: 'node_not_eligible',
});

const QUERY_ROUTING_REPAIR_REASON = Object.freeze({
  NO_HANDLER_STALE_SERVICE: 'no_handler_stale_service',
});

const QUERY_SQL = Object.freeze({
  SELECT_ALL_FROM_PREFIX: 'SELECT * FROM ',
});

const QUERY_MESSAGE_TYPE = Object.freeze({
  QUERY: 'QUERY',
});

const QUERY_RESPONSE_TYPE = Object.freeze({
  LEADER_REDIRECT: 'LEADER_REDIRECT',
});

const QUERY_JOIN_TYPE = Object.freeze({
  INNER: 'INNER',
  LEFT: 'LEFT',
  LEFT_OUTER: 'LEFT OUTER',
  RIGHT: 'RIGHT',
  RIGHT_OUTER: 'RIGHT OUTER',
});

const QUERY_AST_NODE = Object.freeze({
  BINARY: 'binary',
  LITERAL: 'literal',
  COLUMN_REF: 'column_ref',
  AGGREGATE: 'aggregate',
  STAR: 'star',
  UNARY: 'unary',
  IN: 'in',
  BETWEEN: 'between',
  LIKE: 'like',
  PARAMETER: 'parameter',
});

const QUERY_OPERATOR = Object.freeze({
  AND: 'AND',
  OR: 'OR',
  EQUALS: '=',
  NOT_EQUALS: '!=',
  NOT_EQUALS_ALT: '<>',
  LESS_THAN: '<',
  LESS_THAN_OR_EQUAL: '<=',
  GREATER_THAN: '>',
  GREATER_THAN_OR_EQUAL: '>=',
});

const QUERY_AGGREGATE = Object.freeze({
  COUNT: 'COUNT',
  SUM: 'SUM',
  AVG: 'AVG',
  MIN: 'MIN',
  MAX: 'MAX',
});

const QUERY_SQL_FRAGMENT = Object.freeze({
  SELECT_PREFIX: 'SELECT ',
  DISTINCT_PREFIX: 'DISTINCT ',
  STAR: '*',
  GROUP_BY_PREFIX: ' GROUP BY ',
  ORDER_BY_PREFIX: ' ORDER BY ',
  IN: ' IN ',
  BETWEEN: ' BETWEEN ',
  LIKE: ' LIKE ',
  NULL: 'NULL',
  PARAMETER: '?',
  COMMA_SPACE: ', ',
  PIPE: '|',
});

const QUERY_SORT_DIRECTION = Object.freeze({
  ASC: 'ASC',
  DESC: 'DESC',
});

const QUERY_SESSION = Object.freeze({
  DEFAULT: 'default',
});

const QUERY_DEFAULT_VALUE = Object.freeze({
  PRIMARY_KEY: 'id',
});

const SQL_PARSE_CACHE = Object.freeze({
  DEFAULT_MAX_SIZE: NUM.THOUSAND,
});

/**
 * System tables excluded from non-transactional write tracking.
 * This path is observability-only and would otherwise amplify control-plane
 * churn by emitting extra sql_write_operations rows for every system write.
 * User-table writes remain tracked.
 */
const WRITE_TRACKING_EXCLUDED_TABLES = Object.freeze(new Set([
  ...Object.values(TABLES),
]));

// Canonical config keys used by query subsystem components.
const QUERY_CONFIG_KEY = Object.freeze({
  QUERY_TIMEOUT_MS: CONFIG_KEY.QUERY_TIMEOUT_MS,
  MAX_PARALLEL_PARTITIONS: CONFIG_KEY.QUERY_MAX_PARALLEL_PARTITIONS,
  LEADER_RETRY_ATTEMPTS: CONFIG_KEY.QUERY_LEADER_RETRY_ATTEMPTS,
  LEADER_RETRY_DELAY_MS: CONFIG_KEY.QUERY_LEADER_RETRY_DELAY_MS,
  READ_RETRY_ATTEMPTS: CONFIG_KEY.QUERY_READ_RETRY_ATTEMPTS,

  COORDINATOR_MAX_PARALLEL_PARTITIONS:
    CONFIG_KEY.QUERY_COORDINATOR_MAX_PARALLEL_PARTITIONS,
  COORDINATOR_MAX_CONCURRENT_CONNECTIONS:
    CONFIG_KEY.QUERY_COORDINATOR_MAX_CONCURRENT_CONNECTIONS,
  COORDINATOR_MAX_RESULT_BUFFER_BYTES:
    CONFIG_KEY.QUERY_COORDINATOR_MAX_RESULT_BUFFER_BYTES,
  COORDINATOR_QUERY_TIMEOUT_MS: CONFIG_KEY.QUERY_COORDINATOR_QUERY_TIMEOUT_MS,
  COORDINATOR_STRAGGLER_THRESHOLD_MULTIPLIER:
    CONFIG_KEY.QUERY_COORDINATOR_STRAGGLER_THRESHOLD_MULTIPLIER,
  COORDINATOR_SPECULATIVE_EXECUTION_ENABLED:
    CONFIG_KEY.QUERY_COORDINATOR_SPECULATIVE_EXECUTION_ENABLED,
  COORDINATOR_SPECULATIVE_EXECUTION_DELAY_MS:
    CONFIG_KEY.QUERY_COORDINATOR_SPECULATIVE_EXECUTION_DELAY_MS,
  COORDINATOR_STREAMING_ENABLED: CONFIG_KEY.QUERY_COORDINATOR_STREAMING_ENABLED,
  COORDINATOR_STREAMING_CHUNK_SIZE:
    CONFIG_KEY.QUERY_COORDINATOR_STREAMING_CHUNK_SIZE,
});

const QUERY_DEFAULTS = Object.freeze({
  QUERY_TIMEOUT_MS: TIME_MS.SECOND * NUM.TEN * NUM.THREE,
  MAX_PARALLEL_PARTITIONS: NUM.THOUSAND,
  LEADER_RETRY_ATTEMPTS: NUM.FIVE,
  LEADER_RETRY_DELAY_MS: NUM.FIVE * NUM.TEN,
  READ_RETRY_ATTEMPTS: NUM.THREE,
  NO_SERVICE_WARN_THROTTLE_MS: TIME_MS.SECOND * NUM.FIVE,
  CONTROL_PLANE_NO_HANDLER_ADDRESS_QUARANTINE_MS:
    TIME_MS.SECOND * NUM.TEN * NUM.THREE,
  TABLE_CREATE_PROVISION_TIMEOUT_MS: TIME_MS.SECOND * NUM.TEN * NUM.THREE,
  TABLE_CREATE_PROVISION_POLL_INTERVAL_MS: NUM.FIVE * NUM.TEN,
  TABLE_CREATE_TARGET_NODE_CONVERGENCE_TIMEOUT_MS: TIME_MS.SECOND,

  COORDINATOR_MAX_PARALLEL_PARTITIONS: NUM.THOUSAND,
  COORDINATOR_MAX_CONCURRENT_CONNECTIONS: NUM.THOUSAND * NUM.TEN,
  COORDINATOR_MAX_RESULT_BUFFER_BYTES: NUM.BYTES_PER_MIB * NUM.BYTES_PER_KIB,
  COORDINATOR_QUERY_TIMEOUT_MS: TIME_MS.SECOND * NUM.TEN * NUM.THREE,
  COORDINATOR_STRAGGLER_THRESHOLD_MULTIPLIER: 2,
  COORDINATOR_SPECULATIVE_EXECUTION_DELAY_MS: NUM.TEN * NUM.TEN,
  COORDINATOR_STREAMING_CHUNK_SIZE: NUM.THOUSAND,
});

export {
  QUERY_AGGREGATE,
  QUERY_AST_TYPE,
  QUERY_AST_NODE,
  QUERY_CONFIG_KEY,
  QUERY_DEFAULTS,
  QUERY_DEFAULT_VALUE,
  QUERY_ERROR_CODE,
  QUERY_ERROR_MSG,
  QUERY_JOIN_TYPE,
  QUERY_LOG_MSG,
  QUERY_MESSAGE_TYPE,
  QUERY_OPERATION,
  QUERY_OPERATOR,
  QUERY_RESPONSE_TYPE,
  QUERY_ROUTER_ERROR_MSG,
  QUERY_ROUTER_LOG_MSG,
  QUERY_ROUTING_DIAGNOSTIC_REASON,
  QUERY_ROUTING_REPAIR_REASON,
  QUERY_SESSION,
  QUERY_SQL,
  QUERY_SQL_FRAGMENT,
  QUERY_STATUS,
  QUERY_SUBSYSTEM,
  QUERY_SORT_DIRECTION,
  SQL_PARSE_CACHE,
  WRITE_TRACKING_EXCLUDED_TABLES,
};
