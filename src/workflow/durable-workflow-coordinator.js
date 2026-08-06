import {
  PROTOTYPE_CONSTRUCTOR_METHOD,
  WORKFLOW_ERROR_MSG,
  WORKFLOW_TRANSITION_FIELD,
  buildTransitionIdempotencyKey,
} from './workflow-constants.js';
import {
  claimDurableWorkflow,
  transitionDurableWorkflow,
} from './durable-workflow-storage-ownership.js';
import {
  emitWorkflowAckRejectionDiagnostic,
} from './workflow-ack-rejection-diagnostics.js';
import {
  WorkflowParticipantAckMethods,
} from './workflow-participant-ack-methods.js';

const LOCAL_STR_UPDATEDAT = 'updatedAt';
const LOCAL_STR_FUNCTION = 'function';
const LOCAL_STR_METADATA = 'metadata';

/**
 * Generic durable workflow runtime with optional participant persistence.
 */
class DurableWorkflowCoordinator {
  /**
   * @param {Object} options - Coordinator options.
   * @param {Function} [options.persistWorkflow] - Persist workflow callback.
   * @param {Function} [options.persistParticipant] - Persist participant callback.
   * @param {Function} [options.onAckRejection] - Diagnostic callback invoked
   *   when a participant acknowledgement is rejected (stale fence, duplicate,
   *   or participant not found). Receives a typed diagnostic record.
   * @param {Function} [options.now] - Clock function.
   */
  constructor(options = {}) {
    this.persistWorkflow = options.persistWorkflow || (async () => {});
    this.persistWorkflowClaim = options.persistWorkflowClaim || null;
    this.persistWorkflowTransition = options.persistWorkflowTransition || null;
    this.persistParticipant = options.persistParticipant || (async () => {});
    this.isTerminalWorkflow = options.isTerminalWorkflow || (() => false);
    this.onAckRejection = options.onAckRejection || null;
    // Optional explicit participant transition graph validator:
    // (participantKey, fromStatus, toStatus) => boolean. When wired, an
    // acknowledgement whose (from, to) edge is absent from the graph is
    // rejected with a typed INVALID_TRANSITION outcome before any state
    // is applied.
    this.isParticipantTransitionAllowed =
      options.isParticipantTransitionAllowed || null;
    this.now = options.now || (() => Date.now());
    this.workflowsById = new Map();
    this.workflowsByOwnerKey = new Map();
    this.inFlightExecutionsByOwnerKey = new Map();
    this.committedTransitions = new Set();
  }

  /**
   * Register and persist one workflow state record.
   * @param {Object} record - Workflow record.
   * @return {Promise<Object>} Normalized workflow state.
   */
  async registerWorkflow(record) {
    const workflow = this.createWorkflowRecord(record);
    this.setWorkflowState(workflow);
    try {
      await this.persistWorkflow(workflow);
    } catch (error) {
      if (this.workflowsById.get(workflow.workflowId) === workflow) {
        this.removeWorkflow(workflow.workflowId);
      }
      throw error;
    }
    return workflow;
  }

  /**
   * Update and persist one workflow state record.
   *
   * The candidate is persisted BEFORE the in-memory record advances, and
   * a persistence rejection restores the previous state — the in-memory
   * registry must never run ahead of the durable row (registerWorkflow
   * already rolls back this way).
   * @param {string} workflowId - Workflow ID.
   * @param {Object} updates - Workflow field updates.
   * @return {Promise<Object>} Updated workflow state.
   */
  async updateWorkflow(workflowId, updates = {}) {
    const workflow = this.requireWorkflow(workflowId);
    const previousState = {...workflow};
    const candidate = {
      ...workflow,
      ...updates,
      participants: updates.participants instanceof Map ?
        new Map(updates.participants.entries()) :
        workflow.participants,
      updatedAt: Object.prototype.hasOwnProperty.call(
        updates,
        LOCAL_STR_UPDATEDAT,
      ) ?
        updates.updatedAt :
        this.now(),
    };
    try {
      await this.persistWorkflow(candidate);
    } catch (error) {
      for (const key of Object.keys(workflow)) {
        if (!Object.prototype.hasOwnProperty.call(previousState, key)) {
          delete workflow[key];
        }
      }
      Object.assign(workflow, previousState);
      workflow.participants = previousState.participants;
      throw error;
    }
    for (const key of Object.keys(workflow)) {
      if (!Object.prototype.hasOwnProperty.call(candidate, key)) {
        delete workflow[key];
      }
    }
    Object.assign(workflow, candidate);
    workflow.participants = candidate.participants;
    return workflow;
  }

  /**
   * Record a durable monotonic step transition on a workflow.
   *
   * Each transition persists previousStep, nextStep, reason, timestamp,
   * and ownerKey as required by the durable workflow contract.
   *
   * @param {string} workflowId - Workflow ID.
   * @param {Object} transition - Transition descriptor.
   * @param {string} transition.nextStep - Target step.
   * @param {string} transition.reason - Human/machine-readable reason.
   * @param {Object} [transition.metadata] - Extra fields merged into the
   *   transition history entry.
   * @param {Object} [updates] - Additional workflow field updates applied
   *   alongside the transition.
   * @return {Promise<Object>} Updated workflow state.
   */
  /**
     * Record a durable monotonic step transition on a workflow.
     *
     * Each transition persists previousStep, nextStep, reason, timestamp,
     * ownerKey, and fenceToken as required by the durable workflow contract.
     *
     * When a fence token is provided in the transition, it is validated
     * against the workflow's current fence token. If the workflow already
     * has a fence token that is strictly greater than the provided one,
     * the transition is rejected as stale.
     *
     * @param {string} workflowId - Workflow ID.
     * @param {Object} transition - Transition descriptor.
     * @param {string} transition.nextStep - Target step.
     * @param {string} transition.reason - Human/machine-readable reason.
     * @param {number} [transition.fenceToken] - Owner epoch / lease token.
     * @param {string} [transition.ownerId] - Storage-backed lease owner.
     * @param {Object} [transition.metadata] - Extra fields merged into the
     *   transition history entry.
     * @param {Object} [updates] - Additional workflow field updates applied
     *   alongside the transition.
     * @param {Object} [options] - Transition behavior options.
     * @param {boolean} [options.markCommitted=true] - Whether to mark the
     *   transition idempotency key as committed after persistence.
     * @return {Promise<Object>} Updated workflow state.
     */
  async transitionStep(workflowId, transition, updates = {}, options = {}) {
    const nextStep = transition?.nextStep;
    if (!nextStep) {
      throw new Error(WORKFLOW_ERROR_MSG.NEXT_STEP_REQUIRED);
    }
    const reason = transition?.reason;
    if (!reason) {
      throw new Error(WORKFLOW_ERROR_MSG.REASON_REQUIRED);
    }

    const workflow = this.requireWorkflow(workflowId);

    if (this.isTransitionIdempotent(workflowId, nextStep)) {
      return workflow;
    }

    await transitionDurableWorkflow(this, workflow, transition, updates);
    if (options.markCommitted !== false) {
      this.markTransitionCommitted(workflowId, nextStep);
    }
    return workflow;
  }

  /**
   * Acquire or renew storage-backed workflow ownership.
   * @param {string} workflowId
   * @param {Object} claim
   * @return {Promise<Object>}
   */
  async claimWorkflow(workflowId, claim = {}) {
    return claimDurableWorkflow(this, workflowId, claim);
  }

  /**
   * Persist the current workflow state.
   * @param {string} workflowId - Workflow ID.
   * @return {Promise<Object>} Persisted workflow state.
   */
  async persistWorkflowState(workflowId) {
    const workflow = this.requireWorkflow(workflowId);
    await this.persistWorkflow(workflow);
    return workflow;
  }

  /**
   * Remove one workflow from the in-memory registry.
   * @param {string} workflowId - Workflow ID.
   * @return {Object|null} Removed workflow state.
   */
  removeWorkflow(workflowId) {
    const workflow = this.getWorkflowById(workflowId);
    if (!workflow) {
      return null;
    }
    this.workflowsById.delete(workflowId);
    if (workflow.ownerKey) {
      this.workflowsByOwnerKey.delete(workflow.ownerKey);
    }
    this.clearCommittedTransitions(workflowId);
    return workflow;
  }

  /**
   * Remove all committed-transition idempotency keys for a workflow.
   * @param {string} workflowId - Workflow ID.
   * @private
   */
  clearCommittedTransitions(workflowId) {
    const prefix = `${workflowId}:`;
    for (const key of this.committedTransitions) {
      if (key.startsWith(prefix)) {
        this.committedTransitions.delete(key);
      }
    }
  }

  /**
   * Get one workflow by workflow ID.
   * @param {string} workflowId - Workflow ID.
   * @return {Object|null} Workflow state.
   */
  getWorkflowById(workflowId) {
    return this.workflowsById.get(workflowId) || null;
  }

  /**
   * Get one workflow by owner key.
   * @param {string} ownerKey - Workflow owner key.
   * @return {Object|null} Workflow state.
   */
  getWorkflowByOwnerKey(ownerKey) {
    return this.workflowsByOwnerKey.get(ownerKey) || null;
  }

  /**
   * Upsert and persist one workflow participant record.
   * @param {string} workflowId - Workflow ID.
   * @param {Object} record - Participant record.
   * @return {Promise<Object>} Normalized participant state.
   */
  async upsertParticipant(workflowId, record) {
    const workflow = this.requireWorkflow(workflowId);
    const existingKey = this.resolveParticipantKey(record);
    const existing = existingKey ? workflow.participants.get(existingKey) : null;
    const participant = this.createParticipantRecord(workflowId, record, existing);
    workflow.participants.set(participant.participantKey, participant);
    if (!existing) {
      // Monotonic enlistment witness: a workflow that ever enlisted a
      // participant must never later commit against an empty registry
      // (the run-23 orphaned-BEGIN shape).
      workflow.enlistedParticipantCount =
        (workflow.enlistedParticipantCount || 0) + 1;
    }
    try {
      await this.persistParticipant(participant);
    } catch (error) {
      if (existing) {
        workflow.participants.set(participant.participantKey, existing);
      } else {
        workflow.participants.delete(participant.participantKey);
        workflow.enlistedParticipantCount = Math.max(
          0,
          (workflow.enlistedParticipantCount || 1) - 1,
        );
      }
      throw error;
    }
    return participant;
  }

  /**
   * Persist the current participant state.
   * @param {string} workflowId - Workflow ID.
   * @param {string} participantKey - Participant key.
   * @return {Promise<Object>} Persisted participant state.
   */
  async persistParticipantState(workflowId, participantKey) {
    const workflow = this.requireWorkflow(workflowId);
    const participant = workflow.participants.get(participantKey);
    if (!participant) {
      throw new Error(WORKFLOW_ERROR_MSG.participantNotFound(participantKey));
    }
    await this.persistParticipant(participant);
    return participant;
  }

  /**
   * Persist a selected participant set.
   * @param {string} workflowId - Workflow ID.
   * @param {string[]} participantKeys - Participant keys to persist.
   * @return {Promise<void>}
   */
  async persistParticipants(workflowId, participantKeys) {
    for (const participantKey of participantKeys) {
      await this.persistParticipantState(workflowId, participantKey);
    }
  }

  /**
   * Execute one participant stage with durable participant updates.
   * @param {string} workflowId - Workflow ID.
   * @param {string} transientStatus - Status while the stage is running.
   * @param {string} successStatus - Status on success.
   * @param {Function} operation - Participant operation callback.
   * @param {Object} [options] - Stage options.
   * @param {string} [options.failureStatus] - Status on failure.
   * @param {string[]} [options.participantKeys] - Participant order.
   * @return {Promise<Object[]>} Failed participant records.
   */
  async executeParticipantStage(
    workflowId,
    transientStatus,
    successStatus,
    operation,
    options = {},
  ) {
    const workflow = this.requireWorkflow(workflowId);
    const participantKeys = Array.isArray(options.participantKeys) &&
      options.participantKeys.length > 0 ?
      options.participantKeys :
      Array.from(workflow.participants.keys());
    const failureStatus = options.failureStatus || 'FAILED';
    const failedParticipants = [];
    // A workflow that enlisted participants must never run a stage against
    // an empty registry: the run-23 coordinator committed with zero
    // iterations after recovery emptied its participants Map, orphaning a
    // delivered participant BEGIN forever. Zero-participant stages stay
    // legal for workflows that never enlisted anyone.
    if (
      participantKeys.length === 0 &&
      (workflow.enlistedParticipantCount || 0) > 0
    ) {
      failedParticipants.push({
        participantId: null,
        participantKey: null,
        error: WORKFLOW_ERROR_MSG.ENLISTED_PARTICIPANTS_MISSING,
      });
      return failedParticipants;
    }

    for (const participantKey of participantKeys) {
      const participant = workflow.participants.get(participantKey);
      if (!participant) {
        // A REQUESTED key missing from the registry is lost enlistment
        // state, not a skippable no-op.
        failedParticipants.push({
          participantId: null,
          participantKey,
          error: WORKFLOW_ERROR_MSG.ENLISTED_PARTICIPANTS_MISSING,
        });
        continue;
      }

      participant.status = transientStatus;
      participant.updatedAt = this.now();
      participant.lastError = null;
      await this.persistParticipant(participant);

      try {
        await operation(participantKey, participant);
        participant.status = successStatus;
        participant.updatedAt = this.now();
        participant.lastError = null;
      } catch (error) {
        participant.status = failureStatus;
        participant.updatedAt = this.now();
        participant.lastError = error.message;
        failedParticipants.push({
          participantId: participant.participantId,
          participantKey,
          error: error.message,
        });
      }
      await this.persistParticipant(participant);
    }

    return failedParticipants;
  }

  /**
   * Recover workflow and participant state from canonical row arrays.
   * @param {Object} payload - Recovery payload.
   * @param {Object[]} [payload.workflows] - Workflow rows.
   * @param {Object[]} [payload.participants] - Participant rows.
   * @param {Function} payload.loadWorkflow - Workflow row loader.
   * @param {Function} [payload.loadParticipant] - Participant row loader.
   * @param {Function} [payload.isTerminalWorkflow] - Terminal-state predicate.
   */
  recover(payload = {}) {
    const workflowRows = Array.isArray(payload.workflows) ? payload.workflows : [];
    const participantRows = Array.isArray(payload.participants) ?
      payload.participants :
      [];
    const loadWorkflow = payload.loadWorkflow;
    const loadParticipant = payload.loadParticipant;
    const isTerminalWorkflow = payload.isTerminalWorkflow;

    const restoredWorkflowIds = new Set();
    for (const row of workflowRows) {
      const restored = this.restoreRecoveredWorkflowRow(
        row,
        loadWorkflow,
        isTerminalWorkflow,
      );
      if (restored) {
        restoredWorkflowIds.add(restored.workflowId);
      }
    }

    for (const row of participantRows) {
      this.restoreRecoveredParticipantRow(row, loadParticipant);
    }
    return {restoredWorkflowIds};
  }

  /**
   * Restore one participant cache row into its workflow registry, filling
   * gaps only — an in-memory participant is fresher than its cache row,
   * so a live status is never overwritten by a recovered row.
   * @param {Object} row - Raw participant cache row.
   * @param {Function} [loadParticipant] - Participant row loader.
   * @return {void}
   * @private
   */
  restoreRecoveredParticipantRow(row, loadParticipant) {
    const participantRecord = typeof loadParticipant === 'function' ?
      loadParticipant(row) :
      row;
    if (!participantRecord) {
      return;
    }
    const workflowId = String(participantRecord.workflowId || '');
    if (!workflowId) {
      return;
    }
    const workflow = this.getWorkflowById(workflowId);
    if (!workflow) {
      return;
    }
    const participantKey = this.resolveParticipantKey(participantRecord);
    if (participantKey && workflow.participants.has(participantKey)) {
      return;
    }
    const participant = this.createParticipantRecord(workflowId, participantRecord);
    workflow.participants.set(participant.participantKey, participant);
  }

  /**
   * Run one execution per owner key at a time.
   * @param {string} ownerKey - Workflow owner key.
   * @param {Function} executionFactory - Async execution factory.
   * @return {Promise<*>} Shared execution promise.
   */
  runExclusive(ownerKey, executionFactory) {
    const normalizedOwnerKey = String(ownerKey || '');
    if (!normalizedOwnerKey) {
      throw new Error(WORKFLOW_ERROR_MSG.OWNER_KEY_REQUIRED);
    }
    if (this.inFlightExecutionsByOwnerKey.has(normalizedOwnerKey)) {
      return this.inFlightExecutionsByOwnerKey.get(normalizedOwnerKey);
    }

    let execution;
    try {
      execution = Promise.resolve(executionFactory());
    } catch (error) {
      execution = Promise.reject(error);
    }
    const trackedExecution = execution
      .finally(() => {
        this.inFlightExecutionsByOwnerKey.delete(normalizedOwnerKey);
      });
    this.inFlightExecutionsByOwnerKey.set(normalizedOwnerKey, trackedExecution);
    return trackedExecution;
  }

  /**
   * Normalize one workflow record.
   * @param {Object} record - Raw workflow record.
   * @return {Object} Workflow state.
   * @private
   */
  createWorkflowRecord(record = {}) {
    const workflowId = String(record.workflowId || '');
    const ownerKey = String(record.ownerKey || '');
    if (!workflowId) {
      throw new Error(WORKFLOW_ERROR_MSG.WORKFLOW_ID_REQUIRED);
    }
    if (!ownerKey) {
      throw new Error(WORKFLOW_ERROR_MSG.OWNER_KEY_REQUIRED);
    }

    const createdAt = Number.isFinite(record.createdAt) ?
      record.createdAt :
      this.now();
    const updatedAt = Number.isFinite(record.updatedAt) ?
      record.updatedAt :
      createdAt;
    return {
      ...record,
      workflowId,
      ownerKey,
      metadata: Object.prototype.hasOwnProperty.call(record, LOCAL_STR_METADATA) ?
        record.metadata :
        null,
      participants: record.participants instanceof Map ?
        new Map(record.participants.entries()) :
        new Map(),
      createdAt,
      updatedAt,
    };
  }

  /**
   * Normalize one participant record.
   * @param {string} workflowId - Workflow ID.
   * @param {Object} record - Raw participant record.
   * @param {Object|null} [existing] - Existing participant state.
   * @return {Object} Participant state.
   * @private
   */
  createParticipantRecord(workflowId, record = {}, existing = null) {
    const participantId = String(
      record.participantId || existing?.participantId || '',
    );
    if (!participantId) {
      throw new Error(WORKFLOW_ERROR_MSG.PARTICIPANT_ID_REQUIRED);
    }

    const participantKey = this.resolveParticipantKey(record) ||
      existing?.participantKey ||
      participantId;
    const createdAt = this.resolveParticipantTimestamp(
      record.createdAt, existing?.createdAt,
    );
    const updatedAt = Number.isFinite(record.updatedAt) ?
      record.updatedAt :
      this.now();
    return {
      ...existing,
      ...record,
      workflowId,
      participantId,
      participantKey,
      createdAt,
      updatedAt,
    };
  }

  /**
   * Resolve one participant timestamp: prefer the raw record, fall back
   * to the existing participant, then to the coordinator clock.
   * @param {*} recordValue - Timestamp on the raw record.
   * @param {*} existingValue - Timestamp on the existing participant.
   * @return {number}
   * @private
   */
  resolveParticipantTimestamp(recordValue, existingValue) {
    if (Number.isFinite(recordValue)) {
      return recordValue;
    }
    if (Number.isFinite(existingValue)) {
      return existingValue;
    }
    return this.now();
  }

  /**
   * Restore one workflow row unless a LIVE in-memory workflow exists: the
   * cache rows lag CDC and the rebuilt record starts with an EMPTY
   * participants registry — the run-23 clobber orphaned an already-enlisted
   * participant BEGIN that way, and the coordinator then committed against
   * the empty set. Recovery exists to restore state after a restart
   * (nothing live) or to refresh terminal records.
   * @return {Object|null} The restored workflow, or null when skipped.
   * @private
   */
  restoreRecoveredWorkflowRow(row, loadWorkflow, isTerminalWorkflow) {
    const workflowRecord = typeof loadWorkflow === 'function' ?
      loadWorkflow(row) :
      row;
    if (!workflowRecord) {
      return null;
    }
    if (typeof isTerminalWorkflow === LOCAL_STR_FUNCTION &&
        isTerminalWorkflow(workflowRecord, row)) {
      return null;
    }
    const existingWorkflow = this.getWorkflowById(
      String(workflowRecord.workflowId || ''),
    );
    const existingIsLive =
      existingWorkflow &&
      !(typeof isTerminalWorkflow === LOCAL_STR_FUNCTION &&
        isTerminalWorkflow(existingWorkflow, null));
    if (existingIsLive) {
      return null;
    }
    return this.setWorkflowState(this.createWorkflowRecord(workflowRecord));
  }

  /**
   * Store a workflow in both registries.
   * @param {Object} workflow - Workflow state.
   * @return {Object} Workflow state.
   * @private
   */
  setWorkflowState(workflow) {
    this.workflowsById.set(workflow.workflowId, workflow);
    this.workflowsByOwnerKey.set(workflow.ownerKey, workflow);
    for (const transition of workflow.transitionHistory || []) {
      if (transition?.[WORKFLOW_TRANSITION_FIELD.NEXT_STEP]) {
        this.markTransitionCommitted(
          workflow.workflowId,
          transition[WORKFLOW_TRANSITION_FIELD.NEXT_STEP],
        );
      }
    }
    return workflow;
  }

  /**
   * Resolve the canonical participant key.
   * @param {Object} record - Participant record.
   * @return {string} Participant key.
   * @private
   */
  resolveParticipantKey(record = {}) {
    const participantKey = record.participantKey ||
      record.partitionId ||
      record.participantId ||
      '';
    return String(participantKey || '');
  }

  /**
   * Check whether a transition has already been committed.
   * @param {string} operationId - Operation or workflow ID.
   * @param {string} stepId - Target step of the transition.
   * @return {boolean} True if the transition was already committed.
   */
  isTransitionIdempotent(operationId, stepId) {
    const key = buildTransitionIdempotencyKey(operationId, stepId);
    return this.committedTransitions.has(key);
  }

  /**
   * Mark a transition as committed so replays are rejected.
   * @param {string} operationId - Operation or workflow ID.
   * @param {string} stepId - Target step of the transition.
   */
  markTransitionCommitted(operationId, stepId) {
    const key = buildTransitionIdempotencyKey(operationId, stepId);
    this.committedTransitions.add(key);
  }

  /**
   * Emit a typed diagnostic record for a rejected acknowledgement.
   * @param {string} workflowId - Workflow ID.
   * @param {string} participantKey - Participant key.
   * @param {Object} context - Rejection context fields.
   * @return {Object|null} The emitted diagnostic record, or null.
   * @private
   */
  emitAckRejectionDiagnostic(workflowId, participantKey, context = {}) {
    return emitWorkflowAckRejectionDiagnostic(
      this,
      workflowId,
      participantKey,
      context,
    );
  }

  /**
   * Require one workflow to exist.
   * @param {string} workflowId - Workflow ID.
   * @return {Object} Workflow state.
   * @private
   */
  requireWorkflow(workflowId) {
    const workflow = this.getWorkflowById(workflowId);
    if (!workflow) {
      throw new Error(WORKFLOW_ERROR_MSG.workflowNotFound(workflowId));
    }
    return workflow;
  }
}

for (const methodName of Object.getOwnPropertyNames(
  WorkflowParticipantAckMethods.prototype,
)) {
  if (methodName === PROTOTYPE_CONSTRUCTOR_METHOD) {
    continue;
  }
  Object.defineProperty(
    DurableWorkflowCoordinator.prototype,
    methodName,
    Object.getOwnPropertyDescriptor(
      WorkflowParticipantAckMethods.prototype,
      methodName,
    ),
  );
}

export {
  DurableWorkflowCoordinator,
};
