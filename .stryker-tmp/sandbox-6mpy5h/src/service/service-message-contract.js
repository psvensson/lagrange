/**
 * Canonical service-message envelope validation.
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
import { SERVICE_MESSAGE_FIELD, SERVICE_MESSAGE_REQUIRED_FIELDS } from '../constants/unified-service-lifecycle.js';
import { InvalidServiceMessageError } from './service-lifecycle-errors.js';

/**
 * Validate canonical service message envelope shape.
 *
 * @param {Object} envelope
 * @return {{valid: boolean, errors: string[]}}
 */
function validateServiceMessageEnvelope(envelope) {
  if (stryMutAct_9fa48("151024")) {
    {}
  } else {
    stryCov_9fa48("151024");
    const errors = stryMutAct_9fa48("151025") ? ["Stryker was here"] : (stryCov_9fa48("151025"), []);
    if (stryMutAct_9fa48("151028") ? !envelope && typeof envelope !== TYPEOF.OBJECT : stryMutAct_9fa48("151027") ? false : stryMutAct_9fa48("151026") ? true : (stryCov_9fa48("151026", "151027", "151028"), (stryMutAct_9fa48("151029") ? envelope : (stryCov_9fa48("151029"), !envelope)) || (stryMutAct_9fa48("151031") ? typeof envelope === TYPEOF.OBJECT : stryMutAct_9fa48("151030") ? false : (stryCov_9fa48("151030", "151031"), typeof envelope !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("151032")) {
        {}
      } else {
        stryCov_9fa48("151032");
        return stryMutAct_9fa48("151033") ? {} : (stryCov_9fa48("151033"), {
          valid: stryMutAct_9fa48("151034") ? true : (stryCov_9fa48("151034"), false),
          errors: stryMutAct_9fa48("151035") ? [] : (stryCov_9fa48("151035"), [stryMutAct_9fa48("151036") ? "" : (stryCov_9fa48("151036"), 'envelope must be an object')])
        });
      }
    }
    for (const fieldName of SERVICE_MESSAGE_REQUIRED_FIELDS) {
      if (stryMutAct_9fa48("151037")) {
        {}
      } else {
        stryCov_9fa48("151037");
        if (stryMutAct_9fa48("151040") ? false : stryMutAct_9fa48("151039") ? true : stryMutAct_9fa48("151038") ? fieldName in envelope : (stryCov_9fa48("151038", "151039", "151040"), !(fieldName in envelope))) {
          if (stryMutAct_9fa48("151041")) {
            {}
          } else {
            stryCov_9fa48("151041");
            errors.push(stryMutAct_9fa48("151042") ? `` : (stryCov_9fa48("151042"), `missing required field '${fieldName}'`));
          }
        }
      }
    }
    if (stryMutAct_9fa48("151045") ? envelope[SERVICE_MESSAGE_FIELD.MESSAGE_ID] !== undefined || typeof envelope[SERVICE_MESSAGE_FIELD.MESSAGE_ID] !== TYPEOF.STRING : stryMutAct_9fa48("151044") ? false : stryMutAct_9fa48("151043") ? true : (stryCov_9fa48("151043", "151044", "151045"), (stryMutAct_9fa48("151047") ? envelope[SERVICE_MESSAGE_FIELD.MESSAGE_ID] === undefined : stryMutAct_9fa48("151046") ? true : (stryCov_9fa48("151046", "151047"), envelope[SERVICE_MESSAGE_FIELD.MESSAGE_ID] !== undefined)) && (stryMutAct_9fa48("151049") ? typeof envelope[SERVICE_MESSAGE_FIELD.MESSAGE_ID] === TYPEOF.STRING : stryMutAct_9fa48("151048") ? true : (stryCov_9fa48("151048", "151049"), typeof envelope[SERVICE_MESSAGE_FIELD.MESSAGE_ID] !== TYPEOF.STRING)))) {
      if (stryMutAct_9fa48("151050")) {
        {}
      } else {
        stryCov_9fa48("151050");
        errors.push(stryMutAct_9fa48("151051") ? `` : (stryCov_9fa48("151051"), `field '${SERVICE_MESSAGE_FIELD.MESSAGE_ID}' must be a string`));
      }
    }
    if (stryMutAct_9fa48("151054") ? envelope[SERVICE_MESSAGE_FIELD.SERVICE_ID] !== undefined || typeof envelope[SERVICE_MESSAGE_FIELD.SERVICE_ID] !== TYPEOF.STRING : stryMutAct_9fa48("151053") ? false : stryMutAct_9fa48("151052") ? true : (stryCov_9fa48("151052", "151053", "151054"), (stryMutAct_9fa48("151056") ? envelope[SERVICE_MESSAGE_FIELD.SERVICE_ID] === undefined : stryMutAct_9fa48("151055") ? true : (stryCov_9fa48("151055", "151056"), envelope[SERVICE_MESSAGE_FIELD.SERVICE_ID] !== undefined)) && (stryMutAct_9fa48("151058") ? typeof envelope[SERVICE_MESSAGE_FIELD.SERVICE_ID] === TYPEOF.STRING : stryMutAct_9fa48("151057") ? true : (stryCov_9fa48("151057", "151058"), typeof envelope[SERVICE_MESSAGE_FIELD.SERVICE_ID] !== TYPEOF.STRING)))) {
      if (stryMutAct_9fa48("151059")) {
        {}
      } else {
        stryCov_9fa48("151059");
        errors.push(stryMutAct_9fa48("151060") ? `` : (stryCov_9fa48("151060"), `field '${SERVICE_MESSAGE_FIELD.SERVICE_ID}' must be a string`));
      }
    }
    if (stryMutAct_9fa48("151063") ? envelope[SERVICE_MESSAGE_FIELD.OPERATION] !== undefined || typeof envelope[SERVICE_MESSAGE_FIELD.OPERATION] !== TYPEOF.STRING : stryMutAct_9fa48("151062") ? false : stryMutAct_9fa48("151061") ? true : (stryCov_9fa48("151061", "151062", "151063"), (stryMutAct_9fa48("151065") ? envelope[SERVICE_MESSAGE_FIELD.OPERATION] === undefined : stryMutAct_9fa48("151064") ? true : (stryCov_9fa48("151064", "151065"), envelope[SERVICE_MESSAGE_FIELD.OPERATION] !== undefined)) && (stryMutAct_9fa48("151067") ? typeof envelope[SERVICE_MESSAGE_FIELD.OPERATION] === TYPEOF.STRING : stryMutAct_9fa48("151066") ? true : (stryCov_9fa48("151066", "151067"), typeof envelope[SERVICE_MESSAGE_FIELD.OPERATION] !== TYPEOF.STRING)))) {
      if (stryMutAct_9fa48("151068")) {
        {}
      } else {
        stryCov_9fa48("151068");
        errors.push(stryMutAct_9fa48("151069") ? `` : (stryCov_9fa48("151069"), `field '${SERVICE_MESSAGE_FIELD.OPERATION}' must be a string`));
      }
    }
    return stryMutAct_9fa48("151070") ? {} : (stryCov_9fa48("151070"), {
      valid: stryMutAct_9fa48("151073") ? errors.length !== 0 : stryMutAct_9fa48("151072") ? false : stryMutAct_9fa48("151071") ? true : (stryCov_9fa48("151071", "151072", "151073"), errors.length === 0),
      errors
    });
  }
}

/**
 * Assert canonical envelope validity and throw a typed error on failure.
 *
 * @param {Object} envelope
 * @return {Object}
 */
function assertServiceMessageEnvelope(envelope) {
  if (stryMutAct_9fa48("151074")) {
    {}
  } else {
    stryCov_9fa48("151074");
    const validation = validateServiceMessageEnvelope(envelope);
    if (stryMutAct_9fa48("151077") ? false : stryMutAct_9fa48("151076") ? true : stryMutAct_9fa48("151075") ? validation.valid : (stryCov_9fa48("151075", "151076", "151077"), !validation.valid)) {
      if (stryMutAct_9fa48("151078")) {
        {}
      } else {
        stryCov_9fa48("151078");
        throw new InvalidServiceMessageError(validation.errors.join(stryMutAct_9fa48("151079") ? "" : (stryCov_9fa48("151079"), '; ')), stryMutAct_9fa48("151080") ? {} : (stryCov_9fa48("151080"), {
          errors: validation.errors
        }));
      }
    }
    return envelope;
  }
}
export { validateServiceMessageEnvelope, assertServiceMessageEnvelope };