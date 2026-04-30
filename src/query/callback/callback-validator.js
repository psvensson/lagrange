/**
 * Callback Validator — validates async WASM entry exports
 * against the required runtime callback signature contract.
 *
 * Before executing a DB.call callback, the system must verify:
 * 1. The export exists in the module.
 * 2. The export is a function.
 * 3. The export is async (returns a Promise).
 * 4. The parameter count matches the contract (2-3 params).
 * 5. The export matches the manifest's declared run_export.
 *
 * Requirements: 4.3, 4.5, 7.3
 */

import {NUM, TYPEOF} from '../../constants/index.js';
import {
  CALLBACK_MIN_PARAMS,
  CALLBACK_MAX_PARAMS,
  CALLBACK_FIELD,
  CALLBACK_ERROR_MSG,
} from './callback-constants.js';

const LOCAL_STR_ASYNCFUNCTION = 'AsyncFunction';

/**
 * Validate that a callback descriptor has the required fields.
 *
 * @param {Object} descriptor - Callback descriptor.
 * @param {string} descriptor.moduleRef - Module reference ID.
 * @param {string} descriptor.exportName - Export function name.
 * @return {{valid: boolean, errors: string[]}} Validation result.
 */
function validateCallbackDescriptor(descriptor) {
  const errors = [];

  if (!descriptor) {
    errors.push(CALLBACK_ERROR_MSG.MODULE_REF_REQUIRED);
    errors.push(CALLBACK_ERROR_MSG.EXPORT_NAME_REQUIRED);
    return {valid: false, errors};
  }

  if (!descriptor[CALLBACK_FIELD.MODULE_REF]) {
    errors.push(CALLBACK_ERROR_MSG.MODULE_REF_REQUIRED);
  }
  if (!descriptor[CALLBACK_FIELD.EXPORT_NAME]) {
    errors.push(CALLBACK_ERROR_MSG.EXPORT_NAME_REQUIRED);
  }

  return {valid: errors.length === NUM.ZERO, errors};
}

/**
 * Validate that a resolved WASM export matches the required
 * async callback signature contract.
 *
 * The export must be:
 * - A function (typeof === 'function')
 * - Async (constructor.name === 'AsyncFunction' or returns
 *   a thenable when probed)
 * - Accept 2-3 parameters (context, partitionBatch[, options])
 *
 * Requirement 4.3: Support asynchronous WASM entry exports.
 * Requirement 4.5: Validate callback signatures and reject
 *   incompatible entry exports before execution.
 *
 * @param {*} exportFn - The resolved export from the module.
 * @param {string} exportName - Name of the export (for errors).
 * @return {{valid: boolean, errors: string[]}} Validation result.
 */
function validateCallbackSignature(exportFn, _exportName) {
  const errors = [];

  if (exportFn === undefined || exportFn === null) {
    errors.push(CALLBACK_ERROR_MSG.EXPORT_NOT_FOUND);
    return {valid: false, errors};
  }

  if (typeof exportFn !== TYPEOF.FUNCTION) {
    errors.push(CALLBACK_ERROR_MSG.EXPORT_NOT_FUNCTION);
    return {valid: false, errors};
  }

  if (!isAsyncFunction(exportFn)) {
    errors.push(CALLBACK_ERROR_MSG.EXPORT_NOT_ASYNC);
  }

  const paramCount = exportFn.length;
  if (paramCount < CALLBACK_MIN_PARAMS) {
    errors.push(CALLBACK_ERROR_MSG.PARAM_COUNT_TOO_FEW);
  }
  if (paramCount > CALLBACK_MAX_PARAMS) {
    errors.push(CALLBACK_ERROR_MSG.PARAM_COUNT_TOO_MANY);
  }

  return {valid: errors.length === NUM.ZERO, errors};
}

/**
 * Validate that the callback export matches the manifest's
 * declared run_export field.
 *
 * Requirement 7.3: Before activation, validate that run_export
 * exists in the module and matches the required execution
 * signature.
 *
 * @param {string} exportName - The export name being invoked.
 * @param {Object} manifest - Module manifest object.
 * @param {string} manifest.runExport - Declared run_export.
 * @param {string[]} manifest.exports - Declared exports list.
 * @return {{valid: boolean, errors: string[]}} Validation result.
 */
function validateCallbackAgainstManifest(exportName, manifest) {
  const errors = [];

  if (!manifest) {
    errors.push(CALLBACK_ERROR_MSG.MANIFEST_REQUIRED);
    return {valid: false, errors};
  }

  const declaredExports = manifest.exports || [];
  if (!declaredExports.includes(exportName)) {
    errors.push(CALLBACK_ERROR_MSG.EXPORT_NOT_FOUND);
  }

  if (manifest.runExport && manifest.runExport !== exportName) {
    errors.push(CALLBACK_ERROR_MSG.RUN_EXPORT_MISMATCH);
  }

  return {valid: errors.length === NUM.ZERO, errors};
}

/**
 * Full validation pipeline: descriptor + manifest + signature.
 *
 * Runs all three validation stages and aggregates errors.
 *
 * @param {Object} descriptor - Callback descriptor with
 *   moduleRef and exportName.
 * @param {Object} manifest - Module manifest object.
 * @param {*} exportFn - The resolved export function.
 * @return {{valid: boolean, errors: string[]}} Combined result.
 */
function validateCallback(descriptor, manifest, exportFn) {
  const allErrors = [];

  const descResult = validateCallbackDescriptor(descriptor);
  allErrors.push(...descResult.errors);
  if (!descResult.valid) {
    return {valid: false, errors: allErrors};
  }

  const manifestResult = validateCallbackAgainstManifest(
    descriptor[CALLBACK_FIELD.EXPORT_NAME], manifest,
  );
  allErrors.push(...manifestResult.errors);

  const sigResult = validateCallbackSignature(
    exportFn, descriptor[CALLBACK_FIELD.EXPORT_NAME],
  );
  allErrors.push(...sigResult.errors);

  return {valid: allErrors.length === NUM.ZERO, errors: allErrors};
}

/**
 * Check whether a function is async.
 *
 * Detects AsyncFunction constructor name. This works for
 * native async functions and async arrow functions.
 *
 * @param {Function} fn - Function to check.
 * @return {boolean} True if fn is an async function.
 */
function isAsyncFunction(fn) {
  if (typeof fn !== TYPEOF.FUNCTION) return false;
  return fn.constructor.name === LOCAL_STR_ASYNCFUNCTION;
}

export {
  validateCallbackDescriptor,
  validateCallbackSignature,
  validateCallbackAgainstManifest,
  validateCallback,
  isAsyncFunction,
};
