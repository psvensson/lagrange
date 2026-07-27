import {
  appendEvent,
  loadQuest,
  readLog,
} from './store.js';
import {
  baseCommitReachable,
  canonicalSourceDelta,
  sourceChangingAttempts,
} from './verification.js';
import {
  changeArtifactIdentity,
  changeArtifactIdentityMatches,
} from './change-artifact.js';
import {
  attemptHasLaterVerifierReview,
  EVENT_ATTEMPT_BASE_CORRECTED,
  exactStandingCandidateRejection,
} from './attempt-base-correction-projection.js';

const arraySlice = Array.prototype.slice;
const arraySort = Array.prototype.sort;
const reflectApply = Reflect.apply;
const regexpExec = RegExp.prototype.exec;
const stringTrim = String.prototype.trim;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;

function regexpMatches(pattern, value) {
  return typeof value === 'string' &&
    reflectApply(regexpExec, pattern, [value]) !== null;
}

function sortedCopy(value) {
  const copy = reflectApply(arraySlice, value, [0]);
  return reflectApply(arraySort, copy, []);
}

function requireText(args, name) {
  const value = args[name];
  if (typeof value !== 'string' ||
      reflectApply(stringTrim, value, []).length === 0) {
    throw new Error(`correct-attempt-base: --${name} is required`);
  }
  return reflectApply(stringTrim, value, []);
}

function exactArrayEqual(left, right) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function requireMatchingDelta(root, base, attempt, label) {
  const paths = sortedCopy(attempt.inspection.changedPaths);
  const delta = canonicalSourceDelta(root, base, paths);
  if (!delta.ok) {
    throw new Error(
      `correct-attempt-base: ${label} delta is unavailable: ${delta.problem}`,
    );
  }
  if (
    delta.fingerprint !== attempt.fingerprint ||
    !exactArrayEqual(delta.paths, paths)
  ) {
    throw new Error(
      `correct-attempt-base: ${label} delta does not reproduce ` +
        `${attempt.fingerprint}`,
    );
  }
  return delta.fingerprint;
}

function requireCorrectableAttempt(root, quest, log, attemptIndex) {
  for (let index = 0; index < log.length; index += 1) {
    const event = log[index];
    if (event.type === EVENT_ATTEMPT_BASE_CORRECTED &&
        event.attemptIndex === attemptIndex) {
      throw new Error(
        `correct-attempt-base: attempt ${attemptIndex} already has a correction`,
      );
    }
  }
  const attempts = sourceChangingAttempts(root, quest, log);
  let attempt = null;
  for (let index = 0; index < attempts.length; index += 1) {
    if (attempts[index].index === attemptIndex) {
      attempt = attempts[index];
      break;
    }
  }
  if (
    !attempt ||
    !attempt.candidateContract ||
    attempt.event.integrityAccepted !== true
  ) {
    throw new Error(
      'correct-attempt-base: target must be an accepted version-2 source attempt',
    );
  }
  const currentIdentity = changeArtifactIdentity(
    root,
    quest.id,
    attempt.event.changeRef,
  );
  if (!changeArtifactIdentityMatches(
    attempt.event.changeRefIdentity,
    currentIdentity,
  )) {
    throw new Error(
      'correct-attempt-base: sealed change artifact has drifted',
    );
  }
  return {attempt, attempts};
}

function requireNoReview(log, attempt) {
  if (attemptHasLaterVerifierReview(log, attempt)) {
    throw new Error(
      'correct-attempt-base: an exact verifier receipt already covers the attempt',
    );
  }
}

function requireRejectionBase(log, attempts, attempt, targetBase) {
  const correction = {
    fingerprint: attempt.fingerprint,
    paths: sortedCopy(attempt.inspection.changedPaths),
    toBase: targetBase,
  };
  if (!exactStandingCandidateRejection(
    log,
    attempt,
    correction,
    attempts,
  )) {
    throw new Error(
      'correct-attempt-base: target must equal the standing earlier ' +
        'candidate-rejection base on the same frontier',
    );
  }
}

function requireRecordedBase(root, attempt, targetBase) {
  const recordedBase = attempt.event.workspaceBaseCommit;
  if (!regexpMatches(COMMIT_PATTERN, recordedBase) ||
      !baseCommitReachable(root, recordedBase) ||
      recordedBase === targetBase) {
    throw new Error(
      'correct-attempt-base: recorded base must be a different reachable commit',
    );
  }
  return recordedBase;
}

export function runAttemptBaseCorrectionCommand(root, args = {}) {
  const id = args.id || args._?.[0];
  if (!id) throw new Error('correct-attempt-base: --id is required');
  const attemptIndex = Number(args['attempt-index']);
  if (!Number.isInteger(attemptIndex) || attemptIndex < 0) {
    throw new Error(
      'correct-attempt-base: --attempt-index must be a non-negative integer',
    );
  }
  const targetBase = requireText(args, 'to-base');
  const reason = requireText(args, 'reason');
  if (!regexpMatches(COMMIT_PATTERN, targetBase) ||
      !baseCommitReachable(root, targetBase)) {
    throw new Error(
      'correct-attempt-base: --to-base must name a reachable Git commit',
    );
  }

  const quest = loadQuest(root, id);
  const log = readLog(root, id);
  const {attempt, attempts} = requireCorrectableAttempt(
    root,
    quest,
    log,
    attemptIndex,
  );
  requireNoReview(log, attempt);
  requireRejectionBase(log, attempts, attempt, targetBase);
  const recordedBase = requireRecordedBase(root, attempt, targetBase);
  const recordedBaseFingerprint = requireMatchingDelta(
    root,
    recordedBase,
    attempt,
    'recorded-base',
  );
  const targetBaseFingerprint = requireMatchingDelta(
    root,
    targetBase,
    attempt,
    'target-base',
  );
  const paths = sortedCopy(attempt.inspection.changedPaths);
  const stamped = appendEvent(root, id, {
    type: EVENT_ATTEMPT_BASE_CORRECTED,
    attemptIndex,
    frontier: attempt.event.frontier,
    fromBase: recordedBase,
    toBase: targetBase,
    fingerprint: attempt.fingerprint,
    paths,
    reason,
    proof: {
      changeRefFingerprint: attempt.fingerprint,
      recordedBaseFingerprint,
      targetBaseFingerprint,
    },
  });
  return `corrected attempt ${attemptIndex} base ${recordedBase} -> ` +
    `${targetBase} at ${stamped.ts}`;
}
