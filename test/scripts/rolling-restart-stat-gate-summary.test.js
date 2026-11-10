import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {
  CLASS_CONVERGED,
  CLASS_CORRUPT,
  CLASS_NODE_EXIT,
  CLASS_ORACLE_BLIND,
  CLASS_SLOW,
  CLASS_STALLED,
  CLASS_TOPOLOGY_BLOCKED,
  CLASS_UNJUDGEABLE,
  classifyRunReport,
  classifyStatGateScenario,
  buildGateVerdict,
  wilsonInterval,
  GATE_VERDICT,
} from '../../scripts/rolling-restart-stat-gate-summary.js';

const EXPECTED_UNJUDGEABLE = CLASS_UNJUDGEABLE;

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

test('classifyStatGateScenario preserves passed:false and does not converge topology blocks', () => {
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

  assert.equal(result.passed, false, 'false is preserved, not coerced to null');
  assert.equal(result.missing, 0, 'publication convergence remains visible');
  assert.equal(
    result.class,
    CLASS_TOPOLOGY_BLOCKED,
    'scenario failure is not classified as CONVERGED',
  );
});

test('classifyStatGateScenario keeps successful missing=0 runs converged', () => {
  const result = classifyStatGateScenario(scenario());

  assert.equal(result.passed, true);
  assert.equal(result.class, CLASS_CONVERGED);
});

test('classifyStatGateScenario stays backward compatible for reports without passed', () => {
  const sample = scenario();
  delete sample.passed;

  const result = classifyStatGateScenario(sample);

  assert.equal(result.passed, null);
  assert.equal(result.class, CLASS_CONVERGED);
});

test('classifyStatGateScenario prioritizes correctness and oracle classifications', () => {
  assert.equal(
    classifyStatGateScenario(scenario({
      invariantBreaches: {hardCount: 1},
      passed: false,
    })).class,
    CLASS_CORRUPT,
    'hard breach wins',
  );
  assert.equal(
    classifyStatGateScenario(scenario({
      classification: 'unexpected_node_exit',
      passed: false,
    })).class,
    CLASS_NODE_EXIT,
    'unexpected node exit wins',
  );
  assert.equal(
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
});

test('classifyStatGateScenario classifies non-topology scenario failures as stalled', () => {
  const result = classifyStatGateScenario(scenario({
    passed: false,
    dominantReason: 'publication_missing_active_node',
  }));

  assert.equal(result.class, CLASS_STALLED);
});

test('classifyRunReport reads the first scenario from a report', () => {
  const result = classifyRunReport({
    scenarios: [
      scenario({
        passed: false,
        verdictReason: 'topology_progress_blocked',
      }),
    ],
  });

  assert.equal(result.class, CLASS_TOPOLOGY_BLOCKED);
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

test('wilsonInterval matches the two golden values sealed in the metric doc', () => {
  // §6 re-seal window: 9/15 passes -> Wilson-95 CI [0.357, 0.802].
  const reseal = wilsonInterval(9, 15);
  assert.equal(reseal.lowerBound.toFixed(3), '0.357');
  assert.equal(reseal.upperBound.toFixed(3), '0.802');
  // §4 original baseline: 4/15 passes -> Wilson-95 CI [0.109, 0.520].
  const baseline = wilsonInterval(4, 15);
  assert.equal(baseline.lowerBound.toFixed(3), '0.109');
  assert.equal(baseline.upperBound.toFixed(3), '0.520');
});

test('wilsonInterval handles empty and degenerate inputs', () => {
  assert.equal(wilsonInterval(0, 0).lowerBound, null);
  assert.equal(wilsonInterval(0, 3).lowerBound, 0);
  assert.equal(wilsonInterval(3, 3).upperBound, 1);
});

test('buildGateVerdict: safety floor dominates even a perfect pass rate', () => {
  const verdict = buildGateVerdict(
    gateSummary({passes: 15, runs: 15, summary: {nodeExitCount: 1}}),
    SEALED,
  );
  assert.equal(verdict.verdict, GATE_VERDICT.SAFETY_VIOLATED);
  assert.equal(verdict.safetyClean, false);
});

test('classifyStatGateScenario exposes acknowledged-write verification', () => {
  const result = classifyStatGateScenario(scenario({
    details: {
      acknowledgedWriteVisibility: {
        acknowledgedWriteCount: 37,
        reachableNodeCount: 5,
      },
      diagnostics: {activeGate: {}},
    },
  }));

  assert.deepEqual(result.acknowledgedWriteVisibility, {
    verified: true,
    lossDetected: false,
    oracleBlind: false,
    classification: null,
    unwitnessedWriteCount: 0,
    acknowledgedWriteCount: 37,
    reachableNodeCount: 5,
  });
});

test('classifyStatGateScenario fails closed on a structured unwitnessed write', () => {
  const result = classifyStatGateScenario(scenario({
    details: {
      acknowledgedWriteVisibility: {
        verified: false,
        lossDetected: false,
        oracleBlind: false,
        classification: 'durable_commit_witness_missing',
        unwitnessedIds: ['write-1'],
        acknowledgedWriteCount: 1,
        reachableNodeCount: 5,
      },
      diagnostics: {activeGate: {}},
    },
  }));

  assert.equal(result.acknowledgedWriteVisibility.verified, false);
  assert.equal(result.acknowledgedWriteVisibility.unwitnessedWriteCount, 1);
  assert.equal(
    result.acknowledgedWriteVisibility.classification,
    'durable_commit_witness_missing',
  );
});

test('classifyStatGateScenario promotes nested visibility blindness', () => {
  const result = classifyStatGateScenario(scenario({
    details: {
      diagnostics: {
        activeGate: {},
        partialResult: {
          acknowledgedWriteVisibility: {
            verified: false,
            oracleBlind: true,
            classification: 'durable_read_authority_unavailable',
            acknowledgedWriteCount: 1,
            reachableNodeCount: 5,
          },
        },
      },
    },
  }));

  assert.equal(result.class, CLASS_ORACLE_BLIND);
  assert.equal(result.acknowledgedWriteVisibility.oracleBlind, true);
});

test('buildGateVerdict: required acknowledged-write evidence fails closed', () => {
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

  assert.equal(verdict.verdict, GATE_VERDICT.SAFETY_VIOLATED);
  assert.equal(verdict.safetyCounts.acknowledgedWriteUnverified, 15);
  assert.equal(verdict.safetyCounts.acknowledgedWriteLoss, 0);
});

test('buildGateVerdict: verified acknowledged writes preserve a clean safety floor', () => {
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

  assert.equal(verdict.verdict, GATE_VERDICT.ABOVE_BAR);
  assert.equal(verdict.safetyClean, true);
});

test('buildGateVerdict: ABOVE_BAR when the Wilson lower bound clears the sealed bar', () => {
  const verdict = buildGateVerdict(gateSummary({passes: 9, runs: 15}), SEALED);
  assert.equal(verdict.verdict, GATE_VERDICT.ABOVE_BAR);
  assert.equal(verdict.wilson.lowerBound.toFixed(3), '0.357');
  assert.equal(verdict.promotionNote, null);
});

test('buildGateVerdict: BELOW_BAR only when the upper bound is under the bar', () => {
  const verdict = buildGateVerdict(gateSummary({passes: 0, runs: 20}), SEALED);
  assert.equal(verdict.verdict, GATE_VERDICT.BELOW_BAR);
});

test('buildGateVerdict: straddling interval is INCONCLUSIVE with a promotion note', () => {
  const verdict = buildGateVerdict(gateSummary({passes: 0, runs: 3}), SEALED);
  assert.equal(verdict.verdict, GATE_VERDICT.INCONCLUSIVE);
  assert.match(verdict.promotionNote, /N>=15/);
});

test('buildGateVerdict: unknown scenario yields NO_SEALED_BAR, never a false pass', () => {
  const verdict = buildGateVerdict(
    gateSummary({passes: 3, runs: 3, summary: {scenario: 'unknown-scenario'}}),
    SEALED,
  );
  assert.equal(verdict.verdict, GATE_VERDICT.NO_SEALED_BAR);
});

// --- Quest receipts for canonical-report-outcome-classification ---

test('retained-formation-failure-classified: retained formation failure is classified as failure and never healthy or slow', () => {
  const failedFormationReport = {
    timestamp: '2026-11-09T03:33:00.000Z',
    scenario: 'movielens-lagrange-service-affinity-live',
    producer: 'service-data-affinity-demo',
    fidelity: 'live',
    summary: {total: 1, passed: 0, failed: 1},
    formationVerdict: {
      schemaVersion: 1,
      verdict: 'FAIL',
      reason: 'node_ready_lease_incomplete',
      seedStarved: true,
      budget: {maxBlockedMs: 10000},
      seedNodeId: 'node-0',
      leaseWaits: {count: 5, totalWaitMs: 15000},
      criticalSpread: {open: true},
      admission: {admitted: false, state: 'denied'},
    },
    standardSummary: {
      scenarios: [{
        scenario: 'movielens-lagrange-service-affinity-live',
        passed: false,
        current: {
          passed: false,
          verdict: 'FAIL',
          verdictReason: 'node_ready_lease_incomplete',
        },
        detail: {},
      }],
    },
  };

  const result = classifyRunReport(failedFormationReport);
  assert.equal(result.passed, false, 'failed formation passed must be false');
  assert.notEqual(result.class, CLASS_SLOW, 'failed formation must never be SLOW');
  assert.notEqual(result.class, CLASS_CONVERGED, 'failed formation must never be CONVERGED');
  assert.equal(result.class, CLASS_STALLED, 'node_ready_lease_incomplete must be classified as STALLED');
  assert.equal(result.reason, 'node_ready_lease_incomplete');

  const starvedReport = {
    ...failedFormationReport,
    formationVerdict: {
      ...failedFormationReport.formationVerdict,
      reason: 'seed_event_loop_starved',
    },
  };
  const starvedResult = classifyRunReport(starvedReport);
  assert.equal(starvedResult.class, CLASS_STALLED);
  assert.equal(starvedResult.passed, false);

  const spreadReport = {
    ...failedFormationReport,
    formationVerdict: {
      ...failedFormationReport.formationVerdict,
      reason: 'critical_system_spread_open',
    },
  };
  const spreadResult = classifyRunReport(spreadReport);
  assert.equal(spreadResult.class, CLASS_TOPOLOGY_BLOCKED);
  assert.equal(spreadResult.passed, false);

  const unobservedReport = {
    ...failedFormationReport,
    formationVerdict: {
      ...failedFormationReport.formationVerdict,
      reason: 'seed_log_unavailable',
    },
  };
  const unobservedResult = classifyRunReport(unobservedReport);
  assert.equal(unobservedResult.class, CLASS_ORACLE_BLIND);
  assert.equal(unobservedResult.passed, false);
});

test('supported-success-classified: supported success report families are classified as CONVERGED', () => {
  const statGateReport = {
    scenarios: [
      scenario({
        scenario: 'rolling-restart',
        passed: true,
        invariantBreaches: {hardCount: 0},
        publicationConvergence: {missingPublishedCount: 0},
        dominantReason: 'converged',
      }),
    ],
  };
  const statGateResult = classifyRunReport(statGateReport);
  assert.equal(statGateResult.passed, true);
  assert.equal(statGateResult.class, CLASS_CONVERGED);

  const formationSuccessReport = {
    timestamp: '2026-11-09T03:33:00.000Z',
    scenario: 'movielens-lagrange-service-affinity-live',
    producer: 'service-data-affinity-demo',
    fidelity: 'live',
    summary: {total: 1, passed: 1, failed: 0},
    formationVerdict: {
      schemaVersion: 1,
      verdict: 'PASS',
      reason: 'schema_admitted',
      admission: {admitted: true, state: 'admitted'},
    },
    standardSummary: {
      scenarios: [{
        scenario: 'movielens-lagrange-service-affinity-live',
        passed: true,
        current: {passed: true, verdict: 'PASS'},
        detail: {},
      }],
    },
  };
  const formationResult = classifyRunReport(formationSuccessReport);
  assert.equal(formationResult.passed, true);
  assert.equal(formationResult.class, CLASS_CONVERGED);
});

test('unknown-missing-conflicting-evidence-refused: unknown, missing, malformed, and conflicting reports are classified as UNJUDGEABLE', () => {
  assert.equal(classifyRunReport(null).class, EXPECTED_UNJUDGEABLE);
  assert.equal(classifyRunReport('not-an-object').class, EXPECTED_UNJUDGEABLE);
  assert.equal(classifyRunReport({}).class, EXPECTED_UNJUDGEABLE);
  assert.equal(classifyRunReport({unknownKey: true}).class, EXPECTED_UNJUDGEABLE);
  assert.equal(classifyRunReport({scenarios: []}).class, EXPECTED_UNJUDGEABLE);

  // Unobserved required verdict fields (passed === null with no formation or breach metrics)
  assert.equal(classifyRunReport({
    scenarios: [{scenario: 'unknown', passed: null}],
  }).class, EXPECTED_UNJUDGEABLE);

  // Contradictory evidence: passed === true but hardBreaches > 0
  assert.equal(classifyRunReport({
    scenarios: [scenario({passed: true, invariantBreaches: {hardCount: 2}})],
  }).class, EXPECTED_UNJUDGEABLE);

  // Contradictory evidence: formation PASS but summary.failed > 0
  assert.equal(classifyRunReport({
    producer: 'service-data-affinity-demo',
    summary: {total: 1, passed: 0, failed: 1},
    formationVerdict: {schemaVersion: 1, verdict: 'PASS'},
    standardSummary: {scenarios: [{passed: true}]},
  }).class, EXPECTED_UNJUDGEABLE);

  // Contradictory evidence: formation PASS but scenario passed is false
  assert.equal(classifyRunReport({
    producer: 'service-data-affinity-demo',
    summary: {total: 1, passed: 1, failed: 0},
    formationVerdict: {schemaVersion: 1, verdict: 'PASS'},
    standardSummary: {scenarios: [{passed: false}]},
  }).class, EXPECTED_UNJUDGEABLE);

  // Contradictory evidence: formation FAIL but scenario passed is true
  assert.equal(classifyRunReport({
    producer: 'service-data-affinity-demo',
    summary: {total: 1, passed: 1, failed: 0},
    formationVerdict: {
      schemaVersion: 1,
      verdict: 'FAIL',
      reason: 'node_ready_lease_incomplete',
    },
    standardSummary: {scenarios: [{passed: true}]},
  }).class, EXPECTED_UNJUDGEABLE);

  // Unknown formation verdict
  assert.equal(classifyRunReport({
    producer: 'service-data-affinity-demo',
    formationVerdict: {schemaVersion: 1, verdict: 'UNKNOWN_VERDICT'},
    standardSummary: {scenarios: [{passed: true}]},
  }).class, EXPECTED_UNJUDGEABLE);
});

test('public-triage-and-receipt-composition: public triage script refuses unjudgeable reports and accurately triages formation failures', () => {
  const triageScript = path.resolve('scripts/triage-distributed-failure.js');
  const tempDir = mkdtempSync(path.join(tmpdir(), 'triage-test-'));

  try {
    const failedFormationPath = path.join(tempDir, 'failed-formation.report.json');
    writeFileSync(failedFormationPath, JSON.stringify({
      timestamp: '2026-11-09T03:33:00.000Z',
      scenario: 'movielens-lagrange-service-affinity-live',
      producer: 'service-data-affinity-demo',
      summary: {total: 1, passed: 0, failed: 1},
      formationVerdict: {
        schemaVersion: 1,
        verdict: 'FAIL',
        reason: 'node_ready_lease_incomplete',
      },
      standardSummary: {
        scenarios: [{
          scenario: 'movielens-lagrange-service-affinity-live',
          passed: false,
          current: {passed: false, verdict: 'FAIL'},
        }],
      },
    }));

    const formationRun = spawnSync(
      process.execPath,
      [triageScript, failedFormationPath],
      {encoding: 'utf8'},
    );
    assert.doesNotMatch(
      formationRun.stdout,
      /run classified healthy — nothing to triage/u,
      'failed formation must never report healthy',
    );
    assert.match(
      formationRun.stdout,
      /class:\s+STALLED/u,
      'failed formation must be classified STALLED in triage',
    );
    assert.equal(formationRun.status, 0);

    const emptyReportPath = path.join(tempDir, 'empty.report.json');
    writeFileSync(emptyReportPath, JSON.stringify({}));

    const emptyRun = spawnSync(
      process.execPath,
      [triageScript, emptyReportPath],
      {encoding: 'utf8'},
    );
    assert.doesNotMatch(
      emptyRun.stdout,
      /run classified healthy — nothing to triage/u,
      'empty report must never report healthy',
    );
    assert.match(
      emptyRun.stdout,
      /UNJUDGEABLE/u,
      'empty report triage output must name UNJUDGEABLE',
    );
    assert.notEqual(emptyRun.status, 0, 'empty report triage must exit non-zero');
  } finally {
    rmSync(tempDir, {recursive: true, force: true});
  }
});
