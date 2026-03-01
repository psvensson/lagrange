import {test} from '../../src/test-helpers/tap.js';
import {
  CONVERGENCE_ARTIFACT_SCHEMA_VERSION,
  CONVERGENCE_EVENT_KIND,
  DeterministicConvergenceHarness,
} from './deterministic-convergence-harness.js';

test('DeterministicConvergenceHarness schedules heartbeat, CDC, and stale-read events deterministically',
  async (t) => {
    const harness = new DeterministicConvergenceHarness({
      startAtMs: 100,
    });
    const eventOrder = [];

    harness.schedule(
      CONVERGENCE_EVENT_KIND.HEARTBEAT,
      10,
      async ({nowMs}) => {
        eventOrder.push(`heartbeat@${nowMs}`);
      },
      {nodeId: 'node-a'},
    );
    harness.schedule(
      CONVERGENCE_EVENT_KIND.CDC,
      10,
      async ({nowMs}) => {
        eventOrder.push(`cdc@${nowMs}`);
      },
      {partitionId: 'p1'},
    );
    harness.schedule(
      CONVERGENCE_EVENT_KIND.STALE_READ,
      5,
      async ({nowMs}) => {
        eventOrder.push(`stale_read@${nowMs}`);
      },
      {tableName: 'services'},
    );

    const result = await harness.runUntilIdle();

    t.same(
      eventOrder,
      ['stale_read@105', 'heartbeat@110', 'cdc@110'],
      'events should execute in due-time order with FIFO tie-breaking',
    );
    t.equal(result.nowMs, 110);
    t.equal(result.executedEvents, 3);
  });

test('DeterministicConvergenceHarness evaluates registered invariants after each event',
  async (t) => {
    const harness = new DeterministicConvergenceHarness();
    let cdcApplied = false;

    harness.registerInvariant(
      'cdc.applied_before_completion',
      () => ({
        passed: cdcApplied,
        cdcApplied,
      }),
      {severity: 'critical'},
    );

    harness.schedule(
      CONVERGENCE_EVENT_KIND.CDC,
      1,
      async () => {
        cdcApplied = true;
      },
      {partitionId: 'p1'},
    );

    const result = await harness.runUntilIdle();

    t.equal(result.invariantResults.length, 1);
    t.equal(result.invariantResults[0].invariantId, 'cdc.applied_before_completion');
    t.equal(result.invariantResults[0].passed, true);
    t.same(result.invariantResults[0].details, {cdcApplied: true});
  });

test('DeterministicConvergenceHarness attaches machine-readable failure artifacts',
  async (t) => {
    const harness = new DeterministicConvergenceHarness();
    harness.registerInvariant(
      'heartbeat.queue_not_empty',
      ({eventLog}) => ({
        passed: eventLog.length === 0,
        executedEvents: eventLog.length,
      }),
    );
    harness.schedule(
      CONVERGENCE_EVENT_KIND.HEARTBEAT,
      0,
      async () => {
        throw new Error('synthetic heartbeat failure');
      },
      {nodeId: 'node-a'},
    );
    harness.schedule(
      CONVERGENCE_EVENT_KIND.CDC,
      5,
      async () => {},
      {partitionId: 'p1'},
    );

    try {
      await harness.runUntilIdle();
      t.fail('expected runUntilIdle to throw');
    } catch (error) {
      const artifact = error?.convergenceArtifact;
      t.equal(artifact?.schemaVersion, CONVERGENCE_ARTIFACT_SCHEMA_VERSION);
      t.equal(artifact?.failedEvent?.kind, CONVERGENCE_EVENT_KIND.HEARTBEAT);
      t.equal(artifact?.pendingEvents?.length, 1);
      t.equal(artifact?.pendingEvents?.[0]?.kind, CONVERGENCE_EVENT_KIND.CDC);
      t.equal(artifact?.error?.message, 'synthetic heartbeat failure');
      t.same(
        artifact?.invariantResults,
        [{
          invariantId: 'heartbeat.queue_not_empty',
          passed: true,
          metadata: {},
          details: {
            executedEvents: 0,
          },
        }],
      );
    }

    t.same(
      harness.getLastArtifact()?.failedEvent,
      {
        eventId: 'evt-1',
        kind: CONVERGENCE_EVENT_KIND.HEARTBEAT,
        dueAtMs: 0,
        metadata: {nodeId: 'node-a'},
      },
    );
  });
