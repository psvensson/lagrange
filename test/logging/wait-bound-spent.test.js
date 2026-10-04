/**
 * The spent-wait reporter: one ERROR per spent bound, one stable shape, and
 * the per-(wait, subject) flood rule. A later harness change fails scenarios
 * on `event: 'wait_bound_spent'`, so the shape asserted here is a contract.
 */

import {captureLogger} from '../test-helpers/wait-bound-spent-capture.js';
import {test} from '../../src/test-helpers/tap.js';
import {
  WAIT_BOUND_SPENT_EVENT,
  WAIT_BOUND_SPENT_FOLD_WINDOW_MS,
  WAIT_BOUND_SPENT_MAX_OBSERVED_CHARS,
  WAIT_BOUND_SPENT_OUTCOME,
  WAIT_BOUND_SPENT_SINK,
  WAIT_LAST_OBSERVED,
  WAIT_OBSERVATION_STATE,
  WaitBoundSpentReporter,
  readWaitClock,
} from '../../src/logging/wait-bound-spent.js';


test('one ERROR with the stable wait_bound_spent shape', (t) => {
  const capture = captureLogger();
  const reporter = new WaitBoundSpentReporter({now: () => 1500});
  const outcome = reporter.report(capture.logger, {
    wait: 'VOTER_READY_TIMEOUT_MS',
    awaited: 'voter promoted to ready',
    boundMs: 1000,
    startedAtMs: 400,
    lastObserved: {voters: 2, learners: 1},
    scope: {nodeId: 'n1', groupId: 'g1'},
  });
  t.equal(outcome, WAIT_BOUND_SPENT_OUTCOME.LOGGED);
  t.equal(capture.lines.length, 1);
  t.equal(capture.errors().length, 1);
  t.same(capture.errors()[0].context, {
    event: WAIT_BOUND_SPENT_EVENT,
    wait: 'VOTER_READY_TIMEOUT_MS',
    awaited: 'voter promoted to ready',
    boundMs: 1000,
    elapsedMs: 1100,
    lastObserved: {voters: 2, learners: 1},
    scope: {nodeId: 'n1', groupId: 'g1'},
    repeats: 0,
  });
  t.end();
});

test('an empty lastObserved is reported as the named nothing-observed state',
  (t) => {
    const capture = captureLogger();
    const reporter = new WaitBoundSpentReporter({now: () => 0});
    reporter.report(capture.logger, {
      wait: 'W', awaited: 'x', boundMs: 1, elapsedMs: 1, lastObserved: {},
    });
    t.same(capture.errors()[0].context.lastObserved,
      WAIT_LAST_OBSERVED.NOTHING);
    t.end();
  });

test('flood rule: once per (wait, subject) until the state changes, counted',
  (t) => {
    const capture = captureLogger();
    const reporter = new WaitBoundSpentReporter({now: () => 0});
    const spent = (state) => ({
      wait: 'W', awaited: 'x', boundMs: 1, elapsedMs: 1,
      subject: 'p1', lastObserved: {state},
    });
    t.equal(reporter.report(capture.logger, spent('a')),
      WAIT_BOUND_SPENT_OUTCOME.LOGGED);
    t.equal(reporter.report(capture.logger, spent('a')),
      WAIT_BOUND_SPENT_OUTCOME.FOLDED);
    t.equal(reporter.report(capture.logger, spent('a')),
      WAIT_BOUND_SPENT_OUTCOME.FOLDED);
    t.equal(capture.errors().length, 1, 'unchanged subject folds');
    reporter.report(capture.logger, spent('b'));
    t.equal(capture.errors().length, 2, 'a state change logs again');
    t.equal(capture.errors()[1].context.repeats, 2, 'folded count carried');
    reporter.report(capture.logger, {...spent('b'), subject: 'p2'});
    t.equal(capture.errors().length, 3, 'another subject is its own key');
    reporter.report(capture.logger, {...spent('b'), subject: undefined});
    reporter.report(capture.logger, {...spent('b'), subject: undefined});
    t.equal(capture.errors().length, 5, 'no subject: every occurrence logs');
    t.end();
  });

test('subject memory is bounded', (t) => {
  const capture = captureLogger();
  const reporter = new WaitBoundSpentReporter({now: () => 0, maxSubjects: 2});
  const spent = (subject) => ({
    wait: 'W', awaited: 'x', boundMs: 1, elapsedMs: 1,
    subject, lastObserved: {state: 's'},
  });
  reporter.report(capture.logger, spent('a'));
  reporter.report(capture.logger, spent('b'));
  reporter.report(capture.logger, spent('c'));
  reporter.report(capture.logger, spent('a'));
  t.equal(capture.errors().length, 4, 'evicted subject logs again');
  t.end();
});

test('the reporter never throws', (t) => {
  const reporter = new WaitBoundSpentReporter({now: () => 0});
  const throwing = {error: () => {
    throw new Error('sink down');
  }};
  t.equal(reporter.report(throwing, {
    wait: 'W', awaited: 'x', boundMs: 1, elapsedMs: 1,
  }), WAIT_BOUND_SPENT_OUTCOME.REPORTER_FAILED);
  t.equal(reporter.reporterFailures, 1);
  t.end();
});

test('lastObserved and scope may be observers evaluated inside the reporter',
  (t) => {
    const capture = captureLogger();
    const reporter = new WaitBoundSpentReporter({now: () => 0});
    t.equal(reporter.report(capture.logger, {
      wait: 'W', awaited: 'x', boundMs: 1, elapsedMs: 1,
      lastObserved: () => ({leader: false}),
      scope: () => ({nodeId: 'n1'}),
    }), WAIT_BOUND_SPENT_OUTCOME.LOGGED);
    t.same(capture.spent()[0].context.lastObserved, {leader: false});
    t.same(capture.spent()[0].context.scope, {nodeId: 'n1'});
    t.end();
  });

test('a throwing observer is reported as observation_failed, never thrown',
  (t) => {
    const capture = captureLogger();
    const reporter = new WaitBoundSpentReporter({now: () => 0});
    const outcome = reporter.report(capture.logger, {
      wait: 'W', awaited: 'x', boundMs: 1, elapsedMs: 1,
      lastObserved: () => {
        throw new Error('observer down');
      },
      scope: () => {
        throw new Error('scope down');
      },
    });
    t.equal(outcome, WAIT_BOUND_SPENT_OUTCOME.LOGGED);
    t.equal(capture.spent().length, 1, 'the ERROR is still emitted');
    t.same(capture.spent()[0].context.lastObserved,
      {state: WAIT_OBSERVATION_STATE.FAILED, error: 'observer down'});
    t.same(capture.spent()[0].context.scope,
      {state: WAIT_OBSERVATION_STATE.FAILED, error: 'scope down'});
    t.equal(reporter.reporterFailures, 0);
    t.end();
  });

test('flood rule folds within a named window and re-emits after it',
  (t) => {
    let nowMs = 0;
    const capture = captureLogger();
    const reporter = new WaitBoundSpentReporter({now: () => nowMs});
    const spent = {
      wait: 'MAX_RECONNECTS', awaited: 'x', boundMs: 1, elapsedMs: 1,
      subject: 'n2', lastObserved: {state: 'gone'},
    };
    reporter.report(capture.logger, spent);
    nowMs = WAIT_BOUND_SPENT_FOLD_WINDOW_MS - 1;
    t.equal(reporter.report(capture.logger, spent),
      WAIT_BOUND_SPENT_OUTCOME.FOLDED, 'within the window: folded');
    t.equal(capture.spent().length, 1);
    nowMs = WAIT_BOUND_SPENT_FOLD_WINDOW_MS + 1;
    t.equal(reporter.report(capture.logger, spent),
      WAIT_BOUND_SPENT_OUTCOME.LOGGED, 'a later incident is visible again');
    t.equal(capture.spent().length, 2);
    t.equal(capture.spent()[1].context.repeats, 1, 'folded count carried');
    nowMs += WAIT_BOUND_SPENT_FOLD_WINDOW_MS - 1;
    t.equal(reporter.report(capture.logger, spent),
      WAIT_BOUND_SPENT_OUTCOME.FOLDED, 'the window restarts at each line');
    t.end();
  });

test('an unserializable lastObserved still emits the line', (t) => {
  const capture = captureLogger();
  const reporter = new WaitBoundSpentReporter({now: () => 0});
  const circular = {a: 1};
  circular.self = circular;
  reporter.report(capture.logger, {
    wait: 'W', awaited: 'x', boundMs: 1, elapsedMs: 1,
    subject: 's', lastObserved: circular,
  });
  reporter.report(capture.logger, {
    wait: 'W2', awaited: 'x', boundMs: 1, elapsedMs: 1,
    lastObserved: {big: 1n}, scope: {count: 2n},
  });
  t.equal(capture.spent().length, 2, 'never dropped');
  t.same(capture.spent()[0].context.lastObserved,
    {state: WAIT_OBSERVATION_STATE.UNSERIALIZABLE, keys: ['a', 'self']});
  t.same(capture.spent()[1].context.lastObserved,
    {state: WAIT_OBSERVATION_STATE.UNSERIALIZABLE, keys: ['big']});
  t.same(capture.spent()[1].context.scope,
    {state: WAIT_OBSERVATION_STATE.UNSERIALIZABLE, keys: ['count']});
  t.doesNotThrow(() => JSON.stringify(capture.spent()[0].context));
  t.equal(reporter.reporterFailures, 0);
  t.end();
});

test('the serialized observation is capped with a truncation marker', (t) => {
  const capture = captureLogger();
  const reporter = new WaitBoundSpentReporter({now: () => 0});
  reporter.report(capture.logger, {
    wait: 'W', awaited: 'x', boundMs: 1, elapsedMs: 1,
    lastObserved: {rows: 'r'.repeat(WAIT_BOUND_SPENT_MAX_OBSERVED_CHARS * 4)},
  });
  const observed = capture.spent()[0].context.lastObserved;
  t.equal(observed.state, WAIT_OBSERVATION_STATE.TRUNCATED);
  t.ok(observed.serializedChars > WAIT_BOUND_SPENT_MAX_OBSERVED_CHARS);
  t.ok(JSON.stringify(observed).length <=
    WAIT_BOUND_SPENT_MAX_OBSERVED_CHARS + 128, 'bounded line size');
  t.end();
});

test('a console-only sink never reaches the site logger error sink', (t) => {
  const capture = captureLogger();
  const reporter = new WaitBoundSpentReporter({now: () => 0});
  t.equal(reporter.report(capture.logger, {
    wait: 'W', awaited: 'x', boundMs: 1, elapsedMs: 1,
    sink: WAIT_BOUND_SPENT_SINK.CONSOLE_ONLY,
  }), WAIT_BOUND_SPENT_OUTCOME.LOGGED);
  t.equal(capture.errors().length, 0, 'not through the persisting sink');
  t.equal(capture.consoleOnly().length, 1, 'console-only ERROR emitted');
  t.equal(capture.consoleOnly()[0].level, 'error');
  t.equal(capture.consoleOnly()[0].context.event, WAIT_BOUND_SPENT_EVENT);
  t.end();
});

test('a wait clock read never requires an owner clock', (t) => {
  t.equal(readWaitClock({now: () => 42}), 42, 'the injected clock wins');
  const before = Date.now();
  const read = readWaitClock({});
  t.ok(read >= before && read <= Date.now(), 'no owner clock: wall clock');
  t.ok(Number.isFinite(readWaitClock(null)), 'no owner at all');
  t.end();
});
