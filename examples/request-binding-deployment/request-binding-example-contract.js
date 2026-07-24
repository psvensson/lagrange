import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {promisify} from 'node:util';

import {
  RUNTIME_KIND,
} from '../../src/constants/index.js';
import {
  canonicalJson,
} from '../../src/control-plane/owners/deployment-binding-contract.js';
import {
  ServiceLocalOciLayoutBuilder,
} from '../../src/service/service-local-oci-layout-builder.js';
import {
  EXTERNAL_SERVICE_EXPORT_INTERFACE,
  EXTERNAL_SERVICE_MANIFEST_SCHEMA_VERSION,
  EXTERNAL_SERVICE_MEDIA_TYPE,
} from '../../src/service/external-service-manifest.js';

const execFileAsync = promisify(execFile);

const BUILD = Object.freeze({
  ARTIFACT_SOURCE_KIND: 'local_oci_layout',
  ARTIFACT_TYPE: 'oci',
  HASH_ALGORITHM: 'sha256',
  HASH_ENCODING: 'hex',
  OUTPUT_FLAG: '-o',
  SOURCE_KIND: 'request',
  WASM_TOOLS_COMMAND: 'wasm-tools',
  WASM_TOOLS_PARSE: 'parse',
});
const ACCESS_OPERATIONS = Object.freeze(['read', 'write']);
const EXAMPLE = Object.freeze({
  BINDING_NAME: 'request-binding-example',
  COMPONENT_EXPORT: 'run',
  COMPONENT_FILE: 'component.wasm',
  COMPONENT_SOURCE_FILE: 'component.wat',
  DECLARED_TABLE: 'table:global.request_binding_audit',
  DENIED_TABLE_SLOT: 1,
  IDEMPOTENCY_KEY: 'install-request-binding-example-v1',
  METHOD: 'POST',
  PATH: '/examples/request-binding',
  PLATFORM: 'linux/amd64',
  SERVICE_NAME: 'request-binding-example',
  SOURCE_DATE_EPOCH: 1_700_000_000,
  VERSION: '1.0.0',
});

const BUDGETS = Object.freeze({
  context_bytes: 8_192,
  cpu_time_ms: 100,
  input_bytes: 16_384,
  memory_bytes: 64 * 1024 * 1024,
  output_bytes: 4_096,
  wall_time_ms: 2_000,
});

function sha256(bytes) {
  return `sha256:${createHash(BUILD.HASH_ALGORITHM)
    .update(bytes)
    .digest(BUILD.HASH_ENCODING)}`;
}

async function buildComponent(paths) {
  await execFileAsync(BUILD.WASM_TOOLS_COMMAND, [
    BUILD.WASM_TOOLS_PARSE,
    paths.componentSourcePath,
    BUILD.OUTPUT_FLAG,
    paths.componentPath,
  ]);
  return new ServiceLocalOciLayoutBuilder().build({
    outputRoot: paths.ociOutputRoot,
    platform: EXAMPLE.PLATFORM,
    runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
    sourceDateEpoch: EXAMPLE.SOURCE_DATE_EPOCH,
    wasm: {payloadPath: paths.componentPath},
  });
}

function buildManifest(receipt) {
  return {
    artifact: {
      digest: receipt.topManifestDescriptor.digest,
      media_type: EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT,
      ref:
        `registry.example.test/examples/${EXAMPLE.SERVICE_NAME}:` +
        EXAMPLE.VERSION,
      size_bytes: receipt.topManifestDescriptor.sizeBytes,
      type: BUILD.ARTIFACT_TYPE,
    },
    capabilities: [],
    exports: [{
      interface: EXTERNAL_SERVICE_EXPORT_INTERFACE.REQUEST,
      name: EXAMPLE.COMPONENT_EXPORT,
    }],
    name: EXAMPLE.SERVICE_NAME,
    runtime: {kind: RUNTIME_KIND.WASM_COMPONENT},
    schema_version: EXTERNAL_SERVICE_MANIFEST_SCHEMA_VERSION,
    version: EXAMPLE.VERSION,
  };
}

function buildInstallPayload(manifest, receipt) {
  return {
    artifact_source: {
      kind: BUILD.ARTIFACT_SOURCE_KIND,
      location: receipt.layoutPath,
    },
    config: {},
    idempotency_key: EXAMPLE.IDEMPOTENCY_KEY,
    manifest,
  };
}

function buildBindingPayload(packageId, manifest) {
  return {
    budgets: {...BUDGETS},
    name: EXAMPLE.BINDING_NAME,
    schema_version: 2,
    source: {
      kind: BUILD.SOURCE_KIND,
      method: EXAMPLE.METHOD,
      path: EXAMPLE.PATH,
    },
    target: {
      export_name: EXAMPLE.COMPONENT_EXPORT,
      manifest_digest: sha256(canonicalJson(manifest)),
      package_id: packageId,
    },
  };
}

function buildAccessPayload() {
  return {
    binding_name: EXAMPLE.BINDING_NAME,
    schema_version: 1,
    tables: [{
      operations: [...ACCESS_OPERATIONS],
      slot: 0,
      table: EXAMPLE.DECLARED_TABLE,
    }],
  };
}

export {
  BUDGETS,
  EXAMPLE,
  buildAccessPayload,
  buildBindingPayload,
  buildComponent,
  buildInstallPayload,
  buildManifest,
};
