import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {
  DOCKER_CONTAINER_WRITABLE_LAYER_STORAGE_PATH,
} from '../../test/distributed/harness/docker-provider.js';
import {
  beginBenchmarkResourceLiveObservation,
  captureBenchmarkResourceLiveObservation,
  deriveBenchmarkResourceLiveComponentAccounting,
  finalizeBenchmarkResourceLiveObservation,
  writeExternallyObservedBenchmarkResourceCalibration,
} from
  '../../test/distributed/harness/benchmark-resource-live-observation-authority.js';
import {runTiDbOltpAdapterSmoke} from './run-tidb-oltp-adapter-live.js';

const arrayFind = Function.call.bind(Array.prototype.find);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const ZERO = 0;
const ONE = 1;
const NANOSECONDS_PER_SECOND = 1_000_000_000;
const MILLISECONDS_PER_SECOND = 1000;
const MEMORY_SAMPLE_INTERVAL_MS = MILLISECONDS_PER_SECOND;
const RESOURCE_SIDE_ID = 'tidb';

const COMPONENT_PD = 'pd';
const COMPONENT_TIDB = 'tidb';
const ROLE_PLACEMENT_DRIVER = 'placement-driver';
const ROLE_SQL_SERVER = 'sql-server';
const TIKV_PREFIX = 'tikv-';
const ROLE_TIKV_STORE = 'tikv-store';
const ROLE_UNKNOWN = 'unknown';

const MSG_RESOURCE_SAMPLES_START_END = 'Expected start and end resource samples';

const METHOD_DOCKER_WINDOW_SAMPLES =
  'docker-provider-window-samples-plus-resource-live-authority-v1';
const TRIGGER_START = 'after-warmup-before-measurement-timer';
const TRIGGER_END = 'after-measurement-timer-before-cleanup';
const MEASUREMENT_BOUNDARY_NOTE =
  'Sampled Docker counters conservatively bracket the timed transaction ' +
  'window by endpoint-snapshot overhead. Authority snapshots provide ' +
  'identity, limits, storage endpoints, digest, and cleanup proof.';

const FIELD_CPU_CORE_SECONDS = 'cpuCoreSeconds';
const FIELD_NETWORK_CONTAINER_INTERFACE_BYTES =
  'networkContainerInterfaceBytes';
const FIELD_BLOCK_READ_BYTES = 'blockReadBytes';
const FIELD_BLOCK_WRITE_BYTES = 'blockWriteBytes';
const FIELD_BLOCK_OPERATIONS = 'blockOperations';

const MSG_REQUIRES_PROVIDER = 'TiDB OLTP measurement requires provider';
const MSG_REQUIRES_OUTPUT_PATH = 'TiDB OLTP measurement requires outputPath';
const DEFAULT_SOURCE_REVISION = 'local-measurement';
const STATUS_PASSED = 'passed';
const MSG_EXPECTED_RESOURCE_OBSERVATION =
  'Expected resource observation to start';
const MSG_EXPECTED_SAMPLED_WINDOW =
  'Expected sampled resource window to complete';
const MSG_EXPECTED_REPEATED_MEMORY = 'Expected repeated memory samples';
const EXPECTED_COMPONENT_COUNT = 5;

const EVIDENCE_SCHEMA_VERSION = 3;
const SCENARIO_TIDB_OLTP_BASELINE = 'tidb-oltp-baseline';
const DEFAULT_NON_COMPARABLE_REASON =
  'Not registered as comparative evidence.';
const NEWLINE = '\n';
const ENCODING_UTF8 = 'utf8';
const JSON_INDENT = 2;

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
    arrayMap(Object.entries(images), async ([role, tag]) => [
      role,
      await inspectImageIdentity(provider, tag),
    ]),
  );
  return Object.fromEntries(entries);
}

function resourceComponents(cluster) {
  return [
    {
      componentId: COMPONENT_PD,
      sideId: RESOURCE_SIDE_ID,
      containerId: cluster.containers.pd.containerId,
      storagePath: DOCKER_CONTAINER_WRITABLE_LAYER_STORAGE_PATH,
    },
    ...arrayMap(cluster.containers.tikvStores, (container, index) => ({
      componentId: `${TIKV_PREFIX}${index + ONE}`,
      sideId: RESOURCE_SIDE_ID,
      containerId: container.containerId,
      storagePath: DOCKER_CONTAINER_WRITABLE_LAYER_STORAGE_PATH,
    })),
    {
      componentId: COMPONENT_TIDB,
      sideId: RESOURCE_SIDE_ID,
      containerId: cluster.containers.tidb.containerId,
      storagePath: DOCKER_CONTAINER_WRITABLE_LAYER_STORAGE_PATH,
    },
  ];
}

function componentRole(componentId) {
  if (componentId === COMPONENT_PD) return ROLE_PLACEMENT_DRIVER;
  if (componentId === COMPONENT_TIDB) return ROLE_SQL_SERVER;
  if (stringStartsWith(componentId, TIKV_PREFIX)) return ROLE_TIKV_STORE;
  return ROLE_UNKNOWN;
}

async function captureWindowSample(provider, components) {
  const entries = await Promise.all(
    arrayMap(components, async (component) => [
      component.componentId,
      await provider.getContainerStats(component.containerId),
    ]),
  );
  return {
    capturedAtMs: Date.now(),
    components: Object.fromEntries(entries),
  };
}

function memorySampleProjection(sample) {
  const componentBytes = Object.fromEntries(
    arrayMap(Object.entries(sample.components), ([componentId, stats]) => [
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
  const projected = arrayMap(samples, memorySampleProjection);
  const componentSummary = {};
  for (const component of components) {
    const componentId = component.componentId;
    componentSummary[componentId] = {
      averageBytes: timeWeightedAverage(
        projected,
        (sample) => sample.componentBytes[componentId],
      ),
      peakBytes: Math.max(
        ...arrayMap(projected, (sample) => sample.componentBytes[componentId]),
      ),
    };
  }
  return {
    intervalMs: MEMORY_SAMPLE_INTERVAL_MS,
    sampleCount: projected.length,
    components: componentSummary,
    topology: {
      averageBytes: timeWeightedAverage(projected, (sample) => sample.totalBytes),
      peakBytes: Math.max(...arrayMap(projected, (sample) => sample.totalBytes)),
    },
    samples: projected,
  };
}

async function startWindowSampler(provider, components) {
  const samples = [];
  let stopped = false;
  let timer = null;
  let pending = null;
  let samplingError = null;

  async function sample() {
    samples.push(await captureWindowSample(provider, components));
  }

  async function loop() {
    if (stopped) return;
    try {
      await sample();
    } catch (error) {
      samplingError = error;
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
      if (samplingError) throw samplingError;
      await sample();
      assert.ok(samples.length >= 2, MSG_RESOURCE_SAMPLES_START_END);
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
  const observation = arrayFind(
    calibration.artifact.payload.components,
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
  const componentRows = arrayMap(components, (component) =>
    componentWindowProjection(
      component,
      first,
      last,
      sampled.memory.components[component.componentId],
      calibration,
    ));
  const elapsedSeconds = measurementElapsedMs / MILLISECONDS_PER_SECOND;
  const cpuCoreSeconds = sumField(componentRows, FIELD_CPU_CORE_SECONDS);
  return {
    method: METHOD_DOCKER_WINDOW_SAMPLES,
    measurementBoundary: {
      setupExcluded: true,
      warmupExcluded: true,
      startHookOutsideWorkloadTimer: true,
      endHookOutsideWorkloadTimer: true,
      startTrigger: TRIGGER_START,
      endTrigger: TRIGGER_END,
      measuredTransactionWindow: transactionWindow,
      workloadElapsedMs: measurementElapsedMs,
      note: MEASUREMENT_BOUNDARY_NOTE,
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
        cpuCoreSeconds / elapsedSeconds : ZERO,
      memoryAverageBytes: sampled.memory.topology.averageBytes,
      memoryPeakBytes: sampled.memory.topology.peakBytes,
      networkContainerInterfaceBytes:
        sumField(componentRows, FIELD_NETWORK_CONTAINER_INTERFACE_BYTES),
      blockReadBytes: sumField(componentRows, FIELD_BLOCK_READ_BYTES),
      blockWriteBytes: sumField(componentRows, FIELD_BLOCK_WRITE_BYTES),
      blockOperations: sumField(componentRows, FIELD_BLOCK_OPERATIONS),
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

async function runTiDbOltpMeasurement(options = {}) {
  const provider = options.provider;
  assert.ok(provider, MSG_REQUIRES_PROVIDER);
  const outputPath = options.outputPath;
  assert.ok(outputPath, MSG_REQUIRES_OUTPUT_PATH);
  const workloadOptions = Object.freeze({
    ...WORKLOAD_OPTIONS,
    ...(options.workloadOptions || {}),
  });
  const sourceRevision =
    options.sourceRevision || process.env.GITHUB_SHA || DEFAULT_SOURCE_REVISION;

  let observationSession = null;
  let observedComponents = null;
  let windowSampler = null;
  let sampledWindow = null;
  const transactionWindow = {startedAtMs: null, endedAtMs: null};

  const measurementHooks = {
    async start(context) {
      observedComponents = resourceComponents(context.cluster);
      observationSession = await beginBenchmarkResourceLiveObservation(
        provider,
        {
          runId: context.runId,
          networkId: context.networkId,
          networkName: context.networkName,
          sourceRevision,
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
    workloadOptions,
    measurementHooks,
  });

  assert.equal(run.status, STATUS_PASSED);
  assert.equal(run.workload.measurement.failed, ZERO);
  assert.equal(
    run.workload.measurement.succeeded,
    workloadOptions.workers * workloadOptions.measurementOperationsPerWorker,
  );
  assert.ok(run.workload.opsPerSec > ZERO);
  assert.ok(run.workload.latency.count > ZERO);
  assert.match(run.workload.measurementPlanSha256, /^[a-f0-9]{64}$/u);
  assert.ok(observationSession, MSG_EXPECTED_RESOURCE_OBSERVATION);
  assert.ok(sampledWindow, MSG_EXPECTED_SAMPLED_WINDOW);
  assert.ok(sampledWindow.memory.sampleCount >= 2, MSG_EXPECTED_REPEATED_MEMORY);

  const finalization =
    await finalizeBenchmarkResourceLiveObservation(observationSession);
  const calibration = writeExternallyObservedBenchmarkResourceCalibration(
    finalization.receipt,
    finalization.authorization,
  );
  assert.equal(calibration.artifact.payload.components.length, EXPECTED_COMPONENT_COUNT);

  const resourceAccounting = projectResourceAccounting(
    calibration,
    sampledWindow,
    observedComponents,
    run.workload.measurement.elapsedMs,
    transactionWindow,
  );

  const evidence = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    scenario: SCENARIO_TIDB_OLTP_BASELINE,
    evidenceClass: options.evidenceClass,
    comparable: options.comparable === true,
    nonComparableReason: options.comparable === true ? null :
      String(options.nonComparableReason || DEFAULT_NON_COMPARABLE_REASON),
    generatedAt: new Date().toISOString(),
    source: {
      gitSha: process.env.GITHUB_SHA || null,
      githubRunId: process.env.GITHUB_RUN_ID || null,
      githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
    },
    controller: options.controllerEvidence || null,
    executionEnvironment: options.executionEnvironment || null,
    topology: {
      tikvStoreCount: run.tikvStoreCount,
      persistentMysqlWorkerConnections: run.workerConnectionIds.length,
    },
    images: await imageIdentities(provider, run.images),
    dataset: {
      sha256: run.datasetSha256,
      summary: run.datasetSummary,
    },
    workloadProfile: workloadOptions,
    measurement: run.workload,
    resourceAccounting,
    correctness: {
      workerConnectionIds: run.workerConnectionIds,
      stateCounts: run.stateCounts,
    },
  };

  await mkdir(path.dirname(outputPath), {recursive: true});
  await writeFile(
    outputPath,
    JSON.stringify(evidence, null, JSON_INDENT) + NEWLINE,
    ENCODING_UTF8,
  );

  return {
    evidencePath: outputPath,
    evidence,
    summary: {
      evidencePath: outputPath,
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
    },
  };
}

export {
  WORKLOAD_OPTIONS as TIDB_OLTP_MEASUREMENT_WORKLOAD_OPTIONS,
  runTiDbOltpMeasurement,
};
