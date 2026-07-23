import {createHash, randomUUID} from 'node:crypto';
import {
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const SHA256_PREFIX_LENGTH = 7;
const CACHE_METADATA_SUFFIX = '.json';
const CACHE_BLOB_SUFFIX = '.wasm';
const CACHE_ENCODING = 'utf8';
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
const FILE_NOT_FOUND_CODE = 'ENOENT';
const CACHE_ERROR_CODE = Object.freeze({
  DIGEST_MISMATCH: 'digest_mismatch',
  SOURCE_READ_FAILED: 'source_read_failed',
});
const CACHE_ERROR_MESSAGE = Object.freeze({
  ARTIFACT_IDENTITY_MISMATCH:
    'Component cache Artifact identity does not match',
  DESCRIPTOR_INVALID: 'Component cache descriptor is invalid',
  METADATA_INVALID: 'Component cache metadata is invalid',
  PAYLOAD_DIGEST_MISMATCH:
    'Component cache payload digest does not match its descriptor',
  PAYLOAD_MISSING: 'Component cache payload is missing',
  PAYLOAD_SIZE_INVALID:
    'Component cache payload is outside its size bound',
});

class InstallableComponentCacheError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function cacheFailure(code, message) {
  throw new InstallableComponentCacheError(code, message);
}

function sha256(bytes) {
  return `${HASH_ALGORITHM}:${createHash(HASH_ALGORITHM)
    .update(bytes)
    .digest(HASH_ENCODING)}`;
}

function validateDescriptor(descriptor) {
  if (!descriptor || typeof descriptor !== 'object' ||
      !SHA256_PATTERN.test(descriptor.digest) ||
      !Number.isSafeInteger(descriptor.size) || descriptor.size < 0) {
    cacheFailure(
      CACHE_ERROR_CODE.SOURCE_READ_FAILED,
      CACHE_ERROR_MESSAGE.DESCRIPTOR_INVALID,
    );
  }
  return descriptor;
}

class InstallableComponentCache {
  static fromResolverOptions(options, maximumBytes) {
    return new InstallableComponentCache({
      directory: options.componentCacheDir || null,
      maximumBytes,
    });
  }

  constructor(options = {}) {
    this.directory = options.directory || null;
    this.maximumBytes = options.maximumBytes;
  }

  cachePath(digestValue, suffix) {
    return path.join(
      this.directory,
      `${digestValue.slice(SHA256_PREFIX_LENGTH)}${suffix}`,
    );
  }

  async writeFile(target, bytes) {
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, bytes);
    try {
      await rename(temporary, target);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }

  validateBytes(descriptor, bytes) {
    if (bytes.length !== descriptor.size ||
        bytes.length > this.maximumBytes ||
        sha256(bytes) !== descriptor.digest) {
      cacheFailure(
        CACHE_ERROR_CODE.DIGEST_MISMATCH,
        CACHE_ERROR_MESSAGE.PAYLOAD_DIGEST_MISMATCH,
      );
    }
  }

  async persist(artifactDigest, payloadDescriptor, bytes) {
    if (!this.directory) return;
    const descriptor = validateDescriptor(payloadDescriptor);
    this.validateBytes(descriptor, bytes);
    await mkdir(this.directory, {recursive: true});
    await this.writeFile(
      this.cachePath(descriptor.digest, CACHE_BLOB_SUFFIX),
      bytes,
    );
    await this.writeFile(
      this.cachePath(artifactDigest, CACHE_METADATA_SUFFIX),
      Buffer.from(JSON.stringify({artifactDigest, payloadDescriptor})),
    );
  }

  async register(options) {
    if (!options.payloadDescriptor) return;
    const resolved = {
      location: options.location,
      payloadDescriptor: options.payloadDescriptor,
      sourceKind: options.sourceKind,
    };
    options.resolutions.set(options.artifactDigest, resolved);
    if (!this.directory) return;
    await this.persist(
      options.artifactDigest,
      options.payloadDescriptor,
      await options.readBytes(resolved),
    );
  }

  async readWithinBound(file) {
    let metadata;
    try {
      metadata = await stat(file);
    } catch (error) {
      if (error.code === FILE_NOT_FOUND_CODE) return null;
      throw error;
    }
    if (!metadata.isFile() || metadata.size > this.maximumBytes) {
      cacheFailure(
        CACHE_ERROR_CODE.SOURCE_READ_FAILED,
        CACHE_ERROR_MESSAGE.PAYLOAD_SIZE_INVALID,
      );
    }
    return readFile(file);
  }

  async load(artifactDigest) {
    if (!this.directory) return null;
    const metadataBytes = await this.readWithinBound(
      this.cachePath(artifactDigest, CACHE_METADATA_SUFFIX),
    );
    if (!metadataBytes) return null;
    let metadata;
    try {
      metadata = JSON.parse(metadataBytes.toString(CACHE_ENCODING));
    } catch {
      cacheFailure(
        CACHE_ERROR_CODE.SOURCE_READ_FAILED,
        CACHE_ERROR_MESSAGE.METADATA_INVALID,
      );
    }
    if (metadata?.artifactDigest !== artifactDigest) {
      cacheFailure(
        CACHE_ERROR_CODE.DIGEST_MISMATCH,
        CACHE_ERROR_MESSAGE.ARTIFACT_IDENTITY_MISMATCH,
      );
    }
    const descriptor = validateDescriptor(metadata.payloadDescriptor);
    const bytes = await this.readWithinBound(
      this.cachePath(descriptor.digest, CACHE_BLOB_SUFFIX),
    );
    if (!bytes) {
      cacheFailure(
        CACHE_ERROR_CODE.SOURCE_READ_FAILED,
        CACHE_ERROR_MESSAGE.PAYLOAD_MISSING,
      );
    }
    this.validateBytes(descriptor, bytes);
    return {bytes, payloadDigest: descriptor.digest};
  }
}

export {InstallableComponentCache};
