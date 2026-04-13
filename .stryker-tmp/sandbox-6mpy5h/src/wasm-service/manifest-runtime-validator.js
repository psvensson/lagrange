/**
 * Manifest Runtime Validator — validates that a WASM module
 * instance satisfies its manifest's run_export contract.
 *
 * Before activation, the system must verify:
 * 1. The manifest itself is structurally valid.
 * 2. run_export exists in the actual WASM module instance.
 * 3. run_export resolves to a function.
 * 4. run_export signature matches the runtime contract
 *    (2-3 params: context, batch, options?).
 *
 * Requirements: 7.1, 7.2, 7.3
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
import { MODULE_MANIFEST_FIELD as MF, MODULE_MANIFEST_ERROR_MSG as ERR, RUN_EXPORT_MIN_PARAMS, RUN_EXPORT_MAX_PARAMS } from './module-manifest-constants.js';
import { validateModuleManifest } from './module-manifest-models.js';
const RUNTIME_VALIDATION_ERROR_MSG = Object.freeze(stryMutAct_9fa48("160718") ? {} : (stryCov_9fa48("160718"), {
  ADAPTER_REQUIRED: stryMutAct_9fa48("160719") ? "" : (stryCov_9fa48("160719"), 'Runtime adapter with createInstance/inspect/destroyInstance is required'),
  MODULE_ENTRY_REQUIRED: stryMutAct_9fa48("160720") ? "" : (stryCov_9fa48("160720"), 'Module entry with exports is required for runtime validation')
}));

/**
 * Validate that run_export exists in the module instance
 * and resolves to a callable function.
 *
 * @param {Object} moduleExports - The WASM module instance
 *   exports object (e.g., instance.exports).
 * @param {string} runExportName - The declared run_export name.
 * @return {{valid: boolean, errors: string[]}} Result.
 */
function validateRunExportExists(moduleExports, runExportName) {
  if (stryMutAct_9fa48("160721")) {
    {}
  } else {
    stryCov_9fa48("160721");
    const errors = stryMutAct_9fa48("160722") ? ["Stryker was here"] : (stryCov_9fa48("160722"), []);
    if (stryMutAct_9fa48("160725") ? !moduleExports && typeof moduleExports !== TYPEOF.OBJECT : stryMutAct_9fa48("160724") ? false : stryMutAct_9fa48("160723") ? true : (stryCov_9fa48("160723", "160724", "160725"), (stryMutAct_9fa48("160726") ? moduleExports : (stryCov_9fa48("160726"), !moduleExports)) || (stryMutAct_9fa48("160728") ? typeof moduleExports === TYPEOF.OBJECT : stryMutAct_9fa48("160727") ? false : (stryCov_9fa48("160727", "160728"), typeof moduleExports !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("160729")) {
        {}
      } else {
        stryCov_9fa48("160729");
        errors.push(ERR.MODULE_INSTANCE_REQUIRED);
        return stryMutAct_9fa48("160730") ? {} : (stryCov_9fa48("160730"), {
          valid: stryMutAct_9fa48("160731") ? true : (stryCov_9fa48("160731"), false),
          errors
        });
      }
    }
    if (stryMutAct_9fa48("160734") ? false : stryMutAct_9fa48("160733") ? true : stryMutAct_9fa48("160732") ? runExportName : (stryCov_9fa48("160732", "160733", "160734"), !runExportName)) {
      if (stryMutAct_9fa48("160735")) {
        {}
      } else {
        stryCov_9fa48("160735");
        errors.push(ERR.RUN_EXPORT_REQUIRED);
        return stryMutAct_9fa48("160736") ? {} : (stryCov_9fa48("160736"), {
          valid: stryMutAct_9fa48("160737") ? true : (stryCov_9fa48("160737"), false),
          errors
        });
      }
    }
    const exportFn = moduleExports[runExportName];
    if (stryMutAct_9fa48("160740") ? exportFn === undefined && exportFn === null : stryMutAct_9fa48("160739") ? false : stryMutAct_9fa48("160738") ? true : (stryCov_9fa48("160738", "160739", "160740"), (stryMutAct_9fa48("160742") ? exportFn !== undefined : stryMutAct_9fa48("160741") ? false : (stryCov_9fa48("160741", "160742"), exportFn === undefined)) || (stryMutAct_9fa48("160744") ? exportFn !== null : stryMutAct_9fa48("160743") ? false : (stryCov_9fa48("160743", "160744"), exportFn === null)))) {
      if (stryMutAct_9fa48("160745")) {
        {}
      } else {
        stryCov_9fa48("160745");
        errors.push(ERR.RUN_EXPORT_MISSING_IN_MODULE);
        return stryMutAct_9fa48("160746") ? {} : (stryCov_9fa48("160746"), {
          valid: stryMutAct_9fa48("160747") ? true : (stryCov_9fa48("160747"), false),
          errors
        });
      }
    }
    if (stryMutAct_9fa48("160750") ? typeof exportFn === TYPEOF.FUNCTION : stryMutAct_9fa48("160749") ? false : stryMutAct_9fa48("160748") ? true : (stryCov_9fa48("160748", "160749", "160750"), typeof exportFn !== TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("160751")) {
        {}
      } else {
        stryCov_9fa48("160751");
        errors.push(ERR.RUN_EXPORT_NOT_FUNCTION);
        return stryMutAct_9fa48("160752") ? {} : (stryCov_9fa48("160752"), {
          valid: stryMutAct_9fa48("160753") ? true : (stryCov_9fa48("160753"), false),
          errors
        });
      }
    }
    return stryMutAct_9fa48("160754") ? {} : (stryCov_9fa48("160754"), {
      valid: stryMutAct_9fa48("160755") ? false : (stryCov_9fa48("160755"), true),
      errors
    });
  }
}

/**
 * Validate that run_export function signature matches the
 * required runtime contract: (context, batch[, options]).
 *
 * @param {Function} exportFn - The resolved export function.
 * @return {{valid: boolean, errors: string[]}} Result.
 */
function validateRunExportSignature(exportFn) {
  if (stryMutAct_9fa48("160756")) {
    {}
  } else {
    stryCov_9fa48("160756");
    const errors = stryMutAct_9fa48("160757") ? ["Stryker was here"] : (stryCov_9fa48("160757"), []);
    if (stryMutAct_9fa48("160760") ? typeof exportFn === TYPEOF.FUNCTION : stryMutAct_9fa48("160759") ? false : stryMutAct_9fa48("160758") ? true : (stryCov_9fa48("160758", "160759", "160760"), typeof exportFn !== TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("160761")) {
        {}
      } else {
        stryCov_9fa48("160761");
        errors.push(ERR.RUN_EXPORT_NOT_FUNCTION);
        return stryMutAct_9fa48("160762") ? {} : (stryCov_9fa48("160762"), {
          valid: stryMutAct_9fa48("160763") ? true : (stryCov_9fa48("160763"), false),
          errors
        });
      }
    }
    const paramCount = exportFn.length;
    if (stryMutAct_9fa48("160766") ? paramCount < RUN_EXPORT_MIN_PARAMS && paramCount > RUN_EXPORT_MAX_PARAMS : stryMutAct_9fa48("160765") ? false : stryMutAct_9fa48("160764") ? true : (stryCov_9fa48("160764", "160765", "160766"), (stryMutAct_9fa48("160769") ? paramCount >= RUN_EXPORT_MIN_PARAMS : stryMutAct_9fa48("160768") ? paramCount <= RUN_EXPORT_MIN_PARAMS : stryMutAct_9fa48("160767") ? false : (stryCov_9fa48("160767", "160768", "160769"), paramCount < RUN_EXPORT_MIN_PARAMS)) || (stryMutAct_9fa48("160772") ? paramCount <= RUN_EXPORT_MAX_PARAMS : stryMutAct_9fa48("160771") ? paramCount >= RUN_EXPORT_MAX_PARAMS : stryMutAct_9fa48("160770") ? false : (stryCov_9fa48("160770", "160771", "160772"), paramCount > RUN_EXPORT_MAX_PARAMS)))) {
      if (stryMutAct_9fa48("160773")) {
        {}
      } else {
        stryCov_9fa48("160773");
        errors.push(ERR.RUN_EXPORT_SIGNATURE_MISMATCH);
      }
    }
    return stryMutAct_9fa48("160774") ? {} : (stryCov_9fa48("160774"), {
      valid: stryMutAct_9fa48("160777") ? errors.length !== NUM.ZERO : stryMutAct_9fa48("160776") ? false : stryMutAct_9fa48("160775") ? true : (stryCov_9fa48("160775", "160776", "160777"), errors.length === NUM.ZERO),
      errors
    });
  }
}

/**
 * Full manifest runtime validation pipeline.
 *
 * Runs all validation stages in order:
 * 1. Structural manifest validation (fields, digest, etc.)
 * 2. run_export existence in module instance.
 * 3. run_export signature match against runtime contract.
 *
 * @param {Object} manifest - Module manifest object.
 * @param {Object} moduleExports - WASM module instance exports.
 * @return {{valid: boolean, errors: string[]}} Combined result.
 */
function validateManifestRuntime(manifest, moduleExports) {
  if (stryMutAct_9fa48("160778")) {
    {}
  } else {
    stryCov_9fa48("160778");
    const allErrors = stryMutAct_9fa48("160779") ? ["Stryker was here"] : (stryCov_9fa48("160779"), []);
    if (stryMutAct_9fa48("160782") ? false : stryMutAct_9fa48("160781") ? true : stryMutAct_9fa48("160780") ? manifest : (stryCov_9fa48("160780", "160781", "160782"), !manifest)) {
      if (stryMutAct_9fa48("160783")) {
        {}
      } else {
        stryCov_9fa48("160783");
        allErrors.push(ERR.MANIFEST_REQUIRED);
        return stryMutAct_9fa48("160784") ? {} : (stryCov_9fa48("160784"), {
          valid: stryMutAct_9fa48("160785") ? true : (stryCov_9fa48("160785"), false),
          errors: allErrors
        });
      }
    }
    if (stryMutAct_9fa48("160788") ? !moduleExports && typeof moduleExports !== TYPEOF.OBJECT : stryMutAct_9fa48("160787") ? false : stryMutAct_9fa48("160786") ? true : (stryCov_9fa48("160786", "160787", "160788"), (stryMutAct_9fa48("160789") ? moduleExports : (stryCov_9fa48("160789"), !moduleExports)) || (stryMutAct_9fa48("160791") ? typeof moduleExports === TYPEOF.OBJECT : stryMutAct_9fa48("160790") ? false : (stryCov_9fa48("160790", "160791"), typeof moduleExports !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("160792")) {
        {}
      } else {
        stryCov_9fa48("160792");
        allErrors.push(ERR.MODULE_INSTANCE_REQUIRED);
        return stryMutAct_9fa48("160793") ? {} : (stryCov_9fa48("160793"), {
          valid: stryMutAct_9fa48("160794") ? true : (stryCov_9fa48("160794"), false),
          errors: allErrors
        });
      }
    }
    const structResult = validateModuleManifest(manifest);
    allErrors.push(...structResult.errors);
    if (stryMutAct_9fa48("160797") ? false : stryMutAct_9fa48("160796") ? true : stryMutAct_9fa48("160795") ? structResult.valid : (stryCov_9fa48("160795", "160796", "160797"), !structResult.valid)) {
      if (stryMutAct_9fa48("160798")) {
        {}
      } else {
        stryCov_9fa48("160798");
        return stryMutAct_9fa48("160799") ? {} : (stryCov_9fa48("160799"), {
          valid: stryMutAct_9fa48("160800") ? true : (stryCov_9fa48("160800"), false),
          errors: allErrors
        });
      }
    }
    const runExportName = manifest[MF.RUN_EXPORT];
    const existResult = validateRunExportExists(moduleExports, runExportName);
    allErrors.push(...existResult.errors);
    if (stryMutAct_9fa48("160803") ? false : stryMutAct_9fa48("160802") ? true : stryMutAct_9fa48("160801") ? existResult.valid : (stryCov_9fa48("160801", "160802", "160803"), !existResult.valid)) {
      if (stryMutAct_9fa48("160804")) {
        {}
      } else {
        stryCov_9fa48("160804");
        return stryMutAct_9fa48("160805") ? {} : (stryCov_9fa48("160805"), {
          valid: stryMutAct_9fa48("160806") ? true : (stryCov_9fa48("160806"), false),
          errors: allErrors
        });
      }
    }
    const exportFn = moduleExports[runExportName];
    const sigResult = validateRunExportSignature(exportFn);
    allErrors.push(...sigResult.errors);
    return stryMutAct_9fa48("160807") ? {} : (stryCov_9fa48("160807"), {
      valid: stryMutAct_9fa48("160810") ? allErrors.length !== NUM.ZERO : stryMutAct_9fa48("160809") ? false : stryMutAct_9fa48("160808") ? true : (stryCov_9fa48("160808", "160809", "160810"), allErrors.length === NUM.ZERO),
      errors: allErrors
    });
  }
}

/**
 * Full manifest runtime validation pipeline using a runtime adapter
 * instance for export presence verification.
 *
 * This validates run_export presence through runtime-owned inspection
 * data (`inspect().exportNames`) rather than relying only on a raw
 * exports object.
 *
 * @param {Object} manifest - Module manifest object.
 * @param {Object} moduleEntry - Module entry containing at least `exports`.
 * @param {Object} runtimeAdapter - Runtime adapter contract owner.
 * @param {string} [moduleRef='runtime-validation'] - Module reference.
 * @return {Promise<{valid: boolean, errors: string[]}>} Combined result.
 */
async function validateManifestRuntimeWithAdapter(manifest, moduleEntry, runtimeAdapter, moduleRef = stryMutAct_9fa48("160811") ? "" : (stryCov_9fa48("160811"), 'runtime-validation')) {
  if (stryMutAct_9fa48("160812")) {
    {}
  } else {
    stryCov_9fa48("160812");
    const allErrors = stryMutAct_9fa48("160813") ? ["Stryker was here"] : (stryCov_9fa48("160813"), []);
    if (stryMutAct_9fa48("160816") ? false : stryMutAct_9fa48("160815") ? true : stryMutAct_9fa48("160814") ? manifest : (stryCov_9fa48("160814", "160815", "160816"), !manifest)) {
      if (stryMutAct_9fa48("160817")) {
        {}
      } else {
        stryCov_9fa48("160817");
        allErrors.push(ERR.MANIFEST_REQUIRED);
        return stryMutAct_9fa48("160818") ? {} : (stryCov_9fa48("160818"), {
          valid: stryMutAct_9fa48("160819") ? true : (stryCov_9fa48("160819"), false),
          errors: allErrors
        });
      }
    }
    if (stryMutAct_9fa48("160822") ? !moduleEntry && typeof moduleEntry !== TYPEOF.OBJECT : stryMutAct_9fa48("160821") ? false : stryMutAct_9fa48("160820") ? true : (stryCov_9fa48("160820", "160821", "160822"), (stryMutAct_9fa48("160823") ? moduleEntry : (stryCov_9fa48("160823"), !moduleEntry)) || (stryMutAct_9fa48("160825") ? typeof moduleEntry === TYPEOF.OBJECT : stryMutAct_9fa48("160824") ? false : (stryCov_9fa48("160824", "160825"), typeof moduleEntry !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("160826")) {
        {}
      } else {
        stryCov_9fa48("160826");
        allErrors.push(RUNTIME_VALIDATION_ERROR_MSG.MODULE_ENTRY_REQUIRED);
        return stryMutAct_9fa48("160827") ? {} : (stryCov_9fa48("160827"), {
          valid: stryMutAct_9fa48("160828") ? true : (stryCov_9fa48("160828"), false),
          errors: allErrors
        });
      }
    }
    if (stryMutAct_9fa48("160831") ? (!runtimeAdapter || typeof runtimeAdapter.createInstance !== TYPEOF.FUNCTION || typeof runtimeAdapter.inspect !== TYPEOF.FUNCTION) && typeof runtimeAdapter.destroyInstance !== TYPEOF.FUNCTION : stryMutAct_9fa48("160830") ? false : stryMutAct_9fa48("160829") ? true : (stryCov_9fa48("160829", "160830", "160831"), (stryMutAct_9fa48("160833") ? (!runtimeAdapter || typeof runtimeAdapter.createInstance !== TYPEOF.FUNCTION) && typeof runtimeAdapter.inspect !== TYPEOF.FUNCTION : stryMutAct_9fa48("160832") ? false : (stryCov_9fa48("160832", "160833"), (stryMutAct_9fa48("160835") ? !runtimeAdapter && typeof runtimeAdapter.createInstance !== TYPEOF.FUNCTION : stryMutAct_9fa48("160834") ? false : (stryCov_9fa48("160834", "160835"), (stryMutAct_9fa48("160836") ? runtimeAdapter : (stryCov_9fa48("160836"), !runtimeAdapter)) || (stryMutAct_9fa48("160838") ? typeof runtimeAdapter.createInstance === TYPEOF.FUNCTION : stryMutAct_9fa48("160837") ? false : (stryCov_9fa48("160837", "160838"), typeof runtimeAdapter.createInstance !== TYPEOF.FUNCTION)))) || (stryMutAct_9fa48("160840") ? typeof runtimeAdapter.inspect === TYPEOF.FUNCTION : stryMutAct_9fa48("160839") ? false : (stryCov_9fa48("160839", "160840"), typeof runtimeAdapter.inspect !== TYPEOF.FUNCTION)))) || (stryMutAct_9fa48("160842") ? typeof runtimeAdapter.destroyInstance === TYPEOF.FUNCTION : stryMutAct_9fa48("160841") ? false : (stryCov_9fa48("160841", "160842"), typeof runtimeAdapter.destroyInstance !== TYPEOF.FUNCTION)))) {
      if (stryMutAct_9fa48("160843")) {
        {}
      } else {
        stryCov_9fa48("160843");
        allErrors.push(RUNTIME_VALIDATION_ERROR_MSG.ADAPTER_REQUIRED);
        return stryMutAct_9fa48("160844") ? {} : (stryCov_9fa48("160844"), {
          valid: stryMutAct_9fa48("160845") ? true : (stryCov_9fa48("160845"), false),
          errors: allErrors
        });
      }
    }
    const structResult = validateModuleManifest(manifest);
    allErrors.push(...structResult.errors);
    if (stryMutAct_9fa48("160848") ? false : stryMutAct_9fa48("160847") ? true : stryMutAct_9fa48("160846") ? structResult.valid : (stryCov_9fa48("160846", "160847", "160848"), !structResult.valid)) {
      if (stryMutAct_9fa48("160849")) {
        {}
      } else {
        stryCov_9fa48("160849");
        return stryMutAct_9fa48("160850") ? {} : (stryCov_9fa48("160850"), {
          valid: stryMutAct_9fa48("160851") ? true : (stryCov_9fa48("160851"), false),
          errors: allErrors
        });
      }
    }
    const runExportName = manifest[MF.RUN_EXPORT];
    let instanceHandle = null;
    let inspectResult = null;
    try {
      if (stryMutAct_9fa48("160852")) {
        {}
      } else {
        stryCov_9fa48("160852");
        const created = await runtimeAdapter.createInstance(stryMutAct_9fa48("160853") ? {} : (stryCov_9fa48("160853"), {
          moduleRef,
          moduleEntry
        }));
        instanceHandle = created.instanceHandle;
        inspectResult = await runtimeAdapter.inspect(stryMutAct_9fa48("160854") ? {} : (stryCov_9fa48("160854"), {
          instanceHandle
        }));
      }
    } finally {
      if (stryMutAct_9fa48("160855")) {
        {}
      } else {
        stryCov_9fa48("160855");
        if (stryMutAct_9fa48("160857") ? false : stryMutAct_9fa48("160856") ? true : (stryCov_9fa48("160856", "160857"), instanceHandle)) {
          if (stryMutAct_9fa48("160858")) {
            {}
          } else {
            stryCov_9fa48("160858");
            await runtimeAdapter.destroyInstance(instanceHandle);
          }
        }
      }
    }
    const exportNames = Array.isArray(stryMutAct_9fa48("160859") ? inspectResult.exportNames : (stryCov_9fa48("160859"), inspectResult?.exportNames)) ? inspectResult.exportNames : stryMutAct_9fa48("160860") ? ["Stryker was here"] : (stryCov_9fa48("160860"), []);
    if (stryMutAct_9fa48("160863") ? false : stryMutAct_9fa48("160862") ? true : stryMutAct_9fa48("160861") ? exportNames.includes(runExportName) : (stryCov_9fa48("160861", "160862", "160863"), !exportNames.includes(runExportName))) {
      if (stryMutAct_9fa48("160864")) {
        {}
      } else {
        stryCov_9fa48("160864");
        allErrors.push(ERR.RUN_EXPORT_MISSING_IN_MODULE);
        return stryMutAct_9fa48("160865") ? {} : (stryCov_9fa48("160865"), {
          valid: stryMutAct_9fa48("160866") ? true : (stryCov_9fa48("160866"), false),
          errors: allErrors
        });
      }
    }
    const moduleExports = moduleEntry.exports;
    const existResult = validateRunExportExists(moduleExports, runExportName);
    allErrors.push(...existResult.errors);
    if (stryMutAct_9fa48("160869") ? false : stryMutAct_9fa48("160868") ? true : stryMutAct_9fa48("160867") ? existResult.valid : (stryCov_9fa48("160867", "160868", "160869"), !existResult.valid)) {
      if (stryMutAct_9fa48("160870")) {
        {}
      } else {
        stryCov_9fa48("160870");
        return stryMutAct_9fa48("160871") ? {} : (stryCov_9fa48("160871"), {
          valid: stryMutAct_9fa48("160872") ? true : (stryCov_9fa48("160872"), false),
          errors: allErrors
        });
      }
    }
    const exportFn = moduleExports[runExportName];
    const sigResult = validateRunExportSignature(exportFn);
    allErrors.push(...sigResult.errors);
    return stryMutAct_9fa48("160873") ? {} : (stryCov_9fa48("160873"), {
      valid: stryMutAct_9fa48("160876") ? allErrors.length !== NUM.ZERO : stryMutAct_9fa48("160875") ? false : stryMutAct_9fa48("160874") ? true : (stryCov_9fa48("160874", "160875", "160876"), allErrors.length === NUM.ZERO),
      errors: allErrors
    });
  }
}
export { RUNTIME_VALIDATION_ERROR_MSG, validateRunExportExists, validateRunExportSignature, validateManifestRuntime, validateManifestRuntimeWithAdapter };