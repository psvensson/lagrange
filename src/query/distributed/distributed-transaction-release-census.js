/** Read-only input to the release owner's fresh drain invocation. Historical
 * terminal status is never discharge proof. This helper certifies no drain. */
import {createHash} from 'node:crypto';
import {
  COMMIT_MODE,
  isCanonicalTransactionEpoch,
  PARTICIPANT_SET_STATE,
  TRANSACTION_MODE,
} from '../../constants/transactions.js';
import {readParticipantSet} from './distributed-transaction-participant-manifest.js';
import {decisionRecordOfRow, RECORDED_DECISION_STATE} from './distributed-transaction-decision-record.js';
import {readTransactionSchemaInventory, TRANSACTION_SCHEMA_ENFORCEMENT_STATE} from
  './distributed-transaction-schema-enforcement.js';
import {PARTICIPANT_TRANSACTION_DECISION as DECISION} from
  '../../partition/partition-participant-transaction-constants.js';
import {readPartitionWriteOrigin} from
  '../../partition/partition-participant-transaction-store.js';
import {TRANSACTION_STATUS} from './distributed-transaction-coordinator-constants.js';

const TRANSACTION_RELEASE_SEMANTIC_VERSION = 'tx1-query-set-v1';
// The one terminal status a released transaction reaches for its decision.
const TRANSACTION_RELEASE_TERMINAL_STATUS = Object.freeze({
  [DECISION.COMMIT]: TRANSACTION_STATUS.COMMITTED,
  [DECISION.ROLLBACK]: TRANSACTION_STATUS.ROLLED_BACK,
});
const TRANSACTION_RELEASE_CENSUS_STATE = Object.freeze({
  CLEAR: 'clear', HELD: 'held', UNAVAILABLE: 'unavailable',
});
const REQUIRED_COLUMNS = Object.freeze(['transaction_id', 'session_id', 'transaction_epoch',
  'participant_set_text', 'participant_set_state', 'decision', 'decision_text', 'decision_digest']);
const CENSUS_ROWS_SQL = 'SELECT * FROM sql_transactions ORDER BY transaction_id';

function censusResult(state, rowGenerationDigest = null, legacy = [], recoverable = [],
  enforcement = null, currentSchemaValid = false) {
  return Object.freeze({state, schemaVersion: enforcement?.schemaVersion ?? null,
    semanticVersion: TRANSACTION_RELEASE_SEMANTIC_VERSION, rowGenerationDigest,
    enforcement,
    currentSchemaValid,
    legacyTransactionIds: Object.freeze(legacy),
    recoverableTransactionIds: Object.freeze(recoverable)});
}

const IN_FLIGHT_UNDECIDED_FROZEN_STATUSES = Object.freeze([
  TRANSACTION_STATUS.ACTIVE,
  TRANSACTION_STATUS.PREPARING,
  TRANSACTION_STATUS.PREPARED,
]);
const VALID_COMMIT_DECIDED_STATUSES = Object.freeze(new Set([
  TRANSACTION_STATUS.PREPARED,
  TRANSACTION_STATUS.COMMITTING,
  TRANSACTION_STATUS.COMMITTED,
]));
const VALID_ROLLBACK_DECIDED_STATUSES = Object.freeze(new Set([
  TRANSACTION_STATUS.ACTIVE,
  TRANSACTION_STATUS.PREPARING,
  TRANSACTION_STATUS.PREPARED,
  TRANSACTION_STATUS.ROLLING_BACK,
  TRANSACTION_STATUS.ROLLED_BACK,
  TRANSACTION_STATUS.FAILED,
]));

function isConsistentDecidedStatus(status, decision) {
  return decision === DECISION.COMMIT ?
    VALID_COMMIT_DECIDED_STATUSES.has(status) :
    decision === DECISION.ROLLBACK && VALID_ROLLBACK_DECIDED_STATUSES.has(status);
}

function isPostOriginFrozenUndecidedRow(row, pairs) {
  return row?.participant_set_state === PARTICIPANT_SET_STATE.FROZEN &&
    row?.commit_mode === COMMIT_MODE.TWO_PHASE_COMMIT &&
    Array.isArray(pairs) &&
    row?.frozen_participant_count === pairs.length &&
    IN_FLIGHT_UNDECIDED_FROZEN_STATUSES.includes(row?.status);
}

function isPostOriginOpenUndecidedRow(row, postOriginEnforced, record, pairs) {
  if (!postOriginEnforced || record?.state !== RECORDED_DECISION_STATE.ABSENT) {
    return false;
  }
  if (row?.status === TRANSACTION_STATUS.ACTIVE &&
      row?.participant_set_state === PARTICIPANT_SET_STATE.OPEN &&
      row?.commit_mode === COMMIT_MODE.NOT_SELECTED &&
      row?.frozen_participant_count === 0) {
    return true;
  }
  return isPostOriginFrozenUndecidedRow(row, pairs);
}

function hasValidCensusDecision(row, record, pairs) {
  if (record.state === RECORDED_DECISION_STATE.INVALID) return false;
  if (record.state === RECORDED_DECISION_STATE.ABSENT) return true;
  return Boolean(
    row?.participant_set_state === PARTICIPANT_SET_STATE.FROZEN &&
    pairs &&
    record.participants.length === pairs.length &&
    record.participants.every(([id], index) => id === pairs[index][0]),
  );
}

function isValidCurrentSchemaTransactionRow(row, pairs, record) {
  if (!row || typeof row.transaction_id !== 'string' || row.transaction_id.length === 0 ||
      typeof row.session_id !== 'string' || row.session_id.length === 0 ||
      !isCanonicalTransactionEpoch(row.transaction_epoch) ||
      !Number.isFinite(row.timeout_deadline) || row.timeout_deadline < 0 ||
      !Object.values(TRANSACTION_MODE).includes(row.transaction_mode) ||
      !Array.isArray(pairs) || !hasValidCensusDecision(row, record, pairs)) {
    return false;
  }
  if (row.participant_set_state === PARTICIPANT_SET_STATE.OPEN) {
    return row.status === TRANSACTION_STATUS.ACTIVE &&
      row.commit_mode === COMMIT_MODE.NOT_SELECTED &&
      row.frozen_participant_count === 0 &&
      record.state === RECORDED_DECISION_STATE.ABSENT;
  }
  if (row.participant_set_state !== PARTICIPANT_SET_STATE.FROZEN ||
      row.commit_mode !== COMMIT_MODE.TWO_PHASE_COMMIT ||
      row.frozen_participant_count !== pairs.length) {
    return false;
  }
  if (record.state === RECORDED_DECISION_STATE.ABSENT) {
    return IN_FLIGHT_UNDECIDED_FROZEN_STATUSES.includes(row.status);
  }
  return isConsistentDecidedStatus(row.status, record.decision);
}

function readTransactionReleaseCensus(database) {
  try {
    const {enforcement, byName} = readTransactionSchemaInventory(database);
    if (![TRANSACTION_SCHEMA_ENFORCEMENT_STATE.ENFORCED,
      TRANSACTION_SCHEMA_ENFORCEMENT_STATE.REQUIRED].includes(enforcement.state)) {
      return censusResult(TRANSACTION_RELEASE_CENSUS_STATE.UNAVAILABLE, null, [], [], enforcement);
    }
    const postOriginEnforced =
      enforcement.state === TRANSACTION_SCHEMA_ENFORCEMENT_STATE.ENFORCED &&
      readPartitionWriteOrigin(database) !== null;
    if (!REQUIRED_COLUMNS.every((name) => byName.has(name))) {
      return censusResult(TRANSACTION_RELEASE_CENSUS_STATE.UNAVAILABLE, null, [], [], enforcement);
    }
    const allRows = database.prepare(CENSUS_ROWS_SQL).all();
    const canonicalRows = allRows.map((row) => Object.fromEntries(
      Object.keys(row).sort().map((key) => [key, row[key]])));
    const digest = createHash('sha256').update(JSON.stringify(canonicalRows)).digest('hex');
    const legacy = [];
    const recoverable = [];
    let held = false;
    let allCurrentSchemaValid = true;
    for (const row of allRows) {
      const pairs = readParticipantSet(row.transaction_id, row.participant_set_text);
      const record = decisionRecordOfRow(row, row.transaction_id);
      const rowCurrentValid = isValidCurrentSchemaTransactionRow(row, pairs, record);
      if (!rowCurrentValid) {
        allCurrentSchemaValid = false;
      }
      if (!pairs || !hasValidCensusDecision(row, record, pairs)) {
        legacy.push(row.transaction_id);
        held = true;
      } else if (!rowCurrentValid ||
          !isPostOriginOpenUndecidedRow(row, postOriginEnforced, record, pairs)) {
        recoverable.push(row.transaction_id);
        held = true;
      }
    }
    return censusResult(
      held ? TRANSACTION_RELEASE_CENSUS_STATE.HELD : TRANSACTION_RELEASE_CENSUS_STATE.CLEAR,
      digest,
      legacy,
      recoverable,
      enforcement,
      allCurrentSchemaValid,
    );
  } catch {
    // A missing schema/read is unavailable, never the empty census.
    return censusResult(TRANSACTION_RELEASE_CENSUS_STATE.UNAVAILABLE);
  }
}

export {readTransactionReleaseCensus, TRANSACTION_RELEASE_CENSUS_STATE,
  TRANSACTION_RELEASE_TERMINAL_STATUS};
