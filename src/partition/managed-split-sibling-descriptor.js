// Submit an issued TABLES plan subject through the ordinary descriptor write
// path. The manifest owner records the returned, committed PARTITIONS receipt.
import {PARTITION_TRANSITION_STATE} from './partition-constants.js';
import {splitDescriptorWriteKey} from './partition-split-descriptor-command.js';
import {siblingIntent} from './managed-split-sibling-plan.js';
import {SIBLING_DESCRIPTOR_ACTION,
  isSiblingDescriptorReceiptFor, siblingDescriptorMutation} from './partition-sibling-descriptor-effect.js';

const SIBLING_PLAN_MISMATCH = Object.freeze({
  MESSAGE: 'Sibling descriptor subject differs from the issued split plan',
  CODE: 'split_sibling_plan_mismatch',
});
// An unconfirmed submission carries the answer's own error and code, else these.
const UNCONFIRMED_SIBLING_EFFECT_MESSAGE = 'Unconfirmed sibling descriptor effect';
const UNCONFIRMED_SIBLING_EFFECT_CODE = 'split_sibling_descriptor_unconfirmed';

// Workflow and epoch operands are fixed by the shared plan decoder. Only
// the prior descriptor attempt can differ between two valid same-ID subjects.
function assertIssuedSiblingSubject(workflow, intent, action) {
  const {metadata} = workflow;
  const issued = Array.isArray(metadata.splitIssuedSiblings) ?
    metadata.splitIssuedSiblings.map((row) =>
      siblingIntent(workflow.tableId, metadata, row, action)) : [];
  const byId = new Map(issued.map((candidate) => [candidate?.partitionId, candidate]));
  const retained = byId.get(intent?.partitionId);
  const state = action === SIBLING_DESCRIPTOR_ACTION.PROMOTE ?
    PARTITION_TRANSITION_STATE.SPLIT_CATCHUP : PARTITION_TRANSITION_STATE.FAILED;
  if (!intent || workflow.workflowId !== intent.workflowId || workflow.status !== state ||
      byId.has(undefined) || byId.size !== issued.length ||
      retained?.priorAttempt !== intent.priorAttempt) {
    throw Object.assign(new Error(SIBLING_PLAN_MISMATCH.MESSAGE),
      {code: SIBLING_PLAN_MISMATCH.CODE});
  }
}

// Whether the submission's answer is not the committed receipt of `intent`.
function siblingReceiptUnconfirmed(result, answer, intent) {
  return result?.success !== true || answer?.success !== true || answer.committed !== true ||
      !Number.isSafeInteger(answer.logIndex) || answer.logIndex < 1 ||
      !Number.isSafeInteger(answer.term) || answer.term < 1 ||
      !isSiblingDescriptorReceiptFor(answer.splitDescriptorReceipt, intent);
}

async function submitSplitSiblingDescriptor(owner, workflow, subject, action) {
  const intent = siblingIntent(workflow.tableId, workflow.metadata, subject, action);
  assertIssuedSiblingSubject(workflow, intent, action);
  const result = await owner.getControlPlaneSystemTableGateway().submitMutation(
    siblingDescriptorMutation(intent), owner.buildManagedSplitMutationOptions({
      splitDescriptorIntent: intent, idempotencyKey: splitDescriptorWriteKey(intent),
    }));
  const answer = result?.partitionResult;
  if (siblingReceiptUnconfirmed(result, answer, intent)) {
    throw Object.assign(new Error(result?.error || UNCONFIRMED_SIBLING_EFFECT_MESSAGE),
      {code: result?.errorCode || UNCONFIRMED_SIBLING_EFFECT_CODE, cause: result});
  }
  return answer;
}

export {submitSplitSiblingDescriptor};
