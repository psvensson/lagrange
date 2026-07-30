// Content-bound source verification for Quest attempts and terminal handoff.
// Historical attempts keep their legacy prose rule; contracted attempts bind a
// verifier approval to the exact sealed patch payload and terminal approval to
// the current aggregate Git delta over every recorded source path.

import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

import {
  EVENT_ATTEMPT,
  EVENT_FINDING,
  EVENT_REJECTION_DECOMPOSITION,
} from './constants.js';
import {
  changeArtifactIdentity,
  changeArtifactIdentityMatches,
  inspectChangeArtifact,
  requiresSourceVerification,
  parseCommitChangeRef,
} from './change-artifact.js';
import {
  canonicalCommitDelta,
} from './content-addressed-change-artifact.js';
import {
  projectAttemptBaseCorrections,
} from './attempt-base-correction-projection.js';

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
const GIT_STATUS_UNAVAILABLE = Symbol('git_status_unavailable');

export const LEGACY_VERIFICATION_CONTRACT_VERSION = 1;
export const VERIFICATION_CONTRACT_VERSION = 2;
export const VERIFIER_APPROVAL_FINDING_KIND = LOCAL_STR_OWNED_001;
const LOCAL_STR_OWNED_020 = 'verifier-rejection';
const LOCAL_STR_COMMIT_MIXED_AGGREGATE =
  'terminal aggregate mixes commit changeRefs across ranges';
const LOCAL_STR_COMMIT_MIXED_CANDIDATE =
  'landing candidate mixes commit changeRefs across ranges';
const LOCAL_STR_COMMIT_CLAIMED_DIRTY =
  'commit changeRef claimed path(s) have uncommitted changes the ' +
  'pinned receipt does not cover';
export const VERIFIER_REJECTION_FINDING_KIND = LOCAL_STR_OWNED_020;
const VERIFICATION_VERDICT_REJECTED = 'rejected';
export const VERIFICATION_SCOPE = Object.freeze({
  ATTEMPT: LOCAL_STR_OWNED_002,
  CANDIDATE: 'candidate',
  AGGREGATE: LOCAL_STR_OWNED_003,
  BOTH: LOCAL_STR_OWNED_004,
});

const HASH_ALGORITHM = 'sha256';
// Same floor as the amendment excerpt rule, for the same reason: below it a
// "summary" is a token that satisfies the schema while carrying nothing.
const MIN_REJECTION_SUMMARY_LENGTH = 12;
const REJECTION_FINDINGS_REQUIRED_PROBLEM =
  'verifier-rejection requires at least one categorized finding ' +
  '({category, summary}); record the category-complete finding list, ' +
  'never a bare receipt pointer';
const FINGERPRINT_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;

// A recorded base commit that was well-formed when written but no longer
// resolves — the signature of an unpushed local commit discarded with its
// working copy. This is not source drift: the attempt's artifact bytes may be
// byte-identical to what a verifier approved while the commit that named them
// is gone. One typed code, following the `code: prose` convention in
// integrity.js, so every consumer names the condition instead of leaking Git
// stderr. Resolution is never a waiver: a dead-base rejection or receipt is
// discharged only by fresh independent verification of current bytes over the
// same paths at a reachable base.
export const BASE_UNREACHABLE_CODE = 'base_unreachable';
// Bound on the reproducibility diagnostic scan. It is a diagnostic, never a
// gate, so it is capped rather than allowed to walk unbounded history.
const REPRODUCIBILITY_SCAN_LIMIT = 4000;

export function baseCommitReachable(root, baseCommit) {
  if (!COMMIT_PATTERN.test(String(baseCommit || ''))) return false;
  return spawnSync('git', ['cat-file', '-e', `${baseCommit}^{commit}`],
    {cwd: root, encoding: 'utf8'}).status === 0;
}

// Deliberately narrower than `!baseCommitReachable`: an absent or malformed
// base is a different, pre-existing condition ("requires a recorded Git base
// commit") and keeps its own disposition.
export function baseRecordedButUnreachable(root, baseCommit) {
  return COMMIT_PATTERN.test(String(baseCommit || '')) &&
    !baseCommitReachable(root, baseCommit);
}

function baseUnreachableProblem(baseCommit) {
  return `${BASE_UNREACHABLE_CODE}: recorded workspace base commit ` +
    `${baseCommit} does not resolve; current bytes over the recorded paths ` +
    'require fresh independent verification at a reachable base';
}
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

function rawSourceChangingAttempts(root, quest, log, options = {}) {
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
      verificationVersion: event.verificationContractVersion || null,
      contracted: [
        LEGACY_VERIFICATION_CONTRACT_VERSION,
        VERIFICATION_CONTRACT_VERSION,
      ].includes(event.verificationContractVersion),
      candidateContract: event.verificationContractVersion ===
        VERIFICATION_CONTRACT_VERSION,
    });
  }
  return attempts;
}

export function sourceChangingAttempts(root, quest, log, options = {}) {
  return projectAttemptBaseCorrections(
    rawSourceChangingAttempts(root, quest, log, options),
    log,
    {
      validateProof: (correction, attempt) =>
        attemptBaseCorrectionProofProblem(
          root,
          quest,
          correction,
          attempt,
        ),
    },
  ).attempts;
}

export function attemptBaseCorrectionProblems(root, quest, log, options = {}) {
  return projectAttemptBaseCorrections(
    rawSourceChangingAttempts(root, quest, log, options),
    log,
    {
      validateProof: (correction, attempt) =>
        attemptBaseCorrectionProofProblem(
          root,
          quest,
          correction,
          attempt,
        ),
    },
  ).problems;
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
  if (!verification || ![
    LEGACY_VERIFICATION_CONTRACT_VERSION,
    VERIFICATION_CONTRACT_VERSION,
  ].includes(verification.schemaVersion) ||
    verification.fingerprint !== fingerprint) return false;
  return verification.scope === scope || verification.scope === VERIFICATION_SCOPE.BOTH;
}

function structuredRejectionMatches(event, fingerprint) {
  if (event.type !== EVENT_FINDING ||
    event.kind !== VERIFIER_REJECTION_FINDING_KIND ||
    !VERIFIER_EVIDENCE_PATTERN.test(String(event.evidence || ''))) return false;
  const verification = verificationOf(event);
  return verification?.schemaVersion === LEGACY_VERIFICATION_CONTRACT_VERSION &&
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

function rejectionDisposition(log, attempts, attempt, options = {}) {
  const rejection = laterRejection(log, attempt, attempt.fingerprint);
  if (!rejection) return null;
  const replacement = findApprovedRejectionReplacement(
    log,
    attempts,
    attempt,
    rejection.index,
    options,
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
  options = {},
) {
  // The same-base rule is a proxy for the real invariant: a rejection clears
  // only when an independent verifier re-reviews the same content surface.
  // When the rejected base no longer resolves the exact delta cannot be
  // reproduced, but the invariant still can be enforced: accept a replacement
  // at a REACHABLE base whose paths cover every rejected source path and which
  // carries its own later exact approval. The verifier reviews current bytes
  // over each rejected path, which is what the base equality guaranteed.
  const rejectedBaseUnreachable = Boolean(options.root) &&
    baseRecordedButUnreachable(
      options.root, rejectedAttempt.event.workspaceBaseCommit);
  for (const candidate of attempts) {
    const baseAcceptable = rejectedBaseUnreachable ?
      Boolean(options.root) &&
        baseCommitReachable(options.root, candidate.event.workspaceBaseCommit) :
      candidate.event.workspaceBaseCommit ===
        rejectedAttempt.event.workspaceBaseCommit;
    if (candidate.index <= rejectionIndex ||
        !candidate.contracted ||
        candidate.fingerprint === rejectedAttempt.fingerprint ||
        candidate.event.frontier !== rejectedAttempt.event.frontier ||
        !baseAcceptable ||
        !sourcePathSuperset(candidate, rejectedAttempt)) {
      continue;
    }
    const approval = laterApproval(
      log,
      candidate,
      VERIFICATION_SCOPE.ATTEMPT,
      candidate.fingerprint,
    );
    if (approval) {
      return {
        attempt: candidate,
        approval,
        resolution: rejectedBaseUnreachable ?
          'live-base-coverage' : 'same-base',
      };
    }
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
  // Name the dead-base condition before spawning the diff, so no consumer ever
  // sees `fatal: bad object` or mistakes an unresolvable name for source drift.
  if (!baseCommitReachable(root, baseCommit)) {
    return {ok: false, fingerprint: null, content: null,
      code: BASE_UNREACHABLE_CODE, problem: baseUnreachableProblem(baseCommit)};
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

export function attemptBaseCorrectionProofProblem(
  root,
  quest,
  correction,
  attempt,
) {
  const currentIdentity = changeArtifactIdentity(
    root,
    quest.id,
    attempt.event.changeRef,
  );
  if (!changeArtifactIdentityMatches(
    attempt.event.changeRefIdentity,
    currentIdentity,
  )) {
    return 'attempt base correction sealed change artifact has drifted';
  }
  for (const [label, baseCommit] of [
    ['recorded-base', correction.fromBase],
    ['target-base', correction.toBase],
  ]) {
    const delta = canonicalSourceDelta(
      root,
      baseCommit,
      correction.paths,
    );
    if (!delta.ok || delta.fingerprint !== correction.fingerprint) {
      return `attempt base correction ${label} proof does not reproduce ` +
        correction.fingerprint;
    }
  }
  return null;
}

// When every selected attempt names a measurement-only (commit:) changeRef,
// the reviewed delta is the committed tree-to-tree range, not base→working
// tree (which is empty for committed work and would make the quest
// unsealable). Mixed commit+diff attempts, or commit refs spanning more than
// one (base, head) pair, cannot share one honest fingerprint: fail closed
// rather than launder provenance across ranges (parallel-session epic).
// Returns null when the working-tree path should run instead.
function commitRangeFingerprint(root, selected) {
  const refs = selected.map((attempt) =>
    parseCommitChangeRef(attempt.event.changeRef));
  if (refs.some((ref) => ref === null)) return null; // a diff ref is present
  const bases = new Set(refs.map((ref) => ref.base));
  const heads = new Set(refs.map((ref) => ref.head));
  if (bases.size !== 1 || heads.size !== 1) {
    return {mixed: true};
  }
  return {base: refs[0].base, head: refs[0].head};
}

export function aggregateSourceFingerprint(root, attempts) {
  const contracted = attempts.filter((attempt) => attempt.contracted);
  if (contracted.length === 0) {
    return {ok: true, fingerprint: null, content: '', paths: [], baseCommit: null};
  }
  const commitRange = commitRangeFingerprint(root, contracted);
  if (commitRange && commitRange.mixed) {
    return {ok: false, fingerprint: null, content: null, paths: [],
      baseCommit: null,
      problem: LOCAL_STR_COMMIT_MIXED_AGGREGATE};
  }
  if (commitRange) {
    const commitPaths = contracted.flatMap((attempt) =>
      attempt.candidateContract ?
        attempt.inspection.changedPaths : attempt.sourcePaths);
    return {
      ...canonicalCommitDelta(
        root, commitRange.base, commitRange.head, commitPaths),
      baseCommit: commitRange.base,
    };
  }
  // The path union always spans every contracted attempt — dead-base attempts
  // included, so their content surface stays under terminal review — while the
  // delta anchors at the earliest attempt whose recorded base still resolves.
  // Anchoring at an unresolvable name would make the terminal obligation
  // permanently unsatisfiable; anchoring later loses nothing because the union
  // keeps every recorded path in the reviewed delta.
  const paths = contracted.flatMap((attempt) => attempt.candidateContract ?
    attempt.inspection.changedPaths : attempt.sourcePaths);
  const anchor = contracted.find((attempt) =>
    baseCommitReachable(root, attempt.event.workspaceBaseCommit));
  if (!anchor) {
    return {ok: false, fingerprint: null, content: null,
      paths: [...new Set(paths)].sort(), baseCommit: null,
      code: BASE_UNREACHABLE_CODE,
      problem: 'terminal aggregate has no reachable recorded base ' +
        `(${BASE_UNREACHABLE_CODE}); record a fresh same-frontier attempt at ` +
        'a live base covering the recorded paths, then request aggregate ' +
        'verification of current bytes'};
  }
  const baseCommit = anchor.event.workspaceBaseCommit;
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
  const baseCommit = attempt.event.workspaceBaseCommit;
  // A dead base leaves live receipt scope before the no-checkpoint shortcut:
  // its exact receipt can never be recomputed, and the fail-closed branch below
  // would otherwise hold it in scope forever with no checkpoint able to clear
  // it. Its content is still guarded — dirty paths demand fresh covering
  // receipts and the terminal aggregate covers every recorded path.
  if (baseRecordedButUnreachable(root, baseCommit)) return false;
  if (!checkpointCommit) return true;
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
    attempt.verificationVersion === LEGACY_VERIFICATION_CONTRACT_VERSION &&
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

export function candidateReceiptOf(event) {
  const verification = verificationOf(event);
  if (event.type !== EVENT_FINDING ||
    verification?.schemaVersion !== VERIFICATION_CONTRACT_VERSION ||
    ![VERIFICATION_SCOPE.CANDIDATE, VERIFICATION_SCOPE.BOTH]
      .includes(verification.scope) ||
    !validVerificationFingerprint(verification.fingerprint) ||
    !/^[0-9a-f]{40}$/u.test(String(verification.baseCommit || '')) ||
    !Array.isArray(verification.paths) ||
    !Number.isInteger(verification.firstAttemptIndex) ||
    !Number.isInteger(verification.lastAttemptIndex)) return null;
  return verification;
}

function buildLandingCandidate(root, quest, attempts) {
  const checkpointCommit = latestCheckpointCommit(root, quest.id);
  // Dead-base attempts stay selected. Dropping them would collapse the
  // candidate and silently discard any standing candidate-scope rejection that
  // covers them; keeping them means their paths remain in the reviewed union
  // and their rejections stay inside the candidate's log-scan range. Their
  // ancestry is unknowable, so they are kept for coverage rather than filtered
  // by a probe that cannot answer.
  const selected = attempts.filter((attempt) =>
    attempt.candidateContract &&
    (baseRecordedButUnreachable(root, attempt.event.workspaceBaseCommit) ||
      attemptIsAfterCheckpoint(root, attempt, checkpointCommit)));
  if (selected.length === 0) {
    return {ok: true, fingerprint: null, content: '', paths: [],
      sourcePaths: [], baseCommit: null, attempts: [],
      firstAttemptIndex: null, lastAttemptIndex: null};
  }
  const paths = [...new Set(selected.flatMap((attempt) =>
    attempt.inspection.changedPaths))].sort();
  const sourcePaths = [...new Set(selected.flatMap((attempt) =>
    attempt.sourcePaths))].sort();
  const shared = {
    paths,
    sourcePaths,
    attempts: selected,
    firstAttemptIndex: selected[0].index,
    lastAttemptIndex: selected[selected.length - 1].index,
  };
  const commitRange = commitRangeFingerprint(root, selected);
  if (commitRange && commitRange.mixed) {
    return {ok: false, fingerprint: null, content: null, ...shared,
      baseCommit: null,
      problem: LOCAL_STR_COMMIT_MIXED_CANDIDATE};
  }
  if (commitRange) {
    return {
      ...canonicalCommitDelta(root, commitRange.base, commitRange.head, paths),
      ...shared,
      baseCommit: commitRange.base,
    };
  }
  // Anchor the delta at the one reachable recorded base. Dead bases cannot
  // anchor a delta, but the union above keeps every recorded path under the
  // anchored review, so anchoring at the reachable base loses nothing.
  const reachableBases = [...new Set(selected
    .map((attempt) => attempt.event.workspaceBaseCommit)
    .filter((base) => baseCommitReachable(root, base)))];
  if (reachableBases.length === 0) {
    return {ok: false, fingerprint: null, content: null, ...shared,
      baseCommit: null, code: BASE_UNREACHABLE_CODE,
      problem: 'landing candidate has no reachable recorded base ' +
        `(${BASE_UNREACHABLE_CODE}); record a fresh same-frontier attempt at ` +
        `a live base covering: ${paths.join(', ')}`};
  }
  if (reachableBases.length !== 1 ||
    !/^[0-9a-f]{40}$/u.test(String(reachableBases[0] || ''))) {
    return {ok: false, fingerprint: null, content: null, ...shared,
      baseCommit: reachableBases[0] || null,
      problem: 'landing candidate requires one recorded common Git base'};
  }
  return {
    ...canonicalSourceDelta(root, reachableBases[0], paths),
    ...shared,
    baseCommit: reachableBases[0],
  };
}

function receiptMatchesProjection(receipt, projection) {
  return receipt && projection?.ok &&
    receipt.fingerprint === projection.fingerprint &&
    receipt.baseCommit === projection.baseCommit &&
    receipt.firstAttemptIndex === projection.firstAttemptIndex &&
    receipt.lastAttemptIndex === projection.lastAttemptIndex &&
    JSON.stringify([...receipt.paths].sort()) ===
      JSON.stringify([...(projection.paths || [])].sort());
}

function validCandidateReceipt(receipt, fingerprint) {
  return receipt && receipt.fingerprint === fingerprint &&
    /^[0-9a-f]{40}$/u.test(String(receipt.baseCommit || '')) &&
    Array.isArray(receipt.paths) && receipt.paths.length > 0 &&
    Array.isArray(receipt.sourcePaths) &&
    Number.isInteger(receipt.firstAttemptIndex) &&
    Number.isInteger(receipt.lastAttemptIndex) &&
    receipt.firstAttemptIndex <= receipt.lastAttemptIndex;
}

function candidateVerificationState(root, log, candidate) {
  if (!candidate.ok) {
    const anchor = candidate.attempts.at(-1);
    return {
      approval: null,
      rejection: null,
      unresolvedRejection: null,
      problems: anchor ? [attemptProblem(
        anchor,
        candidate.problem || 'could not construct a valid landing candidate',
      )] : [{
        message: candidate.problem || 'could not construct a valid landing candidate',
        ts: null,
        frontier: null,
      }],
    };
  }
  if (!candidate.fingerprint) {
    return {approval: null, rejection: null, unresolvedRejection: null, problems: []};
  }
  let approval = null;
  let rejection = null;
  for (const event of log.slice(candidate.firstAttemptIndex + 1)) {
    const receipt = candidateReceiptOf(event);
    if (!receipt || !VERIFIER_EVIDENCE_PATTERN.test(String(event.evidence || ''))) continue;
    if (event.kind === VERIFIER_REJECTION_FINDING_KIND &&
      receipt.verdict === VERIFICATION_VERDICT_REJECTED) rejection = {event, receipt};
    if (event.kind === VERIFIER_APPROVAL_FINDING_KIND &&
      receiptMatchesProjection(receipt, candidate)) approval = {event, receipt};
  }
  let unresolvedRejection = null;
  const problems = [];
  if (rejection) {
    const problem = candidateRejectionProblem(root, candidate, rejection, log);
    if (problem) {
      unresolvedRejection = rejection;
      problems.push(problem);
    }
  }
  return {approval, rejection, unresolvedRejection, problems};
}

// Paths of a standing candidate rejection already discharged by recorded
// decomposition coverage: typed append-only events, each naming the exact
// rejected fingerprint it discharges and the approval receipt that covered a
// subset of its paths. Coverage is re-validated live, exactly like approvals:
// an event contributes only while the recorded approval fingerprint still
// reproduces from current bytes over its full contribution path set, so bytes
// drifting after a decomposition was recorded re-open the obligation instead
// of leaving drifted content discharged unreviewed. Events missing the
// contribution receipt fields are ignored (fail-closed); events for other
// fingerprints never contribute.
export function rejectionDecompositionCoverage(root, log, rejection) {
  const covered = new Set();
  for (const event of log) {
    if (event.type !== EVENT_REJECTION_DECOMPOSITION ||
      event.rejectedFingerprint !== rejection.receipt.fingerprint ||
      !Array.isArray(event.coveredPaths) ||
      !Array.isArray(event.contributionPaths) ||
      !validVerificationFingerprint(event.approvalFingerprint)) continue;
    const live = canonicalSourceDelta(
      root, event.approvalBaseCommit, event.contributionPaths);
    if (!live.ok || live.fingerprint !== event.approvalFingerprint) continue;
    for (const filePath of event.coveredPaths) covered.add(filePath);
  }
  return covered;
}

// Same-base is the strict rule; when the rejected receipt's base no longer
// resolves, the equality is unsatisfiable by construction, so the same
// invariant is enforced at a reachable base instead: a later, different
// candidate covering every rejected path — which still needs its own exact
// approval before anything lands. Nothing is waived; the review moves to
// current bytes. Recorded decomposition coverage shrinks the obligation
// path-by-path, so a rejection can also be discharged by bounded pieces
// (including a successor quest's approved candidate) instead of one
// ever-growing superset replacement. Returns null when the rejection is
// resolved.
function candidateRejectionProblem(root, candidate, rejection, log = []) {
  const covered = rejectionDecompositionCoverage(root, log, rejection);
  const remainingPaths = rejection.receipt.paths.filter(
    (filePath) => !covered.has(filePath));
  if (remainingPaths.length === 0) return null;
  const replacementPaths = new Set(candidate.paths || []);
  const rejectedBaseDead = baseRecordedButUnreachable(
    root, rejection.receipt.baseCommit);
  const baseAcceptable = rejectedBaseDead ?
    baseCommitReachable(root, candidate.baseCommit) :
    candidate.baseCommit === rejection.receipt.baseCommit;
  const replaced = baseAcceptable &&
    candidate.fingerprint !== rejection.receipt.fingerprint &&
    candidate.lastAttemptIndex > rejection.receipt.lastAttemptIndex &&
    remainingPaths.every((filePath) => replacementPaths.has(filePath));
  if (replaced) return null;
  const remainingDetail = covered.size > 0 ?
    ` covering the remaining rejected paths: ${remainingPaths.join(', ')}` :
    '';
  return {
    message: rejectedBaseDead ?
      `landing candidate rejection anchored at a ${BASE_UNREACHABLE_CODE} ` +
        'base requires a later changed-fingerprint path-superset candidate ' +
        `at a reachable base${remainingDetail}` :
      'landing candidate rejection requires a later same-base, ' +
        `changed-fingerprint path-superset candidate${remainingDetail}`,
    ts: rejection.event.ts || null,
    frontier: rejection.event.frontier || null,
  };
}

// Direct the operator at the rule that can actually be satisfied: the
// same-base form when the rejected base still resolves, the live-base coverage
// form when it does not.
function unresolvedRejectionEntry(root, attempt, rejection) {
  const deadBase = baseRecordedButUnreachable(
    root, attempt.event.workspaceBaseCommit);
  return {
    problem: attemptProblem(
      attempt,
      deadBase ?
        `was explicitly rejected at ${attempt.fingerprint} and its recorded ` +
          `base is ${BASE_UNREACHABLE_CODE}; requires a later same-frontier ` +
          'source attempt at a reachable base covering every rejected ' +
          'source path plus its own later exact approval' :
        `was explicitly rejected at ${attempt.fingerprint}; requires a later ` +
          LOCAL_STR_OWNED_017 +
          LOCAL_STR_OWNED_018,
    ),
    entry: {
      attempt,
      rejection: rejection.rejection.event,
      baseUnreachable: deadBase,
    },
  };
}

export function verificationState(root, quest, log, options = {}) {
  const attempts = sourceChangingAttempts(root, quest, log, options);
  const correctionProblems = attemptBaseCorrectionProblems(
    root,
    quest,
    log,
    options,
  );
  const attemptProblems = correctionProblems.map((message) => ({
    message,
    ts: null,
    frontier: null,
  }));
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
    if (attempt.candidateContract) continue;
    const rejection = rejectionDisposition(log, attempts, attempt, {root});
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
      const unresolved = unresolvedRejectionEntry(root, attempt, rejection);
      attemptProblems.push(unresolved.problem);
      unresolvedRejectedAttempts.push(unresolved.entry);
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

  const candidate = buildLandingCandidate(root, quest, attempts);
  const candidateState = candidateVerificationState(root, log, candidate);
  attemptProblems.push(...candidateState.problems);

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
  // Visibility, not behavior: dead-base attempts must stay reported after
  // their obligations resolve elsewhere, or the Quest would read clean while
  // an unverifiable receipt sits in its history. Every disposition above is
  // unchanged by this projection.
  const baseUnreachableAttempts = attempts
    .filter((attempt) => attempt.contracted &&
      baseRecordedButUnreachable(root, attempt.event.workspaceBaseCommit))
    .map((attempt) => ({
      attempt,
      code: BASE_UNREACHABLE_CODE,
      baseCommit: attempt.event.workspaceBaseCommit,
      liveReceiptVerifiable: false,
      countsAsVerification: false,
    }));
  const state = {
    attempts,
    pendingAttempts,
    attemptProblems,
    aggregate,
    aggregateApproval,
    aggregateProblems,
    resolvedRejectedAttempts,
    unresolvedRejectedAttempts,
    baseUnreachableAttempts,
    candidate,
    candidateApproval: candidateState.approval,
    candidateRejection: candidateState.rejection,
    unresolvedCandidateRejection: candidateState.unresolvedRejection,
    attemptBaseCorrectionProblems: correctionProblems,
  };
  return {
    ...state,
    uncheckpointedApprovedAttempts:
      findUncheckpointedApprovedAttempts(root, quest, log, state),
  };
}

function isCommitAttempt(attempt) {
  return parseCommitChangeRef(attempt.event.changeRef) !== null;
}

function checkpointCoveredPaths(state) {
  const uncheckpointed = state.uncheckpointedApprovedAttempts;
  const coveredPaths = new Set(uncheckpointed.flatMap(
    (attempt) => attempt.inspection.changedPaths));
  if (state.candidateApproval) {
    for (const filePath of state.candidate.paths) coveredPaths.add(filePath);
  }
  return coveredPaths;
}

function dirtyCheckpointPathProblems(root, contracted, coveredPaths) {
  const problems = [];
  // A measurement-only (commit:) changeRef is pinned by sha: its claimed paths
  // are SUPPOSED to differ from the working tree once committed, so the
  // base→working-tree dirty check and the live base→tree receipt re-check do
  // not apply. Cleanliness for commit refs is enforced at record time (the
  // claimed paths must be clean and head an ancestor of HEAD when sealed).
  const allAttemptPaths = contracted.flatMap((attempt) =>
    isCommitAttempt(attempt) ? [] : attempt.inspection.changedPaths);
  const dirtyPaths = dirtyPathsSinceHead(root, allAttemptPaths);
  const anchor = [...contracted].reverse()[0];
  if (dirtyPaths === null && anchor && allAttemptPaths.length > 0) {
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
  return problems;
}

function dirtyCommitClaimProblems(root, contracted) {
  const problems = [];
  // Commit-ref claimed paths are pinned by sha, but a later edit to one of
  // them at HEAD is not covered by the pinned receipt — surface it (the
  // handoff scope classifier catches source paths; this catches the rest).
  for (const attempt of contracted) {
    if (!isCommitAttempt(attempt)) continue;
    const claimed = attempt.inspection.changedPaths || [];
    if (claimed.length === 0) continue;
    const status = spawnSync('git', ['status', '--porcelain', '--', ...claimed],
      {cwd: root, encoding: 'utf8'});
    if (status.status === 0 && String(status.stdout || '').trim() !== '') {
      problems.push(attemptProblem(
        attempt,
        LOCAL_STR_COMMIT_CLAIMED_DIRTY,
      ));
    }
  }
  return problems;
}

function liveAttemptReceiptProblems(root, uncheckpointed) {
  const problems = [];
  for (const attempt of uncheckpointed) {
    if (isCommitAttempt(attempt)) continue; // pinned by sha; see note above
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

// This is the verification slice of the narrow checkpoint gate. Keep it pure over
// the supplied log so checkpoint preflight can evaluate a copied approval projection.
export function checkpointVerificationProblems(root, quest, log, options = {}) {
  const state = verificationState(root, quest, log, options);
  if (state.attemptProblems.length > 0) return state.attemptProblems;
  const problems = [];
  if (state.candidate?.fingerprint) {
    if (!state.candidate.ok) {
      problems.push(attemptProblem(
        state.candidate.attempts.at(-1), state.candidate.problem));
    } else if (!state.candidateApproval) {
      problems.push(attemptProblem(
        state.candidate.attempts.at(-1),
        `landing candidate requires exact approval for ${state.candidate.fingerprint}`));
    }
  }
  const uncheckpointed = state.uncheckpointedApprovedAttempts;
  const contracted = state.attempts.filter((attempt) => attempt.contracted);
  const coveredPaths = checkpointCoveredPaths(state);
  problems.push(
    ...dirtyCheckpointPathProblems(root, contracted, coveredPaths),
    ...dirtyCommitClaimProblems(root, contracted),
    ...liveAttemptReceiptProblems(root, uncheckpointed),
  );
  return problems;
}

/**
 * Diagnostic: can any reachable commit reproduce this attempt's recorded
 * fingerprint against the current tree? Reports how many commits qualify and
 * the scan bound, and deliberately never names a substitute base: on this
 * repository 823 of 2926 reachable commits reproduced one sampled attempt's
 * fingerprint, so naming one would assert a provenance the measurement cannot
 * support. Unmeasured outcomes report null, never false — a false negative
 * misleads exactly as much as a false positive.
 * @param {string} root - repository root.
 * @param {object} attemptEvent - the recorded attempt event.
 * @param {string[]} paths - the attempt's recorded changed paths.
 * @param {object} options - optional scan `limit`.
 * @returns {{reproducible: boolean|null, candidatesFound: number|null,
 *   commitsScanned: number, scanTruncated: boolean, unprobedReason: string|null}}
 */
export function probeBaseReproducibility(root, attemptEvent, paths, options = {}) {
  const limit = Number.isInteger(options.limit) ?
    options.limit : REPRODUCIBILITY_SCAN_LIMIT;
  const fingerprint = attemptFingerprint(attemptEvent);
  if (!fingerprint) {
    return {reproducible: null, candidatesFound: null, commitsScanned: 0,
      scanTruncated: false, unprobedReason: 'attempt has no sealed fingerprint'};
  }
  // Scan every ref, not only HEAD: a reproducing commit may sit on a branch or
  // a remote-tracking ref, and a HEAD-only walk reported as a complete scan
  // would understate the search.
  const listed = spawnSync('git', ['log', '--all', '--format=%H'],
    {cwd: root, encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER_BYTES});
  if (listed.status !== 0) {
    return {reproducible: null, candidatesFound: null, commitsScanned: 0,
      scanTruncated: false, unprobedReason: 'git could not enumerate commits'};
  }
  const commits = String(listed.stdout || '')
    .split(LOCAL_STR_OWNED_007).filter(Boolean);
  const scanned = commits.slice(0, limit);
  let candidatesFound = 0;
  for (const commit of scanned) {
    const delta = canonicalSourceDelta(root, commit, paths);
    if (delta.ok && delta.fingerprint === fingerprint) candidatesFound += 1;
  }
  return {
    reproducible: candidatesFound > 0,
    candidatesFound,
    commitsScanned: scanned.length,
    scanTruncated: commits.length > scanned.length,
    unprobedReason: null,
  };
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
  if (isRejection && ![
    VERIFICATION_SCOPE.ATTEMPT,
    VERIFICATION_SCOPE.CANDIDATE,
  ].includes(scope)) {
    throw new Error(
      'verifier-rejection requires --verification-scope attempt|candidate');
  }
  if (!validVerificationFingerprint(args.verificationFingerprint)) {
    throw new Error(
      `${label} requires --verification-fingerprint sha256:<64 hex>`,
    );
  }
  // A rejection without categorized findings is a pointer, not evidence: the
  // reasons live only in the verifier session that produced them, so the
  // durable log cannot support amendments, --from-rejection theories, or any
  // later post-mortem. Category-complete content is required at record time.
  let rejectionFindings = null;
  if (isRejection) {
    const findings = Array.isArray(args.rejectionFindings) ?
      args.rejectionFindings : [];
    const wellFormed = findings.length > 0 && findings.every((finding) =>
      finding && typeof finding.category === 'string' && finding.category &&
      typeof finding.summary === 'string' &&
      finding.summary.length >= MIN_REJECTION_SUMMARY_LENGTH);
    if (!wellFormed) {
      throw new Error(REJECTION_FINDINGS_REQUIRED_PROBLEM);
    }
    rejectionFindings = findings.map(
      ({category, summary}) => ({category, summary}));
  }
  const schemaVersion = args.verificationSchemaVersion ||
    (scope === VERIFICATION_SCOPE.CANDIDATE ?
      VERIFICATION_CONTRACT_VERSION : LEGACY_VERIFICATION_CONTRACT_VERSION);
  const receipt = args.verificationReceipt || null;
  if (schemaVersion === VERIFICATION_CONTRACT_VERSION &&
    scope === VERIFICATION_SCOPE.CANDIDATE && !validCandidateReceipt(
    receipt, args.verificationFingerprint)) {
    throw new Error('candidate verification requires a complete current receipt');
  }
  return {
    schemaVersion,
    scope,
    fingerprint: args.verificationFingerprint,
    ...(schemaVersion === VERIFICATION_CONTRACT_VERSION && receipt ? {
      baseCommit: receipt.baseCommit,
      paths: [...receipt.paths].sort(),
      sourcePaths: [...(receipt.sourcePaths || [])].sort(),
      firstAttemptIndex: receipt.firstAttemptIndex,
      lastAttemptIndex: receipt.lastAttemptIndex,
    } : {}),
    ...(isRejection ? {
      verdict: VERIFICATION_VERDICT_REJECTED,
      findings: rejectionFindings,
    } : {}),
  };
}
