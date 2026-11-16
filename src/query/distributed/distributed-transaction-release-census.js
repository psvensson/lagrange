/** Read-only input to the release owner's fresh drain invocation. Historical
 * terminal status is never discharge proof. This helper certifies no drain. */
import {createHash} from 'node:crypto';
import {COMMIT_MODE, PARTICIPANT_SET_STATE} from
  '../../constants/transactions.js';
import {readParticipantSet} from './distributed-transaction-participant-manifest.js';
import {decisionRecordOfRow, RECORDED_DECISION_STATE} from './distributed-transaction-decision-record.js';
import {readTransactionSchemaEnforcement, TRANSACTION_SCHEMA_ENFORCEMENT_STATE} from
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
  EMPTY_LEGACY_SCHEMA: 'empty_legacy_schema',
});
const REQUIRED_COLUMNS = Object.freeze(['transaction_id', 'session_id', 'transaction_epoch',
  'participant_set_text', 'participant_set_state', 'decision', 'decision_text', 'decision_digest']);
const CENSUS_SCHEMA_SQL = 'PRAGMA table_info(sql_transactions)';
const CENSUS_ROWS_SQL = 'SELECT * FROM sql_transactions ORDER BY transaction_id';

function censusResult(state, rowGenerationDigest = null, legacy = [], recoverable = [],
  enforcement = null) {
  return Object.freeze({state, schemaVersion: enforcement?.schemaVersion ?? null,
    semanticVersion: TRANSACTION_RELEASE_SEMANTIC_VERSION, rowGenerationDigest,
    enforcement,
    legacyTransactionIds: Object.freeze(legacy),
    recoverableTransactionIds: Object.freeze(recoverable)});
}

function isPostOriginOpenUndecidedRow(row, postOriginEnforced, record) {
  return postOriginEnforced &&
    row?.status === TRANSACTION_STATUS.ACTIVE &&
    row?.participant_set_state === PARTICIPANT_SET_STATE.OPEN &&
    row?.commit_mode === COMMIT_MODE.NOT_SELECTED &&
    row?.frozen_participant_count === 0 &&
    record?.state === RECORDED_DECISION_STATE.ABSENT;
}

function readTransactionReleaseCensus(database) {
  try {
    const enforcement = readTransactionSchemaEnforcement(database);
    if (![TRANSACTION_SCHEMA_ENFORCEMENT_STATE.ENFORCED,
      TRANSACTION_SCHEMA_ENFORCEMENT_STATE.REQUIRED].includes(enforcement.state)) {
      return censusResult(TRANSACTION_RELEASE_CENSUS_STATE.UNAVAILABLE, null, [], [], enforcement);
    }
    const postOriginEnforced =
      enforcement.state === TRANSACTION_SCHEMA_ENFORCEMENT_STATE.ENFORCED &&
      readPartitionWriteOrigin(database) !== null;
    const columns = new Set(database.prepare(CENSUS_SCHEMA_SQL).all().map((row) => row.name));
    const allRows = database.prepare(CENSUS_ROWS_SQL).all();
    const canonicalRows = allRows.map((row) => Object.fromEntries(
      Object.keys(row).sort().map((key) => [key, row[key]])));
    const digest = createHash('sha256').update(JSON.stringify(canonicalRows)).digest('hex');
    if (!REQUIRED_COLUMNS.every((name) => columns.has(name))) {
      return censusResult(allRows.length === 0 ?
        TRANSACTION_RELEASE_CENSUS_STATE.EMPTY_LEGACY_SCHEMA :
        TRANSACTION_RELEASE_CENSUS_STATE.HELD, digest,
      allRows.map((row) => row.transaction_id), [], enforcement);
    }
    const legacy = [];
    const recoverable = [];
    let held = false;
    for (const row of allRows) {
      const pairs = readParticipantSet(row.transaction_id, row.participant_set_text);
      const record = decisionRecordOfRow(row, row.transaction_id);
      const validDecision = record.state !== RECORDED_DECISION_STATE.INVALID &&
        (record.state === RECORDED_DECISION_STATE.ABSENT ||
          (pairs && record.participants.length === pairs.length &&
            record.participants.every(([id], index) => id === pairs[index][0])));
      if (!pairs || !validDecision) {
        legacy.push(row.transaction_id);
        held = true;
      } else if (!isPostOriginOpenUndecidedRow(row, postOriginEnforced, record)) {
        recoverable.push(row.transaction_id);
        held = true;
      }
    }
    return censusResult(held ? TRANSACTION_RELEASE_CENSUS_STATE.HELD :
      TRANSACTION_RELEASE_CENSUS_STATE.CLEAR, digest, legacy, recoverable, enforcement);
  } catch {
    // A missing schema/read is unavailable, never the empty census.
    return censusResult(TRANSACTION_RELEASE_CENSUS_STATE.UNAVAILABLE);
  }
}

export {readTransactionReleaseCensus, TRANSACTION_RELEASE_CENSUS_STATE,
  TRANSACTION_RELEASE_TERMINAL_STATUS};
