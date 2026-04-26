/**
 * Query Executor Tests
 * Tests for parallel query execution across partitions.
 * All queries route through message router using service addresses from system cache.
 * Requirements: 6.2, 6.4, 22.1, 22.6
 */

import {test} from '../../src/test-helpers/tap.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {ERRORS} from '../../src/constants/index.js';
import {
  TABLES,
} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  QUERY_ROUTING_REPAIR_REASON,
} from '../../src/query/query-constants.js';
import {
} from '../../src/query/canonical-leader-routing.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
} from '../../src/partition/partition-service-constants.js';
import {
  assertNoHandlerRepairConverged,
  createStaleOverlayOwnerHandoffFixture,
} from './routing-repair-test-helpers.js';

// Initialize configuration for tests
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
const config = ConfigurationManager.getInstance();
config.initialize();

// Mock partition data storage
const mockPartitionData = new Map();

// Mock message router that routes queries to mock partition data
function createMockMessageRouter() {
  return {
    deliver: async function(address, message) {
      // Extract partition ID from address (format: nodeId/partition/partitionId)
      const parts = address.split('/');
      const partitionId = parts[2];

      if (message.type === 'QUERY') {
        const data = mockPartitionData.get(partitionId) || [];
        return {
          acknowledged: true,
          success: true,
          rows: data,
          changes: data.length || 1,
        };
      }
      return {acknowledged: true, success: true, changes: 1};
    },
  };
}

// Mock system cache with services for routing
function createMockSystemCache(partitionIds) {
  const services = partitionIds.map((pid) => ({
    service_id: pid,
    service_type: 'partition',
    partition_id: pid,
    node_id: 'test-node',
    raft_role: 'leader',
    address: `test-node/partition/${pid}`,
    status: 'active',
  }));
  const partitions = partitionIds.map((partitionId) => ({
    partition_id: partitionId,
    leader_node_id: 'test-node',
  }));

  return {
    services,
    partitions,
    get: function(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter: function(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };
}

// Helper to parse SQL


test('QueryExecutor - executeOnPartition fails closed when the canonical ' +
  'leader service row remains missing after repair', async (t) => {
  const deliveries = [];
  const readinessCalls = [];
  const systemCache = {
    partitions: [
      {
        partition_id: 'p1',
        leader_node_id: 'leader-node',
      },
    ],
    services: [
      {
        service_id: 'p1-follower',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'follower-node',
        raft_role: 'follower',
        address: 'follower-node/partition/p1',
        status: 'active',
      },
    ],
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };
  const readinessService = {
    getNodeReadinessSync() {
      return {
        dimensions: {serveEligible: true},
      };
    },
    async getNodeReadiness(nodeId, options) {
      readinessCalls.push({nodeId, options});
      return {
        dimensions: {serveEligible: false},
      };
    },
  };
  const messageRouter = {
    async deliver(address) {
      deliveries.push(address);
      if (address === 'follower-node/partition/p1') {
        return {
          acknowledged: true,
          success: false,
          redirect: 'LEADER_REDIRECT',
          leaderAddress: 'leader-node/partition/p1',
          partitionId: 'p1',
        };
      }
      return {
        acknowledged: true,
        success: true,
        rows: [],
        changes: 1,
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
    controlPlaneReadinessService: readinessService,
    nodeId: 'local-node',
  });

  const result = await executor.executeOnPartition(
    'p1',
    'INSERT INTO users (id) VALUES (1)',
    [],
    false,
  );

  t.equal(result.success, false);
  t.equal(result.error, ERRORS.NO_LEADER_AVAILABLE_FOR_WRITE);
  t.same(
    readinessCalls.map((call) => call.nodeId),
    ['leader-node'],
    'write routing should still attempt one authoritative refresh before failing closed',
  );
  t.same(
    deliveries,
    [],
    'steady-state writes must not widen to redirect-capable replicas when canonical leader service metadata remains absent',
  );
});

test('QueryExecutor - getLeaderRecoveryCandidates includes one refreshed ' +
  'candidate when stale address was already attempted', (t) => {
  const executor = new QueryExecutor({
    messageRouter: createMockMessageRouter(),
    systemCache: createMockSystemCache(['p1']),
    nodeId: 'local-node',
  });

  const routingSnapshot = {
    routableServices: [
      {
        service_id: 'p1-leader',
        partition_id: 'p1',
        node_id: 'leader-node',
        address: 'leader-node/partition/p1-new',
      },
    ],
  };
  const attemptedAddresses = new Set(['leader-node/partition/p1-old']);

  const candidates = executor.getLeaderRecoveryCandidates(
    routingSnapshot,
    attemptedAddresses,
    false,
  );

  t.equal(candidates.length, 1);
  t.equal(
    candidates[0].address,
    'leader-node/partition/p1-new',
    'recovery should include a single refreshed leader endpoint when it differs from the attempted stale address',
  );
  t.end();
});

test('QueryExecutor - executeOnPartition repairs stale no-handler leader ' +
  'address and retries with refreshed endpoint', async (t) => {
  const deliveries = [];
  const readinessCalls = [];
  const partitionId = 'p1';
  const staleAddress = 'leader-node/partition/p1-old';
  const refreshedAddress = 'leader-node/partition/p1-new';
  const systemCache = {
    partitions: [
      {
        partition_id: partitionId,
        leader_node_id: 'leader-node',
      },
    ],
    services: [
      {
        service_id: 'p1-leader',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'leader-node',
        raft_role: 'leader',
        address: staleAddress,
        status: 'active',
      },
    ],
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };
  const readinessService = {
    getNodeReadinessSync() {
      return {
        dimensions: {serveEligible: true},
      };
    },
    async getNodeReadiness(nodeId, options = {}) {
      readinessCalls.push({nodeId, options});
      if (nodeId === 'leader-node' &&
          options.forceAuthoritativeRefresh === true) {
        systemCache.services[0].address = refreshedAddress;
      }
      return {
        dimensions: {serveEligible: true},
      };
    },
  };
  const messageRouter = {
    async deliver(address) {
      deliveries.push(address);
      if (address === staleAddress) {
        return {
          acknowledged: true,
          success: false,
          noHandler: true,
          error: `${ERRORS.NO_HANDLER_FOR_ADDRESS} ${address}`,
        };
      }
      if (address === refreshedAddress) {
        return {
          acknowledged: true,
          success: true,
          rows: [],
          changes: 1,
        };
      }
      return {
        acknowledged: true,
        success: false,
        error: 'unexpected address',
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
    controlPlaneReadinessService: readinessService,
    nodeId: 'local-node',
  });

  const result = await executor.executeOnPartition(
    partitionId,
    'UPDATE users SET name = ?',
    ['Ada'],
    false,
  );

  t.equal(result.success, true);
  t.same(
    deliveries,
    [staleAddress, refreshedAddress],
    'write routing should retry once with refreshed leader metadata after no-handler on stale address',
  );
  t.equal(readinessCalls.length, 1);
  t.equal(readinessCalls[0].nodeId, 'leader-node');
  t.equal(readinessCalls[0].options.forceAuthoritativeRefresh, true);
  t.equal(readinessCalls[0].options.maxCachedAgeMs, 0);
  t.equal(
    readinessCalls[0].options.refreshReason,
    QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE,
  );
  t.end();
});

test('QueryExecutor - executeOnPartition repairs stale no-handler read ' +
  'address and retries with refreshed endpoint', async (t) => {
  const deliveries = [];
  const readinessCalls = [];
  const partitionId = 'p1';
  const staleAddress = 'leader-node/partition/p1-old';
  const refreshedAddress = 'leader-node/partition/p1-new';
  const systemCache = {
    partitions: [
      {
        partition_id: partitionId,
        leader_node_id: 'leader-node',
      },
    ],
    services: [
      {
        service_id: 'p1-leader',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'leader-node',
        raft_role: 'leader',
        address: staleAddress,
        status: 'active',
      },
    ],
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };
  const readinessService = {
    getNodeReadinessSync() {
      return {
        dimensions: {serveEligible: true},
      };
    },
    async getNodeReadiness(nodeId, options = {}) {
      readinessCalls.push({nodeId, options});
      if (nodeId === 'leader-node' &&
          options.forceAuthoritativeRefresh === true) {
        systemCache.services[0].address = refreshedAddress;
      }
      return {
        dimensions: {serveEligible: true},
      };
    },
  };
  const messageRouter = {
    async deliver(address) {
      deliveries.push(address);
      if (address === staleAddress) {
        return {
          acknowledged: true,
          success: false,
          noHandler: true,
          error: `${ERRORS.NO_HANDLER_FOR_ADDRESS} ${address}`,
        };
      }
      if (address === refreshedAddress) {
        return {
          acknowledged: true,
          success: true,
          rows: [{ok: true}],
        };
      }
      return {
        acknowledged: true,
        success: false,
        error: 'unexpected address',
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
    controlPlaneReadinessService: readinessService,
    nodeId: 'local-node',
  });

  const result = await executor.executeOnPartition(
    partitionId,
    'SELECT 1',
    [],
    true,
  );

  t.equal(result.success, true);
  t.same(
    deliveries,
    [staleAddress, refreshedAddress],
    'read routing should also retry with refreshed metadata after no-handler on stale address',
  );
  t.equal(readinessCalls.length, 1);
  t.equal(readinessCalls[0].nodeId, 'leader-node');
  t.equal(
    readinessCalls[0].options.refreshReason,
    QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE,
  );
  t.end();
});

test('QueryExecutor - executeOnPartition repairs stale no-handler read ' +
  'address across owner handoff via routing overlay refresh', async (t) => {
  const fixture = createStaleOverlayOwnerHandoffFixture({
    successRows: [{operation_id: 'op-1'}],
  });

  const executor = new QueryExecutor({
    messageRouter: fixture.messageRouter,
    systemCache: fixture.systemCache,
    routingMetadataOverlay: fixture.routingMetadataOverlay,
    nodeId: 'local-node',
  });

  const result = await executor.executeOnPartition(
    fixture.partitionId,
    'SELECT * FROM replica_operations WHERE operation_id = ?',
    ['op-1'],
    true,
  );

  t.equal(result.success, true);
  assertNoHandlerRepairConverged(t, {
    deliveries: fixture.deliveries,
    staleAddress: fixture.staleAddress,
    refreshedAddress: fixture.refreshedAddress,
    overlayRefreshCalls: fixture.overlayRefreshCalls,
    context: 'read routing owner handoff repair',
  });
  t.equal(
    fixture.overlayRefreshCalls[0].partitionKey,
    fixture.partitionId,
    'no-handler repair should refresh routing metadata for the affected partition',
  );
  t.equal(
    fixture.overlayRefreshCalls[0].options.refreshReason,
    QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE,
    'overlay refresh should receive the stale-service repair reason',
  );
  t.end();
});

test('QueryExecutor - executeOnPartition widens recovery-owned system-table ' +
  'writes away from stale no-handler siblings on the disproven leader node',
async (t) => {
  const deliveries = [];
  const partitionId = 'sql_transactions-p1';
  const staleAddress = 'leader-node/partition/sql_transactions-p1-r3';
  const siblingAddress = 'leader-node/partition/sql_transactions-p1-r2';
  const recoveryAddress = 'recovery-node/partition/sql_transactions-p1-r4';
  const systemCache = {
    partitions: [
      {
        partition_id: partitionId,
        leader_node_id: 'leader-node',
        table_name: TABLES.SQL_TRANSACTIONS,
      },
    ],
    services: [
      {
        service_id: 'sql_transactions-p1-r3',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'leader-node',
        raft_role: 'follower',
        address: staleAddress,
        status: 'active',
      },
      {
        service_id: 'sql_transactions-p1-r2',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'leader-node',
        raft_role: 'follower',
        address: siblingAddress,
        status: 'active',
      },
      {
        service_id: 'sql_transactions-p1-r4',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'recovery-node',
        raft_role: 'follower',
        address: recoveryAddress,
        status: 'active',
      },
    ],
    get(type, key) {
      if (type === TABLES.PARTITIONS) {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === TABLES.SERVICES) {
        return this.services.filter(predicate);
      }
      if (type === TABLES.PARTITIONS) {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };
  const messageRouter = {
    async deliver(address) {
      deliveries.push(address);
      if (address === staleAddress) {
        return {
          acknowledged: true,
          success: false,
          noHandler: true,
          error: `${ERRORS.NO_HANDLER_FOR_ADDRESS} ${address}`,
        };
      }
      if (address === siblingAddress) {
        return {
          acknowledged: true,
          success: false,
          error: 'unexpected sibling retry on disproven leader node',
        };
      }
      if (address === recoveryAddress) {
        return {
          acknowledged: true,
          success: true,
          changes: 1,
          rows: [],
        };
      }
      return {
        acknowledged: true,
        success: false,
        error: 'unexpected address',
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
    nodeId: 'local-node',
  });

  const result = await executor.executeOnPartition(
    partitionId,
    'UPDATE sql_transactions SET status = ? WHERE transaction_id = ?',
    ['ACTIVE', 'tx-1'],
    false,
    false,
    false,
    {
      routingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    },
  );

  t.equal(result.success, true);
  t.same(
    deliveries,
    [staleAddress, recoveryAddress],
    'runtime no-handler on one retained-leader sibling should widen to a different-node recovery candidate before retrying the same stale node',
  );
  t.end();
});

test('QueryExecutor - executeOnPartition widens owner-missing priority ' +
  'recovery reads away from a stale service-role-derived leader node after ' +
  'a no-handler witness', async (t) => {
  const deliveries = [];
  const partitionId = 'replica_operations-p1';
  const staleAddress = 'leader-node/partition/replica_operations-p1-r1';
  const siblingAddress = 'leader-node/partition/replica_operations-p1-r2';
  const recoveryAddress = 'recovery-node/partition/replica_operations-p1-r3';
  const systemCache = {
    partitions: [
      {
        partition_id: partitionId,
        leader_node_id: null,
        table_name: TABLES.REPLICA_OPERATIONS,
      },
    ],
    services: [
      {
        service_id: 'replica_operations-p1-r1',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'leader-node',
        raft_role: 'leader',
        address: staleAddress,
        status: 'active',
      },
      {
        service_id: 'replica_operations-p1-r2',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'leader-node',
        raft_role: 'follower',
        address: siblingAddress,
        status: 'active',
      },
      {
        service_id: 'replica_operations-p1-r3',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'recovery-node',
        raft_role: 'follower',
        address: recoveryAddress,
        status: 'active',
      },
    ],
    get(type, key) {
      if (type === TABLES.PARTITIONS) {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === TABLES.SERVICES) {
        return this.services.filter(predicate);
      }
      if (type === TABLES.PARTITIONS) {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };
  const messageRouter = {
    async deliver(address) {
      deliveries.push(address);
      if (address === staleAddress) {
        return {
          acknowledged: true,
          success: false,
          noHandler: true,
          error: `${ERRORS.NO_HANDLER_FOR_ADDRESS} ${address}`,
        };
      }
      if (address === siblingAddress) {
        return {
          acknowledged: true,
          success: false,
          error: 'unexpected sibling retry on stale service-role-derived leader node',
        };
      }
      if (address === recoveryAddress) {
        return {
          acknowledged: true,
          success: true,
          rows: [{operation_id: 'op-1'}],
        };
      }
      return {
        acknowledged: true,
        success: false,
        error: 'unexpected address',
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
    nodeId: 'local-node',
  });

  const result = await executor.executeOnPartition(
    partitionId,
    'SELECT * FROM replica_operations WHERE operation_id = ?',
    ['op-1'],
    true,
    true,
    false,
    {
      routingReadinessDimension:
        CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    },
  );

  t.equal(result.success, true);
  t.same(
    deliveries,
    [staleAddress, recoveryAddress],
    'owner-missing priority recovery reads should treat the runtime no-handler witness as evidence against retrying the disproven leader node first',
  );
  t.end();
});

test('QueryExecutor - executeOnPartition honors overlay refresh when service id is unchanged', async (t) => {
  const fixture = createStaleOverlayOwnerHandoffFixture({
    sameServiceId: true,
    refreshedAddress: 'new-owner/partition/replica_operations-p1-r1',
    successRows: [{operation_id: 'op-2'}],
  });

  const executor = new QueryExecutor({
    messageRouter: fixture.messageRouter,
    systemCache: fixture.systemCache,
    routingMetadataOverlay: fixture.routingMetadataOverlay,
    nodeId: 'local-node',
  });

  const result = await executor.executeOnPartition(
    fixture.partitionId,
    'SELECT * FROM replica_operations WHERE operation_id = ?',
    ['op-2'],
    true,
  );

  t.equal(result.success, true);
  assertNoHandlerRepairConverged(t, {
    deliveries: fixture.deliveries,
    staleAddress: fixture.staleAddress,
    refreshedAddress: fixture.refreshedAddress,
    overlayRefreshCalls: fixture.overlayRefreshCalls,
    context: 'same-service-id routing repair',
  });
  t.equal(
    fixture.overlayRefreshCalls[0].options.refreshReason,
    QUERY_ROUTING_REPAIR_REASON.NO_HANDLER_STALE_SERVICE,
    'same-service-id repair should still use stale-service refresh reason',
  );
  t.end();
});

test('QueryExecutor - executeOnPartition falls back to live replica ' +
  'discovery after the canonical leader transport closes', async (t) => {
  const deliveries = [];
  const systemCache = {
    partitions: [
      {
        partition_id: 'p1',
        leader_node_id: 'leader-node',
      },
    ],
    services: [
      {
        service_id: 'p1-leader',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'leader-node',
        raft_role: 'leader',
        address: 'leader-node/partition/p1',
        status: 'active',
      },
      {
        service_id: 'p1-follower',
        service_type: 'partition',
        partition_id: 'p1',
        node_id: 'follower-node',
        raft_role: 'follower',
        address: 'follower-node/partition/p1',
        status: 'active',
      },
    ],
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) => partition.partition_id === key) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };
  const messageRouter = {
    async deliver(address) {
      deliveries.push(address);
      if (address === 'leader-node/partition/p1') {
        const error = new Error('Connection to node leader-node closed');
        error.code = 'ROUTER_CONNECTION_CLOSED';
        error.deferRetry = true;
        error.retryAfterMs = 100;
        throw error;
      }
      if (address === 'follower-node/partition/p1') {
        return {
          acknowledged: true,
          success: false,
          redirect: 'LEADER_REDIRECT',
          leaderAddress: 'new-leader/partition/p1',
          partitionId: 'p1',
        };
      }
      if (address === 'new-leader/partition/p1') {
        return {
          acknowledged: true,
          success: true,
          rows: [],
          changes: 1,
        };
      }
      return {
        acknowledged: true,
        success: false,
        error: 'unexpected address',
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
    nodeId: 'local-node',
  });

  const result = await executor.executeOnPartition(
    'p1',
    'UPDATE users SET name = ?',
    ['Ada'],
    false,
  );

  t.equal(result.success, true);
  t.same(
    deliveries,
    [
      'leader-node/partition/p1',
      'follower-node/partition/p1',
      'new-leader/partition/p1',
    ],
    'write routing should degrade to live replica discovery only after the canonical leader path proves unreachable',
  );
});

test('QueryExecutor - executeOnPartition quarantines stale no-handler ' +
  'leader address across consecutive writes', async (t) => {
  const deliveries = [];
  const partitionId = 'replica_operations-p1';
  const staleAddress = 'leader-node/partition/replica_operations-p1-r1';
  const fallbackAddress = 'follower-node/partition/replica_operations-p1-r2';

  const systemCache = {
    partitions: [
      {
        partition_id: partitionId,
        leader_node_id: 'leader-node',
      },
    ],
    services: [
      {
        service_id: 'replica_operations-p1-r1',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'leader-node',
        raft_role: 'leader',
        address: staleAddress,
        status: 'active',
      },
      {
        service_id: 'replica_operations-p1-r2',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'follower-node',
        raft_role: 'follower',
        address: fallbackAddress,
        status: 'active',
      },
    ],
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) =>
          partition.partition_id === key,
        ) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };

  const routingMetadataOverlay = {
    getPartitionById() {
      return null;
    },
    getServicesForPartition() {
      return [];
    },
    async refreshPartitionRouting() {
      return false;
    },
  };

  const messageRouter = {
    async deliver(address) {
      deliveries.push(address);
      if (address === staleAddress) {
        return {
          acknowledged: true,
          success: false,
          noHandler: true,
          error: `${ERRORS.NO_HANDLER_FOR_ADDRESS} ${address}`,
        };
      }
      if (address === fallbackAddress) {
        return {
          acknowledged: true,
          success: true,
          changes: 1,
          rows: [],
        };
      }
      return {
        acknowledged: true,
        success: false,
        error: 'unexpected address',
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
    routingMetadataOverlay,
    nodeId: 'local-node',
    noHandlerAddressQuarantineMs: 60000,
  });

  const firstResult = await executor.executeOnPartition(
    partitionId,
    'UPDATE replica_operations SET status = ? WHERE operation_id = ?',
    ['active', 'op-1'],
    false,
  );
  const secondResult = await executor.executeOnPartition(
    partitionId,
    'UPDATE replica_operations SET status = ? WHERE operation_id = ?',
    ['completed', 'op-1'],
    false,
  );

  t.equal(firstResult.success, true);
  t.equal(secondResult.success, true);
  t.same(
    deliveries,
    [staleAddress, fallbackAddress, fallbackAddress],
    'second write should skip the quarantined stale no-handler leader address',
  );
  t.end();
});

test('QueryExecutor - executeOnPartition retries retryable control-plane ' +
  'write failures on another live replica', async (t) => {
  const deliveries = [];
  const partitionId = 'replica_operations-p1';
  const leaderAddress = 'leader-node/partition/replica_operations-p1-r1';
  const fallbackAddress = 'follower-node/partition/replica_operations-p1-r2';

  const systemCache = {
    partitions: [
      {
        partition_id: partitionId,
        leader_node_id: 'leader-node',
        table_name: TABLES.REPLICA_OPERATIONS,
      },
    ],
    services: [
      {
        service_id: 'replica_operations-p1-r1',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'leader-node',
        raft_role: 'leader',
        address: leaderAddress,
        status: 'active',
      },
      {
        service_id: 'replica_operations-p1-r2',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'follower-node',
        raft_role: 'follower',
        address: fallbackAddress,
        status: 'active',
      },
    ],
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) =>
          partition.partition_id === key,
        ) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };

  const messageRouter = {
    async deliver(address) {
      deliveries.push(address);
      if (address === leaderAddress) {
        return {
          acknowledged: true,
          success: false,
          error: PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
        };
      }
      if (address === fallbackAddress) {
        return {
          acknowledged: true,
          success: true,
          changes: 1,
          rows: [],
        };
      }
      return {
        acknowledged: true,
        success: false,
        error: 'unexpected address',
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
    nodeId: 'local-node',
  });

  const result = await executor.executeOnPartition(
    partitionId,
    'UPDATE replica_operations SET status = ? WHERE operation_id = ?',
    ['active', 'op-1'],
    false,
  );

  t.equal(result.success, true);
  t.same(
    deliveries,
    [leaderAddress, fallbackAddress],
    'control-plane writes should fall through to another live replica ' +
      'when the first candidate reports retryable partition contention',
  );
});

test('QueryExecutor - executeOnPartition widens deferred priority ' +
  'control-plane transport failures to another live replica', async (t) => {
  const deliveries = [];
  const partitionId = 'replica_operations-p1';
  const leaderAddress = 'leader-node/partition/replica_operations-p1-r1';
  const fallbackAddress = 'follower-node/partition/replica_operations-p1-r2';
  let leaderAttempts = 0;

  const systemCache = {
    partitions: [
      {
        partition_id: partitionId,
        leader_node_id: 'leader-node',
        table_name: TABLES.REPLICA_OPERATIONS,
      },
    ],
    services: [
      {
        service_id: 'replica_operations-p1-r1',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'leader-node',
        raft_role: 'leader',
        address: leaderAddress,
        status: 'active',
      },
      {
        service_id: 'replica_operations-p1-r2',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'follower-node',
        raft_role: 'follower',
        address: fallbackAddress,
        status: 'active',
      },
    ],
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) =>
          partition.partition_id === key,
        ) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };

  const messageRouter = {
    async deliver(address) {
      deliveries.push(address);
      if (address === leaderAddress) {
        leaderAttempts += 1;
        if (leaderAttempts === 1) {
          return {
            acknowledged: true,
            success: false,
            error: 'Connection to node leader-node closed',
            errorCode: 'ROUTER_CONNECTION_CLOSED',
            deferRetry: true,
            retryAfterMs: 250,
          };
        }
        return {
          acknowledged: true,
          success: true,
          changes: 1,
          rows: [],
        };
      }
      if (address === fallbackAddress) {
        return {
          acknowledged: true,
          success: true,
          changes: 1,
          rows: [],
        };
      }
      return {
        acknowledged: true,
        success: false,
        error: 'unexpected fallback delivery',
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
    nodeId: 'local-node',
  });

  const result = await executor.executeOnPartition(
    partitionId,
    'UPDATE replica_operations SET status = ? WHERE operation_id = ?',
    ['active', 'op-1'],
    false,
  );

  t.equal(result.success, true);
  t.same(
    deliveries,
    [leaderAddress, fallbackAddress],
    'priority recovery should widen to another live replica after a deferred ' +
      'leader-unavailable transport failure',
  );
});

test('QueryExecutor - executeOnPartition keeps deferred non-priority ' +
  'system-table transport failures on the same leader address', async (t) => {
  const deliveries = [];
  const retryDelays = [];
  const partitionId = 'services-p1';
  const leaderAddress = 'leader-node/partition/services-p1-r1';
  let leaderAttempts = 0;

  const systemCache = {
    partitions: [
      {
        partition_id: partitionId,
        leader_node_id: 'leader-node',
        table_name: TABLES.SERVICES,
      },
    ],
    services: [
      {
        service_id: 'services-p1-r1',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'leader-node',
        raft_role: 'leader',
        address: leaderAddress,
        status: 'active',
      },
      {
        service_id: 'services-p1-r2',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'follower-node',
        raft_role: 'follower',
        address: 'follower-node/partition/services-p1-r2',
        status: 'active',
      },
    ],
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) =>
          partition.partition_id === key,
        ) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };

  const messageRouter = {
    async deliver(address) {
      deliveries.push(address);
      if (address === leaderAddress) {
        leaderAttempts += 1;
        if (leaderAttempts === 1) {
          return {
            acknowledged: true,
            success: false,
            error: 'Connection to node leader-node closed',
            errorCode: 'ROUTER_CONNECTION_CLOSED',
            deferRetry: true,
            retryAfterMs: 250,
          };
        }
        return {
          acknowledged: true,
          success: true,
          changes: 1,
          rows: [],
        };
      }
      return {
        acknowledged: true,
        success: false,
        error: 'unexpected fallback delivery',
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
    nodeId: 'local-node',
  });
  executor.delay = async (delayMs) => {
    retryDelays.push(delayMs);
  };

  const result = await executor.executeOnPartition(
    partitionId,
    'UPDATE services SET status = ? WHERE service_id = ?',
    ['active', 'svc-1'],
    false,
  );

  t.equal(result.success, true);
  t.same(
    deliveries,
    [leaderAddress, leaderAddress],
    'non-priority system-table writes should keep the bounded same-address ' +
      'retry contract after a deferred transport failure',
  );
  t.equal(retryDelays.length, 1,
    'deferred failures should schedule one bounded partition retry');
  t.ok(retryDelays[0] >= 250,
    'deferred partition retry should honor retryAfterMs');
});

test('QueryExecutor - executeOnPartition bounds deferred control-plane write ' +
  'retries by the per-call timeout budget', async (t) => {
  const deliveries = [];
  const retryDelays = [];
  const partitionId = 'replica_operations-p1';
  const leaderAddress = 'leader-node/partition/replica_operations-p1-r1';

  const systemCache = {
    partitions: [
      {
        partition_id: partitionId,
        leader_node_id: 'leader-node',
        table_name: TABLES.REPLICA_OPERATIONS,
      },
    ],
    services: [
      {
        service_id: 'replica_operations-p1-r1',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'leader-node',
        raft_role: 'leader',
        address: leaderAddress,
        status: 'active',
      },
    ],
    get(type, key) {
      if (type === 'partitions') {
        return this.partitions.find((partition) =>
          partition.partition_id === key,
        ) || null;
      }
      return null;
    },
    filter(type, predicate) {
      if (type === 'services') {
        return this.services.filter(predicate);
      }
      if (type === 'partitions') {
        return this.partitions.filter(predicate);
      }
      return [];
    },
  };

  const messageRouter = {
    async deliver(address) {
      deliveries.push(address);
      return {
        acknowledged: true,
        success: false,
        error: 'Connection to node leader-node closed',
        errorCode: 'ROUTER_CONNECTION_CLOSED',
        deferRetry: true,
        retryAfterMs: 250,
      };
    },
  };

  const executor = new QueryExecutor({
    messageRouter,
    systemCache,
    nodeId: 'local-node',
  });
  executor.delay = async (delayMs) => {
    retryDelays.push(delayMs);
  };

  const result = await executor.executeOnPartition(
    partitionId,
    'UPDATE replica_operations SET status = ? WHERE operation_id = ?',
    ['active', 'op-1'],
    false,
    false,
    false,
    {
      timeoutMs: 200,
    },
  );

  t.equal(result.success, false,
    'bounded control-plane retries should surface the deferred failure once the budget is exhausted');
  t.same(
    deliveries,
    [leaderAddress],
    'per-call timeout budget should prevent extra retry attempts when retryAfterMs exceeds the remaining budget',
  );
  t.equal(retryDelays.length, 0,
    'per-call timeout budget should not sleep past the remaining execution budget');
  t.equal(result.deferRetry, true,
    'bounded timeout exhaustion should preserve defer-retry semantics for upstream owners');
  t.equal(result.retryAfterMs, 250,
    'bounded timeout exhaustion should preserve retryAfterMs for the next owner-level retry');
});
