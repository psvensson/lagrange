import t from 'tap';
import {createVirtualNetwork} from '../distributed/harness/virtual-network.js';
import {driveNetwork} from '../distributed/harness/raft-network-host.js';
import {RebalanceCoordinator} from '../../src/rebalancer/rebalance-coordinator.js';
import {OperationWorkflowOwner} from '../../src/rebalancer/operation-workflow-owner.js';
import {OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED as SHARED} from
  '../../src/rebalancer/operation-workflow-recovery-reconcile-shared.js';

const SCENARIO_TIMEOUT_MS = 90000;

const {INCOMPLETE_OPERATION_OBSERVATION_STATE} = SHARED;

// DT6 step 11 — drive the REAL checkTimeouts ORCHESTRATION on the virtual clock. Step 10 drove the
// timeout-detection MATH (a parameter-injectable predicate); this step seams the orchestration's own
// clock so the production checkTimeouts loop body reads virtual time.
//
// PRODUCTION SEAM (this step's source change):
//  - operation-workflow-recovery-timeout.js: checkTimeouts read Date.now() directly at two points
//    (the empty-query backoff gate + the reconcile timestamp). Both now route through a new
//    resolveTimeoutCheckNowMs() that returns this.timeSource.now() when a TimeSource is present,
//    else Date.now() (byte-identical default; RealTimeSource.now() === Date.now()).
//  - operation-workflow-owner.js: the owner stores an optional options.timeSource.
//  - rebalance-coordinator-lifecycle.js: threads the coordinator's TimeSource (step 9) into the
//    owner, so injecting a network TimeSource into the coordinator makes checkTimeouts virtual.
//
// What this guard drives: the REAL checkTimeouts EMPTY-observation path — the orchestration's own
// time-driven decision, the empty-incomplete-operation-query BACKOFF (checkTimeouts lines ~128-134 +
// ~169). With no incomplete operations, the real loop records the virtual `now` of the empty query
// and then suppresses further repository queries until virtual time advances past
// incompleteOperationQueryEmptyBackoffMs. So the repository is queried at most once per backoff
// window of VIRTUAL time, regardless of how many loop ticks fire — proven here by counting the real
// repository.getIncompleteOperationVisibilityObservation calls and showing they scale inversely with
// the backoff (double the backoff -> ~half the queries), and are far fewer than the loop ticks.
//
// The loop host is the real RebalanceCoordinator.prototype timeout loop (step 9) on a per-node
// network TimeSource; the body is the real OperationWorkflowOwner.prototype checkTimeouts +
// real backoff/supplement helpers. Only the repository (an I/O boundary) is stubbed to report
// "no incomplete operations".
//
// HONEST SCOPE: the orchestration's clock + empty-query backoff are real and virtual-clock-driven.
// The non-empty timeout-RECONCILE branch (visibility single-flight -> reconcileTimeoutOperation,
// which mutates operation state/persistence) is not driven here; its `now` is seamed identically
// (the same resolveTimeoutCheckNowMs) but exercising it end-to-end needs a real operation-store
// fixture, a later step.

const ownerProto = OperationWorkflowOwner.prototype;
const lifecycleProto = RebalanceCoordinator.prototype;
const START_MS = 1_000_000;
const INTERVAL_MS = 20;
const DRIVE_SPAN_MS = 520;

// Host the real checkTimeouts orchestration loop on one network node; `repository` reports no
// incomplete operations so the loop exercises its real empty-query backoff.
function hostCheckTimeoutsLoop(net, nodeId, backoffMs) {
  net.registerNode(nodeId, () => {});
  const ts = net.networkTimeSource(nodeId);
  const counters = {checks: 0, visibilityQueries: 0};
  const realCheckTimeouts = ownerProto.checkTimeouts;
  const coord = {
    nodeId,
    // step-9 real loop
    isShuttingDown: false,
    timeoutCheckInterval: null,
    timeoutCheckInFlight: false,
    timeoutCheckIntervalMs: INTERVAL_MS,
    timeSource: ts,
    timeoutCheckSetIntervalFn: (fn, ms) => ts.setInterval(fn, ms),
    timeoutCheckClearIntervalFn: (handle) => ts.clearInterval(handle),
    startTimeoutChecking: lifecycleProto.startTimeoutChecking,
    stopTimeoutChecking: lifecycleProto.stopTimeoutChecking,
    logQueryOperationsFailure: () => {},
    // real checkTimeouts orchestration + its real empty-path helpers
    isInitialized: true,
    lastEmptyIncompleteOperationQueryAtMs: 0,
    incompleteOperationQueryEmptyBackoffMs: backoffMs,
    resolveTimeoutCheckNowMs: ownerProto.resolveTimeoutCheckNowMs,
    resolveTimeoutIncompleteVisibilitySupplementMode:
      ownerProto.resolveTimeoutIncompleteVisibilitySupplementMode,
    buildTimeoutIncompleteVisibilitySupplementEvidence:
      ownerProto.buildTimeoutIncompleteVisibilitySupplementEvidence,
    shouldDelayEmptyIncompleteOperationQuery:
      ownerProto.shouldDelayEmptyIncompleteOperationQuery,
    clearEmptyIncompleteOperationQueryDelay:
      ownerProto.clearEmptyIncompleteOperationQueryDelay,
    logger: {error: () => {}, warn: () => {}, info: () => {}, debug: () => {}},
    // count loop entries into the real checkTimeouts, then delegate to the real method
    checkTimeouts: async function checkTimeouts() {
      counters.checks += 1;
      return realCheckTimeouts.call(this);
    },
    // the only stub: the repository I/O boundary reports no incomplete operations
    repository: {
      hasReplicaOperationCacheObservationBoundary: () => false,
      queryCachedIncompleteOperations: async () => [],
      getIncompleteOperationVisibilityObservation: async () => {
        counters.visibilityQueries += 1;
        return {state: INCOMPLETE_OPERATION_OBSERVATION_STATE.EMPTY, operations: []};
      },
    },
  };
  coord.startTimeoutChecking();
  return {coord, counters};
}

async function runBackoff(backoffMs) {
  const net = createVirtualNetwork({startMs: START_MS});
  const host = hostCheckTimeoutsLoop(net, 'W', backoffMs);
  await driveNetwork(net, {untilMs: START_MS + DRIVE_SPAN_MS, stepMs: 5});
  host.coord.stopTimeoutChecking();
  return host.counters;
}

// Harness watchdogs, not latency contracts. tap silently caps every test at
// its 30s default and only TAP_TIMEOUT lifts it, which run-test-files.js
// derives from the largest declaration in this file; declaring nothing left
// these scenarios on the bare 30s cap. Healthy execution measures 9.5s for the
// whole file, so a contended 2-vCPU runner reached 33.0s and reported
// "timeout!". 90000 keeps a genuine hang detectable with room for a slow
// machine. The throttling SEMANTICS under test are asserted on the virtual
// clock below, so they do not depend on wall-clock speed at all.
t.test('the real empty-query backoff throttles repository queries by VIRTUAL time',
  {timeout: SCENARIO_TIMEOUT_MS}, async (t) => {
    const c = await runBackoff(100);
    // ~26 loop ticks over 520ms at a 20ms interval; the real backoff lets the repository be queried
    // only about once per 100ms window.
    t.ok(c.checks >= 20, 'the real checkTimeouts loop body ran on the virtual clock every tick');
    t.ok(c.visibilityQueries > 0, 'the repository was queried at least once');
    t.ok(c.visibilityQueries * 2 < c.checks,
      'queries are far fewer than ticks — the real empty-query backoff throttled them on virtual time');
  });

t.test('the backoff window scales with VIRTUAL time (double the backoff -> ~half the queries)',
  {timeout: SCENARIO_TIMEOUT_MS},
  async (t) => {
    const fast = await runBackoff(100);
    const slow = await runBackoff(200);
    t.ok(fast.visibilityQueries > slow.visibilityQueries,
      'a longer backoff yields fewer real repository queries over the same virtual span');
    // Same tick cadence either way (the loop interval is unchanged); only the query throttle moves —
    // proving it is the virtual-time backoff, not the loop, that gates the queries.
    t.equal(fast.checks, slow.checks, 'identical loop-tick count regardless of backoff');
  });

t.test('the hosted orchestration backoff is deterministic across runs',
  {timeout: SCENARIO_TIMEOUT_MS}, async (t) => {
    const a = await runBackoff(100);
    const b = await runBackoff(100);
    t.same(a, b, 'identical virtual drive -> identical tick + query counts');
  });
