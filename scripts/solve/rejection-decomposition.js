// Bounded discharge of a standing candidate rejection.
//
// The superset-replacement rule made a rejected candidate dischargeable only
// by one ever-growing replacement in the same quest: splitting scope moved
// paths out of the candidate, so the standing rejection became impossible to
// discharge and the scope-pressure gate had to be overridden instead
// (measured: three guard-overrides on one frontier, 2026-07-27). This verb
// records fresh, independently approved coverage over a SUBSET of the
// rejected paths — from this quest's current approved candidate or from a
// successor quest's approved candidate receipt — as an append-only
// `rejection-decomposition` event. The rejection stays reported until the
// recorded coverage plus the current candidate reaches every rejected path;
// nothing is waived, the review obligation is only made divisible.
//
// Fail-closed rules: the contribution must be an exact candidate APPROVAL
// receipt whose fingerprint still matches current bytes at its recorded base,
// the base must satisfy the same-base rule (reachable-base form when the
// rejected base is dead), the fingerprint must differ from the rejected
// bytes, and the covered intersection must be non-empty and new.

import {EVENT_REJECTION_DECOMPOSITION} from './constants.js';
import {appendEvent, loadQuest, readLog} from './store.js';
import {
  baseCommitReachable,
  baseRecordedButUnreachable,
  canonicalSourceDelta,
  rejectionDecompositionCoverage,
  verificationState,
} from './verification.js';

const COMMAND = 'decompose-rejection';
const SAME_QUEST_SOURCE = 'candidate';
const PATH_SEPARATOR = ', ';
const APPROVAL_MISSING_GUIDANCE =
  'has no exact approval for its current candidate; obtain one, or ' +
  'contribute a successor candidate with --from-quest <id>';
const SOURCE_QUEST_TAINTED =
  'has its own standing candidate rejection and cannot contribute coverage';
const CHANGED_FINGERPRINT_REQUIRED =
  'discharge requires a changed fingerprint';
const SAME_BASE_RULE_UNSATISFIED =
  'does not satisfy the rejection\'s same-base rule';
const STALE_CONTRIBUTION_GUIDANCE =
  'current bytes over its recorded paths; obtain a fresh approval';

// Both contribution sources go through the same full verification projection:
// the approval must match the source quest's CURRENT candidate exactly (which
// enforces the verifier-evidence pattern, receipt shape, and byte identity),
// and a source quest carrying its own standing rejection contributes nothing —
// a stale approval on since-rejected bytes must never launder a discharge.
function approvedCandidateContribution(root, questId, state, source) {
  if (!state.candidateApproval) {
    throw new Error(
      `${COMMAND}: quest ${questId} ` + APPROVAL_MISSING_GUIDANCE);
  }
  if (state.unresolvedCandidateRejection && source !== SAME_QUEST_SOURCE) {
    throw new Error(`${COMMAND}: quest ${questId} ` + SOURCE_QUEST_TAINTED);
  }
  return {
    paths: [...state.candidate.paths],
    fingerprint: state.candidate.fingerprint,
    baseCommit: state.candidate.baseCommit,
    source,
  };
}

function contributionFor(root, state, args, questId) {
  const sourceQuestId = typeof args['from-quest'] === 'string' ?
    args['from-quest'] : null;
  if (sourceQuestId) {
    const sourceQuest = loadQuest(root, sourceQuestId);
    const sourceState = verificationState(
      root, sourceQuest, readLog(root, sourceQuestId));
    return approvedCandidateContribution(
      root, sourceQuestId, sourceState, `quest:${sourceQuestId}`);
  }
  return approvedCandidateContribution(root, questId, state, SAME_QUEST_SOURCE);
}

export function recordRejectionDecomposition(root, args) {
  const questId = args.id || args._?.[0];
  if (!questId) throw new Error(`${COMMAND}: --id <questId> is required`);
  const quest = loadQuest(root, questId);
  const log = readLog(root, questId);
  const state = verificationState(root, quest, log);
  const rejection = state.unresolvedCandidateRejection;
  if (!rejection) {
    throw new Error(`${COMMAND}: no standing unresolved candidate rejection`);
  }
  const covered = rejectionDecompositionCoverage(root, log, rejection);
  const remaining = rejection.receipt.paths.filter(
    (filePath) => !covered.has(filePath));
  const contribution = contributionFor(root, state, args, questId);
  if (contribution.fingerprint === rejection.receipt.fingerprint) {
    throw new Error(`${COMMAND}: contribution is the rejected bytes; a ` +
      CHANGED_FINGERPRINT_REQUIRED);
  }
  const rejectedBaseDead = baseRecordedButUnreachable(
    root, rejection.receipt.baseCommit);
  const baseAcceptable = rejectedBaseDead ?
    baseCommitReachable(root, contribution.baseCommit) :
    contribution.baseCommit === rejection.receipt.baseCommit;
  if (!baseAcceptable) {
    throw new Error(`${COMMAND}: contribution base ${contribution.baseCommit} ` +
      SAME_BASE_RULE_UNSATISFIED);
  }
  const live = canonicalSourceDelta(
    root, contribution.baseCommit, contribution.paths);
  if (!live.ok || live.fingerprint !== contribution.fingerprint) {
    throw new Error(`${COMMAND}: contribution receipt no longer matches ` +
      STALE_CONTRIBUTION_GUIDANCE);
  }
  const contributionPaths = new Set(contribution.paths);
  const coveredNow = remaining.filter(
    (filePath) => contributionPaths.has(filePath));
  if (coveredNow.length === 0) {
    throw new Error(`${COMMAND}: contribution covers none of the remaining ` +
      `rejected paths: ${remaining.join(PATH_SEPARATOR)}`);
  }
  const remainingAfter = remaining.filter(
    (filePath) => !contributionPaths.has(filePath));
  const stamped = appendEvent(root, questId, {
    type: EVENT_REJECTION_DECOMPOSITION,
    frontier: rejection.event.frontier || null,
    rejectedFingerprint: rejection.receipt.fingerprint,
    coveredPaths: [...coveredNow].sort(),
    remainingPaths: [...remainingAfter].sort(),
    // The full contribution receipt identity: projection-time re-validation
    // recomputes the delta over these paths and drops the coverage the moment
    // the fingerprint stops reproducing from current bytes.
    contributionPaths: [...contribution.paths].sort(),
    approvalFingerprint: contribution.fingerprint,
    approvalBaseCommit: contribution.baseCommit,
    source: contribution.source,
  });
  return {
    questId,
    rejectedFingerprint: rejection.receipt.fingerprint,
    source: contribution.source,
    coveredPaths: [...coveredNow].sort(),
    remainingPaths: [...remainingAfter].sort(),
    discharged: remainingAfter.length === 0,
    ts: stamped.ts,
  };
}
