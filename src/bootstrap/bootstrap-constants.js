import {NUM, RUNTIME_KIND, TABLES, TIME_MS} from '../constants/index.js';
import {JOINING_SUB_PHASE} from '../node/node-constants.js';

const DEFAULT_REPLICA_STAGGER_DELAY_MS = 50;
const DEFAULT_MAX_CONCURRENT_SERVICE_ACTIONS = 16;
const DEFAULT_REPLICA_REGISTRATION_TRACE_ENABLED = false;

const BOOTSTRAP_ASSIGNMENT_STRATEGY = Object.freeze({
  MOVE_REPLICA: 'MOVE_REPLICA',
  CREATE_SELF_HOSTED: 'CREATE_SELF_HOSTED',
});

const BOOTSTRAP_PHASE = Object.freeze({
  NOT_STARTED: 'not_started',
  INFRASTRUCTURE: 'infrastructure',
  MESSAGE_GROUPS: 'message_groups',
  PARTITIONS: 'partitions',
  REGISTRATION: 'registration',
  CACHE_HYDRATION: 'cache_hydration',
  COMPLETE: 'complete',
  FAILED: 'failed',
});

/**
 * Shared cleanup result constants for seed and join cleanup paths.
 * Both SeedCleanupHandler and JoinCleanupHandler use these values
 * so diagnostics shape is consistent (D3.3, Requirement 2.4).
 */
const CLEANUP_RESULT = Object.freeze({
  SUCCESS: 'success',
  ERROR: 'error',
  SKIPPED: 'skipped',
});

/**
 * Cleanup steps for failed bootstrap, executed in reverse phase order.
 * Each step corresponds to undoing the work of a bootstrap phase.
 */
const BOOTSTRAP_CLEANUP_STEP = Object.freeze({
  CACHE_HYDRATION: 'cache_hydration',
  REGISTRATION: 'registration',
  PARTITIONS: 'partitions',
  MESSAGE_GROUPS: 'message_groups',
  INFRASTRUCTURE: 'infrastructure',
});

const BOOTSTRAP_PIPELINE_PHASE = Object.freeze({
  INFRA: 'infra',
  RAFT_ELECTION: 'raft_election',
  SYSTEM_TABLE_SEED: 'system_table_seed',
  CACHE_HYDRATION: 'cache_hydration',
  CDC_SUBSCRIBE: 'cdc_subscribe',
  CONTROL_PLANE_REGISTER: 'control_plane_register',
  READY: 'ready',
  FAILED: 'failed',
});

const BOOTSTRAP_PIPELINE_ERROR_CODE = Object.freeze({
  BOOTSTRAP_NOT_READY: 'BOOTSTRAP_NOT_READY',
  LEADER_METADATA_INCOMPLETE: 'LEADER_METADATA_INCOMPLETE',
  SQL_ENGINE_UNAVAILABLE: 'SQL_ENGINE_UNAVAILABLE',
  SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT:
    'SERVICE_REGISTRATION_CACHE_VISIBILITY_TIMEOUT',
});

const BOOTSTRAP_PIPELINE_TIMEOUT_MS = Object.freeze({
  INFRA: 5000,
  RAFT_ELECTION: 30000,
  SYSTEM_TABLE_SEED: 10000,
  CACHE_HYDRATION: 10000,
  CDC_SUBSCRIBE: 5000,
  CONTROL_PLANE_REGISTER: 10000,
});

const JOINING_PHASE = Object.freeze({
  NOT_STARTED: 'not_started',
  CONTACTING_SEED: 'contacting_seed',
  CONNECTING_WEBSOCKET: 'connecting_websocket',
  CREATING_MESSAGE_GROUP: 'creating_message_group',
  JOINING_MESSAGE_GROUP: 'joining_message_group',
  WAITING_LEADERSHIP: 'waiting_leadership',
  QUERYING_STATE: 'querying_state',
  COMPLETE: 'complete',
  FAILED: 'failed',
});

/**
 * Declarative mapping from JOINING_PHASE to JOINING_SUB_PHASE
 * for NodeLifecycleStateMachine sub-phase transitions during join.
 * Mirrors bootstrap's PHASE_TO_SUB_PHASE pattern (D5.1, Req 4.1, 4.4).
 */
const JOINING_PHASE_TO_SUB_PHASE = Object.freeze({
  [JOINING_PHASE.CONTACTING_SEED]:
    JOINING_SUB_PHASE.CONTACTING_SEED,
  [JOINING_PHASE.CONNECTING_WEBSOCKET]:
    JOINING_SUB_PHASE.CONNECTING_WEBSOCKET,
  [JOINING_PHASE.CREATING_MESSAGE_GROUP]:
    JOINING_SUB_PHASE.CREATING_MESSAGE_GROUP,
  [JOINING_PHASE.JOINING_MESSAGE_GROUP]:
    JOINING_SUB_PHASE.JOINING_MESSAGE_GROUP,
  [JOINING_PHASE.WAITING_LEADERSHIP]:
    JOINING_SUB_PHASE.WAITING_LEADERSHIP,
  [JOINING_PHASE.QUERYING_STATE]:
    JOINING_SUB_PHASE.QUERYING_STATE,
});

const BOOTSTRAP_SUBSYSTEM = Object.freeze({
  SERVICE: 'bootstrap',
  API: 'bootstrap-api',
  TRACKER: 'bootstrap-tracker',
  NODE_JOINING: 'node-joining',
});

const BOOTSTRAP_LOG_PREFIX = Object.freeze({
  JOIN_DEBUG: '[JOIN-DEBUG]',
});

const BOOTSTRAP_READY_MESSAGE = Object.freeze({
  TYPE: 'NODE_READY',
  PATH: 'ready',
});

const BOOTSTRAP_REBALANCE_REASON = Object.freeze({
  NODE_READY: 'node_ready',
});

const BOOTSTRAP_NODE_READY_REBALANCE_TABLES = Object.freeze([
  TABLES.NODES,
  TABLES.TABLES,
  TABLES.PARTITIONS,
  TABLES.SERVICES,
  TABLES.MESSAGE_GROUPS,
  TABLES.CONTROL_PLANE_PUBLICATIONS,
  TABLES.REPLICA_OPERATIONS,
  TABLES.NODE_ENDPOINTS,
  TABLES.SERVICE_DEFINITIONS,
  TABLES.SERVICE_ENDPOINTS,
  TABLES.CONFIG,
]);

// Delay before triggering rebalancing after a node becomes ready.
// Keep this short so cluster-growth runs surface placement changes in-time.
const BOOTSTRAP_REBALANCE_DELAY_MS = 5000;

const BOOTSTRAP_MESSAGE_GROUP = Object.freeze({
  NAME: 'message_group_seed',
  REPLICA_COUNT: 3,
  POLICY: Object.freeze({
    TARGET_REPLICA_COUNT: 3,
    MAX_REPLICA_COUNT: 5,
    ENSURE_LOCAL_ACCESS: true,
  }),
});

const BOOTSTRAP_REPLICA_REGISTRATION_REASON = Object.freeze({
  BOOTSTRAP_REGISTRATION: 'bootstrap_registration',
});

const BOOTSTRAP_EPOCH = Object.freeze({
  CONFIG_DESCRIPTION: 'Authoritative cluster assignment epoch',
});

const BOOTSTRAP_REPLICA_PROGRESS = Object.freeze({
  PREFIX: '[replica-create]',
  TYPE_PARTITION: 'partition',
  SPINNER_IDLE: '|',
});

const BOOTSTRAP_UNIFIED_RECONCILE = Object.freeze({
  INFRA_READY_REASON: 'bootstrap_infrastructure_ready',
  MESSAGE_GROUPS_REASON: 'bootstrap_message_groups',
  PARTITIONS_REASON: 'bootstrap_partitions',
  CHECK_INTERVAL_MS: TIME_MS.MINUTE * (NUM.THIRTY * NUM.TWO),
  RUNTIME_KIND: RUNTIME_KIND.NATIVE_JS,
});

const BOOTSTRAP_REPLICA_REGISTRATION_TRACE = Object.freeze({
  PREFIX: '[bootstrap replica registration]',
  SCOPE_PARTITION: 'partition',
  SCOPE_STATE: 'state',
  EVENT_START: 'start',
  EVENT_CALL_BEGIN: 'call_begin',
  EVENT_CALL_END: 'call_end',
  EVENT_ATTEMPT: 'attempt',
  EVENT_TRANSITION_BEGIN: 'transition_begin',
  EVENT_TRANSITION_END: 'transition_end',
  EVENT_SUCCESS: 'success',
  EVENT_ERROR: 'error',
  EVENT_COMPLETE: 'complete',
  EVENT_SKIP_MISSING_PARTITION: 'skip_missing_partition',
});

/**
 * Concern-scoped delegate bundle names for seed bootstrap.
 * Each bundle groups delegates by concern so phase/readiness/cleanup
 * owners receive only the dependencies they need (D2.2).
 */
const SEED_DELEGATE_BUNDLE = Object.freeze({
  PHASE_EXECUTION: 'phaseExecution',
  READINESS: 'readiness',
  CLEANUP: 'cleanup',
  RUNTIME_WIRING: 'runtimeWiring',
});

/**
 * Concern-scoped delegate bundle names for join bootstrap.
 * Mirrors SEED_DELEGATE_BUNDLE so join phase/readiness/cleanup
 * owners receive only the dependencies they need (D2.2).
 */
const JOIN_DELEGATE_BUNDLE = Object.freeze({
  PHASE_EXECUTION: 'phaseExecution',
  READINESS: 'readiness',
  CLEANUP: 'cleanup',
  RUNTIME_WIRING: 'runtimeWiring',
});

/**
 * Named segment keys for the join startup plan (D4.1, Req 3.1).
 * Each key identifies a checkpoint boundary group of phases.
 */
const JOIN_PLAN_SEGMENT = Object.freeze({
  SEED_CONTACT: 'seedContact',
  INFRASTRUCTURE: 'infrastructure',
  MEMBERSHIP: 'membership',
  READINESS: 'readiness',
});

const BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT = Object.freeze({
  TIMEOUT_CAP_MS: 5000,
  INITIAL_DELAY_MS: 10,
  MAX_DELAY_MS: 100,
  BACKOFF_MULTIPLIER: 1.5,
});

const BOOTSTRAP_EVENT = Object.freeze({
  COMPLETE: 'complete',
  FAILED: 'failed',
  PHASE_START: 'phaseStart',
  PHASE_COMPLETE: 'phaseComplete',
  PHASE_FAILED: 'phaseFailed',
  SHUTDOWN: 'shutdown',
});

const BOOTSTRAP_LOG_MSG = Object.freeze({
  STARTING: 'Starting bootstrap process',
  COMPLETED: 'Bootstrap completed successfully',
  PHASE_STARTING: 'Starting bootstrap phase',
  PHASE_COMPLETED: 'Bootstrap phase completed',
  PHASE_FAILED: 'Bootstrap phase failed',
  WS_SELF_CONNECTED: 'WebSocket server started and self-connection established',
  ROUTER_INIT_FAILED: 'MessageRouter initialization failed',
  INFRA_READY: 'Infrastructure setup complete',
  RUNTIME_WIRING_READY: 'Runtime startup wiring initialized',
  CREATING_MESSAGE_GROUP: 'Creating initial message group',
  MESSAGE_GROUP_REPLICA_CREATED: 'Message group replica created',
  MESSAGE_GROUPS_CREATED_DEFERRED: 'Message group replicas created, elections deferred',
  WAITING_MESSAGE_GROUP_LEADER: 'Waiting for message group leadership',
  MESSAGE_GROUP_LEADER_IMMEDIATE: 'Message group leader found immediately',
  MESSAGE_GROUP_LEADER_FOUND: 'Message group leader found',
  WAITING_PARTITION_LEADERS: 'Waiting for partition leadership',
  PARTITION_LEADERS_IMMEDIATE: 'All partition leaders found immediately',
  PARTITION_LEADERS_FOUND: 'All partition leaders found',
  PARTITION_LEADERS_PENDING: 'Some partitions still electing leaders, failing bootstrap',
  CREATING_SYSTEM_PARTITION: 'Creating system table partition',
  PARTITION_REPLICA_CREATED: 'Partition replica created',
  PARTITION_CREATION_BATCH_STARTING:
    'Starting first system table partition creation batch',
  STARTING_MG_ELECTIONS: 'Starting elections for message group replicas',
  MESSAGE_GROUP_LEADERSHIP_READY: 'Message group leadership established',
  STARTING_PARTITION_ELECTIONS: 'Starting elections for all partition replicas',
  PARTITIONS_CREATED: 'All system table partitions created',
  EPOCH_MANAGER_READY: 'AssignmentEpochManager initialized',
  CDC_SUBSCRIPTION_START: 'Setting up CDC subscription',
  CDC_PARTITION_MISSING: 'Partition not found for CDC subscription',
  CDC_EVENT_RECEIVED: 'CDC event received by bootstrap handler',
  CDC_SUBSCRIPTION_REGISTERED: 'CDC subscription registered on replica',
  REBALANCE_TRIGGER: 'Triggering rebalancing on all partitions',
  BOOTSTRAP_MODE_ENABLED: 'Bootstrap mode enabled for direct partition writes',
  BOOTSTRAP_MODE_DISABLED: 'Bootstrap mode disabled, routing through SQL engine',
  SERVICE_REGISTRATION_COMPLETE: 'Service registration complete',
  SERVICE_DEFINITIONS_SCHEMA_MIGRATING:
    'Migrating service_definitions schema to canonical contract',
  SERVICE_DEFINITIONS_SCHEMA_MIGRATED:
    'service_definitions schema migrated to canonical contract',
  CDC_MG_UNAVAILABLE: 'CDC integration service not available for message group registration',
  MESSAGE_GROUP_REGISTERED: 'Message group registered',
  MESSAGE_GROUP_REGISTER_FAILED: 'Failed to register message group',
  CDC_SERVICE_UNAVAILABLE: 'CDC integration service not available for service registration',
  MESSAGE_GROUP_SERVICE_REGISTER_FAILED: 'Failed to register message group service',
  PARTITION_SERVICE_REGISTER_FAILED: 'Failed to register partition service',
  SERVICES_REGISTERED: 'Services registered',
  CDC_TABLE_UNAVAILABLE: 'CDC integration service not available for table registration',
  TABLE_REGISTER_FAILED: 'Failed to register table',
  PARTITION_REGISTER_FAILED: 'Failed to register partition',
  SYSTEM_TABLES_REGISTERED: 'System tables registered',
  CDC_SIZE_UNAVAILABLE: 'CDC integration service not available for size update',
  PARTITION_SIZE_UPDATED: 'Updated partition size',
  PARTITION_SIZE_UPDATE_FAILED: 'Failed to update partition size',
  PARTITION_SIZES_UPDATED: 'Partition sizes updated',
  CONFIG_LEADER_MISSING: 'Config partition leader not available for seeding',
  CONFIG_ALREADY_SEEDED: 'Config already seeded, skipping',
  CONFIG_CHECK_FAILED: 'Could not check existing config, proceeding with seeding',
  CONFIG_SEEDED: 'Dynamic configuration seeded',
  CONFIG_SEED_FAILED: 'Failed to seed dynamic configuration',
  CACHE_UNAVAILABLE: 'No system table cache available for hydration',
  CDC_HYDRATION_MISSING: 'No message group available for CDC hydration',
  CACHE_HYDRATION_STARTING: 'Starting cache hydration from local partitions',
  CACHE_HYDRATION_READING: 'Reading system table data from local partitions',
  TABLE_HYDRATED: 'System table hydrated from local partition',
  TABLE_HYDRATION_FAILED: 'Failed to hydrate system table from local partition',
  CACHE_HYDRATION_COMPLETE: 'Cache hydration complete',
  CACHE_HYDRATION_INCOMPLETE: 'Cache hydration incomplete - some tables missing or empty',
  CACHE_HYDRATION_VERIFIED: 'Cache hydration verified - all expected tables populated',
  CDC_DYNAMIC_PARTITION_EVENT: 'CDC event received from dynamically created partition',
  CDC_DYNAMIC_SUBSCRIPTION: 'CDC subscription set up for dynamically created partition',
  REPLICA_HANDLER_READY: 'ReplicaHandler initialized',
  REPLICA_HANDLER_MISSING: 'No replica handler provided for partition registration',
  REPLICA_HANDLER_REGISTER_FAILED: 'Failed to register partition with replica handler',
  REPLICA_HANDLER_REGISTERED: 'Registered partitions with replica handler',
  CONTROL_PLANE_READY: 'Control plane service initialized',
  CONTROL_PLANE_BACKGROUND_WRITERS_ACTIVE:
    'Control plane background writers activated',
  LATENCY_TOPOLOGY_READY: 'Latency topology services initialized',
  LATENCY_TOPOLOGY_STARTED: 'Latency topology lifecycle started',
  CONTROL_PLANE_REGISTER_FAILED: 'Failed to register seed node via control plane',
  STATE_MACHINE_MISSING: 'No state machine provided for replica registration',
  STATE_MACHINE_REGISTER_FAILED: 'Failed to register replica with state machine',
  STATE_MACHINE_REGISTERED: 'Registered replicas with state machine',
  BOOTSTRAP_FAILED: 'Bootstrap failed',
  CLEANUP_START: 'Cleaning up partially initialized services',
  PARTITION_CLEANED: 'Partition service cleaned up',
  PARTITION_CLEANUP_FAILED: 'Error cleaning up partition service',
  MESSAGE_GROUP_CLEANED: 'Message group service cleaned up',
  MESSAGE_GROUP_CLEANUP_FAILED: 'Error cleaning up message group service',
  CLEANUP_COMPLETE: 'Cleanup complete',
  WS_PORT_MISSING: 'No WebSocket port configured, skipping server start',
  WS_ALREADY_RUNNING: 'WebSocket server already running',
  WS_SERVER_STARTED: 'WebSocket server started for cross-node communication',
  SHUTDOWN: 'Shutting down bootstrap service',
  BOOTSTRAP_EXIT_FAILED: 'Bootstrap failed, exiting with non-zero exit code',
  FAILED_BOOTSTRAP_CLEANUP_START:
    'Starting failed bootstrap cleanup in reverse phase order',
  FAILED_BOOTSTRAP_CLEANUP_CACHE:
    'Clearing system table cache during failed bootstrap cleanup',
  FAILED_BOOTSTRAP_CLEANUP_CACHE_DONE:
    'System table cache cleared during failed bootstrap cleanup',
  FAILED_BOOTSTRAP_CLEANUP_CACHE_ERROR:
    'Error clearing system table cache during failed bootstrap cleanup',
  FAILED_BOOTSTRAP_CLEANUP_REGISTRATION:
    'Removing partial registration entries during failed bootstrap cleanup',
  FAILED_BOOTSTRAP_CLEANUP_REGISTRATION_DONE:
    'Partial registration entries removed during failed bootstrap cleanup',
  FAILED_BOOTSTRAP_CLEANUP_REGISTRATION_ERROR:
    'Error removing registration entries during failed bootstrap cleanup',
  FAILED_BOOTSTRAP_CLEANUP_PARTITIONS:
    'Stopping partition services during failed bootstrap cleanup',
  FAILED_BOOTSTRAP_CLEANUP_PARTITIONS_DONE:
    'Partition services stopped during failed bootstrap cleanup',
  FAILED_BOOTSTRAP_CLEANUP_PARTITIONS_ERROR:
    'Error stopping partition services during failed bootstrap cleanup',
  FAILED_BOOTSTRAP_CLEANUP_MESSAGE_GROUPS:
    'Stopping message group services during failed bootstrap cleanup',
  FAILED_BOOTSTRAP_CLEANUP_MESSAGE_GROUPS_DONE:
    'Message group services stopped during failed bootstrap cleanup',
  FAILED_BOOTSTRAP_CLEANUP_MESSAGE_GROUPS_ERROR:
    'Error stopping message group services during failed bootstrap cleanup',
  FAILED_BOOTSTRAP_CLEANUP_INFRASTRUCTURE:
    'Stopping message router during failed bootstrap cleanup',
  FAILED_BOOTSTRAP_CLEANUP_INFRASTRUCTURE_DONE:
    'Message router stopped during failed bootstrap cleanup',
  FAILED_BOOTSTRAP_CLEANUP_INFRASTRUCTURE_ERROR:
    'Error stopping message router during failed bootstrap cleanup',
  FAILED_BOOTSTRAP_CLEANUP_COMPLETE:
    'Failed bootstrap cleanup complete',
  FAILED_BOOTSTRAP_CLEANUP_SUMMARY:
    'Failed bootstrap cleanup summary',
  REGISTERING_SERVICE: 'Registering service',
});

const BOOTSTRAP_ERROR = Object.freeze({
  routerInitFailed: (message) => `MessageRouter initialization failed: ${message}`,
  messageGroupLeadershipTimeout: (groupId, timeoutMs) =>
    `Message group ${groupId} failed to establish leadership within ${timeoutMs}ms`,
  partitionLeadershipTimeout: (missingLeaders, timeoutMs) =>
    `Partition leaders not established within ${timeoutMs}ms: ${missingLeaders.join(', ')}`,
  PARTITION_REPLICAS_MISSING: 'Partition replica set not configured',
  NODES_LEADER_MISSING: 'Nodes partition leader not available',
  ROUTER_NOT_READY: 'MessageRouter not initialized - bootstrap must complete first',
  CDC_REPLICA_HANDLER_MISSING: 'CDC integration service not initialized for replica handler',
  CDC_CONTROL_PLANE_MISSING: 'CDC integration service not initialized for control plane',
  CDC_HYDRATION_MISSING: 'No message group available for CDC hydration',
  LATENCY_TOPOLOGY_MISSING: 'Latency topology services are not initialized',
  SYSTEM_CACHE_MISSING: 'System table cache not available',
  seedReadyTimeout: (nodeId, timeoutMs) =>
    `Seed node ${nodeId} not ready in system cache within ${timeoutMs}ms`,
});

const BOOTSTRAP_SQL = Object.freeze({
  CONFIG_COUNT: 'SELECT COUNT(*) as count FROM config',
  EPOCH_EXISTS:
    'SELECT config_key FROM config WHERE config_key = ?',
});

const BOOTSTRAP_DEFAULT = Object.freeze({
  leadershipWaitTimeoutMs: 30000,
  leadershipWaitInitialDelayMs: 100,
  leadershipWaitMaxDelayMs: 5000,
  leadershipWaitBackoffMultiplier: 2,
  partitionDbPath: ':memory:',
  replicaStaggerDelayMs: DEFAULT_REPLICA_STAGGER_DELAY_MS,
  maxConcurrentServiceActions: DEFAULT_MAX_CONCURRENT_SERVICE_ACTIONS,
  replicaRegistrationTraceEnabled: DEFAULT_REPLICA_REGISTRATION_TRACE_ENABLED,
  nodeReadyRebalanceDelayMs: BOOTSTRAP_REBALANCE_DELAY_MS,
  wsPort: null,
});

export {
  BOOTSTRAP_ASSIGNMENT_STRATEGY,
  BOOTSTRAP_CLEANUP_STEP,
  CLEANUP_RESULT,
  BOOTSTRAP_DEFAULT,
  BOOTSTRAP_ERROR,
  BOOTSTRAP_EVENT,
  BOOTSTRAP_EPOCH,
  BOOTSTRAP_LOG_MSG,
  BOOTSTRAP_LOG_PREFIX,
  BOOTSTRAP_MESSAGE_GROUP,
  BOOTSTRAP_PIPELINE_ERROR_CODE,
  BOOTSTRAP_PIPELINE_PHASE,
  BOOTSTRAP_PIPELINE_TIMEOUT_MS,
  BOOTSTRAP_PHASE,
  BOOTSTRAP_NODE_READY_REBALANCE_TABLES,
  BOOTSTRAP_READY_MESSAGE,
  BOOTSTRAP_REBALANCE_DELAY_MS,
  BOOTSTRAP_REBALANCE_REASON,
  BOOTSTRAP_REPLICA_PROGRESS,
  BOOTSTRAP_REPLICA_REGISTRATION_REASON,
  BOOTSTRAP_REPLICA_REGISTRATION_TRACE,
  BOOTSTRAP_PARTITION_LEADERSHIP_DEFAULT,
  BOOTSTRAP_SQL,
  BOOTSTRAP_SUBSYSTEM,
  BOOTSTRAP_UNIFIED_RECONCILE,
  DEFAULT_MAX_CONCURRENT_SERVICE_ACTIONS,
  DEFAULT_REPLICA_STAGGER_DELAY_MS,
  JOIN_DELEGATE_BUNDLE,
  JOIN_PLAN_SEGMENT,
  JOINING_PHASE,
  JOINING_PHASE_TO_SUB_PHASE,
  SEED_DELEGATE_BUNDLE,
};
