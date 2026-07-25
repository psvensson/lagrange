import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync, gzipSync} from 'node:zlib';

const DESCRIPTOR_KIND = 'solve-change-artifact';
const DESCRIPTOR_SCHEMA_VERSION = 1;
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const CONTENT_ENCODING = 'gzip';
const DESCRIPTOR_SUFFIX = '.json';
const HISTORICAL_GZIP_SUFFIX = '.gz';
const OBJECT_ROOT = 'solve/artifacts/sha256';
const OBJECT_SUFFIX = '.diff.gz';
const CHANGE_REF_PREFIX = 'diff:';
const DEFAULT_CONTENT_ADDRESS_THRESHOLD_BYTES = 32768;
const NORMALIZED_PATH_SEPARATOR = '/';
const PARENT_PATH_PREFIX = '..';
const TEXT_ENCODING = 'utf8';
const PROBLEM_SEPARATOR = '; ';
const ARTIFACT_KIND_INLINE = 'inline';
const ARTIFACT_KIND_HISTORICAL_GZIP = 'historical-gzip';
const ARTIFACT_KIND_CONTENT_ADDRESSED = 'content-addressed';
const PROBLEM_UNSUPPORTED_DESCRIPTOR_SCHEMA_VERSION =
  'unsupported descriptor schemaVersion';
const PROBLEM_INVALID_DESCRIPTOR_KIND = 'invalid descriptor kind';
const PROBLEM_INVALID_DESCRIPTOR_HASH_ALGORITHM =
  'invalid descriptor hash algorithm';
const PROBLEM_INVALID_DESCRIPTOR_PAYLOAD_HASH =
  'invalid descriptor payload SHA-256';
const PROBLEM_INVALID_DESCRIPTOR_PAYLOAD_BYTES =
  'invalid descriptor payload byte count';
const PROBLEM_INVALID_DESCRIPTOR_CONTENT_ENCODING =
  'invalid descriptor content encoding';
const PROBLEM_NONCANONICAL_DESCRIPTOR_OBJECT_PATH =
  'descriptor object path is not canonical for payload hash';
const PROBLEM_INVALID_DESCRIPTOR_OBJECT_HASH =
  'invalid descriptor object storage SHA-256';
const PROBLEM_NONCANONICAL_DESCRIPTOR_BYTES =
  'descriptor bytes are not canonical';
const PROBLEM_OBJECT_STORAGE_HASH_MISMATCH =
  'content object storage SHA-256 does not match descriptor';
const PROBLEM_PAYLOAD_BYTE_COUNT_MISMATCH =
  'content object payload byte count does not match descriptor';
const PROBLEM_PAYLOAD_HASH_MISMATCH =
  'content object payload SHA-256 does not match descriptor';
const PROBLEM_INVALID_CHANGE_REF =
  'changeRef must use diff:<workspace-path>';
const WRITTEN_VERIFICATION_FAILURE_PREFIX =
  'written content-addressed artifact failed verification: ';
const EXISTING_MIGRATION_VERIFICATION_FAILURE_PREFIX =
  'existing migration descriptor failed verification: ';
export const CONTENT_ADDRESS_THRESHOLD_BYTES =
  DEFAULT_CONTENT_ADDRESS_THRESHOLD_BYTES;

function normalizePath(value) {
  return String(value).split(path.sep).join(NORMALIZED_PATH_SEPARATOR);
}

function hash(content) {
  return createHash(HASH_ALGORITHM).update(content).digest(HASH_ENCODING);
}

function workspacePath(root, relative) {
  const absolute = path.resolve(root, relative);
  const fromRoot = path.relative(root, absolute);
  if (!fromRoot || fromRoot.startsWith(PARENT_PATH_PREFIX) ||
    path.isAbsolute(fromRoot)) {
    throw new Error(`artifact path escapes workspace: ${relative}`);
  }
  return absolute;
}

function objectRelativePath(payloadSha256) {
  return `${OBJECT_ROOT}/${payloadSha256.slice(0, 2)}/` +
    `${payloadSha256}${OBJECT_SUFFIX}`;
}

export function contentObjectRelativePathForPayload(payloadSha256) {
  return objectRelativePath(payloadSha256);
}

function descriptorFor(payload, objectBytes) {
  const payloadSha256 = hash(payload);
  return {
    schemaVersion: DESCRIPTOR_SCHEMA_VERSION,
    kind: DESCRIPTOR_KIND,
    hashAlgorithm: HASH_ALGORITHM,
    payloadSha256,
    payloadBytes: payload.length,
    contentEncoding: CONTENT_ENCODING,
    objectPath: objectRelativePath(payloadSha256),
    objectStorageSha256: hash(objectBytes),
  };
}

export function canonicalContentAddressedDescriptorBytes(descriptor) {
  return Buffer.from(`${JSON.stringify(descriptor, null, 2)}\n`);
}

export function prepareContentAddressedChangeArtifact(relativeInlinePath, content) {
  const payload = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const objectBytes = gzipSync(payload);
  const descriptor = descriptorFor(payload, objectBytes);
  return {
    relativeInlinePath: normalizePath(relativeInlinePath),
    payload,
    payloadSha256: descriptor.payloadSha256,
    payloadBytes: descriptor.payloadBytes,
    objectPath: descriptor.objectPath,
    objectBytes,
    descriptor,
    descriptorPath: `${normalizePath(relativeInlinePath)}${DESCRIPTOR_SUFFIX}`,
    descriptorBytes: canonicalContentAddressedDescriptorBytes(descriptor),
  };
}

function validateDescriptor(root, descriptor) {
  const problems = [];
  if (descriptor?.schemaVersion !== DESCRIPTOR_SCHEMA_VERSION) {
    problems.push(PROBLEM_UNSUPPORTED_DESCRIPTOR_SCHEMA_VERSION);
  }
  if (descriptor?.kind !== DESCRIPTOR_KIND) {
    problems.push(PROBLEM_INVALID_DESCRIPTOR_KIND);
  }
  if (descriptor?.hashAlgorithm !== HASH_ALGORITHM) {
    problems.push(PROBLEM_INVALID_DESCRIPTOR_HASH_ALGORITHM);
  }
  if (!/^[0-9a-f]{64}$/u.test(String(descriptor?.payloadSha256 || ''))) {
    problems.push(PROBLEM_INVALID_DESCRIPTOR_PAYLOAD_HASH);
  }
  if (!Number.isInteger(descriptor?.payloadBytes) || descriptor.payloadBytes < 0) {
    problems.push(PROBLEM_INVALID_DESCRIPTOR_PAYLOAD_BYTES);
  }
  if (descriptor?.contentEncoding !== CONTENT_ENCODING) {
    problems.push(PROBLEM_INVALID_DESCRIPTOR_CONTENT_ENCODING);
  }
  const expectedObject = /^[0-9a-f]{64}$/u.test(
    String(descriptor?.payloadSha256 || '')) ?
    objectRelativePath(descriptor.payloadSha256) : null;
  if (descriptor?.objectPath !== expectedObject) {
    problems.push(PROBLEM_NONCANONICAL_DESCRIPTOR_OBJECT_PATH);
  }
  if (!/^[0-9a-f]{64}$/u.test(
    String(descriptor?.objectStorageSha256 || ''))) {
    problems.push(PROBLEM_INVALID_DESCRIPTOR_OBJECT_HASH);
  }
  if (typeof descriptor?.objectPath === 'string') {
    try {
      workspacePath(root, descriptor.objectPath);
    } catch (error) {
      problems.push(error.message);
    }
  }
  return problems;
}

function readDescriptor(root, descriptorPath) {
  const descriptorBytes = fs.readFileSync(descriptorPath);
  let descriptor;
  try {
    descriptor = JSON.parse(descriptorBytes.toString(TEXT_ENCODING));
  } catch (error) {
    return {
      valid: false,
      problems: [`descriptor JSON is unreadable: ${error.message}`],
      descriptorBytes,
    };
  }
  const problems = validateDescriptor(root, descriptor);
  if (!descriptorBytes.equals(canonicalContentAddressedDescriptorBytes(descriptor))) {
    problems.push(PROBLEM_NONCANONICAL_DESCRIPTOR_BYTES);
  }
  if (problems.length > 0) {
    return {valid: false, problems, descriptor, descriptorBytes};
  }
  const objectPath = workspacePath(root, descriptor.objectPath);
  if (!fs.existsSync(objectPath)) {
    return {
      valid: false,
      problems: [`content object is missing: ${descriptor.objectPath}`],
      descriptor,
      descriptorBytes,
      objectPath,
    };
  }
  const objectBytes = fs.readFileSync(objectPath);
  if (hash(objectBytes) !== descriptor.objectStorageSha256) {
    problems.push(PROBLEM_OBJECT_STORAGE_HASH_MISMATCH);
  }
  let payload;
  try {
    payload = gunzipSync(objectBytes);
  } catch (error) {
    return {
      valid: false,
      problems: [`content object gzip is unreadable: ${error.message}`],
      descriptor,
      descriptorBytes,
      objectPath,
      objectBytes,
    };
  }
  if (payload.length !== descriptor.payloadBytes) {
    problems.push(PROBLEM_PAYLOAD_BYTE_COUNT_MISMATCH);
  }
  if (hash(payload) !== descriptor.payloadSha256) {
    problems.push(PROBLEM_PAYLOAD_HASH_MISMATCH);
  }
  return {
    valid: problems.length === 0,
    problems,
    descriptor,
    descriptorBytes,
    objectPath,
    objectBytes,
    payload,
  };
}

export function requestedChangeArtifactPath(root, changeRef) {
  if (typeof changeRef !== 'string' || !changeRef.startsWith(CHANGE_REF_PREFIX)) {
    return null;
  }
  const rawPath = changeRef.slice(CHANGE_REF_PREFIX.length);
  if (!rawPath) return null;
  try {
    return workspacePath(root, rawPath);
  } catch {
    return null;
  }
}

export function resolvedChangeArtifactPath(root, changeRef) {
  const requestedPath = requestedChangeArtifactPath(root, changeRef);
  if (!requestedPath) return null;
  if (fs.existsSync(requestedPath)) return requestedPath;
  const descriptorSibling = `${requestedPath}${DESCRIPTOR_SUFFIX}`;
  if (fs.existsSync(descriptorSibling)) return descriptorSibling;
  const gzipSibling = `${requestedPath}${HISTORICAL_GZIP_SUFFIX}`;
  return fs.existsSync(gzipSibling) ? gzipSibling : requestedPath;
}

export function readChangeArtifact(root, changeRef) {
  const requestedPath = requestedChangeArtifactPath(root, changeRef);
  const artifactPath = resolvedChangeArtifactPath(root, changeRef);
  if (!requestedPath || !artifactPath) {
    return {
      valid: false,
      problems: [PROBLEM_INVALID_CHANGE_REF],
      requestedPath,
      artifactPath,
    };
  }
  if (!fs.existsSync(artifactPath)) {
    return {
      valid: false,
      problems: [`changeRef artifact does not exist: ${requestedPath}`],
      requestedPath,
      artifactPath,
    };
  }
  if (!artifactPath.endsWith(DESCRIPTOR_SUFFIX)) {
    const stored = fs.readFileSync(artifactPath);
    let payload = stored;
    if (artifactPath.endsWith(HISTORICAL_GZIP_SUFFIX)) {
      try {
        payload = gunzipSync(stored);
      } catch (error) {
        return {
          valid: false,
          problems: [`historical gzip artifact is unreadable: ${error.message}`],
          requestedPath,
          artifactPath,
        };
      }
    }
    return {
      valid: true,
      problems: [],
      kind: artifactPath.endsWith(HISTORICAL_GZIP_SUFFIX) ?
        ARTIFACT_KIND_HISTORICAL_GZIP : ARTIFACT_KIND_INLINE,
      requestedPath,
      artifactPath,
      payload,
      payloadSha256: hash(payload),
      payloadBytes: payload.length,
    };
  }
  const result = readDescriptor(root, artifactPath);
  return {
    ...result,
    kind: ARTIFACT_KIND_CONTENT_ADDRESSED,
    requestedPath,
    artifactPath,
    payloadSha256: result.payload ? hash(result.payload) : null,
    payloadBytes: result.payload?.length ?? null,
    descriptorSha256: result.descriptorBytes ? hash(result.descriptorBytes) : null,
    objectStorageSha256: result.objectBytes ? hash(result.objectBytes) : null,
  };
}

export function writeContentAddressedChangeArtifact(
  root,
  relativeInlinePath,
  content,
  options = {},
) {
  const payload = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const thresholdBytes = options.thresholdBytes ?? CONTENT_ADDRESS_THRESHOLD_BYTES;
  const inlinePath = workspacePath(root, relativeInlinePath);
  fs.mkdirSync(path.dirname(inlinePath), {recursive: true});
  if (payload.length < thresholdBytes) {
    fs.writeFileSync(inlinePath, payload);
    return {
      root,
      changeRef: `${CHANGE_REF_PREFIX}${normalizePath(relativeInlinePath)}`,
      kind: ARTIFACT_KIND_INLINE,
      artifactPath: inlinePath,
      objectCreated: false,
    };
  }
  const payloadSha256 = hash(payload);
  const objectPath = workspacePath(root, objectRelativePath(payloadSha256));
  fs.mkdirSync(path.dirname(objectPath), {recursive: true});
  let objectCreated = false;
  if (!fs.existsSync(objectPath)) {
    // Write-then-rename, because existsSync is a publication check as well as a
    // skip check: a concurrent Quest that observed a half-written object would read
    // short bytes and fail its own written-verification. rename(2) is atomic within
    // a filesystem, so the object is either absent or complete, never partial. The
    // path is content-addressed, so a concurrent writer produces identical bytes and
    // last-writer-wins is indistinguishable from first-writer-wins.
    const temporary = `${objectPath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, gzipSync(payload));
    fs.renameSync(temporary, objectPath);
    objectCreated = true;
  }
  const objectBytes = fs.readFileSync(objectPath);
  const descriptor = descriptorFor(payload, objectBytes);
  const descriptorPath = `${inlinePath}${DESCRIPTOR_SUFFIX}`;
  fs.writeFileSync(descriptorPath,
    canonicalContentAddressedDescriptorBytes(descriptor));
  const relativeDescriptor = normalizePath(path.relative(root, descriptorPath));
  const changeRef = `${CHANGE_REF_PREFIX}${relativeDescriptor}`;
  const verified = readChangeArtifact(root, changeRef);
  if (!verified.valid) {
    throw new Error(WRITTEN_VERIFICATION_FAILURE_PREFIX +
      verified.problems.join(PROBLEM_SEPARATOR));
  }
  return {
    root,
    changeRef,
    kind: ARTIFACT_KIND_CONTENT_ADDRESSED,
    artifactPath: descriptorPath,
    objectPath,
    objectCreated,
    descriptor,
  };
}

function descriptorReferencesObject(root, directory, objectPath, excludedPath) {
  if (!fs.existsSync(directory)) return false;
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (descriptorReferencesObject(
        root, filePath, objectPath, excludedPath)) return true;
      continue;
    }
    if (!entry.isFile() || !filePath.endsWith(DESCRIPTOR_SUFFIX) ||
      filePath === excludedPath) continue;
    try {
      const descriptor = JSON.parse(fs.readFileSync(filePath, TEXT_ENCODING));
      if (workspacePath(root, descriptor.objectPath) ===
        objectPath) return true;
    } catch {
      // Invalid descriptors do not own content objects.
    }
  }
  return false;
}

export function cleanupWrittenChangeArtifact(written) {
  if (!written?.artifactPath) return;
  fs.rmSync(written.artifactPath, {force: true});
  if (!written.objectCreated || !written.objectPath || !written.root) return;
  const changesDir = path.resolve(written.root, 'solve/changes');
  if (!descriptorReferencesObject(
    written.root,
    changesDir,
    written.objectPath,
    written.artifactPath,
  )) {
    fs.rmSync(written.objectPath, {force: true});
  }
}

export function migrateInlineChangeArtifact(root, relativeInlinePath) {
  const inlinePath = workspacePath(root, relativeInlinePath);
  if (!fs.existsSync(inlinePath)) {
    const descriptorPath = `${inlinePath}${DESCRIPTOR_SUFFIX}`;
    if (fs.existsSync(descriptorPath)) {
      const artifact = readChangeArtifact(root, `diff:${normalizePath(relativeInlinePath)}`);
      if (!artifact.valid ||
        artifact.kind !== ARTIFACT_KIND_CONTENT_ADDRESSED) {
        throw new Error(EXISTING_MIGRATION_VERIFICATION_FAILURE_PREFIX +
          artifact.problems.join(PROBLEM_SEPARATOR));
      }
      return {
        migrated: false,
        alreadyMigrated: true,
        artifactPath: artifact.artifactPath,
        objectPath: artifact.objectPath,
        objectCreated: false,
      };
    }
    throw new Error(`migration source is missing: ${relativeInlinePath}`);
  }
  const payload = fs.readFileSync(inlinePath);
  const written = writeContentAddressedChangeArtifact(
    root,
    relativeInlinePath,
    payload,
    {thresholdBytes: 0},
  );
  fs.rmSync(inlinePath);
  return {...written, migrated: true, alreadyMigrated: false};
}

export function contentObjectRoot(root) {
  return path.resolve(root, OBJECT_ROOT);
}
