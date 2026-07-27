import {
  appendOwnArrayValue,
  digestBenchmarkSemanticData,
} from './benchmark-semantic-integrity.js';
import {
  assertBenchmarkResourceArray,
  assertBenchmarkResourceDigest,
  assertBenchmarkResourceExactRecord,
  assertBenchmarkResourceInteger,
  assertBenchmarkResourceNumber,
  assertBenchmarkResourceText,
  createBenchmarkResourceArtifact,
} from './benchmark-resource-evidence-data.js';
import {
  findBenchmarkResourceInventorySide,
} from './benchmark-resource-accounting.js';
import {
  BENCHMARK_RESOURCE_ARTIFACT_KIND,
  BENCHMARK_RESOURCE_BILLING_TREATMENT,
  BENCHMARK_RESOURCE_CONTRACT,
  BENCHMARK_RESOURCE_EFFECT,
  BENCHMARK_RESOURCE_EFFECT_DIRECTION,
  BENCHMARK_RESOURCE_EFFECT_UNIT,
  BENCHMARK_RESOURCE_LIMIT,
  BENCHMARK_RESOURCE_PRICE_UNIT,
} from './benchmark-resource-contract-constants.js';
const localText = Object.freeze({
  PRICE_EXCLUSIONS: 'price.exclusions',
  PRICE_EXCLUSIONS_DUPLICATE: 'price.exclusions:duplicate',
  PRICE_UNIT_PRICES: 'price.unitPrices',
  PRICE: 'price',
  PRICE_VALID_FROM: 'price.validFrom',
  PRICE_VALID_UNTIL: 'price.validUntil',
  PRICE_PRICE_DATE_DATE_REQUIRED: 'price.priceDate:date_required',
  PRICE_VALIDITY_NOT_POSITIVE: 'price.validity:not_positive',
  RESOURCE_WINDOW_INTER_ZONE_NETWORK_BYTES_EXCEEDS_NETWORK: 'resourceWindow.interZoneNetworkBytes:exceeds_network',
  RESOURCE_WINDOW_SIDE_NOT_IN_INVENTORY: 'resourceWindow.side:not_in_inventory',
  RESOURCE_WINDOW_COMPONENTS_INVENTORY_COUNT_MISMATCH: 'resourceWindow.components:inventory_count_mismatch',
  RESOURCE_WINDOW_PRICE_NOT_VALID_FOR_WINDOW: 'resourceWindow.price:not_valid_for_window',
  RESOURCE_WINDOW_COMPONENTS_INVENTORY_IDENTITY_MISMATCH: 'resourceWindow.components:inventory_identity_mismatch',
  RESOURCE_WINDOW_CORRECT_OPERATIONS_POSITIVE_REQUIRED_FOR_COST: 'resourceWindow.correctOperations:positive_required_for_cost',
  EFFECT_CURRENCY_NOT_APPLICABLE_REQUIRED: 'effect.currency:not_applicable_required',
  EFFECT_CURRENCY: 'effect.currency',
  EFFECT_CURRENCY_CURRENCY_REQUIRED: 'effect.currency:currency_required',
  EFFECT_EFFECT_TYPE_UNSUPPORTED: 'effect.effectType:unsupported',
  EFFECT_SOURCE_DIGESTS: 'effect.sourceDigests',
  EFFECT_SOURCE_DIGESTS_NON_EMPTY_REQUIRED: 'effect.sourceDigests:non_empty_required',
  EFFECT_SOURCE_DIGESTS_DUPLICATE: 'effect.sourceDigests:duplicate',
  EFFECT: 'effect',
  EFFECT_SIDES_DISTINCT_REQUIRED: 'effect.sides:distinct_required',
  EFFECT_NUMERATOR_VALUE: 'effect.numeratorValue',
  EFFECT_DENOMINATOR_VALUE: 'effect.denominatorValue',
  EFFECT_DENOMINATOR_VALUE_POSITIVE_REQUIRED: 'effect.denominatorValue:positive_required',
  EFFECT_CONFIDENCE_INTERVAL: 'effect.confidenceInterval',
  EFFECT_CONFIDENCE_INTERVAL_LOWER: 'effect.confidenceInterval.lower',
  EFFECT_CONFIDENCE_INTERVAL_UPPER: 'effect.confidenceInterval.upper',
  EFFECT_CONFIDENCE_INTERVAL_REVERSED: 'effect.confidenceInterval:reversed',
  EFFECT_PRACTICAL_THRESHOLD: 'effect.practicalThreshold',
  EFFECT_SAMPLE_COUNT: 'effect.sampleCount',
  EFFECT_SAMPLE_COUNT_POSITIVE_REQUIRED: 'effect.sampleCount:positive_required',
  EFFECT_CONFIDENCE_INTERVAL_ESTIMATE_NOT_CONTAINED: 'effect.confidenceInterval:estimate_not_contained',
  PRICE_KIND_UNSUPPORTED: 'price.kind:unsupported',
  PRICE_VERSION_UNSUPPORTED: 'price.version:unsupported',
  PRICE_RECONSTRUCTION_MISMATCH: 'price:reconstruction_mismatch',
  VALID: 'valid',
  EFFECT_RECONSTRUCTION_MISMATCH: 'effect:reconstruction_mismatch',
});


const priceInputKeys = Object.freeze([
  'priceSheetId',
  'region',
  'currency',
  'priceDate',
  'validFrom',
  'validUntil',
  'billingGranularity',
  'reservationPolicy',
  'spotPolicy',
  'taxPolicy',
  'creditPolicy',
  'exclusions',
  'unitPrices',
]);
const pricePayloadKeys = Object.freeze(['version', ...priceInputKeys]);
const unitPriceKeys = Object.freeze(
  Object.values(BENCHMARK_RESOURCE_PRICE_UNIT),
);
const effectInputKeys = Object.freeze([
  'effectType',
  'numeratorSideId',
  'denominatorSideId',
  'numeratorValue',
  'denominatorValue',
  'confidenceInterval',
  'practicalThreshold',
  'sampleCount',
  'sourceDigests',
  'currency',
]);
const effectKeys = Object.freeze([
  'version',
  'effectType',
  'direction',
  'numeratorSideId',
  'denominatorSideId',
  'numeratorValue',
  'denominatorValue',
  'valueUnit',
  'currency',
  'estimate',
  'estimateUnit',
  'confidenceInterval',
  'practicalThreshold',
  'sampleCount',
  'sourceDigests',
  'effectDigest',
]);
const intervalKeys = Object.freeze(['lower', 'upper']);
const noCurrency = 'not_applicable';
const million = 1_000_000;
const maximumPriceExclusions = 64;
const timestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const priceDatePattern = /^\d{4}-\d{2}-\d{2}$/u;
const dateParse = Date.parse;
const mathMax = Math.max;
const numberIsFinite = Number.isFinite;
const regexpTest = Function.call.bind(RegExp.prototype.test);
const setAdd = Function.call.bind(Set.prototype.add);
const setHas = Function.call.bind(Set.prototype.has);

function fail(message) {
  throw new TypeError(message);
}

function assertTimestamp(value, path) {
  if (
    typeof value !== 'string' ||
    !regexpTest(timestampPattern, value) ||
    !numberIsFinite(dateParse(value))
  ) {
    fail(`${path}:iso_timestamp_required`);
  }
}

function copyExclusions(exclusions) {
  assertBenchmarkResourceArray(
    exclusions,
    localText.PRICE_EXCLUSIONS,
    maximumPriceExclusions,
  );
  const copy = [];
  const seen = new Set();
  for (let index = 0; index < exclusions.length; index += 1) {
    const exclusion = exclusions[index];
    assertBenchmarkResourceText(exclusion, `price.exclusions.${index}`);
    if (setHas(seen, exclusion)) fail(localText.PRICE_EXCLUSIONS_DUPLICATE);
    setAdd(seen, exclusion);
    appendOwnArrayValue(copy, exclusion);
  }
  return copy;
}

function copyUnitPrices(unitPrices) {
  assertBenchmarkResourceExactRecord(
    unitPrices,
    unitPriceKeys,
    localText.PRICE_UNIT_PRICES,
  );
  const copy = {};
  for (let index = 0; index < unitPriceKeys.length; index += 1) {
    const key = unitPriceKeys[index];
    assertBenchmarkResourceNumber(unitPrices[key], `price.unitPrices.${key}`);
    copy[key] = unitPrices[key];
  }
  return copy;
}

export function createBenchmarkResourcePriceSheet(input) {
  assertBenchmarkResourceExactRecord(input, priceInputKeys, localText.PRICE);
  const textFields = [
    'priceSheetId',
    'region',
    'currency',
    'priceDate',
    'billingGranularity',
    'reservationPolicy',
    'spotPolicy',
    'taxPolicy',
    'creditPolicy',
  ];
  for (let index = 0; index < textFields.length; index += 1) {
    const field = textFields[index];
    assertBenchmarkResourceText(input[field], `price.${field}`);
  }
  assertTimestamp(input.validFrom, localText.PRICE_VALID_FROM);
  assertTimestamp(input.validUntil, localText.PRICE_VALID_UNTIL);
  if (!regexpTest(priceDatePattern, input.priceDate)) {
    fail(localText.PRICE_PRICE_DATE_DATE_REQUIRED);
  }
  if (dateParse(input.validUntil) <= dateParse(input.validFrom)) {
    fail(localText.PRICE_VALIDITY_NOT_POSITIVE);
  }
  return createBenchmarkResourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.PRICE_SHEET,
    {
      version: BENCHMARK_RESOURCE_CONTRACT.PRICE_SHEET_VERSION,
      priceSheetId: input.priceSheetId,
      region: input.region,
      currency: input.currency,
      priceDate: input.priceDate,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      billingGranularity: input.billingGranularity,
      reservationPolicy: input.reservationPolicy,
      spotPolicy: input.spotPolicy,
      taxPolicy: input.taxPolicy,
      creditPolicy: input.creditPolicy,
      exclusions: copyExclusions(input.exclusions),
      unitPrices: copyUnitPrices(input.unitPrices),
    },
  );
}

function componentById(components, componentId) {
  for (let index = 0; index < components.length; index += 1) {
    if (components[index].componentId === componentId) {
      return components[index];
    }
  }
  return undefined;
}

function pricedProvisioned(component, durationSeconds) {
  const provisioned = component.provisioned;
  const minimum = component.minimumFootprint;
  return {
    cpuCoreSeconds:
      mathMax(provisioned.cpuCores, minimum.cpuCores) * durationSeconds,
    memoryByteSeconds:
      mathMax(provisioned.memoryBytes, minimum.memoryBytes) * durationSeconds,
    storageByteSeconds:
      mathMax(provisioned.storageBytes, minimum.storageBytes) * durationSeconds,
    iops: provisioned.iops * durationSeconds,
  };
}

function componentCost(sample, component, unitPrices) {
  const interZone = sample.utilized.interZoneNetworkBytes;
  if (interZone > sample.utilized.networkBytes) {
    fail(localText.RESOURCE_WINDOW_INTER_ZONE_NETWORK_BYTES_EXCEEDS_NETWORK);
  }
  if (
    component.billingTreatment ===
      BENCHMARK_RESOURCE_BILLING_TREATMENT.SYMMETRICALLY_EXCLUDED
  ) {
    return 0;
  }
  const provisioned = pricedProvisioned(component, sample.durationSeconds);
  const ordinaryNetwork = sample.utilized.networkBytes - interZone;
  return provisioned.cpuCoreSeconds *
      unitPrices[BENCHMARK_RESOURCE_PRICE_UNIT.CPU_CORE_SECOND] +
    provisioned.memoryByteSeconds *
      unitPrices[BENCHMARK_RESOURCE_PRICE_UNIT.MEMORY_BYTE_SECOND] +
    provisioned.storageByteSeconds *
      unitPrices[BENCHMARK_RESOURCE_PRICE_UNIT.STORAGE_BYTE_SECOND] +
    mathMax(provisioned.iops, sample.utilized.iops) *
      unitPrices[BENCHMARK_RESOURCE_PRICE_UNIT.IOP] +
    ordinaryNetwork *
      unitPrices[BENCHMARK_RESOURCE_PRICE_UNIT.NETWORK_BYTE] +
    interZone *
      unitPrices[BENCHMARK_RESOURCE_PRICE_UNIT.INTER_ZONE_NETWORK_BYTE];
}

export function computeBenchmarkResourceWindowCost(
  windowPayload,
  inventoryPayload,
  pricePayload,
) {
  const side = findBenchmarkResourceInventorySide(
    inventoryPayload,
    windowPayload.sideId,
  );
  if (side === undefined) fail(localText.RESOURCE_WINDOW_SIDE_NOT_IN_INVENTORY);
  if (side.components.length !== windowPayload.components.length) {
    fail(localText.RESOURCE_WINDOW_COMPONENTS_INVENTORY_COUNT_MISMATCH);
  }
  if (
    dateParse(windowPayload.startedAt) < dateParse(pricePayload.validFrom) ||
    dateParse(windowPayload.endedAt) >= dateParse(pricePayload.validUntil)
  ) {
    fail(localText.RESOURCE_WINDOW_PRICE_NOT_VALID_FOR_WINDOW);
  }
  let totalCost = 0;
  const seen = new Set();
  for (let index = 0; index < windowPayload.components.length; index += 1) {
    const sample = windowPayload.components[index];
    const component = componentById(side.components, sample.componentId);
    if (component === undefined || setHas(seen, sample.componentId)) {
      fail(localText.RESOURCE_WINDOW_COMPONENTS_INVENTORY_IDENTITY_MISMATCH);
    }
    setAdd(seen, sample.componentId);
    totalCost += componentCost(
      {...sample, durationSeconds: windowPayload.durationSeconds},
      component,
      pricePayload.unitPrices,
    );
  }
  if (windowPayload.correctSloEligibleOperations === 0) {
    fail(localText.RESOURCE_WINDOW_CORRECT_OPERATIONS_POSITIVE_REQUIRED_FOR_COST);
  }
  return {
    totalCost,
    costPerMillionCorrectOperations:
      totalCost / windowPayload.correctSloEligibleOperations * million,
    currency: pricePayload.currency,
  };
}

function effectContract(effectType, currency) {
  if (effectType === BENCHMARK_RESOURCE_EFFECT.CAPACITY) {
    if (currency !== noCurrency) fail(localText.EFFECT_CURRENCY_NOT_APPLICABLE_REQUIRED);
    return {
      direction: BENCHMARK_RESOURCE_EFFECT_DIRECTION.HIGHER_IS_BETTER,
      valueUnit: BENCHMARK_RESOURCE_EFFECT_UNIT.CAPACITY,
      currency: noCurrency,
    };
  }
  if (effectType === BENCHMARK_RESOURCE_EFFECT.COST) {
    assertBenchmarkResourceText(currency, localText.EFFECT_CURRENCY);
    if (currency === noCurrency) fail(localText.EFFECT_CURRENCY_CURRENCY_REQUIRED);
    return {
      direction: BENCHMARK_RESOURCE_EFFECT_DIRECTION.LOWER_IS_BETTER,
      valueUnit: BENCHMARK_RESOURCE_EFFECT_UNIT.COST,
      currency,
    };
  }
  fail(localText.EFFECT_EFFECT_TYPE_UNSUPPORTED);
}

function copySourceDigests(sourceDigests) {
  assertBenchmarkResourceArray(
    sourceDigests,
    localText.EFFECT_SOURCE_DIGESTS,
    BENCHMARK_RESOURCE_LIMIT.REFERENCES_PER_ARTIFACT,
  );
  if (sourceDigests.length === 0) {
    fail(localText.EFFECT_SOURCE_DIGESTS_NON_EMPTY_REQUIRED);
  }
  const copy = [];
  const seen = new Set();
  for (let index = 0; index < sourceDigests.length; index += 1) {
    const digest = sourceDigests[index];
    assertBenchmarkResourceDigest(digest, `effect.sourceDigests.${index}`);
    if (setHas(seen, digest)) fail(localText.EFFECT_SOURCE_DIGESTS_DUPLICATE);
    setAdd(seen, digest);
    appendOwnArrayValue(copy, digest);
  }
  return copy;
}

export function createBenchmarkResourcePairedEffect(input) {
  assertBenchmarkResourceExactRecord(input, effectInputKeys, localText.EFFECT);
  const contract = effectContract(input.effectType, input.currency);
  const sideFields = ['numeratorSideId', 'denominatorSideId'];
  for (let index = 0; index < sideFields.length; index += 1) {
    const field = sideFields[index];
    assertBenchmarkResourceText(input[field], `effect.${field}`);
  }
  if (input.numeratorSideId === input.denominatorSideId) {
    fail(localText.EFFECT_SIDES_DISTINCT_REQUIRED);
  }
  assertBenchmarkResourceNumber(input.numeratorValue, localText.EFFECT_NUMERATOR_VALUE);
  assertBenchmarkResourceNumber(
    input.denominatorValue,
    localText.EFFECT_DENOMINATOR_VALUE,
  );
  if (input.denominatorValue === 0) {
    fail(localText.EFFECT_DENOMINATOR_VALUE_POSITIVE_REQUIRED);
  }
  assertBenchmarkResourceExactRecord(
    input.confidenceInterval,
    intervalKeys,
    localText.EFFECT_CONFIDENCE_INTERVAL,
  );
  assertBenchmarkResourceNumber(
    input.confidenceInterval.lower,
    localText.EFFECT_CONFIDENCE_INTERVAL_LOWER,
  );
  assertBenchmarkResourceNumber(
    input.confidenceInterval.upper,
    localText.EFFECT_CONFIDENCE_INTERVAL_UPPER,
  );
  if (input.confidenceInterval.lower > input.confidenceInterval.upper) {
    fail(localText.EFFECT_CONFIDENCE_INTERVAL_REVERSED);
  }
  assertBenchmarkResourceNumber(
    input.practicalThreshold,
    localText.EFFECT_PRACTICAL_THRESHOLD,
  );
  assertBenchmarkResourceInteger(input.sampleCount, localText.EFFECT_SAMPLE_COUNT);
  if (input.sampleCount === 0) fail(localText.EFFECT_SAMPLE_COUNT_POSITIVE_REQUIRED);
  const sourceDigests = copySourceDigests(input.sourceDigests);
  const body = {
    version: BENCHMARK_RESOURCE_CONTRACT.EFFECT_VERSION,
    effectType: input.effectType,
    direction: contract.direction,
    numeratorSideId: input.numeratorSideId,
    denominatorSideId: input.denominatorSideId,
    numeratorValue: input.numeratorValue,
    denominatorValue: input.denominatorValue,
    valueUnit: contract.valueUnit,
    currency: contract.currency,
    estimate: input.numeratorValue / input.denominatorValue,
    estimateUnit: BENCHMARK_RESOURCE_EFFECT_UNIT.RATIO,
    confidenceInterval: {
      lower: input.confidenceInterval.lower,
      upper: input.confidenceInterval.upper,
    },
    practicalThreshold: input.practicalThreshold,
    sampleCount: input.sampleCount,
    sourceDigests,
  };
  if (
    body.estimate < body.confidenceInterval.lower ||
    body.estimate > body.confidenceInterval.upper
  ) {
    fail(localText.EFFECT_CONFIDENCE_INTERVAL_ESTIMATE_NOT_CONTAINED);
  }
  return {...body, effectDigest: digestBenchmarkSemanticData(body)};
}

export function inspectBenchmarkResourcePriceSheetArtifact(artifact) {
  try {
    if (artifact.kind !== BENCHMARK_RESOURCE_ARTIFACT_KIND.PRICE_SHEET) {
      fail(localText.PRICE_KIND_UNSUPPORTED);
    }
    const payload = artifact.payload;
    assertBenchmarkResourceExactRecord(payload, pricePayloadKeys, localText.PRICE);
    if (payload.version !== BENCHMARK_RESOURCE_CONTRACT.PRICE_SHEET_VERSION) {
      fail(localText.PRICE_VERSION_UNSUPPORTED);
    }
    const reconstructed = createBenchmarkResourcePriceSheet({
      priceSheetId: payload.priceSheetId,
      region: payload.region,
      currency: payload.currency,
      priceDate: payload.priceDate,
      validFrom: payload.validFrom,
      validUntil: payload.validUntil,
      billingGranularity: payload.billingGranularity,
      reservationPolicy: payload.reservationPolicy,
      spotPolicy: payload.spotPolicy,
      taxPolicy: payload.taxPolicy,
      creditPolicy: payload.creditPolicy,
      exclusions: payload.exclusions,
      unitPrices: payload.unitPrices,
    });
    if (
      digestBenchmarkSemanticData(reconstructed.artifact) !==
        digestBenchmarkSemanticData(artifact)
    ) {
      fail(localText.PRICE_RECONSTRUCTION_MISMATCH);
    }
    return {valid: true, reason: localText.VALID};
  } catch (error) {
    return {valid: false, reason: error.message};
  }
}

export function inspectBenchmarkResourcePairedEffect(effect) {
  try {
    assertBenchmarkResourceExactRecord(effect, effectKeys, localText.EFFECT);
    const reconstructed = createBenchmarkResourcePairedEffect({
      effectType: effect.effectType,
      numeratorSideId: effect.numeratorSideId,
      denominatorSideId: effect.denominatorSideId,
      numeratorValue: effect.numeratorValue,
      denominatorValue: effect.denominatorValue,
      confidenceInterval: effect.confidenceInterval,
      practicalThreshold: effect.practicalThreshold,
      sampleCount: effect.sampleCount,
      sourceDigests: effect.sourceDigests,
      currency: effect.currency,
    });
    if (
      digestBenchmarkSemanticData(reconstructed) !==
        digestBenchmarkSemanticData(effect)
    ) {
      fail(localText.EFFECT_RECONSTRUCTION_MISMATCH);
    }
    return {valid: true, reason: localText.VALID};
  } catch (error) {
    return {valid: false, reason: error.message};
  }
}

export {noCurrency as BENCHMARK_RESOURCE_NO_CURRENCY};
