/**
 * OCI-compatible source reference handling with digest pin
 * enforcement.
 *
 * Parses, validates, and formats OCI references in the forms:
 *   registry/repository:tag
 *   registry/repository@sha256:hex64
 *   registry/repository:tag@sha256:hex64
 *
 * Activation paths require immutable digest pinning (Req 4.4).
 *
 * Requirements: 4.3, 4.4
 */

import {NUM, TYPEOF} from '../constants/index.js';
import {isValidDigest} from './module-manifest-models.js';

// --- OCI reference separators ---

const OCI_TAG_SEPARATOR = ':';
const OCI_DIGEST_SEPARATOR = '@';
const OCI_PATH_SEPARATOR = '/';

// --- Error message constants ---

const OCI_REFERENCE_ERROR = Object.freeze({
  REFERENCE_REQUIRED:
    'OCI reference string is required',
  REFERENCE_NOT_STRING:
    'OCI reference must be a string',
  REGISTRY_REQUIRED:
    'OCI reference must include a registry host',
  REPOSITORY_REQUIRED:
    'OCI reference must include a repository path',
  TAG_OR_DIGEST_REQUIRED:
    'OCI reference must include a tag or digest',
  DIGEST_INVALID_FORMAT:
    'OCI digest must be sha256: followed by 64 hex chars',
  DIGEST_PIN_REQUIRED:
    'Activation requires an immutable digest pin',
  TAG_ONLY_NOT_PINNED:
    'Tag-only references are mutable; digest pin is required',
  INVALID_TAG_FORMAT:
    'OCI tag contains invalid characters',
  REGISTRY_REQUIRED_FOR_FORMAT:
    'Registry is required to format an OCI reference',
  REPOSITORY_REQUIRED_FOR_FORMAT:
    'Repository is required to format an OCI reference',
});

/**
 * Valid OCI tag pattern: alphanumeric, dots, hyphens,
 * underscores, 1-128 chars.
 * @type {RegExp}
 */
const OCI_TAG_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

/**
 * Maximum length for the full OCI reference string.
 * @type {number}
 */
const OCI_REFERENCE_MAX_LENGTH = 512;

/**
 * Parse an OCI-compatible source reference string.
 *
 * Supported formats:
 *   registry.io/namespace/name:tag
 *   registry.io/namespace/name@sha256:abc...
 *   registry.io/namespace/name:tag@sha256:abc...
 *
 * @param {string} ref - OCI reference string.
 * @return {{valid: boolean, registry?: string,
 *   repository?: string, tag?: string|null,
 *   digest?: string|null, errors?: string[]}}
 */
function parseOciReference(ref) {
  if (ref === undefined || ref === null) {
    return {valid: false, errors: [OCI_REFERENCE_ERROR.REFERENCE_REQUIRED]};
  }
  if (typeof ref !== TYPEOF.STRING) {
    return {valid: false, errors: [OCI_REFERENCE_ERROR.REFERENCE_NOT_STRING]};
  }
  if (ref.length === NUM.ZERO) {
    return {valid: false, errors: [OCI_REFERENCE_ERROR.REFERENCE_REQUIRED]};
  }

  const errors = [];

  // Split digest portion first (everything after @)
  let remainder = ref;
  let digest = null;
  const atIdx = ref.indexOf(OCI_DIGEST_SEPARATOR);
  if (atIdx !== NUM.NEGATIVE_ONE) {
    digest = ref.slice(atIdx + NUM.ONE);
    remainder = ref.slice(NUM.ZERO, atIdx);
    if (!isValidDigest(digest)) {
      errors.push(OCI_REFERENCE_ERROR.DIGEST_INVALID_FORMAT);
      digest = null;
    }
  }

  // Split tag portion (last colon in remainder, but only after
  // the first slash to avoid matching port numbers in registry)
  let tag = null;
  const firstSlash = remainder.indexOf(OCI_PATH_SEPARATOR);
  const afterRegistry = firstSlash !== NUM.NEGATIVE_ONE ?
    remainder.slice(firstSlash) :
    '';
  const tagColonIdx = afterRegistry.lastIndexOf(OCI_TAG_SEPARATOR);
  if (tagColonIdx > NUM.ZERO) {
    tag = afterRegistry.slice(tagColonIdx + NUM.ONE);
    remainder = remainder.slice(
      NUM.ZERO, firstSlash + tagColonIdx,
    );
    if (!OCI_TAG_PATTERN.test(tag)) {
      errors.push(OCI_REFERENCE_ERROR.INVALID_TAG_FORMAT);
      tag = null;
    }
  }

  // Split registry / repository on first slash
  const slashIdx = remainder.indexOf(OCI_PATH_SEPARATOR);
  let registry = null;
  let repository = null;
  if (slashIdx === NUM.NEGATIVE_ONE) {
    errors.push(OCI_REFERENCE_ERROR.REGISTRY_REQUIRED);
    errors.push(OCI_REFERENCE_ERROR.REPOSITORY_REQUIRED);
  } else {
    registry = remainder.slice(NUM.ZERO, slashIdx);
    repository = remainder.slice(slashIdx + NUM.ONE);
    if (registry.length === NUM.ZERO) {
      errors.push(OCI_REFERENCE_ERROR.REGISTRY_REQUIRED);
      registry = null;
    }
    if (!repository || repository.length === NUM.ZERO) {
      errors.push(OCI_REFERENCE_ERROR.REPOSITORY_REQUIRED);
      repository = null;
    }
  }

  if (!tag && !digest && errors.length === NUM.ZERO) {
    errors.push(OCI_REFERENCE_ERROR.TAG_OR_DIGEST_REQUIRED);
  }

  if (errors.length > NUM.ZERO) {
    return {valid: false, errors};
  }

  return {
    valid: true,
    registry,
    repository,
    tag: tag || null,
    digest: digest || null,
  };
}

/**
 * Validate that an OCI reference has an immutable digest pin.
 * Activation paths require digest pinning (Req 4.4).
 *
 * @param {string} ref - OCI reference string.
 * @return {{valid: boolean, digest?: string, errors?: string[]}}
 */
function validateDigestPin(ref) {
  const parsed = parseOciReference(ref);
  if (!parsed.valid) {
    return {valid: false, errors: parsed.errors};
  }
  if (!parsed.digest) {
    const errors = [
      OCI_REFERENCE_ERROR.DIGEST_PIN_REQUIRED,
      OCI_REFERENCE_ERROR.TAG_ONLY_NOT_PINNED,
    ];
    return {valid: false, errors};
  }
  return {valid: true, digest: parsed.digest};
}

/**
 * Format OCI reference components back to a string.
 *
 * @param {{registry: string, repository: string,
 *   tag?: string|null, digest?: string|null}} parts
 * @return {{valid: boolean, reference?: string,
 *   errors?: string[]}}
 */
function formatOciReference(parts) {
  const errors = [];
  if (!parts.registry) {
    errors.push(
      OCI_REFERENCE_ERROR.REGISTRY_REQUIRED_FOR_FORMAT,
    );
  }
  if (!parts.repository) {
    errors.push(
      OCI_REFERENCE_ERROR.REPOSITORY_REQUIRED_FOR_FORMAT,
    );
  }
  if (errors.length > NUM.ZERO) {
    return {valid: false, errors};
  }

  let reference = parts.registry +
    OCI_PATH_SEPARATOR + parts.repository;
  if (parts.tag) {
    reference += OCI_TAG_SEPARATOR + parts.tag;
  }
  if (parts.digest) {
    reference += OCI_DIGEST_SEPARATOR + parts.digest;
  }
  return {valid: true, reference};
}

export {
  parseOciReference,
  validateDigestPin,
  formatOciReference,
  OCI_REFERENCE_ERROR,
  OCI_TAG_PATTERN,
  OCI_TAG_SEPARATOR,
  OCI_DIGEST_SEPARATOR,
  OCI_PATH_SEPARATOR,
  OCI_REFERENCE_MAX_LENGTH,
};
