// A local partition replica as the CDC bootstrap lane meets it (the seed's
// registration window, src/cdc/cdc-bootstrap-direct-sql.js): a write rides its
// raft lane (executeQuery) and is answered what the partition service answers
// its proposer; a statement on its local lane (executeLocalQuery) runs outside
// raft and is only counted, so a witness counts both lanes.
//
// The raft lane's answer is built by the partition's own code: the entry as
// proposeWrite builds it (buildPartitionWriteEntry: the minted entryId, the
// proposing replica and its HLC), resolved as the leader resolves the committed
// write to its proposer (applyCommittedEntry: changes and lastInsertRowid with
// PartitionServiceEntryApplyBase#buildCommittedWriteIdentity, the position and
// the durable commit witness). A refusing replica answers the write kernel's
// own NOT_LEADER refusal (buildPartitionWriteLeadershipRefusal), the refusal
// test/test-helpers/seed-bootstrap-lane-observer.js injects into a real seed.
// The shared producer-answer helper (committedPartitionWriteAnswer in
// test/test-helpers/committed-write-answer.js) lives on
// work/line-regression-receipt-fakes-20261121; this answer moves onto it when
// the branches meet.
import {HLCTimestamp} from '../../src/hlc/hlc-timestamp.js';
import {PartitionServiceEntryApplyBase} from
  '../../src/partition/partition-service-entry-apply-base.js';
import {PARTITION_SERVICE_OPERATION} from
  '../../src/partition/partition-service-constants.js';
import {
  buildPartitionWriteEntry,
  buildPartitionWriteLeadershipRefusal,
} from '../../src/partition/partition-write-kernel.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';

const BUILD_COMMITTED_WRITE_IDENTITY =
  PartitionServiceEntryApplyBase.prototype.buildCommittedWriteIdentity;
const LANE_NODE_ID = 'bootstrap-lane-seed';
const COMMITTED_TERM = 1;
const CHANGED_ROWS = 1;
const NO_ROWID = 0;
// The proposer's physical clock reading (ms), fixed so answers are stable.
const PROPOSER_PHYSICAL_MS = 1767225600000;

/**
 * The raft lane's refusal of a write on a replica that does not lead the
 * partition, as the partition answers it (returned, not thrown).
 * @param {string} partitionId - The refusing partition.
 * @return {Object} The write kernel's NOT_LEADER refusal.
 */
function raftLaneRefusal(partitionId) {
  return buildPartitionWriteLeadershipRefusal({role: RAFT_ROLE.FOLLOWER}, partitionId);
}

function committedRaftLaneAnswer(replica, sql, params) {
  const logIndex = replica.raftWrites.length;
  const operation = {type: PARTITION_SERVICE_OPERATION.QUERY, sql, params};
  const entry = buildPartitionWriteEntry(operation, {
    timestamp: new HLCTimestamp(PROPOSER_PHYSICAL_MS, logIndex, replica.replicaId),
    proposedBy: replica.replicaId,
    proposedAt: PROPOSER_PHYSICAL_MS,
  });
  return {
    success: true,
    changes: CHANGED_ROWS,
    lastInsertRowid: NO_ROWID,
    ...BUILD_COMMITTED_WRITE_IDENTITY.call(replica, entry, logIndex, COMMITTED_TERM),
  };
}

/**
 * One local replica of a bootstrap-window partition.
 * @param {Object} options
 * @param {string} options.partitionId - The replica's partition.
 * @param {string} [options.tableName] - The table it serves, when declared.
 * @param {boolean} [options.refuse] - It does not lead the partition: its
 *   raft lane refuses every write (raftLaneRefusal). Otherwise it leads and
 *   every write commits.
 * @return {Object} The replica: raftWrites and outsideRaft hold one
 *   {sql, params} per statement its raft lane resp. local lane executed.
 */
function createBootstrapLaneReplica({partitionId, tableName, refuse = false}) {
  const replica = {
    partitionId,
    tableName,
    isLeader: !refuse,
    initialized: true,
    nodeId: LANE_NODE_ID,
    replicaId: `${partitionId}-r1`,
    raftWrites: [],
    outsideRaft: [],
    async executeQuery(sql, params = []) {
      replica.raftWrites.push({sql, params});
      return refuse ? raftLaneRefusal(partitionId) :
        committedRaftLaneAnswer(replica, sql, params);
    },
    async executeLocalQuery(sql, params = []) {
      replica.outsideRaft.push({sql, params});
      return {success: true, changes: CHANGED_ROWS, lastInsertRowid: NO_ROWID, partitionId};
    },
  };
  return replica;
}

export {createBootstrapLaneReplica, raftLaneRefusal};
