import {QUERY_ERROR_MSG} from '../query/query-constants.js';
// The split sender takes its operands from the pair issued by TABLES. A lost
// reply is redriven with the same intent, including SQL parameter types and
// timestamps. Only PARTITIONS can attest that a descriptor effect committed.
import {resolveDeclaredPartitionKeyType} from './partition-boundary-representation.js';
import {PARTITION_TRANSITION_STATE} from './partition-constants.js';
import {CHILD_DESCRIPTOR_ACTION as ACTION, canonicalChildDescriptorIntent, childDescriptorMutation,
  isChildDescriptorReceiptFor} from './partition-child-descriptor-effect.js';
import {splitDescriptorWriteKey} from './partition-split-descriptor-command.js';

function buildFreshSplitChildPair({workflow, splitPlan, partitionInfo, tableInfo, tableName,
  targetVersion, replicaCount, timestamp}) {
  const keyType = partitionInfo.partition_key_type ?? partitionInfo.partitionKeyType ??
    resolveDeclaredPartitionKeyType(tableInfo);
  if (!keyType) throw new Error(`Source partition key type authority is missing for ${workflow.partitionId}`);
  return [splitPlan.leftPartition, splitPlan.rightPartition].map((child) => {
    const row = {
      partition_id: child.partitionId, table_id: workflow.tableId, table_name: tableName,
      partition_key_start: child.keyRange.start, partition_key_end: child.keyRange.end,
      partition_key_type: keyType, partition_version: targetVersion,
      split_descriptor_attempt: workflow.metadata.workflowAttempt, replica_count: replicaCount,
      size_bytes: 0, leader_node_id: null, state: 'NORMAL', created_at: timestamp, updated_at: timestamp,
    };
    const intent = canonicalChildDescriptorIntent({action: ACTION.CREATE, tableId: workflow.tableId,
      partitionId: child.partitionId, workflowId: workflow.workflowId, workflowAttempt: workflow.metadata.workflowAttempt,
      row, incomingProof: null});
    if (!intent) throw Object.assign(new Error('Invalid fresh split child descriptor'), {
      code: 'split_child_descriptor_invalid', partitionId: child.partitionId});
    return intent;
  });
}

async function submitChildDescriptor(owner, intent) {
  const result = await owner.getControlPlaneSystemTableGateway().submitMutation(
    childDescriptorMutation(intent), owner.buildManagedSplitMutationOptions({
      splitDescriptorIntent: intent, idempotencyKey: splitDescriptorWriteKey(intent),
    }));
  const answer = result?.partitionResult;
  if (result?.success !== true || answer?.success !== true || answer.committed !== true ||
      !Number.isSafeInteger(answer.logIndex) || answer.logIndex < 1 ||
      !Number.isSafeInteger(answer.term) || answer.term < 1 ||
      !isChildDescriptorReceiptFor(answer.splitDescriptorReceipt, intent)) {
    throw Object.assign(new Error(result?.error || 'Unconfirmed split child descriptor command'), {
      code: result?.errorCode || 'split_child_descriptor_unconfirmed', cause: result,
    });
  }
  return answer;
}

async function submitSplitChildForwards(owner, workflow, forwards, assertCurrentAttempt) {
  if (workflow.status !== PARTITION_TRANSITION_STATE.SPLIT_PREPARING ||
      forwards.length !== 2 || forwards.some((intent) => intent.action !== ACTION.CREATE && intent.action !== ACTION.ADOPT)) {
    throw Object.assign(new Error('A prepared split child descriptor pair is required'), {code: 'split_child_plan_mismatch'});
  }
  const send = () => {
    assertCurrentAttempt();
    return Promise.all(forwards.map((intent) => submitChildDescriptor(owner, intent)));
  };
  if (!forwards.every((intent) => intent.action === ACTION.CREATE)) return send();
  const coordinator = owner.transactionCoordinator;
  if (!coordinator || typeof coordinator.begin !== 'function' || typeof coordinator.commit !== 'function' ||
      typeof coordinator.rollback !== 'function') {
    throw new Error(QUERY_ERROR_MSG.TABLE_SPLIT_TRANSACTION_COORDINATOR_REQUIRED);
  }
  const sessionId = `split-${forwards[0].partitionId}:${forwards[1].partitionId}`;
  const begun = await coordinator.begin(sessionId);
  if (!begun.success) throw new Error(begun.error);
  try {
    await send();
    const committed = await coordinator.commit(sessionId);
    if (!committed.success) throw new Error(committed.error);
  } catch (error) {
    await coordinator.rollback(sessionId);
    throw error;
  }
}

function submitSplitChildTransfer(owner, intent) {
  if (intent?.action !== ACTION.TRANSFER) throw new Error('Expected a split child transfer intent');
  return submitChildDescriptor(owner, intent);
}

function submitSplitChildFinalization(owner, intent) {
  if (intent?.action !== ACTION.FINALIZE) throw new Error('Expected a terminal split child intent');
  return submitChildDescriptor(owner, intent);
}

export {buildFreshSplitChildPair, submitSplitChildFinalization, submitSplitChildForwards, submitSplitChildTransfer};
