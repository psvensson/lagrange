import {createHash} from 'node:crypto';
import {TextDecoder, types} from 'node:util';
import {
  appendOwnArrayValue,
  hasExactOwnDataKeys,
  isDenseDataArray,
  isNonNegativeSafeInteger,
  isNonNegativeSafeNumber,
  isPlainDataRecord,
  isSha256Digest,
  parseBenchmarkSemanticJson,
  serializeBenchmarkSemanticData,
} from './benchmark-semantic-integrity.js';
import {
  BENCHMARK_RESOURCE_ARTIFACT_KIND,
  BENCHMARK_RESOURCE_CONTRACT,
  BENCHMARK_RESOURCE_LIMIT,
} from './benchmark-resource-contract-constants.js';
const localText = Object.freeze({
  CANONICAL_DATA_PLAIN_DATA_REQUIRED: 'canonical_data:plain_data_required',
  CANONICAL_DATA_DEPTH_LIMIT: 'canonical_data:depth_limit',
  CANONICAL_DATA_NODE_LIMIT: 'canonical_data:node_limit',
  CANONICAL_DATA_CYCLE: 'canonical_data:cycle',
  ARTIFACT_BYTES: 'artifact_bytes',
  ARTIFACT_REFERENCES: 'artifact.references',
  ARTIFACT_REFERENCES_DUPLICATE: 'artifact.references:duplicate',
  ARTIFACT_KIND: 'artifact.kind',
  ARTIFACT_BYTES_SIZE_LIMIT: 'artifact_bytes:size_limit',
  ARTIFACT_DIGEST: 'artifact.digest',
  ARTIFACT_BYTES_DIGEST_MISMATCH: 'artifact_bytes:digest_mismatch',
  ARTIFACT_BYTES_UTF8_REQUIRED: 'artifact_bytes:utf8_required',
  ARTIFACT: 'artifact',
  ARTIFACT_SCHEMA_VERSION_UNSUPPORTED: 'artifact.schemaVersion:unsupported',
  ARTIFACT_BYTES_NOT_CANONICAL: 'artifact_bytes:not_canonical',
  ARTIFACTS: 'artifacts',
  DIGEST: 'digest',
  BYTES: 'bytes',
  BYTE_LENGTH: 'byteLength',
  ARTIFACTS_DIGEST_DUPLICATE: 'artifacts:digest_duplicate',
  RESOLVER_DIGEST: 'resolver.digest',
  LIVE_CALIBRATION_AUTHORITY_REQUIRED:
    'artifact.kind:live_calibration_authority_required',
});


const bufferByteLength = Buffer.byteLength;
const bufferFrom = Buffer.from;
const bufferIsBuffer = Buffer.isBuffer;
const arrayBufferIsView = ArrayBuffer.isView;
const mapGet = Function.call.bind(Map.prototype.get);
const mapHas = Function.call.bind(Map.prototype.has);
const mapSet = Function.call.bind(Map.prototype.set);
const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectKeys = Object.keys;
const objectHasOwn = Object.hasOwn;
const setAdd = Function.call.bind(Set.prototype.add);
const setDelete = Function.call.bind(Set.prototype.delete);
const setHas = Function.call.bind(Set.prototype.has);
const isProxy = types.isProxy;
const uint8ArrayPrototype = Uint8Array.prototype;
const textEncoding = 'utf8';
const dataValueKey = 'value';
const sha256 = 'sha256';
const hex = 'hex';
const digestPrefix = 'sha256:';
const fatalUtf8Decoder = new TextDecoder('utf-8', {fatal: true});
const textDecoderDecode = Function.call.bind(TextDecoder.prototype.decode);
const artifactKeys = Object.freeze([
  'schemaVersion',
  'kind',
  'references',
  'payload',
]);

function fail(message) {
  throw new TypeError(message);
}

function ownDataValue(value, key) {
  const descriptor = objectGetOwnPropertyDescriptor(value, key);
  if (!descriptor || !objectHasOwn(descriptor, dataValueKey)) {
    fail(`${key}:own_data_property_required`);
  }
  return descriptor.value;
}

function isCanonicalScalar(value) {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    isNonNegativeSafeNumber(value)
  );
}

function assertCanonicalChildren(value, state, depth) {
  if (isDenseDataArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      assertCanonicalNode(ownDataValue(value, `${index}`), state, depth);
    }
    return;
  }
  if (!isPlainDataRecord(value)) fail(localText.CANONICAL_DATA_PLAIN_DATA_REQUIRED);
  const keys = objectKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    assertCanonicalNode(ownDataValue(value, keys[index]), state, depth);
  }
}

function assertCanonicalNode(value, state, depth) {
  if (depth > BENCHMARK_RESOURCE_LIMIT.DATA_DEPTH) {
    fail(localText.CANONICAL_DATA_DEPTH_LIMIT);
  }
  state.nodes += 1;
  if (state.nodes > BENCHMARK_RESOURCE_LIMIT.DATA_NODES) {
    fail(localText.CANONICAL_DATA_NODE_LIMIT);
  }
  if (isCanonicalScalar(value)) return;
  if (!value || typeof value !== 'object' || isProxy(value)) {
    fail(localText.CANONICAL_DATA_PLAIN_DATA_REQUIRED);
  }
  if (setHas(state.ancestors, value)) {
    fail(localText.CANONICAL_DATA_CYCLE);
  }
  setAdd(state.ancestors, value);
  assertCanonicalChildren(value, state, depth + 1);
  setDelete(state.ancestors, value);
}

export function assertBenchmarkResourceCanonicalData(value) {
  assertCanonicalNode(value, {ancestors: new Set(), nodes: 0}, 0);
}

export function assertBenchmarkResourceExactRecord(value, keys, path) {
  if (
    !value ||
    typeof value !== 'object' ||
    isProxy(value) ||
    !hasExactOwnDataKeys(value, keys)
  ) {
    fail(`${path}:exact_record_required`);
  }
}

export function assertBenchmarkResourceArray(value, path, maximumLength) {
  if (
    !value ||
    typeof value !== 'object' ||
    isProxy(value) ||
    !isDenseDataArray(value) ||
    value.length > maximumLength
  ) {
    fail(`${path}:bounded_dense_array_required`);
  }
}

export function assertBenchmarkResourceText(value, path) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${path}:text_required`);
  }
}

export function assertBenchmarkResourceDigest(value, path) {
  if (!isSha256Digest(value)) {
    fail(`${path}:sha256_required`);
  }
}

export function assertBenchmarkResourceNumber(value, path) {
  if (!isNonNegativeSafeNumber(value)) {
    fail(`${path}:non_negative_safe_number_required`);
  }
}

export function assertBenchmarkResourceInteger(value, path) {
  if (!isNonNegativeSafeInteger(value)) {
    fail(`${path}:non_negative_safe_integer_required`);
  }
}

export function assertBenchmarkResourceBytes(value, path) {
  if (
    !value ||
    typeof value !== 'object' ||
    isProxy(value) ||
    (
      !bufferIsBuffer(value) &&
      (!arrayBufferIsView(value) ||
        objectGetPrototypeOf(value) !== uint8ArrayPrototype)
    )
  ) {
    fail(`${path}:uint8_array_required`);
  }
}

export function benchmarkResourceDigestBytes(bytes) {
  assertBenchmarkResourceBytes(bytes, localText.ARTIFACT_BYTES);
  return `${digestPrefix}${createHash(sha256).update(bytes).digest(hex)}`;
}

export function benchmarkResourceCanonicalBytes(value) {
  assertBenchmarkResourceCanonicalData(value);
  return bufferFrom(serializeBenchmarkSemanticData(value), textEncoding);
}

function copyReferences(references) {
  assertBenchmarkResourceArray(
    references,
    localText.ARTIFACT_REFERENCES,
    BENCHMARK_RESOURCE_LIMIT.REFERENCES_PER_ARTIFACT,
  );
  const copy = [];
  const seen = new Set();
  for (let index = 0; index < references.length; index += 1) {
    const digest = ownDataValue(references, `${index}`);
    assertBenchmarkResourceDigest(digest, `artifact.references.${index}`);
    if (setHas(seen, digest)) fail(localText.ARTIFACT_REFERENCES_DUPLICATE);
    setAdd(seen, digest);
    appendOwnArrayValue(copy, digest);
  }
  return copy;
}

export function createBenchmarkResourceArtifact(kind, payload, references = []) {
  assertBenchmarkResourceText(kind, localText.ARTIFACT_KIND);
  if (kind === BENCHMARK_RESOURCE_ARTIFACT_KIND.LIVE_CALIBRATION) {
    fail(localText.LIVE_CALIBRATION_AUTHORITY_REQUIRED);
  }
  assertBenchmarkResourceCanonicalData(payload);
  const artifact = {
    schemaVersion: BENCHMARK_RESOURCE_CONTRACT.ARTIFACT_SCHEMA_VERSION,
    kind,
    references: copyReferences(references),
    payload,
  };
  const bytes = benchmarkResourceCanonicalBytes(artifact);
  if (bytes.length > BENCHMARK_RESOURCE_LIMIT.ARTIFACT_BYTES) {
    fail(localText.ARTIFACT_BYTES_SIZE_LIMIT);
  }
  return objectFreeze({
    digest: benchmarkResourceDigestBytes(bytes),
    bytes,
    byteLength: bytes.length,
    artifact,
  });
}

export function parseBenchmarkResourceArtifact(bytes, expectedDigest) {
  assertBenchmarkResourceDigest(expectedDigest, localText.ARTIFACT_DIGEST);
  assertBenchmarkResourceBytes(bytes, localText.ARTIFACT_BYTES);
  const byteLength = bufferByteLength(bytes);
  if (
    byteLength === 0 ||
    byteLength > BENCHMARK_RESOURCE_LIMIT.ARTIFACT_BYTES
  ) {
    fail(localText.ARTIFACT_BYTES_SIZE_LIMIT);
  }
  if (benchmarkResourceDigestBytes(bytes) !== expectedDigest) {
    fail(localText.ARTIFACT_BYTES_DIGEST_MISMATCH);
  }
  let text;
  try {
    text = textDecoderDecode(fatalUtf8Decoder, bufferFrom(bytes));
  } catch {
    fail(localText.ARTIFACT_BYTES_UTF8_REQUIRED);
  }
  const artifact = parseBenchmarkSemanticJson(text);
  assertBenchmarkResourceExactRecord(artifact, artifactKeys, localText.ARTIFACT);
  if (
    artifact.schemaVersion !==
      BENCHMARK_RESOURCE_CONTRACT.ARTIFACT_SCHEMA_VERSION
  ) {
    fail(localText.ARTIFACT_SCHEMA_VERSION_UNSUPPORTED);
  }
  assertBenchmarkResourceText(artifact.kind, localText.ARTIFACT_KIND);
  copyReferences(artifact.references);
  assertBenchmarkResourceCanonicalData(artifact.payload);
  if (serializeBenchmarkSemanticData(artifact) !== text) {
    fail(localText.ARTIFACT_BYTES_NOT_CANONICAL);
  }
  return artifact;
}

export function createBenchmarkResourceMemoryResolver(artifacts) {
  assertBenchmarkResourceArray(
    artifacts,
    localText.ARTIFACTS,
    BENCHMARK_RESOURCE_LIMIT.ARTIFACT_COUNT,
  );
  const bytesByDigest = new Map();
  for (let index = 0; index < artifacts.length; index += 1) {
    const artifact = artifacts[index];
    assertBenchmarkResourceExactRecord(
      artifact,
      [localText.DIGEST, localText.BYTES, localText.BYTE_LENGTH, localText.ARTIFACT],
      `artifacts.${index}`,
    );
    if (mapHas(bytesByDigest, artifact.digest)) {
      fail(localText.ARTIFACTS_DIGEST_DUPLICATE);
    }
    mapSet(bytesByDigest, artifact.digest, bufferFrom(artifact.bytes));
  }
  return objectFreeze({
    resolve(digest) {
      assertBenchmarkResourceDigest(digest, localText.RESOLVER_DIGEST);
      const bytes = mapGet(bytesByDigest, digest);
      return bytes === undefined ? undefined : bufferFrom(bytes);
    },
  });
}
