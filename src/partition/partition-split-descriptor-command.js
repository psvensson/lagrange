// A split descriptor receipt names the destination effect across retries and
// owner lease renewals. The TABLES workflow attempt is part of the subject.
import {createHash} from 'node:crypto';
import {INITIAL_PARTITION_IDS, SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {SIBLING_DESCRIPTOR_ACTION, canonicalSiblingDescriptorIntent,
  isSiblingDescriptorReceiptFor, siblingDescriptorChangeCount,
  siblingDescriptorStatement} from './partition-sibling-descriptor-effect.js';
import {copyDenseOwnDataArray, copyStrictOwnDataRecord} from '../utils/strict-own-data.js';
import {committedCommandDigest} from './partition-committed-statement-outcome-constants.js';
import {PARTITION_COMMITTED_COMMAND_OUTCOME, PARTITION_SERVICE_OPERATION} from './partition-service-constants.js';

const PARTICIPANT_HASH_ALGORITHM = 'sha1';
const PARTICIPANT_DIGEST_ENCODING = 'hex';
const PARTICIPANT_DIGEST_PREFIX_LENGTH = 16;
const PARTICIPANT_ENTRY_ID_PREFIX = 'dwrite-participant-';

function deriveParticipantEntryId(idempotencyKey, partitionId) {
  const entryIdentityDigest = createHash(PARTICIPANT_HASH_ALGORITHM)
    .update(JSON.stringify({idempotencyKey, partitionId}))
    .digest(PARTICIPANT_DIGEST_ENCODING)
    .slice(0, PARTICIPANT_DIGEST_PREFIX_LENGTH);
  return `${PARTICIPANT_ENTRY_ID_PREFIX}${entryIdentityDigest}`;
}

const SPLIT_DESCRIPTOR_FINALIZE_SQL = 'DELETE FROM partitions WHERE table_id = ? AND ' +
  'split_descriptor_attempt = ? AND partition_id = ?';
const SPLIT_DESCRIPTOR_ERROR = Object.freeze({
  BYTES: 'split_descriptor_command_invalid',
  COLLISION: 'split_descriptor_entry_collision',
  UNRESOLVED: 'split_descriptor_ownership_unresolved',
  RECEIPT: 'split_descriptor_receipt_invalid',
  FINALIZED: 'split_descriptor_attempt_finalized',
});
const DISPOSITION = Object.freeze({
  DELETED: 'deleted', ABSENT: 'absent', SUPERSEDED: 'superseded',
});
const KIND = 'splitDescriptor';
const DIGEST_PREFIX = KIND + ':';
const FINALIZE_CHILD = 'finalizeChild';
const KEY_PREFIX = '[' + JSON.stringify(KIND) + ',';
const FIELDS = Object.freeze(['action', 'tableId', 'partitionId', 'workflowId', 'workflowAttempt']);
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const commandFields = new Set(['type', 'sql', 'params', 'entryId', 'operationId',
  'idempotencyKey', 'splitMirrorOrigin', 'splitDescriptorIntent', 'mutationKind',
  'timestamp', 'proposedBy', 'proposedAt']);

function isSiblingDescriptorAction(action) {
  return action === SIBLING_DESCRIPTOR_ACTION.FINALIZE ||
      action === SIBLING_DESCRIPTOR_ACTION.PROMOTE;
}

function canonicalIntent(value) {
  const intent = copyStrictOwnDataRecord(value);
  if (isSiblingDescriptorAction(intent?.action)) return canonicalSiblingDescriptorIntent(intent);
  if (intent === null || Object.keys(intent).length !== FIELDS.length ||
      intent.action !== FINALIZE_CHILD || !text(intent.tableId) ||
      !text(intent.partitionId) || !text(intent.workflowId) ||
      !Number.isSafeInteger(intent.workflowAttempt) || intent.workflowAttempt <= 0) return null;
  const {action, tableId, partitionId, workflowId, workflowAttempt} = intent;
  return Object.freeze({action, tableId, partitionId, workflowId, workflowAttempt});
}

function splitDescriptorWriteKey(value) {
  const intent = canonicalIntent(value);
  if (!intent) {
    throw Object.assign(new Error(SPLIT_DESCRIPTOR_ERROR.BYTES),
      {code: SPLIT_DESCRIPTOR_ERROR.BYTES});
  }
  return JSON.stringify([KIND, ...FIELDS.map((name) => intent[name])]);
}

function statementOf(intent) {
  if (isSiblingDescriptorAction(intent.action)) return siblingDescriptorStatement(intent);
  return {sql: SPLIT_DESCRIPTOR_FINALIZE_SQL,
    params: [intent.tableId, intent.workflowAttempt, intent.partitionId]};
}

function splitDescriptorStatement(value) {
  const intent = canonicalIntent(value);
  if (!intent) {
    throw Object.assign(new Error(SPLIT_DESCRIPTOR_ERROR.BYTES),
      {code: SPLIT_DESCRIPTOR_ERROR.BYTES});
  }
  return statementOf(intent);
}

function digestOf(intent, key, statement) {
  const fields = [key, statement.sql, statement.params];
  // Finalize carries the previous generation even though the guarded restore
  // SQL matches the promoted generation. Include the complete issued plan.
  if (isSiblingDescriptorAction(intent.action)) fields.push(intent);
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
  if (isSiblingDescriptorAction(intent?.action)) {
    return isSiblingDescriptorReceiptFor(receipt, intent);
  }
  return intent !== null && receipt !== null &&
    Object.keys(receipt).length === FIELDS.length + 1 &&
    FIELDS.every((field) => receipt[field] === intent[field]) &&
    Object.values(DISPOSITION).includes(receipt.disposition);
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
  const mutationKind = isSiblingDescriptorAction(intent.action) ?
    PARTITION_SERVICE_OPERATION.UPDATE :
    PARTITION_SERVICE_OPERATION.DELETE;
  if (record.sql !== statement.sql ||
      (record.mutationKind !== undefined && record.mutationKind !== mutationKind) ||
      !Array.isArray(record.params) || record.params.length !== statement.params.length) {
    return null;
  }
  const params = copyDenseOwnDataArray(record.params);
  const key = splitDescriptorWriteKey(intent);
  if (params === null || !params.every((param, index) => param === statement.params[index]) ||
      record.idempotencyKey !== key ||
      record.entryId !== deriveParticipantEntryId(key, service.partitionId)) {
    return null;
  }
  return {intent, digest: digestOf(intent, key, statement)};
}

// Inspect only a zero-row DELETE in the same SQLite application transaction.
// A smaller/untagged generation or a row belonging to another table cannot
// prove this attempt's effect was completed.
function finalizeChildReceipt(db, intent, changes) {
  let disposition;
  if (changes === 1) disposition = DISPOSITION.DELETED;
  else if (changes === 0) {
    const row = db.prepare('SELECT table_id, split_descriptor_attempt FROM partitions ' +
      'WHERE partition_id = ?').get(intent.partitionId);
    if (row === undefined) disposition = DISPOSITION.ABSENT;
    else if (row.table_id === intent.tableId &&
        Number.isSafeInteger(row.split_descriptor_attempt) &&
        row.split_descriptor_attempt > intent.workflowAttempt) disposition = DISPOSITION.SUPERSEDED;
    else return null;
  } else throw new Error(SPLIT_DESCRIPTOR_ERROR.RECEIPT);
  return Object.freeze({...intent, disposition});
}

function retainedSplitDescriptorAnswer(descriptor, recorded) {
  if (descriptor.digest !== recorded.commandDigest) {
    return descriptorRefusal(SPLIT_DESCRIPTOR_ERROR.COLLISION);
  }
  let receipt;
  try {
    receipt = JSON.parse(recorded.ownerResultText);
  } catch {
    throw Object.assign(new Error(SPLIT_DESCRIPTOR_ERROR.RECEIPT),
      {code: SPLIT_DESCRIPTOR_ERROR.RECEIPT});
  }
  if (!Number.isSafeInteger(recorded.term) || recorded.term < 1 ||
      !Number.isSafeInteger(recorded.logIndex) || recorded.logIndex < 1 ||
      recorded.outcome !== PARTITION_COMMITTED_COMMAND_OUTCOME.APPLIED ||
      recorded.failureCode !== null || recorded.failureMessage !== null ||
      recorded.lastInsertRowid !== null ||
      !isSplitDescriptorReceiptFor(receipt, descriptor.intent) ||
      recorded.changes !== (isSiblingDescriptorAction(descriptor.intent.action) ?
        siblingDescriptorChangeCount(receipt) :
        Number(receipt.disposition === DISPOSITION.DELETED))) {
    throw Object.assign(new Error(SPLIT_DESCRIPTOR_ERROR.RECEIPT),
      {code: SPLIT_DESCRIPTOR_ERROR.RECEIPT});
  }
  return {splitDescriptorReceipt: receipt, committed: true, term: recorded.term};
}

export {DISPOSITION as SPLIT_DESCRIPTOR_DISPOSITION, SPLIT_DESCRIPTOR_ERROR,
  SPLIT_DESCRIPTOR_FINALIZE_SQL, decodeSplitDescriptorCommand, deriveParticipantEntryId,
  descriptorRefusal,
  finalizeChildReceipt, isSplitDescriptorDigest, isSplitDescriptorReceiptFor,
  retainedSplitDescriptorAnswer,
  canonicalIntent as canonicalSplitDescriptorIntent, isSiblingDescriptorAction, splitDescriptorCommandDigest, splitDescriptorStatement, splitDescriptorWriteKey,
  usesSplitDescriptorIdentity};
