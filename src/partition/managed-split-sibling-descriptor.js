// Submit an issued TABLES plan subject through the ordinary descriptor write
// path. The manifest owner records the returned, committed PARTITIONS receipt.
import {PARTITION_TRANSITION_STATE} from './partition-constants.js';
import {splitDescriptorWriteKey} from './partition-split-descriptor-command.js';
import {siblingIntent} from './managed-split-sibling-plan.js';
import {SIBLING_DESCRIPTOR_ACTION,
  isSiblingDescriptorReceiptFor, siblingDescriptorMutation} from './partition-sibling-descriptor-effect.js';

async function submitSplitSiblingDescriptor(owner, workflow, subject, action) {
  const {metadata} = workflow;
  const intent = siblingIntent(workflow.tableId, metadata, subject, action);
  const issued = Array.isArray(metadata.splitIssuedSiblings) ?
    metadata.splitIssuedSiblings.map((row) =>
      siblingIntent(workflow.tableId, metadata, row, action)) : [];
  const byId = new Map(issued.map((candidate) => [candidate?.partitionId, candidate]));
  const retained = byId.get(intent?.partitionId);
  const state = action === SIBLING_DESCRIPTOR_ACTION.PROMOTE ?
    PARTITION_TRANSITION_STATE.SPLIT_CATCHUP : PARTITION_TRANSITION_STATE.FAILED;
  // Workflow and epoch operands are fixed by the shared plan decoder. Only
  // the prior descriptor attempt can differ between two valid same-ID subjects.
  if (!intent || workflow.workflowId !== intent.workflowId || workflow.status !== state ||
      byId.has(undefined) || byId.size !== issued.length ||
      retained?.priorAttempt !== intent.priorAttempt) {
    throw Object.assign(new Error('Sibling descriptor subject differs from the issued split plan'),
      {code: 'split_sibling_plan_mismatch'});
  }
  const result = await owner.getControlPlaneSystemTableGateway().submitMutation(
    siblingDescriptorMutation(intent), owner.buildManagedSplitMutationOptions({
      splitDescriptorIntent: intent, idempotencyKey: splitDescriptorWriteKey(intent),
    }));
  const answer = result?.partitionResult;
  if (result?.success !== true || answer?.success !== true || answer.committed !== true ||
      !Number.isSafeInteger(answer.logIndex) || answer.logIndex < 1 ||
      !Number.isSafeInteger(answer.term) || answer.term < 1 ||
      !isSiblingDescriptorReceiptFor(answer.splitDescriptorReceipt, intent)) {
    throw Object.assign(new Error(result?.error || 'Unconfirmed sibling descriptor effect'),
      {code: result?.errorCode || 'split_sibling_descriptor_unconfirmed', cause: result});
  }
  return answer;
}

export {submitSplitSiblingDescriptor};
