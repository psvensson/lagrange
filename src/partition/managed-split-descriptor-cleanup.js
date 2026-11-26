import {SIBLING_DESCRIPTOR_ACTION, isSiblingDescriptorReceiptFor} from './partition-sibling-descriptor-effect.js';
import {siblingIntent} from './managed-split-sibling-plan.js';
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

function terminalSubjects(metadata, tableId) {
  if (!distinctIds(metadata.splitIssuedChildren) || !Array.isArray(metadata.splitIssuedSiblings)) {
    throw invalidCleanupRecord(metadata.workflowId);
  }
  const intents = new Map(metadata.splitIssuedChildren.map((id) => [id,
    childIntent(tableId, metadata.workflowId, metadata.workflowAttempt, id)]));
  for (const subject of metadata.splitIssuedSiblings) {
    const intent = siblingIntent(tableId, metadata, subject,
      SIBLING_DESCRIPTOR_ACTION.FINALIZE);
    if (!intent || intents.has(intent.partitionId)) throw invalidCleanupRecord(metadata.workflowId);
    intents.set(intent.partitionId, intent);
  }
  if (intents.has(metadata.sourcePartitionId)) throw invalidCleanupRecord(metadata.workflowId);
  return intents;
}

function matchesTerminalReceipt(receipt, intent) {
  if (!intent) return false;
  return intent.action === SIBLING_DESCRIPTOR_ACTION.FINALIZE ?
    isSiblingDescriptorReceiptFor(receipt, intent) : isSplitDescriptorReceiptFor(receipt, intent);
}

function cleanupRecord(metadata, tableId) {
  const manifest = metadata.splitDescriptorCleanup;
  if (!manifest || !Number.isSafeInteger(metadata.workflowAttempt) || metadata.workflowAttempt < 1 ||
      manifest.tableId !== tableId || manifest.workflowAttempt !== metadata.workflowAttempt ||
      !Number.isSafeInteger(manifest.decisionFence) || manifest.decisionFence < manifest.workflowAttempt ||
      !distinctIds(manifest.pendingChildren) || !distinctIds(manifest.pendingSiblings) ||
      !Array.isArray(manifest.receipts)) throw invalidCleanupRecord(metadata.workflowId);
  const remaining = terminalSubjects(metadata, tableId);
  for (const id of manifest.pendingChildren) {
    if (!metadata.splitIssuedChildren.includes(id) || !remaining.delete(id)) throw invalidCleanupRecord(metadata.workflowId);
  }
  for (const id of manifest.pendingSiblings) {
    if (remaining.get(id)?.action !== SIBLING_DESCRIPTOR_ACTION.FINALIZE) throw invalidCleanupRecord(metadata.workflowId);
    remaining.delete(id);
  }
  for (const receipt of manifest.receipts) {
    if (!matchesTerminalReceipt(receipt, remaining.get(receipt?.partitionId))) throw invalidCleanupRecord(metadata.workflowId);
    remaining.delete(receipt.partitionId);
  }
  if (remaining.size) throw invalidCleanupRecord(metadata.workflowId);
  return manifest;
}

function splitCleanupRefusal(state, metadata, tableId) {
  if (!metadata?.sourcePartitionId) return null;
  if (state !== STATE.FAILED) return metadata.splitSourceFailure ? SPLIT_FAILURE_PENDING : null;
  const {pendingChildren, pendingSiblings} = cleanupRecord(metadata, tableId);
  return pendingChildren.length || pendingSiblings.length ? DESCRIPTOR_CLEANUP_PENDING : null;
}

// Applied to every record change entering FAILED, including execution errors
// before the source worker starts. Every authorized child might have been issued.
function withSplitCleanupDecision(current, next) {
  if (!current?.metadata?.sourcePartitionId || current.status === STATE.FAILED ||
      next.status !== STATE.FAILED) return next;
  const issued = current.metadata.splitIssuedChildren;
  terminalSubjects(current.metadata, current.tableId);
  return {...next, metadata: {...next.metadata, splitDescriptorCleanup: {
    tableId: current.tableId, workflowAttempt: current.metadata.workflowAttempt, decisionFence: current.fenceToken,
    pendingChildren: [...issued], pendingSiblings: current.metadata.splitIssuedSiblings.map((item) => item.partitionId), receipts: [],
  }}};
}

export {
  PRE_CUTOVER_SPLIT_STATES, SPLIT_FAILURE_PENDING, childIntent, cleanupRecord,
  matchesTerminalReceipt, sameSourceFailure, sourceFailureAuthorization, splitCleanupRefusal, terminalSubjects, withSplitCleanupDecision,
};
