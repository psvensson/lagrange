// Witness tests for WP-F (FOUND, RUNTIME_SERVICE, and ordinary PARTITION
// production routing through PLACEMENT_ADMIT on replica_operations-p1) and
// WP-C/WP-D partition/workflow membership administration wiring.
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {REBALANCE_COORDINATOR_SHARED} from
  '../../src/rebalancer/rebalance-coordinator-shared.js';
import {
  REPLICA_OPERATION_UPDATE_DISPOSITION,
} from '../../src/rebalancer/replica-operation-update-disposition.js';
import {
  ReplicaOperationField,
} from '../../src/rebalancer/replica-operation-constants.js';
import {SQLQueryEngine} from '../../src/query/sql-query-engine.js';
import {
  createPartitionServiceRebalancerMethods,
} from '../../src/partition/partition-service-rebalancer-methods.js';
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
  RAFT_CATCH_UP_REQUEST_KIND,
  RAFT_FOUNDING_GROWTH_OUTCOME,
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME,
  RAFT_MEMBERSHIP_CHANGE_REFUSAL,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {
  addLearnerReplicaToCluster,
  appliedStateOf,
  createFoundingCluster,
  instantiateRaftRsCore,
  leaderOf,
  settleCluster,
  turnChainValue,
} from '../raft/raft-rs-backend/founding-growth-test-support.js';
import {applyCommitted} from
  '../test-helpers/participant-transaction-fixture.js';
import {
  buildRuntimeServiceTargetClaimKey,
} from '../../src/rebalancer/runtime-service-replica-identity.js';
import {
  LEDGER_PARTITION_ID,
  NODE,
  admitOnLeader,
  commitLedgerStatement,
  ledgerRows,
  onLedgerLeader,
  placementStatement,
  stepLedgerRow,
} from './placement-admission-fixture.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';

const {
  OPERATION_METADATA_KEY,
  createOperationRecord,
} = REBALANCE_COORDINATOR_SHARED;

const SERVICE_ID = 'transaction_coordinator';
const USER_PARTITION_ID = 'orders-p1';
const SCHEMA_JOB_ID = 'schema-job-found-1';

function mapLedgerRowToOperation(row) {
  if (!row) return null;
  const stepsHistory = typeof row.steps_history === 'string' ?
    JSON.parse(row.steps_history) : [];
  const first = stepsHistory[0] || {};
  const operation = createOperationRecord({
    operationId: row.operation_id,
    type: row.type,
    partitionId: row.partition_id,
    sourceNodeId: row.source_node_id,
    targetNodeId: row.target_node_id,
    replicaId: row.replica_id,
    sourceReplicaId: row.source_replica_id || null,
    membershipPublicationEpoch: row.membership_publication_epoch ?? null,
  });
  operation.entityType = row.entity_type;
  operation.entityId = row.entity_id;
  operation.targetClaimKey = row.target_claim_key || null;
  operation.workflowStep = row.workflow_step;
  operation.status = row.status;
  operation.stepsHistory = stepsHistory;
  operation.createdAt = row.created_at;
  operation.updatedAt = row.updated_at;
  operation.completedAt = row.completed_at ?? null;
  if (first[OPERATION_METADATA_KEY.REPLICA_IDS]) {
    operation[ReplicaOperationField.REPLICA_IDS] =
      first[OPERATION_METADATA_KEY.REPLICA_IDS];
  }
  if (first[OPERATION_METADATA_KEY.PEER_ADDRESSES]) {
    operation[ReplicaOperationField.PEER_ADDRESSES] =
      first[OPERATION_METADATA_KEY.PEER_ADDRESSES];
  }
  if (first[OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP]) {
    operation[ReplicaOperationField.BOOTSTRAP_MEMBERSHIP] =
      first[OPERATION_METADATA_KEY.BOOTSTRAP_MEMBERSHIP];
  }
  return operation;
}

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

function createAuthoritativeLedgerRepository(leader) {
  let casCounter = 0;
  return {
    getInFlightOperations: async () => [],
    getExistingReplicaRows: async () => [],
    queryIncompleteOperations: async () => [],
    isOperationTerminal: () => false,
    async queryAuthoritativeOperationById(operationId) {
      const row = leader.db
        .prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
        .get(operationId);
      return mapLedgerRowToOperation(row);
    },
    async compareAndSetPendingBootstrapTopologyRelease(
      released,
      expectedStepsHistory,
    ) {
      const current = leader.db
        .prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
        .get(released.operationId);
      const expectedSerialized = JSON.stringify(expectedStepsHistory);
      if (!current ||
          current.workflow_step !== WORKFLOW_STEP.PENDING ||
          current.steps_history !== expectedSerialized) {
        return {
          released: false,
          disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.CONFLICT,
        };
      }
      casCounter += 1;
      commitLedgerStatement(
        leader,
        `cas-hold-release:${released.operationId}:${casCounter}`,
        'UPDATE replica_operations SET steps_history = ?, updated_at = ? ' +
          'WHERE operation_id = ? AND workflow_step = ? AND steps_history = ?',
        [
          JSON.stringify(released.stepsHistory),
          released.updatedAt,
          released.operationId,
          WORKFLOW_STEP.PENDING,
          expectedSerialized,
        ],
      );
      return {
        released: true,
        disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED,
      };
    },
    async persistOperationUpdate(released, options = {}) {
      return this.compareAndSetPendingBootstrapTopologyRelease(
        released,
        options.expectedStepsHistory || [],
      );
    },
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
  coordinator.repository = createAuthoritativeLedgerRepository(leader);
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

describe('WP-F: RUNTIME_SERVICE, PARTITION & FOUND production routing via PLACEMENT_ADMIT', () => {
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

  it('suppresses per-partition UnifiedRebalancer for user partitions and routes user PARTITION moves through PLACEMENT_ADMIT with K_TGT enforcement (Finding 4)', async () => {
    await onLedgerLeader(async (leader, proposed) => {
      const stopAutoCommit = attachAutoCommitLoop(leader, proposed);
      try {
        const coordinator = createCoordinatorWithLedger(leader);

        const rebalancerMethods = createPartitionServiceRebalancerMethods();
        let initializeRebalancerCalled = false;
        const userPartitionService = {
          partitionId: 'orders_user-p1',
          isShutdown: false,
          isLeader: true,
          rebalancer: null,
          rebalanceCoordinator: coordinator,
          systemTableCache: coordinator.systemTableCache,
          isBackgroundWorkReady: () => true,
          ensureReplicaPlacementOwnerAttached:
            rebalancerMethods.ensureReplicaPlacementOwnerAttached,
          driveRebalancerLeadershipSink: () => {},
          buildRebalancerDependencyBundle: () => ({}),
          initializeRebalancer: () => {
            initializeRebalancerCalled = true;
          },
          maybeInitializeRebalancer:
            rebalancerMethods.maybeInitializeRebalancer,
        };
        userPartitionService.maybeInitializeRebalancer();
        assert.equal(initializeRebalancerCalled, false);
        assert.equal(userPartitionService.rebalancer, null);

        const op1 = await coordinator.createOperation({
          type: OperationType.ADD,
          entityType: UNIFIED_SERVICE_TYPE.PARTITION,
          entityId: 'orders_user-p1',
          partitionId: 'orders_user-p1',
          nodeId: NODE.B,
          copySourceNodeId: NODE.A,
        });
        assert.ok(op1.operationId.startsWith('pl-orders_user-p1-'));

        const op2 = await coordinator.createOperation({
          type: OperationType.ADD,
          entityType: UNIFIED_SERVICE_TYPE.PARTITION,
          entityId: 'items_user-p1',
          partitionId: 'items_user-p1',
          nodeId: NODE.B,
          copySourceNodeId: NODE.C,
        });
        assert.ok(op2.operationId.startsWith('pl-items_user-p1-'));

        await assert.rejects(
          () => coordinator.createOperation({
            type: OperationType.ADD,
            entityType: UNIFIED_SERVICE_TYPE.PARTITION,
            entityId: 'payments_user-p1',
            partitionId: 'payments_user-p1',
            nodeId: NODE.B,
            copySourceNodeId: NODE.D,
          }),
          (error) =>
            error.failureCode === PLACEMENT_REFUSAL.TARGET_AT_CAPACITY,
        );

        assert.equal(ledgerRows(leader).length, 2);
        assert.ok(proposed.every(
          (cmd) => cmd.body?.transitionKind ===
            PLACEMENT_TRANSITION_KIND.PLACEMENT,
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

  it('retains {entryId, statement} across OUTCOME_UNKNOWN retry and allocates fresh entryId when retained attempt settled as REFUSED and statement changed (Finding 5)', async () => {
    await onLedgerLeader(async (leader, proposed) => {
      // First: create an in-flight ledger move so FOUND attempt A commits as
      // REFUSED (LEDGER_TRANSITION_UNRESOLVED).
      const ledgerMove = await admitOnLeader(
        leader,
        proposed,
        'seed-ledger-move',
        placementStatement({
          partitionId: LEDGER_PARTITION_ID,
          type: OperationType.ADD,
          target: NODE.D,
          source: NODE.A,
        }),
      );
      const [ledgerMoveOpId] = ledgerMove.answer.placementResult.operationIds;

      const stopAutoCommit = attachAutoCommitLoop(leader, proposed);
      try {
        let firstCall = true;
        const sentEntries = [];
        const messageRouter = {
          async sendToAddress(_address, message) {
            sentEntries.push({
              entryId: message.entryId,
              targets: message.body.moves.map((m) => m.targetNodeId),
            });
            const answer = await requestPlacementAdmission(leader, message);
            if (firstCall) {
              firstCall = false;
              return {
                success: false,
                failureCode:
                  PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN,
                error: 'Simulated transport timeout after commit of REFUSED attempt A',
              };
            }
            return answer;
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

        const engine = Object.create(SQLQueryEngine.prototype);
        engine.nodeId = NODE.A;
        engine.rebalanceCoordinator = coordinator;

        // Attempt A with [NODE.A, NODE.B, NODE.C] commits as REFUSED while its
        // response returns OUTCOME_UNKNOWN.
        await assert.rejects(
          () => engine.tryProvisionFoundingSetViaPlacementAdmission({
            partitionId: USER_PARTITION_ID,
            targetNodeIds: [NODE.A, NODE.B, NODE.C],
            context: {schemaJobId: 'retry-witness'},
          }),
        );
        assert.equal(sentEntries.length, 1);
        const attemptAEntryId = sentEntries[0].entryId;

        // Complete the blocking ledger move so a fresh attempt can succeed.
        stepLedgerRow(leader, ledgerMoveOpId, WORKFLOW_STEP.ACTIVE);

        // Retry with updated target set [NODE.A, NODE.B, NODE.D]: must first
        // resolve attempt A using body_A (avoiding PLACEMENT_ADMISSION_ERROR.BYTES),
        // observe that attempt A settled as REFUSED, allocate a fresh entryId,
        // and commit body_B as ADMITTED!
        const retryOutcome =
          await engine.tryProvisionFoundingSetViaPlacementAdmission({
            partitionId: USER_PARTITION_ID,
            targetNodeIds: [NODE.A, NODE.B, NODE.D],
            context: {schemaJobId: 'retry-witness'},
          });
        assert.equal(sentEntries.length, 3);
        assert.equal(sentEntries[1].entryId, attemptAEntryId);
        assert.deepEqual(sentEntries[1].targets, [NODE.A, NODE.B, NODE.C]);
        assert.notEqual(sentEntries[2].entryId, attemptAEntryId);
        assert.deepEqual(sentEntries[2].targets, [NODE.A, NODE.B, NODE.D]);
        assert.equal(retryOutcome.answer.entryId, sentEntries[2].entryId);
        assert.equal(retryOutcome.result.outcome, PLACEMENT_OUTCOME.ADMITTED);
        assert.equal(retryOutcome.operations.length, 3);
      } finally {
        await stopAutoCommit();
      }
    });
  });

  it('provisions initial partition founding set via FOUND PLACEMENT_ADMIT, refuses hold release without authoritative read (Finding 1), and handles ALREADY_FOUNDED idempotently', async () => {
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

        // Finding 1 witness: admit a second partition's founding set, then
        // simulate an authoritative read failure while a follower SQLite DB has
        // the held row. releaseBootstrapTopologyDispatchHold must refuse
        // (released: false, reason: 'operation_not_found') and must NOT mutate
        // the local SQLite row.
        const secondFounded =
          await engine.tryProvisionFoundingSetViaPlacementAdmission({
            partitionId: 'invoices-p1',
            targetNodeIds: [NODE.A, NODE.B, NODE.C],
            context: {schemaJobId: 'schema-job-found-2'},
          });
        const [heldOpId] = secondFounded.result.operationIds;
        const beforeHoldRow = leader.db
          .prepare('SELECT steps_history FROM replica_operations WHERE operation_id = ?')
          .get(heldOpId);
        assert.equal(
          JSON.parse(beforeHoldRow.steps_history)[0]
            .bootstrapTopologyDispatchDeferred,
          true,
        );

        const realQuery =
          coordinator.repository.queryAuthoritativeOperationById;
        coordinator.repository.queryAuthoritativeOperationById =
          async () => null;
        const failedRelease =
          await coordinator.releaseBootstrapTopologyDispatchHold(heldOpId, {
            replicaIds: ['r1', 'r2', 'r3'],
          });
        assert.equal(failedRelease.released, false);
        assert.equal(failedRelease.reason, 'operation_not_found');
        assert.equal(failedRelease.operation, null);
        const afterFailedReleaseRow = leader.db
          .prepare('SELECT steps_history FROM replica_operations WHERE operation_id = ?')
          .get(heldOpId);
        assert.equal(
          afterFailedReleaseRow.steps_history,
          beforeHoldRow.steps_history,
        );

        // Restore authoritative repository path: first CAS release succeeds
        // through committed Raft entry; second CAS release returns released: false.
        coordinator.repository.queryAuthoritativeOperationById = realQuery;
        const firstCas =
          await coordinator.releaseBootstrapTopologyDispatchHold(heldOpId, {
            replicaIds: ['inv-r1', 'inv-r2', 'inv-r3'],
          });
        assert.equal(firstCas.released, true);
        const secondCas =
          await coordinator.releaseBootstrapTopologyDispatchHold(heldOpId, {
            replicaIds: ['inv-r1', 'inv-r2', 'inv-r3'],
          });
        assert.equal(secondCas.released, false);

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

  it('wires partition membership administration, positive 2-learner odd-growth promotion, tenure-lost withdrawal refusal/roll-forward (Finding 6), and replace promotion-in-log predicates', async () => {
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
            requestKind: RAFT_CATCH_UP_REQUEST_KIND.GROWTH_PROMOTE,
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

      // Finding 6(a): operationId-only withdrawal for an unknown operation
      // (after tenure reset / no tenure subjects) refuses TARGET_IDENTITY_REQUIRED.
      const missingTargetWithdrawal = withdrawPartitionPromotion(service, {
        operationId: 'op-unknown-after-tenure-loss',
      });
      assert.equal(
        missingTargetWithdrawal.result.outcome,
        RAFT_OPERATION_OUTCOME.CORE_REFUSED,
      );
      assert.equal(
        missingTargetWithdrawal.result.reason,
        RAFT_MEMBERSHIP_CHANGE_REFUSAL.TARGET_IDENTITY_REQUIRED,
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

      // Finding 6: assert exact refusal reason PROMOTION_WOULD_BE_EVEN on
      // 1-learner growth from 1 voter.
      const evenGrowth = proposePartitionGrowthPromote(service, {
        operationIds: ['op-r2'],
        promotions: [{operationId: 'op-r2', replicaIdentity: 'p1-r2'}],
      });
      assert.equal(
        evenGrowth.result.outcome,
        RAFT_OPERATION_OUTCOME.CORE_REFUSED,
      );
      assert.equal(
        evenGrowth.result.reason,
        RAFT_MEMBERSHIP_CHANGE_REFUSAL.PROMOTION_WOULD_BE_EVEN,
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

      // Finding 6: positive 2-learner odd-growth promotion through
      // admitPartitionRaftLearner -> evaluatePartitionLearnerCatchUp ->
      // proposePartitionGrowthPromote.
      const admitR3 = admitPartitionRaftLearner(service, {
        replicaIdentity: 'p1-r3',
        nodeId: NODE.C,
      });
      assert.equal(
        admitR3.outcome,
        RAFT_MEMBERSHIP_ADMISSION_OUTCOME.PROPOSED,
      );
      await addLearnerReplicaToCluster(cluster, 'p1-r1', 'p1-r3');
      assert.ok(
        settleCluster(cluster, () =>
          appliedStateOf(cluster, 'p1-r3').appliedIndex >=
          appliedStateOf(cluster, 'p1-r1').appliedIndex),
      );
      assert.ok(
        settleCluster(cluster, () => {
          const c2 = evaluatePartitionLearnerCatchUp(service, {
            operationId: 'op-grow-1-to-3',
            replicaIdentity: 'p1-r2',
            requestKind: RAFT_CATCH_UP_REQUEST_KIND.GROWTH_PROMOTE,
          });
          const c3 = evaluatePartitionLearnerCatchUp(service, {
            operationId: 'op-grow-1-to-3',
            replicaIdentity: 'p1-r3',
            requestKind: RAFT_CATCH_UP_REQUEST_KIND.GROWTH_PROMOTE,
          });
          return c2.result.reason === RAFT_FOUNDING_GROWTH_OUTCOME.CAUGHT_UP &&
            c3.result.reason === RAFT_FOUNDING_GROWTH_OUTCOME.CAUGHT_UP;
        }),
      );
      const oddGrowth = turnChainValue(
        proposePartitionGrowthPromote(service, {
          operationIds: ['op-grow-1-to-3', 'op-grow-1-to-3-b'],
          promotions: [
            {operationId: 'op-grow-1-to-3', replicaIdentity: 'p1-r2'},
            {operationId: 'op-grow-1-to-3-b', replicaIdentity: 'p1-r3'},
          ],
        }),
      );
      assert.equal(oddGrowth.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
      assert.equal(
        oddGrowth.reason,
        RAFT_FOUNDING_GROWTH_OUTCOME.PROMOTION_PROPOSED,
      );
      assert.ok(
        settleCluster(cluster, () =>
          appliedStateOf(cluster, 'p1-r1').voters.length === 3 &&
          appliedStateOf(cluster, 'p1-r1').votersOutgoing.length === 0),
      );

      // Finding 6(b): after p1-r2 and p1-r3 are voters, calling
      // withdrawPartitionPromotion for a brand-new operationId (no tenure
      // history for that operationId) with explicit target identity returns
      // PROMOTION_IN_LOG, never WITHDRAWN.
      const postCommitWithdraw = withdrawPartitionPromotion(service, {
        operationId: 'op-tenure-lost-after-commit',
        replicaIdentity: 'p1-r2',
      });
      assert.equal(
        postCommitWithdraw.result.outcome,
        RAFT_OPERATION_OUTCOME.CORE_OK,
      );
      assert.equal(
        postCommitWithdraw.result.reason,
        RAFT_FOUNDING_GROWTH_OUTCOME.PROMOTION_IN_LOG,
      );

      // Removing a voter via removePartitionRaftLearner is refused NOT_LEARNER.
      const removeVoterAsLearner = removePartitionRaftLearner(service, {
        operationId: 'op-rem-r2',
        replicaIdentity: 'p1-r2',
      });
      assert.equal(
        removeVoterAsLearner.result.outcome,
        RAFT_OPERATION_OUTCOME.CORE_REFUSED,
      );
      assert.equal(
        removeVoterAsLearner.result.reason,
        RAFT_MEMBERSHIP_CHANGE_REFUSAL.NOT_LEARNER,
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
