/**
 * Manifest Runtime Validator — validates that a WASM module
 * instance satisfies its manifest's run_export contract.
 *
 * Before activation, the system must verify:
 * 1. The manifest itself is structurally valid.
 * 2. run_export exists in the actual WASM module instance.
 * 3. run_export resolves to a function.
 * 4. run_export signature matches the runtime contract
 *    (2-3 params: context, batch, options?).
 *
 * Requirements: 7.1, 7.2, 7.3
 */

import {NUM, TYPEOF} from '../constants/index.js';
import {
  MODULE_MANIFEST_FIELD as MF,
  MODULE_MANIFEST_ERROR_MSG as ERR,
  RUN_EXPORT_MIN_PARAMS,
  RUN_EXPORT_MAX_PARAMS,
} from './module-manifest-constants.js';
import {validateModuleManifest} from './module-manifest-models.js';

/**
 * Validate that run_export exists in the module instance
 * and resolves to a callable function.
 *
 * @param {Object} moduleExports - The WASM module instance
 *   exports object (e.g., instance.exports).
 * @param {string} runExportName - The declared run_export name.
 * @return {{valid: boolean, errors: string[]}} Result.
 */
function validateRunExportExists(moduleExports, runExportName) {
  const errors = [];

  if (!moduleExports || typeof moduleExports !== TYPEOF.OBJECT) {
    errors.push(ERR.MODULE_INSTANCE_REQUIRED);
    return {valid: false, errors};
  }

  if (!runExportName) {
    errors.push(ERR.RUN_EXPORT_REQUIRED);
    return {valid: false, errors};
  }

  const exportFn = moduleExports[runExportName];

  if (exportFn === undefined || exportFn === null) {
    errors.push(ERR.RUN_EXPORT_MISSING_IN_MODULE);
    return {valid: false, errors};
  }

  if (typeof exportFn !== TYPEOF.FUNCTION) {
    errors.push(ERR.RUN_EXPORT_NOT_FUNCTION);
    return {valid: false, errors};
  }

  return {valid: true, errors};
}

/**
 * Validate that run_export function signature matches the
 * required runtime contract: (context, batch[, options]).
 *
 * @param {Function} exportFn - The resolved export function.
 * @return {{valid: boolean, errors: string[]}} Result.
 */
function validateRunExportSignature(exportFn) {
  const errors = [];

  if (typeof exportFn !== TYPEOF.FUNCTION) {
    errors.push(ERR.RUN_EXPORT_NOT_FUNCTION);
    return {valid: false, errors};
  }

  const paramCount = exportFn.length;
  if (paramCount < RUN_EXPORT_MIN_PARAMS ||
      paramCount > RUN_EXPORT_MAX_PARAMS) {
    errors.push(ERR.RUN_EXPORT_SIGNATURE_MISMATCH);
  }

  return {valid: errors.length === NUM.ZERO, errors};
}

/**
 * Full manifest runtime validation pipeline.
 *
 * Runs all validation stages in order:
 * 1. Structural manifest validation (fields, digest, etc.)
 * 2. run_export existence in module instance.
 * 3. run_export signature match against runtime contract.
 *
 * @param {Object} manifest - Module manifest object.
 * @param {Object} moduleExports - WASM module instance exports.
 * @return {{valid: boolean, errors: string[]}} Combined result.
 */
function validateManifestRuntime(manifest, moduleExports) {
  const allErrors = [];

  if (!manifest) {
    allErrors.push(ERR.MANIFEST_REQUIRED);
    return {valid: false, errors: allErrors};
  }

  if (!moduleExports || typeof moduleExports !== TYPEOF.OBJECT) {
    allErrors.push(ERR.MODULE_INSTANCE_REQUIRED);
    return {valid: false, errors: allErrors};
  }

  const structResult = validateModuleManifest(manifest);
  allErrors.push(...structResult.errors);
  if (!structResult.valid) {
    return {valid: false, errors: allErrors};
  }

  const runExportName = manifest[MF.RUN_EXPORT];
  const existResult = validateRunExportExists(
    moduleExports, runExportName
  );
  allErrors.push(...existResult.errors);
  if (!existResult.valid) {
    return {valid: false, errors: allErrors};
  }

  const exportFn = moduleExports[runExportName];
  const sigResult = validateRunExportSignature(exportFn);
  allErrors.push(...sigResult.errors);

  return {valid: allErrors.length === NUM.ZERO, errors: allErrors};
}

export {
  validateRunExportExists,
  validateRunExportSignature,
  validateManifestRuntime,
};
