// The vocabulary of the participant transaction owner (TX1 design revision
// 10, sections 2.3, 2.4, 4 and 5, and 0.0.13; quest replicated-transaction-
// decision-and-apply): its three committed commands, the states of its durable
// row and the causes a row is refused with, its typed answers, the pinned byte
// form of its digests and entryIds, its two tables and their SQL, and its
// log. A leaf: the partition constants owner lists these command types among
// the types it recognises.

// The three committed commands. PARTICIPANT_PREPARE carries the staged
// operations and the conflict evidence; PARTICIPANT_DECISION carries the
// decision bound to the coordinator's decision record, never operations
// (design 2.3); PARTICIPANT_GENERATION_ORIGIN is proposed once, when
// transaction admission is enabled on the partition, and pins where the write
// generation g starts in the log (design 0.0.13).
const PARTICIPANT_TRANSACTION_COMMAND = Object.freeze({
  PREPARE: 'PARTICIPANT_PREPARE',
  DECISION: 'PARTICIPANT_DECISION',
  GENERATION_ORIGIN: 'PARTICIPANT_GENERATION_ORIGIN',
});
const PARTICIPANT_TRANSACTION_COMMAND_TYPES = Object.freeze(
  Object.values(PARTICIPANT_TRANSACTION_COMMAND));

// What a decision decides (design 2.4).
const PARTICIPANT_TRANSACTION_DECISION = Object.freeze({
  COMMIT: 'COMMIT',
  ROLLBACK: 'ROLLBACK',
});

// A participant transaction's state (design 4 and 5.1). The durable row holds
// one of the first four; a TOMBSTONE is a ROLLED_BACK row that was never
// prepared (a bound ROLLBACK applied before any PREPARE). ABSENT, ACTIVE and
// PREPARING are named by answers only: no row, a staging session on this
// leader, a PREPARE this leader proposed and has not yet answered.
const PARTICIPANT_TRANSACTION_STATE = Object.freeze({
  PREPARED: 'PREPARED',
  COMMITTED: 'COMMITTED',
  ROLLED_BACK: 'ROLLED_BACK',
  REFUSED: 'REFUSED',
  ABSENT: 'ABSENT',
  ACTIVE: 'ACTIVE',
  PREPARING: 'PREPARING',
});

// Why a durable row is REFUSED (design 2.3 steps 3, 6 and 7; 3.2; 6.2;
// 0.0.13): a carried digest that is not the digest of the carried bytes, a
// write generation that moved since the transaction's base, a deterministic
// statement failure or the rowid ceiling in the PREPARE dry run, and - on
// consistent replicas unreachable, an alarm when met - conflict evidence read
// against another generation origin than this replica's, and a moved
// generation or a statement failure while the COMMIT applies.
const PARTICIPANT_TRANSACTION_REFUSAL_CAUSE = Object.freeze({
  DIGEST_INVALID: 'digest_invalid',
  ORIGIN_MISMATCH: 'origin_mismatch',
  CONFLICT: 'conflict',
  STATEMENT_FAILED: 'statement_failed',
  ROWID_CEILING: 'rowid_ceiling',
  COMMIT_BASE_MOVED: 'commit_base_moved',
  COMMIT_STATEMENT_FAILED: 'commit_statement_failed',
});

// The participant's typed answers (design 4: participant_transaction_*). A
// request refused with one of them proposed nothing; a committed command
// answered with one of them was consumed without a write unless its answer
// names a REFUSED row.
const PARTICIPANT_TRANSACTION_FAILURE_CODE = Object.freeze({
  IDENTITY_REQUIRED: 'participant_transaction_identity_required',
  IDENTITY_MISMATCH: 'participant_transaction_identity_mismatch',
  ALREADY_ACTIVE: 'participant_transaction_already_active',
  NOT_ACTIVE: 'participant_transaction_not_active',
  PREPARING: 'participant_transaction_preparing',
  SEALED: 'participant_transaction_sealed',
  TERMINAL: 'participant_transaction_terminal',
  PREPARE_REFUSED: 'participant_transaction_prepare_refused',
  PREPARE_CONTENT_CONFLICT: 'participant_transaction_prepare_content_conflict',
  RESERVED: 'participant_transaction_reserved',
  NOT_PREPARED: 'participant_transaction_not_prepared',
  COMMIT_REFUSED: 'participant_transaction_commit_refused',
  DECISION_BINDING_REQUIRED:
    'participant_transaction_decision_binding_required',
  DECISION_DIGEST_MISMATCH: 'participant_transaction_decision_digest_mismatch',
  DECISION_CONFLICT: 'participant_transaction_decision_conflict',
  SESSION_WRITE_PARAM_UNSUPPORTED:
    'participant_transaction_session_write_param_unsupported',
  GENERATION_ORIGIN_PENDING:
    'participant_transaction_generation_origin_pending',
});

// The admission owner's refusals of a participant transaction command before
// it is proposed: one that does not come from the transaction owner, and one
// whose bytes are not the pinned form (partition-committed-command-
// admission.js asks partition-participant-transaction-bytes.js).
const PARTICIPANT_TRANSACTION_ADMISSION_CODE = Object.freeze({
  ORIGIN_REFUSED: 'partition_write_transaction_command_not_admissible',
  BYTES_INVALID: 'partition_write_transaction_command_invalid',
});

// The pinned byte form (design 2.3, 0.0.13). preparedDigest is the sha256
// (hex) of operationsText, LF, validationText; validationText is
// JSON.stringify([[scope, partitionId, sha256("generation:" + g), origin]])
// for the BEGIN-time write generation g and the log index of the partition's
// generation origin; decisionDigest is the sha256 of decisionText. The
// entryIds are deterministic: <participantId>:prepare,
// <participantId>:decision:<decisionDigest> and
// <partitionId>:generation-origin; participantId is
// <transactionId>:<partitionId>; an operation's outcome key is
// txop:<participantId>:<ordinal>, its 0-based position in operationsText.
const PARTICIPANT_TRANSACTION_BYTES = Object.freeze({
  DIGEST_ALGORITHM: 'sha256',
  DIGEST_ENCODING: 'hex',
  PREPARED_DIGEST_SEPARATOR: '\n',
  GENERATION_DIGEST_PREFIX: 'generation:',
  VALIDATION_SCOPE: 'partition',
  IDENTITY_SEPARATOR: ':',
  PREPARE_ENTRY_SUFFIX: 'prepare',
  DECISION_ENTRY_SUFFIX: 'decision',
  GENERATION_ORIGIN_ENTRY_SUFFIX: 'generation-origin',
  OPERATION_OUTCOME_PREFIX: 'txop',
});

// The two tables (design 5.1, 0.0.13), written only inside the application
// transaction of a committed command: one row per transaction per
// participant, and the partition's write generation g, a single row created
// as (1, 0) with no origin when the partition opens and never deleted. The
// generation origin command sets it to (1, 0) and records the origin's log
// position (index, term), once: from that entry on g is a function of the
// committed prefix on every replica, whatever build counted writes before
// it. g advances by one, with the data, for every applied committed SQL
// statement and for a COMMIT decision that applies at least one operation;
// control rows never move it (design 3.2). Both are application state,
// carried by any image of the partition's database taken at an applied index
// (design 8.2). The old `_transaction_outcomes` table stays until the
// cutover's drain (the L6 window): sessionId-only legacy requests keep
// reading it.
const PARTICIPANT_TRANSACTION_SQL = Object.freeze({
  CREATE_TABLE: `
      CREATE TABLE IF NOT EXISTS _participant_transactions (
        transaction_id TEXT NOT NULL,
        participant_id TEXT NOT NULL,
        session_id TEXT,
        commit_mode TEXT NOT NULL,
        transaction_epoch INTEGER NOT NULL,
        state TEXT NOT NULL,
        operations_text TEXT,
        validation_text TEXT,
        prepared_digest TEXT,
        prepare_entry_id TEXT,
        prepare_index INTEGER,
        prepare_term INTEGER,
        decision TEXT,
        decision_digest TEXT,
        decision_entry_id TEXT,
        decision_index INTEGER,
        decision_term INTEGER,
        refusal_cause TEXT,
        refusal_detail TEXT,
        PRIMARY KEY (transaction_id, participant_id)
      )
    `,
  CREATE_STATE_INDEX:
    'CREATE INDEX IF NOT EXISTS _participant_transactions_state ' +
    'ON _participant_transactions (state)',
  CREATE_GENERATION_TABLE: `
      CREATE TABLE IF NOT EXISTS _partition_write_generation (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        generation INTEGER NOT NULL,
        origin_index INTEGER,
        origin_term INTEGER
      )
    `,
  INSERT_INITIAL_GENERATION:
    'INSERT OR IGNORE INTO _partition_write_generation ' +
    '(singleton, generation) VALUES (1, 0)',
  SELECT_GENERATION:
    'SELECT generation, origin_index, origin_term ' +
    'FROM _partition_write_generation WHERE singleton = 1',
  // The origin is recorded once: a later origin command changes nothing.
  RECORD_ORIGIN:
    'UPDATE _partition_write_generation SET generation = 0, ' +
    'origin_index = ?, origin_term = ? ' +
    'WHERE singleton = 1 AND origin_index IS NULL',
  ADVANCE_GENERATION:
    'UPDATE _partition_write_generation SET generation = generation + 1 ' +
    'WHERE singleton = 1',
  SELECT_ROW:
    'SELECT transaction_id, participant_id, session_id, commit_mode, ' +
    'transaction_epoch, state, operations_text, validation_text, ' +
    'prepared_digest, prepare_entry_id, prepare_index, prepare_term, ' +
    'decision, decision_digest, decision_entry_id, decision_index, ' +
    'decision_term, refusal_cause, refusal_detail ' +
    'FROM _participant_transactions ' +
    'WHERE transaction_id = ? AND participant_id = ?',
  SELECT_RESERVATION:
    'SELECT 1 AS reserved FROM _participant_transactions WHERE state = ? ' +
    'LIMIT 1',
  INSERT_ROW:
    'INSERT INTO _participant_transactions (transaction_id, participant_id, ' +
    'session_id, commit_mode, transaction_epoch, state, operations_text, ' +
    'validation_text, prepared_digest, prepare_entry_id, prepare_index, ' +
    'prepare_term, decision, decision_digest, decision_entry_id, ' +
    'decision_index, decision_term, refusal_cause, refusal_detail) ' +
    'VALUES (@transactionId, @participantId, @sessionId, @commitMode, ' +
    '@transactionEpoch, @state, @operationsText, @validationText, ' +
    '@preparedDigest, @prepareEntryId, @prepareIndex, @prepareTerm, ' +
    '@decision, @decisionDigest, @decisionEntryId, @decisionIndex, ' +
    '@decisionTerm, @refusalCause, @refusalDetail)',
  // The only transition of an existing row: from PREPARED, exactly once.
  UPDATE_DECIDED:
    'UPDATE _participant_transactions SET state = @state, ' +
    'decision = @decision, decision_digest = @decisionDigest, ' +
    'decision_entry_id = @decisionEntryId, decision_index = @decisionIndex, ' +
    'decision_term = @decisionTerm, refusal_cause = @refusalCause, ' +
    'refusal_detail = @refusalDetail WHERE transaction_id = @transactionId ' +
    'AND participant_id = @participantId AND state = @fromState',
});

// What the store owner throws when an invariant of its two tables fails: a
// host failure, never a consumed entry.
const PARTICIPANT_TRANSACTION_STORE_ERROR = Object.freeze({
  GENERATION_ROW_MISSING:
    'Partition write generation row is missing; the partition schema is ' +
    'incomplete',
  DECIDED_UPDATE_NOT_ONE_ROW:
    'Participant transaction row did not move from PREPARED exactly once',
  ORIGIN_UPDATE_NOT_ONE_ROW:
    'Partition write generation origin was not recorded exactly once',
});

// The texts beside the typed answers (the code is the decision; R07).
const PARTICIPANT_TRANSACTION_MESSAGE = Object.freeze({
  REFUSED: 'Participant transaction request refused',
  COMMAND_REFUSED: 'Participant transaction command refused at apply',
  BYTES_INVALID: 'Participant transaction command refused before it was ' +
    'proposed: its bytes are not the pinned form',
  ORIGIN_REFUSED: 'Participant transaction command refused before it was ' +
    'proposed: it enters consensus only from the transaction owner',
  WRITE_RESERVED_DETAIL: 'a prepared participant transaction reserves the ' +
    'partition until its decision applies',
  OPERATIONS_UNREADABLE: 'the carried operations text is not a JSON array ' +
    'of {entryId, sql, params}',
  CODE_SEPARATOR: ': ',
});

const PARTICIPANT_TRANSACTION_LOG_MSG = Object.freeze({
  COMMAND_REFUSED: 'Participant transaction command consumed with a typed ' +
    'refusal',
  ROW_REFUSED: 'Participant transaction PREPARE refused durably',
  ATOMICITY_ALARM: 'Participant transaction decision met a state consistent ' +
    'replicas never reach (atomicity alarm)',
  WRITE_RESERVED: 'Committed write met a prepared participant transaction: ' +
    'consumed without effect, its entry key left unsettled',
  CDC_EVENT_FAILED: 'Participant transaction operation CDC event failed',
  ORIGIN_RECORDED: 'Partition write generation origin recorded',
  ORIGIN_MISMATCH: 'Participant transaction PREPARE carries another ' +
    'generation origin than this replica\'s (alarm)',
});

export {
  PARTICIPANT_TRANSACTION_ADMISSION_CODE,
  PARTICIPANT_TRANSACTION_BYTES,
  PARTICIPANT_TRANSACTION_COMMAND,
  PARTICIPANT_TRANSACTION_COMMAND_TYPES,
  PARTICIPANT_TRANSACTION_DECISION,
  PARTICIPANT_TRANSACTION_FAILURE_CODE,
  PARTICIPANT_TRANSACTION_LOG_MSG,
  PARTICIPANT_TRANSACTION_MESSAGE,
  PARTICIPANT_TRANSACTION_REFUSAL_CAUSE,
  PARTICIPANT_TRANSACTION_SQL,
  PARTICIPANT_TRANSACTION_STATE,
  PARTICIPANT_TRANSACTION_STORE_ERROR,
};
