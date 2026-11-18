/**
 * Lost partition-replica storage on a fresh-storage registration.
 *
 * A boot lifecycle whose pre-hints startup decision classified its data
 * directory as fresh storage (`joinLifecycleIntentType ===
 * MEMBERSHIP_LIFECYCLE_INTENT.JOIN_ADMISSION`, preserved from
 * `startupMode === 'fresh_join'` across join reattempts even after
 * `persistJoinSeedRejoinHints` writes `rejoin-hints.json` and causes
 * `clusterIncarnationFence.durableMembershipState` to read `'present'`) may
 * find SERVICES rows naming this node from an earlier life. For each such
 * partition replica whose row proves prior existence (SYNCING or ACTIVE: its
 * port opened) while this data directory holds no database for it, the
 * replica's history is proven lost and is transitioned to FAILED by its
 * lifecycle owner (`ReplicaStateMachine`), with `DURABLE_RECORD_MISSING`.
 *
 * On `DURABLE_REJOIN` (`RESTART_REENTRY`), single-partition `ENOENT` is
 * handled earlier at restore open (`ensureDurableRejoinPartitionRuntimes`,
 * before `waitForSystemServiceLeaders` elects `TABLES.SERVICES` leaders): the
 * replica is fenced out of activation and election under owner decision O4.
 *
 * Message-group replicas are not covered: the message-group owner holds them
 * reseed-required at open and has no replacement path (a recorded residual).
 */

import {COLUMN, SERVICE_TYPE, TABLES} from '../../constants/index.js';
import {
  MEMBERSHIP_LIFECYCLE_INTENT,
} from '../../control-plane/membership-lifecycle-controller.js';
import {ReplicaStatus} from '../../rebalancer/replica-status.js';
import {COMMITTED_MEMBERSHIP_REFUSAL} from
  '../../raft/raft-committed-membership-constants.js';
import {PARTITION_REPLICA_STORAGE_STATE} from
  '../../storage/data-directory-manager.js';

const SELECT_NODE_PARTITION_SERVICE_ROWS_SQL =
  `SELECT * FROM ${TABLES.SERVICES} ` +
  `WHERE ${COLUMN.NODE_ID} = ? AND ${COLUMN.SERVICE_TYPE} = ?`;

// A row in one of these states proves the replica existed on this node: its
// port opened (the prior-existence fact of the open-time refusal).
const PRIOR_EXISTENCE_REPLICA_STATUSES = Object.freeze(new Set([
  ReplicaStatus.SYNCING,
  ReplicaStatus.ACTIVE,
]));

/**
 * Whether this registration belongs to a fresh-storage join lifecycle
 * (`startupMode === 'fresh_join'` -> `JOIN_ADMISSION`), never a durable
 * restart re-entry (`RESTART_REENTRY`).
 * @param {string} joinLifecycleIntentType
 * @return {boolean}
 */
function isFreshStorageRegistration(joinLifecycleIntentType) {
  return joinLifecycleIntentType === MEMBERSHIP_LIFECYCLE_INTENT.JOIN_ADMISSION;
}

/**
 * The partition rows naming this node whose replica is proven lost.
 * @param {Object[]} rows - Authoritative partition SERVICES rows of the node.
 * @param {string} nodeId
 * @param {Function} readStorageState - ({partitionId, replicaId}) =>
 *   PARTITION_REPLICA_STORAGE_STATE.
 * @return {Object[]}
 */
function selectLostStoragePartitionRows(rows, nodeId, readStorageState) {
  return rows.filter((row) =>
    row?.[COLUMN.NODE_ID] === nodeId &&
    row?.[COLUMN.SERVICE_TYPE] === SERVICE_TYPE.PARTITION &&
    PRIOR_EXISTENCE_REPLICA_STATUSES.has(row?.[COLUMN.STATUS]) &&
    readStorageState({
      partitionId: row[COLUMN.PARTITION_ID],
      replicaId: row[COLUMN.SERVICE_ID],
    }) === PARTITION_REPLICA_STORAGE_STATE.ABSENT);
}

/**
 * Transition every proven-lost partition replica of a fresh-storage
 * registration to FAILED through its lifecycle owner.
 * @param {Object} options
 * @param {string} options.joinLifecycleIntentType - Canonical join lifecycle
 *   intent (`JOIN_ADMISSION` vs `RESTART_REENTRY`).
 * @param {string} options.nodeId
 * @param {number} options.now
 * @param {Function} options.readRows - () => authoritative row outcome
 *   ({state, rows}) of the node's partition SERVICES rows.
 * @param {Function} options.assertReadable - (outcome) => void; throws the
 *   typed deferred error for an UNAVAILABLE read.
 * @param {Function} options.readStorageState - Local storage probe.
 * @param {Function} options.getReplicaStateMachine - () => the node's
 *   ReplicaStateMachine.
 * @return {Promise<string[]>} Service ids transitioned to FAILED.
 */
async function failLostStoragePartitionReplicas(options) {
  if (!isFreshStorageRegistration(options.joinLifecycleIntentType)) {
    return [];
  }
  const outcome = await options.readRows();
  options.assertReadable(outcome);
  const lostRows = selectLostStoragePartitionRows(
    outcome.rows, options.nodeId, options.readStorageState);
  const failed = [];
  for (const row of lostRows) {
    const applied = await options.getReplicaStateMachine()
      .transitionAuthoritativeReplicaGeneration(row, ReplicaStatus.FAILED, {
        timestamp: options.now,
        reason: COMMITTED_MEMBERSHIP_REFUSAL.DURABLE_RECORD_MISSING,
      });
    if (applied === true) {
      failed.push(row[COLUMN.SERVICE_ID]);
    }
  }
  return failed;
}

export {
  SELECT_NODE_PARTITION_SERVICE_ROWS_SQL,
  failLostStoragePartitionReplicas,
  isFreshStorageRegistration,
  selectLostStoragePartitionRows,
};
