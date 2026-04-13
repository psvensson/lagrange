/**
 * Package reference parser, formatter, and validator.
 *
 * Handles canonical component package identity: namespace:name@version
 *
 * Requirements: 3.1, 3.4
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
import { PACKAGE_ID_PATTERN, PACKAGE_ID_SEPARATOR, PACKAGE_VERSION_SEPARATOR, PACKAGE_ID_MAX_LENGTH } from '../constants/wasm-meta.js';
import { NAMESPACE_PATTERN, PACKAGE_NAME_PATTERN } from './wasm-meta-models-constants.js';

/**
 * Version format pattern: digit start, then digits, dots,
 * hyphens, plus signs, lowercase/uppercase alpha, 1-64 chars.
 * @type {RegExp}
 */
const VERSION_PATTERN = stryMutAct_9fa48("162446") ? /^[0-9][^0-9a-zA-Z.+-]{0,63}$/ : stryMutAct_9fa48("162445") ? /^[0-9][0-9a-zA-Z.+-]$/ : stryMutAct_9fa48("162444") ? /^[^0-9][0-9a-zA-Z.+-]{0,63}$/ : stryMutAct_9fa48("162443") ? /^[0-9][0-9a-zA-Z.+-]{0,63}/ : stryMutAct_9fa48("162442") ? /[0-9][0-9a-zA-Z.+-]{0,63}$/ : (stryCov_9fa48("162442", "162443", "162444", "162445", "162446"), /^[0-9][0-9a-zA-Z.+-]{0,63}$/);

// --- Error message constants ---

const PKG_REF_ERROR = Object.freeze(stryMutAct_9fa48("162447") ? {} : (stryCov_9fa48("162447"), {
  INPUT_REQUIRED: stryMutAct_9fa48("162448") ? "" : (stryCov_9fa48("162448"), 'Package reference is required'),
  INPUT_NOT_STRING: stryMutAct_9fa48("162449") ? "" : (stryCov_9fa48("162449"), 'Package reference must be a string'),
  MISSING_NAMESPACE_SEPARATOR: stryMutAct_9fa48("162450") ? "" : (stryCov_9fa48("162450"), 'Package reference must contain ":" separator'),
  MISSING_VERSION_SEPARATOR: stryMutAct_9fa48("162451") ? "" : (stryCov_9fa48("162451"), 'Package reference must contain "@" version separator'),
  NAMESPACE_EMPTY: stryMutAct_9fa48("162452") ? "" : (stryCov_9fa48("162452"), 'Namespace must not be empty'),
  NAMESPACE_INVALID_FORMAT: (stryMutAct_9fa48("162453") ? "" : (stryCov_9fa48("162453"), 'Namespace must start with a lowercase letter and contain')) + (stryMutAct_9fa48("162454") ? "" : (stryCov_9fa48("162454"), ' only lowercase alphanumeric characters and hyphens')) + (stryMutAct_9fa48("162455") ? `` : (stryCov_9fa48("162455"), ` (max ${PACKAGE_ID_MAX_LENGTH.NAMESPACE} chars)`)),
  NAME_EMPTY: stryMutAct_9fa48("162456") ? "" : (stryCov_9fa48("162456"), 'Name must not be empty'),
  NAME_INVALID_FORMAT: (stryMutAct_9fa48("162457") ? "" : (stryCov_9fa48("162457"), 'Name must start with a lowercase letter and contain')) + (stryMutAct_9fa48("162458") ? "" : (stryCov_9fa48("162458"), ' only lowercase alphanumeric characters and hyphens')) + (stryMutAct_9fa48("162459") ? `` : (stryCov_9fa48("162459"), ` (max ${PACKAGE_ID_MAX_LENGTH.NAME} chars)`)),
  VERSION_EMPTY: stryMutAct_9fa48("162460") ? "" : (stryCov_9fa48("162460"), 'Version must not be empty'),
  VERSION_INVALID_FORMAT: (stryMutAct_9fa48("162461") ? "" : (stryCov_9fa48("162461"), 'Version must start with a digit and contain')) + (stryMutAct_9fa48("162462") ? "" : (stryCov_9fa48("162462"), ' only alphanumeric characters, dots, hyphens, and plus')) + (stryMutAct_9fa48("162463") ? `` : (stryCov_9fa48("162463"), ` (max ${PACKAGE_ID_MAX_LENGTH.VERSION} chars)`))
}));

/**
 * Parse a package reference string into components.
 *
 * @param {string} ref - Package reference (namespace:name@version).
 * @return {{valid: boolean, namespace?: string, name?: string,
 *   version?: string, errors?: string[]}} Parse result.
 */
function parsePackageReference(ref) {
  if (stryMutAct_9fa48("162464")) {
    {}
  } else {
    stryCov_9fa48("162464");
    const errors = collectErrors(ref);
    if (stryMutAct_9fa48("162468") ? errors.length <= NUM.ZERO : stryMutAct_9fa48("162467") ? errors.length >= NUM.ZERO : stryMutAct_9fa48("162466") ? false : stryMutAct_9fa48("162465") ? true : (stryCov_9fa48("162465", "162466", "162467", "162468"), errors.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("162469")) {
        {}
      } else {
        stryCov_9fa48("162469");
        return stryMutAct_9fa48("162470") ? {} : (stryCov_9fa48("162470"), {
          valid: stryMutAct_9fa48("162471") ? true : (stryCov_9fa48("162471"), false),
          errors
        });
      }
    }
    const match = PACKAGE_ID_PATTERN.exec(ref);
    return stryMutAct_9fa48("162472") ? {} : (stryCov_9fa48("162472"), {
      valid: stryMutAct_9fa48("162473") ? false : (stryCov_9fa48("162473"), true),
      namespace: match[NUM.ONE],
      name: match[NUM.TWO],
      version: match[NUM.THREE]
    });
  }
}

/**
 * Format package components back to canonical reference string.
 *
 * @param {{namespace: string, name: string, version: string}} parts
 * @return {string} Canonical reference (namespace:name@version).
 */
function formatPackageReference(parts) {
  if (stryMutAct_9fa48("162474")) {
    {}
  } else {
    stryCov_9fa48("162474");
    return stryMutAct_9fa48("162475") ? parts.namespace + PACKAGE_ID_SEPARATOR + parts.name + PACKAGE_VERSION_SEPARATOR - parts.version : (stryCov_9fa48("162475"), (stryMutAct_9fa48("162476") ? parts.namespace + PACKAGE_ID_SEPARATOR + parts.name - PACKAGE_VERSION_SEPARATOR : (stryCov_9fa48("162476"), (stryMutAct_9fa48("162477") ? parts.namespace + PACKAGE_ID_SEPARATOR - parts.name : (stryCov_9fa48("162477"), (stryMutAct_9fa48("162478") ? parts.namespace - PACKAGE_ID_SEPARATOR : (stryCov_9fa48("162478"), parts.namespace + PACKAGE_ID_SEPARATOR)) + parts.name)) + PACKAGE_VERSION_SEPARATOR)) + parts.version);
  }
}

/**
 * Validate a package reference string without returning parsed
 * components.
 *
 * @param {string} ref - Package reference to validate.
 * @return {{valid: boolean, errors?: string[]}} Validation result.
 */
function validatePackageReference(ref) {
  if (stryMutAct_9fa48("162479")) {
    {}
  } else {
    stryCov_9fa48("162479");
    const errors = collectErrors(ref);
    if (stryMutAct_9fa48("162483") ? errors.length <= NUM.ZERO : stryMutAct_9fa48("162482") ? errors.length >= NUM.ZERO : stryMutAct_9fa48("162481") ? false : stryMutAct_9fa48("162480") ? true : (stryCov_9fa48("162480", "162481", "162482", "162483"), errors.length > NUM.ZERO)) {
      if (stryMutAct_9fa48("162484")) {
        {}
      } else {
        stryCov_9fa48("162484");
        return stryMutAct_9fa48("162485") ? {} : (stryCov_9fa48("162485"), {
          valid: stryMutAct_9fa48("162486") ? true : (stryCov_9fa48("162486"), false),
          errors
        });
      }
    }
    return stryMutAct_9fa48("162487") ? {} : (stryCov_9fa48("162487"), {
      valid: stryMutAct_9fa48("162488") ? false : (stryCov_9fa48("162488"), true)
    });
  }
}

/**
 * Collect all validation errors for a package reference.
 *
 * @param {*} ref - Input to validate.
 * @return {string[]} Array of error messages (empty if valid).
 */
function collectErrors(ref) {
  if (stryMutAct_9fa48("162489")) {
    {}
  } else {
    stryCov_9fa48("162489");
    const errors = stryMutAct_9fa48("162490") ? ["Stryker was here"] : (stryCov_9fa48("162490"), []);
    if (stryMutAct_9fa48("162493") ? (ref === undefined || ref === null) && ref === '' : stryMutAct_9fa48("162492") ? false : stryMutAct_9fa48("162491") ? true : (stryCov_9fa48("162491", "162492", "162493"), (stryMutAct_9fa48("162495") ? ref === undefined && ref === null : stryMutAct_9fa48("162494") ? false : (stryCov_9fa48("162494", "162495"), (stryMutAct_9fa48("162497") ? ref !== undefined : stryMutAct_9fa48("162496") ? false : (stryCov_9fa48("162496", "162497"), ref === undefined)) || (stryMutAct_9fa48("162499") ? ref !== null : stryMutAct_9fa48("162498") ? false : (stryCov_9fa48("162498", "162499"), ref === null)))) || (stryMutAct_9fa48("162501") ? ref !== '' : stryMutAct_9fa48("162500") ? false : (stryCov_9fa48("162500", "162501"), ref === (stryMutAct_9fa48("162502") ? "Stryker was here!" : (stryCov_9fa48("162502"), '')))))) {
      if (stryMutAct_9fa48("162503")) {
        {}
      } else {
        stryCov_9fa48("162503");
        errors.push(PKG_REF_ERROR.INPUT_REQUIRED);
        return errors;
      }
    }
    if (stryMutAct_9fa48("162506") ? typeof ref === 'string' : stryMutAct_9fa48("162505") ? false : stryMutAct_9fa48("162504") ? true : (stryCov_9fa48("162504", "162505", "162506"), typeof ref !== (stryMutAct_9fa48("162507") ? "" : (stryCov_9fa48("162507"), 'string')))) {
      if (stryMutAct_9fa48("162508")) {
        {}
      } else {
        stryCov_9fa48("162508");
        errors.push(PKG_REF_ERROR.INPUT_NOT_STRING);
        return errors;
      }
    }
    const colonIdx = ref.indexOf(PACKAGE_ID_SEPARATOR);
    if (stryMutAct_9fa48("162511") ? colonIdx !== NUM.NEGATIVE_ONE : stryMutAct_9fa48("162510") ? false : stryMutAct_9fa48("162509") ? true : (stryCov_9fa48("162509", "162510", "162511"), colonIdx === NUM.NEGATIVE_ONE)) {
      if (stryMutAct_9fa48("162512")) {
        {}
      } else {
        stryCov_9fa48("162512");
        errors.push(PKG_REF_ERROR.MISSING_NAMESPACE_SEPARATOR);
        return errors;
      }
    }
    const atIdx = ref.indexOf(PACKAGE_VERSION_SEPARATOR, colonIdx);
    if (stryMutAct_9fa48("162515") ? atIdx !== NUM.NEGATIVE_ONE : stryMutAct_9fa48("162514") ? false : stryMutAct_9fa48("162513") ? true : (stryCov_9fa48("162513", "162514", "162515"), atIdx === NUM.NEGATIVE_ONE)) {
      if (stryMutAct_9fa48("162516")) {
        {}
      } else {
        stryCov_9fa48("162516");
        errors.push(PKG_REF_ERROR.MISSING_VERSION_SEPARATOR);
        return errors;
      }
    }
    const namespace = stryMutAct_9fa48("162517") ? ref : (stryCov_9fa48("162517"), ref.slice(NUM.ZERO, colonIdx));
    const name = stryMutAct_9fa48("162518") ? ref : (stryCov_9fa48("162518"), ref.slice(stryMutAct_9fa48("162519") ? colonIdx - NUM.ONE : (stryCov_9fa48("162519"), colonIdx + NUM.ONE), atIdx));
    const version = stryMutAct_9fa48("162520") ? ref : (stryCov_9fa48("162520"), ref.slice(stryMutAct_9fa48("162521") ? atIdx - NUM.ONE : (stryCov_9fa48("162521"), atIdx + NUM.ONE)));
    validateNamespace(namespace, errors);
    validateName(name, errors);
    validateVersion(version, errors);
    return errors;
  }
}

/**
 * @param {string} ns - Namespace segment.
 * @param {string[]} errors - Accumulator.
 */
function validateNamespace(ns, errors) {
  if (stryMutAct_9fa48("162522")) {
    {}
  } else {
    stryCov_9fa48("162522");
    if (stryMutAct_9fa48("162525") ? false : stryMutAct_9fa48("162524") ? true : stryMutAct_9fa48("162523") ? ns : (stryCov_9fa48("162523", "162524", "162525"), !ns)) {
      if (stryMutAct_9fa48("162526")) {
        {}
      } else {
        stryCov_9fa48("162526");
        errors.push(PKG_REF_ERROR.NAMESPACE_EMPTY);
      }
    } else if (stryMutAct_9fa48("162529") ? false : stryMutAct_9fa48("162528") ? true : stryMutAct_9fa48("162527") ? NAMESPACE_PATTERN.test(ns) : (stryCov_9fa48("162527", "162528", "162529"), !NAMESPACE_PATTERN.test(ns))) {
      if (stryMutAct_9fa48("162530")) {
        {}
      } else {
        stryCov_9fa48("162530");
        errors.push(PKG_REF_ERROR.NAMESPACE_INVALID_FORMAT);
      }
    }
  }
}

/**
 * @param {string} name - Name segment.
 * @param {string[]} errors - Accumulator.
 */
function validateName(name, errors) {
  if (stryMutAct_9fa48("162531")) {
    {}
  } else {
    stryCov_9fa48("162531");
    if (stryMutAct_9fa48("162534") ? false : stryMutAct_9fa48("162533") ? true : stryMutAct_9fa48("162532") ? name : (stryCov_9fa48("162532", "162533", "162534"), !name)) {
      if (stryMutAct_9fa48("162535")) {
        {}
      } else {
        stryCov_9fa48("162535");
        errors.push(PKG_REF_ERROR.NAME_EMPTY);
      }
    } else if (stryMutAct_9fa48("162538") ? false : stryMutAct_9fa48("162537") ? true : stryMutAct_9fa48("162536") ? PACKAGE_NAME_PATTERN.test(name) : (stryCov_9fa48("162536", "162537", "162538"), !PACKAGE_NAME_PATTERN.test(name))) {
      if (stryMutAct_9fa48("162539")) {
        {}
      } else {
        stryCov_9fa48("162539");
        errors.push(PKG_REF_ERROR.NAME_INVALID_FORMAT);
      }
    }
  }
}

/**
 * @param {string} ver - Version segment.
 * @param {string[]} errors - Accumulator.
 */
function validateVersion(ver, errors) {
  if (stryMutAct_9fa48("162540")) {
    {}
  } else {
    stryCov_9fa48("162540");
    if (stryMutAct_9fa48("162543") ? false : stryMutAct_9fa48("162542") ? true : stryMutAct_9fa48("162541") ? ver : (stryCov_9fa48("162541", "162542", "162543"), !ver)) {
      if (stryMutAct_9fa48("162544")) {
        {}
      } else {
        stryCov_9fa48("162544");
        errors.push(PKG_REF_ERROR.VERSION_EMPTY);
      }
    } else if (stryMutAct_9fa48("162547") ? false : stryMutAct_9fa48("162546") ? true : stryMutAct_9fa48("162545") ? VERSION_PATTERN.test(ver) : (stryCov_9fa48("162545", "162546", "162547"), !VERSION_PATTERN.test(ver))) {
      if (stryMutAct_9fa48("162548")) {
        {}
      } else {
        stryCov_9fa48("162548");
        errors.push(PKG_REF_ERROR.VERSION_INVALID_FORMAT);
      }
    }
  }
}
export { parsePackageReference, formatPackageReference, validatePackageReference, PKG_REF_ERROR, VERSION_PATTERN };