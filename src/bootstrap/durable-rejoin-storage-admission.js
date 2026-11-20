import {isCatchupLearnerRaftRole} from '../raft/replica-voter-readiness.js';
import {
  claimLearnerDiskRejoin, isLearnerRetirementToken,
} from '../node/replica-learner-retirement-lifecycle.js';
import {observeAuthoritativeReplicaLifecycle} from
  '../node/replica-state-machine-lifecycle-observation.js';

const DURABLE_REJOIN_LIFECYCLE_AUTHORITY_MISSING_MSG =
  'Durable rejoin replica refused: lifecycle authority changed';
const DURABLE_REJOIN_PLACEMENT_RETIREMENT_OWNS_DISK =
  'DURABLE_REJOIN_PLACEMENT_RETIREMENT_OWNS_DISK';
const DURABLE_REJOIN_LIFECYCLE_AUTHORITY_CHANGED =
  'DURABLE_REJOIN_LIFECYCLE_AUTHORITY_CHANGED';

function matchesRestoreGeneration(row, authority) {
  return Number.isSafeInteger(authority?.replicaCreatedAt) && row?.created_at ===
    authority.replicaCreatedAt && row.service_id === authority.replicaId &&
    row.partition_id === authority.partitionId && row.node_id === authority.nodeId;
}

function rowMatchesRestoreAuthority(row, authority) {
  if (!matchesRestoreGeneration(row, authority) || !Number.isFinite(authority.durableVersion)) {
    return false;
  }
  const expected = {
    service_type: authority.serviceType,
    status: authority.status,
    [authority.durableVersionColumn]: authority.durableVersion,
  };
  return Object.entries(expected).every(([field, value]) =>
    row?.[field] === value);
}

async function claimRestoreGeneration(stateMachine, row) {
  return isCatchupLearnerRaftRole(row.raft_role) ?
    claimLearnerDiskRejoin(stateMachine, row) : true;
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
  const retirementOwnsDisk = observation.available === true &&
    matchesRestoreGeneration(observation.row, options.lifecycleAuthority) &&
    isLearnerRetirementToken(observation.row.cleanup_token);
  if (!retirementOwnsDisk && observation.available === true &&
      rowMatchesRestoreAuthority(observation.row, options.lifecycleAuthority) &&
      await claimRestoreGeneration(replicaStateMachine, observation.row)) {
    return;
  }
  const error = new Error(
    `${DURABLE_REJOIN_LIFECYCLE_AUTHORITY_MISSING_MSG}: ${options.replicaId}`,
  );
  error.code = retirementOwnsDisk ? DURABLE_REJOIN_PLACEMENT_RETIREMENT_OWNS_DISK :
    DURABLE_REJOIN_LIFECYCLE_AUTHORITY_CHANGED;
  error.deferRetry = true;
  throw error;
}

export {DURABLE_REJOIN_PLACEMENT_RETIREMENT_OWNS_DISK, assertDurableRejoinStorageAdmission};
