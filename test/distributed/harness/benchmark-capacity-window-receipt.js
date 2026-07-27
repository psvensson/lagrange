import {
  digestBenchmarkSemanticData,
  hasExactOwnDataKeys,
  isNonNegativeSafeInteger,
  isSha256Digest,
} from './benchmark-semantic-integrity.js';
import {
  BENCHMARK_CAPACITY_PHASE,
  BENCHMARK_CAPACITY_MAX_TEXT_CODE_UNITS,
  BENCHMARK_CAPACITY_RECEIPT_CLOCK,
  BENCHMARK_CAPACITY_RECEIPT_INTERVAL,
  BENCHMARK_CAPACITY_WINDOW_RECEIPT_VERSION,
} from './benchmark-capacity-protocol-constants.js';
import {
  deriveBenchmarkCapacityExpectedWindow,
} from './benchmark-capacity-preregistration.js';
import {
  inspectBenchmarkCapacityRunSample,
} from './benchmark-capacity-run-sample.js';

const INPUT_KEYS = [
  'blockIndex',
  'blockedOrderIndex',
  'sideId',
  'phase',
  'offeredLoad',
  'startedAt',
  'endedAt',
  'capacitySampleDigest',
  'semanticReceiptDigest',
  'liveEngagementDigest',
  'resourceWindowDigest',
];
const EXECUTION_IDENTITY_KEYS = [
  'matrixId',
  'cellId',
  'cellManifestDigest',
  'profileIdentity',
  'pairIdentity',
  'runId',
  'liveEnvironmentContractDigest',
];
const RECEIPT_KEYS = [
  'version',
  ...EXECUTION_IDENTITY_KEYS,
  'blockIndex',
  'blockedOrderIndex',
  'sideId',
  'phase',
  'offeredLoad',
  'clock',
  'interval',
  'startedAt',
  'endedAt',
  'observationDurationMs',
  'capacitySampleDigest',
  'semanticReceiptDigest',
  'liveEngagementDigest',
  'resourceWindowDigest',
  'windowReceiptDigest',
];
const objectFreeze = Object.freeze;

function fail(reason) {
  throw new TypeError(`invalid benchmark capacity window receipt: ${reason}`);
}

function assertText(value, field) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > BENCHMARK_CAPACITY_MAX_TEXT_CODE_UNITS
  ) {
    fail(`${field}:primitive_text_required`);
  }
}

function assertDigest(value, field, nullable = false) {
  if (nullable && value === null) return;
  if (!isSha256Digest(value)) {
    fail(`${field}:sha256_digest_required`);
  }
}

function assertInputDigests(input) {
  assertText(input.sideId, 'sideId');
  const digestFields = [
    'capacitySampleDigest',
    'liveEngagementDigest',
  ];
  for (let index = 0; index < digestFields.length; index += 1) {
    const field = digestFields[index];
    assertDigest(input[field], field);
  }
  assertDigest(input.semanticReceiptDigest, 'semanticReceiptDigest', true);
  assertDigest(input.resourceWindowDigest, 'resourceWindowDigest', true);
}

function assertWindowCoordinates(input) {
  const integerFields = [
    'blockIndex',
    'blockedOrderIndex',
    'startedAt',
    'endedAt',
  ];
  for (let index = 0; index < integerFields.length; index += 1) {
    const field = integerFields[index];
    if (!isNonNegativeSafeInteger(input[field])) {
      fail(`${field}:non_negative_safe_integer_required`);
    }
  }
  if (
    !isNonNegativeSafeInteger(input.offeredLoad) ||
    input.offeredLoad === 0
  ) {
    fail('offeredLoad:positive_safe_integer_required');
  }
  if (input.endedAt < input.startedAt) {
    fail('time_window:reversed');
  }
  if (input.endedAt === input.startedAt) {
    fail('time_window:positive_coverage_required');
  }
  if (
    input.phase !== BENCHMARK_CAPACITY_PHASE.WARMUP &&
    input.phase !== BENCHMARK_CAPACITY_PHASE.MEASURED
  ) {
    fail('phase:unsupported');
  }
}

function assertSampleBinding(input, sample) {
  const sampleInspection = inspectBenchmarkCapacityRunSample(sample);
  if (
    !sampleInspection.valid ||
    sample.sampleDigest !== input.capacitySampleDigest ||
    sample.sideId !== input.sideId ||
    sample.phase !== input.phase ||
    sample.blockIndex !== input.blockIndex ||
    sample.offeredLoadPerSecond !== input.offeredLoad ||
    sample.observationDurationMs > input.endedAt - input.startedAt ||
    (
      sample.counts.correct === 0 &&
      input.semanticReceiptDigest !== null
    ) ||
    (
      sample.counts.correct > 0 &&
      input.semanticReceiptDigest !== sample.semanticReceiptDigest
    )
  ) {
    fail('capacity_sample:resolver_binding_mismatch');
  }
}

function assertInput(input, sample, preregistration) {
  if (!hasExactOwnDataKeys(input, INPUT_KEYS)) {
    fail('root:exact_plain_data_record_required');
  }
  assertInputDigests(input);
  assertWindowCoordinates(input);
  assertSampleBinding(input, sample);
  return deriveBenchmarkCapacityExpectedWindow(preregistration, {
    blockIndex: input.blockIndex,
    blockedOrderIndex: input.blockedOrderIndex,
    sideId: input.sideId,
    offeredLoad: input.offeredLoad,
    phase: input.phase,
  });
}
function inputFromReceipt(receipt, resourceWindowDigest) {
  return {
    blockIndex: receipt.blockIndex,
    blockedOrderIndex: receipt.blockedOrderIndex,
    sideId: receipt.sideId,
    phase: receipt.phase,
    offeredLoad: receipt.offeredLoad,
    startedAt: receipt.startedAt,
    endedAt: receipt.endedAt,
    capacitySampleDigest: receipt.capacitySampleDigest,
    semanticReceiptDigest: receipt.semanticReceiptDigest,
    liveEngagementDigest: receipt.liveEngagementDigest,
    resourceWindowDigest,
  };
}

function receiptBody(receipt) {
  const body = {};
  for (let index = 0; index < RECEIPT_KEYS.length - 1; index += 1) {
    const key = RECEIPT_KEYS[index];
    body[key] = receipt[key];
  }
  return body;
}

export function createBenchmarkCapacityWindowReceipt(
  input,
  sample,
  preregistration,
) {
  const expected = assertInput(input, sample, preregistration);
  const body = {
    version: BENCHMARK_CAPACITY_WINDOW_RECEIPT_VERSION,
    matrixId: expected.matrixId,
    cellId: expected.cellId,
    cellManifestDigest: expected.cellManifestDigest,
    profileIdentity: expected.profileIdentity,
    pairIdentity: expected.pairIdentity,
    runId: expected.runId,
    liveEnvironmentContractDigest:
      expected.liveEnvironmentContractDigest,
    blockIndex: input.blockIndex,
    blockedOrderIndex: input.blockedOrderIndex,
    sideId: input.sideId,
    phase: input.phase,
    offeredLoad: input.offeredLoad,
    clock: BENCHMARK_CAPACITY_RECEIPT_CLOCK,
    interval: BENCHMARK_CAPACITY_RECEIPT_INTERVAL,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    observationDurationMs: sample.observationDurationMs,
    capacitySampleDigest: input.capacitySampleDigest,
    semanticReceiptDigest: input.semanticReceiptDigest,
    liveEngagementDigest: input.liveEngagementDigest,
    resourceWindowDigest: input.resourceWindowDigest,
  };
  return objectFreeze({
    ...body,
    windowReceiptDigest: digestBenchmarkSemanticData(body),
  });
}

export function inspectBenchmarkCapacityWindowReceipt(
  receipt,
  sample,
  preregistration,
) {
  if (!hasExactOwnDataKeys(receipt, RECEIPT_KEYS)) {
    return {valid: false, reason: 'window_receipt_shape_invalid'};
  }
  try {
    const reconstructed = createBenchmarkCapacityWindowReceipt(
      inputFromReceipt(receipt, receipt.resourceWindowDigest),
      sample,
      preregistration,
    );
    const valid =
      receipt.version === BENCHMARK_CAPACITY_WINDOW_RECEIPT_VERSION &&
      receipt.clock === BENCHMARK_CAPACITY_RECEIPT_CLOCK &&
      receipt.interval === BENCHMARK_CAPACITY_RECEIPT_INTERVAL &&
      receipt.observationDurationMs === sample.observationDurationMs &&
      isSha256Digest(receipt.windowReceiptDigest) &&
      digestBenchmarkSemanticData(receiptBody(receipt)) ===
        receipt.windowReceiptDigest &&
      reconstructed.windowReceiptDigest === receipt.windowReceiptDigest;
    return {
      valid,
      reason: valid ? 'valid' : 'window_receipt_digest_mismatch',
      resourceWindowComplete: valid && receipt.resourceWindowDigest !== null,
    };
  } catch {
    return {valid: false, reason: 'window_receipt_fields_invalid'};
  }
}

export function completeBenchmarkCapacityResourceWindow(
  receipt,
  resourceWindowDigest,
  sample,
  preregistration,
) {
  const inspection = inspectBenchmarkCapacityWindowReceipt(
    receipt,
    sample,
    preregistration,
  );
  if (!inspection.valid) {
    fail(`completion_source:${inspection.reason}`);
  }
  if (receipt.resourceWindowDigest !== null) {
    fail('resourceWindowDigest:already_complete');
  }
  assertDigest(resourceWindowDigest, 'resourceWindowDigest');
  return createBenchmarkCapacityWindowReceipt(
    inputFromReceipt(receipt, resourceWindowDigest),
    sample,
    preregistration,
  );
}
