// The two PARTITIONS effects of a sibling issued in the durable TABLES split plan.
// The common descriptor command owner binds their SQL, entry keys and committed receipts.
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schema-shared-constants.js';
import {buildSystemTableMutationSqlParts} from '../cdc/cdc-system-table-mutation-sql-helpers.js';
import {CDC_OPERATION} from '../constants/index.js';
import {CONTROL_PLANE_MUTATION_OPERATION} from '../control-plane/control-plane-system-table-gateway-constants.js';
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';

const SIBLING_DESCRIPTOR_ACTION = Object.freeze({
  PROMOTE: 'promoteSibling', FINALIZE: 'finalizeSibling',
});
const DISPOSITION = Object.freeze({
  PROMOTED: 'promoted', RESTORED: 'restored', CANCELLED: 'cancelled', SUPERSEDED: 'superseded',
});
const SUBJECT_FIELDS = Object.freeze([
  'action', 'tableId', 'partitionId', 'workflowId', 'workflowAttempt',
  'priorAttempt', 'priorVersion', 'targetVersion',
]);

function canonicalSiblingDescriptorIntent(value) {
  const copy = copyStrictOwnDataRecord(value);
  if (!copy || Object.keys(copy).length !== SUBJECT_FIELDS.length ||
      !Object.values(SIBLING_DESCRIPTOR_ACTION).includes(copy.action) ||
      ![copy.tableId, copy.partitionId, copy.workflowId].every((id) =>
        typeof id === 'string' && id.trim().length > 0) ||
      ![copy.workflowAttempt, copy.priorAttempt, copy.priorVersion, copy.targetVersion]
        .every(Number.isSafeInteger) ||
      copy.priorAttempt < 0 || copy.workflowAttempt <= copy.priorAttempt ||
      copy.priorVersion < 1 || copy.targetVersion <= copy.priorVersion) return null;
  return Object.freeze(Object.fromEntries(SUBJECT_FIELDS.map((field) => [field, copy[field]])));
}

function siblingDescriptorMutation(intent) {
  const promote = intent.action === SIBLING_DESCRIPTOR_ACTION.PROMOTE;
  return {
    operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
    tableName: SYSTEM_TABLE_NAME.PARTITIONS,
    data: {
      partition_version: promote ? intent.targetVersion : intent.priorVersion,
      split_descriptor_attempt: intent.workflowAttempt,
    },
    whereClause: {
      table_id: intent.tableId,
      split_descriptor_attempt: promote ? intent.priorAttempt : intent.workflowAttempt,
      partition_version: promote ? intent.priorVersion : intent.targetVersion,
      partition_id: intent.partitionId,
    },
  };
}

function siblingDescriptorStatement(intent) {
  const {data, whereClause, tableName} = siblingDescriptorMutation(intent);
  const update = buildSystemTableMutationSqlParts(CDC_OPERATION.UPDATE, data);
  const where = buildSystemTableMutationSqlParts(CDC_OPERATION.DELETE, whereClause);
  return {sql: `UPDATE ${tableName} SET ${update.setClause} WHERE ${where.whereStr}`,
    params: [...update.values, ...where.values]};
}

// Called in the transaction applying the guarded UPDATE. An unchanged original
// preimage can retire an unexecuted promotion only while its forward entry is
// unsettled. That terminal receipt must then be consulted before the first
// forward execution, even if another workflow recreates this row verbatim.
function siblingDescriptorDispositionIn(db, intent, changes, forwardUnsettled) {
  const promote = intent.action === SIBLING_DESCRIPTOR_ACTION.PROMOTE;
  let disposition;
  if (changes !== 0 && changes !== 1) {
    throw new Error('Unexpected affected rows for sibling descriptor');
  }
  if (changes === 1) {
    // A changed descriptor without matching forward proof must roll back
    // the entire apply transaction. A retryable zero-answer cannot undo it.
    if (!promote && forwardUnsettled !== false) {
      throw Object.assign(new Error('Sibling restore lacks its committed promotion'),
        {code: 'split_sibling_restore_missing_promotion'});
    }
    disposition = promote ? DISPOSITION.PROMOTED : DISPOSITION.RESTORED;
  } else if (!promote && changes === 0) {
    const row = db.prepare('SELECT table_id, partition_version, split_descriptor_attempt ' +
      'FROM partitions WHERE partition_id = ?').get(intent.partitionId);
    if (row?.table_id !== intent.tableId || !Number.isSafeInteger(row.split_descriptor_attempt)) {
      return null;
    }
    if (row.split_descriptor_attempt > intent.workflowAttempt) {
      disposition = DISPOSITION.SUPERSEDED;
    } else if (forwardUnsettled === true && row.split_descriptor_attempt === intent.priorAttempt &&
        row.partition_version === intent.priorVersion) {
      disposition = DISPOSITION.CANCELLED;
    }
  }
  return disposition === undefined ? null : Object.freeze({...intent, disposition});
}

function isSiblingDescriptorReceiptFor(value, expected) {
  const receipt = copyStrictOwnDataRecord(value);
  const intent = canonicalSiblingDescriptorIntent(expected);
  if (!receipt || !intent || Object.keys(receipt).length !== SUBJECT_FIELDS.length + 1 ||
      !SUBJECT_FIELDS.every((field) => receipt[field] === intent[field])) return false;
  return intent.action === SIBLING_DESCRIPTOR_ACTION.PROMOTE ?
    receipt.disposition === DISPOSITION.PROMOTED :
    [DISPOSITION.RESTORED, DISPOSITION.CANCELLED,
      DISPOSITION.SUPERSEDED].includes(receipt.disposition);
}

function siblingDescriptorChangeCount(receipt) {
  return receipt.disposition === DISPOSITION.PROMOTED ||
      receipt.disposition === DISPOSITION.RESTORED ? 1 : 0;
}

export {SIBLING_DESCRIPTOR_ACTION, canonicalSiblingDescriptorIntent, isSiblingDescriptorReceiptFor,
  siblingDescriptorChangeCount, siblingDescriptorDispositionIn, siblingDescriptorMutation,
  siblingDescriptorStatement};
