/**
 * Tests for message group assignment strategy centralization.
 * Verifies that BootstrapAPI delegates strategy selection to
 * MessageGroupAssignment (single owner) per Requirement 6.1, 6.2, 6.3.
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapAPI} from '../../src/bootstrap/bootstrap-api.js';
import {
  MessageGroupAssignment,
} from '../../src/bootstrap/message-group-assignment.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {SERVICE_STATUS, SERVICE_TYPE, TABLES} from '../../src/constants/index.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  BOOTSTRAP_ASSIGNMENT_STRATEGY,
} from '../../src/bootstrap/bootstrap-constants.js';

/**
 * Initialize test singletons.
 */
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
 * Create an empty mock system table cache.
 * @return {Object} Mock cache.
 */
function createEmptyMockCache() {
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

/**
 * Build 3 seed-node replicas for testing.
 * @return {Array<Object>} Service entries.
 */
function buildSeedReplicas() {
  return [
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
  ];
}

/**
 * Create a mock cache with seed replicas.
 * @param {Array<Object>} services - Service entries.
 * @return {Object} Mock cache.
 */
function createMockCacheWithServices(services) {
  return {
    get() {
      return null;
    },
    getAll(tableName) {
      if (tableName === TABLES.SERVICES) {
        return services;
      }
      return [];
    },
    filter(table, predicate) {
      return (this.getAll(table) || []).filter(predicate);
    },
    find() {
      return null;
    },
    getReadyNodes() {
      return [];
    },
  };
}

test('BootstrapAPI does not have findMessageGroupWithMovableReplica',
  async (t) => {
    initializeTestEnvironment();

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createEmptyMockCache(),
    });

    t.equal(
      typeof api.findMessageGroupWithMovableReplica,
      'undefined',
      'should not have findMessageGroupWithMovableReplica',
    );
  },
);

test('BootstrapAPI delegates strategy to MessageGroupAssignment',
  async (t) => {
    initializeTestEnvironment();

    const mockCache = createMockCacheWithServices(
      buildSeedReplicas(),
    );

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: mockCache,
    });

    const result = api.determineMessageGroupAssignment('new-node-1');

    t.equal(
      result.strategy,
      BOOTSTRAP_ASSIGNMENT_STRATEGY.MOVE_REPLICA,
      'should use MOVE_REPLICA via MessageGroupAssignment',
    );
    t.equal(result.groupId, 'mg-1', 'should target existing group');
    t.equal(
      result.sourceNodeId, 'seed-node-1',
      'should identify source node',
    );
    t.ok(result.replicaToMove, 'should identify replica to move');
    t.ok(result.peerAddresses, 'should augment with peer addresses');
    t.equal(
      result.peerAddresses.length, 3,
      'should have 3 peer addresses',
    );
  },
);

test('BootstrapAPI excludes non-seed MOVE_REPLICA sources during bootstrap',
  async (t) => {
    initializeTestEnvironment();

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createMockCacheWithServices([
        {
          service_id: 'mg-remote-r0',
          service_type: SERVICE_TYPE.MESSAGE_GROUP,
          node_id: 'node-2',
          group_id: 'mg-remote',
          replica_id: 'mg-remote-r0',
          address: 'node-2/message-group/mg-remote-r0',
          raft_role: RAFT_ROLE.FOLLOWER,
          status: SERVICE_STATUS.ACTIVE,
        },
        {
          service_id: 'mg-remote-r1',
          service_type: SERVICE_TYPE.MESSAGE_GROUP,
          node_id: 'node-2',
          group_id: 'mg-remote',
          replica_id: 'mg-remote-r1',
          address: 'node-2/message-group/mg-remote-r1',
          raft_role: RAFT_ROLE.FOLLOWER,
          status: SERVICE_STATUS.ACTIVE,
        },
        {
          service_id: 'mg-remote-r2',
          service_type: SERVICE_TYPE.MESSAGE_GROUP,
          node_id: 'node-3',
          group_id: 'mg-remote',
          replica_id: 'mg-remote-r2',
          address: 'node-3/message-group/mg-remote-r2',
          raft_role: RAFT_ROLE.FOLLOWER,
          status: SERVICE_STATUS.ACTIVE,
        },
      ]),
    });

    const result = api.determineMessageGroupAssignment('new-node-1');

    t.equal(
      result.strategy,
      BOOTSTRAP_ASSIGNMENT_STRATEGY.CREATE_SELF_HOSTED,
      'bootstrap must not reserve MOVE_REPLICA from non-seed sources',
    );
    t.notOk(
      result.sourceNodeId,
      'bootstrap should not expose a remote source owner for handoff',
    );
  },
);

test('BootstrapAPI and MessageGroupAssignment produce same strategy',
  async (t) => {
    initializeTestEnvironment();

    const messageGroups = [{
      group_id: 'mg-1',
      replicas: buildSeedReplicas().map((r) => ({
        replica_id: r.replica_id,
        node_id: r.node_id,
        address: r.address,
      })),
    }];

    const mgAssignment = new MessageGroupAssignment({
      seedNodeAddress: 'ws://localhost:8080',
    });
    const directResult = mgAssignment.determineAssignment(
      'new-node-1', messageGroups,
    );

    const services = messageGroups[0].replicas.map((r) => ({
      service_id: r.replica_id,
      service_type: SERVICE_TYPE.MESSAGE_GROUP,
      node_id: r.node_id,
      group_id: 'mg-1',
      replica_id: r.replica_id,
      address: r.address,
      raft_role: RAFT_ROLE.FOLLOWER,
      status: SERVICE_STATUS.ACTIVE,
    }));

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createMockCacheWithServices(services),
    });

    const apiResult = api.determineMessageGroupAssignment(
      'new-node-1',
    );

    t.equal(
      apiResult.strategy, directResult.strategy,
      'strategy should match',
    );
    t.equal(
      apiResult.groupId, directResult.groupId,
      'groupId should match',
    );
    t.equal(
      apiResult.sourceNodeId, directResult.sourceNodeId,
      'sourceNodeId should match',
    );
    t.equal(
      apiResult.replicaToMove, directResult.replicaToMove,
      'replicaToMove should match',
    );
  },
);

test('MessageGroupAssignment is the single strategy owner',
  async (t) => {
    initializeTestEnvironment();

    const mgAssignment = new MessageGroupAssignment();
    t.equal(
      typeof mgAssignment.determineAssignment,
      'function',
      'should have determineAssignment method',
    );
    t.equal(
      typeof mgAssignment.findMovableReplica,
      'function',
      'should have findMovableReplica method',
    );

    const api = new BootstrapAPI({
      seedNodeId: 'seed-node-1',
      seedNodeAddress: 'ws://localhost:8080',
      systemTableCache: createEmptyMockCache(),
    });

    t.equal(
      typeof api.findMessageGroupWithMovableReplica,
      'undefined',
      'BootstrapAPI should not have findMessageGroupWithMovableReplica',
    );
    t.equal(
      typeof api.findMovableReplica,
      'undefined',
      'BootstrapAPI should not have findMovableReplica',
    );
  },
);
