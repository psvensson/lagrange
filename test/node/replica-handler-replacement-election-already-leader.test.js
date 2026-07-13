import t from 'tap';
import LifeRaft from '../../src/raft/liferaft.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {ReplicaOperationReason} from
  '../../src/rebalancer/replica-operation-constants.js';
import {assignReplicaHandlerLeaderHandoffMethods} from
  '../../src/node/replica-handler-leader-handoff-methods.js';

// Quest formation-ledger-self-move-blocks-cluster-ops: a
// `replace_target_leader_election` STEP_DOWN names the replica that SHOULD
// lead. When that replica has ALREADY won leadership through an ambient
// election (the request raced the election it asked for), the goal is
// achieved — yet the unfixed handler fell through to the generic
// leader-demotion branch and DEMOTED the replica it was electing.
// Live-observed (probe-local-run-2026-07-13T0512): the freshly elected
// ledger target r5 was demoted at 05:18:23.576 and the overloaded seed
// retook ledger leadership (terms 6/10/13), extending the formation
// admission freeze. RED-ON-REVERT: the already-leader case below demotes
// (raft.change to follower) on the unfixed handler.

const TEST_REPLICA_ID = 'replica_operations-p1-r5';

function buildHandlerHost(trackedRole) {
  const calls = {
    change: [],
    deferCandidacy: 0,
    requestElectionNow: 0,
    startElectionTimer: 0,
    cancelLeaderOwnedActivation: 0,
  };
  const raft = {
    change: (transition) => calls.change.push(transition),
    deferCandidacy: () => {
      calls.deferCandidacy += 1;
    },
  };
  const raftProvider = {
    requestElectionNow: () => {
      calls.requestElectionNow += 1;
    },
    startElectionTimer: () => {
      calls.startElectionTimer += 1;
    },
  };
  const service = {
    raft,
    raftProvider,
    cancelLeaderOwnedActivation: () => {
      calls.cancelLeaderOwnedActivation += 1;
    },
  };
  class HandlerHost {
    getTrackedService(replicaId) {
      return replicaId === TEST_REPLICA_ID ? service : null;
    }
    getTrackedReplicaRole(replicaId) {
      return replicaId === TEST_REPLICA_ID ? trackedRole : null;
    }
  }
  assignReplicaHandlerLeaderHandoffMethods(HandlerHost);
  return {handler: new HandlerHost(), calls};
}

t.test(
  'replacement election on an already-leader replica completes without ' +
    'demoting it',
  (t) => {
    const {handler, calls} = buildHandlerHost(RAFT_ROLE.LEADER);
    const state = handler.requestTrackedPartitionLeaderHandoff(
      TEST_REPLICA_ID,
      ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION,
    );
    t.equal(state, 'completed', 'handoff reports completed');
    t.strictSame(
      calls.change,
      [],
      'the already-elected replacement is never stepped down',
    );
    t.equal(calls.deferCandidacy, 0, 'no candidacy deferral is applied');
    t.equal(
      calls.requestElectionNow,
      0,
      'no redundant election is requested',
    );
    t.equal(
      calls.startElectionTimer,
      0,
      'the election timer is not re-armed',
    );
    t.end();
  },
);

t.test(
  'replacement election on a follower replica still requests the election',
  (t) => {
    const {handler, calls} = buildHandlerHost(RAFT_ROLE.FOLLOWER);
    const state = handler.requestTrackedPartitionLeaderHandoff(
      TEST_REPLICA_ID,
      ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION,
    );
    t.equal(state, 'completed', 'handoff reports completed');
    t.equal(calls.requestElectionNow, 1, 'election requested exactly once');
    t.strictSame(calls.change, [], 'no demotion on the follower path');
    t.end();
  },
);

t.test(
  'replacement election on a mid-election candidate completes without ' +
    'interference',
  (t) => {
    const {handler, calls} = buildHandlerHost(RAFT_ROLE.CANDIDATE);
    const state = handler.requestTrackedPartitionLeaderHandoff(
      TEST_REPLICA_ID,
      ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION,
    );
    t.equal(state, 'completed', 'handoff reports completed');
    t.strictSame(calls.change, [], 'the candidate is not stepped down');
    t.equal(calls.requestElectionNow, 0, 'its own election is not preempted');
    t.end();
  },
);

t.test(
  'source-side demotion of a tracked leader is unchanged',
  (t) => {
    const {handler, calls} = buildHandlerHost(RAFT_ROLE.LEADER);
    const state = handler.requestTrackedPartitionLeaderHandoff(
      TEST_REPLICA_ID,
      ReplicaOperationReason.REPLACE_SOURCE_LEADER_HANDOFF,
    );
    t.equal(state, 'completed', 'handoff reports completed');
    t.equal(calls.change.length, 1, 'the source leader steps down once');
    t.equal(
      calls.change[0]?.state,
      LifeRaft.FOLLOWER,
      'demotion targets follower state',
    );
    t.equal(calls.deferCandidacy, 1, 'candidacy deferral precedes re-arm');
    t.equal(calls.startElectionTimer, 1, 'election timer re-armed');
    t.equal(
      calls.cancelLeaderOwnedActivation,
      1,
      'leader-owned activation cancelled',
    );
    t.end();
  },
);
