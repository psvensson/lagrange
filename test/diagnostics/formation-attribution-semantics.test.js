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
//                     not the transcript
//
// The production falsifiers that matter to formation exercise the canonical
// consensus attribution mapping: bootstrap and transport each cross the
// protocol boundary, committed apply crosses its own boundary, and the caller
// is restored afterwards. No caller owns consensus merely because it invoked
// the semantic boundary.
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
  runRaftApplySlice,
  runRaftProtocolActivity,
} from '../../src/diagnostics/raft-formation-attribution.js';
import {
  createVirtualNetwork,
} from '../../test/distributed/harness/virtual-network.js';
import {
  createHostTranscript,
} from '../../test/simulation/formation-sim-host-transcript.js';
import {
  PartitionNodeCluster,
} from '../raft/raft-rs-backend/partition-node-cluster.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';

const ZERO = 0;
const ONE = 1;
const TWO = 2;
const STEP_US = 5;
const CARRIER_DELAY_MS = 1;
const CARRIER_HORIZON_MS = 10;
const NODE_ID = 'node-0';
const TRANSCRIPT_EVENT_NAME = 'HOST_CREATED';
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

    const transcript = createHostTranscript({network});
    transcript.record(TRANSCRIPT_EVENT_NAME, {nodeId: NODE_ID});
    observed.transcript = window.owner();

    const snapshot = window.attribution.stop();

    t.same(observed, {
      executionNode: NEUTRAL,
      microtask: NEUTRAL,
      transcript: NEUTRAL,
      virtualNetwork: NEUTRAL,
    }, 'no carrier decided an owner for work that merely passed through it');
    t.equal(snapshot.busyDurationUs, ZERO,
      'and no owner was charged anything: nothing crossed a boundary');
    t.equal(snapshot.unattributedDurationUs, ZERO,
      'nor did a carrier turn get laundered into the unattributed bucket');
    t.end();
  });

test('bootstrap reaches the consensus protocol boundary and is restored',
  (t) => {
    const window = createWindow();
    window.attribution.start();
    const seen = [];
    let protocolOwner = null;

    runBootstrapActivity(() => {
      seen.push(window.owner());
      window.advance();
      runRaftProtocolActivity(() => {
        protocolOwner = window.owner();
        window.advance();
      });
      seen.push(window.owner());
      window.advance();
    });

    const snapshot = window.attribution.stop();

    t.equal(protocolOwner, FORMATION_OWNER.RAFT_PROTOCOL,
      'the canonical protocol boundary runs as raft_protocol');
    t.same(seen, [FORMATION_OWNER.BOOTSTRAP, FORMATION_OWNER.BOOTSTRAP],
      'bootstrap is restored after the consensus boundary returns');
    t.equal(
      ownerRow(snapshot, FORMATION_OWNER.RAFT_PROTOCOL).handoffCount, ONE,
      'the protocol entry is a new semantic boundary');
    t.equal(ownerRow(snapshot, FORMATION_OWNER.BOOTSTRAP).durationUs,
      STEP_US * TWO,
      'bootstrap owns only its regions around the consensus call');
    t.equal(ownerRow(snapshot, FORMATION_OWNER.RAFT_PROTOCOL).durationUs,
      STEP_US,
      'raft_protocol owns exactly the protocol region');
    t.equal(snapshot.overlapDurationUs, ZERO, 'no simultaneous owners');
    t.equal(snapshot.partitionDeltaUs, ZERO, 'no missing time');
    t.end();
  });

test('transport inbound reaches the consensus protocol boundary and is restored',
  (t) => {
    const window = createWindow();
    window.attribution.start();
    const seen = [];
    let protocolOwner = null;

    runTransportInboundActivity(() => {
      seen.push(window.owner());
      window.advance();
      runRaftProtocolActivity(() => {
        protocolOwner = window.owner();
        window.advance();
      });
      seen.push(window.owner());
      window.advance();
    });

    const snapshot = window.attribution.stop();

    t.equal(protocolOwner, FORMATION_OWNER.RAFT_PROTOCOL,
      'transport hands protocol work to raft_protocol');
    t.same(seen, [FORMATION_OWNER.TRANSPORT, FORMATION_OWNER.TRANSPORT],
      'transport is restored once the consensus boundary returns');
    t.equal(
      ownerRow(snapshot, FORMATION_OWNER.RAFT_PROTOCOL).handoffCount, ONE,
      'the protocol work is an explicit owner handoff');
    t.equal(ownerRow(snapshot, FORMATION_OWNER.TRANSPORT).durationUs,
      STEP_US * TWO,
      'transport owns only the regions around the consensus call');
    t.equal(snapshot.overlapDurationUs, ZERO, 'no simultaneous owners');
    t.equal(snapshot.partitionDeltaUs, ZERO, 'no missing time');
    t.end();
  });

test('committed apply is attributed to the apply owner and restores its caller',
  (t) => {
    const window = createWindow();
    window.attribution.start();
    const seen = [];
    let applyOwner = null;

    runBootstrapActivity(() => {
      seen.push(window.owner());
      window.advance();
      runRaftApplySlice(() => {
        applyOwner = window.owner();
        window.advance();
      });
      seen.push(window.owner());
      window.advance();
    });

    const snapshot = window.attribution.stop();

    t.equal(applyOwner, FORMATION_OWNER.RAFT_APPLY,
      'committed apply executes under the dedicated apply owner');
    t.same(seen, [FORMATION_OWNER.BOOTSTRAP, FORMATION_OWNER.BOOTSTRAP],
      'the caller is restored after apply');
    t.equal(ownerRow(snapshot, FORMATION_OWNER.RAFT_APPLY).handoffCount, ONE,
      'apply is an explicit semantic boundary');
    t.equal(snapshot.overlapDurationUs, ZERO, 'no simultaneous owners');
    t.equal(snapshot.partitionDeltaUs, ZERO, 'no missing time');
    t.end();
  });

// The production engagement of the consensus mapping: a real raft-rs group
// (the one runtime every partition, message-group and WASM service port runs
// on) charges its own protocol turns to raft_protocol and its committed-entry
// application to raft_apply, nested exclusively inside the turn that drives
// it. The application callback advances the clock by a fixed amount, so apply
// time counted twice would show up in the protocol bucket.
test('a raft-rs group charges its protocol turns and committed applies to ' +
  'the consensus owners, exclusively, inside the enclosing turn', (t) => {
  const APPLY_STEP_US = 1000;
  const TICKS = 12;
  const COMMANDS = 3;
  let nowUs = ZERO;
  const attribution = new FormationTurnAttribution({clock: () => nowUs++});
  const applied = [];
  const cluster = new PartitionNodeCluster({
    partitionId: 'attribution-group',
    replicaIds: ['r1'],
    applyFor: (_replicaId, command) => {
      nowUs += APPLY_STEP_US;
      applied.push(command);
    },
  });
  let snapshot = null;
  try {
    attribution.start();
    runBootstrapActivity(() => {
      for (let tick = 0; tick < TICKS; tick += 1) {
        t.equal(typeof cluster.tick('r1')?.then, 'undefined',
          'a single-voter tick turn completes synchronously');
      }
      t.ok(cluster.settle(() => cluster.leaderReplicaId() === 'r1'),
        'the single voter leads');
      for (let index = 0; index < COMMANDS; index += 1) {
        cluster.propose('r1', {op: 'attribution', index});
      }
      t.ok(cluster.settle(() => applied.length === COMMANDS),
        'every proposed command was applied');
    });
    snapshot = attribution.stop();
  } finally {
    cluster.dispose();
  }
  const protocol = ownerRow(snapshot, FORMATION_OWNER.RAFT_PROTOCOL);
  const apply = ownerRow(snapshot, FORMATION_OWNER.RAFT_APPLY);
  const enclosing = ownerRow(snapshot, FORMATION_OWNER.BOOTSTRAP);
  t.ok(protocol.handoffCount >= TICKS,
    `every tick turn entered raft_protocol (${protocol.handoffCount})`);
  t.ok(protocol.durationUs > ZERO, 'and was charged protocol time');
  t.ok(apply.handoffCount >= COMMANDS,
    `every committed entry entered raft_apply (${apply.handoffCount})`);
  t.ok(apply.durationUs >= COMMANDS * APPLY_STEP_US,
    'the application work is charged to raft_apply');
  t.ok(protocol.durationUs < APPLY_STEP_US,
    'apply nested in a protocol turn is not also charged to raft_protocol');
  t.ok(enclosing.durationUs > ZERO, 'the driving turn keeps its own work');
  t.equal(protocol.durationUs + apply.durationUs + enclosing.durationUs,
    snapshot.busyDurationUs,
    'the consensus buckets and the enclosing turn partition its time');
  t.ok(snapshot.busyDurationUs <= snapshot.windowDurationUs,
    'and never exceed it');
  t.equal(snapshot.overlapDurationUs, ZERO, 'no simultaneous owners');
  t.equal(snapshot.partitionDeltaUs, ZERO, 'no missing time');
  t.end();
});

// The apply slice is the entry's whole SQLite commit+apply transaction
// (RAFT_FOLLOWER_COMMIT_APPLY_SLICE), not only the application callback: the
// application here is trivial and the cost is in the transaction around it.
// The store's transaction advances the clock by a fixed amount at commit for
// each applied entry (a transaction that writes the applied state), so the
// commit must land in raft_apply and never in the enclosing protocol turn.
test('a committed entry\'s whole SQLite transaction, its commit included, ' +
  'is charged to raft_apply, not to the protocol turn', (t) => {
  const COMMIT_STEP_US = 5000;
  const TICKS = 12;
  const COMMANDS = 3;
  let nowUs = ZERO;
  const attribution = new FormationTurnAttribution({clock: () => nowUs++});
  const applied = [];
  const transaction = RaftRsDurableStore.prototype.transaction;
  const putAppliedState = RaftRsDurableStore.prototype.putAppliedState;
  let appliesInTransaction = ZERO;
  RaftRsDurableStore.prototype.putAppliedState = function(...args) {
    appliesInTransaction += ONE;
    return putAppliedState.apply(this, args);
  };
  RaftRsDurableStore.prototype.transaction = function(work) {
    const before = appliesInTransaction;
    const result = transaction.call(this, work);
    if (appliesInTransaction > before) nowUs += COMMIT_STEP_US;
    return result;
  };
  const cluster = new PartitionNodeCluster({
    partitionId: 'apply-transaction-group',
    replicaIds: ['r1'],
    applyFor: (_replicaId, command) => {
      applied.push(command);
    },
  });
  let snapshot = null;
  let appliedEntries = ZERO;
  try {
    attribution.start();
    runBootstrapActivity(() => {
      for (let tick = 0; tick < TICKS; tick += 1) cluster.tick('r1');
      t.ok(cluster.settle(() => cluster.leaderReplicaId() === 'r1'),
        'the single voter leads');
      for (let index = 0; index < COMMANDS; index += 1) {
        cluster.propose('r1', {op: 'apply-transaction', index});
      }
      t.ok(cluster.settle(() => applied.length === COMMANDS),
        'every proposed command was applied');
    });
    snapshot = attribution.stop();
    appliedEntries = appliesInTransaction;
  } finally {
    RaftRsDurableStore.prototype.transaction = transaction;
    RaftRsDurableStore.prototype.putAppliedState = putAppliedState;
    cluster.dispose();
  }
  const protocol = ownerRow(snapshot, FORMATION_OWNER.RAFT_PROTOCOL);
  const apply = ownerRow(snapshot, FORMATION_OWNER.RAFT_APPLY);
  t.ok(appliedEntries >= COMMANDS, `${appliedEntries} applied entries ` +
    'each committed their own transaction');
  t.ok(apply.durationUs >= appliedEntries * COMMIT_STEP_US,
    'every apply transaction\'s commit is charged to raft_apply ' +
    `(${apply.durationUs}us)`);
  t.ok(protocol.durationUs < COMMIT_STEP_US,
    `no commit is charged to raft_protocol (${protocol.durationUs}us)`);
  t.equal(apply.handoffCount, appliedEntries,
    'one apply slice per committed entry transaction');
  t.equal(snapshot.overlapDurationUs, ZERO, 'no simultaneous owners');
  t.equal(snapshot.partitionDeltaUs, ZERO, 'no missing time');
  t.end();
});
