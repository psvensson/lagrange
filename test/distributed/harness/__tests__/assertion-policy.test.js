import assert from 'node:assert/strict';
import {test} from '../../../../src/test-helpers/tap.js';
import {evaluateAssertionPolicy} from '../assertion-policy.js';

const SAMPLE_LOAD_METRICS = Object.freeze({
  total: 100,
  success: 99,
  failed: 1,
  errors: 1,
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
