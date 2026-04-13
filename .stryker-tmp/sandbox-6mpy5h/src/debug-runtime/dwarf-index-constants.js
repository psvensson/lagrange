/**
 * Constants for DWARF parsing, indexing, and cache behavior.
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
const DWARF_INDEX_DEFAULT = Object.freeze(stryMutAct_9fa48("77472") ? {} : (stryCov_9fa48("77472"), {
  CACHE_MAX_ENTRIES: 64,
  LINE_COLUMN_ZERO: 0,
  INLINE_FRAME_INDEX_ZERO: 0,
  MAX_MAPPED_LINES_PER_SOURCE: 5000
}));
const DWARF_INDEX_VALUE = Object.freeze(stryMutAct_9fa48("77473") ? {} : (stryCov_9fa48("77473"), {
  CACHE_POLICY_LRU: stryMutAct_9fa48("77474") ? "" : (stryCov_9fa48("77474"), 'lru'),
  WASM_VALUE_I32: stryMutAct_9fa48("77475") ? "" : (stryCov_9fa48("77475"), 'i32'),
  MODULE_CACHE_KEY_SEPARATOR: stryMutAct_9fa48("77476") ? "" : (stryCov_9fa48("77476"), '::')
}));
const DWARF_INDEX_ERROR_MSG = Object.freeze(stryMutAct_9fa48("77477") ? {} : (stryCov_9fa48("77477"), {
  REQUEST_REQUIRED: stryMutAct_9fa48("77478") ? "" : (stryCov_9fa48("77478"), 'DWARF request is required'),
  MODULE_REF_REQUIRED: stryMutAct_9fa48("77479") ? "" : (stryCov_9fa48("77479"), 'DWARF request requires non-empty moduleRef'),
  MODULE_DIGEST_REQUIRED: stryMutAct_9fa48("77480") ? "" : (stryCov_9fa48("77480"), 'DWARF request requires non-empty moduleDigest'),
  WASM_BYTES_REQUIRED: stryMutAct_9fa48("77481") ? "" : (stryCov_9fa48("77481"), 'DWARF request requires wasmBytes as Buffer, Uint8Array, or ArrayBuffer'),
  MODULE_URL_REQUIRED: stryMutAct_9fa48("77482") ? "" : (stryCov_9fa48("77482"), 'DWARF request requires non-empty moduleUrl'),
  PARSER_RESPONSE_INVALID: stryMutAct_9fa48("77483") ? "" : (stryCov_9fa48("77483"), 'DWARF parser returned invalid response for addRawModule'),
  PARSER_MISSING_SYMBOLS: stryMutAct_9fa48("77484") ? "" : (stryCov_9fa48("77484"), 'DWARF parser reported missing symbol files'),
  PARSE_RESULT_REQUIRED: stryMutAct_9fa48("77485") ? "" : (stryCov_9fa48("77485"), 'DWARF parse result is required'),
  SOURCE_MAPPINGS_REQUIRED: stryMutAct_9fa48("77486") ? "" : (stryCov_9fa48("77486"), 'DWARF parse result sourceMappings must be an array'),
  SYMBOL_MAPPINGS_REQUIRED: stryMutAct_9fa48("77487") ? "" : (stryCov_9fa48("77487"), 'DWARF parse result symbolMappings must be an array'),
  SOURCE_FILE_URL_REQUIRED: stryMutAct_9fa48("77488") ? "" : (stryCov_9fa48("77488"), 'DWARF source file URL must be a non-empty string'),
  LINE_NUMBER_REQUIRED: stryMutAct_9fa48("77489") ? "" : (stryCov_9fa48("77489"), 'DWARF lineNumber must be a non-negative integer'),
  CODE_OFFSET_REQUIRED: stryMutAct_9fa48("77490") ? "" : (stryCov_9fa48("77490"), 'DWARF codeOffset must be a non-negative integer'),
  CACHE_KEY_REQUIRED: stryMutAct_9fa48("77491") ? "" : (stryCov_9fa48("77491"), 'DWARF cache key must be a non-empty string'),
  CACHE_MAX_ENTRIES_INVALID: stryMutAct_9fa48("77492") ? "" : (stryCov_9fa48("77492"), 'DWARF cache maxEntries must be a positive integer'),
  CREATE_FN_REQUIRED: stryMutAct_9fa48("77493") ? "" : (stryCov_9fa48("77493"), 'DWARF cache createFn must be a function'),
  INDEX_REQUIRED: stryMutAct_9fa48("77494") ? "" : (stryCov_9fa48("77494"), 'DWARF index is required')
}));
const DWARF_INDEX_FIELD = Object.freeze(stryMutAct_9fa48("77495") ? {} : (stryCov_9fa48("77495"), {
  FRAMES: stryMutAct_9fa48("77496") ? "" : (stryCov_9fa48("77496"), 'frames'),
  MISSING_SYMBOL_FILES: stryMutAct_9fa48("77497") ? "" : (stryCov_9fa48("77497"), 'missingSymbolFiles'),
  NAME: stryMutAct_9fa48("77498") ? "" : (stryCov_9fa48("77498"), 'name')
}));
export { DWARF_INDEX_DEFAULT, DWARF_INDEX_VALUE, DWARF_INDEX_ERROR_MSG, DWARF_INDEX_FIELD };