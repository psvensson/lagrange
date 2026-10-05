/**
 * Owner contract:
 * Owner: the in-memory registry of the split and merge workflows - a
 * PROJECTION of each workflow's last acknowledged durable record plus
 * non-durable runtime fields - and the only entry points that mutate it.
 * Every mutation is a change function applied by the record store
 * (managed-workflow-record-store.js) to the record at its turn (owner
 * decision 2026-10-05, option A); the projection advances only from a
 * record the store acknowledged.
 * Prohibited: a pre-built update object (throws), persisting the in-memory
 * state as it stands (persistWorkflowState, persistParticipantState,
 * persistParticipants, upsertParticipant, executeParticipantStage throw),
 * assigning a durable field (status, metadata, participants, claim triple)
 * from anything but a decoded record.
 */
import {DurableWorkflowCoordinator} from
  '../workflow/durable-workflow-coordinator.js';
import {
  PARTICIPANT_ACK_FIELD,
  PARTICIPANT_ACK_RESULT,
  WORKFLOW_CLAIM_RESULT,
  WORKFLOW_ERROR_MSG,
} from '../workflow/workflow-constants.js';
import {
  RECORD_CHANGE_KIND,
  RECORD_CHANGE_OUTCOME,
  applyRecordChange,
  applyRecordChangeOrThrow,
  forgetWorkflowRecord,
  recordBytesOf,
} from './managed-workflow-record-store.js';
import {
  acknowledgementChange,
  clearChange,
  freshClaimChange,
  ownedChange,
  registrationChange,
  renewalChange,
  transitionChange,
} from './managed-workflow-record-changes.js';

const FUNCTION_TYPE = 'function';
const OBJECT_TYPE = 'object';
// The coordinator's refused entry points (named in their errors).
const REFUSED_ENTRY = Object.freeze({
  TRANSITION_STEP: 'transitionStep',
  PERSIST_WORKFLOW_STATE: 'persistWorkflowState',
  PERSIST_PARTICIPANT_STATE: 'persistParticipantState',
  PERSIST_PARTICIPANTS: 'persistParticipants',
  UPSERT_PARTICIPANT: 'upsertParticipant',
  EXECUTE_PARTICIPANT_STAGE: 'executeParticipantStage',
});
// The answers under which an owner-recorded outcome is on the record.
const OWNER_OUTCOME_LANDED = Object.freeze(new Set([
  PARTICIPANT_ACK_RESULT.ACCEPTED,
  PARTICIPANT_ACK_RESULT.DUPLICATE,
]));
const COORDINATOR_ERROR_MSG = Object.freeze({
  OUTCOME_REFUSED: 'Owner-recorded workflow outcome refused by the record; ' +
    'the step is not complete and stays re-drivable',
  ACK_NOT_LANDED: 'Participant acknowledgement did not land for ',
  PRE_BUILT: 'Workflow record mutation refused: pass a change function of ' +
    'the stored record, never a pre-built update (',
  PERSIST_AS_IS: 'Workflow record mutation refused: the in-memory state is ' +
    'a projection of the record and is never persisted as it stands (',
});

// What a claim's refusal answers the claim machinery.
function claimResultOf(write) {
  if (write.outcome === RECORD_CHANGE_OUTCOME.UNCONFIRMED) {
    return WORKFLOW_CLAIM_RESULT.STORAGE_REJECTED;
  }
  return write.refusal?.reason ?? WORKFLOW_CLAIM_RESULT.STORAGE_REJECTED;
}

function assertChange(change, method) {
  if (typeof change === FUNCTION_TYPE || change === undefined ||
      change === null) {
    return;
  }
  if (typeof change === OBJECT_TYPE && Object.keys(change).length === 0) {
    return;
  }
  throw new TypeError(`${COORDINATOR_ERROR_MSG.PRE_BUILT}${method})`);
}

function assertTransition(transition) {
  if (!transition?.nextStep) {
    throw new Error(WORKFLOW_ERROR_MSG.NEXT_STEP_REQUIRED);
  }
  if (!transition?.reason) {
    throw new Error(WORKFLOW_ERROR_MSG.REASON_REQUIRED);
  }
}

function assertAcknowledgement(ack) {
  if (!ack?.[PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]) {
    throw new Error(WORKFLOW_ERROR_MSG.PARTICIPANT_KEY_REQUIRED);
  }
  if (!ack?.[PARTICIPANT_ACK_FIELD.STATUS]) {
    throw new Error(WORKFLOW_ERROR_MSG.ACK_STATUS_REQUIRED);
  }
}

// What a refused owner-recorded outcome's ERROR names.
function refusedOutcomeFieldsOf(workflowId, ack, result) {
  return {workflowId,
    participantKey: ack[PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY],
    status: ack[PARTICIPANT_ACK_FIELD.STATUS], result: result?.result,
    reason: result?.reason ?? null,
    receivedFenceToken: ack[PARTICIPANT_ACK_FIELD.FENCE_TOKEN] ?? null,
    currentFenceToken: result?.currentFenceToken ?? null,
    currentStatus: result?.currentStatus ?? null};
}

// The typed error of a step transition the record refused.
function transitionRefusedError(write) {
  return Object.assign(new Error(write.refusal?.details?.message ??
    WORKFLOW_ERROR_MSG.STALE_FENCE_TOKEN), {
    recordChangeOutcome: write.outcome, refusal: write.refusal ?? null,
    superseded: write.outcome === RECORD_CHANGE_OUTCOME.SUPERSEDED});
}

/**
 * The split/merge workflow registry over the record store.
 */
class RecordProjectedWorkflowCoordinator extends DurableWorkflowCoordinator {
  /**
   * @param {Object} options
   * @param {Object} options.owner - The workflow owner (the record store's
   *   decodeWorkflowRecord / encodeWorkflowRecord / encodeWorkflowRecordClear,
   *   workflowOwnerId, workflowLeaseMs, now, gateway, view).
   * @param {Function} [options.isParticipantTransitionAllowed]
   * @param {Function} [options.onAckRejection]
   * @param {Function} [options.now]
   */
  constructor(options = {}) {
    super({
      isParticipantTransitionAllowed: options.isParticipantTransitionAllowed,
      onAckRejection: options.onAckRejection,
      now: options.now,
    });
    this.recordOwner = options.owner;
  }

  /**
   * Register (or replace) the projection of one record.
   * @param {Object} workflow - The decoded record and runtime fields.
   * @return {Object} The registered projection.
   */
  adoptWorkflowProjection(workflow) {
    return this.setWorkflowState(this.createWorkflowRecord(workflow));
  }

  /**
   * Drop one projection and this owner's acknowledged record of it.
   * @param {string} workflowId
   * @return {Object|null}
   */
  removeWorkflow(workflowId) {
    forgetWorkflowRecord(this.recordOwner, workflowId);
    return super.removeWorkflow(workflowId);
  }

  // One change of a live workflow's record.
  applyLiveChange(workflowId, change, kind = RECORD_CHANGE_KIND.TRANSITION) {
    const live = this.requireWorkflow(workflowId);
    return applyRecordChange(this.recordOwner, workflowId, change,
      {tableId: live.tableId, kind});
  }

  /**
   * Claim before register: register a workflow whose content the caller
   * derived from `tableRowAsRead`; the registration is the claim, applied
   * only while the record is still exactly that read.
   * @param {Object} record - The registration (no claim fields).
   * @param {Object|null} tableRowAsRead
   * @return {Promise<Object>} {workflow} or {refusal, ...}.
   */
  async registerWorkflowFromRead(record, tableRowAsRead) {
    const registration = this.createWorkflowRecord(record);
    forgetWorkflowRecord(this.recordOwner, registration.workflowId);
    const write = await applyRecordChange(this.recordOwner,
      registration.workflowId, registrationChange(this.recordOwner,
        registration, recordBytesOf(tableRowAsRead)),
      {tableId: registration.tableId, readBase: tableRowAsRead ?? null});
    if (write.accepted) {
      return {workflow: write.workflow};
    }
    if (write.refusal?.reason === WORKFLOW_CLAIM_RESULT.ACTIVE_OWNER) {
      return {refusal: WORKFLOW_CLAIM_RESULT.ACTIVE_OWNER,
        recordOwnerId: write.refusal.details.recordOwnerId ?? null,
        recordLeaseExpiresAt:
          write.refusal.details.recordLeaseExpiresAt ?? null};
    }
    return {refusal: WORKFLOW_CLAIM_RESULT.STORAGE_REJECTED,
      recordChangeOutcome: write.outcome};
  }

  /**
   * Registration is registerWorkflowFromRead.
   * @return {Promise<never>}
   */
  async registerWorkflow() {
    throw new TypeError(`${COORDINATOR_ERROR_MSG.PRE_BUILT}registerWorkflow)`);
  }

  /**
   * A change of the workflow by its owner at the fence it holds.
   * @param {string} workflowId
   * @param {Function} change - (workflow, stored) => next | sentinel.
   * @return {Promise<Object>} The projection after the change landed.
   */
  async updateWorkflow(workflowId, change) {
    if (typeof change !== FUNCTION_TYPE) {
      throw new TypeError(`${COORDINATOR_ERROR_MSG.PRE_BUILT}updateWorkflow)`);
    }
    const live = this.requireWorkflow(workflowId);
    const write = await applyRecordChangeOrThrow(this.recordOwner,
      workflowId, ownedChange(this.recordOwner, live.fenceToken, change),
      {tableId: live.tableId});
    return write.workflow ?? this.getWorkflowById(workflowId);
  }

  /**
   * A fenced step transition; the step's own change rides it.
   * @param {string} workflowId
   * @param {Object} transition - {nextStep, reason, fenceToken, ownerId}.
   * @param {Function|Object} [change] - The step's change (an empty object
   *   is none).
   * @param {Object} [options] - {markCommitted}.
   * @return {Promise<Object>} The projection.
   */
  async transitionStep(workflowId, transition, change = null, options = {}) {
    assertTransition(transition);
    assertChange(change, REFUSED_ENTRY.TRANSITION_STEP);
    const live = this.requireWorkflow(workflowId);
    if (this.isTransitionIdempotent(workflowId, transition.nextStep)) {
      return live;
    }
    const write = await this.applyLiveChange(workflowId,
      transitionChange(this.recordOwner, transition,
        typeof change === FUNCTION_TYPE ? change : null,
        this.isTerminalWorkflow));
    if (!write.accepted) {
      throw transitionRefusedError(write);
    }
    if (options.markCommitted !== false &&
        write.outcome === RECORD_CHANGE_OUTCOME.ACCEPTED) {
      this.markTransitionCommitted(workflowId, transition.nextStep);
    }
    return write.workflow ?? this.getWorkflowById(workflowId);
  }

  /**
   * Claim (a new fence over the record's own) or renew (at the fence this
   * owner holds; `requireStates` narrows it to record states).
   * @param {string} workflowId
   * @param {Object} [claim] - {renew, requireStates}.
   * @return {Promise<Object>} {accepted, result, workflow}.
   */
  async claimWorkflow(workflowId, claim = {}) {
    const live = this.getWorkflowById(workflowId);
    if (!live) {
      return {accepted: false, result: WORKFLOW_CLAIM_RESULT.TERMINAL,
        workflow: null};
    }
    const change = claim.renew === true ?
      renewalChange(this.recordOwner, live.fenceToken,
        claim.requireStates ?? null) :
      freshClaimChange(this.recordOwner, this.isTerminalWorkflow);
    const write = await this.applyLiveChange(workflowId, change,
      RECORD_CHANGE_KIND.CLAIM);
    if (write.accepted) {
      return {accepted: true, result: WORKFLOW_CLAIM_RESULT.ACCEPTED,
        workflow: write.workflow ?? this.getWorkflowById(workflowId)};
    }
    if (write.submitError &&
        write.outcome === RECORD_CHANGE_OUTCOME.UNCONFIRMED) {
      // A submission that failed and moved nothing a read could see is the
      // submission's own failure, answered as such.
      throw write.submitError;
    }
    return {accepted: false, result: claimResultOf(write),
      outcome: write.outcome, workflow: this.getWorkflowById(workflowId)};
  }

  /**
   * A participant acknowledgement, checked against the RECORD's participant.
   * @param {string} workflowId
   * @param {Object} ack
   * @param {Object} [options] - {owned}: an owner-recorded outcome.
   * @return {Promise<Object>} Typed acknowledgement result.
   */
  async acknowledgeParticipant(workflowId, ack, options = {}) {
    assertAcknowledgement(ack);
    const change = acknowledgementChange(this.recordOwner, ack,
      this.isParticipantTransitionAllowed);
    // An owner-recorded outcome (dissolved, dissolution failed, target
    // provisioned) is the owner's fact: only the owner at the fence it holds
    // records it. A participant's own acknowledgement needs no ownership.
    const write = await this.applyLiveChange(workflowId,
      options.owned === true ? ownedChange(this.recordOwner,
        this.requireWorkflow(workflowId).fenceToken, change) : change);
    const key = String(ack[PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY]);
    if (write.outcome === RECORD_CHANGE_OUTCOME.ACCEPTED) {
      return {result: PARTICIPANT_ACK_RESULT.ACCEPTED, participantKey: key,
        acknowledgedAt: write.workflow?.participants?.get(key)
          ?.acknowledgedAt ?? this.now()};
    }
    if (write.outcome === RECORD_CHANGE_OUTCOME.REFUSED) {
      return this.respondToAckRejection(workflowId, write.refusal);
    }
    throw Object.assign(new Error(COORDINATOR_ERROR_MSG.ACK_NOT_LANDED +
      `${workflowId} (${write.outcome})`), {
      recordChangeOutcome: write.outcome,
      superseded: write.outcome === RECORD_CHANGE_OUTCOME.SUPERSEDED,
      unacknowledged: [], acknowledgedReplicaIds: []});
  }

  /**
   * An owner-recorded outcome (dissolved, dissolution failed, target
   * provisioned): an owned acknowledgement whose answer is CHECKED. Accepted,
   * or a duplicate of the recorded status, lands; any other answer is typed
   * and loud - one ERROR naming the workflow, the fences and the reason, and
   * a thrown error the step treats as incomplete (never dispatched-and-done).
   * @param {string} workflowId
   * @param {Object} ack
   * @return {Promise<Object>} The accepted acknowledgement result.
   */
  async acknowledgeOwnerOutcome(workflowId, ack) {
    const result = await this.acknowledgeParticipant(workflowId, ack,
      {owned: true});
    if (OWNER_OUTCOME_LANDED.has(result?.result)) {
      return result;
    }
    const fields = refusedOutcomeFieldsOf(workflowId, ack, result);
    this.recordOwner.logger?.error?.(COORDINATOR_ERROR_MSG.OUTCOME_REFUSED,
      fields);
    throw Object.assign(new Error(COORDINATOR_ERROR_MSG.OUTCOME_REFUSED +
      ` (${workflowId}: ${fields.status} ${fields.result})`), {
      acknowledgementRefused: fields, superseded: false, unacknowledged: [],
      acknowledgedReplicaIds: []});
  }

  // The typed rejection (and its diagnostic) of a refused acknowledgement.
  respondToAckRejection(workflowId, refusal) {
    const {participant, key, status, fence} = refusal.details;
    switch (refusal.reason) {
    case PARTICIPANT_ACK_RESULT.PARTICIPANT_NOT_FOUND:
      return this.rejectAckParticipantNotFound(workflowId, key, status);
    case PARTICIPANT_ACK_RESULT.STALE_FENCE:
      return this.rejectAckStaleFence(workflowId, participant, key, status,
        fence);
    case PARTICIPANT_ACK_RESULT.DUPLICATE:
      return this.rejectAckDuplicate(workflowId, participant, key, status);
    default:
      return this.validateParticipantTransitionGraph(workflowId,
        participant, key, status);
    }
  }

  /**
   * The terminal clear: the record of this owner at the fence it holds, in
   * one of `states`, is cleared.
   * @param {string} workflowId
   * @param {ReadonlySet<string>} states
   * @return {Promise<void>}
   */
  async clearWorkflowRecord(workflowId, states) {
    const live = this.requireWorkflow(workflowId);
    await applyRecordChangeOrThrow(this.recordOwner, workflowId,
      clearChange(this.recordOwner, live.fenceToken, states),
      {tableId: live.tableId});
  }

  /** @return {Promise<never>} */
  async persistWorkflowState() {
    throw new TypeError(`${COORDINATOR_ERROR_MSG.PERSIST_AS_IS}` +
      `${REFUSED_ENTRY.PERSIST_WORKFLOW_STATE})`);
  }

  /** @return {Promise<never>} */
  async persistParticipantState() {
    throw new TypeError(`${COORDINATOR_ERROR_MSG.PERSIST_AS_IS}` +
      `${REFUSED_ENTRY.PERSIST_PARTICIPANT_STATE})`);
  }

  /** @return {Promise<never>} */
  async persistParticipants() {
    throw new TypeError(`${COORDINATOR_ERROR_MSG.PERSIST_AS_IS}` +
      `${REFUSED_ENTRY.PERSIST_PARTICIPANTS})`);
  }

  /** @return {Promise<never>} */
  async upsertParticipant() {
    throw new TypeError(`${COORDINATOR_ERROR_MSG.PERSIST_AS_IS}` +
      `${REFUSED_ENTRY.UPSERT_PARTICIPANT})`);
  }

  /** @return {Promise<never>} */
  async executeParticipantStage() {
    throw new TypeError(`${COORDINATOR_ERROR_MSG.PERSIST_AS_IS}` +
      `${REFUSED_ENTRY.EXECUTE_PARTICIPANT_STAGE})`);
  }
}

export {RecordProjectedWorkflowCoordinator};
