import {
  appendOwnArrayValue,
  digestBenchmarkSemanticData,
  hasExactOwnDataKeys,
  isDenseDataArray,
  isNonNegativeSafeInteger,
  isNonNegativeSafeNumber,
  isPlainDataRecord,
  isSha256Digest,
} from './benchmark-semantic-integrity.js';
import {
  BENCHMARK_CAPACITY_MILLISECONDS_PER_SECOND,
  BENCHMARK_CAPACITY_MAX_TEXT_CODE_UNITS,
  BENCHMARK_CAPACITY_PHASE,
  BENCHMARK_CAPACITY_SAMPLE_VERSION,
  BENCHMARK_CAPACITY_SCHEDULE_MODE,
} from './benchmark-capacity-protocol-constants.js';
import {
  BENCHMARK_SQL_DIALECT,
  inspectBenchmarkSemanticReceipt,
} from './benchmark-workload-semantics.js';

const SAMPLE_INPUT_KEYS = [
  'sideId',
  'phase',
  'blockIndex',
  'offeredLoadPerSecond',
  'windowDurationMs',
  'observationStartedAtMs',
  'observationEndedAtMs',
  'operationTimeoutMs',
  'maxReleaseLagMs',
  'clientMaxInFlight',
  'clientMaxQueueDepth',
  'counts',
  'rejectedByReason',
  'endToEndLatencyMs',
  'clientQueueDelayMs',
  'releaseOffsetsMs',
  'releaseLagMs',
  'unreleasedOperations',
  'semanticDialect',
  'semanticReceipt',
];
const SAMPLE_KEYS = [
  'version',
  'scheduleMode',
  'queueingIncluded',
  ...SAMPLE_INPUT_KEYS,
  'observationDurationMs',
  'semanticReceiptDigest',
  'correctThroughputPerSecond',
  'errorRate',
  'sampleDigest',
];
const COUNT_KEYS = [
  'offered',
  'dispatched',
  'correct',
  'rejected',
  'timedOut',
  'errored',
  'queueOverflow',
  'undispatched',
  'cancelled',
];
const REJECT_REASON_KEYS = ['queueFull', 'flowControl', 'admission'];
const mathCeil = Math.ceil;
const mathFloor = Math.floor;
const mathMax = Math.max;
const localText = Object.freeze({
  CLIENT_QUEUE_DELAY_COUNT:
    'client_queue_delay_samples:must_equal_dispatched_count',
  COUNTS_ACCOUNTING: 'counts:accounting_does_not_reconcile',
  COUNTS_OFFERED_SCHEDULE:
    'counts.offered:does_not_match_open_loop_schedule',
  COUNTS_SHAPE: 'counts:exact_plain_data_record_required',
  DERIVED_METRICS_UNSAFE: 'derived_metrics:unsafe',
  END_TO_END_LATENCY_COUNT:
    'end_to_end_latency_samples:must_equal_correct_count',
  OBSERVATION_CLOCK: 'observationClock:monotonic_interval_required',
  OFFERED_LOAD: 'offeredLoadPerSecond:positive_safe_number_required',
  PHASE_UNSUPPORTED: 'phase:unsupported',
  REJECTED_REASON_SHAPE:
    'rejectedByReason:exact_plain_data_record_required',
  RELEASE_LAG_COUNT: 'releaseLagMs:does_not_match_offered_count',
  RELEASE_LAG_DENSE: 'releaseLagMs:dense_array_required',
  RELEASE_OFFSET_COUNT:
    'releaseOffsetsMs:does_not_match_offered_count',
  ROOT_SHAPE: 'root:exact_plain_data_record_required',
  SAMPLE_DIGEST_MISMATCH: 'sample_digest_mismatch',
  SAMPLE_FIELDS_INVALID: 'sample_fields_invalid',
  SAMPLE_SHAPE_INVALID: 'sample_shape_invalid',
  SAMPLE_VALID: 'valid',
  SEMANTIC_DIALECT_UNSUPPORTED: 'semanticDialect:unsupported',
  SEMANTIC_RECEIPT_REQUIRED_ABSENCE:
    'semanticReceipt:must_be_null_without_correct_operations',
  SEMANTIC_RECEIPT_INVALID:
    'semanticReceipt:valid_matching_c2_receipt_required',
  SIDE_ID: 'sideId',
  UNRELEASED_ACCOUNTING:
    'unreleasedOperations:accounting_mismatch',
});

function fail(path) {
  throw new TypeError(`invalid capacity run sample: ${path}`);
}

function assertPrimitiveText(value, path) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > BENCHMARK_CAPACITY_MAX_TEXT_CODE_UNITS
  ) {
    fail(`${path}:primitive_text_required`);
  }
}

function copySafeNumberArray(values, path, integersOnly = false) {
  if (!isDenseDataArray(values)) {
    fail(`${path}:dense_array_required`);
  }
  const copied = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const valid = integersOnly ?
      isNonNegativeSafeInteger(value) :
      isNonNegativeSafeNumber(value);
    if (!valid) {
      fail(`${path}.${index}:safe_number_required`);
    }
    appendOwnArrayValue(copied, value);
  }
  return copied;
}

function copyReleaseLagArray(values) {
  if (!isDenseDataArray(values)) {
    fail(localText.RELEASE_LAG_DENSE);
  }
  const copied = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value !== null && !isNonNegativeSafeNumber(value)) {
      fail(`releaseLagMs.${index}:safe_number_or_null_required`);
    }
    appendOwnArrayValue(copied, value);
  }
  return copied;
}

function copyCounts(counts) {
  if (!hasExactOwnDataKeys(counts, COUNT_KEYS)) {
    fail(localText.COUNTS_SHAPE);
  }
  const copied = {};
  for (let index = 0; index < COUNT_KEYS.length; index += 1) {
    const key = COUNT_KEYS[index];
    if (!isNonNegativeSafeInteger(counts[key])) {
      fail(`counts.${key}:non_negative_safe_integer_required`);
    }
    copied[key] = counts[key];
  }
  return copied;
}

function copyRejectedByReason(reasons) {
  if (!hasExactOwnDataKeys(reasons, REJECT_REASON_KEYS)) {
    fail(localText.REJECTED_REASON_SHAPE);
  }
  const copied = {};
  for (let index = 0; index < REJECT_REASON_KEYS.length; index += 1) {
    const key = REJECT_REASON_KEYS[index];
    if (!isNonNegativeSafeInteger(reasons[key])) {
      fail(`rejectedByReason.${key}:non_negative_safe_integer_required`);
    }
    copied[key] = reasons[key];
  }
  return copied;
}

function assertAccounting(counts, reasons) {
  const rejectedTotal =
    reasons.queueFull + reasons.flowControl + reasons.admission;
  const dispatchedTerminal =
    counts.correct +
    counts.timedOut +
    counts.errored +
    reasons.admission +
    counts.cancelled;
  const offeredTotal =
    counts.dispatched +
    reasons.queueFull +
    reasons.flowControl +
    counts.undispatched;
  if (
    !isNonNegativeSafeInteger(rejectedTotal) ||
    !isNonNegativeSafeInteger(dispatchedTerminal) ||
    !isNonNegativeSafeInteger(offeredTotal) ||
    counts.rejected !== rejectedTotal ||
    counts.queueOverflow !== reasons.queueFull ||
    counts.dispatched !== dispatchedTerminal ||
    counts.offered !== offeredTotal
  ) {
    fail(localText.COUNTS_ACCOUNTING);
  }
}

function assertReleaseLag(sample, expectedOffered) {
  if (
    sample.unreleasedOperations > sample.counts.undispatched ||
    sample.unreleasedOperations > expectedOffered
  ) {
    fail(localText.UNRELEASED_ACCOUNTING);
  }
  let previous = -1;
  for (let index = 0; index < sample.releaseOffsetsMs.length; index += 1) {
    const offset = sample.releaseOffsetsMs[index];
    const expectedOffset = mathFloor(
      index * BENCHMARK_CAPACITY_MILLISECONDS_PER_SECOND /
      sample.offeredLoadPerSecond,
    );
    if (offset !== expectedOffset || offset < previous) {
      fail(`releaseOffsetsMs.${index}:absolute_schedule_mismatch`);
    }
    const releaseLagMs = sample.releaseLagMs[index];
    const isUnreleasedSuffix =
      index >= expectedOffered - sample.unreleasedOperations;
    if (
      (isUnreleasedSuffix && releaseLagMs !== null) ||
      (!isUnreleasedSuffix && releaseLagMs === null)
    ) {
      fail(`releaseLagMs.${index}:unreleased_suffix_mismatch`);
    }
    if (
      releaseLagMs !== null &&
      releaseLagMs > sample.maxReleaseLagMs
    ) {
      fail(`releaseLagMs.${index}:sealed_tolerance_exceeded`);
    }
    previous = offset;
  }
}

function assertSchedule(sample) {
  const expectedOffered = mathFloor(
    sample.offeredLoadPerSecond *
    sample.windowDurationMs /
    BENCHMARK_CAPACITY_MILLISECONDS_PER_SECOND,
  );
  if (sample.counts.offered !== expectedOffered || expectedOffered === 0) {
    fail(localText.COUNTS_OFFERED_SCHEDULE);
  }
  if (sample.releaseOffsetsMs.length !== expectedOffered) {
    fail(localText.RELEASE_OFFSET_COUNT);
  }
  if (sample.releaseLagMs.length !== expectedOffered) {
    fail(localText.RELEASE_LAG_COUNT);
  }
  assertReleaseLag(sample, expectedOffered);
}

function assertIntegerFields(input) {
  const integerFields = [
    ['blockIndex', true],
    ['windowDurationMs', false],
    ['operationTimeoutMs', false],
    ['maxReleaseLagMs', true],
    ['unreleasedOperations', true],
    ['clientMaxInFlight', false],
    ['clientMaxQueueDepth', false],
  ];
  for (let index = 0; index < integerFields.length; index += 1) {
    const key = integerFields[index][0];
    const allowZero = integerFields[index][1];
    if (
      !isNonNegativeSafeInteger(input[key]) ||
      (!allowZero && input[key] === 0)
    ) {
      fail(`${key}:safe_integer_required`);
    }
  }
  if (
    !isNonNegativeSafeNumber(input.offeredLoadPerSecond) ||
    input.offeredLoadPerSecond === 0
  ) {
    fail(localText.OFFERED_LOAD);
  }
}

function assertObservationClock(input) {
  if (
    !isNonNegativeSafeNumber(input.observationStartedAtMs) ||
    !isNonNegativeSafeNumber(input.observationEndedAtMs) ||
    input.observationEndedAtMs < input.observationStartedAtMs
  ) {
    fail(localText.OBSERVATION_CLOCK);
  }
}

function semanticReceiptPasses(inspection) {
  return inspection.present &&
    inspection.contractMatches &&
    inspection.dialectMatches &&
    inspection.statusPassed &&
    inspection.dimensionsComplete &&
    inspection.evidenceComplete &&
    inspection.digestMatches;
}

function semanticAccountingMatches(receipt, counts, rejectedByReason) {
  const accounting = receipt.accounting;
  return accounting.offered === counts.offered &&
    accounting.dispatched === counts.dispatched &&
    accounting.correct === counts.correct &&
    accounting.rejected === counts.rejected &&
    accounting.timedOut === counts.timedOut &&
    accounting.errored === counts.errored &&
    accounting.queueOverflow === counts.queueOverflow &&
    accounting.undispatched === counts.undispatched &&
    accounting.cancelled === counts.cancelled &&
    accounting.rejectedByReason.queueFull === rejectedByReason.queueFull &&
    accounting.rejectedByReason.flowControl ===
      rejectedByReason.flowControl &&
    accounting.rejectedByReason.admission === rejectedByReason.admission;
}

function validateSemanticReceipt(
  semanticDialect,
  receipt,
  counts,
  rejectedByReason,
) {
  if (
    semanticDialect !== BENCHMARK_SQL_DIALECT.SQLITE &&
    semanticDialect !== BENCHMARK_SQL_DIALECT.POSTGRESQL
  ) {
    fail(localText.SEMANTIC_DIALECT_UNSUPPORTED);
  }
  if (counts.correct === 0) {
    if (receipt !== null) {
      fail(localText.SEMANTIC_RECEIPT_REQUIRED_ABSENCE);
    }
    return null;
  }
  const inspection =
    inspectBenchmarkSemanticReceipt(receipt, semanticDialect);
  if (
    !semanticReceiptPasses(inspection) ||
    !semanticAccountingMatches(receipt, counts, rejectedByReason)
  ) {
    fail(localText.SEMANTIC_RECEIPT_INVALID);
  }
  return receipt.receiptDigest;
}

function sampleBody(sample) {
  const body = {};
  for (let index = 0; index < SAMPLE_KEYS.length - 1; index += 1) {
    const key = SAMPLE_KEYS[index];
    body[key] = sample[key];
  }
  return body;
}

function sampleInputFromSample(sample) {
  return {
    sideId: sample.sideId,
    phase: sample.phase,
    blockIndex: sample.blockIndex,
    offeredLoadPerSecond: sample.offeredLoadPerSecond,
    windowDurationMs: sample.windowDurationMs,
    observationStartedAtMs: sample.observationStartedAtMs,
    observationEndedAtMs: sample.observationEndedAtMs,
    operationTimeoutMs: sample.operationTimeoutMs,
    maxReleaseLagMs: sample.maxReleaseLagMs,
    clientMaxInFlight: sample.clientMaxInFlight,
    clientMaxQueueDepth: sample.clientMaxQueueDepth,
    counts: sample.counts,
    rejectedByReason: sample.rejectedByReason,
    endToEndLatencyMs: sample.endToEndLatencyMs,
    clientQueueDelayMs: sample.clientQueueDelayMs,
    releaseOffsetsMs: sample.releaseOffsetsMs,
    releaseLagMs: sample.releaseLagMs,
    unreleasedOperations: sample.unreleasedOperations,
    semanticDialect: sample.semanticDialect,
    semanticReceipt: sample.semanticReceipt,
  };
}

export function createBenchmarkCapacityRunSample(input) {
  if (
    !isPlainDataRecord(input) ||
    !hasExactOwnDataKeys(input, SAMPLE_INPUT_KEYS)
  ) {
    fail(localText.ROOT_SHAPE);
  }
  assertPrimitiveText(input.sideId, localText.SIDE_ID);
  if (
    input.phase !== BENCHMARK_CAPACITY_PHASE.WARMUP &&
    input.phase !== BENCHMARK_CAPACITY_PHASE.MEASURED
  ) {
    fail(localText.PHASE_UNSUPPORTED);
  }
  assertIntegerFields(input);
  assertObservationClock(input);
  const observationDurationMs = mathMax(
    input.windowDurationMs,
    mathCeil(
      input.observationEndedAtMs - input.observationStartedAtMs,
    ),
  );
  const counts = copyCounts(input.counts);
  const rejectedByReason = copyRejectedByReason(input.rejectedByReason);
  assertAccounting(counts, rejectedByReason);
  const endToEndLatencyMs = copySafeNumberArray(
    input.endToEndLatencyMs,
    'endToEndLatencyMs',
  );
  const clientQueueDelayMs = copySafeNumberArray(
    input.clientQueueDelayMs,
    'clientQueueDelayMs',
  );
  const releaseOffsetsMs = copySafeNumberArray(
    input.releaseOffsetsMs,
    'releaseOffsetsMs',
    true,
  );
  const releaseLagMs = copyReleaseLagArray(input.releaseLagMs);
  const semanticReceiptDigest = validateSemanticReceipt(
    input.semanticDialect,
    input.semanticReceipt,
    counts,
    rejectedByReason,
  );
  if (
    endToEndLatencyMs.length !== counts.correct
  ) {
    fail(localText.END_TO_END_LATENCY_COUNT);
  }
  if (clientQueueDelayMs.length !== counts.dispatched) {
    fail(localText.CLIENT_QUEUE_DELAY_COUNT);
  }
  const errorRate = counts.offered > 0 ?
    (counts.offered - counts.correct) / counts.offered :
    1;
  const correctThroughputPerSecond =
    counts.correct * BENCHMARK_CAPACITY_MILLISECONDS_PER_SECOND /
    observationDurationMs;
  if (
    !isNonNegativeSafeNumber(errorRate) ||
    !isNonNegativeSafeNumber(correctThroughputPerSecond)
  ) {
    fail(localText.DERIVED_METRICS_UNSAFE);
  }
  const body = {
    version: BENCHMARK_CAPACITY_SAMPLE_VERSION,
    scheduleMode: BENCHMARK_CAPACITY_SCHEDULE_MODE,
    queueingIncluded: true,
    sideId: input.sideId,
    phase: input.phase,
    blockIndex: input.blockIndex,
    offeredLoadPerSecond: input.offeredLoadPerSecond,
    windowDurationMs: input.windowDurationMs,
    observationStartedAtMs: input.observationStartedAtMs,
    observationEndedAtMs: input.observationEndedAtMs,
    observationDurationMs,
    operationTimeoutMs: input.operationTimeoutMs,
    maxReleaseLagMs: input.maxReleaseLagMs,
    clientMaxInFlight: input.clientMaxInFlight,
    clientMaxQueueDepth: input.clientMaxQueueDepth,
    counts,
    rejectedByReason,
    endToEndLatencyMs,
    clientQueueDelayMs,
    releaseOffsetsMs,
    releaseLagMs,
    unreleasedOperations: input.unreleasedOperations,
    semanticDialect: input.semanticDialect,
    semanticReceipt: input.semanticReceipt,
    semanticReceiptDigest,
    correctThroughputPerSecond,
    errorRate,
  };
  assertSchedule(body);
  return {
    ...body,
    sampleDigest: digestBenchmarkSemanticData(body),
  };
}

export function inspectBenchmarkCapacityRunSample(sample) {
  if (!hasExactOwnDataKeys(sample, SAMPLE_KEYS)) {
    return {valid: false, reason: localText.SAMPLE_SHAPE_INVALID};
  }
  try {
    const reconstructed = createBenchmarkCapacityRunSample(
      sampleInputFromSample(sample),
    );
    const digestMatches =
      isSha256Digest(sample.sampleDigest) &&
      digestBenchmarkSemanticData(sampleBody(sample)) === sample.sampleDigest;
    const canonicalMatches =
      reconstructed.sampleDigest === sample.sampleDigest;
    return {
      valid: digestMatches && canonicalMatches,
      reason: digestMatches && canonicalMatches ?
        localText.SAMPLE_VALID :
        localText.SAMPLE_DIGEST_MISMATCH,
    };
  } catch {
    return {valid: false, reason: localText.SAMPLE_FIELDS_INVALID};
  }
}
