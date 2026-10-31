import {createHash} from 'node:crypto';

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';
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
const POPULATION_SKIPPED_LOG = 'component cache population skipped';

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
      maximumBytes,
    });
  }

  constructor(options = {}) {
    this.maximumBytes = options.maximumBytes;
    this.memoryCache = new Map();
  }

  validateBytes(descriptor, bytes) {
    if (bytes.length !== descriptor.size ||
        (this.maximumBytes && bytes.length > this.maximumBytes) ||
        sha256(bytes) !== descriptor.digest) {
      cacheFailure(
        CACHE_ERROR_CODE.DIGEST_MISMATCH,
        CACHE_ERROR_MESSAGE.PAYLOAD_DIGEST_MISMATCH,
      );
    }
  }

  async persist(artifactDigest, payloadDescriptor, bytes) {
    const descriptor = validateDescriptor(payloadDescriptor);
    this.validateBytes(descriptor, bytes);
    this.memoryCache.set(artifactDigest, {
      artifactDigest,
      bytes: Buffer.from(bytes),
      payloadDescriptor: descriptor,
    });
  }

  async register(options) {
    if (!options.payloadDescriptor) return;
    const resolved = {
      location: options.location,
      payloadDescriptor: options.payloadDescriptor,
      sourceKind: options.sourceKind,
    };
    options.resolutions.set(options.artifactDigest, resolved);
    if (typeof options.readBytes === 'function') {
      try {
        const bytes = await options.readBytes(resolved);
        if (bytes) {
          await this.persist(
            options.artifactDigest,
            options.payloadDescriptor,
            bytes,
          );
        }
      } catch (error) {
        options.logger?.debug?.(
          POPULATION_SKIPPED_LOG,
          {artifactDigest: options.artifactDigest, error},
        );
      }
    }
  }

  async load(artifactDigest) {
    const cached = this.memoryCache.get(artifactDigest);
    if (!cached) return null;
    return {
      bytes: cached.bytes,
      payloadDigest: cached.payloadDescriptor.digest,
    };
  }
}

export {InstallableComponentCache};
