/**
 * Property Tests: Phase Lifecycle Event Emission
 *
 * **Property 8: Phase Lifecycle Event Emission**
 * *For any* phase execution, the phase SHALL emit 'phaseStarted' before execution,
 * and either 'phaseCompleted' or 'phaseFailed' after execution completes.
 *
 * **Validates: Requirements 4.6**
 *
 * Feature: code-clarity-maintainability, Property 8: Phase Lifecycle Event Emission
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import fc from 'fast-check';
import {PhaseBase, PHASE_EVENT} from '../../src/utils/phase-base.js';

/**
 * Arbitrary for generating valid phase names.
 * Phase names should be non-empty strings without newlines.
 */
const phaseNameArb = fc.string({minLength: 1, maxLength: 50})
  .filter((s) => !s.includes('\n') && s.trim().length > 0);

/**
 * Arbitrary for generating phase context objects.
 * Context can be any JSON-serializable object.
 */
const phaseContextArb = fc.oneof(
  fc.constant({}),
  fc.record({
    key: fc.string({minLength: 1, maxLength: 20}),
    value: fc.oneof(fc.string(), fc.integer(), fc.boolean()),
  }),
  fc.record({
    data: fc.string(),
    count: fc.integer({min: 0, max: 1000}),
  }),
);

/**
 * Arbitrary for generating phase results.
 * Results can be any JSON-serializable value.
 */
const phaseResultArb = fc.oneof(
  fc.constant(null),
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.record({
    success: fc.boolean(),
    data: fc.string(),
  }),
);

/**
 * Creates a concrete phase class that succeeds with a given result.
 * @param {*} result - The result to return from run().
 * @return {typeof PhaseBase} A concrete phase class.
 */
function createSuccessPhaseClass(result) {
  return class SuccessPhase extends PhaseBase {
    async run() {
      return result;
    }
  };
}

/**
 * Creates a concrete phase class that fails with a given error message.
 * @param {string} errorMessage - The error message to throw.
 * @return {typeof PhaseBase} A concrete phase class.
 */
function createFailingPhaseClass(errorMessage) {
  return class FailingPhase extends PhaseBase {
    async run() {
      throw new Error(errorMessage);
    }
  };
}

/**
 * Helper to execute a phase and collect events.
 * @param {PhaseBase} phase - The phase to execute.
 * @return {Promise<{events: Array, error: Error|null}>} Collected events and error.
 */
async function executeAndCollectEvents(phase) {
  const events = [];
  let error = null;

  phase.on(PHASE_EVENT.STARTED, (data) => events.push({type: 'started', data}));
  phase.on(PHASE_EVENT.COMPLETED, (data) => events.push({type: 'completed', data}));
  phase.on(PHASE_EVENT.FAILED, (data) => events.push({type: 'failed', data}));

  try {
    await phase.execute();
  } catch (e) {
    error = e;
  }

  return {events, error};
}

test('Property 8: Phase Lifecycle Event Emission', async (t) => {
  /**
   * Property: For any successful phase execution, phaseStarted SHALL be emitted
   * before phaseCompleted.
   * **Validates: Requirements 4.6**
   */
  t.test('phaseStarted is emitted before phaseCompleted on success', async (t) => {
    const testCases = fc.sample(
      fc.tuple(phaseNameArb, phaseContextArb, phaseResultArb),
      10,
    );

    for (const [phaseName, context, result] of testCases) {
      const PhaseClass = createSuccessPhaseClass(result);
      const phase = new PhaseClass(phaseName, context);
      const {events} = await executeAndCollectEvents(phase);

      // Invariant: started must come before completed
      const startedIndex = events.findIndex((e) => e.type === 'started');
      const completedIndex = events.findIndex((e) => e.type === 'completed');

      t.equal(startedIndex, 0, 'started event should be first');
      t.equal(completedIndex, 1, 'completed event should be second');
      t.equal(events.length, 2, 'exactly 2 events should be emitted');
    }
  });

  /**
   * Property: For any failing phase execution, phaseStarted SHALL be emitted
   * before phaseFailed.
   * **Validates: Requirements 4.6**
   */
  t.test('phaseStarted is emitted before phaseFailed on failure', async (t) => {
    const testCases = fc.sample(
      fc.tuple(
        phaseNameArb,
        phaseContextArb,
        fc.string({minLength: 1, maxLength: 100}).filter((s) => s.trim().length > 0),
      ),
      10,
    );

    for (const [phaseName, context, errorMessage] of testCases) {
      const PhaseClass = createFailingPhaseClass(errorMessage);
      const phase = new PhaseClass(phaseName, context);
      const {events} = await executeAndCollectEvents(phase);

      // Invariant: started must come before failed
      const startedIndex = events.findIndex((e) => e.type === 'started');
      const failedIndex = events.findIndex((e) => e.type === 'failed');

      t.equal(startedIndex, 0, 'started event should be first');
      t.equal(failedIndex, 1, 'failed event should be second');
      t.equal(events.length, 2, 'exactly 2 events should be emitted');
    }
  });

  /**
   * Property: For any phase execution, exactly 2 events SHALL be emitted
   * (started + completed OR started + failed).
   * **Validates: Requirements 4.6**
   */
  t.test('exactly 2 events are emitted for any execution', async (t) => {
    const testCases = fc.sample(
      fc.tuple(phaseNameArb, phaseContextArb, fc.boolean(), phaseResultArb),
      10,
    );

    for (const [phaseName, context, shouldSucceed, result] of testCases) {
      const PhaseClass = shouldSucceed ?
        createSuccessPhaseClass(result) :
        createFailingPhaseClass('test error');
      const phase = new PhaseClass(phaseName, context);
      const {events} = await executeAndCollectEvents(phase);

      // Invariant: exactly 2 events must be emitted
      t.equal(events.length, 2, 'exactly 2 events should be emitted');
      t.equal(events[0].type, 'started', 'first event should be started');
      t.ok(
        events[1].type === 'completed' || events[1].type === 'failed',
        'second event should be completed or failed',
      );
    }
  });

  /**
   * Property: For any successful phase execution, phaseCompleted event SHALL
   * contain the phase name and result.
   * **Validates: Requirements 4.6**
   */
  t.test('phaseCompleted event contains phase name and result', async (t) => {
    const testCases = fc.sample(
      fc.tuple(phaseNameArb, phaseContextArb, phaseResultArb),
      10,
    );

    for (const [phaseName, context, result] of testCases) {
      const PhaseClass = createSuccessPhaseClass(result);
      const phase = new PhaseClass(phaseName, context);
      const {events} = await executeAndCollectEvents(phase);

      const completedEvent = events.find((e) => e.type === 'completed');

      // Invariant: completed event must have phase name and result
      t.ok(completedEvent, 'completed event should exist');
      t.equal(completedEvent.data.phase, phaseName, 'phase name should match');
      t.same(completedEvent.data.result, result, 'result should match');
    }
  });

  /**
   * Property: For any failing phase execution, phaseFailed event SHALL
   * contain the phase name and error.
   * **Validates: Requirements 4.6**
   */
  t.test('phaseFailed event contains phase name and error', async (t) => {
    const testCases = fc.sample(
      fc.tuple(
        phaseNameArb,
        phaseContextArb,
        fc.string({minLength: 1, maxLength: 100}).filter((s) => s.trim().length > 0),
      ),
      10,
    );

    for (const [phaseName, context, errorMessage] of testCases) {
      const PhaseClass = createFailingPhaseClass(errorMessage);
      const phase = new PhaseClass(phaseName, context);
      const {events} = await executeAndCollectEvents(phase);

      const failedEvent = events.find((e) => e.type === 'failed');

      // Invariant: failed event must have phase name and error
      t.ok(failedEvent, 'failed event should exist');
      t.equal(failedEvent.data.phase, phaseName, 'phase name should match');
      t.ok(failedEvent.data.error instanceof Error, 'error should be an Error');
      t.equal(failedEvent.data.error.message, errorMessage, 'error message should match');
    }
  });

  /**
   * Property: For any phase execution, phaseStarted event SHALL contain
   * the phase name and context.
   * **Validates: Requirements 4.6**
   */
  t.test('phaseStarted event contains phase name and context', async (t) => {
    const testCases = fc.sample(
      fc.tuple(phaseNameArb, phaseContextArb, fc.boolean()),
      10,
    );

    for (const [phaseName, context, shouldSucceed] of testCases) {
      const PhaseClass = shouldSucceed ?
        createSuccessPhaseClass('result') :
        createFailingPhaseClass('error');
      const phase = new PhaseClass(phaseName, context);
      const {events} = await executeAndCollectEvents(phase);

      const startedEvent = events.find((e) => e.type === 'started');

      // Invariant: started event must have phase name and context
      t.ok(startedEvent, 'started event should exist');
      t.equal(startedEvent.data.phase, phaseName, 'phase name should match');
      t.same(startedEvent.data.context, context, 'context should match');
    }
  });

  /**
   * Property: For any phase execution, completed/failed events SHALL include
   * a non-negative duration.
   * **Validates: Requirements 4.6**
   */
  t.test('completion events include non-negative duration', async (t) => {
    const testCases = fc.sample(
      fc.tuple(phaseNameArb, phaseContextArb, fc.boolean()),
      10,
    );

    for (const [phaseName, context, shouldSucceed] of testCases) {
      const PhaseClass = shouldSucceed ?
        createSuccessPhaseClass('result') :
        createFailingPhaseClass('error');
      const phase = new PhaseClass(phaseName, context);
      const {events} = await executeAndCollectEvents(phase);

      const completionEvent = events.find(
        (e) => e.type === 'completed' || e.type === 'failed',
      );

      // Invariant: duration must be a non-negative number
      t.ok(completionEvent, 'completion event should exist');
      t.ok(
        typeof completionEvent.data.duration === 'number',
        'duration should be a number',
      );
      t.ok(completionEvent.data.duration >= 0, 'duration should be non-negative');
    }
  });
});
