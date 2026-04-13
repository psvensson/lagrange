// @ts-nocheck
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
