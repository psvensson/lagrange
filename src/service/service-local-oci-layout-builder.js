/**
 * Canonical local-development build owner for OCI container and prebuilt WASM
 * service artifacts. It publishes a verified OCI image layout and returns an
 * immutable receipt; manifest materialization and runtime activation are not
 * responsibilities of this owner.
 */

import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import {RUNTIME_KIND} from '../constants/runtime.js';
import {DockerBuildxOciLayoutExporter} from './docker-buildx-oci-layout-exporter.js';
import {EXTERNAL_SERVICE_MEDIA_TYPE} from './external-service-manifest.js';
import {
  OCI_CONTAINER_LAYER_MEDIA_TYPES,
  OCI_EMPTY_CONFIG_MEDIA_TYPE,
  OCI_IMAGE_CONFIG_MEDIA_TYPE,
  OCI_IMAGE_LAYOUT_VERSION,
  OCI_LAGRANGE_ANNOTATION,
  OCI_IMAGE_MANIFEST_MEDIA_TYPE,
  OCI_IMAGE_SCHEMA_VERSION,
  canonicalOciJsonBytes as canonicalJsonBytes,
} from './oci-image-layout-contract.js';
import {
  SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE,
  SERVICE_LOCAL_OCI_LAYOUT_FAILURE_MESSAGE as BUILD_FAILURE_MESSAGE,
  SERVICE_LOCAL_OCI_LAYOUT_PATH as BUILD_PATH,
  ServiceLocalOciLayoutFailure,
  failServiceLocalOciLayout as fail,
} from './service-local-oci-layout-errors.js';
import {
  ensureServiceOciOutputRoot,
  requireServiceOciLayoutDirectory,
  requireServiceOciOutputRootIdentity,
  serviceOciLayoutDirectoryExists,
} from './service-local-oci-output-path.js';

const EXTERNAL_RUNTIME_KINDS = Object.freeze([
  RUNTIME_KIND.OCI_CONTAINER,
  RUNTIME_KIND.WASM_COMPONENT,
]);
const BUILD_INPUT_CONTRACT_VERSION = 1;
const MAXIMUM_LAYOUT_METADATA_BYTES = 1024 * 1024;
const MAXIMUM_IMAGE_MANIFEST_BYTES = 4 * 1024 * 1024;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const PLATFORM_PATTERN = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)?$/;
const BUILD_ARGUMENT_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TEMPORARY_LAYOUT_PREFIX = '.lagrange-service-oci-layout-';
const HASH_ALGORITHM = 'sha256';
const HASH_DIGEST_ENCODING = 'hex';
const JSON_TEXT_ENCODING = 'utf8';
const SHA256_PREFIX_LENGTH = 7;
const BLOB_DIRECTORY_NAME = 'blobs';
const SHA256_DIRECTORY_NAME = 'sha256';
const OCI_LAYOUT_FILE_NAME = 'oci-layout';
const OCI_INDEX_FILE_NAME = 'index.json';
const PARENT_PATH_SEGMENT = '..';
const PLATFORM_SEPARATOR = '/';
const CONTAINER_EXPORTER_FIELD = 'containerExporter';
const FILE_SYSTEM_ERROR_CODE = Object.freeze({
  ALREADY_EXISTS: 'EEXIST',
  DIRECTORY_NOT_EMPTY: 'ENOTEMPTY',
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function sha256(bytes) {
  return `sha256:${createHash(HASH_ALGORITHM)
    .update(bytes).digest(HASH_DIGEST_ENCODING)}`;
}

function inputFailure(pathValue, message) {
  fail(SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.INPUT_INVALID, pathValue, message);
}

function requiredString(value, pathValue) {
  if (typeof value !== 'string' || value.length === 0) {
    inputFailure(pathValue, BUILD_FAILURE_MESSAGE.STRING_REQUIRED);
  }
  return value;
}

function normalizedPlatform(value) {
  const platform = requiredString(value, BUILD_PATH.PLATFORM).toLowerCase();
  if (!PLATFORM_PATTERN.test(platform)) {
    inputFailure(BUILD_PATH.PLATFORM, BUILD_FAILURE_MESSAGE.PLATFORM_INVALID);
  }
  return platform;
}

function platformDescriptor(platform) {
  const [os, architecture, variant] = platform.split(PLATFORM_SEPARATOR);
  return variant ? {architecture, os, variant} : {architecture, os};
}

function normalizedSourceDateEpoch(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    inputFailure(
      BUILD_PATH.SOURCE_DATE_EPOCH,
      BUILD_FAILURE_MESSAGE.SOURCE_DATE_EPOCH_INVALID,
    );
  }
  return value;
}

function normalizedBuildArgs(value) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    inputFailure(
      BUILD_PATH.CONTAINER_BUILD_ARGS,
      BUILD_FAILURE_MESSAGE.BUILD_ARGS_INVALID,
    );
  }
  const entries = Object.entries(value);
  for (const [key, entryValue] of entries) {
    if (!BUILD_ARGUMENT_NAME_PATTERN.test(key) || typeof entryValue !== 'string') {
      inputFailure(
        BUILD_PATH.CONTAINER_BUILD_ARGS,
        BUILD_FAILURE_MESSAGE.BUILD_ARGS_VALUES_INVALID,
      );
    }
  }
  entries.sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(entries);
}

function isPathInside(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);
  return relative.length > 0 &&
    relative !== PARENT_PATH_SEGMENT &&
    !relative.startsWith(`${PARENT_PATH_SEGMENT}${path.sep}`) &&
    !path.isAbsolute(relative);
}

function normalizedCommonRequest(request) {
  return {
    outputRoot: path.resolve(
      requiredString(request.outputRoot, BUILD_PATH.OUTPUT_ROOT),
    ),
    platform: normalizedPlatform(request.platform),
    runtimeKind: request.runtimeKind,
    sourceDateEpoch: normalizedSourceDateEpoch(request.sourceDateEpoch),
  };
}

function normalizedWasmRequest(request, common) {
  if (!request.wasm || typeof request.wasm !== 'object' || request.container) {
    inputFailure(BUILD_PATH.WASM, BUILD_FAILURE_MESSAGE.WASM_INPUT_INVALID);
  }
  return {
    ...common,
    wasm: {
      payloadPath: path.resolve(
        requiredString(request.wasm.payloadPath, BUILD_PATH.WASM_PAYLOAD),
      ),
    },
  };
}

function normalizedContainerRequest(request, common) {
  if (!request.container || typeof request.container !== 'object' || request.wasm) {
    inputFailure(
      BUILD_PATH.CONTAINER,
      BUILD_FAILURE_MESSAGE.CONTAINER_INPUT_INVALID,
    );
  }
  const contextPath = path.resolve(
    requiredString(request.container.contextPath, BUILD_PATH.CONTAINER_CONTEXT),
  );
  const dockerfileValue = requiredString(
    request.container.dockerfilePath,
    BUILD_PATH.CONTAINER_DOCKERFILE,
  );
  const dockerfilePath = path.resolve(contextPath, dockerfileValue);
  if (!isPathInside(contextPath, dockerfilePath)) {
    inputFailure(
      BUILD_PATH.CONTAINER_DOCKERFILE,
      BUILD_FAILURE_MESSAGE.DOCKERFILE_OUTSIDE_CONTEXT,
    );
  }
  const sourceFingerprint = requiredString(
    request.container.sourceFingerprint,
    BUILD_PATH.CONTAINER_SOURCE_FINGERPRINT,
  );
  if (!SHA256_PATTERN.test(sourceFingerprint)) {
    inputFailure(
      BUILD_PATH.CONTAINER_SOURCE_FINGERPRINT,
      BUILD_FAILURE_MESSAGE.SOURCE_FINGERPRINT_INVALID,
    );
  }
  return {
    ...common,
    container: {
      buildArgs: normalizedBuildArgs(request.container.buildArgs),
      contextPath,
      dockerfilePath,
      dockerfileRelativePath: path.relative(contextPath, dockerfilePath)
        .split(path.sep).join(PLATFORM_SEPARATOR),
      sourceFingerprint,
    },
  };
}

function normalizeRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    inputFailure(BUILD_PATH.REQUEST, BUILD_FAILURE_MESSAGE.BUILD_REQUEST_INVALID);
  }
  if (!EXTERNAL_RUNTIME_KINDS.includes(request.runtimeKind)) {
    inputFailure(BUILD_PATH.RUNTIME_KIND, BUILD_FAILURE_MESSAGE.RUNTIME_KIND_INVALID);
  }
  const common = normalizedCommonRequest(request);
  return request.runtimeKind === RUNTIME_KIND.WASM_COMPONENT ?
    normalizedWasmRequest(request, common) :
    normalizedContainerRequest(request, common);
}

async function requireContainerPaths(request) {
  let contextStat;
  let dockerfileStat;
  try {
    [contextStat, dockerfileStat] = await Promise.all([
      stat(request.container.contextPath),
      stat(request.container.dockerfilePath),
    ]);
  } catch (error) {
    fail(
      SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.INPUT_INVALID,
      BUILD_PATH.CONTAINER,
      BUILD_FAILURE_MESSAGE.CONTAINER_PATHS_UNREADABLE,
      error,
    );
  }
  if (!contextStat.isDirectory() || !dockerfileStat.isFile()) {
    inputFailure(
      BUILD_PATH.CONTAINER,
      BUILD_FAILURE_MESSAGE.CONTAINER_PATHS_INVALID,
    );
  }
}

function validateDescriptor(value, pathValue) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !SHA256_PATTERN.test(value.digest) ||
      typeof value.mediaType !== 'string' || value.mediaType.length === 0 ||
      !Number.isSafeInteger(value.size) || value.size < 0) {
    fail(
      SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.DESCRIPTOR_INVALID,
      pathValue,
      BUILD_FAILURE_MESSAGE.DESCRIPTOR_INVALID,
    );
  }
  return value;
}

async function readBounded(filePath, maximumBytes, pathValue) {
  let fileStat;
  try {
    fileStat = await lstat(filePath);
  } catch (error) {
    fail(
      SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.BLOB_READ_FAILED,
      pathValue,
      BUILD_FAILURE_MESSAGE.LAYOUT_FILE_UNREADABLE,
      error,
    );
  }
  if (!fileStat.isFile() || fileStat.isSymbolicLink() ||
      fileStat.size > maximumBytes) {
    fail(
      SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.LAYOUT_INVALID,
      pathValue,
      BUILD_FAILURE_MESSAGE.LAYOUT_FILE_INVALID,
    );
  }
  try {
    return await readFile(filePath);
  } catch (error) {
    fail(
      SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.BLOB_READ_FAILED,
      pathValue,
      BUILD_FAILURE_MESSAGE.LAYOUT_FILE_UNREADABLE,
      error,
    );
  }
}

async function readJson(filePath, maximumBytes, pathValue) {
  const bytes = await readBounded(filePath, maximumBytes, pathValue);
  try {
    return JSON.parse(bytes.toString(JSON_TEXT_ENCODING));
  } catch (error) {
    fail(
      SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.LAYOUT_INVALID,
      pathValue,
      BUILD_FAILURE_MESSAGE.LAYOUT_JSON_INVALID,
      error,
    );
  }
}

async function hashFile(filePath, pathValue) {
  let fileStat;
  try {
    fileStat = await lstat(filePath);
  } catch (error) {
    fail(
      SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.BLOB_READ_FAILED,
      pathValue,
      BUILD_FAILURE_MESSAGE.BLOB_MISSING,
      error,
    );
  }
  if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
    fail(
      SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.BLOB_READ_FAILED,
      pathValue,
      BUILD_FAILURE_MESSAGE.BLOB_NOT_FILE,
    );
  }
  const hash = createHash(HASH_ALGORITHM);
  let sizeBytes = 0;
  try {
    for await (const chunk of createReadStream(filePath)) {
      hash.update(chunk);
      sizeBytes += chunk.length;
    }
  } catch (error) {
    fail(
      SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.BLOB_READ_FAILED,
      pathValue,
      BUILD_FAILURE_MESSAGE.BLOB_READ_FAILED,
      error,
    );
  }
  return {
    digest: `sha256:${hash.digest(HASH_DIGEST_ENCODING)}`,
    sizeBytes,
  };
}

function blobPath(layoutPath, digest) {
  return path.join(
    layoutPath,
    BLOB_DIRECTORY_NAME,
    SHA256_DIRECTORY_NAME,
    digest.slice(SHA256_PREFIX_LENGTH),
  );
}

async function verifyBlob(layoutPath, descriptorValue, pathValue) {
  const descriptor = validateDescriptor(descriptorValue, pathValue);
  const observed = await hashFile(
    blobPath(layoutPath, descriptor.digest),
    pathValue,
  );
  if (observed.sizeBytes !== descriptor.size) {
    fail(
      SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.DESCRIPTOR_SIZE_MISMATCH,
      `${pathValue}/size`,
      BUILD_FAILURE_MESSAGE.BLOB_SIZE_MISMATCH,
    );
  }
  if (observed.digest !== descriptor.digest) {
    fail(
      SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.DIGEST_MISMATCH,
      `${pathValue}/digest`,
      BUILD_FAILURE_MESSAGE.BLOB_DIGEST_MISMATCH,
    );
  }
  return descriptor;
}

function validateManifestShape(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) ||
      manifest.schemaVersion !== OCI_IMAGE_SCHEMA_VERSION ||
      manifest.mediaType !== OCI_IMAGE_MANIFEST_MEDIA_TYPE ||
      !manifest.config || !Array.isArray(manifest.layers)) {
    fail(
      SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.LAYOUT_INVALID,
      BUILD_PATH.MANIFEST,
      BUILD_FAILURE_MESSAGE.MANIFEST_SHAPE_INVALID,
    );
  }
}

function validateRuntimeMedia(runtimeKind, config, layers) {
  if (runtimeKind === RUNTIME_KIND.WASM_COMPONENT) {
    if (config.mediaType !== OCI_EMPTY_CONFIG_MEDIA_TYPE ||
        layers.length !== 1 ||
        layers[0].mediaType !== EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT) {
      fail(
        SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.MEDIA_TYPE_MISMATCH,
        BUILD_PATH.MANIFEST,
        BUILD_FAILURE_MESSAGE.WASM_MEDIA_INVALID,
      );
    }
    return;
  }
  if (config.mediaType !== OCI_IMAGE_CONFIG_MEDIA_TYPE ||
      layers.some((layer) =>
        !OCI_CONTAINER_LAYER_MEDIA_TYPES.includes(layer.mediaType))) {
    fail(
      SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.MEDIA_TYPE_MISMATCH,
      BUILD_PATH.MANIFEST,
      BUILD_FAILURE_MESSAGE.CONTAINER_MEDIA_INVALID,
    );
  }
}

async function validateLayoutRoot(layoutPath) {
  await requireServiceOciLayoutDirectory(layoutPath);
  await requireServiceOciLayoutDirectory(
    path.join(layoutPath, BLOB_DIRECTORY_NAME),
  );
  await requireServiceOciLayoutDirectory(
    path.join(layoutPath, BLOB_DIRECTORY_NAME, SHA256_DIRECTORY_NAME),
  );
}

function validateDescriptorPlatform(top, platform) {
  const expected = platformDescriptor(platform);
  if (!top.platform || typeof top.platform !== 'object' ||
      top.platform.os !== expected.os ||
      top.platform.architecture !== expected.architecture ||
      top.platform.variant !== expected.variant) {
    fail(
      SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.LAYOUT_INVALID,
      BUILD_PATH.INDEX_MANIFEST_PLATFORM,
      BUILD_FAILURE_MESSAGE.PLATFORM_MISMATCH,
    );
  }
}

async function validateLayout(layoutPath, runtimeKind, platform) {
  await validateLayoutRoot(layoutPath);
  const marker = await readJson(
    path.join(layoutPath, OCI_LAYOUT_FILE_NAME),
    MAXIMUM_LAYOUT_METADATA_BYTES,
    BUILD_PATH.OCI_LAYOUT,
  );
  if (marker?.imageLayoutVersion !== OCI_IMAGE_LAYOUT_VERSION) {
    fail(
      SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.LAYOUT_INVALID,
      BUILD_PATH.OCI_LAYOUT_VERSION,
      BUILD_FAILURE_MESSAGE.LAYOUT_VERSION_INVALID,
    );
  }
  const index = await readJson(
    path.join(layoutPath, OCI_INDEX_FILE_NAME),
    MAXIMUM_LAYOUT_METADATA_BYTES,
    BUILD_PATH.INDEX,
  );
  if (index?.schemaVersion !== OCI_IMAGE_SCHEMA_VERSION ||
      !Array.isArray(index.manifests) || index.manifests.length !== 1) {
    fail(
      SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.LAYOUT_INVALID,
      BUILD_PATH.INDEX_MANIFESTS,
      BUILD_FAILURE_MESSAGE.LAYOUT_MANIFEST_CARDINALITY,
    );
  }
  const top = validateDescriptor(index.manifests[0], BUILD_PATH.INDEX_MANIFEST);
  validateDescriptorPlatform(top, platform);
  if (top.mediaType !== OCI_IMAGE_MANIFEST_MEDIA_TYPE) {
    fail(
      SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.MEDIA_TYPE_MISMATCH,
      BUILD_PATH.INDEX_MANIFEST_MEDIA,
      BUILD_FAILURE_MESSAGE.TOP_MEDIA_INVALID,
    );
  }
  await verifyBlob(layoutPath, top, BUILD_PATH.INDEX_MANIFEST);
  const manifestBytes = await readBounded(
    blobPath(layoutPath, top.digest),
    MAXIMUM_IMAGE_MANIFEST_BYTES,
    BUILD_PATH.MANIFEST,
  );
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString(JSON_TEXT_ENCODING));
  } catch (error) {
    fail(
      SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.LAYOUT_INVALID,
      BUILD_PATH.MANIFEST,
      BUILD_FAILURE_MESSAGE.MANIFEST_JSON_INVALID,
      error,
    );
  }
  validateManifestShape(manifest);
  const config = validateDescriptor(manifest.config, BUILD_PATH.MANIFEST_CONFIG);
  const layers = manifest.layers.map((layer, indexValue) =>
    validateDescriptor(layer, `/manifest/layers/${indexValue}`));
  validateRuntimeMedia(runtimeKind, config, layers);
  await verifyBlob(layoutPath, config, BUILD_PATH.MANIFEST_CONFIG);
  await Promise.all(layers.map((layer, indexValue) =>
    verifyBlob(layoutPath, layer, `/manifest/layers/${indexValue}`)));
  return {layers, top};
}

async function writeBlob(layoutPath, bytes) {
  const digest = sha256(bytes);
  await mkdir(
    path.join(layoutPath, BLOB_DIRECTORY_NAME, SHA256_DIRECTORY_NAME),
    {recursive: true},
  );
  await writeFile(blobPath(layoutPath, digest), bytes);
  return digest;
}

async function readWasmPayload(payloadPath) {
  try {
    const payloadStat = await lstat(payloadPath);
    if (!payloadStat.isFile() || payloadStat.isSymbolicLink()) {
      inputFailure(
        BUILD_PATH.WASM_PAYLOAD,
        BUILD_FAILURE_MESSAGE.WASM_PAYLOAD_INVALID,
      );
    }
    return await readFile(payloadPath);
  } catch (error) {
    if (error instanceof ServiceLocalOciLayoutFailure) throw error;
    fail(
      SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.INPUT_INVALID,
      BUILD_PATH.WASM_PAYLOAD,
      BUILD_FAILURE_MESSAGE.WASM_PAYLOAD_UNREADABLE,
      error,
    );
  }
}

function rawDescriptor(bytes, mediaType) {
  return {digest: sha256(bytes), mediaType, size: bytes.length};
}

async function writeWasmLayout(
  layoutPath,
  payloadBytes,
  platform,
  buildInputFingerprint,
) {
  const configBytes = canonicalJsonBytes({});
  const config = rawDescriptor(configBytes, OCI_EMPTY_CONFIG_MEDIA_TYPE);
  const payload = rawDescriptor(
    payloadBytes,
    EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT,
  );
  const manifestBytes = canonicalJsonBytes({
    annotations: {
      [OCI_LAGRANGE_ANNOTATION.BUILD_INPUT_FINGERPRINT]: buildInputFingerprint,
      [OCI_LAGRANGE_ANNOTATION.PLATFORM]: platform,
    },
    config,
    layers: [payload],
    mediaType: OCI_IMAGE_MANIFEST_MEDIA_TYPE,
    schemaVersion: OCI_IMAGE_SCHEMA_VERSION,
  });
  const top = rawDescriptor(manifestBytes, OCI_IMAGE_MANIFEST_MEDIA_TYPE);
  await writeBlob(layoutPath, configBytes);
  await writeBlob(layoutPath, payloadBytes);
  await writeBlob(layoutPath, manifestBytes);
  await writeFile(path.join(layoutPath, OCI_LAYOUT_FILE_NAME), canonicalJsonBytes({
    imageLayoutVersion: OCI_IMAGE_LAYOUT_VERSION,
  }));
  await writeFile(path.join(layoutPath, OCI_INDEX_FILE_NAME), canonicalJsonBytes({
    manifests: [{...top, platform: platformDescriptor(platform)}],
    schemaVersion: OCI_IMAGE_SCHEMA_VERSION,
  }));
}

function buildFingerprint(request, wasmPayloadDescriptor) {
  const source = request.runtimeKind === RUNTIME_KIND.WASM_COMPONENT ? {
    kind: 'prebuilt_wasm',
    payload: wasmPayloadDescriptor,
  } : {
    buildArgs: request.container.buildArgs,
    dockerfilePath: request.container.dockerfileRelativePath,
    kind: 'container_context',
    sourceFingerprint: request.container.sourceFingerprint,
  };
  return sha256(canonicalJsonBytes({
    contractVersion: BUILD_INPUT_CONTRACT_VERSION,
    platform: request.platform,
    runtimeKind: request.runtimeKind,
    source,
    sourceDateEpoch: request.sourceDateEpoch,
  }));
}

function receiptDescriptor(descriptor) {
  return {
    digest: descriptor.digest,
    mediaType: descriptor.mediaType,
    sizeBytes: descriptor.size,
  };
}

function buildReceipt(request, layoutPath, graph, buildInputFingerprint) {
  const payloadDescriptors = graph.layers.map(receiptDescriptor);
  return deepFreeze({
    buildInputFingerprint,
    layoutPath,
    payloadDescriptors,
    platform: request.platform,
    runtimeKind: request.runtimeKind,
    sourceDateEpoch: request.sourceDateEpoch,
    topManifestDescriptor: receiptDescriptor(graph.top),
    totalPayloadBytes: payloadDescriptors.reduce(
      (total, descriptor) => total + descriptor.sizeBytes,
      0,
    ),
  });
}

async function publishLayout(
  outputRoot,
  outputRootIdentity,
  temporaryPath,
  graph,
  runtimeKind,
  platform,
) {
  const finalPath = path.join(
    outputRoot,
    graph.top.digest.slice(SHA256_PREFIX_LENGTH),
  );
  await requireServiceOciOutputRootIdentity(outputRoot, outputRootIdentity);
  const finalPathExists = await serviceOciLayoutDirectoryExists(finalPath);
  await requireServiceOciOutputRootIdentity(outputRoot, outputRootIdentity);
  if (finalPathExists) {
    const existingGraph = await validateLayout(finalPath, runtimeKind, platform);
    await requireServiceOciOutputRootIdentity(outputRoot, outputRootIdentity);
    if (existingGraph.top.digest !== graph.top.digest) {
      fail(
        SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.DIGEST_MISMATCH,
        BUILD_PATH.OUTPUT_ROOT,
        BUILD_FAILURE_MESSAGE.EXISTING_LAYOUT_MISMATCH,
      );
    }
    await rm(temporaryPath, {recursive: true, force: true});
    await requireServiceOciOutputRootIdentity(outputRoot, outputRootIdentity);
    return {graph: existingGraph, layoutPath: finalPath};
  }
  try {
    await rename(temporaryPath, finalPath);
    await requireServiceOciOutputRootIdentity(outputRoot, outputRootIdentity);
    return {graph, layoutPath: finalPath};
  } catch (error) {
    if (error.code !== FILE_SYSTEM_ERROR_CODE.ALREADY_EXISTS &&
        error.code !== FILE_SYSTEM_ERROR_CODE.DIRECTORY_NOT_EMPTY) throw error;
    await requireServiceOciOutputRootIdentity(outputRoot, outputRootIdentity);
    const existingGraph = await validateLayout(finalPath, runtimeKind, platform);
    await requireServiceOciOutputRootIdentity(outputRoot, outputRootIdentity);
    if (existingGraph.top.digest !== graph.top.digest) {
      fail(
        SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.DIGEST_MISMATCH,
        BUILD_PATH.OUTPUT_ROOT,
        BUILD_FAILURE_MESSAGE.EXISTING_LAYOUT_MISMATCH,
      );
    }
    await rm(temporaryPath, {recursive: true, force: true});
    await requireServiceOciOutputRootIdentity(outputRoot, outputRootIdentity);
    return {graph: existingGraph, layoutPath: finalPath};
  }
}

class ServiceLocalOciLayoutBuilder {
  constructor(options = {}) {
    this.containerExporter = Object.hasOwn(options, CONTAINER_EXPORTER_FIELD) ?
      options.containerExporter : new DockerBuildxOciLayoutExporter();
    if (typeof this.containerExporter.exportLayout !== 'function') {
      throw new TypeError(BUILD_FAILURE_MESSAGE.EXPORTER_INVALID);
    }
  }

  async build(rawRequest = {}) {
    const request = normalizeRequest(rawRequest);
    const payloadBytes = request.runtimeKind === RUNTIME_KIND.WASM_COMPONENT ?
      await readWasmPayload(request.wasm.payloadPath) : Buffer.alloc(0);
    if (request.runtimeKind === RUNTIME_KIND.OCI_CONTAINER) {
      await requireContainerPaths(request);
    }
    const wasmPayloadDescriptor = request.runtimeKind === RUNTIME_KIND.WASM_COMPONENT ?
      receiptDescriptor(rawDescriptor(
        payloadBytes,
        EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT,
      )) : {};
    const buildInputFingerprint = buildFingerprint(
      request,
      wasmPayloadDescriptor,
    );
    const outputRootIdentity = await ensureServiceOciOutputRoot(
      request.outputRoot,
    );
    const temporaryPath = await mkdtemp(
      path.join(request.outputRoot, TEMPORARY_LAYOUT_PREFIX),
    );
    await requireServiceOciOutputRootIdentity(
      request.outputRoot,
      outputRootIdentity,
    );
    try {
      if (request.runtimeKind === RUNTIME_KIND.WASM_COMPONENT) {
        await writeWasmLayout(
          temporaryPath,
          payloadBytes,
          request.platform,
          buildInputFingerprint,
        );
      } else {
        try {
          await this.containerExporter.exportLayout({
            buildArgs: request.container.buildArgs,
            contextPath: request.container.contextPath,
            dockerfilePath: request.container.dockerfilePath,
            outputPath: temporaryPath,
            platform: request.platform,
            sourceDateEpoch: request.sourceDateEpoch,
          });
        } catch (error) {
          fail(
            SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.EXPORT_FAILED,
            BUILD_PATH.CONTAINER,
            BUILD_FAILURE_MESSAGE.CONTAINER_EXPORT_FAILED,
            error,
          );
        }
      }
      await requireServiceOciOutputRootIdentity(
        request.outputRoot,
        outputRootIdentity,
      );
      const graph = await validateLayout(
        temporaryPath,
        request.runtimeKind,
        request.platform,
      );
      await requireServiceOciOutputRootIdentity(
        request.outputRoot,
        outputRootIdentity,
      );
      const published = await publishLayout(
        request.outputRoot,
        outputRootIdentity,
        temporaryPath,
        graph,
        request.runtimeKind,
        request.platform,
      );
      await requireServiceOciOutputRootIdentity(
        request.outputRoot,
        outputRootIdentity,
      );
      return buildReceipt(
        request,
        published.layoutPath,
        published.graph,
        buildInputFingerprint,
      );
    } catch (error) {
      await rm(temporaryPath, {recursive: true, force: true});
      throw error;
    }
  }
}

export {
  SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE,
  ServiceLocalOciLayoutBuilder,
  ServiceLocalOciLayoutFailure,
};
