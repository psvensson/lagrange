import {test} from '../../src/test-helpers/tap.js';
import {
  parseTraceLines,
  tallyEngagement,
  summarizeRuns,
} from '../../scripts/analyze-fix-engagement.js';

const SIGNAL = 'ownerAckCompletionPendingCount';

function traceLine(fields) {
  return JSON.stringify({msg: 'convergence decision trace', ...fields});
}

test('parseTraceLines keeps only decision-trace JSON lines', (t) => {
  const lines = [
    traceLine({decision: 'drive', ownerAckCompletionPendingCount: 2}),
    '{"msg":"something else"}',
    'not json at all',
    traceLine({decision: 'skip', ownerAckCompletionPendingCount: 0}),
  ];
  const traces = parseTraceLines(lines);
  t.equal(traces.length, 2);
  t.end();
});

test('tallyEngagement counts drives, signal>0, and committed-after', (t) => {
  const traces = [
    {decision: 'drive', ownerAckCompletionPendingCount: 2, outcome: 'reconcile-committed'},
    {decision: 'drive', ownerAckCompletionPendingCount: 1, outcome: 'reconcile-timed-out'},
    {decision: 'drive', ownerAckCompletionPendingCount: 0, outcome: 'reconcile-committed'},
    {decision: 'skip', ownerAckCompletionPendingCount: 5},
  ];
  const tally = tallyEngagement(traces, SIGNAL);
  t.equal(tally.driveTraces, 3);
  t.equal(tally.signalEngaged, 2, 'two drives carried the signal non-zero');
  t.equal(tally.committedAfterEngage, 1, 'one of those committed');
  t.end();
});

test('summarizeRuns flags INERT when traces present but signal never fired', (t) => {
  const runs = [
    {label: 'run1', traceLines: 10, driveTraces: 4, signalEngaged: 0, committedAfterEngage: 0},
    {label: 'run2', traceLines: 12, driveTraces: 6, signalEngaged: 0, committedAfterEngage: 0},
  ];
  const summary = summarizeRuns(runs, SIGNAL);
  t.equal(summary.tracesPresent, true);
  t.equal(summary.inert, true);
  t.equal(summary.totalSignalEngaged, 0);
  t.end();
});

test('summarizeRuns does NOT call no-traces inert (unmeasurable, wrong run mode)', (t) => {
  const runs = [
    {label: 'run1', traceLines: 0, driveTraces: 0, signalEngaged: 0, committedAfterEngage: 0},
  ];
  const summary = summarizeRuns(runs, SIGNAL);
  t.equal(summary.tracesPresent, false);
  t.equal(summary.inert, false, 'no traces is unmeasurable, not a false INERT verdict');
  t.end();
});

test('a configurable signal field works (missingPublishedCount)', (t) => {
  const traces = [
    {decision: 'drive', missingPublishedCount: 1, outcome: 'reconcile-committed'},
    {decision: 'drive', missingPublishedCount: 0, outcome: 'reconcile-committed'},
  ];
  const tally = tallyEngagement(traces, 'missingPublishedCount');
  t.equal(tally.signalEngaged, 1);
  t.end();
});
