/**
 * Tests for duplicate message group replica assignment bug.
 *
 * Bug: When multiple nodes join in quick succession, they can both be assigned
 * the same message group replica (e.g., mg-1-r1) because the bootstrap API
 * reads from the live messageGroupServices map which doesn't update when
 * a replica is moved to a new node.
 *
 * Root cause: The getMessageGroups() method reads from messageGroupServices
 * which only contains the seed node's local services. When node 2 joins and
 * takes over mg-1-r1, the seed node's messageGroupServices still shows all
 * 3 replicas on the seed node. When node 3 joins, it sees the same stale
 * state and gets assigned the same replica.
 *
 * The fix must use the system cache (fed by CDC) as the source of truth,
 * not a secondary cache or in-memory tracking.
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI, BootstrapStrategy} from '../../src/bootstrap/bootstrap-api.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SERVICE_STATUS, SERVICE_TYPE} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';

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

/**
 * This test replicates the bug where two joining nodes get assigned the same
 * message group replica because the bootstrap API reads from stale data.
 *
 * Expected behavior: once the first MOVE_REPLICA handoff has converged,
 * the next joining node should get a DIFFERENT replica.
 * Bug behavior: stale bootstrap topology can still recycle the first replica.
 */
test('BootstrapAPI - consecutive joins must assign different replicas after the first handoff converges', async (t) => {
  initializeTestEnvironment();

  // Simulate seed node with 3 message group replicas all on the same node
  // This is the initial state after seed node bootstrap
  const mockMessageGroupServices = new Map();
  mockMessageGroupServices.set('mg-1-r1', {
    groupId: 'mg-1',
    replicaId: 'mg-1-r1',
    nodeId: 'seed-node-1',
    unifiedAddress: 'seed-node-1/message-group/mg-1-r1',
  });
  mockMessageGroupServices.set('mg-1-r2', {
    groupId: 'mg-1',
    replicaId: 'mg-1-r2',
    nodeId: 'seed-node-1',
    unifiedAddress: 'seed-node-1/message-group/mg-1-r2',
  });
  mockMessageGroupServices.set('mg-1-r3', {
    groupId: 'mg-1',
    replicaId: 'mg-1-r3',
    nodeId: 'seed-node-1',
    unifiedAddress: 'seed-node-1/message-group/mg-1-r3',
  });

  // System cache that will be updated via CDC when services table changes
  const systemCacheData = {
    services: [
      {
        service_id: 'mg-1-r1',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: 'seed-node-1',
        group_id: 'mg-1',
        replica_id: 'mg-1-r1',
        address: 'seed-node-1/message-group/mg-1-r1',
        raft_role: RAFT_ROLE.FOLLOWER,
        status: SERVICE_STATUS.ACTIVE,
      },
      {
        service_id: 'mg-1-r2',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: 'seed-node-1',
        group_id: 'mg-1',
        replica_id: 'mg-1-r2',
        address: 'seed-node-1/message-group/mg-1-r2',
        raft_role: RAFT_ROLE.FOLLOWER,
        status: SERVICE_STATUS.ACTIVE,
      },
      {
        service_id: 'mg-1-r3',
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: 'seed-node-1',
        group_id: 'mg-1',
        replica_id: 'mg-1-r3',
        address: 'seed-node-1/message-group/mg-1-r3',
        raft_role: RAFT_ROLE.FOLLOWER,
        status: SERVICE_STATUS.ACTIVE,
      },
    ],
    nodes: [],
    partitions: [],
    tables: [],
    message_groups: [],
    replica_operations: [],
    indices: [],
    config: [],
    logs: [],
    live_queries: [],
    contexts: [],
    code: [],
    node_endpoints: [],
  };

  const mockSystemTableCache = {
    getAll(table) {
      return systemCacheData[table] || [];
    },
    get(table, id) {
      const items = systemCacheData[table] || [];
      return items.find((item) => item.service_id === id || item.node_id === id);
    },
    filter(table, predicate) {
      return (systemCacheData[table] || []).filter(predicate);
    },
    getReadyNodes() {
      return ['seed-node-1'];
    },
    // Simulate CDC update - this is how the real system works
    applyServiceUpdate(serviceId, nodeId, address) {
      const service = systemCacheData.services.find((s) => s.service_id === serviceId);
      if (service) {
        service.node_id = nodeId;
        service.address = address;
      }
    },
  };

  const api = new BootstrapAPI({
    seedNodeId: 'seed-node-1',
    seedNodeAddress: 'ws://localhost:8080',
    systemTableCache: mockSystemTableCache,
    messageGroupServices: mockMessageGroupServices,
  });

  await api.initialize(0, {listen: false});

  // First node joins - should get mg-1-r1 (or any replica)
  const node2Id = '550e8400-e29b-41d4-a716-446655440002';
  const response1 = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeId: node2Id, nodeAddress: 'ws://localhost:9090'},
  });

  t.equal(response1.statusCode, 200, 'first bootstrap should succeed');
  const body1 = JSON.parse(response1.body);
  t.equal(body1.messageGroupAssignment.strategy, BootstrapStrategy.MOVE_REPLICA,
    'should use MOVE_REPLICA strategy');
  const firstAssignedReplica = body1.messageGroupAssignment.replicaToMove;
  t.ok(firstAssignedReplica, 'should assign a replica to first node');

  // A second bootstrap should still succeed while the first MOVE_REPLICA
  // reservation is open because the canonical admission owner excludes the
  // reserved replica and selects a different legal assignment.
  const node3Id = '550e8400-e29b-41d4-a716-446655440003';
  const response2 = await api.getFastify().inject({
    method: 'POST',
    url: '/bootstrap',
    payload: {nodeId: node3Id, nodeAddress: 'ws://localhost:9091'},
  });

  t.equal(response2.statusCode, 200,
    'bootstrap should keep progressing while the first MOVE_REPLICA reservation is open');
  const body2 = JSON.parse(response2.body);
  t.equal(body2.messageGroupAssignment.strategy, BootstrapStrategy.MOVE_REPLICA,
    'second bootstrap should still prefer MOVE_REPLICA when another seed replica is available');
  const secondAssignedReplica = body2.messageGroupAssignment.replicaToMove;
  t.ok(secondAssignedReplica, 'second bootstrap should reserve a replica');
  t.not(firstAssignedReplica, secondAssignedReplica,
    'second bootstrap must not reuse the first in-flight replica reservation');

  const secondAssignmentId =
    body2.messageGroupAssignment.assignmentId;
  t.ok(
    typeof secondAssignmentId === 'string' && secondAssignmentId.length > 0,
    'second bootstrap should persist a distinct reservation token',
  );
  t.not(
    body1.messageGroupAssignment.assignmentId,
    secondAssignmentId,
    'second bootstrap should receive a different reservation token',
  );

  // Simulate convergence of the first handoff:
  // - canonical services ownership moves to the target node
  // - the source replica disappears locally
  // - the target node becomes ready
  mockSystemTableCache.applyServiceUpdate(
    firstAssignedReplica,
    node2Id,
    `${node2Id}/message-group/${firstAssignedReplica}`,
  );
  mockMessageGroupServices.delete(firstAssignedReplica);
  systemCacheData.nodes.push({
    node_id: node2Id,
    status: SERVICE_STATUS.ACTIVE,
    connection_state: 'ready',
    last_heartbeat: Date.now(),
    ready_lease_expires_at: Date.now() + 60_000,
  });

  await api.shutdown();
});

/**
 * This test verifies that the bootstrap API reads from the system cache
 * (the single source of truth) rather than the stale messageGroupServices map.
 */
test('BootstrapAPI - getMessageGroups should prefer system cache over stale services',
  async (t) => {
    initializeTestEnvironment();

    // Stale messageGroupServices - shows all replicas on seed node
    const staleMessageGroupServices = new Map();
    staleMessageGroupServices.set('mg-1-r1', {
      groupId: 'mg-1',
      replicaId: 'mg-1-r1',
      nodeId: 'seed-node-1',
      unifiedAddress: 'seed-node-1/message-group/mg-1-r1',
    });
    staleMessageGroupServices.set('mg-1-r2', {
      groupId: 'mg-1',
      replicaId: 'mg-1-r2',
      nodeId: 'seed-node-1',
      unifiedAddress: 'seed-node-1/message-group/mg-1-r2',
    });
    staleMessageGroupServices.set('mg-1-r3', {
      groupId: 'mg-1',
      replicaId: 'mg-1-r3',
      nodeId: 'seed-node-1',
      unifiedAddress: 'seed-node-1/message-group/mg-1-r3',
    });

    // System cache shows mg-1-r1 has been moved to node-2 (via CDC)
    const systemCacheData = {
      services: [
        {
          service_id: 'mg-1-r1',
          service_type: SERVICE_TYPE.MESSAGE_GROUP,
          node_id: 'node-2', // Already moved!
          group_id: 'mg-1',
          replica_id: 'mg-1-r1',
          address: 'node-2/message-group/mg-1-r1',
          raft_role: RAFT_ROLE.FOLLOWER,
          status: SERVICE_STATUS.ACTIVE,
        },
        {
          service_id: 'mg-1-r2',
          service_type: SERVICE_TYPE.MESSAGE_GROUP,
          node_id: 'seed-node-1',
          group_id: 'mg-1',
          replica_id: 'mg-1-r2',
          address: 'seed-node-1/message-group/mg-1-r2',
          raft_role: RAFT_ROLE.FOLLOWER,
          status: SERVICE_STATUS.ACTIVE,
        },
        {
          service_id: 'mg-1-r3',
          service_type: SERVICE_TYPE.MESSAGE_GROUP,
          node_id: 'seed-node-1',
          group_id: 'mg-1',
          replica_id: 'mg-1-r3',
          address: 'seed-node-1/message-group/mg-1-r3',
          raft_role: RAFT_ROLE.FOLLOWER,
          status: SERVICE_STATUS.ACTIVE,
        },
      ],
      nodes: [],
      partitions: [],
      tables: [],
      message_groups: [],
      replica_operations: [],
      indices: [],
      config: [],
      logs: [],
      live_queries: [],
      contexts: [],
      code: [],
      node_endpoints: [],
    };

    const mockSystemTableCache = {
      getAll(table) {
        return systemCacheData[table] || [];
      },
      get() {
        return null;
      },
      filter(table, predicate) {
        return (systemCacheData[table] || []).filter(predicate);
      },
      getReadyNodes() {
        return ['seed-node-1', 'node-2'];
      },
    };

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: mockSystemTableCache,
      messageGroupServices: staleMessageGroupServices,
    });

    await api.initialize(0, {listen: false});

    // Third node joins - should NOT get mg-1-r1 because it's already on node-2
    const node3Id = '550e8400-e29b-41d4-a716-446655440003';
    const response = await api.getFastify().inject({
      method: 'POST',
      url: '/bootstrap',
      payload: {nodeId: node3Id, nodeAddress: 'ws://localhost:9092'},
    });

    t.equal(response.statusCode, 200, 'bootstrap should succeed');
    const body = JSON.parse(response.body);
    t.equal(body.messageGroupAssignment.strategy, BootstrapStrategy.MOVE_REPLICA,
      'should use MOVE_REPLICA strategy');

    // The assigned replica should be mg-1-r2 or mg-1-r3, NOT mg-1-r1
    // because mg-1-r1 is already on node-2 (only 1 replica on seed-node-1 would remain)
    // Actually, with mg-1-r1 on node-2, seed-node-1 has 2 replicas (r2, r3)
    // So it should assign one of those
    const assignedReplica = body.messageGroupAssignment.replicaToMove;
    t.not(assignedReplica, 'mg-1-r1',
      'should NOT assign mg-1-r1 because it is already on another node');
    t.ok(['mg-1-r2', 'mg-1-r3'].includes(assignedReplica),
      'should assign mg-1-r2 or mg-1-r3');

    await api.shutdown();
  });

test(
  'BootstrapAPI - register-service waits for services cache visibility before the next MOVE_REPLICA assignment',
  async (t) => {
    initializeTestEnvironment();

    const systemCacheData = {
      services: [
        {
          service_id: 'mg-1-r1',
          service_type: SERVICE_TYPE.MESSAGE_GROUP,
          node_id: 'seed-node-1',
          group_id: 'mg-1',
          replica_id: 'mg-1-r1',
          address: 'seed-node-1/message-group/mg-1-r1',
          raft_role: RAFT_ROLE.FOLLOWER,
          status: SERVICE_STATUS.ACTIVE,
        },
        {
          service_id: 'mg-1-r2',
          service_type: SERVICE_TYPE.MESSAGE_GROUP,
          node_id: 'seed-node-1',
          group_id: 'mg-1',
          replica_id: 'mg-1-r2',
          address: 'seed-node-1/message-group/mg-1-r2',
          raft_role: RAFT_ROLE.FOLLOWER,
          status: SERVICE_STATUS.ACTIVE,
        },
        {
          service_id: 'mg-1-r3',
          service_type: SERVICE_TYPE.MESSAGE_GROUP,
          node_id: 'seed-node-1',
          group_id: 'mg-1',
          replica_id: 'mg-1-r3',
          address: 'seed-node-1/message-group/mg-1-r3',
          raft_role: RAFT_ROLE.FOLLOWER,
          status: SERVICE_STATUS.ACTIVE,
        },
      ],
      nodes: [],
      partitions: [],
      tables: [],
      message_groups: [],
      replica_operations: [],
      indices: [],
      config: [],
      logs: [],
      live_queries: [],
      contexts: [],
      code: [],
      node_endpoints: [],
    };

    const mockSystemTableCache = {
      getAll(table) {
        return systemCacheData[table] || [];
      },
      get(table, id) {
        const rows = systemCacheData[table] || [];
        return rows.find((row) => row.service_id === id || row.node_id === id) || null;
      },
      filter(table, predicate) {
        return (systemCacheData[table] || []).filter(predicate);
      },
      getReadyNodes() {
        return ['seed-node-1'];
      },
    };

    const delayedTimers = new Set();
    t.teardown(() => {
      for (const timer of delayedTimers) {
        clearTimeout(timer);
      }
    });

    const mockSqlQueryEngine = {
      async executeQuery(_sql, _params) {
        return {success: true};
      },
    };
    const mockCdcIntegrationService = {
      sqlQueryEngine: mockSqlQueryEngine,
      async insertSystemTableRow(tableName, rowData) {
        return this.upsertSystemTableRow(tableName, rowData);
      },
      async upsertSystemTableRow(tableName, rowData) {
        if (tableName === 'services') {
          const timer = setTimeout(() => {
            delayedTimers.delete(timer);
            const row = systemCacheData.services.find((service) => {
              return service.service_id === rowData.service_id;
            });
            if (row) {
              row.node_id = rowData.node_id;
              row.address = rowData.address;
              row.status = rowData.status;
              row.updated_at = rowData.updated_at;
            }
          }, 80);
          delayedTimers.add(timer);
          if (typeof timer.unref === 'function') {
            timer.unref();
          }
        }
        return {success: true};
      },
    };

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: mockSystemTableCache,
      messageGroupServices: new Map(),
      cdcIntegrationService: mockCdcIntegrationService,
      sqlQueryEngine: mockSqlQueryEngine,
    });
    await api.initialize(0, {listen: false});

    const node2Id = '550e8400-e29b-41d4-a716-446655440012';
    const bootstrap1 = await api.getFastify().inject({
      method: 'POST',
      url: '/bootstrap',
      payload: {nodeId: node2Id, nodeAddress: 'ws://localhost:9090'},
    });
    t.equal(bootstrap1.statusCode, 200, 'first bootstrap should succeed');
    const firstBody = JSON.parse(bootstrap1.body);
    const firstAssignedReplica = firstBody.messageGroupAssignment.replicaToMove;
    const firstAssignmentId = firstBody.messageGroupAssignment.assignmentId;
    t.equal(firstAssignedReplica, 'mg-1-r1', 'first node should receive first movable replica');
    t.type(firstAssignmentId, 'string', 'first bootstrap should include assignmentId');

    const registerResult = await api.getFastify().inject({
      method: 'POST',
      url: '/register-service',
      payload: {
        service_id: firstAssignedReplica,
        service_type: SERVICE_TYPE.MESSAGE_GROUP,
        node_id: node2Id,
        group_id: 'mg-1',
        replica_id: firstAssignedReplica,
        assignment_id: firstAssignmentId,
        raft_role: RAFT_ROLE.FOLLOWER,
        status: SERVICE_STATUS.ACTIVE,
        address: `${node2Id}/message-group/${firstAssignedReplica}`,
      },
    });
    t.equal(registerResult.statusCode, 200, 'register-service should succeed');

    systemCacheData.nodes.push({
      node_id: node2Id,
      status: SERVICE_STATUS.ACTIVE,
      connection_state: 'ready',
      last_heartbeat: Date.now(),
      ready_lease_expires_at: Date.now() + 60_000,
    });

    const node3Id = '550e8400-e29b-41d4-a716-446655440013';
    const bootstrap2 = await api.getFastify().inject({
      method: 'POST',
      url: '/bootstrap',
      payload: {nodeId: node3Id, nodeAddress: 'ws://localhost:9091'},
    });
    t.equal(bootstrap2.statusCode, 200, 'second bootstrap should succeed');
    const secondBody = JSON.parse(bootstrap2.body);
    t.not(
      secondBody.messageGroupAssignment.replicaToMove,
      firstAssignedReplica,
      'second node should not receive replica already registered to first node',
    );

    await api.shutdown();
  },
);
