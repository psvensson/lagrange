import {
  RAFT_OPERATION_OUTCOME,
} from './raft-operation-port-constants.js';
import {
  COMMITTED_MEMBERSHIP_REFUSAL,
} from './raft-committed-membership-constants.js';
import {commitDurably} from './raft-rs-durable-store.js';

const LIFECYCLE_TABLE = '_raft_rs_replica_lifecycle';
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
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${LIFECYCLE_TABLE} (
        group_id TEXT NOT NULL,
        peer_id TEXT NOT NULL,
        replica_identity TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('active', 'retired')),
        reason TEXT,
        changed_at TEXT NOT NULL,
        PRIMARY KEY (group_id, peer_id),
        UNIQUE (group_id, replica_identity)
      )
    `);
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
            (group_id, peer_id, replica_identity, state, reason, changed_at)
          VALUES (?, ?, ?, 'active', NULL, ?)
        `).run(groupId, peerId, replicaIdentity, new Date().toISOString());
        this.#state = LIFECYCLE_STATE.ACTIVE;
      }
    } else {
      if (row.peer_id !== peerId || row.replica_identity !== replicaIdentity) {
        this.#state = null;
        this.#refusalReason = LIFECYCLE_REASON.IDENTITY_MISMATCH;
      } else {
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

  async retire(reason) {
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
    this.#writeRetired(String(reason || LIFECYCLE_REASON.RETIRED));
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
    this.#writeRetired(LIFECYCLE_REASON.RESEED_REQUIRED);
    this.#state = LIFECYCLE_STATE.RETIRED;
    this.#refusalReason = LIFECYCLE_REASON.RESEED_REQUIRED;
    return frozenResult(
      RAFT_OPERATION_OUTCOME.CORE_OK, LIFECYCLE_REASON.RESEED_REQUIRED);
  }

  // The row the open-time refusal reads, synced to disk before the hold or
  // the retirement is reported (owner decision O4): a power loss must not
  // bring the replica back active.
  #writeRetired(reason) {
    commitDurably(this.#db, () => this.#db.prepare(`
      UPDATE ${LIFECYCLE_TABLE}
      SET state = 'retired', reason = ?, changed_at = ?
      WHERE group_id = ? AND peer_id = ? AND replica_identity = ?
    `).run(
      reason,
      new Date().toISOString(),
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
 * @return {Promise<Object>} Frozen outcome.
 */
async function retireReplicaLifecycle({runtime, groupId, replicaIdentity,
  reason}) {
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
  return owner.retire(reason);
}

export {
  RaftRsReplicaLifecycleOwner,
  registerRuntimeLifecycle,
  retireReplicaLifecycle,
  unregisterRuntimeLifecycle,
};
