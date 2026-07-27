import {test} from '../../../../src/test-helpers/tap.js';
import {
  beginBenchmarkResourceLiveObservation,
  captureBenchmarkResourceLiveObservation,
  finalizeBenchmarkResourceLiveObservation,
  writeExternallyObservedBenchmarkResourceCalibration,
} from '../benchmark-resource-live-observation-authority.js';
import {
  BENCHMARK_RESOURCE_ARTIFACT_KIND,
} from '../benchmark-resource-contract-constants.js';
import {
  assertBenchmarkResourceLiveTopologyClosure,
} from '../benchmark-resource-live-root-validation.js';

function stats(timestamp, multiplier) {
  return {
    timestamp,
    cpuPercent: 10 * multiplier,
    cpuUsageNanoseconds: 1000 * multiplier,
    memoryUsageBytes: 100_000 * multiplier,
    memoryLimitBytes: 1_000_000,
    cpuLimitNanoCpus: 1_000_000_000,
    storageLimitBytes: 1_000_000,
    pids: 5,
    rxBytes: 100 * multiplier,
    txBytes: 200 * multiplier,
    blockReadBytes: 300 * multiplier,
    blockWriteBytes: 400 * multiplier,
    blockReadOperations: 3 * multiplier,
    blockWriteOperations: 4 * multiplier,
    storageUsageBytes: 10_000 * multiplier,
  };
}

function providerFixture() {
  let statsCalls = 0;
  let cleaned = false;
  return {
    provider: {
      async inspectContainer() {
        return {State: {Running: true}};
      },
      async inspectContainerIfExists() {
        return cleaned ? null : {State: {Running: true}};
      },
      async getContainerResourceSnapshot() {
        statsCalls += 1;
        const phase = statsCalls <= 2 ? 1 : 2;
        return stats(phase * 1000, phase);
      },
      async getNetworkByName() {
        return cleaned ? null : {id: 'network-id', name: 'network-name'};
      },
    },
    cleanup() {
      cleaned = true;
    },
  };
}

function observationInput() {
  return {
    runId: 'authority-run-v1',
    networkId: 'network-id',
    networkName: 'network-name',
    sourceRevision: '089d5209',
    components: [
      {
        componentId: 'candidate-database',
        sideId: 'candidate',
        containerId: 'candidate-container',
        storagePath: '/var/lib/postgresql/data',
      },
      {
        componentId: 'baseline-database',
        sideId: 'baseline',
        containerId: 'baseline-container',
        storagePath: '/var/lib/postgresql/data',
      },
    ],
  };
}

test('external resource authority binds live deltas and one-use publication',
  async (t) => {
    const fixture = providerFixture();
    const session = await beginBenchmarkResourceLiveObservation(
      fixture.provider,
      observationInput(),
    );
    await captureBenchmarkResourceLiveObservation(session);
    fixture.cleanup();
    const [first, second] = await Promise.allSettled([
      finalizeBenchmarkResourceLiveObservation(session),
      finalizeBenchmarkResourceLiveObservation(session),
    ]);
    const fulfilled = first.status === 'fulfilled' ? first : second;
    const rejected = first.status === 'rejected' ? first : second;
    t.equal(fulfilled.status, 'fulfilled');
    t.equal(rejected.status, 'rejected');
    const artifact =
      writeExternallyObservedBenchmarkResourceCalibration(
        fulfilled.value.receipt,
        fulfilled.value.authorization,
      );
    t.equal(
      artifact.artifact.kind,
      BENCHMARK_RESOURCE_ARTIFACT_KIND.LIVE_CALIBRATION,
    );
    t.equal(artifact.artifact.payload.cleanupVerified, true);
    t.equal(artifact.artifact.payload.components.length, 2);
    t.equal(
      artifact.artifact.payload.components[0].delta.cpuUsageNanoseconds,
      1000,
    );
    t.equal(
      artifact.artifact.payload.components[0].delta.networkBytes,
      300,
    );
    t.throws(
      () => assertBenchmarkResourceLiveTopologyClosure({
        calibrationArtifact: artifact.artifact,
        topologyArtifact: {
          payload: {
            version: 'benchmark-resource-live-topology-v1',
            image: 'postgres:16',
            imageId: 'image-id',
            databaseContainers: 1,
            sharedClientContainers: 0,
            network: 'managed_bridge',
            databaseStorage: 'tmpfs',
            reservedIopsPerComponent: 0,
            reservedNetworkBytesPerSecondPerComponent: 0,
            components: [{
              sideId: 'candidate',
              componentId: 'candidate-database',
              role: 'database',
              physicalResourceId: 'candidate-container',
            }],
          },
        },
        inventory: {
          sides: [{
            sideId: 'candidate',
            components: [{
              componentId: 'candidate-database',
              role: 'database',
            }],
          }],
        },
        windowComponentIdentities:
          new Set(['candidate\u0000candidate-database']),
        windowComponentCount: 1,
      }),
      /live_topology_closure_mismatch/u,
    );
    t.throws(
      () => writeExternallyObservedBenchmarkResourceCalibration(
        fulfilled.value.receipt,
        fulfilled.value.authorization,
      ),
      /authorization:invalid/u,
    );
    t.end();
  });

test('external resource authority requires independently observed cleanup',
  async (t) => {
    const fixture = providerFixture();
    const session = await beginBenchmarkResourceLiveObservation(
      fixture.provider,
      observationInput(),
    );
    await captureBenchmarkResourceLiveObservation(session);
    await t.rejects(
      finalizeBenchmarkResourceLiveObservation(session),
      /cleanup:container_present/u,
    );
    t.end();
  });

test('external resource authority rejects accessor input without invoking it',
  async (t) => {
    const fixture = providerFixture();
    const input = observationInput();
    let getterCalls = 0;
    Object.defineProperty(input, 'runId', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 'forged';
      },
    });
    await t.rejects(
      beginBenchmarkResourceLiveObservation(fixture.provider, input),
      /exact_record_required/u,
    );
    t.equal(getterCalls, 0);
    t.end();
  });
