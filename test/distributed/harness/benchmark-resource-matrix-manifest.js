import {
  appendOwnArrayValue,
  digestBenchmarkSemanticData,
} from './benchmark-semantic-integrity.js';
import {
  assertBenchmarkResourceArray,
  assertBenchmarkResourceDigest,
  assertBenchmarkResourceExactRecord,
  assertBenchmarkResourceText,
  createBenchmarkResourceArtifact,
} from './benchmark-resource-evidence-data.js';
import {
  BENCHMARK_RESOURCE_ARTIFACT_KIND,
  BENCHMARK_RESOURCE_CONTRACT,
  BENCHMARK_RESOURCE_LIMIT,
} from './benchmark-resource-contract-constants.js';
const localText = Object.freeze({
  MATRIX_AXES: 'matrix.axes',
  MATRIX_AXES_NON_EMPTY_REQUIRED: 'matrix.axes:non_empty_required',
  MATRIX_AXES_ID_DUPLICATE: 'matrix.axes:id_duplicate',
  MATRIX_CELLS_LIMIT: 'matrix.cells:limit',
  MATRIX_CELLS_ENUMERATION_FAILED: 'matrix.cells:enumeration_failed',
  MATRIX: 'matrix',
  MATRIX_MATRIX_ID: 'matrix.matrixId',
  MATRIX_SIDE_IDS_EXACT_PAIR_REQUIRED: 'matrix.sideIds:exact_pair_required',
  MATRIX_ARTIFACT_KIND: 'matrix_artifact:kind',
  MATRIX_PAYLOAD: 'matrix.payload',
  MATRIX_VERSION_UNSUPPORTED: 'matrix.version:unsupported',
  MATRIX_RECONSTRUCTION_MISMATCH: 'matrix:reconstruction_mismatch',
  MATRIX_CELLS: 'matrix.cells',
  MATRIX_CELLS_COUNT_MISMATCH: 'matrix.cells:count_mismatch',
  MATRIX_CELLS_CARTESIAN_MISMATCH: 'matrix.cells:cartesian_mismatch',
  MATRIX_PROFILE_ENVELOPE_DIGEST: 'matrix.profileEnvelopeDigest',
  VALID: 'valid',
});


const inputKeys = Object.freeze([
  'matrixId',
  'axes',
  'sideIds',
  'workloadManifestDigest',
  'alternativeTopologyDigest',
  'preregistrationDigest',
  'profileEnvelopeDigest',
]);
const axisKeys = Object.freeze(['id', 'values']);
const cellKeys = Object.freeze(['cellId', 'dimensions']);
const payloadKeys = Object.freeze([
  'version',
  'matrixId',
  'axes',
  'sideIds',
  'workloadManifestDigest',
  'alternativeTopologyDigest',
  'preregistrationDigest',
  'profileEnvelopeDigest',
  'cells',
]);
const setAdd = Function.call.bind(Set.prototype.add);
const setHas = Function.call.bind(Set.prototype.has);

function fail(message) {
  throw new TypeError(message);
}

function copyUniqueTextArray(values, path, maximumLength) {
  assertBenchmarkResourceArray(values, path, maximumLength);
  if (values.length === 0) fail(`${path}:non_empty_required`);
  const seen = new Set();
  const copy = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    assertBenchmarkResourceText(value, `${path}.${index}`);
    if (setHas(seen, value)) fail(`${path}:duplicate`);
    setAdd(seen, value);
    appendOwnArrayValue(copy, value);
  }
  return copy;
}

function copyAxes(axes) {
  assertBenchmarkResourceArray(
    axes,
    localText.MATRIX_AXES,
    BENCHMARK_RESOURCE_LIMIT.AXES,
  );
  if (axes.length === 0) fail(localText.MATRIX_AXES_NON_EMPTY_REQUIRED);
  const ids = new Set();
  const copy = [];
  for (let index = 0; index < axes.length; index += 1) {
    const axis = axes[index];
    assertBenchmarkResourceExactRecord(
      axis,
      axisKeys,
      `matrix.axes.${index}`,
    );
    assertBenchmarkResourceText(axis.id, `matrix.axes.${index}.id`);
    if (setHas(ids, axis.id)) fail(localText.MATRIX_AXES_ID_DUPLICATE);
    setAdd(ids, axis.id);
    appendOwnArrayValue(copy, {
      id: axis.id,
      values: copyUniqueTextArray(
        axis.values,
        `matrix.axes.${index}.values`,
        BENCHMARK_RESOURCE_LIMIT.AXIS_VALUES,
      ),
    });
  }
  return copy;
}

function expectedCellCount(axes) {
  let count = 1;
  for (let index = 0; index < axes.length; index += 1) {
    count *= axes[index].values.length;
    if (count > BENCHMARK_RESOURCE_LIMIT.CELLS) {
      fail(localText.MATRIX_CELLS_LIMIT);
    }
  }
  return count;
}

function dimensionRecord(axes, indexes) {
  const dimensions = {};
  for (let index = 0; index < axes.length; index += 1) {
    dimensions[axes[index].id] = axes[index].values[indexes[index]];
  }
  return dimensions;
}

function nextIndexes(axes, indexes) {
  for (let index = indexes.length - 1; index >= 0; index -= 1) {
    indexes[index] += 1;
    if (indexes[index] < axes[index].values.length) return true;
    indexes[index] = 0;
  }
  return false;
}

function buildCells(matrixId, axes) {
  const count = expectedCellCount(axes);
  const indexes = [];
  for (let index = 0; index < axes.length; index += 1) {
    appendOwnArrayValue(indexes, 0);
  }
  const cells = [];
  for (let cellIndex = 0; cellIndex < count; cellIndex += 1) {
    const dimensions = dimensionRecord(axes, indexes);
    appendOwnArrayValue(cells, {
      cellId: digestBenchmarkSemanticData({matrixId, dimensions}),
      dimensions,
    });
    if (cellIndex + 1 < count && !nextIndexes(axes, indexes)) {
      fail(localText.MATRIX_CELLS_ENUMERATION_FAILED);
    }
  }
  return cells;
}

export function createBenchmarkResourceMatrixManifest(input) {
  assertBenchmarkResourceExactRecord(input, inputKeys, localText.MATRIX);
  assertBenchmarkResourceText(input.matrixId, localText.MATRIX_MATRIX_ID);
  const axes = copyAxes(input.axes);
  const sideIds = copyUniqueTextArray(input.sideIds, 'matrix.sideIds', 2);
  if (sideIds.length !== 2) fail(localText.MATRIX_SIDE_IDS_EXACT_PAIR_REQUIRED);
  const digestFields = [
    'workloadManifestDigest',
    'alternativeTopologyDigest',
    'preregistrationDigest',
  ];
  for (let index = 0; index < digestFields.length; index += 1) {
    const field = digestFields[index];
    assertBenchmarkResourceDigest(input[field], `matrix.${field}`);
  }
  if (input.profileEnvelopeDigest !== null) {
    assertBenchmarkResourceDigest(
      input.profileEnvelopeDigest,
      localText.MATRIX_PROFILE_ENVELOPE_DIGEST,
    );
  }
  const references = [
    input.workloadManifestDigest,
    input.alternativeTopologyDigest,
    input.preregistrationDigest,
  ];
  if (input.profileEnvelopeDigest !== null) {
    appendOwnArrayValue(references, input.profileEnvelopeDigest);
  }
  return createBenchmarkResourceArtifact(
    BENCHMARK_RESOURCE_ARTIFACT_KIND.MATRIX_MANIFEST,
    {
      version: BENCHMARK_RESOURCE_CONTRACT.MATRIX_MANIFEST_VERSION,
      matrixId: input.matrixId,
      axes,
      sideIds,
      workloadManifestDigest: input.workloadManifestDigest,
      alternativeTopologyDigest: input.alternativeTopologyDigest,
      preregistrationDigest: input.preregistrationDigest,
      profileEnvelopeDigest: input.profileEnvelopeDigest,
      cells: buildCells(input.matrixId, axes),
    },
    references,
  );
}

export function inspectBenchmarkResourceMatrixManifestArtifact(artifact) {
  try {
    if (
      artifact.kind !== BENCHMARK_RESOURCE_ARTIFACT_KIND.MATRIX_MANIFEST
    ) {
      fail(localText.MATRIX_ARTIFACT_KIND);
    }
    const payload = artifact.payload;
    assertBenchmarkResourceExactRecord(payload, payloadKeys, localText.MATRIX_PAYLOAD);
    if (payload.version !== BENCHMARK_RESOURCE_CONTRACT.MATRIX_MANIFEST_VERSION) {
      fail(localText.MATRIX_VERSION_UNSUPPORTED);
    }
    const reconstructed = createBenchmarkResourceMatrixManifest({
      matrixId: payload.matrixId,
      axes: payload.axes,
      sideIds: payload.sideIds,
      workloadManifestDigest: payload.workloadManifestDigest,
      alternativeTopologyDigest: payload.alternativeTopologyDigest,
      preregistrationDigest: payload.preregistrationDigest,
      profileEnvelopeDigest: payload.profileEnvelopeDigest,
    });
    if (
      digestBenchmarkSemanticData(reconstructed.artifact) !==
        digestBenchmarkSemanticData(artifact)
    ) {
      fail(localText.MATRIX_RECONSTRUCTION_MISMATCH);
    }
    const expected = reconstructed.artifact.payload.cells;
    assertBenchmarkResourceArray(
      payload.cells,
      localText.MATRIX_CELLS,
      BENCHMARK_RESOURCE_LIMIT.CELLS,
    );
    if (payload.cells.length !== expected.length) {
      fail(localText.MATRIX_CELLS_COUNT_MISMATCH);
    }
    for (let index = 0; index < payload.cells.length; index += 1) {
      const cell = payload.cells[index];
      assertBenchmarkResourceExactRecord(
        cell,
        cellKeys,
        `matrix.cells.${index}`,
      );
      const expectedCell = expected[index];
      if (
        cell.cellId !== expectedCell.cellId ||
        digestBenchmarkSemanticData(cell.dimensions) !==
          digestBenchmarkSemanticData(expectedCell.dimensions)
      ) {
        fail(localText.MATRIX_CELLS_CARTESIAN_MISMATCH);
      }
    }
    return {valid: true, reason: localText.VALID};
  } catch (error) {
    return {valid: false, reason: error.message};
  }
}
