/**
 * Debug runtime constants for Track B runtime foundation.
 *
 * Defines adapter kinds, operation names, state values, and
 * error messages used by debug-runtime modules.
 */

import {
  DEBUG_CAPABILITY,
} from '../debug/debug-constants.js';

const WASM_RUNTIME_ADAPTER_KIND = Object.freeze({
  ABSTRACT: 'abstract',
  IN_PROCESS: 'in_process',
});

const WASM_RUNTIME_OPERATION = Object.freeze({
  CREATE_INSTANCE: 'createInstance',
  EXECUTE: 'execute',
  SUSPEND: 'suspend',
  RESUME: 'resume',
  INSPECT: 'inspect',
  DESTROY_INSTANCE: 'destroyInstance',
});

const WASM_RUNTIME_ADAPTER_STATE = Object.freeze({
  RUNNING: 'running',
  PAUSED: 'paused',
});

const WASM_RUNTIME_DEFAULT = Object.freeze({
  EXECUTION_TIMEOUT_MS: 30000,
});

const WASM_RUNTIME_ADAPTER_ERROR_MSG = Object.freeze({
  ABSTRACT_CLASS:
    'WasmRuntimeAdapter is abstract and cannot be instantiated directly',
  METHOD_NOT_IMPLEMENTED:
    'WasmRuntimeAdapter method not implemented: ',
  REQUEST_REQUIRED: 'Runtime request is required',
  MODULE_REF_REQUIRED: 'Runtime request requires non-empty moduleRef',
  MODULE_ENTRY_REQUIRED: 'Runtime request requires moduleEntry object',
  INSTANCE_HANDLE_REQUIRED: 'Runtime request requires instanceHandle',
  INSTANCE_ID_REQUIRED: 'Runtime request requires instanceHandle.instanceId',
  INSTANCE_NOT_FOUND: 'Runtime instance not found: ',
  MANIFEST_REQUIRED: 'Runtime execute request requires manifest object',
  RUN_EXPORT_REQUIRED: 'Runtime execute request requires runExport',
  RUN_EXPORT_NOT_FOUND:
    'Runtime execute request runExport not found in module exports',
  RUN_EXPORT_NOT_CALLABLE:
    'Runtime execute request runExport must be a function',
  EXECUTION_TIMEOUT: 'Runtime execution timed out',
  EXECUTION_CANCELLED: 'Runtime execution cancelled',
  CAPABILITY_REQUIRED: 'Capability name is required',
  IMPORT_NAMESPACE_REQUIRED: 'Import namespace is required',
  IMPORT_MODULE_REQUIRED: 'Import module object is required',
});

const HOST_IMPORT_NAMESPACE = Object.freeze({
  ENV: 'env',
  DB: 'db',
  DEBUG: 'debug',
});

export {
  WASM_RUNTIME_ADAPTER_KIND,
  WASM_RUNTIME_OPERATION,
  WASM_RUNTIME_ADAPTER_STATE,
  WASM_RUNTIME_DEFAULT,
  WASM_RUNTIME_ADAPTER_ERROR_MSG,
  HOST_IMPORT_NAMESPACE,
  DEBUG_CAPABILITY,
};
