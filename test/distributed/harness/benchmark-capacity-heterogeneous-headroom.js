import {
  digestBenchmarkSemanticData,
  hasExactOwnDataKeys,
  isNonNegativeSafeNumber,
  isPlainDataRecord,
} from './benchmark-semantic-integrity.js';
import {
  inspectBenchmarkCapacityRunSample,
} from './benchmark-capacity-run-sample.js';

const HEADROOM_INPUT_KEYS = Object.freeze([
  'minimumRequiredRatio', 'observerCpu', 'hostCpu',
  'hostMemory', 'sharedNetwork', 'sharedStorage',
]);
const EXTERNAL_HEADROOM_KEYS = Object.freeze([
  'capacity',
  'observedPeak',
]);
const HEADROOM_KEYS = Object.freeze([
  'minimumRequiredRatio',
  'externalEmitter',
  'clientQueue',
  'observerCpu',
  'hostCpu',
  'hostMemory',
  'sharedNetwork',
  'sharedStorage',
  'minimumObservedRatio',
  'eligible',
  'headroomDigest',
]);
const HEADROOM_MEASUREMENT_KEYS = Object.freeze([
  'capacity',
  'observedPeak',
  'headroomRatio',
]);
const HEADROOM_MEASUREMENT_RECEIPT_KEYS = Object.freeze([
  'externalEmitter',
  'clientQueue',
  'observerCpu',
  'hostCpu',
  'hostMemory',
  'sharedNetwork',
  'sharedStorage',
]);
const mathMax = Math.max;
const mathMin = Math.min;
const localText = Object.freeze({
  EXACT_RECORD: 'headroom:exact_plain_data_record_required',
  INELIGIBLE_OR_DIGEST_MISMATCH:
    'headroom:ineligible_or_digest_mismatch',
  MINIMUM_REQUIRED_RATIO: 'headroom.minimumRequiredRatio',
  SAMPLE_INVALID: 'headroom.sample:invalid',
  SHAPE_INVALID: 'headroom:shape_invalid',
});

function fail(reason) {
  throw new TypeError(
    `invalid heterogeneous capacity observation: ${reason}`,
  );
}

function assertRatio(value, path) {
  if (
    !isNonNegativeSafeNumber(value) ||
    value > 1
  ) {
    fail(`${path}:ratio_required`);
  }
}

function headroomMeasurement(input, path) {
  if (!hasExactOwnDataKeys(input, EXTERNAL_HEADROOM_KEYS)) {
    fail(`${path}:exact_plain_data_record_required`);
  }
  if (
    !isNonNegativeSafeNumber(input.capacity) ||
    input.capacity <= 0 ||
    !isNonNegativeSafeNumber(input.observedPeak) ||
    input.observedPeak > input.capacity
  ) {
    fail(`${path}:bounded_measurement_required`);
  }
  return {
    capacity: input.capacity,
    observedPeak: input.observedPeak,
    headroomRatio:
      (input.capacity - input.observedPeak) / input.capacity,
  };
}

function maximumNonNull(values) {
  let maximum = 0;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] !== null && values[index] > maximum) {
      maximum = values[index];
    }
  }
  return maximum;
}

function headroomBody(input, sample) {
  if (
    !isPlainDataRecord(input) ||
    !hasExactOwnDataKeys(input, HEADROOM_INPUT_KEYS)
  ) {
    fail(localText.EXACT_RECORD);
  }
  assertRatio(
    input.minimumRequiredRatio,
    localText.MINIMUM_REQUIRED_RATIO,
  );
  const externalEmitter = headroomMeasurement({
    capacity: mathMax(1, sample.maxReleaseLagMs),
    observedPeak: maximumNonNull(sample.releaseLagMs),
  }, 'headroom.externalEmitter');
  const clientQueue = headroomMeasurement({
    capacity: sample.operationTimeoutMs,
    observedPeak: maximumNonNull(sample.clientQueueDelayMs),
  }, 'headroom.clientQueue');
  const body = {
    minimumRequiredRatio: input.minimumRequiredRatio,
    externalEmitter,
    clientQueue,
  };
  for (let index = 1; index < HEADROOM_INPUT_KEYS.length; index += 1) {
    const key = HEADROOM_INPUT_KEYS[index];
    body[key] = headroomMeasurement(input[key], `headroom.${key}`);
  }
  let minimumObservedRatio = 1;
  for (let index = 1;
    index < HEADROOM_INPUT_KEYS.length + 2;
    index += 1) {
    minimumObservedRatio = mathMin(
      minimumObservedRatio,
      body[HEADROOM_KEYS[index]].headroomRatio,
    );
  }
  return {
    ...body,
    minimumObservedRatio,
    eligible: minimumObservedRatio >= input.minimumRequiredRatio,
  };
}

function headroomReceiptBody(receipt) {
  const body = {};
  for (let index = 0; index < HEADROOM_KEYS.length - 1; index += 1) {
    const key = HEADROOM_KEYS[index];
    body[key] = receipt[key];
  }
  return body;
}

export function createBenchmarkCapacityHeadroomReceipt(input, sample) {
  const inspection = inspectBenchmarkCapacityRunSample(sample);
  if (!inspection.valid) fail(localText.SAMPLE_INVALID);
  const body = headroomBody(input, sample);
  return Object.freeze({
    ...body,
    headroomDigest: digestBenchmarkSemanticData(body),
  });
}

export function assertBenchmarkCapacityHeadroomReceipt(receipt, sample) {
  if (!hasExactOwnDataKeys(receipt, HEADROOM_KEYS)) {
    fail(localText.SHAPE_INVALID);
  }
  for (let index = 0;
    index < HEADROOM_MEASUREMENT_RECEIPT_KEYS.length;
    index += 1) {
    const key = HEADROOM_MEASUREMENT_RECEIPT_KEYS[index];
    if (!hasExactOwnDataKeys(receipt[key], HEADROOM_MEASUREMENT_KEYS)) {
      fail(`headroom.${key}:shape_invalid`);
    }
  }
  const input = {minimumRequiredRatio: receipt.minimumRequiredRatio};
  for (let index = 1; index < HEADROOM_INPUT_KEYS.length; index += 1) {
    const key = HEADROOM_INPUT_KEYS[index];
    input[key] = {
      capacity: receipt[key].capacity,
      observedPeak: receipt[key].observedPeak,
    };
  }
  const reconstructed =
    createBenchmarkCapacityHeadroomReceipt(input, sample);
  if (
    reconstructed.headroomDigest !== receipt.headroomDigest ||
    digestBenchmarkSemanticData(headroomReceiptBody(receipt)) !==
      receipt.headroomDigest ||
    reconstructed.eligible !== true
  ) {
    fail(localText.INELIGIBLE_OR_DIGEST_MISMATCH);
  }
  return true;
}
