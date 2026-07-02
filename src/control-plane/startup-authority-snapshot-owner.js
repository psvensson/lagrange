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
import {
  PROJECTION_READINESS_ACTIVE_GATE_STATE,
  PROJECTION_READINESS_REASON,
} from './projection-readiness-constants.js';

function isStartupProjectionActiveGateServeEligibleInFlight(
  activeGate,
  prioritySpreadDurablySatisfied,
) {
  // Only the stronger REPAIR_READY state (repair lane ready, serve blocked)
  // is eligible; INTERNAL_READY means the repair lane itself is not ready.
  if (
    activeGate?.state !==
    PROJECTION_READINESS_ACTIVE_GATE_STATE.REPAIR_READY
  ) {
    return false;
  }
  if (prioritySpreadDurablySatisfied !== true) {
    return false;
  }
  const reasonCodes = Array.isArray(activeGate?.reasonCodes) ?
    activeGate.reasonCodes :
    [];
  // FAIL-CLOSED allowlist: relax only when the active gate's serve-lane
  // reasonCodes are EXACTLY priority_recovery_active — i.e. the sole thing
  // keeping the serve lane closed is the in-flight recovery op, with no other
  // disqualifier (serve_not_eligible, publication_stream_*, AND internal-lane
  // reasons such as cluster_member_unhealthy that can ride along in
  // REPAIR_READY). Any other reason, or a summarized snapshot whose reasonCodes
  // were dropped to bound the served payload, keeps the node conservatively
  // RECOVERY_PENDING. An allowlist (not a disqualifier blocklist) stays safe if
  // new lane reasons are added later.
  return (
    reasonCodes.includes(
      PROJECTION_READINESS_REASON.PRIORITY_RECOVERY_ACTIVE,
    ) &&
    reasonCodes.every((reasonCode) =>
      reasonCode === PROJECTION_READINESS_REASON.PRIORITY_RECOVERY_ACTIVE,
    )
  );
}

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

const LOCAL_STR_CONTROL_PLANE_RECOVERY_SERVICE_UNAVAILAB = 'control_plane_recovery_service_unavailable';
const LOCAL_STR_CONTROL_PLANE_RECOVERY_PLANNING_PROVIDER = 'control_plane_recovery_planning_provider_unavailable';
const LOCAL_STR_CONTROL_PLANE_RECOVERY_PLANNING_READ_FAI = 'control_plane_recovery_planning_read_failed';
const LOCAL_STR_CONTROL_PLANE_RECOVERY_PLANNING_UNAVAILA = 'control_plane_recovery_planning_unavailable';
const LOCAL_STR_CONTROL_PLANE_RECOVERY_PLANNING_INCOMPLE = 'control_plane_recovery_planning_incomplete';
const LOCAL_STR_READY = 'ready';
const LOCAL_STR_RECOVERY_PENDING = 'recovery_pending';
const LOCAL_STR_SEED_LOCALLY_READY_UNPUBLISHED = 'seed_locally_ready_unpublished';
const LOCAL_STR_AUTHORITY_UNAVAILABLE = 'authority_unavailable';
const LOCAL_STR_BLOCKED = 'blocked';

export const PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE = Object.freeze({
  SERVICE_UNAVAILABLE: LOCAL_STR_CONTROL_PLANE_RECOVERY_SERVICE_UNAVAILAB,
  PLANNING_PROVIDER_UNAVAILABLE:
    LOCAL_STR_CONTROL_PLANE_RECOVERY_PLANNING_PROVIDER,
  PLANNING_READ_FAILED: LOCAL_STR_CONTROL_PLANE_RECOVERY_PLANNING_READ_FAI,
  PLANNING_UNAVAILABLE: LOCAL_STR_CONTROL_PLANE_RECOVERY_PLANNING_UNAVAILA,
  PLANNING_INCOMPLETE: LOCAL_STR_CONTROL_PLANE_RECOVERY_PLANNING_INCOMPLE,
});

export const STARTUP_AUTHORITY_STATE = Object.freeze({
  READY: LOCAL_STR_READY,
  RECOVERY_PENDING: LOCAL_STR_RECOVERY_PENDING,
  SEED_LOCALLY_READY_UNPUBLISHED: LOCAL_STR_SEED_LOCALLY_READY_UNPUBLISHED,
  AUTHORITY_UNAVAILABLE: LOCAL_STR_AUTHORITY_UNAVAILABLE,
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
  return typeof value === 'string' && value.length > 0;
}

function hasStartupAuthorityTargetParticipationEvidence(targetParticipation) {
  return targetParticipation && typeof targetParticipation === 'object';
}

function normalizeStartupAuthorityTargetParticipationRecoveryReasons(
  targetParticipation,
) {
  return Object.freeze(
    [...new Set(
      (Array.isArray(targetParticipation?.reasons) ? targetParticipation.reasons : [])
        .filter((reasonCode) =>
          typeof reasonCode === 'string' &&
          STARTUP_AUTHORITY_PRIORITY_RECOVERY_REASON_CODES.has(reasonCode),
        ),
    )],
  );
}

function hasStartupAuthorityPriorityPartitionEvidence(priorityPartitionSummary) {
  return priorityPartitionSummary &&
    typeof priorityPartitionSummary === 'object';
}

export function hasTransitionalStartupAuthorityEvidence(options = {}) {
  const publicationRecoveryGate =
    options.publicationRecoveryGate &&
      typeof options.publicationRecoveryGate === 'object' ?
      options.publicationRecoveryGate :
      null;
  const canonicalStartupNodeIds = Array.isArray(options.canonicalStartupNodeIds) ?
    options.canonicalStartupNodeIds :
    [];
  if (!publicationRecoveryGate || canonicalStartupNodeIds.length === 0) {
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
      publicationRecoveryGate.reasonCodes.length > 0);
}

export function buildStartupAuthorityUnavailableSnapshot(
  failureReason,
  error = null,
  context = null,
) {
  const details = {
    failureReason,
  };
  if (context && typeof context === 'object') {
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
      typeof details.publicationStatus === 'string' &&
      details.publicationStatus.length > 0 ?
        details.publicationStatus :
        undefined,
    publicationObservationState:
      typeof details.publicationObservationState === 'string' &&
      details.publicationObservationState.length > 0 ?
        details.publicationObservationState :
        AUTHORITY_PUBLICATION_OBSERVATION_STATE.OBSERVATION_UNAVAILABLE,
    priorityPartitionSummary:
      details.priorityPartitionSummary &&
      typeof details.priorityPartitionSummary === 'object' ?
        details.priorityPartitionSummary :
        undefined,
    recoveryProtocolState:
      typeof details.recoveryProtocolState === 'string' &&
      details.recoveryProtocolState.length > 0 ?
        details.recoveryProtocolState :
        undefined,
    targetParticipation:
      details.targetParticipation &&
      typeof details.targetParticipation === 'object' ?
        details.targetParticipation :
        undefined,
    projectionReadinessContract:
      details.projectionReadinessContract &&
      typeof details.projectionReadinessContract === 'object' ?
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
  if (!planningSnapshot || typeof planningSnapshot !== 'object') {
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
    typeof planningSnapshot.targetParticipation === 'object' ?
      planningSnapshot.targetParticipation :
      null;
  const admissionState =
    typeof planningSnapshot.admissionState === 'string' ?
      planningSnapshot.admissionState :
      undefined;
  const admissionReasonCodes = Array.isArray(
    planningSnapshot.admissionReasonCodes,
  ) ?
    planningSnapshot.admissionReasonCodes :
    [];
  const clusterIncarnationFence =
    planningSnapshot.clusterIncarnationFence &&
      typeof planningSnapshot.clusterIncarnationFence === 'object' ?
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
        typeof publicationStatus === 'string' &&
          publicationStatus.length > 0 ?
          publicationStatus :
          undefined,
      publicationObservationState,
      priorityPartitionSummary: priorityPartitionSummary || undefined,
      recoveryProtocolState:
        typeof planningSnapshot.recoveryProtocolState === 'string' ?
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
        typeof planningSnapshot.recoveryProtocolState === 'string' ?
          planningSnapshot.recoveryProtocolState :
          undefined,
      targetParticipation:
        planningSnapshot.targetParticipation &&
        typeof planningSnapshot.targetParticipation === 'object' ?
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
    typeof publicationStatus !== 'string' ||
    publicationStatus.length === 0
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
          typeof planningSnapshot.recoveryProtocolState === 'string' ?
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
    typeof priorityPartitionSummary.satisfied !== 'boolean'
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
          typeof planningSnapshot.recoveryProtocolState === 'string' ?
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
          typeof planningSnapshot.recoveryProtocolState === 'string' ?
            planningSnapshot.recoveryProtocolState :
            undefined,
        targetParticipation:
          planningSnapshot.targetParticipation &&
          typeof planningSnapshot.targetParticipation === 'object' ?
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
      targetParticipationReasons.length > 0 &&
      canonicalStartupNodeIds.length === 0
    ) ||
    isStartupProjectionActiveGateBlocked(projectionReadinessActiveGate);
  // A node whose voter-ready (durable) priority spread is satisfied is
  // serve-eligible even while a recovery operation is still in flight, PROVIDED
  // the only thing the projection active gate is waiting on is that in-flight
  // op (no serve/publication disqualifier). Treating spread_satisfied_in_flight
  // as recovery_pending withheld serve-eligibility cluster-wide — the root of
  // the rolling-restart run3 (seed LEADER_METADATA_INCOMPLETE) and run7 (load
  // nodeSlotUnavailable) gate failures. The durable summary (not the optimistic
  // closure-witness one) keeps this voter-ready-sound regardless of the in-flight
  // spread optimism (which the stall un-mask only withdraws once a remove-dispatch
  // op is stalled past its budget without a voter-ready target).
  const prioritySpreadDurablySatisfied =
    publicationRecoveryGate.durablePriorityPartitionSummary?.satisfied === true;
  const activeGateRecoveryServeEligible =
    isStartupProjectionActiveGateServeEligibleInFlight(
      projectionReadinessActiveGate,
      prioritySpreadDurablySatisfied,
    );
  const activeGateRecoveryBlocksReadiness =
    isStartupProjectionActiveGateRecoveryOpen(projectionReadinessActiveGate) &&
    !activeGateRecoveryServeEligible;
  const state = blocked ?
    STARTUP_AUTHORITY_STATE.BLOCKED :
    (priorityRecoveryReasonCodes.length > 0 ||
      activeGateRecoveryBlocksReadiness ?
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
      typeof planningSnapshot.recoveryProtocolState === 'string' ?
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
