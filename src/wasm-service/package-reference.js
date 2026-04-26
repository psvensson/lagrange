/**
 * Package reference parser, formatter, and validator.
 *
 * Handles canonical component package identity: namespace:name@version
 *
 * Requirements: 3.1, 3.4
 */

import {NUM} from '../constants/index.js';
import {
  PACKAGE_ID_PATTERN,
  PACKAGE_ID_SEPARATOR,
  PACKAGE_VERSION_SEPARATOR,
  PACKAGE_ID_MAX_LENGTH,
} from '../constants/wasm-meta.js';
import {
  NAMESPACE_PATTERN,
  PACKAGE_NAME_PATTERN,
} from './wasm-meta-models-constants.js';

/**
 * Version format pattern: digit start, then digits, dots,
 * hyphens, plus signs, lowercase/uppercase alpha, 1-64 chars.
 * @type {RegExp}
 */
const VERSION_PATTERN = /^[0-9][0-9a-zA-Z.+-]{0,63}$/;

// --- Error message constants ---

const PKG_REF_ERROR = Object.freeze({
  INPUT_REQUIRED:
    'Package reference is required',
  INPUT_NOT_STRING:
    'Package reference must be a string',
  MISSING_NAMESPACE_SEPARATOR:
    'Package reference must contain ":" separator',
  MISSING_VERSION_SEPARATOR:
    'Package reference must contain "@" version separator',
  NAMESPACE_EMPTY:
    'Namespace must not be empty',
  NAMESPACE_INVALID_FORMAT:
    'Namespace must start with a lowercase letter and contain' +
    ' only lowercase alphanumeric characters and hyphens' +
    ` (max ${PACKAGE_ID_MAX_LENGTH.NAMESPACE} chars)`,
  NAME_EMPTY:
    'Name must not be empty',
  NAME_INVALID_FORMAT:
    'Name must start with a lowercase letter and contain' +
    ' only lowercase alphanumeric characters and hyphens' +
    ` (max ${PACKAGE_ID_MAX_LENGTH.NAME} chars)`,
  VERSION_EMPTY:
    'Version must not be empty',
  VERSION_INVALID_FORMAT:
    'Version must start with a digit and contain' +
    ' only alphanumeric characters, dots, hyphens, and plus' +
    ` (max ${PACKAGE_ID_MAX_LENGTH.VERSION} chars)`,
});

/**
 * Parse a package reference string into components.
 *
 * @param {string} ref - Package reference (namespace:name@version).
 * @return {{valid: boolean, namespace?: string, name?: string,
 *   version?: string, errors?: string[]}} Parse result.
 */
function parsePackageReference(ref) {
  const errors = collectErrors(ref);
  if (errors.length > NUM.ZERO) {
    return {valid: false, errors};
  }
  const match = PACKAGE_ID_PATTERN.exec(ref);
  return {
    valid: true,
    namespace: match[NUM.ONE],
    name: match[NUM.TWO],
    version: match[NUM.THREE],
  };
}

/**
 * Format package components back to canonical reference string.
 *
 * @param {{namespace: string, name: string, version: string}} parts
 * @return {string} Canonical reference (namespace:name@version).
 */
function formatPackageReference(parts) {
  return parts.namespace +
    PACKAGE_ID_SEPARATOR +
    parts.name +
    PACKAGE_VERSION_SEPARATOR +
    parts.version;
}

/**
 * Validate a package reference string without returning parsed
 * components.
 *
 * @param {string} ref - Package reference to validate.
 * @return {{valid: boolean, errors?: string[]}} Validation result.
 */
function validatePackageReference(ref) {
  const errors = collectErrors(ref);
  if (errors.length > NUM.ZERO) {
    return {valid: false, errors};
  }
  return {valid: true};
}

/**
 * Collect all validation errors for a package reference.
 *
 * @param {*} ref - Input to validate.
 * @return {string[]} Array of error messages (empty if valid).
 */
function collectErrors(ref) {
  const errors = [];
  if (ref === undefined || ref === null || ref === '') {
    errors.push(PKG_REF_ERROR.INPUT_REQUIRED);
    return errors;
  }
  if (typeof ref !== 'string') {
    errors.push(PKG_REF_ERROR.INPUT_NOT_STRING);
    return errors;
  }
  const colonIdx = ref.indexOf(PACKAGE_ID_SEPARATOR);
  if (colonIdx === NUM.NEGATIVE_ONE) {
    errors.push(PKG_REF_ERROR.MISSING_NAMESPACE_SEPARATOR);
    return errors;
  }
  const atIdx = ref.indexOf(PACKAGE_VERSION_SEPARATOR, colonIdx);
  if (atIdx === NUM.NEGATIVE_ONE) {
    errors.push(PKG_REF_ERROR.MISSING_VERSION_SEPARATOR);
    return errors;
  }
  const namespace = ref.slice(NUM.ZERO, colonIdx);
  const name = ref.slice(colonIdx + NUM.ONE, atIdx);
  const version = ref.slice(atIdx + NUM.ONE);

  validateNamespace(namespace, errors);
  validateName(name, errors);
  validateVersion(version, errors);
  return errors;
}

/**
 * @param {string} ns - Namespace segment.
 * @param {string[]} errors - Accumulator.
 */
function validateNamespace(ns, errors) {
  if (!ns) {
    errors.push(PKG_REF_ERROR.NAMESPACE_EMPTY);
  } else if (!NAMESPACE_PATTERN.test(ns)) {
    errors.push(PKG_REF_ERROR.NAMESPACE_INVALID_FORMAT);
  }
}

/**
 * @param {string} name - Name segment.
 * @param {string[]} errors - Accumulator.
 */
function validateName(name, errors) {
  if (!name) {
    errors.push(PKG_REF_ERROR.NAME_EMPTY);
  } else if (!PACKAGE_NAME_PATTERN.test(name)) {
    errors.push(PKG_REF_ERROR.NAME_INVALID_FORMAT);
  }
}

/**
 * @param {string} ver - Version segment.
 * @param {string[]} errors - Accumulator.
 */
function validateVersion(ver, errors) {
  if (!ver) {
    errors.push(PKG_REF_ERROR.VERSION_EMPTY);
  } else if (!VERSION_PATTERN.test(ver)) {
    errors.push(PKG_REF_ERROR.VERSION_INVALID_FORMAT);
  }
}

export {
  parsePackageReference,
  formatPackageReference,
  validatePackageReference,
  PKG_REF_ERROR,
  VERSION_PATTERN,
};
