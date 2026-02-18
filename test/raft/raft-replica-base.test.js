/**
 * Tests for RaftReplicaBase - shared Raft replica functionality.
 */

import {test} from '../../src/test-helpers/tap.js';
import {RaftReplicaBase, RaftRole} from '../../src/raft/raft-replica-base.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {AddressManager} from '../../src/address/address-manager.js';
import {ENTITY_TYPE} from '../../src/constants/index.js';
import {
  resetProcessRaftProviderForTests,
} from '../../src/raft/raft-provider-control.js';
import {
  RAFT_PROVIDER_CONTROL,
} from '../../src/raft/raft-provider-control-constants.js';

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  NodeService.resetInstance();
  AddressManager.resetInstance();

  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'test-node'},
    logging: {level: 'error'},
  });

  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

function cleanupTestEnvironment() {
  NodeService.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  AddressManager.resetInstance();
}

/**
 * Concrete implementation for testing abstract base class.
 */
class TestRaftReplica extends RaftReplicaBase {
  constructor(options) {
    super({
      ...options,
      entityType: ENTITY_TYPE.MESSAGE_GROUP,
      subsystemName: 'test-replica',
    });
    this.flushRoleUpdateCalled = false;
    this.flushLeaderNodeUpdateCalled = false;
  }

  async flushRoleUpdate() {
    this.flushRoleUpdateCalled = true;
  }

  async flushLeaderNodeUpdate() {
    this.flushLeaderNodeUpdateCalled = true;
  }
}

test('RaftReplicaBase', async (t) => {
  t.beforeEach(() => {
    initializeTestEnvironment();
    resetProcessRaftProviderForTests();
  });

  t.afterEach(() => {
    resetProcessRaftProviderForTests();
    cleanupTestEnvironment();
  });

  await t.test('constructor requires replicaId', async (t) => {
    t.throws(() => {
      new TestRaftReplica({});
    }, /requires replicaId/);
  });

  await t.test('constructor sets default values', async (t) => {
    const replica = new TestRaftReplica({
      replicaId: 'test-replica-1',
      nodeId: 'node-1',
    });

    t.equal(replica.replicaId, 'test-replica-1');
    t.equal(replica.nodeId, 'node-1');
    t.equal(replica.role, RaftRole.FOLLOWER);
    t.equal(replica.isLeader, false);
    t.equal(replica.leaderId, null);
    t.equal(replica.initialized, false);
  });

  await t.test('getUnifiedAddress returns correct format', async (t) => {
    const replica = new TestRaftReplica({
      replicaId: 'replica-1',
      nodeId: 'node-1',
    });

    const address = replica.getUnifiedAddress();
    t.equal(address, 'node-1/message-group/replica-1');
  });

  await t.test('buildPeerAddress returns address from peerAddresses array', async (t) => {
    const replica = new TestRaftReplica({
      replicaId: 'replica-1',
      nodeId: 'node-1',
      peerAddresses: [
        'node-2/message-group/replica-2',
        'node-3/message-group/replica-3',
      ],
    });

    const address = replica.buildPeerAddress('replica-2');
    t.equal(address, 'node-2/message-group/replica-2');
  });

  await t.test('buildPeerAddress returns unified address as-is', async (t) => {
    const replica = new TestRaftReplica({
      replicaId: 'replica-1',
      nodeId: 'node-1',
    });

    const address = replica.buildPeerAddress('node-2/message-group/replica-2');
    t.equal(address, 'node-2/message-group/replica-2');
  });

  await t.test('buildPeerAddress throws for unresolved peer', async (t) => {
    const replica = new TestRaftReplica({
      replicaId: 'replica-1',
      nodeId: 'node-1',
    });

    t.throws(() => {
      replica.buildPeerAddress('unknown-replica');
    }, /Unable to resolve unified peer address/);
  });

  await t.test('isLeaderReplica returns false initially', async (t) => {
    const replica = new TestRaftReplica({
      replicaId: 'replica-1',
      nodeId: 'node-1',
    });

    t.equal(replica.isLeaderReplica(), false);
  });

  await t.test('getRole returns follower initially', async (t) => {
    const replica = new TestRaftReplica({
      replicaId: 'replica-1',
      nodeId: 'node-1',
    });

    t.equal(replica.getRole(), RaftRole.FOLLOWER);
  });

  await t.test('getLeaderId returns null initially', async (t) => {
    const replica = new TestRaftReplica({
      replicaId: 'replica-1',
      nodeId: 'node-1',
    });

    t.equal(replica.getLeaderId(), null);
  });

  await t.test('getCurrentTerm returns 0 without raft instance', async (t) => {
    const replica = new TestRaftReplica({
      replicaId: 'replica-1',
      nodeId: 'node-1',
    });

    t.equal(replica.getCurrentTerm(), 0);
  });

  await t.test('queueRoleUpdate calls flushRoleUpdate with cdcIntegrationService', async (t) => {
    const replica = new TestRaftReplica({
      replicaId: 'replica-1',
      nodeId: 'node-1',
      cdcIntegrationService: {},
    });

    replica.queueRoleUpdate(RaftRole.LEADER);
    await Promise.resolve(); // Allow async flush to complete

    t.equal(replica.flushRoleUpdateCalled, true);
    t.equal(replica.pendingRoleUpdate, RaftRole.LEADER);
  });

  await t.test('queueLeaderNodeUpdate calls flushLeaderNodeUpdate', async (t) => {
    const replica = new TestRaftReplica({
      replicaId: 'replica-1',
      nodeId: 'node-1',
      cdcIntegrationService: {},
    });

    replica.queueLeaderNodeUpdate('node-2');
    await Promise.resolve();

    t.equal(replica.flushLeaderNodeUpdateCalled, true);
    t.equal(replica.pendingLeaderNodeUpdate, 'node-2');
  });

  await t.test('clearLeaderNodeUpdateState clears state', async (t) => {
    const replica = new TestRaftReplica({
      replicaId: 'replica-1',
      nodeId: 'node-1',
    });

    replica.pendingLeaderNodeUpdate = 'node-2';
    replica.persistedLeaderNodeId = 'node-1';

    replica.clearLeaderNodeUpdateState();

    t.equal(replica.pendingLeaderNodeUpdate, null);
    t.equal(replica.persistedLeaderNodeId, null);
  });

  await t.test('shutdown clears timers and state', async (t) => {
    const replica = new TestRaftReplica({
      replicaId: 'replica-1',
      nodeId: 'node-1',
    });

    replica.initialized = true;
    replica.roleUpdateRetryTimer = setTimeout(() => {}, 10000);
    replica.leaderNodeUpdateRetryTimer = setTimeout(() => {}, 10000);
    replica.learnerPromotionTimer = setTimeout(() => {}, 10000);

    await replica.shutdown();

    t.equal(replica.initialized, false);
    t.equal(replica.roleUpdateRetryTimer, null);
    t.equal(replica.leaderNodeUpdateRetryTimer, null);
    t.equal(replica.learnerPromotionTimer, null);
  });

  await t.test('handleSingleReplicaLeadership promotes single replica to leader', async (t) => {
    const replica = new TestRaftReplica({
      replicaId: 'replica-1',
      nodeId: 'node-1',
      replicaIds: ['replica-1'],
    });

    let leaderElectedEmitted = false;
    replica.on('leaderElected', () => {
      leaderElectedEmitted = true;
    });

    replica.handleSingleReplicaLeadership();

    t.equal(replica.role, RaftRole.LEADER);
    t.equal(replica.isLeader, true);
    t.equal(replica.leaderId, 'replica-1');
    t.equal(leaderElectedEmitted, true);
  });

  await t.test('startElection is no-op for single replica', async (t) => {
    const replica = new TestRaftReplica({
      replicaId: 'replica-1',
      nodeId: 'node-1',
      replicaIds: ['replica-1'],
    });

    replica.startElection();

    t.equal(replica.electionStarted, true);
  });

  await t.test('createRaftInstance fails fast when provider is non-liferaft', async (t) => {
    const previousProvider = process.env[RAFT_PROVIDER_CONTROL.ENV_KEY];
    process.env[RAFT_PROVIDER_CONTROL.ENV_KEY] = RAFT_PROVIDER_CONTROL.RAFT_LOGIC;
    t.teardown(() => {
      if (previousProvider === undefined) {
        delete process.env[RAFT_PROVIDER_CONTROL.ENV_KEY];
      } else {
        process.env[RAFT_PROVIDER_CONTROL.ENV_KEY] = previousProvider;
      }
    });

    const replica = new TestRaftReplica({
      replicaId: 'replica-1',
      nodeId: 'node-1',
      replicaIds: ['replica-1'],
    });

    t.throws(() => {
      replica.createRaftInstance();
    }, /not available in this runtime path/);
  });
});
