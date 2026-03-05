import {WORKFLOW_ERROR_MSG} from './workflow-constants.js';

/**
 * Generic durable workflow runtime with optional participant persistence.
 */
class DurableWorkflowCoordinator {
  /**
   * @param {Object} options - Coordinator options.
   * @param {Function} [options.persistWorkflow] - Persist workflow callback.
   * @param {Function} [options.persistParticipant] - Persist participant callback.
   * @param {Function} [options.now] - Clock function.
   */
  constructor(options = {}) {
    this.persistWorkflow = options.persistWorkflow || (async () => {});
    this.persistParticipant = options.persistParticipant || (async () => {});
    this.now = options.now || (() => Date.now());
    this.workflowsById = new Map();
    this.workflowsByOwnerKey = new Map();
    this.inFlightExecutionsByOwnerKey = new Map();
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
    if (!Object.prototype.hasOwnProperty.call(updates, 'updatedAt')) {
      workflow.updatedAt = this.now();
    }
    await this.persistWorkflow(workflow);
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
    return workflow;
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
      if (typeof isTerminalWorkflow === 'function' &&
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
      metadata: Object.prototype.hasOwnProperty.call(record, 'metadata') ?
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
