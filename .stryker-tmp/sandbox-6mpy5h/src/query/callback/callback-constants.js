/**
 * Constants for programmatic callback execution contract.
 *
 * Defines the runtime callback signature, validation rules,
 * and error messages for async WASM entry exports used by
 * DB.call(select, fn).
 *
 * Requirements: 4.3, 4.5, 7.3
 */
// @ts-nocheck


/**
 * Required parameter names for the callback signature.
 * Every valid WASM entry export must accept exactly these
 * parameters in order: (context, partitionBatch, options).
 * @enum {string}
 */function stryNS_9fa48() {
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
const CALLBACK_PARAM = Object.freeze(stryMutAct_9fa48("109204") ? {} : (stryCov_9fa48("109204"), {
  CONTEXT: stryMutAct_9fa48("109205") ? "" : (stryCov_9fa48("109205"), 'context'),
  PARTITION_BATCH: stryMutAct_9fa48("109206") ? "" : (stryCov_9fa48("109206"), 'partitionBatch'),
  OPTIONS: stryMutAct_9fa48("109207") ? "" : (stryCov_9fa48("109207"), 'options')
}));

/**
 * Ordered list of required callback parameter names.
 * @type {ReadonlyArray<string>}
 */
const CALLBACK_PARAM_ORDER = Object.freeze(stryMutAct_9fa48("109208") ? [] : (stryCov_9fa48("109208"), [CALLBACK_PARAM.CONTEXT, CALLBACK_PARAM.PARTITION_BATCH, CALLBACK_PARAM.OPTIONS]));

/**
 * Minimum number of required callback parameters.
 * The callback must accept at least context and partitionBatch.
 * @type {number}
 */
const CALLBACK_MIN_PARAMS = 2;

/**
 * Maximum number of callback parameters.
 * @type {number}
 */
const CALLBACK_MAX_PARAMS = 3;

/**
 * Field names used in callback descriptor objects.
 * @enum {string}
 */
const CALLBACK_FIELD = Object.freeze(stryMutAct_9fa48("109209") ? {} : (stryCov_9fa48("109209"), {
  MODULE_REF: stryMutAct_9fa48("109210") ? "" : (stryCov_9fa48("109210"), 'moduleRef'),
  EXPORT_NAME: stryMutAct_9fa48("109211") ? "" : (stryCov_9fa48("109211"), 'exportName'),
  IS_ASYNC: stryMutAct_9fa48("109212") ? "" : (stryCov_9fa48("109212"), 'isAsync'),
  PARAM_COUNT: stryMutAct_9fa48("109213") ? "" : (stryCov_9fa48("109213"), 'paramCount'),
  PARAMS: stryMutAct_9fa48("109214") ? "" : (stryCov_9fa48("109214"), 'params')
}));

/**
 * Error messages for callback validation failures.
 * @enum {string}
 */
const CALLBACK_ERROR_MSG = Object.freeze(stryMutAct_9fa48("109215") ? {} : (stryCov_9fa48("109215"), {
  EXPORT_NOT_FOUND: stryMutAct_9fa48("109216") ? "" : (stryCov_9fa48("109216"), 'Callback export not found in module exports'),
  EXPORT_NOT_FUNCTION: stryMutAct_9fa48("109217") ? "" : (stryCov_9fa48("109217"), 'Callback export must be a function'),
  EXPORT_NOT_ASYNC: stryMutAct_9fa48("109218") ? "" : (stryCov_9fa48("109218"), 'Callback export must be an async function'),
  PARAM_COUNT_TOO_FEW: stryMutAct_9fa48("109219") ? "" : (stryCov_9fa48("109219"), 'Callback must accept at least context and partitionBatch'),
  PARAM_COUNT_TOO_MANY: stryMutAct_9fa48("109220") ? "" : (stryCov_9fa48("109220"), 'Callback accepts too many parameters (max 3)'),
  MODULE_REF_REQUIRED: stryMutAct_9fa48("109221") ? "" : (stryCov_9fa48("109221"), 'Module reference is required for callback validation'),
  EXPORT_NAME_REQUIRED: stryMutAct_9fa48("109222") ? "" : (stryCov_9fa48("109222"), 'Export name is required for callback validation'),
  MANIFEST_REQUIRED: stryMutAct_9fa48("109223") ? "" : (stryCov_9fa48("109223"), 'Module manifest is required for callback validation'),
  RUN_EXPORT_MISMATCH: stryMutAct_9fa48("109224") ? "" : (stryCov_9fa48("109224"), 'Callback export does not match manifest run_export'),
  SIGNATURE_INVALID: stryMutAct_9fa48("109225") ? "" : (stryCov_9fa48("109225"), 'Callback signature does not match required contract')
}));

/**
 * Log messages for callback validation events.
 * @enum {string}
 */
const CALLBACK_LOG_MSG = Object.freeze(stryMutAct_9fa48("109226") ? {} : (stryCov_9fa48("109226"), {
  VALIDATION_PASSED: stryMutAct_9fa48("109227") ? "" : (stryCov_9fa48("109227"), 'Callback export validation passed'),
  VALIDATION_FAILED: stryMutAct_9fa48("109228") ? "" : (stryCov_9fa48("109228"), 'Callback export validation failed'),
  SIGNATURE_CHECKED: stryMutAct_9fa48("109229") ? "" : (stryCov_9fa48("109229"), 'Callback signature checked')
}));
export { CALLBACK_PARAM, CALLBACK_PARAM_ORDER, CALLBACK_MIN_PARAMS, CALLBACK_MAX_PARAMS, CALLBACK_FIELD, CALLBACK_ERROR_MSG, CALLBACK_LOG_MSG };