import {
  appendOwnArrayValue,
  digestBenchmarkSemanticData,
  isNonNegativeSafeNumber,
} from './benchmark-semantic-integrity.js';
import {
  assertBenchmarkResourceArray,
  assertBenchmarkResourceDigest,
  assertBenchmarkResourceExactRecord,
  assertBenchmarkResourceInteger,
  assertBenchmarkResourceNumber,
  assertBenchmarkResourceText,
  createBenchmarkResourceArtifact,
} from './benchmark-resource-evidence-data.js';
import {
  BENCHMARK_RESOURCE_ARTIFACT_KIND,
  BENCHMARK_RESOURCE_BILLING_TREATMENT,
  BENCHMARK_RESOURCE_COMPONENT_ROLE,
  BENCHMARK_RESOURCE_CONTRACT,
  BENCHMARK_RESOURCE_LIMIT,
} from './benchmark-resource-contract-constants.js';
const localText = Object.freeze({
  INVENTORY_SIDES: 'inventory.sides',
  INVENTORY_SIDES_EXACT_PAIR_REQUIRED: 'inventory.sides:exact_pair_required',
  INVENTORY_SIDES_SIDE_DUPLICATE: 'inventory.sides:side_duplicate',
  INVENTORY: 'inventory',
  INVENTORY_INVENTORY_ID: 'inventory.inventoryId',
  INVENTORY_MATRIX_ID: 'inventory.matrixId',
  RESOURCE_WINDOW_COMPONENTS: 'resourceWindow.components',
  RESOURCE_WINDOW_COMPONENTS_NON_EMPTY_REQUIRED: 'resourceWindow.components:non_empty_required',
  RESOURCE_WINDOW_COMPONENTS_COMPONENT_DUPLICATE: 'resourceWindow.components:component_duplicate',
  RESOURCE_WINDOW: 'resourceWindow',
  RESOURCE_WINDOW_STARTED_AT: 'resourceWindow.startedAt',
  RESOURCE_WINDOW_ENDED_AT: 'resourceWindow.endedAt',
  RESOURCE_WINDOW_INTERVAL_NOT_POSITIVE: 'resourceWindow.interval:not_positive',
  RESOURCE_WINDOW_CORRECT_SLO_ELIGIBLE_OPERATIONS: 'resourceWindow.correctSloEligibleOperations',
  RESOURCE_WINDOW_KIND_UNSUPPORTED: 'resourceWindow.kind:unsupported',
  RESOURCE_WINDOW_PAYLOAD: 'resourceWindow.payload',
  RESOURCE_WINDOW_VERSION_UNSUPPORTED: 'resourceWindow.version:unsupported',
  RESOURCE_WINDOW_RECONSTRUCTION_MISMATCH: 'resourceWindow:reconstruction_mismatch',
  VALID: 'valid',
  INVENTORY_KIND_UNSUPPORTED: 'inventory.kind:unsupported',
  INVENTORY_PAYLOAD: 'inventory.payload',
  INVENTORY_VERSION_UNSUPPORTED: 'inventory.version:unsupported',
  INVENTORY_RECONSTRUCTION_MISMATCH: 'inventory:reconstruction_mismatch',
});


const inventoryInputKeys = Object.freeze(['inventoryId', 'matrixId', 'sides']);
const inventoryPayloadKeys = Object.freeze([
  'version',
  'inventoryId',
  'matrixId',
  'sides',
]);
const sideKeys = Object.freeze(['sideId', 'components']);
const componentKeys = Object.freeze([
  'componentId',
  'role',
  'billingTreatment',
  'provisioned',
  'minimumFootprint',
  'reservedHeadroomRatio',
  'exclusionReason',
]);
const provisionedKeys = Object.freeze([
  'cpuCores',
  'memoryBytes',
  'storageBytes',
  'iops',
  'networkBytesPerSecond',
]);
const minimumFootprintKeys = Object.freeze([
  'instances',
  'cpuCores',
  'memoryBytes',
  'storageBytes',
]);
const windowInputKeys = Object.freeze([
  'windowId',
  'matrixManifestDigest',
  'matrixId',
  'cellId',
  'pairId',
  'runId',
  'sideId',
  'windowReceiptDigest',
  'capacitySampleDigest',
  'semanticReceiptDigest',
  'liveEngagementDigest',
  'liveCalibrationDigest',
  'startedAt',
  'endedAt',
  'correctSloEligibleOperations',
  'components',
]);
const windowPayloadKeys = Object.freeze([
  'version',
  ...windowInputKeys,
  'durationSeconds',
  'resourceWindowDigest',
]);
const componentSampleKeys = Object.freeze([
  'componentId',
  'observationStartDigest',
  'observationEndDigest',
  'utilized',
  'amplification',
]);
const utilizedKeys = Object.freeze([
  'cpuCoreSeconds',
  'memoryByteSeconds',
  'storageByteSeconds',
  'iops',
  'networkBytes',
  'interZoneNetworkBytes',
]);
const amplificationKeys = Object.freeze([
  'replicationBytes',
  'temporaryMovementBytes',
  'rebuildBytes',
  'compactionBytes',
  'materializationBytes',
]);
const roleValues = new Set(Object.values(BENCHMARK_RESOURCE_COMPONENT_ROLE));
const billingValues =
  new Set(Object.values(BENCHMARK_RESOURCE_BILLING_TREATMENT));
const timestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const dateParse = Date.parse;
const numberIsFinite = Number.isFinite;
const numberIsInteger = Number.isInteger;
const regexpTest = Function.call.bind(RegExp.prototype.test);
const setAdd = Function.call.bind(Set.prototype.add);
const setHas = Function.call.bind(Set.prototype.has);
const noExclusion = 'none';
const millisecondsPerSecond = 1000;

function fail(message) {
  throw new TypeError(message);
}

function assertTimestamp(value, path) {
  if (
    typeof value !== 'string' ||
    !regexpTest(timestampPattern, value) ||
    !numberIsFinite(dateParse(value))
  ) {
    fail(`${path}:iso_timestamp_required`);
  }
}

function copyNumericRecord(value, keys, path) {
  assertBenchmarkResourceExactRecord(value, keys, path);
  const copy = {};
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    assertBenchmarkResourceNumber(value[key], `${path}.${key}`);
    copy[key] = value[key];
  }
  return copy;
}

function copyComponent(component, path) {
  assertBenchmarkResourceExactRecord(component, componentKeys, path);
  assertBenchmarkResourceText(component.componentId, `${path}.componentId`);
  if (!setHas(roleValues, component.role)) fail(`${path}.role:unsupported`);
  if (!setHas(billingValues, component.billingTreatment)) {
    fail(`${path}.billingTreatment:unsupported`);
  }
  assertBenchmarkResourceNumber(
    component.reservedHeadroomRatio,
    `${path}.reservedHeadroomRatio`,
  );
  if (component.reservedHeadroomRatio > 1) {
    fail(`${path}.reservedHeadroomRatio:ratio_required`);
  }
  assertBenchmarkResourceText(
    component.exclusionReason,
    `${path}.exclusionReason`,
  );
  if (
    component.billingTreatment ===
      BENCHMARK_RESOURCE_BILLING_TREATMENT.INCLUDED &&
    component.exclusionReason !== noExclusion
  ) {
    fail(`${path}.exclusionReason:included_requires_none`);
  }
  if (
    component.billingTreatment ===
      BENCHMARK_RESOURCE_BILLING_TREATMENT.SYMMETRICALLY_EXCLUDED &&
    component.exclusionReason === noExclusion
  ) {
    fail(`${path}.exclusionReason:excluded_requires_reason`);
  }
  const minimumFootprint = copyNumericRecord(
    component.minimumFootprint,
    minimumFootprintKeys,
    `${path}.minimumFootprint`,
  );
  if (!numberIsInteger(minimumFootprint.instances)) {
    fail(`${path}.minimumFootprint.instances:integer_required`);
  }
  return {
    componentId: component.componentId,
    role: component.role,
    billingTreatment: component.billingTreatment,
    provisioned: copyNumericRecord(
      component.provisioned,
      provisionedKeys,
      `${path}.provisioned`,
    ),
    minimumFootprint,
    reservedHeadroomRatio: component.reservedHeadroomRatio,
    exclusionReason: component.exclusionReason,
  };
}

function copySides(sides) {
  assertBenchmarkResourceArray(sides, localText.INVENTORY_SIDES, 2);
  if (sides.length !== 2) fail(localText.INVENTORY_SIDES_EXACT_PAIR_REQUIRED);
  const sideIds = new Set();
  const copy = [];
  for (let sideIndex = 0; sideIndex < sides.length; sideIndex += 1) {
    const side = sides[sideIndex];
    const path = `inventory.sides.${sideIndex}`;
    assertBenchmarkResourceExactRecord(side, sideKeys, path);
    assertBenchmarkResourceText(side.sideId, `${path}.sideId`);
    if (setHas(sideIds, side.sideId)) {
      fail(localText.INVENTORY_SIDES_SIDE_DUPLICATE);
    }
    setAdd(sideIds, side.sideId);
    assertBenchmarkResourceArray(
      side.components,
      `${path}.components`,
      BENCHMARK_RESOURCE_LIMIT.COMPONENTS_PER_SIDE,
    );
    if (side.components.length === 0) {
      fail(`${path}.components:non_empty_required`);
    }
    const componentIds = new Set();
    const components = [];
    for (let componentIndex = 0;
      componentIndex < side.components.length;
      componentIndex += 1) {
      const component = copyComponent(
        side.components[componentIndex],
        `${path}.components.${componentIndex}`,
      );
      if (setHas(componentIds, component.componentId)) {
        fail(`${path}.components:component_duplicate`);
      }
      setAdd(componentIds, component.componentId);
      appendOwnArrayValue(components, component);
    }
    appendOwnArrayValue(copy, {sideId: side.sideId, components});
  }
  return copy;
}

export function createBenchmarkResourceComponentInventory(input) {
  assertBenchmarkResourceExactRecord(
    input,
    inventoryInputKeys,
    localText.INVENTORY,
  );
  assertBenchmarkResourceText(input.inventoryId, localText.INVENTORY_INVENTORY_ID);
  assertBenchmarkResourceText(input.matrixId, localText.INVENTORY_MATRIX_ID);
  return createBenchmarkResourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.COMPONENT_INVENTORY,
    {
      version: BENCHMARK_RESOURCE_CONTRACT.COMPONENT_INVENTORY_VERSION,
      inventoryId: input.inventoryId,
      matrixId: input.matrixId,
      sides: copySides(input.sides),
    },
  );
}

function copyComponentSamples(components) {
  assertBenchmarkResourceArray(
    components,
    localText.RESOURCE_WINDOW_COMPONENTS,
    BENCHMARK_RESOURCE_LIMIT.COMPONENTS_PER_SIDE,
  );
  if (components.length === 0) {
    fail(localText.RESOURCE_WINDOW_COMPONENTS_NON_EMPTY_REQUIRED);
  }
  const ids = new Set();
  const copy = [];
  for (let index = 0; index < components.length; index += 1) {
    const component = components[index];
    const path = `resourceWindow.components.${index}`;
    assertBenchmarkResourceExactRecord(component, componentSampleKeys, path);
    assertBenchmarkResourceText(component.componentId, `${path}.componentId`);
    if (setHas(ids, component.componentId)) {
      fail(localText.RESOURCE_WINDOW_COMPONENTS_COMPONENT_DUPLICATE);
    }
    setAdd(ids, component.componentId);
    assertBenchmarkResourceDigest(
      component.observationStartDigest,
      `${path}.observationStartDigest`,
    );
    assertBenchmarkResourceDigest(
      component.observationEndDigest,
      `${path}.observationEndDigest`,
    );
    appendOwnArrayValue(copy, {
      componentId: component.componentId,
      observationStartDigest: component.observationStartDigest,
      observationEndDigest: component.observationEndDigest,
      utilized: copyNumericRecord(
        component.utilized,
        utilizedKeys,
        `${path}.utilized`,
      ),
      amplification: copyNumericRecord(
        component.amplification,
        amplificationKeys,
        `${path}.amplification`,
      ),
    });
  }
  return copy;
}

function resourceWindowBody(input, durationSeconds) {
  return {
    version: BENCHMARK_RESOURCE_CONTRACT.RESOURCE_WINDOW_VERSION,
    windowId: input.windowId,
    matrixManifestDigest: input.matrixManifestDigest,
    matrixId: input.matrixId,
    cellId: input.cellId,
    pairId: input.pairId,
    runId: input.runId,
    sideId: input.sideId,
    windowReceiptDigest: input.windowReceiptDigest,
    capacitySampleDigest: input.capacitySampleDigest,
    semanticReceiptDigest: input.semanticReceiptDigest,
    liveEngagementDigest: input.liveEngagementDigest,
    liveCalibrationDigest: input.liveCalibrationDigest,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    durationSeconds,
    correctSloEligibleOperations: input.correctSloEligibleOperations,
    components: copyComponentSamples(input.components),
  };
}

export function createBenchmarkResourceWindow(input) {
  assertBenchmarkResourceExactRecord(input, windowInputKeys, localText.RESOURCE_WINDOW);
  const textFields = [
    'windowId',
    'matrixId',
    'cellId',
    'pairId',
    'runId',
    'sideId',
  ];
  for (let index = 0; index < textFields.length; index += 1) {
    const field = textFields[index];
    assertBenchmarkResourceText(input[field], `resourceWindow.${field}`);
  }
  const digestFields = [
    'matrixManifestDigest',
    'windowReceiptDigest',
    'capacitySampleDigest',
    'semanticReceiptDigest',
    'liveEngagementDigest',
    'liveCalibrationDigest',
  ];
  for (let index = 0; index < digestFields.length; index += 1) {
    const field = digestFields[index];
    assertBenchmarkResourceDigest(input[field], `resourceWindow.${field}`);
  }
  assertTimestamp(input.startedAt, localText.RESOURCE_WINDOW_STARTED_AT);
  assertTimestamp(input.endedAt, localText.RESOURCE_WINDOW_ENDED_AT);
  const startedAt = dateParse(input.startedAt);
  const endedAt = dateParse(input.endedAt);
  if (endedAt <= startedAt) fail(localText.RESOURCE_WINDOW_INTERVAL_NOT_POSITIVE);
  assertBenchmarkResourceInteger(
    input.correctSloEligibleOperations,
    localText.RESOURCE_WINDOW_CORRECT_SLO_ELIGIBLE_OPERATIONS,
  );
  const durationSeconds = (endedAt - startedAt) / millisecondsPerSecond;
  const body = resourceWindowBody(input, durationSeconds);
  const resourceWindowDigest = digestBenchmarkSemanticData(body);
  const references = [
    input.matrixManifestDigest,
    input.windowReceiptDigest,
    input.capacitySampleDigest,
    input.semanticReceiptDigest,
    input.liveEngagementDigest,
    input.liveCalibrationDigest,
  ];
  const referenceSet = new Set();
  for (let index = 0; index < references.length; index += 1) {
    setAdd(referenceSet, references[index]);
  }
  for (let index = 0; index < body.components.length; index += 1) {
    const observationDigests = [
      body.components[index].observationStartDigest,
      body.components[index].observationEndDigest,
    ];
    for (let digestIndex = 0;
      digestIndex < observationDigests.length;
      digestIndex += 1) {
      const digest = observationDigests[digestIndex];
      if (!setHas(referenceSet, digest)) {
        setAdd(referenceSet, digest);
        appendOwnArrayValue(references, digest);
      }
    }
  }
  return createBenchmarkResourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.RESOURCE_WINDOW,
    {...body, resourceWindowDigest},
    references,
  );
}

export function inspectBenchmarkResourceWindowArtifact(artifact) {
  try {
    if (artifact.kind !== BENCHMARK_RESOURCE_ARTIFACT_KIND.RESOURCE_WINDOW) {
      fail(localText.RESOURCE_WINDOW_KIND_UNSUPPORTED);
    }
    const payload = artifact.payload;
    assertBenchmarkResourceExactRecord(
      payload,
      windowPayloadKeys,
      localText.RESOURCE_WINDOW_PAYLOAD,
    );
    if (payload.version !== BENCHMARK_RESOURCE_CONTRACT.RESOURCE_WINDOW_VERSION) {
      fail(localText.RESOURCE_WINDOW_VERSION_UNSUPPORTED);
    }
    const input = {};
    for (let index = 0; index < windowInputKeys.length; index += 1) {
      const key = windowInputKeys[index];
      input[key] = payload[key];
    }
    const reconstructed = createBenchmarkResourceWindow(input);
    if (
      reconstructed.artifact.payload.resourceWindowDigest !==
        payload.resourceWindowDigest ||
      digestBenchmarkSemanticData(reconstructed.artifact) !==
        digestBenchmarkSemanticData(artifact) ||
      !isNonNegativeSafeNumber(payload.durationSeconds) ||
      payload.durationSeconds !==
        reconstructed.artifact.payload.durationSeconds
    ) {
      fail(localText.RESOURCE_WINDOW_RECONSTRUCTION_MISMATCH);
    }
    return {valid: true, reason: localText.VALID};
  } catch (error) {
    return {valid: false, reason: error.message};
  }
}

export function inspectBenchmarkResourceInventoryArtifact(artifact) {
  try {
    if (
      artifact.kind !== BENCHMARK_RESOURCE_ARTIFACT_KIND.COMPONENT_INVENTORY
    ) {
      fail(localText.INVENTORY_KIND_UNSUPPORTED);
    }
    const payload = artifact.payload;
    assertBenchmarkResourceExactRecord(
      payload,
      inventoryPayloadKeys,
      localText.INVENTORY_PAYLOAD,
    );
    if (
      payload.version !==
        BENCHMARK_RESOURCE_CONTRACT.COMPONENT_INVENTORY_VERSION
    ) {
      fail(localText.INVENTORY_VERSION_UNSUPPORTED);
    }
    const reconstructed = createBenchmarkResourceComponentInventory({
      inventoryId: payload.inventoryId,
      matrixId: payload.matrixId,
      sides: payload.sides,
    });
    if (
      digestBenchmarkSemanticData(reconstructed.artifact) !==
        digestBenchmarkSemanticData(artifact)
    ) {
      fail(localText.INVENTORY_RECONSTRUCTION_MISMATCH);
    }
    return {valid: true, reason: localText.VALID};
  } catch (error) {
    return {valid: false, reason: error.message};
  }
}

export function findBenchmarkResourceInventorySide(payload, sideId) {
  for (let index = 0; index < payload.sides.length; index += 1) {
    if (payload.sides[index].sideId === sideId) return payload.sides[index];
  }
  return undefined;
}
