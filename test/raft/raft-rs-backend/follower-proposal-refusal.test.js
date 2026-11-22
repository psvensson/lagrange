// A replica whose core does not lead never proposes: its port refuses the
// proposal with its one named refusal (the submitting leadership ended), and
// nothing is forwarded. raft-rs 0.7 would otherwise forward a follower's proposal to the
// leader it knows (raft.rs step_follower, MsgPropose; the binding has no
// switch for it), where the entry commits under that leader's term although
// the replica it was submitted to never led it. Nothing in this system relies
// on that forwarding: partition writes, message groups and WASM services
// propose only while they lead and route to the leader themselves
// (raft-frame-delivery-record.md section 16). The queued-proposal case of the
// same rule is witness c, queued-proposal-leadership-fence.test.js (copied
// from work/write-kernel-tenure-fence-20261121, 0bb5c4738).
//
// Real: three raft-rs partition ports (PartitionNodeCluster), their runtime
// owner and SQLite stores. Substituted: the transport (in-process inboxes,
// delivered by the test; the follower's sends are counted) and the clock (the
// cluster's own tick driver).
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {PartitionNodeCluster} from './partition-node-cluster.js';
import {RAFT_OPERATION_OUTCOME, RAFT_PROPOSAL_REFUSAL} from
  '../../../src/raft/raft-operation-port-constants.js';
import {RAFT_RS_MESSAGE_TYPE} from '../../../src/raft/raft-rs-ingress-constants.js';
import {turnChainValue} from '../../../src/raft/raft-rs-turn-answer.js';

const REPLICAS = Object.freeze(['follower-propose-a', 'follower-propose-b',
  'follower-propose-c']);
const FOLLOWER_COMMAND = 'proposed-at-a-follower';
const COMMIT_ROUNDS = 60;

test('port: a follower refuses a proposal and forwards nothing', async () => {
  const committed = [];
  const sent = [];
  const cluster = new PartitionNodeCluster({
    partitionId: 'follower-proposal-refusal',
    replicaIds: [...REPLICAS],
    sendFor: (fromReplicaId, peerAddress, packet) => {
      sent.push({from: fromReplicaId, msgType: packet?.message?.msgType});
      return undefined;
    },
    applyFor: (replicaId, command, {index, term}) => {
      committed.push({replicaId, command, index: Number(index), term: Number(term)});
    },
  });
  try {
    assert.equal(cluster.settle(() => cluster.leaderReplicaId() !== null), true,
      'setup: the real group elects a leader');
    const leader = cluster.leaderReplicaId();
    const follower = REPLICAS.find((replicaId) => replicaId !== leader);
    const mark = sent.length;
    const answer = await turnChainValue(cluster.node(follower).propose(FOLLOWER_COMMAND));
    const forwarded = sent.slice(mark).filter((one) => one.from === follower &&
      one.msgType === RAFT_RS_MESSAGE_TYPE.PROPOSE).length;
    cluster.tickers = [leader];
    cluster.settle(() => committed.some((one) => one.command === FOLLOWER_COMMAND),
      {rounds: COMMIT_ROUNDS});
    const report = JSON.stringify({leader, follower,
      answer: {outcome: answer?.outcome ?? null, reason: answer?.reason ?? null,
        phase: answer?.phase ?? null},
      forwarded,
      commits: committed.filter((one) => one.command === FOLLOWER_COMMAND)});
    assert.deepEqual({
      outcome: answer?.outcome,
      reason: answer?.reason,
      forwarded,
      commits: committed.filter((one) => one.command === FOLLOWER_COMMAND).length,
    }, {
      outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
      reason: RAFT_PROPOSAL_REFUSAL.SUBMITTING_LEADERSHIP_ENDED,
      forwarded: 0,
      commits: 0,
    }, `a follower's proposal is refused and never forwarded: ${report}`);
  } finally {
    cluster.dispose();
  }
});
