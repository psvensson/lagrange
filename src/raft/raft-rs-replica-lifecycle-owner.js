import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import {
  RAFT_OPERATION_OUTCOME,
} from './raft-operation-port-constants.js';
import {
  COMMITTED_MEMBERSHIP_REFUSAL,
} from './raft-committed-membership-constants.js';
import {commitDurably, RaftRsDurableStore} from './raft-rs-durable-store.js';
import {pendingTurn, settledTurn, turnChainValue} from './raft-rs-turn-answer.js';
import {RAFT_RS_TABLE} from './raft-rs-durable-store-constants.js';
import {RAFT_RS_OPENING_HISTORY, RAFT_RS_OPENING_HISTORY_ERROR} from
  './raft-rs-opening-history-constants.js';
import {LIFECYCLE_ERROR, LIFECYCLE_STATE, REPLICA_LIFECYCLE_TABLE} from
  './raft-rs-replica-lifecycle-constants.js';
import {ORIGINAL_ALLOCATION as ORIGINAL, ORIGINAL_ALLOCATION_REASON as ORIGINAL_REASON,
  ORIGINAL_ALLOCATION_COLUMN as ORIGINAL_COLUMN, ORIGINAL_RIGHT_SUCCESSOR,
  originalAllocationError} from './raft-rs-original-allocation-constants.js';

const SNAPSHOT_RECEIVER_REASON = Object.freeze({
  FRESH: 'snapshot-receiver-fresh',
  HISTORY: 'snapshot-receiver-history-present',
  IDENTITY: 'snapshot-receiver-identity-mismatch',
  UNAVAILABLE: 'snapshot-receiver-unavailable',
  JOURNAL: 'snapshot-receiver-journal-pending',
  STAGING: 'snapshot-receiver-staging-mismatch',
});
const SNAPSHOT_RECEIVER_JOURNALS = Object.freeze(['-wal', '-journal']);
const FILE_ABSENT_CODE = 'ENOENT';

// Columns added after the table first shipped (`incarnation` minted once at
// birth; `retirement_evidence` recorded on group retirement).
const LIFECYCLE_ADDED_COLUMNS = Object.freeze(['incarnation',
  'retirement_evidence', 'native_history_state']);
// Process-local registry keyed by exact opened runtime (never logical name).
// Durable lifecycle row in SQLite is the persistent recovery authority.
const RUNTIME_LIFECYCLE_OWNERS = new WeakMap();
const LIFECYCLE_ADMIN_OUTCOME = Object.freeze({NOT_MANAGED: 'NOT_MANAGED'});
const LIFECYCLE_CLAIM_REFUSED = 'REPLICA_LIFECYCLE_CLAIM_REFUSED';
const LIFECYCLE_REASON = Object.freeze({
  MISSING: 'lifecycle-record-missing',
  ACTIVE: 'lifecycle-active',
  CLAIM_SETTLED: 'lifecycle-claim-settled',
  OBSERVATION_UNAVAILABLE: 'lifecycle-observation-unavailable',
  STAGING_PREPARED: 'snapshot-lifecycle-prepared',
  ORIGINAL_PREPARED: 'original-allocation-lifecycle-prepared',
  ORIGINAL_ROW_PRESENT: 'original-allocation-lifecycle-row-present',
  IDENTITY_MISMATCH: 'lifecycle-identity-mismatch',
  RETIRED: 'retired',
  STALE_RUNTIME_GENERATION: 'runtime-generation-not-registered',
  // A replica whose own history was proven lost while it ran (owner decision
  // O4): retired with this reason, it is refused with it, also after a
  // restart.
  RESEED_REQUIRED: COMMITTED_MEMBERSHIP_REFUSAL.RESEED_REQUIRED,
});

// The refusal a retired row answers: a reseed hold keeps its own reason.
function retiredRefusalReason(reason) {
  return reason === LIFECYCLE_REASON.RESEED_REQUIRED ?
    LIFECYCLE_REASON.RESEED_REQUIRED : LIFECYCLE_REASON.RETIRED;
}

function frozenResult(outcome, reason, detail = null) {
  return Object.freeze({outcome, reason, detail});
}

// An older table gains the columns added since it was created.
function addMissingLifecycleColumns(db) {
  const present = new Set(db.prepare(`PRAGMA table_info(${REPLICA_LIFECYCLE_TABLE})`)
    .all().map((column) => column.name));
  for (const column of LIFECYCLE_ADDED_COLUMNS) {
    if (!present.has(column)) {
      db.exec(`ALTER TABLE ${REPLICA_LIFECYCLE_TABLE} ADD COLUMN ${column} TEXT`);
    }
  }
}

// The one table definition; an older table gains the columns added since.
function ensureLifecycleTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${REPLICA_LIFECYCLE_TABLE} (
      group_id TEXT NOT NULL,
      peer_id TEXT NOT NULL,
      replica_identity TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('active', 'retired')),
      reason TEXT,
      changed_at TEXT NOT NULL,
      incarnation TEXT,
      retirement_evidence TEXT,
      native_history_state TEXT,
      PRIMARY KEY (group_id, peer_id),
      UNIQUE (group_id, replica_identity)
    )
  `);
  addMissingLifecycleColumns(db);
}

// The row holding either half of this replica's identity in its group.
function lifecycleIdentityRow(db, {groupId, peerId, replicaIdentity}) {
  return db.prepare(`
    SELECT peer_id, replica_identity, state, reason
    FROM ${REPLICA_LIFECYCLE_TABLE}
    WHERE group_id = ? AND (peer_id = ? OR replica_identity = ?)
  `).get(groupId, peerId, replicaIdentity);
}

// A row born before the stamp existed gets one, once: the update never
// replaces a stamp.
function stampUnstampedRow(db, {groupId, peerId}, incarnation) {
  db.prepare(`
    UPDATE ${REPLICA_LIFECYCLE_TABLE} SET incarnation = ?
    WHERE group_id = ? AND peer_id = ? AND incarnation IS NULL
  `).run(incarnation, groupId, peerId);
}

function hasDurableRaftRecord(db, groupId) {
  const raftTables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name IN (
      '_raft_rs_log', '_raft_rs_hard_state', '_raft_rs_applied_state'
    )
  `).all().map((entry) => entry.name);
  return raftTables.some((table) =>
    db.prepare(`SELECT 1 FROM ${table} WHERE group_id = ? LIMIT 1`)
      .get(groupId) !== undefined);
}

// Open (birth, when absent) one replica's row. The stamp a birth or an
// unstamped row receives is this owner's: its constructor's randomUUID, or the
// receiver incarnation a snapshot staging retains. No caller passes a mint.
// Frozen {outcome, reason, detail: the row's lifecycle state, null if none}.
function openLifecycleRecord(db, identity, incarnation) {
  const {groupId, peerId, replicaIdentity} = identity;
  ensureLifecycleTable(db);
  const row = lifecycleIdentityRow(db, identity);
  if (row === undefined && hasDurableRaftRecord(db, groupId)) {
    return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED, LIFECYCLE_REASON.MISSING);
  }
  if (row === undefined) {
    db.prepare(`
      INSERT INTO ${REPLICA_LIFECYCLE_TABLE}
        (group_id, peer_id, replica_identity, state, reason, changed_at,
          incarnation, native_history_state)
      VALUES (?, ?, ?, 'active', NULL, ?, ?, ?)
    `).run(groupId, peerId, replicaIdentity, new Date().toISOString(),
      incarnation, RAFT_RS_OPENING_HISTORY.NEVER_OPENED);
    return frozenResult(RAFT_OPERATION_OUTCOME.CORE_OK, LIFECYCLE_REASON.ACTIVE,
      LIFECYCLE_STATE.ACTIVE);
  }
  if (row.peer_id !== peerId || row.replica_identity !== replicaIdentity) {
    return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED,
      LIFECYCLE_REASON.IDENTITY_MISMATCH);
  }
  stampUnstampedRow(db, identity, incarnation);
  return row.state === LIFECYCLE_STATE.RETIRED ?
    frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED, retiredRefusalReason(row.reason),
      row.state) :
    frozenResult(RAFT_OPERATION_OUTCOME.CORE_OK, LIFECYCLE_REASON.ACTIVE, row.state);
}

class RaftRsReplicaLifecycleOwner {
  #db;
  #groupId;
  #peerId;
  #replicaIdentity;
  #state;
  #refusalReason = null;
  #retiring = false;
  #activeCount = 0;
  #waiters = [];

  constructor({db, groupId, peerId, replicaIdentity}) {
    this.#db = db;
    this.#groupId = groupId;
    this.#peerId = peerId;
    this.#replicaIdentity = replicaIdentity;
    const opened = openLifecycleRecord(db, {groupId, peerId, replicaIdentity},
      randomUUID());
    this.#state = opened.detail;
    this.#refusalReason = opened.outcome === RAFT_OPERATION_OUTCOME.CORE_OK ?
      null : opened.reason;
  }

  get groupId() {
    return this.#groupId;
  }

  get replicaIdentity() {
    return this.#replicaIdentity;
  }

  get incarnation() {
    const row = this.#db.prepare(`
      SELECT incarnation FROM ${REPLICA_LIFECYCLE_TABLE}
      WHERE group_id = ? AND peer_id = ? AND replica_identity = ?
    `).get(this.#groupId, this.#peerId, this.#replicaIdentity);
    return typeof row?.incarnation === 'string' ? row.incarnation : null;
  }

  /**
   * Read the monotonic opening fact of exactly the admitted incarnation.
   * Missing/changed identity and invalid persisted values never mean fresh.
   * @param {string} incarnation - The port's captured lifecycle identity.
   * @return {string} Owner-defined opening history state.
   */
  openingHistory(incarnation) {
    const row = this.#db.prepare(`
      SELECT native_history_state FROM ${REPLICA_LIFECYCLE_TABLE}
      WHERE group_id = ? AND peer_id = ? AND replica_identity = ?
        AND incarnation = ? AND state = 'active'
    `).get(this.#groupId, this.#peerId, this.#replicaIdentity, incarnation);
    if (row === undefined) {
      throw new Error(RAFT_RS_OPENING_HISTORY_ERROR.IDENTITY_CHANGED);
    }
    const value = row.native_history_state;
    if (value === null) return RAFT_RS_OPENING_HISTORY.UNKNOWN;
    if (value !== RAFT_RS_OPENING_HISTORY.NEVER_OPENED &&
        value !== RAFT_RS_OPENING_HISTORY.ESTABLISHED) {
      throw new Error(RAFT_RS_OPENING_HISTORY_ERROR.INVALID_STATE);
    }
    return value;
  }

  /**
   * Record establishment inside the existing store's synced transaction.
   * The runtime orders this atomically with fresh bootstrap before publishing
   * a port; for an intact legacy record it runs before native reconstruction.
   * @param {string} incarnation - Exact captured identity, never current-name lookup.
   */
  recordOpeningHistory(incarnation) {
    if (!this.#db.inTransaction) {
      throw new Error(RAFT_RS_OPENING_HISTORY_ERROR.TRANSACTION_REQUIRED);
    }
    // Validate the predecessor even on an idempotent update. No missing row
    // or invalid state is promoted to an established incarnation.
    this.openingHistory(incarnation);
    const result = this.#db.prepare(`
      UPDATE ${REPLICA_LIFECYCLE_TABLE} SET native_history_state = ?
      WHERE group_id = ? AND peer_id = ? AND replica_identity = ?
        AND incarnation = ? AND state = 'active'
    `).run(RAFT_RS_OPENING_HISTORY.ESTABLISHED, this.#groupId,
      this.#peerId, this.#replicaIdentity, incarnation);
    if (result.changes !== 1) {
      throw new Error(RAFT_RS_OPENING_HISTORY_ERROR.IDENTITY_CHANGED);
    }
  }

  get active() {
    return this.#state === LIFECYCLE_STATE.ACTIVE && !this.#retiring;
  }

  admission() {
    return this.active ?
      frozenResult(RAFT_OPERATION_OUTCOME.CORE_OK, LIFECYCLE_REASON.ACTIVE) :
      frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED,
        this.#refusalReason || LIFECYCLE_REASON.RETIRED);
  }

  /**
   * Admit one turn against retirement; holds replica while turn is active.
   * @param {function(): Object} work - The admitted work; answers a turn.
   * @return {Object} The work's turn, or the settled refusal.
   */
  execute(work) {
    const admission = this.admission();
    if (admission.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) {
      return settledTurn(admission);
    }
    this.#activeCount += 1;
    let answered;
    try {
      answered = work();
    } catch (error) {
      this.#release();
      throw error;
    }
    if (!answered.settled) {
      return pendingTurn(answered.pending.finally(() => this.#release()));
    }
    this.#release();
    return answered;
  }

  /**
   * Retire this replica generation durably.
   * @param {string} reason - Why its logical identity is terminal.
   * @param {Object|null} [evidence] - Verified group-retirement evidence.
   * @return {Promise<Object>} Frozen outcome.
   */
  async retire(reason, evidence = null) {
    if (this.#state === LIFECYCLE_STATE.RETIRED) {
      return frozenResult(
        RAFT_OPERATION_OUTCOME.CORE_REFUSED, LIFECYCLE_REASON.RETIRED);
    }
    if (this.#state !== LIFECYCLE_STATE.ACTIVE) {
      return frozenResult(
        RAFT_OPERATION_OUTCOME.CORE_REFUSED, this.#refusalReason);
    }
    this.#retiring = true;
    if (this.#activeCount > 0) {
      await new Promise((resolve) => this.#waiters.push(resolve));
    }
    if (this.#state !== LIFECYCLE_STATE.ACTIVE) {
      return frozenResult(
        RAFT_OPERATION_OUTCOME.CORE_REFUSED, this.#refusalReason);
    }
    this.#writeRetired(String(reason || LIFECYCLE_REASON.RETIRED), evidence);
    this.#state = LIFECYCLE_STATE.RETIRED;
    this.#refusalReason = LIFECYCLE_REASON.RETIRED;
    return frozenResult(
      RAFT_OPERATION_OUTCOME.CORE_OK, LIFECYCLE_REASON.RETIRED);
  }

  /**
   * Hold this replica for a reseed, durably and at once.
   * @return {Object} Frozen outcome.
   */
  holdForReseed() {
    if (this.#state !== LIFECYCLE_STATE.ACTIVE) {
      return frozenResult(
        RAFT_OPERATION_OUTCOME.CORE_REFUSED, this.#refusalReason);
    }
    this.#writeRetired(LIFECYCLE_REASON.RESEED_REQUIRED, null);
    this.#state = LIFECYCLE_STATE.RETIRED;
    this.#refusalReason = LIFECYCLE_REASON.RESEED_REQUIRED;
    return frozenResult(
      RAFT_OPERATION_OUTCOME.CORE_OK, LIFECYCLE_REASON.RESEED_REQUIRED);
  }

  #writeRetired(reason, evidence = null) {
    commitDurably(this.#db, () => this.#db.prepare(`
      UPDATE ${REPLICA_LIFECYCLE_TABLE}
      SET state = 'retired', reason = ?, changed_at = ?,
        retirement_evidence = ?
      WHERE group_id = ? AND peer_id = ? AND replica_identity = ?
    `).run(reason, new Date().toISOString(),
      evidence ? JSON.stringify(evidence) : null,
      this.#groupId, this.#peerId, this.#replicaIdentity));
  }

  #release() {
    this.#activeCount -= 1;
    if (this.#activeCount === 0) {
      const waiters = this.#waiters.splice(0);
      for (const resolve of waiters) {
        resolve();
      }
    }
  }
}

/**
 * Prepare receiver-local lifecycle record in a validated snapshot's staging DB.
 * @param {Object} request - {db, groupId, peerId, replicaIdentity}.
 * @return {Object} Immutable lifecycle outcome, never install permission.
 */
function prepareReplicaLifecycleForSnapshot(request) {
  const retained = request.receiverIncarnation ?? null;
  const {db, groupId, peerId, replicaIdentity} = request;
  if (retained !== null) {
    openLifecycleRecord(db, {groupId, peerId, replicaIdentity}, String(retained));
  }
  const owner = new RaftRsReplicaLifecycleOwner({db, groupId, peerId, replicaIdentity});
  return turnChainValue(owner.execute(() => {
    const incarnation = owner.incarnation;
    if (retained !== null && retained !== incarnation) {
      return settledTurn(frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED,
        LIFECYCLE_REASON.IDENTITY_MISMATCH));
    }
    commitDurably(request.db, () => owner.recordOpeningHistory(incarnation));
    return settledTurn(frozenResult(RAFT_OPERATION_OUTCOME.CORE_OK,
      LIFECYCLE_REASON.STAGING_PREPARED, Object.freeze({incarnation})));
  }));
}

/**
 * Birth the lifecycle row of one founder of an original seed allocation.
 * @param {Object} request - {db, groupId, peerId, replicaIdentity}.
 * @return {Object} Frozen {outcome, reason, detail: {incarnation}|null}.
 */
function prepareReplicaLifecycleForOriginalAllocation(request) {
  const {db, groupId, peerId, replicaIdentity} = request;
  if (!db.inTransaction) {
    throw new Error(LIFECYCLE_ERROR.TRANSACTION_REQUIRED);
  }
  const identity = {groupId, peerId, replicaIdentity};
  ensureLifecycleTable(db);
  if (lifecycleIdentityRow(db, identity) !== undefined) {
    return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED,
      LIFECYCLE_REASON.ORIGINAL_ROW_PRESENT);
  }
  // Only the identity reaches the owner: its own mint stamps the row.
  const owner = new RaftRsReplicaLifecycleOwner({db, ...identity});
  const admission = owner.admission();
  if (admission.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) return admission;
  return frozenResult(RAFT_OPERATION_OUTCOME.CORE_OK,
    LIFECYCLE_REASON.ORIGINAL_PREPARED,
    Object.freeze({incarnation: owner.incarnation}));
}

// Original seed allocation (owner decision 2026-10-26, Q3): the five
// allocation columns and the two original rights are fields of a founder's
// row, and this owner is their only writer. Only the original issuer formats
// the optional columns; other readers never migrate a file to find a grant.
const ORIGINAL_COLUMNS = Object.freeze(Object.values(ORIGINAL_COLUMN));
const ORIGINAL_ROW_FIELDS = Object.freeze(['state', 'incarnation',
  'native_history_state', ...ORIGINAL_COLUMNS]);
const SQL_LIST_SEPARATOR = ', ';

function lifecycleColumns(db) {
  return new Set(db.prepare(`PRAGMA table_info(${REPLICA_LIFECYCLE_TABLE})`).all()
    .map(({name}) => name));
}

// Exactly this member's active row by named columns; one the file does not
// have yet reads null. A missing or changed identity is a typed HOLD.
function exactOriginalRow(db, member) {
  const present = lifecycleColumns(db);
  const [stateField, ...optional] = ORIGINAL_ROW_FIELDS;
  const row = db.prepare(`SELECT ${[stateField, ...optional.filter((field) =>
    present.has(field))].join(SQL_LIST_SEPARATOR)} FROM ${REPLICA_LIFECYCLE_TABLE}
    WHERE group_id = ? AND peer_id = ? AND replica_identity = ?`)
    .get(member.groupId, member.peerId, member.replicaId);
  if (row?.incarnation !== member.incarnation || row?.state !== LIFECYCLE_STATE.ACTIVE) {
    throw originalAllocationError(ORIGINAL_REASON.IDENTITY, member.replicaId);
  }
  return Object.freeze(Object.fromEntries(ORIGINAL_ROW_FIELDS.map((field) =>
    [field, row[field] ?? null])));
}

/**
 * Read one founder's original-allocation row: exact active identity, the
 * declaration and member columns present, the member column equal to this
 * member. Named columns only; never a write or a migration.
 * @param {Object} request - {db, member}.
 * @return {Object} Frozen row fields; a typed HOLD otherwise.
 */
function readOriginalAllocationRow({db, member}) {
  const row = exactOriginalRow(db, member);
  if (typeof row[ORIGINAL_COLUMN.DECLARATION] !== 'string' ||
      typeof row[ORIGINAL_COLUMN.MEMBER] !== 'string') {
    throw originalAllocationError(ORIGINAL_REASON.INCOMPLETE, member.replicaId);
  }
  if (row[ORIGINAL_COLUMN.MEMBER] !== JSON.stringify(member)) {
    throw originalAllocationError(ORIGINAL_REASON.IDENTITY, member.replicaId);
  }
  return row;
}

/**
 * Read the declaration an anchor row carries, without creating or migrating
 * anything: ABSENT for no table, column, row or declaration; else PRESENT
 * with the parsed declaration and the anchor's issue state.
 * @param {Object} request - {db, groupId, replicaIdentity}.
 * @return {Object} Frozen {state, declaration?, issue?}.
 */
function readOriginalAllocationDeclaration({db, groupId, replicaIdentity}) {
  const present = lifecycleColumns(db);
  const row = !present.has(ORIGINAL_COLUMN.DECLARATION) ? undefined : db.prepare(`
    SELECT ${ORIGINAL_COLUMN.DECLARATION}, ${ORIGINAL_COLUMN.ISSUE}
    FROM ${REPLICA_LIFECYCLE_TABLE} WHERE group_id = ? AND replica_identity = ?`)
    .get(groupId, replicaIdentity);
  return row?.[ORIGINAL_COLUMN.DECLARATION] == null ?
    Object.freeze({state: ORIGINAL.ABSENT}) : Object.freeze({state: ORIGINAL.PRESENT,
      declaration: JSON.parse(row[ORIGINAL_COLUMN.DECLARATION]),
      issue: row[ORIGINAL_COLUMN.ISSUE]});
}

// Commit one allocation write, then decide only on an exact committed
// readback. A throw after a successful COMMIT included: an unknown answer is
// never absence and never permission to repeat a native or registration
// effect, and a matching uncommitted row cannot resolve a refused commit.
function commitOriginalWrite(db, member, write, expected) {
  let commitFailure;
  try {
    commitDurably(db, write);
  } catch (error) {
    commitFailure = error;
  }
  try {
    if (db.inTransaction) throw originalAllocationError(ORIGINAL_REASON.OBSERVATION);
    if (!expected(readOriginalAllocationRow({db, member}))) {
      throw originalAllocationError(ORIGINAL_REASON.INCOMPLETE);
    }
  } catch (error) {
    if (commitFailure) {
      throw new AggregateError([commitFailure, error], ORIGINAL_REASON.OBSERVATION);
    }
    throw error;
  }
}

function hasOriginalFields(row, fields) {
  return Object.entries(fields).every(([field, value]) => row[field] === value);
}

/**
 * Format the allocation columns (current schema: one ALTER per missing
 * column) and write a born NEVER_OPENED founder's declaration, member, issue
 * PREPARING and UNUSED rights (the identity right only on the anchor).
 * @param {Object} request - {db, declaration, member}.
 */
function prepareOriginalAllocationRow({db, declaration, member}) {
  const present = lifecycleColumns(db);
  for (const column of ORIGINAL_COLUMNS) {
    if (!present.has(column)) {
      db.exec(`ALTER TABLE ${REPLICA_LIFECYCLE_TABLE} ADD COLUMN ${column} TEXT`);
    }
  }
  const before = exactOriginalRow(db, member);
  if (before.native_history_state !== RAFT_RS_OPENING_HISTORY.NEVER_OPENED ||
      ORIGINAL_COLUMNS.some((column) => before[column] !== null)) {
    throw originalAllocationError(ORIGINAL_REASON.IDENTITY, member.replicaId);
  }
  const fields = {[ORIGINAL_COLUMN.DECLARATION]: JSON.stringify(declaration),
    [ORIGINAL_COLUMN.MEMBER]: JSON.stringify(member),
    [ORIGINAL_COLUMN.ISSUE]: ORIGINAL.PREPARING,
    [ORIGINAL_COLUMN.SERVICE_RIGHT]: ORIGINAL.UNUSED,
    [ORIGINAL_COLUMN.IDENTITY_RIGHT]: member.replicaId === declaration.anchorReplicaId ?
      ORIGINAL.UNUSED : null,
    native_history_state: RAFT_RS_OPENING_HISTORY.NEVER_OPENED};
  commitOriginalWrite(db, member, () => db.prepare(`UPDATE ${REPLICA_LIFECYCLE_TABLE}
    SET ${ORIGINAL_COLUMNS.map((column) => `${column} = ?`).join(SQL_LIST_SEPARATOR)}
    WHERE group_id = ? AND peer_id = ? AND replica_identity = ?
      AND incarnation = ? AND state = 'active'
      AND ${ORIGINAL_COLUMN.DECLARATION} IS NULL`)
    .run(...ORIGINAL_COLUMNS.map((column) => fields[column]),
      member.groupId, member.peerId, member.replicaId, member.incarnation),
  (row) => hasOriginalFields(row, fields));
}

/**
 * Issue the allocation on its anchor: one compare-and-swap PREPARING ->
 * ISSUED of exactly this declaration and member, NEVER_OPENED, both rights
 * UNUSED. Anything else changes nothing and is a typed HOLD.
 * @param {Object} request - {db, declaration, anchor}.
 */
function markOriginalAllocationIssued({db, declaration, anchor}) {
  if (anchor.replicaId !== declaration.anchorReplicaId) {
    throw originalAllocationError(ORIGINAL_REASON.IDENTITY, anchor.replicaId);
  }
  const declarationText = JSON.stringify(declaration);
  commitOriginalWrite(db, anchor, () => db.prepare(`UPDATE ${REPLICA_LIFECYCLE_TABLE}
    SET ${ORIGINAL_COLUMN.ISSUE} = ? WHERE group_id = ? AND peer_id = ?
      AND replica_identity = ? AND incarnation = ? AND state = 'active'
      AND ${ORIGINAL_COLUMN.DECLARATION} = ? AND ${ORIGINAL_COLUMN.MEMBER} = ?
      AND ${ORIGINAL_COLUMN.ISSUE} = ? AND native_history_state = ?
      AND ${ORIGINAL_COLUMN.IDENTITY_RIGHT} = ? AND ${ORIGINAL_COLUMN.SERVICE_RIGHT} = ?`)
    .run(ORIGINAL.ISSUED, anchor.groupId, anchor.peerId, anchor.replicaId,
      anchor.incarnation, declarationText, JSON.stringify(anchor), ORIGINAL.PREPARING,
      RAFT_RS_OPENING_HISTORY.NEVER_OPENED, ORIGINAL.UNUSED, ORIGINAL.UNUSED),
  (row) => hasOriginalFields(row, {[ORIGINAL_COLUMN.DECLARATION]: declarationText,
    [ORIGINAL_COLUMN.ISSUE]: ORIGINAL.ISSUED,
    native_history_state: RAFT_RS_OPENING_HISTORY.NEVER_OPENED,
    [ORIGINAL_COLUMN.IDENTITY_RIGHT]: ORIGINAL.UNUSED,
    [ORIGINAL_COLUMN.SERVICE_RIGHT]: ORIGINAL.UNUSED}));
}

/**
 * Move one original right of exactly this member one step: UNUSED ->
 * SUBMITTED -> TRANSFERRED, nothing else (never back to UNUSED, never past
 * TRANSFERRED). Typed HOLD refusals, each without a write: IDENTITY (not a
 * right column, or not this exact active member), TRANSITION (not a
 * permitted step), SPENT (the right is not at `from`). A lost answer is
 * resolved by the exact readback, never by a reset.
 * @param {Object} request - {db, member, right, from, to}.
 */
function transitionOriginalRight({db, member, right, from, to}) {
  if (right !== ORIGINAL_COLUMN.SERVICE_RIGHT && right !== ORIGINAL_COLUMN.IDENTITY_RIGHT) {
    throw originalAllocationError(ORIGINAL_REASON.IDENTITY, member.replicaId);
  }
  if (!Object.hasOwn(ORIGINAL_RIGHT_SUCCESSOR, from) ||
      ORIGINAL_RIGHT_SUCCESSOR[from] !== to) {
    throw originalAllocationError(ORIGINAL_REASON.TRANSITION, member.replicaId);
  }
  const before = readOriginalAllocationRow({db, member});
  if (before[right] !== from) {
    throw originalAllocationError(ORIGINAL_REASON.SPENT, member.replicaId);
  }
  const declarationText = before[ORIGINAL_COLUMN.DECLARATION];
  commitOriginalWrite(db, member, () => db.prepare(`UPDATE ${REPLICA_LIFECYCLE_TABLE}
    SET ${right} = ? WHERE group_id = ? AND peer_id = ? AND replica_identity = ?
      AND incarnation = ? AND state = 'active' AND ${right} = ?
      AND ${ORIGINAL_COLUMN.DECLARATION} = ? AND ${ORIGINAL_COLUMN.MEMBER} = ?`)
    .run(to, member.groupId, member.peerId, member.replicaId, member.incarnation, from,
      declarationText, before[ORIGINAL_COLUMN.MEMBER]),
  (row) => hasOriginalFields(row, {[right]: to,
    [ORIGINAL_COLUMN.DECLARATION]: declarationText}));
}

// The receiver's one lifecycle row names another group, peer or replica, or
// carries no incarnation.
function receiverRowIdentityMismatch(row, request) {
  return row.group_id !== request.groupId ||
    row.peer_id !== request.peerId || row.replica_identity !== request.replicaIdentity ||
    typeof row.incarnation !== 'string' || row.incarnation.length === 0;
}

function snapshotEstablishedReceiver(db, request, incarnation) {
  if (!RaftRsDurableStore.hasDurableRecordIn(db, request.groupId)) {
    return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED, SNAPSHOT_RECEIVER_REASON.HISTORY);
  }
  RaftRsDurableStore.readRetainedHistoryIn(db, request.groupId);
  const record = RaftRsDurableStore.readDurableRecordIn(db, request.groupId);
  const snapIndex = BigInt(request.snapshotAppliedIndex ?? '0');
  if (record.bootstrapIndex === null || record.hardState === null ||
      BigInt(record.appliedIndex) > snapIndex || BigInt(record.hardState.commit) > snapIndex) {
    return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED, SNAPSHOT_RECEIVER_REASON.HISTORY);
  }
  return frozenResult(RAFT_OPERATION_OUTCOME.CORE_OK, SNAPSHOT_RECEIVER_REASON.FRESH,
    Object.freeze({incarnation, bootstrapIndex: record.bootstrapIndex,
      admissionIndex: record.admissionIndex, hardState: Object.freeze({...record.hardState}),
      appliedIndex: record.appliedIndex}));
}

function hasFreshReceiverConsensusRows(db, tables) {
  return Object.values(RAFT_RS_TABLE).some((table) =>
    tables.includes(table) &&
    Boolean(db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get()));
}

function validateReceiverLifecycleRow(row, request, imported) {
  if (receiverRowIdentityMismatch(row, request)) {
    return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED, SNAPSHOT_RECEIVER_REASON.IDENTITY);
  }
  if (row.state !== LIFECYCLE_STATE.ACTIVE) {
    return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED, retiredRefusalReason(row.reason));
  }
  const required = imported ? RAFT_RS_OPENING_HISTORY.ESTABLISHED :
    RAFT_RS_OPENING_HISTORY.NEVER_OPENED;
  if (row.native_history_state !== required) {
    return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED, SNAPSHOT_RECEIVER_REASON.HISTORY);
  }
}

// A native FRESH_CREATE cannot replace established receiver history. Reseed or
// live catchup needs its own existing authority; a valid checkpoint is not it.
function snapshotReceiverRow(db, request, imported, readEstablished = false) {
  const names = [REPLICA_LIFECYCLE_TABLE, ...Object.values(RAFT_RS_TABLE)];
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'
    AND name IN (${names.map(() => '?').join(',')})`).all(...names)
    .map(({name}) => name);
  if (!imported && hasFreshReceiverConsensusRows(db, tables)) {
    return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED, SNAPSHOT_RECEIVER_REASON.HISTORY);
  }
  const rows = tables.includes(REPLICA_LIFECYCLE_TABLE) ?
    db.prepare(`SELECT * FROM ${REPLICA_LIFECYCLE_TABLE} LIMIT 2`).all() : [];
  if (rows.length === 0 && !imported) return snapshotReceiverFresh(null);
  if (rows.length !== 1) {
    return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED, SNAPSHOT_RECEIVER_REASON.IDENTITY);
  }
  const row = rows[0];
  const refused = validateReceiverLifecycleRow(row, request, imported);
  if (refused) return refused;
  return readEstablished ? snapshotEstablishedReceiver(db, request, row.incarnation) :
    snapshotReceiverFresh(row.incarnation);
}

function snapshotReceiverFresh(incarnation) {
  return frozenResult(RAFT_OPERATION_OUTCOME.CORE_OK, SNAPSHOT_RECEIVER_REASON.FRESH,
    Object.freeze({incarnation}));
}

function snapshotFileStat(file) {
  try {
    return fs.lstatSync(file);
  } catch (error) {
    if (error.code === FILE_ABSENT_CODE) return null;
    throw error;
  }
}

function inspectSnapshotLifecycleFile(file, request, imported = false, readEstablished = false) {
  // Never discard uncheckpointed receiver bytes. A read-only SQLite handle is
  // not proof that another writer has relinquished the required closed boundary.
  for (const suffix of SNAPSHOT_RECEIVER_JOURNALS) {
    const journal = snapshotFileStat(`${file}${suffix}`);
    if (journal && (!journal.isFile() || journal.size > 0)) {
      return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED, SNAPSHOT_RECEIVER_REASON.JOURNAL);
    }
  }
  const stat = snapshotFileStat(file);
  if (!stat && !imported) return snapshotReceiverFresh(null);
  if (!stat?.isFile()) {
    return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED, SNAPSHOT_RECEIVER_REASON.UNAVAILABLE);
  }
  const db = new Database(file, {readonly: true, fileMustExist: true});
  try {
    return snapshotReceiverRow(db, request, imported, readEstablished);
  } finally {
    db.close();
  }
}

/** Read receiver facts, without creating or migrating lifecycle/native state.
 * A caller must re-read before swap; this result is not durable permission.
 * @param {Object} request - Exact identity, receiverDbPath and optional stagedDbPath.
 * @return {Object} Frozen fresh-receiver/incarnation result or typed refusal.
 */
function inspectReplicaLifecycleForSnapshot(request) {
  try {
    const established = request.allowEstablishedReceiver === true;
    const receiver = inspectSnapshotLifecycleFile(
      request.receiverDbPath, request, established, established);
    if (receiver.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK || !request.stagedDbPath) {
      return receiver;
    }
    const staged = inspectSnapshotLifecycleFile(request.stagedDbPath, request, true);
    if (staged.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK ||
        receiver.detail.incarnation !== null &&
        receiver.detail.incarnation !== staged.detail.incarnation) {
      return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED, SNAPSHOT_RECEIVER_REASON.STAGING);
    }
    return receiver;
  } catch (_error) {
    return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED, SNAPSHOT_RECEIVER_REASON.UNAVAILABLE);
  }
}

/**
 * Register one opened runtime's lifecycle owner under that exact runtime.
 * @param {Object} runtime - The operation port the generation opened.
 * @param {RaftRsReplicaLifecycleOwner} owner
 */
function registerRuntimeLifecycle(runtime, owner) {
  RUNTIME_LIFECYCLE_OWNERS.set(runtime, owner);
}

/**
 * Remove exactly this runtime's own entry; a different owner registered for
 * the same runtime handle is never removed.
 * @param {Object} runtime
 * @param {RaftRsReplicaLifecycleOwner} owner
 */
function unregisterRuntimeLifecycle(runtime, owner) {
  if (RUNTIME_LIFECYCLE_OWNERS.get(runtime) === owner) {
    RUNTIME_LIFECYCLE_OWNERS.delete(runtime);
  }
}

/**
 * Retire the exact runtime generation the caller owns (never by logical name).
 * @param {Object} request - {runtime, groupId, replicaIdentity, reason, evidence}.
 * @return {Promise<Object>} Frozen outcome.
 */
async function retireReplicaLifecycle({runtime, groupId, replicaIdentity,
  reason, evidence = null}) {
  const owner = runtime ? RUNTIME_LIFECYCLE_OWNERS.get(runtime) : undefined;
  if (!owner) {
    return frozenResult(
      LIFECYCLE_ADMIN_OUTCOME.NOT_MANAGED,
      LIFECYCLE_REASON.STALE_RUNTIME_GENERATION,
    );
  }
  if (owner.groupId !== groupId || owner.replicaIdentity !== replicaIdentity) {
    return frozenResult(
      RAFT_OPERATION_OUTCOME.CORE_REFUSED,
      LIFECYCLE_REASON.IDENTITY_MISMATCH,
    );
  }
  return owner.retire(reason, evidence);
}


function lifecycleClaimError(lifecycle, cause = undefined) {
  return Object.assign(new Error(LIFECYCLE_CLAIM_REFUSED,
    cause === undefined ? undefined : {cause}), {
    code: LIFECYCLE_CLAIM_REFUSED,
    lifecycle,
  });
}

function requireClaimGeneration(request, capturedOwner = null) {
  const owner = RUNTIME_LIFECYCLE_OWNERS.get(request.runtime);
  if (!owner || (capturedOwner !== null && owner !== capturedOwner)) {
    throw lifecycleClaimError(frozenResult(LIFECYCLE_ADMIN_OUTCOME.NOT_MANAGED,
      LIFECYCLE_REASON.STALE_RUNTIME_GENERATION));
  }
  if (owner.groupId !== request.groupId || owner.replicaIdentity !== request.replicaIdentity ||
      typeof request.incarnation !== 'string' || request.incarnation.length === 0) {
    throw lifecycleClaimError(frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED,
      LIFECYCLE_REASON.IDENTITY_MISMATCH));
  }
  let incarnation;
  try {
    incarnation = owner.incarnation;
  } catch (cause) {
    throw lifecycleClaimError(frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED,
      LIFECYCLE_REASON.OBSERVATION_UNAVAILABLE), cause);
  }
  if (incarnation !== request.incarnation) {
    throw lifecycleClaimError(frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED,
      LIFECYCLE_REASON.IDENTITY_MISMATCH));
  }
  const admission = owner.admission();
  if (admission.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) {
    throw lifecycleClaimError(admission);
  }
  return owner;
}

/**
 * Hold the existing exact-runtime active-count claim across one handoff effect.
 * The callback can recheck the same owner after awaits; neither the raw owner
 * nor a current-logical-name lookup crosses this boundary. Retirement closes
 * subsequent effect admission immediately, while already admitted work settles.
 * @param {Object} request Exact runtime, group, replica and durable incarnation.
 * @param {Function} work One awaited owner interaction, receiving assertCurrent.
 * @return {Promise<*>} The work's value; refusal throws its owned lifecycle answer.
 */
async function withReplicaLifecycleClaim(request, work) {
  // Capture caller fields once, so mutation during an await cannot retarget the
  // claim or the later currentness checks to a replacement runtime.
  const captured = Object.freeze({runtime: request?.runtime, groupId: request?.groupId,
    replicaIdentity: request?.replicaIdentity, incarnation: request?.incarnation});
  const owner = requireClaimGeneration(captured);
  const claimed = owner.execute(() => {
    let settled = false;
    const assertCurrent = Object.freeze(() => {
      if (settled) {
        throw lifecycleClaimError(frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED,
          LIFECYCLE_REASON.CLAIM_SETTLED));
      }
      requireClaimGeneration(captured, owner);
    });
    try {
      assertCurrent();
      return pendingTurn(Promise.resolve(work(assertCurrent)).finally(() => {
        settled = true;
      }));
    } catch (error) {
      settled = true;
      throw error;
    }
  });
  // An admitted claim is pending until its work settles; a refused admission
  // never entered and is settled with the refusal.
  if (claimed.settled) throw lifecycleClaimError(claimed.result);
  return claimed.pending;
}

// What a read of a replica database's lifecycle row found when it holds no
// such row, or could not be read: neither is a lifecycle state.
const DURABLE_LIFECYCLE_READ = Object.freeze({
  ABSENT: Object.freeze({state: 'absent', reason: 'lifecycle-row-absent',
    incarnation: null, retirementEvidence: null}),
  UNREADABLE: Object.freeze({state: 'unreadable',
    reason: 'lifecycle-database-unreadable', incarnation: null,
    retirementEvidence: null}),
});
const ORIGINAL_SEED_LIFECYCLE = Object.freeze({
  MISSING: 'missing',
  UNTRANSFERRED: 'untransferred',
  TRANSFERRED: 'transferred',
  UNREADABLE: 'unreadable',
});

// The recorded evidence, or null (none, or one that cannot be parsed).
function retirementEvidenceOf(raw) {
  if (typeof raw !== 'string' || raw.length === 0) {
    return null;
  }
  try {
    const evidence = JSON.parse(raw);
    return evidence && typeof evidence === 'object' ?
      Object.freeze(evidence) : null;
  } catch (_error) {
    return null;
  }
}

function lifecycleRowOf(db, groupId, replicaIdentity) {
  const table = db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?
  `).get(REPLICA_LIFECYCLE_TABLE);
  // Every column: an older table has no incarnation or evidence column.
  const row = table === undefined ? undefined : db.prepare(`
    SELECT * FROM ${REPLICA_LIFECYCLE_TABLE}
    WHERE group_id = ? AND replica_identity = ?
  `).get(String(groupId), String(replicaIdentity));
  return row === undefined ? DURABLE_LIFECYCLE_READ.ABSENT :
    Object.freeze({state: row.state, reason: String(row.reason ?? ''),
      incarnation: typeof row.incarnation === 'string' &&
        row.incarnation.length > 0 ? row.incarnation : null,
      retirementEvidence: retirementEvidenceOf(row.retirement_evidence)});
}

/**
 * Read the durable lifecycle row of one (group, replica identity) read-only.
 * @param {string} dbPath - The replica's database file.
 * @param {string} groupId
 * @param {string} replicaIdentity
 * @return {Object} Frozen {state, reason, incarnation, retirementEvidence}.
 */
function readDurableReplicaLifecycle(dbPath, groupId, replicaIdentity) {
  try {
    if (!fs.existsSync(dbPath)) {
      return DURABLE_LIFECYCLE_READ.ABSENT;
    }
    const db = new Database(dbPath, {readonly: true, fileMustExist: true});
    try {
      return lifecycleRowOf(db, groupId, replicaIdentity);
    } finally {
      db.close();
    }
  } catch (_error) {
    return DURABLE_LIFECYCLE_READ.UNREADABLE;
  }
}

function readOriginalAllocationRightsRow(db, groupId, replicaIdentity, lifecycle, declaration) {
  const members = declaration.declaration?.members;
  const member = Array.isArray(members) ?
    members.find((entry) => entry?.replicaId === replicaIdentity) : null;
  if (member && lifecycle.state === LIFECYCLE_STATE.ACTIVE &&
      lifecycle.incarnation === member.incarnation) {
    return readOriginalAllocationRow({db, member});
  }
  const present = lifecycleColumns(db);
  const cols = [ORIGINAL_COLUMN.SERVICE_RIGHT,
    ...(present.has(ORIGINAL_COLUMN.IDENTITY_RIGHT) ? [ORIGINAL_COLUMN.IDENTITY_RIGHT] : [])];
  return db.prepare(`SELECT ${cols.join(SQL_LIST_SEPARATOR)} FROM ${REPLICA_LIFECYCLE_TABLE}
    WHERE group_id = ? AND replica_identity = ? LIMIT 1`).get(groupId, replicaIdentity);
}

function inspectOriginalAllocationDb(dbPath, groupId, replicaIdentity, isAnchor, lifecycle) {
  const db = new Database(dbPath, {readonly: true, fileMustExist: true});
  try {
    const declaration = readOriginalAllocationDeclaration({db, groupId, replicaIdentity});
    const present = lifecycleColumns(db);
    if (declaration.state === ORIGINAL.ABSENT || !present.has(ORIGINAL_COLUMN.SERVICE_RIGHT)) {
      return Object.freeze({state: ORIGINAL_SEED_LIFECYCLE.MISSING});
    }
    const row = readOriginalAllocationRightsRow(
      db, groupId, replicaIdentity, lifecycle, declaration);
    const transferred = row?.[ORIGINAL_COLUMN.SERVICE_RIGHT] === ORIGINAL.TRANSFERRED &&
      (!isAnchor || (present.has(ORIGINAL_COLUMN.IDENTITY_RIGHT) &&
        row?.[ORIGINAL_COLUMN.IDENTITY_RIGHT] === ORIGINAL.TRANSFERRED));
    return Object.freeze({
      state: transferred ?
        ORIGINAL_SEED_LIFECYCLE.TRANSFERRED :
        ORIGINAL_SEED_LIFECYCLE.UNTRANSFERRED,
    });
  } finally {
    db.close();
  }
}

function inspectReplicaLifecycleForOriginalAllocation(request) {
  try {
    const {dbPath, groupId, isAnchor = false} = request;
    const replicaIdentity = request.replicaIdentity ?? request.replicaId;
    const stat = snapshotFileStat(dbPath);
    if (!stat) {
      const hasSidecar = SNAPSHOT_RECEIVER_JOURNALS.some(
        (suffix) => snapshotFileStat(`${dbPath}${suffix}`) !== null);
      return Object.freeze({state: hasSidecar ?
        ORIGINAL_SEED_LIFECYCLE.UNREADABLE : ORIGINAL_SEED_LIFECYCLE.MISSING});
    }
    if (!stat.isFile() || SNAPSHOT_RECEIVER_JOURNALS.some((suffix) => {
      const journal = snapshotFileStat(`${dbPath}${suffix}`);
      return journal !== null && !journal.isFile();
    })) {
      return Object.freeze({state: ORIGINAL_SEED_LIFECYCLE.UNREADABLE});
    }
    const lifecycle = readDurableReplicaLifecycle(dbPath, groupId, replicaIdentity);
    if (lifecycle.state === DURABLE_LIFECYCLE_READ.UNREADABLE.state) {
      return Object.freeze({state: ORIGINAL_SEED_LIFECYCLE.UNREADABLE});
    }
    if (lifecycle.state === DURABLE_LIFECYCLE_READ.ABSENT.state) {
      return Object.freeze({state: ORIGINAL_SEED_LIFECYCLE.MISSING});
    }
    return inspectOriginalAllocationDb(dbPath, groupId, replicaIdentity, isAnchor, lifecycle);
  } catch (_error) {
    return Object.freeze({state: ORIGINAL_SEED_LIFECYCLE.UNREADABLE});
  }
}

export {
  DURABLE_LIFECYCLE_READ, RaftRsReplicaLifecycleOwner, readDurableReplicaLifecycle,
  prepareReplicaLifecycleForSnapshot, prepareReplicaLifecycleForOriginalAllocation,
  prepareOriginalAllocationRow, markOriginalAllocationIssued, transitionOriginalRight,
  readOriginalAllocationRow, readOriginalAllocationDeclaration,
  inspectReplicaLifecycleForSnapshot, inspectReplicaLifecycleForOriginalAllocation,
  registerRuntimeLifecycle, retireReplicaLifecycle, withReplicaLifecycleClaim,
  unregisterRuntimeLifecycle,
};
