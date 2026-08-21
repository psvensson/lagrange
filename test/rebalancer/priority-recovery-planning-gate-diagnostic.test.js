/**
 * Unit tests for the priority-recovery planning-gate decision diagnostic.
 *
 * The diagnostic exists to confirm, from run evidence, why a checkRebalance
 * pass on a control-plane priority partition did or did not build the
 * priority-recovery operation. It captures the planning-gate bypass state
 * (`shouldBypass`, `operationCreationRequired`) and the sync planning-snapshot
 * availability, so the recovery-op lost-wakeup can be observed instead of
 * inferred.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  UnifiedRebalancer,
  EntityType,
} from '../../src/rebalancer/unified-rebalancer.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  REBALANCER_LOG_MSG,
  REBALANCER_MOVE_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-node'},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createMockCache() {
  return {
    get: () => undefined,
    filter: () => [],
    getAll: () => [],
  };
}

function createRebalancer(options = {}) {
  return new UnifiedRebalancer({
    entityId: options.entityId || 'control_plane_publications-p1',
    entityType: EntityType.PARTITION,
    nodeId: options.nodeId || 'node-1',
    systemTableCache: createMockCache(),
    cdcIntegrationService: {
      insertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    tablePolicyService: {
      getPolicyForPartition: () => ({targetReplicaCount: 3}),
      getMessageGroupPolicy: async () => ({targetReplicaCount: 3}),
    },
    messageRouter: {
      getConnectionState: () => 'connected',
      deliver: async () => ({acknowledged: true, status: 'completed'}),
      pingNode: async () => true,
      isOutboundQueueAvailable: () => true,
    },
    rebalanceCoordinator: {
      getMoveSafetyError: () => null,
      createOperation: async () => ({operationId: 'op', status: 'pending'}),
      executeOperation: async () => ({success: true}),
      canStartAddOperation: async () => true,
      canStartRemoveOperation: async () => true,
      getStats: () => ({}),
      storageAccountingService: {
        estimateReplicaBytes: () => 1,
      },
      storageAdmissionService: {
        checkAdd: async () => ({decision: 'allow'}),
        checkReplace: async () => ({decision: 'allow'}),
      },
    },
  });
}

function captureInfoLogs(rebalancer) {
  const records = [];
  const originalLogger = rebalancer.logger;
  rebalancer.logger = {
    debug: () => {},
    info: (message, context) => records.push({message, context}),
    warn: () => {},
    error: () => {},
  };
  return {records, restore: () => (rebalancer.logger = originalLogger)};
}

test('priority-recovery planning-gate decision diagnostic', async (t) => {
  initializeTestEnvironment();

  await t.test('no-op for non-priority entities', async (t) => {
    const rebalancer = createRebalancer();
    rebalancer.initialize();
    rebalancer.isControlPlanePriorityPartition = () => false;
    const {records, restore} = captureInfoLogs(rebalancer);

    const result =
      rebalancer.recordPriorityRecoveryPlanningGateDecisionDiagnostic(null);

    t.equal(result, null);
    t.equal(records.length, 0);
    t.equal(rebalancer.lastPriorityRecoveryPlanningGateDiagnostic, undefined);
    restore();
    rebalancer.shutdown();
  });

  await t.test(
    'captures the wedge: bypass denied while operation creation is required ' +
      'and the sync planning snapshot is unavailable',
    async (t) => {
      const rebalancer = createRebalancer();
      rebalancer.initialize();
      rebalancer.setLeader(true);
      rebalancer.isControlPlanePriorityPartition = () => true;
      rebalancer.buildPriorityRecoveryPlanningGateBypassSnapshot = () =>
        Object.freeze({
          shouldBypass: false,
          bypassState: 'operation_creation_not_required',
          evidence: {operationCreationRequired: false},
          operationCreationGate: null,
        });
      rebalancer.getPriorityRecoveryPlanningSnapshotSync = () => null;
      const {records, restore} = captureInfoLogs(rebalancer);

      const diagnostic =
        rebalancer.recordPriorityRecoveryPlanningGateDecisionDiagnostic({
          gate: 'local_mutation_readiness',
          logContext: {planningState: 'local_mutation_blocked'},
        });

      t.ok(diagnostic);
      t.equal(diagnostic.entityId, 'control_plane_publications-p1');
      t.equal(diagnostic.isLeader, true);
      t.equal(diagnostic.winningGate, 'local_mutation_readiness');
      t.equal(diagnostic.planningState, 'local_mutation_blocked');
      t.equal(diagnostic.shouldBypass, false);
      t.equal(diagnostic.operationCreationRequired, false);
      t.equal(diagnostic.syncPlanningSnapshotAvailable, false);
      t.equal(
        rebalancer.lastPriorityRecoveryPlanningGateDiagnostic,
        diagnostic,
      );
      t.equal(records.length, 1);
      t.equal(
        records[0].message,
        REBALANCER_LOG_MSG.PRIORITY_RECOVERY_PLANNING_GATE_DIAGNOSTIC,
      );
      restore();
      rebalancer.shutdown();
    },
  );

  await t.test(
    'captures the healthy path: bypass granted with no blocking gate',
    async (t) => {
      const rebalancer = createRebalancer();
      rebalancer.initialize();
      rebalancer.setLeader(true);
      rebalancer.isControlPlanePriorityPartition = () => true;
      rebalancer.buildPriorityRecoveryPlanningGateBypassSnapshot = () =>
        Object.freeze({
          shouldBypass: true,
          bypassState: 'operation_creation_required',
          evidence: {operationCreationRequired: true},
          operationCreationGate: Object.freeze({
            operationCreationRequired: true,
            operationCreationScope: 'current_partition',
            operationCreationPartitionId: 'control_plane_publications-p1',
          }),
        });
      rebalancer.getPriorityRecoveryPlanningSnapshotSync = () => ({
        priorityRecoveryDecisionSnapshots: {snapshots: []},
      });
      const {records, restore} = captureInfoLogs(rebalancer);

      const diagnostic =
        rebalancer.recordPriorityRecoveryPlanningGateDecisionDiagnostic(null);

      t.ok(diagnostic);
      t.equal(diagnostic.winningGate, 'none');
      t.equal(diagnostic.shouldBypass, true);
      t.equal(diagnostic.operationCreationRequired, true);
      t.equal(diagnostic.operationCreationScope, 'current_partition');
      t.equal(
        diagnostic.operationCreationPartitionId,
        'control_plane_publications-p1',
      );
      t.equal(diagnostic.syncPlanningSnapshotAvailable, true);
      t.equal(records.length, 1);
      restore();
      rebalancer.shutdown();
    },
  );

  await t.test(
    'tolerates bypass-snapshot and sync-snapshot evaluation errors',
    async (t) => {
      const rebalancer = createRebalancer();
      rebalancer.initialize();
      rebalancer.isControlPlanePriorityPartition = () => true;
      rebalancer.buildPriorityRecoveryPlanningGateBypassSnapshot = () => {
        throw new Error('bypass boom');
      };
      rebalancer.getPriorityRecoveryPlanningSnapshotSync = () => {
        throw new Error('snapshot boom');
      };
      const {records, restore} = captureInfoLogs(rebalancer);

      const diagnostic =
        rebalancer.recordPriorityRecoveryPlanningGateDecisionDiagnostic(null);

      t.ok(diagnostic);
      t.equal(diagnostic.shouldBypass, false);
      t.equal(diagnostic.bypassState, null);
      t.equal(diagnostic.operationCreationRequired, false);
      t.equal(diagnostic.syncPlanningSnapshotAvailable, false);
      t.equal(records.length, 1);
      restore();
      rebalancer.shutdown();
    },
  );
});

test('one planning pass shares its priority operation-creation gate',
  async (t) => {
    initializeTestEnvironment();

    const rebalancer = createRebalancer();
    let operationCreationGateBuilds = 0;
    rebalancer.buildPriorityRecoveryOperationCreationPlanningGateSnapshot =
      () => {
        operationCreationGateBuilds++;
        return Object.freeze({operationCreationRequired: false});
      };
    const consumeGate = (evaluationContext) => {
      rebalancer.buildPriorityRecoveryPlanningGateBypassSnapshot(
        evaluationContext,
      );
      return null;
    };
    rebalancer.evaluateClusterReadinessGateDecision = consumeGate;
    rebalancer.resolveStartDelayPlanningGateDecision = consumeGate;
    rebalancer.resolveStabilizationPlanningGateDecision = consumeGate;
    rebalancer.resolveTopologySettlingPlanningGateDecision = async (
      evaluationContext,
    ) => consumeGate(evaluationContext);
    rebalancer.resolveTrafficReadinessPlanningGateDecision = consumeGate;
    rebalancer.resolveLocalServePlanningGateDecision = consumeGate;
    rebalancer.resolveLocalMutationPlanningGateDecision = consumeGate;
    rebalancer.resolvePrioritySpreadPlanningGateDecision = consumeGate;
    rebalancer.resolveTransportBackpressurePlanningGateDecision = consumeGate;

    await rebalancer.collectRebalancePlanningGateDecisions();

    t.equal(
      operationCreationGateBuilds,
      1,
      'all gates in one pass reuse one current operation-creation decision',
    );
    rebalancer.shutdown();
  },
);

test(
  'ledger concentration owner issues only a spread-preserving zero-READY ' +
    'surplus-drain capability',
  (t) => {
    initializeTestEnvironment();
    const rebalancer = createRebalancer({
      entityId: 'replica_operations-p1',
    });
    rebalancer.isControlPlanePriorityPartition = () => true;
    rebalancer.rebalanceCoordinator
      .getOperationLedgerQuorumConcentrationForPartition = () =>
        Object.freeze({
          overTarget: true,
          targetReplicaCount: 3,
          totalVoters: 4,
          distinctVoterNodeIds: Object.freeze([
            'seed-node',
            'joiner-1',
            'joiner-2',
          ]),
        });

    const gate =
      rebalancer.buildPriorityRecoveryOperationCreationPlanningGateSnapshot(
        'replica_operations-p1',
      );
    t.equal(gate.operationCreationRequired, true, 'cure creation is required');
    t.strictSame(
      gate.noReadyNodePlanningCapability,
      {
        kind: 'ledger_surplus_drain',
        targetReplicaCount: 3,
        targetNodeIds: ['seed-node', 'joiner-1', 'joiner-2'],
      },
      'the gate carries the concrete retained placement across subsystems',
    );
    t.ok(
      Object.isFrozen(gate.noReadyNodePlanningCapability.targetNodeIds),
      'callers cannot mutate the owner-issued placement capability',
    );

    rebalancer.rebalanceCoordinator
      .getOperationLedgerQuorumConcentrationForPartition = () =>
        Object.freeze({
          overTarget: true,
          targetReplicaCount: 3,
          totalVoters: 4,
          distinctVoterNodeIds: Object.freeze(['seed-node', 'joiner-1']),
        });
    const unsafeGate =
      rebalancer.buildPriorityRecoveryOperationCreationPlanningGateSnapshot(
        'replica_operations-p1',
      );
    t.equal(
      unsafeGate,
      null,
      'zero-READY bypass fails closed without target-wide distinct placement',
    );
    rebalancer.shutdown();
    t.end();
  },
);

test(
  'one check cycle carries a concentrated-ledger cure through the empty ' +
    'READY-node evaluation guard',
  async (t) => {
    initializeTestEnvironment();

    const rebalancer = createRebalancer({
      entityId: 'replica_operations-p1',
      nodeId: 'remote-ledger-leader',
    });
    rebalancer.initialize();
    rebalancer.setLeader(true);
    rebalancer.isControlPlanePriorityPartition = () => true;

    const currentReplicas = [
      {
        replica_id: 'ledger-r1',
        node_id: 'seed-node',
        status: ReplicaStatus.ACTIVE,
        raft_role: 'leader',
      },
      {
        replica_id: 'ledger-r2',
        node_id: 'seed-node',
        status: ReplicaStatus.ACTIVE,
        raft_role: 'follower',
      },
      {
        replica_id: 'ledger-r4',
        node_id: 'joiner-1',
        status: ReplicaStatus.ACTIVE,
        raft_role: 'follower',
      },
      {
        replica_id: 'ledger-r5',
        node_id: 'joiner-2',
        status: ReplicaStatus.ACTIVE,
        raft_role: 'follower',
      },
    ];
    rebalancer.getCurrentReplicas = () => currentReplicas;
    rebalancer.getAvailableNodes = () => [];

    // Production Frankfurt shape after the first successful surplus drain:
    // the operation-creation owner still sees a required ledger cure, while
    // every joiner remains formation-held and the generic READY projection is
    // empty. No asynchronous follow-up decision is visible on the new Raft
    // leader, so only the cycle-owned creation decision can carry the cure
    // across the planning-gate -> state-evaluation interaction.
    let operationCreationGateBuilds = 0;
    rebalancer.buildPriorityRecoveryOperationCreationPlanningGateSnapshot =
      () => {
        operationCreationGateBuilds++;
        return Object.freeze({
          operationCreationRequired: true,
          operationCreationPartitionId: 'replica_operations-p1',
          operationCreationScope: 'current_partition',
          noReadyNodePlanningCapability: Object.freeze({
            kind: 'ledger_surplus_drain',
            targetReplicaCount: 3,
            targetNodeIds: Object.freeze([
              'seed-node',
              'joiner-1',
              'joiner-2',
            ]),
          }),
        });
      };
    rebalancer.getCurrentPriorityRecoveryFollowUpDecisionSnapshot =
      async () => null;
    rebalancer.hasPriorityRecoveryFollowUpOperationRequired =
      async () => false;
    rebalancer.hasPriorityRecoverySurrogateFollowUpOperationRequired =
      async () => false;

    rebalancer.augmentMovesWithPriorityRecoveryFollowUp = async (moves) =>
      moves;
    rebalancer.movePlanner.applyPressureGating = async (moves) => moves;
    rebalancer.getOrdinaryPriorityRecoverySerialGateSnapshot = async () =>
      null;
    rebalancer.getConfiguredRebalanceBudget = async () => 5;
    rebalancer.getGlobalInFlightOperationCount = async () => 0;
    rebalancer.getReservedPriorityRecoveryMoveSlots = () => 0;
    let plannedMoves = [];
    rebalancer.executeRebalancingMoves = async (moves) => {
      plannedMoves = moves;
      return moves.map((move) => ({...move, success: true}));
    };
    rebalancer.scheduleNextCheck = () => {};

    await rebalancer.checkRebalance();

    t.equal(
      plannedMoves.length,
      1,
      'the admitted ledger cure reaches execution despite zero READY nodes',
    );
    t.equal(
      plannedMoves[0]?.type,
      REBALANCER_MOVE_TYPE.REMOVE,
      'the real planner emits the count-decreasing cure',
    );
    t.equal(
      plannedMoves[0]?.nodeId,
      'seed-node',
      'the real planner drains the remaining surplus host',
    );
    t.equal(
      operationCreationGateBuilds,
      1,
      'gates, diagnostics, and evaluation consume one owner decision',
    );
    rebalancer.shutdown();
  },
);
