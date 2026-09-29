import {
  retireReplicaLifecycle,
} from './raft-rs-replica-lifecycle-owner.js';

// Retire the exact runtime generation the caller holds (its own operation
// port); never the current runtime of a reused logical name.
function retireReplica(replicaIdentity, reason, {groupId, runtime}) {
  return retireReplicaLifecycle({runtime, groupId, replicaIdentity, reason});
}

const raftRsLifecycleAdministration = Object.freeze({
  retireReplica: Object.freeze(retireReplica),
});

export {raftRsLifecycleAdministration};
