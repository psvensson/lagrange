// Shared open-loop window and reset execution for the live capacity
// protocol drivers.
//
// The heterogeneous (paired) and independent (single-side) live drivers
// execute a window identically: resolve the preregistered sampling window,
// run the open-loop generator, cover the wall window, assemble the
// headroom/operation/window receipts, and assert Lagrange/PostgreSQL
// operation evidence. They previously carried byte-identical private copies
// (three clone groups, 186 duplicated lines — the 2026-07-29 duplication
// ratchet break); this module is the single owner. The drivers differ only
// in HOW an adapter is chosen for a window context (a fixed adapter versus
// per-side resolution), so both executors take an `adapterForContext`
// resolver instead of an adapter.

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
  createBenchmarkCapacityWindowReceipt,
} from './benchmark-capacity-window-receipt.js';
import {
  appendOwnArrayValue,
} from './benchmark-semantic-integrity.js';

const LAGRANGE_RUNTIME = 'wasm_component';
const POSTGRES_RUNTIME = 'postgresql_16';
// Sentinel for a window phase the preregistration does not configure; both
// drivers and their report consumers compare against this exact value.
const NOT_CONFIGURED = 'not_configured';

const SEMANTIC_CONTRACT_ABSENT = 'semantic contract missing for side';
const delay = (durationMs) =>
  new Promise((resolve) => setTimeout(resolve, durationMs));
const mathMax = Math.max;

function fail(reason) {
  throw new TypeError(
    `live capacity window execution failed: ${reason}`,
  );
}

function benchmarkCapacitySemanticDialectForSide(
  preregistration,
  sideId,
) {
  for (let index = 0;
    index < preregistration.sideSemanticContracts.length;
    index += 1) {
    const contract = preregistration.sideSemanticContracts[index];
    if (contract.sideId === sideId) return contract.dialect;
  }
  fail(`${SEMANTIC_CONTRACT_ABSENT}:${sideId}`);
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

async function executeBenchmarkCapacityLiveWindow({
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
      benchmarkCapacitySemanticDialectForSide(
        preregistration, context.sideId),
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

export function createBenchmarkCapacityLiveResetExecutor({
  preregistration,
  resets,
  adapterForContext,
}) {
  return async (context) => {
    const adapter = adapterForContext(context);
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

export function createBenchmarkCapacityLiveWindowExecutor({
  preregistration,
  windows,
  beginResourceObservation,
  completeResourceObservation,
  adapterForContext,
}) {
  return async (context) => {
    const adapter = adapterForContext(context);
    let warmup = NOT_CONFIGURED;
    if (benchmarkCapacitySamplingHasWarmup(preregistration)) {
      warmup = await executeBenchmarkCapacityLiveWindow({
        adapter,
        preregistration,
        context,
        phase: BENCHMARK_CAPACITY_PHASE.WARMUP,
        beginResourceObservation,
        completeResourceObservation,
      });
      appendOwnArrayValue(windows, warmup);
    }
    const measured = await executeBenchmarkCapacityLiveWindow({
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
        warmup === NOT_CONFIGURED ?
          NOT_CONFIGURED :
          warmup.sample,
      measured: measured.sample,
      warmupWindowReceipt:
        warmup === NOT_CONFIGURED ?
          NOT_CONFIGURED :
          warmup.receipt,
      measuredWindowReceipt: measured.receipt,
    };
  };
}
