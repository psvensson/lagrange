import t from 'tap';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {deepFreeze} from '../../src/raft/raft-operation-port.js';
import {
  RAFT_LEADERSHIP_TRANSFER_REASON,
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {ReplicaOperationReason} from
  '../../src/rebalancer/replica-operation-constants.js';
import {
  REPLICA_HANDLER_LEADER_HANDOFF_BRANCH,
  REPLICA_HANDLER_LEADER_HANDOFF_STATE,
  assignReplicaHandlerLeaderHandoffMethods,
} from '../../src/node/replica-handler-leader-handoff-methods.js';

// Quest formation-ledger-self-move-blocks-cluster-ops: a
// `replace_target_leader_election` STEP_DOWN names the replica that SHOULD
// lead. When that replica has ALREADY won leadership through an ambient
// election (the request raced the election it asked for), the goal is
// achieved — yet the unfixed handler fell through to the generic
// leader-demotion branch and DEMOTED the replica it was electing.
// Live-observed (probe-local-run-2026-07-13T0512): the freshly elected
// ledger target r5 was demoted at 05:18:23.576 and the overloaded seed
// retook ledger leadership (terms 6/10/13), extending the formation
// admission freeze.
//
// On the operation port both handoffs are one leadership transfer asked of
// the partition's one issuer (requestLeadershipTransfer): the target names
// itself, the source asks for its most caught-up voter. The role gates stay:
// an already-leading or mid-election target, and a source that no longer
// leads, ask for nothing. The real-core behaviour is witnessed on real
// partitions in replica-handler-leadership-transfer.test.js.

const TEST_REPLICA_ID = 'replica_operations-p1-r5';

function portAnswer(outcome, reason) {
  return deepFreeze({outcome, reason, retryable: false,
    recoveryRequired: false});
}

function buildHandlerHost(trackedRole, answer, service = null) {
  const transfers = [];
  const tracked = service || {
    requestLeadershipTransfer: async (request) => {
      transfers.push(request);
      return answer;
    },
  };
  class HandlerHost {
    getTrackedService(replicaId) {
      return replicaId === TEST_REPLICA_ID ? tracked : null;
    }
    getTrackedReplicaRole(replicaId) {
      return replicaId === TEST_REPLICA_ID ? trackedRole : null;
    }
  }
  assignReplicaHandlerLeaderHandoffMethods(HandlerHost);
  return {handler: new HandlerHost(), transfers};
}

t.test(
  'replacement election on an already-leader replica completes without ' +
    'asking for a transfer',
  async (t) => {
    const {handler, transfers} = buildHandlerHost(RAFT_ROLE.LEADER);
    const result = await handler.requestTrackedPartitionLeaderHandoff(
      TEST_REPLICA_ID,
      ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION,
    );
    t.equal(result.state, REPLICA_HANDLER_LEADER_HANDOFF_STATE.COMPLETED,
      'handoff reports completed');
    t.equal(
      result.branch,
      REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.TARGET_ELECTION_ROLE_NO_OP,
      'the no-op is NAMED in the typed result, not silent',
    );
    t.equal(result.trackedRole, RAFT_ROLE.LEADER, 'judged role echoed');
    t.strictSame(transfers, [],
      'the already-elected replacement asks for no transfer');
  },
);

t.test(
  'replacement election on a follower replica asks for leadership named ' +
    'to itself, once',
  async (t) => {
    const {handler, transfers} = buildHandlerHost(RAFT_ROLE.FOLLOWER,
      portAnswer(RAFT_OPERATION_OUTCOME.CORE_OK,
        RAFT_LEADERSHIP_TRANSFER_REASON.TRANSFER_FORWARDED));
    const result = await handler.requestTrackedPartitionLeaderHandoff(
      TEST_REPLICA_ID,
      ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION,
    );
    t.strictSame(transfers, [{
      successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
      replicaIdentity: TEST_REPLICA_ID,
    }], 'one transfer, naming the replacement itself');
    t.equal(result.state, REPLICA_HANDLER_LEADER_HANDOFF_STATE.COMPLETED);
    t.equal(result.branch,
      REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.TRANSFER_FORWARDED,
      'the forwarded transfer is distinguishable from a role no-op');
    t.equal(result.transfer.reason,
      RAFT_LEADERSHIP_TRANSFER_REASON.TRANSFER_FORWARDED,
      'the port answer rides along');
  },
);

t.test(
  'replacement election on a mid-election candidate completes without ' +
    'interference',
  async (t) => {
    const {handler, transfers} = buildHandlerHost(RAFT_ROLE.CANDIDATE);
    const result = await handler.requestTrackedPartitionLeaderHandoff(
      TEST_REPLICA_ID,
      ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION,
    );
    t.equal(result.state, REPLICA_HANDLER_LEADER_HANDOFF_STATE.COMPLETED);
    t.equal(
      result.branch,
      REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.TARGET_ELECTION_ROLE_NO_OP,
      'the mid-election no-op is named',
    );
    t.strictSame(transfers, [], 'its own election is not preempted');
  },
);

t.test(
  'source-side handoff of a tracked leader asks for its most caught-up ' +
    'successor, once',
  async (t) => {
    const {handler, transfers} = buildHandlerHost(RAFT_ROLE.LEADER,
      portAnswer(RAFT_OPERATION_OUTCOME.CORE_OK,
        RAFT_LEADERSHIP_TRANSFER_REASON.TRANSFER_REQUESTED));
    const result = await handler.requestTrackedPartitionLeaderHandoff(
      TEST_REPLICA_ID,
      ReplicaOperationReason.REPLACE_SOURCE_LEADER_HANDOFF,
    );
    t.strictSame(transfers, [{
      successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.MOST_CAUGHT_UP,
    }], 'the source hands leadership to its most caught-up voter');
    t.equal(result.state, REPLICA_HANDLER_LEADER_HANDOFF_STATE.COMPLETED);
    t.equal(result.branch,
      REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.TRANSFER_REQUESTED,
      'the requested transfer is named');
  },
);

t.test('a source replica that no longer leads asks for nothing', async (t) => {
  const {handler, transfers} = buildHandlerHost(RAFT_ROLE.FOLLOWER);
  const result = await handler.requestTrackedPartitionLeaderHandoff(
    TEST_REPLICA_ID,
    ReplicaOperationReason.REPLACE_SOURCE_LEADER_HANDOFF,
  );
  t.equal(result.branch,
    REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.SOURCE_DEMOTION_ROLE_NO_OP);
  t.strictSame(transfers, []);
});

t.test('a refused transfer is REFUSED with the port\'s typed record',
  async (t) => {
    const refusal = portAnswer(RAFT_OPERATION_OUTCOME.CORE_REFUSED,
      RAFT_LEADERSHIP_TRANSFER_REASON.TARGET_NOT_VOTER);
    const {handler} = buildHandlerHost(RAFT_ROLE.FOLLOWER, refusal);
    const result = await handler.requestTrackedPartitionLeaderHandoff(
      TEST_REPLICA_ID,
      ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION,
    );
    t.equal(result.state, REPLICA_HANDLER_LEADER_HANDOFF_STATE.REFUSED);
    t.equal(result.branch,
      REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.TRANSFER_REFUSED);
    t.equal(result.transfer, refusal, 'the refusal is carried, not restated');
  });

t.test('a tracked service with no transfer authority is NOT_SUPPORTED',
  async (t) => {
    const {handler} = buildHandlerHost(RAFT_ROLE.LEADER, null, {});
    const result = await handler.requestTrackedPartitionLeaderHandoff(
      TEST_REPLICA_ID,
      ReplicaOperationReason.REPLACE_SOURCE_LEADER_HANDOFF,
    );
    t.equal(result.state, REPLICA_HANDLER_LEADER_HANDOFF_STATE.NOT_SUPPORTED);
    t.equal(result.branch,
      REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.PROVIDER_UNSUPPORTED);
  });
