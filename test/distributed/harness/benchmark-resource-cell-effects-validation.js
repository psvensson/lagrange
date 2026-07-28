import {
  appendOwnArrayValue,
  digestBenchmarkSemanticData,
} from './benchmark-semantic-integrity.js';
import {
  BENCHMARK_RESOURCE_NO_CURRENCY,
  computeBenchmarkResourceWindowCost,
  createBenchmarkResourcePairedEffect,
} from './benchmark-resource-cost-and-effects.js';
import {
  BENCHMARK_RESOURCE_EFFECT,
} from './benchmark-resource-contract-constants.js';
import {
  bootstrapBenchmarkPairedRatioInterval,
} from './benchmark-capacity-statistics.js';
import {
  BENCHMARK_RESOURCE_ROOT_TEXT as ROOT_TEXT,
} from './benchmark-resource-evidence-root-constants.js';

const million = 1_000_000;
const COST_BOOTSTRAP_SEED_OFFSET = 1_129_273_684;

function fail(message) {
  throw new TypeError(message);
}

function sumSideCost(windows, inventory, price, sideId) {
  let totalCost = 0;
  let correct = 0;
  let sampleCount = 0;
  for (let index = 0; index < windows.length; index += 1) {
    const payload = windows[index].payload;
    if (payload.sideId !== sideId) continue;
    const cost = computeBenchmarkResourceWindowCost(
      payload,
      inventory,
      price,
    );
    totalCost += cost.totalCost;
    correct += payload.correctSloEligibleOperations;
    sampleCount += 1;
  }
  if (correct === 0) {
    fail(ROOT_TEXT.CELL_COST_EFFECT_CORRECT_OPERATIONS_MISSING);
  }
  return {
    value: totalCost / correct * million,
    sampleCount,
  };
}

function pairedBlockCosts(windows, inventory, price, sideIds) {
  const blocks = [];
  for (let index = 0; index < windows.length; index += 1) {
    const payload = windows[index].payload;
    let sideIndex = -1;
    for (let candidate = 0; candidate < sideIds.length; candidate += 1) {
      if (sideIds[candidate] === payload.sideId) sideIndex = candidate;
    }
    if (sideIndex < 0) fail(ROOT_TEXT.CELL_EFFECTS_RECOMPUTATION_MISMATCH);
    let block;
    for (let candidate = 0; candidate < blocks.length; candidate += 1) {
      if (blocks[candidate].blockIndex === payload.blockIndex) {
        block = blocks[candidate];
      }
    }
    if (block === undefined) {
      block = {blockIndex: payload.blockIndex, costs: [null, null]};
      appendOwnArrayValue(blocks, block);
    }
    if (block.costs[sideIndex] !== null) {
      fail(ROOT_TEXT.CELL_EFFECTS_RECOMPUTATION_MISMATCH);
    }
    block.costs[sideIndex] = computeBenchmarkResourceWindowCost(
      payload, inventory, price,
    ).costPerMillionCorrectOperations;
  }
  const pairs = [];
  for (let index = 0; index < blocks.length; index += 1) {
    if (blocks[index].costs[0] === null || blocks[index].costs[1] === null) {
      fail(ROOT_TEXT.CELL_EFFECTS_RECOMPUTATION_MISMATCH);
    }
    appendOwnArrayValue(pairs, blocks[index].costs);
  }
  return pairs;
}

function assertEffectEqual(actual, expected) {
  if (
    digestBenchmarkSemanticData(expected) !==
      digestBenchmarkSemanticData(actual)
  ) {
    fail(ROOT_TEXT.CELL_EFFECTS_RECOMPUTATION_MISMATCH);
  }
}

export function recomputeBenchmarkResourceMeasuringCellEffects(
  payload,
  owners,
  capacities,
  windows,
  capacityPreregistration = null,
) {
  assertEffectEqual(payload.capacityEffect, createBenchmarkResourcePairedEffect({
    effectType: BENCHMARK_RESOURCE_EFFECT.CAPACITY,
    numeratorSideId: payload.sideIds[0],
    denominatorSideId: payload.sideIds[1],
    numeratorValue: capacities[0].capacityCorrectOpsPerSecond,
    denominatorValue: capacities[1].capacityCorrectOpsPerSecond,
    confidenceInterval: {
      lower:
        capacities[0].confidenceInterval.lower /
        capacities[1].confidenceInterval.upper,
      upper:
        capacities[0].confidenceInterval.upper /
        capacities[1].confidenceInterval.lower,
    },
    practicalThreshold: payload.capacityEffect.practicalThreshold,
    sampleCount:
      capacities[0].sampleCount < capacities[1].sampleCount ?
        capacities[0].sampleCount :
        capacities[1].sampleCount,
    sourceDigests: payload.capacityEffect.sourceDigests,
    currency: BENCHMARK_RESOURCE_NO_CURRENCY,
  }));
  if (owners.price === null) return;
  let numeratorCost = sumSideCost(
    windows,
    owners.inventory,
    owners.price,
    payload.sideIds[0],
  );
  let denominatorCost = sumSideCost(
    windows,
    owners.inventory,
    owners.price,
    payload.sideIds[1],
  );
  let costInterval = {
    lower: numeratorCost.value / denominatorCost.value,
    upper: numeratorCost.value / denominatorCost.value,
  };
  if (capacityPreregistration !== null) {
    const pairs = pairedBlockCosts(
      windows,
      owners.inventory,
      owners.price,
      payload.sideIds,
    );
    let numeratorTotal = 0;
    let denominatorTotal = 0;
    for (let index = 0; index < pairs.length; index += 1) {
      numeratorTotal += pairs[index][0];
      denominatorTotal += pairs[index][1];
    }
    numeratorCost = {
      value: numeratorTotal / pairs.length,
      sampleCount: pairs.length,
    };
    denominatorCost = {
      value: denominatorTotal / pairs.length,
      sampleCount: pairs.length,
    };
    const interval = bootstrapBenchmarkPairedRatioInterval(
      pairs,
      capacityPreregistration.statistics.confidenceLevel,
      capacityPreregistration.statistics.bootstrapResamples,
      capacityPreregistration.randomization.seed +
        COST_BOOTSTRAP_SEED_OFFSET,
    );
    costInterval = {lower: interval.lower, upper: interval.upper};
  }
  assertEffectEqual(payload.costEffect, createBenchmarkResourcePairedEffect({
    effectType: BENCHMARK_RESOURCE_EFFECT.COST,
    numeratorSideId: payload.sideIds[0],
    denominatorSideId: payload.sideIds[1],
    numeratorValue: numeratorCost.value,
    denominatorValue: denominatorCost.value,
    confidenceInterval: costInterval,
    practicalThreshold: payload.costEffect.practicalThreshold,
    sampleCount:
      numeratorCost.sampleCount < denominatorCost.sampleCount ?
        numeratorCost.sampleCount :
        denominatorCost.sampleCount,
    sourceDigests: payload.costEffect.sourceDigests,
    currency: owners.price.currency,
  }));
}
