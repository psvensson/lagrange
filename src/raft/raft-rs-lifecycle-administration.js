import {
  LIFECYCLE_STATE,
  readDurableReplicaLifecycle,
  retireReplicaLifecycle,
} from './raft-rs-replica-lifecycle-owner.js';

// Retire the exact runtime generation the caller holds (its own operation
// port); never the current runtime of a reused logical name.
function retireReplica(replicaIdentity, reason, {groupId, runtime}) {
  return retireReplicaLifecycle({runtime, groupId, replicaIdentity, reason});
}

// Whether a durable lifecycle read is a retirement for exactly this reason
// (an absent or unreadable read, or another reason, is not).
function isRetiredFor(lifecycle, reason) {
  return lifecycle?.state === LIFECYCLE_STATE.RETIRED &&
    lifecycle.reason === reason;
}

const raftRsLifecycleAdministration = Object.freeze({
  retireReplica: Object.freeze(retireReplica),
  // The durable lifecycle row of one (group, replica identity) in a replica
  // database file, read-only (survives a restart that dropped the replica).
  readReplicaLifecycle: Object.freeze(readDurableReplicaLifecycle),
  isRetiredFor: Object.freeze(isRetiredFor),
});

export {raftRsLifecycleAdministration};
