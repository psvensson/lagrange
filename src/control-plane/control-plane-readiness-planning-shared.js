import {CONTROL_PLANE_READINESS_SERVICE_SHARED} from './control-plane-readiness-service-shared.js';

const LOCAL_STR_PRESENT = 'present';
const LOCAL_STR_12BRF = 'ControlPlaneReadinessService missing storage accounting owner';
const LOCAL_STR_EMPTY = '';
const LOCAL_STR_BOOLEAN = 'boolean';

const {
  COLUMN,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_PUBLICATION_STATUS,
  CONTROL_PLANE_READINESS_DEFAULT,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_OWNER,
  CONTROL_PLANE_READINESS_REASON,
  MEMBERSHIP_PUBLICATION_PLANNING_SOURCE,
  MEMBERSHIP_PUBLICATION_READ_SCOPE,
  MISSING_NODE_READINESS_STATE,
  NUM,
  PRESSURE_STATE,
  PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE,
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
  READINESS_ERROR_MSG,
  RECOVERY_GRACE_MESSAGE_GROUP_SERVICE_STATUSES,
  RECOVERY_PROTOCOL_STATE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STARTUP_AUTHORITY_ADMISSION_STATE,
  STARTUP_AUTHORITY_STATE,
  STATE,
  TABLES,
  TYPEOF,
  buildCanonicalPublicationRecoveryEvidence,
  buildPublicationRecoveryGateSnapshot,
  buildPublicationRecoveryProtocolSnapshot,
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
  isNodeReadyLeaseExplicitlyCleared,
  isNodeRecordReady,
  normalizeDiagnosticTimestampMs,
  normalizeLocalQueryTransportEvidence,
  resolveMembershipPublicationPlanningSource,
  resolveMembershipPublicationReadLane,
  resolveMembershipPublicationReadOptions,
  resolveMembershipPublicationReadScope,
  unwrapRowReadResult,
  wasNodeRecordReadyWhenWritten,
} = CONTROL_PLANE_READINESS_SERVICE_SHARED;

const PRIORITY_CONTROL_PLANE_RECOVERY_PROJECTION_STATE = Object.freeze({
  PUBLICATION_GATE_PENDING: 'publication_gate_pending',
  READY: 'ready',
  RUNTIME_BLOCKED: 'runtime_blocked',
});

function normalizePendingAckEvidenceSource(source = {}) {
  const requiredAckNodeIds = Array.isArray(source?.requiredAckNodeIds) ?
    source.requiredAckNodeIds :
    [];
  const pendingAckCount = Number(source?.pendingAckCount);
  return Object.freeze({
    hasExplicitCountOnlyState:
      source?.pendingAckEvidenceState ===
        PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY,
    hasExplicitRequiredAckNodeListState:
      source?.pendingAckEvidenceState ===
        PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
          .REQUIRED_ACK_NODE_LIST,
    hasRequiredAckNodeList: Array.isArray(source?.requiredAckNodeIds),
    hasRequiredAckNodeListDebt: requiredAckNodeIds.length > NUM.ZERO,
    hasPendingAckCountDebt:
      Number.isFinite(pendingAckCount) && pendingAckCount > NUM.ZERO,
  });
}

function resolvePendingAckEvidenceStateFromSources(sources = []) {
  const pendingAckEvidenceDecision = sources
    .map((source) => normalizePendingAckEvidenceSource(source))
    .flatMap((evidence) => [
      {
        matches: evidence.hasExplicitCountOnlyState,
        state: PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY,
      },
      {
        matches: evidence.hasExplicitRequiredAckNodeListState,
        state: PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
          .REQUIRED_ACK_NODE_LIST,
      },
      {
        matches: evidence.hasRequiredAckNodeListDebt,
        state: PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
          .REQUIRED_ACK_NODE_LIST,
      },
      {
        matches: evidence.hasPendingAckCountDebt,
        state: PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY,
      },
      {
        matches: evidence.hasRequiredAckNodeList,
        state: PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE
          .REQUIRED_ACK_NODE_LIST,
      },
    ])
    .find((decision) => decision.matches === true);
  return pendingAckEvidenceDecision?.state ||
    PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY;
}

const CONTROL_PLANE_READINESS_PLANNING_SHARED = Object.freeze({
  COLUMN,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_PUBLICATION_STATUS,
  CONTROL_PLANE_READINESS_DEFAULT,
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_OWNER,
  CONTROL_PLANE_READINESS_REASON,
  CONTROL_PLANE_READINESS_SERVICE_SHARED,
  LOCAL_STR_12BRF,
  LOCAL_STR_BOOLEAN,
  LOCAL_STR_EMPTY,
  LOCAL_STR_PRESENT,
  MEMBERSHIP_PUBLICATION_PLANNING_SOURCE,
  MEMBERSHIP_PUBLICATION_READ_SCOPE,
  MISSING_NODE_READINESS_STATE,
  NUM,
  PRESSURE_STATE,
  PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE,
  PRIORITY_CONTROL_PLANE_RECOVERY_PROJECTION_STATE,
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
  READINESS_ERROR_MSG,
  RECOVERY_GRACE_MESSAGE_GROUP_SERVICE_STATUSES,
  RECOVERY_PROTOCOL_STATE,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STARTUP_AUTHORITY_ADMISSION_STATE,
  STARTUP_AUTHORITY_STATE,
  STATE,
  TABLES,
  TYPEOF,
  buildCanonicalPublicationRecoveryEvidence,
  buildPublicationRecoveryGateSnapshot,
  buildPublicationRecoveryProtocolSnapshot,
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
  isNodeReadyLeaseExplicitlyCleared,
  isNodeRecordReady,
  normalizeDiagnosticTimestampMs,
  normalizeLocalQueryTransportEvidence,
  normalizePendingAckEvidenceSource,
  resolveMembershipPublicationPlanningSource,
  resolveMembershipPublicationReadLane,
  resolveMembershipPublicationReadOptions,
  resolveMembershipPublicationReadScope,
  resolvePendingAckEvidenceStateFromSources,
  unwrapRowReadResult,
  wasNodeRecordReadyWhenWritten,
});

export {CONTROL_PLANE_READINESS_PLANNING_SHARED};
