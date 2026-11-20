import {test} from '../../src/test-helpers/tap.js';
import {
  CDC_OPERATION,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  GROWTH_SETTLEMENT_PHASE,
  OPERATION_RECONCILE_OUTCOME,
  didOperationReconcileAdvanceOrComplete,
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
  ReplicaOperationField,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  createOperation,
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {createTestCoordinator} from './test-helpers.js';

const TEST_PARTITION_ID = 'user_orders-p1';
const TEST_LEADER_NODE_1 = 'node-leader-1';
const TEST_LEADER_NODE_2 = 'node-leader-2';
const TEST_LEARNER_1 = 'user_orders-p1-r2';
const TEST_LEARNER_2 = 'user_orders-p1-r3';
const TEST_LEADER_REPLICA_2 = 'user_orders-p1-r1-n2';

function buildGrowthPromoteOperation(overrides = {}) {
  const operation = createOperation({
    operationId: overrides.operationId || 'op-growth-promote-1',
    type: OperationType.GROWTH_PROMOTE,
    partitionId: overrides.partitionId || TEST_PARTITION_ID,
    replicaId: overrides.replicaId || TEST_LEARNER_1,
    sourceNodeId: overrides.sourceNodeId || TEST_LEADER_NODE_1,
    targetNodeId: overrides.targetNodeId ?? TEST_LEADER_NODE_1,
    sourceReplicaId: overrides.sourceReplicaId || TEST_LEARNER_2,
  });
  operation.sourceReplicaId = overrides.sourceReplicaId || TEST_LEARNER_2;
  operation[ReplicaOperationField.PROMOTE_REPLICA_IDS] =
    overrides.promoteReplicaIds || [TEST_LEARNER_1, TEST_LEARNER_2];
  operation.status = overrides.status || ReplicaStatus.SYNCING;
  operation.workflowStep = overrides.workflowStep || WORKFLOW_STEP.SYNCING;
  const stepEnteredAt = overrides.stepEnteredAt ?? operation.createdAt;
  operation.createdAt = stepEnteredAt;
  operation.updatedAt = stepEnteredAt;
  operation.stepsHistory = [
    {
      step: operation.workflowStep,
      timestamp: stepEnteredAt,
      [ReplicaOperationField.PROMOTE_REPLICA_IDS]:
        operation[ReplicaOperationField.PROMOTE_REPLICA_IDS],
    },
  ];
  return Object.assign(operation, overrides);
}

test(
  'D4 & Counterexample 2a: GROWTH_PROMOTE completion requires authoritative ' +
    'non-joint committed membership with matching partition and promoted ' +
    'replica provenance, never projected SERVICES.raft_role',
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
        node_id: 'node-2',
        status: ReplicaStatus.ACTIVE,
        raft_role: RAFT_ROLE.FOLLOWER,
      },
    );
    cache.applySystemTableChange(
      SYSTEM_TABLE_NAME.SERVICES,
      CDC_OPERATION.UPSERT,
      {
        service_id: TEST_LEARNER_2,
        replica_id: TEST_LEARNER_2,
        service_type: 'partition',
        partition_id: TEST_PARTITION_ID,
        node_id: 'node-3',
        status: ReplicaStatus.ACTIVE,
        raft_role: RAFT_ROLE.FOLLOWER,
      },
    );

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
        if (
          nextPersistDisposition !==
          REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED
        ) {
          return Object.freeze({
            committed: false,
            disposition: nextPersistDisposition,
          });
        }
        completedCount += 1;
        op.workflowStep = WORKFLOW_STEP.ACTIVE;
        op.status = ReplicaStatus.ACTIVE;
        op.completedAt = Date.now();
        return Object.freeze({
          committed: true,
          disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED,
        });
      };
      owner.updateStep = async (op, nextStep) => {
        op.workflowStep = nextStep;
        return true;
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
        owner,
        operation,
        {
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
        owner,
        operation,
        {
          committedVotersReached: true,
          partitionId: TEST_PARTITION_ID,
          promotedReplicaIds: [TEST_LEARNER_1],
        },
      );
      t.equal(partialReplicaResult.status, 'in_progress');
      t.equal(completedCount, 0);

      // CORE_OK without committedVotersReached === true must defer to SYNCING
      const unconfirmedProposalResult =
        await reconcileGrowthPromoteDispatchResponse(owner, operation, {
          [ReplicaOperationField.PROPOSAL]: {
            outcome: 'CORE_OK',
            promotedReplicaIds: [TEST_LEARNER_1, TEST_LEARNER_2],
          },
          committedVotersReached: false,
        });
      t.equal(unconfirmedProposalResult.status, 'in_progress');
      t.equal(completedCount, 0);

      // Authoritative committedVotersReached === true with valid provenance completes
      nextPersistDisposition = REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED;
      const validResult = await reconcileGrowthPromoteDispatchResponse(
        owner,
        operation,
        {
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
    const coordinator = createTestCoordinator({
      nodeId: TEST_LEADER_NODE_1,
    });
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

      // 1. Deferred terminal persistence: dispatch response reports skipped/WAITING
      // and reconcileOperationLifecycle returns WAITING (never COMPLETED)
      owner.completeOperation = async () =>
        Object.freeze({
          committed: false,
          disposition: 'deferred',
        });
      owner.executeOperationFromReconcilePath = async (targetOp) =>
        reconcileGrowthPromoteDispatchResponse(
          owner,
          targetOp,
          validCommittedResponse,
        );

      const deferredDispatchResult =
        await reconcileGrowthPromoteDispatchResponse(
          owner,
          op,
          validCommittedResponse,
        );
      t.equal(deferredDispatchResult.skipped, true);
      t.equal(
        deferredDispatchResult.settlementPhase,
        GROWTH_SETTLEMENT_PHASE.PERSISTING,
      );
      t.equal(
        deferredDispatchResult.reconcileOutcome,
        OPERATION_RECONCILE_OUTCOME.WAITING,
      );
      t.equal(
        await owner.reconcileOperationLifecycle(op),
        OPERATION_RECONCILE_OUTCOME.WAITING,
      );
      t.equal(op.completedAt, null);

      // 2. Refused terminal persistence: reconcileOperationLifecycle returns REFUSED
      owner.completeOperation = async () =>
        Object.freeze({
          committed: false,
          disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED,
        });
      const refusedSettlement = await settleGrowthPromoteCompletion(owner, op);
      t.equal(refusedSettlement.phase, GROWTH_SETTLEMENT_PHASE.PERSISTING);
      t.equal(
        refusedSettlement.reconcileOutcome,
        OPERATION_RECONCILE_OUTCOME.REFUSED,
      );
      t.equal(
        await owner.reconcileOperationLifecycle(op),
        OPERATION_RECONCILE_OUTCOME.REFUSED,
      );

      // 3. Subsequent retry where completeOperation commits transitions to COMPLETED
      owner.completeOperation = async (targetOp) => {
        targetOp.workflowStep = WORKFLOW_STEP.ACTIVE;
        targetOp.status = ReplicaStatus.ACTIVE;
        targetOp.completedAt = Date.now();
        return Object.freeze({
          committed: true,
          disposition: 'committed',
        });
      };
      t.equal(
        await owner.reconcileOperationLifecycle(op),
        OPERATION_RECONCILE_OUTCOME.COMPLETED,
      );
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
    cache.applySystemTableChange(
      SYSTEM_TABLE_NAME.SERVICES,
      CDC_OPERATION.UPSERT,
      {
        service_id: TEST_LEADER_REPLICA_2,
        replica_id: TEST_LEADER_REPLICA_2,
        service_type: 'partition',
        partition_id: TEST_PARTITION_ID,
        node_id: TEST_LEADER_NODE_2,
        status: ReplicaStatus.ACTIVE,
        raft_role: RAFT_ROLE.LEADER,
      },
    );
    const coordinator = createTestCoordinator({
      nodeId: TEST_LEADER_NODE_1,
      systemTableCache: cache,
    });
    const owner = coordinator.workflowOwner;

    try {
      const growthOp = buildGrowthPromoteOperation({
        targetNodeId: '',
      });
      const initialRoute = resolveGrowthPromoteTargetNodeId(owner, growthOp);
      t.equal(initialRoute, TEST_LEADER_NODE_2);
      t.equal(growthOp.administrationRouteNodeId, TEST_LEADER_NODE_2);
      t.equal(growthOp.targetNodeId, TEST_LEADER_NODE_2);

      // Redirect from node-leader-1 to node-leader-2 on not_leader
      growthOp.targetNodeId = TEST_LEADER_NODE_1;
      growthOp.administrationRouteNodeId = TEST_LEADER_NODE_1;
      const redirected = redirectGrowthPromoteTargetNode(owner, growthOp, {
        [ReplicaOperationField.PROPOSAL]: {
          outcome: 'CORE_REFUSED',
          reason: 'not_leader',
          retryable: true,
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
        TEST_LEARNER_1,
        TEST_LEARNER_2,
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
      t.equal(
        resolveGrowthPromoteTargetNodeId(owner, addOp),
        'node-physical-placement-target',
      );
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
    const coordinator = createTestCoordinator({
      nodeId: TEST_LEADER_NODE_1,
    });
    const owner = coordinator.workflowOwner;

    try {
      t.equal(
        didOperationReconcileAdvanceOrComplete(
          OPERATION_RECONCILE_OUTCOME.COMPLETED,
        ),
        true,
      );
      t.equal(
        didOperationReconcileAdvanceOrComplete(
          OPERATION_RECONCILE_OUTCOME.ADVANCED,
        ),
        true,
      );
      t.equal(didOperationReconcileAdvanceOrComplete(true), true);
      t.equal(
        didOperationReconcileAdvanceOrComplete(
          OPERATION_RECONCILE_OUTCOME.WAITING,
        ),
        false,
      );
      t.equal(
        didOperationReconcileAdvanceOrComplete(
          OPERATION_RECONCILE_OUTCOME.HELD,
        ),
        false,
      );
      t.equal(
        didOperationReconcileAdvanceOrComplete(
          OPERATION_RECONCILE_OUTCOME.REFUSED,
        ),
        false,
      );
      t.equal(didOperationReconcileAdvanceOrComplete(false), false);
      t.equal(didOperationReconcileAdvanceOrComplete(null), false);

      // 1. HELD operation returns HELD
      const heldOp = buildGrowthPromoteOperation({
        status: ReplicaStatus.HELD,
        workflowStep: WORKFLOW_STEP.PENDING,
      });
      t.equal(
        await reconcileGrowthPromoteLifecycle(owner, heldOp),
        OPERATION_RECONCILE_OUTCOME.HELD,
      );

      // 2. Already terminal operation before reconcile returns WAITING
      const terminalOp = buildGrowthPromoteOperation({
        status: ReplicaStatus.ACTIVE,
        workflowStep: WORKFLOW_STEP.ACTIVE,
        completedAt: Date.now(),
      });
      t.equal(
        await reconcileGrowthPromoteLifecycle(owner, terminalOp),
        OPERATION_RECONCILE_OUTCOME.WAITING,
      );

      // 3. In-place SYNCING retry (no step change, not terminal) returns WAITING
      const syncingOp = buildGrowthPromoteOperation({
        status: ReplicaStatus.SYNCING,
        workflowStep: WORKFLOW_STEP.SYNCING,
      });
      owner.executeOperationFromReconcilePath = async () => ({
        success: true,
        status: ReplicaOperationResponseStatus.IN_PROGRESS,
      });
      t.equal(
        await reconcileGrowthPromoteLifecycle(owner, syncingOp),
        OPERATION_RECONCILE_OUTCOME.WAITING,
      );

      // 4. Step transition (PENDING -> SYNCING) returns ADVANCED
      const pendingOp = buildGrowthPromoteOperation({
        status: ReplicaStatus.PENDING,
        workflowStep: WORKFLOW_STEP.PENDING,
      });
      owner.executeOperationFromReconcilePath = async (op) => {
        op.workflowStep = WORKFLOW_STEP.SYNCING;
        op.status = ReplicaStatus.SYNCING;
        return {
          success: true,
          status: ReplicaOperationResponseStatus.IN_PROGRESS,
        };
      };
      t.equal(
        await reconcileGrowthPromoteLifecycle(owner, pendingOp),
        OPERATION_RECONCILE_OUTCOME.ADVANCED,
      );

      // 5. Completion returns COMPLETED
      const completingOp = buildGrowthPromoteOperation({
        status: ReplicaStatus.SYNCING,
        workflowStep: WORKFLOW_STEP.SYNCING,
      });
      owner.executeOperationFromReconcilePath = async (op) => {
        op.workflowStep = WORKFLOW_STEP.ACTIVE;
        op.status = ReplicaStatus.ACTIVE;
        op.completedAt = Date.now();
        return {
          success: true,
          status: ReplicaOperationResponseStatus.COMPLETED,
        };
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
      // returns WAITING (reconcileOperationProgress returns false) and reconcileTimeoutOperation
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
        await owner.reconcileOperationProgress(removeOp, {
          cause: 'timeout',
        }),
        false,
        'reconcileOperationProgress must return false when dispatch is skipped',
      );

      const failedOperations = [];
      owner.failOperation = async (op, reason) => {
        failedOperations.push({operationId: op.operationId, reason});
        op.workflowStep = WORKFLOW_STEP.FAILED;
        op.status = ReplicaStatus.FAILED;
        op.completedAt = now;
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
