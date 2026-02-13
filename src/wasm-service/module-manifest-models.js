/**
 * Data models for WASM module manifests.
 *
 * Handles serialization/deserialization of module manifests
 * using composite key (namespace, name, version) and
 * validation of run_export, dependency digests, and capability
 * declarations.
 *
 * Requirements: 3.2, 5.2, 10.4
 */

import {NUM, STRING, TYPEOF, PACKAGE_ID_PATTERN} from '../constants/index.js';
import {
  MODULE_MANIFEST_FIELD as MF,
  MODULE_DEPENDENCY_FIELD as DF,
  MODULE_MANIFEST_COL as COL,
  DIGEST_PREFIX,
  DIGEST_HEX_LENGTH,
  MODULE_MANIFEST_ERROR_MSG as ERR,
} from './module-manifest-constants.js';

/**
 * Validate a SHA-256 digest string format.
 * Must be "sha256:" followed by exactly 64 hex characters.
 * @param {string} digest - Digest string to validate.
 * @return {boolean} True if valid format.
 */
function isValidDigest(digest) {
  if (typeof digest !== TYPEOF.STRING) return false;
  if (!digest.startsWith(DIGEST_PREFIX)) return false;
  const hex = digest.slice(DIGEST_PREFIX.length);
  if (hex.length !== DIGEST_HEX_LENGTH) return false;
  return /^[0-9a-f]+$/.test(hex);
}

/**
 * Validate a module manifest object.
 * Uses composite namespace:name@version identity.
 * @param {Object} manifest - Module manifest to validate.
 * @return {{valid: boolean, errors: string[]}} Validation result.
 */
function validateModuleManifest(manifest) {
  const errors = [];

  if (!manifest[MF.NAMESPACE]) {
    errors.push(ERR.NAMESPACE_REQUIRED);
  }
  if (!manifest[MF.NAME]) {
    errors.push(ERR.NAME_REQUIRED);
  }
  if (!manifest[MF.VERSION]) {
    errors.push(ERR.VERSION_REQUIRED);
  }

  if (manifest[MF.NAMESPACE] && manifest[MF.NAME] &&
      manifest[MF.VERSION]) {
    const pkgId = manifest[MF.NAMESPACE] + ':' +
      manifest[MF.NAME] + '@' + manifest[MF.VERSION];
    if (!PACKAGE_ID_PATTERN.test(pkgId)) {
      if (!/^[a-z][a-z0-9-]{0,127}$/.test(
        manifest[MF.NAMESPACE]
      )) {
        errors.push(ERR.NAMESPACE_INVALID_FORMAT);
      }
      if (!/^[a-z][a-z0-9-]{0,127}$/.test(
        manifest[MF.NAME]
      )) {
        errors.push(ERR.NAME_INVALID_FORMAT);
      }
    }
  }

  if (!manifest[MF.DIGEST]) {
    errors.push(ERR.DIGEST_REQUIRED);
  } else if (!isValidDigest(manifest[MF.DIGEST])) {
    errors.push(ERR.DIGEST_INVALID_FORMAT);
  }

  const exports_ = manifest[MF.EXPORTS];
  if (!exports_ || !Array.isArray(exports_) ||
      exports_.length === NUM.ZERO) {
    errors.push(ERR.EXPORTS_REQUIRED);
  } else if (!exports_.every((e) => typeof e === TYPEOF.STRING)) {
    errors.push(ERR.EXPORTS_NOT_ARRAY);
  }

  if (!manifest[MF.RUN_EXPORT]) {
    errors.push(ERR.RUN_EXPORT_REQUIRED);
  } else if (Array.isArray(exports_) &&
      !exports_.includes(manifest[MF.RUN_EXPORT])) {
    errors.push(ERR.RUN_EXPORT_NOT_IN_EXPORTS);
  }

  validateDependencies(manifest[MF.DEPENDENCIES], errors);
  validateCapabilities(manifest[MF.CAPABILITIES], errors);

  return {valid: errors.length === NUM.ZERO, errors};
}

/**
 * Validate the dependencies array of a manifest.
 * @param {Array|undefined} deps - Dependencies array.
 * @param {string[]} errors - Errors array to append to.
 */
function validateDependencies(deps, errors) {
  if (deps === undefined || deps === null) return;
  if (!Array.isArray(deps)) {
    errors.push(ERR.DEPENDENCIES_NOT_ARRAY);
    return;
  }
  for (const dep of deps) {
    if (!dep[DF.MODULE_ID]) {
      errors.push(ERR.DEPENDENCY_MODULE_ID_REQUIRED);
    }
    if (!dep[DF.DIGEST]) {
      errors.push(ERR.DEPENDENCY_DIGEST_REQUIRED);
    } else if (!isValidDigest(dep[DF.DIGEST])) {
      errors.push(ERR.DEPENDENCY_DIGEST_INVALID_FORMAT);
    }
  }
}

/**
 * Validate the capabilities array of a manifest.
 * @param {Array|undefined} caps - Capabilities array.
 * @param {string[]} errors - Errors array to append to.
 */
function validateCapabilities(caps, errors) {
  if (caps === undefined || caps === null) return;
  if (!Array.isArray(caps)) {
    errors.push(ERR.CAPABILITIES_NOT_ARRAY);
    return;
  }
  if (!caps.every((c) => typeof c === TYPEOF.STRING)) {
    errors.push(ERR.CAPABILITIES_NOT_ARRAY);
  }
}

/**
 * Serialize a module manifest object to a table row.
 * Uses composite key (namespace, name, version).
 * Arrays (exports, dependencies, capabilities) are JSON-encoded.
 * @param {Object} manifest - Module manifest object.
 * @return {Object} Table row with snake_case keys.
 */
function serializeModuleManifest(manifest) {
  const now = Date.now();
  return {
    [COL.NAMESPACE]: manifest[MF.NAMESPACE],
    [COL.NAME]: manifest[MF.NAME],
    [COL.VERSION]: manifest[MF.VERSION],
    [COL.DIGEST]: manifest[MF.DIGEST],
    [COL.RUN_EXPORT]: manifest[MF.RUN_EXPORT],
    [COL.EXPORTS]: JSON.stringify(
      manifest[MF.EXPORTS] || []
    ),
    [COL.DEPENDENCIES]: JSON.stringify(
      manifest[MF.DEPENDENCIES] || []
    ),
    [COL.CAPABILITIES]: JSON.stringify(
      manifest[MF.CAPABILITIES] || []
    ),
    [COL.SOURCE_REFERENCE]:
      manifest[MF.SOURCE_REFERENCE] ?? null,
    [COL.ARTIFACT_POINTER]:
      manifest[MF.ARTIFACT_POINTER] ?? null,
    [COL.CREATED_AT]: manifest.createdAt ?? now,
  };
}

/**
 * Deserialize a table row to a module manifest object.
 * JSON-encoded arrays are parsed back to arrays.
 * @param {Object} row - Table row with snake_case keys.
 * @return {Object} Module manifest object with camelCase keys.
 */
function deserializeModuleManifest(row) {
  return {
    [MF.NAMESPACE]: row[COL.NAMESPACE],
    [MF.NAME]: row[COL.NAME],
    [MF.VERSION]: row[COL.VERSION],
    [MF.DIGEST]: row[COL.DIGEST],
    [MF.RUN_EXPORT]: row[COL.RUN_EXPORT],
    [MF.EXPORTS]: JSON.parse(
      row[COL.EXPORTS] || STRING.EMPTY_JSON_ARRAY
    ),
    [MF.DEPENDENCIES]: JSON.parse(
      row[COL.DEPENDENCIES] || STRING.EMPTY_JSON_ARRAY
    ),
    [MF.CAPABILITIES]: JSON.parse(
      row[COL.CAPABILITIES] || STRING.EMPTY_JSON_ARRAY
    ),
    [MF.SOURCE_REFERENCE]: row[COL.SOURCE_REFERENCE] ?? null,
    [MF.ARTIFACT_POINTER]: row[COL.ARTIFACT_POINTER] ?? null,
    createdAt: row[COL.CREATED_AT] ?? NUM.ZERO,
  };
}

export {
  isValidDigest,
  validateModuleManifest,
  serializeModuleManifest,
  deserializeModuleManifest,
};
