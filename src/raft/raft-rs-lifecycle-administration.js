import {
  retireReplicaLifecycle,
} from './raft-rs-replica-lifecycle-owner.js';

function retireReplica(replicaIdentity, reason, {groupId}) {
  return retireReplicaLifecycle({groupId, replicaIdentity, reason});
}

const raftRsLifecycleAdministration = Object.freeze({
  retireReplica: Object.freeze(retireReplica),
});

export {raftRsLifecycleAdministration};
