// A peer's MsgPropose is refused at the ingress, counted and visible
// (verify-raft-owner-authority.md C-4). No sender in this system forwards a
// proposal any more: a replica that does not lead refuses it
// (raft-rs-proposal-term.js), and the three production proposers propose
// only while they lead. A MsgPropose arriving is therefore a defective or
// older peer's, and admitting it would let the leader append it under its
// own term - bypassing the rule that a proposal enters the core only under
// the leadership it was submitted under. The refusal is the delivery's
// answer (CORE_REFUSED at the admission phase, a named ingress refusal) and
// is recorded against its sender in the group's status, with its count.
//
// Real: three raft-rs partition ports (PartitionNodeCluster), their runtime
// owner, ingress and SQLite stores. Substituted: the transport (in-process
// inboxes) and the forwarded proposal itself: synthesized from B's real raft
// id in the shape raft-rs's step_follower forwards (no term, one NORMAL entry
// that is a port proposal).
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {RAFT_ROLE} from '../../../src/raft/constants.js';
import {RAFT_OPERATION_OUTCOME} from '../../../src/raft/raft-operation-port-constants.js';
// A namespace import, so the witness loads before the refusal's name exists.
import * as INGRESS_CONTRACT from '../../../src/raft/raft-rs-ingress-constants.js';
import {encodeProposal} from '../../../src/raft/raft-rs-proposal-codec.js';
import {RAFT_RS_ENTRY_TYPE} from '../../../src/raft/raft-rs-ready-loop-constants.js';
import {turnChainValue} from '../../../src/raft/raft-rs-turn-answer.js';
import {envelopeTo} from './identity-reuse-harness.js';
import {PartitionNodeCluster} from './partition-node-cluster.js';

const REPLICAS = Object.freeze(['fpi-a', 'fpi-b', 'fpi-c']);
const [A, B] = REPLICAS;
const FORWARDED = 'forwarded-by-a-defective-or-older-peer';
const ROUNDS = 200;

test('ingress: a peer\'s MsgPropose is refused by name, recorded against its ' +
  'sender, and never appended', async () => {
  const applied = [];
  const cluster = new PartitionNodeCluster({partitionId: 'forwarded-proposal-ingress',
    replicaIds: [...REPLICAS],
    applyFor: (replicaId, command) => applied.push({replicaId, command})});
  try {
    assert.equal(cluster.settle(() => cluster.leaderReplicaId() === A), true,
      'setup: A leads');
    const b = String(cluster.raftPeerIdOf(B));
    const a = String(cluster.raftPeerIdOf(A));
    const answer = await turnChainValue(cluster.node(A).step(envelopeTo(
      cluster.partitionId, a, {msgType: INGRESS_CONTRACT.RAFT_RS_MESSAGE_TYPE.PROPOSE,
        from: b, entries: [{entryType: RAFT_RS_ENTRY_TYPE.NORMAL,
          data: Buffer.from(encodeProposal(FORWARDED)).toString('base64')}]})));
    cluster.tickers = [A];
    cluster.settle(() => applied.some((one) => one.command === FORWARDED),
      {rounds: ROUNDS});
    const status = cluster.node(A).readStatus();
    const record = status.inboundStepRefusals.find((one) => one.from === b) ?? null;
    const measured = {answer, record, role: status.role,
      applied: applied.filter((one) => one.command === FORWARDED)};
    const report = `measured ${JSON.stringify(measured)}`;
    assert.equal(status.role, RAFT_ROLE.LEADER, `premise: A still leads: ${report}`);
    const refusal = INGRESS_CONTRACT.RAFT_RS_INGRESS_REFUSAL.FORWARDED_PROPOSAL;
    assert.deepEqual({outcome: answer.outcome, reason: answer.reason,
      recorded: record === null ? null : {reason: record.reason,
        refusalCount: record.refusalCount},
      applied: measured.applied.length},
    {outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED, reason: refusal,
      recorded: {reason: refusal, refusalCount: 1}, applied: 0},
    `a forwarded proposal is refused at the ingress, counted, never appended: ${report}`);
  } finally {
    cluster.dispose();
  }
});
