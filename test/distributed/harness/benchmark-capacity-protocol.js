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
  BENCHMARK_CAPACITY_MEASUREMENT_STATE,
  BENCHMARK_CAPACITY_MAX_TEXT_CODE_UNITS,
  BENCHMARK_CAPACITY_PHASE,
  BENCHMARK_CAPACITY_PRACTICAL_CLASSIFICATION,
  BENCHMARK_CAPACITY_PROTOCOL_VERSION,
  BENCHMARK_CAPACITY_REASON,
  BENCHMARK_CAPACITY_STOP_DECISION,
} from './benchmark-capacity-protocol-constants.js';
import {
  benchmarkCapacitySamplingHasWarmup,
  getBenchmarkCapacitySamplingWindow,
  inspectBenchmarkCapacityPreregistration,
} from './benchmark-capacity-preregistration.js';
import {
  inspectBenchmarkCapacityRunSample,
} from './benchmark-capacity-run-sample.js';
import {
  completeBenchmarkCapacityResourceWindow,
  inspectBenchmarkCapacityWindowReceipt,
} from './benchmark-capacity-window-receipt.js';
import {
  inspectBenchmarkCapacityCacheResetReceipt,
} from './benchmark-capacity-cache-reset-receipt.js';
import {
  summarizeBenchmarkCapacityMatrix,
} from './benchmark-capacity-statistics.js';

const REPORT_KEYS = [
  'contractVersion',
  'studyId',
  'preregistrationDigest',
  'randomizedOrderDigest',
  'measurementState',
  'completedBlocks',
  'blockedPairOrdersUsed',
  'warmupSamples',
  'rawSamples',
  'warmupSampleDigests',
  'rawSampleDigests',
  'windowReceipts',
  'cacheResetReceipts',
  'executionFailure',
  'summary',
  'reportDigest',
];
const EXECUTION_RESULT_KEYS = [
  'warmup',
  'measured',
  'warmupWindowReceipt',
  'measuredWindowReceipt',
];
const FAILURE_KEYS = [
  'stage',
  'blockIndex',
  'blockedOrderIndex',
  'sideId',
  'offeredLoadPerSecond',
  'errorCode',
  'message',
  'failureDigest',
];
const promiseResolve = Promise.resolve.bind(Promise);
const promiseRace = Promise.race.bind(Promise);
const promiseThen = Function.call.bind(Promise.prototype.then);
const mathFloor = Math.floor;
const numberIsFinite = Number.isFinite;
const objectKeys = Object.keys;
const stringSlice = Function.call.bind(String.prototype.slice);
const MapConstructor = Map;
const SetConstructor = Set;
const mapDelete = Function.call.bind(Map.prototype.delete);
const mapGet = Function.call.bind(Map.prototype.get);
const mapHas = Function.call.bind(Map.prototype.has);
const mapSet = Function.call.bind(Map.prototype.set);
const mapSizeGetter =
  Object.getOwnPropertyDescriptor(Map.prototype, 'size').get;
const reflectApply = Reflect.apply;
const setHas = Function.call.bind(Set.prototype.has);
const PROTOCOL_OPTION_KEYS = [
  'preregistration',
  'resetRunState',
  'executeRun',
];
const RESOURCE_COMPLETION_KEYS = [
  'windowReceiptDigest',
  'resourceWindowDigest',
];
const REPORT_BLOCK_COUNT_KEY = 'completedBlocks';
const REPORT_FAILURE_KEY = 'executionFailure';
const REPORT_RESET_RECEIPTS_KEY = 'cacheResetReceipts';
const localText = Object.freeze({
  BLOCKED_ORDER_DENSE: 'blocked pair order must be dense',
  CACHE_RESET_IGNORED_ABORT: 'cache reset hook ignored bounded abort',
  CACHE_RESET_MISMATCH:
    'cache reset receipt does not match matrix cell',
  CACHE_RESET_TIMEOUT: 'cache reset hook exceeded sealed timeout',
  EXECUTION_FUNCTIONS:
    'executeRun and resetRunState functions required',
  EXECUTION_RESULT:
    'executeRun must return exact samples and window receipts',
  NO_BLOCKS: 'no capacity blocks completed',
  NOT_CONFIGURED: 'not_configured',
  OPTION_SHAPE: 'exact protocol options required',
  REPORT_FIELDS_INVALID: 'report_fields_invalid',
  REPORT_IDENTITY_MISMATCH: 'report_identity_mismatch',
  REPORT_INTEGRITY_MISMATCH: 'report_integrity_mismatch',
  REPORT_PREREGISTRATION_INVALID: 'preregistration_invalid',
  REPORT_SHAPE_INVALID: 'report_shape_invalid',
  REPORT_VALID: 'valid',
  REPORT_VALID_PARTIAL: 'valid_non_measuring_partial',
  REPORT_PARTIAL_INTEGRITY_MISMATCH:
    'partial_report_integrity_mismatch',
  RESOURCE_COMPLETION_DUPLICATED:
    'resource completion entry is invalid or duplicated',
  RESOURCE_COMPLETION_EXTRA:
    'resource completion includes an extra window',
  RESOURCE_COMPLETION_MISSING:
    'resource completion is missing a report window',
  RESOURCE_COMPLETION_RESOLVER:
    'resource completion sample resolver failed',
  RESOURCE_COMPLETION_SHAPE:
    'resource completions must cover every window exactly',
  RESOURCE_SAMPLE_DUPLICATED:
    'resource window sample digest is not unique',
  RESOURCE_WINDOW_ALREADY_COMPLETE:
    'resource window is already complete',
  RUN_SAMPLE_MISMATCH:
    'run sample does not match preregistered matrix cell',
  RESET_COMPLETED: 'completed',
  RESET_FAILED: 'failed',
  SIDE_CONTRACT_MISSING: 'side semantic contract missing',
  STAGE_CACHE_RESET: 'cache_reset',
  STAGE_EXECUTE_RUN: 'execute_run',
  TERMINAL_EFFECT_INCOMPLETE: 'paired_effect_incomplete',
  TERMINAL_INVALID_REASON: 'invalid_measurement_reason',
  TERMINAL_MEASUREMENT_INCOMPLETE: 'measurement_incomplete',
  TERMINAL_VALID: 'valid_terminal_measurement',
  TERMINAL_ZERO_CAPACITY: 'zero_or_invalid_capacity',
  WARMUP_ZERO: 'zero warmup must return not_configured',
  WINDOW_RECEIPT_MISMATCH:
    'window receipt does not match matrix cell',
});
const FAILURE_STAGE_SET = new SetConstructor([
  localText.STAGE_CACHE_RESET,
  localText.STAGE_EXECUTE_RUN,
]);
const NO_FAILURE = Object.freeze({});

function fail(message) {
  throw new TypeError(`benchmark capacity protocol failed: ${message}`);
}

function reportBody(report) {
  const body = {};
  for (let index = 0; index < REPORT_KEYS.length - 1; index += 1) {
    const key = REPORT_KEYS[index];
    body[key] = report[key];
  }
  return body;
}

function reportBlockCount(report) {
  return report[REPORT_BLOCK_COUNT_KEY];
}

function reportFailure(report) {
  return report[REPORT_FAILURE_KEY];
}

function reportResetReceipts(report) {
  return report[REPORT_RESET_RECEIPTS_KEY];
}

function semanticDialectForSide(sealed, sideId) {
  for (let index = 0; index < sealed.sideSemanticContracts.length; index += 1) {
    const contract = sealed.sideSemanticContracts[index];
    if (contract.sideId === sideId) return contract.dialect;
  }
  fail(localText.SIDE_CONTRACT_MISSING);
}

function assertSampleMatches(sample, sealed, expected) {
  const inspection = inspectBenchmarkCapacityRunSample(sample);
  if (!inspection.valid) {
    fail(`run sample integrity: ${inspection.reason}`);
  }
  const matches =
    sample.sideId === expected.sideId &&
    sample.phase === expected.phase &&
    sample.blockIndex === expected.blockIndex &&
    sample.offeredLoadPerSecond === expected.offeredLoadPerSecond &&
    sample.windowDurationMs === expected.windowDurationMs &&
    sample.operationTimeoutMs === sealed.sampling.operationTimeoutMs &&
    sample.maxReleaseLagMs === sealed.sampling.maxReleaseLagMs &&
    sample.clientMaxInFlight === sealed.sampling.clientMaxInFlight &&
    sample.clientMaxQueueDepth === sealed.sampling.clientMaxQueueDepth &&
    sample.semanticDialect ===
      semanticDialectForSide(sealed, expected.sideId);
  if (!matches) {
    fail(localText.RUN_SAMPLE_MISMATCH);
  }
}

function assertWindowMatches(receipt, sample, context, sealed) {
  const inspection =
    inspectBenchmarkCapacityWindowReceipt(receipt, sample, sealed);
  if (
    !inspection.valid ||
    receipt.blockIndex !== context.blockIndex ||
    receipt.blockedOrderIndex !== context.blockedOrderIndex ||
    receipt.sideId !== context.sideId ||
    receipt.phase !== sample.phase ||
    receipt.offeredLoad !== context.offeredLoadPerSecond ||
    receipt.capacitySampleDigest !== sample.sampleDigest
  ) {
    fail(localText.WINDOW_RECEIPT_MISMATCH);
  }
}

function assertExecutionResult(result, sealed, context) {
  if (
    !isPlainDataRecord(result) ||
    !hasExactOwnDataKeys(result, EXECUTION_RESULT_KEYS)
  ) {
    fail(localText.EXECUTION_RESULT);
  }
  const samplingWindow = getBenchmarkCapacitySamplingWindow(
    sealed,
    context.offeredLoadPerSecond,
  );
  if (samplingWindow.warmupMs === 0) {
    if (
      result.warmup !== localText.NOT_CONFIGURED ||
      result.warmupWindowReceipt !== localText.NOT_CONFIGURED
    ) {
      fail(localText.WARMUP_ZERO);
    }
  } else {
    assertSampleMatches(result.warmup, sealed, {
      ...context,
      phase: BENCHMARK_CAPACITY_PHASE.WARMUP,
      windowDurationMs: samplingWindow.warmupMs,
    });
    assertWindowMatches(
      result.warmupWindowReceipt,
      result.warmup,
      context,
      sealed,
    );
  }
  assertSampleMatches(result.measured, sealed, {
    ...context,
    phase: BENCHMARK_CAPACITY_PHASE.MEASURED,
    windowDurationMs: samplingWindow.measuredMs,
  });
  assertWindowMatches(
    result.measuredWindowReceipt,
    result.measured,
    context,
    sealed,
  );
}

function assertResetReceipt(receipt, sealed, context) {
  const inspection =
    inspectBenchmarkCapacityCacheResetReceipt(receipt, sealed);
  if (
    !inspection.valid ||
    receipt.policy !== sealed.cachePolicy ||
    receipt.blockIndex !== context.blockIndex ||
    receipt.blockedOrderIndex !== context.blockedOrderIndex ||
    receipt.sideId !== context.sideId ||
    receipt.offeredLoad !== context.offeredLoadPerSecond
  ) {
    fail(localText.CACHE_RESET_MISMATCH);
  }
}

async function runBoundedReset(resetRunState, context, timeoutMs) {
  const controller = new AbortController();
  let timerId;
  const invoked = promiseThen(promiseResolve(), () =>
    resetRunState({...context, signal: controller.signal}));
  const completed = promiseThen(
    invoked,
    (value) => ({status: localText.RESET_COMPLETED, value}),
    (error) => ({status: localText.RESET_FAILED, error}),
  );
  const timeout = new Promise((resolve) => {
    timerId = setTimeout(
      () => resolve({status: 'timed_out'}),
      timeoutMs,
    );
  });
  const result = await promiseRace([completed, timeout]);
  clearTimeout(timerId);
  if (result.status === localText.RESET_COMPLETED) return result.value;
  if (result.status === localText.RESET_FAILED) throw result.error;
  controller.abort();
  let drainTimerId;
  const drained = new Promise((resolve) => {
    drainTimerId = setTimeout(() => resolve(false), timeoutMs);
  });
  const settled = await promiseRace([
    promiseThen(completed, () => true),
    drained,
  ]);
  clearTimeout(drainTimerId);
  fail(settled ?
    localText.CACHE_RESET_TIMEOUT :
    localText.CACHE_RESET_IGNORED_ABORT);
}

function copyOrder(order) {
  if (!isDenseDataArray(order)) {
    fail(localText.BLOCKED_ORDER_DENSE);
  }
  const copied = [];
  for (let index = 0; index < order.length; index += 1) {
    appendOwnArrayValue(copied, order[index]);
  }
  return copied;
}

function buildReport({
  sealed,
  blockCount,
  ordersUsed,
  warmupSamples,
  measuredSamples,
  windowReceipts,
  resetReceipts,
  failureRecord,
  summary,
}) {
  const warmupSampleDigests = [];
  const rawSampleDigests = [];
  for (let index = 0; index < warmupSamples.length; index += 1) {
    appendOwnArrayValue(
      warmupSampleDigests,
      warmupSamples[index].sampleDigest,
    );
  }
  for (let index = 0; index < measuredSamples.length; index += 1) {
    appendOwnArrayValue(
      rawSampleDigests,
      measuredSamples[index].sampleDigest,
    );
  }
  const body = {
    contractVersion: BENCHMARK_CAPACITY_PROTOCOL_VERSION,
    studyId: sealed.studyId,
    preregistrationDigest: sealed.manifestDigest,
    randomizedOrderDigest: sealed.randomizedOrderDigest,
    measurementState: summary.measurementState,
    [REPORT_BLOCK_COUNT_KEY]: blockCount,
    blockedPairOrdersUsed: ordersUsed,
    warmupSamples,
    rawSamples: measuredSamples,
    warmupSampleDigests,
    rawSampleDigests,
    windowReceipts,
    [REPORT_RESET_RECEIPTS_KEY]: resetReceipts,
    [REPORT_FAILURE_KEY]: failureRecord,
    summary,
  };
  return {
    ...body,
    reportDigest: digestBenchmarkSemanticData(body),
  };
}

function buildFailureRecord(stage, context, error) {
  const errorCode = typeof error?.code === 'string' ?
    stringSlice(error.code, 0, BENCHMARK_CAPACITY_MAX_TEXT_CODE_UNITS) :
    null;
  const message = typeof error?.message === 'string' ?
    stringSlice(error.message, 0, BENCHMARK_CAPACITY_MAX_TEXT_CODE_UNITS) :
    'unknown capacity execution failure';
  const body = {
    stage,
    blockIndex: context.blockIndex,
    blockedOrderIndex: context.blockedOrderIndex,
    sideId: context.sideId,
    offeredLoadPerSecond: context.offeredLoadPerSecond,
    errorCode,
    message,
  };
  return {
    ...body,
    failureDigest: digestBenchmarkSemanticData(body),
  };
}

function buildIncompleteSummary(
  sealed,
  blockCount,
  observedRunSampleCount,
  failure,
) {
  const expectedRunSampleCount =
    sealed.repetitions.maximum *
    sealed.sideIds.length *
    sealed.offeredLoadPerSecond.length;
  const summary = {
    measurementState: BENCHMARK_CAPACITY_MEASUREMENT_STATE.NON_MEASURING,
    completedBlocks: blockCount,
    expectedRunSampleCount,
    observedRunSampleCount,
    sampleSufficiency: {
      tailQuantile: sealed.sampling.tailQuantile,
      tailSampleMinimum: sealed.sampling.tailSampleMinimum,
      sufficient: false,
    },
    capacityBySide: {},
    capacityCurve: [],
    pairedEffect: {
      estimator: sealed.statistics.estimator,
      firstSideId: sealed.sideIds[0],
      secondSideId: sealed.sideIds[1],
      sampleCount: 0,
      estimate: 0,
      confidenceInterval: {lower: 0, upper: 0},
      practicalSignificanceRatio:
        sealed.statistics.practicalSignificanceRatio,
      practicalClassification:
        BENCHMARK_CAPACITY_PRACTICAL_CLASSIFICATION.NO_RESULT,
    },
    stoppingDecision: {
      decision: BENCHMARK_CAPACITY_STOP_DECISION.NON_MEASURING,
      shouldStop: true,
      minimumReached:
        blockCount >= sealed.repetitions.minimum,
      maximumReached:
        blockCount >= sealed.repetitions.maximum,
      relativeCiWidth: Number.MAX_SAFE_INTEGER,
      targetRelativeCiWidth: sealed.statistics.targetRelativeCiWidth,
    },
    reasonCodes: [BENCHMARK_CAPACITY_REASON.INCOMPLETE_MATRIX],
    missingCell: {
      stage: failure.stage,
      blockIndex: failure.blockIndex,
      blockedOrderIndex: failure.blockedOrderIndex,
      sideId: failure.sideId,
      offeredLoadPerSecond: failure.offeredLoadPerSecond,
      failureDigest: failure.failureDigest,
    },
  };
  return {
    ...summary,
    summaryDigest: digestBenchmarkSemanticData(summary),
  };
}

function buildPartialReport({
  sealed,
  blockCount,
  ordersUsed,
  warmupSamples,
  measuredSamples,
  windowReceipts,
  resetReceipts,
  stage,
  context,
  error,
}) {
  const failureRecord = buildFailureRecord(stage, context, error);
  return buildReport({
    sealed,
    blockCount,
    ordersUsed,
    warmupSamples,
    measuredSamples,
    windowReceipts,
    resetReceipts,
    failureRecord,
    summary: buildIncompleteSummary(
      sealed,
      blockCount,
      measuredSamples.length,
      failureRecord,
    ),
  });
}

async function resetProtocolCell({
  preregistration,
  resetRunState,
  context,
  blockCount,
  ordersUsed,
  warmupSamples,
  measuredSamples,
  windowReceipts,
  resetReceipts,
}) {
  let resetReceipt;
  try {
    resetReceipt = await runBoundedReset(
      resetRunState,
      context,
      preregistration.sampling.resetTimeoutMs,
    );
    assertResetReceipt(resetReceipt, preregistration, context);
  } catch (error) {
    return buildPartialReport({
      sealed: preregistration,
      blockCount,
      ordersUsed,
      warmupSamples,
      measuredSamples,
      windowReceipts,
      resetReceipts,
      stage: localText.STAGE_CACHE_RESET,
      context,
      error,
    });
  }
  appendOwnArrayValue(resetReceipts, resetReceipt);
  return null;
}

async function runProtocolCell({
  preregistration,
  runOwner,
  context,
  blockCount,
  ordersUsed,
  warmupSamples,
  measuredSamples,
  windowReceipts,
  resetReceipts,
}) {
  let result;
  try {
    result = await runOwner(context);
    assertExecutionResult(result, preregistration, context);
  } catch (error) {
    return buildPartialReport({
      sealed: preregistration,
      blockCount,
      ordersUsed,
      warmupSamples,
      measuredSamples,
      windowReceipts,
      resetReceipts,
      stage: localText.STAGE_EXECUTE_RUN,
      context,
      error,
    });
  }
  if (result.warmup !== localText.NOT_CONFIGURED) {
    appendOwnArrayValue(warmupSamples, result.warmup);
    appendOwnArrayValue(windowReceipts, result.warmupWindowReceipt);
  }
  appendOwnArrayValue(measuredSamples, result.measured);
  appendOwnArrayValue(windowReceipts, result.measuredWindowReceipt);
  return null;
}

async function processProtocolCell(state) {
  const resetFailure = await resetProtocolCell(state);
  if (resetFailure !== null) return resetFailure;
  return runProtocolCell(state);
}

export async function runBenchmarkCapacityProtocol(options) {
  if (
    !isPlainDataRecord(options) ||
    !hasExactOwnDataKeys(
      options,
      PROTOCOL_OPTION_KEYS,
    )
  ) {
    fail(localText.OPTION_SHAPE);
  }
  const preregistration = options.preregistration;
  const resetRunState = options.resetRunState;
  const runOwner = options.executeRun;
  const inspection =
    inspectBenchmarkCapacityPreregistration(preregistration);
  if (!inspection.valid) {
    fail(`preregistration integrity: ${inspection.reason}`);
  }
  if (
    typeof runOwner !== 'function' ||
    typeof resetRunState !== 'function'
  ) {
    fail(localText.EXECUTION_FUNCTIONS);
  }
  const measuredSamples = [];
  const warmupSamples = [];
  const windowReceipts = [];
  const resetReceipts = [];
  const ordersUsed = [];
  let summary;
  let blockCount = 0;
  for (let blockIndex = 0;
    blockIndex < preregistration.repetitions.maximum;
    blockIndex += 1) {
    const order = preregistration.blockedPairOrders[blockIndex];
    for (let loadIndex = 0;
      loadIndex < preregistration.offeredLoadPerSecond.length;
      loadIndex += 1) {
      const offeredLoadPerSecond =
        preregistration.offeredLoadPerSecond[loadIndex];
      for (let orderIndex = 0;
        orderIndex < order.length;
        orderIndex += 1) {
        const context = {
          preregistration,
          sideId: order[orderIndex],
          blockIndex,
          blockedOrderIndex: orderIndex,
          offeredLoadPerSecond,
        };
        const partialReport = await processProtocolCell({
          preregistration,
          resetRunState,
          runOwner,
          context,
          blockCount,
          ordersUsed,
          warmupSamples,
          measuredSamples,
          windowReceipts,
          resetReceipts,
        });
        if (partialReport !== null) return partialReport;
      }
    }
    appendOwnArrayValue(ordersUsed, copyOrder(order));
    blockCount = blockIndex + 1;
    summary = summarizeBenchmarkCapacityMatrix(
      measuredSamples,
      preregistration,
      blockCount,
    );
    if (summary.stoppingDecision.shouldStop) break;
  }
  if (!summary) fail(localText.NO_BLOCKS);
  return buildReport({
    sealed: preregistration,
    blockCount,
    ordersUsed,
    warmupSamples,
    measuredSamples,
    windowReceipts,
    resetReceipts,
    failureRecord: null,
    summary,
  });
}

function orderPrefixMatches(report, sealed) {
  const expected = [];
  for (let index = 0; index < report.completedBlocks; index += 1) {
    appendOwnArrayValue(expected, copyOrder(sealed.blockedPairOrders[index]));
  }
  return digestBenchmarkSemanticData(expected) ===
    digestBenchmarkSemanticData(report.blockedPairOrdersUsed);
}

function sampleBodiesMatchDigests(samples, digests) {
  if (
    !isDenseDataArray(samples) ||
    !isDenseDataArray(digests) ||
    samples.length !== digests.length
  ) {
    return false;
  }
  for (let index = 0; index < samples.length; index += 1) {
    if (
      !isSha256Digest(digests[index]) ||
      !inspectBenchmarkCapacityRunSample(samples[index]).valid ||
      samples[index].sampleDigest !== digests[index]
    ) {
      return false;
    }
  }
  return true;
}

function receiptsMatchSamples(report, sealed) {
  if (!isDenseDataArray(report.windowReceipts)) return false;
  const expectedCount =
    report.warmupSamples.length + report.rawSamples.length;
  if (report.windowReceipts.length !== expectedCount) return false;
  let receiptIndex = 0;
  let warmupIndex = 0;
  let measuredIndex = 0;
  const cellsPerBlock = report.rawSamples.length / report.completedBlocks;
  for (let blockIndex = 0; blockIndex < report.completedBlocks; blockIndex += 1) {
    const blockEnd = (blockIndex + 1) * cellsPerBlock;
    while (measuredIndex < blockEnd) {
      if (warmupIndex < report.warmupSamples.length) {
        if (!inspectBenchmarkCapacityWindowReceipt(
          report.windowReceipts[receiptIndex],
          report.warmupSamples[warmupIndex],
          sealed,
        ).valid) return false;
        warmupIndex += 1;
        receiptIndex += 1;
      }
      if (!inspectBenchmarkCapacityWindowReceipt(
        report.windowReceipts[receiptIndex],
        report.rawSamples[measuredIndex],
        sealed,
      ).valid) return false;
      measuredIndex += 1;
      receiptIndex += 1;
    }
  }
  return receiptIndex === expectedCount;
}

function resetReceiptsValid(report, sealed) {
  if (
    !isDenseDataArray(report.cacheResetReceipts) ||
    report.cacheResetReceipts.length !== report.rawSamples.length
  ) {
    return false;
  }
  for (let index = 0; index < report.cacheResetReceipts.length; index += 1) {
    if (
      !inspectBenchmarkCapacityCacheResetReceipt(
        report.cacheResetReceipts[index],
        sealed,
      ).valid
    ) return false;
  }
  return true;
}

function recordFieldsMatch(record, expected) {
  if (!isPlainDataRecord(record)) return false;
  const keys = objectKeys(expected);
  for (let index = 0; index < keys.length; index += 1) {
    if (record[keys[index]] !== expected[keys[index]]) return false;
  }
  return true;
}

function sequenceCellMatches({
  measured,
  measuredReceipt,
  reset,
  warmup,
  warmupReceipt,
  blockIndex,
  orderIndex,
  sideId,
  offeredLoad,
}) {
  if (!recordFieldsMatch(measured, {
    blockIndex,
    sideId,
    offeredLoadPerSecond: offeredLoad,
    phase: BENCHMARK_CAPACITY_PHASE.MEASURED,
  })) return false;
  if (!recordFieldsMatch(measuredReceipt, {
    blockIndex,
    blockedOrderIndex: orderIndex,
    sideId,
    offeredLoad,
  })) return false;
  if (!recordFieldsMatch(reset, {
    blockIndex,
    blockedOrderIndex: orderIndex,
    sideId,
    offeredLoad,
    matrixId: measuredReceipt.matrixId,
    runId: measuredReceipt.runId,
  })) return false;
  if (warmup === null) return true;
  if (!recordFieldsMatch(warmup, {
    blockIndex,
    sideId,
    offeredLoadPerSecond: offeredLoad,
    phase: BENCHMARK_CAPACITY_PHASE.WARMUP,
  })) return false;
  return recordFieldsMatch(warmupReceipt, {
    blockIndex,
    blockedOrderIndex: orderIndex,
    sideId,
    offeredLoad,
    matrixId: measuredReceipt.matrixId,
    runId: measuredReceipt.runId,
    profileIdentity: measuredReceipt.profileIdentity,
    pairIdentity: measuredReceipt.pairIdentity,
  });
}

function sequenceMatches(report, sealed) {
  let sampleIndex = 0;
  let windowIndex = 0;
  const blockCount = reportBlockCount(report);
  const resetReceipts = reportResetReceipts(report);
  for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
    const order = sealed.blockedPairOrders[blockIndex];
    for (let loadIndex = 0;
      loadIndex < sealed.offeredLoadPerSecond.length;
      loadIndex += 1) {
      const offeredLoad = sealed.offeredLoadPerSecond[loadIndex];
      const samplingWindow = sealed.sampling.windows[loadIndex];
      for (let orderIndex = 0; orderIndex < order.length; orderIndex += 1) {
        const sideId = order[orderIndex];
        const measured = report.rawSamples[sampleIndex];
        const reset = resetReceipts[sampleIndex];
        const warmup = samplingWindow.warmupMs === 0 ?
          null :
          report.warmupSamples[sampleIndex];
        const warmupReceipt = warmup === null ?
          null :
          report.windowReceipts[windowIndex++];
        const measuredReceipt = report.windowReceipts[windowIndex++];
        if (!sequenceCellMatches({
          measured,
          measuredReceipt,
          reset,
          warmup,
          warmupReceipt,
          blockIndex,
          orderIndex,
          sideId,
          offeredLoad,
        })) return false;
        sampleIndex += 1;
      }
    }
  }
  return sampleIndex === report.rawSamples.length &&
    windowIndex === report.windowReceipts.length;
}

function failureTextFieldsAreValid(failure) {
  return typeof failure.sideId === 'string' &&
    failure.sideId.length > 0 &&
    failure.sideId.length <= BENCHMARK_CAPACITY_MAX_TEXT_CODE_UNITS &&
    typeof failure.message === 'string' &&
    failure.message.length > 0 &&
    failure.message.length <= BENCHMARK_CAPACITY_MAX_TEXT_CODE_UNITS;
}

function failureErrorCodeIsValid(errorCode) {
  return errorCode === null ||
    (
      typeof errorCode === 'string' &&
      errorCode.length <= BENCHMARK_CAPACITY_MAX_TEXT_CODE_UNITS
    );
}

function failureCoordinatesAreValid(failure) {
  return isNonNegativeSafeInteger(failure.blockIndex) &&
    isNonNegativeSafeInteger(failure.blockedOrderIndex) &&
    isNonNegativeSafeNumber(failure.offeredLoadPerSecond) &&
    failure.offeredLoadPerSecond > 0;
}

function failureDigestIsValid(failure) {
  const body = {};
  for (let index = 0; index < FAILURE_KEYS.length - 1; index += 1) {
    const key = FAILURE_KEYS[index];
    body[key] = failure[key];
  }
  return isSha256Digest(failure.failureDigest) &&
    digestBenchmarkSemanticData(body) === failure.failureDigest;
}

function failureIsValid(failure) {
  return hasExactOwnDataKeys(failure, FAILURE_KEYS) &&
    setHas(FAILURE_STAGE_SET, failure.stage) &&
    failureTextFieldsAreValid(failure) &&
    failureErrorCodeIsValid(failure.errorCode) &&
    failureCoordinatesAreValid(failure) &&
    failureDigestIsValid(failure);
}

function allChecksPass(checks) {
  for (let index = 0; index < checks.length; index += 1) {
    if (!checks[index]) return false;
  }
  return true;
}

function expectedCoordinateForCell(sealed, cellIndex) {
  const cellsPerBlock =
    sealed.offeredLoadPerSecond.length * sealed.sideIds.length;
  const blockIndex = mathFloor(cellIndex / cellsPerBlock);
  const withinBlock = cellIndex % cellsPerBlock;
  const loadIndex = mathFloor(withinBlock / sealed.sideIds.length);
  const orderIndex = withinBlock % sealed.sideIds.length;
  return {
    blockIndex,
    orderIndex,
    sideId: sealed.blockedPairOrders[blockIndex][orderIndex],
    offeredLoad: sealed.offeredLoadPerSecond[loadIndex],
  };
}

function failureCellIndex(failure, sealed) {
  if (
    failure.blockIndex >= sealed.repetitions.maximum ||
    failure.blockedOrderIndex >= sealed.sideIds.length
  ) return -1;
  let loadIndex = -1;
  for (let index = 0;
    index < sealed.offeredLoadPerSecond.length;
    index += 1) {
    if (
      sealed.offeredLoadPerSecond[index] ===
      failure.offeredLoadPerSecond
    ) {
      loadIndex = index;
      break;
    }
  }
  if (
    loadIndex === -1 ||
    sealed.blockedPairOrders[failure.blockIndex][
      failure.blockedOrderIndex
    ] !== failure.sideId
  ) return -1;
  const cellsPerBlock =
    sealed.offeredLoadPerSecond.length * sealed.sideIds.length;
  return failure.blockIndex * cellsPerBlock +
    loadIndex * sealed.sideIds.length +
    failure.blockedOrderIndex;
}

function completedPartialCellMatches(report, sealed, cellIndex, windowIndex) {
  const coordinate = expectedCoordinateForCell(sealed, cellIndex);
  const measured = report.rawSamples[cellIndex];
  const reset = report.cacheResetReceipts[cellIndex];
  const samplingWindow = getBenchmarkCapacitySamplingWindow(
    sealed,
    coordinate.offeredLoad,
  );
  const warmup = samplingWindow.warmupMs === 0 ?
    null :
    report.warmupSamples[cellIndex];
  const warmupReceipt = warmup === null ?
    null :
    report.windowReceipts[windowIndex];
  const measuredReceipt = report.windowReceipts[
    windowIndex + (warmup === null ? 0 : 1)
  ];
  if (
    !sequenceCellMatches({
      measured,
      measuredReceipt,
      reset,
      warmup,
      warmupReceipt,
      ...coordinate,
    }) ||
    !inspectBenchmarkCapacityCacheResetReceipt(reset, sealed).valid ||
    !inspectBenchmarkCapacityWindowReceipt(
      measuredReceipt,
      measured,
      sealed,
    ).valid
  ) return false;
  return warmup === null ||
    inspectBenchmarkCapacityWindowReceipt(
      warmupReceipt,
      warmup,
      sealed,
    ).valid;
}

function requiredResetReceiptMatches(report, sealed, failureIndex) {
  const reset = reportResetReceipts(report)[failureIndex];
  const coordinate = expectedCoordinateForCell(sealed, failureIndex);
  return inspectBenchmarkCapacityCacheResetReceipt(reset, sealed).valid &&
    recordFieldsMatch(reset, {
      blockIndex: coordinate.blockIndex,
      blockedOrderIndex: coordinate.orderIndex,
      sideId: coordinate.sideId,
      offeredLoad: coordinate.offeredLoad,
    });
}

function partialSequenceMatches(report, sealed) {
  const failure = reportFailure(report);
  const resetReceipts = reportResetReceipts(report);
  const blockCount = reportBlockCount(report);
  const failureIndex = failureCellIndex(failure, sealed);
  const hasWarmup = benchmarkCapacitySamplingHasWarmup(sealed);
  const windowsPerCell = hasWarmup ? 2 : 1;
  const expectedResetCount =
    failureIndex +
    (failure.stage === localText.STAGE_EXECUTE_RUN ? 1 : 0);
  if (!allChecksPass([
    failureIndex >= 0,
    blockCount === failure.blockIndex,
    report.rawSamples.length === failureIndex,
    report.warmupSamples.length === (hasWarmup ? failureIndex : 0),
    report.windowReceipts.length === failureIndex * windowsPerCell,
    resetReceipts.length === expectedResetCount,
  ])) return false;
  for (let cellIndex = 0; cellIndex < failureIndex; cellIndex += 1) {
    if (!completedPartialCellMatches(
      report,
      sealed,
      cellIndex,
      cellIndex * windowsPerCell,
    )) return false;
  }
  if (failure.stage === localText.STAGE_EXECUTE_RUN) {
    return requiredResetReceiptMatches(report, sealed, failureIndex);
  }
  return true;
}

function partialReportIsValid(report, sealed) {
  const failure = reportFailure(report);
  const blockCount = reportBlockCount(report);
  if (!failureIsValid(failure)) return false;
  const expectedSummary = buildIncompleteSummary(
    sealed,
    blockCount,
    report.rawSamples.length,
    failure,
  );
  if (!allChecksPass([
    isNonNegativeSafeInteger(blockCount),
    blockCount < sealed.repetitions.maximum,
    report.measurementState ===
      BENCHMARK_CAPACITY_MEASUREMENT_STATE.NON_MEASURING,
    report.summary.summaryDigest === expectedSummary.summaryDigest,
    digestBenchmarkSemanticData(report.summary) ===
      digestBenchmarkSemanticData(expectedSummary),
    isDenseDataArray(report.blockedPairOrdersUsed),
    report.blockedPairOrdersUsed.length === blockCount,
    orderPrefixMatches(report, sealed),
    sampleBodiesMatchDigests(
      report.rawSamples,
      report.rawSampleDigests,
    ),
    sampleBodiesMatchDigests(
      report.warmupSamples,
      report.warmupSampleDigests,
    ),
    isDenseDataArray(report.windowReceipts),
    isDenseDataArray(reportResetReceipts(report)),
    partialSequenceMatches(report, sealed),
  ])) return false;
  return isSha256Digest(report.reportDigest) &&
    digestBenchmarkSemanticData(reportBody(report)) === report.reportDigest;
}

function reportIdentityMatches(report, preregistration) {
  return allChecksPass([
    report.contractVersion === BENCHMARK_CAPACITY_PROTOCOL_VERSION,
    report.studyId === preregistration.studyId,
    report.preregistrationDigest === preregistration.manifestDigest,
    report.randomizedOrderDigest ===
      preregistration.randomizedOrderDigest,
  ]);
}

function normalReportIsValid(report, preregistration) {
  const rawCount =
    report.completedBlocks *
    preregistration.sideIds.length *
    preregistration.offeredLoadPerSecond.length;
  const warmupCount = !benchmarkCapacitySamplingHasWarmup(preregistration) ?
    0 :
    rawCount;
  const recomputedSummary = summarizeBenchmarkCapacityMatrix(
    report.rawSamples,
    preregistration,
    report.completedBlocks,
  );
  return allChecksPass([
    report.completedBlocks >= preregistration.repetitions.minimum,
    report.completedBlocks <= preregistration.repetitions.maximum,
    report.executionFailure === null,
    report.measurementState === recomputedSummary.measurementState,
    report.summary.summaryDigest === recomputedSummary.summaryDigest,
    digestBenchmarkSemanticData(report.summary) ===
      digestBenchmarkSemanticData(recomputedSummary),
    isDenseDataArray(report.blockedPairOrdersUsed),
    report.blockedPairOrdersUsed.length === report.completedBlocks,
    orderPrefixMatches(report, preregistration),
    report.rawSamples.length === rawCount,
    report.warmupSamples.length === warmupCount,
    sampleBodiesMatchDigests(
      report.rawSamples,
      report.rawSampleDigests,
    ),
    sampleBodiesMatchDigests(
      report.warmupSamples,
      report.warmupSampleDigests,
    ),
    receiptsMatchSamples(report, preregistration),
    resetReceiptsValid(report, preregistration),
    sequenceMatches(report, preregistration),
    isSha256Digest(report.reportDigest),
    digestBenchmarkSemanticData(reportBody(report)) === report.reportDigest,
  ]);
}

function reportPrerequisiteFailure(report, preregistration) {
  if (!hasExactOwnDataKeys(report, REPORT_KEYS)) {
    return localText.REPORT_SHAPE_INVALID;
  }
  const preregistrationInspection =
    inspectBenchmarkCapacityPreregistration(preregistration);
  if (!preregistrationInspection.valid) {
    return localText.REPORT_PREREGISTRATION_INVALID;
  }
  return NO_FAILURE;
}

function inspectReportMeasurement(report, preregistration) {
  if (reportFailure(report) !== null) {
    const valid = partialReportIsValid(report, preregistration);
    return {
      valid,
      reason: valid ? localText.REPORT_VALID_PARTIAL :
        localText.REPORT_PARTIAL_INTEGRITY_MISMATCH,
    };
  }
  const consistent = normalReportIsValid(report, preregistration);
  return {
    valid: consistent,
    reason: consistent ?
      localText.REPORT_VALID :
      localText.REPORT_INTEGRITY_MISMATCH,
  };
}

function inspectReportIntegrity(report, preregistration) {
  if (!reportIdentityMatches(report, preregistration)) {
    return {valid: false, reason: localText.REPORT_IDENTITY_MISMATCH};
  }
  return inspectReportMeasurement(report, preregistration);
}

export function inspectBenchmarkCapacityProtocolReport(
  report,
  preregistration,
) {
  const prerequisiteFailure =
    reportPrerequisiteFailure(report, preregistration);
  if (prerequisiteFailure !== NO_FAILURE) {
    return {valid: false, reason: prerequisiteFailure};
  }
  try {
    return inspectReportIntegrity(report, preregistration);
  } catch {
    return {valid: false, reason: localText.REPORT_FIELDS_INVALID};
  }
}

function terminalMeasurementIsComplete(report, summary) {
  return !(
    report.executionFailure !== null ||
    report.measurementState !==
      BENCHMARK_CAPACITY_MEASUREMENT_STATE.MEASURED ||
    summary.measurementState !==
      BENCHMARK_CAPACITY_MEASUREMENT_STATE.MEASURED ||
    summary.sampleSufficiency.sufficient !== true
  );
}

function capacitiesArePositive(summary, preregistration) {
  for (let index = 0; index < preregistration.sideIds.length; index += 1) {
    const capacity =
      summary.capacityBySide[preregistration.sideIds[index]];
    if (
      !isPlainDataRecord(capacity) ||
      !numberIsFinite(capacity.maxSloOfferedLoadPerSecond) ||
      capacity.maxSloOfferedLoadPerSecond <= 0 ||
      !numberIsFinite(capacity.maxCorrectThroughputPerSecond) ||
      capacity.maxCorrectThroughputPerSecond <= 0
    ) return false;
  }
  return true;
}

function pairedEffectIsComplete(effect, completedBlocks) {
  return !(
    effect.sampleCount !== completedBlocks ||
    !numberIsFinite(effect.estimate) ||
    effect.estimate <= 0 ||
    !numberIsFinite(effect.confidenceInterval.lower) ||
    effect.confidenceInterval.lower <= 0 ||
    !numberIsFinite(effect.confidenceInterval.upper) ||
    effect.confidenceInterval.upper <= 0 ||
    effect.confidenceInterval.lower > effect.confidenceInterval.upper
  );
}

function hasForbiddenMeasurementReason(summary) {
  const forbiddenReasons = new SetConstructor([
    BENCHMARK_CAPACITY_REASON.EMPTY_CAPACITY,
    BENCHMARK_CAPACITY_REASON.INCOMPLETE_MATRIX,
    BENCHMARK_CAPACITY_REASON.INSUFFICIENT_TAIL_SAMPLES,
    BENCHMARK_CAPACITY_REASON.INVALID_PAIRED_EFFECT,
  ]);
  for (let index = 0; index < summary.reasonCodes.length; index += 1) {
    if (setHas(forbiddenReasons, summary.reasonCodes[index])) return true;
  }
  return false;
}

function terminalMeasurementFailureReason(
  report,
  summary,
  preregistration,
) {
  if (!terminalMeasurementIsComplete(report, summary)) {
    return localText.TERMINAL_MEASUREMENT_INCOMPLETE;
  }
  if (!capacitiesArePositive(summary, preregistration)) {
    return localText.TERMINAL_ZERO_CAPACITY;
  }
  if (!pairedEffectIsComplete(summary.pairedEffect, reportBlockCount(report))) {
    return localText.TERMINAL_EFFECT_INCOMPLETE;
  }
  if (hasForbiddenMeasurementReason(summary)) {
    return localText.TERMINAL_INVALID_REASON;
  }
  return NO_FAILURE;
}

export function inspectBenchmarkCapacityTerminalMeasurement(
  report,
  preregistration,
) {
  const inspection = inspectBenchmarkCapacityProtocolReport(
    report,
    preregistration,
  );
  if (!inspection.valid) {
    return {valid: false, reason: `report:${inspection.reason}`};
  }
  const summary = report.summary;
  const reason =
    terminalMeasurementFailureReason(report, summary, preregistration);
  return {
    valid: reason === NO_FAILURE,
    reason: reason === NO_FAILURE ? localText.TERMINAL_VALID : reason,
  };
}

function sampleResolverForReport(report) {
  const samples = new MapConstructor();
  const collections = [report.warmupSamples, report.rawSamples];
  for (let collectionIndex = 0;
    collectionIndex < collections.length;
    collectionIndex += 1) {
    const collection = collections[collectionIndex];
    for (let index = 0; index < collection.length; index += 1) {
      const sample = collection[index];
      if (mapHas(samples, sample.sampleDigest)) {
        fail(localText.RESOURCE_SAMPLE_DUPLICATED);
      }
      mapSet(samples, sample.sampleDigest, sample);
    }
  }
  return samples;
}

function buildResourceCompletionIndex(completions, expectedLength) {
  if (
    !isDenseDataArray(completions) ||
    completions.length !== expectedLength
  ) {
    fail(localText.RESOURCE_COMPLETION_SHAPE);
  }
  const completionByWindow = new MapConstructor();
  for (let index = 0; index < completions.length; index += 1) {
    const completion = completions[index];
    if (
      !hasExactOwnDataKeys(
        completion,
        RESOURCE_COMPLETION_KEYS,
      ) ||
      !isSha256Digest(completion.windowReceiptDigest) ||
      !isSha256Digest(completion.resourceWindowDigest) ||
      mapHas(completionByWindow, completion.windowReceiptDigest)
    ) {
      fail(localText.RESOURCE_COMPLETION_DUPLICATED);
    }
    mapSet(
      completionByWindow,
      completion.windowReceiptDigest,
      completion.resourceWindowDigest,
    );
  }
  return completionByWindow;
}

function completeResourceWindowReceipts(
  report,
  preregistration,
  completionByWindow,
) {
  const samples = sampleResolverForReport(report);
  const windowReceipts = [];
  for (let index = 0; index < report.windowReceipts.length; index += 1) {
    const receipt = report.windowReceipts[index];
    if (receipt.resourceWindowDigest !== null) {
      fail(localText.RESOURCE_WINDOW_ALREADY_COMPLETE);
    }
    if (!mapHas(completionByWindow, receipt.windowReceiptDigest)) {
      fail(localText.RESOURCE_COMPLETION_MISSING);
    }
    const sample = mapGet(samples, receipt.capacitySampleDigest);
    if (sample === undefined) {
      fail(localText.RESOURCE_COMPLETION_RESOLVER);
    }
    appendOwnArrayValue(
      windowReceipts,
      completeBenchmarkCapacityResourceWindow(
        receipt,
        mapGet(completionByWindow, receipt.windowReceiptDigest),
        sample,
        preregistration,
      ),
    );
    mapDelete(completionByWindow, receipt.windowReceiptDigest);
  }
  if (reflectApply(mapSizeGetter, completionByWindow, []) !== 0) {
    fail(localText.RESOURCE_COMPLETION_EXTRA);
  }
  return windowReceipts;
}

export function completeBenchmarkCapacityProtocolResourceWindows(
  report,
  preregistration,
  completions,
) {
  const sourceInspection = inspectBenchmarkCapacityProtocolReport(
    report,
    preregistration,
  );
  if (!sourceInspection.valid) {
    fail(`resource completion source: ${sourceInspection.reason}`);
  }
  const completionByWindow = buildResourceCompletionIndex(
    completions,
    report.windowReceipts.length,
  );
  const windowReceipts = completeResourceWindowReceipts(
    report,
    preregistration,
    completionByWindow,
  );
  const body = reportBody(report);
  body.windowReceipts = windowReceipts;
  const completedReport = {
    ...body,
    reportDigest: digestBenchmarkSemanticData(body),
  };
  const completedInspection = inspectBenchmarkCapacityProtocolReport(
    completedReport,
    preregistration,
  );
  if (!completedInspection.valid) {
    fail(`resource completion result: ${completedInspection.reason}`);
  }
  return completedReport;
}
