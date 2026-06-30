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
