// The node's accepted protocol work belongs to the owner of the dispatch that
// accepted it.
//
// The inbound DATA listener enters raft_protocol and then hands the returned
// task to the protocol-task tracker. The tracker keeps its bookkeeping in
// promises of its own, so WHERE it is handed the task decides whether every
// continuation of that dispatch carries the dispatch's owner or none at all.
// Handed over one statement after the region closed, it produced tens of
// thousands of unowned continuations while every "does this segment have some
// owner" check stayed happy.
//
// So this witness asserts owner IDENTITY at the handover instant. Move the
// handover back outside runRaftProtocolActivity and the first assertion goes
// red; the second exists so the first cannot pass vacuously, by showing the
// same instrument reads `unattributed` for a handover made with no owner in
// force.
import {test} from '../../src/test-helpers/tap.js';
import {FORMATION_OWNER} from
  '../../src/diagnostics/formation-diagnostics-contract.js';
import {
  FormationTurnAttribution,
} from '../../src/diagnostics/formation-turn-attribution.js';
import {
  RaftProtocolTaskTracker,
} from '../../src/raft/raft-protocol-task-tracker.js';
import {RAFT_PACKET_TYPE} from '../../src/raft/constants.js';
import LifeRaft from '../../src/raft/liferaft.js';

const ZERO = 0;
const ONE = 1;
const LONG_TIMER_MS = 60_000;
const SELF_ADDRESS = 'node-a/partition/p1-r1';
const PEER_ADDRESS = 'node-b/partition/p1-r2';
const PROBE_PACKET_TYPE = 'diagnostic-probe';
const NEUTRAL = FORMATION_OWNER.UNATTRIBUTED;

// The owner in force at the instant the tracker is handed a task, by the
// accounting owner's own rule: the exclusive segment while JavaScript runs,
// the async-local store otherwise.
function observeHandoverOwner(attribution) {
  const owners = [];
  const real = RaftProtocolTaskTracker.prototype.track;
  RaftProtocolTaskTracker.prototype.track = function(task) {
    const active = attribution.depth > ZERO ?
      attribution.activeOwner : attribution.context.getStore();
    owners.push(typeof active === 'string' ? active : NEUTRAL);
    return real.call(this, task);
  };
  return {
    owners,
    restore() {
      RaftProtocolTaskTracker.prototype.track = real;
    },
  };
}

function createRaft() {
  const raft = new LifeRaft(SELF_ADDRESS, {
    'election min': LONG_TIMER_MS,
    'election max': LONG_TIMER_MS,
    'heartbeat': LONG_TIMER_MS,
  });
  raft.timers.clear();
  return raft;
}

test('a tracked protocol task is handed over inside the owner that accepted it',
  async (t) => {
    const attribution = new FormationTurnAttribution();
    const observed = observeHandoverOwner(attribution);
    const raft = createRaft();
    attribution.start();
    let emitted = false;
    const response = await new Promise((resolve) => {
      emitted = raft.emit('data', {
        address: PEER_ADDRESS,
        leader: '',
        state: raft.state,
        term: raft.term,
        type: PROBE_PACKET_TYPE,
      }, resolve);
    });
    // The same tracker, handed a task with no owner in force. Without this the
    // assertion above could pass for an instrument that reports raft_protocol
    // no matter where the handover happened.
    raft.protocolTasks.track(Promise.resolve());
    attribution.stop();
    observed.restore();
    raft.end();

    t.equal(emitted, true, 'the production DATA listener is reached');
    t.equal(response.type, RAFT_PACKET_TYPE.ERROR,
      'and the upstream unknown-packet behaviour is what is exercised');
    t.equal(observed.owners.length, ONE + ONE,
      'two handovers were observed: the dispatch and the neutral control');
    t.equal(observed.owners[ZERO], FORMATION_OWNER.RAFT_PROTOCOL,
      'the dispatch hands its task to the tracker INSIDE the raft_protocol ' +
        'region, so every continuation the tracker creates inherits it');
    t.equal(observed.owners[ONE], NEUTRAL,
      'and the same instrument reads unattributed for a handover made with ' +
        'no owner in force, so the assertion above is not vacuous');
    t.end();
  });
