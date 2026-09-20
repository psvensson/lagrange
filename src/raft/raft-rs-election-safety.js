// The host's half of election safety (§11), and the one path to campaign().
//
// raft-rs owns elections. What the host owns is whether this peer may take
// part in one at all, and §11 names three rules: never a learner, never a
// removed peer, never a peer that is not a voter in its own committed
// ConfState. Two of the three are the same question asked of the core's own
// configuration, and the third - a removed peer - has a case the core cannot
// answer: a peer removed while it could not hear the cluster still holds a
// configuration that lists it. That one is Lagrange's own durable record to
// answer, and it is a named input here rather than something inferred.
//
// The same admissibility answers the broader invariant: a peer which is no
// longer a voter must not participate in a future election AS THOUGH IT
// STILL WERE ONE - which includes not being given the ticks that make it
// campaign, not only not being campaigned explicitly.

import {
  RAFT_RS_ELECTION_ERROR_MSG,
  RAFT_RS_ELECTION_EVIDENCE_MSG,
  RAFT_RS_ELECTION_OUTCOME,
  RAFT_RS_ELECTION_REFUSAL,
  RAFT_RS_ELECTION_SETTING,
} from './raft-rs-election-safety-constants.js';

const NO_TERMS_BURNED = 0n;

function refused(refusal, detail) {
  return Object.freeze({admitted: false, refusal, detail});
}

/**
 * Whether this peer may take part in an election at all.
 *
 * Every fact but one is read off the core: its own id, its own committed
 * configuration and its own promotable(). The exception is named:
 * `retiredByHost` is what Lagrange knows and the core cannot.
 * @param {Object} options - The question.
 * @param {Object} options.core - The raft-rs primitive facade.
 * @param {number} options.handle - This group's core handle.
 * @param {boolean} [options.retiredByHost] - Lagrange's own durable answer.
 * @return {Object} A frozen named admission or refusal.
 */
function raftRsElectionAdmissibility({core, handle, retiredByHost = false}) {
  const status = core.status(handle);
  const peerId = status.id;
  if (retiredByHost === true) {
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

/**
 * Campaign, if this peer may. The core's primitive is reached only from
 * here, so the three rules cannot be walked around by calling it directly.
 * @param {Object} options - The same inputs as the admissibility.
 * @return {Object} {campaigned, refusal, detail}.
 */
function campaignRaftRsPeer({core, handle, retiredByHost = false}) {
  const admissibility = raftRsElectionAdmissibility({
    core, handle, retiredByHost});
  if (!admissibility.admitted) {
    return Object.freeze({
      campaigned: false,
      refusal: admissibility.refusal,
      detail: admissibility.detail,
    });
  }
  core.campaign(handle);
  return Object.freeze({
    campaigned: true,
    refusal: null,
    detail: RAFT_RS_ELECTION_OUTCOME.CAMPAIGNED,
  });
}

// Each setting is judged on the failure it exists for, against the run that
// differs from it in that setting ALONE. Judging one setting on the other
// one's scenario makes the answer depend on how a randomized election timer
// happened to fall, which is an assumption with a measurement's clothes on.
const SETTING_CRITERION = Object.freeze({
  // pre_vote exists so a peer that cannot be heard does not raise its term.
  // Its scenario is the cut-off follower.
  [RAFT_RS_ELECTION_SETTING.PRE_VOTE]: (on, off) =>
    on.termsBurnedWhileCutOff < off.termsBurnedWhileCutOff &&
    on.termsBurnedWhileCutOff === NO_TERMS_BURNED &&
    !on.leaderDeposedOnHeal && on.restabilised,
  // check_quorum exists so a leader that has lost contact with its quorum
  // finds out by itself. Its scenario is the isolated leader.
  [RAFT_RS_ELECTION_SETTING.CHECK_QUORUM]: (on, off) =>
    on.isolatedLeaderStoodDown && !off.isolatedLeaderStoodDown,
});

/**
 * @param {Object} left - One run.
 * @param {Object} right - Another.
 * @param {string} setting - The setting they may differ in.
 * @return {boolean} Whether they differ in that setting alone.
 */
function differOnlyIn(left, right, setting) {
  return Object.values(RAFT_RS_ELECTION_SETTING).every((name) =>
    name === setting ?
      left.settings[name] !== right.settings[name] :
      left.settings[name] === right.settings[name]);
}

/**
 * Whether the measured runs say a setting earns its place.
 * @param {Array<Object>} runs - Every disruption run.
 * @param {string} setting - Which setting.
 * @return {boolean} Whether turning it on was measured to help.
 */
function settingHelps(runs, setting) {
  const pairs = runs
    .filter((run) => run.settings[setting] === true)
    .map((on) => [on, runs.find((off) => differOnlyIn(on, off, setting))])
    .filter(([, off]) => off !== undefined);
  return pairs.length > 0 &&
    pairs.every(([on, off]) => SETTING_CRITERION[setting](on, off));
}

/**
 * The setting pair the driven scenarios recommend, with the evidence they
 * recommend it on.
 *
 * It is a derivation, never a declaration: the caller passes the runs it
 * measured and gets back what they say. A recommendation that could be
 * written without running anything would be the assumption §11 forbids.
 * @param {Array<Object>} runs - Every disruption run.
 * @return {Object} {settings, evidence}.
 */
function recommendedElectionSettings(runs) {
  const settings = {};
  const derivation = [];
  for (const setting of Object.values(RAFT_RS_ELECTION_SETTING)) {
    const helps = settingHelps(runs, setting);
    settings[setting] = helps;
    derivation.push(RAFT_RS_ELECTION_EVIDENCE_MSG.derivation(setting,
      reasonFor(setting, helps)));
  }
  return Object.freeze({
    settings: Object.freeze(settings),
    evidence: Object.freeze([
      ...runs.map((run) => RAFT_RS_ELECTION_EVIDENCE_MSG.run(run)),
      ...derivation,
    ]),
  });
}

/**
 * @param {string} setting - Which setting.
 * @param {boolean} helps - What the runs said.
 * @return {string} The recorded reason.
 */
function reasonFor(setting, helps) {
  if (setting === RAFT_RS_ELECTION_SETTING.PRE_VOTE) {
    return helps ?
      RAFT_RS_ELECTION_EVIDENCE_MSG.preVoteOn :
      RAFT_RS_ELECTION_EVIDENCE_MSG.preVoteOff;
  }
  return helps ?
    RAFT_RS_ELECTION_EVIDENCE_MSG.checkQuorumOn :
    RAFT_RS_ELECTION_EVIDENCE_MSG.checkQuorumOff;
}

export {
  campaignRaftRsPeer,
  raftRsElectionAdmissibility,
  recommendedElectionSettings,
};
