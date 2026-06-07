import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  extractNodeJoinLoadMetrics,
  extractNodeFailureRebalanceLoadMetrics,
  summarizeValidationRuns,
  assessShipReadiness,
  classifyScenarioVerdict,
  HARNESS_VERDICTS,
} from '../validation-matrix.js';

describe('validation-matrix helpers', () => {
  it('extracts canonical node-failure-rebalance load metrics from a report', () => {
    const report = {
      scenarios: [{
        scenario: 'node-failure-rebalance',
        loadMetrics: {
          failed: 2,
          errors: 4,
          attemptErrors: 10,
          perNode: {
            'node-a': {
              attemptErrors: 5,
              admissionSignals: 5,
            },
            'node-b': {
              attemptErrors: 5,
              admissionSignals: 0,
            },
          },
          targetOperations: 80,
          undispatchedOperations: 8,
          queueDelay: {p95: 1200},
          waitReasons: {timeoutWaits: 4},
        },
      }],
    };

    const metrics = extractNodeFailureRebalanceLoadMetrics(report);
    assert.deepEqual(metrics, {
      availability: 'available',
      failedOperations: 4,
      attemptErrors: 10,
      nonAdmissionAttemptErrors: 5,
      queueDelayP95Ms: 1200,
      undispatchedRatio: 0.1,
      timeoutWaits: 4,
    });
  });

  it('extracts canonical node-join load metrics from a report', () => {
    const report = {
      scenarios: [{
        scenario: 'node-join-under-load',
        loadMetrics: {
          failed: 3,
          errors: 5,
          attemptErrors: 11,
          perNode: {
            'node-a': {
              attemptErrors: 6,
              admissionSignals: 6,
            },
            'node-b': {
              attemptErrors: 5,
              admissionSignals: 0,
            },
          },
          targetOperations: 100,
          undispatchedOperations: 17,
          queueDelay: {p95: 1800},
          waitReasons: {timeoutWaits: 9},
        },
      }],
    };

    const metrics = extractNodeJoinLoadMetrics(report);
    assert.deepEqual(metrics, {
      failedOperations: 5,
      attemptErrors: 11,
      nonAdmissionAttemptErrors: 5,
      queueDelayP95Ms: 1800,
      undispatchedRatio: 0.17,
      timeoutWaits: 9,
    });
  });

  it('summarizes run distributions and failure modes', () => {
    const summary = summarizeValidationRuns([
      {
        passed: false,
        rootCauseClass: 'load',
        dominantReason: 'dispatch_backlog',
        metrics: {
          failedOperations: 3,
          attemptErrors: 7,
          nonAdmissionAttemptErrors: 4,
          queueDelayP95Ms: 1400,
          undispatchedRatio: 0.11,
          timeoutWaits: 2,
        },
      },
      {
        passed: false,
        rootCauseClass: 'load',
        dominantReason: 'dispatch_backlog',
        metrics: {
          failedOperations: 0,
          attemptErrors: 2,
          nonAdmissionAttemptErrors: 1,
          queueDelayP95Ms: 650,
          undispatchedRatio: 0.04,
          timeoutWaits: 0,
        },
      },
      {
        passed: true,
        rootCauseClass: null,
        dominantReason: null,
        metrics: {
          failedOperations: 0,
          attemptErrors: 0,
          nonAdmissionAttemptErrors: 0,
          queueDelayP95Ms: 120,
          undispatchedRatio: 0.01,
          timeoutWaits: 0,
        },
      },
    ]);

    assert.equal(summary.totalRuns, 3);
    assert.equal(summary.failedRuns, 2);
    assert.equal(summary.failureModes.multiModal, false);
    assert.equal(summary.failureModes.dominantMode, 'load:dispatch_backlog');
    assert.equal(summary.distributions.failedOperations.max, 3);
    assert.equal(summary.distributions.nonAdmissionAttemptErrors.p95, 1);
    assert.equal(summary.distributions.queueDelayP95Ms.p50, 650);
    assert.equal(summary.distributions.undispatchedRatio.p95, 0.04);
  });

  it('returns no-ship when gate thresholds are exceeded', () => {
    const summary = summarizeValidationRuns([
      {
        passed: false,
        rootCauseClass: 'load',
        dominantReason: 'dispatch_backlog',
        metrics: {
          failedOperations: 0,
          attemptErrors: 12,
          nonAdmissionAttemptErrors: 12,
          queueDelayP95Ms: 4000,
          undispatchedRatio: 0.2,
          timeoutWaits: 0,
        },
      },
      {
        passed: true,
        rootCauseClass: null,
        dominantReason: null,
        metrics: {
          failedOperations: 0,
          attemptErrors: 1,
          nonAdmissionAttemptErrors: 1,
          queueDelayP95Ms: 300,
          undispatchedRatio: 0.03,
          timeoutWaits: 0,
        },
      },
      {
        passed: true,
        rootCauseClass: null,
        dominantReason: null,
        metrics: {
          failedOperations: 0,
          attemptErrors: 0,
          nonAdmissionAttemptErrors: 0,
          queueDelayP95Ms: 200,
          undispatchedRatio: 0.02,
          timeoutWaits: 0,
        },
      },
    ]);

    const gate = assessShipReadiness(summary);
    assert.equal(gate.decision, 'no-ship');
    assert.ok(gate.failedCriteria.length > 0);
    assert.ok(
      gate.failedCriteria.some((criterion) => criterion.metric === 'failureRate'),
      'expected failure-rate criterion to fail',
    );
    assert.ok(
      gate.failedCriteria.some((criterion) =>
        criterion.metric === 'nonAdmissionAttemptErrors.p95'),
      'expected non-admission attempt-error criterion to fail',
    );
    assert.ok(
      gate.failedCriteria.some((criterion) =>
        criterion.metric === 'queueDelayP95Ms.p95'),
      'expected queue-delay criterion to fail',
    );
  });

  it('does not hard-fail admission-only retries when observed runs are otherwise healthy', () => {
    const summary = summarizeValidationRuns([{
      passed: true,
      rootCauseClass: null,
      dominantReason: null,
      metrics: {
        failedOperations: 0,
        attemptErrors: 17,
        nonAdmissionAttemptErrors: 0,
        queueDelayP95Ms: 40,
        undispatchedRatio: 0,
        timeoutWaits: 0,
      },
    }]);

    const gate = assessShipReadiness(summary, {
      minimumRuns: 1,
    });
    assert.equal(gate.decision, 'ship');
  });

  it('correctly classifies individual scenario results into typed verdicts', () => {
    // 1. PASS
    const passResult = {passed: true};
    assert.equal(classifyScenarioVerdict(passResult).verdict, HARNESS_VERDICTS.PASS);

    // 2. BLOCK_HARNESS_INVALID (readiness probe timed out)
    const harnessResult1 = {
      passed: false,
      error: 'Not all nodes reached ACTIVE state within 225000ms: Node readiness probe timed out',
    };
    assert.equal(
      classifyScenarioVerdict(harnessResult1).verdict,
      HARNESS_VERDICTS.BLOCK_HARNESS_INVALID,
    );

    // 3. BLOCK_TOPOLOGY_CONVERGENCE (readiness timeout with measured topology evidence)
    const topologyResult = {
      passed: false,
      error: 'Cluster load readiness did not stabilize within 300000ms: ' +
        'Node readiness probe timed out',
      rootCauseClass: 'topology',
      dominantReason: 'publication_missing_active_node=node-a',
      publicationConvergence: {
        publicationStatus: 'PUBLISHED',
        missingPublishedNodeIds: ['node-a'],
      },
      details: {
        diagnostics: {
          activeGate: {
            mode: 'load',
            state: 'timed_out',
          },
        },
      },
    };
    const topologyVerdict = classifyScenarioVerdict(topologyResult);
    assert.equal(
      topologyVerdict.verdict,
      HARNESS_VERDICTS.BLOCK_TOPOLOGY_CONVERGENCE,
    );
    assert.equal(topologyVerdict.reason, 'topology_progress_blocked');

    // 4. BLOCK_HARNESS_INVALID (connectivity-shaped failure without topology evidence)
    const harnessResult2 = {
      passed: false,
      error: 'connect ECONNREFUSED 172.20.0.3:8081',
      rootCauseClass: 'topology',
      dominantReason: 'publication_missing_active_node=node-a',
      publicationConvergence: {},
      stabilityGates: {},
      details: {
        diagnostics: {
          activeGate: {
            snapshotTimeoutEncountered: false,
          },
        },
      },
    };
    assert.equal(
      classifyScenarioVerdict(harnessResult2).verdict,
      HARNESS_VERDICTS.BLOCK_HARNESS_INVALID,
    );

    const harnessResultWithFalseArrayLeaves = {
      ...harnessResult2,
      publicationConvergence: {
        missingPublishedNodeIds: [false],
      },
      stabilityGates: {
        priorityItems: [0],
      },
    };
    assert.equal(
      classifyScenarioVerdict(harnessResultWithFalseArrayLeaves).verdict,
      HARNESS_VERDICTS.BLOCK_HARNESS_INVALID,
    );

    // 5. FAIL_CORE_INVARIANT (invariant breaches)
    const invariantResult = {
      passed: false,
      invariantBreaches: [{name: 'safety_breach'}],
    };
    assert.equal(
      classifyScenarioVerdict(invariantResult).verdict,
      HARNESS_VERDICTS.FAIL_CORE_INVARIANT,
    );

    // 6. BLOCK_PERFORMANCE_REGRESSION (queue delay exceeded)
    const perfResult = {
      passed: false,
      loadMetrics: {
        total: 100,
        queueDelay: {p95: 5000},
      },
    };
    assert.equal(
      classifyScenarioVerdict(perfResult).verdict,
      HARNESS_VERDICTS.BLOCK_PERFORMANCE_REGRESSION,
    );

    // 7. BLOCK_EVIDENCE_INCOMPLETE (timeout / no metrics)
    const incompleteResult = {
      passed: false,
      error: 'Operation timeout',
    };
    assert.equal(
      classifyScenarioVerdict(incompleteResult).verdict,
      HARNESS_VERDICTS.BLOCK_EVIDENCE_INCOMPLETE,
    );
  });

  it('grades measured product failures instead of discarding them as ' +
    'harness-invalid when the error text is connectivity-shaped', () => {
    // Real-world regression: control-plane non-quiescence whose error text
    // contains "query timed out" (a SYMPTOM of control_plane_pressure) must be
    // graded as measured convergence progress blocked, not nulled out as a
    // harness connectivity failure.
    const controlPlanePressureRun = {
      passed: false,
      error: 'Control plane did not quiesce within 300000ms ' +
        '(quiescenceState=control_plane_pressure, ' +
        'control_plane_pressure=Admin API query timed out for node abc ' +
        'on lane snapshot after 590ms)',
      rootCauseClass: 'discovery',
      dominantReason: 'control_plane_pressure',
      failureClassification: {
        failureClass: 'discovery_unavailable',
        rootCauseClass: 'discovery',
        dominantReason: 'control_plane_pressure',
        signals: [
          'quiescenceState=control_plane_pressure',
          'quiescenceBlocker=control_plane_pressure',
        ],
      },
      loadMetrics: null,
    };
    const verdict = classifyScenarioVerdict(controlPlanePressureRun);
    assert.equal(verdict.verdict, HARNESS_VERDICTS.BLOCK_TOPOLOGY_CONVERGENCE);
    assert.equal(verdict.reason, 'topology_progress_blocked');

    // A startup-class liveness stall with concrete diagnostics and a
    // connectivity-shaped error is likewise graded, not discarded.
    const startupStallRun = {
      passed: false,
      error: 'Node readiness probe timed out',
      rootCauseClass: 'startup',
      failureClassification: {
        failureClass: 'startup_recovery_blocked',
        rootCauseClass: 'startup',
        signals: ['quiescenceState=control_plane_pressure'],
      },
    };
    assert.equal(
      classifyScenarioVerdict(startupStallRun).verdict,
      HARNESS_VERDICTS.BLOCK_TOPOLOGY_CONVERGENCE,
    );

    // A non-convergence product failure (load) with a connectivity-shaped
    // substring is no longer discarded as harness-invalid; it is suppressed and
    // graded by the downstream rules (failed operations => core invariant).
    const loadFailureRun = {
      passed: false,
      error: 'Admin API query timed out during load phase',
      rootCauseClass: 'load',
      failureClassification: {
        failureClass: 'load_admission_saturated',
        rootCauseClass: 'load',
        signals: ['undispatchedRatio=0.4'],
      },
      loadMetrics: {total: 100, failed: 5},
    };
    assert.equal(
      classifyScenarioVerdict(loadFailureRun).verdict,
      HARNESS_VERDICTS.FAIL_CORE_INVARIANT,
    );

    // Genuine harness/infra failure: connectivity-shaped error, NO structured
    // failure classification and no concrete diagnostics => stays harness-invalid.
    const infraRun = {
      passed: false,
      error: 'connect ECONNREFUSED 172.20.0.3:8081',
      rootCauseClass: 'discovery',
      publicationConvergence: {},
      stabilityGates: {},
    };
    assert.equal(
      classifyScenarioVerdict(infraRun).verdict,
      HARNESS_VERDICTS.BLOCK_HARNESS_INVALID,
    );

    // Infra failure that guessed a convergence rootCauseClass but carries only
    // an 'unknown' failureClass and no concrete evidence stays harness-invalid.
    const infraUnknownClassRun = {
      passed: false,
      error: 'socket error: connection closed before response',
      rootCauseClass: 'topology',
      failureClassification: {
        failureClass: 'unknown',
        rootCauseClass: 'topology',
        signals: [],
      },
      publicationConvergence: {},
      stabilityGates: {},
    };
    assert.equal(
      classifyScenarioVerdict(infraUnknownClassRun).verdict,
      HARNESS_VERDICTS.BLOCK_HARNESS_INVALID,
    );
  });

  it('correctly classifies validation matrix summaries into typed verdicts', () => {
    // 1. BLOCK_EVIDENCE_INCOMPLETE (insufficient runs)
    const incompleteSummary = {
      totalRuns: 1,
      passedRuns: 1,
      failedRuns: 0,
      failureRate: 0,
      distributions: {},
    };
    const gate1 = assessShipReadiness(incompleteSummary);
    assert.equal(gate1.verdict, HARNESS_VERDICTS.BLOCK_EVIDENCE_INCOMPLETE);

    // 2. FAIL_CORE_INVARIANT (failed operations > 0)
    const invariantSummary = {
      totalRuns: 3,
      passedRuns: 2,
      failedRuns: 1,
      failureRate: 0.33,
      distributions: {
        failedOperations: {p95: 1},
        nonAdmissionAttemptErrors: {p95: 0},
        queueDelayP95Ms: {p95: 0},
        undispatchedRatio: {p95: 0},
        timeoutWaits: {p95: 0},
      },
    };
    const gate2 = assessShipReadiness(invariantSummary, {minimumRuns: 3});
    assert.equal(gate2.verdict, HARNESS_VERDICTS.FAIL_CORE_INVARIANT);

    // 3. BLOCK_PERFORMANCE_REGRESSION (queue delay exceeded)
    const perfSummary = {
      totalRuns: 3,
      passedRuns: 3,
      failedRuns: 0,
      failureRate: 0,
      distributions: {
        failedOperations: {p95: 0},
        nonAdmissionAttemptErrors: {p95: 0},
        queueDelayP95Ms: {p95: 6000},
        undispatchedRatio: {p95: 0},
        timeoutWaits: {p95: 0},
      },
    };
    const gate3 = assessShipReadiness(perfSummary, {minimumRuns: 3});
    assert.equal(gate3.verdict, HARNESS_VERDICTS.BLOCK_PERFORMANCE_REGRESSION);
  });
});
