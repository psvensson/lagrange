/**
 * OCI container descriptor model and digest-only validation.
 *
 * Defines the descriptor schema for oci_container runtime kind
 * and enforces immutable digest references for activation.
 * Reuses existing OCI reference validation from
 * src/wasm-service/oci-reference.js — no duplicate parsing.
 *
 * Requirements: 4.1, 4.2, 9.3
 *
 * @module runtime/oci-container-descriptor
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
import { validateDigestPin } from '../wasm-service/oci-reference.js';

// --- OCI descriptor field names ---

const OCI_DESCRIPTOR_FIELD = Object.freeze(stryMutAct_9fa48("146740") ? {} : (stryCov_9fa48("146740"), {
  IMAGE_REF: stryMutAct_9fa48("146741") ? "" : (stryCov_9fa48("146741"), 'imageRef'),
  DIGEST: stryMutAct_9fa48("146742") ? "" : (stryCov_9fa48("146742"), 'digest'),
  REGISTRY: stryMutAct_9fa48("146743") ? "" : (stryCov_9fa48("146743"), 'registry'),
  REPOSITORY: stryMutAct_9fa48("146744") ? "" : (stryCov_9fa48("146744"), 'repository'),
  TAG: stryMutAct_9fa48("146745") ? "" : (stryCov_9fa48("146745"), 'tag')
}));

// --- OCI runtime config field names ---

const OCI_CONFIG_FIELD = Object.freeze(stryMutAct_9fa48("146746") ? {} : (stryCov_9fa48("146746"), {
  MEMORY_LIMIT_MB: stryMutAct_9fa48("146747") ? "" : (stryCov_9fa48("146747"), 'memoryLimitMb'),
  CPU_LIMIT: stryMutAct_9fa48("146748") ? "" : (stryCov_9fa48("146748"), 'cpuLimit'),
  NETWORK_POLICY: stryMutAct_9fa48("146749") ? "" : (stryCov_9fa48("146749"), 'networkPolicy'),
  ENV_VARS: stryMutAct_9fa48("146750") ? "" : (stryCov_9fa48("146750"), 'envVars'),
  HEALTH_CHECK_PATH: stryMutAct_9fa48("146751") ? "" : (stryCov_9fa48("146751"), 'healthCheckPath'),
  HEALTH_CHECK_INTERVAL_MS: stryMutAct_9fa48("146752") ? "" : (stryCov_9fa48("146752"), 'healthCheckIntervalMs')
}));

// --- OCI network policy values ---

const OCI_NETWORK_POLICY = Object.freeze(stryMutAct_9fa48("146753") ? {} : (stryCov_9fa48("146753"), {
  NONE: stryMutAct_9fa48("146754") ? "" : (stryCov_9fa48("146754"), 'none'),
  HOST: stryMutAct_9fa48("146755") ? "" : (stryCov_9fa48("146755"), 'host'),
  ISOLATED: stryMutAct_9fa48("146756") ? "" : (stryCov_9fa48("146756"), 'isolated')
}));

// --- Allowed network policy set ---

const ALLOWED_NETWORK_POLICIES = Object.freeze(new Set(Object.values(OCI_NETWORK_POLICY)));

// --- OCI descriptor error messages ---

const OCI_DESCRIPTOR_ERROR = Object.freeze(stryMutAct_9fa48("146757") ? {} : (stryCov_9fa48("146757"), {
  REF_REQUIRED: stryMutAct_9fa48("146758") ? "" : (stryCov_9fa48("146758"), 'runtime_ref is required for oci_container'),
  REF_NOT_STRING: stryMutAct_9fa48("146759") ? "" : (stryCov_9fa48("146759"), 'runtime_ref must be a string'),
  REF_EMPTY: stryMutAct_9fa48("146760") ? "" : (stryCov_9fa48("146760"), 'runtime_ref must not be empty'),
  DIGEST_REQUIRED: stryMutAct_9fa48("146761") ? "" : (stryCov_9fa48("146761"), 'oci_container requires immutable digest pin in runtime_ref'),
  DIGEST_INVALID: stryMutAct_9fa48("146762") ? "" : (stryCov_9fa48("146762"), 'runtime_ref digest is invalid'),
  CONFIG_NOT_STRING: stryMutAct_9fa48("146763") ? "" : (stryCov_9fa48("146763"), 'runtime_config must be a string when provided'),
  CONFIG_INVALID_JSON: stryMutAct_9fa48("146764") ? "" : (stryCov_9fa48("146764"), 'runtime_config must be valid JSON'),
  MEMORY_LIMIT_INVALID: stryMutAct_9fa48("146765") ? "" : (stryCov_9fa48("146765"), 'memoryLimitMb must be a positive number'),
  CPU_LIMIT_INVALID: stryMutAct_9fa48("146766") ? "" : (stryCov_9fa48("146766"), 'cpuLimit must be a positive number'),
  NETWORK_POLICY_INVALID: stryMutAct_9fa48("146767") ? "" : (stryCov_9fa48("146767"), 'networkPolicy must be one of: none, host, isolated'),
  HEALTH_CHECK_INTERVAL_INVALID: stryMutAct_9fa48("146768") ? "" : (stryCov_9fa48("146768"), 'healthCheckIntervalMs must be a positive integer'),
  FEATURE_GATE_DISABLED: stryMutAct_9fa48("146769") ? "" : (stryCov_9fa48("146769"), 'oci_container runtime is feature-gated and currently disabled')
}));

// --- Feature gate constants ---

const OCI_FEATURE_GATE = Object.freeze(stryMutAct_9fa48("146770") ? {} : (stryCov_9fa48("146770"), {
  KEY: stryMutAct_9fa48("146771") ? "" : (stryCov_9fa48("146771"), 'oci_container_enabled'),
  DEFAULT: stryMutAct_9fa48("146772") ? true : (stryCov_9fa48("146772"), false)
}));

// --- Validation functions ---

/**
 * Validate that runtime_ref contains an immutable digest pin.
 * Delegates to validateDigestPin from oci-reference.js.
 *
 * @param {*} ref - The runtime_ref value to validate.
 * @return {{valid: boolean, errors?: string[], parsed?: Object}}
 */
function validateOciDescriptorRef(ref) {
  if (stryMutAct_9fa48("146773")) {
    {}
  } else {
    stryCov_9fa48("146773");
    if (stryMutAct_9fa48("146776") ? ref === undefined && ref === null : stryMutAct_9fa48("146775") ? false : stryMutAct_9fa48("146774") ? true : (stryCov_9fa48("146774", "146775", "146776"), (stryMutAct_9fa48("146778") ? ref !== undefined : stryMutAct_9fa48("146777") ? false : (stryCov_9fa48("146777", "146778"), ref === undefined)) || (stryMutAct_9fa48("146780") ? ref !== null : stryMutAct_9fa48("146779") ? false : (stryCov_9fa48("146779", "146780"), ref === null)))) {
      if (stryMutAct_9fa48("146781")) {
        {}
      } else {
        stryCov_9fa48("146781");
        return stryMutAct_9fa48("146782") ? {} : (stryCov_9fa48("146782"), {
          valid: stryMutAct_9fa48("146783") ? true : (stryCov_9fa48("146783"), false),
          errors: stryMutAct_9fa48("146784") ? [] : (stryCov_9fa48("146784"), [OCI_DESCRIPTOR_ERROR.REF_REQUIRED])
        });
      }
    }
    if (stryMutAct_9fa48("146787") ? typeof ref === TYPEOF.STRING : stryMutAct_9fa48("146786") ? false : stryMutAct_9fa48("146785") ? true : (stryCov_9fa48("146785", "146786", "146787"), typeof ref !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("146788")) {
        {}
      } else {
        stryCov_9fa48("146788");
        return stryMutAct_9fa48("146789") ? {} : (stryCov_9fa48("146789"), {
          valid: stryMutAct_9fa48("146790") ? true : (stryCov_9fa48("146790"), false),
          errors: stryMutAct_9fa48("146791") ? [] : (stryCov_9fa48("146791"), [OCI_DESCRIPTOR_ERROR.REF_NOT_STRING])
        });
      }
    }
    if (stryMutAct_9fa48("146794") ? ref.trim().length !== 0 : stryMutAct_9fa48("146793") ? false : stryMutAct_9fa48("146792") ? true : (stryCov_9fa48("146792", "146793", "146794"), (stryMutAct_9fa48("146795") ? ref.length : (stryCov_9fa48("146795"), ref.trim().length)) === 0)) {
      if (stryMutAct_9fa48("146796")) {
        {}
      } else {
        stryCov_9fa48("146796");
        return stryMutAct_9fa48("146797") ? {} : (stryCov_9fa48("146797"), {
          valid: stryMutAct_9fa48("146798") ? true : (stryCov_9fa48("146798"), false),
          errors: stryMutAct_9fa48("146799") ? [] : (stryCov_9fa48("146799"), [OCI_DESCRIPTOR_ERROR.REF_EMPTY])
        });
      }
    }
    const pinResult = validateDigestPin(ref);
    if (stryMutAct_9fa48("146802") ? false : stryMutAct_9fa48("146801") ? true : stryMutAct_9fa48("146800") ? pinResult.valid : (stryCov_9fa48("146800", "146801", "146802"), !pinResult.valid)) {
      if (stryMutAct_9fa48("146803")) {
        {}
      } else {
        stryCov_9fa48("146803");
        const errors = pinResult.errors.map(e => {
          if (stryMutAct_9fa48("146804")) {
            {}
          } else {
            stryCov_9fa48("146804");
            if (stryMutAct_9fa48("146806") ? false : stryMutAct_9fa48("146805") ? true : (stryCov_9fa48("146805", "146806"), e.includes(stryMutAct_9fa48("146807") ? "" : (stryCov_9fa48("146807"), 'digest pin')))) {
              if (stryMutAct_9fa48("146808")) {
                {}
              } else {
                stryCov_9fa48("146808");
                return OCI_DESCRIPTOR_ERROR.DIGEST_REQUIRED;
              }
            }
            return OCI_DESCRIPTOR_ERROR.DIGEST_INVALID;
          }
        });
        const unique = stryMutAct_9fa48("146809") ? [] : (stryCov_9fa48("146809"), [...new Set(errors)]);
        return stryMutAct_9fa48("146810") ? {} : (stryCov_9fa48("146810"), {
          valid: stryMutAct_9fa48("146811") ? true : (stryCov_9fa48("146811"), false),
          errors: unique
        });
      }
    }
    return stryMutAct_9fa48("146812") ? {} : (stryCov_9fa48("146812"), {
      valid: stryMutAct_9fa48("146813") ? false : (stryCov_9fa48("146813"), true),
      parsed: stryMutAct_9fa48("146814") ? {} : (stryCov_9fa48("146814"), {
        digest: pinResult.digest
      })
    });
  }
}

/**
 * Validate optional runtime_config JSON string for OCI containers.
 *
 * @param {*} configStr - The runtime_config value (string or null).
 * @return {{valid: boolean, errors?: string[], config?: Object}}
 */
function validateOciRuntimeConfig(configStr) {
  if (stryMutAct_9fa48("146815")) {
    {}
  } else {
    stryCov_9fa48("146815");
    if (stryMutAct_9fa48("146818") ? configStr === undefined && configStr === null : stryMutAct_9fa48("146817") ? false : stryMutAct_9fa48("146816") ? true : (stryCov_9fa48("146816", "146817", "146818"), (stryMutAct_9fa48("146820") ? configStr !== undefined : stryMutAct_9fa48("146819") ? false : (stryCov_9fa48("146819", "146820"), configStr === undefined)) || (stryMutAct_9fa48("146822") ? configStr !== null : stryMutAct_9fa48("146821") ? false : (stryCov_9fa48("146821", "146822"), configStr === null)))) {
      if (stryMutAct_9fa48("146823")) {
        {}
      } else {
        stryCov_9fa48("146823");
        return stryMutAct_9fa48("146824") ? {} : (stryCov_9fa48("146824"), {
          valid: stryMutAct_9fa48("146825") ? false : (stryCov_9fa48("146825"), true)
        });
      }
    }
    if (stryMutAct_9fa48("146828") ? typeof configStr === TYPEOF.STRING : stryMutAct_9fa48("146827") ? false : stryMutAct_9fa48("146826") ? true : (stryCov_9fa48("146826", "146827", "146828"), typeof configStr !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("146829")) {
        {}
      } else {
        stryCov_9fa48("146829");
        return stryMutAct_9fa48("146830") ? {} : (stryCov_9fa48("146830"), {
          valid: stryMutAct_9fa48("146831") ? true : (stryCov_9fa48("146831"), false),
          errors: stryMutAct_9fa48("146832") ? [] : (stryCov_9fa48("146832"), [OCI_DESCRIPTOR_ERROR.CONFIG_NOT_STRING])
        });
      }
    }
    let parsed;
    try {
      if (stryMutAct_9fa48("146833")) {
        {}
      } else {
        stryCov_9fa48("146833");
        parsed = JSON.parse(configStr);
      }
    } catch (_e) {
      if (stryMutAct_9fa48("146834")) {
        {}
      } else {
        stryCov_9fa48("146834");
        return stryMutAct_9fa48("146835") ? {} : (stryCov_9fa48("146835"), {
          valid: stryMutAct_9fa48("146836") ? true : (stryCov_9fa48("146836"), false),
          errors: stryMutAct_9fa48("146837") ? [] : (stryCov_9fa48("146837"), [OCI_DESCRIPTOR_ERROR.CONFIG_INVALID_JSON])
        });
      }
    }
    const errors = stryMutAct_9fa48("146838") ? ["Stryker was here"] : (stryCov_9fa48("146838"), []);
    if (stryMutAct_9fa48("146840") ? false : stryMutAct_9fa48("146839") ? true : (stryCov_9fa48("146839", "146840"), OCI_CONFIG_FIELD.MEMORY_LIMIT_MB in parsed)) {
      if (stryMutAct_9fa48("146841")) {
        {}
      } else {
        stryCov_9fa48("146841");
        const val = parsed[OCI_CONFIG_FIELD.MEMORY_LIMIT_MB];
        if (stryMutAct_9fa48("146844") ? typeof val !== TYPEOF.NUMBER && val <= 0 : stryMutAct_9fa48("146843") ? false : stryMutAct_9fa48("146842") ? true : (stryCov_9fa48("146842", "146843", "146844"), (stryMutAct_9fa48("146846") ? typeof val === TYPEOF.NUMBER : stryMutAct_9fa48("146845") ? false : (stryCov_9fa48("146845", "146846"), typeof val !== TYPEOF.NUMBER)) || (stryMutAct_9fa48("146849") ? val > 0 : stryMutAct_9fa48("146848") ? val < 0 : stryMutAct_9fa48("146847") ? false : (stryCov_9fa48("146847", "146848", "146849"), val <= 0)))) {
          if (stryMutAct_9fa48("146850")) {
            {}
          } else {
            stryCov_9fa48("146850");
            errors.push(OCI_DESCRIPTOR_ERROR.MEMORY_LIMIT_INVALID);
          }
        }
      }
    }
    if (stryMutAct_9fa48("146852") ? false : stryMutAct_9fa48("146851") ? true : (stryCov_9fa48("146851", "146852"), OCI_CONFIG_FIELD.CPU_LIMIT in parsed)) {
      if (stryMutAct_9fa48("146853")) {
        {}
      } else {
        stryCov_9fa48("146853");
        const val = parsed[OCI_CONFIG_FIELD.CPU_LIMIT];
        if (stryMutAct_9fa48("146856") ? typeof val !== TYPEOF.NUMBER && val <= 0 : stryMutAct_9fa48("146855") ? false : stryMutAct_9fa48("146854") ? true : (stryCov_9fa48("146854", "146855", "146856"), (stryMutAct_9fa48("146858") ? typeof val === TYPEOF.NUMBER : stryMutAct_9fa48("146857") ? false : (stryCov_9fa48("146857", "146858"), typeof val !== TYPEOF.NUMBER)) || (stryMutAct_9fa48("146861") ? val > 0 : stryMutAct_9fa48("146860") ? val < 0 : stryMutAct_9fa48("146859") ? false : (stryCov_9fa48("146859", "146860", "146861"), val <= 0)))) {
          if (stryMutAct_9fa48("146862")) {
            {}
          } else {
            stryCov_9fa48("146862");
            errors.push(OCI_DESCRIPTOR_ERROR.CPU_LIMIT_INVALID);
          }
        }
      }
    }
    if (stryMutAct_9fa48("146864") ? false : stryMutAct_9fa48("146863") ? true : (stryCov_9fa48("146863", "146864"), OCI_CONFIG_FIELD.NETWORK_POLICY in parsed)) {
      if (stryMutAct_9fa48("146865")) {
        {}
      } else {
        stryCov_9fa48("146865");
        const val = parsed[OCI_CONFIG_FIELD.NETWORK_POLICY];
        if (stryMutAct_9fa48("146868") ? false : stryMutAct_9fa48("146867") ? true : stryMutAct_9fa48("146866") ? ALLOWED_NETWORK_POLICIES.has(val) : (stryCov_9fa48("146866", "146867", "146868"), !ALLOWED_NETWORK_POLICIES.has(val))) {
          if (stryMutAct_9fa48("146869")) {
            {}
          } else {
            stryCov_9fa48("146869");
            errors.push(OCI_DESCRIPTOR_ERROR.NETWORK_POLICY_INVALID);
          }
        }
      }
    }
    if (stryMutAct_9fa48("146871") ? false : stryMutAct_9fa48("146870") ? true : (stryCov_9fa48("146870", "146871"), OCI_CONFIG_FIELD.HEALTH_CHECK_INTERVAL_MS in parsed)) {
      if (stryMutAct_9fa48("146872")) {
        {}
      } else {
        stryCov_9fa48("146872");
        const val = parsed[OCI_CONFIG_FIELD.HEALTH_CHECK_INTERVAL_MS];
        if (stryMutAct_9fa48("146875") ? (typeof val !== TYPEOF.NUMBER || val <= 0) && !Number.isInteger(val) : stryMutAct_9fa48("146874") ? false : stryMutAct_9fa48("146873") ? true : (stryCov_9fa48("146873", "146874", "146875"), (stryMutAct_9fa48("146877") ? typeof val !== TYPEOF.NUMBER && val <= 0 : stryMutAct_9fa48("146876") ? false : (stryCov_9fa48("146876", "146877"), (stryMutAct_9fa48("146879") ? typeof val === TYPEOF.NUMBER : stryMutAct_9fa48("146878") ? false : (stryCov_9fa48("146878", "146879"), typeof val !== TYPEOF.NUMBER)) || (stryMutAct_9fa48("146882") ? val > 0 : stryMutAct_9fa48("146881") ? val < 0 : stryMutAct_9fa48("146880") ? false : (stryCov_9fa48("146880", "146881", "146882"), val <= 0)))) || (stryMutAct_9fa48("146883") ? Number.isInteger(val) : (stryCov_9fa48("146883"), !Number.isInteger(val))))) {
          if (stryMutAct_9fa48("146884")) {
            {}
          } else {
            stryCov_9fa48("146884");
            errors.push(OCI_DESCRIPTOR_ERROR.HEALTH_CHECK_INTERVAL_INVALID);
          }
        }
      }
    }
    if (stryMutAct_9fa48("146888") ? errors.length <= 0 : stryMutAct_9fa48("146887") ? errors.length >= 0 : stryMutAct_9fa48("146886") ? false : stryMutAct_9fa48("146885") ? true : (stryCov_9fa48("146885", "146886", "146887", "146888"), errors.length > 0)) {
      if (stryMutAct_9fa48("146889")) {
        {}
      } else {
        stryCov_9fa48("146889");
        return stryMutAct_9fa48("146890") ? {} : (stryCov_9fa48("146890"), {
          valid: stryMutAct_9fa48("146891") ? true : (stryCov_9fa48("146891"), false),
          errors
        });
      }
    }
    return stryMutAct_9fa48("146892") ? {} : (stryCov_9fa48("146892"), {
      valid: stryMutAct_9fa48("146893") ? false : (stryCov_9fa48("146893"), true),
      config: parsed
    });
  }
}

/**
 * Full descriptor validation for oci_container runtime kind.
 * Validates both runtime_ref and runtime_config.
 *
 * @param {{runtime_ref: *, runtime_config?: *}} descriptor
 * @return {{valid: boolean, errors?: string[]}}
 */
function validateOciDescriptor(descriptor) {
  if (stryMutAct_9fa48("146894")) {
    {}
  } else {
    stryCov_9fa48("146894");
    const errors = stryMutAct_9fa48("146895") ? ["Stryker was here"] : (stryCov_9fa48("146895"), []);
    const refResult = validateOciDescriptorRef(stryMutAct_9fa48("146898") ? descriptor || descriptor.runtime_ref : stryMutAct_9fa48("146897") ? false : stryMutAct_9fa48("146896") ? true : (stryCov_9fa48("146896", "146897", "146898"), descriptor && descriptor.runtime_ref));
    if (stryMutAct_9fa48("146901") ? false : stryMutAct_9fa48("146900") ? true : stryMutAct_9fa48("146899") ? refResult.valid : (stryCov_9fa48("146899", "146900", "146901"), !refResult.valid)) {
      if (stryMutAct_9fa48("146902")) {
        {}
      } else {
        stryCov_9fa48("146902");
        errors.push(...refResult.errors);
      }
    }
    const configResult = validateOciRuntimeConfig(stryMutAct_9fa48("146905") ? descriptor || descriptor.runtime_config : stryMutAct_9fa48("146904") ? false : stryMutAct_9fa48("146903") ? true : (stryCov_9fa48("146903", "146904", "146905"), descriptor && descriptor.runtime_config));
    if (stryMutAct_9fa48("146908") ? false : stryMutAct_9fa48("146907") ? true : stryMutAct_9fa48("146906") ? configResult.valid : (stryCov_9fa48("146906", "146907", "146908"), !configResult.valid)) {
      if (stryMutAct_9fa48("146909")) {
        {}
      } else {
        stryCov_9fa48("146909");
        errors.push(...configResult.errors);
      }
    }
    if (stryMutAct_9fa48("146913") ? errors.length <= 0 : stryMutAct_9fa48("146912") ? errors.length >= 0 : stryMutAct_9fa48("146911") ? false : stryMutAct_9fa48("146910") ? true : (stryCov_9fa48("146910", "146911", "146912", "146913"), errors.length > 0)) {
      if (stryMutAct_9fa48("146914")) {
        {}
      } else {
        stryCov_9fa48("146914");
        return stryMutAct_9fa48("146915") ? {} : (stryCov_9fa48("146915"), {
          valid: stryMutAct_9fa48("146916") ? true : (stryCov_9fa48("146916"), false),
          errors
        });
      }
    }
    return stryMutAct_9fa48("146917") ? {} : (stryCov_9fa48("146917"), {
      valid: stryMutAct_9fa48("146918") ? false : (stryCov_9fa48("146918"), true)
    });
  }
}

/**
 * Check whether the OCI container feature gate is enabled.
 *
 * @param {Object|null} configMap - Configuration map (or null).
 * @return {boolean} True only if explicitly enabled.
 */
function isOciFeatureGateEnabled(configMap) {
  if (stryMutAct_9fa48("146919")) {
    {}
  } else {
    stryCov_9fa48("146919");
    if (stryMutAct_9fa48("146922") ? false : stryMutAct_9fa48("146921") ? true : stryMutAct_9fa48("146920") ? configMap : (stryCov_9fa48("146920", "146921", "146922"), !configMap)) {
      if (stryMutAct_9fa48("146923")) {
        {}
      } else {
        stryCov_9fa48("146923");
        return OCI_FEATURE_GATE.DEFAULT;
      }
    }
    return stryMutAct_9fa48("146926") ? configMap[OCI_FEATURE_GATE.KEY] !== true : stryMutAct_9fa48("146925") ? false : stryMutAct_9fa48("146924") ? true : (stryCov_9fa48("146924", "146925", "146926"), configMap[OCI_FEATURE_GATE.KEY] === (stryMutAct_9fa48("146927") ? false : (stryCov_9fa48("146927"), true)));
  }
}
export { OCI_DESCRIPTOR_FIELD, OCI_CONFIG_FIELD, OCI_NETWORK_POLICY, ALLOWED_NETWORK_POLICIES, OCI_DESCRIPTOR_ERROR, OCI_FEATURE_GATE, validateOciDescriptorRef, validateOciRuntimeConfig, validateOciDescriptor, isOciFeatureGateEnabled };