/**
 * Shared artifact acquisition and verification owner for installable services.
 *
 * Remote registries and local OCI image layouts differ only at acquisition.
 * Digest, manifest/media, and detached-signature policy checks are shared.
 */

import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from 'node:crypto';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';

import {RUNTIME_KIND} from '../constants/runtime.js';
import {
  EXTERNAL_SERVICE_MEDIA_TYPE,
  validateExternalServiceManifest,
} from './external-service-manifest.js';
import {
  OCI_IMAGE_LAYOUT_VERSION,
  OCI_IMAGE_MANIFEST_MEDIA_TYPE,
} from './oci-image-layout-contract.js';

const INSTALLABLE_ARTIFACT_SOURCE_KIND = Object.freeze({
  LOCAL_OCI_LAYOUT: 'local_oci_layout',
  REMOTE_OCI: 'remote_oci',
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
const MAX_LAYOUT_MARKER_BYTES = 4 * 1024;
const MAX_INDEX_BYTES = 1024 * 1024;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const ED25519_SIGNATURE_BYTES = 64;
const SIGNATURE_DOMAIN = 'lagrange.installable-service-artifact.v1';

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
    status: 'rejected',
    errors: [{
      code: known ? error.code :
        INSTALLABLE_ARTIFACT_ERROR_CODE.SOURCE_READ_FAILED,
      path: known ? error.pathValue : '/source',
      message: known ? error.message : 'artifact source could not be read',
    }],
  });
}

function buildArtifactSignaturePayload(artifactDigest) {
  return Buffer.from(`${SIGNATURE_DOMAIN}\n${artifactDigest}`, 'utf8');
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function normalizeBytes(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  fail(
    INSTALLABLE_ARTIFACT_ERROR_CODE.SOURCE_RESULT_INVALID,
    '/source/bytes',
    'artifact source must return descriptor bytes',
  );
}

function validateSignaturePolicy(signaturePolicy) {
  const mode = signaturePolicy?.mode;
  if (!signaturePolicy || typeof signaturePolicy !== 'object' ||
      !Object.values(ARTIFACT_SIGNATURE_POLICY_MODE).includes(mode)) {
    fail(
      INSTALLABLE_ARTIFACT_ERROR_CODE.SIGNATURE_POLICY_INVALID,
      '/signaturePolicy/mode',
      'an explicit supported signature policy mode is required',
    );
  }
  return signaturePolicy;
}

function decodeEd25519Signature(value) {
  if (typeof value !== 'string' || !BASE64_PATTERN.test(value)) return null;
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== ED25519_SIGNATURE_BYTES ||
      decoded.toString('base64') !== value) {
    return null;
  }
  return decoded;
}

function validatedSignatureMetadata(signature) {
  if (typeof signature !== 'object' || signature.algorithm !== 'ed25519' ||
      typeof signature.key_id !== 'string' || signature.key_id.length === 0) {
    fail(
      INSTALLABLE_ARTIFACT_ERROR_CODE.SIGNATURE_INVALID,
      '/manifest/artifact/signature',
      'artifact signature metadata is invalid',
    );
  }
  const signatureBytes = decodeEd25519Signature(signature.value);
  if (!signatureBytes) {
    fail(
      INSTALLABLE_ARTIFACT_ERROR_CODE.SIGNATURE_INVALID,
      '/manifest/artifact/signature/value',
      'artifact signature value is invalid',
    );
  }
  return {keyId: signature.key_id, signatureBytes};
}

function trustedPublicKey(signaturePolicy, keyId) {
  const trustedKey = signaturePolicy.trusted_keys?.[keyId];
  if (typeof trustedKey !== 'string' && !Buffer.isBuffer(trustedKey)) {
    fail(
      INSTALLABLE_ARTIFACT_ERROR_CODE.SIGNATURE_UNTRUSTED,
      '/manifest/artifact/signature/key_id',
      'artifact signature key is not trusted by policy',
    );
  }
  try {
    return createPublicKey(trustedKey);
  } catch (_error) {
    fail(
      INSTALLABLE_ARTIFACT_ERROR_CODE.SIGNATURE_POLICY_INVALID,
      '/signaturePolicy/trusted_keys',
      'trusted artifact signature key is invalid',
    );
  }
}

function verifyArtifactSignature(artifact, signaturePolicy) {
  const mode = signaturePolicy.mode;
  const signature = artifact.signature;
  if (mode === ARTIFACT_SIGNATURE_POLICY_MODE.DISABLED) {
    return {status: SIGNATURE_STATUS.VERIFICATION_DISABLED, keyId: null};
  }
  if (!signature) {
    if (mode === ARTIFACT_SIGNATURE_POLICY_MODE.REQUIRED) {
      fail(
        INSTALLABLE_ARTIFACT_ERROR_CODE.SIGNATURE_REQUIRED,
        '/manifest/artifact/signature',
        'artifact signature is required by policy',
      );
    }
    return {status: SIGNATURE_STATUS.UNSIGNED_ALLOWED, keyId: null};
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
      '/manifest/artifact/signature/value',
      'artifact signature verification failed',
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
      'OCI descriptor is invalid',
    );
  }
  return descriptor;
}

function decodeOciManifest(bytes) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (_error) {
    fail(
      INSTALLABLE_ARTIFACT_ERROR_CODE.OCI_MANIFEST_INVALID,
      '/artifact/descriptor',
      'OCI manifest descriptor is not valid JSON',
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
      '/artifact/descriptor',
      'OCI image manifest shape is invalid',
    );
  }
  validateOciDescriptor(manifest.config, '/artifact/descriptor/config');
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
      '/artifact/descriptor/mediaType',
      'OCI descriptor media type does not match an image manifest',
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
        '/manifest/artifact/media_type',
        'container artifact media type does not match the OCI descriptor',
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
      '/manifest/artifact/media_type',
      'WASM artifact must contain exactly one application/wasm layer',
    );
  }
  return {
    payloadMediaType: EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT,
    payloadDescriptor: {...wasmLayers[0]},
  };
}

async function readBounded(file, maximumBytes, oversizedCode, pathValue) {
  let fileStat;
  try {
    fileStat = await stat(file);
  } catch (_error) {
    fail(
      INSTALLABLE_ARTIFACT_ERROR_CODE.SOURCE_READ_FAILED,
      pathValue,
      'artifact source file could not be read',
    );
  }
  if (!fileStat.isFile()) {
    fail(
      INSTALLABLE_ARTIFACT_ERROR_CODE.SOURCE_READ_FAILED,
      pathValue,
      'artifact source path is not a file',
    );
  }
  if (fileStat.size > maximumBytes) {
    fail(oversizedCode, pathValue, 'artifact source file exceeds its size bound');
  }
  try {
    return await readFile(file);
  } catch (_error) {
    fail(
      INSTALLABLE_ARTIFACT_ERROR_CODE.SOURCE_READ_FAILED,
      pathValue,
      'artifact source file could not be read',
    );
  }
}

async function readJson(file, maximumBytes, code, pathValue) {
  const bytes = await readBounded(file, maximumBytes, code, pathValue);
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch (_error) {
    fail(code, pathValue, 'OCI layout metadata is not valid JSON');
  }
}

class InstallableServiceArtifactResolver {
  constructor(options = {}) {
    this.remoteProvider = options.remoteProvider || null;
    this.maxDescriptorBytes = options.maxDescriptorBytes ||
      DEFAULT_MAX_DESCRIPTOR_BYTES;
    if (!Number.isSafeInteger(this.maxDescriptorBytes) ||
        this.maxDescriptorBytes <= 0) {
      throw new TypeError('maxDescriptorBytes must be a positive safe integer');
    }
  }

  async resolve(request = {}) {
    try {
      const manifestResult = validateExternalServiceManifest(request.manifest);
      if (!manifestResult.valid) {
        const first = manifestResult.errors[0];
        fail(
          INSTALLABLE_ARTIFACT_ERROR_CODE.MANIFEST_INVALID,
          `/manifest${first?.path || ''}`,
          'external service manifest is invalid',
        );
      }
      const manifest = manifestResult.manifest;
      const signaturePolicy = validateSignaturePolicy(request.signaturePolicy);
      const acquisition = await this.acquire(manifest, request.source);
      const verified = this.verifyDescriptor(manifest, acquisition);
      const signature = verifyArtifactSignature(
        manifest.artifact,
        signaturePolicy,
      );
      return deepFreeze({
        status: 'resolved',
        artifact: {
          sourceKind: acquisition.sourceKind,
          location: acquisition.location,
          digest: manifest.artifact.digest,
          descriptorMediaType: acquisition.descriptor.mediaType,
          payloadMediaType: verified.payloadMediaType,
          descriptor: {...acquisition.descriptor},
          payloadDescriptor: verified.payloadDescriptor,
          signature,
        },
      });
    } catch (error) {
      return rejected(error);
    }
  }

  async acquire(manifest, source) {
    const kind = source?.kind;
    const location = source?.location || manifest.artifact.ref;
    if (kind === INSTALLABLE_ARTIFACT_SOURCE_KIND.REMOTE_OCI) {
      return this.acquireRemote(manifest, location);
    }
    if (kind === INSTALLABLE_ARTIFACT_SOURCE_KIND.LOCAL_OCI_LAYOUT) {
      return this.acquireLocal(manifest, location);
    }
    fail(
      INSTALLABLE_ARTIFACT_ERROR_CODE.SOURCE_UNSUPPORTED,
      '/source/kind',
      'artifact source kind is unsupported',
    );
  }

  async acquireRemote(manifest, location) {
    if (!this.remoteProvider ||
        typeof this.remoteProvider.resolveDescriptor !== 'function') {
      fail(
        INSTALLABLE_ARTIFACT_ERROR_CODE.SOURCE_READ_FAILED,
        '/source',
        'remote OCI provider is not configured',
      );
    }
    let result;
    try {
      result = await this.remoteProvider.resolveDescriptor({
        reference: location,
        digest: manifest.artifact.digest,
        maxBytes: this.maxDescriptorBytes,
      });
    } catch (_error) {
      fail(
        INSTALLABLE_ARTIFACT_ERROR_CODE.SOURCE_READ_FAILED,
        '/source',
        'remote OCI descriptor acquisition failed',
      );
    }
    if (!result || typeof result !== 'object') {
      fail(
        INSTALLABLE_ARTIFACT_ERROR_CODE.SOURCE_RESULT_INVALID,
        '/source',
        'remote OCI provider returned an invalid result',
      );
    }
    return {
      sourceKind: INSTALLABLE_ARTIFACT_SOURCE_KIND.REMOTE_OCI,
      location,
      descriptor: validateOciDescriptor(result.descriptor, '/source/descriptor'),
      bytes: normalizeBytes(result.bytes),
    };
  }

  async acquireLocal(manifest, location) {
    if (typeof location !== 'string' || location.length === 0) {
      fail(
        INSTALLABLE_ARTIFACT_ERROR_CODE.OCI_LAYOUT_INVALID,
        '/source/location',
        'local OCI layout path is required',
      );
    }
    const root = path.resolve(location);
    const marker = await readJson(
      path.join(root, 'oci-layout'),
      MAX_LAYOUT_MARKER_BYTES,
      INSTALLABLE_ARTIFACT_ERROR_CODE.OCI_LAYOUT_INVALID,
      '/source/oci-layout',
    );
    if (marker?.imageLayoutVersion !== OCI_IMAGE_LAYOUT_VERSION) {
      fail(
        INSTALLABLE_ARTIFACT_ERROR_CODE.OCI_LAYOUT_INVALID,
        '/source/oci-layout/imageLayoutVersion',
        'OCI image layout version is unsupported',
      );
    }
    const index = await readJson(
      path.join(root, 'index.json'),
      MAX_INDEX_BYTES,
      INSTALLABLE_ARTIFACT_ERROR_CODE.OCI_LAYOUT_INVALID,
      '/source/index.json',
    );
    if (index?.schemaVersion !== 2 || !Array.isArray(index.manifests)) {
      fail(
        INSTALLABLE_ARTIFACT_ERROR_CODE.OCI_LAYOUT_INVALID,
        '/source/index.json',
        'OCI image layout index shape is invalid',
      );
    }
    const matches = index.manifests.filter((entry) =>
      entry?.digest === manifest.artifact.digest);
    if (matches.length !== 1) {
      fail(
        INSTALLABLE_ARTIFACT_ERROR_CODE.DESCRIPTOR_NOT_FOUND,
        '/source/index.json/manifests',
        'OCI image layout must contain exactly one pinned descriptor',
      );
    }
    const descriptor = validateOciDescriptor(
      matches[0],
      '/source/index.json/manifests',
    );
    const bytes = await readBounded(
      path.join(root, 'blobs', 'sha256', descriptor.digest.slice(7)),
      this.maxDescriptorBytes,
      INSTALLABLE_ARTIFACT_ERROR_CODE.DESCRIPTOR_TOO_LARGE,
      '/source/blobs',
    );
    return {
      sourceKind: INSTALLABLE_ARTIFACT_SOURCE_KIND.LOCAL_OCI_LAYOUT,
      location: root,
      descriptor,
      bytes,
    };
  }

  verifyDescriptor(manifest, acquisition) {
    const {bytes, descriptor} = acquisition;
    if (bytes.length > this.maxDescriptorBytes) {
      fail(
        INSTALLABLE_ARTIFACT_ERROR_CODE.DESCRIPTOR_TOO_LARGE,
        '/artifact/descriptor',
        'OCI descriptor exceeds the configured size bound',
      );
    }
    if (descriptor.size !== bytes.length) {
      fail(
        INSTALLABLE_ARTIFACT_ERROR_CODE.DESCRIPTOR_SIZE_MISMATCH,
        '/artifact/descriptor/size',
        'OCI descriptor size does not match its bytes',
      );
    }
    const computedDigest = sha256(bytes);
    if (descriptor.digest !== manifest.artifact.digest ||
        computedDigest !== manifest.artifact.digest) {
      fail(
        INSTALLABLE_ARTIFACT_ERROR_CODE.DIGEST_MISMATCH,
        '/artifact/descriptor/digest',
        'OCI descriptor digest does not match the manifest pin',
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
