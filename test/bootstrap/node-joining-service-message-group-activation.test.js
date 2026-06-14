/**
 * Tests for Node Joining Service.
 * Requirements: 7.8, 7.10, 7.11, 7.14
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  NodeJoiningService,
  JoiningPhase,
} from '../../src/bootstrap/node-joining-service.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy,
} from '../../src/bootstrap/message-group-assignment.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {NodeService} from '../../src/node/node-service.js';
import {
  initializeTestEnvironment,
} from './node-joining-service-test-support.js';
import {PartitionService} from '../../src/partition/partition-service.js';
import {CACHE_HYDRATION_TABLES} from '../../src/cache/cache-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ReplicaHandlerSetup} from '../../src/bootstrap/shared/replica-handler-setup.js';
import {
} from '../../src/bootstrap/shared/partition-service-activation.js';
import {
} from '../../src/control-plane/control-plane-kernel-ingress.js';
import {
} from '../../src/bootstrap/join-session-store.js';
import {
} from '../../src/bootstrap/node-joining-constants.js';
import {
} from '../../src/control-plane/membership-lifecycle-controller.js';
import {
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
} from '../../src/control-plane/owner-contract-outcome.js';
import {
} from '../../src/control-plane/control-plane-constants.js';
import {
} from '../../src/query/query-constants.js';
import {
} from '../../src/bootstrap/bootstrap-constants.js';
import {
} from '../../src/bootstrap/join-promotion-state-owner.js';
import {
  COLUMN,
  SERVICE_TYPE,
  SERVICE_STATUS,
  STATE,
  TABLES,
} from '../../src/constants/index.js';
import {META_SERVICE_ID} from '../../src/constants/wasm-meta.js';
import {URL} from 'url';

const JOIN_ACTIVATION_CONTROL_PLANE_UPSERT_OPTION =
  'preferControlPlaneUpsert';

test('NodeJoiningService - blocking authoritative backfill uses critical delivery priority',
  async (t) => {
    initializeTestEnvironment();

    const cache = new SystemTableCache();
    const originalGetNodeService = NodeService.getInstance;

    try {
      NodeService.getInstance = () => ({
        getSystemTableCache() {
          return cache;
        },
      });

      const service = new NodeJoiningService({
        nodeId: 'joining-node-backfill-critical',
        nodeAddress: 'ws://localhost:9090',
        seedNodeAddress: 'http://localhost:8080',
      });

      const routedQueryOptions = [];
      const replicaDeliveries = [];
      service.messageRouter = {
        getOutboundPressureSummary() {
          return {
            backpressured: false,
            saturatedNodeCount: 0,
            totalPending: 0,
            maxPendingUtilization: 0,
          };
        },
        async deliver(address, payload, options) {
          replicaDeliveries.push({address, payload, options});
          return {
            acknowledged: true,
            success: true,
            rows: [],
          };
        },
      };
      service.cdcIntegrationService = {
        sqlQueryEngine: {
          async executeQuery(sql, params, options) {
            routedQueryOptions.push(options);
            if (sql === `SELECT * FROM ${TABLES.SERVICE_ENDPOINTS}`) {
              return {
                success: true,
                rows: [],
              };
            }
            return {success: true, rows: []};
          },
          getTablePartitions(tableName) {
            if (tableName === TABLES.SERVICE_ENDPOINTS) {
              return [{partition_id: 'service_endpoints-p1'}];
            }
            return [];
          },
          queryExecutor: {
            getRoutablePartitionServices(partitionId) {
              if (partitionId !== 'service_endpoints-p1') {
                return [];
              }
              return [
                {
                  service_id: 'service_endpoints-p1-r1',
                  partition_id: partitionId,
                  service_type: SERVICE_TYPE.PARTITION,
                  status: SERVICE_STATUS.ACTIVE,
                  address: 'seed/partition/service_endpoints-p1-r1',
                },
                {
                  service_id: 'service_endpoints-p1-r2',
                  partition_id: partitionId,
                  service_type: SERVICE_TYPE.PARTITION,
                  status: SERVICE_STATUS.ACTIVE,
                  address: 'seed/partition/service_endpoints-p1-r2',
                },
              ];
            },
          },
        },
      };

      await service.backfillPropagatedCacheTablesFromAuthoritativeState([
        TABLES.SERVICE_ENDPOINTS,
      ]);

      t.equal(
        routedQueryOptions[0]?.deliveryPriority,
        'critical',
        'blocking backfill should route the authoritative SQL read with critical delivery priority',
      );
      t.equal(
        routedQueryOptions[0]?.timeoutMs,
        30000,
        'blocking backfill should use the join leadership timeout budget for authoritative reads',
      );
      t.same(
        replicaDeliveries.map(({options}) => options?.deliveryPriority),
        ['critical', 'critical'],
        'blocking backfill replica fanout should use critical delivery priority',
      );
    } finally {
      NodeService.getInstance = originalGetNodeService;
    }
  });

test('NodeJoiningService - pressure-degraded backfill skips replica fanout',
  async (t) => {
    initializeTestEnvironment();

    const cache = new SystemTableCache();
    const originalGetNodeService = NodeService.getInstance;

    try {
      NodeService.getInstance = () => ({
        getSystemTableCache() {
          return cache;
        },
      });

      const service = new NodeJoiningService({
        nodeId: 'joining-node-backfill-pressure',
        nodeAddress: 'ws://localhost:9090',
        seedNodeAddress: 'http://localhost:8080',
      });

      const replicaDeliveries = [];
      service.messageRouter = {
        getOutboundPressureSummary() {
          return {
            backpressured: true,
            saturatedNodeCount: 1,
            totalPending: 48,
            maxPendingUtilization: 0.75,
          };
        },
        async deliver(address, payload, options) {
          replicaDeliveries.push({address, payload, options});
          return {
            acknowledged: true,
            success: true,
            rows: [],
          };
        },
      };
      service.cdcIntegrationService = {
        sqlQueryEngine: {
          async executeQuery(sql, params, options) {
            t.equal(
              options?.deliveryPriority,
              'critical',
              'pressure-degraded blocking backfill should keep the routed read on the critical lane',
            );
            return {
              success: true,
              rows: [],
            };
          },
          getTablePartitions(tableName) {
            if (tableName === TABLES.SERVICE_ENDPOINTS) {
              return [{partition_id: 'service_endpoints-p1'}];
            }
            return [];
          },
          queryExecutor: {
            getRoutablePartitionServices(partitionId) {
              if (partitionId !== 'service_endpoints-p1') {
                return [];
              }
              return [
                {
                  service_id: 'service_endpoints-p1-r1',
                  partition_id: partitionId,
                  service_type: SERVICE_TYPE.PARTITION,
                  status: SERVICE_STATUS.ACTIVE,
                  address: 'seed/partition/service_endpoints-p1-r1',
                },
                {
                  service_id: 'service_endpoints-p1-r2',
                  partition_id: partitionId,
                  service_type: SERVICE_TYPE.PARTITION,
                  status: SERVICE_STATUS.ACTIVE,
                  address: 'seed/partition/service_endpoints-p1-r2',
                },
              ];
            },
          },
        },
      };

      await service.backfillPropagatedCacheTablesFromAuthoritativeState([
        TABLES.SERVICE_ENDPOINTS,
      ]);

      t.equal(
        replicaDeliveries.length,
        0,
        'pressure-degraded authoritative backfill should avoid full replica fanout',
      );
    } finally {
      NodeService.getInstance = originalGetNodeService;
    }
  });

test('NodeJoiningService - registerNodeInCluster seeds local discovery-critical cache rows',
  async (t) => {
    initializeTestEnvironment();

    const cache = new SystemTableCache();
    const originalGetNodeService = NodeService.getInstance;

    try {
      NodeService.getInstance = () => ({
        getSystemTableCache() {
          return cache;
        },
      });

      const service = new NodeJoiningService({
        nodeId: 'join-cache-seed-node',
        nodeAddress: 'ws://localhost:9090',
        seedNodeAddress: 'http://localhost:8080',
        wsPort: 9090,
      });

      service.cdcIntegrationService = {
        upsertSystemTableRow: async () => ({success: true}),
        sqlQueryEngine: {},
      };
      service.getNodeStorageBudgetService = () => ({
        resolveBudgetRow: (nodeRow) => ({
          budgetRow: {
            ...nodeRow,
            [COLUMN.STORAGE_BUDGET_BYTES]: 1024,
            [COLUMN.STORAGE_BUDGET_SOURCE]: 'test',
          },
          resolution: {
            isValid: true,
            budgetBytes: 1024,
            source: 'test',
            diskBytes: 1024,
          },
        }),
      });
      service.sendControlPlaneNodeStateUpdate = async () => {
        throw new Error('legacy node-state owner path should not be used');
      };

      await service.registerNodeInCluster();

      t.ok(
        cache.get(TABLES.NODES, 'join-cache-seed-node'),
        'join should seed the local nodes cache row',
      );
      t.equal(
        cache.get(TABLES.NODES, 'join-cache-seed-node')?.[COLUMN.CONNECTION_STATE],
        STATE.CONNECTED,
        'join should seed the local nodes cache with the connected admission state',
      );
      t.ok(
        cache.get(TABLES.NODE_ENDPOINTS, 'ep-join-cache-seed-node-ws'),
        'join should seed the local node_endpoints cache row',
      );
      t.equal(service.hasPublishedLocalServiceEndpoints(), true,
        'join should expose local endpoint publication from cached service_endpoints rows');
      t.same(
        cache.filter(TABLES.SERVICE_ENDPOINTS, (row) =>
          row[COLUMN.NODE_ID] === 'join-cache-seed-node').map((row) =>
          row[COLUMN.SERVICE_ID]).sort(),
        [
          META_SERVICE_ID.ADMIN_META,
          META_SERVICE_ID.POSTGRES_WIRE,
          META_SERVICE_ID.WASM_META,
        ],
        'join should seed built-in service_endpoints in the local cache',
      );
    } finally {
      NodeService.getInstance = originalGetNodeService;
    }
  });

test('NodeJoiningService - full join with MOVE_REPLICA', async (t) => {
  initializeTestEnvironment();

  // Configure faster Raft elections for testing
  const config = ConfigurationManager.getInstance();
  config.config.raft = {
    ...config.config.raft,
    electionTimeoutMinMs: 25,
    electionTimeoutMaxMs: 50,
    heartbeatIntervalMs: 10,
  };

  test('NodeJoiningService - activates message-group rows from cache-visible endpoint publication without phase flag truth',
    async (t) => {
      initializeTestEnvironment();

      const originalGetNodeService = NodeService.getInstance;
      const cache = new SystemTableCache();
      cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
        endpoint_id: 'postgres-wire-endpoint-join-activation-node',
        service_id: META_SERVICE_ID.POSTGRES_WIRE,
        node_id: 'join-activation-node',
        protocol: 'tcp',
        address: 'join-activation-node',
        port: 5432,
        metadata: '{}',
      });
      NodeService.getInstance = () => ({
        getSystemTableCache() {
          return cache;
        },
      });

      try {
        const service = new NodeJoiningService({
          nodeId: 'join-activation-node',
          nodeAddress: 'ws://localhost:9191',
          seedNodeAddress: 'ws://seed:8000',
        });
        const activated = [];

        service.messageGroupServiceHandler = {};
        service.messageRouter = {
          isRegistered: () => true,
        };
        service.messageGroupServices.set('mg-cache-r1', {
          groupId: 'mg-cache',
          unifiedAddress: 'join-activation-node/message-group/mg-cache-r1',
        });
        service.registerMessageGroupService = async (
          groupId,
          replicaId,
          replicaService,
          options,
        ) => {
          activated.push({groupId, replicaId, replicaService, options});
        };

        const activatedCount =
        await service.activateMessageGroupServiceRows();

        t.equal(activatedCount, 1,
          'activation should proceed once local service_endpoints rows are visible in cache');
        t.equal(activated.length, 1,
          'activation should register the visible replica');
        t.same(
          activated[0]?.options,
          {
            status: SERVICE_STATUS.ACTIVE,
            [JOIN_ACTIVATION_CONTROL_PLANE_UPSERT_OPTION]: true,
          },
          'activation should mark the replica service row active through the join-time control-plane upsert lane');
      } finally {
        NodeService.getInstance = originalGetNodeService;
      }
    });

  // Create system table cache with message group data
  // This triggers MOVE_REPLICA strategy when there are 2+ replicas on same node
  const systemTableCache = new SystemTableCache();

  // Add message group to cache - no message_groups table entry means no leader check
  // The services table entries are used for MOVE_REPLICA assignment

  // Add 3 replicas on the same node (seed-node-1) with leader role and addresses
  // This satisfies the leader readiness check
  systemTableCache.applySystemTableChange('services', 'INSERT', {
    id: 'mg-1-r1',
    service_id: 'mg-1-r1',
    replica_id: 'mg-1-r1',
    group_id: 'mg-1',
    node_id: 'seed-node-1',
    service_type: 'message_group',
    address: 'seed-node-1/message-group/mg-1-r1',
    raft_role: 'leader',
    status: 'active',
  });
  systemTableCache.applySystemTableChange('services', 'INSERT', {
    id: 'mg-1-r2',
    service_id: 'mg-1-r2',
    replica_id: 'mg-1-r2',
    group_id: 'mg-1',
    node_id: 'seed-node-1',
    service_type: 'message_group',
    address: 'seed-node-1/message-group/mg-1-r2',
    raft_role: 'follower',
    status: 'active',
  });
  systemTableCache.applySystemTableChange('services', 'INSERT', {
    id: 'mg-1-r3',
    service_id: 'mg-1-r3',
    replica_id: 'mg-1-r3',
    group_id: 'mg-1',
    node_id: 'seed-node-1',
    service_type: 'message_group',
    address: 'seed-node-1/message-group/mg-1-r3',
    raft_role: 'follower',
    status: 'active',
  });

  // Start a seed node API with the system table cache
  const seedApi = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: systemTableCache,
  });

  const httpPost = async (url, body) => {
    const u = new URL(url);
    const res = await seedApi.getFastify().inject({
      method: 'POST',
      url: u.pathname,
      payload: body,
    });
    return JSON.parse(res.payload);
  };

  let service = null;
  // Use random port to avoid conflicts
  const joiningNodeWsPort = 19091 + Math.floor(Math.random() * 1000);

  try {
    await seedApi.initialize(0, {listen: false});

    // Create joining service with wsPort for WebSocket server
    // Use short leadership timeout since mock peers can't respond
    service = new NodeJoiningService({
      nodeId: '550e8400-e29b-41d4-a716-446655440011',
      nodeAddress: `ws://localhost:${joiningNodeWsPort}`,
      seedNodeAddress: 'http://localhost:0',
      wsPort: joiningNodeWsPort, // Enable WebSocket server for self-connection
      httpPost,
      config: {
        httpTimeoutMs: 2000,
        leadershipWaitTimeoutMs: 500, // Short timeout - mock peers can't respond
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 50,
      },
    });

    // Mock the WebSocket connection to seed node (no real seed WS server in this test)
    service.phaseConnectWebSocket = async function() {
      // Initialize MessageRouter for local communication only
      const {MessageRouter} = await import('../../src/transport/message-router.js');
      this.messageRouter = new MessageRouter({
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        wsPort: this.wsPort,
      });
      this.messageRouter.setServiceNodeResolver((address) => {
        const match = address.match(/^([^/]+)\//);
        return match ? match[1] : null;
      });
      await this.messageRouter.initialize({startServer: true});
      this.transport = this.messageRouter;
    };
    service.triggerJoinReconciler = async function() {};

    // Mock phaseJoinExistingMessageGroup - it requires SQL engine which isn't available
    service.phaseJoinExistingMessageGroup = async function() {
      // Skip actual message group joining - just mark as complete
    };

    service.phaseWaitForLeadership = async () => {
      throw new Error('leadership timeout (test)');
    };

    const result = await service.join();

    // With mock peers that can't respond, leadership won't establish
    // But we can verify the assignment strategy was correct
    if (result.success) {
      t.equal(result.success, true, 'join should succeed');
      t.equal(service.getPhase(), JoiningPhase.COMPLETE, 'phase should be complete');
    } else {
      // Expected: leadership fails with mock peers, but verify strategy was correct
      t.equal(result.success, false, 'join fails with mock peers');
      t.ok(result.error.includes('leadership'), 'error should mention leadership');
    }

    // Verify the bootstrap response had correct MOVE_REPLICA strategy
    // This is available even if join failed
    t.ok(service.bootstrapResponse, 'should have bootstrap response');
    t.ok(
      service.bootstrapResponse.messageGroupAssignment.strategy ===
        AssignmentStrategy.MOVE_REPLICA,
      'should use MOVE_REPLICA strategy',
    );
    t.equal(
      service.bootstrapResponse.messageGroupAssignment.groupId,
      'mg-1',
      'should target existing group',
    );
  } finally {
    // Cleanup
    if (service) {
      await service.cleanup();
    }
    await seedApi.shutdown();
  }
});

test('NodeJoiningService - hasOperationalMessageGroup', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'test-node-1',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:8080',
  });

  // Initially no operational message group
  t.equal(service.hasOperationalMessageGroup(), false);
});

test('NodeJoiningService - cleanup on failure', async (t) => {
  initializeTestEnvironment();

  const service = new NodeJoiningService({
    nodeId: 'test-node-1',
    nodeAddress: 'ws://localhost:9090',
    seedNodeAddress: 'http://localhost:99999', // Invalid port
    config: {
      httpTimeoutMs: 1000,
    },
  });

  const result = await service.join();

  t.equal(result.success, false);
  t.equal(service.getPhase(), JoiningPhase.FAILED);
  t.equal(service.messageGroupServices.size, 0, 'should have cleaned up services');
  t.equal(service.transport, null, 'should have cleaned up transport');
});

test('NodeJoiningService - emits events', async (t) => {
  initializeTestEnvironment();

  // Configure faster Raft elections for testing
  const config = ConfigurationManager.getInstance();
  config.config.raft = {
    ...config.config.raft,
    electionTimeoutMinMs: 25,
    electionTimeoutMaxMs: 50,
    heartbeatIntervalMs: 10,
  };

  // Start a seed node API
  const seedApi = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    messageGroupServices: new Map(),
    systemTableCache: new SystemTableCache(),
  });

  const httpPost = async (url, body) => {
    const u = new URL(url);
    const res = await seedApi.getFastify().inject({
      method: 'POST',
      url: u.pathname,
      payload: body,
    });
    return JSON.parse(res.payload);
  };

  let service = null;
  // Use random port to avoid conflicts
  const joiningNodeWsPort = 19092 + Math.floor(Math.random() * 1000);

  try {
    await seedApi.initialize(0, {listen: false});

    service = new NodeJoiningService({
      nodeId: '550e8400-e29b-41d4-a716-446655440012',
      nodeAddress: `ws://localhost:${joiningNodeWsPort}`,
      seedNodeAddress: 'http://localhost:0',
      wsPort: joiningNodeWsPort, // Enable WebSocket server for self-connection
      httpPost,
      config: {
        httpTimeoutMs: 2000,
        leadershipWaitTimeoutMs: 5000,
        leadershipWaitInitialDelayMs: 10,
        leadershipWaitMaxDelayMs: 100,
      },
    });

    // Mock the WebSocket connection to seed node (no real seed WS server in this test)
    service.phaseConnectWebSocket = async function() {
      // Initialize MessageRouter for local communication only
      const {MessageRouter} = await import('../../src/transport/message-router.js');
      this.messageRouter = new MessageRouter({
        nodeId: this.nodeId,
        nodeAddress: this.nodeAddress,
        wsPort: this.wsPort,
      });
      this.messageRouter.setServiceNodeResolver((address) => {
        const match = address.match(/^([^/]+)\//);
        return match ? match[1] : null;
      });
      await this.messageRouter.initialize({startServer: true});
      this.transport = this.messageRouter;
    };
    service.triggerJoinReconciler = async function() {};
    service.phaseCreateSelfHostedMessageGroup = async function() {
      const replicaId = 'mg-join-r1';
      const unifiedAddress = `${this.nodeId}/message-group/${replicaId}`;
      this.messageGroupServices.set(replicaId, {
        groupId: 'mg-1',
        unifiedAddress,
        isLeaderReplica: () => true,
        getLeaderId: () => replicaId,
      });
      this.messageRouter.register(unifiedAddress, async () => ({acknowledged: true}));
    };
    service.phaseWaitForLeadership = async function() {};
    service.getLeaderMessageGroupService = function() {
      const firstService = this.messageGroupServices.values().next().value;
      return firstService || null;
    };

    // Mock phases that require system tables (not available in this unit test)
    service.phaseQuerySystemState = async function() {
      NodeService.getInstance().getSystemTableCache()
        .applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
          endpoint_id: `postgres-wire-endpoint-${this.nodeId}`,
          service_id: META_SERVICE_ID.POSTGRES_WIRE,
          node_id: this.nodeId,
          protocol: 'tcp',
          address: this.nodeId,
          port: 5432,
          metadata: '{}',
        });
    };
    service.initializeReplicaHandler = function() {};
    service.createCdcIntegrationService = function() {
      this.cdcIntegrationService = {
        upsertSystemTableRow: async () => ({success: true}),
        updateSystemTableRow: async () => ({success: true}),
        deleteSystemTableRow: async () => ({success: true}),
      };
      return this.cdcIntegrationService;
    };
    service.initializeControlPlaneService = async function() {};
    service.initializeRuntimeServiceHandler = function() {};
    service.signalReadyForReplicas = async function() {};
    service.activateMessageGroupServiceRows = async function() {};
    service.joinReadinessEvaluator
      .waitForCanonicalJoinReadinessConvergence = async function() {};

    const events = [];
    service.on('phaseStart', (data) => events.push({type: 'start', phase: data.phase}));
    service.on('phaseComplete', (data) => events.push({type: 'complete', phase: data.phase}));
    service.on('complete', () => events.push({type: 'joinComplete'}));

    await service.join();

    t.ok(events.length > 0, 'should emit events');
    t.ok(events.some((e) => e.type === 'start'), 'should emit phaseStart');
    t.ok(events.some((e) => e.type === 'complete'), 'should emit phaseComplete');
    t.ok(events.some((e) => e.type === 'joinComplete'), 'should emit complete');
  } finally {
    if (service) {
      await service.cleanup();
    }
    await seedApi.shutdown();
  }
});

test('NodeJoiningService - replica factory should preserve join mode from replica handler',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'test-node-join-factory',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });

    const cache = new SystemTableCache();
    let capturedCreatePartitionService = null;
    const originalReplicaHandlerCreate = ReplicaHandlerSetup.create;
    const originalGetNodeService = NodeService.getInstance;
    const originalInitialize = PartitionService.prototype.initialize;

    try {
      service.messageRouter = {registerHandler() {}, unregisterHandler() {}};
      service.transport = {unregister() {}};
      service.systemCacheHydrated = true;
      service.tablePolicyService = {};
      service.rebalanceCoordinator = {};
      service.createCdcIntegrationService = () => ({
        updateSystemTableRow: async () => true,
        upsertSystemTableRow: async () => true,
      });
      service.getLeaderMessageGroupService = () => null;

      NodeService.getInstance = () => ({
        getSystemTableCache() {
          return cache;
        },
      });

      PartitionService.prototype.initialize = async function() {};

      ReplicaHandlerSetup.create = ({createPartitionService}) => {
        capturedCreatePartitionService = createPartitionService;
        return {
          replicaHandler: {},
          replicaStateMachine: {},
        };
      };

      service.initializeReplicaHandler();

      t.equal(
        typeof capturedCreatePartitionService,
        'function',
        'should build a replica partition factory',
      );

      const partition = await capturedCreatePartitionService({
        partitionId: 'partition-1',
        tableId: 'table-1',
        tableName: null,
        schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true}]},
        keyRange: {start: null, end: null},
        replicaId: 'replica-1',
        replicaIds: ['replica-1'],
        peerAddresses: [],
        nodeId: 'test-node-join-factory',
        isJoiningExistingGroup: false,
      });

      t.equal(
        partition.isJoiningExistingGroup,
        false,
        'post-join partition creation should honor replica-handler join mode',
      );

      await partition.shutdown();
    } finally {
      ReplicaHandlerSetup.create = originalReplicaHandlerCreate;
      NodeService.getInstance = originalGetNodeService;
      PartitionService.prototype.initialize = originalInitialize;
    }
  });

test('NodeJoiningService - replica factory subscribes exactly the propagated cache tables',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'test-node-join-cache-sync',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });

    const cache = new SystemTableCache();
    const subscribedTables = [];
    const handshakeSubscriberIds = [];
    let capturedCreatePartitionService = null;
    const originalReplicaHandlerCreate = ReplicaHandlerSetup.create;
    const originalGetNodeService = NodeService.getInstance;
    const originalInitialize = PartitionService.prototype.initialize;
    const originalSubscribeToCDCWithHandshake =
      PartitionService.prototype.subscribeToCDCWithHandshake;

    try {
      service.messageRouter = {registerHandler() {}, unregisterHandler() {}};
      service.transport = {unregister() {}};
      service.systemCacheHydrated = true;
      service.tablePolicyService = {};
      service.rebalanceCoordinator = {};
      service.messageGroupServices = new Map([
        ['mg-1', {
          groupId: 'mg-1',
          initialized: true,
          isLeaderReplica: () => true,
          isMetadataIngressReady: () => true,
          getMetadataIngressReadiness: () => ({ready: true}),
          getLeaderId: () => null,
          subscribeToCDC: async (tableName) => {
            subscribedTables.push(tableName);
          },
        }],
      ]);
      service.createCdcIntegrationService = () => ({
        updateSystemTableRow: async () => true,
        upsertSystemTableRow: async () => true,
      });

      NodeService.getInstance = () => ({
        getSystemTableCache() {
          return cache;
        },
      });

      PartitionService.prototype.initialize = async function() {};
      PartitionService.prototype.subscribeToCDCWithHandshake =
        async function(_subscriber, options = {}) {
          handshakeSubscriberIds.push(options.subscriberId);
          return {
            subscriberId: options.subscriberId || 'sub-1',
            subscriptionEpoch: 1,
            catchup: {
              mode: 'none',
              bufferedEventsReplayed: 0,
            },
          };
        };

      ReplicaHandlerSetup.create = ({createPartitionService}) => {
        capturedCreatePartitionService = createPartitionService;
        return {
          replicaHandler: {},
          replicaStateMachine: {},
        };
      };

      service.initializeReplicaHandler();

      for (const tableName of CACHE_HYDRATION_TABLES) {
        await capturedCreatePartitionService({
          partitionId: `${tableName}-p1`,
          tableId: tableName,
          tableName,
          schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true}]},
          keyRange: {start: null, end: null},
          replicaId: `${tableName}-r1`,
          replicaIds: [`${tableName}-r1`],
          peerAddresses: [],
          nodeId: 'test-node-join-cache-sync',
          isJoiningExistingGroup: true,
        });
      }

      await capturedCreatePartitionService({
        partitionId: `${TABLES.LOGS}-p1`,
        tableId: TABLES.LOGS,
        tableName: TABLES.LOGS,
        schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true}]},
        keyRange: {start: null, end: null},
        replicaId: `${TABLES.LOGS}-r1`,
        replicaIds: [`${TABLES.LOGS}-r1`],
        peerAddresses: [],
        nodeId: 'test-node-join-cache-sync',
        isJoiningExistingGroup: true,
      });

      t.same(
        subscribedTables,
        CACHE_HYDRATION_TABLES,
        'join-time replica factory should subscribe every propagated cache table once',
      );
      t.equal(
        handshakeSubscriberIds.length,
        CACHE_HYDRATION_TABLES.length,
        'join-time replica factory should register one CDC handshake per propagated cache table',
      );
      t.notOk(
        subscribedTables.includes(TABLES.LOGS),
        'non-propagated tables must not join the default cache-sync subscriptions',
      );
    } finally {
      ReplicaHandlerSetup.create = originalReplicaHandlerCreate;
      NodeService.getInstance = originalGetNodeService;
      PartitionService.prototype.initialize = originalInitialize;
      PartitionService.prototype.subscribeToCDCWithHandshake =
        originalSubscribeToCDCWithHandshake;
    }
  });

test('NodeJoiningService - CDC propagation reuses captured ingress when operational selection churns',
  async (t) => {
    initializeTestEnvironment();

    const service = new NodeJoiningService({
      nodeId: 'test-node-join-cdc-propagation-fallback',
      nodeAddress: 'ws://localhost:9090',
      seedNodeAddress: 'http://localhost:8080',
    });

    const cache = new SystemTableCache();
    let capturedCreatePartitionService = null;
    let capturedSubscriber = null;
    let propagatedMessageGroupService = null;
    let propagatedEvent = null;
    const originalReplicaHandlerCreate = ReplicaHandlerSetup.create;
    const originalGetNodeService = NodeService.getInstance;
    const originalInitialize = PartitionService.prototype.initialize;
    const originalSubscribeToCDCWithHandshake =
      PartitionService.prototype.subscribeToCDCWithHandshake;

    try {
      service.messageRouter = {registerHandler() {}, unregisterHandler() {}};
      service.transport = {unregister() {}};
      service.systemCacheHydrated = true;
      service.tablePolicyService = {};
      service.rebalanceCoordinator = {};
      const preferredMessageGroupService = {
        groupId: 'mg-preferred',
        initialized: true,
        isLeaderReplica: () => false,
        getMetadataIngressReadiness: () => ({
          ready: false,
          reason: 'operational message-group ingress not ready',
          retryAfterMs: 25,
        }),
        resolveMetadataIngressForwardSelection: async () => ({
          localIngress: true,
          strictForwardRetryAfterMs: 25,
          targets: [],
          suppressedCount: 0,
        }),
        subscribeToCDC: async () => {},
      };
      service.messageGroupServices = new Map([
        ['mg-preferred', preferredMessageGroupService],
      ]);
      service.createCdcIntegrationService = () => ({
        updateSystemTableRow: async () => true,
        upsertSystemTableRow: async () => true,
      });
      service.propagatePartitionCDCEvent = async (messageGroupService, cdcEvent) => {
        propagatedMessageGroupService = messageGroupService;
        propagatedEvent = cdcEvent;
      };

      NodeService.getInstance = () => ({
        getSystemTableCache() {
          return cache;
        },
      });

      PartitionService.prototype.initialize = async function() {};
      PartitionService.prototype.subscribeToCDCWithHandshake =
        async function(subscriber, options = {}) {
          capturedSubscriber = subscriber;
          return {
            subscriberId: options.subscriberId || 'sub-1',
            subscriptionEpoch: 1,
            catchup: {
              mode: 'none',
              bufferedEventsReplayed: 0,
            },
          };
        };

      ReplicaHandlerSetup.create = ({createPartitionService}) => {
        capturedCreatePartitionService = createPartitionService;
        return {
          replicaHandler: {},
          replicaStateMachine: {},
        };
      };

      service.initializeReplicaHandler();

      await capturedCreatePartitionService({
        partitionId: `${TABLES.SQL_TRANSACTIONS}-p1`,
        tableId: TABLES.SQL_TRANSACTIONS,
        tableName: TABLES.SQL_TRANSACTIONS,
        schema: {columns: [{name: 'id', type: 'TEXT', primaryKey: true}]},
        keyRange: {start: null, end: null},
        replicaId: `${TABLES.SQL_TRANSACTIONS}-r1`,
        replicaIds: [`${TABLES.SQL_TRANSACTIONS}-r1`],
        peerAddresses: [],
        nodeId: 'test-node-join-cdc-propagation-fallback',
        isJoiningExistingGroup: true,
      });

      service.messageGroupServices = new Map();

      const cdcEvent = {
        tableName: TABLES.SQL_TRANSACTIONS,
        operation: 'UPSERT',
        data: {transaction_id: 'tx-1'},
      };
      await capturedSubscriber(cdcEvent);

      t.equal(
        propagatedMessageGroupService,
        preferredMessageGroupService,
        'join CDC propagation should reuse the captured ingress when operational selection temporarily loses the service',
      );
      t.same(
        propagatedEvent,
        cdcEvent,
        'join CDC propagation should forward the original CDC event through the captured ingress',
      );
    } finally {
      ReplicaHandlerSetup.create = originalReplicaHandlerCreate;
      NodeService.getInstance = originalGetNodeService;
      PartitionService.prototype.initialize = originalInitialize;
      PartitionService.prototype.subscribeToCDCWithHandshake =
        originalSubscribeToCDCWithHandshake;
    }
  });
