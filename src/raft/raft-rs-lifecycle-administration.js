import {
  DURABLE_LIFECYCLE_READ,
  LIFECYCLE_STATE,
  readDurableReplicaLifecycle,
  retireReplicaLifecycle,
} from './raft-rs-replica-lifecycle-owner.js';

// Retire the exact runtime generation the caller holds (its own operation
// port); never the current runtime of a reused logical name. A retirement
// with the whole group records its verified evidence with the row.
function retireReplica(replicaIdentity, reason, {groupId, runtime,
  evidence = null}) {
  return retireReplicaLifecycle({runtime, groupId, replicaIdentity, reason,
    evidence});
}

// Whether a durable lifecycle read is a retirement for exactly this reason
// (an absent or unreadable read, or another reason, is not).
function isRetiredFor(lifecycle, reason) {
  return lifecycle?.state === LIFECYCLE_STATE.RETIRED &&
    lifecycle.reason === reason;
}

// Whether a durable lifecycle read is a retirement of any reason: the
// replica generation never acts again (a retired row never turns active).
function isRetired(lifecycle) {
  return lifecycle?.state === LIFECYCLE_STATE.RETIRED;
}

// Whether a durable lifecycle read found no row for the identity (its
// database, or its row, is gone) - never an unreadable database.
function isAbsent(lifecycle) {
  return lifecycle?.state === DURABLE_LIFECYCLE_READ.ABSENT.state;
}

// Whether a durable lifecycle read found a row (active or retired) for the
// identity: neither an absent row nor an unreadable database.
function holdsRow(lifecycle) {
  return lifecycle?.state === LIFECYCLE_STATE.ACTIVE ||
    lifecycle?.state === LIFECYCLE_STATE.RETIRED;
}

const raftRsLifecycleAdministration = Object.freeze({
  retireReplica: Object.freeze(retireReplica),
  // The durable lifecycle row of one (group, replica identity) in a replica
  // database file, read-only (survives a restart that dropped the replica).
  readReplicaLifecycle: Object.freeze(readDurableReplicaLifecycle),
  isRetiredFor: Object.freeze(isRetiredFor),
  isRetired: Object.freeze(isRetired),
  isAbsent: Object.freeze(isAbsent),
  holdsRow: Object.freeze(holdsRow),
});

export {raftRsLifecycleAdministration};
