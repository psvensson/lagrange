/**
 * Read-only projections for operation_progress diagnostics and gates.
 */

import {
  OPERATION_LIFECYCLE_STATE,
  OPERATION_PROGRESS_OBSERVER_SOURCE,
  OPERATION_PROGRESS_RESOURCE,
  OPERATION_PROGRESS_RETENTION_STATE,
  OPERATION_PROGRESS_VISIBILITY_STATE,
  isOperationProgressTerminalState,
} from './operation-lifecycle.js';
import {
  OPERATION_WORKFLOW_IDENTIFIER_VARIANTS,
  OPERATION_WORKFLOW_OUTCOME_VALUES,
} from './operation-workflow-owner-constants.js';
import {
  projectOperationProgressRecords,
} from './operation-progress-events.js';

const OPERATION_PROGRESS_OBSERVER_TEXT_EMPTY = '';
const OPERATION_PROGRESS_OBSERVER_TYPEOF_OBJECT = 'object';
const OPERATION_PROGRESS_OBSERVER_TYPEOF_STRING = 'string';

const OPERATION_PROGRESS_COMPATIBILITY_VARIANT = Object.freeze({
  UNAVAILABLE: 'operation_progress_projection_unavailable',
});

const OPERATION_PROGRESS_COMPATIBILITY_STEP_ID_BY_STATE = Object.freeze({
  [OPERATION_LIFECYCLE_STATE.PLANNED]: 'planned',
  [OPERATION_LIFECYCLE_STATE.DISPATCH_PENDING]: 'dispatch_pending',
  [OPERATION_LIFECYCLE_STATE.DISPATCHED]: 'dispatched',
  [OPERATION_LIFECYCLE_STATE.PUBLICATION_PENDING_VISIBILITY]:
    'publication_pending_visibility',
  [OPERATION_LIFECYCLE_STATE.VISIBLE]: 'visible',
  [OPERATION_LIFECYCLE_STATE.RETRY_PENDING]: 'retry_pending',
  [OPERATION_LIFECYCLE_STATE.RETAINED]: 'retained',
  [OPERATION_LIFECYCLE_STATE.SUCCEEDED]: 'succeeded',
  [OPERATION_LIFECYCLE_STATE.FAILED]: 'failed',
  [OPERATION_LIFECYCLE_STATE.UNKNOWN]: 'unknown',
});

const OPERATION_PROGRESS_COMPATIBILITY_NEXT_ACTION_BY_STATE = Object.freeze({
  [OPERATION_LIFECYCLE_STATE.PLANNED]:
    OPERATION_WORKFLOW_OUTCOME_VALUES.DISPATCH_LOCAL_OWNER,
  [OPERATION_LIFECYCLE_STATE.DISPATCH_PENDING]:
    OPERATION_WORKFLOW_OUTCOME_VALUES.ADVANCE_EXISTING_OPERATION,
  [OPERATION_LIFECYCLE_STATE.DISPATCHED]:
    OPERATION_WORKFLOW_OUTCOME_VALUES.DEFER_AUTHORITATIVE_VISIBILITY,
  [OPERATION_LIFECYCLE_STATE.PUBLICATION_PENDING_VISIBILITY]:
    OPERATION_WORKFLOW_OUTCOME_VALUES.DEFER_AUTHORITATIVE_VISIBILITY,
  [OPERATION_LIFECYCLE_STATE.VISIBLE]:
    OPERATION_WORKFLOW_OUTCOME_VALUES.TERMINAL_SUCCESS,
  [OPERATION_LIFECYCLE_STATE.RETRY_PENDING]:
    OPERATION_WORKFLOW_OUTCOME_VALUES.DISPATCH_LOCAL_OWNER,
  [OPERATION_LIFECYCLE_STATE.RETAINED]:
    OPERATION_WORKFLOW_OUTCOME_VALUES.WAIT_FOR_REBALANCER_HANDOFF_RETRY,
  [OPERATION_LIFECYCLE_STATE.SUCCEEDED]:
    OPERATION_WORKFLOW_OUTCOME_VALUES.TERMINAL_SUCCESS,
  [OPERATION_LIFECYCLE_STATE.FAILED]:
    OPERATION_WORKFLOW_OUTCOME_VALUES.TERMINAL_FAILURE,
  [OPERATION_LIFECYCLE_STATE.UNKNOWN]:
    OPERATION_WORKFLOW_OUTCOME_VALUES.WAIT_FOR_OWNER_PROGRESS,
});

function isOperationProgressObserverRecord(value) {
  return Boolean(value) &&
    typeof value === OPERATION_PROGRESS_OBSERVER_TYPEOF_OBJECT &&
    !Array.isArray(value);
}

function normalizeOperationProgressObserverText(value, fallback) {
  if (typeof value !== OPERATION_PROGRESS_OBSERVER_TYPEOF_STRING) {
    return fallback;
  }
  const normalized = value.trim();
  return normalized.length > OPERATION_PROGRESS_OBSERVER_TEXT_EMPTY.length ?
    normalized :
    fallback;
}

function buildOperationProgressCompatibilityProjection(progress) {
  if (!isOperationProgressObserverRecord(progress)) {
    return Object.freeze({
      resource: OPERATION_PROGRESS_RESOURCE,
      source: OPERATION_PROGRESS_OBSERVER_SOURCE,
      operationId:
        OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.OPERATION_KEY_UNAVAILABLE,
      topologyOperatorCurrentStepId:
        OPERATION_PROGRESS_COMPATIBILITY_VARIANT.UNAVAILABLE,
      topologyOperatorCurrentStepState:
        OPERATION_PROGRESS_COMPATIBILITY_VARIANT.UNAVAILABLE,
      topologyOperatorNextAction:
        OPERATION_PROGRESS_COMPATIBILITY_VARIANT.UNAVAILABLE,
      operationProgressResource: OPERATION_PROGRESS_RESOURCE,
      operationProgressState: OPERATION_LIFECYCLE_STATE.UNKNOWN,
      operationProgressLastAcceptedEventId:
        OPERATION_PROGRESS_COMPATIBILITY_VARIANT.UNAVAILABLE,
    });
  }
  const state = normalizeOperationProgressObserverText(
    progress.state,
    OPERATION_LIFECYCLE_STATE.UNKNOWN,
  );
  return Object.freeze({
    resource: OPERATION_PROGRESS_RESOURCE,
    source: OPERATION_PROGRESS_OBSERVER_SOURCE,
    operationId: normalizeOperationProgressObserverText(
      progress.operationId,
      OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.OPERATION_KEY_UNAVAILABLE,
    ),
    topologyOperatorCurrentStepId:
      OPERATION_PROGRESS_COMPATIBILITY_STEP_ID_BY_STATE[state],
    topologyOperatorCurrentStepState: state,
    topologyOperatorNextAction:
      OPERATION_PROGRESS_COMPATIBILITY_NEXT_ACTION_BY_STATE[state],
    operationProgressResource: OPERATION_PROGRESS_RESOURCE,
    operationProgressState: state,
    operationProgressLastAcceptedEventId:
      normalizeOperationProgressObserverText(
        progress.lastAcceptedEventId,
        OPERATION_PROGRESS_COMPATIBILITY_VARIANT.UNAVAILABLE,
      ),
    terminal: isOperationProgressTerminalState(state),
    retainedRetry: progress.retentionState ===
      OPERATION_PROGRESS_RETENTION_STATE.RETAINED_FOR_RETRY,
    visibleAtActiveGate: progress.visibilityState ===
      OPERATION_PROGRESS_VISIBILITY_STATE.VISIBLE_AT_ACTIVE_GATE,
  });
}

function readOperationProgressProjection(source = {}) {
  const records = typeof source.listOperationProgressRecords === 'function' ?
    source.listOperationProgressRecords() :
    projectOperationProgressRecords(source.eventLog);
  const events = typeof source.listOperationProgressEvents === 'function' ?
    source.listOperationProgressEvents() :
    source.eventLog || [];
  return Object.freeze({
    resource: OPERATION_PROGRESS_RESOURCE,
    source: OPERATION_PROGRESS_OBSERVER_SOURCE,
    operationProgressRecords: Object.freeze([...records]),
    operationProgressEvents: Object.freeze([...events]),
    compatibilityRecords: Object.freeze([...records].map(
      buildOperationProgressCompatibilityProjection,
    )),
  });
}

function buildOperationProgressInvariantState({
  operationProgressRecords = [],
  publicationProgressRecords = [],
  snapshotCoverageSamples = [],
} = {}) {
  return Object.freeze({
    operationProgressRecords: Object.freeze([...operationProgressRecords]),
    publicationProgressRecords: Object.freeze([...publicationProgressRecords]),
    snapshotCoverageSamples: Object.freeze([...snapshotCoverageSamples]),
  });
}

export {
  OPERATION_PROGRESS_COMPATIBILITY_VARIANT,
  buildOperationProgressCompatibilityProjection,
  buildOperationProgressInvariantState,
  readOperationProgressProjection,
};
