/**
 * Unit tests for StartupPipelineRunner.
 */

import {test} from '../../../src/test-helpers/tap.js';
import {
  JOIN_CHECKPOINT,
  JoinSessionStore,
} from '../../../src/bootstrap/join-session-store.js';
import {
  STARTUP_PIPELINE_EVENT,
  StartupPipelineRunner,
} from '../../../src/bootstrap/pipeline/startup-pipeline-runner.js';
import {
  STARTUP_WORKFLOW_STATUS,
} from '../../../src/bootstrap/startup-workflow-store.js';

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

test('StartupPipelineRunner - phase failure propagates error ' +
  'without pipeline-owned cleanup (D3.2: handler-owned cleanup)',
async (t) => {
  /**
   * Cleanup is NOT managed by the pipeline runner. Phase failures
   * propagate to the caller which owns cleanup orchestration
   * through the canonical handler (SeedCleanupHandler /
   * JoinCleanupHandler). This test proves the pipeline does not
   * have runCleanup or shouldRunCleanupStep methods.
   *
   * Validates: Requirements 2.2, 2.5
   */
  const runner = new StartupPipelineRunner();

  // Pipeline runner must not expose cleanup methods (D3.2)
  t.equal(typeof runner.runCleanup, 'undefined',
    'pipeline runner does not have runCleanup method');
  t.equal(typeof runner.shouldRunCleanupStep, 'undefined',
    'pipeline runner does not have shouldRunCleanupStep method');

  // Cleanup event constants must not exist
  t.notOk(STARTUP_PIPELINE_EVENT.CLEANUP_START,
    'no CLEANUP_START event constant');
  t.notOk(STARTUP_PIPELINE_EVENT.CLEANUP_COMPLETE,
    'no CLEANUP_COMPLETE event constant');
  t.notOk(STARTUP_PIPELINE_EVENT.CLEANUP_FAILED,
    'no CLEANUP_FAILED event constant');

  // Phase failure propagates directly to caller
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
    });
    t.fail('expected phase failure');
  } catch (error) {
    t.equal(error.message, 'partitions failed',
      'phase error propagates to caller for handler-owned cleanup');
  }

  t.end();
});

test(
  'StartupPipelineRunner - runWorkflow records retryable failure and resumes ' +
    'from persisted checkpoint',
  async (t) => {
    const store = new JoinSessionStore({
      storage: new Map(),
      now: () => Date.now(),
    });
    const runner = new StartupPipelineRunner();
    const executedSteps = [];
    let failInfrastructure = true;

    const steps = [
      {
        checkpoint: JOIN_CHECKPOINT.SEED_CONTACTED,
        phase: 'seed',
        run: async () => {
          executedSteps.push('seed');
        },
      },
      {
        checkpoint: JOIN_CHECKPOINT.JOIN_INFRASTRUCTURE_READY,
        phase: 'infrastructure',
        run: async () => {
          executedSteps.push('infrastructure');
          if (failInfrastructure) {
            const error = new Error('infrastructure_retry');
            error.code = 'INFRASTRUCTURE_RETRY';
            error.retryable = true;
            throw error;
          }
        },
      },
      {
        checkpoint: JOIN_CHECKPOINT.MEMBERSHIP_WRITTEN,
        phase: 'membership',
        run: async () => {
          executedSteps.push('membership');
        },
      },
    ];

    await t.rejects(
      runner.runWorkflow({
        nodeId: 'join-node-a',
        sessionId: 'session-a',
        sessionStore: store,
        steps,
      }),
      /infrastructure_retry/,
      'workflow should surface the retryable step failure',
    );

    const failedSession = await store.loadSession({
      nodeId: 'join-node-a',
      sessionId: 'session-a',
    });
    t.equal(
      failedSession?.checkpoint,
      JOIN_CHECKPOINT.SEED_CONTACTED,
      'failure should preserve the highest completed checkpoint',
    );
    t.equal(
      failedSession?.status,
      STARTUP_WORKFLOW_STATUS.FAILED_RETRYABLE,
      'retryable failures should persist the retryable workflow status',
    );

    failInfrastructure = false;
    const resumed = await runner.runWorkflow({
      nodeId: 'join-node-a',
      allowResumeLatest: true,
      sessionStore: store,
      steps,
    });

    t.equal(
      resumed.sessionId,
      'session-a',
      'workflow kernel should resume the persisted session identity',
    );
    t.same(
      executedSteps,
      ['seed', 'infrastructure', 'infrastructure', 'membership'],
      'resume should skip the completed checkpoint and rerun the failed step',
    );
    t.equal(
      resumed.session?.checkpoint,
      JOIN_CHECKPOINT.MEMBERSHIP_WRITTEN,
      'resume should continue the durable workflow to the next completed step',
    );
  },
);
