import {test} from '../../src/test-helpers/tap.js';
import {LifecycleController} from '../../src/bootstrap/lifecycle-controller.js';
import {
  LIFECYCLE_DEPENDENCY_CLASS,
  LIFECYCLE_PHASE,
  LIFECYCLE_REASON,
} from '../../src/bootstrap/lifecycle-controller-constants.js';

function createClock() {
  let nowMs = 1000;
  return {
    now: () => nowMs,
    advance: (ms) => {
      nowMs += ms;
      return nowMs;
    },
  };
}

test('LifecycleController - allows legal phase transitions and records metadata',
  async (t) => {
    const clock = createClock();
    const lifecycle = new LifecycleController({
      now: clock.now,
    });

    lifecycle.transitionTo(LIFECYCLE_PHASE.CONTROL_READY, {
      reasons: [LIFECYCLE_REASON.BOOTSTRAP_PHASE_INCOMPLETE],
    });
    clock.advance(5);
    lifecycle.transitionTo(LIFECYCLE_PHASE.JOIN_READY);
    clock.advance(5);
    lifecycle.transitionTo(LIFECYCLE_PHASE.TRAFFIC_READY);

    const snapshot = lifecycle.getSnapshot();
    const history = lifecycle.getTransitionHistory();
    t.equal(snapshot.phase, LIFECYCLE_PHASE.TRAFFIC_READY,
      'should end in traffic-ready phase');
    t.equal(snapshot.phaseRank, 3,
      'snapshot should expose monotonic phase rank');
    t.equal(snapshot.transitionCount, 3,
      'snapshot should expose readiness transition count');
    t.equal(history.length, 3, 'should record each legal transition');
    t.equal(history[0].previousPhase, LIFECYCLE_PHASE.INIT,
      'history should include previous phase');
    t.equal(history[0].phase, LIFECYCLE_PHASE.CONTROL_READY,
      'history should include destination phase');
    t.same(history[0].reasons, [LIFECYCLE_REASON.BOOTSTRAP_PHASE_INCOMPLETE],
      'history should preserve transition reasons');
    t.ok(Number.isFinite(history[2].timestamp),
      'history should include transition timestamps');
  });

test('LifecycleController - rejects illegal phase transitions',
  async (t) => {
    const lifecycle = new LifecycleController();
    t.throws(
      () => lifecycle.transitionTo(LIFECYCLE_PHASE.JOIN_READY),
      /Invalid lifecycle phase transition/,
      'should reject INIT -> JOIN_READY',
    );
  });

test('LifecycleController - propagates hard dependency reasons and does not block on soft dependencies',
  async (t) => {
    const clock = createClock();
    const lifecycle = new LifecycleController({
      now: clock.now,
      readyStableWindowMs: 10,
    });

    lifecycle.setDependency('startup_complete', true, {
      reasonCode: LIFECYCLE_REASON.BOOTSTRAP_PHASE_INCOMPLETE,
      classification: LIFECYCLE_DEPENDENCY_CLASS.HARD,
    });
    lifecycle.setDependency('sql_engine_ready', false, {
      reasonCode: LIFECYCLE_REASON.SQL_ENGINE_UNAVAILABLE,
      classification: LIFECYCLE_DEPENDENCY_CLASS.HARD,
    });
    lifecycle.setDependency('logs_pipeline_healthy', false, {
      reasonCode: LIFECYCLE_REASON.OBSERVABILITY_BACKLOG,
      classification: LIFECYCLE_DEPENDENCY_CLASS.SOFT,
    });

    let snapshot = lifecycle.evaluate();
    t.equal(snapshot.phase, LIFECYCLE_PHASE.CONTROL_READY,
      'hard blocker should keep lifecycle in control-ready phase');
    t.equal(snapshot.ready, false, 'hard blocker should prevent readiness');
    t.ok(snapshot.reasons.includes(LIFECYCLE_REASON.SQL_ENGINE_UNAVAILABLE),
      'hard dependency reason should appear in readiness blockers');
    t.notOk(snapshot.reasons.includes(LIFECYCLE_REASON.OBSERVABILITY_BACKLOG),
      'soft dependency reason should not block readiness');
    t.ok(snapshot.degradedReasons.includes(LIFECYCLE_REASON.OBSERVABILITY_BACKLOG),
      'soft dependency reason should still be exposed as degraded context');

    lifecycle.setDependency('sql_engine_ready', true, {
      reasonCode: LIFECYCLE_REASON.SQL_ENGINE_UNAVAILABLE,
      classification: LIFECYCLE_DEPENDENCY_CLASS.HARD,
    });
    snapshot = lifecycle.evaluate();
    t.equal(snapshot.phase, LIFECYCLE_PHASE.JOIN_READY,
      'all hard dependencies ready enters join-ready stability phase');
    t.equal(snapshot.ready, false,
      'join-ready requires stable window before readiness promotion');

    clock.advance(10);
    snapshot = lifecycle.evaluate();
    t.equal(snapshot.phase, LIFECYCLE_PHASE.TRAFFIC_READY,
      'stable window completion promotes to traffic-ready');
    t.equal(snapshot.ready, true, 'stable lifecycle should become ready');
    t.ok(Number.isFinite(snapshot.stableSinceMs),
      'snapshot should expose stable-window origin timestamp');
    t.ok(snapshot.degradedReasons.includes(LIFECYCLE_REASON.OBSERVABILITY_BACKLOG),
      'soft blockers should remain visible post-promotion');
  });
