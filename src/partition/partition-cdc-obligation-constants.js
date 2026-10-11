// The vocabulary of the durable CDC obligation (TX1 design revision 10,
// section 8.3; quest replicated-transaction-decision-and-apply,
// receipt 8): the ledger table every replica writes inside the application
// transaction of a committed participant decision, the committed command that
// marks acknowledged obligations delivered, the bounds the CDC delivery owner
// batches acknowledgements under, its typed outcomes and its log. A leaf: the
// partition constants owner lists the command type among the types the
// application recognises, and the admission owner asks the ledger owner
// whether a command is in its pinned form.

import {NUM} from '../constants/numbers.js';
import {TIME_MS} from '../constants/time.js';

// The one committed command of this owner: CDC_DELIVERED marks the obligations
// it names delivered, on every replica alike, inside its own application
// transaction. It carries no data change: it never moves the write generation
// g, never runs a statement and is never parked by a reservation.
const PARTITION_CDC_COMMAND = Object.freeze({
  DELIVERED: 'CDC_DELIVERED',
});
const PARTITION_CDC_COMMAND_TYPES = Object.freeze(
  Object.values(PARTITION_CDC_COMMAND));

// Who may propose a CDC_DELIVERED command: only the CDC delivery owner, after
// every current subscriber acknowledged each event it names. The admission
// owner compares the proposer's origin with this value.
const PARTITION_CDC_OBLIGATION_ORIGIN = Object.freeze({
  CDC_DELIVERY_OWNER: 'cdc-delivery-owner',
});

// The pinned byte form of a CDC_DELIVERED command: its entryId is
// cdc-ack:<partitionId>:<sha256 hex of the acknowledged groups' JSON>. Groups
// are sorted by log index and contain strictly increasing ordinals plus a
// fixed-size digest of each durable event key. The positional identity bounds
// command bytes independently of caller-controlled transaction identifiers;
// the digest prevents a wrong position from acknowledging a different row.
const PARTITION_CDC_OBLIGATION_BYTES = Object.freeze({
  DIGEST_ALGORITHM: 'sha256',
  DIGEST_ENCODING: 'hex',
  ENTRY_PREFIX: 'cdc-ack',
  IDENTITY_SEPARATOR: ':',
});

// The bounds the CDC delivery owner batches acknowledgements under (owner
// ruling 2026-10-11: grouped by committed entry, bounded count and bytes, a
// flush deadline; this owner chooses the values):
// - ACK_BATCH_MAX_EVENTS: one batch names at most this many events. A committed
//   entry may be split across batches when the count or encoded-byte bound is
//   reached; log index plus ordinal order makes that split deterministic.
// - ACK_BATCH_MAX_BYTES: the UTF-8 JSON bytes of a batch's acknowledged groups
//   are at most this many. A CDC_DELIVERED command is a replicated log entry,
//   so acknowledged identity must remain bounded independently of event count.
// - ACK_FLUSH_DEADLINE_MS: a batch that reached neither bound is proposed this
//   long after its first acknowledgement, so sparse traffic progresses with at
//   most one acknowledgement entry per second per partition, and the events a
//   crash can make the consumer see twice are those acknowledged within the
//   last second (at most ACK_BATCH_MAX_EVENTS of them).
// - DRIVE_PAGE_ROWS: how many owed rows one read of the ledger returns; the
//   driver pages in log order until the ledger is drained.
const PARTITION_CDC_OBLIGATION_BOUND = Object.freeze({
  ACK_BATCH_MAX_EVENTS: NUM.TWO_HUNDRED_FIFTY_SIX,
  ACK_MAX_OUTSTANDING_BATCHES: NUM.TWO,
  ACK_BATCH_MAX_BYTES: NUM.SIXTY_FOUR * NUM.BYTES_PER_KIB,
  // ends-on: the pending acknowledgements are proposed as one CDC_DELIVERED
  // committed command
  ACK_FLUSH_DEADLINE_MS: TIME_MS.SECOND,
  DRIVE_PAGE_ROWS: NUM.TWO_HUNDRED_FIFTY_SIX,
});

// The ledger (design 8.3, points 1 to 6): one row per CDC event a committed
// participant decision owes, written in the SAME SQLite transaction as the
// rows, the per-operation outcomes, the row's move to COMMITTED and the
// rs-raft applied state, so it is replicated state-machine state: every
// replica holds the same rows for the same entry, a restart keeps them, and a
// rolled-back apply leaves none. The event's own payload is stored as of its
// commit (no later row version is ever read as an old event); the delivered
// flag is set only by a committed CDC_DELIVERED command, so delivery progress
// is the same on every replica and survives a leader change. An obligation is
// owed until its flag is committed. Owed-row snapshot retention and delivered-
// row reclamation remain obligations of the existing retention owner; this
// ledger does not claim a compaction policy of its own.
const PARTITION_CDC_OBLIGATION_TABLE = '_cdc_obligations';
const PARTITION_CDC_OBLIGATION_SQL = Object.freeze({
  CREATE_TABLE: `
      CREATE TABLE IF NOT EXISTS ${PARTITION_CDC_OBLIGATION_TABLE} (
        event_key TEXT PRIMARY KEY,
        log_index INTEGER NOT NULL,
        term INTEGER NOT NULL,
        ordinal INTEGER NOT NULL,
        entry_id TEXT NOT NULL,
        event_json TEXT NOT NULL,
        delivered INTEGER NOT NULL DEFAULT 0,
        delivered_index INTEGER,
        delivered_term INTEGER,
        UNIQUE (log_index, ordinal)
      )
    `,
  CREATE_OWED_INDEX:
    `CREATE INDEX IF NOT EXISTS ${PARTITION_CDC_OBLIGATION_TABLE}_owed ` +
    `ON ${PARTITION_CDC_OBLIGATION_TABLE} (delivered, log_index, ordinal)`,
  TABLE_EXISTS:
    'SELECT 1 AS present FROM sqlite_master WHERE type = \'table\' ' +
    `AND name = '${PARTITION_CDC_OBLIGATION_TABLE}'`,
  INSERT:
    `INSERT INTO ${PARTITION_CDC_OBLIGATION_TABLE} ` +
    '(event_key, log_index, term, ordinal, entry_id, event_json, delivered) ' +
    'VALUES (@eventKey, @logIndex, @term, @ordinal, @entryId, @eventJson, 0)',
  // The owed rows after a position, in log order (the redelivery order).
  SELECT_OWED_AFTER:
    'SELECT event_key, log_index, term, ordinal, entry_id, event_json ' +
    `FROM ${PARTITION_CDC_OBLIGATION_TABLE} WHERE delivered = 0 ` +
    'AND (log_index > @logIndex OR (log_index = @logIndex AND ordinal > @ordinal)) ' +
    'AND (log_index < @throughIndex OR ' +
    '(log_index = @throughIndex AND ordinal <= @throughOrdinal)) ' +
    'ORDER BY log_index, ordinal LIMIT @limit',
  SELECT_OWED_TAIL:
    'SELECT log_index, ordinal ' +
    `FROM ${PARTITION_CDC_OBLIGATION_TABLE} WHERE delivered = 0 ` +
    'ORDER BY log_index DESC, ordinal DESC LIMIT 1',
  SELECT_BY_KEY:
    'SELECT event_key, log_index, term, ordinal, entry_id, event_json, ' +
    'delivered, delivered_index, delivered_term ' +
    `FROM ${PARTITION_CDC_OBLIGATION_TABLE} WHERE event_key = ?`,
  SELECT_BY_POSITION:
    'SELECT event_key, log_index, term, ordinal, entry_id, event_json, ' +
    'delivered, delivered_index, delivered_term ' +
    `FROM ${PARTITION_CDC_OBLIGATION_TABLE} WHERE log_index = ? AND ordinal = ?`,
  // The flag moves once: a delivered row is never marked again.
  MARK_DELIVERED:
    `UPDATE ${PARTITION_CDC_OBLIGATION_TABLE} SET delivered = 1, ` +
    'delivered_index = @index, delivered_term = @term ' +
    'WHERE event_key = @eventKey AND delivered = 0',
  COUNT_BY_FLAG:
    'SELECT delivered, COUNT(*) AS count ' +
    `FROM ${PARTITION_CDC_OBLIGATION_TABLE} GROUP BY delivered`,
});

// The identity a delivered event carries alongside the consumer's
// de-duplication identity (design 8.3, point 7): its event key
// (txop:<participantId>:<ordinal>, the operation's outcome key), the
// committed entry that owes it (entryId, logIndex) and its ordinal in that
// entry. A redelivered event carries the same four values.
const PARTITION_CDC_OBLIGATION_EVENT_FIELD = Object.freeze({
  EVENT_KEY: 'eventKey',
  ENTRY_ID: 'entryId',
  LOG_INDEX: 'logIndex',
  ORDINAL: 'ordinal',
});

// The typed answers of this owner. The first two are the admission owner's
// refusals before a CDC_DELIVERED command is proposed; the next three are
// what its application answers when it is consumed without a write (a
// command naming another partition, an event the ledger never recorded, or an
// event filed under another entry than the one that owes it: each a bug path,
// refused alike on every replica and raised as an alarm); the last two are
// the delivery owner's flush outcomes when no proposer is composed or the
// batch was proposed by a replica that no longer leads.
const PARTITION_CDC_OBLIGATION_FAILURE_CODE = Object.freeze({
  ORIGIN_REFUSED: 'partition_write_cdc_command_not_admissible',
  BYTES_INVALID: 'partition_write_cdc_command_invalid',
  IDENTITY_MISMATCH: 'cdc_acknowledgement_identity_mismatch',
  UNKNOWN_EVENT: 'cdc_acknowledgement_unknown_event',
  ENTRY_MISMATCH: 'cdc_acknowledgement_entry_mismatch',
  POSITION_MISMATCH: 'cdc_acknowledgement_position_mismatch',
  PROPOSER_UNAVAILABLE: 'cdc_acknowledgement_proposer_unavailable',
  NOT_LEADER: 'cdc_acknowledgement_not_leader',
  LEDGER_READ_UNAVAILABLE: 'cdc_obligation_ledger_read_unavailable',
  LEDGER_EVIDENCE_INVALID: 'cdc_obligation_ledger_evidence_invalid',
});

const PARTITION_CDC_OBLIGATION_MESSAGE = Object.freeze({
  ORIGIN_REFUSED:
    'Partition write refused before it was proposed: a CDC_DELIVERED command ' +
    'enters consensus only from the CDC delivery owner',
  BYTES_INVALID:
    'Partition write refused before it was proposed: the CDC_DELIVERED ' +
    'command is not in its pinned form (sorted positional members and key ' +
    'digests under its deterministic entryId, within the batch bounds)',
  COMMAND_REFUSED: 'CDC acknowledgement refused',
  MARK_NOT_ONE_ROW:
    'CDC obligation ledger: marking an owed event delivered moved no row',
  CODE_SEPARATOR: ': ',
});

// What one drive of the owed obligations ended as (R07: a named state).
const PARTITION_CDC_OBLIGATION_DRIVE_STATE = Object.freeze({
  NOT_LEADER: 'not_leader',
  SHUTDOWN: 'shutdown',
  JOINED_IN_FLIGHT: 'joined_in_flight',
  NO_SUBSCRIBERS: 'no_subscribers',
  NO_LEDGER: 'no_ledger',
  DRAINED: 'drained',
  PAGE_YIELDED: 'page_yielded',
  PROVISIONAL: 'provisional',
  HELD_BY_SUBSCRIBER: 'held_by_subscriber',
  LEDGER_READ_RETRY: 'ledger_read_retry',
  LEDGER_EVIDENCE_HELD: 'ledger_evidence_held',
  ACKNOWLEDGEMENT_BACKPRESSURE: 'acknowledgement_backpressure',
});

// What one flush of the acknowledgement batch ended as.
const PARTITION_CDC_OBLIGATION_FLUSH_STATE = Object.freeze({
  EMPTY: 'empty',
  IN_FLIGHT: 'in_flight',
  BACKPRESSURE: 'backpressure',
  COMMITTED: 'committed',
  REFUSED: 'refused',
  OUTCOME_UNKNOWN: 'outcome_unknown',
  PROPOSER_UNAVAILABLE: 'proposer_unavailable',
  NOT_LEADER: 'not_leader',
  SHUTDOWN: 'shutdown',
});

// Why a drive or a flush ran.
const PARTITION_CDC_OBLIGATION_REASON = Object.freeze({
  COMMITTED_ENTRY: 'committed_entry',
  LEADER_ELECTED: 'leader_elected',
  SUBSCRIPTION_HANDSHAKE: 'subscription_handshake',
  DELIVERY_RETRY: 'delivery_retry',
  AFTER_FLUSH: 'after_flush',
  BATCH_EVENTS_BOUND: 'batch_events_bound',
  BATCH_BYTES_BOUND: 'batch_bytes_bound',
  FLUSH_DEADLINE: 'flush_deadline',
});

const PARTITION_CDC_OBLIGATION_LOG_MSG = Object.freeze({
  RECORDED: 'CDC obligations recorded with the committed decision',
  DELIVERY_HELD: 'CDC obligation delivery held by a subscriber; retry scheduled',
  LEDGER_READ_RETRY:
    'CDC obligation ledger read unavailable; retry scheduled',
  LEDGER_EVIDENCE_HELD:
    'CDC obligation ledger evidence invalid; delivery held',
  DRIVE_FAILED: 'CDC obligation drive failed',
  ACKNOWLEDGEMENTS_PROPOSED: 'CDC acknowledgement batch proposed',
  ACKNOWLEDGEMENTS_REFUSED: 'CDC acknowledgement batch refused',
  ACKNOWLEDGEMENTS_OUTCOME_UNKNOWN:
    'CDC acknowledgement batch outcome unknown; kept until the ledger decides',
  ACKNOWLEDGEMENTS_DROPPED_NOT_LEADER:
    'CDC acknowledgement batch dropped: this replica no longer leads',
  PROPOSER_UNAVAILABLE:
    'CDC acknowledgement batch held: no acknowledgement proposer is composed',
  ACKNOWLEDGEMENT_APPLIED: 'CDC_DELIVERED applied',
  ACKNOWLEDGEMENT_ALARM:
    'CDC_DELIVERED refused: it names an event this ledger does not owe ' +
    '(an atomicity alarm)',
});

export {
  PARTITION_CDC_COMMAND,
  PARTITION_CDC_COMMAND_TYPES,
  PARTITION_CDC_OBLIGATION_BOUND,
  PARTITION_CDC_OBLIGATION_BYTES,
  PARTITION_CDC_OBLIGATION_DRIVE_STATE,
  PARTITION_CDC_OBLIGATION_EVENT_FIELD,
  PARTITION_CDC_OBLIGATION_FAILURE_CODE,
  PARTITION_CDC_OBLIGATION_FLUSH_STATE,
  PARTITION_CDC_OBLIGATION_LOG_MSG,
  PARTITION_CDC_OBLIGATION_MESSAGE,
  PARTITION_CDC_OBLIGATION_ORIGIN,
  PARTITION_CDC_OBLIGATION_REASON,
  PARTITION_CDC_OBLIGATION_SQL,
  PARTITION_CDC_OBLIGATION_TABLE,
};
