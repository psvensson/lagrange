// Witness tests for WP-F (FOUND & RUNTIME_SERVICE production routing through
// PLACEMENT_ADMIT on replica_operations-p1) and WP-C/WP-D partition/workflow
// membership administration wiring.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  PLACEMENT_OUTCOME,
  PLACEMENT_REFUSAL,
  PLACEMENT_TRANSITION_KIND,
} from '../../src/rebalancer/replica-placement-owner-constants.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-operation-progress.js';
import {
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
  UNIFIED_SERVICE_TYPE,
} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  PARTITION_SERVICE_MESSAGE_TYPE,
} from '../../src/partition/partition-service-constants.js';
import {
  PARTITION_WRITE_LEADERSHIP_REFUSAL,
} from '../../src/partition/partition-write-kernel.js';
import {requestPlacementAdmission} from
  '../../src/partition/partition-placement-admission.js';
import {
  admitPartitionRaftLearner,
  evaluatePartitionLearnerCatchUp,
  proposePartitionGrowthPromote,
  proposePartitionReplacePromote,
  readPartitionReplicaMembership,
  removePartitionRaftLearner,
  withdrawPartitionPromotion,
} from '../../src/partition/partition-service-raft-membership-administration.js';
import {
  isReplacePromotionInLog,
} from '../../src/rebalancer/operation-workflow-replace-owner.js';
import {
  RAFT_FOUNDING_GROWTH_OUTCOME,
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {
  addLearnerReplicaToCluster,
  appliedStateOf,
  createFoundingCluster,
  instantiateRaftRsCore,
  leaderOf,
  settleCluster,
} from '../raft/raft-rs-backend/founding-growth-test-support.js';
import {applyCommitted, awaitProposal, track} from
  '../test-helpers/participant-transaction-fixture.js';
import {
  buildRuntimeServiceTargetClaimKey,
} from '../../src/rebalancer/runtime-service-replica-identity.js';
import {
  LEDGER_PARTITION_ID,
  NODE,
  ledgerRows,
  onLedgerLeader,
  stepLedgerRow,
} from './placement-admission-fixture.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';

const SERVICE_ID = 'transaction_coordinator';
const USER_PARTITION_ID = 'orders-p1';
const SCHEMA_JOB_ID = 'schema-job-found-1';

function attachAutoCommitLoop(leader, proposed) {
  let seen = proposed.length;
  let stopped = false;
  const pump = async () => {
    while (!stopped) {
      if (proposed.length > seen) {
        const next = proposed[seen];
        seen += 1;
        applyCommitted(leader, next);
      } else {
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
    }
  };
  const loopPromise = pump();
  return async () => {
    stopped = true;
    await loopPromise;
  };
}

function createCoordinatorWithLedger(leader, options = {}) {
  const servicesRows = options.servicesRows || [];
  const partitionsRows = options.partitionsRows || [];
  const systemTableCache = {
    getAll(tableName) {
      if (tableName === TABLES.SERVICES) return servicesRows;
      if (tableName === TABLES.PARTITIONS) return partitionsRows;
      return [];
    },
  };
  const coordinator = Object.create(RebalanceCoordinator.prototype);
  coordinator.nodeId = NODE.A;
  coordinator.initialized = true;
  coordinator.isShuttingDown = false;
  coordinator.systemTableCache = systemTableCache;
  coordinator.messageRouter = options.messageRouter || null;
  coordinator.logger = leader.logger;
  coordinator.timeSource = leader.timeSource;
  coordinator.nowFn = () => Date.now();
  coordinator.stats = {operationsCreated: 0};
  coordinator.config = {
    maxConcurrentAdds: 10,
    maxConcurrentRemoves: 10,
    reservedRuntimeServicePlacementSlots: 2,
  };
  coordinator.controlPlaneReadinessService = {
    serveEligibilityOwner: {
      answerCommittedNodes: () => ({
        formation: {state: 'FORMED', latchEpoch: 4},
      }),
    },
  };
  coordinator.repository = {
    getInFlightOperations: async () => [],
    getExistingReplicaRows: async () => [],
    queryIncompleteOperations: async () => [],
    isOperationTerminal: () => false,
  };
  coordinator.assertLocalControlPlaneMutationReady = () => {};
  coordinator.enforceCreateAdmissionGates = async () => {};
  coordinator.ensureOperationLedgerSelfMoveSerialized = async () => {};
  coordinator.ensureEntityAddLikeCreateLaneAvailable = async () => {};
  coordinator.ensureNoConflictingInFlightReplaceForRemove = async () => {};
  coordinator.getRetiredReplaceSourceMoveSafetyError = async () => null;
  coordinator.evaluateLocalOperationCreationAdmission = () => ({
    admitted: true,
    state: 'READY',
    nextAction: 'PROCEED',
    reasonCodes: [],
  });
  coordinator.queryExistingInFlightOperation = async () => null;
  coordinator.getCreateOperationSingleFlightKey = (intentKey) => intentKey;
  coordinator.createOperationSingleFlightByKey = new Map();
  coordinator.operationsInCreation = new Map();
  coordinator.pruneExpiredOperationIntents = () => {};
  coordinator.getRecentOperationIntent = async () => null;
  coordinator.rememberOperationIntents = () => {};
  coordinator.validateOperationMove = () => {};
  coordinator.operationWorkflowRunExclusive = (_key, fn) => fn();
  coordinator.runOperationLedgerInterlockAccountedCreate = (_move, fn) => fn();
  coordinator.checkProvisioningAdmission = async () => ({allowed: true});
  coordinator.armCoordinatorCreatedOperationProgress = async () => false;
  coordinator.dispatchCoordinatorCreatedOperationAfterCreateBudgetTurn =
    async () => false;
  coordinator.runReplicaOperationTransitionExclusive = async (fn) => fn();
  coordinator.runOperationCreationImmediateOrQueued =
    async (_context, fn) => fn();
  if (options.registerLocalLeader !== false) {
    coordinator.registerLedgerPartitionService(leader);
  } else {
    coordinator.placementAdmissionEnabled = true;
  }
  return coordinator;
}

describe('WP-F: RUNTIME_SERVICE & FOUND production routing via PLACEMENT_ADMIT', () => {
  it('routes RUNTIME_SERVICE ADD, REPLACE, and REMOVE through PLACEMENT_ADMIT and enforces TARGET_CLAIM_TAKEN', async () => {
    await onLedgerLeader(async (leader, proposed) => {
      const stopAutoCommit = attachAutoCommitLoop(leader, proposed);
      try {
        const coordinator = createCoordinatorWithLedger(leader);

        const addOp = await coordinator.createOperation({
          type: OperationType.ADD,
          entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
          entityId: SERVICE_ID,
          partitionId: SERVICE_ID,
          nodeId: NODE.A,
          replicaId: `${SERVICE_ID}-r1`,
        });
        assert.ok(addOp.operationId.startsWith(`pl-${SERVICE_ID}-`));
        assert.equal(addOp.entityType, UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE);
        assert.equal(addOp.entityId, SERVICE_ID);
        assert.equal(addOp.replicaId, `${SERVICE_ID}-r1`);
        assert.equal(
          addOp.targetClaimKey,
          buildRuntimeServiceTargetClaimKey(`${SERVICE_ID}-r1`, SERVICE_ID),
        );

        await assert.rejects(
          () => coordinator.createOperation({
            type: OperationType.ADD,
            entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
            entityId: SERVICE_ID,
            partitionId: SERVICE_ID,
            nodeId: NODE.B,
            replicaId: `${SERVICE_ID}-r2`,
            operationIntentId: 'busy-intent-r2',
          }),
          (error) => error.failureCode === PLACEMENT_REFUSAL.PARTITION_BUSY,
        );

        stepLedgerRow(leader, addOp.operationId, WORKFLOW_STEP.ACTIVE);

        await assert.rejects(
          () => coordinator.createOperation({
            type: OperationType.ADD,
            entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
            entityId: SERVICE_ID,
            partitionId: SERVICE_ID,
            nodeId: NODE.B,
            replicaId: `${SERVICE_ID}-r1`,
            operationIntentId: 'conflict-intent-r1',
          }),
          (error) => error.failureCode === PLACEMENT_REFUSAL.TARGET_CLAIM_TAKEN,
        );

        const replaceOp = await coordinator.createOperation({
          type: OperationType.REPLACE,
          entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
          entityId: SERVICE_ID,
          partitionId: SERVICE_ID,
          nodeId: NODE.B,
          sourceReplicaId: `${SERVICE_ID}-r1`,
          replicaId: `${SERVICE_ID}-r2`,
        });
        assert.ok(replaceOp.operationId.startsWith(`pl-${SERVICE_ID}-`));
        assert.equal(replaceOp.replicaId, `${SERVICE_ID}-r2`);
        assert.equal(replaceOp.sourceReplicaId, `${SERVICE_ID}-r1`);
        assert.equal(
          replaceOp.targetClaimKey,
          buildRuntimeServiceTargetClaimKey(`${SERVICE_ID}-r2`, SERVICE_ID),
        );

        stepLedgerRow(leader, replaceOp.operationId, WORKFLOW_STEP.REMOVED);

        const removeOp = await coordinator.createOperation({
          type: OperationType.REMOVE,
          entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
          entityId: SERVICE_ID,
          partitionId: SERVICE_ID,
          nodeId: NODE.A,
          replicaId: `${SERVICE_ID}-r1`,
        });
        assert.ok(removeOp.operationId.startsWith(`pl-${SERVICE_ID}-`));
        assert.equal(removeOp.type, OperationType.REMOVE);
        assert.equal(removeOp.targetClaimKey, null);

        const rows = ledgerRows(leader);
        assert.equal(rows.length, 3);
        assert.ok(proposed.every(
          (cmd) => cmd.body?.transitionKind ===
            PLACEMENT_TRANSITION_KIND.RUNTIME_SERVICE,
        ));
      } finally {
        await stopAutoCommit();
      }
    });
  });

  it('routes remote PLACEMENT_ADMIT via messageRouter when local node is not ledger leader', async () => {
    await onLedgerLeader(async (leader, proposed) => {
      const stopAutoCommit = attachAutoCommitLoop(leader, proposed);
      try {
        const routedAddresses = [];
        const messageRouter = {
          async sendToAddress(address, message) {
            routedAddresses.push({address, type: message.type});
            assert.equal(
              message.type,
              PARTITION_SERVICE_MESSAGE_TYPE.PLACEMENT_ADMIT,
            );
            return requestPlacementAdmission(leader, message);
          },
        };
        const coordinator = createCoordinatorWithLedger(leader, {
          registerLocalLeader: false,
          messageRouter,
          servicesRows: [{
            partition_id: LEDGER_PARTITION_ID,
            entity_id: LEDGER_PARTITION_ID,
            node_id: NODE.B,
            replica_id: `${LEDGER_PARTITION_ID}-r1`,
            status: SERVICE_STATUS.ACTIVE,
            raft_role: RAFT_ROLE.LEADER,
            service_address: `node-b.partition.${LEDGER_PARTITION_ID}-r1`,
          }],
        });

        const addOp = await coordinator.createOperation({
          type: OperationType.ADD,
          entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
          entityId: SERVICE_ID,
          partitionId: SERVICE_ID,
          nodeId: NODE.B,
          replicaId: `${SERVICE_ID}-r3`,
        });
        assert.equal(routedAddresses.length, 1);
        assert.equal(
          routedAddresses[0].address,
          `node-b.partition.${LEDGER_PARTITION_ID}-r1`,
        );
        assert.ok(addOp.operationId.startsWith(`pl-${SERVICE_ID}-`));
      } finally {
        await stopAutoCommit();
      }
    });
  });

  it('retains entryId across OUTCOME_UNKNOWN retry for the same placement intent', async () => {
    await onLedgerLeader(async (leader, proposed) => {
      let firstCall = true;
      const messageRouter = {
        async sendToAddress(_address, message) {
          if (firstCall) {
            firstCall = false;
            const pending = track(requestPlacementAdmission(leader, message));
            const command = await awaitProposal(
              proposed,
              (entry) => entry.entryId === message.entryId,
            );
            applyCommitted(leader, command);
            await pending.promise;
            return {
              success: false,
              failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN,
              error: 'Simulated transport timeout after commit',
            };
          }
          return requestPlacementAdmission(leader, message);
        },
      };
      const coordinator = createCoordinatorWithLedger(leader, {
        registerLocalLeader: false,
        messageRouter,
        servicesRows: [{
          partition_id: LEDGER_PARTITION_ID,
          entity_id: LEDGER_PARTITION_ID,
          node_id: NODE.B,
          replica_id: `${LEDGER_PARTITION_ID}-r1`,
          status: SERVICE_STATUS.ACTIVE,
          raft_role: RAFT_ROLE.LEADER,
          service_address: `node-b.partition.${LEDGER_PARTITION_ID}-r1`,
        }],
      });
      const intentKey = 'found:retry-witness:orders-p1';
      const firstResolved =
        coordinator.resolvePlacementAdmissionEntryId(intentKey, null);
      assert.ok(firstResolved.entryId.length > 0);

      const engine = Object.create(SQLQueryEngine.prototype);
      engine.nodeId = NODE.A;
      engine.rebalanceCoordinator = coordinator;

      await assert.rejects(
        () => engine.tryProvisionFoundingSetViaPlacementAdmission({
          partitionId: USER_PARTITION_ID,
          targetNodeIds: [NODE.A, NODE.B, NODE.C],
          context: {schemaJobId: 'retry-witness'},
        }),
      );

      const secondResolved =
        coordinator.resolvePlacementAdmissionEntryId(intentKey, null);
      assert.equal(secondResolved.entryId, firstResolved.entryId);

      const retryOutcome =
        await engine.tryProvisionFoundingSetViaPlacementAdmission({
          partitionId: USER_PARTITION_ID,
          targetNodeIds: [NODE.A, NODE.B, NODE.C],
          context: {schemaJobId: 'retry-witness'},
        });
      assert.equal(retryOutcome.answer.entryId, firstResolved.entryId);
      assert.equal(retryOutcome.result.outcome, PLACEMENT_OUTCOME.ADMITTED);
      assert.equal(retryOutcome.operations.length, 3);
      assert.equal(ledgerRows(leader).length, 3);
    });
  });

  it('provisions initial partition founding set via FOUND PLACEMENT_ADMIT, releases holds, and handles ALREADY_FOUNDED idempotently', async () => {
    await onLedgerLeader(async (leader, proposed) => {
      const stopAutoCommit = attachAutoCommitLoop(leader, proposed);
      try {
        const coordinator = createCoordinatorWithLedger(leader);
        const executedOperationIds = [];
        coordinator.workflowOwner = {
          async executeOperation(operation) {
            executedOperationIds.push(operation.operationId);
          },
        };

        const engine = Object.create(SQLQueryEngine.prototype);
        engine.nodeId = NODE.A;
        engine.rebalanceCoordinator = coordinator;
        engine.logger = leader.logger;
        engine.nowFn = () => Date.now();
        engine.config = {defaultReplicaCount: 3};
        engine.getPartitionReplicaMoveNodes = () => [];
        engine.getRoutablePartitionServiceNodeIds = () => [NODE.A, NODE.B, NODE.C];
        engine.getKnownClusterNodeIds = () => [NODE.A, NODE.B, NODE.C];
        engine.persistPlannedProvisioningCohortIntents = async () => {};
        engine.resolvePartitionAddress = (_partitionId, replicaId, nodeId) =>
          `${nodeId}.partition.${replicaId}`;
        engine.filterProvisioningEligibleTargetNodes = async (nodes) => ({
          eligibleNodeIds: nodes,
          excludedByReason: {},
          contractState: 'READY',
          nextAction: 'PROCEED',
          reasonCodes: [],
          retryAfterMs: 0,
          epoch: 1,
        });
        engine.waitForPlannedProvisioningOperations = async () => {};
        engine.waitForPartitionServiceMetadata = async () => {};
        engine.waitForRoutablePartitionServiceCount = async () => {};
        engine.waitForPartitionLeaderService = async () => {};

        let callIndex = 0;
        engine.getRoutablePartitionServiceNodeIds = () => {
          callIndex += 1;
          return callIndex === 1 ? [] : [NODE.A, NODE.B, NODE.C];
        };

        const summary = await engine.provisionInitialTablePartition({
          tableName: 'orders',
          partitionId: USER_PARTITION_ID,
          replicaCount: 3,
          targetNodeIds: [NODE.A, NODE.B, NODE.C],
          schemaJobId: SCHEMA_JOB_ID,
          timeoutBudget: {
            remainingMs: () => 5000,
            isExpired: () => false,
          },
        });
        assert.equal(summary.resolvedReplicaCount, 3);
        assert.equal(executedOperationIds.length, 3);

        const rows = ledgerRows(leader);
        assert.equal(rows.length, 3);
        for (const row of rows) {
          assert.ok(row.operation_id.startsWith(`pl-${USER_PARTITION_ID}-`));
          const history = JSON.parse(row.steps_history);
          assert.equal(
            history[0].bootstrapTopologyDispatchDeferred,
            undefined,
          );
          assert.equal(history[0].bootstrapMembership.kind, 'genesis');
          assert.equal(history[0].replicaIds.length, 3);
        }

        const replay = await engine.tryProvisionFoundingSetViaPlacementAdmission({
          partitionId: USER_PARTITION_ID,
          targetNodeIds: [NODE.A, NODE.B, NODE.C],
          context: {schemaJobId: SCHEMA_JOB_ID},
        });
        assert.equal(replay.result.outcome, PLACEMENT_OUTCOME.REFUSED);
        assert.equal(replay.result.reason, PLACEMENT_REFUSAL.ALREADY_FOUNDED);
        assert.deepEqual(
          replay.operations.map((op) => op.operationId),
          rows.map((row) => row.operation_id),
        );
        assert.equal(replay.createdOperations.length, 0);
      } finally {
        await stopAutoCommit();
      }
    });
  });

  it('wires partition membership administration and replace workflow promotion-in-log predicates to WP-P port operations', async () => {
    await instantiateRaftRsCore();
    const cluster = createFoundingCluster(['p1-r1'], {partitionId: 'p1'});
    try {
      assert.ok(
        settleCluster(cluster, () =>
          leaderOf(cluster) === 'p1-r1' &&
          appliedStateOf(cluster, 'p1-r1').appliedIndex > 0, ['p1-r1']),
      );
      const leaderPort = cluster.node('p1-r1');
      const service = {
        partitionId: 'p1',
        replicaId: 'p1-r1',
        raft: leaderPort,
        logger: null,
        systemTableCache: null,
        replicaIds: ['p1-r1', 'p1-r2', 'p1-r3'],
      };

      const admitR2 = admitPartitionRaftLearner(service, {
        replicaIdentity: 'p1-r2',
        nodeId: NODE.B,
      });
      assert.equal(
        admitR2.outcome,
        RAFT_MEMBERSHIP_ADMISSION_OUTCOME.PROPOSED,
      );
      await addLearnerReplicaToCluster(cluster, 'p1-r1', 'p1-r2');
      assert.ok(
        settleCluster(cluster, () =>
          appliedStateOf(cluster, 'p1-r2').appliedIndex >=
          appliedStateOf(cluster, 'p1-r1').appliedIndex),
      );

      const membershipWithLearner =
        await readPartitionReplicaMembership(service, 'p1-r2');
      assert.ok(membershipWithLearner.learnerReplicaIds.includes('p1-r2'));
      assert.equal(membershipWithLearner.role, 'LEARNER');

      let catchUpR2 = null;
      assert.ok(
        settleCluster(cluster, () => {
          catchUpR2 = evaluatePartitionLearnerCatchUp(service, {
            operationId: 'op-r2',
            replicaIdentity: 'p1-r2',
          });
          return catchUpR2.result.reason ===
            RAFT_FOUNDING_GROWTH_OUTCOME.CAUGHT_UP;
        }),
      );
      assert.equal(
        catchUpR2.result.outcome,
        RAFT_OPERATION_OUTCOME.CORE_OK,
      );
      assert.equal(
        catchUpR2.result.reason,
        RAFT_FOUNDING_GROWTH_OUTCOME.CAUGHT_UP,
      );

      const withdrawn = withdrawPartitionPromotion(service, {
        operationId: 'op-withdrawn',
        replicaIdentity: 'p1-r2',
      });
      assert.equal(
        withdrawn.result.outcome,
        RAFT_OPERATION_OUTCOME.CORE_OK,
      );
      assert.equal(
        withdrawn.result.reason,
        RAFT_FOUNDING_GROWTH_OUTCOME.WITHDRAWN,
      );

      const evenGrowth = proposePartitionGrowthPromote(service, {
        operationIds: ['op-r2'],
        promotions: [{operationId: 'op-r2', replicaIdentity: 'p1-r2'}],
      });
      assert.equal(
        evenGrowth.result.outcome,
        RAFT_OPERATION_OUTCOME.CORE_REFUSED,
      );

      const badReplace = proposePartitionReplacePromote(service, {
        operationId: 'op-rep',
        targetReplicaIdentity: 'p1-r2',
        sourceReplicaIdentity: 'p1-r1',
        targetVoterCount: 3,
      });
      assert.equal(
        badReplace.result.outcome,
        RAFT_OPERATION_OUTCOME.CORE_REFUSED,
      );

      const removedLearner = removePartitionRaftLearner(service, {
        operationId: 'op-rem-r2',
        replicaIdentity: 'p1-r2',
      });
      assert.equal(
        removedLearner.result.outcome,
        RAFT_OPERATION_OUTCOME.CORE_OK,
      );

      assert.equal(
        isReplacePromotionInLog({
          type: OperationType.REPLACE,
          entityType: SERVICE_TYPE.PARTITION,
          workflowStep: ReplicaStatus.SYNCING,
          stepsHistory: [{step: ReplicaStatus.SYNCING, promotionInLog: true}],
        }),
        true,
      );
      assert.equal(
        isReplacePromotionInLog({
          type: OperationType.REPLACE,
          entityType: SERVICE_TYPE.PARTITION,
          workflowStep: ReplicaStatus.SYNCING,
          stepsHistory: [{step: ReplicaStatus.SYNCING}],
        }),
        false,
      );
    } finally {
      cluster.dispose();
    }
  });
});
