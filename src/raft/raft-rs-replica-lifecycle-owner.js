import {
  RAFT_OPERATION_OUTCOME,
} from './raft-operation-port-constants.js';

const LIFECYCLE_TABLE = '_raft_rs_replica_lifecycle';
const LIFECYCLE_STATE = Object.freeze({
  ACTIVE: 'active',
  RETIRED: 'retired',
});
const OWNERS = new Map();
const LIFECYCLE_ADMIN_OUTCOME = Object.freeze({NOT_MANAGED: 'NOT_MANAGED'});
const LIFECYCLE_REASON = Object.freeze({
  MISSING: 'lifecycle-record-missing',
  IDENTITY_MISMATCH: 'lifecycle-identity-mismatch',
  RETIRED: 'retired',
  NO_OWNER: 'no-active-raft-rs-lifecycle-owner',
});

function ownerKey(groupId, replicaIdentity) {
  return `${groupId}\u0000${replicaIdentity}`;
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
      SELECT peer_id, replica_identity, state
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
          LIFECYCLE_REASON.RETIRED : null;
      }
    }
    OWNERS.set(ownerKey(groupId, replicaIdentity), this);
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
    this.#db.prepare(`
      UPDATE ${LIFECYCLE_TABLE}
      SET state = 'retired', reason = ?, changed_at = ?
      WHERE group_id = ? AND peer_id = ? AND replica_identity = ?
    `).run(
      String(reason || LIFECYCLE_REASON.RETIRED),
      new Date().toISOString(),
      this.#groupId,
      this.#peerId,
      this.#replicaIdentity,
    );
    this.#state = LIFECYCLE_STATE.RETIRED;
    this.#refusalReason = LIFECYCLE_REASON.RETIRED;
    return frozenResult(
      RAFT_OPERATION_OUTCOME.CORE_OK, LIFECYCLE_REASON.RETIRED);
  }

  unregister() {
    OWNERS.delete(ownerKey(this.#groupId, this.#replicaIdentity));
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

async function retireReplicaLifecycle({groupId, replicaIdentity, reason}) {
  const owner = OWNERS.get(ownerKey(groupId, replicaIdentity));
  if (!owner) {
    return frozenResult(
      LIFECYCLE_ADMIN_OUTCOME.NOT_MANAGED,
      LIFECYCLE_REASON.NO_OWNER,
    );
  }
  return owner.retire(reason);
}

export {
  RaftRsReplicaLifecycleOwner,
  retireReplicaLifecycle,
};
