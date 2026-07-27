import {
  appendOwnArrayValue,
  digestBenchmarkSemanticData,
  hasExactOwnDataKeys,
  isDenseDataArray,
  isNonNegativeSafeInteger,
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

function semanticDialectForSide(sealed, sideId) {
  for (let index = 0; index < sealed.sideSemanticContracts.length; index += 1) {
    const contract = sealed.sideSemanticContracts[index];
    if (contract.sideId === sideId) return contract.dialect;
  }
  fail('side semantic contract missing');
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
    fail('run sample does not match preregistered matrix cell');
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
    fail('window receipt does not match matrix cell');
  }
}

function assertExecutionResult(result, sealed, context) {
  if (
    !isPlainDataRecord(result) ||
    !hasExactOwnDataKeys(result, EXECUTION_RESULT_KEYS)
  ) {
    fail('executeRun must return exact samples and window receipts');
  }
  if (sealed.sampling.warmupMs === 0) {
    if (
      result.warmup !== 'not_configured' ||
      result.warmupWindowReceipt !== 'not_configured'
    ) {
      fail('zero warmup must return not_configured');
    }
  } else {
    assertSampleMatches(result.warmup, sealed, {
      ...context,
      phase: BENCHMARK_CAPACITY_PHASE.WARMUP,
      windowDurationMs: sealed.sampling.warmupMs,
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
    windowDurationMs: sealed.sampling.measuredMs,
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
    fail('cache reset receipt does not match matrix cell');
  }
}

async function runBoundedReset(resetRunState, context, timeoutMs) {
  const controller = new AbortController();
  let timerId;
  const invoked = promiseThen(promiseResolve(), () =>
    resetRunState({...context, signal: controller.signal}));
  const completed = promiseThen(
    invoked,
    (value) => ({status: 'completed', value}),
    (error) => ({status: 'failed', error}),
  );
  const timeout = new Promise((resolve) => {
    timerId = setTimeout(
      () => resolve({status: 'timed_out'}),
      timeoutMs,
    );
  });
  const result = await promiseRace([completed, timeout]);
  clearTimeout(timerId);
  if (result.status === 'completed') return result.value;
  if (result.status === 'failed') throw result.error;
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
    'cache reset hook exceeded sealed timeout' :
    'cache reset hook ignored bounded abort');
}

function copyOrder(order) {
  if (!isDenseDataArray(order)) {
    fail('blocked pair order must be dense');
  }
  const copied = [];
  for (let index = 0; index < order.length; index += 1) {
    appendOwnArrayValue(copied, order[index]);
  }
  return copied;
}

function buildReport({
  sealed,
  completedBlocks,
  ordersUsed,
  warmupSamples,
  measuredSamples,
  windowReceipts,
  cacheResetReceipts,
  executionFailure,
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
    completedBlocks,
    blockedPairOrdersUsed: ordersUsed,
    warmupSamples,
    rawSamples: measuredSamples,
    warmupSampleDigests,
    rawSampleDigests,
    windowReceipts,
    cacheResetReceipts,
    executionFailure,
    summary,
  };
  return {
    ...body,
    reportDigest: digestBenchmarkSemanticData(body),
  };
}

function buildExecutionFailure(stage, context, error) {
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
  completedBlocks,
  observedRunSampleCount,
  failure,
) {
  const expectedRunSampleCount =
    sealed.repetitions.maximum *
    sealed.sideIds.length *
    sealed.offeredLoadPerSecond.length;
  const summary = {
    measurementState: BENCHMARK_CAPACITY_MEASUREMENT_STATE.NON_MEASURING,
    completedBlocks,
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
        completedBlocks >= sealed.repetitions.minimum,
      maximumReached:
        completedBlocks >= sealed.repetitions.maximum,
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
  completedBlocks,
  ordersUsed,
  warmupSamples,
  measuredSamples,
  windowReceipts,
  cacheResetReceipts,
  stage,
  context,
  error,
}) {
  const executionFailure = buildExecutionFailure(stage, context, error);
  return buildReport({
    sealed,
    completedBlocks,
    ordersUsed,
    warmupSamples,
    measuredSamples,
    windowReceipts,
    cacheResetReceipts,
    executionFailure,
    summary: buildIncompleteSummary(
      sealed,
      completedBlocks,
      measuredSamples.length,
      executionFailure,
    ),
  });
}

async function executeProtocolCell({
  preregistration,
  resetRunState,
  executeRun,
  context,
  completedBlocks,
  ordersUsed,
  warmupSamples,
  measuredSamples,
  windowReceipts,
  cacheResetReceipts,
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
      completedBlocks,
      ordersUsed,
      warmupSamples,
      measuredSamples,
      windowReceipts,
      cacheResetReceipts,
      stage: 'cache_reset',
      context,
      error,
    });
  }
  appendOwnArrayValue(cacheResetReceipts, resetReceipt);
  let result;
  try {
    result = await executeRun(context);
    assertExecutionResult(result, preregistration, context);
  } catch (error) {
    return buildPartialReport({
      sealed: preregistration,
      completedBlocks,
      ordersUsed,
      warmupSamples,
      measuredSamples,
      windowReceipts,
      cacheResetReceipts,
      stage: 'execute_run',
      context,
      error,
    });
  }
  if (result.warmup !== 'not_configured') {
    appendOwnArrayValue(warmupSamples, result.warmup);
    appendOwnArrayValue(windowReceipts, result.warmupWindowReceipt);
  }
  appendOwnArrayValue(measuredSamples, result.measured);
  appendOwnArrayValue(windowReceipts, result.measuredWindowReceipt);
  return null;
}

export async function runBenchmarkCapacityProtocol(options) {
  if (
    !isPlainDataRecord(options) ||
    !hasExactOwnDataKeys(
      options,
      ['preregistration', 'resetRunState', 'executeRun'],
    )
  ) {
    fail('exact protocol options required');
  }
  const preregistration = options.preregistration;
  const resetRunState = options.resetRunState;
  const executeRun = options.executeRun;
  const inspection =
    inspectBenchmarkCapacityPreregistration(preregistration);
  if (!inspection.valid) {
    fail(`preregistration integrity: ${inspection.reason}`);
  }
  if (
    typeof executeRun !== 'function' ||
    typeof resetRunState !== 'function'
  ) {
    fail('executeRun and resetRunState functions required');
  }
  const measuredSamples = [];
  const warmupSamples = [];
  const windowReceipts = [];
  const cacheResetReceipts = [];
  const ordersUsed = [];
  let summary;
  let completedBlocks = 0;
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
        const partialReport = await executeProtocolCell({
          preregistration,
          resetRunState,
          executeRun,
          context,
          completedBlocks,
          ordersUsed,
          warmupSamples,
          measuredSamples,
          windowReceipts,
          cacheResetReceipts,
        });
        if (partialReport !== null) return partialReport;
      }
    }
    appendOwnArrayValue(ordersUsed, copyOrder(order));
    completedBlocks = blockIndex + 1;
    summary = summarizeBenchmarkCapacityMatrix(
      measuredSamples,
      preregistration,
      completedBlocks,
    );
    if (summary.stoppingDecision.shouldStop) break;
  }
  if (!summary) fail('no capacity blocks completed');
  return buildReport({
    sealed: preregistration,
    completedBlocks,
    ordersUsed,
    warmupSamples,
    measuredSamples,
    windowReceipts,
    cacheResetReceipts,
    executionFailure: null,
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

function executionSequenceMatches(report, sealed) {
  let sampleIndex = 0;
  let windowIndex = 0;
  for (let blockIndex = 0; blockIndex < report.completedBlocks; blockIndex += 1) {
    const order = sealed.blockedPairOrders[blockIndex];
    for (let loadIndex = 0;
      loadIndex < sealed.offeredLoadPerSecond.length;
      loadIndex += 1) {
      const offeredLoad = sealed.offeredLoadPerSecond[loadIndex];
      for (let orderIndex = 0; orderIndex < order.length; orderIndex += 1) {
        const sideId = order[orderIndex];
        const measured = report.rawSamples[sampleIndex];
        const reset = report.cacheResetReceipts[sampleIndex];
        const warmup = sealed.sampling.warmupMs === 0 ?
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
    isNonNegativeSafeInteger(failure.offeredLoadPerSecond) &&
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
    (
      failure.stage === 'cache_reset' ||
      failure.stage === 'execute_run'
    ) &&
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
  const warmup = sealed.sampling.warmupMs === 0 ?
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

function partialSequenceMatches(report, sealed) {
  const failureIndex = failureCellIndex(report.executionFailure, sealed);
  const hasWarmup = sealed.sampling.warmupMs > 0;
  const windowsPerCell = hasWarmup ? 2 : 1;
  const expectedResetCount =
    failureIndex +
    (report.executionFailure.stage === 'execute_run' ? 1 : 0);
  if (!allChecksPass([
    failureIndex >= 0,
    report.completedBlocks === report.executionFailure.blockIndex,
    report.rawSamples.length === failureIndex,
    report.warmupSamples.length === (hasWarmup ? failureIndex : 0),
    report.windowReceipts.length === failureIndex * windowsPerCell,
    report.cacheResetReceipts.length === expectedResetCount,
  ])) return false;
  for (let cellIndex = 0; cellIndex < failureIndex; cellIndex += 1) {
    if (!completedPartialCellMatches(
      report,
      sealed,
      cellIndex,
      cellIndex * windowsPerCell,
    )) return false;
  }
  if (report.executionFailure.stage === 'execute_run') {
    const reset = report.cacheResetReceipts[failureIndex];
    const coordinate = expectedCoordinateForCell(sealed, failureIndex);
    if (
      !inspectBenchmarkCapacityCacheResetReceipt(reset, sealed).valid ||
      !recordFieldsMatch(reset, {
        blockIndex: coordinate.blockIndex,
        blockedOrderIndex: coordinate.orderIndex,
        sideId: coordinate.sideId,
        offeredLoad: coordinate.offeredLoad,
      })
    ) return false;
  }
  return true;
}

function partialReportIsValid(report, sealed) {
  if (!failureIsValid(report.executionFailure)) return false;
  const expectedSummary = buildIncompleteSummary(
    sealed,
    report.completedBlocks,
    report.rawSamples.length,
    report.executionFailure,
  );
  if (!allChecksPass([
    isNonNegativeSafeInteger(report.completedBlocks),
    report.completedBlocks < sealed.repetitions.maximum,
    report.measurementState ===
      BENCHMARK_CAPACITY_MEASUREMENT_STATE.NON_MEASURING,
    report.summary.summaryDigest === expectedSummary.summaryDigest,
    digestBenchmarkSemanticData(report.summary) ===
      digestBenchmarkSemanticData(expectedSummary),
    isDenseDataArray(report.blockedPairOrdersUsed),
    report.blockedPairOrdersUsed.length === report.completedBlocks,
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
    isDenseDataArray(report.cacheResetReceipts),
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
  const warmupCount = preregistration.sampling.warmupMs === 0 ?
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
    executionSequenceMatches(report, preregistration),
    isSha256Digest(report.reportDigest),
    digestBenchmarkSemanticData(reportBody(report)) === report.reportDigest,
  ]);
}

export function inspectBenchmarkCapacityProtocolReport(
  report,
  preregistration,
) {
  if (!hasExactOwnDataKeys(report, REPORT_KEYS)) {
    return {valid: false, reason: 'report_shape_invalid'};
  }
  const preregistrationInspection =
    inspectBenchmarkCapacityPreregistration(preregistration);
  if (!preregistrationInspection.valid) {
    return {valid: false, reason: 'preregistration_invalid'};
  }
  try {
    if (!reportIdentityMatches(report, preregistration)) {
      return {valid: false, reason: 'report_identity_mismatch'};
    }
    if (report.executionFailure !== null) {
      const valid = partialReportIsValid(report, preregistration);
      return {
        valid,
        reason: valid ? 'valid_non_measuring_partial' :
          'partial_report_integrity_mismatch',
      };
    }
    const consistent = normalReportIsValid(report, preregistration);
    return {
      valid: consistent,
      reason: consistent ? 'valid' : 'report_integrity_mismatch',
    };
  } catch {
    return {valid: false, reason: 'report_fields_invalid'};
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
  if (!terminalMeasurementIsComplete(report, summary)) {
    return {valid: false, reason: 'measurement_incomplete'};
  }
  if (!capacitiesArePositive(summary, preregistration)) {
    return {valid: false, reason: 'zero_or_invalid_capacity'};
  }
  const effect = summary.pairedEffect;
  if (!pairedEffectIsComplete(effect, report.completedBlocks)) {
    return {valid: false, reason: 'paired_effect_incomplete'};
  }
  if (hasForbiddenMeasurementReason(summary)) {
    return {valid: false, reason: 'invalid_measurement_reason'};
  }
  return {valid: true, reason: 'valid_terminal_measurement'};
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
        fail('resource window sample digest is not unique');
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
    fail('resource completions must cover every window exactly');
  }
  const completionByWindow = new MapConstructor();
  for (let index = 0; index < completions.length; index += 1) {
    const completion = completions[index];
    if (
      !hasExactOwnDataKeys(
        completion,
        ['windowReceiptDigest', 'resourceWindowDigest'],
      ) ||
      !isSha256Digest(completion.windowReceiptDigest) ||
      !isSha256Digest(completion.resourceWindowDigest) ||
      mapHas(completionByWindow, completion.windowReceiptDigest)
    ) {
      fail('resource completion entry is invalid or duplicated');
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
      fail('resource window is already complete');
    }
    if (!mapHas(completionByWindow, receipt.windowReceiptDigest)) {
      fail('resource completion is missing a report window');
    }
    const sample = mapGet(samples, receipt.capacitySampleDigest);
    if (sample === undefined) {
      fail('resource completion sample resolver failed');
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
    fail('resource completion includes an extra window');
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
