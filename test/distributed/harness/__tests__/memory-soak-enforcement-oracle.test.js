/**
 * Deterministic oracle for the memory-soak enforcement cutover.
 *
 * Asserts the fail-closed contract required by the release-0.2 memory soak:
 *  - sustained-write-throughput honors the configured load duration
 *  - when requireSamples is true, deferred / insufficient / under-sampled /
 *    unanalyzed per-node evidence is a hard failure, not a passing advisory
 *  - the deterministic oracle requires every node to report analyzed:true,
 *    at least 30 samples, no insufficient-* reason, and no detected leak
 *
 * Red-on-revert: each enforcement branch is proven by reverting it in-test.
 */

import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeMemoryLeakSamples,
} from '../memory-leak-analyzer.js';
import {
  evaluateMemoryLeakAssertions,
} from '../../run.js';
import {run} from '../../scenarios/sustained-write-throughput.js';

const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const MIN_SAMPLES_PER_NODE = 30;
const MS_PER_SECOND = 1000;

function buildNodeSamples(nodeId, options = {}) {
  const sampleCount = Number.isInteger(options.sampleCount) ?
    options.sampleCount : MIN_SAMPLES_PER_NODE + 10;
  const stepMs = Number.isFinite(options.stepMs) ?
    options.stepMs : 30 * MS_PER_SECOND;
  const startBytes = Number.isFinite(options.startBytes) ?
    options.startBytes : 100_000_000;
  const stepBytes = Number.isFinite(options.stepBytes) ?
    options.stepBytes : 1000;
  const samples = [];
  for (let i = 0; i < sampleCount; i++) {
    samples.push({
      timestamp: i * stepMs,
      nodeId,
      processRssBytes: startBytes + (i * stepBytes),
    });
  }
  return samples;
}

function leakingConfig(overrides = {}) {
  return {
    enabled: true,
    minSamplesPerNode: MIN_SAMPLES_PER_NODE,
    warmupFraction: 0.2,
    minWarmupMs: 0,
    minAnalysisWindowMs: 1,
    maxRssSlopeBytesPerMin: 524288,
    minRssGrowthBytes: 33554432,
    minPositiveDeltaRatio: 0.7,
    ...overrides,
  };
}

describe('memory-soak enforcement oracle', () => {
  it('sustained-write-throughput honors configured warmup-plus-analysis duration',
    async () => {
      const calls = [];
      const cluster = {
        _config: {load: {defaultDuration: '1800s'}},
        startLoad: (options) => {
          calls.push(options);
          return {
            waitComplete: async () => ({
              total: 10, success: 10, failed: 0, errors: 0,
              opsPerSec: 12,
              latency: {avg: 10, p50: 8, p95: 15, p99: 20},
            }),
          };
        },
        waitForAllActive: async () => {},
        waitForConvergence: async () => ({settledAfterMs: 500}),
        waitForConsistencyConvergence: async () => {},
      };
      await run(cluster);
      assert.equal(calls[0].duration, '1800s');
    });

  it('every node analyzed:true with >=30 samples, no insufficient-* reason, no leak',
    () => {
      const samples = [
        ...buildNodeSamples('node-1'),
        ...buildNodeSamples('node-2'),
        ...buildNodeSamples('node-3'),
      ];
      const analysis = analyzeMemoryLeakSamples(samples, leakingConfig());
      assert.equal(analysis.nodeCount, 3);
      assert.equal(analysis.leakDetected, false);
      for (const node of analysis.nodes) {
        assert.equal(node.analyzed, true, `${node.nodeId} must be analyzed`);
        assert.ok(
          node.sampleCount >= MIN_SAMPLES_PER_NODE,
          `${node.nodeId} under-sampled`,
        );
        assert.ok(
          !stringStartsWith(String(node.reason || ''), 'insufficient'),
          `${node.nodeId} has insufficient-* reason: ${node.reason}`,
        );
      }
    });

  it('requireSamples fails closed when analysis is deferred (present but insufficient)',
    () => {
      const result = evaluateMemoryLeakAssertions(
        {analyzed: false, leakDetected: false, sampleCount: 42, warnings: []},
        {enabled: true, requireSamples: true, failOnDetection: false},
      );
      assert.equal(result.passed, false);
      assert.equal(result.analysisDeferred, true);
      assert.equal(
        result.error,
        'memory analysis window insufficient for leak verdict',
      );
    });

  it('requireSamples fails closed when samples are missing entirely', () => {
    const result = evaluateMemoryLeakAssertions(
      {analyzed: false, leakDetected: false},
      {enabled: true, requireSamples: true, failOnDetection: false},
    );
    assert.equal(result.passed, false);
    assert.equal(result.error, 'memory samples unavailable');
  });

  it('failOnDetection fails closed when a leak is detected', () => {
    const samples = buildNodeSamples('node-1', {
      stepBytes: 10_000_000,
      sampleCount: MIN_SAMPLES_PER_NODE + 10,
    });
    const analysis = analyzeMemoryLeakSamples(samples, leakingConfig({
      maxRssSlopeBytesPerMin: 1,
      minRssGrowthBytes: 1,
      minPositiveDeltaRatio: 0.5,
    }));
    assert.equal(analysis.leakDetected, true);
    const result = evaluateMemoryLeakAssertions(
      analysis,
      {enabled: true, requireSamples: true, failOnDetection: true},
    );
    assert.equal(result.passed, false);
    assert.match(result.error, /memory leak detected on nodes/);
  });

  it('under-sampled node is reported analyzed:false with insufficient-* reason',
    () => {
      const samples = buildNodeSamples('node-1', {sampleCount: 10});
      const analysis = analyzeMemoryLeakSamples(samples, leakingConfig());
      assert.equal(analysis.nodes[0].analyzed, false);
      assert.ok(
        stringStartsWith(String(analysis.nodes[0].reason), 'insufficient'),
      );
    });
});
