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
const maximumReasonCodes = 16;
const dataValueKey = 'value';
const bufferFrom = Buffer.from;
const mapGet = Function.call.bind(Map.prototype.get);
const mapHas = Function.call.bind(Map.prototype.has);
const mapSet = Function.call.bind(Map.prototype.set);
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const reflectApply = Reflect.apply;
const localText = Object.freeze({
  ALTERNATIVE_ENGAGEMENT_REQUIRED:
    'attempt:alternative_must_be_engaged',
  ATTEMPTS: 'attempts',
  ATTEMPTS_EXACT_MATRIX_REQUIRED: 'attempts:exact_matrix_required',
  ATTEMPTS_ORDER_MISMATCH: 'attempts:matrix_cell_order_mismatch',
  CALIBRATION_INVALID: 'calibration:external_observation_required',
  CANDIDATE_ABSENCE_REASON_REQUIRED:
    'attempt:candidate_absence_reason_required',
  CANDIDATE_MUST_BE_ABSENT: 'attempt:candidate_must_be_absent',
  CELL_SHAPE_MISMATCH: 'cells:explicit_non_measuring_required',
  CELL_SOURCE_MISMATCH: 'cells:live_attempt_source_mismatch',
  MATRIX_SHAPE_MISMATCH: 'matrix:exact_cartesian_axes_required',
  ROOT: 'root',
  ROOT_INVALID: 'root:invalid',
  SIDE_IDS: 'sideIds',
  SIDE_IDS_INVALID: 'sideIds:distinct_exact_pair_required',
  VALID: 'valid',
});

function text(config, suffix) {
  return `${config.pathPrefix}.${suffix}`;
}

function arrayContains(values, expected) {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === expected) return true;
  }
  return false;
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

export function assembleComparativePostgresNonMeasuringEvidence({
  input,
  attempts,
  sideIds,
  matrix,
  workloadManifest,
  alternativeTopology,
  preregistration,
  sourcePayloadForAttempt,
}) {
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
      sourcePayloadForAttempt(attempt, matrixCell),
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
  const cellEvidenceDigests = [];
  for (let index = 0; index < engagements.length; index += 1) {
    appendOwnArrayValue(artifacts, engagements[index]);
  }
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

export function createComparativePostgresNonMeasuringEvidenceOwner(config) {
  function fail(message) {
    throw new TypeError(message);
  }

  function ownDataValue(value, key, path) {
    const descriptor = objectGetOwnPropertyDescriptor(value, key);
    if (!descriptor || !objectHasOwn(descriptor, dataValueKey)) {
      fail(`${path}:own_data_property_required`);
    }
    return descriptor.value;
  }

  function rootInvalid() {
    return text(config, localText.ROOT_INVALID);
  }

  function safeErrorMessage(error) {
    if (!error || typeof error !== 'object' || types.isProxy(error)) {
      return rootInvalid();
    }
    const descriptor = objectGetOwnPropertyDescriptor(error, 'message');
    if (
      descriptor &&
      objectHasOwn(descriptor, dataValueKey) &&
      typeof descriptor.value === 'string'
    ) {
      return descriptor.value;
    }
    return rootInvalid();
  }

  function copySideIds(sideIds) {
    assertBenchmarkResourceArray(
      sideIds,
      text(config, localText.SIDE_IDS),
      2,
    );
    if (sideIds.length !== 2 || sideIds[0] === sideIds[1]) {
      fail(text(config, localText.SIDE_IDS_INVALID));
    }
    const copy = [];
    for (let index = 0; index < sideIds.length; index += 1) {
      assertBenchmarkResourceText(
        sideIds[index],
        text(config, `sideIds.${index}`),
      );
      appendOwnArrayValue(copy, sideIds[index]);
    }
    return copy;
  }

  function copyReasonCodes(reasonCodes, index) {
    const path = text(config, `attempts.${index}.reasonCodes`);
    assertBenchmarkResourceArray(reasonCodes, path, maximumReasonCodes);
    if (
      reasonCodes.length === 0 ||
      !arrayContains(reasonCodes, config.reason)
    ) {
      fail(text(config, localText.CANDIDATE_ABSENCE_REASON_REQUIRED));
    }
    const copy = [];
    for (let reasonIndex = 0;
      reasonIndex < reasonCodes.length;
      reasonIndex += 1) {
      assertBenchmarkResourceText(
        reasonCodes[reasonIndex],
        `${path}.${reasonIndex}`,
      );
      appendOwnArrayValue(copy, reasonCodes[reasonIndex]);
    }
    return copy;
  }

  function copyAttempts(attempts) {
    assertBenchmarkResourceArray(
      attempts,
      text(config, localText.ATTEMPTS),
      config.cells.length,
    );
    if (attempts.length !== config.cells.length) {
      fail(text(config, localText.ATTEMPTS_EXACT_MATRIX_REQUIRED));
    }
    const copy = [];
    for (let index = 0; index < attempts.length; index += 1) {
      const path = text(config, `attempts.${index}`);
      const attempt = attempts[index];
      assertBenchmarkResourceExactRecord(attempt, attemptKeys, path);
      if (attempt.matrixCellIndex !== index) {
        fail(text(config, localText.ATTEMPTS_ORDER_MISMATCH));
      }
      assertBenchmarkResourceText(attempt.runId, `${path}.runId`);
      if (attempt.candidateEngaged !== false) {
        fail(text(config, localText.CANDIDATE_MUST_BE_ABSENT));
      }
      if (attempt.alternativeEngaged !== true) {
        fail(text(config, localText.ALTERNATIVE_ENGAGEMENT_REQUIRED));
      }
      assertBenchmarkResourceCanonicalData(attempt.liveEvidence);
      config.admission.assertLiveEvidence(attempt.liveEvidence, index);
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
      version: config.sourceVersion,
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

  function createEvidence(input) {
    assertBenchmarkResourceExactRecord(input, inputKeys, config.pathPrefix);
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
      assertBenchmarkResourceText(input[field], text(config, field));
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
      fail(text(config, localText.CALIBRATION_INVALID));
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
      axes: config.axes,
      sideIds,
      workloadManifestDigest: workloadManifest.digest,
      alternativeTopologyDigest: alternativeTopology.digest,
      preregistrationDigest: preregistration.digest,
      profileEnvelopeDigest: null,
    });
    config.admission.assertOwners({
      workload: workloadManifest.artifact,
      topology: alternativeTopology.artifact,
      preregistration: preregistration.artifact,
    }, matrix.artifact);
    return assembleComparativePostgresNonMeasuringEvidence({
      input,
      attempts,
      sideIds,
      matrix,
      workloadManifest,
      alternativeTopology,
      preregistration,
      sourcePayloadForAttempt(attempt, matrixCell) {
        return sourcePayload(input, attempt, matrixCell, sideIds, {
          workloadManifest,
          alternativeTopology,
          preregistration,
        });
      },
    });
  }

  function resolveArtifact(resolved, digest) {
    const bytes = mapGet(resolved, digest);
    if (bytes === undefined) {
      fail(text(config, localText.CELL_SOURCE_MISMATCH));
    }
    return parseBenchmarkResourceArtifact(bytes, digest);
  }

  function captureValidatedArtifacts(receipt) {
    assertBenchmarkResourceExactRecord(receipt, receiptKeys, rootInvalid());
    const rootDigest = ownDataValue(receipt, 'rootDigest', rootInvalid());
    const resolver = ownDataValue(receipt, 'resolver', rootInvalid());
    assertBenchmarkResourceExactRecord(resolver, resolverKeys, rootInvalid());
    const resolve = ownDataValue(resolver, 'resolve', rootInvalid());
    if (typeof resolve !== 'function') fail(rootInvalid());
    const resolved = new Map();
    const capturedResolver = {
      resolve(digest) {
        if (mapHas(resolved, digest)) {
          return bufferFrom(mapGet(resolved, digest));
        }
        const bytes = reflectApply(resolve, resolver, [digest]);
        if (bytes !== undefined) {
          assertBenchmarkResourceBytes(bytes, rootInvalid());
          mapSet(resolved, digest, bufferFrom(bytes));
        }
        return bytes;
      },
    };
    const validation = validateBenchmarkResourceEvidenceRoot({
      rootDigest,
      resolver: capturedResolver,
    });
    if (!validation.valid) fail(`${rootInvalid()}:${validation.reason}`);
    return {rootDigest, resolved};
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
    if (
      cell.payload.state !== BENCHMARK_RESOURCE_CELL_STATE.NON_MEASURING ||
      cell.payload.cellId !== matrixCell.cellId ||
      cell.payload.sourceDigests.length !== 1 ||
      !arrayContains(cell.payload.reasonCodes, config.reason)
    ) {
      fail(text(config, localText.CELL_SHAPE_MISMATCH));
    }
    const source = resolveArtifact(resolved, cell.payload.sourceDigests[0]);
    if (source.kind !== BENCHMARK_RESOURCE_ARTIFACT_KIND.LIVE_ENGAGEMENT) {
      fail(text(config, localText.CELL_SOURCE_MISMATCH));
    }
    assertBenchmarkResourceExactRecord(
      source.payload,
      sourcePayloadKeys,
      text(config, localText.CELL_SOURCE_MISMATCH),
    );
    const calibration = resolveArtifact(
      resolved,
      source.payload.calibrationDigest,
    );
    config.admission.assertSource({
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

  function emptyInspection(reason) {
    return {
      valid: false,
      reason,
      complete: false,
      claimEligible: false,
      claimDisposition: null,
      measuringCellCount: 0,
      nonMeasuringCellCount: 0,
      alternativeOraclePassCount: 0,
      [config.witnessCountField]: 0,
      matrixId: null,
      matrixDigest: null,
      rootDigest: null,
    };
  }

  function inspectEvidence(receipt) {
    try {
      const capture = captureValidatedArtifacts(receipt);
      const root = resolveArtifact(capture.resolved, capture.rootDigest);
      const matrix = resolveArtifact(
        capture.resolved,
        root.payload.matrixManifestDigest,
      );
      if (
        digestBenchmarkSemanticData(matrix.payload.axes) !==
          digestBenchmarkSemanticData(config.axes) ||
        matrix.payload.cells.length !== config.cells.length
      ) {
        fail(text(config, localText.MATRIX_SHAPE_MISMATCH));
      }
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
      config.admission.assertOwners(owners, matrix);
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
      if (root.payload.cellEvidenceDigests.length !== config.cells.length) {
        fail(text(config, localText.CELL_SHAPE_MISMATCH));
      }
      return {
        valid: true,
        reason: localText.VALID,
        complete: true,
        claimEligible: false,
        claimDisposition: config.disposition,
        measuringCellCount: 0,
        nonMeasuringCellCount: config.cells.length,
        alternativeOraclePassCount: config.cells.length,
        [config.witnessCountField]: config.cells.length,
        matrixId: matrix.payload.matrixId,
        matrixDigest: root.payload.matrixManifestDigest,
        rootDigest: capture.rootDigest,
      };
    } catch (error) {
      return emptyInspection(safeErrorMessage(error));
    }
  }

  function evidenceDigest(evidence) {
    if (!objectHasOwn(evidence, localText.ROOT)) fail(rootInvalid());
    return digestBenchmarkSemanticData(evidence.root.artifact.payload);
  }

  return objectFreeze({createEvidence, inspectEvidence, evidenceDigest});
}
