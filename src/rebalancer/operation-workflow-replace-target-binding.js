import {buildOperationTransitionOutcome} from './operation-workflow-transition-outcome.js';
import {COLUMN, TABLES} from '../constants/index.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
} from '../control-plane/control-plane-system-table-gateway-constants.js';
import {committedStampOfAnswer} from '../raft/raft-committed-membership-stamp.js';
import {WORKFLOW_STEP} from '../constants/workflow.js';
import {WORKFLOW_STEP_TO_STATUS} from './replica-operation-progress.js';
import {OPERATION_TRANSITION_REASON} from './rebalancer-constants.js';
import {
  isPlacementBootstrapAwaitingAuthority, isPlacementBootstrapBeforeDeadline,
  requiresPlacementCreateBootstrapTopology, PLACEMENT_BOOTSTRAP_WAIT,
} from './operation-workflow-placement-bootstrap-phase.js';
import {
  buildCommittedBootstrapTopology,
  readCommittedMembershipStamp,
} from './committed-membership-bootstrap-read.js';
import {
  assertCanonicalRebalancerEntityIdentity,
} from './rebalancer-entity-identity.js';
import {ReplicaOperationField} from './replica-operation-constants.js';
import {assertOperationUpdateSubject} from './replica-operation-update-outcome.js';
import {OPERATION_METADATA_KEY} from './replica-operation-progress.js';
import {readOriginalCreateBootstrapMembership, OperationType} from './replica-status.js';

// A strict observation or an exact confirmed CAS can be consumed by the
// immediately following dispatch turn without a second routed ledger read.

const BOOTSTRAP_BINDING_DEFERRED = Object.freeze({
  ROW_UNAVAILABLE: 'Placement CREATE bootstrap row is unavailable',
  ADMISSION_UNOBSERVED: 'Placement CREATE admission is not yet observable',
  MISSING_ORIGINAL: 'Original placement CREATE bootstrap topology is unresolved',
  UNCONFIRMED: 'Placement CREATE bootstrap binding was not confirmed',
  CAS_UNCOMMITTED: 'Placement CREATE bootstrap compare-and-set did not commit',
});

function needsReplaceCreateTargetBinding(
  operation,
  replaceRemoveDispatchPhase,
  sourceReplicaId,
) {
  return operation?.type === OperationType.REPLACE &&
    replaceRemoveDispatchPhase !== true &&
    (!operation.replicaId || operation.replicaId === sourceReplicaId);
}

function readServiceRowsForBootstrap(owner, partitionId) {
  if (!owner?.systemTableCache) {
    return [];
  }
  return owner.systemTableCache.filter(
    TABLES.SERVICES,
    (row) => row?.[COLUMN.PARTITION_ID] === partitionId,
  );
}

function projectBootstrapTopology(operation, topology) {
  const firstStep = {
    ...operation.stepsHistory[0],
    [OPERATION_METADATA_KEY.REPLICA_IDS]: topology.replicaIds,
    [OPERATION_METADATA_KEY.PEER_ADDRESSES]: topology.peerAddresses,
    [OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP]: topology.bootstrapMembership,
  };
  return {
    ...operation,
    stepsHistory: [firstStep, ...operation.stepsHistory.slice(1)],
    [ReplicaOperationField.REPLICA_IDS]: topology.replicaIds,
    [ReplicaOperationField.PEER_ADDRESSES]: topology.peerAddresses,
    [ReplicaOperationField.BOOTSTRAP_MEMBERSHIP]: topology.bootstrapMembership,
  };
}

function deferPlacementBootstrapBinding(owner, operation, reason, source) {
  const error = new Error(reason, {cause: source});
  error.deferRetry = true;
  error.code = PLACEMENT_BOOTSTRAP_WAIT;
  error.retryAfterMs = source?.retryAfterMs;
  owner.deferDispatchRetry(operation, error);
  return null;
}

async function bindPlacementBootstrapTopology(owner, operation, sourceReplicaId, claim) {
  const observation = await owner.repository.queryAuthoritativeOperationVisibilityObservation(
    operation.operationId,
    {
      authoritativeReadMode: CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
      requireCompleteExactKey: true,
    },
  );
  if (observation.deferredOutcome) {
    return deferPlacementBootstrapBinding(owner, operation,
      BOOTSTRAP_BINDING_DEFERRED.ROW_UNAVAILABLE, observation.deferredOutcome);
  }
  const current = observation.operation;
  if (!current || current.completedAt !== null ||
      !owner.repository.isOperationLocallyOwned(current)) return null;
  assertOperationUpdateSubject(operation, current);
  if (!requiresPlacementCreateBootstrapTopology(current, false) ||
      !current.replicaId || current.replicaId !== operation.replicaId ||
      current.createdAt !== operation.createdAt ||
      current.membershipPublicationEpoch !== operation.membershipPublicationEpoch ||
      current.replicaId === sourceReplicaId) {
    return null;
  }

  if (operation.createAdmissionState != null && current.createAdmissionState == null) {
    return deferPlacementBootstrapBinding(owner, operation,
      BOOTSTRAP_BINDING_DEFERRED.ADMISSION_UNOBSERVED);
  }
  const recordedStamp = readOriginalCreateBootstrapMembership(current.stepsHistory);
  const hasOriginal = committedStampOfAnswer(recordedStamp) !== null;
  if (hasOriginal && (!claim || current.workflowStep === WORKFLOW_STEP.SENDING)) {
    return current;
  }
  const claimPending = claim && current.workflowStep === WORKFLOW_STEP.PENDING;
  if (claim && !claimPending && current.workflowStep !== WORKFLOW_STEP.SENDING) return null;
  // Once CREATE has been admitted, an absent stamp cannot be reconstructed
  // from a newer view of Raft membership. Retain that operation as unresolved.
  if (current.createAdmissionState != null ||
      !hasOriginal && !isPlacementBootstrapAwaitingAuthority(current)) {
    return deferPlacementBootstrapBinding(owner, operation,
      BOOTSTRAP_BINDING_DEFERRED.MISSING_ORIGINAL);
  }

  try {
    if (!isPlacementBootstrapBeforeDeadline(current, owner.resolveTimeoutCheckNowMs())) {
      return null;
    }
    const topology = hasOriginal ? null : await buildCommittedBootstrapTopology({
      partitionId: current.partitionId,
      targetNodeId: current.targetNodeId,
      targetReplicaId: current.replicaId,
      readStamp: () => readCommittedMembershipStamp(owner, current.partitionId),
      readAddressBook: () => readServiceRowsForBootstrap(owner, current.partitionId),
    });
    const now = owner.resolveTimeoutCheckNowMs();
    if (!isPlacementBootstrapBeforeDeadline(current, now)) return null;
    const step = WORKFLOW_STEP.SENDING;
    const reason = OPERATION_TRANSITION_REASON.DISPATCH_SENDING;
    const bound = topology ? projectBootstrapTopology(current, topology) : current;
    const projected = claimPending ? owner.buildProjectedStepTransitionOperation(
      bound, step, reason, WORKFLOW_STEP.PENDING, now, WORKFLOW_STEP_TO_STATUS[step],
    ).projectedOperation : bound;
    const persist = () => owner.repository.persistOperationUpdate(projected, {
      ...owner.buildOperationTransitionPersistOptions(),
      ...(claimPending && owner.shouldUsePriorityDispatchClaimNarrowPath(current) ?
        {timeoutBudget: owner.buildPriorityDispatchTransitionMutationBudget(current, now)} : {}),
      expectedWorkflowStep: current.workflowStep,
      expectedStepsHistory: current.stepsHistory,
      requireCreateAdmissionAbsent: true,
      requireExactCreateTarget: true,
      // The repository's host admission hook runs immediately before each
      // gateway submission, including a retry following an ambiguous answer.
      terminalAdmission: () =>
        isPlacementBootstrapBeforeDeadline(current, owner.resolveTimeoutCheckNowMs()),
    });
    if (claimPending) {
      const changed = structuredClone(current);
      const outcome = await owner.executeAtomicTransition(changed,
        step, reason, persist, {requestedOperation: projected});
      if (outcome.committed) {
        owner.commitProjectedStepTransition(changed, outcome.operation,
          step, reason, WORKFLOW_STEP.PENDING);
        return isPlacementBootstrapBeforeDeadline(changed, owner.resolveTimeoutCheckNowMs()) ?
          changed : null;
      }
      return deferPlacementBootstrapBinding(owner, operation,
        BOOTSTRAP_BINDING_DEFERRED.CAS_UNCOMMITTED);
    }
    const persisted = await persist();
    const outcome = buildOperationTransitionOutcome(persisted,
      {repository: owner.repository, requestedOperation: projected});
    if (outcome.committed) {
      return isPlacementBootstrapBeforeDeadline(current, owner.resolveTimeoutCheckNowMs()) ?
        outcome.operation : null;
    }
  } catch (error) {
    return deferPlacementBootstrapBinding(owner, operation,
      BOOTSTRAP_BINDING_DEFERRED.UNCONFIRMED, error);
  }
  return deferPlacementBootstrapBinding(owner, operation,
    BOOTSTRAP_BINDING_DEFERRED.CAS_UNCOMMITTED);
}

/**
 * Bind a REPLACE target through the workflow owner's durable row before
 * CREATE admission can claim it.
 * @param {Object} owner
 * @param {Object} operation
 * @param {boolean} replaceRemoveDispatchPhase
 * @param {?string} sourceReplicaId
 * @return {Promise<?Object>}
 */
async function bindReplaceCreateTargetReplicaId(
  owner,
  operation,
  replaceRemoveDispatchPhase,
  sourceReplicaId,
) {
  if (requiresPlacementCreateBootstrapTopology(operation, replaceRemoveDispatchPhase)) {
    return bindPlacementBootstrapTopology(owner, operation, sourceReplicaId, false);
  }
  if (!needsReplaceCreateTargetBinding(
    operation,
    replaceRemoveDispatchPhase,
    sourceReplicaId,
  )) {
    return operation;
  }
  // An admitted CREATE is already bound to the exact durable replica_id.
  // Never rotate that identity from a later in-memory dispatch snapshot.
  if (operation.createAdmissionState != null) return null;
  const {entityType, entityId} =
    assertCanonicalRebalancerEntityIdentity(operation);
  const replicaId = await owner.allocateCanonicalReplicaId({
    partitionId: operation.partitionId,
    entityType,
    entityId,
    excludeReplicaIds: sourceReplicaId ? [sourceReplicaId] : [],
  });
  if (!replicaId || replicaId === sourceReplicaId) return null;
  if (operation.workflowStep === WORKFLOW_STEP.PENDING) {
    // The PENDING -> SENDING CAS below persists this target in the same write
    // that establishes the admission workflow anchor.
    operation.replicaId = replicaId;
    return operation;
  }
  const projectedOperation = {...operation, replicaId};
  const persisted = await owner.repository.persistOperationUpdate(
    projectedOperation,
    {
      ...owner.buildOperationTransitionPersistOptions(),
      expectedWorkflowStep: operation.workflowStep,
    },
  );
  const outcome = buildOperationTransitionOutcome(persisted,
    {repository: owner.repository, requestedOperation: projectedOperation});
  if (!outcome.committed) return null;
  operation.replicaId = replicaId;
  return operation;
}

async function claimPlacementBootstrapDispatch(owner, operation) {
  const result = await bindPlacementBootstrapTopology(owner, operation,
    owner.repository.getReplaceSourceReplicaId(operation), true);
  if (!result) return null;
  const claimed = structuredClone(result);
  owner.confirmedPlacementClaims ??= new WeakSet();
  owner.confirmedPlacementClaims.add(claimed);
  return claimed;
}

async function resolveDispatchTargetBinding(owner, operation, removePhase, sourceReplicaId) {
  if (operation.workflowStep === WORKFLOW_STEP.PENDING &&
      requiresPlacementCreateBootstrapTopology(operation, removePhase)) {
    const claim = await owner.claimPendingDispatchCandidate(operation.operationId, operation);
    owner.confirmedPlacementClaims?.delete(claim);
    return claim;
  }
  if (owner.confirmedPlacementClaims?.delete(operation)) return operation;
  return bindReplaceCreateTargetReplicaId(owner, operation, removePhase, sourceReplicaId);
}

function placementBootstrapDeliveryExpired(owner, operation, removePhase, hasAdmission) {
  return !hasAdmission && requiresPlacementCreateBootstrapTopology(operation, removePhase) &&
    !isPlacementBootstrapBeforeDeadline(operation, owner.resolveTimeoutCheckNowMs());
}

export {
  bindReplaceCreateTargetReplicaId, claimPlacementBootstrapDispatch,
  resolveDispatchTargetBinding, placementBootstrapDeliveryExpired,
  requiresPlacementCreateBootstrapTopology,
};
