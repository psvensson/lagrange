// Successor-quest candidate inheritance.
//
// When a sealed quest is parked with an already-VERIFIED landing candidate
// (scope-override budget exhausted, amendment cap reached), the successor
// previously re-ran the whole verification round on byte-identical work.
// This verb re-records the parent's approved candidate into the successor:
// the child gets its OWN attempt events (the gate only accepts a candidate
// built from the child's log) at the parent's reachable base, and the
// approval is REBUILT against the child's own candidate projection — it is
// appended only when the child's content-addressed fingerprint equals the
// parent-approved one, so any divergence (different base, different bytes)
// falls back to fresh verification by construction. Every inherited event is
// provenance-marked with the parent quest and original timestamps.

import fs from 'node:fs';
import path from 'node:path';

import {EVENT_FINDING} from './constants.js';
import {appendEvent, loadQuest, readLog} from './store.js';
import {
  BASE_UNREACHABLE_CODE,
  VERIFICATION_SCOPE,
  VERIFIER_APPROVAL_FINDING_KIND,
  baseCommitReachable,
  verificationState,
} from './verification.js';
import {
  changeArtifactIdentity,
  expectedChangeDir,
  isCommitChangeRef,
} from './change-artifact.js';

const DIFF_REF_PREFIX = 'diff:';
const INHERITED_ARTIFACT_PREFIX = 'inherited-';
const PROBLEM_COMMIT_REF_UNSUPPORTED =
  'inherit-candidate does not support commit: changeRefs';

function requireDeclared(log, questId) {
  if (!log.some((event) => event.type === 'quest-declared')) {
    throw new Error(
      `inherit-candidate: ${questId} is not sealed yet — run ` +
      `\`solve start --id ${questId}\` first`);
  }
}

// Same-id match wins (immune to reordering); positional mapping is the
// fallback for the sibling-derivation convention where ids embed the quest id.
function childFrontierFor(parent, child, parentFrontierId) {
  const sameId = child.frontiers.find(
    (frontier) => frontier.id === parentFrontierId);
  if (sameId) return sameId.id;
  const index = parent.frontiers.findIndex(
    (frontier) => frontier.id === parentFrontierId);
  const target = index >= 0 ? child.frontiers[index] : null;
  if (!target) {
    throw new Error(
      `inherit-candidate: parent frontier ${parentFrontierId} has no ` +
      'positional counterpart in the successor');
  }
  return target.id;
}

// The child references its own copy of each diff artifact: inspection
// requires artifacts under the owning quest's change directory, and the
// landing scope walks that directory to find the changed source paths.
function copyArtifact(root, childId, parentId, changeRef) {
  if (isCommitChangeRef(changeRef)) {
    // A commit changeRef names a committed tree-to-tree range, not a file to
    // copy; the child's candidate must be rebuilt from its own log.
    throw new Error(PROBLEM_COMMIT_REF_UNSUPPORTED);
  }
  const sourceRel = String(changeRef).slice(DIFF_REF_PREFIX.length);
  const sourceAbs = path.join(root, sourceRel);
  const childDir = expectedChangeDir(root, childId);
  fs.mkdirSync(childDir, {recursive: true});
  // The parent id is part of the destination name so two conventional
  // `attempt-1.diff` artifacts from different sources can never collide.
  const destAbs = path.join(childDir,
    `${INHERITED_ARTIFACT_PREFIX}${parentId}-${path.basename(sourceRel)}`);
  fs.copyFileSync(sourceAbs, destAbs);
  return `${DIFF_REF_PREFIX}${path.relative(root, destAbs)}`;
}

export function runInheritCandidateCommand(root, args) {
  const childId = args.id || args._?.[0];
  const parentId = args.from;
  if (!childId || !parentId) {
    throw new Error('inherit-candidate: --id <child> and --from <parent> are required');
  }
  const child = loadQuest(root, childId);
  const childLog = readLog(root, childId);
  requireDeclared(childLog, childId);
  // Inheritance targets an EMPTY successor. Prior child attempts would change
  // the candidate's path union (fingerprint divergence AFTER events were
  // appended — permanent log pollution in an append-only log), and this guard
  // doubles as the double-run refusal.
  if (childLog.some((event) => event.type === 'attempt')) {
    throw new Error(
      `inherit-candidate: ${childId} already has recorded attempts — ` +
      'inheritance only targets a fresh successor; record and verify the ' +
      'remaining work normally');
  }
  const parent = loadQuest(root, parentId);
  const parentLog = readLog(root, parentId);
  const parentState = verificationState(root, parent, parentLog);
  const candidate = parentState.candidate;
  if (!candidate?.ok || !candidate.fingerprint) {
    throw new Error(
      `inherit-candidate: ${parentId} has no coherent landing candidate`);
  }
  if (!parentState.candidateApproval) {
    throw new Error(
      `inherit-candidate: ${parentId}'s candidate has no verifier approval ` +
      'matching its CURRENT content — either it was never candidate-approved, ' +
      'or the working tree diverged from the approved bytes since (the ' +
      'fingerprint is computed from the live tree). Either way there is no ' +
      'verification to inherit; record and verify fresh work');
  }
  if (!baseCommitReachable(root, candidate.baseCommit)) {
    throw new Error(
      `inherit-candidate: parent base ${candidate.baseCommit} is not ` +
      `reachable (${BASE_UNREACHABLE_CODE}) — record a fresh attempt at a ` +
      'live base instead');
  }

  for (const attempt of candidate.attempts) {
    const changeRef = copyArtifact(
      root, childId, parentId, attempt.event.changeRef);
    // Fresh ts (appendEvent stamps when the copied event carries none) keeps
    // the child log monotonic and window reports honest; the parent's stamp
    // and theory linkage survive only as provenance — a parent theoryRef would
    // dangle in the child's theory ledger.
    const {ts: parentAttemptTs, theoryRef: parentTheoryRef,
      ...copied} = attempt.event;
    appendEvent(root, childId, {
      ...copied,
      frontier: childFrontierFor(parent, child, attempt.event.frontier),
      changeRef,
      changeRefIdentity: changeArtifactIdentity(root, childId, changeRef),
      theoryRef: null,
      inherited: {
        fromQuest: parentId,
        parentAttemptTs,
        parentTheoryRef: parentTheoryRef || null,
      },
    });
  }

  const childState = verificationState(root, child, readLog(root, childId));
  if (!childState.candidate?.ok ||
    childState.candidate.fingerprint !== candidate.fingerprint) {
    throw new Error(
      'inherit-candidate: the re-recorded candidate fingerprint ' +
      `(${childState.candidate?.fingerprint || 'none'}) does not match the ` +
      `parent-approved one (${candidate.fingerprint}) — the content ` +
      'diverged; the successor needs its own verification round');
  }
  const parentApproval = parentState.candidateApproval.event;
  const lastAttempt = childState.candidate.attempts.at(-1);
  appendEvent(root, childId, {
    type: EVENT_FINDING,
    kind: VERIFIER_APPROVAL_FINDING_KIND,
    frontier: lastAttempt.event.frontier,
    claim: `inherited candidate approval from ${parentId} ` +
      `(verified ${parentApproval.ts})`,
    evidence: parentApproval.evidence,
    verification: {
      schemaVersion: parentApproval.verification.schemaVersion,
      scope: VERIFICATION_SCOPE.CANDIDATE,
      fingerprint: childState.candidate.fingerprint,
      baseCommit: childState.candidate.baseCommit,
      paths: [...childState.candidate.paths].sort(),
      sourcePaths: [...(childState.candidate.sourcePaths || [])].sort(),
      firstAttemptIndex: childState.candidate.firstAttemptIndex,
      lastAttemptIndex: childState.candidate.lastAttemptIndex,
    },
    inherited: {
      fromQuest: parentId,
      parentApprovalTs: parentApproval.ts,
    },
  });

  return `inherited ${candidate.attempts.length} attempt(s) and the ` +
    `candidate approval ${candidate.fingerprint} from ${parentId} into ` +
    `${childId}`;
}
