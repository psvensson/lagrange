/**
 * Owner contract:
 * Owner: the REPLACE STOPPING owner's R-1f re-drive of its source's
 * membership removal (quest replace-source-removal-owner; moved out of
 * operation-workflow-replace-owner.js unchanged, 2026-11-11): at most one
 * RETIRE_REPLICA_PEER attempt in flight per operation, re-issued only when
 * the witness's leader, term or membership moved or the backstop window
 * passed; a restart rebuilds the lost attempt (BR10), never assumes it
 * absent.
 * Inputs: the owner's attempt state, the witness observation, the route to
 * the group's leader.
 * Canonical output: whether an attempt was issued; the attempt record.
 * Prohibited: resubmitting on a wake that changed nothing.
 */
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
} from './replica-operation-constants.js';
import {replaceRetirementRouteOf} from
  './operation-workflow-replace-surviving-membership.js';
import {deliverToReplaceWitness, deliveryUnavailableReason} from
  './operation-workflow-replace-witness.js';
import {
  REPLACE_REMOVAL_PENDING_ESCALATION_MS,
  nowMsOf,
  readOwnerState,
} from './operation-workflow-replace-owner-state.js';
import {claimReplaceAttemptStateRebuild} from
  './operation-workflow-replace-owner-recovery.js';

const RETIREMENT_LEVEL_SEPARATOR = '|';
// The sequence of an attempt record rebuilt after a restart (BR10): not one
// this session issued.
const REBUILT_ATTEMPT_SEQ = 0;

// The leader, term and membership the witness reported: an R-1f attempt is
// re-issued only when one of them moved since it was issued (a proposal a
// leader change dropped), or the backstop window passed with no answer
// resolving it.
function retirementLevelOf(observation) {
  return [
    observation?.leaderReplicaId ?? '',
    observation?.term ?? '',
    observation?.state ?? '',
  ].join(RETIREMENT_LEVEL_SEPARATOR);
}

function shouldIssueRetirementAttempt(owner, attempt, observation) {
  if (!attempt) {
    return true;
  }
  if (attempt.answer === null) {
    // One uncertain attempt at a time: a wake re-evaluates, never resubmits.
    return false;
  }
  if (attempt.level !== retirementLevelOf(observation)) {
    return true;
  }
  const windowMs = Number(observation?.transferWindowMaxMs);
  const backstopMs = Number.isFinite(windowMs) && windowMs > 0 ?
    windowMs : REPLACE_REMOVAL_PENDING_ESCALATION_MS;
  return nowMsOf(owner) - attempt.answeredAtMs >= backstopMs;
}

/**
 * BR10: the previous owner session may have issued a REMOVE_PEER whose
 * outcome is unknown. Its record is rebuilt as an outstanding attempt,
 * answered now at the witness's current level: a changed level or the
 * backstop window resolves it; nothing is issued before.
 * @param {Object} owner
 * @param {Object} state - The owner state.
 * @param {Object} operation
 * @param {Object} observation - The fresh witness observation.
 */
function rebuildLostRetirementAttempt(owner, state, operation, observation) {
  if (state.retirementAttemptByOperationId.has(operation.operationId)) {
    return;
  }
  const rebuild = claimReplaceAttemptStateRebuild(owner, operation);
  if (!rebuild.due) {
    return;
  }
  const nowMs = nowMsOf(owner);
  state.retirementAttemptByOperationId.set(operation.operationId, {
    attemptSeq: REBUILT_ATTEMPT_SEQ,
    issuedAtMs: nowMs,
    level: retirementLevelOf(observation),
    answer: Object.freeze({rebuiltAfter: rebuild.restartClass}),
    answeredAtMs: nowMs,
    rebuiltAfter: rebuild.restartClass,
  });
}

/**
 * R-1f: propose REMOVE_PEER of the source through the group's leader (the
 * one port that takes a conf change; the target when it leads) while the
 * source is still a voter and its row is gone or retiring. At most one
 * attempt is in flight; a repeat after a leader, term or membership change,
 * or after the backstop window, is a raft no-op if the first one committed.
 * @param {Object} owner
 * @param {Object} operation
 * @param {Object} observation
 * @return {Promise<boolean>} Whether an attempt was issued.
 */
async function redriveReplaceSourceRetirement(owner, operation, observation) {
  const state = readOwnerState(owner);
  rebuildLostRetirementAttempt(owner, state, operation, observation);
  const attempt =
    state.retirementAttemptByOperationId.get(operation.operationId) || null;
  if (!shouldIssueRetirementAttempt(owner, attempt, observation)) {
    return false;
  }
  const issued = {
    attemptSeq: state.nextAttemptSeq,
    issuedAtMs: nowMsOf(owner),
    level: retirementLevelOf(observation),
    answer: null,
    answeredAtMs: null,
  };
  state.nextAttemptSeq += 1;
  state.retirementAttemptByOperationId.set(operation.operationId, issued);
  const delivery = await deliverToReplaceWitness(
    owner, operation, ReplicaOperationMessageType.RETIRE_REPLICA_PEER,
    replaceRetirementRouteOf(owner, operation, observation));
  if (state.retirementAttemptByOperationId.get(operation.operationId) ===
      issued) {
    issued.answer = delivery.response?.[ReplicaOperationField.PROPOSAL] ||
      {reason: deliveryUnavailableReason(delivery)};
    issued.answeredAtMs = nowMsOf(owner);
  }
  return true;
}

export {redriveReplaceSourceRetirement};
