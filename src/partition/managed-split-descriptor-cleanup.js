import {isSplitDescriptorReceiptFor} from './partition-split-descriptor-command.js';
// TABLES owns permission to supersede a failed split. PARTITIONS owns the
// terminal disposition of each descriptor command. The registration attempt
// identifies those commands across lease changes. The decision fence is the
// fence at which TABLES first committed FAILED and never follows a new lease.
import {PARTITION_TRANSITION_STATE as STATE} from './partition-constants.js';
import {SPLIT_PARTICIPANT_PREFIX, SPLIT_ACK_FAILURE_STATUSES} from './split-ack-constants.js';

const PRE_CUTOVER_SPLIT_STATES = new Set([
  STATE.ADMISSION_PENDING, STATE.SPLIT_PREPARING, STATE.SPLIT_BACKFILLING,
  STATE.SPLIT_CATCHUP,
]);
const DESCRIPTOR_CLEANUP_PENDING = 'split-descriptor-cleanup-pending';
const SPLIT_FAILURE_PENDING = 'split-source-failure-pending';
const INVALID_CLEANUP_RECORD = 'split-descriptor-cleanup-record-invalid';

function invalidCleanupRecord(workflowId) {
  return Object.assign(new Error(`Invalid split descriptor cleanup record for ${workflowId}`),
    {code: INVALID_CLEANUP_RECORD});
}

function distinctIds(ids) {
  return Array.isArray(ids) && ids.every((id) => typeof id === 'string' && id.length > 0) &&
    new Set(ids).size === ids.length;
}

function sourceFailureAuthorization(workflow, key, status, fence) {
  if (key !== SPLIT_PARTICIPANT_PREFIX.SOURCE_PARTITION ||
      !SPLIT_ACK_FAILURE_STATUSES.has(status) || !PRE_CUTOVER_SPLIT_STATES.has(workflow.status)) {
    return null;
  }
  return {workflowId: workflow.workflowId, workflowAttempt: workflow.metadata.workflowAttempt,
    participantKey: key, status, fenceToken: fence};
}

function sameSourceFailure(left, right) {
  return Boolean(left && right && left.workflowId === right.workflowId &&
    left.workflowAttempt === right.workflowAttempt && left.participantKey === right.participantKey &&
    left.fenceToken === right.fenceToken && left.status === right.status);
}

function childIntent(tableId, workflowId, workflowAttempt, partitionId) {
  return {action: 'finalizeChild', tableId, workflowId, workflowAttempt, partitionId};
}

function cleanupRecord(metadata) {
  const manifest = metadata.splitDescriptorCleanup;
  if (!manifest || !Number.isSafeInteger(metadata.workflowAttempt) || metadata.workflowAttempt < 1 ||
      typeof manifest.tableId !== 'string' || !manifest.tableId || manifest.workflowAttempt !== metadata.workflowAttempt ||
      !Number.isSafeInteger(manifest.decisionFence) || manifest.decisionFence < manifest.workflowAttempt ||
      !distinctIds(manifest.pendingChildren) ||
      !distinctIds(metadata.splitIssuedChildren) ||
      manifest.pendingChildren.some((id) => !metadata.splitIssuedChildren.includes(id))) {
    throw invalidCleanupRecord(metadata.workflowId);
  }
  const receipts = manifest.receipts;
  if (!Array.isArray(receipts)) throw invalidCleanupRecord(metadata.workflowId);
  const accounted = [...manifest.pendingChildren];
  for (const receipt of receipts) {
    const intent = childIntent(manifest.tableId, metadata.workflowId, manifest.workflowAttempt,
      receipt?.partitionId);
    if (!isSplitDescriptorReceiptFor(receipt, intent)) throw invalidCleanupRecord(metadata.workflowId);
    accounted.push(receipt.partitionId);
  }
  if (!distinctIds(accounted) || accounted.length !== metadata.splitIssuedChildren.length ||
      accounted.some((id) => !metadata.splitIssuedChildren.includes(id))) {
    throw invalidCleanupRecord(metadata.workflowId);
  }
  return manifest;
}

function splitCleanupRefusal(state, metadata) {
  if (!metadata?.sourcePartitionId) return null;
  if (state !== STATE.FAILED) return metadata.splitSourceFailure ? SPLIT_FAILURE_PENDING : null;
  return cleanupRecord(metadata).pendingChildren.length ? DESCRIPTOR_CLEANUP_PENDING : null;
}

// Applied to every record change entering FAILED, including execution errors
// before the source worker starts. Every authorized child might have been issued.
function withSplitCleanupDecision(current, next) {
  if (!current?.metadata?.sourcePartitionId || current.status === STATE.FAILED ||
      next.status !== STATE.FAILED) return next;
  const issued = current.metadata.splitIssuedChildren;
  if (!distinctIds(issued)) throw invalidCleanupRecord(current.workflowId);
  return {...next, metadata: {...next.metadata, splitDescriptorCleanup: {
    tableId: current.tableId, workflowAttempt: current.metadata.workflowAttempt, decisionFence: current.fenceToken,
    pendingChildren: [...issued], receipts: [],
  }}};
}

export {
  PRE_CUTOVER_SPLIT_STATES, SPLIT_FAILURE_PENDING, childIntent, cleanupRecord,
  sameSourceFailure, sourceFailureAuthorization, splitCleanupRefusal, withSplitCleanupDecision,
};
