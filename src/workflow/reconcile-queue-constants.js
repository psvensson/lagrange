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
  MESSAGE_DISPATCH_REQUEST: 'message_dispatch_request',
  NODE_STATE_UPDATE_MESSAGE: 'node_state_update_message',

  // Dispatch: node-ready retry reasons
  NODE_STATE_UPDATE_READY: 'node_state_update_ready',
  NODE_READY_DISPATCH_RETRY: 'node_ready_dispatch_retry',
  NODES_CDC_READY: 'nodes_cdc_ready',
  NODES_CACHE_READY: 'nodes_cache_ready',
  SERVICES_CACHE_ACTIVE: 'services_cache_active',

  // Rebalance: planning-level reasons
  PERIODIC_CHECK: 'periodic_check',
  NODE_BECAME_READY: 'node_became_ready',
  NODE_LEFT_READY: 'node_left_ready',
  NODE_FAILED: 'node_failed',
  BOOTSTRAP_NODE_READY: 'bootstrap_node_ready',
  LEADER_ELECTED: 'leader_elected',

  // Rebalance: operation execution reasons
  DISPATCH_EXECUTE: 'dispatch_execute',
  TIMEOUT_RECONCILE: 'timeout_reconcile',
  PROGRESS_RECONCILE: 'progress_reconcile',
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
  SHUTDOWN: 'Reconcile queue shutdown',
});

const RECONCILE_QUEUE_ERROR_MSG = Object.freeze({
  RECONCILE_FN_REQUIRED:
    'OwnerKeyReconcileQueue requires a reconcile function',
  OWNER_KEY_REQUIRED:
    'OwnerKeyReconcileQueue enqueue requires an owner key',
  STALE_FENCE_TOKEN:
    'OwnerKeyReconcileQueue claim rejected: stale fence token',
});

/**
 * Typed diagnostic codes for stale-claim and in-flight guard events.
 */
const RECONCILE_QUEUE_DIAGNOSTIC = Object.freeze({
  /** Reconcile attempt rejected because the owner key is already in-flight. */
  STALE_CLAIM_IN_FLIGHT: 'stale_claim_in_flight',
  /** Claim rejected because the fence token is stale. */
  STALE_FENCE_TOKEN: 'stale_fence_token',
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
});

/**
 * Maximum number of recent stale-fence event samples retained
 * in the diagnostics ring buffer.
 */
const STALE_FENCE_SAMPLE_CAPACITY = 32;

export {
  RECONCILE_QUEUE_SUBSYSTEM,
  RECONCILE_REASON,
  RECONCILE_QUEUE_LOG_MSG,
  RECONCILE_QUEUE_ERROR_MSG,
  RECONCILE_QUEUE_DIAGNOSTIC,
  RECONCILE_QUEUE_EVENT,
  STALE_FENCE_SAMPLE_CAPACITY,
};
