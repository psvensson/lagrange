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

function createCache() {
  const rows = {
    nodes: [
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
    ['node-2', 'node-3', 'seed-node'],
    'startup-sensitive system partition availability should follow the readiness-owned startup cohort',
  );
  t.end();
});
