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
