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
  BENCHMARK_RESOURCE_ARTIFACT_KIND,
  BENCHMARK_RESOURCE_LIMIT,
} from './benchmark-resource-contract-constants.js';
const localText = Object.freeze({
  CAPACITY_SOURCE_DIGESTS: 'capacity.sourceDigests',
  CAPACITY_SOURCE_DIGESTS_NON_EMPTY_REQUIRED: 'capacity.sourceDigests:non_empty_required',
  CAPACITY_SOURCE_DIGESTS_DUPLICATE: 'capacity.sourceDigests:duplicate',
  CAPACITY: 'capacity',
  CAPACITY_SIDE_ID: 'capacity.sideId',
  CAPACITY_CAPACITY_CORRECT_OPS_PER_SECOND: 'capacity.capacityCorrectOpsPerSecond',
  CAPACITY_CAPACITY_CORRECT_OPS_PER_SECOND_POSITIVE_REQUIRED: 'capacity.capacityCorrectOpsPerSecond:positive_required',
  CAPACITY_SAMPLE_COUNT: 'capacity.sampleCount',
  CAPACITY_SAMPLE_COUNT_POSITIVE_REQUIRED: 'capacity.sampleCount:positive_required',
  CAPACITY_CONFIDENCE_INTERVAL: 'capacity.confidenceInterval',
  CAPACITY_CONFIDENCE_INTERVAL_LOWER: 'capacity.confidenceInterval.lower',
  CAPACITY_CONFIDENCE_INTERVAL_UPPER: 'capacity.confidenceInterval.upper',
  CAPACITY_CONFIDENCE_INTERVAL_INVALID: 'capacity.confidenceInterval:invalid',
  CAPACITY_KIND_UNSUPPORTED: 'capacity.kind:unsupported',
  CAPACITY_RECONSTRUCTION_MISMATCH: 'capacity:reconstruction_mismatch',
  VALID: 'valid',
});


const inputKeys = Object.freeze([
  'sideId',
  'capacityCorrectOpsPerSecond',
  'sampleCount',
  'confidenceInterval',
  'sourceDigests',
]);
const payloadKeys =
  Object.freeze([...inputKeys, 'capacitySummaryDigest']);
const intervalKeys = Object.freeze(['lower', 'upper']);
const setAdd = Function.call.bind(Set.prototype.add);
const setHas = Function.call.bind(Set.prototype.has);

function fail(message) {
  throw new TypeError(message);
}

function copySourceDigests(values) {
  assertBenchmarkResourceArray(
    values,
    localText.CAPACITY_SOURCE_DIGESTS,
    BENCHMARK_RESOURCE_LIMIT.REFERENCES_PER_ARTIFACT,
  );
  if (values.length === 0) {
    fail(localText.CAPACITY_SOURCE_DIGESTS_NON_EMPTY_REQUIRED);
  }
  const copy = [];
  const seen = new Set();
  for (let index = 0; index < values.length; index += 1) {
    assertBenchmarkResourceDigest(
      values[index],
      `capacity.sourceDigests.${index}`,
    );
    if (setHas(seen, values[index])) {
      fail(localText.CAPACITY_SOURCE_DIGESTS_DUPLICATE);
    }
    setAdd(seen, values[index]);
    appendOwnArrayValue(copy, values[index]);
  }
  return copy;
}

export function createBenchmarkResourceCapacitySummary(input) {
  assertBenchmarkResourceExactRecord(input, inputKeys, localText.CAPACITY);
  assertBenchmarkResourceText(input.sideId, localText.CAPACITY_SIDE_ID);
  assertBenchmarkResourceNumber(
    input.capacityCorrectOpsPerSecond,
    localText.CAPACITY_CAPACITY_CORRECT_OPS_PER_SECOND,
  );
  if (input.capacityCorrectOpsPerSecond === 0) {
    fail(localText.CAPACITY_CAPACITY_CORRECT_OPS_PER_SECOND_POSITIVE_REQUIRED);
  }
  assertBenchmarkResourceInteger(input.sampleCount, localText.CAPACITY_SAMPLE_COUNT);
  if (input.sampleCount === 0) fail(localText.CAPACITY_SAMPLE_COUNT_POSITIVE_REQUIRED);
  assertBenchmarkResourceExactRecord(
    input.confidenceInterval,
    intervalKeys,
    localText.CAPACITY_CONFIDENCE_INTERVAL,
  );
  assertBenchmarkResourceNumber(
    input.confidenceInterval.lower,
    localText.CAPACITY_CONFIDENCE_INTERVAL_LOWER,
  );
  assertBenchmarkResourceNumber(
    input.confidenceInterval.upper,
    localText.CAPACITY_CONFIDENCE_INTERVAL_UPPER,
  );
  if (
    input.confidenceInterval.lower > input.confidenceInterval.upper ||
    input.capacityCorrectOpsPerSecond < input.confidenceInterval.lower ||
    input.capacityCorrectOpsPerSecond > input.confidenceInterval.upper
  ) {
    fail(localText.CAPACITY_CONFIDENCE_INTERVAL_INVALID);
  }
  const sourceDigests = copySourceDigests(input.sourceDigests);
  const body = {
    sideId: input.sideId,
    capacityCorrectOpsPerSecond: input.capacityCorrectOpsPerSecond,
    sampleCount: input.sampleCount,
    confidenceInterval: {
      lower: input.confidenceInterval.lower,
      upper: input.confidenceInterval.upper,
    },
    sourceDigests,
  };
  return createBenchmarkResourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.CAPACITY_REPORT,
    {...body, capacitySummaryDigest: digestBenchmarkSemanticData(body)},
    sourceDigests,
  );
}

export function inspectBenchmarkResourceCapacitySummaryArtifact(artifact) {
  try {
    if (artifact.kind !== BENCHMARK_RESOURCE_ARTIFACT_KIND.CAPACITY_REPORT) {
      fail(localText.CAPACITY_KIND_UNSUPPORTED);
    }
    assertBenchmarkResourceExactRecord(
      artifact.payload,
      payloadKeys,
      localText.CAPACITY,
    );
    const payload = artifact.payload;
    const reconstructed = createBenchmarkResourceCapacitySummary({
      sideId: payload.sideId,
      capacityCorrectOpsPerSecond: payload.capacityCorrectOpsPerSecond,
      sampleCount: payload.sampleCount,
      confidenceInterval: payload.confidenceInterval,
      sourceDigests: payload.sourceDigests,
    });
    if (
      digestBenchmarkSemanticData(reconstructed.artifact) !==
        digestBenchmarkSemanticData(artifact)
    ) {
      fail(localText.CAPACITY_RECONSTRUCTION_MISMATCH);
    }
    return {valid: true, reason: localText.VALID};
  } catch (error) {
    return {valid: false, reason: error.message};
  }
}
