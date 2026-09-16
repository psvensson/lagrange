// The host transcript's vocabulary.
//
// One event per production composition boundary the simulator can observe
// without production knowing a simulator exists, in the order phase one
// reaches them. Nothing here names a physical payload: the frame events say
// that a frame moved between two nodes, never what was in it, because
// deciding that a frame is an IDENTIFY is the MessageRouter's job and
// observing it belongs at the router's own control boundary.
const TRANSCRIPT_EVENT = Object.freeze({
  HOST_CREATED: 'host_created',
  NODE_RUNTIME_INITIALIZED: 'node_runtime_initialized',
  PHASE_INFRASTRUCTURE_STARTED: 'phase_infrastructure_started',

  ROUTER_FACTORY_CALLED: 'router_factory_called',
  ROUTER_CREATED: 'router_created',
  VIRTUAL_ENDPOINT_REGISTERED: 'virtual_endpoint_registered',

  SELF_DIAL_STARTED: 'self_dial_started',
  PHYSICAL_SOCKET_OPEN: 'physical_socket_open',

  FRAME_ENQUEUED: 'frame_enqueued',
  FRAME_DELIVERED: 'frame_delivered',

  IDENTIFY_RECEIVED: 'identify_received',
  SELF_IDENTITY_BOUND: 'self_identity_bound',

  LIFECYCLE_OWNER_CREATED: 'lifecycle_owner_created',
  SERVICE_RECONCILER_CREATED: 'service_reconciler_created',
  BOOTSTRAP_INFRASTRUCTURE_READY: 'bootstrap_infrastructure_ready',

  PHASE_INFRASTRUCTURE_COMPLETED: 'phase_infrastructure_completed',

  PHASE_MESSAGE_GROUPS_STARTED: 'phase_message_groups_started',
  MESSAGE_GROUP_REPLICA_DECLARED: 'message_group_replica_declared',
  RECONCILER_ACTION_EXECUTED: 'reconciler_action_executed',
  MESSAGE_GROUP_REPLICA_CREATED: 'message_group_replica_created',
  MESSAGE_GROUP_REPLICA_STARTED: 'message_group_replica_started',
  MESSAGE_GROUP_ELECTION_DEFERRED: 'message_group_election_deferred',
  PHASE_MESSAGE_GROUPS_COMPLETED: 'phase_message_groups_completed',

  PHASE_PARTITIONS_STARTED: 'phase_partitions_started',
  PARTITION_REPLICA_DECLARED: 'partition_replica_declared',
  PARTITION_REPLICA_CREATED: 'partition_replica_created',
  DEFERRED_ELECTIONS_STARTED: 'deferred_elections_started',
  PHASE_PARTITIONS_COMPLETED: 'phase_partitions_completed',

  PHASE_REGISTRATION_STARTED: 'phase_registration_started',
  BOOTSTRAP_MODE_ENTERED: 'bootstrap_mode_entered',
  PHASE_REGISTRATION_COMPLETED: 'phase_registration_completed',

  PHASE_CACHE_HYDRATION_STARTED: 'phase_cache_hydration_started',
  SYSTEM_CACHE_HYDRATED: 'system_cache_hydrated',
  BOOTSTRAP_MODE_EXITED: 'bootstrap_mode_exited',
  RUNTIME_WRITE_AUTHORITY_ENABLED: 'runtime_write_authority_enabled',
  PHASE_CACHE_HYDRATION_COMPLETED: 'phase_cache_hydration_completed',

  TEARDOWN_STARTED: 'teardown_started',
  VIRTUAL_ENDPOINT_RELEASED: 'virtual_endpoint_released',
  NODE_RUNTIME_STOPPED: 'node_runtime_stopped',
  TEARDOWN_COMPLETED: 'teardown_completed',
});

// The physical frame kinds the transport environment may report. They are
// link vocabulary, not protocol vocabulary.
const TRANSCRIPT_FRAME_KIND = Object.freeze({
  DATA: 'data',
  CLOSE: 'close',
});

export {TRANSCRIPT_EVENT, TRANSCRIPT_FRAME_KIND};
