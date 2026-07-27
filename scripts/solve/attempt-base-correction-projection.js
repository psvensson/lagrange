export const EVENT_ATTEMPT_BASE_CORRECTED = 'attempt-base-corrected';

const arrayIsArray = Array.isArray;
const arraySlice = Array.prototype.slice;
const arraySort = Array.prototype.sort;
const mapGet = Map.prototype.get;
const mapHas = Map.prototype.has;
const mapSet = Map.prototype.set;
const objectHasOwn = Object.hasOwn;
const reflectApply = Reflect.apply;
const reflectOwnKeys = Reflect.ownKeys;
const regexpExec = RegExp.prototype.exec;
const stringTrim = String.prototype.trim;
const MapConstructor = Map;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const FINGERPRINT_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const VERIFIER_EVIDENCE_PATTERN =
  /^subagent:[A-Za-z0-9][A-Za-z0-9_./-]*$/u;
const VERIFIER_KINDS = Object.freeze([
  'verifier-approval',
  'verifier-rejection',
]);
const REVIEW_SCOPES = Object.freeze([
  'aggregate',
  'both',
  'candidate',
]);
const EVENT_KEYS = Object.freeze([
  'attemptIndex',
  'fingerprint',
  'fromBase',
  'frontier',
  'paths',
  'proof',
  'reason',
  'toBase',
  'ts',
  'type',
]);
const PROOF_KEYS = Object.freeze([
  'changeRefFingerprint',
  'recordedBaseFingerprint',
  'targetBaseFingerprint',
]);

function regexpMatches(pattern, value) {
  return typeof value === 'string' &&
    reflectApply(regexpExec, pattern, [value]) !== null;
}

function arrayCopy(value) {
  return reflectApply(arraySlice, value, [0]);
}

function sortedCopy(value) {
  return reflectApply(arraySort, arrayCopy(value), []);
}

function mapRead(map, key) {
  return reflectApply(mapGet, map, [key]);
}

function mapIncludes(map, key) {
  return reflectApply(mapHas, map, [key]);
}

function mapWrite(map, key, value) {
  reflectApply(mapSet, map, [key, value]);
}

function allTrue(values) {
  for (let index = 0; index < values.length; index += 1) {
    if (!values[index]) return false;
  }
  return true;
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || arrayIsArray(value)) return false;
  const keys = reflectOwnKeys(value);
  if (keys.length !== expected.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (!objectHasOwn(value, expected[index])) return false;
  }
  return true;
}

function exactStringArray(value, expected) {
  if (!arrayIsArray(value) || value.length !== expected.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (typeof value[index] !== 'string' ||
        value[index] !== expected[index]) return false;
  }
  return true;
}

function nonEmptyString(value) {
  return typeof value === 'string' &&
    reflectApply(stringTrim, value, []).length > 0;
}

function validStringArray(value) {
  if (!arrayIsArray(value) || value.length === 0) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!nonEmptyString(value[index])) return false;
  }
  return true;
}

function arrayContains(value, expected) {
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === expected) return true;
  }
  return false;
}

function pathSuperset(candidatePaths, rejectedPaths) {
  if (!validStringArray(candidatePaths) ||
      !validStringArray(rejectedPaths)) return false;
  for (let index = 0; index < rejectedPaths.length; index += 1) {
    if (!arrayContains(candidatePaths, rejectedPaths[index])) return false;
  }
  return true;
}

function correctionBindingIsExact(correction, attempt, paths) {
  return allTrue([
    correction.type === EVENT_ATTEMPT_BASE_CORRECTED,
    Number.isInteger(correction.attemptIndex),
    correction.attemptIndex === attempt.index,
    correction.frontier === attempt.event.frontier,
    correction.fromBase === attempt.event.workspaceBaseCommit,
    regexpMatches(COMMIT_PATTERN, correction.fromBase),
    regexpMatches(COMMIT_PATTERN, correction.toBase),
    correction.fromBase !== correction.toBase,
    correction.fingerprint === attempt.fingerprint,
    regexpMatches(FINGERPRINT_PATTERN, correction.fingerprint),
    exactStringArray(correction.paths, paths),
    nonEmptyString(correction.reason),
    nonEmptyString(correction.ts),
    exactKeys(correction.proof, PROOF_KEYS),
    correction.proof?.changeRefFingerprint === attempt.fingerprint,
    correction.proof?.recordedBaseFingerprint === attempt.fingerprint,
    correction.proof?.targetBaseFingerprint === attempt.fingerprint,
  ]);
}

function correctionShapeProblem(correction, attempt) {
  const paths = sortedCopy(attempt.inspection.changedPaths);
  if (!exactKeys(correction, EVENT_KEYS)) {
    return 'attempt base correction has an inexact event shape';
  }
  if (!correctionBindingIsExact(correction, attempt, paths)) {
    return 'attempt base correction does not bind the exact recorded attempt';
  }
  return null;
}

function isVerifierKind(kind) {
  return arrayContains(VERIFIER_KINDS, kind);
}

function isCandidateReceiptEnvelope(event, frontier) {
  return allTrue([
    event?.type === 'finding',
    event?.frontier === frontier,
    isVerifierKind(event?.kind),
    event?.verification?.schemaVersion === 2,
    event?.verification?.scope === 'candidate',
  ]);
}

function latestCandidateReceipt(log, attempt) {
  for (let index = attempt.index - 1; index >= 0; index -= 1) {
    if (isCandidateReceiptEnvelope(log[index], attempt.event.frontier)) {
      return {event: log[index], index};
    }
  }
  return null;
}

function attemptAtIndex(attempts, targetIndex) {
  for (let index = 0; index < attempts.length; index += 1) {
    if (attempts[index].index === targetIndex) return attempts[index];
  }
  return null;
}

function receiptBindsRejectedAttempt(
  receipt,
  rejectionIndex,
  attempt,
  attempts,
) {
  if (receipt.firstAttemptIndex !== receipt.lastAttemptIndex ||
      receipt.lastAttemptIndex >= rejectionIndex) return false;
  const rejectedAttempt = attemptAtIndex(
    attempts,
    receipt.lastAttemptIndex,
  );
  if (!rejectedAttempt) return false;
  return allTrue([
    rejectedAttempt.candidateContract === true,
    rejectedAttempt.event.integrityAccepted === true,
    rejectedAttempt.event.frontier === attempt.event.frontier,
    rejectedAttempt.event.workspaceBaseCommit === receipt.baseCommit,
    rejectedAttempt.fingerprint === receipt.fingerprint,
    exactStringArray(
      receipt.paths,
      sortedCopy(rejectedAttempt.inspection.changedPaths),
    ),
    exactStringArray(
      receipt.sourcePaths,
      sortedCopy(rejectedAttempt.sourcePaths),
    ),
  ]);
}

function validStandingRejection(entry, attempt, correction, attempts) {
  if (!entry || !entry.event.verification) return false;
  const {event, index: rejectionIndex} = entry;
  const receipt = event.verification;
  return allTrue([
    event.kind === 'verifier-rejection',
    regexpMatches(VERIFIER_EVIDENCE_PATTERN, event.evidence),
    receipt.verdict === 'rejected',
    regexpMatches(FINGERPRINT_PATTERN, receipt.fingerprint),
    regexpMatches(COMMIT_PATTERN, receipt.baseCommit),
    receipt.baseCommit === correction.toBase,
    validStringArray(receipt.paths),
    validStringArray(receipt.sourcePaths),
    Number.isInteger(receipt.firstAttemptIndex),
    Number.isInteger(receipt.lastAttemptIndex),
    receipt.firstAttemptIndex >= 0,
    receipt.firstAttemptIndex <= receipt.lastAttemptIndex,
    receipt.lastAttemptIndex < attempt.index,
    receiptBindsRejectedAttempt(
      receipt,
      rejectionIndex,
      attempt,
      attempts,
    ),
    correction.fingerprint !== receipt.fingerprint,
    pathSuperset(correction.paths, receipt.paths),
  ]);
}

function receiptCoversAttempt(event, attempt) {
  if (!event || !event.verification) return false;
  const receipt = event.verification;
  if (!allTrue([
    event.type === 'finding',
    isVerifierKind(event.kind),
    regexpMatches(VERIFIER_EVIDENCE_PATTERN, event.evidence),
    regexpMatches(FINGERPRINT_PATTERN, receipt.fingerprint),
  ])) return false;
  if (receipt.fingerprint === attempt.fingerprint) return true;
  return allTrue([
    receipt.schemaVersion === 2,
    arrayContains(REVIEW_SCOPES, receipt.scope),
    Number.isInteger(receipt.firstAttemptIndex),
    Number.isInteger(receipt.lastAttemptIndex),
    receipt.firstAttemptIndex <= attempt.index,
    receipt.lastAttemptIndex >= attempt.index,
  ]);
}

function hasPriorReview(log, attempt, correctionIndex) {
  for (let index = attempt.index + 1; index < correctionIndex; index += 1) {
    if (receiptCoversAttempt(log[index], attempt)) return true;
  }
  return false;
}

export function exactStandingCandidateRejection(
  log,
  attempt,
  correction,
  attempts,
) {
  const entry = latestCandidateReceipt(log, attempt);
  return validStandingRejection(entry, attempt, correction, attempts) ?
    {event: entry.event, receipt: entry.event.verification} :
    null;
}

export function attemptHasLaterVerifierReview(
  log,
  attempt,
  endIndex = log.length,
) {
  return hasPriorReview(log, attempt, endIndex);
}

function correctionAuthorizationProblem(
  correction,
  attempt,
  attempts,
  log,
  eventIndex,
) {
  if (!exactStandingCandidateRejection(
    log,
    attempt,
    correction,
    attempts,
  )) {
    return 'attempt base correction has no exact standing candidate rejection';
  }
  if (hasPriorReview(log, attempt, eventIndex)) {
    return 'attempt base correction follows an exact verifier review';
  }
  return null;
}

function correctionProofProblem(
  event,
  attempt,
  attempts,
  log,
  eventIndex,
  options,
) {
  let problem = correctionShapeProblem(event, attempt);
  if (problem) return problem;
  problem = correctionAuthorizationProblem(
    event,
    attempt,
    attempts,
    log,
    eventIndex,
  );
  if (problem) return problem;
  if (typeof options.validateProof !== 'function') {
    return 'attempt base correction has no live proof validator';
  }
  return options.validateProof(event, attempt);
}

function inspectCorrectionEvent(
  event,
  eventIndex,
  byIndex,
  corrections,
  attempts,
  log,
  options,
) {
  const attempt = mapRead(byIndex, event.attemptIndex);
  if (!attempt || eventIndex <= event.attemptIndex) {
    return {problem: 'attempt base correction names no earlier source attempt'};
  }
  if (mapIncludes(corrections, event.attemptIndex)) {
    return {
      problem: `attempt ${event.attemptIndex} has more than one base correction`,
    };
  }
  return {
    attempt,
    problem: correctionProofProblem(
      event,
      attempt,
      attempts,
      log,
      eventIndex,
      options,
    ),
  };
}

export function projectAttemptBaseCorrections(attempts, log, options = {}) {
  const byIndex = new MapConstructor();
  for (let index = 0; index < attempts.length; index += 1) {
    mapWrite(byIndex, attempts[index].index, attempts[index]);
  }
  const corrections = new MapConstructor();
  const problems = [];
  for (let eventIndex = 0; eventIndex < log.length; eventIndex += 1) {
    const event = log[eventIndex];
    if (event.type !== EVENT_ATTEMPT_BASE_CORRECTED) continue;
    const inspected = inspectCorrectionEvent(
      event,
      eventIndex,
      byIndex,
      corrections,
      attempts,
      log,
      options,
    );
    if (inspected.problem) {
      problems[problems.length] =
        `attempt ${event.attemptIndex}: ${inspected.problem}`;
      continue;
    }
    mapWrite(corrections, inspected.attempt.index, event);
  }
  const projected = [];
  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    const correction = mapRead(corrections, attempt.index);
    projected[projected.length] = !correction ? attempt : {
      ...attempt,
      event: {
        ...attempt.event,
        baseCorrection: correction,
        recordedWorkspaceBaseCommit: attempt.event.workspaceBaseCommit,
        workspaceBaseCommit: correction.toBase,
      },
    };
  }
  return {
    attempts: projected,
    problems,
  };
}
