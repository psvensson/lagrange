import {LoggingService} from '../logging/logging-service.js';
import {assertCritical} from '../utils/assert.js';
import {
  COLUMN,
  NUM,
  STATE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
  TIME_MS,
  TYPEOF,
} from '../constants/index.js';
import {
  compareNodeHeartbeatWatermarks,
  isNodeRecordReady,
  isNodeReadyLeaseExplicitlyCleared,
  wasNodeRecordReadyWhenWritten,
} from '../node/node-readiness-policy.js';
import {PRESSURE_STATE} from '../rebalancer/storage-capacity-constants.js';
import {AuthoritativeControlPlaneView} from './authoritative-control-plane-view.js';
import {LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY} from '../cdc/cdc-integration-service.js';
import {createControlPlaneRuntimeBundle} from './control-plane-runtime-bundle.js';
import {
  AUTHORITY_DESCRIPTOR_STATE,
  AUTHORITY_PUBLICATION_OBSERVATION_STATE,
  CONTROL_PLANE_PARTICIPATION_DECISION,
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_PUBLICATION_MODE,
  CONTROL_PLANE_READINESS_DEFAULT,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_OWNER,
  CONTROL_PLANE_READINESS_REASON,
  CONTROL_PLANE_READINESS_SUBSYSTEM,
  PROJECTION_READINESS_CONTRACT_STATE,
  PROVISIONING_ELIGIBILITY_STATE,
  RUNTIME_AUTHORITY_PUBLICATION_STATE,
  RUNTIME_AUTHORITY_REPAIR_STATE,
  RUNTIME_AUTHORITY_STATE,
  RUNTIME_AUTHORITY_VISIBILITY_STATE,
} from './control-plane-readiness-constants.js';
import {
  compactEligibilitySnapshot,
  createEligibilitySnapshot,
  evaluateEligibilityDecision,
} from './eligibility-snapshot.js';
import {
  buildProjectionReadinessContract,
} from './projection-readiness-state.js';
import {CONTROL_PLANE_PUBLICATION_STATUS} from './control-plane-publication-merge.js';
import {
  resolvePriorityRecoveryActiveNodeCohort,
  DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS,
} from './priority-recovery-snapshot.js';
import {unwrapRowReadResult} from './owners/system-metadata-owner-base.js';
import {buildPublicationRecoveryProtocolSnapshot} from './recovery-protocol-snapshot.js';
import {buildControlPlanePublicationStory} from './control-plane-publication-story.js';
import {
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
  buildPublicationRecoveryGateSnapshot,
} from './publication-recovery-gate.js';
import {buildCanonicalPublicationRecoveryEvidence} from './publication-recovery-evidence.js';
import {RECOVERY_PROTOCOL_STATE} from './membership-lifecycle-constants.js';
import {ControlPlaneDiagnosticsLedger} from './control-plane-diagnostics-ledger.js';
import {DurableWorkflowCoordinator} from '../workflow/durable-workflow-coordinator.js';
import {OperationLane} from '../workflow/operation-lane.js';
import {AuthoritativeNodeEvidenceReconciler} from './authoritative-node-evidence-reconciler.js';
import {buildReadinessTransitionState as buildReadinessTransitionOwnerState} from './readiness-transition-state.js';
import {
  buildPriorityRecoveryHealthDetailsFromStartupAuthority as buildStartupAuthorityHealthDetails,
  STARTUP_AUTHORITY_ADMISSION_STATE,
  buildStartupAuthorityFailureDescriptor as buildStartupAuthorityFailureOwnerDescriptor,
  buildStartupAuthorityPriorityPartitionDescriptor as buildStartupAuthorityPriorityPartitionOwnerDescriptor,
  buildStartupAuthorityPublicationDescriptor as buildStartupAuthorityPublicationOwnerDescriptor,
  buildStartupAuthorityRecoveryProtocolDescriptor as buildStartupAuthorityRecoveryProtocolOwnerDescriptor,
  buildStartupAuthoritySnapshotContract as buildStartupAuthorityOwnerContract,
  buildStartupAuthoritySnapshotFromPlanningAnswer as buildStartupAuthorityOwnerSnapshotFromPlanningAnswer,
  buildStartupAuthorityTargetParticipationDescriptor as buildStartupAuthorityTargetParticipationOwnerDescriptor,
  buildStartupAuthorityUnavailableSnapshot as buildStartupAuthorityOwnerUnavailableSnapshot,
  PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE,
  STARTUP_AUTHORITY_STATE,
} from './startup-authority-snapshot-owner.js';

const LOCAL_STR_OBJECT = 'object';
const LOCAL_STR_UNKNOWN = 'unknown';
const LOCAL_STR_READY = 'ready';
const LOCAL_STR_DEFERRED = 'deferred';
const LOCAL_STR_ROUTER_QUERY_TRANSPORT_NOT_READY = 'ROUTER_QUERY_TRANSPORT_NOT_READY';
const LOCAL_STR_CONTROL_PLANE_PARTICIPATION_DEFERRED = 'CONTROL_PLANE_PARTICIPATION_DEFERRED';
const LOCAL_STR_CONTROL_PLANE_PARTICIPATION_BLOCKED = 'CONTROL_PLANE_PARTICIPATION_BLOCKED';
const LOCAL_STR_CONTROL_PLANE_PARTICIPATION_DEFERRED_BY = 'Control-plane participation deferred by canonical readiness';
const LOCAL_STR_CONTROL_PLANE_PARTICIPATION_BLOCKED_BY_C = 'Control-plane participation blocked by canonical readiness';

const PUBLICATION_REASON_CONFIG_SAFE_MODE = 'config_safe_mode';
const AUTHORITATIVE_READINESS_REPAIR = Object.freeze({
  COOLDOWN_MS: 5000,
  FAILURE_COOLDOWN_MS: 30000,
  NO_CHANGE_COOLDOWN_MS: 15000,
  QUERY_TIMEOUT_MS: 1500,
  STALE_HEARTBEAT_MAX_AGE_MS: 10000,
});
const MEMBERSHIP_PUBLICATION_PLANNING = Object.freeze({
  ACTIVE_STALE_GRACE_MS: DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS,
  REFRESH_TIMEOUT_MS: TIME_MS.SECOND,
});
const MEMBERSHIP_PUBLICATION_PLANNING_SOURCE = Object.freeze({
  OWNER_ANSWER: 'owner_answer',
  DIRECT_PUBLICATION_ROW: 'direct_publication_row',
});
const MEMBERSHIP_PUBLICATION_READ_LANE = Object.freeze({
  DIAGNOSTICS: 'diagnostics',
  PLANNING: 'planning',
});
const MEMBERSHIP_PUBLICATION_READ_SCOPE = Object.freeze({
  CLUSTER: 'cluster',
  TARGET_NODE: 'target_node',
});
const READINESS_TRANSITION_HISTORY_LIMIT = 32;
const READINESS_DIAGNOSTICS_LEDGER_LIMIT = 128;
const RECOVERY_EPOCH_HISTORY_LIMIT = 8;
const RECOVERY_EPOCH_EVENT_LIMIT = 32;
const MISSING_NODE_READINESS_STATE = Object.freeze({
  FAIL_CLOSED: 'fail_closed',
  SELF_RUNTIME_GRACE: 'self_runtime_grace',
});
const MISSING_NODE_READINESS_REASON = Object.freeze({
  CONTROL_PLANE_SERVICE_UNAVAILABLE: 'control_plane_service_unavailable',
  PROCESS_NOT_ALIVE: 'process_not_alive',
  REMOTE_NODE: 'remote_node',
  SELF_RUNTIME_GRACE: 'self_runtime_grace',
});
const RECOVERY_GRACE_MESSAGE_GROUP_SERVICE_STATUSES = Object.freeze([
  'starting',
  'syncing',
]);
const READINESS_ERROR_MSG = Object.freeze({
  STORAGE_ACCOUNTING_OWNER_REQUIRED:
    'ControlPlaneReadinessService requires ' +
    'storageAccountingService for strict readiness evaluation',
  PUBLICATION_OWNER_REQUIRED:
    'ControlPlaneReadinessService requires ' +
    'cdcGroupPropagationService for strict readiness evaluation',
});
const MEMBERSHIP_PUBLICATION_AUTHORITATIVE_READ_MODE = Object.freeze({
  DIAGNOSTICS: 'owner_rpc_required',
  PLANNING: 'owner_rpc_preferred_sql_fallback',
});
const MEMBERSHIP_PUBLICATION_READ_OPTIONS = Object.freeze({
  authoritativeReadMode:
    MEMBERSHIP_PUBLICATION_AUTHORITATIVE_READ_MODE.DIAGNOSTICS,
  readProfile: 'diagnostics',
  localReadConsistency: LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER,
  replicaFallbackConsistency: LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER,
  workClass: 'control-plane-readiness',
  deliveryPriority: 'readiness',
});
const MEMBERSHIP_PUBLICATION_PLANNING_READ_OPTIONS = Object.freeze({
  authoritativeReadMode:
    MEMBERSHIP_PUBLICATION_AUTHORITATIVE_READ_MODE.PLANNING,
  readProfile: 'planning',
  localReadConsistency: LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.LOCAL_LEADER,
  replicaFallbackConsistency: LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY.ANY_REPLICA,
  workClass: 'control-plane-planning',
  deliveryPriority: 'readiness',
});

function resolveMembershipPublicationReadOptions({
  lane = MEMBERSHIP_PUBLICATION_READ_LANE.DIAGNOSTICS,
  queryTimeoutMs = null,
} = {}) {
  const normalizedLane =
    lane === MEMBERSHIP_PUBLICATION_READ_LANE.PLANNING ?
      MEMBERSHIP_PUBLICATION_READ_LANE.PLANNING :
      MEMBERSHIP_PUBLICATION_READ_LANE.DIAGNOSTICS;
  const baseOptions =
    normalizedLane === MEMBERSHIP_PUBLICATION_READ_LANE.PLANNING ?
      MEMBERSHIP_PUBLICATION_PLANNING_READ_OPTIONS :
      MEMBERSHIP_PUBLICATION_READ_OPTIONS;
  const normalizedQueryTimeoutMs =
    Number.isFinite(queryTimeoutMs) && queryTimeoutMs > 0 ?
      Math.floor(queryTimeoutMs) :
      null;
  return Object.freeze({
    ...baseOptions,
    queryTimeoutMs: normalizedQueryTimeoutMs,
  });
}

function resolveMembershipPublicationReadLane(lane = null) {
  if (lane === MEMBERSHIP_PUBLICATION_READ_LANE.PLANNING) {
    return MEMBERSHIP_PUBLICATION_READ_LANE.PLANNING;
  }
  return MEMBERSHIP_PUBLICATION_READ_LANE.DIAGNOSTICS;
}

function resolveMembershipPublicationReadScope(scope = null) {
  if (scope === MEMBERSHIP_PUBLICATION_READ_SCOPE.TARGET_NODE) {
    return MEMBERSHIP_PUBLICATION_READ_SCOPE.TARGET_NODE;
  }
  return MEMBERSHIP_PUBLICATION_READ_SCOPE.CLUSTER;
}

function resolveMembershipPublicationPlanningSource(source = null) {
  if (
    source === MEMBERSHIP_PUBLICATION_PLANNING_SOURCE.DIRECT_PUBLICATION_ROW
  ) {
    return MEMBERSHIP_PUBLICATION_PLANNING_SOURCE.DIRECT_PUBLICATION_ROW;
  }
  return MEMBERSHIP_PUBLICATION_PLANNING_SOURCE.OWNER_ANSWER;
}

function buildReason(code, dimension, sourceOwner, observedAt, details = null) {
  const reason = {
    code,
    dimension,
    sourceOwner,
    observedAt,
  };
  if (details && typeof details === LOCAL_STR_OBJECT) {
    reason.details = details;
  }
  return Object.freeze(reason);
}

function normalizeIsoTimestamp(nowValue) {
  return new Date(nowValue).toISOString();
}

function normalizePositiveInteger(value, fallback = 0) {
  return Number.isFinite(value) && value > 0 ?
    Math.floor(value) :
    fallback;
}

function normalizeDiagnosticTimestampMs(value) {
  if (Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeNodeIdList(values = []) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || '').trim())
        .filter((value) => value.length > 0),
    ),
  ];
}

function normalizeLocalQueryTransportEvidence(readiness) {
  if (!readiness || typeof readiness !== 'object') {
    return Object.freeze({
      state: LOCAL_STR_UNKNOWN,
      ready: null,
      reason: null,
      reasonCode: null,
      errorCode: null,
      retryAfterMs: null,
    });
  }
  const ready = typeof readiness.ready === 'boolean' ? readiness.ready : null;
  return Object.freeze({
    state: ready === true ?
      LOCAL_STR_READY :
      ready === false ? LOCAL_STR_DEFERRED : LOCAL_STR_UNKNOWN,
    ready,
    reason:
      typeof readiness.reason === 'string' &&
      readiness.reason.length > 0 ?
        readiness.reason :
        null,
    reasonCode:
      typeof readiness.reasonCode === 'string' &&
      readiness.reasonCode.length > 0 ?
        readiness.reasonCode :
        null,
    errorCode:
      typeof readiness.errorCode === 'string' &&
      readiness.errorCode.length > 0 ?
        readiness.errorCode :
        null,
    retryAfterMs:
      Number.isFinite(readiness.retryAfterMs) &&
      readiness.retryAfterMs > 0 ?
        Math.floor(readiness.retryAfterMs) :
        null,
  });
}

function normalizeControlPlaneParticipationKind(value) {
  if (value === CONTROL_PLANE_PARTICIPATION_KIND.REPLICA_OPERATION_OWNER_READ) {
    return CONTROL_PLANE_PARTICIPATION_KIND.REPLICA_OPERATION_OWNER_READ;
  }
  if (value === CONTROL_PLANE_PARTICIPATION_KIND.CONTROL_PLANE_RECOVERY) {
    return CONTROL_PLANE_PARTICIPATION_KIND.CONTROL_PLANE_RECOVERY;
  }
  return CONTROL_PLANE_PARTICIPATION_KIND.ROUTED_READ;
}

function resolveParticipationDecisionDimension(
  participationKind,
  decisionDimension,
) {
  if (
    typeof decisionDimension === 'string' &&
    decisionDimension.length > 0
  ) {
    return decisionDimension;
  }
  switch (participationKind) {
  case CONTROL_PLANE_PARTICIPATION_KIND.CONTROL_PLANE_RECOVERY:
    return CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE;
  case CONTROL_PLANE_PARTICIPATION_KIND.REPLICA_OPERATION_OWNER_READ:
  case CONTROL_PLANE_PARTICIPATION_KIND.ROUTED_READ:
  default:
    return CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE;
  }
}

function buildParticipationErrorCode(participation) {
  if (
    participation?.reasonCode ===
    CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY
  ) {
    return LOCAL_STR_ROUTER_QUERY_TRANSPORT_NOT_READY;
  }
  return participation?.decision === CONTROL_PLANE_PARTICIPATION_DECISION.DEFER ?
    LOCAL_STR_CONTROL_PLANE_PARTICIPATION_DEFERRED :
    LOCAL_STR_CONTROL_PLANE_PARTICIPATION_BLOCKED;
}

function buildParticipationErrorMessage(participation) {
  if (
    participation?.reasonCode ===
      CONTROL_PLANE_READINESS_REASON.LOCAL_QUERY_TRANSPORT_NOT_READY &&
    typeof participation?.localQueryTransport?.reason === 'string' &&
    participation.localQueryTransport.reason.length > 0
  ) {
    return participation.localQueryTransport.reason;
  }
  return participation?.decision === CONTROL_PLANE_PARTICIPATION_DECISION.DEFER ?
    LOCAL_STR_CONTROL_PLANE_PARTICIPATION_DEFERRED_BY :
    LOCAL_STR_CONTROL_PLANE_PARTICIPATION_BLOCKED_BY_C;
}

function shouldAllowLocalExecutionForParticipation({
  localNodeId = null,
  targetNodeId = null,
  participationKind = null,
  localQueryTransport = null,
} = {}) {
  if (localNodeId !== targetNodeId) {
    return false;
  }
  if (
    participationKind !==
      CONTROL_PLANE_PARTICIPATION_KIND.REPLICA_OPERATION_OWNER_READ &&
    participationKind !==
      CONTROL_PLANE_PARTICIPATION_KIND.CONTROL_PLANE_RECOVERY
  ) {
    return false;
  }
  if (localQueryTransport?.ready !== false) {
    return false;
  }
  return true;
}

export const CONTROL_PLANE_READINESS_SERVICE_SHARED = {
  AUTHORITATIVE_READINESS_REPAIR,
  AUTHORITY_DESCRIPTOR_STATE,
  AUTHORITY_PUBLICATION_OBSERVATION_STATE,
  AuthoritativeControlPlaneView,
  AuthoritativeNodeEvidenceReconciler,
  COLUMN,
  CONTROL_PLANE_PARTICIPATION_DECISION,
  CONTROL_PLANE_PARTICIPATION_KIND,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_PUBLICATION_MODE,
  CONTROL_PLANE_PUBLICATION_STATUS,
  CONTROL_PLANE_READINESS_DEFAULT,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_OWNER,
  CONTROL_PLANE_READINESS_REASON,
  CONTROL_PLANE_READINESS_SUBSYSTEM,
  ControlPlaneDiagnosticsLedger,
  DEFAULT_PRIORITY_RECOVERY_ACTIVITY_STALE_GRACE_MS,
  DurableWorkflowCoordinator,
  LOCAL_SYSTEM_TABLE_QUERY_CONSISTENCY,
  LoggingService,
  MEMBERSHIP_PUBLICATION_AUTHORITATIVE_READ_MODE,
  MEMBERSHIP_PUBLICATION_PLANNING,
  MEMBERSHIP_PUBLICATION_PLANNING_READ_OPTIONS,
  MEMBERSHIP_PUBLICATION_PLANNING_SOURCE,
  MEMBERSHIP_PUBLICATION_READ_LANE,
  MEMBERSHIP_PUBLICATION_READ_OPTIONS,
  MEMBERSHIP_PUBLICATION_READ_SCOPE,
  MISSING_NODE_READINESS_REASON,
  MISSING_NODE_READINESS_STATE,
  NUM,
  OperationLane,
  PRESSURE_STATE,
  PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE,
  PROJECTION_READINESS_CONTRACT_STATE,
  PROVISIONING_ELIGIBILITY_STATE,
  PUBLICATION_REASON_CONFIG_SAFE_MODE,
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
  READINESS_DIAGNOSTICS_LEDGER_LIMIT,
  READINESS_ERROR_MSG,
  READINESS_TRANSITION_HISTORY_LIMIT,
  RECOVERY_EPOCH_EVENT_LIMIT,
  RECOVERY_EPOCH_HISTORY_LIMIT,
  RECOVERY_GRACE_MESSAGE_GROUP_SERVICE_STATUSES,
  RECOVERY_PROTOCOL_STATE,
  RUNTIME_AUTHORITY_PUBLICATION_STATE,
  RUNTIME_AUTHORITY_REPAIR_STATE,
  RUNTIME_AUTHORITY_STATE,
  RUNTIME_AUTHORITY_VISIBILITY_STATE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STARTUP_AUTHORITY_ADMISSION_STATE,
  STARTUP_AUTHORITY_STATE,
  STATE,
  TABLES,
  TIME_MS,
  TYPEOF,
  assertCritical,
  buildControlPlanePublicationStory,
  buildProjectionReadinessContract,
  buildParticipationErrorCode,
  buildParticipationErrorMessage,
  buildPublicationRecoveryGateSnapshot,
  buildCanonicalPublicationRecoveryEvidence,
  buildPublicationRecoveryProtocolSnapshot,
  buildReadinessTransitionOwnerState,
  buildReason,
  buildStartupAuthorityFailureOwnerDescriptor,
  buildStartupAuthorityHealthDetails,
  buildStartupAuthorityOwnerContract,
  buildStartupAuthorityOwnerSnapshotFromPlanningAnswer,
  buildStartupAuthorityOwnerUnavailableSnapshot,
  buildStartupAuthorityPriorityPartitionOwnerDescriptor,
  buildStartupAuthorityPublicationOwnerDescriptor,
  buildStartupAuthorityRecoveryProtocolOwnerDescriptor,
  buildStartupAuthorityTargetParticipationOwnerDescriptor,
  compactEligibilitySnapshot,
  compareNodeHeartbeatWatermarks,
  createControlPlaneRuntimeBundle,
  createEligibilitySnapshot,
  evaluateEligibilityDecision,
  isNodeReadyLeaseExplicitlyCleared,
  isNodeRecordReady,
  normalizeControlPlaneParticipationKind,
  normalizeDiagnosticTimestampMs,
  normalizeIsoTimestamp,
  normalizeLocalQueryTransportEvidence,
  normalizeNodeIdList,
  normalizePositiveInteger,
  resolveMembershipPublicationPlanningSource,
  resolveMembershipPublicationReadLane,
  resolveMembershipPublicationReadOptions,
  resolveMembershipPublicationReadScope,
  resolveParticipationDecisionDimension,
  resolvePriorityRecoveryActiveNodeCohort,
  shouldAllowLocalExecutionForParticipation,
  unwrapRowReadResult,
  wasNodeRecordReadyWhenWritten,
};
