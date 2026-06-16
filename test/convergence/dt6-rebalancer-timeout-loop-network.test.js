import t from 'tap';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {driveNetwork} from '../distributed/harness/raft-network-host.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';

// DT6 step 9 — host a SECOND real control-plane loop on the VirtualNetwork: the rebalancer's
// periodic timeout-check driver. Steps 5-8 hosted the owner-membership publication driver; this
// step proves the harness generalises to another production subsystem, and exercises the new
// production seam that makes it hostable.
//
// PRODUCTION SEAM (this step's source change, src/rebalancer/rebalance-coordinator-lifecycle.js):
// startTimeoutChecking()/stopTimeoutChecking() previously called the platform setInterval/
// clearInterval directly (with an unref()). They now run on a TimeSource (resolveTimeSource;
// default RealTimeSource = the platform globals, byte-identical, inert in production) with optional
// setIntervalFn/clearIntervalFn overrides — mirroring the owner driver's DT4 seam. With a per-node
// network TimeSource injected, the loop's interval becomes an event on the network's deterministic
// queue, so the convergence harness can advance it in virtual time.
//
// What this guard asserts:
//  - CADENCE: with nodes running, the real startTimeoutChecking loop fires checkTimeouts on the
//    virtual-clock cadence (the loop is genuinely hosted on the network clock, not a wall timer).
//  - FREEZE (CL-039 substrate): a stopped node's hosted loop freezes — its per-node clock stops and
//    its timer events are dropped — while peers keep ticking. This is the exact per-node-clock
//    property the harness exists to model (a node that loses its clock under partition/stop).
//  - DETERMINISM: identical topology + drive -> identical per-node tick counts.
//
// HONEST SCOPE: the hosted methods are the REAL production startTimeoutChecking/stopTimeoutChecking
// consuming the real seam fields. The checkTimeouts BODY is a counting stand-in here (step-5-style):
// the real timeout DETECTION (operation-workflow-recovery-timeout.js checkTimeouts) reads Date.now()
// directly and runs the repository visibility pipeline, so driving real timeout detection on the
// virtual clock needs a further `now` seam on that body — the next increment (step 10), recorded so
// it is not mistaken for already-covered.

const lifecycleProto = RebalanceCoordinator.prototype;

// Host the REAL rebalancer timeout-check loop on one network node. Sets the seam fields exactly as
// initializeCoordinatorState wires them from an injected timeSource, then calls the real
// startTimeoutChecking (which consumes those fields).
function hostTimeoutLoop(net, nodeId, intervalMs) {
  net.registerNode(nodeId, () => {});
  const ts = net.networkTimeSource(nodeId);
  const counters = {checks: 0};
  const coord = {
    nodeId,
    isShuttingDown: false,
    timeoutCheckInterval: null,
    timeoutCheckInFlight: false,
    timeoutCheckIntervalMs: intervalMs,
    // Seam fields, wired from the injected TimeSource exactly as initializeCoordinatorState does.
    timeSource: ts,
    timeoutCheckSetIntervalFn: (fn, ms) => ts.setInterval(fn, ms),
    timeoutCheckClearIntervalFn: (handle) => ts.clearInterval(handle),
    // Real production loop methods.
    startTimeoutChecking: lifecycleProto.startTimeoutChecking,
    stopTimeoutChecking: lifecycleProto.stopTimeoutChecking,
    logQueryOperationsFailure: () => {},
    // Counting stand-in for the timeout-detection body (see HONEST SCOPE above).
    checkTimeouts: async () => {
      counters.checks += 1;
    },
  };
  coord.startTimeoutChecking();
  return {coord, counters};
}

async function runTimeoutLoopScenario() {
  const ids = ['R1', 'R2', 'R3'];
  const net = createVirtualNetwork();
  const hosts = new Map(ids.map((id) => [id, hostTimeoutLoop(net, id, 20)]));
  const counts = () => Object.fromEntries(ids.map((id) => [id, hosts.get(id).counters.checks]));

  // Phase A — all nodes running: every loop ticks on the virtual clock.
  await driveNetwork(net, {untilMs: 400, stepMs: 5});
  const afterRun = counts();

  // Phase B — stop R1: its hosted loop freezes (per-node clock stops, timer events dropped) while
  // R2/R3 keep ticking.
  net.killNode('R1');
  await driveNetwork(net, {untilMs: 800, stepMs: 5});
  const afterKill = counts();

  ids.forEach((id) => hosts.get(id).coord.stopTimeoutChecking());
  return {afterRun, afterKill};
}

t.test('Phase A: the real rebalancer timeout loop fires on the virtual-clock cadence', async (t) => {
  const m = await runTimeoutLoopScenario();
  for (const id of ['R1', 'R2', 'R3']) {
    t.ok(m.afterRun[id] > 0, `${id} loop was hosted and ticked on the network clock`);
  }
  // ~400ms / 20ms interval, minus in-flight skips — bounded well below the naive ceiling but clearly
  // running. Assert a sane band rather than an exact count (in-flight gating can skip a tick).
  t.ok(m.afterRun.R2 >= 5 && m.afterRun.R2 <= 20,
    'tick count is consistent with a 20ms interval over ~400ms of virtual time');
});

t.test('Phase B (CL-039 freeze): a stopped node freezes while peers keep ticking', async (t) => {
  const m = await runTimeoutLoopScenario();
  t.equal(m.afterKill.R1, m.afterRun.R1,
    'R1 (stopped) froze — its hosted loop took no further ticks after killNode');
  t.ok(m.afterKill.R2 > m.afterRun.R2,
    'R2 (running) kept ticking through the second drive window');
  t.ok(m.afterKill.R3 > m.afterRun.R3,
    'R3 (running) kept ticking through the second drive window');
});

t.test('the hosted timeout loop is deterministic across identical runs', async (t) => {
  const a = await runTimeoutLoopScenario();
  const b = await runTimeoutLoopScenario();
  t.same(a, b, 'identical topology + drive -> identical per-node tick counts');
});
