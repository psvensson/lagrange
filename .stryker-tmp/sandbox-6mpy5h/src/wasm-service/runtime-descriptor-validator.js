/**
 * Validation helpers for runtime descriptor envelopes.
 *
 * Validates that service definitions carry correct runtime
 * descriptors per runtime kind. Enforces fail-closed semantics:
 * unknown kinds or invalid descriptors produce explicit errors.
 *
 * Requirements: 5.4, 9.2
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
import { ALLOWED_RUNTIME_KINDS, RUNTIME_KIND } from '../constants/runtime.js';
import { TYPEOF } from '../constants/types.js';
import { isPgwireRuntimeRef, validatePgwireRuntimeConfig } from '../runtime/pgwire-descriptor.js';

// --- Validation error message constants ---

const DESCRIPTOR_ERROR = Object.freeze(stryMutAct_9fa48("162726") ? {} : (stryCov_9fa48("162726"), {
  KIND_REQUIRED: stryMutAct_9fa48("162727") ? "" : (stryCov_9fa48("162727"), 'runtime_kind is required'),
  KIND_NOT_STRING: stryMutAct_9fa48("162728") ? "" : (stryCov_9fa48("162728"), 'runtime_kind must be a string'),
  KIND_UNKNOWN_PREFIX: stryMutAct_9fa48("162729") ? "" : (stryCov_9fa48("162729"), 'unknown runtime_kind'),
  REF_REQUIRED: stryMutAct_9fa48("162730") ? "" : (stryCov_9fa48("162730"), 'runtime_ref is required for this runtime kind'),
  REF_NOT_STRING: stryMutAct_9fa48("162731") ? "" : (stryCov_9fa48("162731"), 'runtime_ref must be a string'),
  REF_EMPTY: stryMutAct_9fa48("162732") ? "" : (stryCov_9fa48("162732"), 'runtime_ref must be a non-empty string'),
  REF_MISSING_DIGEST: stryMutAct_9fa48("162733") ? "" : (stryCov_9fa48("162733"), 'runtime_ref must contain a digest reference (@sha256:)'),
  CONFIG_NOT_STRING: stryMutAct_9fa48("162734") ? "" : (stryCov_9fa48("162734"), 'runtime_config must be a string when provided'),
  CONFIG_INVALID_JSON: stryMutAct_9fa48("162735") ? "" : (stryCov_9fa48("162735"), 'runtime_config must be valid JSON when provided')
}));
const OCI_DIGEST_MARKER = stryMutAct_9fa48("162736") ? "" : (stryCov_9fa48("162736"), '@sha256:');

/**
 * Build a diagnostic error message for an unknown runtime kind.
 *
 * @param {string} kind - The unknown kind value.
 * @return {string} Error message with the value and allowed kinds.
 */
function unknownKindMessage(kind) {
  if (stryMutAct_9fa48("162737")) {
    {}
  } else {
    stryCov_9fa48("162737");
    const allowed = (stryMutAct_9fa48("162738") ? [] : (stryCov_9fa48("162738"), [...ALLOWED_RUNTIME_KINDS])).join(stryMutAct_9fa48("162739") ? "" : (stryCov_9fa48("162739"), ', '));
    return (stryMutAct_9fa48("162740") ? `` : (stryCov_9fa48("162740"), `${DESCRIPTOR_ERROR.KIND_UNKNOWN_PREFIX} '${kind}'`)) + (stryMutAct_9fa48("162741") ? `` : (stryCov_9fa48("162741"), ` (allowed: ${allowed})`));
  }
}

/**
 * Validate that runtime_kind is an allowed value.
 *
 * @param {*} kind - The runtime_kind value to validate.
 * @return {{valid: boolean, errors?: string[]}}
 */
function validateRuntimeKind(kind) {
  if (stryMutAct_9fa48("162742")) {
    {}
  } else {
    stryCov_9fa48("162742");
    if (stryMutAct_9fa48("162745") ? kind === null && kind === undefined : stryMutAct_9fa48("162744") ? false : stryMutAct_9fa48("162743") ? true : (stryCov_9fa48("162743", "162744", "162745"), (stryMutAct_9fa48("162747") ? kind !== null : stryMutAct_9fa48("162746") ? false : (stryCov_9fa48("162746", "162747"), kind === null)) || (stryMutAct_9fa48("162749") ? kind !== undefined : stryMutAct_9fa48("162748") ? false : (stryCov_9fa48("162748", "162749"), kind === undefined)))) {
      if (stryMutAct_9fa48("162750")) {
        {}
      } else {
        stryCov_9fa48("162750");
        return stryMutAct_9fa48("162751") ? {} : (stryCov_9fa48("162751"), {
          valid: stryMutAct_9fa48("162752") ? true : (stryCov_9fa48("162752"), false),
          errors: stryMutAct_9fa48("162753") ? [] : (stryCov_9fa48("162753"), [DESCRIPTOR_ERROR.KIND_REQUIRED])
        });
      }
    }
    if (stryMutAct_9fa48("162756") ? typeof kind === TYPEOF.STRING : stryMutAct_9fa48("162755") ? false : stryMutAct_9fa48("162754") ? true : (stryCov_9fa48("162754", "162755", "162756"), typeof kind !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("162757")) {
        {}
      } else {
        stryCov_9fa48("162757");
        return stryMutAct_9fa48("162758") ? {} : (stryCov_9fa48("162758"), {
          valid: stryMutAct_9fa48("162759") ? true : (stryCov_9fa48("162759"), false),
          errors: stryMutAct_9fa48("162760") ? [] : (stryCov_9fa48("162760"), [DESCRIPTOR_ERROR.KIND_NOT_STRING])
        });
      }
    }
    if (stryMutAct_9fa48("162763") ? false : stryMutAct_9fa48("162762") ? true : stryMutAct_9fa48("162761") ? ALLOWED_RUNTIME_KINDS.has(kind) : (stryCov_9fa48("162761", "162762", "162763"), !ALLOWED_RUNTIME_KINDS.has(kind))) {
      if (stryMutAct_9fa48("162764")) {
        {}
      } else {
        stryCov_9fa48("162764");
        return stryMutAct_9fa48("162765") ? {} : (stryCov_9fa48("162765"), {
          valid: stryMutAct_9fa48("162766") ? true : (stryCov_9fa48("162766"), false),
          errors: stryMutAct_9fa48("162767") ? [] : (stryCov_9fa48("162767"), [unknownKindMessage(kind)])
        });
      }
    }
    return stryMutAct_9fa48("162768") ? {} : (stryCov_9fa48("162768"), {
      valid: stryMutAct_9fa48("162769") ? false : (stryCov_9fa48("162769"), true)
    });
  }
}

/**
 * Validate runtime_config if provided.
 * Must be null/undefined or a valid JSON string.
 *
 * @param {*} config - The runtime_config value.
 * @return {{valid: boolean, errors?: string[]}}
 */
function validateRuntimeConfig(config) {
  if (stryMutAct_9fa48("162770")) {
    {}
  } else {
    stryCov_9fa48("162770");
    if (stryMutAct_9fa48("162773") ? config === null && config === undefined : stryMutAct_9fa48("162772") ? false : stryMutAct_9fa48("162771") ? true : (stryCov_9fa48("162771", "162772", "162773"), (stryMutAct_9fa48("162775") ? config !== null : stryMutAct_9fa48("162774") ? false : (stryCov_9fa48("162774", "162775"), config === null)) || (stryMutAct_9fa48("162777") ? config !== undefined : stryMutAct_9fa48("162776") ? false : (stryCov_9fa48("162776", "162777"), config === undefined)))) {
      if (stryMutAct_9fa48("162778")) {
        {}
      } else {
        stryCov_9fa48("162778");
        return stryMutAct_9fa48("162779") ? {} : (stryCov_9fa48("162779"), {
          valid: stryMutAct_9fa48("162780") ? false : (stryCov_9fa48("162780"), true)
        });
      }
    }
    if (stryMutAct_9fa48("162783") ? typeof config === TYPEOF.STRING : stryMutAct_9fa48("162782") ? false : stryMutAct_9fa48("162781") ? true : (stryCov_9fa48("162781", "162782", "162783"), typeof config !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("162784")) {
        {}
      } else {
        stryCov_9fa48("162784");
        return stryMutAct_9fa48("162785") ? {} : (stryCov_9fa48("162785"), {
          valid: stryMutAct_9fa48("162786") ? true : (stryCov_9fa48("162786"), false),
          errors: stryMutAct_9fa48("162787") ? [] : (stryCov_9fa48("162787"), [DESCRIPTOR_ERROR.CONFIG_NOT_STRING])
        });
      }
    }
    try {
      if (stryMutAct_9fa48("162788")) {
        {}
      } else {
        stryCov_9fa48("162788");
        JSON.parse(config);
      }
    } catch (_e) {
      if (stryMutAct_9fa48("162789")) {
        {}
      } else {
        stryCov_9fa48("162789");
        return stryMutAct_9fa48("162790") ? {} : (stryCov_9fa48("162790"), {
          valid: stryMutAct_9fa48("162791") ? true : (stryCov_9fa48("162791"), false),
          errors: stryMutAct_9fa48("162792") ? [] : (stryCov_9fa48("162792"), [DESCRIPTOR_ERROR.CONFIG_INVALID_JSON])
        });
      }
    }
    return stryMutAct_9fa48("162793") ? {} : (stryCov_9fa48("162793"), {
      valid: stryMutAct_9fa48("162794") ? false : (stryCov_9fa48("162794"), true)
    });
  }
}

/**
 * Validate runtime_ref for native_js kind.
 * runtime_ref is optional (can be null).
 *
 * @param {*} ref - The runtime_ref value.
 * @return {{valid: boolean, errors?: string[]}}
 */
function validateNativeJsRef(ref) {
  if (stryMutAct_9fa48("162795")) {
    {}
  } else {
    stryCov_9fa48("162795");
    if (stryMutAct_9fa48("162798") ? ref === null && ref === undefined : stryMutAct_9fa48("162797") ? false : stryMutAct_9fa48("162796") ? true : (stryCov_9fa48("162796", "162797", "162798"), (stryMutAct_9fa48("162800") ? ref !== null : stryMutAct_9fa48("162799") ? false : (stryCov_9fa48("162799", "162800"), ref === null)) || (stryMutAct_9fa48("162802") ? ref !== undefined : stryMutAct_9fa48("162801") ? false : (stryCov_9fa48("162801", "162802"), ref === undefined)))) {
      if (stryMutAct_9fa48("162803")) {
        {}
      } else {
        stryCov_9fa48("162803");
        return stryMutAct_9fa48("162804") ? {} : (stryCov_9fa48("162804"), {
          valid: stryMutAct_9fa48("162805") ? false : (stryCov_9fa48("162805"), true)
        });
      }
    }
    if (stryMutAct_9fa48("162808") ? typeof ref === TYPEOF.STRING : stryMutAct_9fa48("162807") ? false : stryMutAct_9fa48("162806") ? true : (stryCov_9fa48("162806", "162807", "162808"), typeof ref !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("162809")) {
        {}
      } else {
        stryCov_9fa48("162809");
        return stryMutAct_9fa48("162810") ? {} : (stryCov_9fa48("162810"), {
          valid: stryMutAct_9fa48("162811") ? true : (stryCov_9fa48("162811"), false),
          errors: stryMutAct_9fa48("162812") ? [] : (stryCov_9fa48("162812"), [DESCRIPTOR_ERROR.REF_NOT_STRING])
        });
      }
    }
    return stryMutAct_9fa48("162813") ? {} : (stryCov_9fa48("162813"), {
      valid: stryMutAct_9fa48("162814") ? false : (stryCov_9fa48("162814"), true)
    });
  }
}

/**
 * Validate runtime_ref for wasm_component kind.
 * runtime_ref must be a non-empty string.
 *
 * @param {*} ref - The runtime_ref value.
 * @return {{valid: boolean, errors?: string[]}}
 */
function validateWasmComponentRef(ref) {
  if (stryMutAct_9fa48("162815")) {
    {}
  } else {
    stryCov_9fa48("162815");
    if (stryMutAct_9fa48("162818") ? ref === null && ref === undefined : stryMutAct_9fa48("162817") ? false : stryMutAct_9fa48("162816") ? true : (stryCov_9fa48("162816", "162817", "162818"), (stryMutAct_9fa48("162820") ? ref !== null : stryMutAct_9fa48("162819") ? false : (stryCov_9fa48("162819", "162820"), ref === null)) || (stryMutAct_9fa48("162822") ? ref !== undefined : stryMutAct_9fa48("162821") ? false : (stryCov_9fa48("162821", "162822"), ref === undefined)))) {
      if (stryMutAct_9fa48("162823")) {
        {}
      } else {
        stryCov_9fa48("162823");
        return stryMutAct_9fa48("162824") ? {} : (stryCov_9fa48("162824"), {
          valid: stryMutAct_9fa48("162825") ? true : (stryCov_9fa48("162825"), false),
          errors: stryMutAct_9fa48("162826") ? [] : (stryCov_9fa48("162826"), [DESCRIPTOR_ERROR.REF_REQUIRED])
        });
      }
    }
    if (stryMutAct_9fa48("162829") ? typeof ref === TYPEOF.STRING : stryMutAct_9fa48("162828") ? false : stryMutAct_9fa48("162827") ? true : (stryCov_9fa48("162827", "162828", "162829"), typeof ref !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("162830")) {
        {}
      } else {
        stryCov_9fa48("162830");
        return stryMutAct_9fa48("162831") ? {} : (stryCov_9fa48("162831"), {
          valid: stryMutAct_9fa48("162832") ? true : (stryCov_9fa48("162832"), false),
          errors: stryMutAct_9fa48("162833") ? [] : (stryCov_9fa48("162833"), [DESCRIPTOR_ERROR.REF_NOT_STRING])
        });
      }
    }
    if (stryMutAct_9fa48("162836") ? ref.length !== 0 : stryMutAct_9fa48("162835") ? false : stryMutAct_9fa48("162834") ? true : (stryCov_9fa48("162834", "162835", "162836"), ref.length === 0)) {
      if (stryMutAct_9fa48("162837")) {
        {}
      } else {
        stryCov_9fa48("162837");
        return stryMutAct_9fa48("162838") ? {} : (stryCov_9fa48("162838"), {
          valid: stryMutAct_9fa48("162839") ? true : (stryCov_9fa48("162839"), false),
          errors: stryMutAct_9fa48("162840") ? [] : (stryCov_9fa48("162840"), [DESCRIPTOR_ERROR.REF_EMPTY])
        });
      }
    }
    return stryMutAct_9fa48("162841") ? {} : (stryCov_9fa48("162841"), {
      valid: stryMutAct_9fa48("162842") ? false : (stryCov_9fa48("162842"), true)
    });
  }
}

/**
 * Validate runtime_ref for oci_container kind.
 * runtime_ref must be a non-empty string containing @sha256:.
 *
 * @param {*} ref - The runtime_ref value.
 * @return {{valid: boolean, errors?: string[]}}
 */
function validateOciContainerRef(ref) {
  if (stryMutAct_9fa48("162843")) {
    {}
  } else {
    stryCov_9fa48("162843");
    if (stryMutAct_9fa48("162846") ? ref === null && ref === undefined : stryMutAct_9fa48("162845") ? false : stryMutAct_9fa48("162844") ? true : (stryCov_9fa48("162844", "162845", "162846"), (stryMutAct_9fa48("162848") ? ref !== null : stryMutAct_9fa48("162847") ? false : (stryCov_9fa48("162847", "162848"), ref === null)) || (stryMutAct_9fa48("162850") ? ref !== undefined : stryMutAct_9fa48("162849") ? false : (stryCov_9fa48("162849", "162850"), ref === undefined)))) {
      if (stryMutAct_9fa48("162851")) {
        {}
      } else {
        stryCov_9fa48("162851");
        return stryMutAct_9fa48("162852") ? {} : (stryCov_9fa48("162852"), {
          valid: stryMutAct_9fa48("162853") ? true : (stryCov_9fa48("162853"), false),
          errors: stryMutAct_9fa48("162854") ? [] : (stryCov_9fa48("162854"), [DESCRIPTOR_ERROR.REF_REQUIRED])
        });
      }
    }
    if (stryMutAct_9fa48("162857") ? typeof ref === TYPEOF.STRING : stryMutAct_9fa48("162856") ? false : stryMutAct_9fa48("162855") ? true : (stryCov_9fa48("162855", "162856", "162857"), typeof ref !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("162858")) {
        {}
      } else {
        stryCov_9fa48("162858");
        return stryMutAct_9fa48("162859") ? {} : (stryCov_9fa48("162859"), {
          valid: stryMutAct_9fa48("162860") ? true : (stryCov_9fa48("162860"), false),
          errors: stryMutAct_9fa48("162861") ? [] : (stryCov_9fa48("162861"), [DESCRIPTOR_ERROR.REF_NOT_STRING])
        });
      }
    }
    if (stryMutAct_9fa48("162864") ? ref.length !== 0 : stryMutAct_9fa48("162863") ? false : stryMutAct_9fa48("162862") ? true : (stryCov_9fa48("162862", "162863", "162864"), ref.length === 0)) {
      if (stryMutAct_9fa48("162865")) {
        {}
      } else {
        stryCov_9fa48("162865");
        return stryMutAct_9fa48("162866") ? {} : (stryCov_9fa48("162866"), {
          valid: stryMutAct_9fa48("162867") ? true : (stryCov_9fa48("162867"), false),
          errors: stryMutAct_9fa48("162868") ? [] : (stryCov_9fa48("162868"), [DESCRIPTOR_ERROR.REF_EMPTY])
        });
      }
    }
    if (stryMutAct_9fa48("162871") ? false : stryMutAct_9fa48("162870") ? true : stryMutAct_9fa48("162869") ? ref.includes(OCI_DIGEST_MARKER) : (stryCov_9fa48("162869", "162870", "162871"), !ref.includes(OCI_DIGEST_MARKER))) {
      if (stryMutAct_9fa48("162872")) {
        {}
      } else {
        stryCov_9fa48("162872");
        return stryMutAct_9fa48("162873") ? {} : (stryCov_9fa48("162873"), {
          valid: stryMutAct_9fa48("162874") ? true : (stryCov_9fa48("162874"), false),
          errors: stryMutAct_9fa48("162875") ? [] : (stryCov_9fa48("162875"), [DESCRIPTOR_ERROR.REF_MISSING_DIGEST])
        });
      }
    }
    return stryMutAct_9fa48("162876") ? {} : (stryCov_9fa48("162876"), {
      valid: stryMutAct_9fa48("162877") ? false : (stryCov_9fa48("162877"), true)
    });
  }
}

/**
 * Per-kind runtime_ref validators.
 * @type {Object<string, function(*): {valid: boolean, errors?: string[]}>}
 */
const REF_VALIDATORS = Object.freeze(stryMutAct_9fa48("162878") ? {} : (stryCov_9fa48("162878"), {
  [RUNTIME_KIND.NATIVE_JS]: validateNativeJsRef,
  [RUNTIME_KIND.WASM_COMPONENT]: validateWasmComponentRef,
  [RUNTIME_KIND.OCI_CONTAINER]: validateOciContainerRef
}));

/**
 * Validate a complete runtime descriptor envelope.
 *
 * Checks runtime_kind, runtime_ref (per-kind rules), and
 * runtime_config. Fail-closed: unknown kinds or missing
 * validators produce explicit errors.
 *
 * @param {{runtimeKind: *, runtimeRef: *, runtimeConfig: *}} descriptor
 * @return {{valid: boolean, errors?: string[]}}
 */
function validateRuntimeDescriptor(descriptor) {
  if (stryMutAct_9fa48("162879")) {
    {}
  } else {
    stryCov_9fa48("162879");
    const errors = stryMutAct_9fa48("162880") ? ["Stryker was here"] : (stryCov_9fa48("162880"), []);
    const kindResult = validateRuntimeKind(descriptor.runtimeKind);
    if (stryMutAct_9fa48("162883") ? false : stryMutAct_9fa48("162882") ? true : stryMutAct_9fa48("162881") ? kindResult.valid : (stryCov_9fa48("162881", "162882", "162883"), !kindResult.valid)) {
      if (stryMutAct_9fa48("162884")) {
        {}
      } else {
        stryCov_9fa48("162884");
        errors.push(...kindResult.errors);
        return stryMutAct_9fa48("162885") ? {} : (stryCov_9fa48("162885"), {
          valid: stryMutAct_9fa48("162886") ? true : (stryCov_9fa48("162886"), false),
          errors
        });
      }
    }
    const refValidator = REF_VALIDATORS[descriptor.runtimeKind];
    if (stryMutAct_9fa48("162889") ? false : stryMutAct_9fa48("162888") ? true : stryMutAct_9fa48("162887") ? refValidator : (stryCov_9fa48("162887", "162888", "162889"), !refValidator)) {
      if (stryMutAct_9fa48("162890")) {
        {}
      } else {
        stryCov_9fa48("162890");
        errors.push(unknownKindMessage(descriptor.runtimeKind));
        return stryMutAct_9fa48("162891") ? {} : (stryCov_9fa48("162891"), {
          valid: stryMutAct_9fa48("162892") ? true : (stryCov_9fa48("162892"), false),
          errors
        });
      }
    }
    const refResult = refValidator(descriptor.runtimeRef);
    if (stryMutAct_9fa48("162895") ? false : stryMutAct_9fa48("162894") ? true : stryMutAct_9fa48("162893") ? refResult.valid : (stryCov_9fa48("162893", "162894", "162895"), !refResult.valid)) {
      if (stryMutAct_9fa48("162896")) {
        {}
      } else {
        stryCov_9fa48("162896");
        errors.push(...refResult.errors);
      }
    }
    const configResult = validateRuntimeConfig(descriptor.runtimeConfig);
    if (stryMutAct_9fa48("162899") ? false : stryMutAct_9fa48("162898") ? true : stryMutAct_9fa48("162897") ? configResult.valid : (stryCov_9fa48("162897", "162898", "162899"), !configResult.valid)) {
      if (stryMutAct_9fa48("162900")) {
        {}
      } else {
        stryCov_9fa48("162900");
        errors.push(...configResult.errors);
      }
    }

    // Per-ref config shape validation (fail-closed).
    if (stryMutAct_9fa48("162903") ? configResult.valid || isPgwireRuntimeRef(descriptor.runtimeRef) : stryMutAct_9fa48("162902") ? false : stryMutAct_9fa48("162901") ? true : (stryCov_9fa48("162901", "162902", "162903"), configResult.valid && isPgwireRuntimeRef(descriptor.runtimeRef))) {
      if (stryMutAct_9fa48("162904")) {
        {}
      } else {
        stryCov_9fa48("162904");
        const pgResult = validatePgwireRuntimeConfig(descriptor.runtimeConfig);
        if (stryMutAct_9fa48("162907") ? false : stryMutAct_9fa48("162906") ? true : stryMutAct_9fa48("162905") ? pgResult.valid : (stryCov_9fa48("162905", "162906", "162907"), !pgResult.valid)) {
          if (stryMutAct_9fa48("162908")) {
            {}
          } else {
            stryCov_9fa48("162908");
            errors.push(...pgResult.errors);
          }
        }
      }
    }
    if (stryMutAct_9fa48("162912") ? errors.length <= 0 : stryMutAct_9fa48("162911") ? errors.length >= 0 : stryMutAct_9fa48("162910") ? false : stryMutAct_9fa48("162909") ? true : (stryCov_9fa48("162909", "162910", "162911", "162912"), errors.length > 0)) {
      if (stryMutAct_9fa48("162913")) {
        {}
      } else {
        stryCov_9fa48("162913");
        return stryMutAct_9fa48("162914") ? {} : (stryCov_9fa48("162914"), {
          valid: stryMutAct_9fa48("162915") ? true : (stryCov_9fa48("162915"), false),
          errors
        });
      }
    }
    return stryMutAct_9fa48("162916") ? {} : (stryCov_9fa48("162916"), {
      valid: stryMutAct_9fa48("162917") ? false : (stryCov_9fa48("162917"), true)
    });
  }
}
export { validateRuntimeKind, validateRuntimeConfig, validateRuntimeDescriptor, unknownKindMessage, DESCRIPTOR_ERROR };