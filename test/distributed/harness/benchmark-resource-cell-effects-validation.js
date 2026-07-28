import {
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
  BENCHMARK_RESOURCE_ROOT_TEXT as ROOT_TEXT,
} from './benchmark-resource-evidence-root-constants.js';

const million = 1_000_000;

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
  const numeratorCost = sumSideCost(
    windows,
    owners.inventory,
    owners.price,
    payload.sideIds[0],
  );
  const denominatorCost = sumSideCost(
    windows,
    owners.inventory,
    owners.price,
    payload.sideIds[1],
  );
  assertEffectEqual(payload.costEffect, createBenchmarkResourcePairedEffect({
    effectType: BENCHMARK_RESOURCE_EFFECT.COST,
    numeratorSideId: payload.sideIds[0],
    denominatorSideId: payload.sideIds[1],
    numeratorValue: numeratorCost.value,
    denominatorValue: denominatorCost.value,
    confidenceInterval: {
      lower: numeratorCost.value / denominatorCost.value,
      upper: numeratorCost.value / denominatorCost.value,
    },
    practicalThreshold: payload.costEffect.practicalThreshold,
    sampleCount:
      numeratorCost.sampleCount < denominatorCost.sampleCount ?
        numeratorCost.sampleCount :
        denominatorCost.sampleCount,
    sourceDigests: payload.costEffect.sourceDigests,
    currency: owners.price.currency,
  }));
}
