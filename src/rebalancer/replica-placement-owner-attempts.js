// Public entry: persistUnresolvedPlacementAttempt, deleteUnresolvedPlacementAttempt, reconcilePlacementAttempts, createBlockedPlacementAttempts.
// Required collaborators: PartitionService SQLite db (_placement_owner_unresolved_attempts, _partition_statement_outcomes).
// Durable authority / commit point: _placement_owner_unresolved_attempts and _partition_statement_outcomes in SQLite.
// Permitted post-commit work: hydration and cleanup of in-memory uncertainEntryIds on ReplicaPlacementOwner.
// Recovery / wake entry: reconcilePlacementAttempts on PLACEMENT_TRIGGER.LEADERSHIP_START.
// Representative production tests: test/rebalancer/replica-placement-owner-core.test.js.
import {readSettledOwnerCommandIn} from '../partition/partition-committed-statement-outcome.js';
import {PARTITION_SETTLED_COMMAND_STATE as SETTLED} from
  '../partition/partition-committed-statement-outcome-constants.js';
import {placementBodyDigestOf} from '../partition/partition-placement-admission-command.js';
import {PLACEMENT_ADMISSION_ERROR, PLACEMENT_ADMIT_TYPE, PLACEMENT_RELEASE_HOLD_TYPE} from
  '../partition/partition-placement-admission-constants.js';

// The named state of a kept attempt whose entry key already holds another
// record: its command can never settle there, so it is blocked work, visible
// in the owner's diagnostic and warned once. Release: the intent changes (a
// fresh attempt and entry id replaces it) or an operator acts; nothing
// retires it automatically.
const PLACEMENT_ATTEMPT_STATE = Object.freeze({
  BLOCKED_ON_KEY_COLLISION: 'blocked_on_key_collision',
});
const BLOCKED_ATTEMPT_WARNING =
  'Placement attempt blocked: its entry key holds another settled record';

const ENTRY_KIND_ADMIT = 'admit';
const ENTRY_KIND_RELEASE = 'release';
const ATTEMPT_KEY_SEPARATOR = ':';
// The committed command each attempt kind proposes (replica-placement-owner.js
// resolveAttempt keys an attempt `${kind}:${targetId}`).
const ATTEMPT_COMMAND_TYPE = Object.freeze({
  [ENTRY_KIND_ADMIT]: PLACEMENT_ADMIT_TYPE,
  [ENTRY_KIND_RELEASE]: PLACEMENT_RELEASE_HOLD_TYPE,
});
const CREATE_ATTEMPTS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS _placement_owner_unresolved_attempts (
    attempt_key TEXT PRIMARY KEY NOT NULL,
    intent_key TEXT NOT NULL,
    entry_id TEXT NOT NULL,
    body_text TEXT NOT NULL
  )
`;
const UPSERT_ATTEMPT_SQL =
  'INSERT INTO _placement_owner_unresolved_attempts ' +
  '(attempt_key, intent_key, entry_id, body_text) VALUES (?, ?, ?, ?) ' +
  'ON CONFLICT(attempt_key) DO UPDATE SET ' +
  'intent_key = excluded.intent_key, entry_id = excluded.entry_id, body_text = excluded.body_text';
const DELETE_ATTEMPT_SQL =
  'DELETE FROM _placement_owner_unresolved_attempts WHERE attempt_key = ?';
const SELECT_ALL_ATTEMPTS_SQL =
  'SELECT attempt_key, intent_key, entry_id, body_text ' +
  'FROM _placement_owner_unresolved_attempts ORDER BY attempt_key ASC';

const isFunction = (value) => typeof value === 'function';

function canUseAttemptStore(db) {
  return Boolean(db && db.open !== false && isFunction(db.prepare) && isFunction(db.exec));
}

function ensureAttemptStoreTable(db) {
  if (!canUseAttemptStore(db)) return false;
  db.exec(CREATE_ATTEMPTS_TABLE_SQL);
  return true;
}

function persistUnresolvedPlacementAttempt(db, attempt) {
  if (!ensureAttemptStoreTable(db)) return;
  db.prepare(UPSERT_ATTEMPT_SQL).run(
    attempt.attemptKey,
    attempt.intentKey,
    attempt.entryId,
    attempt.bodyText,
  );
}

function deleteUnresolvedPlacementAttempt(db, attemptKey) {
  if (!ensureAttemptStoreTable(db)) return;
  db.prepare(DELETE_ATTEMPT_SQL).run(attemptKey);
}

function hydrateUnresolvedPlacementAttempts(db, uncertainEntryIds) {
  if (!ensureAttemptStoreTable(db)) return;
  const rows = db.prepare(SELECT_ALL_ATTEMPTS_SQL).all();
  for (const row of rows) {
    if (uncertainEntryIds.has(row.attempt_key)) continue;
    uncertainEntryIds.set(row.attempt_key, Object.freeze({
      attemptKey: row.attempt_key,
      intentKey: row.intent_key,
      entryId: row.entry_id,
      body: Object.freeze(JSON.parse(row.body_text)),
      bodyText: row.body_text,
    }));
  }
}

const UNSETTLED_ATTEMPT = Object.freeze({state: SETTLED.UNSETTLED});

// Exact settlement of an attempt: the outcome owner's identity-checked read,
// for the attempt's own command (its kind's type and its body, as the
// partition pins them). Only SAME_COMMAND settles it; OTHER_RECORD names the
// class of the record that holds its entry key. The ledger census is never a
// settlement: a replica_operations row names only the entry id its admission
// ran under, and a hold's state names no release command.
function attemptSettlementOf(db, attemptKey, attempt) {
  if (!canUseAttemptStore(db)) return UNSETTLED_ATTEMPT;
  const kind = attemptKey.slice(0, attemptKey.indexOf(ATTEMPT_KEY_SEPARATOR));
  if (!Object.hasOwn(ATTEMPT_COMMAND_TYPE, kind)) return UNSETTLED_ATTEMPT;
  const commandDigest = placementBodyDigestOf(ATTEMPT_COMMAND_TYPE[kind], attempt.body);
  return commandDigest === null ? UNSETTLED_ATTEMPT :
    readSettledOwnerCommandIn(db, {entryId: attempt.entryId, commandDigest});
}

/**
 * The owner's registry of blocked attempts: one typed, frozen state per
 * attempt key whose current attempt meets another record under its entry key,
 * warned once per (attempt key, entry id), dropped when the attempt settles
 * or is replaced.
 * @param {Object} logger - The owner's logger (warn).
 * @return {Object} Frozen {observe(attemptKey, attempt, settlement),
 *   forget(attemptKey), list()}.
 */
function createBlockedPlacementAttempts(logger) {
  const blocked = new Map();
  return Object.freeze({
    observe(attemptKey, attempt, settlement) {
      if (settlement.state !== SETTLED.OTHER_RECORD) {
        blocked.delete(attemptKey);
        return;
      }
      if (blocked.get(attemptKey)?.entryId === attempt.entryId) return;
      const state = Object.freeze({state: PLACEMENT_ATTEMPT_STATE.BLOCKED_ON_KEY_COLLISION,
        attemptKey, entryId: attempt.entryId, recordClass: settlement.recordClass});
      blocked.set(attemptKey, state);
      logger.warn(BLOCKED_ATTEMPT_WARNING, {attemptKey, entryId: attempt.entryId,
        recordClass: settlement.recordClass});
    },
    forget(attemptKey) {
      blocked.delete(attemptKey);
    },
    list() {
      return Object.freeze([...blocked.values()]);
    },
  });
}

/**
 * Account one answer of a submitted attempt: a committed answer settles it
 * (the owner deletes it); a BYTES answer is a collision only when the
 * attempt's entry key holds another record, which makes it blocked work;
 * an answer for a replaced attempt drops the stale blocked state.
 * @param {Object} db - The ledger partition's connection.
 * @param {Object} blockedAttempts - createBlockedPlacementAttempts().
 * @param {Object} attempt - {attemptKey, entryId, body}.
 * @param {Object} answer - The admission answer.
 */
function observePlacementAttemptAnswer(db, blockedAttempts, attempt, answer) {
  if (answer?.committed === true) {
    blockedAttempts.forget(attempt.attemptKey);
    return;
  }
  if (answer?.failureCode === PLACEMENT_ADMISSION_ERROR.BYTES) {
    blockedAttempts.observe(attempt.attemptKey, attempt,
      attemptSettlementOf(db, attempt.attemptKey, attempt));
    return;
  }
  const blocked = blockedAttempts.list().find((state) =>
    state.attemptKey === attempt.attemptKey);
  if (blocked !== undefined && blocked.entryId !== attempt.entryId) {
    blockedAttempts.forget(attempt.attemptKey);
  }
}

/**
 * Reconcile the durable unresolved attempts on leadership start: an attempt
 * is discharged only by its exact outcome record; one whose entry key holds
 * another record is kept and made visible as blocked work.
 * @param {Object} db - The ledger partition's connection.
 * @param {Map} uncertainEntryIds - The owner's in-memory attempts.
 * @param {Object} blockedAttempts - createBlockedPlacementAttempts().
 */
function reconcilePlacementAttempts(db, uncertainEntryIds, blockedAttempts) {
  hydrateUnresolvedPlacementAttempts(db, uncertainEntryIds);
  for (const [attemptKey, attempt] of [...uncertainEntryIds.entries()]) {
    const settlement = attemptSettlementOf(db, attemptKey, attempt);
    if (settlement.state === SETTLED.SAME_COMMAND) {
      uncertainEntryIds.delete(attemptKey);
      deleteUnresolvedPlacementAttempt(db, attemptKey);
      blockedAttempts.forget(attemptKey);
    } else {
      blockedAttempts.observe(attemptKey, attempt, settlement);
    }
  }
}

export {
  PLACEMENT_ATTEMPT_STATE,
  createBlockedPlacementAttempts,
  deleteUnresolvedPlacementAttempt,
  observePlacementAttemptAnswer,
  persistUnresolvedPlacementAttempt,
  reconcilePlacementAttempts,
};
