import {
  PARTICIPANT_ACK_FIELD,
  PARTICIPANT_ACK_RESULT,
  WORKFLOW_ERROR_MSG,
} from './workflow-constants.js';

/**
 * Participant acknowledgement methods for DurableWorkflowCoordinator:
 * the typed ack path (fence validation, duplicate detection, the
 * explicit participant transition graph, and durable participant
 * persistence). Split out of the coordinator to keep it within its
 * size budget; mixed onto the prototype below.
 */
class WorkflowParticipantAckMethods {
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
      return this.rejectAckParticipantNotFound(
        workflowId, participantKey, ackStatus,
      );
    }

    // Fence token validation: reject stale acknowledgements.
    const ackFence = ack?.[PARTICIPANT_ACK_FIELD.FENCE_TOKEN];
    if (ackFence !== undefined && ackFence !== null) {
      const staleRejection = this.rejectAckStaleFence(
        workflowId, participant, participantKey, ackStatus, ackFence,
      );
      if (staleRejection) {
        return staleRejection;
      }
      participant.fenceToken = ackFence;
    }

    // Duplicate detection: same status already acknowledged.
    if (participant.status === ackStatus &&
        participant.acknowledgedAt !== undefined) {
      return this.rejectAckDuplicate(
        workflowId, participant, participantKey, ackStatus,
      );
    }

    // Explicit participant transition graph: when wired, reject any
    // (from, to) edge the graph does not declare — the coordinator
    // never silently applies an out-of-graph transition.
    const graphRejection = this.validateParticipantTransitionGraph(
      workflowId,
      participant,
      participantKey,
      ackStatus,
    );
    if (graphRejection) {
      return graphRejection;
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
   * Build the typed PARTICIPANT_NOT_FOUND rejection and emit the
   * rejection diagnostic.
   * @param {string} workflowId
   * @param {string} participantKey
   * @param {string} ackStatus
   * @return {Object}
   * @private
   */
  rejectAckParticipantNotFound(workflowId, participantKey, ackStatus) {
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

  /**
   * Fence-check one acknowledgement against the participant's current
   * fence epoch. Returns the typed STALE_FENCE rejection when the ack
   * carries an older epoch, else null.
   * @param {string} workflowId
   * @param {Object} participant - Current participant record.
   * @param {string} participantKey
   * @param {string} ackStatus
   * @param {number} ackFence - Fence epoch carried by the ack.
   * @return {Object|null}
   * @private
   */
  rejectAckStaleFence(
    workflowId, participant, participantKey, ackStatus, ackFence,
  ) {
    const currentFence = participant.fenceToken;
    if (currentFence === undefined || currentFence === null ||
        ackFence >= currentFence) {
      return null;
    }
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

  /**
   * Build the typed DUPLICATE rejection and emit the rejection
   * diagnostic.
   * @param {string} workflowId
   * @param {Object} participant - Current participant record.
   * @param {string} participantKey
   * @param {string} ackStatus
   * @return {Object}
   * @private
   */
  rejectAckDuplicate(workflowId, participant, participantKey, ackStatus) {
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

  /**
   * Validate one acknowledgement against the wired participant
   * transition graph. Returns the typed INVALID_TRANSITION rejection
   * when the (from, to) edge is not declared, else null.
   * @param {string} workflowId
   * @param {Object} participant - Current participant record.
   * @param {string} participantKey
   * @param {string} ackStatus
   * @return {Object|null}
   * @private
   */
  validateParticipantTransitionGraph(
    workflowId,
    participant,
    participantKey,
    ackStatus,
  ) {
    if (typeof this.isParticipantTransitionAllowed !== 'function' ||
        this.isParticipantTransitionAllowed(
          participantKey,
          participant.status || null,
          ackStatus,
        )) {
      return null;
    }
    const invalidResult = {
      result: PARTICIPANT_ACK_RESULT.INVALID_TRANSITION,
      participantKey,
      reason: WORKFLOW_ERROR_MSG.PARTICIPANT_INVALID_TRANSITION,
      currentStatus: participant.status || null,
      receivedStatus: ackStatus,
    };
    this.emitAckRejectionDiagnostic(workflowId, participantKey, {
      rejectionResult: PARTICIPANT_ACK_RESULT.INVALID_TRANSITION,
      reason: WORKFLOW_ERROR_MSG.PARTICIPANT_INVALID_TRANSITION,
      receivedStatus: ackStatus,
      currentStatus: participant.status || null,
    });
    return invalidResult;
  }
}

export {WorkflowParticipantAckMethods};
