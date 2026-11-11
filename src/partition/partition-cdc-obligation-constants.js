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
// - DRIVE_PAGE_ROWS: how many owed rows one recipient's drive ships before
//   it yields (its continuation is the lane's retry timer).
// - SHIP_MAX_EVENTS / SHIP_MAX_BYTES (range shipping): one delivery ships the
//   owed rows after the scan cursor as one vector of at most this many rows
//   and this many event_json bytes. A scheduling bound, never an admission
//   cap: it refuses nothing, and a vector always holds at least one row, so a
//   row above SHIP_MAX_BYTES ships alone. Both are this owner's existing
//   acknowledgement batch bounds, so acknowledging one vector needs at most
//   one flush; the byte bound is far below every carrier limit the vector
//   crosses (the rs-raft append message, the router WebSocket payload).
// - RETAINED_DELIVERED_MAX (decision D1): delivered rows are reclaimed only
//   below the lowest owed row, so a row the lane leaves owed (a provisional
//   coverage, a batch that commits after a later one) keeps every delivered
//   row above it. The lane delivers past such a row only while the delivered
//   rows retained plus its own pending acknowledgements stay under this
//   bound; at the bound it answers ACKNOWLEDGEMENT_BACKPRESSURE and retries
//   from the lowest owed row (R12: backpressure, never a dropped obligation).
// - RECLAIM_ROWS_PER_APPLY (decision D1): one CDC_DELIVERED application
//   reclaims at most this many rows, so its transaction stays bounded; it
//   exceeds what one command can add (ACK_BATCH_MAX_EVENTS) plus the retained
//   bound, so a backlog shrinks with every acknowledgement.
// - OWED_MAX_EVENTS: durable owed-work capacity of ordinary writes; no new
//   per-event payload or fan-out cap.
// - OWED_RETIREMENT_RESERVE_EVENTS (dead-recipient measure 1, owner ruling
//   2026-11-11): owed rows admitted above OWED_MAX_EVENTS only for a
//   retirement-class write (partition-cdc-owed-admission.js), so the cap can
//   never refuse the lifecycle write that retires the recipient pinning it.
//   One acknowledgement batch (ACK_BATCH_MAX_EVENTS) drains the whole
//   reserve, and it covers the lifecycle rows of a node's retirement (its
//   nodes row and the services rows of the replicas it hosts) several times
//   over; the ledger's worst case grows by one batch (6 %).
// - RELIST_LAG_ROWS (dead-recipient measure 3, S3.11): a recipient more than
//   this many owed rows behind what it holds the frontier at, one of whose
//   deliveries ended without a committed receipt, is released as MUST_RELIST;
//   a re-list hold is released at the same lag, or after
//   RELIST_HOLD_DEADLINE_MS. Half the capacity, so owed rows stay under
//   OWED_MAX_EVENTS: a slow recipient costs a re-list, never a refused write.
const ACK_BATCH_MAX_EVENTS = NUM.TWO_HUNDRED_FIFTY_SIX;
const ACK_BATCH_MAX_BYTES = NUM.SIXTY_FOUR * NUM.BYTES_PER_KIB;
const OWED_MAX_EVENTS = NUM.FOUR * NUM.FOUR * NUM.TWO_HUNDRED_FIFTY_SIX;
const PARTITION_CDC_OBLIGATION_BOUND = Object.freeze({
  OWED_MAX_EVENTS,
  OWED_RETIREMENT_RESERVE_EVENTS: ACK_BATCH_MAX_EVENTS,
  RELIST_LAG_ROWS: OWED_MAX_EVENTS / NUM.TWO,
  // ends-on: the hold's recipient confirms a range, or the hold is released
  RELIST_HOLD_DEADLINE_MS: TIME_MS.MINUTE * NUM.TWO,
  ACK_BATCH_MAX_EVENTS,
  ACK_MAX_OUTSTANDING_BATCHES: NUM.TWO,
  ACK_BATCH_MAX_BYTES,
  SHIP_MAX_EVENTS: ACK_BATCH_MAX_EVENTS,
  SHIP_MAX_BYTES: ACK_BATCH_MAX_BYTES,
  // ends-on: the pending acknowledgements are proposed as one CDC_DELIVERED
  // committed command
  ACK_FLUSH_DEADLINE_MS: TIME_MS.SECOND,
  DRIVE_PAGE_ROWS: NUM.TWO_HUNDRED_FIFTY_SIX,
  RETAINED_DELIVERED_MAX: NUM.FOUR * NUM.TWO_HUNDRED_FIFTY_SIX,
  RECLAIM_ROWS_PER_APPLY: NUM.FOUR * NUM.FOUR * NUM.TWO_HUNDRED_FIFTY_SIX,
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
// owed until its flag is committed.
//
// Reclamation (decision D1): the application of each committed CDC_DELIVERED
// deletes every delivered row below the lowest owed one (bounded per apply)
// and folds them into the one compact progress row of
// PARTITION_CDC_OBLIGATION_PROGRESS_TABLE: the source-event position the
// reclaimed prefix runs through, how many obligations it held, and the
// delivery-marker position (the CDC_DELIVERED entry) that last advanced it.
// A position at or below that prefix is delivered without a row; a delivered
// row above it is retained (with its own delivery-marker position) only while
// an owed row lies below it. Like the rows, the progress row is written only
// inside committed applications, so every replica reclaims the same rows at
// the same entry.
const PARTITION_CDC_OBLIGATION_TABLE = '_cdc_obligations';
const PARTITION_CDC_OBLIGATION_PROGRESS_TABLE = '_cdc_obligation_progress';
const PARTITION_CDC_OBLIGATION_PROGRESS_SCOPE = 'ledger';
// The ledger's incarnation (CDC Stage 3): the identity of the position space
// its rows live in. A source position {logIndex, ordinal} is comparable only
// within one incarnation; a log rebuilt from fresh storage reuses indexes but
// mints another incarnation. Written once, inside the application transaction
// of the first committed entry that records an obligation under this build,
// from that entry's own identity, so every replica holds the same value and a
// snapshot install carries it.
const PARTITION_CDC_LEDGER_INCARNATION_TABLE = '_cdc_ledger_incarnation';
// The ledger's newest recorded event, kept as one row beside the ledger (CDC
// Stage 3): the position probe shipped to a recipient below it when nothing is
// owed after its cursor. Decision D1's reclamation is unchanged.
const PARTITION_CDC_LEDGER_NEWEST_TABLE = '_cdc_ledger_newest';
const PARTITION_CDC_OBLIGATION_SQL = Object.freeze({
  SELECT_ALL:
    'SELECT event_key, log_index, term, ordinal, entry_id, event_json, delivered, ' +
    `delivered_index, delivered_term FROM ${PARTITION_CDC_OBLIGATION_TABLE} ` +
    'ORDER BY log_index, ordinal',
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
  // The newest recorded event (CDC Stage 3 position probe): one row, replaced
  // by every recording in the same application transaction, so it survives
  // decision D1's reclamation of the ledger row it copies.
  CREATE_NEWEST_TABLE: `
      CREATE TABLE IF NOT EXISTS ${PARTITION_CDC_LEDGER_NEWEST_TABLE} (
        scope TEXT PRIMARY KEY,
        event_key TEXT NOT NULL,
        log_index INTEGER NOT NULL,
        term INTEGER NOT NULL,
        ordinal INTEGER NOT NULL,
        entry_id TEXT NOT NULL,
        event_json TEXT NOT NULL
      )
    `,
  UPSERT_NEWEST:
    `INSERT INTO ${PARTITION_CDC_LEDGER_NEWEST_TABLE} ` +
    '(scope, event_key, log_index, term, ordinal, entry_id, event_json) ' +
    'VALUES (@scope, @eventKey, @logIndex, @term, @ordinal, @entryId, @eventJson) ' +
    'ON CONFLICT (scope) DO UPDATE SET event_key = excluded.event_key, ' +
    'log_index = excluded.log_index, term = excluded.term, ordinal = excluded.ordinal, ' +
    'entry_id = excluded.entry_id, event_json = excluded.event_json',
  NEWEST_TABLE_EXISTS:
    'SELECT 1 AS present FROM sqlite_master WHERE type = \'table\' ' +
    `AND name = '${PARTITION_CDC_LEDGER_NEWEST_TABLE}'`,
  SELECT_NEWEST:
    'SELECT event_key, log_index, term, ordinal, entry_id, event_json ' +
    `FROM ${PARTITION_CDC_LEDGER_NEWEST_TABLE} WHERE scope = ?`,
  // The retained row immediately before a position, owed or delivered: the
  // predecessor a shipped range names (CDC Stage 3).
  SELECT_PREDECESSOR:
    'SELECT log_index, ordinal ' +
    `FROM ${PARTITION_CDC_OBLIGATION_TABLE} WHERE ` +
    '(log_index < @logIndex OR (log_index = @logIndex AND ordinal < @ordinal)) ' +
    'ORDER BY log_index DESC, ordinal DESC LIMIT 1',
  // The owed rows after a position, counted up to a bound (a recipient's
  // row lag, CDC Stage 3 re-list bound).
  COUNT_OWED_AFTER:
    'SELECT COUNT(*) AS count FROM (SELECT 1 ' +
    `FROM ${PARTITION_CDC_OBLIGATION_TABLE} WHERE delivered = 0 ` +
    'AND (log_index > @logIndex OR (log_index = @logIndex AND ordinal > @ordinal)) ' +
    'LIMIT @limit)',
  CREATE_INCARNATION_TABLE: `
      CREATE TABLE IF NOT EXISTS ${PARTITION_CDC_LEDGER_INCARNATION_TABLE} (
        scope TEXT PRIMARY KEY,
        incarnation TEXT NOT NULL,
        minted_index INTEGER NOT NULL,
        minted_term INTEGER NOT NULL
      )
    `,
  // The first mint wins: a later entry never replaces the incarnation.
  INSERT_INCARNATION:
    `INSERT OR IGNORE INTO ${PARTITION_CDC_LEDGER_INCARNATION_TABLE} ` +
    '(scope, incarnation, minted_index, minted_term) ' +
    'VALUES (@scope, @incarnation, @index, @term)',
  INCARNATION_TABLE_EXISTS:
    'SELECT 1 AS present FROM sqlite_master WHERE type = \'table\' ' +
    `AND name = '${PARTITION_CDC_LEDGER_INCARNATION_TABLE}'`,
  SELECT_INCARNATION:
    `SELECT incarnation FROM ${PARTITION_CDC_LEDGER_INCARNATION_TABLE} WHERE scope = ?`,
  // The lowest owed row: everything below it is delivered.
  SELECT_OWED_HEAD:
    'SELECT log_index, ordinal ' +
    `FROM ${PARTITION_CDC_OBLIGATION_TABLE} WHERE delivered = 0 ` +
    'ORDER BY log_index, ordinal LIMIT 1',
  // The delivered rows retained, counted up to a bound (the lane's
  // backpressure reads only whether the bound is reached).
  COUNT_RETAINED_DELIVERED:
    'SELECT COUNT(*) AS count FROM (SELECT 1 ' +
    `FROM ${PARTITION_CDC_OBLIGATION_TABLE} WHERE delivered = 1 LIMIT @limit)`,
  // The reclaimable prefix: delivered rows below a position, in log order,
  // at most @limit of them.
  SELECT_RECLAIMABLE:
    'SELECT log_index, ordinal ' +
    `FROM ${PARTITION_CDC_OBLIGATION_TABLE} WHERE delivered = 1 ` +
    'AND (log_index < @logIndex OR (log_index = @logIndex AND ordinal < @ordinal)) ' +
    'ORDER BY log_index, ordinal LIMIT @limit',
  DELETE_RECLAIMED:
    `DELETE FROM ${PARTITION_CDC_OBLIGATION_TABLE} WHERE delivered = 1 ` +
    'AND (log_index < @logIndex OR (log_index = @logIndex AND ordinal <= @ordinal))',
  CREATE_PROGRESS_TABLE: `
      CREATE TABLE IF NOT EXISTS ${PARTITION_CDC_OBLIGATION_PROGRESS_TABLE} (
        scope TEXT PRIMARY KEY,
        through_log_index INTEGER NOT NULL,
        through_ordinal INTEGER NOT NULL,
        reclaimed INTEGER NOT NULL,
        advanced_index INTEGER NOT NULL,
        advanced_term INTEGER NOT NULL
      )
    `,
  PROGRESS_TABLE_EXISTS:
    'SELECT 1 AS present FROM sqlite_master WHERE type = \'table\' ' +
    `AND name = '${PARTITION_CDC_OBLIGATION_PROGRESS_TABLE}'`,
  SELECT_PROGRESS:
    'SELECT scope, through_log_index, through_ordinal, reclaimed, advanced_index, ' +
    `advanced_term FROM ${PARTITION_CDC_OBLIGATION_PROGRESS_TABLE}`,
  UPSERT_PROGRESS:
    `INSERT INTO ${PARTITION_CDC_OBLIGATION_PROGRESS_TABLE} ` +
    '(scope, through_log_index, through_ordinal, reclaimed, advanced_index, advanced_term) ' +
    'VALUES (@scope, @logIndex, @ordinal, @reclaimed, @index, @term) ' +
    'ON CONFLICT (scope) DO UPDATE SET through_log_index = excluded.through_log_index, ' +
    'through_ordinal = excluded.through_ordinal, ' +
    'reclaimed = reclaimed + excluded.reclaimed, ' +
    'advanced_index = excluded.advanced_index, advanced_term = excluded.advanced_term',
});

// Where one position stands in the ledger (decision D1). OWED and DELIVERED
// prove a retained row; RECLAIMED means only that the position is within the
// compact prefix, not that any particular event identity existed there;
// UNKNOWN a position above the prefix the ledger holds no row for.
const PARTITION_CDC_OBLIGATION_STANDING = Object.freeze({
  OWED: 'owed',
  DELIVERED: 'delivered',
  RECLAIMED: 'reclaimed',
  UNKNOWN: 'unknown',
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
// refusals before a CDC_DELIVERED command is proposed; the next four are
// what its application answers when it is consumed without a write (a
// command naming another partition, compacted identity evidence, an event the
// ledger does not retain at that position, or another event at that position:
// refused alike on every replica and raised as an alarm; the delivery owner
// resolves each, partition-cdc-acknowledgement-refusal.js); the last two are
// the delivery owner's flush outcomes when no proposer is composed or the
// batch was proposed by a replica that no longer leads.
const PARTITION_CDC_OBLIGATION_FAILURE_CODE = Object.freeze({
  ORIGIN_REFUSED: 'partition_write_cdc_command_not_admissible',
  BYTES_INVALID: 'partition_write_cdc_command_invalid',
  IDENTITY_MISMATCH: 'cdc_acknowledgement_identity_mismatch',
  IDENTITY_COMPACTED: 'cdc_acknowledgement_identity_compacted',
  UNKNOWN_EVENT: 'cdc_acknowledgement_unknown_event',
  POSITION_MISMATCH: 'cdc_acknowledgement_position_mismatch',
  PROPOSER_UNAVAILABLE: 'cdc_acknowledgement_proposer_unavailable',
  NOT_LEADER: 'cdc_acknowledgement_not_leader',
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
  RECLAIM_COUNT_MISMATCH:
    'CDC obligation ledger: reclaiming the delivered prefix deleted another row count',
  CODE_SEPARATOR: ': ',
});

// What one drive of the owed obligations ended as (R07: a named state).
const PARTITION_CDC_OBLIGATION_DRIVE_STATE = Object.freeze({
  NOT_LEADER: 'not_leader',
  SHUTDOWN: 'shutdown',
  JOINED_IN_FLIGHT: 'joined_in_flight',
  NO_SUBSCRIBERS: 'no_subscribers',
  // The leader owes rows of a propagated table and has no propagation
  // subscriber: a named, logged condition, never silent accumulation. A
  // deferred attachment registered on the partition is woken by it.
  NO_PROPAGATION_SUBSCRIBER: 'no_propagation_subscriber',
  NO_LEDGER: 'no_ledger',
  DRAINED: 'drained',
  PAGE_YIELDED: 'page_yielded',
  PROVISIONAL: 'provisional',
  HELD_BY_SUBSCRIBER: 'held_by_subscriber',
  ACKNOWLEDGEMENT_BACKPRESSURE: 'acknowledgement_backpressure',
});

// The lane's named progress state of one recipient (a subscriber, or one
// target group of its propagation). Transitions, what each state pins and
// what releases it: partition-cdc-recipient-progress.js (design note S3.11).
// MUST_RELIST and DETACHED hold nothing; every other state holds the frontier.
const PARTITION_CDC_RECIPIENT_STATE = Object.freeze({
  NEVER_SHIPPED: 'never_shipped',
  CONFIRMED: 'confirmed',
  SUBSCRIBER_UNCONFIRMED: 'subscriber_unconfirmed',
  POSITION_GAP: 'position_gap',
  MUST_RELIST: 'must_relist',
  RELIST_OFFERED: 'relist_offered',
  DETACHED: 'detached',
});

const PARTITION_CDC_RECIPIENT_DETACH_REASON = Object.freeze({
  LIFECYCLE: 'lifecycle',
});

// Why a recipient was released to MUST_RELIST.
const PARTITION_CDC_RECIPIENT_RELEASE = Object.freeze({
  LAG_WITHOUT_RECEIPT: 'lag_without_receipt',
  OFFER_UNANSWERED: 'relist_offer_unanswered',
  HOLD_LAG_EXCEEDED: 'relist_hold_lag_exceeded',
  HOLD_EXPIRED: 'relist_hold_expired',
});

// What one recipient's drive pass ended as.
const PARTITION_CDC_RECIPIENT_PASS = Object.freeze({
  DRAINED: 'drained',
  HELD: 'held',
  PROVISIONAL: 'provisional',
  PAGE_YIELDED: 'page_yielded',
  CLEANUP_PENDING: 'cleanup_pending',
  FAILED: 'failed',
  STOPPED: 'stopped',
});

// Why an idle recipient is not started by a wake. Each is a named wait woken
// by the event that clears it: RUNNING (its own drive runs again), CLEANUP
// (its delivery's actual local cleanup), BACKOFF (its own due time, on the
// lane's retry timer) and CAUGHT_UP (the next committed row). A recipient
// behind the owed tail with none of these is started; nothing else may hold it.
const PARTITION_CDC_RECIPIENT_WAIT = Object.freeze({
  RUNNING: 'running',
  CLEANUP: 'cleanup',
  BACKOFF: 'backoff',
  CAUGHT_UP: 'caught_up',
});

// What one flush of the acknowledgement batch ended as.
const PARTITION_CDC_OBLIGATION_FLUSH_STATE = Object.freeze({
  EMPTY: 'empty',
  IN_FLIGHT: 'in_flight',
  BACKPRESSURE: 'backpressure',
  COMMITTED: 'committed',
  RECONCILED: 'reconciled',
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
  // The sender's cache changed a recipient-domain table (CDC Stage 3).
  RECIPIENT_DOMAIN_CHANGED: 'recipient_domain_changed',
  BATCH_EVENTS_BOUND: 'batch_events_bound',
  BATCH_BYTES_BOUND: 'batch_bytes_bound',
  FLUSH_DEADLINE: 'flush_deadline',
});

const PARTITION_CDC_OBLIGATION_LOG_MSG = Object.freeze({
  RECORDED: 'CDC obligations recorded with the committed decision',
  DELIVERY_HELD: 'CDC obligation delivery held by a subscriber; retry scheduled',
  DRIVE_FAILED: 'CDC obligation drive failed',
  OWED_WITHOUT_PROPAGATION_SUBSCRIBER:
    'CDC obligations owed on a propagated table with no propagation subscriber',
  DELIVERY_BACKPRESSURED: 'CDC obligation delivery backpressured',
  ACKNOWLEDGEMENTS_PROPOSED: 'CDC acknowledgement batch proposed',
  ACKNOWLEDGEMENTS_REFUSED: 'CDC acknowledgement batch refused',
  ACKNOWLEDGEMENTS_OUTCOME_UNKNOWN:
    'CDC acknowledgement batch outcome unknown; kept until the ledger decides',
  ACKNOWLEDGEMENTS_DROPPED_NOT_LEADER:
    'CDC acknowledgement batch dropped: this replica no longer leads',
  PROPOSER_UNAVAILABLE:
    'CDC acknowledgement batch held: no acknowledgement proposer is composed',
  ACKNOWLEDGEMENT_APPLIED: 'CDC_DELIVERED applied',
  ACKNOWLEDGEMENT_IDENTITY_COMPACTED:
    'CDC_DELIVERED exact identity compacted; delivery-owner reconciliation required',
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
  PARTITION_CDC_OBLIGATION_PROGRESS_SCOPE,
  PARTITION_CDC_OBLIGATION_PROGRESS_TABLE,
  PARTITION_CDC_OBLIGATION_REASON,
  PARTITION_CDC_OBLIGATION_SQL,
  PARTITION_CDC_OBLIGATION_STANDING,
  PARTITION_CDC_OBLIGATION_TABLE,
  PARTITION_CDC_RECIPIENT_DETACH_REASON,
  PARTITION_CDC_RECIPIENT_PASS,
  PARTITION_CDC_RECIPIENT_RELEASE,
  PARTITION_CDC_RECIPIENT_STATE,
  PARTITION_CDC_RECIPIENT_WAIT,
};
