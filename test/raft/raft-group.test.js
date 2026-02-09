/**
 * Unit tests for RaftGroup.
 * Validates constructor validation, single-replica leader promotion,
 * deferred election timer clearing, shutdown safety, and idempotent
 * startElection.
 * Requirements: 1.1, 1.2, 1.5, 1.6, 1.7
 */

import {test} from '../../src/test-helpers/tap.js';
import {RaftGroup} from '../../src/raft/raft-group.js';
import {
  RAFT_GROUP_ERROR_MSG,
  RAFT_GROUP_EVENT,
  RAFT_GROUP_ROLE,
} from '../../src/raft/raft-group-constants.js';
import {ENTITY_TYPE, NUM} from '../../src/constants/index.js';

/**
 * Create a silent logger for tests.
 * @return {Object} Logger with no-op methods.
 */
function createSilentLogger() {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    trace: () => {},
  };
}

/**
 * Create a mock transport for tests.
 * @return {Object} Transport with deliver method.
 */
function createMockTransport() {
  return {
    deliver: () => Promise.resolve({acknowledged: true}),
  };
}

/**
 * Create a mock PeerAddressResolver for tests.
 * @return {Object} Resolver with resolve method.
 */
function createMockResolver() {
  return {
    resolve: (peerId, _peerAddresses) => {
      return `node1/${ENTITY_TYPE.PARTITION}/${peerId}`;
    },
  };
}

/**
 * Safely shut down a RaftGroup, clearing liferaft timers and
 * removing all listeners to prevent post-shutdown errors.
 * @param {RaftGroup|null} group - The group to shut down.
 * @return {Promise<void>}
 */
async function safeShutdown(group) {
  if (!group) return;
  const raft = group.getRaftInstance();
  if (raft) {
    raft.removeAllListeners();
    if (raft.timers) {
      raft.timers.clear();
    }
  }
  await group.shutdown();
  await new Promise((resolve) => setImmediate(resolve));
}

/**
 * Build default valid options for RaftGroup construction.
 * @param {Object} overrides - Options to override defaults.
 * @return {Object} Merged options.
 */
function buildOptions(overrides = {}) {
  return {
    replicaId: 'replica-1',
    replicaIds: ['replica-1'],
    transport: createMockTransport(),
    entityType: ENTITY_TYPE.PARTITION,
    peerAddressResolver: createMockResolver(),
    deferElection: true,
    logger: createSilentLogger(),
    ...overrides,
  };
}

// ============================================================
// Constructor Validation (Requirements 1.1, 1.2)
// ============================================================

test('constructor throws when replicaId is missing', async (t) => {
  t.throws(
    () => new RaftGroup(buildOptions({replicaId: undefined})),
    {message: RAFT_GROUP_ERROR_MSG.MISSING_REPLICA_ID},
    'should throw MISSING_REPLICA_ID error',
  );
});

test('constructor throws when entityType is missing', async (t) => {
  t.throws(
    () => new RaftGroup(buildOptions({entityType: undefined})),
    {message: RAFT_GROUP_ERROR_MSG.MISSING_ENTITY_TYPE},
    'should throw MISSING_ENTITY_TYPE error',
  );
});

test('constructor throws when transport is missing', async (t) => {
  t.throws(
    () => new RaftGroup(buildOptions({transport: undefined})),
    {message: RAFT_GROUP_ERROR_MSG.MISSING_TRANSPORT},
    'should throw MISSING_TRANSPORT error',
  );
});

test('constructor throws when peerAddressResolver is missing',
  async (t) => {
    t.throws(
      () => new RaftGroup(buildOptions({
        peerAddressResolver: undefined,
      })),
      {message: RAFT_GROUP_ERROR_MSG.MISSING_PEER_ADDRESS_RESOLVER},
      'should throw MISSING_PEER_ADDRESS_RESOLVER error',
    );
  });

// ============================================================
// Single-Replica Leader Promotion (Requirement 1.6)
// ============================================================

test('single-replica startElection promotes to leader immediately',
  async (t) => {
    let group;
    try {
      group = new RaftGroup(buildOptions({
        replicaId: 'solo-replica',
        replicaIds: ['solo-replica'],
      }));

      group.initialize();

      let leaderEvent = null;
      group.on(RAFT_GROUP_EVENT.LEADER, (data) => {
        leaderEvent = data;
      });

      group.startElection();

      t.equal(
        group.getRole(), RAFT_GROUP_ROLE.LEADER,
        'role should be leader',
      );
      t.ok(
        group.isLeaderReplica(),
        'isLeaderReplica should return true',
      );
      t.equal(
        group.getLeaderId(), 'solo-replica',
        'leaderId should be the solo replica',
      );
      t.ok(leaderEvent, 'leader event should have been emitted');
      t.equal(
        leaderEvent.leaderId, 'solo-replica',
        'leader event should contain correct leaderId',
      );
    } finally {
      await safeShutdown(group);
    }
  });

// ============================================================
// Deferred Election Clears Timers (Requirement 1.5)
// ============================================================

test('deferred election clears liferaft timers on initialize',
  async (t) => {
    let group;
    try {
      group = new RaftGroup(buildOptions({
        replicaId: 'deferred-replica',
        replicaIds: ['deferred-replica', 'peer-replica'],
        deferElection: true,
      }));

      group.initialize();

      const raft = group.getRaftInstance();
      t.ok(raft, 'raft instance should exist after initialize');

      const isHeartbeatActive = raft.timers &&
        raft.timers.active('heartbeat');
      t.notOk(
        isHeartbeatActive,
        'heartbeat timer should not be active after deferred init',
      );
    } finally {
      await safeShutdown(group);
    }
  });

// ============================================================
// Shutdown Safety (Requirement 1.7)
// ============================================================

test('shutdown on uninitialized group is safe', async (t) => {
  const group = new RaftGroup(buildOptions());

  t.equal(
    group.getRaftInstance(), null,
    'raft should be null before initialize',
  );

  await group.shutdown();

  t.equal(
    group.getRaftInstance(), null,
    'raft should still be null after shutdown',
  );
  t.equal(
    group.initialized, false,
    'initialized should be false after shutdown',
  );
  t.equal(
    group.electionStarted, false,
    'electionStarted should be false after shutdown',
  );
});

test('shutdown clears raft instance and state flags', async (t) => {
  const group = new RaftGroup(buildOptions({
    replicaId: 'shutdown-replica',
    replicaIds: ['shutdown-replica'],
  }));

  group.initialize();
  t.ok(
    group.getRaftInstance(),
    'raft should exist after initialize',
  );

  let shutdownEmitted = false;
  group.on(RAFT_GROUP_EVENT.SHUTDOWN, () => {
    shutdownEmitted = true;
  });

  await safeShutdown(group);

  t.equal(
    group.getRaftInstance(), null,
    'raft should be null after shutdown',
  );
  t.equal(
    group.initialized, false,
    'initialized should be false after shutdown',
  );
  t.equal(
    group.electionStarted, false,
    'electionStarted should be false after shutdown',
  );
  t.ok(shutdownEmitted, 'shutdown event should have been emitted');
});

// ============================================================
// Double startElection Idempotency (Requirement 1.5)
// ============================================================

test('double startElection is idempotent', async (t) => {
  let group;
  try {
    group = new RaftGroup(buildOptions({
      replicaId: 'idempotent-replica',
      replicaIds: ['idempotent-replica'],
    }));

    group.initialize();

    let leaderEventCount = NUM.ZERO;
    group.on(RAFT_GROUP_EVENT.LEADER, () => {
      leaderEventCount++;
    });

    group.startElection();
    group.startElection();

    t.equal(
      leaderEventCount, NUM.ONE,
      'leader event should be emitted only once',
    );
    t.equal(
      group.getRole(), RAFT_GROUP_ROLE.LEADER,
      'role should still be leader after second call',
    );
  } finally {
    await safeShutdown(group);
  }
});
