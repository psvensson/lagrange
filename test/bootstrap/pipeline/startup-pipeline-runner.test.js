/**
 * Unit tests for StartupPipelineRunner.
 */

import {test} from '../../../src/test-helpers/tap.js';
import {
  STARTUP_PIPELINE_EVENT,
  StartupPipelineRunner,
} from '../../../src/bootstrap/pipeline/startup-pipeline-runner.js';

test('StartupPipelineRunner - runs phases in order', async (t) => {
  const observed = [];
  const sink = {
    emit(eventName, payload) {
      if (eventName === `pipeline:${STARTUP_PIPELINE_EVENT.PHASE_START}`) {
        observed.push(`start:${payload.phase}`);
      }
      if (eventName === `pipeline:${STARTUP_PIPELINE_EVENT.PHASE_COMPLETE}`) {
        observed.push(`complete:${payload.phase}`);
      }
    },
  };

  const runner = new StartupPipelineRunner({eventSink: sink});
  const result = await runner.run({
    phases: [
      {
        name: 'phase-1',
        run: async () => {},
      },
      {
        name: 'phase-2',
        run: async () => {},
      },
    ],
  });

  t.same(result.completedPhases, ['phase-1', 'phase-2']);
  t.same(observed, [
    'start:phase-1',
    'complete:phase-1',
    'start:phase-2',
    'complete:phase-2',
  ]);
  t.end();
});

test('StartupPipelineRunner - phase failure triggers reverse cleanup ordering',
  async (t) => {
    const cleanupOrder = [];
    const runner = new StartupPipelineRunner();

    try {
      await runner.run({
        phases: [
          {name: 'infrastructure', run: async () => {}},
          {name: 'message-groups', run: async () => {}},
          {
            name: 'partitions',
            run: async () => {
              throw new Error('partitions failed');
            },
          },
          {name: 'registration', run: async () => {}},
        ],
        cleanup: [
          {
            name: 'cleanup-registration',
            phaseName: 'registration',
            run: async () => cleanupOrder.push('registration'),
          },
          {
            name: 'cleanup-partitions',
            phaseName: 'partitions',
            run: async () => cleanupOrder.push('partitions'),
          },
          {
            name: 'cleanup-message-groups',
            phaseName: 'message-groups',
            run: async () => cleanupOrder.push('message-groups'),
          },
          {
            name: 'cleanup-infrastructure',
            phaseName: 'infrastructure',
            run: async () => cleanupOrder.push('infrastructure'),
          },
        ],
      });
      t.fail('expected phase failure');
    } catch (error) {
      t.equal(error.message, 'partitions failed');
    }

    t.same(cleanupOrder, [
      'partitions',
      'message-groups',
      'infrastructure',
    ]);
    t.end();
  });
