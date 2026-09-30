import {observeAuthoritativeReplicaLifecycle} from
  '../node/replica-state-machine-lifecycle-observation.js';

const DURABLE_REJOIN_LIFECYCLE_AUTHORITY_MISSING_MSG =
  'Durable rejoin replica refused: lifecycle authority changed';
const DURABLE_REJOIN_LIFECYCLE_AUTHORITY_CHANGED =
  'DURABLE_REJOIN_LIFECYCLE_AUTHORITY_CHANGED';

function rowMatchesRestoreAuthority(row, authority) {
  if (!Number.isFinite(authority?.durableVersion)) return false;
  const expected = {
    service_id: authority.replicaId,
    service_type: authority.serviceType,
    partition_id: authority.partitionId,
    node_id: authority.nodeId,
    status: authority.status,
    [authority.durableVersionColumn]: authority.durableVersion,
  };
  return Object.entries(expected).every(([field, value]) =>
    row?.[field] === value);
}

async function assertDurableRejoinStorageAdmission(
  replicaStateMachine,
  options,
) {
  if (options.restoringExistingReplica !== true) return;
  const observation = await observeAuthoritativeReplicaLifecycle(
    replicaStateMachine,
    options.replicaId,
  );
  if (observation.available === true &&
      rowMatchesRestoreAuthority(observation.row, options.lifecycleAuthority)) {
    return;
  }
  const error = new Error(
    `${DURABLE_REJOIN_LIFECYCLE_AUTHORITY_MISSING_MSG}: ${options.replicaId}`,
  );
  error.code = DURABLE_REJOIN_LIFECYCLE_AUTHORITY_CHANGED;
  error.deferRetry = true;
  throw error;
}

export {assertDurableRejoinStorageAdmission};
