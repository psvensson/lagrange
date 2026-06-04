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
} from '../../src/rebalancer/rebalancer-constants.js';

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
