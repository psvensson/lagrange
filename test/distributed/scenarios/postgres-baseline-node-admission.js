const ZERO = 0;

const READINESS_REASON_STATE_CONTRADICTION =
  'readiness_state_contradiction';
const LOCAL_READINESS_REASON_PREFIX = 'self_discovery=';
const LOCAL_READINESS_REASON_FALLBACK = 'self_discovery_missing';
const LOCAL_VOTER_BLOCK_PREFIX = 'local_replica_not_voter_ready';
const TOPOLOGY_DEFERRED_SOFT_REASON_PREFIXES = Object.freeze([
  'leadership_unstable',
  'schema_partition_unavailable',
  'replica_operations_in_flight',
]);

const SUT_LOAD_NODE_ADMISSION_STATE = Object.freeze({
  ADMITTED: 'admitted',
  AWAITING_ADMIN: 'awaiting_admin',
  STALE_LOCAL_READINESS: 'stale_local_readiness',
  TOPOLOGY_DEFERRED: 'topology_deferred',
  LOAD_LANE_CONFIRMED: 'load_lane_confirmed',
  LOAD_LANE_DENIED: 'load_lane_denied',
  REJECTED_HARD: 'rejected_hard',
});

function cloneSerializable(value) {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function normalizeReasonList(reasons) {
  const values = Array.isArray(reasons) ? reasons : [];
  return [...new Set(values.map((reason) => String(reason)).sort())];
}

function isSoftTopologyDeferredReason(reason) {
  const normalizedReason = String(reason || '');
  return TOPOLOGY_DEFERRED_SOFT_REASON_PREFIXES.some((prefix) =>
    normalizedReason.startsWith(prefix),
  );
}

function hasSoftTopologyDeferredLocalBlock(localEvaluation) {
  if (!localEvaluation || typeof localEvaluation !== 'object') {
    return false;
  }
  const reasons = normalizeReasonList(localEvaluation.reasons);
  if (reasons.length === ZERO ||
      reasons.includes(READINESS_REASON_STATE_CONTRADICTION)) {
    return false;
  }
  return reasons.every((reason) => isSoftTopologyDeferredReason(reason));
}

function isTopologyDeferredEligible(localEvaluation, allowTopologyDeferredSelection) {
  if (allowTopologyDeferredSelection !== true) {
    return false;
  }
  if (!localEvaluation || localEvaluation.ready === true ||
      localEvaluation.hasAdmission !== true &&
      hasSoftTopologyDeferredLocalBlock(localEvaluation) !== true) {
    return false;
  }
  const reasons = normalizeReasonList(localEvaluation.reasons);
  if (reasons.includes(READINESS_REASON_STATE_CONTRADICTION)) {
    return false;
  }
  const admissionState = localEvaluation.admissionState;
  if (admissionState && typeof admissionState === 'object' &&
      admissionState.routingReady === true &&
      admissionState.schemaReady === true &&
      admissionState.topologyReady !== true) {
    return true;
  }
  return hasSoftTopologyDeferredLocalBlock(localEvaluation);
}

function hasLoadLaneConfirmableLocalReadinessBlock(localEvaluation) {
  if (!localEvaluation || typeof localEvaluation !== 'object') {
    return false;
  }
  const reasons = normalizeReasonList(localEvaluation.reasons);
  if (reasons.length === ZERO) {
    return false;
  }
  return reasons.every((reason) =>
    reason === READINESS_REASON_STATE_CONTRADICTION ||
    reason.startsWith('schema_table_missing') ||
    reason.startsWith('schema_partition_unavailable') ||
    reason.startsWith('leadership_unstable') ||
    reason.startsWith('replica_operations_in_flight'));
}

function shouldPreserveTopologyDeferredAdmission(localReadiness) {
  const normalizedEvidence = normalizeSutLoadNodeAdmissionEvidence({
    localReadiness,
    allowTopologyDeferredSelection: true,
  });
  return normalizedEvidence.local.topologyDeferredEligible === true;
}

function shouldConfirmLocalReadinessViaLoadLane(localReadiness, options = {}) {
  if (!localReadiness || typeof localReadiness !== 'object') {
    return false;
  }
  if (localReadiness.requiresConfirmation !== true) {
    return false;
  }
  if (options.hasTableProbe !== true || options.adminReady !== true) {
    return false;
  }
  if (shouldPreserveTopologyDeferredAdmission(localReadiness)) {
    return false;
  }
  if (options.allowSoftDiscoveryNodeFallback === true) {
    return true;
  }
  if (localReadiness?.evaluation?.ready === true) {
    return true;
  }
  return hasLoadLaneConfirmableLocalReadinessBlock(localReadiness.evaluation);
}

function normalizeLocalAdmissionEvidence(
  localReadiness,
  allowTopologyDeferredSelection,
) {
  const readiness =
    localReadiness && typeof localReadiness === 'object' ?
      localReadiness :
      {};
  const localEvaluation =
    readiness.evaluation && typeof readiness.evaluation === 'object' ?
      readiness.evaluation :
      null;
  const localReasons = normalizeReasonList(localEvaluation?.reasons);
  const hasLocalVoterBlock = localReasons.some((reason) =>
    reason.startsWith(LOCAL_VOTER_BLOCK_PREFIX));
  return {
    requiresConfirmation: readiness.requiresConfirmation === true,
    ready: localEvaluation?.ready === true,
    reasons: localReasons,
    hasAdmission: localEvaluation?.hasAdmission === true,
    hasVoterBlock: hasLocalVoterBlock,
    topologyDeferredEligible:
      !hasLocalVoterBlock &&
      isTopologyDeferredEligible(
        localEvaluation,
        allowTopologyDeferredSelection,
      ),
    loadLaneConfirmable:
      hasLoadLaneConfirmableLocalReadinessBlock(localEvaluation),
  };
}

function normalizeSutLoadNodeAdmissionEvidence(input = {}) {
  const normalizedEvidence = {
    nodeId: String(input.nodeId || ''),
    admin: {
      ready: input.adminReady === true,
      reasons: normalizeReasonList(input.adminReasons),
    },
    local: normalizeLocalAdmissionEvidence(
      input.localReadiness,
      input.allowTopologyDeferredSelection === true,
    ),
    loadLane: {
      attempted: input.loadLaneAttempted === true,
      ready: input.loadLaneReadiness?.ready === true,
      reasons: normalizeReasonList(input.loadLaneReadiness?.reasons),
    },
    policy: {
      deferLocalReplicaReadiness: input.deferLocalReplicaReadiness === true,
    },
  };
  return Object.freeze(normalizedEvidence);
}

function buildAdmissionExplanation(state, exclusionReasons) {
  const reasons = normalizeReasonList(exclusionReasons);
  if (reasons.length === ZERO) {
    return state;
  }
  return state + ':' + reasons.join('|');
}

function buildSutLoadNodeAdmissionDecisionTrace(rawEvidence, decision) {
  const normalizedRawEvidence = rawEvidence && typeof rawEvidence === 'object' ?
    rawEvidence :
    {};
  const normalizedDecision = decision && typeof decision === 'object' ?
    decision :
    adjudicateSutLoadNodeAdmission();
  return Object.freeze({
    rawEvidence: cloneSerializable(normalizedRawEvidence),
    normalizedEvidence: cloneSerializable(normalizedDecision.normalizedEvidence),
    derivedState: String(normalizedDecision.state || ''),
    finalAdmissionReason: String(normalizedDecision.explanation || ''),
    admit: normalizedDecision.admit === true,
    retryable: normalizedDecision.retryable !== false,
    exclusionReasons: cloneSerializable(normalizedDecision.exclusionReasons),
  });
}

function evaluateLocalReplicaAdmissionState(evidence, exclusionReasons) {
  if (
    evidence.policy.deferLocalReplicaReadiness ||
    evidence.local.requiresConfirmation !== true ||
    evidence.local.ready === true
  ) {
    return null;
  }
  if (
    !evidence.local.hasVoterBlock &&
    evidence.loadLane.ready === true &&
    evidence.local.loadLaneConfirmable === true
  ) {
    return SUT_LOAD_NODE_ADMISSION_STATE.LOAD_LANE_CONFIRMED;
  }
  if (
    !evidence.local.hasVoterBlock &&
    evidence.local.topologyDeferredEligible === true
  ) {
    return SUT_LOAD_NODE_ADMISSION_STATE.TOPOLOGY_DEFERRED;
  }
  const localReasons = evidence.local.reasons.length > ZERO ?
    evidence.local.reasons :
    [LOCAL_READINESS_REASON_FALLBACK];
  for (const reason of localReasons) {
    exclusionReasons.push(LOCAL_READINESS_REASON_PREFIX + String(reason));
  }
  return SUT_LOAD_NODE_ADMISSION_STATE.STALE_LOCAL_READINESS;
}

function resolveFinalAdmissionState(
  evidence,
  uniqueExclusionReasons,
  derivedLocalState,
) {
  if (uniqueExclusionReasons.length === ZERO) {
    return derivedLocalState || SUT_LOAD_NODE_ADMISSION_STATE.ADMITTED;
  }
  if (evidence.admin.ready !== true) {
    return SUT_LOAD_NODE_ADMISSION_STATE.AWAITING_ADMIN;
  }
  if (
    evidence.loadLane.attempted === true &&
    evidence.loadLane.ready !== true &&
    evidence.loadLane.reasons.length > ZERO
  ) {
    return SUT_LOAD_NODE_ADMISSION_STATE.LOAD_LANE_DENIED;
  }
  return SUT_LOAD_NODE_ADMISSION_STATE.STALE_LOCAL_READINESS;
}

function adjudicateSutLoadNodeAdmission(normalizedEvidence) {
  const evidence =
    normalizedEvidence && typeof normalizedEvidence === 'object' ?
      normalizedEvidence :
      normalizeSutLoadNodeAdmissionEvidence();
  const exclusionReasons = [];

  if (evidence.admin.ready !== true) {
    exclusionReasons.push(...evidence.admin.reasons);
  }

  const derivedLocalState = evaluateLocalReplicaAdmissionState(
    evidence,
    exclusionReasons,
  );

  if (
    evidence.loadLane.attempted === true &&
    evidence.loadLane.ready !== true &&
    evidence.local.topologyDeferredEligible !== true
  ) {
    exclusionReasons.push(...evidence.loadLane.reasons);
  }

  const uniqueExclusionReasons = normalizeReasonList(exclusionReasons);
  const state = resolveFinalAdmissionState(
    evidence,
    uniqueExclusionReasons,
    derivedLocalState,
  );

  return Object.freeze({
    normalizedEvidence: evidence,
    state,
    admit: uniqueExclusionReasons.length === ZERO,
    retryable: state !== SUT_LOAD_NODE_ADMISSION_STATE.REJECTED_HARD,
    exclusionReasons: uniqueExclusionReasons,
    explanation: buildAdmissionExplanation(state, uniqueExclusionReasons),
  });
}

export {
  SUT_LOAD_NODE_ADMISSION_STATE,
  hasLoadLaneConfirmableLocalReadinessBlock,
  normalizeSutLoadNodeAdmissionEvidence,
  adjudicateSutLoadNodeAdmission,
  buildSutLoadNodeAdmissionDecisionTrace,
  shouldPreserveTopologyDeferredAdmission,
  shouldConfirmLocalReadinessViaLoadLane,
};
