import {
  appendOwnArrayValue,
  digestBenchmarkSemanticData,
  isDenseDataArray,
  isNonNegativeSafeInteger,
  isNonNegativeSafeNumber,
} from './benchmark-semantic-integrity.js';
import {
  BENCHMARK_CAPACITY_MEASUREMENT_STATE,
  BENCHMARK_CAPACITY_PERCENTILE_P50,
  BENCHMARK_CAPACITY_PERCENTILE_P95,
  BENCHMARK_CAPACITY_PERCENTILE_P99,
  BENCHMARK_CAPACITY_PRACTICAL_CLASSIFICATION,
  BENCHMARK_CAPACITY_RATIO_IDENTITY,
  BENCHMARK_CAPACITY_REASON,
  BENCHMARK_CAPACITY_STOP_DECISION,
} from './benchmark-capacity-protocol-constants.js';
import {
  inspectBenchmarkCapacityRunSample,
} from './benchmark-capacity-run-sample.js';
import {
  inspectBenchmarkCapacityPreregistration,
} from './benchmark-capacity-preregistration.js';

const mathCeil = Math.ceil;
const mathFloor = Math.floor;
const mathImul = Math.imul;
const mathMax = Math.max;
const mathMin = Math.min;
const numberIsFinite = Number.isFinite;
const objectKeys = Object.keys;
const arraySort = Function.call.bind(Array.prototype.sort);
const MapConstructor = Map;
const mapGet = Function.call.bind(Map.prototype.get);
const mapHas = Function.call.bind(Map.prototype.has);
const mapSet = Function.call.bind(Map.prototype.set);
const numericAscending = (left, right) => left - right;

function fail(message) {
  throw new TypeError(`invalid capacity matrix: ${message}`);
}

function appendReason(reasons, reason) {
  for (let index = 0; index < reasons.length; index += 1) {
    if (reasons[index] === reason) {
      return;
    }
  }
  appendOwnArrayValue(reasons, reason);
}

function sortedNumbers(values) {
  if (!isDenseDataArray(values)) {
    fail('dense numeric samples required');
  }
  const sorted = [];
  for (let index = 0; index < values.length; index += 1) {
    if (!isNonNegativeSafeNumber(values[index])) {
      fail(`unsafe numeric sample at ${index}`);
    }
    appendOwnArrayValue(sorted, values[index]);
  }
  arraySort(sorted, numericAscending);
  return sorted;
}

function quantile(values, probability) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = sortedNumbers(values);
  const index = mathMax(
    0,
    mathMin(
      sorted.length - 1,
      mathCeil(probability * sorted.length) - 1,
    ),
  );
  return sorted[index];
}

function median(values) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = sortedNumbers(values);
  const midpoint = mathFloor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[midpoint];
  }
  const estimate = (sorted[midpoint - 1] + sorted[midpoint]) / 2;
  if (!isNonNegativeSafeNumber(estimate)) {
    fail('unsafe median');
  }
  return estimate;
}

function createMulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = mathImul(value ^ (value >>> 15), value | 1);
    value ^= value + mathImul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function percentileInterval(values, confidenceLevel) {
  const sorted = sortedNumbers(values);
  if (sorted.length === 0) {
    return {lower: 0, upper: 0};
  }
  const alpha = 1 - confidenceLevel;
  return {
    lower: quantile(sorted, alpha / 2),
    upper: quantile(sorted, 1 - (alpha / 2)),
  };
}

function bootstrapMedianInterval(
  values,
  confidenceLevel,
  resamples,
  seed,
) {
  if (values.length === 0) {
    return {estimate: 0, lower: 0, upper: 0};
  }
  const random = createMulberry32(seed);
  const estimates = [];
  for (let sampleIndex = 0; sampleIndex < resamples; sampleIndex += 1) {
    const resample = [];
    for (let index = 0; index < values.length; index += 1) {
      const sourceIndex = mathFloor(random() * values.length);
      appendOwnArrayValue(resample, values[sourceIndex]);
    }
    appendOwnArrayValue(estimates, median(resample));
  }
  const interval = percentileInterval(estimates, confidenceLevel);
  return {
    estimate: median(values),
    lower: interval.lower,
    upper: interval.upper,
  };
}

function summarizeRunSample(sample, sealed) {
  const inspection = inspectBenchmarkCapacityRunSample(sample);
  if (!inspection.valid) {
    fail(`run sample failed integrity: ${inspection.reason}`);
  }
  const tailSampleSufficient =
    sample.endToEndLatencyMs.length >=
    sealed.sampling.tailSampleMinimum;
  const quantilesMs = {
    p50: quantile(
      sample.endToEndLatencyMs,
      BENCHMARK_CAPACITY_PERCENTILE_P50,
    ),
    p95: quantile(
      sample.endToEndLatencyMs,
      BENCHMARK_CAPACITY_PERCENTILE_P95,
    ),
    p99: quantile(
      sample.endToEndLatencyMs,
      BENCHMARK_CAPACITY_PERCENTILE_P99,
    ),
  };
  const sloPassed =
    tailSampleSufficient &&
    quantilesMs.p99 <= sealed.slo.maxP99LatencyMs &&
    sample.errorRate <= sealed.slo.maxErrorRate;
  return {
    blockIndex: sample.blockIndex,
    sideId: sample.sideId,
    offeredLoadPerSecond: sample.offeredLoadPerSecond,
    correctThroughputPerSecond: sample.correctThroughputPerSecond,
    errorRate: sample.errorRate,
    quantilesMs,
    tailSampleCount: sample.endToEndLatencyMs.length,
    tailSampleSufficient,
    sloPassed,
    counts: sample.counts,
    rejectedByReason: sample.rejectedByReason,
    sampleDigest: sample.sampleDigest,
  };
}

function expectedSampleCount(sealed, completedBlocks) {
  return completedBlocks *
    sealed.sideIds.length *
    sealed.offeredLoadPerSecond.length;
}

function summaryIndex(summaries) {
  const byBlock = new MapConstructor();
  const bySideLoad = new MapConstructor();
  for (let index = 0; index < summaries.length; index += 1) {
    const summary = summaries[index];
    let block = mapGet(byBlock, summary.blockIndex);
    if (block === undefined) {
      block = new MapConstructor();
      mapSet(byBlock, summary.blockIndex, block);
    }
    let blockSide = mapGet(block, summary.sideId);
    if (blockSide === undefined) {
      blockSide = new MapConstructor();
      mapSet(block, summary.sideId, blockSide);
    }
    if (mapHas(blockSide, summary.offeredLoadPerSecond)) {
      fail(BENCHMARK_CAPACITY_REASON.INCOMPLETE_MATRIX);
    }
    mapSet(blockSide, summary.offeredLoadPerSecond, summary);
    let side = mapGet(bySideLoad, summary.sideId);
    if (side === undefined) {
      side = new MapConstructor();
      mapSet(bySideLoad, summary.sideId, side);
    }
    let sideLoad = mapGet(side, summary.offeredLoadPerSecond);
    if (sideLoad === undefined) {
      sideLoad = [];
      mapSet(side, summary.offeredLoadPerSecond, sideLoad);
    }
    appendOwnArrayValue(sideLoad, summary);
  }
  return {byBlock, bySideLoad};
}

function assertMatrixComplete(summaries, index, sealed, completedBlocks) {
  if (
    !isDenseDataArray(summaries) ||
    summaries.length !== expectedSampleCount(sealed, completedBlocks)
  ) {
    fail(BENCHMARK_CAPACITY_REASON.INCOMPLETE_MATRIX);
  }
  for (let blockIndex = 0; blockIndex < completedBlocks; blockIndex += 1) {
    for (let loadIndex = 0;
      loadIndex < sealed.offeredLoadPerSecond.length;
      loadIndex += 1) {
      const offeredLoad = sealed.offeredLoadPerSecond[loadIndex];
      for (let sideIndex = 0;
        sideIndex < sealed.sideIds.length;
        sideIndex += 1) {
        const sideId = sealed.sideIds[sideIndex];
        const block = mapGet(index.byBlock, blockIndex);
        const side = block === undefined ?
          undefined :
          mapGet(block, sideId);
        if (
          side === undefined ||
          mapGet(side, offeredLoad) === undefined
        ) {
          fail(BENCHMARK_CAPACITY_REASON.INCOMPLETE_MATRIX);
        }
      }
    }
  }
}

function sumAccounting(samples) {
  const counts = {
    offered: 0,
    dispatched: 0,
    correct: 0,
    rejected: 0,
    timedOut: 0,
    errored: 0,
    queueOverflow: 0,
    undispatched: 0,
    cancelled: 0,
  };
  const rejectedByReason = {queueFull: 0, flowControl: 0, admission: 0};
  const countKeys = objectKeys(counts);
  const reasonKeys = objectKeys(rejectedByReason);
  for (let index = 0; index < samples.length; index += 1) {
    for (let keyIndex = 0; keyIndex < countKeys.length; keyIndex += 1) {
      const key = countKeys[keyIndex];
      counts[key] += samples[index].counts[key];
    }
    for (let keyIndex = 0; keyIndex < reasonKeys.length; keyIndex += 1) {
      const key = reasonKeys[keyIndex];
      rejectedByReason[key] += samples[index].rejectedByReason[key];
    }
  }
  return {counts, rejectedByReason};
}

function buildCapacityCurve(index, sealed) {
  const curve = [];
  const emittedIntervalCount =
    sealed.offeredLoadPerSecond.length * sealed.sideIds.length;
  const adjustedConfidenceLevel = 1 -
    ((1 - sealed.statistics.confidenceLevel) /
      emittedIntervalCount);
  for (let loadIndex = 0;
    loadIndex < sealed.offeredLoadPerSecond.length;
    loadIndex += 1) {
    const offeredLoadPerSecond = sealed.offeredLoadPerSecond[loadIndex];
    const sides = {};
    for (let sideIndex = 0;
      sideIndex < sealed.sideIds.length;
      sideIndex += 1) {
      const sideId = sealed.sideIds[sideIndex];
      const side = mapGet(index.bySideLoad, sideId);
      const samples = side === undefined ?
        [] :
        mapGet(side, offeredLoadPerSecond) ?? [];
      const correctThroughputs = [];
      const errorRates = [];
      const p50Values = [];
      const p95Values = [];
      const p99Values = [];
      let sloPassCount = 0;
      let tailSufficientCount = 0;
      for (let index = 0; index < samples.length; index += 1) {
        const sample = samples[index];
        appendOwnArrayValue(
          correctThroughputs,
          sample.correctThroughputPerSecond,
        );
        appendOwnArrayValue(errorRates, sample.errorRate);
        appendOwnArrayValue(p50Values, sample.quantilesMs.p50);
        appendOwnArrayValue(p95Values, sample.quantilesMs.p95);
        appendOwnArrayValue(p99Values, sample.quantilesMs.p99);
        if (sample.sloPassed) sloPassCount += 1;
        if (sample.tailSampleSufficient) tailSufficientCount += 1;
      }
      sides[sideId] = {
        sampleCount: samples.length,
        sloPassCount,
        tailSufficientCount,
        allRunsSloPassed: sloPassCount === samples.length,
        allRunsTailSufficient: tailSufficientCount === samples.length,
        correctThroughputPerSecond: bootstrapMedianInterval(
          correctThroughputs,
          adjustedConfidenceLevel,
          sealed.statistics.bootstrapResamples,
          sealed.randomization.seed + loadIndex + sideIndex + 1,
        ),
        errorRateMedian: median(errorRates),
        latencyMsMedian: {
          p50: median(p50Values),
          p95: median(p95Values),
          p99: median(p99Values),
        },
        accounting: sumAccounting(samples),
      };
    }
    appendOwnArrayValue(curve, {
      offeredLoadPerSecond,
      familywiseConfidenceLevel: adjustedConfidenceLevel,
      sides,
    });
  }
  return curve;
}

function capacityForBlock(index, sealed, blockIndex, sideId) {
  let maxSloOfferedLoadPerSecond = 0;
  let maxCorrectThroughputPerSecond = 0;
  let tailSufficient = true;
  for (let loadIndex = 0;
    loadIndex < sealed.offeredLoadPerSecond.length;
    loadIndex += 1) {
    const offeredLoad = sealed.offeredLoadPerSecond[loadIndex];
    const block = mapGet(index.byBlock, blockIndex);
    const side = block === undefined ?
      undefined :
      mapGet(block, sideId);
    const matched = side === undefined ?
      undefined :
      mapGet(side, offeredLoad);
    if (!matched) {
      fail(BENCHMARK_CAPACITY_REASON.INCOMPLETE_MATRIX);
    }
    if (!matched.tailSampleSufficient) {
      tailSufficient = false;
    }
    if (matched.sloPassed) {
      maxSloOfferedLoadPerSecond = offeredLoad;
      maxCorrectThroughputPerSecond =
        matched.correctThroughputPerSecond;
    }
  }
  return {
    blockIndex,
    sideId,
    maxSloOfferedLoadPerSecond,
    maxCorrectThroughputPerSecond,
    tailSufficient,
  };
}

function buildBlockCapacities(index, sealed, completedBlocks) {
  const blocks = [];
  for (let blockIndex = 0; blockIndex < completedBlocks; blockIndex += 1) {
    const bySide = {};
    for (let sideIndex = 0;
      sideIndex < sealed.sideIds.length;
      sideIndex += 1) {
      const sideId = sealed.sideIds[sideIndex];
      bySide[sideId] = capacityForBlock(
        index,
        sealed,
        blockIndex,
        sideId,
      );
    }
    appendOwnArrayValue(blocks, {blockIndex, bySide});
  }
  return blocks;
}

function buildCapacityBySide(blocks, sealed) {
  const capacityBySide = {};
  for (let sideIndex = 0;
    sideIndex < sealed.sideIds.length;
    sideIndex += 1) {
    const sideId = sealed.sideIds[sideIndex];
    const offered = [];
    const correct = [];
    for (let index = 0; index < blocks.length; index += 1) {
      appendOwnArrayValue(
        offered,
        blocks[index].bySide[sideId].maxSloOfferedLoadPerSecond,
      );
      appendOwnArrayValue(
        correct,
        blocks[index].bySide[sideId].maxCorrectThroughputPerSecond,
      );
    }
    capacityBySide[sideId] = {
      maxSloOfferedLoadPerSecond: median(offered),
      maxCorrectThroughputPerSecond: median(correct),
      perBlock: correct,
    };
  }
  return capacityBySide;
}

function practicalClassification(interval, threshold) {
  const upperNeutral = BENCHMARK_CAPACITY_RATIO_IDENTITY + threshold;
  const lowerNeutral = BENCHMARK_CAPACITY_RATIO_IDENTITY - threshold;
  if (interval.lower > upperNeutral) {
    return BENCHMARK_CAPACITY_PRACTICAL_CLASSIFICATION.FIRST_SIDE_FASTER;
  }
  if (interval.upper < lowerNeutral) {
    return BENCHMARK_CAPACITY_PRACTICAL_CLASSIFICATION.SECOND_SIDE_FASTER;
  }
  if (interval.lower >= lowerNeutral && interval.upper <= upperNeutral) {
    return BENCHMARK_CAPACITY_PRACTICAL_CLASSIFICATION.PRACTICALLY_EQUIVALENT;
  }
  return BENCHMARK_CAPACITY_PRACTICAL_CLASSIFICATION.INCONCLUSIVE;
}

function buildPairedEffect(blocks, sealed, reasons) {
  const ratios = [];
  const firstSideId = sealed.sideIds[0];
  const secondSideId = sealed.sideIds[1];
  for (let index = 0; index < blocks.length; index += 1) {
    const numerator =
      blocks[index].bySide[firstSideId].maxCorrectThroughputPerSecond;
    const denominator =
      blocks[index].bySide[secondSideId].maxCorrectThroughputPerSecond;
    const ratio = denominator > 0 ? numerator / denominator : 0;
    if (
      numerator === 0 ||
      denominator === 0 ||
      !numberIsFinite(ratio) ||
      !isNonNegativeSafeNumber(ratio)
    ) {
      appendReason(reasons, BENCHMARK_CAPACITY_REASON.EMPTY_CAPACITY);
      continue;
    }
    appendOwnArrayValue(ratios, ratio);
  }
  if (ratios.length !== blocks.length) {
    appendReason(reasons, BENCHMARK_CAPACITY_REASON.INVALID_PAIRED_EFFECT);
    return {
      estimator: sealed.statistics.estimator,
      firstSideId,
      secondSideId,
      sampleCount: ratios.length,
      estimate: 0,
      confidenceInterval: {lower: 0, upper: 0},
      practicalSignificanceRatio:
        sealed.statistics.practicalSignificanceRatio,
      practicalClassification:
        BENCHMARK_CAPACITY_PRACTICAL_CLASSIFICATION.NO_RESULT,
    };
  }
  const interval = bootstrapMedianInterval(
    ratios,
    sealed.statistics.confidenceLevel,
    sealed.statistics.bootstrapResamples,
    sealed.randomization.seed,
  );
  return {
    estimator: sealed.statistics.estimator,
    firstSideId,
    secondSideId,
    sampleCount: ratios.length,
    estimate: interval.estimate,
    confidenceInterval: {
      lower: interval.lower,
      upper: interval.upper,
    },
    practicalSignificanceRatio:
      sealed.statistics.practicalSignificanceRatio,
    practicalClassification: practicalClassification(
      interval,
      sealed.statistics.practicalSignificanceRatio,
    ),
  };
}

function relativeIntervalWidth(effect) {
  if (
    effect.estimate <= 0 ||
    effect.confidenceInterval.upper < effect.confidenceInterval.lower
  ) {
    return Number.MAX_SAFE_INTEGER;
  }
  const width =
    (effect.confidenceInterval.upper - effect.confidenceInterval.lower) /
    effect.estimate;
  return isNonNegativeSafeNumber(width) ?
    width :
    Number.MAX_SAFE_INTEGER;
}

function allTailSamplesSufficient(blocks, sealed) {
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    for (let sideIndex = 0;
      sideIndex < sealed.sideIds.length;
      sideIndex += 1) {
      if (!blocks[blockIndex].bySide[sealed.sideIds[sideIndex]].tailSufficient) {
        return false;
      }
    }
  }
  return true;
}

function resolveStopDecision({
  completedBlocks,
  sealed,
  pairedEffect,
  tailSufficient,
  reasons,
}) {
  const minimumReached = completedBlocks >= sealed.repetitions.minimum;
  const maximumReached = completedBlocks >= sealed.repetitions.maximum;
  const relativeCiWidth = relativeIntervalWidth(pairedEffect);
  const precisionReached =
    minimumReached &&
    tailSufficient &&
    pairedEffect.sampleCount === completedBlocks &&
    relativeCiWidth <= sealed.statistics.targetRelativeCiWidth;
  if (precisionReached) {
    appendReason(reasons, BENCHMARK_CAPACITY_REASON.PRECISION_TARGET_REACHED);
    return {
      decision: BENCHMARK_CAPACITY_STOP_DECISION.PRECISION_REACHED,
      shouldStop: true,
      minimumReached,
      maximumReached,
      relativeCiWidth,
      targetRelativeCiWidth: sealed.statistics.targetRelativeCiWidth,
    };
  }
  if (maximumReached) {
    appendReason(
      reasons,
      BENCHMARK_CAPACITY_REASON.MAXIMUM_REPETITIONS_REACHED,
    );
    return {
      decision: BENCHMARK_CAPACITY_STOP_DECISION.MAXIMUM_REPETITIONS,
      shouldStop: true,
      minimumReached,
      maximumReached,
      relativeCiWidth,
      targetRelativeCiWidth: sealed.statistics.targetRelativeCiWidth,
    };
  }
  return {
    decision: 'continue',
    shouldStop: false,
    minimumReached,
    maximumReached,
    relativeCiWidth,
    targetRelativeCiWidth: sealed.statistics.targetRelativeCiWidth,
  };
}

export function summarizeBenchmarkCapacityMatrix(
  samples,
  sealed,
  completedBlocks,
) {
  if (
    !isDenseDataArray(samples) ||
    !isNonNegativeSafeInteger(completedBlocks) ||
    !inspectBenchmarkCapacityPreregistration(sealed).valid ||
    completedBlocks > sealed.repetitions.maximum
  ) {
    fail('exact matrix inputs required');
  }
  const summaries = [];
  for (let index = 0; index < samples.length; index += 1) {
    appendOwnArrayValue(
      summaries,
      summarizeRunSample(samples[index], sealed),
    );
  }
  const index = summaryIndex(summaries);
  assertMatrixComplete(summaries, index, sealed, completedBlocks);
  const reasons = [];
  const blocks = buildBlockCapacities(
    index,
    sealed,
    completedBlocks,
  );
  const capacityBySide = buildCapacityBySide(blocks, sealed);
  const pairedEffect = buildPairedEffect(blocks, sealed, reasons);
  const tailSufficient = allTailSamplesSufficient(blocks, sealed);
  if (!tailSufficient) {
    appendReason(reasons, BENCHMARK_CAPACITY_REASON.INSUFFICIENT_TAIL_SAMPLES);
  }
  const stoppingDecision = resolveStopDecision({
    completedBlocks,
    sealed,
    pairedEffect,
    tailSufficient,
    reasons,
  });
  const measurementState =
    tailSufficient &&
    pairedEffect.sampleCount === completedBlocks ?
      BENCHMARK_CAPACITY_MEASUREMENT_STATE.MEASURED :
      BENCHMARK_CAPACITY_MEASUREMENT_STATE.NON_MEASURING;
  const summary = {
    measurementState,
    completedBlocks,
    expectedRunSampleCount: expectedSampleCount(sealed, completedBlocks),
    observedRunSampleCount: summaries.length,
    sampleSufficiency: {
      tailQuantile: sealed.sampling.tailQuantile,
      tailSampleMinimum: sealed.sampling.tailSampleMinimum,
      sufficient: tailSufficient,
    },
    capacityBySide,
    capacityCurve: buildCapacityCurve(index, sealed),
    pairedEffect,
    stoppingDecision: measurementState ===
        BENCHMARK_CAPACITY_MEASUREMENT_STATE.NON_MEASURING ?
      {
        ...stoppingDecision,
        decision: BENCHMARK_CAPACITY_STOP_DECISION.NON_MEASURING,
      } :
      stoppingDecision,
    reasonCodes: reasons,
  };
  return {
    ...summary,
    summaryDigest: digestBenchmarkSemanticData(summary),
  };
}
