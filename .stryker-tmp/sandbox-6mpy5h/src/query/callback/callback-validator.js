/**
 * Callback Validator — validates async WASM entry exports
 * against the required runtime callback signature contract.
 *
 * Before executing a DB.call callback, the system must verify:
 * 1. The export exists in the module.
 * 2. The export is a function.
 * 3. The export is async (returns a Promise).
 * 4. The parameter count matches the contract (2-3 params).
 * 5. The export matches the manifest's declared run_export.
 *
 * Requirements: 4.3, 4.5, 7.3
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
import { NUM, TYPEOF } from '../../constants/index.js';
import { CALLBACK_MIN_PARAMS, CALLBACK_MAX_PARAMS, CALLBACK_FIELD, CALLBACK_ERROR_MSG } from './callback-constants.js';

/**
 * Validate that a callback descriptor has the required fields.
 *
 * @param {Object} descriptor - Callback descriptor.
 * @param {string} descriptor.moduleRef - Module reference ID.
 * @param {string} descriptor.exportName - Export function name.
 * @return {{valid: boolean, errors: string[]}} Validation result.
 */
function validateCallbackDescriptor(descriptor) {
  if (stryMutAct_9fa48("109945")) {
    {}
  } else {
    stryCov_9fa48("109945");
    const errors = stryMutAct_9fa48("109946") ? ["Stryker was here"] : (stryCov_9fa48("109946"), []);
    if (stryMutAct_9fa48("109949") ? false : stryMutAct_9fa48("109948") ? true : stryMutAct_9fa48("109947") ? descriptor : (stryCov_9fa48("109947", "109948", "109949"), !descriptor)) {
      if (stryMutAct_9fa48("109950")) {
        {}
      } else {
        stryCov_9fa48("109950");
        errors.push(CALLBACK_ERROR_MSG.MODULE_REF_REQUIRED);
        errors.push(CALLBACK_ERROR_MSG.EXPORT_NAME_REQUIRED);
        return stryMutAct_9fa48("109951") ? {} : (stryCov_9fa48("109951"), {
          valid: stryMutAct_9fa48("109952") ? true : (stryCov_9fa48("109952"), false),
          errors
        });
      }
    }
    if (stryMutAct_9fa48("109955") ? false : stryMutAct_9fa48("109954") ? true : stryMutAct_9fa48("109953") ? descriptor[CALLBACK_FIELD.MODULE_REF] : (stryCov_9fa48("109953", "109954", "109955"), !descriptor[CALLBACK_FIELD.MODULE_REF])) {
      if (stryMutAct_9fa48("109956")) {
        {}
      } else {
        stryCov_9fa48("109956");
        errors.push(CALLBACK_ERROR_MSG.MODULE_REF_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("109959") ? false : stryMutAct_9fa48("109958") ? true : stryMutAct_9fa48("109957") ? descriptor[CALLBACK_FIELD.EXPORT_NAME] : (stryCov_9fa48("109957", "109958", "109959"), !descriptor[CALLBACK_FIELD.EXPORT_NAME])) {
      if (stryMutAct_9fa48("109960")) {
        {}
      } else {
        stryCov_9fa48("109960");
        errors.push(CALLBACK_ERROR_MSG.EXPORT_NAME_REQUIRED);
      }
    }
    return stryMutAct_9fa48("109961") ? {} : (stryCov_9fa48("109961"), {
      valid: stryMutAct_9fa48("109964") ? errors.length !== NUM.ZERO : stryMutAct_9fa48("109963") ? false : stryMutAct_9fa48("109962") ? true : (stryCov_9fa48("109962", "109963", "109964"), errors.length === NUM.ZERO),
      errors
    });
  }
}

/**
 * Validate that a resolved WASM export matches the required
 * async callback signature contract.
 *
 * The export must be:
 * - A function (typeof === 'function')
 * - Async (constructor.name === 'AsyncFunction' or returns
 *   a thenable when probed)
 * - Accept 2-3 parameters (context, partitionBatch[, options])
 *
 * Requirement 4.3: Support asynchronous WASM entry exports.
 * Requirement 4.5: Validate callback signatures and reject
 *   incompatible entry exports before execution.
 *
 * @param {*} exportFn - The resolved export from the module.
 * @param {string} exportName - Name of the export (for errors).
 * @return {{valid: boolean, errors: string[]}} Validation result.
 */
function validateCallbackSignature(exportFn, _exportName) {
  if (stryMutAct_9fa48("109965")) {
    {}
  } else {
    stryCov_9fa48("109965");
    const errors = stryMutAct_9fa48("109966") ? ["Stryker was here"] : (stryCov_9fa48("109966"), []);
    if (stryMutAct_9fa48("109969") ? exportFn === undefined && exportFn === null : stryMutAct_9fa48("109968") ? false : stryMutAct_9fa48("109967") ? true : (stryCov_9fa48("109967", "109968", "109969"), (stryMutAct_9fa48("109971") ? exportFn !== undefined : stryMutAct_9fa48("109970") ? false : (stryCov_9fa48("109970", "109971"), exportFn === undefined)) || (stryMutAct_9fa48("109973") ? exportFn !== null : stryMutAct_9fa48("109972") ? false : (stryCov_9fa48("109972", "109973"), exportFn === null)))) {
      if (stryMutAct_9fa48("109974")) {
        {}
      } else {
        stryCov_9fa48("109974");
        errors.push(CALLBACK_ERROR_MSG.EXPORT_NOT_FOUND);
        return stryMutAct_9fa48("109975") ? {} : (stryCov_9fa48("109975"), {
          valid: stryMutAct_9fa48("109976") ? true : (stryCov_9fa48("109976"), false),
          errors
        });
      }
    }
    if (stryMutAct_9fa48("109979") ? typeof exportFn === TYPEOF.FUNCTION : stryMutAct_9fa48("109978") ? false : stryMutAct_9fa48("109977") ? true : (stryCov_9fa48("109977", "109978", "109979"), typeof exportFn !== TYPEOF.FUNCTION)) {
      if (stryMutAct_9fa48("109980")) {
        {}
      } else {
        stryCov_9fa48("109980");
        errors.push(CALLBACK_ERROR_MSG.EXPORT_NOT_FUNCTION);
        return stryMutAct_9fa48("109981") ? {} : (stryCov_9fa48("109981"), {
          valid: stryMutAct_9fa48("109982") ? true : (stryCov_9fa48("109982"), false),
          errors
        });
      }
    }
    if (stryMutAct_9fa48("109985") ? false : stryMutAct_9fa48("109984") ? true : stryMutAct_9fa48("109983") ? isAsyncFunction(exportFn) : (stryCov_9fa48("109983", "109984", "109985"), !isAsyncFunction(exportFn))) {
      if (stryMutAct_9fa48("109986")) {
        {}
      } else {
        stryCov_9fa48("109986");
        errors.push(CALLBACK_ERROR_MSG.EXPORT_NOT_ASYNC);
      }
    }
    const paramCount = exportFn.length;
    if (stryMutAct_9fa48("109990") ? paramCount >= CALLBACK_MIN_PARAMS : stryMutAct_9fa48("109989") ? paramCount <= CALLBACK_MIN_PARAMS : stryMutAct_9fa48("109988") ? false : stryMutAct_9fa48("109987") ? true : (stryCov_9fa48("109987", "109988", "109989", "109990"), paramCount < CALLBACK_MIN_PARAMS)) {
      if (stryMutAct_9fa48("109991")) {
        {}
      } else {
        stryCov_9fa48("109991");
        errors.push(CALLBACK_ERROR_MSG.PARAM_COUNT_TOO_FEW);
      }
    }
    if (stryMutAct_9fa48("109995") ? paramCount <= CALLBACK_MAX_PARAMS : stryMutAct_9fa48("109994") ? paramCount >= CALLBACK_MAX_PARAMS : stryMutAct_9fa48("109993") ? false : stryMutAct_9fa48("109992") ? true : (stryCov_9fa48("109992", "109993", "109994", "109995"), paramCount > CALLBACK_MAX_PARAMS)) {
      if (stryMutAct_9fa48("109996")) {
        {}
      } else {
        stryCov_9fa48("109996");
        errors.push(CALLBACK_ERROR_MSG.PARAM_COUNT_TOO_MANY);
      }
    }
    return stryMutAct_9fa48("109997") ? {} : (stryCov_9fa48("109997"), {
      valid: stryMutAct_9fa48("110000") ? errors.length !== NUM.ZERO : stryMutAct_9fa48("109999") ? false : stryMutAct_9fa48("109998") ? true : (stryCov_9fa48("109998", "109999", "110000"), errors.length === NUM.ZERO),
      errors
    });
  }
}

/**
 * Validate that the callback export matches the manifest's
 * declared run_export field.
 *
 * Requirement 7.3: Before activation, validate that run_export
 * exists in the module and matches the required execution
 * signature.
 *
 * @param {string} exportName - The export name being invoked.
 * @param {Object} manifest - Module manifest object.
 * @param {string} manifest.runExport - Declared run_export.
 * @param {string[]} manifest.exports - Declared exports list.
 * @return {{valid: boolean, errors: string[]}} Validation result.
 */
function validateCallbackAgainstManifest(exportName, manifest) {
  if (stryMutAct_9fa48("110001")) {
    {}
  } else {
    stryCov_9fa48("110001");
    const errors = stryMutAct_9fa48("110002") ? ["Stryker was here"] : (stryCov_9fa48("110002"), []);
    if (stryMutAct_9fa48("110005") ? false : stryMutAct_9fa48("110004") ? true : stryMutAct_9fa48("110003") ? manifest : (stryCov_9fa48("110003", "110004", "110005"), !manifest)) {
      if (stryMutAct_9fa48("110006")) {
        {}
      } else {
        stryCov_9fa48("110006");
        errors.push(CALLBACK_ERROR_MSG.MANIFEST_REQUIRED);
        return stryMutAct_9fa48("110007") ? {} : (stryCov_9fa48("110007"), {
          valid: stryMutAct_9fa48("110008") ? true : (stryCov_9fa48("110008"), false),
          errors
        });
      }
    }
    const declaredExports = stryMutAct_9fa48("110011") ? manifest.exports && [] : stryMutAct_9fa48("110010") ? false : stryMutAct_9fa48("110009") ? true : (stryCov_9fa48("110009", "110010", "110011"), manifest.exports || (stryMutAct_9fa48("110012") ? ["Stryker was here"] : (stryCov_9fa48("110012"), [])));
    if (stryMutAct_9fa48("110015") ? false : stryMutAct_9fa48("110014") ? true : stryMutAct_9fa48("110013") ? declaredExports.includes(exportName) : (stryCov_9fa48("110013", "110014", "110015"), !declaredExports.includes(exportName))) {
      if (stryMutAct_9fa48("110016")) {
        {}
      } else {
        stryCov_9fa48("110016");
        errors.push(CALLBACK_ERROR_MSG.EXPORT_NOT_FOUND);
      }
    }
    if (stryMutAct_9fa48("110019") ? manifest.runExport || manifest.runExport !== exportName : stryMutAct_9fa48("110018") ? false : stryMutAct_9fa48("110017") ? true : (stryCov_9fa48("110017", "110018", "110019"), manifest.runExport && (stryMutAct_9fa48("110021") ? manifest.runExport === exportName : stryMutAct_9fa48("110020") ? true : (stryCov_9fa48("110020", "110021"), manifest.runExport !== exportName)))) {
      if (stryMutAct_9fa48("110022")) {
        {}
      } else {
        stryCov_9fa48("110022");
        errors.push(CALLBACK_ERROR_MSG.RUN_EXPORT_MISMATCH);
      }
    }
    return stryMutAct_9fa48("110023") ? {} : (stryCov_9fa48("110023"), {
      valid: stryMutAct_9fa48("110026") ? errors.length !== NUM.ZERO : stryMutAct_9fa48("110025") ? false : stryMutAct_9fa48("110024") ? true : (stryCov_9fa48("110024", "110025", "110026"), errors.length === NUM.ZERO),
      errors
    });
  }
}

/**
 * Full validation pipeline: descriptor + manifest + signature.
 *
 * Runs all three validation stages and aggregates errors.
 *
 * @param {Object} descriptor - Callback descriptor with
 *   moduleRef and exportName.
 * @param {Object} manifest - Module manifest object.
 * @param {*} exportFn - The resolved export function.
 * @return {{valid: boolean, errors: string[]}} Combined result.
 */
function validateCallback(descriptor, manifest, exportFn) {
  if (stryMutAct_9fa48("110027")) {
    {}
  } else {
    stryCov_9fa48("110027");
    const allErrors = stryMutAct_9fa48("110028") ? ["Stryker was here"] : (stryCov_9fa48("110028"), []);
    const descResult = validateCallbackDescriptor(descriptor);
    allErrors.push(...descResult.errors);
    if (stryMutAct_9fa48("110031") ? false : stryMutAct_9fa48("110030") ? true : stryMutAct_9fa48("110029") ? descResult.valid : (stryCov_9fa48("110029", "110030", "110031"), !descResult.valid)) {
      if (stryMutAct_9fa48("110032")) {
        {}
      } else {
        stryCov_9fa48("110032");
        return stryMutAct_9fa48("110033") ? {} : (stryCov_9fa48("110033"), {
          valid: stryMutAct_9fa48("110034") ? true : (stryCov_9fa48("110034"), false),
          errors: allErrors
        });
      }
    }
    const manifestResult = validateCallbackAgainstManifest(descriptor[CALLBACK_FIELD.EXPORT_NAME], manifest);
    allErrors.push(...manifestResult.errors);
    const sigResult = validateCallbackSignature(exportFn, descriptor[CALLBACK_FIELD.EXPORT_NAME]);
    allErrors.push(...sigResult.errors);
    return stryMutAct_9fa48("110035") ? {} : (stryCov_9fa48("110035"), {
      valid: stryMutAct_9fa48("110038") ? allErrors.length !== NUM.ZERO : stryMutAct_9fa48("110037") ? false : stryMutAct_9fa48("110036") ? true : (stryCov_9fa48("110036", "110037", "110038"), allErrors.length === NUM.ZERO),
      errors: allErrors
    });
  }
}

/**
 * Check whether a function is async.
 *
 * Detects AsyncFunction constructor name. This works for
 * native async functions and async arrow functions.
 *
 * @param {Function} fn - Function to check.
 * @return {boolean} True if fn is an async function.
 */
function isAsyncFunction(fn) {
  if (stryMutAct_9fa48("110039")) {
    {}
  } else {
    stryCov_9fa48("110039");
    if (stryMutAct_9fa48("110042") ? typeof fn === TYPEOF.FUNCTION : stryMutAct_9fa48("110041") ? false : stryMutAct_9fa48("110040") ? true : (stryCov_9fa48("110040", "110041", "110042"), typeof fn !== TYPEOF.FUNCTION)) return stryMutAct_9fa48("110043") ? true : (stryCov_9fa48("110043"), false);
    return stryMutAct_9fa48("110046") ? fn.constructor.name !== 'AsyncFunction' : stryMutAct_9fa48("110045") ? false : stryMutAct_9fa48("110044") ? true : (stryCov_9fa48("110044", "110045", "110046"), fn.constructor.name === (stryMutAct_9fa48("110047") ? "" : (stryCov_9fa48("110047"), 'AsyncFunction')));
  }
}
export { validateCallbackDescriptor, validateCallbackSignature, validateCallbackAgainstManifest, validateCallback, isAsyncFunction };