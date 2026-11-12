/**
 * Owner contract:
 * Owner: what one replica's OWN durable record says about its group, read
 * from its database file without opening a runtime (2026-11-11): its applied
 * configuration (the raft-rs ConfState persisted with its applied index)
 * against its own peer id (its lifecycle row), and whether the record holds
 * any history. Both come from one read snapshot of the file, opened by the
 * lifecycle owner's read (readDurableReplicaLifecycleBeside): read-only, no
 * database created, no page changed (the connection may leave the file's
 * shared-memory sidecars, which are removed with the database).
 * Inputs: the replica's database file, its group and its replica identity.
 * Canonical output: a frozen {membership, history, cause} (cause: the
 * lifecycle read's {reason, code, subject} when UNREADABLE, else null):
 *  membership (DURABLE_OWN_MEMBERSHIP)
 *   SOLE_MEMBER       the applied configuration names this replica as its
 *                     only voter and names nobody else in any role: no other
 *                     replica's agreement exists to be needed;
 *   SHARED            the applied configuration names another replica (a
 *                     stale file of a former member reads SHARED for ever:
 *                     only its group can say it was removed);
 *   NO_CONFIGURATION  the record holds no configuration (no member at all);
 *   NO_LIFECYCLE_ROW  the file is positively absent: no record exists;
 *   UNREADABLE        the file, its lifecycle table, its row for the
 *                     identity or its record cannot be read (a database
 *                     without the table or the row included).
 *  history (DURABLE_OWN_HISTORY)
 *   EMPTY    no log entry carries a payload and no snapshot is stored:
 *            nothing was ever proposed in the group (a configuration change
 *            is a payload, so a change persisted but not yet applied - the
 *            only way a sole voter's applied row can lag its group - is
 *            HELD; a compacted log leaves its snapshot);
 *   HELD     a payload or a snapshot is stored;
 *   UNKNOWN  no record was read (NO_LIFECYCLE_ROW, UNREADABLE).
 * Prohibited: a write, or a verdict from an unreadable file.
 */
import {RaftRsDurableStore} from './raft-rs-durable-store.js';
import {
  DURABLE_LIFECYCLE_READ,
  readDurableReplicaLifecycleBeside,
} from './raft-rs-replica-lifecycle-owner.js';

const DURABLE_OWN_MEMBERSHIP = Object.freeze({
  SOLE_MEMBER: 'durable-own-membership-sole-member',
  SHARED: 'durable-own-membership-shared',
  NO_CONFIGURATION: 'durable-own-membership-no-configuration',
  NO_LIFECYCLE_ROW: 'durable-own-membership-no-lifecycle-row',
  UNREADABLE: 'durable-own-membership-unreadable',
});
const DURABLE_OWN_HISTORY = Object.freeze({
  EMPTY: 'durable-own-history-empty',
  HELD: 'durable-own-history-held',
  UNKNOWN: 'durable-own-history-unknown',
});
const NO_LIFECYCLE_ROW = Object.freeze({
  membership: DURABLE_OWN_MEMBERSHIP.NO_LIFECYCLE_ROW,
  history: DURABLE_OWN_HISTORY.UNKNOWN,
  cause: null,
});

function unreadableBecause(lifecycle) {
  return Object.freeze({
    membership: DURABLE_OWN_MEMBERSHIP.UNREADABLE,
    history: DURABLE_OWN_HISTORY.UNKNOWN,
    cause: Object.freeze({reason: lifecycle.reason,
      code: lifecycle.cause?.code ?? null,
      subject: lifecycle.cause?.subject ?? null}),
  });
}
// The field a durable log entry carries its payload in (the durable store's
// record omits it for an entry without one).
const ENTRY_PAYLOAD_FIELD = 'data';

// Every replica the configuration names. learnersNext is not read: raft-rs
// holds it only inside a joint configuration, for voters it is demoting, and
// those are votersOutgoing.
function membersOf(confState) {
  return [...confState.voters, ...confState.votersOutgoing,
    ...confState.learners].map(String);
}

function membershipOf(record, peerId) {
  const members = membersOf(record.confState);
  if (members.length === 0) {
    return DURABLE_OWN_MEMBERSHIP.NO_CONFIGURATION;
  }
  return members.length === 1 && String(record.confState.voters[0]) === peerId ?
    DURABLE_OWN_MEMBERSHIP.SOLE_MEMBER : DURABLE_OWN_MEMBERSHIP.SHARED;
}

function historyOf(record) {
  return record.snapshot === null && record.entries.every((entry) =>
    !Object.hasOwn(entry, ENTRY_PAYLOAD_FIELD)) ?
    DURABLE_OWN_HISTORY.EMPTY : DURABLE_OWN_HISTORY.HELD;
}

/**
 * One replica's own durable group record, in one read snapshot.
 * @param {string} dbPath - The replica's database file.
 * @param {string} groupId
 * @param {string} replicaIdentity
 * @return {Object} Frozen {membership, history, cause}.
 */
function readDurableOwnGroupRecord(dbPath, groupId, replicaIdentity) {
  const {lifecycle, beside: record} = readDurableReplicaLifecycleBeside(
    dbPath, groupId, replicaIdentity,
    (db) => RaftRsDurableStore.readDurableRecordIn(db, groupId));
  if (lifecycle.state === DURABLE_LIFECYCLE_READ.UNREADABLE.state) {
    return unreadableBecause(lifecycle);
  }
  return record === null ? NO_LIFECYCLE_ROW : Object.freeze({
    membership: membershipOf(record, lifecycle.peerId),
    history: historyOf(record),
    cause: null,
  });
}

export {
  DURABLE_OWN_HISTORY,
  DURABLE_OWN_MEMBERSHIP,
  readDurableOwnGroupRecord,
};
