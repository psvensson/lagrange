import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {componentize} from '@bytecodealliance/componentize-js';

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

const EXAMPLE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));

const BUILD = Object.freeze({
  ARTIFACT_SOURCE_KIND: 'local_oci_layout',
  ARTIFACT_TYPE: 'oci',
  DISABLED_ENGINE_FEATURES:
    Object.freeze(['random', 'stdio', 'clocks', 'http', 'fetch-event']),
  SOURCE_ENCODING: 'utf8',
  SOURCE_KIND: 'call',
  // Canonical authoring WIT package at the repo root (wit/world.wit).
  WIT_DIRECTORY: '../../wit',
  WIT_WORLD: 'call-cell',
});

const CALL_EXAMPLE = Object.freeze({
  BINDING_NAME: 'account-summary',
  COMPONENT_EXPORT: 'run',
  COMPONENT_FILE: 'component.wasm',
  COMPONENT_SOURCE_FILE: 'service.js',
  IDEMPOTENCY_KEY: 'install-call-binding-account-summary-v1',
  PLATFORM: 'linux/amd64',
  SERVICE_NAME: 'account-summary',
  SOURCE_DATE_EPOCH: 1_700_000_000,
  // The Binding-declared partition-local statement: a single-table SELECT
  // the engine plans per partition. Each shard's host node executes it
  // against its own replica; the rows never leave that node.
  STATEMENT:
    'SELECT id, account_id, amount_cents, flagged FROM account_activity',
  TABLE: 'account_activity',
  VERSION: '1.0.0',
});

const BUDGETS = Object.freeze({
  context_bytes: 8_192,
  cpu_time_ms: 2_000,
  input_bytes: 1_048_576,
  memory_bytes: 128 * 1024 * 1024,
  output_bytes: 65_536,
  wall_time_ms: 30_000,
});

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

async function buildCallComponent(paths, definition = CALL_EXAMPLE) {
  const source = await readFile(
    paths.componentSourcePath,
    BUILD.SOURCE_ENCODING,
  );
  const {component} = await componentize(source, {
    disableFeatures: [...BUILD.DISABLED_ENGINE_FEATURES],
    witPath: path.join(EXAMPLE_DIRECTORY, BUILD.WIT_DIRECTORY),
    worldName: BUILD.WIT_WORLD,
  });
  await writeFile(paths.componentPath, component);
  return new ServiceLocalOciLayoutBuilder().build({
    outputRoot: paths.ociOutputRoot,
    platform: definition.PLATFORM,
    runtimeKind: RUNTIME_KIND.WASM_COMPONENT,
    sourceDateEpoch: definition.SOURCE_DATE_EPOCH,
    wasm: {payloadPath: paths.componentPath},
  });
}

function buildCallManifest(receipt, definition = CALL_EXAMPLE) {
  return {
    artifact: {
      digest: receipt.topManifestDescriptor.digest,
      media_type: EXTERNAL_SERVICE_MEDIA_TYPE.WASM_COMPONENT,
      ref:
        `registry.example.test/examples/${definition.SERVICE_NAME}:` +
        definition.VERSION,
      size_bytes: receipt.topManifestDescriptor.sizeBytes,
      type: BUILD.ARTIFACT_TYPE,
    },
    capabilities: [],
    exports: [{
      interface: EXTERNAL_SERVICE_EXPORT_INTERFACE.CALL,
      name: definition.COMPONENT_EXPORT,
    }],
    name: definition.SERVICE_NAME,
    runtime: {kind: RUNTIME_KIND.WASM_COMPONENT},
    schema_version: EXTERNAL_SERVICE_MANIFEST_SCHEMA_VERSION,
    version: definition.VERSION,
  };
}

function buildCallInstallPayload(manifest, receipt, definition = CALL_EXAMPLE) {
  return {
    artifact_source: {
      kind: BUILD.ARTIFACT_SOURCE_KIND,
      location: receipt.layoutPath,
    },
    config: {},
    idempotency_key: definition.IDEMPOTENCY_KEY,
    manifest,
  };
}

function buildCallBindingPayload(
  packageId,
  manifest,
  definition = CALL_EXAMPLE,
  budgets = BUDGETS,
) {
  return {
    budgets: {...budgets},
    name: definition.BINDING_NAME,
    schema_version: 2,
    source: {
      kind: BUILD.SOURCE_KIND,
      name: definition.BINDING_NAME,
      statement: definition.STATEMENT,
    },
    target: {
      export_name: definition.COMPONENT_EXPORT,
      manifest_digest: sha256(canonicalJson(manifest)),
      package_id: packageId,
    },
  };
}

export {
  BUDGETS,
  CALL_EXAMPLE,
  buildCallBindingPayload,
  buildCallComponent,
  buildCallInstallPayload,
  buildCallManifest,
};
