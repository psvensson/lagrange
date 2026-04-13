/**
 * Namespace registry mapping resolver.
 *
 * Resolves a package's registry source using the precedence chain:
 * 1. Per-package override (accepted but delegated to task 2.3)
 * 2. Namespace registry mapping
 * 3. Default mapping (if configured)
 *
 * Requirements: 4.1, 4.5
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
import { REGISTRY_MAPPING_FIELD as RM, REGISTRY_OVERRIDE_FIELD as RO } from './wasm-meta-models-constants.js';

// --- Resolution source identifiers ---

const RESOLUTION_SOURCE = Object.freeze(stryMutAct_9fa48("162628") ? {} : (stryCov_9fa48("162628"), {
  OVERRIDE: stryMutAct_9fa48("162629") ? "" : (stryCov_9fa48("162629"), 'override'),
  NAMESPACE: stryMutAct_9fa48("162630") ? "" : (stryCov_9fa48("162630"), 'namespace'),
  DEFAULT: stryMutAct_9fa48("162631") ? "" : (stryCov_9fa48("162631"), 'default')
}));

// --- Error message constants ---

const RESOLVER_ERROR = Object.freeze(stryMutAct_9fa48("162632") ? {} : (stryCov_9fa48("162632"), {
  NAMESPACE_REQUIRED: stryMutAct_9fa48("162633") ? "" : (stryCov_9fa48("162633"), 'Namespace is required for registry resolution'),
  NAME_REQUIRED: stryMutAct_9fa48("162634") ? "" : (stryCov_9fa48("162634"), 'Package name is required for override lookup'),
  NO_MAPPING_FOUND: stryMutAct_9fa48("162635") ? "" : (stryCov_9fa48("162635"), 'No registry mapping found for namespace'),
  NO_DEFAULT_MAPPING: stryMutAct_9fa48("162636") ? "" : (stryCov_9fa48("162636"), 'No default registry mapping configured')
}));

/**
 * Look up a namespace in the registry mappings.
 *
 * @param {string} namespace - Package namespace to look up.
 * @param {Map|Array} mappings - Registry mappings as a Map
 *   keyed by namespace, or an array of mapping objects.
 * @return {Object|null} The mapping object or null.
 */
function lookupNamespaceMapping(namespace, mappings) {
  if (stryMutAct_9fa48("162637")) {
    {}
  } else {
    stryCov_9fa48("162637");
    if (stryMutAct_9fa48("162640") ? false : stryMutAct_9fa48("162639") ? true : stryMutAct_9fa48("162638") ? mappings : (stryCov_9fa48("162638", "162639", "162640"), !mappings)) {
      if (stryMutAct_9fa48("162641")) {
        {}
      } else {
        stryCov_9fa48("162641");
        return null;
      }
    }
    if (stryMutAct_9fa48("162643") ? false : stryMutAct_9fa48("162642") ? true : (stryCov_9fa48("162642", "162643"), mappings instanceof Map)) {
      if (stryMutAct_9fa48("162644")) {
        {}
      } else {
        stryCov_9fa48("162644");
        return stryMutAct_9fa48("162647") ? mappings.get(namespace) && null : stryMutAct_9fa48("162646") ? false : stryMutAct_9fa48("162645") ? true : (stryCov_9fa48("162645", "162646", "162647"), mappings.get(namespace) || null);
      }
    }
    if (stryMutAct_9fa48("162649") ? false : stryMutAct_9fa48("162648") ? true : (stryCov_9fa48("162648", "162649"), Array.isArray(mappings))) {
      if (stryMutAct_9fa48("162650")) {
        {}
      } else {
        stryCov_9fa48("162650");
        for (const mapping of mappings) {
          if (stryMutAct_9fa48("162651")) {
            {}
          } else {
            stryCov_9fa48("162651");
            if (stryMutAct_9fa48("162654") ? mapping[RM.NAMESPACE] !== namespace : stryMutAct_9fa48("162653") ? false : stryMutAct_9fa48("162652") ? true : (stryCov_9fa48("162652", "162653", "162654"), mapping[RM.NAMESPACE] === namespace)) {
              if (stryMutAct_9fa48("162655")) {
                {}
              } else {
                stryCov_9fa48("162655");
                return mapping;
              }
            }
          }
        }
      }
    }
    return null;
  }
}

/**
 * Resolve a package's registry source using the precedence chain.
 *
 * Resolution order:
 * 1. Per-package override (if provided)
 * 2. Namespace registry mapping
 * 3. Default mapping (if configured)
 *
 * @param {string} namespace - Package namespace.
 * @param {Map|Array} mappings - Namespace registry mappings.
 * @param {Object|null} overrides - Per-package override result
 *   (resolved externally by task 2.3). Expected shape:
 *   `{registryUrl: string}` or null/undefined.
 * @param {Object|null} defaultMapping - Default registry mapping.
 *   Expected shape: `{registryUrl: string}`.
 * @return {{resolved: boolean, registryUrl?: string,
 *   source?: string, auditInfo?: Object, errors?: string[]}}
 */
function resolveRegistryMapping(namespace, mappings, overrides, defaultMapping) {
  if (stryMutAct_9fa48("162656")) {
    {}
  } else {
    stryCov_9fa48("162656");
    if (stryMutAct_9fa48("162659") ? false : stryMutAct_9fa48("162658") ? true : stryMutAct_9fa48("162657") ? namespace : (stryCov_9fa48("162657", "162658", "162659"), !namespace)) {
      if (stryMutAct_9fa48("162660")) {
        {}
      } else {
        stryCov_9fa48("162660");
        return stryMutAct_9fa48("162661") ? {} : (stryCov_9fa48("162661"), {
          resolved: stryMutAct_9fa48("162662") ? true : (stryCov_9fa48("162662"), false),
          errors: stryMutAct_9fa48("162663") ? [] : (stryCov_9fa48("162663"), [RESOLVER_ERROR.NAMESPACE_REQUIRED])
        });
      }
    }

    // 1. Per-package override
    if (stryMutAct_9fa48("162666") ? overrides || overrides[RM.REGISTRY_URL] : stryMutAct_9fa48("162665") ? false : stryMutAct_9fa48("162664") ? true : (stryCov_9fa48("162664", "162665", "162666"), overrides && overrides[RM.REGISTRY_URL])) {
      if (stryMutAct_9fa48("162667")) {
        {}
      } else {
        stryCov_9fa48("162667");
        return buildResolved(overrides[RM.REGISTRY_URL], RESOLUTION_SOURCE.OVERRIDE, namespace, overrides);
      }
    }

    // 2. Namespace registry mapping
    const nsMapping = lookupNamespaceMapping(namespace, mappings);
    if (stryMutAct_9fa48("162669") ? false : stryMutAct_9fa48("162668") ? true : (stryCov_9fa48("162668", "162669"), nsMapping)) {
      if (stryMutAct_9fa48("162670")) {
        {}
      } else {
        stryCov_9fa48("162670");
        return buildResolved(nsMapping[RM.REGISTRY_URL], RESOLUTION_SOURCE.NAMESPACE, namespace, nsMapping);
      }
    }

    // 3. Default mapping
    if (stryMutAct_9fa48("162673") ? defaultMapping || defaultMapping[RM.REGISTRY_URL] : stryMutAct_9fa48("162672") ? false : stryMutAct_9fa48("162671") ? true : (stryCov_9fa48("162671", "162672", "162673"), defaultMapping && defaultMapping[RM.REGISTRY_URL])) {
      if (stryMutAct_9fa48("162674")) {
        {}
      } else {
        stryCov_9fa48("162674");
        return buildResolved(defaultMapping[RM.REGISTRY_URL], RESOLUTION_SOURCE.DEFAULT, namespace, defaultMapping);
      }
    }
    return stryMutAct_9fa48("162675") ? {} : (stryCov_9fa48("162675"), {
      resolved: stryMutAct_9fa48("162676") ? true : (stryCov_9fa48("162676"), false),
      errors: stryMutAct_9fa48("162677") ? [] : (stryCov_9fa48("162677"), [RESOLVER_ERROR.NO_MAPPING_FOUND, RESOLVER_ERROR.NO_DEFAULT_MAPPING])
    });
  }
}

/**
 * Build a successful resolution result with audit info.
 *
 * @param {string} registryUrl - Resolved registry URL.
 * @param {string} source - Resolution source identifier.
 * @param {string} namespace - Package namespace.
 * @param {Object} rule - The mapping rule that was selected.
 * @return {{resolved: boolean, registryUrl: string,
 *   source: string, auditInfo: Object}}
 */
function buildResolved(registryUrl, source, namespace, rule) {
  if (stryMutAct_9fa48("162678")) {
    {}
  } else {
    stryCov_9fa48("162678");
    return stryMutAct_9fa48("162679") ? {} : (stryCov_9fa48("162679"), {
      resolved: stryMutAct_9fa48("162680") ? false : (stryCov_9fa48("162680"), true),
      registryUrl,
      source,
      auditInfo: stryMutAct_9fa48("162681") ? {} : (stryCov_9fa48("162681"), {
        namespace,
        source,
        registryUrl,
        ruleNamespace: stryMutAct_9fa48("162684") ? rule[RM.NAMESPACE] && null : stryMutAct_9fa48("162683") ? false : stryMutAct_9fa48("162682") ? true : (stryCov_9fa48("162682", "162683", "162684"), rule[RM.NAMESPACE] || null)
      })
    });
  }
}

// --- Override key separator ---

const OVERRIDE_KEY_SEPARATOR = stryMutAct_9fa48("162685") ? "" : (stryCov_9fa48("162685"), ':');

/**
 * Build the lookup key for a per-package override.
 *
 * @param {string} namespace - Package namespace.
 * @param {string} name - Package name.
 * @return {string} Key in `namespace:name` format.
 */
function buildOverrideKey(namespace, name) {
  if (stryMutAct_9fa48("162686")) {
    {}
  } else {
    stryCov_9fa48("162686");
    return stryMutAct_9fa48("162687") ? `` : (stryCov_9fa48("162687"), `${namespace}${OVERRIDE_KEY_SEPARATOR}${name}`);
  }
}

/**
 * Look up a per-package override from a collection.
 *
 * @param {string} namespace - Package namespace.
 * @param {string} name - Package name.
 * @param {Map|Array|null|undefined} overrides - Per-package
 *   overrides as a Map keyed by `namespace:name`, or an
 *   array of override objects with namespace/name fields.
 * @return {Object|null} The override object or null.
 */
function lookupPackageOverride(namespace, name, overrides) {
  if (stryMutAct_9fa48("162688")) {
    {}
  } else {
    stryCov_9fa48("162688");
    if (stryMutAct_9fa48("162691") ? false : stryMutAct_9fa48("162690") ? true : stryMutAct_9fa48("162689") ? overrides : (stryCov_9fa48("162689", "162690", "162691"), !overrides)) {
      if (stryMutAct_9fa48("162692")) {
        {}
      } else {
        stryCov_9fa48("162692");
        return null;
      }
    }
    const key = buildOverrideKey(namespace, name);
    if (stryMutAct_9fa48("162694") ? false : stryMutAct_9fa48("162693") ? true : (stryCov_9fa48("162693", "162694"), overrides instanceof Map)) {
      if (stryMutAct_9fa48("162695")) {
        {}
      } else {
        stryCov_9fa48("162695");
        return stryMutAct_9fa48("162698") ? overrides.get(key) && null : stryMutAct_9fa48("162697") ? false : stryMutAct_9fa48("162696") ? true : (stryCov_9fa48("162696", "162697", "162698"), overrides.get(key) || null);
      }
    }
    if (stryMutAct_9fa48("162700") ? false : stryMutAct_9fa48("162699") ? true : (stryCov_9fa48("162699", "162700"), Array.isArray(overrides))) {
      if (stryMutAct_9fa48("162701")) {
        {}
      } else {
        stryCov_9fa48("162701");
        for (const entry of overrides) {
          if (stryMutAct_9fa48("162702")) {
            {}
          } else {
            stryCov_9fa48("162702");
            if (stryMutAct_9fa48("162705") ? entry[RO.NAMESPACE] === namespace || entry[RO.NAME] === name : stryMutAct_9fa48("162704") ? false : stryMutAct_9fa48("162703") ? true : (stryCov_9fa48("162703", "162704", "162705"), (stryMutAct_9fa48("162707") ? entry[RO.NAMESPACE] !== namespace : stryMutAct_9fa48("162706") ? true : (stryCov_9fa48("162706", "162707"), entry[RO.NAMESPACE] === namespace)) && (stryMutAct_9fa48("162709") ? entry[RO.NAME] !== name : stryMutAct_9fa48("162708") ? true : (stryCov_9fa48("162708", "162709"), entry[RO.NAME] === name)))) {
              if (stryMutAct_9fa48("162710")) {
                {}
              } else {
                stryCov_9fa48("162710");
                return entry;
              }
            }
          }
        }
      }
    }
    return null;
  }
}

/**
 * Full resolution combining per-package override lookup
 * with namespace mapping and default fallback.
 *
 * Resolution order:
 * 1. Per-package override (looked up here)
 * 2. Namespace registry mapping (via resolveRegistryMapping)
 * 3. Default mapping (via resolveRegistryMapping)
 *
 * @param {string} namespace - Package namespace.
 * @param {string} name - Package name.
 * @param {Map|Array|null} overrides - Per-package overrides.
 * @param {Map|Array} mappings - Namespace registry mappings.
 * @param {Object|null} defaultMapping - Default registry mapping.
 * @return {{resolved: boolean, registryUrl?: string,
 *   source?: string, auditInfo?: Object, errors?: string[]}}
 */
function resolvePackageSource(namespace, name, overrides, mappings, defaultMapping) {
  if (stryMutAct_9fa48("162711")) {
    {}
  } else {
    stryCov_9fa48("162711");
    if (stryMutAct_9fa48("162714") ? false : stryMutAct_9fa48("162713") ? true : stryMutAct_9fa48("162712") ? namespace : (stryCov_9fa48("162712", "162713", "162714"), !namespace)) {
      if (stryMutAct_9fa48("162715")) {
        {}
      } else {
        stryCov_9fa48("162715");
        return stryMutAct_9fa48("162716") ? {} : (stryCov_9fa48("162716"), {
          resolved: stryMutAct_9fa48("162717") ? true : (stryCov_9fa48("162717"), false),
          errors: stryMutAct_9fa48("162718") ? [] : (stryCov_9fa48("162718"), [RESOLVER_ERROR.NAMESPACE_REQUIRED])
        });
      }
    }
    if (stryMutAct_9fa48("162721") ? false : stryMutAct_9fa48("162720") ? true : stryMutAct_9fa48("162719") ? name : (stryCov_9fa48("162719", "162720", "162721"), !name)) {
      if (stryMutAct_9fa48("162722")) {
        {}
      } else {
        stryCov_9fa48("162722");
        return stryMutAct_9fa48("162723") ? {} : (stryCov_9fa48("162723"), {
          resolved: stryMutAct_9fa48("162724") ? true : (stryCov_9fa48("162724"), false),
          errors: stryMutAct_9fa48("162725") ? [] : (stryCov_9fa48("162725"), [RESOLVER_ERROR.NAME_REQUIRED])
        });
      }
    }
    const override = lookupPackageOverride(namespace, name, overrides);
    return resolveRegistryMapping(namespace, mappings, override, defaultMapping);
  }
}
export { resolveRegistryMapping, lookupNamespaceMapping, lookupPackageOverride, resolvePackageSource, RESOLUTION_SOURCE, RESOLVER_ERROR, OVERRIDE_KEY_SEPARATOR };