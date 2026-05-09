import {NUM, TYPEOF} from '../constants/index.js';
import {
  AUTHORITY_DESCRIPTOR_STATE,
  AUTHORITY_PUBLICATION_OBSERVATION_STATE,
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
} from './control-plane-readiness-constants.js';
import {
  resolvePriorityRecoveryActiveNodeCohort,
} from './priority-recovery-snapshot.js';
import {
  PUBLICATION_RECOVERY_GATE_STATE,
  buildPublicationRecoveryGateSnapshot,
} from './publication-recovery-gate.js';
import {
  PROJECTION_READINESS_ACTIVE_GATE_STATE,
} from './projection-readiness-constants.js';

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
const LOCAL_STR_ADMITTED = 'admitted';
const LOCAL_STR_UNAVAILABLE = 'unavailable';

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
export const STARTUP_AUTHORITY_ADMISSION_STATE = Object.freeze({
  ADMITTED: LOCAL_STR_ADMITTED,
  BLOCKED: LOCAL_STR_BLOCKED,
  UNAVAILABLE: LOCAL_STR_UNAVAILABLE,
});
const STARTUP_AUTHORITY_TRANSITIONAL_RECOVERY_GATE_STATE = new Set([
  PUBLICATION_RECOVERY_GATE_STATE.PUBLICATION_PENDING,
  PUBLICATION_RECOVERY_GATE_STATE.ACK_PENDING,
  PUBLICATION_RECOVERY_GATE_STATE.PRIORITY_SPREAD_PENDING,
]);
const STARTUP_AUTHORITY_PRIORITY_RECOVERY_REASON_CODES = new Set(
  Object.values(CONTROL_PLANE_PRIORITY_RECOVERY_REASON),
);

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

function normalizeStartupProjectionReadinessContract(source = {}) {
  const contract =
    source.projectionReadinessContract &&
      typeof source.projectionReadinessContract === TYPEOF.OBJECT ?
      source.projectionReadinessContract :
      source.projectionReadiness &&
        typeof source.projectionReadiness === TYPEOF.OBJECT ?
        source.projectionReadiness :
        null;
  return contract ? Object.freeze({...contract}) : null;
}

function normalizeStartupProjectionActiveGate(projectionReadinessContract) {
  const activeGate =
    projectionReadinessContract?.activeGate &&
      typeof projectionReadinessContract.activeGate === TYPEOF.OBJECT ?
      projectionReadinessContract.activeGate :
      null;
  return activeGate ? Object.freeze({...activeGate}) : null;
}

function isStartupProjectionActiveGateRecoveryOpen(activeGate) {
  return activeGate?.state ===
      PROJECTION_READINESS_ACTIVE_GATE_STATE.REPAIR_READY ||
    activeGate?.state ===
      PROJECTION_READINESS_ACTIVE_GATE_STATE.INTERNAL_READY;
}

function isStartupProjectionActiveGateBlocked(activeGate) {
  return activeGate?.state === PROJECTION_READINESS_ACTIVE_GATE_STATE.BLOCKED;
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

export function buildStartupAuthorityAdmissionDescriptor(details = {}) {
  const state =
    typeof details.admissionState === TYPEOF.STRING &&
    details.admissionState.length > NUM.ZERO ?
      details.admissionState :
      STARTUP_AUTHORITY_ADMISSION_STATE.UNAVAILABLE;
  const reasonCodes = Object.freeze(
    Array.isArray(details.admissionReasonCodes) ?
      [...new Set(details.admissionReasonCodes)] :
      [],
  );
  const clusterIncarnationFence =
    details.clusterIncarnationFence &&
      typeof details.clusterIncarnationFence === TYPEOF.OBJECT ?
      Object.freeze({
        ...details.clusterIncarnationFence,
        ...(Array.isArray(details.clusterIncarnationFence.reasonCodes) ?
          {
            reasonCodes: Object.freeze([
              ...details.clusterIncarnationFence.reasonCodes,
            ]),
          } :
          {}),
      }) :
      null;
  return Object.freeze({
    state,
    admitted: state === STARTUP_AUTHORITY_ADMISSION_STATE.ADMITTED,
    reasonCodes,
    clusterIncarnationFence,
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
  const admission = buildStartupAuthorityAdmissionDescriptor({
    admissionState: options.admissionState,
    admissionReasonCodes: options.admissionReasonCodes,
    clusterIncarnationFence: options.clusterIncarnationFence,
  });
  const failure = buildStartupAuthorityFailureDescriptor(
    options.failureReason,
  );
  const publicationRecoveryGate =
    options.publicationRecoveryGate &&
      typeof options.publicationRecoveryGate === TYPEOF.OBJECT ?
      options.publicationRecoveryGate :
      null;
  const projectionReadinessContract =
    normalizeStartupProjectionReadinessContract(options);
  const projectionReadinessActiveGate =
    normalizeStartupProjectionActiveGate(projectionReadinessContract);

  return Object.freeze({
    state: options.state,
    ready: options.ready === true,
    authorityAvailable: options.authorityAvailable === true,
    publication,
    priorityPartition,
    recoveryProtocol,
    targetParticipationDetail,
    admission,
    priorityRecoveryReasonCodes: Object.freeze(
      Array.isArray(options.priorityRecoveryReasonCodes) ?
        [...options.priorityRecoveryReasonCodes] :
        [],
    ),
    canonicalStartupNodeIds: normalizeCanonicalStartupNodeIds(
      options.canonicalStartupNodeIds,
    ),
    publicationRecoveryGate,
    ...(projectionReadinessContract ?
      {projectionReadinessContract} :
      {}),
    ...(projectionReadinessActiveGate ?
      {projectionReadinessActiveGate} :
      {}),
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
    ...(admission.state !== STARTUP_AUTHORITY_ADMISSION_STATE.UNAVAILABLE ?
      {
        admissionState: admission.state,
        admissionReasonCodes: admission.reasonCodes,
        ...(admission.clusterIncarnationFence &&
          typeof admission.clusterIncarnationFence === TYPEOF.OBJECT ?
          {
            clusterIncarnationFence: admission.clusterIncarnationFence,
          } :
          {}),
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
    admission: startupAuthority.admission,
    priorityRecoveryReasonCodes: Object.freeze(
      Array.isArray(reasonCodes) ? [...reasonCodes] : [],
    ),
    startupAuthorityState: startupAuthority.state,
    canonicalStartupNodeIds: startupAuthority.canonicalStartupNodeIds,
    failure: startupAuthority.failure,
    publicationObservationState:
      startupAuthority.publication.observationState,
    ...(startupAuthority.publicationRecoveryGate &&
      typeof startupAuthority.publicationRecoveryGate === TYPEOF.OBJECT ?
      {
        publicationRecoveryGate: startupAuthority.publicationRecoveryGate,
      } :
      {}),
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
    ...(startupAuthority.admission.state !==
      STARTUP_AUTHORITY_ADMISSION_STATE.UNAVAILABLE ?
      {
        admissionState: startupAuthority.admission.state,
        admissionReasonCodes: startupAuthority.admission.reasonCodes,
        ...(startupAuthority.admission.clusterIncarnationFence &&
          typeof startupAuthority.admission.clusterIncarnationFence ===
            TYPEOF.OBJECT ?
          {
            clusterIncarnationFence:
              startupAuthority.admission.clusterIncarnationFence,
          } :
          {}),
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
