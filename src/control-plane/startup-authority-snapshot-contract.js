import {NUM, TYPEOF} from '../constants/index.js';
import {
  AUTHORITY_DESCRIPTOR_STATE,
  AUTHORITY_PUBLICATION_OBSERVATION_STATE,
} from './control-plane-readiness-constants.js';
import {
  PROJECTION_READINESS_ACTIVE_GATE_STATE,
} from './projection-readiness-constants.js';

const LOCAL_STR_ADMITTED = 'admitted';
const LOCAL_STR_BLOCKED = 'blocked';
const LOCAL_STR_UNAVAILABLE = 'unavailable';

export const STARTUP_AUTHORITY_ADMISSION_STATE = Object.freeze({
  ADMITTED: LOCAL_STR_ADMITTED,
  BLOCKED: LOCAL_STR_BLOCKED,
  UNAVAILABLE: LOCAL_STR_UNAVAILABLE,
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

export function normalizeStartupProjectionReadinessContract(source = {}) {
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

export function normalizeStartupProjectionActiveGate(projectionReadinessContract) {
  const activeGate =
    projectionReadinessContract?.activeGate &&
      typeof projectionReadinessContract.activeGate === TYPEOF.OBJECT ?
      projectionReadinessContract.activeGate :
      null;
  return activeGate ? Object.freeze({...activeGate}) : null;
}

export function isStartupProjectionActiveGateRecoveryOpen(activeGate) {
  return activeGate?.state ===
      PROJECTION_READINESS_ACTIVE_GATE_STATE.REPAIR_READY ||
    activeGate?.state ===
      PROJECTION_READINESS_ACTIVE_GATE_STATE.INTERNAL_READY;
}

export function isStartupProjectionActiveGateBlocked(activeGate) {
  return activeGate?.state === PROJECTION_READINESS_ACTIVE_GATE_STATE.BLOCKED;
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
