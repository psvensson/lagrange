import assert from 'node:assert/strict';
import {test} from '../../../../src/test-helpers/tap.js';
import {evaluateAssertionPolicy} from '../assertion-policy.js';

const SAMPLE_LOAD_METRICS = Object.freeze({
  total: 100,
  success: 100,
  failed: 0,
  errors: 0,
  latency: {
    avg: 3,
    p50: 2,
    p95: 6,
    p99: 8,
  },
  opsPerSec: 50,
});

test('assertion policy maps hard failures to scenario failure', async () => {
  const result = evaluateAssertionPolicy({
    consistencyVerdict: 'inconsistent',
    loadMetrics: SAMPLE_LOAD_METRICS,
    policy: {
      insufficientEvidence: 'soft',
    },
  });

  assert.equal(result.passed, false);
  assert.equal(result.status, 'failed');
  assert.equal(result.verificationConfidence, 'low');
  assert.ok(result.hardFailures.length > 0, 'should include hard failure details');
});

test('assertion policy keeps soft failures as pass_with_warnings and preserves load metrics',
  async () => {
    const result = evaluateAssertionPolicy({
      consistencyVerdict: 'insufficient_evidence',
      loadMetrics: SAMPLE_LOAD_METRICS,
      policy: {
        insufficientEvidence: 'soft',
      },
    });

    assert.equal(result.passed, true);
    assert.equal(result.status, 'passed_with_warnings');
    assert.equal(result.verificationConfidence, 'medium');
    assert.ok(result.softWarnings.length > 0, 'should include soft warning details');
    assert.deepEqual(result.loadMetrics, SAMPLE_LOAD_METRICS);
  });

test('assertion policy can escalate insufficient evidence to hard failure', async () => {
  const result = evaluateAssertionPolicy({
    consistencyVerdict: 'insufficient_evidence',
    loadMetrics: SAMPLE_LOAD_METRICS,
    policy: {
      insufficientEvidence: 'hard',
    },
  });

  assert.equal(result.passed, false);
  assert.equal(result.status, 'failed');
  assert.equal(result.verificationConfidence, 'low');
  assert.ok(result.hardFailures.some((entry) =>
    entry.code === 'insufficient_evidence',
  ));
});

test('assertion policy hard-fails non-zero load operation errors', async () => {
  const result = evaluateAssertionPolicy({
    consistencyVerdict: 'consistent',
    loadMetrics: {
      ...SAMPLE_LOAD_METRICS,
      failed: 3,
      errors: 3,
    },
    policy: {
      insufficientEvidence: 'soft',
    },
  });

  assert.equal(result.passed, false);
  assert.equal(result.status, 'failed');
  assert.equal(result.verificationConfidence, 'low');
  assert.ok(result.hardFailures.some((entry) =>
    entry.code === 'load_operation_errors',
  ));
});

test('assertion policy hard-fails non-zero failed operations explicitly', async () => {
  const result = evaluateAssertionPolicy({
    consistencyVerdict: 'consistent',
    loadMetrics: {
      ...SAMPLE_LOAD_METRICS,
      failed: 2,
      errors: 0,
      attemptErrors: 5,
    },
    policy: {
      insufficientEvidence: 'soft',
    },
  });

  assert.equal(result.passed, false);
  assert.equal(result.status, 'failed');
  assert.equal(result.verificationConfidence, 'low');
  assert.ok(result.hardFailures.some((entry) =>
    entry.code === 'load_failed_operations',
  ));
});

test('assertion policy preserves attempt-level diagnostics as non-hard failures',
  async () => {
    const result = evaluateAssertionPolicy({
      consistencyVerdict: 'consistent',
      loadMetrics: {
        ...SAMPLE_LOAD_METRICS,
        failed: 0,
        errors: 0,
        attemptErrors: 7,
      },
      policy: {
        insufficientEvidence: 'soft',
      },
    });

    assert.equal(result.passed, true);
    assert.equal(result.status, 'passed');
    assert.equal(result.verificationConfidence, 'high');
    assert.equal(result.hardFailures.length, 0);
  });

test('assertion policy hard-fails hard invariant breaches', async () => {
  const result = evaluateAssertionPolicy({
    consistencyVerdict: 'consistent',
    invariants: [{
      invariantId: 'control_plane.partition_leader_discoverable',
      reasonCode: 'leadership_unknown_control_plane_partition',
      severity: 'critical',
      passed: false,
      entityId: 'seed-1',
      scope: 'partition',
      owningSubsystem: 'control-plane',
      observed: {},
      details: {},
    }],
    loadMetrics: SAMPLE_LOAD_METRICS,
    policy: {
      insufficientEvidence: 'soft',
    },
  });

  assert.equal(result.passed, false);
  assert.equal(result.status, 'failed');
  assert.ok(result.hardFailures.some((entry) =>
    entry.code === 'hard_invariant_breach',
  ));
  assert.equal(result.invariantBreaches.hardCount, 1);
});
