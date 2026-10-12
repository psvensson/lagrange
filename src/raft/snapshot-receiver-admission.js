// Receiver/lifecycle facts consumed by native FRESH_CREATE snapshot installation.
// CREATE still owns authorization; the installer still owns markers and swap.
import path from 'node:path';
import {inspectReplicaLifecycleForSnapshot} from './raft-rs-replica-lifecycle-owner.js';
import {RAFT_OPERATION_OUTCOME} from './raft-operation-port-constants.js';
import {readCheckpoint} from './snapshot-checkpoint-store.js';
import {RAFT_CHECKPOINT_PAYLOAD_KIND, RAFT_CHECKPOINT_VALIDATION_OUTCOME} from
  './snapshot-checkpoint-constants.js';
import {RAFT_SNAPSHOT_INSTALL_DIRNAME, RAFT_SNAPSHOT_INSTALL_STAGING_FILE} from
  './snapshot-install-constants.js';

const INVALID_RECEIVER = Object.freeze({outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
  reason: 'snapshot-receiver-descriptor-mismatch', detail: null});

/** Obtain the existing receiver's lifecycle facts from its sole owner.
 * @param {Object} options - Receiver path, validated descriptor and CREATE identity.
 * @return {Object} Immutable owner result, not install permission.
 */
function inspectSnapshotReceiver({replicaDbPath, descriptor, replicaIdentity,
  stagedDbPath = null}) {
  const raft = descriptor?.raftRs;
  const peer = raft?.peerReservations.find((row) => row.replicaIdentity === replicaIdentity);
  if (!peer || !raft.confState.learners.includes(peer.peerId)) return INVALID_RECEIVER;
  return inspectReplicaLifecycleForSnapshot({receiverDbPath: replicaDbPath, stagedDbPath,
    groupId: raft.groupId, peerId: peer.peerId, replicaIdentity});
}

/** Revalidate receiver and staged identity at both normal and restart swap boundaries.
 * The existing marker digest must ALSO match; no later observation renews its binding.
 * @param {string} checkpointsRoot - Existing install root.
 * @param {string} replicaDbPath - Receiver to be replaced.
 * @param {Object} marker - Existing CREATE-bound install marker.
 * @return {boolean} Whether receiver facts still permit this fresh-create operation.
 */
function snapshotReceiverStillAdmitted(checkpointsRoot, replicaDbPath, marker) {
  const checkpoint = readCheckpoint({checkpointDir:
    path.join(checkpointsRoot, String(marker.generationIndex))});
  const authority = marker.createAuthority;
  const descriptor = checkpoint.descriptor;
  if (checkpoint.outcome !== RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID ||
      descriptor.payloadKind !== RAFT_CHECKPOINT_PAYLOAD_KIND.RAFT_RS_REPLICA_IMAGE ||
      descriptor.raftRs.groupId !== authority?.partitionId ||
      descriptor.entity.kind !== authority?.entityType ||
      descriptor.entity.id !== authority?.entityId) return false;
  return inspectSnapshotReceiver({replicaDbPath, descriptor,
    replicaIdentity: authority.replicaId, stagedDbPath:
      path.join(checkpointsRoot, RAFT_SNAPSHOT_INSTALL_DIRNAME, RAFT_SNAPSHOT_INSTALL_STAGING_FILE),
  }).outcome === RAFT_OPERATION_OUTCOME.CORE_OK;
}

export {inspectSnapshotReceiver, snapshotReceiverStillAdmitted};
