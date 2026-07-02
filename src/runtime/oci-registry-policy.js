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

// --- Private constants ---

const WILDCARD = '*';
const IMAGE_REF_DELIMITER = '/';
const EMPTY_REPOSITORY = '';
const NOT_FOUND_INDEX = -1;
const NO_POLICY_ERRORS = 0;

function buildImagePolicyResult(allowed, decision, errors) {
  const result = {
    allowed,
    decision,
  };
  if (errors) {
    result.errors = errors;
  }
  return result;
}

function buildPolicyDecision(decision, reason) {
  const result = {decision};
  if (reason) {
    result.reason = reason;
  }
  return result;
}

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
  if (typeof policy !== 'object' || Array.isArray(policy)) {
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
  if (errors.length > NO_POLICY_ERRORS) {
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
    return buildPolicyDecision(
      OCI_POLICY_DECISION.DENIED,
      OCI_POLICY_ERROR.DENY_BY_DEFAULT,
    );
  }
  const allowed = policy[OCI_POLICY_FIELD.ALLOWED_REGISTRIES];
  if (!Array.isArray(allowed)) {
    return buildPolicyDecision(
      OCI_POLICY_DECISION.DENIED,
      OCI_POLICY_ERROR.ALLOWLIST_REQUIRED,
    );
  }
  const registryAllowed =
    allowed.includes(WILDCARD) || allowed.includes(registry);
  if (registryAllowed) {
    return buildPolicyDecision(OCI_POLICY_DECISION.ALLOWED);
  }
  return buildPolicyDecision(
    OCI_POLICY_DECISION.DENIED,
    OCI_POLICY_ERROR.REGISTRY_DENIED,
  );
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
    return buildPolicyDecision(
      OCI_POLICY_DECISION.DENIED,
      OCI_POLICY_ERROR.DENY_BY_DEFAULT,
    );
  }
  const repos = policy[OCI_POLICY_FIELD.ALLOWED_REPOSITORIES];
  if (!repos) {
    return buildPolicyDecision(OCI_POLICY_DECISION.ALLOWED);
  }
  if (!Array.isArray(repos)) {
    return buildPolicyDecision(
      OCI_POLICY_DECISION.DENIED,
      OCI_POLICY_ERROR.ALLOWLIST_REQUIRED,
    );
  }
  const repositoryAllowed = repos.some((entry) =>
    repository === entry ||
    (entry.endsWith(IMAGE_REF_DELIMITER) && repository.startsWith(entry)),
  );
  if (repositoryAllowed) {
    return buildPolicyDecision(OCI_POLICY_DECISION.ALLOWED);
  }
  return buildPolicyDecision(
    OCI_POLICY_DECISION.DENIED,
    OCI_POLICY_ERROR.REPOSITORY_DENIED,
  );
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
  let result;
  if (!imageRef || typeof imageRef !== 'string') {
    result = buildImagePolicyResult(
      false,
      OCI_POLICY_DECISION.DENIED,
      [OCI_POLICY_ERROR.REF_REQUIRED],
    );
  } else if (!policy) {
    result = buildImagePolicyResult(
      false,
      OCI_POLICY_DECISION.DENIED,
      [OCI_POLICY_ERROR.DENY_BY_DEFAULT],
    );
  } else {
    const slashIdx = imageRef.indexOf(IMAGE_REF_DELIMITER);
    const hasRepositoryDelimiter = slashIdx > NOT_FOUND_INDEX;
    const registry = hasRepositoryDelimiter ?
      imageRef.slice(0, slashIdx) :
      imageRef;
    const repository = hasRepositoryDelimiter ?
      imageRef.slice(slashIdx + 1) :
      EMPTY_REPOSITORY;
    const errors = [];
    const regResult = checkRegistryAllowed(registry, policy);
    if (regResult.decision === OCI_POLICY_DECISION.DENIED) {
      errors.push(regResult.reason || OCI_POLICY_ERROR.REGISTRY_DENIED);
    }
    const repoResult = checkRepositoryAllowed(repository, policy);
    if (repoResult.decision === OCI_POLICY_DECISION.DENIED) {
      errors.push(repoResult.reason || OCI_POLICY_ERROR.REPOSITORY_DENIED);
    }
    if (errors.length > NO_POLICY_ERRORS) {
      result = buildImagePolicyResult(
        false,
        OCI_POLICY_DECISION.DENIED,
        errors,
      );
    } else {
      result = buildImagePolicyResult(
        true,
        OCI_POLICY_DECISION.ALLOWED,
      );
    }
  }
  return result;
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
