import {CHILD_DESCRIPTOR_ACTION as CHILD, CHILD_DESCRIPTOR_DISPOSITION as DISPOSITION,
  canonicalChildDescriptorIntent, childDescriptorStatement, isChildDescriptorReceiptFor}
  from './partition-child-descriptor-effect.js';
// A split descriptor receipt names the destination effect across retries and
// owner lease renewals. The TABLES workflow attempt is part of the subject.
import {INITIAL_PARTITION_IDS, SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {SIBLING_DESCRIPTOR_ACTION, canonicalSiblingDescriptorIntent,
  isSiblingDescriptorReceiptFor, siblingDescriptorChangeCount,
  siblingDescriptorStatement} from './partition-sibling-descriptor-effect.js';
import {deriveParticipantEntryId} from '../query/distributed/participant-entry-id.js';
import {copyDenseOwnDataArray, copyStrictOwnDataRecord} from '../utils/strict-own-data.js';
import {committedCommandDigest} from './partition-committed-statement-outcome-constants.js';
import {PARTITION_COMMITTED_COMMAND_OUTCOME, PARTITION_SERVICE_OPERATION} from './partition-service-constants.js';

const SPLIT_DESCRIPTOR_FINALIZE_SQL = 'DELETE FROM partitions WHERE table_id = ? AND ' +
  'split_descriptor_attempt = ? AND partition_id = ?';
const SPLIT_DESCRIPTOR_ERROR = Object.freeze({
  BYTES: 'split_descriptor_command_invalid',
  COLLISION: 'split_descriptor_entry_collision',
  UNRESOLVED: 'split_descriptor_ownership_unresolved',
  RECEIPT: 'split_descriptor_receipt_invalid',
  FINALIZED: 'split_descriptor_attempt_finalized',
});
const KIND = 'splitDescriptor';
const DIGEST_PREFIX = KIND + ':';
const KEY_PREFIX = '[' + JSON.stringify(KIND) + ',';
const commandFields = new Set(['type', 'sql', 'params', 'entryId', 'operationId',
  'idempotencyKey', 'splitMirrorOrigin', 'splitDescriptorIntent', 'mutationKind',
  'timestamp', 'proposedBy', 'proposedAt']);

function isSiblingDescriptorAction(action) {
  return action === SIBLING_DESCRIPTOR_ACTION.FINALIZE || action === SIBLING_DESCRIPTOR_ACTION.PROMOTE;
}

function canonicalIntent(value) {
  const intent = copyStrictOwnDataRecord(value);
  if (isSiblingDescriptorAction(intent?.action)) return canonicalSiblingDescriptorIntent(intent);
  return canonicalChildDescriptorIntent(intent);
}

function stageKeyOf(subject, action) {
  return JSON.stringify([KIND, action, subject.tableId, subject.partitionId, subject.workflowId, subject.workflowAttempt]);
}

function splitDescriptorWriteKey(value) {
  const intent = canonicalIntent(value);
  if (!intent) throw Object.assign(new Error(SPLIT_DESCRIPTOR_ERROR.BYTES),
    {code: SPLIT_DESCRIPTOR_ERROR.BYTES});
  return stageKeyOf(intent, intent.action);
}

function statementOf(intent) {
  if (isSiblingDescriptorAction(intent.action)) return siblingDescriptorStatement(intent);
  return childDescriptorStatement(intent);
}

function splitDescriptorStatement(value) {
  const intent = canonicalIntent(value);
  if (!intent) throw Object.assign(new Error(SPLIT_DESCRIPTOR_ERROR.BYTES), {code: SPLIT_DESCRIPTOR_ERROR.BYTES});
  return statementOf(intent);
}

function digestOf(intent, key, statement) {
  const fields = [key, statement.sql, statement.params];
  // Finalize carries the previous generation even though the guarded restore
  // SQL matches the promoted generation. Include the complete issued plan.
  fields.push(intent);
  return DIGEST_PREFIX + committedCommandDigest(KIND, JSON.stringify(fields));
}

function splitDescriptorCommandDigest(value) {
  const intent = canonicalIntent(value);
  const key = splitDescriptorWriteKey(intent);
  return digestOf(intent, key, statementOf(intent));
}

function isSplitDescriptorReceiptFor(value, expected) {
  const receipt = copyStrictOwnDataRecord(value);
  const intent = canonicalIntent(expected);
  if (isSiblingDescriptorAction(intent?.action)) return isSiblingDescriptorReceiptFor(receipt, intent);
  return isChildDescriptorReceiptFor(receipt, intent);
}

function isSplitDescriptorDigest(value) {
  return typeof value === 'string' && value.startsWith(DIGEST_PREFIX);
}

function descriptorRefusal(code, retryable = false) {
  return {success: false, error: code, errorCode: code, failureCode: code,
    retryable, deferRetry: retryable};
}

// The strict binding is checked at submission and independently at committed
// apply. Different proposers/timestamps can represent the same command.
function usesSplitDescriptorIdentity(command) {
  return Object.hasOwn(command, 'splitDescriptorIntent') ||
    (typeof command.idempotencyKey === 'string' && command.idempotencyKey.startsWith(KEY_PREFIX));
}

function decodeSplitDescriptorCommand(service, command) {
  const record = copyStrictOwnDataRecord(command);
  const intent = canonicalIntent(record?.splitDescriptorIntent);
  if (!intent || service.tableName !== SYSTEM_TABLE_NAME.PARTITIONS ||
      service.partitionId !== INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.PARTITIONS] ||
      Object.keys(record).some((field) => !commandFields.has(field)) ||
      record.type !== PARTITION_SERVICE_OPERATION.QUERY ||
      record.splitMirrorOrigin != null) {
    return null;
  }
  const statement = statementOf(intent);
  const mutationKind = intent.action === CHILD.CREATE ? PARTITION_SERVICE_OPERATION.INSERT :
    intent.action === CHILD.FINALIZE ? PARTITION_SERVICE_OPERATION.DELETE : PARTITION_SERVICE_OPERATION.UPDATE;
  if (record.sql !== statement.sql || (record.mutationKind !== undefined && record.mutationKind !== mutationKind) ||
      !Array.isArray(record.params) || record.params.length !== statement.params.length) return null;
  const params = copyDenseOwnDataArray(record.params);
  const key = splitDescriptorWriteKey(intent);
  if (params === null || !params.every((param, index) => param === statement.params[index]) ||
      record.idempotencyKey !== key || record.entryId !== deriveParticipantEntryId(key, service.partitionId)) return null;
  return {intent, digest: digestOf(intent, key, statement)};
}

function splitDescriptorProofLocator(intent) {
  const entryId = deriveParticipantEntryId(splitDescriptorWriteKey(intent), INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.PARTITIONS]);
  return Object.freeze({entryId, commandDigest: splitDescriptorCommandDigest(intent)});
}

// Stage lookup may precede delivery of the successor's identity. Verify the
// retained command against its full digest AND key before using that receipt.
function splitDescriptorStageId(subject, action) {
  return deriveParticipantEntryId(stageKeyOf(subject, action), INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.PARTITIONS]);
}

function buildRecipientChildForward(value, receipt) {
  const transfer = canonicalChildDescriptorIntent(value);
  if (transfer?.action !== CHILD.TRANSFER || !isChildDescriptorReceiptFor(receipt, transfer)) return null;
  const adopt = receipt.disposition === DISPOSITION.TRANSFERRED;
  return canonicalChildDescriptorIntent({action: adopt ? CHILD.ADOPT : CHILD.CREATE,
    tableId: transfer.tableId, partitionId: transfer.partitionId, workflowId: transfer.successorWorkflowId,
    workflowAttempt: transfer.successorWorkflowAttempt, incomingProof: splitDescriptorProofLocator(transfer),
    row: {...transfer.row, split_descriptor_attempt: transfer.successorWorkflowAttempt},
    ...(adopt ? {priorAttempt: transfer.successorWorkflowAttempt} : {})});
}

function expectedChanges(receipt) {
  if (isSiblingDescriptorAction(receipt.action)) return siblingDescriptorChangeCount(receipt);
  return Number([DISPOSITION.DELETED, DISPOSITION.ACQUIRED, DISPOSITION.TRANSFERRED].includes(receipt.disposition));
}

function retainedSplitDescriptorAnswer(descriptor, recorded) {
  if (descriptor.digest !== recorded.commandDigest) return descriptorRefusal(SPLIT_DESCRIPTOR_ERROR.COLLISION);
  let receipt;
  try {
    receipt = JSON.parse(recorded.ownerResultText);
  } catch {
    throw Object.assign(new Error(SPLIT_DESCRIPTOR_ERROR.RECEIPT), {code: SPLIT_DESCRIPTOR_ERROR.RECEIPT});
  }
  if (!Number.isSafeInteger(recorded.term) || recorded.term < 1 ||
      !Number.isSafeInteger(recorded.logIndex) || recorded.logIndex < 1 ||
      recorded.outcome !== PARTITION_COMMITTED_COMMAND_OUTCOME.APPLIED ||
      recorded.failureCode !== null || recorded.failureMessage !== null ||
      (descriptor.intent.action === CHILD.CREATE ? !Number.isSafeInteger(recorded.lastInsertRowid) :
        recorded.lastInsertRowid !== null) ||
      !isSplitDescriptorReceiptFor(receipt, descriptor.intent) ||
      recorded.changes !== expectedChanges(receipt)) {
    throw Object.assign(new Error(SPLIT_DESCRIPTOR_ERROR.RECEIPT), {code: SPLIT_DESCRIPTOR_ERROR.RECEIPT});
  }
  return {splitDescriptorReceipt: receipt, committed: true, term: recorded.term};
}

export {DISPOSITION as SPLIT_DESCRIPTOR_DISPOSITION, SPLIT_DESCRIPTOR_ERROR,
  SPLIT_DESCRIPTOR_FINALIZE_SQL, decodeSplitDescriptorCommand, descriptorRefusal,
  buildRecipientChildForward, splitDescriptorProofLocator, splitDescriptorStageId, isSplitDescriptorDigest, isSplitDescriptorReceiptFor, retainedSplitDescriptorAnswer,
  canonicalIntent as canonicalSplitDescriptorIntent, isSiblingDescriptorAction, splitDescriptorCommandDigest, splitDescriptorStatement, splitDescriptorWriteKey,
  usesSplitDescriptorIdentity};
