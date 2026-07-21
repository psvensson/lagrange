// Content-bound source verification for Quest attempts and terminal handoff.
// Historical attempts keep their legacy prose rule; contracted attempts bind a
// verifier approval to the exact sealed patch payload and terminal approval to
// the current aggregate Git delta over every recorded source path.

import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

import {EVENT_ATTEMPT, EVENT_FINDING} from './constants.js';
import {
  inspectChangeArtifact,
  requiresSourceVerification,
} from './change-artifact.js';

const LOCAL_STR_OWNED_001 = 'verifier-approval';
const LOCAL_STR_OWNED_002 = 'attempt';
const LOCAL_STR_OWNED_003 = 'aggregate';
const LOCAL_STR_OWNED_004 = 'both';
const LOCAL_STR_OWNED_005 = 'hex';
const LOCAL_STR_OWNED_006 = 'subagent:';
const LOCAL_STR_OWNED_007 = '\n';
const LOCAL_STR_OWNED_008 = '?? ';
const LOCAL_STR_OWNED_009 = 'source verification requires a recorded Git base commit';
const LOCAL_STR_OWNED_010 = 'source verification could not inspect Git status';
const LOCAL_STR_OWNED_011 = 'source verification cannot fingerprint untracked paths; stage intent with git add -N';
const LOCAL_STR_OWNED_012 = '(missing changeRef)';
const LOCAL_STR_OWNED_013 = '\t';
const LOCAL_STR_OWNED_014 = '\0';
const LOCAL_STR_OWNED_015 = 'requires a later legacy subagent verification finding';
const LOCAL_STR_OWNED_016 = 'is missing a sealed verification fingerprint';
const LOCAL_STR_OWNED_017 = 'same-frontier, same-base source attempt covering every rejected ';
const LOCAL_STR_OWNED_018 = 'source path plus its own later exact approval';
const LOCAL_STR_OWNED_019 = 'could not inspect dirty checkpoint paths';
const LOCAL_STR_OWNED_020 = 'verifier-rejection requires --verification-scope attempt';
const GIT_STATUS_UNAVAILABLE = Symbol('git_status_unavailable');

export const VERIFICATION_CONTRACT_VERSION = 1;
export const VERIFIER_APPROVAL_FINDING_KIND = LOCAL_STR_OWNED_001;
const VERIFIER_REJECTION_FINDING_KIND = 'verifier-rejection';
const VERIFICATION_VERDICT_REJECTED = 'rejected';
export const VERIFICATION_SCOPE = Object.freeze({
  ATTEMPT: LOCAL_STR_OWNED_002,
  AGGREGATE: LOCAL_STR_OWNED_003,
  BOTH: LOCAL_STR_OWNED_004,
});

const HASH_ALGORITHM = 'sha256';
const FINGERPRINT_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const LEGACY_APPROVAL_PATTERN = /source|code|change|quest|intent|guideline|doctrine|verif/iu;
const VERIFIER_EVIDENCE_PATTERN = /^subagent:[A-Za-z0-9][A-Za-z0-9_./-]*$/u;

function hash(bytes) {
  return crypto.createHash(HASH_ALGORITHM).update(bytes).digest(LOCAL_STR_OWNED_005);
}

export function formatVerificationFingerprint(sha256) {
  return typeof sha256 === 'string' && /^[0-9a-f]{64}$/u.test(sha256) ?
    `sha256:${sha256}` : null;
}

export function validVerificationFingerprint(value) {
  return typeof value === 'string' && FINGERPRINT_PATTERN.test(value);
}

export function attemptFingerprint(event) {
  return formatVerificationFingerprint(event?.changeRefIdentity?.sha256);
}

export function resolveWorkspaceBaseCommit(root) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) return null;
  const sha = String(result.stdout || '').trim();
  return /^[0-9a-f]{40}$/u.test(sha) ? sha : null;
}

export function sourceChangingAttempts(root, quest, log, options = {}) {
  const startIndex = options.startIndex || 0;
  const attempts = [];
  for (const [index, event] of log.entries()) {
    if (index < startIndex || event.type !== EVENT_ATTEMPT) continue;
    const inspection = inspectChangeArtifact(root, quest, event.changeRef);
    const sourcePaths = inspection.changedPaths.filter(requiresSourceVerification);
    if (sourcePaths.length === 0) continue;
    attempts.push({
      index,
      event,
      inspection,
      sourcePaths,
      fingerprint: attemptFingerprint(event),
      contracted: event.verificationContractVersion ===
        VERIFICATION_CONTRACT_VERSION,
    });
  }
  return attempts;
}

function verificationOf(event) {
  return event?.verification && typeof event.verification === 'object' ?
    event.verification : null;
}

function structuredApprovalMatches(event, scope, fingerprint) {
  if (event.type !== EVENT_FINDING ||
    event.kind !== VERIFIER_APPROVAL_FINDING_KIND ||
    !VERIFIER_EVIDENCE_PATTERN.test(String(event.evidence || ''))) return false;
  const verification = verificationOf(event);
  if (!verification || verification.schemaVersion !== VERIFICATION_CONTRACT_VERSION ||
    verification.fingerprint !== fingerprint) return false;
  return verification.scope === scope || verification.scope === VERIFICATION_SCOPE.BOTH;
}

function structuredRejectionMatches(event, fingerprint) {
  if (event.type !== EVENT_FINDING ||
    event.kind !== VERIFIER_REJECTION_FINDING_KIND ||
    !VERIFIER_EVIDENCE_PATTERN.test(String(event.evidence || ''))) return false;
  const verification = verificationOf(event);
  return verification?.schemaVersion === VERIFICATION_CONTRACT_VERSION &&
    verification.scope === VERIFICATION_SCOPE.ATTEMPT &&
    verification.fingerprint === fingerprint &&
    verification.verdict === VERIFICATION_VERDICT_REJECTED;
}

function legacyApprovalMatches(event, frontier) {
  if (event.type !== EVENT_FINDING || event.frontier !== frontier ||
    !String(event.evidence || '').startsWith(LOCAL_STR_OWNED_006)) return false;
  return event.kind === VERIFIER_APPROVAL_FINDING_KIND ||
    LEGACY_APPROVAL_PATTERN.test(String(event.claim || ''));
}

function laterApproval(log, attempt, scope, fingerprint) {
  return log.slice(attempt.index + 1).find((event) =>
    event.frontier === attempt.event.frontier &&
    structuredApprovalMatches(event, scope, fingerprint));
}

function laterRejection(log, attempt, fingerprint) {
  for (let index = attempt.index + 1; index < log.length; index += 1) {
    const event = log[index];
    if (event.frontier === attempt.event.frontier &&
        structuredRejectionMatches(event, fingerprint)) {
      return {event, index};
    }
  }
  return null;
}

function rejectionDisposition(log, attempts, attempt) {
  const rejection = laterRejection(log, attempt, attempt.fingerprint);
  if (!rejection) return null;
  const replacement = findApprovedRejectionReplacement(
    log,
    attempts,
    attempt,
    rejection.index,
  );
  return replacement ?
    {rejection, replacement} :
    {rejection, replacement: null};
}

function sourcePathSuperset(candidate, rejected) {
  const candidatePaths = new Set(candidate.sourcePaths);
  return rejected.sourcePaths.every((filePath) => candidatePaths.has(filePath));
}

function checkpointPathSuperset(candidate, superseded) {
  const candidatePaths = new Set(candidate.inspection.changedPaths);
  return superseded.inspection.changedPaths.every(
    (filePath) => candidatePaths.has(filePath),
  );
}

function approvedCheckpointReplacement(log, attempts, superseded) {
  for (const candidate of attempts) {
    if (candidate.index <= superseded.index ||
        candidate.event.frontier !== superseded.event.frontier ||
        candidate.event.workspaceBaseCommit !==
          superseded.event.workspaceBaseCommit ||
        !checkpointPathSuperset(candidate, superseded)) {
      continue;
    }
    const approval = laterApproval(
      log,
      candidate,
      VERIFICATION_SCOPE.ATTEMPT,
      candidate.fingerprint,
    );
    if (approval) return candidate;
  }
  return null;
}

export function findApprovedRejectionReplacement(
  log,
  attempts,
  rejectedAttempt,
  rejectionIndex,
) {
  for (const candidate of attempts) {
    if (candidate.index <= rejectionIndex ||
        !candidate.contracted ||
        candidate.fingerprint === rejectedAttempt.fingerprint ||
        candidate.event.frontier !== rejectedAttempt.event.frontier ||
        candidate.event.workspaceBaseCommit !==
          rejectedAttempt.event.workspaceBaseCommit ||
        !sourcePathSuperset(candidate, rejectedAttempt)) {
      continue;
    }
    const approval = laterApproval(
      log,
      candidate,
      VERIFICATION_SCOPE.ATTEMPT,
      candidate.fingerprint,
    );
    if (approval) return {attempt: candidate, approval};
  }
  return null;
}

function gitStatusHasUntracked(root, paths) {
  const result = spawnSync('git', ['status', '--porcelain', '--', ...paths], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) return GIT_STATUS_UNAVAILABLE;
  return String(result.stdout || '').split(LOCAL_STR_OWNED_007)
    .some((line) => line.startsWith(LOCAL_STR_OWNED_008));
}

export function canonicalSourceDelta(root, baseCommit, paths) {
  const sortedPaths = [...new Set(paths)].sort();
  if (!/^[0-9a-f]{40}$/u.test(String(baseCommit || ''))) {
    return {ok: false, fingerprint: null, content: null,
      problem: LOCAL_STR_OWNED_009};
  }
  if (sortedPaths.length === 0) {
    return {ok: true, fingerprint: null, content: '', paths: []};
  }
  const untracked = gitStatusHasUntracked(root, sortedPaths);
  if (untracked === GIT_STATUS_UNAVAILABLE) {
    return {ok: false, fingerprint: null, content: null,
      problem: LOCAL_STR_OWNED_010};
  }
  if (untracked) {
    return {ok: false, fingerprint: null, content: null,
      problem: LOCAL_STR_OWNED_011};
  }
  const result = spawnSync('git', [
    'diff', '--binary', '--full-index', '--no-ext-diff', baseCommit,
    '--', ...sortedPaths,
  ], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: GIT_MAX_BUFFER_BYTES,
  });
  if (result.status !== 0 || typeof result.stdout !== 'string') {
    return {ok: false, fingerprint: null, content: null,
      problem: `source verification Git diff failed: ${String(result.stderr || '').trim()}`};
  }
  return {
    ok: true,
    fingerprint: `sha256:${hash(result.stdout)}`,
    content: result.stdout,
    paths: sortedPaths,
  };
}

export function aggregateSourceFingerprint(root, attempts) {
  const contracted = attempts.filter((attempt) => attempt.contracted);
  if (contracted.length === 0) {
    return {ok: true, fingerprint: null, content: '', paths: [], baseCommit: null};
  }
  const baseCommit = contracted[0].event.workspaceBaseCommit;
  const paths = contracted.flatMap((attempt) => attempt.sourcePaths);
  return {
    ...canonicalSourceDelta(root, baseCommit, paths),
    baseCommit,
  };
}

function attemptProblem(attempt, detail) {
  return {
    message: `source attempt ${attempt.event.changeRef || LOCAL_STR_OWNED_012} ` +
      `${detail}`,
    ts: attempt.event.ts || null,
    frontier: attempt.event.frontier || null,
  };
}

function latestCheckpointCommit(root, questId) {
  const result = spawnSync('git', ['log', '--format=%H%x09%s'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) return null;
  const prefix = `checkpoint(quest): ${questId}:`;
  for (const line of String(result.stdout || '').split(LOCAL_STR_OWNED_007)) {
    const [commit, subject = ''] = line.split(LOCAL_STR_OWNED_013, 2);
    if (/^[0-9a-f]{40}$/u.test(commit) && subject.startsWith(prefix)) return commit;
  }
  return null;
}

function attemptIsAfterCheckpoint(root, attempt, checkpointCommit) {
  if (!checkpointCommit) return true;
  const baseCommit = attempt.event.workspaceBaseCommit;
  if (!/^[0-9a-f]{40}$/u.test(String(baseCommit || ''))) return true;
  const result = spawnSync(
    'git', ['merge-base', '--is-ancestor', checkpointCommit, baseCommit],
    {cwd: root, encoding: 'utf8'},
  );
  // Status 0 means the attempt was pinned at or after the latest checkpoint.
  // An indeterminate VCS result fails closed by keeping the attempt in scope.
  return result.status === 0 || (result.status !== 1 && result.status !== 0);
}

function dirtyPathsSinceHead(root, paths) {
  const sortedPaths = [...new Set(paths)].sort();
  if (sortedPaths.length === 0) return [];
  const result = spawnSync(
    'git', ['diff', '--name-only', '-z', 'HEAD', '--', ...sortedPaths],
    {cwd: root, encoding: 'utf8'},
  );
  if (result.status !== 0) return null;
  return String(result.stdout || '').split(LOCAL_STR_OWNED_014).filter(Boolean);
}

function findUncheckpointedApprovedAttempts(root, quest, log, state) {
  const resolvedRejectedIndexes = new Set(
    state.resolvedRejectedAttempts.map((entry) => entry.attempt.index),
  );
  const approvedReplacementIndexes = new Set(
    state.resolvedRejectedAttempts.map((entry) => entry.replacement.index),
  );
  const checkpointCommit = latestCheckpointCommit(root, quest.id);
  const candidates = state.attempts.filter((attempt) =>
    attempt.contracted &&
    !resolvedRejectedIndexes.has(attempt.index) &&
    (
      approvedReplacementIndexes.has(attempt.index) ||
      attemptIsAfterCheckpoint(root, attempt, checkpointCommit)
    ));
  const supersededIndexes = new Set(
    candidates
      .filter((attempt) => approvedCheckpointReplacement(
        log,
        candidates,
        attempt,
      ))
      .map((attempt) => attempt.index),
  );
  return candidates.filter((attempt) => !supersededIndexes.has(attempt.index));
}

export function verificationState(root, quest, log, options = {}) {
  const attempts = sourceChangingAttempts(root, quest, log, options);
  const attemptProblems = [];
  const pendingAttempts = [];
  const resolvedRejectedAttempts = [];
  const unresolvedRejectedAttempts = [];
  for (const attempt of attempts) {
    if (!attempt.contracted) {
      const approval = log.slice(attempt.index + 1)
        .find((event) => legacyApprovalMatches(event, attempt.event.frontier));
      if (!approval) {
        attemptProblems.push(attemptProblem(
          attempt,
          LOCAL_STR_OWNED_015,
        ));
      }
      continue;
    }
    if (!attempt.fingerprint) {
      attemptProblems.push(attemptProblem(
        attempt,
        LOCAL_STR_OWNED_016,
      ));
      pendingAttempts.push(attempt);
      continue;
    }
    const rejection = rejectionDisposition(log, attempts, attempt);
    if (rejection?.replacement) {
      resolvedRejectedAttempts.push({
        attempt,
        rejection: rejection.rejection.event,
        replacement: rejection.replacement.attempt,
        approval: rejection.replacement.approval,
      });
      continue;
    }
    if (rejection) {
      attemptProblems.push(attemptProblem(
        attempt,
        `was explicitly rejected at ${attempt.fingerprint}; requires a later ` +
          LOCAL_STR_OWNED_017 +
          LOCAL_STR_OWNED_018,
      ));
      unresolvedRejectedAttempts.push({
        attempt,
        rejection: rejection.rejection.event,
      });
      continue;
    }
    const approval = laterApproval(
      log, attempt, VERIFICATION_SCOPE.ATTEMPT, attempt.fingerprint);
    if (!approval) {
      attemptProblems.push(attemptProblem(
        attempt,
        `requires a later exact approval for ${attempt.fingerprint}`,
      ));
      pendingAttempts.push(attempt);
    }
  }

  const aggregate = aggregateSourceFingerprint(root, attempts);
  const latestContracted = [...attempts].reverse().find((attempt) => attempt.contracted);
  let aggregateApproval = null;
  if (latestContracted && aggregate.ok && aggregate.fingerprint) {
    aggregateApproval = log.slice(latestContracted.index + 1).find((event) =>
      structuredApprovalMatches(
        event, VERIFICATION_SCOPE.AGGREGATE, aggregate.fingerprint));
  }
  const aggregateProblems = [];
  if (latestContracted && !aggregate.ok) {
    aggregateProblems.push(attemptProblem(latestContracted, aggregate.problem));
  } else if (latestContracted && !aggregateApproval) {
    aggregateProblems.push(attemptProblem(
      latestContracted,
      `requires a later aggregate approval for ${aggregate.fingerprint}`,
    ));
  }
  const state = {
    attempts,
    pendingAttempts,
    attemptProblems,
    aggregate,
    aggregateApproval,
    aggregateProblems,
    resolvedRejectedAttempts,
    unresolvedRejectedAttempts,
  };
  return {
    ...state,
    uncheckpointedApprovedAttempts:
      findUncheckpointedApprovedAttempts(root, quest, log, state),
  };
}

export function checkpointVerificationProblems(root, quest, log, options = {}) {
  const state = verificationState(root, quest, log, options);
  if (state.attemptProblems.length > 0) return state.attemptProblems;
  const problems = [];
  const uncheckpointed = state.uncheckpointedApprovedAttempts;
  const contracted = state.attempts.filter((attempt) => attempt.contracted);
  const coveredPaths = new Set(uncheckpointed.flatMap(
    (attempt) => attempt.inspection.changedPaths));
  const allAttemptPaths = contracted.flatMap(
    (attempt) => attempt.inspection.changedPaths);
  const dirtyPaths = dirtyPathsSinceHead(root, allAttemptPaths);
  const anchor = [...contracted].reverse()[0];
  if (dirtyPaths === null && anchor) {
    problems.push(attemptProblem(anchor, LOCAL_STR_OWNED_019));
  } else if (anchor) {
    for (const dirtyPath of dirtyPaths) {
      if (!coveredPaths.has(dirtyPath)) {
        problems.push(attemptProblem(
          anchor,
          `dirty path ${dirtyPath} has no uncheckpointed exact attempt receipt`,
        ));
      }
    }
  }
  for (const attempt of uncheckpointed) {
    // The attempt receipt hashes the complete canonical changeRef payload. Re-diff
    // that same complete path set here: sourcePaths is intentionally narrower and
    // belongs only to the terminal aggregate-verification scope.
    const live = canonicalSourceDelta(
      root, attempt.event.workspaceBaseCommit, attempt.inspection.changedPaths);
    if (!live.ok) {
      problems.push(attemptProblem(attempt, live.problem));
    } else if (live.fingerprint !== attempt.fingerprint) {
      problems.push(attemptProblem(
        attempt,
        `changed after approval (approved ${attempt.fingerprint}, current ${live.fingerprint})`,
      ));
    }
  }
  return problems;
}

export function terminalVerificationProblems(root, quest, log, options = {}) {
  const state = verificationState(root, quest, log, options);
  return [...state.attemptProblems, ...state.aggregateProblems];
}

export function buildVerificationFinding(args) {
  const isApproval = args.kind === VERIFIER_APPROVAL_FINDING_KIND;
  const isRejection = args.kind === VERIFIER_REJECTION_FINDING_KIND;
  if (!isApproval && !isRejection) return null;
  const label = isRejection ? 'verifier-rejection' : 'verifier-approval';
  if (!VERIFIER_EVIDENCE_PATTERN.test(String(args.evidence || ''))) {
    throw new Error(
      `${label} requires --evidence subagent:<non-empty-stable-id>`,
    );
  }
  const scope = args.verificationScope;
  if (!Object.values(VERIFICATION_SCOPE).includes(scope)) {
    throw new Error(
      `${label} requires --verification-scope attempt|aggregate|both`,
    );
  }
  if (isRejection && scope !== VERIFICATION_SCOPE.ATTEMPT) {
    throw new Error(LOCAL_STR_OWNED_020);
  }
  if (!validVerificationFingerprint(args.verificationFingerprint)) {
    throw new Error(
      `${label} requires --verification-fingerprint sha256:<64 hex>`,
    );
  }
  return {
    schemaVersion: VERIFICATION_CONTRACT_VERSION,
    scope,
    fingerprint: args.verificationFingerprint,
    ...(isRejection ? {verdict: VERIFICATION_VERDICT_REJECTED} : {}),
  };
}
