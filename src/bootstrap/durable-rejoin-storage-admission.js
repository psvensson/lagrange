import {captureReplicaAdmission, isReplicaAdmissionCurrent} from
  '../node/replica-state-machine-serialization.js';
import {buildReplicaLifecycleMutationPredicateFromRow,
  rowMatchesReplicaLifecyclePredicate, observeAuthoritativeReplicaLifecycle} from
  '../node/replica-state-machine-lifecycle-observation.js';

const DURABLE_REJOIN_LIFECYCLE_AUTHORITY_MISSING_MSG =
  'Durable rejoin replica refused: lifecycle authority changed';
const DURABLE_REJOIN_LIFECYCLE_AUTHORITY_CHANGED =
  'DURABLE_REJOIN_LIFECYCLE_AUTHORITY_CHANGED';


async function assertDurableRejoinStorageAdmission(
  replicaStateMachine,
  options,
) {
  if (options.restoringExistingReplica !== true) return null;
  const admission = captureReplicaAdmission(replicaStateMachine, options.replicaId);
  const observation = await observeAuthoritativeReplicaLifecycle(
    replicaStateMachine,
    options.replicaId,
  );
  if (observation.available === true &&
      isReplicaAdmissionCurrent(replicaStateMachine, options.replicaId, admission) &&
      rowMatchesReplicaLifecyclePredicate(observation.row,
        buildReplicaLifecycleMutationPredicateFromRow(options.lifecycleAuthority))) {
    return Object.freeze({row: Object.freeze({...observation.row}),
      owner: replicaStateMachine, admission});
  }
  const error = new Error(
    `${DURABLE_REJOIN_LIFECYCLE_AUTHORITY_MISSING_MSG}: ${options.replicaId}`,
  );
  error.code = DURABLE_REJOIN_LIFECYCLE_AUTHORITY_CHANGED;
  error.deferRetry = true;
  throw error;
}

export {assertDurableRejoinStorageAdmission};
