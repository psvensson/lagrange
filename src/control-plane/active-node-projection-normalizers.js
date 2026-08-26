import {
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
} from './publication-recovery-gate.js';


function normalizeNodeIdList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter((value) => value.length > 0),
  )].sort();
}

function normalizeStringList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter((value) => value.length > 0),
  )];
}

function normalizeNonNegativeInteger(value) {
  return Number.isFinite(value) && value >= 0 ?
    Math.floor(value) :
    0;
}

function normalizePendingAckEvidenceState(value) {
  if (
    value === PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.COUNT_ONLY ||
    value ===
      PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE.REQUIRED_ACK_NODE_LIST
  ) {
    return value;
  }
  return null;
}

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim().length > 0 ?
    value.trim() :
    null;
}

export {
  normalizeNodeIdList,
  normalizeNonNegativeInteger,
  normalizeOptionalString,
  normalizePendingAckEvidenceState,
  normalizeStringList,
};
