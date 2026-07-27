import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {
  assertBenchmarkResourceArray,
  assertBenchmarkResourceBytes,
  assertBenchmarkResourceDigest,
  assertBenchmarkResourceExactRecord,
  assertBenchmarkResourceInteger,
  benchmarkResourceDigestBytes,
} from './benchmark-resource-evidence-data.js';
import {
  BENCHMARK_RESOURCE_LIMIT,
} from './benchmark-resource-contract-constants.js';
const localText = Object.freeze({
  DURABLE_RESOLVER_ROOT_DIRECTORY_TEXT_REQUIRED: 'durableResolver.rootDirectory:text_required',
  DURABLE_RESOLVER_DIGEST: 'durableResolver.digest',
  SHA256: 'sha256',
  DURABLE_RESOLVER_ARTIFACTS: 'durableResolver.artifacts',
  DURABLE_RESOLVER_ARTIFACTS_BYTE_LENGTH_MISMATCH: 'durableResolver.artifacts:byte_length_mismatch',
  DURABLE_RESOLVER_ARTIFACTS_DIGEST_MISMATCH:
    'durableResolver.artifacts:digest_mismatch',
  WX: 'wx',
  DURABLE_RESOLVER_ARTIFACTS_CONTENT_ADDRESS_COLLISION: 'durableResolver.artifacts:content_address_collision',
});


const artifactEnvelopeKeys =
  Object.freeze(['digest', 'bytes', 'byteLength', 'artifact']);
const bufferByteLength = Buffer.byteLength;
const bufferCompare = Buffer.compare;
const digestPrefixLength = 'sha256:'.length;
const errorCodeExists = 'EEXIST';
const errorCodeMissing = 'ENOENT';

function fail(message) {
  throw new TypeError(message);
}

export function benchmarkResourceDurableArtifactPath(
  rootDirectory,
  digest,
) {
  if (typeof rootDirectory !== 'string' || rootDirectory.length === 0) {
    fail(localText.DURABLE_RESOLVER_ROOT_DIRECTORY_TEXT_REQUIRED);
  }
  assertBenchmarkResourceDigest(digest, localText.DURABLE_RESOLVER_DIGEST);
  const hex = digest.slice(digestPrefixLength);
  return resolve(rootDirectory, localText.SHA256, hex.slice(0, 2), `${hex}.artifact`);
}

export async function persistBenchmarkResourceArtifacts(
  rootDirectory,
  artifacts,
) {
  assertBenchmarkResourceArray(
    artifacts,
    localText.DURABLE_RESOLVER_ARTIFACTS,
    BENCHMARK_RESOURCE_LIMIT.ARTIFACT_COUNT + 1,
  );
  const persisted = [];
  for (let index = 0; index < artifacts.length; index += 1) {
    const artifact = artifacts[index];
    assertBenchmarkResourceExactRecord(
      artifact,
      artifactEnvelopeKeys,
      `durableResolver.artifacts.${index}`,
    );
    assertBenchmarkResourceDigest(
      artifact.digest,
      `durableResolver.artifacts.${index}.digest`,
    );
    assertBenchmarkResourceInteger(
      artifact.byteLength,
      `durableResolver.artifacts.${index}.byteLength`,
    );
    assertBenchmarkResourceBytes(
      artifact.bytes,
      `durableResolver.artifacts.${index}.bytes`,
    );
    if (bufferByteLength(artifact.bytes) !== artifact.byteLength) {
      fail(localText.DURABLE_RESOLVER_ARTIFACTS_BYTE_LENGTH_MISMATCH);
    }
    if (benchmarkResourceDigestBytes(artifact.bytes) !== artifact.digest) {
      fail(localText.DURABLE_RESOLVER_ARTIFACTS_DIGEST_MISMATCH);
    }
    const path = benchmarkResourceDurableArtifactPath(
      rootDirectory,
      artifact.digest,
    );
    await mkdir(dirname(path), {recursive: true});
    try {
      await writeFile(path, artifact.bytes, {flag: localText.WX});
    } catch (error) {
      if (error?.code !== errorCodeExists) throw error;
      const existing = await readFile(path);
      if (bufferCompare(existing, artifact.bytes) !== 0) {
        fail(localText.DURABLE_RESOLVER_ARTIFACTS_CONTENT_ADDRESS_COLLISION);
      }
    }
    persisted.push({
      digest: artifact.digest,
      byteLength: artifact.byteLength,
    });
  }
  return persisted;
}

export function createBenchmarkResourceDurableResolver(rootDirectory) {
  if (typeof rootDirectory !== 'string' || rootDirectory.length === 0) {
    fail(localText.DURABLE_RESOLVER_ROOT_DIRECTORY_TEXT_REQUIRED);
  }
  return Object.freeze({
    resolve(digest) {
      const path = benchmarkResourceDurableArtifactPath(rootDirectory, digest);
      try {
        return readFileSync(path);
      } catch (error) {
        if (error?.code === errorCodeMissing) return undefined;
        throw error;
      }
    },
  });
}
