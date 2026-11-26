// TABLES owns the exact child commands a split may issue. A new attempt can
// reuse deferred work only by accepting the whole predecessor plan in its
// registration CAS. PARTITIONS settles each transfer before the recipient can
// acquire, provision, or dispose of either child.
import {isDeepStrictEqual} from 'node:util';
import {PARTITION_TRANSITION_STATE as STATE} from './partition-constants.js';
import {canonicalChildDescriptorIntent, buildChildTransferIntent} from './partition-child-descriptor-effect.js';
import {buildRecipientChildForward, isSplitDescriptorReceiptFor} from './partition-split-descriptor-command.js';
import {RECORD_UNCHANGED, refuseRecordChange} from './managed-workflow-record-store.js';
import {targetProvisioningOf} from './target-provisioning-mark.js';

const HANDOFF_PENDING = 'split-child-handoff-pending';
const INCOMPATIBLE_PLAN = 'split-child-handoff-plan-mismatch';
const DEFERRED_STATES = new Set([STATE.DEFERRED, STATE.BLOCKED]);

function invalidPlan() {
  throw Object.assign(new Error('Invalid durable split child descriptor plan'), {code: 'split-child-descriptor-plan-invalid'});
}

function childPair(metadata, tableId, values, transfer) {
  const ids = metadata.targetPartitionIds;
  const source = metadata.sourcePartitionId;
  const range = metadata.topologySnapshot?.sourcePartitionKeyRanges?.[source];
  if (!Array.isArray(values) || values.length !== 2 || !Array.isArray(ids) || ids.length !== 2 ||
      ids[0] === ids[1] || ids.includes(source) || !range || !Object.hasOwn(range, 'start') ||
      !Object.hasOwn(range, 'end') || metadata.splitKey == null) invalidPlan();
  return values.map((value, index) => {
    const intent = canonicalChildDescriptorIntent(value);
    if (!intent || (transfer ? intent.action !== 'transferChild' ||
        intent.successorWorkflowId !== metadata.workflowId || intent.successorWorkflowAttempt !== metadata.workflowAttempt :
        !['createChild', 'adoptChild'].includes(intent.action) || intent.workflowAttempt !== metadata.workflowAttempt) ||
        intent.workflowId !== metadata.workflowId || intent.tableId !== tableId || intent.partitionId !== ids[index] ||
        intent.row.partition_version !== metadata.targetPartitionVersion ||
        intent.row.partition_key_start !== (index === 0 ? range.start : metadata.splitKey) ||
        intent.row.partition_key_end !== (index === 0 ? metadata.splitKey : range.end)) invalidPlan();
    return intent;
  });
}

function checkedChildPlan(metadata, tableId) {
  if (Object.hasOwn(metadata, 'splitIssuedChildren') || !Array.isArray(metadata.splitDescriptorChildren) ||
      !Object.hasOwn(metadata, 'splitChildHandoff')) invalidPlan();
  const issued = metadata.splitDescriptorChildren;
  const handoff = metadata.splitChildHandoff;
  if (handoff === null) {
    if (!issued.length) return {issued, handoff, ids: []};
    const pair = childPair(metadata, tableId, issued, false);
    if (pair.some((it) => it.action !== 'createChild' || it.incomingProof !== null)) invalidPlan();
    return {issued: pair, handoff, ids: metadata.targetPartitionIds};
  }
  if (!handoff || !Array.isArray(handoff.pending) || !Array.isArray(handoff.receipts)) invalidPlan();
  const transfers = childPair(metadata, tableId, handoff.transfers, true);
  if (transfers[0].workflowAttempt !== transfers[1].workflowAttempt) invalidPlan();
  const pending = new Set(handoff.pending);
  const ids = metadata.targetPartitionIds;
  if (pending.size !== handoff.pending.length || pending.size + handoff.receipts.length !== 2 ||
      handoff.pending.some((id) => !ids.includes(id))) invalidPlan();
  const recipient = [];
  for (const transfer of transfers) {
    const receipt = handoff.receipts.find((item) => item?.partitionId === transfer.partitionId);
    if (pending.has(transfer.partitionId)) {
      if (receipt) invalidPlan();
    } else {
      if (!isSplitDescriptorReceiptFor(receipt, transfer)) invalidPlan();
      recipient.push(buildRecipientChildForward(transfer, receipt));
    }
  }
  const expected = pending.size ? [] : recipient;
  if (!isDeepStrictEqual(issued, expected)) invalidPlan();
  return {issued: expected, handoff, ids};
}

function issuedSplitChildForwards(workflow) {
  const {issued} = checkedChildPlan(workflow.metadata, workflow.tableId);
  if (issued.length !== 2) invalidPlan();
  return issued;
}

function initialChildAuthority() {
  return {splitDescriptorChildren: [], splitChildHandoff: null};
}

// The caller is the shared split/merge registration change and has already
// compared the record, lease and routing inputs. Read all predecessor facts
// from the compared record, including provisioning marks.
function inheritedChildAuthority(stored, registration, attempt) {
  const prior = stored.metadata;
  if (!prior?.sourcePartitionId) return {fields: initialChildAuthority()};
  const tableId = stored.row.table_id;
  const {issued, handoff} = checkedChildPlan(prior, tableId);
  if (handoff?.pending.length) return {refusal: HANDOFF_PENDING};
  if (!issued.length || stored.state === STATE.FAILED) return {fields: initialChildAuthority()};
  const next = registration.metadata;
  if (!DEFERRED_STATES.has(stored.state) || registration.workflowId !== prior.workflowId ||
      registration.tableId !== tableId || registration.tableName !== stored.row.table_name ||
      next.sourcePartitionId !== prior.sourcePartitionId || next.primaryKeyColumn !== prior.primaryKeyColumn ||
      next.targetPartitionVersion !== prior.targetPartitionVersion ||
      prior.splitDescriptorBaseVersion !== stored.row.active_partition_version ||
      next.splitKey !== prior.splitKey || !isDeepStrictEqual(next.targetPartitionIds, prior.targetPartitionIds) ||
      !isDeepStrictEqual(next.topologySnapshot?.sourcePartitionKeyRanges?.[next.sourcePartitionId],
        prior.topologySnapshot?.sourcePartitionKeyRanges?.[prior.sourcePartitionId]) ||
      prior.splitIssuedSiblings?.length !== 0) return {refusal: INCOMPATIBLE_PLAN};
  const successor = {workflowId: registration.workflowId, workflowAttempt: attempt};
  const marks = {};
  for (const intent of issued) {
    const mark = targetProvisioningOf(prior, intent.partitionId);
    if (!mark || targetProvisioningOf(next, intent.partitionId) !== mark) return {refusal: INCOMPATIBLE_PLAN};
    marks[intent.partitionId] = mark;
  }
  return {fields: {splitDescriptorChildren: [], targetProvisioning: marks, splitChildHandoff: {
    transfers: issued.map((intent) => buildChildTransferIntent(intent, successor)),
    pending: [...prior.targetPartitionIds], receipts: [],
  }}};
}

async function prepareSplitChildDescriptors(owner, workflow, planDelta, buildPair, assertCurrentAttempt) {
  const {workflowId, fenceToken} = workflow;
  const attempt = workflow.metadata.workflowAttempt;
  let proposed;
  const prepared = await owner.workflowCoordinator.updateWorkflow(workflowId, (current) => {
    assertCurrentAttempt();
    if (current.metadata.workflowAttempt !== attempt || current.fenceToken !== fenceToken ||
        current.metadata.splitSourceFailure || ![STATE.ADMISSION_PENDING, STATE.SPLIT_PREPARING].includes(current.status)) {
      return refuseRecordChange('state-not-expected');
    }
    const {issued, handoff} = checkedChildPlan(current.metadata, current.tableId);
    if (handoff?.pending.length) return refuseRecordChange(HANDOFF_PENDING);
    const metadata = {...current.metadata, ...planDelta};
    if (issued.length) {
      childPair(metadata, current.tableId, issued, false);
      if (current.status === STATE.SPLIT_PREPARING) return RECORD_UNCHANGED;
    } else {
      proposed ??= buildPair();
      metadata.splitDescriptorChildren = proposed;
    }
    checkedChildPlan(metadata, current.tableId);
    if (metadata.splitDescriptorChildren.length !== 2) invalidPlan();
    return {...current, status: STATE.SPLIT_PREPARING, metadata};
  });
  return {...prepared};
}

function recordChildTransfer(current, intent, result) {
  const {metadata, tableId} = current;
  if (metadata.workflowAttempt !== intent.successorWorkflowAttempt || current.workflowId !== intent.successorWorkflowId) {
    return refuseRecordChange('split-child-handoff-attempt-moved', {superseded: true});
  }
  const {handoff} = checkedChildPlan(metadata, tableId);
  const expected = handoff?.transfers.find((item) => item.partitionId === intent.partitionId);
  const receipt = result?.splitDescriptorReceipt;
  if (result?.success !== true || result.committed !== true || !Number.isSafeInteger(result.logIndex) ||
      result.logIndex <= 0 || !Number.isSafeInteger(result.term) || result.term <= 0 ||
      !expected || !isDeepStrictEqual(expected, intent) || !isSplitDescriptorReceiptFor(receipt, expected)) {
    return refuseRecordChange('split-child-transfer-unconfirmed');
  }
  const prior = handoff.receipts.find((item) => item.partitionId === intent.partitionId);
  if (prior) return isDeepStrictEqual(prior, receipt) ? RECORD_UNCHANGED : refuseRecordChange('split-child-transfer-conflict');
  const receipts = [...handoff.receipts, receipt];
  const pending = handoff.pending.filter((id) => id !== intent.partitionId);
  const issued = pending.length ? [] : handoff.transfers.map((transfer) =>
    buildRecipientChildForward(transfer, receipts.find((item) => item.partitionId === transfer.partitionId)));
  return {...current, metadata: {...metadata, splitChildHandoff: {...handoff, pending, receipts}, splitDescriptorChildren: issued}};
}

export {DEFERRED_STATES, HANDOFF_PENDING, INCOMPATIBLE_PLAN, checkedChildPlan, inheritedChildAuthority,
  issuedSplitChildForwards, prepareSplitChildDescriptors, recordChildTransfer};
