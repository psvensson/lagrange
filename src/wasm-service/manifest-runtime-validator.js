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

import {
  MODULE_MANIFEST_FIELD as MF,
  MODULE_MANIFEST_ERROR_MSG as ERR,
  RUN_EXPORT_MIN_PARAMS,
  RUN_EXPORT_MAX_PARAMS,
} from './module-manifest-constants.js';
import {validateModuleManifest} from './module-manifest-models.js';

const LOCAL_STR_RUNTIME_VALIDATION = 'runtime-validation';

const RUNTIME_VALIDATION_ERROR_MSG = Object.freeze({
  ADAPTER_REQUIRED:
    'Runtime adapter with createInstance/inspect/destroyInstance is required',
  MODULE_ENTRY_REQUIRED:
    'Module entry with exports is required for runtime validation',
});

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

  if (!moduleExports || typeof moduleExports !== 'object') {
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

  if (typeof exportFn !== 'function') {
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

  if (typeof exportFn !== 'function') {
    errors.push(ERR.RUN_EXPORT_NOT_FUNCTION);
    return {valid: false, errors};
  }

  const paramCount = exportFn.length;
  if (paramCount < RUN_EXPORT_MIN_PARAMS ||
      paramCount > RUN_EXPORT_MAX_PARAMS) {
    errors.push(ERR.RUN_EXPORT_SIGNATURE_MISMATCH);
  }

  return {valid: errors.length === 0, errors};
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

  if (!moduleExports || typeof moduleExports !== 'object') {
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
    moduleExports, runExportName,
  );
  allErrors.push(...existResult.errors);
  if (!existResult.valid) {
    return {valid: false, errors: allErrors};
  }

  const exportFn = moduleExports[runExportName];
  const sigResult = validateRunExportSignature(exportFn);
  allErrors.push(...sigResult.errors);

  return {valid: allErrors.length === 0, errors: allErrors};
}

/**
 * Full manifest runtime validation pipeline using a runtime adapter
 * instance for export presence verification.
 *
 * This validates run_export presence through runtime-owned inspection
 * data (`inspect().exportNames`) rather than relying only on a raw
 * exports object.
 *
 * @param {Object} manifest - Module manifest object.
 * @param {Object} moduleEntry - Module entry containing at least `exports`.
 * @param {Object} runtimeAdapter - Runtime adapter contract owner.
 * @param {string} [moduleRef='runtime-validation'] - Module reference.
 * @return {Promise<{valid: boolean, errors: string[]}>} Combined result.
 */
async function validateManifestRuntimeWithAdapter(
  manifest,
  moduleEntry,
  runtimeAdapter,
  moduleRef = LOCAL_STR_RUNTIME_VALIDATION,
) {
  const allErrors = [];

  if (!manifest) {
    allErrors.push(ERR.MANIFEST_REQUIRED);
    return {valid: false, errors: allErrors};
  }

  if (!moduleEntry || typeof moduleEntry !== 'object') {
    allErrors.push(RUNTIME_VALIDATION_ERROR_MSG.MODULE_ENTRY_REQUIRED);
    return {valid: false, errors: allErrors};
  }

  if (!runtimeAdapter ||
    typeof runtimeAdapter.createInstance !== 'function' ||
    typeof runtimeAdapter.inspect !== 'function' ||
    typeof runtimeAdapter.destroyInstance !== 'function') {
    allErrors.push(RUNTIME_VALIDATION_ERROR_MSG.ADAPTER_REQUIRED);
    return {valid: false, errors: allErrors};
  }

  const structResult = validateModuleManifest(manifest);
  allErrors.push(...structResult.errors);
  if (!structResult.valid) {
    return {valid: false, errors: allErrors};
  }

  const runExportName = manifest[MF.RUN_EXPORT];
  let instanceHandle = null;
  let inspectResult = null;
  try {
    const created = await runtimeAdapter.createInstance({
      moduleRef,
      moduleEntry,
    });
    instanceHandle = created.instanceHandle;
    inspectResult = await runtimeAdapter.inspect({instanceHandle});
  } finally {
    if (instanceHandle) {
      await runtimeAdapter.destroyInstance(instanceHandle);
    }
  }

  const exportNames = Array.isArray(inspectResult?.exportNames) ?
    inspectResult.exportNames :
    [];
  if (!exportNames.includes(runExportName)) {
    allErrors.push(ERR.RUN_EXPORT_MISSING_IN_MODULE);
    return {valid: false, errors: allErrors};
  }

  const moduleExports = moduleEntry.exports;
  const existResult = validateRunExportExists(
    moduleExports,
    runExportName,
  );
  allErrors.push(...existResult.errors);
  if (!existResult.valid) {
    return {valid: false, errors: allErrors};
  }

  const exportFn = moduleExports[runExportName];
  const sigResult = validateRunExportSignature(exportFn);
  allErrors.push(...sigResult.errors);

  return {valid: allErrors.length === 0, errors: allErrors};
}

export {
  RUNTIME_VALIDATION_ERROR_MSG,
  validateRunExportExists,
  validateRunExportSignature,
  validateManifestRuntime,
  validateManifestRuntimeWithAdapter,
};
