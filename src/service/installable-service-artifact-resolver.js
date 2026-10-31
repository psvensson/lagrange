/**
 * Shared artifact acquisition and verification owner for installable services.
 *
 * Remote registries and local OCI image layouts differ only at acquisition.
 * Digest, manifest/media, and detached-signature policy checks are shared.
 */

import {createHash, createPublicKey, verify as verifySignature} from 'node:crypto';

import {RUNTIME_KIND} from '../constants/runtime.js';
import {
  EXTERNAL_SERVICE_MEDIA_TYPE,
  validateExternalServiceManifest,
} from './external-service-manifest.js';
import {
  OCI_IMAGE_MANIFEST_MEDIA_TYPE,
} from './oci-image-layout-contract.js';
import {InstallableComponentCache} from './installable-component-cache.js';

const INSTALLABLE_ARTIFACT_SOURCE_KIND = Object.freeze({
  LOCAL_OCI_LAYOUT: 'local_oci_layout',
  REMOTE_OCI: 'remote_oci',
  SEALED_STORE: 'sealed_store',
});

const ARTIFACT_SIGNATURE_POLICY_MODE = Object.freeze({
  DISABLED: 'disabled',
  REQUIRED: 'required',
  VERIFY_IF_PRESENT: 'verify_if_present',
});

const INSTALLABLE_ARTIFACT_ERROR_CODE = Object.freeze({
  DESCRIPTOR_NOT_FOUND: 'descriptor_not_found',
  DESCRIPTOR_SIZE_MISMATCH: 'descriptor_size_mismatch',
  DESCRIPTOR_TOO_LARGE: 'descriptor_too_large',
  DIGEST_MISMATCH: 'digest_mismatch',
  MANIFEST_INVALID: 'manifest_invalid',
  MEDIA_TYPE_MISMATCH: 'media_type_mismatch',
  OCI_LAYOUT_INVALID: 'oci_layout_invalid',
  OCI_MANIFEST_INVALID: 'oci_manifest_invalid',
  SIGNATURE_INVALID: 'signature_invalid',
  SIGNATURE_POLICY_INVALID: 'signature_policy_invalid',
  SIGNATURE_REQUIRED: 'signature_required',
  SIGNATURE_UNTRUSTED: 'signature_untrusted',
  SOURCE_READ_FAILED: 'source_read_failed',
  SOURCE_RESULT_INVALID: 'source_result_invalid',
  SOURCE_UNSUPPORTED: 'source_unsupported',
});

const SIGNATURE_STATUS = Object.freeze({
  UNSIGNED_ALLOWED: 'unsigned_allowed',
  VERIFICATION_DISABLED: 'verification_disabled',
  VERIFIED: 'verified',
});

const DEFAULT_MAX_DESCRIPTOR_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_COMPONENT_BYTES = 256 * 1024 * 1024;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const ED25519_SIGNATURE_BYTES = 64;
const SIGNATURE_DOMAIN = 'lagrange.installable-service-artifact.v1';

const ARTIFACT_RESOLUTION_STATUS = Object.freeze({
  REJECTED: 'rejected',
  RESOLVED: 'resolved',
});

const ARTIFACT_DATA_ENCODING = Object.freeze({
  BASE64: 'base64',
  HEX: 'hex',
  UTF8: 'utf8',
});

const ARTIFACT_SIGNATURE_ALGORITHM = Object.freeze({
  ED25519: 'ed25519',
});

const OCI_LAYOUT_ENTRY = Object.freeze({
  BLOBS: 'blobs',
  INDEX: 'index.json',
  LAYOUT: 'oci-layout',
  SHA256: 'sha256',
});

const INSTALLABLE_ARTIFACT_PATH = Object.freeze({
  DESCRIPTOR: '/artifact/descriptor',
  DESCRIPTOR_CONFIG: '/artifact/descriptor/config',
  DESCRIPTOR_DIGEST: '/artifact/descriptor/digest',
  DESCRIPTOR_MEDIA_TYPE: '/artifact/descriptor/mediaType',
  DESCRIPTOR_SIZE: '/artifact/descriptor/size',
  MANIFEST_ARTIFACT_MEDIA_TYPE: '/manifest/artifact/media_type',
  MANIFEST_ARTIFACT_SIGNATURE: '/manifest/artifact/signature',
  MANIFEST_ARTIFACT_SIGNATURE_KEY_ID: '/manifest/artifact/signature/key_id',
  MANIFEST_ARTIFACT_SIGNATURE_VALUE: '/manifest/artifact/signature/value',
  SIGNATURE_POLICY_MODE: '/signaturePolicy/mode',
  SIGNATURE_POLICY_TRUSTED_KEYS: '/signaturePolicy/trusted_keys',
  SOURCE: '/source',
  SOURCE_BLOBS: '/source/blobs',
  SOURCE_BYTES: '/source/bytes',
  SOURCE_DESCRIPTOR: '/source/descriptor',
  SOURCE_INDEX: '/source/index.json',
  SOURCE_INDEX_MANIFESTS: '/source/index.json/manifests',
  SOURCE_KIND: '/source/kind',
  SOURCE_LAYOUT: '/source/oci-layout',
  SOURCE_LAYOUT_VERSION: '/source/oci-layout/imageLayoutVersion',
  SOURCE_LOCATION: '/source/location',
});

const INSTALLABLE_ARTIFACT_MESSAGE = Object.freeze({
  COMPONENT_PAYLOAD_NOT_FOUND: 'no component payload found for artifact digest',
  CONTAINER_MEDIA_TYPE_MISMATCH:
    'container artifact media type does not match the OCI descriptor',
  DESCRIPTOR_DIGEST_MISMATCH:
    'OCI descriptor digest does not match the manifest pin',
  DESCRIPTOR_INVALID: 'OCI descriptor is invalid',
  DESCRIPTOR_MEDIA_TYPE_MISMATCH:
    'OCI descriptor media type does not match an image manifest',
  DESCRIPTOR_SIZE_MISMATCH: 'OCI descriptor size does not match its bytes',
  DESCRIPTOR_TOO_LARGE: 'OCI descriptor exceeds the configured size bound',
  FILE_NOT_REGULAR: 'artifact source path is not a file',
  FILE_TOO_LARGE: 'artifact source file exceeds its size bound',
  FILE_UNREADABLE: 'artifact source file could not be read',
  INDEX_DESCRIPTOR_NOT_UNIQUE:
    'OCI image layout must contain exactly one pinned descriptor',
  INDEX_INVALID: 'OCI image layout index shape is invalid',
  LAYOUT_METADATA_INVALID: 'OCI layout metadata is not valid JSON',
  LAYOUT_PATH_REQUIRED: 'local OCI layout path is required',
  LAYOUT_VERSION_UNSUPPORTED: 'OCI image layout version is unsupported',
  MANIFEST_DESCRIPTOR_INVALID: 'OCI manifest descriptor is not valid JSON',
  MANIFEST_INVALID: 'external service manifest is invalid',
  MANIFEST_SHAPE_INVALID: 'OCI image manifest shape is invalid',
  MAX_DESCRIPTOR_BYTES_INVALID:
    'maxDescriptorBytes must be a positive safe integer',
  MAX_COMPONENT_BYTES_INVALID:
    'maxComponentBytes must be a positive safe integer',
  REMOTE_ACQUISITION_FAILED: 'remote OCI descriptor acquisition failed',
  REMOTE_PROVIDER_INVALID: 'remote OCI provider returned an invalid result',
  REMOTE_PROVIDER_MISSING: 'remote OCI provider is not configured',
  SIGNATURE_INVALID: 'artifact signature metadata is invalid',
  SIGNATURE_KEY_INVALID: 'trusted artifact signature key is invalid',
  SIGNATURE_KEY_UNTRUSTED: 'artifact signature key is not trusted by policy',
  SIGNATURE_POLICY_REQUIRED:
    'an explicit supported signature policy mode is required',
  SIGNATURE_REQUIRED: 'artifact signature is required by policy',
  SIGNATURE_VALUE_INVALID: 'artifact signature value is invalid',
  SIGNATURE_VERIFICATION_FAILED: 'artifact signature verification failed',
  SOURCE_BYTES_REQUIRED: 'artifact source must return descriptor bytes',
  SOURCE_KIND_UNSUPPORTED: 'artifact source kind is unsupported',
  SOURCE_UNREADABLE: 'artifact source could not be read',
  WASM_LAYER_INVALID:
    'WASM artifact must contain exactly one application/wasm layer',
});

const LOCAL_STR_SEALED_STORE_LOCATION = 'cluster://artifact_payloads';

class ArtifactResolutionFailure extends Error {
  constructor(code, pathValue, message) {
    super(message);
    this.code = code;
    this.pathValue = pathValue;
  }
}

function fail(code, pathValue, message) {
  throw new ArtifactResolutionFailure(code, pathValue, message);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function rejected(error) {
  const known = error instanceof ArtifactResolutionFailure;
  return deepFreeze({
    status: ARTIFACT_RESOLUTION_STATUS.REJECTED,
    errors: [{
      code: known ? error.code :
        INSTALLABLE_ARTIFACT_ERROR_CODE.SOURCE_READ_FAILED,
      path: known ? error.pathValue : INSTALLABLE_ARTIFACT_PATH.SOURCE,
      message: known ? error.message :
        INSTALLABLE_ARTIFACT_MESSAGE.SOURCE_UNREADABLE,
    }],
  });
}

function buildArtifactSignaturePayload(artifactDigest) {
  return Buffer.from(
    `${SIGNATURE_DOMAIN}\n${artifactDigest}`,
    ARTIFACT_DATA_ENCODING.UTF8,
  );
}

function sha256(bytes) {
  return `sha256:${createHash(OCI_LAYOUT_ENTRY.SHA256)
    .update(bytes)
    .digest(ARTIFACT_DATA_ENCODING.HEX)}`;
}

function validateSignaturePolicy(signaturePolicy) {
  const mode = signaturePolicy?.mode;
  if (!signaturePolicy || typeof signaturePolicy !== 'object' ||
      !Object.values(ARTIFACT_SIGNATURE_POLICY_MODE).includes(mode)) {
    fail(
      INSTALLABLE_ARTIFACT_ERROR_CODE.SIGNATURE_POLICY_INVALID,
      INSTALLABLE_ARTIFACT_PATH.SIGNATURE_POLICY_MODE,
      INSTALLABLE_ARTIFACT_MESSAGE.SIGNATURE_POLICY_REQUIRED,
    );
  }
  return signaturePolicy;
}

function decodeEd25519Signature(value) {
  if (typeof value !== 'string' || !BASE64_PATTERN.test(value)) return null;
  const decoded = Buffer.from(value, ARTIFACT_DATA_ENCODING.BASE64);
  if (decoded.length !== ED25519_SIGNATURE_BYTES ||
      decoded.toString(ARTIFACT_DATA_ENCODING.BASE64) !== value) {
    return null;
  }
  return decoded;
}

function validatedSignatureMetadata(signature) {
  if (typeof signature !== 'object' ||
      signature.algorithm !== ARTIFACT_SIGNATURE_ALGORITHM.ED25519 ||
      typeof signature.key_id !== 'string' || signature.key_id.length === 0) {
    fail(
      INSTALLABLE_ARTIFACT_ERROR_CODE.SIGNATURE_INVALID,
      INSTALLABLE_ARTIFACT_PATH.MANIFEST_ARTIFACT_SIGNATURE,
      INSTALLABLE_ARTIFACT_MESSAGE.SIGNATURE_INVALID,
    );
  }
  const signatureBytes = decodeEd25519Signature(signature.value);
  if (!signatureBytes) {
    fail(
      INSTALLABLE_ARTIFACT_ERROR_CODE.SIGNATURE_INVALID,
      INSTALLABLE_ARTIFACT_PATH.MANIFEST_ARTIFACT_SIGNATURE_VALUE,
      INSTALLABLE_ARTIFACT_MESSAGE.SIGNATURE_VALUE_INVALID,
    );
  }
  return {keyId: signature.key_id, signatureBytes};
}

function trustedPublicKey(signaturePolicy, keyId) {
  const trustedKey = signaturePolicy.trusted_keys?.[keyId];
  if (typeof trustedKey !== 'string' && !Buffer.isBuffer(trustedKey)) {
    fail(
      INSTALLABLE_ARTIFACT_ERROR_CODE.SIGNATURE_UNTRUSTED,
      INSTALLABLE_ARTIFACT_PATH.MANIFEST_ARTIFACT_SIGNATURE_KEY_ID,
      INSTALLABLE_ARTIFACT_MESSAGE.SIGNATURE_KEY_UNTRUSTED,
    );
  }
  try {
    return createPublicKey(trustedKey);
  } catch (_error) {
    fail(
      INSTALLABLE_ARTIFACT_ERROR_CODE.SIGNATURE_POLICY_INVALID,
      INSTALLABLE_ARTIFACT_PATH.SIGNATURE_POLICY_TRUSTED_KEYS,
      INSTALLABLE_ARTIFACT_MESSAGE.SIGNATURE_KEY_INVALID,
    );
  }
}

function verifyArtifactSignature(artifact, signaturePolicy) {
  const mode = signaturePolicy.mode;
  const signature = artifact.signature;
  switch (mode) {
  case ARTIFACT_SIGNATURE_POLICY_MODE.DISABLED:
    return {status: SIGNATURE_STATUS.VERIFICATION_DISABLED, keyId: null};
  case ARTIFACT_SIGNATURE_POLICY_MODE.REQUIRED:
    if (!signature) {
      fail(
        INSTALLABLE_ARTIFACT_ERROR_CODE.SIGNATURE_REQUIRED,
        INSTALLABLE_ARTIFACT_PATH.MANIFEST_ARTIFACT_SIGNATURE,
        INSTALLABLE_ARTIFACT_MESSAGE.SIGNATURE_REQUIRED,
      );
    }
    break;
  case ARTIFACT_SIGNATURE_POLICY_MODE.VERIFY_IF_PRESENT:
    if (!signature) {
      return {status: SIGNATURE_STATUS.UNSIGNED_ALLOWED, keyId: null};
    }
    break;
  default:
    fail(
      INSTALLABLE_ARTIFACT_ERROR_CODE.SIGNATURE_POLICY_INVALID,
      INSTALLABLE_ARTIFACT_PATH.SIGNATURE_POLICY_MODE,
      INSTALLABLE_ARTIFACT_MESSAGE.SIGNATURE_POLICY_REQUIRED,
    );
  }
  const {keyId, signatureBytes} = validatedSignatureMetadata(signature);
  const publicKey = trustedPublicKey(signaturePolicy, keyId);
  if (!verifySignature(
    null,
    buildArtifactSignaturePayload(artifact.digest),
    publicKey,
    signatureBytes,
  )) {
    fail(
      INSTALLABLE_ARTIFACT_ERROR_CODE.SIGNATURE_INVALID,
      INSTALLABLE_ARTIFACT_PATH.MANIFEST_ARTIFACT_SIGNATURE_VALUE,
      INSTALLABLE_ARTIFACT_MESSAGE.SIGNATURE_VERIFICATION_FAILED,
    );
  }
  return {status: SIGNATURE_STATUS.VERIFIED, keyId};
}

function validateOciDescriptor(descriptor, pathValue) {
  if (!descriptor || typeof descriptor !== 'object' ||
      !SHA256_PATTERN.test(descriptor.digest) ||
      typeof descriptor.mediaType !== 'string' ||
      !Number.isSafeInteger(descriptor.size) || descriptor.size < 0) {
    fail(
      INSTALLABLE_ARTIFACT_ERROR_CODE.SOURCE_RESULT_INVALID,
      pathValue,
      INSTALLABLE_ARTIFACT_MESSAGE.DESCRIPTOR_INVALID,
    );
  }
  return descriptor;
}

function decodeOciManifest(bytes) {
  try {
    return JSON.parse(bytes.toString(ARTIFACT_DATA_ENCODING.UTF8));
  } catch (_error) {
    fail(
      INSTALLABLE_ARTIFACT_ERROR_CODE.OCI_MANIFEST_INVALID,
      INSTALLABLE_ARTIFACT_PATH.DESCRIPTOR,
      INSTALLABLE_ARTIFACT_MESSAGE.MANIFEST_DESCRIPTOR_INVALID,
    );
  }
}

function validateOciManifestShape(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) ||
      manifest.schemaVersion !== 2 ||
      !manifest.config || typeof manifest.config !== 'object' ||
      !Array.isArray(manifest.layers)) {
    fail(
      INSTALLABLE_ARTIFACT_ERROR_CODE.OCI_MANIFEST_INVALID,
      INSTALLABLE_ARTIFACT_PATH.DESCRIPTOR,
      INSTALLABLE_ARTIFACT_MESSAGE.MANIFEST_SHAPE_INVALID,
    );
  }
  validateOciDescriptor(
    manifest.config,
    INSTALLABLE_ARTIFACT_PATH.DESCRIPTOR_CONFIG,
  );
  for (const [index, layer] of manifest.layers.entries()) {
    validateOciDescriptor(layer, `/artifact/descriptor/layers/${index}`);
  }
}

function validateOciManifestMediaType(manifest, descriptor) {
  if (descriptor.mediaType !== OCI_IMAGE_MANIFEST_MEDIA_TYPE ||
      (manifest.mediaType !== undefined &&
       manifest.mediaType !== descriptor.mediaType)) {
    fail(
      INSTALLABLE_ARTIFACT_ERROR_CODE.MEDIA_TYPE_MISMATCH,
      INSTALLABLE_ARTIFACT_PATH.DESCRIPTOR_MEDIA_TYPE,
      INSTALLABLE_ARTIFACT_MESSAGE.DESCRIPTOR_MEDIA_TYPE_MISMATCH,
    );
  }
}

function parseOciManifest(bytes, descriptor) {
  const manifest = decodeOciManifest(bytes);
  validateOciManifestShape(manifest);
  validateOciManifestMediaType(manifest, descriptor);
  return manifest;
}

function resolvePayload(manifest, ociManifest, descriptor) {
  if (manifest.runtime.kind === RUNTIME_KIND.OCI_CONTAINER) {
    if (manifest.artifact.media_type !== descriptor.mediaType) {
      fail(
        INSTALLABLE_ARTIFACT_ERROR_CODE.MEDIA_TYPE_MISMATCH,
        INSTALLABLE_ARTIFACT_PATH.MANIFEST_ARTIFACT_MEDIA_TYPE,
        INSTALLABLE_ARTIFACT_MESSAGE.CONTAINER_MEDIA_TYPE_MISMATCH,
      );
    }
    return {payloadMediaType: descriptor.mediaType, payloadDescriptor: null};
  }
  const wasmLayers = ociManifest.layers.filter((layer) =>
    layer.mediaType === EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT);
  if (manifest.runtime.kind !== RUNTIME_KIND.WASM_COMPONENT ||
      manifest.artifact.media_type !== EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT ||
      wasmLayers.length !== 1) {
    fail(
      INSTALLABLE_ARTIFACT_ERROR_CODE.MEDIA_TYPE_MISMATCH,
      INSTALLABLE_ARTIFACT_PATH.MANIFEST_ARTIFACT_MEDIA_TYPE,
      INSTALLABLE_ARTIFACT_MESSAGE.WASM_LAYER_INVALID,
    );
  }
  return {
    payloadMediaType: EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT,
    payloadDescriptor: {...wasmLayers[0]},
  };
}

class InstallableServiceArtifactResolver {
  constructor(options = {}) {
    this.remoteProvider = options.remoteProvider || null;
    this.maxDescriptorBytes = options.maxDescriptorBytes ||
      DEFAULT_MAX_DESCRIPTOR_BYTES;
    this.maxComponentBytes = options.maxComponentBytes ||
      DEFAULT_MAX_COMPONENT_BYTES;
    this.componentCache = InstallableComponentCache.fromResolverOptions(
      options, this.maxComponentBytes);
    this.resolvedComponents = new Map();
    if (!Number.isSafeInteger(this.maxDescriptorBytes) ||
        this.maxDescriptorBytes <= 0) {
      throw new TypeError(
        INSTALLABLE_ARTIFACT_MESSAGE.MAX_DESCRIPTOR_BYTES_INVALID,
      );
    }
    if (!Number.isSafeInteger(this.maxComponentBytes) ||
        this.maxComponentBytes <= 0) {
      throw new TypeError(
        INSTALLABLE_ARTIFACT_MESSAGE.MAX_COMPONENT_BYTES_INVALID,
      );
    }
  }

  async resolve(request = {}) {
    try {
      if (request.source) {
        fail(
          INSTALLABLE_ARTIFACT_ERROR_CODE.SOURCE_UNSUPPORTED,
          INSTALLABLE_ARTIFACT_PATH.SOURCE_KIND,
          `artifact source kind '${request.source.kind}' is retired; deployment consumes registered immutable identities and sealed payloads only`,
        );
      }
      const manifestResult = validateExternalServiceManifest(request.manifest);
      if (!manifestResult.valid) {
        const first = manifestResult.errors[0];
        fail(
          INSTALLABLE_ARTIFACT_ERROR_CODE.MANIFEST_INVALID,
          `/manifest${first?.path || ''}`,
          INSTALLABLE_ARTIFACT_MESSAGE.MANIFEST_INVALID,
        );
      }
      const manifest = manifestResult.manifest;
      const signaturePolicy = validateSignaturePolicy(request.signaturePolicy);
      const signature = verifyArtifactSignature(
        manifest.artifact,
        signaturePolicy,
      );
      let payloadDescriptor = null;
      let descriptor = null;
      let payloadMediaType = manifest.artifact.media_type;
      if (request.sealedPayload) {
        payloadDescriptor = {
          digest: request.sealedPayload.payloadDigest,
          mediaType: request.sealedPayload.mediaType,
          size: request.sealedPayload.totalSize,
        };
        descriptor = {
          digest: manifest.artifact.digest,
          mediaType: OCI_IMAGE_MANIFEST_MEDIA_TYPE,
          size: request.sealedPayload.totalSize,
        };
        payloadMediaType = request.sealedPayload.mediaType;
      } else if (request.descriptorBytes && request.descriptor) {
        descriptor = validateOciDescriptor(
          request.descriptor,
          INSTALLABLE_ARTIFACT_PATH.SOURCE_DESCRIPTOR,
        );
        const verified = this.verifyDescriptor(manifest, {
          bytes: request.descriptorBytes,
          descriptor,
        });
        payloadDescriptor = verified.payloadDescriptor;
        payloadMediaType = verified.payloadMediaType;
      } else {
        const size = manifest.artifact.size_bytes ?? 0;
        payloadDescriptor = {
          digest: manifest.artifact.digest,
          mediaType: payloadMediaType,
          size,
        };
        descriptor = {
          digest: manifest.artifact.digest,
          mediaType: OCI_IMAGE_MANIFEST_MEDIA_TYPE,
          size,
        };
      }
      return deepFreeze({
        status: ARTIFACT_RESOLUTION_STATUS.RESOLVED,
        artifact: {
          sourceKind: INSTALLABLE_ARTIFACT_SOURCE_KIND.SEALED_STORE,
          location: LOCAL_STR_SEALED_STORE_LOCATION,
          digest: manifest.artifact.digest,
          descriptorMediaType: descriptor.mediaType,
          payloadMediaType,
          descriptor: {...descriptor},
          payloadDescriptor,
          signature,
        },
      });
    } catch (error) {
      return rejected(error);
    }
  }

  async acquire(_manifest, _source) {
    fail(
      INSTALLABLE_ARTIFACT_ERROR_CODE.SOURCE_UNSUPPORTED,
      INSTALLABLE_ARTIFACT_PATH.SOURCE_KIND,
      INSTALLABLE_ARTIFACT_MESSAGE.SOURCE_KIND_UNSUPPORTED,
    );
  }

  async loadComponentPayload(request = {}) {
    const manifestResult = validateExternalServiceManifest(request.manifest);
    if (!manifestResult.valid) {
      throw new ArtifactResolutionFailure(
        INSTALLABLE_ARTIFACT_ERROR_CODE.MANIFEST_INVALID,
        INSTALLABLE_ARTIFACT_PATH.SOURCE,
        INSTALLABLE_ARTIFACT_MESSAGE.MANIFEST_INVALID,
      );
    }
    const manifest = manifestResult.manifest;
    if (manifest.runtime.kind !== RUNTIME_KIND.WASM_COMPONENT ||
        request.artifactDigest !== manifest.artifact.digest) {
      throw new ArtifactResolutionFailure(
        INSTALLABLE_ARTIFACT_ERROR_CODE.DIGEST_MISMATCH,
        INSTALLABLE_ARTIFACT_PATH.DESCRIPTOR_DIGEST,
        INSTALLABLE_ARTIFACT_MESSAGE.DESCRIPTOR_DIGEST_MISMATCH,
      );
    }
    const resolved = this.resolvedComponents.get(request.artifactDigest);
    if (resolved?.bytes) {
      return {
        bytes: resolved.bytes,
        payloadDigest: resolved.payloadDescriptor.digest,
      };
    }
    const cached = await this.componentCache.load(request.artifactDigest);
    if (cached) return cached;
    throw new ArtifactResolutionFailure(
      INSTALLABLE_ARTIFACT_ERROR_CODE.DESCRIPTOR_NOT_FOUND,
      INSTALLABLE_ARTIFACT_PATH.DESCRIPTOR,
      INSTALLABLE_ARTIFACT_MESSAGE.COMPONENT_PAYLOAD_NOT_FOUND,
    );
  }

  verifyDescriptor(manifest, acquisition) {
    const {bytes, descriptor} = acquisition;
    if (bytes.length > this.maxDescriptorBytes) {
      fail(
        INSTALLABLE_ARTIFACT_ERROR_CODE.DESCRIPTOR_TOO_LARGE,
        INSTALLABLE_ARTIFACT_PATH.DESCRIPTOR,
        INSTALLABLE_ARTIFACT_MESSAGE.DESCRIPTOR_TOO_LARGE,
      );
    }
    if (descriptor.size !== bytes.length) {
      fail(
        INSTALLABLE_ARTIFACT_ERROR_CODE.DESCRIPTOR_SIZE_MISMATCH,
        INSTALLABLE_ARTIFACT_PATH.DESCRIPTOR_SIZE,
        INSTALLABLE_ARTIFACT_MESSAGE.DESCRIPTOR_SIZE_MISMATCH,
      );
    }
    const computedDigest = sha256(bytes);
    if (descriptor.digest !== manifest.artifact.digest ||
        computedDigest !== manifest.artifact.digest) {
      fail(
        INSTALLABLE_ARTIFACT_ERROR_CODE.DIGEST_MISMATCH,
        INSTALLABLE_ARTIFACT_PATH.DESCRIPTOR_DIGEST,
        INSTALLABLE_ARTIFACT_MESSAGE.DESCRIPTOR_DIGEST_MISMATCH,
      );
    }
    const ociManifest = parseOciManifest(bytes, descriptor);
    return resolvePayload(manifest, ociManifest, descriptor);
  }
}

export {
  ARTIFACT_SIGNATURE_POLICY_MODE,
  DEFAULT_MAX_DESCRIPTOR_BYTES,
  INSTALLABLE_ARTIFACT_ERROR_CODE,
  INSTALLABLE_ARTIFACT_SOURCE_KIND,
  InstallableServiceArtifactResolver,
  SIGNATURE_STATUS,
  buildArtifactSignaturePayload,
};
