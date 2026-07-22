import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import {RUNTIME_KIND} from '../../src/constants/runtime.js';
import {
  ARTIFACT_SIGNATURE_POLICY_MODE,
  INSTALLABLE_ARTIFACT_SOURCE_KIND,
  InstallableServiceArtifactResolver,
} from '../../src/service/installable-service-artifact-resolver.js';
import {
  EXTERNAL_SERVICE_EXPORT_INTERFACE,
  EXTERNAL_SERVICE_MANIFEST_SCHEMA_VERSION,
  EXTERNAL_SERVICE_MEDIA_TYPE,
} from '../../src/service/external-service-manifest.js';
import {
  DockerBuildxOciLayoutExporter,
} from '../../src/service/docker-buildx-oci-layout-exporter.js';
import {
  SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE,
  ServiceLocalOciLayoutBuilder,
} from '../../src/service/service-local-oci-layout-builder.js';

const PLATFORM = 'linux/amd64';
const OTHER_PLATFORM = 'linux/arm64';
const SOURCE_DATE_EPOCH = 1_700_000_000;
const OTHER_SOURCE_DATE_EPOCH = SOURCE_DATE_EPOCH + 1;
const OCI_IMAGE_LAYOUT_VERSION = '1.0.0';
const OCI_IMAGE_MANIFEST_MEDIA_TYPE =
  EXTERNAL_SERVICE_MEDIA_TYPE.OCI_CONTAINER;
const OCI_IMAGE_CONFIG_MEDIA_TYPE =
  'application/vnd.oci.image.config.v1+json';
const OCI_LAYER_MEDIA_TYPE = 'application/vnd.oci.image.layer.v1.tar';
const SOURCE_FINGERPRINT = `sha256:${'a'.repeat(64)}`;
const OTHER_SOURCE_FINGERPRINT = `sha256:${'b'.repeat(64)}`;
const WASM_BYTES = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function canonicalBytes(value) {
  if (Array.isArray(value)) return value.map(canonicalBytes);
  if (!value || typeof value !== 'object' || Buffer.isBuffer(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalBytes(value[key])]),
  );
}

function jsonBytes(value) {
  return Buffer.from(JSON.stringify(canonicalBytes(value)));
}

function descriptor(bytes, mediaType) {
  return {digest: sha256(bytes), mediaType, size: bytes.length};
}

async function temporaryDirectory(t, prefix) {
  const root = await mkdtemp(path.join(tmpdir(), prefix));
  t.after(() => rm(root, {recursive: true, force: true}));
  return root;
}

async function writeBlob(layoutPath, bytes) {
  const digest = sha256(bytes);
  await mkdir(path.join(layoutPath, 'blobs', 'sha256'), {recursive: true});
  await writeFile(path.join(layoutPath, 'blobs', 'sha256', digest.slice(7)), bytes);
  return digest;
}

async function writeContainerLayout(
  layoutPath,
  mutation = 'none',
  platform = PLATFORM,
) {
  const [os, architecture] = platform.split('/');
  const configBytes = jsonBytes({architecture, os});
  const layerBytes = Buffer.from('deterministic-container-layer');
  const config = descriptor(configBytes, OCI_IMAGE_CONFIG_MEDIA_TYPE);
  const firstLayer = descriptor(layerBytes, OCI_LAYER_MEDIA_TYPE);
  const layers = mutation === 'wasm-layers' ? [
    {...firstLayer, mediaType: EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT},
    {...firstLayer, mediaType: EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT},
  ] : [firstLayer];
  if (mutation === 'wrong-size') firstLayer.size += 1;
  const manifestBytes = jsonBytes({
    config,
    layers,
    mediaType: OCI_IMAGE_MANIFEST_MEDIA_TYPE,
    schemaVersion: 2,
  });
  const top = descriptor(manifestBytes, OCI_IMAGE_MANIFEST_MEDIA_TYPE);

  await mkdir(layoutPath, {recursive: true});
  await writeBlob(layoutPath, configBytes);
  await writeBlob(layoutPath, layerBytes);
  await writeBlob(layoutPath, manifestBytes);
  if (mutation === 'tampered-layer') {
    const tamperedLayerBytes = Buffer.from(layerBytes);
    tamperedLayerBytes[0] ^= 1;
    await writeFile(
      path.join(layoutPath, 'blobs', 'sha256', firstLayer.digest.slice(7)),
      tamperedLayerBytes,
    );
  }
  if (mutation === 'missing-layer') {
    await rm(path.join(layoutPath, 'blobs', 'sha256', firstLayer.digest.slice(7)));
  }
  const topDescriptor = mutation === 'wrong-top-media' ?
    {...top, mediaType: OCI_LAYER_MEDIA_TYPE} : top;
  const manifests = mutation === 'multiple-index-entries' ?
    [topDescriptor, topDescriptor] : [topDescriptor];
  const descriptorPlatform = mutation === 'wrong-platform' ?
    {architecture: 'incorrect', os} : {architecture, os};
  await writeFile(path.join(layoutPath, 'oci-layout'), jsonBytes({
    imageLayoutVersion: OCI_IMAGE_LAYOUT_VERSION,
  }));
  await writeFile(path.join(layoutPath, 'index.json'), jsonBytes({
    manifests: manifests.map((entry) => ({
      ...entry,
      platform: descriptorPlatform,
    })),
    schemaVersion: 2,
  }));
  return {config, firstLayer, top};
}

function containerExporter(mutation = 'none') {
  const calls = [];
  return {
    calls,
    async exportLayout(request) {
      calls.push({...request});
      if (mutation === 'export-failure') throw new Error('injected exporter failure');
      await writeContainerLayout(request.outputPath, mutation, request.platform);
    },
  };
}

async function wasmRequest(t, overrides = {}) {
  const root = await temporaryDirectory(t, 'lagrange-wasm-build-');
  const payloadPath = path.join(root, 'service.wasm');
  await writeFile(payloadPath, WASM_BYTES);
  return {
    runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
    outputRoot: path.join(root, 'layouts'),
    platform: PLATFORM,
    sourceDateEpoch: SOURCE_DATE_EPOCH,
    wasm: {payloadPath},
    ...overrides,
  };
}

async function containerRequest(t, overrides = {}) {
  const root = await temporaryDirectory(t, 'lagrange-container-build-');
  const contextPath = path.join(root, 'context');
  const outputRoot = path.join(root, 'layouts');
  await mkdir(contextPath);
  await writeFile(path.join(contextPath, 'Dockerfile'), 'FROM scratch\n');
  return {
    runtimeKind: RUNTIME_KIND.OCI_CONTAINER,
    outputRoot,
    platform: PLATFORM,
    sourceDateEpoch: SOURCE_DATE_EPOCH,
    container: {
      contextPath,
      dockerfilePath: path.join(contextPath, 'Dockerfile'),
      sourceFingerprint: SOURCE_FINGERPRINT,
      buildArgs: {MODE: 'release'},
    },
    ...overrides,
  };
}

async function directoryContentMap(root) {
  const entries = [];
  async function visit(directory, relativeDirectory) {
    const names = await readdir(directory, {withFileTypes: true});
    names.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of names) {
      const relativePath = path.join(relativeDirectory, entry.name);
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath, relativePath);
      } else {
        entries.push([relativePath, sha256(await readFile(fullPath))]);
      }
    }
  }
  await visit(root, '');
  return entries;
}

function externalManifest(receipt) {
  return {
    schema_version: EXTERNAL_SERVICE_MANIFEST_SCHEMA_VERSION,
    name: 'local-development-service',
    version: '1.0.0',
    artifact: {
      type: 'oci',
      ref: receipt.layoutPath,
      digest: receipt.topManifestDescriptor.digest,
      media_type: receipt.runtimeKind === RUNTIME_KIND.WASM_COMPONENT ?
        EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT :
        EXTERNAL_SERVICE_MEDIA_TYPE.OCI_CONTAINER,
      size_bytes: receipt.topManifestDescriptor.sizeBytes,
    },
    runtime: {kind: receipt.runtimeKind},
    exports: [{
      name: 'serve',
      interface: EXTERNAL_SERVICE_EXPORT_INTERFACE.REQUEST,
      reads: [],
      writes: [],
    }],
  };
}

async function resolveReceipt(receipt) {
  const resolver = new InstallableServiceArtifactResolver();
  return resolver.resolve({
    manifest: externalManifest(receipt),
    source: {
      kind: INSTALLABLE_ARTIFACT_SOURCE_KIND.LOCAL_OCI_LAYOUT,
      location: receipt.layoutPath,
    },
    signaturePolicy: {mode: ARTIFACT_SIGNATURE_POLICY_MODE.DISABLED},
  });
}

function withoutLayoutPath(receipt) {
  const {layoutPath: _layoutPath, ...stableFields} = receipt;
  return stableFields;
}

describe('service local OCI layout build owner', () => {
  it('publishes an idempotent prebuilt WASM graph and immutable receipt', async (t) => {
    const request = await wasmRequest(t);
    const builder = new ServiceLocalOciLayoutBuilder();

    const first = await builder.build(request);
    const second = await builder.build(request);

    assert.deepEqual(second, first);
    assert.equal(first.runtimeKind, RUNTIME_KIND.WASM_COMPONENT);
    assert.equal(first.platform, PLATFORM);
    assert.equal(first.sourceDateEpoch, SOURCE_DATE_EPOCH);
    assert.equal(first.topManifestDescriptor.mediaType,
      OCI_IMAGE_MANIFEST_MEDIA_TYPE);
    assert.deepEqual(first.payloadDescriptors, [{
      digest: sha256(WASM_BYTES),
      mediaType: EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT,
      sizeBytes: WASM_BYTES.length,
    }]);
    assert.equal(first.totalPayloadBytes, WASM_BYTES.length);
    assert.equal(Object.isFrozen(first), true);
    assert.equal(Object.isFrozen(first.topManifestDescriptor), true);
    assert.equal(Object.isFrozen(first.payloadDescriptors), true);
    assert.equal(Object.isFrozen(first.payloadDescriptors[0]), true);
    assert.equal((await lstat(first.layoutPath)).isDirectory(), true);
  });

  it('reproduces the same WASM content graph across output roots', async (t) => {
    const firstRequest = await wasmRequest(t);
    const secondRequest = await wasmRequest(t);
    const builder = new ServiceLocalOciLayoutBuilder();

    const first = await builder.build(firstRequest);
    const second = await builder.build(secondRequest);

    assert.deepEqual(withoutLayoutPath(second), withoutLayoutPath(first));
    assert.deepEqual(
      await directoryContentMap(second.layoutPath),
      await directoryContentMap(first.layoutPath),
    );
  });

  it('changes the content identity when a prebuilt WASM byte changes', async (t) => {
    const firstRequest = await wasmRequest(t);
    const secondRequest = await wasmRequest(t);
    const changedBytes = Buffer.from(WASM_BYTES);
    changedBytes[changedBytes.length - 1] ^= 1;
    await writeFile(secondRequest.wasm.payloadPath, changedBytes);
    const builder = new ServiceLocalOciLayoutBuilder();

    const first = await builder.build(firstRequest);
    const second = await builder.build(secondRequest);

    assert.notEqual(second.topManifestDescriptor.digest,
      first.topManifestDescriptor.digest);
    assert.notEqual(second.payloadDescriptors[0].digest,
      first.payloadDescriptors[0].digest);
    assert.notEqual(second.buildInputFingerprint, first.buildInputFingerprint);
  });

  it('binds the explicit platform into a prebuilt WASM graph', async (t) => {
    const request = await wasmRequest(t);
    const builder = new ServiceLocalOciLayoutBuilder();

    const first = await builder.build(request);
    const second = await builder.build({...request, platform: OTHER_PLATFORM});

    assert.notEqual(second.layoutPath, first.layoutPath);
    assert.notEqual(second.topManifestDescriptor.digest,
      first.topManifestDescriptor.digest);
    assert.notEqual(second.buildInputFingerprint, first.buildInputFingerprint);
  });

  it('accepts exact WASM and container receipts through the install resolver', async (t) => {
    const wasm = await new ServiceLocalOciLayoutBuilder().build(
      await wasmRequest(t),
    );
    const exporter = containerExporter();
    const container = await new ServiceLocalOciLayoutBuilder({
      containerExporter: exporter,
    }).build(await containerRequest(t));

    const wasmResolution = await resolveReceipt(wasm);
    const containerResolution = await resolveReceipt(container);

    assert.equal(wasmResolution.status, 'resolved');
    assert.equal(wasmResolution.artifact.payloadMediaType,
      EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT);
    assert.equal(containerResolution.status, 'resolved');
    assert.equal(containerResolution.artifact.payloadMediaType,
      OCI_IMAGE_MANIFEST_MEDIA_TYPE);
  });

  it('routes container publication through one injected exporter contract', async (t) => {
    const exporter = containerExporter();
    const request = await containerRequest(t);
    const receipt = await new ServiceLocalOciLayoutBuilder({
      containerExporter: exporter,
    }).build(request);

    assert.equal(exporter.calls.length, 1);
    assert.equal(exporter.calls[0].contextPath,
      path.resolve(request.container.contextPath));
    assert.equal(exporter.calls[0].dockerfilePath,
      path.resolve(request.container.dockerfilePath));
    assert.equal(exporter.calls[0].platform, PLATFORM);
    assert.equal(exporter.calls[0].sourceDateEpoch, SOURCE_DATE_EPOCH);
    assert.deepEqual(exporter.calls[0].buildArgs, {MODE: 'release'});
    assert.equal(receipt.runtimeKind, RUNTIME_KIND.OCI_CONTAINER);
    assert.equal(receipt.payloadDescriptors[0].mediaType, OCI_LAYER_MEDIA_TYPE);
  });

  it('binds normalized container inputs into the build fingerprint', async (t) => {
    const request = await containerRequest(t);
    const exporter = containerExporter();
    const builder = new ServiceLocalOciLayoutBuilder({containerExporter: exporter});
    const first = await builder.build(request);
    const second = await builder.build({
      ...request,
      platform: OTHER_PLATFORM,
      sourceDateEpoch: OTHER_SOURCE_DATE_EPOCH,
      container: {
        ...request.container,
        sourceFingerprint: OTHER_SOURCE_FINGERPRINT,
        buildArgs: {MODE: 'debug'},
      },
    });

    assert.notEqual(second.buildInputFingerprint, first.buildInputFingerprint);
    assert.equal(second.platform, OTHER_PLATFORM);
    assert.equal(second.sourceDateEpoch, OTHER_SOURCE_DATE_EPOCH);
  });

  for (const attack of [
    ['missing-layer', SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.BLOB_READ_FAILED],
    ['tampered-layer', SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.DIGEST_MISMATCH],
    ['wrong-size', SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.DESCRIPTOR_SIZE_MISMATCH],
    ['multiple-index-entries', SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.LAYOUT_INVALID],
    ['wrong-top-media', SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.MEDIA_TYPE_MISMATCH],
    ['wrong-platform', SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.LAYOUT_INVALID],
    ['wasm-layers', SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.MEDIA_TYPE_MISMATCH],
  ]) {
    it(`rejects the ${attack[0]} exporter graph before publication`, async (t) => {
      const request = await containerRequest(t);
      const builder = new ServiceLocalOciLayoutBuilder({
        containerExporter: containerExporter(attack[0]),
      });

      await assert.rejects(builder.build(request), {code: attack[1]});
      assert.deepEqual(await readdir(request.outputRoot), []);
    });
  }

  it('cleans exporter failures without publishing a partial layout', async (t) => {
    const request = await containerRequest(t);
    const builder = new ServiceLocalOciLayoutBuilder({
      containerExporter: containerExporter('export-failure'),
    });

    await assert.rejects(builder.build(request), {
      code: SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.EXPORT_FAILED,
    });
    assert.deepEqual(await readdir(request.outputRoot), []);
  });

  it('rejects a symbolic-link output root', async (t) => {
    const root = await temporaryDirectory(t, 'lagrange-layout-link-');
    const target = path.join(root, 'target');
    const outputRoot = path.join(root, 'linked-output');
    await mkdir(target);
    await symlink(target, outputRoot, 'dir');
    const request = await wasmRequest(t, {outputRoot});

    await assert.rejects(
      new ServiceLocalOciLayoutBuilder().build(request),
      {code: SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.OUTPUT_ROOT_INVALID},
    );
    assert.deepEqual(await readdir(target), []);
  });

  it('rejects a symbolic-link ancestor before creating output', async (t) => {
    const root = await temporaryDirectory(t, 'lagrange-layout-parent-link-');
    const target = path.join(root, 'target');
    const linkedParent = path.join(root, 'linked-parent');
    await mkdir(target);
    await symlink(target, linkedParent, 'dir');
    const request = await wasmRequest(t, {
      outputRoot: path.join(linkedParent, 'layouts'),
    });

    await assert.rejects(
      new ServiceLocalOciLayoutBuilder().build(request),
      {code: SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.OUTPUT_ROOT_INVALID},
    );
    assert.deepEqual(await readdir(target), []);
  });

  it('rejects an exporter that replaces the isolated layout root', async (t) => {
    const request = await containerRequest(t);
    const replacement = await temporaryDirectory(t, 'lagrange-layout-replace-');
    await writeContainerLayout(replacement);
    const exporter = {
      async exportLayout({outputPath}) {
        await rm(outputPath, {recursive: true});
        await symlink(replacement, outputPath, 'dir');
      },
    };

    await assert.rejects(
      new ServiceLocalOciLayoutBuilder({containerExporter: exporter})
        .build(request),
      {code: SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.LAYOUT_INVALID},
    );
    assert.deepEqual(await readdir(request.outputRoot), []);
  });

  it('rejects output-root replacement while an exporter is awaited', async (t) => {
    const request = await containerRequest(t);
    const displacedRoot = `${request.outputRoot}-displaced`;
    const replacementRoot = await temporaryDirectory(
      t,
      'lagrange-output-root-replacement-',
    );
    const exporter = {
      async exportLayout({outputPath}) {
        await rename(request.outputRoot, displacedRoot);
        await symlink(replacementRoot, request.outputRoot, 'dir');
        await writeContainerLayout(outputPath);
      },
    };

    await assert.rejects(
      new ServiceLocalOciLayoutBuilder({containerExporter: exporter})
        .build(request),
      {code: SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.OUTPUT_ROOT_INVALID},
    );
    assert.equal((await lstat(request.outputRoot)).isSymbolicLink(), true);
    assert.deepEqual(await readdir(replacementRoot), []);
  });

  for (const graphDirectory of [
    ['blobs'],
    ['blobs', 'sha256'],
  ]) {
    it(`rejects linked OCI graph directory ${graphDirectory.join('/')}`,
      async (t) => {
        const request = await containerRequest(t);
        const externalRoot = await temporaryDirectory(
          t,
          'lagrange-external-graph-',
        );
        const externalDirectory = path.join(
          externalRoot,
          graphDirectory.join('-'),
        );
        const exporter = {
          async exportLayout({outputPath}) {
            await writeContainerLayout(outputPath);
            const internalDirectory = path.join(outputPath, ...graphDirectory);
            await rename(internalDirectory, externalDirectory);
            await symlink(externalDirectory, internalDirectory, 'dir');
          },
        };

        await assert.rejects(
          new ServiceLocalOciLayoutBuilder({containerExporter: exporter})
            .build(request),
          {code: SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE.LAYOUT_INVALID},
        );
        assert.deepEqual(await readdir(request.outputRoot), []);
        assert.equal((await lstat(externalDirectory)).isDirectory(), true);
      });
  }
});

describe('Docker Buildx OCI layout adapter', () => {
  it('rejects explicitly invalid injected dependencies', () => {
    assert.throws(
      () => new ServiceLocalOciLayoutBuilder({containerExporter: null}),
      TypeError,
    );
    assert.throws(
      () => new DockerBuildxOciLayoutExporter({executeFile: null}),
      TypeError,
    );
    assert.throws(
      () => new DockerBuildxOciLayoutExporter({dockerCommand: ''}),
      TypeError,
    );
  });

  it('uses an argv-only reproducible OCI directory export', async (t) => {
    const root = await temporaryDirectory(t, 'lagrange-buildx-adapter-');
    const calls = [];
    const adapter = new DockerBuildxOciLayoutExporter({
      async executeFile(file, args, options) {
        calls.push({file, args, options});
      },
    });

    await adapter.exportLayout({
      contextPath: path.join(root, 'context'),
      dockerfilePath: path.join(root, 'context', 'Dockerfile'),
      outputPath: path.join(root, 'layout'),
      platform: PLATFORM,
      sourceDateEpoch: SOURCE_DATE_EPOCH,
      buildArgs: {ZETA: 'last', ALPHA: 'first'},
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].file, 'docker');
    assert.deepEqual(calls[0].args, [
      'buildx',
      'build',
      '--file',
      path.join(root, 'context', 'Dockerfile'),
      '--platform',
      PLATFORM,
      '--provenance=false',
      '--output',
      `type=oci,dest=${path.join(root, 'layout')},tar=false,` +
        'oci-mediatypes=true,rewrite-timestamp=true',
      '--build-arg',
      'ALPHA=first',
      '--build-arg',
      'ZETA=last',
      path.join(root, 'context'),
    ]);
    assert.equal(calls[0].options.env.SOURCE_DATE_EPOCH,
      String(SOURCE_DATE_EPOCH));
    assert.equal(calls[0].options.shell, false);
  });
});
