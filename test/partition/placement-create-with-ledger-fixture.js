import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {ReplicaOperationRepository} from '../../src/rebalancer/replica-operation-repository.js';
import {buildOperationUpdateOutcome} from
  '../../src/rebalancer/replica-operation-update-outcome.js';
import {REPLICA_OPERATION_UPDATE_DISPOSITION} from
  '../../src/rebalancer/replica-operation-update-disposition.js';
import {CDC_OPERATION, SERVICE_STATUS} from '../../src/constants/index.js';
import {WORKFLOW_STEP} from '../../src/constants/workflow.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {PartitionServiceRowOwner} from '../../src/partition/partition-service-row-owner.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {applyCommitted} from '../test-helpers/participant-transaction-fixture.js';
import {createObservationOnlyMutationPort} from '../rebalancer/test-helpers.js';
import {unavailableRetainedRepairPorts} from '../test-helpers/retained-repair-ports.js';
import {NODE, commitLedgerStatement} from './placement-admission-fixture.js';

// The seam the partition service row owner writes through, admitted into the
// real SystemTableCache as the CDC change each committed write delivers.
function cacheAdmissionWriter(cache) {
  return {
    async insertSystemTableRow(tableName, row) {
      cache.applySystemTableChange(tableName, CDC_OPERATION.UPSERT, row);
      return {success: true, partitionResult: {affectedRows: 1}};
    },
    async updateSystemTableRow(tableName, key, fields) {
      cache.applySystemTableChange(tableName, CDC_OPERATION.UPSERT, {...key, ...fields});
      return {success: true, partitionResult: {affectedRows: 1}};
    },
  };
}

/**
 * Publish the ledger leader through the real publisher: the partition service
 * row owner registers the leader's ACTIVE replica (its SERVICES row, which
 * publishes an ordinary partition leader as raft_role follower) and then
 * publishes the leader identity on the ledger's PARTITIONS row
 * (leader_node_id). Nothing here writes a row by hand.
 * @param {Object} cache - The coordinator's SystemTableCache.
 * @param {Object} leader - The ledger leader service.
 * @return {Promise<void>}
 */
async function publishLedgerLeader(cache, leader) {
  const owner = new PartitionServiceRowOwner({systemTableWriter: cacheAdmissionWriter(cache)});
  await owner.registerReplica({partitionId: leader.partitionId, replicaId: leader.replicaId,
    nodeId: leader.nodeId, service: leader, status: SERVICE_STATUS.ACTIVE});
}

/**
 * The canonical delivery port toward the ledger leader's endpoint. A delivery
 * must name exactly the address the row owner binds to that replica; the
 * ledger's answer travels in the transport owner's acknowledged envelope.
 * @param {Object} leader - The ledger leader service.
 * @param {Function} answer - (address, message, options) => the ledger answer.
 * @return {{deliver: Function}} The router's delivery seam.
 */
function ledgerLeaderTransport(leader, answer) {
  const {address} = PartitionServiceRowOwner.buildServiceRow({partitionId: leader.partitionId,
    replicaId: leader.replicaId, nodeId: leader.nodeId});
  return {
    async deliver(target, message, options) {
      if (target !== address) {
        throw new Error(`ledger delivery addressed ${target}; the published endpoint is ${address}`);
      }
      return buildDeliveryEnvelope({acknowledged: true}, await answer(target, message, options));
    },
  };
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
  // Retain the repository owner's exact projection comparison. Its only
  // write is the explicit committed-statement CAS below; the structured
  // writer port therefore observes only.
  const repository = new ReplicaOperationRepository({
    ...unavailableRetainedRepairPorts(),
    nodeId: NODE.A,
    timeSource: leader.timeSource,
    logger: leader.logger,
    controlPlaneSystemTableGateway: {
      submitMutation: createObservationOnlyMutationPort('placement ledger repository'),
    },
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

/**
 * A coordinator facade over the real ledger leader, with the real
 * SystemTableCache as its cache.
 * @param {Object} leader - The ledger leader service.
 * @param {Object} [options] - {registerLocalLeader, messageRouter}.
 * @return {Object} The coordinator.
 */
function createCoordinatorWithLedger(leader, options = {}) {
  const systemTableCache = new SystemTableCache();
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

/**
 * A coordinator that is not the ledger leader: it reaches the leader only
 * through what the real publisher put in its cache and the given router.
 * @param {Object} leader - The ledger leader service.
 * @param {Object} messageRouter - The router's delivery seam.
 * @return {Promise<Object>} The coordinator.
 */
async function createRemoteLedgerCoordinator(leader, messageRouter) {
  const coordinator = createCoordinatorWithLedger(leader,
    {registerLocalLeader: false, messageRouter});
  await publishLedgerLeader(coordinator.systemTableCache, leader);
  return coordinator;
}

export {
  attachAutoCommitLoop, createCoordinatorWithLedger, createRemoteLedgerCoordinator,
  ledgerLeaderTransport,
};
