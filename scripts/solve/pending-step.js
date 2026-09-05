// Pending step owner: the `<quest>.pending.json` file `solve step` writes at
// begin time and the ONE base commit every attempt recorded while that step
// is pending must share.
//
// Canon (solver-quests.md "The first source-changing attempt after a Solver
// checkpoint owns one source epoch base. Every later attempt retains that
// base even when unrelated commits advance HEAD"). The step pins its base at
// begin (rejection base, else the active epoch base, else HEAD) and records
// that pin when the step commits. Before this owner existed a one-shot
// `solve attempt` issued while a step was pending re-pinned from the epoch or
// live HEAD: with no recorded source attempt yet (the epoch begins only with
// the first recorded one) it pinned the CURRENT HEAD, so an unrelated commit
// between step begin and the attempt left the two attempts on different
// bases and the landing candidate had no common base
// (2026-08-30, operation-ledger-self-move-holder-release-on-engagement:
// pinned at 7085090e2, one-shot attempt recorded at 0553f8b10, resealed).
//
// Decision table for the base an attempt is recorded against, in order:
//   pending step pin  -> its sourceBaseCommit (else headCommit)
//   active epoch      -> the epoch base
//   otherwise         -> live HEAD (null outside a Git work tree)
// The pin is never re-derived from HEAD while a step is pending; an
// unreachable pin fails closed downstream (canonical delta: base_unreachable).

import fs from 'node:fs';
import path from 'node:path';

import {assertSafeQuestId} from './store.js';
import {
  ATTEMPT_BASE_SOURCE,
  SOLVE_DATA_DIR,
  STATE_SUBDIR,
} from './constants.js';
import {
  activeSourceEpoch,
  baseRecordedButUnreachable,
  baseRetiredByEpochRebase,
  resolveWorkspaceBaseCommit,
  verificationState,
} from './verification.js';

const PENDING_FILE_SUFFIX = '.pending.json';
const JSON_INDENT = 2;
const LINE_SEPARATOR = '\n';
const TEXT_ENCODING = 'utf8';

export function pendingFilePath(root, questId) {
  return path.join(
    root,
    SOLVE_DATA_DIR,
    STATE_SUBDIR,
    `${assertSafeQuestId(questId)}${PENDING_FILE_SUFFIX}`,
  );
}

export function loadPending(root, questId) {
  const file = pendingFilePath(root, questId);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, TEXT_ENCODING));
}

export function savePending(root, questId, pending) {
  const file = pendingFilePath(root, questId);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(
    file,
    `${JSON.stringify(pending, null, JSON_INDENT)}${LINE_SEPARATOR}`,
  );
  return file;
}

export function clearPending(root, questId) {
  const file = pendingFilePath(root, questId);
  if (fs.existsSync(file)) fs.rmSync(file);
}

// The pin a pending step recorded at begin time (null when no step is pending
// or the step carries no pin, e.g. outside a Git work tree).
export function pendingStepBaseCommit(pending) {
  if (!pending) return null;
  return pending.sourceBaseCommit || pending.headCommit || null;
}

// The HEAD sha at step-begin time, recorded into the pending file so
// --auto-diff can snapshot exactly what changed during the attempt (null
// outside a git work tree).
function resolveHeadPin(root) {
  return resolveWorkspaceBaseCommit(root);
}

// Begin-time pin: a replacement is pinned to the rejected attempt's base so
// the rejection stays binding, else the active epoch base, else HEAD.
// The base a standing rejection on this frontier pins a replacement to:
// the candidate rejection's receipt base, else the rejected attempt's base.
function standingRejectionBase(verification, frontierId) {
  const candidateRejection = verification.unresolvedCandidateRejection;
  if (candidateRejection?.event?.frontier === frontierId &&
    candidateRejection.receipt?.baseCommit) {
    return candidateRejection.receipt.baseCommit;
  }
  const unresolvedRejection = verification.unresolvedRejectedAttempts
    .find(({attempt}) => attempt.event.frontier === frontierId);
  return unresolvedRejection?.attempt.event.workspaceBaseCommit || null;
}

export function resolveStepBaseCommit(root, quest, log, frontierId) {
  const verification = verificationState(root, quest, log);
  const rejectedBase = standingRejectionBase(verification, frontierId);
  // Pinning to a base that no longer resolves — or one a rebase-epoch
  // retired — would refuse the replacement before it could be recorded. The
  // live-base coverage rule in findApprovedRejectionReplacement accepts a
  // reachable-base replacement for exactly this case, so the pin falls back
  // to HEAD then.
  if (rejectedBase && (baseRecordedButUnreachable(root, rejectedBase) ||
    baseRetiredByEpochRebase(log, rejectedBase))) {
    return resolveHeadPin(root);
  }
  const epoch = activeSourceEpoch(root, quest, log);
  return rejectedBase || epoch?.baseCommit || resolveHeadPin(root);
}

// Attempt-time base: the single source every attempt of a pending step is
// recorded against. `options.epoch` lets a caller that already resolved the
// active epoch pass it instead of re-deriving it.
export function resolveAttemptBaseCommit(root, quest, log, options = {}) {
  const pendingPin = pendingStepBaseCommit(loadPending(root, quest.id));
  if (pendingPin) {
    return {baseCommit: pendingPin, source: ATTEMPT_BASE_SOURCE.PENDING_STEP};
  }
  const epoch = options.epoch === undefined ?
    activeSourceEpoch(root, quest, log) :
    options.epoch;
  if (epoch?.baseCommit) {
    return {
      baseCommit: epoch.baseCommit,
      source: ATTEMPT_BASE_SOURCE.SOURCE_EPOCH,
    };
  }
  return {baseCommit: resolveHeadPin(root), source: ATTEMPT_BASE_SOURCE.HEAD};
}
