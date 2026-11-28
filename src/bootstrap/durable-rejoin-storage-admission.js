import {isCatchupLearnerRaftRole} from '../raft/replica-voter-readiness.js';
import {
  claimLearnerDiskRejoin, isLearnerRetirementToken,
} from '../node/replica-learner-retirement-lifecycle.js';
import {observeAuthoritativeReplicaLifecycle} from
  '../node/replica-state-machine-lifecycle-observation.js';

const DURABLE_REJOIN_LIFECYCLE_AUTHORITY_MISSING_MSG =
  'Durable rejoin replica refused: lifecycle authority changed';
const DURABLE_REJOIN_LIFECYCLE_AUTHORITY_UNAVAILABLE_MSG =
  'Durable rejoin replica refused: lifecycle authority unavailable';
const DURABLE_REJOIN_PLACEMENT_RETIREMENT_OWNS_DISK =
  'DURABLE_REJOIN_PLACEMENT_RETIREMENT_OWNS_DISK';
const DURABLE_REJOIN_LIFECYCLE_AUTHORITY_CHANGED =
  'DURABLE_REJOIN_LIFECYCLE_AUTHORITY_CHANGED';
const DURABLE_REJOIN_LIFECYCLE_AUTHORITY_UNAVAILABLE =
  'DURABLE_REJOIN_LIFECYCLE_AUTHORITY_UNAVAILABLE';
const MAX_AUTHORITY_OBSERVATION_ATTEMPTS = 20;
// ends-on: authoritative services-p1 replica lifecycle observation becomes available
const AUTHORITY_OBSERVATION_POLL_INTERVAL_MS = 250;

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

async function pollAvailableReplicaLifecycle(
  replicaStateMachine,
  replicaId,
  remainingAttempts,
  pollIntervalMs,
) {
  const observation = await observeAuthoritativeReplicaLifecycle(
    replicaStateMachine,
    replicaId,
  );
  if (observation?.available === true || remainingAttempts <= 1) {
    return observation;
  }
  if (pollIntervalMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  return pollAvailableReplicaLifecycle(
    replicaStateMachine,
    replicaId,
    remainingAttempts - 1,
    pollIntervalMs,
  );
}

async function observeAvailableReplicaLifecycle(replicaStateMachine, replicaId, options) {
  const maxAttempts = Number.isSafeInteger(options?.maxAuthorityObservationAttempts) &&
      options.maxAuthorityObservationAttempts > 0 ?
    options.maxAuthorityObservationAttempts :
    MAX_AUTHORITY_OBSERVATION_ATTEMPTS;
  const pollIntervalMs = Number.isFinite(options?.authorityObservationPollIntervalMs) &&
      options.authorityObservationPollIntervalMs >= 0 ?
    options.authorityObservationPollIntervalMs :
    AUTHORITY_OBSERVATION_POLL_INTERVAL_MS;
  return pollAvailableReplicaLifecycle(
    replicaStateMachine,
    replicaId,
    maxAttempts,
    pollIntervalMs,
  );
}

async function assertDurableRejoinStorageAdmission(
  replicaStateMachine,
  options,
) {
  if (options.restoringExistingReplica !== true) return;
  const observation = await observeAvailableReplicaLifecycle(
    replicaStateMachine,
    options.replicaId,
    options,
  );
  if (observation?.available !== true) {
    const unavailableError = new Error(
      `${DURABLE_REJOIN_LIFECYCLE_AUTHORITY_UNAVAILABLE_MSG}: ${options.replicaId}`,
    );
    unavailableError.code = DURABLE_REJOIN_LIFECYCLE_AUTHORITY_UNAVAILABLE;
    unavailableError.deferRetry = true;
    throw unavailableError;
  }
  const retirementOwnsDisk =
    matchesRestoreGeneration(observation.row, options.lifecycleAuthority) &&
    isLearnerRetirementToken(observation.row.cleanup_token);
  if (!retirementOwnsDisk &&
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

export {
  DURABLE_REJOIN_LIFECYCLE_AUTHORITY_UNAVAILABLE,
  DURABLE_REJOIN_PLACEMENT_RETIREMENT_OWNS_DISK,
  assertDurableRejoinStorageAdmission,
};
