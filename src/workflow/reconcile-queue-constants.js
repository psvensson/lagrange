/**
 * Constants for OwnerKeyReconcileQueue.
 */

const RECONCILE_QUEUE_SUBSYSTEM = 'owner-key-reconcile-queue';

/**
 * Typed reason codes for enqueued reconcile work items.
 * Each reason identifies the trigger that caused the enqueue.
 */
const RECONCILE_REASON = Object.freeze({
  // Dispatch: operation-level reasons
  COORDINATOR_OPERATION_CREATED: 'coordinator_operation_created',
  CDC_OPERATION_PENDING: 'cdc_operation_pending',
  CDC_REPLACE_ACTIVE: 'cdc_replace_active',
  REPLICA_OPERATIONS_CACHE_PENDING: 'replica_operations_cache_pending',
  REPLICA_OPERATIONS_CACHE_REPLACE_ACTIVE:
    'replica_operations_cache_replace_active',
  MESSAGE_DISPATCH_REQUEST: 'message_dispatch_request',
  RETRYABLE_OPERATION_DISPATCH: 'retryable_operation_dispatch',

  // Dispatch: node-ready retry reasons
  NODE_STATE_UPDATE_READY: 'node_state_update_ready',
  NODE_READY_DISPATCH_RETRY: 'node_ready_dispatch_retry',
  READINESS_PLANNING_SNAPSHOT_PUBLISHED:
    'readiness_planning_snapshot_published',
  NODES_CDC_READY: 'nodes_cdc_ready',
  NODES_CACHE_READY: 'nodes_cache_ready',
  SERVICES_CACHE_ACTIVE: 'services_cache_active',
  CONTROL_PLANE_PUBLICATION_CDC_UPDATE:
    'control_plane_publication_cdc_update',
  CONTROL_PLANE_PUBLICATION_CACHE_UPDATE:
    'control_plane_publication_cache_update',
  CONTROL_PLANE_PUBLICATION_ACK_RETRY:
    'control_plane_publication_ack_retry',
  TOPOLOGY_DURABLE_TRUTH_SCAN: 'topology_durable_truth_scan',

  // Rebalance: planning-level reasons
  PERIODIC_CHECK: 'periodic_check',
  NODE_BECAME_READY: 'node_became_ready',
  NODE_LEFT_READY: 'node_left_ready',
  NODE_FAILED: 'node_failed',
  BOOTSTRAP_NODE_READY: 'bootstrap_node_ready',
  LEADER_ELECTED: 'leader_elected',
  PRIORITY_RECOVERY_PROGRESS: 'priority_recovery_progress',
  PRIORITY_SPREAD_RELEASE_WAKE: 'priority_spread_release_wake',
  LOCAL_MUTATION_READINESS_WAKE: 'local_mutation_readiness_wake',
  OPERATION_CREATION_ADMISSION_CLEARED:
    'operation_creation_admission_cleared',
  OPERATION_LIST_READ_SOURCE_CHANGED: 'operation_list_read_source_changed',
  PRIORITY_SPREAD_FENCE_CENSUS_ANSWERED:
    'priority_spread_fence_census_answered',
  RUNTIME_SERVICE_DESIRED_STATE: 'runtime_service_desired_state',

  // Rebalance: operation execution reasons
  DISPATCH_EXECUTE: 'dispatch_execute',
  TIMEOUT_RECONCILE: 'timeout_reconcile',
  PROGRESS_RECONCILE: 'progress_reconcile',

  // Bound WASM creation continuation (design SERVING-PUBLICATION-RETIREMENT
  // Revision 3 N14): a native raft event of a held creation; the wakes the
  // lifecycle hands the operation owner of the original CREATE.
  CREATION_NATIVE_PROGRESS: 'creation_native_progress',
  CREATION_GENESIS_OBSERVED: 'creation_genesis_observed',
  CREATION_GRANT_HELD: 'creation_grant_held',
  CREATION_RESOURCE_CLOSED: 'creation_resource_closed',
});

const RECONCILE_QUEUE_LOG_MSG = Object.freeze({
  ENQUEUED: 'Reconcile work enqueued',
  DEDUP_MERGED: 'Reconcile work merged with pending item',
  DRAIN_START: 'Reconcile queue drain started',
  DRAIN_ITEM: 'Processing reconcile queue item',
  DRAIN_COMPLETE: 'Reconcile queue drain completed',
  DRAIN_ERROR: 'Reconcile queue item processing failed',
  IN_FLIGHT_CLAIMED: 'Owner key claimed for in-flight reconcile',
  IN_FLIGHT_RELEASED: 'Owner key released from in-flight reconcile',
  IN_FLIGHT_DEFERRED: 'Owner key deferred — already in-flight',
  STALE_FENCE_REJECTED: 'Claim rejected — stale fence token',
  RATE_LIMITED_REQUEUE:
    'Owner key re-enqueued during consecutive runs with no declared ' +
    'change — next run rate-limited',
  SHUTDOWN: 'Reconcile queue shutdown',
});

const RECONCILE_QUEUE_ERROR_MSG = Object.freeze({
  RECONCILE_FN_REQUIRED:
    'OwnerKeyReconcileQueue requires a reconcile function',
  OWNER_KEY_REQUIRED:
    'OwnerKeyReconcileQueue enqueue requires an owner key',
  STALE_FENCE_TOKEN:
    'OwnerKeyReconcileQueue claim rejected: stale fence token',
  SELF_REQUEUE_DECLARATION_INVALID:
    'OwnerKeyReconcileQueue selfRequeue must name exactly one of ' +
    'changed (a non-empty string) or delayMs (a positive safe integer)',
  SCHEDULE_DRAIN_FN_INVALID:
    'OwnerKeyReconcileQueue scheduleDrainFn must be a function when declared',
});

/**
 * Typed diagnostic codes for stale-claim and in-flight guard events.
 */
const RECONCILE_QUEUE_DIAGNOSTIC = Object.freeze({
  /** Reconcile attempt rejected because the owner key is already in-flight. */
  STALE_CLAIM_IN_FLIGHT: 'stale_claim_in_flight',
  /** Claim rejected because the fence token is stale. */
  STALE_FENCE_TOKEN: 'stale_fence_token',
  /**
   * An owner key re-enqueued during each of its last runs with no declared
   * change: its next run is held back by the rate limit.
   */
  RATE_LIMITED_REQUEUE: 'rate_limited_requeue',
});

/**
 * How the queue classified an enqueue of an owner key whose reconcile is in
 * flight (made from inside that run, or by an event during it: the queue
 * cannot tell them apart without async-context tracking, which it does not
 * pay for).
 */
const RECONCILE_QUEUE_IN_FLIGHT_REQUEUE = Object.freeze({
  /** The owner key is not in flight: ordinary admission. */
  NOT_IN_FLIGHT: 'not_in_flight',
  /** `selfRequeue.changed` names what changed: admitted, and the key's rate
   * limit restarts. */
  CHANGED: 'changed',
  /** `selfRequeue.delayMs`: held until the delay has passed. */
  DELAYED: 'delayed',
  /** No declaration: admitted behind the turn boundary and counted toward
   * the key's rate limit. */
  UNDECLARED: 'undeclared',
});

/**
 * Rate limit of an owner key re-enqueued during each of its consecutive
 * runs with no declared change: the first FREE_RUNS successors only wait for
 * the next host turn; each further one is held, doubling from BASE_MS up to
 * MAX_MS. A run that ends with no successor, or whose successor names a
 * change, restarts the count.
 */
const RECONCILE_QUEUE_REQUEUE_RATE_LIMIT = Object.freeze({
  FREE_RUNS: 8,
  BASE_MS: 25,
  MAX_MS: 1000,
});

/** What readQueuedContext found for one owner key. */
const OWNER_KEY_QUEUED_CONTEXT_STATE = Object.freeze({
  /** Pending or waiting for its retry instant: `context` is its input. */
  QUEUED: 'queued',
  /** Nothing queued for the key (it may be in flight or held). */
  NOT_QUEUED: 'not_queued',
});

/**
 * Typed event names emitted by OwnerKeyReconcileQueue.
 * Consumers subscribe via queue.on(EVENT_NAME, handler).
 */
const RECONCILE_QUEUE_EVENT = Object.freeze({
  /** Emitted when a stale fence token is rejected at enqueue time. */
  STALE_FENCE_REJECTED_ENQUEUE: 'stale_fence_rejected_enqueue',
  /** Emitted when a stale fence token is rejected at drain time. */
  STALE_FENCE_REJECTED_DRAIN: 'stale_fence_rejected_drain',
  /** Emitted when a work item is deferred because the key is in-flight. */
  STALE_CLAIM_DEFERRED: 'stale_claim_deferred',
  /** Emitted when an owner key's next run is held by the rate limit. */
  RATE_LIMITED_REQUEUE: 'rate_limited_requeue',
});

/**
 * Maximum number of recent stale-fence event samples retained
 * in the diagnostics ring buffer.
 */
const STALE_FENCE_SAMPLE_CAPACITY = 32;

export {
  OWNER_KEY_QUEUED_CONTEXT_STATE,
  RECONCILE_QUEUE_SUBSYSTEM,
  RECONCILE_REASON,
  RECONCILE_QUEUE_LOG_MSG,
  RECONCILE_QUEUE_ERROR_MSG,
  RECONCILE_QUEUE_DIAGNOSTIC,
  RECONCILE_QUEUE_EVENT,
  RECONCILE_QUEUE_IN_FLIGHT_REQUEUE,
  RECONCILE_QUEUE_REQUEUE_RATE_LIMIT,
  STALE_FENCE_SAMPLE_CAPACITY,
};
