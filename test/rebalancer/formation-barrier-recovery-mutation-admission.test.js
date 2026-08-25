/**
 * CL-044 residual falsifier: the recovery planner reaches operation creation,
 * but the coordinator's strict readiness read can be replaced by a token-stale
 * deferred snapshot that erases priorityRecovery.active. The already-proven
 * operation-creation authority must survive the move handoff so admission does
 * not veto the cure on the two dimensions that cure reopens.
 *
 * On the pre-fix candidate, the first two tests are intentionally RED: the
 * owner-minted move carries no authority and admission re-derives the lane from
 * the deferred snapshot. The remaining tests pin the fail-closed boundary.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  CONTROL_PLANE_READINESS_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {TOKEN_STATUS} from
  '../../src/control-plane/readiness-planning-version-contract.js';
import {ProvisioningAdmissionPolicy} from
  '../../src/rebalancer/provisioning-admission-policy.js';
import {REBALANCER_SKIP_REASON} from
  '../../src/rebalancer/rebalancer-constants.js';
import {UnifiedRebalancerFollowUpMove} from
  '../../src/rebalancer/unified-rebalancer-follow-up-move.js';
import {UnifiedRebalancerMoveExecution} from
  '../../src/rebalancer/unified-rebalancer-move-execution.js';

const LOCAL_NODE_ID = 'formation-seed';
const TARGET_NODE_ID = 'formation-cohort-4';
const PRIORITY_PARTITION_ID = 'sql_transactions-p1';
const ORDINARY_PARTITION_ID = 'partition-ordinary';
const RECOVERY_AUTHORITY_FIELD =
  'priorityRecoveryOperationCreationRequired';

function createPolicy(readiness) {
  return new ProvisioningAdmissionPolicy({
    nodeId: LOCAL_NODE_ID,
    logger: {warn() {}},
    delegates: {
      getNodeId: () => LOCAL_NODE_ID,
      getControlPlaneReadinessService: () => ({
        getNodeReadinessSync: () => readiness,
      }),
    },
  });
}

function buildDeferredReadiness() {
  return {
    nodeId: LOCAL_NODE_ID,
    readinessPlanningTokenStatus: TOKEN_STATUS.STALE,
    dimensions: {
      [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]: false,
      [CONTROL_PLANE_READINESS_DIMENSION
        .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
    },
    projectionReadinessContract: {
      priorityRecovery: {active: false, durableSpreadPending: true},
    },
    reasons: [{
      code: CONTROL_PLANE_READINESS_REASON.PLANNING_SNAPSHOT_REFRESH_PENDING,
    }],
  };
}

function buildFreshClosedReadiness() {
  return {
    ...buildDeferredReadiness(),
    readinessPlanningTokenStatus: TOKEN_STATUS.CURRENT,
    reasons: [{code: 'control_plane_write_unhealthy'}],
  };
}

function buildBackgroundMove(partitionId, authorized = false) {
  return {
    type: 'ADD',
    partitionId,
    entityId: partitionId,
    nodeId: TARGET_NODE_ID,
    controlPlaneMutationWorkClass: 'background',
    ...(authorized ? {[RECOVERY_AUTHORITY_FIELD]: true} : {}),
  };
}

function buildInheritedAuthorityMove(partitionId = PRIORITY_PARTITION_ID) {
  const move = Object.create({[RECOVERY_AUTHORITY_FIELD]: true});
  Object.assign(move, buildBackgroundMove(partitionId));
  return move;
}

function buildAccessorAuthorityMove(partitionId = PRIORITY_PARTITION_ID) {
  const move = buildBackgroundMove(partitionId);
  let reads = 0;
  Object.defineProperty(move, RECOVERY_AUTHORITY_FIELD, {
    enumerable: true,
    get() {
      reads += 1;
      return true;
    },
  });
  return {move, readCount: () => reads};
}

function catchAdmissionError(policy, move) {
  return Promise.resolve()
    .then(() => policy.assertLocalControlPlaneMutationReady(move))
    .catch((error) => error);
}

function buildOwnerMintedRecoveryMove() {
  const rebalancer = Object.create(UnifiedRebalancerFollowUpMove.prototype);
  rebalancer.entityId = PRIORITY_PARTITION_ID;
  rebalancer.isPriorityRecoveryFollowUpOperationRequired = () => true;
  rebalancer.resolvePriorityRecoveryFollowUpPartitionId = () =>
    PRIORITY_PARTITION_ID;
  rebalancer.resolvePriorityRecoveryFollowUpCurrentReplicas = (
    _decision,
    currentReplicas,
  ) => currentReplicas;
  rebalancer.resolvePriorityRecoveryFollowUpOwnerOperationObservation = () =>
    null;
  rebalancer.getHealthyReplicas = (replicas) => replicas;
  rebalancer.resolvePriorityRecoveryFollowUpTargetReplicaCount = () => 3;
  rebalancer.selectPriorityRecoveryFollowUpTargetNodeId = () => TARGET_NODE_ID;
  rebalancer.buildPriorityRecoveryFollowUpSerialWaitMoveFields = () => ({});
  rebalancer.selectPriorityRecoveryFollowUpSourceReplica = () => null;
  rebalancer.getReadyNodeOccupiedReplicas = (replicas) => replicas;
  rebalancer.isPriorityRecoveryFollowUpDeficitSatisfiedByInFlightAdds = () =>
    false;

  const currentReplicas = [
    {node_id: LOCAL_NODE_ID, status: 'active'},
    {node_id: 'formation-ready-2', status: 'active'},
  ];
  return rebalancer.buildPriorityRecoveryFollowUpMove({
    decision: {decisionSnapshot: {semanticState: 'needs_operation'}},
    currentReplicas,
    targetState: {
      targetReplicaCount: 3,
      topologyTransitionSnapshot: {
        inventory: {
          entityId: PRIORITY_PARTITION_ID,
          accounting: {activeCount: currentReplicas.length},
          provenance: {topologyIncreaseUsable: true},
        },
      },
    },
  });
}

function buildMoveExecution() {
  const requests = [];
  const rebalancer = Object.create(UnifiedRebalancerMoveExecution.prototype);
  rebalancer.entityId = PRIORITY_PARTITION_ID;
  rebalancer.entityType = 'partition';
  rebalancer.isShuttingDown = false;
  rebalancer.resolveCoordinatorOperationType = (moveType) =>
    moveType.toUpperCase();
  rebalancer.resolvePublishedMembershipPlanningEpoch = () => 7;
  rebalancer.buildRebalanceResult = (success, payload) => ({success, ...payload});
  rebalancer.rebalanceCoordinator = {
    getMoveSafetyError: async () => null,
    createOperation: async (request) => {
      requests.push(request);
      return {operationId: 'formation-cure-op-1'};
    },
  };
  return {rebalancer, requests};
}

test('CL-044 recovery move minter carries the owner-issued operation-creation ' +
  'authority into coordinator admission', (t) => {
  const move = buildOwnerMintedRecoveryMove();

  t.equal(move.type, 'add', 'fixture mints the real deficit ADD cure');
  t.equal(
    move[RECOVERY_AUTHORITY_FIELD],
    true,
    'the move must carry the authority already established by its decision',
  );
  t.end();
});

test('CL-044 coordinator request preserves the recovery operation-creation ' +
  'authority', async (t) => {
  const move = buildOwnerMintedRecoveryMove();
  const {rebalancer, requests} = buildMoveExecution();

  await rebalancer.executeMoveViaCoordinator(move);

  t.equal(requests.length, 1, 'one coordinator request is created');
  t.equal(
    requests[0][RECOVERY_AUTHORITY_FIELD],
    true,
    'the enumerating handoff cannot silently drop the owner capability',
  );
});

test('CL-044 inherited recovery authority cannot cross coordinator execution',
  async (t) => {
    const {rebalancer, requests} = buildMoveExecution();

    await rebalancer.executeMoveViaCoordinator(buildInheritedAuthorityMove());

    t.equal(requests.length, 1, 'the ordinary move still reaches its owner');
    t.notOk(
      Object.hasOwn(requests[0], RECOVERY_AUTHORITY_FIELD),
      'prototype authority is not copied into the coordinator request',
    );
  });

test('CL-044 accessor recovery authority is neither invoked nor propagated',
  async (t) => {
    const {move, readCount} = buildAccessorAuthorityMove();
    const {rebalancer, requests} = buildMoveExecution();

    await rebalancer.executeMoveViaCoordinator(move);

    t.equal(readCount(), 0, 'the execution handoff does not invoke authority');
    t.notOk(
      Object.hasOwn(requests[0], RECOVERY_AUTHORITY_FIELD),
      'accessor authority is not copied into the coordinator request',
    );
  });

test('CL-044 token-stale deferred readiness cannot veto an authorized ' +
  'priority-recovery cure', async (t) => {
  const policy = createPolicy(buildDeferredReadiness());
  const error = await catchAdmissionError(
    policy,
    buildBackgroundMove(PRIORITY_PARTITION_ID, true),
  );

  t.equal(
    error,
    undefined,
    'owner-authorized recovery actuation reopens the two deferred dimensions',
  );
});

test('CL-044 token-stale deferred readiness still rejects a priority move ' +
  'without operation-creation authority', async (t) => {
  const policy = createPolicy(buildDeferredReadiness());
  const error = await catchAdmissionError(
    policy,
    buildBackgroundMove(PRIORITY_PARTITION_ID),
  );

  t.equal(
    error?.rebalanceSkipReason,
    REBALANCER_SKIP_REASON.LOCAL_MUTATION_UNHEALTHY,
    'a partition name alone cannot mint recovery admission authority',
  );
});

test('CL-044 token-stale deferred readiness rejects inherited authority',
  async (t) => {
    const policy = createPolicy(buildDeferredReadiness());
    const error = await catchAdmissionError(
      policy,
      buildInheritedAuthorityMove(),
    );

    t.equal(
      error?.rebalanceSkipReason,
      REBALANCER_SKIP_REASON.LOCAL_MUTATION_UNHEALTHY,
      'only an own authority field can bridge the stale-token boundary',
    );
  });

test('CL-044 token-stale deferred readiness rejects accessor authority ' +
  'without invoking it', async (t) => {
  const policy = createPolicy(buildDeferredReadiness());
  const {move, readCount} = buildAccessorAuthorityMove();
  const error = await catchAdmissionError(policy, move);

  t.equal(readCount(), 0, 'admission does not invoke the authority accessor');
  t.equal(
    error?.rebalanceSkipReason,
    REBALANCER_SKIP_REASON.LOCAL_MUTATION_UNHEALTHY,
    'accessor-backed authority fails closed',
  );
});

test('CL-044 operation-creation authority cannot exempt ordinary partition ' +
  'background churn', async (t) => {
  const policy = createPolicy(buildDeferredReadiness());
  const error = await catchAdmissionError(
    policy,
    buildBackgroundMove(ORDINARY_PARTITION_ID, true),
  );

  t.equal(
    error?.rebalanceSkipReason,
    REBALANCER_SKIP_REASON.LOCAL_MUTATION_UNHEALTHY,
    'the admission exception remains priority-control-plane scoped',
  );
});

test('CL-044 a fresh closed recovery lane rejects even a stale move ' +
  'authority marker', async (t) => {
  const policy = createPolicy(buildFreshClosedReadiness());
  const error = await catchAdmissionError(
    policy,
    buildBackgroundMove(PRIORITY_PARTITION_ID, true),
  );

  t.equal(
    error?.rebalanceSkipReason,
    REBALANCER_SKIP_REASON.LOCAL_MUTATION_UNHEALTHY,
    'only a deferred token-stale read may consume the cycle-owned authority',
  );
});
