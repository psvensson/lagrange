import {
  BENCHMARK_CAPACITY_PHASE,
} from './benchmark-capacity-protocol-constants.js';
import {
  benchmarkCapacitySamplingHasWarmup,
  getBenchmarkCapacitySamplingWindow,
} from './benchmark-capacity-preregistration.js';
import {
  createBenchmarkCapacityCacheResetReceipt,
} from './benchmark-capacity-cache-reset-receipt.js';
import {
  assertBenchmarkCapacityHeterogeneousOperationEvidence,
  createBenchmarkCapacityHeadroomReceipt,
  createBenchmarkCapacityHeterogeneousOperationReceipt,
} from './benchmark-capacity-heterogeneous-observation.js';
import {
  runBenchmarkCapacityOpenLoopWindow,
} from './benchmark-capacity-open-loop.js';
import {
  runBenchmarkCapacityIndependentSideProtocol,
} from './benchmark-capacity-independent-side-protocol.js';
import {
  createBenchmarkCapacityWindowReceipt,
} from './benchmark-capacity-window-receipt.js';
import {
  appendOwnArrayValue,
} from './benchmark-semantic-integrity.js';

const LAGRANGE_RUNTIME = 'wasm_component';
const POSTGRES_RUNTIME = 'postgresql_16';
const mathMax = Math.max;
const PromiseConstructor = Promise;
const setTimer = setTimeout;
const localText = Object.freeze({
  ADAPTER_AND_OBSERVER_REQUIRED:
    'exact independent adapter and resource observer required',
  NOT_CONFIGURED: 'not_configured',
  SEMANTIC_CONTRACT_ABSENT: 'semantic contract missing for side',
});

function fail(reason) {
  throw new TypeError(
    `independent live capacity protocol failed: ${reason}`,
  );
}

function delay(durationMs) {
  return new PromiseConstructor((resolveDelay) => {
    setTimer(resolveDelay, durationMs);
  });
}

function semanticDialectForSide(preregistration, sideId) {
  for (let index = 0;
    index < preregistration.sideSemanticContracts.length;
    index += 1) {
    const contract = preregistration.sideSemanticContracts[index];
    if (contract.sideId === sideId) return contract.dialect;
  }
  fail(`${localText.SEMANTIC_CONTRACT_ABSENT}:${sideId}`);
}

async function coverWallWindow(startedAt, sample) {
  const remaining =
    sample.observationDurationMs - (Date.now() - startedAt);
  if (remaining > 0) await delay(remaining);
  let endedAt = Date.now();
  if (endedAt <= startedAt) {
    await delay(1);
    endedAt = Date.now();
  }
  return endedAt;
}

async function executeWindow({
  adapter,
  preregistration,
  context,
  phase,
  beginResourceObservation,
  completeResourceObservation,
}) {
  const samplingWindow = getBenchmarkCapacitySamplingWindow(
    preregistration,
    context.offeredLoadPerSecond,
  );
  const duration = phase === BENCHMARK_CAPACITY_PHASE.WARMUP ?
    samplingWindow.warmupMs :
    samplingWindow.measuredMs;
  const adapterContext = {
    blockIndex: context.blockIndex,
    blockedOrderIndex: context.blockedOrderIndex,
    sideId: context.sideId,
    offeredLoadPerSecond: context.offeredLoadPerSecond,
    phase,
  };
  const resourceObservation =
    await beginResourceObservation(adapterContext);
  adapter.beginWindow(adapterContext);
  const wallStartedAt = Date.now();
  const sample = await runBenchmarkCapacityOpenLoopWindow({
    sideId: context.sideId,
    phase,
    blockIndex: context.blockIndex,
    offeredLoadPerSecond: context.offeredLoadPerSecond,
    windowDurationMs: duration,
    operationTimeoutMs:
      preregistration.sampling.operationTimeoutMs,
    semanticFinalizerTimeoutMs:
      preregistration.sampling.semanticFinalizerTimeoutMs,
    maxReleaseLagMs:
      preregistration.sampling.maxReleaseLagMs,
    clientMaxInFlight:
      preregistration.sampling.clientMaxInFlight,
    clientMaxQueueDepth:
      preregistration.sampling.clientMaxQueueDepth,
    semanticDialect:
      semanticDialectForSide(preregistration, context.sideId),
    signal: null,
    executeOperation: adapter.executeOperation,
    finalizeSemanticReceipt: adapter.finalizeSemanticReceipt,
  });
  await coverWallWindow(wallStartedAt, sample);
  const adapterEvidence = adapter.completeWindow();
  const observation = await completeResourceObservation({
    resourceObservation,
    adapterIdentity: adapter.adapterIdentity,
    adapterEvidence,
    context: adapterContext,
    sample,
  });
  const headroom = createBenchmarkCapacityHeadroomReceipt(
    observation.headroom,
    sample,
  );
  const engagement =
    createBenchmarkCapacityHeterogeneousOperationReceipt({
      adapterIdentity: adapter.adapterIdentity,
      sample,
      window: {
        blockedOrderIndex: context.blockedOrderIndex,
        startedAt: observation.startedAt,
        endedAt: observation.endedAt,
      },
      ownerReceipt: adapterEvidence.ownerReceipt,
      headroom,
      preregistration,
    });
  if (
    adapter.adapterIdentity.runtimeKind === LAGRANGE_RUNTIME ||
    adapter.adapterIdentity.runtimeKind === POSTGRES_RUNTIME
  ) {
    assertBenchmarkCapacityHeterogeneousOperationEvidence(
      engagement,
      adapterEvidence.operationEvidence,
      sample.semanticReceipt,
      adapterEvidence.runtimeOwnerEvidence,
    );
  }
  const receipt = createBenchmarkCapacityWindowReceipt(
    {
      blockIndex: context.blockIndex,
      blockedOrderIndex: context.blockedOrderIndex,
      sideId: context.sideId,
      phase,
      offeredLoad: context.offeredLoadPerSecond,
      startedAt: observation.startedAt,
      endedAt: observation.endedAt,
      capacitySampleDigest: sample.sampleDigest,
      semanticReceiptDigest: sample.semanticReceiptDigest,
      liveEngagementDigest: engagement.receiptDigest,
      resourceWindowDigest: null,
    },
    sample,
    preregistration,
  );
  return {
    sample,
    receipt,
    engagement,
    adapterEvidence,
    headroom,
    resourceObservation,
  };
}

function createResetExecutor(preregistration, adapter, resets) {
  return async (context) => {
    const startedAt = Date.now();
    const reset = await adapter.resetRunState(context);
    const endedAt = mathMax(Date.now(), startedAt + 1);
    const receipt = createBenchmarkCapacityCacheResetReceipt(
      {
        blockIndex: context.blockIndex,
        blockedOrderIndex: context.blockedOrderIndex,
        sideId: context.sideId,
        offeredLoad: context.offeredLoadPerSecond,
        startedAt,
        endedAt,
        policy: preregistration.cachePolicy,
        liveEngagementDigest: reset.resetDigest,
      },
      preregistration,
    );
    appendOwnArrayValue(resets, {reset, receipt});
    return receipt;
  };
}

function createWindowExecutor({
  preregistration,
  adapter,
  windows,
  beginResourceObservation,
  completeResourceObservation,
}) {
  return async (context) => {
    let warmup = localText.NOT_CONFIGURED;
    if (benchmarkCapacitySamplingHasWarmup(preregistration)) {
      warmup = await executeWindow({
        adapter,
        preregistration,
        context,
        phase: BENCHMARK_CAPACITY_PHASE.WARMUP,
        beginResourceObservation,
        completeResourceObservation,
      });
      appendOwnArrayValue(windows, warmup);
    }
    const measured = await executeWindow({
      adapter,
      preregistration,
      context,
      phase: BENCHMARK_CAPACITY_PHASE.MEASURED,
      beginResourceObservation,
      completeResourceObservation,
    });
    appendOwnArrayValue(windows, measured);
    return {
      warmup:
        warmup === localText.NOT_CONFIGURED ?
          localText.NOT_CONFIGURED :
          warmup.sample,
      measured: measured.sample,
      warmupWindowReceipt:
        warmup === localText.NOT_CONFIGURED ?
          localText.NOT_CONFIGURED :
          warmup.receipt,
      measuredWindowReceipt: measured.receipt,
    };
  };
}

function assertLiveOptions({
  adapter,
  sideId,
  beginResourceObservation,
  completeResourceObservation,
}) {
  if (
    adapter === null ||
    typeof adapter !== 'object' ||
    adapter.adapterIdentity?.sideId !== sideId ||
    typeof beginResourceObservation !== 'function' ||
    typeof completeResourceObservation !== 'function'
  ) fail(localText.ADAPTER_AND_OBSERVER_REQUIRED);
}

export async function runBenchmarkCapacityIndependentLiveProtocol({
  preregistration,
  adapter,
  sideId,
  beginResourceObservation,
  completeResourceObservation,
}) {
  assertLiveOptions({
    adapter,
    sideId,
    beginResourceObservation,
    completeResourceObservation,
  });
  const windows = [];
  const resets = [];
  const report = await runBenchmarkCapacityIndependentSideProtocol({
    preregistration,
    sideId,
    resetRunState:
      createResetExecutor(preregistration, adapter, resets),
    executeRun: createWindowExecutor({
      preregistration,
      adapter,
      windows,
      beginResourceObservation,
      completeResourceObservation,
    }),
  });
  return {report, windows, resets};
}
