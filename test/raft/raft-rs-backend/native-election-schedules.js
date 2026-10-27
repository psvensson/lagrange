// One membership-schedule vocabulary over two clusters on the real WASM
// core with the production election settings (pre_vote and check_quorum on):
//   guarded - production partition ports (PartitionNodeCluster through
//             createRaftRsOperationPort: the ingress schema, the local-log
//             guard, the participation gate, the joiner opened from a
//             committed stamp as a learner of its own configuration);
//   plain   - raft-rs alone (DeterministicRaftRsCluster: every message
//             stepped straight into the core, a joiner created holding the
//             configuration it joins, as raft-rs's own examples do).
// A schedule names replicas; each driver maps the names to its own peers and
// answers the same questions, so a witness can run one schedule on both and
// compare what each elects. Nothing here decides a verdict.

import {PartitionNodeCluster} from './partition-node-cluster.js';
import {DeterministicRaftRsCluster} from './deterministic-raft-rs-cluster.js';
import {RAFT_OPERATION} from
  '../../../src/raft/raft-operation-port-constants.js';
import {COMMITTED_MEMBERSHIP_READ_PURPOSE} from
  '../../../src/raft/raft-committed-membership-constants.js';
import {RAFT_OPERATION_PORT_REQUEST} from
  '../../../src/raft/raft-operation-port-request.js';
import {RAFT_RS_CONF_CHANGE_TYPE} from
  '../../../src/raft/raft-rs-ready-loop-constants.js';
import {RAFT_RS_MESSAGE_TYPE} from
  '../../../src/raft/raft-rs-ingress-constants.js';

const LEADER_STATE = 2;
const LEADER = 'leader';
const PLAIN_ID_BASE = 11;
const SETTLE_AFTER_ELECTION_ROUNDS = 50;

// Whether a message from `from` to `to` crosses a cut link.
function linkCut(cuts, from, to) {
  return cuts.some(([left, right]) =>
    (left.has(from) && right.has(to)) || (left.has(to) && right.has(from)));
}

/**
 * Production partition ports.
 */
class GuardedSchedule {
  constructor(prefix, founders) {
    this.prefix = prefix;
    this.cuts = [];
    this.lost = new Set();
    this.onlyHeartbeatsTo = new Set();
    this.cluster = new PartitionNodeCluster({
      partitionId: prefix, replicaIds: founders,
      sendFor: (from, address, packet) => {
        const toName = this.cluster.replicaIdOf(address);
        if (this.lost.has(from) || this.lost.has(toName) ||
          linkCut(this.cuts, from, toName) ||
          (this.onlyHeartbeatsTo.has(toName) &&
            packet?.message?.msgType !== RAFT_RS_MESSAGE_TYPE.HEARTBEAT)) {
          return null;
        }
        return undefined;
      },
    });
  }

  tick(names) {
    this.cluster.tickers = names.filter((name) => !this.lost.has(name));
    this.cluster.settle(() => false, {rounds: 1});
  }

  run(names, rounds, untilTrue = () => false) {
    for (let round = 0; round < rounds; round += 1) {
      if (untilTrue()) {
        return true;
      }
      this.tick(names);
    }
    return untilTrue();
  }

  status(name) {
    return this.cluster.node(name).readStatus();
  }

  leaderOf(names) {
    const leaders = names.filter((name) => this.status(name).role === LEADER);
    if (leaders.length !== 1) {
      return null;
    }
    const [leader] = leaders;
    return names.every((name) => this.status(name).leaderId === leader) ?
      leader : null;
  }

  voters(name) {
    const ids = this.status(name).confState.voters;
    return [...this.cluster.replicas.keys()]
      .filter((other) => ids.includes(this.cluster.raftPeerIdOf(other)));
  }

  learners(name) {
    const ids = this.status(name).confState.learners;
    return [...this.cluster.replicas.keys()]
      .filter((other) => ids.includes(this.cluster.raftPeerIdOf(other)));
  }

  term(name) {
    return Number(this.status(name).term);
  }

  applied(name) {
    return Number(this.status(name).appliedIndex);
  }

  join(leader, name) {
    // The committed read answers once the leader applied an entry of its
    // own term.
    this.run([leader], SETTLE_AFTER_ELECTION_ROUNDS, () =>
      Number(this.status(leader).appliedIndex) > 0);
    const stamp = this.cluster.node(leader)[RAFT_OPERATION
      .READ_COMMITTED_MEMBERSHIP]({
      purpose: COMMITTED_MEMBERSHIP_READ_PURPOSE.BOOTSTRAP});
    this.cluster.addReplica(name, this.cluster.replicaIds.slice(0, 1), {
      [RAFT_OPERATION_PORT_REQUEST.BOOTSTRAP_MEMBERSHIP]: stamp});
  }

  change(leader, changeType, name) {
    this.cluster.proposeConfigurationChange([{changeType,
      nodeId: this.cluster.raftPeerIdOf(name)}], 0, leader);
  }

  dispose() {
    this.cluster.dispose();
  }
}

/**
 * raft-rs alone.
 */
class PlainSchedule {
  constructor(prefix, founders) {
    this.names = new Map(founders.map((name, index) =>
      [name, String(PLAIN_ID_BASE + index)]));
    this.cuts = [];
    this.lost = new Set();
    this.onlyHeartbeatsTo = new Set();
    this.cluster = new DeterministicRaftRsCluster({
      voters: [...this.names.values()], groupId: prefix,
      dispatch: (peer, message) => {
        const from = this.nameOf(message.from);
        const to = this.nameOf(message.to);
        if (this.lost.has(from) || this.lost.has(to) ||
          linkCut(this.cuts, from, to) ||
          (this.onlyHeartbeatsTo.has(to) &&
            message.msgType !== RAFT_RS_MESSAGE_TYPE.HEARTBEAT)) {
          return;
        }
        try {
          this.cluster.core.step(peer.handle, message);
        } catch (error) {
          // raft-rs's own refusal (a response from a peer it no longer
          // tracks): a host drops it, as the guarded runtime records it.
          if (!String(error?.message ?? error).includes('peer not found')) {
            throw error;
          }
        }
      },
    });
  }

  nameOf(peerId) {
    return [...this.names].find(([, id]) => id === String(peerId))?.[0];
  }

  live(names) {
    return names.filter((name) => !this.lost.has(name))
      .map((name) => this.names.get(name));
  }

  run(names, rounds, untilTrue = () => false) {
    return this.cluster.settle(() => untilTrue(),
      {rounds, tickOnly: this.live(names)});
  }

  tick(names) {
    this.run(names, 1);
  }

  status(name) {
    return this.cluster.status(this.names.get(name));
  }

  leaderOf(names) {
    const leaders = names.filter((name) =>
      this.status(name).raftState === LEADER_STATE);
    if (leaders.length !== 1) {
      return null;
    }
    const leaderId = this.names.get(leaders[0]);
    return names.every((name) => this.status(name).lead === leaderId) ?
      leaders[0] : null;
  }

  voters(name) {
    const ids = this.cluster.confState(this.names.get(name)).voters;
    return [...this.names].filter(([, id]) => ids.includes(id))
      .map(([other]) => other);
  }

  learners(name) {
    const ids = this.cluster.confState(this.names.get(name)).learners;
    return [...this.names].filter(([, id]) => ids.includes(id))
      .map(([other]) => other);
  }

  term(name) {
    return Number(this.status(name).term);
  }

  applied(name) {
    return Number(this.status(name).applied);
  }

  join(leader, name) {
    this.names.set(name, String(PLAIN_ID_BASE + this.names.size));
    this.cluster.addPeer(this.names.get(name),
      this.cluster.confState(this.names.get(leader)).voters);
  }

  change(leader, changeType, name) {
    this.cluster.core.propose_conf_change_v2(
      this.cluster.peer(this.names.get(leader)).handle,
      {transition: 0, changes: [{changeType,
        nodeId: this.names.get(name)}]});
    this.cluster.runReady();
  }

  dispose() {
    this.cluster.dispose();
  }
}

const SCHEDULE_KIND = Object.freeze({
  guarded: GuardedSchedule,
  plain: PlainSchedule,
});

export {
  RAFT_RS_CONF_CHANGE_TYPE,
  SCHEDULE_KIND,
};
