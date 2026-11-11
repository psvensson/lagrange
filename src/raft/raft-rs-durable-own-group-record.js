/**
 * Owner contract:
 * Owner: what one replica's OWN durable record says about its group, read
 * read-only from its database file without opening a runtime (2026-11-11):
 * its applied configuration (the raft-rs ConfState persisted with its applied
 * index) against its own peer id (its lifecycle row), and whether the record
 * holds any history (a log entry with a payload, or a snapshot).
 * Inputs: the replica's database file, its group and its replica identity.
 * Canonical output: a frozen {membership, history}:
 *  membership (DURABLE_OWN_MEMBERSHIP)
 *   SOLE_MEMBER       the applied configuration names this replica as its
 *                     only voter and names nobody else in any role, and no
 *                     configuration change waits beyond the applied index:
 *                     no other replica's agreement exists to be needed;
 *   CHANGE_PENDING    the applied configuration names only this replica, but
 *                     the record holds a configuration-change entry, or a
 *                     snapshot, beyond the applied index (a sole voter's
 *                     persisted change commits without anyone else: the
 *                     group may already be larger than the applied row says);
 *   SHARED            the applied configuration names another replica (a
 *                     stale file of a former member reads SHARED for ever:
 *                     only its group can say it was removed);
 *   NO_CONFIGURATION  the record holds no configuration (no member at all);
 *   NO_LIFECYCLE_ROW  the file is absent, or holds no lifecycle row for the
 *                     identity: its peer id is unknown.
 *  history (DURABLE_OWN_HISTORY): EMPTY (no log entry carries a payload and
 *   no snapshot is stored: nothing was ever proposed in the group) or HELD.
 * A file or table that cannot be read THROWS (the store's own error, naming
 * the table): unreadable is never one of the states above.
 * Prohibited: a write, a schema change, or a verdict from an unreadable file.
 */
import fs from 'node:fs';
import Database from 'better-sqlite3';
import {RaftRsDurableStore} from './raft-rs-durable-store.js';
import {RAFT_RS_CONF_CHANGE_ENTRY_TYPES} from
  './raft-rs-ready-loop-constants.js';
import {REPLICA_LIFECYCLE_TABLE} from
  './raft-rs-replica-lifecycle-constants.js';

const DURABLE_OWN_MEMBERSHIP = Object.freeze({
  SOLE_MEMBER: 'durable-own-membership-sole-member',
  CHANGE_PENDING: 'durable-own-membership-change-pending',
  SHARED: 'durable-own-membership-shared',
  NO_CONFIGURATION: 'durable-own-membership-no-configuration',
  NO_LIFECYCLE_ROW: 'durable-own-membership-no-lifecycle-row',
});
const DURABLE_OWN_HISTORY = Object.freeze({
  EMPTY: 'durable-own-history-empty',
  HELD: 'durable-own-history-held',
});
const NO_LIFECYCLE_ROW = Object.freeze({
  membership: DURABLE_OWN_MEMBERSHIP.NO_LIFECYCLE_ROW,
  history: DURABLE_OWN_HISTORY.EMPTY,
});
// The field a durable log entry carries its payload in (the durable store's
// record omits it for an entry without one).
const ENTRY_PAYLOAD_FIELD = 'data';
const SELECT_OWN_PEER_ID = `SELECT peer_id FROM ${REPLICA_LIFECYCLE_TABLE}
  WHERE group_id = ? AND replica_identity = ?`;

function membersOf(confState) {
  return [...confState.voters, ...confState.votersOutgoing,
    ...confState.learners, ...confState.learnersNext].map(String);
}

// Whether the record holds a configuration the applied row does not show
// yet: a configuration-change entry, or a stored snapshot, beyond it.
function changeWaitsBeyondApplied(record) {
  const applied = BigInt(record.appliedIndex);
  return record.entries.some((entry) => BigInt(entry.index) > applied &&
      RAFT_RS_CONF_CHANGE_ENTRY_TYPES.includes(entry.entryType)) ||
    (record.snapshot !== null &&
      BigInt(record.snapshot.metadata.index) > applied);
}

function membershipOf(record, peerId) {
  const members = membersOf(record.confState);
  if (members.length === 0) {
    return DURABLE_OWN_MEMBERSHIP.NO_CONFIGURATION;
  }
  const sole = members.length === 1 &&
    String(record.confState.voters[0]) === peerId;
  if (!sole) {
    return DURABLE_OWN_MEMBERSHIP.SHARED;
  }
  return changeWaitsBeyondApplied(record) ?
    DURABLE_OWN_MEMBERSHIP.CHANGE_PENDING : DURABLE_OWN_MEMBERSHIP.SOLE_MEMBER;
}

function historyOf(record) {
  return record.snapshot === null &&
    record.entries.every((entry) => !Object.hasOwn(entry, ENTRY_PAYLOAD_FIELD)) ?
    DURABLE_OWN_HISTORY.EMPTY : DURABLE_OWN_HISTORY.HELD;
}

function ownGroupRecordIn(db, groupId, replicaIdentity) {
  const row = db.prepare(SELECT_OWN_PEER_ID)
    .get(String(groupId), String(replicaIdentity));
  if (row === undefined) {
    return NO_LIFECYCLE_ROW;
  }
  const record = RaftRsDurableStore.readDurableRecordIn(db, groupId);
  return Object.freeze({
    membership: membershipOf(record, String(row.peer_id)),
    history: historyOf(record),
  });
}

/**
 * One replica's own durable group record, in one read snapshot.
 * @param {string} dbPath - The replica's database file.
 * @param {string} groupId
 * @param {string} replicaIdentity
 * @return {Object} Frozen {membership, history}.
 * @throws {Error} When the file or one of its record tables cannot be read.
 */
function readDurableOwnGroupRecord(dbPath, groupId, replicaIdentity) {
  if (!fs.existsSync(dbPath)) {
    return NO_LIFECYCLE_ROW;
  }
  const db = new Database(dbPath, {readonly: true, fileMustExist: true});
  try {
    return db.transaction(() =>
      ownGroupRecordIn(db, groupId, replicaIdentity))();
  } finally {
    db.close();
  }
}

export {
  DURABLE_OWN_HISTORY,
  DURABLE_OWN_MEMBERSHIP,
  readDurableOwnGroupRecord,
};
