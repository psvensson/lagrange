/**
 * Test support helpers for Item 2 (GROWTH_PROMOTE production workflow and
 * normal learner-first admission) and Correction B (ControlPlaneSetup.create
 * placement attachment) witnesses in replica-placement-owner-core.test.js.
 */

import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {
  ControlPlaneSetup,
} from '../../src/bootstrap/shared/control-plane-setup.js';
import {readinessServiceFake} from '../helpers/readiness-service-fixture.js';
import {COLUMN} from '../../src/constants/columns.js';
import {
  CDC_OPERATION,
  SERVICE_STATUS,
  TABLES,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {
  assignReplicaHandlerMembershipMethods,
} from '../../src/node/replica-handler-membership-methods.js';
import {
  assignReplicaHandlerVoterReadinessMethods,
} from '../../src/node/replica-handler-voter-readiness-methods.js';
import {
  LEDGER_PARTITION_ID, readPlacementCensus,
} from '../../src/partition/partition-placement-admission-decision.js';
import {
  readCommittedConfChangeState,
  shouldAdmitAsLearner,
} from '../../src/partition/partition-replica-admission.js';
import {
  relayPartitionConsensusObservations,
} from '../../src/partition/partition-service-raft-lifecycle-wiring.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  RAFT_EVENT,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {deriveRaftRsPeerId} from '../../src/raft/raft-rs-peer-identity.js';
import {
  RebalanceCoordinator,
} from '../../src/rebalancer/rebalance-coordinator.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  OperationType,
  ReplicaStatus,
  getWorkflowSteps,
  isTerminalReplicaOperationRecord,
} from '../../src/rebalancer/replica-operation-progress.js';
import {
  getWorkflowStepSpec,
} from '../../src/rebalancer/replica-operation-step-policy.js';
import {
  PLACEMENT_FORMATION_STATE,
  PLACEMENT_TRIGGER,
} from '../../src/rebalancer/replica-placement-owner-constants.js';
import {
  buildDeliveryEnvelope,
} from '../../src/transport/transport-semantic-outcome.js';
import {
  ledgerRows,
  onLedgerLeader,
} from '../partition/placement-admission-fixture.js';
import {
  applyCommitted,
} from '../test-helpers/participant-transaction-fixture.js';

function createLeaderDatabaseReadBoundary(sqlQueryEngine) {
  return {
    sqlQueryEngine,
    executeAuthoritativeSystemTableRead: (_tableName, sql, params) =>
      sqlQueryEngine.execute(sql, params),
    registerTableChangeCallback: () => {},
    unregisterTableChangeCallback: () => {},
  };
}

function hasIncompletePlacementOperation(db, operationId) {
  return readPlacementCensus(db).some((row) =>
    row.operationId === operationId && row.incomplete);
}

const NOW_MS = 1_000_000;

export async function runGrowthPromoteProductionWitness({
  createSimpleSystemCache,
  nodeRow,
  seededPartitionRow,
}) {
  assert.deepEqual(getWorkflowSteps(OperationType.GROWTH_PROMOTE), [
    WORKFLOW_STEP.PENDING,
    WORKFLOW_STEP.SENDING,
    WORKFLOW_STEP.CREATING,
    WORKFLOW_STEP.SYNCING,
    WORKFLOW_STEP.ACTIVE,
  ]);
  assert.equal(
    getWorkflowStepSpec(WORKFLOW_STEP.ACTIVE)?.operationTypes?.has(
      OperationType.GROWTH_PROMOTE,
    ),
    true,
  );
  assert.equal(
    isTerminalReplicaOperationRecord({
      type: OperationType.GROWTH_PROMOTE,
      workflowStep: WORKFLOW_STEP.ACTIVE,
      status: ReplicaStatus.ACTIVE,
    }),
    true,
  );
  assert.equal(
    isTerminalReplicaOperationRecord({
      type: OperationType.GROWTH_PROMOTE,
      workflowStep: WORKFLOW_STEP.SYNCING,
      status: ReplicaStatus.SYNCING,
    }),
    false,
  );

  const threeNodes = [nodeRow('n1', 'h1'), nodeRow('n2', 'h2'), nodeRow('n3', 'h3')];
  const nodeAuthority = {
    subscribe: () => () => {},
    scheduleRefresh: () => {},
    answerCommittedNodes: () => ({
      state: 'ready',
      epoch: {publicationEpoch: 10},
      nodeRows: threeNodes,
      formation: {state: PLACEMENT_FORMATION_STATE.FORMED, latchEpoch: 10},
    }),
  };

  const servicesRows = [
    {
      [COLUMN.REPLICA_ID]: `${LEDGER_PARTITION_ID}-r1`,
      [COLUMN.SERVICE_ID]: `${LEDGER_PARTITION_ID}-r1`,
      [COLUMN.PARTITION_ID]: LEDGER_PARTITION_ID,
      [COLUMN.NODE_ID]: 'n1',
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
    },
  ];
  const cache = createSimpleSystemCache(
    [seededPartitionRow(LEDGER_PARTITION_ID, 'n1')],
    servicesRows,
  );
  cache.get = (tableName, id) => {
    if (tableName === TABLES.PARTITIONS) {
      return cache.getAll(TABLES.PARTITIONS).find(
        (r) => r[COLUMN.PARTITION_ID] === id,
      ) || null;
    }
    if (tableName === TABLES.SERVICES) {
      return servicesRows.find(
        (r) => r[COLUMN.REPLICA_ID] === id || r[COLUMN.SERVICE_ID] === id,
      ) || null;
    }
    if (tableName === TABLES.REPLICA_OPERATIONS) {
      return cache.getAll(TABLES.REPLICA_OPERATIONS).find(
        (r) => r.operation_id === id,
      ) || null;
    }
    return null;
  };
  const baseGetAll = cache.getAll.bind(cache);
  cache.getAll = (tableName) =>
    tableName === TABLES.SERVICES ? [...servicesRows] : baseGetAll(tableName);
  cache.filter = (tableName, pred) => cache.getAll(tableName).filter(pred);
  const baseApply = cache.applySystemTableChange.bind(cache);
  cache.applySystemTableChange = (tableName, op, row) => {
    if (tableName === TABLES.SERVICES && row) {
      const rid = row[COLUMN.REPLICA_ID] || row[COLUMN.SERVICE_ID];
      const idx = servicesRows.findIndex(
        (r) => (r[COLUMN.REPLICA_ID] || r[COLUMN.SERVICE_ID]) === rid,
      );
      if (op === CDC_OPERATION.DELETE) {
        if (idx >= 0) servicesRows.splice(idx, 1);
      } else if (idx >= 0) {
        servicesRows[idx] = {...servicesRows[idx], ...row};
      } else {
        servicesRows.push({...row});
      }
    }
    return baseApply(tableName, op, row);
  };

  await onLedgerLeader(async (leaderService) => {
    leaderService.controllablePort.setProposeHandler(async (entry) => {
      assert.equal(applyCommitted(leaderService, entry), null);
    });
    const syncCacheFromDb = () => {
      for (const row of ledgerRows(leaderService)) {
        cache.applySystemTableChange(
          TABLES.REPLICA_OPERATIONS,
          CDC_OPERATION.UPDATE,
          row,
        );
      }
    };

    let interruptFirstPromote = true;
    let disableGrowthPromoteDispatch = false;

    class GrowthPromoteHandler {
      constructor() {
        this.nodeId = 'n1';
        this.rebalanceCoordinator = {placementAdmissionEnabled: true};
        this.systemTableCache = cache;
        this.localServices = new Map([
          [leaderService.replicaId, leaderService],
        ]);
      }
      getTrackedService(id) {
        return this.localServices.get(id) || null;
      }
      buildReplicaOperationResponse(status, extra = {}) {
        return {status, ...extra};
      }
    }
    assignReplicaHandlerMembershipMethods(GrowthPromoteHandler);
    assignReplicaHandlerVoterReadinessMethods(GrowthPromoteHandler);
    const replicaHandler = new GrowthPromoteHandler();

    const messageRouter = {
      deliver: async (_target, payload) => {
        if (
          payload?.[ReplicaOperationField.TYPE] ===
          ReplicaOperationMessageType.PROPOSE_GROWTH_PROMOTE
        ) {
          if (disableGrowthPromoteDispatch) {
            return buildDeliveryEnvelope(
              {acknowledged: true},
              {status: ReplicaOperationResponseStatus.COMPLETED},
            );
          }
          if (interruptFirstPromote) {
            interruptFirstPromote = false;
            return buildDeliveryEnvelope(
              {acknowledged: true},
              {
                status: ReplicaOperationResponseStatus.INITIATED,
                [ReplicaOperationField.PROPOSAL]: {
                  outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
                  reason: 'conf_change_pending',
                  retryable: true,
                  operationId: payload[ReplicaOperationField.OPERATION_ID],
                },
                committedVotersReached: false,
              },
            );
          }
          const resp = await replicaHandler.handleProposeGrowthPromote(payload);
          return buildDeliveryEnvelope({acknowledged: true}, resp);
        }
        return buildDeliveryEnvelope(
          {acknowledged: true},
          {status: ReplicaOperationResponseStatus.INITIATED},
        );
      },
      registerHandler: () => {},
      unregisterHandler: () => {},
    };

    const sqlQueryEngine = {
      execute: async (sql, params = []) => {
        const stmt = leaderService.db.prepare(sql);
        if (/^\s*SELECT/iu.test(sql)) {
          return {
            success: true,
            rows: stmt.all(...params),
            rowSetComplete: true,
          };
        }
        const info = stmt.run(...params);
        syncCacheFromDb();
        return {
          success: true,
          rows: [],
          changes: info.changes,
          rowsAffected: info.changes,
        };
      },
      executeQuery: async (sql, params = []) =>
        sqlQueryEngine.execute(sql, params),
    };
    const createTestCoordinator = () => {
      const instance = new RebalanceCoordinator({
        nodeId: 'n1',
        systemTableCache: cache,
        messageRouter,
        controlPlaneReadinessService: readinessServiceFake({
          serveEligibilityOwner: nodeAuthority,
          getNodeReadinessSync: () => ({ready: true}),
          getPriorityRecoveryPlanningSnapshotSync: () => null,
        }),
        cdcIntegrationService: createLeaderDatabaseReadBoundary(sqlQueryEngine),
        tablePolicyService: {getReplicationFactor: () => 3},
        sqlQueryEngine,
        transactionCoordinator: {
          begin: async () => ({
            execute: async (sql, params = []) => sqlQueryEngine.execute(sql, params),
            commit: async () => {},
            rollback: async () => {},
          }),
        },
      });
      instance.initialize();
      return instance;
    };
    const coordinator = createTestCoordinator();
    coordinator.bindReplicaPlacementOwnerFactory((service) =>
      ControlPlaneSetup.attachReplicaPlacementOwner({
        nodeId: 'n1',
        ledgerPartitionService: service,
        controlPlaneReadinessService: {serveEligibilityOwner: nodeAuthority},
        rebalanceCoordinator: coordinator,
        systemTableCache: cache,
        now: () => NOW_MS,
        logger: service.logger,
      }),
    );
    assert.equal(coordinator.placementAdmissionEnabled, true);
    leaderService.setRebalanceCoordinator(coordinator);
    const attachment = leaderService.replicaPlacementOwnerAttachment;
    assert.ok(attachment?.owner);
    const owner = attachment.owner;

    await owner.awaitCurrentWorkIdle();
    syncCacheFromDb();
    let ops = ledgerRows(leaderService);
    assert.equal(ops.length, 1);
    assert.equal(ops[0].type, OperationType.ADD);
    const firstLearnerId = ops[0].replica_id;

    assert.equal(
      replicaHandler.shouldGateActivationOnVoterReadiness(
        LEDGER_PARTITION_ID,
        ops[0].operation_id,
        true,
        OperationType.ADD,
      ),
      false,
    );

    const committedBeforeL1 = await readCommittedConfChangeState(leaderService);
    assert.equal(committedBeforeL1.voterCount, 1);
    assert.equal(shouldAdmitAsLearner(leaderService, ops[0], committedBeforeL1), true);
    const admitL1 = leaderService.admitRaftLearner({
      replicaIdentity: firstLearnerId,
      nodeId: ops[0].target_node_id,
    });
    assert.ok(admitL1.outcome);

    leaderService.db.prepare(
      'UPDATE replica_operations SET workflow_step = ?, status = ?, completed_at = ? WHERE operation_id = ?',
    ).run(WORKFLOW_STEP.ACTIVE, SERVICE_STATUS.ACTIVE, NOW_MS, ops[0].operation_id);
    syncCacheFromDb();
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
      [COLUMN.REPLICA_ID]: firstLearnerId,
      [COLUMN.SERVICE_ID]: firstLearnerId,
      [COLUMN.PARTITION_ID]: LEDGER_PARTITION_ID,
      [COLUMN.NODE_ID]: ops[0].target_node_id,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEARNER,
    });

    owner.notify(PLACEMENT_TRIGGER.LEDGER_COMMIT);
    await owner.awaitCurrentWorkIdle();
    syncCacheFromDb();
    ops = ledgerRows(leaderService);
    assert.equal(ops.length, 2);
    assert.equal(ops[1].type, OperationType.ADD);
    const secondLearnerId = ops[1].replica_id;
    const committedBeforeL2 = await readCommittedConfChangeState(leaderService);
    assert.equal(committedBeforeL2.voterCount, 1);
    assert.equal(shouldAdmitAsLearner(leaderService, ops[1], committedBeforeL2), true);
    const admitL2 = leaderService.admitRaftLearner({
      replicaIdentity: secondLearnerId,
      nodeId: ops[1].target_node_id,
    });
    assert.ok(admitL2.outcome);

    leaderService.db.prepare(
      'UPDATE replica_operations SET workflow_step = ?, status = ?, completed_at = ? WHERE operation_id = ?',
    ).run(WORKFLOW_STEP.ACTIVE, SERVICE_STATUS.ACTIVE, NOW_MS, ops[1].operation_id);
    syncCacheFromDb();
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.INSERT, {
      [COLUMN.REPLICA_ID]: secondLearnerId,
      [COLUMN.SERVICE_ID]: secondLearnerId,
      [COLUMN.PARTITION_ID]: LEDGER_PARTITION_ID,
      [COLUMN.NODE_ID]: ops[1].target_node_id,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEARNER,
    });

    const makeLearnerService = (replicaId, nodeId) => {
      const subMap = new Map();
      const svc = Object.assign(new EventEmitter(), {
        partitionId: LEDGER_PARTITION_ID,
        replicaId,
        nodeId,
        role: RAFT_ROLE.LEARNER,
        learnerFirstAdmission: true,
        learnerBootstrapped: false,
        raft: {
          subscribe: (evt, cb) => {
            subMap.set(evt, cb);
            return () => subMap.delete(evt);
          },
          readStatus: () => ({id: deriveRaftRsPeerId(replicaId)}),
        },
        cancelLearnerPromotionMonitor() {},
        queueRoleUpdate(newRole) {
          cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPDATE, {
            ...cache.get(TABLES.SERVICES, replicaId),
            [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
            [COLUMN.RAFT_ROLE]: newRole,
          });
        },
        triggerMembershipChanged(observation) {
          subMap.get(RAFT_EVENT.MEMBERSHIP_CHANGED)?.(observation);
        },
      });
      relayPartitionConsensusObservations(svc);
      replicaHandler.localServices.set(replicaId, svc);
      return svc;
    };
    const learnerSvc1 = makeLearnerService(firstLearnerId, ops[0].target_node_id);
    const learnerSvc2 = makeLearnerService(secondLearnerId, ops[1].target_node_id);

    owner.notify(PLACEMENT_TRIGGER.LEDGER_COMMIT);
    await owner.awaitCurrentWorkIdle();
    syncCacheFromDb();
    ops = ledgerRows(leaderService);
    assert.equal(ops.length, 3);
    const promoteRow = ops.find((r) => r.type === OperationType.GROWTH_PROMOTE);
    assert.ok(promoteRow);
    assert.equal(promoteRow.status, ReplicaStatus.PENDING);

    const decodedPromoteOp = coordinator.repository.rowToOperation(promoteRow);
    assert.equal(decodedPromoteOp.type, OperationType.GROWTH_PROMOTE);
    assert.equal(decodedPromoteOp.replicaId, firstLearnerId);
    assert.equal(decodedPromoteOp.sourceReplicaId, secondLearnerId);
    assert.deepEqual(
      decodedPromoteOp[ReplicaOperationField.PROMOTE_REPLICA_IDS],
      [firstLearnerId, secondLearnerId],
    );

    disableGrowthPromoteDispatch = true;
    const disabledResult = await coordinator.workflowOwner.dispatchOperation(decodedPromoteOp);
    assert.equal(disabledResult.status, 'in_progress');
    assert.equal(
      coordinator.workflowOwner.observeIncompleteOperationState(decodedPromoteOp),
      'REPLAY_DISPATCH',
    );
    assert.equal(
      cache.get(TABLES.SERVICES, firstLearnerId)[COLUMN.RAFT_ROLE],
      RAFT_ROLE.LEARNER,
    );
    disableGrowthPromoteDispatch = false;

    const firstAttemptResult =
      await coordinator.workflowOwner.executeOperationFromReconcilePath(decodedPromoteOp);
    assert.equal(firstAttemptResult.success, true);
    assert.equal(firstAttemptResult.status, 'in_progress');
    syncCacheFromDb();
    const afterInterruptedRow = cache.get(
      TABLES.REPLICA_OPERATIONS,
      promoteRow.operation_id,
    );
    assert.equal(afterInterruptedRow.workflow_step, WORKFLOW_STEP.SYNCING);
    assert.equal(afterInterruptedRow.completed_at, null);

    // Proof Limit 1 witness: shut down the original coordinator/workflowOwner and
    // construct a fresh RebalanceCoordinator/OperationWorkflowOwner instance over
    // the durable SQLite ledger so restart recovery is proven without any volatile
    // in-memory state from the interrupted owner.
    attachment.detach();
    await coordinator.shutdown();
    const recoveredCoordinator = createTestCoordinator();
    const decodedInterruptedOp =
      recoveredCoordinator.repository.rowToOperation(afterInterruptedRow);
    assert.equal(decodedInterruptedOp.sourceReplicaId, secondLearnerId);
    assert.deepEqual(
      decodedInterruptedOp[ReplicaOperationField.PROMOTE_REPLICA_IDS],
      [firstLearnerId, secondLearnerId],
    );
    assert.equal(
      recoveredCoordinator.workflowOwner.observeIncompleteOperationState(decodedInterruptedOp),
      'REPLAY_DISPATCH',
    );

    const committedVoters = [
      deriveRaftRsPeerId(leaderService.replicaId),
      deriveRaftRsPeerId(firstLearnerId),
      deriveRaftRsPeerId(secondLearnerId),
    ];
    let jointPhase = true;
    leaderService.controllablePort.setConfChangeHandler((change) => {
      if (change?.type === 'growth-promote') {
        if (jointPhase) {
          // Finding 3 witness: enter joint consensus (votersOutgoing non-empty).
          // Even if MEMBERSHIP_CHANGED fires and even if SERVICES rows are updated,
          // learners must not transition to FOLLOWER while joint, and GROWTH_PROMOTE
          // must remain incomplete with its placement hold retained.
          learnerSvc1.triggerMembershipChanged({
            joint: true,
            role: 'voter',
            confState: {
              voters: committedVoters,
              votersOutgoing: [deriveRaftRsPeerId(leaderService.replicaId)],
            },
          });
          learnerSvc2.triggerMembershipChanged({
            joint: true,
            role: 'voter',
            confState: {
              voters: committedVoters,
              votersOutgoing: [deriveRaftRsPeerId(leaderService.replicaId)],
            },
          });
          return {
            outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
            operationId: change.operationId,
            promotedReplicaIds: change.promoteReplicaIds,
          };
        }
        learnerSvc1.triggerMembershipChanged({
          role: 'voter',
          confState: {voters: committedVoters, votersOutgoing: []},
        });
        learnerSvc2.triggerMembershipChanged({
          role: 'voter',
          confState: {voters: committedVoters, votersOutgoing: []},
        });
        return {
          outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
          operationId: change.operationId,
          promotedReplicaIds: change.promoteReplicaIds,
        };
      }
      return null;
    });
    leaderService.controllablePort.committedMembershipHandler = () => ({
      kind: 'committed',
      voters: committedVoters,
      votersOutgoing: jointPhase ?
        [deriveRaftRsPeerId(leaderService.replicaId)] :
        [],
      learners: [],
      learnersNext: [],
      identities: {
        [deriveRaftRsPeerId(leaderService.replicaId)]: leaderService.replicaId,
        [deriveRaftRsPeerId(firstLearnerId)]: firstLearnerId,
        [deriveRaftRsPeerId(secondLearnerId)]: secondLearnerId,
      },
    });

    // While in joint consensus (votersOutgoing non-empty), learner role observations
    // do not promote learners early, and even if SERVICES rows report FOLLOWER,
    // GROWTH_PROMOTE stays in SYNCING with its placement hold retained:
    const jointReconciled = await recoveredCoordinator.workflowOwner.reconcileOperationLifecycle(
      decodedInterruptedOp,
      {cause: 'recovery'},
    );
    assert.equal(jointReconciled, 'waiting');
    assert.equal(learnerSvc1.role, RAFT_ROLE.LEARNER);
    assert.equal(learnerSvc2.role, RAFT_ROLE.LEARNER);
    syncCacheFromDb();
    // Simulate premature SERVICES role update during joint consensus and verify
    // recovery / reconcile still refuses terminal completion until leave-joint commits:
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPDATE, {
      ...cache.get(TABLES.SERVICES, firstLearnerId),
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.RAFT_ROLE]: RAFT_ROLE.FOLLOWER,
    });
    cache.applySystemTableChange(TABLES.SERVICES, CDC_OPERATION.UPDATE, {
      ...cache.get(TABLES.SERVICES, secondLearnerId),
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.RAFT_ROLE]: RAFT_ROLE.FOLLOWER,
    });
    const jointWithFollowerServices =
      await recoveredCoordinator.workflowOwner.reconcileOperationLifecycle(
        recoveredCoordinator.repository.rowToOperation(
          cache.get(TABLES.REPLICA_OPERATIONS, promoteRow.operation_id),
        ),
        {cause: 'recovery'},
      );
    assert.equal(jointWithFollowerServices, 'waiting');
    syncCacheFromDb();
    const stillJointRow = cache.get(
      TABLES.REPLICA_OPERATIONS,
      promoteRow.operation_id,
    );
    assert.equal(stillJointRow.workflow_step, WORKFLOW_STEP.SYNCING);
    assert.equal(stillJointRow.completed_at, null);
    assert.equal(hasIncompletePlacementOperation(leaderService.db, promoteRow.operation_id), true,
      'joint consensus retains the same durable growth occupancy');

    // Leave joint consensus (votersOutgoing empty) -> now authoritative committed
    // membership is non-joint, learners transition to FOLLOWER (clearing isJoiningExistingGroup),
    // and GROWTH_PROMOTE completes and releases its placement hold:
    jointPhase = false;
    const reconciled = await recoveredCoordinator.workflowOwner.reconcileOperationLifecycle(
      recoveredCoordinator.repository.rowToOperation(stillJointRow),
      {cause: 'recovery'},
    );
    assert.equal(reconciled, 'completed');
    syncCacheFromDb();

    assert.equal(learnerSvc1.role, RAFT_ROLE.FOLLOWER);
    assert.equal(learnerSvc2.role, RAFT_ROLE.FOLLOWER);
    assert.equal(learnerSvc1.isJoiningExistingGroup, false);
    assert.equal(learnerSvc2.isJoiningExistingGroup, false);
    assert.equal(
      cache.get(TABLES.SERVICES, firstLearnerId)[COLUMN.RAFT_ROLE],
      RAFT_ROLE.FOLLOWER,
    );
    assert.equal(
      cache.get(TABLES.SERVICES, secondLearnerId)[COLUMN.RAFT_ROLE],
      RAFT_ROLE.FOLLOWER,
    );

    const finalCommittedState = await readCommittedConfChangeState(leaderService);
    assert.equal(finalCommittedState.voterCount, 3);

    const finalPromoteRow = cache.get(
      TABLES.REPLICA_OPERATIONS,
      promoteRow.operation_id,
    );
    assert.equal(finalPromoteRow.workflow_step, WORKFLOW_STEP.ACTIVE);
    assert.equal(finalPromoteRow.status, ReplicaStatus.ACTIVE);
    assert.ok(Number.isFinite(finalPromoteRow.completed_at));
    assert.equal(
      recoveredCoordinator.workflowOwner.observeIncompleteOperationState(
        recoveredCoordinator.repository.rowToOperation(finalPromoteRow),
      ),
      'COMPLETE_ACTIVE',
    );
    assert.equal(hasIncompletePlacementOperation(leaderService.db, promoteRow.operation_id), false,
      'the terminal row clears growth occupancy in the placement census');

    await recoveredCoordinator.shutdown();
  }, {systemTableCache: cache});
}

export async function runGrowthPromoteLeaderRedirectAndTimeoutWitness({
  createSimpleSystemCache,
  nodeRow,
  seededPartitionRow,
}) {
  const fiveNodes = [
    nodeRow('n1', 'h1'),
    nodeRow('n2', 'h2'),
    nodeRow('n3', 'h3'),
    nodeRow('n4', 'h4'),
    nodeRow('n5', 'h5'),
  ];
  const nodeAuthority = {
    subscribe: () => () => {},
    scheduleRefresh: () => {},
    answerCommittedNodes: () => ({
      state: 'ready',
      epoch: {publicationEpoch: 12},
      nodeRows: fiveNodes,
      formation: {state: PLACEMENT_FORMATION_STATE.FORMED, latchEpoch: 12},
    }),
  };

  const r1 = `${LEDGER_PARTITION_ID}-r1`;
  const r2 = `${LEDGER_PARTITION_ID}-r2`;
  const r3 = `${LEDGER_PARTITION_ID}-r3`;
  const l4 = `${LEDGER_PARTITION_ID}-r4`;
  const l5 = `${LEDGER_PARTITION_ID}-r5`;

  const servicesRows = [
    {
      [COLUMN.REPLICA_ID]: r1,
      [COLUMN.SERVICE_ID]: r1,
      [COLUMN.PARTITION_ID]: LEDGER_PARTITION_ID,
      [COLUMN.NODE_ID]: 'n1',
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.RAFT_ROLE]: RAFT_ROLE.FOLLOWER,
    },
    {
      [COLUMN.REPLICA_ID]: r2,
      [COLUMN.SERVICE_ID]: r2,
      [COLUMN.PARTITION_ID]: LEDGER_PARTITION_ID,
      [COLUMN.NODE_ID]: 'n2',
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEADER,
    },
    {
      [COLUMN.REPLICA_ID]: r3,
      [COLUMN.SERVICE_ID]: r3,
      [COLUMN.PARTITION_ID]: LEDGER_PARTITION_ID,
      [COLUMN.NODE_ID]: 'n3',
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.RAFT_ROLE]: RAFT_ROLE.FOLLOWER,
    },
    {
      [COLUMN.REPLICA_ID]: l4,
      [COLUMN.SERVICE_ID]: l4,
      [COLUMN.PARTITION_ID]: LEDGER_PARTITION_ID,
      [COLUMN.NODE_ID]: 'n4',
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEARNER,
    },
    {
      [COLUMN.REPLICA_ID]: l5,
      [COLUMN.SERVICE_ID]: l5,
      [COLUMN.PARTITION_ID]: LEDGER_PARTITION_ID,
      [COLUMN.NODE_ID]: 'n5',
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.RAFT_ROLE]: RAFT_ROLE.LEARNER,
    },
  ];
  const cache = createSimpleSystemCache(
    [seededPartitionRow(LEDGER_PARTITION_ID, 'n2')],
    servicesRows,
  );
  cache.get = (tableName, id) => {
    if (tableName === TABLES.PARTITIONS) {
      return cache.getAll(TABLES.PARTITIONS).find(
        (r) => r[COLUMN.PARTITION_ID] === id,
      ) || null;
    }
    if (tableName === TABLES.SERVICES) {
      return servicesRows.find(
        (r) => r[COLUMN.REPLICA_ID] === id || r[COLUMN.SERVICE_ID] === id,
      ) || null;
    }
    if (tableName === TABLES.REPLICA_OPERATIONS) {
      return cache.getAll(TABLES.REPLICA_OPERATIONS).find(
        (r) => r.operation_id === id,
      ) || null;
    }
    return null;
  };
  const baseGetAll = cache.getAll.bind(cache);
  cache.getAll = (tableName) =>
    tableName === TABLES.SERVICES ? [...servicesRows] : baseGetAll(tableName);
  cache.filter = (tableName, pred) => cache.getAll(tableName).filter(pred);

  await onLedgerLeader(async (leaderService) => {
    leaderService.controllablePort.setProposeHandler(async (entry) => {
      assert.equal(applyCommitted(leaderService, entry), null);
    });
    const syncCacheFromDb = () => {
      for (const row of ledgerRows(leaderService)) {
        cache.applySystemTableChange(
          TABLES.REPLICA_OPERATIONS,
          CDC_OPERATION.UPDATE,
          row,
        );
      }
    };

    const dispatchedTargets = [];
    let forcePersistentNotLeader = false;

    const messageRouter = {
      deliver: async (target, payload) => {
        dispatchedTargets.push(target);
        const targetNodeId = target.split('/')[0];
        if (forcePersistentNotLeader || targetNodeId === 'n1') {
          return buildDeliveryEnvelope(
            {acknowledged: true},
            {
              status: ReplicaOperationResponseStatus.INITIATED,
              [ReplicaOperationField.PROPOSAL]: {
                outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
                reason: 'not_leader',
                retryable: true,
                leaderId: deriveRaftRsPeerId(r2),
                operationId: payload[ReplicaOperationField.OPERATION_ID],
              },
              leaderId: deriveRaftRsPeerId(r2),
              committedVotersReached: false,
            },
          );
        }
        return buildDeliveryEnvelope(
          {acknowledged: true},
          {
            status: ReplicaOperationResponseStatus.INITIATED,
            [ReplicaOperationField.PROPOSAL]: {
              outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
              operationId: payload[ReplicaOperationField.OPERATION_ID],
              promotedReplicaIds: payload[ReplicaOperationField.PROMOTE_REPLICA_IDS],
            },
            committedVotersReached: true,
          },
        );
      },
      registerHandler: () => {},
      unregisterHandler: () => {},
    };

    const sqlQueryEngine = {
      execute: async (sql, params = []) => {
        const stmt = leaderService.db.prepare(sql);
        if (/^\s*SELECT/iu.test(sql)) {
          return {
            success: true,
            rows: stmt.all(...params),
            rowSetComplete: true,
          };
        }
        const info = stmt.run(...params);
        syncCacheFromDb();
        return {
          success: true,
          rows: [],
          changes: info.changes,
          rowsAffected: info.changes,
        };
      },
      executeQuery: async (sql, params = []) =>
        sqlQueryEngine.execute(sql, params),
    };
    const coordinator = new RebalanceCoordinator({
      nodeId: 'n2',
      systemTableCache: cache,
      messageRouter,
      controlPlaneReadinessService: readinessServiceFake({
        serveEligibilityOwner: nodeAuthority,
        getNodeReadinessSync: () => ({ready: true}),
        getPriorityRecoveryPlanningSnapshotSync: () => null,
      }),
      cdcIntegrationService: createLeaderDatabaseReadBoundary(sqlQueryEngine),
      tablePolicyService: {getReplicationFactor: () => 5},
      sqlQueryEngine,
      transactionCoordinator: {
        begin: async () => ({
          execute: async (sql, params = []) => sqlQueryEngine.execute(sql, params),
          commit: async () => {},
          rollback: async () => {},
        }),
      },
    });
    coordinator.initialize();

    // 1. 3->5 growth operation admitted under old leader 'n1', then 'n2' elected leader while
    // 'n1' remains alive as a follower returning `not_leader` (pointing to r2 on 'n2'):
    const opId1 = 'pl-promote-3to5-redirect';
    const initialHistory = JSON.stringify([
      {
        step: WORKFLOW_STEP.PENDING,
        timestamp: NOW_MS,
        promoteReplicaIds: [l4, l5],
      },
    ]);
    leaderService.db.prepare(
      `INSERT INTO replica_operations (
        operation_id, type, partition_id, entity_type, entity_id,
        replica_id, source_node_id, target_node_id,
        source_replica_id, status, workflow_step, created_at, updated_at, steps_history
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      opId1,
      OperationType.GROWTH_PROMOTE,
      LEDGER_PARTITION_ID,
      'partition',
      LEDGER_PARTITION_ID,
      l4,
      'n2',
      'n1',
      l5,
      ReplicaStatus.PENDING,
      WORKFLOW_STEP.PENDING,
      NOW_MS,
      NOW_MS,
      initialHistory,
    );
    syncCacheFromDb();

    const op1 = coordinator.repository.rowToOperation(
      cache.get(TABLES.REPLICA_OPERATIONS, opId1),
    );
    // First dispatch goes to old leader 'n1', receives `not_leader` with leaderId=r2,
    // records the new administration route to 'n2', and defers to SYNCING:
    const firstAttempt = await coordinator.workflowOwner.executeOperationFromReconcilePath(op1);
    assert.equal(firstAttempt.status, 'in_progress');
    assert.equal(dispatchedTargets[0], 'n1/service/replica-handler');
    assert.equal(op1.administrationRouteNodeId, 'n2', 'the live attempt retains the redirected route');
    assert.equal(leaderService.db.prepare(
      'SELECT target_node_id FROM replica_operations WHERE operation_id = ?',
    ).get(opId1).target_node_id, 'n1', 'a routing hint does not change the durable growth target');
    assert.equal(hasIncompletePlacementOperation(leaderService.db, opId1), true);
    assert.equal(op1.operationId, opId1);
    assert.deepEqual(op1[ReplicaOperationField.PROMOTE_REPLICA_IDS], [l4, l5]);

    // Second reconcile dispatches to new leader 'n2' and completes:
    const secondAttempt = await coordinator.workflowOwner.reconcileOperationLifecycle(
      op1,
      {cause: 'observed_progress'},
    );
    assert.equal(secondAttempt, 'completed');
    assert.equal(dispatchedTargets[1], 'n2/service/replica-handler');
    assert.equal(op1.workflowStep, WORKFLOW_STEP.ACTIVE);
    assert.equal(op1.status, ReplicaStatus.ACTIVE);
    assert.equal(hasIncompletePlacementOperation(leaderService.db, opId1), false,
      'successful redirected promotion clears growth occupancy');

    // 2. Persistent refusal case: once in SYNCING, repeated retryable refusals do NOT count
    // as workflow progress, so reconcileTimeoutOperation enforces the step timeout budget
    // and fails the operation cleanly (releasing its placement hold):
    forcePersistentNotLeader = true;
    const opId2 = 'pl-promote-3to5-timeout';
    const staleStartMs = NOW_MS - 120_000;
    const staleHistory = JSON.stringify([
      {
        step: WORKFLOW_STEP.SYNCING,
        timestamp: staleStartMs,
        promoteReplicaIds: [l4, l5],
      },
    ]);
    leaderService.db.prepare(
      `INSERT INTO replica_operations (
        operation_id, type, partition_id, entity_type, entity_id,
        replica_id, source_node_id, target_node_id,
        source_replica_id, status, workflow_step, created_at, updated_at, steps_history
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      opId2,
      OperationType.GROWTH_PROMOTE,
      LEDGER_PARTITION_ID,
      'partition',
      LEDGER_PARTITION_ID,
      l4,
      'n2',
      'n1',
      l5,
      ReplicaStatus.SYNCING,
      WORKFLOW_STEP.SYNCING,
      staleStartMs,
      staleStartMs,
      staleHistory,
    );
    syncCacheFromDb();

    const op2 = coordinator.repository.rowToOperation(
      cache.get(TABLES.REPLICA_OPERATIONS, opId2),
    );
    const inPlaceProgress = await coordinator.workflowOwner.reconcileOperationLifecycle(
      op2,
      {cause: 'timeout', now: NOW_MS},
    );
    assert.equal(
      inPlaceProgress,
      'waiting',
      'in-place SYNCING retry deferral must report waiting (not progress) to timeout reconciliation',
    );
    assert.equal(hasIncompletePlacementOperation(leaderService.db, opId2), true,
      'a refusal keeps the timed operation in the placement census while the step is live');
    await coordinator.workflowOwner.reconcileTimeoutOperation(op2, NOW_MS);
    syncCacheFromDb();
    const timedOutRow = cache.get(TABLES.REPLICA_OPERATIONS, opId2);
    assert.equal(timedOutRow.workflow_step, WORKFLOW_STEP.FAILED);
    assert.equal(timedOutRow.status, ReplicaStatus.FAILED);
    assert.equal(hasIncompletePlacementOperation(leaderService.db, opId2), false,
      'durable timeout releases the same operation’s growth occupancy');

    await coordinator.shutdown();
  }, {systemTableCache: cache});
}

export async function runCorrectionBProductionAssemblyWitness({
  createSimpleSystemCache,
  seededPartitionRow,
  seededServiceRows,
}) {
  const cache = createSimpleSystemCache(
    [seededPartitionRow(LEDGER_PARTITION_ID, 'n1')],
    seededServiceRows(LEDGER_PARTITION_ID, 'n1'),
  );
  cache.get = (tableName, id) =>
    cache.getAll(tableName).find(
      (r) =>
        r[COLUMN.PARTITION_ID] === id ||
        r[COLUMN.REPLICA_ID] === id ||
        r[COLUMN.NODE_ID] === id ||
        r.operation_id === id,
    ) || null;
  cache.getShared = (tableName, id) => cache.get(tableName, id);
  cache.filter = (tableName, pred) => cache.getAll(tableName).filter(pred);
  cache.getTableMutationVersion = () => 1;
  cache.onCacheChange = () => {};
  cache.offCacheChange = () => {};

  const created = await ControlPlaneSetup.create({
    nodeId: 'n1',
    nodeAddress: 'ws://127.0.0.1:19001',
    bootIncarnation: 1,
    messageRouter: {
      deliver: async () =>
        buildDeliveryEnvelope({acknowledged: true}, {status: 'completed'}),
      registerHandler: () => {},
      unregisterHandler: () => {},
      on: () => {},
      off: () => {},
      getConnectedNodes: () => ['n1'],
      getConnectionState: () => 'CONNECTED',
      hasScheduledReconnect: () => false,
      getQueryDataPlaneTransportReadiness: () => ({ready: true}),
      getLocalBootIncarnationIdentity: () => ({bootIncarnation: 1}),
      getCurrentPrimaryConnectionBootIncarnation: () => 1,
      nodeConnections: new Map(),
    },
    cdcGroupPropagationService: {
      getPublicationModeDiagnostics: () => ({currentMode: 'GROUPED'}),
    },
    cdcIntegrationService: {
      registerTableChangeCallback: () => {},
      unregisterTableChangeCallback: () => {},
      sqlQueryEngine: {
        execute: async () => ({rows: []}),
        setRuntimeAccessPolicyOwner: () => {},
        registerServiceLifecycleCommandOwner: () => {},
        setServiceLifecycleCommandOwner: () => {},
        transactionCoordinator: {
          begin: async () => ({
            execute: async () => ({rows: []}),
            commit: async () => {},
            rollback: async () => {},
          }),
        },
      },
    },
    systemTableCache: cache,
    tablePolicyService: {getReplicationFactor: () => 3},
    nodeService: {
      getState: () => 'ACTIVE',
      getNodeStats: async () => ({
        cpu: {count: 4, usagePercent: 10},
        memory: {totalBytes: 1024, usagePercent: 10},
        diskGb: 10,
        diskUsagePercent: 10,
      }),
    },
  });

  const {
    rebalanceCoordinator,
    heartbeatService,
    membershipPublicationService,
  } = created;
  try {
    assert.equal(rebalanceCoordinator.placementAdmissionEnabled, true);
    assert.equal(
      typeof rebalanceCoordinator.attachLedgerReplicaPlacementOwner,
      'function',
    );
    assert.ok(
      rebalanceCoordinator.controlPlaneReadinessService.getServeEligibilityOwner(),
    );

    await onLedgerLeader(async (ledgerService) => {
      ledgerService.controllablePort.setProposeHandler(async (entry) => {
        assert.equal(applyCommitted(ledgerService, entry), null);
      });

      const nonLedgerService = {
        partitionId: 'tables-p1',
        rebalanceCoordinator,
        replicaPlacementOwnerAttachment: null,
        rebalancerLeadershipSink: null,
        ensureReplicaPlacementOwnerAttached:
          ledgerService.ensureReplicaPlacementOwnerAttached,
      };
      nonLedgerService.ensureReplicaPlacementOwnerAttached();
      assert.equal(nonLedgerService.replicaPlacementOwnerAttachment, null);
      assert.equal(nonLedgerService.rebalancerLeadershipSink, null);

      ledgerService.setRebalanceCoordinator(rebalanceCoordinator);
      const attachment1 = ledgerService.replicaPlacementOwnerAttachment;
      assert.ok(attachment1?.owner);
      ledgerService.ensureReplicaPlacementOwnerAttached();
      assert.equal(ledgerService.replicaPlacementOwnerAttachment, attachment1);
      assert.equal(ledgerService.rebalancerLeadershipSink, attachment1.owner);

      assert.equal(attachment1.owner.isLeader, true);
      ledgerService.isLeader = false;
      ledgerService.updateRebalancerLeadership();
      assert.equal(attachment1.owner.isLeader, false);

      ledgerService.isLeader = true;
      ledgerService.updateRebalancerLeadership();
      assert.equal(attachment1.owner.isLeader, true);

      attachment1.detach();
      assert.equal(attachment1.owner.isLeader, false);
      assert.equal(ledgerService.rebalancerLeadershipSink, null);
    }, {systemTableCache: cache});
  } finally {
    heartbeatService?.stop?.();
    membershipPublicationService?.stopOwnerMembershipDriver?.();
    await rebalanceCoordinator?.shutdown?.();
  }
}
