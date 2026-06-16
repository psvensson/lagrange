import t from 'tap';
import LifeRaft from '../../src/raft/liferaft.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';

// DT4 step 3 — the in-process freeze→leadership scenario, deterministic, no docker.
//
// CL-039's binding causal link is L1→L2: a control-plane seed that blocks its event
// loop past the raft election timeout (a "freeze") fails to service the heartbeat
// deadline and SHEDS leadership; while heartbeats are serviced within the window,
// leadership HOLDS. With the DT4 Raft election seam (a VirtualTick on a
// VirtualTimeSource), this whole chain is reproducible by advancing a single virtual
// clock — the seed "misses the election timeout" on command, with no SIGSTOP and no
// sampling. The base raft node's election timer is the real one; only its clock is
// virtual.
//
// (Wiring the full owner-driver + readiness + lease onto the SAME clock to drive the
// downstream publication-stall is the larger DT5/DT6 generalization; this scenario
// pins the L1→L2 mechanism the seam exists to make deterministic.)

const ELECTION_MS = 100;

function makeFollower(clock) {
  // A real LifeRaft node on the virtual clock: FOLLOWER by default, deterministic
  // election window (min==max so there is no RNG jitter), write is a no-op sink.
  return new LifeRaft('seed', {
    'timeSource': clock,
    'election min': `${ELECTION_MS} ms`,
    'election max': `${ELECTION_MS} ms`,
    'heartbeat': `${ELECTION_MS} ms`,
    'write': (_packet, callback) => {
      if (typeof callback === 'function') {
        callback(null);
      }
    },
  });
}

t.test('heartbeats serviced within the election window HOLD leadership', async (t) => {
  const clock = new VirtualTimeSource();
  const node = makeFollower(clock);
  t.teardown(() => node.end());

  let electionTimeouts = 0;
  node.on('heartbeat timeout', () => {
    electionTimeouts += 1;
  });

  // Heartbeat serviced every 50ms (< the 100ms election window): each receipt
  // re-arms the election timer, exactly as liferaft does on an inbound append.
  for (let step = 0; step < 6; step += 1) {
    clock.advance(50);
    node.heartbeat(ELECTION_MS); // models "leader heartbeat received -> reset"
  }
  clock.advance(50);

  t.equal(electionTimeouts, 0,
    'no election fired while heartbeats were serviced inside the window');
  t.equal(clock.now(), 350, 'virtual clock advanced deterministically');
});

t.test('a freeze past the election timeout SHEDS leadership', async (t) => {
  const clock = new VirtualTimeSource();
  const node = makeFollower(clock);
  t.teardown(() => node.end());

  let electionFiredAtMs = null;
  node.on('heartbeat timeout', () => {
    electionFiredAtMs = clock.now();
  });

  // The freeze: the event loop is blocked, no heartbeat is serviced. Advancing the
  // virtual clock past the election window fires the election timer.
  clock.advance(ELECTION_MS - 1);
  t.equal(electionFiredAtMs, null, 'leadership still held one ms before the deadline');

  clock.advance(1);
  t.equal(electionFiredAtMs, ELECTION_MS,
    'election fires exactly at the election timeout — leadership shed (CL-039 L1→L2)');
  t.not(node.state, LifeRaft.FOLLOWER,
    'the node left FOLLOWER (promoted to candidate/leader) on the missed deadline');
});

t.test('the freeze→shed outcome is deterministic across runs', async (t) => {
  const fireTimes = [];
  for (let run = 0; run < 3; run += 1) {
    const clock = new VirtualTimeSource();
    const node = makeFollower(clock);
    let firedAt = null;
    node.on('heartbeat timeout', () => {
      // Capture only the FIRST shed; after promotion the node re-arms further
      // timers, which is out of scope for the L1→L2 instant.
      if (firedAt === null) {
        firedAt = clock.now();
      }
    });
    // One election window past the deadline — enough to fire the first shed,
    // without driving the post-promotion candidate/leader machinery.
    clock.advance(ELECTION_MS + 20);
    fireTimes.push(firedAt);
    // No node.end() here: the nodes hold only virtual timers (no native handles
    // keep the loop alive), and end() would null raft.timers while the async
    // promote() microtask from the fire is still settling.
  }
  t.same(fireTimes, [ELECTION_MS, ELECTION_MS, ELECTION_MS],
    'identical advances produce an identical election-timeout instant every run');
});
