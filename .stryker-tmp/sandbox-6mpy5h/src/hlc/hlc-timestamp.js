/**
 * HLC Timestamp - Hybrid Logical Clock timestamp implementation.
 * Provides globally ordered timestamps for distributed operations.
 * Requirements: 23.7, 23.8
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
import { TYPEOF } from '../constants/index.js';
import { HLC_ERROR_MSG, HLC_PART, HLC_SEPARATOR } from './hlc-constants.js';

/**
 * HLCTimestamp represents a hybrid logical clock timestamp.
 * Combines physical time with a logical counter for global ordering.
 */
class HLCTimestamp {
  /**
   * Create a new HLCTimestamp.
   * @param {number} physical - Unix timestamp in milliseconds.
   * @param {number} logical - Logical counter (0-65535).
   * @param {string} nodeId - Node ID for tie-breaking.
   */
  constructor(physical, logical, nodeId) {
    if (stryMutAct_9fa48("79965")) {
      {}
    } else {
      stryCov_9fa48("79965");
      this.physical = physical;
      this.logical = logical;
      this.nodeId = nodeId;
    }
  }

  /**
   * Convert timestamp to string representation.
   * @return {string} String representation of the timestamp.
   */
  toString() {
    if (stryMutAct_9fa48("79966")) {
      {}
    } else {
      stryCov_9fa48("79966");
      return (stryMutAct_9fa48("79967") ? `` : (stryCov_9fa48("79967"), `${this.physical}${HLC_SEPARATOR.FIELD}`)) + (stryMutAct_9fa48("79968") ? `` : (stryCov_9fa48("79968"), `${this.logical}${HLC_SEPARATOR.FIELD}${this.nodeId}`));
    }
  }

  /**
   * Parse a timestamp from string representation.
   * @param {string} str - String representation of timestamp.
   * @return {HLCTimestamp} Parsed timestamp.
   */
  static fromString(str) {
    if (stryMutAct_9fa48("79969")) {
      {}
    } else {
      stryCov_9fa48("79969");
      if (stryMutAct_9fa48("79972") ? typeof str === TYPEOF.STRING : stryMutAct_9fa48("79971") ? false : stryMutAct_9fa48("79970") ? true : (stryCov_9fa48("79970", "79971", "79972"), typeof str !== TYPEOF.STRING)) {
        if (stryMutAct_9fa48("79973")) {
          {}
        } else {
          stryCov_9fa48("79973");
          throw new Error(stryMutAct_9fa48("79974") ? `` : (stryCov_9fa48("79974"), `${HLC_ERROR_MSG.NOT_STRING_PREFIX}${typeof str}`));
        }
      }
      const parts = str.split(HLC_SEPARATOR.FIELD);
      if (stryMutAct_9fa48("79978") ? parts.length >= HLC_PART.MIN_COUNT : stryMutAct_9fa48("79977") ? parts.length <= HLC_PART.MIN_COUNT : stryMutAct_9fa48("79976") ? false : stryMutAct_9fa48("79975") ? true : (stryCov_9fa48("79975", "79976", "79977", "79978"), parts.length < HLC_PART.MIN_COUNT)) {
        if (stryMutAct_9fa48("79979")) {
          {}
        } else {
          stryCov_9fa48("79979");
          throw new Error(stryMutAct_9fa48("79980") ? `` : (stryCov_9fa48("79980"), `${HLC_ERROR_MSG.INVALID_STRING_PREFIX}${str}`));
        }
      }
      // Node ID may contain dashes, so join remaining parts
      const physical = parseInt(parts[0], HLC_PART.PARSE_RADIX);
      const logical = parseInt(parts[1], HLC_PART.PARSE_RADIX);
      const nodeId = stryMutAct_9fa48("79981") ? parts.join(HLC_SEPARATOR.FIELD) : (stryCov_9fa48("79981"), parts.slice(HLC_PART.NODE_ID_INDEX).join(HLC_SEPARATOR.FIELD));
      if (stryMutAct_9fa48("79984") ? isNaN(physical) && isNaN(logical) : stryMutAct_9fa48("79983") ? false : stryMutAct_9fa48("79982") ? true : (stryCov_9fa48("79982", "79983", "79984"), isNaN(physical) || isNaN(logical))) {
        if (stryMutAct_9fa48("79985")) {
          {}
        } else {
          stryCov_9fa48("79985");
          throw new Error(stryMutAct_9fa48("79986") ? `` : (stryCov_9fa48("79986"), `${HLC_ERROR_MSG.INVALID_STRING_PREFIX}${str}`));
        }
      }
      return new HLCTimestamp(physical, logical, nodeId);
    }
  }

  /**
   * Compare this timestamp with another.
   * @param {HLCTimestamp} other - The other timestamp.
   * @return {number} Negative if this < other, positive if this > other, 0 if equal.
   */
  compare(other) {
    if (stryMutAct_9fa48("79987")) {
      {}
    } else {
      stryCov_9fa48("79987");
      if (stryMutAct_9fa48("79990") ? this.physical === other.physical : stryMutAct_9fa48("79989") ? false : stryMutAct_9fa48("79988") ? true : (stryCov_9fa48("79988", "79989", "79990"), this.physical !== other.physical)) {
        if (stryMutAct_9fa48("79991")) {
          {}
        } else {
          stryCov_9fa48("79991");
          return stryMutAct_9fa48("79992") ? this.physical + other.physical : (stryCov_9fa48("79992"), this.physical - other.physical);
        }
      }
      if (stryMutAct_9fa48("79995") ? this.logical === other.logical : stryMutAct_9fa48("79994") ? false : stryMutAct_9fa48("79993") ? true : (stryCov_9fa48("79993", "79994", "79995"), this.logical !== other.logical)) {
        if (stryMutAct_9fa48("79996")) {
          {}
        } else {
          stryCov_9fa48("79996");
          return stryMutAct_9fa48("79997") ? this.logical + other.logical : (stryCov_9fa48("79997"), this.logical - other.logical);
        }
      }
      return this.nodeId.localeCompare(other.nodeId);
    }
  }

  /**
   * Check if this timestamp is before another.
   * @param {HLCTimestamp} other - The other timestamp.
   * @return {boolean} True if this timestamp is before the other.
   */
  isBefore(other) {
    if (stryMutAct_9fa48("79998")) {
      {}
    } else {
      stryCov_9fa48("79998");
      return stryMutAct_9fa48("80002") ? this.compare(other) >= 0 : stryMutAct_9fa48("80001") ? this.compare(other) <= 0 : stryMutAct_9fa48("80000") ? false : stryMutAct_9fa48("79999") ? true : (stryCov_9fa48("79999", "80000", "80001", "80002"), this.compare(other) < 0);
    }
  }

  /**
   * Check if this timestamp is after another.
   * @param {HLCTimestamp} other - The other timestamp.
   * @return {boolean} True if this timestamp is after the other.
   */
  isAfter(other) {
    if (stryMutAct_9fa48("80003")) {
      {}
    } else {
      stryCov_9fa48("80003");
      return stryMutAct_9fa48("80007") ? this.compare(other) <= 0 : stryMutAct_9fa48("80006") ? this.compare(other) >= 0 : stryMutAct_9fa48("80005") ? false : stryMutAct_9fa48("80004") ? true : (stryCov_9fa48("80004", "80005", "80006", "80007"), this.compare(other) > 0);
    }
  }

  /**
   * Check if this timestamp equals another.
   * @param {HLCTimestamp} other - The other timestamp.
   * @return {boolean} True if timestamps are equal.
   */
  equals(other) {
    if (stryMutAct_9fa48("80008")) {
      {}
    } else {
      stryCov_9fa48("80008");
      return stryMutAct_9fa48("80011") ? this.compare(other) !== 0 : stryMutAct_9fa48("80010") ? false : stryMutAct_9fa48("80009") ? true : (stryCov_9fa48("80009", "80010", "80011"), this.compare(other) === 0);
    }
  }

  /**
   * Create a copy of this timestamp.
   * @return {HLCTimestamp} A new timestamp with the same values.
   */
  clone() {
    if (stryMutAct_9fa48("80012")) {
      {}
    } else {
      stryCov_9fa48("80012");
      return new HLCTimestamp(this.physical, this.logical, this.nodeId);
    }
  }
}
export { HLCTimestamp };