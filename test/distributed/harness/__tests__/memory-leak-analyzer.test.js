import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {
  parseSamplesNdjson,
  analyzeMemoryLeakSamples,
  analyzeMemoryLeakFromPlayback,
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
  const memoryLimitBytes = Number.isFinite(options.memoryLimitBytes) ?
    options.memoryLimitBytes :
    500000;

  const samples = [];
  for (let i = 0; i < sampleCount; i++) {
    samples.push({
      timestamp: startTimestamp + (i * stepMs),
      nodeId,
      memoryUsageBytes: startBytes + (i * stepBytes),
      memoryLimitBytes,
    });
  }
  return samples;
}

describe('memory-leak-analyzer', () => {
  it('parseSamplesNdjson ignores malformed and empty lines', () => {
    const parsed = parseSamplesNdjson([
      JSON.stringify({timestamp: 1, nodeId: 'node-1', memoryUsageBytes: 10}),
      'not-json',
      '',
      '  ',
      JSON.stringify({timestamp: 2, nodeId: 'node-1', memoryUsageBytes: 12}),
    ].join('\n'));

    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].timestamp, 1);
    assert.equal(parsed[1].memoryUsageBytes, 12);
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
        maxPositiveSlopeBytesPerMin: 500,
        minGrowthBytes: 4000,
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
        maxPositiveSlopeBytesPerMin: 100,
        minGrowthBytes: 100,
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
          maxPositiveSlopeBytesPerMin: 1000,
          minGrowthBytes: 1000,
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
});
