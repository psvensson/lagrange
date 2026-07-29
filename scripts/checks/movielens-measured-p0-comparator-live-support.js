import {
  appendOwnArrayValue,
} from
  '../../test/distributed/harness/benchmark-semantic-integrity.js';
import {
  beginBenchmarkResourceLiveObservation,
  captureBenchmarkResourceLiveObservation,
  finalizeBenchmarkResourceLiveObservation,
  resolveBenchmarkResourceLiveObservationBounds,
  writeExternallyObservedBenchmarkResourceCalibration,
} from
  '../../test/distributed/harness/benchmark-resource-live-observation-authority.js';
import {
  MOVIELENS_MEASURED_P0_STORAGE_GATES,
} from
  '../../test/distributed/harness/comparative-efficiency-movielens-measured-p0-constants.js';
import {
  benchmarkComparatorHostHeadroom,
  observeBenchmarkComparatorHost,
} from './benchmark-comparator-host-observation.js';

const MEBIBYTE = 1_048_576;
const objectFreeze = Object.freeze;
const localText = objectFreeze({
  CLEANUP_FAILED:
    'measured comparator execution and cleanup failed',
  NONE: 'none',
  OBSERVED_STORAGE_EXCEEDED:
    'observed storage exceeded the sealed baseline',
});

function fail(reason) {
  throw new Error(`measured comparator support failed: ${reason}`);
}

function firstOperationFailure(adapterEvidence) {
  for (let index = 0;
    index < adapterEvidence.operationEvidence.length;
    index += 1) {
    const failure = adapterEvidence.operationEvidence[index].failure;
    if (failure !== undefined) {
      return `${failure.name}:${failure.message}`;
    }
  }
  return localText.NONE;
}

function assertStorageGates(windowEvidence) {
  for (let index = 0; index < windowEvidence.length; index += 1) {
    const calibration =
      windowEvidence[index].calibration.artifact.payload;
    for (let componentIndex = 0;
      componentIndex < calibration.components.length;
      componentIndex += 1) {
      const delta = calibration.components[componentIndex].delta;
      const durationSeconds = delta.durationMilliseconds / 1_000;
      const iops = delta.blockOperations / durationSeconds;
      const bytesPerSecond =
        (delta.blockReadBytes + delta.blockWriteBytes) / durationSeconds;
      if (
        iops > MOVIELENS_MEASURED_P0_STORAGE_GATES.maximumIops ||
        bytesPerSecond >
          MOVIELENS_MEASURED_P0_STORAGE_GATES
            .maximumThroughputMiBPerSecond * MEBIBYTE
      ) fail(localText.OBSERVED_STORAGE_EXCEEDED);
    }
  }
}

export function createComparatorResourceObservationHooks({
  captured,
  environment,
  provenance,
  runId,
}) {
  return {
    async beginResourceObservation(context) {
      const host = await observeBenchmarkComparatorHost(process.cwd());
      const session = await beginBenchmarkResourceLiveObservation(
        environment.provider,
        {
          runId,
          networkId: environment.networkId,
          networkName: environment.networkName,
          sourceRevision: provenance.sourceRevision,
          components: environment.components,
        },
      );
      return {context, host, session};
    },
    async completeResourceObservation({
      adapterEvidence,
      resourceObservation,
      context,
      sample,
    }) {
      await captureBenchmarkResourceLiveObservation(
        resourceObservation.session,
      );
      const bounds = resolveBenchmarkResourceLiveObservationBounds(
        resourceObservation.session,
        context.sideId,
      );
      const host = await observeBenchmarkComparatorHost(process.cwd());
      appendOwnArrayValue(captured, resourceObservation);
      process.stdout.write(
        `comparator window: block=${context.blockIndex} ` +
        `side=${context.sideId} load=${context.offeredLoadPerSecond} ` +
        `phase=${context.phase} correct=${sample.counts.correct} ` +
        `errorRate=${sample.errorRate} ` +
        `firstFailure=${firstOperationFailure(adapterEvidence)}\n`,
      );
      return {
        ...bounds,
        headroom: benchmarkComparatorHostHeadroom(
          resourceObservation.host,
          host,
          bounds.endedAt - bounds.startedAt,
        ),
      };
    },
  };
}

export async function closeComparatorEnvironmentAfterFailure(
  environment,
  executionError,
) {
  try {
    await environment.close();
  } catch (cleanupError) {
    throw new AggregateError(
      [executionError, cleanupError],
      localText.CLEANUP_FAILED,
    );
  }
}

export async function finalizeComparatorWindowEvidence(captured, protocol) {
  const calibrations = [];
  for (let index = 0; index < captured.length; index += 1) {
    const observation = captured[index];
    const finalization =
      await finalizeBenchmarkResourceLiveObservation(observation.session);
    appendOwnArrayValue(
      calibrations,
      writeExternallyObservedBenchmarkResourceCalibration(
        finalization.receipt,
        finalization.authorization,
      ),
    );
  }
  const windowEvidence = [];
  for (let index = 0; index < protocol.windows.length; index += 1) {
    appendOwnArrayValue(windowEvidence, {
      c3: protocol.windows[index],
      calibration: calibrations[index],
    });
  }
  assertStorageGates(windowEvidence);
  return windowEvidence;
}
