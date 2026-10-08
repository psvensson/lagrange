import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import Database from 'better-sqlite3';
import {
  RAFT_OPERATION_OUTCOME,
} from './raft-operation-port-constants.js';
import {
  COMMITTED_MEMBERSHIP_REFUSAL,
} from './raft-committed-membership-constants.js';
import {commitDurably} from './raft-rs-durable-store.js';

const LIFECYCLE_TABLE = '_raft_rs_replica_lifecycle';
// Columns added after the table first shipped: an older database gains them
// (NULL for its existing rows) the first time a lifecycle owner opens it.
// `incarnation` is the replica incarnation stamp: minted once, when the row
// is born (or, for a row born before the column existed, the first time its
// owner opens it), never replaced and never reused by a later replica of the
// same name (a later replica is a new row: its database was deleted, or its
// row removed, before it could be born). `retirement_evidence` is the
// verified group-retirement evidence a retirement recorded with the row.
const LIFECYCLE_ADDED_COLUMNS = Object.freeze(['incarnation',
  'retirement_evidence']);
const LIFECYCLE_STATE = Object.freeze({
  ACTIVE: 'active',
  RETIRED: 'retired',
});
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

const LIFECYCLE_BINDING_READ_STATE = Object.freeze({
  PRESENT: 'present',
  MISSING: 'missing',
  UNREADABLE: 'unreadable',
});

const LIFECYCLE_LOCAL_OPEN_BINDING = Object.freeze({
  EXACT_ACTIVE: 'exact-active',
  EXACT_RETIRED: 'exact-retired',
  INCARNATION_MISSING: 'incarnation-missing',
  IDENTITY_MISMATCH: 'identity-mismatch',
  MISSING: 'missing',
  UNREADABLE: 'unreadable',
});
const SQLITE_MASTER_TABLE_SQL =
  'SELECT 1 FROM sqlite_master WHERE type = \'table\' AND name = ?';

function tableExists(db, table) {
  return db.prepare(SQLITE_MASTER_TABLE_SQL).get(table) !== undefined;
}

function inspectReplicaLifecycleBindingsIn(db, {peerId, replicaIdentity}) {
  if (!tableExists(db, LIFECYCLE_TABLE)) {
    return Object.freeze({
      state: LIFECYCLE_BINDING_READ_STATE.MISSING,
      bindings: Object.freeze([]),
    });
  }
  try {
    const bindings = db.prepare(`
      SELECT group_id, peer_id, replica_identity, state, reason, incarnation
      FROM ${LIFECYCLE_TABLE}
      WHERE peer_id = ? OR replica_identity = ?
      ORDER BY group_id, peer_id, replica_identity
    `).all(peerId, replicaIdentity).map((row) => Object.freeze(row));
    return Object.freeze({
      state: LIFECYCLE_BINDING_READ_STATE.PRESENT,
      bindings: Object.freeze(bindings),
    });
  } catch (error) {
    return Object.freeze({
      state: LIFECYCLE_BINDING_READ_STATE.UNREADABLE,
      bindings: Object.freeze([]),
      error,
    });
  }
}

function exactLifecycleBinding(bindings, {groupId, peerId, replicaIdentity}) {
  return bindings.find((row) =>
    String(row.group_id) === String(groupId) &&
    String(row.peer_id) === String(peerId) &&
    String(row.replica_identity) === String(replicaIdentity));
}

function localOpenLifecycleClassification(kind, detail = {}) {
  return Object.freeze({kind, ...detail});
}

function classifyReplicaLifecycleLocalOpenBindingIn(
  db, {groupId, peerId, replicaIdentity}) {
  const read = inspectReplicaLifecycleBindingsIn(db, {peerId, replicaIdentity});
  if (read.state === LIFECYCLE_BINDING_READ_STATE.UNREADABLE) {
    return localOpenLifecycleClassification(
      LIFECYCLE_LOCAL_OPEN_BINDING.UNREADABLE, {error: read.error});
  }
  if (read.state === LIFECYCLE_BINDING_READ_STATE.MISSING) {
    return localOpenLifecycleClassification(
      LIFECYCLE_LOCAL_OPEN_BINDING.MISSING);
  }
  const exact = exactLifecycleBinding(read.bindings, {
    groupId, peerId, replicaIdentity,
  });
  if (exact === undefined) {
    if (read.bindings.length > 0) {
      return localOpenLifecycleClassification(
        LIFECYCLE_LOCAL_OPEN_BINDING.IDENTITY_MISMATCH,
        {bindings: read.bindings});
    }
    return localOpenLifecycleClassification(
      LIFECYCLE_LOCAL_OPEN_BINDING.MISSING);
  }
  if (exact.incarnation === null) {
    return localOpenLifecycleClassification(
      LIFECYCLE_LOCAL_OPEN_BINDING.INCARNATION_MISSING, {binding: exact});
  }
  if (exact.state === LIFECYCLE_STATE.ACTIVE) {
    return localOpenLifecycleClassification(
      LIFECYCLE_LOCAL_OPEN_BINDING.EXACT_ACTIVE, {binding: exact});
  }
  if (exact.state === LIFECYCLE_STATE.RETIRED) {
    return localOpenLifecycleClassification(
      LIFECYCLE_LOCAL_OPEN_BINDING.EXACT_RETIRED,
      {binding: exact, reason: retiredRefusalReason(exact.reason)});
  }
  return localOpenLifecycleClassification(
    LIFECYCLE_LOCAL_OPEN_BINDING.IDENTITY_MISMATCH, {bindings: read.bindings});
}

const RUNTIME_LIFECYCLE_OWNERS = new WeakMap();
const LIFECYCLE_ADMIN_OUTCOME = Object.freeze({NOT_MANAGED: 'NOT_MANAGED'});
const LIFECYCLE_REASON = Object.freeze({
  MISSING: 'lifecycle-record-missing',
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
  const present = new Set(db.prepare(`PRAGMA table_info(${LIFECYCLE_TABLE})`)
    .all().map((column) => column.name));
  for (const column of LIFECYCLE_ADDED_COLUMNS) {
    if (!present.has(column)) {
      db.exec(`ALTER TABLE ${LIFECYCLE_TABLE} ADD COLUMN ${column} TEXT`);
    }
  }
}

// A row born before the stamp existed gets one, once: the update never
// replaces a stamp.
function stampUnstampedRow(db, {groupId, peerId, mintIncarnation}) {
  db.prepare(`
    UPDATE ${LIFECYCLE_TABLE} SET incarnation = ?
    WHERE group_id = ? AND peer_id = ? AND incarnation IS NULL
  `).run(String(mintIncarnation()), groupId, peerId);
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

  constructor({db, groupId, peerId, replicaIdentity,
    mintIncarnation = randomUUID}) {
    this.#db = db;
    this.#groupId = groupId;
    this.#peerId = peerId;
    this.#replicaIdentity = replicaIdentity;
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${LIFECYCLE_TABLE} (
        group_id TEXT NOT NULL,
        peer_id TEXT NOT NULL,
        replica_identity TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('active', 'retired')),
        reason TEXT,
        changed_at TEXT NOT NULL,
        incarnation TEXT,
        retirement_evidence TEXT,
        PRIMARY KEY (group_id, peer_id),
        UNIQUE (group_id, replica_identity)
      )
    `);
    addMissingLifecycleColumns(db);
    const row = db.prepare(`
      SELECT peer_id, replica_identity, state, reason
      FROM ${LIFECYCLE_TABLE}
      WHERE group_id = ? AND (peer_id = ? OR replica_identity = ?)
    `).get(groupId, peerId, replicaIdentity);
    if (row === undefined) {
      const raftTables = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name IN (
          '_raft_rs_log', '_raft_rs_hard_state', '_raft_rs_applied_state'
        )
      `).all().map((entry) => entry.name);
      const hasDurableRaftRecord = raftTables.some((table) =>
        db.prepare(`SELECT 1 FROM ${table} WHERE group_id = ? LIMIT 1`)
          .get(groupId) !== undefined);
      if (hasDurableRaftRecord) {
        this.#state = null;
        this.#refusalReason = LIFECYCLE_REASON.MISSING;
      } else {
        db.prepare(`
          INSERT INTO ${LIFECYCLE_TABLE}
            (group_id, peer_id, replica_identity, state, reason, changed_at,
              incarnation)
          VALUES (?, ?, ?, 'active', NULL, ?, ?)
        `).run(groupId, peerId, replicaIdentity, new Date().toISOString(),
          String(mintIncarnation()));
        this.#state = LIFECYCLE_STATE.ACTIVE;
      }
    } else {
      if (row.peer_id !== peerId || row.replica_identity !== replicaIdentity) {
        this.#state = null;
        this.#refusalReason = LIFECYCLE_REASON.IDENTITY_MISMATCH;
      } else {
        stampUnstampedRow(db, {groupId, peerId, mintIncarnation});
        this.#state = row.state;
        this.#refusalReason = row.state === LIFECYCLE_STATE.RETIRED ?
          retiredRefusalReason(row.reason) : null;
      }
    }
  }

  get groupId() {
    return this.#groupId;
  }

  get replicaIdentity() {
    return this.#replicaIdentity;
  }

  get incarnation() {
    const row = this.#db.prepare(`
      SELECT incarnation FROM ${LIFECYCLE_TABLE}
      WHERE group_id = ? AND peer_id = ? AND replica_identity = ?
    `).get(this.#groupId, this.#peerId, this.#replicaIdentity);
    return typeof row?.incarnation === 'string' ? row.incarnation : null;
  }

  get active() {
    return this.#state === LIFECYCLE_STATE.ACTIVE && !this.#retiring;
  }

  execute(work) {
    if (!this.active) {
      return frozenResult(
        RAFT_OPERATION_OUTCOME.CORE_REFUSED,
        this.#refusalReason || LIFECYCLE_REASON.RETIRED);
    }
    this.#activeCount += 1;
    let result;
    try {
      result = work();
    } catch (error) {
      this.#release();
      throw error;
    }
    if (result && typeof result.then === 'function') {
      return result.finally(() => this.#release());
    }
    this.#release();
    return result;
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
    // A turn that was running while this retirement waited may have held
    // the replica for a reseed: that row and its reason stay (the evidence
    // of lost history is never overwritten by a later retirement).
    if (this.#state !== LIFECYCLE_STATE.ACTIVE) {
      return frozenResult(
        RAFT_OPERATION_OUTCOME.CORE_REFUSED, this.#refusalReason);
    }
    // The reason and the evidence are written by the one UPDATE.
    this.#writeRetired(String(reason || LIFECYCLE_REASON.RETIRED), evidence);
    this.#state = LIFECYCLE_STATE.RETIRED;
    this.#refusalReason = LIFECYCLE_REASON.RETIRED;
    return frozenResult(
      RAFT_OPERATION_OUTCOME.CORE_OK, LIFECYCLE_REASON.RETIRED);
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
   * @param {Object|null} [evidence] - Verified group-retirement evidence.
   */
  #writeRetired(reason, evidence = null) {
    commitDurably(this.#db, () => this.#db.prepare(`
      UPDATE ${LIFECYCLE_TABLE}
      SET state = 'retired', reason = ?, changed_at = ?,
        retirement_evidence = ?
      WHERE group_id = ? AND peer_id = ? AND replica_identity = ?
    `).run(
      reason,
      new Date().toISOString(),
      evidence ? JSON.stringify(evidence) : null,
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

// What a read of a replica database's lifecycle row found when it holds no
// such row, or could not be read: neither is a lifecycle state.
const DURABLE_LIFECYCLE_READ = Object.freeze({
  ABSENT: Object.freeze({state: 'absent', reason: 'lifecycle-row-absent',
    incarnation: null, retirementEvidence: null}),
  UNREADABLE: Object.freeze({state: 'unreadable',
    reason: 'lifecycle-database-unreadable', incarnation: null,
    retirementEvidence: null}),
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
  `).get(LIFECYCLE_TABLE);
  // Every column: an older table has no incarnation or evidence column.
  const row = table === undefined ? undefined : db.prepare(`
    SELECT * FROM ${LIFECYCLE_TABLE}
    WHERE group_id = ? AND replica_identity = ?
  `).get(String(groupId), String(replicaIdentity));
  return row === undefined ? DURABLE_LIFECYCLE_READ.ABSENT :
    Object.freeze({state: row.state, reason: String(row.reason ?? ''),
      incarnation: typeof row.incarnation === 'string' &&
        row.incarnation.length > 0 ? row.incarnation : null,
      retirementEvidence: retirementEvidenceOf(row.retirement_evidence)});
}

/**
 * The durable lifecycle row of exactly one (group, replica identity), read
 * read-only from a replica database file without opening a runtime or
 * creating anything: {state, reason, incarnation, retirementEvidence} (a row
 * born before the stamp, never opened since, reads incarnation null). A missing file or row is ABSENT, a
 * database that cannot be read is UNREADABLE - never a lifecycle state.
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

export {
  DURABLE_LIFECYCLE_READ,
  LIFECYCLE_BINDING_READ_STATE,
  LIFECYCLE_LOCAL_OPEN_BINDING,
  LIFECYCLE_STATE,
  RaftRsReplicaLifecycleOwner,
  classifyReplicaLifecycleLocalOpenBindingIn,
  inspectReplicaLifecycleBindingsIn,
  readDurableReplicaLifecycle,
  registerRuntimeLifecycle,
  retireReplicaLifecycle,
  unregisterRuntimeLifecycle,
};
