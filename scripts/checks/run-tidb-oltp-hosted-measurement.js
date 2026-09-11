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

async function captureMemorySample(provider, components) {
  const rows = await Promise.all(components.map(async (component) => {
    const stats = await provider.getContainerStats(component.containerId);
    return [component.componentId, stats.memoryUsageBytes];
  }));
  const componentBytes = Object.fromEntries(rows);
  const totalBytes = Object.values(componentBytes).reduce(
    (sum, value) => sum + value,
    ZERO,
  );
  return {
    capturedAtMs: Date.now(),
    componentBytes,
    totalBytes,
  };
}

function average(values) {
  if (values.length === ZERO) return ZERO;
  return values.reduce((sum, value) => sum + value, ZERO) / values.length;
}

function summarizeMemorySamples(samples, components) {
  assert.ok(samples.length > ZERO, 'Expected at least one memory sample');
  const componentSummary = {};
  for (const component of components) {
    const values = samples.map(
      (sample) => sample.componentBytes[component.componentId],
    );
    componentSummary[component.componentId] = {
      averageBytes: average(values),
      peakBytes: Math.max(...values),
    };
  }
  const totals = samples.map((sample) => sample.totalBytes);
  return {
    intervalMs: MEMORY_SAMPLE_INTERVAL_MS,
    sampleCount: samples.length,
    components: componentSummary,
    topology: {
      averageBytes: average(totals),
      peakBytes: Math.max(...totals),
    },
    samples,
  };
}

async function startMemorySampler(provider, components) {
  const samples = [];
  let stopped = false;
  let timer = null;
  let pending = null;
  let failure = null;

  async function sample() {
    samples.push(await captureMemorySample(provider, components));
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
      return summarizeMemorySamples(samples, components);
    },
  };
}

function componentProjection(observation, memory) {
  const accounting = deriveBenchmarkResourceLiveComponentAccounting(observation);
  const durationSeconds = observation.delta.durationMilliseconds / 1000;
  return {
    componentId: observation.componentId,
    role: componentRole(observation.componentId),
    durationMilliseconds: observation.delta.durationMilliseconds,
    cpuCoreSeconds: accounting.utilized.cpuCoreSeconds,
    averageCpuCores: durationSeconds > ZERO ?
      accounting.utilized.cpuCoreSeconds / durationSeconds :
      ZERO,
    memoryAverageBytes: memory.averageBytes,
    memoryPeakBytes: memory.peakBytes,
    networkContainerInterfaceBytes: observation.delta.networkBytes,
    blockReadBytes: observation.delta.blockReadBytes,
    blockWriteBytes: observation.delta.blockWriteBytes,
    blockOperations: observation.delta.blockOperations,
    storageUsageBytes: {
      start: observation.start.storageUsageBytes,
      end: observation.end.storageUsageBytes,
      endpointPeak: Math.max(
        observation.start.storageUsageBytes,
        observation.end.storageUsageBytes,
      ),
    },
    provisioned: accounting.provisioned,
  };
}

function sumField(rows, field) {
  return rows.reduce((sum, row) => sum + row[field], ZERO);
}

function projectResourceAccounting(
  calibration,
  memorySummary,
  measurementElapsedMs,
  transactionWindow,
) {
  assert.equal(calibration.artifact.payload.cleanupVerified, true);
  const observations = calibration.artifact.payload.components;
  const components = observations.map((observation) => componentProjection(
    observation,
    memorySummary.components[observation.componentId],
  ));
  const elapsedSeconds = measurementElapsedMs / 1000;
  const cpuCoreSeconds = sumField(components, 'cpuCoreSeconds');
  return {
    method: 'benchmark-resource-live-observation-plus-memory-sampling-v1',
    measurementBoundary: {
      setupExcluded: true,
      warmupExcluded: true,
      startTrigger: 'before-first-measured-transaction',
      endTrigger: 'after-final-measured-transaction',
      measuredTransactionWindow: transactionWindow,
      workloadElapsedMs: measurementElapsedMs,
      note:
        'Docker counter snapshots conservatively enclose the measured transaction ' +
        'window by their capture overhead; setup and warmup are outside the window.',
    },
    authorityArtifact: calibration.artifact,
    memorySampling: memorySummary,
    components,
    totals: {
      cpuCoreSeconds,
      averageCpuCores: elapsedSeconds > ZERO ?
        cpuCoreSeconds / elapsedSeconds :
        ZERO,
      memoryAverageBytes: memorySummary.topology.averageBytes,
      memoryPeakBytes: memorySummary.topology.peakBytes,
      networkContainerInterfaceBytes:
        sumField(components, 'networkContainerInterfaceBytes'),
      blockReadBytes: sumField(components, 'blockReadBytes'),
      blockWriteBytes: sumField(components, 'blockWriteBytes'),
      blockOperations: sumField(components, 'blockOperations'),
      provisionedCpuCores: components.reduce(
        (sum, component) => sum + component.provisioned.cpuCores,
        ZERO,
      ),
      provisionedMemoryBytes: components.reduce(
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
  let memorySampler = null;
  let memorySummary = null;
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
      memorySampler = await startMemorySampler(provider, observedComponents);
      transactionWindow.startedAtMs = Date.now();
    },
    async end() {
      transactionWindow.endedAtMs = Date.now();
      memorySummary = await memorySampler.stop();
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
  assert.ok(memorySummary, 'Expected memory sampling to complete');
  assert.ok(memorySummary.sampleCount >= 2, 'Expected repeated memory samples');

  const finalization =
    await finalizeBenchmarkResourceLiveObservation(observationSession);
  const calibration = writeExternallyObservedBenchmarkResourceCalibration(
    finalization.receipt,
    finalization.authorization,
  );
  assert.equal(calibration.artifact.payload.components.length, 5);

  const resourceAccounting = projectResourceAccounting(
    calibration,
    memorySummary,
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
