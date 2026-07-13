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

export const VERIFICATION_CONTRACT_VERSION = 1;
export const VERIFIER_APPROVAL_FINDING_KIND = 'verifier-approval';
export const VERIFICATION_SCOPE = Object.freeze({
  ATTEMPT: 'attempt',
  AGGREGATE: 'aggregate',
  BOTH: 'both',
});

const HASH_ALGORITHM = 'sha256';
const FINGERPRINT_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const LEGACY_APPROVAL_PATTERN = /source|code|change|quest|intent|guideline|doctrine|verif/iu;
const VERIFIER_EVIDENCE_PATTERN = /^subagent:[A-Za-z0-9][A-Za-z0-9_./-]*$/u;

function hash(bytes) {
  return crypto.createHash(HASH_ALGORITHM).update(bytes).digest('hex');
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

function legacyApprovalMatches(event, frontier) {
  if (event.type !== EVENT_FINDING || event.frontier !== frontier ||
    !String(event.evidence || '').startsWith('subagent:')) return false;
  return event.kind === VERIFIER_APPROVAL_FINDING_KIND ||
    LEGACY_APPROVAL_PATTERN.test(String(event.claim || ''));
}

function laterApproval(log, attempt, scope, fingerprint) {
  return log.slice(attempt.index + 1).find((event) =>
    event.frontier === attempt.event.frontier &&
    structuredApprovalMatches(event, scope, fingerprint));
}

function gitStatusHasUntracked(root, paths) {
  const result = spawnSync('git', ['status', '--porcelain', '--', ...paths], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) return null;
  return String(result.stdout || '').split('\n')
    .some((line) => line.startsWith('?? '));
}

export function canonicalSourceDelta(root, baseCommit, paths) {
  const sortedPaths = [...new Set(paths)].sort();
  if (!/^[0-9a-f]{40}$/u.test(String(baseCommit || ''))) {
    return {ok: false, fingerprint: null, content: null,
      problem: 'source verification requires a recorded Git base commit'};
  }
  if (sortedPaths.length === 0) {
    return {ok: true, fingerprint: null, content: '', paths: []};
  }
  const untracked = gitStatusHasUntracked(root, sortedPaths);
  if (untracked === null) {
    return {ok: false, fingerprint: null, content: null,
      problem: 'source verification could not inspect Git status'};
  }
  if (untracked) {
    return {ok: false, fingerprint: null, content: null,
      problem: 'source verification cannot fingerprint untracked paths; stage intent with git add -N'};
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
    message: `source attempt ${attempt.event.changeRef || '(missing changeRef)'} ` +
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
  for (const line of String(result.stdout || '').split('\n')) {
    const [commit, subject = ''] = line.split('\t', 2);
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
  return String(result.stdout || '').split('\0').filter(Boolean);
}

export function verificationState(root, quest, log, options = {}) {
  const attempts = sourceChangingAttempts(root, quest, log, options);
  const attemptProblems = [];
  const pendingAttempts = [];
  for (const attempt of attempts) {
    if (!attempt.contracted) {
      const approval = log.slice(attempt.index + 1)
        .find((event) => legacyApprovalMatches(event, attempt.event.frontier));
      if (!approval) {
        attemptProblems.push(attemptProblem(
          attempt,
          'requires a later legacy subagent verification finding',
        ));
      }
      continue;
    }
    if (!attempt.fingerprint) {
      attemptProblems.push(attemptProblem(
        attempt,
        'is missing a sealed verification fingerprint',
      ));
      pendingAttempts.push(attempt);
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
  return {
    attempts,
    pendingAttempts,
    attemptProblems,
    aggregate,
    aggregateApproval,
    aggregateProblems,
  };
}

export function checkpointVerificationProblems(root, quest, log, options = {}) {
  const state = verificationState(root, quest, log, options);
  if (state.attemptProblems.length > 0) return state.attemptProblems;
  const checkpointCommit = latestCheckpointCommit(root, quest.id);
  const problems = [];
  const uncheckpointed = state.attempts.filter((attempt) =>
    attempt.contracted && attemptIsAfterCheckpoint(root, attempt, checkpointCommit));
  const contracted = state.attempts.filter((attempt) => attempt.contracted);
  const coveredPaths = new Set(uncheckpointed.flatMap(
    (attempt) => attempt.inspection.changedPaths));
  const allAttemptPaths = contracted.flatMap(
    (attempt) => attempt.inspection.changedPaths);
  const dirtyPaths = dirtyPathsSinceHead(root, allAttemptPaths);
  const anchor = [...contracted].reverse()[0];
  if (dirtyPaths === null && anchor) {
    problems.push(attemptProblem(anchor, 'could not inspect dirty checkpoint paths'));
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
  if (args.kind !== VERIFIER_APPROVAL_FINDING_KIND) return null;
  if (!VERIFIER_EVIDENCE_PATTERN.test(String(args.evidence || ''))) {
    throw new Error(
      'verifier-approval requires --evidence subagent:<non-empty-stable-id>',
    );
  }
  const scope = args.verificationScope;
  if (!Object.values(VERIFICATION_SCOPE).includes(scope)) {
    throw new Error(
      'verifier-approval requires --verification-scope attempt|aggregate|both',
    );
  }
  if (!validVerificationFingerprint(args.verificationFingerprint)) {
    throw new Error(
      'verifier-approval requires --verification-fingerprint sha256:<64 hex>',
    );
  }
  return {
    schemaVersion: VERIFICATION_CONTRACT_VERSION,
    scope,
    fingerprint: args.verificationFingerprint,
  };
}
