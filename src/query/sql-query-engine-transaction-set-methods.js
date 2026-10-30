/** sql_transactions owns admission, freeze and its exact recovery census.
 * Sequential progress reads never establish an OPEN participant census: the
 * retained manifest and its exact phase/text CAS do. */
import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {PARTICIPANT_SET_STATE} from '../constants/index.js';
import {incompleteParticipantSet, readParticipantSet} from
  './distributed/distributed-transaction-participant-set.js';
import {TRANSACTION_AUTHORITY_STATE as AUTHORITY} from
  './distributed/distributed-transaction-recovery-authority.js';

const {TABLES, CONTROL_PLANE_MUTATION_OPERATION, PRESSURE_WORK_CLASS} =
  SQL_QUERY_ENGINE_SHARED;
const RECOVERY_ROW_FENCE = Object.freeze(['transaction_id', 'session_id',
  'transaction_epoch', 'timeout_deadline', 'transaction_mode', 'participant_set_state',
  'participant_set_text', 'commit_mode', 'frozen_participant_count', 'decision',
  'decision_text', 'decision_digest']);

function unavailableRecoveryAuthority() {
  return {state: AUTHORITY.UNAVAILABLE};
}

function isCertifiedSingleRowUpdate(mutation) {
  if (mutation?.success !== true) return false;
  const count = mutation?.partitionResult?.affectedRows ??
    mutation?.affectedRows ?? mutation?.changes;
  return Number.isSafeInteger(count) && count === 1;
}

async function readAuthorityRow(engine, transactionId) {
  const gateway = engine.getControlPlaneSystemTableGateway();
  const result = await gateway?.readAuthoritativeRows?.(TABLES.SQL_TRANSACTIONS,
    `SELECT * FROM ${TABLES.SQL_TRANSACTIONS} WHERE transaction_id = ?`,
    [transactionId], {workClass: PRESSURE_WORK_CLASS.CRITICAL});
  if (result?.success !== true || !Array.isArray(result.rows)) {
    return unavailableRecoveryAuthority();
  } else if (result.rows.length === 0) {
    return {state: AUTHORITY.MISSING};
  }
  return result.rows.length === 1 ? {state: AUTHORITY.AVAILABLE, transaction: result.rows[0]} :
    {state: AUTHORITY.INVALID};
}

const sqlQueryEngineTransactionSetMethods = {
  async persistDistributedTransactionParticipantSet(record, previousText) {
    const pairs = readParticipantSet(record.transactionId, record.participantSetText);
    if (!pairs || !readParticipantSet(record.transactionId, previousText)) {
      throw incompleteParticipantSet();
    }
    const expected = {transaction_id: record.transactionId, session_id: record.sessionId,
      transaction_epoch: record.transactionEpoch, participant_set_state: PARTICIPANT_SET_STATE.OPEN,
      participant_set_text: previousText, decision: null};
    const data = {participant_set_text: record.participantSetText,
      participant_set_state: record.participantSetState,
      commit_mode: record.commitMode, frozen_participant_count: record.frozenParticipantCount};
    // No coalescing: each old-text fence identifies a distinct admission.
    let mutation;
    try {
      mutation = await this.getControlPlaneSystemTableGateway().submitMutation({
        operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
        tableName: TABLES.SQL_TRANSACTIONS, whereClause: expected, data,
      }, this.buildDistributedTransactionMutationOptions(TABLES.SQL_TRANSACTIONS,
        {workClass: PRESSURE_WORK_CLASS.CRITICAL}));
    } catch (error) {
      // A lost answer is resolved by exact authoritative readback below.
      mutation = {success: false, error: error?.message};
    }
    if (isCertifiedSingleRowUpdate(mutation)) {
      return;
    }
    const row = await this.readDistributedTransactionRow(record.transactionId);
    if (!row || row.session_id !== record.sessionId ||
        row.transaction_epoch !== record.transactionEpoch ||
        Object.entries(data).some(([key, value]) => row[key] !== value) ||
        (record.participantSetState === PARTICIPANT_SET_STATE.OPEN && row.decision !== null)) {
      this.assertDistributedTransactionMutationSucceeded(mutation, TABLES.SQL_TRANSACTIONS);
      throw incompleteParticipantSet();
    }
  },

  async readDistributedTransactionRecoveryState(transactionId) {
    const before = await readAuthorityRow(this, transactionId);
    if (before.state !== AUTHORITY.AVAILABLE) return before;
    const first = before.transaction;
    const gateway = this.getControlPlaneSystemTableGateway();
    const participants = await gateway.readAuthoritativeRows(TABLES.SQL_TRANSACTION_PARTICIPANTS,
      `SELECT * FROM ${TABLES.SQL_TRANSACTION_PARTICIPANTS} WHERE transaction_id = ?`,
      [transactionId], {workClass: PRESSURE_WORK_CLASS.CRITICAL});
    if (participants?.success !== true || !Array.isArray(participants.rows)) {
      return unavailableRecoveryAuthority();
    }
    const after = await readAuthorityRow(this, transactionId);
    if (after.state !== AUTHORITY.AVAILABLE) return after;
    const row = after.transaction;
    if (RECOVERY_ROW_FENCE.some((field) => first[field] !== row[field])) {
      return unavailableRecoveryAuthority();
    }
    return {state: AUTHORITY.AVAILABLE, transaction: row, participants: participants.rows};
  },
};

export {sqlQueryEngineTransactionSetMethods};
