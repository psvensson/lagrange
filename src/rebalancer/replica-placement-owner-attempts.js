// Public entry: persistUnresolvedPlacementAttempt, deleteUnresolvedPlacementAttempt, reconcilePlacementAttempts, reconcileReleaseAttempts, redrivenReleaseAttempt, createBlockedPlacementAttempts.
// Required collaborators: PartitionService SQLite db (_placement_owner_unresolved_attempts, _partition_statement_outcomes).
// Durable authority / commit point: _placement_owner_unresolved_attempts and _partition_statement_outcomes in SQLite.
// Permitted post-commit work: hydration and cleanup of in-memory uncertainEntryIds on ReplicaPlacementOwner.
// Recovery / wake entry: reconcilePlacementAttempts on PLACEMENT_TRIGGER.LEADERSHIP_START.
// Representative production tests: test/rebalancer/replica-placement-owner-core.test.js.
import {readSettledOwnerCommandIn} from '../partition/partition-committed-statement-outcome.js';
import {PARTITION_SETTLED_COMMAND_STATE as SETTLED} from
  '../partition/partition-committed-statement-outcome-constants.js';
import {placementBodyDigestOf} from '../partition/partition-placement-admission-command.js';
import {readEngagedLedgerHoldIn} from '../partition/partition-placement-admission-decision.js';
import {PLACEMENT_ADMISSION_ERROR, PLACEMENT_ADMIT_TYPE, PLACEMENT_RELEASE_HOLD_TYPE} from
  '../partition/partition-placement-admission-constants.js';

// The named states of an attempt whose entry key already holds another
// record (outcome rows are permanent, so its command can never settle there),
// visible in the owner's diagnostic:
// - BLOCKED_ON_KEY_COLLISION: kept, warned once. An ADMIT is released when its
//   intent changes (a fresh attempt and entry id replaces it); it blocks only
//   its own partition's current intent.
// - REDRIVEN_UNDER_FRESH_ENTRY: a RELEASE is never left blocked (its intent,
//   the held operation, never changes, and an engaged ledger hold stops every
//   pass): the owner re-drives it at once under a fresh entry id minted like
//   every attempt's (placement-owner:<node>:release:<operationId>:<uuid>).
//   Release is idempotent by operation identity at apply (HOLD_NOT_HELD once
//   the hold is lifted), so the fresh entry cannot double-apply. The blocked
//   record stays listed as history, naming the fresh entry.
const PLACEMENT_ATTEMPT_STATE = Object.freeze({
  BLOCKED_ON_KEY_COLLISION: 'blocked_on_key_collision',
  REDRIVEN_UNDER_FRESH_ENTRY: 'redriven_under_fresh_entry',
});
// A retirement that is not a settlement of the attempt's own command:
// - SUPERSEDED_BY_LEDGER: an uncertain RELEASE whose hold the committed
//   ledger no longer holds engaged (read with its receipt in one transaction
//   on the leader's store). The release obligation is reached, whoever reached
//   it; its own command is never counted as applied. Listed once.
const PLACEMENT_ATTEMPT_RETIREMENT = Object.freeze({
  SUPERSEDED_BY_LEDGER: 'superseded_by_ledger',
});
// The bounded history of re-driven and retired attempts (oldest dropped).
const PLACEMENT_ATTEMPT_HISTORY_LIMIT = 32;
const BLOCKED_ATTEMPT_WARNING =
  'Placement attempt blocked: its entry key holds another settled record';
const REDRIVEN_ATTEMPT_INFO =
  'Placement release re-driven under a fresh entry: its entry key holds another record';
const SUPERSEDED_ATTEMPT_INFO =
  'Placement release attempt retired: its hold is no longer engaged in the committed ledger';

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
const RELEASE_ATTEMPT_PREFIX = `${ENTRY_KIND_RELEASE}${ATTEMPT_KEY_SEPARATOR}`;
const isReleaseAttemptKey = (attemptKey) => attemptKey.startsWith(RELEASE_ATTEMPT_PREFIX);

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

function boundedAppend(history, state) {
  history.push(state);
  if (history.length > PLACEMENT_ATTEMPT_HISTORY_LIMIT) history.shift();
}

/**
 * The owner's registry of blocked attempts: one typed, frozen state per
 * attempt key whose current attempt meets another record under its entry key,
 * warned once per (attempt key, entry id), dropped when the attempt settles
 * or is replaced; and the bounded history of re-driven and retired attempts.
 * @param {Object} logger - The owner's logger (warn, info).
 * @return {Object} Frozen {observe, redrive, supersede, forget, list(),
 *   superseded(), snapshot()}.
 */
function createBlockedPlacementAttempts(logger) {
  const blocked = new Map();
  const redriven = [];
  const superseded = [];
  const list = () => Object.freeze([...blocked.values(), ...redriven]);
  const supersededList = () => Object.freeze([...superseded]);
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
    redrive(attempt, collision, redrivenEntryId) {
      const {attemptKey, entryId} = attempt;
      blocked.delete(attemptKey);
      boundedAppend(redriven, Object.freeze({
        state: PLACEMENT_ATTEMPT_STATE.REDRIVEN_UNDER_FRESH_ENTRY, attemptKey, entryId,
        recordClass: collision.recordClass, redrivenEntryId}));
      logger.info(REDRIVEN_ATTEMPT_INFO, {attemptKey, entryId, redrivenEntryId});
    },
    supersede(attempt, operationId) {
      const {attemptKey, entryId} = attempt;
      blocked.delete(attemptKey);
      boundedAppend(superseded, Object.freeze({
        state: PLACEMENT_ATTEMPT_RETIREMENT.SUPERSEDED_BY_LEDGER, attemptKey, entryId,
        operationId}));
      logger.info(SUPERSEDED_ATTEMPT_INFO, {attemptKey, entryId, operationId});
    },
    forget(attemptKey) {
      blocked.delete(attemptKey);
    },
    list,
    superseded: supersededList,
    snapshot: () => ({blockedAttempts: list(), supersededAttempts: supersededList()}),
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
 * The re-drive of a RELEASE blocked on its entry key: when the answer is the
 * BYTES collision and the entry key holds another record, a fresh attempt
 * under a fresh entry id, persisted before it is submitted, with the blocked
 * record moved to the history.
 * @param {Object} db - The ledger partition's connection.
 * @param {Object} owned - {uncertainEntryIds, blockedAttempts}.
 * @param {Object} attempt - The submitted RELEASE attempt.
 * @param {Object} answer - Its answer.
 * @param {Function} mintEntryId - The owner's entry-id mint.
 * @return {Object|null} The fresh attempt, or null when not blocked.
 */
function redrivenReleaseAttempt(db, owned, attempt, answer, mintEntryId) {
  if (answer?.failureCode !== PLACEMENT_ADMISSION_ERROR.BYTES) return null;
  const collision = attemptSettlementOf(db, attempt.attemptKey, attempt);
  if (collision.state !== SETTLED.OTHER_RECORD) return null;
  const fresh = Object.freeze({...attempt, entryId: mintEntryId()});
  owned.uncertainEntryIds.set(fresh.attemptKey, fresh);
  persistUnresolvedPlacementAttempt(db, fresh);
  owned.blockedAttempts.redrive(attempt, collision, fresh.entryId);
  return fresh;
}

function releaseOperationIdOf(attemptKey, attempt) {
  return isReleaseAttemptKey(attemptKey) && typeof attempt.body?.operationId === 'string' ?
    attempt.body.operationId : null;
}

// One read transaction on the leader's store: the attempt's exact receipt
// and, for a RELEASE that it does not settle, whether its hold is engaged.
function attemptDecisionIn(db, attemptKey, attempt) {
  return db.transaction(() => {
    const settlement = attemptSettlementOf(db, attemptKey, attempt);
    const operationId = releaseOperationIdOf(attemptKey, attempt);
    const superseded = settlement.state !== SETTLED.SAME_COMMAND && operationId !== null &&
      !readEngagedLedgerHoldIn(db, operationId);
    return {settlement, superseded, operationId};
  })();
}

function reconcileAttempts(db, uncertainEntryIds, blockedAttempts, attemptKeys) {
  for (const attemptKey of attemptKeys) {
    const attempt = uncertainEntryIds.get(attemptKey);
    const decision = attemptDecisionIn(db, attemptKey, attempt);
    const settled = decision.settlement.state === SETTLED.SAME_COMMAND;
    if (settled || decision.superseded) {
      uncertainEntryIds.delete(attemptKey);
      deleteUnresolvedPlacementAttempt(db, attemptKey);
    }
    if (decision.superseded) {
      blockedAttempts.supersede(attempt, decision.operationId);
    } else if (settled) {
      blockedAttempts.forget(attemptKey);
    } else {
      blockedAttempts.observe(attemptKey, attempt, decision.settlement);
    }
  }
}

/**
 * Reconcile the durable unresolved attempts on leadership start: an attempt
 * is discharged by its exact outcome record; an uncertain RELEASE whose hold
 * is no longer engaged retires SUPERSEDED_BY_LEDGER; one whose entry key holds
 * another record is kept and made visible as blocked work.
 * @param {Object} db - The ledger partition's connection.
 * @param {Map} uncertainEntryIds - The owner's in-memory attempts.
 * @param {Object} blockedAttempts - createBlockedPlacementAttempts().
 */
function reconcilePlacementAttempts(db, uncertainEntryIds, blockedAttempts) {
  if (!canUseAttemptStore(db)) return;
  hydrateUnresolvedPlacementAttempts(db, uncertainEntryIds);
  reconcileAttempts(db, uncertainEntryIds, blockedAttempts, [...uncertainEntryIds.keys()]);
}

/**
 * The same reconciliation for the uncertain RELEASE attempts only, on every
 * pass: a release is re-driven only while its hold is engaged, so one whose
 * hold was lifted (by its own late commit or by another leader) is resolved
 * here instead of being kept unseen.
 * @param {Object} db - The ledger partition's connection.
 * @param {Map} uncertainEntryIds - The owner's in-memory attempts.
 * @param {Object} blockedAttempts - createBlockedPlacementAttempts().
 */
function reconcileReleaseAttempts(db, uncertainEntryIds, blockedAttempts) {
  if (!canUseAttemptStore(db)) return;
  reconcileAttempts(db, uncertainEntryIds, blockedAttempts,
    [...uncertainEntryIds.keys()].filter(isReleaseAttemptKey));
}

export {
  PLACEMENT_ATTEMPT_RETIREMENT,
  PLACEMENT_ATTEMPT_STATE,
  createBlockedPlacementAttempts,
  deleteUnresolvedPlacementAttempt,
  observePlacementAttemptAnswer,
  persistUnresolvedPlacementAttempt,
  reconcilePlacementAttempts,
  reconcileReleaseAttempts,
  redrivenReleaseAttempt,
};
