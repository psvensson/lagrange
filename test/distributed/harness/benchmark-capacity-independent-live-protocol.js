import {
  runBenchmarkCapacityIndependentSideProtocol,
} from './benchmark-capacity-independent-side-protocol.js';
import {
  createBenchmarkCapacityLiveResetExecutor,
  createBenchmarkCapacityLiveWindowExecutor,
} from './benchmark-capacity-live-window-execution.js';

const localText = Object.freeze({
  ADAPTER_AND_OBSERVER_REQUIRED:
    'exact independent adapter and resource observer required',
});

function fail(reason) {
  throw new TypeError(
    `independent live capacity protocol failed: ${reason}`,
  );
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
  const adapterForContext = () => adapter;
  const report = await runBenchmarkCapacityIndependentSideProtocol({
    preregistration,
    sideId,
    resetRunState: createBenchmarkCapacityLiveResetExecutor({
      preregistration,
      resets,
      adapterForContext,
    }),
    executeRun: createBenchmarkCapacityLiveWindowExecutor({
      preregistration,
      windows,
      beginResourceObservation,
      completeResourceObservation,
      adapterForContext,
    }),
  });
  return {report, windows, resets};
}
