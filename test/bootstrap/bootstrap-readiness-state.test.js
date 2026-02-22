/**
 * Tests for bootstrap readiness state ownership and transition policy.
 */

import {test} from '../../src/test-helpers/tap.js';
import {BootstrapReadinessState} from '../../src/bootstrap/bootstrap-readiness-state.js';
import {READINESS_EVENT} from '../../src/bootstrap/bootstrap-readiness-state-constants.js';

const DEPENDENCY_STARTUP_COMPLETE = 'startup_complete';
const DEPENDENCY_SQL_ENGINE_READY = 'sql_engine_ready';
const DEPENDENCY_LEADER_METADATA_READY = 'leader_metadata_ready';
const DEPENDENCY_RUNTIME_WIRING_READY = 'runtime_wiring_ready';

const REASON_BOOTSTRAP_PHASE_INCOMPLETE = 'BOOTSTRAP_PHASE_INCOMPLETE';
const REASON_SQL_ENGINE_UNAVAILABLE = 'SQL_ENGINE_UNAVAILABLE';
const REASON_LEADER_METADATA_INCOMPLETE = 'LEADER_METADATA_INCOMPLETE';
const REASON_RUNTIME_WIRING_INCOMPLETE = 'RUNTIME_WIRING_INCOMPLETE';

function createTestClock() {
  let nowMs = 1000;
  return {
    now: () => nowMs,
    advance: (ms) => {
      nowMs += ms;
      return nowMs;
    },
  };
}

function setAllDependenciesReady(readiness) {
  readiness.setDependency(DEPENDENCY_STARTUP_COMPLETE, true, {
    reasonCode: REASON_BOOTSTRAP_PHASE_INCOMPLETE,
  });
  readiness.setDependency(DEPENDENCY_SQL_ENGINE_READY, true, {
    reasonCode: REASON_SQL_ENGINE_UNAVAILABLE,
  });
  readiness.setDependency(DEPENDENCY_LEADER_METADATA_READY, true, {
    reasonCode: REASON_LEADER_METADATA_INCOMPLETE,
  });
  readiness.setDependency(DEPENDENCY_RUNTIME_WIRING_READY, true, {
    reasonCode: REASON_RUNTIME_WIRING_INCOMPLETE,
  });
}

test('BootstrapReadinessState - enforces promotion stable window', async (t) => {
  const clock = createTestClock();
  const readiness = new BootstrapReadinessState({
    readyStableWindowMs: 50,
    demotionFailureThreshold: 2,
    now: clock.now,
  });

  setAllDependenciesReady(readiness);
  let snapshot = readiness.evaluate();
  t.equal(snapshot.ready, false,
    'should stay not-ready before stable window elapses');
  t.ok(snapshot.reasons.includes('READINESS_STABLE_WINDOW_PENDING'),
    'should include stable-window pending reason before promotion');

  clock.advance(30);
  snapshot = readiness.evaluate();
  t.equal(snapshot.ready, false,
    'should still be not-ready when stable window is partially elapsed');

  clock.advance(20);
  snapshot = readiness.evaluate();
  t.equal(snapshot.ready, true,
    'should become ready after stable window elapses');
  t.equal(snapshot.state, 'join_ready',
    'should expose join_ready state after promotion');
  t.same(snapshot.reasons, [],
    'should clear blocking reasons after promotion');
});

test('BootstrapReadinessState - demotes only after failure threshold', async (t) => {
  const clock = createTestClock();
  const readiness = new BootstrapReadinessState({
    readyStableWindowMs: 0,
    demotionFailureThreshold: 2,
    now: clock.now,
  });

  setAllDependenciesReady(readiness);
  let snapshot = readiness.evaluate();
  t.equal(snapshot.ready, true, 'should be ready with all dependencies ready');

  readiness.setDependency(DEPENDENCY_LEADER_METADATA_READY, false, {
    reasonCode: REASON_LEADER_METADATA_INCOMPLETE,
  });
  snapshot = readiness.evaluate();
  t.equal(snapshot.ready, true,
    'should remain ready after first transient readiness failure');
  t.equal(snapshot.consecutiveFailureCount, 1,
    'should increment failure counter on first failure');

  snapshot = readiness.evaluate();
  t.equal(snapshot.ready, false,
    'should demote after consecutive failures hit threshold');
  t.equal(snapshot.state, 'degraded',
    'should enter degraded state after demotion');
  t.ok(snapshot.reasons.includes(REASON_LEADER_METADATA_INCOMPLETE),
    'should expose dependency blocker causing demotion');
});

test('BootstrapReadinessState - reports all active blockers in snapshot', async (t) => {
  const clock = createTestClock();
  const readiness = new BootstrapReadinessState({
    readyStableWindowMs: 0,
    demotionFailureThreshold: 1,
    now: clock.now,
  });

  readiness.setDependency(DEPENDENCY_STARTUP_COMPLETE, false, {
    reasonCode: REASON_BOOTSTRAP_PHASE_INCOMPLETE,
  });
  readiness.setDependency(DEPENDENCY_SQL_ENGINE_READY, false, {
    reasonCode: REASON_SQL_ENGINE_UNAVAILABLE,
  });
  readiness.setDependency(DEPENDENCY_LEADER_METADATA_READY, false, {
    reasonCode: REASON_LEADER_METADATA_INCOMPLETE,
  });
  readiness.setDependency(DEPENDENCY_RUNTIME_WIRING_READY, true, {
    reasonCode: REASON_RUNTIME_WIRING_INCOMPLETE,
  });

  const snapshot = readiness.evaluate();
  t.equal(snapshot.ready, false, 'should be not-ready when blockers exist');
  t.equal(snapshot.state, 'bootstrapping',
    'should remain in bootstrapping state while startup incomplete');
  t.ok(snapshot.reasons.includes(REASON_BOOTSTRAP_PHASE_INCOMPLETE),
    'should include startup blocker reason');
  t.ok(snapshot.reasons.includes(REASON_SQL_ENGINE_UNAVAILABLE),
    'should include sql engine blocker reason');
  t.ok(snapshot.reasons.includes(REASON_LEADER_METADATA_INCOMPLETE),
    'should include leader metadata blocker reason');
  t.notOk(snapshot.reasons.includes(REASON_RUNTIME_WIRING_INCOMPLETE),
    'should not include reasons for ready dependencies');
});

test('BootstrapReadinessState - emits transition payload with prior and current state details',
  async (t) => {
    const clock = createTestClock();
    const readiness = new BootstrapReadinessState({
      readyStableWindowMs: 0,
      demotionFailureThreshold: 1,
      now: clock.now,
    });
    const transitions = [];
    readiness.on(READINESS_EVENT.TRANSITION, (transition) => {
      transitions.push(transition);
    });

    readiness.setDependency(DEPENDENCY_STARTUP_COMPLETE, false, {
      reasonCode: REASON_BOOTSTRAP_PHASE_INCOMPLETE,
    });
    readiness.evaluate();

    readiness.setDependency(DEPENDENCY_STARTUP_COMPLETE, true, {
      reasonCode: REASON_BOOTSTRAP_PHASE_INCOMPLETE,
    });
    readiness.evaluate();

    t.equal(transitions.length, 2,
      'should emit one transition into blocked state and one into ready state');
    t.equal(transitions[0].previousState, 'starting',
      'first transition should include previous state');
    t.equal(transitions[0].state, 'bootstrapping',
      'first transition should include new blocked state');
    t.same(transitions[0].reasons, [REASON_BOOTSTRAP_PHASE_INCOMPLETE],
      'first transition should include active blocker reasons');
    t.equal(transitions[1].previousReady, false,
      'promotion transition should include previous ready=false');
    t.equal(transitions[1].ready, true,
      'promotion transition should include ready=true');
    t.same(transitions[1].reasons, [],
      'promotion transition should clear blocker reasons');
  });

test('BootstrapReadinessState - emits blocked duration and aggregates probe metrics by status class',
  async (t) => {
    const clock = createTestClock();
    const readiness = new BootstrapReadinessState({
      readyStableWindowMs: 0,
      demotionFailureThreshold: 1,
      now: clock.now,
    });
    const blockedDurations = [];
    readiness.on(READINESS_EVENT.BLOCKED_DURATION, (event) => {
      blockedDurations.push(event);
    });

    readiness.setDependency(DEPENDENCY_STARTUP_COMPLETE, false, {
      reasonCode: REASON_BOOTSTRAP_PHASE_INCOMPLETE,
    });
    readiness.evaluate();
    clock.advance(40);

    readiness.recordProbeResult('/readyz', 503);
    readiness.recordProbeResult('/readyz', 502);
    readiness.recordProbeResult('/readyz', 200);
    readiness.recordProbeResult('/bootstrap/ready', 404);

    readiness.setDependency(DEPENDENCY_STARTUP_COMPLETE, true, {
      reasonCode: REASON_BOOTSTRAP_PHASE_INCOMPLETE,
    });
    readiness.evaluate();

    const metrics = readiness.getMetrics();
    t.equal(blockedDurations.length, 1,
      'should emit one blocked-duration event when reason clears');
    t.equal(blockedDurations[0].reason, REASON_BOOTSTRAP_PHASE_INCOMPLETE,
      'blocked-duration event should include reason code');
    t.equal(blockedDurations[0].durationMs, 40,
      'blocked-duration event should include elapsed blocked time');
    t.equal(metrics.blockedDurationMs[REASON_BOOTSTRAP_PHASE_INCOMPLETE], 40,
      'blocked duration metrics should accumulate cleared reason duration');
    t.equal(metrics.probeStatusCounts['/readyz:5xx'], 2,
      'probe metrics should aggregate 5xx responses by endpoint');
    t.equal(metrics.probeStatusCounts['/readyz:2xx'], 1,
      'probe metrics should aggregate 2xx responses by endpoint');
    t.equal(metrics.probeStatusCounts['/bootstrap/ready:4xx'], 1,
      'probe metrics should aggregate 4xx responses by endpoint');
  });
