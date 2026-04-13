/**
 * HostImportRegistry assembles runtime host imports based on
 * declared capabilities, policy allowlist, and debug-session state.
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
import { NUM, TYPEOF } from '../constants/index.js';
import { DEBUG_CAPABILITY, HOST_IMPORT_NAMESPACE, WASM_RUNTIME_ADAPTER_ERROR_MSG as ERR } from './debug-runtime-constants.js';

/**
 * Convert a capability array to a normalized set.
 *
 * @param {Array<string>|null|undefined} capabilities
 * @return {Set<string>}
 */
function asCapabilitySet(capabilities) {
  if (stryMutAct_9fa48("77550")) {
    {}
  } else {
    stryCov_9fa48("77550");
    if (stryMutAct_9fa48("77553") ? false : stryMutAct_9fa48("77552") ? true : stryMutAct_9fa48("77551") ? Array.isArray(capabilities) : (stryCov_9fa48("77551", "77552", "77553"), !Array.isArray(capabilities))) {
      if (stryMutAct_9fa48("77554")) {
        {}
      } else {
        stryCov_9fa48("77554");
        return new Set();
      }
    }
    return new Set(stryMutAct_9fa48("77555") ? capabilities : (stryCov_9fa48("77555"), capabilities.filter(stryMutAct_9fa48("77556") ? () => undefined : (stryCov_9fa48("77556"), cap => stryMutAct_9fa48("77559") ? typeof cap === TYPEOF.STRING || cap.length > NUM.ZERO : stryMutAct_9fa48("77558") ? false : stryMutAct_9fa48("77557") ? true : (stryCov_9fa48("77557", "77558", "77559"), (stryMutAct_9fa48("77561") ? typeof cap !== TYPEOF.STRING : stryMutAct_9fa48("77560") ? true : (stryCov_9fa48("77560", "77561"), typeof cap === TYPEOF.STRING)) && (stryMutAct_9fa48("77564") ? cap.length <= NUM.ZERO : stryMutAct_9fa48("77563") ? cap.length >= NUM.ZERO : stryMutAct_9fa48("77562") ? true : (stryCov_9fa48("77562", "77563", "77564"), cap.length > NUM.ZERO)))))));
  }
}

/**
 * Check whether a debug capability import is allowed.
 *
 * @param {string} capability
 * @param {Object} options
 * @param {Set<string>} options.declared
 * @param {Set<string>} options.allowed
 * @param {boolean} options.sessionActive
 * @return {boolean}
 */
function shouldInjectDebugCapability(capability, options) {
  if (stryMutAct_9fa48("77565")) {
    {}
  } else {
    stryCov_9fa48("77565");
    return stryMutAct_9fa48("77568") ? options.sessionActive && options.declared.has(capability) || options.allowed.has(capability) : stryMutAct_9fa48("77567") ? false : stryMutAct_9fa48("77566") ? true : (stryCov_9fa48("77566", "77567", "77568"), (stryMutAct_9fa48("77570") ? options.sessionActive || options.declared.has(capability) : stryMutAct_9fa48("77569") ? true : (stryCov_9fa48("77569", "77570"), options.sessionActive && options.declared.has(capability))) && options.allowed.has(capability));
  }
}

/**
 * Host import registry for runtime adapter instantiation.
 */
class HostImportRegistry {
  /**
   * @param {Object} [options]
   * @param {Object<string, Object>} [options.baseImports] - Always-on imports.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("77571")) {
      {}
    } else {
      stryCov_9fa48("77571");
      this.baseImports = {};
      const baseImports = stryMutAct_9fa48("77574") ? options.baseImports && {} : stryMutAct_9fa48("77573") ? false : stryMutAct_9fa48("77572") ? true : (stryCov_9fa48("77572", "77573", "77574"), options.baseImports || {});
      for (const namespace of Object.keys(baseImports)) {
        if (stryMutAct_9fa48("77575")) {
          {}
        } else {
          stryCov_9fa48("77575");
          this.registerBaseImport(namespace, baseImports[namespace]);
        }
      }

      /** @type {Map<string, {namespace: string, module: Object}>} */
      this.capabilityImports = new Map();
    }
  }

  /**
   * Register always-on imports under a namespace.
   *
   * @param {string} namespace - Host import namespace.
   * @param {Object} moduleImpl - Namespace module implementation.
   */
  registerBaseImport(namespace, moduleImpl) {
    if (stryMutAct_9fa48("77576")) {
      {}
    } else {
      stryCov_9fa48("77576");
      if (stryMutAct_9fa48("77579") ? !namespace && typeof namespace !== TYPEOF.STRING : stryMutAct_9fa48("77578") ? false : stryMutAct_9fa48("77577") ? true : (stryCov_9fa48("77577", "77578", "77579"), (stryMutAct_9fa48("77580") ? namespace : (stryCov_9fa48("77580"), !namespace)) || (stryMutAct_9fa48("77582") ? typeof namespace === TYPEOF.STRING : stryMutAct_9fa48("77581") ? false : (stryCov_9fa48("77581", "77582"), typeof namespace !== TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("77583")) {
          {}
        } else {
          stryCov_9fa48("77583");
          throw new Error(ERR.IMPORT_NAMESPACE_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("77586") ? !moduleImpl && typeof moduleImpl !== TYPEOF.OBJECT : stryMutAct_9fa48("77585") ? false : stryMutAct_9fa48("77584") ? true : (stryCov_9fa48("77584", "77585", "77586"), (stryMutAct_9fa48("77587") ? moduleImpl : (stryCov_9fa48("77587"), !moduleImpl)) || (stryMutAct_9fa48("77589") ? typeof moduleImpl === TYPEOF.OBJECT : stryMutAct_9fa48("77588") ? false : (stryCov_9fa48("77588", "77589"), typeof moduleImpl !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("77590")) {
          {}
        } else {
          stryCov_9fa48("77590");
          throw new Error(ERR.IMPORT_MODULE_REQUIRED);
        }
      }
      this.baseImports[namespace] = moduleImpl;
    }
  }

  /**
   * Register capability-gated imports.
   *
   * @param {string} capability - Capability string.
   * @param {string} namespace - Host import namespace.
   * @param {Object} moduleImpl - Namespace module implementation.
   */
  registerCapabilityImport(capability, namespace, moduleImpl) {
    if (stryMutAct_9fa48("77591")) {
      {}
    } else {
      stryCov_9fa48("77591");
      if (stryMutAct_9fa48("77594") ? !capability && typeof capability !== TYPEOF.STRING : stryMutAct_9fa48("77593") ? false : stryMutAct_9fa48("77592") ? true : (stryCov_9fa48("77592", "77593", "77594"), (stryMutAct_9fa48("77595") ? capability : (stryCov_9fa48("77595"), !capability)) || (stryMutAct_9fa48("77597") ? typeof capability === TYPEOF.STRING : stryMutAct_9fa48("77596") ? false : (stryCov_9fa48("77596", "77597"), typeof capability !== TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("77598")) {
          {}
        } else {
          stryCov_9fa48("77598");
          throw new Error(ERR.CAPABILITY_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("77601") ? !namespace && typeof namespace !== TYPEOF.STRING : stryMutAct_9fa48("77600") ? false : stryMutAct_9fa48("77599") ? true : (stryCov_9fa48("77599", "77600", "77601"), (stryMutAct_9fa48("77602") ? namespace : (stryCov_9fa48("77602"), !namespace)) || (stryMutAct_9fa48("77604") ? typeof namespace === TYPEOF.STRING : stryMutAct_9fa48("77603") ? false : (stryCov_9fa48("77603", "77604"), typeof namespace !== TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("77605")) {
          {}
        } else {
          stryCov_9fa48("77605");
          throw new Error(ERR.IMPORT_NAMESPACE_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("77608") ? !moduleImpl && typeof moduleImpl !== TYPEOF.OBJECT : stryMutAct_9fa48("77607") ? false : stryMutAct_9fa48("77606") ? true : (stryCov_9fa48("77606", "77607", "77608"), (stryMutAct_9fa48("77609") ? moduleImpl : (stryCov_9fa48("77609"), !moduleImpl)) || (stryMutAct_9fa48("77611") ? typeof moduleImpl === TYPEOF.OBJECT : stryMutAct_9fa48("77610") ? false : (stryCov_9fa48("77610", "77611"), typeof moduleImpl !== TYPEOF.OBJECT)))) {
        if (stryMutAct_9fa48("77612")) {
          {}
        } else {
          stryCov_9fa48("77612");
          throw new Error(ERR.IMPORT_MODULE_REQUIRED);
        }
      }
      this.capabilityImports.set(capability, stryMutAct_9fa48("77613") ? {} : (stryCov_9fa48("77613"), {
        namespace,
        module: moduleImpl
      }));
    }
  }

  /**
   * Build runtime imports for an execution request.
   *
   * @param {Object} options
   * @param {Array<string>} [options.declaredCapabilities]
   * @param {Array<string>} [options.allowedCapabilities]
   * @param {boolean} [options.sessionActive]
   * @return {Object<string, Object>}
   */
  buildImports(options = {}) {
    if (stryMutAct_9fa48("77614")) {
      {}
    } else {
      stryCov_9fa48("77614");
      const declared = asCapabilitySet(options.declaredCapabilities);
      const allowed = asCapabilitySet(options.allowedCapabilities);
      const sessionActive = stryMutAct_9fa48("77617") ? options.sessionActive !== true : stryMutAct_9fa48("77616") ? false : stryMutAct_9fa48("77615") ? true : (stryCov_9fa48("77615", "77616", "77617"), options.sessionActive === (stryMutAct_9fa48("77618") ? false : (stryCov_9fa48("77618"), true)));
      const imports = {};
      for (const namespace of Object.keys(this.baseImports)) {
        if (stryMutAct_9fa48("77619")) {
          {}
        } else {
          stryCov_9fa48("77619");
          imports[namespace] = stryMutAct_9fa48("77620") ? {} : (stryCov_9fa48("77620"), {
            ...this.baseImports[namespace]
          });
        }
      }
      for (const [capability, record] of this.capabilityImports) {
        if (stryMutAct_9fa48("77621")) {
          {}
        } else {
          stryCov_9fa48("77621");
          const isDebugCap = stryMutAct_9fa48("77624") ? (capability === DEBUG_CAPABILITY.TRACE || capability === DEBUG_CAPABILITY.BREAKPOINT) && capability === DEBUG_CAPABILITY.SNAPSHOT : stryMutAct_9fa48("77623") ? false : stryMutAct_9fa48("77622") ? true : (stryCov_9fa48("77622", "77623", "77624"), (stryMutAct_9fa48("77626") ? capability === DEBUG_CAPABILITY.TRACE && capability === DEBUG_CAPABILITY.BREAKPOINT : stryMutAct_9fa48("77625") ? false : (stryCov_9fa48("77625", "77626"), (stryMutAct_9fa48("77628") ? capability !== DEBUG_CAPABILITY.TRACE : stryMutAct_9fa48("77627") ? false : (stryCov_9fa48("77627", "77628"), capability === DEBUG_CAPABILITY.TRACE)) || (stryMutAct_9fa48("77630") ? capability !== DEBUG_CAPABILITY.BREAKPOINT : stryMutAct_9fa48("77629") ? false : (stryCov_9fa48("77629", "77630"), capability === DEBUG_CAPABILITY.BREAKPOINT)))) || (stryMutAct_9fa48("77632") ? capability !== DEBUG_CAPABILITY.SNAPSHOT : stryMutAct_9fa48("77631") ? false : (stryCov_9fa48("77631", "77632"), capability === DEBUG_CAPABILITY.SNAPSHOT)));
          const capabilityAllowed = stryMutAct_9fa48("77635") ? declared.has(capability) || allowed.has(capability) : stryMutAct_9fa48("77634") ? false : stryMutAct_9fa48("77633") ? true : (stryCov_9fa48("77633", "77634", "77635"), declared.has(capability) && allowed.has(capability));
          if (stryMutAct_9fa48("77638") ? false : stryMutAct_9fa48("77637") ? true : stryMutAct_9fa48("77636") ? capabilityAllowed : (stryCov_9fa48("77636", "77637", "77638"), !capabilityAllowed)) {
            if (stryMutAct_9fa48("77639")) {
              {}
            } else {
              stryCov_9fa48("77639");
              continue;
            }
          }
          if (stryMutAct_9fa48("77642") ? isDebugCap || !shouldInjectDebugCapability(capability, {
            declared,
            allowed,
            sessionActive
          }) : stryMutAct_9fa48("77641") ? false : stryMutAct_9fa48("77640") ? true : (stryCov_9fa48("77640", "77641", "77642"), isDebugCap && (stryMutAct_9fa48("77643") ? shouldInjectDebugCapability(capability, {
            declared,
            allowed,
            sessionActive
          }) : (stryCov_9fa48("77643"), !shouldInjectDebugCapability(capability, stryMutAct_9fa48("77644") ? {} : (stryCov_9fa48("77644"), {
            declared,
            allowed,
            sessionActive
          })))))) {
            if (stryMutAct_9fa48("77645")) {
              {}
            } else {
              stryCov_9fa48("77645");
              continue;
            }
          }
          if (stryMutAct_9fa48("77648") ? false : stryMutAct_9fa48("77647") ? true : stryMutAct_9fa48("77646") ? imports[record.namespace] : (stryCov_9fa48("77646", "77647", "77648"), !imports[record.namespace])) {
            if (stryMutAct_9fa48("77649")) {
              {}
            } else {
              stryCov_9fa48("77649");
              imports[record.namespace] = {};
            }
          }
          imports[record.namespace] = stryMutAct_9fa48("77650") ? {} : (stryCov_9fa48("77650"), {
            ...imports[record.namespace],
            ...record.module
          });
        }
      }
      return imports;
    }
  }
}

/**
 * Create registry preconfigured with standard namespace slots.
 *
 * @param {Object} [options]
 * @param {Object<string, Object>} [options.baseImports]
 * @return {HostImportRegistry}
 */
function createHostImportRegistry(options = {}) {
  if (stryMutAct_9fa48("77651")) {
    {}
  } else {
    stryCov_9fa48("77651");
    const registry = new HostImportRegistry(stryMutAct_9fa48("77652") ? {} : (stryCov_9fa48("77652"), {
      baseImports: stryMutAct_9fa48("77655") ? options.baseImports && {} : stryMutAct_9fa48("77654") ? false : stryMutAct_9fa48("77653") ? true : (stryCov_9fa48("77653", "77654", "77655"), options.baseImports || {})
    }));
    if (stryMutAct_9fa48("77658") ? false : stryMutAct_9fa48("77657") ? true : stryMutAct_9fa48("77656") ? registry.baseImports[HOST_IMPORT_NAMESPACE.ENV] : (stryCov_9fa48("77656", "77657", "77658"), !registry.baseImports[HOST_IMPORT_NAMESPACE.ENV])) {
      if (stryMutAct_9fa48("77659")) {
        {}
      } else {
        stryCov_9fa48("77659");
        registry.baseImports[HOST_IMPORT_NAMESPACE.ENV] = {};
      }
    }
    if (stryMutAct_9fa48("77662") ? false : stryMutAct_9fa48("77661") ? true : stryMutAct_9fa48("77660") ? registry.baseImports[HOST_IMPORT_NAMESPACE.DB] : (stryCov_9fa48("77660", "77661", "77662"), !registry.baseImports[HOST_IMPORT_NAMESPACE.DB])) {
      if (stryMutAct_9fa48("77663")) {
        {}
      } else {
        stryCov_9fa48("77663");
        registry.baseImports[HOST_IMPORT_NAMESPACE.DB] = {};
      }
    }
    return registry;
  }
}
export { HostImportRegistry, createHostImportRegistry, shouldInjectDebugCapability };