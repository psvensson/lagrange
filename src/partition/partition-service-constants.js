import {NUM} from '../constants/numbers.js';
import {STRING} from '../constants/strings.js';
import {TABLES} from '../constants/tables.js';
import {TIME_MS} from '../constants/time.js';
import {RAFT_ELECTION_TIMING} from '../raft/constants.js';

const PARTITION_SERVICE_DEFAULT = Object.freeze({
  NODE_ID: STRING.UNKNOWN,
  MEMORY_DB_PATH: ':memory:',
  DEFAULT_REPLICA_COUNT: NUM.THREE,
  SIZE_UPDATE_DEBOUNCE_MS: TIME_MS.SECOND * NUM.FIVE,
  SIZE_UPDATE_INTERVAL_MS: TIME_MS.MINUTE,
  PENDING_REQUEST_TIMEOUT_MS: TIME_MS.SECOND * 30,
  KEY_RANGE_START: null,
  KEY_RANGE_END: null,
  CDC_BUFFER_REPLAY_INITIAL_DELAY_MS: 50,
  CDC_BUFFER_REPLAY_MAX_DELAY_MS: TIME_MS.SECOND * NUM.TEN,
  // Learner phase: new replicas joining existing groups start as non-voting learners
  // They receive log entries but don't vote until caught up
  // This prevents new replicas from disrupting existing leadership
  LEARNER_PROMOTION_DELAY_MS: TIME_MS.SECOND * 30, // Min time before promotion (30s for stability)
  LEARNER_CATCH_UP_CHECK_INTERVAL_MS: TIME_MS.SECOND, // How often to check catch-up
  MAX_TRACKED_APPLIED_ENTRIES: NUM.THOUSAND * NUM.FIVE,
  MAX_COMMITTED_WRITE_LOG_ENTRIES: NUM.THOUSAND,
  PREPARED_STATE_HOLD_SWEEP_INTERVAL_MS: TIME_MS.SECOND,
});

const PARTITION_SERVICE_SQL = Object.freeze({
  CREATE_RAFT_STATE_TABLE: `
      CREATE TABLE IF NOT EXISTS _raft_state (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `,
  CREATE_RAFT_LOG_TABLE: `
      CREATE TABLE IF NOT EXISTS _raft_log (
        log_index INTEGER PRIMARY KEY,
        term INTEGER NOT NULL,
        command TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `,
  SELECT_RAFT_STATE_VALUE: 'SELECT value FROM _raft_state WHERE key = ?',
  SELECT_RAFT_LOGS:
    'SELECT log_index, term, command, timestamp FROM _raft_log ORDER BY log_index',
  UPSERT_RAFT_STATE: 'INSERT OR REPLACE INTO _raft_state (key, value) VALUES (?, ?)',
  UPSERT_RAFT_LOG:
    'INSERT OR REPLACE INTO _raft_log (log_index, term, command, timestamp) ' +
    'VALUES (?, ?, ?, ?)',
  DELETE_RAFT_LOG_FROM: 'DELETE FROM _raft_log WHERE log_index >= ?',
  BEGIN_IMMEDIATE: 'BEGIN IMMEDIATE',
  SAVEPOINT_PREPARE: 'SAVEPOINT prepare_transaction',
  COMMIT: 'COMMIT',
  ROLLBACK: 'ROLLBACK',
  UPDATE_SERVICE_RAFT_ROLE:
    `UPDATE ${TABLES.SERVICES} SET raft_role = ?, updated_at = ? ` +
    'WHERE (service_id = ?)',
});

const PARTITION_SERVICE_SQL_FRAGMENT = Object.freeze({
  PRIMARY_KEY: ' PRIMARY KEY',
  NOT_NULL: ' NOT NULL',
  COMMA_SPACE: ', ',
  AND: ' AND ',
  QUESTION_MARK: '?',
  OPEN_PAREN: '(',
  CLOSE_PAREN: ')',
  COMMA: ',',
  SINGLE_QUOTE: '\'',
  DOUBLE_QUOTE: '"',
  NULL_VALUE: 'NULL',
});

const PARTITION_SERVICE_STATE_KEY = Object.freeze({
  CURRENT_TERM: 'currentTerm',
  VOTED_FOR: 'votedFor',
});

const PARTITION_SERVICE_MESSAGE_TYPE = Object.freeze({
  FORWARD_WRITE: 'FORWARD_WRITE',
  SYSTEM_TABLE_WRITE: 'SYSTEM_TABLE_WRITE',
  QUERY: 'QUERY',
  TRANSACTION: 'TRANSACTION',
  START_SPLIT_REPLICATION: 'START_SPLIT_REPLICATION',
});

const PARTITION_SERVICE_RESPONSE = Object.freeze({
  LEADER_REDIRECT: 'LEADER_REDIRECT',
});

const PARTITION_SERVICE_OPERATION = Object.freeze({
  WRITE: 'WRITE',
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  UPSERT: 'UPSERT',
  QUERY: 'QUERY',
  MIGRATION_ALTER_TABLE: 'MIGRATION_ALTER_TABLE',
  BEGIN_TRANSACTION: 'BEGIN_TRANSACTION',
  PREPARE_TRANSACTION: 'PREPARE_TRANSACTION',
  COMMIT: 'COMMIT',
  ROLLBACK: 'ROLLBACK',
  TRANSACTION_COMMIT: 'TRANSACTION_COMMIT',
});

const PARTITION_SERVICE_ROLE = Object.freeze({
  LEADER: 'leader',
  FOLLOWER: 'follower',
  CANDIDATE: 'candidate',
});

const PARTITION_SERVICE_EVENT = Object.freeze({
  DATA: 'data',
  INITIALIZED: 'initialized',
  LEADER_ELECTED: 'leaderElected',
  ENTRY_COMMITTED: 'entryCommitted',
  KEY_RANGE_CHANGED: 'keyRangeChanged',
  SIZE_UPDATED: 'sizeUpdated',
  CDC_EVENT: 'cdcEvent',
  CDC_CATCHUP_STARTED: 'cdcCatchupStarted',
  CDC_CATCHUP_COMPLETED: 'cdcCatchupCompleted',
  SHUTDOWN: 'shutdown',
});

const PARTITION_SERVICE_REASON = Object.freeze({
  COMMIT: 'commit',
  LEADER_CHANGE: 'leader change',
  TERM_CHANGE: 'term change',
});

const PARTITION_SERVICE_ADDRESS = Object.freeze({
  SEPARATOR: '/',
  FORMAT_UNIFIED: 'unified',
  FORMAT_SIMPLE: 'simple',
});

const PARTITION_SERVICE_DB = Object.freeze({
  PRAGMA_JOURNAL_MODE: 'journal_mode = WAL',
  PRAGMA_SYNCHRONOUS: 'synchronous = NORMAL',
  PRAGMA_PAGE_COUNT: 'page_count',
  PRAGMA_PAGE_SIZE: 'page_size',
  PRAGMA_SIMPLE: 'simple',
});

const PARTITION_SERVICE_COLUMN = Object.freeze({
  CONNECTION_STATE: 'connection_state',
  LEGACY_WS_CONNECTION_STATE: 'ws_connection_state',
  CAPABILITIES: 'capabilities',
  READY_LEASE_EXPIRES_AT: 'ready_lease_expires_at',
  TABLE_NAME: 'table_name',
  ACTIVE_PARTITION_VERSION: 'active_partition_version',
  PENDING_PARTITION_VERSION: 'pending_partition_version',
  PARTITION_TRANSITION_STATE: 'partition_transition_state',
  PARTITION_TRANSITION_METADATA: 'partition_transition_metadata',
  PARTITION_VERSION: 'partition_version',
});

const PARTITION_SERVICE_COLUMN_SQL = Object.freeze({
  ADD_CONNECTION_STATE:
    'ADD COLUMN connection_state TEXT DEFAULT \'disconnected\'',
  ADD_CAPABILITIES:
    'ADD COLUMN capabilities TEXT DEFAULT \'[]\'',
  ADD_READY_LEASE_EXPIRES_AT:
    'ADD COLUMN ready_lease_expires_at INTEGER',
  ADD_LEADER_NODE_ID:
    'ADD COLUMN leader_node_id TEXT',
  ADD_TABLE_NAME:
    'ADD COLUMN table_name TEXT',
  ADD_ACTIVE_PARTITION_VERSION:
    'ADD COLUMN active_partition_version INTEGER NOT NULL DEFAULT 1',
  ADD_PENDING_PARTITION_VERSION:
    'ADD COLUMN pending_partition_version INTEGER',
  ADD_PARTITION_TRANSITION_STATE:
    'ADD COLUMN partition_transition_state TEXT',
  ADD_PARTITION_TRANSITION_METADATA:
    'ADD COLUMN partition_transition_metadata TEXT',
  ADD_PARTITION_VERSION:
    'ADD COLUMN partition_version INTEGER NOT NULL DEFAULT 1',
  BACKFILL_CONNECTION_STATE_FROM_LEGACY_WS:
    'SET connection_state = ws_connection_state ' +
    'WHERE ws_connection_state IS NOT NULL',
});

const PARTITION_SERVICE_LIFERAFT_TIMER = Object.freeze({
  HEARTBEAT: 'heartbeat',
  ELECTION_MIN: 'election min',
  ELECTION_MAX: 'election max',
  LOG: 'Log',
  HEARTBEAT_ELECTION: 'heartbeat, election',
});

const PARTITION_SERVICE_STATUS = Object.freeze({
  INITIATED: 'initiated',
});

const PARTITION_SERVICE_MIGRATION_OPERATION = Object.freeze({
  ALTER_TABLE: 'alter_table',
});

const PARTITION_SERVICE_TYPE = Object.freeze({
  FUNCTION: 'function',
});

const PARTITION_SERVICE_CDC = Object.freeze({
  HANDSHAKE_STATUS_OK: 'ok',
  HANDSHAKE_STATUS_ALREADY_SUBSCRIBED: 'already_subscribed',
  CATCHUP_MODE_NONE: 'none',
  CATCHUP_MODE_BACKFILL: 'backfill',
  CATCHUP_MODE_SLIDING_WINDOW: 'sliding_window',
  STREAM_MODE_CATCHUP: 'catchup',
  STREAM_MODE_STEADY: 'steady',
  SUBSCRIBER_ID_PREFIX: 'cdc-subscriber',
  REPLAY_REASON_BUFFERED_REMAINING: 'buffered_events_remaining',
});

const PARTITION_SERVICE_INIT_STAGE = Object.freeze({
  STARTING: 'starting',
  OPENING_DB: 'opening_db',
  JOINING_PEERS: 'joining_peers',
  JOINED_PEER: 'joined_peer',
  READY: 'ready',
});

const PARTITION_SERVICE_LOG_MSG = Object.freeze({
  INITIALIZING: 'Initializing partition service',
  CREATED_PARTITION_DIR: 'Created partition directory',
  DEFERRING_ELECTION_START: 'Deferring election start',
  STARTING_AS_LEARNER: 'Starting as learner (non-voting) - will promote after catch-up',
  LEARNER_PROMOTION_SCHEDULED: 'Learner promotion check scheduled',
  LEARNER_PROMOTED_TO_FOLLOWER: 'Learner promoted to follower - now participating in elections',
  LEARNER_PROMOTION_CHECK: 'Checking learner promotion eligibility',
  LEARNER_PROMOTION_DEFERRED: 'Learner promotion deferred - would cause even voter count',
  LEARNER_PROMOTION_ALLOWED_MULTI: 'Learner promotion allowed - multiple learners will reach odd',
  CLEARED_LIFERAFT_TIMERS: 'Cleared liferaft timers for deferred election',
  BECAME_LEADER: 'Became leader (liferaft)',
  LEADER_CHANGED: 'Leader changed',
  JOINING_PEER_ADDRESS: 'Joining peer with fully qualified address',
  PEER_ADDRESS_NOT_UNIFIED: 'Peer address must be in unified format',
  PEER_ADDRESS_FROM_LIST: 'Built peer address from peerAddresses array',
  PEER_ADDRESS_FROM_CACHE: 'Built peer address from cache',
  PEER_ADDRESS_FROM_NODE: 'Built peer address using local nodeId',
  SINGLE_REPLICA_LEADER: 'Single replica - becoming leader immediately',
  INITIALIZED: 'Partition service initialized',
  STARTING_ELECTION_TIMER: 'Starting Raft election timer',
  APPLIED_RUNTIME_RAFT_TIMING: 'Applied runtime raft timing configuration',
  CREATED_TABLE: 'Created table',
  ADDED_CONNECTION_STATE: 'Added connection_state column to nodes table',
  MIGRATED_CONNECTION_STATE_FROM_LEGACY_WS:
    'Migrated connection_state values from legacy ws_connection_state column',
  ADDED_CAPABILITIES: 'Added capabilities column to nodes table',
  ADDED_READY_LEASE: 'Added ready_lease_expires_at column to nodes table',
  ADDED_MESSAGE_GROUP_LEADER: 'Added leader_node_id column to message_groups table',
  ADDED_ACTIVE_PARTITION_VERSION:
    'Added active_partition_version column to tables table',
  ADDED_PENDING_PARTITION_VERSION:
    'Added pending_partition_version column to tables table',
  ADDED_PARTITION_TRANSITION_STATE:
    'Added partition_transition_state column to tables table',
  ADDED_PARTITION_TRANSITION_METADATA:
    'Added partition_transition_metadata column to tables table',
  ADDED_PARTITIONS_TABLE_NAME: 'Added table_name column to partitions table',
  ADDED_PARTITION_VERSION: 'Added partition_version column to partitions table',
  RECEIVED_RAFT_PACKET: 'Received Raft packet',
  SENDING_RAFT_RESPONSE: 'Sending Raft response',
  FAILED_RAFT_RESPONSE: 'Failed to send Raft response',
  UNKNOWN_MESSAGE_TYPE: 'Unknown application message type',
  HANDLING_SYSTEM_TABLE_WRITE: 'Handling system table write from remote node',
  HANDLING_REMOTE_QUERY: 'Handling remote query',
  START_SPLIT_REPLICATION_REQUEST:
    'Handling partition split replication request',
  SPLIT_REPLICATION_STARTED: 'Partition split replication started',
  SPLIT_REPLICATION_COMPLETED: 'Partition split replication completed',
  SPLIT_REPLICATION_FAILED: 'Partition split replication failed',
  SPLIT_REPLICATION_MIRROR_FAILED: 'Partition split mirror delivery failed',
  SPLIT_REPLICATION_CUTOVER_UPDATED:
    'Partition split cutover metadata updated',
  SPLIT_REPLICATION_ACK_EMITTED:
    'Partition split source acknowledgement emitted',
  SPLIT_REPLICATION_ACK_FAILED:
    'Partition split source acknowledgement failed',
  SPLIT_REPLICATION_RECONSTRUCTED:
    'Partition split execution state reconstructed from durable workflow',
  SPLIT_REPLICATION_SIZE_PERSIST_FAILED:
    'Partition size persistence failed',
  REDIRECTING_WRITE_TO_LEADER: 'Redirecting write to leader',
  APPLYING_COMMITTED_ENTRY: 'Applying committed entry',
  TRANSACTION_COMMIT_APPLIED: 'Transaction commit entry applied',
  BEGINNING_TRANSACTION: 'Beginning transaction',
  PREPARING_TRANSACTION: 'Preparing transaction',
  PREPARED_STATE_RECONSTRUCTED: 'Prepared transaction state reconstructed',
  PREPARED_STATE_HOLD_TIMEOUT: 'Prepared transaction state hold timeout',
  COMMITTING_TRANSACTION: 'Committing transaction',
  ROLLING_BACK_TRANSACTION: 'Rolling back transaction',
  EXECUTING_QUERY: 'Executing query',
  APPLY_WRITE_CALLED: 'applyWrite called',
  GENERATE_CDC_EVENT_CALLED: 'generateCDCEvent called',
  NO_CDC_SUBSCRIBERS: 'No CDC subscribers, skipping event generation',
  DETECTED_OPERATION_TYPE: 'Detected operation type from SQL',
  EXTRACTED_TABLE_NAME: 'Extracted table name from SQL',
  GENERATED_CDC_EVENT: 'Generated CDC event',
  CDC_DELIVERY_COMPLETE: 'CDC event delivery complete',
  CDC_DELIVERY_BUFFERED_FOR_RETRY:
    'CDC event buffered for retry after delivery failure',
  CDC_BUFFER_REPLAY_SCHEDULED: 'Scheduled buffered CDC replay',
  CDC_BUFFER_REPLAY_COMPLETE: 'Buffered CDC replay complete',
  CDC_BUFFER_REPLAY_FAILED: 'Buffered CDC replay failed',
  FETCHED_INSERT_ROW: 'Fetched inserted row for CDC',
  FETCHING_UPDATE_ROW: 'Fetching updated row for CDC',
  FETCHED_UPDATE_ROW: 'Fetched updated row for CDC',
  EXTRACTED_PARAM_INSERT: 'Extracted data from parameterized INSERT',
  EXTRACTED_PARAM_UPDATE: 'Extracted data from parameterized UPDATE',
  EXTRACTED_PARAM_DELETE: 'Extracted data from parameterized DELETE',
  CDC_SUBSCRIBER_ADDED: 'CDC subscriber added',
  CDC_SUBSCRIBER_REMOVED: 'CDC subscriber removed',
  CDC_SUBSCRIPTION_HANDSHAKE_ACK:
    'CDC subscription handshake acknowledged',
  CDC_CATCHUP_STARTED: 'CDC catch-up replay started',
  CDC_CATCHUP_COMPLETED: 'CDC catch-up replay completed',
  PARTITION_SIZE_UPDATED: 'Partition size updated',
  INIT_STAGE_CALLBACK_FAILED: 'Partition initialization stage callback failed',
  DELIVERING_WITH_ACK: 'Delivering message with ACK via PendingRequestTracker',
  TRACKER_SHUTDOWN: 'Tracker shutdown',
  TRACKER_SHUTDOWN_DELIVERY:
    'Tracker shutdown during delivery - operation completed',
  TRACKER_SHUTDOWN_ACK:
    'Tracker shutdown during ACK wait - operation completed',
  REPLICA_REMOVAL_SELF: 'Replica removal completed (self-removal)',
  RECEIVED_ACK: 'Received ACK in transport response',
  SHUTTING_DOWN: 'Shutting down partition service',
  TIMER_SKIPPED_AFTER_SHUTDOWN:
    'Timer creation skipped - partition service already shut down',
  MIGRATION_ALTER_TABLE_APPLIED: 'Applied migration ALTER TABLE command',
  MIGRATION_DEFAULT_REGISTERED: 'Registered migration column default',
});

const PARTITION_SERVICE_ERROR_MSG = Object.freeze({
  REQUIRE_PARTITION_ID: 'PartitionService requires partitionId',
  REQUIRE_TABLE_ID: 'PartitionService requires tableId',
  REQUIRE_REPLICA_ID: 'PartitionService requires replicaId',
  INVALID_MESSAGE: 'Invalid message',
  INVALID_FORWARD_WRITE: 'Invalid FORWARD_WRITE message',
  INVALID_SPLIT_REPLICATION: 'Invalid START_SPLIT_REPLICATION message',
  unknownMessage: (type) => `Unknown message type: ${type}`,
  unknownOperation: (operation) => `Unknown operation: ${operation}`,
  forwardWriteFailed: (message) =>
    `Failed to forward write to leader: ${message}`,
  SYSTEM_TABLE_WRITE_FAILED: 'System table write failed',
  MISSING_SQL_QUERY: 'Missing SQL query',
  REMOTE_QUERY_FAILED: 'Remote query execution failed',
  CDC_EVENT_FAILED: 'Failed to generate CDC event for committed entry',
  APPLY_COMMITTED_FAILED: 'Failed to apply committed entry',
  NOT_INITIALIZED: 'PartitionService not initialized',
  TRANSACTION_ALREADY_ACTIVE: 'Transaction already active on this partition',
  BEGIN_TRANSACTION_FAILED: 'Failed to begin transaction',
  PREPARE_CONFLICT: 'Prepare failed due to write conflict',
  NO_ACTIVE_TRANSACTION_PREPARE: 'No active transaction to prepare',
  SNAPSHOT_EXPIRED: 'Snapshot history expired for transaction epoch',
  PREPARE_LOST: 'Prepared state lost after failover',
  NO_ACTIVE_TRANSACTION_COMMIT: 'No active transaction to commit',
  COMMIT_TRANSACTION_FAILED: 'Failed to commit transaction',
  NO_ACTIVE_TRANSACTION_ROLLBACK: 'No active transaction to rollback',
  ROLLBACK_TRANSACTION_FAILED: 'Failed to rollback transaction',
  NO_ACTIVE_TRANSACTION: 'No active transaction',
  TRANSACTION_WRITE_FAILED: 'Transaction write failed',
  RAFT_COMMAND_FAILED: 'Raft command failed',
  TRANSACTION_COMMIT_RAFT_FAILED: 'Raft command failed for transaction commit',
  QUERY_FAILED: 'Query execution failed',
  CDC_UNKNOWN_OPERATION: 'Unknown operation type, skipping CDC',
  CDC_PARSE_INSERT_FAILED: 'Could not parse INSERT SQL for CDC',
  CDC_INSERT_MISMATCH: 'Column/value count mismatch in INSERT SQL',
  CDC_FETCH_INSERT_FAILED: 'Failed to fetch inserted row for CDC',
  CDC_FETCH_UPDATE_FAILED: 'Failed to fetch updated row for CDC',
  CDC_NO_ROW_UPDATE: 'No row found for CDC update',
  CDC_EXTRACT_UPDATE_WHERE_FAILED: 'Could not extract WHERE clause from UPDATE SQL',
  CDC_EXTRACT_DELETE_WHERE_FAILED: 'Could not extract WHERE clause from DELETE SQL',
  CDC_PARSE_PARAM_INSERT_COLUMNS_FAILED:
    'Could not parse columns from parameterized INSERT',
  CDC_PARAM_INSERT_MISMATCH:
    'Column/param count mismatch in parameterized INSERT',
  CDC_PARSE_PARAM_UPDATE_SET_FAILED:
    'Could not parse SET clause from parameterized UPDATE',
  CDC_PARAM_UPDATE_MISMATCH:
    'Column/param count mismatch in parameterized UPDATE',
  CDC_PARSE_PARAM_DELETE_WHERE_FAILED:
    'Could not parse WHERE from parameterized DELETE',
  CDC_PARAM_DELETE_MISMATCH:
    'Column/param count mismatch in parameterized DELETE',
  CDC_DELIVERY_FAILED: 'Failed to deliver CDC event',
  CDC_SUBSCRIPTION_FAILED: 'Failed to subscribe CDC listener',
  CDC_INVALID_SUBSCRIBER:
    'CDC subscriber must be a function or object with handleCDCEvent',
  PARTITION_SIZE_FAILED: 'Failed to calculate partition size',
  PARTITION_SIZE_UPDATE_FAILED: 'Failed to update partition size',
  SPLIT_REPLICATION_ROUTING_FAILED:
    'Failed to route mirrored partition split write',
  SPLIT_REPLICATION_STATE_REQUIRED:
    'Partition split transition metadata is required',
  PERSIST_LEADER_AFTER_CDC_FAILED:
    'Failed to persist partition leader after CDC service set',
  PERSIST_PARTITION_LEADER_FAILED: 'Failed to persist partition leader update',
  PERSIST_ROLE_AFTER_CDC_FAILED:
    'Failed to persist role update after CDC service set',
  PERSIST_RAFT_ROLE_FAILED: 'Failed to persist raft role update',
  REBALANCER_CACHE_REQUIRED: 'PartitionService requires systemTableCache for rebalancer',
  REBALANCER_CDC_REQUIRED: 'PartitionService requires cdcIntegrationService for rebalancer',
  REBALANCER_POLICY_REQUIRED: 'PartitionService requires tablePolicyService for rebalancer',
  REBALANCER_ROUTER_REQUIRED: 'PartitionService requires messageRouter for rebalancer',
  REBALANCER_SQL_ENGINE_REQUIRED:
    'PartitionService requires sqlQueryEngine for rebalancer',
  REBALANCER_COORDINATOR_REQUIRED:
    'PartitionService requires rebalanceCoordinator for rebalancer',
  REBALANCER_SET_COORDINATOR_REQUIRED:
    'PartitionService rebalancer must implement setRebalanceCoordinator',
  REBALANCE_COORDINATOR_SHUTDOWN_FAILED:
    'Failed to shutdown rebalance coordinator',
  DELIVERY_NOT_ACK: 'Delivery not acknowledged',
  NESTED_ACK_UNSUPPORTED: 'Nested ACK responses are not supported',
  MESSAGE_DELIVERY_FAILED: 'Message delivery failed',
  MIGRATION_ALTER_MISSING_SQL: 'Migration ALTER TABLE SQL is required',
});

const PARTITION_SERVICE_VALUE = Object.freeze({
  ONE_HUNDRED: NUM.HUNDRED,
  TEN: NUM.TEN,
  DEFAULT_TIMEOUT_MS: TIME_MS.SECOND * 30,
  PENDING_REQUEST_SHUTDOWN_TIMEOUT_MS: TIME_MS.SECOND * 30,
  DEFAULT_QUERY_TIMEOUT_MS: NUM.HUNDRED,
  SIZE_BYTES_DIVISOR: NUM.BYTES_PER_MIB,
  SIZE_MB_PRECISION: NUM.TWO,
  // Raft timing: heartbeat should be much smaller than election timeout
  // Election timeout should be 5-10x heartbeat to avoid unnecessary elections
  // On single-node clusters, all replicas are on same node so network is fast
  // but we still need stable leadership to avoid oscillation
  LIFERAFT_HEARTBEAT_DEFAULT_MS: RAFT_ELECTION_TIMING.HEARTBEAT_DEFAULT_MS,
  LIFERAFT_ELECTION_MIN_DEFAULT_MS: RAFT_ELECTION_TIMING.ELECTION_MIN_DEFAULT_MS,
  LIFERAFT_ELECTION_MAX_DEFAULT_MS: RAFT_ELECTION_TIMING.ELECTION_MAX_DEFAULT_MS,
  // Jitter added per replica index to stagger election timeouts.
  // Must be >= (LIFERAFT_ELECTION_MAX - LIFERAFT_ELECTION_MIN) so that
  // replica N's max timeout is always less than replica N+1's min timeout.
  // This guarantees r1 always fires first, preventing re-elections.
  // r1: [1000,3000], r2: [3500,5500], r3: [6000,8000], etc.
  ELECTION_JITTER_PER_REPLICA_MS: RAFT_ELECTION_TIMING.JITTER_PER_REPLICA_MS,
  CDC_WHERE_LIMIT: NUM.HUNDRED,
  CDC_PARSE_LIMIT: NUM.HUNDRED,
  CDC_REDACTION_LIMIT: NUM.HUNDRED,
  CDC_PARSE_SLICE_START: NUM.ZERO,
  CDC_PARSE_SLICE_END: NUM.HUNDRED,
  LIFERAFT_SINGLE_REPLICA_COUNT: NUM.ONE,
  ADDRESS_PARTS_MIN: NUM.ONE,
});

export {
  PARTITION_SERVICE_CDC,
  PARTITION_SERVICE_ADDRESS,
  PARTITION_SERVICE_COLUMN,
  PARTITION_SERVICE_COLUMN_SQL,
  PARTITION_SERVICE_DB,
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_ERROR_MSG,
  PARTITION_SERVICE_EVENT,
  PARTITION_SERVICE_INIT_STAGE,
  PARTITION_SERVICE_LIFERAFT_TIMER,
  PARTITION_SERVICE_MIGRATION_OPERATION,
  PARTITION_SERVICE_LOG_MSG,
  PARTITION_SERVICE_MESSAGE_TYPE,
  PARTITION_SERVICE_OPERATION,
  PARTITION_SERVICE_REASON,
  PARTITION_SERVICE_RESPONSE,
  PARTITION_SERVICE_ROLE,
  PARTITION_SERVICE_SQL,
  PARTITION_SERVICE_SQL_FRAGMENT,
  PARTITION_SERVICE_STATE_KEY,
  PARTITION_SERVICE_STATUS,
  PARTITION_SERVICE_TYPE,
  PARTITION_SERVICE_VALUE,
};
