import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {
  parseSamplesNdjson,
  analyzeMemoryLeakSamples,
  analyzeMemoryLeakFromPlayback,
  calculateTailRssSlopeBytesPerMinute,
  normalizeLeakConfig,
} from '../memory-leak-analyzer.js';

const MS_PER_MINUTE = 60000;

function buildLinearSamples(options = {}) {
  const nodeId = options.nodeId || 'node-1';
  const startTimestamp = Number.isFinite(options.startTimestamp) ?
    options.startTimestamp :
    0;
  const sampleCount = Number.isInteger(options.sampleCount) ?
    options.sampleCount :
    10;
  const startBytes = Number.isFinite(options.startBytes) ?
    options.startBytes :
    1000;
  const stepBytes = Number.isFinite(options.stepBytes) ?
    options.stepBytes :
    100;
  const stepMs = Number.isFinite(options.stepMs) ?
    options.stepMs :
    MS_PER_MINUTE;
  const samples = [];
  for (let i = 0; i < sampleCount; i++) {
    samples.push({
      timestamp: startTimestamp + (i * stepMs),
      nodeId,
      processRssBytes: startBytes + (i * stepBytes),
    });
  }
  return samples;
}

describe('memory-leak-analyzer', () => {
  it('parseSamplesNdjson skips malformed and empty lines and counts the malformed skips', () => {
    const {samples, malformedLineCount} = parseSamplesNdjson([
      JSON.stringify({timestamp: 1, nodeId: 'node-1', processRssBytes: 10}),
      'not-json',
      '',
      '  ',
      JSON.stringify({timestamp: 2, nodeId: 'node-1', processRssBytes: 12}),
    ].join('\n'));

    assert.equal(samples.length, 2);
    assert.equal(samples[0].timestamp, 1);
    assert.equal(samples[1].processRssBytes, 12);
    assert.equal(malformedLineCount, 1);
  });

  it('does not reinterpret legacy container memory as process RSS', () => {
    const analysis = analyzeMemoryLeakSamples([
      {timestamp: 1, nodeId: 'node-1', memoryUsageBytes: 10},
      {timestamp: 2, nodeId: 'node-1', memoryUsageBytes: 12},
    ], {
      enabled: true,
      minSamplesPerNode: 2,
      minWarmupMs: 0,
      minAnalysisWindowMs: 1,
    });

    assert.equal(analysis.sampleCount, 0);
    assert.equal(analysis.analyzed, false);
  });

  it('rejects legacy ambiguous memory threshold names', () => {
    assert.throws(
      () => normalizeLeakConfig({maxPositiveSlopeBytesPerMin: 1}),
      /Legacy memory leak config field is not supported/u,
    );
  });

  it('analyzeMemoryLeakSamples returns disabled result when not enabled', () => {
    const analysis = analyzeMemoryLeakSamples([], {enabled: false});

    assert.equal(analysis.enabled, false);
    assert.equal(analysis.analyzed, false);
    assert.equal(analysis.leakDetected, false);
    assert.equal(analysis.nodeCount, 0);
  });

  it('analyzeMemoryLeakSamples flags sustained positive trend for leaking nodes', () => {
    const leakNodeSamples = buildLinearSamples({
      nodeId: 'node-1',
      sampleCount: 12,
      stepBytes: 3000,
    });
    const stableNodeSamples = buildLinearSamples({
      nodeId: 'node-2',
      sampleCount: 12,
      stepBytes: 20,
    });

    const analysis = analyzeMemoryLeakSamples(
      [...leakNodeSamples, ...stableNodeSamples],
      {
        enabled: true,
        minSamplesPerNode: 5,
        warmupFraction: 0,
        minWarmupMs: 0,
        minAnalysisWindowMs: 1,
        maxRssSlopeBytesPerMin: 500,
        minRssGrowthBytes: 4000,
        minPositiveDeltaRatio: 0.6,
      },
    );

    assert.equal(analysis.enabled, true);
    assert.equal(analysis.analyzed, true);
    assert.equal(analysis.nodeCount, 2);
    assert.equal(analysis.leakDetected, true);
    assert.deepEqual(analysis.leakingNodes, ['node-1']);
    assert.equal(analysis.leakingNodeCount, 1);
  });

  it(
    'analyzeMemoryLeakSamples marks nodes unanalyzed when post-warmup ' +
      'samples are insufficient',
    () => {
      const samples = buildLinearSamples({
        nodeId: 'node-1',
        sampleCount: 6,
        stepBytes: 1000,
      });

      const analysis = analyzeMemoryLeakSamples(samples, {
        enabled: true,
        minSamplesPerNode: 5,
        warmupFraction: 0.9,
        minWarmupMs: 0,
        minAnalysisWindowMs: 1,
        maxRssSlopeBytesPerMin: 100,
        minRssGrowthBytes: 100,
        minPositiveDeltaRatio: 0.6,
      });

      assert.equal(analysis.enabled, true);
      assert.equal(analysis.analyzed, false);
      assert.equal(analysis.leakDetected, false);
      assert.equal(analysis.nodes.length, 1);
      assert.equal(analysis.nodes[0].analyzed, false);
      assert.equal(analysis.nodes[0].reason, 'insufficient-post-warmup-samples');
    },
  );

  it('analyzeMemoryLeakFromPlayback reports missing samples path', async () => {
    const analysis = await analyzeMemoryLeakFromPlayback(
      {files: {}},
      {enabled: true},
    );

    assert.equal(analysis.enabled, true);
    assert.equal(analysis.analyzed, false);
    assert.equal(analysis.leakDetected, false);
    assert.ok(analysis.warnings.includes('samples-path-missing'));
  });

  it('analyzeMemoryLeakFromPlayback reads ndjson samples from manifest path', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'memory-leak-analyzer-'));
    const samplesPath = join(tempDir, 'samples.ndjson');
    const samples = buildLinearSamples({
      nodeId: 'node-1',
      sampleCount: 8,
      stepBytes: 10,
    });

    try {
      const content = [
        JSON.stringify(samples[0]),
        JSON.stringify(samples[1]),
        'malformed-line',
        ...samples.slice(2).map((sample) => JSON.stringify(sample)),
      ].join('\n');
      await writeFile(samplesPath, content, 'utf8');

      const analysis = await analyzeMemoryLeakFromPlayback(
        {
          files: {
            samples: samplesPath,
          },
        },
        {
          enabled: true,
          minSamplesPerNode: 5,
          warmupFraction: 0,
          minWarmupMs: 0,
          minAnalysisWindowMs: 1,
          maxRssSlopeBytesPerMin: 1000,
          minRssGrowthBytes: 1000,
          minPositiveDeltaRatio: 0.9,
        },
      );

      assert.equal(analysis.enabled, true);
      assert.equal(analysis.analyzed, true);
      assert.equal(analysis.sampleCount, 8);
      assert.equal(analysis.nodeCount, 1);
      assert.equal(analysis.leakDetected, false);
      assert.equal(analysis.samplesPath, samplesPath);
    } finally {
      await rm(tempDir, {recursive: true, force: true});
    }
  });

  it('classifies transient pressure when tail slope recovers', () => {
    // Simulate a spike-then-recovery pattern: memory grows sharply
    // in the first 70% of samples, then levels off in the last 30%.
    // Overall slope and growth exceed thresholds, but tail slope is
    // near zero — transient pressure, not a leak.
    const spikeCount = 14;
    const recoveryCount = 6;
    const samples = [];
    const startBytes = 100000000;
    const spikeStepBytes = 3000000;

    for (let i = 0; i < spikeCount; i++) {
      samples.push({
        timestamp: i * MS_PER_MINUTE,
        nodeId: 'node-spike',
        processRssBytes: startBytes + (i * spikeStepBytes),
      });
    }
    const peakBytes =
      startBytes + ((spikeCount - 1) * spikeStepBytes);
    for (let i = 0; i < recoveryCount; i++) {
      samples.push({
        timestamp: (spikeCount + i) * MS_PER_MINUTE,
        nodeId: 'node-spike',
        processRssBytes: peakBytes,
      });
    }

    const analysis = analyzeMemoryLeakSamples(samples, {
      enabled: true,
      minSamplesPerNode: 5,
      warmupFraction: 0,
      minWarmupMs: 0,
      minAnalysisWindowMs: 1,
      maxRssSlopeBytesPerMin: 500000,
      minRssGrowthBytes: 4000000,
      minPositiveDeltaRatio: 0.5,
    });

    assert.equal(analysis.enabled, true);
    assert.equal(analysis.analyzed, true);
    assert.equal(
      analysis.leakDetected,
      false,
      'Should not flag as leak when tail slope shows recovery',
    );
    assert.equal(analysis.nodeCount, 1);
    assert.equal(
      analysis.nodes[0].reason,
      'transient-pressure',
    );
    assert.equal(analysis.nodes[0].recoveryDetected, true);
    assert.equal(analysis.leakingNodeCount, 0);
  });

  it('still flags sustained leak when tail slope remains positive',
    () => {
      const samples = buildLinearSamples({
        nodeId: 'node-leak',
        sampleCount: 20,
        stepBytes: 3000000,
        startBytes: 100000000,
      });

      const analysis = analyzeMemoryLeakSamples(samples, {
        enabled: true,
        minSamplesPerNode: 5,
        warmupFraction: 0,
        minWarmupMs: 0,
        minAnalysisWindowMs: 1,
        maxRssSlopeBytesPerMin: 500000,
        minRssGrowthBytes: 4000000,
        minPositiveDeltaRatio: 0.5,
      });

      assert.equal(
        analysis.leakDetected,
        true,
        'Should flag as leak when tail slope is still positive',
      );
      assert.equal(
        analysis.nodes[0].reason,
        'sustained-positive-trend',
      );
      assert.equal(analysis.nodes[0].recoveryDetected, false);
      assert.equal(analysis.leakingNodeCount, 1);
    });

  it('calculateTailRssSlopeBytesPerMinute returns near-zero for flat tail',
    () => {
      const samples = [];
      const flatBytes = 200000000;
      for (let i = 0; i < 10; i++) {
        samples.push({
          timestamp: i * MS_PER_MINUTE,
          processRssBytes: flatBytes,
        });
      }
      const tailSlope = calculateTailRssSlopeBytesPerMinute(samples);
      assert.ok(
        Math.abs(tailSlope) < 1000,
        'Expected near-zero tail slope for flat data, ' +
        `got ${tailSlope}`,
      );
    });

  it('calculateTailRssSlopeBytesPerMinute returns positive for growing tail',
    () => {
      const samples = buildLinearSamples({
        nodeId: 'node-grow',
        sampleCount: 10,
        stepBytes: 2000000,
      });
      const tailSlope = calculateTailRssSlopeBytesPerMinute(samples);
      assert.ok(
        tailSlope > 0,
        'Expected positive tail slope for growing data, ' +
        `got ${tailSlope}`,
      );
    });
});
