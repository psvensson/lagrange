import {types} from 'node:util';
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
  BENCHMARK_CAPACITY_ARTIFACT_POLICY,
  BENCHMARK_CAPACITY_MAX_BOOTSTRAP_DRAWS,
  BENCHMARK_CAPACITY_CACHE_POLICY,
  BENCHMARK_CAPACITY_ESTIMATOR,
  BENCHMARK_CAPACITY_INTERVAL,
  BENCHMARK_CAPACITY_MAX_BOOTSTRAP_RESAMPLES,
  BENCHMARK_CAPACITY_MAX_LOAD_POINTS,
  BENCHMARK_CAPACITY_MAX_MATRIX_RUNS,
  BENCHMARK_CAPACITY_MAX_OPERATIONS_PER_WINDOW,
  BENCHMARK_CAPACITY_MAX_PAIRED_BLOCKS,
  BENCHMARK_CAPACITY_MAX_PLANNED_OPERATIONS,
  BENCHMARK_CAPACITY_MAX_TEXT_CODE_UNITS,
  BENCHMARK_CAPACITY_MIN_BOOTSTRAP_RESAMPLES,
  BENCHMARK_CAPACITY_MIN_PAIRED_BLOCKS,
  BENCHMARK_CAPACITY_MIN_TAIL_SAMPLES,
  BENCHMARK_CAPACITY_MILLISECONDS_PER_SECOND,
  BENCHMARK_CAPACITY_MULTIPLE_COMPARISON,
  BENCHMARK_CAPACITY_PERCENTILE_P99,
  BENCHMARK_CAPACITY_PROTOCOL_VERSION,
  BENCHMARK_CAPACITY_RANDOMIZATION_ALGORITHM,
  BENCHMARK_CAPACITY_RECEIPT_CLOCK,
  BENCHMARK_CAPACITY_RECEIPT_INTERVAL,
  BENCHMARK_CAPACITY_REJECT_POLICY,
  BENCHMARK_CAPACITY_RUN_ORDER_POLICY,
  BENCHMARK_CAPACITY_SIDE_COUNT,
  BENCHMARK_CAPACITY_PHASE,
  BENCHMARK_CAPACITY_RESET_PHASE,
  BENCHMARK_CAPACITY_STOPPING_RULE,
  BENCHMARK_CAPACITY_TIMEOUT_POLICY,
  BENCHMARK_CAPACITY_THROUGHPUT_DENOMINATOR_POLICY,
} from './benchmark-capacity-protocol-constants.js';
import {
  BENCHMARK_SQL_DIALECT,
  getBenchmarkSemanticContract,
} from './benchmark-workload-semantics.js';

const PREREGISTRATION_KEYS = [
  'studyId',
  'sideIds',
  'sideSemanticContracts',
  'offeredLoadPerSecond',
  'slo',
  'repetitions',
  'statistics',
  'sampling',
  'cachePolicy',
  'runOrderPolicy',
  'timeoutPolicy',
  'rejectPolicy',
  'artifactPolicy',
  'randomization',
  'executionIdentity',
];
const SLO_KEYS = ['maxP99LatencyMs', 'maxErrorRate'];
const SIDE_SEMANTIC_CONTRACT_KEYS = [
  'sideId',
  'dialect',
  'contractDigest',
];
const REPETITION_KEYS = ['minimum', 'maximum'];
const STATISTICS_KEYS = [
  'estimator',
  'interval',
  'confidenceLevel',
  'bootstrapResamples',
  'practicalSignificanceRatio',
  'targetRelativeCiWidth',
  'stoppingRule',
  'multipleComparisonTreatment',
];
const SAMPLING_KEYS = [
  'tailQuantile',
  'tailSampleMinimum',
  'windows',
  'operationTimeoutMs',
  'semanticFinalizerTimeoutMs',
  'resetTimeoutMs',
  'maxReleaseLagMs',
  'clientMaxInFlight',
  'clientMaxQueueDepth',
];
const SAMPLING_WINDOW_KEYS = [
  'offeredLoadPerSecond',
  'warmupMs',
  'measuredMs',
];
const RANDOMIZATION_KEYS = ['algorithm', 'seed'];
const EXECUTION_IDENTITY_KEYS = [
  'matrixId',
  'cellId',
  'cellManifestDigest',
  'profileIdentity',
  'pairIdentity',
  'runId',
  'liveEnvironmentContractDigest',
];
const WINDOW_CONTEXT_KEYS = [
  'blockIndex',
  'blockedOrderIndex',
  'sideId',
  'offeredLoad',
  'phase',
];
const SEALED_KEYS = [
  ...PREREGISTRATION_KEYS,
  'contractVersion',
  'throughputDenominatorPolicy',
  'receiptClock',
  'receiptInterval',
  'blockedPairOrders',
  'randomizedOrderDigest',
  'manifestDigest',
];
const IDENTIFIER_FIRST_PATTERN = /^[A-Za-z]$/u;
const IDENTIFIER_REST_PATTERN = /^[A-Za-z0-9_.:-]$/u;
const mathFloor = Math.floor;
const mathImul = Math.imul;
const isProxy = types.isProxy.bind(types);
const objectKeys = Object.keys;
const regexpExec = Function.call.bind(RegExp.prototype.exec);
const RANDOM_INCREMENT = 0x6D2B79F5;
const RANDOM_FIRST_SHIFT = 15;
const RANDOM_SECOND_SHIFT = 7;
const RANDOM_SECOND_MULTIPLIER = 61;
const RANDOM_FINAL_SHIFT = 14;
const UINT32_RANGE = 4_294_967_296;
const localText = Object.freeze({
  BOOTSTRAP_DRAWS_EXCEEDED: 'bootstrapDraws:exceeds_bound',
  EXECUTION_IDENTITY: 'executionIdentity',
  EXPECTED_BLOCK_INDEX:
    'expectedWindow.context.blockIndex:out_of_range',
  EXPECTED_CONTEXT: 'expectedWindow.context',
  EXPECTED_COORDINATE:
    'expectedWindow.context:unregistered_coordinate',
  EXPECTED_ORDER_INDEX:
    'expectedWindow.context.blockedOrderIndex:out_of_range',
  MATRIX_RUNS_EXCEEDED: 'matrixRuns:exceeds_bound',
  NON_NEGATIVE_SAFE_INTEGER: 'non_negative_safe_integer_required',
  OFFERED_LOADS_EMPTY:
    'offeredLoadPerSecond:non_empty_dense_array_required',
  OFFERED_LOADS_ORDER:
    'offeredLoadPerSecond:strictly_increasing_required',
  OFFERED_LOADS_TOO_MANY:
    'offeredLoadPerSecond:too_many_load_points',
  PLAIN_RECORD: 'plain_data_record_required',
  PLANNED_OPERATIONS_EXCEEDED: 'plannedOperations:exceeds_bound',
  RANDOMIZATION: 'randomization',
  RANDOMIZATION_ALGORITHM: 'randomization.algorithm:unsupported',
  RANDOMIZATION_SEED: 'randomization.seed',
  REPETITIONS: 'repetitions',
  REPETITIONS_MAXIMUM: 'repetitions.maximum',
  REPETITIONS_MAXIMUM_EXCEEDED:
    'repetitions.maximum:exceeds_bound',
  REPETITIONS_MINIMUM: 'repetitions.minimum',
  REPETITIONS_MINIMUM_FLOOR:
    'repetitions.minimum:paired_block_floor',
  REPETITIONS_REVERSED: 'repetitions:reversed',
  ROOT: 'root',
  SAMPLING: 'sampling',
  SAMPLING_CLIENT_IN_FLIGHT: 'sampling.clientMaxInFlight',
  SAMPLING_CLIENT_QUEUE: 'sampling.clientMaxQueueDepth',
  SAMPLING_MAX_RELEASE_LAG:
    'sampling.maxReleaseLagMs:non_negative_safe_integer_required',
  SAMPLING_OPERATION_TIMEOUT: 'sampling.operationTimeoutMs',
  SAMPLING_RESET_TIMEOUT: 'sampling.resetTimeoutMs',
  SAMPLING_SEMANTIC_TIMEOUT: 'sampling.semanticFinalizerTimeoutMs',
  SAMPLING_TAIL_MINIMUM: 'sampling.tailSampleMinimum',
  SAMPLING_TAIL_MINIMUM_FLOOR:
    'sampling.tailSampleMinimum:below_defensible_floor',
  SAMPLING_TAIL_QUANTILE: 'sampling.tailQuantile:must_be_p99',
  SAMPLING_WARMUP_UNIFORM:
    'sampling.windows:uniform_warmup_presence_required',
  SAMPLING_WINDOW_ABSENT:
    'samplingWindow:unregistered_offered_load',
  SAMPLING_WINDOWS_ALIGNMENT:
    'sampling.windows:load_aligned_dense_array_required',
  SEALED_DIGEST_MISMATCH: 'sealed_digest_mismatch',
  SEALED_FIELDS_INVALID: 'sealed_fields_invalid',
  SEALED_SHAPE_INVALID: 'sealed_shape_invalid',
  SIDE_CONTRACTS:
    'sideSemanticContracts:two_dense_contracts_required',
  SIDE_IDS_DISTINCT: 'sideIds:must_be_distinct',
  SIDE_IDS_REQUIRED: 'sideIds:two_dense_identifiers_required',
  SLO: 'slo',
  SLO_ERROR_RATE: 'slo.maxErrorRate',
  SLO_LATENCY: 'slo.maxP99LatencyMs:positive_safe_number_required',
  STATISTICS: 'statistics',
  STATISTICS_BOOTSTRAP: 'statistics.bootstrapResamples',
  STATISTICS_BOOTSTRAP_EXCEEDED:
    'statistics.bootstrapResamples:exceeds_bound',
  STATISTICS_BOOTSTRAP_FLOOR:
    'statistics.bootstrapResamples:below_defensible_floor',
  STATISTICS_CONFIDENCE: 'statistics.confidenceLevel',
  STATISTICS_CI_WIDTH:
    'statistics.targetRelativeCiWidth:positive_safe_number_required',
  STATISTICS_PRACTICAL: 'statistics.practicalSignificanceRatio',
  STUDY_ID: 'studyId',
  VALID: 'valid',
});

function fail(path) {
  throw new TypeError(`invalid capacity preregistration: ${path}`);
}

function assertExactRecord(value, keys, path) {
  if (isProxy(value) || !hasExactOwnDataKeys(value, keys)) {
    fail(`${path}:exact_plain_data_record_required`);
  }
}

function isExactArray(value) {
  return !isProxy(value) && isDenseDataArray(value);
}

function assertPrimitiveIdentifier(value, path) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > BENCHMARK_CAPACITY_MAX_TEXT_CODE_UNITS
  ) {
    fail(`${path}:primitive_identifier_required`);
  }
  if (regexpExec(IDENTIFIER_FIRST_PATTERN, value[0]) === null) {
    fail(`${path}:invalid_identifier`);
  }
  for (let index = 1; index < value.length; index += 1) {
    if (regexpExec(IDENTIFIER_REST_PATTERN, value[index]) === null) {
      fail(`${path}:invalid_identifier`);
    }
  }
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

function assertPositiveSafeInteger(value, path) {
  if (!isNonNegativeSafeInteger(value) || value === 0) {
    fail(`${path}:positive_safe_integer_required`);
  }
}

function assertPositiveSafeNumber(value, path) {
  if (!isNonNegativeSafeNumber(value) || value === 0) {
    fail(`${path}:positive_safe_number_required`);
  }
}

function operationCountWithinBound(offeredLoad, durationMs) {
  const count = mathFloor(
    offeredLoad * durationMs /
    BENCHMARK_CAPACITY_MILLISECONDS_PER_SECOND,
  );
  return isNonNegativeSafeInteger(count) &&
    count > 0 &&
    count <= BENCHMARK_CAPACITY_MAX_OPERATIONS_PER_WINDOW;
}

function assertRatio(value, path, allowZero = false) {
  if (
    !isNonNegativeSafeNumber(value) ||
    value >= 1 ||
    (!allowZero && value === 0)
  ) {
    fail(`${path}:ratio_required`);
  }
}

function copySideIds(sideIds) {
  if (
    !isExactArray(sideIds) ||
    sideIds.length !== BENCHMARK_CAPACITY_SIDE_COUNT
  ) {
    fail(localText.SIDE_IDS_REQUIRED);
  }
  const copied = [];
  for (let index = 0; index < sideIds.length; index += 1) {
    assertPrimitiveIdentifier(sideIds[index], `sideIds.${index}`);
    appendOwnArrayValue(copied, sideIds[index]);
  }
  if (copied[0] === copied[1]) {
    fail(localText.SIDE_IDS_DISTINCT);
  }
  return copied;
}

function copyOfferedLoadSchedule(schedule) {
  if (!isExactArray(schedule) || schedule.length === 0) {
    fail(localText.OFFERED_LOADS_EMPTY);
  }
  if (schedule.length > BENCHMARK_CAPACITY_MAX_LOAD_POINTS) {
    fail(localText.OFFERED_LOADS_TOO_MANY);
  }
  const copied = [];
  let previous = 0;
  for (let index = 0; index < schedule.length; index += 1) {
    const offeredLoad = schedule[index];
    assertPositiveSafeNumber(
      offeredLoad,
      `offeredLoadPerSecond.${index}`,
    );
    if (offeredLoad <= previous) {
      fail(localText.OFFERED_LOADS_ORDER);
    }
    previous = offeredLoad;
    appendOwnArrayValue(copied, offeredLoad);
  }
  return copied;
}

function copySideSemanticContracts(contracts, sideIds) {
  if (
    !isExactArray(contracts) ||
    contracts.length !== BENCHMARK_CAPACITY_SIDE_COUNT
  ) {
    fail(localText.SIDE_CONTRACTS);
  }
  const copied = [];
  for (let index = 0; index < contracts.length; index += 1) {
    const contract = contracts[index];
    assertExactRecord(
      contract,
      SIDE_SEMANTIC_CONTRACT_KEYS,
      `sideSemanticContracts.${index}`,
    );
    const expected = getBenchmarkSemanticContract(contract.dialect);
    if (
      contract.sideId !== sideIds[index] ||
      (
        contract.dialect !== BENCHMARK_SQL_DIALECT.SQLITE &&
        contract.dialect !== BENCHMARK_SQL_DIALECT.POSTGRESQL
      ) ||
      contract.contractDigest !== expected.contractDigest
    ) {
      fail(`sideSemanticContracts.${index}:identity_mismatch`);
    }
    appendOwnArrayValue(copied, {
      sideId: contract.sideId,
      dialect: contract.dialect,
      contractDigest: contract.contractDigest,
    });
  }
  return copied;
}

function copySlo(slo) {
  assertExactRecord(slo, SLO_KEYS, localText.SLO);
  if (
    !isNonNegativeSafeNumber(slo.maxP99LatencyMs) ||
    slo.maxP99LatencyMs === 0
  ) {
    fail(localText.SLO_LATENCY);
  }
  assertRatio(slo.maxErrorRate, localText.SLO_ERROR_RATE, true);
  return {
    maxP99LatencyMs: slo.maxP99LatencyMs,
    maxErrorRate: slo.maxErrorRate,
  };
}

function copyRepetitions(repetitions) {
  assertExactRecord(repetitions, REPETITION_KEYS, localText.REPETITIONS);
  assertPositiveSafeInteger(
    repetitions.minimum,
    localText.REPETITIONS_MINIMUM,
  );
  assertPositiveSafeInteger(
    repetitions.maximum,
    localText.REPETITIONS_MAXIMUM,
  );
  if (repetitions.minimum < BENCHMARK_CAPACITY_MIN_PAIRED_BLOCKS) {
    fail(localText.REPETITIONS_MINIMUM_FLOOR);
  }
  if (repetitions.minimum > repetitions.maximum) {
    fail(localText.REPETITIONS_REVERSED);
  }
  if (repetitions.maximum > BENCHMARK_CAPACITY_MAX_PAIRED_BLOCKS) {
    fail(localText.REPETITIONS_MAXIMUM_EXCEEDED);
  }
  return {
    minimum: repetitions.minimum,
    maximum: repetitions.maximum,
  };
}

function copyStatistics(statistics) {
  assertExactRecord(statistics, STATISTICS_KEYS, localText.STATISTICS);
  const expectedText = {
    estimator: BENCHMARK_CAPACITY_ESTIMATOR,
    interval: BENCHMARK_CAPACITY_INTERVAL,
    stoppingRule: BENCHMARK_CAPACITY_STOPPING_RULE,
    multipleComparisonTreatment: BENCHMARK_CAPACITY_MULTIPLE_COMPARISON,
  };
  const textKeys = objectKeys(expectedText);
  for (let index = 0; index < textKeys.length; index += 1) {
    const key = textKeys[index];
    if (statistics[key] !== expectedText[key]) {
      fail(`statistics.${key}:unsupported`);
    }
  }
  assertRatio(
    statistics.confidenceLevel,
    localText.STATISTICS_CONFIDENCE,
  );
  assertPositiveSafeInteger(
    statistics.bootstrapResamples,
    localText.STATISTICS_BOOTSTRAP,
  );
  if (
    statistics.bootstrapResamples >
    BENCHMARK_CAPACITY_MAX_BOOTSTRAP_RESAMPLES
  ) {
    fail(localText.STATISTICS_BOOTSTRAP_EXCEEDED);
  }
  if (
    statistics.bootstrapResamples <
    BENCHMARK_CAPACITY_MIN_BOOTSTRAP_RESAMPLES
  ) {
    fail(localText.STATISTICS_BOOTSTRAP_FLOOR);
  }
  assertRatio(
    statistics.practicalSignificanceRatio,
    localText.STATISTICS_PRACTICAL,
    true,
  );
  if (
    !isNonNegativeSafeNumber(statistics.targetRelativeCiWidth) ||
    statistics.targetRelativeCiWidth === 0
  ) {
    fail(localText.STATISTICS_CI_WIDTH);
  }
  return {
    estimator: statistics.estimator,
    interval: statistics.interval,
    confidenceLevel: statistics.confidenceLevel,
    bootstrapResamples: statistics.bootstrapResamples,
    practicalSignificanceRatio: statistics.practicalSignificanceRatio,
    targetRelativeCiWidth: statistics.targetRelativeCiWidth,
    stoppingRule: statistics.stoppingRule,
    multipleComparisonTreatment: statistics.multipleComparisonTreatment,
  };
}

function copySamplingWindows(windows, offeredLoadPerSecond) {
  if (
    !isExactArray(windows) ||
    windows.length !== offeredLoadPerSecond.length
  ) {
    fail(localText.SAMPLING_WINDOWS_ALIGNMENT);
  }
  const copied = [];
  let warmupConfigured = null;
  for (let index = 0; index < windows.length; index += 1) {
    const window = windows[index];
    assertExactRecord(
      window,
      SAMPLING_WINDOW_KEYS,
      `sampling.windows.${index}`,
    );
    if (window.offeredLoadPerSecond !== offeredLoadPerSecond[index]) {
      fail(`sampling.windows.${index}:offered_load_mismatch`);
    }
    if (!isNonNegativeSafeInteger(window.warmupMs)) {
      fail(
        `sampling.windows.${index}.warmupMs:` +
        localText.NON_NEGATIVE_SAFE_INTEGER,
      );
    }
    assertPositiveSafeInteger(
      window.measuredMs,
      `sampling.windows.${index}.measuredMs`,
    );
    const hasWarmup = window.warmupMs > 0;
    if (warmupConfigured === null) warmupConfigured = hasWarmup;
    if (warmupConfigured !== hasWarmup) {
      fail(localText.SAMPLING_WARMUP_UNIFORM);
    }
    if (
      !operationCountWithinBound(
        window.offeredLoadPerSecond,
        window.measuredMs,
      )
    ) {
      fail(`sampling.windows.${index}:window_operation_bound`);
    }
    if (
      hasWarmup &&
      !operationCountWithinBound(
        window.offeredLoadPerSecond,
        window.warmupMs,
      )
    ) {
      fail(`sampling.windows.${index}:warmup_operation_bound`);
    }
    appendOwnArrayValue(copied, {
      offeredLoadPerSecond: window.offeredLoadPerSecond,
      warmupMs: window.warmupMs,
      measuredMs: window.measuredMs,
    });
  }
  return copied;
}

function copySampling(sampling, offeredLoadPerSecond) {
  assertExactRecord(sampling, SAMPLING_KEYS, localText.SAMPLING);
  if (sampling.tailQuantile !== BENCHMARK_CAPACITY_PERCENTILE_P99) {
    fail(localText.SAMPLING_TAIL_QUANTILE);
  }
  assertPositiveSafeInteger(
    sampling.tailSampleMinimum,
    localText.SAMPLING_TAIL_MINIMUM,
  );
  if (sampling.tailSampleMinimum < BENCHMARK_CAPACITY_MIN_TAIL_SAMPLES) {
    fail(localText.SAMPLING_TAIL_MINIMUM_FLOOR);
  }
  assertPositiveSafeInteger(
    sampling.operationTimeoutMs,
    localText.SAMPLING_OPERATION_TIMEOUT,
  );
  assertPositiveSafeInteger(
    sampling.semanticFinalizerTimeoutMs,
    localText.SAMPLING_SEMANTIC_TIMEOUT,
  );
  assertPositiveSafeInteger(
    sampling.resetTimeoutMs,
    localText.SAMPLING_RESET_TIMEOUT,
  );
  if (!isNonNegativeSafeInteger(sampling.maxReleaseLagMs)) {
    fail(localText.SAMPLING_MAX_RELEASE_LAG);
  }
  assertPositiveSafeInteger(
    sampling.clientMaxInFlight,
    localText.SAMPLING_CLIENT_IN_FLIGHT,
  );
  assertPositiveSafeInteger(
    sampling.clientMaxQueueDepth,
    localText.SAMPLING_CLIENT_QUEUE,
  );
  return {
    tailQuantile: sampling.tailQuantile,
    tailSampleMinimum: sampling.tailSampleMinimum,
    windows: copySamplingWindows(
      sampling.windows,
      offeredLoadPerSecond,
    ),
    operationTimeoutMs: sampling.operationTimeoutMs,
    semanticFinalizerTimeoutMs: sampling.semanticFinalizerTimeoutMs,
    resetTimeoutMs: sampling.resetTimeoutMs,
    maxReleaseLagMs: sampling.maxReleaseLagMs,
    clientMaxInFlight: sampling.clientMaxInFlight,
    clientMaxQueueDepth: sampling.clientMaxQueueDepth,
  };
}

function copyRandomization(randomization) {
  assertExactRecord(
    randomization,
    RANDOMIZATION_KEYS,
    localText.RANDOMIZATION,
  );
  if (randomization.algorithm !== BENCHMARK_CAPACITY_RANDOMIZATION_ALGORITHM) {
    fail(localText.RANDOMIZATION_ALGORITHM);
  }
  assertPositiveSafeInteger(
    randomization.seed,
    localText.RANDOMIZATION_SEED,
  );
  return {
    algorithm: randomization.algorithm,
    seed: randomization.seed,
  };
}

function copyExecutionIdentity(executionIdentity) {
  assertExactRecord(
    executionIdentity,
    EXECUTION_IDENTITY_KEYS,
    localText.EXECUTION_IDENTITY,
  );
  const textFields = ['matrixId', 'cellId', 'runId'];
  for (let index = 0; index < textFields.length; index += 1) {
    const field = textFields[index];
    assertPrimitiveText(
      executionIdentity[field],
      `executionIdentity.${field}`,
    );
  }
  const digestFields = [
    'cellManifestDigest',
    'profileIdentity',
    'pairIdentity',
    'liveEnvironmentContractDigest',
  ];
  for (let index = 0; index < digestFields.length; index += 1) {
    const field = digestFields[index];
    if (!isSha256Digest(executionIdentity[field])) {
      fail(`executionIdentity.${field}:sha256_digest_required`);
    }
  }
  return {
    matrixId: executionIdentity.matrixId,
    cellId: executionIdentity.cellId,
    cellManifestDigest: executionIdentity.cellManifestDigest,
    profileIdentity: executionIdentity.profileIdentity,
    pairIdentity: executionIdentity.pairIdentity,
    runId: executionIdentity.runId,
    liveEnvironmentContractDigest:
      executionIdentity.liveEnvironmentContractDigest,
  };
}

function assertFixedPolicies(input) {
  const expected = {
    cachePolicy: BENCHMARK_CAPACITY_CACHE_POLICY,
    runOrderPolicy: BENCHMARK_CAPACITY_RUN_ORDER_POLICY,
    timeoutPolicy: BENCHMARK_CAPACITY_TIMEOUT_POLICY,
    rejectPolicy: BENCHMARK_CAPACITY_REJECT_POLICY,
    artifactPolicy: BENCHMARK_CAPACITY_ARTIFACT_POLICY,
  };
  const keys = objectKeys(expected);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (input[key] !== expected[key]) {
      fail(`${key}:unsupported`);
    }
  }
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

function buildBalancedOrders(sideIds, maximum, seed) {
  const orders = [];
  const random = createMulberry32(seed);
  for (let index = 0; index < maximum; index += 2) {
    const forward = random() < 0.5;
    appendOwnArrayValue(
      orders,
      forward ? [sideIds[0], sideIds[1]] : [sideIds[1], sideIds[0]],
    );
    if (index + 1 < maximum) {
      appendOwnArrayValue(
        orders,
        forward ? [sideIds[1], sideIds[0]] : [sideIds[0], sideIds[1]],
      );
    }
  }
  return orders;
}

function copyPreregistration(input) {
  if (isProxy(input) || !isPlainDataRecord(input)) {
    fail(localText.PLAIN_RECORD);
  }
  assertExactRecord(input, PREREGISTRATION_KEYS, localText.ROOT);
  assertPrimitiveIdentifier(input.studyId, localText.STUDY_ID);
  assertFixedPolicies(input);
  const sideIds = copySideIds(input.sideIds);
  const offeredLoadPerSecond = copyOfferedLoadSchedule(
    input.offeredLoadPerSecond,
  );
  const sampling = copySampling(input.sampling, offeredLoadPerSecond);
  const repetitions = copyRepetitions(input.repetitions);
  const statistics = copyStatistics(input.statistics);
  let operationsPerBlock = 0;
  for (let index = 0; index < offeredLoadPerSecond.length; index += 1) {
    const window = sampling.windows[index];
    operationsPerBlock += mathFloor(
      offeredLoadPerSecond[index] * window.measuredMs /
      BENCHMARK_CAPACITY_MILLISECONDS_PER_SECOND,
    );
    operationsPerBlock += mathFloor(
      offeredLoadPerSecond[index] * window.warmupMs /
      BENCHMARK_CAPACITY_MILLISECONDS_PER_SECOND,
    );
  }
  const plannedOperations =
    operationsPerBlock *
    repetitions.maximum *
    BENCHMARK_CAPACITY_SIDE_COUNT;
  if (
    !isNonNegativeSafeInteger(plannedOperations) ||
    plannedOperations > BENCHMARK_CAPACITY_MAX_PLANNED_OPERATIONS
  ) {
    fail(localText.PLANNED_OPERATIONS_EXCEEDED);
  }
  const matrixRuns =
    repetitions.maximum *
    offeredLoadPerSecond.length *
    BENCHMARK_CAPACITY_SIDE_COUNT;
  if (
    !isNonNegativeSafeInteger(matrixRuns) ||
    matrixRuns > BENCHMARK_CAPACITY_MAX_MATRIX_RUNS
  ) {
    fail(localText.MATRIX_RUNS_EXCEEDED);
  }
  const cumulativeSummaryBlocks =
    repetitions.maximum * (repetitions.maximum + 1) / 2;
  const bootstrapDraws =
    statistics.bootstrapResamples *
    cumulativeSummaryBlocks *
    (
      offeredLoadPerSecond.length *
      BENCHMARK_CAPACITY_SIDE_COUNT +
      1
    );
  if (
    !isNonNegativeSafeInteger(bootstrapDraws) ||
    bootstrapDraws > BENCHMARK_CAPACITY_MAX_BOOTSTRAP_DRAWS
  ) {
    fail(localText.BOOTSTRAP_DRAWS_EXCEEDED);
  }
  return {
    studyId: input.studyId,
    sideIds,
    sideSemanticContracts: copySideSemanticContracts(
      input.sideSemanticContracts,
      sideIds,
    ),
    offeredLoadPerSecond,
    slo: copySlo(input.slo),
    repetitions,
    statistics,
    sampling,
    cachePolicy: input.cachePolicy,
    runOrderPolicy: input.runOrderPolicy,
    timeoutPolicy: input.timeoutPolicy,
    rejectPolicy: input.rejectPolicy,
    artifactPolicy: input.artifactPolicy,
    randomization: copyRandomization(input.randomization),
    executionIdentity: copyExecutionIdentity(input.executionIdentity),
  };
}

function sealedBody(sealed) {
  const body = {};
  for (let index = 0; index < SEALED_KEYS.length - 1; index += 1) {
    const key = SEALED_KEYS[index];
    body[key] = sealed[key];
  }
  return body;
}

function preregistrationInputFromSealed(sealed) {
  return {
    studyId: sealed.studyId,
    sideIds: sealed.sideIds,
    sideSemanticContracts: sealed.sideSemanticContracts,
    offeredLoadPerSecond: sealed.offeredLoadPerSecond,
    slo: sealed.slo,
    repetitions: sealed.repetitions,
    statistics: sealed.statistics,
    sampling: sealed.sampling,
    cachePolicy: sealed.cachePolicy,
    runOrderPolicy: sealed.runOrderPolicy,
    timeoutPolicy: sealed.timeoutPolicy,
    rejectPolicy: sealed.rejectPolicy,
    artifactPolicy: sealed.artifactPolicy,
    randomization: sealed.randomization,
    executionIdentity: sealed.executionIdentity,
  };
}

function blockedPairOrdersAreProxyFree(sealed) {
  if (!isExactArray(sealed.blockedPairOrders)) return false;
  for (let index = 0;
    index < sealed.blockedPairOrders.length;
    index += 1) {
    if (!isExactArray(sealed.blockedPairOrders[index])) return false;
  }
  return true;
}

function phaseIsSupported(phase, sealed) {
  const hasWarmup = sealed.sampling.windows[0].warmupMs > 0;
  return phase === BENCHMARK_CAPACITY_RESET_PHASE ||
    phase === BENCHMARK_CAPACITY_PHASE.MEASURED ||
    (
      phase === BENCHMARK_CAPACITY_PHASE.WARMUP &&
      hasWarmup
    );
}

function offeredLoadIsRegistered(sealed, offeredLoad) {
  for (let index = 0;
    index < sealed.offeredLoadPerSecond.length;
    index += 1) {
    if (sealed.offeredLoadPerSecond[index] === offeredLoad) return true;
  }
  return false;
}

export function getBenchmarkCapacitySamplingWindow(
  sealed,
  offeredLoad,
) {
  for (let index = 0;
    index < sealed.offeredLoadPerSecond.length;
    index += 1) {
    if (sealed.offeredLoadPerSecond[index] === offeredLoad) {
      return sealed.sampling.windows[index];
    }
  }
  fail(localText.SAMPLING_WINDOW_ABSENT);
}

export function benchmarkCapacitySamplingHasWarmup(sealed) {
  return sealed.sampling.windows[0].warmupMs > 0;
}

export function deriveBenchmarkCapacityExpectedWindow(sealed, context) {
  const inspection = inspectBenchmarkCapacityPreregistration(sealed);
  if (!inspection.valid) {
    fail(`expectedWindow.preregistration:${inspection.reason}`);
  }
  assertExactRecord(
    context,
    WINDOW_CONTEXT_KEYS,
    localText.EXPECTED_CONTEXT,
  );
  if (
    !isNonNegativeSafeInteger(context.blockIndex) ||
    context.blockIndex >= sealed.repetitions.maximum
  ) {
    fail(localText.EXPECTED_BLOCK_INDEX);
  }
  const order = sealed.blockedPairOrders[context.blockIndex];
  if (
    !isNonNegativeSafeInteger(context.blockedOrderIndex) ||
    context.blockedOrderIndex >= order.length
  ) {
    fail(localText.EXPECTED_ORDER_INDEX);
  }
  if (
    context.sideId !== order[context.blockedOrderIndex] ||
    !offeredLoadIsRegistered(sealed, context.offeredLoad) ||
    !phaseIsSupported(context.phase, sealed)
  ) {
    fail(localText.EXPECTED_COORDINATE);
  }
  return {
    ...sealed.executionIdentity,
    blockIndex: context.blockIndex,
    blockedOrderIndex: context.blockedOrderIndex,
    sideId: context.sideId,
    offeredLoad: context.offeredLoad,
    phase: context.phase,
  };
}

export function sealBenchmarkCapacityPreregistration(input) {
  const copied = copyPreregistration(input);
  const blockedPairOrders = buildBalancedOrders(
    copied.sideIds,
    copied.repetitions.maximum,
    copied.randomization.seed,
  );
  const body = {
    ...copied,
    contractVersion: BENCHMARK_CAPACITY_PROTOCOL_VERSION,
    throughputDenominatorPolicy:
      BENCHMARK_CAPACITY_THROUGHPUT_DENOMINATOR_POLICY,
    receiptClock: BENCHMARK_CAPACITY_RECEIPT_CLOCK,
    receiptInterval: BENCHMARK_CAPACITY_RECEIPT_INTERVAL,
    blockedPairOrders,
    randomizedOrderDigest:
      digestBenchmarkSemanticData(blockedPairOrders),
  };
  return {
    ...body,
    manifestDigest: digestBenchmarkSemanticData(body),
  };
}

export function inspectBenchmarkCapacityPreregistration(sealed) {
  if (
    isProxy(sealed) ||
    !hasExactOwnDataKeys(sealed, SEALED_KEYS) ||
    !blockedPairOrdersAreProxyFree(sealed)
  ) {
    return {valid: false, reason: localText.SEALED_SHAPE_INVALID};
  }
  try {
    const reconstructed = sealBenchmarkCapacityPreregistration(
      preregistrationInputFromSealed(sealed),
    );
    const bodyDigest = digestBenchmarkSemanticData(sealedBody(sealed));
    const valid =
      sealed.contractVersion === BENCHMARK_CAPACITY_PROTOCOL_VERSION &&
      isSha256Digest(sealed.randomizedOrderDigest) &&
      isSha256Digest(sealed.manifestDigest) &&
      digestBenchmarkSemanticData(sealed.blockedPairOrders) ===
        sealed.randomizedOrderDigest &&
      sealed.randomizedOrderDigest === reconstructed.randomizedOrderDigest &&
      bodyDigest === sealed.manifestDigest &&
      reconstructed.manifestDigest === sealed.manifestDigest;
    return {
      valid,
      reason: valid ?
        localText.VALID :
        localText.SEALED_DIGEST_MISMATCH,
    };
  } catch {
    return {valid: false, reason: localText.SEALED_FIELDS_INVALID};
  }
}
