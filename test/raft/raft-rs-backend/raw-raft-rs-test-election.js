import {
  RAFT_RS_ELECTION_ERROR_MSG,
  RAFT_RS_ELECTION_OUTCOME,
  RAFT_RS_ELECTION_REFUSAL,
} from '../../../src/raft/raft-rs-election-safety-constants.js';

function refused(refusal, detail) {
  return Object.freeze({admitted: false, refusal, detail});
}

function raftRsElectionAdmissibility({core, handle, retiredByHost = false}) {
  const status = core.status(handle);
  const peerId = status.id;
  if (retiredByHost) {
    return refused(RAFT_RS_ELECTION_REFUSAL.RETIRED_BY_HOST,
      RAFT_RS_ELECTION_ERROR_MSG.retiredByHost(peerId));
  }
  const confState = core.conf_state(handle);
  if (confState.learners.includes(peerId)) {
    return refused(RAFT_RS_ELECTION_REFUSAL.LEARNER,
      RAFT_RS_ELECTION_ERROR_MSG.learner(peerId));
  }
  if (!confState.voters.includes(peerId)) {
    return refused(RAFT_RS_ELECTION_REFUSAL.NOT_A_VOTER,
      RAFT_RS_ELECTION_ERROR_MSG.notAVoter(peerId, confState.voters));
  }
  if (status.promotable !== true) {
    return refused(RAFT_RS_ELECTION_REFUSAL.CORE_NOT_PROMOTABLE,
      RAFT_RS_ELECTION_ERROR_MSG.coreNotPromotable(peerId));
  }
  return Object.freeze({
    admitted: true,
    refusal: null,
    detail: RAFT_RS_ELECTION_OUTCOME.ADMITTED,
  });
}

function campaignRaftRsPeer(options) {
  const admission = raftRsElectionAdmissibility(options);
  if (!admission.admitted) {
    return Object.freeze({
      campaigned: false,
      refusal: admission.refusal,
      detail: admission.detail,
    });
  }
  options.core.campaign(options.handle);
  return Object.freeze({
    campaigned: true,
    refusal: null,
    detail: RAFT_RS_ELECTION_OUTCOME.CAMPAIGNED,
  });
}

export {campaignRaftRsPeer, raftRsElectionAdmissibility};
