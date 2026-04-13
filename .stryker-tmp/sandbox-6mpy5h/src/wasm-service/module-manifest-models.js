/**
 * Data models for WASM module manifests.
 *
 * Handles serialization/deserialization of module manifests
 * using composite key (namespace, name, version) and
 * validation of run_export, dependency digests, and capability
 * declarations.
 *
 * Requirements: 3.2, 5.2, 10.4
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
import { NUM, STRING, TYPEOF, PACKAGE_ID_PATTERN } from '../constants/index.js';
import { MODULE_MANIFEST_FIELD as MF, MODULE_DEPENDENCY_FIELD as DF, MODULE_MANIFEST_COL as COL, DEBUG_ARTIFACT_FIELD as DAF, DEBUG_ARTIFACT_MODE as DAM, DIGEST_PREFIX, DIGEST_HEX_LENGTH, MODULE_MANIFEST_ERROR_MSG as ERR } from './module-manifest-constants.js';

/**
 * Validate a SHA-256 digest string format.
 * Must be "sha256:" followed by exactly 64 hex characters.
 * @param {string} digest - Digest string to validate.
 * @return {boolean} True if valid format.
 */
function isValidDigest(digest) {
  if (stryMutAct_9fa48("161677")) {
    {}
  } else {
    stryCov_9fa48("161677");
    if (stryMutAct_9fa48("161680") ? typeof digest === TYPEOF.STRING : stryMutAct_9fa48("161679") ? false : stryMutAct_9fa48("161678") ? true : (stryCov_9fa48("161678", "161679", "161680"), typeof digest !== TYPEOF.STRING)) return stryMutAct_9fa48("161681") ? true : (stryCov_9fa48("161681"), false);
    if (stryMutAct_9fa48("161684") ? false : stryMutAct_9fa48("161683") ? true : stryMutAct_9fa48("161682") ? digest.startsWith(DIGEST_PREFIX) : (stryCov_9fa48("161682", "161683", "161684"), !(stryMutAct_9fa48("161685") ? digest.endsWith(DIGEST_PREFIX) : (stryCov_9fa48("161685"), digest.startsWith(DIGEST_PREFIX))))) return stryMutAct_9fa48("161686") ? true : (stryCov_9fa48("161686"), false);
    const hex = stryMutAct_9fa48("161687") ? digest : (stryCov_9fa48("161687"), digest.slice(DIGEST_PREFIX.length));
    if (stryMutAct_9fa48("161690") ? hex.length === DIGEST_HEX_LENGTH : stryMutAct_9fa48("161689") ? false : stryMutAct_9fa48("161688") ? true : (stryCov_9fa48("161688", "161689", "161690"), hex.length !== DIGEST_HEX_LENGTH)) return stryMutAct_9fa48("161691") ? true : (stryCov_9fa48("161691"), false);
    return (stryMutAct_9fa48("161695") ? /^[^0-9a-f]+$/ : stryMutAct_9fa48("161694") ? /^[0-9a-f]$/ : stryMutAct_9fa48("161693") ? /^[0-9a-f]+/ : stryMutAct_9fa48("161692") ? /[0-9a-f]+$/ : (stryCov_9fa48("161692", "161693", "161694", "161695"), /^[0-9a-f]+$/)).test(hex);
  }
}

/**
 * Validate a module manifest object.
 * Uses composite namespace:name@version identity.
 * @param {Object} manifest - Module manifest to validate.
 * @return {{valid: boolean, errors: string[]}} Validation result.
 */
function validateModuleManifest(manifest) {
  if (stryMutAct_9fa48("161696")) {
    {}
  } else {
    stryCov_9fa48("161696");
    const errors = stryMutAct_9fa48("161697") ? ["Stryker was here"] : (stryCov_9fa48("161697"), []);
    if (stryMutAct_9fa48("161700") ? false : stryMutAct_9fa48("161699") ? true : stryMutAct_9fa48("161698") ? manifest[MF.NAMESPACE] : (stryCov_9fa48("161698", "161699", "161700"), !manifest[MF.NAMESPACE])) {
      if (stryMutAct_9fa48("161701")) {
        {}
      } else {
        stryCov_9fa48("161701");
        errors.push(ERR.NAMESPACE_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("161704") ? false : stryMutAct_9fa48("161703") ? true : stryMutAct_9fa48("161702") ? manifest[MF.NAME] : (stryCov_9fa48("161702", "161703", "161704"), !manifest[MF.NAME])) {
      if (stryMutAct_9fa48("161705")) {
        {}
      } else {
        stryCov_9fa48("161705");
        errors.push(ERR.NAME_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("161708") ? false : stryMutAct_9fa48("161707") ? true : stryMutAct_9fa48("161706") ? manifest[MF.VERSION] : (stryCov_9fa48("161706", "161707", "161708"), !manifest[MF.VERSION])) {
      if (stryMutAct_9fa48("161709")) {
        {}
      } else {
        stryCov_9fa48("161709");
        errors.push(ERR.VERSION_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("161712") ? manifest[MF.NAMESPACE] && manifest[MF.NAME] || manifest[MF.VERSION] : stryMutAct_9fa48("161711") ? false : stryMutAct_9fa48("161710") ? true : (stryCov_9fa48("161710", "161711", "161712"), (stryMutAct_9fa48("161714") ? manifest[MF.NAMESPACE] || manifest[MF.NAME] : stryMutAct_9fa48("161713") ? true : (stryCov_9fa48("161713", "161714"), manifest[MF.NAMESPACE] && manifest[MF.NAME])) && manifest[MF.VERSION])) {
      if (stryMutAct_9fa48("161715")) {
        {}
      } else {
        stryCov_9fa48("161715");
        const pkgId = manifest[MF.NAMESPACE] + (stryMutAct_9fa48("161716") ? "" : (stryCov_9fa48("161716"), ':')) + manifest[MF.NAME] + (stryMutAct_9fa48("161717") ? "" : (stryCov_9fa48("161717"), '@')) + manifest[MF.VERSION];
        if (stryMutAct_9fa48("161720") ? false : stryMutAct_9fa48("161719") ? true : stryMutAct_9fa48("161718") ? PACKAGE_ID_PATTERN.test(pkgId) : (stryCov_9fa48("161718", "161719", "161720"), !PACKAGE_ID_PATTERN.test(pkgId))) {
          if (stryMutAct_9fa48("161721")) {
            {}
          } else {
            stryCov_9fa48("161721");
            if (stryMutAct_9fa48("161724") ? false : stryMutAct_9fa48("161723") ? true : stryMutAct_9fa48("161722") ? /^[a-z][a-z0-9-]{0,127}$/.test(manifest[MF.NAMESPACE]) : (stryCov_9fa48("161722", "161723", "161724"), !(stryMutAct_9fa48("161729") ? /^[a-z][^a-z0-9-]{0,127}$/ : stryMutAct_9fa48("161728") ? /^[a-z][a-z0-9-]$/ : stryMutAct_9fa48("161727") ? /^[^a-z][a-z0-9-]{0,127}$/ : stryMutAct_9fa48("161726") ? /^[a-z][a-z0-9-]{0,127}/ : stryMutAct_9fa48("161725") ? /[a-z][a-z0-9-]{0,127}$/ : (stryCov_9fa48("161725", "161726", "161727", "161728", "161729"), /^[a-z][a-z0-9-]{0,127}$/)).test(manifest[MF.NAMESPACE]))) {
              if (stryMutAct_9fa48("161730")) {
                {}
              } else {
                stryCov_9fa48("161730");
                errors.push(ERR.NAMESPACE_INVALID_FORMAT);
              }
            }
            if (stryMutAct_9fa48("161733") ? false : stryMutAct_9fa48("161732") ? true : stryMutAct_9fa48("161731") ? /^[a-z][a-z0-9-]{0,127}$/.test(manifest[MF.NAME]) : (stryCov_9fa48("161731", "161732", "161733"), !(stryMutAct_9fa48("161738") ? /^[a-z][^a-z0-9-]{0,127}$/ : stryMutAct_9fa48("161737") ? /^[a-z][a-z0-9-]$/ : stryMutAct_9fa48("161736") ? /^[^a-z][a-z0-9-]{0,127}$/ : stryMutAct_9fa48("161735") ? /^[a-z][a-z0-9-]{0,127}/ : stryMutAct_9fa48("161734") ? /[a-z][a-z0-9-]{0,127}$/ : (stryCov_9fa48("161734", "161735", "161736", "161737", "161738"), /^[a-z][a-z0-9-]{0,127}$/)).test(manifest[MF.NAME]))) {
              if (stryMutAct_9fa48("161739")) {
                {}
              } else {
                stryCov_9fa48("161739");
                errors.push(ERR.NAME_INVALID_FORMAT);
              }
            }
          }
        }
      }
    }
    if (stryMutAct_9fa48("161742") ? false : stryMutAct_9fa48("161741") ? true : stryMutAct_9fa48("161740") ? manifest[MF.DIGEST] : (stryCov_9fa48("161740", "161741", "161742"), !manifest[MF.DIGEST])) {
      if (stryMutAct_9fa48("161743")) {
        {}
      } else {
        stryCov_9fa48("161743");
        errors.push(ERR.DIGEST_REQUIRED);
      }
    } else if (stryMutAct_9fa48("161746") ? false : stryMutAct_9fa48("161745") ? true : stryMutAct_9fa48("161744") ? isValidDigest(manifest[MF.DIGEST]) : (stryCov_9fa48("161744", "161745", "161746"), !isValidDigest(manifest[MF.DIGEST]))) {
      if (stryMutAct_9fa48("161747")) {
        {}
      } else {
        stryCov_9fa48("161747");
        errors.push(ERR.DIGEST_INVALID_FORMAT);
      }
    }
    const exports_ = manifest[MF.EXPORTS];
    if (stryMutAct_9fa48("161750") ? (!exports_ || !Array.isArray(exports_)) && exports_.length === NUM.ZERO : stryMutAct_9fa48("161749") ? false : stryMutAct_9fa48("161748") ? true : (stryCov_9fa48("161748", "161749", "161750"), (stryMutAct_9fa48("161752") ? !exports_ && !Array.isArray(exports_) : stryMutAct_9fa48("161751") ? false : (stryCov_9fa48("161751", "161752"), (stryMutAct_9fa48("161753") ? exports_ : (stryCov_9fa48("161753"), !exports_)) || (stryMutAct_9fa48("161754") ? Array.isArray(exports_) : (stryCov_9fa48("161754"), !Array.isArray(exports_))))) || (stryMutAct_9fa48("161756") ? exports_.length !== NUM.ZERO : stryMutAct_9fa48("161755") ? false : (stryCov_9fa48("161755", "161756"), exports_.length === NUM.ZERO)))) {
      if (stryMutAct_9fa48("161757")) {
        {}
      } else {
        stryCov_9fa48("161757");
        errors.push(ERR.EXPORTS_REQUIRED);
      }
    } else if (stryMutAct_9fa48("161760") ? false : stryMutAct_9fa48("161759") ? true : stryMutAct_9fa48("161758") ? exports_.every(e => typeof e === TYPEOF.STRING) : (stryCov_9fa48("161758", "161759", "161760"), !(stryMutAct_9fa48("161761") ? exports_.some(e => typeof e === TYPEOF.STRING) : (stryCov_9fa48("161761"), exports_.every(stryMutAct_9fa48("161762") ? () => undefined : (stryCov_9fa48("161762"), e => stryMutAct_9fa48("161765") ? typeof e !== TYPEOF.STRING : stryMutAct_9fa48("161764") ? false : stryMutAct_9fa48("161763") ? true : (stryCov_9fa48("161763", "161764", "161765"), typeof e === TYPEOF.STRING))))))) {
      if (stryMutAct_9fa48("161766")) {
        {}
      } else {
        stryCov_9fa48("161766");
        errors.push(ERR.EXPORTS_NOT_ARRAY);
      }
    }
    if (stryMutAct_9fa48("161769") ? false : stryMutAct_9fa48("161768") ? true : stryMutAct_9fa48("161767") ? manifest[MF.RUN_EXPORT] : (stryCov_9fa48("161767", "161768", "161769"), !manifest[MF.RUN_EXPORT])) {
      if (stryMutAct_9fa48("161770")) {
        {}
      } else {
        stryCov_9fa48("161770");
        errors.push(ERR.RUN_EXPORT_REQUIRED);
      }
    } else if (stryMutAct_9fa48("161773") ? Array.isArray(exports_) || !exports_.includes(manifest[MF.RUN_EXPORT]) : stryMutAct_9fa48("161772") ? false : stryMutAct_9fa48("161771") ? true : (stryCov_9fa48("161771", "161772", "161773"), Array.isArray(exports_) && (stryMutAct_9fa48("161774") ? exports_.includes(manifest[MF.RUN_EXPORT]) : (stryCov_9fa48("161774"), !exports_.includes(manifest[MF.RUN_EXPORT]))))) {
      if (stryMutAct_9fa48("161775")) {
        {}
      } else {
        stryCov_9fa48("161775");
        errors.push(ERR.RUN_EXPORT_NOT_IN_EXPORTS);
      }
    }
    validateDependencies(manifest[MF.DEPENDENCIES], errors);
    validateCapabilities(manifest[MF.CAPABILITIES], errors);
    validateDebugArtifact(manifest, errors);
    return stryMutAct_9fa48("161776") ? {} : (stryCov_9fa48("161776"), {
      valid: stryMutAct_9fa48("161779") ? errors.length !== NUM.ZERO : stryMutAct_9fa48("161778") ? false : stryMutAct_9fa48("161777") ? true : (stryCov_9fa48("161777", "161778", "161779"), errors.length === NUM.ZERO),
      errors
    });
  }
}

/**
 * Validate the dependencies array of a manifest.
 * @param {Array|undefined} deps - Dependencies array.
 * @param {string[]} errors - Errors array to append to.
 */
function validateDependencies(deps, errors) {
  if (stryMutAct_9fa48("161780")) {
    {}
  } else {
    stryCov_9fa48("161780");
    if (stryMutAct_9fa48("161783") ? deps === undefined && deps === null : stryMutAct_9fa48("161782") ? false : stryMutAct_9fa48("161781") ? true : (stryCov_9fa48("161781", "161782", "161783"), (stryMutAct_9fa48("161785") ? deps !== undefined : stryMutAct_9fa48("161784") ? false : (stryCov_9fa48("161784", "161785"), deps === undefined)) || (stryMutAct_9fa48("161787") ? deps !== null : stryMutAct_9fa48("161786") ? false : (stryCov_9fa48("161786", "161787"), deps === null)))) return;
    if (stryMutAct_9fa48("161790") ? false : stryMutAct_9fa48("161789") ? true : stryMutAct_9fa48("161788") ? Array.isArray(deps) : (stryCov_9fa48("161788", "161789", "161790"), !Array.isArray(deps))) {
      if (stryMutAct_9fa48("161791")) {
        {}
      } else {
        stryCov_9fa48("161791");
        errors.push(ERR.DEPENDENCIES_NOT_ARRAY);
        return;
      }
    }
    for (const dep of deps) {
      if (stryMutAct_9fa48("161792")) {
        {}
      } else {
        stryCov_9fa48("161792");
        if (stryMutAct_9fa48("161795") ? false : stryMutAct_9fa48("161794") ? true : stryMutAct_9fa48("161793") ? dep[DF.MODULE_ID] : (stryCov_9fa48("161793", "161794", "161795"), !dep[DF.MODULE_ID])) {
          if (stryMutAct_9fa48("161796")) {
            {}
          } else {
            stryCov_9fa48("161796");
            errors.push(ERR.DEPENDENCY_MODULE_ID_REQUIRED);
          }
        }
        if (stryMutAct_9fa48("161799") ? false : stryMutAct_9fa48("161798") ? true : stryMutAct_9fa48("161797") ? dep[DF.DIGEST] : (stryCov_9fa48("161797", "161798", "161799"), !dep[DF.DIGEST])) {
          if (stryMutAct_9fa48("161800")) {
            {}
          } else {
            stryCov_9fa48("161800");
            errors.push(ERR.DEPENDENCY_DIGEST_REQUIRED);
          }
        } else if (stryMutAct_9fa48("161803") ? false : stryMutAct_9fa48("161802") ? true : stryMutAct_9fa48("161801") ? isValidDigest(dep[DF.DIGEST]) : (stryCov_9fa48("161801", "161802", "161803"), !isValidDigest(dep[DF.DIGEST]))) {
          if (stryMutAct_9fa48("161804")) {
            {}
          } else {
            stryCov_9fa48("161804");
            errors.push(ERR.DEPENDENCY_DIGEST_INVALID_FORMAT);
          }
        }
      }
    }
  }
}

/**
 * Validate the capabilities array of a manifest.
 * @param {Array|undefined} caps - Capabilities array.
 * @param {string[]} errors - Errors array to append to.
 */
function validateCapabilities(caps, errors) {
  if (stryMutAct_9fa48("161805")) {
    {}
  } else {
    stryCov_9fa48("161805");
    if (stryMutAct_9fa48("161808") ? caps === undefined && caps === null : stryMutAct_9fa48("161807") ? false : stryMutAct_9fa48("161806") ? true : (stryCov_9fa48("161806", "161807", "161808"), (stryMutAct_9fa48("161810") ? caps !== undefined : stryMutAct_9fa48("161809") ? false : (stryCov_9fa48("161809", "161810"), caps === undefined)) || (stryMutAct_9fa48("161812") ? caps !== null : stryMutAct_9fa48("161811") ? false : (stryCov_9fa48("161811", "161812"), caps === null)))) return;
    if (stryMutAct_9fa48("161815") ? false : stryMutAct_9fa48("161814") ? true : stryMutAct_9fa48("161813") ? Array.isArray(caps) : (stryCov_9fa48("161813", "161814", "161815"), !Array.isArray(caps))) {
      if (stryMutAct_9fa48("161816")) {
        {}
      } else {
        stryCov_9fa48("161816");
        errors.push(ERR.CAPABILITIES_NOT_ARRAY);
        return;
      }
    }
    if (stryMutAct_9fa48("161819") ? false : stryMutAct_9fa48("161818") ? true : stryMutAct_9fa48("161817") ? caps.every(c => typeof c === TYPEOF.STRING) : (stryCov_9fa48("161817", "161818", "161819"), !(stryMutAct_9fa48("161820") ? caps.some(c => typeof c === TYPEOF.STRING) : (stryCov_9fa48("161820"), caps.every(stryMutAct_9fa48("161821") ? () => undefined : (stryCov_9fa48("161821"), c => stryMutAct_9fa48("161824") ? typeof c !== TYPEOF.STRING : stryMutAct_9fa48("161823") ? false : stryMutAct_9fa48("161822") ? true : (stryCov_9fa48("161822", "161823", "161824"), typeof c === TYPEOF.STRING))))))) {
      if (stryMutAct_9fa48("161825")) {
        {}
      } else {
        stryCov_9fa48("161825");
        errors.push(ERR.CAPABILITIES_NOT_ARRAY);
      }
    }
  }
}

/**
 * Validate debug artifact declaration shape when provided.
 *
 * Supported declarations:
 * - {mode: 'embedded', embeddedSection?: string}
 * - {mode: 'sidecar', sidecarUri: string}
 *
 * For sidecar mode, a legacy artifactPointer fallback is accepted.
 *
 * @param {Object} manifest - Module manifest object.
 * @param {string[]} errors - Errors array to append to.
 */
function validateDebugArtifact(manifest, errors) {
  if (stryMutAct_9fa48("161826")) {
    {}
  } else {
    stryCov_9fa48("161826");
    const debugArtifact = manifest[MF.DEBUG_ARTIFACT];
    if (stryMutAct_9fa48("161829") ? debugArtifact === undefined && debugArtifact === null : stryMutAct_9fa48("161828") ? false : stryMutAct_9fa48("161827") ? true : (stryCov_9fa48("161827", "161828", "161829"), (stryMutAct_9fa48("161831") ? debugArtifact !== undefined : stryMutAct_9fa48("161830") ? false : (stryCov_9fa48("161830", "161831"), debugArtifact === undefined)) || (stryMutAct_9fa48("161833") ? debugArtifact !== null : stryMutAct_9fa48("161832") ? false : (stryCov_9fa48("161832", "161833"), debugArtifact === null)))) {
      if (stryMutAct_9fa48("161834")) {
        {}
      } else {
        stryCov_9fa48("161834");
        return;
      }
    }
    if (stryMutAct_9fa48("161837") ? typeof debugArtifact !== TYPEOF.OBJECT && Array.isArray(debugArtifact) : stryMutAct_9fa48("161836") ? false : stryMutAct_9fa48("161835") ? true : (stryCov_9fa48("161835", "161836", "161837"), (stryMutAct_9fa48("161839") ? typeof debugArtifact === TYPEOF.OBJECT : stryMutAct_9fa48("161838") ? false : (stryCov_9fa48("161838", "161839"), typeof debugArtifact !== TYPEOF.OBJECT)) || Array.isArray(debugArtifact))) {
      if (stryMutAct_9fa48("161840")) {
        {}
      } else {
        stryCov_9fa48("161840");
        errors.push(ERR.DEBUG_ARTIFACT_INVALID);
        return;
      }
    }
    const mode = debugArtifact[DAF.MODE];
    if (stryMutAct_9fa48("161843") ? mode !== DAM.EMBEDDED || mode !== DAM.SIDECAR : stryMutAct_9fa48("161842") ? false : stryMutAct_9fa48("161841") ? true : (stryCov_9fa48("161841", "161842", "161843"), (stryMutAct_9fa48("161845") ? mode === DAM.EMBEDDED : stryMutAct_9fa48("161844") ? true : (stryCov_9fa48("161844", "161845"), mode !== DAM.EMBEDDED)) && (stryMutAct_9fa48("161847") ? mode === DAM.SIDECAR : stryMutAct_9fa48("161846") ? true : (stryCov_9fa48("161846", "161847"), mode !== DAM.SIDECAR)))) {
      if (stryMutAct_9fa48("161848")) {
        {}
      } else {
        stryCov_9fa48("161848");
        errors.push(ERR.DEBUG_ARTIFACT_MODE_INVALID);
        return;
      }
    }
    if (stryMutAct_9fa48("161851") ? mode !== DAM.SIDECAR : stryMutAct_9fa48("161850") ? false : stryMutAct_9fa48("161849") ? true : (stryCov_9fa48("161849", "161850", "161851"), mode === DAM.SIDECAR)) {
      if (stryMutAct_9fa48("161852")) {
        {}
      } else {
        stryCov_9fa48("161852");
        const sidecarUri = stryMutAct_9fa48("161855") ? (debugArtifact[DAF.SIDECAR_URI] || manifest[MF.ARTIFACT_POINTER]) && null : stryMutAct_9fa48("161854") ? false : stryMutAct_9fa48("161853") ? true : (stryCov_9fa48("161853", "161854", "161855"), (stryMutAct_9fa48("161857") ? debugArtifact[DAF.SIDECAR_URI] && manifest[MF.ARTIFACT_POINTER] : stryMutAct_9fa48("161856") ? false : (stryCov_9fa48("161856", "161857"), debugArtifact[DAF.SIDECAR_URI] || manifest[MF.ARTIFACT_POINTER])) || null);
        if (stryMutAct_9fa48("161860") ? typeof sidecarUri !== TYPEOF.STRING && sidecarUri.trim().length === NUM.ZERO : stryMutAct_9fa48("161859") ? false : stryMutAct_9fa48("161858") ? true : (stryCov_9fa48("161858", "161859", "161860"), (stryMutAct_9fa48("161862") ? typeof sidecarUri === TYPEOF.STRING : stryMutAct_9fa48("161861") ? false : (stryCov_9fa48("161861", "161862"), typeof sidecarUri !== TYPEOF.STRING)) || (stryMutAct_9fa48("161864") ? sidecarUri.trim().length !== NUM.ZERO : stryMutAct_9fa48("161863") ? false : (stryCov_9fa48("161863", "161864"), (stryMutAct_9fa48("161865") ? sidecarUri.length : (stryCov_9fa48("161865"), sidecarUri.trim().length)) === NUM.ZERO)))) {
          if (stryMutAct_9fa48("161866")) {
            {}
          } else {
            stryCov_9fa48("161866");
            errors.push(ERR.DEBUG_ARTIFACT_SIDECAR_URI_REQUIRED);
          }
        }
      }
    }
    const embeddedSection = debugArtifact[DAF.EMBEDDED_SECTION];
    if (stryMutAct_9fa48("161869") ? embeddedSection !== undefined || typeof embeddedSection !== TYPEOF.STRING || embeddedSection.trim().length === NUM.ZERO : stryMutAct_9fa48("161868") ? false : stryMutAct_9fa48("161867") ? true : (stryCov_9fa48("161867", "161868", "161869"), (stryMutAct_9fa48("161871") ? embeddedSection === undefined : stryMutAct_9fa48("161870") ? true : (stryCov_9fa48("161870", "161871"), embeddedSection !== undefined)) && (stryMutAct_9fa48("161873") ? typeof embeddedSection !== TYPEOF.STRING && embeddedSection.trim().length === NUM.ZERO : stryMutAct_9fa48("161872") ? true : (stryCov_9fa48("161872", "161873"), (stryMutAct_9fa48("161875") ? typeof embeddedSection === TYPEOF.STRING : stryMutAct_9fa48("161874") ? false : (stryCov_9fa48("161874", "161875"), typeof embeddedSection !== TYPEOF.STRING)) || (stryMutAct_9fa48("161877") ? embeddedSection.trim().length !== NUM.ZERO : stryMutAct_9fa48("161876") ? false : (stryCov_9fa48("161876", "161877"), (stryMutAct_9fa48("161878") ? embeddedSection.length : (stryCov_9fa48("161878"), embeddedSection.trim().length)) === NUM.ZERO)))))) {
      if (stryMutAct_9fa48("161879")) {
        {}
      } else {
        stryCov_9fa48("161879");
        errors.push(ERR.DEBUG_ARTIFACT_EMBEDDED_SECTION_INVALID);
      }
    }
  }
}

/**
 * Serialize a module manifest object to a table row.
 * Uses composite key (namespace, name, version).
 * Arrays (exports, dependencies, capabilities) are JSON-encoded.
 * @param {Object} manifest - Module manifest object.
 * @return {Object} Table row with snake_case keys.
 */
function serializeModuleManifest(manifest) {
  if (stryMutAct_9fa48("161880")) {
    {}
  } else {
    stryCov_9fa48("161880");
    const now = Date.now();
    return stryMutAct_9fa48("161881") ? {} : (stryCov_9fa48("161881"), {
      [COL.NAMESPACE]: manifest[MF.NAMESPACE],
      [COL.NAME]: manifest[MF.NAME],
      [COL.VERSION]: manifest[MF.VERSION],
      [COL.DIGEST]: manifest[MF.DIGEST],
      [COL.RUN_EXPORT]: manifest[MF.RUN_EXPORT],
      [COL.EXPORTS]: JSON.stringify(stryMutAct_9fa48("161884") ? manifest[MF.EXPORTS] && [] : stryMutAct_9fa48("161883") ? false : stryMutAct_9fa48("161882") ? true : (stryCov_9fa48("161882", "161883", "161884"), manifest[MF.EXPORTS] || (stryMutAct_9fa48("161885") ? ["Stryker was here"] : (stryCov_9fa48("161885"), [])))),
      [COL.DEPENDENCIES]: JSON.stringify(stryMutAct_9fa48("161888") ? manifest[MF.DEPENDENCIES] && [] : stryMutAct_9fa48("161887") ? false : stryMutAct_9fa48("161886") ? true : (stryCov_9fa48("161886", "161887", "161888"), manifest[MF.DEPENDENCIES] || (stryMutAct_9fa48("161889") ? ["Stryker was here"] : (stryCov_9fa48("161889"), [])))),
      [COL.CAPABILITIES]: JSON.stringify(stryMutAct_9fa48("161892") ? manifest[MF.CAPABILITIES] && [] : stryMutAct_9fa48("161891") ? false : stryMutAct_9fa48("161890") ? true : (stryCov_9fa48("161890", "161891", "161892"), manifest[MF.CAPABILITIES] || (stryMutAct_9fa48("161893") ? ["Stryker was here"] : (stryCov_9fa48("161893"), [])))),
      [COL.SOURCE_REFERENCE]: stryMutAct_9fa48("161894") ? manifest[MF.SOURCE_REFERENCE] && null : (stryCov_9fa48("161894"), manifest[MF.SOURCE_REFERENCE] ?? null),
      [COL.ARTIFACT_POINTER]: stryMutAct_9fa48("161895") ? manifest[MF.ARTIFACT_POINTER] && null : (stryCov_9fa48("161895"), manifest[MF.ARTIFACT_POINTER] ?? null),
      [COL.CREATED_AT]: stryMutAct_9fa48("161896") ? manifest.createdAt && now : (stryCov_9fa48("161896"), manifest.createdAt ?? now)
    });
  }
}

/**
 * Deserialize a table row to a module manifest object.
 * JSON-encoded arrays are parsed back to arrays.
 * @param {Object} row - Table row with snake_case keys.
 * @return {Object} Module manifest object with camelCase keys.
 */
function deserializeModuleManifest(row) {
  if (stryMutAct_9fa48("161897")) {
    {}
  } else {
    stryCov_9fa48("161897");
    return stryMutAct_9fa48("161898") ? {} : (stryCov_9fa48("161898"), {
      [MF.NAMESPACE]: row[COL.NAMESPACE],
      [MF.NAME]: row[COL.NAME],
      [MF.VERSION]: row[COL.VERSION],
      [MF.DIGEST]: row[COL.DIGEST],
      [MF.RUN_EXPORT]: row[COL.RUN_EXPORT],
      [MF.EXPORTS]: JSON.parse(stryMutAct_9fa48("161901") ? row[COL.EXPORTS] && STRING.EMPTY_JSON_ARRAY : stryMutAct_9fa48("161900") ? false : stryMutAct_9fa48("161899") ? true : (stryCov_9fa48("161899", "161900", "161901"), row[COL.EXPORTS] || STRING.EMPTY_JSON_ARRAY)),
      [MF.DEPENDENCIES]: JSON.parse(stryMutAct_9fa48("161904") ? row[COL.DEPENDENCIES] && STRING.EMPTY_JSON_ARRAY : stryMutAct_9fa48("161903") ? false : stryMutAct_9fa48("161902") ? true : (stryCov_9fa48("161902", "161903", "161904"), row[COL.DEPENDENCIES] || STRING.EMPTY_JSON_ARRAY)),
      [MF.CAPABILITIES]: JSON.parse(stryMutAct_9fa48("161907") ? row[COL.CAPABILITIES] && STRING.EMPTY_JSON_ARRAY : stryMutAct_9fa48("161906") ? false : stryMutAct_9fa48("161905") ? true : (stryCov_9fa48("161905", "161906", "161907"), row[COL.CAPABILITIES] || STRING.EMPTY_JSON_ARRAY)),
      [MF.SOURCE_REFERENCE]: stryMutAct_9fa48("161908") ? row[COL.SOURCE_REFERENCE] && null : (stryCov_9fa48("161908"), row[COL.SOURCE_REFERENCE] ?? null),
      [MF.ARTIFACT_POINTER]: stryMutAct_9fa48("161909") ? row[COL.ARTIFACT_POINTER] && null : (stryCov_9fa48("161909"), row[COL.ARTIFACT_POINTER] ?? null),
      createdAt: stryMutAct_9fa48("161910") ? row[COL.CREATED_AT] && NUM.ZERO : (stryCov_9fa48("161910"), row[COL.CREATED_AT] ?? NUM.ZERO)
    });
  }
}
export { isValidDigest, validateModuleManifest, serializeModuleManifest, deserializeModuleManifest };