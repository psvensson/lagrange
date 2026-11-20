import {COMMITTED_MEMBERSHIP_READ_PURPOSE} from '../raft/raft-committed-membership-constants.js';
import {COMMITTED_REPLICA_ROLE, projectReplicaRole} from
  '../raft/raft-rs-committed-membership-read.js';
import {readCommittedMembershipStamp} from '../rebalancer/committed-membership-bootstrap-read.js';
import {canonicalVoterRetirement} from '../rebalancer/replica-placement-owner-admission-statement.js';
import {installsPlacementVoterRetirementGeneration} from
  './replica-handler-learner-retirement-authority.js';
import {ReplicaOperationField} from '../rebalancer/replica-operation-constants.js';
import {removalAuthorityDeferred} from './replica-removal-debt-errors.js';
import {learnerRetirementToken} from './replica-learner-retirement-lifecycle.js';
import {durableRowVersion, installAuthoritativeReplicaLifecycleSnapshot} from
  './replica-state-machine-lifecycle-observation.js';

const LEARNER_CLEANUP_AUTHORITY = Object.freeze({
  CLEARED: 'cleared',
  DEFERRED: 'deferred',
  GENERATION_CHANGED: 'generation_changed',
});

function rowNamesCleanupGeneration(row, handler, scope, request) {
  return row?.created_at === scope.replicaCreatedAt &&
    row.replica_id === request[ReplicaOperationField.REPLICA_ID] &&
    row.partition_id === request[ReplicaOperationField.PARTITION_ID] &&
    row.node_id === handler.nodeId &&
    row.cleanup_token === learnerRetirementToken(request[ReplicaOperationField.OPERATION_ID]);
}

async function observeClearedLearnerGeneration(handler, scope, request) {
  const replicaId = request[ReplicaOperationField.REPLICA_ID];
  if (scope?.nodeBootIncarnation !== handler.ownerIncarnation ||
      !Number.isSafeInteger(scope?.replicaCreatedAt) || scope.replicaCreatedAt <= 0) {
    return LEARNER_CLEANUP_AUTHORITY.GENERATION_CHANGED;
  }
  const observed = await handler.replicaStateMachine
    .observeAuthoritativeReplicaLifecycle(replicaId);
  if (observed?.available !== true) return LEARNER_CLEANUP_AUTHORITY.DEFERRED;
  if (!rowNamesCleanupGeneration(observed.row, handler, scope, request)) {
    return LEARNER_CLEANUP_AUTHORITY.GENERATION_CHANGED;
  }
  try {
    const stamp = await readCommittedMembershipStamp(handler,
      request[ReplicaOperationField.PARTITION_ID],
      {purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.RETIREMENT});
    if (projectReplicaRole(stamp, replicaId) !== COMMITTED_REPLICA_ROLE.ABSENT) {
      return LEARNER_CLEANUP_AUTHORITY.DEFERRED;
    }
    return await installAuthoritativeReplicaLifecycleSnapshot(handler.replicaStateMachine,
      observed.row, handler.nodeId, durableRowVersion(observed.row)) ?
      LEARNER_CLEANUP_AUTHORITY.CLEARED : LEARNER_CLEANUP_AUTHORITY.DEFERRED;
  } catch {
    return LEARNER_CLEANUP_AUTHORITY.DEFERRED;
  }
}

async function checkPlacementRemovalGeneration(handler, request) {
  const learner = request[ReplicaOperationField.LEARNER_RETIREMENT];
  const voter = request[ReplicaOperationField.VOTER_RETIREMENT];
  if (learner === undefined && voter === undefined) return null;
  const replicaId = request[ReplicaOperationField.REPLICA_ID];
  if (voter === undefined && await observeClearedLearnerGeneration(handler, learner, request) ===
      LEARNER_CLEANUP_AUTHORITY.CLEARED) return null;
  if (learner === undefined) {
    const parsed = canonicalVoterRetirement(voter);
    if (parsed !== null && await installsPlacementVoterRetirementGeneration(handler, {
      ...parsed, targetNodeId: handler.nodeId, replicaId,
      operationId: request[ReplicaOperationField.OPERATION_ID],
      partitionId: request[ReplicaOperationField.PARTITION_ID],
    })) return null;
  }
  return handler.answerFailedCreateCleanupDeferred({
    operationId: request[ReplicaOperationField.OPERATION_ID],
    partitionId: request[ReplicaOperationField.PARTITION_ID],
    replicaId, deferral: removalAuthorityDeferred(replicaId),
  });
}

export {checkPlacementRemovalGeneration};
