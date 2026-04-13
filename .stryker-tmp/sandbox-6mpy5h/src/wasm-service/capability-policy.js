/**
 * Capability Policy Enforcement — enforces tenant/service
 * capability allowlists during WASM module load.
 *
 * Responsibilities:
 * 1. Enforce tenant/service capability allowlists.
 * 2. Inject only declared capability modules into runtime.
 * 3. Reject capabilities not in the policy allowlist.
 * 4. Reject capability modules not declared in manifest.
 *
 * Requirements: 8.2, 8.3
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
import { MODULE_MANIFEST_FIELD as MF, MODULE_MANIFEST_ERROR_MSG as ERR } from './module-manifest-constants.js';

/**
 * Check whether a single capability is allowed by the
 * tenant/service policy.
 *
 * @param {string} capability - Capability name (e.g. "sql.read").
 * @param {string[]} allowlist - Allowed capabilities for the
 *   tenant/service.
 * @return {boolean} True if capability is in the allowlist.
 */
function isCapabilityAllowed(capability, allowlist) {
  if (stryMutAct_9fa48("160392")) {
    {}
  } else {
    stryCov_9fa48("160392");
    if (stryMutAct_9fa48("160395") ? false : stryMutAct_9fa48("160394") ? true : stryMutAct_9fa48("160393") ? Array.isArray(allowlist) : (stryCov_9fa48("160393", "160394", "160395"), !Array.isArray(allowlist))) return stryMutAct_9fa48("160396") ? true : (stryCov_9fa48("160396"), false);
    return allowlist.includes(capability);
  }
}

/**
 * Enforce capability policy for all capabilities declared in
 * a module manifest against a tenant/service allowlist.
 *
 * @param {Object} manifest - Module manifest object.
 * @param {Object} policy - Capability policy object.
 * @param {string[]} policy.allowedCapabilities - Allowed
 *   capability names for the tenant/service.
 * @return {{valid: boolean, errors: string[],
 *   allowed: string[], denied: string[]}} Result.
 */
function enforceCapabilityPolicy(manifest, policy) {
  if (stryMutAct_9fa48("160397")) {
    {}
  } else {
    stryCov_9fa48("160397");
    const errors = stryMutAct_9fa48("160398") ? ["Stryker was here"] : (stryCov_9fa48("160398"), []);
    const allowed = stryMutAct_9fa48("160399") ? ["Stryker was here"] : (stryCov_9fa48("160399"), []);
    const denied = stryMutAct_9fa48("160400") ? ["Stryker was here"] : (stryCov_9fa48("160400"), []);
    if (stryMutAct_9fa48("160403") ? false : stryMutAct_9fa48("160402") ? true : stryMutAct_9fa48("160401") ? manifest : (stryCov_9fa48("160401", "160402", "160403"), !manifest)) {
      if (stryMutAct_9fa48("160404")) {
        {}
      } else {
        stryCov_9fa48("160404");
        errors.push(ERR.MANIFEST_REQUIRED);
        return stryMutAct_9fa48("160405") ? {} : (stryCov_9fa48("160405"), {
          valid: stryMutAct_9fa48("160406") ? true : (stryCov_9fa48("160406"), false),
          errors,
          allowed,
          denied
        });
      }
    }
    if (stryMutAct_9fa48("160409") ? false : stryMutAct_9fa48("160408") ? true : stryMutAct_9fa48("160407") ? policy : (stryCov_9fa48("160407", "160408", "160409"), !policy)) {
      if (stryMutAct_9fa48("160410")) {
        {}
      } else {
        stryCov_9fa48("160410");
        errors.push(ERR.POLICY_REQUIRED);
        return stryMutAct_9fa48("160411") ? {} : (stryCov_9fa48("160411"), {
          valid: stryMutAct_9fa48("160412") ? true : (stryCov_9fa48("160412"), false),
          errors,
          allowed,
          denied
        });
      }
    }
    const caps = stryMutAct_9fa48("160415") ? manifest[MF.CAPABILITIES] && [] : stryMutAct_9fa48("160414") ? false : stryMutAct_9fa48("160413") ? true : (stryCov_9fa48("160413", "160414", "160415"), manifest[MF.CAPABILITIES] || (stryMutAct_9fa48("160416") ? ["Stryker was here"] : (stryCov_9fa48("160416"), [])));
    const allowlist = stryMutAct_9fa48("160419") ? policy.allowedCapabilities && [] : stryMutAct_9fa48("160418") ? false : stryMutAct_9fa48("160417") ? true : (stryCov_9fa48("160417", "160418", "160419"), policy.allowedCapabilities || (stryMutAct_9fa48("160420") ? ["Stryker was here"] : (stryCov_9fa48("160420"), [])));
    for (const cap of caps) {
      if (stryMutAct_9fa48("160421")) {
        {}
      } else {
        stryCov_9fa48("160421");
        if (stryMutAct_9fa48("160423") ? false : stryMutAct_9fa48("160422") ? true : (stryCov_9fa48("160422", "160423"), isCapabilityAllowed(cap, allowlist))) {
          if (stryMutAct_9fa48("160424")) {
            {}
          } else {
            stryCov_9fa48("160424");
            allowed.push(cap);
          }
        } else {
          if (stryMutAct_9fa48("160425")) {
            {}
          } else {
            stryCov_9fa48("160425");
            denied.push(cap);
            errors.push(ERR.CAPABILITY_NOT_ALLOWED);
          }
        }
      }
    }
    return stryMutAct_9fa48("160426") ? {} : (stryCov_9fa48("160426"), {
      valid: stryMutAct_9fa48("160429") ? errors.length !== NUM.ZERO : stryMutAct_9fa48("160428") ? false : stryMutAct_9fa48("160427") ? true : (stryCov_9fa48("160427", "160428", "160429"), errors.length === NUM.ZERO),
      errors,
      allowed,
      denied
    });
  }
}

/**
 * Filter the set of capability modules to inject into the
 * WASM runtime imports. Only capabilities declared in the
 * manifest AND allowed by policy are injected.
 *
 * @param {Object} manifest - Module manifest object.
 * @param {Object} policy - Capability policy object.
 * @param {Object} availableModules - Map of capability name
 *   to module implementation.
 * @return {{imports: Object, errors: string[]}} Filtered
 *   imports map and any errors.
 */
function buildCapabilityImports(manifest, policy, availableModules) {
  if (stryMutAct_9fa48("160430")) {
    {}
  } else {
    stryCov_9fa48("160430");
    const errors = stryMutAct_9fa48("160431") ? ["Stryker was here"] : (stryCov_9fa48("160431"), []);
    const imports = {};
    if (stryMutAct_9fa48("160434") ? false : stryMutAct_9fa48("160433") ? true : stryMutAct_9fa48("160432") ? manifest : (stryCov_9fa48("160432", "160433", "160434"), !manifest)) {
      if (stryMutAct_9fa48("160435")) {
        {}
      } else {
        stryCov_9fa48("160435");
        errors.push(ERR.MANIFEST_REQUIRED);
        return stryMutAct_9fa48("160436") ? {} : (stryCov_9fa48("160436"), {
          imports,
          errors
        });
      }
    }
    if (stryMutAct_9fa48("160439") ? false : stryMutAct_9fa48("160438") ? true : stryMutAct_9fa48("160437") ? policy : (stryCov_9fa48("160437", "160438", "160439"), !policy)) {
      if (stryMutAct_9fa48("160440")) {
        {}
      } else {
        stryCov_9fa48("160440");
        errors.push(ERR.POLICY_REQUIRED);
        return stryMutAct_9fa48("160441") ? {} : (stryCov_9fa48("160441"), {
          imports,
          errors
        });
      }
    }
    const caps = stryMutAct_9fa48("160444") ? manifest[MF.CAPABILITIES] && [] : stryMutAct_9fa48("160443") ? false : stryMutAct_9fa48("160442") ? true : (stryCov_9fa48("160442", "160443", "160444"), manifest[MF.CAPABILITIES] || (stryMutAct_9fa48("160445") ? ["Stryker was here"] : (stryCov_9fa48("160445"), [])));
    const allowlist = stryMutAct_9fa48("160448") ? policy.allowedCapabilities && [] : stryMutAct_9fa48("160447") ? false : stryMutAct_9fa48("160446") ? true : (stryCov_9fa48("160446", "160447", "160448"), policy.allowedCapabilities || (stryMutAct_9fa48("160449") ? ["Stryker was here"] : (stryCov_9fa48("160449"), [])));
    const modules = stryMutAct_9fa48("160452") ? availableModules && {} : stryMutAct_9fa48("160451") ? false : stryMutAct_9fa48("160450") ? true : (stryCov_9fa48("160450", "160451", "160452"), availableModules || {});
    for (const cap of caps) {
      if (stryMutAct_9fa48("160453")) {
        {}
      } else {
        stryCov_9fa48("160453");
        if (stryMutAct_9fa48("160456") ? false : stryMutAct_9fa48("160455") ? true : stryMutAct_9fa48("160454") ? isCapabilityAllowed(cap, allowlist) : (stryCov_9fa48("160454", "160455", "160456"), !isCapabilityAllowed(cap, allowlist))) {
          if (stryMutAct_9fa48("160457")) {
            {}
          } else {
            stryCov_9fa48("160457");
            errors.push(ERR.CAPABILITY_NOT_ALLOWED);
            continue;
          }
        }
        if (stryMutAct_9fa48("160460") ? modules[cap] === undefined : stryMutAct_9fa48("160459") ? false : stryMutAct_9fa48("160458") ? true : (stryCov_9fa48("160458", "160459", "160460"), modules[cap] !== undefined)) {
          if (stryMutAct_9fa48("160461")) {
            {}
          } else {
            stryCov_9fa48("160461");
            imports[cap] = modules[cap];
          }
        }
      }
    }
    return stryMutAct_9fa48("160462") ? {} : (stryCov_9fa48("160462"), {
      imports,
      errors
    });
  }
}

/**
 * Check that requested capability modules are declared in
 * the manifest. Rejects undeclared capability requests.
 *
 * @param {string[]} requestedCapabilities - Capabilities
 *   requested at runtime.
 * @param {Object} manifest - Module manifest object.
 * @return {{valid: boolean, errors: string[],
 *   undeclared: string[]}} Result.
 */
function checkUndeclaredCapabilities(requestedCapabilities, manifest) {
  if (stryMutAct_9fa48("160463")) {
    {}
  } else {
    stryCov_9fa48("160463");
    const errors = stryMutAct_9fa48("160464") ? ["Stryker was here"] : (stryCov_9fa48("160464"), []);
    const undeclared = stryMutAct_9fa48("160465") ? ["Stryker was here"] : (stryCov_9fa48("160465"), []);
    if (stryMutAct_9fa48("160468") ? false : stryMutAct_9fa48("160467") ? true : stryMutAct_9fa48("160466") ? manifest : (stryCov_9fa48("160466", "160467", "160468"), !manifest)) {
      if (stryMutAct_9fa48("160469")) {
        {}
      } else {
        stryCov_9fa48("160469");
        errors.push(ERR.MANIFEST_REQUIRED);
        return stryMutAct_9fa48("160470") ? {} : (stryCov_9fa48("160470"), {
          valid: stryMutAct_9fa48("160471") ? true : (stryCov_9fa48("160471"), false),
          errors,
          undeclared
        });
      }
    }
    const declaredCaps = new Set(stryMutAct_9fa48("160474") ? manifest[MF.CAPABILITIES] && [] : stryMutAct_9fa48("160473") ? false : stryMutAct_9fa48("160472") ? true : (stryCov_9fa48("160472", "160473", "160474"), manifest[MF.CAPABILITIES] || (stryMutAct_9fa48("160475") ? ["Stryker was here"] : (stryCov_9fa48("160475"), []))));
    for (const cap of requestedCapabilities) {
      if (stryMutAct_9fa48("160476")) {
        {}
      } else {
        stryCov_9fa48("160476");
        if (stryMutAct_9fa48("160479") ? false : stryMutAct_9fa48("160478") ? true : stryMutAct_9fa48("160477") ? declaredCaps.has(cap) : (stryCov_9fa48("160477", "160478", "160479"), !declaredCaps.has(cap))) {
          if (stryMutAct_9fa48("160480")) {
            {}
          } else {
            stryCov_9fa48("160480");
            undeclared.push(cap);
            errors.push(ERR.CAPABILITY_NOT_DECLARED);
          }
        }
      }
    }
    return stryMutAct_9fa48("160481") ? {} : (stryCov_9fa48("160481"), {
      valid: stryMutAct_9fa48("160484") ? errors.length !== NUM.ZERO : stryMutAct_9fa48("160483") ? false : stryMutAct_9fa48("160482") ? true : (stryCov_9fa48("160482", "160483", "160484"), errors.length === NUM.ZERO),
      errors,
      undeclared
    });
  }
}
export { isCapabilityAllowed, enforceCapabilityPolicy, buildCapabilityImports, checkUndeclaredCapabilities };