// Fixed observations of one group whose configuration names every kind of
// peer a status shapes: a reserved leader, voters, a learner, a voter this
// replica holds no committed node for (its address unavailable), a retired
// peer (reserved, removed from the configuration, still in the leader's
// progress) and a peer id this replica never reserved. The registry is the
// real one; only the host's address answer is the fixture's.
import {PEER_DELIVERY_OUTCOME} from '../../src/raft/raft-rs-runtime-owner-constants.js';

const SELF = 'shape-self';
const LEADER = 'shape-leader';
const VOTER = 'shape-voter';
const LEARNER = 'shape-learner';
const NO_NODE = 'shape-no-node';
const RETIRED = 'shape-retired';
const UNKNOWN_PEER_ID = '4242424242';
const NODE_OF = Object.freeze({[SELF]: 'node-self', [LEADER]: 'node-a',
  [VOTER]: 'node-b', [LEARNER]: 'node-c', [RETIRED]: 'node-d'});
const HOST_NO_NODE = 'host-has-no-node-for-peer';

// Reserve every replica and record each committed node; NO_NODE has none.
function reserve(registry) {
  const ids = {unknown: UNKNOWN_PEER_ID};
  for (const replica of [SELF, LEADER, VOTER, LEARNER, NO_NODE, RETIRED]) {
    ids[replica] = registry.registerReplica(replica);
    if (NODE_OF[replica] !== undefined) {
      registry.recordCommittedNodeId(replica, NODE_OF[replica]);
    }
  }
  return ids;
}

// The host's address of a replica on its committed node.
function hostAddress(replicaIdentity, nodeId) {
  if (nodeId === null) throw new Error(HOST_NO_NODE);
  return `ws://${nodeId}/raft/${replicaIdentity}`;
}

function groupOf(ids, resolution) {
  return {groupId: 'shape-group', replicaIdentity: SELF, peerId: ids[SELF],
    health: 'healthy',
    peerDelivery: new Map([[String(ids[VOTER]),
      Object.freeze({outcome: PEER_DELIVERY_OUTCOME.NONE_OBSERVED})]]),
    inboundStepRefusals: new Map([['x', Object.freeze({from: ids[VOTER], count: 2})]]),
    ...resolution};
}

function observationOf(ids, status) {
  const voters = [ids[SELF], ids[LEADER], ids[VOTER], ids[NO_NODE], ids.unknown];
  const learners = [ids[LEARNER]];
  return {status, confState: {voters, learners, votersOutgoing: [], learnersNext: [],
    autoLeave: false},
  appliedIndex: 40, lastIndex: 41n, configurationKey: 'shape-key',
  membershipGenerationIndex: 3, lifecycleIncarnation: 'shape-incarnation',
  voterLiveness: {liveVoters: [ids[SELF], ids[VOTER]]},
  participation: {gateOpen: true, participationAppliedIndex: 40},
  runtimeHealth: 'healthy', runtimeGeneration: 7};
}

// [name] -> observation: a follower of a reserved leader, the leader itself
// (follower progress of every peer kind), and a follower whose leader this
// replica never reserved.
function observations(ids) {
  const base = {term: '5', commit: '40', applied: '40', pendingConfIndex: '30'};
  const progress = [ids[SELF], ids[LEADER], ids[VOTER], ids[NO_NODE], ids.unknown,
    ids[LEARNER], ids[RETIRED]].map((id, index) => ({id, matched: String(30 + index)}));
  return {
    followerOfReservedLeader: observationOf(ids, {...base, lead: ids[LEADER],
      raftState: 0, progress: []}),
    leader: observationOf(ids, {...base, lead: ids[SELF], raftState: 2, progress}),
    followerOfUnknownLeader: observationOf(ids, {...base, lead: ids.unknown,
      raftState: 0, progress: []}),
  };
}

export {groupOf, hostAddress, observations, reserve};
