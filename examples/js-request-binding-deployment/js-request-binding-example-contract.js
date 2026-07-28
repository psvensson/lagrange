import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {componentize} from '@bytecodealliance/componentize-js';

import {
  RUNTIME_KIND,
} from '../../src/constants/index.js';
import {
  ServiceLocalOciLayoutBuilder,
} from '../../src/service/service-local-oci-layout-builder.js';

const EXAMPLE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));

const BUILD = Object.freeze({
  DISABLED_ENGINE_FEATURES:
    Object.freeze(['random', 'stdio', 'clocks', 'http', 'fetch-event']),
  SOURCE_ENCODING: 'utf8',
  WIT_DIRECTORY: 'wit',
  WIT_WORLD: 'request-cell',
});
const ACCESS_OPERATIONS = Object.freeze(['read', 'write']);
const DECLARED_TABLE_SLOT = 0;
const ACCESS_SCHEMA_VERSION = 1;

const JS_EXAMPLE = Object.freeze({
  BINDING_NAME: 'js-request-binding-example',
  COMPONENT_EXPORT: 'run',
  COMPONENT_FILE: 'component.wasm',
  COMPONENT_SOURCE_FILE: 'service.js',
  DECLARED_TABLE: 'table:global.js_request_binding_ledger',
  DENIED_TABLE_SLOT: 1,
  IDEMPOTENCY_KEY: 'install-js-request-binding-example-v1',
  METHOD: 'POST',
  PATH: '/examples/js-request-binding',
  PLATFORM: 'linux/amd64',
  SERVICE_NAME: 'js-request-binding-example',
  SOURCE_DATE_EPOCH: 1_700_000_000,
  VERSION: '1.0.0',
});

async function buildJsComponent(paths, definition = JS_EXAMPLE) {
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

function buildJsAccessPayload(definition = JS_EXAMPLE) {
  return {
    binding_name: definition.BINDING_NAME,
    schema_version: ACCESS_SCHEMA_VERSION,
    tables: [{
      operations: [...ACCESS_OPERATIONS],
      slot: DECLARED_TABLE_SLOT,
      table: definition.DECLARED_TABLE,
    }],
  };
}

export {
  BUILD,
  JS_EXAMPLE,
  buildJsAccessPayload,
  buildJsComponent,
};
