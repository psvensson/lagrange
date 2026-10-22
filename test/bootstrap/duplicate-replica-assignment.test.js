/**
 * Consecutive joins and the seed's message group.
 *
 * These tests once pinned the MOVE_REPLICA of a seed message-group replica to
 * each joiner (and fixed a bug where two joiners were moved the same one).
 * A message-group replica's raft id derives from its name, so a move
 * re-opened a committed identity on an empty log with no conf change: the
 * identity-reuse safety fix (A3) removed the move. W8 now: consecutive joins
 * each host their own new group, no joiner is given any replica of the
 * seed's mg-1, and mg-1's rows stay on the seed.
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

test('BootstrapAPI - consecutive joins each host their own group; mg-1 stays on the seed', async (t) => {
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

  const joiners = [
    '550e8400-e29b-41d4-a716-446655440002',
    '550e8400-e29b-41d4-a716-446655440003',
  ];
  const groupIds = [];
  for (const [index, nodeId] of joiners.entries()) {
    const response = await api.getFastify().inject({
      method: 'POST',
      url: '/bootstrap',
      payload: {nodeId, nodeAddress: `ws://localhost:${9090 + index}`},
    });
    t.equal(response.statusCode, 200, `bootstrap ${index + 1} should succeed`);
    const assignment = JSON.parse(response.body).messageGroupAssignment;
    t.equal(assignment.strategy, BootstrapStrategy.CREATE_SELF_HOSTED,
      'the joiner hosts its own group');
    t.not(assignment.groupId, 'mg-1', 'no joiner joins the seed group');
    t.notOk(assignment.replicaToMove, 'no seed replica is moved');
    t.notOk(assignment.assignmentId, 'no move reservation is taken');
    groupIds.push(assignment.groupId);
  }
  t.not(groupIds[0], groupIds[1], 'each joiner hosts a distinct group');
  t.same(systemCacheData.services.map((row) => row.node_id),
    ['seed-node-1', 'seed-node-1', 'seed-node-1'],
    'mg-1\'s rows stay on the seed');
  t.equal(mockMessageGroupServices.size, 3,
    'the seed keeps every mg-1 replica');

  await api.shutdown();
});

/**
 * This test verifies that the bootstrap API reads from the system cache
 * (the single source of truth) rather than the stale messageGroupServices map.
 */
