/**
 * Seed-contact candidate policy — keeps route rotation and retry evidence
 * accounting separate from the HTTP contact owner.
 */

import {
  RETRYABLE_SEED_CONTACT_FAILURE_ACTION,
  resolveRetryableSeedContactFailureAction,
  resolveSeedContactAttemptTimeoutMs,
} from './contact-seed-failure-signals.js';

const MINIMUM_SEED_CONTACT_REQUEST_BUDGET_MS = 1;
const SEED_CONTACT_SESSION_ABSENT = 'seed_contact_session_absent';

function countInitialSweepCandidatesRemaining(options = {}) {
  const candidateCount = Number.isFinite(options.candidateCount) ?
    Math.max(0, Math.floor(options.candidateCount)) :
    0;
  const attempt = Number.isFinite(options.attempt) ?
    Math.max(0, Math.floor(options.attempt)) :
    0;
  return attempt > 0 && attempt <= candidateCount ?
    candidateCount - attempt + 1 :
    0;
}

function hasUntriedInitialSweepCandidate(options = {}) {
  return countInitialSweepCandidatesRemaining(options) > 1;
}

function resolveSeedContactCandidateAttemptTimeoutMs(options = {}) {
  const requestTimeoutMs = resolveSeedContactAttemptTimeoutMs(options);
  const candidatesRemaining =
    countInitialSweepCandidatesRemaining(options);
  if (candidatesRemaining <= 1 ||
      !Number.isFinite(options.remainingRetryBudgetMs)) {
    return requestTimeoutMs;
  }
  const fairShareMs = Math.max(
    MINIMUM_SEED_CONTACT_REQUEST_BUDGET_MS,
    Math.floor(options.remainingRetryBudgetMs / candidatesRemaining),
  );
  return Math.min(requestTimeoutMs, fairShareMs);
}

function resolveSeedContactCandidateFailureAction(options = {}) {
  const action = resolveRetryableSeedContactFailureAction(options);
  const elapsedMs = Number.isFinite(options.elapsedMs) ?
    Math.max(0, Math.floor(options.elapsedMs)) :
    0;
  const retryTimeoutMs = Number.isFinite(options.retryTimeoutMs) ?
    Math.max(0, Math.floor(options.retryTimeoutMs)) :
    0;
  if (
    action === RETRYABLE_SEED_CONTACT_FAILURE_ACTION.SURFACE &&
    options.classification?.retryable === true &&
    elapsedMs < retryTimeoutMs &&
    hasUntriedInitialSweepCandidate(options)
  ) {
    return RETRYABLE_SEED_CONTACT_FAILURE_ACTION.RETRY;
  }
  return action;
}

export {
  SEED_CONTACT_SESSION_ABSENT,
  hasUntriedInitialSweepCandidate,
  resolveSeedContactCandidateAttemptTimeoutMs,
  resolveSeedContactCandidateFailureAction,
};
