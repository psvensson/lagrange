/**
 * Event resolution for the operation_progress lifecycle state machine.
 */

import {
  OPERATION_PROGRESS_EVENT_TYPE,
} from './operation-progress-events.js';
import {
  OPERATION_WORKFLOW_COMMAND_STATE,
  OPERATION_WORKFLOW_DISPATCH_STATE,
  OPERATION_WORKFLOW_EVIDENCE_CONTRACT_STATE,
  OPERATION_WORKFLOW_HISTORY_FRESHNESS_STATE,
  OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE,
  OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE,
  OPERATION_WORKFLOW_RETRY_DEADLINE_STATE,
  OPERATION_WORKFLOW_SERIAL_DEPENDENCY_STATE,
  OPERATION_WORKFLOW_STALE_PROGRESS_STATE,
  OPERATION_WORKFLOW_TERMINAL_STATE,
  OPERATION_WORKFLOW_TIMEOUT_STATE,
  OPERATION_WORKFLOW_TRANSITION_STATE,
  OPERATION_WORKFLOW_WAKE_STATE,
} from './operation-workflow-owner-constants.js';
import {
  normalizeOperationWorkflowEvidence,
} from './operation-workflow-owner-evidence.js';

const OPERATION_WORKFLOW_DEFERRED_PUBLICATION_FENCE_STATES = Object.freeze(
  new Set([
    OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE.STALE,
    OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE.INCOMPLETE,
  ]),
);

const OPERATION_WORKFLOW_KNOWN_OWNER_AUTHORITY_STATES = Object.freeze(
  new Set([
    OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE.LOCAL_AUTHORITATIVE,
    OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE.REMOTE_AUTHORITATIVE,
  ]),
);

function createOperationLifecycleEventResolver({outcomeByEvent}) {
  return function resolveOperationLifecycleEvent(evidenceOrEvent) {
    if (outcomeByEvent[evidenceOrEvent?.type]) {
      return evidenceOrEvent;
    }
    const evidence = normalizeOperationWorkflowEvidence(evidenceOrEvent);
    const baseEvent = Object.freeze({
      evidence,
      operationId: evidence.operationKey,
      ownerId: evidence.owner,
      sourceRevision: evidence.sourceRevision,
    });
    if (
      evidence.contractState ===
        OPERATION_WORKFLOW_EVIDENCE_CONTRACT_STATE.OUTSIDE_CONTRACT
    ) {
      return Object.freeze({
        ...baseEvent,
        type: OPERATION_PROGRESS_EVENT_TYPE.OUT_OF_CONTRACT_EVIDENCE,
      });
    }
    if (
      evidence.durableOperation.terminalState ===
          OPERATION_WORKFLOW_TERMINAL_STATE.FAILURE &&
        evidence.workflowHistory.terminalState ===
          OPERATION_WORKFLOW_TERMINAL_STATE.FAILURE
    ) {
      return Object.freeze({
        ...baseEvent,
        type: OPERATION_PROGRESS_EVENT_TYPE.OPERATION_FAILED,
      });
    }
    if (
      evidence.durableOperation.terminalState ===
          OPERATION_WORKFLOW_TERMINAL_STATE.SUCCESS &&
        evidence.workflowHistory.terminalState ===
          OPERATION_WORKFLOW_TERMINAL_STATE.SUCCESS
    ) {
      return Object.freeze({
        ...baseEvent,
        type: OPERATION_PROGRESS_EVENT_TYPE.OPERATION_COMPLETE,
      });
    }
    if (
      OPERATION_WORKFLOW_DEFERRED_PUBLICATION_FENCE_STATES.has(
        evidence.publicationFence.fenceState,
      )
    ) {
      return Object.freeze({
        ...baseEvent,
        type: OPERATION_PROGRESS_EVENT_TYPE.PUBLICATION_ACCEPTED,
      });
    }
    if (
      evidence.timeoutBudget.timeoutState ===
          OPERATION_WORKFLOW_TIMEOUT_STATE.EXPIRED &&
        evidence.timeoutBudget.staleProgressState ===
          OPERATION_WORKFLOW_STALE_PROGRESS_STATE.PROVEN &&
        evidence.workflowHistory.freshnessState ===
          OPERATION_WORKFLOW_HISTORY_FRESHNESS_STATE.STALE &&
        evidence.workflowHistory.commandState ===
          OPERATION_WORKFLOW_COMMAND_STATE.IDLE &&
        evidence.dispatchObservation.commandState ===
          OPERATION_WORKFLOW_COMMAND_STATE.IDLE &&
        evidence.durableOperation.dispatchState !==
          OPERATION_WORKFLOW_DISPATCH_STATE.NOT_OBSERVED &&
        OPERATION_WORKFLOW_KNOWN_OWNER_AUTHORITY_STATES.has(
          evidence.ownerLease.authorityState,
        )
    ) {
      return Object.freeze({
        ...baseEvent,
        type: OPERATION_PROGRESS_EVENT_TYPE.RETAIN_PUBLICATION_FOR_RETRY,
      });
    }
    if (
      evidence.serialDependency.dependencyState ===
        OPERATION_WORKFLOW_SERIAL_DEPENDENCY_STATE.PENDING
    ) {
      return Object.freeze({
        ...baseEvent,
        type: OPERATION_PROGRESS_EVENT_TYPE.SERIAL_DEPENDENCY_PENDING,
      });
    }
    if (
      evidence.ownerLease.authorityState ===
          OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE.LOCAL_AUTHORITATIVE &&
        evidence.durableOperation.dispatchState ===
          OPERATION_WORKFLOW_DISPATCH_STATE.NOT_OBSERVED &&
        evidence.workflowHistory.commandState ===
          OPERATION_WORKFLOW_COMMAND_STATE.IDLE &&
        evidence.dispatchObservation.commandState ===
          OPERATION_WORKFLOW_COMMAND_STATE.IDLE
    ) {
      return Object.freeze({
        ...baseEvent,
        type: OPERATION_PROGRESS_EVENT_TYPE.DISPATCH_REQUESTED,
      });
    }
    if (
      evidence.ownerLease.authorityState ===
          OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE.REMOTE_AUTHORITATIVE &&
        evidence.retryBudget.deadlineState ===
          OPERATION_WORKFLOW_RETRY_DEADLINE_STATE.ACTIVE &&
        evidence.dispatchObservation.commandState ===
          OPERATION_WORKFLOW_COMMAND_STATE.IDLE &&
        evidence.dispatchObservation.wakeState ===
          OPERATION_WORKFLOW_WAKE_STATE.REQUIRED
    ) {
      return Object.freeze({
        ...baseEvent,
        type: OPERATION_PROGRESS_EVENT_TYPE.RETRY_REQUESTED,
      });
    }
    if (
      evidence.ownerLease.authorityState ===
          OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE.REMOTE_AUTHORITATIVE &&
        evidence.dispatchObservation.commandState ===
          OPERATION_WORKFLOW_COMMAND_STATE.IDLE &&
        evidence.dispatchObservation.wakeState ===
          OPERATION_WORKFLOW_WAKE_STATE.REQUIRED
    ) {
      return Object.freeze({
        ...baseEvent,
        type: OPERATION_PROGRESS_EVENT_TYPE.REMOTE_OWNER_WAKE_REQUIRED,
      });
    }
    if (
      evidence.workflowHistory.transitionState ===
          OPERATION_WORKFLOW_TRANSITION_STATE.AVAILABLE &&
        evidence.workflowHistory.commandState ===
          OPERATION_WORKFLOW_COMMAND_STATE.IDLE &&
        OPERATION_WORKFLOW_KNOWN_OWNER_AUTHORITY_STATES.has(
          evidence.ownerLease.authorityState,
        )
    ) {
      return Object.freeze({
        ...baseEvent,
        type: OPERATION_PROGRESS_EVENT_TYPE.DISPATCH_ACCEPTED,
      });
    }
    return Object.freeze({
      ...baseEvent,
      type: OPERATION_PROGRESS_EVENT_TYPE.OWNER_PROGRESS_WAIT_REQUIRED,
    });
  };
}

export {
  createOperationLifecycleEventResolver,
};
