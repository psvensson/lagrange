import {test} from '../../src/test-helpers/tap.js';
import {
  UnifiedRebalancer,
  EntityType,
} from '../../src/rebalancer/unified-rebalancer.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';

function initEnv() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'seed-node'},
      logging: {level: 'error'},
    });
  }
  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createCache(overrides = {}) {
  const rows = {
    nodes: overrides.nodes || [
      {node_id: 'seed-node', status: 'active', ready_lease_expires_at: Date.now() + 60000},
      {node_id: 'node-2', status: 'active', ready_lease_expires_at: Date.now() + 60000},
      {node_id: 'node-3', status: 'active', ready_lease_expires_at: Date.now() + 60000},
    ],
    partitions: [
      {partition_id: 'control_plane_publications-p1', table_id: 'control_plane_publications'},
    ],
    services: [],
    tables: [],
    replica_operations: [],
    node_endpoints: [],
    service_endpoints: [],
  };
  return {
    get(tableName, key) {
      const values = rows[tableName] || [];
      return values.find((row) => row.partition_id === key || row.node_id === key) || null;
    },
    getAll(tableName) {
      return rows[tableName] || [];
    },
    filter(tableName, predicate) {
      return (rows[tableName] || []).filter(predicate);
    },
  };
}

test('UnifiedRebalancer uses readiness-owned startup cohort for startup-sensitive system partition availability', async (t) => {
  initEnv();
  const cache = createCache();
  const rebalancer = new UnifiedRebalancer({
    entityId: 'control_plane_publications-p1',
    entityType: EntityType.PARTITION,
    nodeId: 'seed-node',
    systemTableCache: cache,
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
      isOutboundQueueAvailable: () => true,
      getConnectedNodes: () => [],
    },
    rebalanceCoordinator: {
      getMoveSafetyError: () => null,
      createOperation: async () => ({}),
      executeOperation: async () => ({success: true}),
      canStartAddOperation: async () => true,
      canStartRemoveOperation: async () => true,
      getStats: () => ({inFlightOperations: 0, totalOperations: 0}),
      storageAccountingService: {estimateReplicaBytes: () => 1},
      storageAdmissionService: {
        checkAdd: async () => ({decision: 'allow'}),
        checkReplace: async () => ({decision: 'allow'}),
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: []};
      },
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
              nodeId === 'seed-node',
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]:
              nodeId === 'seed-node',
          },
          reasons: [],
        };
      },
      getStartupAuthoritySnapshotSync() {
        return {
          authorityAvailable: true,
          canonicalStartupNodeIds: ['seed-node', 'node-2', 'node-3'],
        };
      },
    },
  });

  t.same(
    rebalancer.getAvailableNodes().map((node) => node.node_id).sort(),
    ['seed-node'],
    'startup authority should constrain the cohort without treating remote unready peers as placement-ready',
  );
  t.end();
});

test('UnifiedRebalancer admits remote startup-authority targets for priority control-plane provisioning', async (t) => {
  initEnv();
  const recoveryEligibleNodeIds = new Set(['seed-node']);
  let startupAuthorityAvailable = true;
  const cache = createCache({
    nodes: [
      {
        node_id: 'seed-node',
        status: 'active',
        connection_state: 'ready',
        ready_lease_expires_at: Date.now() + 60000,
      },
      {
        node_id: 'node-2',
        status: 'active',
        connection_state: 'connected',
        ready_lease_expires_at: null,
      },
      {
        node_id: 'node-3',
        status: 'active',
        connection_state: 'disconnected',
        ready_lease_expires_at: null,
      },
    ],
  });
  const rebalancer = new UnifiedRebalancer({
    entityId: 'control_plane_publications-p1',
    entityType: EntityType.PARTITION,
    nodeId: 'seed-node',
    systemTableCache: cache,
    cdcIntegrationService: {
      insertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    tablePolicyService: {
      getPolicyForPartition: () => ({targetReplicaCount: 3}),
      getMessageGroupPolicy: async () => ({targetReplicaCount: 3}),
    },
    messageRouter: {
      getConnectionState: (nodeId) =>
        nodeId === 'node-3' ? 'disconnected' : 'connected',
      isOutboundQueueAvailable: () => true,
      getConnectedNodes: () => [],
    },
    rebalanceCoordinator: {
      getMoveSafetyError: () => null,
      createOperation: async () => ({}),
      executeOperation: async () => ({success: true}),
      canStartAddOperation: async () => true,
      canStartRemoveOperation: async () => true,
      getStats: () => ({inFlightOperations: 0, totalOperations: 0}),
      storageAccountingService: {estimateReplicaBytes: () => 1},
      storageAdmissionService: {
        checkAdd: async () => ({decision: 'allow'}),
        checkReplace: async () => ({decision: 'allow'}),
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: []};
      },
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
              recoveryEligibleNodeIds.has(nodeId),
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]:
              nodeId === 'seed-node',
          },
          reasons: [],
        };
      },
      getStartupAuthoritySnapshotSync() {
        return {
          authorityAvailable: startupAuthorityAvailable,
          canonicalStartupNodeIds: ['seed-node', 'node-2', 'node-3'],
        };
      },
    },
  });

  t.same(
    rebalancer.getAvailableNodes().map((node) => node.node_id).sort(),
    ['node-2', 'seed-node'],
    'connected remote startup-authority peers can receive first priority control-plane replicas',
  );
  t.equal(
    await rebalancer.isNodeReady('node-2'),
    true,
    'pre-execution readiness should use the same bounded startup-authority grace',
  );
  recoveryEligibleNodeIds.add('node-2');
  t.equal(
    await rebalancer.isNodeReady('node-2'),
    true,
    'a remote ledger leader keeps the pre-ready startup-authority target ' +
      'eligible when recovery readiness becomes explicitly satisfied',
  );
  t.equal(
    await rebalancer.getNodeReadinessSkipReason('node-2'),
    null,
    'the leadership-handoff target is executable instead of ' +
      'node_not_ready/repair_ineligible',
  );
  startupAuthorityAvailable = false;
  t.equal(
    await rebalancer.isNodeReady('node-2'),
    false,
    'retained cohort ids cannot grant pre-ready placement after startup ' +
      'authority becomes explicitly unavailable',
  );
  t.equal(
    await rebalancer.getNodeReadinessSkipReason('node-2'),
    'repair_ineligible',
    'an unavailable startup authority fails closed at pre-execution',
  );
  t.end();
});

test('UnifiedRebalancer does not use local startup bypass as placement readiness', async (t) => {
  initEnv();
  const cache = createCache();
  const rebalancer = new UnifiedRebalancer({
    entityId: 'control_plane_publications-p1',
    entityType: EntityType.PARTITION,
    nodeId: 'seed-node',
    systemTableCache: cache,
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
      isOutboundQueueAvailable: () => true,
      getConnectedNodes: () => [],
    },
    rebalanceCoordinator: {
      getMoveSafetyError: () => null,
      createOperation: async () => ({}),
      executeOperation: async () => ({success: true}),
      canStartAddOperation: async () => true,
      canStartRemoveOperation: async () => true,
      getStats: () => ({inFlightOperations: 0, totalOperations: 0}),
      storageAccountingService: {estimateReplicaBytes: () => 1},
      storageAdmissionService: {
        checkAdd: async () => ({decision: 'allow'}),
        checkReplace: async () => ({decision: 'allow'}),
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: []};
      },
    },
    startupRecoveryCoordinator: {
      evaluate: () => ({
        shouldBypassLocalPriorityControlPlaneStartupReadiness: true,
      }),
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
              false,
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
          },
          reasons: [],
        };
      },
      getStartupAuthoritySnapshotSync() {
        return {
          authorityAvailable: true,
          canonicalStartupNodeIds: ['seed-node', 'node-2', 'node-3'],
        };
      },
    },
  });

  t.same(
    rebalancer.getAvailableNodes().map((node) => node.node_id).sort(),
    [],
    'local startup bypass should not make an unready seed placement-ready',
  );
  t.end();
});

test('the live-transport veto routes through hasLiveTransportEvidence: its ' +
  'lowercasing fold is load-bearing at the placement-eligibility call site',
async (t) => {
  // Spec node-liveness-veto-consolidation, Task 4.2 red-on-revert. The switch
  // from the raw `getConnectionState(nodeId) !== STATE.CONNECTED` compare to
  // `!hasLiveTransportEvidence(...)` is a no-op over the canonical (lowercase)
  // live domain — so the ONLY input that distinguishes the atom from the old
  // inline term, proving the call now truly routes through it, is the
  // documented same-or-safer mixed-case fold: on a live router value of
  // 'Connected' the old raw compare VETOES the node (mixed case !== 'connected')
  // while the atom lowercases and admits it. This pins that the atom is the
  // live term, so reverting the src (restoring the raw compare) fails this test.
  initEnv();
  const cache = createCache();
  const rebalancer = new UnifiedRebalancer({
    entityId: 'control_plane_publications-p1',
    entityType: EntityType.PARTITION,
    nodeId: 'seed-node',
    systemTableCache: cache,
    cdcIntegrationService: {
      insertSystemTableRow: async () => ({success: true}),
      updateSystemTableRow: async () => ({success: true}),
    },
    tablePolicyService: {
      getPolicyForPartition: () => ({targetReplicaCount: 3}),
      getMessageGroupPolicy: async () => ({targetReplicaCount: 3}),
    },
    messageRouter: {
      // Non-physical mixed-case value: the live transport machine only ever
      // emits lowercase CONNECTION_STATE, so this exercises the atom's fold,
      // never a real state — see live-transport-evidence-parity char test.
      getConnectionState: () => 'Connected',
      isOutboundQueueAvailable: () => true,
      getConnectedNodes: () => [],
    },
    rebalanceCoordinator: {
      getMoveSafetyError: () => null,
      createOperation: async () => ({}),
      executeOperation: async () => ({success: true}),
      canStartAddOperation: async () => true,
      canStartRemoveOperation: async () => true,
      getStats: () => ({inFlightOperations: 0, totalOperations: 0}),
      storageAccountingService: {estimateReplicaBytes: () => 1},
      storageAdmissionService: {
        checkAdd: async () => ({decision: 'allow'}),
        checkReplace: async () => ({decision: 'allow'}),
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        return {success: true, rows: []};
      },
    },
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return {
          nodeId,
          dimensions: {
            [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
              false,
            [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: false,
          },
          reasons: [],
        };
      },
      getStartupAuthoritySnapshotSync() {
        return {
          authorityAvailable: true,
          canonicalStartupNodeIds: ['seed-node', 'node-2'],
        };
      },
    },
  });

  // node-2 is a startup-authority peer, active, cached-connected — the cached
  // conjunct passes, so the live-transport veto is the sole remaining gate.
  const node = {
    node_id: 'node-2',
    status: 'active',
    connection_state: 'connected',
  };
  t.equal(
    rebalancer.isStartupAuthorityControlPlanePlacementEligibleNode(
      node,
      CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    ),
    true,
    'atom folds mixed-case live "Connected" to connected → node stays eligible ' +
      '(raw compare would veto it — red-on-revert)',
  );
  t.end();
});
