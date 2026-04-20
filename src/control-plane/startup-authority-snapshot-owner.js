import { NUM, TYPEOF } from "../constants/index.js";
import {
  AUTHORITY_DESCRIPTOR_STATE,
  AUTHORITY_PUBLICATION_OBSERVATION_STATE,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
} from "./control-plane-readiness-constants.js";
import {
  resolvePriorityRecoveryActiveNodeCohort,
} from "./priority-recovery-snapshot.js";
import {
  PUBLICATION_RECOVERY_GATE_STATE,
  buildPublicationRecoveryGateSnapshot,
} from './publication-recovery-gate.js';

export const PRIORITY_CONTROL_PLANE_RECOVERY_HEALTH_FAILURE = Object.freeze({
  SERVICE_UNAVAILABLE: "control_plane_recovery_service_unavailable",
  PLANNING_PROVIDER_UNAVAILABLE:
    "control_plane_recovery_planning_provider_unavailable",
  PLANNING_READ_FAILED: "control_plane_recovery_planning_read_failed",
  PLANNING_UNAVAILABLE: "control_plane_recovery_planning_unavailable",
  PLANNING_INCOMPLETE: "control_plane_recovery_planning_incomplete",
});

export const STARTUP_AUTHORITY_STATE = Object.freeze({
  READY: "ready",
  RECOVERY_PENDING: "recovery_pending",
  SEED_LOCALLY_READY_UNPUBLISHED: "seed_locally_ready_unpublished",
  AUTHORITY_UNAVAILABLE: "authority_unavailable",
  BLOCKED: "blocked",
});

const STARTUP_AUTHORITY_PUBLICATION_STATE = Object.freeze({
  AUTHORITATIVE: "authoritative",
  ESTABLISHING: "establishing",
});

function normalizeCanonicalStartupNodeIds(values = []) {
  return Object.freeze(
    [...new Set(
      (Array.isArray(values) ? values : [])
        .filter((nodeId) =>
          typeof nodeId === TYPEOF.STRING && nodeId.length > NUM.ZERO,
        ),
    )].sort(),
  );
}

export function buildStartupAuthorityFailureDescriptor(failureReason) {
  return typeof failureReason === TYPEOF.STRING &&
    failureReason.length > NUM.ZERO ?
      Object.freeze({
        state: AUTHORITY_DESCRIPTOR_STATE.PRESENT,
        reason: failureReason,
      }) :
      Object.freeze({
        state: AUTHORITY_DESCRIPTOR_STATE.NONE,
      });
}

export function buildStartupAuthorityPublicationDescriptor(details = {}) {
  const observationState =
    typeof details.publicationObservationState === TYPEOF.STRING &&
    details.publicationObservationState.length > NUM.ZERO ?
      details.publicationObservationState :
      AUTHORITY_PUBLICATION_OBSERVATION_STATE.OBSERVATION_UNAVAILABLE;
  const unpublishedObservation =
    observationState === AUTHORITY_PUBLICATION_OBSERVATION_STATE.UNPUBLISHED;
  const epoch = Number.isFinite(details.publicationEpoch) ?
    Object.freeze({
      state: AUTHORITY_DESCRIPTOR_STATE.KNOWN,
      value: Math.floor(details.publicationEpoch),
    }) :
    Object.freeze({
      state:
        unpublishedObservation ?
          AUTHORITY_PUBLICATION_OBSERVATION_STATE.UNPUBLISHED :
          AUTHORITY_DESCRIPTOR_STATE.UNAVAILABLE,
    });
  const status =
    typeof details.publicationStatus === TYPEOF.STRING &&
    details.publicationStatus.length > NUM.ZERO ?
      Object.freeze({
        state: AUTHORITY_DESCRIPTOR_STATE.KNOWN,
        value: details.publicationStatus,
      }) :
      Object.freeze({
        state:
          unpublishedObservation ?
            AUTHORITY_PUBLICATION_OBSERVATION_STATE.UNPUBLISHED :
            AUTHORITY_DESCRIPTOR_STATE.UNAVAILABLE,
      });
  return Object.freeze({
    observationState,
    epoch,
    status,
  });
}

export function buildStartupAuthorityPriorityPartitionDescriptor(
  priorityPartitionSummary,
) {
  return priorityPartitionSummary &&
    typeof priorityPartitionSummary === TYPEOF.OBJECT ?
      Object.freeze({
        state: AUTHORITY_DESCRIPTOR_STATE.AVAILABLE,
        summary: priorityPartitionSummary,
      }) :
      Object.freeze({
        state: AUTHORITY_DESCRIPTOR_STATE.UNAVAILABLE,
      });
}

export function buildStartupAuthorityRecoveryProtocolDescriptor(
  recoveryProtocolState,
) {
  return typeof recoveryProtocolState === TYPEOF.STRING &&
    recoveryProtocolState.length > NUM.ZERO ?
      Object.freeze({
        state: AUTHORITY_DESCRIPTOR_STATE.KNOWN,
        value: recoveryProtocolState,
      }) :
      Object.freeze({
        state: AUTHORITY_DESCRIPTOR_STATE.UNAVAILABLE,
      });
}

export function buildStartupAuthorityTargetParticipationDescriptor(
  targetParticipation,
) {
  return targetParticipation &&
    typeof targetParticipation === TYPEOF.OBJECT ?
      Object.freeze({
        state: AUTHORITY_DESCRIPTOR_STATE.AVAILABLE,
        participation: targetParticipation,
      }) :
      Object.freeze({
        state: AUTHORITY_DESCRIPTOR_STATE.UNAVAILABLE,
      });
}

export function buildStartupAuthoritySnapshotContract(options = {}) {
  const publication = buildStartupAuthorityPublicationDescriptor({
    publicationEpoch: options.publicationEpoch,
    publicationStatus: options.publicationStatus,
    publicationObservationState: options.publicationObservationState,
  });
  const priorityPartition =
    buildStartupAuthorityPriorityPartitionDescriptor(
      options.priorityPartitionSummary,
    );
  const recoveryProtocol =
    buildStartupAuthorityRecoveryProtocolDescriptor(
      options.recoveryProtocolState,
    );
  const targetParticipationDetail =
    buildStartupAuthorityTargetParticipationDescriptor(
      options.targetParticipation,
    );
  const failure = buildStartupAuthorityFailureDescriptor(
    options.failureReason,
  );
  const publicationRecoveryGate =
    options.publicationRecoveryGate &&
      typeof options.publicationRecoveryGate === TYPEOF.OBJECT ?
      options.publicationRecoveryGate :
      null;

  return Object.freeze({
    state: options.state,
    ready: options.ready === true,
    authorityAvailable: options.authorityAvailable === true,
    publication,
    priorityPartition,
    recoveryProtocol,
    targetParticipationDetail,
    priorityRecoveryReasonCodes: Object.freeze(
      Array.isArray(options.priorityRecoveryReasonCodes) ?
        [...options.priorityRecoveryReasonCodes] :
        [],
    ),
    canonicalStartupNodeIds: normalizeCanonicalStartupNodeIds(
      options.canonicalStartupNodeIds,
    ),
    publicationRecoveryGate,
    failure,
    publicationObservationState: publication.observationState,
    ...(publication.epoch.state === AUTHORITY_DESCRIPTOR_STATE.KNOWN ?
      {
        publicationEpoch: publication.epoch.value,
      } :
      {}),
    ...(publication.status.state === AUTHORITY_DESCRIPTOR_STATE.KNOWN ?
      {
        publicationStatus: publication.status.value,
      } :
      {}),
    ...(priorityPartition.state === AUTHORITY_DESCRIPTOR_STATE.AVAILABLE ?
      {
        priorityPartitionSummary: priorityPartition.summary,
      } :
      {}),
    ...(recoveryProtocol.state === AUTHORITY_DESCRIPTOR_STATE.KNOWN ?
      {
        recoveryProtocolState: recoveryProtocol.value,
      } :
      {}),
    ...(targetParticipationDetail.state === AUTHORITY_DESCRIPTOR_STATE.AVAILABLE ?
      {
        targetParticipation: targetParticipationDetail.participation,
      } :
      {}),
    ...(failure.state === AUTHORITY_DESCRIPTOR_STATE.PRESENT ?
      {
        failureReason: failure.reason,
      } :
      {}),
  });
}

export function buildPriorityRecoveryHealthDetailsFromStartupAuthority(
  startupAuthority,
  reasonCodes = [],
) {
  return Object.freeze({
    publication: startupAuthority.publication,
    priorityPartition: startupAuthority.priorityPartition,
    recoveryProtocol: startupAuthority.recoveryProtocol,
    targetParticipationDetail: startupAuthority.targetParticipationDetail,
    priorityRecoveryReasonCodes: Object.freeze(
      Array.isArray(reasonCodes) ? [...reasonCodes] : [],
    ),
    startupAuthorityState: startupAuthority.state,
    canonicalStartupNodeIds: startupAuthority.canonicalStartupNodeIds,
    failure: startupAuthority.failure,
    publicationObservationState:
      startupAuthority.publication.observationState,
    ...(startupAuthority.publication.epoch.state ===
      AUTHORITY_DESCRIPTOR_STATE.KNOWN ?
      {
        publicationEpoch: startupAuthority.publication.epoch.value,
      } :
      {}),
    ...(startupAuthority.publication.status.state ===
      AUTHORITY_DESCRIPTOR_STATE.KNOWN ?
      {
        publicationStatus: startupAuthority.publication.status.value,
      } :
      {}),
    ...(startupAuthority.priorityPartition.state ===
      AUTHORITY_DESCRIPTOR_STATE.AVAILABLE ?
      {
        priorityPartitionSummary:
          startupAuthority.priorityPartition.summary,
      } :
      {}),
    ...(startupAuthority.recoveryProtocol.state ===
      AUTHORITY_DESCRIPTOR_STATE.KNOWN ?
      {
        recoveryProtocolState: startupAuthority.recoveryProtocol.value,
      } :
      {}),
    ...(startupAuthority.targetParticipationDetail.state ===
      AUTHORITY_DESCRIPTOR_STATE.AVAILABLE ?
      {
        targetParticipation:
          startupAuthority.targetParticipationDetail.participation,
      } :
      {}),
    ...(startupAuthority.failure.state === AUTHORITY_DESCRIPTOR_STATE.PRESENT ?
      {
        failureReason: startupAuthority.failure.reason,
      } :
      {}),
  });
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
      priorityRecoveryReasonCodes,
      canonicalStartupNodeIds,
      publicationRecoveryGate,
    });
  }

  if (
    typeof publicationStatus !== TYPEOF.STRING ||
    publicationStatus.length === NUM.ZERO
  ) {
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
        publicationRecoveryGate,
      },
    );
  }

  if (
    !priorityPartitionSummary ||
    typeof priorityPartitionSummary.satisfied !== TYPEOF.BOOLEAN
  ) {
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
        canonicalStartupNodeIds,
        publicationRecoveryGate,
      },
    );
  }

  const targetParticipation =
    planningSnapshot.targetParticipation &&
    typeof planningSnapshot.targetParticipation === TYPEOF.OBJECT ?
      planningSnapshot.targetParticipation :
      null;
  const targetParticipationReasons = Array.isArray(targetParticipation?.reasons) ?
    [...targetParticipation.reasons] :
    [];
  const priorityRecoveryReasonCodes = [...new Set([
    ...publicationRecoveryGate.reasonCodes,
    ...targetParticipationReasons,
  ])];
  const blocked =
    targetParticipationReasons.length > NUM.ZERO &&
    canonicalStartupNodeIds.length === NUM.ZERO;
  const state = blocked ?
    STARTUP_AUTHORITY_STATE.BLOCKED :
    (priorityRecoveryReasonCodes.length > NUM.ZERO ?
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
    priorityRecoveryReasonCodes,
    canonicalStartupNodeIds,
    publicationRecoveryGate,
  });
}
