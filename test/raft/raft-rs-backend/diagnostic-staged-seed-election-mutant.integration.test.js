// Diagnostic counterfactual only. This file must not land: it keeps the
// durability production parent unchanged and changes only when deferred seed
// elections start. If the frozen learner-safety integration reaches its
// target on the same slow host, all-at-once election fan-out is the competing
// owner interaction to repair; the 1 s fixture bound and FULL durability stay
// unchanged.

import {SeedPartitionsPhase} from
  '../../../src/bootstrap/phases/seed-partitions-phase.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../../src/bootstrap/system-table-schemas-constants.js';

const REQUIRED_TABLES = Object.freeze([
  SYSTEM_TABLE_NAME.PARTITIONS,
  SYSTEM_TABLE_NAME.SERVICES,
  SYSTEM_TABLE_NAME.TABLES,
  SYSTEM_TABLE_NAME.MESSAGE_GROUPS,
]);
const REQUIRED_PARTITIONS = Object.freeze(REQUIRED_TABLES.map((tableName) =>
  INITIAL_PARTITION_IDS[tableName]));
const REQUIRED_PARTITION_SET = new Set(REQUIRED_PARTITIONS);
const originalStartElections =
  SeedPartitionsPhase.prototype.startDeferredBootstrapReplicaElections;

SeedPartitionsPhase.prototype.startDeferredBootstrapReplicaElections =
  async function stagedDiagnosticElections() {
    const deferred = [];
    for (const replica of this.delegates.getPartitionReplicas()) {
      if (REQUIRED_PARTITION_SET.has(replica.partitionId)) continue;
      const hadOwnStart = Object.hasOwn(replica, 'startElection');
      const ownStart = Object.getOwnPropertyDescriptor(replica,
        'startElection');
      const start = replica.startElection.bind(replica);
      replica.startElection = () => undefined;
      deferred.push({replica, hadOwnStart, ownStart, start});
    }

    try {
      await originalStartElections.call(this);
      await this.waitForPartitionLeadership({
        partitionIds: REQUIRED_PARTITIONS,
      });
    } finally {
      for (const item of deferred) {
        if (item.hadOwnStart) {
          Object.defineProperty(item.replica, 'startElection', item.ownStart);
        } else {
          delete item.replica.startElection;
        }
      }
    }
    for (const item of deferred) item.start();
  };

await import('../../integration/critical-partition-learner-safety.integration.test.js');
