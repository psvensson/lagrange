import {
  SERVICE_DESCRIPTOR_FIELD,
  SERVICE_LIFECYCLE_STATE,
  TYPEOF,
} from '../constants/index.js';

const LOCAL_NUM_ZERO = 0;
const LOCAL_STR_EMPTY = '';
const LOCAL_STR_INTERVAL = 'interval';
const LOCAL_STR_STARTUP = 'startup';
const LOCAL_NUM_ONE = 1;
const LOCAL_STR_RECONCILE = 'reconcile';

const SERVICE_RECONCILER_DEFAULT = Object.freeze({
  CHECK_INTERVAL_MS: 5000,
  MAX_CONCURRENT_SERVICE_ACTIONS: 1,
});

const RECONCILER_EVENT = Object.freeze({
  CYCLE_START: 'reconciler:cycle:start',
  CYCLE_COMPLETE: 'reconciler:cycle:complete',
  CYCLE_ERROR: 'reconciler:cycle:error',
  PLAN_READY: 'reconciler:plan:ready',
  DECISION: 'reconciler:decision',
});

const RECONCILER_ACTION_TYPE = Object.freeze({
  CREATE_START_REPLICA: 'create_start_replica',
  START_REPLICA: 'start_replica',
  STOP_REPLICA: 'stop_replica',
});

const RECONCILER_DRIFT_REASON = Object.freeze({
  BELOW_TARGET: 'below_target_replica_count',
  ABOVE_TARGET: 'above_target_replica_count',
  NON_RUNNING_REPLICA: 'non_running_replica',
  SERVICE_REMOVED: 'service_removed_from_desired_state',
});

const RECONCILER_ERROR = Object.freeze({
  LIFECYCLE_MANAGER_REQUIRED:
    'lifecycleManager must be an instance of ServiceLifecycleManager',
  DESIRED_STATE_READER_REQUIRED:
    'desiredStateReader must be a function',
  ACTUAL_STATE_READER_REQUIRED:
    'actualStateReader must be a function',
  TELEMETRY_SINK_REQUIRED:
    'telemetrySink must be a function',
  EVENT_SOURCE_REQUIRED:
    'eventSource must provide on() and off() methods',
  EVENT_NAME_REQUIRED:
    'eventNames entries must be non-empty strings',
  PLACEMENT_POLICY_CHECK_REQUIRED:
    'placementPolicyCheck must be a function',
  INTERVAL_REQUIRED:
    'checkIntervalMs must be a positive finite number',
  MAX_CONCURRENT_ACTIONS_REQUIRED:
    'maxConcurrentServiceActions must be a positive finite number',
});

const RECONCILER_POLICY_TYPE = Object.freeze({
  PLACEMENT: 'placement',
});

const RECONCILER_LOG = Object.freeze({
  CYCLE_START: 'Service reconciliation cycle started',
  CYCLE_COMPLETE: 'Service reconciliation cycle completed',
  CYCLE_ERROR: 'Service reconciliation cycle failed',
  DECISION: 'Service reconciliation decision recorded',
});

const DEFAULT_DECISION_HISTORY_LIMIT = 100;
const MAX_DECISION_HISTORY_LIMIT = 500;

const RECONCILER_PLACEMENT_POLICY_ERROR = Object.freeze({
  ACTION_REQUIRED: 'reconcile action must be an object',
  ACTION_SERVICE_ID_REQUIRED: 'reconcile action must resolve serviceId',
  ACTION_SERVICE_TYPE_REQUIRED: 'reconcile action must resolve serviceType',
  ACTION_REPLICA_ID_REQUIRED:
    'reconcile action must include replicaId for replica mutations',
});

function resolveServiceId(entity) {
  return entity?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] ||
    entity?.definition?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_ID] ||
    null;
}

function resolveServiceType(entity) {
  return entity?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE] ||
    entity?.definition?.[SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE] ||
    null;
}

function resolveReplicaId(entity) {
  return entity?.[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID] ||
    entity?.definition?.[SERVICE_DESCRIPTOR_FIELD.REPLICA_ID] ||
    null;
}

function resolveTenantId(entity) {
  return entity?.[SERVICE_DESCRIPTOR_FIELD.TENANT_ID] ||
    entity?.definition?.[SERVICE_DESCRIPTOR_FIELD.TENANT_ID] ||
    resolveServiceId(entity);
}

function resolveRuntimeKind(entity) {
  return entity?.[SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND] ||
    entity?.runtime_kind ||
    entity?.definition?.[SERVICE_DESCRIPTOR_FIELD.RUNTIME_KIND] ||
    entity?.definition?.runtime_kind ||
    null;
}

function resolveReplicaCount(definition) {
  const count = definition?.[SERVICE_DESCRIPTOR_FIELD.REPLICA_COUNT];
  if (!Number.isFinite(count)) {
    return LOCAL_NUM_ZERO;
  }
  return Math.max(LOCAL_NUM_ZERO, Math.floor(count));
}

function resolveLifecycleState(replica) {
  return replica?.[SERVICE_DESCRIPTOR_FIELD.LIFECYCLE_STATE] ||
    SERVICE_LIFECYCLE_STATE.CREATED;
}

function cloneReplicaHandle(replica) {
  return {
    [SERVICE_DESCRIPTOR_FIELD.SERVICE_ID]: resolveServiceId(replica),
    [SERVICE_DESCRIPTOR_FIELD.SERVICE_TYPE]: resolveServiceType(replica),
    [SERVICE_DESCRIPTOR_FIELD.TENANT_ID]: resolveTenantId(replica),
    [SERVICE_DESCRIPTOR_FIELD.REPLICA_ID]: resolveReplicaId(replica),
    [SERVICE_DESCRIPTOR_FIELD.LIFECYCLE_STATE]: resolveLifecycleState(replica),
  };
}

async function defaultPlacementPolicyCheck(policyContext) {
  const action = policyContext?.action;
  if (!action || typeof action !== TYPEOF.OBJECT) {
    throw new Error(RECONCILER_PLACEMENT_POLICY_ERROR.ACTION_REQUIRED);
  }

  const serviceId = resolveServiceId(action.definition || action.replica);
  if (!serviceId) {
    throw new Error(RECONCILER_PLACEMENT_POLICY_ERROR.ACTION_SERVICE_ID_REQUIRED);
  }

  const serviceType = resolveServiceType(action.definition || action.replica);
  if (!serviceType) {
    throw new Error(RECONCILER_PLACEMENT_POLICY_ERROR.ACTION_SERVICE_TYPE_REQUIRED);
  }

  if (action.type === RECONCILER_ACTION_TYPE.START_REPLICA ||
    action.type === RECONCILER_ACTION_TYPE.STOP_REPLICA ||
    action.type === RECONCILER_ACTION_TYPE.CREATE_START_REPLICA) {
    const replicaId = resolveReplicaId(action.replica);
    if (!replicaId) {
      throw new Error(RECONCILER_PLACEMENT_POLICY_ERROR.ACTION_REPLICA_ID_REQUIRED);
    }
  }
}

export {
  DEFAULT_DECISION_HISTORY_LIMIT,
  LOCAL_NUM_ONE,
  LOCAL_NUM_ZERO,
  LOCAL_STR_EMPTY,
  LOCAL_STR_INTERVAL,
  LOCAL_STR_RECONCILE,
  LOCAL_STR_STARTUP,
  MAX_DECISION_HISTORY_LIMIT,
  RECONCILER_ACTION_TYPE,
  RECONCILER_DRIFT_REASON,
  RECONCILER_ERROR,
  RECONCILER_EVENT,
  RECONCILER_LOG,
  RECONCILER_POLICY_TYPE,
  SERVICE_RECONCILER_DEFAULT,
  cloneReplicaHandle,
  defaultPlacementPolicyCheck,
  resolveLifecycleState,
  resolveReplicaCount,
  resolveReplicaId,
  resolveRuntimeKind,
  resolveServiceId,
  resolveServiceType,
  resolveTenantId,
};
