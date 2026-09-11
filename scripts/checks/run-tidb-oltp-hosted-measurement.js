#!/usr/bin/env node

import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  DOCKER_CONTAINER_WRITABLE_LAYER_STORAGE_PATH,
  DockerProvider,
} from '../../test/distributed/harness/docker-provider.js';
import {
  beginBenchmarkResourceLiveObservation,
  captureBenchmarkResourceLiveObservation,
  deriveBenchmarkResourceLiveComponentAccounting,
  finalizeBenchmarkResourceLiveObservation,
  writeExternallyObservedBenchmarkResourceCalibration,
} from
  '../../test/distributed/harness/benchmark-resource-live-observation-authority.js';
import {runTiDbOltpAdapterSmoke} from
  './run-tidb-oltp-adapter-live.js';

const ZERO = 0;
const ONE = 1;
const NANOSECONDS_PER_SECOND = 1_000_000_000;
const MEMORY_SAMPLE_INTERVAL_MS = 1000;
const RESOURCE_SIDE_ID = 'tidb';
const OUTPUT_PATH =
  process.env.TIDB_OLTP_EVIDENCE_PATH ||
  'test-output/tidb-reference/oltp-hosted-smoke.json';
const PASS_PREFIX = 'tidb-oltp-hosted-measurement: PASS ';
const WORKLOAD_OPTIONS = Object.freeze({
  seed: 20260911,
  workers: 4,
  warmupOperationsPerWorker: 200,
  measurementOperationsPerWorker: 500,
  warehouseCount: 4,
  districtsPerWarehouse: 10,
  customersPerDistrict: 300,
  itemCount: 2000,
});

async function inspectImageIdentity(provider, tag) {
  const inspect = await provider.inspectImage(tag);
  assert.ok(inspect, `Expected pinned image ${tag} to exist`);
  return {
    tag,
    imageId: inspect.Id || null,
    repoDigests: Array.isArray(inspect.RepoDigests) ?
      [...inspect.RepoDigests].sort() :
      [],
  };
}

async function imageIdentities(provider, images) {
  const entries = await Promise.all(
    Object.entries(images).map(async ([role, tag]) => [
      role,
      await inspectImageIdentity(provider, tag),
    ]),
  );
  return Object.fromEntries(entries);
}

function runnerEvidence() {
  return {
    operatingSystem: os.platform(),
    architecture: os.arch(),
    cpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    githubRunnerOs: process.env.RUNNER_OS || null,
    githubRunnerArch: process.env.RUNNER_ARCH || null,
    githubRunnerName: process.env.RUNNER_NAME || null,
  };
}

function resourceComponents(cluster) {
  return [
    {
      componentId: 'pd',
      sideId: RESOURCE_SIDE_ID,
      containerId: cluster.containers.pd.containerId,
      storagePath: DOCKER_CONTAINER_WRITABLE_LAYER_STORAGE_PATH,
    },
    ...cluster.containers.tikvStores.map((container, index) => ({
      componentId: `tikv-${index + ONE}`,
      sideId: RESOURCE_SIDE_ID,
      containerId: container.containerId,
      storagePath: DOCKER_CONTAINER_WRITABLE_LAYER_STORAGE_PATH,
    })),
    {
      componentId: 'tidb',
      sideId: RESOURCE_SIDE_ID,
      containerId: cluster.containers.tidb.containerId,
      storagePath: DOCKER_CONTAINER_WRITABLE_LAYER_STORAGE_PATH,
    },
  ];
}

function componentRole(componentId) {
  if (componentId === 'pd') return 'placement-driver';
  if (componentId === 'tidb') return 'sql-server';
  if (componentId.startsWith('tikv-')) return 'tikv-store';
  return 'unknown';
}

async function captureWindowSample(provider, components) {
  const entries = await Promise.all(components.map(async (component) => [
    component.componentId,
    await provider.getContainerStats(component.containerId),
  ]));
  return {
    capturedAtMs: Date.now(),
    components: Object.fromEntries(entries),
  };
}

function memorySampleProjection(sample) {
  const componentBytes = Object.fromEntries(
    Object.entries(sample.components).map(([componentId, stats]) => [
      componentId,
      stats.memoryUsageBytes,
    ]),
  );
  return {
    capturedAtMs: sample.capturedAtMs,
    componentBytes,
    totalBytes: Object.values(componentBytes).reduce(
      (sum, value) => sum + value,
      ZERO,
    ),
  };
}

function timeWeightedAverage(samples, valueFor) {
  if (samples.length === ZERO) return ZERO;
  if (samples.length === ONE) return valueFor(samples[ZERO]);
  let weighted = ZERO;
  let duration = ZERO;
  for (let index = ONE; index < samples.length; index += ONE) {
    const previous = samples[index - ONE];
    const current = samples[index];
    const interval = Math.max(ZERO, current.capturedAtMs - previous.capturedAtMs);
    weighted += (valueFor(previous) + valueFor(current)) / 2 * interval;
    duration += interval;
  }
  return duration > ZERO ? weighted / duration : valueFor(samples.at(-ONE));
}

function summarizeMemory(samples, components) {
  const projected = samples.map(memorySampleProjection);
  const componentSummary = {};
  for (const component of components) {
    const componentId = component.componentId;
    componentSummary[componentId] = {
      averageBytes: timeWeightedAverage(
        projected,
        (sample) => sample.componentBytes[componentId],
      ),
      peakBytes: Math.max(
        ...projected.map((sample) => sample.componentBytes[componentId]),
      ),
    };
  }
  return {
    intervalMs: MEMORY_SAMPLE_INTERVAL_MS,
    sampleCount: projected.length,
    components: componentSummary,
    topology: {
      averageBytes: timeWeightedAverage(projected, (sample) => sample.totalBytes),
      peakBytes: Math.max(...projected.map((sample) => sample.totalBytes)),
    },
    samples: projected,
  };
}

async function startWindowSampler(provider, components) {
  const samples = [];
  let stopped = false;
  let timer = null;
  let pending = null;
  let failure = null;

  async function sample() {
    samples.push(await captureWindowSample(provider, components));
  }

  async function loop() {
    if (stopped) return;
    try {
      await sample();
    } catch (error) {
      failure = error;
      stopped = true;
      return;
    }
    if (!stopped) {
      timer = setTimeout(() => {
        pending = loop();
      }, MEMORY_SAMPLE_INTERVAL_MS);
    }
  }

  await sample();
  timer = setTimeout(() => {
    pending = loop();
  }, MEMORY_SAMPLE_INTERVAL_MS);

  return {
    async stop() {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      if (pending !== null) await pending;
      if (failure) throw failure;
      await sample();
      assert.ok(samples.length >= 2, 'Expected start and end resource samples');
      return {
        samples,
        memory: summarizeMemory(samples, components),
      };
    },
  };
}

function nonNegativeDelta(end, start, label) {
  const value = end - start;
  if (value < ZERO) {
    throw new Error(`TiDB OLTP resource counter regressed: ${label}`);
  }
  return value;
}

function networkBytes(stats) {
  return stats.rxBytes + stats.txBytes;
}

function blockOperations(stats) {
  return stats.blockReadOperations + stats.blockWriteOperations;
}

function authorityObservationFor(calibration, componentId) {
  const observation = calibration.artifact.payload.components.find(
    (candidate) => candidate.componentId === componentId,
  );
  assert.ok(observation, `Missing resource authority observation for ${componentId}`);
  return observation;
}

function componentWindowProjection(
  component,
  first,
  last,
  memory,
  calibration,
) {
  const start = first.components[component.componentId];
  const end = last.components[component.componentId];
  assert.ok(start && end, `Missing sampled stats for ${component.componentId}`);
  const authorityObservation = authorityObservationFor(
    calibration,
    component.componentId,
  );
  const authorityAccounting =
    deriveBenchmarkResourceLiveComponentAccounting(authorityObservation);
  const cpuUsageNanoseconds = nonNegativeDelta(
    end.cpuUsageNanoseconds,
    start.cpuUsageNanoseconds,
    `${component.componentId}.cpuUsageNanoseconds`,
  );
  return {
    componentId: component.componentId,
    role: componentRole(component.componentId),
    sampledCounterWindow: {
      startTimestamp: start.timestamp,
      endTimestamp: end.timestamp,
      durationMilliseconds: Math.max(ZERO, end.timestamp - start.timestamp),
    },
    cpuCoreSeconds: cpuUsageNanoseconds / NANOSECONDS_PER_SECOND,
    memoryAverageBytes: memory.averageBytes,
    memoryPeakBytes: memory.peakBytes,
    networkContainerInterfaceBytes: nonNegativeDelta(
      networkBytes(end),
      networkBytes(start),
      `${component.componentId}.networkBytes`,
    ),
    blockReadBytes: nonNegativeDelta(
      end.blockReadBytes,
      start.blockReadBytes,
      `${component.componentId}.blockReadBytes`,
    ),
    blockWriteBytes: nonNegativeDelta(
      end.blockWriteBytes,
      start.blockWriteBytes,
      `${component.componentId}.blockWriteBytes`,
    ),
    blockOperations: nonNegativeDelta(
      blockOperations(end),
      blockOperations(start),
      `${component.componentId}.blockOperations`,
    ),
    storageUsageBytes: {
      start: authorityObservation.start.storageUsageBytes,
      end: authorityObservation.end.storageUsageBytes,
      endpointPeak: Math.max(
        authorityObservation.start.storageUsageBytes,
        authorityObservation.end.storageUsageBytes,
      ),
    },
    provisioned: authorityAccounting.provisioned,
    authorityEnvelopeMilliseconds: authorityObservation.delta.durationMilliseconds,
  };
}

function sumField(rows, field) {
  return rows.reduce((sum, row) => sum + row[field], ZERO);
}

function projectResourceAccounting(
  calibration,
  sampled,
  components,
  measurementElapsedMs,
  transactionWindow,
) {
  assert.equal(calibration.artifact.payload.cleanupVerified, true);
  const first = sampled.samples[ZERO];
  const last = sampled.samples.at(-ONE);
  const componentRows = components.map((component) => componentWindowProjection(
    component,
    first,
    last,
    sampled.memory.components[component.componentId],
    calibration,
  ));
  const elapsedSeconds = measurementElapsedMs / 1000;
  const cpuCoreSeconds = sumField(componentRows, 'cpuCoreSeconds');
  return {
    method: 'docker-provider-window-samples-plus-resource-live-authority-v1',
    measurementBoundary: {
      setupExcluded: true,
      warmupExcluded: true,
      startHookOutsideWorkloadTimer: true,
      endHookOutsideWorkloadTimer: true,
      startTrigger: 'after-warmup-before-measurement-timer',
      endTrigger: 'after-measurement-timer-before-cleanup',
      measuredTransactionWindow: transactionWindow,
      workloadElapsedMs: measurementElapsedMs,
      note:
        'Sampled Docker counters conservatively bracket the timed transaction ' +
        'window by endpoint-snapshot overhead. Authority snapshots provide ' +
        'identity, limits, storage endpoints, digest, and cleanup proof.',
    },
    authorityArtifact: calibration.artifact,
    memorySampling: sampled.memory,
    sampledCounterWindow: {
      firstCapturedAtMs: first.capturedAtMs,
      lastCapturedAtMs: last.capturedAtMs,
    },
    components: componentRows,
    totals: {
      cpuCoreSeconds,
      averageCpuCores: elapsedSeconds > ZERO ?
        cpuCoreSeconds / elapsedSeconds :
        ZERO,
      memoryAverageBytes: sampled.memory.topology.averageBytes,
      memoryPeakBytes: sampled.memory.topology.peakBytes,
      networkContainerInterfaceBytes:
        sumField(componentRows, 'networkContainerInterfaceBytes'),
      blockReadBytes: sumField(componentRows, 'blockReadBytes'),
      blockWriteBytes: sumField(componentRows, 'blockWriteBytes'),
      blockOperations: sumField(componentRows, 'blockOperations'),
      provisionedCpuCores: componentRows.reduce(
        (sum, component) => sum + component.provisioned.cpuCores,
        ZERO,
      ),
      provisionedMemoryBytes: componentRows.reduce(
        (sum, component) => sum + component.provisioned.memoryBytes,
        ZERO,
      ),
    },
  };
}

async function main() {
  const provider = new DockerProvider();
  let observationSession = null;
  let observedComponents = null;
  let windowSampler = null;
  let sampledWindow = null;
  const transactionWindow = {
    startedAtMs: null,
    endedAtMs: null,
  };

  const measurementHooks = {
    async start(context) {
      observedComponents = resourceComponents(context.cluster);
      observationSession = await beginBenchmarkResourceLiveObservation(
        provider,
        {
          runId: context.runId,
          networkId: context.networkId,
          networkName: context.networkName,
          sourceRevision: process.env.GITHUB_SHA || 'local-hosted-smoke',
          components: observedComponents,
        },
      );
      windowSampler = await startWindowSampler(provider, observedComponents);
      transactionWindow.startedAtMs = Date.now();
    },
    async end() {
      transactionWindow.endedAtMs = Date.now();
      sampledWindow = await windowSampler.stop();
      await captureBenchmarkResourceLiveObservation(observationSession);
    },
  };

  const run = await runTiDbOltpAdapterSmoke({
    provider,
    workloadOptions: WORKLOAD_OPTIONS,
    measurementHooks,
  });

  assert.equal(run.status, 'passed');
  assert.equal(run.workload.measurement.failed, ZERO);
  assert.equal(
    run.workload.measurement.succeeded,
    WORKLOAD_OPTIONS.workers *
      WORKLOAD_OPTIONS.measurementOperationsPerWorker,
  );
  assert.ok(run.workload.opsPerSec > ZERO);
  assert.ok(run.workload.latency.count > ZERO);
  assert.match(run.workload.measurementPlanSha256, /^[a-f0-9]{64}$/u);
  assert.ok(observationSession, 'Expected resource observation to start');
  assert.ok(sampledWindow, 'Expected sampled resource window to complete');
  assert.ok(sampledWindow.memory.sampleCount >= 2, 'Expected repeated memory samples');

  const finalization =
    await finalizeBenchmarkResourceLiveObservation(observationSession);
  const calibration = writeExternallyObservedBenchmarkResourceCalibration(
    finalization.receipt,
    finalization.authorization,
  );
  assert.equal(calibration.artifact.payload.components.length, 5);

  const resourceAccounting = projectResourceAccounting(
    calibration,
    sampledWindow,
    observedComponents,
    run.workload.measurement.elapsedMs,
    transactionWindow,
  );

  const evidence = {
    schemaVersion: 2,
    scenario: 'tidb-oltp-baseline',
    evidenceClass: 'hosted-smoke-non-comparative',
    comparable: false,
    nonComparableReason:
      'GitHub-hosted runner resources and placement are not the controlled ' +
      'GCP benchmark environment; these numbers validate measurement plumbing only.',
    generatedAt: new Date().toISOString(),
    source: {
      gitSha: process.env.GITHUB_SHA || null,
      githubRunId: process.env.GITHUB_RUN_ID || null,
      githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
    },
    runner: runnerEvidence(),
    topology: {
      tikvStoreCount: run.tikvStoreCount,
      persistentMysqlWorkerConnections: run.workerConnectionIds.length,
    },
    images: await imageIdentities(provider, run.images),
    dataset: {
      sha256: run.datasetSha256,
      summary: run.datasetSummary,
    },
    workloadProfile: WORKLOAD_OPTIONS,
    measurement: run.workload,
    resourceAccounting,
    correctness: {
      workerConnectionIds: run.workerConnectionIds,
      stateCounts: run.stateCounts,
    },
  };

  await mkdir(path.dirname(OUTPUT_PATH), {recursive: true});
  await writeFile(OUTPUT_PATH, JSON.stringify(evidence, null, 2) + '\n', 'utf8');

  process.stdout.write(PASS_PREFIX + JSON.stringify({
    evidencePath: OUTPUT_PATH,
    measuredTransactions: run.workload.measurement.succeeded,
    opsPerSec: run.workload.opsPerSec,
    p50Ms: run.workload.latency.p50,
    p95Ms: run.workload.latency.p95,
    p99Ms: run.workload.latency.p99,
    cpuCoreSeconds: resourceAccounting.totals.cpuCoreSeconds,
    averageCpuCores: resourceAccounting.totals.averageCpuCores,
    memoryAverageBytes: resourceAccounting.totals.memoryAverageBytes,
    memoryPeakBytes: resourceAccounting.totals.memoryPeakBytes,
    networkContainerInterfaceBytes:
      resourceAccounting.totals.networkContainerInterfaceBytes,
    blockReadBytes: resourceAccounting.totals.blockReadBytes,
    blockWriteBytes: resourceAccounting.totals.blockWriteBytes,
    measurementPlanSha256: run.workload.measurementPlanSha256,
    datasetSha256: run.datasetSha256,
  }) + '\n');
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = ONE;
});
