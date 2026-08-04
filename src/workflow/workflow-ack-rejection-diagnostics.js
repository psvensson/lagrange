import {
  ACK_REJECTION_DIAGNOSTIC_FIELD,
} from './workflow-constants.js';

const LOCAL_STR_FUNCTION = 'function';

/**
 * Emit a typed diagnostic record for a rejected acknowledgement.
 *
 * Invokes the onAckRejection callback (if wired) with a frozen
 * diagnostic record containing workflow identity, participant key,
 * rejection result, reason, and fence/status context.
 *
 * @param {Object} coordinator - Owning DurableWorkflowCoordinator.
 * @param {string} workflowId - Workflow ID.
 * @param {string} participantKey - Participant key.
 * @param {Object} context - Rejection context fields.
 * @return {Object|null} The emitted diagnostic record, or null.
 */
function emitWorkflowAckRejectionDiagnostic(
  coordinator,
  workflowId,
  participantKey,
  context = {},
) {
  if (typeof coordinator.onAckRejection !== LOCAL_STR_FUNCTION) {
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
    [ACK_REJECTION_DIAGNOSTIC_FIELD.TIMESTAMP]: coordinator.now(),
  });
  coordinator.onAckRejection(record);
  return record;
}

export {emitWorkflowAckRejectionDiagnostic};
