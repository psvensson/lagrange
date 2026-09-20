// Receipts: a-peer-that-is-no-longer-a-voter-cannot-participate-as-one
//           pre-vote-and-check-quorum-settled-by-failure-scenarios-not-assumption
//
// §11 of the binding direction. Three rules are carried forward - never
// campaign a learner, never a removed peer, never a peer that is not a voter
// in its own committed ConfState - and the target invariant is broader than
// all three: a peer which is no longer a voter cannot participate in future
// elections as though it still were one.
//
// Everything below is driven. The round-3 verifier's two findings - that a
// campaigned learner BECOMES LEADER, and that a removed peer's campaign
// deposes the leader - are historical evidence, never an oracle: each is
// reproduced here under this backend and measured off the core, and the
// guard is then shown refusing it by name. The pre_vote and check_quorum
// question is answered by running one disruption scenario in all four
// configurations and reading what changed.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {instantiateRaftRsCore} from '../../../src/raft/raft-rs-core.js';
import {
  RAFT_RS_CORE_PRIMITIVES,
} from '../../../src/raft/raft-rs-core-constants.js';
import {
  RAFT_RS_ELECTION_REFUSAL,
  RAFT_RS_ELECTION_SETTING,
} from '../../../src/raft/raft-rs-election-safety-constants.js';
import {
  campaignRaftRsPeer,
  raftRsElectionAdmissibility,
  recommendedElectionSettings,
} from '../../../src/raft/raft-rs-election-safety.js';
import {
  RAFT_RS_CORE_ROLE_STATE,
  RAFT_RS_NODE_STATE,
} from '../../../src/raft/raft-rs-node-constants.js';
import {
  DeterministicRaftRsCluster,
} from './deterministic-raft-rs-cluster.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = path.resolve(HERE, '..', '..', '..');
const BINDING_SOURCE = 'src/raft/raft-rs-wasm/src/lib.rs';
const CONF_CHANGE_ARMS =
  /fn num_to_conf_change_type[\s\S]*?match n \{([\s\S]*?)\n {4}\}/u;
const ARM = /(\d+)\s*=>\s*Ok\(ConfChangeType::(\w+)\)/gu;
const GROUP_ID = 'partition-election';
const VOTERS = Object.freeze(['1', '2', '3']);
const LEADER = '1';
const REMOVED = '3';
const LEARNER = '4';
const AUTO_TRANSITION = 0;
const SETTLE_ROUNDS = 200;
const DISTURB_ROUNDS = 120;
const PARTITION_ROUNDS = 90;
const HEAL_ROUNDS = 60;
const UTF8 = 'utf8';

// The change-type numbers come out of the binding's own match arms, so a
// binding that renumbered them fails this file rather than silently changing
// what a scenario did.
function confChangeTypes() {
  const source = fs.readFileSync(
    path.join(REPOSITORY_ROOT, BINDING_SOURCE), UTF8);
  const block = CONF_CHANGE_ARMS.exec(source);
  assert.ok(block, `${BINDING_SOURCE} no longer maps ConfChangeType numbers`);
  const types = {};
  for (const [, number, name] of block[1].matchAll(ARM)) {
    types[name] = Number.parseInt(number, 10);
  }
  return types;
}

const CHANGE_TYPE = confChangeTypes();

function formedCluster(tuning) {
  const cluster = new DeterministicRaftRsCluster({
    voters: VOTERS,
    groupId: GROUP_ID,
    core: instantiateRaftRsCore(),
    tuning,
  });
  assert.ok(cluster.campaign(LEADER), 'the founding cluster must elect');
  return cluster;
}

function disposeQuietly(cluster) {
  try {
    cluster.dispose();
  } catch {
    // A trapped runtime cannot free its handles; the files still go.
  }
}

// Propose one configuration change on the leader and drive until every
// connected peer's own core reports it applied.
function commitChange(cluster, changes, applied, tickOnly) {
  const leader = cluster.peer(cluster.leaderId() || LEADER);
  cluster.core.propose_conf_change_v2(leader.handle, {
    transition: AUTO_TRANSITION, changes,
  });
  cluster.runReady();
  return cluster.settle(applied, {rounds: SETTLE_ROUNDS, tickOnly});
}

function admissibilityOf(cluster, peerId, retiredByHost = false) {
  return raftRsElectionAdmissibility({
    core: cluster.core,
    handle: cluster.peer(peerId).handle,
    retiredByHost,
  });
}

function roleOf(cluster, peerId) {
  return RAFT_RS_CORE_ROLE_STATE[cluster.status(peerId).raftState];
}

// One disturbance run: the named peer is ticked for a while and what it did
// to the cluster is read off the cores.
function driveTicking(cluster, peerId, shouldTick) {
  // Who leads is read from the leader's OWN core, not from whether every
  // peer happens to agree: a peer that has been cut off is expected to
  // disagree, and that is not the disturbance being measured.
  const before = {
    leader: cluster.status(LEADER).lead,
    leaderTerm: cluster.status(LEADER).term,
    disturberTerm: cluster.status(peerId).term,
  };
  let ticks = 0;
  try {
    for (let round = 0; round < DISTURB_ROUNDS; round += 1) {
      const ticking = shouldTick() ? [LEADER, peerId] : [LEADER];
      ticks += ticking.includes(peerId) ? 1 : 0;
      cluster.tick(ticking);
      cluster.runReady();
      cluster.deliver();
      cluster.runReady();
    }
  } catch (error) {
    return {...before, ticks, trapped: String(error?.message || error)};
  }
  const after = {
    leader: cluster.status(LEADER).lead,
    leaderTerm: cluster.status(LEADER).term,
    disturberTerm: cluster.status(peerId).term,
  };
  return {
    ...before,
    ticks,
    trapped: null,
    after,
    disturbed: BigInt(after.leaderTerm) > BigInt(before.leaderTerm) ||
      after.leader !== before.leader,
  };
}

test('a peer that is no longer a voter cannot participate in an election',
  async () => {
    // campaign is a raft-rs primitive, and the facade must carry it before a
    // guard can be the only way to reach it.
    assert.ok(RAFT_RS_CORE_PRIMITIVES.includes('campaign'));

    // ---- the removed peer that applied its own removal --------------------
    const applied = formedCluster();
    try {
      assert.ok(commitChange(applied,
        [{changeType: CHANGE_TYPE.RemoveNode, nodeId: REMOVED}],
        (current) => VOTERS.every((peerId) =>
          !current.confState(peerId).voters.includes(REMOVED))),
      'every peer must apply the removal, including the removed peer');
      const admissibility = admissibilityOf(applied, REMOVED);
      assert.equal(admissibility.admitted, false);
      assert.equal(admissibility.refusal,
        RAFT_RS_ELECTION_REFUSAL.NOT_A_VOTER);
      assert.ok(admissibility.detail.includes(REMOVED));
      // The core agrees, independently: its own promotable() is false.
      assert.equal(applied.status(REMOVED).promotable, false);
      const termBefore = applied.status(REMOVED).term;
      const refused = campaignRaftRsPeer({
        core: applied.core,
        handle: applied.peer(REMOVED).handle,
      });
      assert.equal(refused.campaigned, false);
      assert.equal(refused.refusal, RAFT_RS_ELECTION_REFUSAL.NOT_A_VOTER);
      assert.equal(applied.status(REMOVED).term, termBefore,
        'a refused campaign must not have reached the core');
      // A voter in the same cluster is admitted, so the refusal above
      // discriminates rather than refusing everyone.
      assert.equal(admissibilityOf(applied, LEADER).admitted, true);
    } finally {
      disposeQuietly(applied);
    }

    // ---- the campaigned learner the verifier measured ---------------------
    const withLearner = formedCluster();
    try {
      withLearner.addPeer(LEARNER, VOTERS);
      assert.ok(commitChange(withLearner,
        [{changeType: CHANGE_TYPE.AddLearnerNode, nodeId: LEARNER}],
        (current) => current.confState(LEARNER).learners.includes(LEARNER)),
      'the learner must be committed into every configuration');
      const guard = admissibilityOf(withLearner, LEARNER);
      assert.equal(guard.admitted, false);
      assert.equal(guard.refusal, RAFT_RS_ELECTION_REFUSAL.LEARNER);
      assert.equal(withLearner.status(LEARNER).promotable, false);
      // Reproduce the round-3 finding under this backend: reached without
      // the guard, the core lets the learner campaign.
      const before = withLearner.status(LEARNER);
      withLearner.core.campaign(withLearner.peer(LEARNER).handle);
      withLearner.settle(
        (current) => current.status(LEARNER).raftState ===
          Number(Object.keys(RAFT_RS_CORE_ROLE_STATE).find((role) =>
            RAFT_RS_CORE_ROLE_STATE[role] === RAFT_RS_NODE_STATE.LEADER)),
        {rounds: SETTLE_ROUNDS, tickOnly: [LEARNER]});
      const after = withLearner.status(LEARNER);
      assert.ok(
        BigInt(after.term) > BigInt(before.term) ||
        RAFT_RS_CORE_ROLE_STATE[after.raftState] !==
          RAFT_RS_CORE_ROLE_STATE[before.raftState],
        'the unguarded campaign must have had an effect, or there is ' +
        'nothing for the guard to prevent');
    } finally {
      disposeQuietly(withLearner);
    }

    // ---- the removed peer that never applied its removal ------------------
    // The case §11's three rules cannot see: the peer's OWN configuration
    // still lists it, so the core has no way to know. Lagrange does.
    const unaware = formedCluster();
    let unguardedRun = null;
    try {
      unaware.partition(REMOVED);
      assert.ok(commitChange(unaware,
        [{changeType: CHANGE_TYPE.RemoveNode, nodeId: REMOVED}],
        (current) => !current.confState(LEADER).voters.includes(REMOVED),
        VOTERS.filter((peerId) => peerId !== REMOVED)));
      assert.ok(unaware.confState(REMOVED).voters.includes(REMOVED),
        'the partitioned peer must still believe it is a voter');
      assert.equal(admissibilityOf(unaware, REMOVED).admitted, true,
        'the configuration rules alone admit it, which is the limitation ' +
        'this measures rather than hides');
      assert.equal(
        admissibilityOf(unaware, REMOVED, true).refusal,
        RAFT_RS_ELECTION_REFUSAL.RETIRED_BY_HOST,
        'what only Lagrange knows is what refuses it');
      unaware.heal(REMOVED);
      unguardedRun = driveTicking(unaware, REMOVED, () => true);
      assert.ok(unguardedRun.trapped !== null || unguardedRun.disturbed,
        'the removed peer that keeps ticking must be measured disturbing ' +
        'the cluster, or the invariant has nothing to protect');
    } finally {
      disposeQuietly(unaware);
    }

    // ---- the same scenario with the host asking first ---------------------
    const guarded = formedCluster();
    try {
      guarded.partition(REMOVED);
      assert.ok(commitChange(guarded,
        [{changeType: CHANGE_TYPE.RemoveNode, nodeId: REMOVED}],
        (current) => !current.confState(LEADER).voters.includes(REMOVED),
        VOTERS.filter((peerId) => peerId !== REMOVED)));
      guarded.heal(REMOVED);
      const run = driveTicking(guarded, REMOVED,
        () => admissibilityOf(guarded, REMOVED, true).admitted);
      assert.equal(run.trapped, null);
      assert.equal(run.ticks, 0,
        'a retired peer is never given a tick, so it never campaigns');
      assert.equal(run.disturbed, false,
        'the leader keeps its term and its leadership');
      assert.equal(run.after.leader, LEADER);
    } finally {
      disposeQuietly(guarded);
    }
  });

// The cut-off FOLLOWER scenario: a voter is cut off, keeps its timer
// running, and is put back. This is the failure pre_vote exists for.
function runIsolatedFollower(settings) {
  const cluster = formedCluster({
    preVote: settings[RAFT_RS_ELECTION_SETTING.PRE_VOTE],
    checkQuorum: settings[RAFT_RS_ELECTION_SETTING.CHECK_QUORUM],
  });
  try {
    const disturber = VOTERS[2];
    const before = {
      leaderTerm: cluster.status(LEADER).term,
      disturberTerm: cluster.status(disturber).term,
    };
    cluster.partition(disturber);
    let sawPreCandidate = false;
    for (let round = 0; round < PARTITION_ROUNDS; round += 1) {
      cluster.tick([LEADER, disturber]);
      cluster.runReady();
      cluster.deliver();
      cluster.runReady();
      sawPreCandidate = sawPreCandidate || roleOf(cluster, disturber) ===
        RAFT_RS_NODE_STATE.PRE_CANDIDATE;
    }
    const atHeal = {
      disturberTerm: cluster.status(disturber).term,
      leaderTerm: cluster.status(LEADER).term,
      leaderHeld: cluster.status(LEADER).lead === LEADER,
    };
    // A fixed number of rounds after healing, with both timers running.
    // Settling on "somebody leads" would stop before the returning peer had
    // said anything, and measure nothing.
    cluster.heal(disturber);
    let lastTermChange = 0;
    let firstAgreement = null;
    let term = atHeal.leaderTerm;
    for (let round = 1; round <= HEAL_ROUNDS; round += 1) {
      cluster.tick([LEADER, disturber]);
      cluster.runReady();
      cluster.deliver();
      cluster.runReady();
      const now = cluster.status(LEADER).term;
      if (now !== term) {
        term = now;
        lastTermChange = round;
        firstAgreement = null;
      }
      if (firstAgreement === null && cluster.leaderId() !== null) {
        firstAgreement = round;
      }
    }
    const restabilised = cluster.leaderId() !== null;
    const after = {
      leader: cluster.status(LEADER).lead,
      leaderTerm: cluster.status(LEADER).term,
    };
    const rounds = firstAgreement === null ?
      HEAL_ROUNDS : firstAgreement - lastTermChange;
    return {
      termsBurnedWhileCutOff:
        BigInt(atHeal.disturberTerm) - BigInt(before.disturberTerm),
      leaderHeldWhileCutOff: atHeal.leaderHeld,
      sawPreCandidate,
      leaderDeposedOnHeal:
        BigInt(after.leaderTerm) > BigInt(atHeal.leaderTerm) ||
        after.leader !== LEADER,
      restabilised,
      roundsToRestabilise: rounds,
    };
  } finally {
    disposeQuietly(cluster);
  }
}

// The isolated LEADER scenario: the leader can reach nobody and keeps its
// timer running. This is the failure check_quorum exists for, and without it
// the leader goes on believing it leads.
function runIsolatedLeader(settings) {
  const cluster = formedCluster({
    preVote: settings[RAFT_RS_ELECTION_SETTING.PRE_VOTE],
    checkQuorum: settings[RAFT_RS_ELECTION_SETTING.CHECK_QUORUM],
  });
  try {
    cluster.partition(LEADER);
    for (let round = 0; round < PARTITION_ROUNDS; round += 1) {
      cluster.tick([LEADER]);
      cluster.runReady();
      cluster.deliver();
      cluster.runReady();
    }
    return {
      isolatedLeaderStoodDown:
        roleOf(cluster, LEADER) !== RAFT_RS_NODE_STATE.LEADER,
    };
  } finally {
    disposeQuietly(cluster);
  }
}

function runDisruption(settings) {
  return {
    settings,
    ...runIsolatedFollower(settings),
    ...runIsolatedLeader(settings),
  };
}

test('pre-vote and check-quorum are settled by driven failure scenarios',
  async () => {
    const matrix = [];
    for (const preVote of [false, true]) {
      for (const checkQuorum of [false, true]) {
        matrix.push(runDisruption({
          [RAFT_RS_ELECTION_SETTING.PRE_VOTE]: preVote,
          [RAFT_RS_ELECTION_SETTING.CHECK_QUORUM]: checkQuorum,
        }));
      }
    }
    const at = (preVote, checkQuorum) => matrix.find((run) =>
      run.settings[RAFT_RS_ELECTION_SETTING.PRE_VOTE] === preVote &&
      run.settings[RAFT_RS_ELECTION_SETTING.CHECK_QUORUM] === checkQuorum);

    // ---- what the scenario that exercises pre_vote measured ---------------
    for (const checkQuorum of [false, true]) {
      const off = at(false, checkQuorum);
      const on = at(true, checkQuorum);
      assert.ok(off.termsBurnedWhileCutOff > 0n,
        'the disruption must actually disrupt, or nothing here measures a ' +
        'difference');
      assert.equal(off.sawPreCandidate, false,
        'control: without pre_vote there is no pre-candidate role to see');
      assert.ok(on.sawPreCandidate,
        'pre_vote must put the cut-off peer in the core\'s pre-candidate ' +
        'role. A setting that never reaches the core is a named gap in the ' +
        'binding, not a setting this integration may choose');
      assert.equal(on.termsBurnedWhileCutOff, 0n,
        'a pre-candidate does not raise its term, which is the whole ' +
        'mechanism');
      assert.equal(off.leaderDeposedOnHeal, true);
      assert.equal(on.leaderDeposedOnHeal, false,
        'the leader is not carried up by a peer that was never heard');
    }

    // ---- what the scenario that exercises check_quorum measured -----------
    for (const preVote of [false, true]) {
      assert.equal(at(preVote, false).isolatedLeaderStoodDown, false,
        'without check_quorum an isolated leader goes on believing it leads');
      assert.equal(at(preVote, true).isolatedLeaderStoodDown, true,
        'with check_quorum it stands down by itself; if this never ' +
        'differs, check_quorum is a named gap rather than a choice');
    }

    // The recommendation is DERIVED from the matrix, and each setting is
    // judged on the failure it exists for. A recommendation that could be
    // written without running anything would be the assumption §11 forbids.
    const derived = recommendedElectionSettings(matrix);
    assert.deepEqual(derived.settings, {
      [RAFT_RS_ELECTION_SETTING.PRE_VOTE]: true,
      [RAFT_RS_ELECTION_SETTING.CHECK_QUORUM]: true,
    }, 'both settings were measured earning their place, in the scenario ' +
      'that exercises each');
    assert.ok(derived.evidence.length >= matrix.length);
    for (const run of matrix) {
      assert.ok(derived.evidence.some((line) =>
        line.includes(String(run.settings[RAFT_RS_ELECTION_SETTING.PRE_VOTE])) &&
        line.includes(String(run.termsBurnedWhileCutOff))),
      'every configuration that was run is in the evidence');
    }
  });
