import {
  BENCHMARK_CAPACITY_PHASE,
} from './benchmark-capacity-protocol-constants.js';
import {
  getBenchmarkCapacitySamplingWindow,
  inspectBenchmarkCapacityPreregistration,
} from './benchmark-capacity-preregistration.js';
import {
  inspectBenchmarkCapacityRunSample,
} from './benchmark-capacity-run-sample.js';
import {
  inspectBenchmarkCapacityCacheResetReceipt,
} from './benchmark-capacity-cache-reset-receipt.js';
import {
  inspectBenchmarkCapacityWindowReceipt,
} from './benchmark-capacity-window-receipt.js';
import {
  summarizeBenchmarkCapacityIndependentSide,
} from './benchmark-capacity-statistics.js';
import {
  appendOwnArrayValue,
  digestBenchmarkSemanticData,
  hasExactOwnDataKeys,
  isDenseDataArray,
  isNonNegativeSafeInteger,
  isPlainDataRecord,
  isSha256Digest,
} from './benchmark-semantic-integrity.js';

const REPORT_VERSION =
  'benchmark-capacity-independent-side-development-v1';
const OPTION_KEYS = Object.freeze([
  'preregistration',
  'sideId',
  'resetRunState',
  'executeRun',
]);
const REPORT_BODY_KEYS = Object.freeze([
  'contractVersion',
  'claimEligible',
  'studyId',
  'sideId',
  'preregistrationDigest',
  'completedBlocks',
  'blockedOrderIndexesUsed',
  'warmupSamples',
  'rawSamples',
  'warmupSampleDigests',
  'rawSampleDigests',
  'windowReceipts',
  'resetReceipts',
  'summary',
]);
const REPORT_KEYS = Object.freeze([
  ...REPORT_BODY_KEYS,
  'reportDigest',
]);
const localText = Object.freeze({
  BOUNDED_RESET_ABORT_IGNORED:
    'cache reset hook ignored bounded abort',
  BOUNDED_RESET_TIMEOUT:
    'cache reset hook exceeded sealed timeout',
  EXACT_OPTIONS_REQUIRED:
    'exact independent-side protocol options required',
  NO_BLOCKS_COMPLETED: 'no independent-side blocks completed',
  NOT_CONFIGURED: 'not_configured',
  REPORT_INVALID: 'independent_side_report_invalid',
  RESET_RECEIPT_MISMATCH:
    'cache reset receipt does not match matrix cell',
  RUN_SAMPLE_MISMATCH:
    'run sample does not match preregistered matrix cell',
  RUN_SAMPLE_OR_RECEIPT_EXACT_REQUIRED:
    'executeRun must return exact samples and window receipts',
  SEMANTIC_CONTRACT_ABSENT: 'side semantic contract missing',
  SIDE_MISSING_FROM_ORDER: 'independent side missing from blocked order',
  STATUS_COMPLETED: 'completed',
  STATUS_FAILED: 'failed',
  STATUS_TIMED_OUT: 'timed_out',
  VALID_CONTRACT_REQUIRED:
    'valid independent-side protocol contract required',
  WINDOW_RECEIPT_MISMATCH:
    'window receipt does not match matrix cell',
  ZERO_WARMUP_NOT_CONFIGURED:
    'zero warmup must return not_configured',
});
const EXECUTION_RESULT_KEYS = Object.freeze([
  'warmup',
  'measured',
  'warmupWindowReceipt',
  'measuredWindowReceipt',
]);
const promiseResolve = Promise.resolve.bind(Promise);
const promiseRace = Promise.race.bind(Promise);
const promiseThen = Function.call.bind(Promise.prototype.then);
const PromiseConstructor = Promise;
const AbortControllerConstructor = AbortController;
const setTimer = setTimeout;
const clearTimer = clearTimeout;

function fail(reason) {
  throw new TypeError(`independent capacity protocol failed: ${reason}`);
}

function createEvidenceList() {
  return [];
}

function registeredSide(sealed, sideId) {
  for (let index = 0; index < sealed.sideIds.length; index += 1) {
    if (sealed.sideIds[index] === sideId) return true;
  }
  return false;
}

function semanticDialectForSide(sealed, sideId) {
  for (let index = 0;
    index < sealed.sideSemanticContracts.length;
    index += 1) {
    const contract = sealed.sideSemanticContracts[index];
    if (contract.sideId === sideId) return contract.dialect;
  }
  fail(localText.SEMANTIC_CONTRACT_ABSENT);
}

function assertSampleMatches(sample, sealed, expected) {
  const inspection = inspectBenchmarkCapacityRunSample(sample);
  if (!inspection.valid) fail(inspection.reason);
  if (
    sample.sideId !== expected.sideId ||
    sample.phase !== expected.phase ||
    sample.blockIndex !== expected.blockIndex ||
    sample.offeredLoadPerSecond !== expected.offeredLoadPerSecond ||
    sample.windowDurationMs !== expected.windowDurationMs ||
    sample.operationTimeoutMs !== sealed.sampling.operationTimeoutMs ||
    sample.maxReleaseLagMs !== sealed.sampling.maxReleaseLagMs ||
    sample.clientMaxInFlight !== sealed.sampling.clientMaxInFlight ||
    sample.clientMaxQueueDepth !== sealed.sampling.clientMaxQueueDepth ||
    sample.semanticDialect !==
      semanticDialectForSide(sealed, expected.sideId)
  ) fail(localText.RUN_SAMPLE_MISMATCH);
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
  ) fail(localText.WINDOW_RECEIPT_MISMATCH);
}

function assertExecutionResult(result, sealed, context) {
  if (
    !isPlainDataRecord(result) ||
    !hasExactOwnDataKeys(result, EXECUTION_RESULT_KEYS)
  ) fail(localText.RUN_SAMPLE_OR_RECEIPT_EXACT_REQUIRED);
  const samplingWindow = getBenchmarkCapacitySamplingWindow(
    sealed,
    context.offeredLoadPerSecond,
  );
  if (samplingWindow.warmupMs === 0) {
    if (
      result.warmup !== localText.NOT_CONFIGURED ||
      result.warmupWindowReceipt !== localText.NOT_CONFIGURED
    ) fail(localText.ZERO_WARMUP_NOT_CONFIGURED);
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
  ) fail(localText.RESET_RECEIPT_MISMATCH);
}

async function runBoundedReset(resetRunState, context, timeoutMs) {
  const controller = new AbortControllerConstructor();
  let timerId;
  const invoked = promiseThen(promiseResolve(), () =>
    resetRunState({...context, signal: controller.signal}));
  const completed = promiseThen(
    invoked,
    (value) => ({status: localText.STATUS_COMPLETED, value}),
    (error) => ({status: localText.STATUS_FAILED, error}),
  );
  const timeout = new PromiseConstructor((resolveTimeout) => {
    timerId = setTimer(
      () => resolveTimeout({status: localText.STATUS_TIMED_OUT}),
      timeoutMs,
    );
  });
  const result = await promiseRace([completed, timeout]);
  clearTimer(timerId);
  if (result.status === localText.STATUS_COMPLETED) return result.value;
  if (result.status === localText.STATUS_FAILED) throw result.error;
  controller.abort();
  let drainTimerId;
  const drained = new PromiseConstructor((resolveDrain) => {
    drainTimerId = setTimer(() => resolveDrain(false), timeoutMs);
  });
  const settled = await promiseRace([
    promiseThen(completed, () => true),
    drained,
  ]);
  clearTimer(drainTimerId);
  fail(settled ?
    localText.BOUNDED_RESET_TIMEOUT :
    localText.BOUNDED_RESET_ABORT_IGNORED);
}

function blockedOrderIndexForSide(sealed, blockIndex, sideId) {
  const order = sealed.blockedPairOrders[blockIndex];
  for (let index = 0; index < order.length; index += 1) {
    if (order[index] === sideId) return index;
  }
  fail(localText.SIDE_MISSING_FROM_ORDER);
}

async function resetIndependentSideCell({
  sealed,
  resetRunState,
  context,
  resetReceipts,
}) {
  const receipt = await runBoundedReset(
    resetRunState,
    context,
    sealed.sampling.resetTimeoutMs,
  );
  assertResetReceipt(receipt, sealed, context);
  appendOwnArrayValue(resetReceipts, receipt);
}

async function measureIndependentSideCell({
  sealed,
  executeRun,
  context,
  warmupSamples,
  measuredSamples,
  windowReceipts,
}) {
  const result = await executeRun(context);
  assertExecutionResult(result, sealed, context);
  if (result.warmup !== localText.NOT_CONFIGURED) {
    appendOwnArrayValue(warmupSamples, result.warmup);
    appendOwnArrayValue(windowReceipts, result.warmupWindowReceipt);
  }
  appendOwnArrayValue(measuredSamples, result.measured);
  appendOwnArrayValue(windowReceipts, result.measuredWindowReceipt);
}

async function executeIndependentSideCell(options) {
  await resetIndependentSideCell(options);
  await measureIndependentSideCell(options);
}

function sampleDigests(samples) {
  const digests = createEvidenceList();
  for (let index = 0; index < samples.length; index += 1) {
    appendOwnArrayValue(digests, samples[index].sampleDigest);
  }
  return digests;
}

function buildIndependentSideReport({
  sealed,
  sideId,
  completedBlocks,
  blockedOrderIndexesUsed,
  warmupSamples,
  measuredSamples,
  windowReceipts,
  resetReceipts,
  summary,
}) {
  const body = {
    contractVersion: REPORT_VERSION,
    claimEligible: false,
    studyId: sealed.studyId,
    sideId,
    preregistrationDigest: sealed.manifestDigest,
    completedBlocks,
    blockedOrderIndexesUsed,
    warmupSamples,
    rawSamples: measuredSamples,
    warmupSampleDigests: sampleDigests(warmupSamples),
    rawSampleDigests: sampleDigests(measuredSamples),
    windowReceipts,
    resetReceipts,
    summary,
  };
  return {
    ...body,
    reportDigest: digestBenchmarkSemanticData(body),
  };
}

function samplesMatchDigests(samples, digests) {
  if (
    !isDenseDataArray(samples) ||
    !isDenseDataArray(digests) ||
    samples.length !== digests.length
  ) return false;
  for (let index = 0; index < samples.length; index += 1) {
    if (
      !inspectBenchmarkCapacityRunSample(samples[index]).valid ||
      !isSha256Digest(digests[index]) ||
      samples[index].sampleDigest !== digests[index]
    ) return false;
  }
  return true;
}

function reportBody(report) {
  const body = {};
  for (let index = 0; index < REPORT_BODY_KEYS.length; index += 1) {
    const key = REPORT_BODY_KEYS[index];
    body[key] = report[key];
  }
  return body;
}

function evidenceArraysHaveExpectedShape(report, sealed) {
  if (
    !isDenseDataArray(report.blockedOrderIndexesUsed) ||
    !isDenseDataArray(report.windowReceipts) ||
    !isDenseDataArray(report.resetReceipts)
  ) return false;
  const rawCount =
    report.completedBlocks * sealed.offeredLoadPerSecond.length;
  if (
    !isNonNegativeSafeInteger(rawCount) ||
    report.rawSamples.length !== rawCount ||
    report.resetReceipts.length !== rawCount ||
    report.blockedOrderIndexesUsed.length !== report.completedBlocks
  ) return false;
  let warmupCount = 0;
  for (let blockIndex = 0;
    blockIndex < report.completedBlocks;
    blockIndex += 1) {
    for (let loadIndex = 0;
      loadIndex < sealed.offeredLoadPerSecond.length;
      loadIndex += 1) {
      const sampling = getBenchmarkCapacitySamplingWindow(
        sealed,
        sealed.offeredLoadPerSecond[loadIndex],
      );
      if (sampling.warmupMs > 0) warmupCount += 1;
    }
  }
  return report.warmupSamples.length === warmupCount &&
    report.windowReceipts.length === rawCount + warmupCount;
}

function reportEvidenceMatchesExecution(report, sealed) {
  if (!evidenceArraysHaveExpectedShape(report, sealed)) return false;
  let warmupIndex = 0;
  let rawIndex = 0;
  let windowIndex = 0;
  for (let blockIndex = 0;
    blockIndex < report.completedBlocks;
    blockIndex += 1) {
    const blockedOrderIndex =
      blockedOrderIndexForSide(sealed, blockIndex, report.sideId);
    if (
      report.blockedOrderIndexesUsed[blockIndex] !== blockedOrderIndex
    ) return false;
    for (let loadIndex = 0;
      loadIndex < sealed.offeredLoadPerSecond.length;
      loadIndex += 1) {
      const offeredLoadPerSecond =
        sealed.offeredLoadPerSecond[loadIndex];
      const context = {
        blockIndex,
        blockedOrderIndex,
        sideId: report.sideId,
        offeredLoadPerSecond,
      };
      assertResetReceipt(report.resetReceipts[rawIndex], sealed, context);
      const sampling = getBenchmarkCapacitySamplingWindow(
        sealed,
        offeredLoadPerSecond,
      );
      if (sampling.warmupMs > 0) {
        const warmup = report.warmupSamples[warmupIndex];
        assertSampleMatches(warmup, sealed, {
          ...context,
          phase: BENCHMARK_CAPACITY_PHASE.WARMUP,
          windowDurationMs: sampling.warmupMs,
        });
        assertWindowMatches(
          report.windowReceipts[windowIndex],
          warmup,
          context,
          sealed,
        );
        warmupIndex += 1;
        windowIndex += 1;
      }
      const measured = report.rawSamples[rawIndex];
      assertSampleMatches(measured, sealed, {
        ...context,
        phase: BENCHMARK_CAPACITY_PHASE.MEASURED,
        windowDurationMs: sampling.measuredMs,
      });
      assertWindowMatches(
        report.windowReceipts[windowIndex],
        measured,
        context,
        sealed,
      );
      rawIndex += 1;
      windowIndex += 1;
    }
  }
  return warmupIndex === report.warmupSamples.length &&
    rawIndex === report.rawSamples.length &&
    windowIndex === report.windowReceipts.length;
}

function samplePrefix(samples, length) {
  const prefix = [];
  for (let index = 0; index < length; index += 1) {
    appendOwnArrayValue(prefix, samples[index]);
  }
  return prefix;
}

function summaryMatchesObjectiveStopping(report, sealed) {
  const samplesPerBlock = sealed.offeredLoadPerSecond.length;
  for (let blockCount = sealed.repetitions.minimum;
    blockCount < report.completedBlocks;
    blockCount += 1) {
    const priorSummary = summarizeBenchmarkCapacityIndependentSide(
      samplePrefix(report.rawSamples, blockCount * samplesPerBlock),
      sealed,
      report.sideId,
      blockCount,
    );
    if (priorSummary.shouldStop) return false;
  }
  const expected = summarizeBenchmarkCapacityIndependentSide(
    report.rawSamples,
    sealed,
    report.sideId,
    report.completedBlocks,
  );
  return expected.shouldStop &&
    digestBenchmarkSemanticData(report.summary) ===
      digestBenchmarkSemanticData(expected);
}

function reportIdentityIsValid(report, sealed) {
  return hasExactOwnDataKeys(report, REPORT_KEYS) &&
    report.contractVersion === REPORT_VERSION &&
    report.claimEligible === false &&
    report.studyId === sealed.studyId &&
    registeredSide(sealed, report.sideId) &&
    report.preregistrationDigest === sealed.manifestDigest &&
    isNonNegativeSafeInteger(report.completedBlocks) &&
    report.completedBlocks >= sealed.repetitions.minimum &&
    report.completedBlocks <= sealed.repetitions.maximum;
}

function reportSampleDigestsAreValid(report) {
  return samplesMatchDigests(
    report.warmupSamples,
    report.warmupSampleDigests,
  ) && samplesMatchDigests(
    report.rawSamples,
    report.rawSampleDigests,
  );
}

function reportDigestMatchesBody(report) {
  return isSha256Digest(report.reportDigest) &&
    digestBenchmarkSemanticData(reportBody(report)) ===
      report.reportDigest;
}

export function inspectBenchmarkCapacityIndependentSideReport(
  report,
  sealed,
) {
  try {
    const preregistrationInspection =
      inspectBenchmarkCapacityPreregistration(sealed);
    if (
      !preregistrationInspection.valid ||
      !reportIdentityIsValid(report, sealed) ||
      !reportSampleDigestsAreValid(report) ||
      !reportEvidenceMatchesExecution(report, sealed) ||
      !summaryMatchesObjectiveStopping(report, sealed) ||
      !reportDigestMatchesBody(report)
    ) {
      return Object.freeze({
        valid: false,
        reason: localText.REPORT_INVALID,
      });
    }
    return Object.freeze({valid: true, reason: null});
  } catch {
    return Object.freeze({
      valid: false,
      reason: localText.REPORT_INVALID,
    });
  }
}

function assertIndependentSideOptions(options) {
  if (
    !isPlainDataRecord(options) ||
    !hasExactOwnDataKeys(options, OPTION_KEYS)
  ) fail(localText.EXACT_OPTIONS_REQUIRED);
  const inspection =
    inspectBenchmarkCapacityPreregistration(options.preregistration);
  if (
    !inspection.valid ||
    !registeredSide(options.preregistration, options.sideId) ||
    typeof options.resetRunState !== 'function' ||
    typeof options.executeRun !== 'function'
  ) fail(localText.VALID_CONTRACT_REQUIRED);
}

export async function runBenchmarkCapacityIndependentSideProtocol(options) {
  assertIndependentSideOptions(options);
  const sealed = options.preregistration;
  const warmupSamples = createEvidenceList();
  const measuredSamples = createEvidenceList();
  const windowReceipts = createEvidenceList();
  const resetReceipts = createEvidenceList();
  const blockedOrderIndexesUsed = createEvidenceList();
  let completedBlocks = 0;
  let summary;
  for (let blockIndex = 0;
    blockIndex < sealed.repetitions.maximum;
    blockIndex += 1) {
    const blockedOrderIndex =
      blockedOrderIndexForSide(sealed, blockIndex, options.sideId);
    appendOwnArrayValue(blockedOrderIndexesUsed, blockedOrderIndex);
    for (let loadIndex = 0;
      loadIndex < sealed.offeredLoadPerSecond.length;
      loadIndex += 1) {
      const context = {
        preregistration: sealed,
        sideId: options.sideId,
        blockIndex,
        blockedOrderIndex,
        offeredLoadPerSecond: sealed.offeredLoadPerSecond[loadIndex],
      };
      await executeIndependentSideCell({
        sealed,
        resetRunState: options.resetRunState,
        executeRun: options.executeRun,
        context,
        warmupSamples,
        measuredSamples,
        windowReceipts,
        resetReceipts,
      });
    }
    completedBlocks = blockIndex + 1;
    summary = summarizeBenchmarkCapacityIndependentSide(
      measuredSamples,
      sealed,
      options.sideId,
      completedBlocks,
    );
    if (summary.shouldStop) break;
  }
  if (summary === undefined) fail(localText.NO_BLOCKS_COMPLETED);
  return buildIndependentSideReport({
    sealed,
    sideId: options.sideId,
    completedBlocks,
    blockedOrderIndexesUsed,
    warmupSamples,
    measuredSamples,
    windowReceipts,
    resetReceipts,
    summary,
  });
}
