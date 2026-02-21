// ---------------------------------------------------------------------------
// CDC Lifecycle Constants
// ---------------------------------------------------------------------------
//
// Constants for awaitable CDC confirmation, CDC event buffering,
// pipeline readiness gates, cluster readiness signals, and CDC
// pipeline observability metrics.
// ---------------------------------------------------------------------------

// --- Timeouts and capacities ---

const CDC_CONFIRMATION_DEFAULT_TIMEOUT_MS = 5000;
const CDC_EVENT_BUFFER_CAPACITY = 1000;
const CDC_PIPELINE_READINESS_POLL_INTERVAL_MS = 100;
const CDC_PIPELINE_READINESS_TIMEOUT_MS = 30000;
const CLUSTER_READINESS_TIMEOUT_MS = 30000;

// --- Error type names ---

const CDC_CONFIRMATION_ERROR_TYPE = Object.freeze({
  TIMEOUT: 'CDCConfirmationTimeoutError',
  SHUTDOWN: 'CDCConfirmationShutdownError',
  GENERAL: 'CDCConfirmationError',
});

// --- Log messages ---

const CDC_LIFECYCLE_LOG_MSG = Object.freeze({
  EVENT_BUFFERED: 'CDC event buffered while no subscribers registered',
  EVENT_DROPPED_OVERFLOW: 'CDC event dropped due to buffer overflow',
  BUFFER_REPLAY_STARTED: 'Replaying buffered CDC events to subscriber',
  BUFFER_REPLAY_COMPLETE: 'Buffered CDC event replay complete',
  CONFIRMATION_TIMEOUT: 'CDC confirmation timed out',
  CONFIRMATION_SHUTDOWN: 'CDC confirmation rejected due to shutdown',
  PIPELINE_NOT_READY: 'CDC pipeline readiness conditions not met',
  PIPELINE_READY: 'CDC pipeline readiness confirmed',
  PIPELINE_READINESS_TIMEOUT: 'CDC pipeline readiness gate timed out',
  CLUSTER_NOT_READY: 'Cluster readiness conditions not met',
  CLUSTER_READY: 'Cluster readiness confirmed',
  CLUSTER_READINESS_TIMEOUT:
    'Cluster readiness timed out, proceeding with available state',
  NO_SUBSCRIBERS_NO_BUFFER:
    'CDC event generated with no subscribers and buffer full',
  MESSAGE_GROUP_RESOLUTION_NULL:
    'CDC propagation message group resolved to null',
  PROPAGATION_DELIVERY_FAILED: 'CDC event delivery failed',
});

// --- Metrics counter names ---

const CDC_PIPELINE_METRIC = Object.freeze({
  EVENTS_GENERATED: 'eventsGenerated',
  EVENTS_DELIVERED: 'eventsDelivered',
  EVENTS_BUFFERED: 'eventsBuffered',
  EVENTS_DROPPED: 'eventsDropped',
  DELIVERY_FAILURES: 'deliveryFailures',
});

// --- Pipeline readiness condition names ---

const CDC_PIPELINE_READINESS_CONDITION = Object.freeze({
  SUBSCRIPTIONS_ACTIVE: 'subscriptionsActive',
  PROPAGATION_LEADER: 'propagationLeader',
  PIPELINE_PROVEN: 'pipelineProven',
});

// --- Cluster readiness condition names ---

const CLUSTER_READINESS_CONDITION = Object.freeze({
  CDC_PIPELINE_READY: 'cdcPipelineReady',
  NODES_REGISTERED: 'nodesRegistered',
  CACHE_HYDRATED: 'cacheHydrated',
});

export {
  CDC_CONFIRMATION_DEFAULT_TIMEOUT_MS,
  CDC_CONFIRMATION_ERROR_TYPE,
  CDC_EVENT_BUFFER_CAPACITY,
  CDC_LIFECYCLE_LOG_MSG,
  CDC_PIPELINE_METRIC,
  CDC_PIPELINE_READINESS_CONDITION,
  CDC_PIPELINE_READINESS_POLL_INTERVAL_MS,
  CDC_PIPELINE_READINESS_TIMEOUT_MS,
  CLUSTER_READINESS_CONDITION,
  CLUSTER_READINESS_TIMEOUT_MS,
};
