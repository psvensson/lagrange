/**
 * Tests for Bootstrap API.
 * Requirements: 1.2, 7.2, 7.3, 7.4
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI, BootstrapStrategy} from '../../src/bootstrap/bootstrap-api.js';
import {BootstrapService} from '../../src/bootstrap/bootstrap-service.js';
import {
  BOOTSTRAP_API_HANDOFF_STATUS,
  BOOTSTRAP_API_ERROR,
  BOOTSTRAP_API_LOG_MSG,
  BOOTSTRAP_API_PROBE_REASON,
} from '../../src/bootstrap/bootstrap-api-constants.js';
import {
  BOOTSTRAP_PHASE,
  BOOTSTRAP_PIPELINE_ERROR_CODE,
} from '../../src/bootstrap/bootstrap-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CACHE_HYDRATION_TABLES} from '../../src/cache/cache-constants.js';
import {
  ENDPOINT_STATUS,
  SERVICE_STATUS,
  SERVICE_TYPE,
  STATE,
  TABLES,
  TRANSPORT_TYPE,
} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {BootstrapReadinessState} from '../../src/bootstrap/bootstrap-readiness-state.js';
import {BOOTSTRAP_READINESS_STAGE} from '../../src/bootstrap/bootstrap-readiness-ladder.js';
import {LIFECYCLE_REASON} from '../../src/bootstrap/lifecycle-controller-constants.js';
import {STARTUP_JOIN_MODE} from '../../src/bootstrap/rejoin-hints-constants.js';
import {STARTUP_RECOVERY_STAGE} from '../../src/bootstrap/startup-recovery-coordinator.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../../src/control-plane/control-plane-workload-profile.js';

// Initialize configuration and logging for tests
function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({
      node: {id: 'test-seed-node', restApiPort: 9999},
      logging: {level: 'error'},
    });
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
}

function createEmptySystemTableCache() {
  return {
    get() {
      return null;
    },
    getAll() {
      return [];
    },
    filter() {
      return [];
    },
    find() {
      return null;
    },
    getReadyNodes() {
      return [];
    },
  };
}

function createSatisfiedControlPlaneReadinessService() {
  const diagnostics = Object.freeze({
    publicationEpoch: 1,
    status: 'PUBLISHED',
    priorityPartitionSummary: Object.freeze({
      satisfied: true,
      requiredDistinctNodeCount: 3,
      readyEligibleNodeCount: 3,
      totalPriorityPartitionCount: 5,
      missingPartitionIds: Object.freeze([]),
      blockedPartitions: Object.freeze([]),
    }),
  });
  return {
    async getMembershipPublicationDiagnostics() {
      return diagnostics;
    },
    getMembershipPublicationDiagnosticsSync() {
      return diagnostics;
    },
  };
}

function createMutableControlPlaneReadinessService(initialDiagnostics) {
  let diagnostics = initialDiagnostics;
  return {
    setDiagnostics(nextDiagnostics) {
      diagnostics = nextDiagnostics;
    },
    async getMembershipPublicationDiagnostics() {
      return diagnostics;
    },
    getMembershipPublicationDiagnosticsSync() {
      return diagnostics;
    },
  };
}

function createPriorityRecoveryAuthorityControlPlaneReadinessService() {
  return {
    getPriorityControlPlaneRecoveryHealthSync() {
      return {
        healthy: false,
        reasonCode: LIFECYCLE_REASON.PRIORITY_CONTROL_PLANE_RECOVERY_PENDING,
        details: {
          recoveryProtocolState: 'publication_pending',
          priorityRecoveryReasonCodes: [
            CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
            CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
          ],
          targetParticipation: {
            nodeId: 'seed-node-1',
            state: 'recovery_pending_publish',
          },
        },
      };
    },
    getStartupAuthoritySnapshotSync() {
      return {
        state: 'seed_locally_ready_unpublished',
        ready: false,
        authorityAvailable: true,
        publication: {
          observationState: 'unpublished',
        },
        priorityPartition: {
          state: 'available',
          summary: {
            satisfied: false,
            missingPartitionIds: ['replica_operations-p1'],
          },
        },
        recoveryProtocol: {
          state: 'known',
          value: 'publication_pending',
        },
        targetParticipationDetail: {
          state: 'available',
          participation: {
            nodeId: 'seed-node-1',
            state: 'recovery_pending_publish',
          },
        },
        priorityRecoveryReasonCodes: [
          CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING,
          CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
        ],
        canonicalStartupNodeIds: ['seed-node-1'],
        failure: {
          state: 'none',
        },
        publicationObservationState: 'unpublished',
      };
    },
    getMembershipPublicationDiagnosticsSync() {
      return {
        publicationEpoch: 14,
        status: 'ACK_PENDING',
      };
    },
  };
}

test('BootstrapAPI - getReadyNodes does not duplicate seed node', async (t) => {
  initializeTestEnvironment();

  const now = Date.now();
  const validLease = now + 10000;

  // Create cache where seed node has valid lease
  const mockCache = {
    get: () => null,
    getAll: (tableName) => {
      if (tableName === TABLES.NODES) {
        return [
          {
            node_id: 'seed-node-1',
            connection_state: STATE.READY,
            ready_lease_expires_at: validLease, // Valid
          },
        ];
      }
      return [];
    },
    filter: (tableName, predicate) => {
      const all = mockCache.getAll(tableName);
      return all.filter(predicate);
    },
    find: () => null,
    getReadyNodes: function() {
      const currentTime = Date.now();
      return this.filter(TABLES.NODES, (node) => {
        return node.connection_state === STATE.READY &&
          node.ready_lease_expires_at &&
          node.ready_lease_expires_at > currentTime;
      }).map((n) => n.node_id);
    },
  };

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: mockCache,
    controlPlaneReadinessService: {
      getNodeReadinessSync(nodeId) {
        return nodeId === 'seed-node-1' ? {ready: true} : null;
      },
    },
  });

  await api.initialize(0, {listen: false});

  const readyNodes = api.getReadyNodes();

  // Should not duplicate seed node
  t.equal(readyNodes.filter((n) => n === 'seed-node-1').length, 1,
    'should not duplicate seed node');
  t.equal(readyNodes.length, 1, 'should have exactly 1 ready node');

  await api.shutdown();
});

test('BootstrapAPI - getReadyNodes does not synthesize seed readiness from empty cache alone',
  async (t) => {
  initializeTestEnvironment();

  // Create cache with no nodes
  const mockCache = {
    get: () => null,
    getAll: () => [],
    filter: () => [],
    find: () => null,
    getReadyNodes: () => [],
  };

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: mockCache,
  });

  await api.initialize(0, {listen: false});

  const readyNodes = api.getReadyNodes();

  t.same(
    readyNodes,
    [],
    'bootstrap should not advertise the seed as ready without explicit readiness evidence',
  );

  await api.shutdown();
});

test('BootstrapAPI - getReadyNodes does not treat repair-only seed readiness as bootstrap-ready',
  async (t) => {
    initializeTestEnvironment();

    const now = Date.now();
    const mockCache = {
      get: () => null,
      getAll: (tableName) => {
        if (tableName === TABLES.NODES) {
          return [
            {
              node_id: 'seed-node-1',
              connection_state: STATE.READY,
              ready_lease_expires_at: now + 10000,
              status: 'active',
            },
          ];
        }
        return [];
      },
      filter: (tableName, predicate) => {
        const all = mockCache.getAll(tableName);
        return all.filter(predicate);
      },
      find: () => null,
      getReadyNodes: () => ['seed-node-1'],
    };

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: mockCache,
      controlPlaneReadinessService: {
        getNodeReadinessSync(nodeId) {
          if (nodeId !== 'seed-node-1') {
            return null;
          }
          return {
            ready: false,
            dimensions: {
              repairEligible: true,
              controlPlaneRecoveryEligible: true,
            },
          };
        },
      },
    });

    await api.initialize(0, {listen: false});

    t.same(
      api.getReadyNodes(),
      [],
      'repair-only readiness should no longer make the seed appear bootstrap-ready',
    );

    await api.shutdown();
  });

test('BootstrapAPI - strict ready-node reads use published membership without seed fallback',
  async (t) => {
    initializeTestEnvironment();

    const now = Date.now();
    const mockCache = {
      get: () => null,
      getAll: (tableName) => {
        if (tableName === TABLES.NODES) {
          return [
            {
              node_id: 'seed-node-1',
              connection_state: STATE.READY,
              ready_lease_expires_at: now + 10000,
              status: 'active',
            },
            {
              node_id: 'other-node',
              connection_state: STATE.READY,
              ready_lease_expires_at: now + 10000,
              status: 'active',
            },
          ];
        }
        if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
          return [
            {
              publication_id: 'publication-14',
              publication_epoch: 14,
              status: 'PUBLISHED',
              published_active_node_ids: ['other-node'],
            },
          ];
        }
        return [];
      },
      filter: (tableName, predicate) => {
        const all = mockCache.getAll(tableName);
        return all.filter(predicate);
      },
      find: () => null,
      getReadyNodes: () => ['seed-node-1', 'other-node'],
    };

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: mockCache,
      controlPlaneReadinessService: {
        getNodeReadinessSync(nodeId) {
          return nodeId === 'seed-node-1' ? {ready: true} : null;
        },
      },
    });

    await api.initialize(0, {listen: false});

    t.same(
      api.getReadyNodes({requirePublishedMembership: true}),
      ['other-node'],
      'strict reads should only expose the published active-node set',
    );

    await api.shutdown();
  });

test('BootstrapAPI - cluster state marks active nodes from published membership only',
  async (t) => {
    initializeTestEnvironment();

    const now = Date.now();
    const mockCache = {
      get: () => null,
      getAll: (tableName) => {
        if (tableName === TABLES.NODES) {
          return [
            {
              node_id: 'seed-node-1',
              node_address: 'ws://seed',
              connection_state: STATE.READY,
              ready_lease_expires_at: now + 10000,
              status: 'active',
            },
            {
              node_id: 'other-node',
              node_address: 'ws://other',
              connection_state: STATE.READY,
              ready_lease_expires_at: now + 10000,
              status: 'active',
            },
          ];
        }
        if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
          return [
            {
              publication_id: 'publication-14',
              publication_epoch: 14,
              status: 'PUBLISHED',
              published_active_node_ids: ['other-node'],
            },
          ];
        }
        return [];
      },
      filter: () => [],
      find: () => null,
    };

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://seed',
      systemTableCache: mockCache,
    });

    await api.initialize(0, {listen: false});

    const clusterState = api.getClusterState();

    t.equal(
      clusterState.nodes.find((node) => node.nodeId === 'seed-node-1')?.status,
      'unknown',
      'seed node should not be forced active when it is absent from published membership',
    );
    t.equal(
      clusterState.nodes.find((node) => node.nodeId === 'other-node')?.status,
      'active',
      'published members should remain active in cluster state',
    );

    await api.shutdown();
  });

test('BootstrapAPI - getReadyNodes requires canonical websocket endpoint visibility for non-seed nodes',
  async (t) => {
    initializeTestEnvironment();

    const now = Date.now();
    const validLease = now + 10000;
    const mockCache = {
      get: () => null,
      getAll: (tableName) => {
        if (tableName === TABLES.NODES) {
          return [
            {
              node_id: 'seed-node-1',
              status: 'active',
              connection_state: STATE.READY,
              ready_lease_expires_at: validLease,
            },
            {
              node_id: 'node-2',
              status: 'active',
              connection_state: STATE.READY,
              ready_lease_expires_at: validLease,
            },
            {
              node_id: 'node-3',
              status: 'active',
              connection_state: STATE.READY,
              ready_lease_expires_at: validLease,
            },
          ];
        }
        if (tableName === TABLES.NODE_ENDPOINTS) {
          return [{
            endpoint_id: 'node-3-ws',
            node_id: 'node-3',
            transport_type: TRANSPORT_TYPE.WEBSOCKET,
            status: ENDPOINT_STATUS.ACTIVE,
            address: 'ws://node-3:8082',
          }];
        }
        return [];
      },
      filter: (tableName, predicate) => {
        const all = mockCache.getAll(tableName);
        return all.filter(predicate);
      },
      find: () => null,
      getReadyNodes: () => ['seed-node-1', 'node-2', 'node-3'],
    };

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: mockCache,
      controlPlaneReadinessService: {
        getNodeReadinessSync(nodeId) {
          return nodeId === 'seed-node-1' ? {ready: true} : null;
        },
      },
    });

    await api.initialize(0, {listen: false});

    const readyNodes = api.getReadyNodes();

    t.same(
      readyNodes.sort(),
      ['node-3', 'seed-node-1'],
      'non-seed nodes should need canonical websocket endpoints before bootstrap advertises them as ready',
    );

    await api.shutdown();
  });


test('BootstrapAPI - buildSystemTableSnapshots includes node_endpoints', async (t) => {
  initializeTestEnvironment();

  // Create a mock system table cache with node_endpoints data
  // Validates: Requirements 6.10, 8.1 - node_endpoints table included in bootstrap snapshots
  const mockSystemTableCache = {
    data: {
      nodes: [
        {node_id: 'node-1', node_address: 'ws://localhost:8080', status: 'active'},
      ],
      partitions: [
        {partition_id: 'p1', table_name: 'nodes'},
      ],
      services: [
        {service_id: 's1', service_type: 'partition', partition_id: 'p1', node_id: 'node-1'},
      ],
      tables: [
        {table_id: 'nodes', table_name: 'nodes', schema: '{}'},
      ],
      message_groups: [
        {group_id: 'mg-1', group_name: 'message_group_1', replica_count: 3},
      ],
      replica_operations: [],
      indices: [],
      config: [],
      logs: [],
      live_queries: [],
      contexts: [],
      code: [],
      node_endpoints: [
        {
          endpoint_id: 'ep-1',
          node_id: 'node-1',
          transport_type: 'ws',
          address: 'ws://localhost:8080',
          priority: 0,
          metadata: '{}',
          status: 'active',
          created_at: Date.now(),
          updated_at: Date.now(),
        },
        {
          endpoint_id: 'ep-2',
          node_id: 'node-1',
          transport_type: 'nats',
          address: 'nats://localhost:4222',
          priority: 1,
          metadata: '{}',
          status: 'active',
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      ],
    },
    getAll(table) {
      return this.data[table] || [];
    },
    getReadyNodes() {
      return [];
    },
  };

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: mockSystemTableCache,
  });

  await api.initialize(0, {listen: false});

  // Call buildSystemTableSnapshots
  const snapshots = api.buildSystemTableSnapshots();

  // Verify node_endpoints is present and is an array
  t.ok(snapshots, 'should return snapshots object');
  t.ok(Array.isArray(snapshots.node_endpoints), 'node_endpoints should be an array');

  // Verify node_endpoints data is correct
  t.equal(snapshots.node_endpoints.length, 2, 'should have 2 node endpoints');
  t.equal(snapshots.node_endpoints[0].endpoint_id, 'ep-1',
    'should have correct endpoint_id');
  t.equal(snapshots.node_endpoints[0].transport_type, 'ws',
    'should have correct transport_type');
  t.equal(snapshots.node_endpoints[1].transport_type, 'nats',
    'should have correct transport_type for second endpoint');

  await api.shutdown();
});

test('BootstrapAPI - handleBootstrapRequest includes node_endpoints in snapshots', async (t) => {
  initializeTestEnvironment();

  // Create a mock system table cache with node_endpoints data
  // Validates: Requirements 6.10, 8.1 - node_endpoints included in bootstrap response
  const mockCache = {
    get() {
      return null;
    },
    getAll(tableName) {
      if (tableName === TABLES.NODES) {
        return [{node_id: 'seed-node-1', node_address: 'ws://localhost:8080'}];
      }
      if (tableName === TABLES.PARTITIONS) {
        return [{
          partition_id: 'p1',
          table_name: 'nodes',
          leader_node_id: 'seed-node-1',
        }];
      }
      if (tableName === TABLES.SERVICES) {
        return [
          {
            service_id: 'partition-leader',
            service_type: SERVICE_TYPE.PARTITION,
            partition_id: 'p1',
            node_id: 'seed-node-1',
            address: 'seed-node-1/partition/partition-leader',
            raft_role: RAFT_ROLE.LEADER,
            status: SERVICE_STATUS.ACTIVE,
          },
          {
            service_id: 'message-group-leader',
            service_type: SERVICE_TYPE.MESSAGE_GROUP,
            group_id: 'mg1',
            node_id: 'seed-node-1',
            address: 'seed-node-1/message-group/message-group-leader',
            raft_role: RAFT_ROLE.LEADER,
            status: SERVICE_STATUS.ACTIVE,
          },
        ];
      }
      if (tableName === TABLES.TABLES) {
        return [{table_id: 't1', table_name: 'nodes'}];
      }
      if (tableName === TABLES.MESSAGE_GROUPS) {
        return [{group_id: 'mg1', leader_node_id: 'seed-node-1'}];
      }
      if (tableName === TABLES.NODE_ENDPOINTS) {
        return [
          {
            endpoint_id: 'ep-seed-1',
            node_id: 'seed-node-1',
            transport_type: 'ws',
            address: 'ws://localhost:8080',
            priority: 0,
            metadata: '{}',
            status: 'active',
            created_at: Date.now(),
            updated_at: Date.now(),
          },
        ];
      }
      return [];
    },
    filter() {
      return [];
    },
    find() {
      return null;
    },
    getReadyNodes() {
      return [];
    },
  };

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'http://localhost:8080',
    wsPort: 9090,
    systemTableCache: mockCache,
    messageGroupServices: new Map(),
  });

  await api.initialize(0, {listen: false});

  const response = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {
      nodeId: '550e8400-e29b-41d4-a716-446655440000',
      nodeAddress: 'ws://localhost:9090',
    },
  });

  t.equal(response.statusCode, 200, 'should return 200');
  const body = JSON.parse(response.body);

  t.equal(body.success, true, 'should return success');
  t.ok(body.systemTableSnapshots, 'should include systemTableSnapshots');
  t.ok(Array.isArray(body.systemTableSnapshots.node_endpoints),
    'node_endpoints should be an array in bootstrap response');
  t.equal(body.systemTableSnapshots.node_endpoints.length, 1,
    'should have 1 node endpoint in snapshot');
  t.equal(body.systemTableSnapshots.node_endpoints[0].endpoint_id, 'ep-seed-1',
    'should have correct endpoint_id in bootstrap response');
  t.equal(body.systemTableSnapshots.node_endpoints[0].transport_type, 'ws',
    'should have correct transport_type in bootstrap response');

  await api.shutdown();
});

test('BootstrapAPI - handleBootstrapRequest includes latency topology hints',
  async (t) => {
    initializeTestEnvironment();

    const mockCache = {
      get() {
        return null;
      },
      getAll(tableName) {
        if (tableName === TABLES.NODES) {
          return [{node_id: 'seed-node-1', node_address: 'ws://localhost:8080'}];
        }
        if (tableName === TABLES.PARTITIONS) {
          return [{
            partition_id: 'p1',
            table_name: 'nodes',
            leader_node_id: 'seed-node-1',
          }];
        }
        if (tableName === TABLES.SERVICES) {
          return [
            {
              service_id: 'partition-leader',
              service_type: SERVICE_TYPE.PARTITION,
              partition_id: 'p1',
              node_id: 'seed-node-1',
              address: 'seed-node-1/partition/partition-leader',
              raft_role: RAFT_ROLE.LEADER,
              status: SERVICE_STATUS.ACTIVE,
            },
            {
              service_id: 'message-group-leader',
              service_type: SERVICE_TYPE.MESSAGE_GROUP,
              group_id: 'mg1',
              node_id: 'seed-node-1',
              address: 'seed-node-1/message-group/message-group-leader',
              raft_role: RAFT_ROLE.LEADER,
              status: SERVICE_STATUS.ACTIVE,
            },
          ];
        }
        if (tableName === TABLES.TABLES) {
          return [{table_id: 't1', table_name: 'nodes'}];
        }
        if (tableName === TABLES.MESSAGE_GROUPS) {
          return [{group_id: 'mg1', leader_node_id: 'seed-node-1'}];
        }
        if (tableName === TABLES.LATENCY_GROUPS) {
          return [
            {group_id: 'g-1', representative_node_id: 'seed-node-1'},
            {group_id: 'g-2', representative_node_id: 'seed-node-2'},
          ];
        }
        if (tableName === TABLES.INTER_GROUP_LATENCIES) {
          return [
            {
              source_group_id: 'g-1',
              target_group_id: 'g-2',
              latency_ms: 42,
              sample_count: 3,
            },
          ];
        }
        return [];
      },
      filter() {
        return [];
      },
      find() {
        return null;
      },
      getReadyNodes() {
        return [];
      },
    };

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'http://localhost:8080',
      wsPort: 9090,
      systemTableCache: mockCache,
      messageGroupServices: new Map(),
    });

    await api.initialize(0, {listen: false});

    const response = await api.getFastify().inject({
      method: 'POST',
      url: '/bootstrap',
      payload: {
        nodeId: '550e8400-e29b-41d4-a716-446655440123',
        nodeAddress: 'ws://localhost:9090',
      },
    });

    t.equal(response.statusCode, 200, 'should return 200');
    const body = JSON.parse(response.body);

    t.ok(body.latencyTopologyHints, 'should include latencyTopologyHints');
    t.equal(body.latencyTopologyHints.suggestedGroupId, null,
      'should include suggestedGroupId');
    t.equal(body.latencyTopologyHints.groupCount, 2,
      'should include latency group count');
    t.equal(body.latencyTopologyHints.interGroupEdgeCount, 1,
      'should include inter-group edge count');
    t.equal(body.latencyTopologyHints.propagationMode, 'safe',
      'should include configured propagation mode');
    t.ok(body.latencyTopologyHints.timestamp > 0,
      'should include topology hint timestamp');

    await api.shutdown();
  });
