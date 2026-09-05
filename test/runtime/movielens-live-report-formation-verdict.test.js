/**
 * The live report must carry the formation verdict and phase timing at both
 * the top level and the scenario detail, and a formation-only run must report
 * under its own scenario so it never counts toward the full certification
 * scenario's consecutive-run reading.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  FORMATION_ONLY_SCENARIO,
  LIVE_SCENARIO,
  buildAffinityDemoLiveReport,
} from '../../examples/service-data-affinity/affinity-demo-live-report.js';

const TIMESTAMP = '2026-09-05T19:10:11.628Z';
const VERDICT = Object.freeze({
  verdict: 'FAIL', reason: 'seed_event_loop_starved', seedStarved: true,
});
const FORMATION = Object.freeze({
  clusterStartedAtMs: 1788634953000, clusterFormedAtMs: 1788635088000,
});

test('formation evidence rides the report at both levels', (t) => {
  const report = buildAffinityDemoLiveReport({
    timestamp: TIMESTAMP,
    error: new Error('schema admission timed out'),
    phaseEvidence: {formationVerdict: VERDICT, formation: FORMATION},
  });
  t.equal(report.scenario, LIVE_SCENARIO);
  t.same(report.formationVerdict, VERDICT);
  const [entry] = report.standardSummary.scenarios;
  t.same(entry.detail.formationVerdict, VERDICT);
  t.same(entry.detail.formation, FORMATION);
  t.equal(entry.passed, false);
  const bare = buildAffinityDemoLiveReport({timestamp: TIMESTAMP});
  t.equal(bare.formationVerdict, null, 'absent evidence is null, not PASS');
  t.equal(bare.standardSummary.scenarios[0].detail.formation, null);
  t.end();
});

test('a formation-only run reports under its own scenario', (t) => {
  const report = buildAffinityDemoLiveReport({
    timestamp: TIMESTAMP,
    result: {converged: true, formationOnly: true},
    phaseEvidence: {formationOnly: true, formationVerdict: {verdict: 'PASS'}},
  });
  t.equal(report.scenario, FORMATION_ONLY_SCENARIO);
  t.equal(report.standardSummary.scenarios[0].scenario, FORMATION_ONLY_SCENARIO);
  t.equal(report.standardSummary.scenarios[0].passed, true);
  t.not(FORMATION_ONLY_SCENARIO, LIVE_SCENARIO);
  t.end();
});
