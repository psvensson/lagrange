import LifeRaft from '@markwylde/liferaft';
import {test} from '../../src/test-helpers/tap.js';
import {
  applyRuntimeRaftTiming,
  computeReplicaElectionTimeouts,
} from '../../src/raft/raft-timing-utils.js';

test('computeReplicaElectionTimeouts applies index-based jitter', async (t) => {
  const result = computeReplicaElectionTimeouts({
    replicaId: 'r2',
    replicaIds: ['r1', 'r2', 'r3'],
    baseElectionMinMs: 1000,
    baseElectionMaxMs: 3000,
    electionJitterPerReplicaMs: 500,
  });

  t.equal(result.jitterMs, 500, 'should apply one jitter step for index 1');
  t.equal(result.electionMinMs, 1500, 'should add jitter to election min');
  t.equal(result.electionMaxMs, 3500, 'should add jitter to election max');
});

test('computeReplicaElectionTimeouts uses hash fallback for unknown replicas', async (t) => {
  const result = computeReplicaElectionTimeouts({
    replicaId: 'dynamic-replica',
    replicaIds: ['r1', 'r2', 'r3'],
    baseElectionMinMs: 1000,
    baseElectionMaxMs: 3000,
    electionJitterPerReplicaMs: 500,
  });

  t.ok(result.jitterMs >= 1500, 'fallback jitter should be above static replicas');
  t.equal(
    result.electionMinMs,
    1000 + result.jitterMs,
    'fallback should still preserve min+jitter relation',
  );
  t.equal(
    result.electionMaxMs,
    3000 + result.jitterMs,
    'fallback should still preserve max+jitter relation',
  );
});

test('computeReplicaElectionTimeouts without rotation key preserves index-0 preference (backward compat)', async (t) => {
  const replicaIds = ['r1', 'r2', 'r3', 'r4', 'r5'];
  const base = {
    replicaIds,
    baseElectionMinMs: 1000,
    baseElectionMaxMs: 3000,
    electionJitterPerReplicaMs: 500,
  };
  // No partitionRotationKey: the index-0 replica must still get jitter 0.
  t.equal(
    computeReplicaElectionTimeouts({...base, replicaId: 'r1'}).jitterMs,
    0,
    'index-0 replica keeps jitter 0 when no rotation key supplied',
  );
  t.equal(
    computeReplicaElectionTimeouts({...base, replicaId: 'r3'}).jitterMs,
    1000,
    'index-2 replica keeps index*step jitter when no rotation key supplied',
  );
});

test('computeReplicaElectionTimeouts rotates leadership preference per partition (de-concentration)', async (t) => {
  const replicaIds = ['r1', 'r2', 'r3', 'r4', 'r5'];
  const step = 500;
  const base = {
    replicaIds,
    baseElectionMinMs: 1000,
    baseElectionMaxMs: 3000,
    electionJitterPerReplicaMs: step,
  };

  // For one partition key, the rotation must be a PERMUTATION of the jitter set
  // {0, 500, 1000, 1500, 2000} — every replica still gets a DISTINCT jitter, so the
  // split-vote-avoidance property is preserved.
  const partitionKey = 'sql_transactions-p1';
  const jittersForPartition = replicaIds.map((replicaId) =>
    computeReplicaElectionTimeouts({
      ...base, replicaId, partitionRotationKey: partitionKey,
    }).jitterMs);
  const expectedSet = replicaIds.map((_unused, index) => index * step);
  t.same(
    [...jittersForPartition].sort((a, b) => a - b),
    expectedSet,
    'rotated jitters are a permutation of the index-based jitter set (all distinct)',
  );

  // The pure function must be cross-node deterministic: identical inputs => identical
  // output (this is what keeps every node electing the same preferred leader).
  t.equal(
    computeReplicaElectionTimeouts({
      ...base, replicaId: 'r3', partitionRotationKey: partitionKey,
    }).jitterMs,
    computeReplicaElectionTimeouts({
      ...base, replicaId: 'r3', partitionRotationKey: partitionKey,
    }).jitterMs,
    'rotation is deterministic for identical inputs',
  );

  // RED-ON-REVERT: across many partitions the preferred (jitter-0) replica must NOT be
  // a single index. Without the rotation, index-0 is ALWAYS preferred and this set has
  // size 1 — which is the leadership-concentration root being fixed.
  const partitions = [
    'sql_transactions-p1', 'sql_write_operations-p1',
    'sql_transaction_participants-p1', 'control_plane_publications-p1',
    'code-p1', 'replica_operations-p1', 'wasm_operations-p1',
    'latency_groups-p1', 'storage_reservations-p1',
  ];
  const preferredIndexes = new Set();
  for (const partitionRotationKey of partitions) {
    let bestIndex = -1;
    let bestJitter = Number.POSITIVE_INFINITY;
    replicaIds.forEach((replicaId, index) => {
      const jitter = computeReplicaElectionTimeouts({
        ...base, replicaId, partitionRotationKey,
      }).jitterMs;
      if (jitter < bestJitter) {
        bestJitter = jitter;
        bestIndex = index;
      }
    });
    preferredIndexes.add(bestIndex);
  }
  t.ok(
    preferredIndexes.size >= 3,
    `preferred-leader replica varies across partitions ` +
    `(distinct preferred indexes=${preferredIndexes.size}, ` +
    `expected >=3; concentration bug would give 1)`,
  );
});

test('applyRuntimeRaftTiming updates live raft and rearms timers', async (t) => {
  let lastHeartbeatDuration = null;
  const leaderRaft = {
    beat: 50,
    state: LifeRaft.LEADER,
    election: {min: 1000, max: 3000},
    heartbeat(duration) {
      lastHeartbeatDuration = duration;
    },
    timeout() {
      return 1111;
    },
  };

  const appliedLeader = applyRuntimeRaftTiming({
    raft: leaderRaft,
    heartbeatMs: 80,
    electionMinMs: 1500,
    electionMaxMs: 3500,
    rearmTimer: true,
  });
  t.ok(appliedLeader, 'should apply timing to leader raft');
  t.equal(leaderRaft.beat, 80, 'should update heartbeat interval');
  t.equal(leaderRaft.election.min, 1500, 'should update election min');
  t.equal(leaderRaft.election.max, 3500, 'should update election max');
  t.equal(lastHeartbeatDuration, 80, 'leader should rearm with beat interval');

  let followerHeartbeatDuration = null;
  const followerRaft = {
    beat: 50,
    state: LifeRaft.FOLLOWER,
    election: {min: 1000, max: 3000},
    heartbeat(duration) {
      followerHeartbeatDuration = duration;
    },
    timeout() {
      return 2222;
    },
  };
  const appliedFollower = applyRuntimeRaftTiming({
    raft: followerRaft,
    heartbeatMs: 90,
    electionMinMs: 1600,
    electionMaxMs: 3600,
    rearmTimer: true,
  });
  t.ok(appliedFollower, 'should apply timing to follower raft');
  t.equal(followerHeartbeatDuration, 2222, 'follower should rearm using election timeout');
});
