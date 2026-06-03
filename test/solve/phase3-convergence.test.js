import tap from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  blockerHistory,
  detectOscillation,
} from '../../scripts/solve/current-blocker.js';
import {invariantHighWater} from '../../scripts/solve/store.js';
import {
  extractSatisfiedInvariants,
  distanceMetricFromReport,
  scenarioHarnessProbe,
} from '../../scripts/solve/probes/scenario-harness.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'phase3-'));
}

function evidence(owner, extra = {}) {
  return {
    type: 'evidence-ingested',
    frontier: 'f-main',
    owner,
    boundary: 'b',
    dominantReason: 'r',
    metric: 1,
    done: false,
    ...extra,
  };
}

// R2: oscillation detection over the blocker history.
tap.test('R2 oscillation detection', async (t) => {
  t.test('A -> B -> A is flagged as oscillating on the revisited label', (t) => {
    const log = [evidence('ownerA'), evidence('ownerB'), evidence('ownerA')];
    const hist = blockerHistory(log, 'f-main');
    t.same(hist.transitions, ['ownerA / b / r', 'ownerB / b / r', 'ownerA / b / r']);
    t.same(hist.revisits, ['ownerA / b / r']);
    const osc = detectOscillation(log, 'f-main');
    t.equal(osc.oscillating, true);
    t.equal(osc.label, 'ownerA / b / r');
    t.equal(osc.count, 2);
    t.end();
  });

  t.test('A -> B -> C never revisits and is not oscillating', (t) => {
    const log = [evidence('ownerA'), evidence('ownerB'), evidence('ownerC')];
    const osc = detectOscillation(log, 'f-main');
    t.equal(osc.oscillating, false);
    t.equal(osc.label, null);
    t.end();
  });

  t.test('consecutive duplicates collapse and do not count as a revisit', (t) => {
    const log = [evidence('ownerA'), evidence('ownerA'), evidence('ownerB')];
    const hist = blockerHistory(log, 'f-main');
    t.same(hist.transitions, ['ownerA / b / r', 'ownerB / b / r']);
    t.same(hist.revisits, []);
    t.equal(detectOscillation(log, 'f-main').oscillating, false);
    t.end();
  });

  t.test('non-measuring and done evidence are excluded from history', (t) => {
    const log = [
      evidence('ownerA'),
      evidence('ownerB', {metric: null, invalidSample: true}),
      evidence('ownerC', {done: true}),
      evidence('ownerA'),
    ];
    // The B/C noise is filtered out, leaving A, A which collapses to a single
    // transition: filtered noise must never manufacture a false oscillation.
    const osc = detectOscillation(log, 'f-main');
    t.equal(osc.oscillating, false, 'filtered noise does not fabricate a revisit');
    t.end();
  });
});

// R3: invariant high-water mark is the monotonic union across measured events.
tap.test('R3 invariant high-water', async (t) => {
  t.test('union over measured attempt + evidence events', (t) => {
    const log = [
      {type: 'attempt', frontier: 'f-main', invalidSample: false,
        satisfiedInvariants: ['inv_a']},
      {type: 'evidence-ingested', frontier: 'f-main', metric: 1,
        satisfiedInvariants: ['inv_b', 'inv_c']},
    ];
    t.same(invariantHighWater(log, 'f-main').sort(), ['inv_a', 'inv_b', 'inv_c']);
    t.end();
  });

  t.test('non-measuring samples do not contribute to the high-water mark', (t) => {
    const log = [
      {type: 'attempt', frontier: 'f-main', invalidSample: false,
        satisfiedInvariants: ['inv_a']},
      {type: 'attempt', frontier: 'f-main', invalidSample: true,
        satisfiedInvariants: ['inv_z']},
      {type: 'evidence-ingested', frontier: 'f-main', metric: '0',
        satisfiedInvariants: ['inv_string_metric']},
    ];
    t.same(invariantHighWater(log, 'f-main'), ['inv_a']);
    t.end();
  });

  t.test('other frontiers are isolated', (t) => {
    const log = [
      {type: 'evidence-ingested', frontier: 'f-main', metric: 1,
        satisfiedInvariants: ['inv_a']},
      {type: 'evidence-ingested', frontier: 'other', metric: 1,
        satisfiedInvariants: ['inv_b']},
    ];
    t.same(invariantHighWater(log, 'f-main'), ['inv_a']);
    t.end();
  });
});

function writeDistanceReport(dir, name, {ts, scenario, passed, priorityItems,
  missingPublishedCount, prioritySpreadPending, invariants}) {
  fs.writeFileSync(
    path.join(dir, `${name}.report.json`),
    JSON.stringify({
      timestamp: ts,
      summary: {total: 1, passed: passed ? 1 : 0, failed: passed ? 0 : 1},
      optimizationSummary: {totalPriorityItems: priorityItems},
      standardSummary: {
        scenarios: [{
          scenario,
          current: {passed, verdict: passed ? 'PASS' : 'BLOCK_EVIDENCE_INCOMPLETE'},
          priorityRecoveryInvariants: {invariants: invariants || []},
          stabilityGates: {
            publication: {evidence: {missingPublishedCount, prioritySpreadPending}},
          },
        }],
      },
    }),
  );
}

// R4: composite distance metric, lower-is-better gradient.
tap.test('R4 distance metric', async (t) => {
  const SC = 'rolling-restart';

  t.test('composes priority, missing publications, spread and failing invariants', (t) => {
    const dir = tmp();
    writeDistanceReport(dir, 'a', {ts: '2026-06-01T01:00:00Z', scenario: SC,
      passed: false, priorityItems: 1, missingPublishedCount: 3,
      prioritySpreadPending: true,
      invariants: [{invariantId: 'x', passed: false}, {invariantId: 'y', passed: true}]});
    const data = JSON.parse(fs.readFileSync(path.join(dir, 'a.report.json'), 'utf8'));
    // 1*100 + 3 missing + 5 spread + 1 failing invariant = 109
    t.equal(distanceMetricFromReport(data, SC), 109);
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('equal priority but fewer missing publications => smaller distance', (t) => {
    const dir = tmp();
    writeDistanceReport(dir, 'far', {ts: '2026-06-01T01:00:00Z', scenario: SC,
      passed: false, priorityItems: 1, missingPublishedCount: 4,
      prioritySpreadPending: false, invariants: []});
    writeDistanceReport(dir, 'near', {ts: '2026-06-01T02:00:00Z', scenario: SC,
      passed: false, priorityItems: 1, missingPublishedCount: 1,
      prioritySpreadPending: false, invariants: []});
    const far = JSON.parse(fs.readFileSync(path.join(dir, 'far.report.json'), 'utf8'));
    const near = JSON.parse(fs.readFileSync(path.join(dir, 'near.report.json'), 'utf8'));
    t.ok(distanceMetricFromReport(near, SC) < distanceMetricFromReport(far, SC));
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('streak term shrinks distance as the clean streak grows', (t) => {
    const dir = tmp();
    writeDistanceReport(dir, 'a', {ts: '2026-06-01T01:00:00Z', scenario: SC,
      passed: true, priorityItems: 0, missingPublishedCount: 0,
      prioritySpreadPending: false, invariants: []});
    const data = JSON.parse(fs.readFileSync(path.join(dir, 'a.report.json'), 'utf8'));
    const far = distanceMetricFromReport(data, SC, {streakTerm: 3});
    const near = distanceMetricFromReport(data, SC, {streakTerm: 1});
    t.ok(near < far, 'a longer remaining-streak term means a larger distance');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('null base priority => null distance (non-measuring)', (t) => {
    t.equal(distanceMetricFromReport({}, SC), null);
    t.end();
  });

  t.test('probe measure supports metric:distance and always returns satisfiedInvariants', (t) => {
    const dir = tmp();
    writeDistanceReport(dir, 'a', {ts: '2026-06-01T01:00:00Z', scenario: SC,
      passed: false, priorityItems: 2, missingPublishedCount: 1,
      prioritySpreadPending: false,
      invariants: [{invariantId: 'x', passed: true}]});
    const r = scenarioHarnessProbe.measure({scenario: SC, reportDir: dir, metric: 'distance'});
    t.equal(typeof r.metric, 'number');
    t.ok(Array.isArray(r.satisfiedInvariants));
    t.ok(r.satisfiedInvariants.includes('x'));
    const empty = scenarioHarnessProbe.measure({scenario: SC, reportDir: tmp(), metric: 'distance'});
    t.same(empty.satisfiedInvariants, [], 'no-runs path still returns an array');
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });

  t.test('extractSatisfiedInvariants gathers passed + synthetic convergence flags', (t) => {
    const dir = tmp();
    writeDistanceReport(dir, 'a', {ts: '2026-06-01T01:00:00Z', scenario: SC,
      passed: true, priorityItems: 0, missingPublishedCount: 0,
      prioritySpreadPending: false,
      invariants: [{invariantId: 'x', passed: true}, {invariantId: 'y', passed: false}]});
    const data = JSON.parse(fs.readFileSync(path.join(dir, 'a.report.json'), 'utf8'));
    const set = extractSatisfiedInvariants(data, SC);
    t.ok(set.includes('x'));
    t.notOk(set.includes('y'));
    t.ok(set.includes('publication_converged'));
    t.ok(set.includes('priority_spread_settled'));
    fs.rmSync(dir, {recursive: true, force: true});
    t.end();
  });
});
