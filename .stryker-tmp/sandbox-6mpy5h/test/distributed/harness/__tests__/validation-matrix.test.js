// @ts-nocheck
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  extractNodeJoinLoadMetrics,
  summarizeValidationRuns,
  assessShipReadiness,
} from '../validation-matrix.js';

describe('validation-matrix helpers', () => {
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
});
