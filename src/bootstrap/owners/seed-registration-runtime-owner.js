import {assertCritical} from '../../utils/assert.js';
import {
  BOOTSTRAP_ERROR,
} from '../bootstrap-constants.js';
import {
  INITIAL_REPLICA_IDS,
} from '../system-table-schemas-constants.js';

class SeedRegistrationRuntimeOwner {
  constructor(options = {}) {
    this.delegates = options.delegates || {};
  }

  findLeaderPartition(tableName) {
    const replicaIds = INITIAL_REPLICA_IDS[tableName];
    assertCritical(
      replicaIds,
      BOOTSTRAP_ERROR.PARTITION_REPLICAS_MISSING,
    );

    for (const replicaId of replicaIds) {
      const partition =
        this.delegates.getPartitionServices().get(replicaId);
      if (partition && partition.isLeader) {
        return partition;
      }
    }

    return null;
  }

  getLeaderPartition(tableName) {
    const partition = this.findLeaderPartition(tableName);
    if (partition) {
      return partition;
    }
    throw new Error(BOOTSTRAP_ERROR.PARTITION_LEADER_MISSING);
  }
}

export {SeedRegistrationRuntimeOwner};
