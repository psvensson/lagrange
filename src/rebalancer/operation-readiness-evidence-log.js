/**
 * The readiness evidence of one replica-operation step, as a console-only
 * diagnostics line.
 *
 * The target node's readiness at the moment a step is taken explains why
 * the step was taken; it is an observation, not part of the operation's
 * durable authority. It is therefore never written into the operation row's
 * steps_history (the row is rewritten whole on every step and shipped
 * through the ledger's log and CDC): one line per committed step is logged
 * instead, keyed by operation and step, through the logging service's
 * console-only entry, which has no persistence branch.
 */
import {LoggingService} from '../logging/logging-service.js';

const READINESS_EVIDENCE_LEVEL = 'info';
const READINESS_EVIDENCE_MESSAGE = 'Operation step readiness evidence';

/**
 * @param {Object} evidence
 * @param {string} evidence.operationId
 * @param {string} evidence.workflowStep - The step just committed.
 * @param {string|null} evidence.partitionId
 * @param {string|null} evidence.targetNodeId
 * @param {Object|null} evidence.readinessSnapshot - Compact readiness
 *   summary of the target node; null when none is available.
 * @return {void}
 */
function logOperationReadinessEvidence(evidence) {
  LoggingService.getInstance().logConsoleOnly(
    READINESS_EVIDENCE_LEVEL,
    READINESS_EVIDENCE_MESSAGE,
    {
      operationId: evidence.operationId,
      workflowStep: evidence.workflowStep,
      partitionId: evidence.partitionId ?? null,
      targetNodeId: evidence.targetNodeId ?? null,
      readinessSnapshot: evidence.readinessSnapshot ?? null,
    },
  );
}

export {
  READINESS_EVIDENCE_MESSAGE,
  logOperationReadinessEvidence,
};
