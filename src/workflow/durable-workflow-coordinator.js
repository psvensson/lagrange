import {
  WORKFLOW_ERROR_MSG,
  WORKFLOW_TRANSITION_FIELD,
  PARTICIPANT_ACK_RESULT,
  PARTICIPANT_ACK_FIELD,
  ACK_REJECTION_DIAGNOSTIC_FIELD,
  buildTransitionIdempotencyKey,
} from './workflow-constants.js';

const LOCAL_STR_UPDATEDAT = 'updatedAt';
const LOCAL_STR_OBJECT = 'object';
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
    this.persistParticipant = options.persistParticipant || (async () => {});
    this.onAckRejection = options.onAckRejection || null;
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
    await this.persistWorkflow(workflow);
    return workflow;
  }

  /**
   * Update and persist one workflow state record.
   * @param {string} workflowId - Workflow ID.
   * @param {Object} updates - Workflow field updates.
   * @return {Promise<Object>} Updated workflow state.
   */
  async updateWorkflow(workflowId, updates = {}) {
    const workflow = this.requireWorkflow(workflowId);
    Object.assign(workflow, updates);
    if (updates.participants instanceof Map) {
      workflow.participants = new Map(updates.participants.entries());
    }
    if (!Object.prototype.hasOwnProperty.call(updates, LOCAL_STR_UPDATEDAT)) {
      workflow.updatedAt = this.now();
    }
    await this.persistWorkflow(workflow);
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

    const transitionFence = transition.fenceToken;
    if (transitionFence !== undefined && transitionFence !== null) {
      const currentFence = workflow.fenceToken;
      if (currentFence !== undefined && currentFence !== null &&
            transitionFence < currentFence) {
        throw new Error(WORKFLOW_ERROR_MSG.STALE_FENCE_TOKEN);
      }
      workflow.fenceToken = transitionFence;
    }

    const previousStep = workflow.step || null;
    const now = this.now();

    const historyEntry = {
      [WORKFLOW_TRANSITION_FIELD.PREVIOUS_STEP]: previousStep,
      [WORKFLOW_TRANSITION_FIELD.NEXT_STEP]: nextStep,
      [WORKFLOW_TRANSITION_FIELD.REASON]: reason,
      [WORKFLOW_TRANSITION_FIELD.TIMESTAMP]: now,
      [WORKFLOW_TRANSITION_FIELD.OWNER_KEY]: workflow.ownerKey,
      [WORKFLOW_TRANSITION_FIELD.FENCE_TOKEN]:
          workflow.fenceToken ?? null,
    };
    if (transition.metadata &&
          typeof transition.metadata === LOCAL_STR_OBJECT) {
      Object.assign(historyEntry, transition.metadata);
    }

    if (!Array.isArray(workflow.transitionHistory)) {
      workflow.transitionHistory = [];
    }
    workflow.transitionHistory.push(historyEntry);

    workflow.step = nextStep;
    workflow.updatedAt = now;
    Object.assign(workflow, updates);

    await this.persistWorkflow(workflow);
    if (options.markCommitted !== false) {
      this.markTransitionCommitted(workflowId, nextStep);
    }
    return workflow;
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
    await this.persistParticipant(participant);
    return participant;
  }

  /**
   * Process a typed participant acknowledgement with fence validation.
   *
   * Validates workflow identity, participant identity, and fence token
   * before persisting the acknowledgement. Returns a typed result so the
   * caller can distinguish accepted, stale, duplicate, and not-found
   * outcomes without catching exceptions.
   *
   * @param {string} workflowId - Workflow ID.
   * @param {Object} ack - Acknowledgement payload.
   * @param {string} ack.participantKey - Participant key.
   * @param {string} ack.status - New participant status.
   * @param {number} [ack.fenceToken] - Epoch or lease token.
   * @param {Object} [ack.checkpoint] - Resumable checkpoint data.
   * @return {Promise<Object>} Typed acknowledgement result with
   *   `result` (PARTICIPANT_ACK_RESULT), `participantKey`, and
   *   optional `reason`.
   */
  async acknowledgeParticipant(workflowId, ack) {
    const participantKey =
      ack?.[PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY] || '';
    if (!participantKey) {
      throw new Error(WORKFLOW_ERROR_MSG.PARTICIPANT_KEY_REQUIRED);
    }
    const ackStatus = ack?.[PARTICIPANT_ACK_FIELD.STATUS] || '';
    if (!ackStatus) {
      throw new Error(WORKFLOW_ERROR_MSG.ACK_STATUS_REQUIRED);
    }

    const workflow = this.requireWorkflow(workflowId);
    const participant = workflow.participants.get(participantKey);
    if (!participant) {
      const notFoundResult = {
        result: PARTICIPANT_ACK_RESULT.PARTICIPANT_NOT_FOUND,
        participantKey,
        reason: WORKFLOW_ERROR_MSG.participantNotFound(participantKey),
      };
      this.emitAckRejectionDiagnostic(workflowId, participantKey, {
        rejectionResult: PARTICIPANT_ACK_RESULT.PARTICIPANT_NOT_FOUND,
        reason: notFoundResult.reason,
        receivedStatus: ackStatus,
      });
      return notFoundResult;
    }

    // Fence token validation: reject stale acknowledgements.
    const ackFence = ack?.[PARTICIPANT_ACK_FIELD.FENCE_TOKEN];
    if (ackFence !== undefined && ackFence !== null) {
      const currentFence = participant.fenceToken;
      if (currentFence !== undefined && currentFence !== null &&
          ackFence < currentFence) {
        const staleResult = {
          result: PARTICIPANT_ACK_RESULT.STALE_FENCE,
          participantKey,
          reason: WORKFLOW_ERROR_MSG.STALE_FENCE_TOKEN,
          currentFenceToken: currentFence,
          receivedFenceToken: ackFence,
        };
        this.emitAckRejectionDiagnostic(workflowId, participantKey, {
          rejectionResult: PARTICIPANT_ACK_RESULT.STALE_FENCE,
          reason: WORKFLOW_ERROR_MSG.STALE_FENCE_TOKEN,
          receivedStatus: ackStatus,
          currentFenceToken: currentFence,
          receivedFenceToken: ackFence,
        });
        return staleResult;
      }
      participant.fenceToken = ackFence;
    }

    // Duplicate detection: same status already acknowledged.
    if (participant.status === ackStatus &&
        participant.acknowledgedAt !== undefined) {
      const duplicateResult = {
        result: PARTICIPANT_ACK_RESULT.DUPLICATE,
        participantKey,
        reason: WORKFLOW_ERROR_MSG.DUPLICATE_TRANSITION,
      };
      this.emitAckRejectionDiagnostic(workflowId, participantKey, {
        rejectionResult: PARTICIPANT_ACK_RESULT.DUPLICATE,
        reason: WORKFLOW_ERROR_MSG.DUPLICATE_TRANSITION,
        receivedStatus: ackStatus,
        currentStatus: participant.status,
      });
      return duplicateResult;
    }

    // Apply acknowledgement.
    const now = this.now();
    participant.status = ackStatus;
    participant.acknowledgedAt = now;
    participant.updatedAt = now;

    // Persist checkpoint data alongside participant state.
    const checkpoint = ack?.[PARTICIPANT_ACK_FIELD.CHECKPOINT];
    if (checkpoint !== undefined && checkpoint !== null) {
      participant.checkpoint = checkpoint;
    }

    await this.persistParticipant(participant);

    return {
      result: PARTICIPANT_ACK_RESULT.ACCEPTED,
      participantKey,
      acknowledgedAt: now,
    };
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

    for (const participantKey of participantKeys) {
      const participant = workflow.participants.get(participantKey);
      if (!participant) {
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

    for (const row of workflowRows) {
      const workflowRecord = typeof loadWorkflow === 'function' ?
        loadWorkflow(row) :
        row;
      if (!workflowRecord) {
        continue;
      }
      if (typeof isTerminalWorkflow === LOCAL_STR_FUNCTION &&
          isTerminalWorkflow(workflowRecord, row)) {
        continue;
      }
      this.setWorkflowState(this.createWorkflowRecord(workflowRecord));
    }

    for (const row of participantRows) {
      const participantRecord = typeof loadParticipant === 'function' ?
        loadParticipant(row) :
        row;
      if (!participantRecord) {
        continue;
      }
      const workflowId = String(participantRecord.workflowId || '');
      if (!workflowId) {
        continue;
      }
      const workflow = this.getWorkflowById(workflowId);
      if (!workflow) {
        continue;
      }
      const participant = this.createParticipantRecord(workflowId, participantRecord);
      workflow.participants.set(participant.participantKey, participant);
    }
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
    const createdAt = Number.isFinite(record.createdAt) ?
      record.createdAt :
      existing?.createdAt || this.now();
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
   * Store a workflow in both registries.
   * @param {Object} workflow - Workflow state.
   * @return {Object} Workflow state.
   * @private
   */
  setWorkflowState(workflow) {
    this.workflowsById.set(workflow.workflowId, workflow);
    this.workflowsByOwnerKey.set(workflow.ownerKey, workflow);
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
   *
   * Invokes the onAckRejection callback (if wired) with a frozen
   * diagnostic record containing workflow identity, participant key,
   * rejection result, reason, and fence/status context.
   *
   * @param {string} workflowId - Workflow ID.
   * @param {string} participantKey - Participant key.
   * @param {Object} context - Rejection context fields.
   * @return {Object|null} The emitted diagnostic record, or null.
   * @private
   */
  emitAckRejectionDiagnostic(workflowId, participantKey, context = {}) {
    if (typeof this.onAckRejection !== LOCAL_STR_FUNCTION) {
      return null;
    }
    const record = Object.freeze({
      [ACK_REJECTION_DIAGNOSTIC_FIELD.WORKFLOW_ID]: workflowId,
      [ACK_REJECTION_DIAGNOSTIC_FIELD.PARTICIPANT_KEY]: participantKey,
      [ACK_REJECTION_DIAGNOSTIC_FIELD.REJECTION_RESULT]:
        context.rejectionResult || null,
      [ACK_REJECTION_DIAGNOSTIC_FIELD.REASON]:
        context.reason || null,
      [ACK_REJECTION_DIAGNOSTIC_FIELD.RECEIVED_STATUS]:
        context.receivedStatus || null,
      [ACK_REJECTION_DIAGNOSTIC_FIELD.CURRENT_STATUS]:
        context.currentStatus || null,
      [ACK_REJECTION_DIAGNOSTIC_FIELD.RECEIVED_FENCE_TOKEN]:
        context.receivedFenceToken ?? null,
      [ACK_REJECTION_DIAGNOSTIC_FIELD.CURRENT_FENCE_TOKEN]:
        context.currentFenceToken ?? null,
      [ACK_REJECTION_DIAGNOSTIC_FIELD.TIMESTAMP]: this.now(),
    });
    this.onAckRejection(record);
    return record;
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

export {
  DurableWorkflowCoordinator,
};
