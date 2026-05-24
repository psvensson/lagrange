import {NUM, TYPEOF} from '../constants/index.js';
import {resolveCdcPropagationDeliveryProfile} from
  '../cache/cdc-propagation-delivery-profile.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../control-plane/control-plane-readiness-constants.js';
import {SYSTEM_TABLE_NAME} from
  '../bootstrap/system-table-schemas-constants.js';

const MESSAGE_GROUP_FORWARDING_OWNER_LITERAL = Object.freeze({
  AUTHORITATIVE_MESSAGE_DASH_GROUP_FORWARD_TOPOLOGY_REPAIR_FAILED:
    'Authoritative message-group forward topology repair failed',
  BACKGROUND: 'background',
  CDC_FORWARD_TO_LEADER_REJECTED: 'CDC forward to leader rejected',
  CLOSED: 'closed',
  CONNECTION_TO_NODE: 'Connection to node',
  CRITICAL: 'critical',
  EAI_AGAIN: 'EAI_AGAIN',
  ECONNREFUSED: 'ECONNREFUSED',
  ENOTFOUND: 'ENOTFOUND',
  FORWARD_SLASH: '/',
  IS_SATURATED: 'is saturated',
  MESSAGE_DASH_GROUP_DASH_SERVICE: 'message-group-service',
  METADATA_INGRESS: 'metadata_ingress',
  NO_CONNECTION_TO_NODE: 'No connection to node',
  NO_HANDLER_REGISTERED_FOR_ADDRESS: 'No handler registered for address',
  OUTBOUND_QUEUE_BACKPRESSURED: 'OUTBOUND_QUEUE_BACKPRESSURED',
  OUTBOUND_QUEUE_FOR_NODE: 'Outbound queue for node',
  REPAIRED_MESSAGE_DASH_GROUP_FORWARD_TOPOLOGY_FROM_AUTHORITATIVE_ROWS:
    'Repaired message-group forward topology from authoritative rows',
  ZERO: 0,
});

const STRICT_CDC_FORWARD_SYSTEM_TABLES = new Set(
  Object.values(SYSTEM_TABLE_NAME),
);
const FORWARD_TOPOLOGY_REPAIR_OUTCOME = Object.freeze({
  FAILED: 'failed',
  REPAIRED: 'repaired',
  UNCHANGED: 'unchanged',
});

const MESSAGE_GROUP_FORWARDING_REASON = Object.freeze({
  INGRESS_NOT_INITIALIZED: 'message-group ingress not initialized',
});

const MESSAGE_GROUP_CDC_INGRESS_ACTION = Object.freeze({
  APPLY_LOCAL: 'apply_local',
  DEFER: 'defer',
  FORWARD: 'forward',
});

const MESSAGE_GROUP_CDC_INGRESS_INITIALIZATION = Object.freeze({
  OPTIONAL: 'optional',
  REQUIRED: 'required',
});

const MESSAGE_GROUP_CDC_INGRESS_STATE = Object.freeze({
  DEFER_INGRESS_NOT_INITIALIZED: 'defer_ingress_not_initialized',
  DEFER_STRICT_TARGET_UNKNOWN: 'defer_strict_target_unknown',
  FORWARD_NON_STRICT: 'forward_non_strict',
  FORWARD_STRICT_RECOVERY_TARGET: 'forward_strict_recovery_target',
  FORWARD_STRICT_TARGET: 'forward_strict_target',
  LOCAL_RAFT_LEADER: 'local_raft_leader',
  LOCAL_STRICT_CONVERGENCE_INGRESS: 'local_strict_convergence_ingress',
  LOCAL_STRICT_RECOVERY_INGRESS: 'local_strict_recovery_ingress',
});

const MESSAGE_GROUP_CDC_RECOVERY_ROUTING_STATE = Object.freeze({
  LOCAL_ONLY: 'local_only',
  NONE: 'none',
  REMOTE_TARGETS_AVAILABLE: 'remote_targets_available',
});

const MESSAGE_GROUP_CDC_RELAY_CONVERGENCE_MIN_DEPTH = NUM.ONE;

const MESSAGE_GROUP_CDC_FORWARD_FAILURE_STATE = Object.freeze({
  NON_RETRYABLE_DEFER: 'non_retryable_defer',
  RETRYABLE_DEFER: 'retryable_defer',
});

const MESSAGE_GROUP_LEADER_IDENTITY_SOURCE = Object.freeze({
  CACHE_ROW: 'cache_row',
  LIVE_LOCAL_LEADER: 'live_local_leader',
  NONE: 'none',
  PENDING_PUBLICATION: 'pending_publication',
  PERSISTED_PUBLICATION: 'persisted_publication',
});

const MESSAGE_GROUP_LEADER_IDENTITY_STATE = Object.freeze({
  CACHE_CONFIRMED: 'cache_confirmed',
  LIVE_LOCAL_HINT: 'live_local_hint',
  MISSING: 'missing',
  PUBLICATION_PENDING: 'publication_pending',
  PUBLICATION_PERSISTED: 'publication_persisted',
});

function buildMessageGroupLeaderIdentitySnapshot(
  state,
  source,
  leaderNodeId,
) {
  return Object.freeze({
    state,
    source,
    leaderNodeId,
  });
}

const MESSAGE_GROUP_CDC_LOG_CONTEXT_FIELD = Object.freeze({
  ADDRESSED_STRICT_CONVERGENCE: 'addressedStrictConvergence',
});

function normalizeCDCForwardDeliveryEvents(
  tableName,
  payload = null,
) {
  const fallbackTableName =
    typeof payload?.tableName === TYPEOF.STRING &&
      payload.tableName.length > NUM.ZERO ?
      payload.tableName :
      typeof tableName === TYPEOF.STRING && tableName.length > NUM.ZERO ?
        tableName :
        null;
  const payloadEvents = Array.isArray(payload?.events) ?
    payload.events :
    [payload];
  const normalizedEvents = payloadEvents
    .filter((event) => event && typeof event === TYPEOF.OBJECT)
    .map((event) => ({
      tableName:
        typeof event?.tableName === TYPEOF.STRING &&
          event.tableName.length > NUM.ZERO ?
          event.tableName :
          fallbackTableName,
      data: event?.data && typeof event.data === TYPEOF.OBJECT ?
        event.data :
        null,
      operation:
        typeof event?.operation === TYPEOF.STRING &&
          event.operation.length > NUM.ZERO ?
          event.operation :
          null,
    }));
  if (normalizedEvents.length === NUM.ZERO) {
    return [{
      tableName: fallbackTableName,
      data: null,
      operation:
        typeof payload?.operation === TYPEOF.STRING &&
          payload.operation.length > NUM.ZERO ?
          payload.operation :
          null,
    }];
  }
  return normalizedEvents;
}

function resolveCDCForwardDeliveryProfile(
  tableName,
  payload = null,
  replayOnly = false,
) {
  return resolveCdcPropagationDeliveryProfile(
    normalizeCDCForwardDeliveryEvents(tableName, payload),
    {replayOnly},
  );
}

function buildForwardTopologyRepairReadOptions(service, workloadProfile) {
  return {
    queryTimeoutMs: service.forwardTopologyRepairQueryTimeoutMs,
    sessionId:
      `message-group-forward-topology:${service.groupId}:${service.now()}`,
    routingReadinessDimension:
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    workloadClass: workloadProfile.workloadClass,
    workClass: workloadProfile.workClass,
    allowPressureDegrade: workloadProfile.allowPressureDegrade,
    allowPressureDefer: workloadProfile.allowPressureDefer,
    preferOwnerRpcRead: false,
    requireOwnerRpcRead: false,
    allowOwnerRpcFallback: false,
    allowSqlFallback: false,
    confirmEmptyLocalReadWithOwnerRpc: false,
  };
}

export {
  FORWARD_TOPOLOGY_REPAIR_OUTCOME,
  MESSAGE_GROUP_CDC_FORWARD_FAILURE_STATE,
  MESSAGE_GROUP_CDC_INGRESS_ACTION,
  MESSAGE_GROUP_CDC_INGRESS_INITIALIZATION,
  MESSAGE_GROUP_CDC_INGRESS_STATE,
  MESSAGE_GROUP_CDC_LOG_CONTEXT_FIELD,
  MESSAGE_GROUP_CDC_RECOVERY_ROUTING_STATE,
  MESSAGE_GROUP_CDC_RELAY_CONVERGENCE_MIN_DEPTH,
  MESSAGE_GROUP_FORWARDING_OWNER_LITERAL,
  MESSAGE_GROUP_FORWARDING_REASON,
  MESSAGE_GROUP_LEADER_IDENTITY_SOURCE,
  MESSAGE_GROUP_LEADER_IDENTITY_STATE,
  STRICT_CDC_FORWARD_SYSTEM_TABLES,
  buildForwardTopologyRepairReadOptions,
  buildMessageGroupLeaderIdentitySnapshot,
  resolveCDCForwardDeliveryProfile,
};
