/**
 * Endpoint sync naming utilities.
 *
 * Deterministic name generation for Kubernetes resources based
 * on logical service identity.
 *
 * @module runtime/endpoint-sync-naming
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
import crypto from 'node:crypto';
import { TYPEOF } from '../constants/index.js';
import { ENDPOINT_SYNC_LIST_SEPARATOR, ENDPOINT_SYNC_NAME, ENDPOINT_SYNC_REGEX } from './endpoint-sync-constants.js';

/**
 * Normalize an input segment into DNS-1123 label-safe text.
 *
 * @param {*} input - Segment input.
 * @return {string} Normalized segment.
 */
function normalizeDns1123Segment(input) {
  if (stryMutAct_9fa48("145994")) {
    {}
  } else {
    stryCov_9fa48("145994");
    if (stryMutAct_9fa48("145997") ? typeof input === TYPEOF.STRING : stryMutAct_9fa48("145996") ? false : stryMutAct_9fa48("145995") ? true : (stryCov_9fa48("145995", "145996", "145997"), typeof input !== TYPEOF.STRING)) {
      if (stryMutAct_9fa48("145998")) {
        {}
      } else {
        stryCov_9fa48("145998");
        return ENDPOINT_SYNC_NAME.FALLBACK_SEGMENT;
      }
    }
    const normalized = stryMutAct_9fa48("146000") ? input.toLowerCase().replace(ENDPOINT_SYNC_REGEX.DNS1123_INVALID, ENDPOINT_SYNC_NAME.CONCAT_SEPARATOR).replace(ENDPOINT_SYNC_REGEX.DASH_DUPLICATE, ENDPOINT_SYNC_NAME.CONCAT_SEPARATOR).replace(ENDPOINT_SYNC_REGEX.EDGE_DASH, '') : stryMutAct_9fa48("145999") ? input.trim().toUpperCase().replace(ENDPOINT_SYNC_REGEX.DNS1123_INVALID, ENDPOINT_SYNC_NAME.CONCAT_SEPARATOR).replace(ENDPOINT_SYNC_REGEX.DASH_DUPLICATE, ENDPOINT_SYNC_NAME.CONCAT_SEPARATOR).replace(ENDPOINT_SYNC_REGEX.EDGE_DASH, '') : (stryCov_9fa48("145999", "146000"), input.trim().toLowerCase().replace(ENDPOINT_SYNC_REGEX.DNS1123_INVALID, ENDPOINT_SYNC_NAME.CONCAT_SEPARATOR).replace(ENDPOINT_SYNC_REGEX.DASH_DUPLICATE, ENDPOINT_SYNC_NAME.CONCAT_SEPARATOR).replace(ENDPOINT_SYNC_REGEX.EDGE_DASH, stryMutAct_9fa48("146001") ? "Stryker was here!" : (stryCov_9fa48("146001"), '')));
    if (stryMutAct_9fa48("146004") ? normalized.length !== 0 : stryMutAct_9fa48("146003") ? false : stryMutAct_9fa48("146002") ? true : (stryCov_9fa48("146002", "146003", "146004"), normalized.length === 0)) {
      if (stryMutAct_9fa48("146005")) {
        {}
      } else {
        stryCov_9fa48("146005");
        return ENDPOINT_SYNC_NAME.FALLBACK_SEGMENT;
      }
    }
    return normalized;
  }
}

/**
 * Apply deterministic truncation with hash suffix for DNS-1123 labels.
 *
 * @param {string} name - Candidate DNS-1123 label.
 * @return {string} Name within 63-character limit.
 */
function truncateDns1123WithHash(name) {
  if (stryMutAct_9fa48("146006")) {
    {}
  } else {
    stryCov_9fa48("146006");
    if (stryMutAct_9fa48("146010") ? name.length > ENDPOINT_SYNC_NAME.DNS1123_MAX_LENGTH : stryMutAct_9fa48("146009") ? name.length < ENDPOINT_SYNC_NAME.DNS1123_MAX_LENGTH : stryMutAct_9fa48("146008") ? false : stryMutAct_9fa48("146007") ? true : (stryCov_9fa48("146007", "146008", "146009", "146010"), name.length <= ENDPOINT_SYNC_NAME.DNS1123_MAX_LENGTH)) {
      if (stryMutAct_9fa48("146011")) {
        {}
      } else {
        stryCov_9fa48("146011");
        return name;
      }
    }
    const hash = stryMutAct_9fa48("146012") ? crypto.createHash('sha1').update(name).digest('hex') : (stryCov_9fa48("146012"), crypto.createHash(stryMutAct_9fa48("146013") ? "" : (stryCov_9fa48("146013"), 'sha1')).update(name).digest(stryMutAct_9fa48("146014") ? "" : (stryCov_9fa48("146014"), 'hex')).slice(0, ENDPOINT_SYNC_NAME.HASH_LENGTH));
    const maxPrefixLen = stryMutAct_9fa48("146015") ? ENDPOINT_SYNC_NAME.DNS1123_MAX_LENGTH - ENDPOINT_SYNC_NAME.HASH_LENGTH + ENDPOINT_SYNC_NAME.CONCAT_SEPARATOR.length : (stryCov_9fa48("146015"), (stryMutAct_9fa48("146016") ? ENDPOINT_SYNC_NAME.DNS1123_MAX_LENGTH + ENDPOINT_SYNC_NAME.HASH_LENGTH : (stryCov_9fa48("146016"), ENDPOINT_SYNC_NAME.DNS1123_MAX_LENGTH - ENDPOINT_SYNC_NAME.HASH_LENGTH)) - ENDPOINT_SYNC_NAME.CONCAT_SEPARATOR.length);
    const prefix = stryMutAct_9fa48("146017") ? name.replace(ENDPOINT_SYNC_REGEX.EDGE_DASH, '') : (stryCov_9fa48("146017"), name.slice(0, maxPrefixLen).replace(ENDPOINT_SYNC_REGEX.EDGE_DASH, stryMutAct_9fa48("146018") ? "Stryker was here!" : (stryCov_9fa48("146018"), '')));
    const safePrefix = (stryMutAct_9fa48("146022") ? prefix.length <= 0 : stryMutAct_9fa48("146021") ? prefix.length >= 0 : stryMutAct_9fa48("146020") ? false : stryMutAct_9fa48("146019") ? true : (stryCov_9fa48("146019", "146020", "146021", "146022"), prefix.length > 0)) ? prefix : ENDPOINT_SYNC_NAME.FALLBACK_SEGMENT;
    return stryMutAct_9fa48("146023") ? `` : (stryCov_9fa48("146023"), `${safePrefix}${ENDPOINT_SYNC_NAME.CONCAT_SEPARATOR}${hash}`);
  }
}

/**
 * Build deterministic service key.
 *
 * @param {string} logicalServiceName - Logical service name.
 * @param {string} protocol - Protocol identifier.
 * @return {string}
 */
function buildServiceKey(logicalServiceName, protocol) {
  if (stryMutAct_9fa48("146024")) {
    {}
  } else {
    stryCov_9fa48("146024");
    const serviceSegment = normalizeDns1123Segment(logicalServiceName);
    const protocolSegment = normalizeDns1123Segment(protocol);
    return stryMutAct_9fa48("146025") ? serviceSegment + ENDPOINT_SYNC_LIST_SEPARATOR.SERVICE_KEY - protocolSegment : (stryCov_9fa48("146025"), (stryMutAct_9fa48("146026") ? serviceSegment - ENDPOINT_SYNC_LIST_SEPARATOR.SERVICE_KEY : (stryCov_9fa48("146026"), serviceSegment + ENDPOINT_SYNC_LIST_SEPARATOR.SERVICE_KEY)) + protocolSegment);
  }
}

/**
 * Build deterministic Kubernetes Service name.
 *
 * @param {string} prefix - Configured service name prefix.
 * @param {string} logicalServiceName - Logical service name.
 * @param {string} protocol - Protocol identifier.
 * @return {string} DNS-1123 compliant service name.
 */
function buildKubernetesServiceName(prefix, logicalServiceName, protocol) {
  if (stryMutAct_9fa48("146027")) {
    {}
  } else {
    stryCov_9fa48("146027");
    const prefixSegment = normalizeDns1123Segment(prefix);
    const serviceSegment = normalizeDns1123Segment(logicalServiceName);
    const protocolSegment = normalizeDns1123Segment(protocol);
    const candidate = (stryMutAct_9fa48("146028") ? [] : (stryCov_9fa48("146028"), [prefixSegment, serviceSegment, protocolSegment])).join(ENDPOINT_SYNC_NAME.CONCAT_SEPARATOR);
    return truncateDns1123WithHash(candidate);
  }
}

/**
 * Build deterministic EndpointSlice name.
 *
 * @param {string} serviceName - Reconciled Service name.
 * @param {number} sliceIndex - Zero-based slice index.
 * @return {string}
 */
function buildEndpointSliceName(serviceName, sliceIndex) {
  if (stryMutAct_9fa48("146029")) {
    {}
  } else {
    stryCov_9fa48("146029");
    const safeServiceName = normalizeDns1123Segment(serviceName);
    const safeIndex = (stryMutAct_9fa48("146032") ? Number.isInteger(sliceIndex) || sliceIndex >= 0 : stryMutAct_9fa48("146031") ? false : stryMutAct_9fa48("146030") ? true : (stryCov_9fa48("146030", "146031", "146032"), Number.isInteger(sliceIndex) && (stryMutAct_9fa48("146035") ? sliceIndex < 0 : stryMutAct_9fa48("146034") ? sliceIndex > 0 : stryMutAct_9fa48("146033") ? true : (stryCov_9fa48("146033", "146034", "146035"), sliceIndex >= 0)))) ? sliceIndex : 0;
    return truncateDns1123WithHash(stryMutAct_9fa48("146036") ? `` : (stryCov_9fa48("146036"), `${safeServiceName}${ENDPOINT_SYNC_NAME.CONCAT_SEPARATOR}${safeIndex}`));
  }
}
export { normalizeDns1123Segment, truncateDns1123WithHash, buildServiceKey, buildKubernetesServiceName, buildEndpointSliceName };