import {NUM, TYPEOF} from '../constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from './control-plane-readiness-constants.js';
import {
  PUBLICATION_OWNER_FRESHNESS_FENCE,
  PUBLICATION_OWNER_RECOVERY_OUTCOME,
  PUBLICATION_OWNER_REVISION_STATE,
  PUBLICATION_OWNER_STREAM_OUTCOME,
} from './publication-owner-constants.js';
import {
  buildPublicationOwnerStreamState,
  isPublicationOwnerStreamReady,
} from './publication-owner-state.js';
import {
  PROJECTION_READINESS_INPUT_CLASS,
  PROJECTION_READINESS_REASON,
} from './projection-readiness-constants.js';

const PROJECTION_READINESS_EMPTY = Object.freeze({
  LIST: Object.freeze([]),
  RECORD: Object.freeze({}),
  TEXT: '',
});

function freezeProjectionReadinessRecord(value) {
  return value && typeof value === TYPEOF.OBJECT && !Array.isArray(value) ?
    Object.freeze({...value}) :
    null;
}

function normalizeProjectionReadinessNodeIds(values = []) {
  return Object.freeze([
    ...new Set(
      (Array.isArray(values) ? values : PROJECTION_READINESS_EMPTY.LIST)
        .map((value) => String(value || PROJECTION_READINESS_EMPTY.TEXT).trim())
        .filter((value) => value.length > NUM.ZERO),
    ),
  ].sort());
}

function normalizeProjectionReadinessReasonCodes(values = []) {
  return normalizeProjectionReadinessNodeIds(values);
}

function normalizeProjectionReadinessNonNegativeInteger(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= NUM.ZERO ?
    Math.floor(numericValue) :
    NUM.ZERO;
}

function normalizeProjectionReadinessRevision(value) {
  const numericValue = Number(value);
  const available = Number.isFinite(numericValue) && numericValue >= NUM.ONE;
  return Object.freeze({
    available,
    value: available ? Math.floor(numericValue) : NUM.ZERO,
  });
}

function normalizeProjectionReadinessDimensions(dimensions = null) {
  return dimensions && typeof dimensions === TYPEOF.OBJECT ?
    Object.freeze({...dimensions}) :
    PROJECTION_READINESS_EMPTY.RECORD;
}

function normalizeProjectionReadinessRuntimeAuthority(runtimeAuthority = null) {
  return runtimeAuthority && typeof runtimeAuthority === TYPEOF.OBJECT ?
    Object.freeze({...runtimeAuthority}) :
    null;
}

function readProjectionReadinessDimension(dimensions, dimension) {
  return typeof dimensions?.[dimension] === TYPEOF.BOOLEAN ?
    dimensions[dimension] :
    null;
}

function readProjectionReadinessBoolean(values = []) {
  const resolved = values.find((value) => typeof value === TYPEOF.BOOLEAN);
  return typeof resolved === TYPEOF.BOOLEAN ? resolved : false;
}

function readProjectionReadinessOptionalBoolean(values = []) {
  const resolved = values.find((value) => typeof value === TYPEOF.BOOLEAN);
  return typeof resolved === TYPEOF.BOOLEAN ? resolved : null;
}

function resolveProjectionReadinessPublicationBoundaryOutcome(source = {}) {
  const explicitOutcome =
    source.publicationBoundaryOutcome &&
      typeof source.publicationBoundaryOutcome === TYPEOF.OBJECT ?
      source.publicationBoundaryOutcome :
      null;
  if (explicitOutcome) {
    return Object.freeze({...explicitOutcome});
  }
  const membershipOutcome =
    source.membershipPublication?.publicationBoundaryOutcome &&
      typeof source.membershipPublication.publicationBoundaryOutcome ===
        TYPEOF.OBJECT ?
      source.membershipPublication.publicationBoundaryOutcome :
      null;
  if (membershipOutcome) {
    return Object.freeze({...membershipOutcome});
  }
  const contractOutcome =
    source.projectionReadinessContract?.publication?.boundaryOutcome &&
      typeof source.projectionReadinessContract.publication.boundaryOutcome ===
        TYPEOF.OBJECT ?
      source.projectionReadinessContract.publication.boundaryOutcome :
      null;
  return contractOutcome ? Object.freeze({...contractOutcome}) : null;
}

function resolveProjectionReadinessPublicationSource(source = {}) {
  const candidates = [
    source.publicationOwnerStreamSource,
    source.membershipPublication,
    source.publicationRecoveryGate,
  ];
  return candidates.find((candidate) =>
    candidate && typeof candidate === TYPEOF.OBJECT,
  ) || null;
}

function resolveProjectionReadinessPublicationOwnerStreamCandidate(source = {}) {
  const candidates = [
    source.publicationOwnerStream,
    source.publicationStream,
    source.membershipPublication?.publicationOwnerStream,
    source.projectionReadinessContract?.publication?.ownerStream,
  ];
  return candidates.find((candidate) =>
    candidate && typeof candidate === TYPEOF.OBJECT,
  ) || null;
}

function buildProjectionPublicationOwnerStreamFromSource(source = null) {
  if (!source || typeof source !== TYPEOF.OBJECT) {
    return null;
  }
  const publicationRecoveryGate =
    source.publicationRecoveryGate &&
      typeof source.publicationRecoveryGate === TYPEOF.OBJECT ?
      source.publicationRecoveryGate :
      source;
  const publicationEpoch =
    source.publicationRevision ??
    source.publicationEpoch ??
    publicationRecoveryGate.publicationEpoch;
  const publicationStatus =
    source.publicationStatus ??
    source.status ??
    publicationRecoveryGate.publicationStatus;
  return buildPublicationOwnerStreamState({
    publicationRevision: publicationEpoch,
    desiredPublicationRevision:
      source.desiredPublicationRevision ?? publicationEpoch,
    committedPublicationRevision:
      source.committedPublicationRevision ??
      source.publishedPublicationRevision ??
      source.publishedPlanningEpoch,
    publicationStatus,
    publicationObservationState:
      source.publicationObservationState ??
      publicationRecoveryGate.publicationObservationState,
    recoveryProtocolState:
      source.recoveryProtocolState ??
      publicationRecoveryGate.recoveryProtocolState,
    requiredAckNodeIds:
      source.requiredAckNodeIds ??
      publicationRecoveryGate.requiredAckNodeIds,
    acknowledgedNodeIds:
      source.acknowledgedNodeIds ??
      publicationRecoveryGate.acknowledgedNodeIds,
    pendingAckNodeIds:
      source.pendingAckNodeIds ??
      publicationRecoveryGate.pendingAckNodeIds,
    pendingAckCount:
      source.pendingAckCount ??
      publicationRecoveryGate.pendingAckCount ??
      NUM.ZERO,
    pendingAckEvidenceState:
      source.pendingAckEvidenceState ??
      publicationRecoveryGate.pendingAckEvidenceState,
    missingPublishedNodeIds:
      source.missingPublishedNodeIds ??
      source.missingPublishedRecoveryActiveNodeIds ??
      publicationRecoveryGate.missingPublishedNodeIds,
    missingPublishedCount:
      source.missingPublishedCount ??
      publicationRecoveryGate.missingPublishedCount,
    prioritySpreadPending:
      source.prioritySpreadPending === true ||
      publicationRecoveryGate.prioritySpreadPending === true,
    prioritySpreadEvidenceUnavailable:
      source.prioritySpreadEvidenceUnavailable === true ||
      publicationRecoveryGate.prioritySpreadEvidenceUnavailable === true,
  });
}

function resolveProjectionReadinessPublicationOwnerStream(source = {}) {
  const candidate =
    resolveProjectionReadinessPublicationOwnerStreamCandidate(source);
  if (candidate) {
    return Object.freeze({...candidate});
  }
  return buildProjectionPublicationOwnerStreamFromSource(
    resolveProjectionReadinessPublicationSource(source),
  );
}

function resolveProjectionReadinessPublicationReady({
  publicationOwnerStream,
  publicationBoundaryOutcome,
  dimensions,
}) {
  if (publicationOwnerStream) {
    return isPublicationOwnerStreamReady(publicationOwnerStream);
  }
  if (typeof publicationBoundaryOutcome?.ready === TYPEOF.BOOLEAN) {
    return publicationBoundaryOutcome.ready;
  }
  return dimensions[
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED
  ] === true;
}

function resolveProjectionReadinessPublicationReasonCodes({
  publicationOwnerStream,
  publicationBoundaryOutcome,
}) {
  return normalizeProjectionReadinessReasonCodes([
    ...(Array.isArray(publicationOwnerStream?.reasonCodes) ?
      publicationOwnerStream.reasonCodes :
      PROJECTION_READINESS_EMPTY.LIST),
    ...(Array.isArray(publicationBoundaryOutcome?.reasonCodes) ?
      publicationBoundaryOutcome.reasonCodes :
      PROJECTION_READINESS_EMPTY.LIST),
  ]);
}

function resolveProjectionReadinessPriorityRecovery(source = {}) {
  const priorityRecovery =
    source.priorityControlPlaneRecovery &&
      typeof source.priorityControlPlaneRecovery === TYPEOF.OBJECT ?
      source.priorityControlPlaneRecovery :
      source.projectionReadinessContract?.priorityRecovery &&
        typeof source.projectionReadinessContract.priorityRecovery ===
          TYPEOF.OBJECT ?
        source.projectionReadinessContract.priorityRecovery :
        null;
  return priorityRecovery ? Object.freeze({...priorityRecovery}) : null;
}

function hasProjectionReadinessStringEvidence(value) {
  return typeof value === TYPEOF.STRING && value.length > NUM.ZERO;
}

function hasProjectionReadinessListEvidence(value) {
  return Array.isArray(value) && value.length > NUM.ZERO;
}

function hasProjectionReadinessCountEvidence(value) {
  return normalizeProjectionReadinessNonNegativeInteger(value) > NUM.ZERO;
}

function hasProjectionReadinessFiniteNumberEvidence(value) {
  return value !== null &&
    typeof value !== TYPEOF.UNDEFINED &&
    Number.isFinite(Number(value));
}

function hasProjectionReadinessPriorityRecoveryGateEvidence(
  publicationRecoveryGate = null,
) {
  if (!publicationRecoveryGate || typeof publicationRecoveryGate !== TYPEOF.OBJECT) {
    return false;
  }
  return Boolean(
    hasProjectionReadinessFiniteNumberEvidence(
      publicationRecoveryGate.publicationEpoch,
    ) ||
    hasProjectionReadinessStringEvidence(
      publicationRecoveryGate.publicationStatus,
    ) ||
    hasProjectionReadinessStringEvidence(
      publicationRecoveryGate.publicationObservationState,
    ) ||
    hasProjectionReadinessStringEvidence(
      publicationRecoveryGate.recoveryProtocolState,
    ) ||
    hasProjectionReadinessListEvidence(
      publicationRecoveryGate.reasonCodes,
    ) ||
    hasProjectionReadinessListEvidence(
      publicationRecoveryGate.requiredAckNodeIds,
    ) ||
    hasProjectionReadinessListEvidence(
      publicationRecoveryGate.acknowledgedNodeIds,
    ) ||
    hasProjectionReadinessListEvidence(
      publicationRecoveryGate.pendingAckNodeIds,
    ) ||
    hasProjectionReadinessCountEvidence(
      publicationRecoveryGate.pendingAckCount,
    ) ||
    hasProjectionReadinessListEvidence(
      publicationRecoveryGate.missingPublishedNodeIds,
    ) ||
    hasProjectionReadinessCountEvidence(
      publicationRecoveryGate.missingPublishedCount,
    ),
  );
}

function hasProjectionReadinessPriorityRecoveryEvidence(
  priorityRecovery = null,
) {
  if (!priorityRecovery || typeof priorityRecovery !== TYPEOF.OBJECT) {
    return false;
  }
  return Boolean(
    hasProjectionReadinessListEvidence(priorityRecovery.reasonCodes) ||
    hasProjectionReadinessFiniteNumberEvidence(
      priorityRecovery.publicationEpoch,
    ) ||
    hasProjectionReadinessStringEvidence(priorityRecovery.publicationStatus) ||
    priorityRecovery.runtimeBlocked === true ||
    priorityRecovery.publicationGateReady === true ||
    hasProjectionReadinessPriorityRecoveryGateEvidence(
      priorityRecovery.publicationRecoveryGate,
    ),
  );
}

function resolveProjectionReadinessRevisionEvidence(
  source,
  publicationOwnerStream,
) {
  const localProjectionRevision = normalizeProjectionReadinessRevision(
    source.localProjectionRevision ??
      source.projectionRevision ??
      source.nodeEvidence?.projectionRevision,
  );
  const requiredPublicationRevision = normalizeProjectionReadinessRevision(
    source.requiredProjectionRevision ??
      source.requiredPublicationRevision ??
      publicationOwnerStream?.revision?.desired?.value ??
      publicationOwnerStream?.revision?.observed?.value,
  );
  return Object.freeze({
    localProjectionRevision,
    requiredPublicationRevision,
    stale:
      localProjectionRevision.available === true &&
      requiredPublicationRevision.available === true &&
      localProjectionRevision.value < requiredPublicationRevision.value,
  });
}

function buildProjectionReadinessEvidence(source = {}) {
  const dimensions = normalizeProjectionReadinessDimensions(source.dimensions);
  const runtimeAuthority =
    normalizeProjectionReadinessRuntimeAuthority(source.runtimeAuthority);
  const publicationBoundaryOutcome =
    resolveProjectionReadinessPublicationBoundaryOutcome(source);
  const publicationOwnerStream =
    resolveProjectionReadinessPublicationOwnerStream(source);
  const publicationReady = resolveProjectionReadinessPublicationReady({
    publicationOwnerStream,
    publicationBoundaryOutcome,
    dimensions,
  });
  const priorityRecovery =
    resolveProjectionReadinessPriorityRecovery(source);
  const publicationReasonCodes =
    resolveProjectionReadinessPublicationReasonCodes({
      publicationOwnerStream,
      publicationBoundaryOutcome,
    });
  const projectionRevision = resolveProjectionReadinessRevisionEvidence(
    source,
    publicationOwnerStream,
  );
  const hasDimensionEvidence = Object.keys(dimensions).length > NUM.ZERO;
  const ownerEvidenceAvailable = Boolean(
    hasDimensionEvidence ||
    runtimeAuthority ||
    source.projectionReadinessContract,
  );
  const processAliveEvidence = readProjectionReadinessOptionalBoolean([
    readProjectionReadinessDimension(
      dimensions,
      CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE,
    ),
    runtimeAuthority?.processAlive,
  ]);
  const clusterMemberHealthy = readProjectionReadinessBoolean([
    readProjectionReadinessDimension(
      dimensions,
      CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY,
    ),
    runtimeAuthority?.clusterMemberHealthy,
  ]);
  const repairEligible = readProjectionReadinessBoolean([
    source.repairEligible,
    readProjectionReadinessDimension(
      dimensions,
      CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE,
    ),
    runtimeAuthority?.repairEligible,
  ]);
  const recoveryEligible = readProjectionReadinessBoolean([
    readProjectionReadinessDimension(
      dimensions,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    ),
    runtimeAuthority?.recoveryEligible,
  ]);
  const runtimeServeEligible = readProjectionReadinessBoolean([
    source.runtimeServeEligible,
    readProjectionReadinessDimension(
      dimensions,
      CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE,
    ),
    source.projectionReadinessContract?.readiness?.serveEligible,
  ]);

  return Object.freeze({
    ownerEvidenceAvailable,
    inputClasses: Object.freeze({
      [PROJECTION_READINESS_INPUT_CLASS.PUBLICATION_STREAM]:
        publicationOwnerStream ? true : false,
      [PROJECTION_READINESS_INPUT_CLASS.OPERATION_OUTCOME]:
        priorityRecovery ? true : false,
      [PROJECTION_READINESS_INPUT_CLASS.PLACEMENT_INTENT]:
        typeof dimensions[
          CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE
        ] === TYPEOF.BOOLEAN,
      [PROJECTION_READINESS_INPUT_CLASS.LOCAL_LIVENESS]:
        typeof dimensions[
          CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY
        ] === TYPEOF.BOOLEAN ||
        typeof runtimeAuthority?.clusterMemberHealthy === TYPEOF.BOOLEAN,
      [PROJECTION_READINESS_INPUT_CLASS.DELETION]:
        source.deleted === true || source.deletionOutcome === true,
    }),
    dimensions,
    runtimeAuthority,
    processAlive:
      processAliveEvidence !== false && ownerEvidenceAvailable === true,
    clusterMemberHealthy,
    repairEligible,
    recoveryEligible,
    provisioningEligible:
      runtimeAuthority?.provisioning?.eligible === true ||
      dimensions[
        CONTROL_PLANE_READINESS_DIMENSION.PROVISIONING_ELIGIBLE
      ] === true,
    controlPlaneWritable:
      runtimeAuthority?.writeEligible === true ||
      dimensions[
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE
      ] === true,
    runtimeServeEligible,
    publicationReady,
    publicationOwnerStream,
    publicationBoundaryOutcome,
    publicationReasonCodes,
    publicationFailed:
      publicationOwnerStream?.streamOutcome ===
        PUBLICATION_OWNER_STREAM_OUTCOME.FAILED ||
      publicationOwnerStream?.freshnessFence ===
        PUBLICATION_OWNER_FRESHNESS_FENCE.FAILED ||
      publicationOwnerStream?.recoveryOutcome ===
        PUBLICATION_OWNER_RECOVERY_OUTCOME.FAILED,
    publicationStreamOutcome:
      publicationOwnerStream?.streamOutcome || null,
    publicationRecoveryOutcome:
      publicationOwnerStream?.recoveryOutcome || null,
    publicationFreshnessFence:
      publicationOwnerStream?.freshnessFence || null,
    publicationRevisionState:
      publicationOwnerStream?.revision?.state ||
      PUBLICATION_OWNER_REVISION_STATE.UNAVAILABLE,
    priorityRecoveryActive:
      priorityRecovery?.active === true &&
      hasProjectionReadinessPriorityRecoveryEvidence(priorityRecovery),
    priorityRecoveryReasonCodes: normalizeProjectionReadinessReasonCodes(
      priorityRecovery?.reasonCodes,
    ),
    priorityRecovery,
    projectionRevision,
    reasonSeed: Object.freeze([
      ...(ownerEvidenceAvailable ?
        PROJECTION_READINESS_EMPTY.LIST :
        [PROJECTION_READINESS_REASON.OWNER_EVIDENCE_MISSING]),
    ]),
    pendingAckCount: normalizeProjectionReadinessNonNegativeInteger(
      publicationOwnerStream?.pendingAckCount,
    ),
    missingPublishedCount: normalizeProjectionReadinessNonNegativeInteger(
      publicationOwnerStream?.missingPublishedCount,
    ),
    raw: freezeProjectionReadinessRecord(source),
  });
}

export {
  buildProjectionReadinessEvidence,
  freezeProjectionReadinessRecord,
  normalizeProjectionReadinessReasonCodes,
};
