/**
 * The exits of a retiring replica's consensus wait (owner ruling F2) other
 * than its applied removal, which the real-group witnesses cover
 * (replica-removal-consensus-exit.test.js, replace-real-group-handoff B13):
 * each answer of the replica's own committed-membership read, the bounded
 * backstop, the caller's release, and a service without a port. The port
 * here answers the read with the boundary's own vocabulary; nothing else of
 * it is modelled.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  COMMITTED_MEMBERSHIP_ANSWER_KIND,
  COMMITTED_MEMBERSHIP_REFUSAL,
} from '../../src/raft/raft-committed-membership-constants.js';
import {
  RAFT_EVENT,
  RAFT_OPERATION,
} from '../../src/raft/raft-operation-port-constants.js';
import {
  REPLICA_CONSENSUS_EXIT_REASON,
  awaitReplicaConsensusExit,
} from '../../src/node/replica-removal-consensus-exit.js';

const SELF = 'users-p1-r1';
const OTHER = 'users-p1-r2';
const SELF_PEER = '11';
const OTHER_PEER = '22';
const LONG_MS = 60_000;

function committed({voters, gateOpen = true}) {
  const identities = {[SELF_PEER]: SELF, [OTHER_PEER]: OTHER};
  return {
    kind: COMMITTED_MEMBERSHIP_ANSWER_KIND.COMMITTED,
    voters,
    votersOutgoing: [],
    learners: [],
    appliedIndex: 7,
    commitIndex: 7,
    term: 2,
    leaderId: OTHER_PEER,
    gateOpen,
    identities: Object.fromEntries(voters.map((id) => [id, identities[id]])),
  };
}

// A port whose read answers `answers` in turn (the last one repeats) and
// whose events the test raises.
function stubService(answers) {
  const listeners = new Map();
  let reads = 0;
  const raft = {
    subscribe(eventName, listener) {
      const set = listeners.get(eventName) || new Set();
      set.add(listener);
      listeners.set(eventName, set);
      return () => set.delete(listener);
    },
    [RAFT_OPERATION.READ_COMMITTED_MEMBERSHIP]: () => {
      const answer = answers[Math.min(reads, answers.length - 1)];
      reads += 1;
      return answer;
    },
  };
  return {
    service: {raft, replicaId: SELF, partitionId: 'users-p1'},
    raise: (eventName) => {
      for (const listener of listeners.get(eventName) || []) {
        listener();
      }
    },
    listenerCount: () => [...listeners.values()]
      .reduce((total, set) => total + set.size, 0),
    reads: () => reads,
  };
}

function turns(count = 10) {
  let chain = Promise.resolve();
  for (let turn = 0; turn < count; turn += 1) {
    chain = chain.then(() => new Promise((resolve) => setImmediate(resolve)));
  }
  return chain;
}

async function settledWithin(promise, count = 10) {
  let outcome = null;
  promise.then((value) => {
    outcome = value;
  });
  await turns(count);
  return outcome;
}

test('a named replica keeps waiting; the applied change that drops it ' +
  'ends the wait', async (t) => {
  const stub = stubService([
    committed({voters: [SELF_PEER, OTHER_PEER]}),
    committed({voters: [OTHER_PEER]}),
  ]);
  const waiting = awaitReplicaConsensusExit(stub.service,
    {replicaId: SELF, backstopMs: LONG_MS});
  t.equal(await settledWithin(waiting), null,
    'while its own configuration names it, it keeps participating');
  stub.raise(RAFT_EVENT.MEMBERSHIP_CHANGED);
  t.same(await settledWithin(waiting),
    {reason: REPLICA_CONSENSUS_EXIT_REASON.REMOVAL_APPLIED},
    'its applied removal ends the wait');
  t.equal(stub.listenerCount(), 0, 'the wait unsubscribed');
});

test('below its participation gate an absence is a lag, not a removal',
  async (t) => {
    const stub = stubService([
      committed({voters: [OTHER_PEER], gateOpen: false}),
      committed({voters: [OTHER_PEER], gateOpen: true}),
    ]);
    const waiting = awaitReplicaConsensusExit(stub.service,
      {replicaId: SELF, backstopMs: LONG_MS});
    t.equal(await settledWithin(waiting), null,
      'absent below the gate: it keeps waiting');
    stub.raise(RAFT_EVENT.GATE_OPENED);
    t.same(await settledWithin(waiting),
      {reason: REPLICA_CONSENSUS_EXIT_REASON.REMOVAL_APPLIED},
      'absent once the gate opened: its removal applied');
  });

test('a typed refusal of the read is the group unavailable to it',
  async (t) => {
    const stub = stubService([{
      kind: COMMITTED_MEMBERSHIP_ANSWER_KIND.REFUSED,
      reason: COMMITTED_MEMBERSHIP_REFUSAL.HELD,
    }]);
    t.same(await awaitReplicaConsensusExit(stub.service,
      {replicaId: SELF, backstopMs: LONG_MS}),
    {reason: REPLICA_CONSENSUS_EXIT_REASON.GROUP_UNAVAILABLE});
  });

test('the backstop bounds a removal nobody proposes; release ends it at ' +
  'once; no port means nothing to wait for', async (t) => {
  const named = () => stubService([committed({voters: [SELF_PEER]})]);
  // The backstop timer does not hold the process open; this test does.
  const keepAlive = setTimeout(() => {}, LONG_MS);
  t.teardown(() => clearTimeout(keepAlive));
  t.same(await awaitReplicaConsensusExit(named().service,
    {replicaId: SELF, backstopMs: 20}),
  {reason: REPLICA_CONSENSUS_EXIT_REASON.BACKSTOP}, 'backstop');
  const release = new AbortController();
  const released = awaitReplicaConsensusExit(named().service,
    {replicaId: SELF, backstopMs: LONG_MS, signal: release.signal});
  t.equal(await settledWithin(released), null, 'waiting before the release');
  release.abort();
  t.same(await settledWithin(released),
    {reason: REPLICA_CONSENSUS_EXIT_REASON.RELEASED}, 'released');
  t.same(await awaitReplicaConsensusExit({replicaId: SELF},
    {replicaId: SELF, backstopMs: LONG_MS}),
  {reason: REPLICA_CONSENSUS_EXIT_REASON.NO_CONSENSUS_PORT}, 'no port');
});
