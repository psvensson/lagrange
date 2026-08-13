import tap from 'tap';

import {
  renderMetaFriction,
  tallyFrictionEvents,
} from '../../scripts/solve/meta-friction.js';

function entry(questId, event) {
  return {questId, event};
}

const NULL_METRIC_PAIR = [
  'metricBefore/metricAfter must be finite numbers from a probe',
  'null metrics require invalidSample=true',
];

tap.test('workflow friction ranking', async (t) => {
  t.test('violations that fire together are ranked as one defect', (t) => {
    // The null-metric pair always trips both strings. Counting them separately
    // would double-report one defect and distort exactly the ranking this exists
    // to produce.
    const {rows} = tallyFrictionEvents([
      entry('q1', {type: 'violation', scope: 'attempt-integrity',
        violations: NULL_METRIC_PAIR}),
      entry('q2', {type: 'violation', scope: 'attempt-integrity',
        violations: [...NULL_METRIC_PAIR].reverse()}),
    ]);
    t.equal(rows.length, 1, 'order within the violation set does not split the row');
    t.equal(rows[0].count, 2);
    t.same(rows[0].quests, ['q1', 'q2'], 'the affected quests are carried');
    t.match(rows[0].key, /attempt-integrity/u, 'the scope is part of the identity');
    t.end();
  });

  t.test('rows are ranked by count, highest first', (t) => {
    const {rows} = tallyFrictionEvents([
      entry('q1', {type: 'guard-override', code: 'blocked-theory'}),
      entry('q1', {type: 'violation', scope: 'attempt-integrity',
        violations: NULL_METRIC_PAIR}),
      entry('q2', {type: 'violation', scope: 'attempt-integrity',
        violations: NULL_METRIC_PAIR}),
      entry('q3', {type: 'violation', scope: 'attempt-integrity',
        violations: NULL_METRIC_PAIR}),
    ]);
    t.equal(rows[0].count, 3, 'the most frequent friction ranks first');
    t.equal(rows[0].kind, 'violation');
    t.equal(rows[1].kind, 'override');
    t.end();
  });

  t.test('a free scope re-authorization is not counted as friction', (t) => {
    // Re-authorizing an already-covered scope is explicitly exempt from the
    // override budget; reporting it would re-surface what the exemption removed.
    const {rows} = tallyFrictionEvents([
      entry('q1', {type: 'guard-override', code: 'blocked-scope'}),
      entry('q1', {type: 'guard-override', code: 'blocked-scope',
        scopeReauthorization: true}),
      entry('q1', {type: 'guard-override', code: 'blocked-scope',
        scopeReauthorization: true}),
    ]);
    t.equal(rows.length, 1);
    t.equal(rows[0].count, 1, 'only the charged override is friction');
    t.end();
  });

  t.test('operator stops and automatic advisories are separate totals', (t) => {
    const friction = tallyFrictionEvents([
      entry('q1', {type: 'guard-override', code: 'blocked-scope'}),
      entry('q1', {type: 'gate-decision', outcome: 'continue',
        disposition: 'advisory', code: 'reflection-due'}),
      entry('q2', {type: 'gate-decision', outcome: 'blocked',
        disposition: 'reroute', code: 'blocked-scope'}),
      entry('q3', {type: 'gate-decision', outcome: 'continue',
        disposition: 'advisory', override: 'reviewed', code: 'blocked-scope'}),
    ]);
    t.equal(friction.operatorStops.length, 1);
    t.equal(friction.operatorStops[0].code, 'blocked-scope');
    t.equal(friction.advisories.length, 1);
    t.equal(friction.advisories[0].code, 'reflection-due');
    t.end();
  });

  t.test('parks are listed, not histogrammed', (t) => {
    // `exhausted` is ~97% of all parks, so a kind histogram carries no signal —
    // which quest exhausted, and why, is the part a reader needs.
    const {rows, parks} = tallyFrictionEvents([
      entry('q1', {type: 'park', kind: 'exhausted', reason: 'budget spent'}),
      entry('q2', {type: 'park', kind: 'exhausted', reason: 'superseded'}),
    ]);
    t.equal(rows.length, 0, 'parks do not enter the ranking');
    t.equal(parks.length, 2);
    t.equal(parks[0].questId, 'q1');
    t.equal(parks[1].reason, 'superseded');
    t.end();
  });

  t.test('a violation with no violation strings is ignored', (t) => {
    const {rows} = tallyFrictionEvents([
      entry('q1', {type: 'violation', scope: 'attempt-integrity', violations: []}),
      entry('q1', {type: 'guard-override'}),
    ]);
    t.same(rows, [], 'unkeyable events are dropped rather than bucketed as blank');
    t.end();
  });

  t.test('measured cost is attributed to violation rows only', (t) => {
    // A violation embeds the attempt it rejected, so its telemetry says what the
    // voided work actually cost. Overrides and parks reference no attempt.
    const {rows} = tallyFrictionEvents([
      entry('q1', {type: 'violation', scope: 'attempt-integrity',
        violations: NULL_METRIC_PAIR,
        attempt: {telemetry: {agentDurationMs: 30_000}}}),
      entry('q2', {type: 'violation', scope: 'attempt-integrity',
        violations: NULL_METRIC_PAIR,
        attempt: {telemetry: {agentDurationMs: 12_000}}}),
      entry('q3', {type: 'guard-override', code: 'blocked-scope'}),
    ]);
    const violations = rows.find((r) => r.kind === 'violation');
    t.equal(violations.wastedMs, 42_000, 'measured durations accumulate');
    t.equal(violations.measured, 2);
    t.equal(rows.find((r) => r.kind === 'override').measured, 0,
      'an override row carries no cost because it references no attempt');
    t.end();
  });

  t.test('attempts without telemetry contribute count but not cost', (t) => {
    // The entire historical corpus predates telemetry; it must still rank.
    const {rows} = tallyFrictionEvents([
      entry('q1', {type: 'violation', scope: 'attempt-integrity',
        violations: NULL_METRIC_PAIR, attempt: {}}),
      entry('q2', {type: 'violation', scope: 'attempt-integrity',
        violations: NULL_METRIC_PAIR,
        attempt: {telemetry: {agentDurationMs: 5_000}}}),
    ]);
    t.equal(rows[0].count, 2, 'both are counted');
    t.equal(rows[0].measured, 1, 'only one is measured');
    t.equal(rows[0].wastedMs, 5_000);
    t.end();
  });

  t.test('an unmeasured row renders a dash, never a misleading zero', (t) => {
    const md = renderMetaFriction({
      days: 7, total: 2,
      rows: [
        {kind: 'override', key: 'blocked-scope', count: 2, quests: ['q1'],
          wastedMs: 0, measured: 0},
      ],
      parks: [],
    });
    t.match(md, /\| — \|/u, 'no measurement renders as a dash');
    t.notMatch(md, /\| 0s \|/u, 'a blank cost is not reported as zero cost');
    t.end();
  });

  t.test('a partially measured row says how much of it was measured', (t) => {
    const md = renderMetaFriction({
      days: 7, total: 3,
      rows: [
        {kind: 'violation', key: 'null metric pair', count: 3, quests: ['q1'],
          wastedMs: 42_000, measured: 2},
      ],
      parks: [],
    });
    t.match(md, /42s \(2\/3\)/u, 'partial measurement is stated, not implied');
    t.end();
  });

  t.test('renders the ranking and the dominant-cause advisory', (t) => {
    const md = renderMetaFriction({
      days: 7,
      total: 12,
      rows: [
        {kind: 'violation', key: 'attempt-integrity: null metric pair', count: 11,
          quests: ['q1', 'q2'], wastedMs: 0, measured: 0},
        {kind: 'override', key: 'blocked-scope', count: 1, quests: ['q3'],
          wastedMs: 0, measured: 0},
      ],
      parks: [{questId: 'q3', kind: 'exhausted', reason: 'budget spent'}],
    });
    t.match(md, /last 7 day\(s\), 12 recorded event\(s\)/u);
    t.match(md, /\| 11 \| violation \|/u);
    t.match(md, /is 92% of/u, 'the dominant cause is quantified');
    t.match(md, /Fix this one before anything else/u);
    t.match(md, /## Parks \(1\)/u);
    t.match(md, /\*\*q3\*\* \(exhausted\)/u);
    t.end();
  });

  t.test('an even spread raises no dominant-cause advisory', (t) => {
    const md = renderMetaFriction({
      days: 7,
      total: 10,
      rows: [
        {kind: 'violation', key: 'a', count: 4, quests: ['q1']},
        {kind: 'override', key: 'b', count: 3, quests: ['q2']},
        {kind: 'override', key: 'c', count: 3, quests: ['q3']},
      ],
      parks: [],
    });
    t.notMatch(md, /Fix this one before anything else/u,
      'no single cause dominates, so no advisory');
    t.notMatch(md, /## Parks/u, 'an empty park list renders no section');
    t.end();
  });

  t.test('a quiet window says so plainly', (t) => {
    const md = renderMetaFriction({days: 7, total: 0, rows: [], parks: []});
    t.match(md, /No violations or charged guard overrides in the window/u);
    t.notMatch(md, /Fix this one before anything else/u);
    t.end();
  });
});
