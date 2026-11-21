// Public entry: persistUnresolvedPlacementAttempt, deleteUnresolvedPlacementAttempt, reconcilePlacementAttempts.
// Required collaborators: PartitionService SQLite db (_placement_owner_unresolved_attempts, _partition_statement_outcomes) and readPlacementCensus.
// Durable authority / commit point: _placement_owner_unresolved_attempts and _partition_statement_outcomes in SQLite.
// Permitted post-commit work: hydration and cleanup of in-memory uncertainEntryIds on ReplicaPlacementOwner.
// Recovery / wake entry: reconcilePlacementAttempts on PLACEMENT_TRIGGER.LEADERSHIP_START.
// Representative production tests: test/rebalancer/replica-placement-owner-core.test.js.
import {PLACEMENT_DISPATCH_HOLD} from './replica-placement-owner-constants.js';
import {readSettledOwnerCommandIn} from '../partition/partition-committed-statement-outcome.js';
import {PARTITION_SETTLED_COMMAND_STATE as SETTLED} from
  '../partition/partition-committed-statement-outcome-constants.js';
import {placementBodyDigestOf} from '../partition/partition-placement-admission-command.js';
import {PLACEMENT_ADMIT_TYPE, PLACEMENT_RELEASE_HOLD_TYPE} from
  '../partition/partition-placement-admission-constants.js';

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

// Exact settlement: the outcome record under the attempt's entry settles it
// only when it carries the attempt's own command (its kind's type and its
// body, as the partition pins them). Another record under that entry - of
// another command, owner or statement - settles nothing.
function isSettledInStatementOutcomes(db, attemptKey, attempt) {
  if (!canUseAttemptStore(db)) return false;
  const kind = attemptKey.slice(0, attemptKey.indexOf(ATTEMPT_KEY_SEPARATOR));
  if (!Object.hasOwn(ATTEMPT_COMMAND_TYPE, kind)) return false;
  const commandDigest = placementBodyDigestOf(ATTEMPT_COMMAND_TYPE[kind], attempt.body);
  return commandDigest !== null && readSettledOwnerCommandIn(db,
    {entryId: attempt.entryId, commandDigest}).state === SETTLED.SAME_COMMAND;
}

function isSettledInCensus(refreshedCensus, attemptKey, attempt) {
  return refreshedCensus.some((row) =>
    row.admission?.entryId === attempt.entryId ||
    (attemptKey === `${ENTRY_KIND_RELEASE}:${row.operationId}` &&
      row.dispatchHold !== PLACEMENT_DISPATCH_HOLD.LEDGER_AWAITING_COPY_IDLE));
}

function reconcilePlacementAttempts(db, uncertainEntryIds, refreshedCensus) {
  hydrateUnresolvedPlacementAttempts(db, uncertainEntryIds);
  for (const [attemptKey, attempt] of [...uncertainEntryIds.entries()]) {
    if (isSettledInStatementOutcomes(db, attemptKey, attempt) ||
        isSettledInCensus(refreshedCensus, attemptKey, attempt)) {
      uncertainEntryIds.delete(attemptKey);
      deleteUnresolvedPlacementAttempt(db, attemptKey);
    }
  }
}

export {
  deleteUnresolvedPlacementAttempt,
  persistUnresolvedPlacementAttempt,
  reconcilePlacementAttempts,
};
