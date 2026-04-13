/**
 * PostgreSQL function name translation registry.
 * Maps PG function names to translator functions that produce
 * SQLite-compatible Internal_AST nodes.
 * Requirements: 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3
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
import { EXPR_TYPE } from '../parser-constants.js';
import { PG_EXPR_TYPE, PG_EXTRACT_FORMAT, PG_DATE_TRUNC_FORMAT, PG_TRANSLATE_ERROR } from './pg-compat-constants.js';

/**
 * Literal value for the 'now' argument used in datetime/date/time functions.
 */
const NOW_LITERAL = stryMutAct_9fa48("114023") ? "" : (stryCov_9fa48("114023"), 'now');

/**
 * SQLite affinity for integer cast results.
 */
const SQLITE_AFFINITY_INTEGER = stryMutAct_9fa48("114024") ? "" : (stryCov_9fa48("114024"), 'INTEGER');

/**
 * SQLite function names used in translations.
 */
const SQLITE_FN = Object.freeze(stryMutAct_9fa48("114025") ? {} : (stryCov_9fa48("114025"), {
  DATETIME: stryMutAct_9fa48("114026") ? "" : (stryCov_9fa48("114026"), 'datetime'),
  DATE: stryMutAct_9fa48("114027") ? "" : (stryCov_9fa48("114027"), 'date'),
  TIME: stryMutAct_9fa48("114028") ? "" : (stryCov_9fa48("114028"), 'time'),
  STRFTIME: stryMutAct_9fa48("114029") ? "" : (stryCov_9fa48("114029"), 'strftime'),
  SUBSTR: stryMutAct_9fa48("114030") ? "" : (stryCov_9fa48("114030"), 'substr')
}));

/**
 * Binary operator for string concatenation.
 */
const CONCAT_OPERATOR = stryMutAct_9fa48("114031") ? "" : (stryCov_9fa48("114031"), '||');

/**
 * Creates a literal AST node with the given string value.
 * @param {string} value - The literal string value.
 * @returns {Object} Internal_AST literal node.
 */
function makeLiteral(value) {
  if (stryMutAct_9fa48("114032")) {
    {}
  } else {
    stryCov_9fa48("114032");
    return stryMutAct_9fa48("114033") ? {} : (stryCov_9fa48("114033"), {
      type: EXPR_TYPE.LITERAL,
      value
    });
  }
}

/**
 * Creates a function_call AST node.
 * @param {string} name - SQLite function name.
 * @param {Object[]} args - Translated argument AST nodes.
 * @returns {Object} Internal_AST function_call node.
 */
function makeFunctionCall(name, args) {
  if (stryMutAct_9fa48("114034")) {
    {}
  } else {
    stryCov_9fa48("114034");
    return stryMutAct_9fa48("114035") ? {} : (stryCov_9fa48("114035"), {
      type: PG_EXPR_TYPE.FUNCTION_CALL,
      name,
      args
    });
  }
}

/**
 * Translates CONCAT(a, b, ...) to a binary expression chain: ((a || b) || c).
 * @param {Object[]} args - Raw PG AST argument nodes.
 * @param {Function} convertExprFn - Callback to convert each argument.
 * @returns {Object} Internal_AST binary expression chain with || operator.
 */
function translateConcat(args, convertExprFn) {
  if (stryMutAct_9fa48("114036")) {
    {}
  } else {
    stryCov_9fa48("114036");
    const converted = args.map(convertExprFn);
    return converted.reduce(stryMutAct_9fa48("114037") ? () => undefined : (stryCov_9fa48("114037"), (left, right) => stryMutAct_9fa48("114038") ? {} : (stryCov_9fa48("114038"), {
      type: EXPR_TYPE.BINARY,
      operator: CONCAT_OPERATOR,
      left,
      right
    })));
  }
}

/**
 * Translates SUBSTRING(str, start, len) to SUBSTR(str, start, len).
 * @param {Object[]} args - Raw PG AST argument nodes.
 * @param {Function} convertExprFn - Callback to convert each argument.
 * @returns {Object} Internal_AST function_call node for substr.
 */
function translateSubstring(args, convertExprFn) {
  if (stryMutAct_9fa48("114039")) {
    {}
  } else {
    stryCov_9fa48("114039");
    const converted = args.map(convertExprFn);
    return makeFunctionCall(SQLITE_FN.SUBSTR, converted);
  }
}

/**
 * Translates NOW() / CURRENT_TIMESTAMP to datetime('now').
 * @returns {Object} Internal_AST function_call node for datetime('now').
 */
function translateNow() {
  if (stryMutAct_9fa48("114040")) {
    {}
  } else {
    stryCov_9fa48("114040");
    return makeFunctionCall(SQLITE_FN.DATETIME, stryMutAct_9fa48("114041") ? [] : (stryCov_9fa48("114041"), [makeLiteral(NOW_LITERAL)]));
  }
}

/**
 * Translates CURRENT_DATE to date('now').
 * @returns {Object} Internal_AST function_call node for date('now').
 */
function translateCurrentDate() {
  if (stryMutAct_9fa48("114042")) {
    {}
  } else {
    stryCov_9fa48("114042");
    return makeFunctionCall(SQLITE_FN.DATE, stryMutAct_9fa48("114043") ? [] : (stryCov_9fa48("114043"), [makeLiteral(NOW_LITERAL)]));
  }
}

/**
 * Translates CURRENT_TIME to time('now').
 * @returns {Object} Internal_AST function_call node for time('now').
 */
function translateCurrentTime() {
  if (stryMutAct_9fa48("114044")) {
    {}
  } else {
    stryCov_9fa48("114044");
    return makeFunctionCall(SQLITE_FN.TIME, stryMutAct_9fa48("114045") ? [] : (stryCov_9fa48("114045"), [makeLiteral(NOW_LITERAL)]));
  }
}

/**
 * Translates EXTRACT(field FROM expr) to CAST(strftime(format, expr) AS INTEGER).
 * @param {Object[]} args - args[0] is the field name node, args[1] is the expression.
 * @param {Function} convertExprFn - Callback to convert the expression argument.
 * @returns {Object} Internal_AST CAST node wrapping a strftime function_call.
 * @throws {Error} If the extract field is not supported.
 */
function translateExtract(args, convertExprFn) {
  if (stryMutAct_9fa48("114046")) {
    {}
  } else {
    stryCov_9fa48("114046");
    const field = stryMutAct_9fa48("114047") ? (args[0].value || args[0]).toString().toUpperCase() : (stryCov_9fa48("114047"), (stryMutAct_9fa48("114050") ? args[0].value && args[0] : stryMutAct_9fa48("114049") ? false : stryMutAct_9fa48("114048") ? true : (stryCov_9fa48("114048", "114049", "114050"), args[0].value || args[0])).toString().toLowerCase());
    const format = PG_EXTRACT_FORMAT[field];
    if (stryMutAct_9fa48("114053") ? false : stryMutAct_9fa48("114052") ? true : stryMutAct_9fa48("114051") ? format : (stryCov_9fa48("114051", "114052", "114053"), !format)) {
      if (stryMutAct_9fa48("114054")) {
        {}
      } else {
        stryCov_9fa48("114054");
        throw new Error(stryMutAct_9fa48("114055") ? PG_TRANSLATE_ERROR.UNSUPPORTED_EXTRACT_FIELD - field : (stryCov_9fa48("114055"), PG_TRANSLATE_ERROR.UNSUPPORTED_EXTRACT_FIELD + field));
      }
    }
    const expr = convertExprFn(args[1]);
    const strftimeCall = makeFunctionCall(SQLITE_FN.STRFTIME, stryMutAct_9fa48("114056") ? [] : (stryCov_9fa48("114056"), [makeLiteral(format), expr]));
    return stryMutAct_9fa48("114057") ? {} : (stryCov_9fa48("114057"), {
      type: PG_EXPR_TYPE.CAST,
      expression: strftimeCall,
      affinity: SQLITE_AFFINITY_INTEGER
    });
  }
}

/**
 * Translates DATE_TRUNC(precision, expr) to strftime(format, expr).
 * @param {Object[]} args - args[0] is the precision node, args[1] is the expression.
 * @param {Function} convertExprFn - Callback to convert the expression argument.
 * @returns {Object} Internal_AST function_call node for strftime.
 * @throws {Error} If the date_trunc precision is not supported.
 */
function translateDateTrunc(args, convertExprFn) {
  if (stryMutAct_9fa48("114058")) {
    {}
  } else {
    stryCov_9fa48("114058");
    const precision = stryMutAct_9fa48("114059") ? (args[0].value || args[0]).toString().toUpperCase() : (stryCov_9fa48("114059"), (stryMutAct_9fa48("114062") ? args[0].value && args[0] : stryMutAct_9fa48("114061") ? false : stryMutAct_9fa48("114060") ? true : (stryCov_9fa48("114060", "114061", "114062"), args[0].value || args[0])).toString().toLowerCase());
    const format = PG_DATE_TRUNC_FORMAT[precision];
    if (stryMutAct_9fa48("114065") ? false : stryMutAct_9fa48("114064") ? true : stryMutAct_9fa48("114063") ? format : (stryCov_9fa48("114063", "114064", "114065"), !format)) {
      if (stryMutAct_9fa48("114066")) {
        {}
      } else {
        stryCov_9fa48("114066");
        throw new Error(stryMutAct_9fa48("114067") ? PG_TRANSLATE_ERROR.UNSUPPORTED_DATE_TRUNC_FIELD - precision : (stryCov_9fa48("114067"), PG_TRANSLATE_ERROR.UNSUPPORTED_DATE_TRUNC_FIELD + precision));
      }
    }
    const expr = convertExprFn(args[1]);
    return makeFunctionCall(SQLITE_FN.STRFTIME, stryMutAct_9fa48("114068") ? [] : (stryCov_9fa48("114068"), [makeLiteral(format), expr]));
  }
}

/**
 * Pass-through translator: preserves the function name and converts args.
 * @param {Object[]} args - Raw PG AST argument nodes.
 * @param {Function} convertExprFn - Callback to convert each argument.
 * @param {string} name - Original function name.
 * @returns {Object} Internal_AST function_call node with original name.
 */
function passThrough(args, convertExprFn, name) {
  if (stryMutAct_9fa48("114069")) {
    {}
  } else {
    stryCov_9fa48("114069");
    const converted = args.map(convertExprFn);
    return makeFunctionCall(name, converted);
  }
}

/**
 * Registry mapping PG function names (lowercased) to translator functions.
 * Each translator has signature: (args, convertExprFn, name) => ASTNode.
 */
const PG_FUNCTION_MAP = new Map(stryMutAct_9fa48("114070") ? [] : (stryCov_9fa48("114070"), [stryMutAct_9fa48("114071") ? [] : (stryCov_9fa48("114071"), [stryMutAct_9fa48("114072") ? "" : (stryCov_9fa48("114072"), 'concat'), translateConcat]), stryMutAct_9fa48("114073") ? [] : (stryCov_9fa48("114073"), [stryMutAct_9fa48("114074") ? "" : (stryCov_9fa48("114074"), 'substring'), translateSubstring]), stryMutAct_9fa48("114075") ? [] : (stryCov_9fa48("114075"), [stryMutAct_9fa48("114076") ? "" : (stryCov_9fa48("114076"), 'now'), translateNow]), stryMutAct_9fa48("114077") ? [] : (stryCov_9fa48("114077"), [stryMutAct_9fa48("114078") ? "" : (stryCov_9fa48("114078"), 'current_timestamp'), translateNow]), stryMutAct_9fa48("114079") ? [] : (stryCov_9fa48("114079"), [stryMutAct_9fa48("114080") ? "" : (stryCov_9fa48("114080"), 'current_date'), translateCurrentDate]), stryMutAct_9fa48("114081") ? [] : (stryCov_9fa48("114081"), [stryMutAct_9fa48("114082") ? "" : (stryCov_9fa48("114082"), 'current_time'), translateCurrentTime]), stryMutAct_9fa48("114083") ? [] : (stryCov_9fa48("114083"), [stryMutAct_9fa48("114084") ? "" : (stryCov_9fa48("114084"), 'extract'), translateExtract]), stryMutAct_9fa48("114085") ? [] : (stryCov_9fa48("114085"), [stryMutAct_9fa48("114086") ? "" : (stryCov_9fa48("114086"), 'date_trunc'), translateDateTrunc]), stryMutAct_9fa48("114087") ? [] : (stryCov_9fa48("114087"), [stryMutAct_9fa48("114088") ? "" : (stryCov_9fa48("114088"), 'length'), passThrough]), stryMutAct_9fa48("114089") ? [] : (stryCov_9fa48("114089"), [stryMutAct_9fa48("114090") ? "" : (stryCov_9fa48("114090"), 'lower'), passThrough]), stryMutAct_9fa48("114091") ? [] : (stryCov_9fa48("114091"), [stryMutAct_9fa48("114092") ? "" : (stryCov_9fa48("114092"), 'upper'), passThrough]), stryMutAct_9fa48("114093") ? [] : (stryCov_9fa48("114093"), [stryMutAct_9fa48("114094") ? "" : (stryCov_9fa48("114094"), 'trim'), passThrough]), stryMutAct_9fa48("114095") ? [] : (stryCov_9fa48("114095"), [stryMutAct_9fa48("114096") ? "" : (stryCov_9fa48("114096"), 'coalesce'), passThrough]), stryMutAct_9fa48("114097") ? [] : (stryCov_9fa48("114097"), [stryMutAct_9fa48("114098") ? "" : (stryCov_9fa48("114098"), 'nullif'), passThrough]), stryMutAct_9fa48("114099") ? [] : (stryCov_9fa48("114099"), [stryMutAct_9fa48("114100") ? "" : (stryCov_9fa48("114100"), 'substr'), passThrough])]));

/**
 * Main entry point: translates a PG function call to a SQLite-compatible
 * AST node using the function registry.
 * If the function is not in the registry, passes it through unchanged.
 * @param {string} name - PG function name (case-insensitive).
 * @param {Object[]} args - Raw PG AST argument nodes.
 * @param {Function} convertExprFn - Callback to convert each argument.
 * @returns {Object} Internal_AST node (function_call, binary, or cast).
 */
function translateFunctionCall(name, args, convertExprFn) {
  if (stryMutAct_9fa48("114101")) {
    {}
  } else {
    stryCov_9fa48("114101");
    const normalized = stryMutAct_9fa48("114102") ? name.toUpperCase() : (stryCov_9fa48("114102"), name.toLowerCase());
    const translator = PG_FUNCTION_MAP.get(normalized);
    if (stryMutAct_9fa48("114104") ? false : stryMutAct_9fa48("114103") ? true : (stryCov_9fa48("114103", "114104"), translator)) {
      if (stryMutAct_9fa48("114105")) {
        {}
      } else {
        stryCov_9fa48("114105");
        return translator(args, convertExprFn, normalized);
      }
    }
    // Unknown function: pass through with original name and converted args
    const converted = args.map(convertExprFn);
    return makeFunctionCall(name, converted);
  }
}
export { translateFunctionCall, PG_FUNCTION_MAP };