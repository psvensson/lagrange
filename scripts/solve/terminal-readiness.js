import {auditQuest} from './audit.js';
import {reviewReadiness} from './review-request.js';

function sameAuditProblem(left, right) {
  return left?.message === right?.message &&
    left?.ts === right?.ts &&
    left?.frontier === right?.frontier;
}

function auditResiduals(root, quest, state) {
  const audit = auditQuest(root, quest);
  if (state.aggregateProblems.length === 0) return audit.problems;
  if (state.aggregateProblems.length !== 1) return audit.problems;
  const expectedApproval = state.aggregateProblems[0];
  return audit.problems.filter((item) =>
    !sameAuditProblem(item, expectedApproval));
}

function normalizeRepair(category, message) {
  return {
    category,
    message: String(message || ''),
  };
}

export function terminalReadiness(root, quest, state) {
  const repairs = [];
  for (const problem of auditResiduals(root, quest, state)) {
    repairs.push(normalizeRepair('audit', problem.message));
  }

  let review = null;
  try {
    review = reviewReadiness(root, quest, state);
    for (const problem of review.preflight.problems || []) {
      repairs.push(normalizeRepair('review-preflight', problem));
    }
  } catch (error) {
    repairs.push(normalizeRepair('review-preflight', error.message));
  }

  return {
    schemaVersion: 1,
    readyForReview: repairs.length === 0,
    sourceFingerprint: review?.manifest?.aggregate?.fingerprint ||
      state.aggregate?.fingerprint || null,
    repairs,
    review: review ? {
      manifest: review.manifest,
      preflight: review.preflight,
      contentIdentity: review.contentIdentity,
    } : null,
  };
}
