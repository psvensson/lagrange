// A spent wait is a failure, and is visible (census of bounded waits,
// 2026-10-04, wire-at-merge for src/raft/raft-rs-runtime-owner.js): the
// runtime's three wait bounds each write exactly one wait_bound_spent ERROR
// through the group's injected fault reporter (the restore-path fence keeps
// logging out of the runtime owner), and the runtime's answer at the bound is
// unchanged:
//   - a taken Ready's persistence admission wait past
//     PERSISTENCE_ADMISSION_WAIT.BOUND_MS still answers the host failure;
//   - the delivered-inbound drain's admission deadline still stops polling
//     with the envelopes left queued;
//   - the Ready drain's cycle cap (RAFT_RS_READY_DRAIN_MAX_CYCLES) still
//     answers READY_DRAIN_BOUND_EXCEEDED.
// The fault log maps those kinds to wait_bound_spent and leaves every other
// fault line (a core trap) as it was.

import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {test} from 'node:test';

import {PartitionNodeCluster} from './partition-node-cluster.js';
import {capturingErrors} from './identity-reuse-harness.js';
import {VirtualTimeSource} from '../../../src/time/time-source.js';
import {reportRaftRsRuntimeFault} from
  '../../../src/raft/raft-rs-runtime-fault-log.js';
import {RAFT_RS_READY_DRAIN_MAX_CYCLES} from
  '../../../src/raft/raft-rs-group-constants.js';
import {RAFT_RS_WASM_FILE} from '../../../src/raft/raft-rs-core-constants.js';
import {
  PERSISTENCE_ADMISSION_WAIT,
  RUNTIME_FAULT_REPORT,
  RUNTIME_PHASE,
  RUNTIME_REASON,
} from '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {RAFT_OPERATION_OUTCOME} from
  '../../../src/raft/raft-operation-port-constants.js';
import {setCoreFaultInjector} from
  '../../../src/raft/raft-rs-runtime-owner.js';

const SPENT_EVENT = 'wait_bound_spent';
const BEGIN = 'BEGIN';
const ROLLBACK = 'ROLLBACK';
const SETTLE_ROUNDS = 400;
const GROUP_FIELDS = Object.freeze({
  groupId: 'fault-log-group', replicaIdentity: 'fault-log-r1', peerId: '7',
});
const READY_DRAIN_WAIT = 'RAFT_RS_READY_DRAIN_MAX_CYCLES';
const PERSISTENCE_WAIT = 'PERSISTENCE_ADMISSION_WAIT.BOUND_MS';
const INBOUND_WAIT = 'PERSISTENCE_ADMISSION_WAIT.BOUND_MS (inbound drain)';

function spentLines(lines) {
  return lines.filter(({context}) => context?.event === SPENT_EVENT);
}

function electLeader(cluster) {
  assert.equal(cluster.settle(() => cluster.leaderReplicaId() !== null,
    {rounds: SETTLE_ROUNDS}), true, 'the group elects a leader');
  return cluster.leaderReplicaId();
}

// The core binding's module object, as the runtime owner required it (the
// owner's facade reads each primitive from it on every call).
function loadedCoreBinding() {
  const requireHere = createRequire(import.meta.url);
  const key = Object.keys(requireHere.cache).find((file) =>
    file.endsWith(RAFT_RS_WASM_FILE.GLUE));
  assert.ok(key, 'the runtime owner has loaded the core binding');
  return requireHere.cache[key].exports;
}

test('the fault log writes each spent runtime bound as one wait_bound_spent ' +
  'and a core trap as its fault line', async () => {
  const lines = await capturingErrors(async () => {
    reportRaftRsRuntimeFault(RUNTIME_FAULT_REPORT.READY_DRAIN_BOUND_EXCEEDED,
      {...GROUP_FIELDS, cycles: 64, maxCycles: 64});
    reportRaftRsRuntimeFault(
      RUNTIME_FAULT_REPORT.PERSISTENCE_ADMISSION_BOUND_EXCEEDED,
      {...GROUP_FIELDS, phase: 'ready-persistence', reason: 'x'});
    reportRaftRsRuntimeFault(
      RUNTIME_FAULT_REPORT.INBOUND_DRAIN_ADMISSION_BOUND_EXCEEDED,
      {...GROUP_FIELDS, elapsedMs: 120000, queuedInbound: 2});
    reportRaftRsRuntimeFault(RUNTIME_FAULT_REPORT.CORE_TRAPPED,
      {...GROUP_FIELDS, operation: 'tick', reason: 'unreachable'});
  });
  const spent = spentLines(lines);
  assert.deepEqual(spent.map(({context}) => context.wait),
    [READY_DRAIN_WAIT, PERSISTENCE_WAIT, INBOUND_WAIT],
    'one wait_bound_spent per spent bound');
  for (const {context} of spent) {
    assert.deepEqual(context.scope, GROUP_FIELDS, 'scoped to the group');
  }
  assert.equal(spent[0].context.lastObserved.cycles, 64);
  assert.equal(spent[0].context.lastObserved.bound,
    RAFT_RS_READY_DRAIN_MAX_CYCLES);
  assert.equal(spent[1].context.boundMs, PERSISTENCE_ADMISSION_WAIT.BOUND_MS);
  assert.equal(spent[2].context.elapsedMs, 120000);
  assert.equal(spent[2].context.lastObserved.queuedInbound, 2);
  const traps = lines.filter(({context}) =>
    context?.report === RUNTIME_FAULT_REPORT.CORE_TRAPPED);
  assert.equal(traps.length, 1, 'the core trap keeps its own fault line');
  assert.equal(traps[0].context.event, undefined);
  assert.equal(lines.length, 4, 'nothing else is written');
});

test('a taken Ready whose persistence admission wait passes its bound still ' +
  'answers the host failure and writes one wait_bound_spent', async () => {
  const clock = new VirtualTimeSource({startMs: 1000});
  const held = [];
  let holdSends = false;
  let leaderId = null;
  let cluster = null;
  cluster = new PartitionNodeCluster({
    partitionId: 'spent-ready-persistence',
    replicaIds: ['alpha', 'beta', 'gamma'],
    substrateFor: () => ({timeSource: clock}),
    sendFor: (fromReplicaId, address, envelope) =>
      holdSends && fromReplicaId === leaderId ?
        new Promise((resolve) => held.push(() => {
          cluster.queue(fromReplicaId, address, envelope);
          resolve(undefined);
        })) : undefined,
  });
  try {
    leaderId = electLeader(cluster);
    const leaderReplica = cluster.replica(leaderId);
    const followers = [...cluster.replicas.keys()]
      .filter((replicaId) => replicaId !== leaderId);
    const proposed = await cluster.propose(leaderId, 'spent-across-send');
    assert.equal(proposed.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    for (const follower of followers) {
      for (const envelope of cluster.replica(follower).inbox.splice(0)) {
        cluster.node(follower).step(envelope);
      }
      cluster.node(follower).tick();
    }
    cluster.node(leaderId).readStatus();
    for (const envelope of leaderReplica.inbox.splice(0)) {
      cluster.node(leaderId).step(envelope);
    }

    let lines = [];
    let finished = null;
    lines = await capturingErrors(async () => {
      holdSends = true;
      const ticked = Promise.resolve(cluster.node(leaderId).tick());
      await new Promise((resolve) => setImmediate(resolve));
      assert.ok(held.length > 0,
        'precondition: the Ready had a send in flight');
      leaderReplica.db.exec(BEGIN);
      while (held.length > 0) {
        held.shift()();
        await new Promise((resolve) => setImmediate(resolve));
      }
      clock.advance(PERSISTENCE_ADMISSION_WAIT.BOUND_MS +
        PERSISTENCE_ADMISSION_WAIT.POLL_INTERVAL_MS);
      finished = await ticked;
      leaderReplica.db.exec(ROLLBACK);
      holdSends = false;
    });
    assert.equal(finished?.outcome, RAFT_OPERATION_OUTCOME.HOST_FAILURE,
      `the bound still answers the host failure: ${JSON.stringify(finished)}`);
    assert.equal(finished.phase ?? RUNTIME_PHASE.READY_PERSISTENCE,
      RUNTIME_PHASE.READY_PERSISTENCE);
    const spent = spentLines(lines).filter(({context}) =>
      context.wait === PERSISTENCE_WAIT);
    assert.equal(spent.length, 1, JSON.stringify(lines));
    assert.equal(spent[0].context.scope.groupId, cluster.partitionId);
    assert.equal(spent[0].context.lastObserved.reason,
      RUNTIME_REASON.USER_TRANSACTION_OPEN);
  } finally {
    cluster.dispose();
  }
});

test('the delivered-inbound drain past its admission deadline stops polling ' +
  'with the envelopes queued and writes one wait_bound_spent', async () => {
  const clock = new VirtualTimeSource({startMs: 1000});
  const cluster = new PartitionNodeCluster({
    partitionId: 'spent-inbound-drain',
    replicaIds: ['alpha', 'beta', 'gamma'],
    substrateFor: () => ({timeSource: clock}),
  });
  try {
    const leaderId = electLeader(cluster);
    const leaderReplica = cluster.replica(leaderId);
    const followers = [...cluster.replicas.keys()]
      .filter((replicaId) => replicaId !== leaderId);
    const proposed = await cluster.propose(leaderId, 'spent-inbound');
    assert.equal(proposed.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    for (const follower of followers) {
      for (const envelope of cluster.replica(follower).inbox.splice(0)) {
        cluster.node(follower).step(envelope);
      }
      cluster.node(follower).tick();
    }
    const statusBefore = cluster.node(leaderId).readStatus();
    const lines = await capturingErrors(async () => {
      leaderReplica.db.exec(BEGIN);
      const delivered = leaderReplica.inbox.splice(0);
      assert.ok(delivered.length > 0, 'precondition: answers to deliver');
      for (const envelope of delivered) {
        cluster.node(leaderId).step(envelope);
      }
      clock.advance(PERSISTENCE_ADMISSION_WAIT.BOUND_MS +
        PERSISTENCE_ADMISSION_WAIT.POLL_INTERVAL_MS * 2);
      await new Promise((resolve) => setImmediate(resolve));
      leaderReplica.db.exec(ROLLBACK);
    });
    const spent = spentLines(lines).filter(({context}) =>
      context.wait === INBOUND_WAIT);
    assert.equal(spent.length, 1, JSON.stringify(lines));
    assert.ok(spent[0].context.lastObserved.queuedInbound > 0,
      'the envelopes are still queued at the deadline');
    assert.ok(spent[0].context.elapsedMs >=
      PERSISTENCE_ADMISSION_WAIT.BOUND_MS, 'elapsed on the group clock');
    assert.equal(cluster.node(leaderId).readStatus().commitIndex >=
      statusBefore.commitIndex, true);
  } finally {
    cluster.dispose();
  }
});

// The core really has a Ready on every cycle: each has_ready of this group
// first proposes the captured command again, so the drain's cap is reached
// through the real Ready loop rather than a fabricated answer.
test('the Ready drain at its cycle cap still answers ' +
  'READY_DRAIN_BOUND_EXCEEDED and writes one wait_bound_spent', async () => {
  const cluster = new PartitionNodeCluster({
    partitionId: 'spent-ready-drain',
    replicaIds: ['alpha']});
  let binding = null;
  let realHasReady = null;
  try {
    cluster.node('alpha').campaign();
    assert.equal(cluster.settle(() => cluster.leaderReplicaId() === 'alpha'),
      true, 'a lone voter elects itself');
    let proposedBytes = null;
    setCoreFaultInjector((groupId, operation, args) => {
      if (groupId === cluster.partitionId && operation === 'propose') {
        proposedBytes = args[0];
      }
    });
    const proposed = await cluster.propose('alpha', 'ready-every-cycle');
    setCoreFaultInjector(null);
    assert.equal(proposed.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    assert.ok(proposedBytes, 'precondition: the proposal bytes were seen');
    binding = loadedCoreBinding();
    realHasReady = binding.has_ready;
    const realPropose = binding.propose;
    let answered = null;
    const lines = await capturingErrors(async () => {
      binding.has_ready = (handle, ...rest) => {
        realPropose(handle, proposedBytes);
        return realHasReady(handle, ...rest);
      };
      try {
        answered = await cluster.node('alpha').tick();
      } finally {
        binding.has_ready = realHasReady;
      }
    });
    assert.equal(answered?.reason, RUNTIME_REASON.READY_DRAIN_BOUND_EXCEEDED,
      `the cap still answers its host failure: ${JSON.stringify(answered)}`);
    const spent = spentLines(lines).filter(({context}) =>
      context.wait === READY_DRAIN_WAIT);
    assert.equal(spent.length, 1, JSON.stringify(lines));
    assert.equal(spent[0].context.lastObserved.cycles,
      RAFT_RS_READY_DRAIN_MAX_CYCLES);
    assert.equal(spent[0].context.scope.groupId, cluster.partitionId);
  } finally {
    setCoreFaultInjector(null);
    if (binding && realHasReady) {
      binding.has_ready = realHasReady;
    }
    cluster.dispose();
  }
});
