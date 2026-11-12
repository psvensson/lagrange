// A leader's consensus status for a consumer's unit test, SHAPED BY ITS OWNER
// (raft-rs-status-observation.js shapeGroupObservation) from the facts a
// test states: which peers the committed configuration names, what each
// peer's identity and address resolve to, and the leader's own progress for
// each. A consumer test never writes the status object's fields itself, so
// it cannot drift from the shape the runtime answers.
import {
  RAFT_RS_PEER_IDENTITY_RESOLUTION,
} from '../../src/raft/raft-rs-peer-identity-constants.js';
import {shapeGroupObservation} from '../../src/raft/raft-rs-status-observation.js';

const LEADER_PEER_ID = '1';
const LEADER_RAFT_STATE = 2;

/**
 * @param {Object} facts {groupId, leaderReplicaIdentity, leaderAddress,
 *   peers: [{peerId, replicaIdentity (null: unreserved), address (null:
 *   unresolvable), matched, learner?}]}
 * @return {Object} The frozen status the runtime's readStatus() answers.
 */
function leaderStatusOf(facts) {
  const peers = new Map(facts.peers.map((peer) => [peer.peerId, peer]));
  const identityOf = (peerId) => {
    if (peerId === LEADER_PEER_ID) {
      return {status: RAFT_RS_PEER_IDENTITY_RESOLUTION.RESERVED,
        replicaIdentity: facts.leaderReplicaIdentity};
    }
    const peer = peers.get(peerId);
    return peer.replicaIdentity === null ?
      {status: RAFT_RS_PEER_IDENTITY_RESOLUTION.UNRESERVED} :
      {status: RAFT_RS_PEER_IDENTITY_RESOLUTION.RESERVED,
        replicaIdentity: peer.replicaIdentity};
  };
  const addressOf = (peerId) => {
    if (peerId === LEADER_PEER_ID) return facts.leaderAddress;
    const {address} = peers.get(peerId);
    if (address === null) throw new Error('peer address unavailable');
    return address;
  };
  const group = {groupId: facts.groupId,
    replicaIdentity: facts.leaderReplicaIdentity, peerId: LEADER_PEER_ID,
    resolvePeerIdentity: identityOf, resolvePeerAddress: addressOf,
    peerDelivery: new Map(), inboundStepRefusals: new Map(), health: 'usable'};
  const confState = {
    voters: [LEADER_PEER_ID, ...facts.peers.filter(({learner}) => !learner)
      .map(({peerId}) => peerId)],
    learners: facts.peers.filter(({learner}) => learner).map(({peerId}) => peerId),
  };
  const observation = {
    status: {term: '3', commit: '9', applied: '9', pendingConfIndex: '0',
      lead: LEADER_PEER_ID, raftState: LEADER_RAFT_STATE,
      progress: facts.peers.map(({peerId, matched}) => ({id: peerId, matched}))},
    confState, appliedIndex: 9, lastIndex: 9n, configurationKey: 'fixture',
    membershipGenerationIndex: 0, lifecycleIncarnation: 'fixture',
    participation: {}, runtimeHealth: 'healthy', runtimeGeneration: 1};
  return shapeGroupObservation(group, observation, (error) => {
    throw error;
  });
}

export {leaderStatusOf};
