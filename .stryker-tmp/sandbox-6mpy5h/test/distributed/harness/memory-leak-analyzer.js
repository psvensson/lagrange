/**
 * Memory leak analyzer for distributed harness playback samples.
 *
 * Consumes samples.ndjson and flags sustained post-warmup positive memory
 * trends using slope + growth + monotonicity signals.
 */
// @ts-nocheck


import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {LEAK_DEFAULTS} from './constants.js';

const NEWLINE = '\n';
const ZERO = 0;
const ONE = 1;
const MS_PER_MINUTE = 60000;
const UNKNOWN_NODE_ID = 'unknown-node';
const TAIL_FRACTION = 0.3;
const RECOVERY_SLOPE_RATIO = 0.25;

/**
 * Normalize memory leak config.
 * @param {Object} options
 * @return {Object}
 */
function normalizeLeakConfig(options = {}) {
  const minSamplesPerNode = normalizePositiveInteger(
    options.minSamplesPerNode,
    LEAK_DEFAULTS.minSamplesPerNode,
  );
  const warmupFraction = normalizeBoundedFraction(
    options.warmupFraction,
    LEAK_DEFAULTS.warmupFraction,
  );
  const minWarmupMs = normalizeNonNegativeInteger(
    options.minWarmupMs,
    LEAK_DEFAULTS.minWarmupMs,
  );
  const minAnalysisWindowMs = normalizeNonNegativeInteger(
    options.minAnalysisWindowMs,
    LEAK_DEFAULTS.minAnalysisWindowMs,
  );
  const maxPositiveSlopeBytesPerMin = normalizeNonNegativeNumber(
    options.maxPositiveSlopeBytesPerMin,
    LEAK_DEFAULTS.maxPositiveSlopeBytesPerMin,
  );
  const minGrowthBytes = normalizeNonNegativeNumber(
    options.minGrowthBytes,
    LEAK_DEFAULTS.minGrowthBytes,
  );
  const minPositiveDeltaRatio = normalizeBoundedFraction(
    options.minPositiveDeltaRatio,
    LEAK_DEFAULTS.minPositiveDeltaRatio,
  );

  return {
    enabled: options.enabled !== false,
    failOnDetection: options.failOnDetection !== false,
    requireSamples: options.requireSamples === true,
    minSamplesPerNode,
    warmupFraction,
    minWarmupMs,
    minAnalysisWindowMs,
    maxPositiveSlopeBytesPerMin,
    minGrowthBytes,
    minPositiveDeltaRatio,
    captureHeapArtifacts: options.captureHeapArtifacts === true,
    heapSnapshotNearLimitCount: normalizePositiveInteger(
      options.heapSnapshotNearLimitCount,
      LEAK_DEFAULTS.heapSnapshotNearLimitCount,
    ),
  };
}

/**
 * Analyze samples for memory leak signals.
 * @param {Array<Object>} samples
 * @param {Object} options
 * @return {Object}
 */
function analyzeMemoryLeakSamples(samples, options = {}) {
  const config = normalizeLeakConfig(options);
  if (!config.enabled) {
    return {
      enabled: false,
      analyzed: false,
      leakDetected: false,
      sampleCount: ZERO,
      nodeCount: ZERO,
      leakingNodeCount: ZERO,
      leakingNodes: [],
      nodes: [],
      warnings: [],
      config,
    };
  }

  const normalizedSamples = Array.isArray(samples) ?
    samples
      .map((sample) => normalizeSample(sample))
      .filter((sample) => sample !== null) :
    [];
  const samplesByNode = groupSamplesByNode(normalizedSamples);
  const nodeResults = [];

  for (const [nodeId, nodeSamples] of samplesByNode.entries()) {
    nodeResults.push(analyzeNodeMemoryTrend(
      nodeId,
      nodeSamples,
      config,
    ));
  }
  nodeResults.sort((left, right) => left.nodeId.localeCompare(right.nodeId));

  const leakingNodes = nodeResults
    .filter((node) => node.leakDetected)
    .map((node) => node.nodeId);
  const analyzedNodeCount = nodeResults.filter((node) => node.analyzed).length;

  return {
    enabled: true,
    analyzed: analyzedNodeCount > ZERO,
    leakDetected: leakingNodes.length > ZERO,
    sampleCount: normalizedSamples.length,
    nodeCount: nodeResults.length,
    leakingNodeCount: leakingNodes.length,
    leakingNodes,
    nodes: nodeResults,
    warnings: [],
    config,
  };
}

/**
 * Analyze memory leak trends from playback manifest samples file.
 * @param {Object|null} playbackManifest
 * @param {Object} options
 * @return {Promise<Object>}
 */
async function analyzeMemoryLeakFromPlayback(playbackManifest, options = {}) {
  const config = normalizeLeakConfig(options);
  if (!config.enabled) {
    return {
      enabled: false,
      analyzed: false,
      leakDetected: false,
      sampleCount: ZERO,
      nodeCount: ZERO,
      leakingNodeCount: ZERO,
      leakingNodes: [],
      nodes: [],
      warnings: [],
      config,
    };
  }

  const samplesPathCandidate = playbackManifest?.files?.samples ||
    playbackManifest?.samplesPath ||
    null;
  if (!samplesPathCandidate) {
    return {
      enabled: true,
      analyzed: false,
      leakDetected: false,
      sampleCount: ZERO,
      nodeCount: ZERO,
      leakingNodeCount: ZERO,
      leakingNodes: [],
      nodes: [],
      warnings: ['samples-path-missing'],
      error: 'Playback samples artifact is missing',
      samplesPath: null,
      config,
    };
  }

  const samplesPath = resolve(String(samplesPathCandidate));
  let raw;
  try {
    raw = await readFile(samplesPath, 'utf8');
  } catch (error) {
    return {
      enabled: true,
      analyzed: false,
      leakDetected: false,
      sampleCount: ZERO,
      nodeCount: ZERO,
      leakingNodeCount: ZERO,
      leakingNodes: [],
      nodes: [],
      warnings: ['samples-read-failed'],
      error: error.message,
      samplesPath,
      config,
    };
  }

  const samples = parseSamplesNdjson(raw);
  const analysis = analyzeMemoryLeakSamples(samples, config);
  return {
    ...analysis,
    samplesPath,
  };
}

/**
 * Parse NDJSON into sample objects.
 * @param {string} content
 * @return {Array<Object>}
 */
function parseSamplesNdjson(content) {
  const samples = [];
  const lines = String(content || '').split(NEWLINE);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      samples.push(JSON.parse(trimmed));
    } catch (_error) {
      // Skip malformed lines; analysis should be best-effort.
    }
  }
  return samples;
}

/**
 * Normalize one sample row.
 * @param {Object} sample
 * @return {Object|null}
 */
function normalizeSample(sample) {
  if (!sample || typeof sample !== 'object') {
    return null;
  }
  const timestamp = Number(sample.timestamp);
  const memoryUsageBytes = Number(sample.memoryUsageBytes);
  if (!Number.isFinite(timestamp) || !Number.isFinite(memoryUsageBytes)) {
    return null;
  }
  if (memoryUsageBytes < ZERO) {
    return null;
  }
  const nodeId = String(sample.nodeId || sample.node_id || UNKNOWN_NODE_ID);
  const memoryLimitBytes = Number(sample.memoryLimitBytes);
  return {
    timestamp,
    nodeId,
    memoryUsageBytes,
    memoryLimitBytes: Number.isFinite(memoryLimitBytes) ?
      memoryLimitBytes :
      null,
  };
}

/**
 * Group samples by node ID.
 * @param {Array<Object>} samples
 * @return {Map<string, Array<Object>>}
 */
function groupSamplesByNode(samples) {
  const grouped = new Map();
  for (const sample of samples) {
    if (!grouped.has(sample.nodeId)) {
      grouped.set(sample.nodeId, []);
    }
    grouped.get(sample.nodeId).push(sample);
  }
  for (const nodeSamples of grouped.values()) {
    nodeSamples.sort((left, right) => left.timestamp - right.timestamp);
  }
  return grouped;
}

/**
 * Analyze one node's memory trend.
 * @param {string} nodeId
 * @param {Array<Object>} samples
 * @param {Object} config
 * @return {Object}
 */
function analyzeNodeMemoryTrend(nodeId, samples, config) {
  const sampleCount = samples.length;
  if (sampleCount < config.minSamplesPerNode) {
    return {
      nodeId,
      analyzed: false,
      leakDetected: false,
      reason: 'insufficient-samples',
      sampleCount,
    };
  }

  const first = samples[ZERO];
  const last = samples[sampleCount - ONE];
  const durationMs = last.timestamp - first.timestamp;
  if (durationMs <= ZERO) {
    return {
      nodeId,
      analyzed: false,
      leakDetected: false,
      reason: 'invalid-sample-window',
      sampleCount,
    };
  }

  const warmupByFractionMs = durationMs * config.warmupFraction;
  const warmupMs = Math.max(config.minWarmupMs, warmupByFractionMs);
  const analysisStartTimestamp = first.timestamp + warmupMs;
  const analysisSamples = samples.filter(
    (sample) => sample.timestamp >= analysisStartTimestamp,
  );
  if (analysisSamples.length < config.minSamplesPerNode) {
    return {
      nodeId,
      analyzed: false,
      leakDetected: false,
      reason: 'insufficient-post-warmup-samples',
      sampleCount,
      postWarmupSampleCount: analysisSamples.length,
    };
  }

  const analysisFirst = analysisSamples[ZERO];
  const analysisLast = analysisSamples[analysisSamples.length - ONE];
  const analysisWindowMs = analysisLast.timestamp - analysisFirst.timestamp;
  if (analysisWindowMs < config.minAnalysisWindowMs) {
    return {
      nodeId,
      analyzed: false,
      leakDetected: false,
      reason: 'analysis-window-too-short',
      sampleCount,
      postWarmupSampleCount: analysisSamples.length,
      analysisWindowMs,
    };
  }

  const slopeBytesPerMin = calculateSlopeBytesPerMinute(analysisSamples);
  const growthBytes =
    analysisLast.memoryUsageBytes - analysisFirst.memoryUsageBytes;
  const growthPercent = analysisFirst.memoryUsageBytes > ZERO ?
    (growthBytes / analysisFirst.memoryUsageBytes) * 100 :
    null;
  const positiveDeltaRatio = calculatePositiveDeltaRatio(analysisSamples);
  const maxMemoryUsageBytes = Math.max(
    ...analysisSamples.map((sample) => sample.memoryUsageBytes),
  );
  const memoryLimitBytes = firstFiniteValue(
    analysisSamples.map((sample) => sample.memoryLimitBytes),
  );
  const maxMemoryUsagePercent = Number.isFinite(memoryLimitBytes) &&
    memoryLimitBytes > ZERO ?
    (maxMemoryUsageBytes / memoryLimitBytes) * 100 :
    null;

  const leakDetected = slopeBytesPerMin > config.maxPositiveSlopeBytesPerMin &&
    growthBytes > config.minGrowthBytes &&
    positiveDeltaRatio >= config.minPositiveDeltaRatio;

  const tailSlopeBytesPerMin = calculateTailSlopeBytesPerMinute(
    analysisSamples,
  );
  const recoveryDetected = leakDetected &&
    tailSlopeBytesPerMin <= slopeBytesPerMin * RECOVERY_SLOPE_RATIO;
  const effectiveLeakDetected = leakDetected && !recoveryDetected;
  const reason = effectiveLeakDetected ?
    'sustained-positive-trend' :
    recoveryDetected ?
      'transient-pressure' :
      'within-thresholds';

  return {
    nodeId,
    analyzed: true,
    leakDetected: effectiveLeakDetected,
    reason,
    sampleCount,
    postWarmupSampleCount: analysisSamples.length,
    analysisWindowMs,
    slopeBytesPerMin,
    tailSlopeBytesPerMin,
    growthBytes,
    growthPercent,
    positiveDeltaRatio,
    maxMemoryUsageBytes,
    maxMemoryUsagePercent,
    recoveryDetected,
  };
}

/**
 * Calculate linear regression slope for memory usage over time.
 * @param {Array<Object>} samples
 * @return {number}
 */
function calculateSlopeBytesPerMinute(samples) {
  if (!Array.isArray(samples) || samples.length < 2) {
    return ZERO;
  }

  const origin = samples[ZERO].timestamp;
  let sumX = ZERO;
  let sumY = ZERO;
  let sumXY = ZERO;
  let sumX2 = ZERO;

  for (const sample of samples) {
    const x = sample.timestamp - origin;
    const y = sample.memoryUsageBytes;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }

  const n = samples.length;
  const denominator = (n * sumX2) - (sumX * sumX);
  if (denominator <= ZERO) {
    return ZERO;
  }

  const slopeBytesPerMs = ((n * sumXY) - (sumX * sumY)) / denominator;
  return slopeBytesPerMs * MS_PER_MINUTE;
}

/**
 * Ratio of positive memory deltas across adjacent samples.
 * @param {Array<Object>} samples
 * @return {number}
 */
function calculatePositiveDeltaRatio(samples) {
  if (!Array.isArray(samples) || samples.length < 2) {
    return ZERO;
  }

  let positiveCount = ZERO;
  const intervalCount = samples.length - ONE;
  for (let i = ONE; i < samples.length; i++) {
    const delta = samples[i].memoryUsageBytes - samples[i - ONE].memoryUsageBytes;
    if (delta > ZERO) {
      positiveCount++;
    }
  }
  return intervalCount > ZERO ? positiveCount / intervalCount : ZERO;
}

/**
 * Calculate linear regression slope for the tail portion of samples.
 * Uses the last TAIL_FRACTION of the analysis window to detect
 * whether memory growth has recovered (slope near zero or negative)
 * after an initial transient spike.
 * @param {Array<Object>} samples
 * @return {number}
 */
function calculateTailSlopeBytesPerMinute(samples) {
  if (!Array.isArray(samples) || samples.length < 2) {
    return ZERO;
  }
  const tailStartIndex = Math.max(
    ZERO,
    Math.floor(samples.length * (ONE - TAIL_FRACTION)),
  );
  const tailSamples = samples.slice(tailStartIndex);
  if (tailSamples.length < 2) {
    return ZERO;
  }
  return calculateSlopeBytesPerMinute(tailSamples);
}

/**
 * Return first finite number from the input list.
 * @param {Array<*>} values
 * @return {number|null}
 */
function firstFiniteValue(values) {
  for (const value of values) {
    if (Number.isFinite(value)) {
      return Number(value);
    }
  }
  return null;
}

function normalizePositiveInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric <= ZERO) {
    return fallback;
  }
  return numeric;
}

function normalizeNonNegativeInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < ZERO) {
    return fallback;
  }
  return numeric;
}

function normalizeNonNegativeNumber(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < ZERO) {
    return fallback;
  }
  return numeric;
}

function normalizeBoundedFraction(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < ZERO || numeric > ONE) {
    return fallback;
  }
  return numeric;
}

export {
  normalizeLeakConfig,
  parseSamplesNdjson,
  analyzeMemoryLeakSamples,
  analyzeMemoryLeakFromPlayback,
  calculateSlopeBytesPerMinute,
  calculatePositiveDeltaRatio,
  calculateTailSlopeBytesPerMinute,
};
