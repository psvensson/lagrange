// Why a peer may not take part in an election, by name, and the two core
// settings §11 requires to be settled by measurement.
//
// Every refusal is a named state rather than a false: the caller of an
// election guard has to be able to say WHICH rule stopped it, because three
// of the four are the core's own configuration answering and the fourth is
// Lagrange answering something the core cannot know.

const RAFT_RS_ELECTION_OUTCOME = Object.freeze({
  ADMITTED: 'admitted',
  CAMPAIGNED: 'campaigned',
});

const RAFT_RS_ELECTION_REFUSAL = Object.freeze({
  // Lagrange's own durable record says this replica was retired. The core
  // cannot know it: a peer that was removed while it could not hear the
  // cluster still holds a configuration that lists it as a voter, and that
  // is exactly the peer the verifier measured deposing a leader.
  RETIRED_BY_HOST: 'retired-by-host',
  // Absent from the voters of its OWN committed configuration.
  NOT_A_VOTER: 'not-a-voter',
  // A learner in its own committed configuration.
  LEARNER: 'learner',
  // The configuration says voter and the core says otherwise. The two
  // disagreeing is not something to resolve by preferring one.
  CORE_NOT_PROMOTABLE: 'core-not-promotable',
});

const RAFT_RS_ELECTION_SETTING = Object.freeze({
  PRE_VOTE: 'preVote',
  CHECK_QUORUM: 'checkQuorum',
});

const RAFT_RS_ELECTION_ERROR_MSG = Object.freeze({
  retiredByHost: (peerId) =>
    `peer ${peerId} is retired in Lagrange's own durable record. Its core ` +
    'still holds a configuration that lists it, because it never heard the ' +
    'change; ticking or campaigning it disturbs the cluster it has left',
  notAVoter: (peerId, voters) =>
    `peer ${peerId} is not a voter in its own committed configuration ` +
    `(${voters.join(', ') || 'no voters'}), so it may not campaign`,
  learner: (peerId) =>
    `peer ${peerId} is a learner in its own committed configuration. A ` +
    'learner that campaigns can win, which the round-3 verifier measured',
  coreNotPromotable: (peerId) =>
    `peer ${peerId} is a voter in its own committed configuration but the ` +
    'core reports it not promotable. The two disagree, and the guard ' +
    'refuses rather than choosing one of them',
});

const RAFT_RS_ELECTION_EVIDENCE_MSG = Object.freeze({
  run: (run) =>
    `preVote=${run.settings[RAFT_RS_ELECTION_SETTING.PRE_VOTE]} ` +
    `checkQuorum=${run.settings[RAFT_RS_ELECTION_SETTING.CHECK_QUORUM]}: ` +
    `terms burned while cut off ${run.termsBurnedWhileCutOff}, ` +
    `pre-candidate role seen ${run.sawPreCandidate}, ` +
    `leader held while cut off ${run.leaderHeldWhileCutOff}, ` +
    `leader deposed on heal ${run.leaderDeposedOnHeal}, ` +
    `rounds to restabilise ${run.roundsToRestabilise}, ` +
    `isolated leader stood down ${run.isolatedLeaderStoodDown}`,
  derivation: (setting, reason) => `${setting}: ${reason}`,
  preVoteOn:
    'a cut-off peer stops burning terms, so healing it does not carry the ' +
    'leader up with it',
  preVoteOff:
    'the scenario showed no term saving, so there is nothing to pay for',
  checkQuorumOn:
    'an isolated leader stands down by itself instead of continuing to ' +
    'believe it leads until something tells it otherwise',
  checkQuorumOff:
    'the isolated-leader scenario showed no difference, so this run does ' +
    'not justify the setting',
});

export {
  RAFT_RS_ELECTION_ERROR_MSG,
  RAFT_RS_ELECTION_EVIDENCE_MSG,
  RAFT_RS_ELECTION_OUTCOME,
  RAFT_RS_ELECTION_REFUSAL,
  RAFT_RS_ELECTION_SETTING,
};
