// The formation attribution SEMANTICS, sealed before any population is
// measured.
//
// The question is not how much work carries an owner. It is who was allowed
// to decide the owner. Four claims, each established on its own:
//
//   direct entry      an unowned execution enters runFormationOwner(X) and
//                     only the enclosed semantic work becomes X
//   async inheritance work scheduled while X is authoritative inherits X
//                     across the real async resource, and a later generation
//                     keeps it without another wrapper
//   explicit handoff  when A invokes a boundary owned by B the nested work is
//                     exclusively B, the handoff is counted as a NEW semantic
//                     boundary rather than an inherited dispatch, and A
//                     resumes afterwards
//   neutral carrier   generic machinery that merely transports execution
//                     invents no owner - not the execution-node context, not
//                     VirtualNetwork delivery, not a microtask continuation,
//                     not a remote peer representation, not the transcript
//
// The two production falsifiers that matter to formation are the same claim
// read through real objects: bootstrap and transport each REACH a Raft
// semantic boundary, hand off to raft_protocol, and are restored afterwards.
// Neither owns Raft merely because it made the call.
import {test} from '../../src/test-helpers/tap.js';
import {FORMATION_OWNER} from
  '../../src/diagnostics/formation-diagnostics-contract.js';
import {
  FormationTurnAttribution,
  runOnExecutionNode,
} from '../../src/diagnostics/formation-turn-attribution.js';
import {
  runBootstrapActivity,
  runTransportInboundActivity,
} from '../../src/diagnostics/formation-owner-attribution.js';
import {
  createRemotePeerRepresentation,
} from '../../src/raft/remote-peer-representation.js';
import LifeRaft from '../../src/raft/liferaft.js';
import {
  createVirtualNetwork,
} from '../../test/distributed/harness/virtual-network.js';
import {
  createHostTranscript,
} from '../../test/simulation/formation-sim-host-transcript.js';

const ZERO = 0;
const ONE = 1;
const TWO = 2;
const STEP_US = 5;
const LONG_TIMER_MS = 60_000;
const CARRIER_DELAY_MS = 1;
const CARRIER_HORIZON_MS = 10;
const NODE_ID = 'node-0';
const PEER_ADDRESS = 'node-b/partition/p1-r2';
const SELF_ADDRESS = 'node-a/partition/p1-r1';
const TRANSCRIPT_EVENT_NAME = 'HOST_CREATED';
const PROBE_PACKET_TYPE = 'diagnostic-probe';
// The accounting owner normalises an empty store to its own bucket, so "no
// ownership transition occurred" is observed as unattributed, never as an
// absent value.
const NEUTRAL = FORMATION_OWNER.UNATTRIBUTED;

function createWindow() {
  let nowUs = ZERO;
  const attribution = new FormationTurnAttribution({clock: () => nowUs});
  return {
    advance: () => {
      nowUs += STEP_US;
    },
    attribution,
    // The owner in force right now, by the accounting owner's own rule.
    owner: () => {
      const active = attribution.depth > ZERO ?
        attribution.activeOwner : attribution.context.getStore();
      return typeof active === 'string' ? active : NEUTRAL;
    },
  };
}

function ownerRow(snapshot, owner) {
  return snapshot.owners.find((entry) => entry.owner === owner);
}

// A Raft timers port that samples the owner in force AT THE MOMENT the
// production protocol path arms a timer. That instant is inside the Raft
// semantic boundary, so it is where a handoff is either visible or absent.
function samplingTimers(onArm) {
  const armed = new Map();
  return {
    active: (name) => armed.has(name),
    adjust() {
      return this;
    },
    clear(...names) {
      if (names.length === ZERO) armed.clear();
      for (const name of names) armed.delete(name);
      return this;
    },
    end() {
      armed.clear();
      return true;
    },
    setTimeout(name, callback, duration) {
      onArm();
      armed.set(name, {callback, duration});
      return this;
    },
    setInterval(name, callback, duration) {
      onArm();
      armed.set(name, {callback, duration});
      return this;
    },
    setImmediate(name, callback) {
      onArm();
      armed.set(name, {callback, duration: ZERO});
      return this;
    },
  };
}

function createRaft(onArm) {
  const raft = new LifeRaft(SELF_ADDRESS, {
    'election min': LONG_TIMER_MS,
    'election max': LONG_TIMER_MS,
    'heartbeat': LONG_TIMER_MS,
  });
  raft.timers.clear();
  raft.timers = samplingTimers(onArm);
  return raft;
}

test('an unowned execution acquires an owner only inside the entry it crosses',
  (t) => {
    const window = createWindow();
    window.attribution.start();
    const before = window.owner();
    window.advance();
    let inside = null;
    runBootstrapActivity(() => {
      inside = window.owner();
      window.advance();
    });
    const after = window.owner();
    window.advance();
    const snapshot = window.attribution.stop();

    t.equal(before, NEUTRAL, 'the parent starts with no semantic owner');
    t.equal(inside, FORMATION_OWNER.BOOTSTRAP,
      'the enclosed work, and only it, becomes bootstrap');
    t.equal(after, NEUTRAL, 'the parent is unowned again once the entry ends');
    t.equal(ownerRow(snapshot, FORMATION_OWNER.BOOTSTRAP).durationUs, STEP_US,
      'bootstrap is charged the enclosed work and nothing around it');
    // Time outside every segment is IDLE, not unattributed: unattributed is
    // reserved for a dispatched turn that carried no owner, which is a
    // different thing from no turn running at all.
    t.equal(snapshot.idleDurationUs, STEP_US * TWO,
      'the work outside the entry is charged to no owner');
    t.equal(snapshot.unattributedDurationUs, ZERO,
      'and it is not laundered into the unattributed dispatch bucket');
    t.equal(snapshot.overlapDurationUs, ZERO, 'no overlapping owners');
    t.equal(snapshot.partitionDeltaUs, ZERO, 'no missing time');
    t.end();
  });

test('work scheduled inside an owner inherits it across a real async resource',
  async (t) => {
    const window = createWindow();
    window.attribution.start();
    const generations = [];
    await new Promise((resolve) => {
      runBootstrapActivity(() => {
        setTimeout(() => {
          generations.push(window.owner());
          window.advance();
          setTimeout(() => {
            generations.push(window.owner());
            window.advance();
            resolve();
          }, ZERO);
        }, ZERO);
      });
    });
    const snapshot = window.attribution.stop();
    const bootstrap = ownerRow(snapshot, FORMATION_OWNER.BOOTSTRAP);

    t.same(generations,
      [FORMATION_OWNER.BOOTSTRAP, FORMATION_OWNER.BOOTSTRAP],
      'both timer generations run as bootstrap with no further wrapper');
    // A handoff is specifically owner-to-owner: runFormationOwner counts one
    // only when another owner is already active, and it counts no dispatch
    // ever. So an explicit entry made from a NEUTRAL parent is recorded in
    // neither counter, and the snapshot alone cannot say where a lineage was
    // entered. Anything that needs that distinction must observe the entry
    // itself rather than infer it from these numbers.
    t.equal(bootstrap.handoffCount, ZERO,
      'no owner was active, so no owner-to-owner handoff occurred');
    t.equal(bootstrap.dispatchCount, TWO,
      'only the two inherited generations are counted: the explicit entry ' +
        'that started the lineage appears in neither counter');
    t.equal(snapshot.overlapDurationUs, ZERO, 'no overlapping owners');
    t.end();
  });

test('a nested semantic boundary is exclusively the callee, and the caller resumes',
  (t) => {
    const window = createWindow();
    window.attribution.start();
    const seen = [];
    runBootstrapActivity(() => {
      seen.push(window.owner());
      window.advance();
      runTransportInboundActivity(() => {
        seen.push(window.owner());
        window.advance();
      });
      seen.push(window.owner());
      window.advance();
    });
    const snapshot = window.attribution.stop();

    t.same(seen, [
      FORMATION_OWNER.BOOTSTRAP,
      FORMATION_OWNER.TRANSPORT,
      FORMATION_OWNER.BOOTSTRAP,
    ], 'the nested region is exclusively the callee and the caller resumes');
    t.equal(ownerRow(snapshot, FORMATION_OWNER.TRANSPORT).durationUs, STEP_US,
      'the callee is charged exactly its own region');
    t.equal(ownerRow(snapshot, FORMATION_OWNER.TRANSPORT).handoffCount, ONE,
      'the handoff is counted as a new semantic boundary');
    t.equal(ownerRow(snapshot, FORMATION_OWNER.BOOTSTRAP).durationUs,
      STEP_US * TWO,
      'the caller keeps its own regions and none of the callee time');
    t.equal(snapshot.overlapDurationUs, ZERO,
      'the two owners are never simultaneously authoritative');
    t.equal(snapshot.partitionDeltaUs, ZERO, 'no missing time');
    t.end();
  });

// Every one of these is generic machinery whose whole job is to carry
// execution from one place to another. Carrying it is not a semantic
// decision, so none of them may hand the work an owner.
test('generic carriers transport execution without inventing an owner',
  async (t) => {
    const window = createWindow();
    window.attribution.start();
    const observed = {};

    observed.executionNode = runOnExecutionNode(NODE_ID, () => window.owner());

    observed.microtask = await Promise.resolve().then(() => window.owner());

    const network = createVirtualNetwork();
    network.registerNode(NODE_ID);
    network.startNode(NODE_ID);
    network.setTimer(NODE_ID, () => {
      observed.virtualNetwork = window.owner();
    }, CARRIER_DELAY_MS);
    network.runStep({untilMs: CARRIER_HORIZON_MS});

    const representation = createRemotePeerRepresentation({
      address: PEER_ADDRESS,
      write: (packet, callback) => {
        observed.peerWrite = window.owner();
        return callback(null, packet);
      },
    });
    await new Promise((resolve) => {
      representation.write({type: PROBE_PACKET_TYPE}, resolve);
    });
    representation.once('end', () => {
      observed.peerEnd = window.owner();
    });
    representation.end();

    const transcript = createHostTranscript({network});
    transcript.record(TRANSCRIPT_EVENT_NAME, {nodeId: NODE_ID});
    observed.transcript = window.owner();

    const snapshot = window.attribution.stop();

    t.same(observed, {
      executionNode: NEUTRAL,
      microtask: NEUTRAL,
      peerEnd: NEUTRAL,
      peerWrite: NEUTRAL,
      transcript: NEUTRAL,
      virtualNetwork: NEUTRAL,
    }, 'no carrier decided an owner for work that merely passed through it');
    t.equal(snapshot.busyDurationUs, ZERO,
      'and no owner was charged anything: nothing crossed a boundary');
    t.equal(snapshot.unattributedDurationUs, ZERO,
      'nor did a carrier turn get laundered into the unattributed bucket');
    t.end();
  });

test('bootstrap reaches a Raft boundary, hands off, and is restored',
  (t) => {
    const window = createWindow();
    const armOwners = [];
    const raft = createRaft(() => {
      armOwners.push(window.owner());
      window.advance();
    });
    window.attribution.start();
    const seen = [];
    runBootstrapActivity(() => {
      seen.push(window.owner());
      window.advance();
      raft.heartbeat(LONG_TIMER_MS);
      seen.push(window.owner());
      window.advance();
    });
    const snapshot = window.attribution.stop();
    raft.end();

    t.same(armOwners, [FORMATION_OWNER.RAFT_PROTOCOL],
      'the production heartbeat path arms its timer as raft_protocol');
    t.same(seen, [FORMATION_OWNER.BOOTSTRAP, FORMATION_OWNER.BOOTSTRAP],
      'bootstrap is restored after the Raft boundary returns');
    t.equal(
      ownerRow(snapshot, FORMATION_OWNER.RAFT_PROTOCOL).handoffCount, ONE,
      'the Raft entry is a new semantic boundary, not an inherited dispatch');
    t.equal(ownerRow(snapshot, FORMATION_OWNER.BOOTSTRAP).durationUs,
      STEP_US * TWO,
      'bootstrap does not own Raft merely because it made the call');
    t.equal(ownerRow(snapshot, FORMATION_OWNER.RAFT_PROTOCOL).durationUs,
      STEP_US,
      'and raft_protocol owns exactly the work inside its boundary');
    t.equal(snapshot.overlapDurationUs, ZERO, 'no simultaneous owners');
    t.equal(snapshot.partitionDeltaUs, ZERO, 'no missing time');
    t.end();
  });

test('transport inbound reaches a real DATA dispatch, hands off, and is restored',
  async (t) => {
    const window = createWindow();
    const raft = createRaft(() => undefined);
    window.attribution.start();
    const seen = [];
    let dispatchOwner = null;
    const settled = new Promise((resolve) => {
      runTransportInboundActivity(() => {
        seen.push(window.owner());
        window.advance();
        raft.emit('data', {
          address: PEER_ADDRESS,
          leader: '',
          state: raft.state,
          term: raft.term,
          type: PROBE_PACKET_TYPE,
        }, (packet) => {
          dispatchOwner = window.owner();
          window.advance();
          resolve(packet);
        });
        seen.push(window.owner());
        window.advance();
      });
    });
    await settled;
    const snapshot = window.attribution.stop();
    raft.end();

    t.equal(dispatchOwner, FORMATION_OWNER.RAFT_PROTOCOL,
      'the real production DATA dispatch executes as raft_protocol');
    t.same(seen, [FORMATION_OWNER.TRANSPORT, FORMATION_OWNER.TRANSPORT],
      'transport is restored once the dispatch boundary returns');
    t.equal(
      ownerRow(snapshot, FORMATION_OWNER.RAFT_PROTOCOL).handoffCount, ONE,
      'the dispatch is an explicit handoff, counted as its own boundary');
    t.equal(ownerRow(snapshot, FORMATION_OWNER.TRANSPORT).durationUs,
      STEP_US * TWO,
      'transport does not own Raft merely because it delivered the frame');
    t.equal(snapshot.overlapDurationUs, ZERO, 'no simultaneous owners');
    t.equal(snapshot.partitionDeltaUs, ZERO, 'no missing time');
    t.end();
  });
