/** Fixed settlement of existing sql_transactions lineage while new mutation
 * admission is closed. The partition invokes this same owner at request and
 * committed apply; no SQL, table selector, permission or general patch is wire data. */
import {createHash} from 'node:crypto';
import {copyStrictOwnDataRecord, copyDenseOwnDataArray} from '../../utils/strict-own-data.js';
import {isCanonicalTransactionEpoch} from '../../constants/transactions.js';
import {canonicalDecisionRecord} from '../../partition/partition-participant-transaction-bytes.js';
import {readParticipantSet} from './distributed-transaction-participant-manifest.js';
import {decisionRecordOfRow, RECORDED_DECISION_STATE} from './distributed-transaction-decision-record.js';
import {PARTICIPANT_SET_STATE, COMMIT_MODE} from '../../constants/index.js';
import {TRANSACTION_STATUS} from './distributed-transaction-coordinator-constants.js';
import {PARTICIPANT_TRANSACTION_DECISION as DECISION} from
  '../../partition/partition-participant-transaction-constants.js';

const TRANSACTION_SETTLEMENT_KIND = Object.freeze({
  FREEZE: 'FREEZE', DECIDE: 'DECIDE', PROGRESS: 'PROGRESS',
});
const TRANSACTION_SETTLEMENT_OUTCOME = Object.freeze({
  READY: 'ready', APPLIED: 'applied', REPLAYED: 'replayed',
  REFUSED: 'refused', ALREADY_RECORDED: 'already_recorded', UNAVAILABLE: 'unavailable',
});
const TRANSACTION_SETTLEMENT_REASON = Object.freeze({
  INVALID: 'invalid_command', MISSING: 'row_absent', LEGACY: 'legacy_participant_set',
  IDENTITY: 'identity_conflict', SET: 'participant_set_conflict', PHASE: 'phase_conflict',
  COMMIT: 'new_commit_forbidden', DECISION: 'recorded_decision_invalid',
  BINDING: 'decision_binding_conflict', CAS: 'conditional_update_conflict',
  READ: 'row_unavailable',
});
const KIND = TRANSACTION_SETTLEMENT_KIND;
const OUTCOME = TRANSACTION_SETTLEMENT_OUTCOME;
const REASON = TRANSACTION_SETTLEMENT_REASON;
const BASE_FIELDS = Object.freeze(['kind', 'transactionId', 'sessionId',
  'transactionEpoch', 'participantSetText']);
const EXTRA_FIELDS = Object.freeze({[KIND.FREEZE]: [],
  [KIND.DECIDE]: ['decision', 'decisionText', 'decisionDigest'],
  [KIND.PROGRESS]: ['decisionDigest', 'status']});
const SETTLEMENT_ENTRY_PREFIX = 'tx-coordinator-settlement:v1:';
const READ_ROW_SQL = 'SELECT * FROM sql_transactions WHERE transaction_id = ?';
const ROW_WHERE = 'transaction_id = ? AND session_id = ? AND transaction_epoch = ? ' +
  'AND participant_set_text = ? AND participant_set_state = ? ' +
  'AND decision IS ? AND decision_text IS ? AND decision_digest IS ?';
const FREEZE_SQL = 'UPDATE sql_transactions SET participant_set_state = ?, commit_mode = ?, ' +
  'frozen_participant_count = ? WHERE ' + ROW_WHERE;
const DECIDE_SQL = 'UPDATE sql_transactions SET decision = ?, decision_text = ?, ' +
  'decision_digest = ? WHERE ' + ROW_WHERE;
const PROGRESS_SQL = 'UPDATE sql_transactions SET status = ? WHERE ' + ROW_WHERE;

function outcome(value, reason = null, record = null) {
  return Object.freeze({outcome: value, reason, recordedDecision: record});
}

function canonicalRecordedResult(input) {
  const data = copyStrictOwnDataRecord(input);
  if (!data) return null;
  if (data.state === RECORDED_DECISION_STATE.ABSENT && Object.keys(data).length === 1) {
    return Object.freeze({state: RECORDED_DECISION_STATE.ABSENT});
  }
  const fields = ['state', 'transactionId', 'decision', 'participants',
    'decisionText', 'decisionDigest'];
  if (data.state !== RECORDED_DECISION_STATE.RECORDED ||
      Object.keys(data).length !== fields.length ||
      !fields.every((key) => key in data)) return null;
  const record = canonicalDecisionRecord(data);
  const pairs = copyDenseOwnDataArray(data.participants);
  if (!record || !pairs || record.participants.length !== pairs.length) return null;
  for (let index = 0; index < pairs.length; index += 1) {
    const pair = copyDenseOwnDataArray(pairs[index]);
    if (!pair || pair.length !== 2 || pair.some((value, at) =>
      value !== record.participants[index][at])) return null;
  }
  return Object.freeze({state: RECORDED_DECISION_STATE.RECORDED, ...record});
}

const SETTLEMENT_RESULT_FIELDS = Object.freeze(['outcome', 'reason', 'recordedDecision']);
/** Validate both transported and retained command results before consuming them. */
function canonicalTransactionSettlementResult(input) {
  const data = copyStrictOwnDataRecord(input);
  if (!data || Object.keys(data).length !== SETTLEMENT_RESULT_FIELDS.length ||
    !SETTLEMENT_RESULT_FIELDS.every((key) => key in data) ||
    !Object.values(OUTCOME).includes(data.outcome)) return null;
  const record = data.recordedDecision === null ? null :
    canonicalRecordedResult(data.recordedDecision);
  if (data.recordedDecision !== null && record === null) return null;
  if (data.outcome === OUTCOME.REFUSED || data.outcome === OUTCOME.UNAVAILABLE) {
    const reasonValid = data.outcome === OUTCOME.UNAVAILABLE ? data.reason === REASON.READ :
      Object.values(REASON).includes(data.reason) && data.reason !== REASON.READ;
    return reasonValid && record === null ? outcome(data.outcome, data.reason) : null;
  }
  if (data.reason !== null || (data.outcome === OUTCOME.READY && record !== null) ||
      (data.outcome === OUTCOME.ALREADY_RECORDED &&
        record?.state !== RECORDED_DECISION_STATE.RECORDED)) return null;
  return outcome(data.outcome, null, record);
}

function sameDecisionSet(record, pairs) {
  return record.participants.length === pairs.length &&
    record.participants.every(([id], index) => id === pairs[index][0]);
}

function canonicalTransactionSettlement(input) {
  const data = copyStrictOwnDataRecord(input);
  const extra = data && Object.hasOwn(EXTRA_FIELDS, data.kind) && EXTRA_FIELDS[data.kind];
  if (!extra) return null;
  const keys = [...BASE_FIELDS, ...extra];
  if (Object.keys(data).length !== keys.length || !keys.every((key) => key in data) ||
      typeof data.transactionId !== 'string' || !/^[a-f0-9]{32}$/u.test(data.transactionId) ||
      typeof data.sessionId !== 'string' || data.sessionId.length === 0 ||
      !isCanonicalTransactionEpoch(data.transactionEpoch)) return null;
  const pairs = readParticipantSet(data.transactionId, data.participantSetText);
  if (!pairs) return null;
  if (data.kind === KIND.DECIDE) {
    const decision = canonicalDecisionRecord(data);
    if (!decision || !sameDecisionSet(decision, pairs)) return null;
  }
  if (data.kind === KIND.PROGRESS &&
      (typeof data.decisionDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(data.decisionDigest) ||
        ![TRANSACTION_STATUS.COMMITTING, TRANSACTION_STATUS.COMMITTED,
          TRANSACTION_STATUS.ROLLING_BACK, TRANSACTION_STATUS.ROLLED_BACK].includes(data.status))) {
    return null;
  }
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, data[key]])));
}

function transactionSettlementBytes(input) {
  const command = canonicalTransactionSettlement(input);
  if (!command) return null;
  const commandText = JSON.stringify(command);
  const commandDigest = createHash('sha256').update(commandText).digest('hex');
  return Object.freeze({command, commandText, commandDigest,
    entryId: SETTLEMENT_ENTRY_PREFIX + commandDigest});
}

function validFrozenRow(row, count) {
  return row.participant_set_state === PARTICIPANT_SET_STATE.FROZEN &&
    row.commit_mode === COMMIT_MODE.TWO_PHASE_COMMIT && row.frozen_participant_count === count;
}

function progressRefusal(command, record) {
  const commit = record.decision === DECISION.COMMIT;
  const allowed = commit ? [TRANSACTION_STATUS.COMMITTING, TRANSACTION_STATUS.COMMITTED] :
    [TRANSACTION_STATUS.ROLLING_BACK, TRANSACTION_STATUS.ROLLED_BACK];
  return command.decisionDigest !== record.decisionDigest || !allowed.includes(command.status);
}

function validateTransactionSettlement(input, row) {
  const command = canonicalTransactionSettlement(input);
  if (!command) return outcome(OUTCOME.REFUSED, REASON.INVALID);
  if (!row) return outcome(OUTCOME.REFUSED, REASON.MISSING);
  if (row.transaction_id !== command.transactionId || row.session_id !== command.sessionId ||
      row.transaction_epoch !== command.transactionEpoch) {
    return outcome(OUTCOME.REFUSED, REASON.IDENTITY);
  }
  const pairs = readParticipantSet(row.transaction_id, row.participant_set_text);
  if (!pairs) return outcome(OUTCOME.REFUSED, REASON.LEGACY);
  if (row.participant_set_text !== command.participantSetText) {
    return outcome(OUTCOME.REFUSED, REASON.SET);
  }
  const recorded = decisionRecordOfRow(row, command.transactionId);
  if (recorded.state === RECORDED_DECISION_STATE.INVALID ||
      (recorded.state === RECORDED_DECISION_STATE.RECORDED &&
        !sameDecisionSet(recorded, pairs))) return outcome(OUTCOME.REFUSED, REASON.DECISION);
  const frozen = validFrozenRow(row, pairs.length);
  if (command.kind === KIND.FREEZE) {
    if (frozen) return outcome(OUTCOME.REPLAYED, null, recorded);
    return row.participant_set_state === PARTICIPANT_SET_STATE.OPEN &&
      row.commit_mode === COMMIT_MODE.NOT_SELECTED && row.frozen_participant_count === 0 &&
      recorded.state === RECORDED_DECISION_STATE.ABSENT ? outcome(OUTCOME.READY) :
      outcome(OUTCOME.REFUSED, REASON.PHASE);
  }
  if (!frozen) return outcome(OUTCOME.REFUSED, REASON.PHASE);
  if (command.kind === KIND.DECIDE) {
    if (recorded.state === RECORDED_DECISION_STATE.RECORDED) {
      return outcome(recorded.decisionText === command.decisionText &&
        recorded.decisionDigest === command.decisionDigest ? OUTCOME.REPLAYED :
        OUTCOME.ALREADY_RECORDED, null, recorded);
    }
    return command.decision === DECISION.ROLLBACK ? outcome(OUTCOME.READY) :
      outcome(OUTCOME.REFUSED, REASON.COMMIT);
  }
  if (recorded.state !== RECORDED_DECISION_STATE.RECORDED || progressRefusal(command, recorded)) {
    return outcome(OUTCOME.REFUSED, REASON.BINDING);
  }
  return outcome(row.status === command.status ||
    row.status === (recorded.decision === DECISION.COMMIT ? TRANSACTION_STATUS.COMMITTED :
      TRANSACTION_STATUS.ROLLED_BACK) ? OUTCOME.REPLAYED : OUTCOME.READY, null, recorded);
}

function observeTransactionSettlement(database, input) {
  const command = canonicalTransactionSettlement(input);
  if (!command) return outcome(OUTCOME.REFUSED, REASON.INVALID);
  try {
    return validateTransactionSettlement(command,
      database.prepare(READ_ROW_SQL).get(command.transactionId));
  } catch {
    return outcome(OUTCOME.UNAVAILABLE, REASON.READ);
  }
}

/** Call only inside the partition's existing application transaction. The
 * partition retains this typed outcome with the applied index atomically. */
function applyTransactionSettlement(database, input) {
  const command = canonicalTransactionSettlement(input);
  if (!command) return outcome(OUTCOME.REFUSED, REASON.INVALID);
  const row = database.prepare(READ_ROW_SQL).get(command.transactionId);
  const admitted = validateTransactionSettlement(command, row);
  if (admitted.outcome !== OUTCOME.READY) return admitted;
  const where = [row.transaction_id, row.session_id, row.transaction_epoch,
    row.participant_set_text, row.participant_set_state,
    row.decision, row.decision_text, row.decision_digest];
  let changed;
  if (command.kind === KIND.FREEZE) {
    changed = database.prepare(FREEZE_SQL).run(PARTICIPANT_SET_STATE.FROZEN,
      COMMIT_MODE.TWO_PHASE_COMMIT, readParticipantSet(command.transactionId,
        command.participantSetText).length, ...where);
  } else if (command.kind === KIND.DECIDE) {
    changed = database.prepare(DECIDE_SQL).run(command.decision, command.decisionText,
      command.decisionDigest, ...where);
  } else {
    changed = database.prepare(PROGRESS_SQL).run(command.status, ...where);
  }
  return changed.changes === 1 ? outcome(OUTCOME.APPLIED, null,
    decisionRecordOfRow(database.prepare(READ_ROW_SQL).get(command.transactionId))) :
    outcome(OUTCOME.REFUSED, REASON.CAS);
}

export {canonicalTransactionSettlement, transactionSettlementBytes,
  canonicalTransactionSettlementResult,
  observeTransactionSettlement, applyTransactionSettlement,
  TRANSACTION_SETTLEMENT_KIND, TRANSACTION_SETTLEMENT_OUTCOME};
