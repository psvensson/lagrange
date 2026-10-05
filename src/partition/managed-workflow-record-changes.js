/**
 * The change functions of a split or merge workflow's durable record
 * (managed-workflow-record-store.js, owner decision 2026-10-05 option A):
 * each is a pure function of the DECODED record it is applied to at its
 * turn, carrying the caller's expectation as a precondition on that record.
 * Nothing here reads the in-memory workflow: what a change writes is a
 * function of the record and the change's own delta.
 */
import {
  PARTICIPANT_ACK_FIELD,
  PARTICIPANT_ACK_RESULT,
  WORKFLOW_CLAIM_RESULT,
  WORKFLOW_ERROR_MSG,
  WORKFLOW_TRANSITION_FIELD,
} from '../workflow/workflow-constants.js';
import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
  workflowAttemptOf,
} from './partition-constants.js';
import {
  RECORD_CHANGE_OUTCOME,
  RECORD_CLEARED,
  RECORD_UNCHANGED,
  refuseRecordChange,
} from './managed-workflow-record-store.js';

const LEASE_RENEW_FRACTION = 2;
const WORKFLOW_ID_KEY = 'workflowId';
const STATE = PARTITION_TRANSITION_STATE;

// Typed refusal reasons of the record changes.
const RECORD_CHANGE_REFUSAL = Object.freeze({
  RECORD_GONE: 'record-gone',
  RECORD_MOVED_SINCE_READ: 'record-moved-since-read',
  REGISTRATION_INPUT_MOVED: 'registration-input-moved',
  ATTEMPT_MISMATCH: 'attempt-mismatch',
  STATE_NOT_EXPECTED: 'state-not-expected',
  ...WORKFLOW_CLAIM_RESULT,
});

// The forward order of a split's or merge's phases: a change never moves the
// record backwards in it. FAILED (the owner's abort) is left only by the
// terminal clear. Pre-cutover, the unranked states (deferred, blocked,
// failed) are a retry's or an abort's own; from the cutover on, the order is
// total (round 7, D4): only a phase of the same or a later rank, or the
// clear.
const PHASE_RANK = Object.freeze(new Map([
  [STATE.ADMISSION_PENDING, 0],
  [STATE.SPLIT_PREPARING, 1], [STATE.MERGE_PREPARING, 1],
  [STATE.SPLIT_BACKFILLING, 2], [STATE.MERGE_BACKFILLING, 2],
  [STATE.SPLIT_CATCHUP, 3], [STATE.MERGE_CATCHUP, 3],
  [STATE.SPLIT_CUTOVER_ACTIVE, 4], [STATE.MERGE_CUTOVER_ACTIVE, 4],
  [STATE.SPLIT_SOURCE_DISSOLVING, 5],
]));

const CUTOVER_RANK = PHASE_RANK.get(STATE.SPLIT_CUTOVER_ACTIVE);

/**
 * Whether a record in `state` is at its cutover or later (the target epoch
 * promoted): a state no failure, deferral or retry may leave backwards.
 * @param {string|null} state
 * @return {boolean}
 */
function isCutoverOrLater(state) {
  return PHASE_RANK.has(state) && PHASE_RANK.get(state) >= CUTOVER_RANK;
}

/**
 * Whether `to` moves a record at cutover-or-later anything but forward: only
 * a phase of the same or a later rank (the clear is not a status) keeps it.
 * @param {string|null} from - The compared record's state.
 * @param {string|null} to - The change's next status.
 * @return {boolean}
 */
function isCutoverRegression(from, to) {
  return isCutoverOrLater(from) &&
    !(PHASE_RANK.has(to) && PHASE_RANK.get(to) >= PHASE_RANK.get(from));
}

/**
 * Whether `next` moves the record's phase backwards (or out of FAILED, or
 * a cutover-or-later record anywhere but forward).
 * @param {string|null} from
 * @param {string|null} to
 * @return {boolean}
 */
function isPhaseRegression(from, to) {
  if (from === STATE.FAILED) {
    return to !== STATE.FAILED;
  }
  if (isCutoverOrLater(from)) {
    return isCutoverRegression(from, to);
  }
  return PHASE_RANK.has(from) && PHASE_RANK.has(to) &&
    PHASE_RANK.get(to) < PHASE_RANK.get(from);
}

/**
 * The one phase guard every change passes (the coordinator wraps each
 * change it hands the store with it, whichever entry it came from): a change
 * whose next status would take a cutover-or-later record anywhere but
 * forward refuses, whichever workflow the record holds.
 * @param {Function} change - (workflow, stored) => next | sentinel.
 * @return {Function}
 */
function phaseMonotonicChange(change) {
  return (workflow, stored) => {
    const next = change(workflow, stored);
    if (isSentinelAnswer(next) ||
        !isCutoverRegression(stored?.state ?? null, next.status)) {
      return next;
    }
    return refuseRecordChange(RECORD_CHANGE_REFUSAL.STATE_NOT_EXPECTED,
      {from: stored.state, to: next.status});
  };
}


// The change's answer passes through untouched when it is not a record.
function isSentinelAnswer(answer) {
  return answer === RECORD_UNCHANGED || answer === RECORD_CLEARED ||
    !answer || typeof answer !== 'object' ||
    !(WORKFLOW_ID_KEY in answer);
}

/**
 * The lease holder's renewal riding its own write: a lease past half its
 * term is extended in the same compare-and-swap.
 * @param {Object} owner - {workflowOwnerId, workflowLeaseMs, now}.
 * @param {Object} next - The change's next workflow.
 * @return {Object}
 */
function renewLeaseRidingWrite(owner, next) {
  const leaseMs = Number(owner.workflowLeaseMs);
  const now = owner.now();
  if (next.workflowOwnerId !== owner.workflowOwnerId ||
      !Number.isFinite(next.leaseExpiresAt) || !Number.isFinite(leaseMs) ||
      next.leaseExpiresAt - now > leaseMs / LEASE_RENEW_FRACTION) {
    return next;
  }
  return {...next, leaseExpiresAt: now + leaseMs};
}

/**
 * A change of the workflow's owner: the record must hold this workflow under
 * this owner at `fence` (the fence the caller holds). Another owner's record
 * refuses as superseded; this owner at another fence refuses (stale).
 * @param {Object} owner
 * @param {number|undefined} fence
 * @param {Function} change - (workflow, stored) => next | sentinel.
 * @return {Function}
 */
function ownedChange(owner, fence, change) {
  return (workflow, stored) => {
    if (!workflow) {
      return refuseRecordChange(RECORD_CHANGE_REFUSAL.RECORD_GONE,
        {superseded: true});
    }
    if (workflow.workflowOwnerId !== owner.workflowOwnerId) {
      return refuseRecordChange(RECORD_CHANGE_REFUSAL.ACTIVE_OWNER,
        {superseded: true});
    }
    if (workflow.fenceToken !== fence) {
      return refuseRecordChange(RECORD_CHANGE_REFUSAL.STALE_FENCE);
    }
    const next = change(workflow, stored);
    if (isSentinelAnswer(next)) {
      return next;
    }
    if (isPhaseRegression(workflow.status, next.status)) {
      return refuseRecordChange(RECORD_CHANGE_REFUSAL.STATE_NOT_EXPECTED);
    }
    return renewLeaseRidingWrite(owner, {...next,
      updatedAt: next.updatedAt !== workflow.updatedAt ?
        next.updatedAt : owner.now()});
  };
}

function liveForeignLease(owner, stored) {
  const claim = stored.claim;
  return Boolean(claim.workflowOwnerId) &&
    claim.workflowOwnerId !== owner.workflowOwnerId &&
    Number.isFinite(claim.leaseExpiresAt) &&
    claim.leaseExpiresAt > owner.now();
}

/**
 * Whether a stored record is exactly the record a caller read: the same
 * transition bytes AND the same generation (round 7: a cleared record of one
 * generation is never the cleared record of another).
 * @param {Object} stored - The decoded record.
 * @param {Object} read - recordBytesOf(the caller's read).
 * @return {boolean}
 */
function isRecordAsRead(stored, read) {
  return stored.bytes.metadata === read.metadata &&
    stored.bytes.state === read.state &&
    stored.bytes.generation === read.generation;
}

/**
 * Claim before register (owner ruling 2026-10-05): the registration IS the
 * claim. Its content was derived from the record the caller read, so its
 * precondition is that the record is still exactly that read (bytes and
 * generation: every `tables`-row input is covered), that every input it took
 * from another row still holds against the compared record (`revalidate`,
 * at the change's turn), and that no other owner holds a live lease. It
 * mints the ATTEMPT (the generation it writes) and a fence above every
 * earlier fence of the record and every earlier attempt.
 * @param {Object} owner
 * @param {Object} registration - The new workflow (no claim fields).
 * @param {Object} read - The compared record of the caller's read
 *   ({metadata, state, generation}).
 * @param {Function|null} revalidate - (registration, storedRow) => null |
 *   the name of the input that moved.
 * @return {Function}
 */
function registrationChange(owner, registration, read, revalidate) {
  return (_workflow, stored) => {
    if (!isRecordAsRead(stored, read)) {
      return refuseRecordChange(RECORD_CHANGE_REFUSAL.RECORD_MOVED_SINCE_READ,
        {superseded: stored.claim.workflowOwnerId !== owner.workflowOwnerId});
    }
    if (liveForeignLease(owner, stored)) {
      return refuseRecordChange(RECORD_CHANGE_REFUSAL.ACTIVE_OWNER, {
        recordOwnerId: stored.claim.workflowOwnerId,
        recordLeaseExpiresAt: stored.claim.leaseExpiresAt});
    }
    const movedInput = typeof revalidate === 'function' ?
      revalidate(registration, stored.row) : null;
    if (movedInput) {
      return refuseRecordChange(RECORD_CHANGE_REFUSAL.REGISTRATION_INPUT_MOVED,
        {input: movedInput});
    }
    const attempt = stored.generation + 1;
    return {...registration,
      metadata: {...(registration.metadata || {}),
        [PARTITION_TRANSITION_METADATA_FIELD.WORKFLOW_ATTEMPT]: attempt},
      fenceToken: Math.max((stored.claim.fenceToken ?? 0) + 1, attempt),
      workflowOwnerId: owner.workflowOwnerId,
      leaseExpiresAt: owner.now() + owner.workflowLeaseMs,
      attemptCount: 1};
  };
}

/**
 * A fresh claim (a new fence over the record's own) of a workflow the record
 * holds; a live lease of another owner refuses.
 * @param {Object} owner
 * @param {Function} isTerminal
 * @return {Function}
 */
function freshClaimChange(owner, isTerminal) {
  return (workflow, stored) => {
    if (!workflow || isTerminal(workflow)) {
      return refuseRecordChange(RECORD_CHANGE_REFUSAL.TERMINAL,
        {superseded: !workflow});
    }
    if (liveForeignLease(owner, stored)) {
      return refuseRecordChange(RECORD_CHANGE_REFUSAL.ACTIVE_OWNER);
    }
    const now = owner.now();
    return {...workflow, workflowOwnerId: owner.workflowOwnerId,
      fenceToken: (workflow.fenceToken ?? 0) + 1,
      leaseExpiresAt: now + owner.workflowLeaseMs,
      attemptCount: (workflow.attemptCount ?? 0) + 1, updatedAt: now};
  };
}

/**
 * The holder's renewal at the fence it holds (a state set narrows it: an
 * irreversible effect needs the record in one of them).
 * @param {Object} owner
 * @param {number|undefined} fence
 * @param {ReadonlySet<string>|null} states
 * @return {Function}
 */
function renewalChange(owner, fence, states) {
  return ownedChange(owner, fence, (workflow) => {
    if (states && !states.has(String(workflow.status))) {
      return refuseRecordChange(RECORD_CHANGE_REFUSAL.STATE_NOT_EXPECTED);
    }
    const now = owner.now();
    return {...workflow, leaseExpiresAt: now + owner.workflowLeaseMs,
      updatedAt: now};
  });
}

/**
 * A fenced step transition: the record holds the step's renewed ownership
 * (owner, fence, a live lease), then the step's own change.
 * @param {Object} owner
 * @param {Object} transition - {nextStep, reason, fenceToken, ownerId,
 *   metadata}.
 * @param {Function|null} change - The step's change of the record.
 * @param {Function} isTerminal
 * @return {Function}
 */
function transitionChange(owner, transition, change, isTerminal) {
  return (workflow, stored) => {
    const refusal = transitionRefusalOf(owner, workflow, transition,
      isTerminal);
    if (refusal) {
      return refusal;
    }
    const next = change ? change(workflow, stored) : workflow;
    if (isSentinelAnswer(next)) {
      return next;
    }
    if (isPhaseRegression(workflow.status, next.status)) {
      return refuseRecordChange(RECORD_CHANGE_REFUSAL.STATE_NOT_EXPECTED);
    }
    const now = owner.now();
    return renewLeaseRidingWrite(owner, {...next,
      step: transition.nextStep,
      fenceToken: transition.fenceToken,
      transitionHistory: [...(workflow.transitionHistory ?? []), {
        [WORKFLOW_TRANSITION_FIELD.PREVIOUS_STEP]: workflow.step ?? null,
        [WORKFLOW_TRANSITION_FIELD.NEXT_STEP]: transition.nextStep,
        [WORKFLOW_TRANSITION_FIELD.REASON]: transition.reason,
        [WORKFLOW_TRANSITION_FIELD.TIMESTAMP]: now,
        [WORKFLOW_TRANSITION_FIELD.OWNER_KEY]: workflow.ownerKey,
        [WORKFLOW_TRANSITION_FIELD.FENCE_TOKEN]: transition.fenceToken,
        ...(transition.metadata && typeof transition.metadata === 'object' ?
          transition.metadata : {}),
      }],
      updatedAt: now,
    });
  };
}

function transitionRefusalOf(owner, workflow, transition, isTerminal) {
  if (!workflow) {
    return refuseRecordChange(RECORD_CHANGE_REFUSAL.RECORD_GONE,
      {superseded: true, message: WORKFLOW_ERROR_MSG.STALE_FENCE_TOKEN});
  }
  if (workflow.workflowOwnerId !== transition.ownerId) {
    return refuseRecordChange(RECORD_CHANGE_REFUSAL.ACTIVE_OWNER, {
      superseded: workflow.workflowOwnerId !== owner.workflowOwnerId,
      message: WORKFLOW_ERROR_MSG.WORKFLOW_OWNER_MISMATCH});
  }
  if (workflow.fenceToken !== transition.fenceToken) {
    return refuseRecordChange(RECORD_CHANGE_REFUSAL.STALE_FENCE,
      {message: WORKFLOW_ERROR_MSG.STALE_FENCE_TOKEN});
  }
  if (!(Number(workflow.leaseExpiresAt) > owner.now())) {
    return refuseRecordChange(RECORD_CHANGE_REFUSAL.STALE_FENCE,
      {message: WORKFLOW_ERROR_MSG.WORKFLOW_LEASE_EXPIRED});
  }
  if (isTerminal(workflow) && transition.nextStep !== workflow.step) {
    return refuseRecordChange(RECORD_CHANGE_REFUSAL.TERMINAL,
      {message: WORKFLOW_ERROR_MSG.TERMINAL_WORKFLOW_IMMUTABLE});
  }
  return null;
}

/**
 * A participant acknowledgement (the owner's own, or a non-owner's): the
 * participant must exist on the RECORD, and the fence, duplicate and graph
 * checks run against the record's participant. A refusal carries the typed
 * acknowledgement result.
 * @param {Object} owner - {now, workflowOwnerId, workflowLeaseMs}.
 * @param {Object} ack
 * @param {Function|null} isAllowed - (key, from, to) => boolean.
 * @return {Function}
 */
function acknowledgementChange(owner, ack, isAllowed) {
  const key = String(ack[PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]);
  const status = String(ack[PARTICIPANT_ACK_FIELD.STATUS]);
  const fence = ack[PARTICIPANT_ACK_FIELD.FENCE_TOKEN];
  const checkpoint = ack[PARTICIPANT_ACK_FIELD.CHECKPOINT];
  return (workflow) => {
    if (!workflow) {
      return refuseRecordChange(RECORD_CHANGE_REFUSAL.RECORD_GONE,
        {superseded: true});
    }
    const participant = workflow.participants.get(key);
    const rejection = attemptRejectionOf(workflow, ack) ??
      acknowledgementRejectionOf(participant, key, status, fence, isAllowed);
    if (rejection) {
      return refuseRecordChange(rejection,
        {participant: participant ? {...participant} : null, key, status,
          fence, recordAttempt: workflowAttemptOf(workflow.metadata),
          attempt: ack[PARTICIPANT_ACK_FIELD.ATTEMPT] ?? null});
    }
    const now = owner.now();
    const acknowledged = {...participant, status, acknowledgedAt: now,
      updatedAt: now,
      ...(fence !== undefined && fence !== null ? {fenceToken: fence} : {}),
      ...(checkpoint !== undefined && checkpoint !== null ?
        {checkpoint} : {})};
    const participants = new Map(workflow.participants);
    participants.set(key, acknowledged);
    return renewLeaseRidingWrite(owner, {...workflow, participants,
      updatedAt: now});
  };
}

/**
 * An acknowledgement of another attempt of the workflow than the record's
 * (round 7, D3): its explicit attempt differs, or its fence is below the
 * record's attempt (every fence of an attempt is at least its attempt;
 * every fence of an earlier attempt is below it). Checked against the
 * record the change is applied to.
 * @param {Object} workflow - The decoded record.
 * @param {Object} ack
 * @return {string|null}
 */
function attemptRejectionOf(workflow, ack) {
  const recordAttempt = workflowAttemptOf(workflow.metadata);
  const attempt = ack[PARTICIPANT_ACK_FIELD.ATTEMPT];
  const fence = ack[PARTICIPANT_ACK_FIELD.FENCE_TOKEN];
  const otherAttempt = Number.isSafeInteger(attempt) &&
    attempt !== recordAttempt;
  const earlierFence = Number.isInteger(fence) && fence < recordAttempt;
  return otherAttempt || earlierFence ?
    RECORD_CHANGE_REFUSAL.ATTEMPT_MISMATCH : null;
}

function acknowledgementRejectionOf(participant, key, status, fence,
  isAllowed) {
  if (!participant) {
    return PARTICIPANT_ACK_RESULT.PARTICIPANT_NOT_FOUND;
  }
  if (fence !== undefined && fence !== null &&
      participant.fenceToken !== undefined && participant.fenceToken !== null &&
      fence < participant.fenceToken) {
    return PARTICIPANT_ACK_RESULT.STALE_FENCE;
  }
  if (participant.status === status &&
      participant.acknowledgedAt !== undefined) {
    return PARTICIPANT_ACK_RESULT.DUPLICATE;
  }
  if (typeof isAllowed === 'function' &&
      !isAllowed(key, participant.status || null, status)) {
    return PARTICIPANT_ACK_RESULT.INVALID_TRANSITION;
  }
  return null;
}

/**
 * The terminal clear: the record holds this workflow under this owner at
 * `fence`, in one of `states`.
 * @param {Object} owner
 * @param {number|undefined} fence
 * @param {ReadonlySet<string>} states
 * @return {Function}
 */
function clearChange(owner, fence, states) {
  return ownedChange(owner, fence, (workflow) =>
    states.has(String(workflow.status)) ? RECORD_CLEARED :
      refuseRecordChange(RECORD_CHANGE_REFUSAL.STATE_NOT_EXPECTED));
}

/**
 * A step's change of the record whose own precondition (the step's expected
 * states) was false on the record: a refusal of the step, never a failure.
 * @param {*} error - What the step's transition threw.
 * @return {boolean}
 */
function isStepRefusedByRecord(error) {
  return error?.recordChangeOutcome === RECORD_CHANGE_OUTCOME.REFUSED &&
    error?.refusal?.reason === RECORD_CHANGE_REFUSAL.STATE_NOT_EXPECTED;
}

/**
 * A step's catch handler: a refusal by the record answers `value`; anything
 * else is rethrown.
 * @param {*} value
 * @return {Function}
 */
function refusedStepAs(value) {
  return (error) => {
    if (isStepRefusedByRecord(error)) {
      return value;
    }
    throw error;
  };
}

/**
 * A step's phase change: from one of `expectedStates` on the record to
 * `nextPhase`, `delta` merged onto the record's metadata.
 * @param {string} nextPhase
 * @param {ReadonlySet<string>} expectedStates
 * @param {Object} delta
 * @param {Function} [guard] - (workflow) => boolean, a further precondition
 *   on the record.
 * @return {Function}
 */
function phaseChange(nextPhase, expectedStates, delta, guard = () => true) {
  return (workflow) => (expectedStates.has(String(workflow.status)) &&
    guard(workflow) ? {...workflow, status: nextPhase,
      metadata: {...(workflow.metadata || {}), ...delta}} :
    refuseRecordChange(RECORD_CHANGE_REFUSAL.STATE_NOT_EXPECTED));
}

/**
 * The fail-safe abort's change: from a pre-cutover state on the record to
 * FAILED with `failure`; a record already FAILED is unchanged; any other
 * state refuses (the cutover landed first).
 * @param {ReadonlySet<string>} preCutoverStates
 * @param {Object} failure - The FAILURE metadata entry.
 * @return {Function}
 */
function abortChange(preCutoverStates, failure) {
  return (workflow) => {
    if (workflow.status === PARTITION_TRANSITION_STATE.FAILED) {
      return RECORD_UNCHANGED;
    }
    return preCutoverStates.has(String(workflow.status)) ? {...workflow,
      status: PARTITION_TRANSITION_STATE.FAILED,
      metadata: {...(workflow.metadata || {}),
        [PARTITION_TRANSITION_METADATA_FIELD.FAILURE]: failure}} :
      refuseRecordChange(RECORD_CHANGE_REFUSAL.STATE_NOT_EXPECTED);
  };
}

/**
 * The change of an execution outcome (a failure, a deferral, an admission
 * denial, a planning deferral) round 7, D4: from a pre-cutover record to
 * `status` with `delta` merged onto its metadata; an aborted (FAILED)
 * record is unchanged by a failure and refuses a deferral; a record at
 * cutover-or-later keeps its phase and records the outcome as a typed
 * post-cutover INCIDENT (the workflow continues forward to its terminal).
 * @param {string} status - The outcome's state.
 * @param {Object} delta - Metadata merged onto the record's.
 * @param {Object} incident - {reason, ...} recorded after the cutover.
 * @return {Function}
 */
function executionOutcomeChange(status, delta, incident) {
  return (workflow) => {
    if (workflow.status === STATE.FAILED) {
      return status === STATE.FAILED ? RECORD_UNCHANGED :
        refuseRecordChange(RECORD_CHANGE_REFUSAL.STATE_NOT_EXPECTED);
    }
    const metadata = workflow.metadata || {};
    if (isCutoverOrLater(workflow.status)) {
      const field = PARTITION_TRANSITION_METADATA_FIELD.POST_CUTOVER_INCIDENTS;
      return {...workflow, metadata: {...metadata, [field]: [
        ...(Array.isArray(metadata[field]) ? metadata[field] : []),
        {...incident, phase: workflow.status, outcome: status}]}};
    }
    return {...workflow, status, metadata: {...metadata, ...delta}};
  };
}

export {
  RECORD_CHANGE_REFUSAL,
  abortChange,
  executionOutcomeChange,
  isCutoverOrLater,
  phaseMonotonicChange,
  phaseChange,
  refusedStepAs,
  acknowledgementChange,
  clearChange,
  freshClaimChange,
  ownedChange,
  registrationChange,
  renewalChange,
  transitionChange,
};
