/**
 * Memory leak analyzer for distributed harness playback samples.
 *
 * Consumes samples.ndjson and flags sustained post-warmup positive memory
 * trends using slope + growth + monotonicity signals.
 */

import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {LEAK_DEFAULTS} from './constants.js';

const NEWLINE = '\n';
const ZERO = 0;
const ONE = 1;
const MS_PER_MINUTE = 60000;
const UNKNOWN_NODE_ID = 'unknown-node';
const MEMORY_LEAK_METRIC = 'process_rss_bytes';
const MALFORMED_SAMPLE_LINE_WARNING_PREFIX = 'malformed-sample-lines:';
const TAIL_FRACTION = 0.3;
const RECOVERY_SLOPE_RATIO = 0.25;
const objectHasOwn = Object.hasOwn;
const stringSplit = Function.call.bind(String.prototype.split);
const stringTrim = Function.call.bind(String.prototype.trim);
const LEGACY_MEMORY_LEAK_CONFIG_FIELDS = Object.freeze([
  'maxPositiveSlopeBytesPerMin',
  'minGrowthBytes',
]);

/**
 * Normalize memory leak config.
 * @param {Object} options
 * @return {Object}
 */
function normalizeLeakConfig(options = {}) {
  for (const field of LEGACY_MEMORY_LEAK_CONFIG_FIELDS) {
    if (objectHasOwn(options, field)) {
      throw new TypeError(
        'Legacy memory leak config field is not supported: ' + field,
      );
    }
  }
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
  const maxRssSlopeBytesPerMin = normalizeNonNegativeNumber(
    options.maxRssSlopeBytesPerMin,
    LEAK_DEFAULTS.maxRssSlopeBytesPerMin,
  );
  const minRssGrowthBytes = normalizeNonNegativeNumber(
    options.minRssGrowthBytes,
    LEAK_DEFAULTS.minRssGrowthBytes,
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
    maxRssSlopeBytesPerMin,
    minRssGrowthBytes,
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
      metric: MEMORY_LEAK_METRIC,
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
    metric: MEMORY_LEAK_METRIC,
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
      metric: MEMORY_LEAK_METRIC,
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
      metric: MEMORY_LEAK_METRIC,
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
      metric: MEMORY_LEAK_METRIC,
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

  const {samples, malformedLineCount} = parseSamplesNdjson(raw);
  const analysis = analyzeMemoryLeakSamples(samples, config);
  const warnings = malformedLineCount > ZERO ?
    [...analysis.warnings,
      MALFORMED_SAMPLE_LINE_WARNING_PREFIX + malformedLineCount] :
    analysis.warnings;
  return {
    ...analysis,
    warnings,
    samplesPath,
  };
}

/**
 * Parse NDJSON into sample objects, counting skipped malformed lines so the
 * suppression stays observable in the analysis warnings.
 * @param {string} content
 * @return {{samples: Array<Object>, malformedLineCount: number}}
 */
function parseSamplesNdjson(content) {
  const samples = [];
  let malformedLineCount = ZERO;
  const lines = stringSplit(String(content || ''), NEWLINE);
  for (const line of lines) {
    const trimmed = stringTrim(line);
    if (!trimmed) {
      continue;
    }
    try {
      samples.push(JSON.parse(trimmed));
    } catch (_error) {
      // Skip malformed lines; analysis should be best-effort, but the skip
      // is counted into a typed warning instead of vanishing.
      malformedLineCount += ONE;
    }
  }
  return {samples, malformedLineCount};
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
  const processRssBytes = Number(sample.processRssBytes);
  if (!Number.isFinite(timestamp) || !Number.isFinite(processRssBytes)) {
    return null;
  }
  if (processRssBytes < ZERO) {
    return null;
  }
  const nodeId = String(sample.nodeId || sample.node_id || UNKNOWN_NODE_ID);
  return {
    timestamp,
    nodeId,
    processRssBytes,
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
  const identity = {
    nodeId,
    metric: MEMORY_LEAK_METRIC,
  };
  const sampleCount = samples.length;
  if (sampleCount < config.minSamplesPerNode) {
    return {
      ...identity,
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
      ...identity,
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
      ...identity,
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
      ...identity,
      analyzed: false,
      leakDetected: false,
      reason: 'analysis-window-too-short',
      sampleCount,
      postWarmupSampleCount: analysisSamples.length,
      analysisWindowMs,
    };
  }

  const rssSlopeBytesPerMin = calculateRssSlopeBytesPerMinute(analysisSamples);
  const rssGrowthBytes =
    analysisLast.processRssBytes - analysisFirst.processRssBytes;
  const rssGrowthPercent = analysisFirst.processRssBytes > ZERO ?
    (rssGrowthBytes / analysisFirst.processRssBytes) * 100 :
    null;
  const positiveDeltaRatio = calculatePositiveDeltaRatio(analysisSamples);
  const maxProcessRssBytes = Math.max(
    ...analysisSamples.map((sample) => sample.processRssBytes),
  );

  const leakDetected =
    rssSlopeBytesPerMin > config.maxRssSlopeBytesPerMin &&
    rssGrowthBytes > config.minRssGrowthBytes &&
    positiveDeltaRatio >= config.minPositiveDeltaRatio;

  const tailRssSlopeBytesPerMin = calculateTailRssSlopeBytesPerMinute(
    analysisSamples,
  );
  const recoveryDetected = leakDetected &&
    tailRssSlopeBytesPerMin <=
      rssSlopeBytesPerMin * RECOVERY_SLOPE_RATIO;
  const effectiveLeakDetected = leakDetected && !recoveryDetected;
  const reason = effectiveLeakDetected ?
    'sustained-positive-trend' :
    recoveryDetected ?
      'transient-pressure' :
      'within-thresholds';

  return {
    ...identity,
    analyzed: true,
    leakDetected: effectiveLeakDetected,
    reason,
    sampleCount,
    postWarmupSampleCount: analysisSamples.length,
    analysisWindowMs,
    rssSlopeBytesPerMin,
    tailRssSlopeBytesPerMin,
    rssGrowthBytes,
    rssGrowthPercent,
    positiveDeltaRatio,
    maxProcessRssBytes,
    recoveryDetected,
  };
}

/**
 * Calculate linear regression slope for memory usage over time.
 * @param {Array<Object>} samples
 * @return {number}
 */
function calculateRssSlopeBytesPerMinute(samples) {
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
    const y = sample.processRssBytes;
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
    const delta = samples[i].processRssBytes - samples[i - ONE].processRssBytes;
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
function calculateTailRssSlopeBytesPerMinute(samples) {
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
  return calculateRssSlopeBytesPerMinute(tailSamples);
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
  calculateRssSlopeBytesPerMinute,
  calculatePositiveDeltaRatio,
  calculateTailRssSlopeBytesPerMinute,
};
