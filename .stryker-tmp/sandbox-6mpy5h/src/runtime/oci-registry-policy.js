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
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { TYPEOF } from '../constants/types.js';

// --- Policy error messages ---

const OCI_POLICY_ERROR = Object.freeze(stryMutAct_9fa48("147069") ? {} : (stryCov_9fa48("147069"), {
  POLICY_REQUIRED: stryMutAct_9fa48("147070") ? "" : (stryCov_9fa48("147070"), 'registry policy is required'),
  POLICY_NOT_OBJECT: stryMutAct_9fa48("147071") ? "" : (stryCov_9fa48("147071"), 'registry policy must be a non-null object'),
  ALLOWLIST_REQUIRED: stryMutAct_9fa48("147072") ? "" : (stryCov_9fa48("147072"), 'allowedRegistries must be an array'),
  REGISTRY_DENIED: stryMutAct_9fa48("147073") ? "" : (stryCov_9fa48("147073"), 'registry is not in the allowed list'),
  REPOSITORY_DENIED: stryMutAct_9fa48("147074") ? "" : (stryCov_9fa48("147074"), 'repository is not in the allowed list'),
  REF_REQUIRED: stryMutAct_9fa48("147075") ? "" : (stryCov_9fa48("147075"), 'image reference is required for policy check'),
  DENY_BY_DEFAULT: stryMutAct_9fa48("147076") ? "" : (stryCov_9fa48("147076"), 'no policy configured; deny by default')
}));

// --- Policy field names ---

const OCI_POLICY_FIELD = Object.freeze(stryMutAct_9fa48("147077") ? {} : (stryCov_9fa48("147077"), {
  ALLOWED_REGISTRIES: stryMutAct_9fa48("147078") ? "" : (stryCov_9fa48("147078"), 'allowedRegistries'),
  ALLOWED_REPOSITORIES: stryMutAct_9fa48("147079") ? "" : (stryCov_9fa48("147079"), 'allowedRepositories'),
  DENY_UNMATCHED: stryMutAct_9fa48("147080") ? "" : (stryCov_9fa48("147080"), 'denyUnmatched')
}));

// --- Policy decision values ---

const OCI_POLICY_DECISION = Object.freeze(stryMutAct_9fa48("147081") ? {} : (stryCov_9fa48("147081"), {
  ALLOWED: stryMutAct_9fa48("147082") ? "" : (stryCov_9fa48("147082"), 'allowed'),
  DENIED: stryMutAct_9fa48("147083") ? "" : (stryCov_9fa48("147083"), 'denied')
}));

// --- Private constants ---

const WILDCARD = stryMutAct_9fa48("147084") ? "" : (stryCov_9fa48("147084"), '*');
const IMAGE_REF_DELIMITER = stryMutAct_9fa48("147085") ? "" : (stryCov_9fa48("147085"), '/');
const EMPTY_REPOSITORY = stryMutAct_9fa48("147086") ? "Stryker was here!" : (stryCov_9fa48("147086"), '');
const NOT_FOUND_INDEX = stryMutAct_9fa48("147087") ? +1 : (stryCov_9fa48("147087"), -1);
const NO_POLICY_ERRORS = 0;
function buildImagePolicyResult(allowed, decision, errors) {
  if (stryMutAct_9fa48("147088")) {
    {}
  } else {
    stryCov_9fa48("147088");
    const result = stryMutAct_9fa48("147089") ? {} : (stryCov_9fa48("147089"), {
      allowed,
      decision
    });
    if (stryMutAct_9fa48("147091") ? false : stryMutAct_9fa48("147090") ? true : (stryCov_9fa48("147090", "147091"), errors)) {
      if (stryMutAct_9fa48("147092")) {
        {}
      } else {
        stryCov_9fa48("147092");
        result.errors = errors;
      }
    }
    return result;
  }
}
function buildPolicyDecision(decision, reason) {
  if (stryMutAct_9fa48("147093")) {
    {}
  } else {
    stryCov_9fa48("147093");
    const result = stryMutAct_9fa48("147094") ? {} : (stryCov_9fa48("147094"), {
      decision
    });
    if (stryMutAct_9fa48("147096") ? false : stryMutAct_9fa48("147095") ? true : (stryCov_9fa48("147095", "147096"), reason)) {
      if (stryMutAct_9fa48("147097")) {
        {}
      } else {
        stryCov_9fa48("147097");
        result.reason = reason;
      }
    }
    return result;
  }
}

/**
 * Validate registry policy structure.
 *
 * @param {*} policy - The policy object to validate.
 * @return {{valid: boolean, errors?: string[]}}
 */
function validateRegistryPolicy(policy) {
  if (stryMutAct_9fa48("147098")) {
    {}
  } else {
    stryCov_9fa48("147098");
    if (stryMutAct_9fa48("147101") ? policy === null && policy === undefined : stryMutAct_9fa48("147100") ? false : stryMutAct_9fa48("147099") ? true : (stryCov_9fa48("147099", "147100", "147101"), (stryMutAct_9fa48("147103") ? policy !== null : stryMutAct_9fa48("147102") ? false : (stryCov_9fa48("147102", "147103"), policy === null)) || (stryMutAct_9fa48("147105") ? policy !== undefined : stryMutAct_9fa48("147104") ? false : (stryCov_9fa48("147104", "147105"), policy === undefined)))) {
      if (stryMutAct_9fa48("147106")) {
        {}
      } else {
        stryCov_9fa48("147106");
        return stryMutAct_9fa48("147107") ? {} : (stryCov_9fa48("147107"), {
          valid: stryMutAct_9fa48("147108") ? true : (stryCov_9fa48("147108"), false),
          errors: stryMutAct_9fa48("147109") ? [] : (stryCov_9fa48("147109"), [OCI_POLICY_ERROR.POLICY_REQUIRED])
        });
      }
    }
    if (stryMutAct_9fa48("147112") ? typeof policy !== TYPEOF.OBJECT && Array.isArray(policy) : stryMutAct_9fa48("147111") ? false : stryMutAct_9fa48("147110") ? true : (stryCov_9fa48("147110", "147111", "147112"), (stryMutAct_9fa48("147114") ? typeof policy === TYPEOF.OBJECT : stryMutAct_9fa48("147113") ? false : (stryCov_9fa48("147113", "147114"), typeof policy !== TYPEOF.OBJECT)) || Array.isArray(policy))) {
      if (stryMutAct_9fa48("147115")) {
        {}
      } else {
        stryCov_9fa48("147115");
        return stryMutAct_9fa48("147116") ? {} : (stryCov_9fa48("147116"), {
          valid: stryMutAct_9fa48("147117") ? true : (stryCov_9fa48("147117"), false),
          errors: stryMutAct_9fa48("147118") ? [] : (stryCov_9fa48("147118"), [OCI_POLICY_ERROR.POLICY_NOT_OBJECT])
        });
      }
    }
    const errors = stryMutAct_9fa48("147119") ? ["Stryker was here"] : (stryCov_9fa48("147119"), []);
    if (stryMutAct_9fa48("147122") ? false : stryMutAct_9fa48("147121") ? true : stryMutAct_9fa48("147120") ? Array.isArray(policy[OCI_POLICY_FIELD.ALLOWED_REGISTRIES]) : (stryCov_9fa48("147120", "147121", "147122"), !Array.isArray(policy[OCI_POLICY_FIELD.ALLOWED_REGISTRIES]))) {
      if (stryMutAct_9fa48("147123")) {
        {}
      } else {
        stryCov_9fa48("147123");
        errors.push(OCI_POLICY_ERROR.ALLOWLIST_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("147126") ? OCI_POLICY_FIELD.ALLOWED_REPOSITORIES in policy || !Array.isArray(policy[OCI_POLICY_FIELD.ALLOWED_REPOSITORIES]) : stryMutAct_9fa48("147125") ? false : stryMutAct_9fa48("147124") ? true : (stryCov_9fa48("147124", "147125", "147126"), OCI_POLICY_FIELD.ALLOWED_REPOSITORIES in policy && (stryMutAct_9fa48("147127") ? Array.isArray(policy[OCI_POLICY_FIELD.ALLOWED_REPOSITORIES]) : (stryCov_9fa48("147127"), !Array.isArray(policy[OCI_POLICY_FIELD.ALLOWED_REPOSITORIES]))))) {
      if (stryMutAct_9fa48("147128")) {
        {}
      } else {
        stryCov_9fa48("147128");
        errors.push(OCI_POLICY_ERROR.ALLOWLIST_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("147132") ? errors.length <= NO_POLICY_ERRORS : stryMutAct_9fa48("147131") ? errors.length >= NO_POLICY_ERRORS : stryMutAct_9fa48("147130") ? false : stryMutAct_9fa48("147129") ? true : (stryCov_9fa48("147129", "147130", "147131", "147132"), errors.length > NO_POLICY_ERRORS)) {
      if (stryMutAct_9fa48("147133")) {
        {}
      } else {
        stryCov_9fa48("147133");
        return stryMutAct_9fa48("147134") ? {} : (stryCov_9fa48("147134"), {
          valid: stryMutAct_9fa48("147135") ? true : (stryCov_9fa48("147135"), false),
          errors
        });
      }
    }
    return stryMutAct_9fa48("147136") ? {} : (stryCov_9fa48("147136"), {
      valid: stryMutAct_9fa48("147137") ? false : (stryCov_9fa48("147137"), true)
    });
  }
}

/**
 * Check if a registry is allowed by policy.
 *
 * @param {string} registry - The registry hostname.
 * @param {Object|null} policy - The registry policy.
 * @return {{decision: string, reason?: string}}
 */
function checkRegistryAllowed(registry, policy) {
  if (stryMutAct_9fa48("147138")) {
    {}
  } else {
    stryCov_9fa48("147138");
    if (stryMutAct_9fa48("147141") ? false : stryMutAct_9fa48("147140") ? true : stryMutAct_9fa48("147139") ? policy : (stryCov_9fa48("147139", "147140", "147141"), !policy)) {
      if (stryMutAct_9fa48("147142")) {
        {}
      } else {
        stryCov_9fa48("147142");
        return buildPolicyDecision(OCI_POLICY_DECISION.DENIED, OCI_POLICY_ERROR.DENY_BY_DEFAULT);
      }
    }
    const allowed = policy[OCI_POLICY_FIELD.ALLOWED_REGISTRIES];
    if (stryMutAct_9fa48("147145") ? false : stryMutAct_9fa48("147144") ? true : stryMutAct_9fa48("147143") ? Array.isArray(allowed) : (stryCov_9fa48("147143", "147144", "147145"), !Array.isArray(allowed))) {
      if (stryMutAct_9fa48("147146")) {
        {}
      } else {
        stryCov_9fa48("147146");
        return buildPolicyDecision(OCI_POLICY_DECISION.DENIED, OCI_POLICY_ERROR.ALLOWLIST_REQUIRED);
      }
    }
    const registryAllowed = stryMutAct_9fa48("147149") ? allowed.includes(WILDCARD) && allowed.includes(registry) : stryMutAct_9fa48("147148") ? false : stryMutAct_9fa48("147147") ? true : (stryCov_9fa48("147147", "147148", "147149"), allowed.includes(WILDCARD) || allowed.includes(registry));
    if (stryMutAct_9fa48("147151") ? false : stryMutAct_9fa48("147150") ? true : (stryCov_9fa48("147150", "147151"), registryAllowed)) {
      if (stryMutAct_9fa48("147152")) {
        {}
      } else {
        stryCov_9fa48("147152");
        return buildPolicyDecision(OCI_POLICY_DECISION.ALLOWED);
      }
    }
    return buildPolicyDecision(OCI_POLICY_DECISION.DENIED, OCI_POLICY_ERROR.REGISTRY_DENIED);
  }
}

/**
 * Check if a repository is allowed by policy.
 *
 * @param {string} repository - The repository path.
 * @param {Object|null} policy - The registry policy.
 * @return {{decision: string, reason?: string}}
 */
function checkRepositoryAllowed(repository, policy) {
  if (stryMutAct_9fa48("147153")) {
    {}
  } else {
    stryCov_9fa48("147153");
    if (stryMutAct_9fa48("147156") ? false : stryMutAct_9fa48("147155") ? true : stryMutAct_9fa48("147154") ? policy : (stryCov_9fa48("147154", "147155", "147156"), !policy)) {
      if (stryMutAct_9fa48("147157")) {
        {}
      } else {
        stryCov_9fa48("147157");
        return buildPolicyDecision(OCI_POLICY_DECISION.DENIED, OCI_POLICY_ERROR.DENY_BY_DEFAULT);
      }
    }
    const repos = policy[OCI_POLICY_FIELD.ALLOWED_REPOSITORIES];
    if (stryMutAct_9fa48("147160") ? false : stryMutAct_9fa48("147159") ? true : stryMutAct_9fa48("147158") ? repos : (stryCov_9fa48("147158", "147159", "147160"), !repos)) {
      if (stryMutAct_9fa48("147161")) {
        {}
      } else {
        stryCov_9fa48("147161");
        return buildPolicyDecision(OCI_POLICY_DECISION.ALLOWED);
      }
    }
    if (stryMutAct_9fa48("147164") ? false : stryMutAct_9fa48("147163") ? true : stryMutAct_9fa48("147162") ? Array.isArray(repos) : (stryCov_9fa48("147162", "147163", "147164"), !Array.isArray(repos))) {
      if (stryMutAct_9fa48("147165")) {
        {}
      } else {
        stryCov_9fa48("147165");
        return buildPolicyDecision(OCI_POLICY_DECISION.DENIED, OCI_POLICY_ERROR.ALLOWLIST_REQUIRED);
      }
    }
    const repositoryAllowed = stryMutAct_9fa48("147166") ? repos.every(entry => repository === entry || entry.endsWith(IMAGE_REF_DELIMITER) && repository.startsWith(entry)) : (stryCov_9fa48("147166"), repos.some(stryMutAct_9fa48("147167") ? () => undefined : (stryCov_9fa48("147167"), entry => stryMutAct_9fa48("147170") ? repository === entry && entry.endsWith(IMAGE_REF_DELIMITER) && repository.startsWith(entry) : stryMutAct_9fa48("147169") ? false : stryMutAct_9fa48("147168") ? true : (stryCov_9fa48("147168", "147169", "147170"), (stryMutAct_9fa48("147172") ? repository !== entry : stryMutAct_9fa48("147171") ? false : (stryCov_9fa48("147171", "147172"), repository === entry)) || (stryMutAct_9fa48("147174") ? entry.endsWith(IMAGE_REF_DELIMITER) || repository.startsWith(entry) : stryMutAct_9fa48("147173") ? false : (stryCov_9fa48("147173", "147174"), (stryMutAct_9fa48("147175") ? entry.startsWith(IMAGE_REF_DELIMITER) : (stryCov_9fa48("147175"), entry.endsWith(IMAGE_REF_DELIMITER))) && (stryMutAct_9fa48("147176") ? repository.endsWith(entry) : (stryCov_9fa48("147176"), repository.startsWith(entry)))))))));
    if (stryMutAct_9fa48("147178") ? false : stryMutAct_9fa48("147177") ? true : (stryCov_9fa48("147177", "147178"), repositoryAllowed)) {
      if (stryMutAct_9fa48("147179")) {
        {}
      } else {
        stryCov_9fa48("147179");
        return buildPolicyDecision(OCI_POLICY_DECISION.ALLOWED);
      }
    }
    return buildPolicyDecision(OCI_POLICY_DECISION.DENIED, OCI_POLICY_ERROR.REPOSITORY_DENIED);
  }
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
  if (stryMutAct_9fa48("147180")) {
    {}
  } else {
    stryCov_9fa48("147180");
    let result;
    if (stryMutAct_9fa48("147183") ? !imageRef && typeof imageRef !== TYPEOF.STRING : stryMutAct_9fa48("147182") ? false : stryMutAct_9fa48("147181") ? true : (stryCov_9fa48("147181", "147182", "147183"), (stryMutAct_9fa48("147184") ? imageRef : (stryCov_9fa48("147184"), !imageRef)) || (stryMutAct_9fa48("147186") ? typeof imageRef === TYPEOF.STRING : stryMutAct_9fa48("147185") ? false : (stryCov_9fa48("147185", "147186"), typeof imageRef !== TYPEOF.STRING)))) {
      if (stryMutAct_9fa48("147187")) {
        {}
      } else {
        stryCov_9fa48("147187");
        result = buildImagePolicyResult(stryMutAct_9fa48("147188") ? true : (stryCov_9fa48("147188"), false), OCI_POLICY_DECISION.DENIED, stryMutAct_9fa48("147189") ? [] : (stryCov_9fa48("147189"), [OCI_POLICY_ERROR.REF_REQUIRED]));
      }
    } else if (stryMutAct_9fa48("147192") ? false : stryMutAct_9fa48("147191") ? true : stryMutAct_9fa48("147190") ? policy : (stryCov_9fa48("147190", "147191", "147192"), !policy)) {
      if (stryMutAct_9fa48("147193")) {
        {}
      } else {
        stryCov_9fa48("147193");
        result = buildImagePolicyResult(stryMutAct_9fa48("147194") ? true : (stryCov_9fa48("147194"), false), OCI_POLICY_DECISION.DENIED, stryMutAct_9fa48("147195") ? [] : (stryCov_9fa48("147195"), [OCI_POLICY_ERROR.DENY_BY_DEFAULT]));
      }
    } else {
      if (stryMutAct_9fa48("147196")) {
        {}
      } else {
        stryCov_9fa48("147196");
        const slashIdx = imageRef.indexOf(IMAGE_REF_DELIMITER);
        const hasRepositoryDelimiter = stryMutAct_9fa48("147200") ? slashIdx <= NOT_FOUND_INDEX : stryMutAct_9fa48("147199") ? slashIdx >= NOT_FOUND_INDEX : stryMutAct_9fa48("147198") ? false : stryMutAct_9fa48("147197") ? true : (stryCov_9fa48("147197", "147198", "147199", "147200"), slashIdx > NOT_FOUND_INDEX);
        const registry = hasRepositoryDelimiter ? stryMutAct_9fa48("147201") ? imageRef : (stryCov_9fa48("147201"), imageRef.slice(0, slashIdx)) : imageRef;
        const repository = hasRepositoryDelimiter ? stryMutAct_9fa48("147202") ? imageRef : (stryCov_9fa48("147202"), imageRef.slice(stryMutAct_9fa48("147203") ? slashIdx - 1 : (stryCov_9fa48("147203"), slashIdx + 1))) : EMPTY_REPOSITORY;
        const errors = stryMutAct_9fa48("147204") ? ["Stryker was here"] : (stryCov_9fa48("147204"), []);
        const regResult = checkRegistryAllowed(registry, policy);
        if (stryMutAct_9fa48("147207") ? regResult.decision !== OCI_POLICY_DECISION.DENIED : stryMutAct_9fa48("147206") ? false : stryMutAct_9fa48("147205") ? true : (stryCov_9fa48("147205", "147206", "147207"), regResult.decision === OCI_POLICY_DECISION.DENIED)) {
          if (stryMutAct_9fa48("147208")) {
            {}
          } else {
            stryCov_9fa48("147208");
            errors.push(stryMutAct_9fa48("147211") ? regResult.reason && OCI_POLICY_ERROR.REGISTRY_DENIED : stryMutAct_9fa48("147210") ? false : stryMutAct_9fa48("147209") ? true : (stryCov_9fa48("147209", "147210", "147211"), regResult.reason || OCI_POLICY_ERROR.REGISTRY_DENIED));
          }
        }
        const repoResult = checkRepositoryAllowed(repository, policy);
        if (stryMutAct_9fa48("147214") ? repoResult.decision !== OCI_POLICY_DECISION.DENIED : stryMutAct_9fa48("147213") ? false : stryMutAct_9fa48("147212") ? true : (stryCov_9fa48("147212", "147213", "147214"), repoResult.decision === OCI_POLICY_DECISION.DENIED)) {
          if (stryMutAct_9fa48("147215")) {
            {}
          } else {
            stryCov_9fa48("147215");
            errors.push(stryMutAct_9fa48("147218") ? repoResult.reason && OCI_POLICY_ERROR.REPOSITORY_DENIED : stryMutAct_9fa48("147217") ? false : stryMutAct_9fa48("147216") ? true : (stryCov_9fa48("147216", "147217", "147218"), repoResult.reason || OCI_POLICY_ERROR.REPOSITORY_DENIED));
          }
        }
        if (stryMutAct_9fa48("147222") ? errors.length <= NO_POLICY_ERRORS : stryMutAct_9fa48("147221") ? errors.length >= NO_POLICY_ERRORS : stryMutAct_9fa48("147220") ? false : stryMutAct_9fa48("147219") ? true : (stryCov_9fa48("147219", "147220", "147221", "147222"), errors.length > NO_POLICY_ERRORS)) {
          if (stryMutAct_9fa48("147223")) {
            {}
          } else {
            stryCov_9fa48("147223");
            result = buildImagePolicyResult(stryMutAct_9fa48("147224") ? true : (stryCov_9fa48("147224"), false), OCI_POLICY_DECISION.DENIED, errors);
          }
        } else {
          if (stryMutAct_9fa48("147225")) {
            {}
          } else {
            stryCov_9fa48("147225");
            result = buildImagePolicyResult(stryMutAct_9fa48("147226") ? false : (stryCov_9fa48("147226"), true), OCI_POLICY_DECISION.ALLOWED);
          }
        }
      }
    }
    return result;
  }
}
export { OCI_POLICY_ERROR, OCI_POLICY_FIELD, OCI_POLICY_DECISION, WILDCARD, validateRegistryPolicy, checkRegistryAllowed, checkRepositoryAllowed, enforceImagePolicy };