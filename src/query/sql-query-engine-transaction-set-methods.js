/** sql_transactions owns admission, freeze and its exact recovery census.
 * Sequential progress reads never establish an OPEN participant census: the
 * retained manifest and its exact phase/text CAS do. */
import {SQL_QUERY_ENGINE_SHARED} from './sql-query-engine-shared.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
} from '../control-plane/control-plane-system-table-gateway-constants.js';
import {TRANSACTION_AUTHORITY_STATE as AUTHORITY} from
  './distributed/distributed-transaction-recovery-authority.js';

const {TABLES, PRESSURE_WORK_CLASS} =
  SQL_QUERY_ENGINE_SHARED;
const TRANSACTION_AUTHORITY_READ_OPTIONS = Object.freeze({
  authoritativeReadMode:
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE
      .OWNER_LOCAL_PREFERRED_OWNER_RPC_FALLBACK,
  workClass: PRESSURE_WORK_CLASS.CRITICAL,
});
const RECOVERY_ROW_FENCE = Object.freeze(['transaction_id', 'session_id',
  'transaction_epoch', 'timeout_deadline', 'transaction_mode', 'participant_set_state',
  'participant_set_text', 'commit_mode', 'frozen_participant_count', 'decision',
  'decision_text', 'decision_digest']);

function unavailableRecoveryAuthority() {
  return {state: AUTHORITY.UNAVAILABLE};
}

async function readAuthorityRow(engine, transactionId) {
  const gateway = engine.getControlPlaneSystemTableGateway();
  const result = await gateway?.readAuthoritativeRows?.(TABLES.SQL_TRANSACTIONS,
    `SELECT * FROM ${TABLES.SQL_TRANSACTIONS} WHERE transaction_id = ?`,
    [transactionId], TRANSACTION_AUTHORITY_READ_OPTIONS);
  if (result?.success !== true || !Array.isArray(result.rows)) {
    return unavailableRecoveryAuthority();
  } else if (result.rows.length === 0) {
    return {state: AUTHORITY.MISSING};
  }
  return result.rows.length === 1 ? {state: AUTHORITY.AVAILABLE, transaction: result.rows[0]} :
    {state: AUTHORITY.INVALID};
}

const sqlQueryEngineTransactionSetMethods = {
  async readDistributedTransactionRecoveryState(transactionId) {
    const before = await readAuthorityRow(this, transactionId);
    if (before.state !== AUTHORITY.AVAILABLE) return before;
    const first = before.transaction;
    const gateway = this.getControlPlaneSystemTableGateway();
    const participants = await gateway.readAuthoritativeRows(TABLES.SQL_TRANSACTION_PARTICIPANTS,
      `SELECT * FROM ${TABLES.SQL_TRANSACTION_PARTICIPANTS} WHERE transaction_id = ?`,
      [transactionId], TRANSACTION_AUTHORITY_READ_OPTIONS);
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
