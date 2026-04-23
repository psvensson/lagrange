import {NUM} from '../constants/index.js';
import {TABLES} from '../constants/index.js';
import {PRESSURE_WORK_CLASS} from './pressure-governor.js';

const TRANSACTION_CONTROL_MUTATION_WORKLOAD_CLASS =
  'transaction_control_mutation';
const CONTROL_PLANE_TRANSACTION_CONTROL_RECOVERY_RESOURCE_KEY =
  'control-plane:transaction-control:recovery';

const CONTROL_PLANE_WORKLOAD_CLASS = Object.freeze({
  BOOTSTRAP_CONTROL_PLANE_READ: 'bootstrap_control_plane_read',
  BOOTSTRAP_CONTROL_PLANE_MUTATION: 'bootstrap_control_plane_mutation',
  READINESS_CRITICAL_READ: 'readiness_critical_read',
  AUTHORITATIVE_OPERATION_VISIBILITY: 'authoritative_operation_visibility',
  REPLICA_OPERATION_MUTATION: 'replica_operation_mutation',
  TRANSACTION_CONTROL_MUTATION: TRANSACTION_CONTROL_MUTATION_WORKLOAD_CLASS,
  ADMIN_DIAGNOSTIC_READ: 'admin_diagnostic_read',
  CONTROL_SNAPSHOT_REPAIR: 'control_snapshot_repair',
  MESSAGE_GROUP_FORWARD_TOPOLOGY_REPAIR:
    'message_group_forward_topology_repair',
  JOIN_REPAIR: 'join_repair',
  PUBLICATION_MUTATION: 'publication_mutation',
  NODE_METADATA_MUTATION: 'node_metadata_mutation',
  NODE_STATE_PUBLICATION_BACKGROUND: 'node_state_publication_background',
  NODE_STATE_PUBLICATION_CRITICAL: 'node_state_publication_critical',
  REBALANCER_PRIORITY_VISIBILITY: 'rebalancer_priority_visibility',
  REBALANCER_BACKGROUND_VISIBILITY: 'rebalancer_background_visibility',
});

const CONTROL_PLANE_WORKLOAD_PROFILE = Object.freeze({
  [CONTROL_PLANE_WORKLOAD_CLASS.BOOTSTRAP_CONTROL_PLANE_READ]:
    Object.freeze({
      workloadClass:
        CONTROL_PLANE_WORKLOAD_CLASS.BOOTSTRAP_CONTROL_PLANE_READ,
      workClass: PRESSURE_WORK_CLASS.CRITICAL,
      allowPressureDegrade: false,
      allowPressureDefer: true,
      resourceKeys: Object.freeze(['control-plane:bootstrap:read']),
    }),
  [CONTROL_PLANE_WORKLOAD_CLASS.BOOTSTRAP_CONTROL_PLANE_MUTATION]:
    Object.freeze({
      workloadClass:
        CONTROL_PLANE_WORKLOAD_CLASS.BOOTSTRAP_CONTROL_PLANE_MUTATION,
      workClass: PRESSURE_WORK_CLASS.CRITICAL,
      allowPressureDegrade: false,
      allowPressureDefer: true,
      resourceKeys: Object.freeze(['control-plane:bootstrap:mutation']),
    }),
  [CONTROL_PLANE_WORKLOAD_CLASS.READINESS_CRITICAL_READ]: Object.freeze({
    workloadClass: CONTROL_PLANE_WORKLOAD_CLASS.READINESS_CRITICAL_READ,
    workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
    allowPressureDegrade: true,
    allowPressureDefer: true,
    resourceKeys: Object.freeze(['control-plane:readiness:read']),
  }),
  [CONTROL_PLANE_WORKLOAD_CLASS.AUTHORITATIVE_OPERATION_VISIBILITY]:
    Object.freeze({
      workloadClass:
        CONTROL_PLANE_WORKLOAD_CLASS.AUTHORITATIVE_OPERATION_VISIBILITY,
      workClass: PRESSURE_WORK_CLASS.CRITICAL,
      allowPressureDegrade: true,
      allowPressureDefer: false,
      resourceKeys: Object.freeze(['control-plane:replica-operations:visibility']),
    }),
  [CONTROL_PLANE_WORKLOAD_CLASS.REPLICA_OPERATION_MUTATION]:
    Object.freeze({
      workloadClass:
        CONTROL_PLANE_WORKLOAD_CLASS.REPLICA_OPERATION_MUTATION,
      workClass: PRESSURE_WORK_CLASS.CRITICAL,
      allowPressureDegrade: false,
      allowPressureDefer: false,
      resourceKeys: Object.freeze(['control-plane:replica-operations:mutation']),
    }),
  [CONTROL_PLANE_WORKLOAD_CLASS.TRANSACTION_CONTROL_MUTATION]:
    Object.freeze({
      workloadClass:
        CONTROL_PLANE_WORKLOAD_CLASS.TRANSACTION_CONTROL_MUTATION,
      workClass: PRESSURE_WORK_CLASS.CRITICAL,
      allowPressureDegrade: false,
      allowPressureDefer: false,
      resourceKeys: Object.freeze([
        CONTROL_PLANE_TRANSACTION_CONTROL_RECOVERY_RESOURCE_KEY,
      ]),
    }),
  [CONTROL_PLANE_WORKLOAD_CLASS.ADMIN_DIAGNOSTIC_READ]: Object.freeze({
    workloadClass: CONTROL_PLANE_WORKLOAD_CLASS.ADMIN_DIAGNOSTIC_READ,
    workClass: PRESSURE_WORK_CLASS.BACKGROUND,
    allowPressureDegrade: true,
    allowPressureDefer: true,
    resourceKeys: Object.freeze(['control-plane:admin:diagnostics']),
  }),
  [CONTROL_PLANE_WORKLOAD_CLASS.CONTROL_SNAPSHOT_REPAIR]: Object.freeze({
    workloadClass: CONTROL_PLANE_WORKLOAD_CLASS.CONTROL_SNAPSHOT_REPAIR,
    workClass: PRESSURE_WORK_CLASS.CRITICAL,
    allowPressureDegrade: false,
    allowPressureDefer: false,
    resourceKeys: Object.freeze(['control-plane:snapshot:repair']),
  }),
  [CONTROL_PLANE_WORKLOAD_CLASS.MESSAGE_GROUP_FORWARD_TOPOLOGY_REPAIR]:
    Object.freeze({
      workloadClass:
        CONTROL_PLANE_WORKLOAD_CLASS.MESSAGE_GROUP_FORWARD_TOPOLOGY_REPAIR,
      workClass: PRESSURE_WORK_CLASS.CRITICAL,
      allowPressureDegrade: true,
      allowPressureDefer: true,
      resourceKeys: Object.freeze([
        'control-plane:message-group:forward-topology-repair',
      ]),
    }),
  [CONTROL_PLANE_WORKLOAD_CLASS.JOIN_REPAIR]: Object.freeze({
    workloadClass: CONTROL_PLANE_WORKLOAD_CLASS.JOIN_REPAIR,
    workClass: PRESSURE_WORK_CLASS.BACKGROUND,
    allowPressureDegrade: true,
    allowPressureDefer: true,
    resourceKeys: Object.freeze(['join:repair', 'control-plane:repair']),
  }),
  [CONTROL_PLANE_WORKLOAD_CLASS.PUBLICATION_MUTATION]:
    Object.freeze({
      workloadClass: CONTROL_PLANE_WORKLOAD_CLASS.PUBLICATION_MUTATION,
      workClass: PRESSURE_WORK_CLASS.CRITICAL,
      allowPressureDegrade: false,
      allowPressureDefer: false,
      resourceKeys: Object.freeze(['control-plane:membership:publication']),
    }),
  [CONTROL_PLANE_WORKLOAD_CLASS.NODE_METADATA_MUTATION]:
    Object.freeze({
      workloadClass: CONTROL_PLANE_WORKLOAD_CLASS.NODE_METADATA_MUTATION,
      workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
      allowPressureDegrade: false,
      allowPressureDefer: false,
      resourceKeys: Object.freeze(['control-plane:nodes:metadata']),
    }),
  [CONTROL_PLANE_WORKLOAD_CLASS.NODE_STATE_PUBLICATION_BACKGROUND]:
    Object.freeze({
      workloadClass:
        CONTROL_PLANE_WORKLOAD_CLASS.NODE_STATE_PUBLICATION_BACKGROUND,
      workClass: PRESSURE_WORK_CLASS.BACKGROUND,
      allowPressureDegrade: true,
      allowPressureDefer: true,
      resourceKeys: Object.freeze(['control-plane:nodes:publication']),
    }),
  [CONTROL_PLANE_WORKLOAD_CLASS.NODE_STATE_PUBLICATION_CRITICAL]:
    Object.freeze({
      workloadClass:
        CONTROL_PLANE_WORKLOAD_CLASS.NODE_STATE_PUBLICATION_CRITICAL,
      workClass: PRESSURE_WORK_CLASS.CRITICAL,
      allowPressureDegrade: false,
      allowPressureDefer: true,
      resourceKeys: Object.freeze(['control-plane:nodes:publication']),
    }),
  [CONTROL_PLANE_WORKLOAD_CLASS.REBALANCER_PRIORITY_VISIBILITY]:
    Object.freeze({
      workloadClass:
        CONTROL_PLANE_WORKLOAD_CLASS.REBALANCER_PRIORITY_VISIBILITY,
      workClass: PRESSURE_WORK_CLASS.CRITICAL,
      allowPressureDegrade: true,
      allowPressureDefer: true,
      resourceKeys: Object.freeze(['control-plane:rebalancer:operations']),
    }),
  [CONTROL_PLANE_WORKLOAD_CLASS.REBALANCER_BACKGROUND_VISIBILITY]:
    Object.freeze({
      workloadClass:
        CONTROL_PLANE_WORKLOAD_CLASS.REBALANCER_BACKGROUND_VISIBILITY,
      workClass: PRESSURE_WORK_CLASS.BACKGROUND,
      allowPressureDegrade: true,
      allowPressureDefer: true,
      resourceKeys: Object.freeze(['rebalancer:operations']),
    }),
});

function normalizeDistinctStringArray(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .filter((value) => typeof value === 'string' && value.length > NUM.ZERO),
  )];
}

function resolveControlPlaneWorkloadClass(tableName, options = {}) {
  if (options.workloadClass &&
      Object.hasOwn(CONTROL_PLANE_WORKLOAD_PROFILE, options.workloadClass)) {
    return options.workloadClass;
  }
  if (tableName === TABLES.REPLICA_OPERATIONS) {
    return CONTROL_PLANE_WORKLOAD_CLASS.AUTHORITATIVE_OPERATION_VISIBILITY;
  }
  if (options.adminDiagnostic === true) {
    return CONTROL_PLANE_WORKLOAD_CLASS.ADMIN_DIAGNOSTIC_READ;
  }
  return CONTROL_PLANE_WORKLOAD_CLASS.READINESS_CRITICAL_READ;
}

function buildControlPlaneWorkloadProfile(workloadClass, overrides = {}) {
  const baseProfile =
    CONTROL_PLANE_WORKLOAD_PROFILE[workloadClass] ||
    CONTROL_PLANE_WORKLOAD_PROFILE[
      CONTROL_PLANE_WORKLOAD_CLASS.READINESS_CRITICAL_READ
    ];
  return Object.freeze({
    workloadClass: baseProfile.workloadClass,
    workClass: overrides.workClass || baseProfile.workClass,
    allowPressureDegrade:
      overrides.allowPressureDegrade !== undefined ?
        overrides.allowPressureDegrade :
        baseProfile.allowPressureDegrade,
    allowPressureDefer:
      overrides.allowPressureDefer !== undefined ?
        overrides.allowPressureDefer :
        baseProfile.allowPressureDefer,
    retryAfterMs: overrides.retryAfterMs ?? null,
    resourceKeys: Object.freeze([
      ...baseProfile.resourceKeys,
      ...normalizeDistinctStringArray(overrides.additionalResourceKeys),
    ]),
  });
}

export {
  buildControlPlaneWorkloadProfile,
  CONTROL_PLANE_WORKLOAD_CLASS,
  CONTROL_PLANE_WORKLOAD_PROFILE,
  resolveControlPlaneWorkloadClass,
};
