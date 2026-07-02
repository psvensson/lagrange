
function normalizeOptionalString(value) {
  return typeof value === 'string' && value.length > 0 ?
    value :
    null;
}

function normalizeNonNegativeInteger(value) {
  return Number.isFinite(value) && value >= 0 ?
    Math.floor(value) :
    0;
}

function freezeShallowObject(value) {
  return value && typeof value === 'object' ?
    Object.freeze({...value}) :
    null;
}

function buildNodeStatePublicationStory(
  diagnostics = null,
  publicationMode = null,
) {
  const normalizedDiagnostics =
    diagnostics && typeof diagnostics === 'object' ?
      diagnostics :
      null;
  const normalizedPublicationMode = normalizeOptionalString(
    publicationMode ?? normalizedDiagnostics?.publicationMode,
  );
  const nodeStatePublication = Object.freeze({
    lastAttemptAt:
      normalizeOptionalString(normalizedDiagnostics?.lastAttemptAt),
    lastSuccessAt:
      normalizeOptionalString(normalizedDiagnostics?.lastSuccessAt),
    lastFailureAt:
      normalizeOptionalString(normalizedDiagnostics?.lastFailureAt),
    lastFailureStage:
      normalizeOptionalString(normalizedDiagnostics?.lastFailureStage),
    lastFailureReason:
      normalizeOptionalString(normalizedDiagnostics?.lastFailureReason),
    publicationPath:
      normalizeOptionalString(normalizedDiagnostics?.publicationPath),
    targetAddress:
      normalizeOptionalString(normalizedDiagnostics?.targetAddress),
    targetNodeId:
      normalizeOptionalString(normalizedDiagnostics?.targetNodeId),
    targetServiceType:
      normalizeOptionalString(normalizedDiagnostics?.targetServiceType),
    targetServiceId:
      normalizeOptionalString(normalizedDiagnostics?.targetServiceId),
    consecutiveFailures:
      normalizeNonNegativeInteger(normalizedDiagnostics?.consecutiveFailures),
    publicationMode: normalizedPublicationMode,
  });
  const hasDiagnostics =
    nodeStatePublication.lastAttemptAt !== null ||
    nodeStatePublication.lastSuccessAt !== null ||
    nodeStatePublication.lastFailureAt !== null ||
    nodeStatePublication.lastFailureStage !== null ||
    nodeStatePublication.lastFailureReason !== null ||
    nodeStatePublication.publicationPath !== null ||
    nodeStatePublication.targetAddress !== null ||
    nodeStatePublication.targetNodeId !== null ||
    nodeStatePublication.targetServiceType !== null ||
    nodeStatePublication.targetServiceId !== null ||
    nodeStatePublication.consecutiveFailures > 0 ||
    nodeStatePublication.publicationMode !== null;
  return hasDiagnostics ? nodeStatePublication : null;
}

function buildControlPlanePublicationStory(options = {}) {
  const membershipPublication =
    options.membershipPublication &&
      typeof options.membershipPublication === 'object' ?
      options.membershipPublication :
      null;
  const publishedControlPlaneEpoch = Number.isFinite(
    membershipPublication?.publicationEpoch,
  ) ?
    Math.floor(membershipPublication.publicationEpoch) :
    null;
  const publishedControlPlaneStatus =
    normalizeOptionalString(
      membershipPublication?.status ??
        membershipPublication?.publicationStatus,
    );
  const publishedControlPlaneObservationState =
    normalizeOptionalString(
      membershipPublication?.publicationObservationState,
    );

  return Object.freeze({
    observedAt: normalizeOptionalString(options.observedAt),
    nodeId: normalizeOptionalString(options.nodeId),
    metadataPublication:
      freezeShallowObject(options.metadataPublication),
    nodeStatePublication: buildNodeStatePublicationStory(
      options.nodeStatePublication,
      options.nodeStatePublicationMode,
    ),
    membershipPublication,
    ...(
      membershipPublication?.publicationBoundaryOutcome &&
        typeof membershipPublication.publicationBoundaryOutcome ===
          'object' ?
        {
          publicationBoundaryOutcome:
            membershipPublication.publicationBoundaryOutcome,
        } :
        {}
    ),
    publicationRecoveryGate:
      membershipPublication?.publicationRecoveryGate &&
        typeof membershipPublication.publicationRecoveryGate === 'object' ?
        membershipPublication.publicationRecoveryGate :
        null,
    publishedControlPlaneEpoch,
    publishedControlPlaneStatus,
    publishedControlPlaneObservationState,
    priorityRecoveryReasonCodes: Object.freeze(
      Array.isArray(membershipPublication?.priorityRecoveryReasonCodes) ?
        [...membershipPublication.priorityRecoveryReasonCodes] :
        [],
    ),
  });
}

export {
  buildControlPlanePublicationStory,
};
