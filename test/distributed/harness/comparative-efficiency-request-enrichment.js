import {types} from 'node:util';
import {
  appendOwnArrayValue,
  digestBenchmarkSemanticData,
} from './benchmark-semantic-integrity.js';
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
  assertComparativeRequestEnrichmentLiveEvidence,
  assertComparativeRequestEnrichmentOwners,
  assertComparativeRequestEnrichmentSource,
} from './comparative-efficiency-request-enrichment-admission.js';
import {
  COMPARATIVE_REQUEST_ENRICHMENT_AXES,
  COMPARATIVE_REQUEST_ENRICHMENT_CELLS,
  COMPARATIVE_REQUEST_ENRICHMENT_DISPOSITION,
  COMPARATIVE_REQUEST_ENRICHMENT_REASON,
} from './comparative-efficiency-request-enrichment-constants.js';
export {
  COMPARATIVE_REQUEST_ENRICHMENT_AFFINITY_OWNER_IDS,
  COMPARATIVE_REQUEST_ENRICHMENT_AXES,
  COMPARATIVE_REQUEST_ENRICHMENT_CELLS,
  COMPARATIVE_REQUEST_ENRICHMENT_ORACLE,
  COMPARATIVE_REQUEST_ENRICHMENT_REASON,
  COMPARATIVE_REQUEST_ENRICHMENT_SCENARIO,
  comparativeRequestEnrichmentExpectedResult,
  comparativeRequestEnrichmentSql,
} from './comparative-efficiency-request-enrichment-constants.js';

const localText = Object.freeze({
  INPUT: 'requestEnrichment',
  ATTEMPTS: 'requestEnrichment.attempts',
  ATTEMPTS_EXACT_MATRIX_REQUIRED:
    'requestEnrichment.attempts:exact_matrix_required',
  ATTEMPT_ORDER_MISMATCH:
    'requestEnrichment.attempts:matrix_cell_order_mismatch',
  ATTEMPT_CANDIDATE_MUST_BE_ABSENT:
    'requestEnrichment.attempt:candidate_must_be_absent',
  ATTEMPT_ALTERNATIVE_MUST_BE_ENGAGED:
    'requestEnrichment.attempt:alternative_must_be_engaged',
  ATTEMPT_REASON_REQUIRED:
    'requestEnrichment.attempt:candidate_absence_reason_required',
  CALIBRATION_INVALID:
    'requestEnrichment.calibration:external_observation_required',
  MATRIX_SHAPE_MISMATCH:
    'requestEnrichment.matrix:exact_cartesian_axes_required',
  CELL_SHAPE_MISMATCH:
    'requestEnrichment.cells:explicit_non_measuring_required',
  CELL_SOURCE_MISMATCH:
    'requestEnrichment.cells:live_attempt_source_mismatch',
  ROOT_INVALID: 'requestEnrichment.root:invalid',
  SIDE_IDS: 'requestEnrichment.sideIds',
  SIDE_IDS_DISTINCT_EXACT_PAIR_REQUIRED:
    'requestEnrichment.sideIds:distinct_exact_pair_required',
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
  'matrixCellIndex',
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
  'matrixCellIndex',
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
const sourceVersion = 'comparative-request-enrichment-live-attempt-v1';
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
      `requestEnrichment.sideIds.${index}`,
    );
    appendOwnArrayValue(copy, sideIds[index]);
  }
  return copy;
}

function copyReasonCodes(reasonCodes, index) {
  assertBenchmarkResourceArray(
    reasonCodes,
    `requestEnrichment.attempts.${index}.reasonCodes`,
    maximumReasonCodes,
  );
  if (
    reasonCodes.length === 0 ||
    !arrayContains(reasonCodes, COMPARATIVE_REQUEST_ENRICHMENT_REASON)
  ) {
    fail(localText.ATTEMPT_REASON_REQUIRED);
  }
  const copy = [];
  for (let reasonIndex = 0;
    reasonIndex < reasonCodes.length;
    reasonIndex += 1) {
    assertBenchmarkResourceText(
      reasonCodes[reasonIndex],
      `requestEnrichment.attempts.${index}.reasonCodes.${reasonIndex}`,
    );
    appendOwnArrayValue(copy, reasonCodes[reasonIndex]);
  }
  return copy;
}

function copyAttempts(attempts) {
  assertBenchmarkResourceArray(
    attempts,
    localText.ATTEMPTS,
    COMPARATIVE_REQUEST_ENRICHMENT_CELLS.length,
  );
  if (attempts.length !== COMPARATIVE_REQUEST_ENRICHMENT_CELLS.length) {
    fail(localText.ATTEMPTS_EXACT_MATRIX_REQUIRED);
  }
  const copy = [];
  for (let index = 0; index < attempts.length; index += 1) {
    const path = `requestEnrichment.attempts.${index}`;
    const attempt = attempts[index];
    assertBenchmarkResourceExactRecord(attempt, attemptKeys, path);
    if (attempt.matrixCellIndex !== index) {
      fail(localText.ATTEMPT_ORDER_MISMATCH);
    }
    assertBenchmarkResourceText(attempt.runId, `${path}.runId`);
    if (attempt.candidateEngaged !== false) {
      fail(localText.ATTEMPT_CANDIDATE_MUST_BE_ABSENT);
    }
    if (attempt.alternativeEngaged !== true) {
      fail(localText.ATTEMPT_ALTERNATIVE_MUST_BE_ENGAGED);
    }
    assertBenchmarkResourceCanonicalData(attempt.liveEvidence);
    assertComparativeRequestEnrichmentLiveEvidence(
      attempt.liveEvidence,
      index,
    );
    appendOwnArrayValue(copy, {
      matrixCellIndex: index,
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
    matrixCellIndex: attempt.matrixCellIndex,
    state: BENCHMARK_RESOURCE_CELL_STATE.NON_MEASURING,
    candidateEngaged: false,
    alternativeEngaged: true,
    reasonCodes: attempt.reasonCodes,
    liveEvidence: attempt.liveEvidence,
    calibrationDigest: input.calibrationArtifact.digest,
    workloadManifestDigest: owners.workloadManifest.digest,
    alternativeTopologyDigest: owners.alternativeTopology.digest,
    preregistrationDigest: owners.preregistration.digest,
  };
}

function rootReceipt(artifacts, root) {
  const resolvedArtifacts = [];
  for (let index = 0; index < artifacts.length; index += 1) {
    appendOwnArrayValue(resolvedArtifacts, artifacts[index]);
  }
  appendOwnArrayValue(resolvedArtifacts, root);
  return {
    rootDigest: root.digest,
    resolver: createBenchmarkResourceMemoryResolver(resolvedArtifacts),
  };
}

export function createComparativeRequestEnrichmentEvidence(input) {
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
    assertBenchmarkResourceText(input[field], `requestEnrichment.${field}`);
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
    axes: COMPARATIVE_REQUEST_ENRICHMENT_AXES,
    sideIds,
    workloadManifestDigest: workloadManifest.digest,
    alternativeTopologyDigest: alternativeTopology.digest,
    preregistrationDigest: preregistration.digest,
  });
  assertComparativeRequestEnrichmentOwners({
    workload: workloadManifest.artifact,
    topology: alternativeTopology.artifact,
    preregistration: preregistration.artifact,
  }, matrix.artifact);
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
  ];
  for (let index = 0; index < engagements.length; index += 1) {
    appendOwnArrayValue(artifacts, engagements[index]);
  }
  const cellEvidenceDigests = [];
  for (let index = 0; index < cells.length; index += 1) {
    appendOwnArrayValue(artifacts, cells[index]);
    appendOwnArrayValue(cellEvidenceDigests, cells[index].digest);
  }
  const root = createBenchmarkResourceEvidenceRoot({
    matrixManifestDigest: matrix.digest,
    componentInventoryDigest: inventory.digest,
    priceSheetDigest: price.digest,
    cellEvidenceDigests,
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
  if (
    digestBenchmarkSemanticData(matrix.payload.axes) !==
      digestBenchmarkSemanticData(COMPARATIVE_REQUEST_ENRICHMENT_AXES) ||
    matrix.payload.cells.length !==
      COMPARATIVE_REQUEST_ENRICHMENT_CELLS.length
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
      COMPARATIVE_REQUEST_ENRICHMENT_REASON,
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
  assertComparativeRequestEnrichmentSource({
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

export function inspectComparativeRequestEnrichmentEvidence(receipt) {
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
    assertComparativeRequestEnrichmentOwners(owners, matrix);
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
        COMPARATIVE_REQUEST_ENRICHMENT_CELLS.length
    ) {
      fail(localText.CELL_SHAPE_MISMATCH);
    }
    return {
      valid: true,
      reason: localText.VALID,
      complete: true,
      claimEligible: false,
      claimDisposition: COMPARATIVE_REQUEST_ENRICHMENT_DISPOSITION,
      measuringCellCount: 0,
      nonMeasuringCellCount: COMPARATIVE_REQUEST_ENRICHMENT_CELLS.length,
      alternativeOraclePassCount:
        COMPARATIVE_REQUEST_ENRICHMENT_CELLS.length,
      affinityOwnerWitnessCount:
        COMPARATIVE_REQUEST_ENRICHMENT_CELLS.length,
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
      claimDisposition: null,
      measuringCellCount: 0,
      nonMeasuringCellCount: 0,
      alternativeOraclePassCount: 0,
      affinityOwnerWitnessCount: 0,
      matrixId: null,
      matrixDigest: null,
      rootDigest: null,
    };
  }
}

export function comparativeRequestEnrichmentEvidenceDigest(evidence) {
  if (!objectHasOwn(evidence, localText.ROOT)) fail(localText.ROOT_INVALID);
  return digestBenchmarkSemanticData(evidence.root.artifact.payload);
}
