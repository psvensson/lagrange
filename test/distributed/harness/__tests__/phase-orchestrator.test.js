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
