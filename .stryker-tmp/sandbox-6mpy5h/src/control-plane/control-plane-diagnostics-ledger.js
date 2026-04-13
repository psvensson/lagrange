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
function freezeValue(value) {
  if (stryMutAct_9fa48("57384")) {
    {}
  } else {
    stryCov_9fa48("57384");
    if (stryMutAct_9fa48("57386") ? false : stryMutAct_9fa48("57385") ? true : (stryCov_9fa48("57385", "57386"), Array.isArray(value))) {
      if (stryMutAct_9fa48("57387")) {
        {}
      } else {
        stryCov_9fa48("57387");
        return Object.freeze(value.map(stryMutAct_9fa48("57388") ? () => undefined : (stryCov_9fa48("57388"), entry => freezeValue(entry))));
      }
    }
    if (stryMutAct_9fa48("57391") ? value || typeof value === TYPEOF.OBJECT : stryMutAct_9fa48("57390") ? false : stryMutAct_9fa48("57389") ? true : (stryCov_9fa48("57389", "57390", "57391"), value && (stryMutAct_9fa48("57393") ? typeof value !== TYPEOF.OBJECT : stryMutAct_9fa48("57392") ? true : (stryCov_9fa48("57392", "57393"), typeof value === TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("57394")) {
        {}
      } else {
        stryCov_9fa48("57394");
        const frozen = {};
        for (const [key, entry] of Object.entries(value)) {
          if (stryMutAct_9fa48("57395")) {
            {}
          } else {
            stryCov_9fa48("57395");
            frozen[key] = freezeValue(entry);
          }
        }
        return Object.freeze(frozen);
      }
    }
    return value;
  }
}
class ControlPlaneDiagnosticsLedger {
  /**
   * @param {Object} [options={}]
   * @param {number} [options.maxEntries=128]
   * @param {Function} [options.now]
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("57396")) {
      {}
    } else {
      stryCov_9fa48("57396");
      this.maxEntries = (stryMutAct_9fa48("57399") ? Number.isInteger(options.maxEntries) || options.maxEntries > NUM.ZERO : stryMutAct_9fa48("57398") ? false : stryMutAct_9fa48("57397") ? true : (stryCov_9fa48("57397", "57398", "57399"), Number.isInteger(options.maxEntries) && (stryMutAct_9fa48("57402") ? options.maxEntries <= NUM.ZERO : stryMutAct_9fa48("57401") ? options.maxEntries >= NUM.ZERO : stryMutAct_9fa48("57400") ? true : (stryCov_9fa48("57400", "57401", "57402"), options.maxEntries > NUM.ZERO)))) ? options.maxEntries : 128;
      this.now = (stryMutAct_9fa48("57405") ? typeof options.now !== TYPEOF.FUNCTION : stryMutAct_9fa48("57404") ? false : stryMutAct_9fa48("57403") ? true : (stryCov_9fa48("57403", "57404", "57405"), typeof options.now === TYPEOF.FUNCTION)) ? options.now : stryMutAct_9fa48("57406") ? () => undefined : (stryCov_9fa48("57406"), () => Date.now());
      this.nextSequence = NUM.ONE;
      this.entries = stryMutAct_9fa48("57407") ? ["Stryker was here"] : (stryCov_9fa48("57407"), []);
    }
  }

  /**
   * @param {Object} entry
   * @return {Object}
   */
  append(entry = {}) {
    if (stryMutAct_9fa48("57408")) {
      {}
    } else {
      stryCov_9fa48("57408");
      const recordedAtMs = this.now();
      const normalized = freezeValue(stryMutAct_9fa48("57409") ? {} : (stryCov_9fa48("57409"), {
        sequence: this.nextSequence,
        recordedAtMs,
        recordedAt: new Date(recordedAtMs).toISOString(),
        ...entry
      }));
      stryMutAct_9fa48("57410") ? this.nextSequence -= NUM.ONE : (stryCov_9fa48("57410"), this.nextSequence += NUM.ONE);
      this.entries.push(normalized);
      if (stryMutAct_9fa48("57414") ? this.entries.length <= this.maxEntries : stryMutAct_9fa48("57413") ? this.entries.length >= this.maxEntries : stryMutAct_9fa48("57412") ? false : stryMutAct_9fa48("57411") ? true : (stryCov_9fa48("57411", "57412", "57413", "57414"), this.entries.length > this.maxEntries)) {
        if (stryMutAct_9fa48("57415")) {
          {}
        } else {
          stryCov_9fa48("57415");
          this.entries = stryMutAct_9fa48("57416") ? this.entries : (stryCov_9fa48("57416"), this.entries.slice(stryMutAct_9fa48("57417") ? this.entries.length + this.maxEntries : (stryCov_9fa48("57417"), this.entries.length - this.maxEntries)));
        }
      }
      return normalized;
    }
  }

  /**
   * @param {Object} [options={}]
   * @param {number} [options.limit]
   * @return {Object[]}
   */
  getEntries(options = {}) {
    if (stryMutAct_9fa48("57418")) {
      {}
    } else {
      stryCov_9fa48("57418");
      const limit = (stryMutAct_9fa48("57421") ? Number.isInteger(options.limit) || options.limit > NUM.ZERO : stryMutAct_9fa48("57420") ? false : stryMutAct_9fa48("57419") ? true : (stryCov_9fa48("57419", "57420", "57421"), Number.isInteger(options.limit) && (stryMutAct_9fa48("57424") ? options.limit <= NUM.ZERO : stryMutAct_9fa48("57423") ? options.limit >= NUM.ZERO : stryMutAct_9fa48("57422") ? true : (stryCov_9fa48("57422", "57423", "57424"), options.limit > NUM.ZERO)))) ? options.limit : null;
      const entries = (stryMutAct_9fa48("57427") ? limit !== null : stryMutAct_9fa48("57426") ? false : stryMutAct_9fa48("57425") ? true : (stryCov_9fa48("57425", "57426", "57427"), limit === null)) ? this.entries : stryMutAct_9fa48("57428") ? this.entries : (stryCov_9fa48("57428"), this.entries.slice(stryMutAct_9fa48("57429") ? Math.min(NUM.ZERO, this.entries.length - limit) : (stryCov_9fa48("57429"), Math.max(NUM.ZERO, stryMutAct_9fa48("57430") ? this.entries.length + limit : (stryCov_9fa48("57430"), this.entries.length - limit)))));
      return Object.freeze(entries.map(stryMutAct_9fa48("57431") ? () => undefined : (stryCov_9fa48("57431"), entry => entry)));
    }
  }

  /**
   * @return {number}
   */
  getSize() {
    if (stryMutAct_9fa48("57432")) {
      {}
    } else {
      stryCov_9fa48("57432");
      return this.entries.length;
    }
  }
}
export { ControlPlaneDiagnosticsLedger };