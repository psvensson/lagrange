import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {ReplicaOperationRepository} from '../../src/rebalancer/replica-operation-repository.js';
import {buildOperationUpdateOutcome} from
  '../../src/rebalancer/replica-operation-update-outcome.js';
import {REPLICA_OPERATION_UPDATE_DISPOSITION} from
  '../../src/rebalancer/replica-operation-update-disposition.js';
import {TABLES} from '../../src/constants/index.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {applyCommitted} from '../test-helpers/participant-transaction-fixture.js';
import {NODE, commitLedgerStatement} from './placement-admission-fixture.js';

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
  // Retain the repository owner's exact projection comparison.
  const repository = new ReplicaOperationRepository({
    nodeId: NODE.A,
    timeSource: leader.timeSource,
    logger: leader.logger,
  });
  return Object.assign(repository, {
    async executeReplicaOperationsRead(sql, params) {
      return {
        success: true,
        rowSetComplete: true,
        rows: leader.db.prepare(sql).all(...params),
      };
    },
    getInFlightOperations: async () => [],
    getExistingReplicaRows: async () => [],
    queryIncompleteOperations: async () => [],
    isOperationTerminal: () => false,
    async queryAuthoritativeOperationById(operationId) {
      const row = leader.db
        .prepare('SELECT * FROM replica_operations WHERE operation_id = ?')
        .get(operationId);
      return row ? this.rowToOperation(row) : null;
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
        return buildOperationUpdateOutcome({
          persisted: false, operation: null,
          disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED,
        });
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
      const row = leader.db.prepare(
        'SELECT * FROM replica_operations WHERE operation_id = ?').get(released.operationId);
      return buildOperationUpdateOutcome({
        persisted: true, operation: this.rowToOperation(row),
        disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED,
      });
    },
    async persistOperationUpdate(released, options = {}) {
      return this.compareAndSetPendingBootstrapTopologyRelease(
        released,
        options.expectedStepsHistory,
      );
    },
  });
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
    answerCommittedNodes: () => ({
      formation: {state: 'FORMED', latchEpoch: 4},
    }),
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

export {attachAutoCommitLoop, createCoordinatorWithLedger};
