import {
  NUM,
  TYPEOF,
} from '../constants/index.js';
import {
  PUBLICATION_RECOVERY_PENDING_ACK_EVIDENCE_STATE,
} from './publication-recovery-gate.js';

const LOCAL_STR_EMPTY = '';

function normalizeNodeIdList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || LOCAL_STR_EMPTY).trim())
      .filter((value) => value.length > NUM.ZERO),
  )].sort();
}

function normalizeStringList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || LOCAL_STR_EMPTY).trim())
      .filter((value) => value.length > NUM.ZERO),
  )];
}

function normalizeNonNegativeInteger(value) {
  return Number.isFinite(value) && value >= NUM.ZERO ?
    Math.floor(value) :
    NUM.ZERO;
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
  return typeof value === TYPEOF.STRING && value.trim().length > NUM.ZERO ?
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
