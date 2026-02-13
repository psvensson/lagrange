/**
 * OCI registry and source policy enforcement.
 *
 * Enforces deny-by-default semantics for container image
 * sources. Only explicitly allowed registries and repositories
 * can be used for activation.
 *
 * Requirements: 9.2, 9.3, 9.5
 *
 * @module runtime/oci-registry-policy
 */

import {TYPEOF} from '../constants/types.js';

// --- Policy error messages ---

const OCI_POLICY_ERROR = Object.freeze({
  POLICY_REQUIRED: 'registry policy is required',
  POLICY_NOT_OBJECT: 'registry policy must be a non-null object',
  ALLOWLIST_REQUIRED: 'allowedRegistries must be an array',
  REGISTRY_DENIED: 'registry is not in the allowed list',
  REPOSITORY_DENIED: 'repository is not in the allowed list',
  REF_REQUIRED: 'image reference is required for policy check',
  DENY_BY_DEFAULT: 'no policy configured; deny by default',
});

// --- Policy field names ---

const OCI_POLICY_FIELD = Object.freeze({
  ALLOWED_REGISTRIES: 'allowedRegistries',
  ALLOWED_REPOSITORIES: 'allowedRepositories',
  DENY_UNMATCHED: 'denyUnmatched',
});

// --- Policy decision values ---

const OCI_POLICY_DECISION = Object.freeze({
  ALLOWED: 'allowed',
  DENIED: 'denied',
});

// --- Wildcard constant ---

const WILDCARD = '*';

/**
 * Validate registry policy structure.
 *
 * @param {*} policy - The policy object to validate.
 * @return {{valid: boolean, errors?: string[]}}
 */
function validateRegistryPolicy(policy) {
  if (policy === null || policy === undefined) {
    return {valid: false, errors: [OCI_POLICY_ERROR.POLICY_REQUIRED]};
  }
  if (typeof policy !== TYPEOF.OBJECT || Array.isArray(policy)) {
    return {valid: false, errors: [OCI_POLICY_ERROR.POLICY_NOT_OBJECT]};
  }
  const errors = [];
  if (!Array.isArray(policy[OCI_POLICY_FIELD.ALLOWED_REGISTRIES])) {
    errors.push(OCI_POLICY_ERROR.ALLOWLIST_REQUIRED);
  }
  if (OCI_POLICY_FIELD.ALLOWED_REPOSITORIES in policy &&
      !Array.isArray(policy[OCI_POLICY_FIELD.ALLOWED_REPOSITORIES])) {
    errors.push(OCI_POLICY_ERROR.ALLOWLIST_REQUIRED);
  }
  if (errors.length > 0) {
    return {valid: false, errors};
  }
  return {valid: true};
}

/**
 * Check if a registry is allowed by policy.
 *
 * @param {string} registry - The registry hostname.
 * @param {Object|null} policy - The registry policy.
 * @return {{decision: string, reason?: string}}
 */
function checkRegistryAllowed(registry, policy) {
  if (!policy) {
    return {
      decision: OCI_POLICY_DECISION.DENIED,
      reason: OCI_POLICY_ERROR.DENY_BY_DEFAULT,
    };
  }
  const allowed = policy[OCI_POLICY_FIELD.ALLOWED_REGISTRIES];
  if (!Array.isArray(allowed)) {
    return {
      decision: OCI_POLICY_DECISION.DENIED,
      reason: OCI_POLICY_ERROR.ALLOWLIST_REQUIRED,
    };
  }
  if (allowed.includes(WILDCARD)) {
    return {decision: OCI_POLICY_DECISION.ALLOWED};
  }
  if (allowed.includes(registry)) {
    return {decision: OCI_POLICY_DECISION.ALLOWED};
  }
  return {
    decision: OCI_POLICY_DECISION.DENIED,
    reason: OCI_POLICY_ERROR.REGISTRY_DENIED,
  };
}

/**
 * Check if a repository is allowed by policy.
 *
 * @param {string} repository - The repository path.
 * @param {Object|null} policy - The registry policy.
 * @return {{decision: string, reason?: string}}
 */
function checkRepositoryAllowed(repository, policy) {
  if (!policy) {
    return {
      decision: OCI_POLICY_DECISION.DENIED,
      reason: OCI_POLICY_ERROR.DENY_BY_DEFAULT,
    };
  }
  const repos = policy[OCI_POLICY_FIELD.ALLOWED_REPOSITORIES];
  if (!repos) {
    return {decision: OCI_POLICY_DECISION.ALLOWED};
  }
  if (!Array.isArray(repos)) {
    return {
      decision: OCI_POLICY_DECISION.DENIED,
      reason: OCI_POLICY_ERROR.ALLOWLIST_REQUIRED,
    };
  }
  for (const entry of repos) {
    if (repository === entry) {
      return {decision: OCI_POLICY_DECISION.ALLOWED};
    }
    if (entry.endsWith('/') && repository.startsWith(entry)) {
      return {decision: OCI_POLICY_DECISION.ALLOWED};
    }
  }
  return {
    decision: OCI_POLICY_DECISION.DENIED,
    reason: OCI_POLICY_ERROR.REPOSITORY_DENIED,
  };
}

/**
 * Full image policy enforcement. Parses registry and repository
 * from imageRef and checks both against policy.
 *
 * @param {*} imageRef - The full image reference string.
 * @param {Object|null} policy - The registry policy.
 * @return {{allowed: boolean, decision: string, errors?: string[]}}
 */
function enforceImagePolicy(imageRef, policy) {
  if (!imageRef || typeof imageRef !== TYPEOF.STRING) {
    return {
      allowed: false,
      decision: OCI_POLICY_DECISION.DENIED,
      errors: [OCI_POLICY_ERROR.REF_REQUIRED],
    };
  }
  if (!policy) {
    return {
      allowed: false,
      decision: OCI_POLICY_DECISION.DENIED,
      errors: [OCI_POLICY_ERROR.DENY_BY_DEFAULT],
    };
  }
  const slashIdx = imageRef.indexOf('/');
  const registry = slashIdx >= 0 ? imageRef.slice(0, slashIdx) : imageRef;
  const repository = slashIdx >= 0 ? imageRef.slice(slashIdx + 1) : '';
  const errors = [];
  const regResult = checkRegistryAllowed(registry, policy);
  if (regResult.decision === OCI_POLICY_DECISION.DENIED) {
    errors.push(regResult.reason || OCI_POLICY_ERROR.REGISTRY_DENIED);
  }
  const repoResult = checkRepositoryAllowed(repository, policy);
  if (repoResult.decision === OCI_POLICY_DECISION.DENIED) {
    errors.push(repoResult.reason || OCI_POLICY_ERROR.REPOSITORY_DENIED);
  }
  if (errors.length > 0) {
    return {
      allowed: false,
      decision: OCI_POLICY_DECISION.DENIED,
      errors,
    };
  }
  return {
    allowed: true,
    decision: OCI_POLICY_DECISION.ALLOWED,
  };
}

export {
  OCI_POLICY_ERROR,
  OCI_POLICY_FIELD,
  OCI_POLICY_DECISION,
  WILDCARD,
  validateRegistryPolicy,
  checkRegistryAllowed,
  checkRepositoryAllowed,
  enforceImagePolicy,
};
