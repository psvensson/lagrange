import t from 'tap';
import LifeRaft from '../../src/raft/liferaft.js';
import {exploreWithPct, runPctSeed, minimizePctDepth} from
  '../distributed/harness/pct-search.js';
import {
  createVirtualNetwork,
  VIRTUAL_NETWORK_RECORD_KIND,
  VIRTUAL_NETWORK_DROP_REASON,
} from '../distributed/harness/virtual-network.js';

// DT6 step 2 — host a REAL state machine on the multi-node VirtualNetwork.
//
// Step 1 lifted the per-instant scheduler to a multi-node network but drove SYNTHETIC
// chains. Step 2 closes the first half of "wire the REAL state machines in": a real
// @markwylde/liferaft node runs ON the network via net.networkTimeSource(id) — a per-node
// DT4 TimeSource whose timers are scheduled as node-owned events on the SAME global queue
// as cross-node messages. So the node's REAL randomized election timer (the DT4 raft seam,
// VirtualTick) and the network's message delivery share ONE event timeline and ONE drain
// loop, and the SAME injected PctScheduler can reorder a co-due election timer against a
// co-due heartbeat message. That is CL-039's mechanism on real code: a seed that stops
// hearing the leader within its election window sheds leadership.
//
// Fidelity + scope (honest): the election timer, its firing, and the FOLLOWER->CANDIDATE
// promotion are all real liferaft. "Leader contact" is modelled as a bare heartbeat MESSAGE
// that calls the real node.heartbeat(window) to re-arm the election timer (the same faithful
// abstraction the DT4 freeze scenario used and that was subagent-reviewed) rather than a full
// AppendEntries packet with term/quorum bookkeeping — wiring two real raft nodes' vote/append
// RPCs over the network is DT6 step 3. The bound on run() (untilMs) stops the drain at the
// window so the post-promotion candidate/leader machinery (which arms repeating timers) does
// not run — we observe the L1->L2 shed instant, exactly as the single-clock DT4 scenario does.

const WINDOW_MS = 100; // deterministic election window: 'election min' == 'election max'.

// Build a real follower node hosted on the network. `onLeaderContact` installs the seed's
// network handler so an inbound 'heartbeat' MESSAGE re-arms its real election timer — the
// node is wired to the network for RECEIVE, and its timers are wired for SCHEDULING.
function hostFollower(net, nodeId) {
  let node = null;
  net.registerNode(nodeId, (message) => {
    if (message.type === 'heartbeat' && node) {
      node.heartbeat(WINDOW_MS); // real liferaft: clears + re-arms the election timeout
    }
  });
  node = new LifeRaft(nodeId, {
    'timeSource': net.networkTimeSource(nodeId),
    'election min': `${WINDOW_MS} ms`,
    'election max': `${WINDOW_MS} ms`,
    'heartbeat': `${WINDOW_MS} ms`,
    'write': (_packet, callback) => {
      if (typeof callback === 'function') {
        callback(null);
      }
    },
  });
  return node;
}

t.test('a real raft node hosts on the network: heartbeat MESSAGES hold leadership',
  async (t) => {
    const net = createVirtualNetwork();
    net.registerNode('peer');
    const seed = hostFollower(net, 'seed');
    t.teardown(() => seed.end());

    let sheds = 0;
    seed.on('heartbeat timeout', () => {
      sheds += 1;
    });

    // The peer keeps contacting the seed within its election window (every 50ms < 100ms).
    // Each heartbeat is a real network MESSAGE delivered to the seed's handler, which
    // re-arms the real election timer — so the election never fires.
    for (const delayMs of [50, 100, 150]) {
      net.send({from: 'peer', to: 'seed', type: 'heartbeat', delayMs});
    }
    net.run({untilMs: 180});

    t.equal(sheds, 0,
      'the election timer never fired while heartbeats were delivered inside the window');
    t.equal(seed.state, LifeRaft.FOLLOWER, 'the seed is still a FOLLOWER (leadership held)');
    const delivered = net.getRecords().filter((record) =>
      record.kind === VIRTUAL_NETWORK_RECORD_KIND.DELIVERED &&
      record.type === 'heartbeat');
    t.equal(delivered.length, 3, 'all three heartbeat messages were delivered over the network');
  });

t.test('a partition drops the heartbeats so the REAL election timer sheds leadership ' +
  '(CL-039 L1->L2 on the network)', async (t) => {
  const net = createVirtualNetwork();
  net.registerNode('peer');
  const seed = hostFollower(net, 'seed');
  // No seed.end() teardown here: a shed promotes the node, and liferaft's promote() is async
  // — end() would null raft.timers while that microtask is still settling and its
  // timers.clear() would throw (the DT4 freeze scenario and test 3 below note the same). The
  // node holds only virtual (network-queued) timers, so there is no native handle to release.

  let shedAtMs = null;
  seed.on('heartbeat timeout', () => {
    if (shedAtMs === null) {
      shedAtMs = net.now();
    }
  });

  // The seed is partitioned from its leader: the heartbeat is dropped at delivery, so the
  // election timer is never re-armed and fires at the window — the seed sheds leadership.
  net.partition('peer', 'seed');
  net.send({from: 'peer', to: 'seed', type: 'heartbeat', delayMs: 50});
  net.run({untilMs: WINDOW_MS + 20});

  t.equal(shedAtMs, WINDOW_MS,
    'the real election timer fired at the election window, through the network drain');
  t.equal(seed.state, LifeRaft.CANDIDATE,
    'the seed left FOLLOWER and promoted to CANDIDATE on the missed window (L1->L2)');
  const dropped = net.getRecords().filter((record) =>
    record.kind === VIRTUAL_NETWORK_RECORD_KIND.DROPPED);
  t.equal(dropped.length, 1, 'the heartbeat was dropped, not delivered');
  t.equal(dropped[0].reason, VIRTUAL_NETWORK_DROP_REASON.LINK_PARTITIONED,
    'the drop reason is the partition');
});

t.test('the partition->shed outcome is deterministic across runs', async (t) => {
  const shedTimes = [];
  for (let run = 0; run < 3; run += 1) {
    const net = createVirtualNetwork();
    net.registerNode('peer');
    const seed = hostFollower(net, 'seed');
    let firedAt = null;
    seed.on('heartbeat timeout', () => {
      if (firedAt === null) {
        firedAt = net.now();
      }
    });
    net.partition('peer', 'seed');
    net.send({from: 'peer', to: 'seed', type: 'heartbeat', delayMs: 50});
    net.run({untilMs: WINDOW_MS + 20});
    shedTimes.push(firedAt);
    // No seed.end(): the node holds only virtual (network-queued) timers — no native handle
    // keeps the loop alive — and end() would null timers while the async promote() microtask
    // from the fire is still settling (the DT4 freeze scenario notes the same).
  }
  t.same(shedTimes, [WINDOW_MS, WINDOW_MS, WINDOW_MS],
    'every run sheds at exactly the election window — a pure function of the schedule');
});

// --- The PCT search over a REAL raft node ------------------------------------------------
// The headline DT6 increment: the SAME search layer (exploreWithPct / runPctSeed /
// minimizePctDepth, unchanged) that found a synthetic delivery race in step 1 now drives a
// REAL liferaft node's leadership. The heartbeat MESSAGE and the real election TIMER are made
// CO-DUE at the window instant — the genuine cross-node delivery race:
//   * scheduler delivers the heartbeat first  -> node.heartbeat re-arms (removes the co-due
//     election event from the queue) -> leadership HOLDS.
//   * scheduler fires the election timer first -> 'heartbeat timeout' -> the node promotes ->
//     leadership SHED.
// So whether a real raft node keeps leadership is a function of the seed alone. This is a
// DEPTH-1 race (one ordering constraint: deliver-election-before-heartbeat) — distinct from
// step 1's depth-2 demote-across race, and minimizePctDepth reports that true depth.

function realRaftCoDueScenario({scheduler}) {
  const net = createVirtualNetwork({scheduler});
  net.registerNode('peer');
  let seed = null;
  net.registerNode('seed', (message) => {
    if (message.type === 'heartbeat' && seed) {
      seed.heartbeat(WINDOW_MS);
    }
  });
  seed = new LifeRaft('seed', {
    'timeSource': net.networkTimeSource('seed'),
    'election min': `${WINDOW_MS} ms`,
    'election max': `${WINDOW_MS} ms`,
    'heartbeat': `${WINDOW_MS} ms`,
    'write': (_packet, callback) => {
      if (typeof callback === 'function') {
        callback(null);
      }
    },
  });
  let shed = false;
  seed.on('heartbeat timeout', () => {
    shed = true;
  });

  // The election timer was armed at construction for t = WINDOW_MS. Deliver the heartbeat
  // co-due with it (delay == WINDOW_MS), then drain only that instant (untilMs == WINDOW_MS)
  // so the scheduler's co-due pick decides hold vs shed and the post-shed machinery is out
  // of scope.
  net.send({from: 'peer', to: 'seed', type: 'heartbeat', payload: {chain: 'beat'}, delayMs: WINDOW_MS});
  net.run({untilMs: WINDOW_MS});

  return {shed};
}

const SCENARIO = Object.freeze({
  scenario: realRaftCoDueScenario,
  invariant: (observation) => observation.shed === false,
  // Group the two co-due events into distinct PCT tasks: the heartbeat message carries
  // chain 'beat'; the adapter-scheduled election timer has no chain -> 'election'.
  keyOf: (event) => (event.payload && event.payload.chain) || 'election',
  stepBudget: 4,
  seedBudget: 100,
});

t.test('PCT search flips a REAL raft node\'s leadership via the co-due delivery order',
  async (t) => {
    const result = exploreWithPct({...SCENARIO, depth: 1});
    t.equal(result.found, true,
      'a seed orders the election timer before the heartbeat -> the real node sheds leadership');
  });

t.test('the shedding seed replays the identical real-raft outcome', async (t) => {
  const found = exploreWithPct({...SCENARIO, depth: 1});
  t.equal(found.found, true, 'precondition: the search found a shedding seed');

  const replay = () => runPctSeed({
    seed: found.seed,
    depth: 1,
    stepBudget: SCENARIO.stepBudget,
    keyOf: SCENARIO.keyOf,
    scenario: SCENARIO.scenario,
  });
  const a = replay();
  const b = replay();
  t.equal(a.observation.shed, true, 'replaying the reported seed sheds leadership again');
  t.equal(b.observation.shed, true, 'replay is itself deterministic (same seed -> same shed)');
});

t.test('minimizePctDepth reports the real-raft race\'s true depth (exactly 1)', async (t) => {
  const minimal = minimizePctDepth({...SCENARIO, minDepth: 1, maxDepth: 4});
  t.equal(minimal.found, true, 'the race is reachable within the depth bound');
  t.equal(minimal.depth, 1,
    'the minimal reproducing depth is 1 — a single co-due delivery-order constraint');
  t.same(minimal.notReproducedBelow, [],
    'nothing below depth 1 to rule out (depth 1 is the floor)');
  t.equal(minimal.observation.shed, true, 'the returned minimal witness sheds leadership');
});
