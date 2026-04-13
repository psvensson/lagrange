/**
 * Unit tests for PhaseBase class.
 *
 * Tests the base class for phase-based operations including:
 * - Event emission on phase transitions
 * - Timing tracking
 * - Abstract run() method enforcement
 *
 * Requirements: 4.4, 4.6
 */
// @ts-nocheck


import {test} from 'tap';
import {PhaseBase, PHASE_EVENT, PHASE_ERROR} from '../../src/utils/phase-base.js';

test('PHASE_EVENT constants', async (t) => {
  t.equal(PHASE_EVENT.STARTED, 'phaseStarted', 'STARTED should be phaseStarted');
  t.equal(PHASE_EVENT.COMPLETED, 'phaseCompleted', 'COMPLETED should be phaseCompleted');
  t.equal(PHASE_EVENT.FAILED, 'phaseFailed', 'FAILED should be phaseFailed');
});

test('PHASE_ERROR constants', async (t) => {
  t.equal(
    PHASE_ERROR.RUN_NOT_IMPLEMENTED,
    'Subclasses must implement run()',
    'RUN_NOT_IMPLEMENTED should have correct message',
  );
});

test('PhaseBase constructor', async (t) => {
  const context = {key: 'value'};
  const phase = new PhaseBase('test-phase', context);

  t.equal(phase.name, 'test-phase', 'should set name');
  t.same(phase.context, context, 'should set context');
  t.equal(phase.startTime, null, 'startTime should be null initially');
  t.equal(phase.endTime, null, 'endTime should be null initially');
});

test('PhaseBase.run() throws when not overridden', async (t) => {
  const phase = new PhaseBase('test-phase', {});

  await t.rejects(
    phase.run(),
    {message: PHASE_ERROR.RUN_NOT_IMPLEMENTED},
    'should throw with correct message',
  );
});

test('PhaseBase.execute() with successful run', async (t) => {
  const context = {data: 'test'};
  const expectedResult = {success: true};

  // Create a concrete subclass
  class SuccessPhase extends PhaseBase {
    async run() {
      return expectedResult;
    }
  }

  const phase = new SuccessPhase('success-phase', context);
  const events = [];

  phase.on(PHASE_EVENT.STARTED, (data) => events.push({type: 'started', data}));
  phase.on(PHASE_EVENT.COMPLETED, (data) => events.push({type: 'completed', data}));
  phase.on(PHASE_EVENT.FAILED, (data) => events.push({type: 'failed', data}));

  const result = await phase.execute();

  t.same(result, expectedResult, 'should return result from run()');
  t.ok(phase.startTime !== null, 'should set startTime');
  t.ok(phase.endTime !== null, 'should set endTime');
  t.ok(phase.endTime >= phase.startTime, 'endTime should be >= startTime');

  t.equal(events.length, 2, 'should emit 2 events');
  t.equal(events[0].type, 'started', 'first event should be started');
  t.equal(events[0].data.phase, 'success-phase', 'started event should have phase name');
  t.same(events[0].data.context, context, 'started event should have context');

  t.equal(events[1].type, 'completed', 'second event should be completed');
  t.equal(events[1].data.phase, 'success-phase', 'completed event should have phase name');
  t.ok(events[1].data.duration >= 0, 'completed event should have duration');
  t.same(events[1].data.result, expectedResult, 'completed event should have result');
});

test('PhaseBase.execute() with failing run', async (t) => {
  const context = {data: 'test'};
  const expectedError = new Error('Phase failed');

  // Create a concrete subclass that fails
  class FailingPhase extends PhaseBase {
    async run() {
      throw expectedError;
    }
  }

  const phase = new FailingPhase('failing-phase', context);
  const events = [];

  phase.on(PHASE_EVENT.STARTED, (data) => events.push({type: 'started', data}));
  phase.on(PHASE_EVENT.COMPLETED, (data) => events.push({type: 'completed', data}));
  phase.on(PHASE_EVENT.FAILED, (data) => events.push({type: 'failed', data}));

  await t.rejects(
    phase.execute(),
    {message: 'Phase failed'},
    'should rethrow the error',
  );

  t.ok(phase.startTime !== null, 'should set startTime');
  t.ok(phase.endTime !== null, 'should set endTime');

  t.equal(events.length, 2, 'should emit 2 events');
  t.equal(events[0].type, 'started', 'first event should be started');
  t.equal(events[1].type, 'failed', 'second event should be failed');
  t.equal(events[1].data.phase, 'failing-phase', 'failed event should have phase name');
  t.ok(events[1].data.duration >= 0, 'failed event should have duration');
  t.equal(events[1].data.error, expectedError, 'failed event should have error');
});

test('PhaseBase.getDuration()', async (t) => {
  await t.test('returns null before execution', async (t) => {
    const phase = new PhaseBase('test-phase', {});
    t.equal(phase.getDuration(), null, 'should return null');
  });

  await t.test('returns duration after successful execution', async (t) => {
    class QuickPhase extends PhaseBase {
      async run() {
        return 'done';
      }
    }

    const phase = new QuickPhase('quick-phase', {});
    await phase.execute();

    const duration = phase.getDuration();
    t.ok(duration !== null, 'should not be null');
    t.ok(duration >= 0, 'should be non-negative');
  });

  await t.test('returns duration after failed execution', async (t) => {
    class FailPhase extends PhaseBase {
      async run() {
        throw new Error('fail');
      }
    }

    const phase = new FailPhase('fail-phase', {});

    try {
      await phase.execute();
    } catch (_error) {
      // Expected
    }

    const duration = phase.getDuration();
    t.ok(duration !== null, 'should not be null');
    t.ok(duration >= 0, 'should be non-negative');
  });
});

test('PhaseBase is an EventEmitter', async (t) => {
  const phase = new PhaseBase('test-phase', {});

  t.ok(typeof phase.on === 'function', 'should have on method');
  t.ok(typeof phase.emit === 'function', 'should have emit method');
  t.ok(typeof phase.removeListener === 'function', 'should have removeListener method');
});
