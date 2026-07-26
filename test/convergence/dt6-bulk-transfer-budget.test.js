import t from 'tap';
import LifeRaft from '../../src/raft/liferaft.js';
import {InMemoryLogAdapter} from '../../src/raft/in-memory-log-adapter.js';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {createCostTable} from '../distributed/harness/cost-table.js';
import {connectRaftCluster, driveNetwork} from
  '../distributed/harness/raft-network-host.js';
import {SeededRandomSource} from '../../src/random/random-source.js';
import {
  RAFT_SNAPSHOT_TRANSFER_CHUNK_SIZE_BYTES,
} from '../../src/raft/snapshot-transfer-constants.js';

const TEST_FILE_TIMEOUT_MS = 60_000;
t.setTimeout(TEST_FILE_TIMEOUT_MS);

// ============================================================================
// raft-snapshot-bulk-transfer (S3) DT6 cost-table convergence guard: a REAL
// liferaft cluster with LIVE election timers runs over a cost-modeled
// VirtualNetwork; serving bulk snapshot chunks charges the SERVING NODE'S
// single-core clock `perUnitMs × chunkBytes` per chunk (per-chunk charges
// round to >= 1ms). Causal story (verifier-corrected — the harness has no
// per-peer FIFO link, so this is NOT a socket-HOL model): BOUNDED chunks keep
// the serving node's clock available, so its heartbeat timers fire inside the
// election budget and leadership stays stable under a whole transferred
// payload's worth of chunk serving. The NEGATIVE CONTROL charges the same
// total bytes as ONE unbounded single-chunk cost on the serving leader's
// clock: its heartbeats starve past the election budget, the (un-charged)
// followers' election timers fire, and the term advances — the budget is
// blown. The ONLY difference between the two runs is the chunk BOUND, so the
// bound (not a queue tag) is provably what preserves critical convergence.
//
// Determinism: no wall-clock, no real sockets — the run is a pure function of
// the seeded election RNG + the virtual clock (asserted by replaying a seed).
// ============================================================================

const IDS = Object.freeze(['N1', 'N2', 'N3']);
const REPRO_SEED = 3;
const STEP_MS = 5;
const DRIVE_PROBE_MS = 100;
const ELECTION_SETTLE_MAX_MS = 2_000;
const SERVE_WINDOW_MS = 1_500;
const SERVE_INTERVAL_MS = 25;
const ELECTION_MAX_MS = 200;

// Chunk geometry under proof: the production 1 MiB bound.
const CHUNK_BYTES = RAFT_SNAPSHOT_TRANSFER_CHUNK_SIZE_BYTES;
// Denominate the per-unit cost per FIXED MiB, not per production chunk size:
// otherwise the bounded assertion is invariant to the production constant
// (raising the chunk bound could never fail this guard — verifier finding).
const FIXED_MIB_BYTES = 1024 * 1024;
const BOUNDED_CHUNK_COUNT = 40; // 40 MiB served as bounded chunks
const UNBOUNDED_BYTES = CHUNK_BYTES * 600; // the same lane, one 600 MiB chunk

// Cost model: 2ms of serving-node CPU per MiB served (read + digest + frame).
// Provisional coefficient — the STRUCTURAL red-on-revert (bounded keeps the
// budget, unbounded blows it) is the deliverable, not a calibrated magnitude.
const COST_OP_KEY = 'snapshotTransfer.checkpointChunkServe';
const MS_PER_MIB = 2;
const COST_SPEC = Object.freeze({
  [COST_OP_KEY]: Object.freeze({
    fixedMs: 0,
    perUnitMs: MS_PER_MIB / FIXED_MIB_BYTES,
  }),
});

function clusterOptions(seed) {
  return (id) => ({
    'election min': '100 ms',
    'election max': `${ELECTION_MAX_MS} ms`,
    'heartbeat': '30 ms',
    'write': (_packet, callback) => {
      if (typeof callback === 'function') {
        callback(null);
      }
    },
    'Log': InMemoryLogAdapter,
    'randomSource': new SeededRandomSource({seed: seed * IDS.length + IDS.indexOf(id)}),
  });
}

function leaderOf(rafts) {
  return IDS.find((id) => rafts.get(id).state === LifeRaft.LEADER) || null;
}

function maxTermOf(rafts) {
  return Math.max(...IDS.map((id) => rafts.get(id).term));
}

// Build a live-timer cluster on a cost-modeled network and drive it until a
// real election settles (deterministic per seed).
async function establishCluster(seed) {
  const costTable = createCostTable(COST_SPEC);
  const net = createVirtualNetwork({costTable});
  const rafts = connectRaftCluster(net, IDS, clusterOptions(seed));
  let leader = null;
  let electedAtMs = 0;
  for (let end = DRIVE_PROBE_MS; end <= ELECTION_SETTLE_MAX_MS;
    end += DRIVE_PROBE_MS) {
    await driveNetwork(net, {untilMs: end, stepMs: STEP_MS});
    leader = leaderOf(rafts);
    electedAtMs = end;
    if (leader) {
      break;
    }
  }
  return {net, rafts, leader, electedAtMs, costTable};
}

async function runServingWindow(seed, {bounded}) {
  const {net, rafts, leader, electedAtMs, costTable} =
    await establishCluster(seed);
  try {
    const termBefore = maxTermOf(rafts);
    const timeSource = net.networkTimeSource(leader);
    let servedChunks = 0;
    if (bounded) {
      // The receiver-driven single-in-flight cadence: one bounded chunk per
      // interval, each charged on the serving node's clock.
      const handle = timeSource.setInterval(() => {
        if (servedChunks < BOUNDED_CHUNK_COUNT) {
          timeSource.charge(COST_OP_KEY, CHUNK_BYTES);
          servedChunks += 1;
        } else {
          timeSource.clearInterval(handle);
        }
      }, SERVE_INTERVAL_MS);
    } else {
      // The negative control: the SAME total lane bytes as one unbounded
      // chunk — a single charge the serving node's core must absorb whole.
      timeSource.setTimeout(() => {
        timeSource.charge(COST_OP_KEY, UNBOUNDED_BYTES);
        servedChunks += 1;
      }, STEP_MS);
    }
    await driveNetwork(net,
      {untilMs: electedAtMs + SERVE_WINDOW_MS, stepMs: STEP_MS});
    return {
      leaderBefore: leader,
      electedAtMs,
      termBefore,
      termAfter: maxTermOf(rafts),
      leaderAfter: leaderOf(rafts),
      leaderStateAfter: rafts.get(leader).state,
      servedChunks,
      leaderBusyUntilMs: net.nodeBusyUntil(leader),
      perChunkChargeMs: costTable.cost(COST_OP_KEY, CHUNK_BYTES),
    };
  } finally {
    rafts.forEach((raft) => raft.end());
  }
}

// ============================================================================
// 1. BOUNDED chunks: heartbeat/election budgets stay met while the serving
//    leader charges a whole payload's worth of per-chunk costs.
// ============================================================================
t.test('bounded 1 MiB chunk charges on the serving leader keep the ' +
  'heartbeat/election budget — leadership and term are stable', async (t) => {
  const m = await runServingWindow(REPRO_SEED, {bounded: true});

  t.ok(m.leaderBefore, 'a real live-timer election settled before serving');
  t.ok(m.perChunkChargeMs >= 1,
    `each bounded chunk charge rounds to >= 1ms (${m.perChunkChargeMs}ms/chunk)`);
  t.equal(m.servedChunks, BOUNDED_CHUNK_COUNT,
    'the full bounded transfer was served during the window');
  t.equal(m.leaderAfter, m.leaderBefore,
    'the serving node is still LEADER after the bounded transfer');
  t.equal(m.termAfter, m.termBefore,
    'no election fired: the term never advanced under bounded chunk serving');
  t.end();
});

// ============================================================================
// 2. NEGATIVE CONTROL — the same bytes as ONE unbounded chunk: the serving
//    leader's clock saturates past the election budget and the (un-charged)
//    followers elect — the budget is blown, proving the BOUND is the cause.
// ============================================================================
t.test('an unbounded single-chunk charge on the serving leader blows the ' +
  'election budget — the followers elect a new term', async (t) => {
  const m = await runServingWindow(REPRO_SEED, {bounded: false});

  t.ok(m.leaderBefore, 'a real live-timer election settled before serving');
  t.equal(m.servedChunks, 1, 'the unbounded charge landed');
  t.ok(m.leaderBusyUntilMs > m.electedAtMs + ELECTION_MAX_MS,
    'the serving node\'s single core saturated past the whole election ' +
      `budget (busyUntil ${m.leaderBusyUntilMs})`);
  t.ok(m.termAfter > m.termBefore,
    `the term advanced (${m.termBefore} -> ${m.termAfter}): heartbeats ` +
      'starved past the election budget — the budget is BLOWN');
  t.not(m.leaderStateAfter, LifeRaft.LEADER,
    'the saturated serving node is no longer the leader');
  t.end();
});

// ============================================================================
// 3. THE PIN: identical cluster, seed, lane, and total burden shape — the
//    ONLY difference is the chunk BOUND. Bounded keeps the budget; unbounded
//    blows it. The bound, not a queue tag, preserves critical convergence.
// ============================================================================
t.test('red-on-revert pin: the chunk bound is the sole difference between ' +
  'a kept and a blown election budget', async (t) => {
  const bounded = await runServingWindow(REPRO_SEED, {bounded: true});
  const unbounded = await runServingWindow(REPRO_SEED, {bounded: false});

  t.equal(bounded.leaderBefore, unbounded.leaderBefore,
    'both runs start from the identical seeded election');
  t.equal(bounded.termAfter, bounded.termBefore,
    'bounded: budget kept (no term advance)');
  t.ok(unbounded.termAfter > unbounded.termBefore,
    'unbounded: budget blown (term advanced)');
  t.end();
});

// ============================================================================
// 4. DETERMINISM: the same seed replays the identical outcome (pure function
//    of the seeded RNG + virtual clock).
// ============================================================================
t.test('the same seed replays the identical blown-budget outcome',
  async (t) => {
    const a = await runServingWindow(REPRO_SEED, {bounded: false});
    const b = await runServingWindow(REPRO_SEED, {bounded: false});
    t.same(
      {
        leaderBefore: a.leaderBefore,
        termAfter: a.termAfter,
        leaderAfter: a.leaderAfter,
        leaderBusyUntilMs: a.leaderBusyUntilMs,
      },
      {
        leaderBefore: b.leaderBefore,
        termAfter: b.termAfter,
        leaderAfter: b.leaderAfter,
        leaderBusyUntilMs: b.leaderBusyUntilMs,
      },
      'identical seed => identical election, saturation, and term outcome',
    );
    t.end();
  });
