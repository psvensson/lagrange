const ZERO = 0;
const ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';

export const ACTIVE_GATE_CLOSURE_RECORD_ID_PRIORITY_SPREAD = 'CL-003';
export const ACTIVE_GATE_CLOSURE_WITNESS_CLASS_PRIORITY_SPREAD =
  'publication_converged_priority_spread_pending';

function normalizePublicationStatus(status) {
  if (typeof status !== 'string') {
    return null;
  }
  const normalizedStatus = status.trim().toUpperCase();
  return normalizedStatus.length > ZERO ? normalizedStatus : null;
}

function normalizeDistinctStringArray(values) {
  const normalizedValues = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const normalizedValue = String(value || '').trim();
    if (normalizedValue.length === ZERO || seen.has(normalizedValue)) {
      continue;
    }
    seen.add(normalizedValue);
    normalizedValues.push(normalizedValue);
  }
  return normalizedValues;
}

export function classifyActiveGateClosureWitness({
  progressSnapshot = null,
  publicationConvergence = null,
  publicationConvergenceGate = null,
} = {}) {
  const gateReasons = normalizeDistinctStringArray(
    progressSnapshot?.gateReasons || publicationConvergenceGate?.reasons,
  );
  const onlyPrioritySpreadPending =
    gateReasons.length === 1 &&
    gateReasons[0] === 'priority_control_plane_spread_pending';
  if (!onlyPrioritySpreadPending) {
    return null;
  }

  const publicationStatus = normalizePublicationStatus(
    progressSnapshot?.publicationStatus ||
      publicationConvergenceGate?.publicationStatus ||
      publicationConvergence?.publicationStatus,
  );
  if (publicationStatus !== ACTIVE_WAIT_PUBLICATION_STATUS_PUBLISHED) {
    return null;
  }

  const snapshotCoverageComplete = progressSnapshot?.snapshotCoverageComplete === true;
  if (!snapshotCoverageComplete) {
    return null;
  }

  const pendingAckCount = Number.isInteger(progressSnapshot?.pendingAckCount) ?
    progressSnapshot.pendingAckCount :
    normalizeDistinctStringArray(
      publicationConvergence?.pendingAckNodeIds ||
        publicationConvergenceGate?.pendingAckNodeIds,
    ).length;
  if (pendingAckCount > ZERO) {
    return null;
  }

  const missingPublishedCount = Number.isInteger(progressSnapshot?.missingPublishedCount) ?
    progressSnapshot.missingPublishedCount :
    normalizeDistinctStringArray(
      publicationConvergenceGate?.missingPublishedNodeIds,
    ).length;
  if (missingPublishedCount > ZERO) {
    return null;
  }

  const prioritySpreadSatisfied = progressSnapshot?.prioritySpreadSatisfied;
  if (prioritySpreadSatisfied === true) {
    return null;
  }

  return {
    closureRecordId: ACTIVE_GATE_CLOSURE_RECORD_ID_PRIORITY_SPREAD,
    closureWitnessClass: ACTIVE_GATE_CLOSURE_WITNESS_CLASS_PRIORITY_SPREAD,
  };
}