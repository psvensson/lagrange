import {
  CONTROL_PLANE_READINESS_REASON,
} from './control-plane-readiness-constants.js';
import {
  PROJECTION_READINESS_REASON,
} from './projection-readiness-constants.js';

// Evidence-absent readiness denial: the planning snapshot has not converged
// for this node, so readiness has no verdict at all — the denial consists
// exclusively of planning_snapshot_refresh_pending / owner_evidence_missing.
// An empty reason list stays ambiguous and fails closed; any substantive
// code keeps every consumer's guard closed. This is the single canonical
// classification shared by every approved formation carve-out (system-table
// query routing, the critical-partition voter-ready floor, and formation
// placement-target eligibility): one owner for the reason-class decision so
// the carve-outs cannot drift apart.
const EVIDENCE_ABSENT_READINESS_REASON_CODES = Object.freeze(new Set([
  CONTROL_PLANE_READINESS_REASON.PLANNING_SNAPSHOT_REFRESH_PENDING,
  PROJECTION_READINESS_REASON.OWNER_EVIDENCE_MISSING,
]));

function collectReadinessDenialReasonCodes(readiness) {
  const codes = [];
  const append = (value) => {
    const code = typeof value === 'string' ?
      value :
      typeof value?.code === 'string' ? value.code : '';
    if (code.length > 0 && !codes.includes(code)) {
      codes.push(code);
    }
  };
  if (Array.isArray(readiness?.reasonCodes)) {
    readiness.reasonCodes.forEach(append);
  }
  if (Array.isArray(readiness?.reasons)) {
    readiness.reasons.forEach(append);
  }
  return codes;
}

function isEvidenceAbsentReadinessDenialSnapshot(readiness) {
  const reasonCodes = collectReadinessDenialReasonCodes(readiness);
  return reasonCodes.length > 0 && reasonCodes.every((code) =>
    EVIDENCE_ABSENT_READINESS_REASON_CODES.has(code));
}

export {
  isEvidenceAbsentReadinessDenialSnapshot,
};
