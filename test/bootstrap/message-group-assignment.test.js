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

// W8 (identity-reuse safety fix, A3): a message-group replica's raft id
// derives from its name, so moving one to a joiner re-opened a committed
// identity on an empty log. No layout of existing groups - two or three of
// a group's replicas on one node, the seed's whole mg-1 - gives a joiner
// anything but its own fresh group; no assignment names a replica of
// another group.
for (const [label, messageGroups] of [
  ['2+ replicas of a group on one node', [{
    group_id: 'mg-1',
    replicas: [
      {replica_id: 'mg-1-r0', node_id: 'node-1', address: 'ws://node-1/services/mg-1-r0'},
      {replica_id: 'mg-1-r1', node_id: 'node-1', address: 'ws://node-1/services/mg-1-r1'},
      {replica_id: 'mg-1-r2', node_id: 'node-2', address: 'ws://node-2/services/mg-1-r2'},
    ],
  }]],
  ['all of the seed group on the seed', [{
    group_id: 'mg-seed',
    replicas: [
      {replica_id: 'mg-seed-r0', node_id: 'seed-node', address: 'ws://seed/services/mg-seed-r0'},
      {replica_id: 'mg-seed-r1', node_id: 'seed-node', address: 'ws://seed/services/mg-seed-r1'},
      {replica_id: 'mg-seed-r2', node_id: 'seed-node', address: 'ws://seed/services/mg-seed-r2'},
    ],
  }]],
]) {
  test(`MessageGroupAssignment - a joiner hosts its own group, never a moved replica (${label})`,
    async (t) => {
      initializeTestEnvironment();

      const assignment = new MessageGroupAssignment({
        seedNodeAddress: 'ws://localhost:8080',
      });

      const result = assignment.determineAssignment('new-node-id', messageGroups);

      t.equal(result.strategy, AssignmentStrategy.CREATE_SELF_HOSTED);
      t.equal(result.groupId, assignment.generateGroupId('new-node-id'));
      t.notOk(messageGroups.some((group) => group.group_id === result.groupId),
        'the joiner\'s group is a new group');
      t.notOk(result.replicaToMove);
      t.notOk(result.sourceNodeId);
      t.equal(result.replicaCount, 3);
    });
}

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

  // A moved message-group replica is no longer an assignment (W8).
  result = assignment.validateAssignment({
    strategy: 'MOVE_REPLICA',
    groupId: 'mg-1',
    sourceNodeId: 'node-1',
    replicaToMove: 'mg-1-r0',
    replicaAddresses: ['a0', 'a1', 'a2'],
  });
  t.equal(result.isValid, false);
  t.ok(result.errors.some((e) => e.includes('Invalid strategy')));

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

  // W8: the seed's mg-1 stays [N1, N1, N1]; every joiner hosts its own
  // group, which then exists beside it, and mg-1's membership never moves.
  const messageGroups = [{
    group_id: 'mg-1',
    replicas: [
      {replica_id: 'mg-1-r0', node_id: 'n1', address: 'a0'},
      {replica_id: 'mg-1-r1', node_id: 'n1', address: 'a1'},
      {replica_id: 'mg-1-r2', node_id: 'n1', address: 'a2'},
    ],
  }];
  for (const joiner of ['n2', 'n3', 'n4']) {
    const result = assignment.determineAssignment(joiner, messageGroups);
    t.equal(result.strategy, AssignmentStrategy.CREATE_SELF_HOSTED);
    t.equal(result.groupId, assignment.generateGroupId(joiner));
    t.notOk(result.replicaToMove);
    messageGroups.push({
      group_id: result.groupId,
      replicas: assignment.generateReplicaIds(result.groupId).map(
        (replicaId) => ({replica_id: replicaId, node_id: joiner,
          address: replicaId})),
    });
  }
  t.ok(messageGroups[0].replicas.every((replica) => replica.node_id === 'n1'),
    'mg-1 stays on the seed');
});


// ---------------------------------------------------------------
// Regression: restarting node with existing membership must get
// CREATE_SELF_HOSTED, not MOVE_REPLICA for a different group.
//
// Bug: In a 5-node cluster after rebalancing, some group may have
// 2+ replicas on one node. When a different node restarts,
// determineAssignment picked MOVE_REPLICA from that group instead
// of recognizing the restarting node already has its own group.
// This caused ASSIGNMENT_TOKEN_UNKNOWN failures during rolling
// restarts because the MOVE_REPLICA reservation expired before
// the handoff completed.
//
// Uses MessageGroupAssignment.hasExistingMembership owner path.
// ---------------------------------------------------------------
test(
  'MessageGroupAssignment - restarting node with existing ' +
  'membership gets CREATE_SELF_HOSTED, not MOVE_REPLICA',
  async (t) => {
    initializeTestEnvironment();

    const assignment = new MessageGroupAssignment({
      seedNodeAddress: 'ws://localhost:8080',
    });

    const restartingNodeId = 'restarting-node';
    const expectedGroupId =
      assignment.generateGroupId(restartingNodeId);

    // Cluster state: restarting node has r0 on itself, r1 moved
    // to node-2, r2 moved to node-3. Seed node still has 2
    // replicas of its own group (movable candidate).
    const messageGroups = [
      {
        group_id: expectedGroupId,
        replicas: [
          {
            replica_id: `${expectedGroupId}-r0`,
            node_id: restartingNodeId,
            address: 'ws://restarting/services/r0',
          },
          {
            replica_id: `${expectedGroupId}-r1`,
            node_id: 'node-2',
            address: 'ws://node-2/services/r1',
          },
          {
            replica_id: `${expectedGroupId}-r2`,
            node_id: 'node-3',
            address: 'ws://node-3/services/r2',
          },
        ],
      },
      {
        group_id: 'mg-seed',
        replicas: [
          {
            replica_id: 'mg-seed-r0',
            node_id: 'seed-node',
            address: 'ws://seed/services/r0',
          },
          {
            replica_id: 'mg-seed-r1',
            node_id: 'seed-node',
            address: 'ws://seed/services/r1',
          },
          {
            replica_id: 'mg-seed-r2',
            node_id: 'node-4',
            address: 'ws://node-4/services/r2',
          },
        ],
      },
    ];

    const result = assignment.determineAssignment(
      restartingNodeId,
      messageGroups,
    );

    t.equal(
      result.strategy,
      AssignmentStrategy.CREATE_SELF_HOSTED,
      'restarting node must get CREATE_SELF_HOSTED, not MOVE_REPLICA',
    );
    t.equal(
      result.groupId,
      expectedGroupId,
      'group ID must match the deterministic ID for the restarting node',
    );
    t.equal(result.replicaCount, 3);
  },
);

test(
  'MessageGroupAssignment - seed restart reuses initial mg-1 group',
  async (t) => {
    initializeTestEnvironment();

    const assignment = new MessageGroupAssignment({
      seedNodeAddress: 'ws://localhost:8080',
    });

    const messageGroups = [
      {
        group_id: 'mg-1',
        replicas: [
          {
            replica_id: 'mg-1-r1',
            node_id: 'seed-node-1',
            address: 'seed-node-1/message-group/mg-1-r1',
          },
          {
            replica_id: 'mg-1-r2',
            node_id: 'seed-node-1',
            address: 'seed-node-1/message-group/mg-1-r2',
          },
          {
            replica_id: 'mg-1-r3',
            node_id: 'seed-node-1',
            address: 'seed-node-1/message-group/mg-1-r3',
          },
        ],
      },
      {
        group_id: 'mg-other',
        replicas: [
          {
            replica_id: 'mg-other-r1',
            node_id: 'node-2',
            address: 'node-2/message-group/mg-other-r1',
          },
          {
            replica_id: 'mg-other-r2',
            node_id: 'node-2',
            address: 'node-2/message-group/mg-other-r2',
          },
          {
            replica_id: 'mg-other-r3',
            node_id: 'node-3',
            address: 'node-3/message-group/mg-other-r3',
          },
        ],
      },
    ];

    const result = assignment.determineAssignment(
      'seed-node-1',
      messageGroups,
      {allowRejoinSingleOwnedGroup: true},
    );

    t.equal(
      result.strategy,
      AssignmentStrategy.CREATE_SELF_HOSTED,
      'seed restart must still use CREATE_SELF_HOSTED',
    );
    t.equal(
      result.groupId,
      'mg-1',
      'seed restart must reuse the initial control-plane group',
    );
    t.equal(result.replicaCount, 3);
  },
);

test(
  'MessageGroupAssignment - restarted replica owner reuses existing mg-1 group',
  async (t) => {
    initializeTestEnvironment();

    const assignment = new MessageGroupAssignment({
      seedNodeAddress: 'ws://localhost:8080',
    });

    const restartingNodeId = 'node-2';
    const messageGroups = [
      {
        group_id: 'mg-1',
        replicas: [
          {
            replica_id: 'mg-1-r1',
            node_id: 'seed-node-1',
            address: 'seed-node-1/message-group/mg-1-r1',
          },
          {
            replica_id: 'mg-1-r2',
            node_id: restartingNodeId,
            address: 'node-2/message-group/mg-1-r2',
          },
          {
            replica_id: 'mg-1-r3',
            node_id: 'node-3',
            address: 'node-3/message-group/mg-1-r3',
          },
        ],
      },
      {
        group_id: 'mg-other',
        replicas: [
          {
            replica_id: 'mg-other-r1',
            node_id: 'seed-node-1',
            address: 'seed-node-1/message-group/mg-other-r1',
          },
          {
            replica_id: 'mg-other-r2',
            node_id: 'seed-node-1',
            address: 'seed-node-1/message-group/mg-other-r2',
          },
          {
            replica_id: 'mg-other-r3',
            node_id: 'node-4',
            address: 'node-4/message-group/mg-other-r3',
          },
        ],
      },
    ];

    const result = assignment.determineAssignment(
      restartingNodeId,
      messageGroups,
      {allowRejoinSingleOwnedGroup: true},
    );

    t.equal(result.strategy, AssignmentStrategy.CREATE_SELF_HOSTED);
    t.equal(result.groupId, 'mg-1');
    t.equal(result.replicaCount, 3);
    t.same(result.startupReplicaIds, ['mg-1-r2']);
  },
);

test(
  'MessageGroupAssignment - hasExistingMembership returns true ' +
  'when canonical self-hosted group exists',
  async (t) => {
    initializeTestEnvironment();

    const assignment = new MessageGroupAssignment();

    const canonicalGroupId =
      assignment.generateGroupId('node-a');

    const groups = [{
      group_id: canonicalGroupId,
      replicas: [
        {replica_id: 'r0', node_id: 'node-a', address: 'a0'},
        {replica_id: 'r1', node_id: 'node-b', address: 'a1'},
        {replica_id: 'r2', node_id: 'node-c', address: 'a2'},
      ],
    }];

    t.equal(
      assignment.hasExistingMembership('node-a', groups),
      true,
      'should detect canonical self-hosted group',
    );
    t.equal(
      assignment.hasExistingMembership('node-x', groups),
      false,
      'should return false when canonical group does not exist',
    );
    t.equal(
      assignment.hasExistingMembership('', groups),
      false,
      'should return false for empty node ID',
    );
    t.equal(
      assignment.hasExistingMembership(null, groups),
      false,
      'should return false for null node ID',
    );
    t.equal(
      assignment.hasExistingMembership('node-a', []),
      false,
      'should return false for empty groups',
    );
  },
);

// The upgrade case (identity-reuse safety fix, A3): node-x holds mg-seed-r2,
// moved to it by a build that still moved message-group replicas. It is
// never given another move. On an ordinary join it hosts its own new group;
// only a durable rejoin reuses the one group it holds, and then it opens
// mg-seed-r2 from its own durable record (an empty one is held for a reseed
// by the first leader heartbeat; the local-log guard).
test(
  'MessageGroupAssignment - a node holding a previously moved replica ' +
  'is never moved again; only a durable rejoin reuses its group',
  async (t) => {
    initializeTestEnvironment();

    const assignment = new MessageGroupAssignment({
      seedNodeAddress: 'ws://localhost:8080',
    });

    const messageGroups = [{
      group_id: 'mg-seed',
      replicas: [
        {
          replica_id: 'mg-seed-r0',
          node_id: 'seed-node',
          address: 'ws://seed/services/r0',
        },
        {
          replica_id: 'mg-seed-r1',
          node_id: 'seed-node',
          address: 'ws://seed/services/r1',
        },
        {
          replica_id: 'mg-seed-r2',
          node_id: 'node-x',
          address: 'ws://node-x/services/r2',
        },
      ],
    }];

    const joined = assignment.determineAssignment('node-x', messageGroups);
    t.equal(joined.strategy, AssignmentStrategy.CREATE_SELF_HOSTED);
    t.equal(joined.groupId, assignment.generateGroupId('node-x'));
    t.notOk(joined.replicaToMove);

    const rejoined = assignment.determineAssignment('node-x', messageGroups,
      {allowRejoinSingleOwnedGroup: true});
    t.equal(rejoined.strategy, AssignmentStrategy.CREATE_SELF_HOSTED);
    t.equal(rejoined.groupId, 'mg-seed');
    t.equal(rejoined.reuseExistingGroup, true);
    t.same(rejoined.startupReplicaIds, ['mg-seed-r2'],
      'a rejoin starts only the replica the node already holds');
  },
);

test(
  'MessageGroupAssignment - a new node beside a partly spread group ' +
  'hosts its own group',
  async (t) => {
    initializeTestEnvironment();

    const assignment = new MessageGroupAssignment({
      seedNodeAddress: 'ws://localhost:8080',
    });

    const messageGroups = [{
      group_id: 'mg-seed',
      replicas: [
        {
          replica_id: 'mg-seed-r0',
          node_id: 'seed-node',
          address: 'ws://seed/services/r0',
        },
        {
          replica_id: 'mg-seed-r1',
          node_id: 'seed-node',
          address: 'ws://seed/services/r1',
        },
        {
          replica_id: 'mg-seed-r2',
          node_id: 'node-2',
          address: 'ws://node-2/services/r2',
        },
      ],
    }];

    const result = assignment.determineAssignment(
      'brand-new-node',
      messageGroups,
    );

    t.equal(result.strategy, AssignmentStrategy.CREATE_SELF_HOSTED);
    t.equal(result.groupId, assignment.generateGroupId('brand-new-node'));
    t.notOk(result.sourceNodeId);
  },
);
