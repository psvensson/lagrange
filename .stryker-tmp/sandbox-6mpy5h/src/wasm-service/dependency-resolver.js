/**
 * Dependency resolution for WASM module manifests.
 *
 * Resolves all dependencies declared in a module manifest to
 * immutable digests before activation. Rejects undeclared
 * imports and digest mismatches.
 *
 * Requirements: 5.1, 5.3
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
import { isValidDigest } from './module-manifest-models.js';
import { MODULE_DEPENDENCY_FIELD as DF, MODULE_MANIFEST_FIELD as MF, MODULE_MANIFEST_ERROR_MSG as ERR, MODULE_AUDIT_MSG as AUDIT, RESOLUTION_DECISION } from './module-manifest-constants.js';

/**
 * Resolve all dependencies declared in a module manifest
 * to immutable digests.
 *
 * For each dependency in manifest.dependencies:
 * - Look up the dependency module in availableModules
 * - Verify the resolved module's digest matches the pinned
 *   digest in the dependency declaration
 * - Reject undeclared imports (Req 5.3)
 *
 * @param {Object} manifest - Module manifest with dependencies.
 * @param {Map<string, Object>} availableModules - Map of
 *   moduleId to module objects with at least a `digest` field.
 * @param {Object} [_registryContext] - Reserved for future
 *   registry-aware resolution.
 * @return {{resolved: boolean,
 *   resolvedDependencies?: Array<Object>,
 *   auditLog?: Array<Object>,
 *   errors?: string[]}}
 */
function resolveDependencies(manifest, availableModules, _registryContext) {
  if (stryMutAct_9fa48("160592")) {
    {}
  } else {
    stryCov_9fa48("160592");
    const deps = manifest[MF.DEPENDENCIES];
    const auditLog = stryMutAct_9fa48("160593") ? ["Stryker was here"] : (stryCov_9fa48("160593"), []);
    if (stryMutAct_9fa48("160596") ? (!deps || !Array.isArray(deps)) && deps.length === NUM.ZERO : stryMutAct_9fa48("160595") ? false : stryMutAct_9fa48("160594") ? true : (stryCov_9fa48("160594", "160595", "160596"), (stryMutAct_9fa48("160598") ? !deps && !Array.isArray(deps) : stryMutAct_9fa48("160597") ? false : (stryCov_9fa48("160597", "160598"), (stryMutAct_9fa48("160599") ? deps : (stryCov_9fa48("160599"), !deps)) || (stryMutAct_9fa48("160600") ? Array.isArray(deps) : (stryCov_9fa48("160600"), !Array.isArray(deps))))) || (stryMutAct_9fa48("160602") ? deps.length !== NUM.ZERO : stryMutAct_9fa48("160601") ? false : (stryCov_9fa48("160601", "160602"), deps.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("160603")) {
        {}
      } else {
        stryCov_9fa48("160603");
        return stryMutAct_9fa48("160604") ? {} : (stryCov_9fa48("160604"), {
          resolved: stryMutAct_9fa48("160605") ? false : (stryCov_9fa48("160605"), true),
          resolvedDependencies: stryMutAct_9fa48("160606") ? ["Stryker was here"] : (stryCov_9fa48("160606"), []),
          auditLog
        });
      }
    }
    const errors = stryMutAct_9fa48("160607") ? ["Stryker was here"] : (stryCov_9fa48("160607"), []);
    const resolvedDependencies = stryMutAct_9fa48("160608") ? ["Stryker was here"] : (stryCov_9fa48("160608"), []);
    for (const dep of deps) {
      if (stryMutAct_9fa48("160609")) {
        {}
      } else {
        stryCov_9fa48("160609");
        const moduleId = dep[DF.MODULE_ID];
        const pinnedDigest = dep[DF.DIGEST];

        // Validate pinned digest format
        if (stryMutAct_9fa48("160612") ? !pinnedDigest && !isValidDigest(pinnedDigest) : stryMutAct_9fa48("160611") ? false : stryMutAct_9fa48("160610") ? true : (stryCov_9fa48("160610", "160611", "160612"), (stryMutAct_9fa48("160613") ? pinnedDigest : (stryCov_9fa48("160613"), !pinnedDigest)) || (stryMutAct_9fa48("160614") ? isValidDigest(pinnedDigest) : (stryCov_9fa48("160614"), !isValidDigest(pinnedDigest))))) {
          if (stryMutAct_9fa48("160615")) {
            {}
          } else {
            stryCov_9fa48("160615");
            errors.push(stryMutAct_9fa48("160616") ? `` : (stryCov_9fa48("160616"), `${ERR.DEPENDENCY_DIGEST_MISMATCH}: ${moduleId}`));
            auditLog.push(stryMutAct_9fa48("160617") ? {} : (stryCov_9fa48("160617"), {
              moduleId,
              decision: RESOLUTION_DECISION.REJECTED,
              reason: AUDIT.DEPENDENCY_REJECTED
            }));
            continue;
          }
        }

        // Look up module in available sources
        const resolved = availableModules instanceof Map ? availableModules.get(moduleId) : null;
        if (stryMutAct_9fa48("160620") ? false : stryMutAct_9fa48("160619") ? true : stryMutAct_9fa48("160618") ? resolved : (stryCov_9fa48("160618", "160619", "160620"), !resolved)) {
          if (stryMutAct_9fa48("160621")) {
            {}
          } else {
            stryCov_9fa48("160621");
            errors.push(stryMutAct_9fa48("160622") ? `` : (stryCov_9fa48("160622"), `${ERR.DEPENDENCY_NOT_FOUND}: ${moduleId}`));
            auditLog.push(stryMutAct_9fa48("160623") ? {} : (stryCov_9fa48("160623"), {
              moduleId,
              decision: RESOLUTION_DECISION.REJECTED,
              reason: AUDIT.DEPENDENCY_REJECTED
            }));
            continue;
          }
        }

        // Verify digest match
        const resolvedDigest = stryMutAct_9fa48("160624") ? resolved[DF.DIGEST] && resolved.digest : (stryCov_9fa48("160624"), resolved[DF.DIGEST] ?? resolved.digest);
        if (stryMutAct_9fa48("160627") ? resolvedDigest === pinnedDigest : stryMutAct_9fa48("160626") ? false : stryMutAct_9fa48("160625") ? true : (stryCov_9fa48("160625", "160626", "160627"), resolvedDigest !== pinnedDigest)) {
          if (stryMutAct_9fa48("160628")) {
            {}
          } else {
            stryCov_9fa48("160628");
            errors.push(stryMutAct_9fa48("160629") ? `` : (stryCov_9fa48("160629"), `${ERR.DEPENDENCY_DIGEST_MISMATCH}: ${moduleId}`));
            auditLog.push(stryMutAct_9fa48("160630") ? {} : (stryCov_9fa48("160630"), {
              moduleId,
              pinnedDigest,
              resolvedDigest,
              decision: RESOLUTION_DECISION.REJECTED,
              reason: AUDIT.DEPENDENCY_REJECTED
            }));
            continue;
          }
        }
        resolvedDependencies.push(stryMutAct_9fa48("160631") ? {} : (stryCov_9fa48("160631"), {
          moduleId,
          digest: pinnedDigest
        }));
        auditLog.push(stryMutAct_9fa48("160632") ? {} : (stryCov_9fa48("160632"), {
          moduleId,
          digest: pinnedDigest,
          decision: RESOLUTION_DECISION.RESOLVED,
          reason: AUDIT.DEPENDENCY_RESOLVED
        }));
      }
    }
    if (stryMutAct_9fa48("160636") ? errors.length <= NUM.ZERO : stryMutAct_9fa48("160635") ? errors.length >= NUM.ZERO : stryMutAct_9fa48("160634") ? false : stryMutAct_9fa48("160633") ? true : (stryCov_9fa48("160633", "160634", "160635", "160636"), errors.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("160637")) {
        {}
      } else {
        stryCov_9fa48("160637");
        return stryMutAct_9fa48("160638") ? {} : (stryCov_9fa48("160638"), {
          resolved: stryMutAct_9fa48("160639") ? true : (stryCov_9fa48("160639"), false),
          errors,
          auditLog
        });
      }
    }
    return stryMutAct_9fa48("160640") ? {} : (stryCov_9fa48("160640"), {
      resolved: stryMutAct_9fa48("160641") ? false : (stryCov_9fa48("160641"), true),
      resolvedDependencies,
      auditLog
    });
  }
}

/**
 * Validate that all dependency digests match available modules.
 *
 * @param {Array<Object>} dependencies - Array of dependency
 *   objects with moduleId and digest fields.
 * @param {Map<string, Object>} availableModules - Map of
 *   moduleId to module objects with at least a `digest` field.
 * @return {{valid: boolean, errors?: string[]}}
 */
function validateDependencyDigests(dependencies, availableModules) {
  if (stryMutAct_9fa48("160642")) {
    {}
  } else {
    stryCov_9fa48("160642");
    if (stryMutAct_9fa48("160645") ? (!dependencies || !Array.isArray(dependencies)) && dependencies.length === NUM.ZERO : stryMutAct_9fa48("160644") ? false : stryMutAct_9fa48("160643") ? true : (stryCov_9fa48("160643", "160644", "160645"), (stryMutAct_9fa48("160647") ? !dependencies && !Array.isArray(dependencies) : stryMutAct_9fa48("160646") ? false : (stryCov_9fa48("160646", "160647"), (stryMutAct_9fa48("160648") ? dependencies : (stryCov_9fa48("160648"), !dependencies)) || (stryMutAct_9fa48("160649") ? Array.isArray(dependencies) : (stryCov_9fa48("160649"), !Array.isArray(dependencies))))) || (stryMutAct_9fa48("160651") ? dependencies.length !== NUM.ZERO : stryMutAct_9fa48("160650") ? false : (stryCov_9fa48("160650", "160651"), dependencies.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("160652")) {
        {}
      } else {
        stryCov_9fa48("160652");
        return stryMutAct_9fa48("160653") ? {} : (stryCov_9fa48("160653"), {
          valid: stryMutAct_9fa48("160654") ? false : (stryCov_9fa48("160654"), true)
        });
      }
    }
    const errors = stryMutAct_9fa48("160655") ? ["Stryker was here"] : (stryCov_9fa48("160655"), []);
    for (const dep of dependencies) {
      if (stryMutAct_9fa48("160656")) {
        {}
      } else {
        stryCov_9fa48("160656");
        const moduleId = dep[DF.MODULE_ID];
        const pinnedDigest = dep[DF.DIGEST];
        if (stryMutAct_9fa48("160659") ? !pinnedDigest && !isValidDigest(pinnedDigest) : stryMutAct_9fa48("160658") ? false : stryMutAct_9fa48("160657") ? true : (stryCov_9fa48("160657", "160658", "160659"), (stryMutAct_9fa48("160660") ? pinnedDigest : (stryCov_9fa48("160660"), !pinnedDigest)) || (stryMutAct_9fa48("160661") ? isValidDigest(pinnedDigest) : (stryCov_9fa48("160661"), !isValidDigest(pinnedDigest))))) {
          if (stryMutAct_9fa48("160662")) {
            {}
          } else {
            stryCov_9fa48("160662");
            errors.push(stryMutAct_9fa48("160663") ? `` : (stryCov_9fa48("160663"), `${ERR.DEPENDENCY_DIGEST_MISMATCH}: ${moduleId}`));
            continue;
          }
        }
        const resolved = availableModules instanceof Map ? availableModules.get(moduleId) : null;
        if (stryMutAct_9fa48("160666") ? false : stryMutAct_9fa48("160665") ? true : stryMutAct_9fa48("160664") ? resolved : (stryCov_9fa48("160664", "160665", "160666"), !resolved)) {
          if (stryMutAct_9fa48("160667")) {
            {}
          } else {
            stryCov_9fa48("160667");
            errors.push(stryMutAct_9fa48("160668") ? `` : (stryCov_9fa48("160668"), `${ERR.DEPENDENCY_NOT_FOUND}: ${moduleId}`));
            continue;
          }
        }
        const resolvedDigest = stryMutAct_9fa48("160669") ? resolved[DF.DIGEST] && resolved.digest : (stryCov_9fa48("160669"), resolved[DF.DIGEST] ?? resolved.digest);
        if (stryMutAct_9fa48("160672") ? resolvedDigest === pinnedDigest : stryMutAct_9fa48("160671") ? false : stryMutAct_9fa48("160670") ? true : (stryCov_9fa48("160670", "160671", "160672"), resolvedDigest !== pinnedDigest)) {
          if (stryMutAct_9fa48("160673")) {
            {}
          } else {
            stryCov_9fa48("160673");
            errors.push(stryMutAct_9fa48("160674") ? `` : (stryCov_9fa48("160674"), `${ERR.DEPENDENCY_DIGEST_MISMATCH}: ${moduleId}`));
          }
        }
      }
    }
    if (stryMutAct_9fa48("160678") ? errors.length <= NUM.ZERO : stryMutAct_9fa48("160677") ? errors.length >= NUM.ZERO : stryMutAct_9fa48("160676") ? false : stryMutAct_9fa48("160675") ? true : (stryCov_9fa48("160675", "160676", "160677", "160678"), errors.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("160679")) {
        {}
      } else {
        stryCov_9fa48("160679");
        return stryMutAct_9fa48("160680") ? {} : (stryCov_9fa48("160680"), {
          valid: stryMutAct_9fa48("160681") ? true : (stryCov_9fa48("160681"), false),
          errors
        });
      }
    }
    return stryMutAct_9fa48("160682") ? {} : (stryCov_9fa48("160682"), {
      valid: stryMutAct_9fa48("160683") ? false : (stryCov_9fa48("160683"), true)
    });
  }
}

/**
 * Detect undeclared imports by comparing a module's actual
 * imports against its declared dependencies.
 *
 * @param {string[]} actualImports - Module IDs the module
 *   actually imports at runtime.
 * @param {Array<Object>} declaredDependencies - Dependencies
 *   declared in the manifest.
 * @return {{valid: boolean, errors?: string[]}}
 */
function detectUndeclaredImports(actualImports, declaredDependencies) {
  if (stryMutAct_9fa48("160684")) {
    {}
  } else {
    stryCov_9fa48("160684");
    if (stryMutAct_9fa48("160687") ? (!actualImports || !Array.isArray(actualImports)) && actualImports.length === NUM.ZERO : stryMutAct_9fa48("160686") ? false : stryMutAct_9fa48("160685") ? true : (stryCov_9fa48("160685", "160686", "160687"), (stryMutAct_9fa48("160689") ? !actualImports && !Array.isArray(actualImports) : stryMutAct_9fa48("160688") ? false : (stryCov_9fa48("160688", "160689"), (stryMutAct_9fa48("160690") ? actualImports : (stryCov_9fa48("160690"), !actualImports)) || (stryMutAct_9fa48("160691") ? Array.isArray(actualImports) : (stryCov_9fa48("160691"), !Array.isArray(actualImports))))) || (stryMutAct_9fa48("160693") ? actualImports.length !== NUM.ZERO : stryMutAct_9fa48("160692") ? false : (stryCov_9fa48("160692", "160693"), actualImports.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("160694")) {
        {}
      } else {
        stryCov_9fa48("160694");
        return stryMutAct_9fa48("160695") ? {} : (stryCov_9fa48("160695"), {
          valid: stryMutAct_9fa48("160696") ? false : (stryCov_9fa48("160696"), true)
        });
      }
    }
    const declaredIds = new Set((stryMutAct_9fa48("160699") ? declaredDependencies && [] : stryMutAct_9fa48("160698") ? false : stryMutAct_9fa48("160697") ? true : (stryCov_9fa48("160697", "160698", "160699"), declaredDependencies || (stryMutAct_9fa48("160700") ? ["Stryker was here"] : (stryCov_9fa48("160700"), [])))).map(stryMutAct_9fa48("160701") ? () => undefined : (stryCov_9fa48("160701"), d => d[DF.MODULE_ID])));
    const errors = stryMutAct_9fa48("160702") ? ["Stryker was here"] : (stryCov_9fa48("160702"), []);
    for (const imp of actualImports) {
      if (stryMutAct_9fa48("160703")) {
        {}
      } else {
        stryCov_9fa48("160703");
        if (stryMutAct_9fa48("160706") ? false : stryMutAct_9fa48("160705") ? true : stryMutAct_9fa48("160704") ? declaredIds.has(imp) : (stryCov_9fa48("160704", "160705", "160706"), !declaredIds.has(imp))) {
          if (stryMutAct_9fa48("160707")) {
            {}
          } else {
            stryCov_9fa48("160707");
            errors.push(stryMutAct_9fa48("160708") ? `` : (stryCov_9fa48("160708"), `${ERR.UNDECLARED_IMPORT}: ${imp}`));
          }
        }
      }
    }
    if (stryMutAct_9fa48("160712") ? errors.length <= NUM.ZERO : stryMutAct_9fa48("160711") ? errors.length >= NUM.ZERO : stryMutAct_9fa48("160710") ? false : stryMutAct_9fa48("160709") ? true : (stryCov_9fa48("160709", "160710", "160711", "160712"), errors.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("160713")) {
        {}
      } else {
        stryCov_9fa48("160713");
        return stryMutAct_9fa48("160714") ? {} : (stryCov_9fa48("160714"), {
          valid: stryMutAct_9fa48("160715") ? true : (stryCov_9fa48("160715"), false),
          errors
        });
      }
    }
    return stryMutAct_9fa48("160716") ? {} : (stryCov_9fa48("160716"), {
      valid: stryMutAct_9fa48("160717") ? false : (stryCov_9fa48("160717"), true)
    });
  }
}
export { resolveDependencies, validateDependencyDigests, detectUndeclaredImports };