import {test} from '../../src/test-helpers/tap.js';
import {
  normalizeReason,
  parseSecondaryReasons,
  extractRun,
  summarizeLatentBlockers,
  renderText,
  renderMarkdown,
  runCli,
} from '../../scripts/analyze-latent-blockers.js';

function minimalSummary() {
  return summarizeLatentBlockers([
    extractRun(reportFile('20260101T000000Z', 1), report({passed: true})),
  ]);
}
const freshDeepCensus = {
  relPath: 'test-output/latent-blocker-census-run1.json',
  mtimeIso: '2026-06-18T12:49:46.381Z',
  candidatesTotal: 54,
  survivors: 7,
  refuted: 47,
  frontierLen: 6,
  fresherThanGate: true,
};

function reportFile(ts, run) {
  return `test-output/reports/stat-gate-${ts}-run${run}.report.json`;
}
function report({passed = false, dominantReason = null, error = ''} = {}) {
  return {
    scenarios: [{
      scenario: 'rolling-restart',
      passed,
      failureClassification: {dominantReason},
      summary: {error},
    }],
  };
}

test('normalizeReason strips the run-specific =<detail> so per-node variants aggregate', (t) => {
  t.equal(normalizeReason('publication_missing_active_node=11601fe0-72d6'),
    'publication_missing_active_node');
  t.equal(normalizeReason('readiness_probe_timeout=Node readiness probe timed out for X'),
    'readiness_probe_timeout');
  t.equal(normalizeReason('replica_operations_in_flight'), 'replica_operations_in_flight');
  t.end();
});

test('parseSecondaryReasons pulls canonicalBlocker / quiescenceState / instabilitySummary', (t) => {
  const err = 'Control plane did not quiesce (quiescenceState=operation_drain_progressing, ' +
    'canonicalBlocker=replica_operations_in_flight, instabilitySummary=replica_operations_in_flight=1:4, ' +
    'leadership_unstable=0:5, leadership_unstable=12917:1)';
  const reasons = parseSecondaryReasons(err);
  t.ok(reasons.includes('operation_drain_progressing'), 'quiescenceState captured');
  t.ok(reasons.includes('replica_operations_in_flight'), 'canonicalBlocker captured');
  t.ok(reasons.includes('leadership_unstable'), 'instabilitySummary member captured');
  t.same(parseSecondaryReasons(''), [], 'empty error -> no reasons');
  t.end();
});

test('extractRun reads the REAL .report.json shape (top-level scenario.error + ' +
  'failureClassification, no scenario.summary) and drops the canonicalBlocker=none sentinel', (t) => {
  // Real per-run reports carry error/classification at the scenario top level, NOT under
  // scenario.summary (that is the failure-BUNDLE shape). Guard the production fallback path.
  const realShape = {
    scenarios: [{
      scenario: 'rolling-restart',
      passed: false,
      failureClassification: {dominantReason: 'quiescence_candidate'},
      error: 'Control plane quiescence stalled (canonicalBlocker=none, ' +
        'quiescenceState=quiescence_candidate, instabilitySummary=leadership_unstable=0:7)',
    }],
  };
  const run = extractRun(reportFile('20260618T030000Z', 1), realShape);
  t.equal(run.dominantReason, 'quiescence_candidate', 'dominant read from top-level failureClassification');
  t.notOk(run.secondaryReasons.includes('none'),
    'canonicalBlocker=none sentinel is NOT ingested as a phantom blocker (must-fix BUG 1)');
  t.ok(run.secondaryReasons.includes('leadership_unstable'),
    'a real instabilitySummary member is still captured from the top-level error');
  t.end();
});

test('extractRun: passed run has no dominant reason; failing run normalizes + dedups secondary', (t) => {
  const pass = extractRun(reportFile('20260618T010000Z', 1), report({passed: true}));
  t.equal(pass.passed, true);
  t.equal(pass.dominantReason, null, 'a passing run contributes no dominant reason');
  t.equal(pass.gateId, 'stat-gate-20260618T010000Z', 'gate id parsed from filename');

  const fail = extractRun(
    reportFile('20260618T020000Z', 2),
    report({
      passed: false,
      dominantReason: 'publication_missing_active_node=8be8d30f',
      error: 'x (canonicalBlocker=publication_missing_active_node, quiescenceState=leadership_churn)',
    }),
  );
  t.equal(fail.dominantReason, 'publication_missing_active_node', 'dominant normalized');
  t.notOk(fail.secondaryReasons.includes('publication_missing_active_node'),
    'the dominant reason is not double-counted as a secondary');
  t.ok(fail.secondaryReasons.includes('leadership_churn'), 'distinct secondary kept');
  t.end();
});

test('summarizeLatentBlockers: aggregates per-node variants, computes peel order by time centroid', (t) => {
  // gate A (early): publication_missing_active_node dominant twice (two node variants).
  // gate B (later): leadership_unstable dominant. Expect the later reason to have a higher
  // centroid (surfaced after the earlier one) = the onion-peel signal.
  const runs = [
    extractRun(reportFile('20260101T000000Z', 1),
      report({dominantReason: 'publication_missing_active_node=A'})),
    extractRun(reportFile('20260101T000000Z', 2),
      report({dominantReason: 'publication_missing_active_node=B'})),
    extractRun(reportFile('20260109T000000Z', 1),
      report({dominantReason: 'leadership_unstable'})),
    extractRun(reportFile('20260109T000000Z', 2), report({passed: true})),
  ];
  const s = summarizeLatentBlockers(runs);
  t.equal(s.totalRuns, 4);
  t.equal(s.passedRuns, 1);
  t.equal(s.gateCount, 2, 'two distinct gates');

  const missing = s.reasons.find((r) => r.reason === 'publication_missing_active_node');
  t.equal(missing.dominantCount, 2, 'per-node variants aggregated into one reason');

  const order = s.peelOrder.map((p) => p.reason);
  t.ok(order.indexOf('publication_missing_active_node') < order.indexOf('leadership_unstable'),
    'the earlier-surfacing reason precedes the later one in peel order');
  t.end();
});

test('runCli --json over explicit files emits the census schema', async (t) => {
  // Drive the real CLI path over no-match args -> graceful empty handling.
  const res = await runCli(['--json', 'does-not-exist.report.json']);
  // explicit file that cannot be read is skipped -> zero runs -> not ok with a message.
  t.notOk(res.ok, 'no readable reports -> not ok');
  t.match(res.output, /no \.report\.json|0/u, 'reports a no-data condition');
  t.end();
});

test('runCli --help returns usage', async (t) => {
  const res = await runCli(['--help']);
  t.notOk(res.ok);
  t.match(res.output, /usage: analyze-latent-blockers/u);
  t.end();
});

test('renderText leads with a deep-census banner when a fresh artifact exists', (t) => {
  const out = renderText(minimalSummary(), null, freshDeepCensus);
  t.match(out, /^⮕ DEEP CENSUS AVAILABLE/u, 'banner is the very first line');
  t.match(out, /latent-blocker-census-run1\.json/u, 'cites the artifact path');
  t.match(out, /54 cand → 7 survivors → 6 ranked/u, 'shows the counts');
  t.match(out, /newer than the latest gate report/u, 'states freshness');
  t.end();
});

test('renderText omits the banner (and keeps the fan-out NEXT) when no deep census', (t) => {
  // grounding present so the NEXT footer renders; deepCensus null = no banner.
  const grounding = {
    closureRecords: [],
    closureLedgerDir: 'x',
    deterministicSubstrate: 'y',
    finderLenses: [],
    candidateSchemaFields: ['id'],
  };
  const out = renderText(minimalSummary(), grounding, null);
  t.notMatch(out, /DEEP CENSUS AVAILABLE/u, 'no banner without an artifact');
  t.match(out, /feed this frontier to the L1-L4 agent fan-out/u,
    'falls back to the run-the-fan-out NEXT line');
  t.end();
});

test('renderText steers NEXT to the existing census when the artifact is fresh', (t) => {
  const grounding = {
    closureRecords: [],
    closureLedgerDir: 'x',
    deterministicSubstrate: 'y',
    finderLenses: [],
    candidateSchemaFields: ['id'],
  };
  const out = renderText(minimalSummary(), grounding, freshDeepCensus);
  t.match(out, /a FRESH deep census already exists — read it/u,
    'NEXT points at the existing artifact instead of re-running the fan-out');
  t.end();
});

test('renderMarkdown emits a banner blockquote when a fresh artifact exists', (t) => {
  const out = renderMarkdown(minimalSummary(), null, freshDeepCensus);
  t.match(out, /> \*\*⮕ DEEP CENSUS AVAILABLE/u, 'markdown banner is a blockquote');
  t.match(out, /latent-blocker-census-run1\.json/u, 'cites the artifact path');
  t.end();
});
