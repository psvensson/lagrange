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
  EVENT_EPOCH_REBASED,
} from './constants.js';
import {
  changeArtifactIdentity,
  changeArtifactIdentityMatches,
  inspectChangeArtifact,
  isVerificationBookkeeping,
  requiresSourceVerification,
  parseCommitChangeRef,
} from './change-artifact.js';
import {isRegisteredGeneratedOutput} from './generated-dependencies.js';
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
const UNTRACKED_PATHS_SEPARATOR = ', ';
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
// Contract version 3: registered generated outputs (generated-dependencies.js)
// are landing collateral — excluded from attempt artifacts, reviewed paths and
// verification fingerprints, and regenerated at the landing tree instead.
// Gating is per recorded event: attempts stamped 2 keep byte semantics
// forever, so historical approvals are never reinterpreted.
export const COLLATERAL_VERIFICATION_CONTRACT_VERSION =
  VERIFICATION_CONTRACT_VERSION + 1;

export function attemptContractExcludesCollateral(version) {
  return Number.isInteger(version) &&
    version >= COLLATERAL_VERIFICATION_CONTRACT_VERSION;
}

export function questContractExcludesCollateral(quest) {
  return attemptContractExcludesCollateral(quest?.verificationContractVersion);
}
export const VERIFIER_APPROVAL_FINDING_KIND = LOCAL_STR_OWNED_001;
const LOCAL_STR_OWNED_020 = 'verifier-rejection';
const LOCAL_STR_COMMIT_MIXED_AGGREGATE =
  'terminal aggregate mixes commit changeRefs across ranges';
const LOCAL_STR_COMMIT_MIXED_CANDIDATE =
  'landing candidate mixes commit changeRefs across ranges';
const LOCAL_STR_COMMIT_CLAIMED_DIRTY =
  'commit changeRef claimed path(s) have uncommitted changes the ' +
  'pinned receipt does not cover';
const SOURCE_VERIFICATION_GIT_DIFF_FAILED_PREFIX =
  'source verification Git diff failed: ';
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
const SOURCE_EPOCH_PATH_SEPARATOR = ', ';
const SOURCE_EPOCH_DRIFT_PREFIX =
  'source epoch changed reviewed path(s) in an intervening commit: ';
const SOURCE_EPOCH_DRIFT_ACTION =
  '; checkpoint or land before committing reviewed source';
const SOURCE_EPOCH_INSPECTION_PROBLEM =
  'source epoch could not verify committed path drift; checkpoint or land ' +
  'the active Quest before changing repository history';
const arrayFilter = Function.call.bind(Array.prototype.filter);
const arrayFind = Function.call.bind(Array.prototype.find);
const arrayAt = Function.call.bind(Array.prototype.at);
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayJoin = Function.call.bind(Array.prototype.join);
const arrayMap = Function.call.bind(Array.prototype.map);
const arrayPush = Function.call.bind(Array.prototype.push);
const arrayReverse = Function.call.bind(Array.prototype.reverse);
const arraySlice = Function.call.bind(Array.prototype.slice);
const arraySome = Function.call.bind(Array.prototype.some);
const setHas = Function.call.bind(Set.prototype.has);
const setAdd = Function.call.bind(Set.prototype.add);
const arraySort = Function.call.bind(Array.prototype.sort);
const arrayIsArray = Array.isArray;
const numberIsInteger = Number.isInteger;
const objectCreate = Object.create;
const objectHasOwn = Function.call.bind(Object.prototype.hasOwnProperty);
const objectValues = Object.values;
const jsonStringify = JSON.stringify;
const regExpTest = Function.call.bind(RegExp.prototype.test);
const stringSplit = Function.call.bind(String.prototype.split);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);
const stringTrim = Function.call.bind(String.prototype.trim);
const SetConstructor = Set;

function appendAll(target, source) {
  for (let index = 0; index < source.length; index += 1) {
    arrayPush(target, source[index]);
  }
  return target;
}

function capturedSet(values = []) {
  const result = new SetConstructor();
  for (let index = 0; index < values.length; index += 1) {
    setAdd(result, values[index]);
  }
  return result;
}

function findAfter(values, firstIndex, predicate) {
  for (let index = firstIndex; index < values.length; index += 1) {
    if (predicate(values[index], index)) return values[index];
  }
  return undefined;
}

function collectAttemptPaths(attempts, selectPaths) {
  const groups = [];
  for (let index = 0; index < attempts.length; index += 1) {
    arrayPush(groups, selectPaths(attempts[index]));
  }
  return uniqueSortedPathGroups(groups);
}

function uniqueSortedPathGroups(pathGroups) {
  const seen = objectCreate(null);
  const paths = [];
  for (let groupIndex = 0; groupIndex < pathGroups.length; groupIndex += 1) {
    const group = pathGroups[groupIndex] || [];
    for (let pathIndex = 0; pathIndex < group.length; pathIndex += 1) {
      const filePath = group[pathIndex];
      if (objectHasOwn(seen, filePath)) continue;
      seen[filePath] = true;
      arrayPush(paths, filePath);
    }
  }
  return arraySort(paths);
}

function uniqueSortedPathUnion(left, right) {
  return uniqueSortedPathGroups([left, right]);
}

export function baseCommitReachable(root, baseCommit) {
  if (!regExpTest(COMMIT_PATTERN, String(baseCommit || ''))) return false;
  return spawnSync('git', ['cat-file', '-e', `${baseCommit}^{commit}`],
    {cwd: root, encoding: 'utf8'}).status === 0;
}

// Deliberately narrower than `!baseCommitReachable`: an absent or malformed
// base is a different, pre-existing condition ("requires a recorded Git base
// commit") and keeps its own disposition.
export function baseRecordedButUnreachable(root, baseCommit) {
  return regExpTest(COMMIT_PATTERN, String(baseCommit || '')) &&
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
  return typeof sha256 === 'string' && regExpTest(/^[0-9a-f]{64}$/u, sha256) ?
    `sha256:${sha256}` : null;
}

export function validVerificationFingerprint(value) {
  return typeof value === 'string' && regExpTest(FINGERPRINT_PATTERN, value);
}

export function attemptFingerprint(event) {
  return event?.sourceVerificationFingerprint ||
    formatVerificationFingerprint(event?.changeRefIdentity?.sha256);
}

export function resolveWorkspaceBaseCommit(root) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) return null;
  const sha = stringTrim(String(result.stdout || ''));
  return regExpTest(/^[0-9a-f]{40}$/u, sha) ? sha : null;
}

function reviewedChangePaths(inspection, questId, contractVersion) {
  const paths = arrayFilter(
    inspection?.changedPaths || [],
    (filePath) => !isVerificationBookkeeping(filePath, questId),
  );
  if (!attemptContractExcludesCollateral(contractVersion)) return paths;
  return arrayFilter(paths,
    (filePath) => !isRegisteredGeneratedOutput(filePath));
}

export function sourceVerificationFingerprint(root, quest, event) {
  const inspection = inspectChangeArtifact(root, quest, event.changeRef);
  const reviewPaths = reviewedChangePaths(
    inspection, quest.id, event.verificationContractVersion);
  if (parseCommitChangeRef(event.changeRef)) {
    return formatVerificationFingerprint(event?.changeRefIdentity?.sha256);
  }
  const live = canonicalSourceDelta(
    root,
    event.workspaceBaseCommit,
    reviewPaths,
  );
  return live.ok ? live.fingerprint :
    formatVerificationFingerprint(event?.changeRefIdentity?.sha256);
}

// The recorded epoch boundary: attempts recorded before the latest
// `epoch-rebased` event belong to a retired epoch. They stay in the
// projection for visibility and for the rejections that still bind them,
// but never anchor a candidate or aggregate and never count as verification.
export function latestEpochRebaseIndex(log) {
  let latest = -1;
  for (let index = 0; index < (log || []).length; index += 1) {
    if (log[index].type === EVENT_EPOCH_REBASED) latest = index;
  }
  return latest;
}

export function latestEpochRebase(log) {
  const index = latestEpochRebaseIndex(log);
  return index >= 0 ? log[index] : null;
}

function retiredPathsUnion(log) {
  const union = [];
  for (let index = 0; index < (log || []).length; index += 1) {
    const event = log[index];
    if (event.type !== EVENT_EPOCH_REBASED) continue;
    const paths = arrayIsArray(event.retiredPaths) ? event.retiredPaths : [];
    for (let pathIndex = 0; pathIndex < paths.length; pathIndex += 1) {
      if (!arrayIncludes(union, paths[pathIndex])) arrayPush(union, paths[pathIndex]);
    }
  }
  return arraySort(union);
}

export function baseRetiredByEpochRebase(log, baseCommit) {
  if (!baseCommit) return false;
  return arraySome(log || [], (event) =>
    event.type === EVENT_EPOCH_REBASED && event.fromBase === baseCommit);
}

function rawSourceChangingAttempts(root, quest, log, options = {}) {
  const startIndex = options.startIndex || 0;
  const rebaseIndex = latestEpochRebaseIndex(log);
  const attempts = [];
  for (let index = 0; index < log.length; index += 1) {
    const event = log[index];
    if (index < startIndex || event.type !== EVENT_ATTEMPT) continue;
    const inspection = inspectChangeArtifact(root, quest, event.changeRef);
    const reviewPaths = reviewedChangePaths(
      inspection, quest.id, event.verificationContractVersion);
    const sourcePaths = arrayFilter(reviewPaths, requiresSourceVerification);
    if (sourcePaths.length === 0) continue;
    arrayPush(attempts, {
      index,
      event,
      inspection,
      reviewPaths,
      sourcePaths,
      fingerprint: attemptFingerprint(event),
      verificationVersion: event.verificationContractVersion || null,
      excludesCollateral: attemptContractExcludesCollateral(
        event.verificationContractVersion),
      contracted: arrayIncludes(
        [LEGACY_VERIFICATION_CONTRACT_VERSION, VERIFICATION_CONTRACT_VERSION,
          COLLATERAL_VERIFICATION_CONTRACT_VERSION],
        event.verificationContractVersion,
      ),
      candidateContract: arrayIncludes(
        [VERIFICATION_CONTRACT_VERSION,
          COLLATERAL_VERIFICATION_CONTRACT_VERSION],
        event.verificationContractVersion,
      ),
      retired: index < rebaseIndex,
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
    !regExpTest(VERIFIER_EVIDENCE_PATTERN, String(event.evidence || ''))) return false;
  const verification = verificationOf(event);
  if (!verification || !arrayIncludes([
    LEGACY_VERIFICATION_CONTRACT_VERSION,
    VERIFICATION_CONTRACT_VERSION,
  ], verification.schemaVersion) ||
    verification.fingerprint !== fingerprint) return false;
  return verification.scope === scope || verification.scope === VERIFICATION_SCOPE.BOTH;
}

function structuredRejectionMatches(event, fingerprint) {
  if (event.type !== EVENT_FINDING ||
    event.kind !== VERIFIER_REJECTION_FINDING_KIND ||
    !regExpTest(VERIFIER_EVIDENCE_PATTERN, String(event.evidence || ''))) return false;
  const verification = verificationOf(event);
  return verification?.schemaVersion === LEGACY_VERIFICATION_CONTRACT_VERSION &&
    verification.scope === VERIFICATION_SCOPE.ATTEMPT &&
    verification.fingerprint === fingerprint &&
    verification.verdict === VERIFICATION_VERDICT_REJECTED;
}

function legacyApprovalMatches(event, frontier) {
  if (event.type !== EVENT_FINDING || event.frontier !== frontier ||
    !stringStartsWith(String(event.evidence || ''), LOCAL_STR_OWNED_006)) return false;
  return event.kind === VERIFIER_APPROVAL_FINDING_KIND ||
    regExpTest(LEGACY_APPROVAL_PATTERN, String(event.claim || ''));
}

function laterApproval(log, attempt, scope, fingerprint) {
  return findAfter(log, attempt.index + 1, (event) =>
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
  const candidatePaths = capturedSet(candidate.sourcePaths);
  return arrayEvery(rejected.sourcePaths,
    (filePath) => setHas(candidatePaths, filePath));
}

function checkpointPathSuperset(candidate, superseded) {
  const candidatePaths = capturedSet(candidate.reviewPaths);
  return arrayEvery(superseded.reviewPaths,
    (filePath) => setHas(candidatePaths, filePath),
  );
}

function approvedCheckpointReplacement(log, attempts, superseded) {
  for (let index = 0; index < attempts.length; index += 1) {
    const candidate = attempts[index];
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
  // A retired epoch is the same case as a dead base: the exact delta cannot
  // be re-anchored, so the rejection transfers to the live-base coverage rule.
  const rejectedBaseUnreachable = rejectedAttempt.retired === true ||
    (Boolean(options.root) &&
    baseRecordedButUnreachable(
      options.root, rejectedAttempt.event.workspaceBaseCommit));
  for (let index = 0; index < attempts.length; index += 1) {
    const candidate = attempts[index];
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

// The untracked paths under `paths`, GIT_STATUS_UNAVAILABLE when git status
// itself failed. Returning the offending paths (not a boolean) lets the
// caller name them and lets the landing workflow repair them (C7).
function gitStatusUntrackedPaths(root, paths) {
  const gitArguments = ['status', '--porcelain', '--'];
  appendAll(gitArguments, paths);
  const result = spawnSync('git', gitArguments, {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) return GIT_STATUS_UNAVAILABLE;
  const offending = [];
  for (const line of stringSplit(
    String(result.stdout || ''), LOCAL_STR_OWNED_007)) {
    if (stringStartsWith(line, LOCAL_STR_OWNED_008)) {
      offending.push(stringTrim(line.slice(LOCAL_STR_OWNED_008.length)));
    }
  }
  return offending;
}

export function canonicalSourceDelta(root, baseCommit, paths) {
  const sortedPaths = uniqueSortedPathGroups([paths]);
  if (!regExpTest(/^[0-9a-f]{40}$/u, String(baseCommit || ''))) {
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
  const untracked = gitStatusUntrackedPaths(root, sortedPaths);
  if (untracked === GIT_STATUS_UNAVAILABLE) {
    return {ok: false, fingerprint: null, content: null,
      problem: LOCAL_STR_OWNED_010};
  }
  if (untracked.length > 0) {
    return {ok: false, fingerprint: null, content: null,
      untrackedPaths: untracked,
      problem: `${LOCAL_STR_OWNED_011}: ` +
        arrayJoin(untracked, UNTRACKED_PATHS_SEPARATOR)};
  }
  const gitArguments = [
    'diff', '--binary', '--full-index', '--no-ext-diff', baseCommit,
    '--',
  ];
  appendAll(gitArguments, sortedPaths);
  const result = spawnSync('git', gitArguments, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: GIT_MAX_BUFFER_BYTES,
  });
  if (result.status !== 0 || typeof result.stdout !== 'string') {
    return {ok: false, fingerprint: null, content: null,
      problem: SOURCE_VERIFICATION_GIT_DIFF_FAILED_PREFIX +
        stringTrim(String(result.stderr || ''))};
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
  const bases = [
    ['recorded-base', correction.fromBase],
    ['target-base', correction.toBase],
  ];
  for (let index = 0; index < bases.length; index += 1) {
    const label = bases[index][0];
    const baseCommit = bases[index][1];
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
  const refs = arrayMap(selected, (attempt) =>
    parseCommitChangeRef(attempt.event.changeRef));
  if (arraySome(refs, (ref) => ref === null)) return null; // a diff ref is present
  const bases = capturedSet(arrayMap(refs, (ref) => ref.base));
  const heads = capturedSet(arrayMap(refs, (ref) => ref.head));
  if (bases.size !== 1 || heads.size !== 1) {
    return {mixed: true};
  }
  return {base: refs[0].base, head: refs[0].head};
}

export function aggregateSourceFingerprint(root, attempts) {
  const contracted = arrayFilter(attempts,
    (attempt) => attempt.contracted && attempt.retired !== true);
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
    const commitPaths = collectAttemptPaths(contracted, (attempt) =>
      attempt.candidateContract ? attempt.reviewPaths : attempt.sourcePaths);
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
  const paths = collectAttemptPaths(contracted, (attempt) =>
    attempt.candidateContract ? attempt.reviewPaths : attempt.sourcePaths);
  const anchor = arrayFind(contracted, (attempt) =>
    baseCommitReachable(root, attempt.event.workspaceBaseCommit));
  if (!anchor) {
    return {ok: false, fingerprint: null, content: null,
      paths, baseCommit: null,
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
  const lines = stringSplit(String(result.stdout || ''), LOCAL_STR_OWNED_007);
  for (let index = 0; index < lines.length; index += 1) {
    const fields = stringSplit(lines[index], LOCAL_STR_OWNED_013, 2);
    const commit = fields[0];
    const subject = fields[1] || '';
    if (regExpTest(/^[0-9a-f]{40}$/u, commit) &&
      stringStartsWith(subject, prefix)) return commit;
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
  if (!regExpTest(/^[0-9a-f]{40}$/u, String(baseCommit || ''))) return true;
  const result = spawnSync(
    'git', ['merge-base', '--is-ancestor', checkpointCommit, baseCommit],
    {cwd: root, encoding: 'utf8'},
  );
  // Status 0 means the attempt was pinned at or after the latest checkpoint.
  // An indeterminate VCS result fails closed by keeping the attempt in scope.
  return result.status === 0 || (result.status !== 1 && result.status !== 0);
}

function dirtyPathsSinceHead(root, paths) {
  const sortedPaths = uniqueSortedPathGroups([paths]);
  if (sortedPaths.length === 0) return [];
  const gitArguments = ['diff', '--name-only', '-z', 'HEAD', '--'];
  appendAll(gitArguments, sortedPaths);
  const result = spawnSync(
    'git', gitArguments,
    {cwd: root, encoding: 'utf8'},
  );
  if (result.status !== 0) return null;
  return arrayFilter(
    stringSplit(String(result.stdout || ''), LOCAL_STR_OWNED_014),
    Boolean,
  );
}

function findUncheckpointedApprovedAttempts(root, quest, log, state) {
  const resolvedRejectedIndexes = capturedSet(arrayMap(
    state.resolvedRejectedAttempts, (entry) => entry.attempt.index));
  const approvedReplacementIndexes = capturedSet(arrayMap(
    state.resolvedRejectedAttempts, (entry) => entry.replacement.index));
  const checkpointCommit = latestCheckpointCommit(root, quest.id);
  const candidates = arrayFilter(state.attempts, (attempt) =>
    attempt.verificationVersion === LEGACY_VERIFICATION_CONTRACT_VERSION &&
    !setHas(resolvedRejectedIndexes, attempt.index) &&
    (
      setHas(approvedReplacementIndexes, attempt.index) ||
      attemptIsAfterCheckpoint(root, attempt, checkpointCommit)
    ));
  const superseded = arrayFilter(candidates, (attempt) =>
    approvedCheckpointReplacement(log, candidates, attempt));
  const supersededIndexes = capturedSet(arrayMap(
    superseded, (attempt) => attempt.index));
  return arrayFilter(candidates,
    (attempt) => !setHas(supersededIndexes, attempt.index));
}

export function candidateReceiptOf(event) {
  const verification = verificationOf(event);
  if (event.type !== EVENT_FINDING ||
    verification?.schemaVersion !== VERIFICATION_CONTRACT_VERSION ||
    !arrayIncludes(
      [VERIFICATION_SCOPE.CANDIDATE, VERIFICATION_SCOPE.BOTH],
      verification.scope) ||
    !validVerificationFingerprint(verification.fingerprint) ||
    !regExpTest(/^[0-9a-f]{40}$/u, String(verification.baseCommit || '')) ||
    !arrayIsArray(verification.paths) ||
    !numberIsInteger(verification.firstAttemptIndex) ||
    !numberIsInteger(verification.lastAttemptIndex)) return null;
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
  const selected = arrayFilter(attempts, (attempt) =>
    attempt.candidateContract && attempt.retired !== true &&
    (baseRecordedButUnreachable(root, attempt.event.workspaceBaseCommit) ||
      attemptIsAfterCheckpoint(root, attempt, checkpointCommit)));
  if (selected.length === 0) {
    return {ok: true, fingerprint: null, content: '', paths: [],
      sourcePaths: [], baseCommit: null, attempts: [],
      firstAttemptIndex: null, lastAttemptIndex: null};
  }
  const paths = collectAttemptPaths(selected, (attempt) => attempt.reviewPaths);
  const sourcePaths = collectAttemptPaths(
    selected, (attempt) => attempt.sourcePaths);
  const shared = {
    paths,
    sourcePaths,
    attempts: selected,
    // A candidate excludes collateral only when every selected attempt was
    // recorded under the collateral contract; one v2 attempt keeps the whole
    // candidate on byte semantics so history is never reinterpreted.
    excludesCollateral: selected.every(
      (attempt) => attempt.excludesCollateral),
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
  const recordedBases = arrayMap(
    selected, (attempt) => attempt.event.workspaceBaseCommit);
  const reachableBases = [];
  const seenBases = capturedSet();
  for (let index = 0; index < recordedBases.length; index += 1) {
    const base = recordedBases[index];
    if (baseCommitReachable(root, base) && !setHas(seenBases, base)) {
      setAdd(seenBases, base);
      arrayPush(reachableBases, base);
    }
  }
  if (reachableBases.length === 0) {
    return {ok: false, fingerprint: null, content: null, ...shared,
      baseCommit: null, code: BASE_UNREACHABLE_CODE,
      problem: 'landing candidate has no reachable recorded base ' +
        `(${BASE_UNREACHABLE_CODE}); record a fresh same-frontier attempt at ` +
        `a live base covering: ${arrayJoin(paths, ', ')}`};
  }
  if (reachableBases.length !== 1 ||
    !regExpTest(/^[0-9a-f]{40}$/u, String(reachableBases[0] || ''))) {
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

// A source epoch begins with the first uncheckpointed v2 source attempt and
// ends only when Solver creates a checkpoint or terminal landing commit. All
// later attempts in that epoch must retain its base, even if unrelated commits
// advance HEAD. This makes the candidate's one-base invariant constructive
// instead of a terminal surprise.
export function activeSourceEpoch(root, quest, log) {
  const attempts = arrayFilter(sourceChangingAttempts(root, quest, log),
    (attempt) => attempt.retired !== true);
  const checkpointCommit = latestCheckpointCommit(root, quest.id);
  const selected = [];
  for (let index = 0; index < attempts.length; index += 1) {
    if (attemptIsAfterCheckpoint(root, attempts[index], checkpointCommit)) {
      arrayPush(selected, attempts[index]);
    }
  }
  if (selected.length === 0) return null;
  const reviewedPaths = [];
  for (let index = 0; index < selected.length; index += 1) {
    arrayPush(reviewedPaths, selected[index].reviewPaths);
  }
  return {
    baseCommit: selected[0].event.workspaceBaseCommit,
    paths: uniqueSortedPathGroups(reviewedPaths),
    firstAttemptIndex: selected[0].index,
  };
}

export function sourceEpochCommittedDriftPaths(root, epoch, extraPaths = []) {
  if (!epoch?.baseCommit) return [];
  const paths = uniqueSortedPathUnion(epoch.paths || [], extraPaths);
  if (paths.length === 0) return [];
  const gitArguments = [
    'diff', '--name-only', '-z', `${epoch.baseCommit}..HEAD`, '--',
  ];
  for (let index = 0; index < paths.length; index += 1) {
    arrayPush(gitArguments, paths[index]);
  }
  const result = spawnSync('git', gitArguments,
    {cwd: root, encoding: 'utf8'});
  if (result.status !== 0) {
    throw new Error(SOURCE_EPOCH_INSPECTION_PROBLEM);
  }
  return arrayFilter(
    stringSplit(String(result.stdout || ''), LOCAL_STR_OWNED_014),
    (filePath) => filePath !== '',
  );
}

const LOCAL_STR_RETIRED_REJECTION =
  ' and its source epoch was retired by rebase-epoch; requires a later ' +
  'same-frontier source attempt at the rebased base covering every rejected ' +
  'source path plus its own later exact approval';
const LOCAL_STR_EPOCH_REBASE_OBLIGATION =
  'epoch rebase requires a covering attempt at ';
const LOCAL_STR_EPOCH_REBASE_OVER = ' over: ';

export function sourceEpochDriftProblem(driftPaths) {
  return SOURCE_EPOCH_DRIFT_PREFIX +
    arrayJoin(driftPaths, SOURCE_EPOCH_PATH_SEPARATOR) +
    SOURCE_EPOCH_DRIFT_ACTION;
}

function receiptMatchesProjection(receipt, projection) {
  return receipt && projection?.ok &&
    receipt.fingerprint === projection.fingerprint &&
    receipt.baseCommit === projection.baseCommit &&
    receipt.firstAttemptIndex === projection.firstAttemptIndex &&
    receipt.lastAttemptIndex === projection.lastAttemptIndex &&
    jsonStringify(arraySort(arraySlice(receipt.paths))) ===
      jsonStringify(arraySort(arraySlice(projection.paths || [])));
}

function validCandidateReceipt(receipt, fingerprint) {
  return receipt && receipt.fingerprint === fingerprint &&
    regExpTest(/^[0-9a-f]{40}$/u, String(receipt.baseCommit || '')) &&
    arrayIsArray(receipt.paths) && receipt.paths.length > 0 &&
    arrayIsArray(receipt.sourcePaths) &&
    numberIsInteger(receipt.firstAttemptIndex) &&
    numberIsInteger(receipt.lastAttemptIndex) &&
    receipt.firstAttemptIndex <= receipt.lastAttemptIndex;
}

// The rejection scan starts at the earliest candidate-contract attempt of
// the CURRENT checkpoint epoch (dead-base attempts included). A
// rebase-epoch retires attempts but never closes the checkpoint epoch, so
// an attempt retired inside the current epoch is still after the checkpoint
// and keeps its standing rejection in the window (it transfers to live-base
// coverage, never discharged by the boundary); a rejection discharged before
// a Solver checkpoint stays discharged, whatever is rebased later — the
// `retired` mark is log-global and must not reopen a closed epoch.
function earliestCandidateAttemptIndex(root, quest, attempts, candidate) {
  const checkpointCommit = latestCheckpointCommit(root, quest.id);
  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    if (!attempt.candidateContract) continue;
    if (baseRecordedButUnreachable(root, attempt.event.workspaceBaseCommit) ||
      attemptIsAfterCheckpoint(root, attempt, checkpointCommit)) {
      return attempt.index;
    }
  }
  // Nothing of the current epoch is on record yet: scan nothing, so a
  // rejection discharged in a closed epoch can never be read again.
  return candidate.firstAttemptIndex ?? Number.MAX_SAFE_INTEGER;
}

function candidateVerificationState(root, log, candidate,
  scanFromIndex = candidate.firstAttemptIndex) {
  if (!candidate.ok) {
    const anchor = arrayAt(candidate.attempts, -1);
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
  // An empty live candidate (every attempt retired by rebase-epoch) still
  // scans: a standing candidate rejection binds until a covering candidate
  // discharges it, so it must surface even when nothing is live yet.
  let approval = null;
  let rejection = null;
  const tail = arraySlice(log, scanFromIndex + 1);
  for (let index = 0; index < tail.length; index += 1) {
    const event = tail[index];
    const receipt = candidateReceiptOf(event);
    if (!receipt ||
      !regExpTest(VERIFIER_EVIDENCE_PATTERN, String(event.evidence || ''))) continue;
    if (event.kind === VERIFIER_REJECTION_FINDING_KIND &&
      receipt.verdict === VERIFICATION_VERDICT_REJECTED) rejection = {event, receipt};
    if (event.kind === VERIFIER_APPROVAL_FINDING_KIND &&
      receiptMatchesProjection(receipt, candidate)) approval = {event, receipt};
  }
  let unresolvedRejection = null;
  const problems = [];
  if (!candidate.fingerprint && !rejection) {
    return {approval: null, rejection: null, unresolvedRejection: null, problems: []};
  }
  if (rejection) {
    const problem = candidateRejectionProblem(root, candidate, rejection, log);
    if (problem) {
      unresolvedRejection = rejection;
      arrayPush(problems, problem);
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
  const covered = new SetConstructor();
  for (let eventIndex = 0; eventIndex < log.length; eventIndex += 1) {
    const event = log[eventIndex];
    if (event.type !== EVENT_REJECTION_DECOMPOSITION ||
      event.rejectedFingerprint !== rejection.receipt.fingerprint ||
      !arrayIsArray(event.coveredPaths) ||
      !arrayIsArray(event.contributionPaths) ||
      !validVerificationFingerprint(event.approvalFingerprint)) continue;
    const live = canonicalSourceDelta(
      root, event.approvalBaseCommit, event.contributionPaths);
    if (!live.ok || live.fingerprint !== event.approvalFingerprint) continue;
    for (let pathIndex = 0; pathIndex < event.coveredPaths.length; pathIndex += 1) {
      setAdd(covered, event.coveredPaths[pathIndex]);
    }
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
  const remainingPaths = arrayFilter(rejection.receipt.paths,
    (filePath) => !isVerificationBookkeeping(filePath, null) &&
      // A collateral-contract replacement never reviews registered generated
      // outputs; the landing regenerates them, so a rejected receipt's
      // output paths are discharged by the contract, not by re-review.
      !(candidate.excludesCollateral &&
        isRegisteredGeneratedOutput(filePath)) &&
      !setHas(covered, filePath));
  if (remainingPaths.length === 0) return null;
  const replacementPaths = capturedSet(arrayFilter(candidate.paths || [],
    (filePath) => !isVerificationBookkeeping(filePath, null)));
  const rejectedBaseDead = baseRecordedButUnreachable(
    root, rejection.receipt.baseCommit) ||
    baseRetiredByEpochRebase(log, rejection.receipt.baseCommit);
  const baseAcceptable = rejectedBaseDead ?
    baseCommitReachable(root, candidate.baseCommit) :
    candidate.baseCommit === rejection.receipt.baseCommit;
  let coversRemainingPaths = true;
  for (let index = 0; index < remainingPaths.length; index += 1) {
    const filePath = remainingPaths[index];
    if (!setHas(replacementPaths, filePath)) {
      coversRemainingPaths = false;
      break;
    }
  }
  const replaced = baseAcceptable &&
    candidate.fingerprint !== rejection.receipt.fingerprint &&
    candidate.lastAttemptIndex > rejection.receipt.lastAttemptIndex &&
    coversRemainingPaths;
  if (replaced) return null;
  const remainingDetail = covered.size > 0 ?
    ` covering the remaining rejected paths: ${arrayJoin(remainingPaths, ', ')}` :
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
  const retired = attempt.retired === true;
  return {
    problem: attemptProblem(
      attempt,
      retired ?
        `was explicitly rejected at ${attempt.fingerprint}` +
          LOCAL_STR_RETIRED_REJECTION :
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
      baseUnreachable: deadBase || retired,
      retired,
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
  const attemptProblems = arrayMap(correctionProblems, (message) => ({
    message,
    ts: null,
    frontier: null,
  }));
  const pendingAttempts = [];
  const resolvedRejectedAttempts = [];
  const unresolvedRejectedAttempts = [];
  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    if (!attempt.contracted) {
      const approval = findAfter(log, attempt.index + 1,
        (event) => legacyApprovalMatches(event, attempt.event.frontier));
      if (!approval) {
        arrayPush(attemptProblems, attemptProblem(
          attempt,
          LOCAL_STR_OWNED_015,
        ));
      }
      continue;
    }
    if (!attempt.fingerprint) {
      arrayPush(attemptProblems, attemptProblem(
        attempt,
        LOCAL_STR_OWNED_016,
      ));
      arrayPush(pendingAttempts, attempt);
      continue;
    }
    if (attempt.candidateContract) continue;
    const rejection = rejectionDisposition(log, attempts, attempt, {root});
    if (rejection?.replacement) {
      arrayPush(resolvedRejectedAttempts, {
        attempt,
        rejection: rejection.rejection.event,
        replacement: rejection.replacement.attempt,
        approval: rejection.replacement.approval,
      });
      continue;
    }
    if (rejection) {
      const unresolved = unresolvedRejectionEntry(root, attempt, rejection);
      arrayPush(attemptProblems, unresolved.problem);
      arrayPush(unresolvedRejectedAttempts, unresolved.entry);
      continue;
    }
    // A retired attempt owes no approval of its own: its content is
    // re-reviewed by the covering attempt the epoch rebase demands.
    if (attempt.retired === true) continue;
    const approval = laterApproval(
      log, attempt, VERIFICATION_SCOPE.ATTEMPT, attempt.fingerprint);
    if (!approval) {
      arrayPush(attemptProblems, attemptProblem(
        attempt,
        `requires a later exact approval for ${attempt.fingerprint}`,
      ));
      arrayPush(pendingAttempts, attempt);
    }
  }

  const candidate = buildLandingCandidate(root, quest, attempts);
  const candidateState = candidateVerificationState(root, log, candidate,
    earliestCandidateAttemptIndex(root, quest, attempts, candidate));
  appendAll(attemptProblems, candidateState.problems);
  const aggregate = aggregateSourceFingerprint(root, attempts);
  // A rebased epoch stands as an obligation until the live epoch's review
  // union covers every path the retired epoch reviewed: nothing the retired
  // attempts changed leaves review, it is re-reviewed at the rebased base.
  // Every rebase on record contributes its retired paths: a second rebase
  // cannot drop what the first one still owed.
  const rebase = latestEpochRebase(log);
  const livePathSet = capturedSet(aggregate.paths || []);
  const epochRebase = rebase ? {
    event: rebase,
    missingPaths: arrayFilter(retiredPathsUnion(log),
      (filePath) => !setHas(livePathSet, filePath)),
  } : null;
  if (epochRebase && epochRebase.missingPaths.length > 0) {
    arrayPush(attemptProblems, {
      message: `${LOCAL_STR_EPOCH_REBASE_OBLIGATION}${rebase.toBase}` +
        `${LOCAL_STR_EPOCH_REBASE_OVER}` +
        arrayJoin(epochRebase.missingPaths, SOURCE_EPOCH_PATH_SEPARATOR),
      ts: rebase.ts || null,
      frontier: null,
    });
  }
  const retiredAttempts = arrayFilter(attempts,
    (attempt) => attempt.retired === true);
  const reversedAttempts = arrayReverse(arraySlice(attempts));
  const latestContracted = arrayFind(
    reversedAttempts, (attempt) => attempt.contracted);
  let aggregateApproval = null;
  if (latestContracted && aggregate.ok && aggregate.fingerprint) {
    aggregateApproval = findAfter(log, latestContracted.index + 1, (event) =>
      structuredApprovalMatches(
        event, VERIFICATION_SCOPE.AGGREGATE, aggregate.fingerprint));
  }
  const aggregateProblems = [];
  if (latestContracted && !aggregate.ok) {
    arrayPush(aggregateProblems,
      attemptProblem(latestContracted, aggregate.problem));
  } else if (latestContracted && !aggregateApproval) {
    arrayPush(aggregateProblems, attemptProblem(
      latestContracted,
      `requires a later aggregate approval for ${aggregate.fingerprint}`,
    ));
  }
  // Visibility, not behavior: dead-base attempts must stay reported after
  // their obligations resolve elsewhere, or the Quest would read clean while
  // an unverifiable receipt sits in its history. Every disposition above is
  // unchanged by this projection.
  const unreachableAttempts = arrayFilter(attempts,
    (attempt) => attempt.contracted &&
      baseRecordedButUnreachable(root, attempt.event.workspaceBaseCommit));
  const baseUnreachableAttempts = arrayMap(unreachableAttempts, (attempt) => ({
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
    retiredAttempts,
    epochRebase,
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
  const coveredPaths = capturedSet(collectAttemptPaths(
    uncheckpointed, (attempt) => attempt.reviewPaths));
  if (state.candidateApproval) {
    for (let index = 0; index < state.candidate.paths.length; index += 1) {
      setAdd(coveredPaths, state.candidate.paths[index]);
    }
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
  const allAttemptPaths = collectAttemptPaths(contracted, (attempt) =>
    isCommitAttempt(attempt) ? [] : attempt.reviewPaths);
  const dirtyPaths = dirtyPathsSinceHead(root, allAttemptPaths);
  const anchor = contracted.length > 0 ? contracted[contracted.length - 1] : null;
  if (dirtyPaths === null && anchor && allAttemptPaths.length > 0) {
    arrayPush(problems, attemptProblem(anchor, LOCAL_STR_OWNED_019));
  } else if (anchor) {
    for (let index = 0; index < dirtyPaths.length; index += 1) {
      const dirtyPath = dirtyPaths[index];
      if (!setHas(coveredPaths, dirtyPath)) {
        arrayPush(problems, attemptProblem(
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
  for (let index = 0; index < contracted.length; index += 1) {
    const attempt = contracted[index];
    if (!isCommitAttempt(attempt)) continue;
    const claimed = attempt.reviewPaths || [];
    if (claimed.length === 0) continue;
    const gitArguments = ['status', '--porcelain', '--'];
    appendAll(gitArguments, claimed);
    const status = spawnSync('git', gitArguments,
      {cwd: root, encoding: 'utf8'});
    if (status.status === 0 &&
      stringTrim(String(status.stdout || '')) !== '') {
      arrayPush(problems, attemptProblem(
        attempt,
        LOCAL_STR_COMMIT_CLAIMED_DIRTY,
      ));
    }
  }
  return problems;
}

function liveAttemptReceiptProblems(root, uncheckpointed) {
  const problems = [];
  for (let index = 0; index < uncheckpointed.length; index += 1) {
    const attempt = uncheckpointed[index];
    if (isCommitAttempt(attempt)) continue; // pinned by sha; see note above
    // The attempt receipt hashes the complete canonical changeRef payload. Re-diff
    // that same complete path set here: sourcePaths is intentionally narrower and
    // belongs only to the terminal aggregate-verification scope.
    const live = canonicalSourceDelta(
      root, attempt.event.workspaceBaseCommit, attempt.reviewPaths);
    if (!live.ok) {
      arrayPush(problems, attemptProblem(attempt, live.problem));
    } else if (live.fingerprint !== attempt.fingerprint) {
      arrayPush(problems, attemptProblem(
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
      arrayPush(problems, attemptProblem(
        arrayAt(state.candidate.attempts, -1), state.candidate.problem));
    } else if (!state.candidateApproval) {
      arrayPush(problems, attemptProblem(
        arrayAt(state.candidate.attempts, -1),
        `landing candidate requires exact approval for ${state.candidate.fingerprint}`));
    }
  }
  const uncheckpointed = state.uncheckpointedApprovedAttempts;
  const contracted = arrayFilter(state.attempts,
    (attempt) => attempt.contracted);
  const coveredPaths = checkpointCoveredPaths(state);
  appendAll(problems,
    dirtyCheckpointPathProblems(root, contracted, coveredPaths));
  appendAll(problems, dirtyCommitClaimProblems(root, contracted));
  appendAll(problems, liveAttemptReceiptProblems(root, uncheckpointed));
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
  const commits = arrayFilter(
    stringSplit(String(listed.stdout || ''), LOCAL_STR_OWNED_007), Boolean);
  const scanned = arraySlice(commits, 0, limit);
  let candidatesFound = 0;
  for (let index = 0; index < scanned.length; index += 1) {
    const delta = canonicalSourceDelta(root, scanned[index], paths);
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
  return appendAll(arraySlice(state.attemptProblems), state.aggregateProblems);
}

export function buildVerificationFinding(args) {
  const isApproval = args.kind === VERIFIER_APPROVAL_FINDING_KIND;
  const isRejection = args.kind === VERIFIER_REJECTION_FINDING_KIND;
  if (!isApproval && !isRejection) return null;
  const label = isRejection ? 'verifier-rejection' : 'verifier-approval';
  if (!regExpTest(VERIFIER_EVIDENCE_PATTERN, String(args.evidence || ''))) {
    throw new Error(
      `${label} requires --evidence subagent:<non-empty-stable-id>`,
    );
  }
  const scope = args.verificationScope;
  if (!arrayIncludes(objectValues(VERIFICATION_SCOPE), scope)) {
    throw new Error(
      `${label} requires --verification-scope attempt|aggregate|both`,
    );
  }
  if (isRejection && !arrayIncludes([
    VERIFICATION_SCOPE.ATTEMPT,
    VERIFICATION_SCOPE.CANDIDATE,
  ], scope)) {
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
    const findings = arrayIsArray(args.rejectionFindings) ?
      args.rejectionFindings : [];
    const wellFormed = findings.length > 0 && arrayEvery(findings, (finding) =>
      finding && typeof finding.category === 'string' && finding.category &&
      typeof finding.summary === 'string' &&
      finding.summary.length >= MIN_REJECTION_SUMMARY_LENGTH);
    if (!wellFormed) {
      throw new Error(REJECTION_FINDINGS_REQUIRED_PROBLEM);
    }
    rejectionFindings = arrayMap(findings,
      ({category, summary, severity}) => ({category, summary,
        ...(severity === undefined ? {} : {severity})}));
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
      paths: arraySort(arraySlice(receipt.paths)),
      sourcePaths: arraySort(arraySlice(receipt.sourcePaths || [])),
      firstAttemptIndex: receipt.firstAttemptIndex,
      lastAttemptIndex: receipt.lastAttemptIndex,
    } : {}),
    ...(isRejection ? {
      verdict: VERIFICATION_VERDICT_REJECTED,
      findings: rejectionFindings,
    } : {}),
  };
}
