import assert from 'node:assert/strict';
import {test} from '../../../../src/test-helpers/tap.js';
import {PhaseOrchestrator} from '../phase-orchestrator.js';

const PHASE_SEQUENCE = Object.freeze([
  'preflight',
  'converge',
  'pre_load_gate',
  'load',
  'post_load_drain',
  'verify',
  'teardown',
]);

function createSuccessfulHandlers(callOrder) {
  return {
    preflight: async () => {
      callOrder.push('preflight');
      return {
        artifacts: {
          started: true,
        },
      };
    },
    converge: async () => {
      callOrder.push('converge');
      return {status: 'ok'};
    },
    pre_load_gate: async () => {
      callOrder.push('pre_load_gate');
      return {status: 'ok'};
    },
    load: async () => {
      callOrder.push('load');
      return {status: 'ok'};
    },
    post_load_drain: async () => {
      callOrder.push('post_load_drain');
      return {status: 'ok'};
    },
    verify: async () => {
      callOrder.push('verify');
      return {status: 'ok'};
    },
    teardown: async () => {
      callOrder.push('teardown');
      return {status: 'ok'};
    },
  };
}

test('PhaseOrchestrator accepts canonical phase transitions and returns phase results',
  async () => {
    const callOrder = [];
    const orchestrator = new PhaseOrchestrator();

    const result = await orchestrator.run(
      createSuccessfulHandlers(callOrder),
      {
        benchmarkId: 'run-1',
      },
    );

    assert.deepEqual(callOrder, PHASE_SEQUENCE);
    assert.equal(result.status, 'ok');
    assert.equal(result.phases.length, PHASE_SEQUENCE.length);
    assert.equal(result.phases[0].phase, 'preflight');
    assert.equal(result.phases[0].status, 'ok');
    assert.ok(
      Number.isInteger(result.phases[0].durationMs) &&
      result.phases[0].durationMs >= 0,
      'phase result should include durationMs',
    );
  });

test('PhaseOrchestrator rejects illegal phase transitions', async () => {
  const orchestrator = new PhaseOrchestrator({
    phaseSequence: [
      'preflight',
      'load',
    ],
  });

  await assert.rejects(
    orchestrator.run({
      preflight: async () => ({status: 'ok'}),
      load: async () => ({status: 'ok'}),
    }),
    /Illegal phase transition/,
  );
});

test('PhaseOrchestrator emits phase start and end events with timestamps', async () => {
  const events = [];
  const orchestrator = new PhaseOrchestrator({
    onEvent: (event) => {
      events.push(event);
    },
  });

  await orchestrator.run(createSuccessfulHandlers([]));

  const phaseStartEvents = events.filter((event) => event.type === 'phase.start');
  const phaseEndEvents = events.filter((event) => event.type === 'phase.end');

  assert.equal(phaseStartEvents.length, PHASE_SEQUENCE.length);
  assert.equal(phaseEndEvents.length, PHASE_SEQUENCE.length);
  assert.ok(
    phaseStartEvents.every((event) => Number.isFinite(event.timestampMs)),
    'start events should include timestampMs',
  );
  assert.ok(
    phaseEndEvents.every((event) => Number.isFinite(event.timestampMs)),
    'end events should include timestampMs',
  );
});

test('PhaseOrchestrator emits phase progress events and records phase progress artifacts',
  async () => {
    const events = [];
    const orchestrator = new PhaseOrchestrator({
      onEvent: (event) => {
        events.push(event);
      },
    });

    const result = await orchestrator.run({
      preflight: async (phaseContext) => {
        phaseContext.emitPhaseProgress({
          message: 'seed node reachable',
          details: {nodeId: 'seed-1'},
        });
        phaseContext.emitPhaseLastMeaningfulChange({
          message: 'benchmark table created',
          details: {tableName: 'benchmark_events'},
        });
        return {status: 'ok'};
      },
      teardown: async () => ({status: 'ok'}),
    });

    const progressEvents = events.filter((event) => event.type === 'phase.progress');
    const meaningfulEvents = events.filter((event) =>
      event.type === 'phase.last_meaningful_change',
    );
    assert.equal(progressEvents.length, 1);
    assert.equal(meaningfulEvents.length, 1);
    assert.equal(progressEvents[0].message, 'seed node reachable');
    assert.deepEqual(progressEvents[0].details, {nodeId: 'seed-1'});
    assert.equal(meaningfulEvents[0].message, 'benchmark table created');

    const preflightResult = result.phases.find((phase) => phase.phase === 'preflight');
    assert.ok(preflightResult, 'preflight result should exist');
    assert.equal(preflightResult.artifacts.phaseProgress.heartbeatCount, 1);
    assert.equal(
      preflightResult.artifacts.phaseProgress.lastMeaningfulChange.message,
      'benchmark table created',
    );
    assert.equal(
      preflightResult.artifacts.phaseProgress.lastProgressEvent.message,
      'benchmark table created',
    );
  });

test('PhaseOrchestrator records no-progress warnings and failures in phase artifacts',
  async () => {
    const orchestrator = new PhaseOrchestrator();

    const result = await orchestrator.run({
      preflight: async (phaseContext) => {
        phaseContext.emitPhaseNoProgressWarning({
          message: 'quiescence heartbeat stalled',
          details: {stalledMs: 15},
        });
        phaseContext.emitPhaseFailedNoProgress({
          message: 'quiescence aborted for no progress',
          details: {stalledMs: 20, budgetMs: 20},
        });
        return {
          status: 'fail',
          errors: ['stalled_no_progress:20'],
        };
      },
      teardown: async () => ({status: 'ok'}),
    });

    const preflightResult = result.phases.find((phase) => phase.phase === 'preflight');
    assert.ok(preflightResult, 'preflight result should exist');
    assert.equal(preflightResult.status, 'fail');
    assert.equal(preflightResult.artifacts.phaseProgress.noProgressWarningCount, 1);
    assert.equal(
      preflightResult.artifacts.phaseProgress.noProgressWarnings[0].message,
      'quiescence heartbeat stalled',
    );
    assert.equal(
      preflightResult.artifacts.phaseProgress.failedNoProgress.details.budgetMs,
      20,
    );
  });

test('PhaseOrchestrator runs teardown after failure and skips remaining phases',
  async () => {
    const callOrder = [];
    const orchestrator = new PhaseOrchestrator();

    const result = await orchestrator.run({
      preflight: async () => {
        callOrder.push('preflight');
        return {status: 'ok'};
      },
      converge: async () => {
        callOrder.push('converge');
        return {
          status: 'fail',
          errors: ['convergence failed'],
        };
      },
      teardown: async () => {
        callOrder.push('teardown');
        return {
          status: 'ok',
          artifacts: {
            cleaned: true,
          },
        };
      },
    });

    assert.deepEqual(callOrder, [
      'preflight',
      'converge',
      'teardown',
    ]);
    assert.equal(result.status, 'fail');
    assert.equal(result.phases[2].phase, 'pre_load_gate');
    assert.equal(result.phases[2].status, 'skipped');
    assert.equal(result.phases[6].phase, 'teardown');
    assert.equal(result.phases[6].status, 'ok');
  });
