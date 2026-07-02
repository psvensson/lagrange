import {
  AUTHORITY_DESCRIPTOR_STATE,
  CONTROL_PLANE_READINESS_DIMENSION,
  PROJECTION_READINESS_CONTRACT_STATE,
  PROVISIONING_ELIGIBILITY_STATE,
  READINESS_SNAPSHOT_KEY,
  RUNTIME_AUTHORITY_PUBLICATION_STATE,
  RUNTIME_AUTHORITY_REPAIR_STATE,
  RUNTIME_AUTHORITY_STATE,
  RUNTIME_AUTHORITY_VISIBILITY_STATE,
} from './control-plane-readiness-constants.js';


const PROJECTION_READINESS_CONTRACT_RULES = Object.freeze([
  Object.freeze({
    state: PROJECTION_READINESS_CONTRACT_STATE.SERVE_READY,
    matches: (evidence) =>
      evidence.publicationReady === true &&
      evidence.serveEligible === true &&
      evidence.priorityRecoveryActive !== true,
  }),
  Object.freeze({
    state: PROJECTION_READINESS_CONTRACT_STATE.RECOVERY_OPEN,
    matches: (evidence) => evidence.recoveryOpen === true,
  }),
  Object.freeze({
    state: PROJECTION_READINESS_CONTRACT_STATE.BLOCKED,
    matches: () => true,
  }),
]);

function freezeObject(value) {
  return value && typeof value === 'object' ?
    Object.freeze({...value}) :
    null;
}

function normalizeReasons(reasons) {
  if (!Array.isArray(reasons) || reasons.length === 0) {
    return Object.freeze([]);
  }
  return Object.freeze(reasons.map((reason) => {
    return reason && typeof reason === 'object' ?
      Object.freeze({...reason}) :
      reason;
  }));
}

function collectReasonCodes(snapshot) {
  const reasonCodes = [];
  const seen = new Set();
  for (const reason of Array.isArray(snapshot?.reasons) ?
    snapshot.reasons :
    []) {
    const code = String(reason?.code || '');
    if (code.length === 0 || seen.has(code)) {
      continue;
    }
    seen.add(code);
    reasonCodes.push(code);
  }
  return Object.freeze(reasonCodes);
}

function normalizeStringList(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return Object.freeze([]);
  }
  return Object.freeze([...new Set(
    values
      .map((value) => String(value || '').trim())
      .filter((value) => value.length > 0),
  )]);
}

function resolveProjectionReadinessContractDecision(evidence) {
  return PROJECTION_READINESS_CONTRACT_RULES.find((rule) =>
    rule.matches(evidence),
  );
}

function getMembershipPublicationBoundaryOutcome(membershipPublication) {
  return membershipPublication?.publicationBoundaryOutcome &&
    typeof membershipPublication.publicationBoundaryOutcome === 'object' ?
    membershipPublication.publicationBoundaryOutcome :
    null;
}

function buildProjectionReadinessContract(snapshot = {}) {
  const dimensions =
    snapshot.dimensions && typeof snapshot.dimensions === 'object' ?
      snapshot.dimensions :
      Object.freeze({});
  const priorityControlPlaneRecovery =
    snapshot.priorityControlPlaneRecovery &&
    typeof snapshot.priorityControlPlaneRecovery === 'object' ?
      snapshot.priorityControlPlaneRecovery :
      null;
  const publicationBoundaryOutcome =
    snapshot.publicationBoundaryOutcome &&
      typeof snapshot.publicationBoundaryOutcome === 'object' ?
      snapshot.publicationBoundaryOutcome :
      getMembershipPublicationBoundaryOutcome(snapshot.membershipPublication);
  const priorityReasonCodes = normalizeStringList(
    priorityControlPlaneRecovery?.reasonCodes,
  );
  const publicationReasonCodes = normalizeStringList(
    publicationBoundaryOutcome?.reasonCodes,
  );
  const evidence = Object.freeze({
    publicationReady:
      typeof publicationBoundaryOutcome?.ready === 'boolean' ?
        publicationBoundaryOutcome.ready :
        dimensions[
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED
        ] === true,
    serveEligible:
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE] === true,
    processAlive:
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE] === true,
    clusterMemberHealthy:
      dimensions[
        CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY
      ] === true,
    controlPlaneWritable:
      dimensions[
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE
      ] === true,
    repairEligible:
      dimensions[CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE] === true,
    recoveryEligible:
      dimensions[
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE
      ] === true,
    priorityRecoveryActive:
      priorityControlPlaneRecovery?.active === true ||
      publicationBoundaryOutcome?.active === true,
  });
  const recoveryClosed =
    evidence.recoveryEligible === true &&
    evidence.controlPlaneWritable === true &&
    evidence.publicationReady === true &&
    evidence.clusterMemberHealthy === true &&
    evidence.processAlive === true &&
    evidence.priorityRecoveryActive !== true;
  const contractEvidence = Object.freeze({
    ...evidence,
    recoveryOpen: recoveryClosed !== true,
  });
  const decision = resolveProjectionReadinessContractDecision(contractEvidence);
  return Object.freeze({
    state: decision.state,
    ready:
      decision.state === PROJECTION_READINESS_CONTRACT_STATE.SERVE_READY,
    recoveryOpen: contractEvidence.recoveryOpen,
    publication: Object.freeze({
      ready: contractEvidence.publicationReady,
      boundaryOutcome: freezeObject(publicationBoundaryOutcome),
    }),
    readiness: Object.freeze({
      serveEligible: contractEvidence.serveEligible,
      repairEligible: contractEvidence.repairEligible,
      recoveryEligible: contractEvidence.recoveryEligible,
    }),
    priorityRecovery: Object.freeze({
      active: contractEvidence.priorityRecoveryActive,
      reasonCodes: priorityReasonCodes,
    }),
    reasonCodes: Object.freeze([
      ...new Set([...publicationReasonCodes, ...priorityReasonCodes]),
    ]),
  });
}

function freezeRuntimeAuthoritySummary(runtimeAuthority) {
  if (!runtimeAuthority || typeof runtimeAuthority !== 'object') {
    return null;
  }
  const publication = runtimeAuthority.publication &&
    typeof runtimeAuthority.publication === 'object' ?
    Object.freeze({
      state: typeof runtimeAuthority.publication.state === 'string' ?
        runtimeAuthority.publication.state :
        RUNTIME_AUTHORITY_PUBLICATION_STATE.DEGRADED,
      healthy: runtimeAuthority.publication.healthy === true,
      mode: typeof runtimeAuthority.publication.mode === 'string' ?
        runtimeAuthority.publication.mode :
        null,
      reason: typeof runtimeAuthority.publication.reason === 'string' ?
        runtimeAuthority.publication.reason :
        null,
    }) :
    null;
  const visibility = runtimeAuthority.visibility &&
    typeof runtimeAuthority.visibility === 'object' ?
    Object.freeze({
      state: typeof runtimeAuthority.visibility.state === 'string' ?
        runtimeAuthority.visibility.state :
        RUNTIME_AUTHORITY_VISIBILITY_STATE.UNAVAILABLE,
      published: runtimeAuthority.visibility.published === true,
      observedAt: typeof runtimeAuthority.visibility.observedAt ===
        'string' ?
        runtimeAuthority.visibility.observedAt :
        null,
    }) :
    null;
  const repair = runtimeAuthority.repair &&
    typeof runtimeAuthority.repair === 'object' ?
    Object.freeze({
      state: typeof runtimeAuthority.repair.state === 'string' ?
        runtimeAuthority.repair.state :
        RUNTIME_AUTHORITY_REPAIR_STATE.NOT_ATTEMPTED,
      applied: runtimeAuthority.repair.applied === true,
      observedAt: typeof runtimeAuthority.repair.observedAt === 'string' ?
        runtimeAuthority.repair.observedAt :
        null,
    }) :
    null;
  const provisioning = runtimeAuthority.provisioning &&
    typeof runtimeAuthority.provisioning === 'object' ?
    Object.freeze({
      state: typeof runtimeAuthority.provisioning.state === 'string' ?
        runtimeAuthority.provisioning.state :
        PROVISIONING_ELIGIBILITY_STATE.BLOCKED,
      eligible: runtimeAuthority.provisioning.eligible === true,
    }) :
    null;
  const failure = runtimeAuthority.failure &&
    typeof runtimeAuthority.failure === 'object' ?
    Object.freeze({
      state: typeof runtimeAuthority.failure.state === 'string' ?
        runtimeAuthority.failure.state :
        AUTHORITY_DESCRIPTOR_STATE.NONE,
      reason: typeof runtimeAuthority.failure.reason === 'string' ?
        runtimeAuthority.failure.reason :
        null,
    }) :
    null;
  return Object.freeze({
    state: typeof runtimeAuthority.state === 'string' ?
      runtimeAuthority.state :
      RUNTIME_AUTHORITY_STATE.UNAVAILABLE,
    authorityAvailable: runtimeAuthority.authorityAvailable === true,
    ready: runtimeAuthority.ready === true,
    processAlive: runtimeAuthority.processAlive === true,
    clusterMemberHealthy: runtimeAuthority.clusterMemberHealthy === true,
    routingReady: runtimeAuthority.routingReady === true,
    writeEligible: runtimeAuthority.writeEligible === true,
    recoveryEligible: runtimeAuthority.recoveryEligible === true,
    repairEligible: runtimeAuthority.repairEligible === true,
    publication,
    visibility,
    repair,
    provisioning,
    failure,
    reasonCodes: normalizeStringList(runtimeAuthority.reasonCodes),
  });
}

function createEligibilitySnapshot(snapshot = {}) {
  const membershipPublication = freezeObject(snapshot.membershipPublication);
  const priorityControlPlaneRecovery = freezeObject(
    snapshot.priorityControlPlaneRecovery,
  );
  const dimensions = snapshot.dimensions &&
    typeof snapshot.dimensions === 'object' ?
    Object.freeze({...snapshot.dimensions}) :
    Object.freeze({});
  const projectionReadinessContract = buildProjectionReadinessContract({
    publicationBoundaryOutcome: snapshot.publicationBoundaryOutcome,
    membershipPublication,
    priorityControlPlaneRecovery,
    dimensions,
  });
  return Object.freeze({
    nodeId: snapshot.nodeId || null,
    lifecycleState: snapshot.lifecycleState || null,
    publication: freezeObject(snapshot.publication),
    membershipPublication,
    priorityControlPlaneRecovery,
    capacity: freezeObject(snapshot.capacity),
    nodeEvidence: freezeObject(snapshot.nodeEvidence),
    observedAt: snapshot.observedAt || null,
    runtimeAuthority: freezeRuntimeAuthoritySummary(snapshot.runtimeAuthority),
    projectionReadinessContract,
    dimensions,
    reasons: normalizeReasons(snapshot.reasons),
  });
}

function evaluateEligibilityDecision(snapshot, decisionDimension) {
  const normalizedSnapshot = createEligibilitySnapshot(snapshot);
  const dimensions = normalizedSnapshot.dimensions;
  const eligible = dimensions[decisionDimension] === true;

  return Object.freeze({
    nodeId: normalizedSnapshot.nodeId,
    decisionDimension,
    eligible,
    failedDimensions: Object.freeze(eligible ?
      [] :
      Object.keys(dimensions).filter((dimension) => {
        return dimensions[dimension] !== true;
      })),
    reasonCodes: collectReasonCodes(normalizedSnapshot),
  });
}

function compactEligibilitySnapshot(snapshot, decisionDimension = null) {
  if (!snapshot) {
    return null;
  }
  const normalizedSnapshot = createEligibilitySnapshot(snapshot);
  return Object.freeze({
    [READINESS_SNAPSHOT_KEY.NODE_ID]: normalizedSnapshot.nodeId || null,
    [READINESS_SNAPSHOT_KEY.DIMENSIONS]:
      Object.freeze({...normalizedSnapshot.dimensions}),
    [READINESS_SNAPSHOT_KEY.REASON_CODES]:
      collectReasonCodes(normalizedSnapshot),
    [READINESS_SNAPSHOT_KEY.LIFECYCLE_STATE]:
      normalizedSnapshot.lifecycleState || null,
    [READINESS_SNAPSHOT_KEY.OBSERVED_AT]:
      normalizedSnapshot.observedAt || null,
    [READINESS_SNAPSHOT_KEY.DECISION_DIMENSION]:
      decisionDimension || null,
    [READINESS_SNAPSHOT_KEY.RUNTIME_AUTHORITY]:
      normalizedSnapshot.runtimeAuthority || null,
    [READINESS_SNAPSHOT_KEY.PROJECTION_READINESS_CONTRACT]:
      normalizedSnapshot.projectionReadinessContract || null,
  });
}

export {
  buildProjectionReadinessContract,
  compactEligibilitySnapshot,
  createEligibilitySnapshot,
  evaluateEligibilityDecision,
};
