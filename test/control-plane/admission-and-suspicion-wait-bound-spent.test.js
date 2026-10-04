/**
 * Spent-wait witnesses for two control-plane bounded waits:
 * - PressureGovernor admission: a parked waiter whose deadline passes while
 *   pressure still defers it logs one wait_bound_spent ERROR and still
 *   resolves with the DEFER decision.
 * - SWIM suspicion: a suspect whose suspicion window closes without a
 *   refutation logs one wait_bound_spent ERROR and still becomes DEAD.
 * Normal completion (capacity returns / refutation arrives) logs none.
 */

import {captureLogger} from '../test-helpers/wait-bound-spent-capture.js';
import {test} from '../../src/test-helpers/tap.js';
import {
  PRESSURE_GOVERNOR_ACTION,
  PRESSURE_WORK_CLASS,
  PressureGovernor,
} from '../../src/control-plane/pressure-governor.js';
import {
  MembershipSwimDetector,
  SWIM_MEMBER_STATE,
} from '../../src/control-plane/membership-swim-detector.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';


function createGovernor(summaryRef, clock, logger) {
  return new PressureGovernor({
    nodeId: 'node-admission-spent',
    now: () => clock.nowMs,
    logger,
    messageRouter: {
      getOutboundPressureSummary() {
        return summaryRef;
      },
    },
  });
}

test('admission deadline expiry logs one wait_bound_spent ERROR and still ' +
  'resolves the waiter with DEFER', async (t) => {
  const capture = captureLogger();
  const clock = {nowMs: 100};
  const summaryRef = {backpressured: true, maxPendingUtilization: 1};
  const governor = createGovernor(summaryRef, clock, capture.logger);
  const admission = governor.admit({
    workClass: PRESSURE_WORK_CLASS.BACKGROUND,
    resourceKeys: ['transport:outbound'],
  });
  t.equal(governor.admissionWaiters.length, 1, 'one waiter parked');
  clock.nowMs = 2100;
  governor.drainAdmissionWaiters();
  const decision = await admission;
  t.equal(decision.action, PRESSURE_GOVERNOR_ACTION.DEFER,
    'expiry still resolves DEFER (unchanged)');
  t.equal(governor.admissionWaiters.length, 0, 'queue cleared (unchanged)');

  const spent = capture.spent();
  t.equal(spent.length, 1, 'exactly one wait_bound_spent ERROR');
  const context = spent[0].context;
  t.equal(context.wait, 'PRESSURE_ADMISSION_MAX_WAIT_MS');
  t.equal(context.boundMs, 2000);
  t.equal(context.elapsedMs, 2000, 'elapsed measured with the injected clock');
  t.equal(context.lastObserved.workClass, PRESSURE_WORK_CLASS.BACKGROUND);
  t.equal(context.lastObserved.lastAction, PRESSURE_GOVERNOR_ACTION.DEFER);
  t.equal(context.lastObserved.backpressured, true);
  t.equal(context.lastObserved.sensorThrew, false);
  governor.dispose();
});

test('admission granted on capacity logs no spent wait', async (t) => {
  const capture = captureLogger();
  const clock = {nowMs: 100};
  const summaryRef = {backpressured: true, maxPendingUtilization: 1};
  const governor = createGovernor(summaryRef, clock, capture.logger);
  const admission = governor.admit({
    workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
    resourceKeys: ['transport:outbound'],
  });
  summaryRef.backpressured = false;
  governor.drainAdmissionWaiters();
  const decision = await admission;
  t.equal(decision.action, PRESSURE_GOVERNOR_ACTION.ALLOW);
  t.equal(capture.spent().length, 0, 'no wait_bound_spent on admission');
  governor.dispose();
});

test('SWIM suspicion expiry logs one wait_bound_spent ERROR and still ' +
  'declares the member DEAD', (t) => {
  const capture = captureLogger();
  const detector = new MembershipSwimDetector({
    timeSource: new VirtualTimeSource({startMs: 0}),
    localNodeId: 'node-swim-local',
    logger: capture.logger,
  });
  detector.recordProbeResult('node-swim-suspect-a', false);
  detector.tick(1000);
  t.equal(capture.spent().length, 0, 'nothing logged before the deadline');
  // One tracked member, LHM=1 => suspicion Max = 48000 ms (see detector test).
  detector.tick(48000);
  t.equal(detector.verdictFor('node-swim-suspect-a'), SWIM_MEMBER_STATE.DEAD,
    'expiry still declares DEAD (unchanged)');

  const spent = capture.spent();
  t.equal(spent.length, 1, 'exactly one wait_bound_spent ERROR');
  const context = spent[0].context;
  t.equal(context.wait, 'swimSuspicionTimeoutMs');
  t.equal(context.boundMs, 48000);
  t.equal(context.elapsedMs, 48000);
  t.same(context.lastObserved, {
    memberState: SWIM_MEMBER_STATE.SUSPECT,
    incarnation: 0,
    confirmers: 1,
    localHealthMultiplier: 1,
  });
  t.same(context.scope, {
    nodeId: 'node-swim-local',
    memberNodeId: 'node-swim-suspect-a',
  });
  detector.tick(96000);
  t.equal(capture.spent().length, 1, 'a DEAD member is not re-reported');
  t.end();
});

test('SWIM suspicion refuted before its deadline logs no spent wait', (t) => {
  const capture = captureLogger();
  const detector = new MembershipSwimDetector({
    timeSource: new VirtualTimeSource({startMs: 0}),
    localNodeId: 'node-swim-local',
    logger: capture.logger,
  });
  detector.recordProbeResult('node-swim-suspect-b', false);
  detector.recordProbeResult('node-swim-suspect-b', true);
  detector.tick(1000000);
  t.equal(detector.verdictFor('node-swim-suspect-b'), SWIM_MEMBER_STATE.ALIVE);
  t.equal(capture.spent().length, 0, 'no wait_bound_spent after refutation');
  t.end();
});
