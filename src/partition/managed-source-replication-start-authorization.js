import {
  PARTITION_TRANSITION_METADATA_FIELD,
  PARTITION_TRANSITION_STATE,
  workflowAttemptOf,
} from './partition-constants.js';
import {MERGE_ACK_STATUS} from './merge-ack-constants.js';
import {SPLIT_ACK_STATUS} from './split-ack-constants.js';

const FIELD = PARTITION_TRANSITION_METADATA_FIELD;

const SPLIT_INITIAL_STATES = Object.freeze(new Set([
  PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
]));
const MERGE_INITIAL_STATES = Object.freeze(new Set([
  PARTITION_TRANSITION_STATE.MERGE_BACKFILLING,
]));
const SPLIT_EXECUTABLE_STATES = Object.freeze(new Set([
  PARTITION_TRANSITION_STATE.SPLIT_BACKFILLING,
  PARTITION_TRANSITION_STATE.SPLIT_CATCHUP,
  PARTITION_TRANSITION_STATE.SPLIT_CUTOVER_ACTIVE,
]));
const MERGE_EXECUTABLE_STATES = Object.freeze(new Set([
  PARTITION_TRANSITION_STATE.MERGE_BACKFILLING,
  PARTITION_TRANSITION_STATE.MERGE_CATCHUP,
  PARTITION_TRANSITION_STATE.MERGE_CUTOVER_ACTIVE,
]));

// These statuses prove that this exact attempt previously crossed START.
// Failure statuses deliberately do not: a failed worker needs a successor
// attempt rather than permission to fabricate a resumed predecessor.
const SPLIT_STARTED_STATUSES = Object.freeze(new Set([
  SPLIT_ACK_STATUS.SNAPSHOT_STARTED,
  SPLIT_ACK_STATUS.BACKFILL_PROGRESS,
  SPLIT_ACK_STATUS.CATCHUP_READY,
  SPLIT_ACK_STATUS.CUTOVER_APPLIED,
  SPLIT_ACK_STATUS.CLEANUP_COMPLETED,
  SPLIT_ACK_STATUS.SOURCE_DISSOLVED,
]));
const MERGE_STARTED_STATUSES = Object.freeze(new Set([
  MERGE_ACK_STATUS.SNAPSHOT_STARTED,
  MERGE_ACK_STATUS.BACKFILL_PROGRESS,
  MERGE_ACK_STATUS.CATCHUP_READY,
  MERGE_ACK_STATUS.CUTOVER_APPLIED,
  MERGE_ACK_STATUS.SOURCE_MIRROR_REMOVED,
  MERGE_ACK_STATUS.SOURCE_DISSOLVED,
]));

function sameArray(left, right) {
  return Array.isArray(left) && Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function identityText(value) {
  return String(value || '');
}

function matchesIdentity(workflow, start) {
  const metadata = workflow?.metadata;
  if (!metadata) return false;
  return [
    identityText(workflow.workflowId) === identityText(start.workflowId),
    identityText(metadata[FIELD.WORKFLOW_ID]) ===
      identityText(start.workflowId),
    workflowAttemptOf(metadata) === start.workflowAttempt,
    metadata[FIELD.WORKFLOW_FENCE_TOKEN] === start.workflowFenceToken,
    identityText(workflow.tableId) === identityText(start.tableId),
    identityText(workflow.tableName) === identityText(start.tableName),
  ].every(Boolean);
}

function splitStartAuthorization(start, options = {}) {
  return Object.freeze({
    initialStates: SPLIT_INITIAL_STATES,
    executableStates: SPLIT_EXECUTABLE_STATES,
    startedStatuses: SPLIT_STARTED_STATUSES,
    confirmationOnly: options.confirmationOnly === true,
    matches: (workflow) => matchesIdentity(workflow, start) &&
      workflow.metadata[FIELD.PRIMARY_KEY_COLUMN] === start.primaryKeyColumn &&
      workflow.metadata[FIELD.SOURCE_PARTITION_ID] === start.sourcePartitionId &&
      workflow.metadata[FIELD.SPLIT_KEY] === start.splitKey &&
      workflow.metadata[FIELD.TARGET_PARTITION_VERSION] ===
        start.targetPartitionVersion &&
      sameArray(workflow.metadata[FIELD.TARGET_PARTITION_IDS],
        start.targetPartitionIds),
  });
}

function mergeStartAuthorization(start, options = {}) {
  return Object.freeze({
    initialStates: MERGE_INITIAL_STATES,
    executableStates: MERGE_EXECUTABLE_STATES,
    startedStatuses: MERGE_STARTED_STATUSES,
    confirmationOnly: options.confirmationOnly === true,
    matches: (workflow) => matchesIdentity(workflow, start) &&
      workflow.metadata[FIELD.PRIMARY_KEY_COLUMN] === start.primaryKeyColumn &&
      workflow.metadata[FIELD.TARGET_PARTITION_VERSION] ===
        start.targetPartitionVersion &&
      sameArray(workflow.metadata[FIELD.SOURCE_PARTITION_IDS],
        start.sourcePartitionIds) &&
      sameArray(workflow.metadata[FIELD.TARGET_PARTITION_IDS],
        [start.targetPartitionId]),
  });
}

async function acknowledgeSourceStartAtRecordTurn(coordinator, workflowId, ack,
  startContext, ackStatus, expectedStatus, buildAuthorization) {
  if (ackStatus !== expectedStatus || !startContext?.metadata) {
    return coordinator.acknowledgeParticipant(workflowId, ack);
  }
  return coordinator.authorizeParticipantStart(
    workflowId, ack, buildAuthorization({...startContext.metadata,
      tableId: startContext.tableId, tableName: startContext.tableName},
    {confirmationOnly: startContext.confirmationOnly === true}));
}

export {
  acknowledgeSourceStartAtRecordTurn,
  mergeStartAuthorization,
  splitStartAuthorization,
};
