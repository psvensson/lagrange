import {test} from '../../src/test-helpers/tap.js';
import {
  summarizeRecurrence,
  extractPublicationConvergence,
} from '../../scripts/analyze-precondition-recurrence.js';

function report(pc, passed = false) {
  return {scenarios: [{passed, publicationConvergence: pc}]};
}

test('extractPublicationConvergence reads scenarios[0]', (t) => {
  t.equal(extractPublicationConvergence(report({publicationStatus: 'OPEN'})).publicationStatus, 'OPEN');
  t.equal(extractPublicationConvergence({}), null);
  t.end();
});

test('open_ack_stuck recurs only on OPEN + pendingAckCount>=1', (t) => {
  const runs = [
    {label: 'run1', report: report({publicationStatus: 'OPEN', pendingAckCount: 1})},
    {label: 'run2', report: report({publicationStatus: 'OPEN', pendingAckCount: 0})},
    {label: 'run3', report: report({publicationStatus: 'PUBLISHED', pendingAckCount: 2})},
  ];
  const summary = summarizeRecurrence(runs);
  const p = summary.preconditions.find((x) => x.key === 'open_ack_stuck');
  t.equal(p.runsObserved, 1);
  t.same(p.runs, ['run1']);
  t.equal(p.recurrenceRate, 1 / 3);
  t.end();
});

test('published_member_missing and consumer_lag detected (variant C family)', (t) => {
  const runs = [
    {
      label: 'run1',
      report: report({
        publicationStatus: 'PUBLISHED',
        missingPublishedCount: 1,
        publicationOwnerStream: {revision: {state: 'consumer_lag'}},
      }),
    },
  ];
  const summary = summarizeRecurrence(runs);
  const pub = summary.preconditions.find((x) => x.key === 'published_member_missing');
  const lag = summary.preconditions.find((x) => x.key === 'consumer_lag');
  t.equal(pub.runsObserved, 1);
  t.equal(lag.runsObserved, 1);
  t.end();
});

test('a run with no publicationConvergence matches nothing and is recorded', (t) => {
  const summary = summarizeRecurrence([{label: 'run1', report: {scenarios: [{}]}}]);
  t.equal(summary.totalRuns, 1);
  t.equal(summary.runsDetail[0].hasPublicationConvergence, false);
  for (const p of summary.preconditions) {
    t.equal(p.runsObserved, 0);
  }
  t.end();
});
