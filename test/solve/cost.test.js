import tap from 'tap';

import {tallyCostEntries, renderCostReport} from '../../scripts/solve/cost.js';

function entry(questId, event) {
  return {questId, event};
}

tap.test('cost rollup', async (t) => {
  t.test('tallies attempts, rejections, violations, and telemetry coverage',
    (t) => {
      const byQuest = tallyCostEntries([
        entry('q-a', {type: 'attempt', ts: '2026-07-26T10:00:00.000Z',
          telemetry: {agentDurationMs: 60000}}),
        entry('q-a', {type: 'attempt', ts: '2026-07-26T10:30:00.000Z',
          telemetry: null}),
        entry('q-a', {type: 'finding', kind: 'verifier-rejection',
          ts: '2026-07-26T10:20:00.000Z'}),
        entry('q-a', {type: 'violation', ts: '2026-07-26T10:31:00.000Z'}),
        entry('q-b', {type: 'attempt', ts: '2026-07-26T11:00:00.000Z'}),
      ]);
      const a = byQuest.get('q-a');
      t.equal(a.attempts, 2);
      t.equal(a.rejections, 1);
      t.equal(a.violations, 1);
      t.equal(a.measuredAttempts, 1, 'null telemetry is unmeasured, not zero');
      t.equal(a.durationMs, 60000);
      t.equal(byQuest.get('q-b').measuredAttempts, 0);
      t.end();
    });

  t.test('non-rejection findings and unknown events never count', (t) => {
    const byQuest = tallyCostEntries([
      entry('q-a', {type: 'finding', kind: 'repro-on-head',
        ts: '2026-07-26T10:00:00.000Z'}),
      entry('q-a', {type: 'gate-decision', ts: '2026-07-26T10:01:00.000Z'}),
    ]);
    const a = byQuest.get('q-a');
    t.equal(a.rejections, 0);
    t.equal(a.attempts, 0);
    t.end();
  });

  t.test('renders measured coverage next to duration, never a bare zero',
    (t) => {
      const rendered = renderCostReport({days: 2, rows: [{
        questId: 'q-a', attempts: 3, rejections: 2, violations: 0,
        measuredAttempts: 1, durationMs: 120000,
        firstTs: Date.parse('2026-07-26T10:00:00.000Z'),
        lastTs: Date.parse('2026-07-26T11:00:00.000Z'),
        solved: true, chain: null,
      }]});
      t.match(rendered, /\| q-a \| 3 \| 2 \| 0 \| 1\/3 \| 2m \| 60m \| — \|/u);
      t.match(rendered, /telemetry measured on 1\/3 attempt\(s\)/u);
      t.end();
    });

  t.test('a quest with no work in the window is omitted from the table',
    (t) => {
      const rendered = renderCostReport({days: 2, rows: [{
        questId: 'q-idle', attempts: 0, rejections: 0, violations: 0,
        measuredAttempts: 0, durationMs: 0,
        firstTs: Number.POSITIVE_INFINITY, lastTs: Number.NEGATIVE_INFINITY,
        solved: false, chain: null,
      }]});
      t.notMatch(rendered, /q-idle/u);
      t.match(rendered, /No attempts, rejections, or violations/u);
      t.end();
    });
});
