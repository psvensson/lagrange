/**
 * Callback module artifact helpers.
 *
 * Encodes/decodes JS callback source into a wasm_component-compatible
 * artifact payload used by the examples pipeline and runtime loader.
 */

import {TYPEOF} from '../../constants/index.js';

const ARTIFACT_FORMAT = Object.freeze({
  JS_WASM_COMPONENT_V1: 'js_wasm_component_v1',
});

const ARTIFACT_FIELD = Object.freeze({
  FORMAT: 'format',
  SOURCE: 'source',
  WASM_BYTES_BASE64: 'wasmBytesBase64',
  RUN_EXPORT: 'runExport',
  EXPORTS: 'exports',
});

const ARTIFACT_ENCODING = Object.freeze({
  UTF8: 'utf8',
  BASE64: 'base64',
});

const LOG_JSON_PARSE_FAILED = 'JSON.parse failed for code blob';

const CALLBACK_ARTIFACT_ERROR_MSG = Object.freeze({
  SOURCE_REQUIRED: 'callback artifact source must be a non-empty string',
  RUN_EXPORT_REQUIRED: 'callback artifact runExport must be a non-empty string',
  CODE_BLOB_REQUIRED: 'callback artifact codeBlob must be a non-empty string',
});

/**
 * Build a serialized js_wasm_component_v1 artifact payload.
 *
 * @param {string} source - Callback module source.
 * @param {string} runExport - Run export name.
 * @return {string} Serialized artifact JSON.
 */
function buildJsWasmComponentArtifact(source, runExport) {
  if (!source || typeof source !== TYPEOF.STRING) {
    throw new Error(CALLBACK_ARTIFACT_ERROR_MSG.SOURCE_REQUIRED);
  }
  if (!runExport || typeof runExport !== TYPEOF.STRING) {
    throw new Error(CALLBACK_ARTIFACT_ERROR_MSG.RUN_EXPORT_REQUIRED);
  }

  const wasmBytes = Buffer.from(source, ARTIFACT_ENCODING.UTF8);
  return JSON.stringify({
    [ARTIFACT_FIELD.FORMAT]: ARTIFACT_FORMAT.JS_WASM_COMPONENT_V1,
    [ARTIFACT_FIELD.SOURCE]: source,
    [ARTIFACT_FIELD.WASM_BYTES_BASE64]:
      wasmBytes.toString(ARTIFACT_ENCODING.BASE64),
    [ARTIFACT_FIELD.RUN_EXPORT]: runExport,
    [ARTIFACT_FIELD.EXPORTS]: [runExport],
  });
}

/**
 * Parse a callback module artifact blob.
 *
 * If the blob is not a recognized artifact envelope, it is treated as raw
 * source text and converted to UTF-8 bytes.
 *
 * @param {string} codeBlob - Serialized artifact blob or raw source.
 * @return {{
 *   format: string|null,
 *   source: string,
 *   wasmBytes: Buffer,
 *   runExport: string|null,
 *   exports: string[]
 * }}
 */
function parseCallbackModuleArtifact(codeBlob) {
  if (!codeBlob || typeof codeBlob !== TYPEOF.STRING) {
    throw new Error(CALLBACK_ARTIFACT_ERROR_MSG.CODE_BLOB_REQUIRED);
  }

  let parsed = null;
  try {
    parsed = JSON.parse(codeBlob);
  } catch (parseErr) {
    console.warn(LOG_JSON_PARSE_FAILED, parseErr.message);
    parsed = null;
  }

  if (parsed &&
    typeof parsed === TYPEOF.OBJECT &&
    parsed[ARTIFACT_FIELD.FORMAT] === ARTIFACT_FORMAT.JS_WASM_COMPONENT_V1 &&
    typeof parsed[ARTIFACT_FIELD.SOURCE] === TYPEOF.STRING) {
    const source = parsed[ARTIFACT_FIELD.SOURCE];
    const wasmBytesBase64 = parsed[ARTIFACT_FIELD.WASM_BYTES_BASE64];
    const wasmBytes = typeof wasmBytesBase64 === TYPEOF.STRING ?
      Buffer.from(wasmBytesBase64, ARTIFACT_ENCODING.BASE64) :
      Buffer.from(source, ARTIFACT_ENCODING.UTF8);
    const runExport = typeof parsed[ARTIFACT_FIELD.RUN_EXPORT] === TYPEOF.STRING ?
      parsed[ARTIFACT_FIELD.RUN_EXPORT] :
      null;
    const exports = Array.isArray(parsed[ARTIFACT_FIELD.EXPORTS]) ?
      parsed[ARTIFACT_FIELD.EXPORTS].filter((entry) => typeof entry === TYPEOF.STRING) :
      [];
    return {
      format: ARTIFACT_FORMAT.JS_WASM_COMPONENT_V1,
      source,
      wasmBytes,
      runExport,
      exports,
    };
  }

  return {
    format: null,
    source: codeBlob,
    wasmBytes: Buffer.from(codeBlob, ARTIFACT_ENCODING.UTF8),
    runExport: null,
    exports: [],
  };
}

export {
  ARTIFACT_FORMAT,
  CALLBACK_ARTIFACT_ERROR_MSG,
  buildJsWasmComponentArtifact,
  parseCallbackModuleArtifact,
};
