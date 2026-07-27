import {
  appendOwnArrayValue,
  digestBenchmarkSemanticData,
} from './benchmark-semantic-integrity.js';
import {
  assertBenchmarkResourceArray,
  assertBenchmarkResourceExactRecord,
  assertBenchmarkResourceInteger,
  assertBenchmarkResourceNumber,
  assertBenchmarkResourceText,
  benchmarkResourceCanonicalBytes,
  benchmarkResourceDigestBytes,
} from './benchmark-resource-evidence-data.js';
import {
  BENCHMARK_RESOURCE_ARTIFACT_KIND,
  BENCHMARK_RESOURCE_CONTRACT,
  BENCHMARK_RESOURCE_LIMIT,
} from './benchmark-resource-contract-constants.js';
const localText = Object.freeze({
  LIVE_OBSERVATION_PROVIDER_REQUIRED_METHODS_MISSING: 'liveObservation.provider:required_methods_missing',
  LIVE_OBSERVATION_COMPONENTS: 'liveObservation.components',
  LIVE_OBSERVATION_COMPONENTS_NON_EMPTY_REQUIRED: 'liveObservation.components:non_empty_required',
  LIVE_OBSERVATION_COMPONENTS_IDENTITY_DUPLICATE: 'liveObservation.components:identity_duplicate',
  TIMESTAMP: 'timestamp',
  LIVE_OBSERVATION_COMPONENT_IDENTITY_OR_INTERVAL_MISMATCH: 'liveObservation.component:identity_or_interval_mismatch',
  LIVE_OBSERVATION_CPU_USAGE_NANOSECONDS: 'liveObservation.cpuUsageNanoseconds',
  LIVE_OBSERVATION_NETWORK_BYTES: 'liveObservation.networkBytes',
  LIVE_OBSERVATION_BLOCK_READ_BYTES: 'liveObservation.blockReadBytes',
  LIVE_OBSERVATION_BLOCK_WRITE_BYTES: 'liveObservation.blockWriteBytes',
  LIVE_OBSERVATION_BLOCK_OPERATIONS: 'liveObservation.blockOperations',
  LIVE_OBSERVATION: 'liveObservation',
  LIVE_OBSERVATION_CAPTURE_SINGLE_TRANSITION_REQUIRED: 'liveObservation.capture:single_transition_required',
  END: 'end',
  LIVE_OBSERVATION_CLEANUP_CONTAINER_PRESENT: 'liveObservation.cleanup:container_present',
  LIVE_OBSERVATION_CLEANUP_NETWORK_PRESENT: 'liveObservation.cleanup:network_present',
  LIVE_OBSERVATION_FINALIZE_CAPTURED_STATE_REQUIRED: 'liveObservation.finalize:captured_state_required',
  LIVE_OBSERVATION_RECEIPT: 'liveObservation.receipt',
  LIVE_OBSERVATION_AUTHORIZATION_INVALID: 'liveObservation.authorization:invalid',
  LIVE_CALIBRATION_KIND_UNSUPPORTED: 'liveCalibration.kind:unsupported',
  LIVE_CALIBRATION: 'liveCalibration',
  EXTERNALLY_OBSERVED: 'externally_observed',
  LIVE_CALIBRATION_EXTERNAL_CLEANUP_EVIDENCE_REQUIRED: 'liveCalibration:external_cleanup_evidence_required',
  LIVE_CALIBRATION_COMPONENTS: 'liveCalibration.components',
  LIVE_CALIBRATION_COMPONENTS_NON_EMPTY_REQUIRED: 'liveCalibration.components:non_empty_required',
  LIVE_CALIBRATION_COMPONENTS_IDENTITY_DUPLICATE: 'liveCalibration.components:identity_duplicate',
  LIVE_CALIBRATION_COMPONENT_RECONSTRUCTION_MISMATCH: 'liveCalibration.component:reconstruction_mismatch',
  LIVE_CALIBRATION_ARTIFACT_BYTES_SIZE_LIMIT:
    'liveCalibration.artifact_bytes:size_limit',
  LIVE_CALIBRATION_VALIDATION_FAILED: 'liveCalibration:validation_failed_closed',
  VALID: 'valid',
});


const beginKeys = Object.freeze([
  'runId',
  'networkId',
  'networkName',
  'sourceRevision',
  'components',
]);
const componentKeys =
  Object.freeze(['componentId', 'sideId', 'containerId', 'storagePath']);
const statsKeys = Object.freeze([
  'timestamp',
  'cpuPercent',
  'cpuUsageNanoseconds',
  'memoryUsageBytes',
  'memoryLimitBytes',
  'cpuLimitNanoCpus',
  'storageLimitBytes',
  'pids',
  'rxBytes',
  'txBytes',
  'blockReadBytes',
  'blockWriteBytes',
  'blockReadOperations',
  'blockWriteOperations',
  'storageUsageBytes',
]);
const receiptKeys = Object.freeze([
  'version',
  'runId',
  'observationDigest',
  'componentCount',
  'cleanupVerified',
]);
const artifactPayloadKeys = Object.freeze([
  'version',
  'evidenceClass',
  'runId',
  'networkId',
  'networkName',
  'sourceRevision',
  'cleanupVerified',
  'components',
]);
const observedComponentKeys = Object.freeze([
  'componentId',
  'sideId',
  'containerId',
  'storagePath',
  'start',
  'end',
  'delta',
]);
const deltaKeys = Object.freeze([
  'durationMilliseconds',
  'cpuUsageNanoseconds',
  'networkBytes',
  'blockReadBytes',
  'blockWriteBytes',
  'blockOperations',
]);
const authorityStates = new WeakMap();
const authorizations = new WeakMap();
const weakMapDelete = Function.call.bind(WeakMap.prototype.delete);
const weakMapGet = Function.call.bind(WeakMap.prototype.get);
const weakMapSet = Function.call.bind(WeakMap.prototype.set);
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const setAdd = Function.call.bind(Set.prototype.add);
const setHas = Function.call.bind(Set.prototype.has);
const statusObserving = 'observing';
const statusCapturing = 'capturing';
const statusCaptured = 'captured';
const statusFinalizing = 'finalizing';
const receiptVersion = 'benchmark-resource-live-observation-receipt-v1';
const artifactVersion = 'benchmark-resource-live-calibration-v1';
const dataValueKey = 'value';
const nanosecondsPerSecond = 1_000_000_000;
const millisecondsPerSecond = 1000;

function fail(message) {
  throw new TypeError(message);
}

function safeValidationReason(error) {
  if (!error || typeof error !== 'object') {
    return localText.LIVE_CALIBRATION_VALIDATION_FAILED;
  }
  const descriptor = objectGetOwnPropertyDescriptor(error, 'message');
  if (
    descriptor &&
    objectHasOwn(descriptor, dataValueKey) &&
    typeof descriptor.value === 'string'
  ) {
    return descriptor.value;
  }
  return localText.LIVE_CALIBRATION_VALIDATION_FAILED;
}

function assertProvider(provider) {
  if (
    !provider ||
    typeof provider !== 'object' ||
    typeof provider.inspectContainer !== 'function' ||
    typeof provider.inspectContainerIfExists !== 'function' ||
    typeof provider.getContainerResourceSnapshot !== 'function' ||
    typeof provider.getNetworkByName !== 'function'
  ) {
    fail(localText.LIVE_OBSERVATION_PROVIDER_REQUIRED_METHODS_MISSING);
  }
}

function copyComponents(components) {
  assertBenchmarkResourceArray(
    components,
    localText.LIVE_OBSERVATION_COMPONENTS,
    BENCHMARK_RESOURCE_LIMIT.COMPONENTS_PER_SIDE * 2,
  );
  if (components.length === 0) {
    fail(localText.LIVE_OBSERVATION_COMPONENTS_NON_EMPTY_REQUIRED);
  }
  const copy = [];
  const identities = new Set();
  for (let index = 0; index < components.length; index += 1) {
    const component = components[index];
    const path = `liveObservation.components.${index}`;
    assertBenchmarkResourceExactRecord(component, componentKeys, path);
    for (let fieldIndex = 0;
      fieldIndex < componentKeys.length;
      fieldIndex += 1) {
      const key = componentKeys[fieldIndex];
      assertBenchmarkResourceText(component[key], `${path}.${key}`);
    }
    const identity = `${component.sideId}\u0000${component.componentId}`;
    if (setHas(identities, identity)) {
      fail(localText.LIVE_OBSERVATION_COMPONENTS_IDENTITY_DUPLICATE);
    }
    setAdd(identities, identity);
    appendOwnArrayValue(copy, {
      componentId: component.componentId,
      sideId: component.sideId,
      containerId: component.containerId,
      storagePath: component.storagePath,
    });
  }
  return copy;
}

function copyStats(stats, path) {
  assertBenchmarkResourceExactRecord(stats, statsKeys, path);
  const copy = {};
  for (let index = 0; index < statsKeys.length; index += 1) {
    const key = statsKeys[index];
    if (key === localText.TIMESTAMP) {
      assertBenchmarkResourceInteger(stats[key], `${path}.${key}`);
    } else {
      assertBenchmarkResourceNumber(stats[key], `${path}.${key}`);
    }
    copy[key] = stats[key];
  }
  return copy;
}

async function captureComponents(provider, components, phase) {
  const observations = [];
  for (let index = 0; index < components.length; index += 1) {
    const component = components[index];
    const inspect = await provider.inspectContainer(component.containerId);
    if (inspect?.State?.Running !== true) {
      fail(`liveObservation.${phase}:container_not_running`);
    }
    const stats = copyStats(
      await provider.getContainerResourceSnapshot(
        component.containerId,
        component.storagePath,
      ),
      `liveObservation.${phase}.${index}`,
    );
    appendOwnArrayValue(observations, {...component, stats});
  }
  return observations;
}

function nonNegativeDelta(end, start, path) {
  const delta = end - start;
  if (delta < 0) fail(`${path}:counter_regressed`);
  return delta;
}

function minimumHeadroomRatio(capacity, used) {
  return capacity > 0 ? Math.max(0, (capacity - used) / capacity) : 1;
}

export function deriveBenchmarkResourceLiveComponentAccounting(observation) {
  const durationSeconds =
    observation.delta.durationMilliseconds / millisecondsPerSecond;
  const utilized = {
    cpuCoreSeconds:
      observation.delta.cpuUsageNanoseconds / nanosecondsPerSecond,
    memoryByteSeconds:
      (observation.start.memoryUsageBytes +
        observation.end.memoryUsageBytes) / 2 * durationSeconds,
    storageByteSeconds:
      (observation.start.storageUsageBytes +
        observation.end.storageUsageBytes) / 2 * durationSeconds,
    iops: observation.delta.blockOperations,
    networkBytes: observation.delta.networkBytes,
    interZoneNetworkBytes: 0,
  };
  const provisioned = {
    cpuCores: observation.end.cpuLimitNanoCpus / nanosecondsPerSecond,
    memoryBytes: observation.end.memoryLimitBytes,
    storageBytes: observation.end.storageLimitBytes,
    iops: 0,
    networkBytesPerSecond: 0,
  };
  const minimumFootprint = {
    instances: 1,
    cpuCores: utilized.cpuCoreSeconds / durationSeconds,
    memoryBytes: Math.max(
      observation.start.memoryUsageBytes,
      observation.end.memoryUsageBytes,
    ),
    storageBytes: Math.max(
      observation.start.storageUsageBytes,
      observation.end.storageUsageBytes,
    ),
  };
  let reservedHeadroomRatio = Math.min(
    minimumHeadroomRatio(
      provisioned.cpuCores,
      minimumFootprint.cpuCores,
    ),
    minimumHeadroomRatio(
      provisioned.memoryBytes,
      minimumFootprint.memoryBytes,
    ),
  );
  if (provisioned.storageBytes > 0) {
    reservedHeadroomRatio = Math.min(
      reservedHeadroomRatio,
      minimumHeadroomRatio(
        provisioned.storageBytes,
        minimumFootprint.storageBytes,
      ),
    );
  }
  return {
    provisioned,
    minimumFootprint,
    reservedHeadroomRatio,
    utilized,
    amplification: {
      replicationBytes: 0,
      temporaryMovementBytes: 0,
      rebuildBytes: 0,
      compactionBytes: 0,
      materializationBytes: 0,
    },
  };
}

function resourceLimitsMatch(start, end) {
  return start.stats.cpuLimitNanoCpus === end.stats.cpuLimitNanoCpus &&
    start.stats.memoryLimitBytes === end.stats.memoryLimitBytes &&
    start.stats.storageLimitBytes === end.stats.storageLimitBytes;
}

function componentObservation(component, start, end) {
  if (
    component.componentId !== start.componentId ||
    component.componentId !== end.componentId ||
    component.sideId !== start.sideId ||
    component.sideId !== end.sideId ||
    component.containerId !== start.containerId ||
    component.containerId !== end.containerId ||
    component.storagePath !== start.storagePath ||
    component.storagePath !== end.storagePath ||
    !resourceLimitsMatch(start, end) ||
    end.stats.timestamp <= start.stats.timestamp
  ) {
    fail(localText.LIVE_OBSERVATION_COMPONENT_IDENTITY_OR_INTERVAL_MISMATCH);
  }
  return {
    componentId: component.componentId,
    sideId: component.sideId,
    containerId: component.containerId,
    storagePath: component.storagePath,
    start: start.stats,
    end: end.stats,
    delta: {
      durationMilliseconds: end.stats.timestamp - start.stats.timestamp,
      cpuUsageNanoseconds: nonNegativeDelta(
        end.stats.cpuUsageNanoseconds,
        start.stats.cpuUsageNanoseconds,
        localText.LIVE_OBSERVATION_CPU_USAGE_NANOSECONDS,
      ),
      networkBytes: nonNegativeDelta(
        end.stats.rxBytes + end.stats.txBytes,
        start.stats.rxBytes + start.stats.txBytes,
        localText.LIVE_OBSERVATION_NETWORK_BYTES,
      ),
      blockReadBytes: nonNegativeDelta(
        end.stats.blockReadBytes,
        start.stats.blockReadBytes,
        localText.LIVE_OBSERVATION_BLOCK_READ_BYTES,
      ),
      blockWriteBytes: nonNegativeDelta(
        end.stats.blockWriteBytes,
        start.stats.blockWriteBytes,
        localText.LIVE_OBSERVATION_BLOCK_WRITE_BYTES,
      ),
      blockOperations: nonNegativeDelta(
        end.stats.blockReadOperations + end.stats.blockWriteOperations,
        start.stats.blockReadOperations + start.stats.blockWriteOperations,
        localText.LIVE_OBSERVATION_BLOCK_OPERATIONS,
      ),
    },
  };
}

export async function beginBenchmarkResourceLiveObservation(provider, input) {
  assertProvider(provider);
  assertBenchmarkResourceExactRecord(input, beginKeys, localText.LIVE_OBSERVATION);
  const textFields = [
    'runId',
    'networkId',
    'networkName',
    'sourceRevision',
  ];
  for (let index = 0; index < textFields.length; index += 1) {
    const field = textFields[index];
    assertBenchmarkResourceText(input[field], `liveObservation.${field}`);
  }
  const components = copyComponents(input.components);
  const start = await captureComponents(provider, components, 'start');
  const session = objectFreeze({});
  weakMapSet(authorityStates, session, {
    status: statusObserving,
    provider,
    runId: input.runId,
    networkId: input.networkId,
    networkName: input.networkName,
    sourceRevision: input.sourceRevision,
    components,
    start,
    end: null,
  });
  return session;
}

export async function captureBenchmarkResourceLiveObservation(session) {
  const state = weakMapGet(authorityStates, session);
  if (state?.status !== statusObserving) {
    fail(localText.LIVE_OBSERVATION_CAPTURE_SINGLE_TRANSITION_REQUIRED);
  }
  state.status = statusCapturing;
  try {
    state.end = await captureComponents(
      state.provider,
      state.components,
      localText.END,
    );
    state.status = statusCaptured;
  } catch (error) {
    state.status = statusObserving;
    throw error;
  }
}

async function assertCleanup(state) {
  for (let index = 0; index < state.components.length; index += 1) {
    if (
      await state.provider.inspectContainerIfExists(
        state.components[index].containerId,
      ) !== null
    ) {
      fail(localText.LIVE_OBSERVATION_CLEANUP_CONTAINER_PRESENT);
    }
  }
  if (await state.provider.getNetworkByName(state.networkName) !== null) {
    fail(localText.LIVE_OBSERVATION_CLEANUP_NETWORK_PRESENT);
  }
}

export async function finalizeBenchmarkResourceLiveObservation(session) {
  const state = weakMapGet(authorityStates, session);
  if (state?.status !== statusCaptured) {
    fail(localText.LIVE_OBSERVATION_FINALIZE_CAPTURED_STATE_REQUIRED);
  }
  state.status = statusFinalizing;
  await assertCleanup(state);
  const components = [];
  for (let index = 0; index < state.components.length; index += 1) {
    appendOwnArrayValue(
      components,
      componentObservation(
        state.components[index],
        state.start[index],
        state.end[index],
      ),
    );
  }
  const observation = {
    version: artifactVersion,
    evidenceClass: 'externally_observed',
    runId: state.runId,
    networkId: state.networkId,
    networkName: state.networkName,
    sourceRevision: state.sourceRevision,
    cleanupVerified: true,
    components,
  };
  const observationDigest = digestBenchmarkSemanticData(observation);
  const receipt = objectFreeze({
    version: receiptVersion,
    runId: state.runId,
    observationDigest,
    componentCount: components.length,
    cleanupVerified: true,
  });
  const authorization = objectFreeze({});
  weakMapSet(authorizations, authorization, {observation, receipt});
  weakMapDelete(authorityStates, session);
  return {receipt, authorization};
}

export function writeExternallyObservedBenchmarkResourceCalibration(
  receipt,
  authorization,
) {
  assertBenchmarkResourceExactRecord(
    receipt,
    receiptKeys,
    localText.LIVE_OBSERVATION_RECEIPT,
  );
  const authorized = weakMapGet(authorizations, authorization);
  if (
    authorized === undefined ||
    digestBenchmarkSemanticData(receipt) !==
      digestBenchmarkSemanticData(authorized.receipt)
  ) {
    fail(localText.LIVE_OBSERVATION_AUTHORIZATION_INVALID);
  }
  weakMapDelete(authorizations, authorization);
  const artifact = {
    schemaVersion: BENCHMARK_RESOURCE_CONTRACT.ARTIFACT_SCHEMA_VERSION,
    kind: BENCHMARK_RESOURCE_ARTIFACT_KIND.LIVE_CALIBRATION,
    references: [],
    payload: authorized.observation,
  };
  const bytes = benchmarkResourceCanonicalBytes(artifact);
  if (bytes.length > BENCHMARK_RESOURCE_LIMIT.ARTIFACT_BYTES) {
    fail(localText.LIVE_CALIBRATION_ARTIFACT_BYTES_SIZE_LIMIT);
  }
  return objectFreeze({
    digest: benchmarkResourceDigestBytes(bytes),
    bytes,
    byteLength: bytes.length,
    artifact,
  });
}

export function inspectBenchmarkResourceLiveCalibrationArtifact(artifact) {
  try {
    if (artifact.kind !== BENCHMARK_RESOURCE_ARTIFACT_KIND.LIVE_CALIBRATION) {
      fail(localText.LIVE_CALIBRATION_KIND_UNSUPPORTED);
    }
    const payload = artifact.payload;
    assertBenchmarkResourceExactRecord(
      payload,
      artifactPayloadKeys,
      localText.LIVE_CALIBRATION,
    );
    if (
      payload.version !== artifactVersion ||
      payload.evidenceClass !== localText.EXTERNALLY_OBSERVED ||
      payload.cleanupVerified !== true
    ) {
      fail(localText.LIVE_CALIBRATION_EXTERNAL_CLEANUP_EVIDENCE_REQUIRED);
    }
    const textFields = [
      'runId',
      'networkId',
      'networkName',
      'sourceRevision',
    ];
    for (let index = 0; index < textFields.length; index += 1) {
      const field = textFields[index];
      assertBenchmarkResourceText(payload[field], `liveCalibration.${field}`);
    }
    assertBenchmarkResourceArray(
      payload.components,
      localText.LIVE_CALIBRATION_COMPONENTS,
      BENCHMARK_RESOURCE_LIMIT.COMPONENTS_PER_SIDE * 2,
    );
    if (payload.components.length === 0) {
      fail(localText.LIVE_CALIBRATION_COMPONENTS_NON_EMPTY_REQUIRED);
    }
    const identities = new Set();
    for (let index = 0; index < payload.components.length; index += 1) {
      const component = payload.components[index];
      const path = `liveCalibration.components.${index}`;
      assertBenchmarkResourceExactRecord(
        component,
        observedComponentKeys,
        path,
      );
      for (let fieldIndex = 0;
        fieldIndex < componentKeys.length;
        fieldIndex += 1) {
        const key = componentKeys[fieldIndex];
        assertBenchmarkResourceText(component[key], `${path}.${key}`);
      }
      const identity = `${component.sideId}\u0000${component.componentId}`;
      if (setHas(identities, identity)) {
        fail(localText.LIVE_CALIBRATION_COMPONENTS_IDENTITY_DUPLICATE);
      }
      setAdd(identities, identity);
      assertBenchmarkResourceExactRecord(
        component.delta,
        deltaKeys,
        `${path}.delta`,
      );
      const rebuilt = componentObservation(
        component,
        {...component, stats: copyStats(component.start, `${path}.start`)},
        {...component, stats: copyStats(component.end, `${path}.end`)},
      );
      if (
        digestBenchmarkSemanticData(rebuilt) !==
          digestBenchmarkSemanticData(component)
      ) {
        fail(localText.LIVE_CALIBRATION_COMPONENT_RECONSTRUCTION_MISMATCH);
      }
    }
    return {valid: true, reason: localText.VALID};
  } catch (error) {
    return {valid: false, reason: safeValidationReason(error)};
  }
}

export function benchmarkResourceLiveCalibrationContainsComponent(
  artifact,
  sideId,
  componentId,
) {
  if (!inspectBenchmarkResourceLiveCalibrationArtifact(artifact).valid) {
    return false;
  }
  for (let index = 0; index < artifact.payload.components.length; index += 1) {
    const component = artifact.payload.components[index];
    if (
      component.sideId === sideId &&
      component.componentId === componentId
    ) {
      return true;
    }
  }
  return false;
}

export function resolveBenchmarkResourceLiveCalibrationComponent(
  artifact,
  sideId,
  componentId,
) {
  if (!inspectBenchmarkResourceLiveCalibrationArtifact(artifact).valid) {
    return undefined;
  }
  for (let index = 0; index < artifact.payload.components.length; index += 1) {
    const component = artifact.payload.components[index];
    if (
      component.sideId === sideId &&
      component.componentId === componentId
    ) {
      return component;
    }
  }
  return undefined;
}
