/**
 * Tests for Message Group Assignment strategies.
 * Requirements: 7.5, 7.6, 7.9
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  MessageGroupAssignment,
  MESSAGE_GROUP_ASSIGNMENT_STRATEGY as AssignmentStrategy,
} from '../../src/bootstrap/message-group-assignment.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';

// Initialize configuration and logging for tests
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

test('MessageGroupAssignment - CREATE_SELF_HOSTED when no groups exist', async (t) => {
  initializeTestEnvironment();

  const assignment = new MessageGroupAssignment({
    seedNodeAddress: 'ws://localhost:8080',
  });

  const result = assignment.determineAssignment('new-node-id', []);

  t.equal(result.strategy, AssignmentStrategy.CREATE_SELF_HOSTED);
  t.ok(result.groupId.startsWith('mg-'));
  t.equal(result.replicaCount, 3);
});

test('MessageGroupAssignment - CREATE_SELF_HOSTED when no movable replicas', async (t) => {
  initializeTestEnvironment();

  const assignment = new MessageGroupAssignment({
    seedNodeAddress: 'ws://localhost:8080',
  });

  // Message group with replicas on different nodes (no movable)
  const messageGroups = [{
    group_id: 'mg-1',
    replicas: [
      {replica_id: 'mg-1-r0', node_id: 'node-1', address: 'ws://node-1/services/mg-1-r0'},
      {replica_id: 'mg-1-r1', node_id: 'node-2', address: 'ws://node-2/services/mg-1-r1'},
      {replica_id: 'mg-1-r2', node_id: 'node-3', address: 'ws://node-3/services/mg-1-r2'},
    ],
  }];

  const result = assignment.determineAssignment('new-node-id', messageGroups);

  t.equal(result.strategy, AssignmentStrategy.CREATE_SELF_HOSTED);
  t.ok(result.groupId.startsWith('mg-'));
  t.equal(result.replicaCount, 3);
});

test('MessageGroupAssignment - MOVE_REPLICA when 2+ replicas on same node', async (t) => {
  initializeTestEnvironment();

  const assignment = new MessageGroupAssignment({
    seedNodeAddress: 'ws://localhost:8080',
  });

  // Message group with 2 replicas on node-1
  const messageGroups = [{
    group_id: 'mg-1',
    replicas: [
      {replica_id: 'mg-1-r0', node_id: 'node-1', address: 'ws://node-1/services/mg-1-r0'},
      {replica_id: 'mg-1-r1', node_id: 'node-1', address: 'ws://node-1/services/mg-1-r1'},
      {replica_id: 'mg-1-r2', node_id: 'node-2', address: 'ws://node-2/services/mg-1-r2'},
    ],
  }];

  const result = assignment.determineAssignment('new-node-id', messageGroups);

  t.equal(result.strategy, AssignmentStrategy.MOVE_REPLICA);
  t.equal(result.groupId, 'mg-1');
  t.equal(result.sourceNodeId, 'node-1');
  t.ok(result.replicaToMove.startsWith('mg-1-r'));
  t.equal(result.replicaAddresses.length, 3);
  t.equal(result.existingPeerIds.length, 3);
});

test('MessageGroupAssignment - MOVE_REPLICA with all replicas on same node', async (t) => {
  initializeTestEnvironment();

  const assignment = new MessageGroupAssignment({
    seedNodeAddress: 'ws://localhost:8080',
  });

  // Message group with all 3 replicas on seed node (initial bootstrap state)
  const messageGroups = [{
    group_id: 'mg-seed',
    replicas: [
      {replica_id: 'mg-seed-r0', node_id: 'seed-node', address: 'ws://seed/services/mg-seed-r0'},
      {replica_id: 'mg-seed-r1', node_id: 'seed-node', address: 'ws://seed/services/mg-seed-r1'},
      {replica_id: 'mg-seed-r2', node_id: 'seed-node', address: 'ws://seed/services/mg-seed-r2'},
    ],
  }];

  const result = assignment.determineAssignment('new-node-id', messageGroups);

  t.equal(result.strategy, AssignmentStrategy.MOVE_REPLICA);
  t.equal(result.groupId, 'mg-seed');
  t.equal(result.sourceNodeId, 'seed-node');
});

test('MessageGroupAssignment - excludes self-source MOVE_REPLICA candidates', async (t) => {
  initializeTestEnvironment();

  const assignment = new MessageGroupAssignment({
    seedNodeAddress: 'ws://localhost:8080',
  });

  const messageGroups = [
    {
      group_id: 'mg-self',
      replicas: [
        {replica_id: 'mg-self-r0', node_id: 'joining-node', address: 'ws://joining/services/r0'},
        {replica_id: 'mg-self-r1', node_id: 'joining-node', address: 'ws://joining/services/r1'},
        {replica_id: 'mg-self-r2', node_id: 'seed-node', address: 'ws://seed/services/r2'},
      ],
    },
    {
      group_id: 'mg-seed',
      replicas: [
        {replica_id: 'mg-seed-r0', node_id: 'seed-node', address: 'ws://seed/services/r0'},
        {replica_id: 'mg-seed-r1', node_id: 'seed-node', address: 'ws://seed/services/r1'},
        {replica_id: 'mg-seed-r2', node_id: 'node-3', address: 'ws://node-3/services/r2'},
      ],
    },
  ];

  const result = assignment.determineAssignment('joining-node', messageGroups);

  t.equal(result.strategy, AssignmentStrategy.MOVE_REPLICA);
  t.equal(result.groupId, 'mg-seed');
  t.equal(result.sourceNodeId, 'seed-node');
  t.not(result.sourceNodeId, 'joining-node');
});

test('MessageGroupAssignment - falls back when only self-source MOVE_REPLICA exists',
  async (t) => {
    initializeTestEnvironment();

    const assignment = new MessageGroupAssignment({
      seedNodeAddress: 'ws://localhost:8080',
    });

    const messageGroups = [{
      group_id: 'mg-self',
      replicas: [
        {replica_id: 'mg-self-r0', node_id: 'joining-node', address: 'ws://joining/services/r0'},
        {replica_id: 'mg-self-r1', node_id: 'joining-node', address: 'ws://joining/services/r1'},
        {replica_id: 'mg-self-r2', node_id: 'seed-node', address: 'ws://seed/services/r2'},
      ],
    }];

    const result = assignment.determineAssignment('joining-node', messageGroups);

    t.equal(result.strategy, AssignmentStrategy.CREATE_SELF_HOSTED);
    t.notOk(result.sourceNodeId);
    t.notOk(result.replicaToMove);
  });

test('MessageGroupAssignment - findMovableReplica', async (t) => {
  initializeTestEnvironment();

  const assignment = new MessageGroupAssignment();

  // No movable replica
  let result = assignment.findMovableReplica([{
    group_id: 'mg-1',
    replicas: [
      {replica_id: 'r0', node_id: 'n1', address: 'a0'},
      {replica_id: 'r1', node_id: 'n2', address: 'a1'},
      {replica_id: 'r2', node_id: 'n3', address: 'a2'},
    ],
  }]);
  t.equal(result, null, 'should return null when no movable replica');

  // Has movable replica
  result = assignment.findMovableReplica([{
    group_id: 'mg-1',
    replicas: [
      {replica_id: 'r0', node_id: 'n1', address: 'a0'},
      {replica_id: 'r1', node_id: 'n1', address: 'a1'},
      {replica_id: 'r2', node_id: 'n2', address: 'a2'},
    ],
  }]);
  t.ok(result, 'should find movable replica');
  t.equal(result.groupId, 'mg-1');
  t.equal(result.sourceNodeId, 'n1');
});

test('MessageGroupAssignment - generateGroupId', async (t) => {
  initializeTestEnvironment();

  const assignment = new MessageGroupAssignment();

  const groupId = assignment.generateGroupId('550e8400-e29b-41d4-a716-446655440000');

  t.ok(groupId.startsWith('mg-'));
  t.equal(groupId, 'mg-550e8400-446655440000');
});

test('MessageGroupAssignment - generateGroupId avoids collisions on shared UUID prefix',
  async (t) => {
    initializeTestEnvironment();

    const assignment = new MessageGroupAssignment();
    const groupIdA = assignment.generateGroupId(
      '550e8400-e29b-41d4-a716-446655440603',
    );
    const groupIdB = assignment.generateGroupId(
      '550e8400-e29b-41d4-a716-446655440606',
    );

    t.not(groupIdA, groupIdB, 'different nodes should not reuse the same groupId');
  });

test('MessageGroupAssignment - generateReplicaIds', async (t) => {
  initializeTestEnvironment();

  const assignment = new MessageGroupAssignment();

  const replicaIds = assignment.generateReplicaIds('mg-test', 3);

  t.equal(replicaIds.length, 3);
  t.equal(replicaIds[0], 'mg-test-r0');
  t.equal(replicaIds[1], 'mg-test-r1');
  t.equal(replicaIds[2], 'mg-test-r2');
});

test('MessageGroupAssignment - buildReplicaAddresses', async (t) => {
  initializeTestEnvironment();

  const assignment = new MessageGroupAssignment();

  const addresses = assignment.buildReplicaAddresses(
    'node-1',
    ['mg-1-r0', 'mg-1-r1', 'mg-1-r2'],
  );

  t.equal(addresses.length, 3);
  t.equal(addresses[0], 'node-1/message-group/mg-1-r0');
  t.equal(addresses[1], 'node-1/message-group/mg-1-r1');
  t.equal(addresses[2], 'node-1/message-group/mg-1-r2');
});

test('MessageGroupAssignment - validateAssignment', async (t) => {
  initializeTestEnvironment();

  const assignment = new MessageGroupAssignment();

  // Valid CREATE_SELF_HOSTED
  let result = assignment.validateAssignment({
    strategy: AssignmentStrategy.CREATE_SELF_HOSTED,
    groupId: 'mg-test',
    replicaCount: 3,
  });
  t.equal(result.isValid, true);
  t.equal(result.errors.length, 0);

  // Valid MOVE_REPLICA
  result = assignment.validateAssignment({
    strategy: AssignmentStrategy.MOVE_REPLICA,
    groupId: 'mg-1',
    sourceNodeId: 'node-1',
    replicaToMove: 'mg-1-r0',
    replicaAddresses: ['a0', 'a1', 'a2'],
  });
  t.equal(result.isValid, true);

  // Invalid - missing strategy
  result = assignment.validateAssignment({groupId: 'mg-test'});
  t.equal(result.isValid, false);
  t.ok(result.errors.some((e) => e.includes('Strategy')));

  // Invalid - even replica count
  result = assignment.validateAssignment({
    strategy: AssignmentStrategy.CREATE_SELF_HOSTED,
    groupId: 'mg-test',
    replicaCount: 4,
  });
  t.equal(result.isValid, false);
  t.ok(result.errors.some((e) => e.includes('odd')));

  // Invalid MOVE_REPLICA - missing sourceNodeId
  result = assignment.validateAssignment({
    strategy: AssignmentStrategy.MOVE_REPLICA,
    groupId: 'mg-1',
    replicaToMove: 'mg-1-r0',
    replicaAddresses: ['a0'],
  });
  t.equal(result.isValid, false);
  t.ok(result.errors.some((e) => e.includes('Source node')));
});

test('MessageGroupAssignment - calculateOptimalDistribution', async (t) => {
  initializeTestEnvironment();

  const assignment = new MessageGroupAssignment();

  // 3 nodes = 1 message group
  let dist = assignment.calculateOptimalDistribution(3);
  t.equal(dist.messageGroupsNeeded, 1);
  t.equal(dist.totalReplicas, 3);
  t.equal(dist.avgReplicasPerNode, 1);

  // 6 nodes = 2 message groups
  dist = assignment.calculateOptimalDistribution(6);
  t.equal(dist.messageGroupsNeeded, 2);
  t.equal(dist.totalReplicas, 6);
  t.equal(dist.avgReplicasPerNode, 1);

  // 100 nodes = 34 message groups
  dist = assignment.calculateOptimalDistribution(100);
  t.equal(dist.messageGroupsNeeded, 34);
  t.equal(dist.totalReplicas, 102);

  // 1000 nodes = 334 message groups
  dist = assignment.calculateOptimalDistribution(1000);
  t.equal(dist.messageGroupsNeeded, 334);
});

test('MessageGroupAssignment - node joining progression', async (t) => {
  initializeTestEnvironment();

  const assignment = new MessageGroupAssignment();

  // Simulate node joining progression
  // Node 1 (seed): MG-1 [N1, N1, N1]
  let messageGroups = [{
    group_id: 'mg-1',
    replicas: [
      {replica_id: 'mg-1-r0', node_id: 'n1', address: 'a0'},
      {replica_id: 'mg-1-r1', node_id: 'n1', address: 'a1'},
      {replica_id: 'mg-1-r2', node_id: 'n1', address: 'a2'},
    ],
  }];

  // Node 2 joins: Should MOVE_REPLICA from N1
  let result = assignment.determineAssignment('n2', messageGroups);
  t.equal(result.strategy, AssignmentStrategy.MOVE_REPLICA);
  t.equal(result.sourceNodeId, 'n1');

  // After move: MG-1 [N1, N1, N2]
  messageGroups = [{
    group_id: 'mg-1',
    replicas: [
      {replica_id: 'mg-1-r0', node_id: 'n1', address: 'a0'},
      {replica_id: 'mg-1-r1', node_id: 'n1', address: 'a1'},
      {replica_id: 'mg-1-r2', node_id: 'n2', address: 'a2'},
    ],
  }];

  // Node 3 joins: Should MOVE_REPLICA from N1 (still has 2)
  result = assignment.determineAssignment('n3', messageGroups);
  t.equal(result.strategy, AssignmentStrategy.MOVE_REPLICA);
  t.equal(result.sourceNodeId, 'n1');

  // After move: MG-1 [N1, N2, N3]
  messageGroups = [{
    group_id: 'mg-1',
    replicas: [
      {replica_id: 'mg-1-r0', node_id: 'n1', address: 'a0'},
      {replica_id: 'mg-1-r1', node_id: 'n2', address: 'a1'},
      {replica_id: 'mg-1-r2', node_id: 'n3', address: 'a2'},
    ],
  }];

  // Node 4 joins: Should CREATE_SELF_HOSTED (no node has 2+ replicas)
  result = assignment.determineAssignment('n4', messageGroups);
  t.equal(result.strategy, AssignmentStrategy.CREATE_SELF_HOSTED);
  t.ok(result.groupId.startsWith('mg-'));
});
