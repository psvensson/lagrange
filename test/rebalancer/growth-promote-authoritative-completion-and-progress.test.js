import {buildTerminalOperationFixtureOutcome} from './operation-outcome-fixture.js';
import {buildOperationTransitionOutcome} from '../../src/rebalancer/operation-workflow-transition-outcome.js';
import {buildOperationUpdateOutcome} from '../../src/rebalancer/replica-operation-update-outcome.js';
import {test} from '../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import Database from 'better-sqlite3';
import {
  CDC_OPERATION, COLUMN, SERVICE_STATUS, TABLES, WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {assignReplicaHandlerCreateMethods} from '../../src/node/replica-handler-create-methods.js';
import {runtimeBuildProvenance} from '../../src/diagnostics/runtime-build-provenance.js';
import {createParticipantReleaseAuthorizationOwner} from
  '../../src/node/participant-release-authorization-owner.js';
import {TrackedServiceRegistry} from '../../src/node/replica-handler-membership-relay.js';
import {createParticipantReleaseRecovery} from '../../src/node/replica-handler-release-recovery.js';
import {
  PARTICIPANT_CUTOVER_OUTCOME, PARTICIPANT_RELEASE_ACTION, PARTICIPANT_RELEASE_RESULT_FIELD,
  PARTICIPANT_RELEASE_ROUTE_SUFFIX, PARTICIPANT_RELEASE_TRIGGER, PARTICIPANT_RELEASE_TYPE,
} from '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {completePartitionConstructionFixture, createInProcessMockTransport} from '../test-helpers/replica-handler-identity-fixture.js';
import {
  LEARNER_ADMISSION_WAIT_OUTCOME, assignReplicaHandlerVoterReadinessMethods,
} from '../../src/node/replica-handler-voter-readiness-methods.js';
import {
  LEDGER_PARTITION_ID, readPlacementCensus,
} from '../../src/partition/partition-placement-admission-decision.js';
import {PartitionService} from '../../src/partition/partition-service-assembly.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {generateCreateTableSQL} from '../../src/bootstrap/system-table-schema-sql.js';
import {
  REPLICA_OPERATIONS_SCHEMA, SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  PLACEMENT_FORMATION_STATE, PLACEMENT_TRIGGER,
} from '../../src/rebalancer/replica-placement-owner-constants.js';
import {createReplicaPlacementOwner} from '../../src/rebalancer/replica-placement-owner.js';
import {OPERATION_RECONCILE_OUTCOME, didOperationReconcileAdvanceOrComplete} from '../../src/rebalancer/operation-workflow-reconcile-outcome.js';
import {
  GROWTH_SETTLEMENT_PHASE,
  hasValidGrowthPromoteCompletionProvenance,
  observeGrowthPromoteIncompleteState,
  reconcileGrowthPromoteDispatchResponse,
  reconcileGrowthPromoteLifecycle,
  redirectGrowthPromoteTargetNode,
  resolveGrowthPromoteTargetNodeId,
  settleGrowthPromoteCompletion,
} from '../../src/rebalancer/operation-workflow-growth-promote.js';
import {
  REPLICA_OPERATION_UPDATE_DISPOSITION,
} from '../../src/rebalancer/replica-operation-update-disposition.js';
import {
  ReplicaOperationField, ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  createOperation, OperationType, ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {createTestCoordinator} from './test-helpers.js';

const TEST_PARTITION_ID = 'user_orders-p1';
const TEST_LEADER_NODE_1 = 'node-leader-1';
const TEST_LEADER_NODE_2 = 'node-leader-2';
const TEST_LEARNER_1 = 'user_orders-p1-r2';
const TEST_LEARNER_2 = 'user_orders-p1-r3';
const TEST_LEADER_REPLICA_2 = 'user_orders-p1-r1-n2';

function buildGrowthPromoteOperation(overrides = {}) {
  const partitionId = overrides.partitionId || TEST_PARTITION_ID;
  const operation = createOperation({
    operationId: overrides.operationId || 'op-growth-promote-1',
    type: OperationType.GROWTH_PROMOTE,
    partitionId,
    entityType: 'partition',
    entityId: partitionId,
    replicaId: overrides.replicaId || TEST_LEARNER_1,
    sourceNodeId: overrides.sourceNodeId || TEST_LEADER_NODE_1,
    targetNodeId: overrides.targetNodeId ?? TEST_LEADER_NODE_1,
    sourceReplicaId: overrides.sourceReplicaId || TEST_LEARNER_2,
  });
  operation.entityType = 'partition';
  operation.entityId = partitionId;
  operation.sourceReplicaId = overrides.sourceReplicaId || TEST_LEARNER_2;
  operation[ReplicaOperationField.PROMOTE_REPLICA_IDS] =
    overrides.promoteReplicaIds || [TEST_LEARNER_1, TEST_LEARNER_2];
  operation.status = overrides.status || ReplicaStatus.SYNCING;
  operation.workflowStep = overrides.workflowStep || WORKFLOW_STEP.SYNCING;
  const stepEnteredAt = overrides.stepEnteredAt ?? operation.createdAt;
  operation.createdAt = stepEnteredAt;
  operation.updatedAt = stepEnteredAt;
  operation.stepsHistory = [{
    step: operation.workflowStep,
    timestamp: stepEnteredAt,
    [ReplicaOperationField.PROMOTE_REPLICA_IDS]:
      operation[ReplicaOperationField.PROMOTE_REPLICA_IDS],
  }];
  return Object.assign(operation, overrides);
}

test(
  'D4 & Counterexample 2a: GROWTH_PROMOTE completion requires authoritative ' +
    'non-joint committed membership with matching partition and promoted ' +
    'replica provenance, never projected SERVICES.raft_role',
  async (t) => {
    const cache = new SystemTableCache();
    for (const [id, nodeId] of [[TEST_LEARNER_1, 'node-2'], [TEST_LEARNER_2, 'node-3']]) {
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, CDC_OPERATION.UPSERT, {
        service_id: id, replica_id: id, service_type: 'partition',
        partition_id: TEST_PARTITION_ID, node_id: nodeId,
        status: ReplicaStatus.ACTIVE, raft_role: RAFT_ROLE.FOLLOWER,
      });
    }

    const coordinator = createTestCoordinator({
      nodeId: TEST_LEADER_NODE_1,
      systemTableCache: cache,
    });
    const owner = coordinator.workflowOwner;
    const operation = buildGrowthPromoteOperation({
      workflowStep: WORKFLOW_STEP.SYNCING,
      status: ReplicaStatus.SYNCING,
      completedAt: null,
    });

    try {
      t.equal(
        observeGrowthPromoteIncompleteState(owner, operation),
        'REPLAY_DISPATCH',
        'projected SERVICES follower rows must never complete an incomplete GROWTH_PROMOTE',
      );

      let completedCount = 0;
      let nextPersistDisposition = REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED;
      owner.completeOperation = async (op) => {
        if (nextPersistDisposition !== REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED) {
          return buildOperationTransitionOutcome(buildOperationUpdateOutcome({persisted: false,
            disposition: nextPersistDisposition, operation: null}));
        }
        completedCount += 1;
        op.workflowStep = WORKFLOW_STEP.ACTIVE;
        op.status = ReplicaStatus.ACTIVE;
        op.completedAt = Date.now();
        return buildTerminalOperationFixtureOutcome(op, {completedAt: op.completedAt});
      };
      owner.updateStep = async (op, nextStep) => {
        op.workflowStep = nextStep;
        op.status = ReplicaStatus.SYNCING;
        return OPERATION_RECONCILE_OUTCOME.ADVANCED;
      };

      // Mismatched partitionId provenance must not complete GROWTH_PROMOTE
      t.equal(
        hasValidGrowthPromoteCompletionProvenance(operation, {
          committedVotersReached: true,
          partitionId: 'other_table-p9',
          promotedReplicaIds: [TEST_LEARNER_1, TEST_LEARNER_2],
        }),
        false,
        'provenance check rejects mismatched partitionId',
      );
      const wrongPartitionResult = await reconcileGrowthPromoteDispatchResponse(
        owner, operation, {
          committedVotersReached: true,
          partitionId: 'other_table-p9',
          promotedReplicaIds: [TEST_LEARNER_1, TEST_LEARNER_2],
        },
      );
      t.equal(wrongPartitionResult.status, 'in_progress');
      t.equal(completedCount, 0);

      // Missing promoted replica ID in promotedReplicaIds / voterReplicaIds must not complete
      t.equal(
        hasValidGrowthPromoteCompletionProvenance(operation, {
          committedVotersReached: true,
          partitionId: TEST_PARTITION_ID,
          promotedReplicaIds: [TEST_LEARNER_1],
        }),
        false,
        'provenance check rejects partial promotedReplicaIds',
      );
      t.equal(
        hasValidGrowthPromoteCompletionProvenance(operation, {
          committedVotersReached: true,
          partitionId: TEST_PARTITION_ID,
          voterReplicaIds: [TEST_LEARNER_1],
        }),
        false,
        'provenance check rejects voterReplicaIds missing a promoted learner',
      );
      const partialReplicaResult = await reconcileGrowthPromoteDispatchResponse(
        owner, operation, {
          committedVotersReached: true,
          partitionId: TEST_PARTITION_ID,
          promotedReplicaIds: [TEST_LEARNER_1],
        },
      );
      t.equal(partialReplicaResult.status, 'in_progress');
      t.equal(completedCount, 0);

      // CORE_OK without committedVotersReached === true must defer to SYNCING
      const unconfirmedProposalResult = await reconcileGrowthPromoteDispatchResponse(
        owner, operation, {
          [ReplicaOperationField.PROPOSAL]: {
            outcome: 'CORE_OK',
            promotedReplicaIds: [TEST_LEARNER_1, TEST_LEARNER_2],
          },
          committedVotersReached: false,
        },
      );
      t.equal(unconfirmedProposalResult.status, 'in_progress');
      t.equal(completedCount, 0);

      // Authoritative committedVotersReached === true with valid provenance completes
      nextPersistDisposition = REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED;
      const validResult = await reconcileGrowthPromoteDispatchResponse(
        owner, operation, {
          committedVotersReached: true,
          partitionId: TEST_PARTITION_ID,
          [ReplicaOperationField.PROPOSAL]: {
            outcome: 'CORE_OK',
            promotedReplicaIds: [TEST_LEARNER_1, TEST_LEARNER_2],
          },
        },
      );
      t.equal(validResult.status, ReplicaOperationResponseStatus.COMPLETED);
      t.equal(validResult.settlementPhase, GROWTH_SETTLEMENT_PHASE.SETTLED);
      t.equal(completedCount, 1);
      t.equal(
        observeGrowthPromoteIncompleteState(owner, operation),
        'COMPLETE_ACTIVE',
        'durable terminal GROWTH_PROMOTE record reports COMPLETE_ACTIVE',
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'Finding 5: settleGrowthPromoteCompletion & reconcileGrowthPromoteLifecycle ' +
    'gate terminal completion on durable persistence disposition ' +
    '(deferred -> WAITING, refused -> REFUSED, committed -> COMPLETED)',
  async (t) => {
    const coordinator = createTestCoordinator({nodeId: TEST_LEADER_NODE_1});
    const owner = coordinator.workflowOwner;

    try {
      const op = buildGrowthPromoteOperation({
        operationId: 'op-growth-settlement-1',
        status: ReplicaStatus.SYNCING,
        workflowStep: WORKFLOW_STEP.SYNCING,
        completedAt: null,
      });
      const validCommittedResponse = {
        committedVotersReached: true,
        partitionId: TEST_PARTITION_ID,
        [ReplicaOperationField.PROPOSAL]: {
          outcome: 'CORE_OK',
          promotedReplicaIds: [TEST_LEARNER_1, TEST_LEARNER_2],
        },
      };

      // 1. Reinsertion is a recognized unresolved result, never terminal settlement.
      owner.completeOperation = async () => buildOperationTransitionOutcome(
        buildOperationUpdateOutcome({persisted: true,
          disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.REINSERTED, operation: op}));
      owner.executeOperationFromReconcilePath = async (targetOp) =>
        reconcileGrowthPromoteDispatchResponse(owner, targetOp, validCommittedResponse);

      const deferredDispatchResult = await reconcileGrowthPromoteDispatchResponse(
        owner, op, validCommittedResponse,
      );
      t.equal(deferredDispatchResult.skipped, true);
      t.equal(deferredDispatchResult.settlementPhase, GROWTH_SETTLEMENT_PHASE.PERSISTING);
      t.equal(deferredDispatchResult.reconcileOutcome, OPERATION_RECONCILE_OUTCOME.WAITING);
      t.equal(await owner.reconcileOperationLifecycle(op), OPERATION_RECONCILE_OUTCOME.WAITING);
      t.equal(op.completedAt, null);

      // 2. Refused terminal persistence: reconcileOperationLifecycle returns REFUSED
      owner.completeOperation = async () => buildOperationTransitionOutcome(
        buildOperationUpdateOutcome({persisted: false,
          disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED, operation: null}));
      const refusedSettlement = await settleGrowthPromoteCompletion(owner, op);
      t.equal(refusedSettlement.phase, GROWTH_SETTLEMENT_PHASE.PERSISTING);
      t.equal(refusedSettlement.reconcileOutcome, OPERATION_RECONCILE_OUTCOME.REFUSED);
      t.equal(await owner.reconcileOperationLifecycle(op), OPERATION_RECONCILE_OUTCOME.REFUSED);

      // 2b. Deliberately malformed input must fail at the result boundary.
      let releasesOnUnrecognized = 0;
      owner.releaseReservationForOperation = async () => {
        releasesOnUnrecognized += 1;
      };
      owner.completeOperation = async () => Object.freeze({
        committed: true, disposition: 'unrecognized_custom_disposition',
      });
      await t.rejects(settleGrowthPromoteCompletion(owner, op),
        {code: 'INVALID_OPERATION_PERSISTENCE_OUTCOME'});
      t.equal(releasesOnUnrecognized, 0);

      // 3. Subsequent retry where completeOperation commits with UPDATED transitions to COMPLETED
      owner.completeOperation = async (targetOp) => {
        targetOp.workflowStep = WORKFLOW_STEP.ACTIVE;
        targetOp.status = ReplicaStatus.ACTIVE;
        targetOp.completedAt = Date.now();
        return buildTerminalOperationFixtureOutcome(targetOp,
          {completedAt: targetOp.completedAt});
      };
      t.equal(await owner.reconcileOperationLifecycle(op), OPERATION_RECONCILE_OUTCOME.COMPLETED);
      t.equal(op.workflowStep, WORKFLOW_STEP.ACTIVE);
      t.ok(Number.isFinite(op.completedAt));
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'D5 & Counterexample 2c: administration route tracking updates ' +
    'administrationRouteNodeId for GROWTH_PROMOTE without mutating durable ' +
    'placement intent or ADD/REMOVE/REPLACE targetNodeId',
  async (t) => {
    const cache = new SystemTableCache();
    cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, CDC_OPERATION.UPSERT, {
      service_id: TEST_LEADER_REPLICA_2, replica_id: TEST_LEADER_REPLICA_2,
      service_type: 'partition', partition_id: TEST_PARTITION_ID,
      node_id: TEST_LEADER_NODE_2, status: ReplicaStatus.ACTIVE,
      raft_role: RAFT_ROLE.LEADER,
    });
    const coordinator = createTestCoordinator({
      nodeId: TEST_LEADER_NODE_1,
      systemTableCache: cache,
    });
    const owner = coordinator.workflowOwner;

    try {
      const growthOp = buildGrowthPromoteOperation({targetNodeId: ''});
      const initialRoute = resolveGrowthPromoteTargetNodeId(owner, growthOp);
      t.equal(initialRoute, TEST_LEADER_NODE_2);
      t.equal(growthOp.administrationRouteNodeId, TEST_LEADER_NODE_2);
      t.equal(growthOp.targetNodeId, TEST_LEADER_NODE_2);

      // Redirect from node-leader-1 to node-leader-2 on not_leader
      growthOp.targetNodeId = TEST_LEADER_NODE_1;
      growthOp.administrationRouteNodeId = TEST_LEADER_NODE_1;
      const redirected = redirectGrowthPromoteTargetNode(owner, growthOp, {
        [ReplicaOperationField.PROPOSAL]: {
          outcome: 'CORE_REFUSED', reason: 'not_leader', retryable: true,
        },
        leaderId: TEST_LEADER_REPLICA_2,
      });
      t.equal(redirected, TEST_LEADER_NODE_2);
      t.equal(growthOp.administrationRouteNodeId, TEST_LEADER_NODE_2);
      t.equal(growthOp.targetNodeId, TEST_LEADER_NODE_2);
      t.equal(growthOp.partitionId, TEST_PARTITION_ID);
      t.equal(growthOp.replicaId, TEST_LEARNER_1);
      t.equal(growthOp.sourceReplicaId, TEST_LEARNER_2);
      t.same(growthOp[ReplicaOperationField.PROMOTE_REPLICA_IDS], [
        TEST_LEARNER_1, TEST_LEARNER_2,
      ]);

      // ADD operation targetNodeId must never be overwritten by redirect helpers
      const addOp = createOperation({
        operationId: 'op-add-immutable-target',
        type: OperationType.ADD,
        partitionId: TEST_PARTITION_ID,
        replicaId: TEST_LEARNER_1,
        sourceNodeId: TEST_LEADER_NODE_1,
        targetNodeId: 'node-physical-placement-target',
      });
      t.equal(redirectGrowthPromoteTargetNode(owner, addOp, {
        leaderNodeId: TEST_LEADER_NODE_2,
      }), '');
      t.equal(resolveGrowthPromoteTargetNodeId(owner, addOp), 'node-physical-placement-target');
      t.equal(addOp.targetNodeId, 'node-physical-placement-target');
      t.equal(addOp.administrationRouteNodeId, undefined);
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'D6 & Counterexample 2b: reconcileGrowthPromoteLifecycle produces explicit ' +
    'OPERATION_RECONCILE_OUTCOME states (HELD, WAITING, ADVANCED, COMPLETED)',
  async (t) => {
    const coordinator = createTestCoordinator({nodeId: TEST_LEADER_NODE_1});
    const owner = coordinator.workflowOwner;

    try {
      t.equal(didOperationReconcileAdvanceOrComplete(OPERATION_RECONCILE_OUTCOME.COMPLETED), true);
      t.equal(didOperationReconcileAdvanceOrComplete(OPERATION_RECONCILE_OUTCOME.ADVANCED), true);
      t.equal(didOperationReconcileAdvanceOrComplete(true), false);
      t.equal(didOperationReconcileAdvanceOrComplete(OPERATION_RECONCILE_OUTCOME.WAITING), false);
      t.equal(didOperationReconcileAdvanceOrComplete(OPERATION_RECONCILE_OUTCOME.HELD), false);
      t.equal(didOperationReconcileAdvanceOrComplete(OPERATION_RECONCILE_OUTCOME.REFUSED), false);
      t.equal(didOperationReconcileAdvanceOrComplete(OPERATION_RECONCILE_OUTCOME.FAILED), false);
      t.equal(didOperationReconcileAdvanceOrComplete(false), false);
      t.equal(didOperationReconcileAdvanceOrComplete(null), false);

      // 1. HELD operation returns HELD
      const heldOp = buildGrowthPromoteOperation({
        status: ReplicaStatus.HELD, workflowStep: WORKFLOW_STEP.PENDING,
      });
      t.equal(
        await reconcileGrowthPromoteLifecycle(owner, heldOp),
        OPERATION_RECONCILE_OUTCOME.HELD,
      );

      // 2. Already terminal ACTIVE operation returns COMPLETED; FAILED returns FAILED
      const terminalOp = buildGrowthPromoteOperation({
        status: ReplicaStatus.ACTIVE, workflowStep: WORKFLOW_STEP.ACTIVE, completedAt: Date.now(),
      });
      await owner.repository.persistNewOperation(terminalOp);
      t.equal(
        await reconcileGrowthPromoteLifecycle(owner, terminalOp),
        OPERATION_RECONCILE_OUTCOME.COMPLETED,
      );
      const failedTerminalOp = buildGrowthPromoteOperation({
        operationId: 'op-growth-promote-terminal-failed',
        status: ReplicaStatus.FAILED, workflowStep: WORKFLOW_STEP.FAILED, completedAt: Date.now(),
      });
      await owner.repository.persistNewOperation(failedTerminalOp);
      t.equal(
        await reconcileGrowthPromoteLifecycle(owner, failedTerminalOp),
        OPERATION_RECONCILE_OUTCOME.FAILED,
      );

      // 3. In-place SYNCING retry (no step change, not terminal) returns WAITING
      const syncingOp = buildGrowthPromoteOperation({
        status: ReplicaStatus.SYNCING, workflowStep: WORKFLOW_STEP.SYNCING,
      });
      owner.executeOperationFromReconcilePath = async () => ({
        success: true, status: ReplicaOperationResponseStatus.IN_PROGRESS,
      });
      t.equal(
        await reconcileGrowthPromoteLifecycle(owner, syncingOp),
        OPERATION_RECONCILE_OUTCOME.WAITING,
      );

      // 4. Step transition (PENDING -> SYNCING) returns ADVANCED
      const pendingOp = buildGrowthPromoteOperation({
        status: ReplicaStatus.PENDING, workflowStep: WORKFLOW_STEP.PENDING,
      });
      owner.executeOperationFromReconcilePath = async (op) => {
        op.workflowStep = WORKFLOW_STEP.SYNCING;
        op.status = ReplicaStatus.SYNCING;
        return {success: true, status: ReplicaOperationResponseStatus.IN_PROGRESS};
      };
      t.equal(
        await reconcileGrowthPromoteLifecycle(owner, pendingOp),
        OPERATION_RECONCILE_OUTCOME.ADVANCED,
      );

      // 5. Completion returns COMPLETED
      const completingOp = buildGrowthPromoteOperation({
        status: ReplicaStatus.SYNCING, workflowStep: WORKFLOW_STEP.SYNCING,
      });
      owner.executeOperationFromReconcilePath = async (op) => {
        op.workflowStep = WORKFLOW_STEP.ACTIVE;
        op.status = ReplicaStatus.ACTIVE;
        op.completedAt = Date.now();
        return {success: true, status: ReplicaOperationResponseStatus.COMPLETED};
      };
      t.equal(
        await reconcileGrowthPromoteLifecycle(owner, completingOp),
        OPERATION_RECONCILE_OUTCOME.COMPLETED,
      );
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'D6 & Counterexamples 1a/1b/1c: WAITING reconcile outcomes from unconfirmed ' +
    'active handoff, unapplied replace active progress, re-armed dispatch, ' +
    'skipped active-replace resume, and non-advancing remove dispatch do not ' +
    'suppress step timeout in reconcileTimeoutOperation',
  async (t) => {
    const now = 500_000;
    const staleEnteredAt = now - 120_000;
    const coordinator = createTestCoordinator({
      nodeId: TEST_LEADER_NODE_1,
      enableTimeouts: false,
    });
    const owner = coordinator.workflowOwner;

    try {
      // Counterexample 1a: confirmActiveReplicaTerminalHandoff returns false -> WAITING
      const unconfirmedAddOp = createOperation({
        operationId: 'op-add-unconfirmed-handoff',
        type: OperationType.ADD,
        partitionId: TEST_PARTITION_ID,
        replicaId: TEST_LEARNER_1,
        sourceNodeId: TEST_LEADER_NODE_1,
        targetNodeId: TEST_LEADER_NODE_1,
      });
      unconfirmedAddOp.status = ReplicaStatus.SYNCING;
      unconfirmedAddOp.workflowStep = WORKFLOW_STEP.SYNCING;
      unconfirmedAddOp.createdAt = staleEnteredAt;
      unconfirmedAddOp.updatedAt = staleEnteredAt;
      unconfirmedAddOp.stepsHistory = [
        {step: WORKFLOW_STEP.SYNCING, timestamp: staleEnteredAt},
      ];

      owner.confirmActiveReplicaTerminalHandoff = async () => false;
      t.equal(
        await owner.reconcileActiveReplicaStatus(unconfirmedAddOp),
        OPERATION_RECONCILE_OUTCOME.WAITING,
        'unconfirmed active terminal handoff must report WAITING',
      );

      // Counterexample 1a (part 2): REPLACE where reconcileReplaceActualActive returns false -> WAITING
      const replaceUnappliedOp = createOperation({
        operationId: 'op-replace-unapplied-active',
        type: OperationType.REPLACE,
        partitionId: TEST_PARTITION_ID,
        replicaId: TEST_LEARNER_1,
        sourceNodeId: TEST_LEADER_NODE_1,
        targetNodeId: TEST_LEADER_NODE_2,
      });
      replaceUnappliedOp.status = ReplicaStatus.SYNCING;
      replaceUnappliedOp.workflowStep = WORKFLOW_STEP.SYNCING;
      owner.confirmActiveReplicaTerminalHandoff = async () => true;
      owner.reconcileReplaceActualActive = async () => false;
      t.equal(
        await owner.reconcileActiveReplicaStatus(replaceUnappliedOp),
        OPERATION_RECONCILE_OUTCOME.WAITING,
        'unapplied REPLACE active progress must report WAITING',
      );

      // Counterexample 1b: shouldRearmDispatchFromProgressReconcile without step advancement -> WAITING
      const rearmAddOp = createOperation({
        operationId: 'op-add-rearm-no-advance',
        type: OperationType.ADD,
        partitionId: TEST_PARTITION_ID,
        replicaId: TEST_LEARNER_1,
        sourceNodeId: TEST_LEADER_NODE_1,
        targetNodeId: TEST_LEADER_NODE_1,
      });
      rearmAddOp.status = ReplicaStatus.PENDING;
      rearmAddOp.workflowStep = WORKFLOW_STEP.PENDING;
      rearmAddOp.createdAt = staleEnteredAt;
      rearmAddOp.updatedAt = staleEnteredAt;
      rearmAddOp.stepsHistory = [
        {step: WORKFLOW_STEP.PENDING, timestamp: staleEnteredAt},
      ];
      owner.shouldRearmDispatchFromProgressReconcile = () => true;
      owner.executeOperationFromReconcilePath = async () => ({
        success: true,
        status: ReplicaOperationResponseStatus.IN_PROGRESS,
      });
      t.equal(
        await owner.applyReconciledReplicaStatus(rearmAddOp, null, {
          cause: 'timeout',
        }),
        OPERATION_RECONCILE_OUTCOME.WAITING,
        're-armed dispatch that does not advance workflowStep must report WAITING',
      );

      // Counterexample 1c (EXECUTE_ACTIVE_REPLACE skipped): returns WAITING
      const activeReplaceOp = createOperation({
        operationId: 'op-replace-active-skipped',
        type: OperationType.REPLACE,
        partitionId: TEST_PARTITION_ID,
        replicaId: TEST_LEARNER_1,
        sourceNodeId: TEST_LEADER_NODE_1,
        targetNodeId: TEST_LEADER_NODE_2,
      });
      activeReplaceOp.status = ReplicaStatus.ACTIVE;
      activeReplaceOp.workflowStep = WORKFLOW_STEP.ACTIVE;
      owner.reconcileActiveReplaceSourceRemovalProgress = async () => false;
      owner.executeOperationFromReconcilePath = async () => ({
        skipped: true,
      });
      owner.ensurePriorityActiveReplaceRetryArmed = () => {};
      t.equal(
        await owner.reconcileOperationLifecycle(activeReplaceOp, {
          cause: 'progress',
        }),
        OPERATION_RECONCILE_OUTCOME.WAITING,
        'skipped EXECUTE_ACTIVE_REPLACE must report WAITING',
      );

      // Counterexample 1c & Finding 6 (EXECUTE_REMOVE_DISPATCH skipped with deferred_retry_pending):
      // returns WAITING (reconcileOperationLifecycle returns false) and reconcileTimeoutOperation
      // fails the timed-out REMOVE operation instead of returning early
      const removeOp = createOperation({
        operationId: 'op-remove-stuck-dispatch',
        type: OperationType.REMOVE,
        partitionId: TEST_PARTITION_ID,
        replicaId: TEST_LEARNER_1,
        sourceNodeId: TEST_LEADER_NODE_1,
        targetNodeId: TEST_LEADER_NODE_1,
      });
      removeOp.status = ReplicaStatus.PENDING;
      removeOp.workflowStep = WORKFLOW_STEP.PENDING;
      removeOp.createdAt = staleEnteredAt;
      removeOp.updatedAt = staleEnteredAt;
      removeOp.stepsHistory = [
        {step: WORKFLOW_STEP.PENDING, timestamp: staleEnteredAt},
      ];
      owner.isOperationDeferredRetryActive = () => true;
      owner.executeOperationFromReconcilePath = async () => ({
        success: false,
        skipped: true,
        reason: 'deferred_retry_pending',
      });
      t.equal(
        await owner.reconcileOperationLifecycle(removeOp, {
          cause: 'timeout',
        }),
        OPERATION_RECONCILE_OUTCOME.WAITING,
        'skipped EXECUTE_REMOVE_DISPATCH with active deferred retry must report WAITING',
      );
      t.equal(
        await owner.reconcileOperationLifecycle(removeOp, {
          cause: 'timeout',
        }),
        OPERATION_RECONCILE_OUTCOME.WAITING,
        'reconcileOperationLifecycle reports WAITING when dispatch is skipped',
      );

      const failedOperations = [];
      owner.failOperation = async (op, reason) => {
        failedOperations.push({operationId: op.operationId, reason});
        op.workflowStep = WORKFLOW_STEP.FAILED;
        op.status = ReplicaStatus.FAILED;
        op.completedAt = now;
        op.entityType = 'partition';
        op.entityId = op.partitionId;
        return buildTerminalOperationFixtureOutcome(op,
          {failed: true, completedAt: op.completedAt});
      };
      await owner.reconcileTimeoutOperation(removeOp, now);
      t.equal(
        failedOperations.length,
        1,
        'WAITING reconcile outcome from skipped dispatch must not suppress step timeout in reconcileTimeoutOperation',
      );
      t.equal(failedOperations[0].operationId, removeOp.operationId);
      t.match(failedOperations[0].reason, /Timeout in pending step/i);
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'D4 & D6: placement-admitted ADD operation completes when target replica reaches ' +
    'status=active with raft_role=learner on reconstructed OperationWorkflowOwner',
  async (t) => {
    const cache = new SystemTableCache();
    cache.applySystemTableChange(
      SYSTEM_TABLE_NAME.SERVICES,
      CDC_OPERATION.UPSERT,
      {
        service_id: TEST_LEARNER_1,
        replica_id: TEST_LEARNER_1,
        service_type: 'partition',
        partition_id: TEST_PARTITION_ID,
        node_id: TEST_LEADER_NODE_2,
        status: ReplicaStatus.ACTIVE,
        raft_role: RAFT_ROLE.LEARNER,
      },
    );
    const coordinator = createTestCoordinator({
      nodeId: TEST_LEADER_NODE_1,
      systemTableCache: cache,
    });
    coordinator.bindReplicaPlacementOwnerFactory(() => null);
    const owner = coordinator.workflowOwner;

    try {
      t.equal(coordinator.placementAdmissionEnabled, true);
      t.equal(owner.placementAdmissionEnabled, true);

      const reloadedAddRow = {
        operation_id: 'pl-nodes-p1-177-0',
        type: OperationType.ADD,
        partition_id: TEST_PARTITION_ID,
        entity_type: 'partition',
        entity_id: TEST_PARTITION_ID,
        replica_id: TEST_LEARNER_1,
        source_node_id: TEST_LEADER_NODE_1,
        target_node_id: TEST_LEADER_NODE_2,
        status: ReplicaStatus.SYNCING,
        workflow_step: WORKFLOW_STEP.SYNCING,
        created_at: 1000,
        updated_at: 2000,
        completed_at: null,
        error_message: null,
        steps_history: JSON.stringify([
          {
            step: WORKFLOW_STEP.PENDING,
            timestamp: 1000,
            placementAdmission: {
              entryId: 'placement-owner:test',
              transitionKind: 'PLACEMENT',
            },
          },
          {
            step: WORKFLOW_STEP.SYNCING,
            timestamp: 2000,
          },
        ]),
      };
      const addOp = coordinator.repository.rowToOperation(reloadedAddRow);
      t.equal(owner.isLearnerTargetAddOperation(addOp), true);
      t.equal(
        owner.getObservedOperationRowTargetProgressStatus(addOp),
        ReplicaStatus.ACTIVE,
      );

      owner.confirmActiveReplicaTerminalHandoff = async () => true;
      const completedIds = [];
      owner.completeOperation = async (op) => {
        completedIds.push(op.operationId);
        op.workflowStep = WORKFLOW_STEP.ACTIVE;
        op.status = ReplicaStatus.ACTIVE;
        op.completedAt = 3000;
        return buildTerminalOperationFixtureOutcome(op, {completedAt: op.completedAt});
      };
      const outcome = await owner.reconcileOperationLifecycle(addOp, {
        cause: 'progress',
      });
      t.equal(outcome, OPERATION_RECONCILE_OUTCOME.COMPLETED);
      t.same(completedIds, ['pl-nodes-p1-177-0']);
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'Step 1 real-repository witnesses: 4-phase growth settlement model ' +
    '(RECONCILING -> PERSISTING -> RELEASING -> SETTLED) across UPDATED, ' +
    'IDEMPOTENT_REPLAY, TERMINAL_ADOPTED, REFUSED, REINSERTED, duplicate ' +
    'reconciliation, and interrupted terminal reply recovery',
  async (t) => {
    const coordinator = createTestCoordinator({
      nodeId: TEST_LEADER_NODE_1,
      enableTimeouts: false,
    });
    const owner = coordinator.workflowOwner;

    const releasedReservationIds = [];
    const baseReleaseReservation =
      owner.releaseReservationForOperation.bind(owner);
    owner.releaseReservationForOperation = async (op) => {
      releasedReservationIds.push(op.operationId);
      return baseReleaseReservation(op);
    };

    const scheduledProgressRetryIds = [];
    const baseScheduleObservedProgressRetry =
      owner.scheduleObservedProgressRetry.bind(owner);
    owner.scheduleObservedProgressRetry = (opId, tableName, opType) => {
      scheduledProgressRetryIds.push(opId);
      return baseScheduleObservedProgressRetry(opId, tableName, opType);
    };

    const validCommittedResponse = {
      committedVotersReached: true,
      partitionId: TEST_PARTITION_ID,
      [ReplicaOperationField.PROPOSAL]: {
        outcome: 'CORE_OK',
        promotedReplicaIds: [TEST_LEARNER_1, TEST_LEARNER_2],
      },
    };

    const seedDurableGrowthOperation = async (operationId, extra = {}) => {
      const op = buildGrowthPromoteOperation({
        operationId,
        status: ReplicaStatus.SYNCING,
        workflowStep: WORKFLOW_STEP.SYNCING,
        completedAt: null,
        ...extra,
      });
      if (extra.stepsHistory) op.stepsHistory = extra.stepsHistory;
      const persisted = await coordinator.repository.persistNewOperation(op);
      t.equal(persisted, true, `seed ${operationId} into real SQLite repository`);
      return op;
    };

    try {
      // Phase 1 (RECONCILING) check: unconfirmed response stays in RECONCILING/WAITING
      const op1 = await seedDurableGrowthOperation('op-real-repo-updated');
      const reconcilingSettlement = await settleGrowthPromoteCompletion(
        owner, op1, {
          response: {
            committedVotersReached: false,
            partitionId: TEST_PARTITION_ID,
          },
        },
      );
      t.equal(reconcilingSettlement.phase, GROWTH_SETTLEMENT_PHASE.RECONCILING);
      t.equal(reconcilingSettlement.reconcileOutcome, OPERATION_RECONCILE_OUTCOME.WAITING);
      t.equal(reconcilingSettlement.committed, false);
      t.equal(reconcilingSettlement.disposition, null);

      // Witness 1: Successful terminal persistence (UPDATED -> SETTLED, COMPLETED)
      const updatedResult = await reconcileGrowthPromoteDispatchResponse(
        owner, op1, validCommittedResponse,
      );
      t.equal(updatedResult.status, ReplicaOperationResponseStatus.COMPLETED);
      t.equal(updatedResult.settlementPhase, GROWTH_SETTLEMENT_PHASE.SETTLED);
      t.equal(updatedResult.reconcileOutcome, OPERATION_RECONCILE_OUTCOME.COMPLETED);
      t.equal(updatedResult.disposition, REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED);
      t.ok(releasedReservationIds.includes(op1.operationId));
      const durableOp1 =
        await coordinator.repository.queryAuthoritativeOperationById(op1.operationId);
      t.equal(durableOp1.workflowStep, WORKFLOW_STEP.ACTIVE);
      t.equal(durableOp1.status, ReplicaStatus.ACTIVE);
      t.ok(Number.isFinite(durableOp1.completedAt));

      // Witness 2: Identical terminal replay (IDEMPOTENT_REPLAY -> SETTLED, COMPLETED)
      const staleCopyOfOp1 = buildGrowthPromoteOperation({
        operationId: op1.operationId,
        status: ReplicaStatus.SYNCING,
        workflowStep: WORKFLOW_STEP.SYNCING,
        completedAt: null,
      });
      const replayFromLaggingMemory = await settleGrowthPromoteCompletion(
        owner, staleCopyOfOp1, {response: validCommittedResponse},
      );
      t.equal(replayFromLaggingMemory.phase, GROWTH_SETTLEMENT_PHASE.SETTLED);
      t.equal(replayFromLaggingMemory.reconcileOutcome, OPERATION_RECONCILE_OUTCOME.COMPLETED);
      t.equal(replayFromLaggingMemory.committed, false);
      t.equal(
        replayFromLaggingMemory.disposition,
        REPLICA_OPERATION_UPDATE_DISPOSITION.IDEMPOTENT_REPLAY,
      );
      t.equal(staleCopyOfOp1.workflowStep, WORKFLOW_STEP.ACTIVE);
      t.equal(staleCopyOfOp1.status, ReplicaStatus.ACTIVE);

      const replayFromSettledInstance = await settleGrowthPromoteCompletion(
        owner, op1, {response: validCommittedResponse},
      );
      t.equal(replayFromSettledInstance.phase, GROWTH_SETTLEMENT_PHASE.SETTLED);
      t.equal(replayFromSettledInstance.reconcileOutcome, OPERATION_RECONCILE_OUTCOME.COMPLETED);
      t.equal(replayFromSettledInstance.committed, false);
      t.equal(
        replayFromSettledInstance.disposition,
        REPLICA_OPERATION_UPDATE_DISPOSITION.IDEMPOTENT_REPLAY,
      );

      // Witness 3: Competing durable failure winning the conditional write (TERMINAL_ADOPTED)
      const opCompeting = await seedDurableGrowthOperation('op-real-repo-terminal-adopted');
      await coordinator.sqlQueryEngine.executeQuery(
        `UPDATE replica_operations
            SET status = ?, workflow_step = ?, completed_at = ?, error_message = ?
          WHERE operation_id = ?`,
        [
          ReplicaStatus.FAILED,
          WORKFLOW_STEP.FAILED,
          99_000,
          'competing step timeout failure',
          opCompeting.operationId,
        ],
      );
      releasedReservationIds.length = 0;
      scheduledProgressRetryIds.length = 0;

      const adoptedDispatchResult = await reconcileGrowthPromoteDispatchResponse(
        owner, opCompeting, validCommittedResponse,
      );
      t.equal(adoptedDispatchResult.status, ReplicaOperationResponseStatus.FAILED);
      t.equal(adoptedDispatchResult.settlementPhase, GROWTH_SETTLEMENT_PHASE.SETTLED);
      t.equal(adoptedDispatchResult.reconcileOutcome, OPERATION_RECONCILE_OUTCOME.FAILED);
      t.equal(
        adoptedDispatchResult.disposition,
        REPLICA_OPERATION_UPDATE_DISPOSITION.TERMINAL_ADOPTED,
      );
      t.equal(opCompeting.status, ReplicaStatus.FAILED);
      t.equal(opCompeting.workflowStep, WORKFLOW_STEP.FAILED);
      t.equal(opCompeting.completedAt, 99_000);
      t.equal(opCompeting.errorMessage, 'competing step timeout failure');
      t.same(scheduledProgressRetryIds, []);
      t.same(releasedReservationIds, [opCompeting.operationId]);
      const durableCompeting =
        await coordinator.repository.queryAuthoritativeOperationById(opCompeting.operationId);
      t.equal(durableCompeting.status, ReplicaStatus.FAILED);
      t.equal(durableCompeting.workflowStep, WORKFLOW_STEP.FAILED);
      t.equal(durableCompeting.completedAt, 99_000);

      // Witness 4: Refused or reinserted persistence (REFUSED / REINSERTED -> stays in PERSISTING)
      const opReinserted = await seedDurableGrowthOperation('op-real-repo-reinserted');
      await coordinator.sqlQueryEngine.executeQuery(
        'DELETE FROM replica_operations WHERE operation_id = ?',
        [opReinserted.operationId],
      );
      coordinator.systemTableCache.delete(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, opReinserted.operationId,
      );
      releasedReservationIds.length = 0;

      const reinsertedSettlement = await settleGrowthPromoteCompletion(
        owner, opReinserted, {response: validCommittedResponse},
      );
      t.equal(reinsertedSettlement.phase, GROWTH_SETTLEMENT_PHASE.PERSISTING);
      t.equal(reinsertedSettlement.reconcileOutcome, OPERATION_RECONCILE_OUTCOME.WAITING);
      t.equal(reinsertedSettlement.committed, false);
      t.equal(reinsertedSettlement.disposition, REPLICA_OPERATION_UPDATE_DISPOSITION.REINSERTED);
      t.same(releasedReservationIds, []);

      const opRefused = await seedDurableGrowthOperation('op-real-repo-refused', {
        stepsHistory: [
          {
            step: WORKFLOW_STEP.PENDING,
            timestamp: 1000,
            placementAdmission: {
              entryId: 'placement-owner:test',
              transitionKind: 'GROWTH_PROMOTE',
            },
          },
          {step: WORKFLOW_STEP.SYNCING, timestamp: 2000},
        ],
      });
      await coordinator.sqlQueryEngine.executeQuery(
        'DELETE FROM replica_operations WHERE operation_id = ?',
        [opRefused.operationId],
      );
      coordinator.systemTableCache.delete(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS, opRefused.operationId,
      );
      releasedReservationIds.length = 0;

      const refusedSettlement = await settleGrowthPromoteCompletion(
        owner, opRefused, {response: validCommittedResponse},
      );
      t.equal(refusedSettlement.phase, GROWTH_SETTLEMENT_PHASE.PERSISTING);
      t.equal(refusedSettlement.reconcileOutcome, OPERATION_RECONCILE_OUTCOME.REFUSED);
      t.equal(refusedSettlement.committed, false);
      t.equal(refusedSettlement.disposition, REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED);
      t.same(releasedReservationIds, []);

      // Witness 5: Duplicate reconciliation after settlement preserves terminal status
      t.equal(
        await reconcileGrowthPromoteLifecycle(owner, op1),
        OPERATION_RECONCILE_OUTCOME.COMPLETED,
      );
      t.equal(op1.status, ReplicaStatus.ACTIVE);
      t.equal(op1.workflowStep, WORKFLOW_STEP.ACTIVE);

      t.equal(
        await reconcileGrowthPromoteLifecycle(owner, opCompeting),
        OPERATION_RECONCILE_OUTCOME.FAILED,
      );
      t.equal(opCompeting.status, ReplicaStatus.FAILED);
      t.equal(opCompeting.workflowStep, WORKFLOW_STEP.FAILED);

      // Witness 6: actual persistence reply loss after the durable terminal write.
      // Growth occupancy clears through the terminal census row. There is no
      // production workflow placement-release callback or storage reservation.
      const opInterruptedHold = await seedDurableGrowthOperation('op-real-repo-lost-reply');
      const persist = owner.repository.persistOperationUpdate.bind(owner.repository);
      let interruptReply = true;
      owner.repository.persistOperationUpdate = async (...args) => {
        const result = await persist(...args);
        if (interruptReply) {
          interruptReply = false;
          throw new Error('lost reply after durable growth terminal');
        }
        return result;
      };
      await t.rejects(reconcileGrowthPromoteDispatchResponse(
        owner, opInterruptedHold, validCommittedResponse),
      /lost reply after durable growth terminal/);
      const durableAfterInterruptedRelease =
        await coordinator.repository.queryAuthoritativeOperationById(
          opInterruptedHold.operationId,
        );
      t.equal(durableAfterInterruptedRelease.workflowStep, WORKFLOW_STEP.ACTIVE);
      t.equal(durableAfterInterruptedRelease.status, ReplicaStatus.ACTIVE);
      t.ok(Number.isFinite(durableAfterInterruptedRelease.completedAt));

      const recoveredSettlement = await settleGrowthPromoteCompletion(
        owner, opInterruptedHold,
      );
      t.equal(recoveredSettlement.phase, GROWTH_SETTLEMENT_PHASE.SETTLED);
      t.equal(recoveredSettlement.reconcileOutcome, OPERATION_RECONCILE_OUTCOME.COMPLETED);
    } finally {
      await coordinator.shutdown();
    }
  },
);

test(
  'Step 2 learner-admission wait witnesses: real PartitionService prototype ' +
    'interface drives pending admission, detects memberRole=LEARNER, enforces ' +
    'DEADLINE_EXCEEDED and SERVICE_DISAPPEARED before releaseFreshCreate, ' +
    'and preserves remaining original CREATE budget',
  async (t) => {
    t.equal(typeof PartitionService.prototype.driveReplicaAdmission, 'function');
    t.equal(typeof PartitionService.prototype.drivePendingReplicaAdmission, 'function');

    class TestLearnerWaitReplicaHandler {
      constructor(options = {}) {
        this.nodeId = TEST_LEADER_NODE_2;
        this.syncTimeoutMs = options.syncTimeoutMs ?? 5000;
        this.realRaftMode = true;
        this.messageRouter = {deliver: async () => ({acknowledged: true})};
        this.localServices = new Map();
        this.inProgressOperations = new Map();
        this.timeSource = options.timeSource || null;
        this.systemTableCache = new SystemTableCache();
        this.logger = {info: () => {}, warn: () => {}, error: () => {}, debug: () => {}};
      }
      throwIfShuttingDown() {}
      getTrackedService(id) {
        return this.localServices.get(id) || null;
      }
      getTrackedReplicaRole(id) {
        return this.getTrackedService(id)?.raft?.readStatus?.()?.role ?? null;
      }
    }
    assignReplicaHandlerVoterReadinessMethods(TestLearnerWaitReplicaHandler);
    assignReplicaHandlerCreateMethods(TestLearnerWaitReplicaHandler);

    let nowMs = 10_000;
    let nextTimerId = 1;
    const activeTimers = new Set();
    const virtualTimeSource = {
      now: () => nowMs,
      setTimeout: (fn, delayMs) => {
        const id = nextTimerId++;
        activeTimers.add(id);
        setImmediate(() => {
          if (!activeTimers.has(id)) return;
          activeTimers.delete(id);
          nowMs += delayMs;
          fn();
        });
        return id;
      },
      clearTimeout: (id) => {
        activeTimers.delete(id);
      },
    };
    const handler = new TestLearnerWaitReplicaHandler({
      syncTimeoutMs: 5000,
      timeSource: virtualTimeSource,
    });

    const makePrototypeService = (replicaId, opId) => {
      const svc = Object.create(PartitionService.prototype);
      svc.partitionId = TEST_PARTITION_ID;
      svc.replicaId = replicaId;
      svc.isShutdown = false;
      svc.learnerPromotionTimer = null;
      svc.learnerPromotionWake = null;
      svc.logger = handler.logger;
      svc.replicaAdmissionRequest = {
        operationId: opId,
        state: 'pending',
        lastOutcome: 'authority_unavailable',
        rereadStamp: false,
        leaderHint: null,
      };
      return svc;
    };

    const realPrototypeService = makePrototypeService(TEST_LEARNER_1, 'op-admit-learner-1');
    let sendAdmissionCalls = 0;
    let currentRaftStatus = {
      role: 'follower', memberRole: 'UNKNOWN', leaderAddress: '', peers: [],
    };
    realPrototypeService.raft = {readStatus: () => currentRaftStatus};
    realPrototypeService.sendReplicaAdmissionRequest = async () => {
      sendAdmissionCalls += 1;
      nowMs += 300;
      currentRaftStatus = {
        role: 'follower',
        memberRole: 'LEARNER',
        leaderAddress: '127.0.0.1:19001',
        peers: [],
      };
      return {outcome: 'proposed', nodeId: TEST_LEADER_NODE_2};
    };
    handler.localServices.set(TEST_LEARNER_1, realPrototypeService);

    const readyOutcome = await handler.waitForLearnerAdmissionActivation(
      TEST_LEARNER_1, TEST_PARTITION_ID, {deadlineAtMs: 15_000},
    );
    t.equal(sendAdmissionCalls, 1);
    t.equal(readyOutcome.ready, true);
    t.equal(readyOutcome.outcome, LEARNER_ADMISSION_WAIT_OUTCOME.READY);
    t.equal(readyOutcome.remainingBudgetMs, 4700);
    t.equal(realPrototypeService.replicaAdmissionRequest.lastOutcome, 'proposed');

    // 2. Service disappearance returns SERVICE_DISAPPEARED (ready: false)
    const disappearingService = makePrototypeService(
      'user_orders-p1-r-disappear', 'op-admit-disappear',
    );
    disappearingService.raft = {
      readStatus: () => ({
        role: 'follower', memberRole: 'UNKNOWN', leaderAddress: '', peers: [],
      }),
    };
    disappearingService.sendReplicaAdmissionRequest = async () => {
      handler.localServices.delete(disappearingService.replicaId);
      return {outcome: 'authority_unavailable'};
    };
    handler.localServices.set(disappearingService.replicaId, disappearingService);

    const disappearedOutcome = await handler.waitForLearnerAdmissionActivation(
      disappearingService.replicaId, TEST_PARTITION_ID, {deadlineAtMs: nowMs + 5000},
    );
    t.equal(disappearedOutcome.ready, false);
    t.equal(disappearedOutcome.outcome, LEARNER_ADMISSION_WAIT_OUTCOME.SERVICE_DISAPPEARED);

    // 3. Deadline expiry returns DEADLINE_EXCEEDED (ready: false, remainingBudgetMs: 0)
    const timedOutService = makePrototypeService(
      'user_orders-p1-r-timeout', 'op-admit-timeout',
    );
    timedOutService.raft = {
      readStatus: () => ({
        role: 'follower', memberRole: 'UNKNOWN', leaderAddress: '', peers: [],
      }),
    };
    timedOutService.sendReplicaAdmissionRequest = async () => ({
      outcome: 'authority_unavailable',
    });
    handler.localServices.set(timedOutService.replicaId, timedOutService);

    const startTimeoutWaitMs = nowMs;
    const deadlineOutcome = await handler.waitForLearnerAdmissionActivation(
      timedOutService.replicaId, TEST_PARTITION_ID, {deadlineAtMs: startTimeoutWaitMs + 120},
    );
    t.equal(deadlineOutcome.ready, false);
    t.equal(deadlineOutcome.outcome, LEARNER_ADMISSION_WAIT_OUTCOME.DEADLINE_EXCEEDED);
    t.equal(deadlineOutcome.remainingBudgetMs, 0);

    // 3a. Boundary witness 1: Already expired on entry (deadlineAtMs <= now)
    // returns DEADLINE_EXCEEDED without calling driveReplicaAdmission (driveCalls === 0)
    const expiredEntryService = makePrototypeService(
      'user_orders-p1-r-expired-entry', 'op-admit-expired-entry',
    );
    let expiredEntryDriveCalls = 0;
    expiredEntryService.raft = {
      readStatus: () => ({
        role: 'follower', memberRole: 'LEARNER', leaderAddress: '127.0.0.1:19001', peers: [],
      }),
    };
    expiredEntryService.driveReplicaAdmission = async () => {
      expiredEntryDriveCalls += 1;
    };
    handler.localServices.set(expiredEntryService.replicaId, expiredEntryService);
    const expiredEntryOutcome = await handler.waitForLearnerAdmissionActivation(
      expiredEntryService.replicaId, TEST_PARTITION_ID, {deadlineAtMs: nowMs},
    );
    t.equal(expiredEntryOutcome.ready, false);
    t.equal(expiredEntryOutcome.outcome, LEARNER_ADMISSION_WAIT_OUTCOME.DEADLINE_EXCEEDED);
    t.equal(expiredEntryOutcome.remainingBudgetMs, 0);
    t.equal(expiredEntryDriveCalls, 0);

    // 3b. Boundary witness 2: Expiry during driveReplicaAdmission() delivery
    // resolves DEADLINE_EXCEEDED when deadlineAtMs expires without waiting for a hung delivery
    const hungDriveService = makePrototypeService(
      'user_orders-p1-r-hung-drive', 'op-admit-hung-drive',
    );
    hungDriveService.raft = {
      readStatus: () => ({
        role: 'follower', memberRole: 'UNKNOWN', leaderAddress: '', peers: [],
      }),
    };
    hungDriveService.sendReplicaAdmissionRequest = () => new Promise(() => {});
    handler.localServices.set(hungDriveService.replicaId, hungDriveService);
    const hungDriveOutcome = await handler.waitForLearnerAdmissionActivation(
      hungDriveService.replicaId, TEST_PARTITION_ID, {deadlineAtMs: nowMs + 80},
    );
    t.equal(hungDriveOutcome.ready, false);
    t.equal(hungDriveOutcome.outcome, LEARNER_ADMISSION_WAIT_OUTCOME.DEADLINE_EXCEEDED);
    t.equal(hungDriveOutcome.remainingBudgetMs, 0);

    // 3c. Boundary witness 3: Late readiness arriving after expiry returns
    // DEADLINE_EXCEEDED (never READY) even when driveReplicaAdmission mutates state=admitted
    const lateReadyService = makePrototypeService(
      'user_orders-p1-r-late-ready', 'op-admit-late-ready',
    );
    let lateReadyRaftStatus = {
      role: 'follower', memberRole: 'UNKNOWN', leaderAddress: '', peers: [],
    };
    lateReadyService.raft = {readStatus: () => lateReadyRaftStatus};
    lateReadyService.driveReplicaAdmission = async () => {
      nowMs += 200;
      lateReadyService.replicaAdmissionRequest.state = 'admitted';
      lateReadyRaftStatus = {
        role: 'follower', memberRole: 'LEARNER', leaderAddress: '127.0.0.1:19001', peers: [],
      };
      return lateReadyService.replicaAdmissionRequest;
    };
    handler.localServices.set(lateReadyService.replicaId, lateReadyService);
    const lateReadyOutcome = await handler.waitForLearnerAdmissionActivation(
      lateReadyService.replicaId, TEST_PARTITION_ID, {deadlineAtMs: nowMs + 100},
    );
    t.equal(lateReadyOutcome.ready, false);
    t.equal(lateReadyOutcome.outcome, LEARNER_ADMISSION_WAIT_OUTCOME.DEADLINE_EXCEEDED);
    t.equal(lateReadyOutcome.remainingBudgetMs, 0);

    // 4. End-to-end createReplicaAsync integration: timeout fails before releaseFreshCreate;
    // success preserves remaining original CREATE budget into releaseFreshCreate
    const releaseFreshCreateCalls = [];
    const admissionEvidence = (operationId) => ({
      operationId, partitionId: TEST_PARTITION_ID, replicaId: TEST_LEARNER_2,
      targetNodeId: TEST_LEADER_NODE_2, admissionToken: `admission-${operationId}`,
      attemptToken: `attempt-${operationId}`, attemptSeq: 1, replicaCreatedAt: 20_000,
    });
    const timedOut = admissionEvidence('op-create-budget');
    const admitted = admissionEvidence('op-create-budget-ok');
    // Build provenance does host I/O. Complete it before the virtual CREATE clock runs.
    await runtimeBuildProvenance();
    let simulateAdmissionTimeoutInCreate = true;
    nowMs = 20_000;

    const createHandler = new TestLearnerWaitReplicaHandler({
      syncTimeoutMs: 5000,
      timeSource: virtualTimeSource,
    });
    createHandler.inProgressOperations.set(timedOut.operationId, {startedAt: 20_000});
    createHandler.startReplicaCreationProgress = () => ({});
    createHandler.clearReplicaCreationProgress = () => {};
    createHandler.finishReplicaCreationProgress = () => {};
    createHandler.failReplicaCreationProgress = () => {};
    createHandler.settlePendingReplicaRuntimeCleanup = async () => {};
    createHandler.dropGroupRetiredTombstoneBeforeBirth = () => {};
    createHandler.persistReplicaCreateInitialStatus = async () => true;
    createHandler.applyBootstrapMetadataPayload = () => {};
    createHandler.resolveReplicaContextWithRetry = async () => ({
      tableName: 'user_orders',
      tableId: 'user_orders',
      schema: {columns: []},
      keyRange: {},
      replicaIds: [TEST_LEADER_REPLICA_2, TEST_LEARNER_2],
      existingReplicaCount: 1,
      bootstrapMembership: null,
    });
    createHandler.getPartitionDbPath = () => ':memory:';
    createHandler.getReplicaCreateAdmissionOwner = () => ({
      revalidatePhysicalWorker: async () => true,
      markProgress: async () => true,
      releasePhysicalWorker: () => {},
    });
    createHandler.shouldGateActivationOnVoterReadiness = () => false;
    createHandler.updateReplicaCreationProgress = () => {};
    createHandler.setLocalReplica = (id, record) => {
      if (record?.service) createHandler.localServices.set(id, record.service);
    };
    createHandler.emitExecutorOutcome = () => {};
    createHandler.persistReplicaStatusWithRetry = async () => {};
    createHandler.fenceFailedReplicaCreateRuntime = async () => {};
    createHandler.persistOrConfirmReplicaCreateFailed = async () => true;
    createHandler.shouldUsePriorityReplicaCreateStatusFallback = () => false;
    createHandler.emit = () => {};
    createHandler.replicaIdentityRepository = {
      observeIdentity: async () => ({existed: false, record: {recorded: true}}),
      recordIdentity: async () => ({recorded: true}),
    };
    createHandler.localServices = new TrackedServiceRegistry();
    createHandler.consensusEvents = {
      subscribe: (listener) => createHandler.localServices.subscribeConsensusObservations(listener),
    };
    createHandler.participantReleaseAuthorizationOwner =
      createParticipantReleaseAuthorizationOwner(createHandler);
    createHandler.participantReleaseRecovery = createParticipantReleaseRecovery(createHandler);
    t.teardown(() => createHandler.participantReleaseRecovery.shutdown());
    const transport = createInProcessMockTransport();
    const releaseAddress = createHandler.nodeId + PARTICIPANT_RELEASE_ROUTE_SUFFIX;
    const releaseHandler = ({payload}) => {
      releaseFreshCreateCalls.push({
        partitionId: payload.partitionId,
        deadlineAtMs: payload.deadlineAtMs,
        remainingBudgetAtReleaseEntryMs: payload.deadlineAtMs - nowMs,
      });
      assert.equal(payload.type, PARTICIPANT_RELEASE_TYPE);
      assert.equal(payload.action, PARTICIPANT_RELEASE_ACTION.RELEASE);
      assert.equal(payload.trigger, PARTICIPANT_RELEASE_TRIGGER.FRESH_CREATE);
      assert.deepEqual(payload.createAdmissionIdentity, admitted);
      const service = createHandler.getTrackedService(admitted.replicaId);
      assert.equal(service.partitionId, payload.partitionId);
      assert.equal(service.createAdmissionOperationId, admitted.operationId);
      assert.equal(service.createAdmissionToken, admitted.admissionToken);
      assert.equal(service.createAttemptToken, admitted.attemptToken);
      return {[PARTICIPANT_RELEASE_RESULT_FIELD]: {
        outcome: PARTICIPANT_CUTOVER_OUTCOME.CUT_OVER,
      }};
    };
    transport.register(releaseAddress, releaseHandler);
    createHandler.messageRouter = transport;
    createHandler.registeredRouterHandler = releaseHandler;
    createHandler.createPartitionService = async (options) => {
      const svc = makePrototypeService(TEST_LEARNER_2, 'op-create-budget');
      svc.participantTransactionCoordinator = {};
      svc.requestReplicaAdmission = async (opId) => {
        svc.replicaAdmissionRequest = {
          operationId: opId,
          state: 'pending',
          lastOutcome: 'authority_unavailable',
          rereadStamp: false,
          leaderHint: null,
        };
      };
      let admitted = false;
      svc.raft = {
        readStatus: () => ({
          role: 'follower',
          memberRole: admitted ? 'LEARNER' : 'UNKNOWN',
          leaderAddress: admitted ? '127.0.0.1:19001' : '',
          peers: [],
        }),
      };
      svc.sendReplicaAdmissionRequest = async () => {
        if (simulateAdmissionTimeoutInCreate) {
          return {outcome: 'authority_unavailable'};
        }
        nowMs += 1200;
        admitted = true;
        return {outcome: 'proposed', nodeId: TEST_LEADER_NODE_2};
      };
      return completePartitionConstructionFixture(svc, options);
    };

    await t.rejects(
      createHandler.createReplicaAsync({
        operationId: timedOut.operationId,
        explicitOperationType: OperationType.ADD,
        partitionId: TEST_PARTITION_ID,
        replicaId: TEST_LEARNER_2,
        createAdmissionEvidence: timedOut,
      }),
      /Learner admission wait failed for replica user_orders-p1-r3: deadline_exceeded/,
    );
    t.equal(releaseFreshCreateCalls.length, 0);

    simulateAdmissionTimeoutInCreate = false;
    nowMs = 30_000;
    createHandler.inProgressOperations.set(admitted.operationId, {startedAt: 30_000});
    await createHandler.createReplicaAsync({
      operationId: admitted.operationId,
      explicitOperationType: OperationType.ADD,
      partitionId: TEST_PARTITION_ID,
      replicaId: TEST_LEARNER_2,
      createAdmissionEvidence: admitted,
    });
    t.equal(releaseFreshCreateCalls.length, 1);
    t.equal(releaseFreshCreateCalls[0].partitionId, TEST_PARTITION_ID);
    t.equal(releaseFreshCreateCalls[0].deadlineAtMs, 35_000);
    t.equal(releaseFreshCreateCalls[0].remainingBudgetAtReleaseEntryMs, 3800);
  },
);

test(
  'Step 3 durable ledger reconciliation witness: completed GROWTH_PROMOTE row ' +
    'in replica_operations-p1 classifies promoted replicas as voters in ' +
    'ReplicaPlacementOwner while SERVICES cache rows still lag at learner',
  async (t) => {
    const db = new Database(':memory:');
    db.exec(generateCreateTableSQL(REPLICA_OPERATIONS_SCHEMA));
    const nowMs = 1_700_000_000_000;

    const history = JSON.stringify([
      {
        step: WORKFLOW_STEP.PENDING,
        timestamp: nowMs - 1000,
        promoteReplicaIds: [TEST_LEARNER_1, TEST_LEARNER_2],
      },
      {
        step: WORKFLOW_STEP.ACTIVE,
        timestamp: nowMs,
      },
    ]);
    db.prepare(
      `INSERT INTO replica_operations (
        operation_id, type, partition_id, entity_type, entity_id,
        replica_id, source_node_id, target_node_id, source_replica_id,
        status, workflow_step, created_at, updated_at, completed_at, steps_history
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'pl-user_orders-p1-10-0',
      OperationType.GROWTH_PROMOTE,
      TEST_PARTITION_ID,
      'partition',
      TEST_PARTITION_ID,
      TEST_LEARNER_1,
      TEST_LEADER_NODE_1,
      TEST_LEADER_NODE_1,
      TEST_LEARNER_2,
      ReplicaStatus.ACTIVE,
      WORKFLOW_STEP.ACTIVE,
      nowMs - 1000,
      nowMs,
      nowMs,
      history,
    );

    const census = readPlacementCensus(db);
    t.equal(census.length, 1);
    t.equal(census[0].type, OperationType.GROWTH_PROMOTE);
    t.equal(census[0].incomplete, false);
    t.equal(census[0].step, WORKFLOW_STEP.ACTIVE);
    t.same(census[0].promoteReplicaIds, [TEST_LEARNER_1, TEST_LEARNER_2]);

    const cache = new SystemTableCache();
    cache.applySystemTableChange(TABLES.PARTITIONS, CDC_OPERATION.UPSERT, {
      [COLUMN.PARTITION_ID]: TEST_PARTITION_ID,
      [COLUMN.TABLE_NAME]: 'user_orders',
      [COLUMN.REPLICA_COUNT]: 3,
      [COLUMN.STATUS]: 'active',
      [COLUMN.LEADER_NODE_ID]: 'n1',
    });
    // Seed 1 leader voter on n1 and 2 promoted replicas on n2, n3 whose SERVICES
    // cache rows still lag at raft_role='learner'
    for (const [rid, nodeId, role] of [
      ['user_orders-p1-r1', 'n1', RAFT_ROLE.LEADER],
      [TEST_LEARNER_1, 'n2', RAFT_ROLE.LEARNER],
      [TEST_LEARNER_2, 'n3', RAFT_ROLE.LEARNER],
    ]) {
      cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPSERT, {
        [COLUMN.SERVICE_ID]: rid,
        [COLUMN.REPLICA_ID]: rid,
        [COLUMN.PARTITION_ID]: TEST_PARTITION_ID,
        [COLUMN.NODE_ID]: nodeId,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.RAFT_ROLE]: role,
      });
    }

    const admittedStatements = [];
    const ledgerService = Object.assign(new EventEmitter(), {
      partitionId: LEDGER_PARTITION_ID,
      db,
    });
    const makeNodeRow = (nodeId, hostId) => ({
      [COLUMN.NODE_ID]: nodeId,
      [COLUMN.HOST_ID]: hostId,
      [COLUMN.STATUS]: 'active',
      [COLUMN.LAST_HEARTBEAT]: nowMs,
      [COLUMN.LEASE_EXPIRES_AT]: nowMs + 60_000,
    });
    const placementOwner = createReplicaPlacementOwner({
      nodeId: 'n1',
      ledgerPartitionService: ledgerService,
      nodeAuthority: {
        subscribe: () => () => {},
        scheduleRefresh: () => {},
        answerCommittedNodes: () => ({
          state: 'ready',
          epoch: {publicationEpoch: 5},
          nodeRows: [
            makeNodeRow('n1', 'h1'),
            makeNodeRow('n2', 'h2'),
            makeNodeRow('n3', 'h3'),
          ],
          formation: {state: PLACEMENT_FORMATION_STATE.FORMED, latchEpoch: 5},
        }),
      },
      systemTableCache: cache,
      now: () => nowMs,
      logger: {debug: () => {}, info: () => {}, warn: () => {}, error: () => {}},
      admitPlacement: async (payload) => {
        admittedStatements.push(payload);
        return {committed: true, placementAdmission: {outcome: 'ADMITTED', operationIds: ['dup']}};
      },
    });

    try {
      placementOwner.setLeader(true);
      placementOwner.notify(PLACEMENT_TRIGGER.LEDGER_COMMIT);
      await placementOwner.awaitCurrentWorkIdle();

      t.same(
        admittedStatements,
        [],
        'ReplicaPlacementOwner must not admit a duplicate GROWTH_PROMOTE while SERVICES rows lag at learner after durable GROWTH_PROMOTE completion',
      );
      t.same(placementOwner.lastPassSnapshot?.admitted, []);
    } finally {
      placementOwner.shutdown();
      db.close();
    }
  },
);
