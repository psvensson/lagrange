import {types} from 'node:util';
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
const isProxy = types.isProxy.bind(types);
const numberIsFinite = Number.isFinite;
const objectKeys = Object.keys;
const arraySort = Function.call.bind(Array.prototype.sort);
const MapConstructor = Map;
const mapGet = Function.call.bind(Map.prototype.get);
const mapHas = Function.call.bind(Map.prototype.has);
const mapSet = Function.call.bind(Map.prototype.set);
const numericAscending = (left, right) => left - right;
const RANDOM_INCREMENT = 0x6D2B79F5;
const RANDOM_FIRST_SHIFT = 15;
const RANDOM_SECOND_SHIFT = 7;
const RANDOM_SECOND_MULTIPLIER = 61;
const RANDOM_FINAL_SHIFT = 14;
const UINT32_RANGE = 4_294_967_296;
const localText = Object.freeze({
  CONTINUE: 'continue',
  DENSE_NUMERIC_SAMPLES_REQUIRED: 'dense numeric samples required',
  EXACT_MATRIX_INPUTS_REQUIRED: 'exact matrix inputs required',
  PAIRED_RATIO_BOOTSTRAP_CONTRACT_REQUIRED:
    'paired ratio bootstrap contract required',
  UNSAFE_MEDIAN: 'unsafe median',
  UNSAFE_PAIRED_RATIO: 'unsafe paired ratio',
});

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
    fail(localText.DENSE_NUMERIC_SAMPLES_REQUIRED);
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
    fail(localText.UNSAFE_MEDIAN);
  }
  return estimate;
}

function createMulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + RANDOM_INCREMENT) >>> 0;
    let value = state;
    value = mathImul(
      value ^ (value >>> RANDOM_FIRST_SHIFT),
      value | 1,
    );
    value ^= value + mathImul(
      value ^ (value >>> RANDOM_SECOND_SHIFT),
      value | RANDOM_SECOND_MULTIPLIER,
    );
    return ((value ^ (value >>> RANDOM_FINAL_SHIFT)) >>> 0) /
      UINT32_RANGE;
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

function pairedRatio(pairs) {
  const pairCount = pairs.length;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < pairCount; index += 1) {
    const pair = pairs[index];
    if (
      isProxy(pair) ||
      !isDenseDataArray(pair) ||
      pair.length !== 2 ||
      !isNonNegativeSafeNumber(pair[0]) ||
      !isNonNegativeSafeNumber(pair[1]) ||
      pair[1] === 0
    ) {
      fail(`unsafe paired ratio sample at ${index}`);
    }
    numerator += pair[0];
    denominator += pair[1];
    if (
      !isNonNegativeSafeNumber(numerator) ||
      !isNonNegativeSafeNumber(denominator)
    ) {
      fail(localText.UNSAFE_PAIRED_RATIO);
    }
  }
  const averageNumerator = numerator / pairCount;
  const averageDenominator = denominator / pairCount;
  const ratio = denominator > 0 ?
    averageNumerator / averageDenominator :
    0;
  if (!isNonNegativeSafeNumber(ratio)) {
    fail(localText.UNSAFE_PAIRED_RATIO);
  }
  return ratio;
}

export function bootstrapBenchmarkPairedRatioInterval(
  pairs,
  confidenceLevel,
  resamples,
  seed,
) {
  if (
    isProxy(pairs) ||
    !isDenseDataArray(pairs) ||
    pairs.length === 0 ||
    !isNonNegativeSafeNumber(confidenceLevel) ||
    confidenceLevel <= 0 ||
    confidenceLevel >= 1 ||
    !isNonNegativeSafeInteger(resamples) ||
    resamples === 0 ||
    !isNonNegativeSafeInteger(seed)
  ) {
    fail(localText.PAIRED_RATIO_BOOTSTRAP_CONTRACT_REQUIRED);
  }
  const estimate = pairedRatio(pairs);
  const random = createMulberry32(seed);
  const estimates = [];
  for (let sampleIndex = 0; sampleIndex < resamples; sampleIndex += 1) {
    const resample = [];
    for (let index = 0; index < pairs.length; index += 1) {
      const sourceIndex = mathFloor(random() * pairs.length);
      appendOwnArrayValue(resample, pairs[sourceIndex]);
    }
    appendOwnArrayValue(estimates, pairedRatio(resample));
  }
  const interval = percentileInterval(estimates, confidenceLevel);
  return {
    estimate,
    lower: mathMin(interval.lower, estimate),
    upper: mathMax(interval.upper, estimate),
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
  let decision = localText.CONTINUE;
  let shouldStop = false;
  if (precisionReached) {
    appendReason(reasons, BENCHMARK_CAPACITY_REASON.PRECISION_TARGET_REACHED);
    decision = BENCHMARK_CAPACITY_STOP_DECISION.PRECISION_REACHED;
    shouldStop = true;
  } else if (maximumReached) {
    appendReason(
      reasons,
      BENCHMARK_CAPACITY_REASON.MAXIMUM_REPETITIONS_REACHED,
    );
    decision = BENCHMARK_CAPACITY_STOP_DECISION.MAXIMUM_REPETITIONS;
    shouldStop = true;
  }
  return {
    decision,
    shouldStop,
    minimumReached,
    maximumReached,
    relativeCiWidth,
    targetRelativeCiWidth: sealed.statistics.targetRelativeCiWidth,
  };
}

function createEvidenceList() {
  return [];
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
    fail(localText.EXACT_MATRIX_INPUTS_REQUIRED);
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
  const statusEntries = createEvidenceList();
  const blocks = buildBlockCapacities(
    index,
    sealed,
    completedBlocks,
  );
  const capacityBySide = buildCapacityBySide(blocks, sealed);
  const pairedEffect = buildPairedEffect(blocks, sealed, statusEntries);
  const tailSufficient = allTailSamplesSufficient(blocks, sealed);
  if (!tailSufficient) {
    appendReason(
      statusEntries,
      BENCHMARK_CAPACITY_REASON.INSUFFICIENT_TAIL_SAMPLES,
    );
  }
  const stoppingDecision = resolveStopDecision({
    completedBlocks,
    sealed,
    pairedEffect,
    tailSufficient,
    reasons: statusEntries,
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
    reasonCodes: statusEntries,
  };
  return {
    ...summary,
    summaryDigest: digestBenchmarkSemanticData(summary),
  };
}

function assertIndependentSideMatrixComplete(
  summaries,
  index,
  sealed,
  sideId,
  completedBlocks,
) {
  const expectedCount =
    completedBlocks * sealed.offeredLoadPerSecond.length;
  if (summaries.length !== expectedCount) {
    fail(BENCHMARK_CAPACITY_REASON.INCOMPLETE_MATRIX);
  }
  for (let blockIndex = 0; blockIndex < completedBlocks; blockIndex += 1) {
    const block = mapGet(index.byBlock, blockIndex);
    const side = block === undefined ? undefined : mapGet(block, sideId);
    for (let loadIndex = 0;
      loadIndex < sealed.offeredLoadPerSecond.length;
      loadIndex += 1) {
      const offeredLoad = sealed.offeredLoadPerSecond[loadIndex];
      if (side === undefined || mapGet(side, offeredLoad) === undefined) {
        fail(BENCHMARK_CAPACITY_REASON.INCOMPLETE_MATRIX);
      }
    }
  }
}

function independentSideBlockIsBracketed(index, sealed, blockIndex, sideId) {
  const block = mapGet(index.byBlock, blockIndex);
  const side = block === undefined ? undefined : mapGet(block, sideId);
  let passingLoadIndex = -1;
  for (let loadIndex = 0;
    loadIndex < sealed.offeredLoadPerSecond.length;
    loadIndex += 1) {
    const sample = side === undefined ?
      undefined :
      mapGet(side, sealed.offeredLoadPerSecond[loadIndex]);
    if (sample !== undefined && sample.sloPassed === true) {
      passingLoadIndex = loadIndex;
    }
  }
  if (passingLoadIndex < 0) return false;
  for (let loadIndex = passingLoadIndex + 1;
    loadIndex < sealed.offeredLoadPerSecond.length;
    loadIndex += 1) {
    const sample = mapGet(
      side,
      sealed.offeredLoadPerSecond[loadIndex],
    );
    if (sample.sloPassed !== true) return true;
  }
  return false;
}

function independentSideAllTrue(values) {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] !== true) return false;
  }
  return true;
}

function assertIndependentSideInputs(
  samples,
  sealed,
  sideId,
  completedBlocks,
) {
  if (
    !isDenseDataArray(samples) ||
    !isNonNegativeSafeInteger(completedBlocks) ||
    completedBlocks === 0
  ) {
    fail(localText.EXACT_MATRIX_INPUTS_REQUIRED);
  }
  const preregistrationInspection =
    inspectBenchmarkCapacityPreregistration(sealed);
  if (
    !preregistrationInspection.valid ||
    completedBlocks > sealed.repetitions.maximum
  ) {
    fail(localText.EXACT_MATRIX_INPUTS_REQUIRED);
  }
  let registeredSide = false;
  for (let index = 0; index < sealed.sideIds.length; index += 1) {
    if (sealed.sideIds[index] === sideId) registeredSide = true;
  }
  if (!registeredSide) fail(localText.EXACT_MATRIX_INPUTS_REQUIRED);
}

function summarizeIndependentSideSamples(samples, sealed, sideId) {
  const summaries = [];
  for (let index = 0; index < samples.length; index += 1) {
    const summary = summarizeRunSample(samples[index], sealed);
    if (summary.sideId !== sideId) {
      fail(BENCHMARK_CAPACITY_REASON.INCOMPLETE_MATRIX);
    }
    appendOwnArrayValue(summaries, summary);
  }
  return summaries;
}

function buildIndependentSideSeries(
  index,
  sealed,
  sideId,
  completedBlocks,
) {
  const correct = [];
  const offered = [];
  const tailSufficientByBlock = [];
  const bracketedByBlock = [];
  for (let blockIndex = 0; blockIndex < completedBlocks; blockIndex += 1) {
    const blockCapacity =
      capacityForBlock(index, sealed, blockIndex, sideId);
    appendOwnArrayValue(
      correct,
      blockCapacity.maxCorrectThroughputPerSecond,
    );
    appendOwnArrayValue(
      offered,
      blockCapacity.maxSloOfferedLoadPerSecond,
    );
    appendOwnArrayValue(
      tailSufficientByBlock,
      blockCapacity.tailSufficient,
    );
    appendOwnArrayValue(
      bracketedByBlock,
      independentSideBlockIsBracketed(
        index,
        sealed,
        blockIndex,
        sideId,
      ),
    );
  }
  return {
    correct,
    offered,
    tailSufficientByBlock,
    bracketedByBlock,
  };
}

export function summarizeBenchmarkCapacityIndependentSide(
  samples,
  sealed,
  sideId,
  completedBlocks,
) {
  assertIndependentSideInputs(
    samples,
    sealed,
    sideId,
    completedBlocks,
  );
  const summaries =
    summarizeIndependentSideSamples(samples, sealed, sideId);
  const index = summaryIndex(summaries);
  assertIndependentSideMatrixComplete(
    summaries,
    index,
    sealed,
    sideId,
    completedBlocks,
  );
  const series = buildIndependentSideSeries(
    index,
    sealed,
    sideId,
    completedBlocks,
  );
  const interval = bootstrapMedianInterval(
    series.correct,
    sealed.statistics.confidenceLevel,
    sealed.statistics.bootstrapResamples,
    sealed.randomization.seed,
  );
  const relativeIntervalWidth = interval.estimate === 0 ?
    Number.MAX_SAFE_INTEGER :
    (interval.upper - interval.lower) / interval.estimate;
  const tailSufficient =
    independentSideAllTrue(series.tailSufficientByBlock);
  const bracketed =
    independentSideAllTrue(series.bracketedByBlock);
  const precisionReached =
    interval.estimate > 0 &&
    relativeIntervalWidth <=
      sealed.statistics.targetRelativeCiWidth;
  const reusable =
    completedBlocks >= sealed.repetitions.minimum &&
    tailSufficient &&
    bracketed &&
    precisionReached;
  const capacity = {
    estimate: interval.estimate,
    confidenceInterval: {
      lower: interval.lower,
      upper: interval.upper,
    },
    perBlockCorrectThroughputPerSecond: series.correct,
    perBlockMaxSloOfferedLoadPerSecond: series.offered,
    tailSufficientByBlock: series.tailSufficientByBlock,
    bracketedByBlock: series.bracketedByBlock,
    minimumBlocks: sealed.repetitions.minimum,
    maximumBlocks: sealed.repetitions.maximum,
    completedBlocks,
    targetRelativeCiWidth:
      sealed.statistics.targetRelativeCiWidth,
  };
  const summary = {
    sideId,
    completedBlocks,
    capacity,
    objectiveSufficiency: {
      tailSufficient,
      bracketed,
      precisionReached,
      reusable,
      relativeIntervalWidth,
    },
    shouldStop:
      reusable ||
      completedBlocks >= sealed.repetitions.maximum,
  };
  return {
    ...summary,
    summaryDigest: digestBenchmarkSemanticData(summary),
  };
}
