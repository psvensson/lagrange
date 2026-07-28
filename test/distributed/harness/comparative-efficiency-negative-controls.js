import {
  appendOwnArrayValue,
  digestBenchmarkSemanticData,
} from './benchmark-semantic-integrity.js';
import {types} from 'node:util';
import {
  createBenchmarkResourceComponentInventory,
} from './benchmark-resource-accounting.js';
import {
  createBenchmarkResourcePriceSheet,
} from './benchmark-resource-cost-and-effects.js';
import {
  assertBenchmarkResourceArray,
  assertBenchmarkResourceBytes,
  assertBenchmarkResourceCanonicalData,
  assertBenchmarkResourceExactRecord,
  assertBenchmarkResourceText,
  createBenchmarkResourceMemoryResolver,
  parseBenchmarkResourceArtifact,
} from './benchmark-resource-evidence-data.js';
import {
  createBenchmarkResourceEvidenceRoot,
  createBenchmarkResourceNonMeasuringCellEvidence,
  createBenchmarkResourceSourceArtifact,
  validateBenchmarkResourceEvidenceRoot,
} from './benchmark-resource-evidence-root.js';
import {
  inspectBenchmarkResourceLiveCalibrationArtifact,
} from './benchmark-resource-live-observation-authority.js';
import {
  createBenchmarkResourceMatrixManifest,
} from './benchmark-resource-matrix-manifest.js';
import {
  BENCHMARK_RESOURCE_ARTIFACT_KIND,
  BENCHMARK_RESOURCE_CELL_STATE,
} from './benchmark-resource-contract-constants.js';
import {
  assertComparativeNegativeControlLiveEvidence,
  assertComparativeNegativeControlOwners,
  assertComparativeNegativeControlSource,
} from './comparative-efficiency-negative-controls-admission.js';
import {
  COMPARATIVE_NEGATIVE_CONTROL_IDS,
  COMPARATIVE_NEGATIVE_CONTROL_REASON,
} from './comparative-efficiency-negative-controls-constants.js';
export {
  COMPARATIVE_NEGATIVE_CONTROL_IDS,
  COMPARATIVE_NEGATIVE_CONTROL_REASON,
  COMPARATIVE_NEGATIVE_CONTROL_SCENARIO,
  COMPARATIVE_NEGATIVE_CONTROL_WORKLOADS,
} from './comparative-efficiency-negative-controls-constants.js';

const localText = Object.freeze({
  INPUT: 'negativeControls',
  ATTEMPTS: 'negativeControls.attempts',
  ATTEMPTS_EXACT_MATRIX_REQUIRED:
    'negativeControls.attempts:exact_matrix_required',
  ATTEMPT_CONTROL_ORDER_MISMATCH:
    'negativeControls.attempts:control_order_mismatch',
  ATTEMPT_CANDIDATE_MUST_BE_ABSENT:
    'negativeControls.attempt:candidate_must_be_absent',
  ATTEMPT_ALTERNATIVE_MUST_BE_ENGAGED:
    'negativeControls.attempt:alternative_must_be_engaged',
  ATTEMPT_REASON_REQUIRED:
    'negativeControls.attempt:candidate_absence_reason_required',
  CALIBRATION_INVALID:
    'negativeControls.calibration:external_observation_required',
  MATRIX_SHAPE_MISMATCH:
    'negativeControls.matrix:exact_control_axis_required',
  CELL_SHAPE_MISMATCH:
    'negativeControls.cells:explicit_non_measuring_required',
  CELL_SOURCE_MISMATCH:
    'negativeControls.cells:live_attempt_source_mismatch',
  ROOT_INVALID: 'negativeControls.root:invalid',
  SIDE_IDS: 'negativeControls.sideIds',
  SIDE_IDS_DISTINCT_EXACT_PAIR_REQUIRED:
    'negativeControls.sideIds:distinct_exact_pair_required',
  AXIS_CONTROL: 'control',
  ROOT: 'root',
  VALID: 'valid',
});

const inputKeys = Object.freeze([
  'matrixId',
  'pairId',
  'sideIds',
  'sourceRevision',
  'producedAt',
  'validUntil',
  'workloadManifest',
  'alternativeTopology',
  'preregistration',
  'inventoryId',
  'inventorySides',
  'priceSheet',
  'calibrationArtifact',
  'attempts',
]);
const attemptKeys = Object.freeze([
  'controlId',
  'runId',
  'candidateEngaged',
  'alternativeEngaged',
  'reasonCodes',
  'liveEvidence',
]);
const sourcePayloadKeys = Object.freeze([
  'version',
  'matrixId',
  'cellId',
  'pairId',
  'runId',
  'sideIds',
  'controlId',
  'state',
  'candidateEngaged',
  'alternativeEngaged',
  'reasonCodes',
  'liveEvidence',
  'calibrationDigest',
  'workloadManifestDigest',
  'alternativeTopologyDigest',
  'preregistrationDigest',
]);
const receiptKeys = Object.freeze(['rootDigest', 'resolver']);
const resolverKeys = Object.freeze(['resolve']);
const sourceVersion =
  'comparative-negative-control-live-attempt-v1';
const maximumReasonCodes = 16;
const dataValueKey = 'value';
const bufferFrom = Buffer.from;
const mapGet = Function.call.bind(Map.prototype.get);
const mapHas = Function.call.bind(Map.prototype.has);
const mapSet = Function.call.bind(Map.prototype.set);
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const reflectApply = Reflect.apply;

function fail(message) {
  throw new TypeError(message);
}

function exactValues(actual, expected) {
  if (actual.length !== expected.length) return false;
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] !== expected[index]) return false;
  }
  return true;
}

function arrayContains(values, expected) {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === expected) return true;
  }
  return false;
}

function ownDataValue(value, key, path) {
  const descriptor = objectGetOwnPropertyDescriptor(value, key);
  if (!descriptor || !objectHasOwn(descriptor, dataValueKey)) {
    fail(`${path}:own_data_property_required`);
  }
  return descriptor.value;
}

function safeErrorMessage(error) {
  if (!error || typeof error !== 'object' || types.isProxy(error)) {
    return localText.ROOT_INVALID;
  }
  const descriptor = objectGetOwnPropertyDescriptor(error, 'message');
  if (
    descriptor &&
    objectHasOwn(descriptor, dataValueKey) &&
    typeof descriptor.value === 'string'
  ) {
    return descriptor.value;
  }
  return localText.ROOT_INVALID;
}

function copySideIds(sideIds) {
  assertBenchmarkResourceArray(sideIds, localText.SIDE_IDS, 2);
  if (sideIds.length !== 2 || sideIds[0] === sideIds[1]) {
    fail(localText.SIDE_IDS_DISTINCT_EXACT_PAIR_REQUIRED);
  }
  const copy = [];
  for (let index = 0; index < sideIds.length; index += 1) {
    assertBenchmarkResourceText(
      sideIds[index],
      `negativeControls.sideIds.${index}`,
    );
    appendOwnArrayValue(copy, sideIds[index]);
  }
  return copy;
}

function copyReasonCodes(reasonCodes, index) {
  assertBenchmarkResourceArray(
    reasonCodes,
    `negativeControls.attempts.${index}.reasonCodes`,
    maximumReasonCodes,
  );
  if (
    reasonCodes.length === 0 ||
    !arrayContains(reasonCodes, COMPARATIVE_NEGATIVE_CONTROL_REASON)
  ) {
    fail(localText.ATTEMPT_REASON_REQUIRED);
  }
  const copy = [];
  for (let reasonIndex = 0;
    reasonIndex < reasonCodes.length;
    reasonIndex += 1) {
    assertBenchmarkResourceText(
      reasonCodes[reasonIndex],
      `negativeControls.attempts.${index}.reasonCodes.${reasonIndex}`,
    );
    appendOwnArrayValue(copy, reasonCodes[reasonIndex]);
  }
  return copy;
}

function copyAttempts(attempts) {
  assertBenchmarkResourceArray(
    attempts,
    localText.ATTEMPTS,
    COMPARATIVE_NEGATIVE_CONTROL_IDS.length,
  );
  if (attempts.length !== COMPARATIVE_NEGATIVE_CONTROL_IDS.length) {
    fail(localText.ATTEMPTS_EXACT_MATRIX_REQUIRED);
  }
  const copy = [];
  for (let index = 0; index < attempts.length; index += 1) {
    const path = `negativeControls.attempts.${index}`;
    const attempt = attempts[index];
    assertBenchmarkResourceExactRecord(attempt, attemptKeys, path);
    if (attempt.controlId !== COMPARATIVE_NEGATIVE_CONTROL_IDS[index]) {
      fail(localText.ATTEMPT_CONTROL_ORDER_MISMATCH);
    }
    assertBenchmarkResourceText(attempt.runId, `${path}.runId`);
    if (attempt.candidateEngaged !== false) {
      fail(localText.ATTEMPT_CANDIDATE_MUST_BE_ABSENT);
    }
    if (attempt.alternativeEngaged !== true) {
      fail(localText.ATTEMPT_ALTERNATIVE_MUST_BE_ENGAGED);
    }
    assertBenchmarkResourceCanonicalData(attempt.liveEvidence);
    assertComparativeNegativeControlLiveEvidence(
      attempt.liveEvidence,
      attempt.controlId,
    );
    appendOwnArrayValue(copy, {
      controlId: attempt.controlId,
      runId: attempt.runId,
      candidateEngaged: false,
      alternativeEngaged: true,
      reasonCodes: copyReasonCodes(attempt.reasonCodes, index),
      liveEvidence: attempt.liveEvidence,
    });
  }
  return copy;
}

function sourcePayload(input, attempt, cell, sideIds, owners) {
  return {
    version: sourceVersion,
    matrixId: input.matrixId,
    cellId: cell.cellId,
    pairId: input.pairId,
    runId: attempt.runId,
    sideIds,
    controlId: attempt.controlId,
    state: BENCHMARK_RESOURCE_CELL_STATE.NON_MEASURING,
    candidateEngaged: attempt.candidateEngaged,
    alternativeEngaged: attempt.alternativeEngaged,
    reasonCodes: attempt.reasonCodes,
    liveEvidence: attempt.liveEvidence,
    calibrationDigest: input.calibrationArtifact.digest,
    workloadManifestDigest: owners.workloadManifest.digest,
    alternativeTopologyDigest: owners.alternativeTopology.digest,
    preregistrationDigest: owners.preregistration.digest,
  };
}

function rootReceipt(artifacts, root) {
  return {
    rootDigest: root.digest,
    resolver: createBenchmarkResourceMemoryResolver([...artifacts, root]),
  };
}

export function createComparativeNegativeControlEvidence(input) {
  assertBenchmarkResourceExactRecord(input, inputKeys, localText.INPUT);
  const textFields = [
    'matrixId',
    'pairId',
    'sourceRevision',
    'producedAt',
    'validUntil',
    'inventoryId',
  ];
  for (let index = 0; index < textFields.length; index += 1) {
    const field = textFields[index];
    assertBenchmarkResourceText(input[field], `negativeControls.${field}`);
  }
  const sideIds = copySideIds(input.sideIds);
  const attempts = copyAttempts(input.attempts);
  const calibrationInspection =
    inspectBenchmarkResourceLiveCalibrationArtifact(
      input.calibrationArtifact.artifact,
    );
  if (
    !calibrationInspection.valid ||
    input.calibrationArtifact.artifact.payload.sourceRevision !==
      input.sourceRevision
  ) {
    fail(localText.CALIBRATION_INVALID);
  }
  const workloadManifest = createBenchmarkResourceSourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.WORKLOAD_MANIFEST,
    input.workloadManifest,
  );
  const alternativeTopology = createBenchmarkResourceSourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.ALTERNATIVE_TOPOLOGY,
    input.alternativeTopology,
  );
  const preregistration = createBenchmarkResourceSourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.PREREGISTRATION,
    input.preregistration,
  );
  const matrix = createBenchmarkResourceMatrixManifest({
    matrixId: input.matrixId,
    axes: [{
      id: localText.AXIS_CONTROL,
      values: COMPARATIVE_NEGATIVE_CONTROL_IDS,
    }],
    sideIds,
    workloadManifestDigest: workloadManifest.digest,
    alternativeTopologyDigest: alternativeTopology.digest,
    preregistrationDigest: preregistration.digest,
  });
  const sourceOwners = {
    workload: workloadManifest.artifact,
    topology: alternativeTopology.artifact,
    preregistration: preregistration.artifact,
  };
  assertComparativeNegativeControlOwners(sourceOwners, matrix.artifact);
  const inventory = createBenchmarkResourceComponentInventory({
    inventoryId: input.inventoryId,
    matrixId: input.matrixId,
    sides: input.inventorySides,
  });
  const price = createBenchmarkResourcePriceSheet(input.priceSheet);
  const engagements = [];
  const cells = [];
  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    const matrixCell = matrix.artifact.payload.cells[index];
    const engagement = createBenchmarkResourceSourceArtifact(
      BENCHMARK_RESOURCE_ARTIFACT_KIND.LIVE_ENGAGEMENT,
      sourcePayload(input, attempt, matrixCell, sideIds, {
        workloadManifest,
        alternativeTopology,
        preregistration,
      }),
      [
        input.calibrationArtifact.digest,
        workloadManifest.digest,
        alternativeTopology.digest,
        preregistration.digest,
      ],
    );
    appendOwnArrayValue(engagements, engagement);
    appendOwnArrayValue(
      cells,
      createBenchmarkResourceNonMeasuringCellEvidence({
        matrixManifestDigest: matrix.digest,
        matrixId: input.matrixId,
        cellId: matrixCell.cellId,
        pairId: input.pairId,
        runId: attempt.runId,
        sideIds,
        reasonCodes: attempt.reasonCodes,
        sourceDigests: [engagement.digest],
        sourceRevision: input.sourceRevision,
        producedAt: input.producedAt,
        validUntil: input.validUntil,
      }),
    );
  }
  const artifacts = [
    workloadManifest,
    alternativeTopology,
    preregistration,
    matrix,
    inventory,
    price,
    input.calibrationArtifact,
    ...engagements,
    ...cells,
  ];
  const root = createBenchmarkResourceEvidenceRoot({
    matrixManifestDigest: matrix.digest,
    componentInventoryDigest: inventory.digest,
    priceSheetDigest: price.digest,
    cellEvidenceDigests: cells.map((cell) => cell.digest),
    sourceRevision: input.sourceRevision,
    producedAt: input.producedAt,
    validUntil: input.validUntil,
    artifacts,
  });
  return {
    receipt: rootReceipt(artifacts, root),
    root,
    artifacts,
    matrix,
    inventory,
    price,
    calibration: input.calibrationArtifact,
    engagements,
    cells,
  };
}

function resolveArtifact(resolved, digest) {
  const bytes = mapGet(resolved, digest);
  if (bytes === undefined) fail(localText.CELL_SOURCE_MISMATCH);
  return parseBenchmarkResourceArtifact(bytes, digest);
}

function captureValidatedArtifacts(receipt) {
  assertBenchmarkResourceExactRecord(
    receipt,
    receiptKeys,
    localText.ROOT_INVALID,
  );
  const rootDigest = ownDataValue(receipt, 'rootDigest', localText.ROOT_INVALID);
  const resolver = ownDataValue(receipt, 'resolver', localText.ROOT_INVALID);
  assertBenchmarkResourceExactRecord(
    resolver,
    resolverKeys,
    localText.ROOT_INVALID,
  );
  const resolve = ownDataValue(resolver, 'resolve', localText.ROOT_INVALID);
  if (typeof resolve !== 'function') fail(localText.ROOT_INVALID);
  const resolved = new Map();
  const capturedResolver = {
    resolve(digest) {
      if (mapHas(resolved, digest)) return bufferFrom(mapGet(resolved, digest));
      const bytes = reflectApply(resolve, resolver, [digest]);
      if (bytes !== undefined) {
        assertBenchmarkResourceBytes(bytes, localText.ROOT_INVALID);
        mapSet(resolved, digest, bufferFrom(bytes));
      }
      return bytes;
    },
  };
  const validation = validateBenchmarkResourceEvidenceRoot({
    rootDigest,
    resolver: capturedResolver,
  });
  if (!validation.valid) {
    fail(`${localText.ROOT_INVALID}:${validation.reason}`);
  }
  return {rootDigest, resolved};
}

function inspectMatrix(matrix) {
  const axes = matrix.payload.axes;
  if (
    axes.length !== 1 ||
    axes[0].id !== localText.AXIS_CONTROL ||
    !exactValues(axes[0].values, COMPARATIVE_NEGATIVE_CONTROL_IDS)
  ) {
    fail(localText.MATRIX_SHAPE_MISMATCH);
  }
}

function assertCellShape(cell, matrixCell) {
  if (
    cell.payload.state !== BENCHMARK_RESOURCE_CELL_STATE.NON_MEASURING ||
    cell.payload.cellId !== matrixCell.cellId ||
    cell.payload.sourceDigests.length !== 1 ||
    !arrayContains(
      cell.payload.reasonCodes,
      COMPARATIVE_NEGATIVE_CONTROL_REASON,
    )
  ) {
    fail(localText.CELL_SHAPE_MISMATCH);
  }
}

function inspectCellSource(
  resolved,
  cell,
  matrixCell,
  matrix,
  root,
  owners,
  index,
) {
  assertCellShape(cell, matrixCell);
  const source = resolveArtifact(resolved, cell.payload.sourceDigests[0]);
  if (source.kind !== BENCHMARK_RESOURCE_ARTIFACT_KIND.LIVE_ENGAGEMENT) {
    fail(localText.CELL_SOURCE_MISMATCH);
  }
  assertBenchmarkResourceExactRecord(
    source.payload,
    sourcePayloadKeys,
    localText.CELL_SOURCE_MISMATCH,
  );
  const calibration = resolveArtifact(
    resolved,
    source.payload.calibrationDigest,
  );
  assertComparativeNegativeControlSource({
    source,
    cell,
    matrixCell,
    matrix,
    root,
    owners,
    calibration,
    index,
  });
}

export function inspectComparativeNegativeControlEvidence(receipt) {
  try {
    const capture = captureValidatedArtifacts(receipt);
    const root = resolveArtifact(capture.resolved, capture.rootDigest);
    const matrix = resolveArtifact(
      capture.resolved,
      root.payload.matrixManifestDigest,
    );
    inspectMatrix(matrix);
    const owners = {
      workload: resolveArtifact(
        capture.resolved,
        matrix.payload.workloadManifestDigest,
      ),
      topology: resolveArtifact(
        capture.resolved,
        matrix.payload.alternativeTopologyDigest,
      ),
      preregistration: resolveArtifact(
        capture.resolved,
        matrix.payload.preregistrationDigest,
      ),
    };
    assertComparativeNegativeControlOwners(owners, matrix);
    for (let index = 0;
      index < root.payload.cellEvidenceDigests.length;
      index += 1) {
      const cell = resolveArtifact(
        capture.resolved,
        root.payload.cellEvidenceDigests[index],
      );
      inspectCellSource(
        capture.resolved,
        cell,
        matrix.payload.cells[index],
        matrix,
        root,
        owners,
        index,
      );
    }
    if (
      root.payload.cellEvidenceDigests.length !==
        COMPARATIVE_NEGATIVE_CONTROL_IDS.length
    ) {
      fail(localText.CELL_SHAPE_MISMATCH);
    }
    return {
      valid: true,
      reason: localText.VALID,
      complete: true,
      claimEligible: false,
      measuringCellCount: 0,
      nonMeasuringCellCount: COMPARATIVE_NEGATIVE_CONTROL_IDS.length,
      matrixId: matrix.payload.matrixId,
      matrixDigest: root.payload.matrixManifestDigest,
      rootDigest: capture.rootDigest,
    };
  } catch (error) {
    return {
      valid: false,
      reason: safeErrorMessage(error),
      complete: false,
      claimEligible: false,
      measuringCellCount: 0,
      nonMeasuringCellCount: 0,
      matrixId: null,
      matrixDigest: null,
      rootDigest: null,
    };
  }
}

export function comparativeNegativeControlEvidenceDigest(evidence) {
  if (!objectHasOwn(evidence, localText.ROOT)) fail(localText.ROOT_INVALID);
  return digestBenchmarkSemanticData(evidence.root.artifact.payload);
}
