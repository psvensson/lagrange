// Receipts:
//   ready-and-apply-loop-order-derives-from-the-raft-rs-host-contract (the
//     runtime half: the loop runs the contract's steps, in the contract's
//     order, and its durable writes follow the writes the contract declares)
//   commit-index-is-durable-with-or-before-applying-committed-entries
//   conf-state-and-its-applied-progress-are-written-atomically
//
// The two persistence receipts are measured by breaking the rule and letting
// raft-rs judge the result. A store subclass that withholds the commit index,
// or that splits the one write that carries the configuration and its applied
// index, is a host fault - not a production flag - and the expectation each
// case is checked against comes from the core's own refusal or the core's own
// re-delivery, never from a value this file names.

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {TextEncoder} from 'node:util';

import {RaftRsDurableStore} from '../../../src/raft/raft-rs-durable-store.js';
import {
  RAFT_RS_HOST_STEPS,
  RAFT_RS_HOST_WRITE,
} from '../../../src/raft/raft-rs-host-contract.js';
import {
  DeterministicRaftRsCluster,
} from './deterministic-raft-rs-cluster.js';

const GROUP_ID = 'partition-under-test';
const VOTERS = Object.freeze(['1', '2', '3']);
const VICTIM = '3';
const SETTLE_ROUNDS = 200;
const QUIET_ROUNDS = 80;
const ADD_LEARNER_CHANGE_TYPE = 2;
const LEARNER_ID = '4';
const CONF_CHANGE_AUTO_TRANSITION = 0;
const ZERO = '0';

// A host that never records the commit index: the hard state it writes keeps
// its term and vote and drops its commit, and the LightReady commit index is
// thrown away. This is exactly the order the crate's own example takes and
// the crate's safety note forbids.
class CommitIndexWithheldStore extends RaftRsDurableStore {
  /**
   * @param {string} groupId - The group.
   * @param {Object} hardState - What the core reported.
   */
  putHardState(groupId, hardState) {
    super.putHardState(groupId, {...hardState, commit: ZERO});
  }

  /** The LightReady commit index is withheld. */
  putCommitIndex() {
    return undefined;
  }
}

// A host that splits the one write carrying the configuration and its applied
// index: the configuration moves, the applied index stays behind.
class SplitConfStateStore extends RaftRsDurableStore {
  /**
   * @param {string} groupId - The group.
   * @param {string} appliedIndex - What the core applied.
   * @param {Object} confState - What the core reported.
   * @param {string} write - The contract write name.
   */
  putAppliedState(groupId, appliedIndex, confState, write) {
    const held = this.readDurableRecord(groupId).appliedIndex;
    super.putAppliedState(groupId, held, confState, write);
  }
}

// A raft-rs fatal aborts the WASM instance, so JavaScript sees only a bare
// trap. What the core actually refused is in the panic its hook printed, and
// that text is the only place the refusal's own numbers appear.
function captureCoreDiagnostics(work) {
  const captured = [];
  const originalError = console.error;
  console.error = (...parts) => captured.push(parts.join(' '));
  try {
    work();
  } finally {
    console.error = originalError;
  }
  return captured.join('\n');
}

function proposeAndSettle(cluster, bytes) {
  const leader = cluster.leaderId();
  cluster.core.propose(cluster.peer(leader).handle, bytes);
  cluster.settle(() => false, {rounds: 12, ticking: false});
  return leader;
}

function electedCluster(storeFactory) {
  const cluster = new DeterministicRaftRsCluster({
    voters: VOTERS, groupId: GROUP_ID, storeFactory,
  });
  cluster.settle((current) => current.leaderId() !== null,
    {rounds: SETTLE_ROUNDS});
  assert.ok(cluster.leaderId() !== null, 'the cluster must elect a leader');
  return cluster;
}

test('the loop runs the host contract\'s steps in the contract\'s order',
  async () => {
    const cluster = electedCluster();
    try {
      const leader = cluster.leaderId();
      cluster.core.propose(
        cluster.peer(leader).handle, new TextEncoder().encode('entry'));
      const cycles = cluster.runReady();
      assert.ok(cycles.length > 0, 'a proposal must produce a Ready');
      const contractOrder = RAFT_RS_HOST_STEPS.map((step) => step.id);
      for (const cycle of cycles) {
        assert.deepEqual(cycle.stepsRun, contractOrder,
          'the loop keeps no order of its own: it runs the contract');
      }
    } finally {
      cluster.dispose();
    }
  });

test('every durable write the loop makes is a write the contract declares',
  async () => {
    const cluster = electedCluster();
    try {
      const leader = proposeAndSettle(
        cluster, new TextEncoder().encode('entry'));
      const declared = new Set(RAFT_RS_HOST_STEPS.map((step) => step.writes));
      declared.delete(RAFT_RS_HOST_WRITE.NONE);
      const journal = cluster.peer(leader).store.writesMade();
      assert.ok(journal.length > 0);
      for (const entry of journal) {
        assert.ok(declared.has(entry.write),
          `the store recorded a ${entry.write} write, which no contract ` +
          'step declares');
      }
      assert.ok(journal.some((entry) =>
        entry.write === RAFT_RS_HOST_WRITE.ENTRIES));
      assert.ok(journal.some((entry) =>
        entry.write === RAFT_RS_HOST_WRITE.HARD_STATE));
      assert.ok(journal.some((entry) =>
        entry.write === RAFT_RS_HOST_WRITE.CONF_STATE_AND_APPLIED));
    } finally {
      cluster.dispose();
    }
  });

test('the durable commit index is at or past every entry before it is applied',
  async () => {
    const cluster = electedCluster();
    try {
      proposeAndSettle(cluster, new TextEncoder().encode('entry'));
      for (const peerId of VOTERS) {
        const journal = cluster.peer(peerId).store.writesMade();
        let durableCommit = 0n;
        let applies = 0;
        for (const entry of journal) {
          if (entry.write === RAFT_RS_HOST_WRITE.HARD_STATE) {
            durableCommit = BigInt(entry.commit);
          }
          if (entry.write === RAFT_RS_HOST_WRITE.COMMIT_INDEX) {
            durableCommit = BigInt(entry.commitIndex);
          }
          if (entry.write === RAFT_RS_HOST_WRITE.CONF_STATE_AND_APPLIED) {
            applies += 1;
            assert.ok(durableCommit >= BigInt(entry.appliedIndex),
              `${peerId} applied ${entry.appliedIndex} while its durable ` +
              `commit index was ${durableCommit}`);
          }
        }
        assert.ok(applies > 0, `${peerId} must have applied something`);
      }
    } finally {
      cluster.dispose();
    }
  });

test('a restart refuses a record whose applied index ran past its commit',
  async () => {
    const honest = electedCluster();
    let faulted = null;
    try {
      proposeAndSettle(honest, new TextEncoder().encode('entry'));
      const beforeCrash = honest.status(VICTIM);
      assert.notEqual(beforeCrash.applied, ZERO,
        'the victim must have applied something before it crashed');
      honest.crash(VICTIM);
      honest.restart(VICTIM);
      assert.equal(honest.status(VICTIM).applied, beforeCrash.applied,
        'the honest order restarts to exactly what the core had applied');

      faulted = electedCluster(
        (db) => new CommitIndexWithheldStore(db));
      proposeAndSettle(faulted, new TextEncoder().encode('entry'));
      const faultedApplied = faulted.status(VICTIM).applied;
      const record = faulted.peer(VICTIM).store.readDurableRecord(GROUP_ID);
      assert.equal(record.hardState.commit, ZERO,
        'the fault must really have withheld the commit index');
      assert.notEqual(record.appliedIndex, ZERO,
        'and the applied index must really have moved past it');
      faulted.crash(VICTIM);
      const refusal = captureCoreDiagnostics(
        () => assert.throws(() => faulted.restart(VICTIM)));
      // The expectation is the core's own refusal. It reaches JavaScript as a
      // bare WebAssembly trap, so what it REFUSED is read from the panic the
      // core printed, and every number checked against it comes from the
      // durable record or from the peer's own id.
      assert.ok(/out of range/u.test(refusal),
        `raft-rs must refuse the record; it said ${refusal}`);
      assert.ok(refusal.includes(`applied(${record.appliedIndex})`),
        'the refusal must name the applied index the record holds');
      assert.ok(refusal.includes(`committed(${record.hardState.commit})`),
        'and the commit index the record holds');
      assert.ok(refusal.includes(VICTIM),
        'and the peer whose record it refused');
      assert.equal(faultedApplied, record.appliedIndex);
    } finally {
      honest.dispose();
      if (faulted) {
        faulted.dispose();
      }
    }
  });

test('the configuration and its applied index are one write, so a restart ' +
  're-delivers nothing it already applied', async () => {
  const honest = electedCluster();
  let split = null;
  try {
    const leader = honest.leaderId();
    honest.core.propose_conf_change_v2(honest.peer(leader).handle, {
      transition: CONF_CHANGE_AUTO_TRANSITION,
      changes: [{changeType: ADD_LEARNER_CHANGE_TYPE, nodeId: LEARNER_ID}],
    });
    honest.settle((current) =>
      current.confState(VICTIM).learners.length === 1,
    {rounds: QUIET_ROUNDS, ticking: false});
    const confBefore = honest.confState(VICTIM);
    assert.deepEqual(confBefore.learners, [LEARNER_ID]);
    const honestRecord =
      honest.peer(VICTIM).store.readDurableRecord(GROUP_ID);
    assert.deepEqual(honestRecord.confState.learners, [LEARNER_ID],
      'the durable record holds the configuration the core reported');
    honest.crash(VICTIM);
    const restarted = honest.restart(VICTIM);
    const redelivered = honest.core.take_ready(restarted.handle)
      .committedEntries || [];
    for (const entry of redelivered) {
      assert.ok(BigInt(entry.index) > BigInt(honestRecord.appliedIndex),
        `the core re-delivered entry ${entry.index}, which the record says ` +
        `was applied (applied ${honestRecord.appliedIndex})`);
    }
    assert.deepEqual(honest.confState(VICTIM), confBefore);

    split = electedCluster((db) => new SplitConfStateStore(db));
    const splitLeader = split.leaderId();
    split.core.propose_conf_change_v2(split.peer(splitLeader).handle, {
      transition: CONF_CHANGE_AUTO_TRANSITION,
      changes: [{changeType: ADD_LEARNER_CHANGE_TYPE, nodeId: LEARNER_ID}],
    });
    split.settle((current) =>
      current.confState(VICTIM).learners.length === 1,
    {rounds: QUIET_ROUNDS, ticking: false});
    const splitRecord = split.peer(VICTIM).store.readDurableRecord(GROUP_ID);
    assert.deepEqual(splitRecord.confState.learners, [LEARNER_ID],
      'the split host stored the configuration');
    const liveApplied = split.status(VICTIM).applied;
    assert.notEqual(splitRecord.appliedIndex, liveApplied,
      'the split host left the applied index behind the configuration');
    split.crash(VICTIM);
    const splitRestarted = split.restart(VICTIM);
    const splitRedelivered = split.core.take_ready(splitRestarted.handle)
      .committedEntries || [];
    assert.ok(splitRedelivered.length > 0,
      'a record whose configuration is ahead of its applied index makes the ' +
      'core re-deliver entries the record already accounted for');
    assert.ok(splitRedelivered.some((entry) =>
      BigInt(entry.index) > BigInt(splitRecord.appliedIndex) &&
      BigInt(entry.index) <= BigInt(liveApplied)));
  } finally {
    honest.dispose();
    if (split) {
      split.dispose();
    }
  }
});

test('a fault inside the apply transaction leaves the pair agreeing',
  async () => {
    const cluster = electedCluster();
    try {
      const leader = cluster.leaderId();
      cluster.core.propose_conf_change_v2(cluster.peer(leader).handle, {
        transition: CONF_CHANGE_AUTO_TRANSITION,
        changes: [{changeType: ADD_LEARNER_CHANGE_TYPE, nodeId: LEARNER_ID}],
      });
      cluster.settle((current) =>
        current.confState(VICTIM).learners.length === 1,
      {rounds: QUIET_ROUNDS, ticking: false});
      const store = cluster.peer(VICTIM).store;
      const before = store.readDurableRecord(GROUP_ID);
      const failure = new Error('the apply transaction failed');
      assert.throws(() => store.transaction(() => {
        store.putAppliedState(GROUP_ID, '999', {
          voters: ['7'], learners: [], votersOutgoing: [],
          learnersNext: [], autoLeave: false,
        });
        throw failure;
      }), /the apply transaction failed/u);
      const after = store.readDurableRecord(GROUP_ID);
      assert.equal(after.appliedIndex, before.appliedIndex);
      assert.deepEqual(after.confState, before.confState,
        'neither half of the pair survived a transaction that did not ' +
        'commit, so the two can never disagree');
    } finally {
      cluster.dispose();
    }
  });
