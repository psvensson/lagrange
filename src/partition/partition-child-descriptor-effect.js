// The issued row is retained by TABLES before sending either child. Keep its
// deterministic field order and timestamp when a new holder takes the attempt.
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schema-shared-constants.js';
import {buildSystemTableMutationSqlParts} from '../cdc/cdc-system-table-mutation-sql-helpers.js';
import {CDC_OPERATION} from '../constants/index.js';
import {CONTROL_PLANE_MUTATION_OPERATION as MUTATION} from '../control-plane/control-plane-system-table-gateway-constants.js';
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';

const CHILD_DESCRIPTOR_ACTION = Object.freeze({
  CREATE: 'createChild', ADOPT: 'adoptChild', FINALIZE: 'finalizeChild', TRANSFER: 'transferChild',
});
const CHILD_DESCRIPTOR_DISPOSITION = Object.freeze({
  ACQUIRED: 'acquired', TRANSFERRED: 'transferred', ABSENT: 'absent', DELETED: 'deleted', SUPERSEDED: 'superseded',
});
const ACTION = CHILD_DESCRIPTOR_ACTION;
const DISPOSITION = CHILD_DESCRIPTOR_DISPOSITION;
const BASE = ['action', 'tableId', 'partitionId', 'workflowId', 'workflowAttempt'];
const ROW_FIELDS = ['partition_id', 'table_id', 'table_name', 'partition_key_start', 'partition_key_end',
  'partition_key_type', 'partition_version', 'split_descriptor_attempt', 'replica_count', 'size_bytes',
  'leader_node_id', 'state', 'created_at', 'updated_at'];
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const boundary = (value) => value === null || typeof value === 'string' || Number.isFinite(value);
const exact = (record, fields) => record !== null && Object.keys(record).length === fields.length &&
  fields.every((field) => Object.hasOwn(record, field));

function canonicalRow(value, intent) {
  const row = copyStrictOwnDataRecord(value);
  if (!exact(row, ROW_FIELDS) || row.table_id !== intent.tableId || row.partition_id !== intent.partitionId ||
      row.split_descriptor_attempt !== intent.workflowAttempt || !text(row.table_name) || !text(row.partition_key_type) ||
      !boundary(row.partition_key_start) || !boundary(row.partition_key_end) ||
      !positive(row.partition_version) || !positive(row.replica_count) || row.size_bytes !== 0 ||
      row.leader_node_id !== null || row.state !== 'NORMAL' || !Number.isSafeInteger(row.created_at) ||
      row.created_at < 0 || row.updated_at !== row.created_at) return null;
  return Object.freeze(Object.fromEntries(ROW_FIELDS.map((key) => [key, row[key]])));
}

function canonicalChildDescriptorIntent(value) {
  const input = copyStrictOwnDataRecord(value);
  if (!input || !Object.values(ACTION).includes(input.action) || !text(input.tableId) || !text(input.partitionId) ||
      !text(input.workflowId) || !positive(input.workflowAttempt)) return null;
  const isTransfer = input.action === ACTION.TRANSFER;
  const terminal = isTransfer || input.action === ACTION.FINALIZE;
  const sourceAction = terminal ? input.sourceAction : input.action;
  if (sourceAction !== ACTION.ADOPT && sourceAction !== ACTION.CREATE) return null;
  const fields = [...BASE, 'row', 'incomingProof'];
  if (terminal) fields.push('sourceAction');
  if (sourceAction === ACTION.ADOPT) fields.push('priorAttempt');
  if (isTransfer) fields.push('successorWorkflowId', 'successorWorkflowAttempt');
  if (!exact(input, fields)) return null;
  if (isTransfer && (!text(input.successorWorkflowId) || !positive(input.successorWorkflowAttempt) ||
      input.successorWorkflowAttempt <= input.workflowAttempt)) return null;
  const row = canonicalRow(input.row, input);
  if (!row) return null;
  let incomingProof = null;
  if (input.incomingProof !== null) {
    const proof = copyStrictOwnDataRecord(input.incomingProof);
    if (!exact(proof, ['entryId', 'commandDigest']) || !text(proof.entryId) || !text(proof.commandDigest)) return null;
    incomingProof = Object.freeze({entryId: proof.entryId, commandDigest: proof.commandDigest});
  }
  if (sourceAction === ACTION.ADOPT && (!incomingProof || input.priorAttempt !== input.workflowAttempt)) return null;
  const canonical = Object.fromEntries(fields.map((key) => [key, input[key]]));
  return Object.freeze({...canonical, row, incomingProof});
}

function buildChildFinalizeIntent(forward) {
  return canonicalChildDescriptorIntent({...forward, sourceAction: forward.action, action: ACTION.FINALIZE});
}

function buildChildTransferIntent(forward, successor) {
  return canonicalChildDescriptorIntent({...forward, sourceAction: forward.action, action: ACTION.TRANSFER,
    successorWorkflowId: successor.workflowId, successorWorkflowAttempt: successor.workflowAttempt});
}

function childSourceForward(intent) {
  const {sourceAction, successorWorkflowId, successorWorkflowAttempt, ...fields} = intent;
  return canonicalChildDescriptorIntent({...fields, action: sourceAction});
}

function childDescriptorMutation(intent) {
  const tableName = SYSTEM_TABLE_NAME.PARTITIONS;
  if (intent.action === ACTION.CREATE) return {operation: MUTATION.INSERT, tableName, row: intent.row};
  if (intent.action === ACTION.FINALIZE) {
    return {operation: MUTATION.DELETE, tableName, whereClause: {table_id: intent.tableId,
      split_descriptor_attempt: intent.workflowAttempt, partition_id: intent.partitionId}};
  }
  const row = intent.row;
  return {operation: MUTATION.UPDATE, tableName, data: {split_descriptor_attempt:
    intent.action === ACTION.TRANSFER ? intent.successorWorkflowAttempt : intent.workflowAttempt},
  whereClause: {table_id: row.table_id, table_name: row.table_name, partition_key_start: row.partition_key_start,
    partition_key_end: row.partition_key_end, partition_key_type: row.partition_key_type,
    partition_version: row.partition_version, split_descriptor_attempt: intent.workflowAttempt, partition_id: row.partition_id}};
}

function childDescriptorStatement(intent) {
  const mutation = childDescriptorMutation(intent);
  if (mutation.operation === MUTATION.INSERT) {
    const insert = buildSystemTableMutationSqlParts(CDC_OPERATION.INSERT, mutation.row);
    return {sql: `INSERT INTO ${mutation.tableName} (${insert.columns}) VALUES (${insert.placeholders})`, params: insert.values};
  }
  const where = buildSystemTableMutationSqlParts(CDC_OPERATION.DELETE, mutation.whereClause);
  if (mutation.operation === MUTATION.DELETE) {
    return {sql: `DELETE FROM ${mutation.tableName} WHERE ${where.whereStr}`, params: where.values};
  }
  const update = buildSystemTableMutationSqlParts(CDC_OPERATION.UPDATE, mutation.data);
  return {sql: `UPDATE ${mutation.tableName} SET ${update.setClause} WHERE ${where.whereStr}`,
    params: [...update.values, ...where.values]};
}

function isChildDescriptorReceiptFor(value, expected) {
  const receipt = copyStrictOwnDataRecord(value);
  if (!receipt || !Object.hasOwn(receipt, 'disposition')) return false;
  const {disposition, ...payload} = receipt;
  const intent = canonicalChildDescriptorIntent(payload);
  if (!intent || JSON.stringify(intent) !== JSON.stringify(canonicalChildDescriptorIntent(expected))) return false;
  switch (intent.action) {
    case ACTION.CREATE:
    case ACTION.ADOPT: return disposition === DISPOSITION.ACQUIRED;
    case ACTION.FINALIZE: return [DISPOSITION.DELETED, DISPOSITION.ABSENT, DISPOSITION.SUPERSEDED].includes(disposition);
    case ACTION.TRANSFER: return disposition === DISPOSITION.ABSENT || disposition === DISPOSITION.TRANSFERRED;
  }
}

export {CHILD_DESCRIPTOR_ACTION, CHILD_DESCRIPTOR_DISPOSITION, buildChildFinalizeIntent,
  buildChildTransferIntent, canonicalChildDescriptorIntent, childDescriptorMutation, childDescriptorStatement,
  childSourceForward, isChildDescriptorReceiptFor};
