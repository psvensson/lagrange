import {
  digestBenchmarkSemanticData,
} from './benchmark-semantic-integrity.js';
import {
  assertBenchmarkResourceCanonicalData,
  assertBenchmarkResourceExactRecord,
  assertBenchmarkResourceText,
  createBenchmarkResourceArtifact,
} from './benchmark-resource-evidence-data.js';
import {
  BENCHMARK_RESOURCE_ARTIFACT_KIND,
} from './benchmark-resource-contract-constants.js';
const localText = Object.freeze({
  WINDOW_SOURCE_KIND_UNSUPPORTED: 'windowSource.kind:unsupported',
  WINDOW_SOURCE: 'windowSource',
  WINDOW_SOURCE_PAYLOAD: 'windowSource.payload',
  WINDOW_SOURCE_VERSION_UNSUPPORTED: 'windowSource.version:unsupported',
  WINDOW_SOURCE_RECONSTRUCTION_MISMATCH: 'windowSource:reconstruction_mismatch',
  VALID: 'valid',
});


const inputKeys = Object.freeze([
  'matrixId',
  'cellId',
  'pairId',
  'runId',
  'sideId',
  'evidence',
]);
const payloadKeys = Object.freeze(['version', ...inputKeys]);
const sourceVersion = 'benchmark-resource-window-source-v1';
const allowedKinds = Object.freeze([
  BENCHMARK_RESOURCE_ARTIFACT_KIND.CAPACITY_SAMPLE,
  BENCHMARK_RESOURCE_ARTIFACT_KIND.SEMANTIC_RECEIPT,
  BENCHMARK_RESOURCE_ARTIFACT_KIND.LIVE_ENGAGEMENT,
  BENCHMARK_RESOURCE_ARTIFACT_KIND.WINDOW_RECEIPT,
]);

function fail(message) {
  throw new TypeError(message);
}

function kindAllowed(kind) {
  for (let index = 0; index < allowedKinds.length; index += 1) {
    if (allowedKinds[index] === kind) return true;
  }
  return false;
}

export function createBenchmarkResourceWindowSourceArtifact(kind, input) {
  if (!kindAllowed(kind)) fail(localText.WINDOW_SOURCE_KIND_UNSUPPORTED);
  assertBenchmarkResourceExactRecord(input, inputKeys, localText.WINDOW_SOURCE);
  const textFields = ['matrixId', 'cellId', 'pairId', 'runId', 'sideId'];
  for (let index = 0; index < textFields.length; index += 1) {
    const field = textFields[index];
    assertBenchmarkResourceText(input[field], `windowSource.${field}`);
  }
  assertBenchmarkResourceCanonicalData(input.evidence);
  return createBenchmarkResourceArtifact(kind, {
    version: sourceVersion,
    matrixId: input.matrixId,
    cellId: input.cellId,
    pairId: input.pairId,
    runId: input.runId,
    sideId: input.sideId,
    evidence: input.evidence,
  });
}

export function inspectBenchmarkResourceWindowSourceArtifact(
  artifact,
  expected,
) {
  try {
    if (!kindAllowed(artifact.kind)) fail(localText.WINDOW_SOURCE_KIND_UNSUPPORTED);
    assertBenchmarkResourceExactRecord(
      artifact.payload,
      payloadKeys,
      localText.WINDOW_SOURCE_PAYLOAD,
    );
    const payload = artifact.payload;
    if (payload.version !== sourceVersion) {
      fail(localText.WINDOW_SOURCE_VERSION_UNSUPPORTED);
    }
    const reconstructed = createBenchmarkResourceWindowSourceArtifact(
      artifact.kind,
      {
        matrixId: payload.matrixId,
        cellId: payload.cellId,
        pairId: payload.pairId,
        runId: payload.runId,
        sideId: payload.sideId,
        evidence: payload.evidence,
      },
    );
    if (
      digestBenchmarkSemanticData(reconstructed.artifact) !==
        digestBenchmarkSemanticData(artifact)
    ) {
      fail(localText.WINDOW_SOURCE_RECONSTRUCTION_MISMATCH);
    }
    const expectedFields = [
      'matrixId',
      'cellId',
      'pairId',
      'runId',
      'sideId',
    ];
    for (let index = 0; index < expectedFields.length; index += 1) {
      const field = expectedFields[index];
      if (payload[field] !== expected[field]) {
        fail(`windowSource.${field}:coordinate_mismatch`);
      }
    }
    return {valid: true, reason: localText.VALID};
  } catch (error) {
    return {valid: false, reason: error.message};
  }
}
