import {NODE_STATE, NUM} from '../constants/index.js';
import {PRESSURE_STATE} from '../rebalancer/storage-capacity-constants.js';

const CONTROL_PLANE_READINESS_SUBSYSTEM = 'control-plane-readiness';

const CONTROL_PLANE_READINESS_DIMENSION = Object.freeze({
  PROCESS_ALIVE: 'processAlive',
  CLUSTER_MEMBER_HEALTHY: 'clusterMemberHealthy',
  ROUTING_READY: 'routingReady',
  LOAD_READY: 'loadReady',
  PLACEMENT_ELIGIBLE: 'placementEligible',
  PROVISIONING_ELIGIBLE: 'provisioningEligible',
  CONTROL_PLANE_WRITABLE: 'controlPlaneWritable',
  CONTROL_PLANE_PUBLISHED: 'controlPlanePublished',
  CONTROL_PLANE_RECOVERY_ELIGIBLE: 'controlPlaneRecoveryEligible',
  METADATA_PUBLICATION_HEALTHY: 'metadataPublicationHealthy',
  REPAIR_ELIGIBLE: 'repairEligible',
  SERVE_ELIGIBLE: 'serveEligible',
});

const CONTROL_PLANE_READINESS_OWNER = Object.freeze({
  NODE_LIFECYCLE: 'NodeLifecycleStateMachine',
  SYSTEM_TABLE_CACHE: 'SystemTableCache',
  STORAGE_ACCOUNTING: 'StorageCapacityAccountingService',
  CDC_GROUP_PROPAGATION: 'CDCGroupPropagationService',
  MESSAGE_ROUTER: 'MessageRouter',
  MEMBERSHIP_PUBLICATION: 'MembershipPublicationCoordinator',
});

const CONTROL_PLANE_PARTICIPATION_KIND = Object.freeze({
  ROUTED_READ: 'routed_read',
  REPLICA_OPERATION_OWNER_READ: 'replica_operation_owner_read',
  CONTROL_PLANE_RECOVERY: 'control_plane_recovery',
});

const CONTROL_PLANE_PARTICIPATION_DECISION = Object.freeze({
  READY: 'ready',
  DEFER: 'defer',
  BLOCKED: 'blocked',
});

const CONTROL_PLANE_READ_PURPOSE = Object.freeze({
  ORDINARY: 'ordinary',
  READINESS_INTERNAL: 'readiness_internal',
});
// Typed recovery-routing lane of a control-plane read (system-guidelines
// §4.5): ELIGIBLE_ONLY routes only to controlPlaneRecoveryEligible replica
// hosts; PRIORITY_RECOVERY_BOOTSTRAP grants one declared read the same
// priority-recovery bootstrap routing grace a priority control-plane write
// already receives while every replica host is recovery-pending.
const CONTROL_PLANE_READ_RECOVERY_ROUTING = Object.freeze({
  ELIGIBLE_ONLY: 'eligible_only',
  PRIORITY_RECOVERY_BOOTSTRAP: 'priority_recovery_bootstrap',
});

const CONTROL_PLANE_READINESS_REASON = Object.freeze({
  NODE_ROW_MISSING: 'node_row_missing',
  PROCESS_NOT_ALIVE: 'process_not_alive',
  CLUSTER_MEMBER_UNHEALTHY: 'cluster_member_unhealthy',
  ROUTING_NOT_READY: 'routing_not_ready',
  LOCAL_QUERY_TRANSPORT_NOT_READY: 'local_query_transport_not_ready',
  LOAD_NOT_READY: 'load_not_ready',
  STORAGE_BUDGET_UNAVAILABLE: 'storage_budget_unavailable',
  STORAGE_PRESSURE_HARD: 'storage_pressure_hard',
  STORAGE_PRESSURE_EXHAUSTED: 'storage_pressure_exhausted',
  CONTROL_PLANE_WRITE_UNHEALTHY: 'control_plane_write_unhealthy',
  CONTROL_PLANE_PUBLICATION_PENDING: 'control_plane_publication_pending',
  PRIORITY_CONTROL_PLANE_RECOVERY_PENDING:
    'PRIORITY_CONTROL_PLANE_RECOVERY_PENDING',
  METADATA_PUBLICATION_DEGRADED: 'metadata_publication_degraded',
  METADATA_PUBLICATION_REPAIR_ONLY: 'metadata_publication_repair_only',
  PLANNING_SNAPSHOT_REFRESH_PENDING: 'planning_snapshot_refresh_pending',
});
const CONTROL_PLANE_PRIORITY_RECOVERY_REASON = Object.freeze({
  PUBLICATION_EPOCH_PENDING: 'publication_epoch_pending',
  PRIORITY_PARTITIONS_NOT_SPREAD: 'priority_partitions_not_spread',
  PRIORITY_SPREAD_EVIDENCE_UNAVAILABLE:
    'priority_spread_evidence_unavailable',
  CONTROL_PLANE_NOT_WRITABLE: 'control_plane_not_writable',
  RECOVERY_ELIGIBILITY_PENDING: 'recovery_eligibility_pending',
});

const CONTROL_PLANE_PUBLICATION_MODE = Object.freeze({
  GROUPED: 'grouped',
  CONSERVATIVE_FANOUT: 'conservative_fanout',
  REPAIR_ONLY: 'repair_only',
});

const PROVISIONING_ELIGIBILITY_STATE = Object.freeze({
  STEADY: 'steady',
  CONVERGENCE_GRACE: 'convergence_grace',
  BLOCKED: 'blocked',
});

const AUTHORITY_DESCRIPTOR_STATE = Object.freeze({
  AVAILABLE: 'available',
  KNOWN: 'known',
  NONE: 'none',
  PRESENT: 'present',
  UNAVAILABLE: 'unavailable',
});

const AUTHORITY_PUBLICATION_OBSERVATION_STATE = Object.freeze({
  OBSERVATION_UNAVAILABLE: 'observation_unavailable',
  UNPUBLISHED: 'unpublished',
});

const RUNTIME_AUTHORITY_STATE = Object.freeze({
  CONFIRMED: 'confirmed',
  ESTABLISHING: 'establishing',
  RETAINED: 'retained',
  UNAVAILABLE: 'unavailable',
});

const RUNTIME_AUTHORITY_PUBLICATION_STATE = Object.freeze({
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
});

const RUNTIME_AUTHORITY_VISIBILITY_STATE = Object.freeze({
  CONFIRMED: 'confirmed',
  PENDING_PUBLICATION: 'pending_publication',
  RETAINED_LOCAL_RUNTIME: 'retained_local_runtime',
  UNAVAILABLE: 'unavailable',
});

const RUNTIME_AUTHORITY_REPAIR_STATE = Object.freeze({
  FAILED: 'failed',
  NOT_ATTEMPTED: 'not_attempted',
  REPAIRED: 'repaired',
  UNCHANGED: 'unchanged',
});

const PROJECTION_READINESS_CONTRACT_STATE = Object.freeze({
  BLOCKED: 'blocked',
  RECOVERY_OPEN: 'recovery_open',
  SERVE_READY: 'serve_ready',
});

const CONTROL_PLANE_READINESS_DEFAULT = Object.freeze({
  LOAD_READY_MAX_PERCENT: NUM.HUNDRED,
  CLUSTER_MEMBER_STALE_HEARTBEAT_MAX_AGE_MS: NUM.THIRTY_THOUSAND,
  MEMBERSHIP_PUBLICATION_DIAGNOSTICS_QUERY_TIMEOUT_MS: NUM.THOUSAND,
  NON_RUNNING_PROCESS_STATES: Object.freeze([
    NODE_STATE.FAILED,
    NODE_STATE.SHUTTING_DOWN,
    NODE_STATE.STOPPED,
  ]),
  PLACEMENT_BLOCKING_PRESSURE_STATES: Object.freeze([
    PRESSURE_STATE.HARD,
    PRESSURE_STATE.EXHAUSTED,
  ]),
});

/**
 * Keys used when persisting a compact readiness snapshot summary
 * alongside admission, dispatch, and progression decisions.
 * @enum {string}
 */
// Brand carried (non-enumerably, so spreads and hand-merges DROP it) by every
// object assembled by buildPriorityRecoveryPlanningProjection. Downstream
// re-derivation sites whose answer is a matrix-proven pure function of the
// projection object itself (isPriorityControlPlaneRecoveryActive,
// hasMembershipPublicationRecoveryGateEvidence) read the branded fields
// directly instead of rebuilding a gate/projection per call - the measured
// dominant share of the seed's snapshot-build storm (quest
// publication-recovery-snapshot-starvation-relief). Re-projection is NOT
// idempotent (epoch/status normalization and live admission evidence), so the
// brand must never short-circuit buildPriorityRecoveryPlanningProjection
// itself.
const PRIORITY_RECOVERY_PLANNING_PROJECTION = Symbol(
  'priorityRecoveryPlanningProjection',
);

const READINESS_SNAPSHOT_KEY = Object.freeze({
  NODE_ID: 'nodeId',
  DIMENSIONS: 'dimensions',
  REASON_CODES: 'reasonCodes',
  LIFECYCLE_STATE: 'lifecycleState',
  OBSERVED_AT: 'observedAt',
  DECISION_DIMENSION: 'decisionDimension',
  RUNTIME_AUTHORITY: 'runtimeAuthority',
  PROJECTION_READINESS_CONTRACT: 'projectionReadinessContract',
});

export {
  AUTHORITY_DESCRIPTOR_STATE,
  AUTHORITY_PUBLICATION_OBSERVATION_STATE,
  CONTROL_PLANE_PARTICIPATION_DECISION,
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_PUBLICATION_MODE,
  CONTROL_PLANE_READINESS_DEFAULT,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_OWNER,
  CONTROL_PLANE_READ_PURPOSE,
  CONTROL_PLANE_READ_RECOVERY_ROUTING,
  CONTROL_PLANE_READINESS_REASON,
  CONTROL_PLANE_READINESS_SUBSYSTEM,
  PRIORITY_RECOVERY_PLANNING_PROJECTION,
  PROJECTION_READINESS_CONTRACT_STATE,
  PROVISIONING_ELIGIBILITY_STATE,
  READINESS_SNAPSHOT_KEY,
  RUNTIME_AUTHORITY_PUBLICATION_STATE,
  RUNTIME_AUTHORITY_REPAIR_STATE,
  RUNTIME_AUTHORITY_STATE,
  RUNTIME_AUTHORITY_VISIBILITY_STATE,
};
