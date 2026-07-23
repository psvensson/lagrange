import assert from 'node:assert/strict';
import {createHash, generateKeyPairSync, sign} from 'node:crypto';
import {mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
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
      reads: [],
      writes: [],
    }],
  };
}

function remoteProvider(resultOrError) {
  return {
    async resolveDescriptor() {
      if (resultOrError instanceof Error) throw resultOrError;
      return resultOrError;
    },
  };
}

function source(kind, location = undefined) {
  return {kind, ...(location === undefined ? {} : {location})};
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

async function writeOciLayout(t, descriptor, bytes, options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'lagrange-oci-layout-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  await mkdir(path.join(root, 'blobs', 'sha256'), {recursive: true});
  await writeFile(path.join(root, 'oci-layout'), JSON.stringify({
    imageLayoutVersion: options.layoutVersion || '1.0.0',
  }));
  await writeFile(path.join(root, 'index.json'), JSON.stringify({
    schemaVersion: options.indexSchemaVersion ?? 2,
    manifests: options.manifests || [descriptor],
  }));
  await writeFile(
    path.join(root, 'blobs', 'sha256', descriptor.digest.slice(7)),
    bytes,
  );
  return root;
}

describe('installable service artifact owner', () => {
  it('resolves a remote container and verifies its required signature', async () => {
    const bytes = makeOciManifest();
    const descriptor = makeDescriptor(bytes);
    const identity = createSigningIdentity();
    const signature = signDigest(identity.privateKey, descriptor.digest);
    const resolver = new InstallableServiceArtifactResolver({
      remoteProvider: remoteProvider({descriptor, bytes}),
    });

    const result = await resolver.resolve({
      manifest: makeExternalManifest({descriptor, signature}),
      source: source(INSTALLABLE_ARTIFACT_SOURCE_KIND.REMOTE_OCI),
      signaturePolicy: policy(
        ARTIFACT_SIGNATURE_POLICY_MODE.REQUIRED,
        {'publisher-main': identity.publicKeyPem},
      ),
    });

    assert.equal(result.status, 'resolved');
    assert.equal(result.artifact.digest, descriptor.digest);
    assert.equal(result.artifact.payloadMediaType, OCI_IMAGE_MANIFEST_MEDIA_TYPE);
    assert.equal(result.artifact.signature.status, 'verified');
  });

  it('resolves a real local OCI layout with a WASM payload descriptor', async (t) => {
    const bytes = makeOciManifest({wasm: true});
    const descriptor = makeDescriptor(bytes);
    const root = await writeOciLayout(t, descriptor, bytes);
    const resolver = new InstallableServiceArtifactResolver();

    const result = await resolver.resolve({
      manifest: makeExternalManifest({
        descriptor,
        runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
      }),
      source: source(INSTALLABLE_ARTIFACT_SOURCE_KIND.LOCAL_OCI_LAYOUT, root),
      signaturePolicy: policy(
        ARTIFACT_SIGNATURE_POLICY_MODE.VERIFY_IF_PRESENT,
      ),
    });

    assert.equal(result.status, 'resolved');
    assert.equal(result.artifact.sourceKind,
      INSTALLABLE_ARTIFACT_SOURCE_KIND.LOCAL_OCI_LAYOUT);
    assert.equal(result.artifact.payloadMediaType,
      EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT);
    assert.equal(result.artifact.payloadDescriptor.size, 128);
    assert.equal(result.artifact.signature.status, 'unsigned_allowed');
  });

  it('loads and re-verifies the manifest-pinned local Component payload',
    async (t) => {
      const payload = Buffer.from('genuine-component-payload');
      const bytes = makeOciManifest({wasm: true, wasmPayload: payload});
      const descriptor = makeDescriptor(bytes);
      const root = await writeOciLayout(t, descriptor, bytes);
      const payloadDigest = digest(payload);
      const payloadPath = path.join(
        root,
        'blobs',
        'sha256',
        payloadDigest.slice(7),
      );
      await writeFile(payloadPath, payload);
      const manifest = makeExternalManifest({
        descriptor,
        runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
      });
      const resolver = new InstallableServiceArtifactResolver();
      const resolved = await resolver.resolve({
        manifest,
        signaturePolicy: policy(
          ARTIFACT_SIGNATURE_POLICY_MODE.VERIFY_IF_PRESENT,
        ),
        source: source(
          INSTALLABLE_ARTIFACT_SOURCE_KIND.LOCAL_OCI_LAYOUT,
          root,
        ),
      });
      assert.equal(resolved.status, 'resolved');

      const loaded = await resolver.loadComponentPayload({
        artifactDigest: descriptor.digest,
        manifest,
      });
      assert.deepEqual(loaded.bytes, payload);
      assert.equal(loaded.payloadDigest, payloadDigest);

      await writeFile(payloadPath, Buffer.from('tampered-component'));
      await assert.rejects(
        () => resolver.loadComponentPayload({
          artifactDigest: descriptor.digest,
          manifest,
        }),
        (error) =>
          error.code === INSTALLABLE_ARTIFACT_ERROR_CODE.DIGEST_MISMATCH,
      );
    },
  );

  it('reacquires a remote Component payload after resolver restart',
    async () => {
      const payload = Buffer.from('remote-genuine-component');
      const bytes = makeOciManifest({wasm: true, wasmPayload: payload});
      const descriptor = makeDescriptor(bytes);
      const payloadDescriptor = {
        digest: digest(payload),
        mediaType: EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT,
        size: payload.length,
      };
      const provider = {
        async resolveDescriptor(request) {
          return request.digest === descriptor.digest ?
            {bytes, descriptor} :
            {bytes: payload, descriptor: payloadDescriptor};
        },
      };
      const manifest = makeExternalManifest({
        descriptor,
        runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
      });
      const installerResolver = new InstallableServiceArtifactResolver({
        remoteProvider: provider,
      });
      const resolved = await installerResolver.resolve({
        manifest,
        signaturePolicy: policy(
          ARTIFACT_SIGNATURE_POLICY_MODE.VERIFY_IF_PRESENT,
        ),
        source: source(INSTALLABLE_ARTIFACT_SOURCE_KIND.REMOTE_OCI),
      });
      assert.equal(resolved.status, 'resolved');

      const restartedResolver = new InstallableServiceArtifactResolver({
        remoteProvider: provider,
      });
      const loaded = await restartedResolver.loadComponentPayload({
        artifactDigest: descriptor.digest,
        manifest,
      });
      assert.deepEqual(loaded.bytes, payload);
      assert.equal(loaded.payloadDigest, payloadDescriptor.digest);
    },
  );

  it('loads a locally installed Component from the durable restart cache',
    async (t) => {
      const payload = Buffer.from('cached-local-component');
      const bytes = makeOciManifest({wasm: true, wasmPayload: payload});
      const descriptor = makeDescriptor(bytes);
      const root = await writeOciLayout(t, descriptor, bytes);
      const payloadDigest = digest(payload);
      await writeFile(
        path.join(root, 'blobs', 'sha256', payloadDigest.slice(7)),
        payload,
      );
      const cacheDir = await mkdtemp(
        path.join(tmpdir(), 'lagrange-component-cache-'),
      );
      t.after(() => rm(cacheDir, {recursive: true, force: true}));
      const manifest = makeExternalManifest({
        descriptor,
        runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
      });
      const installer = new InstallableServiceArtifactResolver({
        componentCacheDir: cacheDir,
      });
      const resolved = await installer.resolve({
        manifest,
        signaturePolicy: policy(
          ARTIFACT_SIGNATURE_POLICY_MODE.VERIFY_IF_PRESENT,
        ),
        source: source(
          INSTALLABLE_ARTIFACT_SOURCE_KIND.LOCAL_OCI_LAYOUT,
          root,
        ),
      });
      assert.equal(resolved.status, 'resolved');
      await rm(root, {recursive: true, force: true});

      const restarted = new InstallableServiceArtifactResolver({
        componentCacheDir: cacheDir,
      });
      const loaded = await restarted.loadComponentPayload({
        artifactDigest: descriptor.digest,
        manifest,
      });
      assert.deepEqual(loaded.bytes, payload);
      assert.equal(loaded.payloadDigest, payloadDigest);
    },
  );

  it('routes remote and local acquisition through the same normalized result', async (t) => {
    const bytes = makeOciManifest();
    const descriptor = makeDescriptor(bytes);
    const root = await writeOciLayout(t, descriptor, bytes);
    const resolver = new InstallableServiceArtifactResolver({
      remoteProvider: remoteProvider({descriptor, bytes}),
    });
    const manifest = makeExternalManifest({descriptor});
    const signaturePolicy = policy(ARTIFACT_SIGNATURE_POLICY_MODE.DISABLED);

    const remote = await resolver.resolve({
      manifest,
      source: source(INSTALLABLE_ARTIFACT_SOURCE_KIND.REMOTE_OCI),
      signaturePolicy,
    });
    const local = await resolver.resolve({
      manifest,
      source: source(INSTALLABLE_ARTIFACT_SOURCE_KIND.LOCAL_OCI_LAYOUT, root),
      signaturePolicy,
    });

    assert.equal(remote.status, 'resolved');
    assert.equal(local.status, 'resolved');
    assert.deepEqual(
      {...remote.artifact, sourceKind: null, location: null},
      {...local.artifact, sourceKind: null, location: null},
    );
  });

  it('rejects descriptor bytes whose computed digest does not match', async () => {
    const bytes = makeOciManifest();
    const descriptor = makeDescriptor(bytes);
    const tampered = Buffer.from(bytes);
    tampered[tampered.length - 2] ^= 1;
    const resolver = new InstallableServiceArtifactResolver({
      remoteProvider: remoteProvider({descriptor, bytes: tampered}),
    });

    const result = await resolver.resolve({
      manifest: makeExternalManifest({descriptor}),
      source: source(INSTALLABLE_ARTIFACT_SOURCE_KIND.REMOTE_OCI),
      signaturePolicy: policy(ARTIFACT_SIGNATURE_POLICY_MODE.DISABLED),
    });

    assert.equal(rejectionCode(result),
      INSTALLABLE_ARTIFACT_ERROR_CODE.DIGEST_MISMATCH);
  });

  it('rejects descriptor size mismatch and bounded-size overflow', async () => {
    const bytes = makeOciManifest();
    const descriptor = makeDescriptor(bytes, {size: bytes.length + 1});
    let resolver = new InstallableServiceArtifactResolver({
      remoteProvider: remoteProvider({descriptor, bytes}),
    });
    const request = {
      manifest: makeExternalManifest({descriptor}),
      source: source(INSTALLABLE_ARTIFACT_SOURCE_KIND.REMOTE_OCI),
      signaturePolicy: policy(ARTIFACT_SIGNATURE_POLICY_MODE.DISABLED),
    };
    assert.equal(rejectionCode(await resolver.resolve(request)),
      INSTALLABLE_ARTIFACT_ERROR_CODE.DESCRIPTOR_SIZE_MISMATCH);

    resolver = new InstallableServiceArtifactResolver({
      remoteProvider: remoteProvider({descriptor: {...descriptor, size: bytes.length}, bytes}),
      maxDescriptorBytes: bytes.length - 1,
    });
    assert.equal(rejectionCode(await resolver.resolve(request)),
      INSTALLABLE_ARTIFACT_ERROR_CODE.DESCRIPTOR_TOO_LARGE);
  });

  it('rejects container/WASM media mismatch and malformed OCI manifests', async () => {
    const containerBytes = makeOciManifest();
    const descriptor = makeDescriptor(containerBytes);
    let resolver = new InstallableServiceArtifactResolver({
      remoteProvider: remoteProvider({descriptor, bytes: containerBytes}),
    });
    const request = {
      manifest: makeExternalManifest({
        descriptor,
        runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
      }),
      source: source(INSTALLABLE_ARTIFACT_SOURCE_KIND.REMOTE_OCI),
      signaturePolicy: policy(ARTIFACT_SIGNATURE_POLICY_MODE.DISABLED),
    };
    assert.equal(rejectionCode(await resolver.resolve(request)),
      INSTALLABLE_ARTIFACT_ERROR_CODE.MEDIA_TYPE_MISMATCH);

    const invalidBytes = Buffer.from('{"schemaVersion":2}');
    const invalidDescriptor = makeDescriptor(invalidBytes);
    resolver = new InstallableServiceArtifactResolver({
      remoteProvider: remoteProvider({descriptor: invalidDescriptor, bytes: invalidBytes}),
    });
    assert.equal(rejectionCode(await resolver.resolve({
      ...request,
      manifest: makeExternalManifest({descriptor: invalidDescriptor}),
    })), INSTALLABLE_ARTIFACT_ERROR_CODE.OCI_MANIFEST_INVALID);
  });

  it('rejects invalid layouts and layouts without the pinned descriptor', async (t) => {
    const bytes = makeOciManifest();
    const descriptor = makeDescriptor(bytes);
    const badVersionRoot = await writeOciLayout(
      t, descriptor, bytes, {layoutVersion: '2.0.0'},
    );
    const missingRoot = await writeOciLayout(
      t, descriptor, bytes, {manifests: []},
    );
    const invalidIndexRoot = await writeOciLayout(
      t, descriptor, bytes, {indexSchemaVersion: 1},
    );
    const resolver = new InstallableServiceArtifactResolver();
    const base = {
      manifest: makeExternalManifest({descriptor}),
      signaturePolicy: policy(ARTIFACT_SIGNATURE_POLICY_MODE.DISABLED),
    };

    assert.equal(rejectionCode(await resolver.resolve({
      ...base,
      source: source(INSTALLABLE_ARTIFACT_SOURCE_KIND.LOCAL_OCI_LAYOUT,
        badVersionRoot),
    })), INSTALLABLE_ARTIFACT_ERROR_CODE.OCI_LAYOUT_INVALID);
    assert.equal(rejectionCode(await resolver.resolve({
      ...base,
      source: source(INSTALLABLE_ARTIFACT_SOURCE_KIND.LOCAL_OCI_LAYOUT,
        missingRoot),
    })), INSTALLABLE_ARTIFACT_ERROR_CODE.DESCRIPTOR_NOT_FOUND);
    assert.equal(rejectionCode(await resolver.resolve({
      ...base,
      source: source(INSTALLABLE_ARTIFACT_SOURCE_KIND.LOCAL_OCI_LAYOUT,
        invalidIndexRoot),
    })), INSTALLABLE_ARTIFACT_ERROR_CODE.OCI_LAYOUT_INVALID);
  });

  it('requires an explicit valid signature policy', async () => {
    const bytes = makeOciManifest();
    const descriptor = makeDescriptor(bytes);
    const resolver = new InstallableServiceArtifactResolver({
      remoteProvider: remoteProvider({descriptor, bytes}),
    });
    const base = {
      manifest: makeExternalManifest({descriptor}),
      source: source(INSTALLABLE_ARTIFACT_SOURCE_KIND.REMOTE_OCI),
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
    const resolver = new InstallableServiceArtifactResolver({
      remoteProvider: remoteProvider({descriptor, bytes}),
    });
    const base = {
      source: source(INSTALLABLE_ARTIFACT_SOURCE_KIND.REMOTE_OCI),
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
    const resolver = new InstallableServiceArtifactResolver({
      remoteProvider: remoteProvider({descriptor, bytes}),
    });
    const base = {
      manifest: makeExternalManifest({descriptor, signature}),
      source: source(INSTALLABLE_ARTIFACT_SOURCE_KIND.REMOTE_OCI),
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

  it('rejects unsupported sources and converts provider failures to typed errors', async () => {
    const bytes = makeOciManifest();
    const descriptor = makeDescriptor(bytes);
    let resolver = new InstallableServiceArtifactResolver();
    const base = {
      manifest: makeExternalManifest({descriptor}),
      signaturePolicy: policy(ARTIFACT_SIGNATURE_POLICY_MODE.DISABLED),
    };
    assert.equal(rejectionCode(await resolver.resolve({
      ...base,
      source: source('memory'),
    })), INSTALLABLE_ARTIFACT_ERROR_CODE.SOURCE_UNSUPPORTED);

    resolver = new InstallableServiceArtifactResolver({
      remoteProvider: remoteProvider(new Error('credential leaked in detail')),
    });
    const failed = await resolver.resolve({
      ...base,
      source: source(INSTALLABLE_ARTIFACT_SOURCE_KIND.REMOTE_OCI),
    });
    assert.equal(rejectionCode(failed),
      INSTALLABLE_ARTIFACT_ERROR_CODE.SOURCE_READ_FAILED);
    assert.equal(JSON.stringify(failed).includes('credential leaked'), false);
  });
});
