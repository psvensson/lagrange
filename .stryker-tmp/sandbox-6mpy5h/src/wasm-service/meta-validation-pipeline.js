/**
 * Validation pipeline for sys-wasm-meta publish commands.
 * Composes existing validators without duplicating logic.
 * Each validator is called by reference, not reimplemented.
 *
 * Requirements: 6.1, 6.2, 12.4
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
import { NUM } from '../constants/index.js';
import { validateModuleManifest } from './module-manifest-models.js';
import { enforceCapabilityPolicy } from './capability-policy.js';
import { MODULE_MANIFEST_FIELD as MF, MODULE_DEPENDENCY_FIELD as DF } from './module-manifest-constants.js';
import { DEBUG_CAPABILITY } from '../debug-runtime/debug-runtime-constants.js';

/**
 * Validation step name constants.
 * @enum {string}
 */
const VALIDATION_STEP = Object.freeze(stryMutAct_9fa48("161347") ? {} : (stryCov_9fa48("161347"), {
  MANIFEST: stryMutAct_9fa48("161348") ? "" : (stryCov_9fa48("161348"), 'manifest'),
  CAPABILITIES: stryMutAct_9fa48("161349") ? "" : (stryCov_9fa48("161349"), 'capabilities'),
  DEBUG_ARTIFACTS: stryMutAct_9fa48("161350") ? "" : (stryCov_9fa48("161350"), 'debugArtifacts'),
  DEPENDENCIES: stryMutAct_9fa48("161351") ? "" : (stryCov_9fa48("161351"), 'dependencies')
}));

/**
 * Error message constants for pipeline validation failures.
 * @enum {string}
 */
const VALIDATION_PIPELINE_ERROR_MSG = Object.freeze(stryMutAct_9fa48("161352") ? {} : (stryCov_9fa48("161352"), {
  MANIFEST_INVALID: stryMutAct_9fa48("161353") ? "" : (stryCov_9fa48("161353"), 'Manifest validation failed'),
  CAPABILITIES_DENIED: stryMutAct_9fa48("161354") ? "" : (stryCov_9fa48("161354"), 'Capability enforcement failed'),
  DEBUG_ARTIFACT_REQUIRED: stryMutAct_9fa48("161355") ? "" : (stryCov_9fa48("161355"), 'Debug artifact metadata required for debug capabilities'),
  DEPENDENCIES_INVALID: stryMutAct_9fa48("161356") ? "" : (stryCov_9fa48("161356"), 'Dependency validation failed')
}));

/**
 * Validate capabilities against a capability policy.
 * Thin wrapper that delegates to enforceCapabilityPolicy.
 * Returns valid if no capabilities declared or no policy.
 *
 * @param {Object} manifest - Module manifest object.
 * @param {Object|null} capabilityPolicy - Policy object with
 *   allowedCapabilities, or null to skip enforcement.
 * @param {string[]} tenantAllowlist - Allowed capabilities
 *   for the tenant/service.
 * @return {{valid: boolean, errors: string[]}} Result.
 */
function validateCapabilities(manifest, capabilityPolicy, tenantAllowlist) {
  if (stryMutAct_9fa48("161357")) {
    {}
  } else {
    stryCov_9fa48("161357");
    const caps = manifest ? manifest[MF.CAPABILITIES] : null;
    if (stryMutAct_9fa48("161360") ? (!caps || !Array.isArray(caps)) && caps.length === NUM.ZERO : stryMutAct_9fa48("161359") ? false : stryMutAct_9fa48("161358") ? true : (stryCov_9fa48("161358", "161359", "161360"), (stryMutAct_9fa48("161362") ? !caps && !Array.isArray(caps) : stryMutAct_9fa48("161361") ? false : (stryCov_9fa48("161361", "161362"), (stryMutAct_9fa48("161363") ? caps : (stryCov_9fa48("161363"), !caps)) || (stryMutAct_9fa48("161364") ? Array.isArray(caps) : (stryCov_9fa48("161364"), !Array.isArray(caps))))) || (stryMutAct_9fa48("161366") ? caps.length !== NUM.ZERO : stryMutAct_9fa48("161365") ? false : (stryCov_9fa48("161365", "161366"), caps.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("161367")) {
        {}
      } else {
        stryCov_9fa48("161367");
        return stryMutAct_9fa48("161368") ? {} : (stryCov_9fa48("161368"), {
          valid: stryMutAct_9fa48("161369") ? false : (stryCov_9fa48("161369"), true),
          errors: stryMutAct_9fa48("161370") ? ["Stryker was here"] : (stryCov_9fa48("161370"), [])
        });
      }
    }
    if (stryMutAct_9fa48("161373") ? false : stryMutAct_9fa48("161372") ? true : stryMutAct_9fa48("161371") ? capabilityPolicy : (stryCov_9fa48("161371", "161372", "161373"), !capabilityPolicy)) {
      if (stryMutAct_9fa48("161374")) {
        {}
      } else {
        stryCov_9fa48("161374");
        return stryMutAct_9fa48("161375") ? {} : (stryCov_9fa48("161375"), {
          valid: stryMutAct_9fa48("161376") ? false : (stryCov_9fa48("161376"), true),
          errors: stryMutAct_9fa48("161377") ? ["Stryker was here"] : (stryCov_9fa48("161377"), [])
        });
      }
    }
    const policy = stryMutAct_9fa48("161378") ? {} : (stryCov_9fa48("161378"), {
      allowedCapabilities: stryMutAct_9fa48("161381") ? tenantAllowlist && [] : stryMutAct_9fa48("161380") ? false : stryMutAct_9fa48("161379") ? true : (stryCov_9fa48("161379", "161380", "161381"), tenantAllowlist || (stryMutAct_9fa48("161382") ? ["Stryker was here"] : (stryCov_9fa48("161382"), [])))
    });
    const result = enforceCapabilityPolicy(manifest, policy);
    if (stryMutAct_9fa48("161385") ? false : stryMutAct_9fa48("161384") ? true : stryMutAct_9fa48("161383") ? result.valid : (stryCov_9fa48("161383", "161384", "161385"), !result.valid)) {
      if (stryMutAct_9fa48("161386")) {
        {}
      } else {
        stryCov_9fa48("161386");
        return stryMutAct_9fa48("161387") ? {} : (stryCov_9fa48("161387"), {
          valid: stryMutAct_9fa48("161388") ? true : (stryCov_9fa48("161388"), false),
          errors: stryMutAct_9fa48("161389") ? [] : (stryCov_9fa48("161389"), [VALIDATION_PIPELINE_ERROR_MSG.CAPABILITIES_DENIED])
        });
      }
    }
    return stryMutAct_9fa48("161390") ? {} : (stryCov_9fa48("161390"), {
      valid: stryMutAct_9fa48("161391") ? false : (stryCov_9fa48("161391"), true),
      errors: stryMutAct_9fa48("161392") ? ["Stryker was here"] : (stryCov_9fa48("161392"), [])
    });
  }
}

/**
 * Validate resolved dependencies have required fields.
 * Each dependency must have moduleId and digest.
 *
 * @param {Array<Object>|null} resolvedDependencies - Array of
 *   resolved dependency objects.
 * @return {{valid: boolean, errors: string[]}} Result.
 */
function validateResolvedDependencies(resolvedDependencies) {
  if (stryMutAct_9fa48("161393")) {
    {}
  } else {
    stryCov_9fa48("161393");
    if (stryMutAct_9fa48("161396") ? (!resolvedDependencies || !Array.isArray(resolvedDependencies)) && resolvedDependencies.length === NUM.ZERO : stryMutAct_9fa48("161395") ? false : stryMutAct_9fa48("161394") ? true : (stryCov_9fa48("161394", "161395", "161396"), (stryMutAct_9fa48("161398") ? !resolvedDependencies && !Array.isArray(resolvedDependencies) : stryMutAct_9fa48("161397") ? false : (stryCov_9fa48("161397", "161398"), (stryMutAct_9fa48("161399") ? resolvedDependencies : (stryCov_9fa48("161399"), !resolvedDependencies)) || (stryMutAct_9fa48("161400") ? Array.isArray(resolvedDependencies) : (stryCov_9fa48("161400"), !Array.isArray(resolvedDependencies))))) || (stryMutAct_9fa48("161402") ? resolvedDependencies.length !== NUM.ZERO : stryMutAct_9fa48("161401") ? false : (stryCov_9fa48("161401", "161402"), resolvedDependencies.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("161403")) {
        {}
      } else {
        stryCov_9fa48("161403");
        return stryMutAct_9fa48("161404") ? {} : (stryCov_9fa48("161404"), {
          valid: stryMutAct_9fa48("161405") ? false : (stryCov_9fa48("161405"), true),
          errors: stryMutAct_9fa48("161406") ? ["Stryker was here"] : (stryCov_9fa48("161406"), [])
        });
      }
    }
    const errors = stryMutAct_9fa48("161407") ? ["Stryker was here"] : (stryCov_9fa48("161407"), []);
    for (const dep of resolvedDependencies) {
      if (stryMutAct_9fa48("161408")) {
        {}
      } else {
        stryCov_9fa48("161408");
        if (stryMutAct_9fa48("161411") ? !dep[DF.MODULE_ID] && !dep[DF.DIGEST] : stryMutAct_9fa48("161410") ? false : stryMutAct_9fa48("161409") ? true : (stryCov_9fa48("161409", "161410", "161411"), (stryMutAct_9fa48("161412") ? dep[DF.MODULE_ID] : (stryCov_9fa48("161412"), !dep[DF.MODULE_ID])) || (stryMutAct_9fa48("161413") ? dep[DF.DIGEST] : (stryCov_9fa48("161413"), !dep[DF.DIGEST])))) {
          if (stryMutAct_9fa48("161414")) {
            {}
          } else {
            stryCov_9fa48("161414");
            errors.push(VALIDATION_PIPELINE_ERROR_MSG.DEPENDENCIES_INVALID);
            break;
          }
        }
      }
    }
    return stryMutAct_9fa48("161415") ? {} : (stryCov_9fa48("161415"), {
      valid: stryMutAct_9fa48("161418") ? errors.length !== NUM.ZERO : stryMutAct_9fa48("161417") ? false : stryMutAct_9fa48("161416") ? true : (stryCov_9fa48("161416", "161417", "161418"), errors.length === NUM.ZERO),
      errors
    });
  }
}

/**
 * Validate debug artifact availability policy for debug capabilities.
 *
 * By default, debug capabilities require either:
 * - `manifest.debugArtifact`, or
 * - legacy `manifest.artifactPointer` declaration.
 *
 * Policy hook:
 * - `capabilityPolicy.requireDebugArtifacts === false` downgrades
 *   enforcement for transitional rollouts.
 *
 * @param {Object} manifest - Module manifest object.
 * @param {Object|null} capabilityPolicy - Capability policy options.
 * @return {{valid: boolean, errors: string[]}} Result.
 */
function validateDebugArtifactPolicy(manifest, capabilityPolicy) {
  if (stryMutAct_9fa48("161419")) {
    {}
  } else {
    stryCov_9fa48("161419");
    const caps = manifest ? manifest[MF.CAPABILITIES] : null;
    if (stryMutAct_9fa48("161422") ? (!caps || !Array.isArray(caps)) && caps.length === NUM.ZERO : stryMutAct_9fa48("161421") ? false : stryMutAct_9fa48("161420") ? true : (stryCov_9fa48("161420", "161421", "161422"), (stryMutAct_9fa48("161424") ? !caps && !Array.isArray(caps) : stryMutAct_9fa48("161423") ? false : (stryCov_9fa48("161423", "161424"), (stryMutAct_9fa48("161425") ? caps : (stryCov_9fa48("161425"), !caps)) || (stryMutAct_9fa48("161426") ? Array.isArray(caps) : (stryCov_9fa48("161426"), !Array.isArray(caps))))) || (stryMutAct_9fa48("161428") ? caps.length !== NUM.ZERO : stryMutAct_9fa48("161427") ? false : (stryCov_9fa48("161427", "161428"), caps.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("161429")) {
        {}
      } else {
        stryCov_9fa48("161429");
        return stryMutAct_9fa48("161430") ? {} : (stryCov_9fa48("161430"), {
          valid: stryMutAct_9fa48("161431") ? false : (stryCov_9fa48("161431"), true),
          errors: stryMutAct_9fa48("161432") ? ["Stryker was here"] : (stryCov_9fa48("161432"), [])
        });
      }
    }
    const debugRequested = stryMutAct_9fa48("161435") ? caps.includes(DEBUG_CAPABILITY.BREAKPOINT) && caps.includes(DEBUG_CAPABILITY.SNAPSHOT) : stryMutAct_9fa48("161434") ? false : stryMutAct_9fa48("161433") ? true : (stryCov_9fa48("161433", "161434", "161435"), caps.includes(DEBUG_CAPABILITY.BREAKPOINT) || caps.includes(DEBUG_CAPABILITY.SNAPSHOT));
    if (stryMutAct_9fa48("161438") ? false : stryMutAct_9fa48("161437") ? true : stryMutAct_9fa48("161436") ? debugRequested : (stryCov_9fa48("161436", "161437", "161438"), !debugRequested)) {
      if (stryMutAct_9fa48("161439")) {
        {}
      } else {
        stryCov_9fa48("161439");
        return stryMutAct_9fa48("161440") ? {} : (stryCov_9fa48("161440"), {
          valid: stryMutAct_9fa48("161441") ? false : (stryCov_9fa48("161441"), true),
          errors: stryMutAct_9fa48("161442") ? ["Stryker was here"] : (stryCov_9fa48("161442"), [])
        });
      }
    }
    const requireDebugArtifacts = stryMutAct_9fa48("161445") ? capabilityPolicy?.requireDebugArtifacts === false : stryMutAct_9fa48("161444") ? false : stryMutAct_9fa48("161443") ? true : (stryCov_9fa48("161443", "161444", "161445"), (stryMutAct_9fa48("161446") ? capabilityPolicy.requireDebugArtifacts : (stryCov_9fa48("161446"), capabilityPolicy?.requireDebugArtifacts)) !== (stryMutAct_9fa48("161447") ? true : (stryCov_9fa48("161447"), false)));
    if (stryMutAct_9fa48("161450") ? false : stryMutAct_9fa48("161449") ? true : stryMutAct_9fa48("161448") ? requireDebugArtifacts : (stryCov_9fa48("161448", "161449", "161450"), !requireDebugArtifacts)) {
      if (stryMutAct_9fa48("161451")) {
        {}
      } else {
        stryCov_9fa48("161451");
        return stryMutAct_9fa48("161452") ? {} : (stryCov_9fa48("161452"), {
          valid: stryMutAct_9fa48("161453") ? false : (stryCov_9fa48("161453"), true),
          errors: stryMutAct_9fa48("161454") ? ["Stryker was here"] : (stryCov_9fa48("161454"), [])
        });
      }
    }
    const hasDebugArtifact = stryMutAct_9fa48("161457") ? Boolean(manifest[MF.DEBUG_ARTIFACT]) && Boolean(manifest[MF.ARTIFACT_POINTER]) : stryMutAct_9fa48("161456") ? false : stryMutAct_9fa48("161455") ? true : (stryCov_9fa48("161455", "161456", "161457"), Boolean(manifest[MF.DEBUG_ARTIFACT]) || Boolean(manifest[MF.ARTIFACT_POINTER]));
    if (stryMutAct_9fa48("161460") ? false : stryMutAct_9fa48("161459") ? true : stryMutAct_9fa48("161458") ? hasDebugArtifact : (stryCov_9fa48("161458", "161459", "161460"), !hasDebugArtifact)) {
      if (stryMutAct_9fa48("161461")) {
        {}
      } else {
        stryCov_9fa48("161461");
        return stryMutAct_9fa48("161462") ? {} : (stryCov_9fa48("161462"), {
          valid: stryMutAct_9fa48("161463") ? true : (stryCov_9fa48("161463"), false),
          errors: stryMutAct_9fa48("161464") ? [] : (stryCov_9fa48("161464"), [VALIDATION_PIPELINE_ERROR_MSG.DEBUG_ARTIFACT_REQUIRED])
        });
      }
    }
    return stryMutAct_9fa48("161465") ? {} : (stryCov_9fa48("161465"), {
      valid: stryMutAct_9fa48("161466") ? false : (stryCov_9fa48("161466"), true),
      errors: stryMutAct_9fa48("161467") ? ["Stryker was here"] : (stryCov_9fa48("161467"), [])
    });
  }
}

/**
 * Build a declarative validation chain for publish commands.
 * Returns an array of step descriptors the caller iterates
 * and stops on first failure.
 *
 * @return {Array<{name: string, validate: Function}>} Steps.
 */
function buildPublishValidationChain() {
  if (stryMutAct_9fa48("161468")) {
    {}
  } else {
    stryCov_9fa48("161468");
    return stryMutAct_9fa48("161469") ? [] : (stryCov_9fa48("161469"), [stryMutAct_9fa48("161470") ? {} : (stryCov_9fa48("161470"), {
      name: VALIDATION_STEP.MANIFEST,
      validate: params => {
        if (stryMutAct_9fa48("161471")) {
          {}
        } else {
          stryCov_9fa48("161471");
          const result = validateModuleManifest(params.manifest);
          if (stryMutAct_9fa48("161474") ? false : stryMutAct_9fa48("161473") ? true : stryMutAct_9fa48("161472") ? result.valid : (stryCov_9fa48("161472", "161473", "161474"), !result.valid)) {
            if (stryMutAct_9fa48("161475")) {
              {}
            } else {
              stryCov_9fa48("161475");
              return stryMutAct_9fa48("161476") ? {} : (stryCov_9fa48("161476"), {
                valid: stryMutAct_9fa48("161477") ? true : (stryCov_9fa48("161477"), false),
                errors: stryMutAct_9fa48("161478") ? [] : (stryCov_9fa48("161478"), [VALIDATION_PIPELINE_ERROR_MSG.MANIFEST_INVALID, ...result.errors])
              });
            }
          }
          return stryMutAct_9fa48("161479") ? {} : (stryCov_9fa48("161479"), {
            valid: stryMutAct_9fa48("161480") ? false : (stryCov_9fa48("161480"), true),
            errors: stryMutAct_9fa48("161481") ? ["Stryker was here"] : (stryCov_9fa48("161481"), [])
          });
        }
      }
    }), stryMutAct_9fa48("161482") ? {} : (stryCov_9fa48("161482"), {
      name: VALIDATION_STEP.CAPABILITIES,
      validate: stryMutAct_9fa48("161483") ? () => undefined : (stryCov_9fa48("161483"), params => validateCapabilities(params.manifest, stryMutAct_9fa48("161486") ? params.capabilityPolicy && null : stryMutAct_9fa48("161485") ? false : stryMutAct_9fa48("161484") ? true : (stryCov_9fa48("161484", "161485", "161486"), params.capabilityPolicy || null), stryMutAct_9fa48("161489") ? params.tenantAllowlist && [] : stryMutAct_9fa48("161488") ? false : stryMutAct_9fa48("161487") ? true : (stryCov_9fa48("161487", "161488", "161489"), params.tenantAllowlist || (stryMutAct_9fa48("161490") ? ["Stryker was here"] : (stryCov_9fa48("161490"), [])))))
    }), stryMutAct_9fa48("161491") ? {} : (stryCov_9fa48("161491"), {
      name: VALIDATION_STEP.DEBUG_ARTIFACTS,
      validate: stryMutAct_9fa48("161492") ? () => undefined : (stryCov_9fa48("161492"), params => validateDebugArtifactPolicy(params.manifest, stryMutAct_9fa48("161495") ? params.capabilityPolicy && null : stryMutAct_9fa48("161494") ? false : stryMutAct_9fa48("161493") ? true : (stryCov_9fa48("161493", "161494", "161495"), params.capabilityPolicy || null)))
    }), stryMutAct_9fa48("161496") ? {} : (stryCov_9fa48("161496"), {
      name: VALIDATION_STEP.DEPENDENCIES,
      validate: stryMutAct_9fa48("161497") ? () => undefined : (stryCov_9fa48("161497"), params => validateResolvedDependencies(stryMutAct_9fa48("161500") ? params.resolvedDependencies && null : stryMutAct_9fa48("161499") ? false : stryMutAct_9fa48("161498") ? true : (stryCov_9fa48("161498", "161499", "161500"), params.resolvedDependencies || null)))
    })]);
  }
}

/**
 * Run the full publish validation pipeline.
 * Executes each step in order and stops on first failure.
 *
 * @param {Object} params - Pipeline parameters.
 * @param {Object} params.manifest - Module manifest object.
 * @param {Object} [params.capabilityPolicy] - CapabilityPolicy
 *   instance or null.
 * @param {string[]} [params.tenantAllowlist] - Tenant allowed
 *   capabilities.
 * @param {Array<Object>} [params.resolvedDependencies] -
 *   Pre-resolved dependency objects.
 * @return {{valid: boolean, errors: string[]}} Result.
 */
function validatePublishPipeline(params) {
  if (stryMutAct_9fa48("161501")) {
    {}
  } else {
    stryCov_9fa48("161501");
    const chain = buildPublishValidationChain();
    for (const step of chain) {
      if (stryMutAct_9fa48("161502")) {
        {}
      } else {
        stryCov_9fa48("161502");
        const result = step.validate(params);
        if (stryMutAct_9fa48("161505") ? false : stryMutAct_9fa48("161504") ? true : stryMutAct_9fa48("161503") ? result.valid : (stryCov_9fa48("161503", "161504", "161505"), !result.valid)) {
          if (stryMutAct_9fa48("161506")) {
            {}
          } else {
            stryCov_9fa48("161506");
            return stryMutAct_9fa48("161507") ? {} : (stryCov_9fa48("161507"), {
              valid: stryMutAct_9fa48("161508") ? true : (stryCov_9fa48("161508"), false),
              errors: result.errors
            });
          }
        }
      }
    }
    return stryMutAct_9fa48("161509") ? {} : (stryCov_9fa48("161509"), {
      valid: stryMutAct_9fa48("161510") ? false : (stryCov_9fa48("161510"), true),
      errors: stryMutAct_9fa48("161511") ? ["Stryker was here"] : (stryCov_9fa48("161511"), [])
    });
  }
}
export { VALIDATION_STEP, VALIDATION_PIPELINE_ERROR_MSG, validateCapabilities, validateDebugArtifactPolicy, validateResolvedDependencies, buildPublishValidationChain, validatePublishPipeline };