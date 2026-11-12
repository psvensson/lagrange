import {captureReplicaAdmission, isReplicaAdmissionCurrent} from
  '../node/replica-state-machine-serialization.js';
import {runSerializedReplicaMutation} from '../node/replica-state-machine-serialization.js';
import {pendingTurn, turnChainValue} from '../raft/raft-rs-turn-answer.js';
import {installAuthoritativeReplicaLifecycleInLane} from
  '../node/replica-state-machine-recovery.js';
import {SERVICE_STATUS, SERVICE_TYPE} from '../constants/index.js';
import {buildReplicaLifecycleMutationPredicateFromRow,
  rowMatchesReplicaLifecyclePredicate, observeAuthoritativeReplicaLifecycle} from
  '../node/replica-state-machine-lifecycle-observation.js';

const DURABLE_REJOIN_LIFECYCLE_AUTHORITY_MISSING_MSG =
  'Durable rejoin replica refused: lifecycle authority changed';
const DURABLE_REJOIN_LIFECYCLE_AUTHORITY_CHANGED =
  'DURABLE_REJOIN_LIFECYCLE_AUTHORITY_CHANGED';

function durableRejoinAuthorityChanged(replicaId) {
  const error = new Error(`${DURABLE_REJOIN_LIFECYCLE_AUTHORITY_MISSING_MSG}: ${replicaId}`);
  error.code = DURABLE_REJOIN_LIFECYCLE_AUTHORITY_CHANGED;
  error.deferRetry = true;
  return error;
}

async function assertDurableRejoinStorageAdmission(
  replicaStateMachine,
  options,
) {
  if (options.restoringExistingReplica !== true) return null;
  const replicaId = options.replicaId;
  const source = buildReplicaLifecycleMutationPredicateFromRow(options.lifecycleAuthority);
  if (source.service_id !== replicaId || source.node_id !== replicaStateMachine.nodeId ||
      source.service_type !== SERVICE_TYPE.PARTITION || source.status !== SERVICE_STATUS.ACTIVE) {
    throw durableRejoinAuthorityChanged(replicaId);
  }
  const admission = captureReplicaAdmission(replicaStateMachine, replicaId);
  const restore = async () => {
    if (!isReplicaAdmissionCurrent(replicaStateMachine, replicaId, admission)) {
      throw durableRejoinAuthorityChanged(replicaId);
    }
    const observation = await observeAuthoritativeReplicaLifecycle(replicaStateMachine, replicaId);
    if (observation.available !== true ||
        !isReplicaAdmissionCurrent(replicaStateMachine, replicaId, admission) ||
        !rowMatchesReplicaLifecyclePredicate(observation.row, source) ||
        !installAuthoritativeReplicaLifecycleInLane(replicaStateMachine, replicaId,
          observation.row, admission)) throw durableRejoinAuthorityChanged(replicaId);
    // This is the admission produced by our own synchronous exact install,
    // carried into construction; no later map read can replace its provenance.
    return Object.freeze({row: Object.freeze({...observation.row}),
      owner: replicaStateMachine, admission: captureReplicaAdmission(replicaStateMachine, replicaId)});
  };
  const restored = await turnChainValue(runSerializedReplicaMutation(replicaStateMachine, replicaId,
    () => pendingTurn(restore())));
  if (!restored) throw durableRejoinAuthorityChanged(replicaId);
  return restored;
}

export {assertDurableRejoinStorageAdmission};
