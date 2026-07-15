/**
 * Shared constants for distributed SQL examples runner modules.
 */

import {LISTENER_PORT_DEFAULT} from
  '../../src/config/listener-port-model.js';

const DEFAULT_TARGET = 'ws://127.0.0.1:' +
  `${LISTENER_PORT_DEFAULT.ADMIN_WEBSOCKET}/api/admin/stream`;
const DEFAULT_EXAMPLES_DIR = 'examples/distributed-sql';
const DEFAULT_OUTPUT_DIR = 'test-output/examples';
const DEFAULT_TIMEOUT_MS = 30000;
const CODE_TABLE_VERSION = 1;
const RUN_ID_RANDOM_SLICE_LENGTH = 8;
const WS_OPEN_STATE = 1;
const TEXT_ENCODING_UTF8 = 'utf8';
const JSON_SPACES = 2;

const FILE_NAME = Object.freeze({
  EXAMPLE_MANIFEST: 'example.manifest.json',
  EXPECTED: 'expected.json',
});

const EXAMPLE_DEFAULT = Object.freeze({
  VERSION: '1.0.0',
  LEVEL: 'basic',
});

const EXPECTED_CONTRACT = Object.freeze({
  SHAPE_ARRAY: 'array',
  FIRST_ROW_ERROR_INCLUDES: 'errorIncludes',
});

const CLI_ARG = Object.freeze({
  TARGET: '--target',
  INCLUDE: '--include',
  EXCLUDE: '--exclude',
  OUT: '--out',
  EXAMPLES_DIR: '--examplesDir',
});

const MESSAGE_TYPE = Object.freeze({
  QUERY: 'query',
  PARTITION_CALLBACK: 'partition_callback',
  QUERY_RESULT: 'query_result',
});

const RUNTIME_KIND = Object.freeze({
  NATIVE_JS: 'native_js',
  WASM_COMPONENT: 'wasm_component',
});

const CODE_EXECUTOR_TYPE = Object.freeze({
  NATIVE_JS: 'native_js',
  WASM_SERVICE: 'wasm_service',
});

const CODE_PERMISSIONS_EMPTY = '[]';
const MODULE_NAMESPACE = 'examples';
const MODULE_DEPENDENCIES_EMPTY = '[]';
const MODULE_CAPABILITIES_EMPTY = '[]';

const EXAMPLE_DIR_NAME_PREFIX = /^\d{2}-/;
const VERSION_SANITIZE_REGEX = /[^a-zA-Z0-9]/g;
const HEX_DIGEST_PREFIX = 'sha256:';
const MODULE_EXPORTS_ARG = 'exports';
const MODULE_OBJECT_ARG = 'module';
const MODULE_RETURN_LINE = 'return module.exports;';

const RUN_ID_TIMESTAMP_SANITIZE_REGEX = /[-:.]/g;

const INSERT_CODE_SQL =
  'INSERT OR REPLACE INTO code ' +
  '(function_id, function_name, version, executor_type, code_blob, signature, permissions, ' +
  'created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';

const INSERT_MODULE_MANIFEST_SQL =
  'INSERT OR REPLACE INTO module_manifests ' +
  '(namespace, name, version, digest, run_export, exports, dependencies, capabilities, ' +
  'source_reference, artifact_pointer, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

/**
 * Build callback signature payload for code table rows.
 *
 * @param {string} exportName
 * @return {string}
 */
function codeSignature(exportName) {
  return JSON.stringify({
    runExport: exportName,
    exports: [exportName],
  });
}

/**
 * Build module exports array payload for module manifest rows.
 *
 * @param {string} exportName
 * @return {string}
 */
function moduleExportsSingle(exportName) {
  return JSON.stringify([exportName]);
}

export {
  DEFAULT_TARGET,
  DEFAULT_EXAMPLES_DIR,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_TIMEOUT_MS,
  CODE_TABLE_VERSION,
  RUN_ID_RANDOM_SLICE_LENGTH,
  WS_OPEN_STATE,
  TEXT_ENCODING_UTF8,
  JSON_SPACES,
  FILE_NAME,
  EXAMPLE_DEFAULT,
  EXPECTED_CONTRACT,
  CLI_ARG,
  MESSAGE_TYPE,
  RUNTIME_KIND,
  CODE_EXECUTOR_TYPE,
  CODE_PERMISSIONS_EMPTY,
  MODULE_NAMESPACE,
  MODULE_DEPENDENCIES_EMPTY,
  MODULE_CAPABILITIES_EMPTY,
  EXAMPLE_DIR_NAME_PREFIX,
  VERSION_SANITIZE_REGEX,
  HEX_DIGEST_PREFIX,
  MODULE_EXPORTS_ARG,
  MODULE_OBJECT_ARG,
  MODULE_RETURN_LINE,
  RUN_ID_TIMESTAMP_SANITIZE_REGEX,
  INSERT_CODE_SQL,
  INSERT_MODULE_MANIFEST_SQL,
  codeSignature,
  moduleExportsSingle,
};
