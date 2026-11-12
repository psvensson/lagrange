import {randomUUID} from 'node:crypto';
import {deriveRaftRsPeerId} from './raft-rs-peer-identity.js';
import {
  RAFT_OPERATION_OUTCOME,
} from './raft-operation-port-constants.js';
import {assertSQLiteConnection, preparedStatementOf} from '../storage/sqlite-prepared-statement-owner.js';
import {commitDurably} from './raft-rs-durable-store.js';
import {pendingTurn, settledTurn, turnChainValue} from './raft-rs-turn-answer.js';
import {RAFT_RS_OPENING_HISTORY, RAFT_RS_OPENING_HISTORY_ERROR} from
  './raft-rs-opening-history-constants.js';
import {LIFECYCLE_ERROR, LIFECYCLE_STATE, REPLICA_LIFECYCLE_TABLE,
  LIFECYCLE_REASON, LIFECYCLE_BIRTH, REPLICA_DATABASE_CREATION} from
  './raft-rs-replica-lifecycle-constants.js';
import {decodeReplicaLifecycleRow, lifecycleAdmissionOf, encodeLifecycleRetirement} from
  './raft-rs-replica-lifecycle-record.js';
import {ORIGINAL_ALLOCATION as ORIGINAL, ORIGINAL_ALLOCATION_REASON as ORIGINAL_REASON,
  ORIGINAL_ALLOCATION_COLUMN as ORIGINAL_COLUMN, ORIGINAL_RIGHT_SUCCESSOR,
  originalAllocationError} from './raft-rs-original-allocation-constants.js';

// `incarnation` is the replica incarnation stamp: minted once, when the row
// is born, never replaced and never reused by a later replica of the same
// name (a later replica is a new row: its database was deleted, or its row
// removed, before it could be born). `retirement_evidence` is the verified
// group-retirement evidence a retirement recorded with the row. Every
// released table (the table first shipped in 0.2.6) was created with these
// columns, so no open probes or adds them.
// Durable lifecycle generation is the persistent authority. Runtime-instance
// identity is the exact process-local projection of that generation: the
// registry holds one entry per opened runtime (the frozen operation port a
// replica generation opened), never per logical (group, replica) name.
// Every operation here is exact-runtime; a missing exact runtime is a
// terminal stale result for that work item and is never resolved to
// whichever runtime currently serves the name. No current-runtime
// observation exists in this registry; one would have to be a separately
// named, non-destructive read. A reused logical name opens a new
// runtime and a new entry; work that belongs to the old runtime can reach
// only the old entry, and removing an entry removes only that runtime's own.
// Nothing here is durable: the durable lifecycle row recreates the right
// runtime through the existing recovery owner after a restart.
const RUNTIME_LIFECYCLE_OWNERS = new WeakMap();
const LIFECYCLE_ADMIN_OUTCOME = Object.freeze({NOT_MANAGED: 'NOT_MANAGED'});
const LIFECYCLE_CLAIM_REFUSED = 'REPLICA_LIFECYCLE_CLAIM_REFUSED';
function frozenResult(outcome, reason, detail = null) {
  return Object.freeze({outcome, reason, detail});
}

// This owner's fixed statements, each prepared once per database handle.
const LIFECYCLE_SQL = Object.freeze({
  EMPTY_DATABASE: 'SELECT 1 FROM sqlite_master LIMIT 1',
  IDENTITY_ROW: `SELECT peer_id, replica_identity, state, reason, incarnation, retirement_evidence
    FROM ${REPLICA_LIFECYCLE_TABLE}
    WHERE group_id = ? AND (peer_id = ? OR replica_identity = ?)`,
  TABLE_PRESENT: 'SELECT 1 FROM sqlite_master WHERE type = \'table\' AND name = ?',
  BIRTH: `INSERT INTO ${REPLICA_LIFECYCLE_TABLE}
    (group_id, peer_id, replica_identity, state, reason, changed_at,
      incarnation, native_history_state)
    VALUES (?, ?, ?, 'active', NULL, ?, ?, ?)`,
  INCARNATION: `SELECT incarnation FROM ${REPLICA_LIFECYCLE_TABLE}
    WHERE group_id = ? AND peer_id = ? AND replica_identity = ?`,
  OPENING_HISTORY: `SELECT native_history_state FROM ${REPLICA_LIFECYCLE_TABLE}
    WHERE group_id = ? AND peer_id = ? AND replica_identity = ?
      AND incarnation = ? AND state = 'active'`,
  RECORD_OPENING_HISTORY: `UPDATE ${REPLICA_LIFECYCLE_TABLE}
    SET native_history_state = ?
    WHERE group_id = ? AND peer_id = ? AND replica_identity = ?
      AND incarnation = ? AND state = 'active'`,
  RETIRE: `UPDATE ${REPLICA_LIFECYCLE_TABLE}
    SET state = 'retired', reason = ?, changed_at = ?, retirement_evidence = ?
    WHERE group_id = ? AND peer_id = ? AND replica_identity = ?`,
});
// The one table definition.
function ensureLifecycleTable(db) {
  assertSQLiteConnection(db);
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
}
// The row holding either half of this replica's identity in its group.
function lifecycleIdentityRow(db, {groupId, peerId, replicaIdentity}) {
  return preparedStatementOf(db, LIFECYCLE_SQL.IDENTITY_ROW)
    .get(groupId, peerId, replicaIdentity);
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
// Ordinary opening only consumes a recorded generation. Missing evidence is
// never repaired here, including a missing table, row or incarnation.
function openLifecycleRecord(db, identity) {
  if (preparedStatementOf(db, LIFECYCLE_SQL.TABLE_PRESENT)
    .get(REPLICA_LIFECYCLE_TABLE) === undefined) {
    return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED, LIFECYCLE_REASON.MISSING);
  }
  const row = lifecycleIdentityRow(db, identity);
  if (row === undefined || typeof row.incarnation !== 'string' ||
      row.incarnation.length === 0) {
    return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED, LIFECYCLE_REASON.MISSING);
  }
  if (row.peer_id !== identity.peerId || row.replica_identity !== identity.replicaIdentity) {
    return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED,
      LIFECYCLE_REASON.IDENTITY_MISMATCH);
  }
  return lifecycleAdmissionOf(row);
}

// Only explicit allocation and private snapshot preparation call this writer.
// It cannot be reached through ordinary runtime opening.
function prepareLifecycleRecord(db, identity, incarnation) {
  ensureLifecycleTable(db);
  if (lifecycleIdentityRow(db, identity) === undefined) {
    if (hasDurableRaftRecord(db, identity.groupId)) {
      return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED, LIFECYCLE_REASON.MISSING);
    }
    preparedStatementOf(db, LIFECYCLE_SQL.BIRTH).run(identity.groupId, identity.peerId,
      identity.replicaIdentity, new Date().toISOString(), incarnation,
      RAFT_RS_OPENING_HISTORY.NEVER_OPENED);
  }
  return openLifecycleRecord(db, identity);
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
    assertSQLiteConnection(db);
    this.#db = db;
    this.#groupId = groupId;
    this.#peerId = peerId;
    this.#replicaIdentity = replicaIdentity;
    const opened = openLifecycleRecord(db, {groupId, peerId, replicaIdentity});
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
    if (this.#state === null) return null;
    const row = preparedStatementOf(this.#db, LIFECYCLE_SQL.INCARNATION)
      .get(this.#groupId, this.#peerId, this.#replicaIdentity);
    return typeof row?.incarnation === 'string' ? row.incarnation : null;
  }

  /**
   * Read the monotonic opening fact of exactly the admitted incarnation.
   * Missing/changed identity and invalid persisted values never mean fresh.
   * @param {string} incarnation - The port's captured lifecycle identity.
   * @return {string} Owner-defined opening history state.
   */
  openingHistory(incarnation) {
    const row = preparedStatementOf(this.#db, LIFECYCLE_SQL.OPENING_HISTORY)
      .get(this.#groupId, this.#peerId, this.#replicaIdentity, incarnation);
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
    const result = preparedStatementOf(this.#db, LIFECYCLE_SQL.RECORD_OPENING_HISTORY)
      .run(RAFT_RS_OPENING_HISTORY.ESTABLISHED, this.#groupId, this.#peerId,
        this.#replicaIdentity, incarnation);
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
        this.#retiring && this.#state === LIFECYCLE_STATE.ACTIVE ?
          LIFECYCLE_STATE.RETIRED : this.#refusalReason);
  }

  /**
   * Admit one turn against retirement. `work` answers a named turn
   * (raft-rs-turn-answer.js); the replica stays held for exactly as long as
   * that turn: released at once when it settled, after its promise when it
   * is pending. A refused admission is a settled turn naming the refusal.
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
   * Retire this replica generation durably. A row already retired keeps its
   * state, reason and evidence (a reseed hold is never overwritten).
   * @param {string} reason - Why its logical identity is terminal.
   * @param {Object|null} [evidence] - The verified group-retirement evidence
   *   of a retirement with its whole group, recorded with the row.
   * @return {Promise<Object>} Frozen outcome.
   */
  async retire(reason, evidence = null) {
    const retirement = encodeLifecycleRetirement(reason, evidence);
    if (this.#state !== LIFECYCLE_STATE.ACTIVE) {
      return frozenResult(
        RAFT_OPERATION_OUTCOME.CORE_REFUSED, this.#refusalReason);
    }
    this.#retiring = true;
    if (this.#activeCount > 0) {
      await new Promise((resolve) => this.#waiters.push(resolve));
    }
    // A turn that was running while this retirement waited may have held
    // the replica for a reseed: that row and its reason stay (the evidence
    // of lost history is never overwritten by a later retirement).
    if (this.#state !== LIFECYCLE_STATE.ACTIVE) {
      return frozenResult(
        RAFT_OPERATION_OUTCOME.CORE_REFUSED, this.#refusalReason);
    }
    // The reason and the evidence are written by the one UPDATE.
    this.#writeRetired(retirement.reason, retirement.evidenceText);
    this.#state = LIFECYCLE_STATE.RETIRED;
    this.#refusalReason = retirement.refusal.reason;
    return frozenResult(
      RAFT_OPERATION_OUTCOME.CORE_OK, this.#refusalReason);
  }

  /**
   * Hold this replica for a reseed, durably and at once: called from inside
   * the runtime turn that proved its history lost, so it does not wait for
   * that turn. Every later execution is refused RESEED_REQUIRED, and a
   * restart reads the same refusal from the row.
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

  /**
   * The one retired-row UPDATE: state, reason, changed_at and the
   * retirement evidence (null for a reseed hold) are written together.
   * @param {string} reason - The durable reason.
   * @param {string|null} evidenceText - Captured, validated evidence encoding.
   */
  #writeRetired(reason, evidenceText) {
    commitDurably(this.#db, () => preparedStatementOf(this.#db, LIFECYCLE_SQL.RETIRE).run(
      reason,
      new Date().toISOString(),
      evidenceText,
      this.#groupId,
      this.#peerId,
      this.#replicaIdentity,
    ));
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
 * Prepare only the receiver-local lifecycle record in a validated snapshot's
 * private staging database. The snapshot owner retains CREATE authorization,
 * staging-file custody and atomic installation; this owner retains identity,
 * incarnation creation and the refusal of retired/conflicting generations.
 * No owner, runtime handle, registration or retirement capability is returned.
 * An exact active row is idempotent and keeps its incarnation.
 * @param {Object} request - {db, groupId, peerId, replicaIdentity}.
 * @return {Object} Immutable lifecycle outcome, never install permission.
 */
function prepareReplicaLifecycleForSnapshot(request) {
  const {db, groupId, peerId, replicaIdentity} = request;
  assertSQLiteConnection(db);
  const retained = request.receiverIncarnation ?? null;
  const prepared = prepareLifecycleRecord(db, {groupId, peerId, replicaIdentity},
    retained === null ? randomUUID() : String(retained));
  if (prepared.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) return prepared;
  const owner = new RaftRsReplicaLifecycleOwner({db, groupId, peerId, replicaIdentity});
  // Synchronous work: the admitted turn settles in this run.
  return turnChainValue(owner.execute(() => {
    const incarnation = owner.incarnation;
    if (retained !== null && retained !== incarnation) {
      return settledTurn(frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED,
        LIFECYCLE_REASON.IDENTITY_MISMATCH));
    }
    // A snapshot is imported history. Never publish a staged lifecycle row
    // that could later authorize fresh genesis if the installed log is lost.
    commitDurably(db, () => owner.recordOpeningHistory(incarnation));
    return settledTurn(frozenResult(RAFT_OPERATION_OUTCOME.CORE_OK,
      LIFECYCLE_REASON.STAGING_PREPARED, Object.freeze({incarnation})));
  }));
}

/**
 * Birth the lifecycle row of one founder of an original seed allocation,
 * before any native effect and inside the caller's open transaction (the
 * original-allocation preparation commits it with its peer-identity rows).
 * This owner mints the incarnation; the caller supplies only the identity,
 * and the declaration consumes the returned stamp. Birth is once: any row
 * already holding this identity, in any state, is refused and left
 * unchanged, as is durable native history without a row. The row is born
 * NEVER_OPENED and is never marked established here, on a file formatted
 * with the allocation columns in the same transaction (so no founder row
 * exists on an unformatted file). No owner, runtime handle, registration or
 * retirement capability is returned.
 * @param {Object} request - {db, groupId, peerId, replicaIdentity}.
 * @return {Object} Frozen {outcome, reason, detail: {incarnation}|null}.
 */
function prepareReplicaLifecycleForOriginalAllocation({db, groupId, peerId, replicaIdentity}) {
  assertSQLiteConnection(db);
  if (!db.inTransaction) {
    throw new Error(LIFECYCLE_ERROR.TRANSACTION_REQUIRED);
  }
  const identity = {groupId, peerId, replicaIdentity};
  ensureLifecycleTable(db);
  if (lifecycleIdentityRow(db, identity) !== undefined) {
    return frozenResult(RAFT_OPERATION_OUTCOME.CORE_REFUSED,
      LIFECYCLE_REASON.ORIGINAL_ROW_PRESENT);
  }
  const prepared = prepareLifecycleRecord(db, identity, randomUUID());
  if (prepared.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) return prepared;
  const owner = new RaftRsReplicaLifecycleOwner({db, ...identity});
  const admission = owner.admission();
  if (admission.outcome !== RAFT_OPERATION_OUTCOME.CORE_OK) return admission;
  formatOriginalAllocationColumns(db);
  return frozenResult(RAFT_OPERATION_OUTCOME.CORE_OK,
    LIFECYCLE_REASON.ORIGINAL_PREPARED,
    Object.freeze({incarnation: owner.incarnation}));
}

// Original seed allocation (owner decision 2026-10-26, Q3): the five
// allocation columns and the two original rights are fields of a founder's
// row, and this owner is their only writer. Only the original issuer formats
// the optional columns, at a founder's birth and in its transaction; other
// readers never migrate a file to find a grant. A founder's row therefore
// lives only on a formatted file, and its reads name the columns without
// asking the file for them.
const ORIGINAL_COLUMNS = Object.freeze(Object.values(ORIGINAL_COLUMN));
const ORIGINAL_ROW_FIELDS = Object.freeze(['state', 'incarnation',
  'native_history_state', ...ORIGINAL_COLUMNS]);
const SQL_LIST_SEPARATOR = ', ';
const ORIGINAL_SQL = Object.freeze({
  EXACT_ROW: `SELECT ${ORIGINAL_ROW_FIELDS.join(SQL_LIST_SEPARATOR)},
    peer_id, replica_identity, reason, retirement_evidence
    FROM ${REPLICA_LIFECYCLE_TABLE}
    WHERE group_id = ? AND peer_id = ? AND replica_identity = ?`,
  PREPARE_ROW: `UPDATE ${REPLICA_LIFECYCLE_TABLE}
    SET ${ORIGINAL_COLUMNS.map((column) => `${column} = ?`).join(SQL_LIST_SEPARATOR)}
    WHERE group_id = ? AND peer_id = ? AND replica_identity = ?
      AND incarnation = ? AND state = 'active'
      AND ${ORIGINAL_COLUMN.DECLARATION} IS NULL`,
  ISSUE: `UPDATE ${REPLICA_LIFECYCLE_TABLE}
    SET ${ORIGINAL_COLUMN.ISSUE} = ? WHERE group_id = ? AND peer_id = ?
      AND replica_identity = ? AND incarnation = ? AND state = 'active'
      AND ${ORIGINAL_COLUMN.DECLARATION} = ? AND ${ORIGINAL_COLUMN.MEMBER} = ?
      AND ${ORIGINAL_COLUMN.ISSUE} = ? AND native_history_state = ?
      AND ${ORIGINAL_COLUMN.IDENTITY_RIGHT} = ? AND ${ORIGINAL_COLUMN.SERVICE_RIGHT} = ?`,
});
// One fixed statement per right column (SERVICE_RIGHT, IDENTITY_RIGHT).
const RIGHT_TRANSITION_SQL = Object.freeze(Object.fromEntries(
  [ORIGINAL_COLUMN.SERVICE_RIGHT, ORIGINAL_COLUMN.IDENTITY_RIGHT].map((right) =>
    [right, `UPDATE ${REPLICA_LIFECYCLE_TABLE}
    SET ${right} = ? WHERE group_id = ? AND peer_id = ? AND replica_identity = ?
      AND incarnation = ? AND state = 'active' AND ${right} = ?
      AND ${ORIGINAL_COLUMN.DECLARATION} = ? AND ${ORIGINAL_COLUMN.MEMBER} = ?`])));

// The columns a lifecycle table holds: read by the issuer that formats a
// founder's file at its birth, and by a declaration read of a file that may
// not be a founder's (an absent table or column there is ABSENT).
function lifecycleColumns(db) {
  assertSQLiteConnection(db);
  return new Set(db.prepare(`PRAGMA table_info(${REPLICA_LIFECYCLE_TABLE})`).all()
    .map(({name}) => name));
}

// One ALTER per allocation column the founder's file does not have yet.
function formatOriginalAllocationColumns(db) {
  const present = lifecycleColumns(db);
  for (const column of ORIGINAL_COLUMNS) {
    if (!present.has(column)) {
      db.exec(`ALTER TABLE ${REPLICA_LIFECYCLE_TABLE} ADD COLUMN ${column} TEXT`);
    }
  }
}

// Exactly this member's active row by named columns. A missing or changed
// identity is a typed HOLD.
function exactOriginalRow(db, member) {
  const row = preparedStatementOf(db, ORIGINAL_SQL.EXACT_ROW)
    .get(member.groupId, member.peerId, member.replicaId);
  if (row?.incarnation !== member.incarnation || row?.state !== LIFECYCLE_STATE.ACTIVE) {
    throw originalAllocationError(ORIGINAL_REASON.IDENTITY, member.replicaId);
  }
  decodeReplicaLifecycleRow(row);
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
  assertSQLiteConnection(db);
  const present = lifecycleColumns(db);
  const row = !present.has(ORIGINAL_COLUMN.DECLARATION) ? undefined : db.prepare(`
    SELECT ${ORIGINAL_COLUMN.DECLARATION}, ${ORIGINAL_COLUMN.ISSUE},
      peer_id, replica_identity, state, reason, incarnation, retirement_evidence
    FROM ${REPLICA_LIFECYCLE_TABLE} WHERE group_id = ? AND replica_identity = ?`)
    .get(groupId, replicaIdentity);
  if (row !== undefined) decodeReplicaLifecycleRow(row);
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
 * Write a born NEVER_OPENED founder's declaration, member, issue PREPARING
 * and UNUSED rights (the identity right only on the anchor); its birth
 * formatted the allocation columns.
 * @param {Object} request - {db, declaration, member}.
 */
function prepareOriginalAllocationRow({db, declaration, member}) {
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
  commitOriginalWrite(db, member, () => preparedStatementOf(db, ORIGINAL_SQL.PREPARE_ROW)
    .run(...ORIGINAL_COLUMNS.map((column) => fields[column]),
      member.groupId, member.peerId, member.replicaId, member.incarnation),
  (row) => hasOriginalFields(row, fields));
}

/**
 * Issue exactly this declaration/member on its NEVER_OPENED anchor via
 * PREPARING -> ISSUED compare-and-swap with both rights UNUSED; else typed HOLD.
 * @param {Object} request - {db, declaration, anchor}.
 */
function markOriginalAllocationIssued({db, declaration, anchor}) {
  assertSQLiteConnection(db);
  if (anchor.replicaId !== declaration.anchorReplicaId) {
    throw originalAllocationError(ORIGINAL_REASON.IDENTITY, anchor.replicaId);
  }
  const declarationText = JSON.stringify(declaration);
  readOriginalAllocationRow({db, member: anchor});
  commitOriginalWrite(db, anchor, () => preparedStatementOf(db, ORIGINAL_SQL.ISSUE)
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
  commitOriginalWrite(db, member, () => preparedStatementOf(db, RIGHT_TRANSITION_SQL[right])
    .run(to, member.groupId, member.peerId, member.replicaId, member.incarnation, from,
      declarationText, before[ORIGINAL_COLUMN.MEMBER]),
  (row) => hasOriginalFields(row, {[right]: to,
    [ORIGINAL_COLUMN.DECLARATION]: declarationText}));
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
 * Retire exactly the runtime generation the caller owns. A runtime that is
 * no longer registered (closed, or never opened) is a typed stale result:
 * the lookup never falls back to whatever runtime now serves the same
 * logical (group, replica) name.
 * @param {Object} request
 * @param {Object} request.runtime - The exact operation port to retire.
 * @param {string} request.groupId
 * @param {string} request.replicaIdentity
 * @param {string} request.reason
 * @param {Object|null} [request.evidence] - Verified group-retirement
 *   evidence recorded with the retired row.
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

/** Birth exactly a newly acquired empty database before application DDL.
 * The one row writer mints its incarnation and NEVER_OPENED marker atomically.
 * Nonempty files stay unchanged; an empty existing file is UNPROVEN.
 * @param {Object} request - {db, groupId, replicaIdentity, creation}.
 * @return {string} A LIFECYCLE_BIRTH.
 */
function birthReplicaLifecycle({db, groupId, replicaIdentity, creation}) {
  assertSQLiteConnection(db);
  return db.transaction(() => {
    if (db.prepare(LIFECYCLE_SQL.EMPTY_DATABASE).get() !== undefined) {
      return LIFECYCLE_BIRTH.NOT_EMPTY;
    }
    if (creation !== REPLICA_DATABASE_CREATION.NEW) {
      return LIFECYCLE_BIRTH.UNPROVEN;
    }
    prepareLifecycleRecord(db, {groupId, replicaIdentity,
      peerId: deriveRaftRsPeerId(replicaIdentity)}, randomUUID());
    return LIFECYCLE_BIRTH.BORN;
  }).immediate();
}

export {
  LIFECYCLE_BIRTH,
  birthReplicaLifecycle,
  RaftRsReplicaLifecycleOwner,
  prepareReplicaLifecycleForSnapshot,
  prepareReplicaLifecycleForOriginalAllocation,
  prepareOriginalAllocationRow,
  markOriginalAllocationIssued,
  transitionOriginalRight,
  readOriginalAllocationRow,
  readOriginalAllocationDeclaration,
  registerRuntimeLifecycle,
  retireReplicaLifecycle,
  withReplicaLifecycleClaim,
  unregisterRuntimeLifecycle,
};

// Public observations stay under this owner; their implementation is read-only.
export {
  DURABLE_LIFECYCLE_OPENING,
  DURABLE_LIFECYCLE_READ,
  LIFECYCLE_READ_SUBJECT,
  inspectReplicaLifecycleForSnapshot,
  readDurableReplicaLifecycle,
  readDurableReplicaLifecycleBeside,
} from './raft-rs-replica-lifecycle-observation.js';
