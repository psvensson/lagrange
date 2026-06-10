import {CDC_OPERATION} from '../constants/index.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';

const CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL = Object.freeze({
  ACTIVE: 'active',
  ALLOWCOALESCING: 'allowCoalescing',
  ALLOWPENDINGVISIBILITY: 'allowPendingVisibility',
  ALLOWPRESSUREDEFER: 'allowPressureDefer',
  ALLOWPRESSUREDEGRADE: 'allowPressureDegrade',
  ALLOWSQLFALLBACK: 'allowSqlFallback',
  AUTHORITATIVEREADMODE: 'authoritativeReadMode',
  CANCELLATIONTOKEN: 'cancellationToken',
  COALESCINGKEY: 'coalescingKey',
  CONTROL_DASH_PLANE_COLON_READ: 'control-plane:read',
  CONTROL_DASH_PLANE_COLON_WRITE: 'control-plane:write',
  CONTROL_DASH_PLANE_DASH_MUTATION: 'control-plane-mutation',
  CONTROL_DASH_PLANE_DASH_QUERY: 'control-plane-query',
  CONTROL_DASH_PLANE_DASH_READ: 'control-plane-read',
  CONTROL_PLANE_MUTATION_TRACKING_SATURATED:
    'control_plane_mutation_tracking_saturated',
  CRITICAL: 'critical',
  DELETE: 'delete',
  DELIVERY_SOURCE_SEPARATOR: ':',
  DELIVERYSOURCE: 'deliverySource',
  DELIVERYPRIORITY: 'deliveryPriority',
  DISABLESYSTEMWRITESESSION: 'disableSystemWriteSession',
  EXPECTEDCACHEFIELDS: 'expectedCacheFields',
  FALLBACKPHASE: 'fallbackPhase',
  IGNOREEXISTING: 'ignoreExisting',
  INSERT: 'insert',
  LOCAL_PARTITION_REPLICA: 'local_partition_replica',
  MAXOBSERVEDMUTATIONLATENCYMS: 'maxObservedMutationLatencyMs',
  MAXOBSERVEDREADLATENCYMS: 'maxObservedReadLatencyMs',
  MERGEPOLICY: 'mergePolicy',
  MINIMUMCACHEFIELDS: 'minimumCacheFields',
  MUTATION: 'mutation',
  MUTATIONOUTCOMECOUNTS: 'mutationOutcomeCounts',
  MUTATIONREPLACEPENDINGQUEUEDCOUNT: 'mutationReplacePendingQueuedCount',
  MUTATIONREPLACEPENDINGSUPERSEDEDCOUNT:
    'mutationReplacePendingSupersededCount',
  MUTATIONTRACKINGREJECTEDCOUNT: 'mutationTrackingRejectedCount',
  ONE: 1,
  OWNER_RPC_LANE: 'owner_rpc_lane',
  PARTITION: 'partition',
  PHASESCOPE: 'phaseScope',
  PREFERAUTHORITATIVEREAD: 'preferAuthoritativeRead',
  PREFEROWNERRPCREAD: 'preferOwnerRpcRead',
  PRESSURERETRYAFTERMS: 'pressureRetryAfterMs',
  QUERY: 'query',
  READ: 'read',
  READOUTCOMECOUNTS: 'readOutcomeCounts',
  RECOVERYCANDIDATESELECTIONKEY: 'recoveryCandidateSelectionKey',
  REPLACEPENDINGKEY: 'replacePendingKey',
  REQUIREAUTHORITATIVE: 'requireAuthoritative',
  REQUIREOWNERRPCREAD: 'requireOwnerRpcRead',
  RESOURCEKEYS: 'resourceKeys',
  ROUTER_QUERY_TRANSPORT_NOT_READY: 'ROUTER_QUERY_TRANSPORT_NOT_READY',
  ROUTINGREADINESSDIMENSION: 'routingReadinessDimension',
  SELECT: 'select',
  SESSIONID: 'sessionId',
  SKIPCACHEWAIT: 'skipCacheWait',
  SYSTEM_TABLE_CACHE_UNAVAILABLE: 'system_table_cache_unavailable',
  TIMEOUTBUDGET: 'timeoutBudget',
  UNKNOWN: 'unknown',
  UPDATE: 'update',
  VISIBLE: 'visible',
  WORKCLASS: 'workClass',
  WORKLOADCLASS: 'workloadClass',
  WRITE: 'write',
  ZERO: 0,
});

const CONTROL_PLANE_LOCAL_READ_CONSISTENCY = 'local_leader';
const CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY = 'any_replica';
const CONTROL_PLANE_ROUTING_SNAPSHOT_FIELD = Object.freeze({
  CANONICAL_LEADER_IDENTITY_STATE: 'canonicalLeaderIdentityState',
  CANONICAL_LEADER_NODE_ID: 'canonicalLeaderNodeId',
  CANONICAL_LEADER_ROUTING_GAP_STATE: 'canonicalLeaderRoutingGapState',
});

const CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR = Object.freeze({
  AUTHORITATIVE_READ_OWNER_UNAVAILABLE: 'authoritative_read_owner_unavailable',
  BOOTSTRAP_SNAPSHOT_PHASE_SCOPE_REQUIRED:
    'bootstrap_snapshot_phase_scope_required',
  BOOTSTRAP_SNAPSHOT_UNAVAILABLE: 'bootstrap_snapshot_unavailable',
  SQL_QUERY_ENGINE_UNAVAILABLE: 'sql_query_engine_unavailable',
});

const CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE = Object.freeze({
  SQL_QUERY_ENGINE: 'sql_query_engine',
});
const CONTROL_PLANE_MUTATION_QUEUE_STATE = Object.freeze({
  DIRECT: 'direct',
  PENDING_REPLACE: 'pending_replace',
});
const CONTROL_PLANE_DEFERRED_MUTATION_FAILURE_SENTINEL = Object.freeze({
  state: 'deferred_mutation_failure_consumed',
});
const CONTROL_PLANE_CACHE_RECONCILE_DELETE_POLICY = Object.freeze({
  PRESERVE_MISSING: false,
  DELETE_MISSING: true,
});
const CONTROL_PLANE_OPERATION_LEDGER_LIMIT = 256;
const CONTROL_PLANE_READ_STRATEGY = Object.freeze({
  CACHE: 'cache',
  AUTHORITATIVE: 'authoritative',
  AUTHORITATIVE_REQUIRED: 'authoritative_required',
  OWNER_LOCAL_NON_PROPAGATED: 'owner_local_non_propagated',
  BOOTSTRAP_SNAPSHOT: 'bootstrap_snapshot',
});
const CONTROL_PLANE_READ_PROFILE = Object.freeze({
  DIAGNOSTICS: 'diagnostics',
  PLANNING: 'planning',
  REPAIR_REQUIRED: 'repair_required',
  TABLE_LIFECYCLE: 'table_lifecycle',
});
const CONTROL_PLANE_AUTHORITATIVE_READ_MODE = Object.freeze({
  OWNER_LOCAL_ONLY: 'owner_local_only',
  OWNER_LOCAL_CONFIRM_EMPTY_WITH_OWNER_RPC:
    'owner_local_confirm_empty_with_owner_rpc',
  OWNER_RPC_PREFERRED: 'owner_rpc_preferred',
  OWNER_RPC_PREFERRED_SQL_FALLBACK: 'owner_rpc_preferred_sql_fallback',
  OWNER_RPC_REQUIRED: 'owner_rpc_required',
});
const CONTROL_PLANE_PHASE_SCOPE = Object.freeze({
  BOOTSTRAP: 'bootstrap',
  JOIN: 'join',
});
const CONTROL_PLANE_READ_OUTCOME = Object.freeze({
  CACHE_HIT: 'cache_hit',
  AUTHORITATIVE: 'authoritative',
  OWNER_LOCAL_NON_PROPAGATED: 'owner_local_non_propagated',
  BOOTSTRAP_SNAPSHOT: 'bootstrap_snapshot',
  DEFERRED: 'deferred',
  REJECTED: 'rejected',
  STALE_NOT_ALLOWED: 'stale_not_allowed',
  OWNER_NOT_READY: 'owner_not_ready',
});
const CONTROL_PLANE_MUTATION_OUTCOME = Object.freeze({
  APPLIED: 'applied',
  NO_OP: 'no_op',
  PENDING_VISIBILITY: 'pending_visibility',
  DEFERRED: 'deferred',
  REJECTED: 'rejected',
  OWNER_NOT_READY: 'owner_not_ready',
  OBSERVED_STATE_CHANGED: 'observed_state_changed',
});
const CONTROL_PLANE_SQL_OPERATION = Object.freeze({
  READ: 'read',
  WRITE: 'write',
  UNKNOWN: 'unknown',
});
const CONTROL_PLANE_MUTATION_OPERATION = Object.freeze({
  INSERT: 'insert',
  UPDATE: 'update',
  UPSERT: 'upsert',
  DELETE: 'delete',
});
const CONTROL_PLANE_WRITE_OPERATION_KINDS = new Set([
  CONTROL_PLANE_SQL_OPERATION.WRITE,
  CONTROL_PLANE_MUTATION_OPERATION.INSERT,
  CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
  CONTROL_PLANE_MUTATION_OPERATION.UPSERT,
  CONTROL_PLANE_MUTATION_OPERATION.DELETE,
  CDC_OPERATION.INSERT,
  CDC_OPERATION.UPDATE,
  CDC_OPERATION.UPSERT,
  CDC_OPERATION.DELETE,
]);
const CONTROL_PLANE_MUTATION_MERGE_POLICY = Object.freeze({
  NONE: 'none',
  SINGLE_FLIGHT: 'single_flight',
  REPLACE_PENDING: 'replace_pending',
});
const CONTROL_PLANE_GATEWAY_LIMIT = Object.freeze({
  MAX_TRACKED_READ_REQUESTS: 512,
  MAX_TRACKED_QUERY_REQUESTS: 512,
  MAX_TRACKED_MUTATION_REQUESTS: 512,
  MAX_PENDING_REPLACE_MUTATION_REQUESTS: 512,
});
const CONTROL_PLANE_GATEWAY_ERROR_CODE = Object.freeze({
  MUTATION_TRACKING_SATURATED: 'CONTROL_PLANE_MUTATION_TRACKING_SATURATED',
});
const GATEWAY_ERROR_MSG = Object.freeze({
  CDC_REQUIRED: 'ControlPlaneSystemTableGateway requires cdcIntegrationService',
  SQL_ENGINE_REQUIRED: 'ControlPlaneSystemTableGateway requires sqlQueryEngine',
  MUTATION_OPERATION_REQUIRED:
    'ControlPlaneSystemTableGateway requires a supported mutation operation',
  MUTATION_TABLE_REQUIRED:
    'ControlPlaneSystemTableGateway requires a valid system table name',
  MUTATION_ROW_REQUIRED:
    'ControlPlaneSystemTableGateway requires row data for insert/upsert',
  MUTATION_WHERE_REQUIRED:
    'ControlPlaneSystemTableGateway requires whereClause for update/delete',
  MUTATION_DATA_REQUIRED:
    'ControlPlaneSystemTableGateway requires update data for update',
});
const GATEWAY_LOG_MSG = Object.freeze({
  READ_DEFERRED: 'Control-plane metadata read deferred',
  READ_REJECTED: 'Control-plane metadata read rejected',
  MUTATION_DEFERRED: 'Control-plane metadata mutation deferred',
  MUTATION_REJECTED: 'Control-plane metadata mutation rejected',
  MUTATION_FALLBACK_FENCED:
    'Control-plane mutation SQL fallback fenced for membership table',
});
const CONTROL_PLANE_GATEWAY_OWNER_OUTCOME = Object.freeze({
  BOUNDARY: 'control_plane_system_table_gateway_mutation_contract',
  OWNER: 'control_plane_system_table_gateway_owner',
});
const SYSTEM_TABLE_NAMES = new Set(Object.values(SYSTEM_TABLE_NAME));

export {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_CACHE_RECONCILE_DELETE_POLICY,
  CONTROL_PLANE_DEFERRED_MUTATION_FAILURE_SENTINEL,
  CONTROL_PLANE_GATEWAY_ERROR_CODE,
  CONTROL_PLANE_GATEWAY_LIMIT,
  CONTROL_PLANE_GATEWAY_OWNER_OUTCOME,
  CONTROL_PLANE_LOCAL_READ_CONSISTENCY,
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_MUTATION_OUTCOME,
  CONTROL_PLANE_MUTATION_QUEUE_STATE,
  CONTROL_PLANE_OPERATION_LEDGER_LIMIT,
  CONTROL_PLANE_PHASE_SCOPE,
  CONTROL_PLANE_READ_OUTCOME,
  CONTROL_PLANE_READ_PROFILE,
  CONTROL_PLANE_READ_STRATEGY,
  CONTROL_PLANE_REPLICA_FALLBACK_CONSISTENCY,
  CONTROL_PLANE_ROUTING_SNAPSHOT_FIELD,
  CONTROL_PLANE_SQL_OPERATION,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_ERROR,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_LITERAL,
  CONTROL_PLANE_SYSTEM_TABLE_GATEWAY_SOURCE,
  CONTROL_PLANE_WRITE_OPERATION_KINDS,
  GATEWAY_ERROR_MSG,
  GATEWAY_LOG_MSG,
  SYSTEM_TABLE_NAMES,
};
