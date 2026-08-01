import {test} from '../../src/test-helpers/tap.js';
import {
  CLASS_CONVERGED,
  CLASS_CORRUPT,
  CLASS_NODE_EXIT,
  CLASS_ORACLE_BLIND,
  CLASS_STALLED,
  CLASS_TOPOLOGY_BLOCKED,
  classifyRunReport,
  classifyStatGateScenario,
  buildGateVerdict,
  wilsonInterval,
  GATE_VERDICT,
} from '../../scripts/rolling-restart-stat-gate-summary.js';

function scenario(overrides = {}) {
  return {
    passed: true,
    invariantBreaches: {hardCount: 0},
    publicationConvergence: {missingPublishedCount: 0},
    details: {diagnostics: {activeGate: {}}},
    dominantReason: null,
    duration: 123,
    ...overrides,
  };
}

test('classifyStatGateScenario preserves passed:false and does not converge topology blocks', (t) => {
  const result = classifyStatGateScenario(scenario({
    passed: false,
    verdict: 'BLOCK_TOPOLOGY_CONVERGENCE',
    verdictReason: 'topology_progress_blocked',
    dominantReason: 'critical_system_spread_open',
    details: {
      diagnostics: {
        quiescence: {
          state: 'critical_spread_open',
          canonicalBlocker: 'critical_system_spread_open',
        },
      },
    },
  }));

  t.equal(result.passed, false, 'false is preserved, not coerced to null');
  t.equal(result.missing, 0, 'publication convergence remains visible');
  t.equal(
    result.class,
    CLASS_TOPOLOGY_BLOCKED,
    'scenario failure is not classified as CONVERGED',
  );
  t.end();
});

test('classifyStatGateScenario keeps successful missing=0 runs converged', (t) => {
  const result = classifyStatGateScenario(scenario());

  t.equal(result.passed, true);
  t.equal(result.class, CLASS_CONVERGED);
  t.end();
});

test('classifyStatGateScenario stays backward compatible for reports without passed', (t) => {
  const sample = scenario();
  delete sample.passed;

  const result = classifyStatGateScenario(sample);

  t.equal(result.passed, null);
  t.equal(result.class, CLASS_CONVERGED);
  t.end();
});

test('classifyStatGateScenario prioritizes correctness and oracle classifications', (t) => {
  t.equal(
    classifyStatGateScenario(scenario({
      invariantBreaches: {hardCount: 1},
      passed: false,
    })).class,
    CLASS_CORRUPT,
    'hard breach wins',
  );
  t.equal(
    classifyStatGateScenario(scenario({
      classification: 'unexpected_node_exit',
      passed: false,
    })).class,
    CLASS_NODE_EXIT,
    'unexpected node exit wins',
  );
  t.equal(
    classifyStatGateScenario(scenario({
      details: {
        diagnostics: {
          oracleBlind: {classification: 'oracle_blind'},
        },
      },
      passed: false,
    })).class,
    CLASS_ORACLE_BLIND,
    'oracle blindness wins',
  );
  t.end();
});

test('classifyStatGateScenario classifies non-topology scenario failures as stalled', (t) => {
  const result = classifyStatGateScenario(scenario({
    passed: false,
    dominantReason: 'publication_missing_active_node',
  }));

  t.equal(result.class, CLASS_STALLED);
  t.end();
});

test('classifyRunReport reads the first scenario from a report', (t) => {
  const result = classifyRunReport({
    scenarios: [
      scenario({
        passed: false,
        verdictReason: 'topology_progress_blocked',
      }),
    ],
  });

  t.equal(result.class, CLASS_TOPOLOGY_BLOCKED);
  t.end();
});

// --- gate-level Wilson verdict (docs/convergence-donewhen-metric.md §5) ---

function gateSummary(overrides = {}) {
  const passes = overrides.passes ?? 0;
  const runs = overrides.runs ?? 3;
  return {
    scenario: 'rolling-restart',
    runs,
    corruptCount: 0,
    nodeExitCount: 0,
    oracleBlindCount: 0,
    staleSourceRuns: 0,
    runsDetail: Array.from({length: runs}, (_, i) => ({passed: i < passes})),
    ...overrides.summary,
  };
}

const SEALED = {
  scenarios: {
    'rolling-restart': {wilsonLowerBoundBar: 0.357, promotionWindowMinRuns: 15},
  },
};

test('wilsonInterval matches the two golden values sealed in the metric doc', (t) => {
  // §6 re-seal window: 9/15 passes -> Wilson-95 CI [0.357, 0.802].
  const reseal = wilsonInterval(9, 15);
  t.equal(reseal.lowerBound.toFixed(3), '0.357');
  t.equal(reseal.upperBound.toFixed(3), '0.802');
  // §4 original baseline: 4/15 passes -> Wilson-95 CI [0.109, 0.520].
  const baseline = wilsonInterval(4, 15);
  t.equal(baseline.lowerBound.toFixed(3), '0.109');
  t.equal(baseline.upperBound.toFixed(3), '0.520');
  t.end();
});

test('wilsonInterval handles empty and degenerate inputs', (t) => {
  t.equal(wilsonInterval(0, 0).lowerBound, null);
  t.equal(wilsonInterval(0, 3).lowerBound, 0);
  t.equal(wilsonInterval(3, 3).upperBound, 1);
  t.end();
});

test('buildGateVerdict: safety floor dominates even a perfect pass rate', (t) => {
  const verdict = buildGateVerdict(
    gateSummary({passes: 15, runs: 15, summary: {nodeExitCount: 1}}),
    SEALED,
  );
  t.equal(verdict.verdict, GATE_VERDICT.SAFETY_VIOLATED);
  t.equal(verdict.safetyClean, false);
  t.end();
});

test('classifyStatGateScenario exposes acknowledged-write verification', (t) => {
  const result = classifyStatGateScenario(scenario({
    details: {
      acknowledgedWriteVisibility: {
        acknowledgedWriteCount: 37,
        reachableNodeCount: 5,
      },
      diagnostics: {activeGate: {}},
    },
  }));

  t.same(result.acknowledgedWriteVisibility, {
    verified: true,
    lossDetected: false,
    acknowledgedWriteCount: 37,
    reachableNodeCount: 5,
  });
  t.end();
});

test('buildGateVerdict: required acknowledged-write evidence fails closed', (t) => {
  const sealed = {
    scenarios: {
      'rolling-restart': {
        ...SEALED.scenarios['rolling-restart'],
        requiresAcknowledgedWriteVisibility: true,
      },
    },
  };
  const summary = gateSummary({passes: 15, runs: 15});
  const verdict = buildGateVerdict(summary, sealed);

  t.equal(verdict.verdict, GATE_VERDICT.SAFETY_VIOLATED);
  t.equal(verdict.safetyCounts.acknowledgedWriteUnverified, 15);
  t.equal(verdict.safetyCounts.acknowledgedWriteLoss, 0);
  t.end();
});

test('buildGateVerdict: verified acknowledged writes preserve a clean safety floor',
  (t) => {
    const sealed = {
      scenarios: {
        'rolling-restart': {
          ...SEALED.scenarios['rolling-restart'],
          requiresAcknowledgedWriteVisibility: true,
        },
      },
    };
    const summary = gateSummary({
      passes: 15,
      runs: 15,
      summary: {
        acknowledgedWriteUnverifiedCount: 0,
        acknowledgedWriteLossCount: 0,
        runsDetail: Array.from({length: 15}, () => ({
          passed: true,
          acknowledgedWriteVisibility: {
            verified: true,
            lossDetected: false,
          },
        })),
      },
    });
    const verdict = buildGateVerdict(summary, sealed);

    t.equal(verdict.verdict, GATE_VERDICT.ABOVE_BAR);
    t.equal(verdict.safetyClean, true);
    t.end();
  });

test('buildGateVerdict: ABOVE_BAR when the Wilson lower bound clears the sealed bar', (t) => {
  const verdict = buildGateVerdict(gateSummary({passes: 9, runs: 15}), SEALED);
  t.equal(verdict.verdict, GATE_VERDICT.ABOVE_BAR);
  t.equal(verdict.wilson.lowerBound.toFixed(3), '0.357');
  t.equal(verdict.promotionNote, null);
  t.end();
});

test('buildGateVerdict: BELOW_BAR only when the upper bound is under the bar', (t) => {
  const verdict = buildGateVerdict(gateSummary({passes: 0, runs: 20}), SEALED);
  t.equal(verdict.verdict, GATE_VERDICT.BELOW_BAR);
  t.end();
});

test('buildGateVerdict: straddling interval is INCONCLUSIVE with a promotion note', (t) => {
  // 0/3 passes: Wilson-95 upper bound ~0.56 straddles the 0.357 bar — exactly
  // the N=3 gates memory records as inconclusive on rate.
  const verdict = buildGateVerdict(gateSummary({passes: 0, runs: 3}), SEALED);
  t.equal(verdict.verdict, GATE_VERDICT.INCONCLUSIVE);
  t.match(verdict.promotionNote, /N>=15/);
  t.end();
});

test('buildGateVerdict: unknown scenario yields NO_SEALED_BAR, never a false pass', (t) => {
  const verdict = buildGateVerdict(
    gateSummary({passes: 3, runs: 3, summary: {scenario: 'unknown-scenario'}}),
    SEALED,
  );
  t.equal(verdict.verdict, GATE_VERDICT.NO_SEALED_BAR);
  t.end();
});
