/**
 * Callback module artifact helpers.
 *
 * Encodes/decodes JS callback source into a wasm_component-compatible
 * artifact payload used by the examples pipeline and runtime loader.
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
import { TYPEOF } from '../../constants/index.js';
const ARTIFACT_FORMAT = Object.freeze(stryMutAct_9fa48("109547") ? {} : (stryCov_9fa48("109547"), {
  JS_WASM_COMPONENT_V1: stryMutAct_9fa48("109548") ? "" : (stryCov_9fa48("109548"), 'js_wasm_component_v1')
}));
const ARTIFACT_FIELD = Object.freeze(stryMutAct_9fa48("109549") ? {} : (stryCov_9fa48("109549"), {
  FORMAT: stryMutAct_9fa48("109550") ? "" : (stryCov_9fa48("109550"), 'format'),
  SOURCE: stryMutAct_9fa48("109551") ? "" : (stryCov_9fa48("109551"), 'source'),
  WASM_BYTES_BASE64: stryMutAct_9fa48("109552") ? "" : (stryCov_9fa48("109552"), 'wasmBytesBase64'),
  RUN_EXPORT: stryMutAct_9fa48("109553") ? "" : (stryCov_9fa48("109553"), 'runExport'),
  EXPORTS: stryMutAct_9fa48("109554") ? "" : (stryCov_9fa48("109554"), 'exports')
}));
const ARTIFACT_ENCODING = Object.freeze(stryMutAct_9fa48("109555") ? {} : (stryCov_9fa48("109555"), {
  UTF8: stryMutAct_9fa48("109556") ? "" : (stryCov_9fa48("109556"), 'utf8'),
  BASE64: stryMutAct_9fa48("109557") ? "" : (stryCov_9fa48("109557"), 'base64')
}));
const LOG_JSON_PARSE_FAILED = stryMutAct_9fa48("109558") ? "" : (stryCov_9fa48("109558"), 'JSON.parse failed for code blob');
const CALLBACK_ARTIFACT_ERROR_MSG = Object.freeze(stryMutAct_9fa48("109559") ? {} : (stryCov_9fa48("109559"), {
  SOURCE_REQUIRED: stryMutAct_9fa48("109560") ? "" : (stryCov_9fa48("109560"), 'callback artifact source must be a non-empty string'),
  RUN_EXPORT_REQUIRED: stryMutAct_9fa48("109561") ? "" : (stryCov_9fa48("109561"), 'callback artifact runExport must be a non-empty string'),
  CODE_BLOB_REQUIRED: stryMutAct_9fa48("109562") ? "" : (stryCov_9fa48("109562"), 'callback artifact codeBlob must be a non-empty string')
}));

/**
 * Build a serialized js_wasm_component_v1 artifact payload.
 *
 * @param {string} source - Callback module source.
 * @param {string} runExport - Run export name.
 * @return {string} Serialized artifact JSON.
 */
function buildJsWasmComponentArtifact(source, runExport) {
  if (stryMutAct_9fa48("109563")) {
    {}
  } else {
    stryCov_9fa48("109563");
    if (stryMutAct_9fa48("109566") ? !source && typeof source !== TYPEOF.STRING : stryMutAct_9fa48("109565") ? false : stryMutAct_9fa48("109564") ? true : (stryCov_9fa48("109564", "109565", "109566"), (stryMutAct_9fa48("109567") ? source : (stryCov_9fa48("109567"), !source)) || (stryMutAct_9fa48("109569") ? typeof source === TYPEOF.STRING : stryMutAct_9fa48("109568") ? false : (stryCov_9fa48("109568", "109569"), typeof source !== TYPEOF.STRING)))) {
      if (stryMutAct_9fa48("109570")) {
        {}
      } else {
        stryCov_9fa48("109570");
        throw new Error(CALLBACK_ARTIFACT_ERROR_MSG.SOURCE_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("109573") ? !runExport && typeof runExport !== TYPEOF.STRING : stryMutAct_9fa48("109572") ? false : stryMutAct_9fa48("109571") ? true : (stryCov_9fa48("109571", "109572", "109573"), (stryMutAct_9fa48("109574") ? runExport : (stryCov_9fa48("109574"), !runExport)) || (stryMutAct_9fa48("109576") ? typeof runExport === TYPEOF.STRING : stryMutAct_9fa48("109575") ? false : (stryCov_9fa48("109575", "109576"), typeof runExport !== TYPEOF.STRING)))) {
      if (stryMutAct_9fa48("109577")) {
        {}
      } else {
        stryCov_9fa48("109577");
        throw new Error(CALLBACK_ARTIFACT_ERROR_MSG.RUN_EXPORT_REQUIRED);
      }
    }
    const wasmBytes = Buffer.from(source, ARTIFACT_ENCODING.UTF8);
    return JSON.stringify(stryMutAct_9fa48("109578") ? {} : (stryCov_9fa48("109578"), {
      [ARTIFACT_FIELD.FORMAT]: ARTIFACT_FORMAT.JS_WASM_COMPONENT_V1,
      [ARTIFACT_FIELD.SOURCE]: source,
      [ARTIFACT_FIELD.WASM_BYTES_BASE64]: wasmBytes.toString(ARTIFACT_ENCODING.BASE64),
      [ARTIFACT_FIELD.RUN_EXPORT]: runExport,
      [ARTIFACT_FIELD.EXPORTS]: stryMutAct_9fa48("109579") ? [] : (stryCov_9fa48("109579"), [runExport])
    }));
  }
}

/**
 * Parse a callback module artifact blob.
 *
 * If the blob is not a recognized artifact envelope, it is treated as raw
 * source text and converted to UTF-8 bytes.
 *
 * @param {string} codeBlob - Serialized artifact blob or raw source.
 * @return {{
 *   format: string|null,
 *   source: string,
 *   wasmBytes: Buffer,
 *   runExport: string|null,
 *   exports: string[]
 * }}
 */
function parseCallbackModuleArtifact(codeBlob) {
  if (stryMutAct_9fa48("109580")) {
    {}
  } else {
    stryCov_9fa48("109580");
    if (stryMutAct_9fa48("109583") ? !codeBlob && typeof codeBlob !== TYPEOF.STRING : stryMutAct_9fa48("109582") ? false : stryMutAct_9fa48("109581") ? true : (stryCov_9fa48("109581", "109582", "109583"), (stryMutAct_9fa48("109584") ? codeBlob : (stryCov_9fa48("109584"), !codeBlob)) || (stryMutAct_9fa48("109586") ? typeof codeBlob === TYPEOF.STRING : stryMutAct_9fa48("109585") ? false : (stryCov_9fa48("109585", "109586"), typeof codeBlob !== TYPEOF.STRING)))) {
      if (stryMutAct_9fa48("109587")) {
        {}
      } else {
        stryCov_9fa48("109587");
        throw new Error(CALLBACK_ARTIFACT_ERROR_MSG.CODE_BLOB_REQUIRED);
      }
    }
    let parsed = null;
    try {
      if (stryMutAct_9fa48("109588")) {
        {}
      } else {
        stryCov_9fa48("109588");
        parsed = JSON.parse(codeBlob);
      }
    } catch (parseErr) {
      if (stryMutAct_9fa48("109589")) {
        {}
      } else {
        stryCov_9fa48("109589");
        console.warn(LOG_JSON_PARSE_FAILED, parseErr.message);
        parsed = null;
      }
    }
    if (stryMutAct_9fa48("109592") ? parsed && typeof parsed === TYPEOF.OBJECT && parsed[ARTIFACT_FIELD.FORMAT] === ARTIFACT_FORMAT.JS_WASM_COMPONENT_V1 || typeof parsed[ARTIFACT_FIELD.SOURCE] === TYPEOF.STRING : stryMutAct_9fa48("109591") ? false : stryMutAct_9fa48("109590") ? true : (stryCov_9fa48("109590", "109591", "109592"), (stryMutAct_9fa48("109594") ? parsed && typeof parsed === TYPEOF.OBJECT || parsed[ARTIFACT_FIELD.FORMAT] === ARTIFACT_FORMAT.JS_WASM_COMPONENT_V1 : stryMutAct_9fa48("109593") ? true : (stryCov_9fa48("109593", "109594"), (stryMutAct_9fa48("109596") ? parsed || typeof parsed === TYPEOF.OBJECT : stryMutAct_9fa48("109595") ? true : (stryCov_9fa48("109595", "109596"), parsed && (stryMutAct_9fa48("109598") ? typeof parsed !== TYPEOF.OBJECT : stryMutAct_9fa48("109597") ? true : (stryCov_9fa48("109597", "109598"), typeof parsed === TYPEOF.OBJECT)))) && (stryMutAct_9fa48("109600") ? parsed[ARTIFACT_FIELD.FORMAT] !== ARTIFACT_FORMAT.JS_WASM_COMPONENT_V1 : stryMutAct_9fa48("109599") ? true : (stryCov_9fa48("109599", "109600"), parsed[ARTIFACT_FIELD.FORMAT] === ARTIFACT_FORMAT.JS_WASM_COMPONENT_V1)))) && (stryMutAct_9fa48("109602") ? typeof parsed[ARTIFACT_FIELD.SOURCE] !== TYPEOF.STRING : stryMutAct_9fa48("109601") ? true : (stryCov_9fa48("109601", "109602"), typeof parsed[ARTIFACT_FIELD.SOURCE] === TYPEOF.STRING)))) {
      if (stryMutAct_9fa48("109603")) {
        {}
      } else {
        stryCov_9fa48("109603");
        const source = parsed[ARTIFACT_FIELD.SOURCE];
        const wasmBytesBase64 = parsed[ARTIFACT_FIELD.WASM_BYTES_BASE64];
        const wasmBytes = (stryMutAct_9fa48("109606") ? typeof wasmBytesBase64 !== TYPEOF.STRING : stryMutAct_9fa48("109605") ? false : stryMutAct_9fa48("109604") ? true : (stryCov_9fa48("109604", "109605", "109606"), typeof wasmBytesBase64 === TYPEOF.STRING)) ? Buffer.from(wasmBytesBase64, ARTIFACT_ENCODING.BASE64) : Buffer.from(source, ARTIFACT_ENCODING.UTF8);
        const runExport = (stryMutAct_9fa48("109609") ? typeof parsed[ARTIFACT_FIELD.RUN_EXPORT] !== TYPEOF.STRING : stryMutAct_9fa48("109608") ? false : stryMutAct_9fa48("109607") ? true : (stryCov_9fa48("109607", "109608", "109609"), typeof parsed[ARTIFACT_FIELD.RUN_EXPORT] === TYPEOF.STRING)) ? parsed[ARTIFACT_FIELD.RUN_EXPORT] : null;
        const exports = Array.isArray(parsed[ARTIFACT_FIELD.EXPORTS]) ? stryMutAct_9fa48("109610") ? parsed[ARTIFACT_FIELD.EXPORTS] : (stryCov_9fa48("109610"), parsed[ARTIFACT_FIELD.EXPORTS].filter(stryMutAct_9fa48("109611") ? () => undefined : (stryCov_9fa48("109611"), entry => stryMutAct_9fa48("109614") ? typeof entry !== TYPEOF.STRING : stryMutAct_9fa48("109613") ? false : stryMutAct_9fa48("109612") ? true : (stryCov_9fa48("109612", "109613", "109614"), typeof entry === TYPEOF.STRING)))) : stryMutAct_9fa48("109615") ? ["Stryker was here"] : (stryCov_9fa48("109615"), []);
        return stryMutAct_9fa48("109616") ? {} : (stryCov_9fa48("109616"), {
          format: ARTIFACT_FORMAT.JS_WASM_COMPONENT_V1,
          source,
          wasmBytes,
          runExport,
          exports
        });
      }
    }
    return stryMutAct_9fa48("109617") ? {} : (stryCov_9fa48("109617"), {
      format: null,
      source: codeBlob,
      wasmBytes: Buffer.from(codeBlob, ARTIFACT_ENCODING.UTF8),
      runExport: null,
      exports: stryMutAct_9fa48("109618") ? ["Stryker was here"] : (stryCov_9fa48("109618"), [])
    });
  }
}
export { ARTIFACT_FORMAT, CALLBACK_ARTIFACT_ERROR_MSG, buildJsWasmComponentArtifact, parseCallbackModuleArtifact };