import {NUM, TYPEOF} from '../constants/index.js';
import {
  AUTHORITY_PUBLICATION_OBSERVATION_STATE,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
} from './control-plane-readiness-constants.js';
import {
  STARTUP_AUTHORITY_ADMISSION_STATE,
  buildStartupAuthoritySnapshotContract,
  isStartupProjectionActiveGateBlocked,
  isStartupProjectionActiveGateRecoveryOpen,
  normalizeStartupProjectionActiveGate,
  normalizeStartupProjectionReadinessContract,
} from './startup-authority-snapshot-contract.js';
import {
  resolvePriorityRecoveryActiveNodeCohort,
} from './priority-recovery-snapshot.js';
import {
  PUBLICATION_RECOVERY_GATE_STATE,
  buildPublicationRecoveryGateSnapshot,
} from './publication-recovery-gate.js';

export {
  STARTUP_AUTHORITY_ADMISSION_STATE,
  buildPriorityRecoveryHealthDetailsFromStartupAuthority,
  buildStartupAuthorityAdmissionDescriptor,
  buildStartupAuthorityFailureDescriptor,
  buildStartupAuthorityPriorityPartitionDescriptor,
  buildStartupAuthorityPublicationDescriptor,
  buildStartupAuthorityRecoveryProtocolDescriptor,
  buildStartupAuthoritySnapshotContract,
  buildStartupAuthorityTargetParticipationDescriptor,
} from './startup-authority-snapshot-contract.js';

const LOCAL_STR_1P74U = 'control_plane_recovery_service_unavailable';
const LOCAL_STR_RZRDP = 'control_plane_recovery_planning_provider_unavailable';
const LOCAL_STR_K5O5W = 'control_plane_recovery_planning_read_failed';
const LOCAL_STR_K9A2Z = 'control_plane_recovery_planning_unavailable';
const LOCAL_STR_1WVYP = 'control_plane_recovery_planning_incomplete';
const LOCAL_STR_READY = 'ready';
const LOCAL_STR_RECOVERY_PENDING = 'recovery_pending';
const LOCAL_STR_1YO6Q = 'seed_locally_ready_unpublished';
const LOCAL_STR_Q43AB = 'authority_unavailable';
const LOCAL_STR_BLOCKED = 'blocked';

export const PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE = Object.freeze({
  SERVICE_UNAVAILABLE: LOCAL_STR_1P74U,
  PLANNING_PROVIDER_UNAVAILABLE:
    LOCAL_STR_RZRDP,
  PLANNING_READ_FAILED: LOCAL_STR_K5O5W,
  PLANNING_UNAVAILABLE: LOCAL_STR_K9A2Z,
  PLANNING_INCOMPLETE: LOCAL_STR_1WVYP,
});

export const STARTUP_AUTHORITY_STATE = Object.freeze({
  READY: LOCAL_STR_READY,
  RECOVERY_PENDING: LOCAL_STR_RECOVERY_PENDING,
  SEED_LOCALLY_READY_UNPUBLISHED: LOCAL_STR_1YO6Q,
  AUTHORITY_UNAVAILABLE: LOCAL_STR_Q43AB,
  BLOCKED: LOCAL_STR_BLOCKED,
});

const STARTUP_AUTHORITY_PUBLICATION_STATE = Object.freeze({
  AUTHORITATIVE: 'authoritative',
  ESTABLISHING: 'establishing',
});
const STARTUP_AUTHORITY_TRANSITIONAL_RECOVERY_GATE_STATE = new Set([
  PUBLICATION_RECOVERY_GATE_STATE.PUBLICATION_PENDING,
  PUBLICATION_RECOVERY_GATE_STATE.ACK_PENDING,
  PUBLICATION_RECOVERY_GATE_STATE.PRIORITY_SPREAD_PENDING,
]);
const STARTUP_AUTHORITY_PRIORITY_RECOVERY_REASON_CODES = new Set(
  Object.values(CONTROL_PLANE_PRIORITY_RECOVERY_REASON),
);

function hasKnownStartupAuthorityString(value) {
  return typeof value === TYPEOF.STRING && value.length > NUM.ZERO;
}

function hasStartupAuthorityTargetParticipationEvidence(targetParticipation) {
  return targetParticipation && typeof targetParticipation === TYPEOF.OBJECT;
}

function normalizeStartupAuthorityTargetParticipationRecoveryReasons(
  targetParticipation,
) {
  return Object.freeze(
    [...new Set(
      (Array.isArray(targetParticipation?.reasons) ? targetParticipation.reasons : [])
        .filter((reasonCode) =>
          typeof reasonCode === TYPEOF.STRING &&
          STARTUP_AUTHORITY_PRIORITY_RECOVERY_REASON_CODES.has(reasonCode),
        ),
    )],
  );
}

function hasStartupAuthorityPriorityPartitionEvidence(priorityPartitionSummary) {
  return priorityPartitionSummary &&
    typeof priorityPartitionSummary === TYPEOF.OBJECT;
}

export function hasTransitionalStartupAuthorityEvidence(options = {}) {
  const publicationRecoveryGate =
    options.publicationRecoveryGate &&
      typeof options.publicationRecoveryGate === TYPEOF.OBJECT ?
      options.publicationRecoveryGate :
      null;
  const canonicalStartupNodeIds = Array.isArray(options.canonicalStartupNodeIds) ?
    options.canonicalStartupNodeIds :
    [];
  if (!publicationRecoveryGate || canonicalStartupNodeIds.length === NUM.ZERO) {
    return false;
  }
  const activeGate =
    publicationRecoveryGate.active === true ||
    STARTUP_AUTHORITY_TRANSITIONAL_RECOVERY_GATE_STATE.has(
      publicationRecoveryGate.state,
    );
  if (!activeGate) {
    return false;
  }
  return hasKnownStartupAuthorityString(options.publicationStatus) ||
    hasStartupAuthorityPriorityPartitionEvidence(
      options.priorityPartitionSummary,
    ) ||
    hasKnownStartupAuthorityString(options.recoveryProtocolState) ||
    hasStartupAuthorityTargetParticipationEvidence(options.targetParticipation) ||
    (Array.isArray(publicationRecoveryGate.reasonCodes) &&
      publicationRecoveryGate.reasonCodes.length > NUM.ZERO);
}

export function buildStartupAuthorityUnavailableSnapshot(
  failureReason,
  error = null,
  context = null,
) {
  const details = {
    failureReason,
  };
  if (context && typeof context === TYPEOF.OBJECT) {
    Object.assign(details, context);
  }
  if (error) {
    details.error = error?.message || String(error);
  }
  return buildStartupAuthoritySnapshotContract({
    state: STARTUP_AUTHORITY_STATE.AUTHORITY_UNAVAILABLE,
    ready: false,
    authorityAvailable: false,
    publicationEpoch:
      Number.isFinite(details.publicationEpoch) ?
        details.publicationEpoch :
        undefined,
    publicationStatus:
      typeof details.publicationStatus === TYPEOF.STRING &&
      details.publicationStatus.length > NUM.ZERO ?
        details.publicationStatus :
        undefined,
    publicationObservationState:
      typeof details.publicationObservationState === TYPEOF.STRING &&
      details.publicationObservationState.length > NUM.ZERO ?
        details.publicationObservationState :
        AUTHORITY_PUBLICATION_OBSERVATION_STATE.OBSERVATION_UNAVAILABLE,
    priorityPartitionSummary:
      details.priorityPartitionSummary &&
      typeof details.priorityPartitionSummary === TYPEOF.OBJECT ?
        details.priorityPartitionSummary :
        undefined,
    recoveryProtocolState:
      typeof details.recoveryProtocolState === TYPEOF.STRING &&
      details.recoveryProtocolState.length > NUM.ZERO ?
        details.recoveryProtocolState :
        undefined,
    targetParticipation:
      details.targetParticipation &&
      typeof details.targetParticipation === TYPEOF.OBJECT ?
        details.targetParticipation :
        undefined,
    projectionReadinessContract:
      details.projectionReadinessContract &&
      typeof details.projectionReadinessContract === TYPEOF.OBJECT ?
        details.projectionReadinessContract :
        undefined,
    priorityRecoveryReasonCodes: [],
    canonicalStartupNodeIds: details.canonicalStartupNodeIds,
    failureReason,
  });
}

export function buildStartupAuthoritySnapshotFromPlanningAnswer(
  planningSnapshot,
) {
  if (!planningSnapshot || typeof planningSnapshot !== TYPEOF.OBJECT) {
    return buildStartupAuthorityUnavailableSnapshot(
      PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_UNAVAILABLE,
    );
  }

  const publicationRecoveryGate =
    buildPublicationRecoveryGateSnapshot(planningSnapshot);
  const projectionReadinessContract =
    normalizeStartupProjectionReadinessContract(planningSnapshot);
  const projectionReadinessActiveGate =
    normalizeStartupProjectionActiveGate(projectionReadinessContract);
  const publicationStatus = publicationRecoveryGate.publicationStatus || null;
  const priorityPartitionSummary =
    publicationRecoveryGate.priorityPartitionSummary ||
    planningSnapshot.priorityPartitionSummary ||
    null;
  const canonicalStartupNodeIds = Array.isArray(
    resolvePriorityRecoveryActiveNodeCohort(planningSnapshot).activeNodeIds,
  ) ?
    resolvePriorityRecoveryActiveNodeCohort(planningSnapshot).activeNodeIds :
    [];
  const publicationObservationState =
    publicationRecoveryGate.publicationObservationState;
  const targetParticipation =
    planningSnapshot.targetParticipation &&
    typeof planningSnapshot.targetParticipation === TYPEOF.OBJECT ?
      planningSnapshot.targetParticipation :
      null;
  const admissionState =
    typeof planningSnapshot.admissionState === TYPEOF.STRING ?
      planningSnapshot.admissionState :
      undefined;
  const admissionReasonCodes = Array.isArray(
    planningSnapshot.admissionReasonCodes,
  ) ?
    planningSnapshot.admissionReasonCodes :
    [];
  const clusterIncarnationFence =
    planningSnapshot.clusterIncarnationFence &&
      typeof planningSnapshot.clusterIncarnationFence === TYPEOF.OBJECT ?
      planningSnapshot.clusterIncarnationFence :
      null;
  const targetParticipationReasons =
    normalizeStartupAuthorityTargetParticipationRecoveryReasons(
      targetParticipation,
    );
  const priorityRecoveryReasonCodes = [...new Set([
    ...publicationRecoveryGate.reasonCodes,
    ...targetParticipationReasons,
  ])];
  const explicitAdmissionBlocked =
    admissionState === STARTUP_AUTHORITY_ADMISSION_STATE.BLOCKED;

  if (explicitAdmissionBlocked) {
    return buildStartupAuthoritySnapshotContract({
      state: STARTUP_AUTHORITY_STATE.BLOCKED,
      ready: false,
      authorityAvailable: true,
      publicationEpoch:
        Number.isFinite(planningSnapshot.publicationEpoch) ?
          planningSnapshot.publicationEpoch :
          undefined,
      publicationStatus:
        typeof publicationStatus === TYPEOF.STRING &&
          publicationStatus.length > NUM.ZERO ?
          publicationStatus :
          undefined,
      publicationObservationState,
      priorityPartitionSummary: priorityPartitionSummary || undefined,
      recoveryProtocolState:
        typeof planningSnapshot.recoveryProtocolState === TYPEOF.STRING ?
          planningSnapshot.recoveryProtocolState :
          undefined,
      targetParticipation: targetParticipation || undefined,
      admissionState,
      admissionReasonCodes,
      clusterIncarnationFence,
      priorityRecoveryReasonCodes,
      canonicalStartupNodeIds,
      publicationRecoveryGate,
      projectionReadinessContract,
    });
  }

  if (
    publicationRecoveryGate.state ===
      PUBLICATION_RECOVERY_GATE_STATE.UNPUBLISHED_OBSERVATION ||
    publicationObservationState ===
      AUTHORITY_PUBLICATION_OBSERVATION_STATE.UNPUBLISHED
  ) {
    const priorityRecoveryReasonCodes = [...new Set(
      publicationRecoveryGate.reasonCodes.concat(
        CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
      ),
    )];
    return buildStartupAuthoritySnapshotContract({
      state: STARTUP_AUTHORITY_STATE.SEED_LOCALLY_READY_UNPUBLISHED,
      ready: false,
      authorityAvailable: true,
      publicationObservationState,
      priorityPartitionSummary: priorityPartitionSummary || undefined,
      recoveryProtocolState:
        typeof planningSnapshot.recoveryProtocolState === TYPEOF.STRING ?
          planningSnapshot.recoveryProtocolState :
          undefined,
      targetParticipation:
        planningSnapshot.targetParticipation &&
        typeof planningSnapshot.targetParticipation === TYPEOF.OBJECT ?
          planningSnapshot.targetParticipation :
          undefined,
      admissionState,
      admissionReasonCodes,
      clusterIncarnationFence,
      priorityRecoveryReasonCodes,
      canonicalStartupNodeIds,
      publicationRecoveryGate,
      projectionReadinessContract,
    });
  }

  const transitionalRecoveryPending =
    hasTransitionalStartupAuthorityEvidence({
      publicationRecoveryGate,
      publicationStatus,
      priorityPartitionSummary,
      recoveryProtocolState: planningSnapshot.recoveryProtocolState,
      targetParticipation,
      canonicalStartupNodeIds,
    });

  if (
    typeof publicationStatus !== TYPEOF.STRING ||
    publicationStatus.length === NUM.ZERO
  ) {
    if (transitionalRecoveryPending) {
      return buildStartupAuthoritySnapshotContract({
        state: STARTUP_AUTHORITY_STATE.RECOVERY_PENDING,
        ready: false,
        authorityAvailable: true,
        publicationEpoch:
          Number.isFinite(planningSnapshot.publicationEpoch) ?
            planningSnapshot.publicationEpoch :
            undefined,
        publicationObservationState:
          publicationObservationState ||
          STARTUP_AUTHORITY_PUBLICATION_STATE.ESTABLISHING,
        priorityPartitionSummary: priorityPartitionSummary || undefined,
        recoveryProtocolState:
          typeof planningSnapshot.recoveryProtocolState === TYPEOF.STRING ?
            planningSnapshot.recoveryProtocolState :
            undefined,
        targetParticipation: targetParticipation || undefined,
        admissionState,
        admissionReasonCodes,
        clusterIncarnationFence,
        priorityRecoveryReasonCodes,
        canonicalStartupNodeIds,
        publicationRecoveryGate,
        projectionReadinessContract,
      });
    }
    return buildStartupAuthorityUnavailableSnapshot(
      PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_INCOMPLETE,
      null,
      {
        publicationEpoch:
          Number.isFinite(planningSnapshot.publicationEpoch) ?
            planningSnapshot.publicationEpoch :
            undefined,
        publicationStatus: publicationStatus || undefined,
        publicationObservationState,
        canonicalStartupNodeIds,
        admissionState,
        admissionReasonCodes,
        clusterIncarnationFence,
        publicationRecoveryGate,
        projectionReadinessContract,
      },
    );
  }

  if (
    !priorityPartitionSummary ||
    typeof priorityPartitionSummary.satisfied !== TYPEOF.BOOLEAN
  ) {
    if (transitionalRecoveryPending) {
      return buildStartupAuthoritySnapshotContract({
        state: STARTUP_AUTHORITY_STATE.RECOVERY_PENDING,
        ready: false,
        authorityAvailable: true,
        publicationEpoch:
          Number.isFinite(planningSnapshot.publicationEpoch) ?
            planningSnapshot.publicationEpoch :
            undefined,
        publicationStatus,
        publicationObservationState:
          publicationObservationState ||
          STARTUP_AUTHORITY_PUBLICATION_STATE.ESTABLISHING,
        priorityPartitionSummary: priorityPartitionSummary || undefined,
        recoveryProtocolState:
          typeof planningSnapshot.recoveryProtocolState === TYPEOF.STRING ?
            planningSnapshot.recoveryProtocolState :
            undefined,
        targetParticipation: targetParticipation || undefined,
        admissionState,
        admissionReasonCodes,
        clusterIncarnationFence,
        priorityRecoveryReasonCodes,
        canonicalStartupNodeIds,
        publicationRecoveryGate,
        projectionReadinessContract,
      });
    }
    return buildStartupAuthorityUnavailableSnapshot(
      PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE.PLANNING_INCOMPLETE,
      null,
      {
        publicationEpoch:
          Number.isFinite(planningSnapshot.publicationEpoch) ?
            planningSnapshot.publicationEpoch :
            undefined,
        publicationStatus,
        priorityPartitionSummary,
        recoveryProtocolState:
          typeof planningSnapshot.recoveryProtocolState === TYPEOF.STRING ?
            planningSnapshot.recoveryProtocolState :
            undefined,
        targetParticipation:
          planningSnapshot.targetParticipation &&
          typeof planningSnapshot.targetParticipation === TYPEOF.OBJECT ?
            planningSnapshot.targetParticipation :
            undefined,
        admissionState,
        admissionReasonCodes,
        clusterIncarnationFence,
        canonicalStartupNodeIds,
        publicationRecoveryGate,
        projectionReadinessContract,
      },
    );
  }

  const blocked =
    (
      targetParticipationReasons.length > NUM.ZERO &&
      canonicalStartupNodeIds.length === NUM.ZERO
    ) ||
    isStartupProjectionActiveGateBlocked(projectionReadinessActiveGate);
  const state = blocked ?
    STARTUP_AUTHORITY_STATE.BLOCKED :
    (priorityRecoveryReasonCodes.length > NUM.ZERO ||
      isStartupProjectionActiveGateRecoveryOpen(
        projectionReadinessActiveGate,
      ) ?
      STARTUP_AUTHORITY_STATE.RECOVERY_PENDING :
      STARTUP_AUTHORITY_STATE.READY);

  return buildStartupAuthoritySnapshotContract({
    state,
    ready: state === STARTUP_AUTHORITY_STATE.READY,
    authorityAvailable: true,
    publicationEpoch:
      Number.isFinite(planningSnapshot.publicationEpoch) ?
        planningSnapshot.publicationEpoch :
        undefined,
    publicationStatus,
    publicationObservationState:
      publicationObservationState ||
      (state === STARTUP_AUTHORITY_STATE.READY ?
        STARTUP_AUTHORITY_PUBLICATION_STATE.AUTHORITATIVE :
        STARTUP_AUTHORITY_PUBLICATION_STATE.ESTABLISHING),
    priorityPartitionSummary,
    recoveryProtocolState:
      typeof planningSnapshot.recoveryProtocolState === TYPEOF.STRING ?
        planningSnapshot.recoveryProtocolState :
        undefined,
    targetParticipation: targetParticipation || undefined,
    admissionState,
    admissionReasonCodes,
    clusterIncarnationFence,
    priorityRecoveryReasonCodes,
    canonicalStartupNodeIds,
    publicationRecoveryGate,
    projectionReadinessContract,
  });
}
