// Receipt:
//   a-trap-marks-the-runtime-unhealthy-and-its-groups-restore-from-durable-state
//
// Binding direction §8: a WASM trap marks the containing runtime unhealthy,
// the host stops dispatching into it, instantiates a fresh module, restores
// its groups from durable state and resumes.
//
// Three things the round-3 verifier's measurement did not do, and this one
// must. The restore reads REAL SQLite records, not memory. The restored
// groups are DRIVEN afterwards - an election, a proposal and a committed
// configuration change - because the verifier rejected a measurement that
// only called create_node ("The 'restored' groups are never driven",
// round-3.md, first job 4). And the diagnosis is captured off the panic
// hook's console.error, which phase 1 recorded as the only channel carrying
// one; the exception itself is a bare RuntimeError.

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {TextEncoder} from 'node:util';

import Database from 'better-sqlite3';

import {
  RAFT_RS_CALL_OUTCOME,
  RAFT_RS_RUNTIME_HEALTH,
  RaftRsRuntimeHost,
} from './raw-raft-rs-test-runtime.js';
import {instantiateRaftRsCore} from './raw-raft-rs-test-core.js';
import {
  consensusMembership,
} from '../../../src/raft/raft-rs-membership-projection.js';
import {
  DeterministicRaftRsCluster,
} from './deterministic-raft-rs-cluster.js';

const GROUP_ID = 'partition-under-test';
const VOTERS = Object.freeze(['1', '2', '3']);
const LEADER = '1';
const VICTIM = '2';
const NEW_LEARNER = '4';
const ADD_LEARNER_CHANGE_TYPE = 2;
const CONF_CHANGE_AUTO_TRANSITION = 0;
const SETTLE_ROUNDS = 200;
const MSG_HEARTBEAT = 8;
// The commit position that makes raft-rs refuse to go on: far past anything
// the victim's log holds.
const IMPOSSIBLE_COMMIT = '999999';

function settledCluster(core) {
  const cluster = new DeterministicRaftRsCluster({
    voters: VOTERS, groupId: GROUP_ID, core,
  });
  cluster.campaign(LEADER);
  cluster.settle((current) => current.leaderId() === LEADER,
    {rounds: SETTLE_ROUNDS, ticking: false});
  assert.equal(cluster.leaderId(), LEADER);
  cluster.core.propose(cluster.peer(LEADER).handle,
    new TextEncoder().encode('before-the-trap'));
  cluster.settle((current) => VOTERS.every((peerId) =>
    BigInt(current.status(peerId).applied) > 0n),
  {rounds: SETTLE_ROUNDS, ticking: false});
  return cluster;
}

// What SQLite holds for one peer, read on a connection of this test's own.
function durableRecordOf(dbFile) {
  const independent = new Database(dbFile, {readonly: true});
  const hardState = independent.prepare(
    'SELECT term, vote, commit_index FROM _raft_rs_hard_state ' +
    'WHERE group_id = ?').get(GROUP_ID);
  const applied = independent.prepare(
    'SELECT applied_index, voters, learners FROM _raft_rs_applied_state ' +
    'WHERE group_id = ?').get(GROUP_ID);
  const entries = independent.prepare(
    'SELECT COUNT(*) AS n FROM _raft_rs_log WHERE group_id = ?').get(GROUP_ID);
  independent.close();
  return {
    term: String(hardState.term),
    vote: String(hardState.vote),
    commit: String(hardState.commit_index),
    appliedIndex: String(applied.applied_index),
    voters: JSON.parse(applied.voters),
    learners: JSON.parse(applied.learners),
    entryCount: Number(entries.n),
  };
}

test('a trap marks the runtime unhealthy and its groups restore', async () => {
  const host = new RaftRsRuntimeHost({instantiate: instantiateRaftRsCore});
  const firstRuntime = host.core;
  const cluster = settledCluster(firstRuntime);
  try {
    for (const peerId of VOTERS) {
      const peer = cluster.peer(peerId);
      // One runtime, three replicas of one group: the host's own key for a
      // hosted node is separate from the group its durable record belongs to.
      host.adoptGroup({
        key: peerId, groupId: GROUP_ID, peerId,
        store: peer.store, handle: peer.handle,
      });
    }
    // The durable records, read before the trap, on independent connections.
    const durableBefore = {};
    for (const peerId of VOTERS) {
      durableBefore[peerId] = durableRecordOf(cluster.peer(peerId).dbFile);
      assert.ok(durableBefore[peerId].entryCount > 0,
        `${peerId} must have a real log on disk to restore from`);
    }

    // A heartbeat whose commit position the victim's log cannot hold. The
    // host's boundary is what sees the fatal.
    const trapped = host.run(VICTIM, (core, handle) => {
      core.step(handle, {
        from: LEADER, to: VICTIM, msgType: MSG_HEARTBEAT,
        term: cluster.status(VICTIM).term, logTerm: '0', index: '0',
        commit: IMPOSSIBLE_COMMIT,
      });
    });
    assert.equal(trapped.outcome, RAFT_RS_CALL_OUTCOME.TRAPPED,
      'the hostile heartbeat must have trapped the runtime');
    assert.equal(host.health, RAFT_RS_RUNTIME_HEALTH.UNHEALTHY_AFTER_TRAP);
    assert.ok(typeof trapped.error === 'string' && trapped.error.length > 0);
    assert.ok(
      typeof trapped.diagnosis === 'string' && trapped.diagnosis.length > 0,
      'the panic hook\'s console.error is the only channel with a diagnosis ' +
      'and the boundary must capture it');
    assert.ok(host.lastTrap !== null);
    assert.equal(host.lastTrap.key, VICTIM);
    assert.equal(host.lastTrap.groupId, GROUP_ID);

    // Dispatch into an unhealthy runtime stops, by name, for every group -
    // not only for the one that trapped.
    for (const peerId of VOTERS) {
      const refused = host.run(peerId, () => {
        throw new Error('work must not run in an unhealthy runtime');
      });
      assert.equal(refused.outcome, RAFT_RS_CALL_OUTCOME.RUNTIME_UNHEALTHY,
        `${peerId} was still dispatched into after the trap`);
    }

    // Replace the runtime and restore every group from its own SQLite record.
    const replacement = host.replaceRuntime();
    assert.notEqual(host.core, firstRuntime, 'a fresh runtime is a new one');
    assert.equal(host.health, RAFT_RS_RUNTIME_HEALTH.HEALTHY);
    assert.deepEqual(replacement.restored.slice().sort(),
      [...VOTERS].sort(), 'every registered group must come back');

    // What came back is what the durable bytes hold.
    for (const peerId of VOTERS) {
      const handle = host.handleOf(peerId);
      const status = host.core.status(handle);
      const durable = durableBefore[peerId];
      assert.equal(status.term, durable.term, `${peerId} term`);
      assert.equal(status.vote, durable.vote, `${peerId} vote`);
      assert.equal(status.commit, durable.commit, `${peerId} commit`);
      assert.equal(status.applied, durable.appliedIndex, `${peerId} applied`);
      assert.deepEqual(
        consensusMembership({
          confState: host.core.conf_state(handle),
        }).voters, durable.voters,
        `${peerId} restored a configuration the record does not hold`);
    }

    // FUNCTIONAL, not merely created: the restored groups elect, propose and
    // commit a configuration change in the new runtime.
    cluster.adoptRuntime(host.core, (peerId) => host.handleOf(peerId));
    cluster.campaign(LEADER);
    const elected = cluster.settle(
      (current) => current.leaderId() === LEADER,
      {rounds: SETTLE_ROUNDS, ticking: false});
    assert.ok(elected, 'the restored groups must elect a leader');

    const commitBefore = cluster.status(LEADER).commit;
    cluster.core.propose(cluster.peer(LEADER).handle,
      new TextEncoder().encode('after-the-restore'));
    const committed = cluster.settle((current) => VOTERS.every((peerId) =>
      BigInt(current.status(peerId).commit) > BigInt(commitBefore)),
    {rounds: SETTLE_ROUNDS, ticking: false});
    assert.ok(committed, 'the restored groups must commit a proposal');

    cluster.core.propose_conf_change_v2(cluster.peer(LEADER).handle, {
      transition: CONF_CHANGE_AUTO_TRANSITION,
      changes: [{changeType: ADD_LEARNER_CHANGE_TYPE, nodeId: NEW_LEARNER}],
    });
    const reconfigured = cluster.settle((current) => VOTERS.every((peerId) =>
      current.confState(peerId).learners.includes(NEW_LEARNER)),
    {rounds: SETTLE_ROUNDS, ticking: false});
    assert.ok(reconfigured,
      'the restored groups must commit and apply a configuration change');
    // And the new configuration is durable on every restored peer's disk.
    for (const peerId of VOTERS) {
      assert.deepEqual(
        durableRecordOf(cluster.peer(peerId).dbFile).learners,
        cluster.confState(peerId).learners,
        `${peerId} did not record the configuration it applied after restore`);
    }
  } finally {
    cluster.dispose();
  }
});
