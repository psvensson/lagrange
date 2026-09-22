// Receipts:
//   conf-state-is-the-membership-authority-under-divergent-hostile-caches
//   lagrange-rows-project-membership-and-never-alter-the-configuration
//
// The liferaft part A case, reproduced under the raft-rs backend. Part A's
// liferaft measurements are NOT re-derived here: the round-3 verifier records
// "Part A: 3 of 3 on src/raft/liferaft.js, liferaft-provider.js and
// sqlite-log-adapter.js" (round-3.md, RE-CONFIRMATIONS), and that is cited,
// never used as an oracle. The raft-rs side is driven here.
//
// Every expectation comes from the core itself or from the durable record read
// with an independent SQLite connection. Nothing is declared by this file, and
// no check compares a value with the path that produced it: what the
// projection reports is checked against the ConfState the DURABLE record
// holds, which the Ready loop wrote from `apply_conf_change`'s own return.

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {TextEncoder} from 'node:util';

import Database from 'better-sqlite3';

import {
  namesInsideClass,
  parameterNamesOf,
  parseRepositoryModule,
} from './module-shape.js';
import {
  LAGRANGE_MEMBERSHIP,
  LagrangeMembershipRows,
  consensusMembership,
  membershipRowsFromConfState,
  projectMembershipOntoRows,
} from '../../../src/raft/raft-rs-membership-projection.js';
import {
  DeterministicRaftRsCluster,
} from './deterministic-raft-rs-cluster.js';

const GROUP_ID = 'partition-under-test';
// a, b, c of the part A case.
const VOTERS = Object.freeze(['1', '2', '3']);
const PEER_A = '1';
const PEER_B = '2';
// d: the replica node B's cache holds as SYNCING and node A has never seen.
const PEER_D = '4';
// A peer no cache and no configuration ever mentions, used to show a row
// invented out of nothing still cannot reach the configuration.
const PEER_NEVER = '9';
const ADD_LEARNER_CHANGE_TYPE = 2;
const CONF_CHANGE_AUTO_TRANSITION = 0;
const SETTLE_ROUNDS = 200;
const QUIET_ROUNDS = 120;
const LIFECYCLE = Object.freeze({
  ACTIVE: 'ACTIVE',
  SYNCING: 'SYNCING',
});
const PROJECTION_MODULE = 'src/raft/raft-rs-membership-projection.js';
const AUTHORITY_READS = Object.freeze([
  'consensusMembership', 'membershipRowsFromConfState']);
const ROW_CLASS = 'LagrangeMembershipRows';
// A parameter name that could carry a cached answer into an authority read.
const CACHE_SHAPED_NAME = /row|cache|service|table|status|lifecycle|member/iu;
// The core calls that can change an active configuration. A row store that
// mentions none of them has no path to one.
const CONFIGURATION_CALLS = Object.freeze([
  'step', 'propose', 'propose_conf_change_v2', 'apply_conf_change',
  'set_conf_state', 'create_node', 'advance_append', 'advance_apply']);

// What SQLite holds for a peer right now, read on a connection of this
// test's own so the answer is the durable bytes rather than a live object's
// memory. This is the oracle the projection is checked against.
function durableMembershipOf(dbFile) {
  const independent = new Database(dbFile, {readonly: true});
  const row = independent.prepare(
    'SELECT applied_index, voters, learners, voters_outgoing, learners_next ' +
    'FROM _raft_rs_applied_state WHERE group_id = ?').get(GROUP_ID);
  const commit = independent.prepare(
    'SELECT commit_index FROM _raft_rs_hard_state WHERE group_id = ?')
    .get(GROUP_ID);
  independent.close();
  return {
    appliedIndex: String(row.applied_index),
    commitIndex: commit ? String(commit.commit_index) : null,
    voters: JSON.parse(row.voters),
    learners: JSON.parse(row.learners),
    votersOutgoing: JSON.parse(row.voters_outgoing),
    learnersNext: JSON.parse(row.learners_next),
  };
}

// The part A caches, hostile and divergent: node A's names a, b, c; node B's
// names a, b, d with d still syncing - the liferaft shape where a SYNCING row
// doubles as a voter.
function hostileRowsFor(peerId) {
  const rows = new LagrangeMembershipRows();
  if (peerId === PEER_B) {
    rows.declareMembership(PEER_A, LAGRANGE_MEMBERSHIP.VOTER);
    rows.declareMembership(PEER_B, LAGRANGE_MEMBERSHIP.VOTER);
    rows.declareMembership(PEER_D, LAGRANGE_MEMBERSHIP.VOTER);
    rows.setLifecycle(PEER_D, LIFECYCLE.SYNCING);
    return rows;
  }
  for (const voter of VOTERS) {
    rows.declareMembership(voter, LAGRANGE_MEMBERSHIP.VOTER);
    rows.setLifecycle(voter, LIFECYCLE.ACTIVE);
  }
  return rows;
}

// What a membership decision taken from the cache would say. It exists to
// show the checks below discriminate: on peer B it answers differently from
// what the core answers.
function membershipIfTheCacheDecided(rows) {
  return rows.read()
    .filter((row) => row.membership === LAGRANGE_MEMBERSHIP.VOTER)
    .map((row) => row.peerId)
    .sort();
}

function clusterWithACommittedLearner() {
  const cluster = new DeterministicRaftRsCluster({
    voters: VOTERS, groupId: GROUP_ID,
  });
  const caches = new Map(
    [...VOTERS].map((peerId) => [peerId, hostileRowsFor(peerId)]));
  cluster.settle((current) => current.leaderId() !== null,
    {rounds: SETTLE_ROUNDS});
  assert.ok(cluster.leaderId() !== null, 'the cluster must elect a leader');
  const leader = cluster.peer(cluster.leaderId());
  cluster.core.propose_conf_change_v2(leader.handle, {
    transition: CONF_CHANGE_AUTO_TRANSITION,
    changes: [{changeType: ADD_LEARNER_CHANGE_TYPE, nodeId: PEER_D}],
  });
  cluster.runReady();
  // The core's own report of where the pending configuration change sits.
  const pendingConfIndex = cluster.status(leader.peerId).pendingConfIndex;
  assert.notEqual(pendingConfIndex, '0',
    'the core must report a pending configuration change to wait on');
  // Hostile and LIVE: every round the caches are rewritten under the peers.
  let mutations = 0;
  cluster.settle((current) => {
    mutations += 1;
    for (const [peerId, rows] of caches) {
      rows.declareMembership(PEER_D, LAGRANGE_MEMBERSHIP.VOTER);
      rows.setLifecycle(PEER_D, LIFECYCLE.SYNCING);
      rows.declareMembership(
        `${PEER_NEVER}${mutations % 2}`, LAGRANGE_MEMBERSHIP.VOTER);
      if (peerId === PEER_A) {
        rows.forget(PEER_D);
      }
    }
    return VOTERS.every((peerId) =>
      BigInt(current.status(peerId).applied) >= BigInt(pendingConfIndex));
  }, {rounds: QUIET_ROUNDS, ticking: false});
  assert.ok(mutations > 1, 'the caches must have been mutated under the peers');
  return {cluster, caches, pendingConfIndex};
}

test('two peers whose caches disagree observe the committed configuration',
  async () => {
    const {cluster, caches, pendingConfIndex} = clusterWithACommittedLearner();
    try {
      // The caches really do disagree, and B's says d is a voter.
      const cacheOnA = membershipIfTheCacheDecided(caches.get(PEER_A));
      const cacheOnB = membershipIfTheCacheDecided(caches.get(PEER_B));
      assert.notDeepEqual(cacheOnA, cacheOnB,
        'the part A case needs the two caches to disagree');
      assert.ok(cacheOnB.includes(PEER_D),
        'node B\'s cache must hold the still-syncing replica as a voter');
      assert.ok(!cacheOnA.includes(PEER_D),
        'node A\'s cache must never have seen that replica');

      const observed = {};
      for (const peerId of VOTERS) {
        const peer = cluster.peer(peerId);
        // The oracle: the durable record, read on an independent connection.
        // The Ready loop wrote it from apply_conf_change's own return.
        const durable = durableMembershipOf(peer.dbFile);
        assert.ok(BigInt(durable.appliedIndex) >= BigInt(pendingConfIndex),
          `${peerId} must have applied the committed configuration entry`);
        const membership = consensusMembership({
          confState: cluster.core.conf_state(peer.handle),
        });
        observed[peerId] = membership;
        assert.deepEqual(membership.voters, durable.voters,
          `${peerId} observed voters the committed configuration does not ` +
          'determine');
        assert.deepEqual(membership.votersOutgoing, durable.votersOutgoing);
        assert.ok(!membership.voters.includes(PEER_D),
          `${peerId} counted the still-syncing replica as a voter`);
        assert.ok(durable.learners.includes(PEER_D),
          `${peerId}'s committed configuration must hold d as a learner`);
      }
      // Both peers observe the SAME membership although their caches differ.
      assert.deepEqual(observed[PEER_A].voters, observed[PEER_B].voters,
        'the two peers disagreed about consensus membership');
      // The checks above discriminate: taken from the cache, node B's answer
      // is a different set.
      assert.notDeepEqual(cacheOnB, observed[PEER_B].voters.slice().sort(),
        'a cache-decided membership must differ, or the check proves nothing');
    } finally {
      cluster.dispose();
    }
  });

test('no cache mutation alters quorum membership', async () => {
  const {cluster, caches} = clusterWithACommittedLearner();
  try {
    const before = {};
    for (const peerId of VOTERS) {
      before[peerId] = cluster.core.export_persisted_state(
        cluster.peer(peerId).handle).confState;
    }
    // Rows PROJECT the configuration: the membership column is derived from
    // the core, the lifecycle column is the caller's and survives.
    for (const peerId of VOTERS) {
      const peer = cluster.peer(peerId);
      const rows = caches.get(peerId);
      rows.setLifecycle(PEER_D, LIFECYCLE.SYNCING);
      projectMembershipOntoRows({
        confState: cluster.core.conf_state(peer.handle), rows,
      });
      const durable = durableMembershipOf(peer.dbFile);
      const projected = rows.read();
      // What was written is exactly what the authority read derived; the sink
      // added nothing and dropped nothing.
      assert.deepEqual(
        projected.map((row) => ({
          peerId: row.peerId, membership: row.membership})),
        membershipRowsFromConfState({
          confState: cluster.core.conf_state(peer.handle),
        }).map((row) => ({peerId: row.peerId, membership: row.membership})));
      const projectedVoters = projected
        .filter((row) => row.membership === LAGRANGE_MEMBERSHIP.VOTER)
        .map((row) => row.peerId);
      const projectedLearners = projected
        .filter((row) => row.membership === LAGRANGE_MEMBERSHIP.LEARNER)
        .map((row) => row.peerId);
      assert.deepEqual(projectedVoters, durable.voters,
        `${peerId} projected voters the durable configuration does not hold`);
      assert.deepEqual(projectedLearners, durable.learners);
      assert.equal(
        projected.find((row) => row.peerId === PEER_D).lifecycle,
        LIFECYCLE.SYNCING,
        'lifecycle is the row\'s own and is not consensus membership');
      assert.ok(!projected.some((row) => row.peerId === PEER_NEVER),
        'a projection carries no member the configuration does not name');
    }
    // Now edit the rows hostilely: promote the learner, retire a voter,
    // invent a member. None of it may reach the configuration.
    for (const peerId of VOTERS) {
      const rows = caches.get(peerId);
      rows.declareMembership(PEER_D, LAGRANGE_MEMBERSHIP.VOTER);
      rows.declareMembership(PEER_NEVER, LAGRANGE_MEMBERSHIP.VOTER);
      rows.forget(VOTERS[VOTERS.length - 1]);
      rows.setLifecycle(PEER_D, LIFECYCLE.ACTIVE);
    }
    for (const peerId of VOTERS) {
      assert.deepEqual(
        cluster.core.export_persisted_state(
          cluster.peer(peerId).handle).confState,
        before[peerId],
        `${peerId}'s active configuration moved when a row was edited`);
    }
    // And the quorum still works: a proposal commits on the configuration the
    // rows tried to change, on every peer.
    const leader = cluster.peer(cluster.leaderId());
    const commitBefore = cluster.status(leader.peerId).commit;
    cluster.core.propose(leader.handle, new TextEncoder().encode('after-edit'));
    const committed = cluster.settle((current) => VOTERS.every((peerId) =>
      BigInt(current.status(peerId).commit) > BigInt(commitBefore)),
    {rounds: QUIET_ROUNDS, ticking: false});
    assert.ok(committed,
      'the quorum the committed configuration determines must still commit');
    // Re-projecting overwrites the hostile edit from the core's own read.
    for (const peerId of VOTERS) {
      const peer = cluster.peer(peerId);
      const rows = caches.get(peerId);
      projectMembershipOntoRows({
        confState: cluster.core.conf_state(peer.handle), rows,
      });
      assert.deepEqual(
        rows.read().filter((row) =>
          row.membership === LAGRANGE_MEMBERSHIP.VOTER).map((row) => row.peerId),
        durableMembershipOf(peer.dbFile).voters,
        'the projection did not restore the committed configuration');
    }

    // Structural: nothing on the authority path can read a row, and the row
    // store has no name through which a configuration could change.
    const tree = parseRepositoryModule(PROJECTION_MODULE);
    for (const authorityRead of AUTHORITY_READS) {
      const names = parameterNamesOf(tree, authorityRead);
      assert.ok(names.length > 0, `${authorityRead} must have been found`);
      for (const name of names) {
        assert.ok(!CACHE_SHAPED_NAME.test(name),
          `${authorityRead} takes ${name}, through which a cache could ` +
          'answer for the committed configuration');
      }
    }
    const rowNames = namesInsideClass(tree, ROW_CLASS);
    assert.ok(rowNames.size > 0, 'the row store must have been found');
    for (const call of CONFIGURATION_CALLS) {
      assert.ok(!rowNames.has(call),
        `${ROW_CLASS} names ${call}, so a row edit has a path to the ` +
        'active configuration');
    }
    // The structural check can fail: the projection writer, which does hold
    // both sides, names the core read.
    assert.ok(parameterNamesOf(tree, 'projectMembershipOntoRows')
      .some((name) => CACHE_SHAPED_NAME.test(name)),
    'the projection writer must take the sink it writes');
  } finally {
    cluster.dispose();
  }
});
