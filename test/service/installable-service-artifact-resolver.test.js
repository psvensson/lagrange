import assert from 'node:assert/strict';
import {createHash, generateKeyPairSync, sign} from 'node:crypto';
import {describe, it} from 'node:test';

import {RUNTIME_KIND} from '../../src/constants/runtime.js';
import {
  ARTIFACT_SIGNATURE_POLICY_MODE,
  INSTALLABLE_ARTIFACT_ERROR_CODE,
  INSTALLABLE_ARTIFACT_SOURCE_KIND,
  InstallableServiceArtifactResolver,
  buildArtifactSignaturePayload,
} from '../../src/service/installable-service-artifact-resolver.js';
import {
  EXTERNAL_SERVICE_EXPORT_INTERFACE,
  EXTERNAL_SERVICE_MANIFEST_SCHEMA_VERSION,
  EXTERNAL_SERVICE_MEDIA_TYPE,
} from '../../src/service/external-service-manifest.js';

const OCI_IMAGE_MANIFEST_MEDIA_TYPE =
  EXTERNAL_SERVICE_MEDIA_TYPE.OCI_CONTAINER;
const OCI_CONFIG_MEDIA_TYPE = 'application/vnd.oci.image.config.v1+json';
const SHA256_EMPTY = `sha256:${'0'.repeat(64)}`;

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function makeOciManifest({wasm = false, wasmPayload = null} = {}) {
  const payload = wasmPayload || Buffer.alloc(128);
  return Buffer.from(JSON.stringify({
    schemaVersion: 2,
    mediaType: OCI_IMAGE_MANIFEST_MEDIA_TYPE,
    config: {
      mediaType: OCI_CONFIG_MEDIA_TYPE,
      digest: SHA256_EMPTY,
      size: 2,
    },
    layers: wasm ? [{
      mediaType: EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT,
      digest: digest(payload),
      size: payload.length,
    }] : [],
  }));
}

function makeDescriptor(bytes, overrides = {}) {
  return {
    mediaType: OCI_IMAGE_MANIFEST_MEDIA_TYPE,
    digest: digest(bytes),
    size: bytes.length,
    ...overrides,
  };
}

function makeExternalManifest({
  descriptor,
  runtimeKind = RUNTIME_KIND.OCI_CONTAINER,
  signature = undefined,
} = {}) {
  return {
    schema_version: EXTERNAL_SERVICE_MANIFEST_SCHEMA_VERSION,
    name: 'analytics-worker',
    version: '3.0.0',
    artifact: {
      type: 'oci',
      ref: 'registry.example.test/services/analytics-worker:3.0.0',
      digest: descriptor.digest,
      media_type: runtimeKind === RUNTIME_KIND.WASM_COMPONENT ?
        EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT :
        EXTERNAL_SERVICE_MEDIA_TYPE.OCI_CONTAINER,
      ...(signature === undefined ? {} : {signature}),
    },
    runtime: {kind: runtimeKind},
    exports: [{
      name: 'serve',
      interface: EXTERNAL_SERVICE_EXPORT_INTERFACE.REQUEST,
    }],
  };
}

function policy(mode, trustedKeys = undefined) {
  return {
    mode,
    ...(trustedKeys === undefined ? {} : {trusted_keys: trustedKeys}),
  };
}

function rejectionCode(result) {
  assert.equal(result.status, 'rejected');
  assert.equal(result.errors.length, 1);
  return result.errors[0].code;
}

function createSigningIdentity() {
  const {privateKey, publicKey} = generateKeyPairSync('ed25519');
  return {
    privateKey,
    publicKeyPem: publicKey.export({format: 'pem', type: 'spki'}),
  };
}

function signDigest(privateKey, artifactDigest, keyId = 'publisher-main') {
  const value = sign(
    null,
    buildArtifactSignaturePayload(artifactDigest),
    privateKey,
  ).toString('base64');
  return {algorithm: 'ed25519', key_id: keyId, value};
}

describe('installable service artifact owner', () => {
  it('refuses local_oci_layout and remote_oci sources with SOURCE_UNSUPPORTED', async () => {
    const bytes = makeOciManifest();
    const descriptor = makeDescriptor(bytes);
    const resolver = new InstallableServiceArtifactResolver();
    const manifest = makeExternalManifest({descriptor});
    const signaturePolicy = policy(ARTIFACT_SIGNATURE_POLICY_MODE.DISABLED);

    const localResult = await resolver.resolve({
      manifest,
      signaturePolicy,
      source: {
        kind: INSTALLABLE_ARTIFACT_SOURCE_KIND.LOCAL_OCI_LAYOUT,
        location: '/tmp/retired',
      },
    });
    assert.equal(rejectionCode(localResult),
      INSTALLABLE_ARTIFACT_ERROR_CODE.SOURCE_UNSUPPORTED);

    const remoteResult = await resolver.resolve({
      manifest,
      signaturePolicy,
      source: {kind: INSTALLABLE_ARTIFACT_SOURCE_KIND.REMOTE_OCI},
    });
    assert.equal(rejectionCode(remoteResult),
      INSTALLABLE_ARTIFACT_ERROR_CODE.SOURCE_UNSUPPORTED);
  });

  it('resolves sealed payload without external sources and verifies required signature', async () => {
    const payloadBytes = Buffer.from('wasm-sealed-payload');
    const payloadDigest = digest(payloadBytes);
    const artifactDigest = `sha256:${'e'.repeat(64)}`;
    const identity = createSigningIdentity();
    const signature = signDigest(identity.privateKey, artifactDigest);
    const resolver = new InstallableServiceArtifactResolver();

    const manifest = makeExternalManifest({
      descriptor: {digest: artifactDigest},
      runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
      signature,
    });
    const sealedPayload = {
      artifactDigest,
      mediaType: EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT,
      payloadDigest,
      totalSize: payloadBytes.length,
    };

    const result = await resolver.resolve({
      manifest,
      sealedPayload,
      signaturePolicy: policy(
        ARTIFACT_SIGNATURE_POLICY_MODE.REQUIRED,
        {'publisher-main': identity.publicKeyPem},
      ),
    });

    assert.equal(result.status, 'resolved');
    assert.equal(result.artifact.digest, artifactDigest);
    assert.equal(result.artifact.payloadDescriptor.digest, payloadDigest);
    assert.equal(result.artifact.payloadDescriptor.size, payloadBytes.length);
    assert.equal(result.artifact.signature.status, 'verified');
  });

  it('resolves descriptor bytes and verifies matching descriptor', async () => {
    const bytes = makeOciManifest({wasm: true});
    const descriptor = makeDescriptor(bytes);
    const resolver = new InstallableServiceArtifactResolver();

    const result = await resolver.resolve({
      descriptor,
      descriptorBytes: bytes,
      manifest: makeExternalManifest({
        descriptor,
        runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
      }),
      signaturePolicy: policy(ARTIFACT_SIGNATURE_POLICY_MODE.VERIFY_IF_PRESENT),
    });

    assert.equal(result.status, 'resolved');
    assert.equal(result.artifact.digest, descriptor.digest);
    assert.equal(result.artifact.payloadMediaType, EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT);
    assert.equal(result.artifact.signature.status, 'unsigned_allowed');
  });

  it('rejects descriptor bytes whose computed digest does not match', async () => {
    const bytes = makeOciManifest();
    const descriptor = makeDescriptor(bytes);
    const tampered = Buffer.from(bytes);
    tampered[tampered.length - 2] ^= 1;
    const resolver = new InstallableServiceArtifactResolver();

    const result = await resolver.resolve({
      descriptor,
      descriptorBytes: tampered,
      manifest: makeExternalManifest({descriptor}),
      signaturePolicy: policy(ARTIFACT_SIGNATURE_POLICY_MODE.DISABLED),
    });

    assert.equal(rejectionCode(result),
      INSTALLABLE_ARTIFACT_ERROR_CODE.DIGEST_MISMATCH);
  });

  it('rejects descriptor size mismatch and bounded-size overflow', async () => {
    const bytes = makeOciManifest();
    const descriptor = makeDescriptor(bytes, {size: bytes.length + 1});
    let resolver = new InstallableServiceArtifactResolver();
    const request = {
      descriptor,
      descriptorBytes: bytes,
      manifest: makeExternalManifest({descriptor}),
      signaturePolicy: policy(ARTIFACT_SIGNATURE_POLICY_MODE.DISABLED),
    };
    assert.equal(rejectionCode(await resolver.resolve(request)),
      INSTALLABLE_ARTIFACT_ERROR_CODE.DESCRIPTOR_SIZE_MISMATCH);

    resolver = new InstallableServiceArtifactResolver({
      maxDescriptorBytes: bytes.length - 1,
    });
    assert.equal(rejectionCode(await resolver.resolve({
      ...request,
      descriptor: {...descriptor, size: bytes.length},
    })), INSTALLABLE_ARTIFACT_ERROR_CODE.DESCRIPTOR_TOO_LARGE);
  });

  it('rejects container/WASM media mismatch and malformed OCI manifests', async () => {
    const containerBytes = makeOciManifest();
    const descriptor = makeDescriptor(containerBytes);
    let resolver = new InstallableServiceArtifactResolver();
    const request = {
      descriptor,
      descriptorBytes: containerBytes,
      manifest: makeExternalManifest({
        descriptor,
        runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
      }),
      signaturePolicy: policy(ARTIFACT_SIGNATURE_POLICY_MODE.DISABLED),
    };
    assert.equal(rejectionCode(await resolver.resolve(request)),
      INSTALLABLE_ARTIFACT_ERROR_CODE.MEDIA_TYPE_MISMATCH);

    const invalidBytes = Buffer.from('{"schemaVersion":2}');
    const invalidDescriptor = makeDescriptor(invalidBytes);
    resolver = new InstallableServiceArtifactResolver();
    assert.equal(rejectionCode(await resolver.resolve({
      ...request,
      descriptor: invalidDescriptor,
      descriptorBytes: invalidBytes,
      manifest: makeExternalManifest({descriptor: invalidDescriptor}),
    })), INSTALLABLE_ARTIFACT_ERROR_CODE.OCI_MANIFEST_INVALID);
  });

  it('requires an explicit valid signature policy', async () => {
    const bytes = makeOciManifest();
    const descriptor = makeDescriptor(bytes);
    const resolver = new InstallableServiceArtifactResolver();
    const base = {
      descriptor,
      descriptorBytes: bytes,
      manifest: makeExternalManifest({descriptor}),
    };

    assert.equal(rejectionCode(await resolver.resolve(base)),
      INSTALLABLE_ARTIFACT_ERROR_CODE.SIGNATURE_POLICY_INVALID);
    assert.equal(rejectionCode(await resolver.resolve({
      ...base,
      signaturePolicy: policy('implicit'),
    })), INSTALLABLE_ARTIFACT_ERROR_CODE.SIGNATURE_POLICY_INVALID);
  });

  it('rejects missing, invalid, and untrusted required signatures', async () => {
    const bytes = makeOciManifest();
    const descriptor = makeDescriptor(bytes);
    const identity = createSigningIdentity();
    const resolver = new InstallableServiceArtifactResolver();
    const base = {
      descriptor,
      descriptorBytes: bytes,
      signaturePolicy: policy(
        ARTIFACT_SIGNATURE_POLICY_MODE.REQUIRED,
        {'publisher-main': identity.publicKeyPem},
      ),
    };

    assert.equal(rejectionCode(await resolver.resolve({
      ...base,
      manifest: makeExternalManifest({descriptor}),
    })), INSTALLABLE_ARTIFACT_ERROR_CODE.SIGNATURE_REQUIRED);

    const signature = signDigest(identity.privateKey, descriptor.digest);
    signature.value = Buffer.alloc(64, 1).toString('base64');
    assert.equal(rejectionCode(await resolver.resolve({
      ...base,
      manifest: makeExternalManifest({descriptor, signature}),
    })), INSTALLABLE_ARTIFACT_ERROR_CODE.SIGNATURE_INVALID);

    const untrusted = signDigest(identity.privateKey, descriptor.digest, 'other-key');
    assert.equal(rejectionCode(await resolver.resolve({
      ...base,
      manifest: makeExternalManifest({descriptor, signature: untrusted}),
    })), INSTALLABLE_ARTIFACT_ERROR_CODE.SIGNATURE_UNTRUSTED);
  });

  it('rejects invalid present signatures unless policy explicitly disables checks', async () => {
    const bytes = makeOciManifest();
    const descriptor = makeDescriptor(bytes);
    const signature = {algorithm: 'unknown', key_id: 'key', value: 'not-base64'};
    const resolver = new InstallableServiceArtifactResolver();
    const base = {
      descriptor,
      descriptorBytes: bytes,
      manifest: makeExternalManifest({descriptor, signature}),
    };

    assert.equal(rejectionCode(await resolver.resolve({
      ...base,
      signaturePolicy: policy(
        ARTIFACT_SIGNATURE_POLICY_MODE.VERIFY_IF_PRESENT,
        {key: 'bad-key'},
      ),
    })), INSTALLABLE_ARTIFACT_ERROR_CODE.SIGNATURE_INVALID);

    const disabled = await resolver.resolve({
      ...base,
      signaturePolicy: policy(ARTIFACT_SIGNATURE_POLICY_MODE.DISABLED),
    });
    assert.equal(disabled.status, 'resolved');
    assert.equal(disabled.artifact.signature.status, 'verification_disabled');
  });
});
