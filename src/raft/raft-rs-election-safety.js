import {
  RAFT_RS_ELECTION_EVIDENCE_MSG,
  RAFT_RS_ELECTION_SETTING,
} from './raft-rs-election-safety-constants.js';

const NO_TERMS_BURNED = 0n;

const SETTING_CRITERION = Object.freeze({
  [RAFT_RS_ELECTION_SETTING.PRE_VOTE]: (on, off) =>
    on.termsBurnedWhileCutOff < off.termsBurnedWhileCutOff &&
    on.termsBurnedWhileCutOff === NO_TERMS_BURNED &&
    !on.leaderDeposedOnHeal && on.restabilised,
  [RAFT_RS_ELECTION_SETTING.CHECK_QUORUM]: (on, off) =>
    on.isolatedLeaderStoodDown && !off.isolatedLeaderStoodDown,
});

function differOnlyIn(left, right, setting) {
  return Object.values(RAFT_RS_ELECTION_SETTING).every((name) =>
    name === setting ? left.settings[name] !== right.settings[name] :
      left.settings[name] === right.settings[name]);
}

function settingHelps(runs, setting) {
  const pairs = runs
    .filter((run) => run.settings[setting] === true)
    .map((on) => [on, runs.find((off) => differOnlyIn(on, off, setting))])
    .filter(([, off]) => off !== undefined);
  return pairs.length > 0 &&
    pairs.every(([on, off]) => SETTING_CRITERION[setting](on, off));
}

function reasonFor(setting, helps) {
  if (setting === RAFT_RS_ELECTION_SETTING.PRE_VOTE) {
    return helps ? RAFT_RS_ELECTION_EVIDENCE_MSG.preVoteOn :
      RAFT_RS_ELECTION_EVIDENCE_MSG.preVoteOff;
  }
  return helps ? RAFT_RS_ELECTION_EVIDENCE_MSG.checkQuorumOn :
    RAFT_RS_ELECTION_EVIDENCE_MSG.checkQuorumOff;
}

function recommendedElectionSettings(runs) {
  const settings = {};
  const derivation = [];
  for (const setting of Object.values(RAFT_RS_ELECTION_SETTING)) {
    const helps = settingHelps(runs, setting);
    settings[setting] = helps;
    derivation.push(RAFT_RS_ELECTION_EVIDENCE_MSG.derivation(
      setting, reasonFor(setting, helps)));
  }
  return Object.freeze({
    settings: Object.freeze(settings),
    evidence: Object.freeze([
      ...runs.map((run) => RAFT_RS_ELECTION_EVIDENCE_MSG.run(run)),
      ...derivation,
    ]),
  });
}

export {recommendedElectionSettings};
