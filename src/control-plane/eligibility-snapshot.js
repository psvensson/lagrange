import {NUM, TYPEOF} from '../constants/index.js';
import {READINESS_SNAPSHOT_KEY} from './control-plane-readiness-constants.js';

function freezeObject(value) {
  return value && typeof value === TYPEOF.OBJECT ?
    Object.freeze({...value}) :
    null;
}

function normalizeReasons(reasons) {
  if (!Array.isArray(reasons) || reasons.length === NUM.ZERO) {
    return Object.freeze([]);
  }
  return Object.freeze(reasons.map((reason) => {
    return reason && typeof reason === TYPEOF.OBJECT ?
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
    if (code.length === NUM.ZERO || seen.has(code)) {
      continue;
    }
    seen.add(code);
    reasonCodes.push(code);
  }
  return Object.freeze(reasonCodes);
}

function createEligibilitySnapshot(snapshot = {}) {
  return Object.freeze({
    nodeId: snapshot.nodeId || null,
    lifecycleState: snapshot.lifecycleState || null,
    publication: freezeObject(snapshot.publication),
    membershipPublication: freezeObject(snapshot.membershipPublication),
    priorityControlPlaneRecovery:
      freezeObject(snapshot.priorityControlPlaneRecovery),
    capacity: freezeObject(snapshot.capacity),
    nodeEvidence: freezeObject(snapshot.nodeEvidence),
    observedAt: snapshot.observedAt || null,
    dimensions: snapshot.dimensions &&
      typeof snapshot.dimensions === TYPEOF.OBJECT ?
      Object.freeze({...snapshot.dimensions}) :
      Object.freeze({}),
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
  });
}

export {
  compactEligibilitySnapshot,
  createEligibilitySnapshot,
  evaluateEligibilityDecision,
};
